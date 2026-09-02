// src/content/items.ts

import { ItemDefinition } from "./types";

export const ITEMS: Record<string, ItemDefinition> = {
  // Seeds
  "seed.wheat": {
    id: "seed.wheat",
    name: "Wheat Seeds",
    category: "seed",
    description: "Standard wheat grains ready for planting. High yield for grinding into chum base.",
    stackLimit: 100,
    baseValue: 4,
    tags: ["crop-seed", "temperate"]
  },
  "seed.barley": {
    id: "seed.barley",
    name: "Barley Seeds",
    category: "seed",
    description: "Hardy cereal grains. Excellent for brewing and fish feed.",
    stackLimit: 100,
    baseValue: 6,
    tags: ["crop-seed", "temperate"]
  },
  "seed.corn": {
    id: "seed.corn",
    name: "Corn Kernels",
    category: "seed",
    description: "Warm-climate golden maize seeds.",
    stackLimit: 100,
    baseValue: 8,
    tags: ["crop-seed", "warm"]
  },
  "seed.tomato": {
    id: "seed.tomato",
    name: "Tomato Seeds",
    category: "seed",
    description: "Juicy vine tomato seeds. High market demand in summer.",
    stackLimit: 100,
    baseValue: 8,
    tags: ["crop-seed", "temperate"]
  },
  "seed.potato": {
    id: "seed.potato",
    name: "Seed Potato",
    category: "seed",
    description: "Tuber ready to sprout in cool, fertile soil.",
    stackLimit: 100,
    baseValue: 6,
    tags: ["crop-seed", "cool"]
  },
  "seed.carrot": {
    id: "seed.carrot",
    name: "Carrot Seeds",
    category: "seed",
    description: "Crisp root vegetable seeds for cool climates.",
    stackLimit: 100,
    baseValue: 5,
    tags: ["crop-seed", "cool"]
  },
  "seed.flax": {
    id: "seed.flax",
    name: "Flax Seeds",
    category: "seed",
    description: "Fiber crop seeds used to weave nets and sturdy line.",
    stackLimit: 100,
    baseValue: 10,
    tags: ["crop-seed", "temperate"]
  },
  "seed.apple_sapling": {
    id: "seed.apple_sapling",
    name: "Apple Tree Sapling",
    category: "seed",
    description: "Young orchard tree that regrows crisp orchard apples season after season.",
    stackLimit: 20,
    baseValue: 45,
    tags: ["tree-sapling", "orchard"]
  },
  "seed.sunflower": {
    id: "seed.sunflower",
    name: "Sunflower Seeds",
    category: "seed",
    description: "Sun-loving seed selected for Sunreach's warm terraces.",
    stackLimit: 100,
    baseValue: 7,
    tags: ["crop-seed", "warm", "sunreach"]
  },
  "seed.olive_sapling": {
    id: "seed.olive_sapling",
    name: "Olive Sapling",
    category: "seed",
    description: "A hardy young olive tree suited to warm, well-drained ground.",
    stackLimit: 20,
    baseValue: 55,
    tags: ["tree-sapling", "warm", "sunreach"]
  },

  // Produce & Harvested Goods
  "produce.wheat": {
    id: "produce.wheat",
    name: "Harvested Wheat",
    category: "grain",
    description: "Golden sheaves of ripe wheat. Mill into ground grain.",
    stackLimit: 100,
    baseValue: 8,
    tags: ["grain", "millable"]
  },
  "produce.barley": {
    id: "produce.barley",
    name: "Harvested Barley",
    category: "grain",
    description: "Dense barley heads. Ideal for ground grain feed.",
    stackLimit: 100,
    baseValue: 10,
    tags: ["grain", "millable"]
  },
  "produce.corn": {
    id: "produce.corn",
    name: "Sweet Corn",
    category: "produce",
    description: "Fresh ears of sweet corn.",
    stackLimit: 100,
    baseValue: 14,
    tags: ["produce"]
  },
  "produce.tomato": {
    id: "produce.tomato",
    name: "Plump Tomato",
    category: "produce",
    description: "Bright red garden tomato.",
    stackLimit: 100,
    baseValue: 12,
    tags: ["produce"]
  },
  "produce.potato": {
    id: "produce.potato",
    name: "Earthy Potato",
    category: "produce",
    description: "Starchy staple crop for cooking or market sale.",
    stackLimit: 100,
    baseValue: 11,
    tags: ["produce"]
  },
  "produce.carrot": {
    id: "produce.carrot",
    name: "Crisp Carrot",
    category: "produce",
    description: "Sweet orange carrot rich in color.",
    stackLimit: 100,
    baseValue: 9,
    tags: ["produce"]
  },
  "produce.flax": {
    id: "produce.flax",
    name: "Flax Stalks",
    category: "crafting-material",
    description: "Raw plant fiber for cordage and sailcloth.",
    stackLimit: 100,
    baseValue: 16,
    tags: ["fiber", "crafting"]
  },
  "produce.apple": {
    id: "produce.apple",
    name: "Orchard Apple",
    category: "produce",
    description: "Crisp red apple harvested from the orchard.",
    stackLimit: 100,
    baseValue: 15,
    tags: ["fruit", "produce"]
  },
  "produce.sunflower_seed": {
    id: "produce.sunflower_seed",
    name: "Sunflower Seed",
    category: "grain",
    description: "A ripe terrace harvest that can be milled into ground grain.",
    stackLimit: 100,
    baseValue: 13,
    tags: ["grain", "millable", "sunreach"]
  },
  "produce.olive": {
    id: "produce.olive",
    name: "Sunreach Olive",
    category: "produce",
    description: "Firm warm-climate olives from the terraced groves.",
    stackLimit: 100,
    baseValue: 22,
    tags: ["fruit", "produce", "sunreach"]
  },

  // Fishing Supplies & Intermediate Products
  "item.ground_grain": {
    id: "item.ground_grain",
    name: "Ground Grain",
    category: "fishing-supply",
    description: "Finely milled wheat or barley meal. Core ingredient for chum.",
    stackLimit: 100,
    baseValue: 12,
    tags: ["chum-input"]
  },
  "item.bait_worms": {
    id: "item.bait_worms",
    name: "Bait Worms",
    category: "bait",
    description: "Wriggling earthworms harvested from rich compost. Used for basic fishing and chum.",
    stackLimit: 100,
    baseValue: 5,
    tags: ["bait", "freshwater"]
  },
  "item.chum_bucket": {
    id: "item.chum_bucket",
    name: "Chum Bucket",
    category: "fishing-supply",
    description: "Aromatic mix of ground grain and bait. Cast onto fish schools to trigger feeding frenzies.",
    stackLimit: 50,
    baseValue: 25,
    tags: ["chum", "sport-fishing"]
  },
  "item.basic_lure": {
    id: "item.basic_lure",
    name: "Feather Lure",
    category: "fishing-supply",
    description: "Handcrafted coastal lure with flashing tinsel.",
    stackLimit: 50,
    baseValue: 20,
    tags: ["lure"]
  },
  "item.fish_scraps": {
    id: "item.fish_scraps",
    name: "Fish Scraps",
    category: "crafting-material",
    description: "Cleaned trimmings from fish preparation. Excellent organic fertilizer.",
    stackLimit: 100,
    baseValue: 4,
    tags: ["fertilizer-input"]
  },
  "item.basic_fertilizer": {
    id: "item.basic_fertilizer",
    name: "Fish Fertilizer",
    category: "fertilizer",
    description: "Nutrient-rich soil conditioner made from processed fish trimmings. Restores farm fertility.",
    stackLimit: 50,
    baseValue: 18,
    tags: ["fertilizer", "soil-care"]
  },
  "item.compost_starter": {
    id: "item.compost_starter",
    name: "Compost Starter",
    category: "crafting-material",
    description: "Rich active cultures to turn crop waste into bait worms.",
    stackLimit: 50,
    baseValue: 10,
    tags: ["compost"]
  },
  "item.plant_matter": {
    id: "item.plant_matter",
    name: "Plant Matter",
    category: "crafting-material",
    description: "Leaves, chaff and trimmings suitable for composting.",
    stackLimit: 100,
    baseValue: 2,
    tags: ["compost-input"]
  },
  "item.boat_fuel": {
    id: "item.boat_fuel",
    name: "Engine Fuel",
    category: "fuel",
    description: "Refined kerosene fuel for motor skiffs.",
    stackLimit: 20,
    baseValue: 30,
    tags: ["fuel"]
  },
  "item.crushed_ice": {
    id: "item.crushed_ice",
    name: "Crushed Ice",
    category: "ice",
    description: "Insulated ice pack. Slows freshness decay in boat holds and storage.",
    stackLimit: 50,
    baseValue: 15,
    tags: ["ice", "preservation"]
  },

  // Harbor-tradable basic catch IDs matching ContentRegistry.fishSpecies
  "fish.perch": {
    id: "fish.perch",
    name: "River Perch",
    category: "produce",
    description: "Small spiny river fish caught with a basic rod.",
    stackLimit: 50,
    baseValue: 15,
    tags: ["fish", "freshwater", "small-catch"]
  },
  "fish.mackerel": {
    id: "fish.mackerel",
    name: "Atlantic Mackerel",
    category: "produce",
    description: "Silvery schooling fish caught in nearshore waters.",
    stackLimit: 50,
    baseValue: 18,
    tags: ["fish", "saltwater", "small-catch"]
  },
  "fish.carp": {
    id: "fish.carp",
    name: "Common Carp",
    category: "produce",
    description: "A sturdy freshwater carp caught with a basic rod.",
    stackLimit: 50,
    baseValue: 35,
    tags: ["fish", "freshwater", "small-catch"]
  },
  "fish.sardine": {
    id: "fish.sardine",
    name: "Sunreach Sardine",
    category: "produce",
    description: "A small silver fish schooling inside Sunreach Cove.",
    stackLimit: 50,
    baseValue: 12,
    tags: ["fish", "saltwater", "small-catch", "sunreach"]
  },
  "fish.sea_bream": {
    id: "fish.sea_bream",
    name: "Golden Sea Bream",
    category: "produce",
    description: "A reef-edge bream with a warm gold flash along its flank.",
    stackLimit: 20,
    baseValue: 55,
    tags: ["fish", "saltwater", "physical-basic-catch", "sunreach"]
  }
};
