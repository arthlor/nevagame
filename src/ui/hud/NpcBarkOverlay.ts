import type { Camera } from "three";
import type { NpcBarkDto } from "../../simulation/presentation/NpcPresentation";
import { projectWorldToScreen } from "./worldScreenProjection";

/** A single reusable bubble; cooldowns are presentation time, never save data. */
export class NpcBarkOverlay {
  private readonly root = document.createElement("div");
  private readonly name = document.createElement("strong");
  private readonly line = document.createElement("span");
  private readonly nextAllowed = new Map<string, number>();
  private readonly lineIndices = new Map<string, number>();
  private activeId: string | null = null;
  private expiresAt = 0;
  private nextBubbleAt = 0;
  private lastScreenX = Number.NaN;
  private lastScreenY = Number.NaN;

  constructor(parent: HTMLElement) {
    this.root.className = "npc-world-bark";
    this.root.dataset.testid = "npc-world-bark";
    this.root.hidden = true;
    this.root.setAttribute("role", "status");
    this.root.append(this.name, this.line);
    parent.append(this.root);
  }

  update(candidates: NpcBarkDto[], camera: Camera, viewport: { width: number; height: number },
    nowMs: number, heightAt: (x: number, z: number) => number): void {
    const project = (npc: NpcBarkDto) => projectWorldToScreen(
      { x: npc.x, y: heightAt(npc.x, npc.z) + 2.25, z: npc.z }, camera, viewport);
    let active = candidates.find((npc) => npc.npcId === this.activeId);
    let projected = active ? project(active) : null;
    if (!active || !projected || nowMs >= this.expiresAt || !projected.onScreen) {
      this.activeId = null;
      active = undefined;
      projected = null;
      this.root.hidden = true;
    }
    if (!active && nowMs >= this.nextBubbleAt) {
      for (const npc of candidates) {
        if (npc.lines.length === 0 || nowMs < (this.nextAllowed.get(npc.npcId) ?? 0)) continue;
        const candidateProjection = project(npc);
        if (!candidateProjection.onScreen) continue;
        active = npc;
        projected = candidateProjection;
        break;
      }
      if (active && projected) {
        const index = this.lineIndices.get(active.npcId) ?? 0;
        const line = active.lines[index % active.lines.length];
        this.lineIndices.set(active.npcId, index + 1);
        this.name.textContent = active.name;
        this.line.textContent = line;
        this.activeId = active.npcId;
        this.expiresAt = nowMs + Math.min(11000, Math.max(5500, line.length * 65));
        this.nextBubbleAt = this.expiresAt + 3500;
        this.nextAllowed.set(active.npcId, nowMs + 45000);
        this.root.hidden = false;
      }
    }
    if (active && projected) {
      const x = Math.max(150, Math.min(viewport.width - 150, projected.x));
      const y = Math.max(100, projected.y);
      if (x !== this.lastScreenX || y !== this.lastScreenY) {
        this.lastScreenX = x;
        this.lastScreenY = y;
        this.root.style.left = `${x}px`;
        this.root.style.top = `${y}px`;
      }
    }
  }

  /**
   * Holds one person's barks until `untilMs`, hiding their bubble now. A
   * conversation that just closed used to be followed at once by the same
   * person remarking on the weather.
   */
  suppress(npcId: string, untilMs: number): void {
    this.nextAllowed.set(npcId, Math.max(this.nextAllowed.get(npcId) ?? 0, untilMs));
    if (this.activeId === npcId) {
      this.activeId = null;
      this.root.hidden = true;
    }
  }

  dispose(): void { this.root.remove(); }
}
