import type { QuestState } from "./QuestTypes";

export type CropId = string;
export type FishSpeciesId = string;
export type ItemId = string;
export type RecipeId = string;
export type BoatTypeId = string;
export type BoatId = string;
export type FarmId = string;
export type PlacedCropId = string;
export type InventoryId = string;
export type ProcessingJobId = string;
export type FishSchoolId = string;
export type FishCargoId = string;
export type MarketId = string;
export type RegionId = string;
export type ClimateId = "temperate" | "warm" | "cool" | "arid" | "subarctic";
export type SeasonId = "spring" | "summer" | "autumn" | "winter";
export type TimeWindowId = "dawn" | "day" | "dusk" | "night";
export type WeatherTag = "clear" | "cloudy" | "light-rain" | "heavy-rain" | "windy" | "fog" | "storm";
export type StationType = "hand-mill" | "workbench" | "fish-table" | "compost-bin";
export type StructureId = string;
export type SkillId = "farming" | "fishing" | "processing" | "trading";
export type RodClass = "willow" | "river" | "heavy-sport" | "offshore" | "master";
export type RodId = string;
export type FishBehaviorProfileId = string;
export type ContractTemplateId = string;
export type ContractId = string;
export type BoatUpgradeId = string;
export type NpcId = string;


export type GameMinute = number; // integer simulation minutes

export type ItemCategory =
  | "seed"
  | "produce"
  | "grain"
  | "bait"
  | "fishing-supply"
  | "crafting-material"
  | "tool"
  | "fuel"
  | "ice"
  | "fertilizer"
  | "processed-food"
  | "misc";

export type CropStage = "seeded" | "sprout" | "growing" | "mature" | "overripe" | "withered";

export type CropQuality = "common" | "fine" | "exceptional" | "prize";
export type FishQuality = "common" | "fine" | "exceptional" | "trophy";
export type CargoClass = "small" | "medium" | "large" | "gargantuan";

export type GameMode =
  | "on-foot"
  | "farm-placement"
  | "basic-fishing"
  | "sport-fishing"
  | "boat-driving"
  | "menu"
  | "paused";

export type GameAction =
  | "move-forward"
  | "move-backward"
  | "move-left"
  | "move-right"
  | "interact"
  | "use-primary"
  | "use-secondary"
  | "open-inventory"
  | "open-map"
  | "open-journal"
  | "open-ledger"
  | "open-planning"
  | "toggle-farm-gis"
  | "select-tool-1"
  | "select-tool-2"
  | "select-tool-3"
  | "select-tool-4"
  | "select-tool-5"
  | "pause"
  | "fish-reel"
  | "fish-slack"
  | "fish-brace"
  | "fish-left"
  | "fish-right";

export interface ClockState {
  currentMinute: GameMinute;
  minutesPerRealSecond: number;
  dayCount: number;
  season: SeasonId;
  year: number;
  timeOfDay: TimeWindowId;
  isPaused: boolean;
}

export interface PlayerState {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  currentRegionId: RegionId;
  inventoryId: InventoryId;
  equippedRodId: RodId;
  carriedFishCargoId?: FishCargoId | null;
  activeBoatId?: BoatId | null;
  money: number;
  traversal: PlayerTraversalState;
  workCapacity: WorkCapacityState;
  proficiencies: Record<SkillId, number>; // XP
}

/** Canonical traversal state. Work Capacity remains an unrelated economy resource. */
export interface PlayerTraversalState {
  sprintStamina: number;
  sprintRecoveryDelaySeconds: number;
  sprintExhausted: boolean;
  isGrounded: boolean;
}

export interface WorkCapacityState {
  current: number;
  maximum: number;
  regeneratedAtMinute: GameMinute;
}

export interface SoilState {
  fertility: number; // 0..100
  moistureRetention: number; // 0..1
}

export interface FarmState {
  id: FarmId;
  regionId: RegionId;
  widthMeters: number;
  depthMeters: number;
  climateId: ClimateId;
  soil: SoilState;
  placedCropIds: PlacedCropId[];
  placedStructureIds: StructureId[];
  leaseCost: number;
  leaseDueMinute: GameMinute;
  accessType: "public" | "private";
}

export interface CropQualityInputs {
  climateMatchScore: number;
  averageMoisture: number;
  soilFertility: number;
  farmingProficiency: number;
  rngRoll: number;
  rareChanceMultiplier?: number;
}

export interface PlacedCropState {
  id: PlacedCropId;
  cropId: CropId;
  farmId: FarmId;
  x: number;
  z: number;
  rotationRadians: number;
  plantedAtMinute: GameMinute;
  lastUpdatedMinute: GameMinute;
  effectiveGrowthMinutes: number;
  moisture: number; // 0..100
  health: number; // 0..100
  stage: CropStage;
  averageMoistureAccum: number;
  moistureSampleCount: number;
  qualityInputsAccum?: CropQualityInputs;
}

export interface InventorySlot {
  itemId?: ItemId;
  quantity?: number;
}

export interface InventoryState {
  id: InventoryId;
  slotCount: number;
  slots: InventorySlot[];
}

export interface ItemStack {
  itemId: ItemId;
  quantity: number;
}

export interface ProcessingJobState {
  id: ProcessingJobId;
  recipeId: RecipeId;
  stationId: StructureId;
  startedAtMinute: GameMinute;
  completesAtMinute: GameMinute;
  status: "active" | "complete" | "collected";
}

export interface BoatCargoSlotDefinition {
  slotIndex: number;
  type: "hold" | "external-hook";
  maxCargoClass: CargoClass;
  hasIce: boolean;
}

export interface BoatState {
  id: BoatId;
  boatTypeId: BoatTypeId;
  x: number;
  y: number;
  z: number;
  headingRadians: number;
  speed: number;
  fuel: number;
  durability: number;
  fishCargoSlotIds: Array<FishCargoId | null>;
  supplyInventoryId: InventoryId;
  upgrades: BoatUpgradeId[];
  isDocked: boolean;
  dockedMarketId: MarketId | null;
}

export interface FishSchoolState {
  id: FishSchoolId;
  habitatId: string;
  x: number;
  z: number;
  radius: number;
  spawnedAtMinute: GameMinute;
  expiresAtMinute: GameMinute;
  feedingFrenzyUntilMinute?: GameMinute;
  remainingCatchPotential: number;
  speciesWeights: Array<{ speciesId: FishSpeciesId; weight: number }>;
}

export interface FishInstance {
  instanceId: string;
  speciesId: FishSpeciesId;
  weightKg: number;
  quality: FishQuality;
  caughtAtMinute?: GameMinute;
}

export type FishBehavior =
  | "rest"
  | "run-left"
  | "run-right"
  | "dive"
  | "surface"
  | "burst"
  | "shake";

export interface FishingEncounterState {
  fish: FishInstance;
  /** The school that owns this encounter, so a deferred landing survives reload. */
  schoolId?: FishSchoolId | null;
  rodId: RodId;
  stamina: number;
  maxStamina: number;
  distanceMeters: number;
  lineTension: number; // 0..100
  lineIntegrity: number; // 0..100
  fishDirection: number; // radians or relative
  behavior: FishBehavior;
  behaviorUntilSeconds: number;
  elapsedSeconds: number;
  rodDirectionAngle: number;
  isReeling: boolean;
  isSlacking: boolean;
  isBracing: boolean;
  slackTimerSeconds: number;
  snapTimerSeconds: number;
  result: "active" | "landed" | "escaped" | "line-snapped";
}

export type BasicFishingPhase =
  | "charging-cast"
  | "waiting-bite"
  | "bite-reaction"
  | "minigame"
  | "caught"
  | "escaped"
  | "casting"
  | "waiting"
  | "bite";

export type FishCatchQuality = "normal" | "silver" | "gold" | "iridium";

export interface BasicFishingState {
  habitatId: string;
  phase: BasicFishingPhase;
  remainingSeconds: number;
  catchItemId?: ItemId;
  willCatch: boolean;

  // Cast mechanics
  castPower?: number; // 0.0 .. 1.0
  castDistanceMeters?: number; // 3 .. 12
  isChargingCast?: boolean;
  castChargeDirection?: 1 | -1;

  // Bite reaction
  biteReactionWindowSeconds?: number;
  hasBait?: boolean;

  // Stardew Minigame variables (0.0 to 1.0 normalized)
  fishY?: number; // 0.0 (bottom) to 1.0 (top)
  fishVy?: number;
  fishTargetY?: number;
  fishTargetTimer?: number;

  barY?: number; // bottom of green bar (0.0 to 1.0 - barHeight)
  barVy?: number;
  barHeight?: number; // 0.15 .. 0.40

  catchProgress?: number; // 0.0 .. 1.0 (starts at 0.30)
  isPerfect?: boolean;

  // Treasure Chest mechanics
  hasTreasure?: boolean;
  treasureY?: number;
  treasureProgress?: number; // 0.0 .. 1.0
  treasureCaught?: boolean;
  treasureLootItemIds?: ItemId[];

  // Output quality & input state
  quality?: FishCatchQuality;
  isHolding?: boolean;
  result?: "landed" | "escaped";
}

export type CarryLocationType = "player" | "boat-hold" | "boat-hook" | "cold-storage" | "crate";

export interface CargoLocation {
  type: CarryLocationType;
  containerId: string;
  slotIndex?: number;
}

export interface FishCargoState {
  id: FishCargoId;
  speciesId: FishSpeciesId;
  weightKg: number;
  quality: FishQuality;
  caughtAtMinute: GameMinute;
  freshness: number; // 0..100
  cargoClass: CargoClass;
  location: CargoLocation;
}

export interface WeatherState {
  type: WeatherTag;
  windDirectionDeg: number;
  windSpeed: number; // m/s
  precipitation: number; // 0..1
  cloudCover: number; // 0..1
  seaRoughness: number; // 0..1
  visibility: number; // 0..1
  temperatureC: number;
  nextWeatherMinute: GameMinute;
  nextWeatherType: WeatherTag;
}

export interface MarketCommodityState {
  itemId: ItemId; // item or fish species machine ID
  basePrice: number;
  demandIndex: number; // e.g. 1.0 (clamped 0.65..1.60)
  localSupply: number;
  targetSupply: number;
  consumptionRate: number;
  seasonalModifier: number;
  lastTickMinute: GameMinute;
  recentSalesVolume: number;
}

export interface MarketState {
  id: MarketId;
  name: string;
  regionId: RegionId;
  commodities: Record<string, MarketCommodityState>;
}

export interface ContractState {
  id: ContractId;
  templateId: ContractTemplateId;
  requesterId: string;
  type: "produce" | "fresh-fish" | "quality-target" | "bulk-order";
  targetItemIdOrSpecies: string;
  quantityRequired: number;
  quantityFulfilled: number;
  minQuality?: string;
  minFreshness?: number;
  minWeightKg?: number;
  rewardMoney: number;
  rewardSkillXp: { skill: SkillId; xp: number };
  expiresAtMinute: GameMinute;
  status: "active" | "completed" | "expired" | "failed";
}

export interface JournalRecord {
  discovered: boolean;
  largestWeightKg?: number;
  bestQuality?: FishQuality;
  catchCount: number;
  firstCaughtMinute?: GameMinute;
}

export interface JournalState {
  fishRecords: Record<FishSpeciesId, JournalRecord>;
  cropRecords: Record<CropId, { harvestedCount: number; bestQuality?: CropQuality }>;
  unlockedKnowledge: string[];
}

export interface WorldState {
  layoutRevision: number;
  currentSeed: number;
  activeSchools: Record<FishSchoolId, FishSchoolState>;
  structures: Record<StructureId, {
    id: StructureId;
    type: StationType;
    x: number;
    y: number;
    z: number;
    rotationY?: number;
  }>;
  lastSchoolSpawnMinute?: GameMinute;
  storySchoolSpawned: boolean;
}

export interface GameMetadata {
  createdAtUtcMs: number;
  lastSavedUtcMs: number;
  totalPlayMinutes: number;
  gameVersion: string;
  rngState?: number;
}

export interface GameState {
  schemaVersion: number;
  worldSeed: number;
  clock: ClockState;
  player: PlayerState;
  world: WorldState;
  farms: Record<FarmId, FarmState>;
  crops: Record<PlacedCropId, PlacedCropState>;
  inventories: Record<InventoryId, InventoryState>;
  processingJobs: Record<ProcessingJobId, ProcessingJobState>;
  basicFishing: BasicFishingState | null;
  sportFishing: FishingEncounterState | null;
  boats: Record<BoatId, BoatState>;
  fishCargo: Record<FishCargoId, FishCargoState>;
  weather: WeatherState;
  markets: Record<MarketId, MarketState>;
  contracts: ContractState[];
  journal: JournalState;
  quests: QuestState;
  metadata: GameMetadata;
}

export * from "./QuestTypes";
