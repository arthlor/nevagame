import * as THREE from "three";

export type AttachmentSide = "left" | "right";

const terminalPelvisOffsets = new WeakMap<THREE.Object3D, Map<string, THREE.Vector3>>();

/** Destination calibration comes from the seated clip, never the moving transition pelvis. */
export function attachmentPelvisOffset(root: THREE.Object3D, clipName: string, pelvisName: string): THREE.Vector3 {
  let offsets = terminalPelvisOffsets.get(root);
  if (!offsets) { offsets = new Map(); terminalPelvisOffsets.set(root, offsets); }
  let offset = offsets.get(clipName);
  if (!offset) {
    const clip = (root.userData.animationClips as THREE.AnimationClip[]).find(value => value.name === clipName);
    if (!clip) throw new Error(`Missing attachment pose ${clipName}`);
    // Only sample transforms on an isolated hierarchy; no live mixer, bones,
    // cached geometry, or gameplay position is modified.
    const copy = root.clone(true);
    const mixer = new THREE.AnimationMixer(copy);
    mixer.clipAction(clip).play(); mixer.update(0);
    copy.updateMatrixWorld(true);
    const pelvis = copy.getObjectByName(pelvisName);
    if (!pelvis) throw new Error(`Missing attachment pelvis ${pelvisName}`);
    offset = copy.worldToLocal(pelvis.getWorldPosition(new THREE.Vector3()));
    mixer.stopAllAction(); mixer.uncacheRoot(copy);
    offsets.set(clipName, offset);
  }
  return offset;
}

export function attachmentSideFromLocalX(localX: number): AttachmentSide {
  // With +Z forward and +Y up, anatomical left is +X.
  return localX >= 0 ? "left" : "right";
}

export function attachmentClip(
  action: "board" | "dock" | "mount" | "dismount",
  options: { skiff?: boolean; side?: AttachmentSide } = {}
): "board" | "board_skiff" | "dock" | "dock_skiff" | "mount" | "mount_right" | "dismount" | "dismount_right" {
  if (action === "board") return options.skiff ? "board_skiff" : "board";
  if (action === "dock") return options.skiff ? "dock_skiff" : "dock";
  if (action === "mount") return options.side === "right" ? "mount_right" : "mount";
  return options.side === "right" ? "dismount_right" : "dismount";
}

export function sampleAttachmentCurve(
  progress: number,
  arcHeight: number
): Readonly<{ weight: number; arcY: number }> {
  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  return {
    weight: clamped * clamped * (3 - 2 * clamped),
    arcY: Math.sin(Math.PI * clamped) * arcHeight
  };
}

export function attachPreservingWorld(parent: THREE.Object3D, child: THREE.Object3D): void {
  parent.attach(child);
}
