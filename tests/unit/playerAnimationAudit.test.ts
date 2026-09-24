import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { loadHumanoidAsset } from "../helpers/humanoidAssets";
import { applyEquipmentSocketPose, alignEquipmentHands } from "../../src/render/animation/CharacterEquipment";
import { HumanoidAnimator } from "../../src/render/animation/AnimationController";
import { resolveHumanoidRig } from "../../src/render/animation/HumanoidRig";
import { FishingRodBend } from "../../src/render/fishing/FishingRodBend";
import { ASSET_CATALOG } from "../../src/render/assets/AssetCatalog";

const position = (node: THREE.Object3D) => node.getWorldPosition(new THREE.Vector3());

describe("published player and rod physical contacts", () => {
  it.each(ASSET_CATALOG.filter(asset => asset.requiredNodes.includes("rod_reel_spool")).map(asset => asset.id))(
    "%s keeps rotating parts separate from the blank and the hand on the knob", async id => {
      const player = await loadHumanoidAsset("char_player_a");
      const rod = await loadHumanoidAsset(id);
      const rig = resolveHumanoidRig(player);
      const animator = new HumanoidAnimator(player);
      rig.arms.right!.grip!.add(rod);
      applyEquipmentSocketPose(rod, id);
      const bend = new FishingRodBend(rod);
      const spool = rod.getObjectByName("rod_reel_spool")!;
      const size = new THREE.Box3().setFromObject(spool).getSize(new THREE.Vector3());
      const blankLength = position(rod.getObjectByName("rod_line_exit")!).distanceTo(position(rod.getObjectByName("rod_primary_grip")!));
      expect(size.length(), "spool must not contain joined blank geometry").toBeLessThan(blankLength * 0.25);
      const mixer = new THREE.AnimationMixer(player);
      const clip = (player.userData.animationClips as THREE.AnimationClip[]).find(c => c.name === "reel")!;
      const action = mixer.clipAction(clip).play(); action.paused = true;
      const staticParts: Array<{mesh: THREE.Mesh; positions: number[]}> = [];
      rod.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        let part: THREE.Object3D | null = node;
        while (part && !part.name.startsWith("rod_reel_")) part = part.parent;
        if (!part) staticParts.push({mesh: node, positions: Array.from(node.geometry.getAttribute("position").array)});
      });
      for (let frame = 0; frame <= 24; frame++) {
        action.time = clip.duration * frame / 24; mixer.update(0); player.updateMatrixWorld(true);
        applyEquipmentSocketPose(rod, id);
        bend.update(0, new THREE.Vector3(0, 0, 8), Math.PI * 2 / (5 * clip.duration), action.time);
        alignEquipmentHands(animator, rod);
        expect(position(rig.arms.left!.grip!).distanceTo(position(rod.getObjectByName("rod_secondary_grip")!)), `${id} phase ${frame}/24`).toBeLessThan(0.03);
        for (const {mesh, positions} of staticParts) {
          const current = mesh.geometry.getAttribute("position");
          let max = 0;
          for (let i = 0; i < current.array.length; i++) max = Math.max(max, Math.abs(current.array[i]! - positions[i]!));
          expect(max, `${id}:${mesh.name} static body moved by reel`).toBeLessThan(1e-5);
        }
      }
      bend.dispose();
    }
  );

  it("authors the default-rod grasp and elevated working direction before runtime IK", async () => {
    const player = await loadHumanoidAsset("char_player_a");
    const rod = await loadHumanoidAsset("tool_fishing_rod_a");
    const rig = resolveHumanoidRig(player);
    rig.arms.right!.grip!.add(rod);
    const mixer = new THREE.AnimationMixer(player);
    for (const name of ["fishing_idle", "brace", "cast", "hookset", "slack"]) {
      const clip = (player.userData.animationClips as THREE.AnimationClip[]).find(c => c.name === name)!;
      const action = mixer.clipAction(clip).play(); action.paused = true;
      for (let frame = 0; frame <= 20; frame++) {
        action.time = clip.duration * frame / 20; mixer.update(0); player.updateMatrixWorld(true);
        applyEquipmentSocketPose(rod, "tool_fishing_rod_a");
        expect(position(rig.arms.left!.grip!).distanceTo(position(rod.getObjectByName("rod_secondary_grip")!)), `${name}:${frame} authored palm`).toBeLessThan(0.02);
        if (["fishing_idle", "brace"].includes(name)) {
          const axis = position(rod.getObjectByName("rod_line_exit")!).sub(position(rod.getObjectByName("rod_primary_grip")!)).normalize();
          expect(axis.y, `${name} should resist a submerged pull with elevation`).toBeGreaterThan(0.35);
        }
      }
      mixer.stopAllAction();
    }
  });
});
