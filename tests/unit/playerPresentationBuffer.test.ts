import { describe, expect, it } from "vitest";
import {
  PlayerPresentationBuffer,
  stationaryPlayerMotion
} from "../../src/render/presentation/PlayerPresentationBuffer";
import type { ResolvedPlayerPose } from "../../src/simulation/core/PhysicsAdapter";

const traversal = {
  sprintStamina: 100,
  sprintRecoveryDelaySeconds: 0,
  sprintExhausted: false,
  isGrounded: true
};

function pose(x: number, rotationY = 0): ResolvedPlayerPose {
  return { x, y: 0.5, z: 0, rotationY, traversal };
}

describe("PlayerPresentationBuffer", () => {
  it("interpolates fixed-step position and shortest-path yaw", () => {
    const buffer = new PlayerPresentationBuffer();
    buffer.reset(pose(0, Math.PI - 0.1));
    const next = pose(3.2 / 60, -Math.PI + 0.1);
    buffer.push(next, {
      ...stationaryPlayerMotion(next),
      velocity: { x: 3.2, y: 0, z: 0 },
      speedMetersPerSecond: 3.2,
      requestedGait: "walk"
    });
    const halfway = buffer.sample(0.5)!;
    expect(halfway.x).toBeCloseTo(3.2 / 120, 7);
    expect(Math.abs(halfway.rotationY)).toBeCloseTo(Math.PI, 6);
  });

  it("snaps teleports instead of interpolating through the world", () => {
    const buffer = new PlayerPresentationBuffer();
    buffer.reset(pose(0));
    buffer.push(pose(20), stationaryPlayerMotion(pose(20)));
    expect(buffer.sample(0)?.x).toBe(20);
  });

  it.each(["boarding", "docking", "dismounting", "teleport"] as const)(
    "retains %s provenance through fixed steps before the first presented frame",
    (reason) => {
      const buffer = new PlayerPresentationBuffer();
      buffer.reset(pose(0));
      const previousSequence = buffer.sample(0)!.discontinuitySequence;
      buffer.pushCanonicalPose(pose(2), { discontinuity: reason });
      // The app still pushes stationary canonical samples while an attachment
      // input lock or pause prevents movement. Rendering may follow several.
      for (let step = 0; step < 3; step++) buffer.pushCanonicalPose(pose(2));
      const firstPresented = buffer.sample(0.5)!;
      expect(firstPresented.discontinuitySequence).toBe(previousSequence + 1);
      expect(firstPresented.discontinuityReason).toBe(reason);
      buffer.push(pose(2.01), stationaryPlayerMotion(pose(2.01)));
      expect(buffer.sample(0.5)?.discontinuityReason).toBe(reason);
      buffer.pushCanonicalPose(pose(4), { discontinuity: "recovery" });
      expect(buffer.sample(0.5)?.discontinuityReason).toBe("recovery");
      expect(buffer.sample(0.5)?.discontinuitySequence).toBe(previousSequence + 2);
    }
  );

  it("produces equivalent one-second movement at 60, 120, and 240 Hz render rates", () => {
    const sampleAtRate = (renderHz: number): number => {
      const fixed = 1 / 60;
      const renderDelta = 1 / renderHz;
      const buffer = new PlayerPresentationBuffer();
      buffer.reset(pose(0));
      let accumulator = 0;
      let canonicalX = 0;
      let presentedX = 0;
      for (let frame = 0; frame < renderHz; frame++) {
        accumulator += renderDelta;
        while (accumulator + 1e-10 >= fixed) {
          canonicalX += 3.2 * fixed;
          const next = pose(canonicalX);
          buffer.push(next, {
            ...stationaryPlayerMotion(next),
            velocity: { x: 3.2, y: 0, z: 0 },
            speedMetersPerSecond: 3.2,
            requestedGait: "walk"
          });
          accumulator -= fixed;
        }
        presentedX = buffer.sample(accumulator / fixed, renderDelta)!.x;
      }
      return presentedX;
    };
    const results = [60, 120, 240].map(sampleAtRate);
    expect(Math.max(...results) - Math.min(...results)).toBeLessThan(0.001);
    expect(results[0]).toBeCloseTo(3.2 - 3.2 / 60, 4);
  });

  it("smooths a semantic target-facing turn consistently across render rates", () => {
    const sampleAtRate = (renderHz: number): number => {
      const buffer = new PlayerPresentationBuffer();
      buffer.reset(pose(0, 0));
      buffer.pushCanonicalPose(pose(0, Math.PI / 2));
      let frame = buffer.sample(0, 0)!;
      for (let index = 0; index < Math.ceil(renderHz * 0.32); index++) {
        frame = buffer.sample(1, 1 / renderHz)!;
      }
      return frame.rotationY;
    };
    for (const yaw of [60, 120, 240].map(sampleAtRate)) {
      expect(yaw).toBeCloseTo(Math.PI / 2, 4);
    }
  });
});
