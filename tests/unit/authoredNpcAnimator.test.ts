// tests/unit/authoredNpcAnimator.test.ts

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  AuthoredNpcAnimator,
  removeNpcClipRootTravel,
  type NpcAnimationCue
} from "../../src/render/animation/AuthoredNpcAnimator";
import type { CharacterAnimationContext } from "../../src/render/animation/AnimationController";

function createMockCharacterModel(): THREE.Group {
  const model = new THREE.Group();
  const root = new THREE.Bone();
  root.name = "root";
  const pelvis = new THREE.Bone();
  pelvis.name = "pelvis";
  const spine = new THREE.Bone();
  spine.name = "spine_01";
  const neck = new THREE.Bone();
  neck.name = "neck_01";
  const head = new THREE.Bone();
  head.name = "head";

  root.add(pelvis);
  pelvis.add(spine);
  spine.add(neck);
  neck.add(head);
  model.add(root);

  const times = [0, 1];
  const values = [0, 0, 0, 0, 0, 0];
  const track = new THREE.VectorKeyframeTrack("root.position", times, values);

  const idleClip = new THREE.AnimationClip("idle.001", 2.0, [track]);
  const walkClip = new THREE.AnimationClip("walk.001", 1.0, [track]);
  const greetClip = new THREE.AnimationClip("greet_01.001", 1.5, [track]);
  const scratchClip = new THREE.AnimationClip("scratch.001", 2.0, [track]);
  const waveClip = new THREE.AnimationClip("wave_goodbye_02.001", 1.5, [track]);
  const clapClip = new THREE.AnimationClip("clap.001", 1.5, [track]);
  const agreeClip = new THREE.AnimationClip("agree.001", 1.5, [track]);

  model.userData.animationClips = [idleClip, walkClip, greetClip, scratchClip, waveClip, clapClip, agreeClip];
  return model;
}

const cue: NpcAnimationCue = {
  timeOfDay: "day", nearPlayer: false, reactionKind: null, reactionAttention: 0
};

function createMockContext(speed = 0, talking = false): CharacterAnimationContext {
  return {
    mode: "on-foot",
    carrying: false,
    talking,
    motion: {
      speedMetersPerSecond: speed,
      accelerationMetersPerSecondSquared: 0,
      turnRateRadiansPerSecond: 0,
      groundNormal: { x: 0, y: 1, z: 0 },
      slopeRadians: 0,
      contactSurface: "grass",
      requestedGait: speed > 0.01 ? "walk" : "idle"
    } as CharacterAnimationContext["motion"]
  };
}

describe("AuthoredNpcAnimator", () => {
  it("removes baked horizontal hip travel without changing source clips or vertical motion", () => {
    const hips = new THREE.VectorKeyframeTrack("mixamorigHips.position", [0, 0.5, 1], [
      0.02, 0.54, 0.01,
      0.04, 0.57, 0.75,
      0.02, 0.54, 1.5
    ]);
    const source = new THREE.AnimationClip("walk.001", 1, [hips]);
    const prepared = removeNpcClipRootTravel(source);
    expect(prepared).not.toBe(source);
    const expected = [
      0.02, 0.54, 0.01,
      0.02, 0.57, 0.01,
      0.02, 0.54, 0.01
    ];
    [...prepared.tracks[0].values].forEach((value, index) => {
      expect(value).toBeCloseTo(expected[index], 5);
    });
    expect(source.tracks[0].values[8]).toBe(1.5);

    const subtle = new THREE.AnimationClip("idle.001", 1, [new THREE.VectorKeyframeTrack(
      "mixamorigHips.position", [0, 1], [0, 0.54, 0, 0.12, 0.54, 0.04]
    )]);
    expect(removeNpcClipRootTravel(subtle)).toBe(subtle);
  });

  it("initializes and plays idle animation by default", () => {
    const model = createMockCharacterModel();
    const animator = new AuthoredNpcAnimator(model, "npc.barnaby");

    const frame = animator.update(0.1, createMockContext(0, false));
    expect(frame.clip).toBe("idle");
    animator.dispose();
  });

  it("transitions to walk and scales playback when moving", () => {
    const model = createMockCharacterModel();
    const animator = new AuthoredNpcAnimator(model, "npc.barnaby");

    const frame = animator.update(0.1, createMockContext(1.25, false));
    expect(frame.clip).toBe("walk");
    animator.dispose();
  });

  it("transitions to talking when context.talking is true", () => {
    const model = createMockCharacterModel();
    const animator = new AuthoredNpcAnimator(model, "npc.barnaby");

    const frame = animator.update(0.1, createMockContext(0, true));
    // Talking state is active; returns idle posture frame
    expect(frame.clip).toBe("idle");
    animator.dispose();
  });

  it("holds a station while an ambient clip completes, then resumes walking", () => {
    const animator = new AuthoredNpcAnimator(createMockCharacterModel(), "npc.barnaby");
    animator.update(0.2, createMockContext(1.2), false, cue);
    animator.update(0.1, createMockContext(), false, cue);
    expect(animator.activeClipName()).toBe("scratch.001");
    expect(animator.wantsStationPause()).toBe(true);
    animator.update(1.7, createMockContext(), false, cue);
    expect(animator.wantsStationPause()).toBe(false);
    animator.update(0.2, createMockContext(1.2), false, cue);
    expect(animator.activeClipName()).toBe("walk.001");
    animator.dispose();
  });

  it("uses gestures only for their matching social context", () => {
    const animator = new AuthoredNpcAnimator(createMockCharacterModel(), "npc.barnaby");
    animator.update(0.1, createMockContext(), false, {
      ...cue, reactionKind: "milestone", reactionAttention: 0.8
    });
    expect(animator.activeClipName()).toBe("clap.001");
    animator.update(0.1, createMockContext(0, true), false, { ...cue, nearPlayer: true });
    expect(animator.activeClipName()).toBe("greet_01.001");
    animator.update(0.1, createMockContext(), false, { ...cue, nearPlayer: true });
    expect(animator.activeClipName()).toBe("wave_goodbye_02.001");
    animator.dispose();
  });

  it("does not replay a social gesture when an off-cadence update has no cue", () => {
    const animator = new AuthoredNpcAnimator(createMockCharacterModel(), "npc.barnaby");
    const reaction = { ...cue, reactionKind: "ready" as const, reactionAttention: 0.8 };
    animator.update(0.1, createMockContext(), false, reaction);
    expect(animator.activeClipName()).toBe("agree.001");
    animator.update(1, createMockContext());
    animator.update(0.1, createMockContext(), false, reaction);
    animator.update(0.1, createMockContext(), false, reaction);
    expect(animator.wantsStationPause()).toBe(false);
    animator.dispose();
  });

  it("skips optional station gestures under reduced motion", () => {
    const animator = new AuthoredNpcAnimator(createMockCharacterModel(), "npc.barnaby");
    animator.update(0.2, createMockContext(1.2), true, cue);
    animator.update(0.1, createMockContext(), true, cue);
    expect(animator.activeClipName()).toBe("idle.001");
    expect(animator.wantsStationPause()).toBe(false);
    animator.dispose();
  });

  it("damps and applies head look without errors", () => {
    const model = createMockCharacterModel();
    const animator = new AuthoredNpcAnimator(model, "npc.barnaby");

    expect(() => {
      animator.lookTowardHeading(0.5, 0.016);
      animator.lookTowardHeading(-0.5, 0.016);
      animator.resetSpatialState();
    }).not.toThrow();

    animator.dispose();
  });
});
