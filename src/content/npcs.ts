// src/content/npcs.ts

import type { NpcId } from "../simulation/core/QuestTypes";
import { ASSET_IDS, type AssetId } from "../render/assets/AssetCatalog.generated";
import { HARBOR_MAEVE_ANCHOR, HARBOR_MARKET, HARBOR_SILAS_ANCHOR } from "../world/WorldAnchors";

export interface NpcDefinition {
  id: NpcId;
  name: string;
  title: string;
  district: string;
  portraitIcon: string;
  assetId: AssetId;
  anchor: {
    x: number;
    z: number;
    rotationY: number;
    locationName: string;
  };
  idleDialogue: string[];
}

export const NPCS: NpcDefinition[] = [
  {
    id: "npc.elspeth",
    name: "Elspeth",
    title: "Village Baker & Garden Elder",
    district: "Starter Farm & Village Edge",
    portraitIcon: "🌾",
    assetId: ASSET_IDS.CHAR_NPC_ELSPETH_A,
    anchor: {
      x: -63.5,
      z: -62.0,
      rotationY: Math.PI * 0.15,
      locationName: "Starter Garden Gate"
    },
    idleDialogue: [
      "The soil here is rich and eager for seed. Keep your fields watered, and Neva will feed you well.",
      "Nothing beats the warmth of fresh-baked bread made from home-grown grain.",
      "The morning sun warms the furrows just right today."
    ]
  },
  {
    id: "npc.barnaby",
    name: "Barnaby",
    title: "Homestead Handyman & Craftsman",
    district: "Starter Farmstead",
    portraitIcon: "🪵",
    assetId: ASSET_IDS.CHAR_NPC_BARNABY_A,
    anchor: {
      x: -73.5,
      z: -58.8,
      rotationY: Math.PI * 0.75,
      locationName: "Farmhouse Workbench"
    },
    idleDialogue: [
      "Got some scraps? Throw 'em in the compost bin! Worms do the best work on this island.",
      "A sturdy bench and a handful of good grain can outfit any angler for sea.",
      "Always keep your tools sharp and your timber dry."
    ]
  },
  {
    id: "npc.silas",
    name: "Old Silas",
    title: "Harbor Salt & Master Angler",
    district: "Neva Harbor Pier",
    portraitIcon: "⚓",
    assetId: ASSET_IDS.CHAR_NPC_SILAS_A,
    anchor: {
      x: HARBOR_SILAS_ANCHOR.x,
      z: HARBOR_SILAS_ANCHOR.z,
      rotationY: -1.5708,
      locationName: "Harbor Pier"
    },
    idleDialogue: [
      "Check the tide and wind before casting, young one. The sea remembers every boat that leaves harbor.",
      "A good cedar skiff and a tight reel will take you further than all the gold in the market.",
      "Trout run thick in the estuary around midday."
    ]
  },
  {
    id: "npc.maeve",
    name: "Maeve",
    title: "Fishmonger & Market Master",
    district: "Neva Fish Market",
    portraitIcon: "🐟",
    assetId: ASSET_IDS.CHAR_NPC_MAEVE_A,
    anchor: {
      x: HARBOR_MAEVE_ANCHOR.x,
      z: HARBOR_MAEVE_ANCHOR.z,
      rotationY: HARBOR_MARKET.rotationY,
      locationName: "Fish Market Stall"
    },
    idleDialogue: [
      "Fresh catch always fetches top coin! Bring your fish in before the sun bakes 'em.",
      "Daily expedition contracts pay double for prize-grade mackerel and tuna.",
      "Fair scales and cold ice—that's how we run the harbor trade."
    ]
  }
];
