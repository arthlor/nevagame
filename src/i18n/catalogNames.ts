// src/i18n/catalogNames.ts
//
// Replaces English content names inside a display sentence. Simulation keeps
// the English names; this only rewrites text that is about to be shown.

import { ContentRegistry } from "../content/ContentRegistry";
import { CONTRACT_TEMPLATES } from "../content/contracts";
import { TR_BOATS } from "./locales/tr/boats";
import { TR_CONTRACTS } from "./locales/tr/contracts";
import { TR_FISH } from "./locales/tr/fish";
import { TR_ITEMS } from "./locales/tr/items";
import { TR_MARKETS } from "./locales/tr/markets";
import { TR_NPCS } from "./locales/tr/npcs";
import { TR_RODS } from "./locales/tr/rods";

interface NamePair {
  en: string;
  tr: string;
}

let cachedPairs: NamePair[] | null = null;

function pushPair(pairs: NamePair[], en: string | undefined, tr: string | undefined): void {
  const english = en?.trim();
  const turkish = tr?.trim();
  if (!english || !turkish || english === turkish || english.length < 3) return;
  pairs.push({ en: english, tr: turkish });
}

function buildPairs(): NamePair[] {
  const pairs: NamePair[] = [];
  for (const item of ContentRegistry.items.values()) {
    pushPair(pairs, item.name, TR_ITEMS[item.id]?.name);
  }
  for (const fish of ContentRegistry.fishSpecies.values()) {
    pushPair(pairs, fish.name, TR_FISH[fish.id]?.name);
  }
  for (const boat of ContentRegistry.boats.values()) {
    pushPair(pairs, boat.name, TR_BOATS[boat.id]?.name);
  }
  for (const market of ContentRegistry.markets.values()) {
    pushPair(pairs, market.name, TR_MARKETS[market.id]?.name);
  }
  for (const npc of ContentRegistry.npcs.values()) {
    pushPair(pairs, npc.name, TR_NPCS[npc.id]?.name);
  }
  for (const rod of ContentRegistry.rods.values()) {
    pushPair(pairs, rod.name, TR_RODS[rod.id]?.name);
  }
  for (const template of CONTRACT_TEMPLATES) {
    pushPair(pairs, template.requesterName, TR_CONTRACTS[template.id]?.requesterName);
  }
  pairs.sort((a, b) => b.en.length - a.en.length);
  return pairs;
}

function pairs(): NamePair[] {
  cachedPairs ??= buildPairs();
  return cachedPairs;
}

/** Swaps known English content names for their Turkish catalog names. */
export function localizeCatalogText(text: string, locale?: string): string {
  if (locale !== "tr" || !text) return text;
  let out = text;
  for (const pair of pairs()) {
    if (!out.includes(pair.en)) continue;
    const escaped = pair.en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "gu"), pair.tr);
  }
  return out;
}
