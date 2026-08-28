import { describe, expect, it } from "vitest";

import {
  BUTTERFLY_ORBITS,
  CLOUD_PLACEMENTS,
  GULL_ORBITS,
  sampleAmbientFlyerPose
} from "../../src/render/scene/ambientFlyers";
import { WorldLayout } from "../../src/world/WorldLayout";

describe("ambientFlyers", () => {
  it("keeps gull and butterfly orbits finite around their authored origins", () => {
    expect(GULL_ORBITS).toHaveLength(16);
    expect(BUTTERFLY_ORBITS).toHaveLength(20);
    for (const orbit of [...GULL_ORBITS, ...BUTTERFLY_ORBITS]) {
      for (const timeSeconds of [0, 4.2, 18, 120.5]) {
        const pose = sampleAmbientFlyerPose(orbit, timeSeconds, 1);
        expect(Number.isFinite(pose.x)).toBe(true);
        expect(Number.isFinite(pose.y)).toBe(true);
        expect(Number.isFinite(pose.z)).toBe(true);
        expect(Number.isFinite(pose.heading)).toBe(true);
        expect(Math.abs(pose.x - orbit.originX)).toBeLessThanOrEqual(orbit.radiusX + 1e-6);
        expect(Math.abs(pose.z - orbit.originZ)).toBeLessThanOrEqual(orbit.radiusZ + 1e-6);
        expect(pose.y).toBeGreaterThan(WorldLayout.terrainHeight(pose.x, pose.z) + 0.2);
      }
    }
  });

  it("keeps the expanded cloud layer finite and low enough for high camera views", () => {
    expect(CLOUD_PLACEMENTS).toHaveLength(11);
    expect(CLOUD_PLACEMENTS.filter((cloud) => cloud.y <= 18).length).toBeGreaterThanOrEqual(8);
    for (const cloud of CLOUD_PLACEMENTS) {
      for (const value of [cloud.x, cloud.y, cloud.z, cloud.scale, cloud.rotationY, cloud.bobPhase]) {
        expect(Number.isFinite(value)).toBe(true);
      }
      expect(cloud.y).toBeGreaterThanOrEqual(15);
      expect(cloud.y).toBeLessThanOrEqual(20);
      expect(cloud.scale).toBeGreaterThan(0);
    }
  });

  it("is deterministic for a given orbit and time", () => {
    const pose = sampleAmbientFlyerPose(GULL_ORBITS[0], 12.25, 1);
    expect(sampleAmbientFlyerPose(GULL_ORBITS[0], 12.25, 1)).toEqual(pose);
  });
});
