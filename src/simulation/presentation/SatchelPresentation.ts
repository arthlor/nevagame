import { ContentRegistry } from "../../content/ContentRegistry";
import { InventoryManager } from "../inventory/InventoryManager";
import type { SatchelDto } from "../core/contracts";
import type { GameState } from "../core/types";

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
