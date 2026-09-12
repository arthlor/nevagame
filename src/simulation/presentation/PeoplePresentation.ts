import { ContentRegistry } from "../../content/ContentRegistry";
import type { PeoplePageDto } from "../core/contracts";
import type { GameState } from "../core/types";
import { matchedNpcRecognition, npcAnchorAt } from "./NpcPresentation";

/**
 * The People folio. A directory of the named cast that reads only what the
 * save already knows: each person's authored title and district, where the
 * clock puts them now, whether the player has earned their recognition line,
 * and how many of their commissions are done. It stores nothing.
 */

/** Completed commissions where this person is the quest's speaker. */
function completedCommissionsFor(npcId: string, completedQuestIds: ReadonlySet<string>): number {
  let count = 0;
  for (const questId of completedQuestIds) {
    if (ContentRegistry.quests.get(questId)?.speakerId === npcId) count += 1;
  }
  return count;
}

/**
 * Standing is a plain-language reading of earned commissions and recognition,
 * not a new relationship stat. Tiers only drive list styling and ordering.
 */
export function standingFor(questsCompleted: number, recognized: boolean): { label: string; tier: number } {
  if (questsCompleted >= 6) return { label: "Close", tier: 3 };
  if (questsCompleted >= 3) return { label: "Trusted", tier: 2 };
  if (questsCompleted >= 1 || recognized) return { label: "Acquainted", tier: 1 };
  return { label: "New to the coast", tier: 0 };
}

export function buildPeoplePageDto(state: Readonly<GameState>): PeoplePageDto {
  const completed = new Set(state.quests.completedQuestIds);
  const people = [...ContentRegistry.npcs.values()].map((npc) => {
    const questsCompleted = completedCommissionsFor(npc.id, completed);
    const recognition = matchedNpcRecognition(npc, state);
    // Reuse the canonical station rule so a person awaiting a quest turn-in is
    // listed at their role anchor, matching dialogue and guide barks.
    const locationName = npcAnchorAt(npc.id, state.clock, state.quests).locationName;
    const standing = standingFor(questsCompleted, Boolean(recognition));
    return {
      id: npc.id,
      name: npc.name,
      title: npc.title,
      district: npc.district,
      locationName,
      portraitIcon: npc.portraitIcon,
      line: recognition?.lines[0] ?? npc.idleDialogue[0] ?? "",
      standingLabel: standing.label,
      standingTier: standing.tier,
      questsCompleted,
      recognized: Boolean(recognition)
    };
  }).sort((a, b) => b.questsCompleted - a.questsCompleted || a.name.localeCompare(b.name));

  return {
    people,
    recognizedCount: people.filter((person) => person.recognized).length,
    total: people.length
  };
}
