import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { Simulation } from "../../src/simulation/Simulation";
import type { EmergencyTowQuoteDto } from "../../src/simulation/core/contracts";
import {
  STORM_HELM_FIXED_STEP_SECONDS,
  createStormHelmRuntime,
  isStormHelmEligible,
  stepStormHelm,
  type StormHelmContext
} from "../../src/simulation/boats/StormHelm";
import { npcAnchorAt } from "../../src/simulation/presentation/NpcPresentation";
import { HARBOR_SKIFF_MOORING } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";

const STORM_WEATHER = {
  type: "storm" as const,
  seaRoughness: 0.82,
  windSpeed: 17,
  windDirectionDeg: 0
};

function skiffAtSea(headingRadians: number, speed = 6, durability = 250): Simulation {
  const sim = new Simulation();
  expect(sim.prepareDebugSkiffReview()).toBe(true);
  expect(
    sim.setDebugBoatDriving("boat.player_skiff", { x: 500, z: 200, headingRadians })
  ).toBe(true);
  Object.assign(sim.state.weather, {
    ...sim.state.weather,
    ...STORM_WEATHER,
    nextWeatherMinute: 1_000_000,
    nextWeatherType: "storm"
  });
  const boat = sim.state.boats["boat.player_skiff"]!;
  boat.speed = speed;
  boat.durability = durability;
  return sim;
}

function runSeconds(sim: Simulation, seconds: number, chunkSeconds = 0.25): void {
  const calls = Math.ceil(seconds / chunkSeconds);
  for (let index = 0; index < calls; index += 1) sim.tick(chunkSeconds);
}

function modelContext(
  overrides: Partial<StormHelmContext> = {},
  boatOverrides: Partial<StormHelmContext["boat"]> = {}
): StormHelmContext {
  const definition = ContentRegistry.boats.get("boat.skiff")!;
  return {
    definition,
    boat: {
      x: 500,
      z: 200,
      headingRadians: 0,
      speed: 6,
      durability: definition.durabilityMax,
      isDocked: false,
      ...boatOverrides
    },
    weather: STORM_WEATHER,
    timeOfDay: "day",
    openWaterExposure: 0.84,
    ...overrides
  };
}

describe("storm helm eligibility", () => {
  it("begins only when the sea is past the hull's safe range in exposed water under way", () => {
    expect(isStormHelmEligible(modelContext())).toBe(true);
    // A calm sea, a sheltered inlet, a moored hull and a stopped hull are safe.
    expect(isStormHelmEligible(modelContext({ weather: { ...STORM_WEATHER, seaRoughness: 0.4 } }))).toBe(false);
    expect(isStormHelmEligible(modelContext({ openWaterExposure: 0.1 }))).toBe(false);
    expect(isStormHelmEligible(modelContext({}, { isDocked: true }))).toBe(false);
    expect(isStormHelmEligible(modelContext({}, { speed: 1 }))).toBe(false);
    expect(isStormHelmEligible(modelContext({}, { durability: 0 }))).toBe(false);
  });

  it("scales gust strength with the unsafe margin and adds night sea energy", () => {
    const day = createStormHelmRuntime("boat.a");
    const dayContext = modelContext();
    let dayStarted = false;
    while (!dayStarted) {
      dayStarted = stepStormHelm(day, dayContext, STORM_HELM_FIXED_STEP_SECONDS).kind === "gust-started";
    }
    const nightContext = modelContext({ timeOfDay: "night" });
    const night = createStormHelmRuntime("boat.a");
    let nightStarted = false;
    while (!nightStarted) {
      nightStarted = stepStormHelm(night, nightContext, STORM_HELM_FIXED_STEP_SECONDS).kind === "gust-started";
    }
    expect(night.gustStrength).toBeGreaterThan(day.gustStrength);
    expect(night.durationSeconds).toBeGreaterThanOrEqual(day.durationSeconds);
  });

  it("is deterministic and draws no RNG for a fixed context sequence", () => {
    const first = createStormHelmRuntime("boat.deterministic");
    const second = createStormHelmRuntime("boat.deterministic");
    const context = modelContext();
    const outcomesFirst: string[] = [];
    const outcomesSecond: string[] = [];
    const heelsFirst: number[] = [];
    const heelsSecond: number[] = [];
    for (let step = 0; step < 60 * 30; step += 1) {
      outcomesFirst.push(stepStormHelm(first, context, STORM_HELM_FIXED_STEP_SECONDS).kind);
      outcomesSecond.push(stepStormHelm(second, context, STORM_HELM_FIXED_STEP_SECONDS).kind);
      heelsFirst.push(first.heel);
      heelsSecond.push(second.heel);
    }
    expect(outcomesFirst).toEqual(outcomesSecond);
    expect(heelsFirst).toEqual(heelsSecond);
    expect(outcomesFirst).toContain("gust-started");
    expect(outcomesFirst).toContain("survived");
  });

  it("a full-throttle beam-on gust in a night storm broaches", () => {
    const runtime = createStormHelmRuntime("boat.a");
    const context = modelContext({ timeOfDay: "night" }, { headingRadians: Math.PI / 2, speed: 8.5 });
    let outcome: ReturnType<typeof stepStormHelm> = { kind: "none" };
    for (let step = 0; step < 60 * 40 && outcome.kind !== "failed"; step += 1) {
      outcome = stepStormHelm(runtime, context, STORM_HELM_FIXED_STEP_SECONDS);
    }
    expect(outcome).toMatchObject({ kind: "failed", reason: "broach" });
  });
});

describe("storm helm through the simulation", () => {
  it("survives a bow-on gust and gives one hull life back", () => {
    const sim = skiffAtSea(0, 6, 150);
    const survived: number[] = [];
    sim.events.on("BoatGustSurvived", (event) => survived.push(event.restored));
    runSeconds(sim, 30);
    expect(survived.length).toBeGreaterThanOrEqual(1);
    expect(sim.state.boats["boat.player_skiff"]!.durability).toBe(200);
  });

  it("a beam-on gust at full throttle is failed and costs one hull life", () => {
    const sim = skiffAtSea(Math.PI / 2, 8.5);
    const failures: string[] = [];
    sim.events.on("BoatGustFailed", (event) => failures.push(event.reason));
    runSeconds(sim, 30);
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(sim.state.boats["boat.player_skiff"]!.durability).toBe(200);
  });

  it("letting the throttle go lets a running gust pass without damage", () => {
    const sim = skiffAtSea(Math.PI / 2, 8.5);
    runSeconds(sim, 15.6);
    sim.state.boats["boat.player_skiff"]!.speed = 0;
    runSeconds(sim, 12);
    expect(sim.state.boats["boat.player_skiff"]!.durability).toBe(250);
  });

  it("resolves the same failures regardless of render-frame partitioning", () => {
    const coarse = skiffAtSea(Math.PI / 2, 8.5);
    const fine = skiffAtSea(Math.PI / 2, 8.5);
    runSeconds(coarse, 40, 0.25);
    runSeconds(fine, 40, 1 / 60);
    expect(coarse.state.boats["boat.player_skiff"]!.durability)
      .toBe(fine.state.boats["boat.player_skiff"]!.durability);
  });

  it("five failed gusts wreck the skiff and leave her unable to make way", () => {
    const sim = skiffAtSea(Math.PI / 2, 8.5);
    const wrecked: string[] = [];
    sim.events.on("BoatWrecked", (event) => wrecked.push(event.boatId));
    runSeconds(sim, 160);
    const boat = sim.state.boats["boat.player_skiff"]!;
    expect(boat.durability).toBe(0);
    expect(boat.speed).toBe(0);
    expect(wrecked).toEqual(["boat.player_skiff"]);
  });

  it("charges no Work and grants no XP for the challenge", () => {
    const sim = skiffAtSea(Math.PI / 2, 8.5);
    const work = sim.state.player.workCapacity.current;
    const fishingXp = sim.state.player.proficiencies.fishing;
    runSeconds(sim, 40);
    expect(sim.state.player.workCapacity.current).toBe(work);
    expect(sim.state.player.proficiencies.fishing).toBe(fishingXp);
  });

  it("a wrecked hull holds the water instead of making way", async () => {
    const physics = await PhysicsWorld.create();
    const sim = skiffAtSea(0, 0, 0);
    const result = physics.step(
      sim.state,
      { x: 0, z: -1, sprint: false },
      "boat-driving",
      1 / 60,
      0
    );
    physics.onCommitResult(sim.commitPhysicsFrame(result.frame).success);
    const pose = result.frame.boats["boat.player_skiff"]!;
    expect(pose.speed).toBe(0);
    expect(pose.x).toBeCloseTo(500, 3);
    expect(pose.z).toBeCloseTo(200, 3);
    physics.dispose();
  });
});

describe("harbor hull repair", () => {
  function dockedWreck(money: number): Simulation {
    const sim = skiffAtSea(0, 0, 0);
    const boat = sim.state.boats["boat.player_skiff"]!;
    Object.assign(boat, {
      x: HARBOR_SKIFF_MOORING.boatPosition.x,
      y: HARBOR_SKIFF_MOORING.boatPosition.y,
      z: HARBOR_SKIFF_MOORING.boatPosition.z,
      headingRadians: 0,
      speed: 0,
      isDocked: true,
      dockedMarketId: HARBOR_SKIFF_MOORING.marketId,
      durability: 0
    });
    sim.state.player.activeBoatId = null;
    sim.state.player.money = money;
    const silas = npcAnchorAt("npc.silas", sim.state.clock, sim.state.quests);
    expect(sim.setDebugPlayerPose({
      x: silas.x,
      y: WorldLayout.traversalSurfaceHeight(silas.x, silas.z) + 0.5,
      z: silas.z,
      rotationY: 0
    })).toBe(true);
    return sim;
  }

  it("quotes the catalog fee and restores the full hull atomically", () => {
    const sim = dockedWreck(350);
    const quote = sim.query({ type: "boat.get-repair-quote", boatId: "boat.player_skiff" });
    expect(quote).toMatchObject({ ok: true, cost: 150, inReach: true, canAfford: true });
    const repaired: number[] = [];
    sim.events.on("BoatRepaired", (event) => repaired.push(event.cost));
    expect(sim.execute({ type: "boat.repair", boatId: "boat.player_skiff" }))
      .toMatchObject({ success: true, cost: 150 });
    expect(sim.state.player.money).toBe(200);
    expect(sim.state.boats["boat.player_skiff"]!.durability).toBe(250);
    expect(repaired).toEqual([150]);
  });

  it("charges only the missing hull share for a partial repair", () => {
    const sim = dockedWreck(40);
    sim.state.boats["boat.player_skiff"]!.durability = 200;
    const quote = sim.query({ type: "boat.get-repair-quote", boatId: "boat.player_skiff" });
    expect(quote).toMatchObject({ ok: true, cost: 30, canAfford: true });
    expect(sim.execute({ type: "boat.repair", boatId: "boat.player_skiff" }))
      .toMatchObject({ success: true, cost: 30 });
    expect(sim.state.player.money).toBe(10);
    expect(sim.state.boats["boat.player_skiff"]!.durability).toBe(250);
  });

  it("refuses without touching money or the hull when the purse is short", () => {
    const sim = dockedWreck(100);
    const quote = sim.query({ type: "boat.get-repair-quote", boatId: "boat.player_skiff" });
    expect(quote).toMatchObject({ ok: false, canAfford: false, inReach: true });
    expect(sim.execute({ type: "boat.repair", boatId: "boat.player_skiff" }))
      .toMatchObject({ success: false });
    expect(sim.state.player.money).toBe(100);
    expect(sim.state.boats["boat.player_skiff"]!.durability).toBe(0);
  });

  it("refuses while the captain is away from Silas, and when the hull is sound", () => {
    const away = dockedWreck(350);
    away.setDebugPlayerPose({ x: 0, y: 1, z: 0, rotationY: 0 });
    expect(away.query({ type: "boat.get-repair-quote", boatId: "boat.player_skiff" }))
      .toMatchObject({ ok: false, inReach: false });
    expect(away.execute({ type: "boat.repair", boatId: "boat.player_skiff" }))
      .toMatchObject({ success: false });
    expect(away.state.boats["boat.player_skiff"]!.durability).toBe(0);

    const sound = dockedWreck(350);
    sound.state.boats["boat.player_skiff"]!.durability = 250;
    expect(sound.query({ type: "boat.get-repair-quote", boatId: "boat.player_skiff" }))
      .toMatchObject({ ok: false, reason: "The hull is already sound" });
  });

  it("tows a wrecked hull to Neva Harbor and charges the flat fee", () => {
    const sim = skiffAtSea(0, 0, 0);
    sim.state.player.money = 100;
    const quote = sim.query({ type: "boat.get-emergency-tow-quote" }) as EmergencyTowQuoteDto;
    expect(quote).toMatchObject({
      ok: true, cost: 25, wrecked: true, destinationMarketId: "market.harbor", destinationLabel: "Neva Harbor"
    });
    expect(quote.travelMinutes).toBeGreaterThan(15);
    expect(sim.state.player.money).toBe(100);
    const towed: string[] = [];
    sim.events.on("BoatTowed", (event) => towed.push(event.reason));
    expect(sim.execute({ type: "boat.emergency-tow" })).toMatchObject({ success: true, cost: 25 });
    const boat = sim.state.boats["boat.player_skiff"]!;
    expect(towed).toEqual(["wrecked"]);
    expect(sim.state.player.money).toBe(75);
    expect(boat.isDocked).toBe(true);
    expect(boat.dockedMarketId).toBe(HARBOR_SKIFF_MOORING.marketId);
    expect(boat.x).toBe(HARBOR_SKIFF_MOORING.boatPosition.x);
    expect(boat.z).toBe(HARBOR_SKIFF_MOORING.boatPosition.z);
    expect(sim.state.player.activeBoatId).toBeNull();
  });

  it("still tows a wreck home when the captain cannot pay, without stranding them", () => {
    const sim = skiffAtSea(0, 0, 0);
    sim.state.player.money = 10;
    expect(sim.execute({ type: "boat.emergency-tow" })).toMatchObject({ success: true, cost: 0 });
    expect(sim.state.player.money).toBe(10);
    expect(sim.state.boats["boat.player_skiff"]!.isDocked).toBe(true);
  });

  it("recovers an empty skiff with cargo even when the captain has less than the tow fee", () => {
    const sim = skiffAtSea(0, 0, 250);
    const boat = sim.state.boats["boat.player_skiff"]!;
    boat.fuel = 0;
    boat.fishCargoSlotIds[0] = "cargo.carp";
    sim.state.fishCargo["cargo.carp"] = {
      id: "cargo.carp",
      speciesId: "fish.carp",
      weightKg: 2,
      quality: "fine",
      caughtAtMinute: sim.state.clock.currentMinute,
      freshness: 100,
      cargoClass: "small",
      location: { type: "boat-hold", containerId: boat.id, slotIndex: 0 }
    };
    sim.state.player.money = 10;

    expect(sim.execute({ type: "player.reset-safe" })).toMatchObject({ success: false });
    const quote = sim.query({ type: "boat.get-emergency-tow-quote" }) as EmergencyTowQuoteDto;
    expect(quote).toMatchObject({ ok: true, cost: 0, wrecked: false });
    expect(quote.travelMinutes).toBeGreaterThan(15);
    expect(quote.destinationMarketId).toBeTruthy();
    expect(quote.destinationLabel).toBeTruthy();
    expect(sim.state.player.money).toBe(10);
    const minuteBefore = sim.state.clock.currentMinute;
    const freshnessBefore = sim.state.fishCargo["cargo.carp"].freshness;
    expect(sim.execute({ type: "boat.emergency-tow" })).toMatchObject({ success: true, cost: 0 });
    expect(sim.state.clock.currentMinute - minuteBefore).toBe(quote.travelMinutes);
    expect(sim.state.player.money).toBe(10);
    expect(boat.isDocked).toBe(true);
    expect(boat.dockedMarketId).toBe(quote.destinationMarketId);
    expect(boat.fishCargoSlotIds[0]).toBe("cargo.carp");
    expect(sim.state.fishCargo["cargo.carp"].freshness).toBeLessThan(freshnessBefore);
    expect(sim.state.fishCargo["cargo.carp"].location).toEqual({
      type: "boat-hold", containerId: boat.id, slotIndex: 0
    });
  });

  it("quotes no charge and refuses a tow while the skiff can still sail", () => {
    const sim = skiffAtSea(0);
    const boat = sim.state.boats["boat.player_skiff"]!;
    const money = sim.state.player.money;
    expect(sim.query({ type: "boat.get-emergency-tow-quote" })).toMatchObject({
      ok: false, cost: 0, travelMinutes: 0, reason: "The tank still has fuel — sail on",
      destinationMarketId: null
    });
    expect(sim.execute({ type: "boat.emergency-tow" })).toMatchObject({ success: false });
    expect(sim.state.player.money).toBe(money);
    expect(boat.isDocked).toBe(false);
  });

  it("writes a wrecked hull through a save envelope and reloads her wrecked", () => {
    const sim = skiffAtSea(0, 0, 0);
    const envelope = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: Date.now(),
      state: sim.state
    };
    expect(validateSaveEnvelope(envelope)).toBe(true);
    const reloaded = new Simulation(structuredClone(sim.state));
    expect(reloaded.state.boats["boat.player_skiff"]!.durability).toBe(0);
    expect(reloaded.state.player.money).toBe(sim.state.player.money);
    expect(reloaded.query({ type: "boat.get-storm-helm" })).toMatchObject({
      active: false,
      wrecked: true,
      hullLives: 0
    });
  });
});
