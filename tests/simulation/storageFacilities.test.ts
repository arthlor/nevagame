import { beforeEach, describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import {
  FRESHNESS_STORAGE_MODIFIERS,
  calculateFreshnessLoss,
  resolveCargoHasIce
} from "../../src/simulation/fishing/calculateFreshness";
import type { CargoClass, FishCargoId, GameState, StorageKind } from "../../src/simulation/core/types";

function carryCatch(
  sim: Simulation,
  cargoId: FishCargoId,
  speciesId: string,
  cargoClass: CargoClass
): void {
  sim.state.fishCargo[cargoId] = {
    id: cargoId,
    speciesId,
    weightKg: cargoClass === "gargantuan" ? 140 : 2,
    quality: "fine",
    caughtAtMinute: sim.state.clock.currentMinute,
    freshness: 100,
    cargoClass,
    location: { type: "player", containerId: "player" }
  };
  sim.state.player.carriedFishCargoId = cargoId;
}

function standAt(sim: Simulation, structureId: string): void {
  const structure = sim.state.world.structures[structureId];
  expect(structure, structureId).toBeDefined();
  sim.state.player.x = structure!.x;
  sim.state.player.z = structure!.z;
}

function earnCharter(sim: Simulation): void {
  if (!sim.state.quests.unlockedFeatureIds.includes("feature.maritime_guild_charter")) {
    sim.state.quests.unlockedFeatureIds.push("feature.maritime_guild_charter");
  }
}

function facility(sim: Simulation, kind: StorageKind) {
  return sim.inspectHoldStores().storage.find((entry) => entry.kind === kind)!;
}

function stow(sim: Simulation, cargoId: FishCargoId, kind: StorageKind) {
  return sim.execute({ type: "storage.store-fish", kind, cargoId });
}

function take(sim: Simulation, cargoId: FishCargoId, kind: StorageKind) {
  return sim.execute({ type: "storage.take-fish", kind, cargoId });
}

describe("authored storage facilities", () => {
  beforeEach(() => ContentRegistry.initializeAndValidate());

  it("reports finite capacities and reach for both authored facilities", () => {
    const sim = new Simulation();
    const crate = facility(sim, "crate");
    expect(crate).toMatchObject({
      structureId: "struct.kitchen",
      name: "Farm Crate",
      near: false
    });
    expect(crate.goods.totalSlots).toBe(8);
    expect(crate.fish).toMatchObject({ usedSlots: 0, totalSlots: 2 });

    const cold = facility(sim, "cold-storage");
    expect(cold).toMatchObject({ structureId: "struct.harbor_fish_table", name: "Harbor Cold Room" });
    expect(cold.fish.totalSlots).toBe(6);

    standAt(sim, "struct.kitchen");
    expect(facility(sim, "crate").near).toBe(true);
    expect(facility(sim, "cold-storage").near).toBe(false);
  });

  it("keeps the cold room locked until the harbor charter is earned", () => {
    const sim = new Simulation();
    standAt(sim, "struct.harbor_fish_table");
    expect(facility(sim, "cold-storage")).toMatchObject({
      locked: true,
      blockerReason: "Requires the maritime guild charter"
    });
    carryCatch(sim, "cargo.marlin", "fish.blue_marlin", "gargantuan");
    expect(stow(sim, "cargo.marlin", "cold-storage")).toMatchObject({
      success: false,
      reason: "Requires the maritime guild charter"
    });

    earnCharter(sim);
    expect(facility(sim, "cold-storage").locked).toBe(false);
    expect(stow(sim, "cargo.marlin", "cold-storage").success).toBe(true);
  });

  it("stores and collects a carried catch at the farm crate", () => {
    const sim = new Simulation();
    standAt(sim, "struct.kitchen");
    carryCatch(sim, "cargo.carp", "fish.carp", "small");
    const stored: string[] = [];
    sim.events.on("CargoStored", (event) => stored.push(event.facility));

    expect(stow(sim, "cargo.carp", "crate").success).toBe(true);
    expect(stored).toEqual(["crate"]);
    expect(sim.state.player.carriedFishCargoId).toBeNull();
    expect(sim.state.fishCargo["cargo.carp"].location).toEqual({
      type: "crate",
      containerId: "struct.kitchen"
    });
    expect(facility(sim, "crate").fish.usedSlots).toBe(1);

    expect(take(sim, "cargo.carp", "crate").success).toBe(true);
    expect(sim.state.player.carriedFishCargoId).toBe("cargo.carp");
    expect(sim.state.fishCargo["cargo.carp"].location.type).toBe("player");
    expect(facility(sim, "crate").fish.usedSlots).toBe(0);
  });

  it("refuses a full crate and a class the cold room can but the crate cannot", () => {
    const sim = new Simulation();
    standAt(sim, "struct.kitchen");
    for (const id of ["cargo.carp_a", "cargo.carp_b"] as const) {
      carryCatch(sim, id, "fish.carp", "small");
      expect(stow(sim, id, "crate").success).toBe(true);
    }
    carryCatch(sim, "cargo.carp_c", "fish.carp", "small");
    expect(stow(sim, "cargo.carp_c", "crate")).toMatchObject({
      success: false,
      reason: "The Farm Crate is full"
    });

    standAt(sim, "struct.harbor_fish_table");
    earnCharter(sim);
    carryCatch(sim, "cargo.marlin", "fish.blue_marlin", "gargantuan");
    expect(stow(sim, "cargo.marlin", "crate")).toMatchObject({ success: false });
    expect(stow(sim, "cargo.marlin", "cold-storage").success).toBe(true);
    expect(sim.state.fishCargo["cargo.marlin"].location).toEqual({
      type: "cold-storage",
      containerId: "struct.harbor_fish_table"
    });
  });

  it("requires proximity, empty hands and a carried catch", () => {
    const sim = new Simulation();
    carryCatch(sim, "cargo.far", "fish.carp", "small");
    expect(stow(sim, "cargo.far", "crate")).toMatchObject({
      success: false,
      reason: "Move closer to the Farm Crate"
    });

    standAt(sim, "struct.kitchen");
    expect(take(sim, "cargo.far", "crate")).toMatchObject({
      success: false,
      reason: "Your hands are already full"
    });
    expect(stow(sim, "cargo.far", "crate").success).toBe(true);
    earnCharter(sim);
    expect(take(sim, "cargo.far", "cold-storage")).toMatchObject({
      success: false,
      reason: "That catch is not in this storage"
    });
    expect(take(sim, "cargo.far", "crate").success).toBe(true);
    carryCatch(sim, "cargo.hands", "fish.carp", "small");
    expect(stow(sim, "cargo.far", "crate")).toMatchObject({
      success: false,
      reason: "Carry this catch to the storage first"
    });
  });

  it("moves graded goods in and out of the storage inventory", () => {
    const sim = new Simulation();
    standAt(sim, "struct.kitchen");
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    expect(InventoryManager.addItemsAtomically(inventory, [
      { itemId: "produce.wheat", quantity: 3, quality: "prize" }
    ])).toBe(true);

    const deposit = sim.execute({
      type: "storage.deposit-item",
      kind: "crate",
      itemId: "produce.wheat",
      quantity: 3
    });
    expect(deposit).toMatchObject({ success: true, quantity: 3 });
    expect(InventoryManager.getItemCount(inventory, "produce.wheat")).toBe(0);
    const crateStock = facility(sim, "crate").goods.stock;
    expect(crateStock).toEqual([expect.objectContaining({ itemId: "produce.wheat", count: 3 })]);

    const storageInventory = sim.state.inventories["inv.storage.crate"];
    expect(InventoryManager.getItemLotCount(storageInventory, "produce.wheat", "prize")).toBe(3);

    const withdraw = sim.execute({
      type: "storage.withdraw-item",
      kind: "crate",
      itemId: "produce.wheat",
      quantity: 2
    });
    expect(withdraw).toMatchObject({ success: true, quantity: 2 });
    expect(InventoryManager.getItemLotCount(inventory, "produce.wheat", "prize")).toBe(2);
    expect(facility(sim, "crate").goods.usedSlots).toBe(1);
  });

  it("keeps the crate the ice-resolving and cold room the refrigerated location", () => {
    expect(FRESHNESS_STORAGE_MODIFIERS.crate).toBe(1 - 0.1);
    expect(FRESHNESS_STORAGE_MODIFIERS["cold-storage"]).toBeLessThan(FRESHNESS_STORAGE_MODIFIERS.crate);

    const sim = new Simulation();
    standAt(sim, "struct.kitchen");
    carryCatch(sim, "cargo.cold", "fish.carp", "small");
    expect(stow(sim, "cargo.cold", "crate").success).toBe(true);
    const cargo = sim.state.fishCargo["cargo.cold"];
    expect(resolveCargoHasIce(sim.state, cargo)).toBe(false);
    const withoutIce = calculateFreshnessLoss(60, 0.1, "crate", false, 20);
    const withIce = calculateFreshnessLoss(60, 0.1, "crate", true, 20);
    expect(withIce).toBeLessThan(withoutIce);
    expect(calculateFreshnessLoss(60, 0.1, "cold-storage", false, 20)).toBeLessThan(withIce);

    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.crushed_ice", quantity: 1 }]);
    expect(sim.execute({
      type: "storage.deposit-item",
      kind: "crate",
      itemId: "item.crushed_ice",
      quantity: 1
    }).success).toBe(true);
    expect(resolveCargoHasIce(sim.state, cargo)).toBe(true);
  });

  it("keeps stored cargo and goods through save validation and reload", () => {
    const sim = new Simulation();
    standAt(sim, "struct.harbor_fish_table");
    earnCharter(sim);
    carryCatch(sim, "cargo.marlin", "fish.blue_marlin", "gargantuan");
    expect(stow(sim, "cargo.marlin", "cold-storage").success).toBe(true);
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "produce.olive", quantity: 2, quality: "fine" }]);
    expect(sim.execute({
      type: "storage.deposit-item",
      kind: "cold-storage",
      itemId: "produce.olive",
      quantity: 2
    }).success).toBe(true);

    const envelope = {
      schemaVersion: sim.state.schemaVersion,
      savedAtUtcMs: 1,
      state: structuredClone(sim.state)
    };
    expect(envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(validateSaveEnvelope(envelope)).toBe(true);

    const reloaded = new Simulation(structuredClone(envelope.state) as GameState);
    expect(reloaded.state.fishCargo["cargo.marlin"].location.type).toBe("cold-storage");
    expect(facility(reloaded, "cold-storage").fish.usedSlots).toBe(1);
    expect(facility(reloaded, "cold-storage").goods.stock).toEqual([
      expect.objectContaining({ itemId: "produce.olive", count: 2 })
    ]);
    standAt(reloaded, "struct.harbor_fish_table");
    expect(take(reloaded, "cargo.marlin", "cold-storage").success).toBe(true);
  });
});
