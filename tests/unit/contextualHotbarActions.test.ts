import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { GameApp } from "../../src/app/GameApp";
import { ModeController } from "../../src/app/ModeController";
import { Simulation } from "../../src/simulation/Simulation";
import type { EquippedToolId, GameCommand } from "../../src/simulation/core/contracts";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { FARMING_ACTION_COST } from "../../src/simulation/domains/FarmingDomain";
import { processingWorkForRecipe } from "../../src/simulation/domains/ProcessingDomain";
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
    isMountTransitionActive: () => false,
    pickPointedCropInteraction: () => null,
    handleCastFishing
  }) as {
    activeTool: EquippedToolId;
    selectToolSlot: (slot: number) => void;
    handlePrimaryUse: () => void;
    handleContextInteract: (requestedCrop?: { cropId: string; action: "harvest" | "water" | "fertilize" }) => void;
    resolveCropTarget: (cropId: string, action?: "harvest" | "water" | "fertilize") => { action: string; prompt: string } | null;
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

describe("contextual action contracts", () => {
  it("casts at fishable water without selecting a rod slot", () => {
    const { app, sim, handleCastFishing } = createAppHarness();
    moveToBank(sim);
    app.handlePrimaryUse();
    expect(handleCastFishing).toHaveBeenCalledExactlyOnceWith("primary");
    sim.state.player.x = 40;
    sim.state.player.z = -100;
    app.handlePrimaryUse();
    expect(handleCastFishing).toHaveBeenCalledTimes(1);
  });

  it("carries no belt while exploring, leaving the panels to the micro-menu", () => {
    const { app, sim, dispatchVirtualAction } = createAppHarness();
    sim.state.player.x = 40;
    sim.state.player.z = -100;
    expect(sim.inspectWorldHud().stance).toBe("explorer");
    expect(sim.inspectWorldHud().contextualHotbar).toEqual([]);
    // The five explorer sockets duplicated the bottom-right micro-menu, so the
    // number keys now do nothing rather than opening a panel twice over.
    for (const slot of [1, 2, 3, 4, 5]) app.selectToolSlot(slot);
    expect(dispatchVirtualAction).not.toHaveBeenCalled();
    expect(app.enterCropPlacement).not.toHaveBeenCalled();
    expect(app.activeTool).toBe("hands");
  });

  it("keeps a stable crop primary verb and exposes available alternatives", () => {
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
    app.activeTool = "watering-can";
    expect(app.resolveCropTarget(cropId)?.action).toBe("harvest");
    crop.stage = "growing";
    crop.effectiveGrowthMinutes = 90;
    expect(app.resolveCropTarget(cropId)?.action).toBe("water");
    InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [
      { itemId: "item.basic_fertilizer", quantity: 2 }
    ]);
    sim.state.farms[crop.farmId].soil.fertility = 40;
    expect(app.resolveCropTarget(cropId, "fertilize")?.action).toBe("fertilize");
    expect(app.resolveCropTarget(cropId, "harvest")).toBeNull();
  });

  it("runs an explicitly chosen crop verb only for the current target", () => {
    const { app, sim } = createAppHarness();
    sim.state.player.x = STARTER_FARM_LAYOUT.origin.x;
    sim.state.player.z = STARTER_FARM_LAYOUT.origin.z;
    const planted = sim.plantCropNearPlayer("farm.starter_garden", "crop.wheat");
    expect(planted.success).toBe(true);
    const cropId = planted.placedCropId!;
    const crop = sim.state.crops[cropId];
    crop.stage = "growing";
    crop.moisture = 10;
    sim.state.farms[crop.farmId].soil.fertility = 40;
    InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [
      { itemId: "item.basic_fertilizer", quantity: 1 }
    ]);
    expect(app.resolveCropTarget(cropId)?.action).toBe("water");
    const startFertilizeAction = vi.fn();
    const startCropAction = vi.fn();
    Object.assign(app, {
      pickInteraction: () => app.resolveCropTarget(cropId),
      facePlayerToward: vi.fn(),
      startFertilizeAction,
      startCropAction
    });
    app.handleContextInteract({ cropId: "another-crop", action: "fertilize" });
    expect(startFertilizeAction).not.toHaveBeenCalled();
    app.handleContextInteract({ cropId, action: "fertilize" });
    expect(startFertilizeAction).toHaveBeenCalledOnce();
    expect(startCropAction).not.toHaveBeenCalled();
    expect(app.activeTool).toBe("fertilizer");
  });

  it("offers free withered clearing without a Work charge even at zero Work", () => {
    const { app, sim } = createAppHarness();
    sim.state.player.x = STARTER_FARM_LAYOUT.origin.x;
    sim.state.player.z = STARTER_FARM_LAYOUT.origin.z;
    const planted = sim.plantCropNearPlayer("farm.starter_garden", "crop.wheat");
    expect(planted.success).toBe(true);
    sim.state.crops[planted.placedCropId!].stage = "withered";
    sim.state.player.workCapacity.current = 0;
    app.activeTool = "harvest";
    const target = app.resolveCropTarget(planted.placedCropId!);
    expect(target?.action).toBe("harvest");
    expect(target?.prompt).toContain("Clear Wheat");
    expect(target?.prompt).not.toContain("Work");
  });

  it("does not claim a wet growing crop needs Work when no action is due", () => {
    const { app, sim } = createAppHarness();
    sim.state.player.x = STARTER_FARM_LAYOUT.origin.x;
    sim.state.player.z = STARTER_FARM_LAYOUT.origin.z;
    const planted = sim.plantCropNearPlayer("farm.starter_garden", "crop.wheat");
    expect(planted.success).toBe(true);
    const crop = sim.state.crops[planted.placedCropId!];
    crop.stage = "growing";
    crop.moisture = 100;
    sim.state.player.workCapacity.current = 0;

    const target = app.resolveCropTarget(crop.id);
    expect(target?.action).toBe("inspect");
    expect(target?.prompt).not.toContain("Need 5 Work");
  });

  it("passes the current farming and recipe Work quotes into action admission", () => {
    const sim = new Simulation();
    sim.state.player.proficiencies.farming = 3000;
    const start = vi.spyOn(sim.actionTimeline, "start").mockImplementation((..._args: unknown[]) => true);
    const app = Object.assign(Object.create(GameApp.prototype), {
      sim,
      inputRouter: { setJumpBlocked: vi.fn(), consumeJumpRequest: vi.fn() },
      facePlayerToward: vi.fn()
    }) as {
      startFarmingAction: (action: "plant" | "processing-start", x: number, z: number, command: GameCommand) => boolean;
    };
    const plantCommand: GameCommand = {
      type: "crop.plant-near", farmId: "farm.starter_garden", cropId: "crop.wheat"
    };
    expect(app.startFarmingAction("plant", 0, 0, plantCommand)).toBe(true);
    expect(start.mock.calls[0]?.[5]).toBe(sim.quoteWorkCost(
      FARMING_ACTION_COST.plant, "farming", "farming.plant"
    ).cost);

    const recipe = [...ContentRegistry.recipes.values()].find((entry) => entry.workTier === "masterwork")!;
    const processingCommand: GameCommand = {
      type: "processing.start", recipeId: recipe.id, stationId: "struct.workbench"
    };
    expect(app.startFarmingAction("processing-start", 0, 0, processingCommand)).toBe(true);
    expect(start.mock.calls[1]?.[5]).toBe(sim.quoteWorkCost(
      processingWorkForRecipe(recipe), "processing", "processing.start"
    ).cost);
  });

  it("keeps planting placement open when the quoted Work is unavailable", () => {
    const sim = new Simulation();
    sim.state.player.workCapacity.current = 0;
    const setToast = vi.fn();
    const startFarmingAction = vi.fn();
    const app = Object.assign(Object.create(GameApp.prototype), {
      sim,
      modeController: new ModeController("farm-placement"),
      selectedCropId: "crop.wheat",
      placementResult: { valid: true },
      refreshCropPlacementAtPointer: () => ({ valid: true }),
      setToast,
      startFarmingAction
    }) as { confirmCropPlacement: () => void };
    app.confirmCropPlacement();
    const quote = sim.quoteWorkCost(FARMING_ACTION_COST.plant, "farming", "farming.plant");
    expect(setToast).toHaveBeenCalledWith(expect.stringContaining(`Need ${quote.cost} Work to plant`));
    expect(startFarmingAction).not.toHaveBeenCalled();
  });

  it("uses rod, lure and stores actions aboard a vessel rather than farming actions", () => {
    const { app, sim, dispatchVirtualAction, modeController } = createAppHarness();
    sim.state.player.activeBoatId = "boat.player_rowboat";
    modeController.setGameplayMode("boat-driving");
    app.selectToolSlot(2);
    expect(app.activeTool).toBe("fishing-rod");
    app.selectToolSlot(3);
    app.selectToolSlot(4);
    // One hold shortcut, not three sockets that all opened the same ledger.
    expect(dispatchVirtualAction.mock.calls.map(([action]) => action)).toEqual([
      "fishing.toggle-lure", "open-ledger"
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
    expect("meter" in farming[2]).toBe(false);
    InventoryManager.addItemsAtomically(sim.state.inventories["inv.rowboat_supply"], [
      { itemId: "item.basic_lure", quantity: 2 }
    ]);
    expect(buildContextualHotbar(sim.state, "angling", null)[1].ready).toBe(false);
    expect(buildContextualHotbar(sim.state, "explorer", null)).toEqual([]);
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
