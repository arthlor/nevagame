import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { HUD } from "../../src/ui/HUD";
import { QuestTrackerHUD } from "../../src/ui/QuestTrackerHUD";
import {
  CelestialTimeDial,
  FiligreeCornerTL,
  FiligreeCornerTR,
  FiligreeCornerBL,
  FiligreeCornerBR,
  OrnateBrassDivider,
  MedallionPurse,
  EmbossedKeycap
} from "../../src/ui/HudDecorations";
import { formatWeatherLabel } from "../../src/ui/weatherPresentation";
import { GameClock, MINUTES_PER_DAY } from "../../src/simulation/core/GameClock";
import type { ActiveQuestDto } from "../../src/simulation/core/QuestTypes";
import type { WeatherTag } from "../../src/simulation/core/types";

describe("Milestone M2 Adversarial & Empirical HUD Stress Suite", () => {
  // =========================================================================
  // 1. CELESTIAL DIAL MATHEMATICAL CORRECTNESS & ADVERSARIAL TIME BOUNDARIES
  // =========================================================================
  describe("1. Celestial Dial Rotation Math & Invariant Verification", () => {
    const calcRotation = (minute: number) => ((minute - 720) / 1440) * 360;

    it("satisfies the 0.25 deg/minute linear rate across 24 hours (1440 minutes)", () => {
      for (let m = 0; m < 1440; m += 30) {
        const rot = calcRotation(m);
        const rotPlus1 = calcRotation(m + 1);
        expect(rotPlus1 - rot).toBeCloseTo(0.25, 5);
      }
    });

    it("evaluates exact celestial anchor rotations across 24h key hours", () => {
      // 00:00 midnight -> -180 deg (or 180 deg)
      expect(calcRotation(0)).toBe(-180);
      // 03:00 night -> -135 deg
      expect(calcRotation(180)).toBe(-135);
      // 06:00 sunrise / dawn -> -90 deg
      expect(calcRotation(360)).toBe(-90);
      // 09:00 morning -> -45 deg
      expect(calcRotation(540)).toBe(-45);
      // 12:00 solar zenith -> 0 deg
      expect(calcRotation(720)).toBe(0);
      // 15:00 afternoon -> +45 deg
      expect(calcRotation(900)).toBe(45);
      // 18:00 sunset / dusk -> +90 deg
      expect(calcRotation(1080)).toBe(90);
      // 21:00 late evening -> +135 deg
      expect(calcRotation(1260)).toBe(135);
      // 23:59 day end -> +179.75 deg
      expect(calcRotation(1439)).toBe(179.75);
      // 24:00 (1440) rollover -> +180 deg
      expect(calcRotation(1440)).toBe(180);
    });

    it("verifies multi-day and multi-season cumulative minute rotations match angle modulo 360", () => {
      // Day 2 12:00 (minute 2160)
      const day2Noon = calcRotation(1440 + 720);
      expect(day2Noon).toBe(360);
      expect(((day2Noon % 360) + 360) % 360).toBe(0);

      // Day 30 18:00 (minute 29 * 1440 + 1080 = 42840)
      const day30Dusk = calcRotation(29 * 1440 + 1080);
      expect(((day30Dusk % 360) + 360) % 360).toBe(90);

      // Season 2 Day 1 06:00 (minute 30 * 1440 + 360 = 43560)
      const season2Dawn = calcRotation(30 * 1440 + 360);
      expect(((season2Dawn % 360) + 360) % 360).toBe(270); // -90 deg is 270 deg

      // Year 2 Day 1 12:00 (minute 120 * 1440 + 720 = 173520)
      const year2Noon = calcRotation(120 * 1440 + 720);
      expect(((year2Noon % 360) + 360) % 360).toBe(0);
    });

    it("handles negative minutes and extreme floats without NaN or runtime exceptions", () => {
      // -60 minutes (equivalent to 23:00 of prior day)
      const neg60 = calcRotation(-60);
      expect(neg60).toBe(-195);
      expect(((neg60 % 360) + 360) % 360).toBe(165); // 23:00 is (1380-720)/1440*360 = 165 deg

      // Non-integer minute
      const halfMinute = calcRotation(720.5);
      expect(halfMinute).toBe(0.125);

      // Render dial with negative and float rotation
      const htmlNeg = renderToString(
        React.createElement(CelestialTimeDial, { rotation: neg60, isNight: true })
      );
      expect(htmlNeg).toContain("rotate(-195 27 27)");

      const htmlFloat = renderToString(
        React.createElement(CelestialTimeDial, { rotation: halfMinute, isNight: false })
      );
      expect(htmlFloat).toContain("rotate(0.125 27 27)");
    });

    it("correctly renders HUD clock across calendar rollover (Season transition Day 30 -> Day 31)", () => {
      const clock = new GameClock({ currentMinute: 29 * MINUTES_PER_DAY + 1430 }); // Day 30 23:50
      const state = createInitialGameState();
      state.clock = clock.getState();

      const htmlDay30 = renderToString(React.createElement(HUD, { state, promptText: null }));
      expect(htmlDay30).toContain("Spring 30");
      expect(htmlDay30).toContain("23:50");

      // Advance 20 minutes across midnight into Summer Day 1
      clock.advanceMinutes(20);
      state.clock = clock.getState();
      const htmlDay31 = renderToString(React.createElement(HUD, { state, promptText: null }));
      expect(htmlDay31).toContain("Summer 1");
      expect(htmlDay31).toContain("00:10");
    });
  });

  // =========================================================================
  // 2. ADVERSARIAL WEATHER & TEMPERATURE CONDITIONS
  // =========================================================================
  describe("2. Weather & Temperature Condition Combinations", () => {
    it("formats all 7 standard weather tags and underscore variants", () => {
      const standardTags: Array<[WeatherTag, string]> = [
        ["clear", "Clear sky"],
        ["cloudy", "Overcast"],
        ["light-rain", "Light rain"],
        ["heavy-rain", "Heavy rain"],
        ["windy", "Windy"],
        ["fog", "Fog"],
        ["storm", "Storm"]
      ];

      for (const [tag, expectedLabel] of standardTags) {
        expect(formatWeatherLabel(tag)).toBe(expectedLabel);
      }

      // Underscore variants
      expect(formatWeatherLabel("light_rain" as any)).toBe("Light rain");
      expect(formatWeatherLabel("heavy_rain" as any)).toBe("Heavy rain");

      // Fallback capitalized formatting for custom weather
      expect(formatWeatherLabel("sand_storm" as any)).toBe("Sand Storm");
      expect(formatWeatherLabel("blizzard" as any)).toBe("Blizzard");
    });

    it("evaluates severe weather alert priorities and tones accurately", () => {
      const state = createInitialGameState();

      // Case A: Storm -> Danger
      state.weather.type = "storm";
      state.weather.windSpeed = 5;
      state.weather.seaRoughness = 0.2;
      const htmlStorm = renderToString(React.createElement(HUD, { state, promptText: null }));
      expect(htmlStorm).toContain("hud-weather-chip--danger");
      expect(htmlStorm).toContain("Storm Warning");

      // Case B: Dense Fog (< 0.5 visibility) -> Caution
      state.weather.type = "fog";
      state.weather.visibility = 0.3;
      state.weather.windSpeed = 4;
      state.weather.seaRoughness = 0.2;
      const htmlDenseFog = renderToString(React.createElement(HUD, { state, promptText: null }));
      expect(htmlDenseFog).toContain("hud-weather-chip--caution");
      expect(htmlDenseFog).toContain("Dense Fog");

      // Case C: Light Fog (>= 0.5 visibility, calm wind/sea) -> No alert chip
      state.weather.type = "fog";
      state.weather.visibility = 0.8;
      state.weather.windSpeed = 4;
      state.weather.seaRoughness = 0.2;
      const htmlLightFog = renderToString(React.createElement(HUD, { state, promptText: null }));
      expect(htmlLightFog).not.toContain("Dense Fog");
      expect(htmlLightFog).not.toContain("Storm Warning");

      // Case D: Gale Winds (windSpeed >= 11) -> Caution
      state.weather.type = "cloudy";
      state.weather.windSpeed = 12.5; // ~24 kn
      state.weather.seaRoughness = 0.4;
      const htmlGale = renderToString(React.createElement(HUD, { state, promptText: null }));
      expect(htmlGale).toContain("hud-weather-chip--caution");
      expect(htmlGale).toContain("Gale Winds");

      // Case E: Rough Swell (seaRoughness >= 0.7) -> Caution
      state.weather.type = "clear";
      state.weather.windSpeed = 5;
      state.weather.seaRoughness = 0.85;
      const htmlSwell = renderToString(React.createElement(HUD, { state, promptText: null }));
      expect(htmlSwell).toContain("hud-weather-chip--caution");
      expect(htmlSwell).toContain("Rough Swell");

      // Case F: Storm takes precedence over high wind and rough sea
      state.weather.type = "storm";
      state.weather.windSpeed = 15;
      state.weather.seaRoughness = 0.95;
      const htmlCombined = renderToString(React.createElement(HUD, { state, promptText: null }));
      expect(htmlCombined).toContain("hud-weather-chip--danger");
      expect(htmlCombined).toContain("Storm Warning");
      // Only 1 severe weather chip at a time
      expect(htmlCombined).not.toContain("Gale Winds");
      expect(htmlCombined).not.toContain("Rough Swell");
    });

    it("handles temperature extremes: freezing, zero, sub-zero, scorching, and heatwaves", () => {
      const state = createInitialGameState();

      // Deep freezing winter (-18.4°C)
      state.weather.temperatureC = -18.4;
      let html = renderToString(React.createElement(HUD, { state, promptText: null }));
      expect(html).toContain("-18°C");

      // Sub-zero near zero (-0.6°C rounds to -1°C)
      state.weather.temperatureC = -0.6;
      html = renderToString(React.createElement(HUD, { state, promptText: null }));
      expect(html).toContain("-1°C");

      // Freezing point (0.0°C)
      state.weather.temperatureC = 0.0;
      html = renderToString(React.createElement(HUD, { state, promptText: null }));
      expect(html).toContain("0°C");

      // Scorching summer (+38.7°C rounds to 39°C)
      state.weather.temperatureC = 38.7;
      html = renderToString(React.createElement(HUD, { state, promptText: null }));
      expect(html).toContain("39°C");

      // Extreme heatwave (+48.2°C rounds to 48°C)
      state.weather.temperatureC = 48.2;
      html = renderToString(React.createElement(HUD, { state, promptText: null }));
      expect(html).toContain("48°C");
    });
  });

  // =========================================================================
  // 3. TOOL HOTBAR SELECTION STATES & INTERACTION PROMPT PARSER
  // =========================================================================
  describe("3. Tool Hotbar States & Interaction Prompt Bracket Parsing", () => {
    it("selects hotbar slots 1 through 5 and marks active button with aria-pressed", () => {
      const state = createInitialGameState();

      for (let slot = 1; slot <= 5; slot++) {
        const html = renderToString(
          React.createElement(HUD, {
            state,
            promptText: null,
            activeToolSlot: slot
          })
        );
        expect(html).toContain(`data-testid="tool-slot-${slot}"`);
        expect(html).toContain(`hud-hotbar-slot is-active`);
        expect(html).toContain('aria-pressed="true"');
      }
    });

    it("gracefully handles null, undefined, 0, and out-of-bounds tool slot indices", () => {
      const state = createInitialGameState();

      // slot 0 (out of bounds)
      const html0 = renderToString(
        React.createElement(HUD, { state, promptText: null, activeToolSlot: 0 })
      );
      expect(html0).not.toContain("is-active");

      // slot 6 (out of bounds)
      const html6 = renderToString(
        React.createElement(HUD, { state, promptText: null, activeToolSlot: 6 })
      );
      expect(html6).not.toContain("is-active");

      // slot -1 (negative)
      const htmlNeg = renderToString(
        React.createElement(HUD, { state, promptText: null, activeToolSlot: -1 })
      );
      expect(htmlNeg).not.toContain("is-active");

      // slot undefined (falls back to default 1)
      const htmlDef = renderToString(
        React.createElement(HUD, { state, promptText: null, activeToolSlot: undefined })
      );
      expect(htmlDef).toContain('data-testid="tool-slot-1"');
      expect(htmlDef).toContain("is-active");
    });

    it("parses single key brackets: [E], [Space], [F], [W], [Shift]", () => {
      const state = createInitialGameState();

      const testCases = [
        { input: "[E] Inspect Seedling", expectedKey: "E", expectedLabel: "Inspect Seedling" },
        { input: "[Space] Hook fish", expectedKey: "Space", expectedLabel: "Hook fish" },
        { input: "[F] Talk to Merchant", expectedKey: "F", expectedLabel: "Talk to Merchant" },
        { input: "[W] Accelerate Boat", expectedKey: "W", expectedLabel: "Accelerate Boat" },
        { input: "[Shift] Sprint", expectedKey: "Shift", expectedLabel: "Sprint" }
      ];

      for (const { input, expectedKey, expectedLabel } of testCases) {
        const html = renderToString(React.createElement(HUD, { state, promptText: input }));
        expect(html).toContain('data-testid="context-prompt"');
        expect(html).toContain(expectedKey);
        expect(html).toContain(expectedLabel);
      }
    });

    it("parses multi-key shortcuts like [E/F] or [Space/Enter] using first candidate", () => {
      const state = createInitialGameState();
      const html = renderToString(
        React.createElement(HUD, { state, promptText: "[E/F] Interact or Greet" })
      );
      expect(html).toContain('data-testid="context-prompt"');
      expect(html).toContain("E");
      expect(html).toContain("Interact or Greet");
    });

    it("handles plain text prompts without leading brackets by defaulting to [E] keycap", () => {
      const state = createInitialGameState();
      const html = renderToString(
        React.createElement(HUD, { state, promptText: "Pick Wild Berries" })
      );
      expect(html).toContain('data-testid="context-prompt"');
      expect(html).toContain("E");
      expect(html).toContain("Pick Wild Berries");
    });

    it("handles nested brackets in prompt label without mangling inner content", () => {
      const state = createInitialGameState();
      const html = renderToString(
        React.createElement(HUD, { state, promptText: "[E] Harvest [Golden Turnip] (3x)" })
      );
      expect(html).toContain('data-testid="context-prompt"');
      expect(html).toContain("E");
      expect(html).toContain("Harvest [Golden Turnip] (3x)");
    });

    it("suppresses prompts matching toast messages or system notifications", () => {
      const state = createInitialGameState();

      // Toast duplication suppression
      const htmlToast = renderToString(
        React.createElement(HUD, {
          state,
          promptText: "Item Added to Satchel",
          toastMessage: "Item Added to Satchel"
        })
      );
      expect(htmlToast).not.toContain('data-testid="context-prompt"');

      // Equipped prefix suppression
      const htmlEquip = renderToString(
        React.createElement(HUD, { state, promptText: "Equipped: Copper Watering Can" })
      );
      expect(htmlEquip).not.toContain('data-testid="context-prompt"');

      // Saved prefix suppression
      const htmlSaved = renderToString(
        React.createElement(HUD, { state, promptText: "Saved game successfully" })
      );
      expect(htmlSaved).not.toContain('data-testid="context-prompt"');
    });

    it("suppresses prompts when isPlacementActive is true", () => {
      const state = createInitialGameState();
      const html = renderToString(
        React.createElement(HUD, {
          state,
          promptText: "[E] Place Structure",
          isPlacementActive: true
        })
      );
      expect(html).not.toContain('data-testid="context-prompt"');
    });
  });

  // =========================================================================
  // 4. PROCEDURAL SVG DECORATIONS & REUSABLE HUD PRIMITIVES
  // =========================================================================
  describe("4. SVG Flourishes & Chrome Primitives Rendering", () => {
    it("renders all 4 filigree corner variations without errors", () => {
      const htmlTL = renderToString(React.createElement(FiligreeCornerTL, { size: 36 }));
      expect(htmlTL).toContain("hud-filigree-corner--tl");
      expect(htmlTL).toContain("<svg");

      const htmlTR = renderToString(React.createElement(FiligreeCornerTR, { size: 36 }));
      expect(htmlTR).toContain("scaleX(-1)");

      const htmlBL = renderToString(React.createElement(FiligreeCornerBL, { size: 36 }));
      expect(htmlBL).toContain("scaleY(-1)");

      const htmlBR = renderToString(React.createElement(FiligreeCornerBR, { size: 36 }));
      expect(htmlBR).toContain("scale(-1, -1)");
    });

    it("renders OrnateBrassDivider, MedallionPurse, and EmbossedKeycap", () => {
      const htmlDiv = renderToString(React.createElement(OrnateBrassDivider));
      expect(htmlDiv).toContain("chrome-divider-ornate-wrap");
      expect(htmlDiv).toContain("<line");

      const htmlPurse = renderToString(React.createElement(MedallionPurse, { size: 32 }));
      expect(htmlPurse).toContain("hud-medallion-purse-svg");

      const htmlKeycap = renderToString(
        React.createElement(EmbossedKeycap, { keyName: "Space", glow: true })
      );
      expect(htmlKeycap).toContain("hud-embossed-keycap");
      expect(htmlKeycap).toContain("is-glowing");
      expect(htmlKeycap).toContain("Space");
    });
  });

  // =========================================================================
  // 5. QUEST TRACKER HUD EDGE CASES & CLAMPING
  // =========================================================================
  describe("5. Quest Tracker HUD Edge Cases", () => {
    it("clamps progress to targetQuantity when currentProgress exceeds target", () => {
      const overCompleteQuest: ActiveQuestDto = {
        questId: "quest.harvest_extra",
        actId: "act1_homestead",
        actTitle: "Act I: Coastal Horizons",
        questTitle: "Abundant Harvest",
        speakerId: "npc.farmer",
        speakerName: "Farmer Giles",
        currentStepIndex: 0,
        totalSteps: 1,
        objectiveDescription: "Collect Turnips",
        currentProgress: 15,
        targetQuantity: 10,
        isStepComplete: true,
        isQuestReadyToTurnIn: true,
        targetLocation: undefined
      };

      const html = renderToString(
        React.createElement(QuestTrackerHUD, { activeQuest: overCompleteQuest })
      );

      expect(html).toContain("Abundant Harvest");
      expect(html).toContain("10 / 10");
      expect(html).not.toContain("15 / 10");
    });

    it("handles single-target quests (targetQuantity = 1) by omitting progress bar", () => {
      const singleTargetQuest: ActiveQuestDto = {
        questId: "quest.speak_elder",
        actId: "act1_homestead",
        actTitle: "Act I: Coastal Horizons",
        questTitle: "Seek the Elder",
        speakerId: "npc.elder",
        speakerName: "Elder Barnaby",
        currentStepIndex: 0,
        totalSteps: 1,
        objectiveDescription: "Speak with Elder Barnaby at the dock",
        currentProgress: 0,
        targetQuantity: 1,
        isStepComplete: false,
        isQuestReadyToTurnIn: false,
        targetLocation: { name: "Harbor Dock", x: 10, z: 20 }
      };

      const html = renderToString(
        React.createElement(QuestTrackerHUD, { activeQuest: singleTargetQuest })
      );

      expect(html).toContain("Seek the Elder");
      expect(html).toContain("Harbor Dock");
      expect(html).not.toContain("quest-progress-wrap");
    });
  });
});
