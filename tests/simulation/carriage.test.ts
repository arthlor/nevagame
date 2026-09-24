import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { Simulation } from '../../src/simulation/Simulation';
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from '../../src/persistence/SaveSchema';
import { migrateSaveData, MIGRATIONS } from '../../src/persistence/SaveMigrations';
import legacy from '../fixtures/save_v45_carriage_predecessor.json';
import { WorldLayout } from '../../src/world/WorldLayout';
import { STARTER_CARRIAGE_ID, CARRIAGE_TUNING, carriagePoint, carriagePoseIsClear } from '../../src/simulation/mounts/Carriage';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { createWorldStaticPlacements } from '../../src/world/WorldEnvironmentLayout';
import { projectAssetCollision } from '../../src/physics/CollisionCatalogAdapter';
import { ContentRegistry } from '../../src/content/ContentRegistry';
import type { AssetId } from '../../src/render/assets/AssetCatalog';
import { resolveCargoTemperatureC } from '../../src/simulation/fishing/calculateFreshness';
import { WORLD_LAYOUT_REVISION } from '../../src/world/WorldAnchors';
import { starterStructureAnchor } from '../../src/world/FarmLayout';

function atRear(sim: Simulation) {
  const cart = sim.state.mounts[STARTER_CARRIAGE_ID];
  const rear = carriagePoint(cart, 0, CARRIAGE_TUNING.rearOffset);
  Object.assign(sim.state.player, rear, { y: WorldLayout.traversalSurfaceHeight(rear.x, rear.z) + 0.5 });
}
function carry(sim: Simulation, id: string) {
  sim.state.fishCargo[id] = { id, speciesId: 'fish.trout', weightKg: 3, quality: 'fine',
    caughtAtMinute: sim.state.clock.currentMinute, freshness: 100, cargoClass: ContentRegistry.fishSpecies.get('fish.trout')!.cargoClass,
    location: { type: 'player', containerId: 'player' } };
  sim.state.player.carriedFishCargoId = id;
}
function envelope(sim: Simulation) { return { schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 1, state: structuredClone(sim.state) }; }

function worldBoxes(sim: Simulation) {
  return createWorldStaticPlacements(sim.state.worldSeed).flatMap(p => {
    const root = new Object3D(); root.position.set(p.x, p.y ?? WorldLayout.terrainHeight(p.x,p.z),p.z);
    root.rotation.y = p.rotationY; root.scale.set(...p.scale);
    return projectAssetCollision(p.assetId as AssetId, root, p.id);
  });
}

describe('horse carriage gameplay', () => {
  it('migrates the retained v45 fixture once, adding the carriage and re-anchoring the kitchen', () => {
    const input = structuredClone(legacy) as unknown as ReturnType<typeof envelope>;
    const before = structuredClone(input);
    const migrated = migrateSaveData(input);
    expect(input).toEqual(before);
    expect(migrated.state.mounts[STARTER_CARRIAGE_ID].fishCargoSlotIds).toEqual([null,null]);
    // Isolate the carriage migration's preservation contract. Later migrations
    // intentionally add markets, contract settlement fields and world structures.
    const added = MIGRATIONS[46](input.state) as typeof input.state;
    const { mounts, schemaVersion: _schemaVersion, ...rest } = added;
    const { mounts: priorMounts, schemaVersion: _priorVersion, ...priorRest } = input.state;
    expect(rest).toEqual(priorRest);
    expect(mounts['mount.donkey_starter']).toEqual(priorMounts['mount.donkey_starter']);
    expect(MIGRATIONS[46](added)).toEqual(added);
    expect(migrated.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    const kitchenAnchor = starterStructureAnchor('struct.kitchen')!;
    expect(migrated.state.world.structures['struct.kitchen']).toMatchObject({
      x: kitchenAnchor.x, z: kitchenAnchor.z
    });
    expect(validateSaveEnvelope(migrated)).toBe(true);
    expect(migrateSaveData(migrated)).toEqual(migrated);
  });

  it('parks near the house with the full assembly and its first eight metres clear', () => {
    const sim = new Simulation(); const cart = sim.state.mounts[STARTER_CARRIAGE_ID]; const boxes = worldBoxes(sim);
    for (let distance = 0; distance <= 8; distance += 0.5) expect(carriagePoseIsClear({ ...cart, x: cart.x + distance }, boxes)).toBe(true);
    expect(validateSaveEnvelope(envelope(sim))).toBe(true);
  });

  it('loads exactly two physical packs atomically, refuses a third, and unloads without duplication', () => {
    const sim = new Simulation(); atRear(sim);
    const resources = { work: structuredClone(sim.state.player.workCapacity), rng: sim.rng.getState(), inventory: structuredClone(sim.state.inventories) };
    for (const id of ['cargo.a','cargo.b']) {
      carry(sim,id);
      expect(sim.execute({type:'cargo.load-carriage', mountId:STARTER_CARRIAGE_ID}).success).toBe(true);
      expect(sim.state.player.carriedFishCargoId).toBeNull();
      expect(validateSaveEnvelope(envelope(sim))).toBe(true);
    }
    carry(sim,'cargo.c'); const full = structuredClone(sim.state);
    expect(sim.execute({type:'cargo.load-carriage',mountId:STARTER_CARRIAGE_ID})).toMatchObject({success:false,reason:'Both carriage cargo slots are full'});
    expect(sim.state).toEqual(full);
    expect(sim.execute({type:'cargo.pickup',cargoId:'cargo.a'}).success).toBe(false);
    delete sim.state.fishCargo['cargo.c']; sim.state.player.carriedFishCargoId=null;
    expect(sim.execute({type:'cargo.pickup',cargoId:'cargo.a'}).success).toBe(true);
    expect(sim.execute({type:'cargo.pickup',cargoId:'cargo.a'}).success).toBe(false);
    expect(sim.state.mounts[STARTER_CARRIAGE_ID].fishCargoSlotIds).toEqual([null,'cargo.b']);
    expect(sim.state.player.carriedFishCargoId).toBe('cargo.a');
    expect(validateSaveEnvelope(envelope(sim))).toBe(true);
    expect({work:sim.state.player.workCapacity,rng:sim.rng.getState(),inventory:sim.state.inventories}).toEqual(resources);
  });

  it('rejects remote, mounted and oversized transfers and corrupt slot links', () => {
    const sim = new Simulation(); carry(sim,'cargo.a'); const initial = structuredClone(sim.state);
    expect(sim.execute({type:'cargo.load-carriage',mountId:STARTER_CARRIAGE_ID}).success).toBe(false);
    expect(sim.state).toEqual(initial);
    atRear(sim); sim.state.fishCargo['cargo.a'].cargoClass='gargantuan';
    expect(sim.execute({type:'cargo.load-carriage',mountId:STARTER_CARRIAGE_ID}).success).toBe(false);
    sim.state.fishCargo['cargo.a'].cargoClass=ContentRegistry.fishSpecies.get('fish.trout')!.cargoClass;
    expect(sim.execute({type:'cargo.load-carriage',mountId:STARTER_CARRIAGE_ID}).success).toBe(true);
    const valid=envelope(sim); valid.state.mounts[STARTER_CARRIAGE_ID].fishCargoSlotIds![1]='cargo.a';
    expect(validateSaveEnvelope(valid)).toBe(false);
    const cart=sim.state.mounts[STARTER_CARRIAGE_ID]; Object.assign(sim.state.player,{x:cart.x,y:cart.y+.5,z:cart.z});
    expect(sim.execute({type:'mount.board',mountId:cart.id}).success).toBe(true);
    expect(sim.execute({type:'cargo.pickup',cargoId:'cargo.a'}).success).toBe(false);
    expect(validateSaveEnvelope(envelope(sim))).toBe(true);
    expect(sim.execute({type:'mount.dismount'}).success).toBe(true);
  });

  it('uses the parked carriage climate and preserves cargo through a driving save/reload', async () => {
    const sim=new Simulation(); atRear(sim); carry(sim,'cargo.a'); sim.execute({type:'cargo.load-carriage',mountId:STARTER_CARRIAGE_ID});
    const cart=sim.state.mounts[STARTER_CARRIAGE_ID]; Object.assign(sim.state.player,{x:cart.x,y:cart.y+.5,z:cart.z});
    expect(sim.execute({type:'mount.board',mountId:cart.id}).success).toBe(true);
    const physics=await PhysicsWorld.create(worldBoxes(sim));
    try {
      const start=cart.x;
      for(let n=0;n<120;n++) { const result=physics.step(sim.state,{x:0,z:-1,sprint:true},'mounted',1/60,n/60); const committed=sim.execute({type:'physics.commit',frame:result.frame}); physics.onCommitResult(committed.success); expect(committed.success).toBe(true); }
      expect(cart.x-start).toBeGreaterThan(2);
      expect(cart.fishCargoSlotIds).toEqual(['cargo.a',null]);
      expect(validateSaveEnvelope(envelope(sim))).toBe(true);
      const restored=new Simulation(migrateSaveData(envelope(sim)).state);
      expect(restored.state.mounts[cart.id]).toEqual(cart);
      expect(resolveCargoTemperatureC(sim.state,sim.state.fishCargo['cargo.a'])).toBe(WorldLayout.climateSampleAt(cart.x,cart.z,sim.state.weather).temperatureC);
    } finally { physics.dispose(); }
  });

  it('blocks the horse at an obstacle ahead of the wagon and allows reversing away', async () => {
    const sim=new Simulation(); const cart=sim.state.mounts[STARTER_CARRIAGE_ID]; Object.assign(sim.state.player,{x:cart.x,y:cart.y+.5,z:cart.z}); sim.boardMount(cart.id);
    const barrier={kind:'box' as const,id:'test.wall',center:{x:cart.x+6,y:cart.y+1,z:cart.z},halfExtents:{x:.1,y:1,z:3},rotation:{x:0,y:0,z:0,w:1}};
    const physics=await PhysicsWorld.create([barrier]);
    try {
      const start=cart.x; let blocked=false;
      for(let n=0;n<180;n++){const r=physics.step(sim.state,{x:0,z:-1,sprint:true},'mounted',1/60,n/60);blocked ||= r.playerMotion.isCollisionBlocked;const c=sim.commitPhysicsFrame(r.frame);physics.onCommitResult(c.success);expect(c.success).toBe(true);}
      expect(blocked).toBe(true); expect(cart.x-start).toBeLessThan(1.4);
      const stopped=cart.x;
      for(let n=0;n<60;n++){const r=physics.step(sim.state,{x:0,z:1,sprint:false},'mounted',1/60,n/60);const c=sim.commitPhysicsFrame(r.frame);physics.onCommitResult(c.success);}
      expect(cart.x).toBeLessThan(stopped-.5);
    } finally {physics.dispose();}
  });

  it('trots on a stamina budget, walks when winded, and recovers while walking', async () => {
    const sim=new Simulation(); const cart=sim.state.mounts[STARTER_CARRIAGE_ID];
    Object.assign(sim.state.player,{x:cart.x,y:cart.y+.5,z:cart.z});
    expect(sim.boardMount(cart.id).success).toBe(true);
    expect(sim.inspectWorldHud(null).mount).toMatchObject({current:100,maximum:100,exhausted:false,label:'Trot'});
    const physics=await PhysicsWorld.create(worldBoxes(sim));
    const drive=(sprint:boolean,steps:number,offset:number)=>{
      const gaits:string[]=[]; let peak=0;
      for(let n=0;n<steps;n++){const r=physics.step(sim.state,{x:0,z:-1,sprint},'mounted',1/60,(offset+n)/60);
        gaits.push(r.playerMotion.requestedGait); peak=Math.max(peak,r.playerMotion.speedMetersPerSecond);
        const c=sim.execute({type:'physics.commit',frame:r.frame}); physics.onCommitResult(c.success); expect(c.success).toBe(true);}
      return {gaits,peak};
    };
    try {
      // Trotting spends the horse budget and outruns the walk.
      const trot=drive(true,120,0);
      expect(trot.gaits.at(-1)).toBe('trot');
      expect(trot.peak).toBeGreaterThan(CARRIAGE_TUNING.walkSpeed);
      const spent=sim.state.mounts[STARTER_CARRIAGE_ID]!.gallopStamina;
      expect(spent).toBeLessThan(100);
      expect(spent).toBeGreaterThan(0);
      // Roughly ten seconds of trot winds the team: holding Shift then only
      // walks (or idles against an obstacle) — trot is never granted again.
      // The drive ends right at exhaustion so the winded snapshot below is
      // deterministic: stamina 0 with recovery delay still pending.
      const winded=drive(true,490,120);
      const tail=winded.gaits.slice(-60);
      expect(tail).not.toContain('trot');
      const team=sim.state.mounts[STARTER_CARRIAGE_ID]!;
      expect(team.gallopExhausted).toBe(true);
      expect(team.gallopStamina).toBe(0);
      // A winded team answers Shift with a walk, never a trot: recovery delay
      // is still pending through this probe, so no recovery can sneak in.
      const probe=drive(true,30,610);
      expect(probe.gaits).not.toContain('trot');
      expect(probe.peak).toBeLessThan(CARRIAGE_TUNING.trotSpeed);
      const windedHud=sim.inspectWorldHud(null).mount;
      expect(windedHud).toMatchObject({current:0,exhausted:true,label:'Trot'});
      expect(validateSaveEnvelope(envelope(sim))).toBe(true);
      // Walking is free and recovers the budget past the resume threshold.
      const rest=drive(false,400,640);
      expect(rest.gaits).not.toContain('trot');
      const recovered=sim.state.mounts[STARTER_CARRIAGE_ID]!;
      expect(recovered.gallopStamina).toBe(100);
      expect(recovered.gallopExhausted).toBe(false);
    } finally {physics.dispose();}
  });
});
