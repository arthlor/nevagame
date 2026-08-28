import * as THREE from "three";
import type { CharacterPoseSnapshot, RagdollJointSpec } from "./RagdollBoneMapping";

export interface PDMotorConfig {
  /** Angular tracking response rate in rad/s (default: 18.0) */
  angularTrackingSpeed: number;
  /** Linear position tracking response rate in m/s (default: 20.0) */
  linearTrackingSpeed: number;
  /** Global stiffness multiplier for active motor torques (default: 1.0) */
  stiffnessMultiplier: number;
  /** Global damping multiplier for active motor torques (default: 1.0) */
  dampingMultiplier: number;
  /** Maximum torque clamp multiplier (default: 1.0) */
  maxTorqueMultiplier: number;
}

export const DEFAULT_PD_MOTOR_CONFIG: Readonly<PDMotorConfig> = {
  angularTrackingSpeed: 18.0,
  linearTrackingSpeed: 20.0,
  stiffnessMultiplier: 1.0,
  dampingMultiplier: 1.0,
  maxTorqueMultiplier: 1.0
};

/**
 * RagdollMotorController
 *
 * Implements proportional-derivative (PD) active motorized tracking of target animation
 * poses with spring-damper compliance during locomotion, farming, and actions.
 */
export class RagdollMotorController {
  private config: PDMotorConfig;
  private readonly tempQuat = new THREE.Quaternion();
  private readonly tempVec = new THREE.Vector3();
  private readonly tempDeltaQuat = new THREE.Quaternion();

  public constructor(config: Partial<PDMotorConfig> = {}) {
    this.config = { ...DEFAULT_PD_MOTOR_CONFIG, ...config };
  }

  public getConfig(): Readonly<PDMotorConfig> {
    return this.config;
  }

  public setConfig(config: Partial<PDMotorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Updates bone transforms towards target keyframe pose using PD spring-damper compliance.
   *
   * @param boneTransforms Map of bone name to current position and quaternion
   * @param targetPose Target character animation pose snapshot
   * @param dt Timestep in seconds
   */
  public updateTracking(
    boneTransforms: Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }>,
    targetPose: CharacterPoseSnapshot,
    dt: number
  ): void {
    const safeDt = Math.max(0, Number.isFinite(dt) ? dt : 0);
    if (safeDt <= 0) return;

    const angularFactor = Math.min(1.0, this.config.angularTrackingSpeed * safeDt);
    const linearFactor = Math.min(1.0, this.config.linearTrackingSpeed * safeDt);

    for (const [boneName, targetTransform] of Object.entries(targetPose.bones)) {
      const current = boneTransforms.get(boneName);
      if (!current) continue;

      this.tempQuat.set(
        targetTransform.rotation[0],
        targetTransform.rotation[1],
        targetTransform.rotation[2],
        targetTransform.rotation[3]
      );
      this.tempVec.set(
        targetTransform.position[0],
        targetTransform.position[1],
        targetTransform.position[2]
      );

      // Slerp orientation with joint motor stiffness
      current.quaternion.slerp(this.tempQuat, angularFactor);
      // Lerp position with linear compliance
      current.position.lerp(this.tempVec, linearFactor);
    }
  }

  /**
   * Computes restorative PD motor torque for a constrained joint.
   *
   * tau = K_p * angle_error - K_d * angular_velocity
   *
   * @param currentRotation Current rotation quaternion of the child bone
   * @param targetRotation Target rotation quaternion from animation clip
   * @param currentAngularVel Current angular velocity vector in rad/s
   * @param jointSpec Joint stiffness, damping, and torque limits
   * @param dt Timestep in seconds
   * @returns Restorative torque vector clamped to joint's maxTorque
   */
  public computeJointTorque(
    currentRotation: THREE.Quaternion,
    targetRotation: THREE.Quaternion,
    currentAngularVel: THREE.Vector3,
    jointSpec: Pick<RagdollJointSpec, "stiffness" | "damping" | "maxTorque">,
    dt: number
  ): THREE.Vector3 {
    if (!Number.isFinite(dt) || dt <= 0) {
      return new THREE.Vector3(0, 0, 0);
    }

    // Delta rotation: q_delta = target * current^-1
    this.tempDeltaQuat.copy(currentRotation).invert().premultiply(targetRotation);

    // Convert delta quaternion to rotation axis and angle
    let angle = 2 * Math.acos(Math.max(-1, Math.min(1, this.tempDeltaQuat.w)));
    if (angle > Math.PI) {
      angle -= 2 * Math.PI;
    }

    const sinHalfAngle = Math.sqrt(Math.max(0, 1 - this.tempDeltaQuat.w * this.tempDeltaQuat.w));
    const axis = new THREE.Vector3();
    if (sinHalfAngle > 0.0001) {
      axis.set(
        this.tempDeltaQuat.x / sinHalfAngle,
        this.tempDeltaQuat.y / sinHalfAngle,
        this.tempDeltaQuat.z / sinHalfAngle
      );
    } else {
      axis.set(0, 0, 0);
    }

    // Transform axis to current world space
    axis.applyQuaternion(currentRotation);

    const kp = jointSpec.stiffness * this.config.stiffnessMultiplier;
    const kd = jointSpec.damping * this.config.dampingMultiplier;
    const maxT = jointSpec.maxTorque * this.config.maxTorqueMultiplier;

    // Proportional torque
    const springTorque = axis.multiplyScalar(kp * angle);

    // Derivative torque (damping against current angular velocity)
    const dampingTorque = currentAngularVel.clone().multiplyScalar(-kd);

    // Combined PD torque
    const totalTorque = springTorque.add(dampingTorque);

    // Clamp torque magnitude to maxTorque limit
    const torqueMagnitude = totalTorque.length();
    if (torqueMagnitude > maxT && torqueMagnitude > 0.0001) {
      totalTorque.multiplyScalar(maxT / torqueMagnitude);
    }

    return totalTorque;
  }
}
