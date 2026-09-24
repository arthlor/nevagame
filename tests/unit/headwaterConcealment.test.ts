import { describe, expect, it } from "vitest";
import { Object3D } from "three";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import type { StaticCollisionProxy } from "../../src/physics/StaticCollision";
import type { AssetId } from "../../src/render/assets/AssetCatalog";
import { AUTHORED_DETAIL_PLACEMENTS } from "../../src/world/WorldEnvironmentLayout";
import {
  HEADWATER_GRAYBOX_VIEWPOINTS
} from "../../src/world/HeadwaterWaterfallGraybox";
import { NEVA_HEADWATERS, headwaterElevationAt } from "../../src/world/NevaHeadwaters";
import { WorldLayout } from "../../src/world/WorldLayout";

/** Real projected rock colliders near the slice (the game's own boxes). */
function sliceRockColliders(): StaticCollisionProxy[] {
  const proxies: StaticCollisionProxy[] = [];
  for (const placement of AUTHORED_DETAIL_PLACEMENTS) {
    if (!placement.assetId.startsWith("rock_")) continue;
    if (Math.hypot(placement.x + 28, placement.z - -138) > 30) continue;
    const root = new Object3D();
    root.position.set(
      placement.x,
      WorldLayout.terrainHeight(placement.x, placement.z),
      placement.z
    );
    root.rotation.y = placement.rotationY;
    root.scale.set(...placement.scale);
    proxies.push(...projectAssetCollision(
      placement.assetId as AssetId, root, placement.id
    ));
  }
  return proxies;
}

function pointInYawBox(
  x: number, y: number, z: number,
  proxy: StaticCollisionProxy
): boolean {
  // Proxies carry yaw-only rotations; reject anything else explicitly.
  const { x: qx, z: qz } = proxy.rotation;
  if (Math.abs(qx) > 1e-6 || Math.abs(qz) > 1e-6) return false;
  const halfYaw = Math.atan2(
    2 * (proxy.rotation.w * proxy.rotation.y + proxy.rotation.x * proxy.rotation.z),
    1 - 2 * (proxy.rotation.y * proxy.rotation.y + proxy.rotation.z * proxy.rotation.z)
  );
  const dx = x - proxy.center.x;
  const dz = z - proxy.center.z;
  const localX = dx * Math.cos(halfYaw) - dz * Math.sin(halfYaw);
  const localZ = dx * Math.sin(halfYaw) + dz * Math.cos(halfYaw);
  const margin = 0.1;
  return (
    Math.abs(localX) <= proxy.halfExtents.x + margin
    && Math.abs(localZ) <= proxy.halfExtents.z + margin
    && y + 0.1 > proxy.center.y - proxy.halfExtents.y
    && y - 0.1 < proxy.center.y + proxy.halfExtents.y
  );
}

function blockedAt(
  x: number,
  y: number,
  z: number,
  rocks: readonly StaticCollisionProxy[]
): boolean {
  if (WorldLayout.terrainHeight(x, z) > y + 0.15) return true;
  for (const rock of rocks) {
    if (pointInYawBox(x, y, z, rock)) return true;
  }
  return false;
}

function segmentBlocked(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  rocks: readonly StaticCollisionProxy[]
): boolean {
  const length = Math.hypot(bx - ax, by - ay, bz - az);
  const steps = Math.max(1, Math.ceil(length / 0.5));
  for (let index = 1; index < steps; index += 1) {
    const t = index / steps;
    if (blockedAt(
      ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t, rocks
    )) {
      return true;
    }
  }
  return false;
}

/** Distance past the target where the ray first meets terrain/rock, if ever. */
function backdropDistance(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  rocks: readonly StaticCollisionProxy[]
): number | null {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const length = Math.hypot(dx, dy, dz);
  for (let extra = 0.5; extra <= 40; extra += 0.5) {
    const d = length + extra;
    if (blockedAt(
      ax + (dx / length) * d, ay + (dy / length) * d, az + (dz / length) * d, rocks
    )) {
      return extra;
    }
  }
  return null;
}

function gameplayEye(viewpoint: (typeof HEADWATER_GRAYBOX_VIEWPOINTS)[number]): {
  x: number; y: number; z: number;
} {
  const camera = viewpoint.cameraPosition;
  const ground = WorldLayout.traversalSurfaceHeight(camera.x, camera.z);
  return { x: camera.x, y: Math.max(camera.y, ground + 1.7), z: camera.z };
}

/**
 * The fall must emerge from the mountain: from the downstream gameplay
 * stances, the source and upper channel are hidden behind terrain/rock, and
 * visible feed water is backed by mountain — never a ribbon arriving over
 * open sky. Two narrow exceptions are pinned, not fixed: low sightlines from
 * the eastern pool bank thread the 1–2 m lip slot for a few stations just
 * above the crest (fall-face −147…−145, pool −136). No contract-passing rock
 * can stand in that funnel — any 2 m footprint there is either inside the
 * 0.85 m dry-margin of the water edge or too sloped for the stability
 * spread — and the carve keeps the slot banks pinned to the water profile.
 * The test bounds those slivers (count + containment) so they can shrink but
 * never grow, while the fall face and the pool themselves stay visible.
 */
describe("headwater source concealment", () => {
  const downstream = HEADWATER_GRAYBOX_VIEWPOINTS.filter(
    (viewpoint) => viewpoint.primarySubject !== "approach-concealment"
  );
  const rocks = sliceRockColliders();

  it("conceals the source and upper channel behind terrain or rock", () => {
    expect(downstream.length).toBe(3);
    // Hard occlusions: verified structural (berm, ridge, cleft walls, rocks).
    // Fall-face looks along the slot, so its upper channel is backing-ruled
    // (next test), not occlusion-ruled.
    const occludedStations: Record<string, number[]> = {
      "headwater-graybox-pool": [-150, -149, -148, -147, -146, -145, -144, -143, -142, -141, -140, -139, -138],
      "headwater-graybox-reveal": [-150, -149, -148, -147, -146, -145],
      "headwater-graybox-fall-face": []
    };
    for (const viewpoint of downstream) {
      const eye = gameplayEye(viewpoint);
      for (const z of occludedStations[viewpoint.artViewId] ?? []) {
        const section = WorldLayout.riverSectionAt(z);
        const target = { x: section.centerX, y: section.surfaceElevation + 0.3, z };
        expect(
          segmentBlocked(eye.x, eye.y, eye.z, target.x, target.y, target.z, rocks),
          `${viewpoint.artViewId} shows channel water at z=${z}`
        ).toBe(true);
      }
    }
  });

  it("backs every other visible station with mountain, bounding the slot sliver", () => {
    // Accepted sky slivers: low sightlines that thread the 1–2 m lip slot see
    // feed water against sky for a few stations. No contract-passing rock fits
    // that funnel (dry-margin + spread gates) and the carve pins its banks, so
    // the sliver is pinned, not fixed: it may shrink, never grow.
    const acceptedSky: Record<string, number[]> = {
      "headwater-graybox-pool": [-136],
      // West-bank oblique: only the lip crest station may read against sky;
      // every upstream chute station stays backed by the massif.
      "headwater-graybox-reveal": [-136],
      // Raised lip: the only sky behind feed water is the crest stations
      // themselves; the upper chute is fully backed by the massif.
      "headwater-graybox-fall-face": [-138, -137, -136]
    };
    for (const viewpoint of downstream) {
      const eye = gameplayEye(viewpoint);
      const sky: number[] = [];
      for (let z = NEVA_HEADWATERS.source.z; z <= NEVA_HEADWATERS.fall.lipZ; z += 1) {
        const section = WorldLayout.riverSectionAt(z);
        const target = { x: section.centerX, y: section.surfaceElevation + 0.3, z };
        if (segmentBlocked(eye.x, eye.y, eye.z, target.x, target.y, target.z, rocks)) continue;
        const backdrop = backdropDistance(eye.x, eye.y, eye.z, target.x, target.y, target.z, rocks);
        if (backdrop === null) {
          sky.push(z);
          continue;
        }
        expect(
          backdrop, `${viewpoint.artViewId} channel backdrop at z=${z}`
        ).toBeLessThanOrEqual(25);
      }
      expect(
        sky, `${viewpoint.artViewId} sky sliver changed: got [${sky}]`
      ).toEqual(acceptedSky[viewpoint.artViewId] ?? []);
    }
  });

  it("keeps the fall face and the pool themselves visible", () => {
    // Mid-nappe on the live ballistic sheet: the raised 27.5 m drop no longer
    // has water at a fixed y = 8 (that point is now inside the carved face).
    const lipZ = NEVA_HEADWATERS.fall.lipZ;
    const landingZ = NEVA_HEADWATERS.fall.landingZ;
    const drop = NEVA_HEADWATERS.fall.lipElevation - NEVA_HEADWATERS.fall.landingElevation;
    const midZ = -135.2;
    const t = (midZ - lipZ) / (landingZ - lipZ);
    const nappeY = NEVA_HEADWATERS.fall.lipElevation - drop * t * t;
    const profileY = headwaterElevationAt(midZ);
    const fallMid = {
      x: WorldLayout.riverCenterX(midZ),
      y: profileY + (nappeY - profileY) * 0.68,
      z: midZ
    };
    const poolCenter = {
      x: WorldLayout.riverCenterX(NEVA_HEADWATERS.pool.centerZ),
      y: 3.8,
      z: NEVA_HEADWATERS.pool.centerZ
    };
    for (const viewpoint of downstream) {
      const eye = gameplayEye(viewpoint);
      expect(
        segmentBlocked(eye.x, eye.y, eye.z, fallMid.x, fallMid.y, fallMid.z, rocks),
        `${viewpoint.artViewId} cannot see the fall`
      ).toBe(false);
      expect(
        segmentBlocked(eye.x, eye.y, eye.z, poolCenter.x, poolCenter.y, poolCenter.z, rocks),
        `${viewpoint.artViewId} cannot see the pool`
      ).toBe(false);
    }
  });
});
