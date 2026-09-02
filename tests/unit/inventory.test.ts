// tests/unit/inventory.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { ContentRegistry } from "../../src/content/ContentRegistry";

describe("InventoryManager", () => {
  beforeEach(() => {
    ContentRegistry.initializeAndValidate();
  });

  it("adds items atomically and respects stack limits", () => {
    const inv = InventoryManager.createInventory("test_inv", 2);

    const success = InventoryManager.addItemsAtomically(inv, [
      { itemId: "seed.wheat", quantity: 50 }
    ]);

    expect(success).toBe(true);
    expect(inv.slots[0].itemId).toBe("seed.wheat");
    expect(inv.slots[0].quantity).toBe(50);
  });

  it("fails completely without mutating if inventory capacity is exceeded", () => {
    const inv = InventoryManager.createInventory("test_inv", 1);
    // Stack limit for wheat seed is 100

    const success = InventoryManager.addItemsAtomically(inv, [
      { itemId: "seed.wheat", quantity: 150 }
    ]);

    expect(success).toBe(false);
    expect(inv.slots[0].itemId).toBeUndefined();
    expect(inv.slots[0].quantity).toBeUndefined();
  });

  it("removes items atomically", () => {
    const inv = InventoryManager.createInventory("test_inv", 2);
    InventoryManager.addItemsAtomically(inv, [
      { itemId: "seed.wheat", quantity: 20 }
    ]);

    const removeSuccess = InventoryManager.removeItemsAtomically(inv, [
      { itemId: "seed.wheat", quantity: 15 }
    ]);

    expect(removeSuccess).toBe(true);
    expect(inv.slots[0].quantity).toBe(5);

    const removeAll = InventoryManager.removeItemsAtomically(inv, [
      { itemId: "seed.wheat", quantity: 5 }
    ]);

    expect(removeAll).toBe(true);
    expect(inv.slots[0].itemId).toBeUndefined();
  });

  it("never allows negative quantities", () => {
    const inv = InventoryManager.createInventory("test_inv", 1);
    InventoryManager.addItemsAtomically(inv, [
      { itemId: "seed.wheat", quantity: 5 }
    ]);

    const failedRemoval = InventoryManager.removeItemsAtomically(inv, [
      { itemId: "seed.wheat", quantity: 10 }
    ]);

    expect(failedRemoval).toBe(false);
    expect(inv.slots[0].quantity).toBe(5);
  });

  it("normalizes empty and malformed slot quantities for read-only projections", () => {
    expect(InventoryManager.getSlotQuantity({})).toBe(0);
    expect(InventoryManager.getSlotQuantity({ itemId: "seed.wheat" })).toBe(0);
    expect(InventoryManager.getSlotQuantity({ itemId: "seed.wheat", quantity: 0 })).toBe(0);
    expect(InventoryManager.getSlotQuantity({ itemId: "seed.wheat", quantity: Number.NaN })).toBe(0);
    expect(InventoryManager.getSlotQuantity({ itemId: "seed.wheat", quantity: 3 })).toBe(3);
  });

  it("rejects malformed, duplicate, and unknown transactions without mutation", () => {
    const inv = InventoryManager.createInventory("test_inv", 1);
    const cases = [
      [{ itemId: "seed.wheat", quantity: Number.NaN }],
      [{ itemId: "seed.wheat", quantity: Infinity }],
      [{ itemId: "seed.wheat", quantity: 0 }],
      [{ itemId: "seed.wheat", quantity: -1 }],
      [{ itemId: "seed.wheat", quantity: 1.5 }],
      [{ itemId: "missing.item", quantity: 1 }],
      [
        { itemId: "seed.wheat", quantity: 1 },
        { itemId: "seed.wheat", quantity: 1 }
      ]
    ];
    for (const items of cases) {
      expect(InventoryManager.addItemsAtomically(inv, items)).toBe(false);
      expect(InventoryManager.removeItemsAtomically(inv, items)).toBe(false);
    }
    expect(inv.slots).toEqual([{}]);
  });
});
