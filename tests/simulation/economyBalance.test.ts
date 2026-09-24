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
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
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
import { processingWorkForRecipe } from "../../src/simulation/domains/ProcessingDomain";

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

  it("tracks every retail ware and crop seed in finite, replenishing market stock", () => {
    const state = createInitialGameState(71);
    const stockedCrops = new Set<string>();
    for (const definition of ContentRegistry.markets.values()) {
      const market = state.markets[definition.id];
      for (const cropId of definition.retail.seedCropIds ?? []) {
        stockedCrops.add(cropId);
        const seedId = ContentRegistry.crops.get(cropId)!.seedItemId;
        const stock = market.commodities[seedId];
        expect(stock, `${definition.id}:${seedId}`).toBeDefined();
        expect(stock.localSupply).toBe(stock.targetSupply);
        expect(stock.targetSupply).toBeGreaterThan(0);
        expect(stock.consumptionRate).toBeGreaterThan(0);
      }
      for (const itemId of definition.retail.itemIds) {
        expect(market.commodities[itemId], `${definition.id}:${itemId}`).toBeDefined();
      }
    }
    for (const crop of ContentRegistry.crops.values()) {
      expect(stockedCrops.has(crop.id), crop.id).toBe(true);
    }
  });

  it("quotes, charges, exhausts and replenishes a seed from the same stock", () => {
    const state = createInitialGameState(72);
    state.player.x = VILLAGE_MARKET.position.x;
    state.player.z = VILLAGE_MARKET.position.z;
    const sim = new Simulation(state);
    const stock = state.markets["market.village"].commodities["seed.wheat"];
    const before = stock.localSupply;
    const purseBefore = state.player.money;
    const quote = sim.inspectCommodityAtMarket("market.village", "seed.wheat", "buy");
    const purchase = sim.buySeedAtMarket("market.village", "seed.wheat", 1);
    expect(quote.success).toBe(true);
    expect(quote.available).toBe(before);
    expect(purchase).toMatchObject({ success: true, cost: quote.totalPrice });
    expect(state.player.money).toBe(purseBefore - quote.totalPrice!);
    expect(stock.localSupply).toBe(before - 1);

    stock.localSupply = 0;
    expect(sim.inspectCommodityAtMarket("market.village", "seed.wheat", "buy").available).toBe(0);
    expect(sim.buySeedAtMarket("market.village", "seed.wheat", 1)).toMatchObject({ success: false });
    sim.advanceGameMinutes(60);
    expect(stock.localSupply).toBeGreaterThan(0);
    expect(stock.localSupply).toBeLessThanOrEqual(stock.targetSupply);
  });

  it("backfills new seed stock in an existing save without changing the input", () => {
    const state = createInitialGameState(73);
    const retainedWheatSupply = state.markets["market.village"].commodities["produce.wheat"].localSupply;
    delete state.markets["market.village"].commodities["seed.wheat"];
    const restored = migrateSaveData({
      schemaVersion: state.schemaVersion,
      savedAtUtcMs: 0,
      state
    });
    expect(restored.state.markets["market.village"].commodities["seed.wheat"]?.localSupply).toBe(60);
    expect(restored.state.markets["market.village"].commodities["produce.wheat"].localSupply)
      .toBe(retainedWheatSupply);
    expect(state.markets["market.village"].commodities["seed.wheat"]).toBeUndefined();
  });

  it("refuses false purchase quotes and satchel sales of physical fish markers", () => {
    const state = createInitialGameState(74);
    state.player.x = VILLAGE_MARKET.position.x;
    state.player.z = VILLAGE_MARKET.position.z;
    const inventory = state.inventories[state.player.inventoryId];
    expect(InventoryManager.addItemsAtomically(inventory, [{ itemId: "fish.sea_bream", quantity: 1 }])).toBe(true);
    const sim = new Simulation(state);
    const purseBefore = state.player.money;
    expect(sim.inspectCommodityAtMarket("market.village", "produce.wheat", "buy").success).toBe(false);
    expect(sim.inspectCommodityAtMarket("market.village", "fish.sea_bream", "sell").success).toBe(false);
    expect(sim.inspectMarketBoard("market.village")?.sellRows.some((row) => row.itemId === "fish.sea_bream"))
      .toBe(false);
    expect(sim.sellItemAtMarket("market.village", "fish.sea_bream", 1).success).toBe(false);
    expect(InventoryManager.getItemCount(inventory, "fish.sea_bream")).toBe(1);
    expect(state.player.money).toBe(purseBefore);
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
    const plantMatterValue = ContentRegistry.items.get("item.plant_matter")!.baseValue;
    const plantMatterInput = wormRecipe.inputs.find((input) => input.itemId === "item.plant_matter")!;
    const wormNetGoldPerWork = (
      worms.quantity * wormValue - starterCost - plantMatterInput.quantity * plantMatterValue
    ) / processingWorkForRecipe(wormRecipe);
    expect(worms.quantity).toBe(10);
    expect(wormNetGoldPerWork).toBeGreaterThanOrEqual(0.8);
    expect(wormNetGoldPerWork).toBeLessThanOrEqual(1.2);
    expect(wormNetGoldPerWork).toBeLessThan(basicGoldPerWork);

    // The batch should reward preparing grain and worms before the Harbor trip.
    // These are authored reference values; actual market quotes remain dynamic.
    const chumRecipe = ContentRegistry.recipes.get("recipe.craft_chum")!;
    if (chumRecipe.result.kind !== "items") throw new Error("Chum must produce items");
    const chumOutput = chumRecipe.result.stacks.find((output) => output.itemId === "item.chum_bucket")!;
    const villageCommodities = ContentRegistry.markets.get("market.village")!.commodities;
    const harborCommodities = ContentRegistry.markets.get("market.harbor")!.commodities;
    const inputValue = chumRecipe.inputs.reduce((total, input) => {
      const commodity = villageCommodities.find((candidate) => candidate.itemId === input.itemId)!;
      return total + input.quantity * commodity.basePrice;
    }, 0);
    const chumBasePrice = harborCommodities.find((commodity) => commodity.itemId === chumOutput.itemId)!.basePrice;
    const chumValuePerWork = (chumOutput.quantity * chumBasePrice - inputValue) / processingWorkForRecipe(chumRecipe);
    expect(chumOutput.quantity).toBe(2);
    expect(chumValuePerWork).toBeGreaterThanOrEqual(0.5);
    expect(chumValuePerWork).toBeLessThanOrEqual(0.9);

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

  it("keeps a repeat compost batch below the former high-margin worm sale", () => {
    const sim = new Simulation();
    sim.state.player.x = VILLAGE_MARKET.position.x;
    sim.state.player.z = VILLAGE_MARKET.position.z;
    const wormSale = sim.inspectCommodityAtMarket("market.village", "item.bait_worms", "sell", 10);
    const starterPurchase = sim.inspectCommodityAtMarket("market.village", "item.compost_starter", "buy");
    const plantMatterSale = sim.inspectCommodityAtMarket("market.village", "item.plant_matter", "sell", 4);
    expect(wormSale.success && starterPurchase.success && plantMatterSale.success).toBe(true);
    const net = wormSale.totalPrice! - starterPurchase.totalPrice! - plantMatterSale.totalPrice!;
    expect(net).toBeGreaterThan(0);
    expect(net).toBeLessThan(50);
  });

  it("allows modest workshop processing margins while every purchased input still resells at a loss", () => {
    const sim = new Simulation();
    const center = (marketId: "market.village" | "market.harbor", itemId: string): void => {
      // Purchased-input margins are measured at rest across the whole market
      // network, since the retail floor observes every destination's quote.
      expect(sim.state.markets[marketId].commodities[itemId]).toBeDefined();
      for (const market of Object.values(sim.state.markets)) {
        const commodity = market.commodities[itemId];
        if (!commodity) continue;
        commodity.localSupply = commodity.targetSupply;
        commodity.seasonalModifier = 1;
      }
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
      deliveredValueMoney: 0,
      legacyUnvaluedQuantity: 4,
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
        deliveredValueMoney: 0,
        legacyUnvaluedQuantity: 0,
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
