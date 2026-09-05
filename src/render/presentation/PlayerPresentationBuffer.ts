import type {
  PlayerMotionSample,
  ResolvedPlayerPose
} from "../../simulation/core/PhysicsAdapter";

export interface PresentedPlayerFrame extends ResolvedPlayerPose {
  motion: PlayerMotionSample;
  discontinuityReason: PresentationDiscontinuityReason;
  discontinuitySequence: number;
}

export type PresentationDiscontinuityReason =
  | "none"
  | "teleport"
  | "load"
  | "recovery"
  | "boarding"
  | "dismounting"
  | "docking";

export interface PresentationPushOptions {
  snap?: boolean;
  discontinuity?: Exclude<PresentationDiscontinuityReason, "none">;
}

const TELEPORT_SNAP_DISTANCE_METERS = 1.25;

export function stationaryPlayerMotion(
  pose: Pick<ResolvedPlayerPose, "traversal">
): PlayerMotionSample {
  return {
    velocity: { x: 0, y: 0, z: 0 },
    speedMetersPerSecond: 0,
    accelerationMetersPerSecondSquared: 0,
    turnRateRadiansPerSecond: 0,
    isGrounded: pose.traversal.isGrounded,
    groundNormal: { x: 0, y: 1, z: 0 },
    slopeRadians: 0,
    airbornePhase: pose.traversal.isGrounded ? "grounded" : "falling",
    contactEvent: "none",
    landingImpactStrength: 0,
    contactSurface: "unknown",
    isCollisionBlocked: false,
    requestedGait: "idle"
  };
}

/**
 * Keeps rendering one fixed step behind canonical simulation state so render
 * refresh rate never leaks into movement speed or animation selection.
 */
export class PlayerPresentationBuffer {
  private previous: PresentedPlayerFrame | null = null;
  private current: PresentedPlayerFrame | null = null;
  private facingTurn: { from: number; to: number; elapsed: number; duration: number } | null = null;
  private discontinuitySequence = 0;

  public reset(
    pose: ResolvedPlayerPose,
    motion = stationaryPlayerMotion(pose),
    discontinuityReason: PresentationDiscontinuityReason = "none"
  ): void {
    if (discontinuityReason !== "none") this.discontinuitySequence += 1;
    const frame = copyFrame(
      pose,
      motion,
      discontinuityReason,
      this.discontinuitySequence
    );
    this.previous = frame;
    this.current = copyFrame(
      frame,
      frame.motion,
      discontinuityReason,
      this.discontinuitySequence
    );
    this.facingTurn = null;
  }

  public push(
    pose: ResolvedPlayerPose,
    motion: PlayerMotionSample,
    options: PresentationPushOptions = {}
  ): void {
    if (!this.current) {
      this.reset(pose, motion, options.discontinuity ?? "none");
      return;
    }
    const distance = Math.hypot(pose.x - this.current.x, pose.y - this.current.y, pose.z - this.current.z);
    if (options.snap || options.discontinuity || distance > TELEPORT_SNAP_DISTANCE_METERS) {
      this.reset(
        pose,
        motion,
        options.discontinuity ?? "teleport"
      );
      return;
    }
    this.previous = this.current;
    // The reason describes the sequence, not just one physics sample. Several
    // stationary steps can arrive before render consumes a boarding event.
    this.current = copyFrame(pose, motion, this.previous.discontinuityReason, this.discontinuitySequence);
    if (motion.speedMetersPerSecond > 0.1) this.facingTurn = null;
  }

  public pushCanonicalPose(
    pose: ResolvedPlayerPose,
    options: PresentationPushOptions & { fixedDeltaSeconds?: number } = {}
  ): void {
    const motion = stationaryPlayerMotion(pose);
    if (this.current && !options.snap) {
      const dt = Math.max(0.0001, options.fixedDeltaSeconds ?? 1 / 60);
      motion.turnRateRadiansPerSecond = shortestAngle(
        this.current.rotationY,
        pose.rotationY
      ) / dt;
      const turnAngle = shortestAngle(this.current.rotationY, pose.rotationY);
      if (Math.abs(turnAngle) > 0.01) {
        this.facingTurn = {
          from: this.current.rotationY,
          to: pose.rotationY,
          elapsed: 0,
          duration: clamp(Math.abs(turnAngle) / Math.PI * 0.42, 0.14, 0.32)
        };
      }
    }
    this.push(pose, motion, options);
  }

  public sample(alpha: number, renderDeltaSeconds: number = 0): PresentedPlayerFrame | null {
    if (!this.current) return null;
    if (!this.previous) {
      return copyFrame(
        this.current,
        this.current.motion,
        this.current.discontinuityReason,
        this.current.discontinuitySequence
      );
    }
    const t = clamp(alpha, 0, 1);
    const previous = this.previous;
    const current = this.current;
    const motion = interpolateMotion(previous.motion, current.motion, t);
    let rotationY = wrapAngle(
      previous.rotationY + shortestAngle(previous.rotationY, current.rotationY) * t
    );
    if (this.facingTurn) {
      this.facingTurn.elapsed = Math.min(
        this.facingTurn.duration,
        this.facingTurn.elapsed + Math.max(0, renderDeltaSeconds)
      );
      const turnProgress = smoothStep(this.facingTurn.elapsed / this.facingTurn.duration);
      rotationY = wrapAngle(
        this.facingTurn.from + shortestAngle(this.facingTurn.from, this.facingTurn.to) * turnProgress
      );
      if (this.facingTurn.elapsed >= this.facingTurn.duration) this.facingTurn = null;
    }
    return {
      x: lerp(previous.x, current.x, t),
      y: lerp(previous.y, current.y, t),
      z: lerp(previous.z, current.z, t),
      rotationY,
      traversal: {
        ...current.traversal,
        isGrounded: t < 0.5 ? previous.traversal.isGrounded : current.traversal.isGrounded
      },
      motion,
      discontinuityReason: current.discontinuityReason,
      discontinuitySequence: current.discontinuitySequence
    };
  }
}

function copyFrame(
  pose: ResolvedPlayerPose,
  motion: PlayerMotionSample,
  discontinuityReason: PresentationDiscontinuityReason,
  discontinuitySequence: number
): PresentedPlayerFrame {
  return {
    x: pose.x,
    y: pose.y,
    z: pose.z,
    rotationY: pose.rotationY,
    traversal: { ...pose.traversal },
    motion: {
      ...motion,
      velocity: { ...motion.velocity },
      groundNormal: { ...motion.groundNormal }
    },
    discontinuityReason,
    discontinuitySequence
  };
}

function interpolateMotion(
  previous: PlayerMotionSample,
  current: PlayerMotionSample,
  t: number
): PlayerMotionSample {
  return {
    velocity: {
      x: lerp(previous.velocity.x, current.velocity.x, t),
      y: lerp(previous.velocity.y, current.velocity.y, t),
      z: lerp(previous.velocity.z, current.velocity.z, t)
    },
    speedMetersPerSecond: lerp(previous.speedMetersPerSecond, current.speedMetersPerSecond, t),
    accelerationMetersPerSecondSquared: lerp(
      previous.accelerationMetersPerSecondSquared,
      current.accelerationMetersPerSecondSquared,
      t
    ),
    turnRateRadiansPerSecond: lerp(
      previous.turnRateRadiansPerSecond,
      current.turnRateRadiansPerSecond,
      t
    ),
    isGrounded: t < 0.5 ? previous.isGrounded : current.isGrounded,
    groundNormal: {
      x: lerp(previous.groundNormal.x, current.groundNormal.x, t),
      y: lerp(previous.groundNormal.y, current.groundNormal.y, t),
      z: lerp(previous.groundNormal.z, current.groundNormal.z, t)
    },
    slopeRadians: lerp(previous.slopeRadians, current.slopeRadians, t),
    airbornePhase: t < 0.5 ? previous.airbornePhase : current.airbornePhase,
    contactEvent: t < 0.5 ? previous.contactEvent : current.contactEvent,
    landingImpactStrength: lerp(
      previous.landingImpactStrength,
      current.landingImpactStrength,
      t
    ),
    contactSurface: t < 0.5 ? previous.contactSurface : current.contactSurface,
    isCollisionBlocked: t < 0.5 ? previous.isCollisionBlocked : current.isCollisionBlocked,
    requestedGait: t < 0.5 ? previous.requestedGait : current.requestedGait
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothStep(value: number): number {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}
