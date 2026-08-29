import { describe, expect, it } from "vitest";
import { deriveSemanticInput, HeldInputState } from "../../src/input/InputRouter";

describe("semantic input mapping", () => {
  it.each([
    ["KeyW", { x: 0, z: -1 }],
    ["KeyA", { x: -1, z: 0 }],
    ["KeyD", { x: 1, z: 0 }],
    ["KeyS", { x: 0, z: 1 }]
  ] as const)("maps %s to its exact movement axis", (key, expected) => {
    expect(deriveSemanticInput(new Set([key]), "on-foot").moveVector).toEqual(expected);
  });

  it("normalizes diagonal on-foot movement and exposes sprint as intent", () => {
    const input = deriveSemanticInput(new Set(["KeyW", "KeyD", "ShiftLeft"]), "on-foot");
    expect(input.moveVector.x).toBeCloseTo(Math.SQRT1_2, 6);
    expect(input.moveVector.z).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(input.sprint).toBe(true);
  });

  it("maps sport-fishing bindings without leaking them into movement", () => {
    const input = deriveSemanticInput(
      new Set(["KeyW", "KeyS", "KeyA", "Mouse0", "Mouse2", "Space"]),
      "sport-fishing"
    );
    expect(input.moveVector).toEqual({ x: 0, z: 0 });
    expect(input.sprint).toBe(false);
    expect(input.fishing).toEqual({
      isReeling: true,
      isSlacking: true,
      isBracing: true,
      rodDirectionAngle: -0.6
    });
  });

  it("keeps boat steering semantic and ignores the on-foot sprint modifier", () => {
    const input = deriveSemanticInput(new Set(["ArrowUp", "ArrowLeft", "ShiftRight"]), "boat-driving");
    expect(input.moveVector.x).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(input.moveVector.z).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(input.sprint).toBe(false);
    expect(input.fishing.isReeling).toBe(false);
  });

  it("clears held and released input through the same transient state used on interruption", () => {
    const held = new HeldInputState();
    held.press("KeyW");
    held.press("Mouse0");
    expect(deriveSemanticInput(held.values, "sport-fishing").fishing.isReeling).toBe(true);
    held.release("Mouse0");
    expect(deriveSemanticInput(held.values, "sport-fishing").fishing.isReeling).toBe(true);
    held.release("KeyW");
    expect(deriveSemanticInput(held.values, "sport-fishing").fishing.isReeling).toBe(false);
    held.press("KeyS");
    held.clear();
    expect(deriveSemanticInput(held.values, "sport-fishing").fishing.isSlacking).toBe(false);
  });

  it("provides a complete keyboard-only sport-fishing path", () => {
    const input = deriveSemanticInput(
      new Set(["KeyW", "KeyS", "ArrowRight", "Space"]),
      "sport-fishing"
    );
    expect(input.fishing).toEqual({
      isReeling: true,
      isSlacking: true,
      isBracing: true,
      rodDirectionAngle: 0.6
    });
  });

  it("keeps basic fishing on Space instead of aliasing every interaction key", () => {
    expect(deriveSemanticInput(new Set(["Space"]), "basic-fishing").fishing.isReeling).toBe(true);
    for (const binding of ["KeyE", "KeyC", "KeyW", "Mouse0"]) {
      expect(deriveSemanticInput(new Set([binding]), "basic-fishing").fishing.isReeling).toBe(false);
    }
  });

  it("exposes farm GIS as a held Alt intent rather than a toggle", () => {
    expect(deriveSemanticInput(new Set(["AltLeft"]), "on-foot").farmGisHeld).toBe(true);
    expect(deriveSemanticInput(new Set(["AltRight"]), "farm-placement").farmGisHeld).toBe(true);
    expect(deriveSemanticInput(new Set(["KeyW"]), "on-foot").farmGisHeld).toBe(false);
    expect(deriveSemanticInput(new Set(), "on-foot").farmGisHeld).toBe(false);
  });

});
