import * as THREE from "three";
import { resolveHumanoidRig } from "./HumanoidRig";

/** Capture the model-space fit before the mixer poses the source skeleton. */
export function createTradePackBackSocket(character: THREE.Object3D): THREE.Group {
  const bones = resolveHumanoidRig(character).bones;
  const torso = bones.chest ?? bones.spine;
  if (!torso) throw new Error("Trade pack requires a torso bone");
  const socket = new THREE.Group();
  socket.name = "char_player_backpack_socket";
  socket.userData.dynamicPresentation = true;
  socket.position.set(0, .92, -.36);
  socket.rotation.y = Math.PI;
  socket.scale.setScalar(.78);
  character.add(socket);
  character.updateWorldMatrix(true, true);
  torso.attach(socket);
  return socket;
}

/** Offsets use the published vessel's authored storage/hook frames, in metres. */
export function attachBoatTradePack(boat: THREE.Object3D, boatType: string, slot: number, pack: THREE.Object3D): void {
  const rowboat = boatType === "boat.rowboat";
  const hook = !rowboat && slot >= 4;
  const markerName = rowboat ? "boat_rowboat_storage_01"
    : hook ? `boat_skiff_hook_${slot === 4 ? "left" : "right"}`
      : `boat_skiff_cargo_0${slot < 2 ? 1 : 2}`;
  const marker = boat.getObjectByName(markerName);
  if (!marker) throw new Error(`Missing cargo attachment ${markerName}`);
  pack.name = "boat_fish_pack";
  pack.userData.dynamicPresentation = true;
  pack.scale.setScalar(hook ? .66 : rowboat ? .48 : .52);
  pack.position.set(rowboat ? (slot === 0 ? -.28 : .28) : 0, hook ? -.48 : 0, rowboat || hook ? 0 : (slot % 2 === 0 ? -.23 : .23));
  pack.rotation.y = hook ? (slot === 4 ? Math.PI / 2 : -Math.PI / 2) : Math.PI;
  // Exported marker axes retain Blender orientation; fit in vessel model axes.
  boat.updateWorldMatrix(true, true);
  const anchor = boat.worldToLocal(marker.getWorldPosition(new THREE.Vector3()));
  pack.position.add(anchor);
  boat.add(pack);
}
