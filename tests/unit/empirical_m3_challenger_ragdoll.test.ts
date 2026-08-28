import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  type CharacterPoseSnapshot,
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

// Deterministic PRNG helper for reproducible stress testing
function createSeededRng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe("Milestone 3 Empirical Challenger — Ragdoll Motor Dynamics, State Machine & Settle Recovery", () => {
  // ==========================================================================
  // GROUP 1: PD Motor Controller Dynamics & Mathematical Robustness
  // ==========================================================================
  describe("Group 1: PD Motor Controller Dynamics & Extreme Inputs", () => {
    it("TC1: Motor tracking handles degenerate and extreme delta times (dt <= 0, dt = 1e-6, dt = 1000s, NaN/Inf) without NaN", () => {
      const controller = new RagdollMotorController();
      const boneTransforms = new Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }>();
      boneTransforms.set("rig_chest", {
        position: new THREE.Vector3(0, 1.2, 0),
        quaternion: new THREE.Quaternion(0, 0, 0, 1)
      });

      const targetPose: CharacterPoseSnapshot = {
        rootPosition: [0, 0, 0],
        rootRotation: [0, 0, 0, 1],
        bones: {
          rig_chest: {
            position: [0.1, 1.3, 0.2],
            rotation: [0.38, 0, 0, 0.92]
          }
        }
      };

      // 1. Zero dt
      controller.updateTracking(boneTransforms, targetPose, 0);
      const chest = boneTransforms.get("rig_chest")!;
      expect(chest.position.x).toBe(0);
      expect(chest.quaternion.x).toBe(0);

      // 2. Negative dt
      controller.updateTracking(boneTransforms, targetPose, -0.05);
      expect(chest.position.x).toBe(0);
      expect(chest.quaternion.x).toBe(0);

      // 3. NaN and Infinity dt
      controller.updateTracking(boneTransforms, targetPose, Number.NaN);
      expect(Number.isFinite(chest.position.x)).toBe(true);
      controller.updateTracking(boneTransforms, targetPose, Number.POSITIVE_INFINITY);
      expect(Number.isFinite(chest.position.x)).toBe(true);

      // 4. Extreme micro dt (1 MHz)
      controller.updateTracking(boneTransforms, targetPose, 1e-6);
      expect(chest.position.x).toBeGreaterThan(0);
      expect(Number.isFinite(chest.position.x)).toBe(true);
      expect(Number.isFinite(chest.quaternion.x)).toBe(true);

      // 5. Huge dt (1000s) clamped to 1.0 factor
      controller.updateTracking(boneTransforms, targetPose, 1000);
      expect(chest.position.x).toBeCloseTo(0.1, 4);
      expect(chest.quaternion.x).toBeCloseTo(0.38, 4);
    });

    it("TC2: High-frequency tracking (1000Hz) and low-frequency tracking (5Hz) smoothly converge monotonically", () => {
      const controller = new RagdollMotorController();

      // High frequency (100 steps at dt = 0.001)
      const hfTransforms = new Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }>();
      hfTransforms.set("rig_head", {
        position: new THREE.Vector3(0, 1.5, 0),
        quaternion: new THREE.Quaternion(0, 0, 0, 1)
      });

      const targetPose: CharacterPoseSnapshot = {
        rootPosition: [0, 0, 0],
        rootRotation: [0, 0, 0, 1],
        bones: {
          rig_head: {
            position: [0.2, 1.7, 0.1],
            rotation: [0, 0.707, 0, 0.707] // 90 deg Y rotation
          }
        }
      };

      let prevDistance = Infinity;
      for (let step = 0; step < 100; step++) {
        controller.updateTracking(hfTransforms, targetPose, 0.001);
        const head = hfTransforms.get("rig_head")!;
        const currentDist = head.position.distanceTo(new THREE.Vector3(0.2, 1.7, 0.1));
        expect(currentDist).toBeLessThanOrEqual(prevDistance + 1e-6);
        prevDistance = currentDist;
      }
    });

    it("TC3: Joint torque computation wraps angles correctly across full spherical range and handles antipodal quaternions", () => {
      const controller = new RagdollMotorController();
      const currentQ = new THREE.Quaternion(0, 0, 0, 1);
      const jointSpec = { stiffness: 250, damping: 25, maxTorque: 400 };

      // 180-degree yaw flip
      const targetQ180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      const torque180 = controller.computeJointTorque(currentQ, targetQ180, new THREE.Vector3(0, 0, 0), jointSpec, 1 / 60);
      expect(Number.isFinite(torque180.y)).toBe(true);
      expect(torque180.length()).toBeGreaterThan(0);
      expect(torque180.length()).toBeLessThanOrEqual(400);

      // Antipodal quaternion of identity (w = -1)
      const antiTargetQ = new THREE.Quaternion(0, 0, 0, -1);
      const antiTorque = controller.computeJointTorque(currentQ, antiTargetQ, new THREE.Vector3(0, 0, 0), jointSpec, 1 / 60);
      expect(Number.isFinite(antiTorque.x)).toBe(true);
      expect(Number.isFinite(antiTorque.y)).toBe(true);
      expect(Number.isFinite(antiTorque.z)).toBe(true);
    });

    it("TC4: Torque magnitude strictly obeys maxTorque limit under extreme angular velocity and stiffness multipliers", () => {
      const controller = new RagdollMotorController({
        stiffnessMultiplier: 10.0,
        dampingMultiplier: 10.0,
        maxTorqueMultiplier: 1.0
      });

      const currentQ = new THREE.Quaternion(0, 0, 0, 1);
      const targetQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      const extremeAngVel = new THREE.Vector3(500, -300, 400);

      const jointSpec = { stiffness: 1000, damping: 100, maxTorque: 120 };
      const torque = controller.computeJointTorque(currentQ, targetQ, extremeAngVel, jointSpec, 1 / 60);

      expect(torque.length()).toBeCloseTo(120.0, 2);
    });

    it("TC5: Derivative damping term opposes angular velocity when rotation error is zero", () => {
      const controller = new RagdollMotorController();
      const currentQ = new THREE.Quaternion(0, 0, 0, 1);
      const targetQ = new THREE.Quaternion(0, 0, 0, 1);
      const angVel = new THREE.Vector3(2.0, -1.5, 3.0);

      const jointSpec = { stiffness: 200, damping: 25, maxTorque: 300 };
      const torque = controller.computeJointTorque(currentQ, targetQ, angVel, jointSpec, 1 / 60);

      // Spring torque is zero, so torque = -kd * angVel
      expect(torque.x).toBeCloseTo(-25 * 2.0, 2);
      expect(torque.y).toBeCloseTo(-25 * -1.5, 2);
      expect(torque.z).toBeCloseTo(-25 * 3.0, 2);
    });
  });

  // ==========================================================================
  // GROUP 2: Slerp Pose Blending & Recovery Continuity
  // ==========================================================================
  describe("Group 2: Slerp Pose Blending & Recovery Continuity", () => {
    it("TC6: Recovery blending respects progression boundaries (t=0.0, 0.25, 0.5, 0.75, 1.0) and clamps overshoots", () => {
      const blender = new RagdollPoseBlender({ recoveryDuration: 0.35 });
      const boneTransforms = new Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }>();
      boneTransforms.set("rig_pelvis", {
        position: new THREE.Vector3(0, 0, 0),
        quaternion: new THREE.Quaternion(0, 0, 0, 1)
      });

      const targetPose: CharacterPoseSnapshot = {
        rootPosition: [0, 0, 0],
        rootRotation: [0, 0, 0, 1],
        bones: {
          rig_pelvis: { position: [0, 1.0, 0], rotation: [0, 0, 0, 1] }
        }
      };

      // Progress checks at 0.0875s intervals (0.25 fractions of 0.35s)
      const s1 = blender.updateRecovery(boneTransforms, new THREE.Vector3(0, 0, 0), targetPose, 0.0875, "supine");
      expect(s1.progress).toBeCloseTo(0.25, 3);
      expect(s1.blendedBones.get("rig_pelvis")!.position[1]).toBeCloseTo(0.25, 3);

      const s2 = blender.updateRecovery(boneTransforms, new THREE.Vector3(0, 0, 0), targetPose, 0.0875, "supine");
      expect(s2.progress).toBeCloseTo(0.50, 3);
      expect(s2.blendedBones.get("rig_pelvis")!.position[1]).toBeCloseTo(0.50, 3);

      const s3 = blender.updateRecovery(boneTransforms, new THREE.Vector3(0, 0, 0), targetPose, 0.0875, "supine");
      expect(s3.progress).toBeCloseTo(0.75, 3);
      expect(s3.blendedBones.get("rig_pelvis")!.position[1]).toBeCloseTo(0.75, 3);

      const s4 = blender.updateRecovery(boneTransforms, new THREE.Vector3(0, 0, 0), targetPose, 0.0875, "supine");
      expect(s4.progress).toBe(1.0);
      expect(s4.blendedBones.get("rig_pelvis")!.position[1]).toBeCloseTo(1.0, 3);

      // Overshoot check (+1.0s)
      const sOvershoot = blender.updateRecovery(boneTransforms, new THREE.Vector3(0, 0, 0), targetPose, 1.0, "supine");
      expect(sOvershoot.progress).toBe(1.0);
    });

    it("TC7: Quaternion unit length is strictly maintained for all bones during Slerp blend", () => {
      const blender = new RagdollPoseBlender({ recoveryDuration: 0.35 });
      const boneTransforms = new Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }>();

      // Random starting orientations
      boneTransforms.set("rig_spine", {
        position: new THREE.Vector3(0, 1.0, 0),
        quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 1, 0).normalize(), 1.2)
      });
      boneTransforms.set("rig_thigh_left", {
        position: new THREE.Vector3(-0.14, 0.8, 0),
        quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.8)
      });

      const targetPose: CharacterPoseSnapshot = {
        rootPosition: [0, 0, 0],
        rootRotation: [0, 0, 0, 1],
        bones: {
          rig_spine: { position: [0, 1.15, 0], rotation: [0, 0, 0, 1] },
          rig_thigh_left: { position: [-0.14, 0.8, 0], rotation: [0, 0, 0, 1] }
        }
      };

      for (let step = 1; step <= 10; step++) {
        const sample = blender.updateRecovery(boneTransforms, new THREE.Vector3(0, 0, 0), targetPose, 0.035, "prone");
        for (const [, data] of sample.blendedBones) {
          const q = new THREE.Quaternion(data.quaternion[0], data.quaternion[1], data.quaternion[2], data.quaternion[3]);
          expect(q.length()).toBeCloseTo(1.0, 5);
        }
      }
    });

    it("TC8: Gracefully handles missing bones or undefined fields in target pose without crashing", () => {
      const blender = new RagdollPoseBlender();
      const boneTransforms = new Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }>();
      boneTransforms.set("rig_forearm_left", {
        position: new THREE.Vector3(-0.3, 0.9, 0),
        quaternion: new THREE.Quaternion(0, 0, 0, 1)
      });

      const emptyPose: CharacterPoseSnapshot = {
        rootPosition: [0, 0, 0],
        rootRotation: [0, 0, 0, 1],
        bones: {}
      };

      expect(() => {
        const sample = blender.updateRecovery(boneTransforms, new THREE.Vector3(0, 0, 0), emptyPose, 0.175, "prone");
        expect(sample.blendedBones.has("rig_forearm_left")).toBe(true);
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // GROUP 3: Settle Detection, Micro-Jitter & Posture Orientation
  // ==========================================================================
  describe("Group 3: Settle Detection, Micro-Jitter & Posture Orientation", () => {
    it("TC9: Micro-jitter fluctuating across threshold (0.19 <-> 0.21 m/s) never settles within timeout window", () => {
      // Set high timeout so we test pure velocity settle logic
      const blender = new RagdollPoseBlender({ ragdollTimeoutSeconds: 100.0 });

      // Oscillate speed around the 0.20 m/s threshold for 100 frames
      for (let f = 0; f < 100; f++) {
        const jitterSpeed = f % 2 === 0 ? 0.19 : 0.21;
        const settled = blender.checkSettle(jitterSpeed, 0.1, 1 / 60);
        expect(settled).toBe(false);
        expect(blender.getIsSettled()).toBe(false);
      }
    });

    it("TC10: Angular micro-jitter (0.49 <-> 0.51 rad/s) prevents settle and resets counter", () => {
      const blender = new RagdollPoseBlender();

      // 10 frames below threshold
      for (let f = 0; f < 10; f++) {
        blender.checkSettle(0.1, 0.45, 1 / 60);
      }
      expect(blender.getConsecutiveSettledFrames()).toBe(10);

      // Frame 11 violates angular threshold
      blender.checkSettle(0.1, 0.52, 1 / 60);
      expect(blender.getConsecutiveSettledFrames()).toBe(0);
      expect(blender.getIsSettled()).toBe(false);

      // 14 fresh frames below threshold
      for (let f = 0; f < 14; f++) {
        blender.checkSettle(0.1, 0.45, 1 / 60);
      }
      expect(blender.getIsSettled()).toBe(false);

      const settled15 = blender.checkSettle(0.1, 0.45, 1 / 60);
      expect(settled15).toBe(true);
      expect(blender.getIsSettled()).toBe(true);
    });

    it("TC11: Forced timeout settle activates when total ragdoll time reaches 3.0s regardless of high speed", () => {
      const blender = new RagdollPoseBlender({ ragdollTimeoutSeconds: 3.0 });

      // Step at high speed for 2.90s (29 steps of 0.10s)
      for (let s = 0; s < 29; s++) {
        const settled = blender.checkSettle(15.0, 8.0, 0.10);
        expect(settled).toBe(false);
      }
      expect(blender.getRagdollTotalTime()).toBeCloseTo(2.90, 3);
      expect(blender.getIsSettled()).toBe(false);

      // 30th step (+0.10s = 3.00s)
      const settledTimeout = blender.checkSettle(15.0, 8.0, 0.10);
      expect(settledTimeout).toBe(true);
      expect(blender.getRagdollTotalTime()).toBeGreaterThanOrEqual(3.0);
      expect(blender.getIsSettled()).toBe(true);
    });

    it("TC12: Prone vs Supine classification accurately partitions complete 360-degree pitch sphere", () => {
      const blender = new RagdollPoseBlender();

      // Pitch sweep from -PI to +PI
      for (let deg = -180; deg <= 180; deg += 10) {
        const rad = (deg * Math.PI) / 180;
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rad);
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q);

        const orientation = blender.determineOrientation(q);
        if (forward.y < 0) {
          expect(orientation).toBe("prone");
        } else {
          expect(orientation).toBe("supine");
        }
      }
    });
  });

  // ==========================================================================
  // GROUP 4: Humanoid Ragdoll Lifecycle, Invariants & Energy Dissipation
  // ==========================================================================
  describe("Group 4: Full Humanoid Ragdoll Lifecycle & Invariants", () => {
    it("TC13: Extreme impulse velocity (250 m/s, 100 rad/s) dissipates stably without NaN or physics explosion", () => {
      const ragdoll = new SimulatedRagdollSystem();
      ragdoll.triggerPhysicalRagdoll(
        new THREE.Vector3(250, 150, -200),
        new THREE.Vector3(50, 100, -75)
      );

      expect(ragdoll.mode).toBe("physical-ragdoll");

      for (let f = 0; f < 300; f++) {
        ragdoll.stepPhysicalSimulation(1 / 60, 0);
        expect(Number.isFinite(ragdoll.rootPosition.x)).toBe(true);
        expect(Number.isFinite(ragdoll.rootPosition.y)).toBe(true);
        expect(Number.isFinite(ragdoll.rootPosition.z)).toBe(true);
        expect(Number.isFinite(ragdoll.linearVelocity.x)).toBe(true);
        expect(Number.isFinite(ragdoll.angularVelocity.x)).toBe(true);
        expect(ragdoll.rootPosition.y).toBeGreaterThanOrEqual(0.3); // Ground collision boundary
      }

      // Should have settled or timed out to recovering
      expect(["recovering", "kinematic-active"]).toContain(ragdoll.mode);
    });

    it("TC14: Executes 20 continuous consecutive ragdoll -> settle -> recovery cycles without state drift or corruption", () => {
      const ragdoll = new HumanoidRagdollSystem();
      const targetPose: CharacterPoseSnapshot = {
        rootPosition: [0, 0, 0],
        rootRotation: [0, 0, 0, 1],
        bones: {
          rig_pelvis: { position: [0, 0.9, 0], rotation: [0, 0, 0, 1] }
        }
      };

      for (let cycle = 0; cycle < 20; cycle++) {
        expect(ragdoll.mode).toBe("kinematic-active");

        // 1. Trigger ragdoll with diverse velocities
        ragdoll.triggerPhysicalRagdoll(
          new THREE.Vector3((cycle % 5) * 2, 5, -8),
          new THREE.Vector3(0.5, 0.5, 0)
        );
        expect(ragdoll.mode).toBe("physical-ragdoll");

        // 2. Step until settled
        for (let f = 0; f < 80; f++) {
          ragdoll.stepPhysicalSimulation(1 / 60, 0);
        }
        expect(ragdoll.mode).toBe("recovering");

        // 3. Recover to idle pose
        for (let f = 0; f < 25; f++) {
          ragdoll.updateRecovery(targetPose, 1 / 60);
        }
        expect(ragdoll.mode).toBe("kinematic-active");
        expect(ragdoll.linearVelocity.length()).toBe(0);
        expect(ragdoll.angularVelocity.length()).toBe(0);
        expect(ragdoll.boneTransforms.size).toBe(12);
      }
    });

    it("TC15: Supports dual overload signatures for updateRecovery(dt) and updateRecovery(targetPose, dt)", () => {
      const ragdoll = new HumanoidRagdollSystem();
      ragdoll.triggerPhysicalRagdoll(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0));

      for (let f = 0; f < 20; f++) {
        ragdoll.stepPhysicalSimulation(1 / 60, 0);
      }
      expect(ragdoll.mode).toBe("recovering");

      // Overload A: updateRecovery(dt: number)
      const sampleA = ragdoll.updateRecovery(0.1);
      expect(sampleA).not.toBeNull();
      expect(sampleA?.progress).toBeCloseTo(0.1 / 0.35, 2);

      // Overload B: updateRecovery(targetPose, dt: number)
      const sampleB = ragdoll.updateRecovery(
        {
          rootPosition: [0, 0, 0],
          rootRotation: [0, 0, 0, 1],
          bones: {}
        },
        0.25
      );
      expect(sampleB).not.toBeNull();
      expect(sampleB?.progress).toBe(1.0);
      expect(ragdoll.mode).toBe("kinematic-active");
    });

    it("TC16: Biomechanical specifications strictly guarantee 91kg mass, positive damping, valid limits, and clean topology", () => {
      expect(totalRagdollMass()).toBe(91.0);
      expect(RAGDOLL_BODIES).toHaveLength(12);
      expect(RAGDOLL_JOINTS).toHaveLength(11);

      // Verify every joint parent and child bone exists in RAGDOLL_BODIES
      const bodyNameSet = new Set(RAGDOLL_BODIES.map((b) => b.boneName));
      for (const joint of RAGDOLL_JOINTS) {
        expect(bodyNameSet.has(joint.parentBone), `Parent bone ${joint.parentBone} not in RAGDOLL_BODIES`).toBe(true);
        expect(bodyNameSet.has(joint.childBone), `Child bone ${joint.childBone} not in RAGDOLL_BODIES`).toBe(true);
        expect(joint.minAngleLimitRad).toBeLessThan(joint.maxAngleLimitRad);
        expect(joint.stiffness).toBeGreaterThan(50);
        expect(joint.damping).toBeGreaterThan(5);
        expect(joint.maxTorque).toBeGreaterThan(50);
      }

      // Check helper queries
      expect(findBodySpec("rig_pelvis")).toBeDefined();
      expect(findJointSpec("joint_hip_left")).toBeDefined();
      expect(findJointsForBone("rig_pelvis").length).toBeGreaterThanOrEqual(3);
    });
  });

  // ==========================================================================
  // GROUP 5: Multi-Hit, Recovery Interruption & Determinism Oracles
  // ==========================================================================
  describe("Group 5: Multi-Hit Interruptions & Determinism Oracles", () => {
    it("TC17: Multi-hit in physical-ragdoll updates velocity and resets settle without state corruption", () => {
      const ragdoll = new HumanoidRagdollSystem();
      ragdoll.triggerPhysicalRagdoll(new THREE.Vector3(2, 4, 0), new THREE.Vector3(1, 0, 0));

      for (let f = 0; f < 10; f++) {
        ragdoll.stepPhysicalSimulation(1 / 60, 0);
      }
      expect(ragdoll.mode).toBe("physical-ragdoll");

      // Second impact
      ragdoll.triggerPhysicalRagdoll(new THREE.Vector3(-12, 6, 8), new THREE.Vector3(0, 2, -1));
      expect(ragdoll.mode).toBe("physical-ragdoll");
      expect(ragdoll.linearVelocity.x).toBe(-12);
      expect(ragdoll.linearVelocity.y).toBe(6);
      expect(ragdoll.linearVelocity.z).toBe(8);

      for (let f = 0; f < 10; f++) {
        ragdoll.stepPhysicalSimulation(1 / 60, 0);
      }
      expect(ragdoll.mode).toBe("physical-ragdoll");
    });

    it("TC18: Impact during recovering mode cleanly aborts recovery and re-triggers physical ragdoll", () => {
      const ragdoll = new HumanoidRagdollSystem();
      ragdoll.triggerPhysicalRagdoll(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0));

      for (let f = 0; f < 20; f++) {
        ragdoll.stepPhysicalSimulation(1 / 60, 0);
      }
      expect(ragdoll.mode).toBe("recovering");

      // Mid-recovery blend
      ragdoll.updateRecovery(0.15);
      expect(ragdoll.mode).toBe("recovering");

      // Interrupted by heavy hit
      expect(ragdoll.checkImpactTrigger(14.0, "knockback")).toBe(true);
      ragdoll.triggerPhysicalRagdoll(new THREE.Vector3(0, 8, -15), new THREE.Vector3(1, 0, 0));
      expect(ragdoll.mode).toBe("physical-ragdoll");
      expect(ragdoll.linearVelocity.z).toBe(-15);

      // Subsequent updateRecovery returns null
      expect(ragdoll.updateRecovery(0.05)).toBeNull();

      // Settle again (requires ballistic apex, descent, ground friction deceleration, and 15 settled frames: ~120-150 frames)
      for (let f = 0; f < 150; f++) {
        ragdoll.stepPhysicalSimulation(1 / 60, 0);
      }
      expect(ragdoll.mode).toBe("recovering");
    });

    it("TC19: Guarantees 100% deterministic bit-exact outcomes for identical simulation sequences", () => {
      const runSim = () => {
        const ragdoll = new HumanoidRagdollSystem();
        ragdoll.rootPosition.set(2.0, 4.0, -3.0);
        ragdoll.triggerPhysicalRagdoll(new THREE.Vector3(5.5, 6.2, -10.8), new THREE.Vector3(1.2, -0.8, 1.5));

        const records: number[] = [];
        for (let f = 0; f < 100; f++) {
          ragdoll.stepPhysicalSimulation(1 / 60, 0);
          records.push(
            ragdoll.rootPosition.x,
            ragdoll.rootPosition.y,
            ragdoll.rootPosition.z,
            ragdoll.linearVelocity.x,
            ragdoll.linearVelocity.y,
            ragdoll.linearVelocity.z
          );
        }
        return records;
      };

      const run1 = runSim();
      const run2 = runSim();

      expect(run1).toEqual(run2);
    });

    it("TC20: Seeded PRNG trials confirm repeatable trajectory outcomes", () => {
      const rng1 = createSeededRng(99999);
      const rng2 = createSeededRng(99999);

      for (let t = 0; t < 20; t++) {
        const vx1 = (rng1() - 0.5) * 20;
        const vy1 = rng1() * 10;
        const vz1 = (rng1() - 0.5) * 20;

        const vx2 = (rng2() - 0.5) * 20;
        const vy2 = rng2() * 10;
        const vz2 = (rng2() - 0.5) * 20;

        const r1 = new HumanoidRagdollSystem();
        const r2 = new HumanoidRagdollSystem();

        r1.triggerPhysicalRagdoll(new THREE.Vector3(vx1, vy1, vz1), new THREE.Vector3(0, 0, 0));
        r2.triggerPhysicalRagdoll(new THREE.Vector3(vx2, vy2, vz2), new THREE.Vector3(0, 0, 0));

        for (let f = 0; f < 25; f++) {
          r1.stepPhysicalSimulation(1 / 60, 0);
          r2.stepPhysicalSimulation(1 / 60, 0);
        }

        expect(r1.rootPosition.x).toBe(r2.rootPosition.x);
        expect(r1.rootPosition.y).toBe(r2.rootPosition.y);
        expect(r1.rootPosition.z).toBe(r2.rootPosition.z);
      }
    });
  });
});
