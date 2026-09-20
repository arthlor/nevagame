import { describe, expect, it } from "vitest";
import { BoatPresentationBuffer } from "../../src/render/presentation/BoatPresentationBuffer";
import type { ResolvedBoatPose } from "../../src/simulation/core/PhysicsAdapter";

function pose(x: number, headingRadians = 0, speed = 0): ResolvedBoatPose {
  return { x, y: 0, z: 0, headingRadians, speed };
}

describe("BoatPresentationBuffer", () => {
  it("interpolates fixed-step position and shortest-path heading", () => {
    const buffer = new BoatPresentationBuffer();
    buffer.reset({ "boat.skiff": pose(0, Math.PI - 0.1) });
    buffer.push({ "boat.skiff": pose(8.5 / 60, -Math.PI + 0.1, 8.5) });
    const halfway = buffer.sample(0.5)["boat.skiff"]!;
    expect(halfway.x).toBeCloseTo(8.5 / 120, 7);
    expect(halfway.speed).toBeCloseTo(4.25, 7);
    expect(Math.abs(halfway.headingRadians)).toBeCloseTo(Math.PI, 6);
  });

  it("snaps teleport-sized jumps instead of sliding through the world", () => {
    const buffer = new BoatPresentationBuffer();
    buffer.reset({ "boat.skiff": pose(0) });
    buffer.push({ "boat.skiff": pose(40) });
    expect(buffer.sample(0)["boat.skiff"]!.x).toBe(40);
    expect(buffer.sample(1)["boat.skiff"]!.x).toBe(40);
  });

  it("advances every rendered frame at a refresh rate that does not divide 60", () => {
    // The reported defect: a hull written straight from canonical state holds
    // still on frames with no fixed step and double-steps on catch-up frames,
    // so it judders at 120 Hz even though the boat is moving at a constant
    // speed. Interpolation must convert fixed steps into per-frame motion.
    const renderHz = 120;
    const fixed = 1 / 60;
    const buffer = new BoatPresentationBuffer();
    buffer.reset({ "boat.skiff": pose(0, 0, 8.5) });
    let accumulator = 0;
    let canonicalX = 0;
    let previousCanonicalX = 0;
    let previousPresentedX: number | null = null;
    let minimumDelta = Infinity;
    let maximumDelta = 0;
    let canonicalHolds = 0;
    for (let frame = 0; frame < renderHz; frame++) {
      accumulator += 1 / renderHz;
      while (accumulator + 1e-10 >= fixed) {
        canonicalX += 8.5 * fixed;
        buffer.push({ "boat.skiff": pose(canonicalX, 0, 8.5) });
        accumulator -= fixed;
      }
      const presentedX = buffer.sample(accumulator / fixed)["boat.skiff"]!.x;
      // The first rendered frames only prime the two retained steps; the
      // steady-state cadence is what the display sees while under way.
      if (frame >= 2) {
        const canonicalDelta = canonicalX - previousCanonicalX;
        if (canonicalDelta === 0) canonicalHolds += 1;
        if (previousPresentedX !== null) {
          const delta = presentedX - previousPresentedX;
          minimumDelta = Math.min(minimumDelta, delta);
          maximumDelta = Math.max(maximumDelta, delta);
        }
      }
      previousCanonicalX = canonicalX;
      previousPresentedX = presentedX;
    }
    // Canonical state is written in fixed steps, so the raw hull held still on
    // roughly half the frames; the presented hull may never hold while moving.
    expect(canonicalHolds).toBeGreaterThan(renderHz / 3);
    expect(minimumDelta).toBeGreaterThan(0);
    // Half a fixed step per frame at 120 Hz; no frame may hold or double-step.
    expect(minimumDelta).toBeCloseTo(8.5 / 120, 6);
    expect(maximumDelta).toBeCloseTo(8.5 / 120, 6);
  });

  it("drops boats the simulation no longer reports", () => {
    const buffer = new BoatPresentationBuffer();
    buffer.reset({ "boat.rowboat": pose(0), "boat.skiff": pose(10) });
    buffer.push({ "boat.rowboat": pose(0.1) });
    const sampled = buffer.sample(0.5);
    expect(Object.keys(sampled)).toEqual(["boat.rowboat"]);
  });
});
