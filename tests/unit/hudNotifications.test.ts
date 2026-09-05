import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { LegacyHUD as HUD } from "./uiTestHelpers";
import {
  NOTICE_MAX_VISIBLE,
  NoticeQueue,
  inferNoticeTone,
  type Notice
} from "../../src/ui/notifications";
import { autoScaleFor, isUiScalePreference, resolveUiScale } from "../../src/ui/uiScale";
import { KEY_BINDINGS, KEY_BINDING_GROUPS } from "../../src/ui/keybindings";

describe("NoticeQueue", () => {
  it("keeps several concurrent messages instead of overwriting one slot", () => {
    const queue = new NoticeQueue();
    queue.push("Sold for 40 G", 0, { tone: "reward" });
    queue.push("Errand progress 1 / 3", 0, { tone: "success" });

    const live = queue.list(0);
    expect(live).toHaveLength(2);
    expect(live.map((notice) => notice.text)).toEqual([
      "Sold for 40 G",
      "Errand progress 1 / 3"
    ]);
  });

  it("coalesces an immediate repeat into a counted entry", () => {
    const queue = new NoticeQueue();
    queue.push("Not enough work", 0, { tone: "danger" });
    queue.push("Not enough work", 100, { tone: "danger" });
    queue.push("Not enough work", 200, { tone: "danger" });

    const live = queue.list(200);
    expect(live).toHaveLength(1);
    expect(live[0].count).toBe(3);
  });

  it("does not coalesce the same text across different tones", () => {
    const queue = new NoticeQueue();
    queue.push("Docked at harbor", 0, { tone: "info" });
    queue.push("Docked at harbor", 10, { tone: "success" });
    expect(queue.list(10)).toHaveLength(2);
  });

  it("drops entries once their duration has elapsed", () => {
    const queue = new NoticeQueue();
    queue.push("Bite! Hook it now", 0, { tone: "warning", durationMs: 1400 });
    expect(queue.list(1000)).toHaveLength(1);
    expect(queue.list(3000)).toHaveLength(0);
  });

  it("never grows past the visible cap", () => {
    const queue = new NoticeQueue();
    for (let index = 0; index < NOTICE_MAX_VISIBLE + 4; index += 1) {
      queue.push(`Message ${index}`, index, { tone: "info" });
    }
    expect(queue.list(0).length).toBe(NOTICE_MAX_VISIBLE);
    expect(queue.latest?.text).toBe(`Message ${NOTICE_MAX_VISIBLE + 3}`);
  });

  it("rewrites a keyed entry in place instead of stacking", () => {
    const queue = new NoticeQueue();
    queue.push("Sold 2 items for 40 G", 0, { tone: "reward", key: "market-sale" });
    queue.push("Bite! Hook it now", 10, { tone: "warning" });
    queue.push("Sold 5 items for 120 G", 20, { tone: "reward", key: "market-sale" });

    const live = queue.list(20);
    expect(live).toHaveLength(2);
    expect(live[0].text).toBe("Sold 5 items for 120 G");
    expect(live[0].count).toBe(1);
    expect(live[1].text).toBe("Bite! Hook it now");
  });

  it("ignores blank text", () => {
    const queue = new NoticeQueue();
    expect(queue.push("   ", 0)).toBeNull();
    expect(queue.list(0)).toHaveLength(0);
  });

  it("reads failure prose as a danger tone", () => {
    expect(inferNoticeTone("Could not sell item")).toBe("danger");
    expect(inferNoticeTone("The satchel is full")).toBe("danger");
    expect(inferNoticeTone("The fish got away")).toBe("warning");
    expect(inferNoticeTone("Docked at harbor")).toBe("info");
  });
});

describe("HUD notification rendering", () => {
  const notice = (overrides: Partial<Notice>): Notice => ({
    id: 1,
    text: "Sold for 40 G",
    tone: "reward",
    category: "general",
    count: 1,
    createdMs: 0,
    expiresMs: 10_000,
    ...overrides
  });

  it("renders every live notice with its tone", () => {
    const html = renderToString(
      React.createElement(HUD, {
        state: createInitialGameState(),
        promptText: null,
        notices: [
          notice({ id: 1, text: "Sold for 40 G", tone: "reward" }),
          notice({ id: 2, text: "Could not sell item", tone: "danger" })
        ]
      })
    );
    expect(html).toContain("hud-toast-pill--reward");
    expect(html).toContain("hud-toast-pill--danger");
    expect(html).toContain("Sold for 40 G");
    expect(html).toContain("Could not sell item");
  });

  it("shows a repeat count for coalesced notices", () => {
    const html = renderToString(
      React.createElement(HUD, {
        state: createInitialGameState(),
        promptText: null,
        notices: [notice({ count: 3, text: "Not enough work", tone: "danger" })]
      })
    );
    expect(html).toContain("x3");
  });

  it("still accepts the single-string form", () => {
    const html = renderToString(
      React.createElement(HUD, {
        state: createInitialGameState(),
        promptText: null,
        toastMessage: "Seeds planted."
      })
    );
    expect(html).toContain("hud-toast-pill");
    expect(html).toContain("Seeds planted.");
  });

  it("mounts the live region even with nothing to announce", () => {
    const html = renderToString(
      React.createElement(HUD, { state: createInitialGameState(), promptText: null })
    );
    expect(html).toContain('data-testid="notice-stack"');
    expect(html).toContain('aria-live="polite"');
  });
});

describe("HUD tool belt", () => {
  it("reports what each slot is carrying", () => {
    const state = createInitialGameState();
    const html = renderToString(
      React.createElement(HUD, { state, promptText: null, activeToolSlot: 2 })
    );
    // Slots hold tools, so none of them may render as an empty well.
    expect(html).not.toContain("chrome-slot is-empty  hud-hotbar-slot");
    expect(html).toContain("hud-tool-belt-readout");
    expect(html).toContain("Seeds");
  });

  it("marks a slot unavailable when it has nothing to use", () => {
    const state = createInitialGameState();
    const inventory = state.inventories[state.player.inventoryId];
    for (const slot of inventory.slots) {
      if (slot.itemId?.startsWith("seed.")) {
        slot.itemId = undefined;
        slot.quantity = 0;
      }
    }
    const html = renderToString(
      React.createElement(HUD, { state, promptText: null, activeToolSlot: 1 })
    );
    expect(html).toContain('data-ready="false"');
    expect(html).toContain("No seeds");
  });
});

describe("uiScale", () => {
  it("shrinks below the reference window and grows above it", () => {
    expect(autoScaleFor(1440, 810)).toBe(1);
    expect(autoScaleFor(1024, 640)).toBeLessThan(1);
    expect(autoScaleFor(3840, 2160)).toBeGreaterThan(1);
  });

  it("stays inside safe bounds for extreme viewports", () => {
    expect(autoScaleFor(320, 200)).toBeGreaterThanOrEqual(0.85);
    expect(autoScaleFor(7680, 4320)).toBeLessThanOrEqual(1.35);
    expect(autoScaleFor(0, 0)).toBe(1);
    expect(autoScaleFor(Number.NaN, 100)).toBe(1);
  });

  it("uses the shorter axis so ultrawide windows do not inflate the HUD", () => {
    expect(autoScaleFor(3440, 810)).toBe(autoScaleFor(1440, 810));
  });

  it("honours explicit preferences regardless of viewport", () => {
    expect(resolveUiScale("small", 3840, 2160)).toBe(0.85);
    expect(resolveUiScale("large", 800, 600)).toBe(1.2);
    expect(isUiScalePreference("auto")).toBe(true);
    expect(isUiScalePreference("gigantic")).toBe(false);
  });
});

describe("keybinding reference", () => {
  it("documents every panel hotkey the input router listens for", () => {
    const documented = KEY_BINDINGS.map((binding) => binding.keys);
    for (const key of ["I", "J", "M", "L", "P", "Esc", "1 – 5", "Alt"]) {
      expect(documented).toContain(key);
    }
  });

  it("has no duplicate group ids", () => {
    const ids = KEY_BINDING_GROUPS.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
