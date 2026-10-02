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
      "Take ten wheat to Neva’s packing yard and tie a trade pack. Carry it to our village counter and sell it there first. I want you to know the hand-off before I send you up the road."
    ],
    complete: [
      "Your first Neva stamp. Next time, take that same grain to a village that needs it and compare the offer."
    ],
    objectives: [
      pack('struct.trade_neva', 'wheat', 'Make a wheat trade pack at Neva Packing Yard.', 'step.caravan.first_stamp.pack'),
      deliver('market.village', 'produce.wheat', 'Carry the wheat pack to Neva Trade Counter and sell it.', 1, 'step.caravan.first_stamp.sell')
    ]
  }),
  caravan('first_load', 'Bread for Pinewatch', {
    speakerId: 'npc.maeve', completionSpeakerId: 'npc.rowan', next: 'woodland_return',
    intro: [
      "Rowan needs grain for Pinewatch’s ovens. Make another wheat pack at our yard, sell it at his counter, then find him beside the timber yard."
    ],
    complete: [
      "That’s our next bread batch sorted. We have plenty of flax here; Mara could use some down in Reedhaven."
    ],
    objectives: [
      pack('struct.trade_neva', 'wheat', 'Make a Neva wheat trade pack.'),
      deliver('market.pinewatch', 'produce.wheat', 'Sell the Neva wheat pack at Pinewatch Trade Counter.')
    ]
  }),
  caravan('woodland_return', 'Cloth for the Marsh', {
    speakerId: 'npc.rowan', completionSpeakerId: 'npc.mara', next: 'upland_round',
    intro: [
      "Mara’s stores need flax for wrapping and mending. Pack ours here at Pinewatch, then take the raised road to Reedhaven and sell it at her counter."
    ],
    complete: [
      "Good flax. We’ll put it to use in the stores. If you’re going uphill next, Ada has been asking for our corn."
    ],
    objectives: [
      pack('struct.trade_pinewatch', 'flax', 'Make a Pinewatch flax trade pack.'),
      deliver('market.reedhaven', 'produce.flax', 'Sell the Pinewatch flax pack at Reedhaven Trade Counter.')
    ]
  }),
  caravan('upland_round', 'The Upland Table', {
    speakerId: 'npc.mara', completionSpeakerId: 'npc.ada', next: 'four_wheels', knowledgeId: 'knowledge.village_roads',
    intro: [
      "Pack Reedhaven corn at our yard and take it up to Highridge. Ada’s table could use a change from roots and barley. Watch the bends on the climb."
    ],
    complete: [
      "Corn from the marsh. That will make a welcome supper. We have barley for Neva if you’d like a load for the way down."
    ],
    objectives: [
      pack('struct.trade_reedhaven', 'corn', 'Make a Reedhaven corn trade pack.'),
      deliver('market.highridge', 'produce.corn', 'Sell the Reedhaven corn pack at Highridge Trade Counter.')
    ]
  }),
  caravan('four_wheels', 'Room for Four', {
    speakerId: 'npc.ada', completionSpeakerId: 'npc.maeve', next: 'six_loads',
    intro: [
      "Pack our barley and sell it in Neva. Then visit the cartwright’s barn east of the square and buy the four-pack wagon when you meet the price and Trading requirement."
    ],
    complete: [
      "A horse and four bays of your own. Load from the rear, and leave room for a useful return cargo. You’ve learned enough roads to make the trip count."
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
      "The cartwright has a six-pack wagon now. Save for it and build your Trading experience; we can serve more than one village on a round. Check each counter’s demand before filling it."
    ],
    complete: [
      "Six bays ready. Let’s put grain and tomatoes on the same road, with a different buyer for each."
    ],
    objectives: [
      { id: 'step.caravan.buy_six', type: 'purchase-upgrade', targetId: 'mount.carriage_6', targetQuantity: 1,
        description: 'Buy the six-pack wagon at Neva Cart Workshop.',
        locationAnchor: { x: CART_WORKSHOP.displays[1].x, z: CART_WORKSHOP.displays[1].z, name: 'Neva Cart Workshop' } }
    ]
  }),
  caravan('shared_load', 'Two Counters, One Road', {
    speakerId: 'npc.maeve', completionSpeakerId: 'npc.mara', next: 'sunreach_freight', knowledgeId: 'knowledge.shared_load',
    intro: [
      "Make a Neva wheat pack and load it into the six-pack wagon from the rear. With your hands free, make a tomato pack and load it too.",
      "Sell the wheat in Pinewatch, then the tomatoes in Reedhaven. Check each offer when you arrive; the last sale changes what the next load is worth."
    ],
    complete: [
      "Grain to the forest, tomatoes to the marsh, and only one departure. Maeve has a larger route in mind when you’re ready for the channel."
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
      "Sunreach needs Neva grain. Buy the trading coaster at Seabreak Freight Berth when your gold and Trading experience allow it. She has room for ten packs.",
      "Take ten Neva wheat packs across. Unload and carry each to the Sunreach counter, then speak to Tomas."
    ],
    complete: [
      "Ten packs accounted for. Our ovens will be busy. Before you go home, look at what the terraces can send back."
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
      "Pack our olives at the cove yard and take them to Neva’s counter. Bring back the offer before you fill a whole hold; I’d rather send what the village will use."
    ],
    complete: [
      "Sunreach olives, where your first grain pack was sold. You have a reason to travel both ways now. Keep checking the counters; a good route changes with its buyers."
    ],
    objectives: [
      pack('struct.trade_sunreach', 'olive_tree', 'Make a Sunreach olive trade pack.'),
      deliver('market.village', 'produce.olive', 'Sell the Sunreach olive pack at Neva Trade Counter.')
    ]
  })
];
