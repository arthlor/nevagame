import { describe, expect, it } from "vitest";
import { waterSpatialProfile } from "../../src/render/water/WaterSurface";
import { WorldLayout } from "../../src/world/WorldLayout";
import {
  SUNREACH_COAST_LOOP,
  type WorldIslandId
} from "../../src/world/WorldIslands";

function findSupportedCoastPoint(
  loop: readonly Readonly<{ x: number; z: number }>[],
  islandId: WorldIslandId,
  reachMeters: number
): { x: number; z: number } {
  for (let index = 0; index < loop.length; index += 1) {
    const start = loop[index];
    const end = loop[(index + 1) % loop.length];
    const midpoint = { x: (start.x + end.x) * 0.5, z: (start.z + end.z) * 0.5 };
    const projection = WorldLayout.shoreProjectionAt(midpoint.x, midpoint.z);
    if (projection.islandId !== islandId || projection.shoreKind === "cliff") continue;
    for (let distance = 0.75; distance <= reachMeters - 0.75; distance += 0.5) {
      const point = {
        x: projection.boundaryPointXZ.x - projection.waterwardNormalXZ.x * distance,
        z: projection.boundaryPointXZ.z - projection.waterwardNormalXZ.z * distance
      };
      if (WorldLayout.isWater(point.x, point.z)) continue;
      if (!WorldLayout.isWalkable(point.x, point.z)) continue;
      if (WorldLayout.terrainNormalY(point.x, point.z) < 0.7) continue;
      const waterProbe = {
        x: projection.boundaryPointXZ.x + projection.waterwardNormalXZ.x * 0.75,
        z: projection.boundaryPointXZ.z + projection.waterwardNormalXZ.z * 0.75
      };
      if (!WorldLayout.isWater(waterProbe.x, waterProbe.z)) continue;
      if (WorldLayout.fishingHabitatAt(waterProbe.x, waterProbe.z) !== "coast") continue;
      return point;
    }
  }
  throw new Error(`No supported ${islandId} coast point within ${reachMeters} m`);
}

describe("W01/W02 water classification and coastal access", () => {
  it("classifies sampled in-bounds Neva outer waters as sea/ocean with normalized weights", () => {
    const oceanPoints = [
      // The old west and north samples are inland under the current expanded
      // coast loop. Sample the corresponding in-bounds outer shores instead.
      { name: "southwest", x: -220, z: 100 },
      { name: "northeast", x: 190, z: -240 },
      { name: "east", x: 190, z: -40 },
      { name: "south", x: 60, z: 80 }
    ];

    for (const point of oceanPoints) {
      expect(WorldLayout.isWater(point.x, point.z), point.name).toBe(true);
      expect(WorldLayout.isSailable(point.x, point.z), point.name).toBe(true);
      const profile = waterSpatialProfile(point.x, point.z);
      expect(profile.weights.river, point.name).toBe(0);
      expect(profile.region, point.name).not.toBe("river");
      expect(profile.weights.river + profile.weights.sea + profile.weights.ocean, point.name)
        .toBeCloseTo(1, 8);
      for (const weight of Object.values(profile.weights)) {
        expect(Number.isFinite(weight), point.name).toBe(true);
        expect(weight, point.name).toBeGreaterThanOrEqual(0);
        expect(weight, point.name).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keeps river flow in the finite channel and ends it outside the source cap", () => {
    const z = -70;
    const x = WorldLayout.riverCenterX(z);
    const profile = waterSpatialProfile(x, z);
    const tangent = WorldLayout.riverSectionAt(z).tangent;
    expect(profile.weights.river).toBeGreaterThan(0.9);
    expect(profile.region).toBe("river");
    expect(profile.localDirection.x * tangent.x + profile.localDirection.y * tangent.z)
      .toBeGreaterThan(0.95);

    const northOfSource = waterSpatialProfile(-30, -160);
    expect(northOfSource.weights.river).toBe(0);
  });

  it("orients near-coast sea waves toward the nearest shore", () => {
    for (const point of [{ x: -220, z: 100 }, { x: 190, z: -240 }, { x: 190, z: -40 }]) {
      const profile = waterSpatialProfile(point.x, point.z);
      const shore = WorldLayout.shoreProjectionAt(point.x, point.z);
      const shoreward = {
        x: -shore.waterwardNormalXZ.x,
        z: -shore.waterwardNormalXZ.z
      };
      expect(profile.localDirection.x * shoreward.x + profile.localDirection.y * shoreward.z)
        .toBeGreaterThan(0.35);
    }
  });

  it("targets adjacent water from Neva's supported southwest shore within actual rod reach", () => {
    const point = { x: -181.2, z: 88.6 };
    const access = WorldLayout.fishingAccessAt(point.x, point.z, 8);
    expect(WorldLayout.fishingAccessAt(point.x, point.z).accessible).toBe(true);
    expect(WorldLayout.isWalkable(point.x, point.z)).toBe(true);
    expect(WorldLayout.terrainNormalY(point.x, point.z)).toBeGreaterThanOrEqual(0.7);
    expect(access).toMatchObject({ accessible: true, habitat: "coast", reason: "coast" });
    expect(access.target).not.toBeNull();
    expect(access.distanceMeters).toBeLessThanOrEqual(8);
    expect(WorldLayout.isWater(access.target!.x, access.target!.z)).toBe(true);

    let enteredWater = false;
    for (let step = 1; step <= 16; step += 1) {
      const amount = step / 16;
      const sample = {
        x: point.x + (access.target!.x - point.x) * amount,
        z: point.z + (access.target!.z - point.z) * amount
      };
      const wet = WorldLayout.isWater(sample.x, sample.z);
      if (wet) enteredWater = true;
      if (enteredWater) expect(wet).toBe(true);
    }
  });

  it("blocks a northern cliff even when its top happens to be dry", () => {
    const projection = WorldLayout.shoreProjectionAt(0, -250);
    expect(projection.shoreKind).toBe("cliff");
    const cliffTop = {
      x: projection.boundaryPointXZ.x - projection.waterwardNormalXZ.x * 2,
      z: projection.boundaryPointXZ.z - projection.waterwardNormalXZ.z * 2
    };
    expect(WorldLayout.isWater(cliffTop.x, cliffTop.z)).toBe(false);
    expect(WorldLayout.fishingAccessAt(cliffTop.x, cliffTop.z, 8)).toMatchObject({
      accessible: false,
      habitat: null,
      reason: "blocked"
    });
  });

  it("preserves Sunreach access with a derived, non-vacuous physical probe", () => {
    const point = findSupportedCoastPoint(SUNREACH_COAST_LOOP, "island.sunreach", 8);
    expect(WorldLayout.isWalkable(point.x, point.z)).toBe(true);
    expect(WorldLayout.isWater(point.x, point.z)).toBe(false);
    expect(WorldLayout.fishingAccessAt(point.x, point.z, 8)).toMatchObject({
      accessible: true,
      habitat: "coast",
      reason: "coast"
    });
  });
});
