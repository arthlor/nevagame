import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { QUESTS } from "../../src/content/quests";
import type { QuestDefinition } from "../../src/simulation/core/QuestTypes";

function copyQuests(): QuestDefinition[] {
  return structuredClone(QUESTS);
}

describe("quest content validation", () => {
  it("rejects duplicate quest and objective ids", () => {
    expect(() => ContentRegistry.validateQuestDefinitions([...copyQuests(), copyQuests()[0]])).toThrow(/Duplicate quest id/);
    const quests = copyQuests();
    quests[1].objectives[0].id = quests[0].objectives[0].id;
    expect(() => ContentRegistry.validateQuestDefinitions(quests)).toThrow(/Duplicate quest objective id/);
  });

  it("rejects broken targets, locations, costs, and objective types", () => {
    const brokenTarget = copyQuests();
    brokenTarget[0].objectives[0].targetId = "npc.missing";
    expect(() => ContentRegistry.validateQuestDefinitions(brokenTarget)).toThrow(/not an NPC/);

    const brokenLocation = copyQuests();
    brokenLocation[1].objectives[0].location = { kind: "farm", id: "farm.missing" };
    expect(() => ContentRegistry.validateQuestDefinitions(brokenLocation)).toThrow(/unknown farm/);

    const invalidCost = copyQuests();
    invalidCost[7].turnInCost = { money: -1 };
    expect(() => ContentRegistry.validateQuestDefinitions(invalidCost)).toThrow(/invalid turn-in money cost/);

    const unsupported = copyQuests();
    unsupported[0].objectives[0].type = "wait-for-cutscene" as never;
    expect(() => ContentRegistry.validateQuestDefinitions(unsupported)).toThrow(/unsupported type/);
  });

  it("rejects a landing objective located by habitat, which can never complete", () => {
    // `FishLanded` carries speciesId, ecologyId and boatId — never a habitat —
    // so the validator must refuse the objective rather than let it ship as a
    // quest that silently cannot be finished.
    const quests = copyQuests();
    const landing = quests.find((quest) =>
      quest.objectives.some((objective) => objective.type === "land-sport-fish")
    )!;
    const objective = landing.objectives.find((candidate) => candidate.type === "land-sport-fish")!;
    objective.location = { kind: "habitat", id: "coast" };
    expect(() => ContentRegistry.validateQuestDefinitions(quests)).toThrow(/unsupported habitat location/);
  });

  it("rejects cycles and unreachable entries", () => {
    const cycle = copyQuests();
    cycle[cycle.length - 1].nextQuestId = cycle[0].id;
    expect(() => ContentRegistry.validateQuestDefinitions(cycle)).toThrow(/cycle/);

    const unreachable = copyQuests();
    unreachable[9].nextQuestId = undefined;
    expect(() => ContentRegistry.validateQuestDefinitions(unreachable)).toThrow(/Unreachable quests/);
  });
});
