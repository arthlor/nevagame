// src/content/ContentRegistry.ts

import {
  BoatDefinition,
  ContractTemplateDefinition,
  CropDefinition,
  FishBehaviorProfile,
  FishSpeciesDefinition,
  ItemDefinition,
  MarketDefinition,
  ProficiencyRankDefinition,
  RecipeDefinition,
  RodDefinition,
  NpcDefinition,
  QuestDefinition
} from "./types";
import { CROPS } from "./crops";
import { ITEMS } from "./items";
import { FISH_BEHAVIOR_PROFILES, FISH_SPECIES } from "./fish";
import { RECIPES } from "./recipes";
import { BOATS } from "./boats";
import { RODS } from "./rods";
import { MARKETS } from "./markets";
import { PROFICIENCY_RANKS } from "./progression";
import { CONTRACT_TEMPLATES } from "./contracts";
import { NPCS } from "./npcs";
import { QUESTS } from "./quests";

export class ContentRegistry {
  public static readonly crops: ReadonlyMap<string, CropDefinition> = new Map(Object.entries(CROPS));
  public static readonly items: ReadonlyMap<string, ItemDefinition> = new Map(Object.entries(ITEMS));
  public static readonly fishSpecies: ReadonlyMap<string, FishSpeciesDefinition> = new Map(Object.entries(FISH_SPECIES));
  public static readonly fishBehaviors: ReadonlyMap<string, FishBehaviorProfile> = new Map(Object.entries(FISH_BEHAVIOR_PROFILES));
  public static readonly recipes: ReadonlyMap<string, RecipeDefinition> = new Map(Object.entries(RECIPES));
  public static readonly boats: ReadonlyMap<string, BoatDefinition> = new Map(Object.entries(BOATS));
  public static readonly rods: ReadonlyMap<string, RodDefinition> = new Map(Object.entries(RODS));
  public static readonly markets: ReadonlyMap<string, MarketDefinition> = new Map(Object.entries(MARKETS));
  public static readonly ranks: ReadonlyArray<ProficiencyRankDefinition> = PROFICIENCY_RANKS;
  public static readonly contractTemplates: ReadonlyMap<string, ContractTemplateDefinition> = new Map(
    CONTRACT_TEMPLATES.map((t) => [t.id, t])
  );
  public static readonly npcs: ReadonlyMap<string, NpcDefinition> = new Map(NPCS.map((n) => [n.id, n]));
  public static readonly quests: ReadonlyMap<string, QuestDefinition> = new Map(QUESTS.map((q) => [q.id, q]));

  private static isInitialized = false;

  /**
   * Validates all content definitions on startup.
   * Throws detailed errors if any cross-references are broken.
   */
  public static initializeAndValidate(): void {
    if (this.isInitialized) return;

    // 1. Validate Crops
    for (const [cropId, crop] of this.crops.entries()) {
      if (!this.items.has(crop.seedItemId)) {
        throw new Error(`Crop '${cropId}' references missing seedItemId: '${crop.seedItemId}'`);
      }
      if (!this.items.has(crop.harvestItemId)) {
        throw new Error(`Crop '${cropId}' references missing harvestItemId: '${crop.harvestItemId}'`);
      }
      if (crop.baseGrowthMinutes <= 0) {
        throw new Error(`Crop '${cropId}' has invalid baseGrowthMinutes: ${crop.baseGrowthMinutes}`);
      }
    }

    // 2. Validate Fish & Behaviors
    for (const [fishId, fish] of this.fishSpecies.entries()) {
      if (!this.fishBehaviors.has(fish.behaviorProfileId)) {
        throw new Error(`Fish '${fishId}' references missing behaviorProfileId: '${fish.behaviorProfileId}'`);
      }
      if (fish.baseMarketValue <= 0) {
        throw new Error(`Fish '${fishId}' has non-positive baseMarketValue: ${fish.baseMarketValue}`);
      }
    }

    // 3. Validate Recipes
    for (const [recipeId, recipe] of this.recipes.entries()) {
      for (const input of recipe.inputs) {
        if (!this.items.has(input.itemId)) {
          throw new Error(`Recipe '${recipeId}' requires missing input itemId: '${input.itemId}'`);
        }
        if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
          throw new Error(`Recipe '${recipeId}' has invalid input quantity: ${input.quantity}`);
        }
      }
      for (const output of recipe.outputs) {
        if (!this.items.has(output.itemId)) {
          throw new Error(`Recipe '${recipeId}' produces missing output itemId: '${output.itemId}'`);
        }
        if (!Number.isSafeInteger(output.quantity) || output.quantity <= 0) {
          throw new Error(`Recipe '${recipeId}' has invalid output quantity: ${output.quantity}`);
        }
      }
    }

    // 4. Validate Markets
    for (const [marketId, market] of this.markets.entries()) {
      for (const commodity of market.commodities) {
        const itemExists = this.items.has(commodity.itemId);
        const fishExists = this.fishSpecies.has(commodity.itemId);
        if (!itemExists && !fishExists) {
          throw new Error(
            `Market '${marketId}' references commodity '${commodity.itemId}' which is neither a registered item nor fish species.`
          );
        }
        if (commodity.basePrice <= 0) {
          throw new Error(`Market '${marketId}' commodity '${commodity.itemId}' has invalid basePrice: ${commodity.basePrice}`);
        }
      }
    }

    // 5. Validate NPCs
    for (const [npcId, npc] of this.npcs.entries()) {
      if (!npc.name || !npc.anchor) {
        throw new Error(`NPC '${npcId}' is missing a valid name or anchor definition.`);
      }
    }

    // 6. Validate Quests
    for (const [questId, quest] of this.quests.entries()) {
      if (!this.npcs.has(quest.speakerId)) {
        throw new Error(`Quest '${questId}' references unknown speakerId '${quest.speakerId}'`);
      }
      if (!quest.objectives || quest.objectives.length === 0) {
        throw new Error(`Quest '${questId}' must have at least one objective.`);
      }
      if (quest.nextQuestId && !this.quests.has(quest.nextQuestId)) {
        throw new Error(`Quest '${questId}' references unknown nextQuestId '${quest.nextQuestId}'`);
      }
      for (const objective of quest.objectives) {
        if (!Number.isSafeInteger(objective.targetQuantity) || objective.targetQuantity <= 0) {
          throw new Error(`Quest '${questId}' objective '${objective.id}' has an invalid target quantity`);
        }
      }
      if (quest.rewards.items) {
        for (const item of quest.rewards.items) {
          if (!this.items.has(item.itemId)) {
            throw new Error(`Quest '${questId}' reward references missing itemId '${item.itemId}'`);
          }
        }
      }
    }

    this.isInitialized = true;
  }
}
