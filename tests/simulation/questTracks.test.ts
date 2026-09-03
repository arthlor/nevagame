import { describe, expect, it, afterEach } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { Simulation } from "../../src/simulation/Simulation";
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

function registerSideTrack(): void {
  (ContentRegistry.questTracks as Map<string, QuestTrackDefinition>).set(SIDE_TRACK_ID, sideTrack);
  (ContentRegistry.quests as Map<string, QuestDefinition>).set(sideEntry.id, sideEntry);
}

function unregisterSideTrack(): void {
  (ContentRegistry.questTracks as Map<string, QuestTrackDefinition>).delete(SIDE_TRACK_ID);
  (ContentRegistry.quests as Map<string, QuestDefinition>).delete(sideEntry.id);
}

describe("quest tracks", () => {
  afterEach(unregisterSideTrack);

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

  it("chains all six quests in one track and ends with a practice entry", () => {
    const chain: string[] = [];
    let quest = ContentRegistry.quests.get("quest.tides_home_water");
    while (quest) {
      chain.push(quest.id);
      expect(quest.trackId).toBe("track.tides");
      quest = quest.nextQuestId ? ContentRegistry.quests.get(quest.nextQuestId) : undefined;
    }
    expect(chain).toHaveLength(6);
    const last = ContentRegistry.quests.get(chain[chain.length - 1])!;
    expect(last.rewards.unlocksKnowledgeIds).toEqual(["knowledge.reading_the_water"]);
    expect(ContentRegistry.knowledge.has("knowledge.reading_the_water")).toBe(true);
  });

  it("keeps every seasonal objective off the main spine", () => {
    // The point of the track: a species that is out of season for most of the
    // year must never sit on the chain the story runs through.
    const seasonal = [...ContentRegistry.fishSpecies.values()]
      .filter((fish) => fish.seasons.length < 4)
      .map((fish) => fish.id);
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

describe("the family ledger side track", () => {
  it("opens after the compost lesson and runs its own five-quest chain", () => {
    ContentRegistry.initializeAndValidate();
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

    // A homestead planting advances only the chain that asked for it: the
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
});
