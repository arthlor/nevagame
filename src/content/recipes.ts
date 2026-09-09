// src/content/recipes.ts

import type { ItemStack, RecipeResult } from "../simulation/core/types";
import type { RecipeDefinition } from "./types";

const items = (...stacks: ItemStack[]): RecipeResult => ({ kind: "items", stacks });
const existing = { workTier: "standard", presentationKind: "existing" } as const;

export const RECIPES: Record<string, RecipeDefinition> = {
  "recipe.wheat_to_grain": {
    ...existing,
    id: "recipe.wheat_to_grain",
    name: "Mill Wheat into Ground Grain",
    stationType: "hand-mill",
    inputs: [{ itemId: "produce.wheat", quantity: 2 }],
    result: items({ itemId: "item.ground_grain", quantity: 2 }),
    durationMinutes: 5,
    tags: ["milling", "chum-prep"]
  },
  "recipe.barley_to_grain": {
    ...existing,
    id: "recipe.barley_to_grain",
    name: "Mill Barley into Ground Grain",
    stationType: "hand-mill",
    inputs: [{ itemId: "produce.barley", quantity: 2 }],
    result: items({ itemId: "item.ground_grain", quantity: 2 }),
    durationMinutes: 5,
    tags: ["milling", "chum-prep"]
  },
  "recipe.craft_chum": {
    ...existing,
    id: "recipe.craft_chum",
    name: "Mix Chum Bucket",
    stationType: "workbench",
    inputs: [
      { itemId: "item.ground_grain", quantity: 2 },
      { itemId: "item.bait_worms", quantity: 2 }
    ],
    result: items({ itemId: "item.chum_bucket", quantity: 1 }),
    durationMinutes: 10,
    tags: ["chum", "sport-fishing"]
  },
  "recipe.craft_chum_rich": {
    ...existing,
    id: "recipe.craft_chum_rich",
    name: "Mix Rich Chum Blend",
    stationType: "workbench",
    inputs: [
      { itemId: "item.ground_grain", quantity: 3 },
      { itemId: "item.bait_worms", quantity: 3 }
    ],
    result: items({ itemId: "item.chum_rich", quantity: 1 }),
    durationMinutes: 15,
    minimumSkill: { skill: "processing", xp: 500 },
    tags: ["chum", "sport-fishing"]
  },
  "recipe.craft_chum_deep": {
    ...existing,
    id: "recipe.craft_chum_deep",
    name: "Mix Sinking Deep Chum",
    stationType: "workbench",
    inputs: [
      { itemId: "item.ground_grain", quantity: 2 },
      { itemId: "item.fish_scraps", quantity: 2 }
    ],
    result: items({ itemId: "item.chum_deep", quantity: 1 }),
    durationMinutes: 15,
    minimumSkill: { skill: "processing", xp: 500 },
    tags: ["chum", "sport-fishing"]
  },
  "recipe.craft_lure": {
    ...existing,
    id: "recipe.craft_lure",
    name: "Tie Woven Lure Batch",
    stationType: "workbench",
    inputs: [
      { itemId: "produce.flax", quantity: 1 },
      { itemId: "item.fish_scraps", quantity: 1 }
    ],
    result: items({ itemId: "item.basic_lure", quantity: 2 }),
    durationMinutes: 15,
    minimumSkill: { skill: "processing", xp: 500 },
    tags: ["lure", "crafting"]
  },
  "recipe.craft_lure_simple": {
    ...existing,
    id: "recipe.craft_lure_simple",
    name: "Twist a Woven Lure",
    stationType: "workbench",
    inputs: [
      { itemId: "item.plant_matter", quantity: 2 },
      { itemId: "item.bait_worms", quantity: 2 }
    ],
    result: items({ itemId: "item.basic_lure", quantity: 1 }),
    durationMinutes: 10,
    tags: ["lure", "crafting", "starter-tackle"]
  },
  "recipe.fish_to_fertilizer": {
    ...existing,
    id: "recipe.fish_to_fertilizer",
    name: "Process Fish Scraps into Fertilizer",
    stationType: "fish-table",
    inputs: [{ itemId: "item.fish_scraps", quantity: 3 }],
    result: items({ itemId: "item.basic_fertilizer", quantity: 1 }),
    durationMinutes: 10,
    tags: ["fertilizer", "soil-care"]
  },
  "recipe.compost_worms": {
    ...existing,
    id: "recipe.compost_worms",
    name: "Cultivate Bait Worms",
    stationType: "compost-bin",
    inputs: [
      { itemId: "item.plant_matter", quantity: 4 },
      { itemId: "item.compost_starter", quantity: 1 }
    ],
    result: items({ itemId: "item.bait_worms", quantity: 25 }),
    durationMinutes: 360,
    tags: ["worms", "bait-production"]
  },
  "recipe.perch_to_scraps": {
    ...existing,
    id: "recipe.perch_to_scraps",
    name: "Clean Perch into Scraps",
    stationType: "fish-table",
    inputs: [{ itemId: "fish.perch", quantity: 1 }],
    result: items({ itemId: "item.fish_scraps", quantity: 2 }),
    durationMinutes: 5,
    tags: ["fish-prep", "scraps"]
  },
  "recipe.mackerel_to_scraps": {
    ...existing,
    id: "recipe.mackerel_to_scraps",
    name: "Clean Mackerel into Scraps",
    stationType: "fish-table",
    inputs: [{ itemId: "fish.mackerel", quantity: 1 }],
    result: items({ itemId: "item.fish_scraps", quantity: 2 }),
    durationMinutes: 5,
    tags: ["fish-prep", "scraps"]
  },
  "recipe.carp_to_scraps": {
    ...existing,
    id: "recipe.carp_to_scraps",
    name: "Clean Carp into Scraps",
    stationType: "fish-table",
    inputs: [{ itemId: "fish.carp", quantity: 1 }],
    result: items({ itemId: "item.fish_scraps", quantity: 2 }),
    durationMinutes: 5,
    tags: ["fish-prep", "scraps"]
  },
  "recipe.sunflower_to_grain": {
    ...existing,
    id: "recipe.sunflower_to_grain",
    name: "Mill Sunflower Seed into Ground Grain",
    stationType: "hand-mill",
    inputs: [{ itemId: "produce.sunflower_seed", quantity: 2 }],
    result: items({ itemId: "item.ground_grain", quantity: 2 }),
    durationMinutes: 5,
    tags: ["milling", "chum-prep", "sunreach"]
  },
  "recipe.cure_sardine": {
    ...existing,
    id: "recipe.cure_sardine",
    name: "Salt-Cure Sardines",
    stationType: "fish-table",
    inputs: [{ itemId: "fish.sardine", quantity: 2 }],
    result: items({ itemId: "item.salt_cured_fish", quantity: 1 }),
    durationMinutes: 45,
    minimumSkill: { skill: "processing", xp: 1000 },
    tags: ["fish-prep", "preserved"]
  },
  "recipe.sardine_to_scraps": {
    ...existing,
    id: "recipe.sardine_to_scraps",
    name: "Clean Sardines into Scraps",
    stationType: "fish-table",
    inputs: [{ itemId: "fish.sardine", quantity: 1 }],
    result: items({ itemId: "item.fish_scraps", quantity: 2 }),
    durationMinutes: 5,
    tags: ["fish-prep", "scraps", "sunreach"]
  },
  "recipe.linen_roll": {
    id: "recipe.linen_roll",
    name: "Weave Linen Roll",
    stationType: "workbench",
    inputs: [{ itemId: "produce.flax", quantity: 3 }],
    result: items({ itemId: "item.linen_roll", quantity: 1 }),
    durationMinutes: 20,
    workTier: "standard",
    presentationKind: "tailoring",
    tags: ["tailoring", "equipment-material"]
  },
  "recipe.oiled_canvas": {
    id: "recipe.oiled_canvas",
    name: "Oil Canvas",
    stationType: "workbench",
    inputs: [
      { itemId: "item.linen_roll", quantity: 1 },
      { itemId: "item.fish_scraps", quantity: 2 }
    ],
    result: items({ itemId: "item.oiled_canvas", quantity: 1 }),
    durationMinutes: 30,
    workTier: "standard",
    presentationKind: "tailoring",
    minimumSkill: { skill: "processing", xp: 1000 },
    tags: ["tailoring", "equipment-material"]
  },
  "recipe.field_hat": {
    id: "recipe.field_hat",
    name: "Sew Field Hat",
    stationType: "workbench",
    inputs: [
      { itemId: "item.linen_roll", quantity: 2 },
      { itemId: "item.tanned_leather", quantity: 1 }
    ],
    result: { kind: "equipment", equipmentId: "equipment.field_hat" },
    durationMinutes: 40,
    workTier: "standard",
    presentationKind: "tailoring",
    tags: ["tailoring", "equipment"]
  },
  "recipe.furrow_boots": {
    id: "recipe.furrow_boots",
    name: "Stitch Furrow Boots",
    stationType: "workbench",
    inputs: [
      { itemId: "item.tanned_leather", quantity: 2 },
      { itemId: "item.linen_roll", quantity: 1 }
    ],
    result: { kind: "equipment", equipmentId: "equipment.furrow_boots" },
    durationMinutes: 50,
    workTier: "standard",
    presentationKind: "tailoring",
    tags: ["tailoring", "equipment"]
  },
  "recipe.tidewatch_cap": {
    id: "recipe.tidewatch_cap",
    name: "Sew Tidewatch Cap",
    stationType: "workbench",
    inputs: [
      { itemId: "item.oiled_canvas", quantity: 2 },
      { itemId: "item.brass_fittings", quantity: 1 }
    ],
    result: { kind: "equipment", equipmentId: "equipment.tidewatch_cap" },
    durationMinutes: 50,
    workTier: "standard",
    presentationKind: "tailoring",
    minimumSkill: { skill: "processing", xp: 1000 },
    tags: ["tailoring", "equipment"]
  },
  "recipe.harvest_apron": {
    id: "recipe.harvest_apron",
    name: "Sew Harvest Apron",
    stationType: "workbench",
    inputs: [
      { itemId: "item.linen_roll", quantity: 3 },
      { itemId: "item.tanned_leather", quantity: 1 }
    ],
    result: { kind: "equipment", equipmentId: "equipment.harvest_apron" },
    durationMinutes: 60,
    workTier: "standard",
    presentationKind: "tailoring",
    minimumSkill: { skill: "processing", xp: 1000 },
    tags: ["tailoring", "equipment"]
  },
  "recipe.copper_rose_can": {
    id: "recipe.copper_rose_can",
    name: "Build Copper Rose Can",
    stationType: "workbench",
    inputs: [
      { itemId: "item.copper_sheet", quantity: 2 },
      { itemId: "item.brass_fittings", quantity: 1 },
      { itemId: "item.hardwood_blank", quantity: 1 }
    ],
    result: { kind: "equipment", equipmentId: "equipment.copper_rose_watering_can" },
    durationMinutes: 70,
    workTier: "masterwork",
    presentationKind: "toolmaking",
    minimumSkill: { skill: "processing", xp: 1000 },
    tags: ["toolmaking", "equipment"]
  },
  "recipe.broad_sickle": {
    id: "recipe.broad_sickle",
    name: "Forge Broad Sickle",
    stationType: "workbench",
    inputs: [
      { itemId: "item.tool_steel", quantity: 2 },
      { itemId: "item.hardwood_blank", quantity: 1 },
      { itemId: "item.tanned_leather", quantity: 1 }
    ],
    result: { kind: "equipment", equipmentId: "equipment.broad_sickle" },
    durationMinutes: 70,
    workTier: "masterwork",
    presentationKind: "toolmaking",
    minimumSkill: { skill: "processing", xp: 1000 },
    tags: ["toolmaking", "equipment"]
  },
  "recipe.deck_boots": {
    id: "recipe.deck_boots",
    name: "Stitch Deck Boots",
    stationType: "workbench",
    inputs: [
      { itemId: "item.tanned_leather", quantity: 2 },
      { itemId: "item.oiled_canvas", quantity: 1 },
      { itemId: "item.brass_fittings", quantity: 1 }
    ],
    result: { kind: "equipment", equipmentId: "equipment.deck_boots" },
    durationMinutes: 75,
    workTier: "masterwork",
    presentationKind: "tailoring",
    minimumSkill: { skill: "processing", xp: 3000 },
    tags: ["tailoring", "equipment"]
  },
  "recipe.oilskin_coat": {
    id: "recipe.oilskin_coat",
    name: "Sew Oilskin Coat",
    stationType: "workbench",
    inputs: [
      { itemId: "item.oiled_canvas", quantity: 3 },
      { itemId: "item.brass_fittings", quantity: 1 }
    ],
    result: { kind: "equipment", equipmentId: "equipment.oilskin_coat" },
    durationMinutes: 90,
    workTier: "masterwork",
    presentationKind: "tailoring",
    minimumSkill: { skill: "processing", xp: 3000 },
    tags: ["tailoring", "equipment"]
  },
  "recipe.long_spout_can": {
    id: "recipe.long_spout_can",
    name: "Build Long-Spout Can",
    stationType: "workbench",
    inputs: [
      { itemId: "item.copper_sheet", quantity: 3 },
      { itemId: "item.brass_fittings", quantity: 2 },
      { itemId: "item.hardwood_blank", quantity: 1 }
    ],
    result: { kind: "equipment", equipmentId: "equipment.long_spout_watering_can" },
    durationMinutes: 90,
    workTier: "masterwork",
    presentationKind: "toolmaking",
    minimumSkill: { skill: "processing", xp: 3000 },
    tags: ["toolmaking", "equipment"]
  },
  "recipe.balanced_sickle": {
    id: "recipe.balanced_sickle",
    name: "Forge Balanced Sickle",
    stationType: "workbench",
    inputs: [
      { itemId: "item.tool_steel", quantity: 2 },
      { itemId: "item.hardwood_blank", quantity: 1 },
      { itemId: "item.brass_fittings", quantity: 1 }
    ],
    result: { kind: "equipment", equipmentId: "equipment.balanced_sickle" },
    durationMinutes: 90,
    workTier: "masterwork",
    presentationKind: "toolmaking",
    minimumSkill: { skill: "processing", xp: 3000 },
    tags: ["toolmaking", "equipment"]
  }
};

/**
 * Recipe definitions may include authored future content, but only this set
 * is exposed by the current P12 station loop. Keeping the deferred definition
 * in the registry preserves save validation for an already-created job.
 */
export const LIVE_RECIPE_IDS = new Set<RecipeDefinition["id"]>(Object.keys(RECIPES));
