// src/i18n/i18n.ts

import { localeStore } from "./localeStore";
import type {
  SupportedLocale,
  TranslationParams
} from "./types";
import { EN_UI } from "./locales/en/ui";
import { TR_UI } from "./locales/tr/ui";
import { EN_MESSAGES } from "./locales/en/messages";
import { TR_MESSAGES } from "./locales/tr/messages";
import { TR_ITEMS } from "./locales/tr/items";
import { TR_CROPS } from "./locales/tr/crops";
import { TR_FISH } from "./locales/tr/fish";
import { TR_EQUIPMENT } from "./locales/tr/equipment";
import { TR_RODS } from "./locales/tr/rods";
import { TR_BOATS } from "./locales/tr/boats";
import { TR_RECIPES } from "./locales/tr/recipes";
import { TR_MARKETS, TR_HARBOR_SHOPKEEP_LINES, TR_VILLAGE_SHOPKEEP_LINES } from "./locales/tr/markets";
import { TR_PROGRESSION } from "./locales/tr/progression";
import { TR_NPCS } from "./locales/tr/npcs";
import { TR_QUEST_TRACKS } from "./locales/tr/questTracks";
import { TR_QUESTS } from "./locales/tr/quests";
import { TR_KNOWLEDGE } from "./locales/tr/knowledge";
import { TR_NOTICES } from "./locales/tr/notices";
import { TR_CONTRACTS } from "./locales/tr/contracts";
import { EN_HINTS } from "./locales/en/hints";
import { TR_HINTS } from "./locales/tr/hints";
import { translateReason } from "./reasonsTr";
import { getLocalizedMilestone } from "./milestonesTr";
import { ContentRegistry } from "../content/ContentRegistry";
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
import { NOTICES, type VillageNoticeDefinition } from "../content/villageBulletin";
import { CONTRACT_TEMPLATES } from "../content/contracts";
import type { SkillId } from "../simulation/core/types";

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return key in params ? String(params[key]) : match;
  });
}

function resolveNestedKey(obj: unknown, path: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof current === "string" ? current : undefined;
}

/**
 * Resolves a UI or message translation string by dot-notation key (e.g. "hud.workCapacity").
 * Supports runtime variable interpolation (e.g. t("hud.dayTime", { day: 3, phase: "Sabah" })).
 */
export function t(path: string, params?: TranslationParams, locale?: SupportedLocale): string {
  const currentLocale = locale ?? localeStore.current;

  let rawString: string | undefined;

  if (currentLocale === "tr") {
    rawString = resolveNestedKey(TR_UI, path) ?? resolveNestedKey(TR_MESSAGES, path);
  }

  // Fallback to English
  if (!rawString) {
    rawString = resolveNestedKey(EN_UI, path) ?? resolveNestedKey(EN_MESSAGES, path);
  }

  // Final fallback is the path itself
  if (!rawString) {
    return path;
  }

  return interpolate(rawString, params);
}

/**
 * Returns localized name and description for an ItemDefinition or item ID.
 */
export function getLocalizedItem(
  itemOrId: ItemDefinition | string,
  locale?: SupportedLocale
): { name: string; description: string } {
  const currentLocale = locale ?? localeStore.current;
  const id = typeof itemOrId === "string" ? itemOrId : itemOrId.id;
  const baseItem = typeof itemOrId === "string" ? ContentRegistry.items.get(id) : itemOrId;

  const defaultName = baseItem?.name ?? id;
  const defaultDesc = baseItem?.description ?? "";

  if (currentLocale === "tr" && TR_ITEMS[id]) {
    const tr = TR_ITEMS[id];
    return {
      name: tr.name ?? defaultName,
      description: tr.description ?? defaultDesc
    };
  }

  return { name: defaultName, description: defaultDesc };
}

/**
 * Returns localized name for a CropDefinition or crop ID.
 */
export function getLocalizedCrop(
  cropOrId: CropDefinition | string,
  locale?: SupportedLocale
): { name: string } {
  const currentLocale = locale ?? localeStore.current;
  const id = typeof cropOrId === "string" ? cropOrId : cropOrId.id;
  const baseCrop = typeof cropOrId === "string" ? ContentRegistry.crops.get(id) : cropOrId;

  const defaultName = baseCrop?.name ?? id;

  if (currentLocale === "tr" && TR_CROPS[id]?.name) {
    return { name: TR_CROPS[id].name! };
  }

  return { name: defaultName };
}

/**
 * Returns localized name and description for a FishSpeciesDefinition or fish ID.
 */
export function getLocalizedFish(
  fishOrId: FishSpeciesDefinition | string,
  locale?: SupportedLocale
): { name: string; description?: string } {
  const currentLocale = locale ?? localeStore.current;
  const id = typeof fishOrId === "string" ? fishOrId : fishOrId.id;
  const baseFish = typeof fishOrId === "string" ? ContentRegistry.fishSpecies.get(id) : fishOrId;

  const defaultName = baseFish?.name ?? id;

  if (currentLocale === "tr" && TR_FISH[id]) {
    const tr = TR_FISH[id];
    return {
      name: tr.name ?? defaultName,
      description: tr.description
    };
  }

  return { name: defaultName };
}

/**
 * Returns localized name and description for an EquipmentDefinition or equipment ID.
 */
export function getLocalizedEquipment(
  eqOrId: EquipmentDefinition | string,
  locale?: SupportedLocale
): { name: string; description: string } {
  const currentLocale = locale ?? localeStore.current;
  const id = typeof eqOrId === "string" ? eqOrId : eqOrId.id;
  const baseEq = typeof eqOrId === "string" ? ContentRegistry.equipment.get(id) : eqOrId;

  const defaultName = baseEq?.name ?? id;
  const defaultDesc = baseEq?.description ?? "";

  if (currentLocale === "tr" && TR_EQUIPMENT[id]) {
    const tr = TR_EQUIPMENT[id];
    return {
      name: tr.name ?? defaultName,
      description: tr.description ?? defaultDesc
    };
  }

  return { name: defaultName, description: defaultDesc };
}

/**
 * Returns localized name and description for a RodDefinition or rod ID.
 */
export function getLocalizedRod(
  rodOrId: RodDefinition | string,
  locale?: SupportedLocale
): { name: string; description: string } {
  const currentLocale = locale ?? localeStore.current;
  const id = typeof rodOrId === "string" ? rodOrId : rodOrId.id;
  const baseRod = typeof rodOrId === "string" ? ContentRegistry.rods.get(id) : rodOrId;

  const defaultName = baseRod?.name ?? id;
  const defaultDesc = "A physical fishing rod carried from the wardrobe into the world.";

  if (currentLocale === "tr" && TR_RODS[id]) {
    const tr = TR_RODS[id];
    return {
      name: tr.name ?? defaultName,
      description: tr.description ?? defaultDesc
    };
  }

  return { name: defaultName, description: defaultDesc };
}

/**
 * Returns localized name and description for a BoatDefinition or boat ID.
 */
export function getLocalizedBoat(
  boatOrId: BoatDefinition | string,
  locale?: SupportedLocale
): { name: string; description: string } {
  const currentLocale = locale ?? localeStore.current;
  const id = typeof boatOrId === "string" ? boatOrId : boatOrId.id;
  const baseBoat = typeof boatOrId === "string" ? ContentRegistry.boats.get(id) : boatOrId;

  const defaultName = baseBoat?.name ?? id;
  const defaultDesc = baseBoat?.description ?? "";

  if (currentLocale === "tr" && TR_BOATS[id]) {
    const tr = TR_BOATS[id];
    return {
      name: tr.name ?? defaultName,
      description: tr.description ?? defaultDesc
    };
  }

  return { name: defaultName, description: defaultDesc };
}

/**
 * Returns localized name and description for a RecipeDefinition or recipe ID.
 */
export function getLocalizedRecipe(
  recipeOrId: RecipeDefinition | string,
  locale?: SupportedLocale
): { name: string; description?: string } {
  const currentLocale = locale ?? localeStore.current;
  const id = typeof recipeOrId === "string" ? recipeOrId : recipeOrId.id;
  const baseRecipe = typeof recipeOrId === "string" ? ContentRegistry.recipes.get(id) : recipeOrId;

  const defaultName = baseRecipe?.name ?? id;

  if (currentLocale === "tr" && TR_RECIPES[id]) {
    const tr = TR_RECIPES[id];
    return {
      name: tr.name ?? defaultName,
      description: tr.description
    };
  }

  return { name: defaultName };
}

/**
 * Returns localized name and description for a MarketDefinition or market ID.
 */
export function getLocalizedMarket(
  marketOrId: MarketDefinition | string,
  locale?: SupportedLocale
): { name: string; description: string } {
  const currentLocale = locale ?? localeStore.current;
  const id = typeof marketOrId === "string" ? marketOrId : marketOrId.id;
  const baseMarket = typeof marketOrId === "string" ? ContentRegistry.markets.get(id) : marketOrId;

  const defaultName = baseMarket?.name ?? id;
  const defaultDesc = baseMarket?.description ?? "";

  if (currentLocale === "tr" && TR_MARKETS[id]) {
    const tr = TR_MARKETS[id];
    return {
      name: tr.name ?? defaultName,
      description: tr.description ?? defaultDesc
    };
  }

  return { name: defaultName, description: defaultDesc };
}

/**
 * Returns localized name and description for a SkillId.
 */
export function getLocalizedSkill(
  skillId: SkillId,
  locale?: SupportedLocale
): { name: string; description?: string } {
  const currentLocale = locale ?? localeStore.current;
  const defaultName = skillId.charAt(0).toUpperCase() + skillId.slice(1);

  if (currentLocale === "tr" && TR_PROGRESSION.skills[skillId]) {
    const tr = TR_PROGRESSION.skills[skillId]!;
    return {
      name: tr.name ?? defaultName,
      description: tr.description
    };
  }

  return { name: defaultName };
}

/**
 * Returns localized title and summary for a proficiency rank by index (0-7).
 */
export function getLocalizedRank(
  rankIndex: number,
  locale?: SupportedLocale
): { title: string; summary?: string } {
  const currentLocale = locale ?? localeStore.current;
  const baseRank = ContentRegistry.ranks[rankIndex];
  const defaultTitle = baseRank?.rankName ?? `Rank ${rankIndex}`;

  if (currentLocale === "tr" && TR_PROGRESSION.ranks[rankIndex]) {
    const tr = TR_PROGRESSION.ranks[rankIndex];
    return {
      title: tr.title ?? defaultTitle,
      summary: tr.summary
    };
  }

  return { title: defaultTitle };
}

const EN_HARBOR_SHOPKEEP_LINES = [
  "The wharfinger eyes your hold. Fair weight, fair gold.",
  "Tide's kind today. Bring what you've caught.",
  "Salt air and honest scales — that's the harbor way.",
  "Good haul? Let's see what the market says.",
  "Another day on the docks. Show me your catch."
];

const EN_VILLAGE_SHOPKEEP_LINES = [
  "The grocer wipes the counter. Fresh from the yards, then?",
  "Morning light, morning trade. What have you brought?",
  "Soil on your boots — must be harvest day.",
  "The shelf won't stock itself. Let's see your yield.",
  "A farmer's work shows in the basket. Show me yours."
];

const hashGameDay = (day: number): number => {
  let h = (day | 0) ^ 0x9e3779b9;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

/**
 * Deterministically picks a localized shopkeep line for the given market and day.
 */
export function getLocalizedShopkeepLine(
  marketId: string | null,
  dayInSeason: number,
  locale?: SupportedLocale
): string {
  const currentLocale = locale ?? localeStore.current;
  const isHarbor = marketId === "market.harbor";

  if (currentLocale === "tr") {
    const pool = isHarbor ? TR_HARBOR_SHOPKEEP_LINES : TR_VILLAGE_SHOPKEEP_LINES;
    return pool[hashGameDay(dayInSeason) % pool.length];
  }

  const pool = isHarbor ? EN_HARBOR_SHOPKEEP_LINES : EN_VILLAGE_SHOPKEEP_LINES;
  return pool[hashGameDay(dayInSeason) % pool.length];
}

/**
 * Returns localized station name for a crafting station type.
 */
export function getLocalizedStationTitle(stationType: string, locale?: SupportedLocale): string {
  const currentLocale = locale ?? localeStore.current;
  if (currentLocale === "tr") {
    const titles: Record<string, string> = {
      "hand-mill": "El Değirmeni",
      workbench: "Çalışma Tezgâhı",
      "fish-table": "Balık Masası",
      "compost-bin": "Kompost Sandığı",
      "trading-station": "Ticaret Tezgâhı",
      kitchen: "Köy Mutfağı"
    };
    return titles[stationType] ?? "Zanaat İstasyonu";
  }

  const titles: Record<string, string> = {
    "hand-mill": "Hand Mill",
    workbench: "Workbench",
    "fish-table": "Fish Table",
    "compost-bin": "Compost Bin",
    "trading-station": "Packing Yard",
    kitchen: "Kitchen"
  };
  return titles[stationType] ?? "Crafting Station";
}

/**
 * Returns localized label for crafting recipe state.
 */
export function getLocalizedCraftingState(state: string, locale?: SupportedLocale): string {
  const currentLocale = locale ?? localeStore.current;
  if (currentLocale === "tr") {
    const labels: Record<string, string> = {
      "quest-target": "Görev",
      craftable: "Hazır",
      blocked: "Eksik",
      locked: "Kilitli"
    };
    return labels[state] ?? state;
  }

  const labels: Record<string, string> = {
    "quest-target": "Quest",
    craftable: "Ready",
    blocked: "Blocked",
    locked: "Locked"
  };
  return labels[state] ?? state;
}

/**
 * Returns localized name, title, district, and dialogues for an NpcDefinition or NPC ID.
 */
export function getLocalizedNpc(
  npcOrId: NpcDefinition | string,
  locale?: SupportedLocale
): {
  name: string;
  title: string;
  district: string;
  idleDialogue: string[];
  beckonLines?: string[];
  recognitionDialogue?: Array<{ id: string; lines: string[] }>;
} {
  const currentLocale = locale ?? localeStore.current;
  const id = typeof npcOrId === "string" ? npcOrId : npcOrId.id;
  const baseNpc = typeof npcOrId === "string" ? ContentRegistry.npcs.get(id) : npcOrId;

  const defaultName = baseNpc?.name ?? id;
  const defaultTitle = baseNpc?.title ?? "";
  const defaultDistrict = baseNpc?.district ?? "";
  const defaultIdle = baseNpc?.idleDialogue ?? [];
  const defaultBeckon = baseNpc?.beckonLines;
  const defaultRec = baseNpc?.recognitionDialogue;

  if (currentLocale === "tr" && TR_NPCS[id]) {
    const tr = TR_NPCS[id];
    return {
      name: tr.name ?? defaultName,
      title: tr.title ?? defaultTitle,
      district: tr.district ?? defaultDistrict,
      idleDialogue: tr.idleDialogue ?? defaultIdle,
      beckonLines: tr.beckonLines ?? defaultBeckon,
      recognitionDialogue: tr.recognitionDialogue ?? defaultRec
    };
  }

  return {
    name: defaultName,
    title: defaultTitle,
    district: defaultDistrict,
    idleDialogue: defaultIdle,
    beckonLines: defaultBeckon,
    recognitionDialogue: defaultRec
  };
}

/**
 * Returns localized title and description for a QuestTrackDefinition or quest track ID.
 */
export function getLocalizedQuestTrack(
  trackOrId: QuestTrackDefinition | string,
  locale?: SupportedLocale
): { title: string; description?: string } {
  const currentLocale = locale ?? localeStore.current;
  const id = typeof trackOrId === "string" ? trackOrId : trackOrId.id;
  const baseTrack = typeof trackOrId === "string" ? ContentRegistry.questTracks.get(id) : trackOrId;

  const defaultTitle = baseTrack?.title ?? id;

  if (currentLocale === "tr" && TR_QUEST_TRACKS[id]) {
    const tr = TR_QUEST_TRACKS[id];
    return {
      title: tr.title ?? defaultTitle,
      description: tr.description
    };
  }

  return { title: defaultTitle };
}

/**
 * Returns localized titles, dialogues, and objective descriptions for a QuestDefinition or quest ID.
 */
export function getLocalizedQuest(
  questOrId: QuestDefinition | string,
  locale?: SupportedLocale
): {
  actTitle: string;
  questTitle: string;
  introDialogue: string[];
  completionDialogue: string[];
  heraldLines?: string[];
  objectives?: Record<string, { description?: string; dialogue?: string[] }>;
} {
  const currentLocale = locale ?? localeStore.current;
  const id = typeof questOrId === "string" ? questOrId : questOrId.id;
  const baseQuest = typeof questOrId === "string" ? ContentRegistry.quests.get(id) : questOrId;

  const defaultAct = baseQuest?.actTitle ?? "";
  const defaultTitle = baseQuest?.questTitle ?? id;
  const defaultIntro = baseQuest?.introDialogue ?? [];
  const defaultComp = baseQuest?.completionDialogue ?? [];
  const defaultHerald = baseQuest?.herald?.lines;

  if (currentLocale === "tr" && TR_QUESTS[id]) {
    const tr = TR_QUESTS[id];
    return {
      actTitle: tr.actTitle ?? defaultAct,
      questTitle: tr.questTitle ?? defaultTitle,
      introDialogue: tr.introDialogue ?? defaultIntro,
      completionDialogue: tr.completionDialogue ?? defaultComp,
      heraldLines: tr.heraldLines ?? defaultHerald,
      objectives: tr.objectives as Record<string, { description?: string; dialogue?: string[] }> | undefined
    };
  }

  return {
    actTitle: defaultAct,
    questTitle: defaultTitle,
    introDialogue: defaultIntro,
    completionDialogue: defaultComp,
    heraldLines: defaultHerald
  };
}

/**
 * Returns localized title and summary for a KnowledgeEntryDefinition or knowledge ID.
 */
export function getLocalizedKnowledge(
  knowledgeOrId: KnowledgeEntryDefinition | string,
  locale?: SupportedLocale
): { title: string; summary: string } {
  const currentLocale = locale ?? localeStore.current;
  const id = typeof knowledgeOrId === "string" ? knowledgeOrId : knowledgeOrId.id;
  const baseKnowledge = typeof knowledgeOrId === "string" ? ContentRegistry.knowledge.get(id) : knowledgeOrId;

  const defaultTitle = baseKnowledge?.title ?? id;
  const defaultSummary = baseKnowledge?.summary ?? "";

  if (currentLocale === "tr" && TR_KNOWLEDGE[id]) {
    const tr = TR_KNOWLEDGE[id];
    return {
      title: tr.title ?? defaultTitle,
      summary: tr.summary ?? defaultSummary
    };
  }

  return { title: defaultTitle, summary: defaultSummary };
}

/**
 * Returns localized source, title, and body for a VillageNoticeDefinition or notice ID.
 */
export function getLocalizedNotice(
  noticeOrId: VillageNoticeDefinition | string,
  locale?: SupportedLocale
): { source: string; title: string; body: string } {
  const currentLocale = locale ?? localeStore.current;
  const id = typeof noticeOrId === "string" ? noticeOrId : noticeOrId.id;
  const baseNotice = typeof noticeOrId === "string" ? NOTICES.find((n: VillageNoticeDefinition) => n.id === id) : noticeOrId;

  const defaultSource = baseNotice?.source ?? "";
  const defaultTitle = baseNotice?.title ?? id;
  const defaultBody = baseNotice?.body ?? "";

  if (currentLocale === "tr" && TR_NOTICES[id]) {
    const tr = TR_NOTICES[id];
    return {
      source: tr.source ?? defaultSource,
      title: tr.title ?? defaultTitle,
      body: tr.body ?? defaultBody
    };
  }

  return { source: defaultSource, title: defaultTitle, body: defaultBody };
}

/**
 * Returns localized title, requester name, and description for a ContractTemplateDefinition or contract ID.
 */
export function getLocalizedContract(
  contractOrId: ContractTemplateDefinition | string,
  locale?: SupportedLocale
): { title: string; requesterName: string; description: string } {
  const currentLocale = locale ?? localeStore.current;
  const id = typeof contractOrId === "string" ? contractOrId : contractOrId.id;
  const baseContract = typeof contractOrId === "string" ? CONTRACT_TEMPLATES.find((c: ContractTemplateDefinition) => c.id === id) : contractOrId;

  const defaultTitle = id;
  const defaultRequester = baseContract?.requesterName ?? "";
  const defaultDesc = "";

  if (currentLocale === "tr" && TR_CONTRACTS[id]) {
    const tr = TR_CONTRACTS[id];
    return {
      title: tr.title ?? defaultTitle,
      requesterName: tr.requesterName ?? defaultRequester,
      description: tr.description ?? defaultDesc
    };
  }

  return { title: defaultTitle, requesterName: defaultRequester, description: defaultDesc };
}

/**
 * Returns localized title and message for a contextual tutorial hint.
 */
export function getLocalizedHint(
  hintId: string,
  fallbackTitle: string,
  fallbackMessage: string,
  locale?: SupportedLocale
): { title: string; message: string } {
  const currentLocale = locale ?? localeStore.current;
  if (currentLocale === "tr" && TR_HINTS[hintId]) {
    return {
      title: TR_HINTS[hintId].title ?? fallbackTitle,
      message: TR_HINTS[hintId].message ?? fallbackMessage
    };
  }
  if (EN_HINTS[hintId]) {
    return {
      title: EN_HINTS[hintId].title ?? fallbackTitle,
      message: EN_HINTS[hintId].message ?? fallbackMessage
    };
  }
  return { title: fallbackTitle, message: fallbackMessage };
}

export { translateReason, getLocalizedMilestone };

