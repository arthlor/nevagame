import { describe, expect, it, vi } from "vitest";
import type { GameState } from "../../src/simulation/core/types";
import type { WorldScene } from "../../src/render/scene/WorldScene";
import { StartupCoordinator } from "../../src/app/StartupCoordinator";

const earlyAssetIds = ["char_npc_barnaby_b"];
const assetIds = ["asset.one", "char_npc_barnaby_b"];
vi.mock("../../src/render/scene/WorldScene", () => ({
  WorldScene: {
    layoutIndependentStartupAssetIds: vi.fn(() => earlyAssetIds),
    prepareStartupAssetIds: vi.fn()
  }
}));
vi.mock("../../src/render/loaders/AssetLoader", () => ({
  AssetLoader: { preload: vi.fn() }
}));
vi.mock("../../src/render/materials/ExternalSurfaceTextures", () => ({ degradedSurfaceResources: [] }));
vi.mock("../../src/world/loadEnvironmentLayoutBake", () => ({ prefetchEnvironmentLayoutBake: vi.fn() }));
vi.mock("../../src/physics/PhysicsWorld", () => ({
  PhysicsWorld: {
    loadRuntime: vi.fn(async () => ({})),
    create: vi.fn(async () => ({ dispose: vi.fn() }))
  }
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe("startup world preparation", () => {
  it("warms physics and starts the layout bake, then layout-independent transfers, while the layout is prepared", async () => {
    const { AssetLoader } = await import("../../src/render/loaders/AssetLoader");
    const { WorldScene } = await import("../../src/render/scene/WorldScene");
    const { PhysicsWorld } = await import("../../src/physics/PhysicsWorld");
    const { prefetchEnvironmentLayoutBake } = await import("../../src/world/loadEnvironmentLayoutBake");
    const { prepareStartupWorld } = await import("../../src/app/startup/prepareStartupWorld");
    const layout = deferred();
    vi.mocked(AssetLoader.preload).mockReset().mockImplementation(async () => undefined);
    vi.mocked(WorldScene.prepareStartupAssetIds).mockReset()
      .mockImplementation(async () => { await layout.promise; return assetIds as never; });
    const scene = {
      prepareGeometry: vi.fn(async () => undefined),
      ready: vi.fn(async () => undefined),
      staticCollisionProxies: vi.fn(() => [])
    } as unknown as WorldScene;
    const attempt = new StartupCoordinator();
    const work = prepareStartupWorld({ attempt, state: { worldSeed: 42 } as GameState, scene, onState: vi.fn() });

    await vi.waitFor(() => expect(WorldScene.prepareStartupAssetIds).toHaveBeenCalledOnce());
    expect(PhysicsWorld.loadRuntime).toHaveBeenCalled();
    expect(AssetLoader.preload).toHaveBeenCalledOnce();
    expect(vi.mocked(AssetLoader.preload).mock.calls[0][0]).toEqual(earlyAssetIds);
    expect(vi.mocked(AssetLoader.preload).mock.calls[0][3]).toBe(attempt.signal);
    expect(prefetchEnvironmentLayoutBake).toHaveBeenCalledWith(42, attempt.signal);
    expect(vi.mocked(prefetchEnvironmentLayoutBake).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(AssetLoader.preload).mock.invocationCallOrder[0]);

    layout.resolve();
    await work;
    // The scenery stage requests the full set again, joining the early transfers already in flight.
    expect(AssetLoader.preload).toHaveBeenCalledTimes(2);
    expect(vi.mocked(AssetLoader.preload).mock.calls[1][0]).toEqual(assetIds);
  });

  it("finishes required scenery before geometry and population", async () => {
    const { AssetLoader } = await import("../../src/render/loaders/AssetLoader");
    const { WorldScene } = await import("../../src/render/scene/WorldScene");
    const { prepareStartupWorld } = await import("../../src/app/startup/prepareStartupWorld");
    const scenery = deferred();
    const geometry = deferred();
    vi.mocked(WorldScene.prepareStartupAssetIds).mockReset().mockImplementation(async () => assetIds as never);
    vi.mocked(AssetLoader.preload).mockReset().mockImplementation(() => scenery.promise);
    const scene = {
      prepareGeometry: vi.fn(() => geometry.promise),
      ready: vi.fn(async () => undefined),
      staticCollisionProxies: vi.fn(() => [])
    } as unknown as WorldScene;
    const onState = vi.fn();
    const attempt = new StartupCoordinator();
    const work = prepareStartupWorld({ attempt, state: { worldSeed: 42 } as GameState, scene, onState });

    await vi.waitFor(() => expect(AssetLoader.preload).toHaveBeenCalledTimes(2));
    expect(scene.prepareGeometry).not.toHaveBeenCalled();
    expect(scene.ready).not.toHaveBeenCalled();

    scenery.resolve();
    await vi.waitFor(() => expect(scene.prepareGeometry).toHaveBeenCalledOnce());
    expect(scene.ready).not.toHaveBeenCalled();
    geometry.resolve();
    await work;
    expect(scene.ready).toHaveBeenCalledOnce();
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ phase: "world" }));
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ phase: "physics" }));
  });
});
