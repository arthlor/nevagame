import React from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { GraphicsControls } from "../../src/ui/components/SettingsControls";
import {
  DEFAULT_GRAPHICS_EFFECTS,
  graphicsEffectSettings,
  graphicsRuntimeStatus,
  resolveGraphicsEffects,
  type GraphicsRuntimeStatus
} from "../../src/render/config/GraphicsEffectSettings";
import type { QualityTier } from "../../src/render/config/VisualRenderConfig";
import { localeStore } from "../../src/i18n/localeStore";

function render(effectiveTier: QualityTier = "high", preference: "auto" | QualityTier = "auto"): string {
  return renderToString(React.createElement(GraphicsControls, { preference, effectiveTier, onChange: () => {} }));
}

function status(tier: QualityTier, patch: Partial<GraphicsRuntimeStatus> = {}): GraphicsRuntimeStatus {
  const resolved = resolveGraphicsEffects(graphicsEffectSettings.get(), tier);
  return {
    tier,
    rendering: true,
    enhancedPath: tier === "high",
    requested: resolved,
    active: resolved,
    reductions: [],
    renderSize: { width: 1536, height: 864, pixelRatio: 0.8 },
    preparing: false,
    pressureSignal: "gpu-timing",
    fallbackReason: null,
    failedStages: [],
    ...patch
  };
}

afterEach(() => {
  graphicsEffectSettings.reset();
  localeStore.set("en");
});

describe("graphics settings controls", () => {
  it("keeps quality first and the individual effects behind the advanced disclosure", () => {
    const html = render();
    expect(html).toContain('data-testid="graphics-quality-auto"');
    expect(html.indexOf("Post-processing")).toBeLessThan(html.indexOf("Advanced effects"));
    expect(html.indexOf('data-testid="graphics-brightness"')).toBeLessThan(html.indexOf("<details"));
    for (const control of ["graphics-ao-auto", "graphics-glow-hdr", "graphics-edge-fast", "graphics-resolution-auto"]) {
      expect(html.indexOf(`data-testid="${control}"`)).toBeGreaterThan(html.indexOf("<details"));
    }
    // One Tab stop per radio group: only the selected option is focusable.
    expect(html.match(/role="radio" aria-checked="true" tabindex="0"/g)?.length).toBe(6);
    // Defaults leave nothing to reset.
    expect(html).toMatch(/data-testid="graphics-reset" disabled=""/);
  });

  it("describes no frames before the world is drawn", () => {
    graphicsRuntimeStatus.publish(status("high", { rendering: false }));
    const html = render();
    expect(html).not.toContain("is active");
    expect(html).not.toContain("Rendering at");
    expect(html).toContain("Active: High");
  });

  it("shows what High is actually drawing, with the colour finish and the real render size", () => {
    graphicsRuntimeStatus.publish(status("high"));
    const html = render();
    expect(html).toContain("Soft contact shading is active.");
    expect(html).toContain("Fast edge smoothing is active.");
    expect(html).toContain('data-testid="graphics-saturation"');
    expect(html).toContain("Rendering at 1536 × 864 (0.80×)");
    expect(html).toContain('data-testid="graphics-ao-strength"');
  });

  it("explains every choice Medium cannot apply instead of offering controls that do nothing", () => {
    graphicsEffectSettings.customize({ glow: "hdr", ambientOcclusion: "high" });
    graphicsRuntimeStatus.publish(status("medium"));
    const html = render("medium");
    expect(html).toContain("Low and Medium draw straight to the screen");
    expect(html).toContain("High needs the High quality level.");
    expect(html).toContain("HDR glow needs the High quality level");
    expect(html).toContain("already uses your display&#x27;s native antialiasing");
    expect(html).toContain("Colour finish applies on the High quality level.");
    expect(html).not.toContain('data-testid="graphics-saturation"');
    expect(html).toMatch(/data-testid="graphics-reset"(?! disabled)/);
  });

  it("reports Auto's temporary reductions and failed stages as the active state", () => {
    graphicsEffectSettings.customize({ glow: "hdr" });
    const requested = resolveGraphicsEffects(graphicsEffectSettings.get(), "high");
    graphicsRuntimeStatus.publish(status("high", {
      requested,
      active: { ...requested, hdrBloom: false, practicalGlow: true, fxaa: false, aoReduced: true },
      reductions: ["bloom", "ambient-occlusion", "resolution"],
      failedStages: ["fxaa"]
    }));
    const html = render();
    expect(html).toContain("Auto has paused HDR glow");
    expect(html).toContain("Auto is shading at reduced resolution");
    expect(html).toContain("This effect could not start on this device");
    expect(html).toContain("Auto has lowered the resolution");
  });

  it("explains a device without the enhanced path", () => {
    graphicsRuntimeStatus.publish(status("high", { enhancedPath: false, fallbackReason: "Half-float render targets are unsupported" }));
    expect(render()).toContain("Full-screen effects are unavailable on this device");
  });

  it("renders the Turkish dictionary", () => {
    localeStore.set("tr");
    graphicsRuntimeStatus.publish(status("high"));
    const html = render();
    expect(html).toContain("Son işleme");
    expect(html).toContain("Gelişmiş efektler");
    expect(html).toContain("Görüntüyü sıfırla");
    expect(html).toContain("%100");
    expect(graphicsEffectSettings.get()).toEqual(DEFAULT_GRAPHICS_EFFECTS);
  });
});
