import { SUNREACH_ANCHORS } from "../../world/WorldIslands";

/** Offshore scenery, outside boarding approaches and the retained shore loop. */
export const SUNREACH_AMBIENT_BOAT_ROUTES = [
  {
    x: SUNREACH_ANCHORS.dockBoat.x - 48,
    z: SUNREACH_ANCHORS.dockBoat.z - 7,
    radiusX: 18, radiusZ: 11, phase: 0.8, speed: 0.015
  },
  {
    x: SUNREACH_ANCHORS.southernReefView.x,
    z: SUNREACH_ANCHORS.southernReefView.z + 64,
    radiusX: 31, radiusZ: 13, phase: 2.7, speed: 0.012
  }
] as const;
