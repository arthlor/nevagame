import type { ClockState } from "../../simulation/core/types";

export const NPC_STATION_BEAT_RADIUS_METERS = 1.2;
export const NPC_STATION_WALK_SPEED_METERS_PER_SECOND = 1.45;

export interface NpcStationWaypoint {
  dx: number;
  dz: number;
}

export interface NpcStationBeatSpec {
  waypoints: readonly NpcStationWaypoint[];
  pauseSeconds: number;
  walkSpeedMetersPerSecond: number;
}

export interface NpcStationBeatSample {
  dx: number;
  dz: number;
  heading: number;
  walking: boolean;
}

/** Transient presentation clock: dialogue and culled actors pause in place. */
export interface NpcStationBeatState {
  elapsedSeconds: number;
  sample: NpcStationBeatSample;
}

export function createNpcStationBeatState(): NpcStationBeatState {
  return { elapsedSeconds: 0, sample: { dx: 0, dz: 0, heading: 0, walking: false } };
}

/**
 * Smoothstep progress: velocity eases in from rest and out to rest across a
 * leg, so a villager leans into a stride and settles at a corner instead of
 * teleporting between constant-velocity steps. The average slope stays 1, so
 * a leg still takes `distance / walkSpeed` seconds and the measured speed the
 * animator retimes against peaks softly at mid-leg.
 */
function easedProgress(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

export function advanceNpcStationBeat(
  spec: NpcStationBeatSpec | undefined,
  state: NpcStationBeatState,
  deltaSeconds: number,
  paused: boolean,
  canOccupy: (dx: number, dz: number) => boolean
): NpcStationBeatSample {
  if (!spec || paused || deltaSeconds <= 0) return { ...state.sample, walking: false };
  const elapsed = state.elapsedSeconds + deltaSeconds;
  // Follow the authored path, including any corners crossed during the frame.
  // Endpoint-only checks can jump across an unsupported bank at low frame rates.
  const steps = Math.max(1, Math.ceil(deltaSeconds * spec.walkSpeedMetersPerSecond / 0.12));
  for (let index = 1; index <= steps; index += 1) {
    const alongPath = sampleNpcStationBeat(spec, state.elapsedSeconds + deltaSeconds * index / steps);
    if (!canOccupy(alongPath.dx, alongPath.dz)) {
      return { ...state.sample, walking: false };
    }
  }
  const next = sampleNpcStationBeat(spec, elapsed);
  state.elapsedSeconds = elapsed;
  state.sample = next;
  return next;
}

/**
 * Four-point beats read as a person moving around a small working area rather
 * than tracing a triangle. Every offset stays inside the 1.2 m station disk so
 * the actor never leaves interaction range of its clock-derived anchor.
 */
export const NPC_STATION_BEATS: Readonly<Record<string, NpcStationBeatSpec>> = {
  "npc.elspeth": {
    waypoints: [
      { dx: 0, dz: 0 },
      { dx: 0.9, dz: 0.2 },
      { dx: 0.55, dz: 0.95 },
      { dx: -0.25, dz: 0.85 }
    ],
    pauseSeconds: 1.15,
    // Speeds sit near each model's authored walk reference speed so the shared
    // animator runs the cycle at roughly 1x cadence instead of retiming it.
    walkSpeedMetersPerSecond: 1.15
  },
  "npc.barnaby": {
    waypoints: [
      { dx: 0, dz: 0 },
      { dx: 0.75, dz: -0.45 },
      { dx: 0.85, dz: 0.3 },
      { dx: 0.15, dz: 0.9 }
    ],
    pauseSeconds: 1.2,
    walkSpeedMetersPerSecond: 1.38
  },
  "npc.silas": {
    waypoints: [
      { dx: 0, dz: 0 },
      { dx: 0.95, dz: 0.1 },
      { dx: 0.75, dz: -0.65 },
      { dx: 0.2, dz: -0.85 }
    ],
    pauseSeconds: 1.25,
    walkSpeedMetersPerSecond: 1.36
  },
  "npc.maeve": {
    waypoints: [
      { dx: 0, dz: 0 },
      { dx: -0.75, dz: 0.35 },
      { dx: -0.35, dz: 0.95 },
      { dx: 0.5, dz: 0.75 }
    ],
    pauseSeconds: 1.1,
    walkSpeedMetersPerSecond: 1.18
  },
  // Sunreach shipped without beats, so both islanders stood perfectly still
  // while every Neva NPC moved. Tomas works a mooring, so he paces the
  // landing; Ines tends terraces, so she moves along a row.
  "npc.tomas": {
    waypoints: [
      { dx: 0, dz: 0 },
      { dx: 0.85, dz: -0.3 },
      { dx: 0.35, dz: -0.95 },
      { dx: -0.7, dz: -0.5 }
    ],
    pauseSeconds: 1.3,
    walkSpeedMetersPerSecond: 1.38
  },
  "npc.ines": {
    waypoints: [
      { dx: 0, dz: 0 },
      { dx: -0.65, dz: 0.6 },
      { dx: -0.05, dz: 0.95 },
      { dx: 0.7, dz: 0.5 }
    ],
    pauseSeconds: 1.4,
    walkSpeedMetersPerSecond: 1.16
  }
};

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}

/** Each phase has its own local beat; all offsets remain relative to its station. */
export const NPC_SCHEDULE_BEATS = Object.fromEntries(
  Object.entries(NPC_STATION_BEATS).map(([id, home]) => [id, {
    dawn: home,
    day: { ...home, pauseSeconds: home.pauseSeconds + 0.4 },
    dusk: { ...home, pauseSeconds: home.pauseSeconds + 1.2,
      waypoints: home.waypoints.map(({ dx, dz }) => ({ dx: dx * 0.65, dz: dz * 0.65 })) },
    night: { ...home, pauseSeconds: home.pauseSeconds + 4,
      waypoints: home.waypoints.map(({ dx, dz }) => ({ dx: dx * 0.35, dz: dz * 0.35 })) }
  }])
) as Readonly<Record<string, Record<ClockState["timeOfDay"], NpcStationBeatSpec>>>;

export function npcStationBeatAt(npcId: string, clock: Pick<ClockState, "timeOfDay">): NpcStationBeatSpec | undefined {
  return NPC_SCHEDULE_BEATS[npcId]?.[clock.timeOfDay];
}

export function assertNpcStationBeatRadius(spec: NpcStationBeatSpec, radiusMeters = NPC_STATION_BEAT_RADIUS_METERS): void {
  for (const waypoint of spec.waypoints) {
    if (Math.hypot(waypoint.dx, waypoint.dz) > radiusMeters + 1e-6) {
      throw new Error(
        `[npcStationBeat] Waypoint ${waypoint.dx},${waypoint.dz} exceeds ${radiusMeters} m station radius`
      );
    }
  }
}

/**
 * Loops walk-then-pause around authored offsets, easing each leg so the body
 * accelerates from the pause and settles into the next corner. Distances stay
 * inside the talk radius of the clock-derived station returned by `npcAnchorAt`.
 */
export function sampleNpcStationBeat(
  spec: NpcStationBeatSpec,
  elapsedSeconds: number
): NpcStationBeatSample {
  assertNpcStationBeatRadius(spec);
  const waypoints = spec.waypoints;
  if (waypoints.length === 0) {
    return { dx: 0, dz: 0, heading: 0, walking: false };
  }
  if (waypoints.length === 1) {
    return { dx: waypoints[0].dx, dz: waypoints[0].dz, heading: 0, walking: false };
  }

  const segments: Array<{ duration: number; from: number; to: number; walking: boolean; heading: number }> = [];
  for (let index = 0; index < waypoints.length; index += 1) {
    const from = waypoints[index];
    const to = waypoints[wrapIndex(index + 1, waypoints.length)];
    const distance = Math.hypot(to.dx - from.dx, to.dz - from.dz);
    const walkDuration = distance / Math.max(0.05, spec.walkSpeedMetersPerSecond);
    const walkHeading = Math.atan2(to.dx - from.dx, to.dz - from.dz);
    segments.push({
      duration: walkDuration,
      from: index,
      to: wrapIndex(index + 1, waypoints.length),
      walking: true,
      heading: walkHeading
    });
    // Aim at the next leg while paused so the body turns at the corner before
    // it starts moving again, instead of rotating while already mid-stride.
    const next = waypoints[wrapIndex(index + 2, waypoints.length)];
    const pauseHeading = Math.hypot(next.dx - to.dx, next.dz - to.dz) > 1e-6
      ? Math.atan2(next.dx - to.dx, next.dz - to.dz)
      : walkHeading;
    segments.push({
      duration: spec.pauseSeconds,
      from: wrapIndex(index + 1, waypoints.length),
      to: wrapIndex(index + 1, waypoints.length),
      walking: false,
      heading: pauseHeading
    });
  }
  const cycle = segments.reduce((total, segment) => total + segment.duration, 0);
  let remaining = ((elapsedSeconds % cycle) + cycle) % cycle;
  for (const segment of segments) {
    if (remaining > segment.duration && remaining - segment.duration > 1e-9) {
      remaining -= segment.duration;
      continue;
    }
    const from = waypoints[segment.from];
    const to = waypoints[segment.to];
    const rawT = segment.walking && segment.duration > 0 ? remaining / segment.duration : 0;
    // Ease only the walk legs; the pause holds the arrival pose.
    const t = segment.walking ? easedProgress(rawT) : 0;
    const dx = from.dx + (to.dx - from.dx) * t;
    const dz = from.dz + (to.dz - from.dz) * t;
    return { dx, dz, heading: segment.heading, walking: segment.walking && rawT < 0.999 };
  }
  const last = waypoints[waypoints.length - 1];
  return { dx: last.dx, dz: last.dz, heading: 0, walking: false };
}
