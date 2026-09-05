import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import {
  buildWorldHudDto,
  detectContextualStance,
  getHeadingCardinal,
  buildContextualHotbar
} from "../../src/simulation/presentation/WorldHudPresentation";
import { PlayerUnitFrame } from "../../src/ui/hud/PlayerUnitFrame";
import { NauticalCompassAlmanac, TidebookNavigation } from "../../src/ui/hud/NauticalCompassAlmanac";
import { MicroMenuPurseBar, TidebookPurse } from "../../src/ui/hud/MicroMenuPurseBar";
import { SmartContextualToolbar } from "../../src/ui/hud/SmartContextualToolbar";
import { SmartActionPrompt } from "../../src/ui/hud/SmartActionPrompt";
import { FarmingActionStatus } from "../../src/ui/components/FarmingActionStatus";
import { PlantingSeedBar } from "../../src/ui/components/PlantingSeedBar";
import type { FarmingActionSnapshot } from "../../src/app/FarmingActionController";
import type { ContextualHotbarSlotDto, ContextualStanceId, SeedBeltDto, WorldHudDto } from "../../src/simulation/core/contracts";

/** React SSR inserts comment markers between adjacent text nodes. */
function htmlContainsText(html: string, text: string): boolean {
  return html.replace(/<!--.*?-->/g, "").replace(/\s*\/\s*/g, "/").includes(text);
}

describe("Milestone M1 Adversarial & Empirical Stress Suite", () => {
  // =========================================================================
  // 1. BOUNDARY VALUES & EXTREME STATES (Labor, Sprint, Purse, Capacities)
  // =========================================================================
  describe("1. Boundary Values & Extreme States", () => {
    it("handles zero Work capacity (0/0) and exhausted states without NaN or render crashes", () => {
      const zeroWork: WorldHudDto["work"] = {
        current: 0,
        maximum: 0,
        exhausted: true,
        showLowNotice: true,
        recharging: false
      };

      const html = renderToString(
        React.createElement(PlayerUnitFrame, {
          work: zeroWork,
          sprint: null
        })
      );

      expect(htmlContainsText(html, "0/0")).toBe(true);
      expect(html).toContain("is-exhausted");
      expect(html).not.toContain("NaN");
    });

    it("handles negative work capacity values gracefully without crashing", () => {
      const negativeWork: WorldHudDto["work"] = {
        current: -15,
        maximum: 100,
        exhausted: true,
        showLowNotice: true,
        recharging: false
      };

      const html = renderToString(
        React.createElement(PlayerUnitFrame, {
          work: negativeWork,
          sprint: null
        })
      );

      expect(htmlContainsText(html, "-15/100")).toBe(true);
      expect(html).toContain("is-exhausted");
      expect(html).not.toContain("NaN");
    });

    it("handles exhausted sprint with 0/0 and negative values safely", () => {
      const sprintZero: WorldHudDto["sprint"] = {
        current: 0,
        maximum: 0,
        exhausted: true
      };

      const htmlZero = renderToString(
        React.createElement(PlayerUnitFrame, {
          work: { current: 50, maximum: 100, exhausted: false, showLowNotice: false, recharging: true },
          sprint: sprintZero
        })
      );

      expect(htmlZero).toContain("Winded");
      expect(htmlZero).toContain("sprint-stamina-winded");
      expect(htmlZero).not.toContain("NaN");

      const sprintNegative: WorldHudDto["sprint"] = {
        current: -25,
        maximum: 100,
        exhausted: true
      };

      const htmlNegative = renderToString(
        React.createElement(PlayerUnitFrame, {
          work: { current: 50, maximum: 100, exhausted: false, showLowNotice: false, recharging: true },
          sprint: sprintNegative
        })
      );

      expect(htmlNegative).toContain("Winded");
      expect(htmlNegative).not.toContain("NaN");
    });

    it("handles massive numbers (999,999 Gold, 100M Gold, 1,000,000 Work) with correct formatting", () => {
      const massiveWork: WorldHudDto["work"] = {
        current: 1000000,
        maximum: 1000000,
        exhausted: false,
        showLowNotice: false,
        recharging: false
      };

      const htmlWork = renderToString(
        React.createElement(PlayerUnitFrame, {
          work: massiveWork,
          sprint: null
        })
      );
      expect(htmlContainsText(htmlWork, "1000000/1000000")).toBe(true);

      const htmlPurse999k = renderToString(
        React.createElement(TidebookPurse, { money: 999999 })
      );
      expect(htmlContainsText(htmlPurse999k, "999,999 G")).toBe(true);
      expect(htmlPurse999k).toContain('aria-label="Purse: 999,999 gold"');

      const htmlPurse100M = renderToString(
        React.createElement(TidebookPurse, { money: 100000000 })
      );
      expect(htmlContainsText(htmlPurse100M, "100,000,000 G")).toBe(true);
      expect(htmlPurse100M).toContain('aria-label="Purse: 100,000,000 gold"');
    });

    it("handles negative money and over-capacity satchel/cargo safely in purse bar", () => {
      const overCapacity = {
        satchelUsed: 99,
        satchelMax: 20,
        cargoUsed: 5,
        cargoMax: 1
      };

      const html = renderToString(
        React.createElement(MicroMenuPurseBar, {
          money: -500,
          capacity: overCapacity,
          onOpenModal: () => {}
        })
      );

      const purse = renderToString(React.createElement(TidebookPurse, { money: -500 }));
      expect(htmlContainsText(purse, "-500 G")).toBe(true);
      expect(htmlContainsText(html, "99/20")).toBe(true);
      expect(htmlContainsText(html, "5/1")).toBe(true);
      expect(html).toContain("is-full");
      expect(html).toContain('data-testid="cargo-capacity-badge"');
    });

    it("handles 100+ seeds in PlantingSeedBar with hotkeys clamped strictly to 1-9", () => {
      const seedsList = Array.from({ length: 120 }, (_, i) => ({
        seedItemId: i % 2 === 0 ? "seed.wheat" : "seed.corn",
        cropId: i % 2 === 0 ? "crop.wheat" : "crop.corn",
        name: `Seed Variety #${i + 1}`,
        count: (i + 1) * 10,
        preferredClimates: ["temperate"] as SeedBeltDto["seeds"][number]["preferredClimates"]
      }));

      const seedBelt: SeedBeltDto = { seeds: seedsList };

      const html = renderToString(
        React.createElement(PlantingSeedBar, {
          seedBelt,
          selectedCropId: "crop.wheat",
          onSelectCrop: () => {},
          onCancel: () => {},
          currentSeason: "Spring"
        })
      );

      // Verify hotkey badges exist for 1 through 9
      for (let k = 1; k <= 9; k++) {
        expect(html).toContain(`<span class="seed-hotkey-badge" aria-hidden="true">${k}</span>`);
      }
      // Index 9 (10th item) and beyond should NOT have hotkey badge
      expect(html).not.toContain('<span class="seed-hotkey-badge" aria-hidden="true">10</span>');
      expect(html).not.toContain('<span class="seed-hotkey-badge" aria-hidden="true">11</span>');
      expect(html).toContain("Seed Variety #120");
    });
  });

  // =========================================================================
  // 2. RAPID STANCE TOGGLES & UNEXPECTED TYPES / FALLBACKS
  // =========================================================================
  describe("2. Rapid Stance Toggles & Fallback Resilience", () => {
    it("handles rapid sequential stance transitions without side-effects or throws", () => {
      const state = createInitialGameState();
      const stances: ContextualStanceId[] = ["agronomy", "angling", "maritime", "explorer"];

      for (const stance of stances) {
        const hotbar = buildContextualHotbar(state, stance, null);
        expect(hotbar).toHaveLength(5);

        const html = renderToString(
          React.createElement(SmartContextualToolbar, {
            stance,
            hotbar,
            activeSlot: 1
          })
        );
        const label = stance[0].toUpperCase() + stance.slice(1);
        expect(html).toContain(`aria-label="${label} Stance quickbar"`);
        expect(html.match(/data-testid="tool-slot-\d+"/g)).toHaveLength(5);
        expect(html).toContain("smart-contextual-toolbar");
      }
    });

    it("gracefully falls back on unexpected, null, or undefined stances", () => {
      const state = createInitialGameState();
      const hotbar = buildContextualHotbar(state, "explorer", null);

      // Null stance fallback
      const htmlNull = renderToString(
        React.createElement(SmartContextualToolbar, {
          stance: null as any,
          hotbar,
          activeSlot: 1
        })
      );
      expect(htmlNull).toContain("Explorer Stance");
      expect(htmlNull).not.toContain("undefined Stance");

      // Undefined stance fallback
      const htmlUndefined = renderToString(
        React.createElement(SmartContextualToolbar, {
          stance: undefined as any,
          hotbar,
          activeSlot: 1
        })
      );
      expect(htmlUndefined).toContain("Explorer Stance");
      expect(htmlUndefined).not.toContain("undefined Stance");

      // Invalid unknown string fallback
      const htmlUnknown = renderToString(
        React.createElement(SmartContextualToolbar, {
          stance: "unknown" as any,
          hotbar,
          activeSlot: 1
        })
      );
      expect(htmlUnknown).toContain("Explorer Stance");
      expect(htmlUnknown).not.toContain("undefined Stance");
    });

    it("handles empty hotbar array ([]) without crashing", () => {
      const html = renderToString(
        React.createElement(SmartContextualToolbar, {
          stance: "agronomy",
          hotbar: [],
          activeSlot: 1
        })
      );

      expect(html).toContain("smart-contextual-toolbar");
      expect(html).not.toContain("smart-slot-wrapper");
    });

    it("handles hotbar slot count > 99 displaying 99+ badge", () => {
      const hotbar: ContextualHotbarSlotDto[] = [
        {
          id: "slot-bulk-seeds",
          action: { type: "equip-tool", tool: "seeds" },
          slot: 1,
          shortcutKey: "1",
          name: "Bulk Seeds",
          detail: "Wheat Seeds (250)",
          icon: "seeds",
          quantity: 250,
          ready: true
        }
      ];

      const html = renderToString(
        React.createElement(SmartContextualToolbar, {
          stance: "agronomy",
          hotbar,
          activeSlot: 1
        })
      );

      expect(html).toContain("99+");
      expect(html).not.toContain(">250<");
    });

    it("handles detectContextualStance at extreme coordinates (NaN, Infinity) safely", () => {
      const state = createInitialGameState();

      // Infinite coordinates
      state.player.x = Infinity;
      state.player.z = -Infinity;
      state.player.activeBoatId = null;
      expect(() => detectContextualStance(state)).not.toThrow();
      expect(detectContextualStance(state)).toBe("explorer");

      // NaN coordinates: safely falls back to "explorer" stance without throwing
      state.player.x = NaN;
      state.player.z = NaN;
      expect(() => detectContextualStance(state)).not.toThrow();
      expect(detectContextualStance(state)).toBe("explorer");
    });
  });

  // =========================================================================
  // 3. SMART ACTION PROMPT ADVERSARIAL CASES & DEFECT DISCOVERIES
  // =========================================================================
  describe("3. Smart Action Prompt Adversarial Cases & Defect Discoveries", () => {
    it("handles prompts with missing bracketed keys (defaults to E safely)", () => {
      const html = renderToString(
        React.createElement(SmartActionPrompt, {
          promptText: "Harvest Winter Carrot (-5 Work)"
        })
      );

      expect(html).toContain("data-testid=\"context-prompt\"");
      expect(html).toContain("E");
      expect(html).toContain("Harvest");
      expect(html).toContain("Winter Carrot");
      expect(html).toContain("-5 Work");
    });

    it("handles prompts with no labor cost", () => {
      const html = renderToString(
        React.createElement(SmartActionPrompt, {
          promptText: "[E] Inspect Notice Board"
        })
      );

      expect(html).toContain("data-testid=\"context-prompt\"");
      expect(html).toContain("E");
      expect(html).toContain("Inspect");
      expect(html).toContain("Notice Board");
      expect(html).not.toContain("prompt-labor-badge");
    });

    it("handles prompts with zero labor cost (0 Work) without treating 0 as falsy", () => {
      const html = renderToString(
        React.createElement(SmartActionPrompt, {
          promptText: "[E] Collect Fresh Spring Water (0 Work)",
          currentWork: 50
        })
      );

      expect(html).toContain("Collect");
      expect(html).toContain("Fresh Spring Water");
      expect(html).toContain("-0 Work");
      expect(html).not.toContain("is-insufficient");
    });

    it("handles massive prompt text without throwing or hanging", () => {
      const hugeName = "Very Long Entity Name ".repeat(500);
      const hugePrompt = `[E] Inspect ${hugeName} (-10 Work)`;

      expect(() => {
        const html = renderToString(
          React.createElement(SmartActionPrompt, {
            promptText: hugePrompt
          })
        );
        expect(html).toContain("Inspect");
        expect(html).toContain("-10 Work");
      }).not.toThrow();
    });

    it("handles special characters, HTML tags, and unicode safely", () => {
      const xssPrompt = "[E] <script>alert('xss')</script> & \"Fish\" (-5 Work)";
      const html = renderToString(
        React.createElement(SmartActionPrompt, {
          promptText: xssPrompt
        })
      );

      // React escapes HTML tags during SSR
      expect(html).toContain("&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;");
      expect(html).not.toContain("<script>alert");

      // Unicode / Emojis
      const emojiPrompt = "[E] 🎣 Reel in Giant Tuna 🐟 (-12 Work)";
      const htmlEmoji = renderToString(
        React.createElement(SmartActionPrompt, {
          promptText: emojiPrompt
        })
      );
      expect(htmlEmoji).toContain("Giant Tuna 🐟");
      expect(htmlEmoji).toContain("-12 Work");
    });

    it("evaluates currentWork boundary comparisons for insufficient capacity", () => {
      // Exactly enough work (5 == 5) -> sufficient
      const htmlExact = renderToString(
        React.createElement(SmartActionPrompt, {
          promptText: "[E] Till Soil (-5 Work)",
          currentWork: 5
        })
      );
      expect(htmlExact).not.toContain("is-insufficient");

      // 1 less than needed (4 < 5) -> insufficient
      const htmlShort = renderToString(
        React.createElement(SmartActionPrompt, {
          promptText: "[E] Till Soil (-5 Work)",
          currentWork: 4
        })
      );
      expect(htmlShort).toContain("is-insufficient");

      // 0 work remaining -> insufficient
      const htmlZero = renderToString(
        React.createElement(SmartActionPrompt, {
          promptText: "[E] Till Soil (-5 Work)",
          currentWork: 0
        })
      );
      expect(htmlZero).toContain("is-insufficient");

      // Negative work (abnormal state) -> insufficient
      const htmlNegative = renderToString(
        React.createElement(SmartActionPrompt, {
          promptText: "[E] Till Soil (-5 Work)",
          currentWork: -10
        })
      );
      expect(htmlNegative).toContain("is-insufficient");
    });

    it("suppresses prompts matching notifications or empty prompt", () => {
      expect(renderToString(React.createElement(SmartActionPrompt, { promptText: null }))).toBe("");
      expect(renderToString(React.createElement(SmartActionPrompt, { promptText: "" }))).toBe("");
      expect(
        renderToString(
          React.createElement(SmartActionPrompt, {
            promptText: "Item Added",
            toastMessage: "Item Added"
          })
        )
      ).toBe("");
    });

    // REMEDIATED: Whitespace-only string returns null cleanly without rendering ghost prompt
    it("REMEDIATED: whitespace-only prompt renders null instead of ghost prompt", () => {
      const html = renderToString(React.createElement(SmartActionPrompt, { promptText: "   " }));
      expect(html).toBe("");
      expect(html.includes("data-testid=\"context-prompt\"")).toBe(false);
    });

    // REMEDIATED: Entity names with embedded Work numbers are preserved without corruption
    it("REMEDIATED: prompt with target name containing numbers followed by Work is correctly parsed", () => {
      // e.g. "Deliver 5 Work Orders (-10 Work)"
      const html = renderToString(
        React.createElement(SmartActionPrompt, {
          promptText: "[E] Deliver 5 Work Orders (-10 Work)"
        })
      );

      // Trailing labor cost (-10 Work) is correctly parsed and entity name "5 Work Orders" is preserved
      expect(html).toContain("-10 Work");
      expect(html).toContain("Deliver");
      expect(html).toContain("5 Work Orders");
      expect(html).not.toContain("-5 Work");
    });
  });

  // =========================================================================
  // 4. ACTION CAST BAR ADVERSARIAL TIMING & COMMIT STATES
  // =========================================================================
  describe("4. Action Cast Bar Timing & Commit States", () => {
    it("handles 0 progress and 100% progress boundaries accurately", () => {
      // 0 progress
      const snapZero: FarmingActionSnapshot = {
        id: 201,
        action: "water",
        phase: "started",
        stage: "anticipation",
        target: { x: 0, y: 0, z: 0 },
        progress: 0,
        committed: false,
        commitSucceeded: null,
        interruptible: true
      };

      const htmlZero = renderToString(
        React.createElement(FarmingActionStatus, { action: snapZero })
      );
      expect(htmlZero).toContain("0.0s /");
      expect(htmlZero).toContain("· 0%");
      expect(htmlZero).toContain("left:0%");
      expect(htmlZero).toContain("Channeling…");

      // 100% progress
      const snapComplete: FarmingActionSnapshot = {
        id: 202,
        action: "water",
        phase: "completed",
        stage: "recovery",
        target: { x: 0, y: 0, z: 0 },
        progress: 1.0,
        committed: true,
        commitSucceeded: true,
        interruptible: false
      };

      const htmlComplete = renderToString(
        React.createElement(FarmingActionStatus, { action: snapComplete })
      );
      expect(htmlComplete).toContain("· 100%");
      expect(htmlComplete).toContain("left:100%");
      expect(htmlComplete).toContain("Committed · Finishing…");
      expect(htmlComplete).toContain("Action locked in");
    });

    it("handles out-of-range progress (< 0 or > 1) with safe clamping", () => {
      // Negative progress (-0.5)
      const snapNegative: FarmingActionSnapshot = {
        id: 203,
        action: "harvest",
        phase: "started",
        stage: "anticipation",
        target: { x: 0, y: 0, z: 0 },
        progress: -0.5,
        committed: false,
        commitSucceeded: null,
        interruptible: true
      };

      const htmlNegative = renderToString(
        React.createElement(FarmingActionStatus, { action: snapNegative })
      );
      // percent clamps to 0%
      expect(htmlNegative).toContain("· 0%");
      expect(htmlNegative).toContain("left:0%");

      // Over 100% progress (1.5)
      const snapOver: FarmingActionSnapshot = {
        id: 204,
        action: "harvest",
        phase: "committed",
        stage: "recovery",
        target: { x: 0, y: 0, z: 0 },
        progress: 1.5,
        committed: true,
        commitSucceeded: true,
        interruptible: false
      };

      const htmlOver = renderToString(
        React.createElement(FarmingActionStatus, { action: snapOver })
      );
      // percent clamps to 100%
      expect(htmlOver).toContain("· 100%");
      expect(htmlOver).toContain("left:100%");
    });

    it("differentiates all permutation states of committed and interruptible", () => {
      const base: FarmingActionSnapshot = {
        id: 205,
        action: "fertilize",
        phase: "started",
        stage: "anticipation",
        target: { x: 0, y: 0, z: 0 },
        progress: 0.5,
        committed: false,
        commitSucceeded: null,
        interruptible: true
      };

      // 1. Uncommitted & Interruptible
      const html1 = renderToString(
        React.createElement(FarmingActionStatus, { action: { ...base, committed: false, interruptible: true } })
      );
      expect(html1).toContain("Channeling…");
      expect(html1).toContain("Move or press <kbd>Esc</kbd> to cancel");

      // 2. Uncommitted & Non-interruptible
      const html2 = renderToString(
        React.createElement(FarmingActionStatus, { action: { ...base, committed: false, interruptible: false } })
      );
      expect(html2).toContain("Channeling…");
      expect(html2).not.toContain("Move or press <kbd>Esc</kbd> to cancel");
      expect(html2).not.toContain("Action locked in");

      // 3. Committed & Non-interruptible
      const html3 = renderToString(
        React.createElement(FarmingActionStatus, { action: { ...base, committed: true, interruptible: false } })
      );
      expect(html3).toContain("Committed · Finishing…");
      expect(html3).toContain("Action locked in");

      // 4. Committed & Interruptible (edge case: committed wins)
      const html4 = renderToString(
        React.createElement(FarmingActionStatus, { action: { ...base, committed: true, interruptible: true } })
      );
      expect(html4).toContain("Committed · Finishing…");
      expect(html4).toContain("Action locked in");
    });

    it("falls back cleanly on unknown action types without crashing", () => {
      const unknownActionSnap: FarmingActionSnapshot = {
        id: 206,
        action: "teleport" as any,
        phase: "started",
        stage: "anticipation",
        target: { x: 0, y: 0, z: 0 },
        progress: 0.5,
        committed: false,
        commitSucceeded: null,
        interruptible: true
      };

      const html = renderToString(
        React.createElement(FarmingActionStatus, { action: unknownActionSnap })
      );
      expect(html).toContain("Working…");
      expect(html).toContain("1.0s / 2.0s · 50%");
      expect(html).toContain("left:50%");
    });

    // CHALLENGE FINDING 3: Progress as NaN produces invalid CSS styling
    it("REMEDIATED: NaN progress is safely sanitized to 0% without producing NaN styling or labels", () => {
      const nanSnap: FarmingActionSnapshot = {
        id: 207,
        action: "plant",
        phase: "started",
        stage: "anticipation",
        target: { x: 0, y: 0, z: 0 },
        progress: NaN,
        committed: false,
        commitSucceeded: null,
        interruptible: true
      };

      const html = renderToString(
        React.createElement(FarmingActionStatus, { action: nanSnap })
      );

      expect(html).not.toContain("NaN");
      expect(html).toContain("left:0%");
      expect(html).toContain("0.0s /");
      expect(html).toContain("· 0%");
    });
  });

  // =========================================================================
  // 5. NAUTICAL COMPASS RADAR GEOMETRY & CARDINAL BOUNDARIES
  // =========================================================================
  describe("5. Nautical Compass Radar Geometry & Cardinal Boundaries", () => {
    it("handles negative degrees and extreme rotation values in getHeadingCardinal", () => {
      expect(getHeadingCardinal(-360)).toBe("N");
      expect(getHeadingCardinal(-270)).toBe("E");
      expect(getHeadingCardinal(-180)).toBe("S");
      expect(getHeadingCardinal(-90)).toBe("W");
      expect(getHeadingCardinal(720)).toBe("N");
      expect(getHeadingCardinal(1080 + 45)).toBe("NE");
    });

    it("positions navigation markers by bearing, not distance, and hides off-rail markers", () => {
      const state = createInitialGameState();
      const hud = buildWorldHudDto(state);

      const extremeCompass = {
        ...hud.compass,
        nearbyMarkers: [
          {
            id: "near-0",
            type: "dock",
            kind: "dock" as const,
            x: 0,
            z: 0,
            label: "Dock",
            icon: "anchor" as const,
            distanceMeters: 0,
            relativeBearingDeg: 0,
            inRange: true
          },
          {
            id: "far-9999",
            type: "landmark",
            kind: "landmark" as const,
            x: 5000,
            z: 5000,
            label: "Far Lighthouse",
            icon: "landmark" as const,
            distanceMeters: 9999,
            relativeBearingDeg: 90,
            inRange: false
          },
          {
            id: "neg-dist",
            type: "farm",
            kind: "farm" as const,
            x: -10,
            z: -10,
            label: "Negative Farm",
            icon: "sprout" as const,
            distanceMeters: -50,
            relativeBearingDeg: -45,
            inRange: true
          }
        ]
      };

      const html = renderToString(
        React.createElement(TidebookNavigation, {
          compass: extremeCompass,
          onOpenMap: () => {}
        })
      );

      expect(html).toContain('data-testid="tidebook-navigation"');
      expect(html).toContain('style="left:50%" title="Dock · 0 m"');
      expect(html).toContain('style="left:21.875%" title="Negative Farm · -50 m"');
      expect(html).not.toContain("Far Lighthouse");
      expect(html).not.toContain("NaN");
      const distantDock = {
        ...extremeCompass,
        nearbyMarkers: [{ ...extremeCompass.nearbyMarkers[0], distanceMeters: 9999 }]
      };
      const distantHtml = renderToString(React.createElement(TidebookNavigation, { compass: distantDock, onOpenMap: () => {} }));
      expect(distantHtml).toContain('style="left:50%" title="Dock · 9999 m"');
    });
  });

  // =========================================================================
  // 6. DEEPLY FROZEN DTO IMMUTABILITY STRESS
  // =========================================================================
  describe("6. Deeply Frozen DTO Immutability Stress", () => {
    function deepFreeze<T>(obj: T): Readonly<T> {
      if (obj === null || typeof obj !== "object") return obj;
      Object.freeze(obj);
      for (const key of Object.keys(obj)) {
        const val = (obj as any)[key];
        if (val !== null && typeof val === "object") {
          deepFreeze(val);
        }
      }
      return obj;
    }

    it("guarantees all M1 components render seamlessly under deep freezing", () => {
      const state = createInitialGameState();
      const rawHud = buildWorldHudDto(state);
      const frozenHud = deepFreeze(JSON.parse(JSON.stringify(rawHud)));

      expect(() => {
        // PlayerUnitFrame
        renderToString(
          React.createElement(PlayerUnitFrame, {
            work: frozenHud.work,
            sprint: frozenHud.sprint,
            statusEffects: frozenHud.statusEffects
          })
        );

        // NauticalCompassAlmanac
        renderToString(
          React.createElement(NauticalCompassAlmanac, {
            clock: frozenHud.clock,
            weather: frozenHud.weather,
            compass: frozenHud.compass,
            onToggleForecast: () => {}
          })
        );

        // MicroMenuPurseBar
        renderToString(
          React.createElement(MicroMenuPurseBar, {
            money: frozenHud.money,
            capacity: frozenHud.capacity,
            expeditionUnlocked: frozenHud.expeditionUnlocked,
            onOpenModal: () => {}
          })
        );
        renderToString(React.createElement(TidebookPurse, { money: frozenHud.money }));
        renderToString(React.createElement(TidebookNavigation, { compass: frozenHud.compass, onOpenMap: () => {} }));

        // SmartContextualToolbar
        renderToString(
          React.createElement(SmartContextualToolbar, {
            stance: frozenHud.stance,
            hotbar: frozenHud.contextualHotbar,
            activeSlot: 1
          })
        );

        // PlantingSeedBar with deep frozen seedBelt
        const seedBelt: SeedBeltDto = deepFreeze({
          seeds: [
            { seedItemId: "seed.wheat", cropId: "crop.wheat", name: "Wheat", count: 10, preferredClimates: ["temperate"] },
            { seedItemId: "seed.corn", cropId: "crop.corn", name: "Sweet Corn", count: 5, preferredClimates: ["warm"] }
          ]
        });
        renderToString(
          React.createElement(PlantingSeedBar, {
            seedBelt,
            selectedCropId: "crop.wheat",
            onSelectCrop: () => {},
            onCancel: () => {},
            currentSeason: "Spring"
          })
        );

        // SmartActionPrompt
        renderToString(
          React.createElement(SmartActionPrompt, {
            promptText: "[E] Harvest Winter Carrot (-5 Work)",
            currentWork: 10
          })
        );
      }).not.toThrow();
    });
  });
});
