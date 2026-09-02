import { ContentRegistry } from "../../content/ContentRegistry";
import type { WorldMapDto } from "../core/contracts";
import type { GameState } from "../core/types";
import { FISHING_ECOLOGY_DEFINITIONS } from "../../world/WorldIslands";

const HABITATS = ["river", "lake", "coast", "offshore"] as const;

const WATER_LABELS: Record<(typeof HABITATS)[number], string> = {
  river: "Freshwater",
  lake: "Freshwater",
  coast: "Coastal Saltwater",
  offshore: "Deep Sea Waters"
};

const titleCase = (value: string): string =>
  value.replace(/(^|[-_])\w/g, (match) => match.replace(/[-_]/, "").toUpperCase());

export function buildWorldMapDto(state: GameState): WorldMapDto {
  const fishingEntries = Object.values(FISHING_ECOLOGY_DEFINITIONS).flatMap((ecology) => HABITATS.map((habitat) => {
    const discovered = [...ContentRegistry.fishSpecies.values()]
      .filter((species) => species.ecologyIds.includes(ecology.id)
        && species.habitats.includes(habitat)
        && state.journal.fishRecords[species.id]?.discovered)
      .sort((a, b) => a.name.localeCompare(b.name));
    const best = discovered
      .map((species) => ({ species, record: state.journal.fishRecords[species.id]! }))
      .sort((a, b) => (b.record.largestWeightKg ?? 0) - (a.record.largestWeightKg ?? 0))[0];
    return [`${ecology.id}:${habitat}`, {
      waterType: WATER_LABELS[habitat],
      species: discovered.map((species) => species.name),
      record: best?.record.largestWeightKg
        ? `${best.species.name} · ${best.record.largestWeightKg.toFixed(1)} kg best`
        : null
    }] as const;
  }));
  const fishingNotes: WorldMapDto["fishingNotes"] = Object.fromEntries(fishingEntries);
  for (const habitat of HABITATS) fishingNotes[habitat] = fishingNotes[`ecology.neva:${habitat}`];
  const farms = Object.fromEntries(Object.entries(state.farms).map(([farmId, farm]) => [farmId, {
    fertilityPercent: Math.round(farm.soil.fertility),
    climateLabel: titleCase(farm.climateId),
    plantedCount: farm.placedCropIds.length
  }]));
  return {
    player: { x: state.player.x, z: state.player.z },
    fishingNotes,
    farms
  };
}
