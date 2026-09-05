// src/content/npcs.ts

import type { NpcId } from "../simulation/core/QuestTypes";
import type { SkillId } from "../simulation/core/types";
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
    /** Lets an NPC react to proficiency, the one axis they were blind to. */
    requiresRankIndex?: { skill: SkillId; rankIndex: number };
    lines: string[];
  }>;
}

export const NPCS: NpcDefinition[] = [
  {
    id: "npc.elspeth",
    name: "Elspeth",
    title: "Village Baker & Garden Elder",
    district: "Starter Farm & Village Edge",
    portraitIcon: "sprout",
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
      },
      {
        id: "dialogue.elspeth_skilled_farmer",
        requiresRankIndex: { skill: "farming", rankIndex: 2 },
        lines: [
          "You have stopped asking me when to water. That is the part nobody can teach you—you just start knowing.",
          "Mind the flax when it comes. It wants a different patience than wheat does."
        ]
      },
      {
        id: "dialogue.elspeth_homestead_worked",
        requiresCompletedQuestIds: ["quest.homestead_first_crop"],
        lines: [
          "The stall told me whose wheat that was before I could ask. Word travels fast when a plot comes back.",
          "Nobody has sold off those rows in years. It sounded strange and right at the same time."
        ]
      },
      {
        id: "dialogue.elspeth_family_ledger",
        requiresKnowledgeIds: ["knowledge.family_ledger"],
        lines: [
          "An apple off that tree. I did not honestly think I would see one.",
          "Your family planted the last orchard for people they never met. You have just done the same thing, and now you know what it feels like."
        ]
      },
      {
        id: "dialogue.elspeth_open_horizons",
        requiresKnowledgeIds: ["knowledge.open_horizons"],
        lines: [
          "Off you go, then. The garden gate will be here.",
          "Come back with something I have not tasted, and do not be a stranger about it."
        ]
      }
    ]
  },
  {
    id: "npc.barnaby",
    name: "Barnaby",
    title: "Homestead Handyman & Craftsman",
    district: "Starter Farmstead",
    portraitIcon: "pack",
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
      },
      {
        id: "dialogue.barnaby_worn_tools",
        requiresCompletedQuestIds: ["quest.homestead_worn_tools"],
        lines: [
          "You noticed the handle, then. Most people use that mill for a year and never look at it.",
          "Everything in this village is worn into the shape of whoever used it most. That is the only history we keep."
        ]
      },
      {
        id: "dialogue.barnaby_skilled_processing",
        requiresRankIndex: { skill: "processing", rankIndex: 2 },
        lines: [
          "You have got a rhythm at the bench now. Inputs staged, job running, hands free for the next thing.",
          "That is the difference between doing the work and running the work."
        ]
      },
      {
        id: "dialogue.barnaby_salt_and_shade",
        requiresKnowledgeIds: ["knowledge.salt_and_shade"],
        lines: [
          "Cured fish. Out of Sunreach, of all places, where they cannot keep water in the ground for a morning.",
          "That is the trick with a poor place. You stop asking what it lacks and start asking what it has too much of."
        ]
      }
    ]
  },
  {
    id: "npc.silas",
    name: "Old Silas",
    title: "Harbor Salt & Master Angler",
    district: "Neva Harbor Pier",
    portraitIcon: "anchor",
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
      },
      {
        id: "dialogue.silas_reading_the_water",
        requiresKnowledgeIds: ["knowledge.reading_the_water"],
        lines: [
          "River, lake, coast. You have hooked something in all of them now, in the right months, without me telling you which.",
          "Ask me where a fish lives and I will still answer. But you have stopped needing to ask."
        ]
      },
      {
        id: "dialogue.silas_master_angler",
        requiresRankIndex: { skill: "fishing", rankIndex: 4 },
        lines: [
          "There is not much left I can show you on a rod. That is not modesty, it is arithmetic.",
          "What is left is judgement, and judgement is only ever learned by going out on a day you were not sure about."
        ]
      },
      {
        id: "dialogue.silas_charter",
        requiresFeatureIds: ["feature.maritime_guild_charter"],
        lines: [
          "Signed, then. When I was your age that paper had four names on it and I was not one of them.",
          "It does not mean you are good. It means people will wait for you. Do not make them wait long."
        ]
      }
    ]
  },
  {
    id: "npc.maeve",
    name: "Maeve",
    title: "Fishmonger & Market Master",
    district: "Neva Fish Market",
    portraitIcon: "fish",
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
      },
      {
        id: "dialogue.maeve_freight_and_favour",
        requiresKnowledgeIds: ["knowledge.freight_and_favour"],
        lines: [
          "Volume, freshness, grade, distance. Four ways to be wrong and you have been right at all of them once.",
          "The board looks like prices. It is promises. You are the only one this season who has read it that way."
        ]
      },
      {
        id: "dialogue.maeve_cured_route",
        requiresCompletedQuestIds: ["quest.act8_route_worth_keeping"],
        lines: [
          "Cured fish off Sunreach, sold on this side of the channel. I had that written off as impossible cargo.",
          "It was never the distance. It was the clock, and you took the clock off it."
        ]
      },
      {
        id: "dialogue.maeve_charter",
        requiresFeatureIds: ["feature.maritime_guild_charter"],
        lines: [
          "Your name is on the charter and the table has one more slot with it.",
          "Use it for something you would have turned down last season. That is what the extra room is for."
        ]
      }
    ]
  },
  {
    id: "npc.tomas",
    name: "Tomas",
    title: "Cove Boatkeeper",
    district: "Sunreach Cove",
    portraitIcon: "boat",
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
    ],
    recognitionDialogue: [
      {
        id: "dialogue.tomas_reef_answer",
        requiresCompletedQuestIds: ["quest.act7_reef_answer"],
        lines: [
          "Chum you milled here, fish you took here, sold here while it was still cold. The whole thing inside one cove.",
          "That is how a small place feeds itself. Not by growing, by joining up."
        ]
      },
      {
        id: "dialogue.tomas_southern_shelf",
        requiresCompletedQuestIds: ["quest.act8_southern_shelf"],
        lines: [
          "You have been out to the shelf now. It is full, and it has always been full.",
          "We could see it from the ridge our whole lives. Seeing a thing and being able to use it are different problems."
        ]
      },
      {
        id: "dialogue.tomas_cured_route",
        requiresKnowledgeIds: ["knowledge.salt_and_shade"],
        lines: [
          "There is cured fish from this cove on a stall across the channel. I want you to understand how strange that is to me.",
          "My father lost more catch to that crossing than he ever sold. Same water. We just did not have the salt figured."
        ]
      }
    ]
  },
  {
    id: "npc.ines",
    name: "Ines",
    title: "Terrace Grower",
    district: "Sunreach Terraces",
    portraitIcon: "sprout",
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
    ],
    recognitionDialogue: [
      {
        id: "dialogue.ines_terrace_cycle",
        requiresCompletedQuestIds: ["quest.act7_land_sea_cycle"],
        lines: [
          "Cove fish into the terrace soil. You worked that out faster than I did, and I grew up on this hill.",
          "Everything here has to feed something else. There is not enough of anything for it to only do one job."
        ]
      },
      {
        id: "dialogue.ines_irrigation",
        requiresFeatureIds: ["feature.irrigation_zone"],
        lines: [
          "That pump of yours does in one pass what I do in a morning with two cans.",
          "I am not too proud about it. I am only sorry it took somebody from the other island to bring one across."
        ]
      },
      {
        id: "dialogue.ines_dry_season",
        requiresKnowledgeIds: ["knowledge.salt_and_shade"],
        lines: [
          "People come here and count what we are short of. You counted what we have too much of instead.",
          "Sun and wind and salt. Written down like that it sounds like nothing. It is a trade route."
        ]
      }
    ]
  }
];
