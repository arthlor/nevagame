// src/i18n/milestonesTr.ts

import { ContentRegistry } from "../content/ContentRegistry";
import { TR_FISH } from "./locales/tr/fish";
import { TR_CROPS } from "./locales/tr/crops";
import type { RecordMilestoneDto } from "../simulation/core/contracts";

const ECOLOGY_LABELS_TR: Record<string, string> = {
  "ecology.neva": "Neva",
  "ecology.sunreach": "Sunreach",
  river: "Irmak ve Gölet",
  shallows: "Kıyı Sığlıkları",
  headwaters: "Yukarı Havza",
  cove: "Sığınak Koyu",
  channel: "Açık Deniz Kanalı",
  deep_ocean: "Derin Açık Deniz"
};

const SPECIAL_FISH_NAMES_TR: Record<string, string> = {
  "fish.mirror_carp": "Aynalı Sazan",
  "mirror_carp": "Aynalı Sazan"
};

function resolveFishName(speciesId: string): string {
  const special = SPECIAL_FISH_NAMES_TR[speciesId];
  if (special) return special;
  const direct = TR_FISH[speciesId]?.name;
  if (direct) return direct;
  const canonical = ContentRegistry.fishSpecies.get(speciesId);
  if (canonical?.name) {
    const canonicalTr = TR_FISH[canonical.id]?.name;
    if (canonicalTr) return canonicalTr;
    return canonical.name;
  }
  return speciesId;
}

/**
 * Localizes a RecordMilestoneDto into Turkish if locale is "tr".
 */
export function getLocalizedMilestone(
  milestone: RecordMilestoneDto,
  locale?: string
): { title: string; detail: string } {
  if (locale !== "tr") {
    return { title: milestone.title, detail: milestone.detail };
  }

  const { id } = milestone;

  // 1. Discovery records
  if (id.startsWith("record.discovery.")) {
    const ecologyId = id.slice("record.discovery.".length);
    const ecologyName = ECOLOGY_LABELS_TR[ecologyId] ?? ecologyId;
    return {
      title: `${ecologyName} sularındaki tüm balıkları kaydet`,
      detail: `Bu sularda yaşayan türlerin her birinden en az bir adet yakala.`
    };
  }

  // 2. Weight records (sport species)
  if (id.startsWith("record.weight.")) {
    const speciesId = id.slice("record.weight.".length);
    const trName = resolveFishName(speciesId);
    const match = milestone.detail.match(/at ([\d.]+) kg or better/);
    const targetKg = match ? match[1] : "";
    return {
      title: `${trName} ağırlık rekoru`,
      detail: targetKg ? `${targetKg} kg veya daha ağır bir balık karaya çıkar.` : `Ağırlık rekorunu aşan görkemli bir av yakala.`
    };
  }

  // 3. Grade records (trophy fish)
  if (id.startsWith("record.grade.") || id.startsWith("record.trophy_species.")) {
    const speciesId = id.startsWith("record.grade.")
      ? id.slice("record.grade.".length)
      : id.slice("record.trophy_species.".length);
    const trName = resolveFishName(speciesId);
    return {
      title: `${trName} kupa derecesi`,
      detail: `Kupa (trofe) veya daha üst derecede bir balık yakala.`
    };
  }

  // 4. Crop harvest mastery
  if (id.startsWith("record.harvest.")) {
    const cropId = id.slice("record.harvest.".length);
    const trName = TR_CROPS[cropId]?.name ?? ContentRegistry.crops.get(cropId)?.name ?? cropId;
    const match = milestone.detail.match(/Harvest (\d+) in total/);
    const target = match ? match[1] : "";
    return {
      title: `${trName} ustalığı`,
      detail: target ? `Toplam ${target} adet mahsul topla.` : `Tarladan bolca mahsul topla.`
    };
  }

  // 5. Sweeps
  if (id === "record.sweep.prize_crop") {
    return {
      title: "Sergi kalitesinde çiftçi",
      detail: "Herhangi bir ekini ödüllü (kusursuz) derecede hasat et."
    };
  }

  if (id === "record.sweep.habitats") {
    return {
      title: "Haritadaki tüm sular",
      detail: "Tüm yaşam alanlarında en az birer balık yakala."
    };
  }

  // Fallback patterns
  if (id.startsWith("record.species_quantity.")) {
    const speciesId = id.slice("record.species_quantity.".length);
    const trName = TR_FISH[speciesId]?.name ?? ContentRegistry.fishSpecies.get(speciesId)?.name ?? speciesId;
    const match = milestone.title.match(/^Land (\d+)/);
    const target = match ? match[1] : "";
    return {
      title: `${target} adet ${trName} yakala`,
      detail: `Yolculukların boyunca toplam ${target} adet avla.`
    };
  }

  if (id.startsWith("record.prize_crop.")) {
    const cropId = id.slice("record.prize_crop.".length);
    const trName = TR_CROPS[cropId]?.name ?? ContentRegistry.crops.get(cropId)?.name ?? cropId;
    return {
      title: `Ödüllü bir ${trName} yetiştir`,
      detail: `Ödüllü (kusursuz) aşamaya ulaşan bir mahsul hasat et.`
    };
  }

  if (id.startsWith("record.crop_quantity.")) {
    const cropId = id.slice("record.crop_quantity.".length);
    const trName = TR_CROPS[cropId]?.name ?? ContentRegistry.crops.get(cropId)?.name ?? cropId;
    const match = milestone.title.match(/^Harvest (\d+)/);
    const target = match ? match[1] : "";
    return {
      title: `${target} adet ${trName} hasat et`,
      detail: `Mevsimler boyunca tarladan toplam ${target} adet olgun mahsul topla.`
    };
  }

  return { title: milestone.title, detail: milestone.detail };
}
