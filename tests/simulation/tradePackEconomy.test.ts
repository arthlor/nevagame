import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/simulation/Simulation';
import { TRADE_PACKS } from '../../src/content/tradePacks';
import { InventoryManager } from '../../src/simulation/inventory/InventoryManager';
import { VILLAGE_TRADE_STATIONS } from '../../src/world/VillageTradeLayout';
import { getProcessingStationFrontPosition } from '../../src/world/ProcessingStationApproach';
import { WORLD_MARKET_LOCATIONS } from '../../src/world/WorldGameplayLocations';
import { WorldLayout } from '../../src/world/WorldLayout';
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from '../../src/persistence/SaveSchema';
import { migrateSaveData } from '../../src/persistence/SaveMigrations';
import { migrateTradeEconomy66 } from '../../src/persistence/migrateTradeEconomy66';
import { quoteCraftedTradePack, recordTradePackDelivery, snapshotTradePack, tickTradeDemand } from '../../src/simulation/economy/TradePackEconomy';
import { isValidProcessingJobEconomicSnapshot } from '../../src/simulation/domains/ProcessingDomain';
import predecessor from '../fixtures/save_v65_trade_economy_predecessor.json';
import { TRADE_VEHICLES } from '../../src/content/villageTrade';
import { BOATS } from '../../src/content/boats';
import { villageTradeRouteMeters } from '../../src/simulation/economy/VillageTrade';
import { WORLD_SAILING_ROUTES } from '../../src/world/WorldMoorings';
import { carriagePoint, carriageTuning } from '../../src/simulation/mounts/Carriage';
import { HARBOR_TRADE_MOORING } from '../../src/world/WorldAnchors';
import { cargoPackAsset } from '../../src/render/scene/FishSchoolAssets';
import { questTrackProgress } from '../../src/simulation/core/QuestTypes';
import { installMemoryIndexedDB } from '../helpers/memoryIndexedDB';
import { IndexedDbSaveRepository } from '../../src/persistence/IndexedDbSaveRepository';

function stand(sim: Simulation, p: { x: number; z: number }) {
  Object.assign(sim.state.player, p, { y: WorldLayout.traversalSurfaceHeight(p.x, p.z) + .5 });
}
function prepared(id = 'trade.neva_grain') {
  const sim = new Simulation(), pack = TRADE_PACKS[id];
  sim.state.player.proficiencies.processing = 3000;
  sim.state.player.proficiencies.trading = 3000;
  sim.state.player.money = 10000;
  const inventory = sim.state.inventories[sim.state.player.inventoryId];
  inventory.slots = Array.from({ length: inventory.slotCount }, () => ({}));
  expect(InventoryManager.addItemsAtomically(inventory, pack.inputs)).toBe(true);
  const station = VILLAGE_TRADE_STATIONS.find(station => station.marketId === pack.originMarketId)!;
  stand(sim, getProcessingStationFrontPosition(station.id, station.position)!);
  return { sim, pack, inventory, station };
}
const save = (sim: Simulation): SaveEnvelope => ({ schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 1, state: structuredClone(sim.state) });

function makePack(id: string) {
  const setup = prepared(id);
  expect(setup.sim.startProcessingJob(setup.pack.recipeId, setup.station.id).success).toBe(true);
  const job = Object.values(setup.sim.state.processingJobs)[0];
  setup.sim.advanceGameMinutes(job.effectiveDurationMinutes);
  expect(setup.sim.collectProcessingJob(job.id).success).toBe(true);
  return setup;
}

describe('regional mixed-material trade economy', () => {
  it('offers six local recipes per village, and every input has finite stocked suppliers', () => {
    const sim = new Simulation();
    expect(Object.keys(TRADE_PACKS)).toHaveLength(30);
    for (const station of VILLAGE_TRADE_STATIONS) {
      const rows = sim.inspectProcessingStation(station.id)!.recipes;
      expect(rows).toHaveLength(6);
      expect(rows.filter(row => row.tradeTier === 'harvest')).toHaveLength(2);
      expect(rows.filter(row => row.tradeTier === 'crafted')).toHaveLength(2);
      expect(rows.filter(row => row.tradeTier === 'premium')).toHaveLength(2);
      for (const row of rows) {
        expect(row.tradeDestinations).toHaveLength(4);
        expect(row.replacementCost, row.recipeId).toBeGreaterThan(0);
        for (const input of row.inputs) expect(input.sources?.some(source => source.stock >= input.required), input.itemId).toBe(true);
      }
    }
    expect(sim.inspectProcessingStation('struct.kitchen')!.recipes.some(row => row.result.kind === 'farm-pack')).toBe(false);
  });
  it('rejects missing money, Work, skill or ingredients without any partial debit or RNG movement', () => {
    for (const fail of ['money', 'work', 'processing', 'trading', 'ingredients', 'station']) {
      const { sim, pack, inventory, station } = prepared('trade.neva_feast');
      if (fail === 'money') sim.state.player.money = pack.costMoney - 1;
      if (fail === 'work') sim.state.player.workCapacity.current = 0;
      if (fail === 'processing') sim.state.player.proficiencies.processing = pack.processingXp - 1;
      if (fail === 'trading') sim.state.player.proficiencies.trading = pack.tradingXp - 1;
      if (fail === 'ingredients') inventory.slots[0] = {};
      const before = structuredClone(sim.state);
      const result = sim.startProcessingJob(pack.recipeId, fail === 'station' ? 'struct.trade_pinewatch' : station.id);
      expect(result.success, fail).toBe(false);
      expect(sim.state, fail).toEqual(before);
    }
  });
  it('charges exact gold and captured graded lots once; preserves paid terms across reload and later tuning', () => {
    const { sim, pack, inventory, station } = prepared();
    const wheat = inventory.slots.find(slot => slot.itemId === 'produce.wheat')!;
    wheat.quality = 'fine';
    const beforeMoney = sim.state.player.money;
    expect(sim.startProcessingJob(pack.recipeId, station.id).success).toBe(true);
    const job = Object.values(sim.state.processingJobs)[0];
    expect(job.chargedMoney).toBe(25);
    expect(sim.state.player.money).toBe(beforeMoney - 25);
    expect(job.result.kind).toBe('farm-pack');
    if (job.result.kind !== 'farm-pack') throw new Error('Expected captured pack');
    expect(job.result.lots).toContainEqual({ itemId: 'produce.wheat', quantity: 4, quality: 'fine' });
    expect(job.result.tradePack!.qualityMultiplier).toBeGreaterThan(1);
    expect(job.result.tradePack!.qualityMultiplier).toBeLessThan(1.2);
    const savedJob = structuredClone(job);
    const after = structuredClone(sim.state);
    expect(sim.startProcessingJob(pack.recipeId, station.id).success).toBe(false);
    expect(sim.state).toEqual(after);
    expect(validateSaveEnvelope(save(sim))).toBe(true);
    const restored = new Simulation(migrateSaveData(save(sim)).state);
    expect(restored.state.processingJobs[job.id]).toEqual(savedJob);
    restored.advanceGameMinutes(job.effectiveDurationMinutes);
    expect(restored.collectProcessingJob(job.id).success).toBe(true);
    const cargo = restored.state.fishCargo[restored.state.player.carriedFishCargoId!];
    expect(cargo.kind).toBe('farm');
    if (cargo.kind !== 'farm') throw new Error('Expected pack');
    expect(cargo.tradePack).toEqual(savedJob.result.kind === 'farm-pack' ? savedJob.result.tradePack : null);
    const collected = structuredClone(restored.state);
    expect(restored.collectProcessingJob(job.id).success).toBe(false);
    expect(restored.state).toEqual(collected);
    expect(validateSaveEnvelope(save(restored))).toBe(true);
    const changed = structuredClone(savedJob);
    if (changed.result.kind === 'farm-pack') changed.result.tradePack!.baseValue = 200;
    expect(isValidProcessingJobEconomicSnapshot(changed)).toBe(true);
  });
  it('connects every village both ways through the extended pier and the full Sunreach channel', () => {
    const markets = [...new Set(Object.values(TRADE_PACKS).map(pack => pack.originMarketId))];
    for (const from of markets) for (const to of markets) {
      const length = villageTradeRouteMeters(from, to);
      expect(Number.isFinite(length)).toBe(true);
      expect(length).toBe(villageTradeRouteMeters(to, from));
      const a = WORLD_MARKET_LOCATIONS[from].position, b = WORLD_MARKET_LOCATIONS[to].position;
      expect(length).toBeGreaterThanOrEqual(Math.floor(Math.hypot(a.x - b.x, a.z - b.z)));
    }
    const channel = WORLD_SAILING_ROUTES.find(route => route.id === 'sailing.neva-sunreach')!;
    const channelLength = channel.points.slice(1).reduce((sum, point, i) => sum
      + Math.hypot(point.x - channel.points[i].x, point.z - channel.points[i].z), 0);
    expect(villageTradeRouteMeters('market.village', 'market.sunreach_cove')).toBeGreaterThan(channelLength);
  });
  it('prices longer journeys higher at equal conditions and shares saturation across related recipes', () => {
    const sim = new Simulation();
    const pack = TRADE_PACKS['trade.neva_grain'];
    const snapshot = snapshotTradePack(pack, pack.inputs);
    const nearby = structuredClone(sim.state.markets['market.pinewatch']);
    const far = structuredClone(sim.state.markets['market.reedhaven']);
    const price = (market: typeof nearby) => quoteCraftedTradePack(snapshot, 13, 100, pack.originMarketId, market, 480, sim.state.worldSeed);
    const near = price(nearby), distant = price(far);
    expect(distant.routeMeters).toBeGreaterThan(near.routeMeters);
    expect(distant.finalPrice).toBeGreaterThan(near.finalPrice);
    expect(distant.tradingXp).toBeGreaterThan(near.tradingXp);
    const other = snapshotTradePack(TRADE_PACKS['trade.neva_provisions'], TRADE_PACKS['trade.neva_provisions'].inputs);
    const beforeOther = quoteCraftedTradePack(other, 16, 100, pack.originMarketId, far, 480, sim.state.worldSeed);
    recordTradePackDelivery(far, snapshot);
    expect(price(far).finalPrice).toBeLessThan(distant.finalPrice);
    expect(quoteCraftedTradePack(other, 16, 100, pack.originMarketId, far, 480, sim.state.worldSeed).finalPrice).toBeLessThan(beforeOther.finalPrice);
    const unchangedTextiles = far.tradeDemand!.textiles.supply;
    for (let n = 0; n < 80; n++) recordTradePackDelivery(far, snapshot);
    expect(far.tradeDemand!.provisions.supply).toBe(32);
    expect(far.tradeDemand!.textiles.supply).toBe(unchangedTextiles);
    const live = structuredClone(far), offline = structuredClone(far);
    for (let minute = 540; minute <= 1440; minute += 60) tickTradeDemand(live, minute);
    tickTradeDemand(offline, 1440);
    expect(offline).toEqual(live);
    expect(offline.tradeDemand!.provisions.supply).toBe(16);
  });
  it('sells one mixed pack once and cannot fulfill a loose-produce order or report fake ingredient sales', () => {
    const { sim } = makePack('trade.neva_provisions');
    const cargoId = sim.state.player.carriedFishCargoId!;
    stand(sim, WORLD_MARKET_LOCATIONS['market.pinewatch'].position);
    const events: string[] = [];
    sim.events.on('ItemSold', () => events.push('item'));
    sim.events.on('TradePackSold', e => events.push(e.itemId));
    const contract = sim.state.contracts.find(contract => contract.type === 'produce')!;
    Object.assign(contract, { deliveryMarketId: 'market.pinewatch', targetItemIdOrSpecies: 'produce.tomato', quantityRequired: 30, quantityFulfilled: 0, status: 'active' });
    const before = structuredClone(sim.state);
    expect(sim.execute({ type: 'contract.deliver-fish', contractId: contract.id, cargoId }).success).toBe(false);
    expect(sim.state).toEqual(before);
    const quote = sim.inspectMarketBoard('market.pinewatch')!.tradePackRows.find(row => row.cargoId === cargoId)!;
    expect(quote.breakdown).toBeDefined();
    const sale = sim.sellFishTradePackAtMarket('market.pinewatch', cargoId);
    expect(sale.revenue).toBe(quote.breakdown!.finalPrice);
    expect(events).toEqual(['trade.neva_provisions']);
    expect(sim.state.player.money).toBe(before.player.money + sale.revenue!);
    const sold = structuredClone(sim.state);
    expect(sim.sellFishTradePackAtMarket('market.pinewatch', cargoId).success).toBe(false);
    expect(sim.state).toEqual(sold);
  });
  it('preserves durable freight while fresh and preserved provisions have distinct decay', () => {
    const timber = makePack('trade.pinewatch_timber').sim;
    const fresh = makePack('trade.neva_provisions').sim;
    const preserved = makePack('trade.neva_grain').sim;
    for (const sim of [timber, fresh, preserved]) sim.advanceGameMinutes(120);
    const condition = (sim: Simulation) => sim.state.fishCargo[sim.state.player.carriedFishCargoId!].freshness;
    expect(condition(timber)).toBe(100);
    expect(condition(fresh)).toBeLessThan(condition(preserved));
    expect(condition(preserved)).toBeLessThan(100);
  });
  it('migrates retained v65 truth without repricing cargo, jobs, vehicles or money and is idempotent', () => {
    const old = structuredClone(predecessor) as unknown as SaveEnvelope;
    expect(validateSaveEnvelope(old)).toBe(true);
    const before = structuredClone(old);
    const step = migrateTradeEconomy66(old.state);
    const next = migrateSaveData(old);
    expect(old).toEqual(before);
    for (const key of ['player', 'mounts', 'boats', 'fishCargo', 'processingJobs', 'quests', 'clock', 'rng'] as const) {
      if (key === 'rng') continue;
      expect(step[key]).toEqual(old.state[key]);
    }
    expect(validateSaveEnvelope(next)).toBe(true);
    expect(migrateSaveData(next)).toEqual(next);
    expect(migrateTradeEconomy66(next.state)).toEqual(next.state);
    const corrupt = structuredClone(next);
    corrupt.state.markets['market.village'].tradeDemand!.provisions.supply = NaN;
    expect(validateSaveEnvelope(corrupt)).toBe(false);
  });
  it('rejects corrupted pack terms', () => {
    const { sim, pack, station } = prepared();
    expect(sim.startProcessingJob(pack.recipeId, station.id).success).toBe(true);
    const envelope = save(sim), job = Object.values(envelope.state.processingJobs)[0];
    if (job.result.kind !== 'farm-pack') throw new Error('Expected pack');
    job.result.tradePack!.qualityMultiplier = 100;
    expect(validateSaveEnvelope(envelope)).toBe(false);
    expect(isValidProcessingJobEconomicSnapshot(job)).toBe(false);
  });
  it('packs ingredients split across multiple same-grade satchel slots and reloads the exact paid lots', () => {
    const {sim,pack,station,inventory}=prepared();
    inventory.slots[0].quantity=3;
    inventory.slots[3]={...inventory.slots[0],quantity:5};
    inventory.slots[1].quantity=2;inventory.slots[1].quality='fine';
    inventory.slots[4]={...inventory.slots[1],quantity:2};
    expect(validateSaveEnvelope(save(sim))).toBe(true);
    expect(sim.startProcessingJob(pack.recipeId,station.id).success).toBe(true);
    const job=Object.values(sim.state.processingJobs)[0];
    if(job.result.kind!=='farm-pack') throw new Error('Expected pack');
    expect(job.result.lots).toEqual([
      {itemId:'item.ground_grain',quantity:3},{itemId:'item.ground_grain',quantity:5},
      {itemId:'produce.wheat',quantity:2,quality:'fine'},{itemId:'produce.wheat',quantity:2,quality:'fine'},
      {itemId:'item.linen_roll',quantity:1}
    ]);
    expect(validateSaveEnvelope(save(sim))).toBe(true);
    const restored=new Simulation(migrateSaveData(save(sim)).state);
    restored.advanceGameMinutes(job.effectiveDurationMinutes);
    expect(restored.collectProcessingJob(job.id).success).toBe(true);
    expect(validateSaveEnvelope(save(restored))).toBe(true);
  });
  it('requires the captured fee on a named shipment but keeps legacy jobs valid without it',()=>{
    const {sim,pack,station}=prepared();sim.startProcessingJob(pack.recipeId,station.id);
    const envelope=save(sim),job=Object.values(envelope.state.processingJobs)[0];
    delete job.chargedMoney;
    expect(isValidProcessingJobEconomicSnapshot(job)).toBe(false);
    expect(validateSaveEnvelope(envelope)).toBe(false);
  });
  it('buys the advertised mixed ingredients from finite shelves and pays the quoted total before packing', () => {
    const { sim, pack, station, inventory } = prepared('trade.neva_grain');
    inventory.slots = Array.from({ length: inventory.slotCount }, () => ({}));
    const row = sim.inspectProcessingStation(station.id)!.recipes.find(row => row.recipeId === pack.recipeId)!;
    const initialMoney = sim.state.player.money;
    for (const input of row.inputs) {
      const source = input.sources!.filter(source => source.stock >= input.required).sort((a,b) => a.cost - b.cost)[0];
      stand(sim, WORLD_MARKET_LOCATIONS[source.marketId].position);
      const before = structuredClone(sim.state);
      expect(sim.buyItemAtMarket(source.marketId, input.itemId, source.stock + 1).success).toBe(false);
      expect(sim.state).toEqual(before);
      expect(sim.buyItemAtMarket(source.marketId, input.itemId, input.required)).toMatchObject({success:true,cost:source.cost});
      expect(sim.state.markets[source.marketId].commodities[input.itemId].localSupply).toBe(before.markets[source.marketId].commodities[input.itemId].localSupply-input.required);
    }
    stand(sim, getProcessingStationFrontPosition(station.id, station.position)!);
    expect(sim.startProcessingJob(pack.recipeId,station.id).success).toBe(true);
    expect(initialMoney-sim.state.player.money).toBe(row.replacementCost);
  });
  it('preserves mixed contents and visual identity in all purchased vehicle capacities, including a full ship', () => {
    for (const vehicleTypeId of [...Object.keys(TRADE_VEHICLES),'boat.trading_ship']) {
      const { sim } = makePack('trade.neva_grain');
      const cargoId = sim.state.player.carriedFishCargoId!, template = structuredClone(sim.state.fishCargo[cargoId]);
      delete sim.state.fishCargo[cargoId]; sim.state.player.carriedFishCargoId=null;
      sim.state.player.money=BOATS['boat.trading_ship'].costMoney;
      sim.state.player.proficiencies.trading=30000;
      const offer=sim.inspectTradeVehicle(vehicleTypeId)!; stand(sim,offer.position);
      expect(sim.execute({type:'vehicle.purchase',vehicleTypeId}).success).toBe(true);
      const ship=vehicleTypeId==='boat.trading_ship', vehicleId=ship?'boat.player_trading_ship':vehicleTypeId;
      const vehicle=ship?sim.state.boats[vehicleId]:sim.state.mounts[vehicleId];
      if(ship) {stand(sim,HARBOR_TRADE_MOORING.playerPosition);expect(sim.boardBoat(vehicleId).success).toBe(true);}
      else {const cart=sim.state.mounts[vehicleId];stand(sim,carriagePoint(cart,0,carriageTuning(cart).rearOffset));}
      for(let slot=0;slot<vehicle.fishCargoSlotIds!.length;slot++) {
        const id=`cargo.mixed_${slot}`;
        sim.state.fishCargo[id]={...structuredClone(template),id,location:{type:'player',containerId:'player'}};
        sim.state.player.carriedFishCargoId=id;
        expect(sim.execute(ship?{type:'cargo.stow-aboard',boatId:vehicleId,placement:'hold'}:{type:'cargo.load-carriage',mountId:vehicleId}).success).toBe(true);
      }
      expect(validateSaveEnvelope(save(sim))).toBe(true);
      const restored=new Simulation(migrateSaveData(save(sim)).state);
      for(const id of vehicle.fishCargoSlotIds!) {
        expect(restored.state.fishCargo[id!]).toEqual(sim.state.fishCargo[id!]);
        expect(cargoPackAsset(restored.state.fishCargo[id!])).toBe('prop_trade_pack_provisions_a');
      }
    }
  });
  it('credits actual crafted-pack collection and delivery to the new track without moving an old quest cursor', () => {
    const {sim,pack,station}=prepared();
    const old=structuredClone(sim.state.quests.tracks['track.main']);
    sim.state.quests.completedQuestIds.push('quest.caravan_first_load');
    const restored=new Simulation(structuredClone(sim.state));
    const track=questTrackProgress(restored.state.quests,'track.tradecraft');
    expect(track.activeQuestId).toBe('quest.tradecraft_materials');
    expect(restored.startProcessingJob(pack.recipeId,station.id).success).toBe(true);
    const job=Object.values(restored.state.processingJobs)[0];
    restored.advanceGameMinutes(job.effectiveDurationMinutes);
    expect(restored.collectProcessingJob(job.id).success).toBe(true);
    expect(track.activeStepIndex).toBe(1);
    stand(restored,WORLD_MARKET_LOCATIONS['market.pinewatch'].position);
    expect(restored.sellFishTradePackAtMarket('market.pinewatch',restored.state.player.carriedFishCargoId!).success).toBe(true);
    expect(track.stepProgress['step.tradecraft.materials.deliver']).toBe(1);
    expect(restored.state.quests.tracks['track.main']).toEqual(old);
    expect(validateSaveEnvelope(save(restored))).toBe(true);
  });
  it('discards sealed workshop freight without creating compost or refunding its fee',()=>{
    const {sim}=makePack('trade.highridge_metals');
    const before=structuredClone(sim.state.inventories), money=sim.state.player.money;
    expect(sim.execute({type:'cargo.discard',cargoId:sim.state.player.carriedFishCargoId!})).toMatchObject({success:true,scraps:0});
    expect(sim.state.inventories).toEqual(before); expect(sim.state.player.money).toBe(money);
  });
  it('offers positive purchased-input export margins while keeping vehicle purchases above a single loaded run',()=>{
    const sim=new Simulation();let bestCrafted=0,bestPremium=0;
    for(const station of VILLAGE_TRADE_STATIONS) for(const row of sim.inspectProcessingStation(station.id)!.recipes) {
      const best=row.tradeDestinations![0];
      expect(best.estimatedMargin,row.recipeId).toBeGreaterThan(0);
      if(row.tradeTier==='crafted') bestCrafted=Math.max(bestCrafted,best.estimatedMargin!);
      if(row.tradeTier==='premium') bestPremium=Math.max(bestPremium,best.estimatedMargin!);
    }
    expect(TRADE_VEHICLES['mount.carriage_4'].costMoney).toBeGreaterThan(bestCrafted*2*5);
    expect(TRADE_VEHICLES['mount.carriage_6'].costMoney).toBeGreaterThan(bestPremium*4*5);
    expect(BOATS['boat.trading_ship'].costMoney).toBeGreaterThan(bestPremium*6*10);
  });
  it('recovers a corrupt named-pack primary from the untouched legacy backup',async()=>{
    const restore=installMemoryIndexedDB();
    try {
      const {sim,pack,station}=prepared();sim.startProcessingJob(pack.recipeId,station.id);
      const corrupt=save(sim);Object.values(corrupt.state.processingJobs)[0].chargedMoney=-1;
      const legacy=structuredClone(predecessor) as unknown as SaveEnvelope;
      const db=await new Promise<IDBDatabase>((resolve,reject)=>{
        const open=indexedDB.open('neva_save_db',1);
        open.onupgradeneeded=()=>open.result.createObjectStore('game_saves');
        open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);
      });
      await new Promise<void>((resolve,reject)=>{
        const tx=db.transaction('game_saves','readwrite');
        tx.objectStore('game_saves').put(corrupt,'primary_save');tx.objectStore('game_saves').put(legacy,'backup_save');
        tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
      });
      const loaded=await new IndexedDbSaveRepository().loadGame();
      expect(loaded?.state.player.money).toBe(legacy.state.player.money);
      expect(validateSaveEnvelope(loaded)).toBe(true);
      expect(loaded?.state.processingJobs).toEqual(legacy.state.processingJobs);
    } finally {restore();}
  });
});
