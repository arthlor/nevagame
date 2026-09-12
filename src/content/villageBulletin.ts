import { getRankForXp } from "./progression";
import type { GameState, SkillId } from "../simulation/core/types";

export type VillageNoticeCategory = "town" | "market" | "harbor" | "farm";

/**
 * Authored town notices. Each entry is community flavour posted by a named
 * neighbour; the optional requirements only decide *when* an entry is pinned to
 * the board, never grant or gate anything. Every condition is read from state
 * the player already earns, so the bulletin needs no save fields of its own.
 */
export interface VillageNoticeDefinition {
  id: string;
  category: VillageNoticeCategory;
  /** Who put it up, shown to keep the board a place people speak from. */
  source: string;
  title: string;
  body: string;
  /** Higher pins first, so the newest earned notice tops the board; ties keep authored order. */
  order: number;
  requiresCompletedQuestIds?: readonly string[];
  requiresFeatureIds?: readonly string[];
  requiresKnowledgeIds?: readonly string[];
  requiresRankIndex?: { skill: SkillId; rankIndex: number };
}

const NOTICES: readonly VillageNoticeDefinition[] = [
  {
    id: "notice.market_days",
    category: "market",
    source: "Barnaby, market steward",
    title: "Market days stand",
    body: "The square opens with the morning and trades while the light lasts. Bring the produce the demand board is asking for, and bring it dry.",
    order: 10
  },
  {
    id: "notice.lamp_oil",
    category: "town",
    source: "Innkeeper’s wife",
    title: "Lamp oil rota",
    body: "Nine lamps ring the square and someone must walk them at dusk. Leave your name at the inn if you can spare a hand for a night.",
    order: 11
  },
  {
    id: "notice.bridge_watch",
    category: "town",
    source: "Bridge warden",
    title: "Mind the crossing",
    body: "The old bridge takes the spring melt hard. Cross one at a time with a loaded cart, and report any fresh crack in the stone to the warden.",
    order: 12
  },
  {
    id: "notice.lost_cat",
    category: "town",
    source: "A child, in careful letters",
    title: "Lost: grey cat, answers to Pumice",
    body: "Last seen hunting along the harbor wall. She will come for mackerel, but she will not be caught. Reward: one honest drawing of her.",
    order: 13
  },
  {
    id: "notice.tide_tables",
    category: "harbor",
    source: "Silas",
    title: "Tide tables, this month",
    body: "Low water runs early and the reef shows its teeth an hour before you expect. Read the water before you commit the skiff.",
    order: 14
  },
  {
    id: "notice.mill_queue",
    category: "farm",
    source: "The miller",
    title: "Mill queue",
    body: "Grain is ground to order, first come first served. If you are calling a sport school, grind your chum the night before — the mill keeps daylight hours.",
    order: 20,
    requiresKnowledgeIds: ["knowledge.wheat_milling"]
  },
  {
    id: "notice.scraps_wanted",
    category: "harbor",
    source: "Maeve",
    title: "Clean scraps wanted",
    body: "Fish scraps at the harbor table are wanted, not wasted. What the market will not buy, the field will thank you for.",
    order: 21,
    requiresKnowledgeIds: ["knowledge.land_sea_cycle"]
  },
  {
    id: "notice.irrigation_zone",
    category: "farm",
    source: "The miller",
    title: "Field pump parts arrived",
    body: "The pump fittings are in. Once the well is rigged, the whole field can be watered from one place instead of one watering can at a time.",
    order: 22,
    requiresFeatureIds: ["feature.irrigation_zone"]
  },
  {
    id: "notice.compost_starter",
    category: "farm",
    source: "The miller",
    title: "Compost starter, by the bin",
    body: "Keep the heap fed and it will keep you in bait worms. A bin that is never turned is just a pile.",
    order: 23,
    requiresKnowledgeIds: ["knowledge.worm_composting"]
  },
  {
    id: "notice.expedition_indoor",
    category: "town",
    source: "Barnaby, market steward",
    title: "The board has moved indoors",
    body: "Long-range planning now hangs inside the guild hall, out of the salt wind. Bring a route in mind and a full hold in practice.",
    order: 24,
    requiresFeatureIds: ["feature.expedition_planner"]
  },
  {
    id: "notice.lighthouse_watch",
    category: "harbor",
    source: "The lighthouse keeper",
    title: "Keeper’s watch",
    body: "The light is walked every clear night. If you pass the cliffs and see it dark, that is worth more than any fish — tell the harbor.",
    order: 25,
    requiresKnowledgeIds: ["knowledge.discovery.coast"]
  },
  {
    id: "notice.sunreach_crossing",
    category: "harbor",
    source: "Silas",
    title: "Sunreach crossing times",
    body: "The channel between the islands turns mean in an afternoon. Cross with the morning and the ice, or do not cross.",
    order: 26,
    requiresKnowledgeIds: ["knowledge.discovery.reef"]
  },
  {
    id: "notice.deep_water",
    category: "harbor",
    source: "Silas",
    title: "Deep-water etiquette",
    body: "An angler who has taken a billfish knows the run is not a tug-of-war. Give line, keep tension, and let the fish decide the road home.",
    order: 27,
    requiresRankIndex: { skill: "fishing", rankIndex: 3 }
  },
  {
    id: "notice.open_horizons",
    category: "town",
    source: "Barnaby, market steward",
    title: "A charter, kept",
    body: "Nothing on this board was finished by one person. Sign it the way the ledger is signed: with the intention to come back.",
    order: 28,
    requiresKnowledgeIds: ["knowledge.open_horizons"]
  }
] as const;

export interface VillageNoticeDto {
  id: string;
  category: VillageNoticeCategory;
  source: string;
  title: string;
  body: string;
}

/** Everything the board reads, already resolved from state so selection is pure. */
export interface VillageNoticeContext {
  completedQuestIds: readonly string[];
  unlockedFeatureIds: readonly string[];
  unlockedKnowledgeIds: readonly string[];
  rankIndexBySkill: Partial<Record<SkillId, number>>;
}

export function villageNoticeContext(state: Readonly<GameState>): VillageNoticeContext {
  const rankIndexBySkill: Partial<Record<SkillId, number>> = {};
  for (const [skill, xp] of Object.entries(state.player.proficiencies)) {
    rankIndexBySkill[skill as SkillId] = getRankForXp(xp).rankIndex;
  }
  return {
    completedQuestIds: state.quests.completedQuestIds,
    unlockedFeatureIds: state.quests.unlockedFeatureIds,
    unlockedKnowledgeIds: state.journal.unlockedKnowledge,
    rankIndexBySkill
  };
}

function noticeVisible(notice: VillageNoticeDefinition, context: VillageNoticeContext): boolean {
  if (notice.requiresCompletedQuestIds &&
    !notice.requiresCompletedQuestIds.every((id) => context.completedQuestIds.includes(id))) return false;
  if (notice.requiresFeatureIds &&
    !notice.requiresFeatureIds.every((id) => context.unlockedFeatureIds.includes(id))) return false;
  if (notice.requiresKnowledgeIds &&
    !notice.requiresKnowledgeIds.every((id) => context.unlockedKnowledgeIds.includes(id))) return false;
  if (notice.requiresRankIndex) {
    const { skill, rankIndex } = notice.requiresRankIndex;
    if ((context.rankIndexBySkill[skill] ?? 0) < rankIndex) return false;
  }
  return true;
}

const VILLAGE_NOTICE_LIMIT = 12;

/** Authored order resolves the board; the newest earn pins above the standing notices. */
export function selectVillageNotices(context: VillageNoticeContext): VillageNoticeDto[] {
  return NOTICES
    .map((notice, authoredIndex) => ({ notice, authoredIndex }))
    .filter(({ notice }) => noticeVisible(notice, context))
    .sort((a, b) => b.notice.order - a.notice.order || a.authoredIndex - b.authoredIndex)
    .slice(0, VILLAGE_NOTICE_LIMIT)
    .map(({ notice }) => ({
      id: notice.id,
      category: notice.category,
      source: notice.source,
      title: notice.title,
      body: notice.body
    }));
}
