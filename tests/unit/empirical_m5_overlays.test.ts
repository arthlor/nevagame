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
import { LegacyHUD as HUD } from "./uiTestHelpers";
import { playUiSound } from "../../src/ui/audio/uiAudio";
import { gameAudio } from "../../src/audio/AudioManager";
import type { BasicFishingState, FishingEncounterState } from "../../src/simulation/core/types";
import type { CropInspectionDto, SportFishingHudDto } from "../../src/simulation/core/contracts";

function basicFishing(phase: BasicFishingState["phase"], extra: Partial<BasicFishingState> = {}): BasicFishingState {
  return {
    ecologyId: "ecology.neva",
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
    quality: "common",
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
  tackleSnapshot: { lureItemId: null },
  seaConditionSnapshot: { weatherType: "clear", seaRoughness: 0 },
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
  stageTimingLabel: "Ready in about 40 minutes",
  moisture: { value: 0.6, band: "normal" },
  climate: {
    current: "temperate",
    preferred: ["temperate"],
    status: "preferred"
  },
  soil: { fertility: 85, band: "good" },
  expectedYield: { min: 3, max: 5 },
  work: {
    current: 800,
    baseCost: 12,
    cost: 12,
    availableWork: 800,
    affordable: true,
    shortage: 0,
    readyAtMinute: null
  },
  waterWork: {
    baseCost: 5,
    cost: 5,
    availableWork: 800,
    affordable: true,
    shortage: 0,
    readyAtMinute: null
  },
  harvestWork: {
    baseCost: 45,
    cost: 45,
    availableWork: 800,
    affordable: true,
    shortage: 0,
    readyAtMinute: null
  },
  immediateAction: {
    kind: "water",
    label: "Water crop",
    cost: 5,
    available: true
  },
  actions: { canWater: true, canHarvest: false }
};

const sportHud: SportFishingHudDto = {
  speciesId: "fish.trout",
  speciesName: "Rainbow Trout",
  energyPercent: 70,
  rodDirectionAngle: 0,
  steeringMagnitude: 0.6,
  showFirstTip: true,
  decision: {
    fishAction: "Fish is easing off",
    response: "Reel now",
    action: "reel",
    key: "W",
    icon: "tiring",
    tone: "opportunity"
  },
  tensionPercent: 42,
  tensionBands: { slackEndPercent: 12, dangerStartPercent: 80 },
  tensionTone: "safe",
  tensionWord: "Good",
  lineIntegrityPercent: 100,
  showLineWarning: false,
  landingProgress: null,
  signatureMoment: null,
  dragNotch: 1,
  telemetry: {
    runDistanceMeters: 11.4,
    landingDistanceMeters: 3,
    runDistancePercent: 62,
    waterDepthMeters: 2.1,
    rodDeflectionPercent: 0,
    counterSwingPercent: 0,
    counterSwingCue: null
  }
};

const damagedSportHud: SportFishingHudDto = {
  ...sportHud,
  showFirstTip: false,
  decision: {
    fishAction: "Running left",
    response: "Pull right",
    action: "steer-right",
    key: "D",
    icon: "run",
    tone: "warning"
  },
  lineIntegrityPercent: 40,
  showLineWarning: true
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
        onDismissModal: () => ({ success: true })
      })
    );
    expect(landed).toContain("Fish landed");
    expect(landed).toContain("Collect");
  });

  it("renders one clear sport-fishing decision and progressively discloses damage", () => {
    const html = renderToString(
      React.createElement(FishingHUD, {
        hud: sportHud,
        onSetInput: () => {}
      })
    );
    expect(html).toContain('data-testid="sport-fishing-hud"');
    expect(html).toContain('data-testid="fish-stamina"');
    expect(html).toContain("Rainbow Trout");
    expect(html).toContain("70%");
    expect(html).toContain("Match the highlighted key to the fish");
    expect(html).toContain("Fish is easing off");
    expect(html).toContain("Reel now");
    expect(html).toContain(">W<");
    expect(html).toContain("fishing-decision");
    expect(html).toContain("GOOD");
    expect(html).not.toContain('data-testid="fish-integrity"');
    expect(html).not.toContain("fishing-direction-arc");
    expect(html).not.toContain("2.4 kg");
    expect(html).not.toContain("0:03");
    expect(html).not.toContain("Rod load");

    const damagedRun = renderToString(
      React.createElement(FishingHUD, {
        hud: damagedSportHud,
        onSetInput: () => {}
      })
    );
    expect(damagedRun).toContain('data-testid="fish-integrity"');
    expect(damagedRun).toContain("Running left");
    expect(damagedRun).toContain("Pull right");
    expect(damagedRun).toContain(">D<");
  });

  it("renders the seed dock with wheat and a quantity badge", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(PlantingSeedBar, {
        seedBelt: sim.inspectSeedBelt(),
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
    expect(crop).toContain("Moisture");
    expect(crop).toContain("Water crop");
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
    expect(hud).toContain("Docked");
    expect(hud).not.toContain('aria-label="Hold Bays &amp; Hooks"');

    const boat = sim.state.boats["boat.player_rowboat"]!;
    boat.isDocked = false;
    boat.dockedMarketId = null;
    boat.speed = 3;
    const sailingHud = renderToString(
      React.createElement(HUD, { state: sim.state, promptText: null, toastMessage: null })
    );
    expect(sailingHud).toContain("6 kn");
    expect(sailingHud).toContain('aria-label="Hold Bays &amp; Hooks"');
    expect(sailingHud).toContain("chrome-slot");

    sim.state.sportFishing = sportEncounter;
    sim.state.player.activeBoatId = null;
    const fightHud = renderToString(
      React.createElement(HUD, {
        state: sim.state,
        promptText: null,
        toastMessage: null
      })
    );
    expect(fightHud).not.toContain("hud-boat-panel");
    // GameUI owns sport-fishing mode gating; the standalone HUD DTO still
    // includes the common work vitals when rendered directly.
    expect(fightHud).toContain('data-testid="player-unit-frame"');

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
    expect(playOneShotSpy).toHaveBeenCalledWith("ui-click");
    playOneShotSpy.mockRestore();
    playBankSpy.mockRestore();
  });
});
