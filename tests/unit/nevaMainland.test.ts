import { describe, expect, it } from "vitest";
import { MAINLAND_LAKE, MAINLAND_ROUTES, MAINLAND_VILLAGES, MAINLAND_RIVER, mainlandBrookRoadCrossings } from "../../src/world/NevaMainland";
import { drainageStripe } from "../../src/world/ProceduralNoise";
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

  /**
   * A terrain step shows as a height change across a line far larger than the
   * change just beside it. Natural slopes, gullies and banks change smoothly;
   * the tolerance ignores sub-0.4 m seams, which are not what these lines guard.
   */
  function worstStep(points: readonly (readonly [number, number, number, number])[]): string[] {
    const h = (x: number, z: number) => WorldLayout.naturalTerrainHeight(x, z);
    const steps: string[] = [];
    // A culvert headwall deliberately holds the road deck above the brook's floor.
    const culverts = mainlandBrookRoadCrossings();
    for (const [x, z, nx, nz] of points) {
      if (culverts.some(crossing => Math.hypot(crossing.point.x - x, crossing.point.z - z) < crossing.route.widthMeters * 0.5 + 4)) continue;
      const at = (offset: number) => h(x + nx * offset, z + nz * offset);
      const across = Math.abs(at(0.25) - at(-0.25));
      const beside = Math.max(Math.abs(at(1.25) - at(0.75)), Math.abs(at(-0.75) - at(-1.25)));
      if (across > beside * 1.5 + 0.4) steps.push(`${x.toFixed(1)},${z.toFixed(1)}: ${across.toFixed(2)} m`);
    }
    return steps;
  }

  it("carves the freshwater valley without straight or ring-shaped terrain steps", () => {
    // Layout29 stopped the valley at a fixed query box (10 m step along
    // z = -285, 5.6 m along x = -705) and cut the lake's bays off at one radius.
    const lines: [number, number, number, number][] = [];
    for (let x = -705; x <= -395; x += 1.5) lines.push([x, -285, 0, 1]);
    for (let z = -285; z <= 350; z += 1.5) lines.push([-705, z, 1, 0]);
    for (const scale of [1.6, 1.9, 2.2, 2.5, 2.8]) {
      for (let angle = 0; angle < Math.PI * 2; angle += 0.02) {
        const c = Math.cos(angle), s = Math.sin(angle);
        lines.push([MAINLAND_LAKE.center.x + c * MAINLAND_LAKE.radiusX * scale,
          MAINLAND_LAKE.center.z + s * MAINLAND_LAKE.radiusZ * scale, c, s]);
      }
    }
    expect(worstStep(lines)).toEqual([]);
  });

  it("draws mountain gullies without phase-vortex pits", () => {
    // Where the stripe's waves cancel, its phase used to wind through every
    // value within a metre, carving round pits and pimples into the flanks.
    let largest = 0;
    for (let x = -700; x < -100; x += 0.5) {
      for (let z = -640; z < -400; z += 7.3) {
        const here = drainageStripe(x, z, 0, 1, 120, 0x61a3), next = drainageStripe(x + 0.5, z, 0, 1, 120, 0x61a3);
        largest = Math.max(largest, Math.abs(here - next));
      }
    }
    // A clean stripe of 120 m spacing changes by at most 2 * pi / 120 per metre.
    expect(largest).toBeLessThan(0.08);
  });

  it("shelves the sheltered cove onto a shallow floor without seams", () => {
    const depth = (x: number, z: number) => -WorldLayout.naturalTerrainHeight(x, z);
    // The inner cove shelves onto a sediment floor well above the open seabed.
    for (const [x, z] of [[-380, 250], [-330, 300], [-420, 200], [-300, 380]] as const) {
      expect(WorldLayout.isWater(x, z), `${x},${z}`).toBe(true);
      expect(depth(x, z), `${x},${z}`).toBeGreaterThan(4);
      expect(depth(x, z), `${x},${z}`).toBeLessThan(12);
    }
    // The seabed has no creases: its grade changes gradually everywhere in the
    // cove, including along the lines equidistant from two shores.
    const creases: string[] = [];
    for (let x = -470; x <= -262; x += 3) {
      for (let z = 130; z <= 400; z += 3) {
        if (!WorldLayout.isWater(x, z) || !WorldLayout.isWater(x + 2, z) || !WorldLayout.isWater(x - 2, z)) continue;
        const curvature = Math.abs(depth(x + 2, z) - 2 * depth(x, z) + depth(x - 2, z));
        if (curvature > 0.06) creases.push(`${x},${z}: ${curvature.toFixed(3)}`);
      }
    }
    expect(creases).toEqual([]);
  });
});
