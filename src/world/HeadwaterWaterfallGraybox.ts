/**
 * W05/W06 review surface for the spring–waterfall–river slice.
 *
 * The slice's topology is live: `NEVA_HEADWATERS.elevationKnots` owns the
 * profile, `NEVA_HEADWATERS.fall` owns the falling segment, and `WorldLayout`
 * owns terrain, water and support. This module keeps only what is *not* live
 * world truth — the local change envelope the topology had to stay inside, and
 * the three authored review viewpoints used by the acceptance harness.
 */

import type { WorldVec2 } from "./WorldGeographyTypes";

export interface GrayboxEnvelope {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly continuityMarginMeters: number;
  readonly lockedSourceXZ: WorldVec2;
  readonly lockedSourceElevation: number;
  readonly lockedHandoffZ: number;
  readonly lockedHandoffElevation: number;
}

export const HEADWATER_GRAYBOX_ENVELOPE: GrayboxEnvelope = Object.freeze({
  minX: -78,
  maxX: 20,
  minZ: -186,
  maxZ: -110,
  continuityMarginMeters: 6,
  lockedSourceXZ: Object.freeze({ x: -30, z: -150 }),
  lockedSourceElevation: 20,
  lockedHandoffZ: -116,
  lockedHandoffElevation: 0
});

/** Tests if a coordinate lies within the declared local edit envelope. */
export function isInHeadwaterGrayboxEnvelope(x: number, z: number): boolean {
  const env = HEADWATER_GRAYBOX_ENVELOPE;
  return x >= env.minX && x <= env.maxX && z >= env.minZ && z <= env.maxZ;
}

export interface GrayboxViewpoint {
  readonly id: string;
  readonly name: string;
  readonly cameraPosition: { readonly x: number; readonly y: number; readonly z: number };
  readonly targetPosition: { readonly x: number; readonly y: number; readonly z: number };
  readonly description: string;
  readonly primarySubject: "approach-concealment" | "oblique-reveal" | "pool-outflow";
  /** DEV/acceptance art-view id; the camera preset is derived from this viewpoint, never copied. */
  readonly artViewId:
    | "headwater-graybox-approach"
    | "headwater-graybox-reveal"
    | "headwater-graybox-pool"
    | "headwater-graybox-fall-face";
}

/**
 * Three composed gameplay viewpoints (W05.2), re-derived from measured terrain
 * heights and sightlines against the integrated slice:
 * approach hides the fall behind the trail shoulder, the western ledge reveals
 * the drop, and the west-bank stance looks down onto the pool and its outflow.
 */
export const HEADWATER_GRAYBOX_VIEWPOINTS: readonly GrayboxViewpoint[] = Object.freeze([
  Object.freeze({
    id: "viewpoint.headwaters.approach",
    name: "Foothill Trail Approach",
    // Trail shoulder west of the spring rest stop (ground 20.6 m). Measured
    // sightline: the source bowl clears by ~0.1 m while the falling sheet is
    // hidden ~3.8 m behind the shoulder, which is the intended concealment.
    cameraPosition: Object.freeze({ x: -44, y: 23.0, z: -152 }),
    targetPosition: Object.freeze({ x: -30, y: 19.6, z: -146 }),
    description: "Approach along the foothill trail; the shoulder hides the drop while the source bowl stays readable.",
    primarySubject: "approach-concealment",
    artViewId: "headwater-graybox-approach"
  }),
  Object.freeze({
    id: "viewpoint.headwaters.reveal",
    name: "Waterfall Oblique Reveal",
    cameraPosition: Object.freeze({ x: -44, y: 15.5, z: -135 }),
    // Western-ridge ledge (ground 5.8 m) looking across the drop into the pool.
    targetPosition: Object.freeze({ x: -28.5, y: 6.5, z: -131 }),
    description: "Oblique reveal framed by the western ridge, showing the principal drop and its rock lip.",
    primarySubject: "oblique-reveal",
    artViewId: "headwater-graybox-reveal"
  }),
  Object.freeze({
    id: "viewpoint.headwaters.plunge_pool",
    name: "Plunge Pool & Outflow",
    // Walkable west-bank stance beside the pool (ground 3.57 m, normal 0.97),
    // looking downstream along the outflow. The previous stance sat on the
    // 68° fall-face bank, which no player route reaches.
    cameraPosition: Object.freeze({ x: -34.5, y: 6.4, z: -128.5 }),
    targetPosition: Object.freeze({ x: -27.9, y: 2.0, z: -122 }),
    description: "Close viewpoint from the west bank, framing the plunge pool basin and how it drains into the main river reach.",
    primarySubject: "pool-outflow",
    artViewId: "headwater-graybox-pool"
  }),
  Object.freeze({
    id: "viewpoint.headwaters.fall_face",
    name: "Fall Face (East Bank)",
    // Survey the taller fall together with its receiving pool and rock ledge.
    cameraPosition: Object.freeze({ x: -13.0, y: 14.5, z: -111.0 }),
    targetPosition: Object.freeze({ x: -29.0, y: 11.0, z: -136.0 }),
    description: "Reverse view from the pool's east bank, framing the falling sheet against the lip and gorge.",
    primarySubject: "oblique-reveal",
    artViewId: "headwater-graybox-fall-face"
  })
]);
