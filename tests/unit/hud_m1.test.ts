import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import {
  buildWorldHudDto,
  detectContextualStance,
  getHeadingCardinal,
  buildCompassMarkers,
  buildContextualHotbar
} from "../../src/simulation/presentation/WorldHudPresentation";
import { PlayerUnitFrame } from "../../src/ui/hud/PlayerUnitFrame";
import { NauticalCompassAlmanac, TidebookNavigation } from "../../src/ui/hud/NauticalCompassAlmanac";
import { MicroMenuPurseBar, TidebookPurse, type ActiveModal } from "../../src/ui/hud/MicroMenuPurseBar";
import { SmartContextualToolbar } from "../../src/ui/hud/SmartContextualToolbar";
import { SmartActionPrompt } from "../../src/ui/hud/SmartActionPrompt";
import { FarmingActionStatus } from "../../src/ui/components/FarmingActionStatus";
import { PlantingSeedBar } from "../../src/ui/components/PlantingSeedBar";
import { QuestTrackerHUD } from "../../src/ui/QuestTrackerHUD";
import type { FarmingActionSnapshot } from "../../src/app/FarmingActionController";
import type { ActiveQuestDto } from "../../src/simulation/core/QuestTypes";
import type { HudContractDto, SeedBeltDto } from "../../src/simulation/core/contracts";
import { STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { WorldLayout } from "../../src/world/WorldLayout";
import { atlasForSeedItem } from "../../src/ui/chrome/uiAtlas";

/** React SSR inserts comment markers between adjacent text nodes. */
function htmlContainsText(html: string, text: string): boolean {
  return html.includes(text) || html.includes(text.split("/").join("<!-- -->/<!-- -->"));
}

describe("Milestone 1 — Persistent HUD (R1) & Contextual Controls (R2) Suite", () => {
  // --------------------------------------------------------------------------
  // R1: Player Unit Frame
  // --------------------------------------------------------------------------
  describe("R1: Player Unit Frame", () => {
    it("keeps authoritative Sprint visible at full stamina on foot", () => {
      const state = createInitialGameState();
      const hud = buildWorldHudDto(state);
      expect(hud.sprint?.current).toBe(state.player.traversal.sprintStamina);
      expect(hud.sprint?.maximum).toBeGreaterThan(0);
      state.player.activeMountId = "mount.test" as never;
      expect(buildWorldHudDto(state).sprint).toBeNull();
    });
    it("renders accessible Work and Sprint values, journal access, and status chips", () => {
      const state = createInitialGameState();
      state.player.workCapacity.current = 75;
      state.player.workCapacity.maximum = 100;
      state.player.traversal.sprintStamina = 40;
      state.player.traversal.sprintExhausted = false;

      const hud = buildWorldHudDto(state);
      const html = renderToString(
        React.createElement(PlayerUnitFrame, {
          work: hud.work,
          sprint: hud.sprint,
          statusEffects: [
            {
              id: "well-rested",
              type: "buff",
              label: "Well Rested",
              icon: "sun" as const,
              description: "+10% work recovery"
            }
          ]
        })
      );

      expect(html).toContain('aria-label="Player profile and crest"');
      expect(html).toContain('aria-label="Work"');
      expect(html).toContain('aria-valuenow="75"');
      expect(html).toContain('aria-valuemax="100"');
      expect(html).toContain('data-testid="sprint-stamina"');
      expect(html).toContain('aria-label="Sprint"');
      expect(html).toContain('aria-valuenow="40"');

      // Status Chip
      expect(html).toContain("data-testid=\"status-chip-well-rested\"");
      expect(html).toContain("Well Rested");
      expect(html).toContain("hud-atlas-icon");
    });

    it("marks recharging Work and announces exhausted Sprint", () => {
      const state = createInitialGameState();
      // Recharging state
      state.player.workCapacity.current = 50;
      state.player.workCapacity.maximum = 100;
      const hudRecharging = buildWorldHudDto(state);
      const htmlRecharge = renderToString(
        React.createElement(PlayerUnitFrame, {
          work: hudRecharging.work,
          sprint: hudRecharging.sprint
        })
      );
      expect(htmlRecharge).toContain("is-recharging");

      // Exhausted state
      state.player.workCapacity.current = 0;
      state.player.traversal.sprintStamina = 0;
      state.player.traversal.sprintExhausted = true;

      const hudExhausted = buildWorldHudDto(state);
      const htmlExhaust = renderToString(
        React.createElement(PlayerUnitFrame, {
          work: hudExhausted.work,
          sprint: hudExhausted.sprint
        })
      );
      expect(htmlExhaust).toContain("is-exhausted");
      expect(htmlExhaust).toContain("Winded");
      expect(htmlExhaust).toContain("sprint-stamina-winded");
    });
  });

  // --------------------------------------------------------------------------
  // R1: Nautical Compass Radar & Almanac
  // --------------------------------------------------------------------------
  describe("R1: Nautical Compass Radar & Celestial Almanac", () => {
    it("renders the heading rail and live calendar with a rotating clock hand", () => {
      const state = createInitialGameState();
      state.player.rotationY = Math.PI / 2; // Facing East (90°)
      state.weather.windDirectionDeg = 180; // Wind from South

      const hud = buildWorldHudDto(state);
      const html = renderToString(
        React.createElement(NauticalCompassAlmanac, {
          clock: hud.clock,
          weather: hud.weather,
          compass: hud.compass,
          onToggleForecast: () => {}
        })
      );

      const navigation = renderToString(React.createElement(TidebookNavigation, {
        compass: hud.compass, onOpenMap: () => {}
      }));
      expect(navigation).toContain("90° E");
      expect(navigation).toContain(hud.compass.subRegionTitle);
      expect(navigation).toContain("Open nautical chart");
      expect(html).toContain("Wind 180°");
      expect(html).toContain(`rotate(${hud.clock.dialRotation}deg)`);

      // Celestial Clock readout
      expect(html).toContain("data-testid=\"game-clock\"");
      expect(html).toContain(hud.clock.label);
      expect(html).toContain(`${hud.weather.temperatureC}°C`);
    });

    it("evaluates cardinal heading conversion accurately across all 360 degrees", () => {
      expect(getHeadingCardinal(0)).toBe("N");
      expect(getHeadingCardinal(45)).toBe("NE");
      expect(getHeadingCardinal(90)).toBe("E");
      expect(getHeadingCardinal(135)).toBe("SE");
      expect(getHeadingCardinal(180)).toBe("S");
      expect(getHeadingCardinal(225)).toBe("SW");
      expect(getHeadingCardinal(270)).toBe("W");
      expect(getHeadingCardinal(315)).toBe("NW");
      expect(getHeadingCardinal(355)).toBe("N");
    });

    it("projects nearby points of interest (farm, harbor, fish schools) onto radar", () => {
      const state = createInitialGameState();
      state.player.x = 0;
      state.player.z = 0;
      state.player.rotationY = 0;

      // Add a fish school at x: 50, z: -50 (relative angle: 45 deg, distance: ~70m)
      state.world.activeSchools["test-school-1"] = {
        id: "school.coastal_bass_reef_1",
        ecologyId: "ecology.neva",
        habitatId: "coast",
        x: 50,
        z: -50,
        radius: 12,
        spawnedAtMinute: 0,
        expiresAtMinute: 180,
        remainingCatchPotential: 10,
        speciesWeights: [{ speciesId: "fish.trout", weight: 80 }]
      };

      const markers = buildCompassMarkers(state, 0);
      expect(markers.length).toBeGreaterThan(0);
      const schoolMarker = markers.find((m) => m.type === "fish-school");
      expect(schoolMarker).toBeDefined();
      expect(schoolMarker?.relativeBearingDeg).toBe(45);
      expect(schoolMarker?.distanceMeters).toBe(71);
    });
  });

  // --------------------------------------------------------------------------
  // R1: Micro Menu & Gold Purse Bar
  // --------------------------------------------------------------------------
  describe("R1: Micro Menu & Gold Purse Bar", () => {
    it("renders gold counter with formatted balance and 6-button quick access rack", () => {
      const capacity = { satchelUsed: 8, satchelMax: 20, cargoUsed: 0, cargoMax: 1 };
      const html = renderToString(
        React.createElement(MicroMenuPurseBar, {
          money: 3450,
          capacity,
          expeditionUnlocked: false,
          onOpenModal: () => {}
        })
      );

      const purse = renderToString(React.createElement(TidebookPurse, {money: 3450}));
      expect(purse).toContain("Purse: 3,450 gold");
      expect(htmlContainsText(html, "8/20")).toBe(true);

      // 6 buttons
      expect(html).toContain("data-testid=\"micro-btn-satchel\"");
      expect(html).toContain("data-testid=\"micro-btn-journal\"");
      expect(html).toContain("data-testid=\"micro-btn-map\"");
      expect(html).toContain("data-testid=\"micro-btn-ledger\"");
      expect(html).toContain("data-testid=\"micro-btn-expeditions\"");
      expect(html).toContain("data-testid=\"micro-btn-menu\"");

      expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="micro-btn-expeditions"/);
      expect(html).toContain("explore more of Neva to unlock");
    });

    it("displays warning badge when satchel approaches maximum capacity", () => {
      const nearFull = { satchelUsed: 19, satchelMax: 20, cargoUsed: 1, cargoMax: 1 };
      const html = renderToString(
        React.createElement(MicroMenuPurseBar, {
          money: 500,
          capacity: nearFull,
          expeditionUnlocked: true,
          onOpenModal: () => {}
        })
      );

      expect(html).toContain("is-warning");
      expect(htmlContainsText(html, "19/20")).toBe(true);
      expect(htmlContainsText(html, "1/1")).toBe(true);
      // Unlocked expeditions draw the compass sprite in the icon slot.
      expect(html).toContain('data-testid="micro-btn-expeditions"');
      expect(html).not.toContain("is-locked");
    });
  });

  // --------------------------------------------------------------------------
  // R2: Smart Contextual Toolbar & Stances
  // --------------------------------------------------------------------------
  describe("R2: Smart Contextual Toolbar & Stance Detection", () => {
    it("detects Agronomy stance on farmstead plot with farming loadout", () => {
      const state = createInitialGameState();
      // Place player on the authored starter farm origin
      state.player.x = STARTER_FARM_LAYOUT.origin.x;
      state.player.z = STARTER_FARM_LAYOUT.origin.z;
      state.player.activeBoatId = null;

      const stance = detectContextualStance(state);
      expect(stance).toBe("agronomy");

      const hotbar = buildContextualHotbar(state, stance, null);
      expect(hotbar).toHaveLength(5);
      expect(hotbar[0].name).toBe("Hand Tools");
      expect(hotbar[1].name).toBe("Seed Belt");
      expect(hotbar[2].name).toBe("Watering Can");
      expect(hotbar[3].name).toBe("Compost & Nutrients");
      expect(hotbar[4].name).toBe("Harvest Basket");

      const html = renderToString(
        React.createElement(SmartContextualToolbar, {
          stance,
          hotbar,
          activeSlot: 2
        })
      );
      expect(html).toContain("Agronomy Stance");
      expect(html).toContain("Seed Belt");
      expect(html).toContain("data-testid=\"tool-slot-2\"");
    });

    it("detects Maritime stance when steering boat with vessel telemetry loadout", () => {
      const state = createInitialGameState();
      state.player.activeBoatId = "boat.player_rowboat";

      const stance = detectContextualStance(state);
      expect(stance).toBe("maritime");

      const hotbar = buildContextualHotbar(state, stance, null);
      expect(hotbar).toHaveLength(5);
      expect(hotbar[0].name).toBe("Vessel Helm");
      expect(hotbar[1].name).toBe("Fishing Rod");
      expect(hotbar[2].name).toBe("Lure & Tackle");
      expect(hotbar[3].name).toBe("Vessel Supplies");
      expect(hotbar[4].name).toBe("Cargo Hold");

      const html = renderToString(
        React.createElement(SmartContextualToolbar, {
          stance,
          hotbar,
          activeSlot: 1
        })
      );
      expect(html).toContain("Maritime Stance");
      expect(html).toContain("Vessel Helm");
    });

    it("detects Explorer stance during open world exploration with expedition loadout", () => {
      const state = createInitialGameState();
      // Inland of farm and fishing access so stance falls through to explorer
      state.player.x = 40;
      state.player.z = -100;
      state.player.activeBoatId = null;

      const stance = detectContextualStance(state);
      expect(stance).toBe("explorer");

      const hotbar = buildContextualHotbar(state, stance, null);
      expect(hotbar).toHaveLength(5);
      expect(hotbar[0].name).toBe("Satchel [I]");
      expect(hotbar[1].name).toBe("Nautical Chart [M]");
      expect(hotbar[2].name).toBe("Expedition Board [P]");
      expect(hotbar[3].name).toBe("Hold & Stores [L]");
      expect(hotbar[4].name).toBe("Field Journal [J]");

      const html = renderToString(
        React.createElement(SmartContextualToolbar, {
          stance,
          hotbar,
          activeSlot: 1
        })
      );
      expect(html).toContain("Explorer Stance");
    });
  });

  // --------------------------------------------------------------------------
  // R2: Smart Action Prompt
  // --------------------------------------------------------------------------
  describe("R2: Smart Action Prompt", () => {
    it("renders embossed keycap, interaction verb, target entity, and labor cost badge", () => {
      const html = renderToString(
        React.createElement(SmartActionPrompt, {
          promptText: "[E] Harvest Winter Carrot (-5 Work)"
        })
      );

      expect(html).toContain("data-testid=\"context-prompt\"");
      expect(html).toContain("E");
      expect(html).toContain("Harvest Winter Carrot");
      expect(html).toContain("data-testid=\"prompt-labor-cost\"");
      expect(html).toContain("-5 Work");
    });

    it("suppresses prompts matching notifications or system equipped cues", () => {
      const htmlToast = renderToString(
        React.createElement(SmartActionPrompt, {
          promptText: "Item Added to Satchel",
          toastMessage: "Item Added to Satchel"
        })
      );
      expect(htmlToast).toBe("");

      const htmlEquip = renderToString(
        React.createElement(SmartActionPrompt, {
          promptText: "Equipped: Copper Hoe"
        })
      );
      expect(htmlEquip).toBe("");
    });
  });

  // --------------------------------------------------------------------------
  // R2: MMO Cast Bar (FarmingActionStatus)
  // --------------------------------------------------------------------------
  describe("R2: High-Polish MMO Action Progress Bar", () => {
    it("renders channeling progress bar with progress spark and cancellation hints", () => {
      const snapshot: FarmingActionSnapshot = {
        id: 101,
        action: "plant",
        phase: "started",
        stage: "anticipation",
        target: { x: 1, y: 0, z: 1, entityId: "farm.starter" },
        progress: 0.65,
        committed: false,
        commitSucceeded: null,
        interruptible: true
      };

      const html = renderToString(
        React.createElement(FarmingActionStatus, { action: snapshot })
      );

      expect(html).toContain("data-testid=\"farming-action-status\"");
      expect(html).toContain("mmo-cast-bar");
      expect(html).toContain("Planting seeds…");
      expect(html).toContain("65%");
      expect(html).toContain("cast-bar-spark");
      expect(html).toContain("left:65%");
      expect(html).toContain("Channeling…");
      expect(html).toContain("Move or press <kbd>Esc</kbd> to cancel");
    });
  });

  // --------------------------------------------------------------------------
  // R2: Planting Seed Bar Seasonal & Soil Hints
  // --------------------------------------------------------------------------
  describe("R2: Planting Seed Bar Seasonal & Soil Suitability", () => {
    it("renders seasonal compatibility indicators and soil moisture hints", () => {
      const seedBelt: SeedBeltDto = {
        seeds: [
          {
            seedItemId: "seed.wheat",
            cropId: "crop.wheat",
            name: "Wheat",
            count: 12,
            preferredClimates: ["temperate"]
          },
          {
            seedItemId: "seed.corn",
            cropId: "crop.corn",
            name: "Sweet Corn",
            count: 5,
            preferredClimates: ["warm"]
          }
        ]
      };

      const html = renderToString(
        React.createElement(PlantingSeedBar, {
          seedBelt,
          selectedCropId: "crop.wheat",
          onSelectCrop: () => {},
          onCancel: () => {},
          currentSeason: "Spring"
        })
      );

      expect(html).toContain("data-testid=\"planting-seed-dock\"");
      expect(html).toContain("Season: <strong>Spring</strong>");
      expect(html).toContain("Wheat");
      expect(html).toContain("Sweet Corn");

      // Seasonal compatibility icon
      expect(html).toContain("seed-season-indicator");
      expect(html).toContain("in-season"); // Wheat is spring

      // Soil suitability and moisture hints in footer
      expect(html).toContain("Coastal loam · Low nutrient depletion");
      expect(html).toContain("Moderate moisture (15–20%)");
    });
  });

  // --------------------------------------------------------------------------
  // R1: Collapsible Story & Delivery Contracts Tracker
  // --------------------------------------------------------------------------
  describe("R1: Collapsible Story & Delivery Contracts Tracker", () => {
    it("renders both active story quests and market delivery contracts with fold buttons", () => {
      const activeQuest: ActiveQuestDto = {
        questId: "quest.spring_bounty",
        trackId: "track.main",
        trackTitle: "The Neva Spine",
        actId: "act1_homestead",
        actTitle: "Act I: Coastal Horizons",
        questTitle: "Spring Bounty",
        speakerId: "npc.elder",
        speakerName: "Elder Barnaby",
        currentStepIndex: 0,
        totalSteps: 2,
        objectiveDescription: "Deliver 5 bundles of wheat to the harbor",
        targetQuantity: 5,
        currentProgress: 3,
        isStepComplete: false,
        isQuestReadyToTurnIn: false,
        targetLocation: { name: "Harbor Warehouse", x: 100, z: -50 }
      };

      const contracts: HudContractDto[] = [
        {
          id: "contract.village_turnip",
          title: "Village Turnip Run",
          targetName: "Fresh Turnips",
          targetKind: "item",
          target: 10,
          current: 6,
          unit: "crates",
          rewardMoney: 320,
          deliveryMarketName: "Village Green Market",
          completed: false
        }
      ];

      const html = renderToString(
        React.createElement(QuestTrackerHUD, {
          activeQuest,
          activeContracts: contracts
        })
      );

      // Story Quest
      expect(html).toContain("Spring Bounty");
      expect(html).toContain("Deliver 5 bundles of wheat to the harbor");
      expect(html).toContain("3 / 5");
      expect(html).toContain("Harbor Warehouse");

      // Contracts start folded so the story remains the primary task.
      expect(html).toContain("Active Contracts (1)");
      expect(html).toContain('aria-label="Show active market contracts"');
      expect(html).not.toContain('role="listitem"');

      // Collapsible toggle buttons
      expect(html).toContain("data-testid=\"quest-tracker-toggle-btn\"");
      expect(html).toContain("data-testid=\"contracts-tracker-toggle-btn\"");
    });
  });

  // --------------------------------------------------------------------------
  // R2: 4-Way Sequential Contextual Stance Lifecycle & Immutability
  // --------------------------------------------------------------------------
  describe("R2: 4-Way Sequential Contextual Stance Lifecycle", () => {
    it("transitions smoothly across Agronomy, Angling, Maritime, and Explorer stances", () => {
      const state = createInitialGameState();

      // 1. Agronomy: player on authored starter farm plot
      state.player.x = STARTER_FARM_LAYOUT.origin.x;
      state.player.z = STARTER_FARM_LAYOUT.origin.z;
      state.player.activeBoatId = null;
      expect(detectContextualStance(state)).toBe("agronomy");
      const agronomyHotbar = buildContextualHotbar(state, "agronomy", null);
      expect(agronomyHotbar).toHaveLength(5);
      expect(agronomyHotbar[0].name).toBe("Hand Tools");
      expect(agronomyHotbar[1].name).toBe("Seed Belt");

      // 2. Angling: player at river fishing access reserve
      const section = WorldLayout.riverSectionAt(38);
      state.player.x = section.centerX - (section.leftWaterWidth + 2);
      state.player.z = 38;
      state.player.activeBoatId = null;
      expect(detectContextualStance(state)).toBe("angling");
      const anglingHotbar = buildContextualHotbar(state, "angling", null);
      expect(anglingHotbar).toHaveLength(5);
      expect(anglingHotbar[0].name).toBe("Fishing Rod");
      expect(anglingHotbar[1].name).toBe("Lure & Tackle");
      expect(anglingHotbar[2].name).toBe("Bait Bucket");
      expect(anglingHotbar[3].name).toBe("Keepnet / Hold");
      expect(anglingHotbar[4].name).toBe("Stow Gear");

      // 3. Maritime: player boarded vessel
      state.player.activeBoatId = "boat.player_rowboat";
      expect(detectContextualStance(state)).toBe("maritime");
      const maritimeHotbar = buildContextualHotbar(state, "maritime", null);
      expect(maritimeHotbar).toHaveLength(5);
      expect(maritimeHotbar[0].name).toBe("Vessel Helm");
      expect(maritimeHotbar[1].name).toBe("Fishing Rod");

      // 4. Explorer: player on open road away from farm and water
      state.player.activeBoatId = null;
      state.player.x = 40;
      state.player.z = -100;
      expect(detectContextualStance(state)).toBe("explorer");
      const explorerHotbar = buildContextualHotbar(state, "explorer", null);
      expect(explorerHotbar).toHaveLength(5);
      expect(explorerHotbar[0].name).toBe("Satchel [I]");
      expect(explorerHotbar[4].name).toBe("Field Journal [J]");
    });

    it("renders with frozen read-only DTOs without mutation errors", () => {
      const state = createInitialGameState();
      const hudDto = Object.freeze(buildWorldHudDto(state));

      expect(() => {
        renderToString(
          React.createElement(PlayerUnitFrame, {
            work: Object.freeze({ ...hudDto.work }),
            sprint: hudDto.sprint ? Object.freeze({ ...hudDto.sprint }) : null,
            statusEffects: Object.freeze([...hudDto.statusEffects])
          })
        );
        renderToString(
          React.createElement(NauticalCompassAlmanac, {
            compass: Object.freeze({ ...hudDto.compass }),
            clock: Object.freeze({ ...hudDto.clock }),
            weather: Object.freeze({ ...hudDto.weather }),
            onToggleForecast: () => {}
          })
        );
        renderToString(
          React.createElement(MicroMenuPurseBar, {
            money: hudDto.money,
            capacity: Object.freeze({ ...hudDto.capacity }),
            expeditionUnlocked: false,
            onOpenModal: () => {}
          })
        );
        renderToString(
          React.createElement(SmartContextualToolbar, {
            stance: hudDto.stance,
            hotbar: Object.freeze([...hudDto.contextualHotbar]),
            activeSlot: 1
          })
        );
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // R2: Contextual Controls Polish & Authentic Assets
  // --------------------------------------------------------------------------
  describe("R2: Contextual Controls Polish & Authentic Assets", () => {
    it("renders authentic HudIcons and AtlasImage in toolbar without emoji placeholders", () => {
      const state = createInitialGameState();
      const hotbar = buildContextualHotbar(state, "agronomy", null);
      const html = renderToString(
        React.createElement(SmartContextualToolbar, {
          stance: "agronomy",
          hotbar,
          activeSlot: 1
        })
      );

      expect(html).toContain("atlas-image tidebook-tool-painting");
      expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
      expect(html.match(/data-testid="tool-slot-/g)).toHaveLength(5);
      const stowed = renderToString(React.createElement(SmartContextualToolbar, {
        stance: "agronomy", hotbar, activeSlot: 0
      }));
      expect(stowed).not.toContain('aria-pressed="true"');
      expect(stowed).not.toContain('class="tidebook-tool-readout"');
    });

    it("renders cast bar exact elapsed/total seconds timing, commit marker, and Work cost badge", () => {
      const snapshot: FarmingActionSnapshot = {
        id: 102,
        action: "plant",
        phase: "started",
        stage: "anticipation",
        target: { x: 1, y: 0, z: 1, entityId: "farm.starter" },
        progress: 0.6,
        committed: false,
        commitSucceeded: null,
        interruptible: true
      };

      const html = renderToString(
        React.createElement(FarmingActionStatus, { action: snapshot })
      );

      // Exact elapsed / total timing readout: "0.4s / 0.7s · 60%"
      expect(html).toMatch(/\d+\.\d+s \/ \d+\.\d+s · 60%/);
      expect(html).toContain("cast-bar-timing");

      // Commit marker threshold tick mark
      expect(html).toContain("cast-bar-commit-marker");

      // Work cost badge for plant action (-12 Work)
      expect(html).toContain("cast-bar-work-chip");
      expect(html).toContain("-12 Work");

      // Committed status when committed is true
      const committedSnapshot: FarmingActionSnapshot = {
        ...snapshot,
        progress: 0.95,
        committed: true,
        interruptible: false
      };
      const htmlCommitted = renderToString(
        React.createElement(FarmingActionStatus, { action: committedSnapshot })
      );
      expect(htmlCommitted).toContain("Committed · Finishing…");
      expect(htmlCommitted).toContain("is-committed");
    });

    it("sanitizes SmartActionPrompt to prevent duplicate Work text and renders distinct verb/target", () => {
      const html = renderToString(
        React.createElement(SmartActionPrompt, {
          promptText: "[E] Fertilize soil · 8 Work"
        })
      );

      expect(html).toContain("prompt-verb");
      expect(html).toContain("Fertilize");
      expect(html).toContain("prompt-target");
      expect(html).toContain("soil");
      expect(html).toContain("-8 Work");

      // Verify the description span does NOT contain duplicate "8 Work"
      expect(html).not.toMatch(/prompt-action-description[^>]*>[^<]*8\s*Work/);
    });

    it("styles SmartActionPrompt with warning class when player Work Capacity is insufficient", () => {
      const html = renderToString(
        React.createElement(SmartActionPrompt, {
          promptText: "[E] Harvest Winter Carrot (-5 Work)",
          currentWork: 2 // Has 2, needs 5 -> insufficient!
        })
      );

      expect(html).toContain("is-insufficient");
      expect(html).toContain("Insufficient Work Capacity");
      expect(html).toContain("-5 Work");
    });
  });

  // --------------------------------------------------------------------------
  // R2: PlantingSeedBar 10 Crops, Hotkeys & Atlas Aliases
  // --------------------------------------------------------------------------
  describe("R2: PlantingSeedBar 10 Crops, Hotkeys & Atlas Aliases", () => {
    it("resolves seed.olive_sapling alias to seed.olive_pit atlas sprite", () => {
      const spriteUrl = atlasForSeedItem("seed.olive_sapling");
      expect(spriteUrl).toBeDefined();
      expect(spriteUrl).toContain("seed-olive_pit.png");
    });

    it("renders hotkey hints [1], [2], [3] and handles canonical crops flax and apple tree", () => {
      const seedBelt: SeedBeltDto = {
        seeds: [
          {
            seedItemId: "seed.wheat",
            cropId: "crop.wheat",
            name: "Wheat",
            count: 20,
            preferredClimates: ["temperate"]
          },
          {
            seedItemId: "seed.flax",
            cropId: "crop.flax",
            name: "Flax",
            count: 10,
            preferredClimates: ["temperate"]
          },
          {
            seedItemId: "seed.apple_sapling",
            cropId: "crop.apple_tree",
            name: "Apple Sapling",
            count: 2,
            preferredClimates: ["temperate"]
          },
          {
            seedItemId: "seed.olive_sapling",
            cropId: "crop.olive_tree",
            name: "Olive Sapling",
            count: 3,
            preferredClimates: ["warm"]
          }
        ]
      };

      const html = renderToString(
        React.createElement(PlantingSeedBar, {
          seedBelt,
          selectedCropId: "crop.flax",
          onSelectCrop: () => {},
          onCancel: () => {},
          currentSeason: "Spring"
        })
      );

      // Hotkey hints [1], [2], [3], [4]
      expect(html).toContain("seed-hotkey-badge");
      expect(html).toContain(">1<");
      expect(html).toContain(">2<");
      expect(html).toContain(">3<");
      expect(html).toContain(">4<");

      // Canonical crops meta rendered
      expect(html).toContain("Flax");
      expect(html).toContain("Temperate loam · Moderate nutrient feeder");
      expect(html).toContain("Regular moisture (20%)");
    });
  });

  // --------------------------------------------------------------------------
  // R2: Interaction Callbacks Integration
  // --------------------------------------------------------------------------
  describe("R2: Interaction Callbacks Integration", () => {
    it("binds slot selection, modal opening, and seed selection callbacks", () => {
      let selectedSlot: number | null = null;
      let openedModal: string | null = null;
      let selectedCrop: string | null = null;
      let cancelled = false;

      const state = createInitialGameState();
      const hotbar = buildContextualHotbar(state, "agronomy", null);

      const onSelectSlot = (slot: number) => {
        selectedSlot = slot;
      };
      const onOpenModal = (id: ActiveModal) => {
        openedModal = id;
      };
      const onSelectCrop = (cropId: string) => {
        selectedCrop = cropId;
      };
      const onCancel = () => {
        cancelled = true;
      };

      // Verify SmartContextualToolbar renders buttons with slot callbacks
      const toolbarHtml = renderToString(
        React.createElement(SmartContextualToolbar, {
          stance: "agronomy",
          hotbar,
          activeSlot: 1,
          onSelectSlot
        })
      );
      expect(toolbarHtml).toContain("data-testid=\"tool-slot-1\"");
      expect(toolbarHtml).toContain("data-testid=\"tool-slot-2\"");
      onSelectSlot(3);
      expect(selectedSlot).toBe(3);

      // Verify MicroMenuPurseBar modal callbacks
      const menuHtml = renderToString(
        React.createElement(MicroMenuPurseBar, {
          money: 100,
          capacity: { satchelUsed: 5, satchelMax: 20, cargoUsed: 0, cargoMax: 1 },
          expeditionUnlocked: true,
          onOpenModal
        })
      );
      expect(menuHtml).toContain('data-testid="micro-btn-satchel"');
      onOpenModal("inventory");
      expect(openedModal).toBe("inventory");
      onOpenModal("journal");
      expect(openedModal).toBe("journal");

      // Verify PlantingSeedBar selection and cancellation callbacks
      const seedBarHtml = renderToString(
        React.createElement(PlantingSeedBar, {
          seedBelt: {
            seeds: [
              { seedItemId: "seed.wheat", cropId: "crop.wheat", name: "Wheat", count: 5, preferredClimates: ["temperate"] }
            ]
          },
          selectedCropId: "crop.wheat",
          onSelectCrop,
          onCancel
        })
      );
      expect(seedBarHtml).toContain("planting-seed-card");
      onSelectCrop("crop.wheat");
      expect(selectedCrop).toBe("crop.wheat");
      onCancel();
      expect(cancelled).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // CSS Layout Anchors & Responsive Rules Normalization
  // --------------------------------------------------------------------------
  describe("CSS Layout Anchors & Responsive Rules Normalization", () => {
    it("anchors top-left to left safe area and top-right to right safe area in coastal.css", () => {
      const cssPath = path.resolve(__dirname, "../../src/ui/coastal.css");
      const css = fs.readFileSync(cssPath, "utf-8");

      // Top-left anchor normalization
      expect(css).toMatch(/#ui-container\s+\.hud-top-left-container\s*\{[^}]*left:\s*var\(--ui-safe-left\)\s*!important/);
      expect(css).toMatch(/#ui-container\s+\.hud-top-left-container\s*\{[^}]*right:\s*auto\s*!important/);

      // Top-right anchor normalization
      expect(css).toMatch(/#ui-container\s+\.hud-top-right-cluster\s*\{[^}]*right:\s*var\(--ui-safe-right\)\s*!important/);
      expect(css).toMatch(/#ui-container\s+\.hud-top-right-cluster\s*\{[^}]*left:\s*auto\s*!important/);

      // Bottom-right anchor positioning
      expect(css).toMatch(/#ui-container\s+\.hud-bottom-right-container\s*\{[^}]*right:\s*var\(--ui-safe-right\)\s*!important/);
      expect(css).toMatch(/#ui-container\s+\.hud-bottom-right-container\s*\{[^}]*bottom:\s*var\(--ui-safe-bottom\)\s*!important/);

      // Responsive rule: play cluster kept centered, micro-menu scaled to 32px
      expect(css).toMatch(/#ui-container\s+\.hud-play-cluster\s*\{[^}]*left:\s*50%\s*!important;\s*right:\s*auto\s*!important;\s*transform:\s*translateX\(-50%\)\s*!important;/);
      expect(css).toMatch(/#ui-container\s+\.micro-menu-btn\s*\{[^}]*width:\s*32px\s*!important;\s*height:\s*32px\s*!important;/);
    });
  });
});
