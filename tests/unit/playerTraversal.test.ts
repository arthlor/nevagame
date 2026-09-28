import { describe, expect, it } from "vitest";
import {
  advancePlayerTraversal,
  createFullPlayerTraversalState,
  PLAYER_TRAVERSAL_TUNING,
  slopeGaitScale
} from "../../src/simulation/navigation/PlayerTraversal";
import { CARRIAGE_TUNING } from "../../src/simulation/mounts/Carriage";
import { MOUNT_TUNING } from "../../src/simulation/mounts/Mounts";

describe("player traversal", () => {
  it("drains only during real movement and recovers after the authored delay", () => {
    let traversal = createFullPlayerTraversalState();
    const stationary = advancePlayerTraversal(
      traversal,
      { wantsSprint: true, isMoving: false },
      1
    );
    expect(stationary.isSprinting).toBe(false);
    expect(stationary.traversal.sprintStamina).toBe(PLAYER_TRAVERSAL_TUNING.maximumSprintStamina);

    const sprinting = advancePlayerTraversal(
      stationary.traversal,
      { wantsSprint: true, isMoving: true },
      1
    );
    expect(sprinting.isSprinting).toBe(true);
    expect(sprinting.traversal.sprintStamina).toBe(
      PLAYER_TRAVERSAL_TUNING.maximumSprintStamina - PLAYER_TRAVERSAL_TUNING.sprintDrainPerSecond
    );

    traversal = advancePlayerTraversal(
      sprinting.traversal,
      { wantsSprint: false, isMoving: true },
      PLAYER_TRAVERSAL_TUNING.sprintRecoveryDelaySeconds / 2
    ).traversal;
    expect(traversal.sprintStamina).toBe(sprinting.traversal.sprintStamina);

    traversal = advancePlayerTraversal(
      traversal,
      { wantsSprint: false, isMoving: false },
      PLAYER_TRAVERSAL_TUNING.sprintRecoveryDelaySeconds
    ).traversal;
    expect(traversal.sprintStamina).toBeGreaterThan(sprinting.traversal.sprintStamina);
  });

  it("locks exhausted sprint until a useful reserve has recovered", () => {
    let traversal = {
      ...createFullPlayerTraversalState(),
      sprintStamina: 0.1
    };
    const exhausted = advancePlayerTraversal(
      traversal,
      { wantsSprint: true, isMoving: true },
      1 / 60
    );
    expect(exhausted.traversal.sprintExhausted).toBe(true);
    expect(exhausted.isSprinting).toBe(true);

    traversal = exhausted.traversal;
    for (let index = 0; index < 40; index++) {
      const step = advancePlayerTraversal(
        traversal,
        { wantsSprint: true, isMoving: true },
        1 / 60
      );
      traversal = step.traversal;
      expect(step.isSprinting).toBe(false);
    }
    expect(traversal.sprintExhausted).toBe(true);

    let resumed = false;
    for (let index = 0; index < 180; index++) {
      const step = advancePlayerTraversal(
        traversal,
        { wantsSprint: true, isMoving: true },
        1 / 60
      );
      traversal = step.traversal;
      if (step.isSprinting) {
        resumed = true;
        break;
      }
    }
    expect(resumed).toBe(true);
    expect(traversal.sprintStamina).toBeGreaterThan(0);
  });

  it("empties a continuous sprint in twice the previous budget without recovering mid-sprint", () => {
    expect(PLAYER_TRAVERSAL_TUNING.maximumSprintStamina).toBe(100);
    expect(PLAYER_TRAVERSAL_TUNING.sprintDrainPerSecond).toBe(11);
    expect(PLAYER_TRAVERSAL_TUNING.sprintRecoveryPerSecond).toBe(30);
    expect(MOUNT_TUNING.gallopDrainPerSecond).toBe(7);
    expect(MOUNT_TUNING.maximumGallopStamina).toBe(100);
    expect(CARRIAGE_TUNING.staminaMaximum).toBe(100);
    expect(CARRIAGE_TUNING.trotDrainPerSecond).toBe(5);
    expect(MOUNT_TUNING.maximumGallopStamina / MOUNT_TUNING.gallopDrainPerSecond).toBeCloseTo(100 / 14 * 2, 8);
    expect(CARRIAGE_TUNING.staminaMaximum / CARRIAGE_TUNING.trotDrainPerSecond).toBeCloseTo(100 / 10 * 2, 8);

    const dt = 1 / 60;
    let traversal = createFullPlayerTraversalState();
    let steps = 0;
    while (traversal.sprintStamina > 0 && steps < 2000) {
      const step = advancePlayerTraversal(traversal, { wantsSprint: true, isMoving: true }, dt);
      traversal = step.traversal;
      steps += 1;
    }
    const seconds = steps * dt;
    const fullToEmpty = PLAYER_TRAVERSAL_TUNING.maximumSprintStamina / PLAYER_TRAVERSAL_TUNING.sprintDrainPerSecond;
    expect(seconds).toBeGreaterThanOrEqual(fullToEmpty);
    expect(seconds).toBeLessThan(fullToEmpty + dt);
    expect(traversal.sprintStamina).toBe(0);
    expect(fullToEmpty).toBeCloseTo(100 / 22 * 2, 8);

    const tiny = advancePlayerTraversal(
      createFullPlayerTraversalState(),
      { wantsSprint: true, isMoving: true },
      0.001
    );
    expect(tiny.traversal.sprintStamina).toBeCloseTo(100 - 0.011, 8);

    let mixed = createFullPlayerTraversalState();
    mixed = advancePlayerTraversal(mixed, { wantsSprint: true, isMoving: true }, 1).traversal;
    const afterSprint = mixed.sprintStamina;
    mixed = advancePlayerTraversal(mixed, { wantsSprint: true, isMoving: true }, 1).traversal;
    expect(mixed.sprintStamina).toBeCloseTo(afterSprint - PLAYER_TRAVERSAL_TUNING.sprintDrainPerSecond, 8);
    mixed = advancePlayerTraversal(mixed, { wantsSprint: false, isMoving: false }, 0.2).traversal;
    expect(mixed.sprintStamina).toBeCloseTo(afterSprint - PLAYER_TRAVERSAL_TUNING.sprintDrainPerSecond, 8);
  });

  it("slows uphill gait and gains a little downhill without leaving the authored clamp", () => {
    expect(slopeGaitScale({ x: 0, y: 1, z: 0 }, 0, 1)).toBe(1);
    // The plane y = 0.35x + 0.2z rises along its height gradient.
    const length = Math.hypot(0.35, 1, 0.2);
    const normal = { x: -0.35 / length, y: 1 / length, z: -0.2 / length };
    const uphill = slopeGaitScale(normal, 0.35, 0.2);
    const downhill = slopeGaitScale(normal, -0.35, -0.2);
    expect(uphill).toBeGreaterThanOrEqual(0.78);
    expect(uphill).toBeLessThan(1);
    expect(downhill).toBeGreaterThan(1);
    expect(downhill).toBeLessThanOrEqual(1.14);
    expect(slopeGaitScale(normal, -0.2, 0.35)).toBeCloseTo(1, 12);
  });
});
