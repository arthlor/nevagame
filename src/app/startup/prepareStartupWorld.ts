import type { GameState } from "../../simulation/core/types";
import { WorldScene } from "../../render/scene/WorldScene";
import { AssetLoader } from "../../render/loaders/AssetLoader";
import { degradedSurfaceResources } from "../../render/materials/ExternalSurfaceTextures";
import { PhysicsWorld } from "../../physics/PhysicsWorld";
import { StartupTimeoutError } from "../StartupLoading";
import type { StartupCoordinator } from "../StartupCoordinator";
import type { StartupState } from "../StartupState";

const ASSET_PROGRESS_STALL_TIMEOUT_MS = 90_000;
const PHYSICS_STARTUP_TIMEOUT_MS = 30_000;
// Traversal and geometry each prepare thousands of placements on slower devices.
export const WORLD_STARTUP_TIMEOUT_MS = 120_000;

interface StartupWorldOptions {
  attempt: StartupCoordinator;
  state: Readonly<GameState>;
  scene: WorldScene;
  onState: (update: Partial<StartupState>) => void;
}

/** Prepares the required asset set, scene and collision world for the entry commit. */
export async function prepareStartupWorld({ attempt, state, scene, onState }: StartupWorldOptions): Promise<PhysicsWorld> {
  onState({ phase: "layout", message: "Preparing the coast" });
  const assetIds = await attempt.stage(
    () => WorldScene.prepareStartupAssetIds(state, attempt.signal),
    WORLD_STARTUP_TIMEOUT_MS,
    new StartupTimeoutError("world-startup-timeout", "Island preparation timed out")
  );
  onState({ phase: "assets", loadedAssets: 0, totalAssets: assetIds.length, message: "Loading scenery" });
  await attempt.stage(
    reportProgress => AssetLoader.preload(assetIds, progress => {
      if (attempt.signal.aborted) return;
      reportProgress();
      onState({
        loadedAssets: progress.completed,
        totalAssets: progress.total,
        progress: { kind: "measured", completed: progress.completed, total: progress.total }
      });
    }, 6, attempt.signal, reportProgress),
    ASSET_PROGRESS_STALL_TIMEOUT_MS,
    new StartupTimeoutError("asset-loading-stalled", "Scenery download stopped making progress"),
    () => onState({ slow: true })
  );
  onState({ phase: "world", message: "Preparing the coast" });
  await attempt.stage(
    () => scene.ready(state.worldSeed, attempt.signal),
    WORLD_STARTUP_TIMEOUT_MS,
    new StartupTimeoutError("world-startup-timeout", "World preparation timed out")
  );
  onState({ phase: "physics", message: "Preparing your arrival", degradedResources: [...degradedSurfaceResources] });
  const physics = await attempt.stage(
    () => PhysicsWorld.create(scene.staticCollisionProxies()),
    PHYSICS_STARTUP_TIMEOUT_MS,
    new StartupTimeoutError("physics-startup-timeout", "Path preparation timed out"),
    undefined,
    late => late.dispose()
  );
  attempt.check();
  return physics;
}
