import { ContentRegistry } from "../../content/ContentRegistry";
import type { NpcDefinition } from "../../content/npcs";
import { getRankForXp } from "../../content/progression";
import type { GameState, ClockState } from "../core/types";

export const NPC_TALK_RADIUS = 3.5;

/** One clock-derived station for talking, quest guidance and visual beats. */
export function npcAnchorAt(npcId: string, clock: Pick<ClockState, "timeOfDay">): NpcDefinition["anchor"] {
  const npc = ContentRegistry.npcs.get(npcId);
  if (!npc) throw new Error(`Unknown NPC: '${npcId}'`);
  return npc.schedule?.find((slot) => slot.phase === clock.timeOfDay)?.position ?? npc.anchor;
}

/** Authored order resolves equally eligible milestones, shared with dialogue. */
export function npcRecognitionLines(npc: NpcDefinition, state: GameState): string[] {
  const matching = npc.recognitionDialogue?.filter((entry) =>
    (entry.requiresCompletedQuestIds ?? []).every((id) => state.quests.completedQuestIds.includes(id)) &&
    (entry.requiresFeatureIds ?? []).every((id) => state.quests.unlockedFeatureIds.includes(id)) &&
    (entry.requiresKnowledgeIds ?? []).every((id) => state.journal.unlockedKnowledge.includes(id)) &&
    (entry.requiresRankIndex === undefined ||
      getRankForXp(state.player.proficiencies[entry.requiresRankIndex.skill] ?? 0).rankIndex >= entry.requiresRankIndex.rankIndex)
  );
  return matching?.at(-1)?.lines ?? npc.idleDialogue;
}

export interface NpcBarkDto {
  npcId: string;
  name: string;
  x: number;
  z: number;
  lines: string[];
  distanceMeters: number;
}

export function buildNearbyNpcBarks(state: GameState): NpcBarkDto[] {
  return [...ContentRegistry.npcs.values()].flatMap((npc) => {
    const anchor = npcAnchorAt(npc.id, state.clock);
    const distanceMeters = Math.hypot(anchor.x - state.player.x, anchor.z - state.player.z);
    return distanceMeters <= 8 ? [{ npcId: npc.id, name: npc.name, x: anchor.x, z: anchor.z,
      lines: npcRecognitionLines(npc, state), distanceMeters }] : [];
  }).sort((a, b) => a.distanceMeters - b.distanceMeters);
}
