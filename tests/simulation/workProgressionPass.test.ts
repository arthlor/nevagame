import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { ContentRegistry } from "../../src/content/ContentRegistry";

function moveToHarborMarket(sim: Simulation): void {
  const market = ContentRegistry.markets.get("market.harbor")!;
  sim.state.player.x = market.interactionPosition.x;
  sim.state.player.z = market.interactionPosition.z;
}

describe("post-P12 Work economy and tackle progression", () => {
  it("purchases rods in order, auto-equips them, and allows owned-rod switching", () => {
    const sim = new Simulation();
    moveToHarborMarket(sim);
    sim.state.player.money = 1_000;
    sim.state.player.proficiencies.fishing = 3_000;

    expect(sim.buyRodAtMarket("market.harbor", "rod.heavy_sport")).toMatchObject({
      success: false,
      reason: "Buy the previous rod first"
    });

    const river = sim.buyRodAtMarket("market.harbor", "rod.river");
    expect(river).toMatchObject({ success: true, cost: 120 });
    expect(sim.state.player.money).toBe(880);
    expect(sim.state.player.ownedRodIds).toEqual(["rod.willow", "rod.river"]);
    expect(sim.state.player.equippedRodId).toBe("rod.river");

    const duplicateMoney = sim.state.player.money;
    expect(sim.buyRodAtMarket("market.harbor", "rod.river").success).toBe(false);
    expect(sim.state.player.money).toBe(duplicateMoney);

    expect(sim.buyRodAtMarket("market.harbor", "rod.heavy_sport")).toMatchObject({ success: true, cost: 380 });
    expect(sim.state.player.equippedRodId).toBe("rod.heavy_sport");
    expect(sim.equipRodAtMarket("market.harbor", "rod.willow").success).toBe(true);
    expect(sim.state.player.equippedRodId).toBe("rod.willow");
  });

  it("blocks remote tackle changes and changes during active fishing", () => {
    const sim = new Simulation();
    sim.state.player.proficiencies.fishing = 1_000;
    expect(sim.buyRodAtMarket("market.harbor", "rod.river").success).toBe(false);

    moveToHarborMarket(sim);
    sim.state.basicFishing = {
      habitatId: "river",
      phase: "charging-cast",
      remainingSeconds: 0,
      willCatch: false
    };
    expect(sim.buyRodAtMarket("market.harbor", "rod.river")).toMatchObject({
      success: false,
      reason: "Finish fishing before changing tackle"
    });
    expect(sim.state.player.money).toBe(100);
    expect(sim.state.player.ownedRodIds).toEqual(["rod.willow"]);
  });

  it("migrates v19 saves with every rod through the equipped tier owned", () => {
    const sim = new Simulation();
    sim.state.player.equippedRodId = "rod.heavy_sport";
    const legacyState = structuredClone(sim.state) as unknown as Record<string, unknown>;
    legacyState.schemaVersion = 19;
    const legacyPlayer = legacyState.player as Record<string, unknown>;
    delete legacyPlayer.ownedRodIds;
    const legacy = {
      schemaVersion: 19,
      savedAtUtcMs: 1,
      state: legacyState
    } as unknown as SaveEnvelope;

    const migrated = migrateSaveData(legacy);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.player.ownedRodIds).toEqual([
      "rod.willow",
      "rod.river",
      "rod.heavy_sport"
    ]);
    expect(migrated.state.player.equippedRodId).toBe("rod.heavy_sport");
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });
});
