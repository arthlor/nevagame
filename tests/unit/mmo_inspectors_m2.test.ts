import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { Simulation } from "../../src/simulation/Simulation";
import { LegacyHUD as HUD } from "./uiTestHelpers";

// Component imports
import { CropInspection } from "../../src/ui/components/CropInspection";
import { FarmGISLegend } from "../../src/ui/components/FarmGISLegend";
import {
  CatchInspectionModal,
  CatchSummaryToast
} from "../../src/ui/components/CatchInspectionModal";
import {
  ContextualHintCard,
  hintVisibleMs,
  inferHintCategory,
  HINT_DISMISS_MIN_MS,
  HINT_DISMISS_MAX_MS,
  type HintCategory
} from "../../src/ui/components/ContextualHintCard";
import { NoticeStack } from "../../src/ui/components/NoticeStack";
import {
  WeatherHazardBanner,
  resolveMaritimeHazard
} from "../../src/ui/components/WeatherHazardBanner";
import { MaritimeVesselConsole } from "../../src/ui/components/MaritimeVesselConsole";

// Simulation & pure logic imports
import {
  calculateAllometricLengthCm,
  qualityToStars,
  buildTrophyCatchDto
} from "../../src/simulation/fishing/trophyCatch";
import type {
  CropInspectionDto,
  TrophyCatchDto,
  WorldHudBoatDto,
  MaritimeHazardDto
} from "../../src/simulation/core/contracts";
import type { FishCargoState } from "../../src/simulation/core/types";
import type { Notice } from "../../src/ui/notifications";
import { PALETTE_HEX } from "../../src/render/materials/PaletteTokens";

describe("Milestone M2 MMO Inspectors, Navigation Console & Tactile GIS Suite", () => {
  // =========================================================================
  // F3.1 IN-WORLD CROP INSPECTION CARD & SCREEN PROJECTION CLAMPING
  // =========================================================================
  describe("F3.1 In-World Crop Inspection Card", () => {
    const baseCropInspection: CropInspectionDto = {
      placedCropId: "crop.placed.turnip_1",
      cropId: "crop.turnip",
      name: "White Turnip",
      stage: "growing",
      approximateMinutesRemaining: 25,
      stageTimingLabel: "Harvest in 25m",
      moisture: { value: 0.65, band: "normal" },
      climate: {
        current: "temperate",
        preferred: ["temperate"],
        status: "preferred"
      },
      soil: { fertility: 85, band: "good" },
      expectedYield: { min: 2, max: 4 },
      work: {
        current: 500,
        baseCost: 5,
        cost: 5,
        availableWork: 500,
        affordable: true,
        shortage: 0,
        readyAtMinute: null
      },
      waterWork: {
        baseCost: 5,
        cost: 5,
        availableWork: 500,
        affordable: true,
        shortage: 0,
        readyAtMinute: null
      },
      harvestWork: {
        baseCost: 15,
        cost: 15,
        availableWork: 500,
        affordable: true,
        shortage: 0,
        readyAtMinute: null
      },
      immediateAction: {
        kind: "water",
        label: "Water Crop",
        cost: 5,
        available: true
      },
      actions: { canWater: true, canHarvest: false }
    };

    it("renders crop name, stage chip, countdown label, moisture band, and next action Work cost", () => {
      const html = renderToString(
        React.createElement(CropInspection, {
          inspection: baseCropInspection,
          onClose: () => {}
        })
      );

      expect(html).toContain('data-testid="crop-inspection"');
      expect(html).toContain("White Turnip");
      expect(html).toContain("crop-stage-chip stage-growing");
      expect(html).toContain("Growing");
      expect(html).toContain("Harvest in 25m");
      expect(html).toContain("moisture-ideal");
      expect(html).toContain("Water Crop");
      expect(html).toMatch(/5<!-- --> Work/);
      expect(html).toContain("crop-inspection-close-btn");
      expect(html).toContain('aria-label="White Turnip crop inspection"');
    });

    it("renders wet and dry moisture tones appropriately", () => {
      const wetInspection: CropInspectionDto = {
        ...baseCropInspection,
        moisture: { value: 0.95, band: "wet" }
      };
      const wetHtml = renderToString(
        React.createElement(CropInspection, { inspection: wetInspection })
      );
      expect(wetHtml).toContain("moisture-wet");

      const dryInspection: CropInspectionDto = {
        ...baseCropInspection,
        moisture: { value: 0.15, band: "dry" }
      };
      const dryHtml = renderToString(
        React.createElement(CropInspection, { inspection: dryInspection })
      );
      expect(dryHtml).toContain("moisture-dry");
    });

    it("calculates 3D camera projection screen positions with safe 16px viewport clamping", () => {
      const originalWindow = (global as any).window;
      (global as any).window = { innerWidth: 1920, innerHeight: 1080 };

      try {
        // Case A: Normal centered in-viewport anchor
        const htmlNormal = renderToString(
          React.createElement(CropInspection, {
            inspection: baseCropInspection,
            projectedPosition: { x: 800, y: 600, visible: true }
          })
        );
        expect(htmlNormal).toContain('data-projected="true"');
        // Left: 800 - (300/2) = 650px. Top: 600 - 180 - 20 = 400px.
        expect(htmlNormal).toContain("left:650px");
        expect(htmlNormal).toContain("top:400px");

        // Case B: Clamped near top-left screen boundary (16px minimum safe margin)
        const htmlTopLeft = renderToString(
          React.createElement(CropInspection, {
            inspection: baseCropInspection,
            projectedPosition: { x: 50, y: 50, visible: true }
          })
        );
        // rawLeft = 50 - 150 = -100px -> clamped to margin 16px
        // rawTop = 50 - 200 = -150px -> clamped to margin 16px
        expect(htmlTopLeft).toContain("left:16px");
        expect(htmlTopLeft).toContain("top:16px");

        // Case C: Clamped near bottom-right screen boundary
        const htmlBottomRight = renderToString(
          React.createElement(CropInspection, {
            inspection: baseCropInspection,
            projectedPosition: { x: 2000, y: 1200, visible: true }
          })
        );
        // clampedLeft = min(1920 - 300 - 16, 2000 - 150) = 1604px
        // clampedTop = min(1080 - 180 - 16, 1200 - 200) = 884px
        expect(htmlBottomRight).toContain("left:1604px");
        expect(htmlBottomRight).toContain("top:884px");

        // Case D: Off-screen or behind camera (visible === false) -> falls back to docked styling
        const htmlHidden = renderToString(
          React.createElement(CropInspection, {
            inspection: baseCropInspection,
            projectedPosition: { x: 800, y: 600, visible: false }
          })
        );
        expect(htmlHidden).toContain('data-projected="false"');
        expect(htmlHidden).not.toContain("left:650px");
      } finally {
        (global as any).window = originalWindow;
      }
    });
  });

  // =========================================================================
  // F3.2 FARM GIS SOIL OVERLAY & LEGEND
  // =========================================================================
  describe("F3.2 Farm GIS Soil Overlay & Legend", () => {
    it("renders FarmGISLegend with moisture tiers, soil fertility bands, and crop status", () => {
      const html = renderToString(React.createElement(FarmGISLegend, { visible: true }));

      expect(html).toContain('data-testid="farm-gis-legend"');
      expect(html).toContain("Field signs");
      expect(html).toContain("Release Alt to hide");

      // Moisture tiers
      expect(html).toContain("Moisture Tiers");
      expect(html).toContain("Good moisture");
      expect(html).toContain("Dry soil");
      expect(html).toContain("Saturated soil");

      // Soil fertility bands
      expect(html).toContain("Soil Fertility");
      expect(html).toContain("Rich fertility");
      expect(html).toContain("Fair fertility");
      expect(html).toContain("Depleted soil");

      // Field progress
      expect(html).toContain("Field Progress");
      expect(html).toContain("Ready to harvest");
      expect(html).toContain("Growing");
      expect(html).toContain("Prepared soil");
    });

    it("returns null when FarmGISLegend is not visible", () => {
      const html = renderToString(React.createElement(FarmGISLegend, { visible: false }));
      expect(html).toBe("");
    });

    it("verifies PALETTE_HEX color tokens for GIS moisture and soil fertility", () => {
      // Accent and foliage tokens used for GIS moisture overlay
      expect(PALETTE_HEX.accent_teal_01).toBeDefined();
      expect(PALETTE_HEX.accent_ochre_01).toBeDefined();
      expect(PALETTE_HEX.foliage_sage_01).toBeDefined();

      // Stone/gold tokens used for GIS soil fertility modulation
      expect(PALETTE_HEX.stone_golden_01).toBeDefined();
      expect(PALETTE_HEX.stone_cool_01).toBeDefined();

      // Non-GIS base soil tokens
      expect(PALETTE_HEX.soil_damp_01).toBeDefined();
      expect(PALETTE_HEX.soil_dry_01).toBeDefined();
      expect(PALETTE_HEX.soil_warm_01).toBeDefined();
    });
  });

  // =========================================================================
  // F3.3 TROPHY CATCH INSPECTION MODAL & SUMMARY TOAST
  // =========================================================================
  describe("F3.3 Trophy Catch Inspection Modal, Toast & Allometric Length Scaling", () => {
    describe("Allometric Cubic Scaling Math", () => {
      it("calculates allometric length cm with cubic root weight scaling", () => {
        // Medium class base: 48 cm at 1.5 kg average
        const baseLength = calculateAllometricLengthCm(1.5, "medium", 1.5);
        expect(baseLength).toBeCloseTo(48.0, 1);

        // Double weight (3.0 kg) scales length by 2^(1/3) ~ 1.2599 -> ~60.5 cm
        const heavyLength = calculateAllometricLengthCm(3.0, "medium", 1.5);
        expect(heavyLength).toBeCloseTo(48.0 * Math.cbrt(2), 1);
        expect(heavyLength).toBeGreaterThan(baseLength);

        // Half weight (0.75 kg) scales length by 0.5^(1/3) ~ 0.7937 -> ~38.1 cm
        const lightLength = calculateAllometricLengthCm(0.75, "medium", 1.5);
        expect(lightLength).toBeCloseTo(48.0 * Math.cbrt(0.5), 1);
        expect(lightLength).toBeLessThan(baseLength);
      });

      it("enforces strict monotonicity: heavier weight always produces strictly longer length", () => {
        const weights = [0.5, 1.2, 2.5, 4.0, 7.5, 12.0, 25.0];
        const cargoClasses: Array<"small" | "medium" | "large" | "gargantuan"> = [
          "small",
          "medium",
          "large",
          "gargantuan"
        ];

        for (const cls of cargoClasses) {
          let prevLen = 0;
          for (const w of weights) {
            const len = calculateAllometricLengthCm(w, cls, 2.0);
            expect(len).toBeGreaterThan(prevLen);
            prevLen = len;
          }
        }
      });
    });

    describe("Quality to Stars Conversion", () => {
      it("maps standard quality levels to 1-4 stars", () => {
        expect(qualityToStars("common")).toBe(1);
        expect(qualityToStars("fine")).toBe(2);
        expect(qualityToStars("exceptional")).toBe(3);
        expect(qualityToStars("trophy")).toBe(4);
      });
    });

    describe("buildTrophyCatchDto Presentation Builder", () => {
      it("constructs TrophyCatchDto from landed fish cargo state", () => {
        const cargo: FishCargoState = {
          id: "cargo.test.1",
          speciesId: "fish.salmon",
          weightKg: 4.5,
          quality: "exceptional",
          caughtAtMinute: 480,
          freshness: 95,
          cargoClass: "medium",
          location: { type: "boat-hold", containerId: "boat.1" }
        };
        const dto = buildTrophyCatchDto(cargo, "weight");
        expect(dto.cargoId).toBe("cargo.test.1");
        expect(dto.speciesId).toBe("fish.salmon");
        expect(dto.weightKg).toBe(4.5);
        expect(dto.quality).toBe("exceptional");
        expect(dto.qualityStars).toBe(3);
        expect(dto.record).toBe("weight");
        expect(dto.storageDestination).toBe("boat-hold");
        expect(dto.storageLocationLabel).toBe("Stowed in boat hold");
      });
    });

    describe("CatchInspectionModal Component Presentation", () => {
      const trophyCatch: TrophyCatchDto = {
        cargoId: "cargo.trophy_salmon_01",
        speciesId: "fish.salmon",
        speciesName: "Atlantic Salmon",
        weightKg: 6.85,
        lengthCm: 86.2,
        quality: "exceptional",
        qualityStars: 3,
        freshnessPercent: 96,
        freshnessTone: "fresh",
        estimatedShelfLifeMinutes: 48,
        estimatedMarketValue: 340,
        cargoClass: "medium",
        habitats: ["coastal", "river"],
        storageDestination: "boat-hold",
        storageLocationLabel: "Stowed in boat hold",
        record: "weight"
      };

      it("renders celebratory headline, species portrait, record banner, vitals grid, and stars", () => {
        const html = renderToString(
          React.createElement(CatchInspectionModal, {
            catchData: trophyCatch,
            onDismiss: () => {},
            onOpenHoldOrSatchel: () => {}
          })
        );

        expect(html).toContain('data-testid="catch-inspection-modal"');
        expect(html).toContain("Trophy Catch Landed!");
        expect(html).toContain("COASTAL SPORT ANGLING");
        expect(html).toContain("Atlantic Salmon");

        // Personal record banner
        expect(html).toContain("catch-record-banner record-weight");
        expect(html).toContain("HEAVIEST CATCH RECORD");

        // Vitals grid
        expect(html).toContain("6.85 kg");
        expect(html).toContain("86.2 cm");
        expect(html).toContain("340 G");
        expect(html).toContain("96%");
        expect(html).toContain("~48m remaining");

        // Four star marks are always drawn; three of them are filled.
        expect(html).toContain("catch-stars");
        expect((html.match(/is-earned/g) ?? []).length).toBe(3);
        expect((html.match(/is-unearned/g) ?? []).length).toBe(1);

        // Storage location and buttons
        expect(html).toContain("Stowed in boat hold");
        expect(html).toContain("Inspect Hold");
        expect(html).toContain("Continue Fishing");
      });

      it("renders first catch and quality record banners appropriately", () => {
        const firstRecordCatch: TrophyCatchDto = { ...trophyCatch, record: "first" };
        const firstHtml = renderToString(
          React.createElement(CatchInspectionModal, {
            catchData: firstRecordCatch,
            onDismiss: () => {}
          })
        );
        expect(firstHtml).toContain("NEW SPECIES RECORD");

        const qualityRecordCatch: TrophyCatchDto = { ...trophyCatch, record: "quality" };
        const qualHtml = renderToString(
          React.createElement(CatchInspectionModal, {
            catchData: qualityRecordCatch,
            onDismiss: () => {}
          })
        );
        expect(qualHtml).toContain("FINEST GRADE RECORD");
      });
    });

    describe("CatchSummaryToast Component Presentation", () => {
      it("renders lightweight toast with species, stats, quality, and inspect hint", () => {
        const cargo: FishCargoState = {
          id: "cargo.cod_01",
          speciesId: "fish.cod",
          weightKg: 3.2,
          quality: "fine",
          caughtAtMinute: 500,
          freshness: 92,
          cargoClass: "medium",
          location: { type: "player", containerId: "inv.player" }
        };

        const html = renderToString(
          React.createElement(CatchSummaryToast, {
            cargo,
            onDismiss: () => {},
            onClick: () => {}
          })
        );

        expect(html).toContain('data-testid="catch-summary"');
        expect(html).toMatch(/3\.2(<!-- -->)?\s*kg/);
        expect(html).toContain("Carried by hand");
        expect(html).toMatch(/92(<!-- -->)?%\s*fresh/);
        expect(html).toContain("Click to inspect");
      });
    });
  });

  // =========================================================================
  // F3.4 CONTEXTUAL HINT CARDS
  // =========================================================================
  describe("F3.4 Contextual Hint Cards", () => {
    it("renders all 5 category insignia badges and visible [Esc] keycap badge", () => {
      const categories: Array<{ cat: HintCategory; expectedLabel: string }> = [
        { cat: "boating", expectedLabel: "NAVIGATION" },
        { cat: "angling", expectedLabel: "ANGLING" },
        { cat: "farming", expectedLabel: "AGRONOMY" },
        { cat: "weather", expectedLabel: "WEATHER" },
        { cat: "general", expectedLabel: "DISCOVERY" }
      ];

      for (const { cat, expectedLabel } of categories) {
        const html = renderToString(
          React.createElement(ContextualHintCard, {
            hintId: `hint.test.${cat}`,
            title: "Field Advisory",
            message: "Observe local coastal conditions.",
            category: cat,
            onDismiss: () => {}
          })
        );

        expect(html).toContain('data-testid="contextual-hint"');
        expect(html).toContain(`hint-category--${cat}`);
        expect(html).toContain(`data-category="${cat}"`);
        expect(html).toContain(expectedLabel);
        expect(html).toContain("[Esc]");
        expect(html).toContain("Dismiss");
      }
    });

    it("infers category automatically from hintId naming patterns", () => {
      expect(inferHintCategory("boat.first_launch")).toBe("boating");
      expect(inferHintCategory("maritime.anchoring")).toBe("boating");
      expect(inferHintCategory("fishing.deep_trolling")).toBe("angling");
      expect(inferHintCategory("farm.crop_moisture")).toBe("farming");
      expect(inferHintCategory("weather.dense_fog")).toBe("weather");
      expect(inferHintCategory("unknown.welcome")).toBe("general");
    });

    it("calculates dynamic reading duration clamped between 5,000ms and 15,000ms", () => {
      // Short prompt: 10 characters * 40ms = 400ms -> clamped up to 5,000ms
      expect(hintVisibleMs("Quick tip.")).toBe(HINT_DISMISS_MIN_MS);

      // Medium prompt: 200 characters * 40ms = 8,000ms
      const mediumText = "a".repeat(200);
      expect(hintVisibleMs(mediumText)).toBe(8000);

      // Long prompt: 500 characters * 40ms = 20,000ms -> clamped down to 15,000ms
      const longText = "a".repeat(500);
      expect(hintVisibleMs(longText)).toBe(HINT_DISMISS_MAX_MS);
    });

    it("supports accessible ARIA attributes and initial data-held state", () => {
      const html = renderToString(
        React.createElement(ContextualHintCard, {
          hintId: "hint.accessible",
          title: "Safe Mooring",
          message: "Tie up at the southern pier.",
          onDismiss: () => {}
        })
      );

      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('data-held="false"');
    });
  });

  // =========================================================================
  // F3.5 NOTICE STACK & WEATHER HAZARD BANNER
  // =========================================================================
  describe("F3.5 Notice Stack & Weather Hazards", () => {
    describe("NoticeStack Structured Deltas", () => {
      it("renders structured item deltas, labor shifts, and gold transactions", () => {
        const notices: Notice[] = [
          {
            id: 101,
            text: "+3 Winter Carrot",
            tone: "info",
            createdMs: 1000,
            expiresMs: 3500,
            count: 1,
            category: "general",
            delta: { kind: "item", amount: 3, label: "Winter Carrot", itemId: "crop.carrot" }
          },
          {
            id: 102,
            text: "-12 Work",
            tone: "info",
            createdMs: 1100,
            expiresMs: 3600,
            count: 1,
            category: "general",
            delta: { kind: "labor", amount: -12, label: "Work" }
          },
          {
            id: 103,
            text: "+150 Gold",
            tone: "reward",
            createdMs: 1200,
            expiresMs: 3700,
            count: 1,
            category: "general",
            delta: { kind: "money", amount: 150, label: "Gold" }
          }
        ];

        const html = renderToString(React.createElement(NoticeStack, { notices }));

        expect(html).toContain('data-testid="notice-stack"');
        expect(html).toContain('data-notice-count="3"');

        // Item delta: +3 Winter Carrot
        expect(html).toContain("delta-kind--item");
        expect(html).toContain("+3");
        expect(html).toContain("Winter Carrot");

        // Labor delta: -12 Work
        expect(html).toContain("delta-kind--labor");
        expect(html).toContain("-12");
        expect(html).toContain("toast-labor-spark");

        // Money delta: +150 Gold
        expect(html).toContain("delta-kind--money");
        expect(html).toContain("+150");
        expect(html).toContain("toast-money-coin");
      });

      it("parses informal delta text strings when explicit delta object is omitted", () => {
        const notices: Notice[] = [
          {
            id: 201,
            text: "+5 Wheat",
            tone: "info",
            createdMs: 2000,
            expiresMs: 4500,
            count: 1,
            category: "general",
          },
          {
            id: 202,
            text: "-20 Work (Tilling)",
            tone: "info",
            createdMs: 2100,
            expiresMs: 4600,
            count: 1,
            category: "general",
          }
        ];

        const html = renderToString(React.createElement(NoticeStack, { notices }));

        // Parsed item delta
        expect(html).toContain("delta-kind--item");
        expect(html).toContain("+5");
        expect(html).toContain("Wheat");

        // Parsed labor delta with context
        expect(html).toContain("delta-kind--labor");
        expect(html).toContain("-20");
        expect(html).toContain("Work (Tilling)");
      });
    });

    describe("WeatherHazardBanner Presentation", () => {
      it("resolves maritime hazards: Dense Fog, Squall Winds, Rough Swell, Storm", () => {
        const fogHazard = resolveMaritimeHazard({ text: "Dense Fog Alert", tone: "caution" });
        expect(fogHazard?.hazardId).toBe("dense-fog");
        expect(fogHazard?.title).toBe("Dense Maritime Fog");
        expect(fogHazard?.speedPenaltyPercent).toBe(15);

        const squallHazard = resolveMaritimeHazard({ text: "Gale Winds Rising", tone: "caution" });
        expect(squallHazard?.hazardId).toBe("squall");
        expect(squallHazard?.title).toBe("Gale-Force Squall");
        expect(squallHazard?.speedPenaltyPercent).toBe(20);

        const swellHazard = resolveMaritimeHazard({ text: "Rough Swell Warning", tone: "caution" });
        expect(swellHazard?.hazardId).toBe("storm-waves");
        expect(swellHazard?.title).toBe("Hazardous Rough Swell");
        expect(swellHazard?.speedPenaltyPercent).toBe(25);

        const stormHazard = resolveMaritimeHazard({ text: "Coastal Storm", tone: "danger" });
        expect(stormHazard?.hazardId).toBe("storm");
        expect(stormHazard?.severity).toBe("danger");
      });

      it("renders prominent WeatherHazardBanner with advisory text and dismiss action", () => {
        const hazardDto: MaritimeHazardDto = {
          hazardId: "squall",
          title: "Gale-Force Squall",
          severity: "caution",
          conditionLabel: "Gusts > 24 kn",
          navigationalAdvisory: "High drift. Maintain heading into wind.",
          speedPenaltyPercent: 20
        };

        const html = renderToString(
          React.createElement(WeatherHazardBanner, {
            hazard: hazardDto,
            onDismiss: () => {}
          })
        );

        expect(html).toContain('data-testid="weather-hazard-banner"');
        expect(html).toContain("Gale-Force Squall");
        expect(html).toMatch(/Gusts (&gt;|>)\s*24 kn/);
        expect(html).toContain("High drift. Maintain heading into wind.");
        expect(html).toContain("hazard-banner-close");
      });

      it("returns null when no weather hazard is active", () => {
        const html = renderToString(React.createElement(WeatherHazardBanner, { hazard: null }));
        expect(html).toBe("");
      });
    });
  });

  // =========================================================================
  // F5.1 & F5.2 MARITIME VESSEL CONSOLE & CARGO HOLD BAY GRID
  // =========================================================================
  describe("F5.1 & F5.2 Maritime Vessel Console & Cargo Hold Bay Grid", () => {
    const baseBoatDto: WorldHudBoatDto = {
      boatId: "boat.player_rowboat",
      name: "Rowboat",
      speedKnots: 3.8,
      seaState: "Calm",
      seaWarning: null,
      showNightWarning: false,
      hull: { current: 90, maximum: 100, percent: 90, danger: false },
      fuel: null,
      cargoSlots: [
        {
          slotNumber: 1, slotType: "hold", hasIce: false,
          cargo: {
            cargoId: "fish.salmon.1",
            name: "Atlantic Salmon",
            speciesId: "fish.salmon",
            weightKg: 5.2,
            quality: "exceptional",
            freshnessPercent: 92,
            freshnessTone: "fresh",
            cargoClass: "medium",
            carrySpeedPenaltyPercent: 16
          }
        },
        { slotNumber: 2, slotType: "hold", hasIce: false, cargo: null },
        { slotNumber: 3, slotType: "hold", hasIce: false, cargo: null },
        { slotNumber: 4, slotType: "hold", hasIce: false, cargo: null },
        {
          slotNumber: 5, slotType: "external-hook", hasIce: false,
          cargo: {
            cargoId: "fish.tuna.1",
            name: "Bluefin Tuna",
            speciesId: "fish.tuna",
            weightKg: 18.5,
            quality: "trophy",
            cargoClass: "large",
            carrySpeedPenaltyPercent: 28,
            freshnessPercent: 78,
            freshnessTone: "fresh"
          }
        }
      ],
      occupiedCargoSlots: 2,
      isDocked: false
    };

    it("renders vessel name, registration insignia, underway status, speed log, and heading bearing", () => {
      const html = renderToString(
        React.createElement(MaritimeVesselConsole, {
          boat: baseBoatDto,
          headingDegrees: 45,
          headingCardinal: "NE"
        })
      );

      expect(html).toContain('data-testid="maritime-vessel-console"');
      expect(html).toContain("Rowboat");
      // Default rowboat insignia
      expect(html).toContain("REG · NV-ROW-01");
      // Status chip
      expect(html).toContain("Underway");
      // Speed and bearing readouts
      expect(html).toContain("3.8 kn · Calm");
      expect(html).toContain("045° NE");
    });

    it("renders skiff registration insignia when vessel is a skiff", () => {
      const skiffDto: WorldHudBoatDto = {
        ...baseBoatDto,
        boatId: "boat.player_skiff",
        name: "Motor Skiff",
        fuel: { current: 75, maximum: 100, percent: 75, danger: false }
      };

      const html = renderToString(
        React.createElement(MaritimeVesselConsole, { boat: skiffDto })
      );

      expect(html).toContain("Motor Skiff");
      expect(html).toContain("REG · NV-SKF-02");
      expect(html).toContain("boat-fuel-section");
      expect(html).toContain("75%");
    });

    it("evaluates 3-tier hull damage tints: sound (>=70%), damaged (30-69%), and critical (<30%)", () => {
      // 1. Sound (90%)
      const soundHtml = renderToString(
        React.createElement(MaritimeVesselConsole, { boat: baseBoatDto })
      );
      expect(soundHtml).toContain("hull-sound");

      // 2. Damaged (50%)
      const damagedDto: WorldHudBoatDto = {
        ...baseBoatDto,
        hull: { current: 50, maximum: 100, percent: 50, danger: false }
      };
      const damagedHtml = renderToString(
        React.createElement(MaritimeVesselConsole, { boat: damagedDto })
      );
      expect(damagedHtml).toContain("hull-damaged");

      // 3. Critical (20%)
      const criticalDto: WorldHudBoatDto = {
        ...baseBoatDto,
        hull: { current: 20, maximum: 100, percent: 20, danger: true }
      };
      const criticalHtml = renderToString(
        React.createElement(MaritimeVesselConsole, { boat: criticalDto })
      );
      expect(criticalHtml).toContain("hull-critical");
    });

    it("renders physical cargo hold bay grid with internal bays and transom hooks", () => {
      const html = renderToString(
        React.createElement(MaritimeVesselConsole, { boat: baseBoatDto })
      );

      expect(html).toContain("boat-cargo-grid");
      expect(html).toContain("2/5"); // Occupied slots

      // Internal hold bay (slot 1) with stowed salmon
      expect(html).toContain("is-hold");
      expect(html).toContain("5.2kg");
      expect(html).toContain("freshness-fresh");

      // Transom hook (slot 5 > 4) with hanging heavy tuna
      expect(html).toContain("is-hook");
      expect(html).toContain("HOOK");
      expect(html).toContain("18.5kg");
      expect(html).toContain("freshness-fresh");

      // Empty slot placeholder
      expect(html).toContain("is-empty");
    });

    it("displays docked status chip and suppresses underway telemetry when boat is docked", () => {
      const dockedDto: WorldHudBoatDto = {
        ...baseBoatDto,
        isDocked: true,
        speedKnots: 0
      };

      const html = renderToString(
        React.createElement(MaritimeVesselConsole, { boat: dockedDto })
      );

      expect(html).toContain("is-docked");
      expect(html).toContain("Docked");
      expect(html).not.toContain("boat-telemetry-row");
    });
  });

  // =========================================================================
  // INTEGRATION IN HUD & SIMULATION IMMUTABILITY
  // =========================================================================
  // =========================================================================
  // HUD CHROME ALIGNMENT INVARIANTS
  // Regressions here are invisible to SSR string assertions but very visible
  // on screen, so they are pinned against the stylesheets themselves.
  // =========================================================================
  describe("HUD Chrome Alignment Invariants", () => {
    const uiDirectory = path.resolve(import.meta.dirname, "../../src/ui");
    const readCss = (file: string): string =>
      fs.readFileSync(path.join(uiDirectory, file), "utf8");

    it("scales every persistent HUD cluster with --ui-scale, bottom-right included", () => {
      const a11y = readCss("a11y.css");
      const zoomRule = a11y.slice(
        a11y.indexOf("#ui-container .hud-top-left-container,"),
        a11y.indexOf("zoom: var(--ui-scale, 1);")
      );

      // A cluster left off this list renders at 1.0 while its neighbours shrink,
      // which also pushes its safe-area gutter out of step with the other corners.
      for (const cluster of [
        ".hud-top-left-container",
        ".hud-top-right-cluster",
        ".hud-bottom-left-container",
        ".hud-bottom-right-container",
        ".hud-play-cluster"
      ]) {
        expect(zoomRule, `${cluster} must opt into --ui-scale`).toContain(cluster);
      }
    });

    it("exempts the same clusters from the scale multiplier on touch layouts", () => {
      const a11y = readCss("a11y.css");
      const mobileRule = a11y.slice(
        a11y.indexOf('#ui-container[data-mobile-device="true"] .hud-top-left-container,'),
        a11y.indexOf("zoom: 1;")
      );
      expect(mobileRule).toContain('[data-mobile-device="true"] .hud-bottom-right-container');
    });

    it("stacks the top-right rail as one column so every card shares a right edge", () => {
      const coastal = readCss("coastal.css");

      // flex-start left the almanac (330px), hazard banner (290px) and quest
      // tracker (300px) ending on three different edges inside one 330px rail.
      expect(coastal).toMatch(
        /#ui-container \.hud-top-right-main \{[^}]*align-items: stretch;/
      );
      expect(coastal).toMatch(/#ui-container \.hud-top-right \{[^}]*width: 100% !important;/);

      const fillStart = coastal.indexOf(
        "#ui-container .hud-top-right-main > .hud-clock-widget,"
      );
      expect(fillStart).toBeGreaterThan(-1);
      const fillRule = coastal.slice(fillStart, coastal.indexOf("}", fillStart) + 1);
      for (const card of [
        ".hud-clock-widget",
        ".weather-hazard-banner",
        ".quest-tracker-hud-wood",
        ".collapsible-tracker-group"
      ]) {
        expect(fillRule, `${card} must fill the rail`).toContain(card);
      }
      expect(fillRule).toContain("width: 100% !important;");
    });

    it("keeps no card pinned to its own width inside the narrow-screen rail", () => {
      const coastal = readCss("coastal.css");
      // The cluster cap already narrows the rail; a per-card width re-introduces
      // the ragged edge below 820px.
      expect(coastal).not.toMatch(
        /#ui-container \.quest-tracker-hud-wood \{ width: min\(235px, 38vw\) !important; \}/
      );
    });

    it("centres the micro-menu rack so the 42px system disc sits level with the 36px panels", () => {
      const hud = readCss("hud.css");
      const rack = hud.slice(hud.indexOf(".micro-menu-rack {"));
      expect(rack.slice(0, rack.indexOf("}"))).toContain("align-items: center;");
    });
  });

  describe("HUD Integration & State Purity", () => {
    it("renders MaritimeVesselConsole in HUD when activeBoatId is present", () => {
      const sim = new Simulation();
      sim.state.player.activeBoatId = "boat.player_rowboat";

      const html = renderToString(
        React.createElement(HUD, {
          state: sim.state,
          promptText: null
        })
      );

      expect(html).toContain('data-testid="maritime-vessel-console"');
      expect(html).toContain("Rowboat");
    });

    it("renders WeatherHazardBanner in HUD when severe weather hazard is active", () => {
      const sim = new Simulation();
      sim.state.weather.type = "storm";
      sim.state.weather.seaRoughness = 0.85;

      const html = renderToString(
        React.createElement(HUD, {
          state: sim.state,
          promptText: null
        })
      );

      expect(html).toContain('data-testid="weather-hazard-banner"');
      expect(html).toContain("Severe Coastal Storm");
    });

    it("maintains strict simulation state immutability across M2 UI renders", () => {
      const sim = new Simulation();
      sim.state.player.activeBoatId = "boat.player_rowboat";
      sim.state.weather.type = "fog";
      sim.state.weather.visibility = 0.3;

      const snapshotBefore = JSON.stringify(sim.state);

      renderToString(
        React.createElement(HUD, {
          state: sim.state,
          promptText: "[E] Dock Vessel",
          toastMessage: "+2 Winter Carrot"
        })
      );

      const snapshotAfter = JSON.stringify(sim.state);
      expect(snapshotAfter).toBe(snapshotBefore);
    });
  });
});
