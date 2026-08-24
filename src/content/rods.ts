// src/content/rods.ts

import { RodDefinition } from "./types";

export const RODS: Record<string, RodDefinition> = {
  "rod.willow": {
    id: "rod.willow",
    name: "Willow Branch Rod",
    rodClass: "willow",
    reelPower: 12,
    maxSafeTension: 80,
    controlResponsiveness: 1.0,
    hookReliability: 0.85,
    allowedHabitats: ["river", "lake", "coast"],
    maximumCargoClass: "small",
    costMoney: 25
  },
  "rod.river": {
    id: "rod.river",
    name: "Reinforced River Rod",
    rodClass: "river",
    reelPower: 20,
    maxSafeTension: 85,
    controlResponsiveness: 1.2,
    hookReliability: 0.90,
    allowedHabitats: ["river", "lake", "coast"],
    maximumCargoClass: "medium",
    costMoney: 120
  },
  "rod.heavy_sport": {
    id: "rod.heavy_sport",
    name: "Heavy Sport Rod",
    rodClass: "heavy-sport",
    reelPower: 32,
    maxSafeTension: 90,
    controlResponsiveness: 1.4,
    hookReliability: 0.94,
    allowedHabitats: ["lake", "coast", "offshore"],
    maximumCargoClass: "large",
    costMoney: 380
  },
  "rod.offshore": {
    id: "rod.offshore",
    name: "Deep Offshore Rod",
    rodClass: "offshore",
    reelPower: 45,
    maxSafeTension: 92,
    controlResponsiveness: 1.6,
    hookReliability: 0.96,
    allowedHabitats: ["coast", "offshore"],
    maximumCargoClass: "large",
    costMoney: 950
  },
  "rod.master": {
    id: "rod.master",
    name: "Master Maritimer Rod",
    rodClass: "master",
    reelPower: 60,
    maxSafeTension: 95,
    controlResponsiveness: 2.0,
    hookReliability: 0.99,
    allowedHabitats: ["river", "lake", "coast", "offshore"],
    maximumCargoClass: "gargantuan",
    costMoney: 2500
  }
};
