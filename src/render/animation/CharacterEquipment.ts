import * as THREE from "three";
import type { HumanoidAnimator } from "./AnimationController";
import { ASSET_BY_ID, type AssetId } from "../assets/AssetCatalog";
import { socketAttachFor } from "../assets/ToolSocketAttach";

export const PALM_GRIP_FRAME = "palm-y-fingers-z-contact-v1";

export function fishingClipUsesRod(clip: string): boolean {
  return ["cast", "hookset", "fishing_idle", "reel", "slack", "brace", "skiff_fishing"].includes(clip);
}

/** A shared cradle for existing catalog cargo; does not alter cached meshes. */
export function createCarryCradle(payload: THREE.Group, fish = false): THREE.Group {
  const cradle = new THREE.Group();
  cradle.name = "character_carry_cradle";
  if (fish) payload.rotation.y = Math.PI / 2;
  cradle.add(payload);
  cradle.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  payload.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && !object.name.startsWith("COL_")) bounds.expandByObject(mesh);
  });
  if (bounds.isEmpty()) throw new Error("Carry payload has no visible geometry");
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  payload.position.sub(center);
  // Existing cargo has no authored grip nodes. The bounded cradle contacts
  // derive from its visible extent in one shared presentation rule.
  for (const side of ["left", "right"] as const) {
    const grip = new THREE.Object3D();
    grip.name = `carry_grip_${side}`;
    grip.position.set((side === "left" ? 1 : -1) * Math.min(0.3, size.x * 0.4),
      -Math.min(0.2, size.y * 0.28), 0);
    const fingers = new THREE.Vector3(side === "left" ? -1 : 1, 0, 0);
    const inward = new THREE.Vector3(0, 1, 0);
    grip.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      fingers.clone().cross(inward), fingers, inward
    ));
    grip.userData.neva_grip_frame = PALM_GRIP_FRAME;
    cradle.add(grip);
  }
  return cradle;
}

const gripTarget = new THREE.Vector3();
const gripRotation = new THREE.Quaternion();
const heldWorld = new THREE.Matrix4();
const heldLocal = new THREE.Matrix4();
const leftSupportPosition = new THREE.Vector3();
const rightSupportPosition = new THREE.Vector3();
const leftSupportNormal = new THREE.Vector3();
const rightSupportNormal = new THREE.Vector3();

/** Authored support +Y is the outward sole-contact normal in glTF space. */
export function alignSupportFeet(animator: HumanoidAnimator, left: THREE.Object3D, right: THREE.Object3D): void {
  left.updateWorldMatrix(true, false);
  right.updateWorldMatrix(true, false);
  left.getWorldPosition(leftSupportPosition);
  right.getWorldPosition(rightSupportPosition);
  leftSupportNormal.set(0, 1, 0).applyQuaternion(left.getWorldQuaternion(gripRotation)).normalize();
  rightSupportNormal.set(0, 1, 0).applyQuaternion(right.getWorldQuaternion(gripRotation)).normalize();
  animator.alignFootSupports(leftSupportPosition, rightSupportPosition, leftSupportNormal, rightSupportNormal);
}

/** Dock an authored primary palm frame to the character's anatomical socket. */
export function applyEquipmentSocketPose(equipment: THREE.Object3D, assetId: string): void {
  const pose = socketAttachFor(assetId);
  const requiredPrimary = ASSET_BY_ID.get(assetId as AssetId)?.requiredNodes
    .find(name => name === "rod_primary_grip" || name === "tool_primary_grip");
  const primary = equipment.getObjectByName("rod_primary_grip") ?? equipment.getObjectByName("tool_primary_grip");
  if (requiredPrimary && !primary) throw new Error(`Equipment ${assetId} is missing ${requiredPrimary}`);
  if (primary && primary.userData.neva_grip_frame !== PALM_GRIP_FRAME) {
    throw new Error(`Equipment ${assetId} has no authored palm frame on ${primary.name}`);
  }
  if (primary) {
    equipment.position.set(0, 0, 0);
    equipment.quaternion.identity();
    equipment.scale.setScalar(1);
    equipment.updateWorldMatrix(true, true);
    primary.getWorldPosition(gripTarget);
    equipment.worldToLocal(gripTarget);
    equipment.getWorldQuaternion(gripRotation).invert();
    primary.getWorldQuaternion(equipment.quaternion).premultiply(gripRotation).invert();
    equipment.scale.setScalar(pose.scale);
    equipment.position.copy(gripTarget).applyQuaternion(equipment.quaternion).multiplyScalar(-pose.scale);
  } else {
    equipment.position.set(...pose.position);
    equipment.rotation.set(...pose.rotation);
    equipment.scale.setScalar(pose.scale);
  }
}

export function alignMarkerHand(animator: HumanoidAnimator, side: "left" | "right", grip: THREE.Object3D): void {
  grip.updateWorldMatrix(true, false);
  grip.getWorldPosition(gripTarget);
  if (grip.userData.neva_grip_frame !== PALM_GRIP_FRAME) {
    throw new Error(`Hand contact ${grip.name} has no authored palm frame`);
  }
  animator.alignHandGrip(side, gripTarget, grip.getWorldQuaternion(gripRotation));
}

/** Uses the same equipment markers in game and the runtime Art Yard preview. */
export function alignEquipmentHands(animator: HumanoidAnimator, equipment: THREE.Object3D): void {
  for (const side of ["right", "left"] as const) {
    const grip = equipment.getObjectByName(`carry_grip_${side}`)
      ?? equipment.getObjectByName(side === "right" ? "rod_primary_grip" : "rod_secondary_grip")
      ?? (side === "right" ? equipment.getObjectByName("tool_primary_grip") : undefined);
    if (!grip) continue;
    equipment.updateWorldMatrix(true, true);
    heldWorld.copy(equipment.matrixWorld);
    alignMarkerHand(animator, side, grip);
    // A tool may be parented to the very wrist being solved. Keep the aimed
    // tool fixed in world space while the hand takes its grip; otherwise the
    // wrist correction rotates the rod a second time through that parent.
    if (side === "right" && equipment.parent) {
      equipment.parent.updateWorldMatrix(true, false);
      heldLocal.copy(equipment.parent.matrixWorld).invert().multiply(heldWorld);
      heldLocal.decompose(equipment.position, equipment.quaternion, equipment.scale);
      equipment.updateWorldMatrix(false, true);
    }
  }
}

/** Oar motion is boat-owned; hands follow these moving grip targets. */
export function rowboatOarRotation(phase: number, rowing: boolean, side: "left" | "right", out: THREE.Euler): THREE.Euler {
  const angle = phase * Math.PI * 2;
  const stroke = rowing ? Math.sin(angle) : 0;
  const catchAndRelease = rowing ? Math.cos(angle) : 0;
  return out.set(catchAndRelease * 0.1, stroke * 0.3,
    (side === "left" ? 1 : -1) * catchAndRelease * 0.07, "YXZ");
}
