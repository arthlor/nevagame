/**
 * Compatibility facade for presentation imports. The implementation and
 * commit clock live in simulation/actions/ActionTimeline.
 */
export {
  SIMULATION_ACTION_TIMINGS as AUTHORED_ACTION_TIMINGS,
  SIMULATION_ACTION_TIMINGS as FARMING_ACTION_TIMINGS,
  SimulationActionTimeline as FarmingActionController,
  SimulationActionTimeline as AuthoredActionTimeline
} from "../simulation/actions/ActionTimeline";

export type {
  AuthoredActionStage,
  AuthoredPresentationAction,
  FarmingActionCallbacks,
  FarmingActionPhase,
  FarmingActionSnapshot,
  FarmingActionTarget,
  FarmingActionTiming,
  FarmingPresentationAction
} from "../simulation/actions/ActionTimeline";
