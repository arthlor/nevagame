import { UI_PRODUCE, UI_SEEDS, UI_SUPPLIES, UI_FISH } from "../chrome/uiAtlas.generated";
import type { Camera } from "three";
import type { RewardFeedbackDto } from "../../simulation/presentation/RewardFeedbackPresentation";
import { projectWorldToScreen } from "./worldScreenProjection";

const ITEM_ART: Record<string, string> = { ...UI_PRODUCE, ...UI_SEEDS, ...UI_SUPPLIES, ...UI_FISH };
interface RewardSlot { icon: HTMLImageElement; landed: boolean; node: HTMLDivElement; reward: RewardFeedbackDto | null; born: number; row: number }

/** Fixed DOM pool follows the live camera without React renders or gameplay timers. */
export class WorldRewardOverlay {
  private readonly slots: RewardSlot[] = [];
  private cursor = 0;
  private readonly motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  constructor(parent: HTMLElement) {
    for (let index = 0; index < 12; index++) {
      const node = document.createElement("div");
      node.className = "world-reward";
      node.hidden = true;
      node.setAttribute("aria-hidden", "true");
      const icon = document.createElement("img");
      icon.className = "world-pickup-arc";
      icon.alt = "";
      icon.hidden = true;
      parent.append(node, icon);
      this.slots.push({ icon, landed: false, node, reward: null, born: 0, row: 0 });
    }
  }

  push(rewards: RewardFeedbackDto[], now: number): void {
    rewards.forEach((reward, row) => {
      const slot = this.slots[this.cursor++ % this.slots.length];
      slot.reward = reward;
      slot.landed = false;
      slot.icon.hidden = true;
      if (reward.itemId && ITEM_ART[reward.itemId]) slot.icon.src = ITEM_ART[reward.itemId];
      slot.born = now;
      slot.row = row;
      slot.node.textContent = reward.text;
      slot.node.dataset.kind = reward.kind;
      slot.node.dataset.loss = String(reward.amount < 0);
    });
  }

  update(camera: Camera, viewport: { width: number; height: number }, now: number): void {
    for (const slot of this.slots) {
      if (!slot.reward) continue;
      const age = (now - slot.born) / 1900;
      if (age >= 1) { slot.node.hidden = true; slot.icon.hidden = true; slot.reward = null; continue; }
      const projection = projectWorldToScreen(slot.reward, camera, viewport);
      slot.node.hidden = !projection.onScreen;
      if (slot.reward.kind === "item" && slot.reward.itemId) {
        const destination = document.querySelector<HTMLElement>("[data-testid=micro-btn-satchel]");
        const travel = Math.min(1, age * 2.5);
        if (destination && projection.onScreen && !this.motion.matches && ITEM_ART[slot.reward.itemId] && travel < 1) {
          const rect = destination.getBoundingClientRect();
          const endX = rect.left + rect.width / 2, endY = rect.top + rect.height / 2;
          slot.icon.hidden = false;
          slot.icon.style.transform = `translate(${projection.x + (endX - projection.x) * travel}px, ${projection.y + (endY - projection.y) * travel - Math.sin(travel * Math.PI) * 90}px) translate(-50%, -50%) scale(${1 - travel * 0.45})`;
        } else slot.icon.hidden = true;
        if (!slot.landed && (travel >= 1 || this.motion.matches)) {
          slot.landed = true;
          destination?.animate([{ filter: "brightness(1.7)" }, { filter: "brightness(1)" }], { duration: 420 });
        }
      }
      const rise = this.motion.matches ? 0 : 42 * (1 - (1 - age) ** 2);
      const drift = this.motion.matches ? 0 : Math.sin(age * Math.PI) * 12;
      slot.node.style.transform = `translate(${projection.x + drift}px, ${projection.y - rise - slot.row * 23}px) translate(-50%, -100%)`;
      slot.node.style.opacity = String(Math.min(1, (1 - age) * 3));
    }
  }

  dispose(): void { for (const slot of this.slots) { slot.node.remove(); slot.icon.remove(); } }
}
