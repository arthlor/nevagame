import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { runSync } from "../../src/utils/CooperativeTask";
import { SURFACE_FIELD_ATTRIBUTE_NAMES } from "../../src/render/materials/SurfaceFieldAttributes";
import {
  createMeadowPatchData,
  createUniformMeadowPatchData,
  meadowCoverDensity,
  sampleMeadowDensity,
  sampleMeadowExclusion,
  sampleMeadowHeight,
  stampMeadowCollisionFootprints,
  stampMeadowYawedRectangle,
  stampRoadCoverageSteps,
  type MeadowCoverInputs,
  type MeadowTerrainPatch
} from "../../src/render/vegetation/MeadowFieldSource";
import { WorldLayout } from "../../src/world/WorldLayout";

const meadowGround: MeadowCoverInputs = {
  grass: 0.7, meadow: 0.3, beach: 0, wetShoreline: 0, cliff: 0, riverbed: 0,
  farm: 0, path: 0, shorelineWetness: 0, normalY: 1, height: 2
};

/** A small terrain-shaped plane carrying the attributes the terrain build writes. */
function syntheticTerrain(
  patch: MeadowTerrainPatch,
  heightAt: (x: number, z: number) => number,
  weightsAt: (x: number, z: number) => Partial<MeadowCoverInputs> & { dampSoil?: number; dry?: number } = () => ({})
): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(patch.sizeMeters, patch.sizeMeters, patch.resolution, patch.resolution);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const count = position.count;
  const weights0 = new Uint8Array(count * 4);
  const weights1 = new Uint8Array(count * 4);
  const causes = new Uint8Array(count * 4);
  const pathBlend = new Uint8Array(count);
  const dry = new Uint8Array(count);
  const byte = (value: number | undefined) => Math.round(Math.min(1, Math.max(0, value ?? 0)) * 255);
  for (let index = 0; index < count; index += 1) {
    const x = position.getX(index) + patch.center.x;
    const z = position.getZ(index) + patch.center.z;
    position.setY(index, heightAt(x, z));
    const sample = { ...meadowGround, ...weightsAt(x, z) };
    weights0.set([byte(sample.grass), byte(sample.meadow), 0, byte(sample.dampSoil)], index * 4);
    weights1.set([0, 0, byte(sample.beach), byte(sample.riverbed)], index * 4);
    causes.set([byte(sample.wetShoreline), byte(sample.cliff), byte(sample.farm), byte(sample.shorelineWetness)], index * 4);
    pathBlend[index] = byte(sample.path);
    dry[index] = byte(sample.dry);
  }
  geometry.computeVertexNormals();
  geometry.setAttribute(SURFACE_FIELD_ATTRIBUTE_NAMES.weights0, new THREE.Uint8BufferAttribute(weights0, 4, true));
  geometry.setAttribute(SURFACE_FIELD_ATTRIBUTE_NAMES.weights1, new THREE.Uint8BufferAttribute(weights1, 4, true));
  geometry.setAttribute(SURFACE_FIELD_ATTRIBUTE_NAMES.causes, new THREE.Uint8BufferAttribute(causes, 4, true));
  geometry.setAttribute("terrainPathBlend", new THREE.Uint8BufferAttribute(pathBlend, 1, true));
  geometry.setAttribute("terrainDryClimate", new THREE.Uint8BufferAttribute(dry, 1, true));
  return geometry;
}

const smallPatch: MeadowTerrainPatch = {
  id: "test.patch", islandId: "island.test", center: { x: 10, z: -6 }, sizeMeters: 16, resolution: 8
};

describe("meadow cover density", () => {
  it("grows on vegetated ground and yields to shore, farm, road core, water, rivers and steep banks", () => {
    expect(meadowCoverDensity(meadowGround)).toBeCloseTo(1, 6);
    expect(meadowCoverDensity({ ...meadowGround, grass: 0.2, meadow: 0.1 })).toBeCloseTo(0.3, 6);
    expect(meadowCoverDensity({ ...meadowGround, beach: 0.6 })).toBe(0);
    expect(meadowCoverDensity({ ...meadowGround, farm: 0.2 })).toBe(0);
    expect(meadowCoverDensity({ ...meadowGround, path: 1 })).toBe(0);
    expect(meadowCoverDensity({ ...meadowGround, riverbed: 0.5 })).toBe(0);
    expect(meadowCoverDensity({ ...meadowGround, shorelineWetness: 0.7 })).toBe(0);
    expect(meadowCoverDensity({ ...meadowGround, normalY: 0.5 })).toBe(0);
    expect(meadowCoverDensity({ ...meadowGround, height: -0.5 })).toBe(0);
    // The shoulder keeps grass intrusion; the fine ribbon raster owns the dirt edge.
    expect(meadowCoverDensity({ ...meadowGround, path: 0.36 })).toBeCloseTo(1, 6);
  });
});

describe("meadow patch data", () => {
  it("copies heights in vertex order and matches the drawn triangle surface", () => {
    const heightAt = (x: number, z: number) => Math.sin(x * 0.7) * 1.3 + Math.cos(z * 0.45) * 0.8 + 3;
    const geometry = syntheticTerrain(smallPatch, heightAt);
    const data = createMeadowPatchData(smallPatch, geometry, 0.5);
    expect(data.vertices).toBe(9);
    expect(data.originX).toBe(2);
    expect(data.originZ).toBe(-14);
    for (let iz = 0; iz < data.vertices; iz += 1) {
      for (let ix = 0; ix < data.vertices; ix += 1) {
        const x = data.originX + ix * data.step;
        const z = data.originZ + iz * data.step;
        expect(sampleMeadowHeight(data, x, z)).toBeCloseTo(heightAt(x, z), 5);
      }
    }
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.position.set(smallPatch.center.x, 0, smallPatch.center.z);
    mesh.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster();
    const rng = new THREE.Vector2();
    for (let sample = 0; sample < 40; sample += 1) {
      rng.set(((sample * 0.618034) % 1) * 15.8 + 2.1, ((sample * 0.381966) % 1) * 15.8 - 13.9);
      raycaster.set(new THREE.Vector3(rng.x, 50, rng.y), new THREE.Vector3(0, -1, 0));
      const hit = raycaster.intersectObject(mesh)[0];
      expect(hit, `ray ${sample}`).toBeDefined();
      expect(sampleMeadowHeight(data, rng.x, rng.y)).toBeCloseTo(hit.point.y, 4);
    }
  });

  it("packs density, meadow share, dryness and damp ground per vertex", () => {
    const geometry = syntheticTerrain(smallPatch, () => 2, (x) => (
      x < 6 ? { grass: 0.25, meadow: 0.75, dry: 0.4, dampSoil: 0.2 } : { beach: 1, grass: 0, meadow: 0 }
    ));
    const data = createMeadowPatchData(smallPatch, geometry, 0.5);
    const meadowVertex = (0 * data.vertices + 1) * 4;
    expect(data.cover[meadowVertex] / 255).toBeCloseTo(1, 1);
    expect(data.cover[meadowVertex + 1] / 255).toBeCloseTo(0.75, 1);
    expect(data.cover[meadowVertex + 2] / 255).toBeCloseTo(0.4, 1);
    expect(data.cover[meadowVertex + 3] / 255).toBeCloseTo(0.2, 1);
    expect(sampleMeadowDensity(data, 17, -6)).toBe(0);
    expect(sampleMeadowDensity(data, 3, -6)).toBeGreaterThan(0.95);
    expect(sampleMeadowDensity(data, 40, -6)).toBe(0);
  });

  it("rasterizes visible road coverage from the ribbon alpha only inside its triangles", () => {
    const data = createUniformMeadowPatchData(smallPatch, { density: 1, meadowShare: 0, dry: 0, damp: 0 }, 0.5);
    const road = new THREE.BufferGeometry();
    road.setAttribute("position", new THREE.Float32BufferAttribute([4, 0, -12, 16, 0, -12, 4, 0, -2], 3));
    road.setAttribute("color", new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0], 4));
    runSync(stampRoadCoverageSteps(data, road));
    expect(sampleMeadowExclusion(data, 5, -11)).toBeGreaterThan(0.85);
    expect(sampleMeadowExclusion(data, 5, -3.2)).toBeLessThan(0.25);
    expect(sampleMeadowExclusion(data, 15, -3)).toBe(0);
    expect(sampleMeadowExclusion(data, 100, 100)).toBe(1);
  });

  it("stamps yawed footprints with the same convention as the architecture envelopes", () => {
    const data = createUniformMeadowPatchData(smallPatch, { density: 1, meadowShare: 0, dry: 0, damp: 0 }, 0.25);
    const rotation = 0.6;
    stampMeadowYawedRectangle(data, 10, -6, rotation, 4, 1);
    // Local +X of an Object3D yawed by `rotation` points to (cos, 0, -sin) in world space.
    const along = (distance: number) => ({ x: 10 + Math.cos(rotation) * distance, z: -6 - Math.sin(rotation) * distance });
    const across = (distance: number) => ({ x: 10 + Math.sin(rotation) * distance, z: -6 + Math.cos(rotation) * distance });
    expect(sampleMeadowExclusion(data, along(3.5).x, along(3.5).z)).toBe(1);
    expect(sampleMeadowExclusion(data, across(0.6).x, across(0.6).z)).toBe(1);
    expect(sampleMeadowExclusion(data, across(2).x, across(2).z)).toBe(0);
    expect(sampleMeadowExclusion(data, along(4.8).x, along(4.8).z)).toBe(0);
  });

  it("clears the carpet under ground-touching colliders but not under raised ones", () => {
    const data = createUniformMeadowPatchData(smallPatch, { density: 1, meadowShare: 0, dry: 0, damp: 0 }, 0.25);
    const stamped = stampMeadowCollisionFootprints(data, [
      { kind: "box", id: "rock", center: { x: 6, y: 0.4, z: -10 }, halfExtents: { x: 1, y: 0.5, z: 1 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
      { kind: "box", id: "rail", center: { x: 14, y: 1.1, z: -2 }, halfExtents: { x: 1, y: 0.05, z: 0.1 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }
    ]);
    expect(stamped).toBe(1);
    expect(sampleMeadowExclusion(data, 6.5, -10.5)).toBe(1);
    expect(sampleMeadowExclusion(data, 14, -2)).toBe(0);
  });
});

describe("meadow data from the canonical terrain", () => {
  it("roots on the drawn Sunreach landform and keeps the sea bare", () => {
    const patch = WorldLayout.terrainPatches().find((candidate) => candidate.id === "terrain.sunreach")!;
    const geometry = WorldLayout.buildTerrainGeometry(patch.id);
    const data = createMeadowPatchData(patch, geometry, 0.5);
    geometry.dispose();
    // Texel (ix, iz) is terrain vertex ix + iz * vertices: the graded base landform.
    for (let index = 0; index < data.heights.length; index += 997) {
      const ix = index % data.vertices;
      const iz = Math.floor(index / data.vertices);
      expect(data.heights[index]).toBeCloseTo(
        WorldLayout.terrainBaseHeight(data.originX + ix * data.step, data.originZ + iz * data.step),
        3
      );
    }
    let seaVertices = 0;
    for (let index = 0; index < data.heights.length; index += 1) {
      if (data.heights[index] > -0.5) continue;
      seaVertices += 1;
      expect(data.cover[index * 4]).toBe(0);
    }
    expect(seaVertices).toBeGreaterThan(100);
    expect(data.cover.some((value, index) => index % 4 === 0 && value > 128)).toBe(true);
  }, 60_000);
});
