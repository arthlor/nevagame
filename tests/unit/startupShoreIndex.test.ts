import { describe, expect, it } from "vitest";
import { isInsideLoop, pointSegmentDistance, type Point2D } from "../../src/world/WorldGeometry";
import { OCEAN_ISLETS, OCEAN_ISLAND_DEFINITIONS, isletShoreDistance } from "../../src/world/OceanIslets";
import { SUNREACH_COAST_LOOP } from "../../src/world/WorldIslands";
import { signedDistanceToSunreachCoast } from "../../src/world/SunreachWorld";

function originalDistance(x: number, z: number, loop: readonly Point2D[]) {
  let distance = Infinity;
  for (let i = 0; i < loop.length; i++) distance = Math.min(distance,
    pointSegmentDistance(x, z, loop[i], loop[(i + 1) % loop.length]));
  return isInsideLoop(x, z, loop) ? -distance : distance;
}

describe("indexed startup shore sampling", () => {
  it("retains exact signed distances on land, at vertices and offshore", () => {
    const cases = [
      { loop: SUNREACH_COAST_LOOP, sample: signedDistanceToSunreachCoast },
      ...OCEAN_ISLETS.map(islet => ({ loop: OCEAN_ISLAND_DEFINITIONS[islet.id].coastLoop,
        sample: (x: number, z: number) => isletShoreDistance(islet, x, z) }))
    ];
    for (const { loop, sample } of cases) {
      const minX = Math.min(...loop.map(p => p.x)) - 60, maxX = Math.max(...loop.map(p => p.x)) + 60;
      const minZ = Math.min(...loop.map(p => p.z)) - 60, maxZ = Math.max(...loop.map(p => p.z)) + 60;
      for (let x = minX; x <= maxX; x += 7.75) for (let z = minZ; z <= maxZ; z += 9.5) {
        expect(sample(x, z)).toBe(originalDistance(x, z, loop));
      }
      for (const p of loop) expect(sample(p.x, p.z)).toBe(originalDistance(p.x, p.z, loop));
    }
  });
});
