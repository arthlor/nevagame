import { describe, expect, it } from "vitest";
import {
  InteractionTargetResolver,
  type ResolvedInteractionTarget
} from "../../src/app/InteractionTargetResolver";
import { ModeController } from "../../src/app/ModeController";
import { ModalStack } from "../../src/app/ModalStack";

const makeTarget = (
  id: string,
  x: number,
  z: number,
  overrides: Partial<ResolvedInteractionTarget> = {}
): ResolvedInteractionTarget => ({
  id,
  entityId: id,
  kind: "crop",
  action: "inspect",
  prompt: id,
  distanceMeters: Math.hypot(x, z),
  priority: 1,
  worldPosition: { x, y: 0, z },
  modes: ["on-foot"],
  ...overrides
});

const defaultContext = {
  mode: "on-foot" as const,
  player: { x: 0, y: 0.5, z: 0, rotationY: 0 }
};

describe("Interaction & Modal Routing Edge Cases", () => {
  it("resolves ties deterministically using stable ID sorting", () => {
    const resolver = new InteractionTargetResolver();
    const targetA = makeTarget("crop_alpha", 1, 1);
    const targetB = makeTarget("crop_beta", 1, 1);

    // Both at identical distance, priority, facing, pointer rank
    const result1 = resolver.resolve([targetB, targetA], defaultContext);
    const result2 = resolver.resolve([targetA, targetB], defaultContext);

    expect(result1?.id).toBe("crop_alpha");
    expect(result2?.id).toBe("crop_alpha");
  });

  it("handles line-of-sight checks properly between occluded and un-occluded targets", () => {
    const resolver = new InteractionTargetResolver();
    const blockedCrop = makeTarget("blocked_crop", 0, 1.5, { requiresLineOfSight: true });
    const dockBoarding = makeTarget("dock_board", 0, 1.5, { requiresLineOfSight: false, priority: 2 });

    // With line of sight returning false for all rays
    const result = resolver.resolve([blockedCrop, dockBoarding], {
      ...defaultContext,
      hasLineOfSight: () => false
    });

    // blockedCrop is rejected due to requiresLineOfSight, dockBoarding is accepted
    expect(result?.id).toBe("dock_board");
  });

  it("preserves pause modal hierarchy when opening and closing child overlays", () => {
    const modeController = new ModeController("on-foot");
    expect(modeController.blocksWorldInput).toBe(false);
    expect(modeController.pausesSimulation).toBe(false);

    // 1. Open pause menu
    modeController.open("pause");
    expect(modeController.activeModal).toBe("pause");
    expect(modeController.pausesSimulation).toBe(true);
    expect(modeController.blocksWorldInput).toBe(true);

    // 2. Open inventory from pause menu (child overlay)
    modeController.open("inventory");
    expect(modeController.activeModal).toBe("inventory");
    expect(modeController.pausesSimulation).toBe(true);
    expect(modeController.blocksWorldInput).toBe(true);

    // 3. Close inventory -> should return to pause, NOT unpause game
    modeController.closeActive();
    expect(modeController.activeModal).toBe("pause");
    expect(modeController.pausesSimulation).toBe(true);

    // 4. Close pause -> resumes game
    modeController.closeActive();
    expect(modeController.activeModal).toBe(null);
    expect(modeController.pausesSimulation).toBe(false);
    expect(modeController.blocksWorldInput).toBe(false);
  });

  it("handles ModalStack edge cases (popping empty, duplicate children, clear)", () => {
    const stack = new ModalStack<string>();
    expect(stack.isEmpty).toBe(true);
    expect(stack.active).toBe(null);

    // Pop on empty is a safe no-op
    expect(stack.pop()).toBe(null);

    stack.replace("root");
    expect(stack.active).toBe("root");
    expect(stack.includes("root")).toBe(true);

    // Replace child replaces any existing child above root
    stack.replaceChild("root", "childA");
    expect(stack.active).toBe("childA");
    stack.replaceChild("root", "childB");
    expect(stack.active).toBe("childB");
    expect(stack.includes("childA")).toBe(false);
    expect(stack.includes("childB")).toBe(true);
    expect(stack.includes("root")).toBe(true);

    stack.clear();
    expect(stack.isEmpty).toBe(true);
    expect(stack.active).toBe(null);
  });
});
