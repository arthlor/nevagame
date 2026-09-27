import type { QuestDefinition, QuestObjectiveDefinition } from '../simulation/core/QuestTypes';
import { TRADE_PACKS } from './tradePacks';
import { VILLAGE_TRADE_STATIONS } from '../world/VillageTradeLayout';
import { WORLD_MARKET_LOCATIONS } from '../world/WorldGameplayLocations';

function commission(id: string, title: string, packId: string, marketId: string, lines: string[],
  completionLines: string[], next?: string, knowledgeId?: string): QuestDefinition {
  const pack = TRADE_PACKS[packId];
  const yard = VILLAGE_TRADE_STATIONS.find(station => station.marketId === pack.originMarketId)!;
  const objectives: QuestObjectiveDefinition[] = [
    { id: `step.tradecraft.${id}.make`, type: 'craft-recipe', targetId: pack.recipeId, targetQuantity: 1,
      description: `Make ${pack.name} at ${yard.name}.`, location: { kind: 'station', id: yard.id },
      locationAnchor: { ...yard.position, name: yard.name } },
    { id: `step.tradecraft.${id}.deliver`, type: 'sell-trade-pack', targetId: packId, targetQuantity: 1,
      description: `Sell ${pack.name} at ${marketId === 'market.village' ? 'Neva' : marketId === 'market.sunreach_cove' ? 'Sunreach' : marketId.slice('market.'.length)} Trade Counter.`,
      location: { kind: 'market', id: marketId }, locationAnchor: { ...WORLD_MARKET_LOCATIONS[marketId].position, name: 'Village Trade Counter' } }
  ];
  return { id: `quest.tradecraft_${id}`, trackId: 'track.tradecraft', actId: 'track_tradelanes', actTitle: 'The Working Trader',
    questTitle: title, speakerId: 'npc.maeve', introDialogue: lines,
    completionDialogue: completionLines,
    objectives, rewards: { money: 250, skillXp: [{ skill: 'processing', xp: 150 }, { skill: 'trading', xp: 200 }],
      ...(knowledgeId ? { unlocksKnowledgeIds: [knowledgeId] } : {}) },
    ...(next ? { nextQuestId: `quest.tradecraft_${next}` } : {}) };
}

/** A separate chain preserves every existing caravan quest cursor. */
export const TRADE_CRAFT_QUESTS: QuestDefinition[] = [
  commission('materials', 'What a Load Costs', 'trade.neva_grain', 'market.pinewatch', [
    'A sack of harvest is only the beginning. Our yard can turn milled grain, wheat and linen into a more valuable shipment.',
    'Mill your own grain or buy it at Neva. Pinewatch sells linen, and weaving your own is another option. Bring the materials and the packing fee to our yard.',
    'Read the estimated margin before packing. It counts the cost of replacing your ingredients, even when you grew them. Carry the finished grain sacks to Pinewatch.'
  ], [
    'Pinewatch paid for milled grain in a proper wrap. Count the linen and the packing fee too, even when the wheat came from your own field.',
    'A finished load can earn more than raw harvest, but the next load still needs its materials. Keep that cost in your ledger.'
  ], 'return_goods', 'knowledge.replacement_cost'),
  commission('return_goods', 'Useful Cargo on Both Roads', 'trade.highridge_metals', 'market.reedhaven', [
    'Highridge stocks steel and copper. Pinewatch supplies timber. Bring them together at the Highridge packing yard for a workshop metal crate.',
    'Deliver it to Reedhaven. Metal keeps on the road, but its buyers still fill their stores: a second similar crate may pay less.'
  ], [
    'Reedhaven can use Highridge metal where the wet boards take their toll. You brought the wood and fittings together before anyone had to ask twice.',
    'The crate keeps longer than a meal, but the counter will not pay the same for an endless row of identical crates.'
  ], 'premium'),
  commission('premium', 'Room Is Worth Money', 'trade.reedhaven_expedition', 'market.highridge', [
    'A premium shipment earns more from one wagon space, but requires a practiced maker, an experienced trader and more money up front.',
    'Reedhaven sells rich chum and lures. Bring canvas and timber from Pinewatch, then pack river expedition supplies at the marsh yard and take them uphill.',
    'Preserved provisions keep longer than fresh meals. Spread your deliveries across different kinds of goods; related recipes share the same demand.'
  ], [
    'One wagon bay held a whole expedition’s tools. Preparation gave that space value before the climb began.',
    'The price was earned by the maker, the road and the village that needed the finished supply.'
  ], 'overseas'),
  commission('overseas', 'The Return Manifest', 'trade.sunreach_export', 'market.village', [
    'Sunreach has olives and cured fish, but an export hamper also needs mainland grain and linen. Carry those ingredients out on your next crossing.',
    'At the cove yard, compare the return offers and pack a Sunreach export hamper for Neva. The large freighter carries ten separate packs; each is loaded and carried ashore by hand.'
  ], [
    'The return hamper carried Sunreach olives and cured fish beside grain and linen brought from the mainland.',
    'A good trader sees both halves of the crossing. What the island makes useful comes home with the hold, not as an afterthought.'
  ])
];
