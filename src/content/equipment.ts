import type { EquipmentDefinition } from "./types";
import type { ClothingSlot, EquipmentId, EquipmentPresetId, EquipmentSlot, PlayerEquipmentState } from "../simulation/core/types";

export const WARDROBE_CAPACITY = 20;

export const STARTER_EQUIPMENT_IDS = [
  "equipment.weathered_straw_hat",
  "equipment.work_vest",
  "equipment.mud_boots",
  "equipment.tin_watering_can",
  "equipment.farm_sickle"
] as const satisfies readonly EquipmentId[];

export const EQUIPMENT: Record<EquipmentId, EquipmentDefinition> = {
  "equipment.weathered_straw_hat": {
    id: "equipment.weathered_straw_hat",
    name: "Weathered Straw Hat",
    description: "A familiar sun-faded hat. Comfortable, dependable, and free of specialist effects.",
    slot: "head",
    starter: true,
    effects: [],
    presentation: {
      // The adapted player body is bare-headed: nothing to hide under a hat.
      characterBaseLayer: { nodeNames: [], materialNames: [] },
      socket: "head"
    },
    icon: "equipment.weathered_straw_hat"
  },
  "equipment.work_vest": {
    id: "equipment.work_vest",
    name: "Work Vest",
    description: "A sturdy everyday layer with room to bend, row, and haul.",
    slot: "outerwear",
    starter: true,
    effects: [],
    presentation: {
      characterBaseLayer: {
        nodeNames: ["char_player_a_surface_LOD0", "char_player_a_surface_LOD1"],
        materialNames: ["char_player_a_vest"]
      },
      socket: "body"
    },
    icon: "equipment.work_vest"
  },
  "equipment.mud_boots": {
    id: "equipment.mud_boots",
    name: "Mud Boots",
    description: "Plain waterproof boots for an ordinary day ashore.",
    slot: "feet",
    starter: true,
    effects: [],
    presentation: {
      characterBaseLayer: {
        nodeNames: ["char_player_a_surface_LOD0", "char_player_a_surface_LOD1"],
        materialNames: ["char_player_a_boots"]
      },
      socket: "feet"
    },
    icon: "equipment.mud_boots"
  },
  "equipment.tin_watering_can": {
    id: "equipment.tin_watering_can",
    name: "Tin Watering Can",
    description: "A balanced starter can with a short, predictable pour.",
    slot: "watering-tool",
    starter: true,
    effects: [],
    presentation: { assetId: "tool_watering_can_a", socket: "tool", scale: 0.72 },
    icon: "equipment.tin_watering_can"
  },
  "equipment.farm_sickle": {
    id: "equipment.farm_sickle",
    name: "Farm Sickle",
    description: "A simple field blade that cuts a clean, honest swath.",
    slot: "harvest-tool",
    starter: true,
    effects: [],
    presentation: { assetId: "tool_sickle_a", socket: "tool", scale: 0.82 },
    icon: "equipment.farm_sickle"
  },
  "equipment.field_hat": {
    id: "equipment.field_hat",
    name: "Field Hat",
    description: "A broad working brim that makes planting and fertilizing less tiring.",
    slot: "head",
    starter: false,
    effects: [{ kind: "work-multiplier", actions: ["farming.plant", "farming.fertilize"], multiplier: 0.85 }],
    presentation: { assetId: "wearable_field_hat_a", socket: "head" },
    icon: "equipment.field_hat"
  },
  "equipment.tidewatch_cap": {
    id: "equipment.tidewatch_cap",
    name: "Tidewatch Cap",
    description: "A close-fitting cap that keeps an angler settled through casts and hooks.",
    slot: "head",
    starter: false,
    effects: [{ kind: "work-multiplier", actions: ["fishing.basic-cast", "fishing.sport-hook"], multiplier: 0.9 }],
    presentation: { assetId: "wearable_tidewatch_cap_a", socket: "head" },
    icon: "equipment.tidewatch_cap"
  },
  "equipment.harvest_apron": {
    id: "equipment.harvest_apron",
    name: "Harvest Apron",
    description: "Soft divided pockets protect exceptional and prize produce on the way out of the field.",
    slot: "outerwear",
    starter: false,
    effects: [{ kind: "crop-quality-chance", multiplier: 1.1 }],
    presentation: { assetId: "wearable_harvest_apron_a", socket: "body" },
    icon: "equipment.harvest_apron"
  },
  "equipment.oilskin_coat": {
    id: "equipment.oilskin_coat",
    name: "Oilskin Coat",
    description: "A braced sea coat that softens line wear from overload and a fish's violent shake.",
    slot: "outerwear",
    starter: false,
    effects: [{ kind: "sport-line-damage-multiplier", multiplier: 0.9 }],
    presentation: { assetId: "wearable_oilskin_coat_a", socket: "body" },
    icon: "equipment.oilskin_coat"
  },
  "equipment.furrow_boots": {
    id: "equipment.furrow_boots",
    name: "Furrow Boots",
    description: "Firm soles let you tend and inspect a crop from a quarter metre farther away.",
    slot: "feet",
    starter: false,
    effects: [{ kind: "crop-reach", actions: ["water", "harvest", "unroot", "inspect"], bonusMeters: 0.25 }],
    presentation: { assetId: "wearable_furrow_boots_a", socket: "feet" },
    icon: "equipment.furrow_boots"
  },
  "equipment.deck_boots": {
    id: "equipment.deck_boots",
    name: "Deck Boots",
    description: "Gripping soles strengthen only the extra resistance gained while bracing against a sport fish.",
    slot: "feet",
    starter: false,
    effects: [{ kind: "sport-brace-extra-multiplier", multiplier: 1.1 }],
    presentation: { assetId: "wearable_deck_boots_a", socket: "feet" },
    icon: "equipment.deck_boots"
  },
  "equipment.copper_rose_watering_can": {
    id: "equipment.copper_rose_watering_can",
    name: "Copper Rose Can",
    description: "A fine rose spreads water evenly and reduces watering Work.",
    slot: "watering-tool",
    starter: false,
    effects: [{ kind: "work-multiplier", actions: ["farming.water"], multiplier: 0.8 }],
    presentation: { assetId: "tool_watering_can_copper_rose_a", socket: "tool", scale: 0.72 },
    icon: "equipment.copper_rose_watering_can"
  },
  "equipment.long_spout_watering_can": {
    id: "equipment.long_spout_watering_can",
    name: "Long-Spout Can",
    description: "A narrow extended spout reaches half a metre beyond an ordinary watering can.",
    slot: "watering-tool",
    starter: false,
    effects: [{ kind: "crop-reach", actions: ["water"], bonusMeters: 0.5 }],
    presentation: { assetId: "tool_watering_can_long_spout_a", socket: "tool", scale: 0.72 },
    icon: "equipment.long_spout_watering_can"
  },
  "equipment.broad_sickle": {
    id: "equipment.broad_sickle",
    name: "Broad Sickle",
    description: "A wide blade gathers one extra Plant Matter from a mature annual crop when the satchel has room.",
    slot: "harvest-tool",
    starter: false,
    effects: [{ kind: "annual-plant-matter-bonus", quantity: 1 }],
    presentation: { assetId: "tool_sickle_broad_a", socket: "tool", scale: 0.82 },
    icon: "equipment.broad_sickle"
  },
  "equipment.balanced_sickle": {
    id: "equipment.balanced_sickle",
    name: "Balanced Sickle",
    description: "A weighted handle reduces the Work required to harvest.",
    slot: "harvest-tool",
    starter: false,
    effects: [{ kind: "work-multiplier", actions: ["farming.harvest"], multiplier: 0.8 }],
    presentation: { assetId: "tool_sickle_balanced_a", socket: "tool", scale: 0.82 },
    icon: "equipment.balanced_sickle"
  }
};

export const EQUIPMENT_SLOT_ORDER = [
  "head",
  "outerwear",
  "feet",
  "watering-tool",
  "harvest-tool"
] as const satisfies readonly EquipmentSlot[];

export const CLOTHING_SLOT_ORDER = ["head", "outerwear", "feet"] as const satisfies readonly ClothingSlot[];

export function createStarterEquipmentState(): PlayerEquipmentState {
  const clothing = {
    head: "equipment.weathered_straw_hat",
    outerwear: "equipment.work_vest",
    feet: "equipment.mud_boots"
  } as const satisfies Record<ClothingSlot, EquipmentId>;
  return {
    ownedIds: [...STARTER_EQUIPMENT_IDS],
    equipped: {
      ...clothing,
      "watering-tool": "equipment.tin_watering_can",
      "harvest-tool": "equipment.farm_sickle"
    },
    presets: {
      field: { ...clothing },
      sea: { ...clothing }
    },
    wardrobeCapacity: WARDROBE_CAPACITY
  };
}

export function presetLabel(id: EquipmentPresetId): string {
  return id === "field" ? "Field" : "Sea";
}
