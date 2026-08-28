import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { Simulation } from "../../src/simulation/Simulation";
import { BasicFishingMinigameWidget } from "../../src/ui/fishing/BasicFishingMinigameWidget";
import { FishingHUD } from "../../src/ui/FishingHUD";
import { PlantingSeedBar } from "../../src/ui/components/PlantingSeedBar";
import { FarmGISLegend } from "../../src/ui/components/FarmGISLegend";
import { CatchSummaryToast } from "../../src/ui/components/CatchInspectionModal";
import { ContextualHintCard } from "../../src/ui/ContextualHintCard";
import { CropInspection } from "../../src/ui/GameUI";
import { HUD } from "../../src/ui/HUD";
import { playUiSound } from "../../src/ui/audio/uiAudio";
import { gameAudio } from "../../src/audio/AudioManager";
import type { BasicFishingState, FishingEncounterState } from "../../src/simulation/core/types";
import type { CropInspectionDto } from "../../src/simulation/core/contracts";

function basicFishing(phase: BasicFishingState["phase"], extra: Partial<BasicFishingState> = {}): BasicFishingState {
  return {
    habitatId: "habitat.river",
    phase,
    remainingSeconds: 4,
    catchItemId: "fish.trout",
    willCatch: true,
    castPower: 0.62,
    fishY: 0.4,
    barY: 0.2,
    barHeight: 0.25,
    catchProgress: 0.45,
    isPerfect: true,
    quality: "normal",
    ...extra
  };
}

const sportEncounter: FishingEncounterState = {
  fish: {
    instanceId: "fish.1",
    speciesId: "fish.trout",
    weightKg: 2.4,
    quality: "common"
  },
  rodId: "rod.willow",
  stamina: 70,
  maxStamina: 100,
  distanceMeters: 8.5,
  lineTension: 42,
  lineIntegrity: 100,
  fishDirection: 0,
  behavior: "rest",
  behaviorUntilSeconds: 2,
  elapsedSeconds: 3,
  rodDirectionAngle: 0,
  isReeling: false,
  isSlacking: false,
  isBracing: false,
  slackTimerSeconds: 0,
  snapTimerSeconds: 0,
  result: "active"
};

const cropInspection: CropInspectionDto = {
  placedCropId: "crop.placed.1",
  cropId: "crop.wheat",
  name: "Wheat",
  stage: "growing",
  approximateMinutesRemaining: 40,
  moisture: { value: 0.6, band: "normal" },
  climate: {
    current: "temperate",
    preferred: ["temperate"],
    status: "preferred"
  },
  soil: { fertility: 85, band: "good" },
  expectedYield: { min: 3, max: 5 },
  work: { current: 800, actionCost: 12, xpMultiplier: 1, rareChanceMultiplier: 1 },
  actions: { canWater: true, canHarvest: false }
};

describe("Milestone M5 tactile overlays", () => {
  it("renders the cast-power minigame plaque with a gold meter", () => {
    const html = renderToString(
      React.createElement(BasicFishingMinigameWidget, { fishingState: basicFishing("charging-cast") })
    );
    expect(html).toContain("Cast power");
    expect(html).toContain('data-testid="cast-power-meter"');
    expect(html).toContain("chrome-keycap");
    expect(html).toContain("cancel");
  });

  it("renders bite, reeling, and landed catch phases", () => {
    const bite = renderToString(
      React.createElement(BasicFishingMinigameWidget, { fishingState: basicFishing("bite-reaction") })
    );
    expect(bite).toContain("Bite!");
    expect(bite).toContain('data-testid="bite-alert"');

    const reel = renderToString(
      React.createElement(BasicFishingMinigameWidget, { fishingState: basicFishing("minigame") })
    );
    expect(reel).toContain("Reeling Fish");
    expect(reel).toContain("green-catch-bar");
    expect(reel).toContain("Perfect");
    expect(reel).toContain("Esc");

    const landed = renderToString(
      React.createElement(BasicFishingMinigameWidget, {
        fishingState: basicFishing("caught"),
        onDismissModal: () => {}
      })
    );
    expect(landed).toContain("Fish landed");
    expect(landed).toContain("Collect");
  });

  it("renders the compact sport fishing vitals tray instead of a dashboard", () => {
    const html = renderToString(
      React.createElement(FishingHUD, {
        encounter: sportEncounter,
        onSetInput: () => {}
      })
    );
    expect(html).toContain('data-testid="sport-fishing-hud"');
    expect(html).toContain("fishing-direction-arc");
    expect(html).toContain('data-testid="fish-stamina"');
    expect(html).toContain('data-testid="fish-integrity"');
    expect(html).toContain(">A<");
    expect(html).toContain(">D<");
    expect(html).not.toContain("Rainbow Trout");
    expect(html).not.toContain("Line Tension");
    expect(html).not.toContain("Tiring Out");
    expect(html).not.toContain("Optimal Range");
    expect(html).not.toContain("fishing-btn-reel");
    expect(html).not.toContain("fishing-btn-brace");
    expect(html).not.toContain("fishing-btn-slack");
  });

  it("renders the seed dock with wheat and a quantity badge", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(PlantingSeedBar, {
        state: sim.state,
        selectedCropId: "crop.wheat",
        onSelectCrop: () => {},
        onCancel: () => {}
      })
    );
    expect(html).toContain('data-testid="planting-seed-dock"');
    expect(html).toContain("Wheat");
    expect(html).toContain("chrome-slot");
    expect(html).toContain("Place");
  });

  it("renders the farm GIS legend and crop inspection plaque", () => {
    const gis = renderToString(React.createElement(FarmGISLegend, { visible: true }));
    expect(gis).toContain('data-testid="farm-gis-legend"');
    expect(gis).toContain("Field signs");
    expect(gis).toContain("Good moisture");
    expect(gis).toContain("Ready to harvest");

    const crop = renderToString(
      React.createElement(CropInspection, { inspection: cropInspection, onClose: () => {} })
    );
    expect(crop).toContain('data-testid="crop-inspection"');
    expect(crop).toContain("Wheat");
    expect(crop).toContain("Soil Moisture");
    expect(crop).toContain("Expected Yield");
  });

  it("renders catch summary, hint, and boat hold chrome", () => {
    const sim = new Simulation();
    sim.state.player.activeBoatId = "boat.player_rowboat";
    const hud = renderToString(
      React.createElement(HUD, {
        state: sim.state,
        promptText: null,
        toastMessage: "Seeds planted."
      })
    );
    expect(hud).toContain("hud-toast-pill");
    expect(hud).toContain("Seeds planted.");
    expect(hud).toContain("hud-boat-panel");
    expect(hud).toContain("kn");
    expect(hud).toContain("chrome-slot");

    const hint = renderToString(
      React.createElement(ContextualHintCard, {
        hintId: "hint.welcome",
        title: "The garden",
        message: "Water your first crop.",
        onDismiss: () => {}
      })
    );
    expect(hint).toContain('data-testid="contextual-hint"');
    expect(hint).toContain("The garden");

    const catchHtml = renderToString(
      React.createElement(CatchSummaryToast, {
        cargo: {
          id: "cargo.1",
          speciesId: "fish.trout",
          weightKg: 1.8,
          quality: "fine",
          caughtAtMinute: 480,
          freshness: 90,
          cargoClass: "medium",
          location: { type: "player", containerId: "inv.player" }
        },
        onDismiss: () => {}
      })
    );
    expect(catchHtml).toContain('data-testid="catch-summary"');
    expect(catchHtml).toContain("Carried by hand");
  });

  it("keeps overlay audio presentation-only", () => {
    const playOneShotSpy = vi.spyOn(gameAudio, "playOneShot").mockImplementation(() => {});
    const playBankSpy = vi.spyOn(gameAudio, "playBank").mockImplementation(() => {});
    playUiSound("chime");
    playUiSound("open");
    playUiSound("cloth");
    expect(playOneShotSpy).toHaveBeenCalledWith("quest-chime");
    expect(playBankSpy).toHaveBeenCalledWith("ui-open");
    expect(playOneShotSpy).toHaveBeenCalledWith("ui-cloth");
    playOneShotSpy.mockRestore();
    playBankSpy.mockRestore();
  });
});
