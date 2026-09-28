import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChromeQuality } from "../../src/ui/chrome/Chrome";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { atlasForItem, UI_FISH, UI_QUALITY } from "../../src/ui/chrome/uiAtlas";

describe("item identity and quality badges", () => {
  it("draws every quality tier as an item-neutral medallion told apart by pip count", () => {
    const tiers = ["common", "fine", "exceptional", "prize", "trophy"] as const;
    const pips = tiers.map((quality) => {
      const html = renderToString(React.createElement(ChromeQuality, { quality }));
      for (const sprite of Object.values(UI_QUALITY)) expect(html).not.toContain(sprite.split("/").pop()!);
      return Number(/data-quality-pips="(\d)"/.exec(html)?.[1]);
    });
    expect(pips).toEqual([1, 2, 3, 4, 4]);
  });

  it("resolves produce by its own id and never borrows a fish icon", () => {
    const fishSprites = new Set<string>(Object.values(UI_FISH));
    for (const item of ContentRegistry.items.values()) {
      if (item.id.startsWith("fish.")) continue;
      const sprite = atlasForItem(item.id);
      if (sprite) expect(fishSprites.has(sprite), item.id).toBe(false);
    }
    expect(atlasForItem("produce.tomato")).toBeDefined();
  });
});
