import { ContentRegistry } from "../../content/ContentRegistry";
import type { MarketDemandSignal } from "../core/contracts";
import type { ContractState, GameState } from "../core/types";
import { InventoryManager } from "../inventory/InventoryManager";
import { cargoClassFits, rodMeetsMinimum } from "../domains/domainRules";
import { accessibleFishingSupplyCount } from "../fishing/FishingSupplies";

export interface ExpeditionOpportunityDto {
  id: string;
  kind: "contract" | "market";
  tone: "steady" | "bold";
  title: string;
  summary: string;
  destination: string;
  valueLabel: string;
  deadlineLabel?: string;
  ready: boolean;
  blockers: string[];
}

export interface ExpeditionBoardDto {
  opportunities: ExpeditionOpportunityDto[];
  readiness: {
    vessel: {
      name: string;
      hullCurrent: number;
      hullMaximum: number;
      hullPercent: number;
    } | null;
    supplies: ReadonlyArray<{ itemId: string; count: number }>;
    weatherType: GameState["weather"]["type"];
    seaLabel: "Calm water" | "Rough water" | "Unsafe water";
  };
}

export interface ExpeditionMarketSignals {
  steady: MarketDemandSignal;
  bold: MarketDemandSignal;
}

function itemName(id: string): string {
  return ContentRegistry.items.get(id)?.name ?? ContentRegistry.fishSpecies.get(id)?.name ?? id;
}

function timeLabel(minutes: number): string {
  if (minutes < 60) return `${Math.max(0, Math.ceil(minutes))}m left`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.ceil(minutes % 60);
  return remainder > 0 ? `${hours}h ${remainder}m left` : `${hours}h left`;
}

function matchingCargoSlotAvailable(state: GameState, speciesId: string, vesselId: string | null): boolean {
  const fish = ContentRegistry.fishSpecies.get(speciesId);
  if (!fish) return false;
  if (!state.player.carriedFishCargoId && cargoClassFits(fish.cargoClass, "medium")) return true;
  const boat = vesselId ? state.boats[vesselId] : undefined;
  if (!boat) return false;
  return (() => {
    const definition = ContentRegistry.boats.get(boat.boatTypeId);
    return definition?.fishCargoSlots.some((slot) =>
      boat.fishCargoSlotIds[slot.slotIndex] === null && cargoClassFits(fish.cargoClass, slot.maxCargoClass)
    ) ?? false;
  })();
}

export function hasIce(state: GameState, vesselId: string | null = state.player.activeBoatId ?? null): boolean {
  return accessibleFishingSupplyCount(state, "item.crushed_ice", vesselId) > 0;
}

function contractOpportunity(state: GameState, contract: ContractState, vesselId: string | null): ExpeditionOpportunityDto {
  const targetName = itemName(contract.targetItemIdOrSpecies);
  const remaining = Math.max(0, contract.quantityRequired - contract.quantityFulfilled);
  const minutesLeft = contract.expiresAtMinute - state.clock.currentMinute;
  const isProduce = contract.type === "produce";
  const blockers: string[] = [];
  const inventory = state.inventories[state.player.inventoryId];

  if (minutesLeft <= 0) blockers.push("Deadline has passed");
  else if (minutesLeft < (isProduce ? 120 : 180)) blockers.push("Deadline is close");

  if (isProduce) {
    const onHand = InventoryManager.getItemCount(inventory, contract.targetItemIdOrSpecies);
    if (onHand < remaining) {
      const crop = [...ContentRegistry.crops.values()].find((candidate) => candidate.harvestItemId === contract.targetItemIdOrSpecies);
      const seeds = crop ? InventoryManager.getItemCount(inventory, crop.seedItemId) : 0;
      if (!crop || seeds === 0) blockers.push(`Need ${remaining - onHand} more ${targetName} and no seed is packed`);
      else blockers.push(`Need ${remaining - onHand} more ${targetName}`);
    }
  } else {
    const fish = ContentRegistry.fishSpecies.get(contract.targetItemIdOrSpecies);
    const suitableOwnedRod = fish && state.player.ownedRodIds
      .map((rodId) => ContentRegistry.rods.get(rodId))
      .find((rod) => rod && rod.allowedHabitats.some((habitat) => fish.habitats.includes(habitat))
        && rodMeetsMinimum(rod.rodClass, fish.minimumRodClass)
        && cargoClassFits(fish.cargoClass, rod.maximumCargoClass));
    if (!state.quests.unlockedFeatureIds.includes("boat.player_rowboat")) blockers.push("Rowboat access is required");
    if (!suitableOwnedRod) blockers.push("No owned rod suits this fish");
    if (accessibleFishingSupplyCount(state, "item.chum_bucket", vesselId) === 0) blockers.push("Pack a chum bucket");
    if (!matchingCargoSlotAvailable(state, contract.targetItemIdOrSpecies, vesselId)) blockers.push("No suitable cargo space is open");
    const safestBoat = Object.values(state.boats)
      .map((boat) => ContentRegistry.boats.get(boat.boatTypeId)?.safeSeaRoughness ?? 0)
      .reduce((best, value) => Math.max(best, value), 0);
    if (state.weather.seaRoughness > safestBoat) blockers.push("Water is rougher than your vessel's safe range");
    if ((contract.minFreshness ?? 0) >= 80 && !hasIce(state, vesselId)) blockers.push("No crushed ice is packed for the freshness target");
  }

  return {
    id: `opportunity.${contract.id}`,
    kind: "contract",
    tone: isProduce ? "steady" : "bold",
    title: isProduce ? `Steady: ${targetName} delivery` : `Bold: ${targetName} order`,
    summary: `${remaining} remaining for ${ContentRegistry.contractTemplates.get(contract.templateId)?.requesterName ?? "the requester"}`,
    destination: isProduce ? "Village Produce Market" : "Harbor Fish Market",
    valueLabel: `${contract.rewardMoney} G contract`,
    deadlineLabel: timeLabel(minutesLeft),
    ready: blockers.length === 0,
    blockers
  };
}

function marketOpportunity(
  state: GameState,
  tone: "steady" | "bold",
  signal: MarketDemandSignal,
  vesselId: string | null
): ExpeditionOpportunityDto | null {
  const marketId = tone === "steady" ? "market.village" : "market.harbor";
  const market = state.markets[marketId];
  if (!market || !signal.success || !signal.itemId || !signal.itemName || !signal.demandLabel) return null;
  const itemId = signal.itemId;
  const demandLabel = signal.demandLabel.toLowerCase();
  const blockers: string[] = [];
  const inventory = state.inventories[state.player.inventoryId];
  if (tone === "steady" && InventoryManager.getItemCount(inventory, itemId) === 0) {
    blockers.push(`No ${signal.itemName} is packed`);
  }
  if (tone === "bold") {
    if (!state.quests.unlockedFeatureIds.includes("boat.player_rowboat")) blockers.push("Rowboat access is required");
    if (accessibleFishingSupplyCount(state, "item.chum_bucket", vesselId) === 0) blockers.push("Pack a chum bucket");
    if (!matchingCargoSlotAvailable(state, itemId, vesselId)) blockers.push("No suitable cargo space is open");
  }
  return {
    id: `opportunity.${marketId}.${itemId}`,
    kind: "market",
    tone,
    title: `${tone === "steady" ? "Steady" : "Bold"}: ${signal.itemName} market run`,
    summary: `${signal.itemName} is ${demandLabel} at ${market.name}`,
    destination: market.name,
    valueLabel: "Quote at the stall",
    ready: blockers.length === 0,
    blockers
  };
}

export function buildExpeditionOpportunities(
  state: GameState,
  marketSignals: ExpeditionMarketSignals,
  vesselId: string | null = state.player.activeBoatId ?? null
): ExpeditionOpportunityDto[] {
  const active = state.contracts.filter((contract) => contract.status === "active");
  const produce = active.find((contract) => contract.type === "produce");
  const fishing = active.find((contract) => contract.type !== "produce");
  return [
    produce ? contractOpportunity(state, produce, vesselId) : marketOpportunity(state, "steady", marketSignals.steady, vesselId),
    fishing ? contractOpportunity(state, fishing, vesselId) : marketOpportunity(state, "bold", marketSignals.bold, vesselId)
  ].filter((opportunity): opportunity is ExpeditionOpportunityDto => opportunity !== null);
}

export function buildExpeditionBoard(
  state: GameState,
  marketSignals: ExpeditionMarketSignals
): ExpeditionBoardDto {
  const vessels = Object.values(state.boats)
    .flatMap((boat) => {
      const definition = ContentRegistry.boats.get(boat.boatTypeId);
      return definition ? [{ boat, definition }] : [];
    })
    .sort((a, b) =>
      b.definition.safeSeaRoughness - a.definition.safeSeaRoughness || a.boat.id.localeCompare(b.boat.id)
    );
  const active = state.player.activeBoatId
    ? vessels.find((entry) => entry.boat.id === state.player.activeBoatId)
    : undefined;
  const selectedVessel = active ?? vessels[0] ?? null;
  const selectedVesselId = selectedVessel?.boat.id ?? null;
  const packedCount = (itemId: string): number =>
    accessibleFishingSupplyCount(state, itemId, selectedVesselId);
  const roughness = state.weather.seaRoughness;
  const seaLabel = selectedVessel && roughness > selectedVessel.definition.safeSeaRoughness
    ? "Unsafe water" as const
    : roughness > 0.4
      ? "Rough water" as const
      : "Calm water" as const;

  return {
    opportunities: buildExpeditionOpportunities(state, marketSignals, selectedVesselId),
    readiness: {
      vessel: selectedVessel
        ? {
            name: selectedVessel.definition.name,
            hullCurrent: selectedVessel.boat.durability,
            hullMaximum: selectedVessel.definition.durabilityMax,
            hullPercent: Math.round(
              (selectedVessel.boat.durability / Math.max(1, selectedVessel.definition.durabilityMax)) * 100
            )
          }
        : null,
      supplies: ["item.chum_bucket", "item.bait_worms", "item.basic_lure", "item.crushed_ice"].map((itemId) => ({
        itemId,
        count: packedCount(itemId)
      })),
      weatherType: state.weather.type,
      seaLabel
    }
  };
}
