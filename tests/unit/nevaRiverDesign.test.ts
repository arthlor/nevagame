import { describe, expect, it } from "vitest";
import { NEVA_HEADWATERS, headwaterGradientAt } from "../../src/world/NevaHeadwaters";
import { WorldLayout, RIVER_FISHING_ACCESS_RESERVES } from "../../src/world/WorldLayout";
import { createHeadwaterFallGeometry } from "../../src/render/water/HeadwaterFall";

describe("Neva river landscape", () => {
  it("feeds a narrow tall fall from a gentle spring run into an asymmetric basin", () => {
    const { fall, pool, source } = NEVA_HEADWATERS;
    for (let z = source.z; z <= fall.lipZ; z += 0.2) {
      expect(Math.abs(headwaterGradientAt(z))).toBeLessThan(0.25);
    }
    expect(fall.lipElevation - fall.landingElevation).toBeGreaterThan(12);
    const lip = WorldLayout.riverSectionAt(fall.lipZ);
    const basin = WorldLayout.riverSectionAt(pool.centerZ);
    expect(basin.leftWaterWidth + basin.rightWaterWidth).toBeGreaterThan(2 * (lip.leftWaterWidth + lip.rightWaterWidth));
    expect(basin.rightWaterWidth - basin.leftWaterWidth).toBeGreaterThan(1);
    expect(basin.surfaceElevation - basin.bedElevation).toBeGreaterThan(2.5);
  });

  it("keeps the center of every redesigned reach submerged", () => {
    for (let z = NEVA_HEADWATERS.source.z; z <= 82; z += 0.5) {
      if (z > -17 && z < 5) continue; // Authored bridge has separate support.
      const section = WorldLayout.riverSectionAt(z);
      expect(WorldLayout.riverWaterSignedDistance(section.centerX, z)).toBeGreaterThan(0);
      expect(WorldLayout.terrainHeight(section.centerX, z), `bed at ${z}`).toBeLessThan(section.surfaceElevation);
    }
  });

  it("submerges the indexed terrain beneath the actual impact and its apron", () => {
    const { landingZ, landingElevation } = NEVA_HEADWATERS.fall;
    for (let z = landingZ; z <= landingZ+3; z+=0.3) {
      const x = WorldLayout.riverCenterX(z);
      for (const offset of [-0.8,0,0.8]) {
        expect(WorldLayout.terrainBaseSurfaceHeight(x+offset,z), `impact bed ${offset},${z}`)
          .toBeLessThan(landingElevation-0.5);
      }
    }
  });

  it("gives every reserved fishing approach dry footing beside the visible waterline", () => {
    for (const reserve of RIVER_FISHING_ACCESS_RESERVES) {
      const s = WorldLayout.riverSectionAt(reserve.z);
      const sign = reserve.side === "left" ? -1 : 1;
      const edge = s.centerX + sign * (sign < 0 ? s.leftWaterWidth : s.rightWaterWidth);
      expect(WorldLayout.terrainHeight(edge, reserve.z)).toBeCloseTo(s.surfaceElevation, 5);
      expect(WorldLayout.terrainHeight(edge+sign*2, reserve.z)).toBeGreaterThan(s.surfaceElevation);
      expect(WorldLayout.fishingAccessAt(edge+sign*2,reserve.z).accessible).toBe(true);
    }
  });

  it("turns both ways and varies width without kinks at the bend boundaries", () => {
    const sections = Array.from({length: 160}, (_, i) => WorldLayout.riverSectionAt(-120+i));
    expect(sections.some(s => s.tangent.x < -0.15)).toBe(true);
    expect(sections.some(s => s.tangent.x > 0.35)).toBe(true);
    const widths = sections.map(s => s.leftWaterWidth+s.rightWaterWidth);
    expect(Math.max(...widths)/Math.min(...widths)).toBeGreaterThan(1.4);
    for (const z of [-125,-91,-77,-22,16,44,55,77]) {
      const before = WorldLayout.riverCenterX(z-.01), at = WorldLayout.riverCenterX(z), after = WorldLayout.riverCenterX(z+.01);
      expect(Math.abs((after-at)-(at-before))).toBeLessThan(.001);
    }
  });

  it("retains one bounded falling sheet on every graphics tier", () => {
    for (const tier of ["low", "medium", "high"] as const) {
      const geometry = createHeadwaterFallGeometry(tier);
      try {
        expect(geometry.index!.count / 3).toBeLessThanOrEqual(840);
        const normals = geometry.getAttribute("normal");
        for (let i=0;i<normals.count;i++) expect(normals.getY(i)).toBeGreaterThanOrEqual(-.001);
      } finally { geometry.dispose(); }
    }
  });
});
