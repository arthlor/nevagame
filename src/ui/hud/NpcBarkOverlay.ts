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
    if (!active || nowMs >= this.expiresAt || !project(active).onScreen) {
      this.activeId = null;
      active = undefined;
      this.root.hidden = true;
    }
    if (!active && nowMs >= this.nextBubbleAt) {
      active = candidates.find((npc) => npc.lines.length > 0 &&
        nowMs >= (this.nextAllowed.get(npc.npcId) ?? 0) && project(npc).onScreen);
      if (active) {
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
    if (active) {
      const point = project(active);
      this.root.style.left = `${Math.max(150, Math.min(viewport.width - 150, point.x))}px`;
      this.root.style.top = `${Math.max(100, point.y)}px`;
    }
  }

  dispose(): void { this.root.remove(); }
}
