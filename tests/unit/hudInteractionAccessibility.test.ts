import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileControls, type MobileControlsProps } from "../../src/ui/MobileControls";
import { BasicFishingMinigameWidget } from "../../src/ui/fishing/BasicFishingMinigameWidget";
import { contextualInteractionLabel } from "../../src/ui/hud/SmartActionPrompt";
import type { BasicFishingState } from "../../src/simulation/core/types";

const hooks = vi.hoisted(() => ({
  effects: [] as Array<() => unknown>,
  windowListeners: new Map<string, () => void>()
}));

// Exercise the real control handlers and their retained refs without a browser
// or another DOM dependency. Layout and native event propagation are browser gates.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const useRef = <T,>(value: T) => ({ current: value });
  const useState = <T,>(value: T | (() => T)) => [typeof value === "function" ? (value as () => T)() : value, vi.fn()];
  const useEffect = (effect: () => unknown) => { hooks.effects.push(effect); };
  const useMemo = <T,>(calculate: () => T) => calculate();
  return { ...actual, useRef, useState, useEffect, useMemo,
    default: { ...actual, useRef, useState, useEffect, useMemo } };
});

vi.mock("../../src/i18n/useTranslation", () => ({ useTranslation: () => ({
  locale: "en", getLocalizedFish: () => ({ name: "" })
}) }));

type ElementWithProps = React.ReactElement<Record<string, unknown>>;

function descendants(node: unknown): ElementWithProps[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!React.isValidElement(node)) return [];
  const element = node as ElementWithProps;
  return [element, ...descendants(element.props.children)];
}

function control(tree: unknown, label: string): ElementWithProps {
  const element = descendants(tree).find((entry) => entry.props.label === label);
  if (!element) throw new Error(`Missing control: ${label}`);
  return element;
}

function mountControl(element: ElementWithProps): ElementWithProps {
  return (element.type as (props: Record<string, unknown>) => ElementWithProps)(element.props);
}

function pointer(pointerId: number) {
  return { pointerId, button: 0, preventDefault: vi.fn(), currentTarget: {
    setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn()
  } };
}

function props(overrides: Partial<MobileControlsProps> = {}): MobileControlsProps {
  return {
    touchDevice: true, landscape: true, orientationBlocked: false, bootReady: true,
    mode: "on-foot", activeModal: null, basicFishingPhase: null,
    onSetMoveVector: vi.fn(), onSetSprint: vi.fn(), onQueueJump: vi.fn(),
    onVirtualAction: vi.fn(), onSetFishingInput: vi.fn(), onReleaseBasicCast: vi.fn(),
    onClearVirtualInput: vi.fn(), ...overrides
  };
}

function invoke(element: ElementWithProps, eventName: string, event?: unknown): void {
  (element.props[eventName] as (event?: unknown) => void)(event);
}

beforeEach(() => {
  hooks.effects.length = 0;
  hooks.windowListeners.clear();
  vi.stubGlobal("window", {
    addEventListener: (event: string, listener: () => void) => hooks.windowListeners.set(event, listener),
    removeEventListener: vi.fn()
  });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe("HUD interaction accessibility", () => {
  it("names the touch action through the same world-prompt parser", () => {
    expect(contextualInteractionLabel("[E] Harvest Wheat · 8 Work · Right-click inspect", "en")).toBe("Harvest");
    expect(contextualInteractionLabel("[E] Harvest Wheat · 8 Work", "tr")).toBe("Hasat Et");
    expect(contextualInteractionLabel("[E] Unmoor Rowboat", "en")).toBe("Unmoor");
    expect(contextualInteractionLabel("[E] Trade at Village Produce Market", "en")).toBe("Trade");
    expect(contextualInteractionLabel("[E] Trade at Village Produce Market", "tr")).toBe("Alışveriş");
    expect(contextualInteractionLabel("[E] Use Hand Mill", "en")).toBe("Use");
    expect(contextualInteractionLabel("[E] Use Workbench", "tr")).toBe("Kullan");
    expect(contextualInteractionLabel("[E] Pack village specialties", "en")).toBe("Pack");
    expect(contextualInteractionLabel("[E] Pack village specialties", "tr")).toBe("Paketle");
    expect(contextualInteractionLabel("[E] Step Outside", "en")).toBe("Step Outside");
    expect(contextualInteractionLabel("[E] Step Outside", "tr")).toBe("Dışarı çık");
    expect(contextualInteractionLabel("[E] Notu oku", "tr")).toBe("Notu oku");
    expect(contextualInteractionLabel("[E] Split kindling · +20 Work", "en")).toBe("Split");
    expect(contextualInteractionLabel("[E] Turn the racks · +20 Work", "tr")).toBe("Çevir");
    expect(contextualInteractionLabel("[E] Mend the nets · +20 Work", "tr")).toBe("Onar");
    expect(contextualInteractionLabel("Need 8 Work", "en")).toBeNull();
    expect(contextualInteractionLabel(null, "en")).toBeNull();
  });

  it("only releases the pointer that owns a held touch action", () => {
    const onSetSprint = vi.fn();
    const button = mountControl(control(MobileControls(props({ onSetSprint })), "Sprint"));
    invoke(button, "onPointerDown", pointer(1));
    invoke(button, "onPointerDown", pointer(2));
    invoke(button, "onPointerUp", pointer(2));
    expect(onSetSprint.mock.calls).toEqual([[true]]);
    invoke(button, "onPointerUp", pointer(1));
    expect(onSetSprint.mock.calls).toEqual([[true], [false]]);
  });

  it("holds with Space or Enter and releases on keyup and focus loss", () => {
    const onSetSprint = vi.fn();
    const button = mountControl(control(MobileControls(props({ onSetSprint })), "Sprint"));
    const key = (name: string, repeat = false) => ({ key: name, repeat, preventDefault: vi.fn() });
    invoke(button, "onKeyDown", key(" "));
    invoke(button, "onKeyDown", key(" ", true));
    invoke(button, "onKeyUp", key(" "));
    invoke(button, "onKeyDown", key("Enter"));
    invoke(button, "onBlur");
    expect(onSetSprint.mock.calls).toEqual([[true], [false], [true], [false]]);
    expect(button.props["aria-pressed"]).toBe(false);
  });

  it("clears a held action when its control unmounts", () => {
    const onSetSprint = vi.fn();
    const element = control(MobileControls(props({ onSetSprint })), "Sprint");
    hooks.effects.length = 0;
    const button = mountControl(element);
    const cleanup = hooks.effects[0]() as () => void;
    invoke(button, "onPointerDown", pointer(3));
    cleanup();
    expect(onSetSprint.mock.calls).toEqual([[true], [false]]);
  });

  it("releases a hold when the window loses focus, then permits a fresh press", () => {
    const onSetSprint = vi.fn();
    const element = control(MobileControls(props({ onSetSprint })), "Sprint");
    hooks.effects.length = 0;
    const button = mountControl(element);
    hooks.effects[0]();
    const blur = hooks.windowListeners.get("blur")!;
    invoke(button, "onPointerDown", pointer(3));
    blur();
    invoke(button, "onPointerDown", pointer(4));
    expect(onSetSprint.mock.calls).toEqual([[true], [false], [true]]);
  });

  it("offers water inspection aboard a boat and keeps the contextual verb", () => {
    const tree = MobileControls(props({ mode: "boat-driving", canFishHere: true, interactionLabel: "Unmoor" }));
    expect(control(tree, "Unmoor")).toBeDefined();
    const onVirtualAction = vi.fn();
    const inspect = mountControl(control(MobileControls(props({ mode: "boat-driving", onVirtualAction })), "Inspect"));
    invoke(inspect, "onClick");
    expect(onVirtualAction).toHaveBeenCalledWith("use-secondary");
  });

  it("releases sport input at a new response and offers no Reel hold for neutral landing", () => {
    const onSetFishingInput = vi.fn();
    const tree = MobileControls(props({ mode: "sport-fishing", sportResponse: { action: "neutral" },
      dragNotch: 1, onSetFishingInput, onSetFishingDrag: vi.fn() }));
    expect(descendants(tree).some((entry) => entry.props.label === "Reel")).toBe(false);
    hooks.effects.forEach((effect) => effect());
    expect(onSetFishingInput).toHaveBeenCalledWith({ isReeling: false, isSlacking: false,
      isBracing: false, rodDirectionAngle: 0 });
    const balanced = mountControl(control(tree, "Medium"));
    expect(balanced.props["aria-pressed"]).toBe(true);
  });

  it("keeps the waiting basic catch under the result card's ownership", () => {
    const tree = MobileControls(props({ mode: "basic-fishing", basicFishingPhase: "caught" }));
    expect(descendants(tree).some((entry) => entry.props.label === "Cancel")).toBe(false);
  });

  it("keeps planting controls to Place and Cancel while ordinary play retains traversal", () => {
    const onVirtualAction = vi.fn();
    const onSetMoveVector = vi.fn();
    const placement = MobileControls(props({ mode: "farm-placement", onVirtualAction, onSetMoveVector }));
    const placementLabels = descendants(placement).flatMap((entry) => typeof entry.props.label === "string" ? [entry.props.label] : []);
    expect(placementLabels).toEqual(["Place", "Cancel"]);
    expect(descendants(placement).some((entry) => entry.props.onChange === onSetMoveVector)).toBe(true);
    invoke(mountControl(control(placement, "Place")), "onClick");
    invoke(mountControl(control(placement, "Cancel")), "onClick");
    expect(onVirtualAction.mock.calls).toEqual([["interact"], ["use-secondary"]]);

    const onSetSprint = vi.fn();
    const onQueueJump = vi.fn();
    const world = MobileControls(props({ mode: "on-foot", onSetSprint, onQueueJump }));
    const sprint = mountControl(control(world, "Sprint"));
    invoke(sprint, "onPointerDown", pointer(1));
    invoke(sprint, "onPointerUp", pointer(1));
    invoke(mountControl(control(world, "Jump")), "onClick");
    expect(onSetSprint.mock.calls).toEqual([[true], [false]]);
    expect(onQueueJump).toHaveBeenCalledOnce();
  });

  it("gives the basic catch card keyboard hold semantics and a correctly named progress meter", () => {
    const onHoldChange = vi.fn();
    const fishingState: BasicFishingState = { phase: "minigame", habitatId: "habitat.river",
      ecologyId: "ecology.neva", remainingSeconds: 0, willCatch: true };
    const tree = BasicFishingMinigameWidget({ fishingState, onHoldChange });
    const card = descendants(tree).find((entry) => entry.props["data-testid"] === "reeling-minigame")!;
    expect(card.props.role).toBe("button");
    expect(card.props.tabIndex).toBe(0);
    expect(card.props["aria-label"]).toContain("release to lower");
    invoke(card, "onKeyDown", { key: "Enter", repeat: false, preventDefault: vi.fn() });
    invoke(card, "onKeyUp", { key: "Enter", preventDefault: vi.fn() });
    expect(onHoldChange.mock.calls).toEqual([[true], [false]]);
    const meter = descendants(tree).find((entry) => entry.props.role === "meter")!;
    expect(meter.props["aria-label"]).toBe("Catch progress");
  });
});
