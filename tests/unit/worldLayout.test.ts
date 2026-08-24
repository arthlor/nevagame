import { describe, expect, it } from "vitest";
import { WaterSurface } from "../../src/render/water/WaterSurface";
import {
  TERRAIN_RESOLUTION,
  WorldLayout
} from "../../src/world/WorldLayout";
import { HARBOR_DOCK } from "../../src/world/WorldAnchors";

describe("WorldLayout", () => {
  it("uses one deterministic height contract for the compact world", () => {
    expect(WorldLayout.terrainHeight(9.5, -1.5)).toBe(WorldLayout.terrainHeight(9.5, -1.5));
    expect(WorldLayout.isWater(WorldLayout.riverCenterX(0), 0)).toBe(true);
    expect(WorldLayout.isSailable(0, 80)).toBe(true);
    expect(WorldLayout.isSailable(0, 0)).toBe(false);
    expect(WorldLayout.isWalkable(WorldLayout.riverCenterX(0), 0)).toBe(false);
    expect(WorldLayout.isWalkable(-16, 5)).toBe(true);
    expect(WorldLayout.nearbyFishingHabitat(-8, 0)).toBe("river");
    expect(WorldLayout.nearbyFishingHabitat(50, 0)).toBe(null);
    expect(WorldLayout.fishingHabitatAt(0, 45)).toBe("lake");
    expect(WorldLayout.fishingHabitatAt(0, 60)).toBe("coast");
    expect(WorldLayout.terrainHeightfield()).toHaveLength((TERRAIN_RESOLUTION + 1) ** 2);
  });

  it("keeps terrain geometry, landmarks, and collision on the same height owner", () => {
    const farmhouse = WorldLayout.landmark("farmhouse");
    expect(WorldLayout.terrainSurface(0, 0)).toBe("soil");
    expect(WorldLayout.terrainNormal(farmhouse.x, farmhouse.z).length()).toBeCloseTo(1, 5);
    expect(WorldLayout.staticColliders().some((collider) => collider.id === "farmhouse")).toBe(true);
    expect(WorldLayout.staticColliders().filter((collider) => collider.id.startsWith("bridge-deck-"))).toHaveLength(13);

    const geometry = WorldLayout.buildTerrainGeometry();
    expect(geometry.getAttribute("color").count).toBe(geometry.getAttribute("position").count);
    expect(geometry.index).toBeNull();
    geometry.dispose();
  });

  it("keeps the harbor interaction anchor on walkable ground outside structure collision", () => {
    const anchor = HARBOR_DOCK.playerPosition;
    expect(WorldLayout.isWalkable(anchor.x, anchor.z)).toBe(true);
    for (const collider of WorldLayout.staticColliders()) {
      const [x, , z] = collider.center;
      const [halfX, , halfZ] = collider.halfExtents;
      const overlapsPlayer =
        Math.abs(anchor.x - x) <= halfX + 0.34 &&
        Math.abs(anchor.z - z) <= halfZ + 0.34;
      expect(overlapsPlayer, `anchor overlaps ${collider.id}`).toBe(false);
    }
  });

  it("provides stable low-frequency water samples for render and physics", () => {
    const first = WaterSurface.sample(8, 42, 12, 0.6);
    const second = WaterSurface.sample(8, 42, 12, 0.6);
    expect(first.height).toBe(second.height);
    expect(first.normal.length()).toBeCloseTo(1, 5);
  });
});
