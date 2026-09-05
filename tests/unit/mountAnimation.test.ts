import { describe, expect, it } from "vitest";
import * as THREE from "three";
import fs from "node:fs/promises";
import path from "node:path";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";
import {
  AnimationController
} from "../../src/render/animation/AnimationController";
import { ASSET_BY_ID, ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import type { PlayerMotionSample } from "../../src/simulation/core/PhysicsAdapter";
import { loadHumanoidAsset } from "../helpers/humanoidAssets";
import { MOUNT_TUNING } from "../../src/simulation/mounts/Mounts";
import { WorldScene } from "../../src/render/scene/WorldScene";
import type { GameState } from "../../src/simulation/core/types";
import type { PresentedPlayerFrame } from "../../src/render/presentation/PlayerPresentationBuffer";

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

describe("mounted character animation", () => {
  it.each([false, true])("keeps rider and donkey cadence aligned during acceleration, braking and hitches (reduced motion: %s)", async (reducedMotion) => {
    const bytes = await fs.readFile(path.resolve(process.env.NEVA_EQUIPMENT_CANDIDATE_DIR ?? "public/assets/models", "fauna_donkey_a.glb"));
    await MeshoptDecoder.ready;
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ""
    );
    const mixer = new THREE.AnimationMixer(gltf.scene);
    const actions = new Map(gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
    const donkey = {
      id: "test-donkey", root: gltf.scene, mixer, actions,
      activeClip: "walk", attachedMountId: null,
      transitionUntilSeconds: Infinity, lastAnimationUpdateSeconds: 1
    };
    // Exercise the real mounted cadence method without creating a renderer.
    // Attachment placement and contacts have separate exported-asset gates.
    const scene = Object.assign(Object.create(WorldScene.prototype), {
      donkeyPresentation: donkey, playerMesh: null, prefersReducedMotion: reducedMotion
    }) as { updateDonkeyPresentation(state: Readonly<GameState>, player: PresentedPlayerFrame, time: number, delta: number, locomotionTimeScale: number): void };
    const rider = new AnimationController(await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A));
    const state = { player: { activeMountId: donkey.id }, mounts: { [donkey.id]: { x: 0, y: 0, z: 0, rotationY: 0 } } } as unknown as GameState;
    const donkeySpecs = ASSET_BY_ID.get(ASSET_IDS.FAUNA_DONKEY_A)!.animationClips!;
    let time = 1;
    for (const gait of ["walk", "trot", "gallop"] as const) {
      const referenceSpeed = donkeySpecs.find((clip) => clip.name === gait)!.referenceSpeedMetersPerSecond!;
      const sample = motion({ speedMetersPerSecond: referenceSpeed, requestedGait: gait });
      const context = { mode: "mounted" as const, carrying: false, motion: sample };
      const player = { x: 0, y: 0.5, z: 0, rotationY: 0, motion: sample, discontinuityReason: "none", discontinuitySequence: 0 } as PresentedPlayerFrame;
      rider.resetTransientState();
      rider.update(0, context, reducedMotion);
      const action = actions.get(gait)!;
      mixer.stopAllAction(); action.reset().play(); donkey.activeClip = gait;
      donkey.lastAnimationUpdateSeconds = time;
      let expectedElapsed = 0;
      for (const locomotionTimeScale of [1, 0.25]) {
        // Cover braking below the former minimum and acceleration above the
        // former maximum without restarting either gait's phase clock.
        for (const speedRatio of [1, 0.1, 2.5, 0.1, 1]) {
          const moving = { ...sample, speedMetersPerSecond: referenceSpeed * speedRatio };
          time += 0.4;
          expectedElapsed += 0.4 * speedRatio * locomotionTimeScale;
          rider.update(0.4, { ...context, motion: moving, locomotionTimeScale }, reducedMotion);
          scene.updateDonkeyPresentation(state, { ...player, motion: moving }, time, 0.4, locomotionTimeScale);
          expect(action.time).toBeCloseTo(expectedElapsed % action.getClip().duration, 6);
          expect(rider.normalizedBasePhase()).toBeCloseTo(action.time / action.getClip().duration, 6);
          expect(mixer.timeScale).toBe(1);
          expect(action.getEffectiveTimeScale()).toBeCloseTo(speedRatio * locomotionTimeScale, 6);
          expect(rider.playbackState().playbackScale).toBeCloseTo(action.getEffectiveTimeScale(), 6);
        }
      }
    }
    // Dismount keeps its authored duration even after canonical ownership has
    // already moved the player off the animal.
    state.player.activeMountId = null;
    const dismount = actions.get("dismount")!;
    mixer.stopAllAction(); dismount.reset().play(); donkey.activeClip = "dismount";
    donkey.lastAnimationUpdateSeconds = time;
    scene.updateDonkeyPresentation(state, { x: 0, y: 0, z: 0, rotationY: 0, motion: motion() } as PresentedPlayerFrame, time + 0.4, 0.4, 0.25);
    expect(mixer.timeScale).toBe(1);
    expect(dismount.time).toBeCloseTo(0.4, 6);
  });

  it("selects idle, walk, and trot from resolved mounted motion", async () => {
    const controller = new AnimationController(await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A));

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

  it("plays mount and dismount as full seated transitions", async () => {
    const controller = new AnimationController(await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A));
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
