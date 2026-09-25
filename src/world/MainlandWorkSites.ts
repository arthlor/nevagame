import type { MAINLAND_VILLAGES } from "./NevaMainland";
import type { WorldPoint } from "./WorldLayout";

/**
 * Where the mainland villages' goods come from. Each site is placed where
 * its trade makes sense in the landform, which `mainlandWorkSites.test.ts`
 * checks against the live terrain: the adit at the foot of a rock face above
 * Highridge where its overlook track ends, the ice house dug into a bank above
 * the forest lake beside the forest road, the salt pans on low flats beside
 * the cove next to the Reedhaven landing, and the timber yard on level pine
 * ground on the Pinewatch road. Presentation and scatter clearance only; no
 * site owns gameplay state.
 */
export interface MainlandWorkSite {
  id: string;
  villageId: keyof typeof MAINLAND_VILLAGES;
  assetId: string;
  center: Readonly<WorldPoint>;
  /** Yaw as `Object3D.rotation.y`; the working front faces local +Z. */
  rotationY: number;
  /** Local working footprint [minX, maxX, minZ, maxZ], front toward +Z. */
  footprint: readonly [number, number, number, number];
  /** A level yard or flat, rather than a site cut into a bank or rock face. */
  level: boolean;
  /** Goods this site accounts for; each is traded at a mainland market. */
  supplies: readonly string[];
  /** Existing props that dress the working ground, in the site's local frame. */
  companions: readonly { key: string; assetId: string; local: readonly [number, number]; rotationY: number }[];
}

export const MAINLAND_WORK_SITES: readonly MainlandWorkSite[] = [
  {
    id: "highridge-adit", villageId: "highridge", assetId: "prop_mine_adit_a",
    center: { x: -548, z: -403 }, rotationY: 1.5708, footprint: [-4.2, 3.4, -3.5, 4], level: false,
    supplies: ["item.tool_steel", "item.copper_sheet", "item.brass_fittings"],
    companions: [
      { key: "ore-barrel", assetId: "prop_barrel_wood_a", local: [-1.8, 4.6], rotationY: 0.4 },
      { key: "tool-crate", assetId: "prop_crate_wood_a", local: [-2.7, 5.3], rotationY: -0.3 }
    ]
  },
  {
    id: "lake-ice-house", villageId: "reedhaven", assetId: "building_ice_house_a",
    center: { x: -632, z: -134 }, rotationY: 2.2823, footprint: [-2.7, 2.4, -4.2, 4.2], level: false,
    supplies: ["item.crushed_ice"],
    companions: [
      { key: "sawdust-crate", assetId: "prop_crate_wood_a", local: [-2.4, 4.1], rotationY: 0.2 }
    ]
  },
  {
    id: "reedhaven-salt-pans", villageId: "reedhaven", assetId: "prop_salt_pans_a",
    center: { x: -501, z: 321 }, rotationY: -1.4274, footprint: [-3.7, 5.9, -2.1, 2.1], level: true,
    supplies: ["item.salt_cured_fish"],
    companions: [
      { key: "salt-barrow", assetId: "prop_wheelbarrow_a", local: [6.6, -1], rotationY: 1.2 },
      { key: "brine-barrel", assetId: "prop_barrel_wood_a", local: [-4.6, 1.4], rotationY: 0 }
    ]
  },
  {
    id: "pinewatch-timber-yard", villageId: "pinewatch", assetId: "station_timber_sawbuck_a",
    center: { x: -359.5, z: 50 }, rotationY: -2.7294, footprint: [-3.8, 3.8, -2.4, 2.4], level: true,
    supplies: ["item.hardwood_blank"],
    companions: [
      { key: "haul-cart", assetId: "prop_wagon_cart_a", local: [0.6, 3.4], rotationY: Math.PI / 2 },
      { key: "offcut-stack", assetId: "prop_firewood_stack_a", local: [-4.7, 0.4], rotationY: 0.1 }
    ]
  }
];

/** World position of a point in a site's local frame (as `Object3D.rotation.y` turns it). */
export function mainlandWorkSitePoint(site: MainlandWorkSite, localX: number, localZ: number): WorldPoint {
  const cosine = Math.cos(site.rotationY), sine = Math.sin(site.rotationY);
  return { x: site.center.x + localX * cosine + localZ * sine, z: site.center.z - localX * sine + localZ * cosine };
}

/** Signed distance to the nearest work-site footprint; negative inside one. */
export function mainlandWorkSiteClearanceAt(x: number, z: number): number {
  let distance = Infinity;
  for (const site of MAINLAND_WORK_SITES) {
    const dx = x - site.center.x, dz = z - site.center.z;
    if (Math.abs(dx) > 40 || Math.abs(dz) > 40) continue;
    const cosine = Math.cos(site.rotationY), sine = Math.sin(site.rotationY);
    const localX = dx * cosine - dz * sine;
    const localZ = dx * sine + dz * cosine;
    const [minX, maxX, minZ, maxZ] = site.footprint;
    const outsideX = Math.max(minX - localX, localX - maxX);
    const outsideZ = Math.max(minZ - localZ, localZ - maxZ);
    distance = Math.min(distance,
      Math.hypot(Math.max(0, outsideX), Math.max(0, outsideZ)) + Math.min(0, Math.max(outsideX, outsideZ)));
  }
  return distance;
}

function smoothstep(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Trodden ground round each site for the terrain surface, in [0, 1]: the
 * footprint and a few metres round it. The adit's rock is its model's own; a
 * painted rock term here switched on cliff faceting across a slope that is
 * not steep, which drew flat bright triangles with hard edges above the adit.
 */
export function mainlandWorkSiteWearAt(x: number, z: number): number {
  let worn = 0;
  for (const site of MAINLAND_WORK_SITES) {
    const dx = x - site.center.x, dz = z - site.center.z;
    if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue;
    const cosine = Math.cos(site.rotationY), sine = Math.sin(site.rotationY);
    const localX = dx * cosine - dz * sine;
    const localZ = dx * sine + dz * cosine;
    const [minX, maxX, minZ, maxZ] = site.footprint;
    const outsideX = Math.max(minX - localX, localX - maxX, 0);
    const outsideZ = Math.max(minZ - localZ, localZ - maxZ, 0);
    worn = Math.max(worn, 1 - smoothstep(1, 4.5, Math.hypot(outsideX, outsideZ)));
  }
  return worn;
}
