import fs from 'node:fs/promises';
import { expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { createTradePackBackSocket, attachBoatTradePack } from '../../src/render/animation/TradePackAttachment';
import { resolveHumanoidRig } from '../../src/render/animation/HumanoidRig';

async function model(id: string) {
  await MeshoptDecoder.ready;
  const data = await fs.readFile(`public/assets/models/${id}.glb`);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
  gltf.scene.userData.assetId = id;
  return gltf;
}
it('fits the published pack behind the player and follows the animated torso', async () => {
  const player = await model('char_player_a');
  const pack = await model('prop_trade_pack_trout_a');
  const socket = createTradePackBackSocket(player.scene);
  socket.add(pack.scene);
  player.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(pack.scene);
  expect(bounds.min.y).toBeGreaterThan(.85);
  expect(bounds.max.y).toBeLessThan(1.8);
  expect(bounds.max.z).toBeLessThan(.05);
  expect(bounds.min.z).toBeGreaterThan(-.75);
  const torso = resolveHumanoidRig(player.scene).bones.chest!;
  expect(socket.parent).toBe(torso);
  const local = socket.matrix.clone();
  const mixer = new THREE.AnimationMixer(player.scene);
  const clip = player.animations.find(clip => /walk/i.test(clip.name));
  expect(clip).toBeDefined();
  mixer.clipAction(clip!).play();
  mixer.update(.3);
  player.scene.updateMatrixWorld(true);
  expect(socket.matrix.equals(local)).toBe(true);
  expect(socket.getWorldPosition(new THREE.Vector3()).toArray().every(Number.isFinite)).toBe(true);
});
it('attaches all eight vessel slots to published anchors with separate pack bounds', async () => {
  for (const [asset, type, slots] of [['boat_rowboat_a', 'boat.rowboat', 2], ['boat_skiff_a', 'boat.skiff', 6]] as const) {
    const boat = await model(asset);
    const bounds: THREE.Box3[] = [];
    for (let slot = 0; slot < slots; slot++) {
      const pack = (await model(slot >= 4 ? 'prop_trade_pack_blue_marlin_a' : 'prop_trade_pack_tuna_a')).scene;
      attachBoatTradePack(boat.scene, type, slot, pack);
      boat.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(pack);
      expect(box.min.y).toBeGreaterThan(0);
      expect(box.getSize(new THREE.Vector3()).length()).toBeGreaterThan(.4);
      bounds.push(box);
    }
    for (let i = 0; i < slots; i++) for (let j = i + 1; j < slots; j++) {
      const intersection = bounds[i].clone().intersect(bounds[j]).getSize(new THREE.Vector3());
      expect(intersection.x * intersection.y * intersection.z, `${asset} ${i}/${j}`).toBeLessThan(.005);
    }
  }
});
