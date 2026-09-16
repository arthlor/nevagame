import { beforeAll, describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import type { ResolvedPhysicsFrame } from "../../src/simulation/core/PhysicsAdapter";
import {
  mainQuestTrack,
  questTrackProgress,
  type ConversationResult
} from "../../src/simulation/core/QuestTypes";
import {
  buildNearbyNpcBarks,
  npcAnchorAt
} from "../../src/simulation/presentation/NpcPresentation";
import {
  SCHOOL_SPAWN_POINTS,
  schoolSpawnPointIndex
} from "../../src/simulation/domains/FishingDomain";
import { WorldLayout } from "../../src/world/WorldLayout";
import { HARBOR_SKIFF_MOORING } from "../../src/world/WorldAnchors";
import type { GameState } from "../../src/simulation/core/types";

/**
 * Story flow and the progression blockers found by playing the whole spine
 * headlessly: one conversation per talk, heralds, the Act 10 round, the dead
 * trench ground, the Willow-rod bream, the quest-aware contract board.
 */

// The first Simulation builds the content registry and world layout caches.
// Pay that once, with room for a loaded host, rather than inside whichever
// test happens to run first.
beforeAll(() => {
  new Simulation().questDomain.dispose();
}, 240_000);

function setQuest(sim: Simulation, trackId: string, questId: string, stepIndex = 0, stepProgress: Record<string, number> = {}): void {
  const progress = questTrackProgress(sim.state.quests, trackId);
  progress.activeQuestId = questId;
  progress.activeStepIndex = stepIndex;
  progress.stepProgress = stepProgress;
  if (trackId === "track.main") sim.state.quests.activeActId = ContentRegistry.quests.get(questId)!.actId;
}

function commitPose(sim: Simulation, x: number, z: number): void {
  const { player, boats } = sim.state;
  const activeBoatId = player.activeBoatId;
  const frame: ResolvedPhysicsFrame = {
    player: {
      x,
      y: activeBoatId || WorldLayout.isWater(x, z) ? 0.5 : WorldLayout.terrainHeight(x, z) + 0.5,
      z,
      rotationY: 0,
      traversal: { ...player.traversal, isGrounded: true }
    },
    boats: Object.fromEntries(Object.values(boats).map((boat) => [boat.id, {
      x: boat.id === activeBoatId ? x : boat.x,
      y: boat.id === activeBoatId ? 0 : boat.y,
      z: boat.id === activeBoatId ? z : boat.z,
      headingRadians: boat.headingRadians,
      speed: 0
    }]))
  };
  expect(sim.execute({ type: "physics.commit", frame })).toMatchObject({ success: true });
}

function talk(sim: Simulation, npcId: string): ConversationResult {
  const anchor = npcAnchorAt(npcId, sim.state.clock, sim.state.quests);
  commitPose(sim, anchor.x, anchor.z);
  const result = sim.questDomain.talkToNpc(npcId);
  expect(result.success, result.reason).toBe(true);
  return result;
}

const shape = (result: ConversationResult) => result.segments.map((segment) => `${segment.kind}:${segment.questId ?? "-"}`);

function inventory(sim: Simulation) {
  return sim.state.inventories[sim.state.player.inventoryId];
}

function catchBasic(sim: Simulation): string | null {
  const startRes = sim.execute({ type: "fishing.start-charge-basic" });
  expect(startRes, startRes.reason).toMatchObject({ success: true });
  expect(sim.execute({ type: "fishing.release-cast-basic", castPower: 0.8 })).toMatchObject({ success: true });
  for (let step = 0; step < 400 && sim.state.basicFishing?.phase !== "bite-reaction"; step += 1) {
    if (!sim.state.basicFishing) return null;
    sim.tick(0.1);
  }
  if (!sim.execute({ type: "fishing.hook-bite-basic" }).success) return null;
  for (let step = 0; step < 1200 && sim.state.basicFishing && sim.state.basicFishing.phase !== "caught"; step += 1) {
    const fishing = sim.state.basicFishing;
    const barY = fishing.barY ?? 0;
    const barHeight = fishing.barHeight ?? 0.2;
    const fishY = fishing.fishY ?? 0.25;
    const hold = fishY > barY + barHeight * 0.5 + 0.015 || (fishY >= barY && fishY <= barY + barHeight && (fishing.barVy ?? 0) < -0.3);
    sim.execute({ type: "fishing.control-basic", isHolding: hold });
    sim.tick(0.05);
  }
  if (sim.state.basicFishing?.phase !== "caught") return null;
  const speciesId = sim.state.basicFishing.catchItemId ?? null;
  expect(sim.execute({ type: "fishing.commit-basic" })).toMatchObject({ success: true });
  return speciesId;
}

describe("one coherent conversation per talk", () => {
  it("carries the welcome, its reward and the planting ask in a single talk", () => {
    const sim = new Simulation();
    const result = talk(sim, "npc.elspeth");
    expect(shape(result)).toEqual([
      "intro:quest.act1_welcome",
      "completion:quest.act1_welcome",
      "intro:quest.act1_sow_wheat"
    ]);
    expect(result.segments[1].rewards?.items).toEqual([{ itemId: "seed.wheat", quantity: 6 }]);
    expect(result.segments[2].startsQuest).toBe(true);
    expect(mainQuestTrack(sim.state.quests).activeQuestId).toBe("quest.act1_sow_wheat");
  });

  it("delivers a side thread's ask before its reward instead of crediting it silently", () => {
    const sim = new Simulation();
    setQuest(sim, "track.main", "quest.act3_market_intro");
    setQuest(sim, "track.homestead", "quest.homestead_seed_pouch");

    const first = talk(sim, "npc.elspeth");
    expect(shape(first)).toEqual([
      "intro:quest.homestead_seed_pouch",
      "completion:quest.homestead_seed_pouch"
    ]);
    expect(first.dialogue[0]).toContain("A seed pouch");
    expect(sim.state.journal.unlockedKnowledge).toContain("knowledge.family_seed_pouch");
    // The spine is untouched; asking again gives its own errand.
    expect(mainQuestTrack(sim.state.quests).activeQuestId).toBe("quest.act3_market_intro");
    expect(shape(talk(sim, "npc.elspeth"))).toEqual(["intro:quest.act3_market_intro"]);
  });

  it("lets an older save hear a one-step ask that was credited without being heard", () => {
    const sim = new Simulation();
    setQuest(sim, "track.main", "quest.act3_market_intro");
    setQuest(sim, "track.homestead", "quest.homestead_seed_pouch", 0, { "step.homestead_take_pouch": 1 });
    expect(shape(talk(sim, "npc.elspeth"))).toEqual([
      "intro:quest.homestead_seed_pouch",
      "completion:quest.homestead_seed_pouch"
    ]);
  });

  it("answers a report back with its completion, not a replay of the ask", () => {
    const sim = new Simulation();
    const act5 = ContentRegistry.quests.get("quest.act5_maiden_voyage")!;
    setQuest(sim, "track.main", act5.id, act5.objectives.length - 1);
    const result = talk(sim, "npc.silas");
    expect(result.segments[0]).toMatchObject({ kind: "completion", questId: act5.id });
    expect(result.dialogue[0]).toContain("Magnificent");
    // The Tides track opens on this close and Silas is its speaker, so he goes on.
    expect(shape(result)).toContain("intro:quest.tides_home_water");
  });

  it("does not take a turn-in cost in the breath that asked for it", () => {
    const sim = new Simulation();
    setQuest(sim, "track.main", "quest.act4_restore_rowboat");
    InventoryManager.addItemsAtomically(inventory(sim), [{ itemId: "item.ground_grain", quantity: 1 }]);
    const moneyBefore = sim.state.player.money;

    const ask = talk(sim, "npc.silas");
    expect(shape(ask)).toEqual(["intro:quest.act4_restore_rowboat"]);
    expect(sim.state.player.money).toBe(moneyBefore);

    const paid = talk(sim, "npc.silas");
    expect(shape(paid)).toEqual([
      "completion:quest.act4_restore_rowboat",
      "intro:quest.act5_maiden_voyage"
    ]);
    expect(paid.segments[0].paid).toEqual({ money: 30, items: [{ itemId: "item.ground_grain", quantity: 1 }] });
    expect(sim.state.player.money).toBe(moneyBefore - 30);
    expect(sim.state.journal.unlockedKnowledge).toContain("knowledge.family_slip");
  });

  it("walks the Act 10 round as farewells, not as each person's side errands", () => {
    const sim = new Simulation();
    setQuest(sim, "track.main", "quest.act10_open_horizons");
    setQuest(sim, "track.tides", "quest.tides_home_water");
    setQuest(sim, "track.tradelanes", "quest.tradelanes_freshness");
    setQuest(sim, "track.homestead", "quest.homestead_overgrown_rows");

    for (const npcId of ["npc.silas", "npc.maeve", "npc.barnaby"]) {
      const farewell = talk(sim, npcId);
      expect(shape(farewell)).toEqual(["objective:quest.act10_open_horizons"]);
      const step = ContentRegistry.quests.get("quest.act10_open_horizons")!.objectives.find((objective) => objective.targetId === npcId)!;
      expect(farewell.dialogue).toEqual(step.dialogue);
    }
    const close = talk(sim, "npc.elspeth");
    expect(close.segments[0]).toMatchObject({ kind: "completion", questId: "quest.act10_open_horizons" });
    expect(sim.state.quests.activeActId).toBe("epilogue_open");
    // The side threads were never touched by the round.
    expect(questTrackProgress(sim.state.quests, "track.tides").activeQuestId).toBe("quest.tides_home_water");
  });

  it("tells the player what comes first when they visit the round out of order", () => {
    const sim = new Simulation();
    setQuest(sim, "track.main", "quest.act10_open_horizons");
    const notices: string[] = [];
    sim.events.on("QuestStepAhead", ({ currentStepDescription }) => notices.push(currentStepDescription));
    talk(sim, "npc.barnaby");
    expect(mainQuestTrack(sim.state.quests).activeStepIndex).toBe(0);
    expect(notices).toEqual(["Speak with Old Silas at the pier"]);
  });
});

describe("heralds carry an errand whose speaker is out of reach", () => {
  it("has Silas set up the crossing before it is made, alongside his own lesson", () => {
    const sim = new Simulation();
    setQuest(sim, "track.main", "quest.act7_open_channel");
    setQuest(sim, "track.tides", "quest.tides_home_water");
    const result = talk(sim, "npc.silas");
    expect(shape(result)).toEqual(["herald:quest.act7_open_channel", "intro:quest.tides_home_water"]);
    expect(result.dialogue.join(" ")).toContain("Coastal Fishing Skiff");

    const dto = sim.questDomain.getActiveQuestDto("track.main")!;
    expect(dto.requirements).toEqual([
      { kind: "amount", label: "Fishing XP", current: 0, required: 7500, met: false },
      { kind: "amount", label: "Gold", current: sim.state.player.money, required: 850, met: false }
    ]);
    expect(dto.brief?.speakerName).toBe("Old Silas");
  });

  it("chains a herald into the conversation that begins the errand", () => {
    const sim = new Simulation();
    setQuest(sim, "track.main", "quest.act8_dry_season_end");
    const result = talk(sim, "npc.ines");
    expect(shape(result)).toEqual([
      "intro:quest.act8_dry_season_end",
      "completion:quest.act8_dry_season_end",
      "herald:quest.act9_beyond_the_grounds"
    ]);
    expect(result.segments[2].startsQuest).toBe(true);
  });

  it("calls the player over when someone has something for them", () => {
    const sim = new Simulation();
    const elspeth = ContentRegistry.npcs.get("npc.elspeth")!;
    const anchor = npcAnchorAt(elspeth.id, sim.state.clock, sim.state.quests);
    commitPose(sim, anchor.x, anchor.z);
    const barkLines = () => buildNearbyNpcBarks(sim.state).find((bark) => bark.npcId === elspeth.id)!.lines;
    expect(barkLines()).toEqual(elspeth.beckonLines);
    talk(sim, elspeth.id);
    // The planting ask is the next step and it is out in the field, not with her.
    expect(barkLines()).not.toEqual(elspeth.beckonLines);
  });
});

describe("progression blockers", () => {
  it("lets the starter Willow rod land Act 7's golden bream from the skiff at the reef", () => {
    const sim = new Simulation();
    sim.state.quests.unlockedFeatureIds.push("boat.player_rowboat");
    sim.state.player.proficiencies.fishing = 7600;
    sim.state.player.money = 2000;
    commitPose(sim, HARBOR_SKIFF_MOORING.playerPosition.x, HARBOR_SKIFF_MOORING.playerPosition.z);
    expect(sim.execute({ type: "boat.purchase-skiff" })).toMatchObject({ success: true });
    expect(sim.execute({ type: "boat.board", boatId: "boat.player_skiff" })).toMatchObject({ success: true });
    expect(sim.state.player.equippedRodId).toBe("rod.willow");

    const reef = SCHOOL_SPAWN_POINTS.find((point) => point.ecologyId === "ecology.sunreach" && point.habitatId === "coast")!;
    commitPose(sim, reef.x, reef.z);
    const catches = new Set<string>();
    for (let cast = 0; cast < 24 && !catches.has("fish.sea_bream"); cast += 1) {
      const caught = catchBasic(sim);
      if (caught) catches.add(caught);
      // Physical catches stow in the hold; free it so the deck stays workable.
      for (const cargo of Object.values(sim.state.fishCargo)) sim.execute({ type: "cargo.release", cargoId: cargo.id });
    }
    expect(catches.has("fish.sea_bream")).toBe(true);
  }, 120_000);

  it("spawns schools at the deep trench alongside the outer offshore grounds", () => {
    const sim = new Simulation();
    const trenchIndex = SCHOOL_SPAWN_POINTS.findIndex((point) =>
      point.ecologyId === "ecology.neva" && point.habitatId === "offshore" && point.x < 0
    );
    expect(trenchIndex).toBeGreaterThanOrEqual(0);
    const seenPoints = new Set<number>();
    for (let minute = 0; minute < 3 * 1440 && !seenPoints.has(trenchIndex); minute += 30) {
      sim.advanceGameMinutes(30);
      for (const school of Object.values(sim.state.world.activeSchools)) seenPoints.add(schoolSpawnPointIndex(school));
    }
    expect(seenPoints.has(trenchIndex)).toBe(true);
  });

  it("keeps Sunreach's coast school on the reef edge and points the quest marker at it", () => {
    const sim = new Simulation();
    const reef = SCHOOL_SPAWN_POINTS.find((point) => point.ecologyId === "ecology.sunreach" && point.habitatId === "coast")!;
    expect(WorldLayout.fishingHabitatAt(reef.x, reef.z)).toBe("coast");
    expect(WorldLayout.fishingEcologyAt(reef.x, reef.z).id).toBe("ecology.sunreach");
    setQuest(sim, "track.main", "quest.act7_reef_answer");
    const schoolId = sim.spawnFishSchool("coast", reef.x, reef.z, ["fish.amberjack"]);
    const school = sim.state.world.activeSchools[schoolId];
    const dto = sim.questDomain.getActiveQuestDto("track.main")!;
    expect(dto.targetLocation).toMatchObject({ x: school.x, z: school.z });
  });

  it("names the rod a school needs and the stalls that stock it", () => {
    const sim = new Simulation();
    const reef = SCHOOL_SPAWN_POINTS.find((point) => point.ecologyId === "ecology.sunreach" && point.habitatId === "coast")!;
    sim.state.player.ownedRodIds = ["rod.willow", "rod.river"];
    sim.state.player.equippedRodId = "rod.river";
    InventoryManager.addItemsAtomically(inventory(sim), [
      { itemId: "item.chum_bucket", quantity: 1 },
      { itemId: "item.basic_lure", quantity: 1 }
    ]);
    const schoolId = sim.spawnFishSchool("coast", reef.x, reef.z, ["fish.amberjack"]);
    sim.state.player.x = reef.x;
    sim.state.player.z = reef.z;
    expect(sim.chumFishSchool(schoolId).success).toBe(true);
    expect(sim.execute({ type: "fishing.toggle-lure" })).toMatchObject({ success: true });
    const refusal = sim.hookSportFish(schoolId);
    expect(refusal.success).toBe(false);
    expect(refusal.reason).toContain("Heavy Sport Rod");
    expect(refusal.reason).toContain("Sunreach Cove Market");
  });
});

describe("the contract board and the story", () => {
  function fillBoardWithProduce(state: GameState): void {
    state.contracts = ["contract.wheat_supply", "contract.potato_cellar", "contract.carrot_crates"].map((templateId, index) => {
      const template = ContentRegistry.contractTemplates.get(templateId)!;
      return {
        id: `contract.test_${index}`,
        templateId,
        requesterId: templateId,
        deliveryMarketId: template.deliveryMarketId,
        type: template.type,
        targetItemIdOrSpecies: template.itemOrSpeciesPool[0],
        quantityRequired: template.quantityRange[0],
        quantityFulfilled: 0,
        rewardMoney: 50,
        rewardSkillXp: { skill: template.rewardSkill, xp: 50 },
        expiresAtMinute: state.clock.currentMinute + 10_000,
        status: "active" as const
      };
    });
  }

  it("posts the gentlest order of the kind a story step is waiting on", () => {
    const sim = new Simulation();
    setQuest(sim, "track.main", "quest.act9_standing_arrangement");
    sim.state.quests.unlockedFeatureIds.push("boat.player_rowboat");
    Object.assign(sim.state.player.proficiencies, { fishing: 8000, trading: 5000 });
    sim.state.player.ownedRodIds = ["rod.willow", "rod.river", "rod.heavy_sport"];
    sim.state.player.equippedRodId = "rod.heavy_sport";
    fillBoardWithProduce(sim.state);

    expect(sim.execute({ type: "contract.pass", contractId: "contract.test_0" })).toMatchObject({ success: true });
    const active = sim.state.contracts.filter((contract) => contract.status === "active");
    expect(active).toHaveLength(3);
    const posted = active.find((contract) => !contract.id.startsWith("contract.test_"))!;
    expect(posted.type).toBe("quality-target");
    // Of the quality orders this player can take, the one without a trophy
    // grade or weight floor.
    expect(posted.templateId).toBe("contract.arowana_commission");
  });

  it("keeps an order once goods have been delivered against it", () => {
    const sim = new Simulation();
    fillBoardWithProduce(sim.state);
    sim.state.contracts[0].quantityFulfilled = 1;
    expect(sim.execute({ type: "contract.pass", contractId: sim.state.contracts[0].id })).toMatchObject({ success: false });
    expect(sim.state.contracts[0].status).toBe("active");
  });

  it("counts only an order whose goods cross the channel for The Long Way Round", () => {
    const sim = new Simulation();
    setQuest(sim, "track.tradelanes", "quest.tradelanes_crossing", 1);
    const complete = (templateId: string) => {
      const template = ContentRegistry.contractTemplates.get(templateId)!;
      sim.events.emit("ContractCompleted", { contractId: `c.${templateId}`, templateId, contractType: template.type, rewardMoney: 1, minute: 0 });
    };
    complete("contract.wheat_supply");
    expect(questTrackProgress(sim.state.quests, "track.tradelanes").stepProgress).toEqual({});
    complete("contract.sunreach_olive_delivery");
    expect(questTrackProgress(sim.state.quests, "track.tradelanes").stepProgress).toEqual({ "step.tradelanes_cross_order": 1 });
  });
});

describe("journal continuity", () => {
  it("writes newly authored family entries into saves that finished those errands, replaying nothing", () => {
    const original = new Simulation();
    original.state.quests.completedQuestIds.push("quest.act4_restore_rowboat", "quest.homestead_worn_tools");
    const money = original.state.player.money;
    const reloaded = new Simulation(structuredClone(original.state));
    expect(reloaded.state.journal.unlockedKnowledge).toEqual(
      expect.arrayContaining(["knowledge.family_slip", "knowledge.worn_handle"])
    );
    expect(reloaded.state.player.money).toBe(money);
  });

  it("announces work done ahead of the step that would count it", () => {
    const sim = new Simulation();
    setQuest(sim, "track.main", "quest.act7_land_sea_cycle");
    const notices: string[] = [];
    sim.events.on("QuestStepAhead", ({ currentStepDescription }) => notices.push(currentStepDescription));
    sim.events.emit("RecipeCompleted", { jobId: "job.test", recipeId: "recipe.fish_to_fertilizer", stationId: "struct.sunreach_fish_table", minute: 0 });
    expect(mainQuestTrack(sim.state.quests).stepProgress).toEqual({});
    expect(notices).toEqual(["Catch two Sunreach Sardines in the cove"]);
  });
});
