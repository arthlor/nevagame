import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MeshoptDecoder } from "meshoptimizer";
import { createNodeGltfLoader } from "../helpers/nodeGltfLoader";
import { AMBIENT_NPC_ASSETS } from "../../src/render/scene/ambientNpcAssets";
import { AMBIENT_BOAT_ROUTES } from "../../src/render/scene/ambientBoats";
import { AmbientBoatPresentation } from "../../src/render/presentation/AmbientBoatPresentation";
import catalog from "../../assets/specs/asset-catalog.json";

async function load(file: string) {
  await MeshoptDecoder.ready;
  const bytes = await fs.readFile(file);
  const gltf = await createNodeGltfLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  gltf.scene.userData.animationClips = gltf.animations;
  gltf.scene.updateMatrixWorld(true);
  return gltf;
}

// @ts-expect-error The CLI verifier is an ES module shared with Node pipeline tests.
import { nativeNpcContract } from "../../tools/art/native_npc_contract.mjs";

const native = catalog.assets.filter(a => a.id.startsWith("char_npc_") && !a.id.endsWith("_a"));
describe("catalog NPC cast and ambient boat crews", () => {
  it.each(native)("retains the complete source rig and performances for $id", async spec => {
    const source = await load(spec.skinnedAuthoring!.sourceFile);
    const target = await load(`public/assets/models/${spec.file}`);
    const names = (root: THREE.Object3D) => {
      const result: string[] = [];
      root.traverse(node => { if (node instanceof THREE.Bone) result.push(node.name); });
      return result.sort();
    };
    expect(names(target.scene)).toEqual(names(source.scene));
    const normalized = (name: string) => name.replace(/\.\d+$/, "");
    expect(target.animations.map(a => a.name).sort()).toEqual(source.animations.map(a => normalized(a.name)).sort());
    for (const clip of source.animations) {
      const retained = target.animations.find(a => a.name === normalized(clip.name))!;
      expect(retained.duration).toBeCloseTo(clip.duration, 3);
    }
    const head = target.scene.getObjectByName("mixamorigHead") ?? target.scene.getObjectByName("head");
    expect(head).toBeDefined();
  }, 30000);


  it("rejects changed source skin weights and bone performance", async () => {
    const spec = native.find(a => a.id === AMBIENT_NPC_ASSETS[0])!;
    const target = await load(`public/assets/models/${spec.file}`);
    await expect(nativeNpcContract({ ...spec, animationClips: spec.animationClips!.slice(1) }, target, createNodeGltfLoader())).rejects.toThrow("source animation library changed");
    const contract = await nativeNpcContract(spec, target, createNodeGltfLoader());
    const clip = target.animations.find(clip => clip.name === "idle")!;
    const mixer = new THREE.AnimationMixer(target.scene);
    mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
    contract.begin(clip);
    mixer.setTime(.3); target.scene.updateMatrixWorld(true);
    expect(() => contract.sample(.3)).not.toThrow();
    const hand = target.scene.getObjectByName("mixamorigLeftHand")!;
    hand.position.x += .02; target.scene.updateMatrixWorld(true);
    expect(() => contract.sample(.3)).toThrow("source performance changed");
    contract.dispose(); mixer.stopAllAction(); mixer.uncacheRoot(target.scene);
    const body = target.scene.getObjectByName(`${spec.id}_body`) as THREE.SkinnedMesh;
    const weights = body.geometry.getAttribute("skinWeight");
    weights.setX(0, weights.getX(0) + .1);
    await expect(nativeNpcContract(spec, target, createNodeGltfLoader())).rejects.toThrow("source weights changed");
  });

  it("uses both hull types and only the separate ambient cast for crews", () => {
    expect(new Set(AMBIENT_BOAT_ROUTES.map(route => route.assetId))).toEqual(new Set(["boat_skiff_a", "boat_rowboat_a"]));
    for (const route of AMBIENT_BOAT_ROUTES) expect(AMBIENT_NPC_ASSETS).toContain(route.driverAssetId);
  });

  it.each(AMBIENT_NPC_ASSETS)("keeps %s seated/planted and gripping both boat controls throughout motion", async id => {
    for (const rowing of [false, true]) {
      const { scene: boat } = await load(`public/assets/models/${rowing ? "boat_rowboat_a" : "boat_skiff_a"}.glb`);
      const { scene: driver } = await load(`public/assets/models/${id}.glb`);
      const palms = ["Left", "Right"].map(side => {
        const hand = driver.getObjectByName(`mixamorig${side}Hand`)!;
        const middle = driver.getObjectByName(`mixamorig${side}HandMiddle1`)!;
        return { hand, point: hand.worldToLocal(middle.getWorldPosition(new THREE.Vector3()).lerp(hand.getWorldPosition(new THREE.Vector3()), .45)) };
      });
      const ankles = ["Left", "Right"].map(side => {
        const foot = driver.getObjectByName(`mixamorig${side}Foot`)!;
        return { foot, height: foot.getWorldPosition(new THREE.Vector3()).y };
      });
      // Construct on an already placed hull too, as the Art Yard does.
      boat.position.set(3, .4, 2); boat.rotation.y = .35;
      const crew = new AmbientBoatPresentation(boat, driver, rowing);
      boat.position.set(7, 2, -9); boat.rotation.set(.025, .7, -.02);
      for (const seconds of [0, .6, 1.2, 1.8, 2.4]) {
        crew.update(seconds, false); boat.updateMatrixWorld(true);
        if (rowing) {
          const seat = boat.getObjectByName("boat_rowboat_rower_seat")!.getWorldPosition(new THREE.Vector3());
          seat.add(new THREE.Vector3(0, .1, 0).applyQuaternion(boat.getWorldQuaternion(new THREE.Quaternion())));
          expect(driver.getObjectByName("mixamorigHips")!.getWorldPosition(new THREE.Vector3()).distanceTo(seat)).toBeLessThan(.005);
        }
        for (let i = 0; i < palms.length; i++) {
          const side = i === 0 ? "left" : "right";
          const grip = boat.getObjectByName(rowing ? `boat_rowboat_oar_${side}_grip` : side === "left" ? "boat_skiff_helm_grip_left" : "boat_skiff_helm_grip")!;
          const footSocket = boat.getObjectByName(`${rowing ? "boat_rowboat" : "boat_skiff"}_foot_${side}_socket`)!;
          const ankleTarget = footSocket.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, ankles[i].height, 0).applyQuaternion(driver.getWorldQuaternion(new THREE.Quaternion())));
          expect(ankles[i].foot.getWorldPosition(new THREE.Vector3()).distanceTo(ankleTarget), `${id} foot ${side}`).toBeLessThan(.04);
          const point = palms[i].hand.localToWorld(palms[i].point.clone());
          expect(point.distanceTo(grip.getWorldPosition(new THREE.Vector3())), `${id} ${rowing ? "row" : "helm"} ${side} at ${seconds}`).toBeLessThan(.045);
        }
      }
      crew.update(2.4, true);
      driver.traverse(node => expect(node.matrixWorld.elements.every(Number.isFinite)).toBe(true));
      crew.dispose();
      expect(driver.parent).toBeNull();
    }
  }, 30000);
});
