// src/simulation/fishing/calculateFreshness.ts

import { ContentRegistry } from "../../content/ContentRegistry";
import { InventoryManager } from "../inventory/InventoryManager";
import { CarryLocationType, FishCargoState, GameState } from "../core/types";

export function getStorageFreshnessModifier(locationType: CarryLocationType, hasIce: boolean = false): number {
  if (hasIce) return 0.4; // Iced hold
  switch (locationType) {
    case "player":
      return 1.0; // Open carry
    case "boat-hold":
      return 0.8; // Sheltered hold
    case "boat-hook":
      return 1.0; // External hook (wind/sun exposure)
    case "cold-storage":
      return 0.15; // Insulated cold room
    case "crate":
      return 0.9;
    default:
      return 1.0;
  }
}

export function resolveCargoHasIce(state: GameState, cargo: FishCargoState): boolean {
  if (cargo.location.type === "cold-storage") return false;

  if (cargo.location.type === "boat-hold" || cargo.location.type === "boat-hook") {
    const boat = state.boats[cargo.location.containerId];
    if (boat) {
      const def = ContentRegistry.boats.get(boat.boatTypeId);
      const slotIndex = cargo.location.slotIndex;
      const slot =
        typeof slotIndex === "number"
          ? (def?.fishCargoSlots.find((s) => s.slotIndex === slotIndex) ?? def?.fishCargoSlots[slotIndex])
          : undefined;
      if (slot?.hasIce) return true;
      const supply = state.inventories[boat.supplyInventoryId];
      if (supply && InventoryManager.getItemCount(supply, "item.crushed_ice") > 0) {
        return true;
      }
      if (state.player.activeBoatId === boat.id) {
        const playerInv = state.inventories[state.player.inventoryId];
        if (playerInv && InventoryManager.getItemCount(playerInv, "item.crushed_ice") > 0) {
          return true;
        }
      }
    }
  }

  if (cargo.location.type === "player") {
    const playerInv = state.inventories[state.player.inventoryId];
    if (playerInv && InventoryManager.getItemCount(playerInv, "item.crushed_ice") > 0) {
      return true;
    }
  }

  return false;
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
  if (freshness >= 90) return 1.0;
  if (freshness >= 75) return 0.95;
  if (freshness >= 50) return 0.8;
  if (freshness >= 25) return 0.55;
  if (freshness > 0) return 0.3;
  return 0.0; // Spoilage - cannot sell as fresh
}
