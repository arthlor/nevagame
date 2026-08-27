import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { playUiSound } from "../../src/ui/audio/uiAudio";
import { gameAudio } from "../../src/audio/AudioManager";
import {
  ChromePanel,
  ChromeButton,
  ChromeClose,
  ChromeSlot,
  ChromeMeter,
  ChromeKeycap,
  ChromeDivider,
  ChromeQuality,
  ChromeAlert,
  ChromeWaxSeal,
  ChromeRibbon
} from "../../src/ui/chrome/Chrome";
import {
  FiligreeCornerTL,
  FiligreeCornerTR,
  FiligreeCornerBL,
  FiligreeCornerBR,
  OrnateBrassDivider,
  CelestialTimeDial,
  MedallionPurse,
  EmbossedKeycap,
  CornerLeafSprout,
  CornerRopeKnot,
  OrnateDivider,
  KeycapBadge,
  CompassDial
} from "../../src/ui/HudDecorations";
import * as HudDecorationsComponents from "../../src/ui/components/HudDecorations";

describe("Milestone M1 Empirical Stress & Boundary Verification", () => {
  it("exports components via HudDecorations component path", () => {
    expect(HudDecorationsComponents).toBeDefined();
  });

  describe("1. UI Audio Dispatcher Resilience & Boundary Tests", () => {
    it("dispatches all defined UI sound cues correctly", () => {
      const playOneShotSpy = vi.spyOn(gameAudio, "playOneShot").mockImplementation(() => {});
      const playBankSpy = vi.spyOn(gameAudio, "playBank").mockImplementation(() => {});

      const expectedMappings: Record<string, { type: "oneShot" | "bank"; arg: string }> = {
        click: { type: "oneShot", arg: "ui-click" },
        confirm: { type: "oneShot", arg: "ui-confirm" },
        open: { type: "bank", arg: "ui-open" },
        cloth: { type: "oneShot", arg: "ui-cloth" },
        coins: { type: "oneShot", arg: "coins" },
        "page-turn": { type: "oneShot", arg: "page-turn" },
        chime: { type: "oneShot", arg: "quest-chime" }
      };

      for (const [cue, expected] of Object.entries(expectedMappings)) {
        playUiSound(cue);
        if (expected.type === "oneShot") {
          expect(playOneShotSpy).toHaveBeenCalledWith(expected.arg);
        } else {
          expect(playBankSpy).toHaveBeenCalledWith(expected.arg);
        }
      }

      playOneShotSpy.mockRestore();
      playBankSpy.mockRestore();
    });

    it("handles arbitrary custom or fallback sound keys gracefully", () => {
      const playOneShotSpy = vi.spyOn(gameAudio, "playOneShot").mockImplementation(() => {});
      playUiSound("custom-wood-knock");
      expect(playOneShotSpy).toHaveBeenCalledWith("custom-wood-knock");
      playOneShotSpy.mockRestore();
    });

    it("survives null, undefined, empty, and invalid inputs without throwing", () => {
      const playOneShotSpy = vi.spyOn(gameAudio, "playOneShot").mockImplementation(() => {});

      expect(() => playUiSound("")).not.toThrow();
      expect(() => playUiSound(null as any)).not.toThrow();
      expect(() => playUiSound(undefined as any)).not.toThrow();
      expect(() => playUiSound(12345 as any)).not.toThrow();
      expect(() => playUiSound({} as any)).not.toThrow();

      playOneShotSpy.mockRestore();
    });

    it("never propagates exceptions if gameAudio throws or audio context is broken", () => {
      const playOneShotSpy = vi.spyOn(gameAudio, "playOneShot").mockImplementation(() => {
        throw new Error("AudioContext is in closed state");
      });
      const playBankSpy = vi.spyOn(gameAudio, "playBank").mockImplementation(() => {
        throw new DOMException("Audio graph failed to initialize", "InvalidStateError");
      });

      expect(() => playUiSound("click")).not.toThrow();
      expect(() => playUiSound("open")).not.toThrow();
      expect(() => playUiSound("unknown-cue")).not.toThrow();

      playOneShotSpy.mockRestore();
      playBankSpy.mockRestore();
    });

    it("survives rapid-fire volume stress of 5,000 calls", () => {
      const playOneShotSpy = vi.spyOn(gameAudio, "playOneShot").mockImplementation(() => {});
      const cues = ["click", "confirm", "open", "cloth", "coins", "page-turn", "chime", "custom"];

      expect(() => {
        for (let i = 0; i < 5000; i++) {
          playUiSound(cues[i % cues.length]);
        }
      }).not.toThrow();

      expect(playOneShotSpy).toHaveBeenCalled();
      playOneShotSpy.mockRestore();
    });
  });

  describe("2. ChromePanel Primitive Rendering & Edge Cases", () => {
    it("renders all tone variants with expected CSS classes", () => {
      const tones = ["slate", "timber", "scroll", "dock", "ghost", "plaque"] as const;
      for (const tone of tones) {
        const html = renderToString(
          React.createElement(ChromePanel, { tone }, "Panel Content")
        );
        expect(html).toContain("chrome-panel");
        const resolvedTone = tone === "plaque" ? "slate" : tone;
        expect(html).toContain(`chrome-panel--${resolvedTone}`);
        if (tone === "plaque") {
          expect(html).toContain("chrome-panel--plaque");
        }
        expect(html).toContain("Panel Content");
      }
    });

    it("renders different HTML tags based on 'as' prop", () => {
      const tags = ["div", "section", "aside", "header", "article", "nav", "footer"] as const;
      for (const tag of tags) {
        const html = renderToString(
          React.createElement(ChromePanel, { as: tag }, "Tag content")
        );
        expect(html).toMatch(new RegExp(`^<${tag}\\b`));
        expect(html).toContain("Tag content");
      }
    });

    it("renders rivets, wax seal, ribbon banner, and corner flourishes when requested", () => {
      const html = renderToString(
        React.createElement(
          ChromePanel,
          {
            flourish: true,
            corners: true,
            rivets: true,
            seal: true,
            ribbon: "Guild Notice"
          },
          "Panel Body"
        )
      );

      expect(html).toContain("chrome-rivet--tl");
      expect(html).toContain("chrome-rivet--tr");
      expect(html).toContain("chrome-rivet--bl");
      expect(html).toContain("chrome-rivet--br");
      expect(html).toContain("chrome-wax-seal");
      expect(html).toContain("chrome-ribbon-banner");
      expect(html).toContain("Guild Notice");
      expect(html).toContain("hud-filigree-corner--tl");
    });

    it("omits rivets when rivets=false", () => {
      const html = renderToString(
        React.createElement(ChromePanel, { rivets: false }, "No Rivets")
      );
      expect(html).not.toContain("chrome-rivet");
    });
  });

  describe("3. ChromeButton & ChromeClose Interactivity & Sound Wiring", () => {
    it("renders all button variants and sizes", () => {
      const variants = ["primary", "secondary", "gold", "danger", "ghost", "teal"] as const;
      const sizes = ["sm", "md", "lg"] as const;

      for (const variant of variants) {
        for (const size of sizes) {
          const html = renderToString(
            React.createElement(
              ChromeButton,
              { variant, size },
              `${variant} ${size}`
            )
          );
          expect(html).toContain(`neva-button-${variant}`);
          expect(html).toContain(`neva-button--${size}`);
        }
      }
    });

    it("handles click and sound triggers for ChromeButton", () => {
      const playOneShotSpy = vi.spyOn(gameAudio, "playOneShot").mockImplementation(() => {});
      let clicked = false;

      // Invoke the component render function directly to inspect returned JSX props
      const rendered = (ChromeButton as any).render(
        {
          onClick: () => { clicked = true; },
          soundCue: "coins",
          children: "Click Me"
        },
        null
      );

      const fakeEvent = { stopPropagation: () => {}, preventDefault: () => {} } as any;
      rendered.props.onClick(fakeEvent);

      expect(clicked).toBe(true);
      expect(playOneShotSpy).toHaveBeenCalledWith("coins");

      playOneShotSpy.mockRestore();
    });

    it("does not play sound when ChromeButton is disabled", () => {
      const playOneShotSpy = vi.spyOn(gameAudio, "playOneShot").mockImplementation(() => {});
      let clicked = false;

      const rendered = (ChromeButton as any).render(
        {
          disabled: true,
          onClick: () => { clicked = true; },
          soundCue: "coins",
          children: "Disabled Button"
        },
        null
      );

      const fakeEvent = {} as any;
      rendered.props.onClick(fakeEvent);

      expect(playOneShotSpy).not.toHaveBeenCalled();
      expect(clicked).toBe(true);

      playOneShotSpy.mockRestore();
    });

    it("renders ChromeClose and triggers sound on click", () => {
      const playOneShotSpy = vi.spyOn(gameAudio, "playOneShot").mockImplementation(() => {});
      let closed = false;

      const rendered = ChromeClose({
        label: "Dismiss Modal",
        onClick: () => { closed = true; }
      }) as React.ReactElement<{ "aria-label"?: string; onClick: (e: any) => void }>;

      expect(rendered.props["aria-label"]).toBe("Dismiss Modal");
      rendered.props.onClick({} as any);
      expect(closed).toBe(true);
      expect(playOneShotSpy).toHaveBeenCalledWith("ui-click");

      playOneShotSpy.mockRestore();
    });
  });

  describe("4. ChromeSlot Boundary & Interactivity Tests", () => {
    it("renders empty slot vs filled slot with quantities", () => {
      const emptyHtml = renderToString(
        React.createElement(ChromeSlot, { filled: false, slotNumber: 1 })
      );
      expect(emptyHtml).toContain("chrome-slot");
      expect(emptyHtml).toContain("is-empty");
      expect(emptyHtml).toContain("chrome-slot-num");
      expect(emptyHtml).toContain("1");
      expect(emptyHtml).not.toContain("chrome-slot-qty");

      const filledHtml = renderToString(
        React.createElement(ChromeSlot, { filled: true, quantity: 42, rarity: "fine" })
      );
      expect(filledHtml).toContain("is-filled");
      expect(filledHtml).toContain("chrome-slot--fine");
      expect(filledHtml).toContain("42");
    });

    it("renders as button when onClick or onSelect is supplied, div otherwise", () => {
      const divHtml = renderToString(
        React.createElement(ChromeSlot, { filled: false })
      );
      expect(divHtml).toMatch(/^<div\b/);

      const buttonHtml = renderToString(
        React.createElement(ChromeSlot, { onClick: () => {} })
      );
      expect(buttonHtml).toMatch(/^<button\b/);

      const selectButtonHtml = renderToString(
        React.createElement(ChromeSlot, { onSelect: () => {} })
      );
      expect(selectButtonHtml).toMatch(/^<button\b/);
    });

    it("triggers playUiSound, onClick, and onSelect when clicked", () => {
      const playOneShotSpy = vi.spyOn(gameAudio, "playOneShot").mockImplementation(() => {});
      let clicked = false;
      let selected = false;

      const rendered = ChromeSlot({
        onClick: () => { clicked = true; },
        onSelect: () => { selected = true; },
        soundCue: "cloth"
      }) as React.ReactElement<{ onClick: (e: any) => void }>;

      rendered.props.onClick({} as any);
      expect(clicked).toBe(true);
      expect(selected).toBe(true);
      expect(playOneShotSpy).toHaveBeenCalledWith("ui-cloth");

      playOneShotSpy.mockRestore();
    });

    it("handles extreme quantities, zero, negative, floats, and nulls", () => {
      const cases = [0, -1, 999999, 3.14159, null, undefined];
      for (const qty of cases) {
        expect(() => {
          renderToString(React.createElement(ChromeSlot, { filled: true, quantity: qty }));
        }).not.toThrow();
      }
    });
  });

  describe("5. ChromeMeter Boundary & Clamp Tests", () => {
    it("handles normal percentages correctly", () => {
      const html = renderToString(
        React.createElement(ChromeMeter, {
          label: "Labor",
          value: 400,
          max: 1000,
          fill: "labor"
        })
      );
      expect(html).toContain('role="meter"');
      expect(html).toContain('aria-label="Labor"');
      expect(html).toContain('aria-valuenow="400"');
      expect(html).toContain('aria-valuemax="1000"');
      expect(html).toContain("width:40%");
      expect(html).toContain("400 / 1000");
    });

    it("clamps values exceeding max to 100%", () => {
      const html = renderToString(
        React.createElement(ChromeMeter, {
          label: "Overfilled",
          value: 150,
          max: 100
        })
      );
      expect(html).toContain("width:100%");
    });

    it("clamps negative values to 0%", () => {
      const html = renderToString(
        React.createElement(ChromeMeter, {
          label: "Negative",
          value: -50,
          max: 100
        })
      );
      expect(html).toContain("width:0%");
    });

    it("safely handles max <= 0 (zero division prevention)", () => {
      const zeroMaxHtml = renderToString(
        React.createElement(ChromeMeter, {
          label: "Zero Max",
          value: 10,
          max: 0
        })
      );
      expect(zeroMaxHtml).toContain("width:0%");

      const negativeMaxHtml = renderToString(
        React.createElement(ChromeMeter, {
          label: "Negative Max",
          value: 10,
          max: -100
        })
      );
      expect(negativeMaxHtml).toContain("width:0%");
    });

    it("supports vertical orientation", () => {
      const html = renderToString(
        React.createElement(ChromeMeter, {
          label: "Tension",
          value: 75,
          max: 100,
          orientation: "vertical"
        })
      );
      expect(html).toContain("chrome-meter--vertical");
      expect(html).toContain("height:75%");
    });

    it("supports all variants and custom valueText", () => {
      const variants = ["labor", "sprint", "hull", "fishing", "danger", "gold", "stamina"] as const;
      for (const variant of variants) {
        const html = renderToString(
          React.createElement(ChromeMeter, {
            label: variant,
            value: 50,
            max: 100,
            variant,
            valueText: "Custom Readout"
          })
        );
        expect(html).toContain(`chrome-meter--${variant}`);
        expect(html).toContain("Custom Readout");
      }
    });
  });

  describe("6. Keycap, Divider, Quality, Alert, WaxSeal, Ribbon Components", () => {
    it("renders ChromeKeycap with glow and custom keys", () => {
      const html = renderToString(
        React.createElement(ChromeKeycap, { keyName: "Space", glow: true })
      );
      expect(html).toContain("chrome-keycap");
      expect(html).toContain("is-glowing");
      expect(html).toContain("Space");
    });

    it("renders ChromeDivider ornate vs simple", () => {
      const ornateHtml = renderToString(React.createElement(ChromeDivider, { ornate: true }));
      expect(ornateHtml).toContain("chrome-divider--ornate");

      const simpleHtml = renderToString(React.createElement(ChromeDivider, { ornate: false }));
      expect(simpleHtml).not.toContain("chrome-divider--ornate");
    });

    it("renders ChromeQuality medals", () => {
      const qualities = ["normal", "silver", "gold", "iridium", "common", "fine", "exceptional", "trophy", null, undefined];
      for (const q of qualities) {
        const html = renderToString(React.createElement(ChromeQuality, { quality: q }));
        expect(html).toContain("chrome-quality");
      }
    });

    it("renders ChromeAlert tones", () => {
      const tones = ["caution", "danger", "success", "guild"] as const;
      for (const tone of tones) {
        const html = renderToString(
          React.createElement(ChromeAlert, { tone, children: "Alert text" })
        );
        expect(html).toContain(`chrome-alert--${tone}`);
        expect(html).toContain("Alert text");
      }
    });

    it("renders ChromeWaxSeal and ChromeRibbon", () => {
      const sealHtml = renderToString(React.createElement(ChromeWaxSeal, { insignia: "N" }));
      expect(sealHtml).toContain("chrome-wax-seal");
      expect(sealHtml).toContain("chrome-wax-insignia");
      expect(sealHtml).toContain("N");

      const ribbonHtml = renderToString(React.createElement(ChromeRibbon, { label: "Fresh Bounty" }));
      expect(ribbonHtml).toContain("chrome-ribbon-banner");
      expect(ribbonHtml).toContain("Fresh Bounty");
    });
  });

  describe("7. Procedural SVG Flourishes & Backward Compatibility", () => {
    it("renders all filigree corner brackets with custom size and color", () => {
      const corners = [FiligreeCornerTL, FiligreeCornerTR, FiligreeCornerBL, FiligreeCornerBR];
      for (const Corner of corners) {
        const html = renderToString(
          React.createElement(Corner, { size: 48, color: "#ffdd00" })
        );
        expect(html).toContain("svg");
        expect(html).toContain("hud-filigree");
      }
    });

    it("renders OrnateBrassDivider with gradient defs", () => {
      const html = renderToString(React.createElement(OrnateBrassDivider, { color: "#d4af37" }));
      expect(html).toContain("mm-div-grad-left");
      expect(html).toContain("mm-div-grad-right");
    });

    it("renders CelestialTimeDial with rotation and day/night modes", () => {
      const dayHtml = renderToString(
        React.createElement(CelestialTimeDial, { size: 64, rotation: 45, isNight: false })
      );
      expect(dayHtml).toContain("rotate(45 27 27)");
      expect(dayHtml).toContain("#243a5e");

      const nightHtml = renderToString(
        React.createElement(CelestialTimeDial, { size: 64, rotation: 180, isNight: true })
      );
      expect(nightHtml).toContain("rotate(180 27 27)");
      expect(nightHtml).toContain("#121b2d");
    });

    it("renders MedallionPurse and EmbossedKeycap", () => {
      const purseHtml = renderToString(React.createElement(MedallionPurse, { size: 36 }));
      expect(purseHtml).toContain("hud-medallion-purse-svg");

      const keycapHtml = renderToString(React.createElement(EmbossedKeycap, { keyName: "F", glow: true }));
      expect(keycapHtml).toContain("hud-embossed-keycap");
      expect(keycapHtml).toContain("is-glowing");
      expect(keycapHtml).toContain("F");
    });

    it("maintains full backward compatibility aliases", () => {
      expect(renderToString(React.createElement(CornerLeafSprout))).toContain("hud-filigree");
      expect(renderToString(React.createElement(CornerRopeKnot))).toContain("hud-filigree");
      expect(renderToString(React.createElement(OrnateDivider))).toContain("chrome-divider-ornate-wrap");
      expect(renderToString(React.createElement(KeycapBadge, { keyName: "E" }))).toContain("E");
      expect(renderToString(React.createElement(CompassDial))).toContain("hud-celestial-dial-svg");
    });
  });

  describe("8. Adversarial Boundary Conditions & Numerical Extremes", () => {
    it("handles NaN, Infinity, and -Infinity gracefully in ChromeMeter", () => {
      expect(() => {
        renderToString(
          React.createElement(ChromeMeter, {
            label: "Infinite Meter",
            value: Infinity,
            max: 100
          })
        );
      }).not.toThrow();

      expect(() => {
        renderToString(
          React.createElement(ChromeMeter, {
            label: "NaN Meter",
            value: NaN,
            max: NaN
          })
        );
      }).not.toThrow();

      expect(() => {
        renderToString(
          React.createElement(ChromeMeter, {
            label: "Neg Infinity Meter",
            value: -Infinity,
            max: Infinity
          })
        );
      }).not.toThrow();
    });

    it("handles slotNumber=0 and quantity=0 properly without falsy omission", () => {
      const html = renderToString(
        React.createElement(ChromeSlot, {
          filled: true,
          quantity: 0,
          slotNumber: 0
        })
      );

      expect(html).toContain("chrome-slot-num");
      expect(html).toContain("0");
      expect(html).toContain("chrome-slot-qty");
    });

    it("handles FiligreeCorner with zero and fractional sizes", () => {
      expect(() => {
        renderToString(React.createElement(FiligreeCornerTL, { size: 0 }));
        renderToString(React.createElement(FiligreeCornerBR, { size: 0.5 }));
        renderToString(React.createElement(CelestialTimeDial, { size: 0, rotation: 99999 }));
      }).not.toThrow();
    });

    it("safely executes 100 concurrent async audio dispatch bursts", async () => {
      const playOneShotSpy = vi.spyOn(gameAudio, "playOneShot").mockImplementation(() => {});
      const playBankSpy = vi.spyOn(gameAudio, "playBank").mockImplementation(() => {});

      const tasks = Array.from({ length: 100 }, async (_, i) => {
        await new Promise((r) => setTimeout(r, 1));
        playUiSound(i % 2 === 0 ? "click" : "open");
      });

      await Promise.all(tasks);

      expect(playOneShotSpy).toHaveBeenCalled();
      expect(playBankSpy).toHaveBeenCalled();

      playOneShotSpy.mockRestore();
      playBankSpy.mockRestore();
    });
  });
});
