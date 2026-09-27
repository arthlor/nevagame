import type { GameState } from '../simulation/core/types';
import { VILLAGE_TRADE_STATIONS } from '../world/VillageTradeLayout';
import { WorldLayout } from '../world/WorldLayout';
import { Object3D } from 'three';
import { projectAssetCollision } from '../physics/CollisionCatalogAdapter';
import { staticPoseIsClear, type StaticCollisionProxy } from '../physics/StaticCollision';
import type { AssetId } from '../render/assets/AssetCatalog';
import { carriageFootprint, carriagePoseIsClear, isCarriage, workshopCarriagePoses } from '../simulation/mounts/Carriage';
import { isMountableTraversalPoint, playerPoseFromMount } from '../simulation/mounts/Mounts';
import { createWorldStaticPlacements, villageTradePlacements, villageTradeOrchardPlacements } from '../world/WorldEnvironmentLayout';
import { groundPlayer, nearestPoint } from './terrainMigrationSupport';

/** This revision adds obstacles; it does not reshape terrain or re-ground untouched saves. */
export function recoverTradeObstacles(state: GameState,
  changedPlacements = [...villageTradePlacements(), ...villageTradeOrchardPlacements()], recoverDisplays = true): void {
  const project = (placements: ReturnType<typeof villageTradePlacements>) => placements.flatMap(placement => {
    const root = new Object3D();
    root.position.set(placement.x, placement.y ?? WorldLayout.terrainHeight(placement.x, placement.z), placement.z);
    root.rotation.y = placement.rotationY;
    root.scale.set(...placement.scale);
    return projectAssetCollision(placement.assetId as AssetId, root, placement.id);
  });
  const added = project(changedPlacements);
  const displays = workshopCarriagePoses().filter(display => !state.mounts[display.id]).flatMap(display => carriageFootprint(display));
  const clear = (point: { x: number; z: number }, radius: number, collision = added, checkDisplays = true) =>
    staticPoseIsClear(collision, point, WorldLayout.traversalSurfaceHeight(point.x, point.z), radius)
    && (!checkDisplays || displays.every(display => Math.hypot(display.x - point.x, display.z - point.z) > display.radius + radius));
  let all: StaticCollisionProxy[] | undefined;
  const collisions = () => all ??= project([...createWorldStaticPlacements(state.worldSeed)]);
  const safe = (point: { x: number; z: number }, radius: number) => WorldLayout.isWalkable(point.x, point.z)
    && !WorldLayout.isWater(point.x, point.z) && clear(point, radius, collisions());
  for (const mount of Object.values(state.mounts)) {
    const footprint = isCarriage(mount) ? carriageFootprint(mount) : [{ ...mount, radius: .7 }];
    if (footprint.every(point => clear(point, point.radius, added, recoverDisplays))) continue;
    const point = nearestPoint(mount, candidate => isCarriage(mount)
      ? carriagePoseIsClear({ ...mount, ...candidate }, collisions())
        && carriageFootprint({ ...mount, ...candidate }).every(part => clear(part, part.radius))
      : isMountableTraversalPoint(candidate.x, candidate.z) && safe(candidate, .7), mount);
    Object.assign(mount, point, { y: WorldLayout.traversalSurfaceHeight(point.x, point.z) });
    if (state.player.activeMountId === mount.id) Object.assign(state.player, playerPoseFromMount(mount));
  }
  if (!state.player.activeBoatId && !state.player.activeMountId && !clear(state.player, .4, added, recoverDisplays)) {
    groundPlayer(state.player, nearestPoint(state.player, point => safe(point, .4), state.player));
  }
  for (const cargo of Object.values(state.fishCargo)) {
    if (cargo.location?.type !== 'ground') continue;
    const origin = { x: cargo.location.x!, z: cargo.location.z! };
    if (!clear(origin, .45, added, recoverDisplays)) Object.assign(cargo.location, nearestPoint(origin, point => safe(point, .45), origin));
  }
}

export const VILLAGE_TRADE_LAYOUT_REVISION = 34;

/** Keep economic snapshots and cargo identities; grant stations, never vehicles. */
export function migrateVillageTrade65(previous: GameState): GameState {
  const state = structuredClone(previous);
  state.schemaVersion = 65;
  if (state.world.layoutRevision < VILLAGE_TRADE_LAYOUT_REVISION) recoverTradeObstacles(state);
  state.world.layoutRevision = VILLAGE_TRADE_LAYOUT_REVISION;
  for (const station of VILLAGE_TRADE_STATIONS) {
    state.world.structures[station.id] = { id: station.id, type: 'trading-station', ...station.position,
      y: WorldLayout.terrainHeight(station.position.x, station.position.z) };
  }
  for (const job of Object.values(state.processingJobs)) {
    if (job.result.kind !== 'farm-pack' || state.world.structures[job.stationId]?.type === 'trading-station') continue;
    // Existing kitchen packs finish at the Neva yard, with their paid inputs,
    // grades, Work, ready time and XP unchanged. Legacy origin stays absent.
    if (Object.values(state.processingJobs).some(other => other.id !== job.id && other.stationId === 'struct.trade_neva')) {
      throw new Error('Village trade migration cannot merge two occupied packing stations');
    }
    job.stationId = 'struct.trade_neva';
  }
  return state;
}
