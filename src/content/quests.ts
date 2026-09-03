// src/content/quests.ts

import { MAIN_QUEST_TRACK_ID, type QuestDefinition } from "../simulation/core/QuestTypes";
import { HOMESTEAD_QUEST_TRACK_ID, TIDES_QUEST_TRACK_ID, TRADELANES_QUEST_TRACK_ID } from "./questTracks";
import { HARBOR_DOCK, HARBOR_FISH_TABLE, HARBOR_SILAS_ANCHOR, HARBOR_SKIFF_MOORING, VILLAGE_MARKET } from "../world/WorldAnchors";
import { starterStructureAnchor } from "../world/FarmLayout";
import { WorldLayout } from "../world/WorldLayout";
import { SUNREACH_ANCHORS } from "../world/WorldIslands";

const STARTER_FARM_ANCHOR = { x: -65, z: -55, name: "Starter Farm Field" } as const;
const STARTER_MILL = starterStructureAnchor("struct.starter_mill")!;
const WORKBENCH = starterStructureAnchor("struct.workbench")!;
const COMPOST_BIN = starterStructureAnchor("struct.starter_compost")!;
const BRIDGE = WorldLayout.landmark("bridge");
const VILLAGE_MARKET_ANCHOR = { ...VILLAGE_MARKET.position, name: "Village Produce Stall" } as const;
const HARBOR_MARKET = WorldLayout.landmark("fish-market");
/** Centre of the private homestead's single plantable area. */
const HOMESTEAD_PLOT = { x: 63.5, z: -62.5, name: "Private Homestead" };
const LAKE_SCHOOL_ANCHOR = { x: 18, z: WorldLayout.coastlineZ(18) + 12, name: "Lake Sport-Fishing School" } as const;
const SUNREACH_COVE = { ...SUNREACH_ANCHORS.coveMarket, name: "Sunreach Cove" } as const;
const SUNREACH_TERRACES = { ...SUNREACH_ANCHORS.terraceFarm, name: "Sunreach Terraces" } as const;
const SUNREACH_REEF = { x: 586, z: 184, name: "Sunreach Reef Edge" } as const;

export const QUESTS: QuestDefinition[] = [
  // ==========================================
  // ACT 1: HOMESTEAD AWAKENING
  // ==========================================
  {
    id: "quest.act1_welcome",
    trackId: MAIN_QUEST_TRACK_ID,
    actId: "act1_homestead",
    actTitle: "Act 1: Homestead Awakening",
    questTitle: "The Inherited Soil",
    speakerId: "npc.elspeth",
    introDialogue: [
      "Welcome to Neva Cove, dear! Your family once tended these quiet coastal fields and sailed the deep waters beyond the headland.",
      "The old homestead has waited a long time for you. Let's start with the foundation of all life on the island: the soil.",
      "Take these wheat seeds. Head into the prepared garden field just behind me to begin."
    ],
    completionDialogue: [
      "You have your grandfather's steady hands. Let's get these seeds into the earth!"
    ],
    objectives: [
      {
        id: "step.act1_welcome_talk",
        type: "talk-npc",
        description: "Speak with Elspeth at the Starter Garden Gate",
        targetId: "npc.elspeth",
        targetQuantity: 1,
        locationAnchor: { x: -63.5, z: -62.0, name: "Starter Garden Gate" }

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
    questTitle: "Sowing the First Furrows",
    speakerId: "npc.elspeth",
    introDialogue: [
      "Walk onto the prepared field soil. Select the Wheat Seeds and click a clear spot to place them.",
      "Each crop has its own footprint. Space them out nicely so their roots have room to breathe."
    ],
    completionDialogue: [
      "Wonderful! The seeds are in the soil. But they won't sprout without water."
    ],
    objectives: [
      {
        id: "step.act1_sow_3_wheat",
        type: "plant-crop",
        description: "Plant 3 Wheat Seeds in the prepared field",
        targetId: "crop.wheat",
        targetQuantity: 3,
        locationAnchor: STARTER_FARM_ANCHOR,
        location: { kind: "farm", id: "farm.starter_garden" }
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
    questTitle: "Morning Dew & Moisture",
    speakerId: "npc.elspeth",
    introDialogue: [
      "Equip your watering can with [3], then approach a thirsty crop and press [E] or left-click it to water.",
      "Keeping soil moisture in the ideal green band supports healthy growth and better harvest grades!"
    ],
    completionDialogue: [
      "Look how rich and dark the soil looks when watered! Wheat takes a morning to ripen — tend other chores, or rest at the farmhouse and return."
    ],
    objectives: [
      {
        id: "step.act1_water_3_crops",
        type: "water-crop",
        description: "Water your planted crops 3 times",
        targetQuantity: 3,
        locationAnchor: STARTER_FARM_ANCHOR,
        location: { kind: "farm", id: "farm.starter_garden" }
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
      "Hey there! I'm Barnaby, the homestead handyman. Wheat takes a morning to ripen — come back after it grows, or rest at the farmhouse overnight.",
      "Harvest that wheat when the heads turn gold, then see me by the farmhouse workbench. Farming on Neva isn't just for bread—it's how we supply our fishing trips!"
    ],
    completionDialogue: [
      "That's prime grain right there! Heavy ears and full kernels. Now let's turn it into sea supplies."
    ],
    objectives: [
      {
        id: "step.act2_harvest_3_wheat",
        type: "harvest-crop",
        description: "Harvest 3 mature Wheat crops",
        targetId: "crop.wheat",
        targetQuantity: 3,
        locationAnchor: STARTER_FARM_ANCHOR,
        location: { kind: "farm", id: "farm.starter_garden" }
      },
      {
        id: "step.act2_compost_worms",
        type: "craft-recipe",
        description: "Cultivate Bait Worms at the Compost Bin",
        targetId: "recipe.compost_worms",
        targetQuantity: 1,
        locationAnchor: { x: COMPOST_BIN.x, z: COMPOST_BIN.z, name: "Starter Compost Bin" },
        location: { kind: "station", id: "struct.starter_compost" }
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
      "To bring the big offshore fish to the surface, you need good chum to spark a feeding frenzy.",
      "First, take your harvested wheat to the Hand Mill or Windmill to grind it into Ground Grain.",
      "Then bring that Ground Grain and Bait Worms to my workbench to craft a Chum Bucket!"
    ],
    completionDialogue: [
      "Look at that chum bucket! Oily, fragrant, and packed with ground grain. The coastal schools will go wild for it."
    ],
    objectives: [
      {
        id: "step.act2_mill_grain",
        type: "craft-recipe",
        description: "Grind Wheat into Ground Grain at the Hand Mill",
        targetId: "recipe.wheat_to_grain",
        targetQuantity: 1,
        locationAnchor: { x: STARTER_MILL.x, z: STARTER_MILL.z, name: "Windmill" },
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
      "Ah, the new blood in Neva Cove! I'm Old Silas. Before you venture onto the open sea, you must master the river.",
      "Walk down the path to the timber bridge over the river corridor. Cast your line into the freshwater.",
      "Hold [Space] to raise your green bar; keep the fish inside the bar to land it!"
    ],
    completionDialogue: [
      "Good strike! You've got the angler's touch. River fish are quick, but steady hands always win."
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
      "The village produce stall is always eager for extra grain and garden produce.",
      "Visit the Village Produce Stall near the farm edge. Open the market trade menu and sell extra produce for gold. Harbor is where the catch is traded."
    ],
    completionDialogue: [
      "Look at that purse jingle! Honest coin from your own labor. Now you're ready to see the wider harbor."
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
      "Welcome to the Southeast Harbor! I'm Maeve. Out here, the ocean dictates everything.",
      "Take a look at the Fish Market prices: pelagic saltwater fish command high prices, but remember: fish is perishable physical cargo!",
      "The longer it sits in your hold, the more freshness decays. Keep your trips planned and swift!"
    ],
    completionDialogue: [
      "Now you understand the market balance. High risk, high reward, but only if you bring 'em in cold!"
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
      "Your family's old wooden rowboat is tied at the slip. The hull is sound cedar, but she needs fresh mooring registration and oarlock grease.",
      "Bring me 30 coins for the harbor permit and 1 Ground Grain for grease, and I'll clear her for departure!"
    ],
    completionDialogue: [
      "She's cleared for sea! Step down to the wooden slip, press [E] to board, and take her out into the bay."
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
      unlocksFeatureIds: ["boat.player_rowboat"],
      skillXp: [{ skill: "fishing", xp: 350 }]
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
      "This is what it's all about. Board your rowboat with your Chum Bucket and steer out toward the open water.",
      "Look for circling gulls and water disturbances. Approach the school, cast your chum to ignite a frenzy, and hook the fish!",
      "Manage your line tension: reel when safe, slack when the line strains orange, and counter the runs with [A] and [D].",
      "Stow your catch in the boat hold, race back before freshness drops, and sell to Maeve!"
    ],
    completionDialogue: [
      "Magnificent! You've mastered the first loop of Neva: from wheat seed, to worm, to chum, to lake sport fish, to harbor gold!",
      "The Expedition Board is active now. Keep tending the homestead, learning the water, and preparing for longer routes."
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
        description: "Chum and hook a fish in an active school",
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
        location: { kind: "boat", id: "boat.player_rowboat" }
      },
      {
        id: "step.act5_sell_fish",
        type: "sell-fish",
        description: "Dock at Harbor and sell your fresh sport fish to Maeve",
        targetQuantity: 1,
        locationAnchor: { x: HARBOR_MARKET.x, z: HARBOR_MARKET.z, name: "Harbor Fish Market" },
        location: { kind: "market", id: "market.harbor" }
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
      unlocksFeatureIds: ["feature.expedition_planner"]
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
      "The board is more than a price list. Pick an order you can honestly finish before its deadline, then bring it to the market that posted it.",
      "A steady farm delivery is sound work. A fish order can pay more, but the water, tackle, cargo room, and clock all have a say."
    ],
    completionDialogue: [
      "You chose a promise and kept it. That is how the cove learns it can rely on you.",
      "Take this payment—and these clean scraps. Barnaby has an idea for putting both to work back at the homestead."
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
      skillXp: [{ skill: "trading", xp: 450 }]
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
      "Maeve's payment is enough for the field-pump parts. Install them at the starter-farm well, then run the pump while the crops need water.",
      "It will not grow anything for you. It will turn one careful watering job into a field decision."
    ],
    completionDialogue: [
      "Hear that steady rhythm? You bought back time, not responsibility.",
      "Now bring those fish scraps to the harbor cleaning table. The sea can feed the soil as surely as the field feeds the harbor."
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
      "Use Maeve's scraps at the harbor fish table to make fertilizer. Then carry it home and work it into the starter field.",
      "Waste from one livelihood becomes preparation for the next. That is the quiet machinery of Neva Cove."
    ],
    completionDialogue: [
      "There it is: field to bait, bait to fish, fish back to field. You are no longer following the cove's cycle—you are tending it.",
      "I've written the method in your journal. Use it whenever the soil needs another season."
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
      skillXp: [{ skill: "farming", xp: 650 }, { skill: "processing", xp: 450 }],
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
    introDialogue: [
      "Sunreach lies beyond the open channel. A rowboat cannot hold its line in that swell; take the Coastal Fishing Skiff.",
      "Follow the buoyed water east, enter the sheltered cove, and bring the skiff onto our mooring. Tomas keeps the market there."
    ],
    completionDialogue: [
      "You read the channel cleanly. Welcome to Sunreach—warm stone, dry terraces, and a reef that rewards preparation."
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
      "These terraces hold warmth and lose water quickly. Plant three sunflowers, water them with care, and bring one head to harvest."
    ],
    completionDialogue: [
      "The terraces answered you. Sunreach asks for attention, not excess water."
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
      "The sunflower head carries more than the next crop. Mill its seed into grain, then mix that grain into chum at the cove workbench."
    ],
    completionDialogue: [
      "Field work has become reef preparation. That is the Sunreach way."
    ],
    objectives: [
      { id: "step.act7_mill_sunflower", type: "craft-recipe", description: "Mill Sunflower Seed into Ground Grain", targetId: "recipe.sunflower_to_grain", targetQuantity: 1, locationAnchor: { x: 444, z: 21, name: "Sunreach Hand Mill" }, location: { kind: "station", id: "struct.sunreach_hand_mill" } },
      { id: "step.act7_craft_sunreach_chum", type: "craft-recipe", description: "Craft Chum at the Sunreach Workbench", targetId: "recipe.craft_chum", targetQuantity: 1, locationAnchor: { x: 466, z: 17, name: "Sunreach Workbench" }, location: { kind: "station", id: "struct.sunreach_workbench" } }
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
      "Cast that chum where the reef shelf drops away. A golden sea bream from these waters belongs in the skiff hold, then on my cove scales while it is fresh."
    ],
    completionDialogue: [
      "Fresh, local, and landed with room to spare. The reef has answered your preparation."
    ],
    objectives: [
      { id: "step.act7_chum_sunreach", type: "chum-school", description: "Chum a Sunreach fish school", targetQuantity: 1, locationAnchor: SUNREACH_REEF, location: { kind: "ecology", id: "ecology.sunreach" } },
      { id: "step.act7_land_bream", type: "catch-basic-fish", description: "Land a Golden Sea Bream from Sunreach waters", targetId: "fish.sea_bream", targetQuantity: 1, locationAnchor: SUNREACH_REEF, location: { kind: "ecology", id: "ecology.sunreach" } },
      { id: "step.act7_stow_bream", type: "catch-basic-fish", description: "Stow that Sea Bream aboard your skiff", targetId: "fish.sea_bream", targetQuantity: 1, locationAnchor: SUNREACH_REEF, location: { kind: "boat", id: "boat.player_skiff" } },
      { id: "step.act7_sell_bream", type: "sell-fish", description: "Sell the fresh Sea Bream at Sunreach Cove", targetId: "fish.sea_bream", targetQuantity: 1, locationAnchor: SUNREACH_COVE, location: { kind: "market", id: "market.sunreach_cove" } }
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
      "Bring one cove sardine to the fish table, clean it into scraps, and return those nutrients to the terrace soil."
    ],
    completionDialogue: [
      "Now the cove feeds the terrace, and the terrace prepares the next voyage. You understand Sunreach as one living route."
    ],
    objectives: [
      { id: "step.act7_catch_sardine", type: "catch-basic-fish", description: "Catch a Sunreach Sardine in the cove", targetId: "fish.sardine", targetQuantity: 1, locationAnchor: SUNREACH_COVE, location: { kind: "ecology", id: "ecology.sunreach" } },
      { id: "step.act7_clean_sardine", type: "craft-recipe", description: "Clean the Sardine into Fish Scraps", targetId: "recipe.sardine_to_scraps", targetQuantity: 1, locationAnchor: { x: 382, z: 61, name: "Sunreach Fish Table" }, location: { kind: "station", id: "struct.sunreach_fish_table" } },
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
      "You have been to the deep and come back. Good. Now go back to the river you learned in.",
      "Most anglers never return to their first water once they own a boat. That is how they stop learning. Chum the Silverwater run and take a trout out of it."
    ],
    completionDialogue: [
      "Same river, different angler. Keep that in mind every time a water looks beneath you."
    ],
    objectives: [
      {
        id: "step.tides_chum_river",
        type: "chum-school",
        description: "Chum a school in the river",
        targetQuantity: 1,
        locationAnchor: { x: -19.19, z: -40, name: "Silverwater River" },
        location: { kind: "habitat", id: "river" }
      },
      {
        id: "step.tides_hook_river",
        type: "hook-sport-fish",
        description: "Hook a Brook Trout in the river",
        targetId: "fish.trout",
        targetQuantity: 1,
        locationAnchor: { x: -19.19, z: -40, name: "Silverwater River" },
        location: { kind: "habitat", id: "river" }
      },
      {
        id: "step.tides_land_river",
        type: "land-sport-fish",
        description: "Land the trout",
        targetId: "fish.trout",
        targetQuantity: 1,
        locationAnchor: { x: -19.19, z: -40, name: "Silverwater River" }
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
      "Under the trout there is something heavier, and it does not come up for a willow branch.",
      "A catfish holds where the channel runs deepest and it will not be hurried. Bring one in."
    ],
    completionDialogue: [
      "Patience and a rod that can take the weight. That is the whole of it."
    ],
    objectives: [
      {
        id: "step.tides_land_catfish",
        type: "land-sport-fish",
        description: "Land a Channel Catfish",
        targetId: "fish.catfish",
        targetQuantity: 1,
        locationAnchor: { x: -19.19, z: -40, name: "Silverwater River" }
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
      "Pike keep to the lake and they keep to the cold. Come autumn they are everywhere; come high summer you will not find one.",
      "Do not fight the calendar. Go when the water is right, and until then there is other work."
    ],
    completionDialogue: [
      "You waited for the season instead of wearing yourself out against it. That is most of what I know."
    ],
    objectives: [
      {
        id: "step.tides_land_pike",
        type: "land-sport-fish",
        description: "Land a Northern Pike from the lake",
        targetId: "fish.pike",
        targetQuantity: 1,
        locationAnchor: { x: 18, z: 92, name: "Neva Lake" }
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
      "There is a fish in that same lake that shows itself for one season only, and it is the handsomest thing in Neva.",
      "An arowana runs gold along the surface in high summer. You will need a rod with some spine. Miss the season and you wait a year."
    ],
    completionDialogue: [
      "Not many have seen one up close. Fewer have landed one. Write it down."
    ],
    objectives: [
      {
        id: "step.tides_land_arowana",
        type: "land-sport-fish",
        description: "Land a Golden Arowana",
        targetId: "fish.arowana",
        targetQuantity: 1,
        locationAnchor: { x: 18, z: 92, name: "Neva Lake" }
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
      "The sturgeon was here before the harbor was. It runs the coast when the water turns cold and it is heavier than anything you have carried.",
      "Make sure you have somewhere to put it before you hook it. A won fight with nowhere to stow the fish is a lost fish."
    ],
    completionDialogue: [
      "That is an old animal and you brought it in whole. The coast keeps its own records; now you are in them."
    ],
    objectives: [
      {
        id: "step.tides_land_sturgeon",
        type: "land-sport-fish",
        description: "Land a Sturgeon from the coast",
        targetId: "fish.sturgeon",
        targetQuantity: 1,
        locationAnchor: { x: 118, z: 138, name: "Neva Coast" }
      },
      {
        id: "step.tides_sell_sturgeon",
        type: "sell-fish",
        description: "Sell the Sturgeon at the Fish Market",
        targetId: "fish.sturgeon",
        targetQuantity: 1,
        locationAnchor: { x: HARBOR_MARKET.x, z: HARBOR_MARKET.z, name: "Harbor Fish Market" },
        location: { kind: "market", id: "market.harbor" }
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
      "Last thing. Hook a school in each water Neva has — the river, the lake, and the open coast — and then come and tell me.",
      "Not to prove anything to me. So that when someone asks you where a fish lives, you answer from memory instead of guessing."
    ],
    completionDialogue: [
      "Then you can read the water. That is not a rank and nobody will hand you a rod for it. It just means you will keep eating."
    ],
    objectives: [
      {
        id: "step.tides_sweep_river",
        type: "hook-sport-fish",
        description: "Hook a school in the river",
        targetQuantity: 1,
        locationAnchor: { x: -19.19, z: -40, name: "Silverwater River" },
        location: { kind: "habitat", id: "river" }
      },
      {
        id: "step.tides_sweep_lake",
        type: "hook-sport-fish",
        description: "Hook a school in the lake",
        targetQuantity: 1,
        locationAnchor: { x: 18, z: 92, name: "Neva Lake" },
        location: { kind: "habitat", id: "lake" }
      },
      {
        id: "step.tides_sweep_coast",
        type: "hook-sport-fish",
        description: "Hook a school on the coast",
        targetQuantity: 1,
        locationAnchor: { x: 118, z: 138, name: "Neva Coast" },
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
    }
  },

  // ===========================================================================
  // Side track: The Family Ledger (track.homestead)
  //
  // The inheritance premise was three sentences of dialogue and nothing else,
  // and `farm.player_homestead` -- a fully defined second farm -- was referenced
  // by no quest, gate or structure. This chain pays the first off by putting
  // the player to work on the second. It ends on the apple tree, a genuine
  // late goal, which is pacing only a side track can carry.
  // ===========================================================================
  {
    id: "quest.homestead_seed_pouch",
    trackId: HOMESTEAD_QUEST_TRACK_ID,
    actId: "track_homestead",
    actTitle: "The Family Ledger",
    questTitle: "The Seed Pouch",
    speakerId: "npc.elspeth",
    introDialogue: [
      "There is something I kept back, and I am sorry for it. A seed pouch, oilcloth, tied at the neck. It hung in your family's kitchen for as long as I knew them.",
      "The private rows east of the village are theirs too - overgrown now, but the soil under them is the best on this island. Take the pouch. Go and look at what you actually inherited."
    ],
    completionDialogue: [
      "They saved seed every year rather than buy it. That is not thrift. That is a person deciding there will be a next season."
    ],
    objectives: [
      {
        id: "step.homestead_take_pouch",
        type: "talk-npc",
        description: "Take the seed pouch from Elspeth",
        targetId: "npc.elspeth",
        targetQuantity: 1,
        locationAnchor: { x: -63.5, z: -62, name: "Starter Garden Gate" }
      }
    ],
    rewards: {
      items: [{ itemId: "seed.wheat", quantity: 8 }, { itemId: "seed.potato", quantity: 4 }],
      skillXp: [{ skill: "farming", xp: 250 }]
    },
    nextQuestId: "quest.homestead_overgrown_rows"
  },
  {
    id: "quest.homestead_overgrown_rows",
    trackId: HOMESTEAD_QUEST_TRACK_ID,
    actId: "track_homestead",
    actTitle: "The Family Ledger",
    questTitle: "The Overgrown Rows",
    speakerId: "npc.barnaby",
    introDialogue: [
      "So you found the private rows. Good soil, bad state. Nobody has turned it since before you came.",
      "Put the family's own wheat back in it - three rows will do to start - and water them in. Land forgets fast, but it forgives faster."
    ],
    completionDialogue: [
      "Rows in, water on. That plot has been waiting years for exactly that and nothing more."
    ],
    objectives: [
      {
        id: "step.homestead_plant_wheat",
        type: "plant-crop",
        description: "Plant 3 Wheat on the private homestead",
        targetId: "crop.wheat",
        targetQuantity: 3,
        locationAnchor: HOMESTEAD_PLOT,
        location: { kind: "farm", id: "farm.player_homestead" }
      },
      {
        id: "step.homestead_water_wheat",
        type: "water-crop",
        description: "Water the homestead rows",
        targetQuantity: 3,
        locationAnchor: HOMESTEAD_PLOT,
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
    actTitle: "The Family Ledger",
    questTitle: "The First Crop Home",
    speakerId: "npc.barnaby",
    introDialogue: [
      "When it comes ripe, bring it in yourself. All three rows.",
      "Then take one measure to the village stall and sell it there. Not for the coin. So the stall sees that plot is being worked again."
    ],
    completionDialogue: [
      "Word travels faster than wheat. That plot has a name at the market again, and it is yours now."
    ],
    objectives: [
      {
        id: "step.homestead_harvest_wheat",
        type: "harvest-crop",
        description: "Harvest 3 Wheat from the homestead",
        targetId: "crop.wheat",
        targetQuantity: 3,
        locationAnchor: HOMESTEAD_PLOT,
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
    actTitle: "The Family Ledger",
    questTitle: "The Worn Tools",
    speakerId: "npc.barnaby",
    introDialogue: [
      "Look at the mill handle sometime. Worn on one side only, and not by you.",
      "Grind some of that homestead wheat there. Same stone, same handle, same grip. That is the whole inheritance, if you want my opinion on it."
    ],
    completionDialogue: [
      "Every tool on this island is a record of the hands that used it. Yours are on that handle now too."
    ],
    objectives: [
      {
        id: "step.homestead_mill_grain",
        type: "craft-recipe",
        description: "Mill Wheat into Ground Grain at the family mill",
        targetId: "recipe.wheat_to_grain",
        targetQuantity: 1,
        locationAnchor: { x: STARTER_MILL.x, z: STARTER_MILL.z, name: "Village Mill" },
        location: { kind: "station", id: "struct.starter_mill" }
      }
    ],
    rewards: { money: 60, skillXp: [{ skill: "processing", xp: 400 }] },
    nextQuestId: "quest.homestead_orchard"
  },
  {
    id: "quest.homestead_orchard",
    trackId: HOMESTEAD_QUEST_TRACK_ID,
    actId: "track_homestead",
    actTitle: "The Family Ledger",
    questTitle: "The Family Orchard",
    speakerId: "npc.elspeth",
    introDialogue: [
      "One thing is still missing from that plot, and it will take you a long while to put back.",
      "There were apple trees on the homestead. An orchard is not a crop - you will not see fruit for a good long stretch, and whoever plants one is mostly planting it for somebody else. Plant a sapling there. Bring me the first apple off it, whenever that is."
    ],
    completionDialogue: [
      "Then the ledger is current again. Someone kept it before you, and now you are the one keeping it. That is all inheriting anything ever means."
    ],
    objectives: [
      {
        id: "step.homestead_plant_orchard",
        type: "plant-crop",
        description: "Plant an Apple Tree on the homestead",
        targetId: "crop.apple_tree",
        targetQuantity: 1,
        locationAnchor: HOMESTEAD_PLOT,
        location: { kind: "farm", id: "farm.player_homestead" }
      },
      {
        id: "step.homestead_harvest_apple",
        type: "harvest-crop",
        description: "Harvest the first apple",
        targetId: "crop.apple_tree",
        targetQuantity: 1,
        locationAnchor: HOMESTEAD_PLOT,
        location: { kind: "farm", id: "farm.player_homestead" }
      },
      {
        id: "step.homestead_report_elspeth",
        type: "talk-npc",
        description: "Bring the first apple to Elspeth",
        targetId: "npc.elspeth",
        targetQuantity: 1,
        locationAnchor: { x: -63.5, z: -62, name: "Starter Garden Gate" }
      }
    ],
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
      "You kept one order. Good. Now find out what happens when the number on it is large.",
      "Take a bulk order off the board and fill it. Not a basket - a granary's worth. You will learn more about your own storage in one of those than in a season of small deliveries."
    ],
    completionDialogue: [
      "Now you know. Volume pays less for each measure and more in total, and it eats every slot you own while you gather it."
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
      "The other kind of order does not care how much you bring. It cares how fresh it is when it lands on my scales.",
      "Take a fresh-fish order and meet its mark. Buy ice before you sail, not after - the clock starts when the fish does, and no amount of hurry buys back an hour you already spent."
    ],
    completionDialogue: [
      "Ice in the hold and a short route home. That is the entire trick, and most people learn it by losing a catch first."
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
      "There is a third sort, and it is the one that separates anglers. The buyer names a grade, and nothing under it will do.",
      "You cannot hurry a grade. It comes from the fight - a clean one, on tackle that was never over its head. Take a quality order and bring it in at the mark."
    ],
    completionDialogue: [
      "That is the order most people fail. A buyer who can tell the difference is worth more to you than one who cannot."
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
    introDialogue: [
      "Maeve says you have learned volume, freshness and grade. Here is the fourth thing: distance.",
      "Fill an order that has to cross the channel. Everything you already know still applies, only now the clock runs while you are at sea and there is no turning back halfway."
    ],
    completionDialogue: [
      "A crossing turns every one of those lessons into the same lesson. Load for the trip you are actually making."
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
        id: "step.tradelanes_cross_order",
        type: "complete-contract",
        description: "Complete any produce order",
        targetId: "produce",
        targetQuantity: 1,
        locationAnchor: VILLAGE_MARKET_ANCHOR
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
      "Four kinds of promise, and you have kept one of each. Come and tell me what you would say to somebody starting.",
      "Not the prices. Anyone can read prices. What it actually costs you to keep a promise you made three days ago."
    ],
    completionDialogue: [
      "That is the trade. Not the coin - the keeping. Say it to the next one who asks you, and the harbor will be fine."
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
    }
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
      "You have seen these terraces take water. Now watch them lose it. By afternoon the top row is dust again.",
      "Plant a row and then run the cistern through it from the well. You brought a pump across the channel with you, whether or not you thought of it that way."
    ],
    completionDialogue: [
      "One pass of the cistern does what a morning of carrying cans does. Sunreach does not reward effort. It rewards arrangement."
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
        locationAnchor: { x: 451.2, z: 7.4, name: "Sunreach Terrace Well" },
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
      "South of the scrub the reef shelf runs a long way out and nobody works it. Not because it is poor - because it is far from anywhere you could sell in time.",
      "Take the skiff round and bring back an amberjack. Never mind the clock on it yet. I want you to see what is down there first."
    ],
    completionDialogue: [
      "Now you have seen it. That water has been full the whole time we have been selling sardines off the cove wall."
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
      "Here is what this island actually has. Not water. Sun, and wind that never stops, and salt off the cove.",
      "Split a pair of sardines at the fish table and cure them. Ice buys you hours. This buys you weeks, and weeks is what a crossing costs."
    ],
    completionDialogue: [
      "No clock on it now. That is the whole of what Sunreach is for, and it took us two generations to work it out."
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
        locationAnchor: { x: 382, z: 61, name: "Sunreach Fish Table" },
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
      "Now run it the other way. Cured fish across the channel, and sell it in the village where nobody has tasted one in years.",
      "This is the trip we could never make with fresh fish in the hold. Same water, same skiff. The difference is that the cargo stopped counting the hours."
    ],
    completionDialogue: [
      "Sunreach has a market on the other side of the channel now, and it did not need a faster boat. It needed salt."
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
      "So. Come and tell me what you make of us now.",
      "People arrive here and see a place that is short of water. They are not wrong. But short of water is only a problem if you were planning to grow the same things they grow over there."
    ],
    completionDialogue: [
      "Every place is poor in something. The work is finding what it is rich in instead, and Sunreach is rich in exactly one thing. You found it."
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
    rewards: { money: 300, skillXp: [{ skill: "farming", xp: 600 }, { skill: "trading", xp: 600 }] }
  }
];
