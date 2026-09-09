import { describe, it, expect } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { DEFAULT_MINUTES_PER_REAL_SECOND } from "../../src/simulation/core/GameClock";
import {
  ONBOARDING_PACE,
  effectiveRecipeDurationMinutes,
  isOnboardingPaceActive,
  onboardingGrowthMultiplier
} from "../../src/simulation/core/OnboardingPace";
import { applyOfflineProgression } from "../../src/persistence/offlineDelta";

const REAL_SECONDS_PER_GAME_MINUTE = 1 / DEFAULT_MINUTES_PER_REAL_SECOND;

/** Game minutes of ticking before the crop first reads as mature. */
function minutesToMature(simulation: Simulation, placedCropId: string, limit = 400): number {
  for (let minute = 1; minute <= limit; minute += 1) {
    simulation.advanceGameMinutes(1);
    if (simulation.state.crops[placedCropId].stage === "mature") return minute;
  }
  return Number.POSITIVE_INFINITY;
}

function plantStarterWheat(simulation: Simulation): string {
  const res = simulation.plantCrop(
    "farm.starter_garden",
    "crop.wheat",
    STARTER_FARM_LAYOUT.origin.x,
    STARTER_FARM_LAYOUT.origin.z
  );
  expect(res).toMatchObject({ success: true });
  return Object.keys(simulation.state.crops)[0];
}

describe("onboarding pace", () => {
  it("ripens tutorial wheat inside the 60-90 real second target", () => {
    const simulation = new Simulation();
    const cropId = plantStarterWheat(simulation);
    const gameMinutes = minutesToMature(simulation, cropId);
    const realSeconds = gameMinutes * REAL_SECONDS_PER_GAME_MINUTE;

    expect(realSeconds).toBeGreaterThanOrEqual(60);
    expect(realSeconds).toBeLessThanOrEqual(90);
  });

  it("restores the authored 180-minute wheat once the tutorial is complete", () => {
    const simulation = new Simulation();
    simulation.state.quests.completedQuestIds.push(ONBOARDING_PACE.gateQuestId);
    const cropId = plantStarterWheat(simulation);
    const gameMinutes = minutesToMature(simulation, cropId);

    // 180 base minutes at the starter garden's 1.32 environment modifier.
    expect(gameMinutes).toBeGreaterThan(130);
    expect(gameMinutes * REAL_SECONDS_PER_GAME_MINUTE).toBeGreaterThan(300);
  });

  it("accelerates only tutorial wheat in the starter garden", () => {
    const quests = new Simulation().state.quests;
    expect(onboardingGrowthMultiplier("crop.wheat", "farm.starter_garden", quests)).toBe(5);
    expect(onboardingGrowthMultiplier("crop.tomato", "farm.starter_garden", quests)).toBe(1);
    expect(onboardingGrowthMultiplier("crop.wheat", "farm.player_homestead", quests)).toBe(1);

    quests.completedQuestIds.push(ONBOARDING_PACE.gateQuestId);
    expect(isOnboardingPaceActive(quests)).toBe(false);
    expect(onboardingGrowthMultiplier("crop.wheat", "farm.starter_garden", quests)).toBe(1);
  });

  it("reports an honest countdown — inspect agrees with what the tick delivers", () => {
    const simulation = new Simulation();
    const cropId = plantStarterWheat(simulation);
    const predicted = simulation.inspectCrop(cropId)?.approximateMinutesRemaining;
    expect(predicted).not.toBeNull();

    const actual = minutesToMature(simulation, cropId);
    // The DTO rounds up to the next 5 minutes, so it may lead slightly.
    expect(predicted!).toBeGreaterThanOrEqual(actual - 5);
    expect(predicted!).toBeLessThanOrEqual(actual + 10);
  });

  it("paces the offline catch-up exactly like the live tick", () => {
    const live = new Simulation();
    const liveCropId = plantStarterWheat(live);
    live.advanceGameMinutes(20);

    const offline = new Simulation();
    const offlineCropId = plantStarterWheat(offline);
    // The second argument is an absolute "now", not an elapsed span.
    applyOfflineProgression(
      offline.state,
      offline.state.metadata.lastSavedUtcMs + 20 * REAL_SECONDS_PER_GAME_MINUTE * 1000
    );

    expect(offline.state.crops[offlineCropId].effectiveGrowthMinutes).toBeCloseTo(
      live.state.crops[liveCropId].effectiveGrowthMinutes,
      3
    );
  });

  it("quotes 12 minutes for the tutorial compost and 360 everywhere else", () => {
    const simulation = new Simulation();
    const recipe = ContentRegistry.recipes.get("recipe.compost_worms")!;
    const quests = simulation.state.quests;

    expect(effectiveRecipeDurationMinutes(recipe, "struct.starter_compost", quests)).toBe(12);
    // The same recipe run anywhere else keeps its authored duration.
    expect(effectiveRecipeDurationMinutes(recipe, "struct.workbench", quests)).toBe(360);

    const mill = ContentRegistry.recipes.get("recipe.wheat_to_grain")!;
    expect(effectiveRecipeDurationMinutes(mill, "struct.starter_mill", quests)).toBe(mill.durationMinutes);

    quests.completedQuestIds.push(ONBOARDING_PACE.gateQuestId);
    expect(effectiveRecipeDurationMinutes(recipe, "struct.starter_compost", quests)).toBe(360);
  });

  it("accelerates exactly one compost run, so the pace is not an economy hole", () => {
    const simulation = new Simulation();
    const recipe = ContentRegistry.recipes.get("recipe.compost_worms")!;
    const quests = simulation.state.quests;
    expect(effectiveRecipeDurationMinutes(recipe, "struct.starter_compost", quests)).toBe(12);

    // Evidence that the tutorial compost already ran — whether recorded on the
    // step or banked as an early action — ends the acceleration.
    quests.earlyActionCredits.push({
      type: "craft-recipe",
      targetId: "recipe.compost_worms",
      location: { kind: "station", id: "struct.starter_compost" },
      quantity: 1
    });
    expect(effectiveRecipeDurationMinutes(recipe, "struct.starter_compost", quests)).toBe(360);

    quests.earlyActionCredits.length = 0;
    quests.tracks["track.main"].stepProgress["step.act2_compost_worms"] = 1;
    expect(effectiveRecipeDurationMinutes(recipe, "struct.starter_compost", quests)).toBe(360);
  });
});
