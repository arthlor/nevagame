import { describe, expect, it, vi } from "vitest";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld";
import { Simulation } from "../../src/simulation/Simulation";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { MOUNTED_RECOVERY_TUNING, isMountedFootprintSupported } from "../../src/simulation/mounts/MountedRecovery";
import { playerPoseFromMount, STARTER_DONKEY_ID } from "../../src/simulation/mounts/Mounts";
import { STARTER_CARRIAGE_ID, carriagePoint, carriageTuning } from "../../src/simulation/mounts/Carriage";
import { WorldLayout } from "../../src/world/WorldLayout";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import type { StaticCollisionProxy } from "../../src/physics/StaticCollision";

function rider(mountId: string): Simulation {
  const sim = new Simulation(createInitialGameState(42));
  const mount = sim.state.mounts[mountId];
  const spawn = sim.state.player;
  for (let r = 10; r < 35; r += 2) for (let a = 0; a < 16; a++) {
    const x = spawn.x + Math.sin(a * Math.PI / 8) * r;
    const z = spawn.z + Math.cos(a * Math.PI / 8) * r;
    const candidate = { ...mount, x, z, y: WorldLayout.traversalSurfaceHeight(x, z), rotationY: 0 };
    if (!isMountedFootprintSupported(candidate)) continue;
    Object.assign(mount, candidate, { gallopStamina: 37, gallopRecoveryDelaySeconds: 0.7 });
    Object.assign(sim.state.player, playerPoseFromMount(mount), { activeMountId: mountId });
    return sim;
  }
  throw new Error("No supported fixture pose near the farm");
}

function box(x: number, y: number, z: number): StaticCollisionProxy {
  return { kind: "box", id: "recovery.obstacle", center: { x, y: y + 1, z },
    halfExtents: { x: 0.25, y: 1, z: 0.25 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
}

describe("mounted Safe Return", () => {
  it.each([STARTER_DONKEY_ID, STARTER_CARRIAGE_ID])("clears the full %s locally and preserves attachment, stamina and cargo", async mountId => {
    const sim = rider(mountId);
    const mount = sim.state.mounts[mountId];
    if (mountId === STARTER_CARRIAGE_ID) {
      mount.fishCargoSlotIds![0] = "cargo.recovery";
      sim.state.fishCargo["cargo.recovery"] = { id: "cargo.recovery", speciesId: "fish.trout", quality: "fine", weightKg: 3,
        caughtAtMinute: sim.state.clock.currentMinute, freshness: 83, cargoClass: "small",
        location: { type: "carriage", containerId: mount.id, slotIndex: 0 } };
    }
    const before = structuredClone(sim.state);
    // A horse obstruction is far ahead of the rider; checking only the center would miss it.
    const blocking = mountId === STARTER_CARRIAGE_ID
      ? carriagePoint(mount, 0, carriageTuning(mount).horseOffset + 0.5) : mount;
    const physics = await PhysicsWorld.create([box(blocking.x, mount.y, blocking.z)]);
    try {
      sim.setMountPoseClearQuery((pose, from) => physics.isMountPoseClear(pose, sim.state, from));
      expect(physics.isMountPoseClear(mount, sim.state)).toBe(false);
      const result = sim.execute({ type: "player.reset-safe" });
      expect(result.success, result.reason).toBe(true);
      expect(Math.hypot(mount.x - before.mounts[mountId].x, mount.z - before.mounts[mountId].z)).toBeLessThanOrEqual(2.050001);
      expect(physics.isMountPoseClear(mount, sim.state)).toBe(true);
      expect(isMountedFootprintSupported(mount)).toBe(true);
      expect(sim.state.player).toMatchObject({ ...playerPoseFromMount(mount), activeMountId: mountId });
      expect(mount.gallopStamina).toBe(37);
      expect(mount.gallopRecoveryDelaySeconds).toBe(0.7);
      expect(mount.fishCargoSlotIds).toEqual(before.mounts[mountId].fishCargoSlotIds);
      expect(sim.state.fishCargo).toEqual(before.fishCargo);
      expect(sim.state.player.workCapacity).toEqual(before.player.workCapacity);
      expect(sim.state.metadata).toEqual(before.metadata);
      const envelope = { schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 1, state: structuredClone(sim.state) };
      expect(validateSaveEnvelope(envelope)).toBe(true);
      const repeated = structuredClone(sim.state);
      expect(sim.execute({ type: "player.reset-safe" }).success).toBe(false);
      expect(sim.state).toEqual(repeated);
      const restored = new Simulation(envelope.state);
      expect(restored.state.mounts).toEqual(sim.state.mounts);
      expect(restored.state.player.activeMountId).toBe(mountId);
    } finally { physics.dispose(); }
  }, 120_000);

  it("refuses exhausted searches, missing physics and query errors without any mutation", () => {
    const sim = rider(STARTER_CARRIAGE_ID);
    const before = structuredClone(sim.state);
    expect(sim.execute({ type: "player.reset-safe" }).success).toBe(false);
    sim.setMountPoseClearQuery(() => false);
    expect(sim.execute({ type: "player.reset-safe" }).success).toBe(false);
    expect(sim.state).toEqual(before);
    sim.setMountPoseClearQuery(() => { throw new Error("query unavailable"); });
    expect(sim.execute({ type: "player.reset-safe" }).success).toBe(false);
    expect(sim.state).toEqual(before);
    expect(MOUNTED_RECOVERY_TUNING.candidateRadiiMeters.at(-1)).toBe(2.05);
  });

  it("does not turn a clear endpoint beyond a second obstacle into a recovery shortcut", async () => {
    const sim = rider(STARTER_DONKEY_ID), mount = sim.state.mounts[STARTER_DONKEY_ID];
    const physics = await PhysicsWorld.create([box(mount.x, mount.y, mount.z), box(mount.x + 1.05, mount.y, mount.z)]);
    try {
      const endpoint = { ...mount, x: mount.x + 2.05 };
      expect(physics.isMountPoseClear(endpoint, sim.state)).toBe(true);
      expect(physics.isMountPoseClear(endpoint, sim.state, mount)).toBe(false);
    } finally { physics.dispose(); }
  });

  it("checks rider headroom along the short recovery path", async () => {
    const sim = rider(STARTER_DONKEY_ID), mount = sim.state.mounts[STARTER_DONKEY_ID];
    const beam: StaticCollisionProxy = { kind: "box", id: "recovery.beam",
      center: { x: mount.x + 1.05, y: mount.y + 2.16, z: mount.z },
      halfExtents: { x: .08, y: .05, z: 5 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
    const physics = await PhysicsWorld.create([box(mount.x, mount.y, mount.z), beam]);
    try {
      const endpoint = { ...mount, x: mount.x + 2.05 };
      expect(physics.isMountPoseClear(endpoint, sim.state)).toBe(true);
      expect(physics.isMountPoseClear(endpoint, sim.state, mount)).toBe(false);
    } finally { physics.dispose(); }
  });

  it("rejects a carriage footprint spanning an abrupt height change", () => {
    const sim = rider(STARTER_CARRIAGE_ID), mount = sim.state.mounts[STARTER_CARRIAGE_ID];
    const height = WorldLayout.traversalSurfaceHeight.bind(WorldLayout);
    const discontinuity = vi.spyOn(WorldLayout, "traversalSurfaceHeight").mockImplementation((x, z) =>
      height(x, z) + (z > mount.z + 1.8 ? 2 : 0));
    try { expect(isMountedFootprintSupported(mount)).toBe(false); }
    finally { discontinuity.mockRestore(); }
  });

  it("refuses a short route across unsupported ground even when its endpoint is clear", () => {
    const sim = rider(STARTER_DONKEY_ID), origin = sim.state.mounts[STARTER_DONKEY_ID].x;
    const before = structuredClone(sim.state), walkable = WorldLayout.isWalkable.bind(WorldLayout);
    const gap = vi.spyOn(WorldLayout, "isWalkable").mockImplementation((x, z) =>
      !(x > origin + .6 && x < origin + 1.2) && walkable(x, z));
    try {
      sim.setMountPoseClearQuery(pose => pose.x > origin + 1.8);
      expect(sim.execute({ type: "player.reset-safe" }).success).toBe(false);
      expect(sim.state).toEqual(before);
    } finally { gap.mockRestore(); }
  });
});
