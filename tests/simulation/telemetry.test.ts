import { describe, it, expect } from "vitest";
import { EventBus } from "../../src/simulation/core/EventBus";
import { SessionRecorder } from "../../src/telemetry/SessionRecorder";
import { attachTelemetry } from "../../src/telemetry/attachTelemetry";
import { Simulation } from "../../src/simulation/Simulation";
import { DAYS_PER_SEASON, MINUTES_PER_DAY } from "../../src/simulation/core/GameClock";

/**
 * `LLM/03` §32 specifies playtest metrics and UX failure signals that nothing
 * has ever captured. These tests pin the capture, not the values — the values
 * are what playtesting is for.
 */
describe("session telemetry", () => {
  function harness(capacity?: number) {
    const events = new EventBus();
    const recorder = new SessionRecorder(capacity);
    let gameMinute = 0;
    let realElapsedMs = 0;
    let activeQuestId: string | null = "quest.act1_welcome";
    const detach = attachTelemetry(events, recorder, {
      gameMinute: () => gameMinute,
      realElapsedMs: () => realElapsedMs,
      activeQuestId: () => activeQuestId
    });
    return {
      events,
      recorder,
      detach,
      advance(minutes: number, realMs: number) {
        gameMinute += minutes;
        realElapsedMs += realMs;
      },
      setQuest(id: string | null) {
        activeQuestId = id;
      }
    };
  }

  it("records both clocks for a milestone, not just game minutes", () => {
    const h = harness();
    h.advance(240, 600_000); // 4 game-hours = 10 real minutes
    h.events.emit("CropHarvested", {
      placedCropId: "crop.1",
      cropId: "crop.wheat",
      farmId: "farm.starter",
      quantity: 4,
      quality: "common",
      xpGained: 45,
      minute: 240
    });

    const { milestones } = h.recorder.getMetrics();
    expect(milestones.firstHarvest).toEqual({ gameMinute: 240, realElapsedMs: 600_000 });
  });

  it("keeps only the first occurrence of a milestone", () => {
    const h = harness();
    h.advance(100, 1000);
    h.events.emit("BoatBoarded", { boatId: "boat.rowboat", minute: 100 });
    h.advance(500, 90_000);
    h.events.emit("BoatBoarded", { boatId: "boat.rowboat", minute: 600 });

    expect(h.recorder.getMetrics().milestones.firstBoatBoarded?.gameMinute).toBe(100);
  });

  it("does not count a missed cast as a first catch", () => {
    const h = harness();
    h.events.emit("BasicFishingResolved", { ecologyId: "ecology.neva", habitatId: "river", reason: "missed", minute: 10 });
    expect(h.recorder.getMetrics().milestones.firstBasicCatch).toBeUndefined();

    h.events.emit("BasicFishingResolved", {
      ecologyId: "ecology.neva",
      habitatId: "river",
      catchItemId: "fish.perch",
      quality: "common",
      minute: 20
    });
    expect(h.recorder.getMetrics().milestones.firstBasicCatch).toBeDefined();
  });

  it("tracks the hook/land/escape ratio that says whether the fight is calibrated", () => {
    const h = harness();
    for (let i = 0; i < 5; i += 1) {
      h.events.emit("FishHooked", { speciesId: "fish.trout", ecologyId: "ecology.neva", habitatId: "lake", weightKg: 3, minute: i });
    }
    h.events.emit("FishLanded", {
      cargoId: "cargo.1",
      speciesId: "fish.trout",
      ecologyId: "ecology.neva",
      weightKg: 3,
      quality: "fine",
      minute: 6
    });
    h.events.emit("FishEscaped", { speciesId: "fish.trout", reason: "snapped", minute: 7 });
    h.events.emit("FishEscaped", { speciesId: "fish.trout", reason: "escaped", minute: 8 });

    const metrics = h.recorder.getMetrics();
    expect(metrics.sportFishHooked).toBe(5);
    expect(metrics.sportFishLanded).toBe(1);
    expect(metrics.sportFishEscaped).toBe(2);
  });

  it("computes revenue per real hour from produce, fish, and contracts together", () => {
    const h = harness();
    h.advance(120, 1_800_000); // half a real hour
    h.events.emit("ItemSold", { marketId: "market.village", itemId: "produce.wheat", quantity: 5, revenue: 40, minute: 120 });
    h.events.emit("FishSold", { marketId: "market.harbor", cargoId: "cargo.1", speciesId: "fish.trout", revenue: 60, minute: 120 });
    h.events.emit("ContractCompleted", { contractId: "c.1", templateId: "contract.wheat_supply", contractType: "produce", rewardMoney: 50, minute: 120 });

    const metrics = h.recorder.getMetrics();
    expect(metrics.revenue).toBe(150);
    expect(metrics.revenuePerRealHour).toBeCloseTo(300, 5);
  });

  it("measures how long players sit after dialogue before doing anything", () => {
    const h = harness();
    h.advance(0, 1000);
    h.events.emit("NpcTalked", { npcId: "npc.elspeth", minute: 0 });
    h.advance(0, 5000);
    h.events.emit("CropPlanted", { placedCropId: "crop.1", cropId: "crop.wheat", farmId: "farm.starter", minute: 0 });

    h.advance(0, 1000);
    h.events.emit("NpcTalked", { npcId: "npc.barnaby", minute: 0 });
    h.advance(0, 9000);
    h.events.emit("CropWatered", { placedCropId: "crop.1", farmId: "farm.starter", newMoisture: 80, minute: 0 });

    // 5s and 9s samples -> median 7s.
    expect(h.recorder.getMetrics().medianRealMsFromDialogueToAction).toBe(7000);
  });

  it("reports elapsed session time even when the player has done nothing", () => {
    const h = harness();
    // Four real minutes, zero events: a lost player is the signal, not a gap.
    const metrics = h.recorder.getMetrics(240_000);
    expect(metrics.sessionRealMs).toBe(240_000);
    expect(metrics.eventCount).toBe(0);
    expect(metrics.milestones).toEqual({});
  });

  it("never lets a stale caller clock shrink the recorded session", () => {
    const h = harness();
    h.advance(10, 50_000);
    h.events.emit("CropPlanted", { placedCropId: "c.1", cropId: "crop.wheat", farmId: "farm.starter", minute: 10 });
    expect(h.recorder.getMetrics(1_000).sessionRealMs).toBe(50_000);
  });

  it("bounds memory and reports when history was discarded", () => {
    const h = harness(3);
    for (let i = 0; i < 10; i += 1) {
      h.events.emit("CropWatered", { placedCropId: "crop.1", farmId: "farm.starter", newMoisture: i, minute: i });
    }
    const metrics = h.recorder.getMetrics();
    expect(metrics.eventCount).toBe(3);
    expect(metrics.truncated).toBe(true);
  });

  it("detaches cleanly", () => {
    const h = harness();
    h.detach();
    h.events.emit("CropHarvested", {
      placedCropId: "crop.1",
      cropId: "crop.wheat",
      farmId: "farm.starter",
      quantity: 1,
      quality: "common",
      xpGained: 45,
      minute: 5
    });
    expect(h.recorder.getMetrics().eventCount).toBe(0);
  });

  it("emits SeasonChanged from the live simulation when the calendar turns", () => {
    const sim = new Simulation();
    const seen: Array<{ season: string; previousSeason: string }> = [];
    sim.events.on("SeasonChanged", (payload) => {
      seen.push({ season: payload.season, previousSeason: payload.previousSeason });
    });

    expect(sim.state.clock.season).toBe("spring");
    sim.advanceGameMinutes(DAYS_PER_SEASON * MINUTES_PER_DAY);

    expect(sim.state.clock.season).toBe("summer");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ season: "summer", previousSeason: "spring" });
  });

  it("reports one SeasonChanged for a catch-up that sweeps several seasons", () => {
    const sim = new Simulation();
    const seen: string[] = [];
    sim.events.on("SeasonChanged", (payload) => seen.push(payload.season));

    // Two full seasons in a single advance, as a long offline catch-up would.
    sim.advanceGameMinutes(2 * DAYS_PER_SEASON * MINUTES_PER_DAY);

    expect(sim.state.clock.season).toBe("autumn");
    expect(seen).toEqual(["autumn"]);
  });
});
