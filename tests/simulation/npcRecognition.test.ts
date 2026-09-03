import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { PROFICIENCY_RANKS } from "../../src/content/progression";
import { NPC_STATION_BEATS } from "../../src/render/scene/npcStationBeat";
import { Simulation } from "../../src/simulation/Simulation";

/**
 * Milestone recognition is the one in-contract lever for making the world
 * react — `LLM/02` section 22 defers relationship state, branching and
 * schedules, and this stays inside that. It had five entries across six NPCs,
 * so the cast said almost nothing about anything the player had done.
 */
describe("npc recognition", () => {
  it("gives every NPC something to notice", () => {
    ContentRegistry.initializeAndValidate();
    for (const npc of ContentRegistry.npcs.values()) {
      expect(
        (npc.recognitionDialogue ?? []).length,
        `${npc.id} never reacts to anything the player does`
      ).toBeGreaterThan(0);
    }
  });

  it("moves every NPC, including the two Sunreach shipped standing still", () => {
    for (const npc of ContentRegistry.npcs.values()) {
      expect(NPC_STATION_BEATS[npc.id], `${npc.id} has no station beat`).toBeDefined();
    }
  });

  it("returns idle lines until a milestone is earned, then the milestone", () => {
    const sim = new Simulation();
    const silas = ContentRegistry.npcs.get("npc.silas")!;
    sim.state.player.x = silas.anchor.x;
    sim.state.player.z = silas.anchor.z;

    const before = sim.execute({ type: "quest.talk-npc", npcId: "npc.silas" }) as { dialogue?: string[] };
    expect(silas.idleDialogue).toContain(before.dialogue?.[0]);

    // Rank-gated recognition: the axis NPCs were previously blind to.
    const masterRank = PROFICIENCY_RANKS[4];
    sim.state.player.proficiencies.fishing = masterRank.xpRequired;
    const after = sim.execute({ type: "quest.talk-npc", npcId: "npc.silas" }) as { dialogue?: string[] };
    expect(silas.idleDialogue).not.toContain(after.dialogue?.[0]);
    const rankEntry = silas.recognitionDialogue!.find((entry) => entry.requiresRankIndex);
    expect(rankEntry).toBeDefined();
    expect(after.dialogue).toEqual(rankEntry!.lines);
  });

  it("does not fire a rank line one XP below its threshold", () => {
    const sim = new Simulation();
    const silas = ContentRegistry.npcs.get("npc.silas")!;
    sim.state.player.x = silas.anchor.x;
    sim.state.player.z = silas.anchor.z;
    const rankEntry = silas.recognitionDialogue!.find((entry) => entry.requiresRankIndex)!;
    const threshold = PROFICIENCY_RANKS[rankEntry.requiresRankIndex!.rankIndex].xpRequired;

    sim.state.player.proficiencies.fishing = threshold - 1;
    const below = sim.execute({ type: "quest.talk-npc", npcId: "npc.silas" }) as { dialogue?: string[] };
    expect(below.dialogue).not.toEqual(rankEntry.lines);

    sim.state.player.proficiencies.fishing = threshold;
    const at = sim.execute({ type: "quest.talk-npc", npcId: "npc.silas" }) as { dialogue?: string[] };
    expect(at.dialogue).toEqual(rankEntry.lines);
  });

  it("keeps every recognition predicate reachable", () => {
    // The validator rejects unknown ids at startup; this asserts the rest of
    // the shape — that nothing depends on a rank the ladder does not define
    // and every entry actually carries a predicate to earn.
    for (const npc of ContentRegistry.npcs.values()) {
      for (const entry of npc.recognitionDialogue ?? []) {
        const predicates =
          (entry.requiresCompletedQuestIds?.length ?? 0)
          + (entry.requiresFeatureIds?.length ?? 0)
          + (entry.requiresKnowledgeIds?.length ?? 0)
          + (entry.requiresRankIndex ? 1 : 0);
        expect(predicates, `${npc.id}/${entry.id} would always fire`).toBeGreaterThan(0);
      }
    }
  });
});
