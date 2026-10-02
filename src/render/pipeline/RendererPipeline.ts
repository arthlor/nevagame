import * as THREE from "three";
import type { CoastalUniforms } from "../water/CoastalOptics";
import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../config/VisualRenderConfig";
import {
  DEFAULT_GRAPHICS_EFFECTS,
  isNeutralColorFinish,
  resolveGraphicsEffects,
  type ResolvedGraphicsEffects
} from "../config/GraphicsEffectSettings";
import { GpuFrameTimer, type GpuFrameTimingSnapshot } from "./GpuFrameTimer";
import { OpaqueWaterSnapshotPass } from "./OpaqueWaterSnapshotPass";
import type { EnhancedFrameOptions, EnhancedRenderPath } from "./EnhancedRenderPath";
import type { AtmosphereSky, AtmosphereSkyDiagnostics } from "../atmosphere/AtmosphereSky";
import { prepareSkyMaterialReflections } from "../atmosphere/SkyMaterialReflections";
import type { ShelterProbeLighting } from "../lighting/ShelterProbeLighting";

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

export type RenderPathState = "direct" | "enhanced" | "enhanced-preparing" | "direct-fallback";

/** Full-screen effects actually drawn on a frame of the current mode. */
export interface ActiveRenderEffects {
  gtao: boolean;
  hdrBloom: boolean;
  sunShafts: boolean;
  fxaa: boolean;
  colorFinish: boolean;
}

export interface RenderPipelineRuntimeState {
  path: RenderPathState;
  /** The enhanced path or a requested stage is still compiling. */
  preparing: boolean;
  /** Scene render size in device pixels. */
  renderSize: { width: number; height: number; pixelRatio: number };
  fallbackReason: string | null;
  failedStages: readonly string[];
}

export interface RendererPipelineDiagnostics {
  renderMode: CaptureRenderMode;
  qualityTier: QualityTier;
  path: RenderPathState;
  /** Why the enhanced path is unavailable, when it is. */
  fallbackReason: string | null;
  gtaoActive: boolean;
  /** Effects the pipeline was asked for, and those actually drawn this frame. */
  requestedEffects: ResolvedGraphicsEffects;
  activeEffects: ActiveRenderEffects;
  failedStages: readonly string[];
  renderSize: { width: number; height: number; pixelRatio: number };
  contextRestores: number;
  atmosphere: AtmosphereSkyDiagnostics | null;
  gpuTiming: GpuFrameTimingSnapshot;
  renderTargets: readonly RenderTargetDiagnostic[];
  memory: {
    geometries: number;
    textures: number;
  };
}

export function renderTargetDiagnostic(id: string, target: THREE.RenderTarget): RenderTargetDiagnostic {
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
 * Device-pixel ratio the world is rendered at. The enhanced path renders its
 * scene target at the tier's post-process cap; the direct path renders into the
 * canvas at the tier's canvas cap. The player's resolution scale applies to
 * both, never below `renderResolution.minimumPixelRatio`.
 */
export function scenePixelRatio(tier: QualityTier, resolutionScale: number, devicePixelRatio: number): number {
  const quality = CANONICAL_RENDER_CONFIG.quality[tier];
  const cap = quality.enhancedPostPath ? quality.postProcessPixelRatioCap : quality.pixelRatioCap;
  return Math.max(
    CANONICAL_RENDER_CONFIG.postProcessing.renderResolution.minimumPixelRatio,
    Math.min(devicePixelRatio, cap) * resolutionScale
  );
}

/**
 * Canvas drawing-buffer ratio. The enhanced path presents its scene target at
 * the unscaled post-process ratio: a larger canvas would only multisample and
 * upscale a finished image. The direct path draws the scene into the canvas.
 */
export function canvasPixelRatio(tier: QualityTier, resolutionScale: number, devicePixelRatio: number): number {
  const quality = CANONICAL_RENDER_CONFIG.quality[tier];
  return quality.enhancedPostPath
    ? Math.min(devicePixelRatio, quality.postProcessPixelRatioCap)
    : scenePixelRatio(tier, resolutionScale, devicePixelRatio);
}

function supportsHalfFloatTargets(renderer: THREE.WebGLRenderer): boolean {
  const extensions = renderer.extensions as { has?: (name: string) => boolean } | undefined;
  if (!extensions?.has) return true;
  return extensions.has("EXT_color_buffer_float") || extensions.has("EXT_color_buffer_half_float");
}

function devicePixelRatio(): number {
  return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
}

/**
 * The only render path owner. Tiers with `enhancedPostPath` render through a
 * lazily loaded `EnhancedRenderPath` (linear HDR scene target, water snapshot,
 * optional AO/bloom/FXAA and one final-colour pass); the others render directly
 * to the canvas and never load or compile those modules. Which optional effects
 * run is decided from the resolved graphics effects, independently of whether
 * the path exists: AO off on High keeps the scene target and water optics.
 */
export class RendererPipeline {
  private shelter: ShelterProbeLighting | null = null;
  private sky: AtmosphereSky | null = null;
  private enhanced: EnhancedRenderPath | null = null;
  private fallbackReason: string | null = null;
  private opaqueSnapshot: THREE.WebGLRenderTarget | null = null;
  private opaqueSnapshotPass: OpaqueWaterSnapshotPass | null = null;
  private coastalUniforms: CoastalUniforms | null = null;
  private capturedWaterThisFrame = false;
  private initialization: Promise<void> | null = null;
  private generation = 0;
  private width = 1;
  private height = 1;
  private qualityTier: QualityTier;
  private effects: ResolvedGraphicsEffects;
  private gtaoBlendScale = 1;
  private sizeDirty = false;
  private renderMode: CaptureRenderMode = "final";
  private gpuTimer: GpuFrameTimer | null;
  private passTimingEnabled = false;
  private contextLost = false;
  private contextRestores = 0;
  private readonly contextRestoredListeners = new Set<() => void>();
  private readonly frameOptions: EnhancedFrameOptions = {
    noPost: false,
    aoIntensity: 0,
    beginPass: (name) => this.gpuTimer?.beginPass(name)
  };
  private readonly handleContextLost = (): void => {
    // three.js prevents the default and stops drawing; release what belonged
    // to the lost context and stop issuing queries until it is restored.
    this.contextLost = true;
    this.gpuTimer?.dispose();
    this.gpuTimer = null;
  };
  private readonly handleContextRestored = (): void => {
    this.contextLost = false;
    this.contextRestores += 1;
    // three.js replaces `info` (and `shadowMap`) when it rebuilds the context.
    this.renderer.info.autoReset = false;
    this.gpuTimer = this.createGpuTimer();
    this.gpuTimer?.setPassTimingEnabled(this.passTimingEnabled);
    // Every GPU object died with the old context. Drop them without deleting
    // stale handles; the enhanced path and water snapshot rebuild on demand.
    this.generation += 1;
    this.initialization = null;
    this.enhanced = null;
    this.opaqueSnapshot = null;
    this.opaqueSnapshotPass = null;
    this.clearWaterCapture();
    this.sky?.resetMaterialReflections();
    this.renderer.shadowMap.needsUpdate = true;
    for (const listener of this.contextRestoredListeners) listener();
  };

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    initialQuality: QualityTier
  ) {
    this.qualityTier = initialQuality;
    this.effects = resolveGraphicsEffects(DEFAULT_GRAPHICS_EFFECTS, initialQuality);
    this.renderer.info.autoReset = false;
    this.gpuTimer = this.createGpuTimer();
    const canvas = (this.renderer as { domElement?: HTMLCanvasElement }).domElement;
    canvas?.addEventListener?.("webglcontextlost", this.handleContextLost);
    canvas?.addEventListener?.("webglcontextrestored", this.handleContextRestored);
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

  public bindSky(sky: AtmosphereSky): void {
    this.sky = sky;
    sky.bindMaterialWorld(this.scene);
    sky.setQuality(this.qualityTier);
  }

  public bindShelter(shelter: ShelterProbeLighting): void { this.shelter = shelter; }

  /** Called after three.js restores a lost context and this pipeline has reset. */
  public onContextRestored(listener: () => void): () => void {
    this.contextRestoredListeners.add(listener);
    return () => this.contextRestoredListeners.delete(listener);
  }

  private captureOpaqueWaterInput(camera: THREE.Camera): void {
    const enhanced = this.enhanced;
    if (this.capturedWaterThisFrame || !this.coastalUniforms || !enhanced) return;
    const source = this.renderer.getRenderTarget();
    if (!source?.depthTexture || source !== enhanced.sceneTarget) return;
    const snapshot = this.ensureOpaqueSnapshot(source);
    const snapshotPass = this.opaqueSnapshotPass ??= new OpaqueWaterSnapshotPass();
    // The capture happens mid-scene, so measure it as an interrupt segment and
    // resume the scene pass afterwards; same-named segments are summed per frame.
    const interruptedPass = this.gpuTimer?.currentPassName ?? null;
    this.gpuTimer?.beginPass("water-capture");
    try {
      snapshotPass.copy(this.renderer, source, snapshot);
    } finally {
      if (interruptedPass) this.gpuTimer?.beginPass(interruptedPass);
    }
    const uniforms = this.coastalUniforms;
    uniforms.uOpaqueColor.value = snapshot.texture;
    uniforms.uOpaqueDepth.value = snapshot.depthTexture;
    uniforms.uOpticsViewport.value.set(source.width, source.height);
    uniforms.uOpticsInverseProjection.value.copy(camera.projectionMatrixInverse);
    uniforms.uOpticsProjection.value.copy(camera.projectionMatrix);
    if ("near" in camera) uniforms.uCameraNear.value = (camera as THREE.PerspectiveCamera).near;
    if ("far" in camera) uniforms.uCameraFar.value = (camera as THREE.PerspectiveCamera).far;
    uniforms.uSceneCaptureEnabled.value = 1;
    this.capturedWaterThisFrame = true;
  }

  private ensureOpaqueSnapshot(source: THREE.WebGLRenderTarget): THREE.WebGLRenderTarget {
    if (!this.opaqueSnapshot || this.opaqueSnapshot.width !== source.width || this.opaqueSnapshot.height !== source.height) {
      this.opaqueSnapshot?.dispose();
      this.opaqueSnapshot = new THREE.WebGLRenderTarget(source.width, source.height, {
        type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(source.width, source.height, THREE.UnsignedIntType),
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false
      });
      this.opaqueSnapshot.texture.name = "opaque_water_color";
      this.renderer.initRenderTarget(this.opaqueSnapshot);
    }
    return this.opaqueSnapshot;
  }

  public setQuality(tier: QualityTier): void {
    if (tier === this.qualityTier) return;
    this.qualityTier = tier;
    this.sky?.setQuality(tier);
    this.generation += 1;
    this.disposeEnhanced();
    this.initialization = null;
    this.fallbackReason = null;
  }

  /**
   * Applies resolved player/Auto effects. Live terms (AO strength, colour
   * finish) take effect on the next frame through uniforms; pass creation and
   * target resizing are deferred to the next frame and the enhanced path's
   * asynchronous preparation, and never run inside the caller.
   */
  public setEffects(effects: ResolvedGraphicsEffects): void {
    if (effects.resolutionScale !== this.effects.resolutionScale) this.sizeDirty = true;
    this.effects = { ...effects, colorFinish: { ...effects.colorFinish } };
    this.enhanced?.setEffects(this.effects);
  }

  public get requestedEffects(): Readonly<ResolvedGraphicsEffects> {
    return this.effects;
  }

  /**
   * Alternates named pass queries with whole-frame queries. Debug/acceptance
   * only: a context allows a single active timer query, so enabling this trades
   * whole-frame coverage on alternate frames for pass attribution.
   */
  public setPassTimingEnabled(enabled: boolean): void {
    this.passTimingEnabled = enabled;
    this.gpuTimer?.setPassTimingEnabled(enabled);
  }

  /** Clears GPU timing samples so a matched measurement window starts clean. */
  public resetGpuTiming(): void {
    this.gpuTimer?.resetSamples();
  }

  /** GPU samples collected since the last reset, without the scene traversal in `diagnostics()`. */
  public gpuTimingSnapshot(): GpuFrameTimingSnapshot | null {
    return this.gpuTimer?.snapshot() ?? null;
  }

  /** Recent GPU cost of a whole frame, or null where timer queries cannot say. */
  public gpuFrameEstimateMs(): number | null {
    return this.gpuTimer?.recentFrameMilliseconds() ?? null;
  }

  /** Fades the high-tier AO contribution at the edge of a quality handoff. */
  public setGtaoBlendScale(scale: number): void {
    this.gtaoBlendScale = THREE.MathUtils.clamp(scale, 0, 1);
  }

  public resize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.applySize();
  }

  public setCaptureRenderMode(mode: CaptureRenderMode): void {
    if (mode === this.renderMode) return;
    this.renderMode = mode;
    this.enhanced?.invalidateHistory();
  }

  public render(camera: THREE.Camera): void {
    this.capturedWaterThisFrame = false;
    if (this.coastalUniforms) this.coastalUniforms.uSceneCaptureEnabled.value = 0;
    if (this.contextLost) return;
    if (this.sizeDirty) this.applySize();
    this.renderer.info.reset();
    this.gpuTimer?.beginFrame();
    try {
      this.gpuTimer?.beginPass("shelter-probes");
      this.shelter?.render();
      this.gpuTimer?.beginPass("atmosphere");
      this.sky?.render(this.renderer, camera);
      if (!this.wantsEnhanced() || this.fallbackReason) {
        this.gpuTimer?.beginPass("scene");
        this.renderer.render(this.scene, camera);
        return;
      }
      if (!this.enhanced) {
        // Until the path is compiled, draw directly rather than stall a frame.
        this.gpuTimer?.beginPass("scene");
        this.beginInitialization(camera);
        this.renderer.render(this.scene, camera);
        return;
      }
      const options = this.frameOptions;
      options.noPost = this.renderMode === "no-post";
      options.aoIntensity = CANONICAL_RENDER_CONFIG.gtao.blendIntensity * this.gtaoBlendScale * this.effects.aoStrength;
      this.enhanced.render(camera, options);
    } finally {
      this.gpuTimer?.endFrame();
    }
  }

  /**
   * Warms the active render path before deterministic capture. Runtime frames
   * still own the final shadow-map update and post-process draw.
   */
  public prepareForCapture(camera: THREE.Camera): Promise<void> { return this.prepareForEntry(camera); }

  public async prepareForEntry(camera: THREE.Camera): Promise<void> {
    await this.sky?.prepare(this.renderer);
    await this.shelter?.prepareForEntry();
    prepareSkyMaterialReflections(this.scene);
    if (this.wantsEnhanced() && !this.fallbackReason) {
      if (!this.enhanced) {
        this.beginInitialization(camera);
        await this.initialization;
      }
      await this.enhanced?.prepare(camera);
    }
    const enhanced = this.enhanced;
    // Compile the selected output variant without retaining temporary state
    // while the driver asynchronously reports shader readiness.
    await this.prepareWorldShaderVariant(camera);
    if (enhanced) {
      const snapshot = this.ensureOpaqueSnapshot(enhanced.sceneTarget);
      const snapshotPass = this.opaqueSnapshotPass ??= new OpaqueWaterSnapshotPass();
      await snapshotPass.prepare(this.renderer, snapshot);
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Warm hidden presentation materials with the world lights and actual output target. */
  public async prepareAdditionalMaterials(materialScene: THREE.Scene, camera: THREE.Camera): Promise<void> {
    const previousTarget = this.renderer.getRenderTarget();
    const previousFace = this.renderer.getActiveCubeFace();
    const previousLevel = this.renderer.getActiveMipmapLevel();
    let pending: ReturnType<THREE.WebGLRenderer["compileAsync"]>;
    try {
      this.renderer.setRenderTarget(this.enhanced?.sceneTarget ?? null);
      pending = this.renderer.compileAsync(materialScene, camera, this.scene);
    } finally {
      this.renderer.setRenderTarget(previousTarget, previousFace, previousLevel);
    }
    await pending;
  }

  public async prepareWorldShaderVariant(camera: THREE.Camera): Promise<void> {
    const previousTarget = this.renderer.getRenderTarget();
    const previousFace = this.renderer.getActiveCubeFace();
    const previousLevel = this.renderer.getActiveMipmapLevel();
    let pending: ReturnType<THREE.WebGLRenderer["compileAsync"]>;
    try {
      this.renderer.setRenderTarget(this.enhanced?.sceneTarget ?? null);
      pending = this.renderer.compileAsync(this.scene, camera);
    } finally {
      this.renderer.setRenderTarget(previousTarget, previousFace, previousLevel);
    }
    await pending;
  }

  public isGtaoActive(): boolean {
    return Boolean(this.enhanced?.isGtaoRendering(this.renderMode === "no-post"));
  }

  /** Whether HDR bloom is drawing, so the glow sprites can stand in until it does. */
  public isHdrBloomActive(): boolean {
    return this.renderMode !== "no-post" && Boolean(this.enhanced?.isBloomRendering());
  }

  /**
   * What the current frames actually draw: a requested stage counts only once
   * it has compiled and taken over, and `no-post` draws none of them. Unlike
   * `diagnostics()` it neither traverses the scene nor polls GPU timers.
   */
  public activeEffects(): ActiveRenderEffects {
    const enhanced = this.enhanced;
    if (!enhanced || this.renderMode === "no-post") {
      return { gtao: false, hdrBloom: false, sunShafts: false, fxaa: false, colorFinish: false };
    }
    const stages = enhanced.activeStages();
    return {
      gtao: stages.gtao,
      hdrBloom: stages.bloom,
      sunShafts: stages.sunShafts,
      fxaa: stages.fxaa,
      colorFinish: !isNeutralColorFinish(this.effects.colorFinish)
    };
  }

  /** Summary for the settings UI and Auto quality. */
  public runtimeState(): RenderPipelineRuntimeState {
    return {
      path: this.pathState(),
      preparing: this.isPreparing(),
      renderSize: this.renderSize(),
      fallbackReason: this.fallbackReason,
      failedStages: this.enhanced?.failedStages ?? []
    };
  }

  public diagnostics(): RendererPipelineDiagnostics {
    const targets: RenderTargetDiagnostic[] = [];
    if (this.sky) targets.push(renderTargetDiagnostic("atmosphere.sky", this.sky.target));
    if (this.sky) targets.push(renderTargetDiagnostic("atmosphere.cloudSunlight", this.sky.cloudShadows.target));
    const materialReflection = this.sky?.materialReflectionTarget();
    if (materialReflection) targets.push(renderTargetDiagnostic("atmosphere.materialReflections", materialReflection));
    const enhanced = this.enhanced?.targets();
    if (enhanced) {
      targets.push(renderTargetDiagnostic("enhanced.scene", enhanced.scene));
      if (enhanced.output) targets.push(renderTargetDiagnostic("enhanced.output", enhanced.output));
      if (enhanced.gtao) {
        targets.push(renderTargetDiagnostic("gtao.gather", enhanced.gtao.gather));
        targets.push(renderTargetDiagnostic("gtao.denoised", enhanced.gtao.denoised));
      }
      if (enhanced.sunShafts) targets.push(renderTargetDiagnostic("atmosphere.sunShafts", enhanced.sunShafts));
      enhanced.bloom.forEach((target, level) => targets.push(renderTargetDiagnostic(`bloom.mip${level}`, target)));
    }
    if (this.opaqueSnapshot) targets.push(renderTargetDiagnostic("water.opaqueSnapshot", this.opaqueSnapshot));
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Light) || !object.castShadow) return;
      const shadow = (object as THREE.DirectionalLight).shadow;
      if (shadow?.map) targets.push(renderTargetDiagnostic(`shadow.${object.name || object.uuid}`, shadow.map));
    });
    return {
      renderMode: this.renderMode,
      qualityTier: this.qualityTier,
      path: this.pathState(),
      fallbackReason: this.fallbackReason,
      gtaoActive: this.isGtaoActive(),
      requestedEffects: this.effects,
      activeEffects: this.activeEffects(),
      failedStages: this.enhanced?.failedStages ?? [],
      renderSize: this.renderSize(),
      contextRestores: this.contextRestores,
      atmosphere: this.sky?.diagnostics() ?? null,
      gpuTiming: this.gpuTimer?.snapshot() ?? {
        supported: false,
        blockedReason: this.contextLost ? "WebGL context lost" : "WebGL2 context unavailable",
        softwareRenderer: false,
        renderer: "unknown",
        sampleCount: 0,
        disjointCount: 0,
        p50Milliseconds: null,
        p95Milliseconds: null,
        p99Milliseconds: null,
        passes: []
      },
      renderTargets: targets,
      memory: {
        geometries: this.renderer.info.memory.geometries,
        textures: this.renderer.info.memory.textures
      }
    };
  }

  public dispose(): void {
    this.sky = null;
    this.generation += 1;
    this.disposeEnhanced();
    this.initialization = null;
    this.gpuTimer?.dispose();
    this.contextRestoredListeners.clear();
    const canvas = (this.renderer as { domElement?: HTMLCanvasElement }).domElement;
    canvas?.removeEventListener?.("webglcontextlost", this.handleContextLost);
    canvas?.removeEventListener?.("webglcontextrestored", this.handleContextRestored);
  }

  private createGpuTimer(): GpuFrameTimer | null {
    const context = this.renderer.getContext();
    return "createQuery" in context ? new GpuFrameTimer(context as WebGL2RenderingContext) : null;
  }

  private wantsEnhanced(): boolean {
    return CANONICAL_RENDER_CONFIG.quality[this.qualityTier].enhancedPostPath;
  }

  private pathState(): RenderPathState {
    if (!this.wantsEnhanced()) return "direct";
    if (this.fallbackReason) return "direct-fallback";
    if (!this.enhanced) return "enhanced-preparing";
    return "enhanced";
  }

  /**
   * The selected path is initializing, or a requested effect has not yet
   * taken over. Nothing starts before the first frame or entry preparation.
   */
  public isPreparing(): boolean {
    return this.initialization !== null || Boolean(this.enhanced?.preparing);
  }

  private renderSize(): { width: number; height: number; pixelRatio: number } {
    const pixelRatio = scenePixelRatio(this.qualityTier, this.effects.resolutionScale, devicePixelRatio());
    return {
      width: Math.max(1, Math.floor(this.width * pixelRatio)),
      height: Math.max(1, Math.floor(this.height * pixelRatio)),
      pixelRatio: Number(pixelRatio.toFixed(3))
    };
  }

  private applySize(): void {
    this.sizeDirty = false;
    if (!this.enhanced) return;
    const size = this.renderSize();
    this.enhanced.setSize(size.width, size.height);
  }

  private beginInitialization(camera: THREE.Camera): void {
    if (this.initialization || this.enhanced || this.fallbackReason) return;
    const generation = this.generation;
    this.initialization = this.initialize(camera, generation).finally(() => {
      if (generation === this.generation) this.initialization = null;
    });
  }

  private async initialize(camera: THREE.Camera, generation: number): Promise<void> {
    const { EnhancedRenderPath } = await import("./EnhancedRenderPath");
    if (generation !== this.generation || !this.wantsEnhanced()) return;
    if (!supportsHalfFloatTargets(this.renderer)) {
      this.fallbackReason = "Half-float render targets are unsupported";
      console.warn(`[Neva] ${this.fallbackReason}; rendering directly without post-processing.`);
      return;
    }
    const path = new EnhancedRenderPath(this.renderer, this.scene);
    const size = this.renderSize();
    path.setSize(size.width, size.height);
    path.setEffects(this.effects);
    try {
      await path.prepare(camera);
    } catch (error) {
      path.dispose();
      if (generation !== this.generation) return;
      this.fallbackReason = error instanceof Error ? error.message : String(error);
      console.warn("[Neva] Enhanced render path unavailable; rendering directly.", error);
      return;
    }
    if (generation !== this.generation || this.contextLost) {
      path.dispose();
      return;
    }
    // Effects or size may have changed while the path compiled.
    path.setEffects(this.effects);
    const current = this.renderSize();
    path.setSize(current.width, current.height);
    this.enhanced = path;
  }

  private clearWaterCapture(): void {
    if (!this.coastalUniforms) return;
    this.coastalUniforms.uOpaqueColor.value = null;
    this.coastalUniforms.uOpaqueDepth.value = null;
    this.coastalUniforms.uSceneCaptureEnabled.value = 0;
  }

  private disposeEnhanced(): void {
    this.opaqueSnapshotPass?.dispose();
    this.opaqueSnapshotPass = null;
    this.opaqueSnapshot?.dispose();
    this.opaqueSnapshot = null;
    this.clearWaterCapture();
    this.enhanced?.dispose();
    this.enhanced = null;
  }
}
