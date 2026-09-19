import * as THREE from "three";

/**
 * Static geometry keeps Three's per-pass instance culling, but its prepared draw
 * list need not be rebuilt/uploaded for an identical view. Shadow views naturally
 * invalidate this single-entry cache before the main view restores its own list.
 */
export function configureStaticBatchSubmission(batch: THREE.BatchedMesh): void {
  const material = batch.material as THREE.Material;
  batch.sortObjects = material.transparent;
  const nativeRender = batch.onBeforeRender;
  const nativeVisibility = batch.setVisibleAt;
  const nativeMatrix = batch.setMatrixAt;
  const matrices = new Float64Array(48);
  let revision = 0;
  let preparedRevision = -1;
  let coordinateSystem: number | undefined;
  let sorting = batch.sortObjects;
  let transparent = material.transparent;
  let frustumCulling = batch.perObjectFrustumCulled;

  batch.setVisibleAt = (instanceId, visible) => {
    if (batch.getVisibleAt(instanceId) !== visible) revision++;
    return nativeVisibility.call(batch, instanceId, visible);
  };
  batch.setMatrixAt = (instanceId, matrix) => {
    revision++;
    return nativeMatrix.call(batch, instanceId, matrix);
  };
  batch.onBeforeRender = (renderer, scene, camera, geometry, drawMaterial, group) => {
    let unchanged = revision === preparedRevision && coordinateSystem === renderer.coordinateSystem
      && sorting === batch.sortObjects && frustumCulling === batch.perObjectFrustumCulled
      && transparent === drawMaterial.transparent;
    for (let matrix = 0; matrix < 3; matrix++) {
      const elements = matrix === 0 ? camera.projectionMatrix.elements
        : matrix === 1 ? camera.matrixWorldInverse.elements : batch.matrixWorld.elements;
      for (let element = 0; element < 16; element++) {
        const index = matrix * 16 + element;
        const value = elements[element];
        if (matrices[index] !== value) unchanged = false;
        matrices[index] = value;
      }
    }
    if (unchanged) return;
    nativeRender.call(batch, renderer, scene, camera, geometry, drawMaterial, group);
    preparedRevision = revision;
    coordinateSystem = renderer.coordinateSystem;
    sorting = batch.sortObjects;
    transparent = drawMaterial.transparent;
    frustumCulling = batch.perObjectFrustumCulled;
  };
}
