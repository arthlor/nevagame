import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";

describe("debug money boundary", () => {
  it("cannot change a normal game's purse", () => {
    const sim = new Simulation();
    const startingMoney = sim.state.player.money;

    sim.grantDebugMoney(100);
    expect(sim.state.player.money).toBe(startingMoney);
  });

  it("allows valid grants only in an explicitly enabled debug simulation", () => {
    const sim = new Simulation(undefined, { allowDebugCommands: true });
    const startingMoney = sim.state.player.money;

    sim.grantDebugMoney(-5);
    sim.grantDebugMoney(0.5);
    sim.grantDebugMoney(Number.MAX_SAFE_INTEGER);
    expect(sim.state.player.money).toBe(startingMoney);

    sim.grantDebugMoney(100);
    expect(sim.state.player.money).toBe(startingMoney + 100);
  });
});
