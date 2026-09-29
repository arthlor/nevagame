import * as THREE from "three";
import { PALETTE_HEX } from "../materials/PaletteTokens";

/** Extra lift above the head bone so the mark clears hair and hats. */
export const NPC_ATTENTION_HEAD_CLEARANCE_METERS = 0.36;

/**
 * A closed upright gem above the person you can talk to.
 * Point up, cream over ochre, with enough warmth to read in rain.
 */
export function createNpcAttentionMark(): THREE.Group {
  const group = new THREE.Group();
  group.name = "npc_attention_mark";
  group.visible = false;

  const cream = new THREE.MeshStandardMaterial({
    color: PALETTE_HEX.canvas_cream_01,
    roughness: 0.62,
    metalness: 0,
    flatShading: true,
    emissive: new THREE.Color(PALETTE_HEX.horizon_gold_01),
    emissiveIntensity: 0.4
  });
  const ochre = new THREE.MeshStandardMaterial({
    color: PALETTE_HEX.accent_ochre_01,
    roughness: 0.58,
    metalness: 0,
    flatShading: true,
    emissive: new THREE.Color(PALETTE_HEX.accent_ochre_01),
    emissiveIntensity: 0.28
  });

  // Radius is center-to-vertex, so 0.09 m is 18 cm from tip to tip.
  const source = new THREE.OctahedronGeometry(0.09, 0);
  const positions = source.getAttribute("position");
  const indices = source.getIndex();
  const upper: number[] = [];
  const lower: number[] = [];
  const faceCount = indices ? indices.count / 3 : positions.count / 3;
  for (let face = 0; face < faceCount; face += 1) {
    const slots = [0, 1, 2].map((offset) => indices ? indices.getX(face * 3 + offset) : face * 3 + offset);
    const faceY = slots.reduce((sum, slot) => sum + positions.getY(slot), 0) / 3;
    const target = faceY >= 0 ? upper : lower;
    for (const slot of slots) target.push(positions.getX(slot), positions.getY(slot), positions.getZ(slot));
  }
  source.dispose();

  const upperGeometry = new THREE.BufferGeometry();
  upperGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(upper), 3));
  upperGeometry.computeVertexNormals();
  const lowerGeometry = new THREE.BufferGeometry();
  lowerGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(lower), 3));
  lowerGeometry.computeVertexNormals();

  const crown = new THREE.Mesh(upperGeometry, cream);
  crown.name = "npc_attention_crown";
  crown.castShadow = false;
  crown.receiveShadow = false;

  const base = new THREE.Mesh(lowerGeometry, ochre);
  base.name = "npc_attention_base";
  base.castShadow = false;
  base.receiveShadow = false;

  group.add(crown, base);
  return group;
}

/** Flat ochre contact at a non-person interaction point. Not a selection circle. */
export function createInteractionContactGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const y = 0.012;
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
    0, y, 0.16,
    0.1, y, 0,
    0, y, -0.16,
    0, y, 0.16,
    0, y, -0.16,
    -0.1, y, 0
  ]), 3));
  return geometry;
}

export function disposeNpcAttentionMark(mark: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  mark.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  mark.removeFromParent();
}

export function findNpcHeadBone(model: THREE.Object3D): THREE.Object3D | null {
  let head: THREE.Object3D | null = null;
  model.traverse((child) => {
    const name = child.name.toLowerCase();
    if (name.includes("head") && !name.includes("top") && !name.includes("end")) head = child;
  });
  return head;
}
