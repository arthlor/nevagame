import type { Camera } from "three";
import type { MarketLifeBoardDto } from "../../simulation/presentation/MarketLifePresentation";
import { projectWorldToScreen } from "./worldScreenProjection";

export interface MarketBoardPoint {
  board: MarketLifeBoardDto;
  x: number;
  z: number;
}

export type MarketBoardResponseKind = "sale" | "purchase";

/** Only stalls this close advertise on the world board. */
export const MARKET_BOARD_REACH_METERS = 26;

const DIRECTION_MARK: Record<MarketLifeBoardDto["highlights"][number]["direction"], string> = {
  rising: "▲",
  steady: "◆",
  falling: "▼"
};

/** Nearest stall within reach, or null. Pure, so the reach rule stays testable. */
export function nearestMarketBoardInReach(
  points: readonly MarketBoardPoint[],
  playerX: number,
  playerZ: number,
  reachMeters: number = MARKET_BOARD_REACH_METERS
): MarketBoardPoint | null {
  let best: MarketBoardPoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const distance = Math.hypot(point.x - playerX, point.z - playerZ);
    if (distance > reachMeters || distance >= bestDistance) continue;
    best = point;
    bestDistance = distance;
  }
  return best;
}

/** Height of the board above the stall's ground point. */
const BOARD_ANCHOR_HEIGHT_METERS = 3.1;

/**
 * One reusable world board pinned above a stall. It only appears when the
 * player is near a market whose sign is on screen, and it is presentation only:
 * demand is read from simulation and never written back.
 */
export class MarketBoardOverlay {
  private readonly root = document.createElement("div");
  private readonly title = document.createElement("strong");
  private readonly list = document.createElement("ul");
  private activeId: string | null = null;
  private renderedSignature = "";
  private readonly acknowledgments = new Map<string, {
    sequence: number;
    kind: MarketBoardResponseKind;
  }>();
  private acknowledgmentSequence = 0;
  private readonly renderedAcknowledgments = new Map<string, number>();
  private responseEndsAtMs = 0;

  constructor(parent: HTMLElement) {
    this.root.className = "market-world-board";
    this.root.dataset.testid = "market-world-board";
    this.root.hidden = true;
    this.root.setAttribute("role", "status");
    this.title.className = "market-world-board-title";
    this.list.className = "market-world-board-list";
    this.root.append(this.title, this.list);
    parent.append(this.root);
  }

  update(
    points: readonly MarketBoardPoint[],
    player: { x: number; z: number },
    camera: Camera,
    viewport: { width: number; height: number },
    heightAt: (x: number, z: number) => number,
    nowMs: number = performance.now()
  ): void {
    const nearest = nearestMarketBoardInReach(points, player.x, player.z);
    if (!nearest) {
      this.hide();
      return;
    }
    const projected = projectWorldToScreen(
      { x: nearest.x, y: heightAt(nearest.x, nearest.z) + BOARD_ANCHOR_HEIGHT_METERS, z: nearest.z },
      camera,
      viewport
    );
    if (!projected.onScreen) {
      this.hide();
      return;
    }

    const signature = this.signatureOf(nearest.board);
    if (signature !== this.renderedSignature) {
      this.renderedSignature = signature;
      this.title.textContent = nearest.board.marketName;
      this.renderRows(nearest.board);
    }
    this.root.style.left = `${projected.x}px`;
    this.root.style.top = `${projected.y}px`;
    this.root.hidden = false;
    this.activeId = nearest.board.marketId;

    const acknowledgment = this.acknowledgments.get(nearest.board.marketId);
    if (acknowledgment && acknowledgment.sequence !== this.renderedAcknowledgments.get(nearest.board.marketId)) {
      this.renderedAcknowledgments.set(nearest.board.marketId, acknowledgment.sequence);
      this.responseEndsAtMs = nowMs + 900;
      this.root.dataset.response = acknowledgment.kind;
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        this.root.getAnimations().forEach((animation) => animation.cancel());
        this.root.animate(
          [
            { transform: "translate(-50%, -100%) scale(1)" },
            { transform: "translate(-50%, -100%) scale(1.035)", offset: 0.32 },
            { transform: "translate(-50%, -100%) scale(1)" }
          ],
          { duration: 620, easing: "cubic-bezier(.2,.8,.2,1)" }
        );
      }
    }
    if (nowMs >= this.responseEndsAtMs) delete this.root.dataset.response;
  }

  /**
   * Marks the next visible frame of this market as a response to a committed
   * transaction. The board's values still come exclusively from simulation.
   */
  acknowledge(marketId: string, kind: MarketBoardResponseKind): void {
    this.acknowledgmentSequence += 1;
    this.acknowledgments.set(marketId, {
      sequence: this.acknowledgmentSequence,
      kind
    });
  }

  dispose(): void {
    this.root.getAnimations().forEach((animation) => animation.cancel());
    this.root.remove();
  }

  private hide(): void {
    if (this.activeId === null && this.root.hidden) return;
    this.activeId = null;
    this.root.hidden = true;
  }

  private signatureOf(board: MarketLifeBoardDto): string {
    const rows = board.highlights
      .map((highlight) => `${highlight.itemId}:${highlight.demandPercent}:${highlight.direction}`)
      .join("|");
    return `${board.marketId}:${board.marketName}|${rows}`;
  }

  private renderRows(board: MarketLifeBoardDto): void {
    this.list.replaceChildren();
    for (const highlight of board.highlights) {
      const row = document.createElement("li");
      row.className = `market-world-board-row is-${highlight.direction}`;
      row.dataset.label = highlight.label;
      const name = document.createElement("span");
      name.className = "market-world-board-item";
      name.textContent = highlight.itemName;
      const mark = document.createElement("span");
      mark.className = "market-world-board-mark";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = DIRECTION_MARK[highlight.direction];
      const value = document.createElement("span");
      value.className = "market-world-board-value";
      value.textContent = `${highlight.demandPercent}%`;
      const label = document.createElement("span");
      label.className = "market-world-board-label";
      label.textContent = highlight.label;
      row.append(name, mark, value, label);
      this.list.append(row);
    }
  }
}
