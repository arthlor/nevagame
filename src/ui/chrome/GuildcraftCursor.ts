import { UI_GUILDCRAFT } from "./uiAtlas.generated";

/**
 * Replaces the system pointer with the painted Guildcraft navigation arrow on
 * fine-pointer desktop devices.
 *
 * Cursor motion stays native and composited: the module only derives a few
 * cursor-sized raster variants from the published `guildcraft-pointer` sprite
 * (tilted to the classic up-left orientation) and hands them to the browser as
 * `--guild-cursor*` custom properties. Nothing runs per pointermove, so the
 * pointer never competes with the game thread.
 *
 * Presentation only: the state classes read existing DOM controls and the
 * world canvas's own `cursor` affordance and never write input, camera,
 * simulation or saved state. Coarse pointers, forced-colors mode and a failed
 * sprite load keep the native default cursor.
 */

const SPRITE_TIP_X = 255.5;
const SPRITE_TIP_Y = 9;
/** Tip-to-tail length of the painted arrow inside the 512px sprite. */
const SPRITE_ARROW_LENGTH = 493;
/** Visible arrow length and square icon box, in CSS pixels. */
const ARROW_LENGTH = 29;
const ICON_SIZE = 36;
/** Hotspot that keeps the arrow tip under the pointer. */
const ICON_TIP = 5;
const TILT_RADIANS = -Math.PI / 4;

const INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  "summary",
  "label",
  "input",
  "select",
  "textarea",
  "[contenteditable='true']",
  "[role='button']",
  "[role='link']",
  "[role='menuitem']",
  "[role='option']",
  "[role='slider']",
  "[role='tab']"
].join(",");

const GAME_CANVAS_ID = "game-canvas";

const CURSOR_VARIANTS = [
  { property: "--guild-cursor", filter: "none", scale: 1 },
  { property: "--guild-cursor-hover", filter: "brightness(1.12) saturate(1.12)", scale: 1.08 },
  { property: "--guild-cursor-unavailable", filter: "grayscale(0.7) brightness(0.85)", scale: 0.94 },
  { property: "--guild-cursor-pressed", filter: "none", scale: 0.88 }
] as const;

export interface GuildcraftCursorHandle {
  dispose: () => void;
}

export function startGuildcraftCursor(): GuildcraftCursorHandle {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { dispose: (): void => {} };
  }

  const finePointer = window.matchMedia("(pointer: fine)");
  const forcedColors = window.matchMedia("(forced-colors: active)");
  const root = document.documentElement;
  const gameCanvas = document.getElementById(GAME_CANVAS_ID);

  let active = false;
  let spriteReady = false;
  let lastX = 0;
  let lastY = 0;
  let lastCanvasCursor = "";

  const canActivate = (): boolean =>
    spriteReady && finePointer.matches && !forcedColors.matches;

  const isCursorAffordance = (value: string): boolean =>
    value !== "" && value !== "none" && value !== "auto" && value !== "default";

  // Runs on crossings, presses and world-affordance changes, never per move.
  const syncHoverState = (): void => {
    const target = document.elementFromPoint(lastX, lastY);
    const control = target ? target.closest(INTERACTIVE_SELECTOR) : null;
    const hoveredCanvas = target instanceof HTMLCanvasElement ? target : null;
    const canvasCursor = hoveredCanvas ? hoveredCanvas.style.cursor : gameCanvas?.style.cursor ?? "";
    lastCanvasCursor = gameCanvas?.style.cursor ?? "";
    // A real control under the pointer owns the state; the world pick only
    // speaks when no control is there.
    const worldInteractive = control === null && isCursorAffordance(canvasCursor);
    const unavailable = control !== null
      && (control.matches(":disabled") || control.getAttribute("aria-disabled") === "true");
    root.classList.toggle("guild-cursor-hover", control !== null || worldInteractive);
    root.classList.toggle("guild-cursor-unavailable", unavailable);
  };

  const onPointerPosition = (event: PointerEvent): void => {
    lastX = event.clientX;
    lastY = event.clientY;
    if (active) syncHoverState();
  };

  const onPointerDown = (event: PointerEvent): void => {
    lastX = event.clientX;
    lastY = event.clientY;
    if (!active) return;
    syncHoverState();
    root.classList.add("guild-cursor-pressed");
  };

  const onPointerEnd = (): void => {
    root.classList.remove("guild-cursor-pressed");
  };

  const activate = (): void => {
    if (active || !canActivate()) return;
    active = true;
    root.classList.add("guild-cursor-active");
  };

  const deactivate = (): void => {
    if (!active) return;
    active = false;
    root.classList.remove(
      "guild-cursor-active",
      "guild-cursor-hover",
      "guild-cursor-unavailable",
      "guild-cursor-pressed"
    );
  };

  const syncCapabilities = (): void => {
    if (canActivate()) activate();
    else deactivate();
  };

  const renderVariant = (sprite: HTMLImageElement, filter: string, scale: number): string | null => {
    const canvas = document.createElement("canvas");
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const context = canvas.getContext("2d");
    if (!context) return null;
    // Canvas filters are unsupported on some engines; the geometric scale
    // still separates the states there.
    context.filter = filter;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    const drawScale = (ARROW_LENGTH / SPRITE_ARROW_LENGTH) * scale;
    context.translate(ICON_TIP, ICON_TIP);
    context.rotate(TILT_RADIANS);
    context.scale(drawScale, drawScale);
    context.drawImage(sprite, -SPRITE_TIP_X, -SPRITE_TIP_Y);
    return canvas.toDataURL("image/png");
  };

  const sprite = new Image();
  sprite.decoding = "async";
  sprite.addEventListener("load", () => {
    for (const variant of CURSOR_VARIANTS) {
      const dataUrl = renderVariant(sprite, variant.filter, variant.scale);
      if (!dataUrl) return;
      root.style.setProperty(variant.property, `url("${dataUrl}") ${ICON_TIP} ${ICON_TIP}, auto`);
    }
    spriteReady = true;
    activate();
  }, { once: true });
  sprite.addEventListener("error", () => {
    spriteReady = false;
    deactivate();
  }, { once: true });
  sprite.src = UI_GUILDCRAFT.pointer;

  // The world sets `cursor: pointer` from its per-frame pick, which can change
  // while the mouse is still. The observer only reacts when the value really
  // changes so the hit test stays off the frame loop.
  const interactionObserver = gameCanvas && typeof MutationObserver !== "undefined"
    ? new MutationObserver(() => {
        if (!active || !gameCanvas) return;
        if (gameCanvas.style.cursor === lastCanvasCursor) return;
        syncHoverState();
      })
    : null;
  interactionObserver?.observe(gameCanvas as HTMLElement, { attributes: true, attributeFilter: ["style"] });

  window.addEventListener("pointerover", onPointerPosition, { passive: true });
  window.addEventListener("pointerout", onPointerPosition, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointerup", onPointerEnd);
  window.addEventListener("pointercancel", onPointerEnd);
  window.addEventListener("blur", onPointerEnd);
  finePointer.addEventListener("change", syncCapabilities);
  forcedColors.addEventListener("change", syncCapabilities);

  return {
    dispose: (): void => {
      interactionObserver?.disconnect();
      window.removeEventListener("pointerover", onPointerPosition);
      window.removeEventListener("pointerout", onPointerPosition);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      window.removeEventListener("blur", onPointerEnd);
      finePointer.removeEventListener("change", syncCapabilities);
      forcedColors.removeEventListener("change", syncCapabilities);
      deactivate();
      for (const variant of CURSOR_VARIANTS) root.style.removeProperty(variant.property);
    }
  };
}
