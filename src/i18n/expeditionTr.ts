// src/i18n/expeditionTr.ts
//
// Expedition opportunities are built in English. This rewrites the sentences
// the board draws, and swaps embedded content names through the catalogs.

import { localizeCatalogText } from "./catalogNames";
import { placeLabel } from "./placesTr";

const EXACT_TR: Record<string, string> = {
  "Deadline has passed": "Süre doldu",
  "Deadline is close": "Süre daralıyor",
  "Rowboat access is required": "Kayık erişimi gerekli",
  "No owned rod suits this fish": "Bu balığa uygun bir oltan yok",
  "Pack a chum bucket": "Bir yem kovası hazırla",
  "Pack a Woven Lure": "Bir Örme Sahte Yem hazırla",
  "No suitable cargo space is open": "Uygun kargo yeri yok",
  "Water is rougher than your vessel's safe range": "Su, teknenin güvenli sınırından daha hırçın",
  "No crushed ice is packed for the freshness target": "Tazelik hedefi için kırılmış buz yok",
  "Your vessel has lost her hull — tow and repair before sailing": "Teknenin gövdesi gitti — yelken açmadan önce çektir ve onar",
  "Quote at the stall": "Teklifi tezgâhta gör",
  "Calm water": "Sakin su",
  "Rough water": "Dalgalı su",
  "Unsafe water": "Tehlikeli su"
};

const DEMAND_TR: Record<string, string> = {
  wanted: "aranıyor",
  steady: "talebi durgun",
  plentiful: "bol"
};

const EXTRA_NAMES_TR: Record<string, string> = {
  "A seagoing vessel": "Açık deniz teknesi",
  "Your vessel": "Teknen",
  "the requester": "isteyen"
};

function name(text: string): string {
  return EXTRA_NAMES_TR[text] ?? localizeCatalogText(placeLabel(text, "tr"), "tr");
}

/** Translates one expedition-board sentence. Unknown text is unchanged. */
export function translateExpeditionText(text: string, locale?: string): string {
  if (locale !== "tr" || !text) return text;
  const exact = EXACT_TR[text];
  if (exact) return exact;

  const delivery = text.match(/^(.+) delivery$/);
  if (delivery) return `${name(delivery[1])} teslimatı`;

  const order = text.match(/^(.+) order$/);
  if (order) return `${name(order[1])} siparişi`;

  const marketRun = text.match(/^(.+) market run$/);
  if (marketRun) return `${name(marketRun[1])} pazar seferi`;

  const remaining = text.match(/^(\d+) remaining for (.+)$/);
  if (remaining) return `${name(remaining[2])} için ${remaining[1]} kaldı`;

  const demand = text.match(/^(.+) is (wanted|steady|plentiful) at (.+)$/);
  if (demand) return `${name(demand[1])} ${DEMAND_TR[demand[2]]} · ${name(demand[3])}`;

  const contractValue = text.match(/^From ([\d,.]+) G contract$/);
  if (contractValue) return `${contractValue[1]} akçelik sözleşme`;

  const minutes = text.match(/^(\d+)m left$/);
  if (minutes) return `${minutes[1]} dk kaldı`;

  const daysHours = text.match(/^(\d+)d (\d+)h left$/);
  if (daysHours) return `${daysHours[1]} gün ${daysHours[2]} sa kaldı`;

  const days = text.match(/^(\d+)d left$/);
  if (days) return `${days[1]} gün kaldı`;

  const hoursMinutes = text.match(/^(\d+)h (\d+)m left$/);
  if (hoursMinutes) return `${hoursMinutes[1]} sa ${hoursMinutes[2]} dk kaldı`;

  const hours = text.match(/^(\d+)h left$/);
  if (hours) return `${hours[1]} sa kaldı`;

  const journey = text.match(/^([\d.,]+) m away · (.+)$/);
  if (journey) return `${journey[1]} m uzaklıkta · ${name(journey[2])}`;

  const needSeed = text.match(/^Need (\d+) more (.+) and no seed is packed$/);
  if (needSeed) return `${needSeed[1]} ${name(needSeed[2])} daha gerek ve hiç tohum yok`;

  const needMore = text.match(/^Need (\d+) more (.+)$/);
  if (needMore) return `${needMore[1]} ${name(needMore[2])} daha gerek`;

  const unpacked = text.match(/^No (.+) is packed$/);
  if (unpacked) return `Yanında ${name(unpacked[1])} yok`;

  const vesselReach = text.match(/^(.+) is required to reach (.+)$/);
  if (vesselReach) return `${name(vesselReach[2])} için ${name(vesselReach[1])} gerekli`;

  const hull = text.match(/^(.+) has lost her hull — tow and repair before sailing$/);
  if (hull) return `${name(hull[1])} gövdesini kaybetti — yelken açmadan önce çektir ve onar`;

  return name(text);
}
