// src/content/boats.ts

import { BoatDefinition } from "./types";

export const BOATS: Record<string, BoatDefinition> = {
  "boat.rowboat": {
    id: "boat.rowboat",
    name: "Wooden Rowboat",
    description: "A humble hand-crafted dinghy. Suitable for calm rivers, lakes and sheltered coastal waters.",
    maxSpeed: 4.5, // ~16 km/h
    // A hand-powered boat needs a responsive first stroke at the gameplay
    // camera. The low top speed still preserves the rowboat's deliberate
    // pace, while the quicker ramp keeps short steering corrections useful
    // on browsers rendering the world at the 30 FPS floor.
    acceleration: 3.0,
    turningRate: 1.2,
    fuelCapacity: 0, // Manual oar power - no fuel required
    durabilityMax: 100,
    fishCargoSlots: [
      { slotIndex: 0, type: "hold", maxCargoClass: "small", hasIce: false },
      { slotIndex: 1, type: "hold", maxCargoClass: "medium", hasIce: false }
    ],
    supplySlotCount: 4,
    safeSeaRoughness: 0.35,
    costMoney: 150,
    repairCostMoney: 60
  },
  "boat.skiff": {
    id: "boat.skiff",
    name: "Coastal Fishing Skiff",
    description: "A seaworthy motorized timber skiff equipped with 4 internal cargo slots and 2 external large game hooks.",
    maxSpeed: 8.5, // ~30 km/h
    acceleration: 3.5,
    turningRate: 1.6,
    fuelCapacity: 100,
    durabilityMax: 250,
    fishCargoSlots: [
      { slotIndex: 0, type: "hold", maxCargoClass: "medium", hasIce: true },
      { slotIndex: 1, type: "hold", maxCargoClass: "medium", hasIce: true },
      { slotIndex: 2, type: "hold", maxCargoClass: "medium", hasIce: false },
      { slotIndex: 3, type: "hold", maxCargoClass: "medium", hasIce: false },
      { slotIndex: 4, type: "external-hook", maxCargoClass: "gargantuan", hasIce: false },
      { slotIndex: 5, type: "external-hook", maxCargoClass: "gargantuan", hasIce: false }
    ],
    supplySlotCount: 8,
    safeSeaRoughness: 0.75,
    costMoney: 850,
    repairCostMoney: 150,
    requiredSkillXp: { skill: "fishing", xp: 7500 }
  },
  "boat.trading_ship": {
    id: "boat.trading_ship", name: "Sunreach Trading Coaster",
    description: "A broad-deck cargo vessel with ten pack bays, built for the Sunreach crossing.",
    maxSpeed: 6.2, acceleration: 1.4, turningRate: 0.55, fuelCapacity: 0,
    durabilityMax: 400,
    fishCargoSlots: Array.from({ length: 10 }, (_, slotIndex) => ({ slotIndex, type: "hold" as const, maxCargoClass: "medium" as const, hasIce: false })),
    supplySlotCount: 10, safeSeaRoughness: 0.8, costMoney: 150000, repairCostMoney: 800,
    requiredSkillXp: { skill: "trading", xp: 30000 }
  }
};

/** A freight coaster meets the coastal skiff's seaworthiness requirement. */
export function boatMeetsSailingRequirement(boatTypeId: string, requirement: string): boolean {
  return boatTypeId === requirement || (boatTypeId === "boat.trading_ship" && requirement === "boat.skiff");
}
