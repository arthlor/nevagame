import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import type { BoatId, ItemId } from "../../src/simulation/core/types";

const ITEM = "item.bait_worms" as ItemId;

function firstBoat(sim: Simulation): BoatId {
  const id = Object.keys(sim.state.boats)[0];
  expect(id, "the starter save must register a vessel").toBeTruthy();
  return id as BoatId;
}

const satchelOf = (sim: Simulation) => sim.state.inventories[sim.state.player.inventoryId];
const holdOf = (sim: Simulation, boatId: BoatId) =>
  sim.state.inventories[sim.state.boats[boatId].supplyInventoryId];

/** Total of one item across both stores; a transfer must never change it. */
const worldTotal = (sim: Simulation, boatId: BoatId): number =>
  InventoryManager.getItemCount(satchelOf(sim), ITEM)
  + InventoryManager.getItemCount(holdOf(sim, boatId), ITEM);

function stockSatchel(sim: Simulation, count: number): void {
  const satchel = satchelOf(sim);
  for (let i = 0; i < satchel.slots.length; i += 1) satchel.slots[i] = {};
  satchel.slots[0] = { itemId: ITEM, quantity: count };
}

describe("satchel <-> hold transfer", () => {
  it("moves goods to the hold and conserves the total exactly", () => {
    const sim = new Simulation();
    const boatId = firstBoat(sim);
    stockSatchel(sim, 6);
    const before = worldTotal(sim, boatId);

    const result = sim.execute({ type: "inventory.transfer", itemId: ITEM, quantity: 4, boatId, direction: "to-hold" });

    expect(result.success).toBe(true);
    expect(result.quantity).toBe(4);
    expect(InventoryManager.getItemCount(satchelOf(sim), ITEM)).toBe(2);
    expect(InventoryManager.getItemCount(holdOf(sim, boatId), ITEM)).toBe(4);
    expect(worldTotal(sim, boatId)).toBe(before);
  });

  it("moves goods back to the satchel", () => {
    const sim = new Simulation();
    const boatId = firstBoat(sim);
    stockSatchel(sim, 5);
    sim.execute({ type: "inventory.transfer", itemId: ITEM, quantity: 5, boatId, direction: "to-hold" });

    const result = sim.execute({ type: "inventory.transfer", itemId: ITEM, quantity: 3, boatId, direction: "to-satchel" });

    expect(result.success).toBe(true);
    expect(InventoryManager.getItemCount(satchelOf(sim), ITEM)).toBe(3);
    expect(InventoryManager.getItemCount(holdOf(sim, boatId), ITEM)).toBe(2);
  });

  it("moves what is there when asked for more than is held", () => {
    const sim = new Simulation();
    const boatId = firstBoat(sim);
    stockSatchel(sim, 2);

    const result = sim.execute({ type: "inventory.transfer", itemId: ITEM, quantity: 99, boatId, direction: "to-hold" });

    expect(result.success).toBe(true);
    expect(result.quantity).toBe(2);
    expect(worldTotal(sim, boatId)).toBe(2);
  });

  it("refuses an item that is not in the source store", () => {
    const sim = new Simulation();
    const boatId = firstBoat(sim);
    stockSatchel(sim, 0);
    satchelOf(sim).slots[0] = {};

    const result = sim.execute({ type: "inventory.transfer", itemId: ITEM, quantity: 1, boatId, direction: "to-hold" });

    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe("not-held");
  });

  it("puts the goods straight back when the destination has no room", () => {
    const sim = new Simulation();
    const boatId = firstBoat(sim);
    stockSatchel(sim, 3);
    // Fill every hold slot with something else so the batch cannot land.
    const hold = holdOf(sim, boatId);
    for (let i = 0; i < hold.slots.length; i += 1) {
      hold.slots[i] = { itemId: "item.basic_fertilizer" as ItemId, quantity: 1 };
    }
    const satchelBefore = InventoryManager.getItemCount(satchelOf(sim), ITEM);

    const result = sim.execute({ type: "inventory.transfer", itemId: ITEM, quantity: 3, boatId, direction: "to-hold" });

    if (!result.success) {
      // A refused transfer must cost the player nothing at all.
      expect(result.reasonCode).toBe("no-room");
      expect(InventoryManager.getItemCount(satchelOf(sim), ITEM)).toBe(satchelBefore);
    } else {
      // If the hold could absorb it after all, the total still has to hold.
      expect(worldTotal(sim, boatId)).toBe(satchelBefore);
    }
  });

  it("rejects non-positive and non-finite quantities", () => {
    const sim = new Simulation();
    const boatId = firstBoat(sim);
    stockSatchel(sim, 5);
    for (const quantity of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = sim.execute({ type: "inventory.transfer", itemId: ITEM, quantity, boatId, direction: "to-hold" });
      expect(result.success, `quantity ${quantity}`).toBe(false);
    }
    expect(InventoryManager.getItemCount(satchelOf(sim), ITEM)).toBe(5);
  });

  it("refuses an unregistered vessel without touching the satchel", () => {
    const sim = new Simulation();
    stockSatchel(sim, 4);
    const result = sim.execute({
      type: "inventory.transfer", itemId: ITEM, quantity: 1,
      boatId: "boat.not_real" as BoatId, direction: "to-hold"
    });
    expect(result.success).toBe(false);
    expect(InventoryManager.getItemCount(satchelOf(sim), ITEM)).toBe(4);
  });

  it("reports both stores as transfer rows on the ledger", () => {
    const sim = new Simulation();
    const boatId = firstBoat(sim);
    stockSatchel(sim, 7);
    sim.execute({ type: "inventory.transfer", itemId: ITEM, quantity: 3, boatId, direction: "to-hold" });

    const stores = sim.inspectHoldStores();
    expect(stores.satchelStock.find((row) => row.itemId === ITEM)?.count).toBe(4);
    const vessel = stores.vessels.find((v) => v.boatId === boatId)!;
    expect(vessel.stock.find((row) => row.itemId === ITEM)?.count).toBe(3);
  });
});
