import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { PROFICIENCY_RANKS } from "../../src/content/progression";
import { mainQuestTrack } from "../../src/simulation/core/QuestTypes";
import { npcAnchorAt } from "../../src/simulation/presentation/NpcPresentation";
import type { FishCargoState } from "../../src/simulation/core/types";

describe("audit transaction boundaries", () => {
  it("commits quest rewards and cursor before rank listeners run or retry", () => {
    const sim = new Simulation();
    const quest = ContentRegistry.quests.get("quest.act1_welcome")!;
    const track = mainQuestTrack(sim.state.quests);
    track.activeStepIndex = quest.objectives.length - 1;
    const objective = quest.objectives[track.activeStepIndex];
    track.stepProgress[objective.id] = objective.targetQuantity;
    Object.assign(sim.state.player, npcAnchorAt(quest.speakerId, sim.state.clock, sim.state.quests));
    const xp = quest.rewards.skillXp![0];
    sim.state.player.proficiencies[xp.skill] = PROFICIENCY_RANKS[1].xpRequired - xp.xp;
    let notifications = 0;
    sim.events.on("ProficiencyLeveledUp", () => {
      notifications++;
      expect(sim.state.quests.completedQuestIds).toContain(quest.id);
      expect(mainQuestTrack(sim.state.quests).activeQuestId).toBe(quest.nextQuestId);
      expect(sim.questDomain.completeQuest(quest.id, quest.speakerId).success).toBe(false);
    });
    expect(sim.questDomain.completeQuest(quest.id, quest.speakerId).success).toBe(true);
    expect(notifications).toBe(1);
    expect(sim.state.player.proficiencies[xp.skill]).toBe(PROFICIENCY_RANKS[1].xpRequired);
  });

  it("cannot authorize a remote boat cargo by naming its dock market", () => {
    const sim = new Simulation();
    const boat = Object.values(sim.state.boats)[0];
    boat.isDocked = true;
    boat.dockedMarketId = "market.harbor";
    const cargo: FishCargoState = {
      id: "cargo.remote", speciesId: "fish.trout", weightKg: 2, quality: "common", caughtAtMinute: 0,
      freshness: 100, cargoClass: "medium", location: { type: "boat-hold", containerId: boat.id, slotIndex: 0 }
    };
    sim.state.fishCargo[cargo.id] = cargo;
    expect(sim.canAccessFishCargo(cargo, "market.harbor")).toBe(false);
    expect(sim.discardFishCargo(cargo.id, "market.harbor").success).toBe(false);
    expect(sim.state.fishCargo[cargo.id]).toBe(cargo);
    Object.assign(sim.state.player, ContentRegistry.markets.get("market.harbor")!.interactionPosition);
    expect(sim.canAccessFishCargo(cargo, "market.harbor")).toBe(true);
  });
});
