import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryModal } from "../../src/ui/InventoryModal";
import { MarketModal } from "../../src/ui/MarketModal";
import { JournalModal } from "../../src/ui/JournalModal";
import { WorldMapModal } from "../../src/ui/components/WorldMapModal";
import { HowToPlayGuide } from "../../src/ui/components/HowToPlayGuide";
import { playUiSound } from "../../src/ui/audio/uiAudio";
import { gameAudio } from "../../src/audio/AudioManager";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import type { MarketId } from "../../src/simulation/core/types";

function marketProps(sim: Simulation, marketId: MarketId) {
  const market = ContentRegistry.markets.get(marketId)!;
  sim.state.player.x = market.interactionPosition.x;
  sim.state.player.z = market.interactionPosition.z;
  return {
    board: sim.inspectMarketBoard(marketId),
    onSellItem: () => {},
    onSellAllProduce: () => {},
    onInspectCommodity: (id: MarketId, itemId: string, intent: "buy" | "sell" = "sell", quantity = 1) =>
      sim.inspectCommodityAtMarket(id, itemId, intent, quantity),
    onBuySeed: () => {},
    onBuyItem: () => {},
    onBuyRod: () => {},
    onEquipRod: () => {},
    onSellFishCargo: () => {},
    onSellAllFishCargo: () => {},
    onDiscardFishCargo: () => {},
    onDeliverContractItems: () => {},
    onDeliverFishCargo: () => {},
    onClose: () => {}
  };
}

describe("Milestone M3 ornate modal presentation", () => {
  it("renders inventory satchel with velvet slots, capacity gauge, and category ribbons", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(InventoryModal, {
        satchel: sim.inspectSatchel(),
        onClose: () => {},
        onSelectPlantCrop: () => {},
        onInspectPlanting: () => ({ valid: false })
      })
    );

    expect(html).toContain("Satchel");
    expect(html).toContain("inventory-satchel-modal");
    expect(html).toContain("chrome-slot");
    expect(html).toContain('data-testid="inventory-capacity"');
    expect(html).toContain("Field");
    expect(html).toContain("Supplies");
    expect(html).toContain("Satchel capacity");
  });

  it("renders market buy stall with shopkeeper header, purse, and stall tabs", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(MarketModal, {
        ...marketProps(sim, "market.village")
      })
    );

    expect(html).toContain("Village Produce Market");
    expect(html).toContain("The grocer wipes the counter");
    expect(html).toContain('data-testid="market-ledger-index"');
    expect(html).toContain('data-testid="market-purse"');
    expect(html).toContain("Wheat");
    expect(html).toContain("Fish Fertilizer");
    expect(html).toContain("Buy");
    expect(html).toContain("Your goods");
    expect(html).not.toContain("Docked Fish");
  });

  it("renders harbor market buy stall with crushed ice and a docked-fish tab", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(MarketModal, {
        ...marketProps(sim, "market.harbor")
      })
    );

    expect(html).toContain("Harbor Fish Market &amp; Wholesaler");
    expect(html).toContain("Crushed Ice");
    expect(html).toContain("Fish hold");
    expect(html).toContain("Harbor Supplies");
    expect(html).not.toContain("Market Intelligence");
  });

  it("sells from owned satchel rows only and opens a quantity ticket", () => {
    const empty = new Simulation();
    const emptySell = renderToString(
      React.createElement(MarketModal, {
        ...marketProps(empty, "market.village"),
        initialSection: "sell",
      })
    );

    expect(emptySell).toContain("Bait Worms");
    expect(emptySell).not.toContain("Sell all produce");
    expect(emptySell).toContain('data-testid="market-sell-list"');
    expect(emptySell).toContain('data-testid="market-sell-ticket"');
    expect(emptySell).toContain("Sale ticket");
    expect(emptySell).toContain('aria-label="Select Bait Worms"');
    expect(emptySell).not.toContain('aria-label="Select Harvested Barley"');
    expect(emptySell).not.toContain('aria-label="Select Harvested Wheat"');
    expect(emptySell).not.toContain("Trade Goods at this Stall");

    const stocked = new Simulation();
    const inv = stocked.state.inventories[stocked.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inv, [{ itemId: "produce.wheat", quantity: 12 }]);
    const wheatSell = renderToString(
      React.createElement(MarketModal, {
        ...marketProps(stocked, "market.village"),
        initialSection: "sell",
      })
    );

    expect(wheatSell).toContain('aria-label="Select Harvested Wheat"');
    expect(wheatSell).toContain("Sell all of this item");
    expect(wheatSell).toContain("Sell all produce");
    expect(wheatSell).not.toContain('aria-label="Select Harvested Barley"');
  });

  it("renders journal folio tabs and the current story page", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(JournalModal, {
        pages: sim.inspectJournalPages(),
        activeQuest: sim.questDomain.getActiveQuestDto(),
        skills: sim.inspectSkillProgress(),
        onClose: () => {},
        initialFolio: "story"
      })
    );

    expect(html).toContain("Field Journal");
    expect(html).toContain("journal-folio-tabs");
    expect(html).toContain("Story");
    expect(html).toContain("Guide");
  });

  it("renders How to Play inside the journal without parchment ink tokens", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(JournalModal, {
        pages: sim.inspectJournalPages(),
        activeQuest: sim.questDomain.getActiveQuestDto(),
        skills: sim.inspectSkillProgress(),
        onClose: () => {},
        initialFolio: "guide"
      })
    );

    expect(html).toContain("Guide");
    expect(html).toContain("Working along the coast");
    expect(html).toContain("guidebook-subtabs");
    expect(html).not.toContain("--ui-ink-soft");
  });

  it("renders world map lenses, player beacon, and compass rose", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(WorldMapModal, {
        map: sim.inspectWorldMap(),
        onInspectMarketDemand: (marketId) => sim.inspectMarketDemand(marketId),
        onClose: () => {}
      })
    );

    expect(html).toContain("Nautical Chart of Neva");
    expect(html).toContain('data-testid="map-lenses"');
    expect(html).toContain("Chart");
    expect(html).toContain("Markets");
    expect(html).toContain("Fishing notes");
    expect(html).toContain("Farms");
    expect(html).toContain("YOU");
    expect(html).toContain("map-compass-rose");
  });

  it("renders how-to-play chapter ribbons", () => {
    const html = renderToString(React.createElement(HowToPlayGuide));
    expect(html).toContain("Actions");
    expect(html).toContain("Field");
    expect(html).toContain("guidebook-subtabs");
    expect(html).not.toContain("--ui-ink-soft");
    expect(html).toContain("guide-lead");
  });

  it("keeps UI audio presentation-only for modal cues", () => {
    const playOneShotSpy = vi.spyOn(gameAudio, "playOneShot").mockImplementation(() => {});
    playUiSound("page-turn");
    playUiSound("coins");
    expect(playOneShotSpy).toHaveBeenCalledWith("page-turn");
    expect(playOneShotSpy).toHaveBeenCalledWith("coins");
    playOneShotSpy.mockRestore();
  });
});
