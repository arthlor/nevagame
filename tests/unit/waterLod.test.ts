import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import { WaterLodSurface, waterLodRanges, type WaterLodRanges } from "../../src/render/water/WaterLod";
import { bandLodWeight, WATER_WAVE_CONFIG, finestWaterCellMeters } from "../../src/render/water/WaterSurface";

interface Node {
  x: number;
  z: number;
  cell: number;
  level: number;
  cells: number;
}

const EXTENT = { minX: -1100, minZ: -1050, maxX: 1800, maxZ: 1050 };

function selectedNodes(surface: WaterLodSurface): Node[] {
  const nodes: Node[] = [];
  const settings = surface.settings;
  for (const [mesh, cells] of [[surface.full, settings.patchCells], [surface.quarter, settings.patchCells / 2]] as const) {
    const array = (mesh.geometry.getAttribute("aNode") as THREE.InstancedBufferAttribute).array as Float32Array;
    for (let index = 0; index < mesh.geometry.instanceCount; index += 1) {
      nodes.push({
        x: array[index * 4]!,
        z: array[index * 4 + 1]!,
        cell: array[index * 4 + 2]!,
        level: array[index * 4 + 3]!,
        cells
      });
    }
  }
  return nodes;
}

/** CPU replica of `nevaLodLattice` in WATER_LOD_VERTEX_GLSL. */
function morphedVertex(node: Node, i: number, j: number, camera: THREE.Vector3, ranges: WaterLodRanges): [number, number] {
  const wx = node.x + i * node.cell;
  const wz = node.z + j * node.cell;
  const morphRange = ranges.morph[node.level]!;
  const distance = Math.hypot(camera.x - wx, camera.y, camera.z - wz);
  const morph = THREE.MathUtils.clamp((distance - morphRange.x) / (morphRange.y - morphRange.x), 0, 1);
  const gi = i - (i % 2) * morph;
  const gj = j - (j % 2) * morph;
  return [node.x + gi * node.cell, node.z + gj * node.cell];
}

function lookingCamera(position: THREE.Vector3, target: THREE.Vector3, fov = 60): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(fov, 16 / 9, 0.3, 6000);
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

const CAMERAS: ReadonlyArray<readonly [THREE.Vector3, THREE.Vector3]> = [
  [new THREE.Vector3(96, 14.5, 88), new THREE.Vector3(71, 1.4, 64)],
  [new THREE.Vector3(80, 9.6, 50), new THREE.Vector3(47.7, 0.6, 100.5)],
  [new THREE.Vector3(-129, 30, 111), new THREE.Vector3(-92, 13.8, 74)],
  [new THREE.Vector3(300.5, 3.2, 211.25), new THREE.Vector3(360, 0, 260)],
  [new THREE.Vector3(10, 180, 10), new THREE.Vector3(12, 0, 40)]
];

describe("camera-centred water LOD", () => {
  it("satisfies the crack-free ring inequality with the shipped settings", () => {
    const ranges = waterLodRanges();
    const settings = CANONICAL_RENDER_CONFIG.waterSurface.lod;
    expect(ranges.ranges).toHaveLength(settings.levels);
    for (let level = 0; level < settings.levels; level += 1) {
      expect(ranges.cellSizes[level]).toBe(settings.finestCellMeters * 2 ** level);
      expect(ranges.morph[level]!.y).toBe(ranges.ranges[level]);
      if (level > 0) {
        expect(ranges.morph[level]!.x)
          .toBeGreaterThanOrEqual(ranges.ranges[level - 1]! + ranges.nodeSizes[level - 1]! * Math.SQRT2);
      }
    }
    expect(() => waterLodRanges({ ...settings, rangeScale: 2, morphStartRatio: 0.5 })).toThrow(/morphing inside/);
  });

  it.each(CAMERAS.map((camera, index) => [index, camera] as const))(
    "leaves no T-junction between rings (camera %i)",
    (_index, [position, target]) => {
      const material = new THREE.ShaderMaterial();
      const surface = new WaterLodSurface(material, EXTENT);
      try {
        const camera = lookingCamera(position, target);
        surface.update(camera);
        const nodes = selectedNodes(surface);
        expect(nodes.length).toBeGreaterThan(8);
        const key = (x: number, z: number) => `${x.toFixed(4)},${z.toFixed(4)}`;
        const boundary = nodes.map((node) => {
          const vertices = new Set<string>();
          const size = node.cells * node.cell;
          for (let step = 0; step <= node.cells; step += 1) {
            for (const [i, j] of [[step, 0], [step, node.cells], [0, step], [node.cells, step]] as const) {
              const [x, z] = morphedVertex(node, i, j, position, surface.ranges);
              vertices.add(key(x, z));
            }
          }
          return { node, size, vertices };
        });
        let sharedEdgesChecked = 0;
        for (const a of boundary) {
          for (const vertexKey of a.vertices) {
            const [x, z] = vertexKey.split(",").map(Number) as [number, number];
            for (const b of boundary) {
              if (a === b) continue;
              const { node, size } = b;
              const onVertical = (Math.abs(x - node.x) < 1e-6 || Math.abs(x - (node.x + size)) < 1e-6)
                && z > node.z + 1e-6 && z < node.z + size - 1e-6;
              const onHorizontal = (Math.abs(z - node.z) < 1e-6 || Math.abs(z - (node.z + size)) < 1e-6)
                && x > node.x + 1e-6 && x < node.x + size - 1e-6;
              if (!onVertical && !onHorizontal) continue;
              sharedEdgesChecked += 1;
              expect(b.vertices.has(vertexKey), `vertex ${vertexKey} of level ${a.node.level} on level ${b.node.level} edge`)
                .toBe(true);
            }
          }
        }
        expect(sharedEdgesChecked).toBeGreaterThan(50);
      } finally {
        surface.dispose();
        material.dispose();
      }
    }
  );

  it("covers the visible sea exactly once", () => {
    const material = new THREE.ShaderMaterial();
    const surface = new WaterLodSurface(material, EXTENT);
    try {
      // Straight down: every node near the camera is in the frustum.
      const position = new THREE.Vector3(40, 60, 60);
      surface.update(lookingCamera(position, new THREE.Vector3(40, 0, 60.001), 100));
      const nodes = selectedNodes(surface);
      for (let x = -30; x <= 110; x += 3.7) {
        for (let z = -10; z <= 130; z += 3.7) {
          const covering = nodes.filter((node) => {
            const size = node.cells * node.cell;
            return x >= node.x && x < node.x + size && z >= node.z && z < node.z + size;
          });
          expect(covering.length, `coverage at ${x}, ${z}`).toBe(1);
        }
      }
    } finally {
      surface.dispose();
      material.dispose();
    }
  });

  it("keeps the finest ring near the camera and caps Low one ring coarser", () => {
    const material = new THREE.ShaderMaterial();
    const surface = new WaterLodSurface(material, EXTENT);
    try {
      const camera = lookingCamera(new THREE.Vector3(96, 14.5, 88), new THREE.Vector3(71, 1.4, 64));
      surface.setQuality("high");
      surface.update(camera);
      const high = selectedNodes(surface);
      expect(high.some((node) => node.level === 0)).toBe(true);
      surface.setQuality("low");
      surface.update(camera);
      const low = selectedNodes(surface);
      expect(Math.min(...low.map((node) => node.level))).toBe(CANONICAL_RENDER_CONFIG.waterSurface.lod.finestLevel.low);
      const triangles = (nodes: Node[]) => nodes.reduce((sum, node) => sum + node.cells * node.cells * 2, 0);
      expect(triangles(low)).toBeLessThan(triangles(high));
      // The whole visible sea is a small, bounded budget.
      expect(triangles(high)).toBeLessThan(160_000);
    } finally {
      surface.dispose();
      material.dispose();
    }
  });

  it("draws every band on the finest ring and fades each before it can alias", () => {
    const finest = finestWaterCellMeters();
    for (const band of WATER_WAVE_CONFIG.bands) {
      const k = band.wavenumber;
      expect(bandLodWeight(k, finest), `${band.id} on the finest ring`).toBe(1);
      const wavelength = (2 * Math.PI) / k;
      expect(bandLodWeight(k, wavelength / 3), `${band.id} at three cells per wavelength`).toBe(0);
    }
  });
});
