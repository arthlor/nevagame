import { describe, expect, it } from "vitest";
import { isInsideLoop, LoopSegmentIndex, pointSegmentDistance } from "../../src/world/WorldGeometry";
import { MAINLAND_BOUNDS, NEVA_COAST_LOOP, nevaCoastIndex, signedDistanceToNevaCoast } from "../../src/world/WorldIslands";
import { nevaHeadlandAt } from "../../src/world/NevaCoastField";
import { mainlandShoreCharacterAt } from "../../src/world/NevaMainland";
import { WorldLayout } from "../../src/world/WorldLayout";

function bruteSignedDistance(x: number, z: number, loop: readonly { x: number; z: number }[]): number {
  let distance = Infinity;
  for (let i = 0; i < loop.length; i++) distance = Math.min(distance, pointSegmentDistance(x, z, loop[i], loop[(i + 1) % loop.length]));
  return isInsideLoop(x, z, loop) ? -distance : distance;
}

function segmentsCross(a: { x: number; z: number }, b: { x: number; z: number }, c: { x: number; z: number }, d: { x: number; z: number }): boolean {
  const denominator = (b.x - a.x) * (d.z - c.z) - (b.z - a.z) * (d.x - c.x);
  if (Math.abs(denominator) < 1e-12) return false;
  const t = ((c.x - a.x) * (d.z - c.z) - (c.z - a.z) * (d.x - c.x)) / denominator;
  const u = ((c.x - a.x) * (b.z - a.z) - (c.z - a.z) * (b.x - a.x)) / denominator;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

describe("Neva coastline", () => {
  it("answers exactly as the brute-force loop walk, near, far, on vertices and across cell edges", () => {
    const points: { x: number; z: number }[] = [];
    for (let x = -1150; x <= 450; x += 9.37) for (let z = -1050; z <= 1050; z += 8.91) points.push({ x, z });
    for (const vertex of NEVA_COAST_LOOP) points.push({ ...vertex }, { x: vertex.x + 0.25, z: vertex.z - 0.25 });
    for (let x = -896; x <= 224; x += 32) points.push({ x, z: -512 }, { x, z: 480 });
    points.push({ x: 4000, z: -3000 }, { x: -5000, z: 0 });
    for (const { x, z } of points) {
      expect(signedDistanceToNevaCoast(x, z), `${x},${z}`).toBe(bruteSignedDistance(x, z, NEVA_COAST_LOOP));
      expect(nevaCoastIndex().contains(x, z), `${x},${z}`).toBe(isInsideLoop(x, z, NEVA_COAST_LOOP));
    }
  });

  it("resolves nearest-segment ties to the lowest index, as a forward walk does", () => {
    const square = [{ x: 0, z: 0 }, { x: 64, z: 0 }, { x: 64, z: 64 }, { x: 0, z: 64 }];
    const index = new LoopSegmentIndex(square, 16);
    for (const point of [{ x: 32, z: 32 }, { x: 64, z: 64 }, { x: -10, z: -10 }, { x: 70, z: 32 }]) {
      let best = Infinity, bestSegment = -1;
      for (let i = 0; i < square.length; i++) {
        const distance = pointSegmentDistance(point.x, point.z, square[i], square[(i + 1) % square.length]);
        if (distance < best) { best = distance; bestSegment = i; }
      }
      const found = index.nearest(point.x, point.z, i => pointSegmentDistance(point.x, point.z, square[i], square[(i + 1) % square.length]));
      expect(found).toEqual({ segment: bestSegment, distance: best });
    }
  });

  it("keeps the derived outer rim simple, inside the mainland envelope and shaped by its geology", () => {
    const loop = NEVA_COAST_LOOP;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      for (let j = i + 2; j < loop.length; j++) {
        if (i === 0 && j === loop.length - 1) continue;
        expect(segmentsCross(a, b, loop[j], loop[(j + 1) % loop.length]), `${i}/${j}`).toBe(false);
      }
    }
    const rim = loop.filter(point => point.x < 160 && point.z < -350 || point.x < -350);
    expect(rim.length).toBeGreaterThan(150);
    for (const point of rim) {
      expect(point.x).toBeGreaterThanOrEqual(MAINLAND_BOUNDS.minX);
      expect(point.x).toBeLessThanOrEqual(MAINLAND_BOUNDS.maxX);
      expect(point.z).toBeGreaterThanOrEqual(MAINLAND_BOUNDS.minZ);
      expect(point.z).toBeLessThanOrEqual(MAINLAND_BOUNDS.maxZ);
      expect(WorldLayout.terrainPatchAt(point.x, point.z)?.islandId).toBe("island.neva");
    }
    // Hard-rock headlands stand out to sea as cliffs; soft ground is bays and beaches.
    const cliffs = rim.filter(point => nevaHeadlandAt(point.x, point.z) > 0.5);
    const bays = rim.filter(point => nevaHeadlandAt(point.x, point.z) < -0.5);
    expect(cliffs.length).toBeGreaterThan(5);
    expect(bays.length).toBeGreaterThan(5);
    const meanCliff = (points: typeof rim) => points.reduce((total, point) => total + mainlandShoreCharacterAt(point.x, point.z).cliff, 0) / points.length;
    expect(meanCliff(cliffs)).toBeGreaterThan(meanCliff(bays) + 0.3);
  });
});
