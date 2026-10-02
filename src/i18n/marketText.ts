import { localizeCatalogText } from "./catalogNames";
import { translateReason } from "./reasonsTr";
import { qualityLabel } from "./itemText";

const LABELS_TR: Record<string, string> = {
  Wanted: "Aranıyor",
  Steady: "Dengeli",
  Plentiful: "Bol",
  "Due now": "Süre doldu",
  "Previous rod required": "Önce bir önceki oltayı edin",
  "No single fish meets every requirement": "Tüm koşulları karşılayan bir balık yok",
  "Collect this fish trade pack and carry it to the contract counter": "Balık paketini alıp sipariş tezgâhına elde taşı"
};

/** Display only: preserves the domain's quoted durations and requirements. */
export function localizeMarketText(text: string, locale: string): string {
  if (locale !== "tr" || !text) return text;
  const gradeLabel = qualityLabel(text, locale);
  if (gradeLabel !== text) return gradeLabel;
  if (LABELS_TR[text]) return LABELS_TR[text];
  const duration = text.match(/^(?:(\d+)h(?: (\d+)m)?|(\d+)m)$/);
  if (duration) return [duration[1] && `${duration[1]} sa`, (duration[2] ?? duration[3]) && `${duration[2] ?? duration[3]} dk`].filter(Boolean).join(" ");
  const due = text.match(/^Due in (.+) \(game time\)$/);
  if (due) return `${localizeMarketText(due[1], locale)} kaldı · oyun süresi`;
  const quality = text.match(/^(\w+) quality or better$/);
  if (quality) return `En az ${localizeMarketText(quality[1], locale).toLocaleLowerCase("tr")} kalite`;
  const freshness = text.match(/^At least (\d+)% (?:fresh|freshness)$/);
  if (freshness) return `En az %${freshness[1]} tazelik`;
  const weight = text.match(/^At least ([\d.]+) kg$/);
  if (weight) return `En az ${weight[1]} kg`;
  const bring = text.match(/^Bring (.+) to the market dock$/);
  if (bring) return `${localizeCatalogText(bring[1], locale)} getir`;
  const items = text.match(/^Bring (\d+) (.+)$/);
  if (items) return `${items[1]} ${localizeCatalogText(items[2], locale)} getir`;
  return translateReason(text, locale);
}
