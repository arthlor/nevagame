import type { InteractionTarget } from "../simulation/core/contracts";
import type { GameMode } from "../simulation/core/types";

export interface ResolvedInteractionTarget extends InteractionTarget {
  entityId?: string;
  stationId?: string;
  recipeId?: string;
  worldPosition?: { x: number; y: number; z: number };
  modes?: readonly GameMode[];
  requiresLineOfSight?: boolean;
}

export interface InteractionResolutionContext {
  mode: GameMode;
  player: { x: number; y: number; z: number; rotationY: number };
  hasLineOfSight?: (
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number }
  ) => boolean;
}

interface RankedTarget {
  target: ResolvedInteractionTarget;
  facingPenalty: number;
}

/**
 * Presentation selection only. Simulation commands still revalidate distance,
 * mode, inventory and authoritative state at commit time.
 */
export class InteractionTargetResolver {
  public resolve(
    candidates: readonly ResolvedInteractionTarget[],
    context: InteractionResolutionContext
  ): ResolvedInteractionTarget | null {
    const forwardX = Math.sin(context.player.rotationY);
    const forwardZ = Math.cos(context.player.rotationY);
    const ranked: RankedTarget[] = [];

    for (const target of candidates) {
      if (target.modes && !target.modes.includes(context.mode)) continue;
      let facingPenalty = 0;
      if (target.worldPosition && target.distanceMeters > 0.15) {
        const dx = target.worldPosition.x - context.player.x;
        const dz = target.worldPosition.z - context.player.z;
        const length = Math.hypot(dx, dz);
        if (length > 0.001) {
          const facing = (dx * forwardX + dz * forwardZ) / length;
          facingPenalty = (1 - facing) * 0.5;
        }
      }
      ranked.push({
        target,
        facingPenalty
      });
    }

    ranked.sort((a, b) =>
      a.target.priority - b.target.priority ||
      a.facingPenalty - b.facingPenalty ||
      a.target.distanceMeters - b.target.distanceMeters ||
      a.target.id.localeCompare(b.target.id)
    );

    for (const { target } of ranked) {
      if (
        target.requiresLineOfSight &&
        target.worldPosition &&
        context.hasLineOfSight &&
        !context.hasLineOfSight(
          { x: context.player.x, y: context.player.y + 0.8, z: context.player.z },
          { x: target.worldPosition.x, y: target.worldPosition.y + 0.45, z: target.worldPosition.z }
        )
      ) continue;
      return target;
    }
    return null;
  }
}
