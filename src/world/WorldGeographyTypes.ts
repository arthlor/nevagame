/** Narrow world-geography contracts shared by simulation and presentation. */

import type { WorldIslandId } from "./WorldIslands";

export interface WorldVec2 {
  readonly x: number;
  readonly z: number;
}

export type ShoreKind = "sand" | "rock-shelf" | "cliff" | "sheltered";

/** Coherent projection of a world position onto the nearest authoritative shoreline. */
export interface ShoreProjection {
  readonly islandId: WorldIslandId;
  readonly segmentId: string;
  readonly boundaryPointXZ: WorldVec2;
  readonly tangentXZ: WorldVec2;
  readonly waterwardNormalXZ: WorldVec2;
  readonly signedDistanceMeters: number;
  readonly distanceIsMetric: boolean;
  readonly shoreKind: ShoreKind;
  readonly exposure: number;
  readonly shelter: number;
}

export interface ShoreTreatmentProfile {
  /** Contact/foam strength on the water side of the boundary. */
  readonly waterContactStrength: number;
  /** Dampness/wash strength on dry terrain. */
  readonly landContactStrength: number;
  readonly waterReachMeters: number;
  readonly landReachMeters: number;
}

export const SHORE_TREATMENT_TABLE: Readonly<Record<ShoreKind, ShoreTreatmentProfile>> = Object.freeze({
  sheltered: Object.freeze({
    waterContactStrength: 0.34,
    landContactStrength: 0.58,
    waterReachMeters: 6,
    landReachMeters: 4.5
  }),
  sand: Object.freeze({
    waterContactStrength: 0.76,
    landContactStrength: 0.88,
    waterReachMeters: 10,
    landReachMeters: 7
  }),
  "rock-shelf": Object.freeze({
    waterContactStrength: 0.82,
    landContactStrength: 0.28,
    waterReachMeters: 8,
    landReachMeters: 2.5
  }),
  cliff: Object.freeze({
    waterContactStrength: 0.55,
    landContactStrength: 0.08,
    waterReachMeters: 5,
    landReachMeters: 0.8
  })
});
