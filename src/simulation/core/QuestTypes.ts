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
  | "act9_charter"
  | "act10_open_horizons"
  | "epilogue_open"
  // Side tracks carry their own act label. `activeActId` follows the main
  // track only, so these are titles for the journal rather than story acts.
  | "track_tides"
  | "track_homestead"
  | "track_tradelanes";

/**
 * Runtime list so content validation and the save validator read one source
 * rather than each keeping a hand-maintained copy of the union.
 */
export const QUEST_OBJECTIVE_TYPES = [
  "talk-npc",
  "plant-crop",
  "water-crop",
  "harvest-crop",
  "craft-recipe",
  "catch-basic-fish",
  "chum-school",
  "hook-sport-fish",
  "land-sport-fish",
  "stow-cargo",
  "board-boat",
  "dock-boat",
  "sell-item",
  "sell-fish",
  "complete-contract",
  "apply-fertilizer",
  "install-irrigation",
  "irrigate-farm",
  "purchase-upgrade"
] as const;

export type QuestObjectiveType = (typeof QUEST_OBJECTIVE_TYPES)[number];

export const QUEST_LOCATION_KINDS = [
  "farm",
  "station",
  "habitat",
  "ecology",
  "market",
  "boat"
] as const;

export type QuestLocationKind = (typeof QUEST_LOCATION_KINDS)[number];

export interface QuestLocationRequirement {
  kind: QuestLocationKind;
  id: string;
}

export interface QuestObjectiveDefinition {
  id: string;
  type: QuestObjectiveType;
  description: string;
  targetId?: string; // cropId, recipeId, itemId, speciesId, npcId, marketId
  targetQuantity: number;
  locationAnchor?: { x: number; z: number; name: string };
  location?: QuestLocationRequirement;
  /**
   * Opt-in, tutorial only. An action matching this objective's exact gates
   * performed *before* the step activates is banked once and applied when it
   * does, so a player who works ahead is never asked to repeat themselves.
   * `ContentRegistry` rejects this on objectives that cannot bank safely.
   */
  creditsEarlyActions?: boolean;
  /**
   * What the person says when a `talk-npc` objective aimed at someone other
   * than the quest's speaker is fulfilled — a farewell in a round of visits, a
   * message passed on. The speaker's own words are the quest's intro and
   * completion, so the registry rejects this anywhere else.
   */
  dialogue?: string[];
}

/**
 * Who first tells the player about an errand whose speaker they cannot reach
 * yet, and what they say. Act 7's speaker lives across a channel the player
 * has no boat for; without a herald nobody could explain the crossing until
 * after it was made.
 */
export interface QuestHeraldDefinition {
  npcId: NpcId;
  lines: string[];
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
  /** Optional setup from someone else while the speaker is out of reach. */
  herald?: QuestHeraldDefinition;
  objectives: QuestObjectiveDefinition[];
  turnInCost?: QuestTurnInCost;
  rewards: QuestRewardDefinition;
  nextQuestId?: QuestId;
}

/**
 * One part of a conversation. A single talk can close an errand, pass on the
 * next one and deliver a message; each part says which thread it belongs to so
 * presentation can mark it, and completion parts carry what changed hands.
 * Transient: produced by the talk command, never saved.
 */
export type ConversationSegmentKind = "completion" | "intro" | "herald" | "objective" | "recognition";

export interface ConversationSegment {
  kind: ConversationSegmentKind;
  lines: string[];
  questId?: QuestId;
  trackId?: QuestTrackId;
  questTitle?: string;
  trackTitle?: string;
  /** This conversation began the errand. */
  startsQuest?: boolean;
  /** Granted by a completion part. */
  rewards?: QuestRewardDefinition;
  /** Handed over to settle a completion part. */
  paid?: QuestTurnInCost;
  /** A plain-language blocker shown under the words (cost not met, no room). */
  note?: string;
}

export interface ConversationResult {
  success: boolean;
  reason?: string;
  segments: ConversationSegment[];
  /** Every line in order, for callers that only read text. */
  dialogue: string[];
  isCompletion: boolean;
  questCompleted: boolean;
  rewardsGiven: boolean;
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
  /** Banked pre-step actions, one record per distinct action shape. */
  earlyActionCredits: QuestEarlyActionCredit[];
}

/**
 * One banked action, stored as the *shape* of what the player did rather than
 * as an objective id. The shape is re-matched against an objective's declared
 * gates at activation, so retargeting an objective later can never redeem a
 * credit that was earned against the old target.
 */
export interface QuestEarlyActionCredit {
  type: QuestObjectiveType;
  /** Absent when the action carried no target (e.g. watering any crop). */
  targetId?: string;
  /** Absent when the action carried no location. */
  location?: QuestLocationRequirement;
  quantity: number;
}

/**
 * Frozen bounds shared by the runtime and `validateSaveEnvelope`. They are
 * literals rather than content-derived so a later content edit cannot
 * retroactively invalidate a stored save.
 */
export const MAX_EARLY_ACTION_CREDIT_RECORDS = 16;
export const MAX_EARLY_ACTION_CREDIT_QUANTITY = 64;

export const MAIN_QUEST_TRACK_ID: QuestTrackId = "track.main";

export function emptyQuestTrackProgress(): QuestTrackProgress {
  return { activeQuestId: null, activeStepIndex: 0, stepProgress: {} };
}

/** The track's cursor, created on demand so callers never handle undefined. */
export function questTrackProgress(quests: QuestState, trackId: QuestTrackId): QuestTrackProgress {
  quests.tracks[trackId] ??= emptyQuestTrackProgress();
  return quests.tracks[trackId];
}

/** The ledger, created on demand so callers never handle undefined. */
export function questEarlyActionCredits(quests: QuestState): QuestEarlyActionCredit[] {
  quests.earlyActionCredits ??= [];
  return quests.earlyActionCredits;
}

/** Whether two credits describe the same action, ignoring quantity. */
export function sameEarlyActionShape(a: QuestEarlyActionCredit, b: QuestEarlyActionCredit): boolean {
  return (
    a.type === b.type &&
    (a.targetId ?? null) === (b.targetId ?? null) &&
    (a.location?.kind ?? null) === (b.location?.kind ?? null) &&
    (a.location?.id ?? null) === (b.location?.id ?? null)
  );
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
  return Object.values(quests.tracks ?? {}).some((progress) => progress.activeQuestId === questId);
}

/** Track ids that currently have a quest in progress, in definition order. */
export function activeQuestTrackIds(quests: QuestState): QuestTrackId[] {
  const tracks = quests.tracks ?? {};
  return Object.keys(tracks).filter((trackId) => tracks[trackId]?.activeQuestId);
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
  /** The live objective's shape, so presentation never re-derives it from content. */
  objectiveType: QuestObjectiveType;
  objectiveTargetId?: string;
  currentProgress: number;
  targetQuantity: number;
  isStepComplete: boolean;
  isQuestReadyToTurnIn: boolean;
  turnInBlockerReason?: string;
  targetLocation?: { x: number; z: number; name: string };
  /** Metres from the player to `targetLocation`, absent when there is no target. */
  targetDistanceMeters?: number;
  rewards?: QuestRewardDefinition;
  /**
   * What an acquisition step is waiting on, measured against the player — the
   * skiff's Fishing XP and price, a rod's rank and price — so a gate reads as a
   * path rather than a refusal at the counter.
   */
  requirements?: QuestRequirementDto[];
  /** The ask as it was put to the player, so the journal can show it again. */
  brief?: { speakerName: string; lines: string[] };
}

export interface QuestRequirementDto {
  /** `amount` reads as current / required; `check` is simply held or not. */
  kind: "amount" | "check";
  label: string;
  current: number;
  required: number;
  met: boolean;
}
