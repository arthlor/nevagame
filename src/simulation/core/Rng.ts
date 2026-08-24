// src/simulation/core/Rng.ts

export interface Rng {
  nextFloat(): number;
  intInclusive(min: number, max: number): number;
  range(min: number, max: number): number;
  chance(probability: number): boolean;
  weighted<T>(entries: ReadonlyArray<{ value: T; weight: number }>): T;
  getSeed(): number;
  getState(): number;
}

export class SeededRng implements Rng {
  private seed: number;
  private state: number;

  constructor(seed: number, state?: number) {
    this.seed = seed;
    if (state !== undefined) {
      this.state = state;
    } else {
      this.state = seed >>> 0;
      if (this.state === 0) {
        this.state = 0x6d2b79f5;
      }
    }
  }

  public getSeed(): number {
    return this.seed;
  }

  public getState(): number {
    return this.state;
  }

  /**
   * Mulberry32 algorithm - fast, uniform 32-bit generator.
   */
  public nextFloat(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const res = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return res;
  }

  public intInclusive(min: number, max: number): number {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    if (lo >= hi) return lo;
    return lo + Math.floor(this.nextFloat() * (hi - lo + 1));
  }

  public range(min: number, max: number): number {
    return min + this.nextFloat() * (max - min);
  }

  public chance(probability: number): boolean {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return this.nextFloat() < probability;
  }

  public weighted<T>(entries: ReadonlyArray<{ value: T; weight: number }>): T {
    if (entries.length === 0) {
      throw new Error("Cannot select from empty weighted entries");
    }
    const positive = entries.filter((entry) => entry.weight > 0);
    if (positive.length === 0) {
      return entries[0].value;
    }
    let totalWeight = 0;
    for (const entry of positive) {
      totalWeight += entry.weight;
    }
    const roll = this.nextFloat() * totalWeight;
    let accum = 0;
    for (const entry of positive) {
      accum += entry.weight;
      if (roll < accum) {
        return entry.value;
      }
    }
    return positive[positive.length - 1].value;
  }
}
