import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  attachPreservingWorld,
  attachmentClip,
  attachmentSideFromLocalX,
  sampleAttachmentCurve
} from "../../src/render/animation/PlayerAttachmentTransition";

describe("player attachment presentation", () => {
  it("resolves craft and mirrored mount variants without changing caller actions", () => {
    expect(attachmentClip("board")).toBe("board");
    expect(attachmentClip("board", { skiff: true })).toBe("board_skiff");
    expect(attachmentClip("dock", { skiff: true })).toBe("dock_skiff");
    expect(attachmentClip("mount", { side: attachmentSideFromLocalX(0.4) })).toBe("mount");
    expect(attachmentClip("mount", { side: attachmentSideFromLocalX(-0.4) })).toBe("mount_right");
    expect(attachmentClip("dismount", { side: "right" })).toBe("dismount_right");
  });

  it("preserves the first world transform when reparenting to a moving anchor", () => {
    const scene = new THREE.Group();
    const anchor = new THREE.Group();
    anchor.position.set(4, 1.6, -3);
    anchor.rotation.y = 0.8;
    scene.add(anchor);
    const player = new THREE.Group();
    player.position.set(-1.2, 0.4, 2.3);
    player.rotation.y = -0.35;
    scene.add(player);
    scene.updateMatrixWorld(true);
    const beforePosition = player.getWorldPosition(new THREE.Vector3());
    const beforeQuaternion = player.getWorldQuaternion(new THREE.Quaternion());

    attachPreservingWorld(anchor, player);
    scene.updateMatrixWorld(true);

    expect(player.getWorldPosition(new THREE.Vector3()).distanceTo(beforePosition)).toBeLessThan(1e-6);
    expect(Math.abs(player.getWorldQuaternion(new THREE.Quaternion()).dot(beforeQuaternion))).toBeCloseTo(1, 6);
  });

  it("starts exactly at the captured pose and finishes at the exact terminal lock", () => {
    expect(sampleAttachmentCurve(0, 0.14)).toEqual({ weight: 0, arcY: 0 });
    const terminal = sampleAttachmentCurve(1, 0.14);
    expect(terminal.weight).toBe(1);
    expect(terminal.arcY).toBeCloseTo(0, 12);
    const midpoint = sampleAttachmentCurve(0.5, 0.14);
    expect(midpoint.weight).toBe(0.5);
    expect(midpoint.arcY).toBeCloseTo(0.14, 12);
  });
});
