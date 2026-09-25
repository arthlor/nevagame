import { MAINLAND_BROOK_COURSES } from "./MainlandBrooks.generated";
import type { WorldPoint } from "./WorldLayout";

/**
 * Mountain brooks of the mainland: courses traced by
 * `tools/world/mainlandBrookTracer.ts` down the drainage of the natural ground
 * into the forest lake, the river and the sea. A brook is shallow running
 * water in a cut gravel bed. It is terrain and presentation, not canonical
 * water: it is walkable and wadeable, holds no fishing habitat and never
 * blocks a route. The bed falls monotonically downstream and meets its trunk
 * or the water level at the mouth.
 */
export interface MainlandBrookSample {
  id: string;
  /** Distance from the brook's centre line. */
  distance: number;
  /** Half the width of the running water. */
  halfWidth: number;
  /** Bed and water-surface elevation at the nearest point of the course. */
  bed: number;
  surface: number;
  /** Unit downstream direction. */
  direction: WorldPoint;
  /** Catchment draining through this point, in hectares. */
  hectares: number;
}

/** Catchment at which the tracer starts a brook; widths and depths scale from it. */
const SOURCE_HECTARES = 0.15;
const HALF_WIDTH_BASE_METERS = 0.45;
const HALF_WIDTH_GAIN_METERS = 0.22;
const DEPTH_BASE_METERS = 0.16;
const DEPTH_GAIN_METERS = 0.06;
const DEPTH_MAX_METERS = 0.42;
/**
 * The channel floor is never narrower than this half-width. The mainland
 * terrain grid is 3.125 m, so a floor cut only as wide as the water would
 * alias to a broken trench and the water would sink under the grid's
 * triangles; a floor wider than a grid cell always carries it.
 */
const FLOOR_HALF_WIDTH_MIN_METERS = 2.4;
/** A gentle U across the floor, then banks cut at this grade until they meet the ground. */
const FLOOR_CROWN_METERS = 0.12;
const BANK_GRADE = 0.5;
/** Rounds the crease where a cut bank meets the ground above it. */
const BANK_ROUNDING_METERS = 0.8;
/** Where the bed stands above the ground, the floor's embankment falls away at this grade. */
const EMBANKMENT_GRADE = 0.45;
/** Metres of embankment a segment gives up for each metre it is farther than the nearest. */
const EMBANKMENT_PREFERENCE = 1.5;
/** Nothing beyond this distance from the floor's edge is reshaped; the cut eases out from the start distance. */
const REACH_METERS = 10;
const REACH_FADE_START_METERS = 3;
const CELL_METERS = 24;
/**
 * A road crosses a brook on its deck and the water passes under it in a
 * culvert, whose headwall face stands this far past the deck's edge. The
 * brook's cut stops behind that face (`mainlandRoadDeckAt`).
 */
export const MAINLAND_BROOK_CULVERT_FACE_METERS = 0.95;

export function mainlandBrookHalfWidth(hectares: number): number {
  return HALF_WIDTH_BASE_METERS + HALF_WIDTH_GAIN_METERS * Math.sqrt(hectares / SOURCE_HECTARES);
}

/** Half-width of the channel floor the water runs on. */
export function mainlandBrookFloorHalfWidth(hectares: number): number {
  return Math.max(FLOOR_HALF_WIDTH_MIN_METERS, mainlandBrookHalfWidth(hectares) + 0.6);
}

export function mainlandBrookDepth(hectares: number): number {
  return Math.min(DEPTH_MAX_METERS, DEPTH_BASE_METERS + DEPTH_GAIN_METERS * Math.sqrt(hectares / SOURCE_HECTARES));
}

interface BrookSegment {
  id: string;
  ax: number; az: number; bx: number; bz: number;
  aBed: number; bBed: number;
  aHectares: number; bHectares: number;
  lengthSquared: number;
  direction: WorldPoint;
  /** Grade the bed rises at upstream of the segment's start: its own or the reach above's, whichever is steeper. */
  riseGrade: number;
}

const SEGMENTS: BrookSegment[] = MAINLAND_BROOK_COURSES.flatMap(course => {
  const grade = (i: number): number => {
    const a = course.knots[i - 1], b = course.knots[i];
    return Math.max(0, (a[2] - b[2]) / Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1])));
  };
  return course.knots.slice(1).map((b, index) => {
    const a = course.knots[index];
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.max(1e-9, Math.hypot(dx, dz));
    return { id: course.id, ax: a[0], az: a[1], bx: b[0], bz: b[1], aBed: a[2], bBed: b[2],
      aHectares: a[3], bHectares: b[3], lengthSquared: dx * dx + dz * dz,
      direction: { x: dx / length, z: dz / length },
      riseGrade: Math.max(grade(index + 1), index > 0 ? grade(index) : 0) };
  });
});

const CELLS = new Map<string, BrookSegment[]>();
for (const segment of SEGMENTS) {
  const reach = REACH_METERS + mainlandBrookFloorHalfWidth(Math.max(segment.aHectares, segment.bHectares));
  const minX = Math.floor((Math.min(segment.ax, segment.bx) - reach) / CELL_METERS);
  const maxX = Math.floor((Math.max(segment.ax, segment.bx) + reach) / CELL_METERS);
  const minZ = Math.floor((Math.min(segment.az, segment.bz) - reach) / CELL_METERS);
  const maxZ = Math.floor((Math.max(segment.az, segment.bz) + reach) / CELL_METERS);
  for (let gx = minX; gx <= maxX; gx++) for (let gz = minZ; gz <= maxZ; gz++) {
    const key = `${gx}:${gz}`, bucket = CELLS.get(key) ?? [];
    bucket.push(segment);
    CELLS.set(key, bucket);
  }
}

function sampleSegment(segment: BrookSegment, x: number, z: number): MainlandBrookSample {
  const along = ((x - segment.ax) * (segment.bx - segment.ax) + (z - segment.az) * (segment.bz - segment.az)) / segment.lengthSquared;
  const t = Math.max(0, Math.min(1, along));
  const px = segment.ax + (segment.bx - segment.ax) * t, pz = segment.az + (segment.bz - segment.az) * t;
  const hectares = segment.aHectares + (segment.bHectares - segment.aHectares) * t;
  const bed = segment.aBed + (segment.bBed - segment.aBed) * t;
  return { id: segment.id, distance: Math.hypot(x - px, z - pz), halfWidth: mainlandBrookHalfWidth(hectares),
    bed, surface: bed + mainlandBrookDepth(hectares), direction: segment.direction, hectares };
}

/**
 * Bed a segment's channel is cut to at a point. Upstream of its start the
 * bed carries on rising as fast as the reach above it does: held at the
 * start value, or rising only at a gentler reach's grade below a cascade,
 * the segment would ring its start with a bank lower than the floor just
 * upstream and undercut it.
 */
function channelBed(segment: BrookSegment, x: number, z: number, bed: number): number {
  const along = ((x - segment.ax) * (segment.bx - segment.ax) + (z - segment.az) * (segment.bz - segment.az)) / segment.lengthSquared;
  if (along >= 0) return bed;
  return bed - along * Math.sqrt(segment.lengthSquared) * segment.riseGrade;
}

/**
 * The brook whose water is nearest, measured from its edge, or null when no
 * brook reaches this far (at most the distance the channel reshapes the
 * ground). Joined brooks share their confluence exactly.
 */
export function mainlandBrookAt(x: number, z: number, reach = REACH_METERS): MainlandBrookSample | null {
  const candidates = CELLS.get(`${Math.floor(x / CELL_METERS)}:${Math.floor(z / CELL_METERS)}`);
  if (!candidates) return null;
  let best: MainlandBrookSample | null = null;
  for (const segment of candidates) {
    const sample = sampleSegment(segment, x, z);
    const edge = sample.distance - sample.halfWidth;
    if (edge > reach) continue;
    if (!best || edge < best.distance - best.halfWidth) best = sample;
  }
  return best;
}

function smoothMin(a: number, b: number, k: number): number {
  const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
  return b + (a - b) * h - k * h * (1 - h);
}

/**
 * Ground cut to a brook channel: a floor with a slight U under the water,
 * banks cut at a steady grade until they meet the ground and rounded where
 * they do, and, where the graded bed stands above the ground, a low
 * embankment under the floor that falls away beside it. The channel surface is the
 * lowest of every nearby segment's, so joined brooks cut their confluence
 * once and a course that bends back on itself keeps its lower reach's bank
 * rather than stepping where the nearest segment changes. The bank rounding
 * is applied once to that surface. `deckAt` (0 to 1, asked only near a brook)
 * keeps a road deck at its own grade where a culvert carries the road across.
 */
export function mainlandBrookCarvedHeight(
  x: number, z: number, ground: number, deckAt?: (x: number, z: number) => number
): number {
  const candidates = CELLS.get(`${Math.floor(x / CELL_METERS)}:${Math.floor(z / CELL_METERS)}`);
  if (!candidates) return ground;
  let channel = Infinity, nearest = Infinity;
  const embankments: { distance: number; height: number }[] = [];
  for (const segment of candidates) {
    const sample = sampleSegment(segment, x, z);
    const floorHalfWidth = mainlandBrookFloorHalfWidth(sample.hectares);
    const edge = sample.distance - floorHalfWidth;
    if (edge > REACH_METERS) continue;
    const across = Math.min(1, sample.distance / floorHalfWidth);
    const surface = channelBed(segment, x, z, sample.bed) + FLOOR_CROWN_METERS * across * across + Math.max(0, edge) * BANK_GRADE;
    // Each segment's cut eases back into the ground before its own reach
    // ends, so no segment's cut can stop in a step where it drops out. The
    // ease is long: across a side slope as steep as the bank, the bank never
    // meets the ground and the whole cut is eased out here.
    const fade = smoothstepRange(REACH_FADE_START_METERS, REACH_METERS, edge);
    channel = Math.min(channel, surface + Math.max(0, ground - surface) * fade);
    // Where the graded bed stands above the ground, the floor is carried on
    // a low embankment that falls away from its edge at a steady grade.
    embankments.push({ distance: sample.distance, height: edge <= 0 ? Math.min(surface, sample.bed + FLOOR_CROWN_METERS)
      : sample.bed + FLOOR_CROWN_METERS - edge * EMBANKMENT_GRADE });
    nearest = Math.min(nearest, sample.distance);
  }
  // Only the reach a point stands beside may carry it: a steep brook's bed
  // upstream always stands above the ground beside its lower reach, and would
  // otherwise raise a levee there. Farther segments give way continuously.
  let embankment = -Infinity;
  for (const entry of embankments) {
    embankment = Math.max(embankment, entry.height - (entry.distance - nearest) * EMBANKMENT_PREFERENCE);
  }
  if (channel === Infinity) return ground;
  const deck = deckAt ? deckAt(x, z) : 0;
  if (deck >= 1) return ground;
  const carved = Math.max(smoothMin(ground, channel, BANK_ROUNDING_METERS), Math.min(embankment, channel));
  return ground + (carved - ground) * (1 - deck);
}

function smoothstepRange(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Every course, downstream, for presentation and dressing. */
export function mainlandBrookCourses(): typeof MAINLAND_BROOK_COURSES {
  return MAINLAND_BROOK_COURSES;
}
