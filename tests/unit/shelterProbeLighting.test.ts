import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { applyWorldAtmosphere } from "../../src/render/atmosphere/AtmosphereMaterial";
import { cloneShelterReceiver, shelterProbeSamplingChunk, type ShelterProbeUniforms } from "../../src/render/lighting/ShelterProbeMaterial";
import type { LightingFrame } from "../../src/render/lighting/LightingRig";

const fake = vi.hoisted(() => ({ calls: [] as number[] }));
vi.mock("three/addons/lighting/LightProbeGridWebGL.js", async () => {
  const T = await import("three");
  return { LightProbeGridWebGL: class extends T.Object3D {
    resolution = new T.Vector3(2, 2, 2);
    boundingBox = new T.Box3();
    texture: THREE.Texture | null = null;
    constructor(private width: number, private height: number, private depth: number) { super(); }
    updateBoundingBox() { this.boundingBox.setFromCenterAndSize(this.position, new T.Vector3(this.width, this.height, this.depth)); }
    bake(_renderer: unknown, _scene: unknown, options: { start: number }) {
      fake.calls.push(options.start);
      this.texture ??= new T.Data3DTexture(new Uint8Array(4), 1, 1, 1);
    }
    dispose() { this.texture?.dispose(); this.texture = null; }
  } };
});
import { ShelterProbeLighting } from "../../src/render/lighting/ShelterProbeLighting";

function shader(material: THREE.Material) {
  const result = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader } as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(result, {} as THREE.WebGLRenderer);
  return result;
}

const frame = { ambientDaylight: 1, stormStrength: 0, practicalLightIntensity: 0 } as LightingFrame;
function setup(renderer = {} as THREE.WebGLRenderer) {
  fake.calls.length = 0;
  const world = new THREE.Scene();
  const room = new THREE.Box3(new THREE.Vector3(-5, 0, -4), new THREE.Vector3(5, 3.3, 4));
  const owner = new ShelterProbeLighting(renderer, world, room, "high", run => run(), () => null);
  const source = new THREE.MeshStandardMaterial();
  applyWorldAtmosphere(source);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 8), source);
  const root = new THREE.Group(); root.add(floor); world.add(root);
  owner.addRoomRoot(root);
  const actor = new THREE.Group();
  const body: THREE.Mesh<THREE.BoxGeometry, THREE.Material | THREE.Material[]> = new THREE.Mesh(new THREE.BoxGeometry(), source);
  actor.add(body); world.add(actor); owner.setActor(actor);
  return { owner, world, source, floor, actor, body };
}

describe("covered-room probe ownership", () => {
  it("prepares the capture off-scene and restores the output target while shader readiness is pending", async () => {
    let finish!: (scene: THREE.Scene) => void;
    let target: THREE.WebGLRenderTarget | null = new THREE.WebGLRenderTarget(16, 16);
    const previousTarget = target;
    let compiledScene!: THREE.Scene;
    let targetDispose!: ReturnType<typeof vi.spyOn>;
    const renderer = {
      getRenderTarget: () => target,
      getActiveCubeFace: () => 3,
      getActiveMipmapLevel: () => 2,
      setRenderTarget: vi.fn((next: THREE.WebGLRenderTarget | null) => { target = next; }),
      compileAsync: vi.fn((scene: THREE.Scene) => {
        compiledScene = scene;
        expect(target).not.toBe(previousTarget);
        targetDispose = vi.spyOn(target!, "dispose");
        return new Promise<THREE.Scene>(resolve => { finish = resolve; });
      })
    };
    const h = setup(renderer as unknown as THREE.WebGLRenderer);
    const group = new THREE.Group(); group.visible = false;
    const practical = new THREE.PointLight(0xffffff, 2, 4); group.add(practical); h.world.add(group);
    const preparation = h.owner.prepareForEntry();
    expect(target).toBe(previousTarget);
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(previousTarget, 3, 2);
    expect(h.body.material).toBe(h.source);
    expect(fake.calls).toEqual([]);
    const captureLight = compiledScene.children.find(object => object instanceof THREE.PointLight) as THREE.PointLight;
    expect(captureLight).toMatchObject({ visible: true, intensity: 0 });
    finish(compiledScene);
    await preparation;
    expect(targetDispose).toHaveBeenCalledOnce();
    expect(h.owner.diagnostics()).toMatchObject({ active: false, published: 1, pendingProbes: 0 });
    expect(h.body.material).toBe(h.source);
    expect(h.world.children).toHaveLength(3);
    group.visible = true;
    h.owner.update(new THREE.Vector3(0, 1, 0), { ...frame, practicalLightIntensity: 1 });
    h.owner.render(true);
    expect(captureLight).toMatchObject({ visible: true, intensity: 2 });
    expect(compiledScene.children.filter(object => object instanceof THREE.PointLight)).toHaveLength(1);
    expect(practical.intensity).toBe(2);
    h.owner.dispose(); previousTarget.dispose();
  });

  it("releases a failed capture preparation without publishing or baking after disposal", async () => {
    let reject!: (error: Error) => void;
    let current: THREE.WebGLRenderTarget | null = null;
    let dispose!: ReturnType<typeof vi.spyOn>;
    const renderer = {
      getRenderTarget: () => current, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
      setRenderTarget: (next: THREE.WebGLRenderTarget | null) => { current = next; },
      compileAsync: () => {
        dispose = vi.spyOn(current!, "dispose");
        return new Promise<THREE.Scene>((_resolve, rejectPromise) => { reject = rejectPromise; });
      }
    };
    const h = setup(renderer as unknown as THREE.WebGLRenderer);
    const preparation = h.owner.prepareForEntry();
    expect(current).toBeNull();
    h.owner.dispose();
    reject(new Error("shader readiness failed"));
    await expect(preparation).rejects.toThrow("shader readiness failed");
    expect(dispose).toHaveBeenCalledOnce();
    expect(fake.calls).toEqual([]);
    expect(h.owner.diagnostics().published).toBe(0);
  });

  it("restores exact actor material references before a pending or failed variant compile", async () => {
    const h = setup();
    const materials = [h.source, h.source];
    h.body.material = materials;
    let finish!: () => void;
    const preparation = h.owner.prepareActorVariant(() => {
      expect(h.body.material).not.toBe(materials);
      expect((h.body.material as THREE.Material[])[0].userData.nevaShelterReceiver).toBe(true);
      return new Promise<void>(resolve => { finish = resolve; });
    });
    expect(h.body.material).toBe(materials);
    finish(); await preparation;
    expect(() => h.owner.prepareActorVariant(() => { throw new Error("compile submission failed"); }))
      .toThrow("compile submission failed");
    expect(h.body.material).toBe(materials);
    h.owner.dispose();
  });

  it("publishes only a completed grid and preserves outside actors and world light selection", () => {
    const h = setup();
    h.owner.update(new THREE.Vector3(20, 1, 20), frame);
    h.owner.render();
    expect(fake.calls).toEqual([]);
    expect(h.body.material).toBe(h.source);
    h.owner.update(new THREE.Vector3(0, 1, 0), frame);
    const uniforms = shader(h.floor.material as THREE.Material).uniforms;
    for (let index = 0; index < 7; index++) h.owner.render(true);
    expect(uniforms.nevaShelterReady.value).toBe(0);
    expect(uniforms.nevaShelterSH.value).toBeNull();
    h.owner.render(true);
    const published = uniforms.nevaShelterSH.value as THREE.Texture;
    expect(published).toBeInstanceOf(THREE.Texture);
    expect(uniforms.nevaShelterReady.value).toBe(1);
    expect(h.owner.diagnostics()).toMatchObject({ published: 1, pendingProbes: 0, captureMeshes: 1 });
    expect(h.world.children).toHaveLength(2);
    expect(h.body.material).not.toBe(h.source);
    h.owner.update(new THREE.Vector3(0, 1, 0), { ...frame, ambientDaylight: 0, practicalLightIntensity: 1 });
    h.owner.render(true);
    expect(uniforms.nevaShelterSH.value).toBe(published);
    expect(h.owner.diagnostics().pendingProbes).toBe(7);
    h.owner.update(new THREE.Vector3(20, 1, 20), frame);
    expect(h.body.material).toBe(h.source);
    h.owner.dispose();
  });

  it("disables low-tier sampling and resets context resources without disposing borrowed geometry/maps", () => {
    const h = setup();
    const geometryDispose = vi.spyOn(h.floor.geometry, "dispose");
    const sourceDispose = vi.spyOn(h.source, "dispose");
    h.owner.update(new THREE.Vector3(0, 1, 0), frame);
    for (let index = 0; index < 8; index++) h.owner.render(true);
    const uniforms = shader(h.floor.material as THREE.Material).uniforms;
    const published = uniforms.nevaShelterSH.value as THREE.Texture;
    const dispose = vi.spyOn(published, "dispose");
    h.owner.setQuality("low"); h.owner.update(new THREE.Vector3(0, 1, 0), frame);
    expect(uniforms.nevaShelterReady.value).toBe(0);
    expect(h.body.material).toBe(h.source);
    h.owner.reset();
    expect(dispose).toHaveBeenCalledOnce();
    expect(uniforms.nevaShelterSH.value).toBeNull();
    h.owner.dispose(); h.owner.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(sourceDispose).not.toHaveBeenCalled();
  });

  it("keeps batching/skinning position and atmosphere hooks while replacing ambient energy only inside bounds", () => {
    const h = setup();
    const program = shader(h.floor.material as THREE.Material);
    expect(program.vertexShader).toContain("batchingMatrix * nevaShelterPosition");
    expect(program.vertexShader).toContain("instanceMatrix * nevaShelterPosition");
    expect(program.vertexShader).toContain("vNevaCloudWorldPosition");
    expect(program.fragmentShader).toContain("irradiance = mix(irradiance, nevaShelterIrradiance");
    expect(program.fragmentShader).toContain("iblIrradiance *= 1.0 - nevaShelterWeight");
    expect(program.fragmentShader).toContain("nevaCloudSunlight(vNevaCloudWorldPosition)");
    expect(shelterProbeSamplingChunk()).not.toContain("uniform vec3 probesMin");
    const drifted = h.source.clone();
    drifted.onBeforeCompile = shader => { shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_end>", ""); };
    const clone = cloneShelterReceiver(drifted, program.uniforms as unknown as ShelterProbeUniforms);
    expect(() => shader(clone)).toThrow("Expected one #include <lights_fragment_end>");
    clone.dispose(); drifted.dispose(); h.owner.dispose();
  });
});
