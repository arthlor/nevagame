import { ContentRegistry } from "../../content/ContentRegistry";
import type { NpcDefinition } from "../../content/npcs";
import { getRankForXp } from "../../content/progression";
import { activeQuestTrackIds, type QuestState } from "../core/QuestTypes";
import type { GameState, ClockState } from "../core/types";

export const NPC_TALK_RADIUS = 3.5;

/**
 * Whether this NPC speaks for an active quest whose final objective is done and
 * was worked away from them.
 *
 * A `talk-npc` objective completes inside the conversation, so its speaker stays
 * put. Work finished at a farm, station or boat sends the player back to the
 * speaker's role anchor rather than wherever their social schedule happens to
 * place them at that hour. Reads quest state only and never advances a cursor,
 * so the renderer can call it on every frame.
 */
function awaitingRoleTurnIn(npcId: string, quests: QuestState | undefined): boolean {
  if (!quests) return false;
  for (const trackId of activeQuestTrackIds(quests)) {
    const progress = quests.tracks[trackId];
    const questId = progress?.activeQuestId;
    if (!questId) continue;
    const quest = ContentRegistry.quests.get(questId);
    if (!quest || quest.speakerId !== npcId) continue;
    const finalIndex = quest.objectives.length - 1;
    const finalStep = quest.objectives[finalIndex];
    if (!finalStep || finalStep.type === "talk-npc") continue;
    if (Math.min(progress.activeStepIndex, finalIndex) !== finalIndex) continue;
    if ((progress.stepProgress[finalStep.id] ?? 0) < finalStep.targetQuantity) continue;
    return true;
  }
  return false;
}

/** One clock-derived station for talking, quest guidance and visual beats. */
export function npcAnchorAt(
  npcId: string,
  clock: Pick<ClockState, "timeOfDay">,
  quests?: QuestState
): NpcDefinition["anchor"] {
  const npc = ContentRegistry.npcs.get(npcId);
  if (!npc) throw new Error(`Unknown NPC: '${npcId}'`);
  if (awaitingRoleTurnIn(npcId, quests)) return npc.anchor;
  return npc.schedule?.find((slot) => slot.phase === clock.timeOfDay)?.position ?? npc.anchor;
}

/** The single earned recognition entry that currently speaks, if any. */
export function matchedNpcRecognition(
  npc: NpcDefinition,
  state: GameState
): NonNullable<NpcDefinition["recognitionDialogue"]>[number] | undefined {
  const matching = npc.recognitionDialogue?.filter((entry) =>
    (entry.requiresCompletedQuestIds ?? []).every((id) => state.quests.completedQuestIds.includes(id)) &&
    (entry.requiresFeatureIds ?? []).every((id) => state.quests.unlockedFeatureIds.includes(id)) &&
    (entry.requiresKnowledgeIds ?? []).every((id) => state.journal.unlockedKnowledge.includes(id)) &&
    (entry.requiresRankIndex === undefined ||
      getRankForXp(state.player.proficiencies[entry.requiresRankIndex.skill] ?? 0).rankIndex >= entry.requiresRankIndex.rankIndex)
  );
  return matching?.at(-1);
}

/** Authored order resolves equally eligible milestones, shared with dialogue. */
export function npcRecognitionLines(npc: NpcDefinition, state: GameState): string[] {
  return matchedNpcRecognition(npc, state)?.lines ?? npc.idleDialogue;
}

/**
 * Whether this person has something for the player right now: an errand of
 * theirs to close, or a talk step aimed at them. Both are short-lived — the
 * tracker is already pointing the player there. A herald is deliberately not
 * a reason: it can stand for hours (Silas through the whole skiff apprenticeship)
 * and a call repeated that long is nagging, not a welcome. Reads quest state
 * only, like `npcAnchorAt`.
 */
export function npcHasPendingConversation(npcId: string, quests: QuestState): boolean {
  for (const trackId of activeQuestTrackIds(quests)) {
    const progress = quests.tracks[trackId];
    const quest = progress?.activeQuestId ? ContentRegistry.quests.get(progress.activeQuestId) : undefined;
    if (!quest || !progress) continue;
    const index = Math.min(progress.activeStepIndex, quest.objectives.length - 1);
    const objective = quest.objectives[index];
    if (!objective) continue;
    const done = (progress.stepProgress[objective.id] ?? 0) >= objective.targetQuantity;
    if (quest.speakerId === npcId && index === quest.objectives.length - 1 && done) return true;
    if (!done && objective.type === "talk-npc" && objective.targetId === npcId) return true;
  }
  return false;
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
    const anchor = npcAnchorAt(npc.id, state.clock, state.quests);
    const distanceMeters = Math.hypot(anchor.x - state.player.x, anchor.z - state.player.z);
    if (distanceMeters > 8) return [];
    // Someone waiting on the player calls them over rather than remarking on
    // the soil while their errand sits unclaimed.
    const beckon = npc.beckonLines?.length && npcHasPendingConversation(npc.id, state.quests);
    const lines = beckon ? npc.beckonLines! : npcRecognitionLines(npc, state);
    return [{ npcId: npc.id, name: npc.name, x: anchor.x, z: anchor.z, lines, distanceMeters }];
  }).sort((a, b) => a.distanceMeters - b.distanceMeters);
}
