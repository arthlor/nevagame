import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { LIVE_RECIPE_IDS } from "../../src/content/recipes";
import { SCHOOL_SPAWN_POINTS } from "../../src/simulation/domains/FishingDomain";
import { MarketDomain } from "../../src/simulation/domains/MarketDomain";
import { IRRIGATION_FEATURE_ID } from "../../src/simulation/domains/FarmingDomain";
import { determineCropStage, POST_MATURE_MATURE_MINUTES, POST_MATURE_WITHER_MINUTES } from "../../src/simulation/farming/calculateCropGrowth";
import { BasicFishingMinigame } from "../../src/simulation/fishing/BasicFishingMinigame";
import { SeededRng } from "../../src/simulation/core/Rng";
import { applyOfflineProgression } from "../../src/persistence/offlineDelta";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { farmLocalToWorld, STARTER_FARM_LAYOUT, farmWellWorldAnchor } from "../../src/world/FarmLayout";
import { FARMHOUSE_INTERIOR_ORIGIN } from "../../src/world/FarmhouseInterior";
import { HARBOR_DOCK, HARBOR_MARKET, VILLAGE_MARKET } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";
import type { ResolvedPhysicsFrame } from "../../src/simulation/core/PhysicsAdapter";
import type { FishQuality } from "../../src/simulation/core/types";
import { mainQuestTrack } from "../../src/simulation/core/QuestTypes";

function commitPlayerPose(simulation: Simulation, x: number, z: number): void {
  const { player, boats } = simulation.state;
  const frame: ResolvedPhysicsFrame = {
    player: {
      x,
      y: WorldLayout.isInterior(x, z)
        ? 0.67
        : WorldLayout.isWater(x, z)
          ? 0.5
          : WorldLayout.terrainHeight(x, z) + 0.5,
      z,
      rotationY: 0,
      traversal: { ...player.traversal, isGrounded: true }
    },
    boats: Object.fromEntries(
      Object.values(boats).map((boat) => [boat.id, {
        x: boat.x,
        y: boat.y,
        z: boat.z,
        headingRadians: boat.headingRadians,
        speed: boat.speed
      }])
    )
  };
  expect(simulation.execute({ type: "physics.commit", frame })).toMatchObject({ success: true });
}

function plantStarterWheat(sim: Simulation): string {
  const pos = farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, { x: 0, z: 0 });
  commitPlayerPose(sim, pos.x, pos.z);
  const planted = sim.plantCrop("farm.starter_garden", "crop.wheat", pos.x, pos.z);
  expect(planted.success).toBe(true);
  return (planted as { placedCropId: string }).placedCropId;
}

describe("Hunt fixes 2026", () => {
  it("B1: wheat planted at 08:00 on starter soil is still harvestable after restUntilDawn and after 6h", () => {
    const overnight = new Simulation();
    const wheatId = plantStarterWheat(overnight);
    overnight.setDebugMinute(22 * 60);
    commitPlayerPose(overnight, FARMHOUSE_INTERIOR_ORIGIN.x, FARMHOUSE_INTERIOR_ORIGIN.z);
    expect(overnight.execute({ type: "player.rest-until-dawn" })).toMatchObject({ success: true });
    expect(["mature", "overripe"]).toContain(overnight.state.crops[wheatId].stage);

    const sixHours = new Simulation();
    const wheat6 = plantStarterWheat(sixHours);
    sixHours.advanceGameMinutes(6 * 60);
    expect(["mature", "overripe", "growing"]).toContain(sixHours.state.crops[wheat6].stage);
    expect(sixHours.state.crops[wheat6].stage).not.toBe("withered");
  });

  it("B1: better climate does not shrink the post-mature harvest window", () => {
    const base = 180;
    expect(determineCropStage(base + POST_MATURE_MATURE_MINUTES - 1, base)).toBe("mature");
    expect(determineCropStage(base + POST_MATURE_WITHER_MINUTES - 1, base)).toBe("overripe");
    expect(determineCropStage(base + POST_MATURE_WITHER_MINUTES, base)).toBe("withered");
  });

  it("B3: basic catch quality is FishQuality only", () => {
    const rng = new SeededRng(7);
    const qualities = new Set<FishQuality>();
    for (let i = 0; i < 40; i += 1) {
      qualities.add(BasicFishingMinigame.determineQuality(0.9, true, rng));
      qualities.add(BasicFishingMinigame.determineQuality(0.2, false, rng));
    }
    for (const quality of qualities) {
      expect(["common", "fine", "exceptional", "trophy"]).toContain(quality);
    }
    expect(qualities.has("common" as FishQuality)).toBe(true);
  });

  it("H4/H5: empty irrigate and max-fertility fertilize still succeed for quests", () => {
    const sim = new Simulation();
    sim.state.quests.unlockedFeatureIds.push(IRRIGATION_FEATURE_ID);
    const well = farmWellWorldAnchor(STARTER_FARM_LAYOUT.farmId)!;
    commitPlayerPose(sim, well.x, well.z);
    const irrigate = sim.execute({ type: "farm.irrigate", farmId: "farm.starter_garden" });
    expect(irrigate.success).toBe(true);
    expect(irrigate.reason).toBe("already-wet");

    sim.state.farms["farm.starter_garden"].soil.fertility = 100;
    const fertilizerBefore = InventoryManager.getItemCount(
      sim.state.inventories[sim.state.player.inventoryId],
      "item.basic_fertilizer"
    );
    const fertilize = sim.execute({ type: "farm.apply-fertilizer", farmId: "farm.starter_garden" });
    expect(fertilize.success).toBe(true);
    expect(InventoryManager.getItemCount(
      sim.state.inventories[sim.state.player.inventoryId],
      "item.basic_fertilizer"
    )).toBe(fertilizerBefore);
  });

  it("H6: boat.refuel consumes fuel and fills the tank", () => {
    const sim = new Simulation();
    sim.state.boats["boat.player_skiff"] = {
      id: "boat.player_skiff",
      boatTypeId: "boat.skiff",
      x: HARBOR_DOCK.boatPosition.x,
      y: 0,
      z: HARBOR_DOCK.boatPosition.z,
      headingRadians: 0,
      speed: 0,
      fuel: 10,
      durability: 250,
      fishCargoSlotIds: [null, null, null, null, null, null],
      supplyInventoryId: "inv.skiff_supply",
      upgrades: [],
      isDocked: true,
      dockedMarketId: "market.harbor"
    };
    sim.state.inventories["inv.skiff_supply"] = InventoryManager.createInventory("inv.skiff_supply", 8);
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    expect(InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.boat_fuel", quantity: 1 }])).toBe(true);
    commitPlayerPose(sim, HARBOR_DOCK.boatPosition.x, HARBOR_DOCK.boatPosition.z);
    expect(sim.execute({ type: "boat.refuel", boatId: "boat.player_skiff" })).toMatchObject({ success: true });
    const capacity = ContentRegistry.boats.get("boat.skiff")!.fuelCapacity;
    expect(sim.state.boats["boat.player_skiff"].fuel).toBe(capacity);
    expect(InventoryManager.getItemCount(inventory, "item.boat_fuel")).toBe(0);
  });

  it("H7/H8: carp scraps is live; flax and barley seeds are XP-gated at the village stall", () => {
    expect(LIVE_RECIPE_IDS.has("recipe.carp_to_scraps")).toBe(true);
    // The real contract is that every authored recipe is live, not that there
    // are exactly N of them. Sunreach added two and this asserted 9.
    expect(LIVE_RECIPE_IDS.size).toBe(ContentRegistry.recipes.size);
    for (const recipe of ContentRegistry.recipes.values()) {
      expect(LIVE_RECIPE_IDS.has(recipe.id), recipe.id).toBe(true);
    }
    const sim = new Simulation();
    sim.state.player.x = VILLAGE_MARKET.position.x;
    sim.state.player.z = VILLAGE_MARKET.position.z;
    sim.state.player.money = 5000;
    expect(sim.buySeedAtMarket("market.village", "seed.barley", 1).success).toBe(false);
    sim.state.player.proficiencies.farming = 500;
    expect(sim.buySeedAtMarket("market.village", "seed.barley", 1).success).toBe(true);
    expect(sim.buySeedAtMarket("market.village", "seed.flax", 1).success).toBe(false);
    sim.state.player.proficiencies.farming = 3000;
    expect(sim.buySeedAtMarket("market.village", "seed.flax", 1).success).toBe(true);
  });

  it("H9: an offshore school spawn point exists on water", () => {
    const offshore = SCHOOL_SPAWN_POINTS.find((point) => point.habitatId === "offshore");
    expect(offshore).toBeDefined();
    expect(WorldLayout.fishingHabitatAt(offshore!.x, offshore!.z)).toBe("offshore");
  });

  it("H11: sturgeon cannot hook before a large slot exists", () => {
    const sim = new Simulation();
    const coast = { x: 118, z: WorldLayout.coastlineZ(118) + 58 };
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.chum_bucket", quantity: 1 }]);
    sim.state.player.equippedRodId = "rod.heavy_sport";
    sim.state.player.ownedRodIds = ["rod.willow", "rod.heavy_sport"];
    const schoolId = sim.spawnFishSchool("coast", coast.x, coast.z, ["fish.sturgeon"]);
    sim.state.player.x = coast.x;
    sim.state.player.z = coast.z;
    expect(sim.chumFishSchool(schoolId).success).toBe(true);
    expect(sim.hookSportFish(schoolId)).toMatchObject({
      success: false,
      reason: "No cargo space for the fish in this school"
    });
    expect(sim.state.world.activeSchools[schoolId]).toBeDefined();
  });

  it("M6: irrigation pump is not an open Act 1 shop verb", () => {
    const sim = new Simulation();
    const well = farmWellWorldAnchor(STARTER_FARM_LAYOUT.farmId)!;
    commitPlayerPose(sim, well.x, well.z);
    sim.state.player.money = 500;
    expect(sim.execute({ type: "farm.buy-irrigation" }).success).toBe(false);
    mainQuestTrack(sim.state.quests).activeQuestId = "quest.act6_field_pump";
    expect(sim.execute({ type: "farm.buy-irrigation" }).success).toBe(true);
  });

  it("M10: buys cannot exceed localSupply and cannot profit on buyback", () => {
    const sim = new Simulation();
    sim.state.player.x = HARBOR_MARKET.position.x;
    sim.state.player.z = HARBOR_MARKET.position.z;
    const ice = sim.state.markets["market.harbor"].commodities["item.crushed_ice"];
    ice.localSupply = 2.4;
    expect(sim.buyItemAtMarket("market.harbor", "item.crushed_ice", 3).success).toBe(false);
    const buy = sim.buyItemAtMarket("market.harbor", "item.crushed_ice", 1);
    expect(buy.success).toBe(true);
    const sell = sim.sellItemAtMarket("market.harbor", "item.crushed_ice", 1);
    expect(sell.success).toBe(true);
    expect(buy.cost!).toBeGreaterThan(sell.revenue!);
    expect(MarketDomain.BUY_MARKUP).toBe(1.25);
  });

  it("M12: docked/idle boats do not drain fuel offline", () => {
    const sim = new Simulation();
    sim.state.boats["boat.player_skiff"] = {
      id: "boat.player_skiff",
      boatTypeId: "boat.skiff",
      x: HARBOR_DOCK.boatPosition.x,
      y: 0,
      z: HARBOR_DOCK.boatPosition.z,
      headingRadians: 0,
      speed: 0,
      fuel: 80,
      durability: 250,
      fishCargoSlotIds: [null, null, null, null, null, null],
      supplyInventoryId: "inv.skiff_idle",
      upgrades: [],
      isDocked: true,
      dockedMarketId: "market.harbor"
    };
    sim.state.inventories["inv.skiff_idle"] = InventoryManager.createInventory("inv.skiff_idle", 8);
    sim.state.metadata.lastSavedUtcMs = 0;
    applyOfflineProgression(sim.state, 72 * 60 * 60 * 1000);
    expect(sim.state.boats["boat.player_skiff"].fuel).toBe(80);
  });

  it("L3/B3: schema v22 backfills knowledge and remaps iridium quality", () => {
    const state = createInitialGameState();
    const legacy = {
      schemaVersion: 21,
      savedAtUtcMs: 1,
      state: {
        ...state,
        schemaVersion: 21,
        journal: {
          ...state.journal,
          unlockedKnowledge: undefined as unknown as string[],
          fishRecords: { "fish.perch": { caughtCount: 1, bestQuality: "iridium" as never } }
        }
      }
    };
    const migrated = migrateSaveData(legacy as never);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(Array.isArray(migrated.state.journal.unlockedKnowledge)).toBe(true);
    expect(migrated.state.journal.fishRecords["fish.perch"]?.bestQuality).toBe("trophy");
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });

  it("L6: dry inland cells are not a fishing habitat", () => {
    const origin = STARTER_FARM_LAYOUT.origin;
    expect(WorldLayout.isWater(origin.x, origin.z)).toBe(false);
    expect(WorldLayout.nearbyFishingHabitat(origin.x, origin.z, 4.5)).toBeNull();
  });

  it("H3: Silas commission intro is reachable without 30G and grain", () => {
    const sim = new Simulation();
    const silas = ContentRegistry.npcs.get("npc.silas")!;
    sim.state.player.x = silas.anchor.x;
    sim.state.player.z = silas.anchor.z;
    sim.state.player.money = 0;
    mainQuestTrack(sim.state.quests).activeQuestId = "quest.act4_restore_rowboat";
    mainQuestTrack(sim.state.quests).activeStepIndex = 0;
    mainQuestTrack(sim.state.quests).stepProgress = {};
    const intro = sim.execute({ type: "quest.talk-npc", npcId: "npc.silas" }) as { success: boolean; dialogue?: string[] };
    expect(intro.success).toBe(true);
    expect(intro.dialogue?.length).toBeGreaterThan(0);
    expect(mainQuestTrack(sim.state.quests).activeQuestId).toBe("quest.act4_restore_rowboat");
    expect(sim.state.quests.unlockedFeatureIds.includes("boat.player_rowboat")).toBe(false);
  });

  it("produce contracts omit minQuality because harvested items have no quality field", () => {
    for (const template of ContentRegistry.contractTemplates.values()) {
      if (template.type === "produce") {
        expect(template.minQuality, template.id).toBeUndefined();
      }
    }
    const sim = new Simulation();
    const produce = sim.state.contracts.filter((contract) => contract.type === "produce");
    expect(produce.length).toBeGreaterThan(0);
    expect(produce.every((contract) => contract.minQuality === undefined)).toBe(true);
  });

  it("item deliveries ignore a leftover minQuality on produce because inventory stacks store no quality", () => {
    const sim = new Simulation();
    const contract = sim.state.contracts.find((candidate) => candidate.type === "produce" && candidate.targetItemIdOrSpecies === "produce.wheat");
    expect(contract).toBeDefined();
    contract!.minQuality = "fine";
    contract!.quantityRequired = 1;
    contract!.quantityFulfilled = 0;
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "produce.wheat", quantity: 1 }]);
    commitPlayerPose(sim, VILLAGE_MARKET.position.x, VILLAGE_MARKET.position.z);
    expect(sim.deliverItemsToContract(contract!.id, "produce.wheat", 1)).toMatchObject({
      success: true,
      completed: true
    });
  });
});
