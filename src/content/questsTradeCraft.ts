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
    "Pinewatch wants Milled Grain Sacks. Mill or buy the grain in Neva, and buy linen in Pinewatch or weave it yourself. Bring those with wheat to our packing yard.",
    "Check the margin before paying the packing fee. It counts replacement costs, even for grain from your own field. Then carry the sacks to Pinewatch."
  ], [
    "Pinewatch has its grain. Keep enough of that payment for the next batch’s linen and packing fee; those costs don’t disappear because you grew the wheat."
  ], 'return_goods', 'knowledge.replacement_cost'),
  commission('return_goods', 'Useful Cargo on Both Roads', 'trade.highridge_metals', 'market.reedhaven', [
    "Reedhaven’s repair crews need a Workshop Metal Crate. Get steel and copper from Highridge, timber from Pinewatch, and pack them at the Highridge yard. Then deliver the crate to Reedhaven."
  ], [
    "That should help with the landing repairs. Metal keeps well on the road, but check demand before making another crate just like it."
  ], 'premium'),
  commission('premium', 'Room Is Worth Money', 'trade.reedhaven_expedition', 'market.highridge', [
    "Highridge wants River Expedition Supplies. Buy rich chum and lures in Reedhaven, bring canvas and timber from Pinewatch, and pack them at the marsh yard.",
    "This load needs more experience and money up front. Read the requirements and margin before you start, then carry it to Highridge."
  ], [
    "One bay carried a whole set of supplies up the hill. Keep that preparation cost in mind when you plan the next load."
  ], 'overseas'),
  commission('overseas', 'The Return Manifest', 'trade.sunreach_export', 'market.village', [
    "Take ground grain and linen to Sunreach on your next crossing. Combine them with local olives and cured fish at the cove yard for a Sunreach Export Hamper.",
    "Carry the hamper back to Neva and sell it. Check the offer before you commit the rest of the hold."
  ], [
    "Mainland grain went out, and an island hamper came home. You’ve made both halves of the crossing useful. I’ll keep an eye out for your next manifest."
  ])
];
