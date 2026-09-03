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
import { LIVE_FEATURE_IDS, PROFICIENCY_RANKS, rankIndexForRequirement } from "./progression";
import { CONTRACT_TEMPLATES, CONTRACT_TYPES } from "./contracts";
import { NPCS } from "./npcs";
import { QUESTS } from "./quests";
import { QUEST_TRACKS } from "./questTracks";
import type { QuestTrackDefinition } from "../simulation/core/QuestTypes";
import { KNOWLEDGE_ENTRIES, type KnowledgeEntryDefinition } from "./knowledge";
import { WORLD_FARM_DEFINITIONS, WORLD_STATION_DEFINITIONS } from "../world/WorldGameplayLocations";
import { FISHING_ECOLOGY_DEFINITIONS } from "../world/WorldIslands";

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
  public static readonly questTracks: ReadonlyMap<string, QuestTrackDefinition> = new Map(
    QUEST_TRACKS.map((track) => [track.id, track])
  );
  public static readonly knowledge: ReadonlyMap<string, KnowledgeEntryDefinition> = new Map(Object.entries(KNOWLEDGE_ENTRIES));

  private static isInitialized = false;

  /**
   * Validates all content definitions on startup.
   * Throws detailed errors if any cross-references are broken.
   */
  public static initializeAndValidate(): void {
    if (this.isInitialized) return;

    this.assertUniqueIds("contract template", CONTRACT_TEMPLATES);
    this.assertUniqueIds("NPC", NPCS);
    this.assertUniqueIds("quest", QUESTS);

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
      if (!fish.ecologyIds.length || fish.ecologyIds.some((id) => !FISHING_ECOLOGY_DEFINITIONS[id])) {
        throw new Error(`Fish '${fishId}' has an invalid fishing ecology`);
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
    const commodityBasePrices = new Map<string, { marketId: string; basePrice: number }>();
    for (const [marketId, market] of this.markets.entries()) {
      const listedIds = new Set<string>();
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
        if (listedIds.has(commodity.itemId)) {
          throw new Error(`Market '${marketId}' lists commodity '${commodity.itemId}' more than once`);
        }
        listedIds.add(commodity.itemId);
        if (commodity.targetSupply < 1) {
          throw new Error(`Market '${marketId}' commodity '${commodity.itemId}' has invalid targetSupply: ${commodity.targetSupply}`);
        }
        if (commodity.consumptionRatePerHour <= 0) {
          throw new Error(`Market '${marketId}' commodity '${commodity.itemId}' has invalid consumptionRatePerHour: ${commodity.consumptionRatePerHour}`);
        }
        for (const [season, factor] of Object.entries(commodity.seasonalFactors)) {
          if (factor <= 0 || factor > 2) {
            throw new Error(`Market '${marketId}' commodity '${commodity.itemId}' has invalid ${season} seasonal factor: ${factor}`);
          }
        }
        const previous = commodityBasePrices.get(commodity.itemId);
        if (previous && previous.basePrice !== commodity.basePrice) {
          throw new Error(
            `Commodity '${commodity.itemId}' has conflicting base prices in '${previous.marketId}' and '${marketId}'`
          );
        }
        commodityBasePrices.set(commodity.itemId, { marketId, basePrice: commodity.basePrice });
      }
      for (const itemId of market.retail.itemIds) {
        if (!this.items.has(itemId)) throw new Error(`Market '${marketId}' retails missing item '${itemId}'`);
      }
      for (const cropId of market.retail.seedCropIds ?? []) {
        if (!this.crops.has(cropId)) throw new Error(`Market '${marketId}' stocks seed for missing crop '${cropId}'`);
      }
      for (const rodId of market.retail.rodIds ?? []) {
        if (!this.rods.has(rodId)) throw new Error(`Market '${marketId}' retails missing rod '${rodId}'`);
      }
    }

    // 5. Validate NPCs
    for (const [npcId, npc] of this.npcs.entries()) {
      if (!npc.name || !npc.anchor) {
        throw new Error(`NPC '${npcId}' is missing a valid name or anchor definition.`);
      }
    }

    // 6. Validate authored quest content and its single reachable chain.
    this.validateQuestDefinitions(QUESTS);
    this.validateNpcRecognition();

    this.validateProgressionAndEquipment();
    this.isInitialized = true;
  }

  private static assertUniqueIds(label: string, definitions: ReadonlyArray<{ id: string }>): void {
    const ids = new Set<string>();
    for (const definition of definitions) {
      if (ids.has(definition.id)) throw new Error(`Duplicate ${label} id '${definition.id}'`);
      ids.add(definition.id);
    }
  }

  public static validateQuestDefinitions(definitions: readonly QuestDefinition[]): void {
    this.assertUniqueIds("quest", definitions);
    const questMap = new Map(definitions.map((quest) => [quest.id, quest]));
    const objectiveIds = new Set<string>();
    const supportedTypes = new Set([
      "talk-npc", "plant-crop", "water-crop", "harvest-crop", "craft-recipe",
      "catch-basic-fish", "chum-school", "hook-sport-fish", "land-sport-fish",
      "stow-cargo", "board-boat", "dock-boat", "sell-item", "sell-fish",
      "purchase-upgrade", "complete-contract", "apply-fertilizer", "install-irrigation", "irrigate-farm"
    ]);
    const farms = new Set(Object.keys(WORLD_FARM_DEFINITIONS));
    const stations = new Set(Object.keys(WORLD_STATION_DEFINITIONS));
    const habitats = new Set(["river", "lake", "coast", "offshore"]);
    const ecologies = new Set(Object.keys(FISHING_ECOLOGY_DEFINITIONS));
    const boatIds = new Set(["boat.player_rowboat", "boat.player_skiff", ...this.boats.keys()]);
    const expectedKinds: Partial<Record<string, string[]>> = {
      "plant-crop": ["farm"], "water-crop": ["farm"], "harvest-crop": ["farm"],
      "apply-fertilizer": ["farm"], "install-irrigation": ["farm"], "irrigate-farm": ["farm"],
      "craft-recipe": ["station"], "catch-basic-fish": ["habitat", "ecology", "boat"], "chum-school": ["habitat", "ecology"],
      "hook-sport-fish": ["habitat", "ecology"],
      // No "habitat": `FishLanded` carries speciesId, ecologyId and boatId only,
      // so a habitat-located landing objective could never complete. Hooking
      // does emit a habitat, which is how a per-water objective is authored.
      "land-sport-fish": ["boat", "ecology"],
      "stow-cargo": ["boat"], "board-boat": ["boat"], "dock-boat": ["boat", "market"],
      "sell-item": ["market"], "sell-fish": ["market"]
    };

    for (const quest of definitions) {
      if (!this.npcs.has(quest.speakerId)) throw new Error(`Quest '${quest.id}' references unknown speakerId '${quest.speakerId}'`);
      if (!quest.objectives?.length) throw new Error(`Quest '${quest.id}' must have at least one objective.`);
      if (quest.nextQuestId && !questMap.has(quest.nextQuestId)) throw new Error(`Quest '${quest.id}' references unknown nextQuestId '${quest.nextQuestId}'`);

      for (const objective of quest.objectives) {
        if (objectiveIds.has(objective.id)) throw new Error(`Duplicate quest objective id '${objective.id}'`);
        objectiveIds.add(objective.id);
        if (!supportedTypes.has(objective.type)) throw new Error(`Quest '${quest.id}' objective '${objective.id}' has unsupported type '${objective.type}'`);
        if (!Number.isSafeInteger(objective.targetQuantity) || objective.targetQuantity <= 0) throw new Error(`Quest '${quest.id}' objective '${objective.id}' has an invalid target quantity`);
        if (objective.targetId) this.validateQuestTarget(quest.id, objective.type, objective.targetId, farms, boatIds);

        const location = objective.location;
        if (!location) continue;
        if (location.kind === "farm" && !farms.has(location.id)) throw new Error(`Quest '${quest.id}' objective '${objective.id}' references unknown farm '${location.id}'`);
        if (location.kind === "market" && !this.markets.has(location.id)) throw new Error(`Quest '${quest.id}' objective '${objective.id}' references unknown market '${location.id}'`);
        if (location.kind === "station" && !stations.has(location.id)) throw new Error(`Quest '${quest.id}' objective '${objective.id}' references unknown station '${location.id}'`);
        if (location.kind === "habitat" && !habitats.has(location.id)) throw new Error(`Quest '${quest.id}' objective '${objective.id}' references unknown habitat '${location.id}'`);
        if (location.kind === "ecology" && !ecologies.has(location.id)) throw new Error(`Quest '${quest.id}' objective '${objective.id}' references unknown ecology '${location.id}'`);
        if (location.kind === "boat" && !boatIds.has(location.id)) throw new Error(`Quest '${quest.id}' objective '${objective.id}' references unknown boat '${location.id}'`);
        const allowedKinds = expectedKinds[objective.type];
        if (allowedKinds && !allowedKinds.includes(location.kind)) throw new Error(`Quest '${quest.id}' objective '${objective.id}' has unsupported ${location.kind} location`);
      }

      this.validateItemBatch(quest.id, "reward", quest.rewards.items);
      this.validateItemBatch(quest.id, "turn-in cost", quest.turnInCost?.items);
      if (quest.turnInCost?.money !== undefined && (!Number.isSafeInteger(quest.turnInCost.money) || quest.turnInCost.money <= 0)) throw new Error(`Quest '${quest.id}' has invalid turn-in money cost`);
      if (quest.rewards.money !== undefined && (!Number.isSafeInteger(quest.rewards.money) || quest.rewards.money < 0)) throw new Error(`Quest '${quest.id}' has invalid money reward`);
      for (const id of [...(quest.rewards.unlocksFeatureIds ?? []), ...(quest.rewards.unlocksKnowledgeIds ?? [])]) {
        if (!id.trim()) throw new Error(`Quest '${quest.id}' has an empty unlock id`);
      }
      for (const id of quest.rewards.unlocksKnowledgeIds ?? []) {
        const resolved = this.knowledge.has(id) ? id : `knowledge.${id}`;
        if (!this.knowledge.has(id) && !this.knowledge.has(resolved)) {
          throw new Error(`Quest '${quest.id}' references unknown knowledge '${id}'`);
        }
      }
    }

    // One chain per track, walked from that track's entry quest. A quest must
    // be reachable from its own track, and a chain may never cross tracks —
    // that is what keeps parallel tracks parallel rather than branching.
    const visited = new Set<string>();
    for (const track of QUEST_TRACKS) {
      let cursor: string | undefined = track.entryQuestId;
      while (cursor) {
        if (visited.has(cursor)) throw new Error(`Quest chain cycle detected at '${cursor}'`);
        visited.add(cursor);
        const quest: QuestDefinition | undefined = questMap.get(cursor);
        if (!quest) throw new Error(`Quest chain references missing quest '${cursor}'`);
        if (quest.trackId !== track.id) {
          throw new Error(`Quest '${quest.id}' is on track '${quest.trackId}' but chained from '${track.id}'`);
        }
        cursor = quest.nextQuestId;
      }
    }
    for (const quest of definitions) {
      if (!this.questTracks.has(quest.trackId)) {
        throw new Error(`Quest '${quest.id}' references unknown track '${quest.trackId}'`);
      }
    }
    const unreachable = definitions.filter((quest) => !visited.has(quest.id)).map((quest) => quest.id);
    if (unreachable.length) throw new Error(`Unreachable quests: ${unreachable.join(", ")}`);
  }

  private static validateItemBatch(questId: string, label: string, items: Array<{ itemId: string; quantity: number }> | undefined): void {
    const seen = new Set<string>();
    for (const item of items ?? []) {
      if (!this.items.has(item.itemId)) throw new Error(`Quest '${questId}' ${label} references missing itemId '${item.itemId}'`);
      if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new Error(`Quest '${questId}' ${label} has invalid item quantity`);
      if (seen.has(item.itemId)) throw new Error(`Quest '${questId}' ${label} repeats itemId '${item.itemId}'`);
      seen.add(item.itemId);
    }
  }

  private static validateNpcRecognition(): void {
    for (const npc of this.npcs.values()) {
      const ids = new Set<string>();
      for (const entry of npc.recognitionDialogue ?? []) {
        if (ids.has(entry.id)) throw new Error(`NPC '${npc.id}' repeats recognition dialogue '${entry.id}'`);
        ids.add(entry.id);
        if (!entry.lines.length || entry.lines.some((line) => !line.trim())) throw new Error(`NPC '${npc.id}' recognition dialogue '${entry.id}' has no usable lines`);
        for (const questId of entry.requiresCompletedQuestIds ?? []) {
          if (!this.quests.has(questId)) throw new Error(`NPC '${npc.id}' recognition dialogue references unknown quest '${questId}'`);
        }
      }
    }
  }

  private static validateQuestTarget(questId: string, type: string, targetId: string, farms: Set<string>, boats: Set<string>): void {
    switch (type) {
      case "talk-npc":
        if (!this.npcs.has(targetId)) throw new Error(`Quest '${questId}' talk-npc target '${targetId}' is not an NPC`);
        return;
      case "plant-crop":
      case "harvest-crop":
        if (!this.crops.has(targetId)) throw new Error(`Quest '${questId}' crop target '${targetId}' is missing`);
        return;
      case "craft-recipe":
        if (!this.recipes.has(targetId)) throw new Error(`Quest '${questId}' recipe target '${targetId}' is missing`);
        return;
      case "sell-item":
        if (!this.items.has(targetId)) throw new Error(`Quest '${questId}' sell-item target '${targetId}' is missing`);
        return;
      case "catch-basic-fish":
      case "hook-sport-fish":
      case "land-sport-fish":
      case "sell-fish":
        if (!this.fishSpecies.has(targetId) && !this.items.has(targetId)) throw new Error(`Quest '${questId}' fish target '${targetId}' is missing`);
        return;
      case "complete-contract":
        // Either one template, or any contract of a type.
        if (!this.contractTemplates.has(targetId) && !CONTRACT_TYPES.has(targetId)) {
          throw new Error(`Quest '${questId}' contract target '${targetId}' is neither a template nor a contract type`);
        }
        return;
      case "apply-fertilizer":
      case "irrigate-farm":
        if (!farms.has(targetId)) throw new Error(`Quest '${questId}' farm target '${targetId}' is missing`);
        return;
      case "install-irrigation":
        if (targetId !== "feature.irrigation_zone") throw new Error(`Quest '${questId}' irrigation target '${targetId}' is unsupported`);
        return;
      case "board-boat":
      case "dock-boat":
        if (!boats.has(targetId)) throw new Error(`Quest '${questId}' boat target '${targetId}' is missing`);
        return;
      case "purchase-upgrade":
        if (!this.rods.has(targetId) && !boats.has(targetId)) throw new Error(`Quest '${questId}' upgrade target '${targetId}' is missing`);
        return;
      default:
        return;
    }
  }

  private static validateProgressionAndEquipment(): void {
    const bandFor = (requiredXp: number): number => rankIndexForRequirement(requiredXp);
    const advertisedCrops = new Set<string>();
    const advertisedRecipes = new Set<string>();

    for (const rank of this.ranks) {
      // A rank may only advertise a feature the simulation actually reads.
      // The ladder previously listed 25 feature ids, 23 of them unimplemented.
      for (const column of [rank.farmingUnlocks, rank.fishingUnlocks, rank.tradingUnlocks, rank.processingUnlocks]) {
        for (const id of column) {
          if (id.startsWith("feature.") && !LIVE_FEATURE_IDS.has(id)) {
            throw new Error(`Rank '${rank.rankName}' advertises '${id}', which no live system reads`);
          }
        }
      }

      for (const id of rank.farmingUnlocks) {
        if (!id.startsWith("crop.")) continue;
        const crop = this.crops.get(id);
        if (!crop) throw new Error(`Rank '${rank.rankName}' farmingUnlocks missing crop '${id}'`);
        if (bandFor(crop.minimumFarmingXp) !== rank.rankIndex) {
          throw new Error(
            `Crop '${id}' unlocks at ${crop.minimumFarmingXp} Farming XP but is advertised at rank '${rank.rankName}'`
          );
        }
        advertisedCrops.add(id);
      }

      for (const id of rank.processingUnlocks) {
        if (!id.startsWith("recipe.")) continue;
        const recipe = this.recipes.get(id);
        if (!recipe) throw new Error(`Rank '${rank.rankName}' processingUnlocks missing recipe '${id}'`);
        if (bandFor(recipe.minimumSkill?.xp ?? 0) !== rank.rankIndex) {
          throw new Error(
            `Recipe '${id}' unlocks at ${recipe.minimumSkill?.xp ?? 0} XP but is advertised at rank '${rank.rankName}'`
          );
        }
        advertisedRecipes.add(id);
      }

      for (const id of rank.fishingUnlocks) {
        if (id.startsWith("rod.") && !this.rods.has(id)) throw new Error(`Rank '${rank.rankName}' fishingUnlocks missing rod '${id}'`);
        if (!id.startsWith("boat.")) continue;
        const boat = [...this.boats.values()].find((candidate) => candidate.id === id);
        if (!boat) throw new Error(`Rank '${rank.rankName}' fishingUnlocks missing boat '${id}'`);
        const requirement = boat.requiredSkillXp;
        if (requirement?.skill === "fishing" && bandFor(requirement.xp) !== rank.rankIndex) {
          throw new Error(
            `Boat '${id}' requires ${requirement.xp} Fishing XP but is advertised at rank '${rank.rankName}'`
          );
        }
      }

      for (const id of rank.tradingUnlocks) {
        if (id.startsWith("market.") && !this.markets.has(id)) throw new Error(`Rank '${rank.rankName}' tradingUnlocks missing market '${id}'`);
        if (id.startsWith("contract.") && !this.contractTemplates.has(id)) throw new Error(`Rank '${rank.rankName}' tradingUnlocks missing contract template '${id}'`);
      }
    }

    // Completeness: a crop or recipe added without a rank row would otherwise
    // be invisible in the ladder even though it is reachable in the world.
    for (const cropId of this.crops.keys()) {
      if (!advertisedCrops.has(cropId)) throw new Error(`Crop '${cropId}' is not advertised by any proficiency rank`);
    }
    for (const recipeId of this.recipes.keys()) {
      if (!advertisedRecipes.has(recipeId)) throw new Error(`Recipe '${recipeId}' is not advertised by any proficiency rank`);
    }
    for (const [rodId, rod] of this.rods) if (rod.costMoney < 0) throw new Error(`Rod '${rodId}' has invalid costMoney`);
    for (const [boatId, boat] of this.boats) if (boat.fuelCapacity < 0) throw new Error(`Boat '${boatId}' has invalid fuelCapacity`);
    for (const [templateId, template] of this.contractTemplates) {
      if (!this.markets.has(template.deliveryMarketId)) throw new Error(`Contract '${templateId}' delivery market '${template.deliveryMarketId}' is missing`);
      for (const poolId of template.itemOrSpeciesPool) {
        if (!this.items.has(poolId) && !this.fishSpecies.has(poolId)) throw new Error(`Contract '${templateId}' pool id '${poolId}' is neither an item nor a fish species`);
      }
    }
  }
}
