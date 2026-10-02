import { beforeAll, describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { TR_QUESTS } from "../../src/i18n/locales/tr/quests";
import { formatLocalizedQuestObjective, localizeQuestSegment } from "../../src/i18n/questObjectives";
import { formatQuestObjective, questObjectiveFacts, turnInObjectiveFacts } from "../../src/simulation/presentation/QuestObjectiveCopy";

beforeAll(() => ContentRegistry.initializeAndValidate());

describe("authored quest guidance", () => {
  it("localizes every herald and authored conversation step without changing the command result", () => {
    for (const quest of ContentRegistry.quests.values()) {
      if (quest.herald) {
        const translated = TR_QUESTS[quest.id]?.heraldLines;
        expect(translated, quest.id).toBeTruthy();
        expect(translated, quest.id).not.toEqual(quest.herald.lines);
        const segment = { kind: "herald" as const, questId: quest.id, lines: quest.herald.lines };
        expect(localizeQuestSegment(segment, "tr").lines).toEqual(translated);
      }
      for (const objective of quest.objectives.filter(step => step.dialogue?.length)) {
        const translated = TR_QUESTS[quest.id]?.objectives?.[objective.id]?.dialogue;
        expect(translated, objective.id).toBeTruthy();
        const segment = { kind: "objective" as const, questId: quest.id, objectiveId: objective.id, lines: objective.dialogue! };
        expect(localizeQuestSegment(segment, "tr").lines).toEqual(translated);
        expect(localizeQuestSegment(segment, "en").lines).toEqual(objective.dialogue);
        expect(segment.lines).toEqual(objective.dialogue);
      }
    }
  });
  it("preserves every authored instruction instead of replacing its constraints with a generic verb", () => {
    for (const quest of ContentRegistry.quests.values()) {
      for (const objective of quest.objectives) {
        const facts = questObjectiveFacts(objective, 0, objective.locationAnchor?.name, quest.id);
        const text = formatQuestObjective(facts);
        expect(text, objective.id).toContain(objective.description.replace(/[.!]$/, ""));
        expect(text, objective.id).not.toMatch(/^Complete:|undefined|NaN/);
        expect(formatLocalizedQuestObjective(facts, "en")).toBe(text);
        if (objective.targetQuantity === 1) expect(text, objective.id).not.toContain("0/1");
      }
    }
  });

  it("uses the exact Turkish objective on live and completed steps", () => {
    for (const quest of ContentRegistry.quests.values()) {
      for (const objective of quest.objectives) {
        const translated = TR_QUESTS[quest.id]?.objectives?.[objective.id]?.description;
        expect(translated, `${quest.id}/${objective.id}`).toBeTruthy();
        for (const current of [0, objective.targetQuantity]) {
          const facts = questObjectiveFacts(objective, current, undefined, quest.id);
          expect(formatLocalizedQuestObjective(facts, "tr"), objective.id)
            .toContain(translated!.replace(/[.!]$/, ""));
        }
      }
    }
  });

  it("keeps partial progress bounded and hides meaningless binary counters", () => {
    const quest = ContentRegistry.quests.get("quest.act1_sow_wheat")!;
    const objective = quest.objectives[0];
    expect(formatQuestObjective(questObjectiveFacts(objective, 2))).toBe("Plant 3 wheat in the prepared bed · 2/3");
    expect(formatQuestObjective(questObjectiveFacts(objective, 99))).toContain("3/3");
    expect(formatQuestObjective(questObjectiveFacts(objective, -1))).toContain("0/3");
  });

  it("distinguishes the skiff-deck catch from the preceding Sunreach catch", () => {
    const objectives = [...ContentRegistry.quests.values()].flatMap((quest) => quest.objectives);
    const shore = objectives.find((objective) => objective.id === "step.act7_land_bream")!;
    const deck = objectives.find((objective) => objective.id === "step.act7_stow_bream")!;
    expect(formatQuestObjective(questObjectiveFacts(shore, 0))).toContain("Sunreach waters");
    expect(formatQuestObjective(questObjectiveFacts(deck, 0))).toContain("deck of your skiff");
  });

  it("replaces the completed task with the recipient and localizes their name", () => {
    const facts = turnInObjectiveFacts("Old Silas");
    expect(formatLocalizedQuestObjective(facts, "en")).toBe("Talk to Old Silas to continue");
    expect(formatLocalizedQuestObjective(facts, "tr")).toContain("Silas");
    expect(formatLocalizedQuestObjective(facts, "tr")).not.toContain("Old");
  });
});
