import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";
import { HumanoidAnimator, type PlayerAnimation } from "../../src/render/animation/AnimationController";
import { resolveHumanoidRig } from "../../src/render/animation/HumanoidRig";
import { ASSET_BY_ID, ASSET_CATALOG, type AssetId } from "../../src/render/assets/AssetCatalog";
import { alignEquipmentHands, alignMarkerHand, alignSupportFeet, applyEquipmentSocketPose, createCarryCradle, PALM_GRIP_FRAME, rowboatOarRotation } from "../../src/render/animation/CharacterEquipment";

import { characterPreviewContext } from "../../src/art-yard/characterPreview";

const candidateDirectory = process.env.NEVA_HUMANOID_CANDIDATE_DIR;
const equipmentDirectory = process.env.NEVA_EQUIPMENT_CANDIDATE_DIR;
const contactSamples: Array<{ actor: string; equipment: string; clip: string; phase: number; side: string; positionError: number; orientationError: number }> = [];
afterAll(async () => {
  if (process.env.NEVA_CONTACT_REPORT) await fs.writeFile(process.env.NEVA_CONTACT_REPORT, JSON.stringify(contactSamples, null, 2));
});

async function loadAsset(id: AssetId, character = false, published = false): Promise<THREE.Group> {
  const directory = (!published && (character ? candidateDirectory : equipmentDirectory)) || "public/assets/models";
  const bytes = await fs.readFile(path.resolve(directory, `${id}.glb`));
  await MeshoptDecoder.ready;
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  const root = gltf.scene;
  const spec = ASSET_BY_ID.get(id)!;
  root.userData.assetId = id;
  root.userData.animationClips = gltf.animations;
  root.userData.animationClipSpecs = [...(spec.animationClips ?? []), ...(spec.additionalAnimationClips ?? [])];
  if (character && candidateDirectory) root.userData.humanoidRig = JSON.parse(await fs.readFile(path.resolve(directory, `${id}.humanoidRig.json`), "utf8"));
  root.updateMatrixWorld(true);
  return root;
}

function recordContact(root: THREE.Object3D, equipment: string, clip: string, phase: number, side: "left" | "right", marker: THREE.Object3D): number {
  const palm = resolveHumanoidRig(root).arms[side]!.grip!;
  const positionError = palmError(root, side, marker);
  const orientationError = palm.getWorldQuaternion(new THREE.Quaternion()).normalize().angleTo(marker.getWorldQuaternion(new THREE.Quaternion()).normalize());
  contactSamples.push({ actor: root.userData.assetId, equipment, clip, phase, side, positionError, orientationError });
  expect.soft(orientationError, `${root.userData.assetId}/${equipment}/${clip}/${phase}/${side} palm orientation`).toBeLessThan(0.001);
  return positionError;
}

function palmError(root: THREE.Object3D, side: "left" | "right", marker: THREE.Object3D): number {
  const palm = resolveHumanoidRig(root).arms[side]!.grip!;
  return palm.getWorldPosition(new THREE.Vector3()).distanceTo(marker.getWorldPosition(new THREE.Vector3()));
}

describe("authored source palm contacts", () => {
  for (const assetId of ["char_player_a", "char_npc_ines_a"] as AssetId[]) {
    it(`${assetId} reaches an oriented palm target without stretching its source limbs`, async () => {
      const root = await loadAsset(assetId, true);
      const binding = resolveHumanoidRig(root);
      for (const side of ["left", "right"] as const) {
        const arm = binding.arms[side]!;
        const wristRotation = arm.hand.getWorldQuaternion(new THREE.Quaternion()).normalize();
        const palmRotation = arm.grip!.getWorldQuaternion(new THREE.Quaternion()).normalize();
        expect(new THREE.Vector3(0, 1, 0).applyQuaternion(wristRotation)
          .dot(new THREE.Vector3(0, 1, 0).applyQuaternion(palmRotation)), `${side} exported finger axis`).toBeGreaterThan(0.99995);
        expect(new THREE.Vector3(0, 0, -1).applyQuaternion(wristRotation)
          .dot(new THREE.Vector3(0, 0, 1).applyQuaternion(palmRotation)), `${side} exported inward palm normal`).toBeGreaterThan(0.99995);
      }
      const animator = new HumanoidAnimator(root);
      root.position.set(3, 0.2, -2);
      root.rotation.y = 0.65;
      root.updateMatrixWorld(true);
      const positionErrors: number[] = [];
      const orientationErrors: number[] = [];
      for (const side of ["left", "right"] as const) {
        const arm = binding.arms[side]!;
        const boneDistance = (a: THREE.Object3D, b: THREE.Object3D) => a.getWorldPosition(new THREE.Vector3()).distanceTo(b.getWorldPosition(new THREE.Vector3()));
        const lengths = [boneDistance(arm.upper, arm.lower), boneDistance(arm.lower, arm.hand)];
        const marker = new THREE.Object3D();
        const shoulder = arm.upper.getWorldPosition(new THREE.Vector3());
        root.worldToLocal(shoulder);
        marker.position.set(side === "left" ? 0.24 : -0.24, shoulder.y - 0.32, shoulder.z + 0.19);
        marker.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
          new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)
        ));
        marker.userData.neva_grip_frame = PALM_GRIP_FRAME;
        root.add(marker);
        root.updateMatrixWorld(true);
        alignMarkerHand(animator, side, marker);
        expect(arm.grip).toBeDefined();
        const palm = arm.grip!;
        const positionError = boneDistance(palm, marker);
        const angleError = palm.getWorldQuaternion(new THREE.Quaternion()).normalize().angleTo(marker.getWorldQuaternion(new THREE.Quaternion()).normalize());
        positionErrors.push(positionError);
        orientationErrors.push(angleError);
        expect(positionError, `${side} palm error in meters`).toBeLessThan(0.0001);
        expect(angleError, `${side} palm error in radians`).toBeLessThan(0.0001);
        expect(boneDistance(arm.upper, arm.lower)).toBeCloseTo(lengths[0], 6);
        expect(boneDistance(arm.lower, arm.hand)).toBeCloseTo(lengths[1], 6);
      }
      console.info(`[source palm] ${assetId}: max position ${Math.max(...positionErrors)} m; orientation ${Math.max(...orientationErrors)} rad`);
      animator.dispose();
    });
  }
});


describe("real equipment palm integration", () => {
  it("keeps actual player tool and cargo contacts through the authored action phases", async () => {
    const root = await loadAsset("char_player_a", true);
    const spec = ASSET_BY_ID.get("char_player_a")!;
    const animator = new HumanoidAnimator(root);
    const toolSocket = root.getObjectByName("char_player_tool_socket")!;
    const carrySocket = root.getObjectByName("char_player_carry_socket")!;
    expect(toolSocket).toBeDefined(); expect(carrySocket).toBeDefined();
    const actions: Array<[AssetId, PlayerAnimation[]]> = [
      ["tool_fishing_rod_a", ["cast", "hookset", "fishing_idle", "reel", "slack", "brace"]],
      ["tool_watering_can_a", ["water"]], ["tool_sickle_a", ["harvest"]],
      ["tool_workstation_scoop_a", ["workstation"]],
      ["prop_crop_bundle_a", ["carry_idle", "carry_walk", "carry_run"]],
      ["fish_trout_a", ["carry_idle", "carry_walk", "carry_run"]]
    ];
    let maximumError = 0;
    for (const [assetId, clips] of actions) {
      const carried = assetId.startsWith("prop_crop_bundle") || assetId.startsWith("fish_");
      const payload = await loadAsset(assetId, false, carried);
      const equipment = carried ? createCarryCradle(payload, assetId.startsWith("fish_")) : payload;
      (carried ? carrySocket : toolSocket).add(equipment);
      for (const clip of clips) {
        animator.setPreviewClip(clip);
        for (const phase of [0.15, 0.5, 0.85]) {
          animator.setPreviewPhase(phase);
          animator.update(0, characterPreviewContext(clip, spec, null));
          applyEquipmentSocketPose(equipment, assetId);
          alignEquipmentHands(animator, equipment);
          for (const side of ["left", "right"] as const) {
            const marker = equipment.getObjectByName(`carry_grip_${side}`)
              ?? equipment.getObjectByName(side === "right" ? "rod_primary_grip" : "rod_secondary_grip")
              ?? (side === "right" ? equipment.getObjectByName("tool_primary_grip") : undefined);
            if (!marker) continue;
            const error = recordContact(root, assetId, clip, phase, side, marker);
            maximumError = Math.max(maximumError, error);
            if (error > 0.015 && phase === 0.5) console.info("CONTACT FAILURE", assetId, clip, phase, side, error, "shoulder", resolveHumanoidRig(root).arms[side]!.upper.getWorldPosition(new THREE.Vector3()).toArray(), "target", marker.getWorldPosition(new THREE.Vector3()).toArray());
            expect.soft(error, `${assetId}/${clip}/${phase}/${side} palm contact`).toBeLessThan(0.015);
          }
        }
      }
      equipment.removeFromParent();
    }
    console.info(`[actual equipment] maximum palm error ${maximumError} m`);
    animator.dispose();
  });

  it("reaches moving rowboat handles and the skiff helm from the sampled carrier pose", async () => {
    const root = await loadAsset("char_player_a", true);
    const animator = new HumanoidAnimator(root);
    const spec = ASSET_BY_ID.get("char_player_a")!;
    let maximumError = 0;
    for (const assetId of ["boat_rowboat_a", "boat_skiff_a"] as AssetId[]) {
      const boat = await loadAsset(assetId);
      const rowboat = assetId === "boat_rowboat_a";
      const anchor = boat.getObjectByName(rowboat ? "boat_rowboat_rower_seat" : "boat_skiff_driver_station")!;
      anchor.add(root); root.position.set(0, 0, 0); root.quaternion.identity();
      const oars = rowboat ? (["left", "right"] as const).map(side => {
        const pivot = new THREE.Group(); boat.add(pivot);
        pivot.position.copy(boat.worldToLocal(boat.getObjectByName(`boat_rowboat_oarlock_${side}`)!.getWorldPosition(new THREE.Vector3())));
        pivot.updateMatrixWorld(true); pivot.attach(boat.getObjectByName(`boat_rowboat_oar_${side}_root`)!);
        return { side, pivot, grip: boat.getObjectByName(`boat_rowboat_oar_${side}_grip`)! };
      }) : [];
      const clip = rowboat ? "row" : "skiff_drive";
      animator.setPreviewClip(clip);
      for (const phase of [0.15, 0.5, 0.85]) {
        animator.setPreviewPhase(phase); animator.update(0, characterPreviewContext(clip, spec, assetId));
        if (rowboat) animator.alignPelvisSupport(anchor.getWorldPosition(new THREE.Vector3()));
        for (const oar of oars) {
          rowboatOarRotation(phase, true, oar.side, oar.pivot.rotation);
          alignMarkerHand(animator, oar.side, oar.grip);
          const error = recordContact(root, assetId, clip, phase, oar.side, oar.grip);
          maximumError = Math.max(maximumError, error);
          if (error > 0.015) {
            const arm = resolveHumanoidRig(root).arms[oar.side]!;
            console.info("BOAT CONTACT FAILURE", phase, oar.side, error, "shoulder", arm.upper.getWorldPosition(new THREE.Vector3()).toArray(), "grip", oar.grip.getWorldPosition(new THREE.Vector3()).toArray(), "palm", arm.grip!.getWorldPosition(new THREE.Vector3()).toArray());
          }
          expect.soft(error, `row/${phase}/${oar.side} contact`).toBeLessThan(0.015);
        }
        if (!rowboat) {
          const helm = boat.getObjectByName("boat_skiff_helm_grip")!;
          alignMarkerHand(animator, "right", helm);
          const error = recordContact(root, assetId, clip, phase, "right", helm);
          maximumError = Math.max(maximumError, error);
          if (error > 0.015) console.info("SKIFF CONTACT FAILURE", phase, error, "shoulder", resolveHumanoidRig(root).arms.right!.upper.getWorldPosition(new THREE.Vector3()).toArray(), "helm", helm.getWorldPosition(new THREE.Vector3()).toArray());
          expect.soft(error, `skiff/${phase}/right contact`).toBeLessThan(0.015);
        }
      }
      root.removeFromParent();
    }
    console.info(`[actual boat grips] maximum palm error ${maximumError} m`);
    animator.dispose();
  });

  it("holds actual donkey reins through every mounted gait without stretching source arms", async () => {
    const root = await loadAsset("char_player_a", true);
    const donkey = await loadAsset("fauna_donkey_a");
    const seat = donkey.getObjectByName("fauna_donkey_a_rider_socket")!;
    const leftFoot = donkey.getObjectByName("fauna_donkey_a_stirrup_left_socket")!;
    const rightFoot = donkey.getObjectByName("fauna_donkey_a_stirrup_right_socket")!;
    const grips = {
      left: donkey.getObjectByName("fauna_donkey_a_rein_grip_left")!,
      right: donkey.getObjectByName("fauna_donkey_a_rein_grip_right")!
    };
    expect(grips.left, "authored anatomical left rein grip").toBeDefined();
    expect(grips.right, "authored anatomical right rein grip").toBeDefined();
    seat.add(root);
    const animator = new HumanoidAnimator(root);
    const companionMixer = new THREE.AnimationMixer(donkey);
    const binding = resolveHumanoidRig(root);
    const spec = ASSET_BY_ID.get("char_player_a")!;
    const boneDistance = (a: THREE.Object3D, b: THREE.Object3D) => a.getWorldPosition(new THREE.Vector3()).distanceTo(b.getWorldPosition(new THREE.Vector3()));
    let maximumError = 0;
    for (const gait of ["idle", "walk", "trot", "gallop"] as const) {
      const clip = `mounted_${gait}` as PlayerAnimation;
      animator.setPreviewClip(clip);
      companionMixer.stopAllAction();
      const companionClip = (donkey.userData.animationClips as THREE.AnimationClip[]).find(clip => clip.name === gait)!;
      const companionAction = companionMixer.clipAction(companionClip).play();
      for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
        companionAction.time = phase * companionClip.duration;
        companionMixer.update(0);
        animator.setPreviewPhase(phase);
        animator.update(0, characterPreviewContext(clip, spec, "fauna_donkey_a"));
        animator.alignPelvisSupport(seat.getWorldPosition(new THREE.Vector3()));
        alignSupportFeet(animator, leftFoot, rightFoot);
        for (const side of ["left", "right"] as const) {
          const arm = binding.arms[side]!;
          const lengths = [boneDistance(arm.upper, arm.lower), boneDistance(arm.lower, arm.hand)];
          alignMarkerHand(animator, side, grips[side]);
          const error = recordContact(root, "fauna_donkey_a", clip, phase, side, grips[side]);
          maximumError = Math.max(maximumError, error);
          expect.soft(error, `${clip}/${phase}/${side} rein contact`).toBeLessThan(0.015);
          expect.soft(boneDistance(arm.upper, arm.lower), `${clip}/${side} upper arm length`).toBeCloseTo(lengths[0], 6);
          expect.soft(boneDistance(arm.lower, arm.hand), `${clip}/${side} forearm length`).toBeCloseTo(lengths[1], 6);
        }
      }
    }
    console.info(`[actual reins] maximum palm error ${maximumError} m`);
    companionMixer.stopAllAction();
    animator.dispose();
  });
});


it("fits the geometry-derived carry cradle to every source character", async () => {
  for (const asset of ASSET_CATALOG.filter(asset => asset.family === "character")) {
    const root = await loadAsset(asset.id, true);
    const animator = new HumanoidAnimator(root);
    let socket: THREE.Object3D | undefined;
    root.traverse(node => { if (node.name.endsWith("carry_socket")) socket = node; });
    expect(socket, `${asset.id} carry socket`).toBeDefined();
    const payload = await loadAsset("prop_crop_bundle_a", false, true);
    const cradle = createCarryCradle(payload);
    socket!.add(cradle);
    const clips = [...(asset.animationClips ?? []), ...(asset.additionalAnimationClips ?? [])]
      .filter(clip => clip.name.startsWith("carry_"));
    for (const clip of clips) {
      animator.setPreviewClip(clip.name as PlayerAnimation);
      for (const phase of [0.15, 0.5, 0.85]) {
        animator.setPreviewPhase(phase); animator.update(0, characterPreviewContext(clip.name, asset, null));
        applyEquipmentSocketPose(cradle, "prop_crop_bundle_a"); alignEquipmentHands(animator, cradle);
        for (const side of ["left", "right"] as const) {
          const marker = cradle.getObjectByName(`carry_grip_${side}`)!;
          const error = recordContact(root, "prop_crop_bundle_a", clip.name, phase, side, marker);
          expect.soft(error, `${asset.id}/${clip.name}/${phase}/${side} carry contact`).toBeLessThan(0.015);
        }
      }
    }
    animator.dispose();
  }
});
