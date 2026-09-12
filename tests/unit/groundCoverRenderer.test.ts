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
  instances: Array<{ phase: number; exposure: number; matrix: THREE.Matrix4; bounds: THREE.Sphere }>;
}

const renderers: GroundCoverRenderer[] = [];

async function buildCover(points: Array<[number, number]>, size = 1, normal = new THREE.Vector3(0, 1, 0), sourceOverride?: THREE.Group): Promise<{
  cover: GroundCoverRenderer; mesh: THREE.InstancedMesh; record: CoverRecord
}> {
  const source = sourceOverride ?? new THREE.Group();
  if (!sourceOverride) source.add(new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshStandardMaterial()));
  vi.spyOn(AssetLoader, "loadModel").mockResolvedValue(source);
  vi.spyOn(WorldLayout, "terrainHeight").mockReturnValue(0);
  vi.spyOn(WorldLayout, "terrainNormal").mockReturnValue(normal);
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
  it("submits one grass detail level per root and keeps level selection anchored to the player", async () => {
    const source = new THREE.Group();
    for (const level of [0, 1]) {
      const group = new THREE.Group();
      group.name = `foliage_grass_a_LOD${level}`;
      group.visible = level === 0;
      group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
      source.add(group);
    }
    const points: Array<[number, number]> = Array.from({ length: 10 }, (_, i) => [0, i < 5 ? -10 : -30]);
    const { cover, record } = await buildCover(points, 1, new THREE.Vector3(0, 1, 0), source);
    const camera = cameraLookingAt(-1);
    cover.updateRenderVisibility(camera);
    const [near, far] = cover.group.children as THREE.InstancedMesh[];
    expect(near.count).toBeGreaterThan(0);
    expect(far.count).toBeGreaterThan(0);
    expect(near.count + far.count).toBe(record.renderedIndices.length);
    const counts = [near.count, far.count];
    camera.position.z = -5;
    camera.lookAt(0, 0, -20);
    cover.updateRenderVisibility(camera);
    expect([near.count, far.count]).toEqual(counts);
    cover.update(0, -25);
    cover.updateRenderVisibility(camera);
    expect(far.count).toBe(0);
    expect(near.count).toBe(record.renderedIndices.length);
  });

  it("seats distributed roots on the terrain tangent while retaining the authored scale", async () => {
    const normal = new THREE.Vector3(-0.25, 1, 0.15).normalize();
    const { record } = await buildCover([[0, 0]], 1, normal);
    const matrix = record.instances[0].matrix;
    expect(new THREE.Vector3(0, 1, 0).transformDirection(matrix).distanceTo(normal)).toBeLessThan(1e-6);
    const root = new THREE.Vector3(0.6, 0, -0.4).applyMatrix4(matrix);
    expect(root.clone().sub(new THREE.Vector3(0, 0.012, 0)).dot(normal)).toBeCloseTo(0, 6);
    expect(new THREE.Vector3().setFromMatrixScale(matrix).distanceTo(new THREE.Vector3(1, 1, 1))).toBeLessThan(1e-6);
  });

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
      expect(mesh.geometry.getAttribute("instanceExposure").getX(drawIndex)).toBeCloseTo(instance.exposure, 6);
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

  it("grounds short-cover bases using the assembly height without changing geometry or shadows", async () => {
    const { mesh } = await buildCover([[0, -10], [1, -10]]);
    const shader = {
      uniforms: { ...THREE.ShaderLib.standard.uniforms },
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader
    };
    const material = mesh.material as THREE.MeshStandardMaterial;
    (material.onBeforeCompile as unknown as (s: typeof shader) => void)(shader);
    expect(shader.vertexShader).toContain("vCoverHeight = rootedHeight");
    expect(shader.vertexShader).toContain("* part * uSwayAmplitude * 0.5 * rootWeight");
    expect(shader.vertexShader).toContain("nevaWindWorldToLocal(vec3(presenceBend.x, 0.0, presenceBend.y), coverWorld)");
    expect(shader.fragmentShader).toContain("mix(coverRootShade, 1.0, smoothstep");
    expect(shader.uniforms.coverRootShade.value).toBeGreaterThan(0.6);
    expect(shader.uniforms.coverRootShade.value).toBeLessThan(1);
    const height = mesh.geometry.getAttribute("windHeight");
    expect(Math.min(...Array.from(height.array))).toBe(0);
    expect(Math.max(...Array.from(height.array))).toBe(1);
    expect(mesh.castShadow).toBe(false);
  });

  it("releases the instance buffers as well as geometry and materials", async () => {
    const { cover, mesh } = await buildCover([[0, -10], [1, -10]]);
    const dispose = vi.spyOn(mesh, "dispose");
    cover.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(cover.group.children).toEqual([]);
  });
});
