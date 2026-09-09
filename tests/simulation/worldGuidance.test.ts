import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { buildEndgameRecordTracker, buildNextWorldHint } from "../../src/simulation/presentation/WorldGuidancePresentation";

describe("world guidance", () => {
  it("shows a contextual market hint once, followed by the existing contracts", () => {
    const sim = new Simulation();
    Object.assign(sim.state.player, ContentRegistry.markets.get("market.village")!.interactionPosition);
    expect(buildNextWorldHint(sim.state)?.hintId).toBe("hint.first_market");
    sim.questDomain.recordHintShown("hint.first_market");
    expect(buildNextWorldHint(sim.state)?.hintId).toBe("hint.first_contract");
    sim.questDomain.recordHintShown("hint.first_contract");
    expect(buildNextWorldHint(sim.state)).toBeNull();
    sim.questDomain.dispose();
  });
  it("waits for every quest track and selects only the closest unearned records", () => {
    const sim = new Simulation();
    sim.state.quests.activeActId = "epilogue_open";
    expect(buildEndgameRecordTracker(sim.state)).toEqual([]);
    sim.state.quests.completedQuestIds = [...ContentRegistry.quests.keys()];
    for (const track of Object.values(sim.state.quests.tracks)) track.activeQuestId = null;
    sim.state.journal.cropRecords["crop.wheat"] = { harvestedCount: 12 };
    const records = buildEndgameRecordTracker(sim.state);
    expect(records).toHaveLength(3);
    expect(records.every((record) => !record.achieved)).toBe(true);
    expect(records[0].progress).toBeGreaterThanOrEqual(records[1].progress);
    sim.questDomain.dispose();
  });
});
