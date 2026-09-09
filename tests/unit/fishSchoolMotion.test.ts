import { describe, expect, it, vi } from "vitest";
import { advanceSchoolFish, sampleSchoolFish, type SchoolFishMotion, type SchoolMotionContext } from "../../src/render/fishing/FishSchoolMotion";
import { SchoolSurfaceRipples } from "../../src/render/fishing/SchoolSurfaceRipples";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";

const context: SchoolMotionContext = { x: 0, z: 0, radius: 8, feeding: 1, boats: [], isWater: () => true };

describe("fish school presentation", () => {
  it("swims around an obstructed path without teleporting and pauses without drifting", () => {
    const blocked = { ...context, boats: [{ x: 3, z: 0, radius: 2.4 }] };
    let motion: SchoolFishMotion | undefined;
    for (let time = 0; time < 80; time += 1 / 60) {
      const previous = motion && { ...motion };
      const sample = advanceSchoolFish(motion, 1 / 60, time, 0.2, blocked);
      motion = sample.motion;
      expect(sample.visible).toBe(true);
      if (previous) expect(Math.hypot(motion.x - previous.x, motion.z - previous.z)).toBeLessThan(0.04);
    }
    const paused = { ...motion! };
    expect(advanceSchoolFish(motion, 0, 80, 0.2, blocked).motion).toEqual(paused);
  });

  it("keeps feeding fish outside the entire hull even when the boat occupies the chum point", () => {
    for (const radius of [2.4, 3.6]) {
      for (const offset of [0, 3, 6]) {
        const boats = [{ x: offset, z: 0, radius }];
        for (let time = 0; time < 90; time += 0.1) {
          for (const phase of [0.03, 0.27, 0.48, 0.68, 0.87]) {
            const pose = sampleSchoolFish(time, phase, { ...context, boats });
            expect(Math.hypot(pose.x - offset, pose.z)).toBeGreaterThanOrEqual(
              radius + CANONICAL_RENDER_CONFIG.fishSchools.hullClearanceMeters - 1e-6);
            expect(pose.depth).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("is reproducible across frame rates, culling gaps and translated school anchors", () => {
    const expected = sampleSchoolFish(45, 0.4, context);
    for (let time = 0; time < 45; time += 1 / 30) sampleSchoolFish(time, 0.4, context);
    expect(sampleSchoolFish(45, 0.4, context)).toEqual(expected);
    const translated = sampleSchoolFish(45, 0.4, { ...context, x: 80, z: -32 });
    expect(translated.x - 80).toBeCloseTo(expected.x, 8);
    expect(translated.z + 32).toBeCloseTo(expected.z, 8);
  });

  it("stays submerged, varies depth and staggers feeding instead of synchronizing the whole school", () => {
    const surfaces = [0.04, 0.25, 0.47, 0.67, 0.87].map(phase => {
      let peak = { time: 0, surface: 0 };
      for (let time = 0; time < 14; time += 0.1) {
        const pose = sampleSchoolFish(time, phase, context);
        expect(pose.depth).toBeGreaterThanOrEqual(0.12);
        if (pose.surface > peak.surface) peak = { time, surface: pose.surface };
      }
      return peak.time.toFixed(1);
    });
    expect(new Set(surfaces).size).toBe(5);
    expect(sampleSchoolFish(0, 0, context).depth).toBeLessThan(sampleSchoolFish(4.5, 0, context).depth);
  });

  it("never displays fish on dry banks or between a boat and an impassable shore", () => {
    const shore = { ...context, isWater: (x: number) => x < 0.5 };
    for (let time = 0; time < 50; time += 0.1) {
      const pose = sampleSchoolFish(time, 0.2, shore);
      expect(pose.visible).toBe(true);
      expect(pose.x).toBeLessThan(0.5);
      const confined = sampleSchoolFish(time, 0.2, { ...shore, boats: [{ x: 0, z: 0, radius: 8 }] });
      if (confined.visible) {
        expect(confined.x).toBeLessThan(0.5);
        expect(Math.hypot(confined.x, confined.z)).toBeGreaterThan(9);
      }
    }
  });

  it("anchors ripples to the feeding position, follows wave height, expires and releases owned resources", () => {
    const ripples = new SchoolSurfaceRipples(5);
    expect(ripples.root.children).toHaveLength(5);
    ripples.emit(2, 3, -2, 10, 1);
    ripples.update(10.8, () => 0.6, false);
    const mesh = ripples.root.children[2] as import("three").Mesh;
    expect(mesh.visible).toBe(true);
    expect(mesh.position.x).toBe(3);
    expect(mesh.position.y).toBeCloseTo(0.625);
    expect(mesh.position.z).toBe(-2);
    const scale = mesh.scale.x;
    ripples.update(10.8, () => 0.6, false);
    expect(mesh.scale.x).toBe(scale);
    ripples.update(14, () => 0.6, false);
    expect(mesh.visible).toBe(false);
    const dispose = vi.spyOn(mesh.geometry, "dispose");
    ripples.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
