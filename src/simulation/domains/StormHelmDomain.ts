// src/simulation/domains/StormHelmDomain.ts

import { ContentRegistry } from "../../content/ContentRegistry";
import { WorldLayout } from "../../world/WorldLayout";
import {
  HULL_LIFE_STEPS,
  boatHullLives,
  damageBoatHull,
  isBoatWrecked,
  restoreBoatHull
} from "../boats/BoatHull";
import {
  STORM_HELM,
  STORM_HELM_FIXED_STEP_SECONDS,
  STORM_HELM_MAX_REAL_STEP_SECONDS,
  createStormHelmRuntime,
  stepStormHelm,
  type StormHelmContext,
  type StormHelmRuntime
} from "../boats/StormHelm";
import type { StormHelmHudDto } from "../core/contracts";
import type { BoatId, BoatState } from "../core/types";
import type { DomainContext } from "./DomainContext";

/**
 * Owns the live storm-helm challenge for the boat the player is currently
 * driving. The runtime is intentionally not serialized: a reload abandons the
 * current gust (and only the gust), while the hull damage it caused remains in
 * `BoatState.durability`. Outcomes are applied here so no presentation code
 * ever mutates the hull.
 */
export class StormHelmDomain {
  private runtime: StormHelmRuntime | null = null;
  private remainderSeconds = 0;
  private consecutiveFails = 0;

  constructor(private readonly context: DomainContext) {}

  public tick(realDeltaSeconds: number): void {
    if (!Number.isFinite(realDeltaSeconds) || realDeltaSeconds <= 0) return;
    const state = this.context.state;
    const boatId = state.player.activeBoatId;
    const boat = boatId ? state.boats[boatId] : undefined;
    const definition = boat ? ContentRegistry.boats.get(boat.boatTypeId) : undefined;
    if (!boat || !boatId || !definition) {
      this.runtime = null;
      this.remainderSeconds = 0;
      this.consecutiveFails = 0;
      return;
    }
    if (!this.runtime || this.runtime.boatId !== boatId) {
      this.runtime = createStormHelmRuntime(boatId);
      this.remainderSeconds = 0;
      this.consecutiveFails = 0;
    }
    if (isBoatWrecked(boat)) {
      this.runtime.phase = "idle";
      this.runtime.heel = 0;
      this.runtime.heelVelocity = 0;
      this.runtime.exposureSeconds = 0;
      this.remainderSeconds = 0;
      return;
    }

    const context: StormHelmContext = {
      definition,
      boat,
      weather: state.weather,
      timeOfDay: state.clock.timeOfDay,
      openWaterExposure: WorldLayout.marineSampleAt(boat.x, boat.z).openWaterExposure
    };
    this.remainderSeconds += Math.min(realDeltaSeconds, STORM_HELM_MAX_REAL_STEP_SECONDS);
    while (this.remainderSeconds >= STORM_HELM_FIXED_STEP_SECONDS) {
      this.remainderSeconds -= STORM_HELM_FIXED_STEP_SECONDS;
      const outcome = stepStormHelm(this.runtime, context, STORM_HELM_FIXED_STEP_SECONDS);
      if (outcome.kind === "survived") this.resolveSurvived(boatId, boat);
      else if (outcome.kind === "failed") this.resolveFailed(boatId, boat, outcome.reason);
    }
  }

  public inspectHud(): StormHelmHudDto {
    const state = this.context.state;
    const boatId = state.player.activeBoatId;
    const boat = boatId ? state.boats[boatId] : undefined;
    const runtime = this.runtime && this.runtime.boatId === boatId ? this.runtime : null;
    const hullLives = boat ? boatHullLives(boat) : 0;
    if (!boat || !runtime) {
      return {
        active: false,
        boatId: boat ? boat.id : null,
        phase: "idle",
        heel: 0,
        heelSafeHalfWidth: STORM_HELM.heelSafeHalfWidth,
        gustStrength: 0,
        remainingSeconds: 0,
        hullLives,
        maxLives: HULL_LIFE_STEPS,
        consecutiveFails: this.consecutiveFails,
        lastResult: null,
        failReason: null,
        wrecked: boat ? isBoatWrecked(boat) : false
      };
    }
    const remainingSeconds = runtime.phase === "gust"
      ? Math.max(0, runtime.durationSeconds - runtime.elapsedSeconds)
      : 0;
    return {
      active: runtime.phase !== "idle",
      boatId: boat.id,
      phase: runtime.phase,
      // The needle and its meter must stay inside -1..1 even on the overshoot
      // step that broaches her.
      heel: Math.max(-1, Math.min(1, runtime.heel)),
      heelSafeHalfWidth: STORM_HELM.heelSafeHalfWidth,
      gustStrength: runtime.gustStrength,
      remainingSeconds,
      hullLives,
      maxLives: HULL_LIFE_STEPS,
      consecutiveFails: this.consecutiveFails,
      lastResult: runtime.result,
      failReason: runtime.failReason,
      wrecked: isBoatWrecked(boat)
    };
  }

  private resolveSurvived(boatId: BoatId, boat: BoatState): void {
    this.consecutiveFails = 0;
    const restored = restoreBoatHull(boat, 1);
    this.context.events.emit("BoatGustSurvived", {
      boatId,
      restored,
      minute: this.context.state.clock.currentMinute
    });
  }

  private resolveFailed(
    boatId: BoatId,
    boat: BoatState,
    reason: "broach" | "sustained"
  ): void {
    this.consecutiveFails += 1;
    damageBoatHull(boat, 1);
    this.context.events.emit("BoatGustFailed", {
      boatId,
      reason,
      durability: boat.durability,
      consecutiveFails: this.consecutiveFails,
      minute: this.context.state.clock.currentMinute
    });
    if (isBoatWrecked(boat)) {
      boat.speed = 0;
      this.context.events.emit("BoatWrecked", {
        boatId,
        minute: this.context.state.clock.currentMinute
      });
      this.context.events.emit("Notification", {
        title: "Hull lost",
        message: "The storm has taken her. Signal a tow and see Silas at the harbor.",
        type: "warning"
      });
    } else {
      this.context.events.emit("Notification", {
        title: reason === "broach" ? "Broached!" : "Hull struck",
        message: `${boatHullLives(boat)} of ${HULL_LIFE_STEPS} hull lives left`,
        type: "warning"
      });
    }
  }
}
