import { describe, expect, it } from "vitest";
import {
  advancePlayerTraversal,
  createFullPlayerTraversalState,
  PLAYER_TRAVERSAL_TUNING
} from "../../src/simulation/navigation/PlayerTraversal";

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
});
