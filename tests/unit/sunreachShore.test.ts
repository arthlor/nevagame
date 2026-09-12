import { describe, expect, it } from "vitest";
import { signedDistanceToSunreachCoast, sunreachNaturalTerrainHeight } from "../../src/world/SunreachWorld";
import { SUNREACH_COAST_LOOP } from "../../src/world/WorldIslands";
import { WorldLayout } from "../../src/world/WorldLayout";

describe("continuous Sunreach shore", () => {
  it("crosses sea level continuously on every coast segment without a terrain grid step", () => {
    for (const [index, a] of SUNREACH_COAST_LOOP.entries()) {
      const b = SUNREACH_COAST_LOOP[(index + 1) % SUNREACH_COAST_LOOP.length];
      const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      let nx = -(b.z - a.z) / length, nz = (b.x - a.x) / length;
      if (signedDistanceToSunreachCoast(x + nx, z + nz) < 0) { nx *= -1; nz *= -1; }
      const inside = sunreachNaturalTerrainHeight(x - nx * 0.01, z - nz * 0.01);
      const outside = sunreachNaturalTerrainHeight(x + nx * 0.01, z + nz * 0.01);
      expect(sunreachNaturalTerrainHeight(x, z), `segment ${index}`).toBeCloseTo(0, 6);
      expect(inside).toBeGreaterThan(0);
      expect(outside).toBeLessThan(0);
      expect(inside - outside).toBeLessThan(0.002);
      // The indexed bed must meet sea level too, including cliff approaches.
      expect(Math.abs(WorldLayout.terrainBaseSurfaceHeight(x, z)), `indexed segment ${index}`).toBeLessThan(0.002);
    }
  });

  it("keeps retained inland working anchors and the offshore mooring bed unchanged", () => {
    for (const [x, z, height] of [
      [343, 58, -1.073665817411135],
      [373, 56, 0.8999999999999999],
      [455, 5, 4.743148849494423],
      [515, 75, 7.919198168349516],
      [590, 25, 19.09096862378921],
      [520, 180, 1.4115782359787832]
    ]) expect(WorldLayout.terrainHeight(x, z), `${x},${z}`).toBeCloseTo(height, 8);
    expect(WorldLayout.isSailable(343, 58)).toBe(true);
    expect(WorldLayout.isWalkable(355, 58)).toBe(true);
  });

  it("blends sand into seabed without a color-weight step at the coast", () => {
    for (const [index, a] of SUNREACH_COAST_LOOP.entries()) {
      const b = SUNREACH_COAST_LOOP[(index + 1) % SUNREACH_COAST_LOOP.length];
      const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const nx = -(b.z - a.z) / length, nz = (b.x - a.x) / length;
      const inside = WorldLayout.terrainSurfaceWeights(x - nx * 0.01, z - nz * 0.01, 1);
      const outside = WorldLayout.terrainSurfaceWeights(x + nx * 0.01, z + nz * 0.01, 1);
      const weightChange = Object.entries(inside).reduce((total, [key, weight]) =>
        total + Math.abs(weight - outside[key as keyof typeof outside]), 0);
      expect(weightChange, `coast segment ${index}`).toBeLessThan(0.03);
    }
  });
});
