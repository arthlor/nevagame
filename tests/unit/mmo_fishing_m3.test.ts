import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { FishingHUD } from "../../src/ui/FishingHUD";
import { BasicFishingMinigameWidget } from "../../src/ui/fishing/BasicFishingMinigameWidget";
import { BasicFishingMinigame } from "../../src/simulation/fishing/BasicFishingMinigame";
import { FISHING_STEER_INPUT_MAX, FISHING_TUNING } from "../../src/simulation/fishing/FishingTuning";
import type { SportFishingHudDto } from "../../src/simulation/core/contracts";
import type { BasicFishingState } from "../../src/simulation/core/types";

const baseSportHud: SportFishingHudDto = {
  speciesId: "fish.trout",
  speciesName: "Rainbow Trout",
  energyPercent: 64,
  rodDirectionAngle: 0,
  steeringMagnitude: FISHING_STEER_INPUT_MAX,
  showFirstTip: false,
  decision: {
    fishAction: "Running left",
    response: "Pull right",
    action: "steer-right",
    key: "D",
    icon: "run",
    tone: "warning"
  },
  tensionPercent: 44,
  tensionBands: { slackEndPercent: 12, dangerStartPercent: 80 },
  tensionTone: "safe",
  tensionWord: "Good",
  lineIntegrityPercent: 100,
  showLineWarning: false,
  landingProgress: null,
  signatureMoment: null,
  dragNotch: 1,
  telemetry: {
    runDistanceMeters: 12.4,
    landingDistanceMeters: FISHING_TUNING.landingDistance,
    runDistancePercent: 74,
    waterDepthMeters: 2.6,
    rodDeflectionPercent: 0,
    counterSwingPercent: 0,
    counterSwingCue: null
  }
};

const sportHudWith = (
  telemetry: Partial<SportFishingHudDto["telemetry"]>
): SportFishingHudDto => ({
  ...baseSportHud,
  telemetry: { ...baseSportHud.telemetry, ...telemetry }
});

const renderSport = (hud: SportFishingHudDto): string =>
  renderToString(React.createElement(FishingHUD, { hud, onSetInput: () => {} }));

const castState = (castPower: number): BasicFishingState => ({
  ecologyId: "ecology.river" as BasicFishingState["ecologyId"],
  habitatId: "habitat.river",
  phase: "charging-cast",
  remainingSeconds: 0,
  willCatch: true,
  castPower
});

describe("Milestone M3 — Dual Fishing Minigames & Cockpits", () => {
  // ==========================================================================
  // R4.2 SPORT FISHING TELEMETRY
  // ==========================================================================
  describe("R4.2 Sport Fishing Telemetry HUD", () => {
    it("reports run distance in metres and the landing threshold", () => {
      const html = renderSport(baseSportHud);
      expect(html).toContain('data-testid="fishing-telemetry"');
      expect(html).toContain("12.4 m");
      expect(html).toContain(`Landing at ${FISHING_TUNING.landingDistance} m`);
    });

    it("swaps the run readout to a within-reach state inside landing range", () => {
      const html = renderSport(
        sportHudWith({ runDistanceMeters: 2.1, runDistancePercent: 0 })
      );
      expect(html).toContain("Within reach");
      expect(html).toContain("is-in-range");
      expect(html).not.toContain(`Landing at ${FISHING_TUNING.landingDistance} m`);
    });

    it("reports water depth, and names a breach rather than printing a negative", () => {
      expect(renderSport(sportHudWith({ waterDepthMeters: 4.8 }))).toContain("4.8 m");
      const surfaced = renderSport(sportHudWith({ waterDepthMeters: -0.3 }));
      expect(surfaced).toContain("Surfaced");
      expect(surfaced).not.toContain("-0.3");
    });

    it("names the rod lay side rather than showing a signed number", () => {
      expect(renderSport(sportHudWith({ rodDeflectionPercent: 0 }))).toContain("Centred");
      expect(renderSport(sportHudWith({ rodDeflectionPercent: 62 }))).toContain("Right 62%");
      const left = renderSport(sportHudWith({ rodDeflectionPercent: -41 }));
      expect(left).toContain("Left 41%");
      expect(left).not.toContain("-41");
    });

    it("carries the [A]/[D] counter-swing cue with the counter reading", () => {
      const left = renderSport(sportHudWith({ counterSwingCue: "left" }));
      expect(left).toContain("Swing left");
      expect(left).toContain(">A<");

      const right = renderSport(sportHudWith({ counterSwingCue: "right" }));
      expect(right).toContain("Swing right");
      expect(right).toContain(">D<");
    });

    it("shows a holding state when the fish is not running either way", () => {
      const html = renderSport(sportHudWith({ counterSwingCue: null }));
      expect(html).toContain("Holding");
    });

    it("tones the counter bar by whether the rod opposes or feeds the run", () => {
      expect(renderSport(sportHudWith({ counterSwingPercent: 70 }))).toContain('data-tone="good"');
      expect(renderSport(sportHudWith({ counterSwingPercent: -70 }))).toContain('data-tone="danger"');
      expect(renderSport(sportHudWith({ counterSwingPercent: 5 }))).toContain('data-tone="neutral"');
    });
  });

  // ==========================================================================
  // R4.1 CAST SWEET SPOT & BOBBER ALERT
  // ==========================================================================
  describe("R4.1 Basic Fishing Minigame", () => {
    it("marks the cast bands the quality roll actually reads", () => {
      // A meter showing bands the roll ignores would teach the wrong cast.
      const { good, prime } = BasicFishingMinigame.CAST_QUALITY_THRESHOLDS;
      expect(good).toBeGreaterThan(0);
      expect(prime).toBeGreaterThan(good);
      expect(prime).toBeLessThanOrEqual(1);

      const html = renderToString(
        React.createElement(BasicFishingMinigameWidget, { fishingState: castState(0.9) })
      );
      expect(html).toContain("cast-sweet-spot-track");
      expect(html).toContain(`left:${good * 100}%`);
      expect(html).toContain(`left:${prime * 100}%`);
    });

    it("activates exactly the band the current cast power falls in", () => {
      const { good, prime } = BasicFishingMinigame.CAST_QUALITY_THRESHOLDS;
      const bandFor = (power: number): string => {
        const html = renderToString(
          React.createElement(BasicFishingMinigameWidget, { fishingState: castState(power) })
        );
        const active = (["short", "good", "prime"] as const).filter((band) =>
          new RegExp(`is-active[^"]*"[^>]*data-testid="cast-band-${band}"`).test(html)
          || new RegExp(`data-testid="cast-band-${band}"`).test(
            html.split("<span").filter((chunk) => chunk.includes("is-active")).join("<span")
          )
        );
        expect(active).toHaveLength(1);
        return active[0];
      };
      expect(bandFor(good - 0.01)).toBe("short");
      expect(bandFor(good)).toBe("good");
      expect(bandFor(prime - 0.01)).toBe("good");
      expect(bandFor(prime)).toBe("prime");
      expect(bandFor(1)).toBe("prime");
    });

    it("puts a dipping bobber with spreading rings on the bite alert", () => {
      const html = renderToString(
        React.createElement(BasicFishingMinigameWidget, {
          fishingState: { ...castState(0.5), phase: "bite-reaction" }
        })
      );
      expect(html).toContain('data-testid="bite-bobber"');
      expect(html).toContain("bite-bobber-float");
      expect(html).toContain("bite-bobber-ripple");
    });

    it("animates the bobber and honours reduced motion through the global guard", () => {
      const css = fs.readFileSync(
        path.resolve(import.meta.dirname, "../../src/ui/fishing/BasicFishingMinigame.css"),
        "utf8"
      );
      expect(css).toMatch(/@keyframes bobberDip/);
      expect(css).toMatch(/@keyframes bobberRipple/);

      // The widget sits under #ui-container, so a11y.css's reduced-motion rule
      // already covers these keyframes; assert that guard still exists.
      const a11y = fs.readFileSync(
        path.resolve(import.meta.dirname, "../../src/ui/a11y.css"),
        "utf8"
      );
      expect(a11y).toMatch(/prefers-reduced-motion: reduce/);
      expect(a11y).toMatch(/animation-duration: 1ms !important/);
    });
  });
});
