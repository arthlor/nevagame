/**
 * Neva Character Overhaul — Ragdoll Bone & Joint Specifications
 *
 * Defines 12 rigid body segment specs and 11 anatomical joint instances
 * matching the Neva humanoid skeletal armature.
 */

export type RagdollMode = "kinematic-active" | "physical-ragdoll" | "recovering";

export interface RagdollBodySpec {
  boneName: string;
  shape: "capsule" | "box" | "sphere";
  halfExtents: [number, number, number]; // [radius, halfHeight, 0] for capsule, [hx, hy, hz] for box, [r, 0, 0] for sphere
  massKg: number;
  linearDamping: number;
  angularDamping: number;
  friction: number;
  restitution: number;
}

export interface RagdollJointSpec {
  name: string;
  parentBone: string;
  childBone: string;
  type: "spherical" | "revolute";
  anchor: [number, number, number];
  axis?: [number, number, number]; // for revolute
  minAngleLimitRad: number;
  maxAngleLimitRad: number;
  stiffness: number;
  damping: number;
  maxTorque: number;
}

export interface CharacterPoseSnapshot {
  rootPosition: [number, number, number];
  rootRotation: [number, number, number, number]; // Quaternion [x, y, z, w]
  bones: Record<string, { position: [number, number, number]; rotation: [number, number, number, number] }>;
}

export interface RagdollRecoverySample {
  progress: number; // 0.0 to 1.0
  isSettled: boolean;
  orientation: "prone" | "supine";
  rootPosition: [number, number, number];
  blendedBones: Map<string, { position: [number, number, number]; quaternion: [number, number, number, number] }>;
}

// 12 physical rigid body segments matching the Humanoid Armature.
export const RAGDOLL_BODIES: readonly RagdollBodySpec[] = [
  { boneName: "rig_pelvis", shape: "box", halfExtents: [0.18, 0.12, 0.14], massKg: 14.0, linearDamping: 0.6, angularDamping: 1.2, friction: 0.86, restitution: 0.1 },
  { boneName: "rig_spine", shape: "box", halfExtents: [0.16, 0.14, 0.12], massKg: 16.0, linearDamping: 0.6, angularDamping: 1.2, friction: 0.86, restitution: 0.1 },
  { boneName: "rig_chest", shape: "box", halfExtents: [0.19, 0.13, 0.14], massKg: 18.0, linearDamping: 0.6, angularDamping: 1.2, friction: 0.86, restitution: 0.1 },
  { boneName: "rig_head", shape: "sphere", halfExtents: [0.13, 0, 0], massKg: 5.0, linearDamping: 0.6, angularDamping: 1.2, friction: 0.86, restitution: 0.1 },
  { boneName: "rig_upper_arm_left", shape: "capsule", halfExtents: [0.06, 0.14, 0], massKg: 3.5, linearDamping: 0.6, angularDamping: 1.2, friction: 0.86, restitution: 0.1 },
  { boneName: "rig_forearm_left", shape: "capsule", halfExtents: [0.05, 0.12, 0], massKg: 2.5, linearDamping: 0.6, angularDamping: 1.2, friction: 0.86, restitution: 0.1 },
  { boneName: "rig_upper_arm_right", shape: "capsule", halfExtents: [0.06, 0.14, 0], massKg: 3.5, linearDamping: 0.6, angularDamping: 1.2, friction: 0.86, restitution: 0.1 },
  { boneName: "rig_forearm_right", shape: "capsule", halfExtents: [0.05, 0.12, 0], massKg: 2.5, linearDamping: 0.6, angularDamping: 1.2, friction: 0.86, restitution: 0.1 },
  { boneName: "rig_thigh_left", shape: "capsule", halfExtents: [0.08, 0.20, 0], massKg: 8.5, linearDamping: 0.6, angularDamping: 1.2, friction: 0.86, restitution: 0.1 },
  { boneName: "rig_shin_left", shape: "capsule", halfExtents: [0.07, 0.18, 0], massKg: 4.5, linearDamping: 0.6, angularDamping: 1.2, friction: 0.86, restitution: 0.1 },
  { boneName: "rig_thigh_right", shape: "capsule", halfExtents: [0.08, 0.20, 0], massKg: 8.5, linearDamping: 0.6, angularDamping: 1.2, friction: 0.86, restitution: 0.1 },
  { boneName: "rig_shin_right", shape: "capsule", halfExtents: [0.07, 0.18, 0], massKg: 4.5, linearDamping: 0.6, angularDamping: 1.2, friction: 0.86, restitution: 0.1 }
];

// 11 anatomical joint instances connecting the segment bodies.
export const RAGDOLL_JOINTS: readonly RagdollJointSpec[] = [
  { name: "joint_pelvis_spine", parentBone: "rig_pelvis", childBone: "rig_spine", type: "spherical", anchor: [0, 0.12, 0], minAngleLimitRad: -0.45, maxAngleLimitRad: 0.45, stiffness: 220, damping: 25, maxTorque: 350 },
  { name: "joint_spine_chest", parentBone: "rig_spine", childBone: "rig_chest", type: "spherical", anchor: [0, 0.14, 0], minAngleLimitRad: -0.40, maxAngleLimitRad: 0.40, stiffness: 240, damping: 28, maxTorque: 380 },
  { name: "joint_chest_head", parentBone: "rig_chest", childBone: "rig_head", type: "spherical", anchor: [0, 0.15, 0], minAngleLimitRad: -0.55, maxAngleLimitRad: 0.55, stiffness: 150, damping: 18, maxTorque: 120 },
  { name: "joint_shoulder_left", parentBone: "rig_chest", childBone: "rig_upper_arm_left", type: "spherical", anchor: [-0.20, 0.10, 0], minAngleLimitRad: -1.60, maxAngleLimitRad: 1.60, stiffness: 120, damping: 14, maxTorque: 160 },
  { name: "joint_elbow_left", parentBone: "rig_upper_arm_left", childBone: "rig_forearm_left", type: "revolute", anchor: [0, -0.14, 0], axis: [1, 0, 0], minAngleLimitRad: 0.0, maxAngleLimitRad: 2.50, stiffness: 100, damping: 12, maxTorque: 120 },
  { name: "joint_shoulder_right", parentBone: "rig_chest", childBone: "rig_upper_arm_right", type: "spherical", anchor: [0.20, 0.10, 0], minAngleLimitRad: -1.60, maxAngleLimitRad: 1.60, stiffness: 120, damping: 14, maxTorque: 160 },
  { name: "joint_elbow_right", parentBone: "rig_upper_arm_right", childBone: "rig_forearm_right", type: "revolute", anchor: [0, -0.14, 0], axis: [1, 0, 0], minAngleLimitRad: 0.0, maxAngleLimitRad: 2.50, stiffness: 100, damping: 12, maxTorque: 120 },
  { name: "joint_hip_left", parentBone: "rig_pelvis", childBone: "rig_thigh_left", type: "spherical", anchor: [-0.14, -0.12, 0], minAngleLimitRad: -1.40, maxAngleLimitRad: 1.40, stiffness: 260, damping: 30, maxTorque: 450 },
  { name: "joint_knee_left", parentBone: "rig_thigh_left", childBone: "rig_shin_left", type: "revolute", anchor: [0, -0.20, 0], axis: [1, 0, 0], minAngleLimitRad: 0.0, maxAngleLimitRad: 2.45, stiffness: 200, damping: 24, maxTorque: 380 },
  { name: "joint_hip_right", parentBone: "rig_pelvis", childBone: "rig_thigh_right", type: "spherical", anchor: [0.14, -0.12, 0], minAngleLimitRad: -1.40, maxAngleLimitRad: 1.40, stiffness: 260, damping: 30, maxTorque: 450 },
  { name: "joint_knee_right", parentBone: "rig_thigh_right", childBone: "rig_shin_right", type: "revolute", anchor: [0, -0.20, 0], axis: [1, 0, 0], minAngleLimitRad: 0.0, maxAngleLimitRad: 2.45, stiffness: 200, damping: 24, maxTorque: 380 }
];

export function findBodySpec(boneName: string): RagdollBodySpec | undefined {
  return RAGDOLL_BODIES.find((b) => b.boneName === boneName);
}

export function findJointSpec(jointName: string): RagdollJointSpec | undefined {
  return RAGDOLL_JOINTS.find((j) => j.name === jointName);
}

export function findJointsForBone(boneName: string): RagdollJointSpec[] {
  return RAGDOLL_JOINTS.filter((j) => j.parentBone === boneName || j.childBone === boneName);
}

export function totalRagdollMass(): number {
  return RAGDOLL_BODIES.reduce((acc, b) => acc + b.massKg, 0);
}
