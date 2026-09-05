import type { ResolvedPhysicsFrame } from "./PhysicsAdapter";
import type { QuestTrackId } from "./QuestTypes";
import type { RecordTier } from "../../content/records";
import type {
  BoatId,
  BasicFishingPhase,
  CargoClass,
  ClimateId,
  CropId,
  CropQuality,
  CropStage,
  FarmId,
  FishCargoId,
  FishQuality,
  FishSchoolId,
  FishSpeciesId,
  FishingEncounterState,
  ItemId,
  MarketId,
  MountId,
  PlacedCropId,
  ProcessingJobId,
  RecipeId,
  RodId,
  SkillId,
  TimeWindowId,
  WeatherTag
} from "./types";

export interface WorkCostQuote {
  baseCost: number;
  cost: number;
  availableWork: number;
  affordable: boolean;
  shortage: number;
  readyAtMinute: number | null;
}

export interface InteractionResult {
  success: boolean;
  reason?: string;
  reasonCode?: string;
  yield?: number;
  quality?: FishQuality | CropQuality;
  placedCropId?: PlacedCropId;
  cost?: number;
  encounter?: FishingEncounterState;
  scraps?: number;
  revenue?: number;
  quantity?: number;
  delivered?: number;
  completed?: boolean;
  rewardMoney?: number;
  xpGained?: number;
  requiredWork?: number;
  availableWork?: number;
  readyAtMinute?: number | null;
}

export interface CommodityQuote {
  success: boolean;
  itemId: ItemId;
  intent: "buy" | "sell";
  unitPrice?: number;
  totalPrice?: number;
  demandPercent?: number;
  demandLabel?: "Wanted" | "Steady" | "Plentiful";
  available?: number;
  owned?: number;
  affordable?: boolean;
  bulkProduce?: boolean;
  reason?: string;
}

export interface BulkSaleQuote {
  success: boolean;
  quantity: number;
  lineCount: number;
  revenue: number;
  reason?: string;
}

export interface MarketDemandSignal {
  success: boolean;
  marketId: MarketId;
  itemId?: ItemId;
  itemName?: string;
  demandLabel?: "Wanted" | "Steady" | "Plentiful";
  reason?: string;
}

export interface MarketBuyRowDto {
  itemId: ItemId;
  name: string;
  description: string;
  kind: "seed" | "supply";
  owned: number;
  locked: boolean;
  disabled: boolean;
  blockerReason?: string;
  quote: CommodityQuote;
}

export interface MarketSellRowDto {
  itemId: ItemId;
  name: string;
  owned: number;
  quote: CommodityQuote;
}

export interface MarketFishRowDto {
  cargoId: FishCargoId;
  speciesId: string;
  name: string;
  weightKg: number;
  quality: FishQuality;
  freshness: number;
  spoiled: boolean;
  breakdown?: import("../economy/calculateFishValue").FishPriceBreakdown;
  reason?: string;
}

export interface MarketRodRowDto {
  rodId: RodId;
  name: string;
  allowedHabitats: readonly string[];
  maximumCargoClass: string;
  costMoney: number;
  owned: boolean;
  equipped: boolean;
  starter: boolean;
  equippable: boolean;
  purchasable: boolean;
  blockerReason?: string;
}

export interface MarketContractRowDto {
  contractId: string;
  targetId: string;
  targetName: string;
  rewardMoney: number;
  quantityFulfilled: number;
  quantityRequired: number;
  remaining: number;
  itemId?: ItemId;
  ownedItems: number;
  deliverableItems: number;
  eligibleCargoIds: FishCargoId[];
  ready: boolean;
  blockerReasons: string[];
}

export interface MarketBoardDto {
  marketId: MarketId;
  name: string;
  money: number;
  /** Day count inside the current season; drives rotating shopkeep flavor only. */
  dayInSeason: number;
  buyRows: MarketBuyRowDto[];
  sellRows: MarketSellRowDto[];
  fishRows: MarketFishRowDto[];
  rodRows: MarketRodRowDto[];
  contractRows: MarketContractRowDto[];
  bulkProduce: BulkSaleQuote;
  bulkFish: BulkSaleQuote;
}

export interface FarmForecastDto {
  seasonLabel: string;
  currentTemperatureC: number;
  slots: ReadonlyArray<{
    label: "Now" | "+2h" | "+5h";
    type: WeatherTag;
  }>;
  rainLabel: "Soaking" | "Showers possible" | "Mostly dry";
  windLabel: "Gale" | "Breezy" | "Light";
  seaLabel: "Rough" | "Swell" | "Calm";
}

export interface WorldHudCargoDto {
  cargoId: FishCargoId;
  speciesId: FishSpeciesId;
  name: string;
  weightKg: number;
  quality: FishQuality;
  freshnessPercent: number;
  freshnessTone: "fresh" | "medium" | "stale";
  /** Size band of the physical pack, which sets what carrying it costs. */
  cargoClass: CargoClass;
  /** Movement penalty while this rides on the player's back, as a percentage. */
  carrySpeedPenaltyPercent: number;
}

// --- M2 Trophy Catch & Maritime Hazard DTOs ---

export interface TrophyCatchDto {
  cargoId: FishCargoId;
  speciesId: FishSpeciesId;
  speciesName: string;
  habitats: readonly string[];
  cargoClass: "small" | "medium" | "large" | "gargantuan";
  weightKg: number;
  lengthCm: number;
  quality: FishQuality;
  qualityStars: 1 | 2 | 3 | 4;
  freshnessPercent: number;
  freshnessTone: "fresh" | "medium" | "stale";
  estimatedShelfLifeMinutes: number;
  estimatedMarketValue: number;
  record: "first" | "weight" | "quality" | null;
  storageDestination: "player-carry" | "boat-hold" | "boat-hook" | "cold-storage";
  storageLocationLabel: string;
}

export interface MaritimeHazardDto {
  hazardId: "dense-fog" | "squall" | "storm-waves" | "storm";
  title: string;
  severity: "caution" | "danger";
  conditionLabel: string;
  navigationalAdvisory: string;
  speedPenaltyPercent?: number;
}

// --- M1 Navigation & HUD DTOs ---

export type CompassMarkerKind =
  | "farm"
  | "dock"
  | "market"
  | "landmark"
  | "quest"
  | "fish-school"
  | "water";

/**
 * Semantic icon name. The presentation layer maps these to SVG marks; DTOs
 * never carry a glyph, so the simulation stays free of presentation choices.
 */
export type HudIconId =
  | "pin"
  | "sprout"
  | "anchor"
  | "coin"
  | "landmark"
  | "waves"
  | "fish"
  | "pack"
  | "sparkle"
  | "rain"
  | "sun"
  | "warning"
  | "energy"
  | "moon"
  | "satchel";

export interface CompassMarkerDto {
  id: string;
  type: string;
  kind?: CompassMarkerKind;
  x: number;
  z: number;
  label: string;
  icon: HudIconId;
  distanceMeters: number;
  relativeBearingDeg: number;
  inRange?: boolean;
}

export interface HudContractDto {
  id: string;
  title: string;
  targetName: string;
  targetKind: "item" | "fish";
  current: number;
  target: number;
  unit: string;
  completed: boolean;
  rewardMoney: number;
  deliveryMarketName: string;
  isReadyToTurnIn?: boolean;
}

export interface HudStatusChipDto {
  id: string;
  label: string;
  type: "buff" | "debuff" | "warning";
  description: string;
  icon: HudIconId;
  tone?: "buff" | "debuff" | "neutral";
}

export type ContextualStanceId = "agronomy" | "angling" | "maritime" | "explorer";

export type EquippedToolId = "hands" | "seeds" | "watering-can" | "fertilizer" | "harvest" | "fishing-rod";

export type ContextualHotbarAction =
  | { type: "equip-tool"; tool: EquippedToolId }
  | {
      type: "input";
      action: "open-inventory" | "open-map" | "open-journal" | "open-ledger" | "open-planning" | "fishing.toggle-lure";
    };

export interface ContextualHotbarSlotDto {
  slot: 1 | 2 | 3 | 4 | 5;
  id: string;
  action: ContextualHotbarAction;
  name: string;
  detail: string;
  icon?: string;
  quantity: number | null;
  meter?: {
    current: number;
    maximum: number;
    percent: number;
    label?: string;
    danger?: boolean;
  } | null;
  ready: boolean;
  active?: boolean;
  shortcutKey: string;
}

export interface WorldHudBoatDto {
  boatId: BoatId;
  name: string;
  speedKnots: number;
  isDocked?: boolean;
  seaState: "Calm" | "Swell" | "Rough";
  seaWarning: string | null;
  showNightWarning: boolean;
  hull: { current: number; maximum: number; percent: number; danger: boolean };
  fuel: { current: number; maximum: number; percent: number; danger: boolean } | null;
  occupiedCargoSlots: number;
  cargoSlots: ReadonlyArray<{
    slotNumber: number;
    slotType: "hold" | "external-hook";
    hasIce: boolean;
    cargo: WorldHudCargoDto | null;
  }>;
}

export interface WorldHudDto {
  clock: {
    label: string;
    hour: number;
    seasonLabel: string;
    dayInSeason: number;
    timeOfDayLabel: string;
    timeOfDay: TimeWindowId;
    dialRotation: number;
    isNight: boolean;
  };
  weather: {
    type: WeatherTag;
    temperatureC: number;
    hazard: { text: string; tone: "caution" | "danger" } | null;
  };
  money: number;
  work: {
    current: number;
    maximum: number;
    exhausted: boolean;
    showLowNotice: boolean;
    recharging?: boolean;
  };
  sprint: {
    current: number;
    maximum: number;
    exhausted: boolean;
  } | null;
  hotbar: ReadonlyArray<{
    slot: 1 | 2 | 3 | 4 | 5;
    detail: string;
    quantity: number | null;
    ready: boolean;
  }>;
  equippedRodId: RodId;
  carriedFish: WorldHudCargoDto | null;
  boat: WorldHudBoatDto | null;
  basicFishingPhase: BasicFishingPhase | null;
  expeditionUnlocked: boolean;

  // M1 Additions:
  stance: ContextualStanceId;
  compass: {
    headingDegrees: number;
    headingCardinal: string;
    windDegrees: number;
    subRegionTitle: string;
    nearbyMarkers: ReadonlyArray<CompassMarkerDto>;
  };
  statusEffects: ReadonlyArray<HudStatusChipDto>;
  capacity: {
    satchelUsed: number;
    satchelMax: number;
    cargoUsed: number;
    cargoMax: number;
  };
  activeContracts: ReadonlyArray<HudContractDto>;
  contextualHotbar: ReadonlyArray<ContextualHotbarSlotDto>;
}

export interface HoldStoresDto {
  satchel: { occupiedSlots: number; totalSlots: number };
  vesselHolds: { occupiedSlots: number; totalSlots: number };
  carriedCatch: WorldHudCargoDto | null;
  supplies: ReadonlyArray<{ itemId: ItemId; name: string; count: number }>;
  /**
   * Stackable goods on the player, as transfer rows. Fish cargo is not here:
   * it lives in cargo slots and moves by its own rules.
   */
  satchelStock: ReadonlyArray<{ itemId: ItemId; name: string; count: number }>;
  vessels: ReadonlyArray<{
    boatId: BoatId;
    name: string;
    statusLabel: "Docked" | "At sea";
    hull: { current: number; maximum: number; percent: number };
    occupiedSlots: number;
    cargoSlots: ReadonlyArray<{ slotNumber: number; cargo: WorldHudCargoDto | null }>;
    /** Stackable goods in this vessel's stores, as transfer rows. */
    stock: ReadonlyArray<{ itemId: ItemId; name: string; count: number }>;
  }>;
}

/**
 * A stall's demand outlook for one commodity, sampled from the same pricing
 * function the market charges with. Supply is held at today's stock because
 * tomorrow's stock is unknowable, so this is a projection, not a record — the
 * UI must present it as such.
 */
export interface MarketDemandTrendDto {
  marketId: MarketId;
  itemId: ItemId;
  itemName: string;
  /** One sample per day, dayOffset 0 being today. */
  points: ReadonlyArray<{ dayOffset: number; demandPercent: number }>;
  currentDemandPercent: number;
  /** Where the outlook heads across the sampled window. */
  direction: "rising" | "steady" | "falling";
  localSupply: number;
  targetSupply: number;
}

export interface SatchelDto {
  occupiedSlots: number;
  totalSlots: number;
  slots: ReadonlyArray<{
    index: number;
    itemId: ItemId | null;
    name: string;
    description: string | null;
    categoryLabel: string | null;
    inventoryCategory: "farming" | "fishing" | "supplies" | null;
    quantity: number;
    cropId: CropId | null;
    cropName: string | null;
    isFish: boolean;
  }>;
}

/**
 * Everything the satchel's inspect card shows about one item. Every field is
 * read from content or live state; nothing here is derived for looks. Sections
 * are nullable because most items genuinely have no rarity rank, no agronomy
 * and no spoilage — an absent section is information, not a hole to fill.
 */
export interface ItemInspectionDto {
  itemId: ItemId;
  name: string;
  categoryLabel: string;
  /** Flavour text as authored on the item definition. */
  loreText: string | null;
  stackLimit: number;
  /** Catalogue trade value before any market's local demand is applied. */
  baseValue: number;
  tags: readonly string[];
  /**
   * Only species carry a rank the content actually models (`rarityWeight`:
   * how often the species rolls). Ordinary goods get null rather than a
   * rarity invented from price.
   */
  rarity: {
    tier: "common" | "uncommon" | "rare" | "prized";
    label: string;
    /** Encounter weight the tier came from; lower is rarer. */
    encounterWeight: number;
  } | null;
  /** Growing requirements, for a seed or the produce it yields. */
  agronomy: {
    cropId: CropId;
    cropName: string;
    /** Moisture drawn per growth tick, 0..100. */
    waterNeed: number;
    growthMinutes: number;
    yieldMin: number;
    yieldMax: number;
    regrows: boolean;
    regrowMinutes: number | null;
    /** Soil drawdown taken at harvest. */
    fertilityCost: number;
    preferredClimates: readonly string[];
    neutralClimates: readonly string[];
    minimumFarmingXp: number;
  } | null;
  /**
   * Live spoilage for a catch of this species the player is actually carrying.
   * Null for anything that does not decay or is not in hand.
   */
  freshness: {
    percent: number;
    label: string;
    /** Where it is kept, which sets how fast it drops. */
    storageLabel: string;
    /** Multiplier the storage applies to the decay rate; 1.0 is open carry. */
    decayRate: number;
  } | null;
}

export interface WorldMapDto {
  player: { x: number; z: number };
  /**
   * Fish schools currently working the water. These are live and expire, so the
   * chart shows them as a passing opportunity rather than a fixed landmark.
   */
  activeSchools: ReadonlyArray<{
    schoolId: FishSchoolId;
    x: number;
    z: number;
    radiusMeters: number;
    waterLabel: string;
    /** Minutes of game time before the school breaks up. */
    minutesRemaining: number;
    /** A frenzied school bites far more freely while it lasts. */
    feeding: boolean;
    distanceMeters: number;
  }>;
  fishingNotes: Record<string, {
    waterType: string;
    species: string[];
    record: string | null;
  }>;
  farms: Record<string, {
    fertilityPercent: number;
    climateLabel: string;
    plantedCount: number;
  }>;
}

/** One standing goal on the Records Board, derived from `state.journal`. */
export interface RecordMilestoneDto {
  id: string;
  tier: RecordTier;
  title: string;
  detail: string;
  achieved: boolean;
  /** 0..1, for a progress bar. */
  progress: number;
  currentLabel: string;
}

export interface JournalPagesDto {
  completedStories: ReadonlyArray<{ questId: string; title: string }>;
  fishRecords: ReadonlyArray<{
    speciesId: FishSpeciesId;
    name: string;
    habitatsLabel: string;
    caughtCount: number;
    bestLabel: string;
  }>;
  cropRecords: ReadonlyArray<{
    cropId: CropId;
    name: string;
    harvestedCount: number;
    bestQuality: CropQuality | null;
  }>;
  knowledge: ReadonlyArray<{ id: string; title: string; summary: string }>;
  records: ReadonlyArray<RecordMilestoneDto>;
}

/**
 * The Coastal Almanac: every species and crop the world contains, with what the
 * player has personally recorded of each. Undiscovered entries still list where
 * and when to look — the almanac is a guide to the coast, not only a trophy
 * shelf — but carry no personal record until the player earns one.
 */
export interface AlmanacDto {
  fish: ReadonlyArray<{
    speciesId: FishSpeciesId;
    name: string;
    discovered: boolean;
    habitatsLabel: string;
    seasonsLabel: string;
    /** Dawn / day / dusk / night, when the species runs. */
    timeWindowsLabel: string;
    weightKg: { min: number; average: number; max: number };
    baseMarketValue: number;
    rarityLabel: string;
    /** Lightest rod that can land it. */
    rodClassLabel: string;
    isSportFish: boolean;
    caughtCount: number;
    bestWeightKg: number | null;
  }>;
  crops: ReadonlyArray<{
    cropId: CropId;
    name: string;
    discovered: boolean;
    climatesLabel: string;
    growthMinutes: number;
    waterNeed: number;
    yieldMin: number;
    yieldMax: number;
    regrows: boolean;
    harvestedCount: number;
    bestQuality: CropQuality | null;
  }>;
  discoveredFish: number;
  totalFish: number;
  discoveredCrops: number;
  totalCrops: number;
}

export interface PauseSummaryDto {
  regionLabel: string;
  dateTimeLabel: string;
  work: { current: number; maximum: number };
  lastSavedUtcMs: number;
}

export interface SportFishingHudDto {
  speciesId: FishSpeciesId;
  speciesName: string;
  energyPercent: number;
  rodDirectionAngle: number;
  steeringMagnitude: number;
  showFirstTip: boolean;
  decision: {
    fishAction: string;
    response: string;
    action: "reel" | "slack" | "brace" | "steer-left" | "steer-right" | "neutral";
    key: "W" | "S" | "A" | "D" | "Space" | null;
    icon: "run" | "dive" | "burst" | "shake" | "surface" | "tiring";
    tone: "steady" | "warning" | "danger" | "opportunity";
  };
  tensionPercent: number;
  tensionBands: {
    slackEndPercent: number;
    dangerStartPercent: number;
  };
  tensionTone: "slack" | "safe" | "danger";
  tensionWord: "Loose" | "Good" | "Ease";
  lineIntegrityPercent: number;
  showLineWarning: boolean;
  landingProgress: number | null;
  /**
   * Live fight telemetry, read straight off the encounter's physics state.
   * The angler can already feel all of this through the fight; the readout
   * only makes the numbers the simulation is already integrating legible.
   */
  telemetry: {
    /** Slant range from the rod tip to the fish, in metres. */
    runDistanceMeters: number;
    /** Range at or under which the fish can be landed. */
    landingDistanceMeters: number;
    /** How far the fish is running out, as a share of the longest run seen. */
    runDistancePercent: number;
    /** Fish depth below the surface, in metres. Negative while it breaches. */
    waterDepthMeters: number;
    /** Smoothed rod lay, -100 hard left to +100 hard right. */
    rodDeflectionPercent: number;
    /**
     * How well the rod is opposing the fish's run: +100 is a clean counter,
     * -100 is swinging with the fish and feeding it slack.
     */
    counterSwingPercent: number;
    /** Which way to swing to counter the current run, for the [A]/[D] cue. */
    counterSwingCue: "left" | "right" | null;
  };
  /** Live drag notch: 0 light, 1 balanced, 2 heavy. */
  dragNotch: 0 | 1 | 2;
  /**
   * One-per-fight species signature moment. Pulsed for a few fight seconds
   * when the fish first shows its characteristic behavior, then null.
   * Text only, so it is safe under reduced motion by construction.
   */
  signatureMoment: { id: string; copy: string } | null;
}

/**
 * A read of the water at the angler's feet. Pure query: no RNG, no Work,
 * no mutation. School hints unlock with Fishing rank — conditions and the
 * local species pool are open to everyone.
 */
export interface WaterReadingDto {
  ecologyId: string;
  ecologyName: string;
  habitatId: string;
  habitatName: string;
  season: string;
  timeOfDay: string;
  weather: string;
  /** Sport species names that can run here in these conditions. */
  likelySpeciesNames: string[];
  /** Derived ground familiarity; null until the water knows you back. */
  familiarityLabel: string | null;
  schoolHint: null | {
    /** "nearby" names nothing; "ranged" adds band and water, never a position. */
    level: "nearby" | "ranged";
    distanceBand?: "close by" | "nearby" | "far off";
    habitatName?: string;
    /** Master only: what the nearest school is holding. */
    speciesNames?: string[];
  };
  /** One-line summary, ready for a toast. */
  brief: string;
}

export interface SkillProgressDto {
  skill: SkillId;
  label: string;
  xp: number;
  rankName: string;
  progressPercent: number;
  nextXp: number | null;
}

export type BuySeedReasonCode =
  | "not-seed-stall"
  | "too-far"
  | "invalid-quantity"
  | "not-stocked"
  | "locked"
  | "insufficient-funds"
  | "inventory-full";

export type InteractionKind =
  | "crop"
  | "planting-plot"
  | "dock"
  | "fish-school"
  | "station"
  | "market"
  | "fishing-habitat"
  | "interior-door"
  | "mount";

export type InteractionAction =
  | "harvest"
  | "water"
  | "plant"
  | "fertilize"
  | "board"
  | "mount"
  | "dismount"
  | "dock"
  | "purchase-boat"
  | "chum"
  | "hook"
  | "start-processing"
  | "collect-processing"
  | "inspect"
  | "trade"
  | "cast"
  | "read-water"
  | "enter"
  | "exit"
  | "rest"
  | "irrigate"
  | "refuel"
  | "tow";

export interface InteractionTarget {
  id: string;
  kind: InteractionKind;
  action: InteractionAction;
  prompt: string;
  distanceMeters: number;
  priority: number;
}

export type CropPlacementReasonCode =
  | "invalid-farm"
  | "unknown-crop"
  | "invalid-position"
  | "outside-farm"
  | "invalid-surface"
  | "overlaps-crop"
  | "structure-clearance"
  | "too-far"
  | "mounted"
  | "hands-occupied"
  | "locked"
  | "no-seed";

export interface CropPlacementRequest {
  farmId: FarmId;
  cropId: CropId;
  /** Continuous world-space coordinate. */
  x: number;
  /** Continuous world-space coordinate. */
  z: number;
}

export interface CropPlacementResult {
  valid: boolean;
  reasonCode?: CropPlacementReasonCode;
  reason?: string;
  farmId: FarmId;
  cropId: CropId;
  worldX: number;
  worldZ: number;
  localX: number;
  localZ: number;
  rotationRadians: number;
  footprint: { width: number; depth: number };
}

export type CropMoistureBand = "dry" | "normal" | "wet";
export type CropClimateStatus = "preferred" | "neutral" | "challenging";
export type SoilFertilityBand = "low" | "fair" | "good";

export interface CropInspectionDto {
  placedCropId: PlacedCropId;
  cropId: CropId;
  name: string;
  stage: CropStage;
  approximateMinutesRemaining: number | null;
  stageTimingLabel: string;
  moisture: { value: number; band: CropMoistureBand };
  climate: {
    current: ClimateId;
    preferred: readonly ClimateId[];
    status: CropClimateStatus;
  };
  soil: { fertility: number; band: SoilFertilityBand };
  expectedYield: { min: number; max: number };
  work: WorkCostQuote & { current: number };
  waterWork: WorkCostQuote;
  harvestWork: WorkCostQuote;
  immediateAction: {
    kind: "water" | "harvest" | "none";
    label: string;
    cost: number | null;
    available: boolean;
    blockerReason?: string;
  };
  actions: {
    canWater: boolean;
    canHarvest: boolean;
    waterReason?: string;
    harvestReason?: string;
  };
}

export interface SeedBeltDto {
  seeds: ReadonlyArray<{
    cropId: CropId;
    name: string;
    seedItemId: ItemId;
    count: number;
    preferredClimates: readonly ClimateId[];
  }>;
}

export interface ProcessingJobInspectionDto {
  jobId: ProcessingJobId;
  stationId: string;
  recipeId: RecipeId;
  recipeName: string;
  outputName: string;
  status: "active" | "complete";
  remainingMinutes: number;
  readyClockLabel: string;
  waitBriefing: string;
  startBriefing: string;
}

export type GameCommand =
  | { type: "physics.commit"; frame: ResolvedPhysicsFrame }
  | { type: "player.face-target"; x: number; z: number }
  | { type: "player.reset-safe" }
  | { type: "boat.board"; boatId: BoatId }
  | { type: "boat.dock" }
  | { type: "boat.refuel"; boatId?: BoatId }
  | { type: "boat.emergency-tow" }
  | { type: "mount.board"; mountId: MountId }
  | { type: "mount.dismount" }
  | { type: "boat.purchase-skiff" }
  | { type: "crop.plant"; request: CropPlacementRequest }
  | { type: "crop.plant-near"; farmId: FarmId; cropId: string }
  | { type: "crop.water"; placedCropId: PlacedCropId }
  | { type: "crop.harvest"; placedCropId: PlacedCropId }
  | { type: "farm.apply-fertilizer"; farmId: FarmId }
  | { type: "farm.irrigate"; farmId: FarmId }
  | { type: "farm.buy-irrigation" }
  | { type: "player.rest-until-dawn" }
  | { type: "processing.start"; recipeId: RecipeId; stationId: string }
  | { type: "processing.collect"; jobId: ProcessingJobId }
  | { type: "fishing.cast-basic"; castPower?: number }
  | { type: "fishing.start-charge-basic" }
  | { type: "fishing.release-cast-basic"; castPower?: number }
  | { type: "fishing.hook-bite-basic" }
  | { type: "fishing.control-basic"; isHolding: boolean }
  | { type: "fishing.cancel-basic" }
  | { type: "fishing.discard-basic-catch" }
  | { type: "fishing.commit-basic" }
  | { type: "fishing.chum-school"; schoolId: FishSchoolId }
  | { type: "fishing.hook-school"; schoolId: FishSchoolId }
  | { type: "fishing.toggle-lure" }
  | { type: "fishing.set-drag"; notch: number }
  | {
      type: "fishing.control";
      input: { isReeling: boolean; isSlacking: boolean; isBracing: boolean; rodDirectionAngle: number };
    }
  | { type: "cargo.discard"; cargoId: FishCargoId; marketId?: MarketId }
  | { type: "cargo.release"; cargoId: FishCargoId; marketId?: MarketId }
  | { type: "inventory.sort-satchel" }
  | {
      type: "inventory.transfer";
      itemId: ItemId;
      quantity: number;
      boatId: BoatId;
      direction: "to-hold" | "to-satchel";
    }
  | { type: "market.sell-item"; marketId: MarketId; itemId: ItemId; quantity: number }
  | { type: "market.sell-produce-bulk"; marketId: MarketId }
  | { type: "market.buy-seed"; marketId: MarketId; itemId: ItemId; quantity: number }
  | { type: "market.buy-item"; marketId: MarketId; itemId: ItemId; quantity: number }
  | { type: "market.buy-rod"; marketId: MarketId; rodId: RodId }
  | { type: "market.equip-rod"; marketId: MarketId; rodId: RodId }
  | { type: "market.sell-fish"; marketId: MarketId; cargoId: FishCargoId }
  | { type: "market.sell-fish-bulk"; marketId: MarketId }
  | { type: "contract.deliver-items"; contractId: string; itemId: ItemId; quantity: number }
  | { type: "contract.deliver-fish"; contractId: string; cargoId: FishCargoId }
  | { type: "quest.talk-npc"; npcId: string }
  | { type: "quest.claim-reward"; questId: string; npcId: string }
  | { type: "quest.record-hint"; hintId: string }
  | { type: "quest.focus-track"; trackId: QuestTrackId };

export type GameQuery =
  | { type: "market.nearby" }
  | { type: "world.get-hud"; selectedCropId?: CropId | null }
  | { type: "expedition.get-board" }
  | { type: "cargo.get-hold-stores" }
  | { type: "inventory.get-satchel" }
  | { type: "inventory.inspect-item"; itemId: ItemId }
  | { type: "world.get-map" }
  | { type: "journal.get-pages" }
  | { type: "journal.get-almanac" }
  | { type: "world.get-pause" }
  | { type: "weather.get-farm-forecast" }
  | { type: "fishing.get-sport-hud" }
  | { type: "progression.get-skills" }
  | { type: "market.get-board"; marketId: MarketId }
  | { type: "market.demand-trend"; marketId: MarketId; itemId: ItemId; days?: number }
  | { type: "market.quote-sale"; marketId: MarketId; itemId: ItemId; quantity: number }
  | { type: "market.quote-purchase"; marketId: MarketId; itemId: ItemId; quantity: number }
  | { type: "boat.can-board"; boatId: BoatId }
  | { type: "boat.can-dock" }
  | { type: "crop.validate-placement"; request: CropPlacementRequest }
  | { type: "crop.inspect"; placedCropId: PlacedCropId }
  | { type: "crop.get-seed-belt" }
  | { type: "processing.inspect"; stationId: string }
  | { type: "crop.find-placement"; farmId: FarmId; cropId: string }
  | { type: "quest.get-active" }
  | { type: "npc.get-nearby" };

export type GameQueryResult =
  | MarketId
  | WorldHudDto
  | import("../expeditions/buildExpeditionOpportunities").ExpeditionBoardDto
  | HoldStoresDto
  | SatchelDto
  | ItemInspectionDto
  | WorldMapDto
  | JournalPagesDto
  | AlmanacDto
  | PauseSummaryDto
  | FarmForecastDto
  | SportFishingHudDto
  | SkillProgressDto[]
  | MarketBoardDto
  | MarketDemandTrendDto
  | CommodityQuote
  | null
  | boolean
  | CropPlacementResult
  | CropInspectionDto
  | SeedBeltDto
  | ProcessingJobInspectionDto
  | { success: boolean; x?: number; z?: number; reason?: string }
  | import("./QuestTypes").ActiveQuestDto
  | import("./QuestTypes").NpcId;
