// src/content/types.ts

import {
  BoatCargoSlotDefinition,
  BoatTypeId,
  CargoClass,
  ClimateId,
  ContractTemplateId,
  CropId,
  FishBehavior,
  FishBehaviorProfileId,
  FishSpeciesId,
  ItemCategory,
  EquipmentId,
  EquipmentSlot,
  ItemId,
  ItemStack,
  MarketId,
  RecipeId,
  RecipeResult,
  RegionId,
  RodClass,
  SeasonId,
  SkillId,
  StationType,
  TimeWindowId,
  WeatherTag,
  WorkActionId,
  ProcessingPresentationKind,
  ProcessingWorkTier
} from "../simulation/core/types";
import type { FishingEcologyId } from "../world/WorldIslands";

export interface ItemDefinition {
  id: ItemId;
  name: string;
  category: ItemCategory;
  description: string;
  stackLimit: number;
  baseValue: number;
  icon?: string;
  tags?: string[];
}

export interface CropDefinition {
  id: CropId;
  name: string;
  seedItemId: ItemId;
  harvestItemId: ItemId;
  footprint: { width: number; depth: number }; // meters
  baseGrowthMinutes: number;
  preferredClimates: ClimateId[];
  /** Climates that grow at 1.00 (not 0.80 poor). Starter farms are temperate. */
  neutralClimates?: ClimateId[];
  baseYield: { min: number; max: number };
  waterNeed: number; // 0..100 moisture consumption rate
  fertilityCost: number; // soil fertility reduction on harvest
  regrows: boolean;
  regrowMinutes?: number;
  minimumFarmingXp: number;
  tags: string[];
}

export interface FishBehaviorProfile {
  id: FishBehaviorProfileId;
  baseStamina: number;
  behaviorWeights: Record<FishBehavior, number>;
  minBehaviorDurationSeconds: number;
  maxBehaviorDurationSeconds: number;
  burstStrength: number; // line tension increase during burst
  directionalForce: number; // pull strength
  tensionSensitivity: number; // how quickly tension rises when reeling against fish
  escapeSlackSeconds: number; // time fish can be at slack tension before escaping
  shakeHz?: number; // head-shake oscillation frequency, Hz (default 2.7)
  shakeAmplitude?: number; // peak head-shake amplitude, 0..1 (default 0.55)
  /** Normalized body inertia. Heavy fish commit longer and answer the rod more slowly. */
  inertia?: number;
  /** Relative turn authority used by the continuous encounter, 0.5..1.6. */
  turnRate?: number;
  /** Species-authored depth reached during a committed dive. */
  diveDepthMeters?: number;
  /** Height the body can clear above the surface during a surface drive. */
  surfaceLeapMeters?: number;
  /** Readable anticipation and recovery windows around each committed behavior. */
  tellSeconds?: number;
  recoverySeconds?: number;
  /** How effectively a lifted rod resists outward fish drive. */
  pumpResistance?: number;
}

export type MinigameFishBehavior = "mixed" | "smooth" | "sinker" | "floater" | "dart";

export interface FishSpeciesDefinition {
  id: FishSpeciesId;
  ecologyIds: FishingEcologyId[];
  name: string;
  habitats: string[]; // e.g. "river", "lake", "coast", "offshore"
  seasons: SeasonId[];
  timeWindows: TimeWindowId[];
  weatherPreferences: WeatherTag[];
  weightKg: { min: number; average: number; max: number };
  baseMarketValue: number;
  rarityWeight: number;
  behaviorProfileId: FishBehaviorProfileId;
  minimumRodClass: RodClass;
  cargoClass: CargoClass;
  baseDecayRatePerMinute: number; // Freshness loss per minute
  isSportFish: boolean;
  minigameBehavior?: MinigameFishBehavior;
  minigameDifficulty?: number; // 15-95
  tags: string[];
}

export interface RecipeDefinition {
  id: RecipeId;
  name: string;
  stationType: StationType;
  inputs: ItemStack[];
  result: RecipeResult;
  durationMinutes: number;
  workTier: ProcessingWorkTier;
  presentationKind: ProcessingPresentationKind;
  minimumSkill?: { skill: SkillId; xp: number };
  tags: string[];
}

export type EquipmentEffectDefinition =
  | { kind: "work-multiplier"; actions: WorkActionId[]; multiplier: number }
  | { kind: "crop-quality-chance"; multiplier: number }
  | { kind: "crop-reach"; actions: Array<"water" | "harvest" | "inspect">; bonusMeters: number }
  | { kind: "annual-plant-matter-bonus"; quantity: number }
  | { kind: "sport-line-damage-multiplier"; multiplier: number }
  | { kind: "sport-brace-extra-multiplier"; multiplier: number };

export interface EquipmentDefinition {
  id: EquipmentId;
  name: string;
  description: string;
  slot: EquipmentSlot;
  starter: boolean;
  effects: EquipmentEffectDefinition[];
  presentation: {
    assetId?: string;
    /**
     * Starter clothing baked into char_player_a can share a skinned mesh with
     * the body. These exact LOD roots and material regions are cloned per
     * character instance before their visibility is changed.
     */
    characterBaseLayer?: {
      nodeNames: string[];
      materialNames: string[];
    };
    socket?: "head" | "body" | "feet" | "tool";
    scale?: number;
  };
  icon: string;
}

export interface BoatDefinition {
  id: BoatTypeId;
  name: string;
  description: string;
  maxSpeed: number; // m/s
  acceleration: number;
  turningRate: number; // rad/s
  fuelCapacity: number;
  durabilityMax: number;
  fishCargoSlots: BoatCargoSlotDefinition[];
  supplySlotCount: number;
  safeSeaRoughness: number; // max roughness before handling penalty
  costMoney: number;
  requiredSkillXp?: { skill: SkillId; xp: number };
}

export interface MarketCommodityDefinition {
  itemId: string; // item or species ID
  basePrice: number;
  targetSupply: number;
  consumptionRatePerHour: number;
  seasonalFactors: Partial<Record<SeasonId, number>>;
}

export interface MarketDefinition {
  id: MarketId;
  name: string;
  regionId: RegionId;
  description: string;
  interactionPosition: { x: number; z: number; radiusMeters: number };
  commodities: MarketCommodityDefinition[];
  retail: {
    itemIds: ItemId[];
    /** Raw inputs sold on a narrow workshop spread; must also appear in itemIds. */
    workshopSupplyItemIds?: ItemId[];
    seedCropIds?: CropId[];
    rodIds?: string[];
  };
}

export interface RodDefinition {
  id: string;
  name: string;
  /** Catalog-driven world and character-preview presentation. */
  assetId: string;
  rodClass: RodClass;
  reelPower: number;
  maxSafeTension: number;
  controlResponsiveness: number;
  hookReliability: number;
  allowedHabitats: string[];
  maximumCargoClass: CargoClass;
  costMoney: number;
}

export interface ProficiencyRankDefinition {
  rankIndex: number;
  rankName: string;
  xpRequired: number;
  farmingUnlocks: string[];
  fishingUnlocks: string[];
  tradingUnlocks: string[];
  processingUnlocks: string[];
}

export interface ContractTemplateDefinition {
  id: ContractTemplateId;
  type: "produce" | "fresh-fish" | "quality-target" | "bulk-order";
  requesterName: string;
  deliveryMarketId: MarketId;
  itemOrSpeciesPool: string[];
  quantityRange: [number, number];
  minQuality?: string;
  minFreshness?: number;
  minWeightKgRange?: [number, number];
  durationMinutes: number;
  rewardBaseMultiplier: number;
  rewardSkill: SkillId;
  requiredXp?: number;
  /**
   * Story-facing kinds of order a quest can ask for as `tag:<tag>`, for a trait
   * no single type captures (an order whose goods cross the channel).
   */
  tags?: readonly string[];
}

export type { NpcDefinition } from "./npcs";
export type { QuestDefinition, QuestObjectiveDefinition, QuestRewardDefinition } from "../simulation/core/QuestTypes";
