import type { DomainContext } from "./DomainContext";
import { assessInteractionReach } from "../../world/InteractionReach";
import type { ProgressionDomain } from "./ProgressionDomain";
import { LABOR_STATIONS, laborStationAt, type LaborStationDefinition } from "../labor/LaborStations";
import type { InteractionResult, LaborHudDto, LaborStationDto } from "../core/contracts";

export interface LaborMinigameRuntime {
  stationId: string;
  meter: number;
  direction: 1 | -1;
}

const DEFAULT_METER_SPEED = 1.15;
const GOOD_BAND_PADDING = 0.1;

function timingGradeFor(station: LaborStationDefinition, meter: number): LaborHudDto["timingGrade"] {
  if (meter >= station.targetMin && meter <= station.targetMax) return "clean";
  if (meter >= station.targetMin - GOOD_BAND_PADDING && meter <= station.targetMax + GOOD_BAND_PADDING) return "glancing";
  return "miss";
}

function workForGrade(station: LaborStationDefinition, grade: LaborHudDto["timingGrade"]): number {
  return grade === "miss" ? 0 : Math.max(1, Math.round(station.yield * (grade === "clean" ? 1 : 0.5)));
}

/**
 * Skill-based Work capture. The meter is a pure function of elapsed real time
 * and input timing, so it stays deterministic for a given input timeline. The
 * runtime state is intentionally not persisted: a reload simply abandons the
 * shift, and nothing is spent to start one.
 */
export class LaborDomain {
  private runtime: LaborMinigameRuntime | null = null;

  constructor(
    private readonly context: DomainContext,
    private readonly progression: ProgressionDomain
  ) {}

  public getRuntime(): LaborMinigameRuntime | null {
    return this.runtime;
  }

  public inspectHud(): LaborHudDto {
    const active = this.runtime;
    const daily = this.inspectDailyChores();
    if (!active) {
      return {
        active: false, stationId: null, stationName: "", yield: 0, glancingYield: 0,
        meter: 0, targetMin: 0, targetMax: 0, glancingMin: 0, glancingMax: 0,
        timingGrade: "miss", ...daily
      };
    }
    const station = laborStationAt(active.stationId);
    return {
      active: true,
      stationId: active.stationId,
      stationName: station?.name ?? "Work",
      yield: station?.yield ?? 0,
      glancingYield: station ? workForGrade(station, "glancing") : 0,
      glancingMin: Math.max(0, (station?.targetMin ?? 0) - GOOD_BAND_PADDING),
      glancingMax: Math.min(1, (station?.targetMax ?? 0) + GOOD_BAND_PADDING),
      timingGrade: station ? timingGradeFor(station, active.meter) : "miss",
      ...daily,
      meter: active.meter,
      targetMin: station?.targetMin ?? 0,
      targetMax: station?.targetMax ?? 0
    };
  }

  /** Stations for proximity/interaction presentation; ownership stays here. */
  public inspectStations(): LaborStationDto[] {
    const player = this.context.state.player;
    const active = this.runtime !== null;
    const daily = this.inspectDailyChores();
    return Object.values(LABOR_STATIONS).map((station) => {
      const used = this.progression.hasWorkedLaborStation(station.id);
      const blocker = player.carriedFishCargoId
        ? "Stow physical fish cargo before working"
        : active
          ? "Finish the job in hand"
          : this.context.state.basicFishing || this.context.state.sportFishing
            ? "Put the rod away first"
            : player.activeBoatId || player.activeMountId
              ? "Dismount before working here"
              : used
                ? "You have already done that work today"
                : this.progression.workRoomBlocker(station.yield);
      return {
        id: station.id,
        name: station.name,
        prompt: station.prompt,
        yield: station.yield,
        x: station.position.x,
        z: station.position.z,
        reachMeters: station.reachMeters,
        used,
        available: blocker === null,
        blocker,
        ...daily
      };
    });
  }

  public start(stationId: string): InteractionResult {
    if (this.context.state.player.carriedFishCargoId) {
      return { success: false, reason: "Stow physical fish cargo before working" };
    }
    if (this.runtime) return { success: false, reason: "Finish the job in hand" };
    if (this.context.state.basicFishing || this.context.state.sportFishing) {
      return { success: false, reason: "Put the rod away first" };
    }
    const station = laborStationAt(stationId);
    if (!station) return { success: false, reason: "There is no work here" };
    const player = this.context.state.player;
    if (player.activeBoatId || player.activeMountId) {
      return { success: false, reason: "Dismount before working here" };
    }
    const approach = assessInteractionReach(player, station.position, station.reachMeters);
    if (!approach.ok) {
      return {
        success: false,
        reason: approach.failure === "wrong-level" ? "That work is on another level" : "Step closer to work here"
      };
    }
    if (this.progression.hasWorkedLaborStation(stationId)) {
      return { success: false, reason: "You have already done that work today" };
    }
    const workBlocker = this.progression.workRoomBlocker(station.yield);
    if (workBlocker) return { success: false, reason: workBlocker };
    this.runtime = { stationId, meter: 0, direction: 1 };
    return { success: true };
  }

  public strike(): InteractionResult {
    if (this.context.state.player.carriedFishCargoId) {
      return { success: false, reason: "Stow physical fish cargo before working" };
    }
    const active = this.runtime;
    if (!active) return { success: false, reason: "No work in progress" };
    this.runtime = null;
    const station = laborStationAt(active.stationId);
    if (!station) return { success: false, reason: "There is no work here" };
    if (this.context.state.basicFishing || this.context.state.sportFishing) {
      return { success: false, reason: "Put the rod away first" };
    }
    const player = this.context.state.player;
    if (player.activeBoatId || player.activeMountId) {
      return { success: false, reason: "Dismount before working here" };
    }
    // A shift does not freeze the player in place; a strike from out of reach
    // abandons the swing rather than crediting it.
    const approach = assessInteractionReach(this.context.state.player, station.position, station.reachMeters);
    if (!approach.ok) {
      return {
        success: false,
        reason: approach.failure === "wrong-level"
          ? "That work is on another level"
          : "You stepped away from the work"
      };
    }
    const grade = timingGradeFor(station, active.meter);
    if (grade === "miss") {
      return { success: false, reason: "The strike glanced off — line up the swing" };
    }
    const requested = workForGrade(station, grade);
    const workBlocker = this.progression.workRoomBlocker(requested);
    if (workBlocker) return { success: false, reason: workBlocker };
    const granted = this.progression.earnWork(requested, station.id);
    if (granted <= 0) return { success: false, reason: "You are full of energy already" };
    return { success: true, yield: granted, grade };
  }

  private inspectDailyChores(): Pick<LaborHudDto, "choresRemaining" | "totalChores"> {
    const used = this.progression.getWorkDailyStatus().laborUsedToday;
    const stations = Object.values(LABOR_STATIONS);
    return {
      choresRemaining: stations.filter((station) => !used.includes(station.id)).length,
      totalChores: stations.length
    };
  }

  public cancel(): InteractionResult {
    if (!this.runtime) return { success: false, reason: "No work in progress" };
    this.runtime = null;
    return { success: true };
  }

  public tick(realSeconds: number): void {
    if (!this.runtime) return;
    // Fishing takes both hands; a shift cannot continue through a cast or a
    // sport fight, however that encounter was started.
    if (this.context.state.basicFishing || this.context.state.sportFishing) {
      this.runtime = null;
      return;
    }
    if (!Number.isFinite(realSeconds) || realSeconds <= 0) return;
    const station = laborStationAt(this.runtime.stationId);
    const speed = station?.meterSpeed ?? DEFAULT_METER_SPEED;
    let meter = this.runtime.meter + this.runtime.direction * speed * realSeconds;
    let direction = this.runtime.direction;
    while (meter > 1 || meter < 0) {
      if (meter > 1) {
        meter = 2 - meter;
        direction = -1;
      } else {
        meter = -meter;
        direction = 1;
      }
    }
    this.runtime.meter = Math.max(0, Math.min(1, meter));
    this.runtime.direction = direction;
  }
}
