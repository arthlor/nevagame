import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { Simulation } from "../../src/simulation/Simulation";
import { SIMULATION_ACTION_TIMINGS } from "../../src/simulation/actions/ActionTimeline";
import type { InteractionResult } from "../../src/simulation/core/contracts";
import { FARMING_ACTION_COST } from "../../src/simulation/domains/FarmingDomain";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { farmLocalToWorld, PLAYER_HOMESTEAD_LAYOUT } from "../../src/world/FarmLayout";
import { getProcessingStationFrontPosition } from "../../src/world/ProcessingStationApproach";
import { npcAnchorAt } from "../../src/simulation/presentation/NpcPresentation";
import { WorldLayout } from "../../src/world/WorldLayout";

function stand(sim: Simulation, point: { x: number; z: number }): void {
  Object.assign(sim.state.player, point, { y: WorldLayout.traversalSurfaceHeight(point.x, point.z) + 0.5 });
}

function plant(sim: Simulation, farmId = "farm.starter_garden", x = 0, z = 0): string {
  const world = farmLocalToWorld(farmId, { x, z });
  stand(sim, world);
  const inventory = sim.state.inventories[sim.state.player.inventoryId];
  const seedItemId = ContentRegistry.crops.get("crop.wheat")!.seedItemId;
  expect(InventoryManager.addItemsAtomically(inventory, [{ itemId: seedItemId, quantity: 1 }])).toBe(true);
  const result = sim.execute({ type: "crop.plant", request: { farmId, cropId: "crop.wheat", ...world } });
  expect(result, `${JSON.stringify({ farmId, x, z })}: ${JSON.stringify(result)}`).toMatchObject({ success: true });
  return result.placedCropId!;
}

function startCompost(sim: Simulation): string {
  const stationId = "struct.starter_compost";
  stand(sim, getProcessingStationFrontPosition(stationId, sim.state.world.structures[stationId])!);
  expect(sim.execute({ type: "processing.start", stationId, recipeId: "recipe.compost_worms" }).success).toBe(true);
  return Object.keys(sim.state.processingJobs)[0];
}

describe("production interaction commits", () => {
  it("counts one wet transition per Commons row in A Furrow for Everyone, including after reload", () => {
    const sim = new Simulation();
    const quest = ContentRegistry.quests.get("quest.homestead_overgrown_rows")!;
    sim.state.quests.tracks[quest.trackId] = { activeQuestId: quest.id, activeStepIndex: 0, stepProgress: {} };
    const areas = PLAYER_HOMESTEAD_LAYOUT.plantableAreas;
    const cropIds = [plant(sim, "farm.player_homestead",
      (areas[0].minX + areas[0].maxX) / 2, (areas[0].minZ + areas[0].maxZ) / 2)];
    const first = sim.state.crops[cropIds[0]];
    stand(sim, farmLocalToWorld(first.farmId, first));
    const before = sim.state.player.workCapacity.current;
    const sprint = sim.state.player.traversal.sprintStamina;
    let waterEvents = 0;
    let repeatedFromEvent: InteractionResult | undefined;
    sim.events.on("CropWatered", () => {
      waterEvents++;
      repeatedFromEvent = sim.execute({ type: "crop.water", placedCropId: first.id });
    });
    for (let click = 0; click < 12; click++) {
      const result = sim.execute({ type: "crop.water", placedCropId: first.id });
      expect(result.success).toBe(click === 0);
    }
    expect(waterEvents).toBe(1);
    expect(repeatedFromEvent?.success).toBe(false);
    expect(before - sim.state.player.workCapacity.current).toBe(FARMING_ACTION_COST.water);
    expect(sim.state.player.traversal.sprintStamina).toBe(sprint);
    expect(sim.state.quests.tracks[quest.trackId].stepProgress[quest.objectives[1].id]).toBeUndefined();
    const loaded = new Simulation(structuredClone(sim.getState()));
    expect(loaded.execute({ type: "crop.water", placedCropId: first.id }).success).toBe(false);
    cropIds.push(plant(loaded, "farm.player_homestead",
      (areas[1].minX + areas[1].maxX) / 2, (areas[1].minZ + areas[1].maxZ) / 2));
    cropIds.push(plant(loaded, "farm.player_homestead",
      (areas[2].minX + areas[2].maxX) / 2, (areas[2].minZ + areas[2].maxZ) / 2));
    expect(loaded.state.quests.tracks[quest.trackId].activeStepIndex).toBe(1);
    expect(loaded.state.quests.tracks[quest.trackId].stepProgress[quest.objectives[1].id]).toBe(1);
    let laterWaterEvents = 0;
    loaded.events.on("CropWatered", () => laterWaterEvents++);
    for (const id of cropIds.slice(1)) {
      const crop = loaded.state.crops[id];
      stand(loaded, farmLocalToWorld(crop.farmId, crop));
      expect(loaded.execute({ type: "crop.water", placedCropId: id }).success).toBe(true);
    }
    expect(laterWaterEvents).toBe(2);
    expect(loaded.state.quests.tracks[quest.trackId].stepProgress[quest.objectives[1].id]).toBe(3);
    expect(loaded.state.quests.earlyActionCredits).toHaveLength(0);
    loaded.state.crops[first.id].moisture = 40;
    stand(loaded, farmLocalToWorld(first.farmId, first));
    expect(loaded.execute({ type: "crop.water", placedCropId: first.id }).success).toBe(true);
    expect(laterWaterEvents).toBe(3);
    expect(loaded.state.quests.tracks[quest.trackId].stepProgress[quest.objectives[1].id]).toBe(3);
    // Later genuine care of the same planting remains available.
    loaded.state.crops[cropIds[2]].moisture = 40;
    const crop = loaded.state.crops[cropIds[2]];
    stand(loaded, farmLocalToWorld(crop.farmId, crop));
    expect(loaded.execute({ type: "crop.water", placedCropId: cropIds[2] }).success).toBe(true);
    expect(loaded.state.quests.tracks[quest.trackId].stepProgress[quest.objectives[1].id]).toBe(3);
  });

  it("commits one planting before a listener can retry the same plot", () => {
    const sim = new Simulation();
    const target = farmLocalToWorld("farm.starter_garden", { x: 0, z: 0 });
    stand(sim, target);
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    const seedItemId = ContentRegistry.crops.get("crop.wheat")!.seedItemId;
    expect(InventoryManager.addItemsAtomically(inventory, [{ itemId: seedItemId, quantity: 1 }])).toBe(true);
    const beforeWork = sim.state.player.workCapacity.current;
    const command = { type: "crop.plant", request: { farmId: "farm.starter_garden", cropId: "crop.wheat", ...target } } as const;
    let eventCount = 0;
    let repeated: InteractionResult | undefined;
    let savedAtEvent: ReturnType<Simulation["getState"]> | undefined;
    sim.events.on("CropPlanted", () => {
      eventCount++;
      savedAtEvent = structuredClone(sim.getState());
      repeated = sim.execute(command);
    });
    const result = sim.execute(command);
    expect(result.success).toBe(true);
    expect(repeated?.success).toBe(false);
    expect(eventCount).toBe(1);
    expect(Object.keys(savedAtEvent!.crops)).toHaveLength(1);
    expect(InventoryManager.getItemCount(savedAtEvent!.inventories[sim.state.player.inventoryId], seedItemId)).toBe(0);
    expect(beforeWork - sim.state.player.workCapacity.current).toBe(FARMING_ACTION_COST.plant);
  });

  it("publishes harvest only after the crop and saved RNG have committed, even to a reentrant listener", () => {
    const sim = new Simulation();
    const id = plant(sim);
    sim.state.crops[id].stage = "mature";
    sim.state.crops[id].effectiveGrowthMinutes = ContentRegistry.crops.get("crop.wheat")!.baseGrowthMinutes;
    let repeated: InteractionResult | undefined;
    let saved: ReturnType<Simulation["getState"]> | undefined;
    let events = 0;
    sim.events.on("CropHarvested", () => {
      if (++events !== 1) return;
      saved = structuredClone(sim.state);
      repeated = sim.execute({ type: "crop.harvest", placedCropId: id });
    });
    expect(sim.execute({ type: "crop.harvest", placedCropId: id }).success).toBe(true);
    expect(repeated?.success).toBe(false);
    expect(events).toBe(1);
    expect(saved!.crops[id]).toBeUndefined();
    expect(saved!.metadata.rngState).toBe(sim.state.metadata.rngState);
    expect(new Simulation(structuredClone(saved!)).execute({ type: "crop.harvest", placedCropId: id }).success).toBe(false);
    expect(plant(sim)).not.toBe(id);
  });

  it("owns the actor until a queued action ends and revalidates distance at its commit", () => {
    const sim = new Simulation();
    const id = plant(sim);
    const command = { type: "crop.water", placedCropId: id } as const;
    const target = { x: sim.state.player.x, y: 0, z: sim.state.player.z, entityId: id };
    expect(sim.actionTimeline.start("water", target, 0, command)).toBe(true);
    const before = structuredClone(sim.state);
    expect(sim.execute(command).success).toBe(false);
    expect(sim.waterCrop(id).success).toBe(false);
    expect(sim.execute({ type: "quest.talk-npc", npcId: "npc.elspeth" })).toMatchObject({
      success: false, segments: [], dialogue: [], isCompletion: false,
      questCompleted: false, rewardsGiven: false
    });
    expect(sim.actionTimeline.start("water", target, 0, command)).toBe(false);
    expect(sim.state).toEqual(before);
    sim.state.player.x += 30;
    sim.actionTimeline.update(SIMULATION_ACTION_TIMINGS.water.durationMs + 1);
    expect(sim.state.crops[id].moisture).toBe(70);
    expect(sim.state.player.workCapacity).toEqual(before.player.workCapacity);
    expect(sim.actionTimeline.isActive).toBe(false);
    stand(sim, target);
    expect(sim.execute(command).success).toBe(true);
  });

  it("rejects changed resources at commit without consuming the seed or awarding progress", () => {
    const sim = new Simulation();
    const target = { ...farmLocalToWorld("farm.starter_garden", { x: 0, z: 0 }), y: 0 };
    stand(sim, target);
    sim.actionTimeline.start("plant", target, 0, { type: "crop.plant", request: { farmId: "farm.starter_garden", cropId: "crop.wheat", ...target } });
    sim.state.player.workCapacity.current = 0;
    const before = structuredClone(sim.state);
    sim.actionTimeline.update(SIMULATION_ACTION_TIMINGS.plant.durationMs + 1);
    expect(sim.state).toEqual(before);
    expect(sim.actionTimeline.isActive).toBe(false);
  });

  it("starts and collects one job, keeps blocked output intact, and allows another batch", () => {
    const sim = new Simulation();
    expect(sim.inspectWorkshopStatus("struct.starter_compost").state).toBe("idle");
    const id = startCompost(sim);
    expect(sim.inspectWorkshopStatus("struct.starter_compost")).toMatchObject({
      state: "processing", jobId: id, outputKind: "worms"
    });
    const paid = structuredClone(sim.state);
    expect(sim.execute({ type: "processing.start", stationId: "struct.starter_compost", recipeId: "recipe.compost_worms" }).success).toBe(false);
    expect(sim.state).toEqual(paid);
    sim.advanceGameMinutes(sim.state.processingJobs[id].effectiveDurationMinutes);
    expect(sim.inspectWorkshopStatus("struct.starter_compost")).toMatchObject({ state: "ready", jobId: id, outputKind: "worms" });
    expect(new Simulation(structuredClone(sim.getState())).inspectWorkshopStatus("struct.starter_compost"))
      .toMatchObject({ state: "ready", jobId: id, outputKind: "worms" });
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    const slots = structuredClone(inventory.slots);
    inventory.slots = inventory.slots.map(() => ({ itemId: "seed.wheat", quantity: ContentRegistry.items.get("seed.wheat")!.stackLimit }));
    const blocked = structuredClone(sim.state);
    expect(sim.inspectWorkshopStatus("struct.starter_compost")).toMatchObject({ state: "blocked", jobId: id, outputKind: "worms" });
    expect(sim.execute({ type: "processing.collect", jobId: id }).success).toBe(false);
    expect(sim.state).toEqual(blocked);
    expect(new Simulation(structuredClone(blocked)).inspectWorkshopStatus("struct.starter_compost").state).toBe("blocked");
    inventory.slots = slots;
    expect(sim.inspectWorkshopStatus("struct.starter_compost").state).toBe("ready");
    let reentry: InteractionResult | undefined;
    sim.events.on("RecipeCompleted", () => { reentry = sim.execute({ type: "processing.collect", jobId: id }); });
    expect(sim.execute({ type: "processing.collect", jobId: id }).success).toBe(true);
    expect(reentry?.success).toBe(false);
    expect(sim.execute({ type: "processing.collect", jobId: id }).success).toBe(false);
    expect(sim.inspectWorkshopStatus("struct.starter_compost").state).toBe("idle");
    expect(InventoryManager.getItemCount(inventory, "item.bait_worms")).toBeGreaterThan(0);
    expect(startCompost(sim)).not.toBe(id);
    expect(sim.inspectWorkshopStatus("struct.starter_compost").state).toBe("processing");
  });

  it("turns in a completed Commons errand once, including reentrant claims and reload", () => {
    const sim = new Simulation();
    const quest = ContentRegistry.quests.get("quest.homestead_overgrown_rows")!;
    const final = quest.objectives.at(-1)!;
    sim.state.quests.tracks[quest.trackId] = { activeQuestId: quest.id, activeStepIndex: quest.objectives.length - 1, stepProgress: { [final.id]: final.targetQuantity } };
    stand(sim, npcAnchorAt(quest.speakerId, sim.state.clock, sim.state.quests));
    const command = { type: "quest.claim-reward", questId: quest.id, npcId: quest.speakerId } as const;
    const money = sim.state.player.money;
    let repeat: InteractionResult | undefined;
    sim.events.on("QuestCompleted", () => { repeat = sim.execute(command); });
    expect(sim.execute(command).success).toBe(true);
    expect(repeat?.success).toBe(false);
    expect(sim.execute(command).success).toBe(false);
    expect(sim.state.player.money).toBe(money + quest.rewards.money!);
    expect(new Simulation(structuredClone(sim.getState())).execute(command).success).toBe(false);
  });
});
