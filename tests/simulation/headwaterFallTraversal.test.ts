import { describe, expect, it } from "vitest";
import { Object3D } from "three";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld";
import type { StaticCollisionProxy } from "../../src/physics/StaticCollision";
import { ASSET_BY_ID, type AssetId } from "../../src/render/assets/AssetCatalog";
import { Simulation } from "../../src/simulation/Simulation";
import { PLAYER_TRAVERSAL_TUNING } from "../../src/simulation/navigation/PlayerTraversal";
import { WORLD_SPAWN } from "../../src/world/WorldAnchors";
import { createWorldEnvironmentLayout } from "../../src/world/WorldEnvironmentLayout";
import { WorldLayout } from "../../src/world/WorldLayout";
import { NEVA_HEADWATERS } from "../../src/world/NevaHeadwaters";

let staticProxies: StaticCollisionProxy[] | undefined;

/** Published static collision for the collected world, as the game publishes it. */
function worldStaticCollision(): StaticCollisionProxy[] {
  if (staticProxies) return staticProxies;
  const proxies: StaticCollisionProxy[] = [];
  for (const placement of createWorldEnvironmentLayout(42).staticPlacements) {
    const assetId = placement.assetId as AssetId;
    if (ASSET_BY_ID.get(assetId)?.collision === "none") continue;
    const root = new Object3D();
    root.position.set(placement.x, placement.y ?? WorldLayout.terrainHeight(placement.x, placement.z), placement.z);
    root.rotation.y = placement.rotationY;
    root.scale.set(...placement.scale);
    proxies.push(...projectAssetCollision(assetId, root, placement.id));
  }
  return (staticProxies = proxies);
}

const FALL = NEVA_HEADWATERS.fall;

/**
 * The gorge's legal approach: the east rim stays climbable (~38° cap = 0.79
 * normal) while the west bank between z = -141 and -135 is a 50–60° face.
 */
function eastRimRoute(): Array<{ x: number; z: number }> {
  const route: Array<{ x: number; z: number }> = [];
  for (const z of [-147, -144, -141, -138, -135, -132]) {
    route.push({ x: WorldLayout.riverCenterX(z) + 14, z });
  }
  // The basin widened the pool, so the bank walk runs a little further east to
  // keep real clearance from the waterline.
  route.push({ x: WorldLayout.riverCenterX(-129.5) + 6.8, z: -129.5 });
  route.push({ x: WorldLayout.riverCenterX(-128.5) + 6.2, z: -128.5 });
  return route;
}

describe("W06 headwater fall traversal", () => {
  it("walks the east rim from the spring to the pool bank and back", async () => {
    const route = eastRimRoute();
    expect(route[0].z).toBeLessThan(FALL.lipZ);
    expect(route.at(-1)!.z).toBeGreaterThan(FALL.landingZ);
    for (const direction of [false, true] as const) {
      const points = direction ? [...route].reverse() : route;
      const physics = await PhysicsWorld.create(worldStaticCollision());
      const sim = new Simulation();
      Object.assign(sim.state.player, {
        x: points[0].x,
        z: points[0].z,
        y: WorldLayout.traversalSurfaceHeight(points[0].x, points[0].z) + 0.5,
        activeBoatId: null,
        activeMountId: null
      });
      sim.state.player.traversal.isGrounded = true;
      let ticks = 0;
      for (const target of points.slice(1)) {
        const startDistance = Math.hypot(target.x - sim.state.player.x, target.z - sim.state.player.z);
        const allowedTicks = Math.ceil((startDistance + 1) / PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond * 60 * 3);
        let reached = false;
        for (let tick = 0; tick < allowedTicks; tick++) {
          const dx = target.x - sim.state.player.x;
          const dz = target.z - sim.state.player.z;
          const distance = Math.hypot(dx, dz);
          if (distance < 0.3) { reached = true; break; }
          const result = physics.step(sim.state, { x: dx / distance, z: dz / distance, sprint: false }, "on-foot", 1 / 60, ticks++ / 60);
          if (!sim.commitPhysicsFrame(result.frame).success) throw new Error("rejected physics frame");
          const player = sim.state.player;
          if (WorldLayout.isWater(player.x, player.z)) {
            throw new Error(`walked into water at ${player.x.toFixed(1)},${player.z.toFixed(1)}`);
          }
          if (!result.playerMotion.isGrounded) {
            throw new Error(`lost contact at ${player.x.toFixed(1)},${player.z.toFixed(1)}`);
          }
        }
        expect(reached, `stalled at ${sim.state.player.x.toFixed(1)},${sim.state.player.z.toFixed(1)} heading ${direction ? "up" : "down"}`).toBe(true);
      }
    }
  }, 120_000);

  it("keeps the fall face, pool and outflow outside walking, fishing and boating", () => {
    for (let z = FALL.lipZ; z < NEVA_HEADWATERS.endZ; z += 0.5) {
      const centerX = WorldLayout.riverCenterX(z);
      expect(WorldLayout.isWater(centerX, z), `dry channel at ${z}`).toBe(true);
      expect(WorldLayout.isWalkable(centerX, z), `walkable channel at ${z}`).toBe(false);
      expect(WorldLayout.fishingHabitatAt(centerX, z), `fishable fall at ${z}`).toBeNull();
    }
    // The handoff is where the retained river begins: it carries river habitat
    // and becomes navigable exactly at NEVA_HEADWATERS.endZ.
    const handoffX = WorldLayout.riverCenterX(NEVA_HEADWATERS.endZ);
    expect(WorldLayout.fishingHabitatAt(handoffX, NEVA_HEADWATERS.endZ)).toBe("river");
    // Boats stop at the handoff: the upper reach is not sailable, and the
    // navigable river begins exactly where the reach ends.
    for (let z = FALL.lipZ; z < NEVA_HEADWATERS.endZ; z += 0.5) {
      const centerX = WorldLayout.riverCenterX(z);
      expect(WorldLayout.isSailable(centerX, z), `sailable headwater at ${z}`).toBe(false);
    }
    expect(WorldLayout.isSailable(WorldLayout.riverCenterX(NEVA_HEADWATERS.endZ), NEVA_HEADWATERS.endZ)).toBe(true);
  });

  it("leaves the west gorge face impassable so the east rim is the only route", () => {
    // The character controller climbs at most 38° (normal >= 0.79).
    const climbableNormalY = Math.cos((38 * Math.PI) / 180);
    for (const z of [-142, -141, -140]) {
      const centerX = WorldLayout.riverCenterX(z);
      let steepest = 0;
      for (let lift = 4; lift <= 20; lift += 0.5) {
        steepest = Math.max(steepest, WorldLayout.terrainNormalY(centerX - lift, z));
      }
      // No climbable line exists across the west shoulder at this station, so
      // the west bank dead-ends instead of forming a second gorge route.
      expect(steepest, `climbable west line at ${z}`).toBeLessThan(climbableNormalY);
    }
  });

  it("keeps both pool banks reachable and dry", () => {
    const z = -126.5;
    const section = WorldLayout.riverSectionAt(z);
    for (const side of [-1, 1] as const) {
      const x = section.centerX + side * (section.leftWaterWidth + section.leftBankRun * 0.4);
      expect(WorldLayout.isWater(x, z), `wet bank at ${x}`).toBe(false);
      expect(WorldLayout.isWalkable(x, z), `unwalkable bank at ${x}`).toBe(true);
      expect(WorldLayout.terrainNormalY(x, z)).toBeGreaterThan(0.7);
    }
  });

  it("keeps the legal path dry of the carved plunge basin", () => {
    // The basin widened the pool; the walked bank must keep real clearance,
    // not a knife-edge along the waterline.
    for (const [z, lift] of [[-129.5, 6.8], [-128.5, 6.2]] as const) {
      const section = WorldLayout.riverSectionAt(z);
      const x = WorldLayout.riverCenterX(z) + lift;
      const eastWaterEdge = section.centerX + section.rightWaterWidth;
      expect(WorldLayout.isWater(x, z), `wet path at ${z}`).toBe(false);
      expect(x - eastWaterEdge, `dry margin at ${z}`).toBeGreaterThan(0.8);
    }
  });

  it("preserves the untouched loop anchors around the slice", () => {
    // Bridge deck, farm spawn and harbor water are outside the envelope and
    // must keep working after the layout bump.
    expect(WorldLayout.isWater(WORLD_SPAWN.playerPosition.x, WORLD_SPAWN.playerPosition.z)).toBe(false);
    expect(WorldLayout.isWalkable(WORLD_SPAWN.playerPosition.x, WORLD_SPAWN.playerPosition.z)).toBe(true);
    const bridge = WorldLayout.landmark("bridge");
    expect(WorldLayout.isWalkable(bridge.x, bridge.z)).toBe(true);
    expect(WorldLayout.isSailable(15, 120)).toBe(true);
  });
});
