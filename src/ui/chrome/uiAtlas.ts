/**
 * Resolvers over the generated UI atlas.
 *
 * The sprite maps themselves come from `assets/ui/ui-atlas.manifest.json` via
 * `npm run ui:codegen`; this module only turns simulation identifiers into sprite
 * URLs. Keys are the raw simulation ids (`fish.trout`, `seed.wheat`, `npc.maeve`)
 * so callers never have to translate before looking an icon up.
 */

import {
  UI_ACTION,
  UI_BEHAVIOR,
  UI_CHROME,
  UI_FISH,
  UI_GIS,
  UI_GROWTH,
  UI_MAP_NODES,
  UI_MENU,
  UI_PARCHMENT_GRAIN,
  UI_PLANTS,
  UI_PORTRAITS,
  UI_PRODUCE,
  UI_QUALITY,
  UI_SEEDS,
  UI_STATUS,
  UI_SUPPLIES,
  UI_TIME,
  UI_TOOLS,
  UI_WEATHER,
  UI_WORLD
} from "./uiAtlas.generated";
import type { QualitySpriteKey } from "./uiAtlas.generated";

export {
  UI_ACTION,
  UI_BEHAVIOR,
  UI_CHROME,
  UI_FISH,
  UI_GIS,
  UI_GROWTH,
  UI_MAP_NODES,
  UI_MENU,
  UI_PARCHMENT_GRAIN,
  UI_PLANTS,
  UI_PORTRAITS,
  UI_PRODUCE,
  UI_QUALITY,
  UI_SEEDS,
  UI_STATUS,
  UI_SUPPLIES,
  UI_TIME,
  UI_TOOLS,
  UI_WEATHER,
  UI_WORLD
};

export type SpriteUrl = string;

const QUALITY_SPRITE_ALIASES: Readonly<Record<string, QualitySpriteKey>> = {
  common: "normal",
  fine: "silver",
  exceptional: "gold",
  trophy: "iridium",
  prize: "iridium",
  good: "silver",
  pristine: "iridium"
};

function lookup(map: Record<string, string>, key: string | null | undefined): SpriteUrl | undefined {
  if (!key) return undefined;
  return map[key];
}

/** Any carryable item: seeds, produce, supplies, and fish held as goods. */
export function atlasForItem(itemId: string | null | undefined): SpriteUrl | undefined {
  if (!itemId) return undefined;
  return (
    lookup(UI_SEEDS, itemId) ??
    lookup(UI_PRODUCE, itemId) ??
    lookup(UI_SUPPLIES, itemId) ??
    lookup(UI_FISH, itemId)
  );
}

export function atlasForFish(speciesId: string | null | undefined): SpriteUrl | undefined {
  return lookup(UI_FISH, speciesId);
}

export function atlasForPortrait(npcId: string | null | undefined): SpriteUrl | undefined {
  return lookup(UI_PORTRAITS, npcId);
}

export function atlasForCrop(cropId: string | null | undefined): SpriteUrl | undefined {
  return lookup(UI_PLANTS, cropId);
}

export function atlasForSeedItem(itemId: string | null | undefined): SpriteUrl | undefined {
  return lookup(UI_SEEDS, itemId);
}

export function qualitySpriteKey(quality: string | null | undefined): QualitySpriteKey {
  if (!quality) return "normal";
  if (quality in UI_QUALITY) return quality as QualitySpriteKey;
  return QUALITY_SPRITE_ALIASES[quality] ?? "normal";
}

export function atlasForQuality(quality: string | null | undefined): SpriteUrl {
  return UI_QUALITY[qualitySpriteKey(quality)];
}

/**
 * The simulation carries finer-grained stages than the four illustrated badges, so
 * sprout folds into growing and overripe into mature.
 */
export function atlasForGrowth(stage: string | null | undefined): SpriteUrl | undefined {
  if (!stage) return undefined;
  if (stage === "sprout") return UI_GROWTH.growing;
  if (stage === "overripe") return UI_GROWTH.mature;
  return lookup(UI_GROWTH, stage);
}

export function atlasForTool(toolId: string | null | undefined): SpriteUrl | undefined {
  return lookup(UI_TOOLS, toolId);
}

export function atlasForAction(actionId: string | null | undefined): SpriteUrl | undefined {
  if (!actionId) return undefined;
  if (actionId === "processing-start" || actionId === "processing-collect") return UI_ACTION.processing;
  return lookup(UI_ACTION, actionId);
}

export function atlasForBehavior(behaviorId: string | null | undefined): SpriteUrl | undefined {
  if (!behaviorId) return undefined;
  if (behaviorId === "run-left" || behaviorId === "run-right") return UI_BEHAVIOR.run;
  if (behaviorId === "rest") return UI_BEHAVIOR.tiring;
  return lookup(UI_BEHAVIOR, behaviorId);
}

export function atlasForMapNode(nodeId: string | null | undefined): SpriteUrl | undefined {
  if (!nodeId) return undefined;
  const aliases: Record<string, string> = {
    node_home_farm: "homestead",
    node_uplands: "garden",
    node_village: "village",
    node_crossing: "river_crossing",
    node_river: "river",
    node_harbor: "harbor",
    node_lighthouse: "lighthouse",
    node_offshore: "offshore",
    farm: "homestead",
    village: "village",
    harbor: "harbor",
    lighthouse: "lighthouse",
    fishing: "river"
  };
  return lookup(UI_MAP_NODES, aliases[nodeId] ?? nodeId);
}

/**
 * Weather tags vary by source (`light-rain` vs `light_rain`), and clear skies read
 * differently by time of day, so both are normalised here rather than at each call.
 */
export function atlasForWeather(
  weather: string | null | undefined,
  timeOfDay?: "dawn" | "day" | "dusk" | "night"
): SpriteUrl | undefined {
  if (!weather) return undefined;
  const tag = weather.toLowerCase().replace(/_/g, "-");
  if (tag === "clear" || tag === "sunny") {
    if (timeOfDay === "dawn") return UI_TIME.dawn;
    if (timeOfDay === "dusk") return UI_TIME.dusk;
    if (timeOfDay === "night") return UI_TIME.moon;
    return UI_WEATHER.clear;
  }
  const aliases: Record<string, string> = {
    cloudy: "overcast",
    overcast: "overcast",
    "heavy-rain": "rain",
    rain: "rain",
    windy: "wind",
    wind: "wind"
  };
  return lookup(UI_WEATHER, aliases[tag] ?? tag);
}

export function atlasForTime(timeOfDay: "dawn" | "day" | "dusk" | "night"): SpriteUrl {
  if (timeOfDay === "dawn") return UI_TIME.dawn;
  if (timeOfDay === "dusk") return UI_TIME.dusk;
  if (timeOfDay === "night") return UI_TIME.moon;
  return UI_TIME.sun;
}

/** Back-compat alias: the parchment tile was previously exported as UI_PARCHMENT. */
export const UI_PARCHMENT = UI_PARCHMENT_GRAIN;
