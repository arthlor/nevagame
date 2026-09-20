import { canReachCarriageRear, CARRIAGE_TUNING } from "../mounts/Carriage";
import { ContentRegistry } from "../../content/ContentRegistry";
import { advanceCargoFreshness } from "../fishing/calculateFreshness";
import { InventoryManager } from "../inventory/InventoryManager";
import type { BoatId, BoatState, CargoClass, CargoLocation, FishCargoId, FishCargoState, FishInstance, ItemId, MarketId, StorageKind } from "../core/types";
import type { HoldStoresDto } from "../core/contracts";
import { buildCargoPresentation } from "../presentation/WorldHudPresentation";
import type { DomainContext } from "./DomainContext";
import type { NavigationDomain } from "./NavigationDomain";
import type { ProgressionDomain } from "./ProgressionDomain";
import { cargoClassFits, qualityRank, scrapsForCargoClass } from "./domainRules";
import { sportFishLandingXp } from "../economy/calculateFishXp";
import {
  STORAGE_FACILITIES,
  STORAGE_FACILITY_BY_KIND,
  storageInventoryId,
  type StorageFacilityDefinition
} from "../storage/storageFacilities";
import { WorldLayout } from "../../world/WorldLayout";
import { accessibleFishingSupplyCount } from "../fishing/FishingSupplies";

export class CargoDomain {
  constructor(
    private readonly context: DomainContext,
    private readonly navigation: NavigationDomain,
    private readonly progression: ProgressionDomain
  ) {}

  /** Whether a fish of this cargo class could be stowed right now. Pure query. */
  public canStowClass(cargoClass: CargoClass): boolean {
    return this.findLandingLocation(cargoClass) !== null;
  }

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
    if (fish.habitatId) {
      record.habitats ??= [];
      if (!record.habitats.includes(fish.habitatId)) record.habitats.push(fish.habitatId);
    }
    // A landmark catch is named before the journal moves on: first of its
    // kind, heaviest yet, or finest yet — in that priority.
    const priorBest = record.catchCount > 0 ? record : null;
    let catchRecord: "first" | "weight" | "quality" | undefined;
    if (!priorBest) catchRecord = "first";
    else if (fish.weightKg > (priorBest.largestWeightKg ?? 0)) catchRecord = "weight";
    else if (qualityRank(fish.quality) > qualityRank(priorBest.bestQuality)) catchRecord = "quality";
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
      record: catchRecord,
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

  /**
   * Releases a living catch back to the water. Frees the slot with no
   * material return — no sale, no scraps, no extra XP. Journal records and
   * already-consumed school catch stand: landing, not keeping, is what the
   * school and the records observe, so release can never farm either.
   */
  public release(
    cargoId: FishCargoId,
    marketId?: MarketId
  ): { success: boolean; reason?: string } {
    const { state, events } = this.context;
    if (state.player.activeMountId) return { success: false, reason: "Dismount before handling fish cargo" };
    const cargo = state.fishCargo[cargoId];
    if (!cargo) return { success: false, reason: "Fish cargo not found" };
    if (!this.navigation.canAccessFishCargo(cargo, marketId)) {
      return { success: false, reason: "Move to the fish cargo before releasing it" };
    }
    if (cargo.freshness <= 0) {
      return { success: false, reason: "The fish is spoiled — make scraps instead" };
    }
    this.clearPointers(cargo);
    delete state.fishCargo[cargoId];
    events.emit("FishReleased", {
      cargoId,
      speciesId: cargo.speciesId,
      weightKg: cargo.weightKg,
      quality: cargo.quality,
      minute: state.clock.currentMinute
    });
    return { success: true };
  }

  /**
   * Move one physical catch from an accessible boat slot into the player's
   * hands. This is deliberately a separate transaction from market access:
   * standing beside a docked vessel exposes its hold, but never counts as
   * carrying the pack to a counter.
   */
  public pickup(cargoId: FishCargoId): { success: boolean; reason?: string } {
    const { state, events } = this.context;
    if (state.player.activeMountId) return { success: false, reason: "Dismount before handling fish cargo" };
    if (state.player.carriedFishCargoId) return { success: false, reason: "Your hands are already full" };
    const cargo = state.fishCargo[cargoId];
    if (!cargo) return { success: false, reason: "Fish cargo not found" };
    if (cargo.location.type === "carriage") {
      const mount = state.mounts[cargo.location.containerId];
      const slot = cargo.location.slotIndex;
      if (!canReachCarriageRear(state, mount) || typeof slot !== "number" || mount?.fishCargoSlotIds?.[slot] !== cargo.id) {
        return { success: false, reason: "Stand at the rear of the parked carriage to collect this pack" };
      }
      mount.fishCargoSlotIds![slot] = null;
      state.player.carriedFishCargoId = cargo.id;
      cargo.location = { type: "player", containerId: "player" };
      events.emit("CargoUnloaded", { cargoId: cargo.id, minute: state.clock.currentMinute });
      return { success: true };
    }
    if (cargo.location.type !== "boat-hold" && cargo.location.type !== "boat-hook") {
      return { success: false, reason: "This fish is not in a transport" };
    }
    const slotIndex = cargo.location.slotIndex;
    const boat = state.boats[cargo.location.containerId];
    if (!boat || typeof slotIndex !== "number" || boat.fishCargoSlotIds[slotIndex] !== cargo.id) {
      return { success: false, reason: "This boat cargo slot is no longer available" };
    }
    if (!this.navigation.canAccessBoatStores(boat.id)) {
      return { success: false, reason: "Move to the docked boat to collect this trade pack" };
    }

    boat.fishCargoSlotIds[slotIndex] = null;
    state.player.carriedFishCargoId = cargo.id;
    cargo.location = { type: "player", containerId: "player" };
    events.emit("CargoUnloaded", {
      cargoId: cargo.id,
      minute: state.clock.currentMinute
    });
    return { success: true };
  }

  public canPickup(cargoId: FishCargoId): boolean {
    const { state } = this.context;
    if (state.player.activeMountId || state.player.carriedFishCargoId) return false;
    const cargo = state.fishCargo[cargoId];
    if (!cargo) return false;
    if (cargo.location.type === "carriage") {
      const mount = state.mounts[cargo.location.containerId];
      return canReachCarriageRear(state, mount) && typeof cargo.location.slotIndex === "number"
        && mount?.fishCargoSlotIds?.[cargo.location.slotIndex] === cargo.id;
    }
    if (cargo.location.type !== "boat-hold" && cargo.location.type !== "boat-hook") return false;
    const slotIndex = cargo.location.slotIndex;
    const boat = state.boats[cargo.location.containerId];
    return Boolean(
      boat &&
      typeof slotIndex === "number" &&
      boat.fishCargoSlotIds[slotIndex] === cargo.id &&
      this.navigation.canAccessBoatStores(boat.id)
    );
  }

  public loadCarriage(mountId: string): { success: boolean; reason?: string } {
    const { state } = this.context;
    const mount = state.mounts[mountId];
    if (!canReachCarriageRear(state, mount)) return { success: false, reason: "Stand at the rear of the parked carriage to load it" };
    const id = state.player.carriedFishCargoId;
    const cargo = id ? state.fishCargo[id] : undefined;
    if (!cargo || cargo.location.type !== "player" || cargo.location.containerId !== "player") return { success: false, reason: "Carry a trade pack to the carriage first" };
    if (!cargoClassFits(cargo.cargoClass, CARRIAGE_TUNING.maximumCargoClass)) return { success: false, reason: "This pack is too large for the carriage" };
    const slot = mount.fishCargoSlotIds?.findIndex(id => id === null) ?? -1;
    if (slot < 0) return { success: false, reason: "Both carriage cargo slots are full" };
    mount.fishCargoSlotIds![slot] = cargo.id;
    state.player.carriedFishCargoId = null;
    cargo.location = { type: "carriage", containerId: mount.id, slotIndex: slot };
    return { success: true };
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
    if (cargo.location.type === "carriage" && typeof cargo.location.slotIndex === "number") {
      const mount = state.mounts[cargo.location.containerId];
      if (mount?.fishCargoSlotIds?.[cargo.location.slotIndex] === cargo.id) mount.fishCargoSlotIds[cargo.location.slotIndex] = null;
    }
    if (state.player.carriedFishCargoId === cargo.id) state.player.carriedFishCargoId = null;
  }

  public canLandCargoClass(cargoClass: CargoClass): boolean {
    return this.findLandingLocation(cargoClass) !== null;
  }

  /** A gated facility is inert until its feature is earned. */
  private facilityUnlocked(facility: StorageFacilityDefinition): boolean {
    return !facility.requiredFeatureId
      || this.context.state.quests.unlockedFeatureIds.includes(facility.requiredFeatureId);
  }

  public storageBlocker(kind: StorageKind): string | null {
    const facility = STORAGE_FACILITY_BY_KIND[kind];
    if (!facility) return "That storage is not available";
    if (!this.facilityUnlocked(facility)) return facility.lockedReason ?? "That storage is not unlocked";
    return null;
  }

  /** Whether the player is standing within the facility's interaction reach. */
  public storageInReach(kind: StorageKind): boolean {
    const { state } = this.context;
    const facility = STORAGE_FACILITY_BY_KIND[kind];
    const structure = facility ? state.world.structures[facility.structureId] : undefined;
    if (!facility || !structure) return false;
    return Math.hypot(state.player.x - structure.x, state.player.z - structure.z)
      <= facility.interactionRadiusMeters;
  }

  /** Cargo currently sitting in one facility, oldest first for stable DTO order. */
  private facilityCargo(facility: StorageFacilityDefinition): FishCargoState[] {
    const { state } = this.context;
    if (!facility.fishLocation) return [];
    return Object.values(state.fishCargo)
      .filter(
        (cargo) =>
          cargo.location.type === facility.fishLocation &&
          cargo.location.containerId === facility.structureId
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  public canStoreFishInStorage(kind: StorageKind): boolean {
    const { state } = this.context;
    const facility = STORAGE_FACILITY_BY_KIND[kind];
    if (!facility?.fishLocation || !this.facilityUnlocked(facility) || state.player.activeMountId) return false;
    const cargo = state.player.carriedFishCargoId
      ? state.fishCargo[state.player.carriedFishCargoId]
      : undefined;
    if (!cargo) return false;
    if (!this.storageInReach(kind)) return false;
    if (!cargoClassFits(cargo.cargoClass, facility.maximumCargoClass)) return false;
    return this.facilityCargo(facility).length < facility.fishSlots;
  }

  /**
   * Stores the carried catch in an authored facility. The pack leaves the
   * hands and takes the facility's own freshness location (`crate` packs at
   * the open-air rate, `cold-storage` is refrigerated), so capacity and decay
   * both come from the facility definition rather than a second table.
   */
  public storeFishInStorage(cargoId: FishCargoId, kind: StorageKind): { success: boolean; reason?: string } {
    const { state, events } = this.context;
    const facility = STORAGE_FACILITY_BY_KIND[kind];
    if (!facility?.fishLocation) return { success: false, reason: "That storage is not available" };
    const blocker = this.storageBlocker(kind);
    if (blocker) return { success: false, reason: blocker };
    if (state.player.activeMountId) return { success: false, reason: "Dismount before handling fish cargo" };
    const cargo = state.fishCargo[cargoId];
    if (!cargo) return { success: false, reason: "Fish cargo not found" };
    if (state.player.carriedFishCargoId !== cargoId || cargo.location.type !== "player") {
      return { success: false, reason: "Carry this catch to the storage first" };
    }
    if (!this.storageInReach(kind)) return { success: false, reason: `Move closer to the ${facility.name}` };
    if (!cargoClassFits(cargo.cargoClass, facility.maximumCargoClass)) {
      return { success: false, reason: `The ${facility.name} cannot hold a pack this large` };
    }
    if (this.facilityCargo(facility).length >= facility.fishSlots) {
      return { success: false, reason: `The ${facility.name} is full` };
    }
    state.player.carriedFishCargoId = null;
    cargo.location = { type: facility.fishLocation, containerId: facility.structureId };
    events.emit("CargoStored", { cargoId: cargo.id, facility: kind, minute: state.clock.currentMinute });
    return { success: true };
  }

  /** Collects a stored catch back into both hands. */
  public takeFishFromStorage(cargoId: FishCargoId, kind: StorageKind): { success: boolean; reason?: string } {
    const { state, events } = this.context;
    const facility = STORAGE_FACILITY_BY_KIND[kind];
    if (!facility?.fishLocation) return { success: false, reason: "That storage is not available" };
    const blocker = this.storageBlocker(kind);
    if (blocker) return { success: false, reason: blocker };
    if (state.player.activeMountId) return { success: false, reason: "Dismount before handling fish cargo" };
    if (state.player.carriedFishCargoId) return { success: false, reason: "Your hands are already full" };
    const cargo = state.fishCargo[cargoId];
    if (!cargo) return { success: false, reason: "Fish cargo not found" };
    if (
      cargo.location.type !== facility.fishLocation ||
      cargo.location.containerId !== facility.structureId
    ) {
      return { success: false, reason: "That catch is not in this storage" };
    }
    if (!this.storageInReach(kind)) return { success: false, reason: `Move closer to the ${facility.name}` };
    cargo.location = { type: "player", containerId: "player" };
    state.player.carriedFishCargoId = cargo.id;
    events.emit("CargoUnloaded", { cargoId: cargo.id, minute: state.clock.currentMinute });
    return { success: true };
  }

  /**
   * First free slot of the requested kind on this vessel that fits the class.
   * `"hold"` is the protected internal slot; `"hook"` is the exposed transom
   * hook that can carry a catch the hold cannot.
   */
  private findStowSlot(boat: BoatState, cargoClass: CargoClass, placement: "hold" | "hook"): number | null {
    const definition = ContentRegistry.boats.get(boat.boatTypeId);
    if (!definition) return null;
    for (let index = 0; index < boat.fishCargoSlotIds.length; index++) {
      if (boat.fishCargoSlotIds[index] !== null) continue;
      const slot = definition.fishCargoSlots.find((candidate) => candidate.slotIndex === index)
        ?? definition.fishCargoSlots[index];
      if (!slot) continue;
      const slotKind = slot.type === "external-hook" ? "hook" : "hold";
      if (slotKind !== placement) continue;
      if (!cargoClassFits(cargoClass, slot.maxCargoClass)) continue;
      return index;
    }
    return null;
  }

  /** Whether the carried pack could be stowed on the active vessel right now. */
  public canStowAboard(boatId: BoatId, placement: "hold" | "hook"): boolean {
    const { state } = this.context;
    if (state.player.activeMountId || !state.player.carriedFishCargoId) return false;
    const cargo = state.fishCargo[state.player.carriedFishCargoId];
    const boat = state.boats[boatId];
    if (!cargo || !boat || state.player.activeBoatId !== boat.id) return false;
    return this.findStowSlot(boat, cargo.cargoClass, placement) !== null;
  }

  /**
   * The external-hook verb: stow the pack in the hand onto the active vessel,
   * either in the protected hold or on the exposed transom hook. Explicit
   * placement keeps the trade-off visible: the hook takes a class the hold
   * cannot, but it decays at the open-air rate and cannot use built-in ice.
   */
  public stowAboard(boatId: BoatId, placement: "hold" | "hook"): { success: boolean; reason?: string } {
    const { state, events } = this.context;
    if (state.player.activeMountId) return { success: false, reason: "Dismount before handling fish cargo" };
    const cargoId = state.player.carriedFishCargoId;
    const cargo = cargoId ? state.fishCargo[cargoId] : undefined;
    if (!cargo) return { success: false, reason: "Your hands are empty" };
    const boat = state.boats[boatId];
    if (!boat) return { success: false, reason: "Vessel not found" };
    if (state.player.activeBoatId !== boat.id) {
      return { success: false, reason: "Board the vessel to stow this catch" };
    }
    const slotIndex = this.findStowSlot(boat, cargo.cargoClass, placement);
    if (slotIndex === null) {
      return {
        success: false,
        reason: placement === "hook"
          ? "No free transom hook fits this catch"
          : "The hold has no room for this catch"
      };
    }
    boat.fishCargoSlotIds[slotIndex] = cargo.id;
    state.player.carriedFishCargoId = null;
    cargo.location = {
      type: placement === "hook" ? "boat-hook" : "boat-hold",
      containerId: boat.id,
      slotIndex
    };
    events.emit("CargoLoaded", {
      cargoId: cargo.id,
      boatId: boat.id,
      slotIndex,
      minute: state.clock.currentMinute
    });
    return { success: true };
  }

  public inspectHoldStores(): HoldStoresDto {
    const { state } = this.context;
    const playerInventory = state.inventories[state.player.inventoryId];
    const boats = Object.values(state.boats).sort((a, b) => a.id.localeCompare(b.id));
    const supplyIds: ItemId[] = [
      "item.bait_worms",
      "item.chum_bucket",
      "item.chum_rich",
      "item.chum_deep",
      "item.basic_lure",
      "item.crushed_ice",
      "item.boat_fuel"
    ];
    const vessels = boats.map((boat) => {
      const definition = ContentRegistry.boats.get(boat.boatTypeId);
      const maximum = definition?.durabilityMax ?? 100;
      const cargoSlots = boat.fishCargoSlotIds.map((cargoId, index) => {
        const slotDefinition = definition?.fishCargoSlots.find((candidate) => candidate.slotIndex === index)
          ?? definition?.fishCargoSlots[index];
        return {
          slotNumber: index + 1,
          kind: (slotDefinition?.type === "external-hook" ? "hook" : "hold") as "hold" | "hook",
          cargo: cargoId && state.fishCargo[cargoId] ? buildCargoPresentation(state.fishCargo[cargoId]) : null
        };
      });
      return {
        boatId: boat.id,
        name: definition?.name ?? "Vessel",
        statusLabel: boat.isDocked ? "Docked" as const : "At sea" as const,
        isActive: state.player.activeBoatId === boat.id,
        hull: {
          current: boat.durability,
          maximum,
          percent: Math.round((boat.durability / Math.max(1, maximum)) * 100)
        },
        occupiedSlots: cargoSlots.filter((slot) => slot.cargo !== null).length,
        cargoSlots,
        stowCarried: {
          hold: this.canStowAboard(boat.id, "hold"),
          hook: this.canStowAboard(boat.id, "hook")
        },
        stock: this.stockRows(boat.supplyInventoryId)
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
      satchelStock: this.stockRows(state.player.inventoryId),
      supplies: supplyIds.map((itemId) => ({
        itemId,
        name: ContentRegistry.items.get(itemId)?.name ?? itemId,
        count: accessibleFishingSupplyCount(state, itemId)
      })),
      vessels,
      storage: STORAGE_FACILITIES.map((facility) => {
        const inventoryId = storageInventoryId(facility.kind);
        const inventory = state.inventories[inventoryId];
        const fish = this.facilityCargo(facility);
        const blocker = this.storageBlocker(facility.kind);
        return {
          kind: facility.kind,
          structureId: facility.structureId,
          name: facility.name,
          near: this.storageInReach(facility.kind),
          locked: blocker !== null,
          blockerReason: blocker ?? undefined,
          goods: {
            usedSlots: inventory
              ? inventory.slots.filter(
                  (slot) => slot.itemId !== undefined && InventoryManager.getSlotQuantity(slot) > 0
                ).length
              : 0,
            totalSlots: facility.goodsSlots,
            stock: inventory ? this.stockRows(inventoryId) : []
          },
          fish: {
            usedSlots: fish.length,
            totalSlots: facility.fishSlots,
            cargo: fish.map((entry) => buildCargoPresentation(entry))
          }
        };
      })
    };
  }

  /**
   * Stackable goods in one inventory, merged per item and named for display.
   * Used for the ledger's transfer rows; fish cargo is excluded because it
   * occupies cargo slots and moves under its own rules.
   */
  private stockRows(inventoryId: string): Array<{ itemId: ItemId; name: string; count: number }> {
    const inventory = this.context.state.inventories[inventoryId];
    if (!inventory) return [];
    const totals = new Map<string, number>();
    for (const slot of inventory.slots) {
      const quantity = InventoryManager.getSlotQuantity(slot);
      if (!slot.itemId || quantity <= 0) continue;
      totals.set(slot.itemId, (totals.get(slot.itemId) ?? 0) + quantity);
    }
    return [...totals.entries()]
      .map(([itemId, count]) => ({
        itemId: itemId as ItemId,
        name: ContentRegistry.items.get(itemId)?.name ?? itemId,
        count
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
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
