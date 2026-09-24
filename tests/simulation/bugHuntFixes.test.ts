// Regression tests for the cross-tier bug-hunt fixes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { Simulation } from "../../src/simulation/Simulation";
import { BasicFishingMinigame } from "../../src/simulation/fishing/BasicFishingMinigame";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { VILLAGE_MARKET } from "../../src/world/WorldAnchors";

describe("cross-tier bug hunt fixes", () => {
  beforeEach(() => ContentRegistry.initializeAndValidate());

  it("fails closed when a catalog retail supply has no finite commodity stock", () => {
    const sim = new Simulation();
    sim.state.player.x = VILLAGE_MARKET.position.x;
    sim.state.player.z = VILLAGE_MARKET.position.z;

    const itemId = "item.basic_fertilizer";
    // The catalog entry grants permission to sell it, but only a finite market
    // commodity can provide stock and price.
    delete sim.state.markets["market.village"].commodities[itemId];

    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    const moneyBefore = sim.state.player.money;
    const board = sim.inspectMarketBoard("market.village")!;
    const row = board.buyRows.find((candidate) => candidate.itemId === itemId)!;
    const quote = sim.inspectCommodityAtMarket("market.village", itemId, "buy", 2);

    expect(row).toMatchObject({ disabled: true, blockerReason: "This stall has no stock of that supply" });
    expect(row.quote.success).toBe(false);
    expect(quote).toMatchObject({ success: false, reason: "This stall has no stock of that supply" });
    const result = sim.buyItemAtMarket("market.village", itemId, 2);

    expect(result.success).toBe(false);
    expect(sim.state.player.money).toBe(moneyBefore);
    expect(InventoryManager.getItemCount(inventory, itemId)).toBe(0);
    expect(sim.state.markets["market.village"].commodities[itemId]).toBeUndefined();
  });

  it("awards bulk produce Trading XP from total transaction revenue", () => {
    const sim = new Simulation();
    sim.state.player.x = VILLAGE_MARKET.position.x;
    sim.state.player.z = VILLAGE_MARKET.position.z;
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    const itemIds = ["produce.wheat", "produce.tomato", "produce.potato", "produce.carrot"];

    for (const itemId of itemIds) {
      const commodity = sim.state.markets["market.village"].commodities[itemId];
      expect(commodity, itemId).toBeDefined();
      commodity.basePrice = 6;
      commodity.seasonalModifier = 1;
      expect(InventoryManager.addItemsAtomically(inventory, [{ itemId, quantity: 1 }])).toBe(true);
    }

    const quote = sim.inspectBulkProduceAtMarket("market.village");
    expect(quote.success).toBe(true);
    expect(quote.lines).toHaveLength(itemIds.length);
    expect(quote.lines!.every((line) => line.revenue > 0 && line.revenue < 10)).toBe(true);
    expect(quote.revenue).toBeGreaterThanOrEqual(10);
    const tradingXpBefore = sim.state.player.proficiencies.trading;

    const sale = sim.execute({ type: "market.sell-produce-bulk", marketId: "market.village" });

    expect(sale).toMatchObject({ success: true, revenue: quote.revenue });
    expect(sim.state.player.proficiencies.trading).toBe(
      tradingXpBefore + Math.floor(quote.revenue * 0.1)
    );
  });

  it("awards bulk fish Trading XP from total transaction revenue", () => {
    const sim = new Simulation();
    const marketId = "market.harbor";
    const market = ContentRegistry.markets.get(marketId)!;
    sim.state.player.x = market.interactionPosition.x;
    sim.state.player.z = market.interactionPosition.z;

    const boat = sim.state.boats["boat.player_rowboat"];
    boat.isDocked = true;
    boat.dockedMarketId = marketId;
    const boatCargoIds = ["cargo.bulk_perch_boat_a", "cargo.bulk_perch_boat_b"];
    boat.fishCargoSlotIds[0] = boatCargoIds[0];
    boat.fishCargoSlotIds[1] = boatCargoIds[1];

    const allCargoIds = [...boatCargoIds, "cargo.bulk_perch_carried"];
    for (const [index, cargoId] of allCargoIds.entries()) {
      sim.state.fishCargo[cargoId] = {
        id: cargoId,
        speciesId: "fish.perch",
        weightKg: 0.4,
        quality: "common",
        caughtAtMinute: sim.state.clock.currentMinute,
        freshness: 25,
        cargoClass: "small",
        location: index < 2
          ? { type: "boat-hold", containerId: boat.id, slotIndex: index }
          : { type: "player", containerId: "player" }
      };
    }
    sim.state.player.carriedFishCargoId = allCargoIds[2];

    const individualQuotes = allCargoIds.map((cargoId) => sim.inspectFishCargoAtMarket(marketId, cargoId));
    expect(individualQuotes.every((quote) => quote.success && quote.breakdown!.finalPrice < 10)).toBe(true);
    const quote = sim.inspectBulkFishAtMarket(marketId);
    expect(quote.success).toBe(true);
    expect(quote.lineCount).toBe(allCargoIds.length);
    expect(quote.revenue).toBeGreaterThanOrEqual(7);
    const tradingXpBefore = sim.state.player.proficiencies.trading;

    const sale = sim.execute({ type: "market.sell-fish-bulk", marketId });

    expect(sale).toMatchObject({ success: true, revenue: quote.revenue });
    expect(sim.state.player.proficiencies.trading).toBe(
      tradingXpBefore + Math.floor(quote.revenue * 0.15)
    );
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
