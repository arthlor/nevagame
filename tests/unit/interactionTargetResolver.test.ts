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

  it("asks line of sight against the candidate world position so physics can ignore self-colliders", () => {
    const resolver = new InteractionTargetResolver();
    const mill = target("mill", 0, 2, {
      kind: "station",
      requiresLineOfSight: true,
      worldPosition: { x: 4, y: 1.2, z: 6 }
    });
    let queriedTo: { x: number; y: number; z: number } | undefined;
    const result = resolver.resolve([mill], {
      ...context,
      hasLineOfSight: (_from, to) => {
        queriedTo = to;
        return true;
      }
    });
    expect(result?.id).toBe("mill");
    expect(queriedTo).toEqual({ x: 4, y: 1.65, z: 6 });
  });

  it("keeps an actionable station ahead of dialogue when their approach spaces overlap", () => {
    const resolver = new InteractionTargetResolver();
    const station = target("fish-table", 0, 2, {
      entityId: undefined,
      kind: "station",
      action: "start-processing",
      priority: 0
    });
    const npc = target("npc.maeve", 0, 1, {
      kind: "station",
      action: "inspect",
      priority: 1
    });
    expect(resolver.resolve([npc, station], context)?.id).toBe("fish-table");
  });

  it("filters ride and dismount targets by gameplay mode", () => {
    const resolver = new InteractionTargetResolver();
    const ride = target("mount.donkey_starter", 0, 1, {
      kind: "mount",
      action: "mount",
      prompt: "[E] Ride donkey",
      priority: 0,
      modes: ["on-foot"]
    });
    const dismount = target("mount.donkey_starter:dismount", 0, 0.4, {
      kind: "mount",
      action: "dismount",
      prompt: "[E] Dismount",
      priority: 0,
      modes: ["mounted"]
    });

    expect(resolver.resolve([ride, dismount], context)?.action).toBe("mount");
    expect(resolver.resolve([ride, dismount], { ...context, mode: "mounted" })?.action).toBe("dismount");
  });
});
