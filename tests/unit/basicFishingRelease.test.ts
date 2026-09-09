import { describe, expect, it, vi } from "vitest";
import { GameApp } from "../../src/app/GameApp";
import type { BasicFishingState, GameState } from "../../src/simulation/core/types";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";

describe("basic fishing release ownership", () => {
  it("does not mutate canonical cast state when presentation action admission rejects the release", () => {
    const basicFishing: BasicFishingState = {
      ecologyId: "ecology.neva",
      habitatId: "river",
      phase: "charging-cast",
      remainingSeconds: 0,
      willCatch: false,
      castPower: 0.42,
      isChargingCast: true,
      castChargeDirection: 1
    };
    const before = structuredClone(basicFishing);
    const startFarmingAction = vi.fn();
    const app = {
      mode: "basic-fishing",
      basicCastSource: "primary",
      sim: {
        state: {
          basicFishing,
          player: { x: 10, z: 20, rotationY: 0 }
        }
      },
      modeController: {
        mode: "basic-fishing",
        pausesSimulation: false,
        blocksWorldInput: false
      },
      startFarmingAction
    } as unknown as GameApp;

    const release = (GameApp.prototype as unknown as {
      releaseBasicFishingCast: (power?: number) => void;
    }).releaseBasicFishingCast;

    release.call(app, 0.88);

    expect(basicFishing).toEqual(before);
    expect(startFarmingAction).toHaveBeenCalledTimes(1);
    expect(startFarmingAction.mock.calls[0]?.[0]).toBe("cast");
    expect((app as unknown as { basicCastSource: string | null }).basicCastSource).toBe("primary");
  });

  it("does not rotate the player before rejecting an overlapping presentation action", () => {
    const facePlayerToward = vi.fn();
    const setToast = vi.fn();
    const app = {
      farmingActions: { isActive: true },
      lockedInteractionTarget: { id: "stale-target" },
      facePlayerToward,
      setToast,
      sim: { state: { player: { activeMountId: null } } }
    } as unknown as GameApp;

    const start = (GameApp.prototype as unknown as {
      startFarmingAction: (...args: unknown[]) => void;
    }).startFarmingAction;

    start.call(app, "cast", 1, 2, () => ({ success: true }), 0);

    expect(facePlayerToward).not.toHaveBeenCalled();
    expect(setToast).toHaveBeenCalledWith("Finish the current action first");
  });

  it("defers an event-triggered autosave until the complete command has returned", async () => {
    const state = createInitialGameState();
    const snapshots: GameState[] = [];
    const saveGame = vi.fn(async (candidate: typeof state) => {
      snapshots.push(structuredClone(candidate));
      return true;
    });
    const flushAutosave = (GameApp.prototype as unknown as {
      flushAutosave: () => Promise<void>;
    }).flushAutosave;
    const app = {
      isRunning: true,
      bootReady: true,
      persistenceDisabled: false,
      durableWritesEnabled: true,
      autosaveInFlight: false,
      autosaveRequested: false,
      autosaveFlushQueued: false,
      lastAutosaveMs: 0,
      saveRepo: { saveGame },
      sim: { state },
      flushAutosave
    } as unknown as GameApp;

    const requestAutosave = (GameApp.prototype as unknown as {
      requestAutosave: () => void;
    }).requestAutosave;

    // This models a FishLanded listener requesting a save before the enclosing
    // physical/basic catch transaction finishes its journal update.
    requestAutosave.call(app);
    state.journal.fishRecords["fish.perch"] = {
      discovered: true,
      catchCount: 1,
      firstCaughtMinute: state.clock.currentMinute
    };

    await Promise.resolve();
    await Promise.resolve();

    expect(saveGame).toHaveBeenCalledTimes(1);
    expect(snapshots[0]?.journal.fishRecords["fish.perch"]).toMatchObject({
      discovered: true,
      catchCount: 1
    });
  });
});
