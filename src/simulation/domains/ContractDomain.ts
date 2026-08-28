import type { ContractTemplateDefinition } from "../../content/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { contractDeliveryMarketId } from "../../content/contracts";
import { isVillageSeedCrop } from "../../content/markets";
import type { FishCargoId, FishQuality, GameState, ItemId } from "../core/types";
import type { SeededRng } from "../core/Rng";
import { InventoryManager } from "../inventory/InventoryManager";
import type { CargoDomain } from "./CargoDomain";
import type { DomainContext } from "./DomainContext";
import type { MarketDomain } from "./MarketDomain";
import type { NavigationDomain } from "./NavigationDomain";
import type { ProgressionDomain } from "./ProgressionDomain";
import { cargoClassFits, qualityRank, rodMeetsMinimum } from "./domainRules";
import { SCHOOL_SPAWN_POINTS } from "./FishingDomain";

function feasibleContractTarget(
  state: GameState,
  template: ContractTemplateDefinition
): string | null {
  const requiredXp = template.requiredXp ?? 0;
  if (state.player.proficiencies[template.rewardSkill] < requiredXp) return null;

  for (const targetId of template.itemOrSpeciesPool) {
    if (template.type === "produce") {
      const crop = [...ContentRegistry.crops.values()].find((candidate) => candidate.harvestItemId === targetId);
      const villageMarket = state.markets["market.village"];
      if (
        crop &&
        isVillageSeedCrop(crop.id) &&
        state.player.proficiencies.farming >= crop.minimumFarmingXp &&
        villageMarket?.commodities[targetId]
      ) {
        return targetId;
      }
      continue;
    }

    const fish = ContentRegistry.fishSpecies.get(targetId);
    const rod = ContentRegistry.rods.get(state.player.equippedRodId);
    const harborMarket = state.markets["market.harbor"];
    if (
      !fish ||
      !fish.isSportFish ||
      !rod ||
      !harborMarket?.commodities[targetId] ||
      !state.quests.unlockedFeatureIds.includes("boat.player_rowboat") ||
      !fish.seasons.includes(state.clock.season) ||
      (template.minQuality !== undefined && qualityRank(template.minQuality) > qualityRank("trophy")) ||
      (template.minWeightKgRange !== undefined && template.minWeightKgRange[0] > fish.weightKg.max)
    ) {
      continue;
    }

    const hasReachableSchool = SCHOOL_SPAWN_POINTS.some(
      (point) => fish.habitats.includes(point.habitatId) && rod.allowedHabitats.includes(point.habitatId)
    );
    if (!hasReachableSchool || !rodMeetsMinimum(rod.rodClass, fish.minimumRodClass)) continue;

    const hasCargoCapacity = fish.cargoClass === "small" || fish.cargoClass === "medium"
      || Object.values(state.boats).some((boat) => {
        const definition = ContentRegistry.boats.get(boat.boatTypeId);
        return definition?.fishCargoSlots.some((slot) => cargoClassFits(fish.cargoClass, slot.maxCargoClass));
      });
    if (hasCargoCapacity) return targetId;
  }

  return null;
}

export function refillContractsInState(
  state: GameState,
  nextEntityId: (prefix: string) => string
): void {
  const active = state.contracts.filter((c) => c.status === "active");
  if (active.length >= 2) return;

  const needed = 2 - active.length;
  const activeTemplateIds = new Set(active.map((c) => c.templateId));
  const eligibleTemplates = [...ContentRegistry.contractTemplates.values()].flatMap((template) => {
    if (activeTemplateIds.has(template.id)) return [];
    const targetId = feasibleContractTarget(state, template);
    return targetId ? [{ template, targetId }] : [];
  });

  for (let i = 0; i < Math.min(needed, eligibleTemplates.length); i++) {
    const { template, targetId: targetItem } = eligibleTemplates[i];
    const itemDef = ContentRegistry.items.get(targetItem) ?? ContentRegistry.fishSpecies.get(targetItem);
    const baseVal = itemDef ? ("baseValue" in itemDef ? itemDef.baseValue : itemDef.baseMarketValue) : 10;
    const quantity = template.quantityRange[0];
    const rewardMoney = Math.round(baseVal * quantity * template.rewardBaseMultiplier);

    state.contracts.push({
      id: nextEntityId("contract"),
      templateId: template.id,
      requesterId: template.requesterName,
      type: template.type,
      targetItemIdOrSpecies: targetItem,
      quantityRequired: quantity,
      quantityFulfilled: 0,
      minQuality: template.minQuality,
      minFreshness: template.minFreshness,
      minWeightKg: template.minWeightKgRange ? template.minWeightKgRange[0] : undefined,
      rewardMoney,
      rewardSkillXp: { skill: template.rewardSkill, xp: 150 },
      expiresAtMinute: state.clock.currentMinute + template.durationMinutes,
      status: "active"
    });
  }
}

const MAX_ACTIVE_CONTRACTS = 2;
const FISH_QUALITIES: readonly FishQuality[] = ["common", "fine", "exceptional", "trophy"];

export function expireContracts(state: GameState): void {
  for (const contract of state.contracts) {
    if (contract.status === "active" && state.clock.currentMinute >= contract.expiresAtMinute) {
      refundAndExpireContract(state, contract);
    }
  }
}

function refundAndExpireContract(state: GameState, contract: GameState["contracts"][number]): void {
  contract.status = "expired";
  if (contract.type !== "produce" || contract.quantityFulfilled <= 0) return;
  const itemId = contract.targetItemIdOrSpecies;
  const quantity = contract.quantityFulfilled;
  const inventory = state.inventories[state.player.inventoryId];
  const stack = [{ itemId, quantity }];
  if (inventory && InventoryManager.canAddItems(inventory, stack)) {
    InventoryManager.addItemsAtomically(inventory, stack);
    contract.quantityFulfilled = 0;
    return;
  }
  const item = ContentRegistry.items.get(itemId);
  if (item) {
    state.player.money += item.baseValue * quantity;
    contract.quantityFulfilled = 0;
  }
}

function contractTargetBaseValue(targetId: string): number | null {
  const item = ContentRegistry.items.get(targetId);
  if (item) return item.baseValue;
  const fish = ContentRegistry.fishSpecies.get(targetId);
  return fish ? fish.baseMarketValue : null;
}

function isValidContractTarget(targetId: string): boolean {
  return ContentRegistry.items.has(targetId) || ContentRegistry.fishSpecies.has(targetId);
}

function asFishQuality(value: string | undefined): FishQuality | undefined {
  return value && FISH_QUALITIES.includes(value as FishQuality) ? value as FishQuality : undefined;
}

function eligibleContractTemplates(state: GameState): ContractTemplateDefinition[] {
  const activeTemplateIds = new Set(
    state.contracts.filter((contract) => contract.status === "active").map((contract) => contract.templateId)
  );
  return [...ContentRegistry.contractTemplates.values()].filter((template) => {
    if (activeTemplateIds.has(template.id)) return false;
    if (state.player.proficiencies[template.rewardSkill] < (template.requiredXp ?? 0)) return false;
    return template.itemOrSpeciesPool.some(isValidContractTarget);
  });
}

export function refillContracts(
  state: GameState,
  rng: SeededRng,
  nextEntityId: (prefix: string) => string
): void {
  const activeCount = () => state.contracts.filter((contract) => contract.status === "active").length;
  while (activeCount() < MAX_ACTIVE_CONTRACTS) {
    const eligible = eligibleContractTemplates(state);
    if (eligible.length === 0) return;
    const template = eligible[rng.intInclusive(0, eligible.length - 1)];
    const pool = template.itemOrSpeciesPool.filter(isValidContractTarget);
    if (pool.length === 0) return;
    const targetId = pool[rng.intInclusive(0, pool.length - 1)];
    const baseValue = contractTargetBaseValue(targetId);
    if (baseValue === null) return;
    const quantityRequired = rng.intInclusive(template.quantityRange[0], template.quantityRange[1]);
    const rewardMoney = Math.max(1, Math.round(baseValue * quantityRequired * template.rewardBaseMultiplier));
    const minWeightKg = template.minWeightKgRange
      ? rng.range(template.minWeightKgRange[0], template.minWeightKgRange[1])
      : undefined;
    state.contracts.push({
      id: nextEntityId("contract"),
      templateId: template.id,
      requesterId: template.id,
      type: template.type,
      targetItemIdOrSpecies: targetId,
      quantityRequired,
      quantityFulfilled: 0,
      minQuality: asFishQuality(template.minQuality),
      minFreshness: template.minFreshness,
      minWeightKg,
      rewardMoney,
      rewardSkillXp: {
        skill: template.rewardSkill,
        xp: Math.max(50, quantityRequired * 25)
      },
      expiresAtMinute: state.clock.currentMinute + template.durationMinutes,
      status: "active"
    });
  }
}

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
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { success: false, reason: "Delivery quantity must be a positive whole number" };
    }
    const contract = this.getActive(contractId);
    if (!contract) return { success: false, reason: "Contract is not active" };
    const nearbyMarketId = this.market.getNearbyMarketId();
    const requiredMarketId = contractDeliveryMarketId(contract.type);
    if (nearbyMarketId !== requiredMarketId) {
      return {
        success: false,
        reason: requiredMarketId === "market.village"
          ? "Deliver this produce at the Village Produce Market"
          : "Deliver this order at the Harbor Fish Market"
      };
    }
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
    const contract = this.getActive(contractId);
    if (!contract) return { success: false, reason: "Contract is not active" };
    const requiredMarketId = contractDeliveryMarketId(contract.type);
    if (nearbyMarketId !== requiredMarketId) {
      return { success: false, reason: "Bring this fish cargo to the Harbor Fish Market" };
    }
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
    expireContracts(this.context.state);
    refillContracts(this.context.state, this.context.rng, this.context.nextEntityId);
    this.context.persistRng();
  }

  public refillContracts(): void {
    refillContractsInState(this.context.state, this.context.nextEntityId);
  }

  private getActive(contractId: string): GameState["contracts"][number] | null {
    const { state } = this.context;
    const contract = state.contracts.find((candidate) => candidate.id === contractId);
    if (!contract || contract.status !== "active") return null;
    if (state.clock.currentMinute >= contract.expiresAtMinute) {
      refundAndExpireContract(state, contract);
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
