// src/i18n/placesTr.ts
//
// English place labels stay on the simulation and world data. Turkish is
// applied where those labels are drawn.

import { ContentRegistry } from "../content/ContentRegistry";
import { TR_MARKETS } from "./locales/tr/markets";

const SEASONS_TR: Record<string, string> = {
  Spring: "İlkbahar",
  Summer: "Yaz",
  Autumn: "Sonbahar",
  Winter: "Kış"
};

/** Canonical English labels from WORLD_REGION_LABELS, WORLD_CHART_NODES, and HUD fallbacks. */
const PLACE_LABELS_TR: Record<string, string> = {
  "Pinewatch Forest": "Çamlıgöz Ormanı",
  "Reedhaven Marsh": "Sazlıliman Sazlığı",
  "Highridge Uplands": "Yüksek Sırt Yaylası",
  "Village Market": "Köy Pazarı",
  "Family Farm & Commons": "Aile Çiftliği ve Mera",
  "Neva Coast": "Neva Kıyısı",
  "Seabreak Harbor": "Denizkıran Limanı",
  "Neva Offshore Grounds": "Neva Açık Deniz Avlakları",
  "Open Channel": "Açık Kanal",
  "Sunreach Cove": "Gündoğumu Koyu",
  "Sunreach Terraces": "Gündoğumu Terasları",
  "Sunreach Scrub": "Gündoğumu Çalılığı",
  "Exposed Ridge": "Açık Sırt",
  "Open Waters": "Açık Sular",
  Pinewatch: "Çamlıgöz",
  Reedhaven: "Sazlıliman",
  Highridge: "Yüksek Sırt",
  "Gull's Rest": "Martı Durağı",
  "Driftwood Cay": "Sürüklenen Odun Adası",
  "Lantern Shoal": "Fener Sığlığı",
  "Mountain Spring": "Dağ Pınarı",
  "Western Overlook": "Batı Seyir Tepesi",
  "Western Beach": "Batı Sahili",
  "Northern Bluff": "Kuzey Yarığı",
  "Pinewatch Lake": "Çamlıgöz Gölü",
  "Reedwater River": "Sazlısu Nehri",
  "Reedhaven Cove Grounds": "Sazlıliman Koyu Avlakları",
  "Family Farm": "Aile Çiftliği",
  "Village Commons": "Köy Merası",
  "Village Mill": "Köy Değirmeni",
  "River Crossing": "Nehir Geçidi",
  "Silverwater River": "Gümüşsu Nehri",
  "Lighthouse Cliffs": "Fener Kayalıkları",
  "Sunreach Reef Shelf": "Gündoğumu Resif Sahanlığı",
  "Fish School": "Balık Sürüsü",
  "Farm Crate": "Çiftlik Sandığı",
  "Harbor Cold Room": "Liman Soğuk Odası",
  "Woodland road or sheltered cove": "Orman yolu ya da kuytu koy",
  "Raised marsh road or cove landing": "Yükseltilmiş sazlık yolu ya da koy iskelesi",
  "Mountain road; no boat landing": "Dağ yolu; tekne iskelesi yok"
};

function marketNameTr(english: string): string | undefined {
  for (const market of ContentRegistry.markets.values()) {
    if (market.name === english) return TR_MARKETS[market.id]?.name;
  }
  return undefined;
}

/** Translates a known English place, chart, or market label. Unknown text is unchanged. */
export function placeLabel(label: string, locale?: string): string {
  if (locale !== "tr" || !label) return label;
  return PLACE_LABELS_TR[label] ?? marketNameTr(label) ?? label;
}

/** Rewrites `Day {n} of {Season} · HH:MM` for the pause screen. */
export function formatPauseDate(label: string, locale?: string): string {
  if (locale !== "tr" || !label) return label;
  const match = label.match(/^Day (\d+) of (Spring|Summer|Autumn|Winter) · (\d{2}:\d{2})$/);
  if (!match) return label;
  return `${match[1]}. Gün, ${SEASONS_TR[match[2]]} · ${match[3]}`;
}

/** Title-case season words from the HUD clock (`Spring`, `Summer`, …). */
export function seasonLabel(label: string, locale?: string): string {
  if (locale !== "tr" || !label) return label;
  return SEASONS_TR[label] ?? label;
}
