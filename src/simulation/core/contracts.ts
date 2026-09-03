import type { ResolvedPhysicsFrame } from "./PhysicsAdapter";
import type { QuestTrackId } from "./QuestTypes";
import type { RecordTier } from "../../content/records";
import type {
  BoatId,
  BasicFishingPhase,
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
  boat: {
    boatId: BoatId;
    name: string;
    speedKnots: number;
    seaState: "Calm" | "Swell" | "Rough";
    seaWarning: string | null;
    showNightWarning: boolean;
    hull: { current: number; maximum: number; percent: number; danger: boolean };
    fuel: { current: number; maximum: number; percent: number; danger: boolean } | null;
    occupiedCargoSlots: number;
    cargoSlots: ReadonlyArray<{ slotNumber: number; cargo: WorldHudCargoDto | null }>;
  } | null;
  basicFishingPhase: BasicFishingPhase | null;
  expeditionUnlocked: boolean;
}

export interface HoldStoresDto {
  satchel: { occupiedSlots: number; totalSlots: number };
  vesselHolds: { occupiedSlots: number; totalSlots: number };
  carriedCatch: WorldHudCargoDto | null;
  supplies: ReadonlyArray<{ itemId: ItemId; name: string; count: number }>;
  vessels: ReadonlyArray<{
    boatId: BoatId;
    name: string;
    statusLabel: "Docked" | "At sea";
    hull: { current: number; maximum: number; percent: number };
    occupiedSlots: number;
    cargoSlots: ReadonlyArray<{ slotNumber: number; cargo: WorldHudCargoDto | null }>;
  }>;
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

export interface WorldMapDto {
  player: { x: number; z: number };
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
  | "enter"
  | "exit"
  | "rest"
  | "irrigate"
  | "refuel";

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
  | {
      type: "fishing.control";
      input: { isReeling: boolean; isSlacking: boolean; isBracing: boolean; rodDirectionAngle: number };
    }
  | { type: "cargo.discard"; cargoId: FishCargoId; marketId?: MarketId }
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
  | { type: "world.get-map" }
  | { type: "journal.get-pages" }
  | { type: "world.get-pause" }
  | { type: "weather.get-farm-forecast" }
  | { type: "fishing.get-sport-hud" }
  | { type: "progression.get-skills" }
  | { type: "market.get-board"; marketId: MarketId }
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
  | WorldMapDto
  | JournalPagesDto
  | PauseSummaryDto
  | FarmForecastDto
  | SportFishingHudDto
  | SkillProgressDto[]
  | MarketBoardDto
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
