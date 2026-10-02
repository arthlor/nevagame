import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import type { GameState } from "../../src/simulation/core/types";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { buildContextualHotbar } from "../../src/simulation/presentation/WorldHudPresentation";

describe("contextual hotbar stock queries", () => {
  let initial: GameState;
  let state: GameState;

  beforeAll(() => { initial = createInitialGameState(); });
  beforeEach(() => { state = structuredClone(initial); });
  afterEach(() => { vi.restoreAllMocks(); });

  function stockSatchel(): void {
    const inventory = state.inventories[state.player.inventoryId];
    inventory.slots.splice(0, 5,
      { itemId: "seed.wheat", quantity: 3 },
      { itemId: "seed.carrot", quantity: 7 },
      { itemId: "item.basic_fertilizer", quantity: 4 },
      { itemId: "item.basic_lure", quantity: 2 },
      { itemId: "item.bait_worms", quantity: 8 }
    );
  }

  it("keeps every farming action and reads only the selected seeds and fertilizer", () => {
    stockSatchel();
    const count = vi.spyOn(InventoryManager, "getItemCount");
    const before = structuredClone(state);
    expect(buildContextualHotbar(state, "agronomy", "crop.carrot")).toEqual([
      {
        slot: 1, shortcutKey: "1", id: "tool.hoe",
        action: { type: "equip-tool", tool: "hands" },
        name: "Hand Tools", detail: "Harvest or clear withered crops",
        icon: "hoe", quantity: null, ready: true
      },
      {
        slot: 2, shortcutKey: "2", id: "tool.seeds",
        action: { type: "equip-tool", tool: "seeds" },
        name: "Seed Belt", detail: "Carrot (7)",
        icon: "seeds", quantity: 7, ready: true
      },
      {
        slot: 3, shortcutKey: "3", id: "tool.watering_can",
        action: { type: "equip-tool", tool: "watering-can" },
        name: "Watering Can", detail: "Water dry cultivated plots",
        icon: "water", quantity: null, ready: true
      },
      {
        slot: 4, shortcutKey: "4", id: "tool.fertilizer",
        action: { type: "equip-tool", tool: "fertilizer" },
        name: "Compost & Nutrients", detail: "Basic Fertilizer (4)",
        icon: "fertilizer", quantity: 4, ready: true
      },
      {
        slot: 5, shortcutKey: "5", id: "tool.harvest",
        action: { type: "equip-tool", tool: "harvest" },
        name: "Harvest Basket", detail: "Collect mature crop yields",
        icon: "harvest", quantity: null, ready: true
      }
    ]);
    expect(count.mock.calls.map((call) => call[1])).toEqual(["seed.carrot", "item.basic_fertilizer"]);
    expect(state).toEqual(before);
  });

  it("uses the first owned seed in content order and stops querying after finding it", () => {
    stockSatchel();
    const count = vi.spyOn(InventoryManager, "getItemCount");
    expect(buildContextualHotbar(state, "agronomy", null)[1]).toMatchObject({ detail: "Wheat (3)", quantity: 3, ready: true });
    expect(count.mock.calls.map((call) => call[1])).toEqual(["seed.wheat", "item.basic_fertilizer"]);
  });

  it("falls back when the selected crop is unknown or has no stock", () => {
    stockSatchel();
    for (const selected of ["crop.missing", "crop.tomato"]) {
      expect(buildContextualHotbar(state, "agronomy", selected)[1]).toMatchObject({ detail: "Wheat (3)", quantity: 3, ready: true });
    }
  });

  it("still rejects the entire invalid inventory and tolerates a missing satchel", () => {
    stockSatchel();
    state.inventories[state.player.inventoryId].slots[4].quantity = Number.NaN;
    expect(buildContextualHotbar(state, "agronomy", "crop.carrot")[1]).toMatchObject({ detail: "No seeds", quantity: null, ready: false });
    expect(buildContextualHotbar(state, "agronomy", "crop.carrot")[3]).toMatchObject({ detail: "No fertilizer", quantity: null, ready: false });
    delete state.inventories[state.player.inventoryId];
    expect(buildContextualHotbar(state, "agronomy", "crop.carrot")[1]).toMatchObject({ detail: "No seeds", quantity: null, ready: false });
  });

  it("reads fishing supplies without inspecting seed or fertilizer stock", () => {
    stockSatchel();
    const count = vi.spyOn(InventoryManager, "getItemCount");
    const slots = buildContextualHotbar(state, "angling", "crop.carrot");
    expect(slots.map((slot) => slot.id)).toEqual(["tool.rod", "tool.tackle", "tool.stow_rod"]);
    expect(slots[1]).toMatchObject({ quantity: 2, ready: true, active: false, detail: "Required for sport fishing · prepare" });
    expect(slots[2]).toMatchObject({ detail: "Put away the rod · Earthworms (8)" });
    expect(count.mock.calls.map((call) => call[1]).sort()).toEqual(["item.bait_worms", "item.basic_lure"]);
  });

  it("uses accessible vessel lure stock and keeps physical hold counts", () => {
    stockSatchel();
    state.player.activeBoatId = "boat.player_rowboat";
    state.inventories["inv.rowboat_supply"].slots[0] = { itemId: "item.basic_lure", quantity: 3 };
    state.boats["boat.player_rowboat"].fishCargoSlotIds = ["cargo.example", null];
    const count = vi.spyOn(InventoryManager, "getItemCount");
    const slots = buildContextualHotbar(state, "maritime", "crop.carrot");
    expect(slots.map((slot) => slot.id)).toEqual(["maritime.helm", "tool.rod", "tool.tackle", "maritime.cargo"]);
    expect(slots[2]).toMatchObject({ quantity: 5, ready: true });
    expect(slots[3]).toMatchObject({ quantity: 1, detail: "Hold 1/2 · Bait, ice and supplies" });
    expect(count.mock.calls.map((call) => call[1])).toEqual(["item.basic_lure", "item.basic_lure"]);
  });

  it("reflects in-place stock and lure preparation changes on the next query", () => {
    stockSatchel();
    const inventory = state.inventories[state.player.inventoryId];
    expect(buildContextualHotbar(state, "agronomy", "crop.carrot")[1].quantity).toBe(7);
    inventory.slots[1].quantity = 2;
    expect(buildContextualHotbar(state, "agronomy", "crop.carrot")[1].quantity).toBe(2);
    inventory.slots[1] = {};
    expect(buildContextualHotbar(state, "agronomy", "crop.carrot")[1].quantity).toBe(3);
    inventory.slots[3] = {};
    state.player.preparedLureItemId = "item.basic_lure";
    expect(buildContextualHotbar(state, "angling", null)[1]).toMatchObject({
      quantity: null, ready: true, active: true,
      detail: "Woven Lure out of reach · return to supplies or put away"
    });
  });

  it("does no stock work for exploration", () => {
    const count = vi.spyOn(InventoryManager, "getItemCount");
    expect(buildContextualHotbar(state, "explorer", "crop.carrot")).toEqual([]);
    expect(count).not.toHaveBeenCalled();
  });
});
