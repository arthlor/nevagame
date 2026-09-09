import { afterEach, describe, expect, it, vi } from "vitest";
import { PerspectiveCamera } from "three";
import { playOpeningCamera } from "../../src/render/camera/OpeningCameraSequence";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("opening camera", () => {
  it("restores gameplay framing and cancels callbacks on any input", async () => {
    vi.useFakeTimers();
    const surface = new EventTarget();
    Object.assign(surface, { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("window", surface);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 7));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const camera = new PerspectiveCamera(47);
    camera.position.set(1, 2, 3);
    const normal = camera.position.clone();
    const render = vi.fn();
    const promise = playOpeningCamera(camera, { cameraPosition: { x: -70, y: 9, z: -42 },
      cameraTarget: { x: -68, y: 7, z: -86 }, fovDegrees: 50 }, render, new AbortController().signal, () => {});
    expect(camera.position.equals(normal)).toBe(false);
    surface.dispatchEvent(new Event("keydown", { cancelable: true }));
    await promise;
    expect(camera.position.equals(normal)).toBe(true);
    expect(camera.fov).toBe(47);
    const calls = render.mock.calls.length;
    await vi.runAllTimersAsync();
    expect(render).toHaveBeenCalledTimes(calls);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
  });
  it("skips the sequence for reduced motion", async () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    const render = vi.fn();
    await playOpeningCamera(new PerspectiveCamera(), { cameraPosition: { x: 0, y: 9, z: 0 },
      cameraTarget: { x: 0, y: 0, z: 0 }, fovDegrees: 50 }, render, new AbortController().signal, () => {});
    expect(render).not.toHaveBeenCalled();
  });
});
