import * as THREE from "three";
import { ASSET_BY_ID, type AssetId, type HumanoidBoneSemantic, type RuntimeHumanoidRig } from "../assets/AssetCatalog";

export type HumanoidSide = "left" | "right";

export interface HumanoidLegBinding {
  thigh: THREE.Object3D;
  shin: THREE.Object3D;
  foot: THREE.Object3D;
  shinTip: THREE.Vector3;
  soleOffset: THREE.Vector3;
  soleNormal: THREE.Vector3;
  bendDirection: THREE.Vector3;
  detachedFoot: boolean;
}

export interface HumanoidRigBinding {
  bones: Partial<Record<HumanoidBoneSemantic, THREE.Object3D>>;
  legs: Partial<Record<HumanoidSide, HumanoidLegBinding>>;
  arms: Partial<Record<HumanoidSide, {
    upper: THREE.Object3D; lower: THREE.Object3D; hand: THREE.Object3D;
    lowerTip: THREE.Vector3; bendDirection: THREE.Vector3;
    grip: THREE.Object3D | undefined;
  }>>;
  upperBodyNodes: ReadonlySet<string>;
  production: boolean;
}

const bindings = new WeakMap<THREE.Object3D, HumanoidRigBinding>();

/** GLTFLoader sanitizes channel/node names; catalog names retain source identity. */
export function findHumanoidNode(root: THREE.Object3D, sourceName: string): THREE.Object3D | undefined {
  return root.getObjectByName(sourceName)
    ?? root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(sourceName));
}

export function isDescendantOf(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) {
    if (current === ancestor) return true;
  }
  return false;
}

/** One semantic adapter over source bones. No rebinding or rest-pose changes. */
export function resolveHumanoidRig(root: THREE.Object3D): HumanoidRigBinding {
  const cached = bindings.get(root);
  if (cached) return cached;
  const asset = ASSET_BY_ID.get(root.userData.assetId as AssetId);
  const spec = (root.userData.humanoidRig as RuntimeHumanoidRig | undefined) ?? asset?.humanoidRig;
  let skinned = false;
  root.traverse((node) => { if ((node as THREE.SkinnedMesh).isSkinnedMesh) skinned = true; });
  const production = skinned && asset?.family === "character";
  if (!spec) throw new Error(`[HumanoidRig] ${asset?.id ?? root.name} has no source rig binding`);
  const bones: HumanoidRigBinding["bones"] = {};
  for (const [semantic, name] of Object.entries(spec.bones)) {
    const bone = findHumanoidNode(root, name);
    if (!bone) throw new Error(`[HumanoidRig] ${asset?.id ?? root.name}: missing ${semantic} (${name})`);
    bones[semantic as HumanoidBoneSemantic] = bone;
  }
  root.updateWorldMatrix(true, true);
  const legs: HumanoidRigBinding["legs"] = {};
  for (const side of ["left", "right"] as const) {
    const thigh = bones[`thigh_${side}`];
    const shin = bones[`shin_${side}`];
    const foot = bones[`foot_${side}`];
    if (!thigh || !shin || !foot) {
      if (production) throw new Error(`[HumanoidRig] ${asset.id} has an incomplete ${side} leg`);
      continue;
    }
    const metadata = spec.legs[side];
    if (!metadata) throw new Error(`[HumanoidRig] Missing ${side} leg calibration`);
    const shinTip = new THREE.Vector3().fromArray(metadata.shinTip);
    legs[side] = {
      thigh, shin, foot, shinTip,
      soleOffset: new THREE.Vector3().fromArray(metadata.soleOffset),
      soleNormal: new THREE.Vector3().fromArray(metadata.soleNormal),
      bendDirection: new THREE.Vector3().fromArray(metadata.bendDirection),
      detachedFoot: !isDescendantOf(foot, shin)
    };
  }
  const arms: HumanoidRigBinding["arms"] = {};
  for (const side of ["left", "right"] as const) {
    const upper = bones[`upper_arm_${side}`];
    const lower = bones[`forearm_${side}`];
    const hand = bones[`hand_${side}`];
    if (!upper || !lower || !hand) {
      if (production) throw new Error(`[HumanoidRig] ${asset.id} has an incomplete ${side} arm`);
      continue;
    }
    const gripName = spec.grips?.[side];
    const metadata = spec.arms?.[side];
    if (!metadata || !gripName) throw new Error(`[HumanoidRig] Missing ${side} arm or palm calibration`);
    const grip = findHumanoidNode(root, gripName);
    if (!grip) throw new Error(`[HumanoidRig] Missing ${side} palm marker ${gripName}`);
    arms[side] = {
      upper, lower, hand,
      lowerTip: lower.worldToLocal(hand.getWorldPosition(new THREE.Vector3())),
      bendDirection: new THREE.Vector3().fromArray(metadata.bendDirection),
      grip
    };
  }
  const upperBodyNodes = new Set<string>();
  for (const semantic of ["hips", "spine", "chest", "neck", "clavicle_left", "clavicle_right"] as const) {
    bones[semantic]?.traverse((node) => upperBodyNodes.add(node.name));
  }
  const binding = { bones, legs, arms, upperBodyNodes, production };
  bindings.set(root, binding);
  return binding;
}
