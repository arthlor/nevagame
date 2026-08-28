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

describe("Milestone M3 ornate modal presentation", () => {
  it("renders inventory satchel with velvet slots, capacity gauge, and category ribbons", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(InventoryModal, {
        state: sim.state,
        onClose: () => {},
        onSelectPlantCrop: () => {}
      })
    );

    expect(html).toContain("Guild Satchel");
    expect(html).toContain("inventory-satchel-modal");
    expect(html).toContain("chrome-slot");
    expect(html).toContain('data-testid="inventory-capacity"');
    expect(html).toContain("Farming");
    expect(html).toContain("Supplies");
    expect(html).toContain("Satchel capacity");
  });

  it("renders market buy stall with shopkeeper header, purse, and stall tabs", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(MarketModal, {
        state: sim.state,
        marketId: "market.village",
        onSellItem: () => {},
        onBuySeed: () => {},
        onSellFishCargo: () => {},
        onDiscardFishCargo: () => {},
        onDeliverContractItems: () => {},
        onDeliverFishCargo: () => {},
        onClose: () => {}
      })
    );

    expect(html).toContain("Village Produce Market");
    expect(html).toContain("The grocer wipes the counter");
    expect(html).toContain('data-testid="market-stall-tabs"');
    expect(html).toContain('data-testid="market-purse"');
    expect(html).toContain("Wheat");
    expect(html).toContain("Fish Fertilizer");
    expect(html).toContain("Buy");
    expect(html).toContain("Sell");
    expect(html).not.toContain("Docked Fish");
  });

  it("renders harbor market buy stall with crushed ice and a docked-fish tab", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(MarketModal, {
        state: sim.state,
        marketId: "market.harbor",
        onSellItem: () => {},
        onBuySeed: () => {},
        onSellFishCargo: () => {},
        onDiscardFishCargo: () => {},
        onDeliverContractItems: () => {},
        onDeliverFishCargo: () => {},
        onClose: () => {}
      })
    );

    expect(html).toContain("Harbor Fish Market &amp; Wholesaler");
    expect(html).toContain("Crushed Ice");
    expect(html).toContain("Docked Fish");
    expect(html).toContain("Market Intelligence");
  });

  it("sells from owned satchel rows only and opens a quantity ticket", () => {
    const empty = new Simulation();
    const emptySell = renderToString(
      React.createElement(MarketModal, {
        state: empty.state,
        marketId: "market.village",
        initialStallTab: "sell",
        onSellItem: () => {},
        onBuySeed: () => {},
        onSellFishCargo: () => {},
        onDiscardFishCargo: () => {},
        onDeliverContractItems: () => {},
        onDeliverFishCargo: () => {},
        onClose: () => {}
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
        state: stocked.state,
        marketId: "market.village",
        initialStallTab: "sell",
        onSellItem: () => {},
        onBuySeed: () => {},
        onSellFishCargo: () => {},
        onDiscardFishCargo: () => {},
        onDeliverContractItems: () => {},
        onDeliverFishCargo: () => {},
        onClose: () => {}
      })
    );

    expect(wheatSell).toContain('aria-label="Select Harvested Wheat"');
    expect(wheatSell).toContain("Sell all of this item");
    expect(wheatSell).toContain("Sell all produce");
    expect(wheatSell).not.toContain('aria-label="Select Harvested Barley"');
  });

  it("renders journal folio tabs, open-horizons quest state, and mystery bestiary wells", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(JournalModal, {
        state: sim.state,
        onClose: () => {},
        initialFolio: "bestiary"
      })
    );

    expect(html).toContain("Guild Chronicle &amp; Bestiary");
    expect(html).toContain('data-testid="journal-folio-tabs"');
    expect(html).toContain("Chronicles &amp; Errands");
    expect(html).toContain("Unknown Species");
    expect(html).toContain("bestiary-silhouette-icon");
    expect(html).toContain("bestiary-entry-card is-mystery");
  });

  it("renders How to Play inside the journal without parchment ink tokens", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(JournalModal, {
        state: sim.state,
        onClose: () => {},
        initialFolio: "guide"
      })
    );

    expect(html).toContain("How to Play");
    expect(html).toContain("guide-body-copy");
    expect(html).not.toContain("--ui-ink-soft");
  });

  it("renders world map lenses, player beacon, and compass rose", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(WorldMapModal, {
        state: sim.state,
        onClose: () => {}
      })
    );

    expect(html).toContain("Illuminated Realm of Neva");
    expect(html).toContain('data-testid="map-lenses"');
    expect(html).toContain("Geography");
    expect(html).toContain("Trade Guilds");
    expect(html).toContain("Fishing Grounds");
    expect(html).toContain("Farmlands");
    expect(html).toContain("YOU");
    expect(html).toContain("map-compass-rose");
  });

  it("renders how-to-play chapter ribbons", () => {
    const html = renderToString(React.createElement(HowToPlayGuide));
    expect(html).toContain("Controls &amp; Basics");
    expect(html).toContain("Farming &amp; Irrigation");
    expect(html).toContain("guidebook-subtabs");
    expect(html).not.toContain("--ui-ink-soft");
    expect(html).toContain("guide-body-copy");
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
