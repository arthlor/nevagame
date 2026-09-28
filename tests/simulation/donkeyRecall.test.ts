import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { STARTER_DONKEY_ID, isMountableTraversalPoint, isValidMountPose, MOUNT_TUNING } from "../../src/simulation/mounts/Mounts";
import { MOUNT_RECALL_TUNING } from "../../src/simulation/mounts/MountRecall";
import { WorldLayout } from "../../src/world/WorldLayout";

/** Stands the player on open mountable ground `distance` metres from the donkey. */
function standAway(sim: Simulation, distance: number): void {
  const donkey = sim.state.mounts[STARTER_DONKEY_ID]!;
  for (let step = 0; step < 64; step++) {
    const angle = (step / 64) * Math.PI * 2;
    const x = donkey.x + Math.sin(angle) * distance;
    const z = donkey.z + Math.cos(angle) * distance;
    const open = [0, Math.PI / 2, Math.PI, -Math.PI / 2].every((a) =>
      isMountableTraversalPoint(x + Math.sin(a) * 3.5, z + Math.cos(a) * 3.5));
    if (!isMountableTraversalPoint(x, z) || !open) continue;
    Object.assign(sim.state.player, { x, z, rotationY: 0.4, y: WorldLayout.traversalSurfaceHeight(x, z) + MOUNT_TUNING.playerPoseGroundOffsetMeters });
    return;
  }
  throw new Error("no open ground at that distance");
}

describe("calling the donkey", () => {
  it("places the one owned donkey beside the player on valid ground, from any distance", () => {
    const sim = new Simulation();
    standAway(sim, 120);
    const mounts = Object.keys(sim.state.mounts).length;
    const recalled: string[] = [];
    sim.events.on("MountRecalled", ({ mountId }) => recalled.push(mountId));

    expect(sim.execute({ type: "mount.call" }).success).toBe(true);
    const donkey = sim.state.mounts[STARTER_DONKEY_ID]!;
    const gap = Math.hypot(donkey.x - sim.state.player.x, donkey.z - sim.state.player.z);
    expect(recalled).toEqual([STARTER_DONKEY_ID]);
    expect(gap).toBeGreaterThanOrEqual(MOUNT_RECALL_TUNING.candidateRadiiMeters[0] - 1e-6);
    expect(gap).toBeLessThanOrEqual(MOUNT_RECALL_TUNING.candidateRadiiMeters.at(-1)! + 1e-6);
    expect(gap).toBeLessThanOrEqual(MOUNT_TUNING.boardRadiusMeters + 1e-6);
    expect(isValidMountPose(donkey)).toBe(true);
    expect(donkey.rotationY).toBeCloseTo(sim.state.player.rotationY);
    expect(Object.keys(sim.state.mounts)).toHaveLength(mounts);

    // A second press has nothing to do and moves nothing.
    const placed = { ...donkey };
    expect(sim.execute({ type: "mount.call" })).toMatchObject({ success: false, reasonCode: "nearby" });
    expect(sim.state.mounts[STARTER_DONKEY_ID]).toEqual(placed);
    expect(recalled).toHaveLength(1);
  });

  it("refuses without a donkey or while riding, and never moves it on a refusal", () => {
    const sim = new Simulation();
    standAway(sim, 30);
    sim.state.player.activeMountId = STARTER_DONKEY_ID;
    expect(sim.execute({ type: "mount.call" })).toMatchObject({ success: false, reasonCode: "riding" });
    sim.state.player.activeMountId = null;
    delete sim.state.mounts[STARTER_DONKEY_ID];
    expect(sim.execute({ type: "mount.call" })).toMatchObject({ success: false, reasonCode: "no-mount" });
  });

  it("stays put when every spot beside the player is blocked", () => {
    const sim = new Simulation();
    standAway(sim, 30);
    const start = { ...sim.state.mounts[STARTER_DONKEY_ID]! };
    sim.setMountPathQuery(() => false);
    expect(sim.execute({ type: "mount.call" })).toMatchObject({ success: false, reasonCode: "no-safe-spot" });
    expect(sim.state.mounts[STARTER_DONKEY_ID]).toEqual(start);
  });

  it("does not call the donkey to a player standing in water", () => {
    const sim = new Simulation();
    const start = { ...sim.state.mounts[STARTER_DONKEY_ID]! };
    let water: { x: number; z: number } | null = null;
    for (let r = 20; r < 400 && !water; r += 10) {
      for (let a = 0; a < 16 && !water; a++) {
        const x = start.x + Math.sin(a) * r;
        const z = start.z + Math.cos(a) * r;
        if (WorldLayout.isWater(x, z)) water = { x, z };
      }
    }
    Object.assign(sim.state.player, water!);
    expect(sim.execute({ type: "mount.call" })).toMatchObject({ success: false, reasonCode: "unreachable" });
    expect(sim.state.mounts[STARTER_DONKEY_ID]).toEqual(start);
  });

  it("keeps the placed pose through save and load", () => {
    const sim = new Simulation();
    standAway(sim, 40);
    expect(sim.execute({ type: "mount.call" }).success).toBe(true);
    const loaded = new Simulation(structuredClone(sim.getState()));
    expect(loaded.state.mounts[STARTER_DONKEY_ID]).toEqual(sim.state.mounts[STARTER_DONKEY_ID]);
  });
});
