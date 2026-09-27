import { HARBOR_LIFE_STATIONS } from "../../world/HarborDistrictLayout";
import type { AmbientTownsfolkRoute } from "./ambientTownsfolk";

/** Short errands around each work station leave the public lanes open. */
export const HARBOR_TOWNSFOLK_ROUTES: readonly AmbientTownsfolkRoute[] = HARBOR_LIFE_STATIONS.map((station, index) => {
  const c = Math.cos(station.heading), s = Math.sin(station.heading);
  const position = { x: station.x, z: station.z };
  return {
    id: `townsfolk.harbor.${station.id}`, assetId: station.assetId,
    stations: { dawn: position, day: position, dusk: position, night: position },
    waypoints: [{ dx: 0, dz: 0 }, { dx: 0.65, dz: -0.2 }, { dx: 0.6, dz: -0.55 }, { dx: 0, dz: -0.65 }]
      .map(point => ({ dx: point.dx * c + point.dz * s, dz: -point.dx * s + point.dz * c })),
    radiusMeters: 0.82, loopSeconds: 17 + (index % 4) * 3,
    restFraction: 0.62, phase: (index * 0.173) % 1
  };
});
