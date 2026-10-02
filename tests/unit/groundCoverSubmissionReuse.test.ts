import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroundCoverRenderer } from "../../src/render/scene/GroundCoverRenderer";
import { AssetLoader } from "../../src/render/loaders/AssetLoader";
import { WorldLayout } from "../../src/world/WorldLayout";
import type { GroundCoverPlacement } from "../../src/world/WorldEnvironmentLayout";

interface SubmissionSource {
  mesh: THREE.InstancedMesh;
  relative: THREE.Matrix4;
  lodIndex: number;
  phaseAttribute: THREE.InstancedBufferAttribute;
  exposureAttribute: THREE.InstancedBufferAttribute;
}
interface SubmissionRecord {
  instances: Array<{ lodIndex: number; matrix: THREE.Matrix4; phase: number; exposure: number }>;
  renderedIndices: number[];
  lodDirty: boolean;
  meshes: SubmissionSource[];
  lodSubmissions: Array<{ renderedIndices: number[]; candidateIndices: number[] }>;
}
const renderers: GroundCoverRenderer[] = [];

async function buildCover(): Promise<{ cover: GroundCoverRenderer; record: SubmissionRecord; camera: THREE.PerspectiveCamera }> {
  const source = new THREE.Group();
  for (const level of [0, 1]) {
    const group = new THREE.Group();
    group.name = `foliage_grass_a_LOD${level}`;
    for (const part of [0, 1]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
      mesh.position.set(part * 0.25, level * 0.1, 0);
      group.add(mesh);
    }
    source.add(group);
  }
  vi.spyOn(AssetLoader, "loadModel").mockResolvedValue(source);
  vi.spyOn(WorldLayout, "terrainHeight").mockReturnValue(0);
  vi.spyOn(WorldLayout, "terrainNormal").mockReturnValue(new THREE.Vector3(0, 1, 0));
  const placements: GroundCoverPlacement[] = Array.from({ length: 40 }, (_, i) => ({
    id: `submission.grass.${i}`, origin: "seeded-fill", category: "grass",
    assetId: "foliage_grass_a", x: i % 5 - 2, z: (i % 2 ? 1 : -1) * (i % 4 < 2 ? 10 : 30),
    rotationY: i * 0.17, scale: [1, 1, 1]
  }));
  const cover = new GroundCoverRenderer("high");
  renderers.push(cover);
  await cover.build(placements);
  cover.update(0, 0);
  const record = (cover as unknown as { records: SubmissionRecord[] }).records[0];
  const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
  camera.lookAt(0, 0, -1);
  return { cover, record, camera };
}

function expectOriginalSubmission(record: SubmissionRecord): void {
  const expectedMatrix = new THREE.Matrix4();
  const actualMatrix = new THREE.Matrix4();
  for (const source of record.meshes) {
    // This is the original per-material selection contract, including order.
    const expected = record.renderedIndices.filter(index => record.instances[index].lodIndex === source.lodIndex);
    expect(source.mesh.count).toBe(expected.length);
    for (let slot = 0; slot < expected.length; slot++) {
      const instance = record.instances[expected[slot]];
      expectedMatrix.multiplyMatrices(instance.matrix, source.relative);
      source.mesh.getMatrixAt(slot, actualMatrix);
      expect(actualMatrix.elements).toEqual(Array.from(new Float32Array(expectedMatrix.elements)));
      expect(source.phaseAttribute.getX(slot)).toBeCloseTo(instance.phase, 6);
      expect(source.exposureAttribute.getX(slot)).toBeCloseTo(instance.exposure, 6);
    }
  }
}

afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.dispose();
  vi.restoreAllMocks();
});

describe("ground-cover shared LOD submission", () => {
  it("preserves every material's instance order, transform and wind attributes across view and quality changes", async () => {
    const { cover, record, camera } = await buildCover();
    for (const quality of ["low", "medium", "high"] as const) {
      cover.setQuality(quality);
      cover.update(0, 0);
      for (const direction of [-1, 1, -1, 1]) {
        camera.lookAt(0, 0, direction);
        cover.updateRenderVisibility(camera);
        expect(record.renderedIndices.length).toBeGreaterThan(0);
        expectOriginalSubmission(record);
      }
    }
  });

  it("refreshes all parts when only LOD changes and leaves unchanged levels' GPU buffers untouched", async () => {
    const { cover, record, camera } = await buildCover();
    cover.updateRenderVisibility(camera);
    const selected = [...record.renderedIndices];
    const versions = record.meshes.map(source => source.mesh.instanceMatrix.version);
    cover.updateRenderVisibility(camera);
    expect(record.meshes.map(source => source.mesh.instanceMatrix.version)).toEqual(versions);
    for (const index of selected) record.instances[index].lodIndex = 1;
    record.lodDirty = true;
    cover.updateRenderVisibility(camera);
    expect(record.renderedIndices).toEqual(selected);
    expectOriginalSubmission(record);
    expect(record.meshes.filter(source => source.lodIndex === 0).map(source => source.mesh.count)).toEqual([0, 0]);
    expect(record.meshes.filter(source => source.lodIndex === 1).map(source => source.mesh.count)).toEqual([selected.length, selected.length]);
    const changedVersions = record.meshes.map(source => source.mesh.instanceMatrix.version);
    record.lodDirty = true;
    cover.updateRenderVisibility(camera);
    expect(record.meshes.map(source => source.mesh.instanceMatrix.version)).toEqual(changedVersions);
  });

  it("reuses exactly two buffers per level through visible, empty and restored submissions", async () => {
    const { cover, record, camera } = await buildCover();
    const buffers = record.lodSubmissions.map(submission => new Set([submission.renderedIndices, submission.candidateIndices]));
    for (const target of [[0, 0, -1], [0, 0, 1], [0, 1, 0], [0, 0, -1], [0, 0, 1]]) {
      camera.lookAt(new THREE.Vector3(...target));
      cover.updateRenderVisibility(camera);
      expectOriginalSubmission(record);
      record.lodSubmissions.forEach((submission, level) => {
        expect(buffers[level].has(submission.renderedIndices)).toBe(true);
        expect(buffers[level].has(submission.candidateIndices)).toBe(true);
        expect(submission.renderedIndices).not.toBe(submission.candidateIndices);
      });
      if (target[1] === 1) expect(record.meshes.every(source => source.mesh.count === 0)).toBe(true);
    }
  });
});
