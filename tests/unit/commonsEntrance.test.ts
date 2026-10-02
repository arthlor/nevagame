import { describe, expect, it } from "vitest";
import { PLAYER_HOMESTEAD_LAYOUT, farmPlantableWorldAreas } from "../../src/world/FarmLayout";
import { WorldLayout, WORLD_ROUTES } from "../../src/world/WorldLayout";

describe("Commons road gate", () => {
  it("terminates the lane and its apron at one point outside cultivated soil", () => {
    const route = WORLD_ROUTES.find((candidate) => candidate.id === "village-homestead")!;
    const end = route.points.at(-1)!;
    const junction = WorldLayout.routeJunctions().find((candidate) => candidate.id === "village-commons")!;
    expect(end).toEqual(junction.center);
    expect(end.x).toBeLessThan(PLAYER_HOMESTEAD_LAYOUT.origin.x);
    expect(WorldLayout.roadFootprintSample(end.x, end.z).packed).toBeGreaterThan(0.9);
    for (const area of farmPlantableWorldAreas(PLAYER_HOMESTEAD_LAYOUT.farmId)) {
      for (let row = 0; row <= 4; row++) {
        for (let column = 0; column <= 4; column++) {
          const x = area.minX + (area.maxX - area.minX) * column / 4;
          const z = area.minZ + (area.maxZ - area.minZ) * row / 4;
          expect(WorldLayout.roadFootprintSample(x, z).coverage, `${x},${z}`).toBe(0);
        }
      }
    }
    // The former oversized court also reached into the decorative west rows.
    expect(WorldLayout.roadFootprintSample(74.9, -76.2).coverage).toBe(0);
  });
});
