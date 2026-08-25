import type { EventBus } from "../core/EventBus";
import type { SeededRng } from "../core/Rng";
import type { GameState } from "../core/types";

export interface DomainContext {
  state: GameState;
  rng: SeededRng;
  events: EventBus;
  nextEntityId(prefix: string): string;
  persistRng(): void;
}

export function distance2d(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
