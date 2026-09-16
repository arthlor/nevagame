import { ContentRegistry } from "../../content/ContentRegistry";
import { calculateFishPrice, type FishPriceBreakdown } from "../economy/calculateFishValue";
import { recordMarketPurchase, recordMarketSale, tickMarket } from "../economy/updateMarket";
import {
  RETAIL_MARKUP,
  WORKSHOP_SUPPLY_MARKUP,
  demandFromSupply,
  demandLabelFromModifier,
  demandLabelFromPercent,
  isQuotableQuantity,
  sampleDemandTrend,
  quoteCommodityPurchase,
  quoteCommoditySale,
  type CommodityMarketQuote
} from "../economy/marketPricing";
import type { FishCargoId, FishCargoState, ItemId, MarketId } from "../core/types";
import type { RodId } from "../core/types";
import { InventoryManager } from "../inventory/InventoryManager";
import type { CargoDomain } from "./CargoDomain";
import type { DomainContext } from "./DomainContext";
import type { NavigationDomain } from "./NavigationDomain";
import type { ProgressionDomain } from "./ProgressionDomain";
import type { EquipmentDomain } from "./EquipmentDomain";
import type {
  BulkSaleQuote,
  BuySeedReasonCode,
  CommodityQuote,
  InteractionResult,
  MarketBoardDto,
  MarketDemandSignal,
  MarketDemandTrendDto
} from "../core/contracts";
import { previousRodId, ROD_PROGRESSION, rodFishingXpRequirement } from "../../content/rods";
import { FISH_TRADE_CENTER_MARKET_ID as TRADE_CENTER_MARKET_ID } from "../../content/markets";
import { isPhysicalTradePackSpecies, qualityRank } from "./domainRules";
import { dayOfSeason } from "../core/GameClock";
import {
  buildExpeditionBoard,
  type ExpeditionBoardDto
} from "../expeditions/buildExpeditionOpportunities";

export class MarketDomain {
  /** The inland counter where a player presents physical fish trade packs. */
  public static readonly FISH_TRADE_CENTER_MARKET_ID: MarketId = TRADE_CENTER_MARKET_ID;
  public static get HARBOR_BUYABLE(): readonly ItemId[] {
    return ContentRegistry.markets.get("market.harbor")?.retail.itemIds ?? [];
  }

  public static get VILLAGE_SUPPLIES(): readonly ItemId[] {
    return ContentRegistry.markets.get(TRADE_CENTER_MARKET_ID)?.retail.itemIds ?? [];
  }
  public static readonly BULK_SELL_PRODUCE_CATEGORIES = ["produce", "grain"] as const;
  /** Buy prices sit above the sell quote so buying and selling back cannot profit. */
  public static readonly BUY_MARKUP = RETAIL_MARKUP;

  public static isBulkSellProduceItem(itemId: ItemId): boolean {
    const category = ContentRegistry.items.get(itemId)?.category;
    if (category !== "produce" && category !== "grain") return false;
    // `fish.sea_bream` is registered as an item only so it can be cast; it is
    // physical trade-pack cargo, never a stackable bulk-produce line.
    const species = ContentRegistry.fishSpecies.get(itemId);
    return !(species && isPhysicalTradePackSpecies(species));
  }

  constructor(
    private readonly context: DomainContext,
    private readonly navigation: NavigationDomain,
    private readonly cargo: CargoDomain,
    private readonly progression: ProgressionDomain,
    private readonly equipment: EquipmentDomain
  ) {}

  public getNearbyMarketId(): MarketId | null {
    const { player } = this.context.state;
    for (const market of ContentRegistry.markets.values()) {
      const { interactionPosition } = market;
      if (Math.hypot(player.x - interactionPosition.x, player.z - interactionPosition.z) <= interactionPosition.radiusMeters) {
        return market.id;
      }
    }
    return null;
  }

  public sellItem(
    marketId: MarketId,
    itemId: ItemId,
    quantity: number
  ): { success: boolean; revenue?: number; reason?: string } {
    const { state, events } = this.context;
    const market = state.markets[marketId];
    if (!market) return { success: false, reason: "Market not found" };
    if (this.getNearbyMarketId() !== marketId) return { success: false, reason: "You must be at this market to trade" };
    const commodity = market.commodities[itemId];
    if (!commodity) return { success: false, reason: "Market does not trade this item" };
    if (!InventoryManager.isValidItemStack({ itemId, quantity })) {
      return { success: false, reason: "Sale quantity must be a positive whole number" };
    }
    if (!isQuotableQuantity(quantity)) {
      return { success: false, reason: "That quantity is more than the stall can quote" };
    }
    const inventory = state.inventories[state.player.inventoryId];
    if (!InventoryManager.hasItems(inventory, [{ itemId, quantity }])) {
      return { success: false, reason: "You do not have enough of this item" };
    }

    // Every satchel stack settles at the quote the board displayed. A fish
    // *item* is a fungible stack with no per-instance quality, so it must not
    // be priced off the species' best-ever journal record: that paid a
    // permanent trophy multiplier on every later common catch and made the
    // sale disagree with `inspectCommodity`, which never had a quality term.
    // Per-instance quality belongs to the cargo lane, which `sellFish` prices
    // through `calculateFishPrice`.
    const marketQuote = this.quoteSale(commodity, quantity);
    const revenue = marketQuote.total;
    if (!InventoryManager.removeItemsAtomically(inventory, [{ itemId, quantity }])) {
      return { success: false, reason: "Your satchel changed before the sale" };
    }
    state.player.money += revenue;
    recordMarketSale(market, itemId, quantity);
    this.awardTradingXp(revenue, 0.1);
    events.emit("ItemSold", { marketId, itemId, quantity, revenue, minute: state.clock.currentMinute });
    return { success: true, revenue };
  }

  public inspectCommodity(
    marketId: MarketId,
    itemId: ItemId,
    intent: "buy" | "sell" = "sell",
    quantity = 1
  ): CommodityQuote {
    const { state } = this.context;
    const market = state.markets[marketId];
    const item = ContentRegistry.items.get(itemId);
    const base: CommodityQuote = { success: false, itemId, intent };
    if (!market || !item) return { ...base, reason: "Market item not found" };
    if (this.getNearbyMarketId() !== marketId) {
      return { ...base, reason: "Move closer to the stall" };
    }
    const commodity = market.commodities[itemId];
    const retailItemIds = this.retailItemIds(marketId);
    if (!commodity && !(intent === "buy" && retailItemIds.includes(itemId))) {
      return { ...base, reason: "This stall does not trade that item" };
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      return { ...base, reason: "Choose a positive whole quantity" };
    }
    if (!isQuotableQuantity(quantity)) {
      return { ...base, reason: "That quantity is more than the stall can quote" };
    }
    const marketQuote = commodity
      ? intent === "buy"
        ? this.quotePurchase(marketId, commodity, quantity)
        : this.quoteSale(commodity, quantity)
      : null;
    const unitPrice = marketQuote?.unitPrice ?? Math.ceil(item.baseValue * MarketDomain.BUY_MARKUP);
    const totalPrice = marketQuote?.total ?? unitPrice * quantity;
    const demandPercent = marketQuote
      ? Math.round(marketQuote.averageDemandModifier * 100)
      : 100;
    const demandLabel = demandLabelFromPercent(demandPercent);
    const owned = InventoryManager.getItemCount(
      state.inventories[state.player.inventoryId],
      itemId
    );
    return {
      success: true,
      itemId,
      intent,
      unitPrice,
      totalPrice,
      demandPercent,
      demandLabel,
      available: commodity ? Math.max(0, Math.floor(commodity.localSupply)) : undefined,
      owned,
      affordable: state.player.money >= totalPrice,
      bulkProduce: MarketDomain.isBulkSellProduceItem(itemId)
    };
  }

  public inspectBulkProduce(marketId: MarketId): BulkSaleQuote {
    const { state } = this.context;
    const market = state.markets[marketId];
    if (!market) return this.emptyBulkQuote("Market not found");
    if (this.getNearbyMarketId() !== marketId) return this.emptyBulkQuote("Move closer to the stall");
    const inventory = state.inventories[state.player.inventoryId];
    const lines = Object.keys(market.commodities)
      .filter((itemId) => MarketDomain.isBulkSellProduceItem(itemId))
      .map((itemId) => ({
        itemId,
        quantity: InventoryManager.getItemCount(inventory, itemId)
      }))
      .filter((line) => line.quantity > 0);
    if (lines.length === 0) return this.emptyBulkQuote("No produce to sell here");
    const revenue = lines.reduce((total, line) => {
      const commodity = market.commodities[line.itemId];
      return total + this.quoteSale(commodity, line.quantity).total;
    }, 0);
    return {
      success: true,
      quantity: lines.reduce((total, line) => total + line.quantity, 0),
      lineCount: lines.length,
      revenue
    };
  }

  public inspectDemandSignal(marketId: MarketId): MarketDemandSignal {
    return this.inspectScopedDemandSignal(marketId, "all");
  }

  public inspectExpeditionBoard(): ExpeditionBoardDto {
    return buildExpeditionBoard(this.context.state, {
      steady: this.inspectScopedDemandSignal(TRADE_CENTER_MARKET_ID, "produce"),
      bold: this.inspectScopedDemandSignal(MarketDomain.FISH_TRADE_CENTER_MARKET_ID, "sport-fish")
    });
  }

  /**
   * Demand outlook for one commodity across a window of days, evaluated with
   * the same `demandFromSupply` the stall prices with. Supply is pinned at the
   * stall's current stock: tomorrow's stock depends on trade nobody has done
   * yet, so this projects the seeded daily trend rather than predicting stock.
   */
  public inspectDemandTrend(
    marketId: MarketId,
    itemId: ItemId,
    days: number = 5
  ): MarketDemandTrendDto | null {
    const { state } = this.context;
    const market = state.markets[marketId];
    const commodity = market?.commodities[itemId];
    if (!market || !commodity) return null;
    const fish = ContentRegistry.fishSpecies.get(itemId);
    if (marketId !== MarketDomain.FISH_TRADE_CENTER_MARKET_ID && fish && isPhysicalTradePackSpecies(fish)) return null;

    const hourNow = state.clock.currentMinute / 60;
    const trend = sampleDemandTrend(commodity, commodity.localSupply, hourNow, state.worldSeed, days);
    const item = ContentRegistry.items.get(itemId) ?? ContentRegistry.fishSpecies.get(itemId);

    return {
      marketId,
      itemId,
      itemName: item?.name ?? itemId,
      points: trend.points,
      currentDemandPercent: trend.currentDemandPercent,
      direction: trend.direction,
      localSupply: commodity.localSupply,
      targetSupply: commodity.targetSupply
    };
  }

  private inspectScopedDemandSignal(
    marketId: MarketId,
    scope: "all" | "produce" | "sport-fish"
  ): MarketDemandSignal {
    const { state } = this.context;
    const market = state.markets[marketId];
    if (!market) return { success: false, marketId, reason: "Market not found" };
    const priced = Object.values(market.commodities)
      .filter((commodity) => {
        const fish = ContentRegistry.fishSpecies.get(commodity.itemId);
        if (
          marketId !== MarketDomain.FISH_TRADE_CENTER_MARKET_ID &&
          fish &&
          isPhysicalTradePackSpecies(fish)
        ) return false;
        return scope === "all"
          || (scope === "produce" && MarketDomain.isBulkSellProduceItem(commodity.itemId))
          || (scope === "sport-fish" && Boolean(fish?.isSportFish));
      })
      .map((commodity) => ({
        commodity,
        demand: demandFromSupply(
          commodity,
          commodity.localSupply,
          state.clock.currentMinute / 60,
          state.worldSeed
        )
      }))
      .sort((a, b) => b.demand - a.demand || a.commodity.itemId.localeCompare(b.commodity.itemId));
    const leading = priced[0];
    if (!leading) return { success: false, marketId, reason: "No demand is posted" };
    const { commodity, demand } = leading;
    const item = ContentRegistry.items.get(commodity.itemId) ?? ContentRegistry.fishSpecies.get(commodity.itemId);
    return {
      success: true,
      marketId,
      itemId: commodity.itemId,
      itemName: item?.name ?? commodity.itemId,
      demandLabel: demandLabelFromModifier(demand)
    };
  }

  public inspectBoard(marketId: MarketId): MarketBoardDto | null {
    const { state } = this.context;
    const market = state.markets[marketId];
    const marketDefinition = ContentRegistry.markets.get(marketId);
    if (!market || !marketDefinition || this.getNearbyMarketId() !== marketId) return null;

    const inventory = state.inventories[state.player.inventoryId];
    const cropBySeed = new Map(
      [...ContentRegistry.crops.values()]
        .filter((crop) => marketDefinition.retail.seedCropIds?.includes(crop.id))
        .map((crop) => [crop.seedItemId, crop] as const)
    );
    const buyItemIds = this.retailItemIds(marketId);
    const buyRows = [...new Set(buyItemIds)].flatMap((itemId) => {
      const item = ContentRegistry.items.get(itemId);
      if (!item) return [];
      const crop = cropBySeed.get(itemId);
      const quote = this.inspectCommodity(marketId, itemId, "buy");
      const locked = Boolean(crop && state.player.proficiencies.farming < crop.minimumFarmingXp);
      const blockerReason = locked
        ? `Requires ${crop?.minimumFarmingXp.toLocaleString()} Farming XP`
        : !quote.success
          ? quote.reason ?? "Not available here"
          : quote.available !== undefined && quote.available <= 0
            ? "Sold out"
            : quote.affordable === false
              ? `Needs ${(quote.totalPrice ?? quote.unitPrice ?? 0).toLocaleString()} G`
              : !InventoryManager.canAddItems(inventory, [{ itemId, quantity: 1 }])
                ? "Satchel is full"
                : undefined;
      return [{
        itemId,
        name: crop?.name ?? item.name,
        description: item.description,
        kind: crop ? "seed" as const : "supply" as const,
        owned: InventoryManager.getItemCount(inventory, itemId),
        locked,
        disabled: blockerReason !== undefined,
        blockerReason,
        quote
      }];
    });

    const seenSellItems = new Set<ItemId>();
    const sellRows = inventory.slots.flatMap((slot) => {
      const itemId = slot.itemId;
      if (!itemId || seenSellItems.has(itemId) || !market.commodities[itemId]) return [];
      const owned = InventoryManager.getItemCount(inventory, itemId);
      if (owned <= 0) return [];
      seenSellItems.add(itemId);
      return [{
        itemId,
        name: ContentRegistry.items.get(itemId)?.name ?? itemId,
        owned,
        quote: this.inspectCommodity(marketId, itemId, "sell")
      }];
    });

    const accessibleFish = Object.values(state.fishCargo)
      .filter((cargo) => this.navigation.canAccessFishCargo(cargo, marketId))
      .sort((a, b) => a.id.localeCompare(b.id));
    const fishRows = marketId === MarketDomain.FISH_TRADE_CENTER_MARKET_ID
      ? []
      : accessibleFish
        .filter((cargo) => !this.isTradePack(cargo))
        .map((cargo) => {
          const species = ContentRegistry.fishSpecies.get(cargo.speciesId);
          const quote = this.inspectFish(marketId, cargo.id);
          return {
            cargoId: cargo.id,
            speciesId: cargo.speciesId,
            name: species?.name ?? cargo.speciesId,
            weightKg: cargo.weightKg,
            quality: cargo.quality,
            freshness: cargo.freshness,
            spoiled: cargo.freshness <= 0,
            breakdown: quote.breakdown,
            reason: quote.reason
          };
        });
    const tradePackRows = marketId === MarketDomain.FISH_TRADE_CENTER_MARKET_ID
      ? accessibleFish
        .filter((cargo) => this.isTradePack(cargo) && cargo.location.type === "player")
        .map((cargo) => {
          const species = ContentRegistry.fishSpecies.get(cargo.speciesId);
          const quote = this.inspectTradePack(marketId, cargo.id);
          return {
            cargoId: cargo.id,
            speciesId: cargo.speciesId,
            name: species?.name ?? cargo.speciesId,
            weightKg: cargo.weightKg,
            quality: cargo.quality,
            freshness: cargo.freshness,
            spoiled: cargo.freshness <= 0,
            breakdown: quote.breakdown,
            reason: quote.reason
          };
        })
      : [];

    const equipmentBlocker = this.equipment.equipBlocker();
    const retailRodIds = new Set(marketDefinition.retail.rodIds ?? []);
    const rodRows = retailRodIds.size > 0
      ? ROD_PROGRESSION.filter((rodId) => retailRodIds.has(rodId)).flatMap((rodId) => {
          const rod = ContentRegistry.rods.get(rodId);
          if (!rod) return [];
          const owned = state.player.ownedRodIds.includes(rodId);
          const equipped = state.player.equippedRodId === rodId;
          const prerequisite = previousRodId(rodId);
          const requiredXp = rodFishingXpRequirement(rodId) ?? 0;
          const blockerReason = equipmentBlocker
            ? equipmentBlocker
            : !owned && prerequisite !== null && !state.player.ownedRodIds.includes(prerequisite)
              ? "Previous rod required"
              : !owned && state.player.proficiencies.fishing < requiredXp
                ? `${requiredXp.toLocaleString()} Fishing XP required`
                : !owned && state.player.money < rod.costMoney
                  ? `${rod.costMoney.toLocaleString()} G required`
                  : undefined;
          return [{
            rodId,
            name: rod.name,
            allowedHabitats: rod.allowedHabitats,
            maximumCargoClass: rod.maximumCargoClass,
            costMoney: rod.costMoney,
            owned,
            equipped,
            starter: prerequisite === null,
            equippable: owned && !equipped && equipmentBlocker === null,
            purchasable: !owned && prerequisite !== null && blockerReason === undefined,
            blockerReason
          }];
        })
      : [];

    const contractRows = state.contracts
      .filter((contract) => contract.status === "active" && contract.deliveryMarketId === marketId)
      .map((contract) => {
        const item = ContentRegistry.items.get(contract.targetItemIdOrSpecies);
        const fish = ContentRegistry.fishSpecies.get(contract.targetItemIdOrSpecies);
        const physicalTradePack = Boolean(fish && isPhysicalTradePackSpecies(fish));
        // A physical species' item registration is an eligibility marker only,
        // so route it through the cargo lane even though an item entry exists.
        const itemLane = item ? !physicalTradePack : false;
        const remaining = Math.max(0, contract.quantityRequired - contract.quantityFulfilled);
        const ownedItems = itemLane
          ? InventoryManager.getItemCount(inventory, contract.targetItemIdOrSpecies)
          : 0;
        const deliverableItems = itemLane ? Math.min(ownedItems, remaining) : 0;
        const matchingFish = fish
          ? accessibleFish.filter((cargo) => cargo.speciesId === contract.targetItemIdOrSpecies)
          : [];
        const eligibleCargoIds = matchingFish
          .filter((cargo) => contract.minQuality === undefined || qualityRank(cargo.quality) >= qualityRank(contract.minQuality))
          .filter((cargo) => contract.minFreshness === undefined || cargo.freshness >= contract.minFreshness)
          .filter((cargo) => contract.minWeightKg === undefined || cargo.weightKg >= contract.minWeightKg)
          .slice(0, remaining)
          .map((cargo) => cargo.id);
        const blockerReasons: string[] = [];
        if (itemLane && deliverableItems === 0) {
          blockerReasons.push(`Bring ${remaining} ${item!.name}`);
        } else if (fish && eligibleCargoIds.length === 0) {
          if (matchingFish.length === 0) {
            blockerReasons.push(`Bring ${fish.name} to the market dock`);
          } else {
            if (contract.minQuality && matchingFish.every((cargo) => qualityRank(cargo.quality) < qualityRank(contract.minQuality!))) {
              blockerReasons.push(`${contract.minQuality} quality or better`);
            }
            if (contract.minFreshness !== undefined && matchingFish.every((cargo) => cargo.freshness < contract.minFreshness!)) {
              blockerReasons.push(`At least ${contract.minFreshness}% freshness`);
            }
            if (contract.minWeightKg !== undefined && matchingFish.every((cargo) => cargo.weightKg < contract.minWeightKg!)) {
              blockerReasons.push(`At least ${contract.minWeightKg} kg`);
            }
            if (blockerReasons.length === 0) blockerReasons.push("No single fish meets every requirement");
          }
        }
        const ready = deliverableItems > 0 || eligibleCargoIds.length > 0;
        return {
          contractId: contract.id,
          targetId: contract.targetItemIdOrSpecies,
          targetName: itemLane ? item!.name : fish?.name ?? contract.targetItemIdOrSpecies,
          rewardMoney: contract.rewardMoney,
          quantityFulfilled: contract.quantityFulfilled,
          quantityRequired: contract.quantityRequired,
          remaining,
          itemId: itemLane ? item!.id : undefined,
          ownedItems,
          deliverableItems,
          eligibleCargoIds,
          ready,
          blockerReasons
        };
      });

    return {
      marketId,
      name: marketDefinition.name,
      money: state.player.money,
      dayInSeason: dayOfSeason(state.clock.dayCount),
      buyRows,
      sellRows,
      fishRows,
      tradePackRows,
      rodRows,
      contractRows,
      bulkProduce: this.inspectBulkProduce(marketId),
      bulkFish: this.inspectBulkFish(marketId)
    };
  }

  public sellBulkProduce(marketId: MarketId): InteractionResult {
    const quote = this.inspectBulkProduce(marketId);
    if (!quote.success) return { success: false, reason: quote.reason };
    const { state, events } = this.context;
    const market = state.markets[marketId];
    const inventory = state.inventories[state.player.inventoryId];
    const lines = Object.keys(market.commodities)
      .filter((itemId) => MarketDomain.isBulkSellProduceItem(itemId))
      .map((itemId) => ({ itemId, quantity: InventoryManager.getItemCount(inventory, itemId) }))
      .filter((line) => line.quantity > 0)
      .map((line) => ({
        ...line,
        revenue: this.quoteSale(market.commodities[line.itemId], line.quantity).total
      }));
    if (!InventoryManager.removeItemsAtomically(inventory, lines)) {
      return { success: false, reason: "Your satchel changed before the sale" };
    }
    state.player.money += quote.revenue;
    for (const line of lines) {
      recordMarketSale(market, line.itemId, line.quantity);
      this.awardTradingXp(line.revenue, 0.1);
      events.emit("ItemSold", {
        marketId,
        itemId: line.itemId,
        quantity: line.quantity,
        revenue: line.revenue,
        minute: state.clock.currentMinute
      });
    }
    return { success: true, revenue: quote.revenue, quantity: quote.quantity };
  }

  public buySeed(
    marketId: MarketId,
    itemId: ItemId,
    quantity: number
  ): InteractionResult {
    const { state, events } = this.context;
    const failure = (reasonCode: BuySeedReasonCode, reason: string): InteractionResult => ({
      success: false,
      reasonCode,
      reason
    });
    const marketDefinition = ContentRegistry.markets.get(marketId);
    if (!marketDefinition || !state.markets[marketId]) return failure("not-seed-stall", "This market is unavailable");
    if (this.getNearbyMarketId() !== marketId) {
      return failure("too-far", "Move closer to the produce stall");
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      return failure("invalid-quantity", "Choose a positive whole quantity");
    }
    if (!isQuotableQuantity(quantity)) {
      return failure("invalid-quantity", "That quantity is more than the stall can quote");
    }
    const item = ContentRegistry.items.get(itemId);
    const starterCrop = [...ContentRegistry.crops.values()].find((crop) => crop.seedItemId === itemId);
    const isRetailSupply = marketDefinition.retail.itemIds.includes(itemId);
    if (
      !item ||
      (!starterCrop && !isRetailSupply) ||
      (starterCrop && (!marketDefinition.retail.seedCropIds?.includes(starterCrop.id) || item.category !== "seed"))
    ) {
      return failure("not-stocked", "That seed is not stocked here");
    }
    if (starterCrop && state.player.proficiencies.farming < starterCrop.minimumFarmingXp) {
      return failure("locked", `Requires ${starterCrop.minimumFarmingXp} Farming XP`);
    }
    const commodity = state.markets[marketId]?.commodities[itemId];
    if (commodity) {
      const available = Math.max(0, Math.floor(commodity.localSupply));
      if (quantity > available) {
        return failure("not-stocked", available <= 0 ? "Sold out" : `Only ${available} in stock`);
      }
    }
    const cost = commodity
      ? this.quotePurchase(marketId, commodity, quantity).total
      : Math.ceil(item.baseValue * MarketDomain.BUY_MARKUP) * quantity;
    if (state.player.money < cost) return failure("insufficient-funds", "Not enough money");
    const inventory = state.inventories[state.player.inventoryId];
    const purchase = [{ itemId, quantity }];
    if (!InventoryManager.canAddItems(inventory, purchase)) {
      return failure("inventory-full", "The satchel is full");
    }

    if (!InventoryManager.addItemsAtomically(inventory, purchase)) {
      return failure("inventory-full", "The satchel is full");
    }
    state.player.money -= cost;
    if (commodity) recordMarketPurchase(state.markets[marketId], itemId, quantity);
    events.emit("SeedPurchased", { marketId, itemId, quantity, cost, minute: state.clock.currentMinute });
    return { success: true, cost };
  }

  public buyItem(
    marketId: MarketId,
    itemId: ItemId,
    quantity: number
  ): { success: boolean; cost?: number; reason?: string } {
    const { state, events } = this.context;
    const market = state.markets[marketId];
    if (!market) return { success: false, reason: "Market not found" };
    if (this.getNearbyMarketId() !== marketId) return { success: false, reason: "You must be at this market to trade" };
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      return { success: false, reason: "Choose a positive whole quantity" };
    }
    if (!isQuotableQuantity(quantity)) {
      return { success: false, reason: "That quantity is more than the stall can quote" };
    }
    if (!ContentRegistry.markets.get(marketId)?.retail.itemIds.includes(itemId)) {
      return { success: false, reason: "This stall does not sell that supply" };
    }
    const item = ContentRegistry.items.get(itemId);
    if (!item) return { success: false, reason: "Market does not trade this item" };
    // A retail supply may have no tracked commodity. The shelf quote falls back
    // to base value in `inspectCommodity`, so the purchase must price it the same
    // way instead of rejecting a row the board presented as buyable.
    const commodity = market.commodities[itemId];
    if (commodity) {
      const available = Math.max(0, Math.floor(commodity.localSupply));
      if (quantity > available) {
        return { success: false, reason: available <= 0 ? "Sold out" : `Only ${available} in stock` };
      }
    }
    const cost = commodity
      ? this.quotePurchase(marketId, commodity, quantity).total
      : Math.ceil(item.baseValue * MarketDomain.BUY_MARKUP) * quantity;
    if (state.player.money < cost) return { success: false, reason: "Not enough money" };
    const inventory = state.inventories[state.player.inventoryId];
    const purchase = [{ itemId, quantity }];
    if (!InventoryManager.canAddItems(inventory, purchase)) {
      return { success: false, reason: "The satchel is full" };
    }

    if (!InventoryManager.addItemsAtomically(inventory, purchase)) {
      return { success: false, reason: "The satchel is full" };
    }
    state.player.money -= cost;
    if (commodity) recordMarketPurchase(market, itemId, quantity);
    events.emit("ItemPurchased", { marketId, itemId, quantity, cost, minute: state.clock.currentMinute });
    return { success: true, cost };
  }

  public buyRod(marketId: MarketId, rodId: RodId): InteractionResult {
    const { state, events } = this.context;
    const marketDefinition = ContentRegistry.markets.get(marketId);
    if (!state.markets[marketId] || !marketDefinition?.retail.rodIds?.includes(rodId)) {
      return { success: false, reason: "That tackle is not sold here" };
    }
    if (this.getNearbyMarketId() !== marketId) {
      return { success: false, reason: "Move closer to the harbor stall" };
    }
    const equipmentBlocker = this.equipment.equipBlocker();
    if (equipmentBlocker) return { success: false, reason: equipmentBlocker };
    const rod = ContentRegistry.rods.get(rodId);
    const prerequisite = previousRodId(rodId);
    const requiredXp = rodFishingXpRequirement(rodId);
    if (!rod || !prerequisite || requiredXp == null) {
      return { success: false, reason: "That rod is not for sale" };
    }
    if (state.player.ownedRodIds.includes(rodId)) {
      return { success: false, reason: "You already own this rod" };
    }
    if (!state.player.ownedRodIds.includes(prerequisite)) {
      return { success: false, reason: "Buy the previous rod first" };
    }
    if (state.player.proficiencies.fishing < requiredXp) {
      return { success: false, reason: `Requires ${requiredXp.toLocaleString()} Fishing XP` };
    }
    if (state.player.money < rod.costMoney) {
      return { success: false, reason: `Not enough money · ${rod.costMoney} G required` };
    }

    state.player.money -= rod.costMoney;
    state.player.ownedRodIds = [...state.player.ownedRodIds, rodId];
    state.player.equippedRodId = rodId;
    events.emit("RodPurchased", { marketId, rodId, cost: rod.costMoney, minute: state.clock.currentMinute });
    events.emit("RodEquipped", { marketId, rodId, minute: state.clock.currentMinute });
    return { success: true, cost: rod.costMoney };
  }

  public equipRod(marketId: MarketId, rodId: RodId): InteractionResult {
    const { state, events } = this.context;
    // A tackle stall lets you swap between rods you already own; it does not
    // have to stock the one you are switching to. Requiring that stranded
    // `rod.willow`, the starter rod, which is sold nowhere — once the player
    // bought any rod they could never equip the willow again. Ownership is
    // checked below and remains the real gate.
    const stallSellsTackle = (ContentRegistry.markets.get(marketId)?.retail.rodIds?.length ?? 0) > 0;
    if (!stallSellsTackle || this.getNearbyMarketId() !== marketId) {
      return { success: false, reason: "Change tackle at a stall that sells it" };
    }
    const equipmentBlocker = this.equipment.equipBlocker();
    if (equipmentBlocker) return { success: false, reason: equipmentBlocker };
    if (!state.player.ownedRodIds.includes(rodId) || !ContentRegistry.rods.has(rodId)) {
      return { success: false, reason: "You do not own this rod" };
    }
    if (state.player.equippedRodId === rodId) {
      return { success: true };
    }
    state.player.equippedRodId = rodId;
    events.emit("RodEquipped", { marketId, rodId, minute: state.clock.currentMinute });
    return { success: true };
  }

  public inspectFish(
    marketId: MarketId,
    cargoId: FishCargoId
  ): { success: boolean; breakdown?: FishPriceBreakdown; reason?: string } {
    const { state } = this.context;
    const market = state.markets[marketId];
    if (!market) return { success: false, reason: "Market not found" };
    if (this.getNearbyMarketId() !== marketId) return { success: false, reason: "You must be at this market to trade" };
    const fishCargo = state.fishCargo[cargoId];
    if (!fishCargo) return { success: false, reason: "Fish cargo not found" };
    if (this.isTradePack(fishCargo)) {
      return {
        success: false,
        reason: marketId === MarketDomain.FISH_TRADE_CENTER_MARKET_ID
          ? "Use the Trade packs counter to sell this carried pack"
          : "Fish trade packs are not sold at the Harbor Fish Market; carry them to the Village Produce Market"
      };
    }
    if (!this.navigation.canAccessFishCargo(fishCargo, marketId)) {
      return { success: false, reason: "Bring this fish cargo to the market dock" };
    }
    return this.priceFishCargo(marketId, fishCargo);
  }

  public inspectTradePack(
    marketId: MarketId,
    cargoId: FishCargoId
  ): { success: boolean; breakdown?: FishPriceBreakdown; reason?: string } {
    const { state } = this.context;
    const market = state.markets[marketId];
    if (!market) return { success: false, reason: "Market not found" };
    if (this.getNearbyMarketId() !== marketId) return { success: false, reason: "You must be at this market to trade" };
    if (marketId !== MarketDomain.FISH_TRADE_CENTER_MARKET_ID) {
      return { success: false, reason: "Carry fish trade packs to the Village Produce Market" };
    }
    const fishCargo = state.fishCargo[cargoId];
    if (!fishCargo) return { success: false, reason: "Fish cargo not found" };
    if (!this.isTradePack(fishCargo)) return { success: false, reason: "Only fish trade packs use this counter" };
    if (fishCargo.location.type !== "player" || state.player.carriedFishCargoId !== cargoId) {
      return { success: false, reason: "Collect this trade pack from the boat and carry it here" };
    }
    return this.priceFishCargo(marketId, fishCargo);
  }

  private priceFishCargo(
    marketId: MarketId,
    fishCargo: FishCargoState
  ): { success: boolean; breakdown?: FishPriceBreakdown; reason?: string } {
    const { state } = this.context;
    const market = state.markets[marketId];
    if (!market) return { success: false, reason: "Market not found" };
    const speciesDef = ContentRegistry.fishSpecies.get(fishCargo.speciesId);
    if (!speciesDef) return { success: false, reason: "Unknown fish species" };
    const commodity = market.commodities[fishCargo.speciesId];
    if (!commodity) return { success: false, reason: "Market does not trade this fish" };
    const demand = this.quoteSale(commodity, 1).averageDemandModifier;
    const breakdown = calculateFishPrice(
      speciesDef,
      fishCargo.weightKg,
      fishCargo.quality,
      fishCargo.freshness,
      demand,
      commodity.seasonalModifier
    );
    return { success: true, breakdown };
  }

  public sellFish(
    marketId: MarketId,
    cargoId: FishCargoId
  ): { success: boolean; revenue?: number; breakdown?: FishPriceBreakdown; reason?: string } {
    const { state, events } = this.context;
    const market = state.markets[marketId];
    if (!market) return { success: false, reason: "Market not found" };
    if (this.getNearbyMarketId() !== marketId) return { success: false, reason: "You must be at this market to trade" };
    const fishCargo = state.fishCargo[cargoId];
    if (!fishCargo) return { success: false, reason: "Fish cargo not found" };
    if (this.isTradePack(fishCargo)) {
      return {
        success: false,
        reason: "Fish trade packs are not sold through the fish market; carry them to the Village Produce Market"
      };
    }
    if (!this.navigation.canAccessFishCargo(fishCargo, marketId)) {
      return { success: false, reason: "Bring this fish cargo to the market dock" };
    }
    const speciesDef = ContentRegistry.fishSpecies.get(fishCargo.speciesId);
    if (!speciesDef) return { success: false, reason: "Unknown fish species" };
    if (fishCargo.freshness <= 0) return { success: false, reason: "Fish is spoiled and cannot be sold" };
    const commodity = market.commodities[fishCargo.speciesId];
    if (!commodity) return { success: false, reason: "Market does not trade this fish" };
    const demand = this.quoteSale(commodity, 1).averageDemandModifier;
    const breakdown = calculateFishPrice(
      speciesDef,
      fishCargo.weightKg,
      fishCargo.quality,
      fishCargo.freshness,
      demand,
      commodity.seasonalModifier
    );
    const revenue = breakdown.finalPrice;
    if (revenue <= 0) return { success: false, reason: "Fish has no market value" };

    this.cargo.clearPointers(fishCargo);
    delete state.fishCargo[cargoId];
    state.player.money += revenue;
    recordMarketSale(market, fishCargo.speciesId, 1);
    this.awardTradingXp(revenue, 0.15);
    events.emit("FishSold", {
      marketId,
      cargoId,
      speciesId: fishCargo.speciesId,
      revenue,
      minute: state.clock.currentMinute
    });
    return { success: true, revenue, breakdown };
  }

  public sellTradePack(
    marketId: MarketId,
    cargoId: FishCargoId
  ): { success: boolean; revenue?: number; breakdown?: FishPriceBreakdown; reason?: string } {
    const quote = this.inspectTradePack(marketId, cargoId);
    if (!quote.success) return { success: false, reason: quote.reason };
    const breakdown = quote.breakdown;
    if (!breakdown) return { success: false, reason: "This trade pack has no market quote" };
    const fishCargo = this.context.state.fishCargo[cargoId];
    if (!fishCargo) return { success: false, reason: "Fish cargo not found" };
    if (fishCargo.freshness <= 0) return { success: false, reason: "Fish is spoiled and cannot be sold" };
    if (breakdown.finalPrice <= 0) return { success: false, reason: "Fish has no market value" };

    this.commitFishSale(marketId, fishCargo, breakdown);
    return { success: true, revenue: breakdown.finalPrice, breakdown };
  }

  public inspectBulkFish(marketId: MarketId): BulkSaleQuote {
    const market = this.context.state.markets[marketId];
    if (!market) return this.emptyBulkQuote("Market not found");
    if (this.getNearbyMarketId() !== marketId) return this.emptyBulkQuote("Move closer to the stall");
    const lines = this.marketableFishAt(marketId);
    if (lines.length === 0) return this.emptyBulkQuote("No fresh fish to sell here");
    return {
      success: true,
      quantity: lines.length,
      lineCount: lines.length,
      revenue: lines.reduce((total, line) => total + line.breakdown.finalPrice, 0)
    };
  }

  public sellBulkFish(marketId: MarketId): InteractionResult {
    const quote = this.inspectBulkFish(marketId);
    if (!quote.success) return { success: false, reason: quote.reason };
    const { state, events } = this.context;
    const market = state.markets[marketId];
    const lines = this.marketableFishAt(marketId);
    if (lines.length !== quote.quantity) {
      return { success: false, reason: "The fish hold changed before the sale" };
    }
    for (const line of lines) {
      this.cargo.clearPointers(line.cargo);
      delete state.fishCargo[line.cargo.id];
    }
    state.player.money += quote.revenue;
    for (const line of lines) {
      const revenue = line.breakdown.finalPrice;
      recordMarketSale(market, line.cargo.speciesId, 1);
      this.awardTradingXp(revenue, 0.15);
      events.emit("FishSold", {
        marketId,
        cargoId: line.cargo.id,
        speciesId: line.cargo.speciesId,
        revenue,
        minute: state.clock.currentMinute
      });
    }
    return { success: true, revenue: quote.revenue, quantity: quote.quantity };
  }

  private marketableFishAt(marketId: MarketId): Array<{
    cargo: FishCargoState;
    breakdown: FishPriceBreakdown;
  }> {
    const { state } = this.context;
    const market = state.markets[marketId];
    if (!market) return [];
    const lines: Array<{
      cargo: FishCargoState;
      breakdown: FishPriceBreakdown;
    }> = [];
    const shadowSupply = new Map<string, number>();
    const cargoEntries = Object.values(state.fishCargo).slice().sort((a, b) => a.id.localeCompare(b.id));
    for (const cargo of cargoEntries) {
      if (
        cargo.freshness <= 0 ||
        this.isTradePack(cargo) ||
        !this.navigation.canAccessFishCargo(cargo, marketId)
      ) continue;
      const species = ContentRegistry.fishSpecies.get(cargo.speciesId);
      const commodity = market.commodities[cargo.speciesId];
      if (!species || !commodity) continue;
      const quotedCommodity = {
        ...commodity,
        localSupply: shadowSupply.get(cargo.speciesId) ?? commodity.localSupply
      };
      const marketQuote = this.quoteSale(quotedCommodity, 1);
      shadowSupply.set(cargo.speciesId, marketQuote.supplyAfter);
      const breakdown = calculateFishPrice(
        species,
        cargo.weightKg,
        cargo.quality,
        cargo.freshness,
        marketQuote.averageDemandModifier,
        commodity.seasonalModifier
      );
      if (breakdown.finalPrice > 0) lines.push({ cargo, breakdown });
    }
    return lines;
  }

  private commitFishSale(
    marketId: MarketId,
    fishCargo: FishCargoState,
    breakdown: FishPriceBreakdown
  ): void {
    const { state, events } = this.context;
    const market = state.markets[marketId];
    if (!market) return;
    this.cargo.clearPointers(fishCargo);
    delete state.fishCargo[fishCargo.id];
    state.player.money += breakdown.finalPrice;
    recordMarketSale(market, fishCargo.speciesId, 1);
    this.awardTradingXp(breakdown.finalPrice, 0.15);
    events.emit("FishSold", {
      marketId,
      cargoId: fishCargo.id,
      speciesId: fishCargo.speciesId,
      revenue: breakdown.finalPrice,
      minute: state.clock.currentMinute
    });
  }

  private isTradePack(cargo: FishCargoState): boolean {
    const species = ContentRegistry.fishSpecies.get(cargo.speciesId);
    return species ? isPhysicalTradePackSpecies(species) : false;
  }

  private emptyBulkQuote(reason: string): BulkSaleQuote {
    return { success: false, quantity: 0, lineCount: 0, revenue: 0, reason };
  }

  private quoteSale(commodity: Parameters<typeof quoteCommoditySale>[0], quantity: number): CommodityMarketQuote {
    return quoteCommoditySale(commodity, quantity, {
      absoluteHour: this.context.state.clock.currentMinute / 60,
      worldSeed: this.context.state.worldSeed
    });
  }

  private quotePurchase(
    marketId: MarketId,
    commodity: Parameters<typeof quoteCommodityPurchase>[0],
    quantity: number
  ): CommodityMarketQuote {
    const market = ContentRegistry.markets.get(marketId);
    const workshopSupply = market?.retail.workshopSupplyItemIds?.includes(commodity.itemId) === true;
    return quoteCommodityPurchase(commodity, quantity, {
      absoluteHour: this.context.state.clock.currentMinute / 60,
      worldSeed: this.context.state.worldSeed,
      minimumEffectiveModifier: this.bestWholesaleEffectiveModifier(commodity.itemId),
      ...(workshopSupply ? { retailMarkup: WORKSHOP_SUPPLY_MARKUP } : {})
    });
  }

  private bestWholesaleEffectiveModifier(itemId: ItemId): number {
    const { state } = this.context;
    let best = 0;
    for (const market of Object.values(state.markets)) {
      const commodity = market.commodities[itemId];
      if (!commodity) continue;
      const demand = demandFromSupply(
        commodity,
        commodity.localSupply,
        state.clock.currentMinute / 60,
        state.worldSeed
      );
      best = Math.max(best, demand * commodity.seasonalModifier);
    }
    return best;
  }

  private awardTradingXp(revenue: number, rate: number): void {
    const xp = Math.floor(Math.max(0, revenue) * rate);
    if (xp > 0) this.progression.addProficiencyXp("trading", xp);
  }

  private retailItemIds(marketId: MarketId): ItemId[] {
    const market = ContentRegistry.markets.get(marketId);
    if (!market) return [];
    const seedItems = (market.retail.seedCropIds ?? []).flatMap((cropId) => {
      const crop = ContentRegistry.crops.get(cropId);
      return crop ? [crop.seedItemId] : [];
    });
    return [...new Set([...seedItems, ...market.retail.itemIds])];
  }

  public tick(): void {
    const { state, events } = this.context;
    for (const market of Object.values(state.markets)) {
      if (tickMarket(market, state.clock.currentMinute, state.clock.season, state.worldSeed)) {
        events.emit("MarketTicked", { marketId: market.id, minute: state.clock.currentMinute });
      }
    }
  }
}
