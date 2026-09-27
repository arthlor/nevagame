import type { QuestDefinition, QuestObjectiveDefinition } from '../simulation/core/QuestTypes';
import { VILLAGE_TRADE_STATIONS, CART_WORKSHOP } from '../world/VillageTradeLayout';
import { WORLD_MARKET_LOCATIONS } from '../world/WorldGameplayLocations';
import { HARBOR_TRADE_MOORING } from '../world/WorldAnchors';

const trackId = 'track.caravans';
function pack(stationId: string, crop: string): QuestObjectiveDefinition {
  const station = VILLAGE_TRADE_STATIONS.find(s => s.id === stationId)!;
  return { id: `step.caravan.${stationId}.pack`, type: 'craft-recipe', targetId: `recipe.pack_${crop}`, targetQuantity: 1,
    description: `Make a local trade pack at ${station.name}.`, location: { kind: 'station', id: stationId },
    locationAnchor: { ...station.position, name: station.name } };
}
function deliver(marketId: string, itemId: string, quantity = 1): QuestObjectiveDefinition {
  return { id: `step.caravan.${marketId}.${itemId}`, type: 'sell-trade-pack', targetId: itemId, targetQuantity: quantity,
    description: `Carry ${quantity === 1 ? 'a pack' : `${quantity} packs`} to the village trade counter.`, location: { kind: 'market', id: marketId },
    locationAnchor: { ...WORLD_MARKET_LOCATIONS[marketId].position, name: marketId.split('.').at(-1)! } };
}
function quest(id: string, title: string, intro: string[], complete: string[], objectives: QuestObjectiveDefinition[], next?: string): QuestDefinition {
  return { id: `quest.caravan_${id}`, trackId, actId: 'track_tradelanes', actTitle: 'The Village Trade Roads', questTitle: title,
    speakerId: 'npc.maeve', introDialogue: intro, completionDialogue: complete, objectives,
    rewards: { money: 120, skillXp: [{ skill: 'trading', xp: 100 }] }, ...(next ? { nextQuestId: `quest.caravan_${next}` } : {}) };
}
export const VILLAGE_TRADE_QUESTS: QuestDefinition[] = [
  quest('first_load', 'The Packing Yard', [
    'The kitchen is for supper. Trade packs are tied at the village packing yards, and each village has its own specialties.',
    'Take ten wheat to our yard. Read the destination offers, tie a pack, and carry it to Pinewatch. The cartwright keeps larger wagons in the barn east of the square.'
  ], ['That stamp tells Rowan where your wheat was packed. A longer journey earns more, but check demand before you set out.'],
  [pack('struct.trade_neva', 'wheat'), deliver('market.pinewatch', 'produce.wheat')], 'woodland_return'),
  quest('woodland_return', 'A Load for the Marsh', [
    'Pinewatch packs flax and apples. Buy or grow the ingredients, then use Rowan’s packing yard.',
    'Take a flax pack to Reedhaven. Leave room for a return load; empty wagons do not pay for themselves.'
  ], ['The marsh has its own goods to send uphill. Watch what each counter wants today.'],
  [pack('struct.trade_pinewatch', 'flax'), deliver('market.reedhaven', 'produce.flax')], 'upland_round'),
  quest('upland_round', 'Up the Long Road', [
    'Reedhaven packs corn and carrots. Highridge needs provisions, and the climb is part of what its counter pays for.',
    'Load a corn pack at the reed village and bring it to Ada’s counter.'
  ], ['You have learned the long road. Highridge barley and potatoes make a useful homeward load.'],
  [pack('struct.trade_reedhaven', 'corn'), deliver('market.highridge', 'produce.corn')], 'four_wheels'),
  quest('four_wheels', 'Room for Four', [
    'Pack Highridge barley for Neva, then visit the cartwright’s barn east of the village.',
    'A four-pack wagon comes with its own draft horse. Earn the Trading experience and save the price shown at its display bay.'
  ], ['Four loads, one journey. Load from the rear, then climb onto the driver’s bench with empty hands.'],
  [pack('struct.trade_highridge', 'barley'), deliver('market.village', 'produce.barley'),
    { id: 'step.caravan.buy_four', type: 'purchase-upgrade', targetId: 'mount.carriage_4', targetQuantity: 1, description: 'Buy the four-pack wagon at the cart workshop.', locationAnchor: { x: CART_WORKSHOP.displays[0].x, z: CART_WORKSHOP.displays[0].z, name: 'Neva Cart Workshop' } }], 'six_loads'),
  quest('six_loads', 'The Merchant’s Wagon', [
    'A busy route can support a six-pack wagon. More room means more earnings per journey, but selling every load into one village lowers its demand.',
    'Build your trade and buy the larger wagon when both your experience and savings are ready.'
  ], ['Six packs are yours to carry. Plan the turn before you enter a narrow yard.'],
  [{ id: 'step.caravan.buy_six', type: 'purchase-upgrade', targetId: 'mount.carriage_6', targetQuantity: 1, description: 'Buy the six-pack wagon at the cart workshop.', locationAnchor: { x: CART_WORKSHOP.displays[1].x, z: CART_WORKSHOP.displays[1].z, name: 'Neva Cart Workshop' } }], 'sunreach_freight'),
  quest('sunreach_freight', 'Ten Bays Across the Channel', [
    'The broad-deck coaster at Seabreak carries ten packs to Sunreach. She costs a fortune and requires an experienced trader.',
    'Buy her at the freight berth, load village packs one by one, and carry ten wheat packs ashore at Sunreach. There is no unloading fee and no sale from the deck.'
  ], ['You have opened a full freight route. Sunreach olives and sunflower seed give the return crossing a purpose.'],
  [{ id: 'step.caravan.buy_ship', type: 'purchase-upgrade', targetId: 'boat.trading_ship', targetQuantity: 1, description: 'Buy the Sunreach trading coaster.', locationAnchor: { ...HARBOR_TRADE_MOORING.purchasePosition, name: 'Seabreak Freight Berth' } },
    deliver('market.sunreach_cove', 'produce.wheat', 10)], 'island_return'),
  quest('island_return', 'A Cargo for Home', [
    'Sunreach ties its own packs beside the cove market. Prepare an olive pack there and bring it back to Neva.',
    'The distance premium works both ways. Demand decides which return load is worth taking today.'
  ], ['Five packing yards, four roads, and an open channel. You know how to make every leg of the journey count.'],
  [pack('struct.trade_sunreach', 'olive_tree'), deliver('market.village', 'produce.olive')])
];
