import type { ContractTemplateDefinition } from "../../content/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { contractDeliveryMarketId } from "../../content/contracts";
import type { FishCargoId, FishQuality, GameState, ItemId } from "../core/types";
import type { SeededRng } from "../core/Rng";
import { InventoryManager } from "../inventory/InventoryManager";
import type { CargoDomain } from "./CargoDomain";
import type { DomainContext } from "./DomainContext";
import type { MarketDomain } from "./MarketDomain";
import type { NavigationDomain } from "./NavigationDomain";
import type { ProgressionDomain } from "./ProgressionDomain";
import { cargoClassFits, isProduceContractType, qualityRank, rodMeetsMinimum } from "./domainRules";
import { isSpeciesInSeason } from "../fishing/seasonalAvailability";
import { SCHOOL_SPAWN_POINTS } from "./FishingDomain";
import { getFishWeightMultiplier, getQualityMultiplier } from "../economy/calculateFishValue";
import { getFreshnessPriceMultiplier } from "../fishing/calculateFreshness";
import { contractSlotsForRank, getRankForXp } from "../../content/progression";


const FISH_QUALITIES: readonly FishQuality[] = ["common", "fine", "exceptional", "trophy"];

export function feasibleContractTargets(
  state: GameState,
  template: ContractTemplateDefinition
): string[] {
  const requiredXp = template.requiredXp ?? 0;
  if (state.player.proficiencies[template.rewardSkill] < requiredXp) return [];

  return template.itemOrSpeciesPool.filter((targetId) => {
    if (isProduceContractType(template.type)) {
      const crop = [...ContentRegistry.crops.values()].find((candidate) => candidate.harvestItemId === targetId);
      const deliveryMarket = state.markets[template.deliveryMarketId];
      const seedIsStocked = crop && [...ContentRegistry.markets.values()].some((market) =>
        market.retail.seedCropIds?.includes(crop.id)
      );
      return Boolean(
        crop &&
        seedIsStocked &&
        state.player.proficiencies.farming >= crop.minimumFarmingXp &&
        deliveryMarket?.commodities[targetId]
      );
    }

    const fish = ContentRegistry.fishSpecies.get(targetId);
    const rod = ContentRegistry.rods.get(state.player.equippedRodId);
    const deliveryMarket = state.markets[template.deliveryMarketId];
    if (
      !fish ||
      !fish.isSportFish ||
      !rod ||
      !deliveryMarket?.commodities[targetId] ||
      !state.quests.unlockedFeatureIds.includes("boat.player_rowboat") ||
      !isSpeciesInSeason(fish, state.clock.season) ||
      (template.minQuality !== undefined && qualityRank(template.minQuality) > qualityRank("trophy")) ||
      (template.minWeightKgRange !== undefined && template.minWeightKgRange[0] > fish.weightKg.max)
    ) {
      return false;
    }

    const hasReachableSchool = SCHOOL_SPAWN_POINTS.some(
      (point) => fish.habitats.includes(point.habitatId) && rod.allowedHabitats.includes(point.habitatId)
    );
    if (!hasReachableSchool || !rodMeetsMinimum(rod.rodClass, fish.minimumRodClass)) return false;

    const hasCargoCapacity = fish.cargoClass === "small" || fish.cargoClass === "medium"
      || Object.values(state.boats).some((boat) => {
        const definition = ContentRegistry.boats.get(boat.boatTypeId);
        return definition?.fishCargoSlots.some((slot) => cargoClassFits(fish.cargoClass, slot.maxCargoClass));
      });
    return hasCargoCapacity;
  });
}

export function expireContracts(state: GameState): void {
  for (const contract of state.contracts) {
    if (contract.status === "active" && state.clock.currentMinute >= contract.expiresAtMinute) {
      refundAndExpireContract(state, contract);
    }
  }
}

/**
 * Voids every in-flight contract, refunding partials through the normal expiry
 * path. Used by the v25 save migration: retuning the calendar can strand a
 * player mid-way through an order whose species is no longer in season, and an
 * uncompletable contract occupies a slot forever. Refills happen on the next
 * `ContractDomain.tick()`.
 */
export function voidActiveContracts(state: GameState): number {
  let voided = 0;
  for (const contract of state.contracts) {
    if (contract.status !== "active") continue;
    refundAndExpireContract(state, contract);
    voided += 1;
  }
  return voided;
}

function refundAndExpireContract(state: GameState, contract: GameState["contracts"][number]): void {
  contract.status = "expired";
  if (!isProduceContractType(contract.type) || contract.quantityFulfilled <= 0) return;
  const itemId = contract.targetItemIdOrSpecies;
  const quantity = contract.quantityFulfilled;
  const inventory = state.inventories[state.player.inventoryId];
  const stack = [{ itemId, quantity }];
  if (inventory && InventoryManager.canAddItems(inventory, stack)) {
    InventoryManager.addItemsAtomically(inventory, stack);
    contract.quantityFulfilled = 0;
    return;
  }
  const template = ContentRegistry.contractTemplates.get(contract.templateId);
  const referenceValue = template
    ? contractTargetReferenceValue(state, template, itemId, contract.minWeightKg)
    : null;
  const item = ContentRegistry.items.get(itemId);
  if (item || referenceValue !== null) {
    state.player.money += Math.round((referenceValue ?? item!.baseValue) * quantity);
    contract.quantityFulfilled = 0;
  }
}

export function contractTargetReferenceValue(
  state: GameState,
  template: ContractTemplateDefinition,
  targetId: string,
  minimumWeightKg?: number
): number | null {
  const item = ContentRegistry.items.get(targetId);
  if (item) {
    const market = ContentRegistry.markets.get(contractDeliveryMarketId(template));
    const commodity = market?.commodities.find((candidate) => candidate.itemId === targetId);
    return commodity
      ? commodity.basePrice * (commodity.seasonalFactors[state.clock.season] ?? 1)
      : item.baseValue;
  }
  const fish = ContentRegistry.fishSpecies.get(targetId);
  if (!fish) return null;
  const quality = asFishQuality(template.minQuality) ?? "common";
  const freshness = template.minFreshness ?? 100;
  const weightKg = minimumWeightKg ?? fish.weightKg.average;
  return fish.baseMarketValue
    * getQualityMultiplier(quality)
    * getFreshnessPriceMultiplier(freshness)
    * getFishWeightMultiplier(fish, weightKg);
}

function asFishQuality(value: string | undefined): FishQuality | undefined {
  return value && FISH_QUALITIES.includes(value as FishQuality) ? value as FishQuality : undefined;
}

function eligibleContractCandidates(
  state: GameState
): Array<{ template: ContractTemplateDefinition; targetIds: string[] }> {
  const activeTemplateIds = new Set(
    state.contracts.filter((contract) => contract.status === "active").map((contract) => contract.templateId)
  );
  return [...ContentRegistry.contractTemplates.values()].flatMap((template) => {
    if (activeTemplateIds.has(template.id)) return [];
    const targetIds = feasibleContractTargets(state, template);
    return targetIds.length > 0 ? [{ template, targetIds }] : [];
  });
}

export function refillContracts(
  state: GameState,
  rng: SeededRng,
  nextEntityId: (prefix: string) => string
): void {
  const activeCount = () => state.contracts.filter((contract) => contract.status === "active").length;
  const slots = contractSlotsForRank(
    getRankForXp(state.player.proficiencies.trading).rankIndex,
    state.quests.unlockedFeatureIds.includes("feature.maritime_guild_charter")
  );
  while (activeCount() < slots) {
    const eligible = eligibleContractCandidates(state);
    if (eligible.length === 0) return;
    const activeContracts = state.contracts.filter((contract) => contract.status === "active");
    const hasProduce = activeContracts.some((contract) => isProduceContractType(contract.type));
    const hasFishing = activeContracts.some((contract) => !isProduceContractType(contract.type));
    const hasRowboat = state.quests.unlockedFeatureIds.includes("boat.player_rowboat");
    const preferred = !hasProduce
      ? eligible.filter(({ template }) => isProduceContractType(template.type))
      : hasRowboat && !hasFishing
        ? eligible.filter(({ template }) => !isProduceContractType(template.type))
        : [];
    const candidatePool = preferred.length > 0 ? preferred : eligible;
    const candidate = candidatePool[rng.intInclusive(0, candidatePool.length - 1)];
    const { template } = candidate;
    const targetId = candidate.targetIds[rng.intInclusive(0, candidate.targetIds.length - 1)];
    const quantityRequired = rng.intInclusive(template.quantityRange[0], template.quantityRange[1]);
    const minWeightKg = template.minWeightKgRange
      ? rng.range(template.minWeightKgRange[0], template.minWeightKgRange[1])
      : undefined;
    const referenceValue = contractTargetReferenceValue(state, template, targetId, minWeightKg);
    if (referenceValue === null) return;
    const rewardMoney = Math.max(
      1,
      Math.round(referenceValue * quantityRequired * template.rewardBaseMultiplier)
    );
    state.contracts.push({
      id: nextEntityId("contract"),
      templateId: template.id,
      requesterId: template.id,
      deliveryMarketId: template.deliveryMarketId,
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
    const requiredMarketId = contract.deliveryMarketId;
    if (nearbyMarketId !== requiredMarketId) {
      return {
        success: false,
        reason: `Deliver this order at ${ContentRegistry.markets.get(requiredMarketId)?.name ?? "its listed market"}`
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
    const requiredMarketId = contract.deliveryMarketId;
    if (nearbyMarketId !== requiredMarketId) {
      return { success: false, reason: `Bring this fish cargo to ${ContentRegistry.markets.get(requiredMarketId)?.name ?? "its listed market"}` };
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
    refillContracts(this.context.state, this.context.rng, this.context.nextEntityId);
    this.context.persistRng();
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
      templateId: contract.templateId,
      contractType: contract.type,
      rewardMoney: contract.rewardMoney,
      minute: state.clock.currentMinute
    });
    return { completed: true, rewardMoney: contract.rewardMoney };
  }
}
