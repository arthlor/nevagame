import type { ResolvedPhysicsFrame } from "./PhysicsAdapter";
import type {
  BoatId,
  ClimateId,
  CropId,
  CropQuality,
  CropStage,
  FarmId,
  FishCargoId,
  FishQuality,
  FishSchoolId,
  FishingEncounterState,
  ItemId,
  MarketId,
  PlacedCropId,
  ProcessingJobId,
  RecipeId
} from "./types";

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
  delivered?: number;
  completed?: boolean;
  rewardMoney?: number;
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
  | "interior-door";

export type InteractionAction =
  | "harvest"
  | "water"
  | "plant"
  | "fertilize"
  | "board"
  | "dock"
  | "chum"
  | "hook"
  | "start-processing"
  | "collect-processing"
  | "inspect"
  | "trade"
  | "cast"
  | "enter"
  | "exit";

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
export type CropClimateStatus = "preferred" | "challenging";
export type SoilFertilityBand = "low" | "fair" | "good";

export interface CropInspectionDto {
  placedCropId: PlacedCropId;
  cropId: CropId;
  name: string;
  stage: CropStage;
  approximateMinutesRemaining: number | null;
  moisture: { value: number; band: CropMoistureBand };
  climate: {
    current: ClimateId;
    preferred: readonly ClimateId[];
    status: CropClimateStatus;
  };
  soil: { fertility: number; band: SoilFertilityBand };
  expectedYield: { min: number; max: number };
  work: { current: number; actionCost: number; xpMultiplier: number; rareChanceMultiplier: number };
  actions: {
    canWater: boolean;
    canHarvest: boolean;
    waterReason?: string;
    harvestReason?: string;
  };
}

export type GameCommand =
  | { type: "physics.commit"; frame: ResolvedPhysicsFrame }
  | { type: "player.face-target"; x: number; z: number }
  | { type: "player.reset-safe" }
  | { type: "boat.board"; boatId: BoatId }
  | { type: "boat.dock" }
  | { type: "crop.plant"; request: CropPlacementRequest }
  | { type: "crop.plant-near"; farmId: FarmId; cropId: string }
  | { type: "crop.water"; placedCropId: PlacedCropId }
  | { type: "crop.harvest"; placedCropId: PlacedCropId }
  | { type: "farm.apply-fertilizer"; farmId: FarmId }
  | { type: "processing.start"; recipeId: RecipeId; stationId: string }
  | { type: "processing.collect"; jobId: ProcessingJobId }
  | { type: "fishing.cast-basic"; castPower?: number }
  | { type: "fishing.start-charge-basic" }
  | { type: "fishing.release-cast-basic"; castPower?: number }
  | { type: "fishing.hook-bite-basic" }
  | { type: "fishing.control-basic"; isHolding: boolean }
  | { type: "fishing.cancel-basic" }
  | { type: "fishing.chum-school"; schoolId: FishSchoolId }
  | { type: "fishing.hook-school"; schoolId: FishSchoolId }
  | {
      type: "fishing.control";
      input: { isReeling: boolean; isSlacking: boolean; isBracing: boolean; rodDirectionAngle: number };
    }
  | { type: "cargo.discard"; cargoId: FishCargoId }
  | { type: "market.sell-item"; marketId: MarketId; itemId: ItemId; quantity: number }
  | { type: "market.buy-seed"; marketId: MarketId; itemId: ItemId; quantity: number }
  | { type: "market.sell-fish"; marketId: MarketId; cargoId: FishCargoId }
  | { type: "contract.deliver-items"; contractId: string; itemId: ItemId; quantity: number }
  | { type: "contract.deliver-fish"; contractId: string; cargoId: FishCargoId }
  | { type: "quest.talk-npc"; npcId: string }
  | { type: "quest.claim-reward"; questId: string }
  | { type: "quest.record-hint"; hintId: string };

export type GameQuery =
  | { type: "market.nearby" }
  | { type: "boat.can-board"; boatId: BoatId }
  | { type: "boat.can-dock" }
  | { type: "crop.validate-placement"; request: CropPlacementRequest }
  | { type: "crop.inspect"; placedCropId: PlacedCropId }
  | { type: "crop.find-placement"; farmId: FarmId; cropId: string }
  | { type: "quest.get-active" }
  | { type: "npc.get-nearby" };

export type GameQueryResult =
  | MarketId
  | null
  | boolean
  | CropPlacementResult
  | CropInspectionDto
  | { success: boolean; x?: number; z?: number; reason?: string }
  | import("./QuestTypes").ActiveQuestDto
  | import("./QuestTypes").NpcId;

