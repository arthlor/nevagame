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
    costMoney: 150
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
    requiredSkillXp: { skill: "fishing", xp: 15000 }
  }
};
