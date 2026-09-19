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

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071],
  [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071]
];

describe("fine stuck scan with recovery", () => {
  it("finds mountable start points that cannot move in any direction", async () => {
    const physics = await PhysicsWorld.create(collision);
    const dt = 1 / 30;
    const found: Array<{ x: number; z: number; travel: number }> = [];
    try {
      for (let x = -48; x <= -14; x += 1) {
        for (let z = -152; z <= -128; z += 1) {
          if (!isMountableTraversalPoint(x, z)) continue;
          const sim = new Simulation(createInitialGameState(42));
          const mount = sim.state.mounts[STARTER_DONKEY_ID]!;
          const ground = WorldLayout.traversalSurfaceHeight(x, z);
          let maxTravel = 0;
          for (const [dx, dz] of DIRECTIONS) {
            Object.assign(sim.state.player, {
              x, y: ground + 0.5, z,
              activeBoatId: null, activeMountId: STARTER_DONKEY_ID
            });
            sim.state.player.traversal.isGrounded = true;
            Object.assign(mount, { x, y: ground, z, rotationY: 0 });
            let ticks = 0;
            for (let step = 0; step < 24; step++) {
              const result = physics.step(
                sim.state,
                { x: dx, z: dz, sprint: false },
                "mounted",
                dt,
                ticks++ * dt
              );
              const commit = sim.commitPhysicsFrame(result.frame);
              physics.onCommitResult(commit.success);
            }
            maxTravel = Math.max(
              maxTravel,
              Math.hypot(sim.state.player.x - x, sim.state.player.z - z)
            );
          }
          if (maxTravel < 0.4) found.push({ x, z, travel: maxTravel });
        }
      }
    } finally {
      physics.dispose();
    }
    for (const point of found) {
      console.log(`WEDGE ${point.x},${point.z} travel=${point.travel.toFixed(2)}`);
    }
    console.log(`remaining wedges: ${found.length}`);
  }, 900_000);
});
