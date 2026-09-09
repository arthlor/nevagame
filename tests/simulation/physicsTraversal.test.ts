import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld";
import type { StaticCollisionProxy } from "../../src/physics/StaticCollision";
import { ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { Simulation } from "../../src/simulation/Simulation";
import { MOUNT_TUNING, playerPoseFromMount, STARTER_DONKEY_ID } from "../../src/simulation/mounts/Mounts";
import { HARBOR_DOCK, HARBOR_PIER_DECK } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";

/** Contract tolerance between the layout's traversal authority and Rapier contact. */
const SURFACE_AGREEMENT_METERS = 0.02;

function dockCollision(): StaticCollisionProxy[] {
  const layout = WorldLayout.landmark("dock");
  const root = new THREE.Object3D();
  root.position.set(layout.x, WorldLayout.terrainHeight(layout.x, layout.z) + layout.yOffset, layout.z);
  root.rotation.y = layout.rotationY;
  root.scale.setScalar(layout.scale);
  return projectAssetCollision(ASSET_IDS.DOCK_STRAIGHT_A, root, "dock");
}

/** A fence wall wide enough that a galloping mount cannot steer around it. */
function fenceWall(centerX: number, centerZ: number, sections: number): StaticCollisionProxy[] {
  const proxies: StaticCollisionProxy[] = [];
  for (let index = 0; index < sections; index++) {
    const x = centerX + (index - (sections - 1) / 2) * 2;
    const root = new THREE.Object3D();
    root.position.set(x, WorldLayout.traversalSurfaceHeight(x, centerZ), centerZ);
    root.updateMatrixWorld(true);
    proxies.push(...projectAssetCollision(ASSET_IDS.PROP_FENCE_WOOD_A, root, `fence-${index}`));
  }
  return proxies;
}

/**
 * Downward ray against the world's static geometry. This is the physical truth
 * the kinematic actor stands on, independent of the layout's own sampling. The
 * actor's own capsule is excluded, or a ray dropped over the player reports the
 * top of the player rather than the ground beneath their feet.
 */
async function contactProbe(physics: PhysicsWorld): Promise<(x: number, z: number) => number | null> {
  const { default: RAPIER } = await import("@dimforge/rapier3d-compat");
  const internals = physics as unknown as {
    world: InstanceType<typeof RAPIER.World>;
    playerBody: InstanceType<typeof RAPIER.RigidBody>;
  };
  return (x: number, z: number) => {
    const ray = new RAPIER.Ray({ x, y: 60, z }, { x: 0, y: -1, z: 0 });
    const hit = internals.world.castRay(
      ray, 240, true, undefined, undefined, undefined, internals.playerBody
    );
    return hit ? 60 - hit.timeOfImpact : null;
  };
}

function mountAt(simulation: Simulation, x: number, z: number, rotationY = 0): void {
  const mount = simulation.state.mounts[STARTER_DONKEY_ID];
  if (!mount) throw new Error("Missing starter donkey");
  Object.assign(mount, { x, y: WorldLayout.traversalSurfaceHeight(x, z), z, rotationY });
  Object.assign(simulation.state.player, playerPoseFromMount(mount), {
    activeBoatId: null,
    activeMountId: null,
    carriedFishCargoId: null,
    rotationY,
    traversal: { ...simulation.state.player.traversal, isGrounded: true }
  });
}

function placeOnFoot(simulation: Simulation, x: number, z: number): void {
  Object.assign(simulation.state.player, {
    x,
    y: WorldLayout.traversalSurfaceHeight(x, z) + 0.5,
    z,
    activeBoatId: null,
    activeMountId: null,
    traversal: { ...simulation.state.player.traversal, isGrounded: true }
  });
}

describe("physics traversal authority", () => {
  it("samples the terrain heightfield on the same triangles Rapier contacts", async () => {
    const physics = await PhysicsWorld.create();
    try {
      const probe = await contactProbe(physics);
      // Deliberately off-grid so every sample lands inside a cell rather than on
      // a shared edge, where either diagonal would agree by construction.
      let worst = 0;
      let worstAt = "";
      let compared = 0;
      for (let x = -120.37; x <= 120; x += 7.13) {
        for (let z = -120.41; z <= 120; z += 7.19) {
          const sample = WorldLayout.traversalSurfaceSample(x, z);
          // Only the bare heightfield is under test here; the road trimesh, the
          // authored decks and interiors each have their own authority.
          if (sample.source !== "terrain") continue;
          const contact = probe(x, z);
          if (contact === null) continue;
          compared++;
          const delta = Math.abs(sample.height - contact);
          if (delta > worst) {
            worst = delta;
            worstAt = `(${x.toFixed(2)}, ${z.toFixed(2)}) layout=${sample.height.toFixed(4)} rapier=${contact.toFixed(4)}`;
          }
        }
      }
      expect(compared).toBeGreaterThan(200);
      expect(worst, `worst divergence at ${worstAt}`).toBeLessThanOrEqual(SURFACE_AGREEMENT_METERS);
    } finally {
      physics.dispose();
    }
  }, 120_000);

  it("stands on the authored dock treads rather than a ramp above them", async () => {
    const physics = await PhysicsWorld.create(dockCollision());
    try {
      const probe = await contactProbe(physics);
      const dock = WorldLayout.landmark("dock");
      const southEdge = dock.z - HARBOR_PIER_DECK.halfLengthZ;
      let worst = 0;
      let worstAt = "";
      let onTreads = 0;
      // Offset off the 0.34 m tread pitch: the authored boxes overlap by 0.04 m,
      // and a ray dropped exactly on a shared edge may graze past the upper box
      // and report the lower one. Standing feet never occupy that measure-zero
      // set, so sampling it would test float tie-breaking, not the surface.
      for (let offset = -0.5 + 0.013; offset <= HARBOR_PIER_DECK.stairRun + 0.5; offset += 0.05) {
        const z = southEdge - offset;
        const contact = probe(dock.x, z);
        if (contact === null) continue;
        onTreads++;
        const delta = Math.abs(WorldLayout.traversalSurfaceHeight(dock.x, z) - contact);
        if (delta > worst) {
          worst = delta;
          worstAt = `z=${z.toFixed(3)} layout=${WorldLayout.traversalSurfaceHeight(dock.x, z).toFixed(4)} rapier=${contact.toFixed(4)}`;
        }
      }
      expect(onTreads).toBeGreaterThan(40);
      expect(worst, `worst divergence at ${worstAt}`).toBeLessThanOrEqual(SURFACE_AGREEMENT_METERS);

      // The treads are discrete boxes, so the sampled profile must be a
      // staircase: flat runs separated by risers, not a continuous slope.
      const heights: number[] = [];
      for (let offset = 0.013; offset < HARBOR_PIER_DECK.stairRun; offset += 0.05) {
        heights.push(WorldLayout.traversalSurfaceHeight(dock.x, southEdge - offset));
      }
      const flatSteps = heights.filter((height, index) => index > 0 && Math.abs(height - heights[index - 1]) < 1e-6);
      expect(flatSteps.length).toBeGreaterThan(heights.length / 2);
    } finally {
      physics.dispose();
    }
  }, 120_000);

  it("walks up and back down the dock stairs without losing contact with a tread", async () => {
    const physics = await PhysicsWorld.create(dockCollision());
    try {
      const probe = await contactProbe(physics);
      const dock = WorldLayout.landmark("dock");
      const southEdge = dock.z - HARBOR_PIER_DECK.halfLengthZ;
      const simulation = new Simulation();
      placeOnFoot(simulation, dock.x, southEdge - HARBOR_PIER_DECK.stairRun - 1.0);

      const climb = (direction: 1 | -1) => {
        let worstFloat = 0;
        for (let frame = 0; frame < 220; frame++) {
          const result = physics.step(
            simulation.state,
            { x: 0, z: direction, sprint: false },
            "on-foot",
            1 / 60,
            frame / 60
          );
          const commit = simulation.commitPhysicsFrame(result.frame);
          physics.onCommitResult(commit.success);
          expect(commit.success).toBe(true);
          const { x, z } = simulation.state.player;
          if (!WorldLayout.isPierStairs(x, z)) continue;
          const contact = probe(x, z);
          if (contact === null) continue;
          // The pose's feet must rest on the box the ray found, never hang above it.
          worstFloat = Math.max(worstFloat, Math.abs(simulation.state.player.y - 0.5 - contact));
        }
        return worstFloat;
      };

      const upward = climb(1);
      expect(simulation.state.player.z).toBeGreaterThan(southEdge);
      expect(WorldLayout.isPierDeck(simulation.state.player.x, simulation.state.player.z)).toBe(true);
      expect(upward).toBeLessThanOrEqual(SURFACE_AGREEMENT_METERS);

      const downward = climb(-1);
      expect(simulation.state.player.z).toBeLessThan(southEdge - HARBOR_PIER_DECK.stairRun);
      expect(downward).toBeLessThanOrEqual(SURFACE_AGREEMENT_METERS);
    } finally {
      physics.dispose();
    }
  }, 180_000);

  it("stops a galloping mount at a fence instead of tunnelling through it", async () => {
    const startZ = -60.5;
    const fenceZ = startZ + 9;
    const physics = await PhysicsWorld.create(fenceWall(-65, fenceZ, 9));
    try {
      const simulation = new Simulation();
      mountAt(simulation, -65, startZ);
      expect(simulation.boardMount().success).toBe(true);

      let peakSpeed = 0;
      for (let frame = 0; frame < 240; frame++) {
        const result = physics.step(
          simulation.state,
          { x: 0, z: 1, sprint: true },
          "mounted",
          1 / 60,
          frame / 60
        );
        const commit = simulation.commitPhysicsFrame(result.frame);
        physics.onCommitResult(commit.success);
        expect(commit.success).toBe(true);
        peakSpeed = Math.max(peakSpeed, result.playerMotion.speedMetersPerSecond);
        // Checked every frame, not only at the end: a tunnelling actor can be
        // past the fence mid-run and pushed back out before the loop finishes.
        expect(simulation.state.player.z).toBeLessThan(fenceZ);
      }
      // The run has to have actually reached a gallop for the barrier to mean
      // anything; a mount that crawled into the fence proves nothing.
      expect(peakSpeed).toBeGreaterThan(MOUNT_TUNING.gallopSpeedMetersPerSecond * 0.8);
      expect(simulation.state.player.z).toBeGreaterThan(startZ + 4);
    } finally {
      physics.dispose();
    }
  }, 180_000);

  it("keeps a boat at full throttle outside the pier pilings", async () => {
    const physics = await PhysicsWorld.create(dockCollision());
    try {
      const simulation = new Simulation();
      const boat = simulation.state.boats["boat.player_rowboat"];
      boat.isDocked = false;
      boat.dockedMarketId = null;
      // Approach the pilings broadside from open water south-west of the pier.
      boat.x = HARBOR_DOCK.boatPosition.x - 14;
      boat.z = HARBOR_DOCK.boatPosition.z;
      boat.headingRadians = Math.PI / 2;
      boat.speed = 0;
      Object.assign(simulation.state.player, {
        x: boat.x, y: boat.y + 0.5, z: boat.z, activeBoatId: boat.id, activeMountId: null
      });

      const pilingX = WorldLayout.landmark("dock").x;
      for (let frame = 0; frame < 480; frame++) {
        const result = physics.step(
          simulation.state,
          { x: 1, z: 0, sprint: true },
          "boat-driving",
          1 / 60,
          frame / 60
        );
        const commit = simulation.commitPhysicsFrame(result.frame);
        physics.onCommitResult(commit.success);
        expect(commit.success).toBe(true);
        // Pilings are 0.32 m half-width about the dock centreline; a hull that
        // reaches the centreline has passed through them.
        expect(boat.x).toBeLessThan(pilingX);
        expect(Math.abs(boat.y)).toBeLessThan(0.6);
      }
      expect(WorldLayout.isSailable(boat.x, boat.z)).toBe(true);
    } finally {
      physics.dispose();
    }
  }, 180_000);
});

describe("physics commit transaction", () => {
  /** Runs one rejected commit and reports the speed on the frame that follows it. */
  async function speedAfterRejectedCommit(reportOutcome: boolean): Promise<{ before: number; after: number }> {
    const physics = await PhysicsWorld.create();
    try {
      const simulation = new Simulation();
      placeOnFoot(simulation, -65, -60.5);
      // Build up real velocity first; a standing start has nothing to lose.
      for (let frame = 0; frame < 60; frame++) {
        const result = physics.step(simulation.state, { x: 0, z: 1, sprint: true }, "on-foot", 1 / 60, frame / 60);
        const commit = simulation.commitPhysicsFrame(result.frame);
        expect(commit.success).toBe(true);
        if (reportOutcome) physics.onCommitResult(true);
      }

      // A step whose pose the simulation refuses. GameState stays put; the
      // adapter must not.
      const rejected = physics.step(simulation.state, { x: 0, z: 1, sprint: true }, "on-foot", 1 / 60, 1);
      const before = rejected.playerMotion.speedMetersPerSecond;
      if (reportOutcome) physics.onCommitResult(false);

      const next = physics.step(simulation.state, { x: 0, z: 1, sprint: true }, "on-foot", 1 / 60, 61 / 60);
      return { before, after: next.playerMotion.speedMetersPerSecond };
    } finally {
      physics.dispose();
    }
  }

  it("carries velocity through a rejected commit instead of dropping a frame", async () => {
    const reported = await speedAfterRejectedCommit(true);
    expect(reported.before).toBeGreaterThan(1);
    // The rewind restores the accepted pose, so the following frame continues at
    // the speed it had rather than restarting from zero.
    expect(reported.after).toBeGreaterThan(reported.before * 0.9);
  }, 120_000);

  it("shows the resynchronisation hitch when the outcome is never reported", async () => {
    const silent = await speedAfterRejectedCommit(false);
    const reported = await speedAfterRejectedCommit(true);
    // Without the report the adapter stays ahead of GameState, and the next step
    // hard-resynchronises the body and clears its velocity. This is the defect
    // onCommitResult exists to close, asserted so the fix cannot quietly lapse.
    expect(silent.after).toBeLessThan(reported.after * 0.5);
  }, 180_000);
});
