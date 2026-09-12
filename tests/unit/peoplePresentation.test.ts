import { beforeAll, describe, expect, it } from "vitest";

import { ContentRegistry } from "../../src/content/ContentRegistry";
import type { GameState } from "../../src/simulation/core/types";
import { buildPeoplePageDto, standingFor } from "../../src/simulation/presentation/PeoplePresentation";

/**
 * The folio is a pure read of quest/journal/rank state, so these tests use a
 * minimal slice of `GameState` instead of building a full simulation.
 */
function state(overrides: {
  completedQuestIds?: string[];
  unlockedFeatureIds?: string[];
  unlockedKnowledge?: string[];
  fishingXp?: number;
} = {}): GameState {
  return {
    clock: { timeOfDay: "day" },
    player: {
      proficiencies: { farming: 0, fishing: overrides.fishingXp ?? 0, processing: 0, trading: 0 }
    },
    quests: {
      completedQuestIds: overrides.completedQuestIds ?? [],
      unlockedFeatureIds: overrides.unlockedFeatureIds ?? []
    },
    journal: { unlockedKnowledge: overrides.unlockedKnowledge ?? [] }
  } as unknown as GameState;
}

describe("people folio", () => {
  beforeAll(() => {
    ContentRegistry.initializeAndValidate();
  });

  it("lists every named person once with a line, location and standing", () => {
    const page = buildPeoplePageDto(state());
    expect(page.total).toBe(ContentRegistry.npcs.size);
    expect(page.people).toHaveLength(page.total);
    for (const person of page.people) {
      expect(person.line.length, person.id).toBeGreaterThan(0);
      expect(person.name.length, person.id).toBeGreaterThan(0);
      expect(person.locationName.length, person.id).toBeGreaterThan(0);
      expect(person.portraitIcon.length, person.id).toBeGreaterThan(0);
      expect(person.standingTier, person.id).toBeGreaterThanOrEqual(0);
      expect(person.standingTier, person.id).toBeLessThanOrEqual(3);
    }
  });

  it("reads standing from earned commissions and recognition, not a new stat", () => {
    expect(standingFor(0, false)).toEqual({ label: "New to the coast", tier: 0 });
    expect(standingFor(1, false).tier).toBe(1);
    expect(standingFor(0, true).tier).toBe(1);
    expect(standingFor(3, false).tier).toBe(2);
    expect(standingFor(6, false).tier).toBe(3);
  });

  it("counts a completed quest toward its speaker", () => {
    const quest = [...ContentRegistry.quests.values()][0]!;
    const before = buildPeoplePageDto(state()).people.find((person) => person.id === quest.speakerId)!;
    const after = buildPeoplePageDto(state({ completedQuestIds: [quest.id] }))
      .people.find((person) => person.id === quest.speakerId)!;
    expect(after.questsCompleted).toBe(before.questsCompleted + 1);
  });

  it("surfaces an earned recognition line as the current line", () => {
    const silas = ContentRegistry.npcs.get("npc.silas")!;
    const recognitionLines = (silas.recognitionDialogue ?? []).flatMap((entry) => entry.lines);
    const person = buildPeoplePageDto(state({ fishingXp: 999999 }))
      .people.find((entry) => entry.id === silas.id)!;
    expect(person.recognized).toBe(true);
    expect(recognitionLines).toContain(person.line);
    expect(silas.idleDialogue).not.toContain(person.line);
  });
});
