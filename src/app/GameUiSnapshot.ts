import type { GameState } from "../simulation/core/types";

export interface DebugGameSnapshot {
  worldSeed: number;
  player: {
    x: number;
    y: number;
    z: number;
    rotationY: number;
    traversal: {
      isGrounded: boolean;
      sprintStamina: number;
      sprintExhausted: boolean;
      sprintRecoveryDelaySeconds: number;
    };
  };
  activeSchoolsCount: number;
  activeCropsCount: number;
  weatherType: GameState["weather"]["type"];
  activeBoat: { id: string; speed: number } | null;
  fishing: {
    isReeling: boolean;
    isSlacking: boolean;
    isBracing: boolean;
    rodDirectionAngle: number;
  } | null;
}

/** Detached DEV diagnostics; the React tree never receives the mutable GameState. */
export function selectDebugGameSnapshot(state: Readonly<GameState>): DebugGameSnapshot {
  const { player } = state;
  const activeBoat = player.activeBoatId ? state.boats[player.activeBoatId] : null;
  const fishing = state.sportFishing;
  return {
    worldSeed: state.worldSeed,
    player: {
      x: player.x,
      y: player.y,
      z: player.z,
      rotationY: player.rotationY,
      traversal: {
        isGrounded: player.traversal.isGrounded,
        sprintStamina: player.traversal.sprintStamina,
        sprintExhausted: player.traversal.sprintExhausted,
        sprintRecoveryDelaySeconds: player.traversal.sprintRecoveryDelaySeconds
      }
    },
    activeSchoolsCount: Object.keys(state.world.activeSchools).length,
    activeCropsCount: Object.keys(state.crops).length,
    weatherType: state.weather.type,
    activeBoat: activeBoat ? { id: activeBoat.id, speed: activeBoat.speed } : null,
    fishing: fishing ? {
      isReeling: fishing.isReeling,
      isSlacking: fishing.isSlacking,
      isBracing: fishing.isBracing,
      rodDirectionAngle: fishing.rodDirectionAngle
    } : null
  };
}
