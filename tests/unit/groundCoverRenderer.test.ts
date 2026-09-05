import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroundCoverRenderer } from "../../src/render/scene/GroundCoverRenderer";
import { AssetLoader } from "../../src/render/loaders/AssetLoader";
import { createWeatherMotionSignal } from "../../src/render/motion/WeatherMotionSignal";
import { WorldLayout } from "../../src/world/WorldLayout";
import type { GroundCoverPlacement } from "../../src/world/WorldEnvironmentLayout";

interface CoverRecord {
  visibleIndices: number[];
  renderedIndices: number[];
  instances: Array<{ phase: number; matrix: THREE.Matrix4; bounds: THREE.Sphere }>;
}

const renderers: GroundCoverRenderer[] = [];

async function buildCover(points: Array<[number, number]>, size = 1): Promise<{
  cover: GroundCoverRenderer; mesh: THREE.InstancedMesh; record: CoverRecord
}> {
  const source = new THREE.Group();
  source.add(new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshStandardMaterial()));
  vi.spyOn(AssetLoader, "loadModel").mockResolvedValue(source);
  vi.spyOn(WorldLayout, "terrainHeight").mockReturnValue(0);
  const placements: GroundCoverPlacement[] = points.map(([x, z], index) => ({
    id: `test.grass.${index}`, origin: "seeded-fill", category: "grass",
    assetId: "foliage_grass_a", x, z, rotationY: 0, scale: [1, 1, 1]
  }));
  const cover = new GroundCoverRenderer("high");
  renderers.push(cover);
  await cover.build(placements);
  cover.update(0, 0);
  const record = (cover as unknown as { records: CoverRecord[] }).records[0];
  return { cover, mesh: cover.group.children[0] as THREE.InstancedMesh, record };
}

function cameraLookingAt(direction: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
  camera.lookAt(0, 0, direction);
  return camera;
}

afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.dispose();
  vi.restoreAllMocks();
});

describe("ground-cover frustum submission", () => {
  it("culls off-screen cover without changing stable membership, transforms, or wind phases", async () => {
    const points: Array<[number, number]> = Array.from({ length: 20 }, (_, index) => [index % 5 - 2, index % 2 ? 10 : -10]);
    const { cover, mesh, record } = await buildCover(points);
    const selected = [...record.visibleIndices];
    expect(selected.length).toBeGreaterThan(4);
    const camera = cameraLookingAt(-1);
    cover.updateRenderVisibility(camera);
    const first = [...record.renderedIndices];
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThan(selected.length);
    expect(mesh.count).toBe(first.length);
    for (const [drawIndex, sourceIndex] of first.entries()) {
      const instance = record.instances[sourceIndex];
      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(drawIndex, matrix);
      expect(matrix.elements[14]).toBeLessThan(0);
      expect(matrix.elements).toEqual(Array.from(new Float32Array(instance.matrix.elements)));
      expect(mesh.geometry.getAttribute("instancePhase").getX(drawIndex)).toBeCloseTo(instance.phase, 6);
    }
    const version = mesh.instanceMatrix.version;
    cover.updateRenderVisibility(camera);
    expect(mesh.instanceMatrix.version).toBe(version);
    camera.lookAt(0, 0, 1);
    cover.updateRenderVisibility(camera);
    expect(record.visibleIndices).toEqual(selected);
    expect(record.renderedIndices.length).toBeGreaterThan(0);
    expect(record.renderedIndices.every((index) => !first.includes(index))).toBe(true);
    camera.lookAt(0, 0, -1);
    cover.updateRenderVisibility(camera);
    expect(record.renderedIndices).toEqual(first);
    expect(record.visibleIndices).toEqual(selected);
  });

  it("keeps complete edge-intersecting geometry even when its origin is outside", async () => {
    const { cover, mesh, record } = await buildCover(Array.from({ length: 20 }, () => [10.7, -10]), 2);
    cover.updateRenderVisibility(cameraLookingAt(-1));
    expect(mesh.count).toBe(record.visibleIndices.length);
    expect(mesh.count).toBeGreaterThan(0);
  });

  it("pads bounds for current wind and motion, retaining clumps that can bend into frame", async () => {
    const { cover, mesh, record } = await buildCover(Array.from({ length: 20 }, () => [10.7, -10]), 0.1);
    const camera = cameraLookingAt(-1);
    const calm = createWeatherMotionSignal();
    cover.updateWind(calm, 0, 1);
    cover.updateRenderVisibility(camera);
    expect(mesh.count).toBe(0);
    cover.updateWind({ ...calm, normalizedStrength: 1.5, gust: 1 }, 0, 1);
    cover.updateRenderVisibility(camera);
    expect(mesh.count).toBe(record.visibleIndices.length);
    expect(mesh.count).toBeGreaterThan(0);
    cover.updateWind({ ...calm, normalizedStrength: 1.5, gust: 1 }, 0, 0);
    cover.updateRenderVisibility(camera);
    expect(mesh.count).toBe(0);
  });

  it("handles the cover group's world transform without reshuffling its local instances", async () => {
    const { cover, mesh, record } = await buildCover(Array.from({ length: 20 }, () => [0, -10]));
    const selected = [...record.visibleIndices];
    const camera = cameraLookingAt(-1);
    cover.updateRenderVisibility(camera);
    expect(mesh.count).toBeGreaterThan(0);
    cover.group.position.z = 30;
    cover.updateRenderVisibility(camera);
    expect(mesh.count).toBe(0);
    expect(record.visibleIndices).toEqual(selected);
  });

  it("releases the instance buffers as well as geometry and materials", async () => {
    const { cover, mesh } = await buildCover([[0, -10], [1, -10]]);
    const dispose = vi.spyOn(mesh, "dispose");
    cover.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(cover.group.children).toEqual([]);
  });
});
