import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { basicPerfectWorkRebate, SPORT_FISHING_WORK_COST_BY_CLASS, sportLandingWorkRebate } from "../../src/simulation/domains/FishingDomain";
import { hookLakeTroutForTest } from "./sportFishingTestUtils";

describe("retuned fishing Work settlement", () => {
  it("prices fish classes and bounds success rebates", () => {
    expect(SPORT_FISHING_WORK_COST_BY_CLASS).toEqual({ small: 10, medium: 12, large: 15, gargantuan: 20 });
    expect([10, 12, 15, 20, 44].map(sportLandingWorkRebate)).toEqual([4, 5, 6, 8, 12]);
    expect([6, 9, 10, 20, 0, -1, NaN].map(basicPerfectWorkRebate)).toEqual([6, 9, 10, 10, 0, 0, 0]);
  });

  for (const chargedCast of [false, true]) {
    it(`captures the paid ${chargedCast ? "charged" : "immediate"} cast across rank changes and reload, rewarding it once`, () => {
      const sim = new Simulation();
      sim.state.player.x = -8;
      sim.state.player.z = 0;
      sim.state.player.proficiencies.fishing = 100_000;
      sim.state.player.workCapacity.current = 100;
      const quote = sim.quoteWorkCost(10, "fishing", "fishing.basic-cast");
      if (chargedCast) {
        expect(sim.startChargingBasicFishing().success).toBe(true);
        expect(sim.state.player.workCapacity.current).toBe(100);
        expect(sim.releaseCastBasicFishing(0.75).success).toBe(true);
      } else {
        expect(sim.castBasicFishing(0.75).success).toBe(true);
      }
      expect(sim.state.basicFishing!.workCharged).toBe(quote.cost);
      expect(sim.state.player.workCapacity.current).toBe(100 - quote.cost);
      sim.state.basicFishing!.phase = "caught";
      sim.state.basicFishing!.isPerfect = true;
      sim.state.basicFishing!.treasureCaught = false;
      sim.state.player.proficiencies.fishing = 0;
      const envelope = { schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 1, state: structuredClone(sim.state) };
      expect(validateSaveEnvelope(envelope)).toBe(true);
      const reloaded = new Simulation(envelope.state);
      expect(reloaded.inspectWorldHud().basicFishingPerfectWorkRecovery).toBe(quote.cost);
      expect(reloaded.execute({ type: "fishing.commit-basic" }).success).toBe(true);
      expect(reloaded.state.player.workCapacity.current).toBe(100);
      expect(reloaded.state.player.workCapacity.earnedToday).toBe(quote.cost);
      expect(reloaded.execute({ type: "fishing.commit-basic" }).success).toBe(true);
      expect(reloaded.state.player.workCapacity.current).toBe(100);
    });
  }

  it("does not reward an ordinary basic catch or a discarded perfect catch", () => {
    for (const discard of [false, true]) {
      const sim = new Simulation();
      sim.state.player.x = -8;
      sim.state.player.z = 0;
      sim.state.player.workCapacity.current = 100;
      expect(sim.castBasicFishing().success).toBe(true);
      sim.state.basicFishing!.phase = "caught";
      sim.state.basicFishing!.isPerfect = discard;
      expect(sim.execute({ type: discard ? "fishing.discard-basic-catch" : "fishing.commit-basic" }).success).toBe(true);
      expect(sim.state.player.workCapacity.current).toBe(90);
    }
  });

  it("awards a perfect catch only within remaining daily room", () => {
    const sim = new Simulation();
    sim.state.player.x = -8;
    sim.state.player.z = 0;
    sim.state.player.workCapacity.current = 100;
    sim.state.player.workCapacity.earningsDay = 0;
    sim.state.player.workCapacity.earnedToday = 297;
    expect(sim.castBasicFishing().success).toBe(true);
    sim.state.basicFishing!.phase = "caught";
    sim.state.basicFishing!.isPerfect = true;
    expect(sim.inspectWorldHud().basicFishingPerfectWorkRecovery).toBe(3);
    expect(sim.execute({ type: "fishing.commit-basic" }).success).toBe(true);
    expect(sim.state.player.workCapacity.current).toBe(93);
    expect(sim.state.player.workCapacity.earnedToday).toBe(300);
  });

  it("charges a snapped fight fully and publishes only the cleared encounter", () => {
    const sim = new Simulation();
    sim.state.player.workCapacity.current = 100;
    hookLakeTroutForTest(sim);
    const afterHook = sim.state.player.workCapacity.current;
    sim.state.sportFishing!.lineIntegrity = 0;
    let observed: unknown;
    sim.events.on("FishEscaped", () => { observed = sim.state.sportFishing; });
    sim.tick(0.1);
    expect(sim.state.sportFishing).toBeNull();
    expect(observed).toBeNull();
    expect(sim.state.player.workCapacity.current).toBe(afterHook);
  });
});
