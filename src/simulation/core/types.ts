import type { QuestState } from "./QuestTypes";
import type { FishingEcologyId } from "../../world/WorldIslands";

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
export type WeatherTag = "clear" | "cloudy" | "light-rain" | "heavy-rain" | "windy" | "fog" | "storm" | "drought";
export type StationType = "hand-mill" | "workbench" | "fish-table" | "compost-bin" | "kitchen";
export type StructureId = string;
export type SkillId = "farming" | "fishing" | "processing" | "trading";
export type RodClass = "willow" | "river" | "heavy-sport" | "offshore" | "master";
export type RodId = string;
export type EquipmentId = string;
export type EquipmentSlot = "head" | "outerwear" | "feet" | "watering-tool" | "harvest-tool";
export type ClothingSlot = Extract<EquipmentSlot, "head" | "outerwear" | "feet">;
export type EquipmentPresetId = "field" | "sea";
export type WorkActionId =
  | "farming.plant"
  | "farming.water"
  | "farming.harvest"
  | "farming.unroot"
  | "farming.fertilize"
  | "farming.irrigate"
  | "fishing.basic-cast"
  | "fishing.sport-hook"
  | "processing.start";
export type FishBehaviorProfileId = string;
export type ContractTemplateId = string;
export type ContractId = string;
export type BoatUpgradeId = string;
export type NpcId = string;
export type MountId = string;
export type MountTypeId = "mount.donkey" | "mount.horse_carriage";


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
  | "mounted"
  | "menu"
  | "paused";

export type GameAction =
  | "move-forward"
  | "move-backward"
  | "move-left"
  | "move-right"
  | "interact"
  | "interact-release"
  | "use-primary"
  | "use-primary-release"
  | "use-secondary"
  | "open-inventory"
  | "open-character"
  | "open-map"
  | "open-journal"
  | "open-ledger"
  | "open-planning"
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
  | "fish-right"
  | "fishing.toggle-lure";

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
  ownedRodIds: RodId[];
  equipment: PlayerEquipmentState;
  preparedLureItemId: ItemId | null;
  /** Drag notch: 0 light (forgiving), 1 balanced, 2 heavy (decisive). */
  dragNotch: 0 | 1 | 2;
  carriedFishCargoId?: FishCargoId | null;
  activeBoatId?: BoatId | null;
  activeMountId: MountId | null;
  money: number;
  traversal: PlayerTraversalState;
  workCapacity: WorkCapacityState;
  proficiencies: Record<SkillId, number>; // XP
}

export interface PlayerEquipmentState {
  /** Permanent, unique wardrobe entries. Equipment is never stored in satchel slots. */
  ownedIds: EquipmentId[];
  equipped: Record<EquipmentSlot, EquipmentId>;
  /** Clothing-only presets. Tools and rods are deliberately excluded. */
  presets: Record<EquipmentPresetId, Record<ClothingSlot, EquipmentId>>;
  wardrobeCapacity: number;
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
  /**
   * Work earned today from meals, labor shifts and skill rebates. Rest and
   * offline wake are deliberately excluded so a full night cannot be banked
   * twice. Reset whenever the calendar day changes.
   */
  earnedToday?: number;
  /** Calendar-day index `earnedToday`, `mealsToday` and `laborUsedToday` belong to. */
  earningsDay?: number;
  /** Meals eaten today. Caps how much a player can eat in one day. */
  mealsToday?: number;
  /** Labor-shift station ids already worked for Work today. */
  laborUsedToday?: string[];
  /**
   * Real seconds accrued toward the next slow idle trickle. Passive recovery is
   * measured in real time, not game minutes, and resets when the pool is full.
   */
  passiveRegenSeconds?: number;
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
  /**
   * Harvest grade for one produce lot. Stacks merge only when item and grade
   * match, so a satchel can hold Common and Prize wheat side by side. Absent
   * means an ungraded commodity: processed output, market stock, seeds and
   * every legacy stack.
   */
  quality?: CropQuality;
}

export interface InventoryState {
  id: InventoryId;
  slotCount: number;
  slots: InventorySlot[];
}

export interface ItemStack {
  itemId: ItemId;
  quantity: number;
  /** Optional harvest grade; see `InventorySlot.quality`. */
  quality?: CropQuality;
}

export type ProcessingWorkTier = "standard" | "masterwork";
export type ProcessingPresentationKind = "existing" | "tailoring" | "toolmaking";
export type RecipeResult =
  | { kind: "items"; stacks: ItemStack[] }
  | { kind: "equipment"; equipmentId: EquipmentId };

export interface ProcessingJobState {
  id: ProcessingJobId;
  recipeId: RecipeId;
  stationId: StructureId;
  startedAtMinute: GameMinute;
  completesAtMinute: GameMinute;
  status: "active" | "complete";
  /** Immutable economic and presentation snapshot taken when the job commits. */
  recipeName: string;
  outputLabel: string;
  result: RecipeResult;
  workTier: ProcessingWorkTier;
  presentationKind: ProcessingPresentationKind;
  baseWork: number;
  chargedWork: number;
  xpReward: number;
  effectiveDurationMinutes: number;
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

export interface MountState {
  id: MountId;
  mountTypeId: MountTypeId;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  /**
   * The mount's own burst budget. A mount that spent the rider's stamina made
   * riding strictly worse than running; the gallop is the animal's effort, so
   * it draws on the animal's reserve.
   */
  gallopStamina: number;
  gallopRecoveryDelaySeconds: number;
  gallopExhausted: boolean;
  /** Present only on the horse carriage; one physical pack per slot. */
  fishCargoSlotIds?: Array<FishCargoId | null>;
}

export interface FishSchoolState {
  id: FishSchoolId;
  ecologyId: FishingEcologyId;
  habitatId: string;
  x: number;
  z: number;
  radius: number;
  spawnedAtMinute: GameMinute;
  expiresAtMinute: GameMinute;
  feedingFrenzyUntilMinute?: GameMinute;
  /** Deep-chum scent holds separately from the frenzy: sinker species bite truer while it lasts. */
  deepChumUntilMinute?: GameMinute;
  remainingCatchPotential: number;
  speciesWeights: Array<{ speciesId: FishSpeciesId; weight: number }>;
}

export interface FishInstance {
  instanceId: string;
  speciesId: FishSpeciesId;
  ecologyId?: FishingEcologyId;
  /** Habitat it was hooked/caught in, recorded on the journal entry. */
  habitatId?: string;
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

export interface FishingDynamicsState {
  originX: number;
  originZ: number;
  bearingRadians: number;
  headingRadians: number;
  radialVelocity: number;
  angularVelocity: number;
  depthMeters: number;
  verticalVelocity: number;
  lineLengthMeters: number;
  rodDirection: number;
  effort: number;
  retrievalMetersPerSecond: number;
  payoutMetersPerSecond: number;
  behaviorDurationSeconds: number;
  surfaceCrossings: number;
  stepRemainderSeconds: number;
  rngState: number;
  /** Rod-blank spring load, 0..1.25. Pumping can store reserve above live tension for the wind-down. */
  rodLoad: number;
  /** Fish forward speed along its heading, m/s (signed by run direction). */
  fishSpeed: number;
  /** Persistent head-shake oscillator phase, radians. */
  shakePhase: number;
  /** Current head-shake amplitude, 0..1 — drives integrity damage, rod jitter and camera trauma. */
  shakeAmplitude: number;
  /** Accumulated time the fight has held the landing window, seconds. */
  landReadySeconds: number;
}

export interface FishingEncounterState {
  fish: FishInstance;
  /** The school that owns this encounter, so a deferred landing survives reload. */
  schoolId?: FishSchoolId | null;
  rodId: RodId;
  tackleSnapshot: {
    lureItemId: ItemId | null;
  };
  seaConditionSnapshot: {
    weatherType: WeatherTag;
    seaRoughness: number;
  };
  /** Clothing effects are frozen when the fish is hooked and survive reload. */
  equipmentEffects: {
    lineIntegrityDamageMultiplier: number;
    braceResistanceMultiplier: number;
  };
  stamina: number;
  maxStamina: number;
  distanceMeters: number;
  lineTension: number; // 0..100
  lineIntegrity: number; // 0..100
  fishDirection: number; // continuous relative pull, -1..1
  /** Required in schema v19 saves; optional for legacy in-memory callers. */
  dynamics?: FishingDynamicsState;
  behavior: FishBehavior;
  behaviorUntilSeconds: number;
  elapsedSeconds: number;
  rodDirectionAngle: number;
  isReeling: boolean;
  isSlacking: boolean;
  isBracing: boolean;
  /** Drag notch snapshot at hook time (0 light, 1 balanced, 2 heavy); adjustable mid-fight. */
  dragNotch?: 0 | 1 | 2;
  /**
   * Work the hook actually charged, after the proficiency discount in force at
   * that moment. The lost-fight refund pays a share of *this* rather than
   * re-deriving the cost later, which drifted whenever the fight crossed a
   * discount tier. Optional for legacy in-memory and pre-v33 saved fights.
   */
  workCharged?: number;
  slackTimerSeconds: number;
  snapTimerSeconds: number;
  /**
   * The fight is won (`result: "landed"`) and the encounter waits for the
   * angler's keep/release choice. Persisted so a reload resumes the same
   * decision instead of silently stowing or losing the catch.
   */
  awaitingLandingChoice?: boolean;
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

/** @deprecated Alias of FishQuality. Silver/Gold/Iridium are UI atlas skins only. */
export type FishCatchQuality = FishQuality;

export interface BasicFishingState {
  ecologyId: FishingEcologyId;
  habitatId: string;
  phase: BasicFishingPhase;
  remainingSeconds: number;
  catchItemId?: ItemId;
  willCatch: boolean;

  // Cast mechanics
  castPower?: number; // 0.0 .. 1.0
  castDistanceMeters?: number; // 3 .. 12, scaled by any tail/head wind
  /** Metres the wind set the cast down to the caster's right; may be negative. */
  castLateralDriftMeters?: number;
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

  /**
   * Leftover real seconds carried between ticks for the fixed 60 Hz
   * charging/minigame integration. Persisted so a reload mid-fight resumes on
   * the same step boundary; the RNG draw count stays a function of simulated
   * time rather than of render frame partitioning.
   */
  minigameStepRemainderSeconds?: number;
}

export type CarryLocationType = "player" | "boat-hold" | "boat-hook" | "carriage" | "cold-storage" | "crate";

export interface CargoLocation {
  type: CarryLocationType;
  containerId: string;
  slotIndex?: number;
}

/** Authored storage facility kinds; barn and warehouse are reserved for later stages. */
export type StorageKind = "crate" | "barn" | "warehouse" | "cold-storage";

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
  deliveryMarketId: MarketId;
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
  /** Habitats this species was actually landed in, for the habitat sweep. */
  habitats?: string[];
}

export interface JournalState {
  fishRecords: Record<FishSpeciesId, JournalRecord>;
  cropRecords: Record<CropId, { harvestedCount: number; bestQuality?: CropQuality }>;
  unlockedKnowledge: string[];
}

/** Bounded per-habitat fishing pressure: when a school last ended and how long to rest. */
export interface FishingPressureState {
  ecologyId: FishingEcologyId;
  habitatId: string;
  lastEndedMinute: GameMinute;
  cooldownUntilMinute: GameMinute;
  recentCatchCount: number;
}

export interface WorldState {
  layoutRevision: number;
  currentSeed: number;
  activeSchools: Record<FishSchoolId, FishSchoolState>;
  fishingPressureByHabitat: Record<string, FishingPressureState>;
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
  mounts: Record<MountId, MountState>;
  fishCargo: Record<FishCargoId, FishCargoState>;
  weather: WeatherState;
  markets: Record<MarketId, MarketState>;
  contracts: ContractState[];
  journal: JournalState;
  quests: QuestState;
  metadata: GameMetadata;
}

export * from "./QuestTypes";
