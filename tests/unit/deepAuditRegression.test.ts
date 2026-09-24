import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import type { GameState, InventoryState, ItemStack } from "../../src/simulation/core/types";
import { advanceCargoFreshness } from "../../src/simulation/fishing/calculateFreshness";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { WorldLayout } from "../../src/world/WorldLayout";

// These native Vitest checks complement the downloadable isolated audit
// harness. The malformed values below deliberately exercise runtime guards.
describe("September 2026 inventory and cargo regression fixes", () => {
  beforeEach(() => ContentRegistry.initializeAndValidate());
  afterEach(() => vi.restoreAllMocks());

  it("does not count the same grade toward both generic and exact requests", () => {
    const inventory = InventoryManager.createInventory("audit.inventory", 2);
    expect(InventoryManager.addItemsAtomically(inventory, [
      { itemId: "produce.wheat", quantity: 5, quality: "fine" }
    ])).toBe(true);
    const before = structuredClone(inventory);
    const request: ItemStack[] = [
      { itemId: "produce.wheat", quantity: 5 },
      { itemId: "produce.wheat", quantity: 5, quality: "fine" }
    ];
    expect(InventoryManager.hasItems(inventory, request)).toBe(false);
    expect(InventoryManager.removeItemsAtomically(inventory, request)).toBe(false);
    expect(inventory).toEqual(before);
  });

  it("reserves exact grades before a generic request spends the lowest grade", () => {
    const inventory = InventoryManager.createInventory("audit.inventory", 2);
    expect(InventoryManager.addItemsAtomically(inventory, [
      { itemId: "produce.wheat", quantity: 5, quality: "common" },
      { itemId: "produce.wheat", quantity: 5, quality: "fine" }
    ])).toBe(true);
    const request: ItemStack[] = [
      { itemId: "produce.wheat", quantity: 5 },
      { itemId: "produce.wheat", quantity: 5, quality: "common" }
    ];
    const originalRequest = structuredClone(request);
    expect(InventoryManager.removeItemsAtomically(inventory, request)).toBe(true);
    expect(InventoryManager.getItemCount(inventory, "produce.wheat")).toBe(0);
    expect(request).toEqual(originalRequest);
  });

  it("rejects null, undefined and sparse batches instead of throwing", () => {
    const inventory = InventoryManager.createInventory("audit.inventory", 1);
    for (const input of [[null], [undefined], new Array(1)]) {
      const batch = input as unknown as ItemStack[];
      expect(InventoryManager.isValidItemBatch(batch)).toBe(false);
      expect(InventoryManager.addItemsAtomically(inventory, batch)).toBe(false);
      expect(InventoryManager.removeItemsAtomically(inventory, batch)).toBe(false);
    }
    expect(inventory.slots).toEqual([{}]);
  });

  it("does not skip holes while validating an inventory", () => {
    const inventory = InventoryManager.createInventory("audit.inventory", 2);
    delete inventory.slots[0];
    expect(InventoryManager.isValidInventory(inventory)).toBe(false);
    expect(InventoryManager.addItemsAtomically(inventory, [
      { itemId: "produce.wheat", quantity: 1 }
    ])).toBe(false);
  });

  it("validates the inventory before simulating an exchange", () => {
    const request = [{ itemId: "produce.wheat", quantity: 1 }];
    for (const input of [null, undefined, {}, { id: "broken", slotCount: 1 }]) {
      expect(InventoryManager.canAddItemsAfterRemoving(
        input as unknown as InventoryState, request, request
      )).toBe(false);
    }
  });

  // A deliberately small owner-level fixture, NOT a save-schema fixture.
  // The freshness function only reads these fields. Climate is fixed so this
  // regression does not depend on terrain or today's weather definitions.
  function freshnessFixture(ice: number, caughtAtMinute: number): GameState {
    vi.spyOn(WorldLayout, "climateSampleAt").mockReturnValue(
      { temperatureC: 20 } as ReturnType<typeof WorldLayout.climateSampleAt>
    );
    const inventory = InventoryManager.createInventory("audit.satchel", 2);
    expect(InventoryManager.addItemsAtomically(inventory, [
      { itemId: "item.crushed_ice", quantity: ice }
    ])).toBe(true);
    return {
      player: { inventoryId: inventory.id, x: 0, z: 0 },
      inventories: { [inventory.id]: inventory },
      fishCargo: {
        "cargo.audit": {
          id: "cargo.audit", speciesId: "fish.trout", caughtAtMinute, freshness: 100,
          location: { type: "player", containerId: "player" }
        }
      },
      boats: {}, mounts: {}, world: { structures: {} }, weather: {}
    } as unknown as GameState;
  }

  function remainingIce(state: GameState): number {
    return InventoryManager.getItemCount(
      state.inventories[state.player.inventoryId], "item.crushed_ice"
    );
  }

  it("does not bill a catch landed at the end of the elapsed hour", () => {
    const state = freshnessFixture(1, 60);
    advanceCargoFreshness(state, 1, 59);
    expect(state.fishCargo["cargo.audit"].freshness).toBe(100);
    expect(remainingIce(state)).toBe(1);
  });

  it("does not charge a newly landed fish for an earlier hour", () => {
    const state = freshnessFixture(2, 60);
    advanceCargoFreshness(state, 61, 0);
    expect(remainingIce(state)).toBe(2);
    expect(state.fishCargo["cargo.audit"].freshness).toBeLessThan(100);
  });

  it("still bills one pack for multiple fish cooled in one container", () => {
    const state = freshnessFixture(2, 0);
    state.fishCargo["cargo.second"] = {
      ...structuredClone(state.fishCargo["cargo.audit"]), id: "cargo.second"
    };
    advanceCargoFreshness(state, 60, 0);
    expect(remainingIce(state)).toBe(1);
  });
});

describe("gameplay coaching agrees with the implemented rules", () => {
  const source = readFileSync(resolve(process.cwd(), "src/app/GameApp.ts"), "utf8");

  it("does not teach that crop grades have no sale-value benefit", () => {
    expect(source).not.toContain("a fine grade earns extra XP, not extra gold");
    expect(source).toContain("Better grades earn extra XP and can sell for more gold.");
  });

  it("does not send physical trade packs to the harbor buyer", () => {
    expect(source).not.toContain("a direct run to the harbor beats a full hold");
    expect(source).toContain("take physical trade packs to an inland trade counter");
  });

  it("does not describe every docking location as the harbor", () => {
    expect(source).not.toContain('this.setToast("Docked at harbor"');
    expect(source).not.toContain("Return to the harbor dock to disembark");
    expect(source).toContain("Return to a marked mooring to disembark");
  });
});
