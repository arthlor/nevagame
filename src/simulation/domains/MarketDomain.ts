import { ContentRegistry } from "../../content/ContentRegistry";
import { calculateCommodityUnitPrice } from "../economy/calculateCommodityValue";
import { calculateFishPrice } from "../economy/calculateFishValue";
import { recordMarketSale, tickMarket } from "../economy/updateMarket";
import type { FishCargoId, ItemId, MarketId } from "../core/types";
import type { RodId } from "../core/types";
import { InventoryManager } from "../inventory/InventoryManager";
import type { CargoDomain } from "./CargoDomain";
import type { DomainContext } from "./DomainContext";
import type { NavigationDomain } from "./NavigationDomain";
import type { ProgressionDomain } from "./ProgressionDomain";
import type { BuySeedReasonCode, InteractionResult } from "../core/contracts";
import { isVillageSeedCrop } from "../../content/markets";
import { previousRodId, rodFishingXpRequirement } from "../../content/rods";

export class MarketDomain {
  public static readonly HARBOR_BUYABLE = [
    "item.crushed_ice",
    "item.chum_bucket",
    "item.boat_fuel",
    "item.bait_worms"
  ] as const;

  public static readonly VILLAGE_SUPPLIES = ["item.basic_fertilizer", "item.compost_starter"] as const;
  public static readonly BULK_SELL_PRODUCE_CATEGORIES = ["produce", "grain"] as const;

  public static isBulkSellProduceItem(itemId: ItemId): boolean {
    const category = ContentRegistry.items.get(itemId)?.category;
    return category === "produce" || category === "grain";
  }

  constructor(
    private readonly context: DomainContext,
    private readonly navigation: NavigationDomain,
    private readonly cargo: CargoDomain,
    private readonly progression: ProgressionDomain
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
    const inventory = state.inventories[state.player.inventoryId];
    if (!InventoryManager.hasItems(inventory, [{ itemId, quantity }])) {
      return { success: false, reason: "You do not have enough of this item" };
    }

    const revenue = calculateCommodityUnitPrice(commodity).unitPrice * quantity;
    InventoryManager.removeItemsAtomically(inventory, [{ itemId, quantity }]);
    state.player.money += revenue;
    recordMarketSale(market, itemId, quantity);
    this.progression.addProficiencyXp("trading", Math.max(5, Math.floor(revenue * 0.1)));
    events.emit("ItemSold", { marketId, itemId, quantity, revenue, minute: state.clock.currentMinute });
    return { success: true, revenue };
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
    if (marketId !== "market.village" || !state.markets[marketId]) {
      return failure("not-seed-stall", "Seeds are sold at the produce stall");
    }
    if (this.getNearbyMarketId() !== marketId) {
      return failure("too-far", "Move closer to the produce stall");
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      return failure("invalid-quantity", "Choose a positive whole quantity");
    }
    const item = ContentRegistry.items.get(itemId);
    const starterCrop = [...ContentRegistry.crops.values()].find((crop) => crop.seedItemId === itemId);
    const isVillageSupply = (MarketDomain.VILLAGE_SUPPLIES as readonly ItemId[]).includes(itemId);
    if (
      !item ||
      (!starterCrop && !isVillageSupply) ||
      (starterCrop && (!isVillageSeedCrop(starterCrop.id) || item.category !== "seed"))
    ) {
      return failure("not-stocked", "That seed is not stocked here");
    }
    if (starterCrop && state.player.proficiencies.farming < starterCrop.minimumFarmingXp) {
      return failure("locked", `Requires ${starterCrop.minimumFarmingXp} Farming XP`);
    }
    const commodity = state.markets[marketId]?.commodities[itemId];
    const unitPrice = commodity
      ? calculateCommodityUnitPrice(commodity).unitPrice
      : item.baseValue;
    const cost = unitPrice * quantity;
    if (state.player.money < cost) return failure("insufficient-funds", "Not enough money");
    const inventory = state.inventories[state.player.inventoryId];
    const purchase = [{ itemId, quantity }];
    if (!InventoryManager.canAddItems(inventory, purchase)) {
      return failure("inventory-full", "Your backpack is full");
    }

    InventoryManager.addItemsAtomically(inventory, purchase);
    state.player.money -= cost;
    if (commodity) {
      commodity.localSupply = Math.max(1, commodity.localSupply - quantity);
    }
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
    const isHarborBuyable = marketId === "market.harbor" && MarketDomain.HARBOR_BUYABLE.includes(itemId as (typeof MarketDomain.HARBOR_BUYABLE)[number]);
    const isVillageBuyable =
      marketId === "market.village" &&
      (MarketDomain.VILLAGE_SUPPLIES as readonly ItemId[]).includes(itemId);
    if (!isHarborBuyable && !isVillageBuyable) {
      return { success: false, reason: "This stall does not sell that supply" };
    }
    const item = ContentRegistry.items.get(itemId);
    const commodity = market.commodities[itemId];
    if (!item || !commodity) return { success: false, reason: "Market does not trade this item" };
    const unitPrice = calculateCommodityUnitPrice(commodity).unitPrice;
    const cost = unitPrice * quantity;
    if (state.player.money < cost) return { success: false, reason: "Not enough money" };
    const inventory = state.inventories[state.player.inventoryId];
    const purchase = [{ itemId, quantity }];
    if (!InventoryManager.canAddItems(inventory, purchase)) {
      return { success: false, reason: "Your backpack is full" };
    }

    InventoryManager.addItemsAtomically(inventory, purchase);
    state.player.money -= cost;
    commodity.localSupply = Math.max(1, commodity.localSupply - quantity);
    events.emit("ItemPurchased", { marketId, itemId, quantity, cost, minute: state.clock.currentMinute });
    return { success: true, cost };
  }

  public buyRod(marketId: MarketId, rodId: RodId): InteractionResult {
    const { state, events } = this.context;
    if (marketId !== "market.harbor" || !state.markets[marketId]) {
      return { success: false, reason: "Fishing tackle is sold at the harbor" };
    }
    if (this.getNearbyMarketId() !== marketId) {
      return { success: false, reason: "Move closer to the harbor stall" };
    }
    if (state.basicFishing || state.sportFishing) {
      return { success: false, reason: "Finish fishing before changing tackle" };
    }
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
    if (marketId !== "market.harbor" || this.getNearbyMarketId() !== marketId) {
      return { success: false, reason: "Change tackle at the harbor stall" };
    }
    if (state.basicFishing || state.sportFishing) {
      return { success: false, reason: "Finish fishing before changing tackle" };
    }
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

  public sellFish(
    marketId: MarketId,
    cargoId: FishCargoId
  ): { success: boolean; revenue?: number; reason?: string } {
    const { state, events } = this.context;
    const market = state.markets[marketId];
    if (!market) return { success: false, reason: "Market not found" };
    if (this.getNearbyMarketId() !== marketId) return { success: false, reason: "You must be at this market to trade" };
    const fishCargo = state.fishCargo[cargoId];
    if (!fishCargo) return { success: false, reason: "Fish cargo not found" };
    if (!this.navigation.canAccessFishCargo(fishCargo, marketId)) {
      return { success: false, reason: "Bring this fish cargo to the market dock" };
    }
    const speciesDef = ContentRegistry.fishSpecies.get(fishCargo.speciesId);
    if (!speciesDef) return { success: false, reason: "Unknown fish species" };
    if (fishCargo.freshness <= 0) return { success: false, reason: "Fish is spoiled and cannot be sold" };
    const commodity = market.commodities[fishCargo.speciesId];
    if (!commodity) return { success: false, reason: "Market does not trade this fish" };
    const revenue = calculateFishPrice(
      speciesDef,
      fishCargo.weightKg,
      fishCargo.quality,
      fishCargo.freshness,
      commodity.demandIndex,
      commodity.seasonalModifier
    ).finalPrice;
    if (revenue <= 0) return { success: false, reason: "Fish has no market value" };

    this.cargo.clearPointers(fishCargo);
    delete state.fishCargo[cargoId];
    state.player.money += revenue;
    recordMarketSale(market, fishCargo.speciesId, 1);
    this.progression.addProficiencyXp("trading", Math.max(10, Math.floor(revenue * 0.15)));
    events.emit("FishSold", {
      marketId,
      cargoId,
      speciesId: fishCargo.speciesId,
      revenue,
      minute: state.clock.currentMinute
    });
    return { success: true, revenue };
  }

  public tick(): void {
    const { state, rng, events } = this.context;
    for (const market of Object.values(state.markets)) {
      if (tickMarket(market, state.clock.currentMinute, state.clock.season, rng)) {
        events.emit("MarketTicked", { marketId: market.id, minute: state.clock.currentMinute });
      }
    }
  }
}
