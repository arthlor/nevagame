import { PLAYER_SATCHEL_SLOT_COUNT } from "../simulation/inventory/InventoryLimits";
import type { GameState } from "../simulation/core/types";

/**
 * Gives the player satchel `PLAYER_SATCHEL_SLOT_COUNT` empty slots when a save
 * still has fewer. Existing lots stay in place. Boat, storage and other
 * inventories keep the counts they were saved with. Layout is unchanged.
 */
export function migrateSatchelSlots77(state: GameState): GameState {
  const inventoryId = state.player?.inventoryId;
  const inventory = inventoryId ? state.inventories?.[inventoryId] : undefined;
  if (inventory && Array.isArray(inventory.slots)) {
    const target = Math.max(inventory.slotCount, inventory.slots.length, PLAYER_SATCHEL_SLOT_COUNT);
    while (inventory.slots.length < target) inventory.slots.push({});
    inventory.slotCount = inventory.slots.length;
  }
  state.schemaVersion = 77;
  return state;
}
