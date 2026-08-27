import type { FishCargoId, GameState, ItemId } from "../core/types";
import { InventoryManager } from "../inventory/InventoryManager";
import { ContentRegistry } from "../../content/ContentRegistry";
import type { CargoDomain } from "./CargoDomain";
import type { DomainContext } from "./DomainContext";
import type { MarketDomain } from "./MarketDomain";
import type { NavigationDomain } from "./NavigationDomain";
import type { ProgressionDomain } from "./ProgressionDomain";
import { qualityRank } from "./domainRules";

const MAX_ACTIVE_CONTRACTS = 2;

export class ContractDomain {
  constructor(
    private readonly context: DomainContext,
    private readonly market: MarketDomain,
    private readonly navigation: NavigationDomain,
    private readonly cargo: CargoDomain,
    private readonly progression: ProgressionDomain
  ) {}

  public deliverItems(
    contractId: string,
    itemId: ItemId,
    quantity: number
  ): { success: boolean; delivered?: number; completed?: boolean; rewardMoney?: number; reason?: string } {
    const { state } = this.context;
    if (!this.market.getNearbyMarketId()) return { success: false, reason: "Deliver contracts at a market" };
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { success: false, reason: "Delivery quantity must be a positive whole number" };
    }
    const contract = this.getActive(contractId);
    if (!contract) return { success: false, reason: "Contract is not active" };
    if (contract.targetItemIdOrSpecies !== itemId) {
      return { success: false, reason: "This contract does not accept that item" };
    }
    if (contract.type === "fresh-fish" || contract.type === "quality-target") {
      return { success: false, reason: "This contract requires physical fish cargo" };
    }
    const remaining = contract.quantityRequired - contract.quantityFulfilled;
    if (quantity > remaining) return { success: false, reason: `Only ${remaining} more needed for this contract` };
    const inventory = state.inventories[state.player.inventoryId];
    if (!InventoryManager.hasItems(inventory, [{ itemId, quantity }])) {
      return { success: false, reason: "You do not have enough items to deliver" };
    }
    InventoryManager.removeItemsAtomically(inventory, [{ itemId, quantity }]);
    contract.quantityFulfilled += quantity;
    const completion = this.completeIfFulfilled(contract);
    return { success: true, delivered: quantity, completed: completion.completed, rewardMoney: completion.rewardMoney };
  }

  public deliverFish(
    contractId: string,
    cargoId: FishCargoId
  ): { success: boolean; delivered?: number; completed?: boolean; rewardMoney?: number; reason?: string } {
    const { state } = this.context;
    const nearbyMarketId = this.market.getNearbyMarketId();
    if (!nearbyMarketId) return { success: false, reason: "Deliver contracts at a market" };
    const contract = this.getActive(contractId);
    if (!contract) return { success: false, reason: "Contract is not active" };
    const fishCargo = state.fishCargo[cargoId];
    if (!fishCargo) return { success: false, reason: "Fish cargo not found" };
    if (!this.navigation.canAccessFishCargo(fishCargo, nearbyMarketId)) {
      return { success: false, reason: "Bring this fish cargo to the market dock" };
    }
    if (contract.targetItemIdOrSpecies !== fishCargo.speciesId) {
      return { success: false, reason: "This contract requires a different species" };
    }
    if (contract.quantityFulfilled >= contract.quantityRequired) {
      return { success: false, reason: "Contract is already fully delivered" };
    }
    if (contract.minQuality && qualityRank(fishCargo.quality) < qualityRank(contract.minQuality)) {
      return { success: false, reason: `Contract requires ${contract.minQuality} quality or better` };
    }
    if (contract.minFreshness !== undefined && fishCargo.freshness < contract.minFreshness) {
      return { success: false, reason: `Contract requires at least ${contract.minFreshness}% freshness` };
    }
    if (contract.minWeightKg !== undefined && fishCargo.weightKg < contract.minWeightKg) {
      return { success: false, reason: `Contract requires at least ${contract.minWeightKg} kg` };
    }

    this.cargo.clearPointers(fishCargo);
    delete state.fishCargo[cargoId];
    contract.quantityFulfilled += 1;
    const completion = this.completeIfFulfilled(contract);
    return { success: true, delivered: 1, completed: completion.completed, rewardMoney: completion.rewardMoney };
  }

  public tick(): void {
    const { state } = this.context;
    for (const contract of state.contracts) {
      if (contract.status === "active" && state.clock.currentMinute >= contract.expiresAtMinute) {
        contract.status = "expired";
      }
    }
    this.refillContracts();
  }

  public refillContracts(): void {
    const { state, rng } = this.context;
    const eligible = [...ContentRegistry.contractTemplates.values()].filter((template) => {
      const required = template.requiredXp ?? 0;
      return state.player.proficiencies[template.rewardSkill] >= required;
    });

    while (state.contracts.filter((contract) => contract.status === "active").length < MAX_ACTIVE_CONTRACTS) {
      const activeTemplates = new Set(
        state.contracts.filter((contract) => contract.status === "active").map((contract) => contract.templateId)
      );
      const remaining = eligible.filter((template) => !activeTemplates.has(template.id));
      if (remaining.length === 0) break;
      const template = remaining[rng.intInclusive(0, remaining.length - 1)];
      if (!template) break;
      const target = template.itemOrSpeciesPool[rng.intInclusive(0, template.itemOrSpeciesPool.length - 1)];
      if (!target) break;
      const quantity = rng.intInclusive(template.quantityRange[0], template.quantityRange[1]);
      const base = ContentRegistry.items.get(target)?.baseValue
        ?? ContentRegistry.fishSpecies.get(target)?.baseMarketValue
        ?? 10;
      const rewardMoney = Math.max(1, Math.round(base * quantity * template.rewardBaseMultiplier));
      const minWeight = template.minWeightKgRange
        ? rng.range(template.minWeightKgRange[0], template.minWeightKgRange[1])
        : undefined;
      state.contracts.push({
        id: this.context.nextEntityId("contract"),
        templateId: template.id,
        requesterId: template.requesterName,
        type: template.type,
        targetItemIdOrSpecies: target,
        quantityRequired: quantity,
        quantityFulfilled: 0,
        minQuality: template.minQuality,
        minFreshness: template.minFreshness,
        minWeightKg: minWeight,
        rewardMoney,
        rewardSkillXp: {
          skill: template.rewardSkill,
          xp: Math.max(40, quantity * 25)
        },
        expiresAtMinute: state.clock.currentMinute + template.durationMinutes,
        status: "active"
      });
    }
  }

  private getActive(contractId: string): GameState["contracts"][number] | null {
    const { state } = this.context;
    const contract = state.contracts.find((candidate) => candidate.id === contractId);
    if (!contract || contract.status !== "active") return null;
    if (state.clock.currentMinute >= contract.expiresAtMinute) {
      contract.status = "expired";
      return null;
    }
    return contract;
  }

  private completeIfFulfilled(
    contract: GameState["contracts"][number]
  ): { completed: boolean; rewardMoney?: number } {
    const { state, events } = this.context;
    if (contract.quantityFulfilled < contract.quantityRequired) return { completed: false };
    contract.quantityFulfilled = contract.quantityRequired;
    contract.status = "completed";
    state.player.money += contract.rewardMoney;
    this.progression.addProficiencyXp(contract.rewardSkillXp.skill, contract.rewardSkillXp.xp);
    events.emit("ContractCompleted", {
      contractId: contract.id,
      rewardMoney: contract.rewardMoney,
      minute: state.clock.currentMinute
    });
    return { completed: true, rewardMoney: contract.rewardMoney };
  }
}
