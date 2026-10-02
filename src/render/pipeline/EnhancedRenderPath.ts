import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import type { ColorFinish, ResolvedGraphicsEffects } from "../config/GraphicsEffectSettings";
import { FinalColorPass, type FinalColorInputs } from "./FinalColorPass";
import { FxaaStage } from "./FxaaStage";
import { GtaoStage } from "./GtaoStage";
import { HdrBloomStage } from "./HdrBloomStage";
import { SunShaftStage } from "./SunShaftStage";
import { assertProgramsRunnable } from "./programHealth";

type StageKind = "gtao" | "bloom" | "fxaa" | "sun-shafts";

export interface EnhancedFrameOptions {
  /** Capture `no-post`: every optional effect off, same targets and conversion. */
  noPost: boolean;
  /** AO contribution after the quality handoff and player strength. */
  aoIntensity: number;
  beginPass: (name: string) => void;
}

export interface EnhancedPathTargets {
  scene: THREE.WebGLRenderTarget;
  output: THREE.WebGLRenderTarget | null;
  gtao: { gather: THREE.WebGLRenderTarget; denoised: THREE.WebGLRenderTarget } | null;
  sunShafts: THREE.WebGLRenderTarget | null;
  bloom: readonly THREE.WebGLRenderTarget[];
}

/** Optional stages that are installed and requested, i.e. drawn on a final frame. */
export interface EnhancedActiveStages {
  gtao: boolean;
  bloom: boolean;
  sunShafts: boolean;
  fxaa: boolean;
}

const UNIT_SIZE: Readonly<{ width: number; height: number }> = Object.freeze({ width: 1, height: 1 });

/**
 * The High tier's render path: the world into one linear HDR colour/depth
 * target (which also feeds the water snapshot), optional GTAO, sunlight and HDR bloom
 * over that target, then one final-colour pass and optional FXAA.
 *
 * Optional stages are created only while an effect needs them. `setEffects`
 * only records the request and releases stages that are no longer wanted;
 * creation — module load, allocation and shader warm-up — starts from the next
 * frame or entry preparation and runs asynchronously, and the stage takes over
 * only once ready, so a settings callback never compiles or allocates.
 */
export class EnhancedRenderPath {
  public readonly sceneTarget: THREE.WebGLRenderTarget;
  private outputTarget: THREE.WebGLRenderTarget | null = null;
  private readonly finalPass = new FinalColorPass();
  private gtao: GtaoStage | null = null;
  private sunShafts: SunShaftStage | null = null;
  private bloom: HdrBloomStage | null = null;
  private fxaa: FxaaStage | null = null;
  private readonly creating = new Set<StageKind>();
  private readonly pending = new Map<StageKind, Promise<void>>();
  private readonly failed = new Set<StageKind>();
  private effects: ResolvedGraphicsEffects | null = null;
  private lastCamera: THREE.Camera | null = null;
  private width = 1;
  private height = 1;
  private disposed = false;
  private readonly neutralFinish: ColorFinish = { saturation: 1, contrast: 1, warmth: 0 };
  private readonly finalInputs: FinalColorInputs;

  public constructor(private readonly renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene) {
    this.sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false
    });
    this.sceneTarget.texture.name = "enhanced.sceneLinear";
    this.finalInputs = {
      scene: this.sceneTarget,
      camera: new THREE.Camera(),
      ambientOcclusion: null,
      aoSize: UNIT_SIZE,
      aoIntensity: 0,
      aoEdgeTolerance: CANONICAL_RENDER_CONFIG.postProcessing.ambientOcclusion.edgeDepthTolerance,
      sunShafts: null,
      bloom: null,
      bloomStrength: 0,
      finish: this.neutralFinish
    };
  }

  /** True while a requested stage has not yet loaded, compiled and taken over. */
  public get preparing(): boolean {
    return this.creating.size > 0
      || this.awaiting("gtao", this.gtao)
      || this.awaiting("sun-shafts", this.sunShafts)
      || this.awaiting("bloom", this.bloom)
      || this.awaiting("fxaa", this.fxaa);
  }

  public get failedStages(): readonly string[] {
    return [...this.failed];
  }

  public get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /** Scene size in device pixels. */
  public setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    if (this.sceneTarget.width !== this.width || this.sceneTarget.height !== this.height) {
      this.sceneTarget.setSize(this.width, this.height);
    }
    this.outputTarget?.setSize(this.width, this.height);
    this.gtao?.setSize(this.width, this.height);
    this.sunShafts?.setSize(this.width, this.height);
    this.bloom?.setSize(this.width, this.height);
  }

  public setEffects(effects: ResolvedGraphicsEffects): void {
    const previous = this.effects;
    this.effects = effects;
    if (previous && (previous.sunShafts !== effects.sunShafts || previous.hdrBloom !== effects.hdrBloom || previous.fxaa !== effects.fxaa
      || previous.ambientOcclusion !== effects.ambientOcclusion)) {
      // A new request gets a new attempt; a stage that failed stays off until then.
      this.failed.clear();
    }
    if (!this.wants("gtao") && this.gtao) { this.gtao.dispose(); this.gtao = null; }
    if (!this.wants("sun-shafts") && this.sunShafts) { this.sunShafts.dispose(); this.sunShafts = null; }
    if (!this.wants("bloom") && this.bloom) { this.bloom.dispose(); this.bloom = null; }
    if (!this.wants("fxaa") && this.fxaa) {
      this.fxaa.dispose();
      this.fxaa = null;
    }
    if (!this.wants("fxaa")) this.releaseOutputTarget();
    this.gtao?.setReduced(effects.aoReduced);
  }

  public activeStages(): EnhancedActiveStages {
    return {
      gtao: this.gtao !== null && this.wants("gtao"),
      sunShafts: Boolean(this.sunShafts?.active) && this.wants("sun-shafts"),
      bloom: this.bloom !== null && this.wants("bloom"),
      fxaa: this.fxaa !== null && this.wants("fxaa")
    };
  }

  /** Compiles the final pass and creates every requested stage before first use. */
  public async prepare(camera: THREE.Camera): Promise<void> {
    this.lastCamera = camera;
    await this.finalPass.prepare(this.renderer);
    assertProgramsRunnable(this.renderer, [this.finalPass.material]);
    this.ensureStages(camera);
    while (this.creating.size > 0 && !this.disposed) {
      await Promise.all([...this.pending.values()]);
    }
  }

  /** Invalidates retained AO: capture-mode change, cut, resize or restore. */
  public invalidateHistory(): void {
    this.gtao?.invalidate();
  }

  public isGtaoRendering(noPost: boolean): boolean {
    return !noPost && this.gtao !== null && this.wants("gtao");
  }

  public isBloomRendering(): boolean {
    return this.bloom !== null && this.wants("bloom");
  }

  public render(camera: THREE.Camera, options: EnhancedFrameOptions): void {
    if (camera !== this.lastCamera) {
      this.lastCamera = camera;
      this.gtao?.invalidate();
    }
    this.ensureStages(camera);
    const renderer = this.renderer;
    options.beginPass("scene");
    renderer.setRenderTarget(this.sceneTarget);
    renderer.render(this.scene, camera);

    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      let ambientOcclusion: THREE.Texture | null = null;
      if (this.isGtaoRendering(options.noPost) && options.aoIntensity > 0) {
        options.beginPass("gtao");
        ambientOcclusion = this.gtao!.update(renderer, camera, this.sceneTarget);
      } else {
        // A frame without AO must not leave a gather to be reused later.
        this.gtao?.invalidate();
      }

      let bloom: THREE.Texture | null = null;
      if (!options.noPost && this.bloom && this.wants("bloom")) {
        options.beginPass("bloom");
        bloom = this.bloom.render(renderer, this.sceneTarget, renderer.toneMappingExposure);
      }

      let sunShafts: THREE.Texture | null = null;
      if (this.sunShafts) this.sunShafts.active = false;
      if (!options.noPost && this.sunShafts && this.wants("sun-shafts")) {
        options.beginPass("sun-shafts");
        sunShafts = this.sunShafts.render(renderer, camera, this.sceneTarget);
      }

      const smoothing = !options.noPost && this.fxaa !== null && this.wants("fxaa");
      const output = smoothing ? this.ensureOutputTarget() : null;
      options.beginPass("post");
      const inputs = this.finalInputs;
      inputs.camera = camera;
      inputs.ambientOcclusion = ambientOcclusion;
      inputs.aoSize = this.gtao?.size ?? UNIT_SIZE;
      inputs.aoIntensity = options.aoIntensity;
      inputs.sunShafts = sunShafts;
      inputs.bloom = bloom;
      inputs.bloomStrength = this.bloom?.strength ?? 0;
      inputs.finish = options.noPost ? this.neutralFinish : this.effects?.colorFinish ?? this.neutralFinish;
      this.finalPass.render(renderer, inputs, output);
      if (output && this.fxaa) {
        options.beginPass("fxaa");
        this.fxaa.render(renderer, output, null);
      }
    } finally {
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(null);
    }
  }

  public targets(): EnhancedPathTargets {
    return {
      scene: this.sceneTarget,
      output: this.outputTarget,
      gtao: this.gtao?.targets ?? null,
      sunShafts: this.sunShafts?.target ?? null,
      bloom: this.bloom?.targets ?? []
    };
  }

  public dispose(): void {
    this.disposed = true;
    this.gtao?.dispose();
    this.sunShafts?.dispose();
    this.sunShafts = null;
    this.bloom?.dispose();
    this.fxaa?.dispose();
    this.gtao = null;
    this.bloom = null;
    this.fxaa = null;
    this.releaseOutputTarget();
    this.finalPass.dispose();
    this.sceneTarget.dispose();
  }

  private awaiting(kind: StageKind, stage: object | null): boolean {
    return stage === null && this.wants(kind) && !this.failed.has(kind);
  }

  private wants(kind: StageKind): boolean {
    const effects = this.effects;
    if (!effects) return false;
    switch (kind) {
      case "gtao": return effects.ambientOcclusion === "gtao";
      case "sun-shafts": return effects.sunShafts;
      case "bloom": return effects.hdrBloom;
      case "fxaa": return effects.fxaa;
    }
  }

  private ensureStages(camera: THREE.Camera): void {
    if (this.disposed) return;
    if (this.wants("gtao") && !this.gtao) {
      this.create("gtao", async () => {
        const stage = await GtaoStage.create(this.scene, camera);
        stage.setReduced(this.effects?.aoReduced ?? false);
        stage.setSize(this.width, this.height);
        await stage.prepare(this.renderer, camera, this.sceneTarget);
        return stage;
      }, (stage) => { this.gtao = stage; });
    }
    if (this.wants("sun-shafts") && !this.sunShafts) {
      this.create("sun-shafts", async () => {
        const stage = new SunShaftStage();
        stage.setSize(this.width, this.height);
        await stage.prepare(this.renderer);
        return stage;
      }, (stage) => { this.sunShafts = stage; });
    }
    if (this.wants("bloom") && !this.bloom) {
      this.create("bloom", async () => {
        const stage = new HdrBloomStage();
        stage.setSize(this.width, this.height);
        await stage.prepare(this.renderer);
        return stage;
      }, (stage) => { this.bloom = stage; });
    }
    if (this.wants("fxaa") && !this.fxaa) {
      this.create("fxaa", async () => {
        const stage = await FxaaStage.create();
        await stage.prepare(this.renderer);
        return stage;
      }, (stage) => { this.fxaa = stage; });
    }
  }

  private create<T extends { dispose(): void; setSize?: (width: number, height: number) => void }>(
    kind: StageKind,
    factory: () => Promise<T>,
    install: (stage: T) => void
  ): void {
    if (this.creating.has(kind) || this.failed.has(kind)) return;
    this.creating.add(kind);
    const attempt = factory().then((stage) => {
      if (this.disposed || !this.wants(kind)) {
        stage.dispose();
        return;
      }
      // The size may have changed while the stage was loading.
      stage.setSize?.(this.width, this.height);
      install(stage);
    }).catch((error: unknown) => {
      this.failed.add(kind);
      console.warn(`[Neva] ${kind} post-processing is unavailable; continuing without it.`, error);
    }).finally(() => {
      this.creating.delete(kind);
      this.pending.delete(kind);
    });
    this.pending.set(kind, attempt);
  }

  private ensureOutputTarget(): THREE.WebGLRenderTarget {
    if (!this.outputTarget) {
      this.outputTarget = new THREE.WebGLRenderTarget(this.width, this.height, {
        type: THREE.UnsignedByteType,
        depthBuffer: false,
        stencilBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false
      });
      this.outputTarget.texture.name = "enhanced.displayOutput";
    }
    return this.outputTarget;
  }

  private releaseOutputTarget(): void {
    this.outputTarget?.dispose();
    this.outputTarget = null;
  }
}
