import { SUNREACH_OFFSET_X } from "../world/WorldIslands";
// src/content/quests.ts

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
    questTitle: "The Inherited Soil",
    speakerId: "npc.elspeth",
    introDialogue: [
      "Welcome to Neva Cove, dear! Your family farmhouse and starter field are waiting for you — they are yours by inheritance, not something you have to buy back from the village.",
      "They once tended these quiet coastal fields and sailed the deep waters beyond the headland. Let's start with the foundation of all life on the island: the soil.",
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
    questTitle: "Morning Dew & Moisture",
    speakerId: "npc.elspeth",
    introDialogue: [
      "Equip your watering can with [3], then approach a thirsty crop and press [E] or left-click it to water.",
      "Keep the soil damp but never drowned. A moisture-fed crop grows strong, and a finer harvest grade earns bonus Farming XP and a line in your journal."
    ],
    completionDialogue: [
      // ONBOARDING_PACE ripens this first bed in a few real minutes; the line
      // used to promise "a morning" and a rest the farmhouse refuses by day.
      "Look how rich and dark the soil looks when watered! This bed was kept warm and fed for you, so the first wheat comes up quickly — the heads will turn gold in a few minutes.",
      "Harvest it when it turns, and start a compost run at the bin by the farmhouse while you wait. Barnaby will tell you what the harvest is for."
    ],
    objectives: [
      {
        id: "step.act1_water_3_crops",
        type: "water-crop",
        description: "Water your planted crops 3 times",
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
      "Hey there! I'm Barnaby, the homestead handyman. That first wheat of yours won't be long — the starter bed is quick.",
      "Harvest it when the heads turn gold, and set the compost bin working: plant matter and a scoop of starter, and the worms do the rest. Then see me by the farmhouse workbench. Farming on Neva isn't just for bread — it's how we supply our fishing trips!"
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
      "Hold [E] to load the cast and let go to send it. When the float dips, tap [Space] to set the hook, then hold [Space] to lift the green bar and keep the fish inside it."
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
      "Cross the bridge into the village and find the produce stall on the square. Sell a little of your harvest there for coin — the catch goes to the harbor, but grain and greens belong to the village."
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
      "She's cleared for sea! I've tucked two Woven Lures into your tackle roll. Arm one with [R] before you set a sport-fishing hook.",
      "Step down to the wooden slip, press [E] to board, and take her out into the bay."
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
      "This is what it's all about. Board your rowboat with your Chum Bucket and Woven Lures, then steer out toward the open water.",
      "Look for circling gulls and water disturbances. Approach the school, cast your chum to ignite a frenzy, arm a lure with [R], and hook the fish!",
      "Manage your line tension: reel when safe, slack when the line strains orange, and counter the runs with [A] and [D].",
      "Stow your catch in the boat hold, race back before freshness drops, collect the pack by hand, and carry it inland to the Village Trade Center."
    ],
    completionDialogue: [
      "Magnificent! You've mastered the first loop of Neva: from wheat seed, to worm, to chum, to lake sport fish, to a hand-carried trade-pack sale!",
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
        location: { kind: "boat", id: "boat.player_rowboat" }
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
      "I've written the method in your journal. Use it whenever the soil needs another season.",
      "And Silas was asking after you down at the pier. Something about the channel, and a boat with an engine in it."
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
        "Sunreach lies across the open channel, and a rowboat will not hold its line in that swell. You want the Coastal Fishing Skiff at the harbor mooring.",
        "She costs 850 in gold, and the broker will not sell a coastal hull to anyone without an Expert's hand on a rod. Nobody hands you that. Fish my waters in their seasons and keep Maeve's fish orders, and the hours will do the rest.",
        "When she is yours, follow the buoys east into the sheltered cove and tie up at the mooring. Tomas keeps that cove. He will be expecting you."
      ]
    },
    introDialogue: [
      "Tie up inside the markers and come up to the landing. Everything else can wait until you are standing on dry stone."
    ],
    completionDialogue: [
      "You came across on your own keel. The rowboats turn back at the markers; most people only try that swell once.",
      "Welcome to Sunreach—warm stone, dry terraces, and a reef that rewards preparation. Ines keeps the terraces above us. She will want to see what your hands do with a dry field."
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
      "Take the skiff round to the reef edge, where the shelf drops away, and chum the school there. That is where this island's fish actually are.",
      "Then work a light line from the deck. The golden sea bream hold along that edge. Bring one home in the hold, collect the pack from the dock, and carry it to the inland Village Trade Center while it is fresh."
    ],
    completionDialogue: [
      "Fresh, local, and landed with room to spare. The reef has answered your preparation, and the inland counter has weighed it fairly."
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
      "Bring two cove sardines to the fish table. Clean them into scraps, press three of those into fertilizer, and return the nutrients to the terrace soil."
    ],
    completionDialogue: [
      "Now the cove feeds the terrace, and the terrace prepares the next voyage. You understand Sunreach as one living route."
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
        locationAnchor: SILVERWATER_RUN,
        location: { kind: "habitat", id: "river" }
      },
      {
        id: "step.tides_hook_river",
        type: "hook-sport-fish",
        description: "Hook a Brook Trout in the river",
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
      "Pike keep to the lake and they keep to the cold. Come autumn they are everywhere; come high summer you will be lucky to see one, and they feed by daylight.",
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
      "There is a fish in that same lake that shows itself for one season only, and it is the handsomest thing in Neva.",
      "An arowana runs gold along the surface in high summer, mostly at dusk and after dark. You will need a rod with some spine — Heavy Sport or better. Out of summer they are scarce enough to call a rumour."
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
      "One more thing, and only if you want it. Out past the shelf there is a fish that does not care how good you are.",
      "A blue marlin. Summer or autumn, first light, the Master rod in your hands. Hook her, and the fight will teach you what every other lesson was for.",
      "Do not keep her if you cannot carry her. A fish that size makes a fool of a boat with no room."
    ],
    completionDialogue: [
      "A silver king, on your own line. I have seen four in my life and put none of them on a deck.",
      "There is nothing left for me to teach you. Go and be the one the other anglers ask."
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
      "There is something I kept back, and I am sorry for it. A seed pouch, oilcloth, tied at the neck. It hung in your family's kitchen for as long as I knew them.",
      "Your farmhouse and starter field are already yours. No deed at the market, no lease to renew. What you can earn here is the cove's trust — take the pouch and help keep the Village Commons in rotation."
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
      "Those eastern rows are the Village Commons: no farmhouse, no private fence, no market claim. Everyone in the cove gets a share when the soil is kept working.",
      "Put the family's saved wheat into three rows and water them in. Your own field is home; this one is how you become part of the place around it."
    ],
    completionDialogue: [
      "Rows in, water on. A commons is not owned by the loudest voice — it lasts because somebody turns the soil when it needs turning."
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
      "When it comes ripe, bring in all three rows yourself. A shared field only matters if its harvest actually reaches people.",
      "Take one measure to the village stall and sell it there. The coin is yours for the work; the useful part is putting fresh food back into the cove's daily trade."
    ],
    completionDialogue: [
      "That is a fair share. The commons has a harvest on the books again, and the cove knows it can count on you."
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
      "Look at the village mill handle sometime. Worn on one side only, and not by you.",
      "Grind some of that commons wheat there. The same stone serves every family in the cove. That is the useful part of an inheritance: a tool kept ready for the next pair of hands."
    ],
    completionDialogue: [
      "Every tool on this island is a record of the hands that used it. Yours are on that handle now too."
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
      "One thing is still missing from the commons, and it will take a long while to grow.",
      "Plant an apple sapling there. An orchard is not a private claim or a quick payout — it is shade and fruit for people you may never meet. Bring me the first apple whenever the tree is ready."
    ],
    completionDialogue: [
      "Then the commons has a future written into it. Your family kept a home for you; you have kept something useful for the people after you. That is how a place remembers us."
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
        locationAnchor: { x: -63.5, z: -62, name: "Starter Garden Gate" }
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
    herald: {
      npcId: "npc.maeve",
      lines: [
        "There is a fourth kind of promise, and Tomas tells it better than I do. It is his island's whole trade.",
        "Take the skiff across and find him at the cove. And look at the board on your way: some of those orders only make sense on the far side of the channel."
      ]
    },
    introDialogue: [
      "Maeve says you have learned volume, freshness and grade. Here is the fourth thing: distance.",
      "Fill an order whose goods have to cross the channel — our olives to the village, or Neva greens to Ines's terraces. Everything you already know still applies, only now the clock runs while you are at sea."
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
      "South of the scrub the reef shelf runs a long way out and nobody works it. Not because it is poor - because it is far from anywhere you could sell in time.",
      "Take the skiff round and bring back an amberjack. They pull like a winch, so you will want Heavy Sport tackle or better; the cove stall keeps a rod for exactly that.",
      "Never mind the clock on it yet. I want you to see what is down there first."
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
        "One more thing before you sail. Silas sent word across with the morning boat: he wants you at the harbor pier.",
        "He says you are still fishing deep water with shore tackle, and that Maeve has an offshore rod on her rack."
      ]
    },
    introDialogue: [
      "You have worked every water this island has, and you are still fishing them with tackle meant for the ones near shore.",
      "There is an offshore rod on Maeve's rack. It is not a reward and nobody is giving it to you. Go and buy it, and then we will talk about where it can take you."
    ],
    completionDialogue: [
      "Now you are carrying something that can hold a fish you cannot see the bottom under. Do not mistake that for being ready."
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
      "Southwest of the working grounds the bottom drops away and stays gone. We call it the trench because nobody has ever had a better word for it.",
      "Swordfish hold there. They come up to feed in the dark and in dirty weather, and they run thickest in autumn and winter. Take the skiff out past where you can see the lighthouse and bring one back. Go on a night you have the fuel to be patient."
    ],
    completionDialogue: [
      "Off the trench and home again. There are maybe four people on this island who have done that, and two of them are standing here."
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
      "Silas will tell you seamanship is the hard part. Silas has never had to explain to a buyer why their order is not on the quay.",
      "Two promises, both kept. One where the grade has to be right, and one where the volume has to be. Different skills entirely, and the harbor needs somebody who has both."
    ],
    completionDialogue: [
      "Grade and volume, in the same season, from the same person. That is not luck twice. That is somebody the harbor can plan around."
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
      "There is a paper the harbor keeps. It is not a licence and it does not let you do anything you cannot already do.",
      "It says the people here will hold an order open for you, because they expect you back. Bring the fee and a case of cured fish for the table, and I will put your name on it."
    ],
    completionDialogue: [
      "Signed. You can carry one more standing order than the board would otherwise give you - not because you are owed it, but because somebody is prepared to wait."
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
        "One more thing, and it is not mine to ask. Elspeth sent word down from the garden: before you take that charter anywhere, she wants you to go round.",
        "Silas first, then back by me, then Barnaby at his bench. Finish with her at the garden gate. It is not work. Humour an old baker."
      ]
    },
    introDialogue: [
      "Before you take that charter anywhere, do one more thing for me, and it is not work.",
      "Go round. Silas, Maeve, Barnaby. Say whatever you say. Then come back and tell me what you think you inherited, now that you have actually done it."
    ],
    completionDialogue: [
      "Soil, a boat, a route and a name at three stalls. None of it was finished when it came to you and none of it will be finished when you hand it on.",
      "That is the whole of it, and it is enough. Go and see what the horizon is for."
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
          "So she is sending you round. Good. Sit a minute.",
          "I am not going to tell you what you did well; you know that. I will tell you the slip was never mine. I only kept it until someone came back for the boat.",
          "Go on to Maeve. She will pretend she is not waiting."
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
          "Round you go, then. I will not keep you long.",
          "The orders will keep coming whether you are here or not, and you will keep choosing. That is all a name on a charter means: people know you will choose well and come back.",
          "Barnaby next. Mind he does not put you to work."
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
          "Come round to see me, have you? That bench of mine has your marks on it now, next to the old ones.",
          "That is the only kind of inheritance I trust — the kind you can wear smooth with your own hands.",
          "Off to Elspeth, then. Take the long way, past the rows. She will ask."
        ]
      },
      {
        id: "step.act10_elspeth",
        type: "talk-npc",
        description: "Return to Elspeth at the garden gate",
        targetId: "npc.elspeth",
        targetQuantity: 1,
        locationAnchor: { x: -63.5, z: -62, name: "Starter Garden Gate" }
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
  }
];
