import { describe, expect, it, vi } from "vitest";
import type { GameState } from "../../src/simulation/core/types";
import type { WorldScene } from "../../src/render/scene/WorldScene";
import { StartupCoordinator } from "../../src/app/StartupCoordinator";

const assetIds = ["asset.one"];
const directModels = [{ id: "char_npc_barnaby_b", modelPath: "/assets/models/char_npc_barnaby_b.glb" }];
vi.mock("../../src/render/scene/WorldScene", () => ({
  WorldScene: {
    prepareStartupAssetIds: vi.fn(async () => assetIds),
    startupDirectModels: vi.fn(() => directModels)
  }
}));
vi.mock("../../src/render/loaders/AssetLoader", () => ({
  AssetLoader: { preload: vi.fn(), preloadDirect: vi.fn() }
}));
vi.mock("../../src/render/materials/ExternalSurfaceTextures", () => ({ degradedSurfaceResources: [] }));
vi.mock("../../src/physics/PhysicsWorld", () => ({
  PhysicsWorld: { create: vi.fn(async () => ({ dispose: vi.fn() })) }
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe("startup world preparation", () => {
  it("finishes required scenery before geometry and population", async () => {
    const { AssetLoader } = await import("../../src/render/loaders/AssetLoader");
    const { prepareStartupWorld } = await import("../../src/app/startup/prepareStartupWorld");
    const scenery = deferred();
    const geometry = deferred();
    vi.mocked(AssetLoader.preload).mockImplementation(() => scenery.promise);
    vi.mocked(AssetLoader.preloadDirect).mockImplementation(() => scenery.promise);
    const scene = {
      prepareGeometry: vi.fn(() => geometry.promise),
      ready: vi.fn(async () => undefined),
      staticCollisionProxies: vi.fn(() => [])
    } as unknown as WorldScene;
    const onState = vi.fn();
    const attempt = new StartupCoordinator();
    const work = prepareStartupWorld({ attempt, state: { worldSeed: 42 } as GameState, scene, onState });

    await vi.waitFor(() => expect(AssetLoader.preload).toHaveBeenCalledOnce());
    expect(scene.prepareGeometry).not.toHaveBeenCalled();
    expect(scene.ready).not.toHaveBeenCalled();

    scenery.resolve();
    await vi.waitFor(() => expect(scene.prepareGeometry).toHaveBeenCalledOnce());
    expect(AssetLoader.preloadDirect).toHaveBeenCalledOnce();
    expect(scene.ready).not.toHaveBeenCalled();
    geometry.resolve();
    await work;
    expect(scene.ready).toHaveBeenCalledOnce();
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ phase: "world" }));
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ phase: "physics" }));
  });
});
