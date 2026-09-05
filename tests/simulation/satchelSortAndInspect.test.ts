import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import type { ItemId } from "../../src/simulation/core/types";

const satchelOf = (sim: Simulation) => sim.state.inventories[sim.state.player.inventoryId];

/** Total of every item held, regardless of how the slots are arranged. */
function totals(sim: Simulation): Map<string, number> {
  const out = new Map<string, number>();
  for (const slot of satchelOf(sim).slots) {
    const quantity = InventoryManager.getSlotQuantity(slot);
    if (!slot.itemId || quantity <= 0) continue;
    out.set(slot.itemId, (out.get(slot.itemId) ?? 0) + quantity);
  }
  return out;
}

function layout(sim: Simulation, entries: Array<[string, number] | null>): void {
  const satchel = satchelOf(sim);
  for (let i = 0; i < satchel.slots.length; i += 1) {
    const entry = entries[i];
    satchel.slots[i] = entry ? { itemId: entry[0] as ItemId, quantity: entry[1] } : {};
  }
}

describe("satchel auto-sort", () => {
  it("preserves every item total exactly while rearranging slots", () => {
    const sim = new Simulation();
    layout(sim, [
      ["seed.wheat", 3], null, ["item.bait_worms", 2], null,
      ["seed.wheat", 4], ["seed.carrot", 1], null, ["item.bait_worms", 5]
    ]);
    const before = totals(sim);

    expect(sim.execute({ type: "inventory.sort-satchel" }).success).toBe(true);

    const after = totals(sim);
    expect(after).toEqual(before);
    // Nothing may appear from nowhere either.
    expect([...after.keys()].sort()).toEqual(["item.bait_worms", "seed.carrot", "seed.wheat"]);
  });

  it("merges part-stacks of the same item rather than leaving them scattered", () => {
    const sim = new Simulation();
    layout(sim, [["seed.wheat", 3], null, ["seed.wheat", 4], null, ["seed.wheat", 1]]);

    sim.execute({ type: "inventory.sort-satchel" });

    const occupied = satchelOf(sim).slots.filter((s) => s.itemId);
    const limit = ContentRegistry.items.get("seed.wheat")!.stackLimit;
    // 8 wheat fits one stack unless the limit is smaller than that.
    expect(occupied.length).toBe(Math.ceil(8 / limit));
    expect(totals(sim).get("seed.wheat")).toBe(8);
  });

  it("never exceeds an item's stack limit when merging", () => {
    const sim = new Simulation();
    const limit = ContentRegistry.items.get("seed.wheat")!.stackLimit;
    layout(sim, [["seed.wheat", limit], ["seed.wheat", limit], ["seed.wheat", 2]]);

    sim.execute({ type: "inventory.sort-satchel" });

    for (const slot of satchelOf(sim).slots) {
      if (slot.itemId === "seed.wheat") {
        expect(InventoryManager.getSlotQuantity(slot)).toBeLessThanOrEqual(limit);
      }
    }
    expect(totals(sim).get("seed.wheat")).toBe(limit * 2 + 2);
  });

  it("packs goods to the front and leaves the empty slots trailing", () => {
    const sim = new Simulation();
    layout(sim, [null, null, ["seed.carrot", 1], null, ["item.bait_worms", 1]]);

    sim.execute({ type: "inventory.sort-satchel" });

    const slots = satchelOf(sim).slots;
    const firstEmpty = slots.findIndex((s) => !s.itemId);
    // Once the first gap appears, everything after it must also be empty.
    expect(slots.slice(firstEmpty).every((s) => !s.itemId)).toBe(true);
  });

  it("is idempotent: sorting an already-sorted satchel changes nothing", () => {
    const sim = new Simulation();
    layout(sim, [["seed.wheat", 2], null, ["seed.carrot", 3], ["item.bait_worms", 1]]);

    sim.execute({ type: "inventory.sort-satchel" });
    const once = JSON.stringify(satchelOf(sim).slots);
    sim.execute({ type: "inventory.sort-satchel" });
    expect(JSON.stringify(satchelOf(sim).slots)).toBe(once);
  });

  it("declines an empty satchel instead of reporting a pointless success", () => {
    const sim = new Simulation();
    layout(sim, []);
    const result = sim.execute({ type: "inventory.sort-satchel" });
    expect(result.success).toBe(false);
    expect(result.reason).toContain("empty");
  });
});

describe("satchel item inspection", () => {
  it("reports catalogue trade value, stack limit and lore from the definition", () => {
    const sim = new Simulation();
    const definition = ContentRegistry.items.get("seed.wheat")!;
    const card = sim.inspectItem("seed.wheat")!;

    expect(card.name).toBe(definition.name);
    expect(card.baseValue).toBe(definition.baseValue);
    expect(card.stackLimit).toBe(definition.stackLimit);
    expect(card.loreText).toBe(definition.description);
  });

  it("returns null for an item the registry does not know", () => {
    const sim = new Simulation();
    expect(sim.inspectItem("item.not_a_real_thing" as ItemId)).toBeNull();
  });

  it("ranks species rarity off encounter weight, and leaves ordinary goods unranked", () => {
    const sim = new Simulation();
    // A common species and a scarce one must not land in the same band.
    const carp = sim.inspectItem("fish.carp")!;
    const marlin = sim.inspectItem("fish.blue_marlin")!;
    expect(carp.rarity).not.toBeNull();
    expect(marlin.rarity).not.toBeNull();
    expect(marlin.rarity!.encounterWeight).toBeLessThan(carp.rarity!.encounterWeight);
    const order = ["common", "uncommon", "rare", "prized"];
    expect(order.indexOf(marlin.rarity!.tier)).toBeGreaterThan(order.indexOf(carp.rarity!.tier));

    // Price is not rarity: a plain good carries no rank at all.
    expect(sim.inspectItem("seed.wheat")!.rarity).toBeNull();
  });

  it("carries the crop's real growing requirements on both seed and produce", () => {
    const sim = new Simulation();
    const crop = ContentRegistry.crops.get("crop.wheat")!;

    const seedCard = sim.inspectItem(crop.seedItemId)!;
    expect(seedCard.agronomy).not.toBeNull();
    expect(seedCard.agronomy!.waterNeed).toBe(crop.waterNeed);
    expect(seedCard.agronomy!.growthMinutes).toBe(crop.baseGrowthMinutes);
    expect(seedCard.agronomy!.yieldMin).toBe(crop.baseYield.min);
    expect(seedCard.agronomy!.preferredClimates).toEqual(crop.preferredClimates);

    const produceCard = sim.inspectItem(crop.harvestItemId)!;
    expect(produceCard.agronomy?.cropId).toBe(crop.id);
  });

  it("leaves agronomy null for something that never grows", () => {
    const sim = new Simulation();
    expect(sim.inspectItem("item.bait_worms")!.agronomy).toBeNull();
  });

  it("reports live spoilage only for a catch actually in hand", () => {
    const sim = new Simulation();
    expect(sim.inspectItem("fish.trout")!.freshness).toBeNull();

    sim.state.fishCargo["cargo.test" as keyof typeof sim.state.fishCargo] = {
      id: "cargo.test",
      speciesId: "fish.trout",
      weightKg: 2.4,
      quality: "fine",
      caughtAtMinute: 0,
      freshness: 71,
      cargoClass: "small",
      location: { type: "player" }
    } as never;

    const card = sim.inspectItem("fish.trout")!;
    expect(card.freshness).not.toBeNull();
    expect(card.freshness!.percent).toBe(71);
    expect(card.freshness!.label).toBe("Good");
    expect(card.freshness!.decayRate).toBeGreaterThan(0);
  });

  it("never mutates state while inspecting", () => {
    const sim = new Simulation();
    const before = JSON.stringify(sim.state.inventories);
    sim.inspectItem("seed.wheat");
    sim.inspectItem("fish.carp");
    expect(JSON.stringify(sim.state.inventories)).toBe(before);
  });
});
