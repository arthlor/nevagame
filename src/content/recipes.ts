// src/content/recipes.ts

import { RecipeDefinition } from "./types";

export const RECIPES: Record<string, RecipeDefinition> = {
  "recipe.wheat_to_grain": {
    id: "recipe.wheat_to_grain",
    name: "Mill Wheat into Ground Grain",
    stationType: "hand-mill",
    inputs: [{ itemId: "produce.wheat", quantity: 2 }],
    outputs: [{ itemId: "item.ground_grain", quantity: 2 }],
    durationMinutes: 5,
    tags: ["milling", "chum-prep"]
  },
  "recipe.barley_to_grain": {
    id: "recipe.barley_to_grain",
    name: "Mill Barley into Ground Grain",
    stationType: "hand-mill",
    inputs: [{ itemId: "produce.barley", quantity: 2 }],
    outputs: [{ itemId: "item.ground_grain", quantity: 2 }],
    durationMinutes: 5,
    tags: ["milling", "chum-prep"]
  },
  "recipe.craft_chum": {
    id: "recipe.craft_chum",
    name: "Mix Chum Bucket",
    stationType: "workbench",
    inputs: [
      { itemId: "item.ground_grain", quantity: 2 },
      { itemId: "item.bait_worms", quantity: 2 }
    ],
    outputs: [{ itemId: "item.chum_bucket", quantity: 1 }],
    durationMinutes: 10,
    tags: ["chum", "sport-fishing"]
  },
  "recipe.craft_lure": {
    id: "recipe.craft_lure",
    name: "Tie Feather Lure",
    stationType: "workbench",
    inputs: [
      { itemId: "produce.flax", quantity: 1 },
      { itemId: "item.fish_scraps", quantity: 1 }
    ],
    outputs: [{ itemId: "item.basic_lure", quantity: 2 }],
    durationMinutes: 15,
    minimumSkill: { skill: "processing", xp: 500 },
    tags: ["lure", "crafting"]
  },
  "recipe.fish_to_fertilizer": {
    id: "recipe.fish_to_fertilizer",
    name: "Process Fish Scraps into Fertilizer",
    stationType: "fish-table",
    inputs: [{ itemId: "item.fish_scraps", quantity: 3 }],
    outputs: [{ itemId: "item.basic_fertilizer", quantity: 1 }],
    durationMinutes: 10,
    tags: ["fertilizer", "soil-care"]
  },
  "recipe.compost_worms": {
    id: "recipe.compost_worms",
    name: "Cultivate Bait Worms",
    stationType: "compost-bin",
    inputs: [
      { itemId: "item.plant_matter", quantity: 4 },
      { itemId: "item.compost_starter", quantity: 1 }
    ],
    outputs: [{ itemId: "item.bait_worms", quantity: 25 }],
    durationMinutes: 360,
    tags: ["worms", "bait-production"]
  },
  "recipe.perch_to_scraps": {
    id: "recipe.perch_to_scraps",
    name: "Clean Perch into Scraps",
    stationType: "fish-table",
    inputs: [{ itemId: "fish.perch", quantity: 1 }],
    outputs: [{ itemId: "item.fish_scraps", quantity: 2 }],
    durationMinutes: 5,
    tags: ["fish-prep", "scraps"]
  },
  "recipe.mackerel_to_scraps": {
    id: "recipe.mackerel_to_scraps",
    name: "Clean Mackerel into Scraps",
    stationType: "fish-table",
    inputs: [{ itemId: "fish.mackerel", quantity: 1 }],
    outputs: [{ itemId: "item.fish_scraps", quantity: 2 }],
    durationMinutes: 5,
    tags: ["fish-prep", "scraps"]
  }
};
