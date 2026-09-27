import * as THREE from "three";
import type { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { assertProgramsRunnable } from "./programHealth";

type GtaoConfig = typeof CANONICAL_RENDER_CONFIG.gtao;

export function configureGtaoDistanceLimits(
  pass: GTAOPass,
  config: Pick<GtaoConfig, "maxDistance" | "fadeDistance">
): void {
  // 1. Patch gtaoMaterial to early-out past maxDistance, fade smoothly, and reject sky taps
  let gtaoFrag = pass.gtaoMaterial.fragmentShader;
  if (!gtaoFrag.includes("uGtaoMaxDistance")) {
    gtaoFrag = "uniform float uGtaoMaxDistance;\nuniform float uGtaoFadeDistance;\n" + gtaoFrag;
    gtaoFrag = gtaoFrag.replace(
      "vec3 viewPos = getViewPosition(vUv, depth);",
      "vec3 viewPos = getViewPosition(vUv, depth);\n\t\t\tif (viewPos.z < -uGtaoMaxDistance) {\n\t\t\t\tdiscard;\n\t\t\t\treturn;\n\t\t\t}"
    );
    gtaoFrag = gtaoFrag.replaceAll(
      "if (abs(viewDelta.z) < thickness) {",
      "if (sampleSceneUvDepth.z < 0.99999 && abs(viewDelta.z) < thickness) {"
    );
    gtaoFrag = gtaoFrag.replace(
      "ao = pow(ao, scale);",
      "ao = mix(ao, 1.0, smoothstep(uGtaoFadeDistance, uGtaoMaxDistance, -viewPos.z));\n\t\t\tao = pow(ao, scale);"
    );
    pass.gtaoMaterial.fragmentShader = gtaoFrag;
    pass.gtaoMaterial.uniforms.uGtaoMaxDistance = { value: config.maxDistance };
    pass.gtaoMaterial.uniforms.uGtaoFadeDistance = { value: config.fadeDistance };
    pass.gtaoMaterial.needsUpdate = true;
  } else if (pass.gtaoMaterial.uniforms.uGtaoMaxDistance) {
    pass.gtaoMaterial.uniforms.uGtaoMaxDistance.value = config.maxDistance;
    pass.gtaoMaterial.uniforms.uGtaoFadeDistance.value = config.fadeDistance;
  }

  // 2. Patch pdMaterial to discard sky fragments and distant fragments before normal computation
  let pdFrag = pass.pdMaterial.fragmentShader;
  if (!pdFrag.includes("uGtaoMaxDistance")) {
    pdFrag = "uniform float uGtaoMaxDistance;\n" + pdFrag;
    pdFrag = pdFrag.replace(
      "vec3 sampleNormal = getViewNormal(sampleUv);",
      "if (sampleDepth >= 0.99999) return;\n\t\t\tvec3 sampleNormal = getViewNormal(sampleUv);"
    );
    // The replacement below declares viewPos before the distance guard.
    // Remove the denoiser's later declaration first, so the new one survives.
    pdFrag = pdFrag.replace("vec3 viewPos = getViewPosition(vUv, depth);", "");
    const regex = /float depth = getDepth\(vUv\.xy\);[\s\S]*?if \((depth == 1\. \|\| dot\(viewNormal, viewNormal\) == 0\.)\) \{\s*discard;\s*return;\s*\}/;
    const replacement = `float depth = getDepth(vUv.xy);
\t\t\tif (depth >= 0.99999) {
\t\t\t\tdiscard;
\t\t\t\treturn;
\t\t\t}
\t\t\tvec3 viewPos = getViewPosition(vUv, depth);
\t\t\tif (viewPos.z < -uGtaoMaxDistance) {
\t\t\t\tdiscard;
\t\t\t\treturn;
\t\t\t}
\t\t\tvec3 viewNormal = getViewNormal(vUv);
\t\t\tif (dot(viewNormal, viewNormal) == 0.) {
\t\t\t\tdiscard;
\t\t\t\treturn;
\t\t\t}`;
    pdFrag = pdFrag.replace(regex, replacement);
    pass.pdMaterial.fragmentShader = pdFrag;
    pass.pdMaterial.uniforms.uGtaoMaxDistance = { value: config.maxDistance };
    pass.pdMaterial.needsUpdate = true;
  } else if (pass.pdMaterial.uniforms.uGtaoMaxDistance) {
    pass.pdMaterial.uniforms.uGtaoMaxDistance.value = config.maxDistance;
  }
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

interface GtaoPassInternals {
  pdRenderTarget: THREE.WebGLRenderTarget;
  normalRenderTarget: THREE.WebGLRenderTarget;
}

/**
 * A FOV ease converges asymptotically; treat sub-perceptual projection drift
 * as unchanged so reuse still works once the lens has visibly settled.
 */
function projectionsMatch(left: THREE.Matrix4, right: THREE.Matrix4): boolean {
  for (let index = 0; index < 16; index += 1) {
    const a = left.elements[index]!;
    const b = right.elements[index]!;
    if (Math.abs(a - b) > 1e-4 * Math.max(1, Math.abs(a), Math.abs(b))) return false;
  }
  return true;
}

/** Camera motion beyond this in one frame is a cut: nothing retained applies. */
const CUT_DISTANCE_METERS = 4;
const CUT_ROTATION_COSINE = Math.cos(THREE.MathUtils.degToRad(20));

/**
 * High-tier ambient occlusion over the current scene depth. It gathers and
 * denoises into its own reduced-resolution targets; the final-colour pass
 * composites the result with depth-aware upsampling, so AO costs no
 * full-resolution copy or blend pass of its own.
 *
 * The denoised target may be reused for a few frames (`gtao.*RefreshFrames`).
 * That is plain reuse of the last gather, not motion-compensated temporal
 * accumulation: anything that invalidates the view — a cut, a projection/FOV
 * change, a resize, a camera replacement or a capture-mode change — forces a
 * fresh gather before AO is shown again.
 */
export class GtaoStage {
  private refreshThisFrame = true;
  private hasReusableFrame = false;
  private framesSinceRefresh = 0;
  private hasCameraSample = false;
  private lastCamera: THREE.Camera | null = null;
  private readonly lastPosition = new THREE.Vector3();
  private readonly lastQuaternion = new THREE.Quaternion();
  private readonly lastProjection = new THREE.Matrix4();
  private readonly forward = new THREE.Vector3();
  private readonly lastForward = new THREE.Vector3();
  private resolutionScale: number;
  private sourceWidth = 1;
  private sourceHeight = 1;

  private constructor(private readonly pass: GTAOPass, private readonly config: GtaoConfig) {
    this.resolutionScale = config.resolutionScale;
  }

  public static async create(
    scene: THREE.Scene,
    camera: THREE.Camera,
    config: GtaoConfig = CANONICAL_RENDER_CONFIG.gtao
  ): Promise<GtaoStage> {
    const { GTAOPass } = await import("three/examples/jsm/postprocessing/GTAOPass.js");
    const pass = new GTAOPass(scene, camera, 1, 1);
    pass.output = GTAOPass.OUTPUT.Off;
    pass.updateGtaoMaterial({
      radius: config.radius,
      thickness: config.thickness,
      distanceFallOff: config.distanceFallOff,
      samples: config.samples,
      screenSpaceRadius: false
    });
    pass.updatePdMaterial({ samples: config.denoiseSamples, radius: 6, rings: 2 });
    configureGtaoDistanceLimits(pass, config);
    return new GtaoStage(pass, config);
  }

  public get texture(): THREE.Texture {
    return (this.pass as unknown as GtaoPassInternals).pdRenderTarget.texture;
  }

  public get targets(): { gather: THREE.WebGLRenderTarget; denoised: THREE.WebGLRenderTarget } {
    return { gather: this.pass.gtaoRenderTarget, denoised: (this.pass as unknown as GtaoPassInternals).pdRenderTarget };
  }

  public get size(): { width: number; height: number } {
    return { width: this.pass.gtaoRenderTarget.width, height: this.pass.gtaoRenderTarget.height };
  }

  /** Sizes the gather to a share of the scene target. */
  public setSize(sceneWidth: number, sceneHeight: number): void {
    this.sourceWidth = sceneWidth;
    this.sourceHeight = sceneHeight;
    const width = Math.max(1, Math.floor(sceneWidth * this.resolutionScale));
    const height = Math.max(1, Math.floor(sceneHeight * this.resolutionScale));
    if (this.pass.gtaoRenderTarget.width === width && this.pass.gtaoRenderTarget.height === height) return;
    this.pass.setSize(width, height);
    this.invalidate();
  }

  /** Auto frame pacing: gather at the configured reduced scale. */
  public setReduced(reduced: boolean): void {
    const scale = reduced
      ? CANONICAL_RENDER_CONFIG.postProcessing.ambientOcclusion.reducedResolutionScale
      : this.config.resolutionScale;
    if (scale === this.resolutionScale) return;
    this.resolutionScale = scale;
    this.setSize(this.sourceWidth, this.sourceHeight);
  }

  /** Compiles the gather and denoise programs against their real targets. */
  public async prepare(renderer: THREE.WebGLRenderer, camera: THREE.Camera, sceneTarget: THREE.WebGLRenderTarget): Promise<void> {
    bindGtaoSceneDepth(this.pass, sceneTarget);
    this.pass.camera = camera;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    const orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const previous = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(this.pass.gtaoRenderTarget);
      for (const material of [this.pass.gtaoMaterial, this.pass.pdMaterial]) {
        quad.material = material;
        await renderer.compileAsync(quad, orthographic);
      }
      assertProgramsRunnable(renderer, [this.pass.gtaoMaterial, this.pass.pdMaterial]);
    } finally {
      renderer.setRenderTarget(previous);
      quad.geometry.dispose();
    }
  }

  /**
   * Gathers and denoises when due, otherwise keeps the retained result. Returns
   * the texture the final pass should composite.
   */
  public update(renderer: THREE.WebGLRenderer, camera: THREE.Camera, sceneTarget: THREE.WebGLRenderTarget): THREE.Texture {
    this.decideRefresh(camera);
    if (this.refreshThisFrame) {
      bindGtaoSceneDepth(this.pass, sceneTarget);
      this.pass.camera = camera;
      // Output Off: gather + denoise only, into the pass's own targets.
      this.pass.render(renderer, sceneTarget, sceneTarget);
    }
    return this.texture;
  }

  /** Nothing retained may be shown again before a fresh gather. */
  public invalidate(): void {
    this.refreshThisFrame = true;
    this.hasReusableFrame = false;
    this.framesSinceRefresh = 0;
    this.hasCameraSample = false;
  }

  public dispose(): void {
    // The scene target owns the borrowed depth texture; GTAOPass.dispose
    // releases only its own noise textures, targets and materials.
    this.pass.dispose();
    this.pass.gtaoMaterial.dispose();
    this.pass.blendMaterial.dispose();
  }

  private decideRefresh(camera: THREE.Camera): void {
    const projectionChanged = !this.hasCameraSample
      || !projectionsMatch(camera.projectionMatrix, this.lastProjection);
    const cameraReplaced = camera !== this.lastCamera;
    this.forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const cut = this.hasCameraSample && (
      camera.position.distanceTo(this.lastPosition) > CUT_DISTANCE_METERS
      || this.forward.dot(this.lastForward) < CUT_ROTATION_COSINE
    );
    if (cameraReplaced || projectionChanged || cut) this.invalidate();
    const moved = !this.hasCameraSample
      || camera.position.distanceToSquared(this.lastPosition) > 0.0004
      || 1 - Math.abs(camera.quaternion.dot(this.lastQuaternion)) > 0.000002;
    const refreshFrames = moved ? this.config.movingRefreshFrames : this.config.settledRefreshFrames;
    this.framesSinceRefresh += 1;
    this.refreshThisFrame = !this.hasReusableFrame || this.framesSinceRefresh >= refreshFrames;
    if (this.refreshThisFrame) {
      this.hasReusableFrame = true;
      this.framesSinceRefresh = 0;
    }
    this.lastCamera = camera;
    this.lastPosition.copy(camera.position);
    this.lastQuaternion.copy(camera.quaternion);
    this.lastProjection.copy(camera.projectionMatrix);
    this.lastForward.copy(this.forward);
    this.hasCameraSample = true;
  }

  /** Test/diagnostic view of the reuse bookkeeping. */
  public get refreshedThisFrame(): boolean {
    return this.refreshThisFrame;
  }
}
