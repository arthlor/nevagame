import { TRADE_CRAFT_QUESTS } from "./questsTradeCraft";
import { VILLAGE_TRADE_QUESTS } from "./questsVillageTrade";
import { mainlandMarketTradePoint } from "../world/MainlandSettlementLayout";
import { MAINLAND_VILLAGES } from "../world/NevaMainland";
import { SUNREACH_OFFSET_X } from "../world/WorldIslands";
// src/content/quests.ts

import { ELSPETH_HOME_ANCHOR } from "./npcs";
import { MAIN_QUEST_TRACK_ID, type QuestDefinition } from "../simulation/core/QuestTypes";
import { HOMESTEAD_QUEST_TRACK_ID, TIDES_QUEST_TRACK_ID, TRADELANES_QUEST_TRACK_ID } from "./questTracks";
import { HARBOR_DOCK, HARBOR_FISH_TABLE, HARBOR_SILAS_ANCHOR, HARBOR_SKIFF_MOORING, VILLAGE_MARKET } from "../world/WorldAnchors";
import { starterStructureAnchor } from "../world/FarmLayout";
import { WorldLayout } from "../world/WorldLayout";
import { FISHING_ECOLOGY_DEFINITIONS, SUNREACH_ANCHORS, type FishingEcologyId } from "../world/WorldIslands";

const STARTER_FARM_ANCHOR = { x: -65, z: -55, name: "Starter Farm Field" } as const;
const STARTER_MILL = starterStructureAnchor("struct.starter_mill")!;
const WORKBENCH = starterStructureAnchor("struct.workbench")!;
const COMPOST_BIN = starterStructureAnchor("struct.starter_compost")!;
const BRIDGE = WorldLayout.landmark("bridge");
const VILLAGE_MARKET_ANCHOR = { ...VILLAGE_MARKET.position, name: "Village Produce Stall" } as const;
const HARBOR_MARKET = WorldLayout.landmark("fish-market");
/** Centre clearing of the shared beds, beyond the Commons entrance. */
const COMMONS_PLOT = { x: 82, z: -78, name: "Village Commons" };
const LAKE_SCHOOL_ANCHOR = { x: 18, z: WorldLayout.coastlineZ(18) + 12, name: "Lake Sport-Fishing School" } as const;
const SUNREACH_COVE = { ...SUNREACH_ANCHORS.coveMarket, name: "Sunreach Cove" } as const;
/** Guidance for a mainland counter follows the same stall-front point as the trade ring. */
function mainlandCounterAnchor(
  villageId: "pinewatch" | "reedhaven" | "highridge",
  name: string
): { x: number; z: number; name: string } {
  const point = mainlandMarketTradePoint(villageId);
  return { get x() { return point.x; }, get z() { return point.z; }, name };
}
const SUNREACH_TERRACES = { ...SUNREACH_ANCHORS.terraceFarm, name: "Sunreach Terraces" } as const;
/**
 * A fishing ground's anchor, read from the school spawn point that actually
 * holds its schools. Hand-copied coordinates drifted: the reef marker pointed at
 * empty water after the Sunreach shore migration moved the school.
 */
function schoolGround(
  ecologyId: FishingEcologyId,
  habitatId: "river" | "lake" | "coast" | "offshore",
  name: string,
  ordinal = 0
): { x: number; z: number; name: string } {
  const point = FISHING_ECOLOGY_DEFINITIONS[ecologyId].schoolSpawnPoints
    .filter((candidate) => candidate.habitatId === habitatId)[ordinal];
  if (!point) throw new Error(`No ${habitatId} school ground #${ordinal} in ${ecologyId}`);
  return { x: point.x, z: point.z, name };
}

const SUNREACH_REEF = schoolGround("ecology.sunreach", "coast", "Sunreach Reef Edge");
const SILVERWATER_RUN = schoolGround("ecology.neva", "river", "Silverwater River");
const NEVA_LAKE_GROUND = schoolGround("ecology.neva", "lake", "Neva Lake");
const NEVA_COAST_GROUND = schoolGround("ecology.neva", "coast", "Neva Coast");
const OFFSHORE_GROUNDS = schoolGround("ecology.neva", "offshore", "Past the Shelf");
const DEEP_TRENCH = schoolGround("ecology.neva", "offshore", "The Deep Trench", 1);

export const QUESTS: QuestDefinition[] = [
  // ==========================================
  // ACT 1: HOMESTEAD AWAKENING
  // ==========================================
  {
    id: "quest.act1_welcome",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act1_homestead",
    actTitle: "Act 1: Homestead Awakening",
    questTitle: "The Gate Is Yours",
    speakerId: "npc.elspeth",
    introDialogue: [
      "I kept the gate clear. The house and these beds are yours now.",
      "Your family always saved a little wheat for the next planting. Take these seeds; the prepared bed is just behind me."
    ],
    completionDialogue: [
      "Six seeds to start with. Plant three, and keep the rest for another row."
    ],
    objectives: [
      {
        id: "step.act1_welcome_talk",
        type: "talk-npc",
        description: "Talk to Elspeth in the farmhouse yard",
        targetId: "npc.elspeth",
        targetQuantity: 1,
        locationAnchor: { x: ELSPETH_HOME_ANCHOR.x, z: ELSPETH_HOME_ANCHOR.z, name: ELSPETH_HOME_ANCHOR.locationName }

      }
    ],
    rewards: {
      items: [{ itemId: "seed.wheat", quantity: 6 }],
      skillXp: [{ skill: "farming", xp: 100 }]
    },
    nextQuestId: "quest.act1_sow_wheat"
  },
  {
    id: "quest.act1_sow_wheat",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act1_homestead",
    actTitle: "Act 1: Homestead Awakening",
    questTitle: "Three Seeds In",
    speakerId: "npc.elspeth",
    introDialogue: [
      "Plant three wheat in the prepared bed. Leave a little room between them; we'll be walking these rows with a watering can."
    ],
    completionDialogue: [
      "There. A small row, but it's yours. Give each planting some water."
    ],
    objectives: [
      {
        id: "step.act1_sow_3_wheat",
        type: "plant-crop",
        description: "Plant 3 wheat in the prepared bed",
        targetId: "crop.wheat",
        targetQuantity: 3,
        locationAnchor: STARTER_FARM_ANCHOR,
        location: { kind: "farm", id: "farm.starter_garden" },
        creditsEarlyActions: true
      }
    ],
    rewards: {
      money: 25,
      skillXp: [{ skill: "farming", xp: 200 }]
    },
    nextQuestId: "quest.act1_water_crops"
  },
  {
    id: "quest.act1_water_crops",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act1_homestead",
    actTitle: "Act 1: Homestead Awakening",
    questTitle: "Before the Crust",
    speakerId: "npc.elspeth",
    introDialogue: [
      "Water each of your three plantings. Stop when the soil turns dark; that's enough for the roots."
    ],
    completionDialogue: [
      // ONBOARDING_PACE ripens this first bed in a few real minutes; the line
      // used to promise "a morning" and a rest the farmhouse refuses by day.
      "That will do. This first bed grows quickly; harvest when the heads turn gold.",
      "Barnaby can help you put the leftovers to work. You'll find the compost bin beside the house."
    ],
    objectives: [
      {
        id: "step.act1_water_3_crops",
        type: "water-crop",
        description: "Water your crops 3 times",
        targetQuantity: 3,
        locationAnchor: STARTER_FARM_ANCHOR,
        location: { kind: "farm", id: "farm.starter_garden" },
        // A watered crop cannot be watered again until its moisture decays, so
        // without banking, watering during the sow step makes this unsatisfiable.
        creditsEarlyActions: true
      }
    ],
    rewards: {
      money: 35,
      skillXp: [{ skill: "farming", xp: 300 }]
    },
    nextQuestId: "quest.act2_harvest_and_compost"
  },

  // ==========================================
  // ACT 2: FROM GRAIN TO BAIT
  // ==========================================
  {
    id: "quest.act2_harvest_and_compost",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act2_processing",
    actTitle: "Act 2: From Grain to Bait",
    questTitle: "The Cycle of the Soil",
    speakerId: "npc.barnaby",
    introDialogue: [
      "I'm Barnaby. I mend the tools here. You look after the grain, and I'll help you make use of what remains.",
      "Harvest three ripe wheat plants. Then put plant matter and compost starter in the bin and collect the bait worms when they're ready. Meet me at the farmhouse workbench."
    ],
    completionDialogue: [
      "Grain for the mill, worms for the water. Nothing from this bed needs to go to waste."
    ],
    objectives: [
      {
        id: "step.act2_harvest_3_wheat",
        type: "harvest-crop",
        description: "Harvest 3 mature Wheat crops",
        targetId: "crop.wheat",
        targetQuantity: 3,
        locationAnchor: STARTER_FARM_ANCHOR,
        location: { kind: "farm", id: "farm.starter_garden" },
        // Wheat can ripen before this quest is turned in; a harvested crop is gone.
        creditsEarlyActions: true
      },
      {
        id: "step.act2_compost_worms",
        type: "craft-recipe",
        description: "Cultivate Bait Worms at the Compost Bin",
        targetId: "recipe.compost_worms",
        targetQuantity: 1,
        locationAnchor: { x: COMPOST_BIN.x, z: COMPOST_BIN.z, name: "Starter Compost Bin" },
        location: { kind: "station", id: "struct.starter_compost" },
        // Starting stock is exactly two runs of this recipe and compost starter
        // is purchase-only, so running it early without banking is a softlock.
        creditsEarlyActions: true
      }
    ],
    rewards: {
      items: [{ itemId: "item.bait_worms", quantity: 6 }],
      skillXp: [{ skill: "farming", xp: 200 }, { skill: "processing", xp: 150 }],
      unlocksKnowledgeIds: ["knowledge.worm_composting"]
    },
    nextQuestId: "quest.act2_mill_and_craft_chum"
  },
  {
    id: "quest.act2_mill_and_craft_chum",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act2_processing",
    actTitle: "Act 2: From Grain to Bait",
    questTitle: "Milling & Mixing Chum",
    speakerId: "npc.barnaby",
    introDialogue: [
      "Grind your wheat at the village mill. Bring the Ground Grain and Bait Worms back to my workbench, and we’ll mix a Chum Bucket.",
      "A little food on the water brings a school within reach. Silas will show you what to do when it arrives."
    ],
    completionDialogue: [
      "That will do. Keep the bucket for a school; take a few worms down to the river first."
    ],
    objectives: [
      {
        id: "step.act2_mill_grain",
        type: "craft-recipe",
        description: "Grind Wheat into Ground Grain at the village mill",
        targetId: "recipe.wheat_to_grain",
        targetQuantity: 1,
        locationAnchor: { x: STARTER_MILL.x, z: STARTER_MILL.z, name: "Village Mill" },
        location: { kind: "station", id: "struct.starter_mill" }
      },
      {
        id: "step.act2_craft_chum",
        type: "craft-recipe",
        description: "Craft a Chum Bucket at the Workbench",
        targetId: "recipe.craft_chum",
        targetQuantity: 1,
        locationAnchor: { x: WORKBENCH.x, z: WORKBENCH.z, name: "Farmhouse Workbench" },
        location: { kind: "station", id: "struct.workbench" }

      }
    ],
    rewards: {
      money: 50,
      items: [{ itemId: "item.bait_worms", quantity: 4 }],
      skillXp: [{ skill: "processing", xp: 350 }],
      unlocksKnowledgeIds: ["knowledge.wheat_milling"]
    },
    nextQuestId: "quest.act3_river_angler"
  },

  // ==========================================
  // ACT 3: THE RIVER'S WHISPERS
  // ==========================================
  {
    id: "quest.act3_river_angler",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act3_river",
    actTitle: "Act 3: The River's Whispers",
    questTitle: "Reading the Currents",
    speakerId: "npc.silas",
    introDialogue: [
      "I’m Silas. Your family used to fish below that timber bridge. Let’s see what the river gives you.",
      "Catch two freshwater fish there. When the float dips, strike, then keep the fish inside the catching bar."
    ],
    completionDialogue: [
      "Two fish from the old spot. Keep that steady hand; you’ll need it when we take the boat out."
    ],
    objectives: [
      {
        id: "step.act3_catch_2_river_fish",
        type: "catch-basic-fish",
        description: "Catch 2 freshwater fish in the River Corridor",
        targetQuantity: 2,
        locationAnchor: { x: BRIDGE.x, z: BRIDGE.z, name: "River Corridor Bridge" },
        location: { kind: "habitat", id: "river" }
      }
    ],
    rewards: {
      items: [{ itemId: "seed.wheat", quantity: 6 }],
      skillXp: [{ skill: "fishing", xp: 400 }]
    },
    nextQuestId: "quest.act3_market_intro"
  },
  {
    id: "quest.act3_market_intro",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act3_river",
    actTitle: "Act 3: The River's Whispers",
    questTitle: "Fair Trade at the Village",
    speakerId: "npc.elspeth",
    introDialogue: [
      "Keep what you need for the next planting, then take a little produce to the stall on the village square. Your first harvest can pay for the next."
    ],
    completionDialogue: [
      "Your own harvest paid its way. Maeve keeps the fish market down at the harbor; go and introduce yourself."
    ],
    objectives: [
      {
        id: "step.act3_sell_item_village",
        type: "sell-item",
        description: "Sell an item at the Village Produce Market",
        targetQuantity: 1,
        locationAnchor: VILLAGE_MARKET_ANCHOR,
        location: { kind: "market", id: "market.village" }
      }
    ],
    rewards: {
      money: 75,
      skillXp: [{ skill: "trading", xp: 300 }]
    },
    nextQuestId: "quest.act4_harbor_journey"
  },

  // ==========================================
  // ACT 4: THE HARBOR CALL & THE OLD SKIFF
  // ==========================================
  {
    id: "quest.act4_harbor_journey",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act4_harbor",
    actTitle: "Act 4: The Harbor Call",
    questTitle: "Journey to the Salt",
    speakerId: "npc.maeve",
    introDialogue: [
      "Maeve. I buy the catch here and keep the delivery ledger. Before you sail, know where your fish is going.",
      "Ordinary catches come to the Fish Market. A large fish pack must be carried to a village trade counter, unless you’ve accepted a contract for it elsewhere. Freshness falls on the journey."
    ],
    completionDialogue: [
      "Silas has kept your family’s rowboat at the slip. Find him at the pier before you plan that first trip."
    ],
    objectives: [
      {
        id: "step.act4_talk_maeve",
        type: "talk-npc",
        description: "Speak with Maeve at the Harbor Fish Market",
        targetId: "npc.maeve",
        targetQuantity: 1,
        locationAnchor: { x: HARBOR_MARKET.x, z: HARBOR_MARKET.z, name: "Harbor Fish Market" }
      }
    ],
    rewards: {
      money: 40,
      skillXp: [{ skill: "trading", xp: 200 }]
    },
    nextQuestId: "quest.act4_restore_rowboat"
  },
  {
    id: "quest.act4_restore_rowboat",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act4_harbor",
    actTitle: "Act 4: The Harbor Call",
    questTitle: "Commissioning the Old Rowboat",
    speakerId: "npc.silas",
    introDialogue: [
      "Your family’s rowboat is still at the slip. Sound cedar, even after all this time.",
      "Bring 30 gold for her permit and one Ground Grain for the oarlock grease. I’ll get her ready."
    ],
    completionDialogue: [
      "She’s yours to take out. I’ve added two Woven Lures; prepare one before you hook a school fish. Board at the wooden slip."
    ],
    objectives: [
      {
        id: "step.act4_restore_rowboat_silas",
        type: "talk-npc",
        description: "Commission your family rowboat with Silas at the pier",
        targetId: "npc.silas",
        targetQuantity: 1,
        locationAnchor: { x: HARBOR_SILAS_ANCHOR.x, z: HARBOR_SILAS_ANCHOR.z, name: "Southeast Harbor Pier" }
      }
    ],
    turnInCost: {
      money: 30,
      items: [{ itemId: "item.ground_grain", quantity: 1 }]
    },
    rewards: {
      items: [{ itemId: "item.basic_lure", quantity: 2 }],
      unlocksFeatureIds: ["boat.player_rowboat"],
      skillXp: [{ skill: "fishing", xp: 350 }],
      unlocksKnowledgeIds: ["knowledge.family_slip"]
    },
    nextQuestId: "quest.act5_maiden_voyage"
  },

  // ==========================================
  // ACT 5: THE MAIDEN MARITIME EXPEDITION
  // ==========================================
  {
    id: "quest.act5_maiden_voyage",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act5_expedition",
    actTitle: "Act 5: The Maiden Expedition",
    questTitle: "The Call of the Deep",
    speakerId: "npc.silas",
    introDialogue: [
      "Take the rowboat, chum and a Woven Lure to the marked lake school. Scatter the chum, prepare the lure, then hook a fish.",
      "Reel while the line allows it; ease off when it strains. Bring the catch aboard, return to the harbor, and carry the pack to the Village Trade Center. Come back and tell me how it went."
    ],
    completionDialogue: [
      "Your family’s boat brought a catch home again. I was hoping I’d see that.",
      "You can take orders from the Expedition Board now. Choose one you can bring back in time."
    ],
    objectives: [
      {
        id: "step.act5_board_rowboat",
        type: "board-boat",
        description: "Board your rowboat at the Harbor Slip",
        targetId: "boat.player_rowboat",
        targetQuantity: 1,
        locationAnchor: { x: HARBOR_DOCK.boatPosition.x, z: HARBOR_DOCK.boatPosition.z, name: "Harbor Boat Slip" },
        location: { kind: "boat", id: "boat.player_rowboat" }
      },
      {
        id: "step.act5_chum_school",
        type: "chum-school",
        description: "Chum the first lake sport-fishing school",
        targetQuantity: 1,
        locationAnchor: LAKE_SCHOOL_ANCHOR,
        location: { kind: "habitat", id: "lake" }
      },
      {
        id: "step.act5_hook_sport_fish",
        type: "hook-sport-fish",
        description: "Arm a Woven Lure and hook a fish in the chummed school",
        targetQuantity: 1,
        locationAnchor: LAKE_SCHOOL_ANCHOR,
        location: { kind: "habitat", id: "lake" }
      },
      {
        id: "step.act5_land_sport_fish",
        type: "land-sport-fish",
        description: "Successfully land a Sport Fish through tension control",
        targetQuantity: 1
      },
      {
        id: "step.act5_stow_cargo",
        type: "stow-cargo",
        description: "Stow the caught sport fish in your boat cargo hold or carry it ashore",
        targetQuantity: 1,
        locationAnchor: { x: HARBOR_DOCK.boatPosition.x, z: HARBOR_DOCK.boatPosition.z, name: "Rowboat Cargo Hold" }
      },
      {
        id: "step.act5_dock_rowboat",
        type: "dock-boat",
        description: "Return the rowboat to the Harbor Dock",
        targetId: "boat.player_rowboat",
        targetQuantity: 1,
        locationAnchor: { x: HARBOR_DOCK.boatPosition.x, z: HARBOR_DOCK.boatPosition.z, name: "Harbor Dock" },
        location: { kind: "market", id: "market.harbor" }
      },
      {
        id: "step.act5_sell_fish",
        type: "sell-fish",
        description: "Collect the trade pack from your docked boat and sell it at the Village Trade Center",
        targetQuantity: 1,
        locationAnchor: VILLAGE_MARKET_ANCHOR,
        location: { kind: "market", id: "market.village" }
      },
      {
        id: "step.act5_return_to_silas",
        type: "talk-npc",
        description: "Report your first expedition to Silas",
        targetId: "npc.silas",
        targetQuantity: 1,
        locationAnchor: { x: HARBOR_SILAS_ANCHOR.x, z: HARBOR_SILAS_ANCHOR.z, name: "Harbor Pier" }
      }
    ],

    rewards: {
      money: 250,
      skillXp: [
        { skill: "fishing", xp: 1000 },
        { skill: "trading", xp: 600 },
        { skill: "farming", xp: 400 }
      ],
      unlocksFeatureIds: ["feature.expedition_planner"],
      unlocksKnowledgeIds: ["knowledge.first_expedition_cycle"]
    },
    nextQuestId: "quest.act6_harbor_promise"
  },

  // ==========================================
  // ACT 6: STEWARDSHIP
  // ==========================================
  {
    id: "quest.act6_harbor_promise",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act6_stewardship",
    actTitle: "Act 6: Stewardship",
    questTitle: "A Promise Made at the Board",
    speakerId: "npc.maeve",
    introDialogue: [
      "Someone is waiting at the other end of every order. Pick one from the Expedition Board, check its deadline and destination, and deliver what it asks for."
    ],
    completionDialogue: [
      "Delivered as promised. Here’s your pay, and some clean fish scraps for Barnaby. He’s been asking how your field is doing."
    ],
    objectives: [
      {
        id: "step.act6_complete_contract",
        type: "complete-contract",
        description: "Complete a feasible Expedition Board contract before its deadline",
        targetQuantity: 1,
        locationAnchor: { x: HARBOR_MARKET.x, z: HARBOR_MARKET.z, name: "Expedition Board" }
      }
    ],
    rewards: {
      money: 150,
      items: [{ itemId: "item.fish_scraps", quantity: 3 }],
      skillXp: [{ skill: "trading", xp: 450 }, { skill: "fishing", xp: 300 }]
    },
    nextQuestId: "quest.act6_field_pump"
  },
  {
    id: "quest.act6_field_pump",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act6_stewardship",
    actTitle: "Act 6: Stewardship",
    questTitle: "Water Where It Matters",
    speakerId: "npc.barnaby",
    introDialogue: [
      "Carrying water row by row takes most of a morning. Fit a pump at the starter-farm well, then run it for the field. Maeve’s payment will cover the parts."
    ],
    completionDialogue: [
      "That should spare you a few trips to the well. Now take those fish scraps to the harbor table; we can make something for the soil."
    ],
    objectives: [
      {
        id: "step.act6_install_irrigation",
        type: "install-irrigation",
        description: "Install the field pump at the Starter Farm well",
        targetId: "feature.irrigation_zone",
        targetQuantity: 1,
        locationAnchor: STARTER_FARM_ANCHOR,
        location: { kind: "farm", id: "farm.starter_garden" }
      },
      {
        id: "step.act6_irrigate_farm",
        type: "irrigate-farm",
        description: "Use the field pump to irrigate the Starter Farm",
        targetId: "farm.starter_garden",
        targetQuantity: 1,
        locationAnchor: STARTER_FARM_ANCHOR,
        location: { kind: "farm", id: "farm.starter_garden" }
      }
    ],
    rewards: {
      skillXp: [{ skill: "farming", xp: 550 }]
    },
    nextQuestId: "quest.act6_land_sea_cycle"
  },
  {
    id: "quest.act6_land_sea_cycle",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act6_stewardship",
    actTitle: "Act 6: Stewardship",
    questTitle: "The Land-Sea Cycle",
    speakerId: "npc.barnaby",
    introDialogue: [
      "Make fertilizer from Maeve’s scraps at the Harbor Fish Table, then work it into the starter field. No sense throwing away what the soil can use."
    ],
    completionDialogue: [
      "That will feed the next crop. I’ve put the method in your journal.",
      "Silas was asking for you at the pier. He has news from across the channel."
    ],
    objectives: [
      {
        id: "step.act6_craft_fertilizer",
        type: "craft-recipe",
        description: "Make fertilizer from Fish Scraps at the Harbor Fish Table",
        targetId: "recipe.fish_to_fertilizer",
        targetQuantity: 1,
        locationAnchor: { x: HARBOR_FISH_TABLE.position.x, z: HARBOR_FISH_TABLE.position.z, name: "Harbor Fish Table" },
        location: { kind: "station", id: "struct.harbor_fish_table" }
      },
      {
        id: "step.act6_fertilize_farm",
        type: "apply-fertilizer",
        description: "Fertilize the Starter Farm soil",
        targetId: "farm.starter_garden",
        targetQuantity: 1,
        locationAnchor: STARTER_FARM_ANCHOR,
        location: { kind: "farm", id: "farm.starter_garden" }
      }
    ],
    rewards: {
      skillXp: [{ skill: "farming", xp: 650 }, { skill: "processing", xp: 450 }, { skill: "fishing", xp: 350 }],
      unlocksKnowledgeIds: ["knowledge.land_sea_cycle"]
    },
    nextQuestId: "quest.act7_open_channel"
  },

  {
    id: "quest.act7_open_channel",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act7_sunreach",
    actTitle: "Act 7: Sunreach",
    questTitle: "Across the Open Channel",
    speakerId: "npc.tomas",
    // Tomas lives across a channel the player has no boat for, so his intro
    // could only ever be heard after the crossing it described. Silas — who
    // keeps the seamanship threshold — sets the errand up instead, and Tomas
    // greets the player when they arrive.
    herald: {
      npcId: "npc.silas",
      lines: [
        "Tomas sent word from Sunreach. To reach him, you’ll need the Coastal Fishing Skiff at the harbor mooring. The broker asks for gold and an Expert angler’s experience.",
        "Keep fishing and taking orders until you’re ready. Then follow the buoys east, dock inside Sunreach Cove, and find Tomas at the market."
      ]
    },
    introDialogue: [
      "Tie up inside the markers and come ashore. Silas said you might make the crossing."
    ],
    completionDialogue: [
      "Welcome to Sunreach. Take these sunflower seeds to Ines on the terraces above the cove. She can show you where they’ll take root."
    ],
    objectives: [
      {
        id: "step.act7_own_skiff",
        type: "purchase-upgrade",
        description: "Own the Coastal Fishing Skiff",
        targetId: "boat.skiff",
        targetQuantity: 1,
        locationAnchor: { x: HARBOR_SKIFF_MOORING.playerPosition.x, z: HARBOR_SKIFF_MOORING.playerPosition.z, name: "Harbor Skiff Mooring" }
      },
      {
        id: "step.act7_board_skiff",
        type: "board-boat",
        description: "Board the Coastal Fishing Skiff",
        targetId: "boat.player_skiff",
        targetQuantity: 1,
        location: { kind: "boat", id: "boat.player_skiff" }
      },
      {
        id: "step.act7_dock_sunreach",
        type: "dock-boat",
        description: "Cross the channel and dock at Sunreach Cove",
        targetId: "boat.player_skiff",
        targetQuantity: 1,
        locationAnchor: { x: SUNREACH_ANCHORS.dockBoat.x, z: SUNREACH_ANCHORS.dockBoat.z, name: "Sunreach Cove Mooring" },
        location: { kind: "market", id: "market.sunreach_cove" }
      },
      {
        id: "step.act7_meet_tomas",
        type: "talk-npc",
        description: "Speak with Tomas at the cove market",
        targetId: "npc.tomas",
        targetQuantity: 1,
        locationAnchor: SUNREACH_COVE
      }
    ],
    rewards: {
      items: [{ itemId: "seed.sunflower", quantity: 6 }],
      skillXp: [{ skill: "trading", xp: 500 }, { skill: "fishing", xp: 500 }]
    },
    nextQuestId: "quest.act7_terraces_for_the_sun"
  },
  {
    id: "quest.act7_terraces_for_the_sun",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act7_sunreach",
    actTitle: "Act 7: Sunreach",
    questTitle: "Terraces for the Sun",
    speakerId: "npc.ines",
    introDialogue: [
      "Tomas sent you? I’m Ines. These stone walls hold the soil, but the sun takes its water quickly. Plant three sunflowers, water them, and harvest a head when it’s ready."
    ],
    completionDialogue: [
      "A good first head. Take the seed down to Tomas; he uses some for the reef. This olive sapling is yours to plant."
    ],
    objectives: [
      { id: "step.act7_meet_ines", type: "talk-npc", description: "Meet Ines at the terraces", targetId: "npc.ines", targetQuantity: 1, locationAnchor: SUNREACH_TERRACES },
      { id: "step.act7_plant_sunflowers", type: "plant-crop", description: "Plant 3 Sunflowers on the terraces", targetId: "crop.sunflower", targetQuantity: 3, locationAnchor: SUNREACH_TERRACES, location: { kind: "farm", id: "farm.sunreach_terraces" } },
      { id: "step.act7_water_sunflowers", type: "water-crop", description: "Water the 3 Sunflowers", targetQuantity: 3, locationAnchor: SUNREACH_TERRACES, location: { kind: "farm", id: "farm.sunreach_terraces" } },
      { id: "step.act7_harvest_sunflower", type: "harvest-crop", description: "Harvest a mature Sunflower", targetId: "crop.sunflower", targetQuantity: 1, locationAnchor: SUNREACH_TERRACES, location: { kind: "farm", id: "farm.sunreach_terraces" } }
    ],
    rewards: { items: [{ itemId: "seed.olive_sapling", quantity: 1 }], skillXp: [{ skill: "farming", xp: 800 }] },
    nextQuestId: "quest.act7_seed_for_the_sea"
  },
  {
    id: "quest.act7_seed_for_the_sea",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act7_sunreach",
    actTitle: "Act 7: Sunreach",
    questTitle: "Seed for the Sea",
    speakerId: "npc.tomas",
    introDialogue: [
      "Ines grows most of what goes into my chum. Grind the sunflower seed at our hand mill, then mix a bucket at the cove workbench."
    ],
    completionDialogue: [
      "Keep that bucket aboard. There’s a school along the reef edge, just where the shelf drops away."
    ],
    objectives: [
      { id: "step.act7_mill_sunflower", type: "craft-recipe", description: "Mill Sunflower Seed into Ground Grain", targetId: "recipe.sunflower_to_grain", targetQuantity: 1, locationAnchor: { x: 444 + SUNREACH_OFFSET_X, z: 21, name: "Sunreach Hand Mill" }, location: { kind: "station", id: "struct.sunreach_hand_mill" } },
      { id: "step.act7_craft_sunreach_chum", type: "craft-recipe", description: "Craft Chum at the Sunreach Workbench", targetId: "recipe.craft_chum", targetQuantity: 1, locationAnchor: { x: 466 + SUNREACH_OFFSET_X, z: 17, name: "Sunreach Workbench" }, location: { kind: "station", id: "struct.sunreach_workbench" } }
    ],
    rewards: { items: [{ itemId: "item.bait_worms", quantity: 6 }], skillXp: [{ skill: "processing", xp: 700 }] },
    nextQuestId: "quest.act7_reef_answer"
  },
  {
    id: "quest.act7_reef_answer",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act7_sunreach",
    actTitle: "Act 7: Sunreach",
    questTitle: "The Reef's Answer",
    speakerId: "npc.tomas",
    introDialogue: [
      "Take the skiff to the reef edge and chum the school. Catch a Golden Sea Bream from the deck.",
      "Stow it for the crossing, then carry its pack from the harbor to the Village Trade Center. That inland journey counts against its freshness too."
    ],
    completionDialogue: [
      "A reef catch made it to the village table. Ines will want the scraps from your next catch; her terraces could use them."
    ],
    objectives: [
      { id: "step.act7_chum_sunreach", type: "chum-school", description: "Chum the school at the Sunreach reef edge", targetQuantity: 1, locationAnchor: SUNREACH_REEF, location: { kind: "ecology", id: "ecology.sunreach" } },
      { id: "step.act7_land_bream", type: "catch-basic-fish", description: "Land a Golden Sea Bream in Sunreach waters", targetId: "fish.sea_bream", targetQuantity: 1, locationAnchor: SUNREACH_REEF, location: { kind: "ecology", id: "ecology.sunreach" } },
      // One bream landed from the skiff closes this and the step above
      // together; a shore-caught first bream leaves this one to the deck.
      { id: "step.act7_stow_bream", type: "catch-basic-fish", description: "Land a Sea Bream from the deck of your skiff", targetId: "fish.sea_bream", targetQuantity: 1, locationAnchor: SUNREACH_REEF, location: { kind: "boat", id: "boat.player_skiff" } },
      { id: "step.act7_sell_bream", type: "sell-fish", description: "Collect the Sea Bream pack and sell it at the Village Trade Center", targetId: "fish.sea_bream", targetQuantity: 1, locationAnchor: VILLAGE_MARKET_ANCHOR, location: { kind: "market", id: "market.village" } }
    ],
    rewards: { money: 240, skillXp: [{ skill: "fishing", xp: 900 }, { skill: "trading", xp: 500 }] },
    nextQuestId: "quest.act7_land_sea_cycle"
  },
  {
    id: "quest.act7_land_sea_cycle",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act7_sunreach",
    actTitle: "Act 7: Sunreach",
    questTitle: "The Sunreach Land-Sea Cycle",
    speakerId: "npc.ines",
    introDialogue: [
      "Catch two sardines in the cove and clean them at our fish table. Press three scraps into fertilizer, work it into these terraces, then come back to me."
    ],
    completionDialogue: [
      "This soil has very little to spare. What you brought back will help the next planting. Stay a while; we have more work before the dry weather settles in."
    ],
    objectives: [
      // One sardine cleans into 2 scraps and fertilizer takes 3, so the cycle
      // needs two. Cleaning is the only route to those scraps, so the tracked
      // step is the press; the step count stays fixed because saves store the
      // active step by index.
      { id: "step.act7_catch_sardine", type: "catch-basic-fish", description: "Catch two Sunreach Sardines in the cove", targetId: "fish.sardine", targetQuantity: 2, locationAnchor: SUNREACH_COVE, location: { kind: "ecology", id: "ecology.sunreach" } },
      { id: "step.act7_press_fertilizer", type: "craft-recipe", description: "Clean the Sardines, then press Fish Scraps into Fertilizer", targetId: "recipe.fish_to_fertilizer", targetQuantity: 1, locationAnchor: { x: 382 + SUNREACH_OFFSET_X, z: 61, name: "Sunreach Fish Table" }, location: { kind: "station", id: "struct.sunreach_fish_table" } },
      { id: "step.act7_fertilize_terraces", type: "apply-fertilizer", description: "Fertilize the Sunreach Terraces", targetId: "farm.sunreach_terraces", targetQuantity: 1, locationAnchor: SUNREACH_TERRACES, location: { kind: "farm", id: "farm.sunreach_terraces" } },
      { id: "step.act7_report_ines", type: "talk-npc", description: "Report back to Ines", targetId: "npc.ines", targetQuantity: 1, locationAnchor: SUNREACH_TERRACES }
    ],
    rewards: { money: 300, skillXp: [{ skill: "farming", xp: 900 }, { skill: "processing", xp: 650 }] },
    nextQuestId: "quest.act8_dry_season"
  },

  // ===========================================================================
  // Side track: Reading the Water (track.tides)
  //
  // Silas's standing lesson. Every season-, hour- and weather-conditional
  // objective in the game lives on this chain rather than the spine, so a
  // player waiting on winter pike is never blocked from the story. The
  // conditions are not authored as objective predicates — the ecology already
  // gates which species a school can roll, so "land a pike" *is* the seasonal
  // objective, expressed entirely in existing machinery.
  // ===========================================================================
  {
    id: "quest.tides_home_water",
    trackId: TIDES_QUEST_TRACK_ID,
    actId: "track_tides",
    actTitle: "Reading the Water",
    questTitle: "The Water You Started In",
    speakerId: "npc.silas",
    introDialogue: [
      "Let’s go back to the river below the bridge. Chum a school in Silverwater, hook a Rainbow Trout, and bring it in. There’s more to that first fishing spot than you saw from the bank."
    ],
    completionDialogue: [
      "Still a quick little fish, even with better tackle. Remember this stretch when the sea keeps you ashore."
    ],
    objectives: [
      {
        id: "step.tides_chum_river",
        type: "chum-school",
        description: "Chum a school in the river",
        targetQuantity: 1,
        locationAnchor: SILVERWATER_RUN,
        location: { kind: "habitat", id: "river" }
      },
      {
        id: "step.tides_hook_river",
        type: "hook-sport-fish",
        description: "Hook a Rainbow Trout in the river",
        targetId: "fish.trout",
        targetQuantity: 1,
        locationAnchor: SILVERWATER_RUN,
        location: { kind: "habitat", id: "river" }
      },
      {
        id: "step.tides_land_river",
        type: "land-sport-fish",
        description: "Land the trout",
        targetId: "fish.trout",
        targetQuantity: 1,
        locationAnchor: SILVERWATER_RUN
      }
    ],
    rewards: { money: 60, skillXp: [{ skill: "fishing", xp: 350 }] },
    nextQuestId: "quest.tides_deep_channel"
  },
  {
    id: "quest.tides_deep_channel",
    trackId: TIDES_QUEST_TRACK_ID,
    actId: "track_tides",
    actTitle: "Reading the Water",
    questTitle: "The Deep Channel",
    speakerId: "npc.silas",
    introDialogue: [
      "A Channel Catfish holds in the deeper river water. Bring tackle that can lift its weight, and take your time with it. I’d like to see one on your line."
    ],
    completionDialogue: [
      "There it is. A different sort of patience from the trout, isn’t it? Let the rod work before you ask for more line."
    ],
    objectives: [
      {
        id: "step.tides_land_catfish",
        type: "land-sport-fish",
        description: "Land a Channel Catfish",
        targetId: "fish.catfish",
        targetQuantity: 1,
        locationAnchor: SILVERWATER_RUN
      }
    ],
    rewards: { money: 110, skillXp: [{ skill: "fishing", xp: 500 }] },
    nextQuestId: "quest.tides_cold_teeth"
  },
  {
    id: "quest.tides_cold_teeth",
    trackId: TIDES_QUEST_TRACK_ID,
    actId: "track_tides",
    actTitle: "Reading the Water",
    questTitle: "Cold Water Teeth",
    speakerId: "npc.silas",
    introDialogue: [
      "Try the lake for a Northern Pike. Check its season in the Almanac before you set out; some days are better spent mending tackle."
    ],
    completionDialogue: [
      "Look at those teeth. I’ve lost more lures to pike than I care to count. You kept yours long enough."
    ],
    objectives: [
      {
        id: "step.tides_land_pike",
        type: "land-sport-fish",
        description: "Land a Northern Pike from the lake",
        targetId: "fish.pike",
        targetQuantity: 1,
        locationAnchor: NEVA_LAKE_GROUND
      }
    ],
    rewards: { money: 150, skillXp: [{ skill: "fishing", xp: 650 }] },
    nextQuestId: "quest.tides_summer_gold"
  },
  {
    id: "quest.tides_summer_gold",
    trackId: TIDES_QUEST_TRACK_ID,
    actId: "track_tides",
    actTitle: "Reading the Water",
    questTitle: "Summer Gold",
    speakerId: "npc.silas",
    introDialogue: [
      "I once saw a Golden Arowana turn under the evening light. Thought someone had dropped a coin in the lake.",
      "Look for one in its summer run. Take Heavy Sport tackle or better, and check the Almanac before you go."
    ],
    completionDialogue: [
      "That colour never quite stays in a drawing. Now you’ve seen it for yourself."
    ],
    objectives: [
      {
        id: "step.tides_land_arowana",
        type: "land-sport-fish",
        description: "Land a Golden Arowana",
        targetId: "fish.arowana",
        targetQuantity: 1,
        locationAnchor: NEVA_LAKE_GROUND
      }
    ],
    rewards: { money: 260, skillXp: [{ skill: "fishing", xp: 900 }] },
    nextQuestId: "quest.tides_old_coast"
  },
  {
    id: "quest.tides_old_coast",
    trackId: TIDES_QUEST_TRACK_ID,
    actId: "track_tides",
    actTitle: "Reading the Water",
    questTitle: "The Old Coast",
    speakerId: "npc.silas",
    introDialogue: [
      "Take a turn along the coast for a Sturgeon. Check the run and make room for it before you cast.",
      "Bring the catch home, collect its pack, and carry it to the Village Trade Center. A fish that size needs a plan for the road too."
    ],
    completionDialogue: [
      "From the coast to the village, without leaving the hard part for someone else. That’s a trip worth remembering."
    ],
    objectives: [
      {
        id: "step.tides_land_sturgeon",
        type: "land-sport-fish",
        description: "Land a Sturgeon from the coast",
        targetId: "fish.sturgeon",
        targetQuantity: 1,
        locationAnchor: NEVA_COAST_GROUND
      },
      {
        id: "step.tides_sell_sturgeon",
        type: "sell-fish",
        description: "Collect the Sturgeon pack and sell it at the Village Trade Center",
        targetId: "fish.sturgeon",
        targetQuantity: 1,
        locationAnchor: VILLAGE_MARKET_ANCHOR,
        location: { kind: "market", id: "market.village" }
      }
    ],
    rewards: { money: 320, skillXp: [{ skill: "fishing", xp: 1100 }, { skill: "trading", xp: 400 }] },
    nextQuestId: "quest.tides_every_water"
  },
  {
    id: "quest.tides_every_water",
    trackId: TIDES_QUEST_TRACK_ID,
    actId: "track_tides",
    actTitle: "Reading the Water",
    questTitle: "Every Water on the Chart",
    speakerId: "npc.silas",
    introDialogue: [
      "Hook a school in the river, then the lake, then along the coast. Come back when you’ve tried all three; I want to hear which water you prefer."
    ],
    completionDialogue: [
      "Three waters, three different pulls on the line. Next time someone asks where to start, you’ll have an answer of your own."
    ],
    objectives: [
      {
        id: "step.tides_sweep_river",
        type: "hook-sport-fish",
        description: "Hook a school in the river",
        targetQuantity: 1,
        locationAnchor: SILVERWATER_RUN,
        location: { kind: "habitat", id: "river" }
      },
      {
        id: "step.tides_sweep_lake",
        type: "hook-sport-fish",
        description: "Hook a school in the lake",
        targetQuantity: 1,
        locationAnchor: NEVA_LAKE_GROUND,
        location: { kind: "habitat", id: "lake" }
      },
      {
        id: "step.tides_sweep_coast",
        type: "hook-sport-fish",
        description: "Hook a school on the coast",
        targetQuantity: 1,
        locationAnchor: NEVA_COAST_GROUND,
        location: { kind: "habitat", id: "coast" }
      },
      {
        id: "step.tides_report_silas",
        type: "talk-npc",
        description: "Report back to Old Silas",
        targetId: "npc.silas",
        targetQuantity: 1,
        locationAnchor: { x: HARBOR_SILAS_ANCHOR.x, z: HARBOR_SILAS_ANCHOR.z, name: "Harbor Pier" }
      }
    ],
    rewards: {
      money: 400,
      skillXp: [{ skill: "fishing", xp: 1400 }],
      unlocksKnowledgeIds: ["knowledge.reading_the_water"]
    },
    nextQuestId: "quest.tides_blue_marlin"
  },
  {
    id: "quest.tides_blue_marlin",
    trackId: TIDES_QUEST_TRACK_ID,
    actId: "track_tides",
    actTitle: "Reading the Water",
    questTitle: "The Silver King",
    speakerId: "npc.silas",
    introDialogue: [
      "There’s one I’ve never brought in: a Blue Marlin beyond the shelf. If you go after it, take the Master rod and leave a suitable hook free on the boat.",
      "Check the Almanac for its run. This one can wait until you’re ready."
    ],
    completionDialogue: [
      "A marlin on your own line. Sit down and tell me everything, starting with the first pull. I’ve waited years for this story."
    ],
    objectives: [
      {
        id: "step.tides_land_blue_marlin",
        type: "land-sport-fish",
        description: "Land a Blue Marlin beyond the shelf",
        targetId: "fish.blue_marlin",
        targetQuantity: 1,
        locationAnchor: OFFSHORE_GROUNDS,
        location: { kind: "ecology", id: "ecology.neva" }
      }
    ],
    rewards: {
      money: 750,
      skillXp: [{ skill: "fishing", xp: 5000 }, { skill: "trading", xp: 500 }]
    }
  },

  // ===========================================================================
  // Side track: The Cove Commons (track.homestead)
  //
  // The player already inherits the farmhouse and starter field. This chain
  // therefore advances through stewardship rather than property: saved seed,
  // a public commons field, a fair produce contribution, shared tools and a
  // long-lived community orchard. `farm.player_homestead` is a stable save id
  // for the commons, not a private plot offered by the market.
  // ===========================================================================
  {
    id: "quest.homestead_seed_pouch",
    trackId: HOMESTEAD_QUEST_TRACK_ID,
    actId: "track_homestead",
    actTitle: "The Cove Commons",
    questTitle: "The Family Key",
    speakerId: "npc.elspeth",
    introDialogue: [
      "I found your family’s seed pouch in the kitchen, still tied with the same bit of string. I kept it for you.",
      "Your own field is growing now. Take these seeds and help Barnaby get the Village Commons planted too."
    ],
    completionDialogue: [
      "They always kept a little seed back. I’m glad it will see another planting."
    ],
    objectives: [
      {
        id: "step.homestead_take_pouch",
        type: "talk-npc",
        description: "Take the seed pouch from Elspeth",
        targetId: "npc.elspeth",
        targetQuantity: 1,
        locationAnchor: { x: ELSPETH_HOME_ANCHOR.x, z: ELSPETH_HOME_ANCHOR.z, name: ELSPETH_HOME_ANCHOR.locationName }
      }
    ],
    rewards: {
      items: [{ itemId: "seed.wheat", quantity: 8 }, { itemId: "seed.potato", quantity: 4 }],
      skillXp: [{ skill: "farming", xp: 250 }],
      unlocksKnowledgeIds: ["knowledge.family_seed_pouch"]
    },
    nextQuestId: "quest.homestead_overgrown_rows"
  },
  {
    id: "quest.homestead_overgrown_rows",
    trackId: HOMESTEAD_QUEST_TRACK_ID,
    actId: "track_homestead",
    actTitle: "The Cove Commons",
    questTitle: "A Furrow for Everyone",
    speakerId: "npc.barnaby",
    introDialogue: [
      "The eastern beds belong to the Village Commons. We’ve let them stand empty too long. Plant three wheat there and water them in."
    ],
    completionDialogue: [
      "Good to see green in those rows again. I’ll keep an eye on them when I pass."
    ],
    objectives: [
      {
        id: "step.homestead_plant_wheat",
        type: "plant-crop",
        description: "Plant 3 Wheat in the Village Commons",
        targetId: "crop.wheat",
        targetQuantity: 3,
        locationAnchor: COMMONS_PLOT,
        location: { kind: "farm", id: "farm.player_homestead" }
      },
      {
        id: "step.homestead_water_wheat",
        type: "water-crop",
        description: "Water the commons rows",
        targetQuantity: 3,
        creditsEarlyActions: true,
        locationAnchor: COMMONS_PLOT,
        location: { kind: "farm", id: "farm.player_homestead" }
      }
    ],
    rewards: { money: 40, skillXp: [{ skill: "farming", xp: 400 }] },
    nextQuestId: "quest.homestead_first_crop"
  },
  {
    id: "quest.homestead_first_crop",
    trackId: HOMESTEAD_QUEST_TRACK_ID,
    actId: "track_homestead",
    actTitle: "The Cove Commons",
    questTitle: "A Fair Share",
    speakerId: "npc.barnaby",
    introDialogue: [
      "Harvest the three wheat when they’re ready. Sell some at the village stall; the commons should put food back on the square, and you should be paid for tending it."
    ],
    completionDialogue: [
      "A harvest from the commons again. Elspeth will be pleased when she sees the stall."
    ],
    objectives: [
      {
        id: "step.homestead_harvest_wheat",
        type: "harvest-crop",
        description: "Harvest 3 Wheat from the Village Commons",
        targetId: "crop.wheat",
        targetQuantity: 3,
        locationAnchor: COMMONS_PLOT,
        location: { kind: "farm", id: "farm.player_homestead" }
      },
      {
        id: "step.homestead_sell_wheat",
        type: "sell-item",
        description: "Sell Wheat at the Village Produce Market",
        targetId: "produce.wheat",
        targetQuantity: 1,
        locationAnchor: VILLAGE_MARKET_ANCHOR,
        location: { kind: "market", id: "market.village" }
      }
    ],
    rewards: { money: 90, skillXp: [{ skill: "farming", xp: 450 }, { skill: "trading", xp: 300 }] },
    nextQuestId: "quest.homestead_worn_tools"
  },
  {
    id: "quest.homestead_worn_tools",
    trackId: HOMESTEAD_QUEST_TRACK_ID,
    actId: "track_homestead",
    actTitle: "The Cove Commons",
    questTitle: "Tools That Outlast Us",
    speakerId: "npc.barnaby",
    introDialogue: [
      "Take some wheat to the village mill. See the smooth patch on its handle? Your family helped wear that in. The stone still grinds well."
    ],
    completionDialogue: [
      "A little more wear on the old handle. Take this apple sapling to the commons; Elspeth has been saving a place for it."
    ],
    objectives: [
      {
        id: "step.homestead_mill_grain",
        type: "craft-recipe",
        description: "Mill Wheat into Ground Grain at the village mill",
        targetId: "recipe.wheat_to_grain",
        targetQuantity: 1,
        locationAnchor: { x: STARTER_MILL.x, z: STARTER_MILL.z, name: "Village Mill" },
        location: { kind: "station", id: "struct.starter_mill" }
      }
    ],
    rewards: {
      money: 60,
      items: [{ itemId: "seed.apple_sapling", quantity: 1 }],
      skillXp: [{ skill: "processing", xp: 400 }],
      unlocksKnowledgeIds: ["knowledge.worn_handle"]
    },
    nextQuestId: "quest.homestead_orchard"
  },
  {
    id: "quest.homestead_orchard",
    trackId: HOMESTEAD_QUEST_TRACK_ID,
    actId: "track_homestead",
    actTitle: "The Cove Commons",
    questTitle: "Shade for the Next Season",
    speakerId: "npc.elspeth",
    introDialogue: [
      "Plant Barnaby’s apple sapling in the Village Commons. Take your time with it, and bring me the first apple when it’s ready."
    ],
    completionDialogue: [
      "The first apple already. One day someone will sit under that tree without knowing who planted it. I’ll know."
    ],
    objectives: [
      {
        id: "step.homestead_plant_orchard",
        type: "plant-crop",
        description: "Plant an Apple Tree in the Village Commons",
        targetId: "crop.apple_tree",
        targetQuantity: 1,
        locationAnchor: COMMONS_PLOT,
        location: { kind: "farm", id: "farm.player_homestead" }
      },
      {
        id: "step.homestead_harvest_apple",
        type: "harvest-crop",
        description: "Harvest the first apple from the commons",
        targetId: "crop.apple_tree",
        targetQuantity: 1,
        locationAnchor: COMMONS_PLOT,
        location: { kind: "farm", id: "farm.player_homestead" }
      },
      {
        id: "step.homestead_report_elspeth",
        type: "talk-npc",
        description: "Bring the first apple to Elspeth",
        targetId: "npc.elspeth",
        targetQuantity: 1,
        locationAnchor: { x: ELSPETH_HOME_ANCHOR.x, z: ELSPETH_HOME_ANCHOR.z, name: ELSPETH_HOME_ANCHOR.locationName }
      }
    ],
    turnInCost: { items: [{ itemId: "produce.apple", quantity: 1 }] },
    rewards: {
      money: 300,
      skillXp: [{ skill: "farming", xp: 1500 }],
      unlocksKnowledgeIds: ["knowledge.family_ledger"]
    }
  },

  // ===========================================================================
  // Side track: Freight and Favour (track.tradelanes)
  //
  // Maeve on what an order costs to keep. Every objective targets a contract
  // *type* rather than a template id, because the board rolls a few slots out
  // of two dozen templates and naming one would make the quest a dice roll.
  // ===========================================================================
  {
    id: "quest.tradelanes_volume",
    trackId: TRADELANES_QUEST_TRACK_ID,
    actId: "track_tradelanes",
    actTitle: "Freight and Favour",
    questTitle: "The Weight of an Order",
    speakerId: "npc.maeve",
    introDialogue: [
      "Take a bulk order from the board. Check how much it needs before you start gathering; you can deliver it in parts at the listed counter."
    ],
    completionDialogue: [
      "The last measure is in. A large order goes better when you leave room for the work between deliveries."
    ],
    objectives: [
      {
        id: "step.tradelanes_bulk",
        type: "complete-contract",
        description: "Complete any bulk order",
        targetId: "bulk-order",
        targetQuantity: 1,
        locationAnchor: VILLAGE_MARKET_ANCHOR
      }
    ],
    rewards: { money: 120, skillXp: [{ skill: "trading", xp: 600 }] },
    nextQuestId: "quest.tradelanes_freshness"
  },
  {
    id: "quest.tradelanes_freshness",
    trackId: TRADELANES_QUEST_TRACK_ID,
    actId: "track_tradelanes",
    actTitle: "Freight and Favour",
    questTitle: "The Clock in the Hold",
    speakerId: "npc.maeve",
    introDialogue: [
      "Take a fresh-fish order and meet its freshness mark. Pack ice before you sail and choose the way home before you hook the fish."
    ],
    completionDialogue: [
      "Fresh enough for the buyer, and here on time. You planned the return before it became a hurry."
    ],
    objectives: [
      {
        id: "step.tradelanes_fresh",
        type: "complete-contract",
        description: "Complete any fresh-fish order at its freshness mark",
        targetId: "fresh-fish",
        targetQuantity: 1,
        locationAnchor: { x: HARBOR_MARKET.x, z: HARBOR_MARKET.z, name: "Harbor Fish Market" }
      }
    ],
    rewards: {
      items: [{ itemId: "item.crushed_ice", quantity: 3 }],
      money: 140,
      skillXp: [{ skill: "trading", xp: 700 }, { skill: "fishing", xp: 300 }]
    },
    nextQuestId: "quest.tradelanes_grade"
  },
  {
    id: "quest.tradelanes_grade",
    trackId: TRADELANES_QUEST_TRACK_ID,
    actId: "track_tradelanes",
    actTitle: "Freight and Favour",
    questTitle: "A Buyer Who Can Tell",
    speakerId: "npc.maeve",
    introDialogue: [
      "This buyer names a grade. Take a quality-target order and check the catch before you deliver; anything below the mark stays yours."
    ],
    completionDialogue: [
      "That meets the grade. Keep an eye on what buyers ask for; a good catch deserves the right counter."
    ],
    objectives: [
      {
        id: "step.tradelanes_quality",
        type: "complete-contract",
        description: "Complete any quality-target order",
        targetId: "quality-target",
        targetQuantity: 1,
        locationAnchor: { x: HARBOR_MARKET.x, z: HARBOR_MARKET.z, name: "Harbor Fish Market" }
      }
    ],
    rewards: { money: 220, skillXp: [{ skill: "trading", xp: 900 }, { skill: "fishing", xp: 400 }] },
    nextQuestId: "quest.tradelanes_crossing"
  },
  {
    id: "quest.tradelanes_crossing",
    trackId: TRADELANES_QUEST_TRACK_ID,
    actId: "track_tradelanes",
    actTitle: "Freight and Favour",
    questTitle: "The Long Way Round",
    speakerId: "npc.tomas",
    herald: {
      npcId: "npc.maeve",
      lines: [
          "Tomas has orders that cross the channel. Take the skiff to Sunreach and find him at the cove; check the board for a load that belongs on the far side."
        ]
    },
    introDialogue: [
      "Dock here at Sunreach, then fill a cross-channel order from the board. Our olives travel out; mainland goods come back. Check which side is waiting for your delivery."
    ],
    completionDialogue: [
      "The goods arrived on the right side of the channel. Leave time for that crossing whenever you promise a delivery."
    ],
    objectives: [
      {
        id: "step.tradelanes_dock_cove",
        type: "dock-boat",
        description: "Dock at Sunreach Cove",
        targetId: "boat.player_skiff",
        targetQuantity: 1,
        locationAnchor: SUNREACH_COVE,
        location: { kind: "market", id: "market.sunreach_cove" }
      },
      {
        // Any produce order used to count, so a village wheat delivery
        // finished a quest about crossing the channel. The tag is carried only
        // by orders whose goods have to make the crossing.
        id: "step.tradelanes_cross_order",
        type: "complete-contract",
        description: "Fill an order whose goods cross the channel",
        targetId: "tag:cross-channel",
        targetQuantity: 1
      }
    ],
    rewards: { money: 260, skillXp: [{ skill: "trading", xp: 1000 }] },
    nextQuestId: "quest.tradelanes_ledger"
  },
  {
    id: "quest.tradelanes_ledger",
    trackId: TRADELANES_QUEST_TRACK_ID,
    actId: "track_tradelanes",
    actTitle: "Freight and Favour",
    questTitle: "Freight and Favour",
    speakerId: "npc.maeve",
    introDialogue: [
      "Come by the Fish Market. You’ve handled bulk, freshness, grade and a crossing; I’d like to hear which delivery gave you the most trouble."
    ],
    completionDialogue: [
      "I’ll remember that when the next new trader asks. Leave your name in the ledger; there’s always another load waiting somewhere."
    ],
    objectives: [
      {
        id: "step.tradelanes_report_maeve",
        type: "talk-npc",
        description: "Report back to Maeve at the Fish Market",
        targetId: "npc.maeve",
        targetQuantity: 1,
        locationAnchor: { x: HARBOR_MARKET.x, z: HARBOR_MARKET.z, name: "Harbor Fish Market" }
      }
    ],
    rewards: {
      money: 350,
      skillXp: [{ skill: "trading", xp: 1400 }],
      unlocksKnowledgeIds: ["knowledge.freight_and_favour"]
    },
    nextQuestId: "quest.tradelanes_pinewatch"
  },
  {
    id: "quest.tradelanes_pinewatch", trackId: TRADELANES_QUEST_TRACK_ID,
    actId: "track_tradelanes", actTitle: "Freight and Favour", questTitle: "The Woodland Round",
    speakerId: "npc.rowan",
    herald: { npcId: "npc.maeve", lines: [
          "Rowan needs grain in Pinewatch. Take the woodland road or sail to the landing across the cove. His timber yard is worth a look before you come home."
        ] },
    introDialogue: [
      "I’m Rowan. The bakehouse needs eight wheat for its next batch; sell them at our counter. We keep timber and linen for your return trip."
    ],
    completionDialogue: [
      "That’s the next batch of bread covered. Have a look at the supplies before you head home."
    ],
    objectives: [
      { id: "step.tradelanes_meet_rowan", type: "talk-npc", targetId: "npc.rowan", targetQuantity: 1,
        description: "Meet Rowan at Pinewatch", locationAnchor: { ...MAINLAND_VILLAGES.pinewatch.npc, name: "Pinewatch Trade Yard" } },
      { id: "step.tradelanes_pinewatch_wheat", type: "sell-item", targetId: "produce.wheat", targetQuantity: 8,
        description: "Sell 8 Wheat at Pinewatch", location: { kind: "market", id: "market.pinewatch" },
        locationAnchor: mainlandCounterAnchor("pinewatch", "Pinewatch Timber & Trade") }
    ],
    rewards: { money: 140, skillXp: [{ skill: "trading", xp: 500 }] },
    nextQuestId: "quest.tradelanes_reedhaven"
  },
  {
    id: "quest.tradelanes_reedhaven", trackId: TRADELANES_QUEST_TRACK_ID,
    actId: "track_tradelanes", actTitle: "Freight and Favour", questTitle: "Where the Reeds Meet the Cove",
    speakerId: "npc.mara",
    herald: { npcId: "npc.rowan", lines: [
          "Follow the coast road south to Reedhaven. Mara keeps bait and ice at the exchange, and buys fish packs carried to her counter."
        ] },
    introDialogue: [
      "Mara. Bring a fish pack to the Reedhaven Exchange. Unload it and carry it to the counter; the last few steps from the landing are on foot."
    ],
    completionDialogue: [
      "The fish is on our counter. Remember how long the trip took when you plan the next catch."
    ],
    objectives: [
      { id: "step.tradelanes_meet_mara", type: "talk-npc", targetId: "npc.mara", targetQuantity: 1,
        description: "Meet Mara in Reedhaven", locationAnchor: { ...MAINLAND_VILLAGES.reedhaven.npc, name: "Reedhaven Exchange" } },
      { id: "step.tradelanes_reedhaven_pack", type: "sell-fish", targetQuantity: 1,
        description: "Carry a fresh fish pack to Reedhaven and sell it", location: { kind: "market", id: "market.reedhaven" },
        locationAnchor: mainlandCounterAnchor("reedhaven", "Reedhaven Marsh Exchange") }
    ],
    rewards: { money: 180, skillXp: [{ skill: "trading", xp: 650 }] },
    nextQuestId: "quest.tradelanes_highridge"
  },
  {
    id: "quest.tradelanes_highridge", trackId: TRADELANES_QUEST_TRACK_ID,
    actId: "track_tradelanes", actTitle: "Freight and Favour", questTitle: "Supper Above the Cove",
    speakerId: "npc.ada",
    herald: { npcId: "npc.mara", lines: [
          "Ada needs fish in Highridge. Take the pass road; there’s no landing up there."
        ] },
    introDialogue: [
      "We can see the sea from Highridge, but supper still has to climb the road. Bring two fish packs and sell them at our counter, one at a time.",
      "Use a wagon if you want to bring both on one trip. We stock workshop supplies for the way down."
    ],
    completionDialogue: [
      "Two catches made it up the hill. If you keep this route, we’ll be glad to see you at the counter again."
    ],
    objectives: [
      { id: "step.tradelanes_meet_ada", type: "talk-npc", targetId: "npc.ada", targetQuantity: 1,
        description: "Meet Ada at Highridge", locationAnchor: { ...MAINLAND_VILLAGES.highridge.npc, name: "Highridge Provisions" } },
      { id: "step.tradelanes_highridge_packs", type: "sell-fish", targetQuantity: 2,
        description: "Sell 2 hand-carried fish packs at Highridge", location: { kind: "market", id: "market.highridge" },
        locationAnchor: mainlandCounterAnchor("highridge", "Highridge Provisions") }
    ],
    rewards: { money: 240, skillXp: [{ skill: "trading", xp: 900 }] }
  },

  // ===========================================================================
  // Act 8: The Dry Season
  //
  // Sunreach's own problem, stated mechanically. The terraces hold water badly
  // (moistureRetention 0.45) and the island is a long crossing from any buyer,
  // so the act is about the one thing warm dry wind is good for: preserving a
  // catch until distance stops mattering. It gives the southern reef its first
  // gameplay verb and ends with the route running the other way.
  // ===========================================================================
  {
    id: "quest.act8_dry_season",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act8_dry_season",
    actTitle: "Act 8: The Dry Season",
    questTitle: "What the Terraces Drink",
    speakerId: "npc.ines",
    introDialogue: [
      "The upper rows dry first. Plant two sunflowers there, then water the terraces from the well. The cistern should save us carrying cans up these steps."
    ],
    completionDialogue: [
      "Water reached the new roots. That leaves us time to see what Tomas has found along the reef."
    ],
    objectives: [
      {
        id: "step.act8_plant_terrace",
        type: "plant-crop",
        description: "Plant 2 Sunflowers on the Sunreach terraces",
        targetId: "crop.sunflower",
        targetQuantity: 2,
        locationAnchor: SUNREACH_TERRACES,
        location: { kind: "farm", id: "farm.sunreach_terraces" }
      },
      {
        id: "step.act8_irrigate_terrace",
        type: "irrigate-farm",
        description: "Run the cistern through the terraces from the well",
        targetId: "farm.sunreach_terraces",
        targetQuantity: 1,
        locationAnchor: { x: 451.2 + SUNREACH_OFFSET_X, z: 7.4, name: "Sunreach Terrace Well" },
        location: { kind: "farm", id: "farm.sunreach_terraces" }
      }
    ],
    rewards: { money: 120, skillXp: [{ skill: "farming", xp: 700 }] },
    nextQuestId: "quest.act8_southern_shelf"
  },
  {
    id: "quest.act8_southern_shelf",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act8_dry_season",
    actTitle: "Act 8: The Dry Season",
    questTitle: "The Southern Shelf",
    speakerId: "npc.tomas",
    introDialogue: [
      "There are amberjack along the southern shelf. I’ve been watching them from the cove; today I’d like to see one landed.",
      "Take the skiff and Heavy Sport tackle or better. The cove stall stocks it. Check the Almanac for a good time to go."
    ],
    completionDialogue: [
      "An amberjack from our shelf. There’s more here than the sardines we sell off the wall. Ines has an idea for getting part of our catch across the channel."
    ],
    objectives: [
      {
        id: "step.act8_land_amberjack",
        type: "land-sport-fish",
        description: "Land a Greater Amberjack in Sunreach waters",
        targetId: "fish.amberjack",
        targetQuantity: 1,
        locationAnchor: SUNREACH_REEF,
        location: { kind: "ecology", id: "ecology.sunreach" }
      }
    ],
    rewards: { money: 200, skillXp: [{ skill: "fishing", xp: 900 }] },
    nextQuestId: "quest.act8_salt_and_shade"
  },
  {
    id: "quest.act8_salt_and_shade",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act8_dry_season",
    actTitle: "Act 8: The Dry Season",
    questTitle: "Salt and Shade",
    speakerId: "npc.ines",
    introDialogue: [
      "Catch two sardines and salt-cure them at our fish table. We’ve kept fish this way for years; it gives you time to find a buyer across the channel."
    ],
    completionDialogue: [
      "Pack those cured fish in your satchel. Tomas knows where to sell them on the mainland."
    ],
    objectives: [
      {
        id: "step.act8_catch_sardines",
        type: "catch-basic-fish",
        description: "Catch 2 Sunreach Sardines",
        targetId: "fish.sardine",
        targetQuantity: 2,
        locationAnchor: SUNREACH_COVE,
        location: { kind: "ecology", id: "ecology.sunreach" }
      },
      {
        id: "step.act8_cure_sardines",
        type: "craft-recipe",
        description: "Salt-cure the sardines at the Sunreach fish table",
        targetId: "recipe.cure_sardine",
        targetQuantity: 1,
        locationAnchor: { x: 382 + SUNREACH_OFFSET_X, z: 61, name: "Sunreach Fish Table" },
        location: { kind: "station", id: "struct.sunreach_fish_table" }
      }
    ],
    rewards: {
      money: 180,
      skillXp: [{ skill: "processing", xp: 900 }, { skill: "fishing", xp: 300 }],
      unlocksKnowledgeIds: ["knowledge.salt_and_shade"]
    },
    nextQuestId: "quest.act8_route_worth_keeping"
  },
  {
    id: "quest.act8_route_worth_keeping",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act8_dry_season",
    actTitle: "Act 8: The Dry Season",
    questTitle: "A Route Worth Keeping",
    speakerId: "npc.tomas",
    introDialogue: [
      "Take the Salt-Cured Fish to the Village Produce Market in Neva. You can carry it in your satchel; it doesn’t need a fish berth."
    ],
    completionDialogue: [
      "They bought it? Good. We have something for the return journey now. Tell Ines before you leave the terraces."
    ],
    objectives: [
      {
        id: "step.act8_sell_cured",
        type: "sell-item",
        description: "Sell Salt-Cured Fish at the Village Produce Market",
        targetId: "item.salt_cured_fish",
        targetQuantity: 1,
        locationAnchor: VILLAGE_MARKET_ANCHOR,
        location: { kind: "market", id: "market.village" }
      }
    ],
    rewards: { money: 240, skillXp: [{ skill: "trading", xp: 1000 }] },
    nextQuestId: "quest.act8_dry_season_end"
  },
  {
    id: "quest.act8_dry_season_end",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act8_dry_season",
    actTitle: "Act 8: The Dry Season",
    questTitle: "The Dry Season's End",
    speakerId: "npc.ines",
    introDialogue: [
      "Tomas says the cured fish sold in Neva. Come up to the terraces; I’d like to hear how the journey went."
    ],
    completionDialogue: [
      "When you arrived, I wondered whether you’d stay past the first dry afternoon. Now you’ve tended our field and carried our food home. There’ll be a place for you here."
    ],
    objectives: [
      {
        id: "step.act8_report_ines",
        type: "talk-npc",
        description: "Report back to Ines at the terraces",
        targetId: "npc.ines",
        targetQuantity: 1,
        locationAnchor: SUNREACH_TERRACES
      }
    ],
    rewards: { money: 300, skillXp: [{ skill: "farming", xp: 600 }, { skill: "trading", xp: 600 }] },
    nextQuestId: "quest.act9_beyond_the_grounds"
  },

  // ===========================================================================
  // Act 9: The Charter
  //
  // Earned seamanship. The offshore rod is the one purchase the story has
  // never asked for, the trench is water the player has had no reason to visit,
  // and the charter is the harbor agreeing you can be relied on. Deliberately
  // does NOT ask for a blue marlin: that needs rod.master at 60,000 Fishing XP
  // and would put a wall back on the spine. The marlin is a Records Board
  // goal, where a long chase belongs.
  // ===========================================================================
  {
    id: "quest.act9_beyond_the_grounds",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act9_charter",
    actTitle: "Act 9: The Charter",
    questTitle: "Beyond the Grounds",
    speakerId: "npc.silas",
    // Act 8 closes on the terraces, a channel away from Silas; Ines passes on
    // his word in the same conversation so the next beat has a voice.
    herald: {
      npcId: "npc.ines",
      lines: [
          "Silas sent word: meet him at the harbor pier when you’re back. He has a deeper fishing ground to show you. Maeve stocks the Offshore Rod you’ll need."
        ]
    },
    introDialogue: [
      "There’s deeper water I haven’t shown you yet. Buy the Offshore Rod from Maeve’s tackle stall, then meet me at the pier."
    ],
    completionDialogue: [
      "That rod can take you farther out. Before we try the trench, check your fuel and leave room for the catch."
    ],
    objectives: [
      {
        id: "step.act9_buy_offshore_rod",
        type: "purchase-upgrade",
        description: "Buy the Offshore Rod at the harbor tackle stall",
        targetId: "rod.offshore",
        targetQuantity: 1,
        locationAnchor: { x: HARBOR_MARKET.x, z: HARBOR_MARKET.z, name: "Harbor Fish Market" }
      }
    ],
    rewards: { money: 200, skillXp: [{ skill: "fishing", xp: 900 }] },
    nextQuestId: "quest.act9_deep_trench"
  },
  {
    id: "quest.act9_deep_trench",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act9_charter",
    actTitle: "Act 9: The Charter",
    questTitle: "The Deep Trench",
    speakerId: "npc.silas",
    introDialogue: [
      "Swordfish feed out at the trench, southwest of our usual grounds. Check their run in the Almanac and take enough fuel to wait for them.",
      "Land one, bring it home, then carry the pack to the Village Trade Center. The return trip is part of the work."
    ],
    completionDialogue: [
      "A swordfish from the trench, brought all the way to the village. I used to make that trip with your family. Good to have someone to talk about it with again."
    ],
    objectives: [
      {
        id: "step.act9_land_swordfish",
        type: "land-sport-fish",
        description: "Land a Swordfish from the deep trench",
        targetId: "fish.swordfish",
        targetQuantity: 1,
        locationAnchor: DEEP_TRENCH,
        location: { kind: "ecology", id: "ecology.neva" }
      },
      {
        id: "step.act9_sell_swordfish",
        type: "sell-fish",
        description: "Collect the Swordfish pack and sell it at the Village Trade Center",
        targetId: "fish.swordfish",
        targetQuantity: 1,
        locationAnchor: VILLAGE_MARKET_ANCHOR,
        location: { kind: "market", id: "market.village" }
      }
    ],
    rewards: { money: 400, skillXp: [{ skill: "fishing", xp: 1400 }, { skill: "trading", xp: 500 }] },
    nextQuestId: "quest.act9_standing_arrangement"
  },
  {
    id: "quest.act9_standing_arrangement",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act9_charter",
    actTitle: "Act 9: The Charter",
    questTitle: "A Standing Arrangement",
    speakerId: "npc.maeve",
    introDialogue: [
      "I need someone I can put on the regular delivery list. Complete a quality-target order, then a bulk order. Watch the grade on the first and the quantity on the second."
    ],
    completionDialogue: [
      "Both orders delivered. I can put your name beside the next buyer’s request without wondering whether it will arrive. There’s a charter for work like that."
    ],
    objectives: [
      {
        id: "step.act9_quality_order",
        type: "complete-contract",
        description: "Complete a quality-target order",
        targetId: "quality-target",
        targetQuantity: 1,
        locationAnchor: { x: HARBOR_MARKET.x, z: HARBOR_MARKET.z, name: "Harbor Fish Market" }
      },
      {
        id: "step.act9_bulk_order",
        type: "complete-contract",
        description: "Complete a bulk order",
        targetId: "bulk-order",
        targetQuantity: 1,
        locationAnchor: VILLAGE_MARKET_ANCHOR
      }
    ],
    rewards: { money: 350, skillXp: [{ skill: "trading", xp: 1400 }] },
    nextQuestId: "quest.act9_the_charter"
  },
  {
    id: "quest.act9_the_charter",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act9_charter",
    actTitle: "Act 9: The Charter",
    questTitle: "The Charter",
    speakerId: "npc.maeve",
    introDialogue: [
      "The harbor charter gives you room for one more active order. Bring 400 gold and two Salt-Cured Fish, and we’ll sign it here."
    ],
    completionDialogue: [
      "Your name is in the ledger. One more order, and a harbor that expects you home."
    ],
    objectives: [
      {
        id: "step.act9_sign_charter",
        type: "talk-npc",
        description: "Sign the charter with Maeve",
        targetId: "npc.maeve",
        targetQuantity: 1,
        locationAnchor: { x: HARBOR_MARKET.x, z: HARBOR_MARKET.z, name: "Harbor Fish Market" }
      }
    ],
    turnInCost: { money: 400, items: [{ itemId: "item.salt_cured_fish", quantity: 2 }] },
    rewards: {
      skillXp: [{ skill: "trading", xp: 1200 }, { skill: "fishing", xp: 600 }],
      unlocksFeatureIds: ["feature.maritime_guild_charter"]
    },
    nextQuestId: "quest.act10_open_horizons"
  },

  // ===========================================================================
  // Act 10: Open Horizons
  //
  // The arc in LLM/02 section 0.1 ends at "open horizons", and the game used to
  // reach it by setting activeActId to a state with no content in it. This is
  // the closing beat that state was always supposed to have: not a reward, a
  // round of the people whose work the player has been standing on.
  // ===========================================================================
  {
    id: "quest.act10_open_horizons",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act10_open_horizons",
    actTitle: "Act 10: Open Horizons",
    questTitle: "Open Horizons",
    speakerId: "npc.elspeth",
    // The charter is signed at Maeve's stall, and the round begins there; she
    // passes on Elspeth's request in the same conversation. Each person in the
    // round then says their own piece rather than whatever errand of theirs
    // happens to be running.
    herald: {
      npcId: "npc.maeve",
      lines: [
          "Elspeth asked you to visit us before your next departure. Silas first, then back here, then Barnaby at his bench. She’ll be waiting in the farmhouse yard."
        ]
    },
    introDialogue: [
      "Before your next journey, visit Silas, Maeve and Barnaby. Then come back to the garden. I’d like a quiet word before you go."
    ],
    completionDialogue: [
      "When you arrived, I handed you a pouch of seeds. Now there are crops in the field, a boat at the slip, and people looking out for your return.",
      "Keep the gate oiled. You’ll be coming home through it for a long while yet."
    ],
    objectives: [
      {
        id: "step.act10_silas",
        type: "talk-npc",
        description: "Speak with Old Silas at the pier",
        targetId: "npc.silas",
        targetQuantity: 1,
        locationAnchor: { x: HARBOR_SILAS_ANCHOR.x, z: HARBOR_SILAS_ANCHOR.z, name: "Harbor Pier" },
        dialogue: [
          "Sit a minute. I kept your family’s slip clear all those years, hoping someone would take the boat out again.",
          "You did. Go on to Maeve; she’ll pretend she isn’t waiting."
        ]
      },
      {
        id: "step.act10_maeve",
        type: "talk-npc",
        description: "Speak with Maeve at the Fish Market",
        targetId: "npc.maeve",
        targetQuantity: 1,
        locationAnchor: { x: HARBOR_MARKET.x, z: HARBOR_MARKET.z, name: "Harbor Fish Market" },
        dialogue: [
          "Your name used to mean a small basket at the stall. Now I look for it on the delivery ledger.",
          "Go and see Barnaby. Mind he doesn’t put you to work."
        ]
      },
      {
        id: "step.act10_barnaby",
        type: "talk-npc",
        description: "Speak with Barnaby at the farmhouse bench",
        targetId: "npc.barnaby",
        targetQuantity: 1,
        locationAnchor: { x: -73.5, z: -58.8, name: "Farmhouse Workbench" },
        dialogue: [
          "See those marks on the bench? Some of them are yours now. I won’t sand them out.",
          "Elspeth is waiting. Take the path past the rows; she’ll ask how they’re doing."
        ]
      },
      {
        id: "step.act10_elspeth",
        type: "talk-npc",
        description: "Return to Elspeth in the farmhouse yard",
        targetId: "npc.elspeth",
        targetQuantity: 1,
        locationAnchor: { x: ELSPETH_HOME_ANCHOR.x, z: ELSPETH_HOME_ANCHOR.z, name: ELSPETH_HOME_ANCHOR.locationName }
      }
    ],
    rewards: {
      money: 500,
      skillXp: [
        { skill: "farming", xp: 800 },
        { skill: "fishing", xp: 800 },
        { skill: "processing", xp: 800 },
        { skill: "trading", xp: 800 }
      ],
      unlocksKnowledgeIds: ["knowledge.open_horizons"]
    }
  },
  ...VILLAGE_TRADE_QUESTS,
  ...TRADE_CRAFT_QUESTS
];
