import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { MeshoptDecoder } from "meshoptimizer";
import { HumanoidAnimator, type PlayerAnimation } from "../../src/render/animation/AnimationController";
import { HumanoidFootSupportSolver } from "../../src/render/animation/HumanoidFootSupportSolver";
import { resolveHumanoidRig } from "../../src/render/animation/HumanoidRig";
import { ASSET_BY_ID, ASSET_CATALOG, type AssetId } from "../../src/render/assets/AssetCatalog";
import { alignEquipmentHands, alignMarkerHand, alignSupportFeet, applyEquipmentSocketPose, createCarryCradle, PALM_GRIP_FRAME, rowboatOarRotation } from "../../src/render/animation/CharacterEquipment";

import { characterPreviewContext } from "../../src/art-yard/characterPreview";
import { createNodeGltfLoader } from "../helpers/nodeGltfLoader";

const candidateDirectory = process.env.NEVA_HUMANOID_CANDIDATE_DIR;
const equipmentDirectory = process.env.NEVA_EQUIPMENT_CANDIDATE_DIR;
const contactSamples: Array<{ actor: string; equipment: string; clip: string; phase: number; side: string; positionError: number; orientationError: number }> = [];
afterAll(async () => {
  if (process.env.NEVA_CONTACT_REPORT) await fs.writeFile(process.env.NEVA_CONTACT_REPORT, JSON.stringify(contactSamples, null, 2));
});

async function loadAsset(id: AssetId, character = false, published = false): Promise<THREE.Group> {
  const candidate = !published && (character ? candidateDirectory : equipmentDirectory);
  let directory = "public/assets/models";
  let bytes: Buffer;
  if (candidate) {
    try {
      bytes = await fs.readFile(path.resolve(candidate, `${id}.glb`));
      directory = candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      bytes = await fs.readFile(path.resolve(directory, `${id}.glb`));
    }
  } else {
    bytes = await fs.readFile(path.resolve(directory, `${id}.glb`));
  }
  await MeshoptDecoder.ready;
  const gltf = await createNodeGltfLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, "");
  const root = gltf.scene;
  const spec = ASSET_BY_ID.get(id)!;
  root.userData.assetId = id;
  root.userData.animationClips = gltf.animations;
  root.userData.animationClipSpecs = [...(spec.animationClips ?? []), ...(spec.additionalAnimationClips ?? [])];
  if (character && directory === candidateDirectory) {
    try {
      root.userData.humanoidRig = JSON.parse(await fs.readFile(path.resolve(directory, `${id}.humanoidRig.json`), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
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
      const equipment = carried ? createCarryCradle(payload, assetId.startsWith("fish_") ? "fish" : "bundle") : payload;
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

  it("puts actual skiff deck surfaces beneath both helm soles and the fishing station", async () => {
    const boat = await loadAsset("boat_skiff_a");
    const meshes: THREE.Mesh[] = [];
    boat.traverse((object) => {
      if ((object as THREE.Mesh).isMesh && !object.name.startsWith("COL_")) meshes.push(object as THREE.Mesh);
    });
    for (const name of ["boat_skiff_foot_left_socket", "boat_skiff_foot_right_socket", "boat_skiff_fishing_station"]) {
      const support = boat.getObjectByName(name)!;
      expect(support, name).toBeDefined();
      const point = support.getWorldPosition(new THREE.Vector3());
      // Marker-to-marker contact alone cannot detect a missing raised deck.
      // Probe the real optimized triangles beneath the middle of each shoe.
      const ray = new THREE.Raycaster(point.clone().add(new THREE.Vector3(0, .03, 0)),
        new THREE.Vector3(0, -1, 0), 0, .4);
      const hit = ray.intersectObjects(meshes, false)[0];
      expect(hit, `${name} has physical deck support`).toBeDefined();
      expect(Math.abs(hit.point.y - point.y), `${name} deck contact`).toBeLessThan(.015);
    }
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
      const characterNodes = new Set<THREE.Object3D>();
      root.traverse((node) => characterNodes.add(node));
      anchor.add(root); root.position.set(0, 0, 0); root.quaternion.identity();
      const oars = rowboat ? (["left", "right"] as const).map(side => {
        const pivot = new THREE.Group(); boat.add(pivot);
        pivot.position.copy(boat.worldToLocal(boat.getObjectByName(`boat_rowboat_oarlock_${side}`)!.getWorldPosition(new THREE.Vector3())));
        pivot.updateMatrixWorld(true); pivot.attach(boat.getObjectByName(`boat_rowboat_oar_${side}_root`)!);
        return { side, pivot, grip: boat.getObjectByName(`boat_rowboat_oar_${side}_grip`)! };
      }) : [];
      const clip = rowboat ? "row" : "skiff_drive";
      const skiffGrips = !rowboat ? {
        left: boat.getObjectByName("boat_skiff_helm_grip_left")!,
        right: boat.getObjectByName("boat_skiff_helm_grip")!
      } : null;
      const skiffFootSupports = !rowboat ? {
        left: boat.getObjectByName("boat_skiff_foot_left_socket")!,
        right: boat.getObjectByName("boat_skiff_foot_right_socket")!
      } : null;
      const skiffFootSolver = skiffFootSupports ? new HumanoidFootSupportSolver(root) : null;
      if (skiffGrips && skiffFootSupports) {
        expect(skiffGrips.left, "optimized skiff left helm grip").toBeDefined();
        expect(skiffGrips.right, "optimized skiff right helm grip").toBeDefined();
        expect(skiffFootSupports.left, "optimized skiff left foot support").toBeDefined();
        expect(skiffFootSupports.right, "optimized skiff right foot support").toBeDefined();
        expect(boat.getObjectByName("skiff_tiller_stock"), "old skiff tiller stock removed").toBeUndefined();
        expect(boat.getObjectByName("skiff_tiller_arm"), "old skiff tiller arm removed").toBeUndefined();
        // The standing helmsman faces the bow, so the wheel sits ahead of the
        // feet and the two palm frames face the wheel rather than the deck.
        const station = boat.getObjectByName("boat_skiff_driver_station")!;
        expect(station.position.z, "skiff helm ahead of the driver").toBeLessThan(skiffGrips.left.position.z - 0.25);
        expect(Math.abs(skiffGrips.left.position.x + skiffGrips.right.position.x), "skiff helm centered").toBeLessThan(1e-6);
        expect(Math.abs(skiffGrips.left.position.x - skiffGrips.right.position.x), "skiff helm hand spacing").toBeGreaterThan(0.4);
        for (const side of ["left", "right"] as const) {
          const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(skiffGrips[side].getWorldQuaternion(new THREE.Quaternion()));
          expect(normal.z, `skiff/${side} helm palm faces the wheel`).toBeGreaterThan(0.9);
        }
      }
      animator.setPreviewClip(clip);
      for (const phase of [0.15, 0.5, 0.85]) {
        animator.setPreviewPhase(phase); animator.update(0, characterPreviewContext(clip, spec, assetId));
        if (rowboat) animator.alignPelvisSupport(anchor.getWorldPosition(new THREE.Vector3()));
        if (skiffFootSupports) {
          alignSupportFeet(animator, skiffFootSupports.left, skiffFootSupports.right);
          const leftSole = new THREE.Vector3();
          const rightSole = new THREE.Vector3();
          expect(skiffFootSolver!.soleWorldPosition("left", leftSole)).toBe(true);
          expect(skiffFootSolver!.soleWorldPosition("right", rightSole)).toBe(true);
          expect(leftSole.distanceTo(skiffFootSupports.left.getWorldPosition(new THREE.Vector3())), `skiff/${phase}/left sole support`).toBeLessThan(0.015);
          expect(rightSole.distanceTo(skiffFootSupports.right.getWorldPosition(new THREE.Vector3())), `skiff/${phase}/right sole support`).toBeLessThan(0.015);
        }
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
        if (skiffGrips) {
          for (const side of ["left", "right"] as const) {
            const grip = skiffGrips[side];
            alignMarkerHand(animator, side, grip);
            const error = recordContact(root, assetId, clip, phase, side, grip);
            maximumError = Math.max(maximumError, error);
            if (error > 0.015) console.info("SKIFF CONTACT FAILURE", phase, side, error, "shoulder", resolveHumanoidRig(root).arms[side]!.upper.getWorldPosition(new THREE.Vector3()).toArray(), "helm", grip.getWorldPosition(new THREE.Vector3()).toArray());
            expect.soft(error, `skiff/${phase}/${side} contact`).toBeLessThan(0.015);
          }
          if (phase === 0.5) {
            // The kicked-up boom must pass above the standing helmsman; a column
            // through the head finds only the rig, never the low boom that used
            // to pierce the pilot's chest.
            const headWorld = resolveHumanoidRig(root).bones.head!.getWorldPosition(new THREE.Vector3());
            let lowestRigVertex = Infinity;
            boat.traverse((object) => {
              const mesh = object as THREE.Mesh;
              if (!mesh.isMesh || characterNodes.has(object)) return;
              const position = mesh.geometry.getAttribute("position");
              if (!position) return;
              mesh.updateWorldMatrix(true, false);
              for (let index = 0; index < position.count; index++) {
                const point = new THREE.Vector3().fromBufferAttribute(position as THREE.BufferAttribute, index).applyMatrix4(mesh.matrixWorld);
                if (Math.abs(point.x - headWorld.x) > 0.2 || Math.abs(point.z - headWorld.z) > 0.15) continue;
                if (point.y > 1.2 && point.y < lowestRigVertex) lowestRigVertex = point.y;
              }
            });
            expect(lowestRigVertex, "skiff helm column has measured rig geometry").toBeLessThan(Infinity);
            expect(lowestRigVertex, "skiff rig clears the standing helmsman").toBeGreaterThan(headWorld.y + 0.35);
          }
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
