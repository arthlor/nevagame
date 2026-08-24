// src/simulation/core/EventBus.ts

import {
  BoatId,
  ContractId,
  CropId,
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
  SkillId,
  WeatherTag
} from "./types";

export interface DomainEvents {
  CropPlanted: { placedCropId: PlacedCropId; cropId: CropId; farmId: FarmId; minute: GameMinute };
  CropWatered: { placedCropId: PlacedCropId; newMoisture: number; minute: GameMinute };
  CropStageChanged: { placedCropId: PlacedCropId; cropId: CropId; stage: CropStage; minute: GameMinute };
  CropHarvested: { placedCropId: PlacedCropId; cropId: CropId; quantity: number; quality: string; minute: GameMinute };
  RecipeStarted: { jobId: string; recipeId: RecipeId; minute: GameMinute };
  RecipeCompleted: { jobId: string; recipeId: RecipeId; minute: GameMinute };
  FishSchoolSpawned: { schoolId: FishSchoolId; x: number; z: number; species: FishSpeciesId[]; minute: GameMinute };
  FishSchoolChummed: { schoolId: FishSchoolId; frenzyMinutes: number; minute: GameMinute };
  FishHooked: { speciesId: FishSpeciesId; weightKg: number; minute: GameMinute };
  FishLanded: { cargoId: FishCargoId; speciesId: FishSpeciesId; weightKg: number; quality: FishQuality; minute: GameMinute };
  FishEscaped: { speciesId: FishSpeciesId; reason: "escaped" | "snapped"; minute: GameMinute };
  BasicFishingStarted: { habitatId: string; minute: GameMinute };
  BasicFishingResolved: { habitatId: string; catchItemId?: ItemId; reason?: "missed" | "inventory-full"; minute: GameMinute };
  CargoLoaded: { cargoId: FishCargoId; boatId: BoatId; slotIndex: number; minute: GameMinute };
  CargoUnloaded: { cargoId: FishCargoId; minute: GameMinute };
  BoatBoarded: { boatId: BoatId; minute: GameMinute };
  BoatDisembarked: { boatId: BoatId; minute: GameMinute };
  BoatDocked: { boatId: BoatId; minute: GameMinute };
  ItemSold: { marketId: MarketId; itemId: ItemId; quantity: number; revenue: number; minute: GameMinute };
  FishSold: { marketId: MarketId; cargoId: FishCargoId; speciesId: FishSpeciesId; revenue: number; minute: GameMinute };
  MarketTicked: { marketId: MarketId; minute: GameMinute };
  WeatherChanged: { weather: WeatherTag; minute: GameMinute };
  ProficiencyLeveledUp: { skill: SkillId; newRank: string; totalXp: number; minute: GameMinute };
  ContractCompleted: { contractId: ContractId; rewardMoney: number; minute: GameMinute };
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
