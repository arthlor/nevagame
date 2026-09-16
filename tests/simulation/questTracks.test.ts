import { describe, expect, it, afterEach } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { CONTRACT_TYPES } from "../../src/content/contracts";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { SEASONS } from "../../src/simulation/core/GameClock";
import { speciesSeasonWeight } from "../../src/simulation/fishing/seasonalAvailability";
import { npcAnchorAt } from "../../src/simulation/presentation/NpcPresentation";
import {
  MAIN_QUEST_TRACK_ID,
  activeQuestTrackIds,
  questTrackProgress,
  type QuestDefinition,
  type QuestTrackDefinition
} from "../../src/simulation/core/QuestTypes";

const SIDE_TRACK_ID = "track.test_side";

/**
 * A second linear chain, registered only for these tests. Phase A ships the
 * engine before any side-track content exists, so without a temporary track
 * the fan-out below would be exercised against a single chain and prove
 * nothing about parallelism.
 */
const sideTrack: QuestTrackDefinition = {
  id: SIDE_TRACK_ID,
  title: "Test Side Thread",
  entryQuestId: "quest.test_side_entry",
  unlock: { requiresCompletedQuestIds: ["quest.act1_welcome"] }
};

function setQuestCursor(
  sim: Simulation,
  trackId: string,
  questId: string,
  activeStepIndex = 0,
  stepProgress: Record<string, number> = {}
): void {
  const progress = questTrackProgress(sim.state.quests, trackId);
  progress.activeQuestId = questId;
  progress.activeStepIndex = activeStepIndex;
  progress.stepProgress = stepProgress;
}

const sideEntry: QuestDefinition = {
  id: "quest.test_side_entry",
  trackId: SIDE_TRACK_ID,
  actId: "act1_homestead",
  actTitle: "Side",
  questTitle: "Tend the Second Thread",
  speakerId: "npc.elspeth",
  introDialogue: ["Keep an eye on the second row too."],
  completionDialogue: ["Both rows, tended together."],
  objectives: [
    {
      id: "step.test_side_plant",
      type: "plant-crop",
      description: "Plant 1 wheat",
      targetId: "crop.wheat",
      targetQuantity: 1
    }
  ],
  rewards: { money: 10 }
};

/**
 * A location-less objective that needs two of the same world event. Every such
 * objective in shipped content asks for exactly one, which hid the fact that a
 * single catch was counted once per candidate location the event fanned out to.
 */
const countingQuest: QuestDefinition = {
  id: "quest.test_counting",
  trackId: SIDE_TRACK_ID,
  actId: "act1_homestead",
  actTitle: "Side",
  questTitle: "Two of a Kind",
  speakerId: "npc.silas",
  introDialogue: ["Two, mind. Not one counted twice."],
  completionDialogue: ["Two it is."],
  objectives: [
    {
      id: "step.test_land_two",
      type: "land-sport-fish",
      description: "Land 2 trout",
      targetId: "fish.trout",
      targetQuantity: 2
    }
  ],
  rewards: { money: 10 }
};

function registerSideTrack(): void {
  (ContentRegistry.questTracks as Map<string, QuestTrackDefinition>).set(SIDE_TRACK_ID, sideTrack);
  (ContentRegistry.quests as Map<string, QuestDefinition>).set(sideEntry.id, sideEntry);
  (ContentRegistry.quests as Map<string, QuestDefinition>).set(countingQuest.id, countingQuest);
}

function unregisterSideTrack(): void {
  (ContentRegistry.questTracks as Map<string, QuestTrackDefinition>).delete(SIDE_TRACK_ID);
  (ContentRegistry.quests as Map<string, QuestDefinition>).delete(sideEntry.id);
  (ContentRegistry.quests as Map<string, QuestDefinition>).delete(countingQuest.id);
}

describe("quest tracks", () => {
  afterEach(unregisterSideTrack);

  it("counts one world event once against a location-less objective", () => {
    registerSideTrack();
    const sim = new Simulation();
    questTrackProgress(sim.state.quests, SIDE_TRACK_ID).activeQuestId = countingQuest.id;
    questTrackProgress(sim.state.quests, SIDE_TRACK_ID).activeStepIndex = 0;
    questTrackProgress(sim.state.quests, SIDE_TRACK_ID).stepProgress = {};

    // FishLanded offers itself under an ecology and a boat candidate so an
    // objective can pin down where the landing happened. One landing is still
    // one landing.
    sim.events.emit("FishLanded", {
      cargoId: "cargo.a",
      speciesId: "fish.trout",
      ecologyId: "ecology.neva",
      boatId: "boat.player_rowboat",
      weightKg: 2,
      quality: "common",
      minute: sim.state.clock.currentMinute
    });
    expect(questTrackProgress(sim.state.quests, SIDE_TRACK_ID).stepProgress).toEqual({
      "step.test_land_two": 1
    });

    sim.events.emit("FishLanded", {
      cargoId: "cargo.b",
      speciesId: "fish.trout",
      ecologyId: "ecology.neva",
      weightKg: 2,
      quality: "common",
      minute: sim.state.clock.currentMinute
    });
    expect(questTrackProgress(sim.state.quests, SIDE_TRACK_ID).stepProgress).toEqual({
      "step.test_land_two": 2
    });
  });

  it("projects every running thread, focused first, for the tracker", () => {
    registerSideTrack();
    const sim = new Simulation();
    questTrackProgress(sim.state.quests, SIDE_TRACK_ID).activeQuestId = sideEntry.id;
    questTrackProgress(sim.state.quests, SIDE_TRACK_ID).activeStepIndex = 0;
    questTrackProgress(sim.state.quests, SIDE_TRACK_ID).stepProgress = {};

    const focusedFirst = sim.questDomain.getActiveQuestDtos();
    expect(focusedFirst.map((dto) => dto.trackId)).toEqual([MAIN_QUEST_TRACK_ID, SIDE_TRACK_ID]);
    expect(focusedFirst.every((dto) => dto.trackTitle.length > 0)).toBe(true);

    expect(sim.execute({ type: "quest.focus-track", trackId: SIDE_TRACK_ID })).toMatchObject({ success: true });
    expect(sim.questDomain.getActiveQuestDtos().map((dto) => dto.trackId))
      .toEqual([SIDE_TRACK_ID, MAIN_QUEST_TRACK_ID]);
  });

  it("starts a new game with only the main track running", () => {
    const sim = new Simulation();
    expect(activeQuestTrackIds(sim.state.quests)).toEqual([MAIN_QUEST_TRACK_ID]);
    expect(sim.state.quests.focusedTrackId).toBe(MAIN_QUEST_TRACK_ID);
    expect(questTrackProgress(sim.state.quests, MAIN_QUEST_TRACK_ID).activeQuestId)
      .toBe("quest.act1_welcome");
  });

  it("advances every track whose active objective matches one event", () => {
    registerSideTrack();
    const sim = new Simulation();
    // Main track parked on its own plant objective, side track on its.
    const main = questTrackProgress(sim.state.quests, MAIN_QUEST_TRACK_ID);
    main.activeQuestId = "quest.act1_sow_wheat";
    main.activeStepIndex = 0;
    main.stepProgress = {};
    const side = questTrackProgress(sim.state.quests, SIDE_TRACK_ID);
    side.activeQuestId = sideEntry.id;
    side.activeStepIndex = 0;
    side.stepProgress = {};

    sim.events.emit("CropPlanted", {
      farmId: "farm.starter_garden",
      cropId: "crop.wheat",
      placedCropId: "crop.test",
      minute: 0
    });

    expect(main.stepProgress["step.act1_sow_3_wheat"]).toBe(1);
    expect(side.stepProgress["step.test_side_plant"]).toBe(1);
  });

  it("leaves a track alone when the event does not match its objective", () => {
    registerSideTrack();
    const sim = new Simulation();
    const main = questTrackProgress(sim.state.quests, MAIN_QUEST_TRACK_ID);
    main.activeQuestId = "quest.act1_water_crops";
    main.activeStepIndex = 0;
    main.stepProgress = {};
    const side = questTrackProgress(sim.state.quests, SIDE_TRACK_ID);
    side.activeQuestId = sideEntry.id;
    side.activeStepIndex = 0;
    side.stepProgress = {};

    // A plant event: the side track wants it, the main track wants watering.
    sim.events.emit("CropPlanted", {
      farmId: "farm.starter_garden",
      cropId: "crop.wheat",
      placedCropId: "crop.test",
      minute: 0
    });

    expect(main.stepProgress).toEqual({});
    expect(side.stepProgress["step.test_side_plant"]).toBe(1);
  });

  it("turns in the finished track when one NPC speaks for two", () => {
    registerSideTrack();
    const sim = new Simulation();
    const elspeth = ContentRegistry.npcs.get("npc.elspeth")!;
    sim.state.player.x = elspeth.anchor.x;
    sim.state.player.z = elspeth.anchor.z;

    // Elspeth speaks for both. The main track is mid-quest; the side track is
    // finished. Without turn-in-first resolution the main intro would win and
    // the completed side quest could never be handed in.
    const main = questTrackProgress(sim.state.quests, MAIN_QUEST_TRACK_ID);
    main.activeQuestId = "quest.act1_sow_wheat";
    main.activeStepIndex = 0;
    main.stepProgress = {};
    const side = questTrackProgress(sim.state.quests, SIDE_TRACK_ID);
    side.activeQuestId = sideEntry.id;
    side.activeStepIndex = 0;
    side.stepProgress = { "step.test_side_plant": 1 };
    const moneyBefore = sim.state.player.money;

    const result = sim.execute({ type: "quest.talk-npc", npcId: "npc.elspeth" });

    expect(result).toMatchObject({ success: true });
    expect(sim.state.quests.completedQuestIds).toContain(sideEntry.id);
    expect(sim.state.player.money).toBe(moneyBefore + 10);
    // The main track is untouched by the side track's completion.
    expect(main.activeQuestId).toBe("quest.act1_sow_wheat");
  });

  it("opens a track exactly when its unlock predicate is satisfied", () => {
    registerSideTrack();
    const sim = new Simulation();
    expect(questTrackProgress(sim.state.quests, SIDE_TRACK_ID).activeQuestId).toBeNull();

    const elspeth = ContentRegistry.npcs.get("npc.elspeth")!;
    sim.state.player.x = elspeth.anchor.x;
    sim.state.player.z = elspeth.anchor.z;
    const main = questTrackProgress(sim.state.quests, MAIN_QUEST_TRACK_ID);
    main.stepProgress = { "step.act1_welcome_talk": 1 };

    expect(sim.execute({ type: "quest.talk-npc", npcId: "npc.elspeth" })).toMatchObject({ success: true });

    expect(sim.state.quests.completedQuestIds).toContain("quest.act1_welcome");
    expect(questTrackProgress(sim.state.quests, SIDE_TRACK_ID).activeQuestId).toBe(sideEntry.id);
  });

  it("refuses focus on a track with nothing waiting, and accepts one running", () => {
    registerSideTrack();
    const sim = new Simulation();
    expect(sim.execute({ type: "quest.focus-track", trackId: SIDE_TRACK_ID }))
      .toMatchObject({ success: false });
    expect(sim.execute({ type: "quest.focus-track", trackId: "track.nope" }))
      .toMatchObject({ success: false, reason: "Unknown quest track" });

    questTrackProgress(sim.state.quests, SIDE_TRACK_ID).activeQuestId = sideEntry.id;
    expect(sim.execute({ type: "quest.focus-track", trackId: SIDE_TRACK_ID }))
      .toMatchObject({ success: true });
    expect(sim.state.quests.focusedTrackId).toBe(SIDE_TRACK_ID);
    expect(sim.query({ type: "quest.get-active" })).toMatchObject({ questId: sideEntry.id });
  });
});

describe("the tides side track", () => {
  it("stays closed until the maiden voyage, then opens on its own", () => {
    ContentRegistry.initializeAndValidate();
    const sim = new Simulation();
    expect(questTrackProgress(sim.state.quests, "track.tides").activeQuestId).toBeNull();

    // Completing the spine quest that gates it is what opens the track; no
    // separate unlock step and no branch.
    sim.state.quests.completedQuestIds.push("quest.act5_maiden_voyage");
    sim.questDomain.evaluateTrackUnlocks();

    expect(questTrackProgress(sim.state.quests, "track.tides").activeQuestId)
      .toBe("quest.tides_home_water");
    // The spine keeps its own cursor and is untouched by the side track opening.
    expect(questTrackProgress(sim.state.quests, MAIN_QUEST_TRACK_ID).activeQuestId)
      .toBe("quest.act1_welcome");
  });

  it("chains all seven quests in one track, ends the lessons on a practice entry, then the silver king", () => {
    const chain: string[] = [];
    let quest = ContentRegistry.quests.get("quest.tides_home_water");
    while (quest) {
      chain.push(quest.id);
      expect(quest.trackId).toBe("track.tides");
      quest = quest.nextQuestId ? ContentRegistry.quests.get(quest.nextQuestId) : undefined;
    }
    expect(chain).toHaveLength(7);
    const practice = ContentRegistry.quests.get("quest.tides_every_water")!;
    expect(practice.rewards.unlocksKnowledgeIds).toEqual(["knowledge.reading_the_water"]);
    expect(ContentRegistry.knowledge.has("knowledge.reading_the_water")).toBe(true);
    expect(chain[chain.length - 1]).toBe("quest.tides_blue_marlin");
    expect(ContentRegistry.quests.get("quest.tides_blue_marlin")!.objectives[0]?.targetId)
      .toBe("fish.blue_marlin");
  });

  it("keeps species that vanish for a season off the main spine", () => {
    // The property that matters is availability, not the length of the
    // authored season list. Season is a rate: a shoulder season still spawns
    // the species thinly, so a two-season fish like the amberjack can be
    // caught year round and never blocks the story. Only a species whose
    // weight actually reaches zero can stall the spine — today that is the
    // arowana and the sailfish, both of which sit on side tracks.
    const seasonal = [...ContentRegistry.fishSpecies.values()]
      .filter((fish) => SEASONS.some((season) => speciesSeasonWeight(fish, season) === 0))
      .map((fish) => fish.id);
    expect(seasonal).toContain("fish.arowana");
    for (const quest of ContentRegistry.quests.values()) {
      if (quest.trackId !== MAIN_QUEST_TRACK_ID) continue;
      for (const objective of quest.objectives) {
        if (!objective.targetId || !seasonal.includes(objective.targetId)) continue;
        throw new Error(
          `${quest.id}/${objective.id} puts seasonal '${objective.targetId}' on the main spine`
        );
      }
    }
  });
});

describe("the cove commons side track", () => {
  it("opens after the compost lesson and runs its own five-quest chain", () => {
    ContentRegistry.initializeAndValidate();
    expect(ContentRegistry.questTracks.get("track.homestead")?.title).toBe("The Cove Commons");
    const sim = new Simulation();
    expect(questTrackProgress(sim.state.quests, "track.homestead").activeQuestId).toBeNull();

    sim.state.quests.completedQuestIds.push("quest.act2_harvest_and_compost");
    sim.questDomain.evaluateTrackUnlocks();
    expect(questTrackProgress(sim.state.quests, "track.homestead").activeQuestId)
      .toBe("quest.homestead_seed_pouch");

    const chain: string[] = [];
    let quest = ContentRegistry.quests.get("quest.homestead_seed_pouch");
    while (quest) {
      chain.push(quest.id);
      expect(quest.trackId).toBe("track.homestead");
      quest = quest.nextQuestId ? ContentRegistry.quests.get(quest.nextQuestId) : undefined;
    }
    expect(chain).toHaveLength(5);
    expect(chain.map((id) => ContentRegistry.quests.get(id)!.questTitle)).toEqual([
      "The Family Key",
      "A Furrow for Everyone",
      "A Fair Share",
      "Tools That Outlast Us",
      "Shade for the Next Season"
    ]);
    expect(ContentRegistry.quests.get(chain[chain.length - 1])!.rewards.unlocksKnowledgeIds)
      .toEqual(["knowledge.family_ledger"]);
  });

  it("carries three threads at once without them interfering", () => {
    ContentRegistry.initializeAndValidate();
    const sim = new Simulation();
    sim.state.quests.completedQuestIds.push("quest.act2_harvest_and_compost", "quest.act5_maiden_voyage");
    sim.questDomain.evaluateTrackUnlocks();

    const active = activeQuestTrackIds(sim.state.quests).sort();
    expect(active).toEqual(["track.homestead", "track.main", "track.tides"]);

    // A commons planting advances only the chain that asked for it: the
    // spine is on its own quest and the tides track wants a fish.
    const homestead = questTrackProgress(sim.state.quests, "track.homestead");
    homestead.activeQuestId = "quest.homestead_overgrown_rows";
    homestead.activeStepIndex = 0;
    homestead.stepProgress = {};
    const tides = questTrackProgress(sim.state.quests, "track.tides");
    const tidesBefore = { ...tides.stepProgress };

    sim.events.emit("CropPlanted", {
      farmId: "farm.player_homestead",
      cropId: "crop.wheat",
      placedCropId: "crop.test",
      minute: 0
    });

    expect(homestead.stepProgress["step.homestead_plant_wheat"]).toBe(1);
    expect(tides.stepProgress).toEqual(tidesBefore);
  });

  it("shows the apple-tree gate and requires the first apple at the final hand-in", () => {
    ContentRegistry.initializeAndValidate();
    const sim = new Simulation();
    setQuestCursor(sim, "track.main", "quest.act3_market_intro");
    setQuestCursor(sim, "track.homestead", "quest.homestead_orchard", 0);

    expect(sim.questDomain.getActiveQuestDto("track.homestead")?.requirements).toEqual([
      { kind: "amount", label: "Farming XP", current: 0, required: 7500, met: false }
    ]);

    setQuestCursor(sim, "track.homestead", "quest.homestead_orchard", 2, {
      "step.homestead_report_elspeth": 1
    });
    const elspeth = npcAnchorAt("npc.elspeth", sim.state.clock, sim.state.quests);
    sim.state.player.x = elspeth.x;
    sim.state.player.z = elspeth.z;
    const blocked = sim.questDomain.talkToNpc("npc.elspeth");
    expect(blocked.questCompleted).toBe(false);
    expect(blocked.segments.find((segment) => segment.questId === "quest.homestead_orchard")?.note)
      .toContain("Bring 1 Orchard Apple");

    InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [
      { itemId: "produce.apple", quantity: 1 }
    ]);
    const completed = sim.questDomain.talkToNpc("npc.elspeth");
    expect(completed.segments.some((segment) => segment.kind === "completion" && segment.questId === "quest.homestead_orchard"))
      .toBe(true);
    expect(sim.state.quests.completedQuestIds).toContain("quest.homestead_orchard");
  });
});

describe("the freight side track", () => {
  it("targets contract types rather than templates the board may not roll", () => {
    ContentRegistry.initializeAndValidate();
    // Naming one template would make the quest wait on a dice roll: the board
    // fills a few slots from two dozen templates.
    const chain: string[] = [];
    let quest = ContentRegistry.quests.get("quest.tradelanes_volume");
    while (quest) {
      chain.push(quest.id);
      expect(quest.trackId).toBe("track.tradelanes");
      quest = quest.nextQuestId ? ContentRegistry.quests.get(quest.nextQuestId) : undefined;
    }
    expect(chain).toHaveLength(5);

    const contractTargets = [...ContentRegistry.quests.values()]
      .filter((candidate) => candidate.trackId === "track.tradelanes")
      .flatMap((candidate) => candidate.objectives)
      .filter((objective) => objective.type === "complete-contract")
      .map((objective) => objective.targetId);
    expect(contractTargets.length).toBeGreaterThan(0);
    for (const target of contractTargets) {
      // A kind of order — a type, or a tag carried by several templates —
      // never one template the board may not roll.
      const tag = target!.startsWith("tag:") ? target!.slice(4) : null;
      const kindOfOrder = CONTRACT_TYPES.has(target!)
        || (tag !== null && [...ContentRegistry.contractTemplates.values()].filter((template) => template.tags?.includes(tag)).length > 1);
      expect(kindOfOrder, `${target} should name a kind of order`).toBe(true);
      expect(ContentRegistry.contractTemplates.has(target!)).toBe(false);
    }
  });

  it("advances a type-targeted objective from any contract of that type", () => {
    const sim = new Simulation();
    const track = questTrackProgress(sim.state.quests, "track.tradelanes");
    track.activeQuestId = "quest.tradelanes_volume";
    track.activeStepIndex = 0;
    track.stepProgress = {};

    // A produce contract must not satisfy the bulk-order objective...
    sim.events.emit("ContractCompleted", {
      contractId: "contract.a",
      templateId: "contract.wheat_supply",
      contractType: "produce",
      rewardMoney: 10,
      minute: 0
    });
    expect(track.stepProgress).toEqual({});

    // ...but any bulk order does, whichever template rolled it.
    sim.events.emit("ContractCompleted", {
      contractId: "contract.b",
      templateId: "contract.bulk_root_order",
      contractType: "bulk-order",
      rewardMoney: 10,
      minute: 0
    });
    expect(track.stepProgress["step.tradelanes_bulk"]).toBe(1);
  });
});
