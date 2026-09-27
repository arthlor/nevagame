import { ASSET_IDS } from "../assets/AssetCatalog";
import { AMBIENT_NPC_ASSETS } from "./ambientNpcAssets";
import { SUNREACH_AMBIENT_BOAT_ROUTES } from "./sunreachBoatTraffic";

/** Scenic traffic only: these hulls never enter saves, physics or interaction queries. */
export const AMBIENT_BOAT_ROUTES = [
  { x: 205, z: 143, radiusX: 52, radiusZ: 12, phase: 0.2, speed: 0.018 },
  { x: 290, z: 119, radiusX: 29, radiusZ: 11, phase: 2.4, speed: 0.024 },
  { x: 140, z: 124, radiusX: 19, radiusZ: 9, phase: 4.1, speed: 0.022 },
  { x: 560, z: 165, radiusX: 66, radiusZ: 16, phase: 1.1, speed: 0.012 },
  { x: 1042, z: 205, radiusX: 42, radiusZ: 24, phase: 3.2, speed: 0.014 },
  // Inshore working traffic, outside the player slips and the new timber jetties.
  { x: 49, z: 94, radiusX: 7, radiusZ: 3, phase: 1.8, speed: 0.027 },
  { x: 1125, z: 94, radiusX: 5, radiusZ: 6, phase: 3.6, speed: 0.025 },
  ...SUNREACH_AMBIENT_BOAT_ROUTES
].map((route, index) => ({
  ...route,
  assetId: index % 2 === 0 ? ASSET_IDS.BOAT_SKIFF_A : ASSET_IDS.BOAT_ROWBOAT_A,
  driverAssetId: AMBIENT_NPC_ASSETS[index % AMBIENT_NPC_ASSETS.length]
}));

export function sampleAmbientBoatPose(route: { x: number; z: number; radiusX: number; radiusZ: number; phase: number; speed: number }, seconds: number, motionScale = 1) {
  const angle = route.phase + seconds * route.speed * motionScale;
  return { x: route.x + Math.cos(angle) * route.radiusX, z: route.z + Math.sin(angle) * route.radiusZ,
    heading: Math.atan2(-Math.sin(angle) * route.radiusX, Math.cos(angle) * route.radiusZ) };
}
