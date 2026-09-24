import * as THREE from "three";

import type { SurfaceBuilder } from "./surface";
import type { V3 } from "./types";

/** Rigs: identity-rest bone hierarchies, the creature scaffold, named pivots and skin binding. */

export interface BoneSpec {
  name: string;
  /** Joint position in model space at rest. Rest rotations are identity. */
  head: V3;
  parent?: string;
}

/** Builds an identity-rest bone hierarchy under `rig`, positioned at the given model-space joints. */
export function buildBones(specs: readonly BoneSpec[], rig: THREE.Object3D): THREE.Bone[] {
  const byName = new Map<string, { bone: THREE.Bone; head: V3 }>();
  for (const spec of specs) {
    const bone = new THREE.Bone();
    bone.name = spec.name;
    if (spec.parent) {
      const parent = byName.get(spec.parent);
      if (!parent) throw new Error(`Bone ${spec.name} names unknown parent ${spec.parent}`);
      bone.position.set(spec.head[0] - parent.head[0], spec.head[1] - parent.head[1], spec.head[2] - parent.head[2]);
      parent.bone.add(bone);
    } else {
      bone.position.set(...spec.head);
      rig.add(bone);
    }
    byName.set(spec.name, { bone, head: spec.head });
  }
  return [...byName.values()].map((entry) => entry.bone);
}

/**
 * Standard creature scaffold matching the runtime contract every catalog animal already uses:
 * `<id>_root` > `<id>_motion_root` > (`<id>_rig` > bones + surface, named pivots).
 */
export function creatureScaffold(id: string): { root: THREE.Group; motion: THREE.Group; rig: THREE.Group } {
  const root = new THREE.Group();
  root.name = `${id}_root`;
  const motion = new THREE.Group();
  motion.name = `${id}_motion_root`;
  root.add(motion);
  const rig = new THREE.Group();
  rig.name = `${id}_rig`;
  motion.add(rig);
  return { root, motion, rig };
}

export function namedNode(name: string, position: V3, parent: THREE.Object3D): THREE.Object3D {
  const node = new THREE.Object3D();
  node.name = name;
  node.position.set(...position);
  parent.add(node);
  return node;
}

/** Binds the built surface to the bones; call once every part has been added. */
export function skinSurface(
  id: string,
  surface: SurfaceBuilder,
  root: THREE.Object3D,
  rig: THREE.Object3D,
  bones: THREE.Bone[]
): THREE.SkinnedMesh {
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const mesh = surface.buildSkinned(`${id}_surface`, skeleton);
  rig.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(skeleton, mesh.matrixWorld);
  return mesh;
}

