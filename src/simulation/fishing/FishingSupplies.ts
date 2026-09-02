import type { BoatId, GameState, InventoryState, ItemId } from "../core/types";
import { InventoryManager } from "../inventory/InventoryManager";

/** Supplies within reach: satchel first, then the active or explicitly selected vessel. */
export function accessibleFishingSupplyInventories(
  state: Readonly<GameState>,
  vesselId: BoatId | null = state.player.activeBoatId ?? null
): InventoryState[] {
  const inventories: InventoryState[] = [];
  const satchel = state.inventories[state.player.inventoryId];
  if (satchel) inventories.push(satchel);
  const vessel = vesselId ? state.boats[vesselId] : undefined;
  const vesselInventory = vessel ? state.inventories[vessel.supplyInventoryId] : undefined;
  if (vesselInventory && vesselInventory.id !== satchel?.id) inventories.push(vesselInventory);
  return inventories;
}

export function accessibleFishingSupplyCount(
  state: Readonly<GameState>,
  itemId: ItemId,
  vesselId: BoatId | null = state.player.activeBoatId ?? null
): number {
  return accessibleFishingSupplyInventories(state, vesselId).reduce(
    (total, inventory) => total + InventoryManager.getItemCount(inventory, itemId),
    0
  );
}

/** Deterministic atomic preflight with satchel-first removal. */
export function consumeAccessibleFishingSupply(
  state: GameState,
  itemId: ItemId,
  quantity = 1,
  vesselId: BoatId | null = state.player.activeBoatId ?? null
): boolean {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) return false;
  const inventories = accessibleFishingSupplyInventories(state, vesselId);
  const removals = inventories.map((inventory) => ({
    inventory,
    quantity: Math.min(quantity, InventoryManager.getItemCount(inventory, itemId))
  }));
  let remaining = quantity;
  for (const removal of removals) {
    removal.quantity = Math.min(removal.quantity, remaining);
    remaining -= removal.quantity;
  }
  if (remaining > 0) return false;
  if (!removals.every(({ inventory, quantity: amount }) =>
    amount === 0 || InventoryManager.hasItems(inventory, [{ itemId, quantity: amount }])
  )) return false;
  for (const { inventory, quantity: amount } of removals) {
    if (amount > 0) InventoryManager.removeItemsAtomically(inventory, [{ itemId, quantity: amount }]);
  }
  return true;
}
