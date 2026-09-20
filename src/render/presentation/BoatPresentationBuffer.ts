import type { ResolvedBoatPose } from "../../simulation/core/PhysicsAdapter";

export type PresentedBoatPose = ResolvedBoatPose;

/**
 * A boat's visual can move by itself. The camera follows the interpolated
 * player, and while aboard that focus is also interpolated, so a hull written
 * straight from canonical state advances in fixed-step stamps against a display
 * whose refresh does not divide 60 — visible as judder, and as the waterline
 * flickering under the bow. This is the boat counterpart of
 * `PlayerPresentationBuffer`: fixed steps are retained and sampled at render
 * time. Canonical pose stays simulation-owned; presented poses are read-only.
 */
export class BoatPresentationBuffer {
  private readonly previous = new Map<string, ResolvedBoatPose>();
  private readonly current = new Map<string, ResolvedBoatPose>();

  /** Teleport-sized jumps snap instead of interpolating through the world. */
  private static readonly SNAP_DISTANCE_METERS = 1.25;

  public reset(boats: Readonly<Record<string, ResolvedBoatPose>>): void {
    this.previous.clear();
    this.current.clear();
    this.push(boats);
  }

  public push(
    boats: Readonly<Record<string, ResolvedBoatPose>>,
    options: { snap?: boolean } = {}
  ): void {
    for (const [boatId, pose] of Object.entries(boats)) {
      const current = this.current.get(boatId);
      if (!current) {
        this.previous.set(boatId, copyPose(pose));
        this.current.set(boatId, copyPose(pose));
        continue;
      }
      const moved = Math.hypot(pose.x - current.x, pose.z - current.z);
      if (options.snap || moved > BoatPresentationBuffer.SNAP_DISTANCE_METERS) {
        this.previous.set(boatId, copyPose(pose));
        this.current.set(boatId, copyPose(pose));
        continue;
      }
      this.previous.set(boatId, current);
      this.current.set(boatId, copyPose(pose));
    }
    for (const boatId of [...this.current.keys()]) {
      if (boats[boatId]) continue;
      this.previous.delete(boatId);
      this.current.delete(boatId);
    }
  }

  /**
   * Render-time pose between the last two fixed steps (`alpha` is the
   * accumulator's fraction of a step). Boats without a retained step are
   * absent, and the caller falls back to canonical state.
   */
  public sample(alpha: number): Record<string, PresentedBoatPose> {
    const t = Math.min(1, Math.max(0, alpha));
    const sampled: Record<string, PresentedBoatPose> = {};
    for (const [boatId, current] of this.current) {
      const previous = this.previous.get(boatId) ?? current;
      sampled[boatId] = {
        x: lerp(previous.x, current.x, t),
        y: lerp(previous.y, current.y, t),
        z: lerp(previous.z, current.z, t),
        headingRadians: wrapAngle(
          previous.headingRadians
            + shortestAngle(previous.headingRadians, current.headingRadians) * t
        ),
        speed: lerp(previous.speed, current.speed, t)
      };
    }
    return sampled;
  }
}

function copyPose(pose: ResolvedBoatPose): ResolvedBoatPose {
  return {
    x: pose.x,
    y: pose.y,
    z: pose.z,
    headingRadians: pose.headingRadians,
    speed: pose.speed
  };
}

function shortestAngle(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}
