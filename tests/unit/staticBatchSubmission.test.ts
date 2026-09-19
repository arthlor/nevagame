import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { configureStaticBatchSubmission } from "../../src/render/scene/staticBatchSubmission";

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
