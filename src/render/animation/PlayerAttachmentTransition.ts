import * as THREE from "three";

export type AttachmentSide = "left" | "right";

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
