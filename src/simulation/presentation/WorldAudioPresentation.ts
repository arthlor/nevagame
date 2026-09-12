import { resolveCargoHasIce } from "../fishing/calculateFreshness";
import type { ClockState, GameMode, GameState } from "../core/types";
import { WorldLayout } from "../../world/WorldLayout";
import { WORLD_AMBIENCE_PROFILES } from "../../world/WorldGameplayLocations";

export type WorldMusicCue = "theme" | "theme-village" | "theme-piano" | "theme-folk-calm" | "theme-guitar-arpeggio";
export interface WorldAudioDto {
  bed: "farm" | "village" | "coast" | "water" | "interior";
  music: WorldMusicCue;
  layers: Partial<Record<"ambience-wind" | "ambience-waves" | "ambience-insects" |
    "ambience-market" | "ambience-birds" | "ambience-seagulls" | "ambience-fireplace" | "ambience-dawn", number>>;
}

export function buildWorldAudio(position: { x: number; z: number }, mode: GameMode,
  clock: Pick<ClockState, "timeOfDay">): WorldAudioDto {
  const interior = WorldLayout.isInterior(position.x, position.z);
  const region = WorldLayout.regionAt(position.x, position.z);
  const profile = WORLD_AMBIENCE_PROFILES.find((entry) => entry.regionId === region);
  const quiet = clock.timeOfDay === "night" || clock.timeOfDay === "dusk";
  const fishing = mode === "basic-fishing" || mode === "sport-fishing";
  const music: WorldMusicCue = quiet || interior ? "theme-piano"
    : fishing || mode === "boat-driving" ? "theme-guitar-arpeggio"
    : region === "region.village" || region === "region.harbor" ? "theme-village"
    : "theme";
  const bed = interior ? "interior" : mode === "boat-driving" || WorldLayout.isWater(position.x, position.z)
    ? "water" : region === "region.village" ? "village" : (profile?.surfGain ?? 0) >= 0.4 ? "coast" : "farm";
  return { bed, music, layers: interior ? { "ambience-fireplace": 1, "ambience-wind": 0.12 } : {
    "ambience-wind": profile?.windGain ?? 0.3,
    "ambience-waves": profile?.surfGain ?? 0.06,
    "ambience-insects": profile?.insectsGain ?? 0.5,
    // Market is the shipped crowd/working-harbor recording; no harbor source exists.
    "ambience-market": region === "region.village" ? 0.6 : profile?.harborGain ?? 0,
    "ambience-birds": quiet ? 0 : 0.5,
    "ambience-seagulls": (profile?.surfGain ?? 0) * 0.65,
    "ambience-dawn": clock.timeOfDay === "dawn" ? 1 : 0
  } };
}

export { WorldMusicRouting } from "./MusicRouting";

export function buildWindmillAudio(position: { x: number; z: number }, windSpeed: number) {
  const x = 57.8, z = -81.2;
  return Math.hypot(position.x - x, position.z - z) < 45
    ? { position: { x, y: WorldLayout.traversalSurfaceHeight(x, z) + 5, z }, gain: Math.min(1, Math.max(0, windSpeed / 12)) }
    : undefined;
}

export function buildIcedCargoIds(state: GameState): string[] {
  return Object.values(state.fishCargo).filter((cargo) => resolveCargoHasIce(state, cargo)).map((cargo) => cargo.id);
}
