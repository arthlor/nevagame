// src/content/npcs.ts

import type { NpcId } from "../simulation/core/QuestTypes";
import { ASSET_IDS, type AssetId } from "../render/assets/AssetCatalog.generated";
import { HARBOR_MAEVE_ANCHOR, HARBOR_MARKET, HARBOR_SILAS_ANCHOR } from "../world/WorldAnchors";
import { SUNREACH_ANCHORS } from "../world/WorldIslands";

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
  recognitionDialogue?: Array<{
    id: string;
    requiresCompletedQuestIds?: string[];
    requiresFeatureIds?: string[];
    requiresKnowledgeIds?: string[];
    lines: string[];
  }>;
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
    ],
    recognitionDialogue: [
      {
        id: "dialogue.elspeth_land_sea_cycle",
        requiresKnowledgeIds: ["knowledge.land_sea_cycle"],
        lines: [
          "Barnaby showed me the page in your journal. Fish scraps in the field, grain back toward the water—that is a proper Neva cycle.",
          "The soil remembers what you return to it. Keep that field fed and it will keep feeding the harbor."
        ]
      }
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
    ],
    recognitionDialogue: [
      {
        id: "dialogue.barnaby_field_pump",
        requiresFeatureIds: ["feature.irrigation_zone"],
        lines: [
          "That pump is earning its keep. Wait for the field to need water, then let it handle the whole row at once.",
          "Good tools save steps; good farmers still decide when those steps matter."
        ]
      },
      {
        id: "dialogue.barnaby_land_sea_cycle",
        requiresKnowledgeIds: ["knowledge.land_sea_cycle"],
        lines: [
          "You've closed the loop now: harvest, bait, catch, scraps, soil. Nothing useful has to be wasted.",
          "That journal page is a method, not a trophy. Put it to work whenever the field runs lean."
        ]
      }
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
    ],
    recognitionDialogue: [
      {
        id: "dialogue.silas_first_expedition",
        requiresCompletedQuestIds: ["quest.act5_maiden_voyage"],
        lines: [
          "You brought the boat and the catch home together. Now every trip begins with a choice, not a lesson.",
          "Read the board, read the water, and leave room in the hold for the trip you actually plan to make."
        ]
      }
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
      "Trophy mackerel and tuna pay the quality multiplier on the harbor board. Ice them or the grade is wasted.",
      "Fair scales and cold ice—that's how we run the harbor trade."
    ],
    recognitionDialogue: [
      {
        id: "dialogue.maeve_contract_kept",
        requiresCompletedQuestIds: ["quest.act6_harbor_promise"],
        lines: [
          "You finished the order you chose. That matters more to this harbor than chasing the loudest price on the board.",
          "Keep one eye on the deadline and one on what your boat can really carry."
        ]
      }
    ]
  },
  {
    id: "npc.tomas",
    name: "Tomas",
    title: "Cove Boatkeeper",
    district: "Sunreach Cove",
    portraitIcon: "⛵",
    assetId: ASSET_IDS.CHAR_NPC_TOMAS_A,
    anchor: {
      x: SUNREACH_ANCHORS.coveMarket.x - 2.8,
      z: SUNREACH_ANCHORS.coveMarket.z + 2.2,
      rotationY: -Math.PI * 0.35,
      locationName: "Sunreach Cove Landing"
    },
    idleDialogue: [
      "The channel is calmest when the cove lies flat. Leave enough fuel for the crossing home.",
      "Tie up inside the marker buoys. The reef shelf begins just beyond them.",
      "Sunreach grows slowly, but nearly everything here has a second use."
    ]
  },
  {
    id: "npc.ines",
    name: "Ines",
    title: "Terrace Grower",
    district: "Sunreach Terraces",
    portraitIcon: "🫒",
    assetId: ASSET_IDS.CHAR_NPC_INES_A,
    anchor: {
      x: SUNREACH_ANCHORS.terraceFarm.x + 4.2,
      z: SUNREACH_ANCHORS.terraceFarm.z - 2.4,
      rotationY: Math.PI * 0.8,
      locationName: "Sunreach Cistern Terrace"
    },
    idleDialogue: [
      "These terraces hold water only when you give it to them carefully.",
      "Sunflowers turn quickly here. Olives take patience and a steady cistern.",
      "The dry wash tells you where the last rain went—and where the next one will vanish."
    ]
  }
];
