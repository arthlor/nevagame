import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import type { ItemId } from "../../src/simulation/core/types";

const PRODUCE = "produce.wheat" as ItemId;
const BAIT = "item.bait_worms" as ItemId;

const satchelOf = (sim: Simulation) => sim.state.inventories[sim.state.player.inventoryId];

function stock(sim: Simulation, entries: Array<{ itemId: ItemId; quantity: number; quality?: "common" | "fine" | "exceptional" | "prize" }>): void {
  const satchel = satchelOf(sim);
  for (let i = 0; i < satchel.slots.length; i += 1) satchel.slots[i] = {};
  entries.forEach((entry, index) => {
    satchel.slots[index] = { itemId: entry.itemId, quantity: entry.quantity, quality: entry.quality };
  });
}

const lots = (sim: Simulation, itemId: ItemId): Map<string, number> =>
  new Map(
    InventoryManager.getItemLots(satchelOf(sim), itemId)
      .map((lot) => [lot.quality ?? "ungraded", lot.quantity])
  );

describe("inventory.discard", () => {
  it("destroys exactly the named graded lot", () => {
    const sim = new Simulation();
    stock(sim, [
      { itemId: PRODUCE, quantity: 2, quality: "prize" },
      { itemId: PRODUCE, quantity: 3, quality: "common" }
    ]);

    const result = sim.execute({ type: "inventory.discard", itemId: PRODUCE, quantity: 3, quality: "common" });

    expect(result).toMatchObject({ success: true, quantity: 3 });
    expect(lots(sim, PRODUCE).get("prize")).toBe(2);
    expect(lots(sim, PRODUCE).has("common")).toBe(false);
  });

  it("destroys the ungraded lot without spending graded stock", () => {
    const sim = new Simulation();
    stock(sim, [
      { itemId: PRODUCE, quantity: 2 },
      { itemId: PRODUCE, quantity: 3, quality: "common" }
    ]);

    const result = sim.execute({ type: "inventory.discard", itemId: PRODUCE, quantity: 2 });

    expect(result.success).toBe(true);
    expect(lots(sim, PRODUCE).has("ungraded")).toBe(false);
    expect(lots(sim, PRODUCE).get("common")).toBe(3);
  });

  it("refuses more than the named lot holds and touches nothing", () => {
    const sim = new Simulation();
    stock(sim, [
      { itemId: PRODUCE, quantity: 2, quality: "prize" },
      { itemId: PRODUCE, quantity: 5, quality: "common" }
    ]);
    const before = structuredClone(satchelOf(sim));

    const result = sim.execute({ type: "inventory.discard", itemId: PRODUCE, quantity: 3, quality: "prize" });

    expect(result.success).toBe(false);
    expect(satchelOf(sim)).toEqual(before);
  });

  it("refuses unknown items and invalid quantities", () => {
    const sim = new Simulation();
    stock(sim, [{ itemId: BAIT, quantity: 4 }]);

    for (const request of [
      { itemId: "item.not_real" as ItemId, quantity: 1 },
      { itemId: BAIT, quantity: 0 },
      { itemId: BAIT, quantity: -2 },
      { itemId: BAIT, quantity: 1.5 },
      { itemId: BAIT, quantity: Number.NaN }
    ]) {
      expect(sim.execute({ type: "inventory.discard", ...request }).success, JSON.stringify(request)).toBe(false);
    }
    expect(lots(sim, BAIT).get("ungraded")).toBe(4);
  });
});
