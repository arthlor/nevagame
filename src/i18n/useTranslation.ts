// src/i18n/useTranslation.ts

import { useEffect, useState, useCallback } from "react";
import { localeStore } from "./localeStore";
import {
  t as translate,
  getLocalizedItem,
  getLocalizedCrop,
  getLocalizedFish,
  getLocalizedEquipment,
  getLocalizedRod,
  getLocalizedBoat,
  getLocalizedRecipe,
  getLocalizedMarket,
  getLocalizedSkill,
  getLocalizedRank,
  getLocalizedShopkeepLine,
  getLocalizedStationTitle,
  getLocalizedCraftingState,
  getLocalizedNpc,
  getLocalizedQuestTrack,
  getLocalizedQuest,
  getLocalizedKnowledge,
  getLocalizedNotice,
  getLocalizedContract,
  getLocalizedHint,
  translateReason,
  getLocalizedMilestone
} from "./i18n";
import type { RecordMilestoneDto } from "../simulation/core/contracts";
import type { SupportedLocale, TranslationParams } from "./types";
import type {
  BoatDefinition,
  ContractTemplateDefinition,
  CropDefinition,
  EquipmentDefinition,
  FishSpeciesDefinition,
  ItemDefinition,
  MarketDefinition,
  RecipeDefinition,
  RodDefinition
} from "../content/types";
import type { NpcDefinition } from "../content/npcs";
import type { QuestDefinition, QuestTrackDefinition } from "../simulation/core/QuestTypes";
import type { KnowledgeEntryDefinition } from "../content/knowledge";
import type { VillageNoticeDefinition } from "../content/villageBulletin";
import type { SkillId } from "../simulation/core/types";

export interface TranslationHook {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (path: string, params?: TranslationParams) => string;
  getLocalizedItem: (itemOrId: ItemDefinition | string) => { name: string; description: string };
  getLocalizedCrop: (cropOrId: CropDefinition | string) => { name: string };
  getLocalizedFish: (fishOrId: FishSpeciesDefinition | string) => { name: string; description?: string };
  getLocalizedEquipment: (eqOrId: EquipmentDefinition | string) => { name: string; description: string };
  getLocalizedRod: (rodOrId: RodDefinition | string) => { name: string; description: string };
  getLocalizedBoat: (boatOrId: BoatDefinition | string) => { name: string; description: string };
  getLocalizedRecipe: (recipeOrId: RecipeDefinition | string) => { name: string; description?: string };
  getLocalizedMarket: (marketOrId: MarketDefinition | string) => { name: string; description: string };
  getLocalizedSkill: (skillId: SkillId) => { name: string; description?: string };
  getLocalizedRank: (rankIndex: number) => { title: string; summary?: string };
  getLocalizedShopkeepLine: (marketId: string | null, dayInSeason: number) => string;
  getLocalizedStationTitle: (stationType: string) => string;
  getLocalizedCraftingState: (state: string) => string;
  getLocalizedNpc: (npcOrId: NpcDefinition | string) => {
    name: string;
    title: string;
    district: string;
    idleDialogue: string[];
    beckonLines?: string[];
    recognitionDialogue?: Array<{ id: string; lines: string[] }>;
  };
  getLocalizedQuestTrack: (trackOrId: QuestTrackDefinition | string) => { title: string; description?: string };
  getLocalizedQuest: (questOrId: QuestDefinition | string) => {
    actTitle: string;
    questTitle: string;
    introDialogue: string[];
    completionDialogue: string[];
    heraldLines?: string[];
    objectives?: Record<string, { description?: string; dialogue?: string[] }>;
  };
  getLocalizedKnowledge: (knowledgeOrId: KnowledgeEntryDefinition | string) => { title: string; summary: string };
  getLocalizedNotice: (noticeOrId: VillageNoticeDefinition | string) => { source: string; title: string; body: string };
  getLocalizedContract: (contractOrId: ContractTemplateDefinition | string) => { title: string; requesterName: string; description: string };
  getLocalizedHint: (hintId: string, fallbackTitle: string, fallbackMessage: string) => { title: string; message: string };
  translateReason: (reason: string | null | undefined) => string;
  getLocalizedMilestone: (milestone: RecordMilestoneDto) => { title: string; detail: string };
}

export function useTranslation(): TranslationHook {
  const [locale, setLocaleState] = useState<SupportedLocale>(localeStore.current);

  useEffect(() => {
    return localeStore.subscribe((next) => {
      setLocaleState(next);
    });
  }, []);

  const setLocale = useCallback((nextLocale: SupportedLocale) => {
    localeStore.set(nextLocale);
  }, []);

  const t = useCallback(
    (path: string, params?: TranslationParams) => {
      return translate(path, params, locale);
    },
    [locale]
  );

  const localItem = useCallback(
    (itemOrId: ItemDefinition | string) => {
      return getLocalizedItem(itemOrId, locale);
    },
    [locale]
  );

  const localCrop = useCallback(
    (cropOrId: CropDefinition | string) => {
      return getLocalizedCrop(cropOrId, locale);
    },
    [locale]
  );

  const localFish = useCallback(
    (fishOrId: FishSpeciesDefinition | string) => {
      return getLocalizedFish(fishOrId, locale);
    },
    [locale]
  );

  const localEquipment = useCallback(
    (eqOrId: EquipmentDefinition | string) => {
      return getLocalizedEquipment(eqOrId, locale);
    },
    [locale]
  );

  const localRod = useCallback(
    (rodOrId: RodDefinition | string) => {
      return getLocalizedRod(rodOrId, locale);
    },
    [locale]
  );

  const localBoat = useCallback(
    (boatOrId: BoatDefinition | string) => {
      return getLocalizedBoat(boatOrId, locale);
    },
    [locale]
  );

  const localRecipe = useCallback(
    (recipeOrId: RecipeDefinition | string) => {
      return getLocalizedRecipe(recipeOrId, locale);
    },
    [locale]
  );

  const localMarket = useCallback(
    (marketOrId: MarketDefinition | string) => {
      return getLocalizedMarket(marketOrId, locale);
    },
    [locale]
  );

  const localSkill = useCallback(
    (skillId: SkillId) => {
      return getLocalizedSkill(skillId, locale);
    },
    [locale]
  );

  const localRank = useCallback(
    (rankIndex: number) => {
      return getLocalizedRank(rankIndex, locale);
    },
    [locale]
  );

  const localShopkeepLine = useCallback(
    (marketId: string | null, dayInSeason: number) => {
      return getLocalizedShopkeepLine(marketId, dayInSeason, locale);
    },
    [locale]
  );

  const localStationTitle = useCallback(
    (stationType: string) => {
      return getLocalizedStationTitle(stationType, locale);
    },
    [locale]
  );

  const localCraftingState = useCallback(
    (state: string) => {
      return getLocalizedCraftingState(state, locale);
    },
    [locale]
  );

  const localNpc = useCallback(
    (npcOrId: NpcDefinition | string) => {
      return getLocalizedNpc(npcOrId, locale);
    },
    [locale]
  );

  const localQuestTrack = useCallback(
    (trackOrId: QuestTrackDefinition | string) => {
      return getLocalizedQuestTrack(trackOrId, locale);
    },
    [locale]
  );

  const localQuest = useCallback(
    (questOrId: QuestDefinition | string) => {
      return getLocalizedQuest(questOrId, locale);
    },
    [locale]
  );

  const localKnowledge = useCallback(
    (knowledgeOrId: KnowledgeEntryDefinition | string) => {
      return getLocalizedKnowledge(knowledgeOrId, locale);
    },
    [locale]
  );

  const localNotice = useCallback(
    (noticeOrId: VillageNoticeDefinition | string) => {
      return getLocalizedNotice(noticeOrId, locale);
    },
    [locale]
  );

  const localContract = useCallback(
    (contractOrId: ContractTemplateDefinition | string) => {
      return getLocalizedContract(contractOrId, locale);
    },
    [locale]
  );

  const localHint = useCallback(
    (hintId: string, fallbackTitle: string, fallbackMessage: string) => {
      return getLocalizedHint(hintId, fallbackTitle, fallbackMessage, locale);
    },
    [locale]
  );

  const localReason = useCallback(
    (reason: string | null | undefined) => {
      return translateReason(reason, locale);
    },
    [locale]
  );

  const localMilestone = useCallback(
    (milestone: RecordMilestoneDto) => {
      return getLocalizedMilestone(milestone, locale);
    },
    [locale]
  );

  return {
    locale,
    setLocale,
    t,
    getLocalizedItem: localItem,
    getLocalizedCrop: localCrop,
    getLocalizedFish: localFish,
    getLocalizedEquipment: localEquipment,
    getLocalizedRod: localRod,
    getLocalizedBoat: localBoat,
    getLocalizedRecipe: localRecipe,
    getLocalizedMarket: localMarket,
    getLocalizedSkill: localSkill,
    getLocalizedRank: localRank,
    getLocalizedShopkeepLine: localShopkeepLine,
    getLocalizedStationTitle: localStationTitle,
    getLocalizedCraftingState: localCraftingState,
    getLocalizedNpc: localNpc,
    getLocalizedQuestTrack: localQuestTrack,
    getLocalizedQuest: localQuest,
    getLocalizedKnowledge: localKnowledge,
    getLocalizedNotice: localNotice,
    getLocalizedContract: localContract,
    getLocalizedHint: localHint,
    translateReason: localReason,
    getLocalizedMilestone: localMilestone
  };
}

