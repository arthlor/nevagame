import * as THREE from "three";
import { describe, it } from "vitest";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld";
import { ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { Simulation } from "../../src/simulation/Simulation";
import { BRIDGE_WORLD_PROFILE, WORLD_LAYOUT_V5, WorldLayout } from "../../src/world/WorldLayout";

function bridgeCollision() {
  const layout = WorldLayout.landmark("bridge");
  const root = new THREE.Object3D();
  root.position.set(layout.x, WorldLayout.terrainHeight(layout.x, layout.z) + layout.yOffset, layout.z);
  root.rotation.y = layout.rotationY;
  root.scale.setScalar(layout.scale);
  return projectAssetCollision(ASSET_IDS.BRIDGE_STONE_A, root, "bridge");
}

describe("temporary bridge browser comparison", () => {
  it("logs direct and camera-equivalent east traversal", async () => {
    for (const label of ["direct", "camera-equivalent"] as const) {
      const physics = await PhysicsWorld.create(bridgeCollision());
      const sim = new Simulation();
      const bridge = WORLD_LAYOUT_V5.anchors.bridge;
      Object.assign(sim.state.player, {
        x: bridge.x - BRIDGE_WORLD_PROFILE.spanLength * 0.5 - 1.6,
        y: WorldLayout.terrainHeight(bridge.x - BRIDGE_WORLD_PROFILE.spanLength * 0.5 - 1.6, bridge.z) + 0.5,
        z: bridge.z
      });
      for (let index = 0; index < 240; index++) {
        const input = label === "direct" ? { x: 1, z: 0, sprint: false } : { x: 1, z: 0.0001, sprint: false };
        const result = physics.step(sim.state, input, "on-foot", 1 / 60, index / 60);
        sim.commitPhysicsFrame(result.frame);
        if (index % 30 === 0 || (sim.state.player.x > -22 && sim.state.player.x < -20)) {
          console.log(label, index, sim.state.player.x.toFixed(3), sim.state.player.z.toFixed(3), result.playerMotion.isCollisionBlocked);
        }
      }
      physics.dispose();
    }
  });
});
