// src/render/scene/ambientTownsfolk.ts

import type { ClockState } from "../../simulation/core/types";
import { ASSET_IDS } from "../assets/AssetCatalog";

/**
 * Background villagers. Presentation only: they are deliberately absent from
 * `ContentRegistry.npcs`, which is the single registry every interaction
 * prompt, dialogue, quest gate, bark and telemetry path iterates — so they
 * cannot be talked to, cannot appear in a quest, and never touch a save. Their
 * character models are `collision: "none"` and they live in the environment
 * group rather than the static prefab group, so they carry no physics either.
 *
 * They exist because the village reads as a stage set: sixteen buildings, a
 * plaza, a market hall and an inn, with the entire named cast standing inside
 * a 1.2 m circle. This is scenery with legs, not content.
 */
export interface AmbientTownsfolkRoute {
  id: string;
  assetId: string;
  /**
   * Where this person is during each phase of the day, and how far they drift.
   * Stations sit clear of doors, stalls, workstations and the dock boarding
   * point; `radiusMeters` keeps the drift inside that clearance.
   */
  stations: Record<ClockState["timeOfDay"], { x: number; z: number }>;
  radiusMeters: number;
  /** Seconds for one full loop of the drift. Deliberately slow and unhurried. */
  loopSeconds: number;
  /** Fraction of the loop spent standing still rather than walking. */
  restFraction: number;
  /** Phase offset so three people are never in step with one another. */
  phase: number;
}

/**
 * Three routes, one per place the player actually spends time: the village
 * market, the inn approach, and the harbor apron. Every station — and the
 * whole drift ellipse around it — was solved against the full keep-out set:
 * market and harbor market radii, every building envelope, every workstation
 * approach, the farmhouse door, and `HARBOR_DOCK.playerPosition`. They also
 * sit on walkable, non-water, sub-38-degree ground at all four phases. The
 * accompanying test re-solves those constraints, so moving a station without
 * re-checking fails rather than quietly blocking a doorway.
 */
export const AMBIENT_TOWNSFOLK_ROUTES: readonly AmbientTownsfolkRoute[] = [
  {
    id: "townsfolk.market_shopper",
    assetId: ASSET_IDS.CHAR_NPC_MAEVE_A,
    stations: {
      dawn: { x: 53.2, z: -43.7 },
      day: { x: 52.6, z: -43.7 },
      dusk: { x: 50.2, z: -44.3 },
      night: { x: 49.0, z: -44.9 }
    },
    radiusMeters: 1.6,
    loopSeconds: 26,
    restFraction: 0.45,
    phase: 0
  },
  {
    id: "townsfolk.inn_regular",
    assetId: ASSET_IDS.CHAR_NPC_BARNABY_A,
    stations: {
      dawn: { x: 61.3, z: -45.5 },
      day: { x: 61.9, z: -45.5 },
      dusk: { x: 64.3, z: -45.5 },
      night: { x: 64.9, z: -45.5 }
    },
    radiusMeters: 1.4,
    loopSeconds: 31,
    restFraction: 0.6,
    phase: 0.37
  },
  {
    id: "townsfolk.dock_hand",
    assetId: ASSET_IDS.CHAR_NPC_SILAS_A,
    stations: {
      dawn: { x: 66.4, z: 51.6 },
      day: { x: 65.8, z: 51.6 },
      dusk: { x: 62.2, z: 51.6 },
      night: { x: 61.6, z: 51.6 }
    },
    radiusMeters: 1.5,
    loopSeconds: 23,
    restFraction: 0.4,
    phase: 0.71
  }
] as const;

export interface AmbientTownsfolkPose {
  x: number;
  z: number;
  heading: number;
  walking: boolean;
}

/**
 * Where one villager stands at a given moment. Pure and clock-derived: the
 * same seconds always produce the same pose, so nothing here needs saving.
 *
 * The drift is a slow ellipse with a rest arc, which reads as someone browsing
 * or waiting rather than patrolling a circle.
 */
export function sampleAmbientTownsfolkPose(
  route: AmbientTownsfolkRoute,
  clock: Pick<ClockState, "timeOfDay">,
  seconds: number,
  motionScale = 1
): AmbientTownsfolkPose {
  const station = route.stations[clock.timeOfDay];
  if (motionScale <= 0) {
    return { x: station.x, z: station.z, heading: 0, walking: false };
  }
  const cycle = ((seconds * motionScale) / route.loopSeconds + route.phase) % 1;
  const resting = cycle >= 1 - route.restFraction;
  // Walk across the moving arc, then stand still for the rest of the loop.
  const travel = resting ? 1 : cycle / Math.max(1e-6, 1 - route.restFraction);
  const angle = travel * Math.PI * 2;
  const x = station.x + Math.cos(angle) * route.radiusMeters;
  const z = station.z + Math.sin(angle) * route.radiusMeters * 0.7;
  const heading = Math.atan2(-Math.sin(angle) * route.radiusMeters, Math.cos(angle) * route.radiusMeters * 0.7);
  return { x, z, heading, walking: !resting };
}
