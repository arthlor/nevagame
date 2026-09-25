// src/render/scene/ambientTownsfolk.ts

import type { ClockState } from "../../simulation/core/types";
import { ASSET_IDS } from "../assets/AssetCatalog";
import { MAINLAND_VILLAGES } from "../../world/NevaMainland";
import { SUNREACH_TOWNSFOLK_ROUTES } from "./sunreachTownsfolk";

const MAINLAND_TOWNSFOLK: readonly AmbientTownsfolkRoute[] = Object.values(MAINLAND_VILLAGES).flatMap((village, villageIndex) =>
  [-1, 1].map((side, index) => {
    const x = village.market.x + side * 15;
    const z = village.market.z - (side < 0 ? 7 : 8);
    return {
      id: `townsfolk.${village.id}.${side < 0 ? "yard-worker" : "neighbour"}`,
      assetId: side < 0 ? "char_npc_tomas_b" : "char_npc_elspeth_b",
      stations: {
        dawn: { x: x - 0.3, z: z + 0.4 }, day: { x, z },
        dusk: { x: x + 0.4, z: z - 0.2 }, night: { x: x - 0.4, z: z - 0.3 }
      },
      waypoints: [
        { dx: 0, dz: 0 }, { dx: 1.15, dz: 0.45 },
        { dx: 0.5, dz: 1.3 }, { dx: -0.8, dz: 0.7 }, { dx: -1.1, dz: -0.35 }
      ],
      radiusMeters: 1.45,
      loopSeconds: 20 + villageIndex * 2 + index * 3,
      restFraction: 0.52 + index * 0.08,
      phase: (villageIndex * 0.29 + index * 0.43) % 1
    };
  })
);

/**
 * Background villagers. Presentation only: they are deliberately absent from
 * `ContentRegistry.npcs`, which is the single registry every interaction
 * prompt, dialogue, quest gate, bark and telemetry path iterates — so they
 * cannot be talked to, cannot appear in a quest, and never touch a save. Their
 * character models are `collision: "none"` and they live in the environment
 * group rather than the static prefab group, so they carry no physics either.
 *
 * They exist because the village reads as a stage set: a market square and a
 * handful of dwellings with every named cast standing inside a 1.2 m circle.
 * This is scenery with legs, not content.
 */
export interface AmbientTownsfolkRoute {
  id: string;
  assetId: string;
  /**
   * Where this person is during each phase of the day. Stations sit clear of
   * doors, stalls, workstations and the dock boarding point; the waypoint ring
   * keeps the drift inside that clearance.
   */
  stations: Record<ClockState["timeOfDay"], { x: number; z: number }>;
  /**
   * Closed loop of offsets around the station. A multi-point ring with eased
   * legs reads as someone browsing, tending or waiting rather than a perfect
   * ellipse; `radiusMeters` is the authored clearance bound (the largest
   * offset) the keep-out test relies on.
   */
  waypoints: readonly { dx: number; dz: number }[];
  radiusMeters: number;
  /** Seconds for one full walk-and-rest cycle. */
  loopSeconds: number;
  /** Minimum fraction spent standing; spare time goes to rest, not slow-motion walking. */
  restFraction: number;
  /** Phase offset so the villagers are never in step with one another. */
  phase: number;
}

/**
 * One route per place the player actually spends time: the village market, the
 * inn approach, the harbor apron, the square's well and kitchen garden, and
 * the mill. Every station — and the whole waypoint ring around it — was solved
 * against the full keep-out set: market and harbor market radii, every
 * building envelope, every workstation approach, the farmhouse door, and
 * `HARBOR_DOCK.playerPosition`. They also sit on walkable, non-water, sub-38°
 * ground at all four phases. The accompanying test re-solves those constraints,
 * so moving a station without re-checking fails rather than quietly blocking a
 * doorway.
 */
export const AMBIENT_TOWNSFOLK_ROUTES: readonly AmbientTownsfolkRoute[] = [
  {
    id: "townsfolk.market_shopper",
    assetId: "char_npc_maeve_b",
    stations: {
      dawn: { x: 49.5, z: -69.5 },
      day: { x: 48.8, z: -70.5 },
      dusk: { x: 47.6, z: -71.2 },
      // East of the dusk pose: the old night station's ring dipped 2 cm
      // inside the market's 6 m interaction ring.
      night: { x: 47.2, z: -70.0 }
    },
    waypoints: [
      { dx: 0, dz: 0 },
      { dx: 1.1, dz: -0.3 },
      { dx: 0.6, dz: -1.1 },
      { dx: -0.5, dz: -0.9 },
      { dx: -1.1, dz: 0.1 }
    ],
    radiusMeters: 1.3,
    loopSeconds: 26,
    restFraction: 0.45,
    phase: 0
  },
  {
    id: "townsfolk.inn_regular",
    assetId: "char_npc_barnaby_b",
    stations: {
      dawn: { x: 61.3, z: -45.5 },
      day: { x: 61.9, z: -45.5 },
      dusk: { x: 64.3, z: -45.5 },
      night: { x: 64.9, z: -45.5 }
    },
    waypoints: [
      { dx: 0, dz: 0 },
      { dx: 0.9, dz: 0.4 },
      { dx: 0.4, dz: 1.0 },
      { dx: -0.7, dz: 0.6 },
      { dx: -0.9, dz: -0.3 }
    ],
    radiusMeters: 1.1,
    // Kept above the animator's 0.6 playback floor: the previous 31 s loop
    // retimed the amble to ~0.5x and read as a slow-motion slide.
    loopSeconds: 24,
    restFraction: 0.6,
    phase: 0.37
  },
  {
    id: "townsfolk.dock_hand",
    assetId: "char_npc_silas_b",
    stations: {
      dawn: { x: 66.4, z: 51.6 },
      day: { x: 65.8, z: 51.6 },
      dusk: { x: 62.2, z: 51.6 },
      night: { x: 61.6, z: 51.6 }
    },
    waypoints: [
      { dx: 0, dz: 0 },
      { dx: 1.0, dz: 0.3 },
      { dx: 0.5, dz: 1.0 },
      { dx: -0.6, dz: 0.7 },
      { dx: -0.9, dz: -0.2 }
    ],
    radiusMeters: 1.1,
    // As above: 23 s drifted at ~0.48x cadence and looked like dragging.
    loopSeconds: 17,
    restFraction: 0.4,
    phase: 0.71
  },
  {
    id: "townsfolk.well_keeper",
    assetId: "char_npc_elspeth_b",
    stations: {
      // Southwest of the village well: the compact square packs the well
      // inside the market's 6 m interaction ring, so tending the well itself
      // reads as standing on the stall counter. These stations pace the open
      // ground southwest of the well, clear of the market ring, buildings and
      // workstations at every phase and ring pose.
      dawn: { x: 35.8, z: -78.6 },
      day: { x: 35.2, z: -79.1 },
      dusk: { x: 34.7, z: -79.6 },
      night: { x: 35.5, z: -79.8 }
    },
    waypoints: [
      { dx: 0, dz: 0 },
      { dx: 0.9, dz: 0.4 },
      { dx: 0.5, dz: 1.0 },
      { dx: -0.4, dz: 0.8 },
      { dx: -0.8, dz: -0.2 }
    ],
    radiusMeters: 1.1,
    loopSeconds: 30,
    restFraction: 0.5,
    phase: 0.18
  },
  {
    id: "townsfolk.gardener",
    assetId: "char_npc_ines_b",
    stations: {
      dawn: { x: 46.6, z: -74.3 },
      day: { x: 46.0, z: -75.0 },
      dusk: { x: 45.4, z: -75.7 },
      night: { x: 46.2, z: -76.1 }
    },
    waypoints: [
      { dx: 0, dz: 0 },
      { dx: 0.9, dz: 0.3 },
      { dx: 0.6, dz: 0.9 },
      { dx: -0.4, dz: 0.9 },
      { dx: -0.8, dz: 0.0 }
    ],
    radiusMeters: 1.1,
    loopSeconds: 28,
    restFraction: 0.55,
    phase: 0.44
  },
  {
    id: "townsfolk.mill_hand",
    assetId: "char_npc_tomas_b",
    stations: {
      dawn: { x: 61.4, z: -66.6 },
      day: { x: 62.0, z: -67.0 },
      dusk: { x: 62.6, z: -67.8 },
      night: { x: 61.8, z: -68.2 }
    },
    waypoints: [
      { dx: 0, dz: 0 },
      { dx: 0.9, dz: 0.3 },
      { dx: 0.5, dz: 1.0 },
      { dx: -0.5, dz: 0.8 },
      { dx: -0.9, dz: -0.1 }
    ],
    radiusMeters: 1.1,
    loopSeconds: 21,
    restFraction: 0.45,
    phase: 0.56
  },
  ...MAINLAND_TOWNSFOLK,
  ...SUNREACH_TOWNSFOLK_ROUTES
];

export interface AmbientTownsfolkPose {
  x: number;
  z: number;
  heading: number;
  walking: boolean;
}

const AMBIENT_WALK_SPEED_METERS_PER_SECOND = 0.95;

/**
 * Where one villager stands at a given moment. Pure and clock-derived: the
 * same seconds always produce the same pose, so nothing here needs saving.
 *
 * The drift walks a closed ring around the station and then rests,
 * which reads as someone browsing or waiting rather than patrolling a circle.
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
  const waypoints = route.waypoints;
  const count = waypoints.length;
  if (count === 0) {
    return { x: station.x, z: station.z, heading: 0, walking: false };
  }
  let totalLength = 0;
  for (let index = 0; index < count; index += 1) {
    const from = waypoints[index];
    const to = waypoints[(index + 1) % count];
    totalLength += Math.hypot(to.dx - from.dx, to.dz - from.dz);
  }
  const cycle = ((seconds * motionScale) / route.loopSeconds + route.phase) % 1;
  const walkFraction = Math.min(
    1 - route.restFraction,
    totalLength / AMBIENT_WALK_SPEED_METERS_PER_SECOND / route.loopSeconds
  );
  const resting = cycle >= walkFraction;
  // Traverse the ring at a readable gait, then use any spare cycle time for
  // rest. Constant speed through corners prevents a fresh footfall at every
  // short waypoint edge.
  const travel = resting ? 1 : cycle / Math.max(1e-6, walkFraction);
  let target = travel * totalLength;
  let segmentIndex = 0;
  let localT = 0;
  for (let index = 0; index < count; index += 1) {
    const from = waypoints[index];
    const to = waypoints[(index + 1) % count];
    const length = Math.hypot(to.dx - from.dx, to.dz - from.dz);
    if (target <= length || index === count - 1) {
      segmentIndex = index;
      localT = length > 0 ? Math.min(1, target / length) : 0;
      break;
    }
    target -= length;
  }
  const from = waypoints[segmentIndex];
  const to = waypoints[(segmentIndex + 1) % count];
  const dx = from.dx + (to.dx - from.dx) * localT;
  const dz = from.dz + (to.dz - from.dz) * localT;
  const heading = Math.atan2(to.dx - from.dx, to.dz - from.dz);
  return { x: station.x + dx, z: station.z + dz, heading, walking: !resting };
}

/**
 * Ambient animals: the dog and the cat that live in the village.
 *
 * They reuse `AmbientTownsfolkRoute` and `sampleAmbientTownsfolkPose` wholesale,
 * because "drift around a station that moves with the day" is exactly the same
 * problem whether the thing drifting is a villager or a dog. What differs is the
 * animation: townsfolk are humanoids driven by `HumanoidAnimator`, while these
 * are catalog fauna with their own authored clips, so they carry the clip names
 * the runtime should play when walking, when standing and when settled for the
 * night, and `WorldScene` drives them with a plain mixer instead.
 *
 * Like the townsfolk they are deliberately absent from `ContentRegistry.npcs`,
 * carry no collision and never touch a save.
 */
export interface AmbientAnimalRoute extends AmbientTownsfolkRoute {
  /** Clip played while the drift is moving. */
  walkClip: string;
  /** Clip played while the drift is standing still. */
  idleClip: string;
  /** Clip played at the night station instead of `idleClip`. */
  restClip: string;
  /** Metres per second the walk clip was authored for. */
  walkReferenceSpeed: number;
}

export const AMBIENT_ANIMAL_ROUTES: readonly AmbientAnimalRoute[] = [
  {
    // The village dog works the square: the market frontage by day, the inn
    // approach at dusk, curled by the well after dark. Every station and its
    // whole drift ring sits clear of the market ring, the crossing, the
    // building envelopes and the townsfolk stations.
    id: "animal.village_dog",
    assetId: ASSET_IDS.FAUNA_DOG_A,
    walkClip: "walk",
    idleClip: "idle",
    restClip: "sit",
    walkReferenceSpeed: 1.1,
    stations: {
      dawn: { x: 43.6, z: -61.2 },
      day: { x: 46.4, z: -63.4 },
      dusk: { x: 52.6, z: -57.8 },
      // The old night station sat inside the produce market's 6 m interaction
      // ring, so a sleeping dog would have been lying across the stall counter.
      // The inn porch is where a village dog actually settles after dark.
      night: { x: 57.4, z: -44.2 }
    },
    waypoints: [
      { dx: 0, dz: 0 },
      { dx: 1.6, dz: 0.5 },
      { dx: 1.1, dz: 1.7 },
      { dx: -0.7, dz: 1.5 },
      { dx: -1.5, dz: 0.2 }
    ],
    // The largest waypoint offset, which is the bound every keep-out in the
    // village-life test is solved against.
    radiusMeters: 2.05,
    // A dog covers its ring faster than a browsing villager does.
    loopSeconds: 19,
    restFraction: 0.34,
    phase: 0.11
  },
  {
    // The mill cat: sunning on the mill yard by day, prowling the grain sacks
    // at dusk, asleep on the warm south side of the mill at night.
    id: "animal.mill_cat",
    assetId: ASSET_IDS.FAUNA_CAT_A,
    walkClip: "walk",
    idleClip: "idle",
    restClip: "sleep",
    walkReferenceSpeed: 0.9,
    stations: {
      dawn: { x: 58.8, z: -70.4 },
      day: { x: 57.4, z: -69.2 },
      dusk: { x: 59.6, z: -72.6 },
      night: { x: 60.2, z: -74.8 }
    },
    waypoints: [
      { dx: 0, dz: 0 },
      { dx: 1.2, dz: 0.4 },
      { dx: 0.8, dz: 1.2 },
      { dx: -0.6, dz: 1.0 },
      { dx: -1.1, dz: -0.2 }
    ],
    // As above: the bound is the largest waypoint offset, not a round number.
    radiusMeters: 1.45,
    loopSeconds: 27,
    restFraction: 0.58,
    phase: 0.63
  }
];
