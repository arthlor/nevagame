import { afterEach, describe, expect, it, vi } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { RewardFeedbackPresentation } from "../../src/simulation/presentation/RewardFeedbackPresentation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { WorldLayout } from "../../src/world/WorldLayout";

describe("reward presentation", () => {
  afterEach(() => { vi.restoreAllMocks(); });
  it("suppresses loaded wealth and emits each successful state change once", () => {
    const sim = new Simulation();
    const feedback = new RewardFeedbackPresentation();
    expect(feedback.sample(sim.state)).toEqual([]);
    sim.state.player.money += 12;
    sim.state.player.proficiencies.fishing += 120;
    expect(InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [{ itemId: "produce.wheat", quantity: 3 }])).toBe(true);
    const rows = feedback.sample(sim.state, { x: 3, y: 1, z: 4 });
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "money", text: "+12 G", x: 3, z: 4 }),
      expect.objectContaining({ kind: "xp", text: "+120 Fishing" }),
      expect.objectContaining({ kind: "item", itemId: "produce.wheat", amount: 3 })
    ]));
    expect(feedback.sample(sim.state)).toEqual([]);
    feedback.reset();
    expect(feedback.sample(sim.state)).toEqual([]);
    sim.questDomain.dispose();
  });

  it("skips terrain on quiet market frames without skipping snapshots", () => {
    const state = createInitialGameState();
    state.player.workCapacity.current = 50;
    const feedback = new RewardFeedbackPresentation();
    const terrain = vi.spyOn(WorldLayout, "terrainHeight").mockReturnValue(7);
    expect(feedback.sample(state, undefined, "market.village")).toEqual([]);
    state.player.workCapacity.current += 0.4;
    expect(feedback.sample(state, undefined, "market.village")).toEqual([]);
    state.player.workCapacity.current += 0.4;
    expect(feedback.sample(state, undefined, "market.village")).toEqual([]);
    expect(terrain).not.toHaveBeenCalled();
    // Each quiet frame advanced the snapshot: 0.4 + 0.4 did not accumulate
    // into a visible unit. Only this frame's independently rounded delta pays.
    state.player.workCapacity.current += 0.6;
    const before = structuredClone(state);
    expect(feedback.sample(state, undefined, "market.village")).toEqual([
      expect.objectContaining({ kind: "work", amount: 1, text: "+1 Work", y: 8.2 })
    ]);
    expect(terrain).toHaveBeenCalledTimes(1);
    expect(state).toEqual(before);
  });

  it("resolves one market anchor for simultaneous gains and retains their order", () => {
    const state = createInitialGameState();
    const feedback = new RewardFeedbackPresentation();
    feedback.sample(state);
    state.player.money += 12;
    state.player.workCapacity.current -= 3;
    state.player.proficiencies.fishing += 120;
    expect(InventoryManager.addItemsAtomically(state.inventories[state.player.inventoryId], [
      { itemId: "produce.wheat", quantity: 3 }
    ])).toBe(true);
    state.journal.cropRecords["crop.wheat"] = { harvestedCount: 20, bestQuality: "prize" };
    const terrain = vi.spyOn(WorldLayout, "terrainHeight").mockReturnValue(7);
    const market = ContentRegistry.markets.get("market.village")!.interactionPosition;
    const point = { x: market.x, y: 8.2, z: market.z };
    const before = structuredClone(state);
    expect(feedback.sample(state, { x: -99, y: -99, z: -99 }, "market.village")).toEqual([
      { ...point, kind: "money", amount: 12, text: "+12 G" },
      { ...point, kind: "work", amount: -3, text: "−3 Work" },
      { ...point, kind: "item", itemId: "produce.wheat", amount: 3, text: "+3 Harvested Wheat" },
      { ...point, kind: "xp", amount: 120, text: "+120 Fishing" },
      { ...point, kind: "record", amount: 1, text: "Wheat mastery" },
      { ...point, kind: "record", amount: 1, text: "Show-quality grower" }
    ]);
    expect(terrain).toHaveBeenCalledExactlyOnceWith(market.x, market.z);
    expect(state).toEqual(before);
    expect(feedback.sample(state, undefined, "market.village")).toEqual([]);
    expect(terrain).toHaveBeenCalledTimes(1);
  });

  it("uses the current market or origin after quiet frames and market switches", () => {
    const state = createInitialGameState();
    const feedback = new RewardFeedbackPresentation();
    feedback.sample(state);
    const terrain = vi.spyOn(WorldLayout, "terrainHeight").mockReturnValue(5);
    expect(feedback.sample(state, undefined, "market.village")).toEqual([]);
    state.player.money += 1;
    const harbor = ContentRegistry.markets.get("market.harbor")!.interactionPosition;
    expect(feedback.sample(state, { x: 3, y: 4, z: 5 }, "market.harbor")).toEqual([
      { x: harbor.x, y: 6.2, z: harbor.z, kind: "money", amount: 1, text: "+1 G" }
    ]);
    expect(terrain).toHaveBeenCalledExactlyOnceWith(harbor.x, harbor.z);
    state.player.money -= 1;
    expect(feedback.sample(state, { x: 3, y: 4, z: 5 }, "market.missing")).toEqual([
      { x: 3, y: 5.2, z: 5, kind: "money", amount: -1, text: "−1 G" }
    ]);
    expect(terrain).toHaveBeenCalledTimes(1);
  });

  it("still announces a record earned on a zero-economy-delta frame once", () => {
    const state = createInitialGameState();
    const feedback = new RewardFeedbackPresentation();
    feedback.sample(state);
    state.journal.cropRecords["crop.wheat"] = { harvestedCount: 20 };
    const terrain = vi.spyOn(WorldLayout, "terrainHeight").mockReturnValue(0);
    expect(feedback.sample(state, undefined, "market.harbor")).toEqual([
      expect.objectContaining({ kind: "record", amount: 1, text: "Wheat mastery", y: 1.2 })
    ]);
    expect(terrain).toHaveBeenCalledTimes(1);
    expect(feedback.sample(state, undefined, "market.harbor")).toEqual([]);
    feedback.reset();
    expect(feedback.sample(state, undefined, "market.harbor")).toEqual([]);
    expect(terrain).toHaveBeenCalledTimes(1);
  });

});
