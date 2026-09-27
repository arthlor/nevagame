import type { QuestDefinition, QuestObjectiveDefinition } from '../simulation/core/QuestTypes';
import { VILLAGE_TRADE_STATIONS, CART_WORKSHOP } from '../world/VillageTradeLayout';
import { WORLD_MARKET_LOCATIONS } from '../world/WorldGameplayLocations';
import { HARBOR_TRADE_MOORING } from '../world/WorldAnchors';

const trackId = 'track.caravans';
const marketNames: Record<string, string> = {
  'market.village': 'Neva', 'market.pinewatch': 'Pinewatch', 'market.reedhaven': 'Reedhaven',
  'market.highridge': 'Highridge', 'market.sunreach_cove': 'Sunreach'
};

function pack(stationId: string, crop: string, description: string, id = 'step.caravan.' + stationId + '.pack'): QuestObjectiveDefinition {
  const station = VILLAGE_TRADE_STATIONS.find(s => s.id === stationId)!;
  return { id, type: 'craft-recipe', targetId: 'recipe.pack_' + crop, targetQuantity: 1,
    description, location: { kind: 'station', id: stationId },
    locationAnchor: { ...station.position, name: station.name } };
}
function deliver(marketId: string, itemId: string, description: string, quantity = 1,
  id = 'step.caravan.' + marketId + '.' + itemId): QuestObjectiveDefinition {
  return { id, type: 'sell-trade-pack', targetId: itemId, targetQuantity: quantity,
    description, location: { kind: 'market', id: marketId },
    locationAnchor: { ...WORLD_MARKET_LOCATIONS[marketId].position, name: marketNames[marketId] + ' Trade Counter' } };
}
function caravan(id: string, title: string, options: {
  speakerId: string; completionSpeakerId?: string; intro: string[]; complete: string[];
  objectives: QuestObjectiveDefinition[]; next?: string; knowledgeId?: string; money?: number; tradingXp?: number;
}): QuestDefinition {
  return { id: 'quest.caravan_' + id, trackId, actId: 'track_tradelanes', actTitle: 'The Village Trade Roads',
    questTitle: title, speakerId: options.speakerId, completionSpeakerId: options.completionSpeakerId,
    introDialogue: options.intro, completionDialogue: options.complete, objectives: options.objectives,
    rewards: { money: options.money ?? 120, skillXp: [{ skill: 'trading', xp: options.tradingXp ?? 100 }],
      ...(options.knowledgeId ? { unlocksKnowledgeIds: [options.knowledgeId] } : {}) },
    ...(options.next ? { nextQuestId: 'quest.caravan_' + options.next } : {}) };
}

export const VILLAGE_TRADE_QUESTS: QuestDefinition[] = [
  caravan('first_stamp', 'The First Stamp', {
    speakerId: 'npc.maeve', next: 'first_load', knowledgeId: 'knowledge.packing_stamp', money: 40, tradingXp: 60,
    intro: [
      'Loose grain belongs on the produce stall. A tied trade pack belongs to a packing yard and must be carried to a village counter by hand.',
      'Take ten wheat to Neva’s packing yard, not the kitchen. Tie one pack and sell it here in Neva first. The short trip teaches the hand-off; then we can compare what a longer road pays.'
    ],
    complete: [
      'The counter took the pack, not ten loose handfuls. Its tag records Neva as the place it was made.',
      'Now take the same kind of load to a village that needs our grain. The road, the time and the buyer’s stores will change the price.'
    ],
    objectives: [
      pack('struct.trade_neva', 'wheat', 'Make a wheat trade pack at Neva Packing Yard.', 'step.caravan.first_stamp.pack'),
      deliver('market.village', 'produce.wheat', 'Carry the wheat pack to Neva Trade Counter and sell it.', 1, 'step.caravan.first_stamp.sell')
    ]
  }),
  caravan('first_load', 'Bread for Pinewatch', {
    speakerId: 'npc.maeve', completionSpeakerId: 'npc.rowan', next: 'woodland_return',
    intro: [
      'Pinewatch has flax, apples and timber. None of those make bread. Rowan is expecting Neva grain for the ovens.',
      'Pack ten wheat at our yard, carry it to Pinewatch and sell it at the counter. Compare the offer with your local sale, then speak to Rowan beside the timber yard.'
    ],
    complete: [
      'The wheat is on the bakehouse board. Your Neva stamp tells us where this loaf began before anyone lights an oven.',
      'Our flax and apples can travel out while the grain comes in. Let me show you the next road.'
    ],
    objectives: [
      pack('struct.trade_neva', 'wheat', 'Make a Neva wheat trade pack.'),
      deliver('market.pinewatch', 'produce.wheat', 'Sell the Neva wheat pack at Pinewatch Trade Counter.')
    ]
  }),
  caravan('woodland_return', 'Cloth for the Marsh', {
    speakerId: 'npc.rowan', completionSpeakerId: 'npc.mara', next: 'upland_round',
    intro: [
      'Pinewatch grows flax and apples, and the forest gives us timber. Mara’s dry stores in Reedhaven need cloth more than another log.',
      'Make a flax pack here, take the raised road to Reedhaven and sell it at Mara’s counter. Leave space for what the marsh sends onward.'
    ],
    complete: [
      'Flax stays dry on these boards. We can wrap provisions for the boats without asking Pinewatch to move its forest.',
      'Our corn and carrots have their own road. Highridge is uphill, so mind the bends as well as the price.'
    ],
    objectives: [
      pack('struct.trade_pinewatch', 'flax', 'Make a Pinewatch flax trade pack.'),
      deliver('market.reedhaven', 'produce.flax', 'Sell the Pinewatch flax pack at Reedhaven Trade Counter.')
    ]
  }),
  caravan('upland_round', 'The Upland Table', {
    speakerId: 'npc.mara', completionSpeakerId: 'npc.ada', next: 'four_wheels', knowledgeId: 'knowledge.village_roads',
    intro: [
      'Reedhaven’s raised beds give us corn and carrots. Highridge keeps roots and workshop metal, but the climb makes fresh lowland food dear.',
      'Tie a corn pack at our yard and take it up to Ada. The longer road pays for a useful load only if it arrives in good condition.'
    ],
    complete: [
      'Corn from the wet ground, up here on a dry shelf. You can taste the distance in what this village pays.',
      'We grow barley and potatoes. Pack barley for Neva on your way home; Maeve can show you what the cartwright built for a trader who knows the whole circuit.'
    ],
    objectives: [
      pack('struct.trade_reedhaven', 'corn', 'Make a Reedhaven corn trade pack.'),
      deliver('market.highridge', 'produce.corn', 'Sell the Reedhaven corn pack at Highridge Trade Counter.')
    ]
  }),
  caravan('four_wheels', 'Room for Four', {
    speakerId: 'npc.ada', completionSpeakerId: 'npc.maeve', next: 'six_loads',
    intro: [
      'Highridge barley travels well. Take a pack down to Neva, then look inside the cartwright’s barn east of the square.',
      'The four-pack wagon has its own draft horse. The maker asks for coin and a trader who has earned the experience to guide a loaded carriage.'
    ],
    complete: [
      'Four bays mean fewer empty miles, not four guaranteed good prices. Load each pack from the rear and check the counters before you set out.',
      'That horse and carriage are yours now. Keep the road useful to the villages that built it.'
    ],
    objectives: [
      pack('struct.trade_highridge', 'barley', 'Make a Highridge barley trade pack.'),
      deliver('market.village', 'produce.barley', 'Sell the Highridge barley pack at Neva Trade Counter.'),
      { id: 'step.caravan.buy_four', type: 'purchase-upgrade', targetId: 'mount.carriage_4', targetQuantity: 1,
        description: 'Buy the four-pack wagon at Neva Cart Workshop.',
        locationAnchor: { x: CART_WORKSHOP.displays[0].x, z: CART_WORKSHOP.displays[0].z, name: 'Neva Cart Workshop' } }
    ]
  }),
  caravan('six_loads', 'The Merchant’s Wagon', {
    speakerId: 'npc.maeve', next: 'shared_load',
    intro: [
      'Six bays can serve more than one village on the same round. Fill them all for one counter and its stores will fill too; the next pack may pay less.',
      'The larger carriage is dear for a reason. Build your Trading experience and savings, then buy it at the barn when you can afford both the wagon and the work that follows.'
    ],
    complete: ['The second carriage is ready. Let us put more than one kind of Neva produce on the same road and see what two counters make of it.'],
    objectives: [
      { id: 'step.caravan.buy_six', type: 'purchase-upgrade', targetId: 'mount.carriage_6', targetQuantity: 1,
        description: 'Buy the six-pack wagon at Neva Cart Workshop.',
        locationAnchor: { x: CART_WORKSHOP.displays[1].x, z: CART_WORKSHOP.displays[1].z, name: 'Neva Cart Workshop' } }
    ]
  }),
  caravan('shared_load', 'Two Counters, One Road', {
    speakerId: 'npc.maeve', completionSpeakerId: 'npc.mara', next: 'sunreach_freight', knowledgeId: 'knowledge.shared_load',
    intro: [
      'Make one Neva wheat pack and load it into the six-pack wagon. With your hands free, make a tomato pack and load that beside it.',
      'Take the grain to Pinewatch and the tomatoes to Reedhaven. One route can serve two tables, and each counter’s appetite changes after a sale.'
    ],
    complete: [
      'Wheat went to the forest and tomatoes came to the marsh. The road did not get shorter; you made it work twice.',
      'Leave some space and coin for the next departure. Maeve has a channel manifest that needs a larger hold.'
    ],
    objectives: [
      pack('struct.trade_neva', 'wheat', 'Make a Neva wheat trade pack.', 'step.caravan.shared_load.wheat'),
      { id: 'step.caravan.shared_load.load_wheat', type: 'load-carriage', targetId: 'mount.carriage_6', targetQuantity: 1,
        description: 'Load the wheat pack into your six-pack wagon from the rear.' },
      pack('struct.trade_neva', 'tomato', 'Make a Neva tomato trade pack.', 'step.caravan.shared_load.tomato'),
      { id: 'step.caravan.shared_load.load_tomato', type: 'load-carriage', targetId: 'mount.carriage_6', targetQuantity: 1,
        description: 'Load the tomato pack into your six-pack wagon from the rear.' },
      deliver('market.pinewatch', 'produce.wheat', 'Sell the Neva wheat pack at Pinewatch Trade Counter.', 1, 'step.caravan.shared_load.sell_wheat'),
      deliver('market.reedhaven', 'produce.tomato', 'Sell the Neva tomato pack at Reedhaven Trade Counter.', 1, 'step.caravan.shared_load.sell_tomato')
    ]
  }),
  caravan('sunreach_freight', 'Ten Bays Across the Channel', {
    speakerId: 'npc.maeve', completionSpeakerId: 'npc.tomas', next: 'island_return', knowledgeId: 'knowledge.channel_manifest',
    intro: [
      'Sunreach has dry terraces and salt wind, not enough grain to fill every oven. The broad-deck coaster can take ten separate packs across the channel.',
      'Buy her at Seabreak’s freight berth when your purse and Trading experience allow it. Load village wheat packs one by one, then carry each ashore for sale at Sunreach. Tomas keeps the receiving ledger at the cove.'
    ],
    complete: [
      'Ten Neva stamps on one manifest. The grain is in our stores and the deck is empty again.',
      'This crossing used to spend its hold on the journey out and bring little home. Sunflower seed and olives give you a reason to turn back loaded.'
    ],
    objectives: [
      { id: 'step.caravan.buy_ship', type: 'purchase-upgrade', targetId: 'boat.trading_ship', targetQuantity: 1,
        description: 'Buy the Sunreach trading coaster at Seabreak Freight Berth.',
        locationAnchor: { ...HARBOR_TRADE_MOORING.purchasePosition, name: 'Seabreak Freight Berth' } },
      deliver('market.sunreach_cove', 'produce.wheat', 'Carry and sell ten Neva wheat packs at Sunreach Trade Counter.', 10)
    ]
  }),
  caravan('island_return', 'A Cargo for Home', {
    speakerId: 'npc.tomas', completionSpeakerId: 'npc.maeve', knowledgeId: 'knowledge.return_cargo',
    intro: [
      'Ines tends sunflower seed and olives on the terraces. They take water and patience here; the mainland cannot make them by wishing at an empty market shelf.',
      'Prepare an olive pack at our cove yard. Carry it back to Neva and sell it by hand. Check the return offer before you fill the rest of the hold.'
    ],
    complete: [
      'Olives from the dry terraces, sold where Neva’s grain began its crossing. You have kept the road and the channel useful in both directions.',
      'The ledger is yours to keep reading. A good route changes with weather, supply and the people waiting at its far end.'
    ],
    objectives: [
      pack('struct.trade_sunreach', 'olive_tree', 'Make a Sunreach olive trade pack.'),
      deliver('market.village', 'produce.olive', 'Sell the Sunreach olive pack at Neva Trade Counter.')
    ]
  })
];
