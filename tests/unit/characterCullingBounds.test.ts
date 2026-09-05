import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";
import { characterPreviewContext } from "../../src/art-yard/characterPreview";
import { HumanoidAnimator } from "../../src/render/animation/AnimationController";
import {
  alignEquipmentHands,
  alignMarkerHand,
  alignSupportFeet,
  applyEquipmentSocketPose,
  createCarryCradle,
  rowboatOarRotation,
} from "../../src/render/animation/CharacterEquipment";
import {
  configureConservativeSkinnedBounds,
  type CharacterCullingBounds,
} from "../../src/render/loaders/CharacterCullingBounds";
import { ASSET_BY_ID, type AssetId } from "../../src/render/assets/AssetCatalog";
import { CHARACTER_ASSET_IDS, loadHumanoidAsset } from "../helpers/humanoidAssets";

const VERTEX_TOLERANCE_METERS = 1e-5;

async function loadAsset(id: AssetId): Promise<THREE.Group> {
  const spec = ASSET_BY_ID.get(id)!;
  const bytes = await fs.readFile(path.resolve(import.meta.dirname, "../../public/assets/models", spec.file));
  await MeshoptDecoder.ready;
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  gltf.scene.userData.assetId = id;
  gltf.scene.userData.animationClips = gltf.animations;
  gltf.scene.updateMatrixWorld(true);
  return gltf.scene;
}

function maximumBoundViolation(bounds: CharacterCullingBounds): number {
  const point = new THREE.Vector3();
  let maximum = -Infinity;
  for (const mesh of bounds.meshes) {
    if (!mesh.boundingBox || !mesh.boundingSphere) {
      throw new Error(`${mesh.name} is missing its cached object-level culling bounds`);
    }
    const box = mesh.boundingBox;
    const sphere = mesh.boundingSphere;
    const position = mesh.geometry.getAttribute("position");
    for (let index = 0; index < position.count; index += 1) {
      mesh.getVertexPosition(index, point);
      maximum = Math.max(
        maximum,
        box.min.x - point.x,
        box.min.y - point.y,
        box.min.z - point.z,
        point.x - box.max.x,
        point.y - box.max.y,
        point.z - box.max.z,
        point.distanceTo(sphere.center) - sphere.radius,
      );
    }
  }
  return maximum;
}

function expectContained(bounds: CharacterCullingBounds, label: string): number {
  for (const mesh of bounds.meshes) {
    expect(mesh.frustumCulled, `${label}/${mesh.name} enables ordinary frustum rejection`).toBe(true);
  }
  const violation = maximumBoundViolation(bounds);
  expect(violation, `${label} maximum animated vertex distance outside cached bound`).toBeLessThanOrEqual(
    VERTEX_TOLERANCE_METERS,
  );
  return violation;
}

function exportedPoseTimes(clip: THREE.AnimationClip): number[] {
  const values = new Set<number>([0, clip.duration]);
  for (const track of clip.tracks) {
    for (const time of track.times) values.add(time);
  }
  return [...values].sort((a, b) => a - b);
}

describe("cached conservative character culling bounds", () => {
  it("contains every vertex in every exported character action pose", async () => {
    let poseCount = 0;
    let maximumViolation = -Infinity;
    for (const assetId of CHARACTER_ASSET_IDS) {
      const root = await loadHumanoidAsset(assetId);
      const bounds = configureConservativeSkinnedBounds(root);
      const mixer = new THREE.AnimationMixer(root);
      const clips = root.userData.animationClips as THREE.AnimationClip[];
      expect(clips.length, `${assetId} exported action count`).toBeGreaterThan(0);
      for (const clip of clips) {
        mixer.stopAllAction();
        const action = mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce, 1).play();
        action.clampWhenFinished = true;
        action.paused = true;
        for (const time of exportedPoseTimes(clip)) {
          action.time = time;
          mixer.update(0);
          root.updateMatrixWorld(true);
          maximumViolation = Math.max(maximumViolation, expectContained(bounds, `${assetId}/${clip.name}/${time}`));
          poseCount += 1;
        }
      }
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    }
    console.info(`[character bounds] ${poseCount} exported poses; max violation ${maximumViolation} m`);
  }, 120_000);

  it("contains actual carry, tool, rowboat and mounted post-pose constraints", async () => {
    const root = await loadHumanoidAsset("char_player_a");
    const bounds = configureConservativeSkinnedBounds(root);
    const animator = new HumanoidAnimator(root);
    const spec = ASSET_BY_ID.get("char_player_a")!;
    let poseCount = 0;
    let maximumViolation = -Infinity;
    const verify = (label: string) => {
      root.updateMatrixWorld(true);
      maximumViolation = Math.max(maximumViolation, expectContained(bounds, label));
      poseCount += 1;
    };

    const carrySocket = root.getObjectByName("char_player_carry_socket")!;
    const cargo = createCarryCradle(await loadAsset("prop_crop_bundle_a"));
    carrySocket.add(cargo);
    animator.setPreviewClip("carry_walk");
    for (const phase of [0.15, 0.5, 0.85]) {
      animator.setPreviewPhase(phase);
      animator.update(0, characterPreviewContext("carry_walk", spec, null));
      applyEquipmentSocketPose(cargo, "prop_crop_bundle_a");
      alignEquipmentHands(animator, cargo);
      verify(`carry_walk/${phase}`);
    }
    cargo.removeFromParent();

    const toolSocket = root.getObjectByName("char_player_tool_socket")!;
    const wateringCan = await loadAsset("tool_watering_can_a");
    toolSocket.add(wateringCan);
    animator.setPreviewClip("water");
    for (const phase of [0.15, 0.5, 0.85]) {
      animator.setPreviewPhase(phase);
      animator.update(0, characterPreviewContext("water", spec, null));
      applyEquipmentSocketPose(wateringCan, "tool_watering_can_a");
      alignEquipmentHands(animator, wateringCan);
      verify(`water/${phase}`);
    }
    wateringCan.removeFromParent();

    const rowboat = await loadAsset("boat_rowboat_a");
    const rowerSeat = rowboat.getObjectByName("boat_rowboat_rower_seat")!;
    const oars = (["left", "right"] as const).map((side) => {
      const pivot = new THREE.Group();
      rowboat.add(pivot);
      pivot.position.copy(rowboat.worldToLocal(
        rowboat.getObjectByName(`boat_rowboat_oarlock_${side}`)!.getWorldPosition(new THREE.Vector3()),
      ));
      pivot.updateMatrixWorld(true);
      pivot.attach(rowboat.getObjectByName(`boat_rowboat_oar_${side}_root`)!);
      return { side, pivot, grip: rowboat.getObjectByName(`boat_rowboat_oar_${side}_grip`)! };
    });
    rowerSeat.add(root);
    animator.setPreviewClip("row");
    for (const phase of [0.15, 0.5, 0.85]) {
      animator.setPreviewPhase(phase);
      animator.update(0, characterPreviewContext("row", spec, "boat_rowboat_a"));
      animator.alignPelvisSupport(rowerSeat.getWorldPosition(new THREE.Vector3()));
      for (const oar of oars) {
        rowboatOarRotation(phase, true, oar.side, oar.pivot.rotation);
        alignMarkerHand(animator, oar.side, oar.grip);
      }
      verify(`row/${phase}`);
    }
    root.removeFromParent();
    root.position.set(0, 0, 0);
    root.quaternion.identity();

    const donkey = await loadAsset("fauna_donkey_a");
    const riderSocket = donkey.getObjectByName("fauna_donkey_a_rider_socket")!;
    const stirrups = {
      left: donkey.getObjectByName("fauna_donkey_a_stirrup_left_socket")!,
      right: donkey.getObjectByName("fauna_donkey_a_stirrup_right_socket")!,
    };
    const reins = {
      left: donkey.getObjectByName("fauna_donkey_a_rein_grip_left")!,
      right: donkey.getObjectByName("fauna_donkey_a_rein_grip_right")!,
    };
    riderSocket.add(root);
    animator.setPreviewClip("mounted_gallop");
    for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
      animator.setPreviewPhase(phase);
      animator.update(0, characterPreviewContext("mounted_gallop", spec, "fauna_donkey_a"));
      animator.alignPelvisSupport(riderSocket.getWorldPosition(new THREE.Vector3()));
      alignSupportFeet(animator, stirrups.left, stirrups.right);
      alignMarkerHand(animator, "left", reins.left);
      alignMarkerHand(animator, "right", reins.right);
      verify(`mounted_gallop/${phase}`);
    }
    root.removeFromParent();
    animator.dispose();
    console.info(`[character bounds] ${poseCount} post-pose samples; max violation ${maximumViolation} m`);
  }, 60_000);

  it("keeps close-up head details together and rejects a clearly off-screen actor", async () => {
    const root = await loadHumanoidAsset("char_npc_elspeth_a");
    const bounds = configureConservativeSkinnedBounds(root);
    root.updateMatrixWorld(true);
    const headDetails = bounds.meshes.filter((mesh) =>
      mesh.parent?.name.includes("Head") || /head|hair|bun/i.test(mesh.name),
    );
    expect(headDetails.length, "actual head, eye and hair/bun submeshes").toBeGreaterThan(0);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
    camera.position.set(0, 1.5, 0.65);
    camera.lookAt(0, 1.5, 0);
    camera.updateMatrixWorld(true);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    expect(bounds.meshes.every((mesh) => frustum.intersectsObject(mesh)), "close-up actor parts share visibility").toBe(true);

    root.position.set(100, 0, 0);
    root.updateMatrixWorld(true);
    expect(bounds.meshes.every((mesh) => !frustum.intersectsObject(mesh)), "off-screen actor is rejected").toBe(true);
  });
});
