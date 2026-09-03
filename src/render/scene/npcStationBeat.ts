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

export const NPC_STATION_BEATS: Readonly<Record<string, NpcStationBeatSpec>> = {
  "npc.elspeth": {
    waypoints: [
      { dx: 0, dz: 0 },
      { dx: 0.88, dz: 0.28 },
      { dx: -0.32, dz: 0.86 }
    ],
    pauseSeconds: 1.15,
    walkSpeedMetersPerSecond: NPC_STATION_WALK_SPEED_METERS_PER_SECOND
  },
  "npc.barnaby": {
    waypoints: [
      { dx: 0, dz: 0 },
      { dx: 0.72, dz: -0.48 },
      { dx: 0.18, dz: 0.92 }
    ],
    pauseSeconds: 1.2,
    walkSpeedMetersPerSecond: NPC_STATION_WALK_SPEED_METERS_PER_SECOND
  },
  "npc.silas": {
    waypoints: [
      { dx: 0, dz: 0 },
      { dx: 0.96, dz: 0.12 },
      { dx: 0.42, dz: -0.7 }
    ],
    pauseSeconds: 1.25,
    walkSpeedMetersPerSecond: NPC_STATION_WALK_SPEED_METERS_PER_SECOND
  },
  "npc.maeve": {
    waypoints: [
      { dx: 0, dz: 0 },
      { dx: -0.78, dz: 0.38 },
      { dx: 0.54, dz: 0.72 }
    ],
    pauseSeconds: 1.1,
    walkSpeedMetersPerSecond: NPC_STATION_WALK_SPEED_METERS_PER_SECOND
  },
  // Sunreach shipped without beats, so both islanders stood perfectly still
  // while every Neva NPC moved. Tomas works a mooring, so he paces the
  // landing; Ines tends terraces, so she moves along a row.
  "npc.tomas": {
    waypoints: [
      { dx: 0, dz: 0 },
      { dx: 0.84, dz: -0.36 },
      { dx: -0.24, dz: -0.9 }
    ],
    pauseSeconds: 1.3,
    walkSpeedMetersPerSecond: NPC_STATION_WALK_SPEED_METERS_PER_SECOND
  },
  "npc.ines": {
    waypoints: [
      { dx: 0, dz: 0 },
      { dx: -0.66, dz: 0.62 },
      { dx: 0.7, dz: 0.5 }
    ],
    pauseSeconds: 1.4,
    walkSpeedMetersPerSecond: NPC_STATION_WALK_SPEED_METERS_PER_SECOND
  }
};

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
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
 * Loops walk-then-pause around authored offsets. Distances stay inside the
 * talk radius so `npc.anchor` remains the canonical interaction point.
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

  const segments: Array<{ duration: number; from: number; to: number; walking: boolean }> = [];
  for (let index = 0; index < waypoints.length; index += 1) {
    const from = waypoints[index];
    const to = waypoints[wrapIndex(index + 1, waypoints.length)];
    const distance = Math.hypot(to.dx - from.dx, to.dz - from.dz);
    const walkDuration = distance / Math.max(0.05, spec.walkSpeedMetersPerSecond);
    segments.push({ duration: walkDuration, from: index, to: wrapIndex(index + 1, waypoints.length), walking: true });
    segments.push({ duration: spec.pauseSeconds, from: wrapIndex(index + 1, waypoints.length), to: wrapIndex(index + 1, waypoints.length), walking: false });
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
    const t = segment.walking && segment.duration > 0 ? remaining / segment.duration : 0;
    const dx = from.dx + (to.dx - from.dx) * t;
    const dz = from.dz + (to.dz - from.dz) * t;
    const heading = Math.atan2(to.dx - from.dx, to.dz - from.dz);
    return { dx, dz, heading, walking: segment.walking && t < 0.999 };
  }
  const last = waypoints[waypoints.length - 1];
  return { dx: last.dx, dz: last.dz, heading: 0, walking: false };
}
