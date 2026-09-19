import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import shippedKitchenPose from "../fixtures/save_v47_layout21_kitchen_predecessor.json";

type Envelope = Parameters<typeof migrateSaveData>[0];

describe("produce quality lots (v49)", () => {
  it("backfills common on legacy harvest lots only", () => {
    const sim = new Simulation();
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [
      { itemId: "produce.wheat", quantity: 4 },
      { itemId: "item.ground_grain", quantity: 2 },
      { itemId: "seed.wheat", quantity: 2 }
    ]);
    const seaBreamSlot = inventory.slots.find((slot) => !slot.itemId)!;
    seaBreamSlot.itemId = "fish.sea_bream";
    seaBreamSlot.quantity = 1;

    const envelope = {
      schemaVersion: 48,
      savedAtUtcMs: 1,
      state: structuredClone(sim.state)
    } as unknown as Envelope;
    envelope.state.schemaVersion = 48;

    const migrated = migrateSaveData(envelope);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const migratedInventory = migrated.state.inventories[migrated.state.player.inventoryId];
    const slotFor = (itemId: string) => migratedInventory.slots.find((slot) => slot.itemId === itemId)!;
    expect(slotFor("produce.wheat").quality).toBe("common");
    expect(slotFor("item.ground_grain").quality).toBeUndefined();
    expect(slotFor("seed.wheat").quality).toBeUndefined();
    expect(slotFor("fish.sea_bream").quality).toBeUndefined();
    expect(validateSaveEnvelope(migrated)).toBe(true);
    expect(migrateSaveData(structuredClone(migrated)).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    // The predecessor envelope must survive unchanged.
    const original = envelope.state.inventories[envelope.state.player.inventoryId];
    for (const slot of original.slots) {
      expect(slot.quality).toBeUndefined();
    }
  });

  it("walks the retained v47 save through the chain with every harvest lot graded", () => {
    const envelope = structuredClone(shippedKitchenPose) as unknown as Envelope;
    const shippedInventory = envelope.state.inventories[envelope.state.player.inventoryId];
    const emptySlot = shippedInventory.slots.find((slot) => !slot.itemId)!;
    emptySlot.itemId = "produce.potato";
    emptySlot.quantity = 3;
    const migrated = migrateSaveData(envelope);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(validateSaveEnvelope(migrated)).toBe(true);

    let graded = 0;
    for (const inventory of Object.values(migrated.state.inventories)) {
      for (const slot of inventory.slots) {
        if (!slot.itemId) continue;
        if (InventoryManager.isGradableProduceItem(slot.itemId)) {
          expect(slot.quality, slot.itemId).toBe("common");
          graded += 1;
        } else {
          expect(slot.quality, slot.itemId).toBeUndefined();
        }
      }
    }
    expect(graded).toBeGreaterThan(0);
    expect(migrateSaveData(structuredClone(migrated)).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("initializes the registry before grading checks", () => {
    ContentRegistry.initializeAndValidate();
    expect(InventoryManager.isGradableProduceItem("produce.wheat")).toBe(true);
    expect(InventoryManager.isGradableProduceItem("item.ground_grain")).toBe(false);
    expect(InventoryManager.isGradableProduceItem("fish.sea_bream")).toBe(false);
  });
});
