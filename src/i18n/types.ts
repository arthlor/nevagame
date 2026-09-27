// src/i18n/types.ts

import type { SkillId } from "../simulation/core/types";

export type SupportedLocale = "en" | "tr";

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ["en", "tr"] as const;

export const LOCALE_LABELS: Record<SupportedLocale, { native: string; english: string }> = {
  en: { native: "English", english: "English" },
  tr: { native: "Türkçe", english: "Turkish" }
};

export type TranslationParams = Record<string, string | number>;

export interface LocalizedItemText {
  name?: string;
  description?: string;
}

export interface LocalizedCropText {
  name?: string;
}

export interface LocalizedFishText {
  name?: string;
  description?: string;
  habitatDescription?: string;
}

export interface LocalizedEquipmentText {
  name?: string;
  description?: string;
}

export interface LocalizedRecipeText {
  name?: string;
  description?: string;
}

export interface LocalizedBoatText {
  name?: string;
  description?: string;
}

export interface LocalizedNpcText {
  name?: string;
  title?: string;
  district?: string;
  idleDialogue?: string[];
  beckonLines?: string[];
  recognitionDialogue?: Array<{ id: string; lines: string[] }>;
}

export interface LocalizedQuestTrackText {
  title?: string;
  description?: string;
}

export interface LocalizedQuestObjectiveText {
  description?: string;
  dialogue?: string[];
}

export interface LocalizedQuestText {
  actTitle?: string;
  questTitle?: string;
  introDialogue?: string[];
  completionDialogue?: string[];
  heraldLines?: string[];
  objectives?: Record<string, LocalizedQuestObjectiveText>;
  stages?: Record<
    number,
    {
      description?: string;
      dialogue?: string[];
      completionDialogue?: string[];
    }
  >;
}

export interface LocalizedKnowledgeText {
  title?: string;
  summary?: string;
  text?: string[];
}

export interface LocalizedDiscoveryText {
  name?: string;
  description?: string;
}

export interface LocalizedContractText {
  title?: string;
  requesterName?: string;
  description?: string;
}

export interface LocalizedNoticeText {
  source?: string;
  title?: string;
  body?: string;
}

export interface LocalizedMarketText {
  name?: string;
  description?: string;
}

export interface LocalizedSkillText {
  name?: string;
  description?: string;
}

export interface LocalizedRankText {
  title?: string;
  summary?: string;
}

export interface LocalizedProgressionText {
  skills: Partial<Record<SkillId, LocalizedSkillText>>;
  ranks: Record<number, LocalizedRankText>;
}

export interface LocalizedHintText {
  title?: string;
  message?: string;
}

