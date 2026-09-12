import { describe, expect, it } from "vitest";

import {
  acknowledgeHeadYaw,
  ACKNOWLEDGE_HEAD_TURN_RADIUS_METERS,
  distanceSquaredToPresence,
  headingFromPointToPresence,
  presenceFalloff
} from "../../src/render/presentation/WorldAcknowledgment";
import {
  IDLE_PLAYER_PRESENCE,
  samplePlayerPresence,
  type PlayerPresence
} from "../../src/render/presentation/PlayerPresence";

function presence(overrides: Partial<PlayerPresence> = {}): PlayerPresence {
  return { ...IDLE_PLAYER_PRESENCE, ...overrides };
}

describe("WorldAcknowledgment", () => {
  it("measures squared distance from a presence to a world point", () => {
    expect(distanceSquaredToPresence(presence({ x: 3, z: 4 }), 0, 0)).toBe(25);
  });

  it("falls off smoothly from one at the centre to zero at the radius", () => {
    const player = presence({ x: 0, z: 0 });
    expect(presenceFalloff(player, 0, 0, 4)).toBeCloseTo(1, 6);
    expect(presenceFalloff(player, 4, 0, 4)).toBeCloseTo(0, 6);
    expect(presenceFalloff(player, 8, 0, 4)).toBe(0);
    const midpoint = presenceFalloff(player, 2, 0, 4);
    expect(midpoint).toBeGreaterThan(0);
    expect(midpoint).toBeLessThan(1);
  });

  it("returns zero falloff for a zero radius instead of dividing by zero", () => {
    expect(presenceFalloff(presence(), 1, 1, 0)).toBe(0);
  });

  it("turns a person's head toward a nearby player and releases outside the radius", () => {
    const player = presence({ x: 0, z: 5, moving: true });
    const facing = headingFromPointToPresence(player, 0, 0);
    if (facing > Math.PI / 2 || facing < -Math.PI / 2) throw new Error("test setup expected facing forward");
    const yaw = acknowledgeHeadYaw(player, 0, 0, facing);
    expect(Math.abs(yaw)).toBeLessThan(1e-6);

    const far = presence({ x: 0, z: ACKNOWLEDGE_HEAD_TURN_RADIUS_METERS + 1 });
    expect(acknowledgeHeadYaw(far, 0, 0, 0)).toBe(0);
  });

  it("wraps the relative heading into a readable range", () => {
    const player = presence({ x: 0, z: -1 });
    const yaw = acknowledgeHeadYaw(player, 0, 0, 0);
    expect(Math.abs(yaw)).toBeLessThanOrEqual(Math.PI);
    expect(yaw).toBeCloseTo(Math.PI, 5);
  });
});

describe("samplePlayerPresence", () => {
  it("derives moving from resolved speed and keeps the target allocation", () => {
    const target = presence();
    const moving = samplePlayerPresence(
      { x: 1, y: 2, z: 3, rotationY: 0.5, motion: { speedMetersPerSecond: 2 } as never },
      { mode: "on-foot", mounted: false, reducedMotion: false },
      target
    );
    expect(moving).toBe(target);
    expect(moving.moving).toBe(true);
    expect(moving.x).toBe(1);
    expect(moving.facingRadians).toBe(0.5);
  });

  it("treats a still frame as idle", () => {
    const still = samplePlayerPresence(
      { x: 0, y: 0, z: 0, rotationY: 0, motion: { speedMetersPerSecond: 0 } as never },
      { mode: "on-foot", mounted: false, reducedMotion: false }
    );
    expect(still.moving).toBe(false);
  });
});
