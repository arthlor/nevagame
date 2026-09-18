import { UI_GUILDCRAFT } from "./uiAtlas.generated";

/**
 * Replaces the system pointer with the painted Guildcraft navigation arrow on
 * fine-pointer desktop devices, once the published sprite has loaded.
 *
 * Presentation only. It consumes existing hover signals — interactive DOM
 * controls and the world canvas's own `cursor: pointer` state — and never
 * writes input, camera, simulation or saved state. Coarse/touch pointers,
 * forced-colors mode and a failed sprite load all keep the native cursor.
 */

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

export interface GuildcraftCursorHandle {
  dispose: () => void;
}

export function startGuildcraftCursor(): GuildcraftCursorHandle {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { dispose: (): void => {} };
  }

  const finePointer = window.matchMedia("(pointer: fine)");
  const forcedColors = window.matchMedia("(forced-colors: active)");

  const root = document.createElement("div");
  root.className = "guild-cursor";
  root.setAttribute("aria-hidden", "true");

  const art = document.createElement("img");
  art.className = "guild-cursor__art";
  art.alt = "";
  art.draggable = false;
  art.decoding = "async";
  root.append(art);
  document.body.append(root);

  const gameCanvas = document.getElementById(GAME_CANVAS_ID);
  let spriteReady = false;
  let active = false;
  let visible = false;
  let lastX = 0;
  let lastY = 0;
  let lastCanvasCursor = "";

  const canActivate = (): boolean =>
    spriteReady && finePointer.matches && !forcedColors.matches;

  const hide = (): void => {
    visible = false;
    root.classList.remove("is-visible");
  };

  const releasePressed = (): void => {
    root.classList.remove("is-pressed");
  };

  const applyHoverState = (): void => {
    // elementFromPoint, not the event target: disabled controls suppress
    // pointer events, so the real control under the pointer is the only
    // reliable way to show the unavailable state.
    const target = document.elementFromPoint(lastX, lastY);
    const control = target ? target.closest(INTERACTIVE_SELECTOR) : null;
    // The world canvas and the character-preview canvas publish their own
    // hover/drag affordance through `cursor`, which the custom cursor hides.
    const hoveredCanvas = target instanceof HTMLCanvasElement ? target : null;
    const canvasCursor = hoveredCanvas ? hoveredCanvas.style.cursor : gameCanvas?.style.cursor ?? "";
    lastCanvasCursor = gameCanvas?.style.cursor ?? "";
    const worldInteractive = canvasCursor !== "" && canvasCursor !== "none";
    const unavailable = control !== null
      && (control.matches(":disabled") || control.getAttribute("aria-disabled") === "true");
    root.classList.toggle("is-interactive", control !== null || worldInteractive);
    root.classList.toggle("is-disabled", control !== null && unavailable && !worldInteractive);
  };

  const place = (x: number, y: number): void => {
    lastX = x;
    lastY = y;
    root.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  };

  const show = (): void => {
    if (!active || visible) return;
    visible = true;
    root.classList.add("is-visible");
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === "touch") {
      hide();
      return;
    }
    if (!active) return;
    place(event.clientX, event.clientY);
    applyHoverState();
    show();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "touch") {
      hide();
      releasePressed();
      return;
    }
    if (!active) return;
    place(event.clientX, event.clientY);
    applyHoverState();
    root.classList.add("is-pressed");
    show();
  };

  const onPointerEnd = (): void => {
    releasePressed();
  };

  const onPointerOut = (event: PointerEvent): void => {
    if (event.relatedTarget) return;
    hide();
    releasePressed();
  };

  const onWindowBlur = (): void => {
    hide();
    releasePressed();
  };

  const onVisibilityChange = (): void => {
    if (document.hidden) onWindowBlur();
  };

  const activate = (): void => {
    if (active || !canActivate()) return;
    active = true;
    document.documentElement.classList.add("guild-cursor-active");
  };

  const deactivate = (): void => {
    if (!active) return;
    active = false;
    hide();
    releasePressed();
    root.classList.remove("is-interactive", "is-disabled");
    document.documentElement.classList.remove("guild-cursor-active");
  };

  const syncCapabilities = (): void => {
    if (canActivate()) activate();
    else deactivate();
  };

  const onSpriteReady = (): void => {
    spriteReady = true;
    activate();
  };

  const onSpriteError = (): void => {
    spriteReady = false;
    deactivate();
    root.remove();
  };

  art.addEventListener("load", onSpriteReady, { once: true });
  art.addEventListener("error", onSpriteError, { once: true });
  art.src = UI_GUILDCRAFT.pointer;
  if (art.complete) {
    if (art.naturalWidth > 0) onSpriteReady();
    else onSpriteError();
  }

  // The world sets `cursor: pointer` from its per-frame pick, which can change
  // while the mouse is still. The observer only reacts when the value really
  // changes so the elementFromPoint hit test stays off the frame loop.
  const interactionObserver = gameCanvas && typeof MutationObserver !== "undefined"
    ? new MutationObserver(() => {
        if (!active || !gameCanvas) return;
        if (gameCanvas.style.cursor === lastCanvasCursor) return;
        applyHoverState();
      })
    : null;
  interactionObserver?.observe(gameCanvas as HTMLElement, { attributes: true, attributeFilter: ["style"] });

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointerup", onPointerEnd);
  window.addEventListener("pointercancel", onPointerEnd);
  window.addEventListener("blur", onWindowBlur);
  document.addEventListener("pointerout", onPointerOut);
  document.addEventListener("visibilitychange", onVisibilityChange);
  finePointer.addEventListener("change", syncCapabilities);
  forcedColors.addEventListener("change", syncCapabilities);

  return {
    dispose: (): void => {
      interactionObserver?.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      finePointer.removeEventListener("change", syncCapabilities);
      forcedColors.removeEventListener("change", syncCapabilities);
      deactivate();
      root.remove();
    }
  };
}
