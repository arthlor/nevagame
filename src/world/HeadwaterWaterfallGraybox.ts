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
  lockedSourceElevation: 33.5,
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
 * Four composed gameplay viewpoints (W05.2), re-derived from measured terrain
 * heights and sightlines against the integrated slice:
 * approach stands on the shortened trail terminus where the west rim hides the
 * source and upper chute, the western ledge reveals the tall drop, the west-bank
 * stance looks down onto the pool and its outflow, and the east bank surveys
 * the fall face against the raised headwall.
 */
export const HEADWATER_GRAYBOX_VIEWPOINTS: readonly GrayboxViewpoint[] = Object.freeze([
  Object.freeze({
    id: "viewpoint.headwaters.approach",
    name: "Foothill Trail Approach",
    // Trail terminus west of the spring rim. Measured intent: the west rim and
    // raised headwall hide the source bowl and upper chute; the fall may stay
    // behind the shoulder until the oblique reveal.
    cameraPosition: Object.freeze({ x: -48, y: 24.0, z: -155 }),
    targetPosition: Object.freeze({ x: -34, y: 30.0, z: -148 }),
    description: "Approach along the foothill trail; the west rim hides the spring source while the raised massif owns the skyline.",
    primarySubject: "approach-concealment",
    artViewId: "headwater-graybox-approach"
  }),
  Object.freeze({
    id: "viewpoint.headwaters.reveal",
    name: "Waterfall Oblique Reveal",
    // West-bank ledge south of the fall: looking up the tall curtain with the
    // western shoulder framing the shot. The high rim shoulder on the old
    // stance blocked the raised nappe after the 27.5 m drop landed.
    cameraPosition: Object.freeze({ x: -46, y: 18.0, z: -131 }),
    // Across the plunge pool into the mid-nappe of the tall drop.
    targetPosition: Object.freeze({ x: -29.0, y: 21.0, z: -135.2 }),
    description: "Oblique reveal from the west bank, showing the principal drop and its rock lip.",
    primarySubject: "oblique-reveal",
    artViewId: "headwater-graybox-reveal"
  }),
  Object.freeze({
    id: "viewpoint.headwaters.plunge_pool",
    name: "Plunge Pool & Outflow",
    // Walkable west-bank stance beside the pool, looking downstream along the
    // outflow. The stance stays off the fall-face bank, which no player route
    // reaches.
    cameraPosition: Object.freeze({ x: -34.5, y: 6.4, z: -128.5 }),
    targetPosition: Object.freeze({ x: -27.9, y: 2.0, z: -122 }),
    description: "Close viewpoint from the west bank, framing the plunge pool basin and how it drains into the main river reach.",
    primarySubject: "pool-outflow",
    artViewId: "headwater-graybox-pool"
  }),
  Object.freeze({
    id: "viewpoint.headwaters.fall_face",
    name: "Fall Face (East Bank)",
    // Survey the tall fall together with its receiving pool and rock ledge.
    cameraPosition: Object.freeze({ x: -13.0, y: 16.0, z: -111.0 }),
    targetPosition: Object.freeze({ x: -29.0, y: 20.0, z: -136.0 }),
    description: "Reverse view from the pool's east bank, framing the falling sheet against the raised lip and gorge.",
    primarySubject: "oblique-reveal",
    artViewId: "headwater-graybox-fall-face"
  })
]);
