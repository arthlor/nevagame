import { ASSET_IDS } from "../assets/AssetCatalog.generated";
import { SUNREACH_LIFE_STATIONS } from "../../world/SunreachLivingLayout";
import type { AmbientTownsfolkRoute } from "./ambientTownsfolk";

/**
 * Residents reuse the existing animation/culling/reduced-motion implementation.
 * They do not harvest, trade, block the player, create quests or mutate a save.
 * Phase stations stay within 0.3 m of the reserved home point, so a day-phase
 * change cannot teleport someone through a building or across the island.
 */
export const SUNREACH_TOWNSFOLK_ROUTES: readonly AmbientTownsfolkRoute[] = [
  { id: "net-mender", point: SUNREACH_LIFE_STATIONS.netMender, assetId: ASSET_IDS.CHAR_NPC_TOMAS_A, seconds: 19, rest: 0.48 },
  { id: "fish-sorter", point: SUNREACH_LIFE_STATIONS.fishSorter, assetId: ASSET_IDS.CHAR_NPC_SILAS_A, seconds: 18, rest: 0.44 },
  { id: "market-neighbour", point: SUNREACH_LIFE_STATIONS.marketNeighbour, assetId: ASSET_IDS.CHAR_NPC_MAEVE_A, seconds: 22, rest: 0.52 },
  { id: "terrace-hand", point: SUNREACH_LIFE_STATIONS.terraceHand, assetId: ASSET_IDS.CHAR_NPC_INES_A, seconds: 20, rest: 0.50 },
  { id: "olive-keeper", point: SUNREACH_LIFE_STATIONS.oliveKeeper, assetId: ASSET_IDS.CHAR_NPC_ELSPETH_A, seconds: 23, rest: 0.54 },
  { id: "shore-walker", point: SUNREACH_LIFE_STATIONS.shoreWalker, assetId: ASSET_IDS.CHAR_NPC_BARNABY_A, seconds: 18, rest: 0.40 }
].map((resident, index) => ({
  id: `townsfolk.sunreach.${resident.id}`,
  assetId: resident.assetId,
  stations: {
    dawn: { x: resident.point.x - 0.2, z: resident.point.z + 0.1 },
    day: { ...resident.point },
    dusk: { x: resident.point.x + 0.15, z: resident.point.z - 0.2 },
    night: { x: resident.point.x - 0.1, z: resident.point.z - 0.15 }
  },
  waypoints: [
    { dx: 0, dz: 0 }, { dx: 0.8, dz: 0.25 }, { dx: 0.35, dz: 0.85 },
    { dx: -0.5, dz: 0.6 }, { dx: -0.75, dz: -0.15 }
  ],
  radiusMeters: 1,
  loopSeconds: resident.seconds,
  restFraction: resident.rest,
  phase: (index * 0.173 + 0.09) % 1
}));
