import { resolveCargoHasIce } from "../fishing/calculateFreshness";
import type { ClockState, GameMode, GameState } from "../core/types";
import { WorldLayout } from "../../world/WorldLayout";
import { WORLD_AMBIENCE_PROFILES } from "../../world/WorldGameplayLocations";

export type WorldMusicCue = "theme" | "theme-village" | "theme-piano" | "theme-folk-calm" | "theme-guitar-arpeggio" | "theme-line-tension" | "theme-night" | "theme-dusk" | "theme-forest" | "theme-highland" | "theme-sunreach";
export interface WorldAudioDto {
  bed: "farm" | "village" | "coast" | "water" | "interior";
  music: WorldMusicCue;
  layers: Partial<Record<"ambience-wind" | "ambience-waves" | "ambience-insects" | "ambience-meadow" | "ambience-scrub" | "ambience-forest" |
    "ambience-market" | "ambience-harbor" | "ambience-birds" | "ambience-seagulls" | "ambience-fireplace" | "ambience-dawn", number>>;
}

export function buildWorldAudio(position: { x: number; z: number }, mode: GameMode,
  clock: Pick<ClockState, "timeOfDay">): WorldAudioDto {
  const interior = WorldLayout.isInterior(position.x, position.z);
  const region = WorldLayout.regionAt(position.x, position.z);
  const profile = WORLD_AMBIENCE_PROFILES.find((entry) => entry.regionId === region);
  const quietNight = clock.timeOfDay === "night";
  const sunreach = region === "region.sunreach_cove" || region === "region.sunreach_terraces"
    || region === "region.sunreach_scrub" || region === "region.sunreach_ridge";
  const nightInsects = clock.timeOfDay === "night" || clock.timeOfDay === "dusk";
  const insectGain = profile?.insectsGain ?? 0.5;
  const music: WorldMusicCue = interior ? "theme-piano"
    : quietNight ? "theme-night"
    : mode === "boat-driving" ? "theme-guitar-arpeggio"
    : region === "region.village" || region === "region.harbor" ? "theme-village"
    : clock.timeOfDay === "dusk" ? "theme-dusk"
    : region === "region.pinewatch" ? "theme-forest"
    : region === "region.highridge" || region === "region.sunreach_ridge" ? "theme-highland"
    : sunreach ? "theme-sunreach"
    : "theme";
  const bed = interior ? "interior" : mode === "boat-driving" || WorldLayout.isWater(position.x, position.z)
    ? "water" : region === "region.village" ? "village" : (profile?.surfGain ?? 0) >= 0.4 ? "coast" : "farm";
  return { bed, music, layers: interior ? { "ambience-fireplace": 1, "ambience-wind": 0.12 } : {
    "ambience-wind": profile?.windGain ?? 0.3,
    "ambience-waves": profile?.surfGain ?? 0.06,
    "ambience-insects": nightInsects ? insectGain : 0,
    "ambience-meadow": !nightInsects && !sunreach ? insectGain : 0,
    "ambience-scrub": !nightInsects && sunreach ? insectGain : 0,
    "ambience-forest": region === "region.pinewatch" ? 0.4 : 0,
    // The village keeps its market murmur. The harbor uses its own bed.
    "ambience-market": region === "region.village" ? 0.6 : region === "region.harbor" ? 0 : profile?.harborGain ?? 0,
    "ambience-harbor": region === "region.harbor" ? Math.max(0.45, profile?.harborGain ?? 0) : 0,
    "ambience-birds": clock.timeOfDay === "night" || clock.timeOfDay === "dusk" ? 0 : 0.5,
    "ambience-seagulls": (profile?.surfGain ?? 0) * 0.65,
    "ambience-dawn": clock.timeOfDay === "dawn" ? 1 : 0
  } };
}

export { WorldMusicRouting } from "./MusicRouting";

const FALL_LOOP = { x: -29.5, y: 12, z: -135.2 };
const RIFFLE_LOOP = { x: -30, y: 2, z: -121 };
const PINEWATCH_LAKE = { x: -590, z: -180 };
const REEDWATER = { x: -550, z: 70 };

const distanceFade = (distance: number, radius: number): number =>
  distance >= radius ? 0 : 1 - distance / radius;

/** Positional gains for the headwater fall and the riffle below it. */
export function headwaterLoopGains(position: { x: number; z: number }): {
  fall: number;
  riffle: number;
  fallPosition: { x: number; y: number; z: number };
  rifflePosition: { x: number; y: number; z: number };
} {
  return {
    fall: distanceFade(Math.hypot(position.x - FALL_LOOP.x, position.z - FALL_LOOP.z), 52),
    riffle: distanceFade(Math.hypot(position.x - RIFFLE_LOOP.x, position.z - RIFFLE_LOOP.z), 34),
    fallPosition: FALL_LOOP,
    rifflePosition: RIFFLE_LOOP
  };
}

/** Shore wash at the charted Pinewatch Lake point, fading across the near bank. */
export function pinewatchLakeLoop(position: { x: number; z: number }): {
  gain: number;
  position: { x: number; y: number; z: number };
} {
  return {
    gain: distanceFade(Math.hypot(position.x - PINEWATCH_LAKE.x, position.z - PINEWATCH_LAKE.z), 80),
    position: {
      x: PINEWATCH_LAKE.x,
      y: WorldLayout.traversalSurfaceHeight(PINEWATCH_LAKE.x, PINEWATCH_LAKE.z),
      z: PINEWATCH_LAKE.z
    }
  };
}

export function reedwaterRun(position: { x: number; z: number }): {
  gain: number;
  position: { x: number; y: number; z: number };
} {
  return {
    gain: distanceFade(Math.hypot(position.x - REEDWATER.x, position.z - REEDWATER.z), 70),
    position: {
      x: REEDWATER.x,
      y: WorldLayout.traversalSurfaceHeight(REEDWATER.x, REEDWATER.z),
      z: REEDWATER.z
    }
  };
}

/** The far water, where a distant bell can sound. The coast and harbor stay quiet. */
export function offshoreBellRegion(position: { x: number; z: number }): boolean {
  const region = WorldLayout.regionAt(position.x, position.z);
  return region === "region.offshore" || region === "region.open_channel";
}

export function buildWindmillAudio(position: { x: number; z: number }, windSpeed: number) {
  const { x, z } = WorldLayout.landmark("windmill");
  return Math.hypot(position.x - x, position.z - z) < 45
    ? { position: { x, y: WorldLayout.traversalSurfaceHeight(x, z) + 5, z }, gain: Math.min(1, Math.max(0, windSpeed / 12)) }
    : undefined;
}

export function buildIcedCargoIds(state: GameState): string[] {
  return Object.values(state.fishCargo).filter((cargo) => resolveCargoHasIce(state, cargo)).map((cargo) => cargo.id);
}
