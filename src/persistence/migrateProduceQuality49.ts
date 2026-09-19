import type { GameState } from "../simulation/core/types";
import { InventoryManager } from "../simulation/inventory/InventoryManager";

/**
 * v48 -> v49. Produce stacks gained an optional harvest grade so a sale can
 * price a Prize bushel above a Common one. Saves written before this version
 * hold ungraded stacks; an absent grade quotes at exactly the common rate, so
 * the migration backfills `common` only for raw produce lots to make the
 * saved shape explicit and the satchel reading uniform.
 *
 * Fish items stay ungraded (their quality lives in cargo), and seeds,
 * processed goods, equipment and every other stack keep whatever they had.
 * Positions, quantities, markets, crops, quests and RNG are untouched, and the
 * migration never mutates its input.
 */
export function migrateProduceQuality49(previous: GameState): GameState {
  const state = structuredClone(previous);
  state.schemaVersion = 49;
  for (const inventory of Object.values(state.inventories)) {
    for (const slot of inventory.slots) {
      if (!slot.itemId || slot.quality !== undefined) continue;
      if (InventoryManager.isGradableProduceItem(slot.itemId)) {
        slot.quality = "common";
      }
    }
  }
  return state;
}
