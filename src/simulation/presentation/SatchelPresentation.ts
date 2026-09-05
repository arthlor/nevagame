import { ContentRegistry } from "../../content/ContentRegistry";
import { InventoryManager } from "../inventory/InventoryManager";
import type { ItemInspectionDto, SatchelDto } from "../core/contracts";
import { getStorageFreshnessModifier, resolveCargoHasIce } from "../fishing/calculateFreshness";
import type { CarryLocationType, GameState } from "../core/types";

const inventoryCategory = (category: string | undefined, itemId: string): "farming" | "fishing" | "supplies" | null => {
  if (category === "seed" || category === "produce" || category === "grain" || category === "fertilizer") {
    return "farming";
  }
  if (category === "bait" || category === "fishing-supply" || itemId.startsWith("fish.")) {
    return "fishing";
  }
  if (
    category === "crafting-material" ||
    category === "fuel" ||
    category === "ice" ||
    category === "processed-food" ||
    category === "misc"
  ) {
    return "supplies";
  }
  return null;
};

export function buildSatchelDto(state: GameState): SatchelDto {
  const inventory = state.inventories[state.player.inventoryId];
  const cropBySeed = new Map(
    [...ContentRegistry.crops.values()].map((crop) => [crop.seedItemId, { id: crop.id, name: crop.name }])
  );
  const slots = inventory.slots.map((slot, index) => {
    const quantity = InventoryManager.getSlotQuantity(slot);
    if (!slot.itemId || quantity <= 0) {
      return {
        index,
        itemId: null,
        name: "Empty slot",
        description: null,
        categoryLabel: null,
        inventoryCategory: null,
        quantity: 0,
        cropId: null,
        cropName: null,
        isFish: false
      } as const;
    }
    const item = ContentRegistry.items.get(slot.itemId);
    const fish = ContentRegistry.fishSpecies.get(slot.itemId);
    const crop = cropBySeed.get(slot.itemId);
    return {
      index,
      itemId: slot.itemId,
      name: item?.name ?? fish?.name ?? slot.itemId,
      description: item?.description ?? null,
      categoryLabel: item?.category ?? (fish ? "fish" : "item"),
      inventoryCategory: inventoryCategory(item?.category, slot.itemId),
      quantity,
      cropId: crop?.id ?? null,
      cropName: crop?.name ?? null,
      isFish: Boolean(fish)
    };
  });
  return {
    occupiedSlots: slots.filter((slot) => slot.itemId !== null).length,
    totalSlots: slots.length,
    slots
  };
}


/**
 * Encounter weight is how often a species rolls, so it is the only rarity the
 * content actually models. The bands are cut on that weight, not on price.
 */
export function rarityForEncounterWeight(weight: number): NonNullable<ItemInspectionDto["rarity"]> {
  if (weight <= 20) return { tier: "prized", label: "Prized", encounterWeight: weight };
  if (weight <= 50) return { tier: "rare", label: "Rare", encounterWeight: weight };
  if (weight <= 90) return { tier: "uncommon", label: "Uncommon", encounterWeight: weight };
  return { tier: "common", label: "Common", encounterWeight: weight };
}

const STORAGE_LABEL: Record<CarryLocationType, string> = {
  player: "Carried open",
  "boat-hold": "Sheltered hold",
  "boat-hook": "Transom hook",
  "cold-storage": "Cold room",
  crate: "Crate"
};

function freshnessLabel(percent: number): string {
  if (percent >= 85) return "Fresh";
  if (percent >= 60) return "Good";
  if (percent >= 35) return "Turning";
  if (percent > 0) return "Poor";
  return "Spoiled";
}

/**
 * The inspect card for one item. Reads content definitions and live cargo only;
 * it never writes, and it returns null for an item the registry does not know.
 */
export function buildItemInspectionDto(state: GameState, itemId: string): ItemInspectionDto | null {
  const item = ContentRegistry.items.get(itemId);
  const fish = ContentRegistry.fishSpecies.get(itemId);
  if (!item && !fish) return null;

  // A seed and the produce it becomes both describe the same crop.
  const crop = [...ContentRegistry.crops.values()].find(
    (candidate) => candidate.seedItemId === itemId || candidate.harvestItemId === itemId
  );

  // Freshest carried specimen of this species: the one the player loses first
  // is the one worth warning about, so report the lowest still in hand.
  let carried: { freshness: number; location: CarryLocationType; hasIce: boolean } | null = null;
  if (fish) {
    for (const cargo of Object.values(state.fishCargo)) {
      if (cargo.speciesId !== itemId) continue;
      if (cargo.location.type !== "player") continue;
      if (carried === null || cargo.freshness < carried.freshness) {
        carried = {
          freshness: cargo.freshness,
          location: cargo.location.type,
          hasIce: resolveCargoHasIce(state, cargo)
        };
      }
    }
  }

  return {
    itemId,
    name: item?.name ?? fish?.name ?? itemId,
    categoryLabel: item?.category ?? (fish ? "fish" : "item"),
    loreText: item?.description ?? null,
    stackLimit: item?.stackLimit ?? 1,
    baseValue: item?.baseValue ?? 0,
    tags: item?.tags ?? [],
    rarity: fish ? rarityForEncounterWeight(fish.rarityWeight) : null,
    agronomy: crop
      ? {
          cropId: crop.id,
          cropName: crop.name,
          waterNeed: crop.waterNeed,
          growthMinutes: crop.baseGrowthMinutes,
          yieldMin: crop.baseYield.min,
          yieldMax: crop.baseYield.max,
          regrows: crop.regrows,
          regrowMinutes: crop.regrowMinutes ?? null,
          fertilityCost: crop.fertilityCost,
          preferredClimates: crop.preferredClimates,
          neutralClimates: crop.neutralClimates ?? [],
          minimumFarmingXp: crop.minimumFarmingXp
        }
      : null,
    freshness: carried
      ? {
          percent: Math.max(0, Math.min(100, Math.round(carried.freshness))),
          label: freshnessLabel(carried.freshness),
          storageLabel: carried.hasIce ? "Iced hold" : STORAGE_LABEL[carried.location],
          decayRate: getStorageFreshnessModifier(carried.location, carried.hasIce)
        }
      : null
  };
}
