// src/simulation/fishing/BasicFishingMinigame.ts

import { BasicFishingState, FishQuality, WeatherTag, TimeWindowId } from "../core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { Rng } from "../core/Rng";
import { MinigameFishBehavior } from "../../content/types";
import type { FishingEcologyId } from "../../world/WorldIslands";
import type { CastWindEffect } from "./castWind";

export interface BasicFishingMinigameConfig {
  gravity: number;
  thrust: number;
  maxUpVelocity: number;
  maxDownVelocity: number;
  bounceRestitution: number;
  progressUpRate: number;
  progressDownRate: number;
  treasureUpRate: number;
  treasureDownRate: number;
}

export const DEFAULT_MINIGAME_CONFIG: BasicFishingMinigameConfig = {
  gravity: -1.9,
  thrust: 2.8,
  maxUpVelocity: 1.4,
  maxDownVelocity: -1.6,
  bounceRestitution: 0.35,
  progressUpRate: 0.26,
  progressDownRate: 0.14,
  treasureUpRate: 0.45,
  treasureDownRate: 0.12
};

export class BasicFishingMinigame {
  public static calculateBarHeight(rodId: string, fishingProficiencyRank: number): number {
    const rod = ContentRegistry.rods.get(rodId);
    let rodBonus = 0.0;
    if (rod) {
      if (rod.rodClass === "willow") rodBonus = 0.02;
      else if (rod.rodClass === "river") rodBonus = 0.03;
      else if (rod.rodClass === "heavy-sport") rodBonus = 0.06;
      else if (rod.rodClass === "offshore" || rod.rodClass === "master") rodBonus = 0.08;
    }
    const skillBonus = Math.max(0, fishingProficiencyRank) * 0.015;
    const baseHeight = 0.20;
    return Math.min(0.45, Math.max(0.15, baseHeight + rodBonus + skillBonus));
  }

  public static weatherWaitMultiplier(weatherType: WeatherTag): number {
    switch (weatherType) {
      case "light-rain": return 0.9;
      case "heavy-rain": return 1.15;
      case "windy": return 1.1;
      case "fog": return 1.2;
      case "storm": return 1.25;
      default: return 1.0;
    }
  }

  public static timeOfDayWaitMultiplier(timeOfDay: TimeWindowId): number {
    switch (timeOfDay) {
      case "dawn":
      case "dusk":
        return 0.85;
      case "night":
        return 1.15;
      default:
        return 1.0;
    }
  }

  public static createInitialState(
    habitatId: string,
    catchItemId: string,
    castPower: number,
    rodId: string,
    fishingProficiencyRank: number,
    hasBait: boolean,
    rng: Rng,
    weatherType: WeatherTag = "clear",
    timeOfDay: TimeWindowId = "day",
    ecologyId: FishingEcologyId = "ecology.neva",
    /** Pure wind reading for this cast; omitted only by callers with no caster. */
    wind: CastWindEffect | null = null
  ): BasicFishingState {
    const barHeight = this.calculateBarHeight(rodId, fishingProficiencyRank);
    const hasTreasure = rng.chance(0.18);
    const treasureY = hasTreasure ? rng.range(0.15, 0.85) : 0;

    // Bait, cast power, weather, time of day and the wind affect bite wait.
    const baseWait = rng.range(4.0, 7.5);
    const baitMultiplier = hasBait ? 0.6 : 1.0;
    const powerMultiplier = 1.0 - (castPower * 0.25); // high power cuts wait by up to 25%
    const waitTime = Math.max(
      2.0,
      baseWait
        * baitMultiplier
        * powerMultiplier
        * this.weatherWaitMultiplier(weatherType)
        * this.timeOfDayWaitMultiplier(timeOfDay)
        * (wind?.waitMultiplier ?? 1)
    );

    // A tailwind carries the cast, a headwind drops it short, and a crosswind
    // sets it down off the aim line. `castWind.ts` owns those numbers.
    const castDistanceMeters = (3.0 + castPower * 9.0) * (wind?.distanceScale ?? 1); // ~3m to 12m
    const castLateralDriftMeters = wind?.lateralDriftMeters ?? 0;

    return {
      ecologyId,
      habitatId,
      phase: "waiting-bite",
      remainingSeconds: waitTime,
      catchItemId,
      willCatch: false,
      castPower,
      castDistanceMeters,
      castLateralDriftMeters,
      isChargingCast: false,
      castChargeDirection: 1,
      biteReactionWindowSeconds: rng.range(1.2, 1.5),
      hasBait,
      fishY: 0.25,
      fishVy: 0,
      fishTargetY: 0.35,
      fishTargetTimer: 1.2,
      barY: 0.0,
      barVy: 0,
      barHeight,
      catchProgress: 0.30,
      isPerfect: true,
      hasTreasure,
      treasureY,
      treasureProgress: 0.0,
      treasureCaught: false,
      quality: "common",
      isHolding: false
    };
  }

  public static tickCastCharging(state: BasicFishingState, deltaSeconds: number): void {
    if (state.phase !== "charging-cast" || !state.isChargingCast) return;
    const CHARGE_SPEED = 1.3; // Full cycle in ~1.5s
    const dir = state.castChargeDirection ?? 1;
    let power = (state.castPower ?? 0) + dir * CHARGE_SPEED * deltaSeconds;
    if (power >= 1.0) {
      power = 1.0;
      state.castChargeDirection = -1;
    } else if (power <= 0.0) {
      power = 0.0;
      state.castChargeDirection = 1;
    }
    state.castPower = power;
  }

  public static tick(
    state: BasicFishingState,
    deltaSeconds: number,
    rng: Rng,
    config: BasicFishingMinigameConfig = DEFAULT_MINIGAME_CONFIG
  ): "active" | "landed" | "escaped" {
    if (deltaSeconds <= 0) return "active";

    // 1. Update Green Bar Physics
    const barHeight = state.barHeight ?? 0.20;
    state.barHeight = barHeight;
    let barVy = state.barVy ?? 0;
    if (state.isHolding) {
      barVy += config.thrust * deltaSeconds;
    } else {
      barVy += config.gravity * deltaSeconds;
    }

    barVy = Math.max(config.maxDownVelocity, Math.min(config.maxUpVelocity, barVy));
    let barY = (state.barY ?? 0) + barVy * deltaSeconds;

    const maxBarY = 1.0 - barHeight;
    if (barY < 0) {
      barY = 0;
      if (barVy < -0.3) {
        barVy = -barVy * config.bounceRestitution;
      } else {
        barVy = 0;
      }
    } else if (barY > maxBarY) {
      barY = maxBarY;
      barVy = 0;
    }
    state.barY = barY;
    state.barVy = barVy;

    // 2. Update Fish AI Target & Position
    const species = state.catchItemId ? ContentRegistry.fishSpecies.get(state.catchItemId) : undefined;
    const behavior: MinigameFishBehavior = species?.minigameBehavior ?? "mixed";
    const difficulty = Math.max(15, Math.min(95, species?.minigameDifficulty ?? 35));

    let timer = (state.fishTargetTimer ?? 1.2) - deltaSeconds;
    if (timer <= 0) {
      this.pickNextFishTarget(state, behavior, difficulty, rng);
    } else {
      state.fishTargetTimer = timer;
    }

    this.updateFishMovement(state, behavior, difficulty, deltaSeconds);

    // 3. Collision with Green Bar
    const fishY = state.fishY ?? 0.25;
    const fishInsideBar = fishY >= barY && fishY <= barY + barHeight;

    let catchProgress = state.catchProgress ?? 0.30;
    if (fishInsideBar) {
      catchProgress += config.progressUpRate * deltaSeconds;
    } else {
      catchProgress -= config.progressDownRate * deltaSeconds;
      state.isPerfect = false; // Fish escaped bar at least once
    }

    catchProgress = Math.max(0.0, Math.min(1.0, catchProgress));
    state.catchProgress = catchProgress;

    // 4. Treasure Chest Collision
    if (state.hasTreasure && !state.treasureCaught) {
      const treasureY = state.treasureY ?? 0.5;
      const barCoversTreasure = treasureY >= barY && treasureY <= barY + barHeight;
      let treasureProgress = state.treasureProgress ?? 0.0;
      if (barCoversTreasure) {
        treasureProgress += config.treasureUpRate * deltaSeconds;
        if (treasureProgress >= 1.0) {
          treasureProgress = 1.0;
          state.treasureCaught = true;
        }
      } else {
        treasureProgress = Math.max(0.0, treasureProgress - config.treasureDownRate * deltaSeconds);
      }
      state.treasureProgress = treasureProgress;
    }

    // 5. Outcome Check
    if (catchProgress >= 1.0) {
      state.result = "landed";
      state.phase = "caught";
      state.quality = this.determineQuality(state.castPower ?? 0.75, state.isPerfect ?? true, rng);
      return "landed";
    }

    if (catchProgress <= 0.0) {
      state.result = "escaped";
      state.phase = "escaped";
      return "escaped";
    }

    return "active";
  }

  private static pickNextFishTarget(
    state: BasicFishingState,
    behavior: MinigameFishBehavior,
    difficulty: number,
    rng: Rng
  ): void {
    const diffFactor = difficulty / 100;

    switch (behavior) {
      case "smooth": {
        state.fishTargetY = rng.range(0.1, 0.9);
        state.fishTargetTimer = rng.range(1.6 - diffFactor * 0.6, 3.2 - diffFactor * 0.8);
        break;
      }
      case "sinker": {
        // 70% chance to target bottom half
        if (rng.chance(0.7)) {
          state.fishTargetY = rng.range(0.05, 0.35);
        } else {
          state.fishTargetY = rng.range(0.4, 0.85);
        }
        state.fishTargetTimer = rng.range(1.0 - diffFactor * 0.4, 2.2 - diffFactor * 0.6);
        break;
      }
      case "floater": {
        // 70% chance to target top half
        if (rng.chance(0.7)) {
          state.fishTargetY = rng.range(0.65, 0.95);
        } else {
          state.fishTargetY = rng.range(0.15, 0.6);
        }
        state.fishTargetTimer = rng.range(1.0 - diffFactor * 0.4, 2.2 - diffFactor * 0.6);
        break;
      }
      case "dart": {
        // High frequency erratic movements
        state.fishTargetY = rng.range(0.08, 0.92);
        state.fishTargetTimer = rng.range(0.4 - diffFactor * 0.15, 1.1 - diffFactor * 0.3);
        break;
      }
      case "mixed":
      default: {
        state.fishTargetY = rng.range(0.1, 0.9);
        state.fishTargetTimer = rng.range(0.8 - diffFactor * 0.3, 2.0 - diffFactor * 0.5);
        break;
      }
    }
  }

  private static updateFishMovement(
    state: BasicFishingState,
    behavior: MinigameFishBehavior,
    difficulty: number,
    deltaSeconds: number
  ): void {
    const diffSpeedMultiplier = 0.6 + (difficulty / 100) * 1.4;
    const targetY = state.fishTargetY ?? 0.35;
    const currentY = state.fishY ?? 0.25;
    const dy = targetY - currentY;

    let moveSpeed = 0.8 * diffSpeedMultiplier;
    if (behavior === "dart") moveSpeed = 1.4 * diffSpeedMultiplier;
    else if (behavior === "smooth") moveSpeed = 0.5 * diffSpeedMultiplier;

    // Smooth pursuit toward target
    const step = moveSpeed * deltaSeconds;
    let nextY = currentY;
    if (Math.abs(dy) <= step) {
      nextY = targetY;
      state.fishVy = 0;
    } else {
      const dir = Math.sign(dy);
      state.fishVy = dir * moveSpeed;
      nextY = currentY + state.fishVy * deltaSeconds;
    }

    state.fishY = Math.max(0.02, Math.min(0.98, nextY));
  }

  /**
   * The cast-power thresholds that actually move catch quality. Exported so the
   * cast meter can mark the same bands the roll uses, instead of a second set
   * of numbers that only looks meaningful.
   */
  public static readonly CAST_QUALITY_THRESHOLDS = Object.freeze({
    /** At or above this, the cast can roll up to fine. */
    good: 0.5,
    /** At or above this, the cast can roll up to exceptional. */
    prime: 0.85
  });

  public static determineQuality(castPower: number, isPerfect: boolean, rng: Rng): FishQuality {
    let qualityTier = 0; // 0 = common, 1 = fine, 2 = exceptional, 3 = trophy
    const { good, prime } = BasicFishingMinigame.CAST_QUALITY_THRESHOLDS;

    if (castPower >= prime) {
      if (rng.chance(0.55)) qualityTier = 2;
      else qualityTier = 1;
    } else if (castPower >= good) {
      if (rng.chance(0.40)) qualityTier = 1;
    }

    if (isPerfect) qualityTier += 1;

    if (qualityTier >= 3) return "trophy";
    if (qualityTier === 2) return "exceptional";
    if (qualityTier === 1) return "fine";
    return "common";
  }

  public static readonly COMMON_TREASURE_LOOT = ["item.bait_worms", "seed.wheat", "seed.carrot"] as const;
  public static readonly RARE_TREASURE_LOOT = ["item.basic_fertilizer"] as const;

  public static generateTreasureLoot(_habitatId: string, rng: Rng): string[] {
    const commonLoot = this.COMMON_TREASURE_LOOT.filter((id) => ContentRegistry.items.has(id));
    const rareLoot = this.RARE_TREASURE_LOOT.filter((id) => ContentRegistry.items.has(id));

    const loot: string[] = [];
    if (commonLoot.length > 0) {
      loot.push(commonLoot[rng.intInclusive(0, commonLoot.length - 1)]);
    }
    if (rareLoot.length > 0 && rng.chance(0.5)) {
      loot.push(rareLoot[rng.intInclusive(0, rareLoot.length - 1)]);
    }
    return loot;
  }
}
