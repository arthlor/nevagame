// src/simulation/core/QuestTypes.ts

import type { SkillId } from "./types";

export type QuestId = string;
export type NpcId = string;

export type QuestActId =
  | "act1_homestead"
  | "act2_processing"
  | "act3_river"
  | "act4_harbor"
  | "act5_expedition"
  | "epilogue_open";

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
  | "purchase-upgrade";

export type QuestLocationRequirement =
  | { kind: "farm"; id: string }
  | { kind: "station"; id: string }
  | { kind: "habitat"; id: string }
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
  unlocksFeature?: string;
}

export interface QuestDefinition {
  id: QuestId;
  actId: QuestActId;
  actTitle: string;
  questTitle: string;
  speakerId: NpcId;
  introDialogue: string[];
  completionDialogue: string[];
  objectives: QuestObjectiveDefinition[];
  rewards: QuestRewardDefinition;
  nextQuestId?: QuestId;
}

export interface QuestState {
  activeActId: QuestActId;
  activeQuestId: QuestId | null;
  activeStepIndex: number;
  stepProgress: Record<string, number>;
  completedQuestIds: QuestId[];
  unlockedDialogueIds: string[];
  unlockedFeatureIds: string[];
  hintsShown: Record<string, boolean>;
}

export interface ActiveQuestDto {
  questId: QuestId;
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
  targetLocation?: { x: number; z: number; name: string };
  rewards?: QuestRewardDefinition;
}
