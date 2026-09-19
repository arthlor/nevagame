import { beforeAll, describe, it } from "vitest";
import { Object3D } from "three";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld";
import type { StaticCollisionProxy } from "../../src/physics/StaticCollision";
import type { AssetId } from "../../src/render/assets/AssetCatalog";
import { Simulation } from "../../src/simulation/Simulation";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { isMountableTraversalPoint, STARTER_DONKEY_ID } from "../../src/simulation/mounts/Mounts";
import { createWorldStaticPlacements } from "../../src/world/WorldEnvironmentLayout";
import { WorldLayout } from "../../src/world/WorldLayout";

let collision: StaticCollisionProxy[] = [];
beforeAll(() => {
  collision = createWorldStaticPlacements(42).flatMap((placement) => {
    const root = new Object3D();
    root.position.set(
      placement.x,
      placement.y ?? WorldLayout.terrainHeight(placement.x, placement.z),
      placement.z
    );
    root.rotation.y = placement.rotationY;
    root.scale.set(...placement.scale);
    return projectAssetCollision(placement.assetId as AssetId, root, placement.id);
  });
}, 120_000);

describe("former wedges", () => {
  it("escapes the two recorded overlap poses", async () => {
    const physics = await PhysicsWorld.create(collision);
    const dt = 1 / 30;
    try {
      for (const [x, z] of [[-38, -138], [-22, -131]] as const) {
        console.log(`point ${x},${z} mountable=${isMountableTraversalPoint(x, z)}`);
        if (!isMountableTraversalPoint(x, z)) continue;
        const trips: number[] = [];
        for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
          const sim = new Simulation(createInitialGameState(42));
          const mount = sim.state.mounts[STARTER_DONKEY_ID]!;
          const ground = WorldLayout.traversalSurfaceHeight(x, z);
          Object.assign(sim.state.player, {
            x, y: ground + 0.5, z, activeBoatId: null, activeMountId: STARTER_DONKEY_ID
          });
          sim.state.player.traversal.isGrounded = true;
          Object.assign(mount, { x, y: ground, z, rotationY: 0 });
          let ticks = 0;
          for (let step = 0; step < 90; step++) {
            const result = physics.step(sim.state, { x: dx, z: dz, sprint: false }, "mounted", dt, ticks++ * dt);
            const commit = sim.commitPhysicsFrame(result.frame);
            physics.onCommitResult(commit.success);
          }
          trips.push(Math.hypot(sim.state.player.x - x, sim.state.player.z - z));
        }
        console.log(`  travel ${trips.map(value => value.toFixed(2)).join(" ")}`);
      }
    } finally {
      physics.dispose();
    }
  }, 300_000);
});
