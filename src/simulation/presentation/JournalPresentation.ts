import { ContentRegistry } from "../../content/ContentRegistry";
import type { AlmanacDto, JournalPagesDto } from "../core/contracts";
import { rarityForEncounterWeight } from "./SatchelPresentation";
import type { GameState } from "../core/types";
import { buildRecordMilestones } from "./buildRecordMilestones";

export function buildJournalPagesDto(state: GameState): JournalPagesDto {
  const fishRecords = [...ContentRegistry.fishSpecies.values()]
    .filter((species) => state.journal.fishRecords[species.id]?.discovered)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((species) => {
      const record = state.journal.fishRecords[species.id]!;
      return {
        speciesId: species.id,
        name: species.name,
        habitatsLabel: species.habitats.join(" · "),
        caughtCount: record.catchCount,
        bestLabel: record.largestWeightKg
          ? `${record.largestWeightKg.toFixed(1)} kg`
          : record.bestQuality ?? "Recorded"
      };
    });
  const cropRecords = [...ContentRegistry.crops.values()]
    .filter((crop) => (state.journal.cropRecords[crop.id]?.harvestedCount ?? 0) > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((crop) => {
      const record = state.journal.cropRecords[crop.id]!;
      return {
        cropId: crop.id,
        name: crop.name,
        harvestedCount: record.harvestedCount,
        bestQuality: record.bestQuality ?? null
      };
    });
  return {
    completedStories: state.quests.completedQuestIds.map((questId) => ({
      questId,
      title: ContentRegistry.quests.get(questId)?.questTitle ?? "Completed coastal errand"
    })),
    fishRecords,
    cropRecords,
    knowledge: state.journal.unlockedKnowledge
      .map((id) => ContentRegistry.knowledge.get(id))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .map((entry) => ({ id: entry.id, title: entry.title, summary: entry.summary })),
    records: buildRecordMilestones(state)
  };
}


const titleCase = (value: string): string =>
  value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);

const listLabel = (values: readonly string[], empty: string): string =>
  values.length === 0 ? empty : values.map((v) => titleCase(v.replace(/[-_]/g, " "))).join(" · ");

/**
 * The Coastal Almanac. Species and crop facts come from the content registry,
 * which is the same data the fishing and farming systems run on, so the guide
 * cannot drift from the game. Personal counts come from the player's journal.
 */
export function buildAlmanacDto(state: GameState): AlmanacDto {
  const fish = [...ContentRegistry.fishSpecies.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((species) => {
      const record = state.journal.fishRecords[species.id];
      const discovered = Boolean(record?.discovered);
      return {
        speciesId: species.id,
        name: species.name,
        discovered,
        habitatsLabel: listLabel(species.habitats, "Unknown waters"),
        seasonsLabel: listLabel(species.seasons, "All year"),
        timeWindowsLabel: listLabel(species.timeWindows, "Any hour"),
        weightKg: species.weightKg,
        baseMarketValue: species.baseMarketValue,
        rarityLabel: rarityForEncounterWeight(species.rarityWeight).label,
        rodClassLabel: titleCase(species.minimumRodClass.replace(/[-_]/g, " ")),
        isSportFish: species.isSportFish,
        // A count only means something once the species has been met.
        caughtCount: discovered ? record!.catchCount : 0,
        bestWeightKg: discovered ? record!.largestWeightKg ?? null : null
      };
    });

  const crops = [...ContentRegistry.crops.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((crop) => {
      const record = state.journal.cropRecords[crop.id];
      const harvestedCount = record?.harvestedCount ?? 0;
      return {
        cropId: crop.id,
        name: crop.name,
        discovered: harvestedCount > 0,
        climatesLabel: listLabel(crop.preferredClimates.map((c) => c.replace(/^climate\./, "")), "Any ground"),
        growthMinutes: crop.baseGrowthMinutes,
        waterNeed: crop.waterNeed,
        yieldMin: crop.baseYield.min,
        yieldMax: crop.baseYield.max,
        regrows: crop.regrows,
        harvestedCount,
        bestQuality: record?.bestQuality ?? null
      };
    });

  return {
    fish,
    crops,
    discoveredFish: fish.filter((entry) => entry.discovered).length,
    totalFish: fish.length,
    discoveredCrops: crops.filter((entry) => entry.discovered).length,
    totalCrops: crops.length
  };
}
