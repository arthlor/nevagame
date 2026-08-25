import { ContentRegistry } from "../../content/ContentRegistry";
import {
  farmLocalToWorld,
  farmWorldOrigin,
  getFarmLayout,
  isPlantableFarmSurface,
  isPointInsideRect,
  worldToFarmLocal,
  type FarmPoint,
  type FarmRect
} from "../../world/FarmLayout";
import type {
  CropInspectionDto,
  CropMoistureBand,
  CropPlacementReasonCode,
  CropPlacementRequest,
  CropPlacementResult,
  InteractionResult,
  SoilFertilityBand
} from "../core/contracts";
import { SeededRng } from "../core/Rng";
import type { CropQuality, FarmId, GameState, PlacedCropId } from "../core/types";
import {
  applyCropMoistureOverMinutes,
  calculateCropQuality,
  calculateEffectiveGrowthDelta,
  calculateHarvestYield,
  determineCropStage
} from "../farming/calculateCropGrowth";
import { InventoryManager } from "../inventory/InventoryManager";
import type { DomainContext } from "./DomainContext";
import { distance2d } from "./DomainContext";
import type { ProgressionDomain } from "./ProgressionDomain";

export const CROP_INTERACTION_RADIUS = 2.5;
export const WET_MOISTURE_THRESHOLD = 85;
export const FERTILIZER_ITEM_ID = "item.basic_fertilizer";
export const FERTILITY_MIN = 10;
export const FERTILITY_MAX = 100;
/** Basic fertilizer restore; crop fertilityCost is 8–15, so +20 covers ~1–2 harvests. */
export const FERTILITY_RESTORE = 20;
export const FARMING_ACTION_COST = {
  plant: 10,
  water: 5,
  harvest: 45,
  fertilize: 8
} as const;

const PLACEMENT_EPSILON = 0.01;
const QUALITY_RANK: Record<CropQuality, number> = {
  common: 0,
  fine: 1,
  exceptional: 2,
  prize: 3
};

export interface OrientedCropFootprint {
  center: FarmPoint;
  width: number;
  depth: number;
  rotationRadians: number;
}

function qualityRank(quality: CropQuality | undefined): number {
  return quality ? QUALITY_RANK[quality] : -1;
}

function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Stable visual yaw derived without consuming gameplay RNG. */
export function deterministicCropRotation(
  worldSeed: number,
  farmId: string,
  cropId: string,
  worldX: number,
  worldZ: number
): number {
  const quantizedX = Math.round(worldX * 4);
  const quantizedZ = Math.round(worldZ * 4);
  const hash = hashString(`${worldSeed}|${farmId}|${cropId}|${quantizedX}|${quantizedZ}`);
  return (hash / 0x1_0000_0000) * Math.PI * 2;
}

export function cropMoistureBand(moisture: number): CropMoistureBand {
  if (moisture < 40) return "dry";
  if (moisture < WET_MOISTURE_THRESHOLD) return "normal";
  return "wet";
}

function soilFertilityBand(fertility: number): SoilFertilityBand {
  if (fertility < 30) return "low";
  if (fertility < 80) return "fair";
  return "good";
}

function footprintCorners(footprint: OrientedCropFootprint): FarmPoint[] {
  const halfWidth = footprint.width / 2;
  const halfDepth = footprint.depth / 2;
  const cos = Math.cos(footprint.rotationRadians);
  const sin = Math.sin(footprint.rotationRadians);
  return [
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: halfWidth, z: halfDepth },
    { x: -halfWidth, z: halfDepth }
  ].map((corner) => ({
    x: footprint.center.x + corner.x * cos - corner.z * sin,
    z: footprint.center.z + corner.x * sin + corner.z * cos
  }));
}

function footprintAxes(footprint: OrientedCropFootprint): FarmPoint[] {
  const cos = Math.cos(footprint.rotationRadians);
  const sin = Math.sin(footprint.rotationRadians);
  return [
    { x: cos, z: sin },
    { x: -sin, z: cos }
  ];
}

function projectionRange(points: readonly FarmPoint[], axis: FarmPoint): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const projection = point.x * axis.x + point.z * axis.z;
    min = Math.min(min, projection);
    max = Math.max(max, projection);
  }
  return { min, max };
}

export function orientedCropFootprintsOverlap(
  a: OrientedCropFootprint,
  b: OrientedCropFootprint
): boolean {
  const cornersA = footprintCorners(a);
  const cornersB = footprintCorners(b);
  for (const axis of [...footprintAxes(a), ...footprintAxes(b)]) {
    const projectionA = projectionRange(cornersA, axis);
    const projectionB = projectionRange(cornersB, axis);
    const overlap = Math.min(projectionA.max, projectionB.max) - Math.max(projectionA.min, projectionB.min);
    if (overlap <= PLACEMENT_EPSILON) return false;
  }
  return true;
}

function circleIntersectsFootprint(center: FarmPoint, radius: number, footprint: OrientedCropFootprint): boolean {
  const dx = center.x - footprint.center.x;
  const dz = center.z - footprint.center.z;
  const cos = Math.cos(-footprint.rotationRadians);
  const sin = Math.sin(-footprint.rotationRadians);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const closestX = Math.max(-footprint.width / 2, Math.min(footprint.width / 2, localX));
  const closestZ = Math.max(-footprint.depth / 2, Math.min(footprint.depth / 2, localZ));
  return Math.hypot(localX - closestX, localZ - closestZ) < radius - PLACEMENT_EPSILON;
}

function fallbackFarmRect(width: number, depth: number): FarmRect {
  return { minX: -width / 2, maxX: width / 2, minZ: -depth / 2, maxZ: depth / 2 };
}

export interface PlantingPositionResult {
  success: boolean;
  x?: number;
  z?: number;
  reason?: string;
}

export class FarmingDomain {
  constructor(
    private readonly context: DomainContext,
    private readonly progression: ProgressionDomain
  ) {}

  public validatePlacement(request: CropPlacementRequest): CropPlacementResult {
    const { state } = this.context;
    const farm = state.farms[request.farmId];
    const cropDef = ContentRegistry.crops.get(request.cropId);
    const emptyFootprint = cropDef?.footprint ?? { width: 0, depth: 0 };
    const layout = getFarmLayout(request.farmId);
    const boundary = layout?.farmBounds ?? (farm ? fallbackFarmRect(farm.widthMeters, farm.depthMeters) : { minX: -10, maxX: 10, minZ: -10, maxZ: 10 });

    const isLocal = isPointInsideRect({ x: request.x, z: request.z }, boundary, 0.5);
    const local = isLocal
      ? { x: request.x, z: request.z }
      : worldToFarmLocal(request.farmId, request);
    const world = isLocal
      ? farmLocalToWorld(request.farmId, request)
      : { x: request.x, z: request.z };

    const rotationRadians = deterministicCropRotation(
      state.worldSeed,
      request.farmId,
      request.cropId,
      world.x,
      world.z
    );
    const result = (
      valid: boolean,
      reasonCode?: CropPlacementReasonCode,
      reason?: string
    ): CropPlacementResult => ({
      valid,
      reasonCode,
      reason,
      farmId: request.farmId,
      cropId: request.cropId,
      worldX: world.x,
      worldZ: world.z,
      localX: local.x,
      localZ: local.z,
      rotationRadians,
      footprint: { ...emptyFootprint }
    });

    if (!farm) return result(false, "invalid-farm", "This farm is unavailable");
    if (!cropDef) return result(false, "unknown-crop", "This seed cannot be planted here");
    if (!Number.isFinite(request.x) || !Number.isFinite(request.z)) {
      return result(false, "invalid-position", "Choose a clear patch of soil");
    }
    if (distance2d(state.player, world) > CROP_INTERACTION_RADIUS + 3.5) {
      return result(false, "too-far", "Move closer to plant here");
    }
    if (state.player.proficiencies.farming < cropDef.minimumFarmingXp) {
      return result(false, "locked", `Requires ${cropDef.minimumFarmingXp} Farming XP`);
    }
    const candidate: OrientedCropFootprint = {
      center: local,
      width: cropDef.footprint.width,
      depth: cropDef.footprint.depth,
      rotationRadians
    };
    const corners = footprintCorners(candidate);
    if (corners.some((corner) => !isPointInsideRect(corner, boundary, PLACEMENT_EPSILON))) {
      return result(false, "outside-farm", "Keep the whole crop inside the farm");
    }
    if (layout && corners.some((corner) => !isPlantableFarmSurface(request.farmId, corner))) {
      return result(false, "invalid-surface", "Plant on prepared farm soil");
    }

    for (const placedId of farm.placedCropIds) {
      const other = state.crops[placedId];
      if (!other) continue;
      const otherDef = ContentRegistry.crops.get(other.cropId);
      if (!otherDef) continue;
      if (
        orientedCropFootprintsOverlap(candidate, {
          center: { x: other.x, z: other.z },
          width: otherDef.footprint.width,
          depth: otherDef.footprint.depth,
          rotationRadians: other.rotationRadians
        })
      ) {
        return result(false, "overlaps-crop", "Leave room for the neighboring crop");
      }
    }

    const worldCandidate: OrientedCropFootprint = { ...candidate, center: request };
    for (const structureId of farm.placedStructureIds) {
      const structure = state.world.structures[structureId];
      if (!structure) continue;
      const anchor = layout?.structureAnchors.find((entry) => entry.id === structureId);
      if (circleIntersectsFootprint(structure, anchor?.clearanceRadius ?? 1.25, worldCandidate)) {
        return result(false, "structure-clearance", "Leave access to the farm structure");
      }
    }

    const playerInventory = state.inventories[state.player.inventoryId];
    if (!InventoryManager.hasItems(playerInventory, [{ itemId: cropDef.seedItemId, quantity: 1 }])) {
      return result(false, "no-seed", `No ${cropDef.name} seed in your backpack`);
    }
    return result(true);
  }

  /** Compatibility query for existing callers; finds reachable plantable soil on the farm. */
  public findPlantingPosition(farmId: FarmId, cropId: string): PlantingPositionResult {
    const origin = farmWorldOrigin(farmId);
    const layout = getFarmLayout(farmId);
    const player = this.context.state.player;

    const directValidation = this.validatePlacement({
      farmId,
      cropId,
      x: player.x,
      z: player.z
    });
    if (directValidation.valid) {
      return { success: true, x: directValidation.localX, z: directValidation.localZ };
    }

    if (layout?.plantableAreas) {
      const localX = player.x - origin.x;
      const localZ = player.z - origin.z;
      const candidates: Array<{ x: number; z: number }> = [];

      for (const area of layout.plantableAreas) {
        const clampedX = Math.max(area.minX + 0.6, Math.min(area.maxX - 0.6, localX));
        const clampedZ = Math.max(area.minZ + 0.6, Math.min(area.maxZ - 0.6, localZ));
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            candidates.push({
              x: origin.x + Math.max(area.minX + 0.6, Math.min(area.maxX - 0.6, clampedX + dx * 0.8)),
              z: origin.z + Math.max(area.minZ + 0.6, Math.min(area.maxZ - 0.6, clampedZ + dz * 0.8))
            });
          }
        }
      }

      candidates.sort((a, b) => distance2d(player, a) - distance2d(player, b));
      for (const cand of candidates) {
        const v = this.validatePlacement({ farmId, cropId, x: cand.x, z: cand.z });
        if (v.valid) {
          return { success: true, x: v.localX, z: v.localZ };
        }
      }
    }

    return { success: false, reason: directValidation.reason ?? `Move to the farm at ${origin.x}, ${origin.z}` };
  }

  public plantNearPlayer(farmId: FarmId, cropId: string): InteractionResult {
    const placement = this.findPlantingPosition(farmId, cropId);
    if (!placement.success || placement.x == null || placement.z == null) {
      return { success: false, reason: placement.reason };
    }
    return this.plant({ farmId, cropId, x: placement.x, z: placement.z });
  }

  public plant(request: CropPlacementRequest): InteractionResult {
    const placement = this.validatePlacement(request);
    if (!placement.valid) {
      return { success: false, reason: placement.reason, reasonCode: placement.reasonCode };
    }
    const { state, events } = this.context;
    const farm = state.farms[request.farmId]!;
    const cropDef = ContentRegistry.crops.get(request.cropId)!;
    const playerInventory = state.inventories[state.player.inventoryId];
    if (!InventoryManager.removeItemsAtomically(playerInventory, [{ itemId: cropDef.seedItemId, quantity: 1 }])) {
      return { success: false, reason: "The seed is no longer available", reasonCode: "no-seed" };
    }

    const placedCropId = this.context.nextEntityId("placed_crop");
    state.crops[placedCropId] = {
      id: placedCropId,
      cropId: cropDef.id,
      farmId: farm.id,
      x: placement.localX,
      z: placement.localZ,
      rotationRadians: placement.rotationRadians,
      plantedAtMinute: state.clock.currentMinute,
      lastUpdatedMinute: state.clock.currentMinute,
      effectiveGrowthMinutes: 0,
      moisture: 70,
      health: 100,
      stage: "seeded",
      averageMoistureAccum: 70,
      moistureSampleCount: 1
    };
    farm.placedCropIds.push(placedCropId);
    this.progression.addProficiencyXp("farming", FARMING_ACTION_COST.plant);
    this.context.persistRng();
    events.emit("CropPlanted", { placedCropId, cropId: cropDef.id, farmId: farm.id, minute: state.clock.currentMinute });
    return { success: true, placedCropId };
  }

  public water(placedCropId: PlacedCropId): InteractionResult {
    const { state, events } = this.context;
    const crop = state.crops[placedCropId];
    if (!crop) return { success: false, reason: "Crop not found" };
    if (!this.isNearCrop(crop)) return { success: false, reason: "Move closer to the crop" };
    if (crop.stage === "withered") return { success: false, reason: "This crop has withered" };
    if (crop.moisture >= WET_MOISTURE_THRESHOLD) {
      return { success: false, reason: "The soil is already wet", reasonCode: "already-wet" };
    }
    crop.moisture = 100;
    this.progression.addProficiencyXp("farming", FARMING_ACTION_COST.water);
    events.emit("CropWatered", { placedCropId, farmId: crop.farmId, newMoisture: 100, minute: state.clock.currentMinute });
    return { success: true };
  }

  public harvest(placedCropId: PlacedCropId): InteractionResult & { quality?: CropQuality } {
    const { state, rng, events } = this.context;
    const crop = state.crops[placedCropId];
    if (!crop) return { success: false, reason: "Crop not found" };
    if (!this.isNearCrop(crop)) return { success: false, reason: "Move closer to the crop" };
    const cropDef = ContentRegistry.crops.get(crop.cropId);
    if (!cropDef) return { success: false, reason: "Crop not found" };
    if (crop.stage === "withered") {
      if (cropDef.regrows) {
        return { success: false, reason: "This crop is not ready" };
      }
      this.removePlacedCrop(placedCropId);
      return { success: true, yield: 0, reason: "Withered crop cleared" };
    }
    if (crop.stage !== "mature" && crop.stage !== "overripe") {
      return { success: false, reason: "This crop is not ready" };
    }
    const farm = state.farms[crop.farmId]!;
    const playerInventory = state.inventories[state.player.inventoryId];
    const averageMoisture = crop.moistureSampleCount > 0
      ? crop.averageMoistureAccum / crop.moistureSampleCount
      : 50;
    const climateScore = cropDef.preferredClimates.includes(farm.climateId) ? 1 : 0.6;
    const farmingProficiency = state.player.proficiencies.farming;
    const draftRng = new SeededRng(rng.getSeed(), rng.getState());
    const workOutcome = this.progression.getWorkOutcome();
    const { quality } = calculateCropQuality(
      {
        climateMatchScore: climateScore,
        averageMoisture,
        soilFertility: farm.soil.fertility,
        farmingProficiency,
        rngRoll: draftRng.nextFloat(),
        rareChanceMultiplier: workOutcome.rareChanceMultiplier
      },
      draftRng
    );
    const quantity = calculateHarvestYield(cropDef, crop.health, farmingProficiency, draftRng);
    if (!InventoryManager.canAddItems(playerInventory, [{ itemId: cropDef.harvestItemId, quantity }])) {
      return { success: false, reason: "Your backpack is full" };
    }

    InventoryManager.addItemsAtomically(playerInventory, [{ itemId: cropDef.harvestItemId, quantity }]);
    farm.soil.fertility = Math.max(FERTILITY_MIN, farm.soil.fertility - cropDef.fertilityCost);
    this.progression.addProficiencyXp("farming", FARMING_ACTION_COST.harvest);
    state.journal.cropRecords[crop.cropId] ??= { harvestedCount: 0 };
    const record = state.journal.cropRecords[crop.cropId];
    record.harvestedCount += quantity;
    if (qualityRank(quality) >= qualityRank(record.bestQuality)) record.bestQuality = quality;
    events.emit("CropHarvested", {
      placedCropId,
      cropId: crop.cropId,
      farmId: crop.farmId,
      quantity,
      quality,
      minute: state.clock.currentMinute
    });

    if (cropDef.regrows && cropDef.regrowMinutes) {
      crop.stage = "growing";
      crop.effectiveGrowthMinutes = cropDef.baseGrowthMinutes - cropDef.regrowMinutes;
      crop.averageMoistureAccum = crop.moisture;
      crop.moistureSampleCount = 1;
    } else {
      this.removePlacedCrop(placedCropId);
    }
    rng.setState(draftRng.getState());
    this.context.persistRng();
    return { success: true, yield: quantity, quality };
  }

  public applyFertilizer(farmId: FarmId): InteractionResult {
    const { state } = this.context;
    const farm = state.farms[farmId];
    if (!farm) return { success: false, reason: "This farm is unavailable" };
    if (!this.isNearFarm(farmId)) return { success: false, reason: "Move closer to the farm" };
    if (farm.soil.fertility >= FERTILITY_MAX) {
      return { success: false, reason: "The soil is already fully fertile" };
    }
    const playerInventory = state.inventories[state.player.inventoryId];
    if (!InventoryManager.hasItems(playerInventory, [{ itemId: FERTILIZER_ITEM_ID, quantity: 1 }])) {
      return { success: false, reason: "No fertilizer in your backpack" };
    }
    if (!InventoryManager.removeItemsAtomically(playerInventory, [{ itemId: FERTILIZER_ITEM_ID, quantity: 1 }])) {
      return { success: false, reason: "No fertilizer in your backpack" };
    }
    farm.soil.fertility = Math.min(FERTILITY_MAX, farm.soil.fertility + FERTILITY_RESTORE);
    this.progression.addProficiencyXp("farming", FARMING_ACTION_COST.fertilize);
    return { success: true };
  }

  public inspect(placedCropId: PlacedCropId): CropInspectionDto | null {
    const { state } = this.context;
    const crop = state.crops[placedCropId];
    if (!crop) return null;
    const cropDef = ContentRegistry.crops.get(crop.cropId);
    const farm = state.farms[crop.farmId];
    if (!cropDef || !farm) return null;
    const remainingEffective = Math.max(0, cropDef.baseGrowthMinutes - crop.effectiveGrowthMinutes);
    const currentRate = calculateEffectiveGrowthDelta(
      1,
      cropDef,
      farm.climateId,
      crop.moisture,
      farm.soil.fertility,
      state.weather.type
    );
    const approximateMinutesRemaining = crop.stage === "mature" || crop.stage === "overripe" || crop.stage === "withered"
      ? null
      : Math.max(5, Math.ceil(remainingEffective / Math.max(0.01, currentRate) / 5) * 5);
    const near = this.isNearCrop(crop);
    const canWater = near && crop.stage !== "withered" && crop.moisture < WET_MOISTURE_THRESHOLD;
    const canHarvest = near && (crop.stage === "mature" || crop.stage === "overripe" || crop.stage === "withered");
    const workOutcome = this.progression.getWorkOutcome();
    return {
      placedCropId,
      cropId: crop.cropId,
      name: cropDef.name,
      stage: crop.stage,
      approximateMinutesRemaining,
      moisture: { value: crop.moisture, band: cropMoistureBand(crop.moisture) },
      climate: {
        current: farm.climateId,
        preferred: cropDef.preferredClimates,
        status: cropDef.preferredClimates.includes(farm.climateId) ? "preferred" : "challenging"
      },
      soil: { fertility: farm.soil.fertility, band: soilFertilityBand(farm.soil.fertility) },
      expectedYield: { ...cropDef.baseYield },
      work: {
        current: state.player.workCapacity.current,
        actionCost: crop.stage === "mature" || crop.stage === "overripe"
          ? FARMING_ACTION_COST.harvest
          : FARMING_ACTION_COST.water,
        xpMultiplier: workOutcome.xpMultiplier,
        rareChanceMultiplier: workOutcome.rareChanceMultiplier
      },
      actions: {
        canWater,
        canHarvest,
        waterReason: canWater
          ? undefined
          : !near
            ? "Move closer"
            : crop.stage === "withered"
              ? "Crop withered"
              : "Soil already wet",
        harvestReason: canHarvest
          ? undefined
          : !near
            ? "Move closer"
            : "Not ready"
      }
    };
  }

  public tick(minutes: number): void {
    const { state, events } = this.context;
    for (const crop of Object.values(state.crops)) {
      const cropDef = ContentRegistry.crops.get(crop.cropId);
      const farm = state.farms[crop.farmId];
      if (!cropDef || !farm) continue;
      crop.effectiveGrowthMinutes += calculateEffectiveGrowthDelta(
        minutes,
        cropDef,
        farm.climateId,
        crop.moisture,
        farm.soil.fertility,
        state.weather.type
      );
      crop.lastUpdatedMinute = state.clock.currentMinute;
      applyCropMoistureOverMinutes(crop, minutes, cropDef.waterNeed, state.weather.type);
      const nextStage = determineCropStage(crop.effectiveGrowthMinutes, cropDef.baseGrowthMinutes, cropDef.regrows);
      if (nextStage === crop.stage) continue;
      crop.stage = nextStage;
      events.emit("CropStageChanged", {
        placedCropId: crop.id,
        cropId: crop.cropId,
        stage: nextStage,
        minute: state.clock.currentMinute
      });
    }
  }

  private isNearCrop(crop: GameState["crops"][string]): boolean {
    const worldPosition = farmLocalToWorld(crop.farmId, crop);
    return distance2d(this.context.state.player, worldPosition) <= CROP_INTERACTION_RADIUS;
  }

  private isNearFarm(farmId: FarmId): boolean {
    const farm = this.context.state.farms[farmId];
    if (!farm) return false;
    const layout = getFarmLayout(farmId);
    const local = worldToFarmLocal(farmId, this.context.state.player);
    const bounds = layout?.farmBounds ?? fallbackFarmRect(farm.widthMeters, farm.depthMeters);
    return isPointInsideRect(local, bounds, CROP_INTERACTION_RADIUS);
  }

  private removePlacedCrop(placedCropId: PlacedCropId): void {
    const crop = this.context.state.crops[placedCropId];
    if (!crop) return;
    const farm = this.context.state.farms[crop.farmId];
    delete this.context.state.crops[placedCropId];
    if (farm) farm.placedCropIds = farm.placedCropIds.filter((id) => id !== placedCropId);
  }
}
