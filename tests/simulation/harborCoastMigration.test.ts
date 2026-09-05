import { beforeAll, describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { WorldLayout } from "../../src/world/WorldLayout";
import { harborCoastCollisionProxies } from "../../src/world/HarborCoastLayout";
import { staticPoseIsClear } from "../../src/physics/StaticCollision";
import { STARTER_DONKEY_ID, playerPoseFromMount } from "../../src/simulation/mounts/Mounts";
import fixture from "../fixtures/save_v32_layout12.json";

const legacy=()=>structuredClone(fixture) as SaveEnvelope;
beforeAll(()=>ContentRegistry.initializeAndValidate());

describe("independent v32 harbor save recovery",()=>{
  it("validates the frozen old layout independently and preserves resources, IDs and both RNG streams",()=>{
    const before=legacy(),untouched=structuredClone(before);
    expect(before.schemaVersion).toBe(32);expect(before.state.world.layoutRevision).toBe(12);
    expect(validateSaveEnvelope(before)).toBe(true);
    const after=migrateSaveData(before);
    expect(after.schemaVersion).toBe(33);expect(after.state.world.layoutRevision).toBe(13);
    expect(validateSaveEnvelope(after)).toBe(true);
    for(const key of ["crops","farms","inventories","fishCargo","markets","contracts","quests","journal","metadata","clock"] as const)
      expect(after.state[key],key).toEqual(before.state[key]);
    expect(before).toEqual(untouched);expect(migrateSaveData(after)).toEqual(after);
  });

  it.each([false,true])("moves an invalid old shore pose to nearby support with its mounted relationship (mounted=%s)",(mounted)=>{
    const before=legacy();const point={x:116,z:WorldLayout.coastlineZ(116)+1};
    Object.assign(before.state.player,point,{y:.5});
    if(mounted){Object.assign(before.state.mounts[STARTER_DONKEY_ID],point);before.state.player.activeMountId=STARTER_DONKEY_ID;}
    const after=migrateSaveData(before).state;
    expect(WorldLayout.isWater(after.player.x,after.player.z)).toBe(false);
    expect(Math.hypot(after.player.x-point.x,after.player.z-point.z)).toBeLessThan(8);
    if(mounted) expect(after.player).toMatchObject(playerPoseFromMount(after.mounts[STARTER_DONKEY_ID]));
    expect(after.player.money).toBe(before.state.player.money);
  });

  it("keeps a valid beach position and only re-grounds its elevation",()=>{
    const before=legacy();Object.assign(before.state.player,{x:132,z:70,y:4});
    const after=migrateSaveData(before).state.player;
    expect(after).toMatchObject({x:132,z:70});
    expect(after.y).toBe(WorldLayout.traversalSurfaceHeight(132,70)+.5);
  });

  it("recovers a saved pose covered by a newly placed trunk using the published collision proxy",()=>{
    const before=legacy();Object.assign(before.state.player,{x:125,z:65,y:2});
    const after=migrateSaveData(before).state.player;
    expect(staticPoseIsClear(harborCoastCollisionProxies(),after,WorldLayout.traversalSurfaceHeight(after.x,after.z),.4)).toBe(true);
    expect(Math.hypot(after.x-125,after.z-65)).toBeLessThan(3);
  });

  it("repairs a stranded docked boat without touching its identity, hold, gear or supplies",()=>{
    const before=legacy();const boat=before.state.boats["boat.player_rowboat"];
    Object.assign(boat,{x:132,z:70,isDocked:true});
    const after=migrateSaveData(before).state.boats[boat.id];
    expect(WorldLayout.isSailable(after.x,after.z)).toBe(true);
    expect(after.fishCargoSlotIds).toEqual(boat.fishCargoSlotIds);
    for (const key of ["id", "boatTypeId", "supplyInventoryId", "upgrades", "fuel", "durability"] as const)
      expect(after[key], key).toEqual(boat[key]);
    expect(validateSaveEnvelope(migrateSaveData(before))).toBe(true);
  });
});
