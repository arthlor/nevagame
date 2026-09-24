import type { ContractTemplateDefinition } from "../../content/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { contractDeliveryMarketId, contractObjectiveTargets } from "../../content/contracts";
import { activeQuestTrackIds } from "../core/QuestTypes";
import type { FishCargoId, FishQuality, GameState, ItemId } from "../core/types";
import type { SeededRng } from "../core/Rng";
import { InventoryManager } from "../inventory/InventoryManager";
import type { CargoDomain } from "./CargoDomain";
import type { DomainContext } from "./DomainContext";
import type { MarketDomain } from "./MarketDomain";
import type { NavigationDomain } from "./NavigationDomain";
import type { ProgressionDomain } from "./ProgressionDomain";
import { cargoClassFits, isPhysicalTradePackSpecies, isProduceContractType, qualityRank, rodMeetsMinimum } from "./domainRules";
import { isSpeciesInSeason } from "../fishing/seasonalAvailability";
import { SCHOOL_SPAWN_POINTS } from "./FishingDomain";
import { getFishWeightMultiplier, getQualityMultiplier } from "../economy/calculateFishValue";
import { calculateFishPrice } from "../economy/calculateFishValue";
import { cropQualityPriceMultiplier, quoteCommoditySale } from "../economy/marketPricing";
import { getFreshnessPriceMultiplier } from "../fishing/calculateFreshness";
import { sportFishLandingXp } from "../economy/calculateFishXp";
import { contractSlotsForRank, getRankForXp } from "../../content/progression";
import { BOAT_MOORINGS, requiredBoatTypeForMarket } from "../../world/WorldMoorings";
import { FISHING_ECOLOGY_DEFINITIONS, type FishingEcologyId } from "../../world/WorldIslands";


const FISH_QUALITIES: readonly FishQuality[] = ["common", "fine", "exceptional", "trophy"];
/** Time spent waiting at the counter for a replacement notice. */
export const CONTRACT_PASS_WAIT_MINUTES = 120;

/**
 * A delivery market across a sailing route (Sunreach Cove) is reachable only
 * once the player owns a vessel that can make the crossing; the rowboat cannot.
 */
export function canReachDeliveryMarket(state: GameState, marketId: string): boolean {
  const boatTypeId = requiredBoatTypeForMarket(marketId);
  return !boatTypeId || Object.values(state.boats).some((boat) => boat.boatTypeId === boatTypeId);
}

function canReachFishingEcology(state: GameState, ecologyId: FishingEcologyId): boolean {
  const islandId = FISHING_ECOLOGY_DEFINITIONS[ecologyId].islandId;
  if (islandId === "island.neva") return true;
  return BOAT_MOORINGS.some((mooring) =>
    mooring.islandId === islandId && mooring.marketId !== null
      && canReachDeliveryMarket(state, mooring.marketId)
  );
}

export function feasibleContractTargets(
  state: GameState,
  template: ContractTemplateDefinition
): string[] {
  const requiredXp = template.requiredXp ?? 0;
  if (state.player.proficiencies[template.rewardSkill] < requiredXp) return [];
  if (!canReachDeliveryMarket(state, template.deliveryMarketId)) return [];

  return template.itemOrSpeciesPool.filter((targetId) => {
    if (isProduceContractType(template.type)) {
      const crop = [...ContentRegistry.crops.values()].find((candidate) => candidate.harvestItemId === targetId);
      const deliveryMarket = state.markets[template.deliveryMarketId];
      const seedIsReachable = crop && [...ContentRegistry.markets.values()].some((market) =>
        market.retail.seedCropIds?.includes(crop.id) && canReachDeliveryMarket(state, market.id)
      );
      return Boolean(
        crop &&
        seedIsReachable &&
        state.player.proficiencies.farming >= crop.minimumFarmingXp &&
        deliveryMarket?.commodities[targetId]
      );
    }

    const fish = ContentRegistry.fishSpecies.get(targetId);
    const rod = ContentRegistry.rods.get(state.player.equippedRodId);
    const deliveryMarket = state.markets[template.deliveryMarketId];
    if (
      !fish ||
      (!fish.isSportFish && !fish.tags.includes("physical-basic-catch")) ||
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
      (point) => fish.ecologyIds.includes(point.ecologyId)
        && fish.habitats.includes(point.habitatId)
        && rod.allowedHabitats.includes(point.habitatId)
        && canReachFishingEcology(state, point.ecologyId)
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
  const exactValue = contract.deliveredValueMoney ?? 0;
  const legacyQuantity = contract.legacyUnvaluedQuantity ?? contract.quantityFulfilled;
  state.player.money += exactValue;
  contract.deliveredValueMoney = 0;
  contract.legacyUnvaluedQuantity = 0;
  contract.quantityFulfilled = 0;
  if (legacyQuantity <= 0) return;
  const itemId = contract.targetItemIdOrSpecies;

  // A pre-v57 delivery has no surviving grade, weight or freshness snapshot.
  // Preserve its previous refund rule rather than inventing an exact value.
  if (isProduceContractType(contract.type)) {
    const inventory = state.inventories[state.player.inventoryId];
    const stack = [{ itemId, quantity: legacyQuantity }];
    if (inventory && InventoryManager.canAddItems(inventory, stack)) {
      InventoryManager.addItemsAtomically(inventory, stack);
      return;
    }
  }

  const template = ContentRegistry.contractTemplates.get(contract.templateId);
  const referenceValue = template
    ? contractTargetReferenceValue(state, template, itemId, contract.minWeightKg)
    : null;
  const item = ContentRegistry.items.get(itemId);
  if (item || referenceValue !== null) {
    state.player.money += Math.round((referenceValue ?? item!.baseValue) * legacyQuantity);
  }
}

/**
 * How many settled contracts stay on the board's history tail. Every reader
 * filters to `status === "active"`, so completed and expired rows were pure
 * growth: the array never shrank, and `SaveSchema` re-validated every element
 * of it on each load.
 */
export const SETTLED_CONTRACT_HISTORY = 20;

/** Trims the settled tail so a long save cannot accumulate contracts forever. */
export function pruneSettledContracts(state: GameState): number {
  const settled = state.contracts.filter((contract) => contract.status !== "active");
  const excess = settled.length - SETTLED_CONTRACT_HISTORY;
  if (excess <= 0) return 0;
  const drop = new Set(settled.slice(0, excess));
  state.contracts = state.contracts.filter((contract) => !drop.has(contract));
  return excess;
}

export function contractTargetReferenceValue(
  state: GameState,
  template: ContractTemplateDefinition,
  targetId: string,
  minimumWeightKg?: number
): number | null {
  const fish = ContentRegistry.fishSpecies.get(targetId);
  if (fish && !isProduceContractType(template.type)) {
    const quality = asFishQuality(template.minQuality) ?? "common";
    const freshness = template.minFreshness ?? 100;
    const weightKg = minimumWeightKg ?? fish.weightKg.average;
    return fish.baseMarketValue
      * getQualityMultiplier(quality)
      * getFreshnessPriceMultiplier(freshness)
      * getFishWeightMultiplier(fish, weightKg);
  }

  const item = ContentRegistry.items.get(targetId);
  if (item) {
    const market = ContentRegistry.markets.get(contractDeliveryMarketId(template));
    const commodity = market?.commodities.find((candidate) => candidate.itemId === targetId);
    return commodity
      ? commodity.basePrice * (commodity.seasonalFactors[state.clock.season] ?? 1)
      : item.baseValue;
  }
  return null;
}

function asFishQuality(value: string | undefined): FishQuality | undefined {
  return value && FISH_QUALITIES.includes(value as FishQuality) ? value as FishQuality : undefined;
}

function eligibleContractCandidates(
  state: GameState,
  excludedTemplateIds: ReadonlySet<string> = new Set()
): Array<{ template: ContractTemplateDefinition; targetIds: string[] }> {
  const activeTemplateIds = new Set(
    state.contracts.filter((contract) => contract.status === "active").map((contract) => contract.templateId)
  );
  return [...ContentRegistry.contractTemplates.values()].flatMap((template) => {
    if (activeTemplateIds.has(template.id) || excludedTemplateIds.has(template.id)) return [];
    const targetIds = feasibleContractTargets(state, template);
    return targetIds.length > 0 ? [{ template, targetIds }] : [];
  });
}

/**
 * The kinds of order the story is waiting on right now: the target of every
 * track's current `complete-contract` step that is still open. A step with no
 * target accepts any contract, so it asks the board for nothing in particular.
 */
export function requestedContractTargets(state: GameState): string[] {
  const requested = new Set<string>();
  for (const trackId of activeQuestTrackIds(state.quests)) {
    const progress = state.quests.tracks[trackId];
    const quest = progress?.activeQuestId ? ContentRegistry.quests.get(progress.activeQuestId) : undefined;
    const objective = quest?.objectives[progress!.activeStepIndex];
    if (objective?.type !== "complete-contract" || !objective.targetId) continue;
    if ((progress!.stepProgress[objective.id] ?? 0) >= objective.targetQuantity) continue;
    requested.add(objective.targetId);
  }
  return [...requested];
}

function templateSatisfies(template: ContractTemplateDefinition | undefined, target: string): boolean {
  return Boolean(template && contractObjectiveTargets(template).includes(target));
}

/**
 * Effort a listing asks for beyond its kind: a grade, a weight floor, a strict
 * freshness mark. Only used to post the gentlest order a quest is waiting on,
 * so a story step is never parked behind a trophy-weight long shot.
 */
function contractTemplateDifficulty(template: ContractTemplateDefinition): number {
  return Math.max(0, qualityRank(template.minQuality))
    + (template.minWeightKgRange ? 1 : 0)
    + ((template.minFreshness ?? 0) >= 90 ? 1 : 0);
}

function gentlest<T extends { template: ContractTemplateDefinition }>(candidates: T[]): T[] {
  if (candidates.length === 0) return candidates;
  const floor = Math.min(...candidates.map(({ template }) => contractTemplateDifficulty(template)));
  return candidates.filter(({ template }) => contractTemplateDifficulty(template) === floor);
}

/**
 * A posted order freezes its XP alongside its other requirements. Fish effort
 * follows the same species, grade and weight curve as the catch itself; the
 * commission then pays for finding and delivering that specific catch. A
 * cross-channel tag is authored route work, unlike an inferred travel distance.
 */
function postedContractXp(
  template: ContractTemplateDefinition,
  targetId: string,
  quantityRequired: number,
  minWeightKg: number | undefined
): number {
  const fish = !isProduceContractType(template.type)
    ? ContentRegistry.fishSpecies.get(targetId)
    : undefined;
  const perUnit = fish
    ? Math.max(50, Math.round(sportFishLandingXp(
      fish,
      minWeightKg ?? fish.weightKg.average,
      asFishQuality(template.minQuality) ?? "common"
    ) * 0.75))
    : 25;
  const freshnessMultiplier = (template.minFreshness ?? 0) >= 90
    ? 1.2
    : (template.minFreshness ?? 0) >= 80 ? 1.1 : 1;
  const deadlineMultiplier = template.durationMinutes <= 480
    ? 1.2
    : template.durationMinutes <= 960 ? 1.1 : 1;
  const authoredRouteBonus = template.tags?.includes("cross-channel") ? 60 : 0;
  return Math.min(1200, Math.max(50, Math.round(
    quantityRequired * perUnit * freshnessMultiplier * deadlineMultiplier + authoredRouteBonus
  )));
}

export function refillContracts(
  state: GameState,
  rng: SeededRng,
  nextEntityId: (prefix: string) => string,
  excludedTemplateIds: ReadonlySet<string> = new Set()
): void {
  const activeCount = () => state.contracts.filter((contract) => contract.status === "active").length;
  const slots = contractSlotsForRank(
    getRankForXp(state.player.proficiencies.trading).rankIndex,
    state.quests.unlockedFeatureIds.includes("feature.maritime_guild_charter")
  );
  while (activeCount() < slots) {
    const eligible = eligibleContractCandidates(state, excludedTemplateIds);
    if (eligible.length === 0) return;
    const activeContracts = state.contracts.filter((contract) => contract.status === "active");
    // A quest waiting on a kind of order the board is not showing comes first:
    // Act 9 and the freight track name contract kinds, and a board that never
    // rolled one parked the story behind dice for up to two real hours.
    const unmet = requestedContractTargets(state).filter((target) =>
      !activeContracts.some((contract) =>
        templateSatisfies(ContentRegistry.contractTemplates.get(contract.templateId), target)
      )
    );
    const requested = gentlest(
      eligible.filter(({ template }) => unmet.some((target) => templateSatisfies(template, target)))
    );
    const hasProduce = activeContracts.some((contract) => isProduceContractType(contract.type));
    const hasFishing = activeContracts.some((contract) => !isProduceContractType(contract.type));
    const hasRegional = activeContracts.some((contract) =>
      ContentRegistry.contractTemplates.get(contract.templateId)?.tags?.includes("mainland")
      || ContentRegistry.contractTemplates.get(contract.templateId)?.tags?.includes("cross-channel")
    );
    const hasRowboat = state.quests.unlockedFeatureIds.includes("boat.player_rowboat");
    const preferred = requested.length > 0
      ? requested
      : !hasProduce
        ? eligible.filter(({ template }) => isProduceContractType(template.type))
        : hasRowboat && !hasFishing
          ? eligible.filter(({ template }) => !isProduceContractType(template.type))
          : !hasRegional
            ? eligible.filter(({ template }) =>
              template.tags?.includes("mainland") || template.tags?.includes("cross-channel")
            )
          : [];
    const candidatePool = preferred.length > 0 ? preferred : eligible;
    const candidate = candidatePool[rng.intInclusive(0, candidatePool.length - 1)];
    const { template } = candidate;
    const targetId = candidate.targetIds[rng.intInclusive(0, candidate.targetIds.length - 1)];
    const quantityRequired = rng.intInclusive(template.quantityRange[0], template.quantityRange[1]);
    const minWeightKg = template.minWeightKgRange
      ? Math.round(rng.range(template.minWeightKgRange[0], template.minWeightKgRange[1]) * 10) / 10
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
      deliveredValueMoney: 0,
      legacyUnvaluedQuantity: 0,
      minQuality: template.type === "produce" ? undefined : asFishQuality(template.minQuality),
      minFreshness: template.type === "produce" ? undefined : template.minFreshness,
      minWeightKg,
      rewardMoney,
      rewardSkillXp: {
        skill: template.rewardSkill,
        xp: postedContractXp(template, targetId, quantityRequired, minWeightKg)
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
    const removedLots = InventoryManager.planItemRemoval(inventory, itemId, quantity);
    if (!removedLots) {
      return { success: false, reason: "You do not have enough items to deliver" };
    }
    const commodity = state.markets[requiredMarketId]?.commodities[itemId];
    if (!commodity) return { success: false, reason: "This market cannot value those goods" };
    const qualityMultipliers = removedLots.flatMap((lot) =>
      Array<number>(lot.quantity).fill(cropQualityPriceMultiplier(lot.quality))
    );
    const deliveredValue = quoteCommoditySale(commodity, quantity, {
      absoluteHour: state.clock.currentMinute / 60,
      worldSeed: state.worldSeed,
      qualityMultipliers
    }).total;
    if (!InventoryManager.removeItemsAtomically(inventory, [{ itemId, quantity }])) {
      return { success: false, reason: "You do not have enough items to deliver" };
    }
    contract.legacyUnvaluedQuantity ??= contract.quantityFulfilled;
    contract.deliveredValueMoney = (contract.deliveredValueMoney ?? 0) + deliveredValue;
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
    const species = ContentRegistry.fishSpecies.get(fishCargo.speciesId);
    if (species && isPhysicalTradePackSpecies(species) &&
      (fishCargo.location.type !== "player" || state.player.carriedFishCargoId !== cargoId)) {
      return { success: false, reason: "Collect this fish trade pack and carry it to the contract counter" };
    }
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

    const commodity = state.markets[requiredMarketId]?.commodities[fishCargo.speciesId];
    if (!commodity || !species) return { success: false, reason: "This market cannot value that fish" };
    const demand = quoteCommoditySale(commodity, 1, {
      absoluteHour: state.clock.currentMinute / 60,
      worldSeed: state.worldSeed
    }).averageDemandModifier;
    const deliveredValue = calculateFishPrice(
      species, fishCargo.weightKg, fishCargo.quality, fishCargo.freshness,
      demand, commodity.seasonalModifier
    ).finalPrice;

    this.cargo.clearPointers(fishCargo);
    delete state.fishCargo[cargoId];
    contract.legacyUnvaluedQuantity ??= contract.quantityFulfilled;
    contract.deliveredValueMoney = (contract.deliveredValueMoney ?? 0) + deliveredValue;
    contract.quantityFulfilled += 1;
    const completion = this.completeIfFulfilled(contract);
    return { success: true, delivered: 1, completed: completion.completed, rewardMoney: completion.rewardMoney };
  }

  /**
   * Strikes an untouched order off the board so its slot can post one the
   * player can actually keep. An order with goods already delivered against it
   * stays: those goods are part of the promise, and expiry is what refunds them.
   * The replacement is posted at once and cannot be the order just passed.
   * The command caller then advances the quoted wait, so this path cannot
   * reroll the board without consuming game time.
   */
  public passContract(contractId: string): { success: boolean; reason?: string } {
    const { state } = this.context;
    const contract = this.getActive(contractId);
    if (!contract) return { success: false, reason: "That order is no longer on the board" };
    if (this.market.getNearbyMarketId() !== contract.deliveryMarketId) {
      return { success: false, reason: "Visit the order's listed counter to pass on it" };
    }
    if (contract.quantityFulfilled > 0) {
      return { success: false, reason: "Part of this order is already delivered; it stays until it is filled or runs out" };
    }
    contract.status = "expired";
    refillContracts(state, this.context.rng, this.context.nextEntityId, new Set([contract.templateId]));
    pruneSettledContracts(state);
    this.context.persistRng();
    return { success: true };
  }

  public tick(): void {
    expireContracts(this.context.state);
    refillContracts(this.context.state, this.context.rng, this.context.nextEntityId);
    pruneSettledContracts(this.context.state);
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
    const payoutMoney = Math.max(contract.rewardMoney, contract.deliveredValueMoney ?? 0);
    contract.quantityFulfilled = contract.quantityRequired;
    contract.status = "completed";
    contract.deliveredValueMoney = 0;
    contract.legacyUnvaluedQuantity = 0;
    state.player.money += payoutMoney;
    this.progression.addProficiencyXp(contract.rewardSkillXp.skill, contract.rewardSkillXp.xp);
    events.emit("ContractCompleted", {
      contractId: contract.id,
      templateId: contract.templateId,
      contractType: contract.type,
      rewardMoney: payoutMoney,
      minute: state.clock.currentMinute
    });
    return { completed: true, rewardMoney: payoutMoney };
  }
}
