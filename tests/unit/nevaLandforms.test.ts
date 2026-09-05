import { describe, expect, it } from "vitest";
import { NEVA_FOOTHILL_TRAILS, NEVA_SUMMITS } from "../../src/world/NevaLandforms";
import { NEVA_HEADWATERS, headwaterElevationAt, headwaterGradientAt } from "../../src/world/NevaHeadwaters";
import { WorldLayout } from "../../src/world/WorldLayout";

describe("starter island mountain landform", () => {
  it("has three authored summit heights and substantial western foothills", () => {
    for (const peak of NEVA_SUMMITS) {
      expect(WorldLayout.terrainHeight(peak.x, peak.z), peak.id).toBeCloseTo(peak.elevation, 4);
    }
    expect(WorldLayout.terrainHeight(-137, -61)).toBeGreaterThan(5);
    expect(WorldLayout.terrainHeight(-127, -13)).toBeGreaterThan(3.5);
    expect(WorldLayout.terrainSurfaceSample(-24, -151).weights.cliff).toBeGreaterThan(0.02);
  });

  it("keeps the complete new trail corridor below thirty degrees", () => {
    const ids = new Set<string>(NEVA_FOOTHILL_TRAILS.map((trail) => trail.id));
    const failures: object[] = [];
    for (const route of WorldLayout.compiledRouteNetwork().filter((route) => ids.has(route.route.id))) {
      for (const sample of route.samples) {
        for (const offset of [-2.6, -1.1, 0, 1.1, 2.6]) {
          const x = sample.point.x + sample.normal.x * offset;
          const z = sample.point.z + sample.normal.z * offset;
          const normalY = WorldLayout.terrainNormalY(x, z);
          const traversal = WorldLayout.traversalSurfaceSample(x, z);
          if (!WorldLayout.isWalkable(x, z) || normalY < Math.cos(Math.PI / 6)
            || traversal.normal.y < Math.cos(Math.PI / 6)) {
            failures.push({ route: route.route.id, x, z, normalY, traversalNormalY: traversal.normal.y, source: traversal.source });
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("starts in a finite spring and descends continuously to the retained river", () => {
    const source = NEVA_HEADWATERS.source;
    expect(WorldLayout.isWater(source.x, source.z)).toBe(true);
    expect(WorldLayout.isWater(source.x, source.z - NEVA_HEADWATERS.sourceRadiusMeters - 0.1)).toBe(false);
    expect(WorldLayout.riverBankSample(source.x, source.z - 40).wetness).toBe(0);
    let previous = Number.POSITIVE_INFINITY;
    for (let z = source.z; z <= NEVA_HEADWATERS.endZ; z += 0.25) {
      const section = WorldLayout.riverSectionAt(z);
      expect(section.surfaceElevation).toBeLessThanOrEqual(previous);
      expect(WorldLayout.terrainHeight(section.centerX, z)).toBeLessThan(section.surfaceElevation);
      if (z < NEVA_HEADWATERS.endZ) {
        expect(WorldLayout.isSailable(section.centerX, z)).toBe(false);
        expect(WorldLayout.fishingHabitatAt(section.centerX, z)).toBeNull();
      }
      expect(headwaterGradientAt(z)).toBeLessThanOrEqual(0);
      previous = section.surfaceElevation;
    }
    for (const knot of NEVA_HEADWATERS.elevationKnots) {
      expect(headwaterElevationAt(knot.z)).toBe(knot.elevation);
      expect(headwaterGradientAt(knot.z)).toBe(0);
    }
  });
});
