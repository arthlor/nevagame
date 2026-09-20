// src/simulation/fishing/calculateFreshness.ts

import { ContentRegistry } from "../../content/ContentRegistry";
import { InventoryManager } from "../inventory/InventoryManager";
import { CarryLocationType, FishCargoState, GameState } from "../core/types";
import { WorldLayout } from "../../world/WorldLayout";
import { storageFacilityForStructure, storageInventoryId } from "../storage/storageFacilities";

function cargoSupplyInventory(state: GameState, cargo: Pick<FishCargoState, "location">) {
  if (cargo.location.type === "player") {
    return state.inventories[state.player.inventoryId];
  }
  // A crate resolves ice from its own goods inventory, so loose packs cool
  // exactly what shares that crate. The refrigerated cold room never needs it.
  if (cargo.location.type === "crate") {
    const facility = storageFacilityForStructure(cargo.location.containerId);
    return facility ? state.inventories[storageInventoryId(facility.kind)] : undefined;
  }
  if (cargo.location.type !== "boat-hold" && cargo.location.type !== "boat-hook") return undefined;
  const boat = state.boats[cargo.location.containerId];
  return boat ? state.inventories[boat.supplyInventoryId] : undefined;
}

function cargoHasBuiltInIce(state: GameState, cargo: Pick<FishCargoState, "location">): boolean {
  if (cargo.location.type !== "boat-hold" && cargo.location.type !== "boat-hook") return false;
  const boat = state.boats[cargo.location.containerId];
  if (!boat) return false;
  const def = ContentRegistry.boats.get(boat.boatTypeId);
  const slotIndex = cargo.location.slotIndex;
  const slot = typeof slotIndex === "number"
    ? (def?.fishCargoSlots.find((candidate) => candidate.slotIndex === slotIndex) ?? def?.fishCargoSlots[slotIndex])
    : undefined;
  return slot?.hasIce === true;
}

/**
 * How fast a catch loses freshness in each place it can sit, relative to open
 * carry. Ice overrides the location entirely. These were bare literals inside
 * the lookup below while `LLM/02` §10 printed the same table, so neither side
 * owned them; `tests/unit/docTuningValues.test.ts` now holds the document to
 * this constant.
 */
export const FRESHNESS_STORAGE_MODIFIERS = {
  iced: 0.4,
  player: 1.0,
  "boat-hold": 0.8,
  "boat-hook": 1.0,
  carriage: 1.0,
  "cold-storage": 0.15,
  crate: 0.9
} as const;

/**
 * Price kept at each freshness band, highest band first. A catch at or above a
 * band's `atOrAbove` sells for its `multiplier`; below the last band it is
 * spoiled and cannot be sold fresh.
 */
export const FRESHNESS_PRICE_BRACKETS = [
  { atOrAbove: 90, multiplier: 1.0 },
  { atOrAbove: 75, multiplier: 0.95 },
  { atOrAbove: 50, multiplier: 0.8 },
  { atOrAbove: 25, multiplier: 0.55 },
  { atOrAbove: 1, multiplier: 0.3 }
] as const;

export function getStorageFreshnessModifier(locationType: CarryLocationType, hasIce: boolean = false): number {
  if (hasIce) return FRESHNESS_STORAGE_MODIFIERS.iced;
  return FRESHNESS_STORAGE_MODIFIERS[locationType] ?? FRESHNESS_STORAGE_MODIFIERS.player;
}

/** Inventory whose loose ice is actually cooling this cargo, or undefined if none / built-in. */
export function resolveCargoIceInventory(state: GameState, cargo: Pick<FishCargoState, "location">) {
  if (cargo.location.type === "cold-storage") return undefined;
  if (cargoHasBuiltInIce(state, cargo)) return undefined;
  const supply = cargoSupplyInventory(state, cargo);
  if (supply && InventoryManager.getItemCount(supply, "item.crushed_ice") > 0) return supply;
  if (cargo.location.type === "boat-hold" || cargo.location.type === "boat-hook") {
    const boat = state.boats[cargo.location.containerId];
    if (boat && state.player.activeBoatId === boat.id) {
      const playerInv = state.inventories[state.player.inventoryId];
      if (playerInv && InventoryManager.getItemCount(playerInv, "item.crushed_ice") > 0) {
        return playerInv;
      }
    }
  }
  return undefined;
}

export function resolveCargoHasIce(state: GameState, cargo: Pick<FishCargoState, "location">): boolean {
  if (cargo.location.type === "cold-storage") return false;
  if (cargoHasBuiltInIce(state, cargo)) return true;
  return resolveCargoIceInventory(state, cargo) !== undefined;
}

export function resolveCargoTemperatureC(state: GameState, cargo: FishCargoState): number {
  let holder: { x: number; z: number } = state.player;
  if (cargo.location.type === "boat-hold" || cargo.location.type === "boat-hook") {
    holder = state.boats[cargo.location.containerId] ?? holder;
  } else if (cargo.location.type === "carriage") {
    holder = state.mounts[cargo.location.containerId] ?? holder;
  } else if (cargo.location.type === "cold-storage" || cargo.location.type === "crate") {
    holder = state.world.structures[cargo.location.containerId] ?? holder;
  }
  return WorldLayout.climateSampleAt(holder.x, holder.z, state.weather).temperatureC;
}

/**
 * Applies freshness in hour-bounded slices and bills loose ice at the end of
 * each covered game hour. Boat slots with authored built-in ice are never
 * billed; one loose pack preserves every cargo in that storage container for
 * the preceding hour.
 *
 * Billing must stay at the hour boundary: the presence of `item.crushed_ice`
 * is the live signal for the iced storage modifier, so consuming it earlier
 * would drop the remaining slices of the hour to the un-iced rate. Exact
 * "only if it cooled every slice" accounting would need per-hour usage stored
 * on the save, which is not worth a schema change for this edge.
 */
export function advanceCargoFreshness(
  state: GameState,
  minutes: number,
  startMinute: number
): number {
  if (minutes <= 0) return 0;

  const cargos = Object.values(state.fishCargo);
  let spoiledCount = 0;
  let elapsed = 0;

  while (elapsed < minutes) {
    const currentMinute = startMinute + elapsed;
    const minuteOfHour = ((currentMinute % 60) + 60) % 60;
    const untilHourBoundary = minuteOfHour === 0 ? 60 : 60 - minuteOfHour;
    const sliceMinutes = Math.min(minutes - elapsed, untilHourBoundary);
    const activeCargos = cargos.filter((cargo) => cargo.freshness > 0 && ContentRegistry.fishSpecies.has(cargo.speciesId));

    for (const cargo of activeCargos) {
      const speciesDef = ContentRegistry.fishSpecies.get(cargo.speciesId);
      if (!speciesDef) continue;
      const sliceStart = startMinute + elapsed;
      const sliceEnd = sliceStart + sliceMinutes;
      const decayMinutes = Math.max(0, sliceEnd - Math.max(sliceStart, cargo.caughtAtMinute));
      if (decayMinutes <= 0) continue;
      const freshnessBefore = cargo.freshness;
      cargo.freshness = Math.max(
        0,
        cargo.freshness - calculateFreshnessLoss(
          decayMinutes,
          speciesDef.baseDecayRatePerMinute,
          cargo.location.type,
          resolveCargoHasIce(state, cargo),
          resolveCargoTemperatureC(state, cargo)
        )
      );
      if (freshnessBefore > 0 && cargo.freshness <= 0) spoiledCount += 1;
    }

    elapsed += sliceMinutes;
    if ((startMinute + elapsed) % 60 === 0) {
      const billedInventories = new Set<string>();
      for (const cargo of activeCargos) {
        const iceInv = resolveCargoIceInventory(state, cargo);
        if (!iceInv) continue;
        billedInventories.add(iceInv.id);
      }
      for (const inventoryId of billedInventories) {
        const inventory = state.inventories[inventoryId];
        if (inventory) InventoryManager.removeItemsAtomically(inventory, [{ itemId: "item.crushed_ice", quantity: 1 }]);
      }
    }
  }

  return spoiledCount;
}

export function calculateFreshnessLoss(
  elapsedMinutes: number,
  baseDecayRatePerMinute: number,
  locationType: CarryLocationType,
  hasIce: boolean = false,
  ambientTemperatureC: number = 20
): number {
  if (elapsedMinutes <= 0) return 0;
  const storageMod = getStorageFreshnessModifier(locationType, hasIce);
  const tempMod = Math.max(0.6, ambientTemperatureC / 20);
  return elapsedMinutes * baseDecayRatePerMinute * storageMod * tempMod;
}

export function getFreshnessPriceMultiplier(freshness: number): number {
  if (freshness > 0 && freshness < 1) return 0.3;
  for (const bracket of FRESHNESS_PRICE_BRACKETS) {
    if (freshness >= bracket.atOrAbove) return bracket.multiplier;
  }
  return 0.0; // Spoilage - cannot sell as fresh
}
