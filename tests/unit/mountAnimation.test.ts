import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  AnimationController
} from "../../src/render/animation/AnimationController";
import { ASSET_BY_ID, ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import type { PlayerMotionSample } from "../../src/simulation/core/PhysicsAdapter";
import { MOUNT_TUNING } from "../../src/simulation/mounts/Mounts";

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

function makeMountedCharacter(): THREE.Group {
  const root = new THREE.Group();
  root.userData.assetId = ASSET_IDS.CHAR_PLAYER_A;
  const spec = ASSET_BY_ID.get(ASSET_IDS.CHAR_PLAYER_A)!;
  const clips = [
    ...(spec.animationClips ?? []),
    ...(spec.additionalAnimationClips ?? [])
  ];
  root.userData.animationClips = clips.map(
    (clip) => new THREE.AnimationClip(clip.name, clip.durationSeconds, [])
  );
  return root;
}

describe("mounted character animation", () => {
  it("selects idle, walk, and trot from resolved mounted motion", () => {
    const controller = new AnimationController(makeMountedCharacter());

    controller.update(1 / 60, {
      mode: "mounted",
      carrying: false,
      motion: motion()
    });
    expect(controller.currentClip()).toBe("mounted_idle");

    controller.update(1 / 60, {
      mode: "mounted",
      carrying: false,
      motion: motion({
        velocity: { x: 0, y: 0, z: MOUNT_TUNING.walkSpeedMetersPerSecond },
        speedMetersPerSecond: MOUNT_TUNING.walkSpeedMetersPerSecond,
        requestedGait: "walk"
      })
    });
    expect(controller.currentClip()).toBe("mounted_walk");

    controller.update(1 / 60, {
      mode: "mounted",
      carrying: false,
      motion: motion({
        velocity: { x: 0, y: 0, z: MOUNT_TUNING.trotSpeedMetersPerSecond },
        speedMetersPerSecond: MOUNT_TUNING.trotSpeedMetersPerSecond,
        requestedGait: "trot"
      })
    });
    expect(controller.currentClip()).toBe("mounted_trot");
    expect(controller.playbackState().baseClip).toBe("mounted_trot");
  });

  it("plays mount and dismount as full seated transitions", () => {
    const controller = new AnimationController(makeMountedCharacter());
    const context = {
      mode: "mounted" as const,
      carrying: false,
      motion: motion()
    };

    controller.update(1 / 60, context);
    controller.play("mount");
    controller.update(0.1, context);
    expect(controller.currentClip()).toBe("mount");
    expect(controller.playbackState().activeAction).toBe("mount");

    controller.play("dismount");
    controller.update(0.1, context);
    expect(controller.currentClip()).toBe("dismount");
    expect(controller.playbackState().activeAction).toBe("dismount");

    controller.play("mount_right");
    controller.update(0.1, context);
    expect(controller.currentClip()).toBe("mount_right");

    controller.play("dismount_right");
    controller.update(0.1, context);
    expect(controller.currentClip()).toBe("dismount_right");
  });
});
