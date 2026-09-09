import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The map sidebar's colours are correct today — measured in the running app at
 * 6.9:1 or better across every lens and node. This guard keeps them that way:
 * the sidebar sits under three stacked style layers (the legacy `styles.css`
 * rules, their parchment re-skin, and the `modals.css` slate bridge), so a
 * Guildcraft token drifting lighter would silently hand the sidebar back to an
 * inherited colour that does not pass.
 */
const coastal = readFileSync(resolve(__dirname, "../../src/ui/coastal.css"), "utf8");

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(coastal);
  expect(match, `token --${name} is not declared in coastal.css`).not.toBeNull();
  return match![1];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Composite a translucent colour over an opaque one, as the browser would. */
function over(foreground: string, alpha: number, background: string): string {
  const parse = (hex: string) => {
    const h = hex.replace("#", "");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  };
  const f = parse(foreground);
  const b = parse(background);
  return `#${f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha))
    .toString(16).padStart(2, "0")).join("")}`;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The sidebar gradient's lighter stop — the least favourable ground. */
const SIDEBAR = "#1a1d17";
const STAT_CARD = over("#161914", 0.85, "#101210");
const TIP_CARD = over("#161914", 0.6, "#101210");
const CATEGORY_BADGE = over("#8e7745", 0.25, SIDEBAR);

describe("map sidebar contrast", () => {
  it.each([
    ["node name (22px, large)", "guild-gold", SIDEBAR, 3],
    ["section heading (13px)", "guild-gold", SIDEBAR, 4.5],
    ["route label (13.5px)", "guild-muted", STAT_CARD, 4.5],
    ["route value (13.5px)", "guild-gold", STAT_CARD, 4.5],
    ["sidebar tip (12px)", "guild-muted", TIP_CARD, 4.5],
    ["category badge (11px)", "guild-gold", CATEGORY_BADGE, 4.5],
    ["body text", "guild-ivory", SIDEBAR, 4.5]
  ])("keeps %s legible", (_label, tokenName, background, minimum) => {
    expect(contrast(token(tokenName), background)).toBeGreaterThanOrEqual(minimum);
  });

  it("keeps the chart scrim dark enough to hide the live scene behind it", () => {
    // The chart is read rather than glanced at, so it gets a heavier scrim than
    // the shared modal overlay. `backdrop-filter` stays off for frame cost.
    const rule = /\.modal-overlay:has\(\.world-map-modal\)\s*\{[^}]*background:\s*#([0-9a-fA-F]{8})/.exec(coastal);
    expect(rule, "chart scrim rule is missing").not.toBeNull();
    const alpha = parseInt(rule![1].slice(6, 8), 16) / 255;
    expect(alpha).toBeGreaterThanOrEqual(0.8);
  });
});
