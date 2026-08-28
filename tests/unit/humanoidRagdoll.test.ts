import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  type CharacterPoseSnapshot,
  DEFAULT_PD_MOTOR_CONFIG,
  DEFAULT_POSE_BLENDER_CONFIG,
  findBodySpec,
  findJointsForBone,
  findJointSpec,
  HumanoidRagdollSystem,
  RAGDOLL_BODIES,
  RAGDOLL_JOINTS,
  RagdollMotorController,
  RagdollPoseBlender,
  SimulatedRagdollSystem,
  totalRagdollMass
} from "../../src/physics/ragdoll";

describe("RagdollBoneMapping Specification & Helpers", () => {
  it("defines 11 rigid body articulable groups across 12 segment specs", () => {
    expect(RAGDOLL_BODIES).toHaveLength(12);

    const boneNames = RAGDOLL_BODIES.map((b) => b.boneName);
    expect(boneNames).toContain("rig_pelvis");
    expect(boneNames).toContain("rig_spine");
    expect(boneNames).toContain("rig_chest");
    expect(boneNames).toContain("rig_head");
    expect(boneNames).toContain("rig_upper_arm_left");
    expect(boneNames).toContain("rig_forearm_left");
    expect(boneNames).toContain("rig_upper_arm_right");
    expect(boneNames).toContain("rig_forearm_right");
    expect(boneNames).toContain("rig_thigh_left");
    expect(boneNames).toContain("rig_shin_left");
    expect(boneNames).toContain("rig_thigh_right");
    expect(boneNames).toContain("rig_shin_right");

    const totalMass = totalRagdollMass();
    expect(totalMass).toBeGreaterThanOrEqual(70);
    expect(totalMass).toBeLessThanOrEqual(95);

    for (const body of RAGDOLL_BODIES) {
      expect(body.massKg).toBeGreaterThan(0);
      expect(body.linearDamping).toBeGreaterThan(0);
      expect(body.angularDamping).toBeGreaterThan(0);
      expect(body.friction).toBeGreaterThan(0);
      expect(body.restitution).toBeGreaterThanOrEqual(0);
    }
  });

  it("defines 10 anatomical joint constraints across 11 joint instances", () => {
    expect(RAGDOLL_JOINTS).toHaveLength(11);

    for (const joint of RAGDOLL_JOINTS) {
      expect(joint.minAngleLimitRad).toBeLessThanOrEqual(joint.maxAngleLimitRad);
      expect(joint.stiffness).toBeGreaterThan(0);
      expect(joint.damping).toBeGreaterThan(0);
      expect(joint.maxTorque).toBeGreaterThan(0);
      expect(joint.anchor).toHaveLength(3);
    }
  });

  it("findBodySpec, findJointSpec, and findJointsForBone retrieve correct entries", () => {
    const pelvis = findBodySpec("rig_pelvis");
    expect(pelvis).toBeDefined();
    expect(pelvis?.shape).toBe("box");
    expect(pelvis?.massKg).toBe(14.0);

    const nonExistent = findBodySpec("non_existent_bone");
    expect(nonExistent).toBeUndefined();

    const elbowL = findJointSpec("joint_elbow_left");
    expect(elbowL).toBeDefined();
    expect(elbowL?.type).toBe("revolute");
    expect(elbowL?.parentBone).toBe("rig_upper_arm_left");
    expect(elbowL?.childBone).toBe("rig_forearm_left");

    const chestJoints = findJointsForBone("rig_chest");
    expect(chestJoints.length).toBeGreaterThanOrEqual(3); // spine_chest, chest_head, shoulder_left, shoulder_right
  });
});

describe("RagdollMotorController", () => {
  it("initializes with default PD config and allows dynamic reconfiguration", () => {
    const controller = new RagdollMotorController();
    expect(controller.getConfig().angularTrackingSpeed).toBe(DEFAULT_PD_MOTOR_CONFIG.angularTrackingSpeed);
    expect(controller.getConfig().linearTrackingSpeed).toBe(DEFAULT_PD_MOTOR_CONFIG.linearTrackingSpeed);

    controller.setConfig({ angularTrackingSpeed: 25.0, stiffnessMultiplier: 1.5 });
    expect(controller.getConfig().angularTrackingSpeed).toBe(25.0);
    expect(controller.getConfig().stiffnessMultiplier).toBe(1.5);
  });

  it("tracks target pose with spring-damper compliance across multiple frames", () => {
    const controller = new RagdollMotorController();
    const boneTransforms = new Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }>();

    boneTransforms.set("rig_upper_arm_left", {
      position: new THREE.Vector3(0, 1.2, 0),
      quaternion: new THREE.Quaternion(0, 0, 0, 1)
    });

    const targetPose: CharacterPoseSnapshot = {
      rootPosition: [0, 0, 0],
      rootRotation: [0, 0, 0, 1],
      bones: {
        rig_upper_arm_left: {
          position: [0.1, 1.3, 0.2],
          rotation: [0.38, 0, 0, 0.92]
        }
      }
    };

    // Step 5 frames
    for (let i = 0; i < 5; i++) {
      controller.updateTracking(boneTransforms, targetPose, 1 / 60);
    }

    const arm = boneTransforms.get("rig_upper_arm_left");
    expect(arm?.quaternion.x).toBeGreaterThan(0.05);
    expect(arm?.position.x).toBeGreaterThan(0.01);
  });

  it("computes restoring PD motor torque and clamps to maxTorque limit", () => {
    const controller = new RagdollMotorController();
    const currentQ = new THREE.Quaternion();
    const targetQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 4); // 45 deg
    const currentAngVel = new THREE.Vector3(0.5, 0, 0);

    const jointSpec = { stiffness: 200, damping: 20, maxTorque: 100 };
    const torque = controller.computeJointTorque(currentQ, targetQ, currentAngVel, jointSpec, 1 / 60);

    expect(Number.isFinite(torque.x)).toBe(true);
    expect(torque.x).toBeGreaterThan(0); // Restoring torque along X
    expect(torque.length()).toBeLessThanOrEqual(100.001);
  });

  it("handles zero dt and zero rotation difference safely", () => {
    const controller = new RagdollMotorController();
    const q = new THREE.Quaternion(0, 0, 0, 1);
    const jointSpec = { stiffness: 200, damping: 20, maxTorque: 100 };

    const zeroTorque = controller.computeJointTorque(q, q, new THREE.Vector3(0, 0, 0), jointSpec, 0);
    expect(zeroTorque.length()).toBe(0);
  });
});

describe("RagdollPoseBlender", () => {
  it("initializes with default config and allows dynamic reconfiguration", () => {
    const blender = new RagdollPoseBlender();
    expect(blender.getConfig().recoveryDuration).toBe(DEFAULT_POSE_BLENDER_CONFIG.recoveryDuration);
    expect(blender.getConfig().settleVelocityThreshold).toBe(DEFAULT_POSE_BLENDER_CONFIG.settleVelocityThreshold);

    blender.setConfig({ recoveryDuration: 0.5 });
    expect(blender.getConfig().recoveryDuration).toBe(0.5);
  });

  it("SimulatedRagdollSystem is compatible with HumanoidRagdollSystem", () => {
    const sim = new SimulatedRagdollSystem();
    expect(sim).toBeInstanceOf(HumanoidRagdollSystem);
    expect(sim.mode).toBe("kinematic-active");
  });

  it("detects settle condition after 15 consecutive frames below velocity thresholds", () => {
    const blender = new RagdollPoseBlender();
    expect(blender.getIsSettled()).toBe(false);

    // 14 frames at low speed -> not yet settled
    for (let f = 0; f < 14; f++) {
      const settled = blender.checkSettle(0.1, 0.2, 1 / 60);
      expect(settled).toBe(false);
    }
    expect(blender.getIsSettled()).toBe(false);

    // 15th frame -> settles
    const settled15 = blender.checkSettle(0.1, 0.2, 1 / 60);
    expect(settled15).toBe(true);
    expect(blender.getIsSettled()).toBe(true);
  });

  it("resets consecutive frames counter if velocity exceeds threshold before 15 frames", () => {
    const blender = new RagdollPoseBlender();

    for (let f = 0; f < 10; f++) {
      blender.checkSettle(0.1, 0.2, 1 / 60);
    }
    expect(blender.getConsecutiveSettledFrames()).toBe(10);

    // High velocity spike resets counter
    blender.checkSettle(1.5, 0.2, 1 / 60);
    expect(blender.getConsecutiveSettledFrames()).toBe(0);
    expect(blender.getIsSettled()).toBe(false);
  });

  it("forces settle when ragdoll total time exceeds timeout (3.0s)", () => {
    const blender = new RagdollPoseBlender();
    // Simulate active tumbling for 3.1s at high speed
    const settled = blender.checkSettle(5.0, 3.0, 3.1);
    expect(settled).toBe(true);
    expect(blender.getIsSettled()).toBe(true);
  });

  it("classifies prone vs supine orientation accurately", () => {
    const blender = new RagdollPoseBlender();

    // Default upright/forward chest -> supine/upright
    const uprightChest = new THREE.Quaternion();
    expect(blender.determineOrientation(uprightChest)).toBe("supine");

    // Face down (pitched 180 deg) -> prone
    const faceDownChest = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    expect(blender.determineOrientation(faceDownChest)).toBe("prone");

    // Null chest fallback
    expect(blender.determineOrientation(undefined)).toBe("prone");
  });

  it("executes smooth 0.35s Slerp recovery blending from ragdoll pose to idle pose", () => {
    const blender = new RagdollPoseBlender();
    for (let i = 0; i < 15; i++) {
      blender.checkSettle(0.05, 0.05, 1 / 60);
    }
    expect(blender.getIsSettled()).toBe(true);

    const boneTransforms = new Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }>();
    boneTransforms.set("rig_pelvis", {
      position: new THREE.Vector3(0, 0.3, 0),
      quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
    });

    const targetPose: CharacterPoseSnapshot = {
      rootPosition: [0, 0, 0],
      rootRotation: [0, 0, 0, 1],
      bones: {
        rig_pelvis: { position: [0, 0.9, 0], rotation: [0, 0, 0, 1] }
      }
    };

    // Halfway sample (0.175s / 0.35s = 0.5)
    const midSample = blender.updateRecovery(boneTransforms, new THREE.Vector3(0, 0.3, 0), targetPose, 0.175, "supine");
    expect(midSample.progress).toBeCloseTo(0.5, 2);
    expect(midSample.isSettled).toBe(true);
    expect(midSample.orientation).toBe("supine");
    expect(midSample.blendedBones.has("rig_pelvis")).toBe(true);

    // Complete recovery (0.175s + 0.175s = 0.35s)
    const finalSample = blender.updateRecovery(boneTransforms, new THREE.Vector3(0, 0.3, 0), targetPose, 0.175, "supine");
    expect(finalSample.progress).toBe(1.0);
    expect(blender.isRecoveryComplete()).toBe(true);
  });
});

describe("HumanoidRagdollSystem Complete Lifecycle", () => {
  it("initializes in kinematic-active mode with complete bone transforms", () => {
    const ragdoll = new HumanoidRagdollSystem();
    expect(ragdoll.mode).toBe("kinematic-active");
    expect(ragdoll.boneTransforms.size).toBe(12);

    const boneMap = ragdoll.getBoneTransforms();
    expect(boneMap.size).toBe(12);
    expect(boneMap.has("rig_pelvis")).toBe(true);
    expect(boneMap.has("rig_head")).toBe(true);
  });

  it("handles full lifecycle state machine: kinematic-active -> physical-ragdoll -> recovering -> kinematic-active", () => {
    const ragdoll = new HumanoidRagdollSystem();

    // 1. Kinematic Active
    expect(ragdoll.mode).toBe("kinematic-active");

    // 2. Trigger Physical Ragdoll on impact
    ragdoll.triggerPhysicalRagdoll(new THREE.Vector3(3, 5, -10), new THREE.Vector3(0.5, 1.2, -0.8));
    expect(ragdoll.mode).toBe("physical-ragdoll");
    expect(ragdoll.linearVelocity.z).toBe(-10);

    // 3. Step physics until settled -> recovering
    for (let f = 0; f < 80; f++) {
      ragdoll.stepPhysicalSimulation(1 / 60, 0);
    }
    expect(ragdoll.mode).toBe("recovering");

    // 4. Recovery blend until progress = 1.0 -> kinematic-active
    const targetPose: CharacterPoseSnapshot = {
      rootPosition: [0, 0, 0],
      rootRotation: [0, 0, 0, 1],
      bones: {
        rig_pelvis: { position: [0, 0.9, 0], rotation: [0, 0, 0, 1] }
      }
    };

    for (let f = 0; f < 25; f++) {
      ragdoll.updateRecovery(targetPose, 1 / 60);
    }
    expect(ragdoll.mode).toBe("kinematic-active");
    expect(ragdoll.linearVelocity.length()).toBe(0);
    expect(ragdoll.angularVelocity.length()).toBe(0);
  });

  it("cleans up resources cleanly on dispose", () => {
    const ragdoll = new HumanoidRagdollSystem();
    expect(() => ragdoll.dispose()).not.toThrow();
  });
});
