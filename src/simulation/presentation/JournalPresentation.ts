import { ContentRegistry } from "../../content/ContentRegistry";
import type { JournalPagesDto } from "../core/contracts";
import type { GameState } from "../core/types";

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
      .map((entry) => ({ id: entry.id, title: entry.title, summary: entry.summary }))
  };
}
