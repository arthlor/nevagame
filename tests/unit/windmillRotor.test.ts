import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorldScene } from "../../src/render/scene/WorldScene";
import { EditableStaticSources } from "../../src/render/scene/EditableStaticSources";
import { WorldLayout } from "../../src/world/WorldLayout";

interface RotorHarness {
  configureWindmillRotor: (root: THREE.Object3D) => void;
  windmillRotors: THREE.Object3D[];
}

function rotorHarness(): RotorHarness {
  return Object.assign(Object.create(WorldScene.prototype), {
    windmillRotors: []
  }) as RotorHarness;
}

function mesh(name?: string): THREE.Mesh {
  const object = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  if (name) object.name = name;
  return object;
}

function buildWindmill(): {
  root: THREE.Group;
  rotor0: THREE.Group;
  rotor1: THREE.Group;
  hub0: THREE.Mesh;
  hub1: THREE.Mesh;
} {
  const root = new THREE.Group();
  const lod0 = new THREE.Group();
  lod0.name = "building_windmill_a_LOD0";
  const rotor0 = new THREE.Group();
  rotor0.name = "windmill_rotor";
  const hub0 = mesh("windmill_hub");
  rotor0.add(hub0);
  lod0.add(rotor0);
  const lod1 = new THREE.Group();
  lod1.name = "building_windmill_a_LOD1";
  const rotor1 = new THREE.Group();
  rotor1.name = "building_windmill_a_LOD1_rotor";
  const hub1 = mesh("building_windmill_a_LOD1_windmill_hub");
  rotor1.add(hub1);
  lod1.add(rotor1);
  root.add(lod0, lod1);
  return { root, rotor0, rotor1, hub0, hub1 };
}

afterEach(() => vi.restoreAllMocks());

describe("windmill rotor animation pivots", () => {
  it("collects every LOD level's authored rotor without reparenting its meshes", () => {
    const world = rotorHarness();
    const { root, rotor0, rotor1, hub0, hub1 } = buildWindmill();

    world.configureWindmillRotor(root);

    expect(world.windmillRotors).toEqual([rotor0, rotor1]);
    expect(hub0.parent).toBe(rotor0);
    expect(hub1.parent).toBe(rotor1);
    expect(root.getObjectByName("windmill_runtime_rotor")).toBeUndefined();
  });

  it("marks rotor pivots and their meshes dynamic for batching and shadows", () => {
    const world = rotorHarness();
    const { root, rotor0, rotor1, hub0, hub1 } = buildWindmill();

    world.configureWindmillRotor(root);

    expect(rotor0.userData.dynamicPresentation).toBe(true);
    expect(rotor1.userData.dynamicPresentation).toBe(true);
    expect(hub0.userData.dynamicPresentation).toBe(true);
    expect(hub1.userData.dynamicPresentation).toBe(true);
  });

  it("keeps a LOD controller that owns dynamic rotor meshes and flattens static-only ones", () => {
    const world = Object.assign(Object.create(WorldScene.prototype), {
      staticPrefabGroup: new THREE.Group(),
      staticLodBatchInstances: [],
      staticLodPlacements: new Map(),
      staticBatchChunks: [],
      visibilityAnchor: new THREE.Vector3(),
      qualityLevel: 2,
      // DEV batching hides merged source meshes through this owner and tracks
      // the resulting BatchedMeshes; the real WorldScene fields are class
      // initializers, so an `Object.create` fixture must supply them or the
      // merge path dereferences undefined.
      editableStaticSources: new EditableStaticSources(),
      staticPrefabBatches: new Set<THREE.BatchedMesh>(),
      scene: (() => {
        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0xffffff, 1, 1000);
        return scene;
      })()
    }) as unknown as {
      staticPrefabGroup: THREE.Group;
      mergeStaticPrefabMeshes: () => void;
    };
    vi.spyOn(WorldLayout, "islandAt").mockReturnValue("island.neva");
    const material = new THREE.MeshStandardMaterial();
    const stamp = (lod: THREE.LOD): void => {
      for (const distance of [0, 10]) {
        const level = new THREE.Group();
        level.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
        lod.addLevel(level, distance);
        level.visible = distance === 0;
      }
    };
    const rotorLod = new THREE.LOD();
    stamp(rotorLod);
    const rotor = new THREE.Group();
    rotor.name = "windmill_rotor";
    rotor.userData.dynamicPresentation = true;
    const hub = mesh("windmill_hub");
    hub.userData.dynamicPresentation = true;
    rotor.add(hub);
    rotorLod.levels[0].object.add(rotor);
    const staticLod = new THREE.LOD();
    stamp(staticLod);
    world.staticPrefabGroup.add(rotorLod, staticLod);

    world.mergeStaticPrefabMeshes();

    expect(rotorLod.parent).toBe(world.staticPrefabGroup);
    if (import.meta.env.DEV) {
      // DEV keeps every LOD controller (layout-editor picks need live meshes)
      // and hides the merged sources on the layer mask instead of removing them.
      // Production removes the static controller so a camera update cannot
      // reveal its unbatched fallback levels and restore hundreds of draw calls.
      expect(staticLod.parent).toBe(world.staticPrefabGroup);
      const staticMeshes: THREE.Mesh[] = [];
      staticLod.traverse((object) => {
        if (object instanceof THREE.Mesh) staticMeshes.push(object);
      });
      expect(staticMeshes.length).toBeGreaterThan(0);
      for (const mesh of staticMeshes) expect(mesh.layers.mask).toBe(0);
    } else {
      expect(staticLod.parent).toBeNull();
    }
    expect(hub.parent).toBe(rotor);
    expect(rotorLod.levels[0].object.children).toContain(rotor);
  });
});
