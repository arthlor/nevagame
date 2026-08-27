import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { Simulation } from "../../src/simulation/Simulation";
import { MarketModal } from "../../src/ui/MarketModal";
import { InventoryModal } from "../../src/ui/InventoryModal";
import { JournalModal } from "../../src/ui/JournalModal";
import { WorldMapModal } from "../../src/ui/components/WorldMapModal";

describe("UI Modals Server/Unit Render", () => {
  it("renders MarketModal for village market without throwing", () => {
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
    expect(html).toContain("Wheat");
    expect(html).toContain("Fish Fertilizer");
  });

  it("renders MarketModal for harbor market without throwing", () => {
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
  });

  it("renders InventoryModal without throwing", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(InventoryModal, {
        state: sim.state,
        onClose: () => {},
        onSelectPlantCrop: () => {}
      })
    );
    expect(html).toContain("Guild Satchel");
  });

  it("renders JournalModal without throwing", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(JournalModal, {
        state: sim.state,
        onClose: () => {}
      })
    );
    expect(html).toContain("Guild Chronicle &amp; Bestiary");
  });

  it("renders WorldMapModal without throwing", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(WorldMapModal, {
        state: sim.state,
        onClose: () => {}
      })
    );
    expect(html).toContain("Illuminated Realm of Neva");
  });
});
