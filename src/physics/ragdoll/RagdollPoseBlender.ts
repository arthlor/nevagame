import * as THREE from "three";
import type { CharacterPoseSnapshot, RagdollRecoverySample } from "./RagdollBoneMapping";

export interface PoseBlenderConfig {
  /** Linear speed threshold for settle detection in m/s (default: 0.20) */
  settleVelocityThreshold: number;
  /** Angular speed threshold for settle detection in rad/s (default: 0.50) */
  settleAngularVelocityThreshold: number;
  /** Required consecutive frames within threshold to declare settled (default: 15) */
  settleRequiredFrames: number;
  /** Maximum physical ragdoll duration before forcing settle in seconds (default: 3.0) */
  ragdollTimeoutSeconds: number;
  /** Duration of Slerp pose recovery blending in seconds (default: 0.35) */
  recoveryDuration: number;
}

export const DEFAULT_POSE_BLENDER_CONFIG: Readonly<PoseBlenderConfig> = {
  settleVelocityThreshold: 0.20,
  settleAngularVelocityThreshold: 0.50,
  settleRequiredFrames: 15,
  ragdollTimeoutSeconds: 3.0,
  recoveryDuration: 0.35
};

/**
 * RagdollPoseBlender
 *
 * Coordinates settle detection, prone/supine posture classification,
 * kinematic root realignment, and smooth 0.35s Slerp pose recovery blending.
 */
export class RagdollPoseBlender {
  private config: PoseBlenderConfig;
  private settleConsecutiveFrames = 0;
  private isSettled = false;
  private recoveryElapsed = 0;
  private ragdollTotalTime = 0;

  public constructor(config: Partial<PoseBlenderConfig> = {}) {
    this.config = { ...DEFAULT_POSE_BLENDER_CONFIG, ...config };
  }

  public getConfig(): Readonly<PoseBlenderConfig> {
    return this.config;
  }

  public setConfig(config: Partial<PoseBlenderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Resets settle and recovery timing counters for a new ragdoll sequence.
   */
  public reset(): void {
    this.settleConsecutiveFrames = 0;
    this.isSettled = false;
    this.recoveryElapsed = 0;
    this.ragdollTotalTime = 0;
  }

  /**
   * Evaluates whether the physical ragdoll has settled to rest.
   *
   * @param linearSpeed Linear velocity magnitude in m/s
   * @param angularSpeed Angular velocity magnitude in rad/s
   * @param dt Timestep in seconds
   * @returns True if settled or timed out
   */
  public checkSettle(linearSpeed: number, angularSpeed: number, dt: number): boolean {
    const safeDt = Math.max(0, Number.isFinite(dt) ? dt : 0);
    this.ragdollTotalTime += safeDt;

    const withinSpeedThreshold =
      linearSpeed < this.config.settleVelocityThreshold &&
      angularSpeed < this.config.settleAngularVelocityThreshold;

    const isTimedOut = this.ragdollTotalTime >= this.config.ragdollTimeoutSeconds;

    if (withinSpeedThreshold || isTimedOut) {
      this.settleConsecutiveFrames++;
      if (this.settleConsecutiveFrames >= this.config.settleRequiredFrames || isTimedOut) {
        this.isSettled = true;
        return true;
      }
    } else {
      this.settleConsecutiveFrames = 0;
    }

    return false;
  }

  public getIsSettled(): boolean {
    return this.isSettled;
  }

  public getRagdollTotalTime(): number {
    return this.ragdollTotalTime;
  }

  public getConsecutiveSettledFrames(): number {
    return this.settleConsecutiveFrames;
  }

  /**
   * Classifies the resting orientation of the ragdoll as "prone" (face down) or "supine" (face up).
   *
   * @param chestQuaternion Orientation quaternion of the chest or spine bone
   */
  public determineOrientation(chestQuaternion?: THREE.Quaternion): "prone" | "supine" {
    if (!chestQuaternion) return "prone";
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(chestQuaternion);
    // If forward vector points downwards (dot with world up < 0), player is prone (face down)
    return forward.y < 0 ? "prone" : "supine";
  }

  /**
   * Updates smooth Slerp pose recovery blending over 0.35s towards the target get-up / idle pose.
   *
   * @param boneTransforms Current ragdoll bone transforms
   * @param rootPosition Current ragdoll root position
   * @param targetPose Target character keyframed pose
   * @param dt Timestep in seconds
   * @param orientation Resting orientation ("prone" | "supine")
   * @returns Recovery sample or null if invalid
   */
  public updateRecovery(
    boneTransforms: Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }>,
    rootPosition: THREE.Vector3,
    targetPose: CharacterPoseSnapshot,
    dt: number,
    orientation: "prone" | "supine"
  ): RagdollRecoverySample {
    const safeDt = Math.max(0, Number.isFinite(dt) ? dt : 0);
    this.recoveryElapsed += safeDt;

    const progress = Math.min(1.0, this.recoveryElapsed / this.config.recoveryDuration);
    const blendedBones = new Map<string, { position: [number, number, number]; quaternion: [number, number, number, number] }>();

    for (const [boneName, current] of boneTransforms) {
      const target = targetPose.bones[boneName] ?? {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1]
      };

      const targetQ = new THREE.Quaternion(
        target.rotation[0],
        target.rotation[1],
        target.rotation[2],
        target.rotation[3]
      );
      const blendedQ = current.quaternion.clone().slerp(targetQ, progress);
      const blendedPos = current.position.clone().lerp(
        new THREE.Vector3(target.position[0], target.position[1], target.position[2]),
        progress
      );

      blendedBones.set(boneName, {
        position: [blendedPos.x, blendedPos.y, blendedPos.z],
        quaternion: [blendedQ.x, blendedQ.y, blendedQ.z, blendedQ.w]
      });
    }

    return {
      progress,
      isSettled: this.isSettled,
      orientation,
      rootPosition: [rootPosition.x, rootPosition.y, rootPosition.z],
      blendedBones
    };
  }

  public isRecoveryComplete(): boolean {
    return this.recoveryElapsed >= this.config.recoveryDuration;
  }
}
