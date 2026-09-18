import { describe, expect, it } from "vitest";
import { WorldLayout, SHORE_TREATMENT_TABLE } from "../../src/world/WorldLayout";
import { SUNREACH_OFFSET_X } from "../../src/world/WorldIslands";

const PROJECTION_CASES = [
  { name: "south Neva", query: { x: 20, z: 110 }, islandId: "island.neva", normalAxis: "z", normalSign: 1 },
  { name: "west Neva", query: { x: -210, z: -60 }, islandId: "island.neva", normalAxis: "x", normalSign: -1 },
  { name: "north Neva", query: { x: 0, z: -250 }, islandId: "island.neva", normalAxis: "z", normalSign: -1 },
  { name: "east Sunreach", query: { x: 660 + SUNREACH_OFFSET_X, z: 60 }, islandId: "island.sunreach", normalAxis: "x", normalSign: 1 },
  { name: "Gull's Rest", query: { x: 420, z: 260 }, islandId: "island.gull_rest", normalAxis: "z", normalSign: 1 }
] as const;

describe("W03 consumer-backed geographical contracts", () => {
  it.each(PROJECTION_CASES)("projects $name onto an exact closed coast boundary", ({ query, islandId, normalAxis, normalSign }) => {
    const projection = WorldLayout.shoreProjectionAt(query.x, query.z);
    expect(projection.islandId).toBe(islandId);
    expect(projection.distanceIsMetric).toBe(true);
    expect(projection.signedDistanceMeters).toBeGreaterThan(0);

    const tangentLength = Math.hypot(projection.tangentXZ.x, projection.tangentXZ.z);
    const normalLength = Math.hypot(projection.waterwardNormalXZ.x, projection.waterwardNormalXZ.z);
    const dot = projection.tangentXZ.x * projection.waterwardNormalXZ.x
      + projection.tangentXZ.z * projection.waterwardNormalXZ.z;
    expect(tangentLength).toBeCloseTo(1, 5);
    expect(normalLength).toBeCloseTo(1, 5);
    expect(Math.abs(dot)).toBeLessThan(0.00001);
    expect(projection.waterwardNormalXZ[normalAxis] * normalSign).toBeGreaterThan(0.5);

    const waterProbe = {
      x: projection.boundaryPointXZ.x + projection.waterwardNormalXZ.x * 1.5,
      z: projection.boundaryPointXZ.z + projection.waterwardNormalXZ.z * 1.5
    };
    expect(WorldLayout.waterSignedDistance(waterProbe.x, waterProbe.z)).toBeGreaterThan(0);
  });

  it("preserves metric sign on both sides of the same boundary", () => {
    const water = WorldLayout.shoreProjectionAt(-210, -60);
    const landPoint = {
      x: water.boundaryPointXZ.x - water.waterwardNormalXZ.x * 2,
      z: water.boundaryPointXZ.z - water.waterwardNormalXZ.z * 2
    };
    const land = WorldLayout.shoreProjectionAt(landPoint.x, landPoint.z);
    expect(land.islandId).toBe(water.islandId);
    expect(land.segmentId).toBe(water.segmentId);
    expect(land.signedDistanceMeters).toBeCloseTo(-2, 5);
  });

  it("keeps the four consumed shore treatments explicit and bounded", () => {
    expect(Object.keys(SHORE_TREATMENT_TABLE).sort()).toEqual([
      "cliff",
      "rock-shelf",
      "sand",
      "sheltered"
    ]);
    for (const profile of Object.values(SHORE_TREATMENT_TABLE)) {
      expect(profile.waterContactStrength).toBeGreaterThanOrEqual(0);
      expect(profile.waterContactStrength).toBeLessThanOrEqual(1);
      expect(profile.landContactStrength).toBeGreaterThanOrEqual(0);
      expect(profile.landContactStrength).toBeLessThanOrEqual(1);
      expect(profile.waterReachMeters).toBeGreaterThan(0);
      expect(profile.landReachMeters).toBeGreaterThan(0);
    }
  });

  it("is deterministic and independent of public sampling order", () => {
    const coordinates = [
      { x: 20, z: 110 },
      { x: -190, z: -60 },
      { x: 0, z: -240 },
      { x: 420, z: 240 },
      { x: 350 + SUNREACH_OFFSET_X, z: 58 }
    ];
    for (const { x, z } of coordinates) {
      const projectionA = WorldLayout.shoreProjectionAt(x, z);
      const contactA = WorldLayout.coastalContactWeightAt(x, z);
      const membershipA = WorldLayout.waterSignedDistance(x, z);

      const membershipB = WorldLayout.waterSignedDistance(x, z);
      const contactB = WorldLayout.coastalContactWeightAt(x, z);
      const projectionB = WorldLayout.shoreProjectionAt(x, z);

      expect(projectionB).toEqual(projectionA);
      expect(contactB).toBe(contactA);
      expect(membershipB).toBe(membershipA);
    }
  });
});
