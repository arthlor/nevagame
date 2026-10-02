import * as THREE from "three";
import { vi } from "vitest";
import { RendererPipeline } from "../../src/render/pipeline/RendererPipeline";
import { createCoastalUniforms, type CoastalUniforms } from "../../src/render/water/CoastalOptics";
import type { QualityTier } from "../../src/render/config/VisualRenderConfig";

type Listener = () => void;

/** Draws a frame issued, classified by what `renderer.render` received. */
export interface FrameDraws {
  scene: number;
  waterSnapshot: number;
  finalColor: number;
  fxaa: number;
  bloom: number;
  /** Actual fullscreen GTAO gather + denoise draws. */
  gtao: number;
}

/**
 * A WebGLRenderer stand-in with the surface `RendererPipeline` and its stages
 * use. Nothing reaches a GPU: `render` records what it was asked to draw, and
 * drawing the main scene runs each bound water mesh's `onBeforeRender` the
 * way three.js does when it reaches the water in the opaque-then-transparent
 * order, so the pipeline's mid-scene water capture actually runs.
 */
export function createFakeRenderer(options: { failCompile?: (materialName: string) => boolean } = {}) {
  let active: THREE.WebGLRenderTarget | null = null;
  const clearColor = new THREE.Color();
  let clearAlpha = 1;
  const listeners = new Map<string, Set<Listener>>();
  let onSceneDraw: (camera: THREE.Camera) => void = () => {};
  const renderer = {
    info: { autoReset: true, reset: vi.fn(), memory: { geometries: 0, textures: 0 } },
    getContext: () => ({}),
    getClearColor: (target: THREE.Color) => target.copy(clearColor),
    getClearAlpha: () => clearAlpha,
    setClearColor: (color: THREE.ColorRepresentation) => { clearColor.set(color); },
    setClearAlpha: (alpha: number) => { clearAlpha = alpha; },
    clear: vi.fn(),
    getPixelRatio: () => 1,
    compileAsync: vi.fn(async (object: THREE.Object3D) => {
      if (options.failCompile?.(materialName(object))) throw new Error(`compile failed: ${materialName(object)}`);
    }),
    properties: { get: () => ({}) },
    shadowMap: { enabled: true, needsUpdate: false },
    toneMapping: THREE.ACESFilmicToneMapping as THREE.ToneMapping,
    toneMappingExposure: 1,
    outputColorSpace: THREE.SRGBColorSpace as string,
    autoClear: true,
    xr: { enabled: false },
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    getRenderTarget: () => active,
    setRenderTarget: vi.fn((target: THREE.WebGLRenderTarget | null) => { active = target; }),
    initRenderTarget: vi.fn(),
    copyTextureToTexture: vi.fn(),
    render: vi.fn((object: THREE.Object3D, camera: THREE.Camera) => {
      if (object.userData.fakeRendererScene === true) onSceneDraw(camera);
    }),
    domElement: {
      addEventListener: (type: string, listener: Listener) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      },
      removeEventListener: (type: string, listener: Listener) => listeners.get(type)?.delete(listener)
    }
  };
  return {
    renderer,
    webgl: renderer as unknown as THREE.WebGLRenderer,
    get activeTarget(): THREE.WebGLRenderTarget | null {
      return active;
    },
    setSceneDraw(handler: (camera: THREE.Camera) => void): void {
      onSceneDraw = handler;
    },
    /** Simulates the canvas events three.js forwards on context loss and restore. */
    dispatch(type: "webglcontextlost" | "webglcontextrestored"): void {
      for (const listener of listeners.get(type) ?? []) listener();
    },
    listenerCount(type: string): number {
      return listeners.get(type)?.size ?? 0;
    }
  };
}

export type FakeRenderer = ReturnType<typeof createFakeRenderer>;

function materialName(object: unknown): string {
  const material = (object as { material?: THREE.Material }).material;
  return material && !Array.isArray(material) ? material.name : "";
}

export function classifyDraws(renderer: FakeRenderer["renderer"]): FrameDraws {
  const draws: FrameDraws = { scene: 0, waterSnapshot: 0, finalColor: 0, fxaa: 0, bloom: 0, gtao: 0 };
  for (const [object] of renderer.render.mock.calls) {
    if (object.userData.fakeRendererScene === true) draws.scene += 1;
    else if (object.name === "opaque_water_snapshot_pass") draws.waterSnapshot += 1;
    else if (materialName(object) === "neva_final_color") draws.finalColor += 1;
    else if (materialName(object) === "neva_fxaa") draws.fxaa += 1;
    else if (materialName(object).startsWith("neva_gtao_")) draws.gtao += 1;
    else if (materialName(object).startsWith("neva_bloom_")) draws.bloom += 1;
  }
  return draws;
}

/**
 * A pipeline over the fake renderer with one bound water mesh that draws
 * `waterDrawsPerFrame` times inside every main-scene draw (both water
 * tessellations, for example), prepared for entry at 320x180 CSS pixels.
 */
export async function createPipelineHarness(options: {
  tier?: QualityTier;
  waterDrawsPerFrame?: number;
  failCompile?: (materialName: string) => boolean;
} = {}) {
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  const fake = createFakeRenderer({ failCompile: options.failCompile });
  const scene = new THREE.Scene();
  scene.userData.fakeRendererScene = true;
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 500);
  const uniforms: CoastalUniforms = createCoastalUniforms(null, new THREE.Vector4(0, 0, 20, 20));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.ShaderMaterial());
  scene.add(water);
  const waterDraws = options.waterDrawsPerFrame ?? 2;
  let sceneTargetDuringDraw: THREE.WebGLRenderTarget | null = null;
  fake.setSceneDraw((drawCamera) => {
    sceneTargetDuringDraw = fake.activeTarget;
    for (let draw = 0; draw < waterDraws; draw += 1) {
      water.onBeforeRender(fake.webgl, scene, drawCamera, water.geometry, water.material, null!);
    }
  });
  const pipeline = new RendererPipeline(fake.webgl, scene, options.tier ?? "high");
  pipeline.bindWaterCapture([water], uniforms);
  pipeline.resize(320, 180);
  await pipeline.prepareForEntry(camera);
  return {
    fake,
    renderer: fake.renderer,
    pipeline,
    scene,
    camera,
    uniforms,
    get sceneTargetDuringDraw(): THREE.WebGLRenderTarget | null {
      return sceneTargetDuringDraw;
    },
    /** Renders one frame and reports what it drew. */
    frame(frameCamera: THREE.Camera = camera): FrameDraws {
      fake.renderer.render.mockClear();
      pipeline.render(frameCamera);
      return classifyDraws(fake.renderer);
    },
    /** Lets stage creation (module load, warm-up) that a frame started finish. */
    async settle(): Promise<void> {
      for (let turn = 0; turn < 50 && pipeline.isPreparing(); turn += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
    dispose(): void {
      pipeline.dispose();
      water.geometry.dispose();
      water.material.dispose();
    }
  };
}
