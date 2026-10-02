import { describe, expect, it, vi } from "vitest";
import { deriveSemanticInput, HeldInputState, InputRouter, isGameSurfaceTarget } from "../../src/input/InputRouter";

describe("semantic input mapping", () => {
  it("tracks HUD pointer motion and reprojects it after a canvas resize without dispatching a world action", () => {
    const globals = globalThis as { window?: unknown; document?: unknown; HTMLElement?: unknown };
    const previous = { window: globals.window, document: globals.document, HTMLElement: globals.HTMLElement };
    const addEventListener = vi.fn(), removeEventListener = vi.fn();
    class TestElement {
      tagName = "BUTTON";
      bounds = { left: 100, top: 50, width: 1000, height: 500 };
      getBoundingClientRect() { return this.bounds; }
    }
    globals.window = { addEventListener, removeEventListener };
    globals.document = { addEventListener, removeEventListener };
    globals.HTMLElement = TestElement;
    try {
      const router = new InputRouter();
      const action = vi.fn();
      router.onAction(action);
      const canvas = new TestElement();
      canvas.tagName = "CANVAS";
      const hud = new TestElement();
      const internals = router as unknown as { onPointerMove: (event: PointerEvent) => void; onPointerDown: (event: PointerEvent) => void };
      expect(router.getPointerClientPosition()).toBeNull();
      expect(router.getCanvasPointerNdc(canvas as unknown as HTMLElement)).toBeNull();
      internals.onPointerMove({ pointerId: 1, pointerType: "mouse", target: canvas, clientX: 600, clientY: 300 } as unknown as PointerEvent);
      expect(router.getPointerNdc(canvas as unknown as HTMLElement)).toEqual({ x: 0, y: 0 });
      internals.onPointerMove({ pointerId: 1, pointerType: "mouse", target: hud, clientX: 850, clientY: 400 } as unknown as PointerEvent);
      expect(router.getPointerClientPosition()).toEqual({ x: 850, y: 400 });
      expect(router.getCanvasPointerNdc(canvas as unknown as HTMLElement)).toEqual({ x: 0, y: 0 });
      expect(router.getPointerNdc(canvas as unknown as HTMLElement)!.x).toBe(0.5);
      expect(router.getPointerNdc(canvas as unknown as HTMLElement)!.y).toBeCloseTo(-0.4, 6);
      canvas.bounds.width = 500;
      expect(router.getPointerNdc(canvas as unknown as HTMLElement)!.x).toBe(2);
      expect(router.getCanvasPointerNdc(canvas as unknown as HTMLElement)!.x).toBe(1);
      internals.onPointerDown({ pointerType: "mouse", target: hud, clientX: 850, clientY: 400 } as unknown as PointerEvent);
      expect(action).not.toHaveBeenCalled();
      router.dispatchVirtualAction("interact");
      expect(action).toHaveBeenLastCalledWith("interact", "virtual");
      router.setWorldInputSuspended(true);
      router.dispatchVirtualAction("interact");
      expect(action).toHaveBeenCalledTimes(1);
      router.dispose();
    } finally {
      for (const name of ["window", "document", "HTMLElement"] as const) {
        if (previous[name] === undefined) delete globals[name]; else globals[name] = previous[name];
      }
    }
  });
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

  it("suppresses the native menu on the game surface and leaves the rest of the page alone", () => {
    const surface = { closest: (selector: string) => selector.includes("#ui-root") ? surface : null };
    const outside = { closest: () => null };
    expect(isGameSurfaceTarget(surface as unknown as EventTarget)).toBe(true);
    expect(isGameSurfaceTarget(outside as unknown as EventTarget)).toBe(false);
    expect(isGameSurfaceTarget(null)).toBe(false);

    const previousWindow = (globalThis as { window?: unknown }).window;
    const previousDocument = (globalThis as { document?: unknown }).document;
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    (globalThis as { window?: unknown }).window = { addEventListener, removeEventListener };
    (globalThis as { document?: unknown }).document = { addEventListener, removeEventListener };
    try {
      const router = new InputRouter();
      const onContextMenu = (router as unknown as { onContextMenu: (event: Event) => void }).onContextMenu;
      const preventSurface = vi.fn();
      const preventOutside = vi.fn();
      onContextMenu({ target: surface, preventDefault: preventSurface } as unknown as Event);
      onContextMenu({ target: outside, preventDefault: preventOutside } as unknown as Event);
      expect(preventSurface).toHaveBeenCalledTimes(1);
      expect(preventOutside).not.toHaveBeenCalled();
      router.dispose();
    } finally {
      if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
      else (globalThis as { window?: unknown }).window = previousWindow;
      if (previousDocument === undefined) delete (globalThis as { document?: unknown }).document;
      else (globalThis as { document?: unknown }).document = previousDocument;
    }
  });

  it("interrupts an active pointer gesture when capture is cancelled", () => {
    const previousWindow = (globalThis as { window?: unknown }).window;
    const previousDocument = (globalThis as { document?: unknown }).document;
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    (globalThis as { window?: unknown }).window = { addEventListener, removeEventListener };
    (globalThis as { document?: unknown }).document = { addEventListener, removeEventListener };
    try {
      const router = new InputRouter();
      const heldInput = (router as unknown as { heldInput: HeldInputState }).heldInput;
      heldInput.press("Mouse0");
      const interrupt = vi.spyOn(router, "interrupt");
      const onPointerCancel = (router as unknown as {
        onPointerCancel: (event: PointerEvent) => void;
      }).onPointerCancel;

      onPointerCancel({ pointerType: "mouse", pointerId: 7 } as PointerEvent);

      expect(heldInput.values.has("Mouse0")).toBe(false);
      expect(interrupt).toHaveBeenCalledTimes(1);
      router.dispose();
    } finally {
      if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
      else (globalThis as { window?: unknown }).window = previousWindow;
      if (previousDocument === undefined) delete (globalThis as { document?: unknown }).document;
      else (globalThis as { document?: unknown }).document = previousDocument;
    }
  });

  it("does not lose the interruption callback when a layout pointer loses capture", () => {
    const previousWindow = (globalThis as { window?: unknown }).window;
    const previousDocument = (globalThis as { document?: unknown }).document;
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    (globalThis as { window?: unknown }).window = { addEventListener, removeEventListener };
    (globalThis as { document?: unknown }).document = { addEventListener, removeEventListener };
    try {
      const router = new InputRouter();
      (router as unknown as { layoutPointer: unknown }).layoutPointer = { id: 7, target: {} };
      const interrupt = vi.spyOn(router, "interrupt");
      const onLostPointerCapture = (router as unknown as {
        onLostPointerCapture: (event: PointerEvent) => void;
      }).onLostPointerCapture;

      onLostPointerCapture({ pointerType: "mouse", pointerId: 7 } as PointerEvent);

      expect(interrupt).toHaveBeenCalledTimes(1);
      router.dispose();
    } finally {
      if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
      else (globalThis as { window?: unknown }).window = previousWindow;
      if (previousDocument === undefined) delete (globalThis as { document?: unknown }).document;
      else (globalThis as { document?: unknown }).document = previousDocument;
    }
  });

  it("does not keep walking on a key pressed or released under a Command chord", () => {
    const globals = globalThis as { window?: unknown; document?: unknown; HTMLElement?: unknown };
    const previous = { window: globals.window, document: globals.document, HTMLElement: globals.HTMLElement };
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    globals.window = { addEventListener, removeEventListener };
    globals.document = { addEventListener, removeEventListener };
    globals.HTMLElement = class {};
    try {
      const router = new InputRouter();
      const internals = router as unknown as {
        heldInput: HeldInputState;
        onKeyDown: (event: KeyboardEvent) => void;
        onKeyUp: (event: KeyboardEvent) => void;
      };
      const key = (code: string, metaKey = false) =>
        ({ code, metaKey, repeat: false, defaultPrevented: false, target: null, preventDefault: vi.fn() }) as unknown as KeyboardEvent;

      internals.onKeyDown(key("KeyD", true));
      expect(internals.heldInput.values.has("KeyD")).toBe(false);

      internals.onKeyDown(key("KeyW"));
      internals.heldInput.press("Mouse2");
      internals.onKeyDown(key("MetaLeft", true));
      // macOS drops this W keyup; releasing Command must still stop the walk.
      internals.onKeyUp(key("MetaLeft"));
      expect(internals.heldInput.values.has("KeyW")).toBe(false);
      expect(internals.heldInput.values.has("Mouse2")).toBe(true);
      expect(router.getInputState().moveVector).toEqual({ x: 0, z: 0 });
      router.dispose();
    } finally {
      for (const name of ["window", "document", "HTMLElement"] as const) {
        if (previous[name] === undefined) delete globals[name];
        else globals[name] = previous[name];
      }
    }
  });

});
