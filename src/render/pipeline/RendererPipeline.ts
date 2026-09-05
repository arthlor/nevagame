import * as THREE from "three";
import type { CoastalUniforms } from "../water/CoastalOptics";
import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import type { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../config/VisualRenderConfig";
import { GpuFrameTimer, type GpuFrameTimingSnapshot } from "./GpuFrameTimer";

export type CaptureRenderMode = "final" | "no-post";

export interface RenderTargetDiagnostic {
  id: string;
  width: number;
  height: number;
  format: number;
  type: number;
  internalFormat: string | null;
  samples: number;
  depthBuffer: boolean;
  stencilBuffer: boolean;
  estimatedBytes: number;
}

export interface RendererPipelineDiagnostics {
  renderMode: CaptureRenderMode;
  qualityTier: QualityTier;
  gtaoActive: boolean;
  gpuTiming: GpuFrameTimingSnapshot;
  renderTargets: readonly RenderTargetDiagnostic[];
  memory: {
    geometries: number;
    textures: number;
  };
}

interface GtaoPassRuntimeInternals {
  output: number;
  blendIntensity: number;
  pdRenderTarget: THREE.WebGLRenderTarget;
  copyMaterial: THREE.ShaderMaterial;
  blendMaterial: THREE.ShaderMaterial;
  renderToScreen: boolean;
  renderPass(
    renderer: THREE.WebGLRenderer,
    material: THREE.Material,
    target: THREE.WebGLRenderTarget | null
  ): void;
}

interface ComposerRuntimeInternals {
  renderTarget1: THREE.WebGLRenderTarget;
  renderTarget2: THREE.WebGLRenderTarget;
}

export function bindGtaoSceneDepth(pass: GTAOPass, source: THREE.WebGLRenderTarget): void {
  if (!source.depthTexture) throw new Error("GTAO requires the current scene depth texture");
  const normalModeChanged = pass.gtaoMaterial.defines.NORMAL_VECTOR_TYPE !== 0;
  pass.setGBuffer(source.depthTexture);
  pass.depthRenderMaterial.uniforms.tDepth.value = source.depthTexture;
  if (normalModeChanged) {
    pass.gtaoMaterial.needsUpdate = true;
    pass.pdMaterial.needsUpdate = true;
  }
}

export function renderTargetDiagnostic(id: string, target: THREE.WebGLRenderTarget): RenderTargetDiagnostic {
  const bytesPerPixel = target.texture.type === THREE.FloatType ? 16
    : target.texture.type === THREE.HalfFloatType ? 8
      : 4;
  const colorBytes = target.width * target.height * bytesPerPixel * Math.max(1, target.samples || 1);
  const depthStencilBytes = target.depthBuffer
    ? target.width * target.height * (target.depthTexture?.type === THREE.UnsignedShortType ? 2 : 4) * Math.max(1, target.samples || 1)
    : 0;
  return {
    id,
    width: target.width,
    height: target.height,
    format: target.texture.format,
    type: target.texture.type,
    internalFormat: target.texture.internalFormat ?? null,
    samples: target.samples,
    depthBuffer: target.depthBuffer,
    stencilBuffer: target.stencilBuffer,
    estimatedBytes: colorBytes + depthStencilBytes
  };
}

/**
 * The only post-processing path. It lazy-loads GTAO on the high tier and
 * renders directly on lower tiers, keeping expensive contact effects out of
 * low-spec sessions and the starter bundle.
 */
export class RendererPipeline {
  private composer: EffectComposer | null = null;
  private opaqueSnapshot: THREE.WebGLRenderTarget | null = null;
  private coastalUniforms: CoastalUniforms | null = null;
  private capturedWaterThisFrame = false;
  private gtaoPass: GTAOPass | null = null;
  private activeCamera: THREE.Camera | null = null;
  private initialization: Promise<void> | null = null;
  private generation = 0;
  private width = 1;
  private height = 1;
  private qualityTier: QualityTier;
  private gtaoRefreshThisFrame = true;
  private gtaoHasReusableFrame = false;
  private gtaoFramesSinceRefresh = 0;
  private gtaoBlendScale = 1;
  private readonly lastGtaoCameraPosition = new THREE.Vector3();
  private readonly lastGtaoCameraQuaternion = new THREE.Quaternion();
  private hasGtaoCameraSample = false;
  private renderMode: CaptureRenderMode = "final";
  private readonly gpuTimer: GpuFrameTimer | null;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    initialQuality: QualityTier
  ) {
    this.qualityTier = initialQuality;
    this.renderer.info.autoReset = false;
    const context = this.renderer.getContext();
    this.gpuTimer = "createQuery" in context
      ? new GpuFrameTimer(context as WebGL2RenderingContext)
      : null;
  }

  /** Capture once after opaque geometry, before any water/translucent effects. */
  public bindWaterCapture(meshes: readonly THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[], uniforms: CoastalUniforms): void {
    this.coastalUniforms = uniforms;
    for (const mesh of meshes) {
      const previous = mesh.onBeforeRender;
      mesh.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
        previous.call(mesh, renderer, scene, camera, geometry, material, group);
        if (material === mesh.material && !scene.overrideMaterial) this.captureOpaqueWaterInput(camera);
      };
    }
  }

  private captureOpaqueWaterInput(camera: THREE.Camera): void {
    if (this.capturedWaterThisFrame || !this.coastalUniforms || !this.composer) return;
    const source = this.renderer.getRenderTarget();
    const composer = this.composer as unknown as ComposerRuntimeInternals;
    if (!source?.depthTexture || (source !== composer.renderTarget1 && source !== composer.renderTarget2)) return;
    if (!this.opaqueSnapshot || this.opaqueSnapshot.width !== source.width || this.opaqueSnapshot.height !== source.height) {
      this.opaqueSnapshot?.dispose();
      this.opaqueSnapshot = new THREE.WebGLRenderTarget(source.width, source.height, {
        type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(source.width, source.height, THREE.UnsignedIntType),
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false
      });
      this.opaqueSnapshot.texture.name = "opaque_water_color";
      this.renderer.initRenderTarget(this.opaqueSnapshot);
    }
    const snapshot = this.opaqueSnapshot;
    this.renderer.copyTextureToTexture(source.texture, snapshot.texture);
    this.renderer.copyTextureToTexture(source.depthTexture, snapshot.depthTexture!);
    // r174 depth blits bind read/draw framebuffers; restore the active scene target.
    this.renderer.setRenderTarget(source);
    const uniforms = this.coastalUniforms;
    uniforms.uOpaqueColor.value = snapshot.texture;
    uniforms.uOpaqueDepth.value = snapshot.depthTexture;
    uniforms.uOpticsViewport.value.set(source.width, source.height);
    uniforms.uOpticsInverseProjection.value.copy(camera.projectionMatrixInverse);
    uniforms.uSceneCaptureEnabled.value = 1;
    this.capturedWaterThisFrame = true;
  }

  public setQuality(tier: QualityTier): void {
    if (tier === this.qualityTier) return;
    this.qualityTier = tier;
    this.generation += 1;
    this.disposeComposer();
    this.initialization = null;
  }

  /** Fades the high-tier AO contribution at the edge of a quality handoff. */
  public setGtaoBlendScale(scale: number): void {
    this.gtaoBlendScale = THREE.MathUtils.clamp(scale, 0, 1);
    if (this.gtaoPass) {
      this.gtaoPass.blendIntensity = CANONICAL_RENDER_CONFIG.gtao.blendIntensity * this.gtaoBlendScale;
    }
  }

  public resize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    if (!this.composer) return;
    const quality = CANONICAL_RENDER_CONFIG.quality[this.qualityTier];
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, quality.postProcessPixelRatioCap));
    this.composer.setSize(this.width, this.height);
    const aoPixelRatio = Math.min(window.devicePixelRatio, quality.postProcessPixelRatioCap);
    this.gtaoPass?.setSize(
      Math.max(1, Math.floor(this.width * aoPixelRatio * CANONICAL_RENDER_CONFIG.gtao.resolutionScale)),
      Math.max(1, Math.floor(this.height * aoPixelRatio * CANONICAL_RENDER_CONFIG.gtao.resolutionScale))
    );
    this.resetGtaoReuse();
  }

  public setCaptureRenderMode(mode: CaptureRenderMode): void {
    if (mode === this.renderMode) return;
    this.renderMode = mode;
    this.resetGtaoReuse();
  }

  public render(camera: THREE.Camera): void {
    this.capturedWaterThisFrame = false;
    if (this.coastalUniforms) this.coastalUniforms.uSceneCaptureEnabled.value = 0;
    this.renderer.info.reset();
    this.gpuTimer?.beginFrame();
    try {
      const quality = CANONICAL_RENDER_CONFIG.quality[this.qualityTier];
      if (quality.ambientOcclusion !== "gtao") {
        this.renderer.render(this.scene, camera);
        return;
      }
      if (!this.composer || this.activeCamera !== camera) {
        this.beginInitialization(camera);
        this.renderer.render(this.scene, camera);
        return;
      }
      if (this.gtaoPass) this.gtaoPass.enabled = this.renderMode !== "no-post";
      if (this.gtaoPass?.enabled) this.prepareGtaoFrame(camera);
      this.composer.render();
    } finally {
      this.gpuTimer?.endFrame();
    }
  }

  /**
   * Warms the active render path before deterministic capture. Runtime frames
   * still own the final shadow-map update and post-process draw.
   */
  public async prepareForCapture(camera: THREE.Camera): Promise<void> {
    const quality = CANONICAL_RENDER_CONFIG.quality[this.qualityTier];
    if (quality.ambientOcclusion === "gtao" && (!this.composer || this.activeCamera !== camera)) {
      this.beginInitialization(camera);
      await this.initialization;
    }
    await this.renderer.compileAsync(this.scene, camera);
    this.renderer.shadowMap.needsUpdate = true;
  }

  public isGtaoActive(): boolean {
    return Boolean(this.composer && this.gtaoPass && this.renderMode !== "no-post");
  }

  public diagnostics(): RendererPipelineDiagnostics {
    const targets: RenderTargetDiagnostic[] = [];
    if (this.composer) {
      const composer = this.composer as unknown as ComposerRuntimeInternals;
      targets.push(renderTargetDiagnostic("composer.primary", composer.renderTarget1));
      targets.push(renderTargetDiagnostic("composer.secondary", composer.renderTarget2));
    }
    if (this.opaqueSnapshot) targets.push(renderTargetDiagnostic("water.opaqueSnapshot", this.opaqueSnapshot));
    if (this.gtaoPass) {
      const gtao = this.gtaoPass as unknown as GtaoPassRuntimeInternals;
      targets.push(renderTargetDiagnostic("gtao.gather", this.gtaoPass.gtaoRenderTarget));
      targets.push(renderTargetDiagnostic("gtao.denoised", gtao.pdRenderTarget));
    }
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Light) || !object.castShadow) return;
      const shadow = (object as THREE.DirectionalLight).shadow;
      if (shadow?.map) targets.push(renderTargetDiagnostic(`shadow.${object.name || object.uuid}`, shadow.map));
    });
    return {
      renderMode: this.renderMode,
      qualityTier: this.qualityTier,
      gtaoActive: this.isGtaoActive(),
      gpuTiming: this.gpuTimer?.snapshot() ?? {
        supported: false,
        blockedReason: "WebGL2 context unavailable",
        softwareRenderer: false,
        renderer: "unknown",
        sampleCount: 0,
        disjointCount: 0,
        p50Milliseconds: null,
        p95Milliseconds: null
      },
      renderTargets: targets,
      memory: {
        geometries: this.renderer.info.memory.geometries,
        textures: this.renderer.info.memory.textures
      }
    };
  }

  public dispose(): void {
    this.generation += 1;
    this.disposeComposer();
    this.initialization = null;
    this.gpuTimer?.dispose();
  }

  private beginInitialization(camera: THREE.Camera): void {
    if (this.initialization || this.composer) return;
    const generation = this.generation;
    this.initialization = this.initialize(camera, generation).finally(() => {
      if (generation === this.generation) this.initialization = null;
    });
  }

  private async initialize(camera: THREE.Camera, generation: number): Promise<void> {
    const [{ EffectComposer }, { RenderPass }, { GTAOPass }, { OutputPass }] = await Promise.all([
      import("three/examples/jsm/postprocessing/EffectComposer.js"),
      import("three/examples/jsm/postprocessing/RenderPass.js"),
      import("three/examples/jsm/postprocessing/GTAOPass.js"),
      import("three/examples/jsm/postprocessing/OutputPass.js")
    ]);
    if (generation !== this.generation || CANONICAL_RENDER_CONFIG.quality[this.qualityTier].ambientOcclusion !== "gtao") {
      return;
    }

    const sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType)
    });
    const composer = new EffectComposer(this.renderer, sceneTarget);
    const renderPass = new RenderPass(this.scene, camera);
    const gtaoPass = new GTAOPass(this.scene, camera, this.width, this.height);
    bindGtaoSceneDepth(gtaoPass, sceneTarget);
    const config = CANONICAL_RENDER_CONFIG.gtao;
    gtaoPass.blendIntensity = config.blendIntensity * this.gtaoBlendScale;
    gtaoPass.updateGtaoMaterial({
      radius: config.radius,
      thickness: config.thickness,
      distanceFallOff: config.distanceFallOff,
      samples: config.samples,
      screenSpaceRadius: false
    });
    gtaoPass.updatePdMaterial({ samples: config.denoiseSamples, radius: 6, rings: 2 });
    // GTAOPass retains its denoised target but normally rebuilds it every
    // frame. Reuse that target while still compositing the current diffuse
    // frame, so motion never freezes when AO refreshes are skipped.
    const renderFreshGtao = gtaoPass.render.bind(gtaoPass);
    gtaoPass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
      bindGtaoSceneDepth(gtaoPass, readBuffer);
      if (this.gtaoRefreshThisFrame || gtaoPass.output !== 0) {
        renderFreshGtao(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
        return;
      }
      const retained = gtaoPass as unknown as GtaoPassRuntimeInternals;
      const target = retained.renderToScreen ? null : writeBuffer;
      retained.copyMaterial.uniforms.tDiffuse.value = readBuffer.texture;
      retained.copyMaterial.blending = THREE.NoBlending;
      retained.renderPass(renderer, retained.copyMaterial, target);
      retained.blendMaterial.uniforms.intensity.value = retained.blendIntensity;
      retained.blendMaterial.uniforms.tDiffuse.value = retained.pdRenderTarget.texture;
      retained.renderPass(renderer, retained.blendMaterial, target);
    };
    composer.addPass(renderPass);
    composer.addPass(gtaoPass);
    composer.addPass(new OutputPass());
    this.composer = composer;
    this.gtaoPass = gtaoPass;
    this.activeCamera = camera;
    this.resize(this.width, this.height);
  }

  private prepareGtaoFrame(camera: THREE.Camera): void {
    const moved = !this.hasGtaoCameraSample
      || camera.position.distanceToSquared(this.lastGtaoCameraPosition) > 0.0004
      || 1 - Math.abs(camera.quaternion.dot(this.lastGtaoCameraQuaternion)) > 0.000002;
    const config = CANONICAL_RENDER_CONFIG.gtao;
    const refreshFrames = moved ? config.movingRefreshFrames : config.settledRefreshFrames;
    this.gtaoFramesSinceRefresh += 1;
    this.gtaoRefreshThisFrame = !this.gtaoHasReusableFrame
      || this.gtaoFramesSinceRefresh >= refreshFrames;
    if (this.gtaoRefreshThisFrame) {
      this.gtaoHasReusableFrame = true;
      this.gtaoFramesSinceRefresh = 0;
    }
    this.lastGtaoCameraPosition.copy(camera.position);
    this.lastGtaoCameraQuaternion.copy(camera.quaternion);
    this.hasGtaoCameraSample = true;
  }

  private resetGtaoReuse(): void {
    this.gtaoRefreshThisFrame = true;
    this.gtaoHasReusableFrame = false;
    this.gtaoFramesSinceRefresh = 0;
    this.hasGtaoCameraSample = false;
  }

  private disposeComposer(): void {
    this.opaqueSnapshot?.dispose();
    this.opaqueSnapshot = null;
    if (this.coastalUniforms) {
      this.coastalUniforms.uOpaqueColor.value = null;
      this.coastalUniforms.uOpaqueDepth.value = null;
      this.coastalUniforms.uSceneCaptureEnabled.value = 0;
    }
    this.gtaoPass?.dispose();
    this.composer?.dispose();
    this.gtaoPass = null;
    this.composer = null;
    this.activeCamera = null;
    this.resetGtaoReuse();
  }
}
