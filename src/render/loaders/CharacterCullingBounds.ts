import * as THREE from "three";

export interface CharacterCullingBounds {
  rootLocalBox: THREE.Box3;
  rootLocalSphere: THREE.Sphere;
  meshes: readonly THREE.SkinnedMesh[];
}

const isCollisionObject = (object: THREE.Object3D): boolean => {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.name.startsWith("COL_")) return true;
    current = current.parent;
  }
  return false;
};

/**
 * Gives every skinned part the same actor-level culling envelope. The radius is
 * one measured standing height, which covers a humanoid's articulated reach
 * without keeping every off-screen body part submitted to the renderer.
 */
export function configureConservativeSkinnedBounds(root: THREE.Object3D): CharacterCullingBounds {
  root.updateMatrixWorld(true);
  const rootWorldInverse = root.matrixWorld.clone().invert();
  const exactRootLocalBox = new THREE.Box3();
  const meshes: THREE.SkinnedMesh[] = [];
  const vertex = new THREE.Vector3();
  const meshToRoot = new THREE.Matrix4();

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || isCollisionObject(mesh)) return;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(mesh as THREE.SkinnedMesh);

    const position = mesh.geometry.getAttribute("position");
    if (!position) return;
    meshToRoot.multiplyMatrices(rootWorldInverse, mesh.matrixWorld);
    for (let index = 0; index < position.count; index += 1) {
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        (mesh as THREE.SkinnedMesh).getVertexPosition(index, vertex);
      } else {
        vertex.fromBufferAttribute(position, index);
      }
      exactRootLocalBox.expandByPoint(vertex.applyMatrix4(meshToRoot));
    }
  });

  if (exactRootLocalBox.isEmpty() || meshes.length === 0) {
    return {
      rootLocalBox: exactRootLocalBox,
      rootLocalSphere: new THREE.Sphere(),
      meshes
    };
  }

  const center = exactRootLocalBox.getCenter(new THREE.Vector3());
  const exactSphere = exactRootLocalBox.getBoundingSphere(new THREE.Sphere());
  const standingHeight = exactRootLocalBox.getSize(new THREE.Vector3()).y;
  const rootLocalSphere = new THREE.Sphere(center, Math.max(exactSphere.radius, standingHeight));
  const rootLocalBox = rootLocalSphere.getBoundingBox(new THREE.Box3());
  const rootToMesh = new THREE.Matrix4();

  for (const mesh of meshes) {
    rootToMesh.multiplyMatrices(mesh.matrixWorld.clone().invert(), root.matrixWorld);
    mesh.boundingSphere = rootLocalSphere.clone().applyMatrix4(rootToMesh);
    mesh.boundingBox = rootLocalBox.clone().applyMatrix4(rootToMesh);
    mesh.frustumCulled = true;
  }

  return { rootLocalBox, rootLocalSphere, meshes };
}
