import { describe, it, expect } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { farmLocalToWorld, STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import type { ActiveQuestDto } from "../../src/simulation/core/QuestTypes";
import { getProcessingStationFrontPosition } from "../../src/world/ProcessingStationApproach";
import { mainQuestTrack } from "../../src/simulation/core/QuestTypes";

describe("QuestDomain & Storyline Progression", () => {
  it("chains every authored quest inside its own track, terminating once", () => {
    // Chains are per track now, so declaration order is no longer one line.
    // The claim is unchanged: no quest is orphaned and every chain ends.
    const seen = new Set<string>();
    for (const track of ContentRegistry.questTracks.values()) {
      const chain: string[] = [];
      let quest = ContentRegistry.quests.get(track.entryQuestId);
      expect(quest, `track '${track.id}' entry quest is missing`).toBeDefined();
      while (quest) {
        expect(seen.has(quest.id), `${quest.id} appears in two chains`).toBe(false);
        expect(quest.trackId, `${quest.id} is chained from the wrong track`).toBe(track.id);
        seen.add(quest.id);
        chain.push(quest.id);
        quest = quest.nextQuestId ? ContentRegistry.quests.get(quest.nextQuestId) : undefined;
      }
      expect(chain.length).toBeGreaterThan(1);
      expect(ContentRegistry.quests.get(chain[chain.length - 1])!.nextQuestId).toBeUndefined();
    }
    expect(seen.size).toBe(ContentRegistry.quests.size);
    expect(ContentRegistry.quests.get("quest.act1_welcome")).toBeDefined();
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

    // First talk is intro; second talk completes the welcome quest
    const intro = sim.execute({ type: "quest.talk-npc", npcId: "npc.elspeth" }) as { success: boolean; dialogue?: string[] };
    expect(intro.success).toBe(true);
    expect(intro.dialogue).toBeDefined();
    expect(intro.dialogue!.length).toBeGreaterThan(0);
    expect(mainQuestTrack(sim.state.quests).activeQuestId).toBe("quest.act1_welcome");
    const talkResult = sim.execute({ type: "quest.talk-npc", npcId: "npc.elspeth" }) as { success: boolean; dialogue?: string[] };
    expect(talkResult.success).toBe(true);

    // Welcome quest should now be completed and advanced to planting seeds
    const nextQuest = sim.query({ type: "quest.get-active" }) as ActiveQuestDto;
    expect(nextQuest).not.toBeNull();
    expect(nextQuest.questId).toBe("quest.act1_sow_wheat");
    expect(nextQuest.actId).not.toBe("epilogue_open");
    expect(sim.state.quests.activeActId).toBe("act1_homestead");
    expect(mainQuestTrack(sim.state.quests).activeQuestId).toBe("quest.act1_sow_wheat");
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
    expect(plantingQuest.isQuestReadyToTurnIn).toBe(true);
    expect(plantingQuest.objectiveDescription).toBe("Talk to Elspeth to continue");
    expect(plantingQuest.targetLocation?.name).toBe("Starter Garden Gate");

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

    // Complete Act 1 Quest 1: Welcome (intro then turn-in)
    sim.execute({ type: "quest.talk-npc", npcId: "npc.elspeth" });
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
    sim.advanceGameMinutes(360);
    const compostJobId = Object.keys(sim.state.processingJobs)[0];
    expect(sim.state.processingJobs[compostJobId]?.status).toBe("complete");
    expect(sim.collectProcessingJob(compostJobId).success).toBe(true);

    const compostTurnIn = sim.query({ type: "quest.get-active" }) as ActiveQuestDto;
    expect(compostTurnIn.questId).toBe("quest.act2_harvest_and_compost");
    expect(compostTurnIn.isQuestReadyToTurnIn).toBe(true);
    expect(compostTurnIn.objectiveDescription).toBe("Talk to Barnaby to continue");
    expect(compostTurnIn.targetLocation?.name).toBe("Farmhouse Workbench");

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

    // Walk the spine only. Registry order interleaves four tracks now, and a
    // side track is not active until its predicate holds, so iterating every
    // quest in declaration order would assert an order that never happens.
    const spine: string[] = [];
    let cursor = ContentRegistry.quests.get("quest.act1_welcome");
    while (cursor) {
      spine.push(cursor.id);
      cursor = cursor.nextQuestId ? ContentRegistry.quests.get(cursor.nextQuestId) : undefined;
    }

    for (const questId of spine) {
      const quest = ContentRegistry.quests.get(questId)!;
      expect(mainQuestTrack(sim.state.quests).activeQuestId).toBe(questId);

      for (const step of quest.objectives) {
        sim.questDomain.onObjectiveEvent(step.type, step.targetId, step.targetQuantity, step.location);
      }

      const speaker = ContentRegistry.npcs.get(quest.speakerId)!;
      sim.state.player.x = speaker.anchor.x;
      sim.state.player.z = speaker.anchor.z;
      // Fund whatever this quest asks for at turn-in. Generic rather than a
      // per-quest special case, so a new commission does not silently make the
      // walk unfinishable — Act 9's charter costs money and cured fish.
      if (quest.turnInCost) {
        sim.state.player.money += quest.turnInCost.money ?? 0;
        const inventory = sim.state.inventories[sim.state.player.inventoryId];
        quest.turnInCost.items?.forEach((cost, index) => {
          inventory.slots[index] = { itemId: cost.itemId, quantity: cost.quantity };
        });
      }
      // A side track sharing this speaker may be ready to hand in too, and
      // turn-in-ready threads resolve first by design. Keep talking until the
      // spine quest itself is the one that closed.
      for (let attempt = 0; attempt < 6; attempt += 1) {
        if (sim.state.quests.completedQuestIds.includes(questId)) break;
        sim.execute({ type: "quest.talk-npc", npcId: quest.speakerId });
      }
      expect(sim.state.quests.completedQuestIds, `${questId} never completed`).toContain(questId);
    }

    expect(mainQuestTrack(sim.state.quests).activeQuestId).toBeNull();
    expect(sim.state.quests.activeActId).toBe("epilogue_open");
    for (const questId of spine) expect(sim.state.quests.completedQuestIds).toContain(questId);
  });

  it("rejects omitted targets, wrong locations, remote dialogue, and out-of-order completion", () => {
    const sim = new Simulation();

    sim.questDomain.onObjectiveEvent("plant-crop", undefined, 1, { kind: "farm", id: "farm.starter_garden" });
    sim.questDomain.onObjectiveEvent("plant-crop", "crop.wheat", 1, { kind: "farm", id: "farm.player_homestead" });
    expect(mainQuestTrack(sim.state.quests).stepProgress).toEqual({});

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

    mainQuestTrack(sim.state.quests).activeQuestId = "quest.act4_restore_rowboat";
    mainQuestTrack(sim.state.quests).activeStepIndex = 0;
    mainQuestTrack(sim.state.quests).stepProgress = { "step.act4_restore_rowboat_silas": 1 };
    expect(InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.ground_grain", quantity: 1 }])).toBe(true);

    const commission = sim.execute({ type: "quest.talk-npc", npcId: "npc.silas" });
    expect(commission.success).toBe(true);
    expect(sim.state.player.money).toBe(70);
    expect(sim.state.quests.unlockedFeatureIds).toContain("boat.player_rowboat");
    expect(mainQuestTrack(sim.state.quests).activeQuestId).toBe("quest.act5_maiden_voyage");

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
    mainQuestTrack(sim.state.quests).activeQuestId = "quest.act1_welcome";
    mainQuestTrack(sim.state.quests).activeStepIndex = 0;
    mainQuestTrack(sim.state.quests).stepProgress = { "step.act1_welcome_talk": 1 };

    const result = sim.execute({
      type: "quest.claim-reward",
      questId: "quest.act1_welcome",
      npcId: "npc.elspeth"
    });

    expect(result).toMatchObject({ success: true, rewardMoney: undefined });
    expect(sim.state.quests.completedQuestIds).toContain("quest.act1_welcome");
    expect(mainQuestTrack(sim.state.quests).activeQuestId).toBe("quest.act1_sow_wheat");
  });


  it("counts one harvest-crop plant toward Act 2, not produce yield", () => {
    const sim = new Simulation();
    sim.state.quests.activeActId = "act2_processing";
    mainQuestTrack(sim.state.quests).activeQuestId = "quest.act2_harvest_and_compost";
    mainQuestTrack(sim.state.quests).activeStepIndex = 0;
    mainQuestTrack(sim.state.quests).stepProgress = {};

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

    expect(mainQuestTrack(sim.state.quests).activeQuestId).toBe("quest.act2_harvest_and_compost");
    expect(mainQuestTrack(sim.state.quests).activeStepIndex).toBe(1);
  });

  it("advances the Act 5 land step before the physical stow event", () => {
    const sim = new Simulation();
    mainQuestTrack(sim.state.quests).activeQuestId = "quest.act5_maiden_voyage";
    mainQuestTrack(sim.state.quests).activeStepIndex = 3;
    mainQuestTrack(sim.state.quests).stepProgress = {};

    sim.events.emit("FishLanded", {
      cargoId: "cargo.test",
      speciesId: "fish.trout",
      ecologyId: "ecology.neva",
      boatId: "boat.player_rowboat",
      weightKg: 2.5,
      quality: "common",
      minute: sim.state.clock.currentMinute
    });
    expect(mainQuestTrack(sim.state.quests).activeStepIndex).toBe(4);
    expect(mainQuestTrack(sim.state.quests).stepProgress).toEqual({});

    sim.events.emit("CargoLoaded", {
      cargoId: "cargo.test",
      boatId: "boat.player_rowboat",
      slotIndex: 0,
      minute: sim.state.clock.currentMinute
    });
    expect(mainQuestTrack(sim.state.quests).activeStepIndex).toBe(5);
    expect(mainQuestTrack(sim.state.quests).stepProgress).toEqual({});
  });

  it("counts player-carry shore landings as land and stow so Act 5 cannot softlock", () => {
    const sim = new Simulation();
    mainQuestTrack(sim.state.quests).activeQuestId = "quest.act5_maiden_voyage";
    mainQuestTrack(sim.state.quests).activeStepIndex = 3;
    mainQuestTrack(sim.state.quests).stepProgress = {};

    sim.events.emit("FishLanded", {
      cargoId: "cargo.carry",
      speciesId: "fish.trout",
      ecologyId: "ecology.neva",
      weightKg: 2.5,
      quality: "common",
      minute: sim.state.clock.currentMinute
    });
    expect(mainQuestTrack(sim.state.quests).activeStepIndex).toBe(5);
    expect(mainQuestTrack(sim.state.quests).stepProgress).toEqual({});
  });

  it("requires the Act 7 Sea Bream to land in the player skiff", () => {
    const sim = new Simulation();
    sim.state.quests.activeActId = "act7_sunreach";
    mainQuestTrack(sim.state.quests).activeQuestId = "quest.act7_reef_answer";
    mainQuestTrack(sim.state.quests).activeStepIndex = 1;
    mainQuestTrack(sim.state.quests).stepProgress = {};

    sim.events.emit("BasicFishingResolved", {
      ecologyId: "ecology.sunreach",
      habitatId: "coast",
      catchItemId: "fish.sea_bream",
      quality: "fine",
      minute: sim.state.clock.currentMinute
    });
    expect(mainQuestTrack(sim.state.quests).activeStepIndex).toBe(2);

    mainQuestTrack(sim.state.quests).activeStepIndex = 1;
    mainQuestTrack(sim.state.quests).stepProgress = {};
    sim.events.emit("BasicFishingResolved", {
      ecologyId: "ecology.sunreach",
      habitatId: "coast",
      boatId: "boat.player_skiff",
      catchItemId: "fish.sea_bream",
      quality: "fine",
      minute: sim.state.clock.currentMinute
    });
    expect(mainQuestTrack(sim.state.quests).activeStepIndex).toBe(3);
  });
});
