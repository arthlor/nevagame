import { ContentRegistry } from "../../content/ContentRegistry";
import { advanceCargoFreshness } from "../fishing/calculateFreshness";
import { InventoryManager } from "../inventory/InventoryManager";
import type { CargoClass, CargoLocation, FishCargoId, FishCargoState, FishInstance } from "../core/types";
import type { DomainContext } from "./DomainContext";
import type { NavigationDomain } from "./NavigationDomain";
import type { ProgressionDomain } from "./ProgressionDomain";
import { cargoClassFits, qualityRank, scrapsForCargoClass } from "./domainRules";

export class CargoDomain {
  constructor(
    private readonly context: DomainContext,
    private readonly navigation: NavigationDomain,
    private readonly progression: ProgressionDomain
  ) {}

  public landCaughtFish(fish: FishInstance): { success: boolean; reason?: string } {
    const { state, events } = this.context;
    if (state.player.activeMountId) return { success: false, reason: "Dismount before handling fish cargo" };
    const speciesDef = ContentRegistry.fishSpecies.get(fish.speciesId);
    if (!speciesDef) return { success: false, reason: "Unknown fish species" };
    const location = this.findLandingLocation(speciesDef.cargoClass);
    if (!location) return { success: false, reason: "No cargo space" };

    const cargoId: FishCargoId = this.context.nextEntityId("cargo");
    if ((location.type === "boat-hold" || location.type === "boat-hook") && typeof location.slotIndex === "number") {
      const boat = state.boats[location.containerId];
      if (boat) boat.fishCargoSlotIds[location.slotIndex] = cargoId;
    } else if (location.type === "player") {
      state.player.carriedFishCargoId = cargoId;
    }
    state.fishCargo[cargoId] = {
      id: cargoId,
      speciesId: fish.speciesId,
      weightKg: fish.weightKg,
      quality: fish.quality,
      caughtAtMinute: state.clock.currentMinute,
      freshness: 100,
      cargoClass: speciesDef.cargoClass,
      location
    };
    state.journal.fishRecords[fish.speciesId] ??= {
      discovered: true,
      catchCount: 0,
      largestWeightKg: fish.weightKg,
      bestQuality: fish.quality,
      firstCaughtMinute: state.clock.currentMinute
    };
    const record = state.journal.fishRecords[fish.speciesId];
    record.catchCount += 1;
    record.largestWeightKg = Math.max(record.largestWeightKg ?? 0, fish.weightKg);
    if (qualityRank(fish.quality) > qualityRank(record.bestQuality)) record.bestQuality = fish.quality;
    this.progression.addProficiencyXp("fishing", 120);
    this.context.persistRng();
    events.emit("FishLanded", {
      cargoId,
      speciesId: fish.speciesId,
      boatId: location.type === "boat-hold" || location.type === "boat-hook" ? location.containerId : undefined,
      weightKg: fish.weightKg,
      quality: fish.quality,
      minute: state.clock.currentMinute
    });
    // FishLanded advances the authored land step first. Emitting the physical
    // stow event afterward lets the following stow objective observe the same
    // catch instead of waiting forever for an event that already happened.
    if ((location.type === "boat-hold" || location.type === "boat-hook") && typeof location.slotIndex === "number") {
      events.emit("CargoLoaded", {
        cargoId,
        boatId: location.containerId,
        slotIndex: location.slotIndex,
        minute: state.clock.currentMinute
      });
    }
    return { success: true };
  }

  public discard(cargoId: FishCargoId): { success: boolean; scraps?: number; reason?: string } {
    const { state } = this.context;
    if (state.player.activeMountId) return { success: false, reason: "Dismount before handling fish cargo" };
    const cargo = state.fishCargo[cargoId];
    if (!cargo) return { success: false, reason: "Fish cargo not found" };
    if (!this.navigation.canAccessFishCargo(cargo)) {
      return { success: false, reason: "Move to the fish cargo before discarding it" };
    }
    const scraps = scrapsForCargoClass(cargo.cargoClass);
    const inventory = state.inventories[state.player.inventoryId];
    const stack = [{ itemId: "item.fish_scraps", quantity: scraps }];
    if (!InventoryManager.canAddItems(inventory, stack)) {
      return { success: false, reason: "No inventory space for scraps" };
    }
    InventoryManager.addItemsAtomically(inventory, stack);
    this.clearPointers(cargo);
    delete state.fishCargo[cargoId];
    return { success: true, scraps };
  }

  public tick(minutes: number, startMinute: number = this.context.state.clock.currentMinute - minutes): void {
    const { state } = this.context;
    advanceCargoFreshness(state, minutes, startMinute, state.weather.temperatureC);
  }

  public clearPointers(cargo: FishCargoState): void {
    const { state } = this.context;
    if (cargo.location.type === "boat-hold" || cargo.location.type === "boat-hook") {
      const boat = state.boats[cargo.location.containerId];
      if (boat && typeof cargo.location.slotIndex === "number") {
        boat.fishCargoSlotIds[cargo.location.slotIndex] = null;
      }
    }
    if (state.player.carriedFishCargoId === cargo.id) state.player.carriedFishCargoId = null;
  }

  private findLandingLocation(cargoClass: CargoClass): CargoLocation | null {
    const { state } = this.context;
    const boat = state.player.activeBoatId ? state.boats[state.player.activeBoatId] : null;
    const boatDef = boat ? ContentRegistry.boats.get(boat.boatTypeId) : undefined;
    if (boat && boatDef) {
      for (let index = 0; index < boat.fishCargoSlotIds.length; index++) {
        if (boat.fishCargoSlotIds[index] !== null) continue;
        const slot = boatDef.fishCargoSlots.find((candidate) => candidate.slotIndex === index) ?? boatDef.fishCargoSlots[index];
        if (!slot || !cargoClassFits(cargoClass, slot.maxCargoClass)) continue;
        return {
          type: slot.type === "external-hook" ? "boat-hook" : "boat-hold",
          containerId: boat.id,
          slotIndex: index
        };
      }
    }
    return state.player.carriedFishCargoId
      ? null
      : cargoClassFits(cargoClass, "medium")
        ? { type: "player", containerId: "player" }
        : null;
  }
}
