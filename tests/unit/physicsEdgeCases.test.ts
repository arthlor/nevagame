import { describe, expect, it } from "vitest";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld";
import { Simulation } from "../../src/simulation/Simulation";
import { HARBOR_DOCK } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";

describe("PhysicsWorld Edge Cases", () => {
  it("resolves corner entrapment by sliding along perpendicular collision walls without jitter", async () => {
    const origin = { x: -65, z: -55 };
    const ground = WorldLayout.terrainHeight(origin.x, origin.z);
    // Two walls forming an L-shaped corner two metres from a flat farm origin.
    const physics = await PhysicsWorld.create([
      {
        kind: "box",
        id: "wall-x",
        center: { x: origin.x + 2, y: ground + 1, z: origin.z },
        halfExtents: { x: 0.3, y: 1, z: 3 },
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      },
      {
        kind: "box",
        id: "wall-z",
        center: { x: origin.x, y: ground + 1, z: origin.z + 2 },
        halfExtents: { x: 3, y: 1, z: 0.3 },
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      }
    ]);
    const sim = new Simulation();
    sim.state.player.x = origin.x;
    sim.state.player.z = origin.z;
    sim.state.player.y = ground + 0.5;

    // Push into the corner at 45 degrees
    for (let index = 0; index < 60; index++) {
      const frame = physics.step(
        sim.state,
        { x: 1, z: 1, sprint: true },
        "on-foot",
        1 / 60,
        index / 60
      );
      expect(sim.commitPhysicsFrame(frame.frame).success).toBe(true);
    }

    // Player should be stopped before entering the walls (wall-x starts at x=1.7, wall-z starts at z=1.7)
    expect(sim.state.player.x).toBeLessThan(origin.x + 1.5);
    expect(sim.state.player.z).toBeLessThan(origin.z + 1.5);
    expect(sim.state.player.x).toBeGreaterThan(origin.x + 0.5);
    expect(sim.state.player.z).toBeGreaterThan(origin.z + 0.5);
  });

  it("prevents sprint tunneling through thin collision barriers", async () => {
    const origin = { x: -65, z: -55 };
    const ground = WorldLayout.terrainHeight(origin.x, origin.z);
    const physics = await PhysicsWorld.create([
      {
        kind: "box",
        id: "thin-fence",
        center: { x: origin.x, y: ground + 1, z: origin.z + 1.5 },
        halfExtents: { x: 5, y: 1, z: 0.08 },
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      }
    ]);
    const sim = new Simulation();
    sim.state.player.x = origin.x;
    sim.state.player.z = origin.z;
    sim.state.player.y = ground + 0.5;

    // Sprint directly forward at 7.4 m/s for 30 frames (0.5s = ~3.7m travel)
    for (let index = 0; index < 30; index++) {
      const frame = physics.step(
        sim.state,
        { x: 0, z: 1, sprint: true },
        "on-foot",
        1 / 60,
        index / 60
      );
      sim.commitPhysicsFrame(frame.frame);
    }

    // Barrier is at z=1.5 with half-extent 0.08 (starts at z=1.42), player capsule radius is ~0.34
    expect(sim.state.player.z).toBeLessThan(origin.z + 1.2);
    expect(sim.state.player.z).toBeGreaterThan(origin.z + 0.5);
  });

  it("recovers player to valid terrain height when spawned below ground level", async () => {
    const physics = await PhysicsWorld.create();
    const sim = new Simulation();
    const ground = WorldLayout.terrainHeight(0, 0);
    // Spawn 5 meters underground
    sim.state.player.x = 0;
    sim.state.player.z = 0;
    sim.state.player.y = ground - 5.0;

    const frame = physics.step(
      sim.state,
      { x: 0, z: 0, sprint: false },
      "on-foot",
      1 / 60,
      0
    );
    expect(frame.frame.player.y).toBeGreaterThanOrEqual(ground + 0.49);
    expect(sim.commitPhysicsFrame(frame.frame).success).toBe(true);
  });

  it("stops boats in reverse when reversing into a static pier", async () => {
    const barrierZ = HARBOR_DOCK.boatPosition.z + 2;
    const physics = await PhysicsWorld.create([
      {
        kind: "box",
        id: "rear-pier",
        center: { x: HARBOR_DOCK.boatPosition.x, y: 0.5, z: barrierZ },
        halfExtents: { x: 4, y: 1, z: 0.3 },
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      }
    ]);
    const sim = new Simulation();
    const boat = sim.state.boats["boat.player_rowboat"];
    boat.isDocked = false;
    boat.dockedMarketId = null;
    boat.x = HARBOR_DOCK.boatPosition.x;
    boat.z = barrierZ - 1.5;
    boat.headingRadians = 0;
    sim.state.player.activeBoatId = boat.id;

    for (let index = 0; index < 60; index++) {
      const frame = physics.step(
        sim.state,
        { x: 0, z: 1, sprint: false },
        "boat-driving",
        1 / 60,
        index / 60
      );
      sim.commitPhysicsFrame(frame.frame);
    }

    expect(Number.isFinite(boat.x)).toBe(true);
    expect(Number.isFinite(boat.z)).toBe(true);
    expect(Number.isFinite(boat.speed)).toBe(true);
    expect(Number.isFinite(boat.headingRadians)).toBe(true);
  });

  it("maintains numerical stability and control under extreme storm sea roughness", async () => {
    const physics = await PhysicsWorld.create();
    const sim = new Simulation();
    const boat = sim.state.boats["boat.player_rowboat"];
    boat.isDocked = false;
    boat.dockedMarketId = null;
    sim.state.player.activeBoatId = boat.id;
    sim.state.weather.seaRoughness = 1.0; // Extreme storm

    for (let index = 0; index < 120; index++) {
      const frame = physics.step(
        sim.state,
        { x: 0.8, z: -1, sprint: false },
        "boat-driving",
        1 / 60,
        index / 60
      );
      sim.commitPhysicsFrame(frame.frame);
    }

    expect(Number.isFinite(boat.x)).toBe(true);
    expect(Number.isFinite(boat.z)).toBe(true);
    expect(Number.isFinite(boat.speed)).toBe(true);
    expect(Number.isFinite(boat.headingRadians)).toBe(true);
    expect(boat.speed).toBeGreaterThan(0);
  });

  it("handles non-finite NaN / Infinity inputs and zero dt gracefully without poisoning state", async () => {
    const physics = await PhysicsWorld.create();
    const sim = new Simulation();

    // Pass NaN inputs and 0 dt
    const nanFrame = physics.step(
      sim.state,
      { x: NaN, z: Infinity, sprint: false },
      "on-foot",
      0,
      0
    );
    expect(Number.isFinite(nanFrame.frame.player.x)).toBe(true);
    expect(Number.isFinite(nanFrame.frame.player.y)).toBe(true);
    expect(Number.isFinite(nanFrame.frame.player.z)).toBe(true);
    expect(Number.isFinite(nanFrame.frame.player.rotationY)).toBe(true);
    expect(Number.isFinite(nanFrame.playerMotion.speedMetersPerSecond)).toBe(true);
    expect(Number.isFinite(nanFrame.playerMotion.turnRateRadiansPerSecond)).toBe(true);

    // Normal step following NaN step should work cleanly
    const normalFrame = physics.step(
      sim.state,
      { x: 0, z: 1, sprint: false },
      "on-foot",
      1 / 60,
      1 / 60
    );
    expect(sim.commitPhysicsFrame(normalFrame.frame).success).toBe(true);
  });

  it("maintains smooth reverse steering direction from a stationary start without flipping", async () => {
    const physics = await PhysicsWorld.create();
    const sim = new Simulation();
    const boat = sim.state.boats["boat.player_rowboat"];
    boat.isDocked = false;
    boat.dockedMarketId = null;
    boat.speed = 0;
    boat.headingRadians = 0;
    sim.state.player.activeBoatId = boat.id;

    // Steer right (x: 1) while in reverse (z: 1, throttle: -1)
    const headings: number[] = [];
    for (let index = 0; index < 30; index++) {
      const frame = physics.step(
        sim.state,
        { x: 1, z: 1, sprint: false },
        "boat-driving",
        1 / 60,
        index / 60
      );
      sim.commitPhysicsFrame(frame.frame);
      headings.push(boat.headingRadians);
    }

    // Heading should monotonically turn in reverse direction (negative) without suddenly flipping
    expect(boat.headingRadians).toBeLessThan(0);
    for (let index = 1; index < headings.length; index++) {
      expect(headings[index]).toBeLessThanOrEqual(headings[index - 1] + 0.0001);
    }
  });

  it("slides along angled shorelines without halting player forward movement", async () => {
    const physics = await PhysicsWorld.create();
    const sim = new Simulation();
    // Spawn near river bank where water distance gradient is non-axis-aligned
    const origin = { x: -8.0, z: -10.0 };
    sim.state.player.x = origin.x;
    sim.state.player.z = origin.z;
    sim.state.player.y = WorldLayout.terrainHeight(origin.x, origin.z) + 0.5;

    // Push towards the river at an angle
    for (let index = 0; index < 60; index++) {
      const frame = physics.step(
        sim.state,
        { x: -1, z: 1, sprint: false },
        "on-foot",
        1 / 60,
        index / 60
      );
      sim.commitPhysicsFrame(frame.frame);
    }

    // Player should have made forward progress along Z without entering the water
    expect(sim.state.player.z).toBeGreaterThan(origin.z + 1.0);
    expect(WorldLayout.isWater(sim.state.player.x, sim.state.player.z)).toBe(false);
  });
});
