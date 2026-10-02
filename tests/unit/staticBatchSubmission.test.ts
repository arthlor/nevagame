import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { configureStaticBatchSubmission, type StaticBatchCullRegion } from "../../src/render/scene/staticBatchSubmission";

function viewFrustum(camera: THREE.Camera): THREE.Frustum {
  camera.updateMatrixWorld();
  return new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  );
}

function separatedRegions() {
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardMaterial();
  const batch = new THREE.BatchedMesh(2, geometry.getAttribute("position").count, geometry.index!.count, material);
  const geometryId = batch.addGeometry(geometry);
  const regions: StaticBatchCullRegion[] = [-80, 80].map(x => {
    const matrix = new THREE.Matrix4().makeTranslation(x, 0, -40);
    batch.setMatrixAt(batch.addInstance(geometryId), matrix);
    return { localBounds: batch.getBoundingSphereAt(geometryId, new THREE.Sphere())!.applyMatrix4(matrix), visible: true };
  });
  batch.computeBoundingSphere();
  batch.updateMatrixWorld();
  configureStaticBatchSubmission(batch, regions);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  return { batch, camera, regions };
}

function fixture(transparent = false) {
  const material = new THREE.MeshStandardMaterial({ transparent });
  const geometry = new THREE.BoxGeometry();
  const batch = new THREE.BatchedMesh(3, geometry.getAttribute("position").count, geometry.index!.count, material);
  const geometryId = batch.addGeometry(geometry);
  for (const x of [-2, 0, 2]) batch.setMatrixAt(batch.addInstance(geometryId), new THREE.Matrix4().makeTranslation(x, 0, -6));
  configureStaticBatchSubmission(batch);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.updateMatrixWorld();
  batch.updateMatrixWorld();
  const reads = vi.spyOn(batch, "getMatrixAt");
  const renderer = { coordinateSystem: THREE.WebGLCoordinateSystem } as THREE.WebGLRenderer;
  const render = (view = camera) => batch.onBeforeRender(renderer, new THREE.Scene(), view, batch.geometry, material, null as never);
  return { batch, camera, reads, renderer, render };
}

describe("static batch submission", () => {
  it("rejects empty space inside a large batch bound without scanning its instances", () => {
    const { batch, camera } = separatedRegions();
    const frustum = viewFrustum(camera);
    expect(THREE.Mesh.prototype.intersectsFrustum.call(batch, frustum)).toBe(true);
    const reads = vi.spyOn(batch, "getMatrixAt");
    expect(batch.intersectsFrustum(frustum)).toBe(false);
    expect(reads).not.toHaveBeenCalled();
    camera.lookAt(80, 0, -40);
    expect(batch.intersectsFrustum(viewFrustum(camera))).toBe(true);
    batch.dispose();
  });

  it("uses each pass's frustum and combines it with fog-cell visibility", () => {
    const { batch, camera, regions } = separatedRegions();
    expect(batch.intersectsFrustum(viewFrustum(camera))).toBe(false);
    const shadow = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 200);
    const shadowFrustum = viewFrustum(shadow);
    expect(batch.intersectsFrustum(shadowFrustum)).toBe(true);
    regions.forEach(region => { region.visible = false; });
    expect(batch.intersectsFrustum(shadowFrustum)).toBe(false);
    regions[1].visible = true;
    expect(batch.intersectsFrustum(shadowFrustum)).toBe(true);
    expect(batch.intersectsFrustum(viewFrustum(camera))).toBe(false);
    camera.lookAt(80, 0, -40);
    viewFrustum(camera);
    const opposite = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    opposite.lookAt(0, 0, 40);
    viewFrustum(opposite);
    const views = new THREE.FrustumArray().setFromArrayCamera(new THREE.ArrayCamera([camera, opposite]));
    expect(batch.intersectsFrustum(views)).toBe(true);
    batch.dispose();
  });

  it("transforms conservative local bounds with their parent and permits a changed instance pose", () => {
    const { batch, camera, regions } = separatedRegions();
    const root = new THREE.Group();
    root.add(batch);
    root.position.set(12, 4, 7);
    root.rotation.y = 0.35;
    root.scale.set(1.5, 2, 0.75);
    root.updateMatrixWorld(true);
    const worldCenter = regions[1].localBounds.center.clone().applyMatrix4(batch.matrixWorld);
    camera.lookAt(worldCenter);
    expect(batch.intersectsFrustum(viewFrustum(camera))).toBe(true);
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.scale.set(1, 1, 1);
    root.updateMatrixWorld(true);
    camera.rotation.set(0, 0, 0);
    expect(batch.intersectsFrustum(viewFrustum(camera))).toBe(false);
    batch.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, -6));
    expect(batch.intersectsFrustum(viewFrustum(camera))).toBe(true);
    batch.dispose();
  });

  it("reuses an unchanged draw list, but refreshes camera, projection, transform and visibility changes", () => {
    const { batch, camera, reads, render } = fixture();
    expect(batch.sortObjects).toBe(false);
    expect(batch.perObjectFrustumCulled).toBe(true);
    render();
    expect(reads).toHaveBeenCalledTimes(3);
    reads.mockClear();
    render();
    expect(reads).not.toHaveBeenCalled();
    batch.setVisibleAt(1, false);
    render();
    expect(reads).toHaveBeenCalledTimes(2);
    reads.mockClear();
    camera.position.x = 1;
    camera.updateMatrixWorld();
    render();
    expect(reads).toHaveBeenCalledTimes(2);
    reads.mockClear();
    camera.fov = 70;
    camera.updateProjectionMatrix();
    render();
    expect(reads).toHaveBeenCalledTimes(2);
    reads.mockClear();
    batch.position.x = 2;
    batch.updateMatrixWorld();
    render();
    expect(reads).toHaveBeenCalledTimes(2);
    reads.mockClear();
    batch.setMatrixAt(0, new THREE.Matrix4().makeTranslation(3, 0, -8));
    render();
    expect(reads).toHaveBeenCalledTimes(2);
    batch.dispose();
  });

  it("restores main-camera culling after a shadow pass and retains transparent depth sorting", () => {
    const { batch, camera, renderer, reads, render } = fixture(true);
    expect(batch.sortObjects).toBe(true);
    render();
    reads.mockClear();
    const shadow = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    shadow.position.set(4, 8, 3);
    shadow.lookAt(0, 0, -6);
    shadow.updateMatrixWorld();
    batch.onBeforeShadow(renderer, new THREE.Scene(), camera, shadow, batch.geometry, new THREE.MeshDepthMaterial(), null as never);
    expect(reads).toHaveBeenCalledTimes(3);
    reads.mockClear();
    render();
    expect(reads).toHaveBeenCalledTimes(3);
    reads.mockClear();
    render();
    expect(reads).not.toHaveBeenCalled();
    batch.dispose();
  });
});
