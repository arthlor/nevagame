import { SUNREACH_AMBIENT_BOAT_ROUTES } from "./sunreachBoatTraffic";

/** Scenic traffic only: these hulls never enter saves, physics or interaction queries. */
export const AMBIENT_BOAT_ROUTES = [
  { x: 205, z: 143, radiusX: 52, radiusZ: 12, phase: 0.2, speed: 0.018 },
  { x: 290, z: 119, radiusX: 29, radiusZ: 11, phase: 2.4, speed: 0.024 },
  { x: 140, z: 124, radiusX: 19, radiusZ: 9, phase: 4.1, speed: 0.022 },
  { x: 560, z: 165, radiusX: 66, radiusZ: 16, phase: 1.1, speed: 0.012 },
  { x: 1042, z: 205, radiusX: 42, radiusZ: 24, phase: 3.2, speed: 0.014 },
  ...SUNREACH_AMBIENT_BOAT_ROUTES
] as const;

export function sampleAmbientBoatPose(route: typeof AMBIENT_BOAT_ROUTES[number], seconds: number, motionScale = 1) {
  const angle = route.phase + seconds * route.speed * motionScale;
  return { x: route.x + Math.cos(angle) * route.radiusX, z: route.z + Math.sin(angle) * route.radiusZ,
    heading: Math.atan2(-Math.sin(angle) * route.radiusX, Math.cos(angle) * route.radiusZ) };
}
