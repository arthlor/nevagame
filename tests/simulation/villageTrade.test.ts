import { Object3D } from 'three';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { projectAssetCollision } from '../../src/physics/CollisionCatalogAdapter';
import { staticPoseIsClear } from '../../src/physics/StaticCollision';
import { createWorldStaticPlacements, villageTradePlacements } from '../../src/world/WorldEnvironmentLayout';
import type { AssetId } from '../../src/render/assets/AssetCatalog';
import { carriagePoseIsClear, workshopCarriagePoses } from '../../src/simulation/mounts/Carriage';
import { BOAT_MOORINGS, WORLD_SAILING_ROUTES } from '../../src/world/WorldMoorings';
import { canReachDeliveryMarket } from '../../src/simulation/domains/ContractDomain';
import { questTrackProgress } from '../../src/simulation/core/QuestTypes';
import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/simulation/Simulation';
import { ContentRegistry } from '../../src/content/ContentRegistry';
import { TRADE_VEHICLES, VILLAGE_TRADE_GOODS } from '../../src/content/villageTrade';
import { VILLAGE_TRADE_STATIONS } from '../../src/world/VillageTradeLayout';
import { HARBOR_TRADE_MOORING, WORLD_LAYOUT_REVISION } from '../../src/world/WorldAnchors';
import { WorldLayout } from '../../src/world/WorldLayout';
import { getProcessingStationFrontPosition } from '../../src/world/ProcessingStationApproach';
import { carriagePoint, carriageTuning } from '../../src/simulation/mounts/Carriage';
import { InventoryManager } from '../../src/simulation/inventory/InventoryManager';
import { quoteVillageTradePack, villageTradeRouteMeters } from '../../src/simulation/economy/VillageTrade';
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from '../../src/persistence/SaveSchema';
import { migrateSaveData } from '../../src/persistence/SaveMigrations';
import legacy from '../fixtures/save_v64_village_trade_predecessor.json';
import { BOATS, boatMeetsSailingRequirement } from '../../src/content/boats';

function stand(sim: Simulation, point: {x: number; z: number}) {
  Object.assign(sim.state.player, point, {y: WorldLayout.traversalSurfaceHeight(point.x, point.z) + .5});
}
function envelope(sim: Simulation): SaveEnvelope { return { schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 1, state: structuredClone(sim.state) }; }
function carry(sim: Simulation, id: string) {
  sim.state.fishCargo[id] = { id, kind: 'farm', itemId: 'produce.wheat', sourceMarketId: 'market.village', lots: [{itemId:'produce.wheat',quantity:10,quality:'fine'}], quality:'fine', weightKg:10,cargoClass:'medium',caughtAtMinute:sim.state.clock.currentMinute,freshness:100,location:{type:'player',containerId:'player'} };
  sim.state.player.carriedFishCargoId=id;
}

function worldBoxes(sim: Simulation) {
  return createWorldStaticPlacements(sim.state.worldSeed).flatMap(p => {
    const root = new Object3D(); root.position.set(p.x, p.y ?? WorldLayout.terrainHeight(p.x,p.z),p.z);
    root.rotation.y = p.rotationY; root.scale.set(...p.scale);
    return projectAssetCollision(p.assetId as AssetId, root, p.id);
  });
}
describe('village trade loop', () => {
  it('keeps all yard approaches and both loaded-wagon departure lanes clear in the actual world', async () => {
    const sim = new Simulation(); const boxes = worldBoxes(sim);
    for (const station of VILLAGE_TRADE_STATIONS) {
      const front = getProcessingStationFrontPosition(station.id, station.position)!;
      expect(staticPoseIsClear(boxes, front, WorldLayout.traversalSurfaceHeight(front.x, front.z), .4), station.id).toBe(true);
      const road = WorldLayout.nearestRouteDistance(station.position.x, station.position.z);
      expect(road.distance - road.halfWidth, `${station.id} leaves the road open`).toBeGreaterThan(2.1);
    }
    for (const display of workshopCarriagePoses()) {
      for (let d = 0; d <= 8; d += .5) expect(carriagePoseIsClear({ ...display, ...carriagePoint(display, 0, d) }, boxes), `${display.id} at ${d}m`).toBe(true);
      const definition = TRADE_VEHICLES[display.mountTypeId as keyof typeof TRADE_VEHICLES];
      sim.state.player.money = definition.costMoney; sim.state.player.proficiencies.trading = definition.requiredTradingXp;
      stand(sim, sim.inspectTradeVehicle(definition.id)!.position); expect(sim.execute({type:'vehicle.purchase',vehicleTypeId:definition.id}).success).toBe(true);
      const cart = sim.state.mounts[definition.id]; stand(sim, carriagePoint(cart, 0, carriageTuning(cart).rearOffset));
      for (let i=0; i<definition.cargoSlots; i++) { carry(sim, `${cart.id}.load.${i}`); expect(sim.execute({type:'cargo.load-carriage',mountId:cart.id}).success).toBe(true); }
      stand(sim, carriagePoint(cart, 0, carriageTuning(cart).boardOffset)); expect(sim.boardMount(cart.id).success).toBe(true);
      const physics = await PhysicsWorld.create(boxes); const start = {...cart};
      try {
        for (let n=0;n<180;n++) { const result=physics.step(sim.state,{x:0,z:-1,sprint:true},'mounted',1/60,n/60); const commit=sim.commitPhysicsFrame(result.frame);physics.onCommitResult(commit.success);expect(commit.success).toBe(true); }
        expect(Math.hypot(cart.x-start.x,cart.z-start.z)).toBeGreaterThan(3);
        expect(sim.execute({type:'mount.dismount'}).success).toBe(true);
        expect(validateSaveEnvelope(envelope(sim))).toBe(true);
      } finally { physics.dispose(); }
    }
  }, 120000);
  it('recovers only saves overlapping new trade obstacles, including ground cargo on Sunreach', () => {
    const input=structuredClone(legacy) as unknown as SaveEnvelope;
    const station=villageTradePlacements().find(p=>p.id==='struct.trade_sunreach')!;
    const root=new Object3D(); root.position.set(station.x,WorldLayout.terrainHeight(station.x,station.z),station.z);root.rotation.y=station.rotationY;
    const box=projectAssetCollision(station.assetId as AssetId,root,station.id)[0];
    Object.assign(input.state.player,{x:box.center.x,z:box.center.z,y:WorldLayout.traversalSurfaceHeight(box.center.x,box.center.z)+.5});
    input.state.fishCargo['cargo.legacy_ground']={id:'cargo.legacy_ground',kind:'farm',itemId:'produce.wheat',lots:[{itemId:'produce.wheat',quantity:10}],quality:'common',weightKg:10,cargoClass:'medium',caughtAtMinute:480,freshness:91,location:{type:'ground',containerId:'ground',x:box.center.x,z:box.center.z}};
    const before=structuredClone(input);const result=migrateSaveData(input);
    expect(input).toEqual(before);expect(Math.hypot(result.state.player.x-box.center.x,result.state.player.z-box.center.z)).toBeGreaterThan(.4);
    expect(result.state.fishCargo['cargo.legacy_ground'].location).not.toEqual(before.state.fishCargo['cargo.legacy_ground'].location);
    expect(result.state.fishCargo['cargo.legacy_ground'].freshness).toBe(91);expect(result.state.player.money).toBe(before.state.player.money);
    expect(validateSaveEnvelope(result)).toBe(true);expect(migrateSaveData(result)).toEqual(result);
  });
  it('offers every harvest at exactly its local packing yard, never at the kitchen', () => {
    const sim=new Simulation();
    expect(sim.inspectProcessingStation('struct.kitchen')!.recipes.some(r=>r.result.kind==='farm-pack')).toBe(false);
    const offered=new Set<string>();
    for(const station of VILLAGE_TRADE_STATIONS){
      const rows=sim.inspectProcessingStation(station.id)!.recipes;
      expect(rows).toHaveLength(6);
      for(const row of rows){ expect(row.result.kind).toBe('farm-pack'); expect(offered.has(row.recipeId)).toBe(false);offered.add(row.recipeId);expect(row.tradeDestinations).toHaveLength(4); }
    }
    expect(offered.size).toBe(30);
    InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId],[{itemId:'produce.wheat',quantity:10}]);
    const station=VILLAGE_TRADE_STATIONS.find(s=>s.id==='struct.trade_pinewatch')!;
    stand(sim,getProcessingStationFrontPosition(station.id,station.position)!);
    const before=structuredClone(sim.state);
    expect(sim.startProcessingJob('recipe.pack_wheat',station.id).success).toBe(false);
    expect(sim.state).toEqual(before);
  });
  it('pays more money and XP for longer routes at equal demand, and reacts to a glut', () => {
    const sim=new Simulation(), commodity=sim.state.markets['market.village'].commodities['produce.wheat'];
    const lots=[{itemId:'produce.wheat',quantity:10}];const context={absoluteHour:8,worldSeed:sim.state.worldSeed};
    const destinations=Object.keys(VILLAGE_TRADE_GOODS).filter(id=>id!=='market.village').sort((a,b)=>villageTradeRouteMeters('market.village',a)-villageTradeRouteMeters('market.village',b));
    let priorGold=0,priorXp=0;
    for(const destination of destinations){ const quote=quoteVillageTradePack(commodity,lots,100,'market.village',destination,context); expect(quote.finalPrice).toBeGreaterThan(priorGold);expect(quote.tradingXp).toBeGreaterThan(priorXp);priorGold=quote.finalPrice;priorXp=quote.tradingXp; }
    const normal=quoteVillageTradePack(commodity,lots,100,'market.village','market.pinewatch',context);
    const glut=quoteVillageTradePack({...commodity,localSupply:commodity.targetSupply*4},lots,100,'market.village','market.pinewatch',context);
    expect(glut.finalPrice).toBeLessThan(normal.finalPrice);
    expect(quoteVillageTradePack(commodity,lots,100,undefined,'market.pinewatch',context).routeModifier).toBe(1);
  });
  for(const definition of Object.values(TRADE_VEHICLES))it(`requires both gates and carries exactly ${definition.cargoSlots} packs on ${definition.id}`,()=>{
    const sim=new Simulation();const offer=sim.inspectTradeVehicle(definition.id)!;stand(sim,offer.position);
    sim.state.player.money=definition.costMoney;sim.state.player.proficiencies.trading=definition.requiredTradingXp-1;
    const before=structuredClone(sim.state);expect(sim.execute({type:'vehicle.purchase',vehicleTypeId:definition.id}).success).toBe(false);expect(sim.state).toEqual(before);
    sim.state.player.proficiencies.trading++;sim.state.player.money--;expect(sim.execute({type:'vehicle.purchase',vehicleTypeId:definition.id}).success).toBe(false);
    sim.state.player.money++;expect(sim.execute({type:'vehicle.purchase',vehicleTypeId:definition.id})).toMatchObject({success:true,cost:definition.costMoney});
    const mount=sim.state.mounts[definition.id];const rear=carriagePoint(mount,0,carriageTuning(mount).rearOffset);stand(sim,rear);
    for(let i=0;i<definition.cargoSlots;i++){carry(sim,`cargo.test_${i}`);expect(sim.execute({type:'cargo.load-carriage',mountId:mount.id}).success).toBe(true);}
    carry(sim,'cargo.overflow');const full=structuredClone(sim.state);expect(sim.execute({type:'cargo.load-carriage',mountId:mount.id}).success).toBe(false);expect(sim.state).toEqual(full);
    expect(validateSaveEnvelope(envelope(sim))).toBe(true);
    const restored=new Simulation(migrateSaveData(envelope(sim)).state);expect(restored.state.mounts[mount.id].fishCargoSlotIds).toHaveLength(definition.cargoSlots);
    expect(restored.execute({type:'vehicle.purchase',vehicleTypeId:definition.id}).success).toBe(false);
  });
  it('commissions a ten-bay ship, stows ten packs and keeps the rowboat out of open water',()=>{
    const sim=new Simulation();const def=BOATS['boat.trading_ship'];stand(sim,HARBOR_TRADE_MOORING.purchasePosition);
    sim.state.player.money=def.costMoney;sim.state.player.proficiencies.trading=def.requiredSkillXp!.xp;
    expect(sim.execute({type:'vehicle.purchase',vehicleTypeId:def.id}).success).toBe(true);
    const boat=sim.state.boats['boat.player_trading_ship'];expect(boat.fishCargoSlotIds).toHaveLength(10);
    stand(sim,HARBOR_TRADE_MOORING.playerPosition);expect(sim.boardBoat(boat.id).success).toBe(true);
    for(let i=0;i<10;i++){carry(sim,`cargo.ship_${i}`);expect(sim.execute({type:'cargo.stow-aboard',boatId:boat.id,placement:'hold'}).success).toBe(true);}
    carry(sim,'cargo.ship_overflow');const full=structuredClone(sim.state);expect(sim.execute({type:'cargo.stow-aboard',boatId:boat.id,placement:'hold'}).success).toBe(false);expect(sim.state).toEqual(full);
    delete sim.state.fishCargo['cargo.ship_overflow']; sim.state.player.carriedFishCargoId=null;
    const restored=new Simulation(migrateSaveData(envelope(sim)).state);
    expect(canReachDeliveryMarket(restored.state,'market.sunreach_cove')).toBe(true);
    const ship=restored.state.boats[boat.id]; const route=WORLD_SAILING_ROUTES.find(r=>r.id==='sailing.neva-sunreach')!;
    const berth=BOAT_MOORINGS.find(m=>m.id==='mooring.sunreach_trade_ship')!;
    for(const point of [...route.points.slice(1,-1),berth.boatPosition]) {
      const pose={...point,y:0,headingRadians:ship.headingRadians,speed:1};
      const result=restored.commitPhysicsFrame({player:{x:point.x,y:.5,z:point.z,rotationY:ship.headingRadians,traversal:{...restored.state.player.traversal}},boats:{[ship.id]:pose}});
      expect(result.success).toBe(true);expect(ship.x).toBe(point.x);
    }
    expect(restored.dockActiveBoat().success).toBe(true);
    const progress=questTrackProgress(restored.state.quests,'track.caravans');
    progress.activeQuestId='quest.caravan_sunreach_freight';progress.activeStepIndex=1;progress.stepProgress={};
    const money=restored.state.player.money, xp=restored.state.player.proficiencies.trading;
    const prices:number[]=[];
    for(const cargoId of [...ship.fishCargoSlotIds]) {
      stand(restored,berth.playerPosition);expect(restored.pickupFishCargo(cargoId!).success).toBe(true);
      stand(restored,ContentRegistry.markets.get('market.sunreach_cove')!.interactionPosition!);
      const result=restored.sellFishTradePackAtMarket('market.sunreach_cove',cargoId!);expect(result.success).toBe(true);prices.push(result.revenue!);
    }
    expect(ship.fishCargoSlotIds.every(id=>id===null)).toBe(true);
    expect(restored.state.player.money).toBeGreaterThan(money);expect(restored.state.player.proficiencies.trading).toBeGreaterThan(xp);
    expect(prices.at(-1)!).toBeLessThan(prices[0]);
    expect(progress.stepProgress['step.caravan.market.sunreach_cove.produce.wheat']).toBe(10);
    expect(validateSaveEnvelope(envelope(restored))).toBe(true);
    expect(validateSaveEnvelope(envelope(sim))).toBe(true);
    expect(boatMeetsSailingRequirement(def.id,'boat.skiff')).toBe(true);expect(boatMeetsSailingRequirement('boat.rowboat','boat.skiff')).toBe(false);
  });
  it('migrates the retained predecessor once without granting transport or inventing pack origins',()=>{
    const input=structuredClone(legacy) as unknown as SaveEnvelope;const before=structuredClone(input);
    expect(validateSaveEnvelope(input)).toBe(true);
    const result=migrateSaveData(input);expect(input).toEqual(before);expect(result.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    for(const station of VILLAGE_TRADE_STATIONS)expect(result.state.world.structures[station.id].type).toBe('trading-station');
    expect(result.state.mounts['mount.carriage_4']).toBeUndefined();expect(result.state.boats['boat.player_trading_ship']).toBeUndefined();
    expect(result.state.player.money).toBe(before.state.player.money);expect(result.state.inventories).toEqual(before.state.inventories);
    expect(validateSaveEnvelope(result)).toBe(true);expect(migrateSaveData(result)).toEqual(result);
  });
  it('moves a paid kitchen job to the yard without charging again or inventing its origin', () => {
    const sim = new Simulation();
    const station = sim.state.world.structures['struct.trade_neva'];
    stand(sim, getProcessingStationFrontPosition(station.id, station)!);
    InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [
      { itemId: 'produce.wheat', quantity: 10, quality: 'fine' }
    ]);
    expect(sim.startProcessingJob('recipe.pack_wheat', station.id).success).toBe(true);
    const input = envelope(sim);
    input.schemaVersion = input.state.schemaVersion = 64;
    input.state.world.layoutRevision = 33;
    const job = Object.values(input.state.processingJobs)[0];
    job.stationId = 'struct.kitchen';
    if (job.result.kind !== 'farm-pack') throw new Error('Expected a pack job');
    delete job.result.sourceMarketId;
    delete job.result.tradePack;
    delete job.result.tradePackId;
    delete job.chargedMoney;
    for (const yard of VILLAGE_TRADE_STATIONS) delete input.state.world.structures[yard.id];
    expect(validateSaveEnvelope(input)).toBe(true);
    const before = structuredClone(input);
    const migrated = migrateSaveData(input);
    expect(input).toEqual(before);
    expect(migrated.state.processingJobs[job.id]).toEqual({ ...job, stationId: station.id });
    expect(migrated.state.player.workCapacity).toEqual(before.state.player.workCapacity);
    expect(migrated.state.inventories).toEqual(before.state.inventories);
    expect(validateSaveEnvelope(migrated)).toBe(true);
    const restored = new Simulation(migrated.state);
    stand(restored, getProcessingStationFrontPosition(station.id, station)!);
    restored.advanceGameMinutes(job.effectiveDurationMinutes);
    expect(restored.execute({ type: 'processing.collect', jobId: job.id }).success).toBe(true);
    const cargo = restored.state.fishCargo[restored.state.player.carriedFishCargoId!];
    if (cargo.kind !== 'farm') throw new Error('Expected a farm pack');
    expect(cargo.lots).toEqual(job.result.lots);
    expect(cargo.sourceMarketId).toBeUndefined();
    expect(validateSaveEnvelope(envelope(restored))).toBe(true);
  });
});
