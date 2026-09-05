import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { HumanoidAnimator } from "../../src/render/animation/AnimationController";
import { ASSET_BY_ID, ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { characterContext, loadHumanoidAsset } from "../helpers/humanoidAssets";

const PLAYER = ASSET_BY_ID.get(ASSET_IDS.CHAR_PLAYER_A)!;
const clip = (name: string) => [...PLAYER.animationClips!, ...PLAYER.additionalAnimationClips!].find((entry) => entry.name === name)!;
const gait = (name: "walk" | "run") => characterContext({ requestedGait: name, speedMetersPerSecond: clip(name).referenceSpeedMetersPerSecond!, velocity: { x: 0, y: 0, z: clip(name).referenceSpeedMetersPerSecond! } });
const create = async () => new HumanoidAnimator(await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A));

describe("authored humanoid state controller", () => {
  it("hands rest through starts, interrupts gait changes, and plays stop before idle", async () => {
    const animator = await create();
    animator.update(1 / 60, gait("walk"));
    expect(animator.currentClip()).toBe("walk_start");
    animator.update(0.02, gait("run"));
    expect(animator.currentClip()).toBe("run");
    animator.update(1 / 60, characterContext());
    expect(animator.currentClip()).toBe("stop");
    animator.update(clip("stop").durationSeconds + 0.05, characterContext());
    expect(animator.currentClip()).toBe("idle");
    animator.update(1 / 60, gait("run"));
    expect(animator.currentClip()).toBe("run_start");
    animator.update(clip("run_start").durationSeconds + 0.05, gait("run"));
    expect(animator.currentClip()).toBe("run");
    expect(animator.playbackState().playbackScale).toBeCloseTo(1, 6);
  });

  it("preserves normalized walk/run/carry phase at the source reference speeds", async () => {
    const animator = await create();
    animator.update(0.65, gait("walk"));
    const phase = animator.normalizedBasePhase();
    animator.update(1 / 60, gait("run"));
    expect(animator.playbackState().baseClip).toBe("run");
    expect(animator.normalizedBasePhase()).toBeCloseTo((phase + (1 / 60) / clip("run").durationSeconds) % 1, 5);
    animator.update(1 / 60, { ...gait("run"), carrying: true });
    expect(animator.playbackState()).toMatchObject({ baseClip: "run", upperClip: "carry_run" });
  });

  it.each([false, true])("keeps gait, carry pose and contacts on resolved travel through a hitch (reduced motion: %s)", async (reducedMotion) => {
    const roots = await Promise.all([loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A), loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A)]);
    const [regular, hitched] = roots.map((root) => new HumanoidAnimator(root));
    for (const name of ["walk", "run"] as const) {
      const context = { ...gait(name), carrying: true };
      for (const animator of [regular, hitched]) {
        animator.resetTransientState();
        animator.update(0.8, context, reducedMotion);
      }
      const regularEvents = regular.update(0.1, context, reducedMotion).events;
      const hitchedEvents = hitched.update(0.4, { ...context, locomotionTimeScale: 0.25 }, reducedMotion).events;
      expect(hitched.playbackState()).toMatchObject({ baseClip: name, upperClip: `carry_${name}`, playbackScale: 0.25 });
      expect(hitched.normalizedBasePhase()).toBeCloseTo(regular.normalizedBasePhase(), 7);
      expect(hitchedEvents).toEqual(regularEvents);
      // Both mixer layers must agree with their phase cursors, including the
      // authored hands. Equal lower-body phase alone would miss carry drift.
      roots[0].traverse((bone) => {
        if (!(bone as THREE.Bone).isBone) return;
        const other = roots[1].getObjectByName(bone.name)!;
        expect(other.position.distanceTo(bone.position)).toBeLessThan(1e-5);
        expect(other.quaternion.clone().normalize().angleTo(bone.quaternion.clone().normalize())).toBeLessThan(1e-5);
      });
      const phase = hitched.normalizedBasePhase();
      hitched.update(0.4, { ...context, locomotionTimeScale: 0 }, reducedMotion);
      expect(hitched.normalizedBasePhase()).toBe(phase);
      hitched.update(0.1, context, reducedMotion);
      regular.update(0.1, context, reducedMotion);
      expect(hitched.normalizedBasePhase()).toBeCloseTo(regular.normalizedBasePhase(), 7);
    }
  });

  it("keeps full action and boat effort timing while a hitch scales locomotion", async () => {
    const animator = await create();
    const context = { ...gait("walk"), locomotionTimeScale: 0.25 };
    animator.update(0.8, gait("walk"));
    animator.play("water");
    animator.update(0.4, context, true);
    expect(animator.playbackState()).toMatchObject({ upperClip: "water", activeAction: "water", playbackScale: 1 });
    animator.update(clip("water").durationSeconds - 0.4 + 0.04, context, true);
    expect(animator.playbackState().activeAction).toBeNull();
    animator.play("plant");
    animator.update(0.4, { ...characterContext(), locomotionTimeScale: 0.25 }, true);
    expect(animator.normalizedBasePhase()).toBeCloseTo(0.4 / clip("plant").durationSeconds, 6);
    animator.cancelAction();
    animator.update(0.4, { ...characterContext(), mode: "boat-driving", locomotionTimeScale: 0.25, boatInput: { boatTypeId: "boat.rowboat", throttle: 1, steering: 0 } }, true);
    expect(animator.playbackState()).toMatchObject({ baseClip: "row", playbackScale: 1.3 });
    const idle = await create();
    idle.update(0.4, { ...characterContext(), locomotionTimeScale: 0.25 }, true);
    expect(idle.normalizedBasePhase()).toBeCloseTo(0.4 / clip("idle").durationSeconds, 6);
  });

  it("emits authored footsteps only for grounded resolved movement and preserves pause", async () => {
    const animator = await create(); const events: string[] = [];
    for (let i = 0; i < 150; i++) events.push(...animator.update(1 / 60, gait("walk")).events.map((event) => event.name));
    expect(events).toContain("footstep_left"); expect(events).toContain("footstep_right");
    const phase = animator.normalizedBasePhase();
    expect(animator.update(0, gait("walk")).events).toEqual([]);
    expect(animator.normalizedBasePhase()).toBe(phase);
    const blocked = await create();
    expect(blocked.update(0.8, characterContext({ requestedGait: "walk", speedMetersPerSecond: 0, isCollisionBlocked: true })).events).toEqual([]);
  });

  it("uses airborne and contact recovery clips while reduced motion keeps essential motion", async () => {
    const animator = await create();
    animator.update(0.1, characterContext({ isGrounded: false, airbornePhase: "rising", velocity: { x: 0, y: 4, z: 0 } }), true);
    expect(animator.currentClip()).toBe("jump_start");
    animator.update(0.1, characterContext({ isGrounded: false, airbornePhase: "falling" }), true);
    expect(animator.currentClip()).toBe("fall");
    animator.update(0.05, characterContext({ contactEvent: "land-hard", landingImpactStrength: 0.9 }), true);
    expect(animator.currentClip()).toBe("land_hard");
    const frame = animator.update(0.05, characterContext(), true);
    expect(frame.bobY).toBe(0); expect(frame.leanX).toBe(0);
  });

  it("layers full and upper actions correctly through carrying, fishing, boats and cancellation", async () => {
    const animator = await create(); animator.update(0.8, { ...gait("walk"), carrying: true });
    animator.play("water"); animator.update(0.1, gait("walk"));
    expect(animator.playbackState()).toMatchObject({ baseClip: "walk", upperClip: "water", activeAction: "water" });
    animator.cancelAction();
    animator.play("plant"); animator.update(0.1, characterContext());
    expect(animator.playbackState()).toMatchObject({ baseClip: "plant", upperClip: null });
    animator.cancelAction();
    const fishing = { ...characterContext(), mode: "sport-fishing" as const, boatInput: { boatTypeId: "boat.rowboat", throttle: 0, steering: 0 }, fishingInput: { isReeling: true, isSlacking: false, isBracing: false } };
    animator.update(0.1, fishing);
    expect(animator.playbackState()).toMatchObject({ baseClip: "rowboat_idle", upperClip: "reel" });
    animator.play("hookset"); animator.update(0.1, { ...fishing, boatInput: { ...fishing.boatInput, boatTypeId: "boat.skiff" } });
    expect(animator.playbackState()).toMatchObject({ baseClip: "skiff_fishing", upperClip: "hookset" });
    animator.cancelAction(); animator.update(0.1, { ...characterContext(), mode: "boat-driving", boatInput: { boatTypeId: "boat.rowboat", throttle: -0.8, steering: 0 } });
    expect(animator.currentClip()).toBe("row"); expect(animator.playbackState().playbackScale).toBeLessThan(0);
    animator.update(0.1, { ...characterContext({ speedMetersPerSecond: 2, requestedGait: "vehicle" }), mode: "boat-driving", boatInput: { boatTypeId: "boat.rowboat", throttle: 0, steering: 0 } });
    expect(animator.currentClip()).toBe("rowboat_idle");
  });

  it("resets spatial correction independently of an active action and resets complete presentation state", async () => {
    const root = await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A);
    const animator = new HumanoidAnimator(root); animator.play("mount"); animator.update(0.1, characterContext());
    animator.resetSpatialState(); expect(animator.playbackState().activeAction).toBe("mount");
    animator.resetTransientState(); expect(animator.playbackState()).toMatchObject({ baseClip: "idle", upperClip: null, activeAction: null, basePhase: 0 });
    animator.update(0.1, characterContext()); expect(animator.currentClip()).toBe("idle");
    expect(animator.actionDurationSeconds("mount")).toBe((root.userData.animationClips as THREE.AnimationClip[]).find((clip) => clip.name === "mount")!.duration);
    animator.dispose(); expect(animator.playbackState().activeAction).toBeNull();
  });

  it("rejects missing source clips explicitly", async () => {
    const root = await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A);
    root.userData.animationClips = root.userData.animationClips.filter((entry: { name: string }) => entry.name !== "water");
    expect(() => new HumanoidAnimator(root)).toThrow("missing authored clip water");
  });
});
