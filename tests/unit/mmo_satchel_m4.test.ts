import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { InventoryModal, matchesSatchelSearch } from "../../src/ui/InventoryModal";
import {
  ItemInspectCard,
  formatGrowthDuration,
  freshnessToneFor
} from "../../src/ui/components/ItemInspectCard";
import type { ItemInspectionDto, SatchelDto } from "../../src/simulation/core/contracts";

const slot = (
  index: number,
  over: Partial<SatchelDto["slots"][number]> = {}
): SatchelDto["slots"][number] => ({
  index,
  itemId: null,
  name: "Empty slot",
  description: null,
  categoryLabel: null,
  inventoryCategory: null,
  quantity: 0,
  cropId: null,
  cropName: null,
  isFish: false,
  ...over
} as SatchelDto["slots"][number]);

const satchel: SatchelDto = {
  occupiedSlots: 3,
  totalSlots: 6,
  slots: [
    slot(0, { itemId: "seed.wheat", name: "Wheat Seed", categoryLabel: "seed", inventoryCategory: "farming", quantity: 8, cropId: "crop.wheat", cropName: "Wheat" }),
    slot(1, { itemId: "item.bait_worms", name: "Bait Worms", categoryLabel: "bait", inventoryCategory: "fishing", quantity: 4 }),
    slot(2),
    slot(3, { itemId: "fish.trout", name: "Rainbow Trout", categoryLabel: "fish", inventoryCategory: "fishing", quantity: 1, isFish: true }),
    slot(4),
    slot(5)
  ]
};

const baseCard: ItemInspectionDto = {
  itemId: "seed.wheat",
  name: "Wheat Seed",
  categoryLabel: "seed",
  loreText: "A handful of pale grain, saved from last season.",
  stackLimit: 40,
  baseValue: 12,
  tags: ["grain"],
  rarity: null,
  agronomy: null,
  freshness: null
};

const render = (over: Partial<React.ComponentProps<typeof InventoryModal>> = {}): string =>
  renderToString(
    React.createElement(InventoryModal, {
      satchel,
      onClose: () => {},
      onSelectPlantCrop: () => {},
      onInspectPlanting: () => ({ valid: true }),
      ...over
    })
  );

const renderCard = (over: Partial<ItemInspectionDto> = {}): string =>
  renderToString(React.createElement(ItemInspectCard, { item: { ...baseCard, ...over } }));

describe("Milestone M4 — Satchel search, tidy & item inspect cards", () => {
  // ==========================================================================
  // R6.1 SEARCH & AUTO-SORT
  // ==========================================================================
  describe("R6.1 Satchel controls", () => {
    it("renders a search field alongside the existing category tabs", () => {
      const html = render();
      expect(html).toContain('data-testid="inventory-search"');
      expect(html).toContain('id="inventory-tab-all"');
      expect(html).toContain('data-testid="inventory-capacity"');
    });

    it("offers the tidy action only when the host can perform it", () => {
      // Without a handler the button would be a lie, so it must not render.
      expect(render()).not.toContain('data-testid="inventory-sort"');
      expect(render({ onSortSatchel: () => ({ success: true }) }))
        .toContain('data-testid="inventory-sort"');
    });

    it("matches items on name, category and the crop a seed grows", () => {
      const wheatSeed = satchel.slots[0];
      expect(matchesSatchelSearch(wheatSeed, "wheat")).toBe(true);
      expect(matchesSatchelSearch(wheatSeed, "seed")).toBe(true);
      // Found through the crop name even though the item is called "Wheat Seed".
      expect(matchesSatchelSearch(
        { itemId: "item.flour", name: "Flour", categoryLabel: "grain", cropName: "Wheat" },
        "wheat"
      )).toBe(true);
      expect(matchesSatchelSearch(wheatSeed, "trout")).toBe(false);
    });

    it("is case- and whitespace-insensitive, and an empty query keeps everything", () => {
      const trout = satchel.slots[3];
      expect(matchesSatchelSearch(trout, "TROUT")).toBe(true);
      expect(matchesSatchelSearch(trout, "  trout  ")).toBe(true);
      expect(matchesSatchelSearch(trout, "")).toBe(true);
      expect(matchesSatchelSearch(trout, "   ")).toBe(true);
    });

    it("never matches an empty slot once a query is typed", () => {
      const empty = satchel.slots[2];
      expect(matchesSatchelSearch(empty, "")).toBe(true);
      expect(matchesSatchelSearch(empty, "a")).toBe(false);
      // Not even against its own placeholder name.
      expect(matchesSatchelSearch(empty, "empty")).toBe(false);
    });

    it("labels the tidy action with what it actually does", () => {
      const html = render({ onSortSatchel: () => ({ success: true }) });
      expect(html).toMatch(/aria-label="Tidy the satchel[^"]*merge stacks/);
    });
  });

  // ==========================================================================
  // R6.4 RICH ITEM INSPECT CARDS
  // ==========================================================================
  describe("R6.4 Item inspect card", () => {
    it("shows base trade value, stack limit and lore text", () => {
      const html = renderCard();
      expect(html).toContain("12 G");
      expect(html).toContain("40");
      expect(html).toContain("A handful of pale grain");
    });

    it("frames the card by rarity, and stays unranked when content has no rank", () => {
      expect(renderCard()).toContain('data-rarity="plain"');
      expect(renderCard()).not.toContain('data-testid="item-inspect-rarity"');

      const prized = renderCard({
        rarity: { tier: "prized", label: "Prized", encounterWeight: 15 }
      });
      expect(prized).toContain('data-rarity="prized"');
      expect(prized).toContain("rarity--prized");
      expect(prized).toContain("Prized");
    });

    it("draws a freshness timeline with the storage that sets its rate", () => {
      const html = renderCard({
        freshness: { percent: 42, label: "Turning", storageLabel: "Sheltered hold", decayRate: 0.8 }
      });
      expect(html).toContain('data-testid="item-inspect-freshness"');
      expect(html).toContain("42% · Turning");
      expect(html).toContain("Sheltered hold");
      expect(html).toContain("0.80×");
      expect(html).toContain("width:42%");
    });

    it("omits the freshness block entirely for goods that do not spoil", () => {
      expect(renderCard()).not.toContain('data-testid="item-inspect-freshness"');
    });

    it("tones the freshness bar by how close the catch is to spoiling", () => {
      expect(freshnessToneFor(90)).toBe("good");
      expect(freshnessToneFor(60)).toBe("good");
      expect(freshnessToneFor(59)).toBe("caution");
      expect(freshnessToneFor(35)).toBe("caution");
      expect(freshnessToneFor(34)).toBe("danger");
      expect(freshnessToneFor(0)).toBe("danger");
    });

    it("lists the crop's growing requirements when the item grows something", () => {
      const html = renderCard({
        agronomy: {
          cropId: "crop.wheat",
          cropName: "Wheat",
          waterNeed: 35,
          growthMinutes: 2880,
          yieldMin: 2,
          yieldMax: 4,
          regrows: false,
          regrowMinutes: null,
          fertilityCost: 8,
          preferredClimates: ["climate.temperate"],
          neutralClimates: [],
          minimumFarmingXp: 0
        }
      });
      expect(html).toContain('data-testid="item-inspect-agronomy"');
      expect(html).toContain("Wheat");
      expect(html).toContain("35");
      expect(html).toContain("2d");
      expect(html).toContain("2–4");
      expect(html).toContain("temperate");
    });

    it("omits agronomy for an item that never grows", () => {
      expect(renderCard()).not.toContain('data-testid="item-inspect-agronomy"');
    });

    it("reads growth time in days and hours rather than raw minutes", () => {
      expect(formatGrowthDuration(2880)).toBe("2d");
      expect(formatGrowthDuration(1500)).toBe("1d 1h");
      expect(formatGrowthDuration(180)).toBe("3h");
      expect(formatGrowthDuration(45)).toBe("45m");
      expect(formatGrowthDuration(0)).toBe("—");
    });

    it("renders in flow when no cursor anchor is given", () => {
      const html = renderCard();
      expect(html).toContain('data-floating="false"');
      expect(html).not.toContain("is-floating");
    });
  });
});
