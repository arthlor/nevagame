import { describe, expect, it } from "vitest";
import { selectDebugGameSnapshot } from "../../src/app/GameUiSnapshot";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";

describe("game UI diagnostic snapshot", () => {
  it("detaches player and fishing values from the mutable simulation state", () => {
    const state = createInitialGameState();
    const snapshot = selectDebugGameSnapshot(state);
    const originalX = state.player.x;
    const originalStamina = state.player.traversal.sprintStamina;

    snapshot.player.x += 10;
    snapshot.player.traversal.sprintStamina = 0;

    expect(state.player.x).toBe(originalX);
    expect(state.player.traversal.sprintStamina).toBe(originalStamina);
    expect(snapshot.activeCropsCount).toBe(Object.keys(state.crops).length);
  });
});
