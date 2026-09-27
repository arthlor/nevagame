import { describe, expect, it } from "vitest";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld";
import { Simulation } from "../../src/simulation/Simulation";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import {
  CARRIAGE_TUNING,
  STARTER_CARRIAGE_ID,
  carriageGroundResponseAt,
  isCarriageGround
} from "../../src/simulation/mounts/Carriage";
import { WorldLayout, type WorldRouteKind } from "../../src/world/WorldLayout";

function gradeNeutralHeading(x: number, z: number): number {
  const normal = WorldLayout.traversalSurfaceSample(x, z).normal;
  return Math.atan2(normal.z, -normal.x);
}

function roadSample(kind: WorldRouteKind): { x: number; z: number } {
  const routeId = {
    arterial: "mainland-pinewatch-reedhaven",
    lane: "village-homestead",
    trail: "cliffside-coastal-walk"
  }[kind];
  const route = WorldLayout.compiledRouteNetwork().find(entry => entry.route.id === routeId)!;
  // A dry stretch near the middle: a road past a lake shore is honestly wet ground.
  const middle = Math.floor(route.samples.length / 2);
  const sample = route.samples.slice(middle).concat(route.samples.slice(0, middle).reverse())
    .find(candidate => WorldLayout.waterSignedDistance(candidate.point.x, candidate.point.z) < -18)!;
  const { x, z } = sample.point;
  expect(route.route.kind).toBe(kind);
  expect(WorldLayout.nearestRouteDistance(x, z).route.kind).toBe(kind);
  expect(WorldLayout.traversalSurfaceSample(x, z).source).toBe("road");
  expect(WorldLayout.terrainSurfaceWeights(x, z).path).toBeGreaterThanOrEqual(CARRIAGE_TUNING.groundResponse.packedCoreFullWeight);
  expect(isCarriageGround({ x, z, rotationY: Math.atan2(sample.tangent.x, sample.tangent.z) })).toBe(true);
  return sample.point;
}

describe("carriage road physics", () => {
  it("distinguishes route kinds, shoulder and open ground using canonical world fields", () => {
    const scales = (["arterial", "lane", "trail"] as const).map(kind => {
      const point = roadSample(kind);
      return carriageGroundResponseAt(point.x, point.z, gradeNeutralHeading(point.x, point.z)).speedScale;
    });
    expect(scales[0]).toBeCloseTo(CARRIAGE_TUNING.groundResponse.roadSpeedScale.arterial, 4);
    expect(scales[1]).toBeCloseTo(CARRIAGE_TUNING.groundResponse.roadSpeedScale.lane, 4);
    expect(scales[2]).toBeCloseTo(CARRIAGE_TUNING.groundResponse.roadSpeedScale.trail, 4);

    const forest = WorldLayout.compiledRouteNetwork().find(route => route.route.id === "mainland-pinewatch-reedhaven")!;
    const sample = forest.samples[Math.floor(forest.samples.length / 2)];
    const atOffset = (distance: number) => ({
      x: sample.point.x + sample.normal.x * distance,
      z: sample.point.z + sample.normal.z * distance
    });
    const shoulder = atOffset(forest.halfWidth + forest.shoulderWidthMeters * 0.5);
    const open = atOffset(forest.halfWidth + forest.shoulderWidthMeters + forest.terrainFeatherMeters + 3);
    for (const point of [shoulder, open]) {
      expect(isCarriageGround({ ...point, rotationY: Math.atan2(sample.tangent.x, sample.tangent.z) })).toBe(true);
    }
    const shoulderResponse = carriageGroundResponseAt(shoulder.x, shoulder.z, gradeNeutralHeading(shoulder.x, shoulder.z));
    const openResponse = carriageGroundResponseAt(open.x, open.z, gradeNeutralHeading(open.x, open.z));
    expect(shoulderResponse.speedScale).toBeGreaterThan(openResponse.speedScale);
    expect(shoulderResponse.speedScale).toBeLessThan(scales[0]);
    expect(openResponse.accelerationScale).toBeLessThan(shoulderResponse.accelerationScale);
  });

  it("drives faster on a packed road than parallel open ground and reports the actual contact", async () => {
    const forest = WorldLayout.compiledRouteNetwork().find(route => route.route.id === "mainland-pinewatch-reedhaven")!;
    const sample = forest.samples[Math.floor(forest.samples.length / 2)];
    const heading = Math.atan2(sample.tangent.x, sample.tangent.z);
    const openOffset = forest.halfWidth + forest.shoulderWidthMeters + forest.terrainFeatherMeters + 3;
    const openPoint = {
      x: sample.point.x + sample.normal.x * openOffset,
      z: sample.point.z + sample.normal.z * openOffset
    };

    async function drive(start: { x: number; z: number }) {
      const simulation = new Simulation(createInitialGameState(42));
      const cart = simulation.state.mounts[STARTER_CARRIAGE_ID];
      Object.assign(cart, start, {
        y: WorldLayout.traversalSurfaceHeight(start.x, start.z), rotationY: heading
      });
      Object.assign(simulation.state.player, start, {
        y: cart.y + 0.5, rotationY: heading, activeBoatId: null, activeMountId: STARTER_CARRIAGE_ID
      });
      simulation.state.player.traversal.isGrounded = true;
      const physics = await PhysicsWorld.create();
      try {
        let lastSurface = "unknown";
        let lastSpeed = 0;
        for (let tick = 0; tick < 40; tick++) {
          const result = physics.step(simulation.state, { x: 0, z: -1, sprint: false }, "mounted", 0.05, tick * 0.05);
          const commit = simulation.commitPhysicsFrame(result.frame);
          physics.onCommitResult(commit.success);
          expect(commit.success, commit.reason).toBe(true);
          expect(result.playerMotion.isCollisionBlocked).toBe(false);
          lastSurface = result.playerMotion.contactSurface;
          lastSpeed = result.playerMotion.speedMetersPerSecond;
        }
        return { speed: lastSpeed, surface: lastSurface, x: cart.x, z: cart.z };
      } finally {
        physics.dispose();
      }
    }

    const packed = await drive(sample.point);
    const open = await drive(openPoint);
    expect(packed.speed).toBeGreaterThan(open.speed + 0.2);
    expect(packed.surface).toBe("path");
    expect(open.surface).toBe(WorldLayout.terrainSurface(open.x, open.z));
    expect(open.surface).not.toBe("path");
  }, 60_000);
});
