import { ContentRegistry } from "../../content/ContentRegistry";
import { RECORD_TUNING, recordTierForRodClass, type RecordTier } from "../../content/records";
import { FISHING_ECOLOGY_DEFINITIONS } from "../../world/WorldIslands";
import { rodMeetsMinimum } from "../domains/domainRules";
import { isSpeciesInSeason } from "../fishing/seasonalAvailability";
import type { RecordMilestoneDto } from "../core/contracts";
import type { GameState } from "../core/types";

const FISH_QUALITY_RANK: Record<string, number> = { common: 0, fine: 1, exceptional: 2, trophy: 3 };
const CROP_QUALITY_RANK: Record<string, number> = { common: 0, fine: 1, exceptional: 2, prize: 3 };

function milestone(
  id: string,
  tier: RecordTier,
  title: string,
  detail: string,
  current: number,
  target: number,
  currentLabel: string,
  followable = false
): RecordMilestoneDto {
  const clamped = Math.max(0, Math.min(current, target));
  return {
    id,
    tier,
    title,
    detail,
    achieved: target > 0 && current >= target,
    followable: followable && target > 0 && current < target,
    progress: target > 0 ? clamped / target : 0,
    currentLabel
  };
}

/**
 * The Records Board: a ladder of standing goals derived from the journal.
 *
 * `state.journal` already tracked discovery, catch counts, largest weight and
 * best grade and nothing read any of it as a goal, so the game had no answer
 * to "what now" once the authored chain ended. Every milestone here is
 * computed from content, so new species and crops bring their own records.
 */
export function buildRecordMilestones(state: GameState): RecordMilestoneDto[] {
  const milestones: RecordMilestoneDto[] = [];
  const species = [...ContentRegistry.fishSpecies.values()];

  // Discovery, per ecology. "Every fish in these waters" is the one goal that
  // sends the player back across the whole map rather than to one spot.
  for (const ecology of Object.values(FISHING_ECOLOGY_DEFINITIONS)) {
    const local = species.filter((fish) => fish.ecologyIds.includes(ecology.id));
    const found = local.filter((fish) => state.journal.fishRecords[fish.id]?.discovered).length;
    milestones.push(milestone(
      `record.discovery.${ecology.id}`,
      "harbor",
      `Log every fish in ${ecology.label}`,
      `Catch one of each of the ${local.length} species that range here.`,
      found,
      local.length,
      `${found} / ${local.length}`
    ));
  }

  // Weight and grade records, sport species only: a basic catch never records
  // a weight, so a weight milestone on one could never be met.
  for (const fish of species) {
    if (!fish.isSportFish) continue;
    const record = state.journal.fishRecords[fish.id];
    const followable = Boolean(record?.discovered)
      && isSpeciesInSeason(fish, state.clock.season)
      && state.player.ownedRodIds.some((rodId) => {
        const rod = ContentRegistry.rods.get(rodId);
        return rod ? rodMeetsMinimum(rod.rodClass, fish.minimumRodClass) : false;
      });
    const tier = recordTierForRodClass(fish.minimumRodClass);
    // Landed weights are recorded to one decimal place. Round the required
    // weight up to that precision so the displayed target is the actual gate.
    const threshold = Math.ceil((fish.weightKg.average
      + (fish.weightKg.max - fish.weightKg.average) * RECORD_TUNING.weightRecordFraction) * 10) / 10;
    const largest = record?.largestWeightKg ?? 0;
    milestones.push(milestone(
      `record.weight.${fish.id}`,
      tier,
      `${fish.name} weight record`,
      `Land one at ${threshold.toFixed(1)} kg or better.`,
      largest,
      threshold,
      `${largest.toFixed(1)} / ${threshold.toFixed(1)} kg`,
      followable
    ));

    const best = FISH_QUALITY_RANK[record?.bestQuality ?? "common"] ?? 0;
    const wanted = FISH_QUALITY_RANK[RECORD_TUNING.trophyFishQuality];
    milestones.push(milestone(
      `record.grade.${fish.id}`,
      tier,
      `${fish.name} trophy grade`,
      `Land one graded ${RECORD_TUNING.trophyFishQuality} or better.`,
      record?.bestQuality ? best + 1 : 0,
      wanted + 1,
      record?.bestQuality ?? "none",
      followable
    ));
  }

  // Crop mastery, one per crop.
  for (const crop of ContentRegistry.crops.values()) {
    const harvested = state.journal.cropRecords[crop.id]?.harvestedCount ?? 0;
    milestones.push(milestone(
      `record.harvest.${crop.id}`,
      "field",
      `${crop.name} mastery`,
      `Harvest ${RECORD_TUNING.cropMasteryHarvests} in total.`,
      harvested,
      RECORD_TUNING.cropMasteryHarvests,
      `${harvested} / ${RECORD_TUNING.cropMasteryHarvests}`,
      harvested > 0 && state.player.proficiencies.farming >= crop.minimumFarmingXp
    ));
  }

  // Two sweeps that only a broad player completes.
  const prizeCrops = [...ContentRegistry.crops.values()].filter((crop) =>
    (CROP_QUALITY_RANK[state.journal.cropRecords[crop.id]?.bestQuality ?? "common"] ?? 0)
      >= CROP_QUALITY_RANK[RECORD_TUNING.prizeCropQuality]
  ).length;
  milestones.push(milestone(
    "record.sweep.prize_crop",
    "field",
    "Show-quality grower",
    `Bring any crop in at ${RECORD_TUNING.prizeCropQuality} grade.`,
    Math.min(prizeCrops, 1),
    1,
    prizeCrops > 0 ? "achieved" : "none",
    Object.values(state.journal.cropRecords).some((record) => record.harvestedCount > 0)
  ));

  const fishedHabitats = RECORD_TUNING.sweepHabitats.filter((habitat) =>
    species.some((fish) => {
      const record = state.journal.fishRecords[fish.id];
      if (!record?.discovered) return false;
      // Newest records name the water they were landed in; legacy records fall
      // back to the species' allowed habitats so old saves keep their progress.
      return record.habitats ? record.habitats.includes(habitat) : fish.habitats.includes(habitat);
    })
  ).length;
  milestones.push(milestone(
    "record.sweep.habitats",
    "deep",
    "Every water on the chart",
    `Catch a fish in all ${RECORD_TUNING.sweepHabitats.length} habitats.`,
    fishedHabitats,
    RECORD_TUNING.sweepHabitats.length,
    `${fishedHabitats} / ${RECORD_TUNING.sweepHabitats.length}`
  ));

  return milestones;
}
