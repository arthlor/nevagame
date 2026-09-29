import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { FARMHOUSE_INTERIOR_BOUNDS, FARMHOUSE_INTERIOR_DOOR, FARMHOUSE_INTERIOR_ORIGIN,
  FARMHOUSE_INTERIOR_PROPS, FARMHOUSE_WAKE_POSE } from "../../src/world/FarmhouseInterior";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import { staticPoseIsClear } from "../../src/physics/StaticCollision";
import { ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { GameCamera } from "../../src/render/camera/GameCamera";

const room = new THREE.Object3D();
room.position.copy(new THREE.Vector3(FARMHOUSE_INTERIOR_ORIGIN.x, FARMHOUSE_INTERIOR_ORIGIN.y, FARMHOUSE_INTERIOR_ORIGIN.z));
const collisions = [
  ...projectAssetCollision(ASSET_IDS.INTERIOR_FARMHOUSE_SHELL, room, "room"),
  ...FARMHOUSE_INTERIOR_PROPS.flatMap(p => {
    const root = new THREE.Object3D();
    root.position.set(p.x, p.y, p.z); root.rotation.y = p.rotationY; root.scale.setScalar(p.scale ?? 1);
    return projectAssetCollision(p.assetId, root, p.id);
  })
];

describe("farmhouse room polish", () => {
  it("leaves a continuous clear walk between entry, waking, books, provisions and hearth", () => {
    const entry = FARMHOUSE_INTERIOR_DOOR.enterSpawn;
    const destinations = [FARMHOUSE_WAKE_POSE, { x: 236.4, z: -240.2 },
      { x: 243.3, z: -242.2 }, { x: 243.3, z: -238.8 }, { x: 240, z: -238.2 }];
    const minX = FARMHOUSE_INTERIOR_BOUNDS.minX + .8, minZ = FARMHOUSE_INTERIOR_BOUNDS.minZ + .8;
    const key = (p: { x: number; z: number }) => `${Math.round((p.x - minX) * 10)}:${Math.round((p.z - minZ) * 10)}`;
    const visited = new Set([key(entry)]);
    const queue: Array<{ x: number; z: number }> = [entry];
    for (let i = 0; i < queue.length; i++) {
      for (const [dx, dz] of [[.1, 0], [-.1, 0], [0, .1], [0, -.1]]) {
        const p = { x: queue[i].x + dx, z: queue[i].z + dz };
        if (p.x < minX || p.z < minZ || p.x > FARMHOUSE_INTERIOR_BOUNDS.maxX - .8
          || p.z > FARMHOUSE_INTERIOR_BOUNDS.maxZ - .8 || visited.has(key(p))
          || !staticPoseIsClear(collisions, p, FARMHOUSE_INTERIOR_BOUNDS.floorY, .4)) continue;
        visited.add(key(p)); queue.push(p);
      }
    }
    for (const end of destinations) expect(visited.has(key(end)), `No clear walk to ${JSON.stringify(end)}`).toBe(true);
    expect(staticPoseIsClear(collisions, FARMHOUSE_INTERIOR_DOOR, FARMHOUSE_INTERIOR_BOUNDS.floorY, .4)).toBe(true);
    expect(staticPoseIsClear(collisions, { x: room.position.x, z: room.position.z + 3.8 }, .17, .4)).toBe(false);
  });

  it("keeps the orbit and zoom envelope inside the actual walls and below the beams", () => {
    const camera = new GameCamera();
    camera.setReducedMotion(true);
    camera.handleResize(1024, 600);
    for (const point of [FARMHOUSE_INTERIOR_DOOR.enterSpawn, FARMHOUSE_WAKE_POSE,
      { x: 236.4, y: .67, z: -240.2 }, { x: 243.3, y: .67, z: -242.2 }]) {
      for (let i = 0; i < 24; i++) {
        camera.update(new THREE.Vector3(point.x, point.y, point.z), "on-foot", 1 / 60,
          { orbitDeltaX: 90, orbitDeltaY: i % 2 ? -60 : 60, zoomDelta: i % 2 ? -250 : 250, isOrbiting: true });
        const p = camera.camera.position;
        expect(p.y).toBeLessThanOrEqual(3.34 - .32 + .001);
        expect(p.x).toBeGreaterThanOrEqual(235.15 + .32 - .001);
        expect(p.x).toBeLessThanOrEqual(244.85 - .32 + .001);
        expect(p.z).toBeGreaterThanOrEqual(-243.65 + .32 - .001);
        expect(p.z).toBeLessThanOrEqual(-236.35 - .32 + .001);
      }
    }
  });

  it("rests provisions and the compass on published furniture surfaces using their real pivots", async () => {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
    const models = new Map<string, THREE.Group>();
    const load = async (id: string) => {
      if (models.has(id)) return models.get(id)!;
      const p = FARMHOUSE_INTERIOR_PROPS.find(prop => prop.id === id)!;
      const doc = await io.read(new URL(`../../public/assets/models/${p.assetId}.glb`, import.meta.url).pathname);
      const root = new THREE.Group();
      for (const node of doc.getRoot().listNodes()) for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        const accessor = primitive.getAttribute("POSITION");
        const positions = accessor?.getArray();
        if (!positions) continue;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3, accessor!.getNormalized()));
        const indices = primitive.getIndices()?.getArray();
        if (indices) geometry.setIndex(Array.from(indices));
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
        mesh.matrix.fromArray(node.getWorldMatrix()); mesh.matrixAutoUpdate = false; root.add(mesh);
      }
      root.position.set(p.x, p.y, p.z); root.rotation.y = p.rotationY; root.scale.setScalar(p.scale ?? 1);
      root.updateMatrixWorld(true); models.set(id, root); return root;
    };
    try {
      for (const [itemId, furnitureId] of [
        ["interior_bread_loaf", "interior_dining_table"], ["interior_pie", "interior_dining_table"],
        ["interior_carrot", "interior_sideboard"], ["interior_corn", "interior_sideboard"],
        ["interior_apple", "interior_sideboard"], ["interior_compass", "interior_side_table"]
      ]) {
        const item = await load(itemId), surface = await load(furnitureId);
        const ray = new THREE.Raycaster(new THREE.Vector3(item.position.x, 5, item.position.z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(surface, true)[0];
        expect(hit, itemId).toBeDefined();
        const bottom = new THREE.Box3().setFromObject(item).min.y;
        expect(Math.abs(bottom - hit.point.y), `${itemId} does not rest on ${furnitureId}`).toBeLessThan(.01);
      }
    } finally {
      for (const root of models.values()) root.traverse(object => {
        if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); }
      });
    }
  });
});
