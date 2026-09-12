import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { Simulation } from "../../src/simulation/Simulation";
import { MarketModal } from "../../src/ui/MarketModal";
import { InventoryModal } from "../../src/ui/InventoryModal";
import { CharacterScreen } from "../../src/ui/CharacterScreen";
import { CraftingModal } from "../../src/ui/CraftingModal";
import { JournalModal } from "../../src/ui/JournalModal";
import { WorldMapModal } from "../../src/ui/components/WorldMapModal";
import { HowToPlayGuide } from "../../src/ui/components/HowToPlayGuide";
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
    onReleaseFishCargo: () => {},
    onDeliverContractItems: () => {},
    onDeliverFishCargo: () => {},
    onClose: () => {}
  };
}

describe("UI Modals Server/Unit Render", () => {
  it("renders MarketModal for village market without throwing", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(MarketModal, {
        ...marketProps(sim, "market.village")
      })
    );
    expect(html).toContain("Village Produce Market");
    expect(html).toContain("Wheat");
    expect(html).toContain("Fish Fertilizer");
    expect(html).toContain("Compost Starter");
  });

  it("renders MarketModal for harbor market without throwing", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(MarketModal, {
        ...marketProps(sim, "market.harbor")
      })
    );
    expect(html).toContain("Harbor Fish Market &amp; Wholesaler");
    expect(html).toContain("Crushed Ice");
  });

  it("renders InventoryModal without throwing", () => {
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
  });

  it("renders the six-slot character screen with local try-on and outfit controls", () => {
    const sim = new Simulation();
    const html = renderToString(React.createElement(CharacterScreen, {
      character: sim.inspectCharacterEquipment(),
      onClose: () => {},
      onEquipEquipment: () => ({ success: true }),
      onEquipRod: () => ({ success: true }),
      onSavePreset: () => ({ success: true }),
      onApplyPreset: () => ({ success: true }),
      onOpenSatchel: () => {},
      onOpenPause: () => {}
    }));
    expect(html).toContain("Character &amp; Gear");
    expect(html).toContain("Weathered Straw Hat");
    expect(html).toContain('class="atlas-image"');
    expect(html).toContain("Fishing Rod");
    expect(html).toContain("Current gear");
    expect(html).toContain("Field");
    expect(html).toContain("Sea");
  });

  it("renders every workbench recipe with materials, Work, duration, and lock states", () => {
    const sim = new Simulation();
    const station = sim.inspectProcessingStation("struct.workbench");
    if (!station) throw new Error("Missing workbench DTO");
    const html = renderToString(React.createElement(CraftingModal, {
      station,
      onClose: () => {},
      onStart: () => ({ success: true })
    }));
    expect(html).toContain("Workbench");
    expect(html).toContain("Weave Linen Roll");
    expect(html).toContain("Sew Field Hat");
    expect(html).toContain("Materials");
    expect(html).toContain("Work");
    expect(html).toContain("Duration");
    expect(html).toContain('class="atlas-image"');
    expect(html).toContain("Blocked");
    expect(html).not.toContain("<em>Missing</em>");
    expect(html).toContain("Locked");
  });

  it("renders JournalModal without throwing", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(JournalModal, {
        pages: sim.inspectJournalPages(),
        activeQuest: sim.questDomain.getActiveQuestDto(),
        skills: sim.inspectSkillProgress(),
        onClose: () => {}
      })
    );
    expect(html).toContain("Field Journal");
  });

  it("renders WorldMapModal without throwing", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(WorldMapModal, {
        map: sim.inspectWorldMap(),
        onInspectMarketDemand: (marketId) => sim.inspectMarketDemand(marketId),
        onClose: () => {}
      })
    );
    expect(html).toContain("Nautical Chart of Neva");
  });

  it("documents the live tool-slot map in the field guide", () => {
    const html = renderToString(React.createElement(HowToPlayGuide));
    expect(html).toContain("Hand Tools, Seeds, Watering Can, Fertilizer, Harvest Basket");
    // The belt changes with the stance, so the guide has to say so rather than
    // presenting one fixed list of five slots as the whole truth.
    expect(html).toContain("The belt changes with where you are standing");
    expect(html).not.toContain("Hoe, Seeds, Watering Can, Bait, Rod");
  });
});
