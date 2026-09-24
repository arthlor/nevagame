import * as THREE from "three";

import type { CatalogAssetSpec, V3 } from "./types";

/**
 * Collision markers, the same contract the Blender generators emitted: one empty node per catalog
 * `collisionPrimitives` box, named `COL_<id>` for the first and `COL_<id>_<primitive id>` after,
 * placed at the box centre and turned by its yaw. The runtime reads the box extents from the catalog
 * and hides every `COL_` node; the markers only have to exist where the catalog says.
 */
export function addCollisionMarkers(spec: CatalogAssetSpec, parent: THREE.Object3D): THREE.Object3D[] {
  const primitives = spec.collisionPrimitives ?? [];
  if (spec.collision === "none") {
    if (primitives.length) throw new Error(`${spec.id}: nonblocking assets cannot define collision primitives`);
    return [];
  }
  if (!primitives.length) throw new Error(`${spec.id}: blocking assets require collisionPrimitives`);
  return primitives.map((primitive, index) => {
    const marker = new THREE.Object3D();
    marker.name = index === 0 ? `COL_${spec.id}` : `COL_${spec.id}_${primitive.id}`;
    marker.position.set(...primitive.center);
    marker.rotation.y = THREE.MathUtils.degToRad(primitive.yawDegrees ?? 0);
    parent.add(marker);
    return marker;
  });
}

/** The runtime's palm-frame contract (`CharacterEquipment.PALM_GRIP_FRAME`). */
export const PALM_GRIP_FRAME = "palm-y-fingers-z-contact-v1";

/**
 * A hand-contact marker: an empty whose local +Y runs along the fingers and whose local +Z points
 * from the palm into the held material, tagged with the palm-frame contract so `CharacterEquipment`
 * accepts it. Arguments are glTF-space: the tool's own axes, not Blender's.
 */
export function addGripMarker(
  name: string, position: V3, fingers: V3, contact: V3, parent: THREE.Object3D
): THREE.Object3D {
  const y = new THREE.Vector3(...fingers).normalize();
  const z = new THREE.Vector3(...contact);
  z.addScaledVector(y, -z.dot(y));
  if (z.lengthSq() < 1e-8) throw new Error(`${name}: the palm normal must not be parallel to the fingers`);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  const marker = new THREE.Object3D();
  marker.name = name;
  marker.position.set(...position);
  marker.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  marker.userData.neva_marker = "grip";
  marker.userData.neva_grip_frame = PALM_GRIP_FRAME;
  parent.add(marker);
  return marker;
}

/**
 * A typed point marker (Blender's `add_marker`): an empty tagged `neva_marker = type`, such as a
 * rod's `line_exit`, read by position alone.
 */
export function addMarker(name: string, position: V3, type: string, parent: THREE.Object3D): THREE.Object3D {
  const marker = new THREE.Object3D();
  marker.name = name;
  marker.position.set(...position);
  marker.userData.neva_marker = type;
  parent.add(marker);
  return marker;
}
