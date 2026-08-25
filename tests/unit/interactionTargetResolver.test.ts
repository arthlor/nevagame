import { describe, expect, it } from "vitest";
import {
  InteractionTargetResolver,
  type ResolvedInteractionTarget
} from "../../src/app/InteractionTargetResolver";

const target = (
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

const context = {
  mode: "on-foot" as const,
  player: { x: 0, y: 0.5, z: 0, rotationY: 0 }
};

describe("InteractionTargetResolver", () => {
  it("gives pointer and centered targets stable precedence for both E and LMB callers", () => {
    const resolver = new InteractionTargetResolver();
    const front = target("front", 0, 1);
    const pointed = target("pointed", 1.5, 0, { priority: 2 });
    expect(resolver.resolve([front, pointed], { ...context, pointerEntityId: "pointed" })?.id)
      .toBe("pointed");
    expect(resolver.resolve([pointed, front], { ...context, centeredEntityId: "front" })?.id)
      .toBe("front");
  });

  it("combines mode validity, facing, obstruction, distance, and stable ids", () => {
    const resolver = new InteractionTargetResolver();
    const behind = target("behind", 0, -1);
    const blockedFront = target("blocked-front", 0, 1, { requiresLineOfSight: true });
    const boatOnly = target("boat-only", 0, 0.5, { modes: ["boat-driving"], priority: 0 });
    const clearSide = target("clear-side", 1.2, 0);
    const result = resolver.resolve([behind, blockedFront, boatOnly, clearSide], {
      ...context,
      hasLineOfSight: (_from, to) => to.z !== 1
    });
    expect(result?.id).toBe("clear-side");
  });
});
