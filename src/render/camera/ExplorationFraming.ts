import * as THREE from "three";
import type { GameMode } from "../../simulation/core/types";
import { sampleWorldComposition } from "../../world/WorldCompositionField";
import { WorldLayout } from "../../world/WorldLayout";

/** Landscape context only. Camera framing cannot change a route or interaction. */
export function explorationFramingAt(worldSeed: number, x: number, z: number, mode: GameMode): number {
  if (WorldLayout.isInterior(x, z)) return 0;
  if (mode === "boat-driving") {
    return THREE.MathUtils.smoothstep(WorldLayout.marineSampleAt(x, z).signedShoreDistance, 8, 32);
  }
  if (mode !== "on-foot" && mode !== "mounted") return 0;
  const composition = sampleWorldComposition(worldSeed, x, z);
  const work = Math.max(composition.architectureClearance, WorldLayout.farmSoilInfluence(x, z));
  const enclosure = THREE.MathUtils.clamp(
    composition.habitat.woodland * 0.7 + composition.density.tree * 0.8,
    0, 1
  );
  return (1 - THREE.MathUtils.smoothstep(work, 0.05, 0.7))
    * THREE.MathUtils.lerp(0.25, 1, 1 - enclosure);
}

/** Reuse habitat queries until the player moves; a mouse orbit never samples a new landscape. */
export class ExplorationFraming {
  private x = Number.NaN;
  private z = Number.NaN;
  private seed = Number.NaN;
  private mode: GameMode | null = null;
  private weight = 0;

  public sample(worldSeed: number, x: number, z: number, mode: GameMode, taskActive: boolean): number {
    if (taskActive) return 0;
    if (worldSeed !== this.seed || mode !== this.mode || !Number.isFinite(this.x)
      || Math.hypot(x - this.x, z - this.z) >= 0.75) {
      this.weight = explorationFramingAt(worldSeed, x, z, mode);
      this.x = x; this.z = z; this.seed = worldSeed; this.mode = mode;
    }
    return this.weight;
  }
}
