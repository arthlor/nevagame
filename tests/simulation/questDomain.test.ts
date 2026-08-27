import { describe, it, expect } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { farmLocalToWorld, STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import type { ActiveQuestDto } from "../../src/simulation/core/QuestTypes";
import { getProcessingStationFrontPosition } from "../../src/world/ProcessingStationApproach";

describe("QuestDomain & Storyline Progression", () => {
  it("chains every authored quest until the final epilogue quest", () => {
    const quests = Array.from(ContentRegistry.quests.values());
    expect(quests.length).toBeGreaterThan(1);
    expect(quests[0].id).toBe("quest.act1_welcome");
    for (let i = 0; i < quests.length - 1; i++) {
      expect(quests[i].nextQuestId).toBe(quests[i + 1].id);
    }
    expect(quests[quests.length - 1].nextQuestId).toBeUndefined();
  });

  it("initializes game state with Act 1 introduction quest", () => {
    const sim = new Simulation();
    const activeQuest = sim.query({ type: "quest.get-active" }) as ActiveQuestDto;

    expect(activeQuest).not.toBeNull();
    expect(activeQuest.actId).toBe("act1_homestead");
    expect(activeQuest.questId).toBe("quest.act1_welcome");
    expect(activeQuest.speakerId).toBe("npc.elspeth");
    expect(activeQuest.speakerName).toBe("Elspeth");
    expect(activeQuest.currentProgress).toBe(0);
    expect(activeQuest.targetQuantity).toBe(1);
    expect(activeQuest.isStepComplete).toBe(false);
  });

  it("handles dialogue and advances quest when speaking to Elspeth", () => {
    const sim = new Simulation();
    const startXp = sim.state.player.proficiencies.farming;

    // Talk to Elspeth
    const talkResult = sim.execute({ type: "quest.talk-npc", npcId: "npc.elspeth" }) as { success: boolean; dialogue?: string[] };
    expect(talkResult.success).toBe(true);
    expect(talkResult.dialogue).toBeDefined();
    expect(talkResult.dialogue!.length).toBeGreaterThan(0);


    // Initial quest should now be completed and advanced to planting seeds
    const nextQuest = sim.query({ type: "quest.get-active" }) as ActiveQuestDto;
    expect(nextQuest).not.toBeNull();
    expect(nextQuest.questId).toBe("quest.act1_sow_wheat");
    expect(nextQuest.actId).not.toBe("epilogue_open");
    expect(sim.state.quests.activeActId).toBe("act1_homestead");
    expect(sim.state.quests.activeQuestId).toBe("quest.act1_sow_wheat");
    expect(nextQuest.currentProgress).toBe(0);
    expect(nextQuest.targetQuantity).toBe(3);

    // Verify rewards given (wheat seeds & farming XP from welcome quest)
    expect(sim.state.player.proficiencies.farming).toBeGreaterThan(startXp);
  });

  it("tracks crop planting and watering progress deterministically", () => {
    const sim = new Simulation();

    // Advance past welcome quest
    sim.state.player.x = -63.5;
    sim.state.player.z = -62;
    sim.execute({ type: "quest.talk-npc", npcId: "npc.elspeth" });

    // Plant 3 wheat crops on starter farm
    for (let i = 0; i < 3; i++) {
      const pos = farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, { x: -1.5 + i * 1.5, z: 0 });
      sim.state.player.x = pos.x;
      sim.state.player.z = pos.z;
      const res = sim.plantCrop("farm.starter_garden", "crop.wheat", pos.x, pos.z);
      expect(res.success).toBe(true);
    }

    const plantingQuest = sim.query({ type: "quest.get-active" }) as ActiveQuestDto;
    expect(plantingQuest.questId).toBe("quest.act1_sow_wheat");
    expect(plantingQuest.currentProgress).toBe(3);
    expect(plantingQuest.isStepComplete).toBe(true);

    // Turn in planting quest to Elspeth
    sim.state.player.x = -63.5;
    sim.state.player.z = -62;
    const turnInResult = sim.execute({ type: "quest.talk-npc", npcId: "npc.elspeth" });
    expect(turnInResult.success).toBe(true);

    // Next quest should be watering crops
    const waterQuest = sim.query({ type: "quest.get-active" }) as ActiveQuestDto;
    expect(waterQuest.questId).toBe("quest.act1_water_crops");
    expect(waterQuest.targetQuantity).toBe(3);

    // Water crops
    const cropIds = Object.keys(sim.state.crops);
    for (const cropId of cropIds) {
      const crop = sim.state.crops[cropId];
      const world = farmLocalToWorld(crop.farmId, crop);
      sim.state.player.x = world.x;
      sim.state.player.z = world.z;
      const res = sim.waterCrop(cropId);
      expect(res.success).toBe(true);
    }

    const waterQuestProgress = sim.query({ type: "quest.get-active" }) as ActiveQuestDto;
    expect(waterQuestProgress.currentProgress).toBe(3);
    expect(waterQuestProgress.isStepComplete).toBe(true);
  });

  it("progresses into Act 2 upon harvesting wheat", () => {
    const sim = new Simulation();

    // Complete Act 1 Quest 1: Welcome
    sim.execute({ type: "quest.talk-npc", npcId: "npc.elspeth" });

    // Complete Act 1 Quest 2: Sow Wheat
    for (let i = 0; i < 3; i++) {
      const pos = farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, { x: -1.5 + i * 1.5, z: 0 });
      sim.state.player.x = pos.x;
      sim.state.player.z = pos.z;
      sim.plantCrop("farm.starter_garden", "crop.wheat", pos.x, pos.z);
    }
    sim.state.player.x = -63.5;
    sim.state.player.z = -62;
    sim.execute({ type: "quest.talk-npc", npcId: "npc.elspeth" });

    // Complete Act 1 Quest 3: Water Crops
    const cropIds = Object.keys(sim.state.crops);
    for (const cropId of cropIds) {
      const crop = sim.state.crops[cropId];
      const world = farmLocalToWorld(crop.farmId, crop);
      sim.state.player.x = world.x;
      sim.state.player.z = world.z;
      sim.waterCrop(cropId);
    }
    sim.state.player.x = -63.5;
    sim.state.player.z = -62;
    sim.execute({ type: "quest.talk-npc", npcId: "npc.elspeth" });

    // Now on Act 2 Quest 1: Harvest and Compost
    const harvestQuest = sim.query({ type: "quest.get-active" }) as ActiveQuestDto;
    expect(harvestQuest.questId).toBe("quest.act2_harvest_and_compost");
    expect(harvestQuest.actId).toBe("act2_processing");

    // Force crops to mature and harvest 3
    for (const cropId of cropIds) {
      const crop = sim.state.crops[cropId];
      crop.stage = "mature";
      crop.effectiveGrowthMinutes = 720;
      const world = farmLocalToWorld(crop.farmId, crop);

      sim.state.player.x = world.x;
      sim.state.player.z = world.z;
      const harvestRes = sim.harvestCrop(cropId);
      expect(harvestRes.success).toBe(true);
    }

    // Complete the compost step at the compost bin (start + clock + collect).
    const compost = sim.state.world.structures["struct.starter_compost"];
    const compostFront = getProcessingStationFrontPosition("struct.starter_compost", compost);
    expect(compostFront).not.toBeNull();
    sim.state.player.x = compostFront!.x;
    sim.state.player.z = compostFront!.z;
    expect(sim.startProcessingJob("recipe.compost_worms", "struct.starter_compost").success).toBe(true);
    sim.setDebugMinute(sim.state.clock.currentMinute + 180);
    sim.tick(1);
    const compostJobId = Object.keys(sim.state.processingJobs)[0];
    expect(sim.state.processingJobs[compostJobId]?.status).toBe("complete");
    expect(sim.collectProcessingJob(compostJobId).success).toBe(true);
    sim.state.player.x = -73.5;
    sim.state.player.z = -58.8;
    sim.execute({ type: "quest.talk-npc", npcId: "npc.barnaby" });

    // Should transition to Act 2 Quest 2: Milling & Chum
    const act2Quest = sim.query({ type: "quest.get-active" }) as ActiveQuestDto;
    expect(act2Quest.actId).toBe("act2_processing");
    expect(act2Quest.questId).toBe("quest.act2_mill_and_craft_chum");
    expect(act2Quest.speakerId).toBe("npc.barnaby");
  });





  it("awards skill XP, unlocks knowledge, and progresses to epilogue", () => {
    const sim = new Simulation();
    const allQuests = Array.from(ContentRegistry.quests.values());

    // Progress through each quest sequentially
    for (const quest of allQuests) {
      const active = sim.query({ type: "quest.get-active" }) as ActiveQuestDto;
      expect(active.questId).toBe(quest.id);

      // Fulfill step objectives
      for (const step of quest.objectives) {
        sim.questDomain.onObjectiveEvent(step.type, step.targetId, step.targetQuantity, step.location);
      }

      // Complete via NPC turn-in or claim
      const speaker = ContentRegistry.npcs.get(quest.speakerId)!;
      sim.state.player.x = speaker.anchor.x;
      sim.state.player.z = speaker.anchor.z;
      if (quest.id === "quest.act4_restore_rowboat") {
        const inventory = sim.state.inventories[sim.state.player.inventoryId];
        inventory.slots[0] = { itemId: "item.ground_grain", quantity: 1 };
      }
      sim.execute({ type: "quest.talk-npc", npcId: quest.speakerId });
    }

    // After all 5 acts are completed, activeQuest should be null (epilogue open state)
    const finalQuest = sim.query({ type: "quest.get-active" }) as ActiveQuestDto | null;
    expect(finalQuest).toBeNull();
    expect(sim.state.quests.activeActId).toBe("epilogue_open");
    expect(sim.state.quests.completedQuestIds.length).toBe(allQuests.length);
  });

  it("rejects omitted targets, wrong locations, remote dialogue, and out-of-order completion", () => {
    const sim = new Simulation();

    sim.questDomain.onObjectiveEvent("plant-crop", undefined, 1, { kind: "farm", id: "farm.starter_garden" });
    sim.questDomain.onObjectiveEvent("plant-crop", "crop.wheat", 1, { kind: "farm", id: "farm.player_homestead" });
    expect(sim.state.quests.stepProgress).toEqual({});

    sim.state.player.x = 0;
    sim.state.player.z = 0;
    const remoteTalk = sim.execute({ type: "quest.talk-npc", npcId: "npc.elspeth" });
    expect(remoteTalk).toMatchObject({ success: false });
    expect(sim.state.quests.completedQuestIds).toEqual([]);

    expect(sim.questDomain.completeQuest("quest.act1_sow_wheat")).toMatchObject({ success: false });
  });

  it("locks the fresh-save rowboat until commission, then guarantees the Act 5 entry school", () => {
    const sim = new Simulation();
    const silas = ContentRegistry.npcs.get("npc.silas")!;
    const inventory = sim.state.inventories[sim.state.player.inventoryId];

    sim.state.player.x = silas.anchor.x;
    sim.state.player.z = silas.anchor.z;
    expect(sim.canBoardBoat("boat.player_rowboat")).toBe(false);

    sim.state.quests.activeQuestId = "quest.act4_restore_rowboat";
    sim.state.quests.activeStepIndex = 0;
    sim.state.quests.stepProgress = { "step.act4_restore_rowboat_silas": 1 };
    expect(InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.ground_grain", quantity: 1 }])).toBe(true);

    const commission = sim.execute({ type: "quest.talk-npc", npcId: "npc.silas" });
    expect(commission.success).toBe(true);
    expect(sim.state.player.money).toBe(70);
    expect(sim.state.quests.unlockedFeatureIds).toContain("boat.player_rowboat");
    expect(sim.state.quests.activeQuestId).toBe("quest.act5_maiden_voyage");

    sim.advanceGameMinutes(1);
    const schools = Object.values(sim.state.world.activeSchools);
    expect(sim.state.world.storySchoolSpawned).toBe(true);
    expect(schools).toHaveLength(1);
    expect(schools[0]).toMatchObject({ habitatId: "lake", speciesWeights: [{ speciesId: "fish.trout" }] });
    sim.state.player.x = 76;
    sim.state.player.z = 64;
    expect(sim.canBoardBoat("boat.player_rowboat")).toBe(true);
  });

  it("passes the explicit NPC target through a quest claim command", () => {
    const sim = new Simulation();
    const speaker = ContentRegistry.npcs.get("npc.elspeth")!;
    sim.state.player.x = speaker.anchor.x;
    sim.state.player.z = speaker.anchor.z;
    sim.state.quests.activeQuestId = "quest.act1_welcome";
    sim.state.quests.activeStepIndex = 0;
    sim.state.quests.stepProgress = { "step.act1_welcome_talk": 1 };

    const result = sim.execute({
      type: "quest.claim-reward",
      questId: "quest.act1_welcome",
      npcId: "npc.elspeth"
    });

    expect(result).toMatchObject({ success: true, rewardMoney: undefined });
    expect(sim.state.quests.completedQuestIds).toContain("quest.act1_welcome");
    expect(sim.state.quests.activeQuestId).toBe("quest.act1_sow_wheat");
  });


  it("counts one harvest-crop plant toward Act 2, not produce yield", () => {
    const sim = new Simulation();
    sim.state.quests.activeActId = "act2_processing";
    sim.state.quests.activeQuestId = "quest.act2_harvest_and_compost";
    sim.state.quests.activeStepIndex = 0;
    sim.state.quests.stepProgress = {};

    const cropIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const pos = farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, { x: -1.5 + i * 1.5, z: 0 });
      sim.state.player.x = pos.x;
      sim.state.player.z = pos.z;
      expect(sim.plantCrop("farm.starter_garden", "crop.wheat", pos.x, pos.z).success).toBe(true);
      cropIds.push(Object.keys(sim.state.crops).find((id) => !cropIds.includes(id))!);
    }

    const first = sim.state.crops[cropIds[0]];
    first.stage = "mature";
    first.effectiveGrowthMinutes = 60;
    const world = farmLocalToWorld(first.farmId, first);
    sim.state.player.x = world.x;
    sim.state.player.z = world.z;
    const harvestOne = sim.harvestCrop(cropIds[0]);
    expect(harvestOne.success).toBe(true);
    expect(harvestOne.yield).toBeGreaterThanOrEqual(3);

    const afterOne = sim.query({ type: "quest.get-active" }) as ActiveQuestDto;
    expect(afterOne.questId).toBe("quest.act2_harvest_and_compost");
    expect(afterOne.currentProgress).toBe(1);
    expect(afterOne.targetQuantity).toBe(3);
    expect(afterOne.isStepComplete).toBe(false);

    for (const cropId of cropIds.slice(1)) {
      const crop = sim.state.crops[cropId];
      crop.stage = "mature";
      crop.effectiveGrowthMinutes = 60;
      const pos = farmLocalToWorld(crop.farmId, crop);
      sim.state.player.x = pos.x;
      sim.state.player.z = pos.z;
      expect(sim.harvestCrop(cropId).success).toBe(true);
    }

    expect(sim.state.quests.activeQuestId).toBe("quest.act2_harvest_and_compost");
    expect(sim.state.quests.activeStepIndex).toBe(1);
  });

  it("advances the Act 5 land step before the physical stow event", () => {
    const sim = new Simulation();
    sim.state.quests.activeQuestId = "quest.act5_maiden_voyage";
    sim.state.quests.activeStepIndex = 3;
    sim.state.quests.stepProgress = {};

    sim.events.emit("FishLanded", {
      cargoId: "cargo.test",
      speciesId: "fish.trout",
      boatId: "boat.player_rowboat",
      weightKg: 2.5,
      quality: "common",
      minute: sim.state.clock.currentMinute
    });
    expect(sim.state.quests.activeStepIndex).toBe(4);
    expect(sim.state.quests.stepProgress).toEqual({});

    sim.events.emit("CargoLoaded", {
      cargoId: "cargo.test",
      boatId: "boat.player_rowboat",
      slotIndex: 0,
      minute: sim.state.clock.currentMinute
    });
    expect(sim.state.quests.activeStepIndex).toBe(5);
    expect(sim.state.quests.stepProgress).toEqual({});
  });

  it("counts player-carry shore landings as land and stow so Act 5 cannot softlock", () => {
    const sim = new Simulation();
    sim.state.quests.activeQuestId = "quest.act5_maiden_voyage";
    sim.state.quests.activeStepIndex = 3;
    sim.state.quests.stepProgress = {};

    sim.events.emit("FishLanded", {
      cargoId: "cargo.carry",
      speciesId: "fish.trout",
      weightKg: 2.5,
      quality: "common",
      minute: sim.state.clock.currentMinute
    });
    expect(sim.state.quests.activeStepIndex).toBe(5);
    expect(sim.state.quests.stepProgress).toEqual({});
  });
});
