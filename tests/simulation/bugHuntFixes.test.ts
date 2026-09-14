// Regression tests for the cross-tier bug-hunt fixes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { Simulation } from "../../src/simulation/Simulation";
import { BasicFishingMinigame } from "../../src/simulation/fishing/BasicFishingMinigame";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { RETAIL_MARKUP } from "../../src/simulation/economy/marketPricing";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { VILLAGE_MARKET } from "../../src/world/WorldAnchors";

describe("cross-tier bug hunt fixes", () => {
  beforeEach(() => ContentRegistry.initializeAndValidate());

  it("prices a retail supply without a commodity the same way the board quotes it", () => {
    const sim = new Simulation();
    sim.state.player.x = VILLAGE_MARKET.position.x;
    sim.state.player.z = VILLAGE_MARKET.position.z;

    const itemId = "item.basic_fertilizer";
    const item = ContentRegistry.items.get(itemId)!;
    // A stall row the board can still render via its fallback quote even when
    // the tracked commodity is absent (retired stock, a migration gap, etc.).
    delete sim.state.markets["market.village"].commodities[itemId];

    const quote = sim.inspectCommodityAtMarket("market.village", itemId, "buy", 2);
    expect(quote.success).toBe(true);

    const expectedCost = Math.ceil(item.baseValue * RETAIL_MARKUP) * 2;
    const moneyBefore = sim.state.player.money;
    const result = sim.buyItemAtMarket("market.village", itemId, 2);

    expect(result.success).toBe(true);
    expect(result.cost).toBe(expectedCost);
    expect(sim.state.player.money).toBe(moneyBefore - expectedCost);
    expect(
      InventoryManager.getItemCount(sim.state.inventories[sim.state.player.inventoryId], itemId)
    ).toBeGreaterThanOrEqual(2);
  });

  it("lands a basic catch whose treasure roll repeats the caught item", () => {
    const sim = new Simulation();
    sim.state.player.x = -8;
    sim.state.player.z = 0;
    expect(sim.castBasicFishing().success).toBe(true);

    const attempt = sim.state.basicFishing!;
    attempt.phase = "caught";
    // A non-physical catch (a satchel item) plus a treasure roll of the exact
    // same item used to build a duplicate-id batch, which InventoryManager
    // rejects by contract and the commit misread as "satchel full".
    attempt.catchItemId = "seed.wheat";
    attempt.treasureCaught = true;

    const loot = vi.spyOn(BasicFishingMinigame, "generateTreasureLoot").mockReturnValue(["seed.wheat"]);
    try {
      const inventory = sim.state.inventories[sim.state.player.inventoryId];
      const before = InventoryManager.getItemCount(inventory, "seed.wheat");
      const result = sim.execute({ type: "fishing.commit-basic" });
      expect(result.success).toBe(true);
      expect(sim.state.basicFishing).toBeNull();
      expect(InventoryManager.getItemCount(inventory, "seed.wheat")).toBe(before + 2);
    } finally {
      loot.mockRestore();
    }
  });

  it("keeps the envelope and state schema versions in agreement after a migration", () => {
    // A migration that forgets to bump `state.schemaVersion` must not turn an
    // otherwise-valid save into an unreadable slot. Forge the disagreement the
    // runner is expected to repair.
    const state = createInitialGameState();
    state.schemaVersion = 1;
    const migrated = migrateSaveData({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: 1,
      state
    });

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });
});
