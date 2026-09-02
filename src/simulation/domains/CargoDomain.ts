import { ContentRegistry } from "../../content/ContentRegistry";
import { advanceCargoFreshness } from "../fishing/calculateFreshness";
import { InventoryManager } from "../inventory/InventoryManager";
import type { BoatId, CargoClass, CargoLocation, FishCargoId, FishCargoState, FishInstance, ItemId, MarketId } from "../core/types";
import type { HoldStoresDto } from "../core/contracts";
import { buildCargoPresentation } from "../presentation/WorldHudPresentation";
import type { DomainContext } from "./DomainContext";
import type { NavigationDomain } from "./NavigationDomain";
import type { ProgressionDomain } from "./ProgressionDomain";
import { cargoClassFits, qualityRank, scrapsForCargoClass } from "./domainRules";
import { sportFishLandingXp } from "../economy/calculateFishXp";
import { WorldLayout } from "../../world/WorldLayout";
import { accessibleFishingSupplyCount } from "../fishing/FishingSupplies";

export class CargoDomain {
  constructor(
    private readonly context: DomainContext,
    private readonly navigation: NavigationDomain,
    private readonly progression: ProgressionDomain
  ) {}

  public landCaughtFish(
    fish: FishInstance,
    awardSportXp = true,
    beforeOutcomeEvents?: () => void
  ): { success: boolean; reason?: string; cargoId?: FishCargoId; boatId?: BoatId } {
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
    if (awardSportXp) {
      this.progression.addProficiencyXp(
        "fishing",
        sportFishLandingXp(speciesDef, fish.weightKg, fish.quality)
      );
    }
    this.context.persistRng();
    beforeOutcomeEvents?.();
    events.emit("FishLanded", {
      cargoId,
      speciesId: fish.speciesId,
      ecologyId: fish.ecologyId ?? WorldLayout.fishingEcologyAt(state.player.x, state.player.z).id,
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
    return {
      success: true,
      cargoId,
      boatId: location.type === "boat-hold" || location.type === "boat-hook"
        ? location.containerId
        : undefined
    };
  }

  public discard(
    cargoId: FishCargoId,
    marketId?: MarketId
  ): { success: boolean; scraps?: number; reason?: string } {
    const { state } = this.context;
    if (state.player.activeMountId) return { success: false, reason: "Dismount before handling fish cargo" };
    const cargo = state.fishCargo[cargoId];
    if (!cargo) return { success: false, reason: "Fish cargo not found" };
    if (!this.navigation.canAccessFishCargo(cargo, marketId)) {
      return { success: false, reason: "Move to the fish cargo before discarding it" };
    }
    const scraps = scrapsForCargoClass(cargo.cargoClass);
    const inventory = state.inventories[state.player.inventoryId];
    const stack = [{ itemId: "item.fish_scraps", quantity: scraps }];
    const canGrantScraps = InventoryManager.canAddItems(inventory, stack);
    if (!canGrantScraps && cargo.freshness > 0) {
      return { success: false, reason: "No inventory space for scraps" };
    }
    if (canGrantScraps) InventoryManager.addItemsAtomically(inventory, stack);
    this.clearPointers(cargo);
    delete state.fishCargo[cargoId];
    return { success: true, scraps: canGrantScraps ? scraps : 0 };
  }

  public tick(minutes: number, startMinute: number = this.context.state.clock.currentMinute - minutes): void {
    const { state } = this.context;
    advanceCargoFreshness(state, minutes, startMinute);
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

  public canLandCargoClass(cargoClass: CargoClass): boolean {
    return this.findLandingLocation(cargoClass) !== null;
  }

  public inspectHoldStores(): HoldStoresDto {
    const { state } = this.context;
    const playerInventory = state.inventories[state.player.inventoryId];
    const boats = Object.values(state.boats).sort((a, b) => a.id.localeCompare(b.id));
    const supplyIds: ItemId[] = [
      "item.bait_worms",
      "item.chum_bucket",
      "item.basic_lure",
      "item.crushed_ice",
      "item.boat_fuel"
    ];
    const vessels = boats.map((boat) => {
      const definition = ContentRegistry.boats.get(boat.boatTypeId);
      const maximum = definition?.durabilityMax ?? 100;
      const cargoSlots = boat.fishCargoSlotIds.map((cargoId, index) => ({
        slotNumber: index + 1,
        cargo: cargoId && state.fishCargo[cargoId] ? buildCargoPresentation(state.fishCargo[cargoId]) : null
      }));
      return {
        boatId: boat.id,
        name: definition?.name ?? "Vessel",
        statusLabel: boat.isDocked ? "Docked" as const : "At sea" as const,
        hull: {
          current: boat.durability,
          maximum,
          percent: Math.round((boat.durability / Math.max(1, maximum)) * 100)
        },
        occupiedSlots: cargoSlots.filter((slot) => slot.cargo !== null).length,
        cargoSlots
      };
    });
    const carried = state.player.carriedFishCargoId
      ? state.fishCargo[state.player.carriedFishCargoId] ?? null
      : null;

    return {
      satchel: {
        occupiedSlots: playerInventory.slots.filter(
          (slot) => slot.itemId !== undefined && InventoryManager.getSlotQuantity(slot) > 0
        ).length,
        totalSlots: playerInventory.slots.length
      },
      vesselHolds: {
        occupiedSlots: vessels.reduce((total, vessel) => total + vessel.occupiedSlots, 0),
        totalSlots: vessels.reduce((total, vessel) => total + vessel.cargoSlots.length, 0)
      },
      carriedCatch: carried ? buildCargoPresentation(carried) : null,
      supplies: supplyIds.map((itemId) => ({
        itemId,
        name: ContentRegistry.items.get(itemId)?.name ?? itemId,
        count: accessibleFishingSupplyCount(state, itemId)
      })),
      vessels
    };
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
