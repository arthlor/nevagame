import { describe, expect, it } from "vitest";
import { MAINLAND_ROUTES, MAINLAND_VILLAGES, MAINLAND_RIVER } from "../../src/world/NevaMainland";
import { WorldLayout } from "../../src/world/WorldLayout";
import { BOAT_MOORINGS, WORLD_SAILING_ROUTES, requiredBoatTypeForMarket } from "../../src/world/WorldMoorings";
import { waterSpatialProfile } from "../../src/render/water/WaterSurface";

describe("Neva cove mainland", () => {
  it("feathers cove shelter continuously without changing local sailing or freshwater membership", () => {
    expect(WorldLayout.marineSampleAt(-350, 250).coveShelter).toBeCloseTo(0.8);
    for (const boundary of [{ x: -520, z: 250, axis: "x" }, { x: -180, z: 250, axis: "x" },
      { x: -350, z: 90, axis: "z" }, { x: -350, z: 440, axis: "z" }] as const) {
      const before: { x: number; z: number } = { x: boundary.x, z: boundary.z }, after = { ...before };
      before[boundary.axis] -= 0.01;
      after[boundary.axis] += 0.01;
      expect(Math.abs(WorldLayout.marineSampleAt(before.x, before.z).coveShelter
        - WorldLayout.marineSampleAt(after.x, after.z).coveShelter)).toBeLessThan(0.00001);
      const first = waterSpatialProfile(before.x, before.z), second = waterSpatialProfile(after.x, after.z);
      expect(Math.abs(first.weights.ocean - second.weights.ocean)).toBeLessThan(0.001);
    }
  });
  it("connects distinct working biomes to a sheltered cove and retains the starter terrain resolution", () => {
    expect(WorldLayout.terrainPatches().filter(p => p.islandId === "island.neva")).toHaveLength(6);
    expect(WorldLayout.terrainPatchAt(-65, -60)?.resolution).toBe(384);
    for (const village of Object.values(MAINLAND_VILLAGES)) {
      expect(WorldLayout.islandAt(village.market.x, village.market.z)).toBe("island.neva");
      expect(WorldLayout.regionAt(village.market.x, village.market.z)).toBe(village.regionId);
      expect(WorldLayout.isWalkable(village.market.x, village.market.z)).toBe(true);
      expect(requiredBoatTypeForMarket(village.marketId)).toBeNull();
    }
    expect(WorldLayout.biomeAt(-395, 55)).toBe("biome.pine_forest");
    expect(WorldLayout.biomeAt(-565, 340)).toBe("biome.reed_marsh");
    expect(WorldLayout.biomeAt(-340, -365)).toBe("biome.highlands");
    expect(WorldLayout.terrainHeight(-425, -610)).toBeGreaterThan(100);
    expect(WorldLayout.isWater(-250, 300)).toBe(true);
    expect(WorldLayout.islandAt(-600, 500)).toBe("island.neva");
  });

  it("keeps every freight lane dry and below the existing movement slope limit", () => {
    const defects: string[] = [];
    for (const route of MAINLAND_ROUTES) {
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1], b = route.points[i];
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        for (let d = 0; d <= length; d += 3) {
          const x = a.x + (b.x - a.x) * d / length, z = a.z + (b.z - a.z) * d / length;
          if (!WorldLayout.isWalkable(x, z) || WorldLayout.traversalSurfaceSample(x, z).normal.y < Math.cos(Math.PI / 6)) {
            defects.push(`${route.id}: ${x.toFixed(1)},${z.toFixed(1)}`);
          }
        }
      }
    }
    expect(defects).toEqual([]);
  });

  it("gives local coastal freight continuous rowboat water and supported landings", () => {
    for (const mooring of BOAT_MOORINGS.filter(m => m.id === "mooring.pinewatch" || m.id === "mooring.reedhaven")) {
      expect(WorldLayout.isWalkable(mooring.playerPosition.x, mooring.playerPosition.z)).toBe(true);
      expect(WorldLayout.isSailable(mooring.boatPosition.x, mooring.boatPosition.z)).toBe(true);
    }
    const defects: string[] = [];
    for (const route of WORLD_SAILING_ROUTES.filter(r => r.landAccessible)) {
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1], b = route.points[i];
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        for (let d = 0; d <= length; d += 2) {
          const x = a.x + (b.x - a.x) * d / length, z = a.z + (b.z - a.z) * d / length;
          if (!WorldLayout.isSailable(x, z) || WorldLayout.navigationRequirementAt(x, z)) defects.push(`${route.id}: ${x},${z}`);
        }
      }
    }
    expect(defects).toEqual([]);
  });

  it("shares the freshwater channel between bed, water, fishing and wave classification", () => {
    expect(WorldLayout.fishingAccessAt(-617, -180)).toMatchObject({ accessible: true, habitat: "lake" });
    expect(WorldLayout.fishingAccessAt(-539, 158)).toMatchObject({ accessible: true, habitat: "river" });
    for (const point of MAINLAND_RIVER.slice(0, -1)) {
      expect(WorldLayout.isWater(point.x, point.z)).toBe(true);
      expect(WorldLayout.terrainHeight(point.x, point.z)).toBeLessThan(0);
      expect(["lake", "river"]).toContain(WorldLayout.fishingHabitatAt(point.x, point.z));
      expect(waterSpatialProfile(point.x, point.z).region).toBe("river");
    }
  });
});
