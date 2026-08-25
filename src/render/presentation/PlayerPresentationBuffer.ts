import type {
  PlayerMotionSample,
  ResolvedPlayerPose
} from "../../simulation/core/PhysicsAdapter";

export interface PresentedPlayerFrame extends ResolvedPlayerPose {
  motion: PlayerMotionSample;
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

  public reset(pose: ResolvedPlayerPose, motion = stationaryPlayerMotion(pose)): void {
    const frame = copyFrame(pose, motion);
    this.previous = frame;
    this.current = copyFrame(frame, frame.motion);
    this.facingTurn = null;
  }

  public push(
    pose: ResolvedPlayerPose,
    motion: PlayerMotionSample,
    options: { snap?: boolean } = {}
  ): void {
    if (!this.current) {
      this.reset(pose, motion);
      return;
    }
    const distance = Math.hypot(pose.x - this.current.x, pose.y - this.current.y, pose.z - this.current.z);
    if (options.snap || distance > TELEPORT_SNAP_DISTANCE_METERS) {
      this.reset(pose, motion);
      return;
    }
    this.previous = this.current;
    this.current = copyFrame(pose, motion);
    if (motion.speedMetersPerSecond > 0.1) this.facingTurn = null;
  }

  public pushCanonicalPose(
    pose: ResolvedPlayerPose,
    options: { snap?: boolean; fixedDeltaSeconds?: number } = {}
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
    if (!this.previous) return copyFrame(this.current, this.current.motion);
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
      motion
    };
  }
}

function copyFrame(
  pose: ResolvedPlayerPose,
  motion: PlayerMotionSample
): PresentedPlayerFrame {
  return {
    x: pose.x,
    y: pose.y,
    z: pose.z,
    rotationY: pose.rotationY,
    traversal: { ...pose.traversal },
    motion: {
      ...motion,
      velocity: { ...motion.velocity }
    }
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
