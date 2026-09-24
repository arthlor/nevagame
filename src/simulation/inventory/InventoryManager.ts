// src/simulation/inventory/InventoryManager.ts

import { ContentRegistry } from "../../content/ContentRegistry";
import { CropQuality, InventoryId, InventorySlot, InventoryState, ItemId, ItemStack } from "../core/types";
import { CROP_QUALITY_RANK, cropQualityRank } from "../farming/calculateCropGrowth";

/**
 * Stack identity is item plus harvest grade. Two Wheat lots of different
 * grades never merge, so a sale can price the Prize bushel above the Common
 * one. A missing grade is a valid, ungraded commodity: processed output and
 * legacy stacks.
 */
function lotKey(itemId: ItemId, quality: CropQuality | undefined): string {
  return `${itemId}|${quality ?? ""}`;
}

export class InventoryManager {
  /**
   * Only a raw crop harvest carries a grade, and that is exactly "some crop
   * lists this item as its harvest". The item categories alone cannot decide
   * it: wheat and barley are `grain`, flax is `crafting-material`, and a
   * basic-catch fish is a `produce` item that must stay fungible because its
   * per-instance quality belongs to the cargo lane.
   */
  public static isGradableProduceItem(itemId: ItemId): boolean {
    if (!ContentRegistry.items.has(itemId) || ContentRegistry.fishSpecies.has(itemId)) return false;
    for (const crop of ContentRegistry.crops.values()) {
      if (crop.harvestItemId === itemId) return true;
    }
    return false;
  }

  private static isValidProduceQuality(itemId: ItemId, quality: CropQuality): boolean {
    return (
      Object.prototype.hasOwnProperty.call(CROP_QUALITY_RANK, quality) &&
      this.isGradableProduceItem(itemId)
    );
  }

  public static isValidItemStack(item: ItemStack): boolean {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    return (
      typeof item.itemId === "string" &&
      ContentRegistry.items.has(item.itemId) &&
      Number.isSafeInteger(item.quantity) &&
      item.quantity > 0 &&
      (item.quality === undefined || this.isValidProduceQuality(item.itemId, item.quality))
    );
  }

  public static isValidItemBatch(items: ItemStack[]): boolean {
    if (!Array.isArray(items) || items.length === 0) return false;
    const keys = new Set<string>();
    for (const item of items) {
      if (!this.isValidItemStack(item)) return false;
      const key = lotKey(item.itemId, item.quality);
      if (keys.has(key)) return false;
      keys.add(key);
    }
    return true;
  }

  public static isValidInventory(inventory: InventoryState): boolean {
    if (
      !inventory ||
      typeof inventory !== "object" ||
      !Array.isArray(inventory.slots) ||
      !Number.isSafeInteger(inventory.slotCount) ||
      inventory.slotCount < 0 ||
      inventory.slots.length !== inventory.slotCount
    ) {
      return false;
    }
    // Array.every skips sparse holes; for-of exposes them as undefined so
    // malformed inventories are refused before any transaction can touch them.
    for (const slot of inventory.slots) {
      if (!slot || typeof slot !== "object") return false;
      const empty = slot.itemId === undefined && slot.quantity === undefined;
      const quantity = slot.quantity;
      const populated =
        typeof slot.itemId === "string" &&
        ContentRegistry.items.has(slot.itemId) &&
        typeof quantity === "number" &&
        Number.isSafeInteger(quantity) &&
        quantity > 0 &&
        quantity <= ContentRegistry.items.get(slot.itemId)!.stackLimit &&
        (slot.quality === undefined || this.isValidProduceQuality(slot.itemId, slot.quality));
      if (!empty && !populated) return false;
    }
    return true;
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
      const added = this.tryAddDirect(clone, item.itemId, item.quantity, item.quality);
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
      this.tryAddDirect(inventory, item.itemId, item.quantity, item.quality);
    }
    return true;
  }

  /**
   * Checks if inventory contains required items.
   *
   * A request without a grade accepts any lot. A graded request counts only
   * that lot, which is what let a graded sale or contract ask for one grade.
   */
  public static hasItems(inventory: InventoryState, items: ItemStack[]): boolean {
    if (!this.isValidInventory(inventory) || !this.isValidItemBatch(items)) return false;
    // Batch validation guarantees at most one request per exact grade and
    // one generic request per item. Check each graded reservation AND debit
    // a shared item total, so generic demand cannot count that stock twice.
    const remainingByItem = new Map<ItemId, number>();
    for (const req of items) {
      const remaining = remainingByItem.get(req.itemId) ?? this.getItemCount(inventory, req.itemId);
      if (remaining < req.quantity) return false;
      if (
        req.quality !== undefined &&
        this.getItemLotCount(inventory, req.itemId, req.quality) < req.quantity
      ) {
        return false;
      }
      remainingByItem.set(req.itemId, remaining - req.quantity);
    }
    return true;
  }

  /**
   * Atomically removes items from the inventory.
   *
   * An ungraded request consumes lowest grade first, so processing, contracts
   * and other generic consumption never spend the Prize bushel that could be
   * priced as one. Ties stay in slot order. A graded request consumes only
   * that lot.
   */
  public static removeItemsAtomically(inventory: InventoryState, items: ItemStack[]): boolean {
    if (!this.hasItems(inventory, items)) {
      return false;
    }
    // Satisfy exact-grade reservations first. Otherwise a generic request
    // could consume a reserved low-grade lot and leave a later request short
    // even though other grades could have satisfied the generic part.
    const ordered = [...items].sort((a, b) =>
      Number(a.quality === undefined) - Number(b.quality === undefined)
    );
    for (const item of ordered) {
      let needed = item.quantity;
      for (const slot of this.removalOrder(inventory, item.itemId, item.quality)) {
        if (needed <= 0) break;
        const available = this.getSlotQuantity(slot);
        const toRemove = Math.min(needed, available);
        slot.quantity = available - toRemove;
        needed -= toRemove;
        if ((slot.quantity ?? 0) <= 0) {
          slot.itemId = undefined;
          slot.quantity = undefined;
          slot.quality = undefined;
        }
      }
    }
    return true;
  }

  /**
   * Atomically removes from one exact lot.
   *
   * `quality === undefined` means the ungraded lot only — unlike
   * `removeItemsAtomically`, which treats an ungraded request as "lowest grade
   * first" and will spill into graded stock. Used by explicit moves and
   * destroys that name the lot they are touching, so a wipe can never consume
   * a different grade than the one the player selected.
   */
  public static removeItemLotAtomically(
    inventory: InventoryState,
    itemId: ItemId,
    quality: CropQuality | undefined,
    quantity: number
  ): boolean {
    if (!this.isValidInventory(inventory) || !ContentRegistry.items.has(itemId)) return false;
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return false;
    if (this.getItemLotCount(inventory, itemId, quality) < quantity) return false;
    let needed = quantity;
    for (const slot of inventory.slots) {
      if (needed <= 0) break;
      if (slot.itemId !== itemId || slot.quality !== quality) continue;
      const available = this.getSlotQuantity(slot);
      const toRemove = Math.min(needed, available);
      slot.quantity = available - toRemove;
      needed -= toRemove;
      if ((slot.quantity ?? 0) <= 0) {
        slot.itemId = undefined;
        slot.quantity = undefined;
        slot.quality = undefined;
      }
    }
    return true;
  }

  public static canAddItemsAfterRemoving(
    inventory: InventoryState,
    toRemove: ItemStack[],
    toAdd: ItemStack[]
  ): boolean {
    if (
      !this.isValidInventory(inventory) ||
      !this.isValidItemBatch(toRemove) ||
      !this.isValidItemBatch(toAdd)
    ) return false;
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
      if (slot.itemId === itemId) {
        total += this.getSlotQuantity(slot);
      }
    }
    return total;
  }

  /** Quantity of one item in one grade; `undefined` matches the ungraded lot. */
  public static getItemLotCount(
    inventory: InventoryState,
    itemId: ItemId,
    quality: CropQuality | undefined
  ): number {
    if (!this.isValidInventory(inventory)) return 0;
    let total = 0;
    for (const slot of inventory.slots) {
      if (slot.itemId === itemId && slot.quality === quality) {
        total += this.getSlotQuantity(slot);
      }
    }
    return total;
  }

  /** Every held lot of one item, in slot order. */
  public static getItemLots(
    inventory: InventoryState,
    itemId: ItemId
  ): Array<{ quality?: CropQuality; quantity: number }> {
    if (!this.isValidInventory(inventory)) return [];
    const lots: Array<{ quality?: CropQuality; quantity: number }> = [];
    for (const slot of inventory.slots) {
      const quantity = this.getSlotQuantity(slot);
      if (slot.itemId === itemId && quantity > 0) {
        lots.push(slot.quality === undefined ? { quantity } : { quality: slot.quality, quantity });
      }
    }
    return lots;
  }

  /** The exact lots a generic item debit will consume, including their grades. */
  public static planItemRemoval(
    inventory: InventoryState,
    itemId: ItemId,
    quantity: number
  ): ItemStack[] | null {
    if (!this.hasItems(inventory, [{ itemId, quantity }])) return null;
    const lots: ItemStack[] = [];
    let remaining = quantity;
    for (const slot of this.removalOrder(inventory, itemId, undefined)) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, this.getSlotQuantity(slot));
      if (take <= 0) continue;
      lots.push(slot.quality === undefined
        ? { itemId, quantity: take }
        : { itemId, quantity: take, quality: slot.quality });
      remaining -= take;
    }
    return remaining === 0 ? lots : null;
  }

  /**
   * The slots a removal may draw from, in the order it should draw.
   *
   * Ungraded requests walk lowest grade first; graded requests stay inside
   * their lot. Both are stable across saves because slot order is.
   */
  private static removalOrder(
    inventory: InventoryState,
    itemId: ItemId,
    quality: CropQuality | undefined
  ): InventorySlot[] {
    const matching = inventory.slots.filter(
      (slot) => slot.itemId === itemId && (quality === undefined || slot.quality === quality)
    );
    if (quality !== undefined) return matching;
    return matching
      .map((slot, index) => ({ slot, index }))
      .sort((a, b) => {
        const rankDelta = cropQualityRank(a.slot.quality) - cropQualityRank(b.slot.quality);
        return rankDelta !== 0 ? rankDelta : a.index - b.index;
      })
      .map((entry) => entry.slot);
  }

  private static tryAddDirect(
    inventory: InventoryState,
    itemId: ItemId,
    quantity: number,
    quality?: CropQuality
  ): number {
    const def = ContentRegistry.items.get(itemId);
    const stackLimit = def ? def.stackLimit : 99;
    let remaining = quantity;

    // 1. Try filling existing partial stacks of the same lot
    for (const slot of inventory.slots) {
      if (
        slot.itemId === itemId &&
        slot.quality === quality &&
        slot.quantity &&
        slot.quantity < stackLimit
      ) {
        const space = stackLimit - slot.quantity;
        const add = Math.min(remaining, space);
        slot.quantity += add;
        remaining -= add;
        if (remaining <= 0) return quantity;
      }
    }

    // 2. Try empty slots. The grade is assigned unconditionally: a slot that
    // validates as empty may still carry a stale `quality` (that field is not
    // part of the emptiness test), and leaving it behind would silently grade
    // an ungraded stack.
    for (const slot of inventory.slots) {
      if (!slot.itemId || !slot.quantity || slot.quantity <= 0) {
        const add = Math.min(remaining, stackLimit);
        slot.itemId = itemId;
        slot.quantity = add;
        slot.quality = quality;
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
