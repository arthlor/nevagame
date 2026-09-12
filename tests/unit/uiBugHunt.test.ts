import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { HowToPlayGuide } from "../../src/ui/components/HowToPlayGuide";
import { AlmanacPage } from "../../src/ui/components/AlmanacPage";
import { DialogueModal } from "../../src/ui/DialogueModal";
import { PlantingSeedBar } from "../../src/ui/components/PlantingSeedBar";
import { plantingSeedHotkeyIndex } from "../../src/ui/components/PlantingSeedBar";
import { JournalModal } from "../../src/ui/JournalModal";
import { Simulation } from "../../src/simulation/Simulation";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import type { AlmanacDto, SeedBeltDto } from "../../src/simulation/core/contracts";
import type { CropQuality } from "../../src/simulation/core/types";

describe("UI Bug Hunt Regression Tests", () => {
  describe("P0: HowToPlayGuide lead paragraph styling", () => {
    it("renders chapter lead paragraphs with guide-lead class", () => {
      const html = renderToString(React.createElement(HowToPlayGuide));
      expect(html).toContain('class="guide-lead"');
      const source = readFileSync(new URL("../../src/ui/components/HowToPlayGuide.tsx", import.meta.url), "utf8");
      expect(source.match(/className="guide-lead"/g) ?? []).toHaveLength(4);
      expect(html).toContain("Follow the prompt above your tools");
    });
  });

  describe("P2: AlmanacPage WAI-ARIA tab/tabpanel accessibility", () => {
    const mockAlmanac: AlmanacDto = {
      discoveredFish: 1,
      totalFish: 5,
      discoveredCrops: 1,
      totalCrops: 4,
      fish: [
        {
          speciesId: "fish.mackerel",
          name: "Coastal Mackerel",
          discovered: true,
          rarityLabel: "Common",
          isSportFish: false,
          habitatsLabel: "Coastal",
          seasonsLabel: "All seasons",
          timeWindowsLabel: "All day",
          rodClassLabel: "Standard",
          weightKg: { min: 1.2, average: 1.8, max: 2.5 },
          baseMarketValue: 12,
          caughtCount: 3,
          bestWeightKg: 2.3
        }
      ],
      crops: [
        {
          cropId: "crop.wheat",
          name: "Wheat",
          discovered: true,
          regrows: false,
          climatesLabel: "Temperate",
          growthMinutes: 120,
          waterNeed: 40,
          yieldMin: 2,
          yieldMax: 4,
          harvestedCount: 5,
          bestQuality: "fine" as CropQuality
        }
      ]
    };

    it("renders tabs with id and aria-controls pointing to tabpanel", () => {
      const html = renderToString(React.createElement(AlmanacPage, { almanac: mockAlmanac }));
      expect(html).toContain('id="almanac-strand-tab-fish"');
      expect(html).toContain('aria-controls="almanac-strand-panel-fish"');
      expect(html).toContain('id="almanac-strand-tab-crops"');
      expect(html).toContain('aria-controls="almanac-strand-panel-crops"');
    });

    it("renders tabpanel with role='tabpanel' and aria-labelledby", () => {
      const html = renderToString(React.createElement(AlmanacPage, { almanac: mockAlmanac }));
      expect(html).toContain('role="tabpanel"');
      expect(html).toContain('id="almanac-strand-panel-fish"');
      expect(html).toContain('aria-labelledby="almanac-strand-tab-fish"');
      expect(html).toContain('class="almanac-tabpanel"');
    });
  });

  describe("P1: DialogueModal overlay class and keyboard isolation", () => {
    it("renders modal-overlay and dialogue-backdrop classes on root container", () => {
      const firstNpc = Array.from(ContentRegistry.npcs.values())[0];
      const html = renderToString(
        React.createElement(DialogueModal, {
          npcId: firstNpc.id,
          onClose: () => {},
          onTalkNpc: () => ({ success: true, dialogue: ["Greetings traveler."] }),
          activeQuest: null
        })
      );
      expect(html).toContain("modal-overlay");
      expect(html).toContain("dialogue-backdrop");
    });
  });

  describe("P1: PlantingSeedBar keyboard navigation & accessibility", () => {
    const mockSeedBelt: SeedBeltDto = {
      seeds: [
        {
          cropId: "crop.turnip",
          seedItemId: "item.seed.turnip",
          name: "Turnip Seeds",
          count: 5,
          preferredClimates: ["temperate"]
        },
        {
          cropId: "crop.carrot",
          seedItemId: "item.seed.carrot",
          name: "Carrot Seeds",
          count: 3,
          preferredClimates: ["temperate"]
        }
      ]
    };

    it("renders seed hotkey badges for slots [1] and [2]", () => {
      const html = renderToString(
        React.createElement(PlantingSeedBar, {
          seedBelt: mockSeedBelt,
          selectedCropId: "crop.turnip",
          onSelectCrop: () => {},
          onCancel: () => {}
        })
      );
      expect(html).toContain("seed-hotkey-badge");
      expect(html).toContain("1");
      expect(html).toContain("2");
      expect(html).toContain("Cancel Planting (ESC)");
    });

    it("resolves both physical digit codes and printable digit keys", () => {
      expect(plantingSeedHotkeyIndex({ code: "Digit1", key: "" })).toBe(0);
      expect(plantingSeedHotkeyIndex({ code: "Digit9", key: "9" })).toBe(8);
      expect(plantingSeedHotkeyIndex({ code: "Numpad1", key: "1" })).toBe(0);
      expect(plantingSeedHotkeyIndex({ code: "KeyE", key: "e" })).toBeNull();
    });
  });

  describe("P1: JournalModal folio state initialization", () => {
    it("renders with story folio as default", () => {
      const sim = new Simulation();
      const html = renderToString(
        React.createElement(JournalModal, {
          pages: sim.inspectJournalPages(),
          activeQuest: null,
          skills: [],
          onClose: () => {}
        })
      );
      expect(html).toContain("journal-chronicle-modal");
      expect(html).toContain("Story");
    });

    it("renders with custom initialFolio", () => {
      const sim = new Simulation();
      const html = renderToString(
        React.createElement(JournalModal, {
          pages: sim.inspectJournalPages(),
          activeQuest: null,
          skills: [],
          initialFolio: "guide",
          onClose: () => {}
        })
      );
      expect(html).toContain('aria-labelledby="guide-tab-actions"');
    });
  });
});
