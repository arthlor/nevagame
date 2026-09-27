/**
 * Road classes: the one owner of how wide each kind of road is and how it is
 * built across. A width follows the traffic a class carries — the horse
 * carriage on cart roads and farm lanes, people on foot on footpaths — so the
 * visible road, terrain grading, cover clearance, map and collider all agree.
 *
 * `WorldLayout`, `NevaMainland`, `SunreachWorld`, `FarmLayout` and the road
 * router read these numbers; no route carries a width of its own.
 */
export type RoadClassId = "arterial" | "lane" | "trail";

/**
 * Wheel spacing of the horse carriage, the only wheeled traffic: the published
 * `prop_merchant_carriage_a` stands its wheels at ±0.94 m. Wheel tracks are
 * worn at this spacing on every class that carries it.
 */
export const ROAD_WHEEL_GAUGE_METERS = 1.88;

export interface RoadClassProfile {
  /** Packed running surface, edge to edge. */
  widthMeters: number;
  /** Rise of the centre above the packed edge; the collider carries it. */
  crownMeters: number;
  shoulderDropMeters: number;
  /** Loose, lighter earth beyond the packed edge, before the grass. */
  shoulderWidthMeters: number;
  /** Visible feather beyond the shoulder over which the worked earth dissolves into the meadow. */
  terrainFeatherMeters: number;
  /**
   * Graded bench beyond the visible feather. The earthwork is wider than the
   * road, as on a real road, so a side-slope never pokes through the running
   * surface.
   */
  benchMeters: number;
  gradingStrength: number;
}

/**
 * - Cart road (`arterial`): the carriage (2.05 m) with a comfortable margin.
 * - Farm lane (`lane`): the carriage just fits; grass grows between its tracks.
 * - Footpath (`trail`): one walker's width, worn down the middle.
 */
export const ROAD_CLASS_PROFILES: Readonly<Record<RoadClassId, Readonly<RoadClassProfile>>> = Object.freeze({
  arterial: Object.freeze({
    widthMeters: 2.8,
    crownMeters: 0.08,
    shoulderDropMeters: 0.012,
    shoulderWidthMeters: 0.45,
    terrainFeatherMeters: 0.9,
    benchMeters: 1.4,
    gradingStrength: 0.9
  }),
  lane: Object.freeze({
    widthMeters: 2.4,
    crownMeters: 0.06,
    shoulderDropMeters: 0.01,
    shoulderWidthMeters: 0.35,
    terrainFeatherMeters: 0.8,
    benchMeters: 1.2,
    gradingStrength: 0.78
  }),
  trail: Object.freeze({
    widthMeters: 1.2,
    crownMeters: 0.025,
    shoulderDropMeters: 0.005,
    shoulderWidthMeters: 0.25,
    terrainFeatherMeters: 0.6,
    benchMeters: 0.6,
    gradingStrength: 0.58
  })
});

/** Packed width of a road class. */
export function roadClassWidth(kind: RoadClassId): number {
  return ROAD_CLASS_PROFILES[kind].widthMeters;
}
