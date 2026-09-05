import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { GameApp } from "../../src/app/GameApp";
import { ModeController } from "../../src/app/ModeController";
import { Simulation } from "../../src/simulation/Simulation";
import type { EquippedToolId } from "../../src/simulation/core/contracts";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { buildContextualHotbar, buildStatusChips, buildWorldHudDto } from "../../src/simulation/presentation/WorldHudPresentation";
import { WorldLayout } from "../../src/world/WorldLayout";
import { STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { MaritimeVesselConsole } from "../../src/ui/components/MaritimeVesselConsole";
import { SmartContextualToolbar } from "../../src/ui/hud/SmartContextualToolbar";

function createAppHarness() {
  const sim = new Simulation();
  const modeController = new ModeController("on-foot");
  const dispatchVirtualAction = vi.fn();
  const handleCastFishing = vi.fn();
  const app = Object.assign(Object.create(GameApp.prototype), {
    sim,
    modeController,
    inputRouter: { dispatchVirtualAction },
    activeTool: "hands",
    selectedCropId: null,
    notify: vi.fn(),
    enterCropPlacement: vi.fn(),
    exitCropPlacement: vi.fn(),
    farmingActions: { isActive: false },
    isMountTransitionActive: () => false,
    pickPointedCropInteraction: () => null,
    handleCastFishing
  }) as {
    activeTool: EquippedToolId;
    selectToolSlot: (slot: number) => void;
    handlePrimaryUse: () => void;
    resolveCropTarget: (cropId: string) => { action: string } | null;
    enterCropPlacement: ReturnType<typeof vi.fn>;
  };
  return { app, sim, modeController, dispatchVirtualAction, handleCastFishing };
}

function moveToBank(sim: Simulation): void {
  const river = WorldLayout.riverSectionAt(38);
  sim.state.player.x = river.centerX - river.leftWaterWidth - 2;
  sim.state.player.z = 38;
  expect(sim.inspectWorldHud().stance).toBe("angling");
}

describe("contextual toolbar action contracts", () => {
  it("arms fishing from Fishing Rod and stops casting after Stow Gear", () => {
    const { app, sim, handleCastFishing } = createAppHarness();
    moveToBank(sim);
    app.selectToolSlot(1);
    expect(app.activeTool).toBe("fishing-rod");
    app.handlePrimaryUse();
    expect(handleCastFishing).toHaveBeenCalledExactlyOnceWith("primary");
    app.selectToolSlot(5);
    expect(app.activeTool).toBe("hands");
    app.handlePrimaryUse();
    expect(handleCastFishing).toHaveBeenCalledTimes(1);
  });

  it("opens explorer panels through existing input actions without planting", () => {
    const { app, sim, dispatchVirtualAction } = createAppHarness();
    sim.state.player.x = 40;
    sim.state.player.z = -100;
    expect(sim.inspectWorldHud().stance).toBe("explorer");
    for (const slot of [1, 2, 3, 4, 5]) app.selectToolSlot(slot);
    expect(dispatchVirtualAction.mock.calls.map(([action]) => action)).toEqual([
      "open-inventory", "open-map", "open-planning", "open-ledger", "open-journal"
    ]);
    expect(app.enterCropPlacement).not.toHaveBeenCalled();
    expect(app.activeTool).toBe("hands");
  });

  it("arms harvest, watering and fertilizer without slot identities leaking", () => {
    const { app, sim } = createAppHarness();
    sim.state.player.x = STARTER_FARM_LAYOUT.origin.x;
    sim.state.player.z = STARTER_FARM_LAYOUT.origin.z;
    const planted = sim.plantCropNearPlayer("farm.starter_garden", "crop.wheat");
    expect(planted.success).toBe(true);
    const cropId = planted.placedCropId!;
    const crop = sim.state.crops[cropId];
    crop.stage = "mature";
    crop.effectiveGrowthMinutes = 180;
    crop.moisture = 10;
    app.selectToolSlot(5);
    expect(app.activeTool).toBe("harvest");
    expect(app.resolveCropTarget(cropId)?.action).toBe("harvest");
    crop.stage = "growing";
    crop.effectiveGrowthMinutes = 90;
    app.selectToolSlot(3);
    expect(app.activeTool).toBe("watering-can");
    expect(app.resolveCropTarget(cropId)?.action).toBe("water");
    InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [
      { itemId: "item.basic_fertilizer", quantity: 2 }
    ]);
    sim.state.farms[crop.farmId].soil.fertility = 40;
    app.selectToolSlot(4);
    expect(app.activeTool).toBe("fertilizer");
    expect(app.resolveCropTarget(cropId)?.action).toBe("fertilize");
  });

  it("uses rod, lure and stores actions aboard a vessel rather than farming actions", () => {
    const { app, sim, dispatchVirtualAction, modeController } = createAppHarness();
    sim.state.player.activeBoatId = "boat.player_rowboat";
    modeController.setGameplayMode("boat-driving");
    app.selectToolSlot(2);
    expect(app.activeTool).toBe("fishing-rod");
    app.selectToolSlot(3);
    app.selectToolSlot(4);
    app.selectToolSlot(5);
    expect(dispatchVirtualAction.mock.calls.map(([action]) => action)).toEqual([
      "fishing.toggle-lure", "open-ledger", "open-ledger"
    ]);
    app.selectToolSlot(1);
    expect(app.activeTool).toBe("hands");
    expect(app.enterCropPlacement).not.toHaveBeenCalled();
  });

  it("keeps active fishing and modal guards on mouse toolbar actions", () => {
    const { app, sim, modeController, dispatchVirtualAction } = createAppHarness();
    moveToBank(sim);
    modeController.setGameplayMode("basic-fishing");
    app.selectToolSlot(1);
    app.selectToolSlot(2);
    expect(app.activeTool).toBe("hands");
    expect(dispatchVirtualAction).not.toHaveBeenCalled();
    modeController.setGameplayMode("on-foot");
    modeController.open("dialogue");
    app.selectToolSlot(1);
    expect(app.activeTool).toBe("hands");
  });

  it("reports actual fertilizer and accessible vessel tackle without fictitious resources", () => {
    const { sim } = createAppHarness();
    InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [
      { itemId: "item.basic_fertilizer", quantity: 3 }
    ]);
    const farming = buildContextualHotbar(sim.state, "agronomy", null);
    expect(farming[3]).toMatchObject({ quantity: 3, ready: true, detail: "Basic Fertilizer (3)" });
    expect(farming[2].meter).toBeUndefined();
    InventoryManager.addItemsAtomically(sim.state.inventories["inv.rowboat_supply"], [
      { itemId: "item.basic_lure", quantity: 2 }
    ]);
    expect(buildContextualHotbar(sim.state, "angling", null)[1].ready).toBe(false);
    sim.state.player.activeBoatId = "boat.player_rowboat";
    expect(buildContextualHotbar(sim.state, "maritime", null)[2]).toMatchObject({ quantity: 2, ready: true });
    sim.state.weather.type = "storm";
    sim.state.clock.timeOfDay = "night";
    expect(buildStatusChips(sim.state).map((chip) => chip.id)).not.toContain("rain-soaked");
    expect(buildStatusChips(sim.state).map((chip) => chip.id)).not.toContain("night-water-chill");
  });

  it("does not falsely name a selected tool after a stance change", () => {
    const { sim } = createAppHarness();
    const html = renderToString(React.createElement(SmartContextualToolbar, {
      stance: "angling",
      hotbar: buildContextualHotbar(sim.state, "angling", null),
      activeSlot: 0
    }));
    expect(html).not.toContain("hud-tool-belt-name");
    expect(html).not.toContain('aria-pressed="true"');
  });
});

describe("vessel cargo presentation", () => {
  it("shows built-in and accessible loose ice for the actual slot types", () => {
    const { sim } = createAppHarness();
    const rowboat = sim.state.boats["boat.player_rowboat"];
    sim.state.boats["boat.player_skiff"] = {
      ...rowboat, id: "boat.player_skiff", boatTypeId: "boat.skiff",
      fishCargoSlotIds: Array(6).fill(null), supplyInventoryId: "inv.skiff_supply", isDocked: false
    };
    sim.state.inventories["inv.skiff_supply"] = InventoryManager.createInventory("inv.skiff_supply", 8);
    sim.state.player.activeBoatId = "boat.player_skiff";
    const boat = buildWorldHudDto(sim.state).boat!;
    expect(boat.cargoSlots.map((slot) => slot.slotType)).toEqual([
      "hold", "hold", "hold", "hold", "external-hook", "external-hook"
    ]);
    expect(boat.cargoSlots.map((slot) => slot.hasIce)).toEqual([true, true, false, false, false, false]);
    const html = renderToString(React.createElement(MaritimeVesselConsole, { boat }));
    expect(html.match(/cargo-ice-indicator/g)).toHaveLength(2);
    InventoryManager.addItemsAtomically(sim.state.inventories["inv.skiff_supply"], [
      { itemId: "item.crushed_ice", quantity: 1 }
    ]);
    expect(buildWorldHudDto(sim.state).boat!.cargoSlots.every((slot) => slot.hasIce)).toBe(true);
    sim.state.player.activeBoatId = rowboat.id;
    expect(buildWorldHudDto(sim.state).boat!.cargoSlots.some((slot) => slot.hasIce)).toBe(false);
    InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [
      { itemId: "item.crushed_ice", quantity: 1 }
    ]);
    expect(buildWorldHudDto(sim.state).boat!.cargoSlots.every((slot) => slot.hasIce)).toBe(true);
  });

  it("uses slot metadata rather than inferring a hook from slot number", () => {
    const { sim } = createAppHarness();
    sim.state.player.activeBoatId = "boat.player_rowboat";
    const boat = buildWorldHudDto(sim.state).boat!;
    boat.isDocked = false;
    boat.cargoSlots = [
      { slotNumber: 1, slotType: "external-hook", hasIce: true, cargo: null },
      { slotNumber: 5, slotType: "hold", hasIce: false, cargo: null }
    ];
    const html = renderToString(React.createElement(MaritimeVesselConsole, { boat }));
    expect(html).toContain('aria-label="Empty transom hook 1"');
    expect(html).toContain('aria-label="Empty hold bay 5"');
    expect(html.match(/cargo-ice-indicator/g)).toHaveLength(1);
  });
});
