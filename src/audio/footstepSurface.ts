import { HARBOR_DOCK, HARBOR_SKIFF_MOORING } from "../world/WorldAnchors";
import { WorldLayout } from "../world/WorldLayout";

export type FootstepSurface = "dirt" | "wood" | "dock" | "grass";
export type FootstepBankId = "footstep-dirt" | "footstep-wood" | "footstep-dock" | "footstep-grass";

const DOCK_RADIUS_PADDING = 1.4;
const PACKED_ROAD_CORE = 0.86;

const nearPoint = (x: number, z: number, px: number, pz: number, radius: number): boolean => {
  const dx = x - px;
  const dz = z - pz;
  return dx * dx + dz * dz <= radius * radius;
};

export const footstepSurfaceAt = (x: number, z: number): FootstepSurface => {
  if (WorldLayout.isInterior(x, z) || WorldLayout.isBridgeDeck(x, z)) {
    return "wood";
  }
  const dock = WorldLayout.landmark("dock");
  if (
    WorldLayout.isPierDeck(x, z)
    || nearPoint(x, z, dock.x, dock.z, 8.5)
    || nearPoint(x, z, HARBOR_DOCK.playerPosition.x, HARBOR_DOCK.playerPosition.z, HARBOR_DOCK.dockRadius + DOCK_RADIUS_PADDING)
    || nearPoint(x, z, HARBOR_DOCK.boatPosition.x, HARBOR_DOCK.boatPosition.z, HARBOR_DOCK.dockRadius)
    || nearPoint(
      x,
      z,
      HARBOR_SKIFF_MOORING.playerPosition.x,
      HARBOR_SKIFF_MOORING.playerPosition.z,
      HARBOR_SKIFF_MOORING.dockRadius + DOCK_RADIUS_PADDING
    )
    || nearPoint(
      x,
      z,
      HARBOR_SKIFF_MOORING.boatPosition.x,
      HARBOR_SKIFF_MOORING.boatPosition.z,
      HARBOR_SKIFF_MOORING.dockRadius
    )
  ) {
    return "dock";
  }
  const road = WorldLayout.roadSurfaceSample(x, z);
  if (road.normalizedCoreDistance < PACKED_ROAD_CORE) {
    return "dirt";
  }
  return "grass";
};

export const footstepBankForSurface = (surface: FootstepSurface): FootstepBankId => {
  if (surface === "wood") return "footstep-wood";
  if (surface === "dock") return "footstep-dock";
  if (surface === "grass") return "footstep-grass";
  return "footstep-dirt";
};
