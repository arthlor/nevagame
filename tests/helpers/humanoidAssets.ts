import fs from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { MeshoptDecoder } from "meshoptimizer";
import { ASSET_BY_ID, ASSET_CATALOG, type AssetId } from "../../src/render/assets/AssetCatalog";
import type { CharacterAnimationContext } from "../../src/render/animation/AnimationController";
import type { PlayerMotionSample } from "../../src/simulation/core/PhysicsAdapter";

export const CHARACTER_ASSET_IDS = ASSET_CATALOG.filter((asset) => asset.family === "character").map((asset) => asset.id);
const loaded = new Map<AssetId, Promise<GLTF>>();

/** The same Meshopt decoder and GLTFLoader as production, with isolated bones per test. */
export async function loadHumanoidAsset(id: AssetId): Promise<THREE.Group> {
  let pending = loaded.get(id);
  if (!pending) {
    pending = (async () => {
      const asset = ASSET_BY_ID.get(id)!;
      const directory = process.env.NEVA_HUMANOID_CANDIDATE_DIR
        ?? path.resolve(import.meta.dirname, "../../public/assets/models");
      const bytes = await fs.readFile(path.resolve(directory, asset.file));
      await MeshoptDecoder.ready;
      return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ""
      );
    })();
    loaded.set(id, pending);
  }
  const gltf = await pending;
  const root = clone(gltf.scene) as THREE.Group;
  root.userData.assetId = id;
  root.userData.animationClips = gltf.animations;
  root.updateMatrixWorld(true);
  return root;
}

export function characterMotion(overrides: Partial<PlayerMotionSample> = {}): PlayerMotionSample {
  return {
    velocity: { x: 0, y: 0, z: 0 }, speedMetersPerSecond: 0,
    accelerationMetersPerSecondSquared: 0, turnRateRadiansPerSecond: 0,
    isGrounded: true, groundNormal: { x: 0, y: 1, z: 0 }, slopeRadians: 0,
    airbornePhase: "grounded", contactEvent: "none", landingImpactStrength: 0,
    contactSurface: "grass", isCollisionBlocked: false, requestedGait: "idle", ...overrides
  };
}

export function characterContext(motion: Partial<PlayerMotionSample> = {}): CharacterAnimationContext {
  return { mode: "on-foot", carrying: false, motion: characterMotion(motion) };
}

export function characterBones(root: THREE.Object3D): THREE.Bone[] {
  const result: THREE.Bone[] = [];
  root.traverse((node) => { if ((node as THREE.Bone).isBone) result.push(node as THREE.Bone); });
  return result;
}
