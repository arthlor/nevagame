import { describe, expect, it } from "vitest";

import {
  BUTTERFLY_ORBITS,
  CLOUD_PLACEMENTS,
  GULL_ORBITS,
  sampleAmbientCloudPose,
  sampleAmbientFlyerPose,
  wrapCloudCoordinate
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

  it("keeps the multi-tiered cloud layer rich, finite, and well-distributed across altitudes", () => {
    expect(CLOUD_PLACEMENTS.length).toBeGreaterThanOrEqual(36);
    expect(CLOUD_PLACEMENTS.filter((cloud) => (cloud.tier ?? "low") === "low").length).toBeGreaterThanOrEqual(20);
    expect(CLOUD_PLACEMENTS.filter((cloud) => (cloud.tier ?? "low") === "mid").length).toBeGreaterThanOrEqual(10);
    expect(CLOUD_PLACEMENTS.filter((cloud) => (cloud.tier ?? "low") === "horizon").length).toBeGreaterThanOrEqual(8);

    for (const cloud of CLOUD_PLACEMENTS) {
      for (const value of [cloud.x, cloud.y, cloud.z, cloud.scale, cloud.rotationY, cloud.bobPhase]) {
        expect(Number.isFinite(value)).toBe(true);
      }
      expect(cloud.y).toBeGreaterThanOrEqual(34);
      expect(cloud.y).toBeLessThanOrEqual(75);
      expect(cloud.scale).toBeGreaterThan(0);
    }
    expect(CLOUD_PLACEMENTS.filter((cloud) => cloud.assetId === "cloud_towering_a").length).toBeGreaterThanOrEqual(10);
    expect(CLOUD_PLACEMENTS.filter((cloud) => cloud.assetId === "cloud_lowpoly_a").length).toBeGreaterThanOrEqual(25);
  });

  it("samples deterministic cloud poses drifting with the wind", () => {
    const placement = CLOUD_PLACEMENTS[0];
    const pose0 = sampleAmbientCloudPose(placement, 0, 1, 1, 0, 6);
    const pose100 = sampleAmbientCloudPose(placement, 100, 1, 1, 0, 6);

    expect(Number.isFinite(pose0.x)).toBe(true);
    expect(Number.isFinite(pose0.y)).toBe(true);
    expect(Number.isFinite(pose0.z)).toBe(true);
    expect(Number.isFinite(pose0.rotationX)).toBe(true);
    expect(Number.isFinite(pose0.rotationY)).toBe(true);
    expect(Number.isFinite(pose0.rotationZ)).toBe(true);
    expect(Number.isFinite(pose0.scale)).toBe(true);

    // Drifts along the positive X axis with East wind (directionX = 1)
    expect(pose100.x).not.toBe(pose0.x);

    // Deterministic repeatability
    const pose100Again = sampleAmbientCloudPose(placement, 100, 1, 1, 0, 6);
    expect(pose100Again).toEqual(pose100);
  });

  it("wraps cloud coordinates seamlessly within boundary limits", () => {
    expect(wrapCloudCoordinate(100, -600, 600)).toBe(100);
    expect(wrapCloudCoordinate(700, -600, 600)).toBe(-500);
    expect(wrapCloudCoordinate(-700, -600, 600)).toBe(500);
  });

  it("is deterministic for a given flyer orbit and time", () => {
    const pose = sampleAmbientFlyerPose(GULL_ORBITS[0], 12.25, 1);
    expect(sampleAmbientFlyerPose(GULL_ORBITS[0], 12.25, 1)).toEqual(pose);
  });
});
