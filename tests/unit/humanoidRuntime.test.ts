import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { HumanoidAnimator } from "../../src/render/animation/AnimationController";
import { HumanoidFootSupportSolver } from "../../src/render/animation/HumanoidFootSupportSolver";
import { resolveHumanoidRig } from "../../src/render/animation/HumanoidRig";
import type { RuntimeHumanoidRig } from "../../src/render/assets/AssetCatalog";
import { characterContext, loadHumanoidAsset } from "../helpers/humanoidAssets";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import { ASSET_BY_ID, ASSET_IDS } from "../../src/render/assets/AssetCatalog";

function sourceFixture(): THREE.Group {
  const root = new THREE.Group();
  const bone = (name: string, parent: THREE.Object3D, x: number, y: number, z = 0) => {
    const result = new THREE.Bone(); result.name = name; result.position.set(x, y, z); parent.add(result); return result;
  };
  const body = bone("Body", root, 0, 1, 0);
  const chest = bone("Chest", body, 0, 0.4);
  bone("Head", chest, 0, 0.2);
  const names: RuntimeHumanoidRig["bones"] = { pelvis: "Body", chest: "Chest", spine: "Chest", head: "Head" };
  const legs = {} as RuntimeHumanoidRig["legs"];
  const arms = {} as RuntimeHumanoidRig["arms"];
  const grips = {} as RuntimeHumanoidRig["grips"];
  for (const side of ["left", "right"] as const) {
    const x = side === "left" ? 0.15 : -0.15;
    const thigh = bone(`Thigh_${side}`, body, x, 0);
    bone(`Shin_${side}`, thigh, 0, -0.45);
    bone(`Foot_${side}`, root, x, 0.1);
    const arm = bone(`Arm_${side}`, chest, x * 2, 0);
    const forearm = bone(`Forearm_${side}`, arm, 0, -0.25);
    const hand = bone(`Hand_${side}`, forearm, 0, -0.25);
    bone(`Finger_${side}`, hand, 0, -0.08);
    bone(`Grip_${side}`, hand, 0, -0.03, 0.02);
    Object.assign(names, { [`thigh_${side}`]: thigh.name, [`shin_${side}`]: `Shin_${side}`, [`foot_${side}`]: `Foot_${side}`,
      [`upper_arm_${side}`]: arm.name, [`forearm_${side}`]: forearm.name, [`hand_${side}`]: hand.name });
    legs[side] = { shinTip: [0, -0.45, 0], soleOffset: [0, -0.1, 0], soleNormal: [0, 1, 0], bendDirection: [0, 0, 1] };
    arms[side] = { bendDirection: [Math.sign(x), 0, -0.3] };
    grips[side] = `Grip_${side}`;
  }
  root.userData.humanoidRig = { bones: names, forwardAxis: "+Z", legs, arms, grips } satisfies RuntimeHumanoidRig;
  const clips = ["idle", "walk_start", "walk", "run_start", "run", "stop", "turn_left", "turn_right", "water", "pickup"];
  root.userData.animationClipSpecs = clips.map((name) => ({ name, durationSeconds: 1, loop: ["idle", "walk", "run"].includes(name),
    ...(name === "walk" || name === "run" ? { referenceSpeedMetersPerSecond: 2 } : {}) }));
  root.userData.animationClips = clips.map((name) => new THREE.AnimationClip(name, 1, [
    new THREE.NumberKeyframeTrack("Chest.rotation[z]", [0, 0.5, 1], [0, name === "water" ? 0.6 : 0.2, 0]),
    new THREE.NumberKeyframeTrack("Finger_left.rotation[x]", [0, 0.5, 1], [0, name === "water" ? 0.8 : 0, 0])
  ]));
  return root;
}

describe("source humanoid runtime", () => {
  it("plays idle on construction and reset instead of leaving the bind pose frozen", () => {
    const root = sourceFixture(); const animator = new HumanoidAnimator(root);
    animator.update(0.3, characterContext());
    expect(root.getObjectByName("Chest")!.rotation.z).toBeGreaterThan(0.05);
    animator.resetTransientState(); animator.update(0.3, characterContext());
    expect(root.getObjectByName("Chest")!.rotation.z).toBeGreaterThan(0.05);
  });

  it("keeps constant authored tracks when PropertyMixer skips unchanged writes", () => {
    const root = sourceFixture();
    root.userData.animationClips = (root.userData.animationClips as THREE.AnimationClip[]).map((clip) => clip.name === "idle"
      ? new THREE.AnimationClip("idle", 1, [new THREE.NumberKeyframeTrack("Chest.rotation[z]", [0, 1], [0.3, 0.3])]) : clip);
    const animator = new HumanoidAnimator(root); const chest = root.getObjectByName("Chest")!;
    animator.update(0.4, characterContext());
    expect(chest.rotation.z).toBeCloseTo(0.3, 6);
    chest.rotation.z = 0.9; // A post-mixer constraint must not become the next pose.
    animator.update(0.1, characterContext());
    expect(chest.rotation.z).toBeCloseTo(0.3, 6);
  });

  it("keeps sampled pose and phase identical across slow travel and throttled updates", () => {
    const a = sourceFixture(); const b = sourceFixture();
    const first = new HumanoidAnimator(a); const second = new HumanoidAnimator(b);
    first.setPreviewClip("walk"); second.setPreviewClip("walk");
    const context = characterContext({ speedMetersPerSecond: 0.4, requestedGait: "walk" });
    first.update(0.4, context);
    for (let i = 0; i < 24; i++) second.update(1 / 60, context);
    expect(first.previewPhase()).toBeCloseTo(0.08, 6);
    expect(first.previewPhase()).toBeCloseTo(second.previewPhase(), 6);
    expect(a.getObjectByName("Chest")!.quaternion.angleTo(b.getObjectByName("Chest")!.quaternion)).toBeLessThan(0.00001);
  });

  it("holds one-shot preview endpoints and supports exact scrubbing", () => {
    const animator = new HumanoidAnimator(sourceFixture()); animator.setPreviewClip("pickup");
    animator.update(1.4, characterContext()); expect(animator.previewPhase()).toBe(1);
    animator.setPreviewPhase(0.4); animator.update(0, characterContext()); expect(animator.previewPhase()).toBeCloseTo(0.4, 6);
    animator.setPreviewClip("water"); animator.update(1.4, characterContext()); expect(animator.previewPhase()).toBe(1);
    animator.setPreviewPhase(0.35); animator.update(0, characterContext()); expect(animator.previewPhase()).toBeCloseTo(0.35, 6);
  });

  it("evaluates a paused preview's source pose immediately at its scrubbed phase", () => {
    const root = sourceFixture(); const animator = new HumanoidAnimator(root);
    animator.setPreviewClip("water"); animator.setPreviewPhase(0.5); animator.update(0, characterContext());
    expect(root.getObjectByName("Chest")!.rotation.z).toBeCloseTo(0.6, 6);
    expect(root.getObjectByName("Finger_left")!.rotation.x).toBeCloseTo(0.8, 6);
  });

  it("restarts repeated same-name actions and cancels an interrupted start", () => {
    const root = sourceFixture(); const animator = new HumanoidAnimator(root);
    animator.play("water"); animator.update(0.5, characterContext());
    const previous = root.getObjectByName("Chest")!.rotation.z;
    animator.play("water"); animator.update(0.02, characterContext());
    expect(root.getObjectByName("Chest")!.rotation.z).toBeLessThan(previous * 0.5);
    animator.cancelAction();
    animator.update(0.05, characterContext({ speedMetersPerSecond: 1, requestedGait: "walk" }));
    expect(animator.currentClip()).toBe("walk_start");
    animator.update(0.02, characterContext()); expect(animator.currentClip()).toBe("idle");
  });

  it("includes fingers beneath source hand bones in upper-body layers", () => {
    const root = sourceFixture(); const animator = new HumanoidAnimator(root);
    animator.play("water"); animator.update(0.5, characterContext());
    expect(root.getObjectByName("Finger_left")!.rotation.x).toBeGreaterThan(0.6);
  });

  it("selects authored stationary turns and interrupts them when travel resumes", () => {
    const animator = new HumanoidAnimator(sourceFixture());
    animator.update(0.05, characterContext());
    animator.update(0.05, characterContext({ turnRateRadiansPerSecond: 1.2 }));
    expect(animator.currentClip()).toBe("turn_left");
    animator.update(0.05, characterContext({ turnRateRadiansPerSecond: -1.2 }));
    expect(animator.currentClip()).toBe("turn_right");
    expect(animator.normalizedBasePhase()).toBeCloseTo(0.05, 6);
    animator.update(0.05, characterContext({ requestedGait: "run", speedMetersPerSecond: 2 }));
    expect(animator.currentClip()).toBe("run");
  });

  it("leans against braking and gives the uphill anatomical foot the higher offset", () => {
    const animator = new HumanoidAnimator(sourceFixture());
    animator.setPreviewClip("walk");
    const context = characterContext({ requestedGait: "walk", speedMetersPerSecond: 2,
      accelerationMetersPerSecondSquared: -9, groundNormal: { x: -0.2, y: Math.sqrt(0.96), z: 0 }, slopeRadians: 0.2 });
    const frame = animator.update(0.4, context);
    expect(frame.leanX).toBeLessThan(0);
    expect(frame.leftFootOffsetY).toBeGreaterThan(0);
    expect(frame.rightFootOffsetY).toBeLessThan(0);
    const accelerating = animator.update(0.1, { ...context,
      motion: { ...context.motion, accelerationMetersPerSecondSquared: 9 } });
    expect(accelerating.leanX).toBeGreaterThan(0);
  });

  it("aligns detached feet to reachable soles without changing limb lengths", () => {
    const root = sourceFixture(); const rig = resolveHumanoidRig(root);
    const solver = new HumanoidFootSupportSolver(root);
    const leg = rig.legs.left!;
    const lengths = [leg.thigh.position.clone(), leg.shin.position.clone()];
    const target = new THREE.Vector3(0.15, 0.15, 0.2);
    solver.alignSole("left", target, { x: 0, y: 1, z: 0 });
    const result = new THREE.Vector3(); solver.soleWorldPosition("left", result);
    expect(result.distanceTo(target)).toBeLessThan(0.02);
    expect(leg.thigh.position.distanceTo(lengths[0]!)).toBe(0);
    expect(leg.shin.position.distanceTo(lengths[1]!)).toBe(0);
    solver.alignSole("left", new THREE.Vector3(0.15, -20, 20), { x: 0, y: 1, z: 0 });
    const hip = leg.thigh.getWorldPosition(new THREE.Vector3());
    const foot = leg.foot.getWorldPosition(new THREE.Vector3());
    expect(hip.distanceTo(foot)).toBeLessThan(0.901);
    expect(foot.distanceTo(leg.shin.localToWorld(leg.shinTip.clone()))).toBeLessThan(0.00001);
  });

  it("matches a tilted support with the source sole frame", () => {
    const root = sourceFixture(); root.rotation.y = 0.8;
    const rig = resolveHumanoidRig(root); const solver = new HumanoidFootSupportSolver(root);
    const target = new THREE.Vector3(0.15, 0.15, 0.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.8);
    const normal = new THREE.Vector3(0.2, Math.sqrt(0.96), 0);
    solver.alignSole("left", target, normal);
    const leg = rig.legs.left!;
    const worldNormal = leg.soleNormal.clone().applyQuaternion(leg.foot.getWorldQuaternion(new THREE.Quaternion()));
    expect(worldNormal.angleTo(normal)).toBeLessThan(1e-6);
    const sole = new THREE.Vector3(); solver.soleWorldPosition("left", sole);
    expect(sole.distanceTo(target)).toBeLessThan(0.001);
  });

  it.each([
    [ASSET_IDS.CHAR_PLAYER_A, "walk", 0, 0, false],
    [ASSET_IDS.CHAR_PLAYER_A, "run", 0, 0, false],
    [ASSET_IDS.CHAR_PLAYER_A, "walk", 0.1, 0, false],
    [ASSET_IDS.CHAR_PLAYER_A, "walk", -0.1, 0, false],
    [ASSET_IDS.CHAR_PLAYER_A, "walk", 0, 0.1, false],
    [ASSET_IDS.CHAR_NPC_ELSPETH_A, "walk", 0.1, 0, false],
    [ASSET_IDS.CHAR_NPC_ELSPETH_A, "walk", -0.1, 0, true],
    [ASSET_IDS.CHAR_NPC_ELSPETH_A, "walk", 0, 0.1, true]
  ] as const)("keeps %s %s soles planted on slopes %s/%s with reduced motion %s", async (assetId, clipName, forwardSlope, sideSlope, reducedMotion) => {
    const root = await loadHumanoidAsset(assetId);
    const animator = new HumanoidAnimator(root);
    const solver = new HumanoidFootSupportSolver(root);
    const clip = ASSET_BY_ID.get(assetId)!.animationClips!.find((entry) => entry.name === clipName)!;
    expect(clip.contacts?.left?.length).toBeGreaterThan(0);
    expect(clip.contacts?.right?.length).toBeGreaterThan(0);
    const speed = clip.referenceSpeedMetersPerSecond!;
    const yaw = 0.7; const origin = new THREE.Vector3(7, 0.8, -5);
    const dx = Math.sin(yaw); const dz = Math.cos(yaw);
    const slopeX = forwardSlope * dx + sideSlope * dz;
    const slopeZ = forwardSlope * dz - sideSlope * dx;
    const normal = new THREE.Vector3(-slopeX, 1, -slopeZ).normalize();
    const surface = (x: number, z: number) => ({ height: origin.y + (x - origin.x) * slopeX + (z - origin.z) * slopeZ, normal });
    root.position.copy(origin);
    const context = { ...characterContext({ requestedGait: clipName, speedMetersPerSecond: speed,
      velocity: { x: dx * speed, y: forwardSlope * speed, z: dz * speed }, groundNormal: normal,
      slopeRadians: Math.acos(normal.y) }), facingRadians: yaw };
    animator.setPreviewClip(clipName);
    const previous = { left: new THREE.Vector3(), right: new THREE.Vector3() };
    const valid = { left: false, right: false };
    let checked = 0;
    let maximumDrift = 0;
    let maximumPelvisDrop = 0;
    const dt = 1 / 60;
    for (let frame = 0; frame < Math.ceil(clip.durationSeconds * 180); frame++) {
      const pose = animator.update(dt, context, reducedMotion);
      root.position.x += dx * speed * dt; root.position.z += dz * speed * dt;
      root.position.y = surface(root.position.x, root.position.z).height;
      root.rotation.set(pose.leanX + pose.groundPitch, yaw, pose.leanZ + pose.groundRoll, "YXZ");
      root.updateMatrixWorld(true);
      const pelvis = resolveHumanoidRig(root).bones.pelvis!;
      const beforePelvisY = pelvis.getWorldPosition(new THREE.Vector3()).y;
      const beforeRoot = root.position.clone();
      const legs = Object.values(resolveHumanoidRig(root).legs);
      const translations = legs.map((leg) => [leg.thigh.position.clone(), leg.shin.position.clone()]);
      animator.resolveGroundContacts(context, surface);
      legs.forEach((leg, index) => {
        expect(leg.thigh.position.distanceTo(translations[index]![0]!)).toBeLessThan(1e-8);
        expect(leg.shin.position.distanceTo(translations[index]![1]!)).toBeLessThan(1e-8);
      });
      const pelvisDrop = beforePelvisY - pelvis.getWorldPosition(new THREE.Vector3()).y;
      maximumPelvisDrop = Math.max(maximumPelvisDrop, pelvisDrop);
      expect(pelvisDrop).toBeGreaterThanOrEqual(-0.000001);
      expect(pelvisDrop).toBeLessThanOrEqual(CANONICAL_RENDER_CONFIG.motion.groundingMaxFootOffsetMeters + 0.000001);
      expect(root.position.distanceTo(beforeRoot)).toBe(0);
      const phaseTime = animator.previewPhase() * clip.durationSeconds;
      for (const side of ["left", "right"] as const) {
        const contacts = clip.contacts![side]!;
        const wraps = contacts.some((interval) => interval.start === 0) && contacts.some((interval) => Math.abs(interval.end - clip.durationSeconds) < 0.00001);
        const planted = frame * dt > clip.durationSeconds && contacts.some((interval) => {
          const start = wraps && interval.start === 0 ? 0 : interval.start + 0.08;
          const end = wraps && Math.abs(interval.end - clip.durationSeconds) < 0.00001 ? clip.durationSeconds : interval.end - 0.08;
          return phaseTime >= start && phaseTime <= end;
        });
        const point = new THREE.Vector3(); solver.soleWorldPosition(side, point);
        if (planted && valid[side]) {
          maximumDrift = Math.max(maximumDrift, point.distanceTo(previous[side]));
          expect(point.distanceTo(previous[side]), `${clipName} ${side} total planted-stance drift`).toBeLessThan(0.02);
          expect(point.y - surface(point.x, point.z).height, `${clipName} ${side} floor penetration`).toBeGreaterThan(-0.02);
          checked++;
        }
        if (!valid[side] || !planted) previous[side].copy(point);
        valid[side] = planted;
      }
    }
    expect(checked).toBeGreaterThan(4);
    console.info(`[source stance] ${assetId} ${clipName} slope ${forwardSlope}/${sideSlope} reduced ${reducedMotion}: max cumulative drift ${maximumDrift} m; pelvis drop ${maximumPelvisDrop} m`);
  });
  it("does not compound lower-body corrections between throttled mixer samples", async () => {
    const roots = await Promise.all([loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A), loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A)]);
    const animators = roots.map((root) => new HumanoidAnimator(root));
    const context = characterContext({ requestedGait: "walk", speedMetersPerSecond: 1 });
    for (const animator of animators) {
      animator.setPreviewClip("walk"); animator.setPreviewPhase(0.25); animator.update(0, context);
    }
    for (let frame = 0; frame < 24; frame++) {
      animators[0]!.update(0, context);
      roots.forEach((root) => { root.position.z += 0.005; root.updateMatrixWorld(true); });
      for (const animator of animators) animator.resolveGroundContacts(context, () => ({ height: 0, normal: { x: 0, y: 1, z: 0 } }));
      const reference = resolveHumanoidRig(roots[0]!).bones; const held = resolveHumanoidRig(roots[1]!).bones;
      for (const key of ["pelvis", "thigh_left", "shin_left", "foot_left", "thigh_right", "shin_right", "foot_right"] as const) {
        expect(reference[key]!.position.distanceTo(held[key]!.position)).toBeLessThan(1e-6);
        expect(reference[key]!.quaternion.clone().normalize().angleTo(held[key]!.quaternion.clone().normalize())).toBeLessThan(1e-5);
      }
    }
  });

});
