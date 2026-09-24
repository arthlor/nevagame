import { Object3D } from "three";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter.ts";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld.ts";
import { ASSET_BY_ID } from "../../src/render/assets/AssetCatalog.ts";
import { Simulation } from "../../src/simulation/Simulation.ts";
import { PLAYER_TRAVERSAL_TUNING } from "../../src/simulation/navigation/PlayerTraversal.ts";
import { createWorldEnvironmentLayout } from "../../src/world/WorldEnvironmentLayout.ts";
import { WorldLayout } from "../../src/world/WorldLayout.ts";

const startedAt = Date.now();
const placements = createWorldEnvironmentLayout(42).staticPlacements;
const proxies = [];
for (const placement of placements) {
  if (ASSET_BY_ID.get(placement.assetId)?.collision === "none") continue;
  const root = new Object3D();
  root.position.set(placement.x, placement.y ?? WorldLayout.terrainHeight(placement.x, placement.z), placement.z);
  root.rotation.y = placement.rotationY;
  root.scale.set(...placement.scale);
  proxies.push(...projectAssetCollision(placement.assetId, root, placement.id));
}

const route = [{ x: -175, z: -68 }, { x: -179, z: -64 }, { x: -183, z: -60 }];
const physics = await PhysicsWorld.create(proxies);
const sim = new Simulation();
Object.assign(sim.state.player, {
  x: route[0].x,
  z: route[0].z,
  y: WorldLayout.traversalSurfaceHeight(route[0].x, route[0].z) + 0.5,
  activeBoatId: null,
  activeMountId: null
});
sim.state.player.traversal.isGrounded = true;
let ticks = 0;
const output = { points: [], elapsedMs: 0, status: "running" };
try {
  for (const target of route.slice(1)) {
    const initialDistance = Math.hypot(target.x - sim.state.player.x, target.z - sim.state.player.z);
    const allowedTicks = Math.ceil((initialDistance + 2) / PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond * 60 * 3);
    let reached = false;
    for (let tick = 0; tick < allowedTicks; tick++) {
      const dx = target.x - sim.state.player.x;
      const dz = target.z - sim.state.player.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.3) { reached = true; break; }
      const result = physics.step(sim.state, { x: dx / distance, z: dz / distance, sprint: false }, "on-foot", 1 / 60, ticks / 60);
      const committed = sim.commitPhysicsFrame(result.frame);
      physics.onCommitResult(committed.success);
      ticks++;
      const p = sim.state.player;
      if (!committed.success) throw new Error(`frame rejected at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
      if (WorldLayout.isWater(p.x, p.z)) throw new Error(`water at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
      if (!result.playerMotion.isGrounded) throw new Error(`lost ground at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
      if (tick === allowedTicks - 1) {
        output.points.push({ target, reached, ticks, position: { x: p.x, z: p.z }, distance: Math.hypot(target.x - p.x, target.z - p.z) });
      }
    }
    if (!reached) {
      const p = sim.state.player;
      output.points.push({ target, reached, ticks, position: { x: p.x, z: p.z }, distance: Math.hypot(target.x - p.x, target.z - p.z) });
      output.status = "stalled";
      break;
    }
    output.points.push({ target, reached, ticks, position: { x: sim.state.player.x, z: sim.state.player.z } });
  }
  if (output.status === "running") output.status = "reached-bounded-contour";
} catch (error) {
  output.status = "collision-or-frame-error";
  output.error = String(error);
} finally {
  output.elapsedMs = Date.now() - startedAt;
  physics.dispose();
}
console.log(JSON.stringify({ ...output, proxyCount: proxies.length, placements: placements.length }, null, 2));
