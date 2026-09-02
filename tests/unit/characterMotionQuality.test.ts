import fs from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";
import { ASSET_BY_ID, ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { PLAYER_TRAVERSAL_TUNING } from "../../src/simulation/navigation/PlayerTraversal";
import { MOUNT_TUNING } from "../../src/simulation/mounts/Mounts";

/**
 * Motion-quality regression guard.
 *
 * The shipped player character had, simultaneously: a completely frozen `idle`
 * (two keyframes, STEP interpolation), a `run` whose feet covered a third of the
 * ground the gait speed claimed, elbows with three degrees of travel, and a
 * dozen clips whose feet passed through the floor. Every one of those is
 * mechanically detectable, so none of them should ever ship again.
 */

const ROOT = path.resolve(import.meta.dirname, "../..");
const FPS = 30;
const SIDES = ["left", "right"] as const;

let player: GLTF;

/** Clips whose feet are deliberately not on the ground plane. */
const NON_GROUNDED_CLIPS = new Set([
  "mounted_idle", "mounted_walk", "mounted_trot", "mounted_gallop",
  "mount", "mount_right", "dismount", "dismount_right",
  "rowboat_idle", "row", "board", "board_skiff", "dock", "dock_skiff",
  "skiff_idle", "skiff_drive", "skiff_fishing",
  "jump_start", "fall", "land_soft", "land_hard"
]);

/** In-place locomotion clips, paired with the gameplay speed that drives them. */
const LOCOMOTION_SPEEDS: Record<string, number> = {
  walk: PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond,
  carry_walk: PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond,
  run: PLAYER_TRAVERSAL_TUNING.sprintSpeedMetersPerSecond,
  carry_run: PLAYER_TRAVERSAL_TUNING.sprintSpeedMetersPerSecond
};

function bone(root: THREE.Object3D, name: string): THREE.Object3D {
  const found = root.getObjectByName(name);
  if (!found) throw new Error(`Missing bone ${name}`);
  return found;
}

function interiorAngleDegrees(a: THREE.Vector3, joint: THREE.Vector3, b: THREE.Vector3): number {
  const first = new THREE.Vector3().subVectors(a, joint).normalize();
  const second = new THREE.Vector3().subVectors(b, joint).normalize();
  return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(first.dot(second), -1, 1)));
}

/** Samples a clip on the 30 fps grid and reports the joint measurements we care about. */
function sampleClip(clip: THREE.AnimationClip) {
  const root = player.scene;
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip).play();
  action.paused = true;

  const frames = Math.max(2, Math.round(clip.duration * FPS) + 1);
  const ankles: Record<string, THREE.Vector3[]> = { left: [], right: [] };
  const hands: THREE.Vector3[] = [];
  const kneeAngles: number[] = [];
  const elbowAngles: number[] = [];

  for (let frame = 0; frame < frames; frame += 1) {
    action.time = (frame / (frames - 1)) * clip.duration;
    mixer.update(0);
    root.updateMatrixWorld(true);
    for (const side of SIDES) {
      const hip = bone(root, `rig_thigh_${side}`).getWorldPosition(new THREE.Vector3());
      const knee = bone(root, `rig_shin_${side}`).getWorldPosition(new THREE.Vector3());
      const ankle = bone(root, `rig_foot_${side}`).getWorldPosition(new THREE.Vector3());
      ankles[side].push(ankle.clone());
      kneeAngles.push(interiorAngleDegrees(hip, knee, ankle));

      const shoulder = bone(root, `rig_upper_arm_${side}`).getWorldPosition(new THREE.Vector3());
      const elbow = bone(root, `rig_forearm_${side}`).getWorldPosition(new THREE.Vector3());
      const wrist = bone(root, `rig_hand_${side}`).getWorldPosition(new THREE.Vector3());
      hands.push(wrist.clone());
      elbowAngles.push(interiorAngleDegrees(shoulder, elbow, wrist));
    }
  }
  mixer.uncacheClip(clip);

  const travelled = (points: THREE.Vector3[]) =>
    Math.max(...points.map((point) => point.distanceTo(points[0]!)));

  return {
    kneeMax: Math.max(...kneeAngles),
    elbowRange: Math.max(...elbowAngles) - Math.min(...elbowAngles),
    lowestAnkle: Math.min(...SIDES.flatMap((side) => ankles[side].map((point) => point.y))),
    /** Largest extremity excursion — zero means a frozen pose. */
    motion: Math.max(travelled(hands), ...SIDES.map((side) => travelled(ankles[side]))),
    /** Peak-to-peak ankle travel along the facing axis: the in-place step length. */
    stepLength: Math.max(
      ...SIDES.map((side) => {
        const zs = ankles[side].map((point) => point.z);
        return Math.max(...zs) - Math.min(...zs);
      })
    )
  };
}

beforeAll(async () => {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const bytes = await fs.readFile(path.join(ROOT, "public/assets/models/char_player_a.glb"));
  player = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    ""
  );
}, 60_000);

describe("character motion quality", () => {
  it("ships no frozen clip", () => {
    for (const clip of player.animations) {
      const { motion } = sampleClip(clip);
      expect(motion, `${clip.name} is a frozen pose`).toBeGreaterThan(0.005);
    }
  });

  it("keeps feet out of the floor on every grounded clip", () => {
    const restAnkle = bone(player.scene, "rig_foot_left").getWorldPosition(new THREE.Vector3()).y;
    for (const clip of player.animations) {
      if (NON_GROUNDED_CLIPS.has(clip.name)) continue;
      const { lowestAnkle } = sampleClip(clip);
      expect(
        restAnkle - lowestAnkle,
        `${clip.name} drives a foot below the ground plane`
      ).toBeLessThan(0.05);
    }
  });

  it("never hyperextends a knee", () => {
    for (const clip of player.animations) {
      const { kneeMax } = sampleClip(clip);
      expect(kneeMax, `${clip.name} locks a knee straight`).toBeLessThanOrEqual(179);
    }
  });

  it("pumps the arms through the locomotion cycles", () => {
    // The hand-authored cycles moved the elbow three degrees across a whole
    // walk, which is what made the arms read as rigid pendulums.
    for (const clipName of ["walk", "run"]) {
      const clip = player.animations.find((candidate) => candidate.name === clipName)!;
      const { elbowRange } = sampleClip(clip);
      expect(elbowRange, `${clipName} barely bends the elbow`).toBeGreaterThan(10);
    }
  });

  it("folds the swing knee through the locomotion cycles", () => {
    for (const [clipName, minimumFold] of [["walk", 130], ["run", 110]] as const) {
      const clip = player.animations.find((candidate) => candidate.name === clipName)!;
      const root = player.scene;
      const mixer = new THREE.AnimationMixer(root);
      const action = mixer.clipAction(clip).play();
      action.paused = true;
      let tightest = 180;
      const frames = Math.round(clip.duration * FPS) + 1;
      for (let frame = 0; frame < frames; frame += 1) {
        action.time = (frame / (frames - 1)) * clip.duration;
        mixer.update(0);
        root.updateMatrixWorld(true);
        for (const side of SIDES) {
          tightest = Math.min(tightest, interiorAngleDegrees(
            bone(root, `rig_thigh_${side}`).getWorldPosition(new THREE.Vector3()),
            bone(root, `rig_shin_${side}`).getWorldPosition(new THREE.Vector3()),
            bone(root, `rig_foot_${side}`).getWorldPosition(new THREE.Vector3())
          ));
        }
      }
      mixer.uncacheClip(clip);
      expect(tightest, `${clipName} swing knee stays straight`).toBeLessThan(minimumFold);
    }
  });

  it("matches in-place stride to the gameplay travel speed", () => {
    // A cycle that covers less ground than the body travels is a skate. This is
    // the check that would have caught the shipped run covering a third of it.
    for (const [clipName, speed] of Object.entries(LOCOMOTION_SPEEDS)) {
      const clip = player.animations.find((candidate) => candidate.name === clipName)!;
      const { stepLength } = sampleClip(clip);
      const requiredStep = (speed * clip.duration) / 2;
      const ratio = stepLength / requiredStep;
      expect(ratio, `${clipName} stride is ${(ratio * 100).toFixed(0)}% of its travel`)
        .toBeGreaterThan(0.85);
      expect(ratio, `${clipName} overstrides its travel`).toBeLessThan(1.2);
    }
  });

  it("keeps every mount gait ahead of travelling on foot", () => {
    expect(MOUNT_TUNING.walkSpeedMetersPerSecond)
      .toBeGreaterThan(PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond);
    expect(MOUNT_TUNING.trotSpeedMetersPerSecond)
      .toBeGreaterThan(PLAYER_TRAVERSAL_TUNING.sprintSpeedMetersPerSecond);
    expect(MOUNT_TUNING.gallopSpeedMetersPerSecond)
      .toBeGreaterThan(MOUNT_TUNING.trotSpeedMetersPerSecond);
  });

  it("declares each locomotion clip at the speed that drives it", () => {
    const spec = ASSET_BY_ID.get(ASSET_IDS.CHAR_PLAYER_A)!;
    const clips = new Map(
      [...(spec.animationClips ?? []), ...(spec.additionalAnimationClips ?? [])]
        .map((clip) => [clip.name, clip])
    );
    for (const [clipName, speed] of Object.entries(LOCOMOTION_SPEEDS)) {
      expect(clips.get(clipName)?.referenceSpeedMetersPerSecond, clipName).toBe(speed);
    }
    expect(clips.get("mounted_walk")?.referenceSpeedMetersPerSecond)
      .toBe(MOUNT_TUNING.walkSpeedMetersPerSecond);
    expect(clips.get("mounted_trot")?.referenceSpeedMetersPerSecond)
      .toBe(MOUNT_TUNING.trotSpeedMetersPerSecond);
    expect(clips.get("mounted_gallop")?.referenceSpeedMetersPerSecond)
      .toBe(MOUNT_TUNING.gallopSpeedMetersPerSecond);
  });
});
