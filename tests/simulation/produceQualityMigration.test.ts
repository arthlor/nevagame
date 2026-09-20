import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { migrateKitchenAnchor48 } from "../../src/persistence/migrateKitchenAnchor48";
import { migrateProduceQuality49 } from "../../src/persistence/migrateProduceQuality49";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import type { GameState } from "../../src/simulation/core/types";
import shippedKitchenPose from "../fixtures/save_v47_layout21_kitchen_predecessor.json";

type Envelope = Parameters<typeof migrateSaveData>[0];

/**
 * These tests run the v47 -> v48 -> v49 segment directly instead of
 * `migrateSaveData`, which now continues into the concurrently authored
 * `migrateMainland50` and inherits that writer's in-progress world state. The
 * full shipping chain is covered by the persistence suites once the mainland
 * writer lands; this file protects the v49 contract itself.
 */
function v49State(state: unknown): GameState {
  return migrateProduceQuality49(migrateKitchenAnchor48(state as GameState));
}

describe("produce quality lots (v49)", () => {
  it("backfills common on legacy harvest lots only", () => {
    // Built on the retained v47 predecessor so the state matches the version
    // it is labelled with; a fresh current-shape state belongs to a later
    // schema that is being edited concurrently.
    const predecessor = structuredClone(shippedKitchenPose) as unknown as Envelope;
    const inventory = predecessor.state.inventories[predecessor.state.player.inventoryId];
    const emptySlots = inventory.slots.filter((slot) => !slot.itemId);
    const stacks: Array<[string, number]> = [
      ["produce.wheat", 4],
      ["item.ground_grain", 2],
      ["seed.wheat", 2]
    ];
    stacks.forEach(([itemId, quantity], index) => {
      emptySlots[index].itemId = itemId;
      emptySlots[index].quantity = quantity;
    });
    const seaBreamSlot = emptySlots[stacks.length];
    seaBreamSlot.itemId = "fish.sea_bream";
    seaBreamSlot.quantity = 1;

    const state = v49State(predecessor.state);
    expect(state.schemaVersion).toBe(49);
    const migratedInventory = state.inventories[state.player.inventoryId];
    const slotFor = (itemId: string) => migratedInventory.slots.find((slot) => slot.itemId === itemId)!;
    expect(slotFor("produce.wheat").quality).toBe("common");
    expect(slotFor("item.ground_grain").quality).toBeUndefined();
    expect(slotFor("seed.wheat").quality).toBeUndefined();
    expect(slotFor("fish.sea_bream").quality).toBeUndefined();
    expect(validateSaveEnvelope({ schemaVersion: 49, savedAtUtcMs: 1, state })).toBe(true);
    expect(migrateProduceQuality49(structuredClone(state)).schemaVersion).toBe(49);

    // The predecessor state must survive unchanged.
    for (const slot of predecessor.state.inventories[predecessor.state.player.inventoryId].slots) {
      expect(slot.quality).toBeUndefined();
    }
  });

  it("walks the retained v47 save into v49 with every harvest lot graded", () => {
    const shipped = structuredClone(shippedKitchenPose) as unknown as Envelope;
    const shippedInventory = shipped.state.inventories[shipped.state.player.inventoryId];
    const emptySlot = shippedInventory.slots.find((slot) => !slot.itemId)!;
    emptySlot.itemId = "produce.potato";
    emptySlot.quantity = 3;

    const state = v49State(shipped.state);
    expect(state.schemaVersion).toBe(49);
    expect(validateSaveEnvelope({ schemaVersion: 49, savedAtUtcMs: 1, state })).toBe(true);

    let graded = 0;
    for (const inventory of Object.values(state.inventories)) {
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
    expect(migrateProduceQuality49(structuredClone(state)).schemaVersion).toBe(49);
  });

  it("keeps v49 a real step of the shipping chain", () => {
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(49);
  });

  it("initializes the registry before grading checks", () => {
    ContentRegistry.initializeAndValidate();
    expect(InventoryManager.isGradableProduceItem("produce.wheat")).toBe(true);
    expect(InventoryManager.isGradableProduceItem("item.ground_grain")).toBe(false);
    expect(InventoryManager.isGradableProduceItem("fish.sea_bream")).toBe(false);
  });
});
