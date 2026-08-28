// src/content/quests.ts

import type { QuestDefinition } from "../simulation/core/QuestTypes";
import { HARBOR_DOCK, HARBOR_SILAS_ANCHOR, VILLAGE_MARKET } from "../world/WorldAnchors";
import { starterStructureAnchor } from "../world/FarmLayout";
import { WorldLayout } from "../world/WorldLayout";

const STARTER_FARM_ANCHOR = { x: -65, z: -55, name: "Starter Farm Field" } as const;
const STARTER_MILL = starterStructureAnchor("struct.starter_mill")!;
const WORKBENCH = starterStructureAnchor("struct.workbench")!;
const COMPOST_BIN = starterStructureAnchor("struct.starter_compost")!;
const BRIDGE = WorldLayout.landmark("bridge");
const VILLAGE_MARKET_ANCHOR = { ...VILLAGE_MARKET.position, name: "Village Produce Stall" } as const;
const HARBOR_MARKET = WorldLayout.landmark("fish-market");
const LAKE_SCHOOL_ANCHOR = { x: 18, z: WorldLayout.coastlineZ(18) + 12, name: "Lake Sport-Fishing School" } as const;

export const QUESTS: QuestDefinition[] = [
  // ==========================================
  // ACT 1: HOMESTEAD AWAKENING
  // ==========================================
  {
    id: "quest.act1_welcome",
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
    actId: "act1_homestead",
    actTitle: "Act 1: Homestead Awakening",
    questTitle: "Sowing the First Seeds",
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
    actId: "act1_homestead",
    actTitle: "Act 1: Homestead Awakening",
    questTitle: "Morning Dew & Moisture",
    speakerId: "npc.elspeth",
    introDialogue: [
      "Approach your freshly seeded crops and press [E] or left-click to water them with your watering can.",
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
      skillXp: [{ skill: "farming", xp: 200 }, { skill: "processing", xp: 150 }]
    },
    nextQuestId: "quest.act2_mill_and_craft_chum"
  },
  {
    id: "quest.act2_mill_and_craft_chum",
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
      skillXp: [{ skill: "processing", xp: 350 }]
    },
    nextQuestId: "quest.act3_river_angler"
  },

  // ==========================================
  // ACT 3: THE RIVER'S WHISPERS
  // ==========================================
  {
    id: "quest.act3_river_angler",
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
    rewards: {
      unlocksFeature: "boat.player_rowboat",
      skillXp: [{ skill: "fishing", xp: 350 }]
    },
    nextQuestId: "quest.act5_maiden_voyage"
  },

  // ==========================================
  // ACT 5: THE MAIDEN MARITIME EXPEDITION
  // ==========================================
  {
    id: "quest.act5_maiden_voyage",
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
      unlocksFeature: "feature.expedition_planner"
    }
  }
];
