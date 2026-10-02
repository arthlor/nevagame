import { afterEach, describe, expect, it, vi } from "vitest";
import { GameApp } from "../../src/app/GameApp";
import { ModeController } from "../../src/app/ModeController";
import { localeStore } from "../../src/i18n/localeStore";
import type { QuestPointerTarget } from "../../src/ui/hud/QuestPointerOverlay";

afterEach(() => localeStore.set("en"));

function harness() {
  const modeController = new ModeController("on-foot");
  const target = { x: 0, y: 2, z: -5, label: "Starter Farm Field", distanceMeters: 100 };
  const app = Object.assign(Object.create(GameApp.prototype), {
    modeController,
    startupState: { status: "ready" },
    mobileOrientationBlocked: false,
    benchmarkView: false,
    sim: { clock: { setPaused: vi.fn() }, questDomain: { getActiveQuestDto: () => ({ targetLocation: { x: target.x, z: target.z, name: target.label }, targetDistanceMeters: 100 }) } },
    inputRouter: { setWorldInputSuspended: vi.fn(), setLocomotionWhileSuspended: vi.fn() },
    cancelDoorTransition: vi.fn(),
    questPointer: { hide: vi.fn() },
    questPointerTarget: target,
    worldScene: { setQuestWaypoint: vi.fn(), setFarmQuestHighlight: vi.fn() }
  }) as {
    syncOverlayState(): void;
    syncQuestGuidance(): void;
    questPointerTarget: QuestPointerTarget | null;
    mobileOrientationBlocked: boolean;
    questPointer: { hide: ReturnType<typeof vi.fn> };
    worldScene: { setQuestWaypoint: ReturnType<typeof vi.fn>; setFarmQuestHighlight: ReturnType<typeof vi.fn> };
  };
  return { app, modeController };
}

describe("quest guidance overlay ownership", () => {
  it.each(["ledger", "inventory", "journal", "pause", "dialogue"] as const)("hides cached guidance for %s and rebuilds after closing", (modal) => {
    const { app, modeController } = harness();
    modeController.open(modal);
    app.syncOverlayState();
    expect(app.questPointer.hide).toHaveBeenCalledOnce();
    expect(app.questPointerTarget).toBeNull();
    expect(app.worldScene.setQuestWaypoint).toHaveBeenLastCalledWith(null);
    expect(app.worldScene.setFarmQuestHighlight).toHaveBeenLastCalledWith(null);
    modeController.closeActive();
    app.syncOverlayState();
    app.syncQuestGuidance();
    expect(app.questPointerTarget?.label).toBe("Starter Farm Field");
    expect(app.worldScene.setQuestWaypoint).toHaveBeenLastCalledWith(expect.objectContaining({ x: 0, z: -5 }));
  });

  it("suppresses guidance while the landscape orientation gate blocks play", () => {
    const { app } = harness();
    app.mobileOrientationBlocked = true;
    app.syncOverlayState();
    expect(app.questPointerTarget).toBeNull();
    expect(app.questPointer.hide).toHaveBeenCalledOnce();
  });

  it("localizes the same destination used by the HUD and journal", () => {
    const { app } = harness();
    localeStore.set("tr");
    app.syncQuestGuidance();
    expect(app.questPointerTarget?.label).toBe("Ata Çiftliği Tarlası");
  });
});
