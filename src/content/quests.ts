// src/content/quests.ts

import { MAIN_QUEST_TRACK_ID, type QuestDefinition } from "../simulation/core/QuestTypes";
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
    rewards: { money: 300, skillXp: [{ skill: "farming", xp: 900 }, { skill: "processing", xp: 650 }] }
  }
];
