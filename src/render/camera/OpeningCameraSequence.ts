import { PerspectiveCamera, Vector3 } from "three";

/** Runs only after a new world is prepared and committed, before player control. */
export function playOpeningCamera(camera: PerspectiveCamera,
  preset: { cameraPosition: { x: number; y: number; z: number }; cameraTarget: { x: number; y: number; z: number }; fovDegrees: number },
  render: () => void, signal: AbortSignal, publishSkip: (skip: (() => void) | null) => void): Promise<void> {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();
  const position = camera.position.clone(), rotation = camera.quaternion.clone(), fov = camera.fov;
  const opening = camera.clone();
  opening.position.set(preset.cameraPosition.x, preset.cameraPosition.y, preset.cameraPosition.z);
  opening.lookAt(new Vector3(preset.cameraTarget.x, preset.cameraTarget.y, preset.cameraTarget.z));
  return new Promise((resolve, reject) => {
    let frame = 0, finished = false;
    const started = performance.now();
    let timer: ReturnType<typeof setTimeout>;
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      for (const type of ["keydown", "pointerdown", "wheel"] as const) window.removeEventListener(type, skip, true);
      signal.removeEventListener("abort", finish);
      publishSkip(null);
      camera.position.copy(position); camera.quaternion.copy(rotation); camera.fov = fov;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      if (signal.aborted) reject(signal.reason); else { render(); resolve(); }
    };
    const skip = (event: Event) => { event.preventDefault(); event.stopPropagation(); finish(); };
    const draw = (now: number) => {
      if (finished) return;
      const fraction = Math.max(0, Math.min(1, (now - started - 4000) / 1200));
      const blend = fraction * fraction * (3 - 2 * fraction);
      camera.position.lerpVectors(opening.position, position, blend);
      camera.quaternion.slerpQuaternions(opening.quaternion, rotation, blend);
      camera.fov = preset.fovDegrees + (fov - preset.fovDegrees) * blend;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld(); render();
      if (fraction >= 1) finish(); else frame = requestAnimationFrame(draw);
    };
    for (const type of ["keydown", "pointerdown", "wheel"] as const) window.addEventListener(type, skip, { capture: true, passive: false });
    signal.addEventListener("abort", finish, { once: true });
    publishSkip(finish);
    timer = setTimeout(finish, 5500);
    if (signal.aborted) finish(); else draw(started);
  });
}
