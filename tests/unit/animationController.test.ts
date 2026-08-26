import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  AnimationController,
  isPlayerRigObjectName
} from "../../src/render/animation/AnimationController";
import type { PlayerMotionSample } from "../../src/simulation/core/PhysicsAdapter";
import { ASSET_BY_ID, ASSET_IDS } from "../../src/render/assets/AssetCatalog";

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

describe("AnimationController", () => {
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

  it("uses authored start, loop, stop, and speed-matched gait states", () => {
    const controller = new AnimationController(makeClippedCharacter());
    const walking = {
      mode: "on-foot" as const,
      carrying: false,
      motion: motion({
        velocity: { x: 0, y: 0, z: 3.2 },
        speedMetersPerSecond: 3.2,
        requestedGait: "walk"
      })
    };
    controller.update(1 / 60, walking);
    expect(controller.currentClip()).toBe("walk_start");
    for (let index = 0; index < 24; index++) controller.update(1 / 60, walking);
    expect(controller.playbackState()).toMatchObject({ clip: "walk", playbackScale: 1 });

    const stopping = { mode: "on-foot" as const, carrying: false, motion: motion() };
    controller.update(1 / 60, stopping);
    expect(controller.currentClip()).toBe("stop");
    for (let index = 0; index < 24; index++) controller.update(1 / 60, stopping);
    expect(controller.currentClip()).toBe("idle");
  });

  it("matches authored gait phase to resolved gameplay travel speed", () => {
    const walking = new AnimationController(makeClippedCharacter());
    const walkContext = {
      mode: "on-foot" as const,
      carrying: false,
      motion: motion({
        velocity: { x: 0, y: 0, z: 5 },
        speedMetersPerSecond: 5,
        requestedGait: "walk"
      })
    };
    for (let index = 0; index < 36; index += 1) walking.update(1 / 60, walkContext);
    expect(walking.playbackState()).toMatchObject({ clip: "walk" });
    expect(walking.playbackState().playbackScale).toBeCloseTo(5 / 3.2, 3);

    const running = new AnimationController(makeClippedCharacter());
    const runContext = {
      ...walkContext,
      motion: motion({
        velocity: { x: 0, y: 0, z: 8.2 },
        speedMetersPerSecond: 8.2,
        requestedGait: "run"
      })
    };
    for (let index = 0; index < 36; index += 1) running.update(1 / 60, runContext);
    expect(running.playbackState()).toMatchObject({ clip: "run" });
    expect(running.playbackState().playbackScale).toBeCloseTo(8.2 / 5.6, 3);
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
    expect(controller.currentClip()).toBe("walk_start");
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
});
