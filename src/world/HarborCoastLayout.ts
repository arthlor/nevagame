import { WorldLayout, pointSegmentProjection } from "./WorldLayout";
import { HARBOR_BEACH_PATH, HARBOR_LANDING_PATH, harborCoastContains } from "./HarborCoast";
import type { EnvironmentAssetPlacement, GroundCoverPlacement } from "./WorldEnvironmentLayout";
import { Object3D } from "three";
import { projectAssetCollision } from "../physics/CollisionCatalogAdapter";
import type { AssetId } from "../render/assets/AssetCatalog";
import type { StaticCollisionProxy } from "../physics/StaticCollision";

/** Derives migration/query boxes through the same catalog projection as the runtime. */
export function harborCoastCollisionProxies(placements: readonly EnvironmentAssetPlacement[] = createHarborCoastPlacements()): StaticCollisionProxy[] {
  return placements.filter((p) => harborCoastContains(p.x,p.z)).flatMap((placement) => {
    const root = new Object3D();
    root.position.set(placement.x, placement.y ?? WorldLayout.terrainHeight(placement.x, placement.z), placement.z);
    root.rotation.y = placement.rotationY;
    root.scale.set(...placement.scale);
    return projectAssetCollision(placement.assetId as AssetId, root, placement.id);
  });
}

/** Authored presentation habitat. Stable IDs and collision proxies stay in the existing layout/catalog path. */
export function createHarborCoastPlacements(): EnvironmentAssetPlacement[] {
  const placements: EnvironmentAssetPlacement[] = [];
  const place = (id: string, assetId: string, x: number, z: number, rotationY: number, scale = 1, burial = 0) => {
    placements.push({ id: `authored.harbor-coast.${id}`, origin: "authored", assetId, x, z,
      rotationY, scale: [scale, scale, scale], y: WorldLayout.terrainHeight(x, z) - burial,
      islandId: "island.neva" });
  };
  // Open eastern beach closes into two offset groves. The working apron stays broad.
  const palms = [
    [125,65,0], [122,60,1], [117,56,0], [113,52,1], [108,52,0], [103,50,1],
    [98,47,0], [92,46,1], [81,43,0], [77,47,1], [71,49,2],
    [121,48,1], [114,44,0], [105,44,1], [96,42,0], [88,41,1], [79,42,0],
    [116,67,2], [104,67,0], [100,63.5,2], [87,63,0], [136,72,1], [145,67,0], [139,59,2], [112,68.7,1], [103,64,0], [118,59,0]
  ] as const;
  const palmIds = ["tree_coastal_palm_a", "tree_coastal_palm_b", "tree_coastal_palm_young"];
  const plants = ["foliage_coastal_paddle_a", "foliage_coastal_split_a", "foliage_coastal_shrub_a"];
  palms.forEach(([x,z,kind], index) => {
    place(`palm-${index}`, palmIds[kind], x, z, .4 + index * 2.13, .91 + (index % 4) * .055, .06);
    for (let member = 0; member < (index < 17 ? 4 : 2); member++) {
      const angle = member * 2.13 + index * 1.43;
      const px = x + Math.cos(angle) * (1.4 + member * .42);
      const pz = z + Math.sin(angle) * (1.4 + member * .42);
      if (coastalRouteClearance(px, pz) < 2.2 || WorldLayout.isWater(px,pz)) continue;
      place(`understory-${index}-${member}`, plants[(index + member) % 3], px, pz,
        angle, .78 + ((index + member) % 5) * .08, .025);
    }
  });
  // Windows and the open work front face the route; neither touches an existing station.
  place("net-shelter", "building_coastal_shelter_a", 109.4, 65, Math.PI, 1, .1);
  place("work-store", "building_coastal_store_a", 80.3, 49.3, -.12, 1, .1);
  place("stored-basket", "prop_harvest_basket_a", 112, 64.2, .8, .9);
  place("shelter-net", "prop_fishing_net_rack_a", 108.5, 66, Math.PI * .5, .75);
  place("store-crate", "prop_crate_wood_a", 77.5, 49.9, .23, .86);
  // Anchor/medium relationships leave a clear cast lane at (93,69) and open coves eastward.
  const rocks = [
    [97.7,71.8,0,1.05,.22], [101.2,74.5,1,.70,.28], [98.5,77.2,2,.58,.22],
    [88.9,70.8,1,.60,.20], [119.4,79.3,0,1.13,.30], [115.6,81.4,1,.61,.28],
    [122.8,80.8,2,.53,.25], [142,85.2,2,1.12,.34], [145,83.7,1,.84,.25],
    [140,87.9,0,.55,.22], [151,78,1,.62,.25]
  ] as const;
  rocks.forEach(([x,z,kind,scale,burial], i) =>
    place(`rock-${i}`, `rock_harbor_fractured_${["a","b","c"][kind]}`, x,z,.25 + i * .72,scale,burial));
  place("washed-root", "prop_driftwood_log_a", 126, 76.4, 1.24, .62, .06);
  return placements;
}

export function coastalRouteClearance(x: number, z: number): number {
  let distance = Infinity;
  for (const route of [HARBOR_BEACH_PATH, HARBOR_LANDING_PATH]) for (let i=1;i<route.length;i++) {
    distance = Math.min(distance, pointSegmentProjection(x, z, route[i-1], route[i]).distance);
  }
  return distance;
}

/** Replace only presentation vegetation/stone scatter inside the authored habitat. */
export function retainLegacyHarborDressing(placement: EnvironmentAssetPlacement): boolean {
  if (!harborCoastContains(placement.x, placement.z) || placement.x < 74 || placement.z > 100) return true;
  return !/^(tree_|foliage_|rock_)/.test(placement.assetId);
}

export function retainHarborGroundCover(placement: GroundCoverPlacement): boolean {
  if (!harborCoastContains(placement.x, placement.z) || placement.x < 74) return true;
  // Dry open sand is allowed to be empty. Understory supplies density at the grove edge.
  if (WorldLayout.coastlineZ(placement.x) - placement.z < 18) return false;
  return coastalRouteClearance(placement.x, placement.z) > 2.0;
}
