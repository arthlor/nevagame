import * as THREE from "three";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { WorldLayout } from "../../src/world/WorldLayout";
import { createWaterDepthMap } from "../../src/render/water/CoastalOptics";

const REPO_ROOT = join(__dirname, "..", "..");

/**
 * W08.5 depth reconciliation. Optical depth is the physical water column and is
 * baked downstream of the terrain/support owner; marine/gameplay consumers keep
 * their distance-based proxy until a separately tested consumer switch is
 * approved. These tests pin the split near the source, fall, pool, outflow,
 * ocean shelves and an islet, and guard the consumer discipline.
 */
const RECONCILIATION_POINTS = [
  { name: "headwater source", x: -30, z: -152 },
  { name: "fall lip", x: -30, z: -136 },
  { name: "plunge pool", x: -30, z: -130 },
  { name: "pool outflow", x: -30, z: -124 },
  { name: "former western shelf, now mainland interior", x: -196, z: -40 },
  { name: "Gull's Rest shelf", x: 420, z: 246 }
] as const;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => join(entry.parentPath ?? directory, entry.name));
}

/** Half-float rounding scales with magnitude; compare with one representable step. */
function expectHalfFloatClose(actual: number, expected: number): void {
  const tolerance = Math.max(Math.abs(expected), 1) * 0.001 + 0.0005;
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
}

function sampleDepthMap(x: number, z: number) {
  const texture = createWaterDepthMap(new THREE.Vector4(x - 2, z - 2, 4, 4), 3, 3);
  const data = texture.image.data as Uint16Array;
  const center = (1 * 3 + 1) * 4;
  const sample = {
    depth: THREE.DataUtils.fromHalfFloat(data[center]),
    bed: THREE.DataUtils.fromHalfFloat(data[center + 1]),
    shoreDistance: THREE.DataUtils.fromHalfFloat(data[center + 2]),
    contact: THREE.DataUtils.fromHalfFloat(data[center + 3])
  };
  texture.dispose();
  return sample;
}

describe("W08.5 seabed depth reconciliation", () => {
  it.each(RECONCILIATION_POINTS)("bakes the physical column, signed mask and baseline at $name", ({ x, z }) => {
    const surface = WorldLayout.waterSurfaceElevation(x, z);
    const bed = WorldLayout.terrainBaseSurfaceHeight(x, z);
    const sample = sampleDepthMap(x, z);
    expectHalfFloatClose(sample.depth, THREE.MathUtils.clamp(surface - bed, -128, 128));
    expectHalfFloatClose(sample.bed, THREE.MathUtils.clamp(bed, -128, 128));
    expectHalfFloatClose(sample.shoreDistance, THREE.MathUtils.clamp(WorldLayout.waterSignedDistance(x, z), -128, 128));
    expectHalfFloatClose(sample.contact, WorldLayout.coastalContactWeightAt(x, z));
  });

  it("keeps the gameplay proxy distinct from the physical column where the bed was carved", () => {
    // The plunge basin is the strongest divergence in the slice: physical
    // optics sees the authored depth, the distance proxy cannot.
    const opticsDepth = WorldLayout.waterSurfaceElevation(-30, -130)
      - WorldLayout.terrainBaseSurfaceHeight(-30, -130);
    const proxyDepth = WorldLayout.marineSampleAt(-30, -130).bathymetryMeters;
    expect(opticsDepth).toBeGreaterThan(1.5);
    expect(Math.abs(opticsDepth - proxyDepth)).toBeGreaterThan(0.5);

    // The proxy stays zero on dry ground while the physical column may be
    // negative there; they are different quantities and never interchangeable.
    expect(WorldLayout.marineSampleAt(-65, -60).bathymetryMeters).toBe(0);
    expect(WorldLayout.marineSampleAt(-30, -130).bathymetryMeters).toBeGreaterThan(0);
  });

  it("keeps the proxy unconsumed and the bake downstream of the terrain owner", () => {
    const offenders = sourceFiles(join(REPO_ROOT, "src"))
      .filter((file) => readFileSync(file, "utf8").includes(".bathymetryMeters"))
      .map((file) => relative(REPO_ROOT, file).split("\\").join("/"))
      .filter((file) => file !== "src/world/WorldLayout.ts");
    expect(offenders).toEqual([]);

    // No world/simulation owner may import the renderer bake (marine -> terrain
    // -> marine cycle), and the bake itself must not read the proxy.
    for (const directory of ["src/world", "src/simulation"]) {
      const importers = sourceFiles(join(REPO_ROOT, directory))
        .filter((file) => /CoastalOptics|createWaterDepthMap/.test(readFileSync(file, "utf8")))
        .map((file) => relative(REPO_ROOT, file).split("\\").join("/"));
      expect(importers).toEqual([]);
    }
    const opticsSource = readFileSync(join(REPO_ROOT, "src/render/water/CoastalOptics.ts"), "utf8");
    expect(opticsSource.includes("bathymetryMeters")).toBe(false);
  });
});
