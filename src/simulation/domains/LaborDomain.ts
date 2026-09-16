import { distance2d, type DomainContext } from "./DomainContext";
import type { ProgressionDomain } from "./ProgressionDomain";
import { LABOR_STATIONS, laborStationAt } from "../labor/LaborStations";
import type { InteractionResult, LaborHudDto, LaborStationDto } from "../core/contracts";

export interface LaborMinigameRuntime {
  stationId: string;
  meter: number;
  direction: 1 | -1;
}

const DEFAULT_METER_SPEED = 1.15;
const GOOD_BAND_PADDING = 0.1;

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
    if (!active) {
      return { active: false, stationId: null, stationName: "", meter: 0, targetMin: 0, targetMax: 0 };
    }
    const station = laborStationAt(active.stationId);
    return {
      active: true,
      stationId: active.stationId,
      stationName: station?.name ?? "Work",
      meter: active.meter,
      targetMin: station?.targetMin ?? 0,
      targetMax: station?.targetMax ?? 0
    };
  }

  /** Stations for proximity/interaction presentation; ownership stays here. */
  public inspectStations(): LaborStationDto[] {
    const player = this.context.state.player;
    const active = this.runtime !== null;
    return Object.values(LABOR_STATIONS).map((station) => {
      const used = this.progression.hasWorkedLaborStation(station.id);
      const canStart = !used && !active && !player.activeBoatId && !player.activeMountId;
      return {
        id: station.id,
        name: station.name,
        prompt: station.prompt,
        yield: station.yield,
        x: station.position.x,
        z: station.position.z,
        reachMeters: station.reachMeters,
        used,
        available: canStart && this.progression.hasWorkRoom(station.yield)
      };
    });
  }

  public start(stationId: string): InteractionResult {
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
    if (distance2d(player, station.position) > station.reachMeters) {
      return { success: false, reason: "Step closer to work here" };
    }
    if (this.progression.hasWorkedLaborStation(stationId)) {
      return { success: false, reason: "You have already done that work today" };
    }
    if (!this.progression.hasWorkRoom(station.yield)) {
      return { success: false, reason: "You are full of energy already" };
    }
    this.runtime = { stationId, meter: 0, direction: 1 };
    return { success: true };
  }

  public strike(): InteractionResult {
    const active = this.runtime;
    if (!active) return { success: false, reason: "No work in progress" };
    this.runtime = null;
    const station = laborStationAt(active.stationId);
    if (!station) return { success: false, reason: "There is no work here" };
    // A shift does not freeze the player in place; a strike from out of reach
    // abandons the swing rather than crediting it.
    if (distance2d(this.context.state.player, station.position) > station.reachMeters) {
      return { success: false, reason: "You stepped away from the work" };
    }
    const center = (station.targetMin + station.targetMax) / 2;
    const halfBand = (station.targetMax - station.targetMin) / 2;
    const distance = Math.abs(active.meter - center);
    let fraction = 0;
    if (distance <= halfBand) fraction = 1;
    else if (distance <= halfBand + GOOD_BAND_PADDING) fraction = 0.5;
    if (fraction <= 0) {
      return { success: false, reason: "The strike glanced off — line up the swing" };
    }
    const granted = this.progression.earnWork(Math.max(1, Math.round(station.yield * fraction)), station.id);
    if (granted <= 0) return { success: false, reason: "You are full of energy already" };
    return { success: true, yield: granted };
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
