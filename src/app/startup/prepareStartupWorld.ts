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
  onState({ phase: "layout", message: "Preparing the coast", subMessage: "Preparing paths and places" });
  const assetIds = await attempt.stage(
    () => WorldScene.prepareStartupAssetIds(state, attempt.signal),
    WORLD_STARTUP_TIMEOUT_MS,
    new StartupTimeoutError("world-startup-timeout", "Island preparation timed out"),
    () => onState({ slow: true })
  );
  const directModels = WorldScene.startupDirectModels();
  const totalAssets = assetIds.length + directModels.length;
  onState({
    phase: "assets",
    loadedAssets: 0,
    totalAssets,
    message: "Loading scenery",
    subMessage: `Gathering coastal scenery (0 of ${totalAssets})`
  });
  await attempt.stage(
    async reportProgress => {
      const updateProgress = (completed: number): void => {
        if (attempt.signal.aborted) return;
        onState({
          loadedAssets: completed,
          totalAssets,
          progress: { kind: "measured", completed, total: totalAssets },
          subMessage: `Gathering coastal scenery (${completed} of ${totalAssets})`
        });
      };
      await AssetLoader.preload(assetIds, progress => updateProgress(progress.completed), 6,
        attempt.signal, reportProgress);
      await AssetLoader.preloadDirect(directModels,
        progress => updateProgress(assetIds.length + progress.completed), 3,
        attempt.signal, reportProgress);
    },
    ASSET_PROGRESS_STALL_TIMEOUT_MS,
    new StartupTimeoutError("asset-loading-stalled", "Scenery download stopped making progress"),
    () => onState({ slow: true })
  );
  attempt.check();
  performance.mark("neva.startup.scenery-ready");
  // This is also the earliest point where the optional new-game film may
  // buffer without competing with required scenery transfers.
  onState({ phase: "world", message: "Preparing the coast", subMessage: "Preparing land and water" });
  await attempt.stage(
    progress => scene.prepareGeometry(state.worldSeed, attempt.signal, progress),
    WORLD_STARTUP_TIMEOUT_MS,
    new StartupTimeoutError("world-startup-timeout", "World preparation timed out"),
    () => onState({ slow: true })
  );
  performance.mark("neva.startup.geometry-ready");
  attempt.check();
  onState({ phase: "world", message: "Preparing the coast", subMessage: "Placing farms, villages, and coastal scenery" });
  await attempt.stage(
    () => scene.ready(state.worldSeed, attempt.signal),
    WORLD_STARTUP_TIMEOUT_MS,
    new StartupTimeoutError("world-startup-timeout", "World preparation timed out"),
    () => onState({ slow: true })
  );
  performance.mark("neva.startup.population-ready");
  onState({
    phase: "physics",
    message: "Preparing your arrival",
    subMessage: "Checking the paths",
    degradedResources: [...degradedSurfaceResources]
  });
  const physics = await attempt.stage(
    () => PhysicsWorld.create(scene.staticCollisionProxies()),
    PHYSICS_STARTUP_TIMEOUT_MS,
    new StartupTimeoutError("physics-startup-timeout", "Path preparation timed out"),
    () => onState({ slow: true }),
    late => late.dispose()
  );
  attempt.check();
  return physics;
}
