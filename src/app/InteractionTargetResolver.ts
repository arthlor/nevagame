import type { EquippedToolId, InteractionTarget } from "../simulation/core/contracts";
import type { GameMode } from "../simulation/core/types";

export interface ResolvedInteractionTarget extends InteractionTarget {
  entityId?: string;
  stationId?: string;
  recipeId?: string;
  worldPosition?: { x: number; y: number; z: number };
  modes?: readonly GameMode[];
  requiresLineOfSight?: boolean;
  /**
   * The tool this verb is performed with. The player no longer has to equip it
   * first — the interaction swaps it in — but holding it deliberately is how
   * they choose between verbs a plot offers at once.
   */
  requiresTool?: EquippedToolId;
}

export interface InteractionResolutionContext {
  mode: GameMode;
  player: { x: number; y: number; z: number; rotationY: number };
  /** The tool in hand, used only to break ties between competing verbs. */
  activeTool?: EquippedToolId;
  hasLineOfSight?: (
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number }
  ) => boolean;
}

interface RankedTarget {
  target: ResolvedInteractionTarget;
  facingPenalty: number;
  /** 0 when the target's verb matches the tool in hand, 1 otherwise. */
  toolPenalty: number;
}

function isProximityFirstCrop(target: ResolvedInteractionTarget): boolean {
  return target.kind === "crop" && (
    target.action === "harvest" ||
    target.action === "water" ||
    target.action === "fertilize"
  );
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
        facingPenalty,
        toolPenalty:
          context.activeTool && target.requiresTool === context.activeTool ? 0 : 1
      });
    }

    ranked.sort((a, b) => {
      const priority = a.target.priority - b.target.priority;
      if (priority !== 0) return priority;

      // A plot can be ripe and dry at once. The verbs are no longer gated on
      // the equipped tool, so holding one is how the player says which they
      // meant; otherwise the authored priority decides.
      const tool = a.toolPenalty - b.toolPenalty;
      if (tool !== 0) return tool;

      // Adjacent crops are authored as separate interaction lots. Once a
      // harvest/water/fertilize action is available, the closest lot is the
      // least surprising target; facing should not steal a prompt from the
      // crop the player deliberately walked to.
      if (isProximityFirstCrop(a.target) && isProximityFirstCrop(b.target)) {
        return a.target.distanceMeters - b.target.distanceMeters ||
          a.facingPenalty - b.facingPenalty ||
          a.target.id.localeCompare(b.target.id);
      }

      return a.facingPenalty - b.facingPenalty ||
        a.target.distanceMeters - b.target.distanceMeters ||
        a.target.id.localeCompare(b.target.id);
    });

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
