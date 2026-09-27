import type { QuestDefinition, QuestObjectiveDefinition } from '../simulation/core/QuestTypes';
import { TRADE_PACKS } from './tradePacks';
import { VILLAGE_TRADE_STATIONS } from '../world/VillageTradeLayout';
import { WORLD_MARKET_LOCATIONS } from '../world/WorldGameplayLocations';

function commission(id: string, title: string, packId: string, marketId: string, lines: string[], next?: string): QuestDefinition {
  const pack = TRADE_PACKS[packId];
  const yard = VILLAGE_TRADE_STATIONS.find(station => station.marketId === pack.originMarketId)!;
  const objectives: QuestObjectiveDefinition[] = [
    { id: `step.tradecraft.${id}.make`, type: 'craft-recipe', targetId: pack.recipeId, targetQuantity: 1,
      description: `Make ${pack.name} at ${yard.name}.`, location: { kind: 'station', id: yard.id },
      locationAnchor: { ...yard.position, name: yard.name } },
    { id: `step.tradecraft.${id}.deliver`, type: 'sell-trade-pack', targetId: packId, targetQuantity: 1,
      description: `Carry ${pack.name} to the ${marketId.split('.').at(-1)!.replace('_cove','')} counter.`,
      location: { kind: 'market', id: marketId }, locationAnchor: { ...WORLD_MARKET_LOCATIONS[marketId].position, name: 'Village trade counter' } }
  ];
  return { id: `quest.tradecraft_${id}`, trackId: 'track.tradecraft', actId: 'track_tradelanes', actTitle: 'The Working Trader',
    questTitle: title, speakerId: 'npc.maeve', introDialogue: lines,
    completionDialogue: ['The counter has paid for a finished shipment. Keep enough in your purse for the next load, and check what the other villages want before you set out.'],
    objectives, rewards: { money: 250, skillXp: [{ skill: 'processing', xp: 150 }, { skill: 'trading', xp: 200 }] },
    ...(next ? { nextQuestId: `quest.tradecraft_${next}` } : {}) };
}

/** A separate chain preserves every existing caravan quest cursor. */
export const TRADE_CRAFT_QUESTS: QuestDefinition[] = [
  commission('materials', 'What a Load Costs', 'trade.neva_grain', 'market.pinewatch', [
    'A sack of harvest is only the beginning. Our yard can turn milled grain, wheat and linen into a more valuable shipment.',
    'Mill your own grain or buy it at Neva. Pinewatch sells linen, and weaving your own is another option. Bring the materials and the packing fee to our yard.',
    'Read the estimated margin before packing. It counts the cost of replacing your ingredients, even when you grew them. Carry the finished grain sacks to Pinewatch.'
  ], 'return_goods'),
  commission('return_goods', 'Useful Cargo on Both Roads', 'trade.highridge_metals', 'market.reedhaven', [
    'Highridge stocks steel and copper. Pinewatch supplies timber. Bring them together at the Highridge packing yard for a workshop metal crate.',
    'Deliver it to Reedhaven. Metal keeps on the road, but its buyers still fill their stores: a second similar crate may pay less.'
  ], 'premium'),
  commission('premium', 'Room Is Worth Money', 'trade.reedhaven_expedition', 'market.highridge', [
    'A premium shipment earns more from one wagon space, but requires a practiced maker, an experienced trader and more money up front.',
    'Reedhaven sells rich chum and lures. Bring canvas and timber from Pinewatch, then pack river expedition supplies at the marsh yard and take them uphill.',
    'Preserved provisions keep longer than fresh meals. Spread your deliveries across different kinds of goods; related recipes share the same demand.'
  ], 'overseas'),
  commission('overseas', 'The Return Manifest', 'trade.sunreach_export', 'market.village', [
    'Sunreach has olives and cured fish, but an export hamper also needs mainland grain and linen. Carry those ingredients out on your next crossing.',
    'At the cove yard, compare the return offers and pack a Sunreach export hamper for Neva. The large freighter carries ten separate packs; each is loaded and carried ashore by hand.'
  ])
];
