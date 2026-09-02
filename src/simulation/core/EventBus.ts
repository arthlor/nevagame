// src/simulation/core/EventBus.ts

import {
  BoatId,
  ContractId,
  CropId,
  CropQuality,
  CropStage,
  FarmId,
  FishCargoId,
  FishQuality,
  FishSchoolId,
  FishSpeciesId,
  GameMinute,
  ItemId,
  MarketId,
  PlacedCropId,
  RecipeId,
  RodId,
  SeasonId,
  SkillId,
  WeatherTag
} from "./types";
import type { FishingEcologyId } from "../../world/WorldIslands";

export interface DomainEvents {
  CropPlanted: { placedCropId: PlacedCropId; cropId: CropId; farmId: FarmId; minute: GameMinute };
  CropWatered: { placedCropId: PlacedCropId; farmId: FarmId; newMoisture: number; minute: GameMinute };
  CropStageChanged: { placedCropId: PlacedCropId; cropId: CropId; stage: CropStage; minute: GameMinute };
  CropHarvested: { placedCropId: PlacedCropId; cropId: CropId; farmId: FarmId; quantity: number; quality: CropQuality; xpGained: number; minute: GameMinute };
  FarmFertilized: { farmId: FarmId; newFertility: number; minute: GameMinute };
  IrrigationInstalled: { farmId: FarmId; featureId: string; cost: number; minute: GameMinute };
  FarmIrrigated: { farmId: FarmId; cropCount: number; minute: GameMinute };
  SeedPurchased: { marketId: MarketId; itemId: ItemId; quantity: number; cost: number; minute: GameMinute };
  RecipeStarted: { jobId: string; recipeId: RecipeId; minute: GameMinute };
  RecipeCompleted: { jobId: string; recipeId: RecipeId; stationId: string; minute: GameMinute };
  FishSchoolSpawned: { schoolId: FishSchoolId; ecologyId: FishingEcologyId; x: number; z: number; species: FishSpeciesId[]; minute: GameMinute };
  FishSchoolChummed: { schoolId: FishSchoolId; ecologyId: FishingEcologyId; habitatId: string; frenzyMinutes: number; minute: GameMinute };
  FishHooked: { speciesId: FishSpeciesId; ecologyId: FishingEcologyId; habitatId: string; weightKg: number; minute: GameMinute };
  FishLanded: { cargoId: FishCargoId; speciesId: FishSpeciesId; ecologyId: FishingEcologyId; boatId?: BoatId; weightKg: number; quality: FishQuality; minute: GameMinute };
  FishEscaped: { speciesId: FishSpeciesId; reason: "escaped" | "snapped" | "no-cargo-space"; minute: GameMinute };
  BasicFishingStarted: { ecologyId: FishingEcologyId; habitatId: string; castPower: number; minute: GameMinute };
  BasicFishingBiteAlert: { ecologyId: FishingEcologyId; habitatId: string; speciesId: FishSpeciesId; minute: GameMinute };
  BasicFishingMinigameStarted: { ecologyId: FishingEcologyId; habitatId: string; speciesId: FishSpeciesId; hasTreasure: boolean; minute: GameMinute };
  BasicFishingTreasureCaught: { lootItemIds: ItemId[]; minute: GameMinute };
  BasicFishingResolved: {
    ecologyId: FishingEcologyId;
    habitatId: string;
    boatId?: BoatId;
    catchItemId?: ItemId;
    quality?: FishQuality;
    isPerfect?: boolean;
    hasTreasure?: boolean;
    treasureLootItemIds?: ItemId[];
    reason?: "missed" | "escaped" | "inventory-full" | "cancelled";
    minute: GameMinute;
  };
  CargoLoaded: { cargoId: FishCargoId; boatId: BoatId; slotIndex: number; minute: GameMinute };
  CargoUnloaded: { cargoId: FishCargoId; minute: GameMinute };
  BoatBoarded: { boatId: BoatId; minute: GameMinute };
  BoatDisembarked: { boatId: BoatId; minute: GameMinute };
  BoatDocked: { boatId: BoatId; marketId: MarketId; minute: GameMinute };
  MountBoarded: { mountId: string; minute: GameMinute };
  MountDisembarked: { mountId: string; minute: GameMinute };
  BoatPurchased: { boatId: BoatId; boatTypeId: string; cost: number; minute: GameMinute };
  ItemSold: { marketId: MarketId; itemId: ItemId; quantity: number; revenue: number; minute: GameMinute };
  ItemPurchased: { marketId: MarketId; itemId: ItemId; quantity: number; cost: number; minute: GameMinute };
  RodPurchased: { marketId: MarketId; rodId: RodId; cost: number; minute: GameMinute };
  RodEquipped: { marketId: MarketId; rodId: RodId; minute: GameMinute };
  FishSold: { marketId: MarketId; cargoId: FishCargoId; speciesId: FishSpeciesId; revenue: number; minute: GameMinute };
  MarketTicked: { marketId: MarketId; minute: GameMinute };
  WeatherChanged: { weather: WeatherTag; minute: GameMinute };
  /**
   * The calendar turned over. Emitted once per crossing, from
   * `applyElapsedGameMinutes`, so a long offline catch-up reports the season
   * it landed in rather than every season it swept through.
   */
  SeasonChanged: { season: SeasonId; previousSeason: SeasonId; year: number; minute: GameMinute };
  ProficiencyLeveledUp: { skill: SkillId; newRank: string; totalXp: number; minute: GameMinute };
  ContractCompleted: { contractId: ContractId; templateId: string; contractType: string; rewardMoney: number; minute: GameMinute };
  NpcTalked: { npcId: string; minute: GameMinute };
  QuestStarted: { questId: string; actId: string; minute: GameMinute };
  QuestProgressed: { questId: string; stepId: string; current: number; total: number; minute: GameMinute };
  QuestCompleted: { questId: string; actId: string; rewardMoney?: number; minute: GameMinute };
  ActCompleted: { actId: string; minute: GameMinute };
  Notification: { title: string; message: string; type: "info" | "success" | "warning" | "error" };
}


type EventCallback<T> = (payload: T) => void;

export class EventBus {
  private listeners: Map<keyof DomainEvents, Set<EventCallback<DomainEvents[keyof DomainEvents]>>> = new Map();

  public on<K extends keyof DomainEvents>(event: K, callback: EventCallback<DomainEvents[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(callback as EventCallback<DomainEvents[keyof DomainEvents]>);
    return () => set.delete(callback as EventCallback<DomainEvents[keyof DomainEvents]>);
  }

  public emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const callback of set) {
      try {
        callback(payload);
      } catch (err) {
        console.error(`[EventBus] Error in listener for event "${String(event)}":`, err);
      }
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}
