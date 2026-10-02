/** Presentation labels only; grades, rarity and freshness stay domain-owned. */
const QUALITY_TR: Record<string, string> = {
  normal: "Normal", common: "Sıradan", fine: "İyi", exceptional: "Seçkin", prize: "Ödüllük", trophy: "Ganimet"
};

export function qualityLabel(label: string, locale: string): string {
  return locale === "tr" ? QUALITY_TR[label] ?? label : label;
}

const ITEM_LABELS_TR: Record<string, string> = {
  seed: "Tohum", grain: "Tahıl", produce: "Ürün", bait: "Yem", fertilizer: "Gübre",
  "crafting material": "Üretim malzemesi", "fishing supply": "Balıkçılık malzemesi",
  "processed food": "Hazır yiyecek", fuel: "Yakıt", ice: "Buz", fish: "Balık", item: "Eşya",
  Common: "Yaygın", Uncommon: "Seyrek", Rare: "Nadir", Prized: "Kıymetli",
  Fresh: "Taze", Good: "İyi", Turning: "Bayatlamaya başlamış", Poor: "Bayat", Spoiled: "Bozulmuş",
  "Carried open": "Elde taşınıyor", "Sheltered hold": "Kapalı ambar", "Carriage bed": "Araba kasası",
  "Transom hook": "Ayna kancası", "Cold room": "Soğuk oda", Crate: "Sandık", "On the ground": "Yerde", "Iced hold": "Buzlu ambar",
  temperate: "Ilıman", warm: "Sıcak", cool: "Serin", arid: "Kurak", humid: "Nemli"
};

export function localizeItemLabel(label: string, locale: string): string {
  return locale === "tr" ? ITEM_LABELS_TR[label] ?? label : label;
}
