import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { LegacyHUD as HUD } from "./uiTestHelpers";
import { QuestTrackerHUD } from "../../src/ui/QuestTrackerHUD";
import { FarmForecastPopover } from "../../src/ui/components/FarmForecastPopover";
import { buildWorldHudDto } from "../../src/simulation/presentation/WorldHudPresentation";
import { playUiSound } from "../../src/ui/audio/uiAudio";
import { gameAudio } from "../../src/audio/AudioManager";
import type { ActiveQuestDto } from "../../src/simulation/core/QuestTypes";
import { dayOfSeason } from "../../src/simulation/core/GameClock";

describe("Milestone M2 Empirical Split-Corners HUD Verification", () => {
  describe("1. Live clock presentation from simulation time", () => {
    it.each([
      { minute: 720, timeOfDay: "day", rotation: 0, isNight: false },
      { minute: 1080, timeOfDay: "dusk", rotation: 90, isNight: true },
      { minute: 0, timeOfDay: "night", rotation: -180, isNight: true },
      { minute: 360, timeOfDay: "dawn", rotation: -90, isNight: false },
      { minute: 1439, timeOfDay: "night", rotation: 179.75, isNight: true }
    ] as const)("renders minute $minute at $rotation degrees", ({ minute, timeOfDay, rotation, isNight }) => {
      const state = createInitialGameState();
      state.clock.currentMinute = minute;
      state.clock.timeOfDay = timeOfDay;
      const html = renderToString(React.createElement(HUD, { state, promptText: null }));
      expect(html).toContain(`style="transform:rotate(${rotation}deg)"`);
      expect(html.includes("tidebook-night-mark")).toBe(isNight);
    });
  });

  describe("2. Almanac and conditions presentation", () => {
    it("renders digital clock, season, weather label, temperature in °C, and gold purse", () => {
      const state = createInitialGameState();
      state.clock.currentMinute = 815; // 13:35
      state.clock.season = "summer";
      state.clock.dayCount = 14;
      state.clock.timeOfDay = "day";
      state.weather.type = "clear";
      state.weather.temperatureC = 22.4;
      state.player.money = 1250;

      const html = renderToString(
        React.createElement(HUD, {
          state,
          promptText: null
        })
      );

      const normalizedHtml = html.replace(/<!-- -->/g, "");
      const temperature = buildWorldHudDto(state).weather.temperatureC;
      expect(html).toContain('data-testid="nautical-compass-almanac"');
      expect(html).toContain('data-testid="game-clock"');
      expect(html).toContain("13:35");
      expect(normalizedHtml).toContain(`Summer ${dayOfSeason(state.clock.dayCount)}`);
      expect(html).toContain(`${temperature}°C`);
      expect(html).toContain(`${temperature} degrees`);
      expect(normalizedHtml).toContain("1,250 G");
      expect(html).toContain('data-testid="hud-gold-purse"');
    });

    it("routes the open UI cue to the audio manager", () => {
      const playOneShotSpy = vi.spyOn(gameAudio, "playOneShot").mockImplementation(() => {});
      const playBankSpy = vi.spyOn(gameAudio, "playBank").mockImplementation(() => {});

      playUiSound("open");
      expect(playOneShotSpy).toHaveBeenCalledWith("ui-click");

      playOneShotSpy.mockRestore();
      playBankSpy.mockRestore();
    });
  });

  describe("3. FarmForecastPopover Presentation & Weather Impact Grid", () => {
    it("renders forecast time slots and environmental impact metrics", () => {
      const state = createInitialGameState();
      state.clock.season = "autumn";
      state.weather.temperatureC = 16.8;
      state.weather.precipitation = 0.45;
      state.weather.windSpeed = 8.5; // ~17 kn
      state.weather.seaRoughness = 0.6;

      const html = renderToString(
        React.createElement(FarmForecastPopover, {
          forecast: {
            seasonLabel: "Autumn",
            currentTemperatureC: Math.round(state.weather.temperatureC),
            slots: [
              { label: "Now", type: state.weather.type },
              { label: "+2h", type: "cloudy" },
              { label: "+5h", type: "clear" }
            ],
            rainLabel: "Showers possible",
            windLabel: "Breezy",
            seaLabel: "Swell"
          },
          onClose: () => {}
        })
      );

      expect(html).toContain("farm-forecast-popover");
      expect(html).toContain("Coast forecast");
      expect(html).toContain("Autumn");
      expect(html).toContain("Now");
      expect(html).toContain("17°C");
      expect(html).toContain("+2h");
      expect(html).toContain("+5h");
      // Current impact metrics
      expect(html).toContain("Rain");
      expect(html).toContain("Showers possible");
      expect(html).toContain("Wind");
      expect(html).toContain("Breezy");
      expect(html).toContain("Sea");
      expect(html).toContain("Swell");
      expect(html).toContain("forecast-close-btn");
    });
  });

  describe("4. Quest tracker and severe weather alerts", () => {
    it("renders active quest title, objective description, gold progress bar, and location pin", () => {
      const activeQuest: ActiveQuestDto = {
        questId: "quest.starter_harvest",
        trackId: "track.main",
        trackTitle: "The Neva Spine",
        actId: "act1_homestead",
        actTitle: "Act I: Coastal Horizons",
        questTitle: "The Autumn Harvest",
        speakerId: "npc.elder",
        speakerName: "Elder Barnaby",
        currentStepIndex: 0,
        totalSteps: 2,
        objectiveDescription: "Harvest ripe turnips for the storehouse",
        currentProgress: 3,
        targetQuantity: 5,
        isStepComplete: false,
        isQuestReadyToTurnIn: false,
        targetLocation: { name: "Village Farmstead", x: 45, z: -60 }
      };

      const html = renderToString(
        React.createElement(QuestTrackerHUD, { activeQuest })
      );

      expect(html).toContain("quest-tracker-hud-wood");
      expect(html).toContain("The Autumn Harvest");
      expect(html).toContain("Harvest ripe turnips for the storehouse");
      expect(html).toContain("3 / 5");
      // The delivery pin is drawn as an SVG mark.
      expect(html).toContain("hud-svg-icon");
      expect(html).toContain("Village Farmstead");
      expect(html).toContain("chrome-meter--gold");
    });

    it("omits the quest tracker when activeQuest is null", () => {
      const html = renderToString(
        React.createElement(QuestTrackerHUD, { activeQuest: null })
      );
      expect(html).toBe("");
    });

    it("renders the storm hazard with danger severity", () => {
      const state = createInitialGameState();
      state.weather.type = "storm";

      const html = renderToString(
        React.createElement(HUD, {
          state,
          promptText: null
        })
      );

      expect(html).toContain('data-testid="weather-hazard-banner"');
      expect(html).toContain('data-hazard-id="storm"');
      expect(html).toContain('data-severity="danger"');
      expect(html).toContain("Severe Coastal Storm");
    });

    it("renders the game menu button with its accessible shortcut", () => {
      const state = createInitialGameState();
      const html = renderToString(
        React.createElement(HUD, {
          state,
          promptText: null,
          onOpenMenu: () => {}
        })
      );

      expect(html).toContain('data-testid="micro-btn-menu"');
      expect(html).toContain("Open game menu (Esc)");
    });
  });

  describe("5. Bottom-Left Vitals, Context Statuses & Boat HUD", () => {
    it("renders horizontal Work meter with amber-gold fill", () => {
      const state = createInitialGameState();
      state.player.workCapacity.current = 750;
      state.player.workCapacity.maximum = 1000;

      const html = renderToString(
        React.createElement(HUD, {
          state,
          promptText: null
        })
      );

      expect(html).toContain('data-testid="player-unit-frame"');
      const workMeter = html.match(/<[^>]+role="meter"[^>]+aria-label="Work"[^>]*>/)?.[0];
      expect(workMeter).toBeDefined();
      expect(workMeter).toContain('aria-valuenow="750"');
      expect(workMeter).toContain('aria-valuemax="1000"');
      expect(workMeter).toContain("chrome-meter--gold");
      expect(workMeter).toContain("chrome-meter--horizontal");
    });

    it("renders Sprint stamina meter when sprinting or exhausted", () => {
      const state = createInitialGameState();
      state.player.traversal.sprintStamina = 40;
      state.player.traversal.sprintExhausted = true;

      const html = renderToString(
        React.createElement(HUD, {
          state,
          promptText: null
        })
      );

      expect(html).toContain('data-testid="sprint-stamina"');
      expect(html).toContain("sprint-stamina-winded");
      expect(html).toContain("chrome-meter--danger");
      expect(html).toContain("Winded");
    });

    it("renders low labor warning alert when labor is below 20", () => {
      const state = createInitialGameState();
      state.player.workCapacity.current = 12;

      const html = renderToString(
        React.createElement(HUD, {
          state,
          promptText: null
        })
      );

      expect(html).toContain("hud-context-statuses");
      expect(html).toContain("hud-labor-note");
      expect(html).toContain("Low Work");
      expect(html).toContain("12/1000");
    });

    it("renders boat driving panel with speed, sea state, hull durability, and cargo hold grid", () => {
      const state = createInitialGameState();
      state.player.activeBoatId = "boat_starter";
      state.boats["boat_starter"] = {
        id: "boat_starter",
        boatTypeId: "boat.rowboat",
        x: 10,
        y: 0,
        z: 20,
        headingRadians: 0,
        durability: 85,
        speed: 3.5,
        fuel: 0,
        fishCargoSlotIds: [null, null],
        supplyInventoryId: "inv_starter",
        upgrades: [],
        isDocked: false,
        dockedMarketId: null
      };
      state.weather.seaRoughness = 0.2; // Calm

      const html = renderToString(
        React.createElement(HUD, {
          state,
          promptText: null
        })
      );

      expect(html).toContain("hud-boat-panel");
      expect(html).toContain("kn · Calm");
      expect(html).toContain("hud-boat-hull");
      expect(html).toContain("85%");
      expect(html).toContain("boat-cargo-grid");
      expect(html).toContain("boat-cargo-slot");
    });
  });

  describe("6. Bottom-Center Tool Hotbar & Contextual Interaction Banners", () => {
    it("renders all 5 hotbar slots with test IDs and slot numbers", () => {
      const state = createInitialGameState();
      const html = renderToString(
        React.createElement(HUD, {
          state,
          promptText: null,
          activeToolSlot: 3
        })
      );

      expect(html).toContain("hud-play-cluster");
      expect(html).toContain('data-testid="smart-contextual-toolbar"');
      const buttons = html.match(/<button\b[^>]*data-testid="tool-slot-\d"[^>]*>/g) ?? [];
      expect(buttons).toHaveLength(5);
      for (let slot = 1; slot <= 5; slot++) {
        const button = buttons.find((candidate) => candidate.includes(`data-testid="tool-slot-${slot}"`));
        expect(button).toBeDefined();
        expect(button).toContain(`aria-pressed="${slot === 3}"`);
      }
    });

    it("renders contextual prompt with KeycapBadge [E] and data-testid='context-prompt'", () => {
      const state = createInitialGameState();
      const html = renderToString(
        React.createElement(HUD, {
          state,
          promptText: "[E] Harvest Turnip"
        })
      );

      expect(html).toContain('data-testid="context-prompt"');
      expect(html).toContain("E");
      expect(html).toContain("Harvest Turnip");
    });

    it("renders an in-progress processing wait briefing without hiding remaining time", () => {
      const state = createInitialGameState();
      const html = renderToString(
        React.createElement(HUD, {
          state,
          promptText: "[E] Bait Worms working · 6h left · ready 14:00"
        })
      );
      expect(html).toContain('data-testid="context-prompt"');
      expect(html).toContain("Bait Worms working · 6h left · ready 14:00");
    });

    it("renders basic fishing phase banners with bite-alert highlights", () => {
      const state = createInitialGameState();
      state.basicFishing = {
        phase: "bite-reaction",
        castPower: 0.8,
        tension: 0.5,
        targetTension: 0.5,
        progress: 0.2,
        timer: 1.5,
        speciesId: "fish.trout"
      } as any;

      const html = renderToString(
        React.createElement(HUD, {
          state,
          promptText: null
        })
      );

      expect(html).toContain("is-bite-alert");
      expect(html).toContain("Hook the fish");
      expect(html).toContain("Space");
    });
  });

  describe("7. Simulation State Purity & Immutability Check", () => {
    it("never mutates GameState during UI rendering", () => {
      const state = createInitialGameState();
      const stateSnapshot = JSON.stringify(state);

      renderToString(
        React.createElement(HUD, {
          state,
          promptText: "[Space] Reel In",
          toastMessage: "Caught Atlantic Cod!",
          activeToolSlot: 2
        })
      );

      expect(JSON.stringify(state)).toBe(stateSnapshot);
    });
  });
});
