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
  ItemId,
  ItemStack,
  MarketId,
  RecipeId,
  RegionId,
  RodClass,
  SeasonId,
  SkillId,
  StationType,
  TimeWindowId,
  WeatherTag
} from "../simulation/core/types";

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
  outputs: ItemStack[];
  durationMinutes: number;
  minimumSkill?: { skill: SkillId; xp: number };
  tags: string[];
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
}

export interface RodDefinition {
  id: string;
  name: string;
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
  itemOrSpeciesPool: string[];
  quantityRange: [number, number];
  minQuality?: string;
  minFreshness?: number;
  minWeightKgRange?: [number, number];
  durationMinutes: number;
  rewardBaseMultiplier: number;
  rewardSkill: SkillId;
  requiredXp?: number;
}

export type { NpcDefinition } from "./npcs";
export type { QuestDefinition, QuestObjectiveDefinition, QuestRewardDefinition } from "../simulation/core/QuestTypes";
