import { ContentRegistry } from "../../content/ContentRegistry";
import { getRankForXp } from "../../content/progression";
import { OPEN_CHANNEL_REQUIREMENT } from "../../world/WorldIslands";
import { WorldLayout } from "../../world/WorldLayout";
import type { GameState } from "../core/types";
import { LABOR_STATIONS } from "../labor/LaborStations";
import { buildRecordMilestones } from "./buildRecordMilestones";

export interface WorldHintDto { hintId: string; title: string; message: string; icon: string }

export function buildNextWorldHint(state: GameState): WorldHintDto | null {
  const { player, clock } = state;
  const boat = player.activeBoatId ? state.boats[player.activeBoatId] : null;
  const atMarket = [...ContentRegistry.markets.values()].some(({ interactionPosition: point }) =>
    Math.hypot(player.x - point.x, player.z - point.z) <= point.radiusMeters + 1);
  const channel = boat && WorldLayout.navigationRequirementAt(
    boat.x + Math.sin(boat.headingRadians) * 12, boat.z + Math.cos(boat.headingRadians) * 12);
  // The timing lesson is proximity guidance, not an availability check: a
  // station the player cannot start today still explains how a shift is won.
  const nearLaborStation = !boat && !player.activeMountId
    && player.workCapacity.current < player.workCapacity.maximum
    && Object.values(LABOR_STATIONS).some((station) =>
      Math.hypot(player.x - station.position.x, player.z - station.position.z) <= station.reachMeters + 2);
  const candidates: Array<WorldHintDto & { eligible: boolean }> = [
    { hintId: "hint.first_storm_at_sea", eligible: Boolean(boat && state.weather.type === "storm"), title: "Storm at Sea", message: "Watch the vessel's swell warning and hull condition. Head for sheltered water; cargo freshness keeps ticking during the crossing.", icon: "waves" },
    { hintId: "hint.first_cargo_spoilage", eligible: Object.values(state.fishCargo).some((cargo) => cargo.freshness <= 0), title: "A Spoiled Catch", message: "This catch can no longer sell fresh. Clear the cargo space, then carry ice and shorten the next delivery route.", icon: "waves" },
    { hintId: "hint.open_channel", eligible: Boolean(channel), title: "The Open Channel", message: `${OPEN_CHANNEL_REQUIREMENT.message} Check fuel, hull and ice before committing to the crossing.`, icon: "compass" },
    { hintId: "hint.sprint_stamina", eligible: !boat && !player.activeMountId && player.traversal.sprintStamina < 50, title: "Catch Your Breath", message: "Sprinting draws on stamina. Walk or pause to recover it; this is separate from the Work you spend tending crops.", icon: "sparkle" },
    { hintId: "hint.labor_shift_timing", eligible: nearLaborStation, title: "A Fair Day's Work", message: "Press E at a chore station to start a shift, then strike when the needle crosses the gold band. A clean strike pays the full Work, a near miss pays half, and each station counts once a day.", icon: "sparkle" },
    { hintId: "hint.first_work_earning", eligible: !boat && !player.activeMountId && player.workCapacity.current < player.workCapacity.maximum * 0.4, title: "Work Is Earned", message: "Work refills by preparing for it: rest at the farmhouse, eat a cooked meal, or put in a shift at the firewood stack, drying racks or harbor nets. Each source is limited per day; a slow trickle also returns a little on its own.", icon: "sparkle" },
    { hintId: "hint.first_market", eligible: atMarket, title: "At the Market", message: "Compare the current quote before selling. Demand changes, and delivery contracts offer another use for your harvest and catch.", icon: "coin" },
    { hintId: "hint.first_contract", eligible: atMarket && state.contracts.some((contract) => contract.status === "active"), title: "A Delivery Promise", message: "Check a contract's destination, deadline and requirements before delivering. Its progress stays in the tracker while you gather the rest.", icon: "scroll" },
    { hintId: "hint.first_nightfall", eligible: clock.timeOfDay === "dusk" || clock.timeOfDay === "night", title: "Nightfall", message: "The village windows light the way home. Check the clock and forecast before another trip, or rest at the farmhouse until morning.", icon: "sparkle" },
    { hintId: "hint.first_rank_up", eligible: Object.values(player.proficiencies).some((xp) => getRankForXp(xp).rankIndex > 0), title: "Practice Recognized", message: "Your proficiency has reached a new rank. The journal's Skills page lists what your experience now makes available.", icon: "sprout" }
  ];
  const next = candidates.find((hint) => hint.eligible && !state.quests.hintsShown[hint.hintId]);
  if (!next) return null;
  return { hintId: next.hintId, title: next.title, message: next.message, icon: next.icon };
}

export function buildEndgameRecordTracker(state: GameState) {
  if (state.quests.activeActId !== "epilogue_open"
    || [...ContentRegistry.quests.keys()].some((id) => !state.quests.completedQuestIds.includes(id))) return [];
  return buildRecordMilestones(state).filter((record) => !record.achieved)
    .sort((left, right) => right.progress - left.progress || left.id.localeCompare(right.id)).slice(0, 3);
}
