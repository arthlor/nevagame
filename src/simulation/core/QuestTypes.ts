// src/simulation/core/QuestTypes.ts

import type { SkillId } from "./types";

export type QuestId = string;
export type NpcId = string;
export type QuestTrackId = string;

export type QuestActId =
  | "act1_homestead"
  | "act2_processing"
  | "act3_river"
  | "act4_harbor"
  | "act5_expedition"
  | "act6_stewardship"
  | "act7_sunreach"
  | "act8_dry_season"
  | "epilogue_open"
  // Side tracks carry their own act label. `activeActId` follows the main
  // track only, so these are titles for the journal rather than story acts.
  | "track_tides"
  | "track_homestead"
  | "track_tradelanes";

export type QuestObjectiveType =
  | "talk-npc"
  | "plant-crop"
  | "water-crop"
  | "harvest-crop"
  | "craft-recipe"
  | "catch-basic-fish"
  | "chum-school"
  | "hook-sport-fish"
  | "land-sport-fish"
  | "stow-cargo"
  | "board-boat"
  | "dock-boat"
  | "sell-item"
  | "sell-fish"
  | "complete-contract"
  | "apply-fertilizer"
  | "install-irrigation"
  | "irrigate-farm"
  | "purchase-upgrade";

export type QuestLocationRequirement =
  | { kind: "farm"; id: string }
  | { kind: "station"; id: string }
  | { kind: "habitat"; id: string }
  | { kind: "ecology"; id: string }
  | { kind: "market"; id: string }
  | { kind: "boat"; id: string };

export interface QuestObjectiveDefinition {
  id: string;
  type: QuestObjectiveType;
  description: string;
  targetId?: string; // cropId, recipeId, itemId, speciesId, npcId, marketId
  targetQuantity: number;
  locationAnchor?: { x: number; z: number; name: string };
  location?: QuestLocationRequirement;
}

export interface QuestRewardDefinition {
  money?: number;
  items?: Array<{ itemId: string; quantity: number }>;
  skillXp?: Array<{ skill: SkillId; xp: number }>;
  unlocksFeatureIds?: string[];
  unlocksKnowledgeIds?: string[];
}

export interface QuestTurnInCost {
  money?: number;
  items?: Array<{ itemId: string; quantity: number }>;
}

export interface QuestDefinition {
  id: QuestId;
  /** The chain this quest belongs to. Chains never link across tracks. */
  trackId: QuestTrackId;
  actId: QuestActId;
  actTitle: string;
  questTitle: string;
  speakerId: NpcId;
  introDialogue: string[];
  completionDialogue: string[];
  objectives: QuestObjectiveDefinition[];
  turnInCost?: QuestTurnInCost;
  rewards: QuestRewardDefinition;
  nextQuestId?: QuestId;
}

/** One track's cursor. Every track advances independently. */
export interface QuestTrackProgress {
  activeQuestId: QuestId | null;
  activeStepIndex: number;
  stepProgress: Record<string, number>;
}

/**
 * Predicates that must all hold before a track's entry quest activates.
 * A track is not a branch: it is a separate linear chain that becomes
 * available when the player's state earns it.
 */
export interface QuestTrackUnlock {
  requiresCompletedQuestIds?: QuestId[];
  requiresFeatureIds?: string[];
  requiresKnowledgeIds?: string[];
  requiresRank?: { skill: SkillId; rankIndex: number };
}

export interface QuestTrackDefinition {
  id: QuestTrackId;
  title: string;
  entryQuestId: QuestId;
  /** Omitted for a track that is already running in a new game. */
  unlock?: QuestTrackUnlock;
}

export interface QuestState {
  /** The main track's act, which is what the journal and audio key off. */
  activeActId: QuestActId;
  tracks: Record<QuestTrackId, QuestTrackProgress>;
  /** Which track the HUD tracker shows. Always a track that exists. */
  focusedTrackId: QuestTrackId;
  completedQuestIds: QuestId[];
  unlockedFeatureIds: string[];
  hintsShown: Record<string, boolean>;
}

export const MAIN_QUEST_TRACK_ID: QuestTrackId = "track.main";

export function emptyQuestTrackProgress(): QuestTrackProgress {
  return { activeQuestId: null, activeStepIndex: 0, stepProgress: {} };
}

/** The track's cursor, created on demand so callers never handle undefined. */
export function questTrackProgress(quests: QuestState, trackId: QuestTrackId): QuestTrackProgress {
  quests.tracks[trackId] ??= emptyQuestTrackProgress();
  return quests.tracks[trackId];
}

export function mainQuestTrack(quests: QuestState): QuestTrackProgress {
  return questTrackProgress(quests, MAIN_QUEST_TRACK_ID);
}

/** The track the HUD tracker is showing — the thread the player is on. */
export function focusedQuestTrack(quests: QuestState): QuestTrackProgress {
  return questTrackProgress(quests, quests.focusedTrackId);
}

/** Whether `questId` is the quest currently running on any track. */
export function isQuestActive(quests: QuestState, questId: QuestId): boolean {
  return Object.values(quests.tracks).some((progress) => progress.activeQuestId === questId);
}

/** Track ids that currently have a quest in progress, in definition order. */
export function activeQuestTrackIds(quests: QuestState): QuestTrackId[] {
  return Object.keys(quests.tracks).filter((trackId) => quests.tracks[trackId]?.activeQuestId);
}

export interface ActiveQuestDto {
  questId: QuestId;
  trackId: QuestTrackId;
  trackTitle: string;
  actId: QuestActId;
  actTitle: string;
  questTitle: string;
  speakerId: NpcId;
  speakerName: string;
  currentStepIndex: number;
  totalSteps: number;
  objectiveDescription: string;
  currentProgress: number;
  targetQuantity: number;
  isStepComplete: boolean;
  isQuestReadyToTurnIn: boolean;
  turnInBlockerReason?: string;
  targetLocation?: { x: number; z: number; name: string };
  rewards?: QuestRewardDefinition;
}
