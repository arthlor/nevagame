import * as THREE from "three";
import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import type { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../config/VisualRenderConfig";

/**
 * The only post-processing path. It lazy-loads GTAO on the high tier and
 * renders directly on lower tiers, keeping expensive contact effects out of
 * low-spec sessions and the starter bundle.
 */
export class RendererPipeline {
  private composer: EffectComposer | null = null;
  private gtaoPass: GTAOPass | null = null;
  private activeCamera: THREE.Camera | null = null;
  private initialization: Promise<void> | null = null;
  private generation = 0;
  private width = 1;
  private height = 1;
  private qualityTier: QualityTier;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    initialQuality: QualityTier
  ) {
    this.qualityTier = initialQuality;
    this.renderer.info.autoReset = false;
  }

  public setQuality(tier: QualityTier): void {
    if (tier === this.qualityTier) return;
    this.qualityTier = tier;
    this.generation += 1;
    this.disposeComposer();
    this.initialization = null;
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
  }

  public render(camera: THREE.Camera): void {
    this.renderer.info.reset();
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
    this.composer.render();
  }

  public isGtaoActive(): boolean {
    return Boolean(this.composer && this.gtaoPass);
  }

  public dispose(): void {
    this.generation += 1;
    this.disposeComposer();
    this.initialization = null;
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

    const composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, camera);
    const gtaoPass = new GTAOPass(this.scene, camera, this.width, this.height);
    const config = CANONICAL_RENDER_CONFIG.gtao;
    gtaoPass.blendIntensity = config.blendIntensity;
    gtaoPass.updateGtaoMaterial({
      radius: config.radius,
      thickness: config.thickness,
      distanceFallOff: config.distanceFallOff,
      samples: config.samples,
      screenSpaceRadius: false
    });
    gtaoPass.updatePdMaterial({ samples: config.denoiseSamples, radius: 6, rings: 2 });
    composer.addPass(renderPass);
    composer.addPass(gtaoPass);
    composer.addPass(new OutputPass());
    this.composer = composer;
    this.gtaoPass = gtaoPass;
    this.activeCamera = camera;
    this.resize(this.width, this.height);
  }

  private disposeComposer(): void {
    this.gtaoPass?.dispose();
    this.composer?.dispose();
    this.gtaoPass = null;
    this.composer = null;
    this.activeCamera = null;
  }
}
