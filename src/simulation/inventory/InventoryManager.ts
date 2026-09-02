// src/simulation/inventory/InventoryManager.ts

import { ContentRegistry } from "../../content/ContentRegistry";
import { InventoryId, InventorySlot, InventoryState, ItemId, ItemStack } from "../core/types";

export class InventoryManager {
  public static isValidItemStack(item: ItemStack): boolean {
    return (
      typeof item.itemId === "string" &&
      ContentRegistry.items.has(item.itemId) &&
      Number.isSafeInteger(item.quantity) &&
      item.quantity > 0
    );
  }

  public static isValidItemBatch(items: ItemStack[]): boolean {
    if (!Array.isArray(items) || items.length === 0) return false;
    const ids = new Set<string>();
    for (const item of items) {
      if (!this.isValidItemStack(item) || ids.has(item.itemId)) return false;
      ids.add(item.itemId);
    }
    return true;
  }

  public static isValidInventory(inventory: InventoryState): boolean {
    if (!Number.isSafeInteger(inventory.slotCount) || inventory.slotCount < 0 || inventory.slots.length !== inventory.slotCount) {
      return false;
    }
    return inventory.slots.every((slot) => {
      const empty = slot.itemId === undefined && slot.quantity === undefined;
      const quantity = slot.quantity;
      const populated =
        typeof slot.itemId === "string" &&
        ContentRegistry.items.has(slot.itemId) &&
        typeof quantity === "number" &&
        Number.isSafeInteger(quantity) &&
        quantity > 0 &&
        quantity <= ContentRegistry.items.get(slot.itemId)!.stackLimit;
      return empty || populated;
    });
  }

  /**
   * Returns the usable quantity represented by a slot.
   *
   * Empty slots intentionally omit both fields, so callers that project
   * inventory state into counts or DTOs must not read `quantity` directly.
   * Invalid numeric values are treated as empty here; mutation APIs still
   * reject the containing inventory through `isValidInventory`.
   */
  public static getSlotQuantity(slot: InventorySlot): number {
    return typeof slot.quantity === "number" && Number.isSafeInteger(slot.quantity) && slot.quantity > 0
      ? slot.quantity
      : 0;
  }

  /**
   * Creates a fresh empty inventory with specified slot count.
   */
  public static createInventory(id: InventoryId, slotCount: number): InventoryState {
    const slots: InventorySlot[] = [];
    for (let i = 0; i < slotCount; i++) {
      slots.push({});
    }
    return { id, slotCount, slots };
  }

  /**
   * Checks if the inventory has enough capacity to add the given items atomically.
   */
  public static canAddItems(inventory: InventoryState, items: ItemStack[]): boolean {
    if (!this.isValidInventory(inventory) || !this.isValidItemBatch(items)) return false;
    const clone = this.cloneInventory(inventory);
    for (const item of items) {
      const added = this.tryAddDirect(clone, item.itemId, item.quantity);
      if (added < item.quantity) {
        return false;
      }
    }
    return true;
  }

  /**
   * Atomically adds items to the inventory. If not all items fit, state remains untouched.
   */
  public static addItemsAtomically(inventory: InventoryState, items: ItemStack[]): boolean {
    if (!this.canAddItems(inventory, items)) {
      return false;
    }
    for (const item of items) {
      this.tryAddDirect(inventory, item.itemId, item.quantity);
    }
    return true;
  }

  /**
   * Checks if inventory contains required items.
   */
  public static hasItems(inventory: InventoryState, items: ItemStack[]): boolean {
    if (!this.isValidInventory(inventory) || !this.isValidItemBatch(items)) return false;
    const availableCounts: Record<ItemId, number> = {};
    for (const slot of inventory.slots) {
      if (slot.itemId && slot.quantity && slot.quantity > 0) {
        availableCounts[slot.itemId] = (availableCounts[slot.itemId] || 0) + slot.quantity;
      }
    }
    for (const req of items) {
      const count = availableCounts[req.itemId] || 0;
      if (count < req.quantity) {
        return false;
      }
    }
    return true;
  }

  /**
   * Atomically removes items from the inventory.
   */
  public static removeItemsAtomically(inventory: InventoryState, items: ItemStack[]): boolean {
    if (!this.hasItems(inventory, items)) {
      return false;
    }
    for (const item of items) {
      let needed = item.quantity;
      for (const slot of inventory.slots) {
        if (slot.itemId === item.itemId && slot.quantity && slot.quantity > 0) {
          const toRemove = Math.min(needed, slot.quantity);
          slot.quantity -= toRemove;
          needed -= toRemove;
          if (slot.quantity <= 0) {
            slot.itemId = undefined;
            slot.quantity = undefined;
          }
          if (needed <= 0) break;
        }
      }
    }
    return true;
  }

  public static canAddItemsAfterRemoving(
    inventory: InventoryState,
    toRemove: ItemStack[],
    toAdd: ItemStack[]
  ): boolean {
    if (!this.isValidItemBatch(toRemove) || !this.isValidItemBatch(toAdd)) return false;
    const clone = this.cloneInventory(inventory);
    if (!this.removeItemsAtomically(clone, toRemove)) {
      return false;
    }
    return this.canAddItems(clone, toAdd);
  }

  public static getItemCount(inventory: InventoryState, itemId: ItemId): number {
    if (!this.isValidInventory(inventory) || !ContentRegistry.items.has(itemId)) return 0;
    let total = 0;
    for (const slot of inventory.slots) {
      if (slot.itemId === itemId && slot.quantity) {
        total += slot.quantity;
      }
    }
    return total;
  }

  private static tryAddDirect(inventory: InventoryState, itemId: ItemId, quantity: number): number {
    const def = ContentRegistry.items.get(itemId);
    const stackLimit = def ? def.stackLimit : 99;
    let remaining = quantity;

    // 1. Try filling existing partial stacks
    for (const slot of inventory.slots) {
      if (slot.itemId === itemId && slot.quantity && slot.quantity < stackLimit) {
        const space = stackLimit - slot.quantity;
        const add = Math.min(remaining, space);
        slot.quantity += add;
        remaining -= add;
        if (remaining <= 0) return quantity;
      }
    }

    // 2. Try empty slots
    for (const slot of inventory.slots) {
      if (!slot.itemId || !slot.quantity || slot.quantity <= 0) {
        const add = Math.min(remaining, stackLimit);
        slot.itemId = itemId;
        slot.quantity = add;
        remaining -= add;
        if (remaining <= 0) return quantity;
      }
    }

    return quantity - remaining;
  }

  private static cloneInventory(inv: InventoryState): InventoryState {
    return {
      id: inv.id,
      slotCount: inv.slotCount,
      slots: inv.slots.map((s) => ({ ...s }))
    };
  }
}
