export type BoatResponseKind = "cargo-load" | "dock";

interface BoatResponseImpulse {
  kind: BoatResponseKind;
  startedAtSeconds: number;
  side: number;
}

export interface BoatResponseSample {
  heaveMeters: number;
  pitchRadians: number;
  rollRadians: number;
}

const EMPTY_RESPONSE: BoatResponseSample = {
  heaveMeters: 0,
  pitchRadians: 0,
  rollRadians: 0
};

const DURATION_SECONDS: Readonly<Record<BoatResponseKind, number>> = {
  "cargo-load": 0.82,
  dock: 1.05
};

/**
 * Local presentation impulses for physical cargo and docking. Canonical boat
 * pose remains simulation-owned; these values only ride on top of sampled
 * water buoyancy and decay to zero.
 */
export class BoatResponsePresentation {
  private readonly impulses = new Map<string, BoatResponseImpulse[]>();

  public trigger(
    boatId: string,
    kind: BoatResponseKind,
    timeSeconds: number,
    slotIndex = 0
  ): void {
    const side = slotIndex % 2 === 0 ? -1 : 1;
    const queue = this.impulses.get(boatId) ?? [];
    queue.push({ kind, startedAtSeconds: timeSeconds, side });
    if (queue.length > 4) queue.splice(0, queue.length - 4);
    this.impulses.set(boatId, queue);
  }

  public sample(boatId: string, timeSeconds: number, reducedMotion: boolean): BoatResponseSample {
    if (reducedMotion) {
      this.prune(boatId, timeSeconds);
      return EMPTY_RESPONSE;
    }
    const queue = this.impulses.get(boatId);
    if (!queue?.length) return EMPTY_RESPONSE;

    let heaveMeters = 0;
    let pitchRadians = 0;
    let rollRadians = 0;
    const active: BoatResponseImpulse[] = [];
    for (const impulse of queue) {
      const duration = DURATION_SECONDS[impulse.kind];
      const elapsed = timeSeconds - impulse.startedAtSeconds;
      if (elapsed < 0 || elapsed >= duration) continue;
      active.push(impulse);
      const progress = elapsed / duration;
      const decay = (1 - progress) * (1 - progress);
      const oscillation = Math.sin(progress * Math.PI * 2.5) * decay;
      if (impulse.kind === "dock") {
        heaveMeters += Math.sin(progress * Math.PI) * 0.055 * decay;
        pitchRadians += oscillation * -0.026;
      } else {
        heaveMeters -= Math.sin(progress * Math.PI) * 0.045;
        pitchRadians -= oscillation * 0.011;
        rollRadians -= oscillation * 0.022 * impulse.side;
      }
    }
    if (active.length > 0) this.impulses.set(boatId, active);
    else this.impulses.delete(boatId);
    return { heaveMeters, pitchRadians, rollRadians };
  }

  public clear(): void {
    this.impulses.clear();
  }

  private prune(boatId: string, timeSeconds: number): void {
    const queue = this.impulses.get(boatId);
    if (!queue) return;
    const active = queue.filter((impulse) =>
      timeSeconds - impulse.startedAtSeconds < DURATION_SECONDS[impulse.kind]
    );
    if (active.length > 0) this.impulses.set(boatId, active);
    else this.impulses.delete(boatId);
  }
}
