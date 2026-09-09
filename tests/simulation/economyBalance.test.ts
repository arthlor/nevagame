import { beforeEach, describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import {
  DEMAND_MAX,
  DEMAND_MIN,
  WORKSHOP_SUPPLY_MARKUP,
  demandFromSupply,
  quoteCommodityPurchase,
  quoteCommoditySale,
  relaxSupply
} from "../../src/simulation/economy/marketPricing";
import { applyOfflineProgression } from "../../src/persistence/offlineDelta";
import {
  SETTLED_CONTRACT_HISTORY,
  contractTargetReferenceValue,
  expireContracts,
  pruneSettledContracts
} from "../../src/simulation/domains/ContractDomain";
import { marketSupplyCeiling, recordMarketSale } from "../../src/simulation/economy/updateMarket";
import { VILLAGE_MARKET } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";

const HARBOR_MARKET_ANCHOR = WorldLayout.landmark("fish-market");
import { FARMING_ACTION_COST } from "../../src/simulation/domains/FarmingDomain";
import {
  BASIC_FISHING_WORK_COST,
  SPORT_FISHING_WORK_COST_BY_CLASS
} from "../../src/simulation/domains/FishingDomain";

describe("economy balance sheet", () => {
  beforeEach(() => ContentRegistry.initializeAndValidate());

  it("keeps every authored commodity centered away from a clamp at rest", () => {
    const state = createInitialGameState(7);
    const absoluteHour = 48;
    for (const market of Object.values(state.markets)) {
      for (const commodity of Object.values(market.commodities)) {
        const demand = demandFromSupply(commodity, commodity.targetSupply, absoluteHour, state.worldSeed);
        expect(demand, commodity.itemId).toBeGreaterThan(DEMAND_MIN);
        expect(demand, commodity.itemId).toBeLessThan(DEMAND_MAX);
        expect(demand, commodity.itemId).toBeGreaterThanOrEqual(0.8);
        expect(demand, commodity.itemId).toBeLessThanOrEqual(1.2);
        expect(relaxSupply(commodity.targetSupply, commodity.targetSupply, commodity.consumptionRate, 48))
          .toBe(commodity.targetSupply);
      }
    }
  });

  it("keeps representative live production chains inside their authored return bands", () => {
    const wheat = ContentRegistry.crops.get("crop.wheat")!;
    const wheatCommodity = ContentRegistry.markets.get("market.village")!.commodities
      .find((commodity) => commodity.itemId === wheat.harvestItemId)!;
    const averageWheatYield = (wheat.baseYield.min + wheat.baseYield.max) / 2;
    const directProduceGoldPerWork = averageWheatYield * wheatCommodity.basePrice /
      (FARMING_ACTION_COST.plant + FARMING_ACTION_COST.water + FARMING_ACTION_COST.harvest);
    expect(directProduceGoldPerWork).toBeGreaterThanOrEqual(0.4);
    expect(directProduceGoldPerWork).toBeLessThanOrEqual(0.9);

    const basicFish = [...ContentRegistry.fishSpecies.values()].filter((fish) => !fish.isSportFish);
    const basicWeight = basicFish.reduce((sum, fish) => sum + fish.rarityWeight, 0);
    const expectedBasicGross = basicFish.reduce(
      (sum, fish) => sum + fish.baseMarketValue * (fish.rarityWeight / basicWeight),
      0
    );
    const basicGoldPerWork = expectedBasicGross / BASIC_FISHING_WORK_COST;
    // Worms are an optional speed/rarity advantage, so the no-bait baseline is intentionally wider.
    expect(basicGoldPerWork).toBeGreaterThanOrEqual(0.8);
    expect(basicGoldPerWork).toBeLessThanOrEqual(1.8);

    const wormRecipe = ContentRegistry.recipes.get("recipe.compost_worms")!;
    expect(wormRecipe.result.kind).toBe("items");
    if (wormRecipe.result.kind !== "items") throw new Error("Compost must produce items");
    const worms = wormRecipe.result.stacks.find((output) => output.itemId === "item.bait_worms")!;
    const wormValue = ContentRegistry.markets.get("market.village")!.commodities
      .find((commodity) => commodity.itemId === worms.itemId)!.basePrice;
    const starterCost = ContentRegistry.items.get("item.compost_starter")!.baseValue;
    const wormGoldPerWork = (worms.quantity * wormValue - starterCost) / 35;
    expect(wormGoldPerWork).toBeGreaterThanOrEqual(2);
    expect(wormGoldPerWork).toBeLessThanOrEqual(3.5);

    const tuna = ContentRegistry.fishSpecies.get("fish.tuna")!;
    const tunaGoldPerWork = tuna.baseMarketValue / SPORT_FISHING_WORK_COST_BY_CLASS[tuna.cargoClass];
    expect(tunaGoldPerWork).toBeGreaterThanOrEqual(3);
    expect(tunaGoldPerWork).toBeLessThanOrEqual(6);

    const marlin = ContentRegistry.fishSpecies.get("fish.blue_marlin")!;
    const marlinGoldPerWork = marlin.baseMarketValue / SPORT_FISHING_WORK_COST_BY_CLASS[marlin.cargoClass];
    expect(marlinGoldPerWork).toBeGreaterThanOrEqual(8);
    expect(marlinGoldPerWork).toBeLessThanOrEqual(20);

    expect(wormRecipe.inputs).toContainEqual({ itemId: "item.plant_matter", quantity: 4 });
  });

  it("allows modest workshop processing margins while every purchased input still resells at a loss", () => {
    const sim = new Simulation();
    const center = (marketId: "market.village" | "market.harbor", itemId: string): void => {
      const commodity = sim.state.markets[marketId].commodities[itemId];
      commodity.localSupply = commodity.targetSupply;
      commodity.seasonalModifier = 1;
    };
    for (const [marketId, itemId] of [
      ["market.village", "produce.flax"],
      ["market.village", "item.linen_roll"],
      ["market.harbor", "item.fish_scraps"],
      ["market.harbor", "item.oiled_canvas"]
    ] as const) center(marketId, itemId);

    expect(WORKSHOP_SUPPLY_MARKUP).toBeGreaterThanOrEqual(1);
    expect(ContentRegistry.markets.get("market.village")!.retail.workshopSupplyItemIds)
      .toEqual(expect.arrayContaining(["produce.flax", "item.linen_roll"]));
    expect(ContentRegistry.markets.get("market.harbor")!.retail.workshopSupplyItemIds)
      .toContain("item.fish_scraps");

    const linenMargins: number[] = [];
    const canvasMargins: number[] = [];
    for (let hour = 0; hour < 24 * 30; hour += 3) {
      sim.state.clock.currentMinute = hour * 60;
      sim.state.player.x = VILLAGE_MARKET.position.x;
      sim.state.player.z = VILLAGE_MARKET.position.z;
      const flaxBuy = sim.inspectCommodityAtMarket("market.village", "produce.flax", "buy", 3);
      const flaxResell = sim.inspectCommodityAtMarket("market.village", "produce.flax", "sell", 3);
      const linenSale = sim.inspectCommodityAtMarket("market.village", "item.linen_roll", "sell", 1);
      const linenBuy = sim.inspectCommodityAtMarket("market.village", "item.linen_roll", "buy", 1);
      const linenResell = sim.inspectCommodityAtMarket("market.village", "item.linen_roll", "sell", 1);
      expect(flaxResell.totalPrice).toBeLessThan(flaxBuy.totalPrice!);
      expect(linenResell.totalPrice).toBeLessThan(linenBuy.totalPrice!);
      linenMargins.push((linenSale.totalPrice! - flaxBuy.totalPrice!) / flaxBuy.totalPrice!);

      sim.state.player.x = HARBOR_MARKET_ANCHOR.x;
      sim.state.player.z = HARBOR_MARKET_ANCHOR.z;
      const scrapsBuy = sim.inspectCommodityAtMarket("market.harbor", "item.fish_scraps", "buy", 2);
      const scrapsResell = sim.inspectCommodityAtMarket("market.harbor", "item.fish_scraps", "sell", 2);
      const canvasSale = sim.inspectCommodityAtMarket("market.harbor", "item.oiled_canvas", "sell", 1);
      expect(scrapsResell.totalPrice).toBeLessThan(scrapsBuy.totalPrice!);
      const canvasInputCost = linenBuy.totalPrice! + scrapsBuy.totalPrice!;
      canvasMargins.push((canvasSale.totalPrice! - canvasInputCost) / canvasInputCost);
    }

    const median = (values: number[]): number => {
      const ordered = [...values].sort((a, b) => a - b);
      return ordered[Math.floor(ordered.length / 2)];
    };
    // The day/hour signal creates profitable and unprofitable windows; at-rest
    // median returns remain modest instead of being guaranteed free arbitrage.
    expect(median(linenMargins)).toBeGreaterThanOrEqual(0.03);
    expect(median(linenMargins)).toBeLessThanOrEqual(0.15);
    expect(median(canvasMargins)).toBeGreaterThanOrEqual(0.03);
    expect(median(canvasMargins)).toBeLessThanOrEqual(0.15);
    expect(linenMargins.filter((margin) => margin > 0).length / linenMargins.length).toBeGreaterThan(0.45);
    expect(canvasMargins.filter((margin) => margin > 0).length / canvasMargins.length).toBeGreaterThan(0.45);
  });

  it("makes a plausible dump lower demand and town throughput restore supply", () => {
    const state = createInitialGameState(11);
    for (const market of Object.values(state.markets)) {
      for (const commodity of Object.values(market.commodities)) {
        const dump = Math.max(1, Math.ceil(commodity.targetSupply));
        const glutted = commodity.targetSupply + dump;
        expect(
          demandFromSupply(commodity, glutted, 72, state.worldSeed),
          commodity.itemId
        ).toBeLessThan(0.8);
        const recoveryHours = dump / commodity.consumptionRate;
        expect(relaxSupply(glutted, commodity.targetSupply, commodity.consumptionRate, recoveryHours))
          .toBeCloseTo(commodity.targetSupply, 8);
      }
    }
  });

  it("prices bulk fills exactly like sequential one-unit fills", () => {
    const state = createInitialGameState(19);
    const commodity = state.markets["market.village"].commodities["produce.wheat"];
    const context = { absoluteHour: state.clock.currentMinute / 60, worldSeed: state.worldSeed };

    const bulkSale = quoteCommoditySale(commodity, 25, context);
    let saleSupply = commodity.localSupply;
    let sequentialSale = 0;
    for (let index = 0; index < 25; index += 1) {
      const quote = quoteCommoditySale({ ...commodity, localSupply: saleSupply }, 1, context);
      sequentialSale += quote.total;
      saleSupply = quote.supplyAfter;
    }
    expect(bulkSale.total).toBe(sequentialSale);

    const bulkPurchase = quoteCommodityPurchase(commodity, 25, context);
    let purchaseSupply = commodity.localSupply;
    let sequentialPurchase = 0;
    for (let index = 0; index < 25; index += 1) {
      const quote = quoteCommodityPurchase({ ...commodity, localSupply: purchaseSupply }, 1, context);
      sequentialPurchase += quote.total;
      purchaseSupply = quote.supplyAfter;
    }
    expect(bulkPurchase.total).toBe(sequentialPurchase);
  });

  it("keeps the displayed stack quote equal to the completed sale and removes split-sale XP inflation", () => {
    const bulkState = createInitialGameState(29);
    const splitState = structuredClone(bulkState);
    for (const state of [bulkState, splitState]) {
      state.player.x = VILLAGE_MARKET.position.x;
      state.player.z = VILLAGE_MARKET.position.z;
      InventoryManager.addItemsAtomically(
        state.inventories[state.player.inventoryId],
        [{ itemId: "produce.wheat", quantity: 12 }]
      );
    }

    const bulk = new Simulation(bulkState);
    const split = new Simulation(splitState);
    const quote = bulk.inspectCommodityAtMarket("market.village", "produce.wheat", "sell", 12);
    const sale = bulk.sellItemAtMarket("market.village", "produce.wheat", 12);
    expect(sale).toMatchObject({ success: true, revenue: quote.totalPrice });

    let splitRevenue = 0;
    for (let index = 0; index < 12; index += 1) {
      const result = split.sellItemAtMarket("market.village", "produce.wheat", 1);
      expect(result.success).toBe(true);
      splitRevenue += result.revenue ?? 0;
    }
    expect(splitRevenue).toBe(sale.revenue);
    expect(split.state.player.proficiencies.trading).toBeLessThanOrEqual(
      bulk.state.player.proficiencies.trading
    );
  });

  it("pays a satchel fish stack exactly the quote the board displayed", () => {
    const state = createInitialGameState(31);
    state.player.x = HARBOR_MARKET_ANCHOR.x;
    state.player.z = HARBOR_MARKET_ANCHOR.z;
    InventoryManager.addItemsAtomically(
      state.inventories[state.player.inventoryId],
      [{ itemId: "fish.perch", quantity: 6 }]
    );
    // A single trophy in the log used to multiply every later common catch by
    // 2.2x at the till while the board still quoted the unmultiplied price.
    state.journal.fishRecords["fish.perch"] = {
      discovered: true,
      catchCount: 4,
      bestQuality: "trophy",
      largestWeightKg: 3.2,
      firstCaughtMinute: 0
    };

    const sim = new Simulation(state);
    const quote = sim.inspectCommodityAtMarket("market.harbor", "fish.perch", "sell", 6);
    const sale = sim.sellItemAtMarket("market.harbor", "fish.perch", 6);
    expect(sale).toMatchObject({ success: true, revenue: quote.totalPrice });
  });

  it("caps how far a dump can glut a stall past the point price stops moving", () => {
    const state = createInitialGameState(32);
    const commodity = state.markets["market.village"].commodities["produce.wheat"];
    const ceiling = marketSupplyCeiling(commodity.targetSupply);

    recordMarketSale(state.markets["market.village"], "produce.wheat", 10_000);
    expect(commodity.localSupply).toBe(ceiling);
    // The ceiling sits past demand saturation, so nothing above it was ever
    // visible to price — only to the linear walk back to target.
    expect(demandFromSupply(commodity, ceiling, 48, state.worldSeed)).toBe(DEMAND_MIN);
  });

  it("settles a lapsed produce order at its delivery rest reference", () => {
    const state = createInitialGameState(33);
    const market = state.markets["market.village"];
    const commodity = market.commodities["produce.wheat"];
    // Glut the stall so the live quote is clearly below the authored reference.
    recordMarketSale(market, "produce.wheat", commodity.targetSupply);
    const sim = new Simulation(state);
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    const wheatLimit = ContentRegistry.items.get("seed.wheat")!.stackLimit;
    inventory.slots = inventory.slots.map(() => ({ itemId: "seed.wheat", quantity: wheatLimit }));

    sim.state.contracts = [{
      id: "contract.lapsed",
      templateId: "contract.wheat_supply",
      requesterId: "contract.wheat_supply",
      deliveryMarketId: "market.village",
      type: "produce",
      targetItemIdOrSpecies: "produce.wheat",
      quantityRequired: 10,
      quantityFulfilled: 4,
      rewardMoney: 100,
      rewardSkillXp: { skill: "farming", xp: 50 },
      expiresAtMinute: sim.state.clock.currentMinute,
      status: "active"
    }];
    const moneyBefore = sim.state.player.money;
    const template = ContentRegistry.contractTemplates.get("contract.wheat_supply")!;
    const referenceRate = contractTargetReferenceValue(sim.state, template, "produce.wheat");
    const marketRate = quoteCommoditySale(commodity, 4, {
      absoluteHour: sim.state.clock.currentMinute / 60,
      worldSeed: sim.state.worldSeed
    }).total;

    expireContracts(sim.state);

    expect(sim.state.player.money - moneyBefore).toBe(Math.round((referenceRate ?? 0) * 4));
    expect(referenceRate).toBeGreaterThan(marketRate / 4);
    expect(marketRate).toBeLessThan(commodity.basePrice * commodity.seasonalModifier * 4);
  });

  it("keeps the settled contract tail bounded instead of growing forever", () => {
    const state = createInitialGameState(34);
    for (let index = 0; index < SETTLED_CONTRACT_HISTORY + 15; index += 1) {
      state.contracts.push({
        id: `contract.done_${index}`,
        templateId: "contract.wheat_supply",
        requesterId: "contract.wheat_supply",
        deliveryMarketId: "market.village",
        type: "produce",
        targetItemIdOrSpecies: "produce.wheat",
        quantityRequired: 1,
        quantityFulfilled: 1,
        rewardMoney: 10,
        rewardSkillXp: { skill: "farming", xp: 50 },
        expiresAtMinute: 0,
        status: "completed"
      });
    }
    const activeBefore = state.contracts.filter((contract) => contract.status === "active").length;

    pruneSettledContracts(state);

    const settled = state.contracts.filter((contract) => contract.status !== "active");
    expect(settled).toHaveLength(SETTLED_CONTRACT_HISTORY);
    expect(state.contracts.filter((contract) => contract.status === "active")).toHaveLength(activeBefore);
    // The newest settled rows are the ones kept.
    expect(settled.at(-1)?.id).toBe(`contract.done_${SETTLED_CONTRACT_HISTORY + 14}`);
  });

  it("serves market rows and live quantity quotes through simulation-owned DTOs", () => {
    const state = createInitialGameState(30);
    state.player.x = VILLAGE_MARKET.position.x;
    state.player.z = VILLAGE_MARKET.position.z;
    const inventory = state.inventories[state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "produce.wheat", quantity: 12 }]);
    const sim = new Simulation(state);

    const board = sim.inspectMarketBoard("market.village");
    expect(board).not.toBeNull();
    expect(board?.buyRows.some((row) => row.itemId === "seed.wheat" && row.quote.intent === "buy")).toBe(true);
    expect(board?.sellRows.find((row) => row.itemId === "produce.wheat")).toMatchObject({ owned: 12 });

    const quantityQuote = sim.query({
      type: "market.quote-sale",
      marketId: "market.village",
      itemId: "produce.wheat",
      quantity: 12
    });
    expect(quantityQuote).toMatchObject({ success: true, totalPrice: expect.any(Number) });
    const sale = sim.sellItemAtMarket("market.village", "produce.wheat", 12);
    expect(sale.revenue).toBe((quantityQuote as { totalPrice: number }).totalPrice);

    const after = sim.inspectCommodityAtMarket("market.village", "produce.wheat", "sell");
    expect(after.demandPercent).toBeLessThan(board!.sellRows.find((row) => row.itemId === "produce.wheat")!.quote.demandPercent!);
  });

  it("prices every contract as a real premium over its gate-adjusted rest reference", () => {
    const state = createInitialGameState(31);
    for (const template of ContentRegistry.contractTemplates.values()) {
      for (const targetId of template.itemOrSpeciesPool) {
        const minimumWeight = template.minWeightKgRange?.[0];
        const reference = contractTargetReferenceValue(state, template, targetId, minimumWeight);
        expect(reference, `${template.id}:${targetId}`).not.toBeNull();
        expect(template.rewardBaseMultiplier, template.id).toBeGreaterThanOrEqual(1.3);
        const quantity = template.quantityRange[0];
        const reward = Math.round((reference ?? 0) * quantity * template.rewardBaseMultiplier);
        expect(reward / Math.max(1, (reference ?? 0) * quantity)).toBeGreaterThanOrEqual(1.295);
      }
    }
  });

  it("replays 72 game hours identically through live and offline market paths", () => {
    const initial = createInitialGameState(37);
    initial.metadata.lastSavedUtcMs = 0;
    const liveState = structuredClone(initial);
    const offlineState = structuredClone(initial);
    const live = new Simulation(liveState);

    live.advanceGameMinutes(72 * 60);
    applyOfflineProgression(offlineState, (72 * 60 / offlineState.clock.minutesPerRealSecond) * 1000);

    for (const marketId of Object.keys(live.state.markets)) {
      for (const itemId of Object.keys(live.state.markets[marketId].commodities)) {
        const liveCommodity = live.state.markets[marketId].commodities[itemId];
        const offlineCommodity = offlineState.markets[marketId].commodities[itemId];
        expect(offlineCommodity.localSupply, `${marketId}:${itemId}`).toBeCloseTo(liveCommodity.localSupply, 10);
        expect(offlineCommodity.demandIndex, `${marketId}:${itemId}`).toBeCloseTo(liveCommodity.demandIndex, 10);
      }
    }
  });
});
