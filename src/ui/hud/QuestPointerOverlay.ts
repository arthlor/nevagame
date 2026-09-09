import type * as THREE from "three";
import { projectWorldToScreen } from "./worldScreenProjection";

export interface QuestPointerTarget {
  x: number;
  y: number;
  z: number;
  label: string;
  distanceMeters: number;
}

export interface QuestPointerProjection {
  x: number;
  y: number;
  onScreen: boolean;
}

/**
 * Keeps the marker's 120 px nameplate on-screen and lifts it above the lower
 * interaction/tool lanes. Short landscape viewports need a deeper reservation
 * because the touch controls and utility medallions occupy that edge.
 */
export function fitQuestPointerToHud(
  projection: QuestPointerProjection,
  viewport: { width: number; height: number }
): { x: number; y: number } {
  const SIDE_INSET = 68;
  const TOP_INSET = viewport.height <= 500 ? 54 : 60;
  const BOTTOM_INSET = viewport.height <= 500 ? 158 : 104;
  const maxX = Math.max(SIDE_INSET, viewport.width - SIDE_INSET);
  const maxY = Math.max(TOP_INSET, viewport.height - BOTTOM_INSET);

  return {
    x: Math.min(maxX, Math.max(SIDE_INSET, projection.x)),
    y: Math.min(maxY, Math.max(TOP_INSET, projection.y))
  };
}

/**
 * The screen-space half of the quest waypoint: a chevron pinned to the edge of
 * the viewport when the objective is behind you, and a small hanging marker
 * above it when it is in view.
 *
 * This is deliberately imperative DOM rather than a React component. The pointer
 * has to follow the camera, and `GameApp.renderUI()` re-renders the whole
 * interface tree — it is driven by events, not by frames, and pushing a camera
 * pose through it every frame would re-render every panel in the game to move
 * one arrow.
 */
export class QuestPointerOverlay {
  private readonly root: HTMLDivElement;
  private readonly chevron: HTMLDivElement;
  private readonly caption: HTMLSpanElement;
  private readonly range: HTMLSpanElement;
  private visible = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "quest-pointer";
    this.root.dataset.testid = "quest-pointer";
    this.root.setAttribute("aria-hidden", "true");
    this.root.hidden = true;

    this.chevron = document.createElement("div");
    this.chevron.className = "quest-pointer-chevron";
    this.chevron.innerHTML =
      '<svg viewBox="0 0 24 24" width="24" height="24" focusable="false">' +
      '<path d="M12 2.5 20.5 20 12 15.6 3.5 20Z" fill="currentColor" />' +
      "</svg>";

    this.caption = document.createElement("span");
    this.caption.className = "quest-pointer-caption";
    this.range = document.createElement("span");
    this.range.className = "quest-pointer-range";

    this.root.append(this.chevron, this.caption, this.range);
    parent.appendChild(this.root);
  }

  /** Position the pointer for this frame, or pass `null` to hide it. */
  update(
    target: QuestPointerTarget | null,
    camera: THREE.Camera,
    viewport: { width: number; height: number }
  ): void {
    // Inside this range the 3D beacon and the interaction prompt are both
    // legible, so a second screen-space marker is just clutter over the thing
    // the player walked here to look at.
    const NEAR_HANDOFF_METERS = 14;
    if (!target || target.distanceMeters < NEAR_HANDOFF_METERS) {
      this.hide();
      return;
    }

    const projection = projectWorldToScreen(target, camera, viewport);
    const fitted = fitQuestPointerToHud(projection, viewport);
    if (!this.visible) {
      this.root.hidden = false;
      this.visible = true;
    }

    this.root.dataset.state = projection.onScreen ? "on-screen" : "off-screen";
    this.root.style.transform = `translate(${Math.round(fitted.x)}px, ${Math.round(fitted.y)}px)`;
    this.chevron.style.transform = projection.onScreen
      ? "rotate(180deg)"
      : `rotate(${Math.round(projection.angleDeg)}deg)`;

    if (this.caption.textContent !== target.label) {
      this.caption.textContent = target.label;
    }
    const range = `${Math.round(target.distanceMeters)} m`;
    if (this.range.textContent !== range) {
      this.range.textContent = range;
    }
  }

  hide(): void {
    if (!this.visible) return;
    this.root.hidden = true;
    this.visible = false;
  }

  dispose(): void {
    this.root.remove();
  }
}
