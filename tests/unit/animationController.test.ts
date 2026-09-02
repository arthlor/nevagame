import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  AnimationController,
  isPlayerRigObjectName
} from "../../src/render/animation/AnimationController";
import type { PlayerMotionSample } from "../../src/simulation/core/PhysicsAdapter";
import { ASSET_BY_ID, ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { socketAttachFor } from "../../src/render/assets/ToolSocketAttach";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import { PLAYER_TRAVERSAL_TUNING } from "../../src/simulation/navigation/PlayerTraversal";

// Bound to the tuning rather than literals: these cases assert "at the tuned
// travel speed the clip plays at its authored rate", which is a statement about
// the relationship, not about any particular number.
const WALK_SPEED = PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond;
const RUN_SPEED = PLAYER_TRAVERSAL_TUNING.sprintSpeedMetersPerSecond;
const RUN_CLIP_SECONDS = ASSET_BY_ID.get(ASSET_IDS.CHAR_PLAYER_A)!
  .animationClips!.find((clip) => clip.name === "run")!.durationSeconds;

function motion(overrides: Partial<PlayerMotionSample> = {}): PlayerMotionSample {
  return {
    velocity: { x: 0, y: 0, z: 0 },
    speedMetersPerSecond: 0,
    accelerationMetersPerSecondSquared: 0,
    turnRateRadiansPerSecond: 0,
    isGrounded: true,
    groundNormal: { x: 0, y: 1, z: 0 },
    slopeRadians: 0,
    airbornePhase: "grounded",
    contactEvent: "none",
    landingImpactStrength: 0,
    contactSurface: "grass",
    isCollisionBlocked: false,
    requestedGait: "idle",
    ...overrides
  };
}

function makeCharacter(): THREE.Group {
  const root = new THREE.Group();
  const parts: Array<[string, [number, number, number]]> = [
    ["character_upper_arm_left", [-0.4, 1.19, 0]],
    ["character_upper_arm_right", [0.4, 1.19, 0]],
    ["character_forearm_left", [-0.4, 0.9, 0.02]],
    ["character_forearm_right", [0.4, 0.9, 0.02]],
    ["character_thigh_left", [-0.17, 0.55, 0]],
    ["character_thigh_right", [0.17, 0.55, 0]],
    ["character_shin_left", [-0.17, 0.23, 0.02]],
    ["character_shin_right", [0.17, 0.23, 0.02]]
  ];
  for (const [name, position] of parts) {
    const part = new THREE.Object3D();
    part.name = name;
    part.position.set(...position);
    root.add(part);
  }
  return root;
}

function makeClippedCharacter(): THREE.Group {
  const root = makeCharacter();
  root.userData.assetId = ASSET_IDS.CHAR_PLAYER_A;
  const spec = ASSET_BY_ID.get(ASSET_IDS.CHAR_PLAYER_A)!;
  root.userData.animationClips = spec.animationClips!.map(
    (clip) => new THREE.AnimationClip(clip.name, clip.durationSeconds, [])
  );
  return root;
}

function makeHumanoidCharacter(): THREE.Group {
  const root = makeClippedCharacter();
  for (const [name, x, y] of [
    ["rig_root", 0, 0],
    ["rig_pelvis", 0, 0.9],
    ["rig_spine", 0, 1.05],
    ["rig_chest", 0, 1.2],
    ["rig_neck", 0, 1.35],
    ["rig_head", 0, 1.48],
    ["rig_clavicle_left", -0.12, 1.25],
    ["rig_upper_arm_left", -0.28, 1.22],
    ["rig_forearm_left", -0.28, 0.95],
    ["rig_hand_left", -0.28, 0.72],
    ["rig_clavicle_right", 0.12, 1.25],
    ["rig_upper_arm_right", 0.28, 1.22],
    ["rig_forearm_right", 0.28, 0.95],
    ["rig_hand_right", 0.28, 0.72],
    ["rig_thigh_left", -0.14, 0.84],
    ["rig_shin_left", -0.14, 0.42],
    ["rig_foot_left", -0.14, 0.08],
    ["rig_thigh_right", 0.14, 0.84],
    ["rig_shin_right", 0.14, 0.42],
    ["rig_foot_right", 0.14, 0.08],
    ["rig_hat_brim", 0, 1.55],
    ["rig_backpack", 0, 1.12],
    ["rig_canteen_left", -0.16, 1.02],
    ["rig_canteen_right", 0.16, 1.02]
  ] as const) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(x, y, 0);
    root.add(bone);
  }
  const clips = root.userData.animationClips as THREE.AnimationClip[];
  if (!clips.some((clip) => clip.name === "talk_gesture")) {
    clips.push(new THREE.AnimationClip("talk_gesture", 1.6, []));
  }
  return root;
}

function makeGroundContactCharacter(): THREE.Group {
  const root = new THREE.Group();
  root.userData.assetId = ASSET_IDS.CHAR_PLAYER_A;
  const spec = ASSET_BY_ID.get(ASSET_IDS.CHAR_PLAYER_A)!;
  root.userData.animationClips = spec.animationClips!.map(
    (clip) => new THREE.AnimationClip(clip.name, clip.durationSeconds, [])
  );
  const rigRoot = new THREE.Bone();
  rigRoot.name = "rig_root";
  root.add(rigRoot);
  const pelvis = new THREE.Bone();
  pelvis.name = "rig_pelvis";
  pelvis.position.y = 0.84;
  rigRoot.add(pelvis);
  for (const [side, x] of [["left", -0.14], ["right", 0.14]] as const) {
    const thigh = new THREE.Bone();
    thigh.name = `rig_thigh_${side}`;
    thigh.position.set(x, 0, 0);
    pelvis.add(thigh);
    const shin = new THREE.Bone();
    shin.name = `rig_shin_${side}`;
    shin.position.set(0, -0.42, 0.04);
    thigh.add(shin);
    const foot = new THREE.Bone();
    foot.name = `rig_foot_${side}`;
    foot.position.set(0, -0.34, 0.05);
    shin.add(foot);
  }
  return root;
}

describe("AnimationController", () => {
  it("uses authored mount action durations and releases mixer state on disposal", () => {
    const controller = new AnimationController(makeClippedCharacter());

    expect(controller.actionDurationSeconds("mount")).toBe(0.8);
    expect(controller.actionDurationSeconds("dismount")).toBe(0.8);
    controller.play("mount");
    controller.dispose();

    expect(controller.playbackState().activeAction).toBeNull();
    expect(controller.currentClip()).toBe("idle");
  });

  it("identifies shipped articulated nodes without treating rigid details as limbs", () => {
    expect(isPlayerRigObjectName("character_upper_arm_left")).toBe(true);
    expect(isPlayerRigObjectName("character_boot_right")).toBe(true);
    expect(isPlayerRigObjectName("character_hat_brim")).toBe(false);
    expect(isPlayerRigObjectName("character_backpack")).toBe(false);
  });

  it("animates the actual shipped semantic node vocabulary without clips", () => {
    const character = makeCharacter();
    const controller = new AnimationController(character);
    const walking = {
      mode: "on-foot" as const,
      carrying: false,
      motion: motion({
        velocity: { x: 0, y: 0, z: 4.3 },
        speedMetersPerSecond: 4.3,
        requestedGait: "walk"
      })
    };
    for (let index = 0; index < 6; index++) controller.update(1 / 60, walking);
    expect(character.getObjectByName("character_upper_arm_left")?.rotation.x).not.toBe(0);

    controller.play("plant");
    const actionFrame = controller.update(0.2, {
      mode: "on-foot",
      carrying: false,
      motion: motion()
    });
    expect(actionFrame.leanX).toBeLessThan(0);
  });

  it("uses a stable airborne pose instead of running in mid-air", () => {
    const character = makeCharacter();
    const controller = new AnimationController(character);
    const airFrame = controller.update(1 / 60, {
      mode: "on-foot",
      carrying: false,
      motion: motion({
        velocity: { x: 0, y: 5, z: 0 },
        speedMetersPerSecond: 5,
        isGrounded: false,
        requestedGait: "walk"
      })
    });
    expect(airFrame.bobY).toBe(0);
    expect(airFrame.leanX).toBeLessThan(0);
    expect(character.getObjectByName("character_thigh_left")?.rotation.x).toBeLessThan(0);
  });

  it("hands idle into authored starts and then speed-matched gait loops", () => {
    const controller = new AnimationController(makeClippedCharacter());
    const walking = {
      mode: "on-foot" as const,
      carrying: false,
      motion: motion({
        velocity: { x: 0, y: 0, z: WALK_SPEED },
        speedMetersPerSecond: WALK_SPEED,
        requestedGait: "walk"
      })
    };
    controller.update(1 / 60, walking);
    expect(controller.currentClip()).toBe("walk_start");
    for (let index = 0; index < 24; index++) controller.update(1 / 60, walking);
    expect(controller.playbackState()).toMatchObject({ clip: "walk", playbackScale: 1 });

    const stopping = { mode: "on-foot" as const, carrying: false, motion: motion() };
    controller.update(1 / 60, stopping);
    expect(controller.currentClip()).toBe("idle");
    for (let index = 0; index < 24; index++) controller.update(1 / 60, stopping);
    expect(controller.currentClip()).toBe("idle");
  });

  it("uses run_start only from rest and hands off at loop phase zero", () => {
    const controller = new AnimationController(makeClippedCharacter());
    const running = {
      mode: "on-foot" as const,
      carrying: false,
      motion: motion({
        velocity: { x: 0, y: 0, z: RUN_SPEED },
        speedMetersPerSecond: RUN_SPEED,
        requestedGait: "run"
      })
    };
    controller.update(1 / 60, running);
    expect(controller.playbackState().baseClip).toBe("run_start");
    for (let index = 0; index < 15; index += 1) controller.update(1 / 60, running);
    expect(controller.playbackState().baseClip).toBe("run");
    expect(controller.playbackState().basePhase).toBeLessThan(0.08);

    controller.update(1 / 60, {
      ...running,
      motion: motion({ speedMetersPerSecond: WALK_SPEED, requestedGait: "walk" })
    });
    expect(controller.playbackState().baseClip).toBe("walk");
  });

  it("matches authored gait phase to resolved gameplay travel speed", () => {
    const walking = new AnimationController(makeClippedCharacter());
    const walkContext = {
      mode: "on-foot" as const,
      carrying: false,
      motion: motion({
        velocity: { x: 0, y: 0, z: WALK_SPEED },
        speedMetersPerSecond: WALK_SPEED,
        requestedGait: "walk"
      })
    };
    for (let index = 0; index < 36; index += 1) walking.update(1 / 60, walkContext);
    expect(walking.playbackState()).toMatchObject({ clip: "walk" });
    expect(walking.playbackState().playbackScale).toBeCloseTo(1, 3);

    const running = new AnimationController(makeClippedCharacter());
    const runContext = {
      ...walkContext,
      motion: motion({
        velocity: { x: 0, y: 0, z: RUN_SPEED },
        speedMetersPerSecond: RUN_SPEED,
        requestedGait: "run"
      })
    };
    for (let index = 0; index < 36; index += 1) running.update(1 / 60, runContext);
    expect(running.playbackState()).toMatchObject({ clip: "run" });
    expect(running.playbackState().playbackScale).toBeCloseTo(1, 3);
  });

  it("maps airborne and landing evidence to essential clips under reduced motion", () => {
    const controller = new AnimationController(makeClippedCharacter());
    controller.update(1 / 60, {
      mode: "on-foot",
      carrying: false,
      motion: motion({
        isGrounded: false,
        airbornePhase: "rising",
        velocity: { x: 0, y: 4, z: 0 }
      })
    }, true);
    expect(controller.currentClip()).toBe("jump_start");

    controller.update(1 / 60, {
      mode: "on-foot",
      carrying: false,
      motion: motion({
        contactEvent: "land-hard",
        landingImpactStrength: 0.9
      })
    }, true);
    expect(controller.currentClip()).toBe("land_hard");
    const frame = controller.update(1 / 60, {
      mode: "on-foot",
      carrying: false,
      motion: motion()
    }, true);
    expect(frame.bobY).toBe(0);
    expect(frame.leanX).toBe(0);
  });

  it("emits authored foot contacts only for resolved, grounded displacement", () => {
    const controller = new AnimationController(makeClippedCharacter());
    const walkingMotion = motion({
      velocity: { x: 0, y: 0, z: 3.2 },
      speedMetersPerSecond: 3.2,
      requestedGait: "walk"
    });
    const context = { mode: "on-foot" as const, carrying: false, motion: walkingMotion };
    const contacts: string[] = [];
    for (let index = 0; index < 90; index++) {
      contacts.push(...controller.update(1 / 60, context).events.map((event) => event.name));
    }
    expect(contacts).toContain("footstep_left");
    expect(contacts).toContain("footstep_right");

    const blocked = new AnimationController(makeClippedCharacter());
    const blockedContacts = blocked.update(0.1, {
      ...context,
      motion: { ...walkingMotion, speedMetersPerSecond: 0, isCollisionBlocked: true }
    }).events;
    expect(blockedContacts).toHaveLength(0);
  });

  it("routes carrying, fishing holds, rowing, and one-shot interruption to semantic clips", () => {
    const controller = new AnimationController(makeClippedCharacter());
    const walkingMotion = motion({
      velocity: { x: 0, y: 0, z: 3.2 },
      speedMetersPerSecond: 3.2,
      requestedGait: "walk"
    });
    controller.update(1 / 60, { mode: "on-foot", carrying: true, motion: walkingMotion });
    expect(controller.playbackState()).toMatchObject({
      baseClip: "walk_start",
      upperClip: "carry_walk"
    });
    for (let index = 0; index < 24; index++) {
      controller.update(1 / 60, { mode: "on-foot", carrying: true, motion: walkingMotion });
    }
    expect(controller.currentClip()).toBe("carry_walk");

    controller.update(1 / 60, {
      mode: "sport-fishing",
      carrying: false,
      motion: motion(),
      fishingInput: { isReeling: false, isSlacking: false, isBracing: true }
    });
    expect(controller.currentClip()).toBe("brace");
    const seatedFight = controller.update(1 / 60, {
      mode: "sport-fishing",
      carrying: false,
      motion: motion(),
      fishingInput: { isReeling: true, isSlacking: false, isBracing: false },
      boatInput: { boatTypeId: "boat.rowboat", throttle: 0, steering: 0 }
    });
    expect(controller.playbackState().baseClip).toBe("rowboat_idle");
    expect(controller.playbackState().upperClip).toBe("reel");
    expect(controller.currentClip()).toBe("reel");
    expect(seatedFight.clip).toBe("reel");
    controller.update(1 / 60, {
      mode: "sport-fishing",
      carrying: false,
      motion: motion(),
      fishingInput: { isReeling: true, isSlacking: false, isBracing: false },
      boatInput: { boatTypeId: "boat.skiff", throttle: 0, steering: 0 }
    });
    expect(controller.playbackState().baseClip).toBe("skiff_fishing");
    expect(controller.playbackState().upperClip).toBe("reel");
    controller.play("hookset");
    controller.update(1 / 60, {
      mode: "sport-fishing",
      carrying: false,
      motion: motion(),
      fishingInput: { isReeling: false, isSlacking: false, isBracing: false },
      boatInput: { boatTypeId: "boat.skiff", throttle: 0, steering: 0 }
    });
    expect(controller.playbackState().baseClip).toBe("skiff_fishing");
    expect(controller.playbackState().upperClip).toBe("hookset");
    controller.play("brace");
    controller.update(1 / 60, {
      mode: "sport-fishing",
      carrying: false,
      motion: motion(),
      fishingInput: { isReeling: false, isSlacking: false, isBracing: false },
      boatInput: { boatTypeId: "boat.rowboat", throttle: 0, steering: 0 }
    });
    expect(controller.playbackState().baseClip).toBe("rowboat_idle");
    expect(controller.playbackState().upperClip).toBe("brace");
    expect(controller.playbackState().activeAction).toBe("brace");
    controller.cancelAction();
    controller.update(1 / 60, {
      mode: "boat-driving",
      carrying: false,
      motion: motion({ speedMetersPerSecond: 1, requestedGait: "vehicle" }),
      boatInput: { boatTypeId: "boat.rowboat", throttle: 1, steering: 0 }
    });
    expect(controller.currentClip()).toBe("row");

    controller.play("plant");
    controller.update(1 / 60, { mode: "on-foot", carrying: false, motion: motion() });
    expect(controller.playbackState().activeAction).toBe("plant");
    controller.cancelAction();
    expect(controller.playbackState().activeAction).toBeNull();
  });

  it("holds rowboat oars at rest, rows from input rather than coasting speed, and gives skiffs a drive pose", () => {
    const controller = new AnimationController(makeClippedCharacter());
    const coastingMotion = motion({ speedMetersPerSecond: 2.2, requestedGait: "vehicle" });

    controller.update(1 / 60, {
      mode: "boat-driving",
      carrying: false,
      motion: coastingMotion,
      boatInput: { boatTypeId: "boat.rowboat", throttle: 0, steering: 0 }
    });
    expect(controller.currentClip()).toBe("rowboat_idle");

    controller.update(1 / 60, {
      mode: "boat-driving",
      carrying: false,
      motion: coastingMotion,
      boatInput: { boatTypeId: "boat.rowboat", throttle: -0.8, steering: 0 }
    });
    expect(controller.playbackState().clip).toBe("row");
    expect(controller.playbackState().playbackScale).toBeLessThan(0);

    controller.update(1 / 60, {
      mode: "boat-driving",
      carrying: false,
      motion: coastingMotion,
      boatInput: { boatTypeId: "boat.skiff", throttle: 1, steering: 0 }
    });
    expect(controller.currentClip()).toBe("skiff_drive");
  });

  it("drives talk_gesture from the talking flag without a one-shot play()", () => {
    const controller = new AnimationController(makeHumanoidCharacter());
    controller.update(1 / 60, {
      mode: "on-foot",
      carrying: false,
      talking: true,
      motion: motion()
    });
    expect(controller.currentClip()).toBe("talk_gesture");
  });

  it("resolves per-foot world contacts against the shared traversal surface", () => {
    const sloping = {
      mode: "on-foot" as const,
      carrying: false,
      motion: motion({
        velocity: { x: 0, y: 0, z: WALK_SPEED },
        speedMetersPerSecond: WALK_SPEED,
        requestedGait: "walk",
        groundNormal: { x: 0.42, y: 0.908, z: 0 },
        slopeRadians: 0.43
      })
    };
    const character = makeGroundContactCharacter();
    const ik = new AnimationController(character);
    ik.update(1 / 60, sloping);
    character.updateMatrixWorld(true);
    const leftFoot = character.getObjectByName("rig_foot_left")!;
    const rightFoot = character.getObjectByName("rig_foot_right")!;
    const beforeLeft = new THREE.Vector3();
    const beforeRight = new THREE.Vector3();
    leftFoot.getWorldPosition(beforeLeft);
    rightFoot.getWorldPosition(beforeRight);
    ik.resolveGroundContacts(sloping, (x) => ({
      height: x < 0 ? 0.08 : -0.04,
      normal: { x: 0, y: 1, z: 0 }
    }));
    const afterLeft = new THREE.Vector3();
    const afterRight = new THREE.Vector3();
    leftFoot.getWorldPosition(afterLeft);
    rightFoot.getWorldPosition(afterRight);
    expect(character.getObjectByName("rig_thigh_left")?.rotation.x).not.toBe(0);
    expect(character.getObjectByName("rig_shin_left")?.rotation.x).not.toBe(0);
    expect(afterLeft.y).toBeGreaterThan(beforeLeft.y);
    // The opposite foot is in swing at this phase and must not be dragged to
    // the terrain merely because its sample lies below the authored sole.
    expect(afterRight.y).toBeCloseTo(beforeRight.y, 6);
  });

  it("preserves normalized gait phase across walk, run, and carry layer changes", () => {
    const controller = new AnimationController(makeClippedCharacter());
    const walk = {
      mode: "on-foot" as const,
      carrying: false,
      motion: motion({ speedMetersPerSecond: WALK_SPEED, requestedGait: "walk" })
    };
    for (let index = 0; index < 32; index++) controller.update(1 / 60, walk);
    const walkPhase = controller.playbackState().basePhase;
    controller.update(1 / 60, {
      ...walk,
      motion: motion({ speedMetersPerSecond: RUN_SPEED, requestedGait: "run" })
    });
    const runPhase = controller.playbackState().basePhase;
    expect(controller.playbackState().baseClip).toBe("run");
    expect(runPhase).toBeCloseTo((walkPhase + (1 / 60) / RUN_CLIP_SECONDS) % 1, 3);

    controller.update(1 / 60, {
      ...walk,
      carrying: true,
      motion: motion({ speedMetersPerSecond: RUN_SPEED, requestedGait: "run" })
    });
    expect(controller.playbackState().baseClip).toBe("run");
    expect(controller.playbackState().upperClip).toBe("carry_run");
  });

  it("clears one-shots, contact locks, blends, and springs on a presentation discontinuity", () => {
    const character = makeGroundContactCharacter();
    const controller = new AnimationController(character);
    const moving = {
      mode: "on-foot" as const,
      carrying: false,
      motion: motion({
        speedMetersPerSecond: WALK_SPEED,
        requestedGait: "walk",
        accelerationMetersPerSecondSquared: 18
      })
    };
    controller.play("water");
    controller.update(0.1, moving);
    controller.resolveGroundContacts(moving, () => ({
      height: 0,
      normal: { x: 0, y: 1, z: 0 }
    }));
    expect(controller.playbackState().activeAction).toBe("water");

    controller.resetTransientState();
    expect(controller.playbackState()).toMatchObject({
      baseClip: "idle",
      upperClip: null,
      activeAction: null,
      basePhase: 0
    });
  });

  it("preserves a newly-triggered interaction while clearing spatial correction history", () => {
    const controller = new AnimationController(makeGroundContactCharacter());
    const context = {
      mode: "on-foot" as const,
      carrying: false,
      motion: motion({ speedMetersPerSecond: 0, requestedGait: "idle" })
    };
    controller.play("mount");
    controller.update(0.1, context);
    controller.resolveGroundContacts(context, () => ({
      height: 0,
      normal: { x: 0, y: 1, z: 0 }
    }));

    controller.resetSpatialState();

    expect(controller.playbackState().activeAction).toBe("mount");
    expect(controller.currentClip()).toBe("mount");
  });

  it("springs backpack secondaries on elapsed seconds and skips them under reduced motion", () => {
    const character = makeHumanoidCharacter();
    const controller = new AnimationController(character);
    const accelerating = {
      mode: "on-foot" as const,
      carrying: false,
      motion: motion({
        accelerationMetersPerSecondSquared: 18,
        turnRateRadiansPerSecond: 2.4
      })
    };
    for (let index = 0; index < 30; index++) controller.update(1 / 60, accelerating);
    const backpack = character.getObjectByName("rig_backpack");
    expect(backpack?.rotation.x ?? 0).not.toBeCloseTo(0, 3);

    for (let index = 0; index < 12; index++) controller.update(1 / 60, accelerating, true);
    expect(backpack?.rotation.x ?? 0).toBeCloseTo(0, 4);
    expect(backpack?.rotation.z ?? 0).toBeCloseTo(0, 4);
  });

  it("identifies all 20 humanoid bones while rejecting secondary bones and prop attachments", () => {
    const humanoidBones = [
      "rig_root", "rig_pelvis", "rig_spine", "rig_chest", "rig_neck", "rig_head",
      "rig_clavicle_left", "rig_upper_arm_left", "rig_forearm_left", "rig_hand_left",
      "rig_clavicle_right", "rig_upper_arm_right", "rig_forearm_right", "rig_hand_right",
      "rig_thigh_left", "rig_shin_left", "rig_foot_left",
      "rig_thigh_right", "rig_shin_right", "rig_foot_right"
    ];
    for (const bone of humanoidBones) {
      expect(isPlayerRigObjectName(bone)).toBe(true);
    }
    const nonHumanoid = [
      "rig_hat_brim", "rig_backpack", "rig_canteen_left", "rig_canteen_right",
      "char_player_tool_socket", "char_player_carry_socket", "char_player_hip_socket"
    ];
    for (const item of nonHumanoid) {
      expect(isPlayerRigObjectName(item)).toBe(false);
    }
  });

  it("simulates all 4 secondary bones (hat brim, backpack, canteens) as 2nd-order damped oscillators", () => {
    const character = makeHumanoidCharacter();
    const controller = new AnimationController(character);
    const dynamicMotion = {
      mode: "on-foot" as const,
      carrying: false,
      motion: motion({
        accelerationMetersPerSecondSquared: 20,
        turnRateRadiansPerSecond: 3.0
      })
    };

    for (let index = 0; index < 25; index++) {
      controller.update(1 / 60, dynamicMotion);
    }

    const hatBrim = character.getObjectByName("rig_hat_brim");
    const backpack = character.getObjectByName("rig_backpack");
    const canteenL = character.getObjectByName("rig_canteen_left");
    const canteenR = character.getObjectByName("rig_canteen_right");

    expect(hatBrim?.rotation.x).not.toBe(0);
    expect(backpack?.rotation.x).not.toBe(0);
    expect(canteenL?.rotation.x).not.toBe(0);
    expect(canteenR?.rotation.x).not.toBe(0);

    // Settles when motion returns to resting idle
    const restingMotion = {
      mode: "on-foot" as const,
      carrying: false,
      motion: motion()
    };
    for (let index = 0; index < 60; index++) {
      controller.update(1 / 60, restingMotion);
    }

    expect(Math.abs(hatBrim?.rotation.x ?? 0)).toBeLessThan(0.02);
    expect(Math.abs(backpack?.rotation.x ?? 0)).toBeLessThan(0.02);
    expect(Math.abs(canteenL?.rotation.x ?? 0)).toBeLessThan(0.02);
    expect(Math.abs(canteenR?.rotation.x ?? 0)).toBeLessThan(0.02);
  });

  it("supports 3-layer track filtering allowing upper one-shot actions during active locomotion", () => {
    const character = makeHumanoidCharacter();
    const controller = new AnimationController(character);
    const walkingMotion = {
      mode: "on-foot" as const,
      carrying: false,
      motion: motion({
        velocity: { x: 0, y: 0, z: 4.8 },
        speedMetersPerSecond: 4.8,
        requestedGait: "walk"
      })
    };

    controller.update(1 / 60, walkingMotion);
    expect(controller.playbackState().baseClip).toBe("walk_start");

    for (let i = 0; i < 20; i++) controller.update(1 / 60, walkingMotion);
    expect(controller.playbackState().baseClip).toBe("walk");

    // Trigger upper-body one-shot (e.g. water)
    controller.play("water");
    const frame = controller.update(0.1, walkingMotion);

    const state = controller.playbackState();
    expect(state.activeAction).toBe("water");
    expect(state.baseClip).toBe("walk");
    expect(state.upperClip).toBe("water");
    expect(frame.clip).toBe("water");
  });

  it("computes slope pitch, roll, and lateral foot offsets conforming to terrain normals", () => {
    const character = makeHumanoidCharacter();
    const controller = new AnimationController(character);

    const crossSlopeMotion = {
      mode: "on-foot" as const,
      carrying: false,
      motion: motion({
        velocity: { x: 0, y: 0, z: WALK_SPEED },
        speedMetersPerSecond: WALK_SPEED,
        requestedGait: "walk",
        groundNormal: { x: 0.35, y: 0.936, z: 0 },
        slopeRadians: 0.36
      })
    };

    let frame!: ReturnType<typeof controller.update>;
    for (let index = 0; index < 20; index++) {
      frame = controller.update(1 / 60, crossSlopeMotion);
    }

    expect(frame.groundRoll).toBeLessThan(0);
    expect(Math.abs(frame.groundRoll)).toBeLessThanOrEqual(
      CANONICAL_RENDER_CONFIG.motion.groundingMaxTiltRadians *
        CANONICAL_RENDER_CONFIG.motion.groundingBodyTiltScale
    );
    expect(frame.leftFootOffsetY).toBeGreaterThan(0);
    expect(frame.rightFootOffsetY).toBeLessThan(0);

    const flatGroundMotion = {
      mode: "on-foot" as const,
      carrying: false,
      motion: motion()
    };
    for (let index = 0; index < 30; index++) {
      frame = controller.update(1 / 60, flatGroundMotion);
    }
    expect(frame.groundPitch).toBeCloseTo(0, 4);
    expect(frame.groundRoll).toBeCloseTo(0, 4);
  });

  it("keeps idle neutral and scales terrain contact only across moving gaits", () => {
    const slopedMotion = (requestedGait: "idle" | "walk" | "run", speedMetersPerSecond: number) => ({
      mode: "on-foot" as const,
      carrying: false,
      motion: motion({
        velocity: { x: 0, y: 0, z: speedMetersPerSecond },
        speedMetersPerSecond,
        requestedGait,
        groundNormal: { x: 0.35, y: 0.936, z: 0 },
        slopeRadians: 0.36
      })
    });
    const settle = (controller: AnimationController, gait: "idle" | "walk" | "run", speed: number) => {
      let frame!: ReturnType<typeof controller.update>;
      for (let index = 0; index < 60; index++) frame = controller.update(1 / 60, slopedMotion(gait, speed));
      return frame;
    };

    const idle = settle(new AnimationController(makeClippedCharacter()), "idle", 0);
    const walk = settle(new AnimationController(makeClippedCharacter()), "walk", 5);
    const run = settle(new AnimationController(makeClippedCharacter()), "run", 8.2);
    expect(idle.leftFootOffsetY).toBeCloseTo(0, 5);
    expect(idle.rightFootOffsetY).toBeCloseTo(0, 5);
    expect(idle.groundPitch).toBeCloseTo(0, 5);
    expect(idle.groundRoll).toBeCloseTo(0, 5);
    expect(run.leftFootOffsetY / walk.leftFootOffsetY).toBeCloseTo(
      CANONICAL_RENDER_CONFIG.motion.groundingRunFootIkScale /
        CANONICAL_RENDER_CONFIG.motion.groundingWalkFootIkScale,
      2
    );
    expect(run.groundRoll).toBeCloseTo(walk.groundRoll, 4);
  });

  it("maintains stable, non-accumulating foot and leg bone transforms during idle across variable delta times", () => {
    const character = makeHumanoidCharacter();
    const controller = new AnimationController(character);
    const slopedIdle = {
      mode: "on-foot" as const,
      carrying: false,
      motion: motion({
        velocity: { x: 0, y: 0, z: 0 },
        speedMetersPerSecond: 0,
        requestedGait: "idle",
        groundNormal: { x: 0.2, y: 0.95, z: 0.2 },
        slopeRadians: 0.3
      })
    };

    // Settle the grounding smoothing filter
    for (let index = 0; index < 30; index++) {
      controller.update(1 / 60, slopedIdle);
    }

    const thighLeft = character.getObjectByName("rig_thigh_left")!;
    const shinLeft = character.getObjectByName("rig_shin_left")!;
    const footLeft = character.getObjectByName("rig_foot_left")!;
    const settledThighX = thighLeft.rotation.x;
    const settledShinX = shinLeft.rotation.x;
    const settledFootX = footLeft.rotation.x;

    // Advance across fluctuating browser frame rates (45fps to 75fps deltas)
    const deltas = [1 / 58, 1 / 62, 1 / 48, 1 / 72, 1 / 60, 1 / 55, 1 / 65];
    for (const dt of deltas) {
      controller.update(dt, slopedIdle);
      expect(thighLeft.rotation.x).toBeCloseTo(settledThighX, 3);
      expect(shinLeft.rotation.x).toBeCloseTo(settledShinX, 3);
      expect(footLeft.rotation.x).toBeCloseTo(settledFootX, 3);
    }
  });

  it("mounts prop sockets with correct rest orientations and rotation transforms", () => {
    const canPose = socketAttachFor(ASSET_IDS.TOOL_WATERING_CAN_A);
    expect(canPose.rotation).toEqual([0, 0, 0]);
    expect(canPose.scale).toBe(0.72);

    const sicklePose = socketAttachFor(ASSET_IDS.TOOL_SICKLE_A);
    expect(sicklePose.rotation).toEqual([Math.PI, 0, 0]);
    expect(sicklePose.scale).toBe(0.82);

    const rodPose = socketAttachFor(ASSET_IDS.TOOL_FISHING_ROD_A);
    expect(rodPose.rotation).toEqual([Math.PI, 0, 0]);
    expect(rodPose.scale).toBe(0.85);

    const scoopPose = socketAttachFor(ASSET_IDS.TOOL_WORKSTATION_SCOOP_A);
    expect(scoopPose.rotation).toEqual([Math.PI, 0, 0]);
    expect(scoopPose.scale).toBe(0.78);
  });
});
