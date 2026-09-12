import { describe, expect, it } from "vitest";

import {
  selectVillageNotices,
  type VillageNoticeContext
} from "../../src/content/villageBulletin";

function context(overrides: Partial<VillageNoticeContext> = {}): VillageNoticeContext {
  return {
    completedQuestIds: [],
    unlockedFeatureIds: [],
    unlockedKnowledgeIds: [],
    rankIndexBySkill: {},
    ...overrides
  };
}

describe("selectVillageNotices", () => {
  it("always pins the standing town notices", () => {
    const ids = selectVillageNotices(context()).map((notice) => notice.id);
    expect(ids).toContain("notice.market_days");
    expect(ids).toContain("notice.tide_tables");
    expect(ids).not.toContain("notice.mill_queue");
  });

  it("reveals a notice only once its knowledge is earned", () => {
    expect(selectVillageNotices(context()).map((n) => n.id)).not.toContain("notice.mill_queue");
    const unlocked = selectVillageNotices(
      context({ unlockedKnowledgeIds: ["knowledge.wheat_milling"] })
    ).map((n) => n.id);
    expect(unlocked).toContain("notice.mill_queue");
  });

  it("reveals a notice only once its feature is unlocked", () => {
    expect(selectVillageNotices(context()).map((n) => n.id)).not.toContain("notice.expedition_indoor");
    const unlocked = selectVillageNotices(
      context({ unlockedFeatureIds: ["feature.expedition_planner"] })
    ).map((n) => n.id);
    expect(unlocked).toContain("notice.expedition_indoor");
  });

  it("gates the deep-water notice behind the Expert fishing rank", () => {
    expect(selectVillageNotices(context()).map((n) => n.id)).not.toContain("notice.deep_water");
    const expert = selectVillageNotices(
      context({ rankIndexBySkill: { fishing: 3 } })
    ).map((n) => n.id);
    expect(expert).toContain("notice.deep_water");
    const skilled = selectVillageNotices(
      context({ rankIndexBySkill: { fishing: 2 } })
    ).map((n) => n.id);
    expect(skilled).not.toContain("notice.deep_water");
  });

  it("pins newer earned notices above the standing board", () => {
    const notices = selectVillageNotices(context({ unlockedKnowledgeIds: ["knowledge.open_horizons"] }));
    expect(notices[0]?.id).toBe("notice.open_horizons");
  });

  it("returns DTOs without requirement fields", () => {
    const [first] = selectVillageNotices(context());
    expect(first).toBeDefined();
    expect(Object.keys(first!).sort()).toEqual(["body", "category", "id", "source", "title"]);
  });
});
