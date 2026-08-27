import { describe, expect, it } from "vitest";

import {
  BUTTERFLY_ORBITS,
  GULL_ORBITS,
  sampleAmbientFlyerPose
} from "../../src/render/scene/ambientFlyers";
import { WorldLayout } from "../../src/world/WorldLayout";

describe("ambientFlyers", () => {
  it("keeps gull and butterfly orbits finite around their authored origins", () => {
    expect(GULL_ORBITS).toHaveLength(10);
    expect(BUTTERFLY_ORBITS).toHaveLength(12);
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

  it("is deterministic for a given orbit and time", () => {
    const pose = sampleAmbientFlyerPose(GULL_ORBITS[0], 12.25, 1);
    expect(sampleAmbientFlyerPose(GULL_ORBITS[0], 12.25, 1)).toEqual(pose);
  });
});
