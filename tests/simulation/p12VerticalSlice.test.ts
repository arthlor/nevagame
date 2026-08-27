import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { applyOfflineProgression } from "../../src/persistence/offlineDelta";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { Simulation } from "../../src/simulation/Simulation";
import type { ResolvedPhysicsFrame } from "../../src/simulation/core/PhysicsAdapter";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { SPORT_FISHING_REVIEW_POINTS } from "../../src/simulation/domains/FishingDomain";
import { farmLocalToWorld, STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { HARBOR_DOCK } from "../../src/world/WorldAnchors";
import { getProcessingStationFrontPosition } from "../../src/world/ProcessingStationApproach";
import { WorldLayout } from "../../src/world/WorldLayout";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";

function commitPlayerPose(simulation: Simulation, x: number, z: number, rotationY = 0): void {
  const { player, boats } = simulation.state;
  const frame: ResolvedPhysicsFrame = {
    player: {
      x,
      y: WorldLayout.isWater(x, z) ? 0.5 : WorldLayout.terrainHeight(x, z) + 0.5,
      z,
      rotationY,
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

function commitActiveBoatPose(simulation: Simulation, x: number, z: number, headingRadians = 0): void {
  const activeBoatId = simulation.state.player.activeBoatId;
  expect(activeBoatId).toBe("boat.player_rowboat");
  const { player, boats } = simulation.state;
  const frame: ResolvedPhysicsFrame = {
    player: {
      x,
      y: 0.5,
      z,
      rotationY: headingRadians,
      traversal: { ...player.traversal, isGrounded: true }
    },
    boats: Object.fromEntries(
      Object.values(boats).map((boat) => [boat.id, {
        x: boat.id === activeBoatId ? x : boat.x,
        y: boat.id === activeBoatId ? 0 : boat.y,
        z: boat.id === activeBoatId ? z : boat.z,
        headingRadians: boat.id === activeBoatId ? headingRadians : boat.headingRadians,
        speed: 0
      }])
    )
  };
  expect(simulation.execute({ type: "physics.commit", frame })).toMatchObject({ success: true });
}

function moveToNpc(simulation: Simulation, npcId: string): void {
  const npc = ContentRegistry.npcs.get(npcId);
  expect(npc).toBeDefined();
  commitPlayerPose(simulation, npc!.anchor.x, npc!.anchor.z, npc!.anchor.rotationY);
}

function moveToStation(simulation: Simulation, stationId: string): void {
  const station = simulation.state.world.structures[stationId];
  expect(station).toBeDefined();
  const front = getProcessingStationFrontPosition(stationId, station!);
  expect(front).not.toBeNull();
  commitPlayerPose(simulation, front!.x, front!.z);
}

function activeQuestId(simulation: Simulation): string | null {
  return simulation.state.quests.activeQuestId;
}

function talkTo(simulation: Simulation, npcId: string): void {
  moveToNpc(simulation, npcId);
  expect(simulation.execute({ type: "quest.talk-npc", npcId })).toMatchObject({ success: true });
}

function processAndCollect(simulation: Simulation, recipeId: string, stationId: string, durationMinutes: number): void {
  moveToStation(simulation, stationId);
  expect(simulation.execute({ type: "processing.start", recipeId, stationId })).toMatchObject({ success: true });
  const jobId = Object.keys(simulation.state.processingJobs)[0];
  expect(jobId).toBeDefined();
  simulation.advanceGameMinutes(durationMinutes);
  expect(simulation.state.processingJobs[jobId!].status).toBe("complete");
  expect(simulation.execute({ type: "processing.collect", jobId: jobId! })).toMatchObject({ success: true });
}

function fishInventoryCount(simulation: Simulation): number {
  const inventory = simulation.state.inventories[simulation.state.player.inventoryId];
  return Array.from(ContentRegistry.fishSpecies.values())
    .filter((fish) => !fish.isSportFish)
    .reduce((total, fish) => total + InventoryManager.getItemCount(inventory, fish.id), 0);
}

function waitForBasicBite(simulation: Simulation): boolean {
  for (let step = 0; step < 160; step += 1) {
    const fishing = simulation.state.basicFishing;
    if (!fishing) return false;
    if (fishing.phase === "bite-reaction") return true;
    simulation.tick(0.1);
  }
  return false;
}

function catchBasicFish(simulation: Simulation): void {
  const before = fishInventoryCount(simulation);
  let caught = false;

  for (let attempt = 0; attempt < 5 && !caught; attempt += 1) {
    expect(simulation.execute({ type: "fishing.start-charge-basic" })).toMatchObject({ success: true });
    expect(simulation.execute({ type: "fishing.release-cast-basic", castPower: 0.8 })).toMatchObject({ success: true });
    if (!waitForBasicBite(simulation)) continue;
    const hook = simulation.execute({ type: "fishing.hook-bite-basic" });
    if (!hook.success) continue;

    for (let step = 0; step < 800 && simulation.state.basicFishing; step += 1) {
      const fishing = simulation.state.basicFishing;
      const barY = fishing.barY ?? 0;
      const barHeight = fishing.barHeight ?? 0.2;
      const fishY = fishing.fishY ?? 0.25;
      const barCenter = barY + barHeight * 0.5;
      const hold = fishY > barCenter + 0.015 || (fishY >= barY && fishY <= barY + barHeight && (fishing.barVy ?? 0) < -0.3);
      expect(simulation.execute({ type: "fishing.control-basic", isHolding: hold })).toMatchObject({ success: true });
      simulation.tick(0.05);
    }
    caught = fishInventoryCount(simulation) > before;
  }

  expect(caught).toBe(true);
}

function landSportFish(simulation: Simulation): string {
  const before = new Set(Object.keys(simulation.state.fishCargo));
  for (let step = 0; step < 800 && simulation.activeFishingEncounter; step += 1) {
    const encounter = simulation.activeFishingEncounter.getState();
    const isSlacking = encounter.lineTension > 82;
    const isReeling = encounter.lineTension < 70 && !isSlacking;
    const isBracing = encounter.behavior === "dive" || encounter.behavior === "burst";
    expect(simulation.execute({
      type: "fishing.control",
      input: {
        isReeling,
        isSlacking,
        isBracing,
        rodDirectionAngle: -encounter.fishDirection
      }
    })).toMatchObject({ success: true });
    simulation.tick(0.5);
  }

  expect(simulation.activeFishingEncounter).toBeNull();
  const cargoId = Object.keys(simulation.state.fishCargo).find((id) => !before.has(id));
  expect(cargoId).toBeDefined();
  return cargoId!;
}

describe("P12 new-save vertical slice", () => {
  let restoreIndexedDB: (() => void) | undefined;

  beforeEach(() => {
    restoreIndexedDB = installMemoryIndexedDB();
  });

  afterEach(async () => {
    await new IndexedDbSaveRepository().clearSaves();
    restoreIndexedDB?.();
    restoreIndexedDB = undefined;
  });

  it("completes the authored farm-to-fish-to-market loop through real commands and reload", async () => {
    let simulation = new Simulation(/** deterministic new-save seed */ undefined);
    const playerInventory = () => simulation.state.inventories[simulation.state.player.inventoryId];

    expect(activeQuestId(simulation)).toBe("quest.act1_welcome");
    talkTo(simulation, "npc.elspeth");
    expect(activeQuestId(simulation)).toBe("quest.act1_sow_wheat");

    const cropPositions = [-3, 0, 3].map((x) => farmLocalToWorld(
      STARTER_FARM_LAYOUT.farmId,
      { x, z: 0 }
    ));
    const cropIds: string[] = [];
    for (const position of cropPositions) {
      commitPlayerPose(simulation, position.x, position.z);
      const planted = simulation.execute({
        type: "crop.plant",
        request: {
          farmId: "farm.starter_garden",
          cropId: "crop.wheat",
          x: position.x,
          z: position.z
        }
      });
      expect(planted).toMatchObject({ success: true });
      cropIds.push((planted as { placedCropId: string }).placedCropId);
    }
    expect(simulation.state.quests.stepProgress).toEqual({ "step.act1_sow_3_wheat": 3 });
    expect(activeQuestId(simulation)).toBe("quest.act1_sow_wheat");
    talkTo(simulation, "npc.elspeth");
    expect(activeQuestId(simulation)).toBe("quest.act1_water_crops");

    for (const cropId of cropIds) {
      const crop = simulation.state.crops[cropId];
      const position = farmLocalToWorld(crop.farmId, crop);
      commitPlayerPose(simulation, position.x, position.z);
      expect(simulation.execute({ type: "crop.water", placedCropId: cropId })).toMatchObject({ success: true });
    }
    expect(simulation.state.quests.stepProgress).toEqual({ "step.act1_water_3_crops": 3 });
    talkTo(simulation, "npc.elspeth");
    expect(activeQuestId(simulation)).toBe("quest.act2_harvest_and_compost");

    const repository = new IndexedDbSaveRepository();
    expect(await repository.saveGame(simulation.state)).toBe(true);
    const saved = await repository.loadGame();
    expect(saved).not.toBeNull();
    expect(saved!.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const offlineNow = saved!.savedAtUtcMs + 500_000;
    const offlineSummary = applyOfflineProgression(saved!.state, offlineNow);
    expect(offlineSummary.simulatedGameMinutes).toBe(200);
    expect(offlineSummary.cropsMaturedCount).toBe(3);
    simulation = new Simulation(saved!.state);

    for (const cropId of cropIds) {
      const crop = simulation.state.crops[cropId];
      const position = farmLocalToWorld(crop.farmId, crop);
      commitPlayerPose(simulation, position.x, position.z);
      expect(simulation.execute({ type: "crop.harvest", placedCropId: cropId })).toMatchObject({ success: true });
    }
    expect(activeQuestId(simulation)).toBe("quest.act2_harvest_and_compost");
    processAndCollect(simulation, "recipe.compost_worms", "struct.starter_compost", 360);
    expect(activeQuestId(simulation)).toBe("quest.act2_harvest_and_compost");
    talkTo(simulation, "npc.barnaby");
    expect(activeQuestId(simulation)).toBe("quest.act2_mill_and_craft_chum");

    processAndCollect(simulation, "recipe.wheat_to_grain", "struct.starter_mill", 5);
    processAndCollect(simulation, "recipe.wheat_to_grain", "struct.starter_mill", 5);
    expect(InventoryManager.getItemCount(playerInventory(), "item.ground_grain")).toBe(4);
    processAndCollect(simulation, "recipe.craft_chum", "struct.workbench", 10);
    expect(InventoryManager.getItemCount(playerInventory(), "item.chum_bucket")).toBe(1);
    talkTo(simulation, "npc.barnaby");
    expect(activeQuestId(simulation)).toBe("quest.act3_river_angler");

    const bridge = WorldLayout.landmark("bridge");
    commitPlayerPose(simulation, bridge.x, bridge.z);
    expect(WorldLayout.nearbyFishingHabitat(bridge.x, bridge.z)).toBe("river");
    catchBasicFish(simulation);
    catchBasicFish(simulation);
    expect(simulation.state.quests.stepProgress).toEqual({ "step.act3_catch_2_river_fish": 2 });
    talkTo(simulation, "npc.silas");
    expect(activeQuestId(simulation)).toBe("quest.act3_market_intro");

    commitPlayerPose(simulation, 54, -52);
    expect(simulation.query({ type: "market.nearby" })).toBe("market.village");
    expect(simulation.execute({ type: "market.sell-item", marketId: "market.village", itemId: "produce.wheat", quantity: 1 }))
      .toMatchObject({ success: true });
    talkTo(simulation, "npc.elspeth");
    expect(activeQuestId(simulation)).toBe("quest.act4_harbor_journey");

    talkTo(simulation, "npc.maeve");
    expect(activeQuestId(simulation)).toBe("quest.act4_restore_rowboat");
    expect(InventoryManager.getItemCount(playerInventory(), "item.ground_grain")).toBe(2);
    const moneyBeforeCommission = simulation.state.player.money;
    talkTo(simulation, "npc.silas");
    expect(simulation.state.player.money).toBe(moneyBeforeCommission - 30);
    expect(simulation.state.quests.unlockedFeatureIds).toContain("boat.player_rowboat");
    expect(activeQuestId(simulation)).toBe("quest.act5_maiden_voyage");

    commitPlayerPose(simulation, HARBOR_DOCK.playerPosition.x, HARBOR_DOCK.playerPosition.z);
    expect(simulation.execute({ type: "boat.board", boatId: "boat.player_rowboat" })).toMatchObject({ success: true });
    expect(activeQuestId(simulation)).toBe("quest.act5_maiden_voyage");
    const lakePoint = SPORT_FISHING_REVIEW_POINTS.trout;
    expect(WorldLayout.isSailable(lakePoint.x, lakePoint.z)).toBe(true);
    commitActiveBoatPose(simulation, lakePoint.x, lakePoint.z);
    simulation.advanceGameMinutes(1);
    const lakeSchool = Object.values(simulation.state.world.activeSchools).find((school) => school.habitatId === "lake");
    expect(lakeSchool).toBeDefined();
    expect(simulation.execute({ type: "fishing.chum-school", schoolId: lakeSchool!.id })).toMatchObject({ success: true });
    expect(activeQuestId(simulation)).toBe("quest.act5_maiden_voyage");
    expect(simulation.execute({ type: "fishing.hook-school", schoolId: lakeSchool!.id })).toMatchObject({ success: true });
    const cargoId = landSportFish(simulation);
    const cargo = simulation.state.fishCargo[cargoId];
    expect(cargo.location).toMatchObject({ type: "boat-hold", containerId: "boat.player_rowboat", slotIndex: 0 });
    expect(simulation.state.quests.stepProgress).toEqual({});
    expect(cargo.freshness).toBe(100);

    simulation.advanceGameMinutes(10);
    expect(simulation.state.fishCargo[cargoId].freshness).toBeLessThan(100);
    commitActiveBoatPose(simulation, HARBOR_DOCK.boatPosition.x, HARBOR_DOCK.boatPosition.z);
    expect(simulation.execute({ type: "boat.dock" })).toMatchObject({ success: true });
    expect(activeQuestId(simulation)).toBe("quest.act5_maiden_voyage");
    const fishMarket = WorldLayout.landmark("fish-market");
    commitPlayerPose(simulation, fishMarket.x, fishMarket.z);
    expect(simulation.query({ type: "market.nearby" })).toBe("market.harbor");
    const sale = simulation.execute({ type: "market.sell-fish", marketId: "market.harbor", cargoId });
    expect(sale).toMatchObject({ success: true });
    expect(simulation.state.fishCargo[cargoId]).toBeUndefined();
    talkTo(simulation, "npc.silas");
    expect(activeQuestId(simulation)).toBeNull();
    expect(simulation.state.quests.activeActId).toBe("epilogue_open");
    expect(simulation.state.quests.completedQuestIds).toHaveLength(ContentRegistry.quests.size);

    expect(await repository.saveGame(simulation.state)).toBe(true);
    const finalSave = await repository.loadGame();
    expect(finalSave).not.toBeNull();
    expect(validateSaveEnvelope(finalSave)).toBe(true);
    const reloaded = new Simulation(finalSave!.state);
    expect(reloaded.state.quests.activeQuestId).toBeNull();
    expect(reloaded.state.quests.completedQuestIds).toEqual(simulation.state.quests.completedQuestIds);
    expect(reloaded.state.player.activeBoatId).toBeNull();
    expect(reloaded.state.fishCargo).toEqual({});
  });
});
