import { Object3D } from "three";
import type { GameState } from "../simulation/core/types";
import { projectAssetCollision } from "../physics/CollisionCatalogAdapter";
import { staticPoseIsClear, type StaticCollisionProxy } from "../physics/StaticCollision";
import { ASSET_IDS, type AssetId } from "../render/assets/AssetCatalog";
import { STATIC_FARM_PROP_ASSETS, STATIC_LANDMARK_ASSETS } from "../render/assets/RuntimeAssetOwners";
import { isCarriage, carriagePoseIsClear, workshopCarriagePoses } from "../simulation/mounts/Carriage";
import { isMountedFootprintSupported, mountedFootprint } from "../simulation/mounts/MountedRecovery";
import { playerPoseFromMount } from "../simulation/mounts/Mounts";
import { FARMHOUSE_INTERIOR_ORIGIN, FARMHOUSE_INTERIOR_PROPS } from "../world/FarmhouseInterior";
import { STARTER_FARM_LAYOUT, farmLocalToWorld } from "../world/FarmLayout";
import { createWorldStaticPlacements } from "../world/WorldEnvironmentLayout";
import { WorldLayout, type LandmarkId } from "../world/WorldLayout";
import { ContentRegistry } from "../content/ContentRegistry";
import { getProcessingStationRuntimeRotationY } from "../world/ProcessingStationApproach";
import { clearReach, groundPlayer, nearestPoint } from "./terrainMigrationSupport";

export const COLLISION_POLISH_LAYOUT_REVISION = 41;
export const COLLISION_POLISH_ASSETS: readonly AssetId[] = [
  ASSET_IDS.TREE_OLIVE_A, ASSET_IDS.TREE_OLIVE_B, ASSET_IDS.TREE_DEAD_A,
  ASSET_IDS.PROP_LAMP_POST_A, ASSET_IDS.PROP_SIGNPOST_TRAIL_A, ASSET_IDS.PROP_MOORING_POST_A,
  ASSET_IDS.PROP_DOCK_LANTERN_A, ASSET_IDS.PROP_BENCH_WOOD_A, ASSET_IDS.PROP_PICNIC_TABLE_A,
  ASSET_IDS.PROP_CARGO_CRATE_LARGE_A, ASSET_IDS.PROP_FALLEN_LOG_A, ASSET_IDS.PROP_WATER_TROUGH_A,
  ASSET_IDS.PROP_POTTING_BENCH_A, ASSET_IDS.PROP_WHEELBARROW_A, ASSET_IDS.PROP_BEEHIVE_A,
  ASSET_IDS.PROP_FISHING_NET_RACK_A, ASSET_IDS.PROP_TRAIL_KIOSK_A,
  ASSET_IDS.PROP_BOOKCASE_WOOD_A, ASSET_IDS.PROP_SIDEBOARD_WOOD_A, ASSET_IDS.INTERIOR_FARMHOUSE_SHELL
];

/** Uses the same catalog transforms and layout owners as WorldScene, including the room. */
export function collisionPolishProxies(state: GameState, onlyChanged = false): StaticCollisionProxy[] {
  const boxes: StaticCollisionProxy[] = [];
  const project = (id: string, asset: AssetId, p: { x: number; y?: number; z: number; rotationY: number }, scale: readonly number[] = [1, 1, 1]) => {
    if (onlyChanged && !COLLISION_POLISH_ASSETS.includes(asset)) return;
    const root = new Object3D();
    root.position.set(p.x, p.y ?? WorldLayout.terrainHeight(p.x, p.z), p.z);
    root.rotation.y = p.rotationY;
    root.scale.set(scale[0], scale[1], scale[2]);
    const proxies = projectAssetCollision(asset, root, id);
    boxes.push(...(onlyChanged && asset === ASSET_IDS.INTERIOR_FARMHOUSE_SHELL
      ? proxies.filter(proxy => proxy.id.endsWith(":wall_back_center")) : proxies));
  };
  for (const p of createWorldStaticPlacements(state.worldSeed)) project(p.id, p.assetId as AssetId, p, p.scale);
  const landmarks: readonly [LandmarkId, AssetId][] = [
    ["farmhouse", STATIC_LANDMARK_ASSETS.farmhouse], ["well", STATIC_LANDMARK_ASSETS.well],
    ["bridge", STATIC_LANDMARK_ASSETS.bridge], ["dock", STATIC_LANDMARK_ASSETS.dock],
    ["fish-market", STATIC_LANDMARK_ASSETS.fishMarket], ["lighthouse", STATIC_LANDMARK_ASSETS.lighthouse],
    ["windmill", STATIC_LANDMARK_ASSETS.windmill], ["produce-stall", STATIC_LANDMARK_ASSETS.produceStall]
  ];
  for (const [id, asset] of landmarks) {
    const p = WorldLayout.landmark(id);
    project(id, asset, { ...p, y: WorldLayout.terrainHeight(p.x, p.z) + p.yOffset }, [p.scale, p.scale, p.scale]);
  }
  for (const [id, asset] of [
    ["struct.workbench", STATIC_LANDMARK_ASSETS.workbench], ["struct.starter_compost", STATIC_LANDMARK_ASSETS.compost],
    ["struct.kitchen", STATIC_LANDMARK_ASSETS.kitchen], ["struct.harbor_fish_table", STATIC_LANDMARK_ASSETS.fishTable]
  ] as const) {
    const p = state.world.structures[id];
    if (p) project(id, asset, { ...p, rotationY: getProcessingStationRuntimeRotationY(id) });
  }
  for (const p of STARTER_FARM_LAYOUT.propAnchors) project(p.id, STATIC_FARM_PROP_ASSETS[p.type],
    { ...farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, p), rotationY: p.rotationY }, [p.scale, p.scale, p.scale]);
  for (const p of STARTER_FARM_LAYOUT.fenceAnchors) project(p.id, STATIC_LANDMARK_ASSETS.fence,
    { ...farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, p), rotationY: p.rotationY });
  project("farmhouse-interior", STATIC_LANDMARK_ASSETS.interiorShell, { ...FARMHOUSE_INTERIOR_ORIGIN, rotationY: 0 });
  for (const p of FARMHOUSE_INTERIOR_PROPS) project(p.id, p.assetId, p, [p.scale ?? 1, p.scale ?? 1, p.scale ?? 1]);
  return boxes;
}

/** Move only newly obstructed poses, without advancing time or transacting goods. */
export function migrateCollisionPolish76(previous: GameState): GameState {
  const state = structuredClone(previous);
  state.schemaVersion = 76;
  if (state.world.layoutRevision >= COLLISION_POLISH_LAYOUT_REVISION) return state;
  ContentRegistry.initializeAndValidate();
  const added = collisionPolishProxies(state, true);
  let all: StaticCollisionProxy[] | undefined;
  const collisions = () => all ??= collisionPolishProxies(state);
  const clear = (p: { x: number; z: number }, radius: number, boxes = added) =>
    staticPoseIsClear(boxes, p, WorldLayout.traversalSurfaceHeight(p.x, p.z), radius);
  const parked = (p: { x: number; z: number }, radius: number, except?: string) =>
    [...Object.values(state.mounts), ...workshopCarriagePoses().filter(m => !state.mounts[m.id])]
      .filter(m => m.id !== except).every(m => mountedFootprint(m)
        .every(q => Math.hypot(p.x - q.x, p.z - q.z) > radius + q.radius));
  const sameArea = (origin: { x: number; z: number }, p: { x: number; z: number }) =>
    WorldLayout.isInterior(origin.x, origin.z) ? WorldLayout.isInterior(p.x, p.z)
      : !WorldLayout.isInterior(p.x, p.z) && WorldLayout.islandAt(origin.x, origin.z) === WorldLayout.islandAt(p.x, p.z);
  const preservesFishing = (p: { x: number; z: number }) => {
    const compatibleReach = (bearing: number, distance: number, ecology: string, habitats: readonly string[]) => {
      const end = { x: p.x + Math.sin(bearing) * distance, z: p.z + Math.cos(bearing) * distance };
      return clearReach(p, bearing, distance) && WorldLayout.fishingEcologyAt(end.x, end.z).id === ecology
        && habitats.includes(WorldLayout.fishingHabitatAt(end.x, end.z) ?? "");
    };
    const basic = state.basicFishing;
    if (basic) {
      const forward = basic.castDistanceMeters ?? 6.5, lateral = basic.castLateralDriftMeters ?? 0;
      if (!compatibleReach(state.player.rotationY + Math.atan2(lateral, forward), Math.hypot(forward, lateral),
        basic.ecologyId, [basic.habitatId])) return false;
    }
    const sport = state.sportFishing;
    if (sport?.dynamics) {
      const distance = Math.sqrt(Math.max(0, sport.distanceMeters ** 2 - sport.dynamics.depthMeters ** 2));
      const habitats = sport.fish.habitatId ? [sport.fish.habitatId] : ContentRegistry.fishSpecies.get(sport.fish.speciesId)?.habitats ?? [];
      if (!compatibleReach(sport.dynamics.bearingRadians, distance,
        sport.fish.ecologyId ?? WorldLayout.fishingEcologyAt(previous.player.x, previous.player.z).id, habitats)) return false;
    }
    return true;
  };
  const safe = (origin: { x: number; z: number }, p: { x: number; z: number }, radius: number) =>
    sameArea(origin, p) && WorldLayout.isWalkable(p.x, p.z) && !WorldLayout.isWater(p.x, p.z)
    && WorldLayout.traversalSurfaceSample(p.x, p.z).normal.y >= Math.cos(38 * Math.PI / 180)
    && clear(p, radius, collisions()) && parked(p, radius);
  for (const mount of Object.values(state.mounts)) {
    if (mountedFootprint(mount).every(p => clear(p, p.radius))) continue;
    const point = nearestPoint(mount, p => {
      const candidate = { ...mount, ...p, y: WorldLayout.traversalSurfaceHeight(p.x, p.z) };
      return sameArea(mount, p) && isMountedFootprintSupported(candidate)
        && (isCarriage(candidate) ? carriagePoseIsClear(candidate, collisions())
          : mountedFootprint(candidate).every(q => clear(q, q.radius, collisions())))
        && mountedFootprint(candidate).every(q => parked(q, q.radius, mount.id));
    }, mount);
    Object.assign(mount, point, { y: WorldLayout.traversalSurfaceHeight(point.x, point.z) });
    if (state.player.activeMountId === mount.id) {
      Object.assign(state.player, playerPoseFromMount(mount));
      state.player.currentRegionId = WorldLayout.regionAt(mount.x, mount.z);
    }
  }
  if (!state.player.activeBoatId && !state.player.activeMountId && !clear(state.player, .4)) {
    groundPlayer(state.player, nearestPoint(state.player, p => safe(state.player, p, .4) && preservesFishing(p), state.player));
    if (state.sportFishing?.dynamics) Object.assign(state.sportFishing.dynamics,
      { originX: state.player.x, originZ: state.player.z });
  }
  for (const cargo of Object.values(state.fishCargo)) {
    if (cargo.location?.type !== "ground") continue;
    const origin = { x: cargo.location.x!, z: cargo.location.z! };
    if (!clear(origin, .45)) Object.assign(cargo.location, nearestPoint(origin, p => safe(origin, p, .45), origin));
  }
  state.world.layoutRevision = COLLISION_POLISH_LAYOUT_REVISION;
  return state;
}
