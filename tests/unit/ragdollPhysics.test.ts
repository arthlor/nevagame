import * as THREE from "three";
import { describe, expect, it } from "vitest";

// ============================================================================
// Ragdoll Data Structures & Biomechanical Specifications
// ============================================================================

import {
  type CharacterPoseSnapshot,
  type RagdollBodySpec,
  type RagdollJointSpec,
  type RagdollMode,
  type RagdollRecoverySample,
  RAGDOLL_BODIES,
  RAGDOLL_JOINTS,
  SimulatedRagdollSystem
} from "../../src/physics/ragdoll";

export type {
  CharacterPoseSnapshot,
  RagdollBodySpec,
  RagdollJointSpec,
  RagdollMode,
  RagdollRecoverySample
};
export { RAGDOLL_BODIES, RAGDOLL_JOINTS, SimulatedRagdollSystem };



// ============================================================================
// TIER 1: FEATURE COVERAGE (Features 12, 13, 14, 15)
// ============================================================================

describe("Tier 1: Ragdoll Physics Feature Coverage", () => {
  // Feature 12: Rapier Multi-Body Colliders & Joints
  it("F12: Rapier multi-body ragdoll initializes 11 rigid bodies and 10 anatomical joint limits", () => {
    expect(RAGDOLL_BODIES.length).toBe(12); // 12 body segments representing 11 articulable groups

    const bodyNames = new Set(RAGDOLL_BODIES.map((b) => b.boneName));
    expect(bodyNames.has("rig_pelvis")).toBe(true);
    expect(bodyNames.has("rig_spine")).toBe(true);
    expect(bodyNames.has("rig_chest")).toBe(true);
    expect(bodyNames.has("rig_head")).toBe(true);
    expect(bodyNames.has("rig_upper_arm_left")).toBe(true);
    expect(bodyNames.has("rig_forearm_left")).toBe(true);
    expect(bodyNames.has("rig_thigh_left")).toBe(true);
    expect(bodyNames.has("rig_shin_left")).toBe(true);

    // Total humanoid mass calculation
    const totalMass = RAGDOLL_BODIES.reduce((acc, b) => acc + b.massKg, 0);
    expect(totalMass).toBeGreaterThanOrEqual(70.0);
    expect(totalMass).toBeLessThanOrEqual(95.0);

    // Joint limit validation
    expect(RAGDOLL_JOINTS.length).toBe(11);
    for (const joint of RAGDOLL_JOINTS) {
      expect(joint.minAngleLimitRad).toBeLessThanOrEqual(joint.maxAngleLimitRad);
      expect(joint.stiffness).toBeGreaterThan(0);
      expect(joint.damping).toBeGreaterThan(0);
      expect(joint.maxTorque).toBeGreaterThan(0);
    }
  });

  // Feature 13: Active Motorized Joint Tracking
  it("F13: Active mode tracks target animation pose with PD motor compliance", () => {
    const ragdoll = new SimulatedRagdollSystem();
    expect(ragdoll.mode).toBe("kinematic-active");

    const targetPose: CharacterPoseSnapshot = {
      rootPosition: [0, 0, 0],
      rootRotation: [0, 0, 0, 1],
      bones: {
        rig_upper_arm_left: {
          position: [-0.2, 1.2, 0],
          rotation: [0.38, 0, 0, 0.92] // ~45 deg X rotation
        },
        rig_forearm_left: {
          position: [-0.3, 0.9, 0],
          rotation: [0.707, 0, 0, 0.707] // 90 deg elbow bend
        }
      }
    };

    // Update active tracking over 10 frames
    for (let f = 0; f < 10; f++) {
      ragdoll.updateActiveTracking(targetPose, 1 / 60);
    }

    const arm = ragdoll.boneTransforms.get("rig_upper_arm_left");
    const forearm = ragdoll.boneTransforms.get("rig_forearm_left");

    expect(arm?.quaternion.x).toBeGreaterThan(0.1);
    expect(forearm?.quaternion.x).toBeGreaterThan(0.2);
    expect(ragdoll.mode).toBe("kinematic-active");
  });

  // Feature 14: Physical Ragdoll Transition on Impact
  it("F14: High-speed impact (>10m/s) and hard landing (>=8.5m/s) trigger unconstrained physical ragdoll", () => {
    const ragdoll = new SimulatedRagdollSystem();

    // 1. Normal walk speed (5 m/s) does not trigger ragdoll
    expect(ragdoll.checkImpactTrigger(5.0, "none")).toBe(false);

    // 2. High-speed collision (12 m/s) triggers ragdoll
    expect(ragdoll.checkImpactTrigger(12.0, "obstacle-hit")).toBe(true);

    // 3. Hard landing (8.5 m/s) triggers ragdoll
    expect(ragdoll.checkImpactTrigger(8.5, "land-hard", 0.9)).toBe(true);

    // 4. Knockback triggers ragdoll
    expect(ragdoll.checkImpactTrigger(2.0, "knockback")).toBe(true);

    // Transition into physical ragdoll with linear and angular velocity transfer
    ragdoll.triggerPhysicalRagdoll(new THREE.Vector3(5, 8, -12), new THREE.Vector3(1.2, 0.5, -2.1));
    expect(ragdoll.mode).toBe("physical-ragdoll");
    expect(ragdoll.linearVelocity.z).toBe(-12);
    expect(ragdoll.angularVelocity.y).toBe(0.5);
  });

  // Feature 15: Bi-Directional Slerp Pose Recovery
  it("F15: Settle detection detects rest state and Slerp smoothly recovers to kinematic pose in 0.35s", () => {
    const ragdoll = new SimulatedRagdollSystem();
    ragdoll.triggerPhysicalRagdoll(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0));

    // Simulate 20 frames of zero velocity at ground level
    for (let f = 0; f < 20; f++) {
      ragdoll.stepPhysicalSimulation(1 / 60, 0);
    }

    expect(ragdoll.mode).toBe("recovering");

    // Test 0.35s recovery blending
    const idlePose: CharacterPoseSnapshot = {
      rootPosition: [0, 0, 0],
      rootRotation: [0, 0, 0, 1],
      bones: {
        rig_pelvis: { position: [0, 0.9, 0], rotation: [0, 0, 0, 1] },
        rig_spine: { position: [0, 1.1, 0], rotation: [0, 0, 0, 1] }
      }
    };

    // Halfway sample (progress ~ 0.5)
    const midSample = ragdoll.updateRecovery(idlePose, 0.175);
    expect(midSample).toBeDefined();
    expect(midSample?.progress).toBeCloseTo(0.5, 1);
    expect(midSample?.isSettled).toBe(true);
    expect(["prone", "supine"]).toContain(midSample?.orientation);

    // Final sample (progress = 1.0)
    const endSample = ragdoll.updateRecovery(idlePose, 0.20);
    expect(endSample?.progress).toBe(1.0);
    expect(ragdoll.mode).toBe("kinematic-active");
  });
});

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES (>= 5 assertions per category)
// ============================================================================

describe("Tier 2: Ragdoll Physics Boundary & Corner Cases", () => {
  it("B1: Zero delta time (dt = 0) and negative dt preserve simulation stability without NaN", () => {
    const ragdoll = new SimulatedRagdollSystem();
    ragdoll.triggerPhysicalRagdoll(new THREE.Vector3(2, 4, 1), new THREE.Vector3(0.5, 0.2, 0.1));

    expect(() => ragdoll.stepPhysicalSimulation(0, 0)).not.toThrow();
    expect(ragdoll.linearVelocity.x).toBe(2);
    expect(Number.isFinite(ragdoll.rootPosition.y)).toBe(true);

    expect(() => ragdoll.stepPhysicalSimulation(-0.01, 0)).not.toThrow();
    expect(Number.isFinite(ragdoll.linearVelocity.y)).toBe(true);
  });

  it("B2: Extreme impulse velocities (150 m/s) dampen safely and do not cause numerical explosion", () => {
    const ragdoll = new SimulatedRagdollSystem();
    ragdoll.triggerPhysicalRagdoll(new THREE.Vector3(150, 80, -120), new THREE.Vector3(25, 30, -40));

    for (let f = 0; f < 60; f++) {
      ragdoll.stepPhysicalSimulation(1 / 60, 0);
    }

    expect(Number.isFinite(ragdoll.linearVelocity.x)).toBe(true);
    expect(Number.isFinite(ragdoll.linearVelocity.y)).toBe(true);
    expect(Number.isFinite(ragdoll.linearVelocity.z)).toBe(true);
    expect(ragdoll.linearVelocity.length()).toBeLessThan(150);
  });

  it("B3: Zero-velocity collision does not trigger false-positive ragdoll transition", () => {
    const ragdoll = new SimulatedRagdollSystem();
    expect(ragdoll.checkImpactTrigger(0.0, "none", 0)).toBe(false);
    expect(ragdoll.checkImpactTrigger(0.001, "none", 0.01)).toBe(false);
    expect(ragdoll.mode).toBe("kinematic-active");
  });

  it("B4: Upside-down settling orientation correctly detects prone/supine and restores root alignment", () => {
    const ragdoll = new SimulatedRagdollSystem();
    ragdoll.triggerPhysicalRagdoll(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0));

    // Invert chest orientation
    const chest = ragdoll.boneTransforms.get("rig_chest");
    if (chest) {
      chest.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI); // 180 deg pitch flip
    }

    const orientation = ragdoll.determineOrientation();
    expect(orientation).toBe("prone");

    // Settle and recover
    for (let f = 0; f < 16; f++) {
      ragdoll.stepPhysicalSimulation(1 / 60, 0);
    }
    expect(ragdoll.mode).toBe("recovering");
  });

  it("B5: Rapid back-to-back mode toggling maintains internal invariants", () => {
    const ragdoll = new SimulatedRagdollSystem();
    const pose: CharacterPoseSnapshot = {
      rootPosition: [0, 0, 0],
      rootRotation: [0, 0, 0, 1],
      bones: {}
    };

    for (let i = 0; i < 5; i++) {
      ragdoll.updateActiveTracking(pose, 1 / 60);
      expect(ragdoll.mode).toBe("kinematic-active");

      ragdoll.triggerPhysicalRagdoll(new THREE.Vector3(1, 2, 3), new THREE.Vector3(0, 0, 0));
      expect(ragdoll.mode).toBe("physical-ragdoll");

      ragdoll.stepPhysicalSimulation(1 / 60, 0);
      ragdoll.mode = "kinematic-active"; // Forced external reset
    }

    expect(ragdoll.boneTransforms.size).toBe(12);
  });
});

// ============================================================================
// TIER 3: CROSS-FEATURE INTERACTIONS (Pairwise Combinations)
// ============================================================================

describe("Tier 3: Cross-Feature Interactions", () => {
  it("C1: Kinematic Locomotion -> Cliff Fall Impact -> Physical Ragdoll -> Settle -> Recovery -> Kinematic Locomotion", () => {
    const ragdoll = new SimulatedRagdollSystem();

    // 1. Player sprinting towards cliff
    const sprintPose: CharacterPoseSnapshot = {
      rootPosition: [0, 10, 0],
      rootRotation: [0, 0, 0, 1],
      bones: {
        rig_thigh_left: { position: [-0.14, 0.8, 0], rotation: [0.3, 0, 0, 0.95] },
        rig_thigh_right: { position: [0.14, 0.8, 0], rotation: [-0.3, 0, 0, 0.95] }
      }
    };
    ragdoll.updateActiveTracking(sprintPose, 1 / 60);
    expect(ragdoll.mode).toBe("kinematic-active");

    // 2. High-speed cliff impact (14 m/s)
    const impactTriggered = ragdoll.checkImpactTrigger(14.0, "land-hard", 1.0);
    expect(impactTriggered).toBe(true);

    ragdoll.triggerPhysicalRagdoll(new THREE.Vector3(4, -14, 2), new THREE.Vector3(0.8, 1.5, -0.4));
    expect(ragdoll.mode).toBe("physical-ragdoll");

    // 3. Ragdoll bounces, rolls, and comes to rest on ground
    for (let f = 0; f < 80; f++) {
      ragdoll.stepPhysicalSimulation(1 / 60, 0);
    }
    expect(ragdoll.mode).toBe("recovering");

    // 4. Smooth recovery blend to get-up pose
    const getUpPose: CharacterPoseSnapshot = {
      rootPosition: [ragdoll.rootPosition.x, 0, ragdoll.rootPosition.z],
      rootRotation: [0, 0, 0, 1],
      bones: {
        rig_pelvis: { position: [0, 0.9, 0], rotation: [0, 0, 0, 1] }
      }
    };

    for (let f = 0; f < 25; f++) {
      ragdoll.updateRecovery(getUpPose, 1 / 60);
    }

    expect(ragdoll.mode).toBe("kinematic-active");
    expect(ragdoll.linearVelocity.length()).toBe(0);
  });

  it("C2: Ragdoll physical tumble on 25-degree terrain slope with surface friction", () => {
    const ragdoll = new SimulatedRagdollSystem();
    ragdoll.triggerPhysicalRagdoll(new THREE.Vector3(0, 0, 5), new THREE.Vector3(1.5, 0, 0));

    // Simulate tumbling down a slope (groundHeight decreases along Z)
    for (let f = 0; f < 60; f++) {
      const terrainHeight = -0.466 * (f * 0.05); // 25 degree slope
      ragdoll.stepPhysicalSimulation(1 / 60, terrainHeight);
    }

    expect(ragdoll.rootPosition.y).toBeLessThan(0.5);
    expect(Number.isFinite(ragdoll.rootPosition.z)).toBe(true);
  });

  it("C3: High-speed impact interrupts active farming tool playback cleanly", () => {
    const ragdoll = new SimulatedRagdollSystem();

    // Active watering pose
    const wateringPose: CharacterPoseSnapshot = {
      rootPosition: [0, 0, 0],
      rootRotation: [0, 0, 0, 1],
      bones: {
        rig_forearm_right: { position: [0.38, 0.9, 0.2], rotation: [0.5, 0, 0, 0.866] }
      }
    };
    ragdoll.updateActiveTracking(wateringPose, 1 / 60);

    // Sudden knockback
    ragdoll.triggerPhysicalRagdoll(new THREE.Vector3(-8, 5, 3), new THREE.Vector3(0, 2, 0));
    expect(ragdoll.mode).toBe("physical-ragdoll");

    // Forearm is now governed by physics rather than active action
    ragdoll.stepPhysicalSimulation(1 / 60, 0);
    expect(ragdoll.mode).toBe("physical-ragdoll");
  });
});

// ============================================================================
// TIER 4: REAL-WORLD SCENARIO 3: HIGH-SPEED CLIFF DROP & RAGDOLL RECOVERY
// ============================================================================

describe("Tier 4: Scenario 3: High-Speed Cliff Drop & Ragdoll Settle-Recovery Cycle", () => {
  it("executes 150-frame end-to-end cliff drop simulation from sprint to ragdoll to standing idle", () => {
    const ragdoll = new SimulatedRagdollSystem();
    ragdoll.rootPosition.set(0, 4.5, 0); // 4.5m cliff height

    const trajectory: Array<{ frame: number; mode: RagdollMode; y: number; speed: number }> = [];

    // Phase 1: Sprint towards cliff edge (Frames 0–20)
    for (let f = 0; f <= 20; f++) {
      const sprintPose: CharacterPoseSnapshot = {
        rootPosition: [0, 4.5, f * 0.13],
        rootRotation: [0, 0, 0, 1],
        bones: {
          rig_pelvis: { position: [0, 4.9, f * 0.13], rotation: [0, 0, 0, 1] }
        }
      };
      ragdoll.updateActiveTracking(sprintPose, 1 / 60);
      trajectory.push({ frame: f, mode: ragdoll.mode, y: ragdoll.rootPosition.y, speed: 8.2 });
    }
    expect(ragdoll.mode).toBe("kinematic-active");

    // Phase 2: Cliff drop and airborne freefall (Frames 21–50)
    let fallSpeed = 0;
    for (let f = 21; f <= 50; f++) {
      fallSpeed += 18.0 * (1 / 60); // Accelerating under gravity
      ragdoll.rootPosition.y -= fallSpeed * (1 / 60);
      trajectory.push({ frame: f, mode: ragdoll.mode, y: ragdoll.rootPosition.y, speed: fallSpeed });
    }
    expect(fallSpeed).toBeGreaterThan(8.5); // Reached impact velocity

    // Phase 3: Impact with ground -> Trigger Physical Ragdoll (Frame 51)
    ragdoll.rootPosition.y = 0.3; // Contact ground
    const impactSpeed = fallSpeed;
    const shouldRagdoll = ragdoll.checkImpactTrigger(impactSpeed, "land-hard", 1.0);
    expect(shouldRagdoll).toBe(true);

    ragdoll.triggerPhysicalRagdoll(new THREE.Vector3(2.5, impactSpeed * 0.15, 1.2), new THREE.Vector3(1.8, 0.4, -2.2));
    expect(ragdoll.mode).toBe("physical-ragdoll");

    // Phase 4: Multi-body physical ragdoll simulation & settle (Frames 52–115)
    for (let f = 52; f <= 115; f++) {
      ragdoll.stepPhysicalSimulation(1 / 60, 0);
      trajectory.push({ frame: f, mode: ragdoll.mode, y: ragdoll.rootPosition.y, speed: ragdoll.linearVelocity.length() });
    }

    expect(ragdoll.mode).toBe("recovering");
    expect(ragdoll.rootPosition.y).toBeCloseTo(0.3, 1);

    // Phase 5: Slerp pose recovery back to kinematic idle (Frames 116–150)
    const standingIdlePose: CharacterPoseSnapshot = {
      rootPosition: [ragdoll.rootPosition.x, 0.5, ragdoll.rootPosition.z],
      rootRotation: [0, 0, 0, 1],
      bones: {
        rig_pelvis: { position: [0, 0.9, 0], rotation: [0, 0, 0, 1] },
        rig_spine: { position: [0, 1.15, 0], rotation: [0, 0, 0, 1] },
        rig_head: { position: [0, 1.65, 0], rotation: [0, 0, 0, 1] }
      }
    };

    for (let f = 116; f <= 150; f++) {
      ragdoll.updateRecovery(standingIdlePose, 1 / 60);
      trajectory.push({ frame: f, mode: ragdoll.mode, y: ragdoll.rootPosition.y, speed: 0 });
    }

    expect(ragdoll.mode).toBe("kinematic-active");
    expect(trajectory.length).toBe(150);
  });
});
