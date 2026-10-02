import { beforeAll, describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { WorldLayout } from "../../src/world/WorldLayout";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { harborCoastCollisionProxies } from "../../src/world/HarborCoastLayout";
import { createWorldStaticPlacements } from "../../src/world/WorldEnvironmentLayout";
import { staticPoseIsClear } from "../../src/physics/StaticCollision";
import { STARTER_DONKEY_ID, playerPoseFromMount } from "../../src/simulation/mounts/Mounts";
import { expectContractsPreserved, expectFarmsPreserved, expectInventoriesPreserved } from "../helpers/migrationPreservation";
import fixture from "../fixtures/save_v32_layout12.json";

const legacy=()=>structuredClone(fixture) as unknown as SaveEnvelope;
beforeAll(()=>ContentRegistry.initializeAndValidate());

function preserveAuthoredMarkets(
  before: SaveEnvelope["state"]["markets"],
  after: SaveEnvelope["state"]["markets"]
): void {
  for (const [marketId, oldMarket] of Object.entries(before)) {
    const migratedMarket = after[marketId];
    expect(migratedMarket, marketId).toBeDefined();
    expect(migratedMarket).toMatchObject({
      id: oldMarket.id,
      name: oldMarket.name,
      regionId: oldMarket.regionId
    });
    const currentCommodityIds = new Set(
      ContentRegistry.markets.get(marketId)?.commodities.map((commodity) => commodity.itemId) ?? []
    );
    for (const [itemId, commodity] of Object.entries(oldMarket.commodities)) {
      if (currentCommodityIds.has(itemId)) {
        expect(migratedMarket!.commodities[itemId], `${marketId}/${itemId}`).toEqual(commodity);
      }
    }
    expect(Object.keys(migratedMarket!.commodities)).toEqual(expect.arrayContaining([...currentCommodityIds]));
  }
}

describe("independent v32 harbor save recovery",()=>{
  it("validates the frozen old layout independently and preserves resources, IDs and both RNG streams",()=>{
    const before=legacy(),untouched=structuredClone(before);
    expect(before.schemaVersion).toBe(32);expect(before.state.world.layoutRevision).toBe(12);
    expect(validateSaveEnvelope(before)).toBe(true);
    const after=migrateSaveData(before);
    expect(after.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(validateSaveEnvelope(after)).toBe(true);
    // Quests gain only the v35 credit ledger, empty for a legacy save.
    expect(after.state.quests.earlyActionCredits).toEqual([]);
    const { earlyActionCredits: _ledger, ...migratedQuests } = after.state.quests;
    expect(migratedQuests, "quests").toEqual(before.state.quests);
    for(const key of ["crops","fishCargo","journal","metadata","clock"] as const)
      expect(after.state[key],key).toEqual(before.state[key]);
    expectInventoriesPreserved(after.state, before.state);
    expectContractsPreserved(after.state,before.state);
    expectFarmsPreserved(after.state,before.state);
    preserveAuthoredMarkets(before.state.markets, after.state.markets);
    expect(before).toEqual(untouched);expect(migrateSaveData(after)).toEqual(after);
  }, 120_000);

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

  it("keeps the former trunk location clear against the composed world's collision proxies",()=>{
    const before=legacy();Object.assign(before.state.player,{x:125,z:65,y:2});
    const after=migrateSaveData(before).state.player;
    // The raw harbor generator still contains a palm here; composition removes
    // it. Recovery must use the same retained placements as the actual world.
    const boxes=harborCoastCollisionProxies(createWorldStaticPlacements(before.state.worldSeed));
    expect(staticPoseIsClear(boxes,after,WorldLayout.traversalSurfaceHeight(after.x,after.z),.4)).toBe(true);
    expect(after).toMatchObject({x:125,z:65});
  });

  it("recovers a pose obstructed by a retained harbor trunk without changing the input or money",()=>{
    const before=legacy();
    const boxes=harborCoastCollisionProxies(createWorldStaticPlacements(before.state.worldSeed));
    const trunk=boxes.find(box=>box.id.endsWith(":trunk")
      && WorldLayout.isWalkable(box.center.x,box.center.z)
      && !WorldLayout.isWater(box.center.x,box.center.z)
      && !staticPoseIsClear([box],box.center,WorldLayout.traversalSurfaceHeight(box.center.x,box.center.z),.4));
    expect(trunk).toBeDefined();
    Object.assign(before.state.player,{x:trunk!.center.x,z:trunk!.center.z,
      y:WorldLayout.traversalSurfaceHeight(trunk!.center.x,trunk!.center.z)+.5});
    const untouched=structuredClone(before);
    expect(staticPoseIsClear(boxes,before.state.player,before.state.player.y-.5,.4)).toBe(false);
    const after=migrateSaveData(before);
    expect(staticPoseIsClear(boxes,after.state.player,
      WorldLayout.traversalSurfaceHeight(after.state.player.x,after.state.player.z),.4)).toBe(true);
    expect(Math.hypot(after.state.player.x-before.state.player.x,after.state.player.z-before.state.player.z)).toBeGreaterThan(.4);
    expect(after.state.player.money).toBe(before.state.player.money);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(before).toEqual(untouched);
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
