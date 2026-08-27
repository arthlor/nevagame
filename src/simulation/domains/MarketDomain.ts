import { ContentRegistry } from "../../content/ContentRegistry";
import { calculateCommodityUnitPrice } from "../economy/calculateCommodityValue";
import { calculateFishPrice } from "../economy/calculateFishValue";
import { recordMarketSale, tickMarket } from "../economy/updateMarket";
import type { FishCargoId, ItemId, MarketId } from "../core/types";
import { InventoryManager } from "../inventory/InventoryManager";
import type { CargoDomain } from "./CargoDomain";
import type { DomainContext } from "./DomainContext";
import type { NavigationDomain } from "./NavigationDomain";
import type { ProgressionDomain } from "./ProgressionDomain";
import type { BuySeedReasonCode, InteractionResult } from "../core/contracts";

export class MarketDomain {
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
    const starterCrop = [...ContentRegistry.crops.values()].find(
      (crop) =>
        crop.seedItemId === itemId &&
        ["crop.wheat", "crop.tomato", "crop.potato", "crop.barley"].includes(crop.id)
    );
    if (!item || item.category !== "seed" || !starterCrop) {
      return failure("not-stocked", "That seed is not stocked here");
    }
    if (state.player.proficiencies.farming < starterCrop.minimumFarmingXp) {
      return failure("locked", `Requires ${starterCrop.minimumFarmingXp} Farming XP`);
    }
    const cost = item.baseValue * quantity;
    if (state.player.money < cost) return failure("insufficient-funds", "Not enough money");
    const inventory = state.inventories[state.player.inventoryId];
    const purchase = [{ itemId, quantity }];
    if (!InventoryManager.canAddItems(inventory, purchase)) {
      return failure("inventory-full", "Your backpack is full");
    }

    InventoryManager.addItemsAtomically(inventory, purchase);
    state.player.money -= cost;
    events.emit("SeedPurchased", { marketId, itemId, quantity, cost, minute: state.clock.currentMinute });
    return { success: true, cost };
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
