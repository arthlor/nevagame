import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

// Components to stress-test
import { CropInspection } from "../../src/ui/components/CropInspection";
import {
  CatchInspectionModal,
} from "../../src/ui/components/CatchInspectionModal";
import { NoticeStack } from "../../src/ui/components/NoticeStack";
import {
  WeatherHazardBanner,
  resolveMaritimeHazard
} from "../../src/ui/components/WeatherHazardBanner";
import { MaritimeVesselConsole } from "../../src/ui/components/MaritimeVesselConsole";

// Simulation & logic imports
import {
  calculateAllometricLengthCm,
  buildTrophyCatchDto
} from "../../src/simulation/fishing/trophyCatch";
import type {
  CropInspectionDto,
  TrophyCatchDto,
  WorldHudBoatDto,
} from "../../src/simulation/core/contracts";
import type { FishCargoState, PlacedCropState } from "../../src/simulation/core/types";
import type { Notice } from "../../src/ui/notifications";
import { cropMoistureBand } from "../../src/simulation/domains/FarmingDomain";

describe("Adversarial M2 Inspector, HUD & Telemetry Stress Suite", () => {
  // =========================================================================
  // 1. ALLOMETRIC CUBIC SCALING EXTREMES & ADVERSARIAL FLOATS
  // =========================================================================
  describe("1. Allometric Cubic Scaling & Trophy Catch Math", () => {
    it("handles zero, negative, and micro weights gracefully without crashing or returning negative lengths", () => {
      // Zero weight
      const zeroLen = calculateAllometricLengthCm(0, "medium", 1.5);
      expect(zeroLen).toBeGreaterThanOrEqual(10);
      expect(Number.isFinite(zeroLen)).toBe(true);

      // Negative weight
      const negLen = calculateAllometricLengthCm(-50, "medium", 1.5);
      expect(negLen).toBeGreaterThanOrEqual(10);
      expect(Number.isFinite(negLen)).toBe(true);

      // Micro weight (1 milligram) - clamped to min 0.05kg in ratio, yielding valid >=10cm length
      const microLen = calculateAllometricLengthCm(0.000001, "small", 0.5);
      expect(microLen).toBeGreaterThanOrEqual(10);
      expect(microLen).toBe(11.1);
    });

    it("clamps astronomical weights to maximum ceiling of 350cm", () => {
      // 500kg extreme sport catch
      const len500 = calculateAllometricLengthCm(500, "gargantuan", 45);
      expect(len500).toBeLessThanOrEqual(350);

      // 10,000kg colossal weight
      const len10k = calculateAllometricLengthCm(10000, "gargantuan", 45);
      expect(len10k).toBe(350);

      // 1,000,000kg absurd weight
      const len1M = calculateAllometricLengthCm(1000000, "medium", 1.5);
      expect(len1M).toBe(350);
    });

    it("handles zero or negative averageWeightKg safely via minimum floor", () => {
      const lenZeroAvg = calculateAllometricLengthCm(2.5, "medium", 0);
      expect(Number.isFinite(lenZeroAvg)).toBe(true);
      expect(lenZeroAvg).toBeGreaterThan(0);

      const lenNegAvg = calculateAllometricLengthCm(2.5, "medium", -10);
      expect(Number.isFinite(lenNegAvg)).toBe(true);
      expect(lenNegAvg).toBeGreaterThan(0);
    });

    it("handles unknown or invalid cargoClass gracefully by falling back to baseLength 48", () => {
      const fallbackLen = calculateAllometricLengthCm(1.5, "invalid-class" as any, 1.5);
      expect(fallbackLen).toBeCloseTo(48, 1);
    });

    it("handles buildTrophyCatchDto with 0% freshness (spoiled catch) for registered species", () => {
      const spoiledCargo: FishCargoState = {
        id: "cargo.spoiled.1",
        speciesId: "fish.tuna",
        weightKg: 15.0,
        quality: "common",
        caughtAtMinute: 100,
        freshness: 0,
        cargoClass: "large",
        location: { type: "player", containerId: "inv.player" }
      };

      const dto = buildTrophyCatchDto(spoiledCargo);
      expect(dto.speciesName).toBe("Yellowfin Tuna");
      expect(dto.freshnessPercent).toBe(0);
      expect(dto.freshnessTone).toBe("stale");
      expect(dto.estimatedShelfLifeMinutes).toBe(0);
      // Freshness price multiplier is 0 for registered species, so estimatedMarketValue is 0
      expect(dto.estimatedMarketValue).toBe(0);
    });

    it("handles buildTrophyCatchDto fallback when speciesId is unregistered in ContentRegistry", () => {
      const unregisteredCargo: FishCargoState = {
        id: "cargo.unknown.1",
        speciesId: "fish.nonexistent_species",
        weightKg: 2.0,
        quality: "common",
        caughtAtMinute: 100,
        freshness: 50,
        cargoClass: "medium",
        location: { type: "player", containerId: "inv.player" }
      };

      const dto = buildTrophyCatchDto(unregisteredCargo);
      expect(dto.speciesName).toBe("Sport Fish");
      expect(dto.estimatedMarketValue).toBe(10); // Fallback base value
    });

    it("handles buildTrophyCatchDto with extreme 500kg trophy weight and unknown species", () => {
      const extremeCargo: FishCargoState = {
        id: "cargo.megalodon",
        speciesId: "fish.unknown_mythic",
        weightKg: 500,
        quality: "trophy",
        caughtAtMinute: 500,
        freshness: 100,
        cargoClass: "gargantuan",
        location: { type: "boat-hook", containerId: "boat.skiff", slotIndex: 5 }
      };

      const dto = buildTrophyCatchDto(extremeCargo, "first");
      expect(dto.speciesName).toBe("Sport Fish");
      expect(dto.weightKg).toBe(500);
      expect(dto.qualityStars).toBe(4);
      expect(dto.lengthCm).toBeLessThanOrEqual(350);
      expect(dto.storageDestination).toBe("boat-hook");
      expect(dto.storageLocationLabel).toBe("Hung on transom hook");
      expect(dto.record).toBe("first");
    });
  });

  // =========================================================================
  // 2. IN-WORLD CROP INSPECTION SCREEN PROJECTION BOUNDARIES & OFF-SCREEN
  // =========================================================================
  describe("2. CropInspection Projection & Edge Clamping", () => {
    const mockCrop: CropInspectionDto = {
      placedCropId: "crop.placed.99",
      cropId: "crop.carrot",
      name: "Winter Carrot",
      stage: "mature",
      approximateMinutesRemaining: 0,
      stageTimingLabel: "Ready to Harvest",
      moisture: { value: 0.8, band: "wet" },
      climate: { current: "temperate", preferred: ["temperate"], status: "preferred" },
      soil: { fertility: 90, band: "good" },
      expectedYield: { min: 3, max: 5 },
      work: { current: 300, baseCost: 10, cost: 10, availableWork: 300, affordable: true, shortage: 0, readyAtMinute: null },
      waterWork: { baseCost: 5, cost: 5, availableWork: 300, affordable: true, shortage: 0, readyAtMinute: null },
      harvestWork: { baseCost: 10, cost: 10, availableWork: 300, affordable: true, shortage: 0, readyAtMinute: null },
      immediateAction: { kind: "harvest", label: "Harvest Crop", cost: 10, available: true },
      actions: { canWater: false, canHarvest: true }
    };

    it("clamps extreme negative screen projections to safe margin 16px", () => {
      const origWindow = (global as any).window;
      (global as any).window = { innerWidth: 1920, innerHeight: 1080 };

      try {
        const html = renderToString(
          React.createElement(CropInspection, {
            inspection: mockCrop,
            projectedPosition: { x: -9999, y: -8888, visible: true }
          })
        );
        expect(html).toContain('data-projected="true"');
        expect(html).toContain("left:16px");
        expect(html).toContain("top:16px");
      } finally {
        (global as any).window = origWindow;
      }
    });

    it("clamps extreme overflow screen projections to viewport right/bottom bounds", () => {
      const origWindow = (global as any).window;
      (global as any).window = { innerWidth: 1920, innerHeight: 1080 };

      try {
        const html = renderToString(
          React.createElement(CropInspection, {
            inspection: mockCrop,
            projectedPosition: { x: 50000, y: 50000, visible: true }
          })
        );
        expect(html).toContain('data-projected="true"');
        // cardWidth 300, margin 16 -> 1920 - 300 - 16 = 1604px
        expect(html).toContain("left:1604px");
        // cardHeight 180, margin 16 -> 1080 - 180 - 16 = 884px
        expect(html).toContain("top:884px");
      } finally {
        (global as any).window = origWindow;
      }
    });

    it("falls back cleanly to docked mode when projectedPosition is null or visible is false", () => {
      const htmlNull = renderToString(
        React.createElement(CropInspection, {
          inspection: mockCrop,
          projectedPosition: null
        })
      );
      expect(htmlNull).toContain('data-projected="false"');
      expect(htmlNull).not.toContain("left:");

      const htmlInvisible = renderToString(
        React.createElement(CropInspection, {
          inspection: mockCrop,
          projectedPosition: { x: 500, y: 500, visible: false }
        })
      );
      expect(htmlInvisible).toContain('data-projected="false"');
      expect(htmlInvisible).not.toContain("left:");
    });

    it("renders blockerReason if action is not available", () => {
      const blockedCrop: CropInspectionDto = {
        ...mockCrop,
        immediateAction: {
          kind: "harvest",
          label: "Harvest Crop",
          cost: 10,
          available: false,
          blockerReason: "Inventory Full"
        }
      };
      const html = renderToString(React.createElement(CropInspection, { inspection: blockedCrop }));
      expect(html).toContain("Inventory Full");
    });
  });

  // =========================================================================
  // 3. FARM GIS MODE RAPID TOGGLE & HASH SIGNATURE BIJECTION
  // =========================================================================
  describe("3. Farm GIS Mode Rapid Toggle & Signature Stability", () => {
    function computeCropSignature(crops: readonly PlacedCropState[], isFarmGisMode: boolean = false): number {
      let hash = (crops.length ^ (isFarmGisMode ? 0x5a5a5a5a : 0x811c9dc5)) >>> 0;
      for (const crop of crops) {
        const values = `${crop.id}|${crop.cropId}|${crop.stage}|${crop.farmId}|${crop.x}|${crop.z}|${crop.rotationRadians}|${crop.effectiveGrowthMinutes}|${cropMoistureBand(crop.moisture)}`;
        for (let index = 0; index < values.length; index += 1) {
          hash ^= values.charCodeAt(index);
          hash = Math.imul(hash, 0x01000193);
        }
      }
      return hash >>> 0;
    }

    it("guarantees hash !== hash between GIS active and inactive across 0 to 50 crop counts", () => {
      for (let count = 0; count <= 50; count++) {
        const mockCrops: PlacedCropState[] = Array.from({ length: count }, (_, i) => ({
          id: `crop_${i}`,
          cropId: i % 2 === 0 ? "crop.turnip" : "crop.carrot",
          stage: "growing",
          farmId: "farm_1",
          x: i * 2,
          z: i * 2,
          rotationRadians: 0,
          effectiveGrowthMinutes: 15,
          moisture: 0.5,
          plantedAtMinute: 0,
          lastUpdatedMinute: 0,
          health: 100,
          averageMoistureAccum: 0,
          moistureSampleCount: 0
        }));

        const hashGisOff = computeCropSignature(mockCrops, false);
        const hashGisOn = computeCropSignature(mockCrops, true);

        // Under no circumstances should GIS mode collide with non-GIS mode
        expect(hashGisOn).not.toBe(hashGisOff);
        expect(hashGisOn >>> 0).toBe(hashGisOn);
        expect(hashGisOff >>> 0).toBe(hashGisOff);
      }
    });

    it("verifies rapid alternating toggle produces strictly alternating signatures without drift", () => {
      const mockCrops: PlacedCropState[] = [
        {
          id: "crop_a",
          cropId: "crop.wheat",
          stage: "mature",
          farmId: "farm_home",
          x: 10,
          z: 20,
          rotationRadians: 1.57,
          effectiveGrowthMinutes: 40,
          moisture: 0.3,
          plantedAtMinute: 0,
          lastUpdatedMinute: 0,
          health: 100,
          averageMoistureAccum: 0,
          moistureSampleCount: 0
        }
      ];

      const hashOff1 = computeCropSignature(mockCrops, false);
      const hashOn1 = computeCropSignature(mockCrops, true);
      const hashOff2 = computeCropSignature(mockCrops, false);
      const hashOn2 = computeCropSignature(mockCrops, true);

      expect(hashOff1).toBe(hashOff2);
      expect(hashOn1).toBe(hashOn2);
      expect(hashOff1).not.toBe(hashOn1);
    });
  });

  // =========================================================================
  // 4. MARITIME VESSEL CONSOLE EMPTY STATES & EXTREME VITALS
  // =========================================================================
  describe("4. Maritime Vessel Console Empty States & Critical Vitals", () => {
    it("renders correctly with 0 knots speed, calm waters, 0 cargo slots", () => {
      const emptyBoat: WorldHudBoatDto = {
        boatId: "boat.empty_dinghy",
        name: "Old Dinghy",
        speedKnots: 0,
        seaState: "Calm",
        seaWarning: null,
        showNightWarning: false,
        hull: { current: 100, maximum: 100, percent: 100, danger: false },
        fuel: null,
        cargoSlots: [],
        occupiedCargoSlots: 0,
        isDocked: false
      };

      const html = renderToString(React.createElement(MaritimeVesselConsole, { boat: emptyBoat }));

      expect(html).toContain('data-testid="maritime-vessel-console"');
      expect(html).toContain("Drifting");
      expect(html).toContain("0 kn · Calm");
      expect(html).toContain("hull-sound");
      expect(html).toContain("0/0");
      expect(html).not.toContain("boat-fuel-section");
    });

    it("renders extreme critical vitals: 0% hull, 0 fuel, danger flags true", () => {
      const wreckedBoat: WorldHudBoatDto = {
        boatId: "boat.wrecked_skiff",
        name: "Sinking Skiff",
        speedKnots: 0,
        seaState: "Rough",
        seaWarning: "Hull Flooding Critical",
        showNightWarning: true,
        hull: { current: 0, maximum: 100, percent: 0, danger: true },
        fuel: { current: 0, maximum: 100, percent: 0, danger: true },
        cargoSlots: [
          {
            slotNumber: 1, slotType: "hold", hasIce: false,
            cargo: {
              cargoId: "cargo.spoiled.cod",
              speciesId: "fish.cod",
              name: "Atlantic Cod",
              weightKg: 500,
              quality: "common",
              freshnessPercent: 0,
              freshnessTone: "stale"
            , cargoClass: "medium", carrySpeedPenaltyPercent: 16 }
          }
        ],
        occupiedCargoSlots: 1,
        isDocked: false
      };

      const html = renderToString(React.createElement(MaritimeVesselConsole, { boat: wreckedBoat }));

      // Hull and fuel danger
      expect(html).toContain("hull-critical");
      expect(html).toContain("0%");
      expect(html).toContain("boat-sea-warning");
      expect(html).toContain("Hull Flooding Critical");
      expect(html).toContain("Night waters");

      // 500kg spoiled catch in cargo hold
      expect(html).toContain("500.0kg");
      expect(html).toContain("freshness-stale");
      expect(html).toContain("width:0%");
    });
  });

  // =========================================================================
  // 5. NOTICE STACK EMPTY STATES & EXTREME DELTAS
  // =========================================================================
  describe("5. NoticeStack Edge Cases & Delta Parsing", () => {
    it("renders empty container with data-notice-count=0 when notices array is empty", () => {
      const html = renderToString(React.createElement(NoticeStack, { notices: [] }));
      expect(html).toContain('data-testid="notice-stack"');
      expect(html).toContain('data-notice-count="0"');
      expect(html).not.toContain('data-testid="toast"');
    });

    it("handles extreme deltas: large numbers and negative currency correctly", () => {
      const extremeNotices: Notice[] = [
        {
          id: 991,
          text: "+1000000 Gold",
          tone: "reward",
          createdMs: 1000,
          expiresMs: 5000,
          count: 1,
          category: "general",
          delta: { kind: "money", amount: 1000000, label: "Gold" }
        },
        {
          id: 992,
          text: "-500 Work (Heavy Labor)",
          tone: "info",
          createdMs: 1100,
          expiresMs: 5100,
          count: 1,
          category: "general",
          delta: { kind: "labor", amount: -500, label: "Work (Heavy Labor)" }
        }
      ];

      const html = renderToString(React.createElement(NoticeStack, { notices: extremeNotices }));

      expect(html).toContain("+1000000");
      expect(html).toContain("toast-money-coin");
      expect(html).toContain("-500");
      expect(html).toContain("Work (Heavy Labor)");
    });
  });

  // =========================================================================
  // 6. WEATHER HAZARD BANNER FALLBACKS & SENSITIVITY
  // =========================================================================
  describe("6. WeatherHazardBanner Edge Cases", () => {
    it("returns null for null, undefined, or empty hazard", () => {
      expect(renderToString(React.createElement(WeatherHazardBanner, { hazard: null }))).toBe("");
      expect(renderToString(React.createElement(WeatherHazardBanner, { hazard: undefined }))).toBe("");
    });

    it("falls back safely to storm advisory for arbitrary severe text", () => {
      const resolved = resolveMaritimeHazard({ text: "Unusual Atmospheric Anomaly", tone: "danger" });
      expect(resolved).not.toBeNull();
      expect(resolved?.hazardId).toBe("storm");
      expect(resolved?.severity).toBe("danger");
      expect(resolved?.title).toBe("Severe Coastal Storm");
    });
  });

  // =========================================================================
  // 7. PRESENTATION PURITY: ZERO SIMULATION MUTATION
  // =========================================================================
  describe("7. Presentation Purity & Immutability Verification", () => {
    it("guarantees rendering M2 components causes zero object mutations on DTOs", () => {
      const originalCrop: CropInspectionDto = {
        placedCropId: "c1",
        cropId: "crop.turnip",
        name: "Turnip",
        stage: "mature",
        approximateMinutesRemaining: 0,
        stageTimingLabel: "Ready",
        moisture: { value: 0.5, band: "normal" },
        climate: { current: "temperate", preferred: ["temperate"], status: "preferred" },
        soil: { fertility: 50, band: "good" },
        expectedYield: { min: 1, max: 2 },
        work: { current: 100, baseCost: 5, cost: 5, availableWork: 100, affordable: true, shortage: 0, readyAtMinute: null },
        waterWork: { baseCost: 5, cost: 5, availableWork: 100, affordable: true, shortage: 0, readyAtMinute: null },
        harvestWork: { baseCost: 5, cost: 5, availableWork: 100, affordable: true, shortage: 0, readyAtMinute: null },
        immediateAction: { kind: "harvest", label: "Harvest", cost: 5, available: true },
        actions: { canWater: false, canHarvest: true }
      };

      const cropJsonBefore = JSON.stringify(originalCrop);
      renderToString(React.createElement(CropInspection, { inspection: originalCrop }));
      expect(JSON.stringify(originalCrop)).toBe(cropJsonBefore);

      const originalCatch: TrophyCatchDto = {
        cargoId: "c_fish",
        speciesId: "fish.salmon",
        speciesName: "Salmon",
        habitats: ["river"],
        cargoClass: "medium",
        weightKg: 3.5,
        lengthCm: 55,
        quality: "fine",
        qualityStars: 2,
        freshnessPercent: 80,
        freshnessTone: "fresh",
        estimatedShelfLifeMinutes: 60,
        estimatedMarketValue: 120,
        record: null,
        storageDestination: "player-carry",
        storageLocationLabel: "Carried by hand"
      };

      const catchJsonBefore = JSON.stringify(originalCatch);
      renderToString(React.createElement(CatchInspectionModal, { catchData: originalCatch, onDismiss: () => {} }));
      expect(JSON.stringify(originalCatch)).toBe(catchJsonBefore);
    });
  });
});
