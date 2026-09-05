import { ContentRegistry } from "../../content/ContentRegistry";
import { WorldLayout } from "../../world/WorldLayout";
import type {
  BasicFishingPhase,
  BasicFishingState,
  BoatId,
  CargoClass,
  FishBehavior,
  FishSchoolId,
  FishSchoolState,
  FishSpeciesId,
  FishingEncounterState,
  FishInstance,
  FishQuality,
  GameState
} from "../core/types";
import { BasicFishingMinigame } from "../fishing/BasicFishingMinigame";
import { castWindEffect, type CastWindEffect } from "../fishing/castWind";
import {
  FishingEncounter,
  sportFishingMaxStartDistanceMeters,
  sportFishingStartDistanceForWeight
} from "../fishing/FishingEncounter";
import {
  FISHING_TUNING,
  FISHING_STEER_INPUT_MAX,
  findFishingWater,
  fishingBehaviorReadout,
  fishingWindOpportunity
} from "../fishing/FishingTuning";
import {
  accessibleFishingSupplyCount,
  consumeAccessibleFishingSupply
} from "../fishing/FishingSupplies";
import { isSpeciesInSeason, speciesSeasonWeight } from "../fishing/seasonalAvailability";

/** Telemetry ratios are reported as -1..1 before being scaled to a percentage. */
const clampUnit = (value: number): number =>
  Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
import { InventoryManager } from "../inventory/InventoryManager";
import type { CargoDomain } from "./CargoDomain";
import type { DomainContext } from "./DomainContext";
import { distance2d } from "./DomainContext";
import type { ProgressionDomain } from "./ProgressionDomain";
import { cargoClassFits, freeHandsBlocker, rodMeetsMinimum, rollSpeciesWeightKg } from "./domainRules";
import type { SportFishingHudDto, WaterReadingDto } from "../core/contracts";
import {
  FISHING_ECOLOGY_DEFINITIONS,
  type FishingEcologyId
} from "../../world/WorldIslands";
import { isQuestActive } from "../core/QuestTypes";

const SCHOOL_INTERACTION_RADIUS = 12;
/** Floor so a shoulder-season-only school still has a selectable species pool. */
const MINIMUM_SCHOOL_SPECIES_WEIGHT = 1;
const SCHOOL_RESPAWN_COOLDOWN_MINUTES = 90;
const SCHOOL_CATCH_POTENTIAL = 3;
const SCHOOL_PRESSURE_COOLDOWN_MINUTES = 20;
const SCHOOL_PRESSURE_DECAY_MINUTES = 240;
const SCHOOL_POSITION_OFFSETS = Object.freeze([
  { x: 0, z: 0 },
  { x: 4, z: 2.5 },
  { x: -3.5, z: 3 },
  { x: 2.5, z: -4 }
]);
export const BASIC_FISHING_WORK_COST = 15;
/** Bite-reaction is a short input window; a hitch must not consume the whole cue. */
const BITE_REACTION_MAX_STEP_SECONDS = 0.05;
/**
 * Sport-fishing hook cost scales with the size of fish a school can yield, so a
 * lake trout is a light bite of the Work pool while a pelagic tuna costs more.
 */
export const SPORT_FISHING_WORK_COST_BY_CLASS: Record<CargoClass, number> = {
  small: 18,
  medium: 28,
  large: 36,
  gargantuan: 44
};
/** Representative cost shown in interaction prompts before a species is rolled. */
export const SPORT_FISHING_WORK_COST = SPORT_FISHING_WORK_COST_BY_CLASS.medium;
/** Portion of the discounted hook cost returned when a hooked sport fish is lost. */
export const SPORT_FISHING_WORK_REFUND_RATIO = 0.6;
/** Fight seconds a species signature moment stays on the HUD after it fires. */
export const SIGNATURE_MOMENT_SECONDS = 3;
/**
 * Characteristic behavior that triggers each sport species' one-per-fight
 * signature moment. `"run"` matches either lateral run direction.
 */
const SIGNATURE_TRIGGER_BEHAVIOR: Record<string, "run" | FishBehavior> = {
  "fish.trout": "surface",
  "fish.catfish": "dive",
  "fish.pike": "shake",
  "fish.arowana": "surface",
  "fish.tuna": "run",
  "fish.sturgeon": "dive",
  "fish.sailfish": "surface",
  "fish.swordfish": "burst",
  "fish.blue_marlin": "surface",
  "fish.carp": "run",
  "fish.amberjack": "run"
};
/** HUD copy for each signature moment, keyed by species id. */
const SIGNATURE_MOMENT_COPY: Record<string, string> = {
  "fish.trout": "The trout breaks the surface!",
  "fish.catfish": "The catfish hangs deep and heavy.",
  "fish.pike": "The pike shakes the hook violently!",
  "fish.arowana": "The arowana leaps — a flash of gold!",
  "fish.tuna": "The tuna runs — hold your line!",
  "fish.sturgeon": "The sturgeon settles into the deep.",
  "fish.sailfish": "The sailfish raises its sail!",
  "fish.swordfish": "The swordfish surges with power!",
  "fish.blue_marlin": "The marlin clears the water!",
  "fish.carp": "The carp turns, slow and ponderous.",
  "fish.amberjack": "The amberjack powers away!"
};
/**
 * Chum cast precedence: one chum per cast, strongest scent first. Standard
 * holds a frenzy 30 minutes, rich 60, deep 45 plus its sinker lean.
 */
const CHUM_CAST_PRECEDENCE = [
  { itemId: "item.chum_deep", frenzyMinutes: 45, deep: true },
  { itemId: "item.chum_rich", frenzyMinutes: 60, deep: false },
  { itemId: "item.chum_bucket", frenzyMinutes: 30, deep: false }
] as const;
/** Sinker species feed this many times as confidently while deep chum holds. */
export const DEEP_CHUM_SINKER_MULTIPLIER = 3;
/** Pure hook-roll weight multiplier for the deep-chum lean. */
export function deepChumWeightMultiplier(
  minigameBehavior: string | undefined,
  deepActive: boolean
): number {
  return deepActive && minigameBehavior === "sinker" ? DEEP_CHUM_SINKER_MULTIPLIER : 1;
}
/**
 * Signature sport species per fishing ground: the fish a ground is known
 * for. Familiarity is derived from journal catches of this species, so no
 * ground ever needs stored memory of its own.
 */
export const GROUND_SIGNATURE_SPECIES: Record<string, string> = {
  "ecology.neva:river": "fish.trout",
  "ecology.neva:lake": "fish.trout",
  "ecology.neva:coast": "fish.tuna",
  "ecology.neva:offshore": "fish.blue_marlin",
  "ecology.sunreach:coast": "fish.amberjack",
  "ecology.sunreach:offshore": "fish.amberjack"
};
/** Familiarity from a signature species' lifetime landed count. Pure. */
export function groundFamiliarityLevel(signatureCatchCount: number): 0 | 1 | 2 | 3 {
  if (signatureCatchCount >= 12) return 3;
  if (signatureCatchCount >= 6) return 2;
  if (signatureCatchCount >= 2) return 1;
  return 0;
}
/** Hook-roll weight multiplier for a familiar ground's signature species. Pure. */
export function familiarityWeightMultiplier(level: number): number {
  return 1 + 0.25 * Math.max(0, Math.min(3, level));
}
/** Water-reading brief words per familiarity level; level 0 stays silent. */
export const FAMILIARITY_LABEL: Record<number, string> = {
  1: "familiar water",
  2: "well-known water",
  3: "home water"
};
/** Calm-water ceiling for the Act 5 teaching fight's sea snapshot. */
export const STARTER_SCHOOL_CALM_ROUGHNESS = 0.25;

/**
 * The Act 5 starter school by construction: trout-only, lake, Neva ecology.
 * Matches both the relocated branch (`weight: 1`) and a fresh spawn of the
 * same single-species pool, without new saved state.
 */
export function isStarterTeachingSchool(school: FishSchoolState): boolean {
  return (
    school.ecologyId === "ecology.neva" &&
    school.habitatId === "lake" &&
    school.speciesWeights.length === 1 &&
    school.speciesWeights[0].speciesId === "fish.trout"
  );
}
const NEVA_SCHOOL_POINTS = FISHING_ECOLOGY_DEFINITIONS["ecology.neva"].schoolSpawnPoints;
export const SPORT_FISHING_REVIEW_POINTS = {
  trout: { ...NEVA_SCHOOL_POINTS[0], speciesId: "fish.trout" },
  tuna: { ...NEVA_SCHOOL_POINTS[1], speciesId: "fish.tuna" }
} as const;

export const SCHOOL_SPAWN_POINTS = Object.values(FISHING_ECOLOGY_DEFINITIONS).flatMap((ecology) =>
  ecology.schoolSpawnPoints.map((point) => ({
    ...point,
    ecologyId: ecology.id,
    speciesId: point.reviewSpeciesId
  }))
);
const FISHING_HABITATS = new Set(["river", "lake", "coast", "offshore"]);

export interface FishingControlInput {
  isReeling: boolean;
  isSlacking: boolean;
  isBracing: boolean;
  rodDirectionAngle: number;
}

function sportFishingDecision(
  encounter: Readonly<FishingEncounterState>,
  phase: ReturnType<typeof fishingBehaviorReadout>["phase"],
  maxSafeTension: number,
  landingWindow: boolean,
  windOpportunity: number
): SportFishingHudDto["decision"] {
  if (landingWindow) {
    return { fishAction: "Fish is at the boat", response: "Hold steady", action: "neutral", key: null, icon: "tiring", tone: "opportunity" };
  }
  if (encounter.lineTension >= maxSafeTension * 0.95) {
    return { fishAction: "Line is overloaded", response: "Give line", action: "slack", key: "S", icon: "burst", tone: "danger" };
  }
  if (encounter.lineTension < FISHING_TUNING.minimumLandingTension && encounter.slackTimerSeconds > 0.2) {
    return { fishAction: "Hook is going loose", response: "Reel in", action: "reel", key: "W", icon: "tiring", tone: "danger" };
  }
  if ((phase === "recovery" || encounter.behavior === "rest") && windOpportunity >= FISHING_TUNING.windOpportunityCueThreshold) {
    return { fishAction: "The rod is unloading", response: "Reel now", action: "reel", key: "W", icon: "tiring", tone: "opportunity" };
  }
  if (phase === "recovery" || encounter.behavior === "rest") {
    return { fishAction: "Fish is easing off", response: "Hold steady", action: "neutral", key: null, icon: "tiring", tone: "steady" };
  }
  switch (encounter.behavior) {
    case "run-left":
      return { fishAction: "Running left", response: "Pull right", action: "steer-right", key: "D", icon: "run", tone: "warning" };
    case "run-right":
      return { fishAction: "Running right", response: "Pull left", action: "steer-left", key: "A", icon: "run", tone: "warning" };
    case "surface":
      return { fishAction: "Breaking the surface", response: "Reel down", action: "reel", key: "W", icon: "surface", tone: "warning" };
    case "dive":
      return { fishAction: "Diving deep", response: "Brace", action: "brace", key: "Space", icon: "dive", tone: "warning" };
    case "shake":
      return { fishAction: "Shaking the hook", response: "Brace", action: "brace", key: "Space", icon: "shake", tone: "warning" };
    case "burst":
      return { fishAction: "Power surge", response: "Brace", action: "brace", key: "Space", icon: "burst", tone: "warning" };
    default:
      return { fishAction: "Fish is tiring", response: "Hold steady", action: "neutral", key: null, icon: "tiring", tone: "steady" };
  }
}

function fishingPressureKey(ecologyId: FishingEcologyId, habitatId: string): string {
  return `${ecologyId}:${habitatId}`;
}

function rotatedSchoolPoint(
  state: Readonly<GameState>,
  point: (typeof SCHOOL_SPAWN_POINTS)[number]
): (typeof SCHOOL_SPAWN_POINTS)[number] {
  const key = fishingPressureKey(point.ecologyId, point.habitatId);
  const pressure = state.world.fishingPressureByHabitat[key];
  let hash = (state.worldSeed ^ (pressure?.lastEndedMinute ?? 0)) >>> 0;
  for (let index = 0; index < key.length; index++) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619) >>> 0;
  const start = hash % SCHOOL_POSITION_OFFSETS.length;
  for (let offsetIndex = 0; offsetIndex < SCHOOL_POSITION_OFFSETS.length; offsetIndex++) {
    const offset = SCHOOL_POSITION_OFFSETS[(start + offsetIndex) % SCHOOL_POSITION_OFFSETS.length];
    const candidate = { ...point, x: point.x + offset.x, z: point.z + offset.z };
    if (
      WorldLayout.fishingHabitatAt(candidate.x, candidate.z) === point.habitatId &&
      WorldLayout.fishingEcologyAt(candidate.x, candidate.z).id === point.ecologyId
    ) return candidate;
  }
  return point;
}

function recordEndedSchool(state: GameState, schoolId: FishSchoolId): void {
  const school = state.world.activeSchools[schoolId];
  if (!school) return;
  const currentMinute = state.clock.currentMinute;
  const key = fishingPressureKey(school.ecologyId, school.habitatId);
  const previous = state.world.fishingPressureByHabitat[key];
  const elapsed = previous ? Math.max(0, currentMinute - previous.lastEndedMinute) : 0;
  const decayedCatchCount = previous
    ? Math.max(0, previous.recentCatchCount - Math.floor(elapsed / SCHOOL_PRESSURE_DECAY_MINUTES))
    : 0;
  const catches = Math.max(0, SCHOOL_CATCH_POTENTIAL - school.remainingCatchPotential);
  const recentCatchCount = Math.min(12, decayedCatchCount + catches);
  state.world.fishingPressureByHabitat[key] = {
    ecologyId: school.ecologyId,
    habitatId: school.habitatId,
    lastEndedMinute: currentMinute,
    cooldownUntilMinute: currentMinute + SCHOOL_RESPAWN_COOLDOWN_MINUTES
      + recentCatchCount * SCHOOL_PRESSURE_COOLDOWN_MINUTES,
    recentCatchCount
  };
}

/** Drop expired or spent schools unless an active sport fight still references them. */
export function expireSpentSchools(state: GameState): void {
  const protectedSchoolId =
    state.sportFishing?.result === "active" ? state.sportFishing.schoolId ?? null : null;
  const currentMinute = state.clock.currentMinute;
  for (const [id, school] of Object.entries(state.world.activeSchools)) {
    if (id === protectedSchoolId) continue;
    if (currentMinute >= school.expiresAtMinute || school.remainingCatchPotential <= 0) {
      recordEndedSchool(state, id);
      delete state.world.activeSchools[id];
    }
  }
}

/** Radius inside which a Skilled angler senses feeding, in metres. */
const WATER_READING_NEARBY_METERS = 80;
/** Radius inside which an Expert angler places the feeding water. */
const WATER_READING_RANGED_METERS = 180;

const waterWord = (value: string): string =>
  value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

export class FishingDomain {
  private encounter: FishingEncounter | null = null;
  private pendingLandSchoolId: FishSchoolId | null = null;
  /**
   * Transient one-per-fight signature-moment memory. Keyed by fish instance
   * id so a stale entry from a resolved fight can never fire. Never
   * serialized; a reloaded fight simply gets its moment again.
   */
  private signatureMoment: {
    instanceId: string;
    id: string;
    copy: string;
    startElapsedSeconds: number;
  } | null = null;

  constructor(
    private readonly context: DomainContext,
    private readonly cargo: CargoDomain,
    private readonly progression: ProgressionDomain
  ) {
    context.state.world.fishingPressureByHabitat ??= {};
    context.state.player.preparedLureItemId ??= null;
    const savedEncounter = context.state.sportFishing;
    if (savedEncounter?.result === "active") {
      try {
        this.encounter = FishingEncounter.fromState(savedEncounter, context.rng, {
          originX: context.state.player.x, originZ: context.state.player.z,
          bearingRadians: context.state.player.rotationY,
          isWater: (x, z) => WorldLayout.isSailable(x, z)
        });
        this.pendingLandSchoolId = savedEncounter.schoolId ?? null;
        this.encounter.setInput({ isReeling: false, isSlacking: false, isBracing: false, rodDirectionAngle: 0 });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[FishingDomain] Failed to restore sport-fishing encounter:", error);
        context.events.emit("Notification", {
          title: "Sport fishing could not be restored",
          message,
          type: "error"
        });
        context.state.sportFishing = null;
      }
    } else {
      context.state.sportFishing = null;
    }
  }

  public get activeEncounter(): FishingEncounter | null {
    return this.encounter;
  }

  public inspectSportFishingHud(): SportFishingHudDto | null {
    const encounter = this.encounter?.getState() ?? this.context.state.sportFishing;
    if (!encounter || encounter.result !== "active") return null;
    const species = ContentRegistry.fishSpecies.get(encounter.fish.speciesId);
    const profile = species ? ContentRegistry.fishBehaviors.get(species.behaviorProfileId) : undefined;
    const rod = ContentRegistry.rods.get(encounter.rodId);
    const maxSafeTension = rod?.maxSafeTension ?? 80;
    const tensionPercent = Math.min(100, Math.max(0, encounter.lineTension));
    const tensionTone = tensionPercent < FISHING_TUNING.minimumLandingTension
      ? "slack" as const
      : tensionPercent >= maxSafeTension
        ? "danger" as const
        : "safe" as const;
    const tired = encounter.stamina <= encounter.maxStamina * FISHING_TUNING.landingStaminaRatio;
    const inRange = encounter.distanceMeters <= FISHING_TUNING.landingDistance;
    const inTensionBand =
      encounter.lineTension >= FISHING_TUNING.minimumLandingTension &&
      encounter.lineTension < maxSafeTension * FISHING_TUNING.landingTensionCeilRatio;
    const landingWindow = tired && inRange && inTensionBand && encounter.lineIntegrity > 0;
    const landReadySeconds = encounter.dynamics?.landReadySeconds ?? 0;
    const lineIntegrityPercent = Math.min(100, Math.max(0, encounter.lineIntegrity));
    const behavior = fishingBehaviorReadout(encounter, profile);
    const windOpportunity = fishingWindOpportunity(encounter);

    // Telemetry is a straight read of the numbers the encounter is already
    // integrating each step: no second simulation, no smoothing of its own.
    const dynamics = encounter.dynamics;
    const rodDeflection = dynamics
      ? clampUnit(dynamics.rodDirection / FISHING_STEER_INPUT_MAX)
      : 0;
    // The fight already scores this: a rod laid against the fish's run counters
    // it, a rod laid with the run feeds slack. Same expression the physics uses.
    const counterSwing = dynamics
      ? clampUnit(-dynamics.rodDirection * encounter.fishDirection / FISHING_STEER_INPUT_MAX)
      : 0;
    const runFullScaleMeters = Math.max(
      FISHING_TUNING.landingDistance + 1,
      species
        ? sportFishingMaxStartDistanceMeters(species.cargoClass)
        : FISHING_TUNING.landingDistance + 1
    );
    const runSpan = runFullScaleMeters - FISHING_TUNING.landingDistance;
    const runDistancePercent = Math.round(
      Math.max(0, Math.min(1,
        (encounter.distanceMeters - FISHING_TUNING.landingDistance) / Math.max(0.001, runSpan)
      )) * 100
    );
    // A fish holding still is not running either way, so it gets no cue.
    const counterSwingCue: "left" | "right" | null =
      Math.abs(encounter.fishDirection) < 0.15
        ? null
        : encounter.fishDirection > 0
          ? "left"
          : "right";

    return {
      speciesId: encounter.fish.speciesId,
      speciesName: species?.name ?? "Sport fish",
      energyPercent: encounter.maxStamina <= 0
        ? 0
        : Math.round((encounter.stamina / encounter.maxStamina) * 100),
      rodDirectionAngle: encounter.rodDirectionAngle,
      steeringMagnitude: FISHING_STEER_INPUT_MAX,
      showFirstTip: encounter.elapsedSeconds < 8,
      decision: sportFishingDecision(encounter, behavior.phase, maxSafeTension, landingWindow, windOpportunity),
      signatureMoment: this.sampleSignatureMoment(encounter),
      dragNotch: encounter.dragNotch ?? 1,
      tensionPercent,
      tensionBands: {
        slackEndPercent: FISHING_TUNING.minimumLandingTension,
        dangerStartPercent: maxSafeTension
      },
      tensionTone,
      tensionWord: tensionTone === "slack" ? "Loose" : tensionTone === "danger" ? "Ease" : "Good",
      lineIntegrityPercent,
      showLineWarning: lineIntegrityPercent <= 55,
      landingProgress: landingWindow
        ? Math.max(0, Math.min(1, landReadySeconds / FISHING_TUNING.landReadySeconds))
        : null,
      telemetry: {
        runDistanceMeters: Math.round(encounter.distanceMeters * 10) / 10,
        landingDistanceMeters: FISHING_TUNING.landingDistance,
        runDistancePercent,
        waterDepthMeters: Math.round((dynamics?.depthMeters ?? 0) * 10) / 10,
        rodDeflectionPercent: Math.round(rodDeflection * 100),
        counterSwingPercent: Math.round(counterSwing * 100),
        counterSwingCue
      }
    };
  }

  /**
   * Pulses the fight's signature moment once: when the fish first shows its
   * characteristic behavior, the moment fires and stays on the HUD for
   * SIGNATURE_MOMENT_SECONDS of fight time. Pure presentation derivation —
   * it never touches stamina, tension, RNG, or the encounter outcome.
   */
  private sampleSignatureMoment(
    encounter: Readonly<FishingEncounterState>
  ): SportFishingHudDto["signatureMoment"] {
    const trigger = SIGNATURE_TRIGGER_BEHAVIOR[encounter.fish.speciesId];
    const copy = SIGNATURE_MOMENT_COPY[encounter.fish.speciesId];
    if (!trigger || !copy) return null;
    const fired =
      trigger === "run"
        ? encounter.behavior === "run-left" || encounter.behavior === "run-right"
        : encounter.behavior === trigger;
    if (fired && this.signatureMoment?.instanceId !== encounter.fish.instanceId) {
      this.signatureMoment = {
        instanceId: encounter.fish.instanceId,
        id: `${encounter.fish.speciesId}:${trigger}`,
        copy,
        startElapsedSeconds: encounter.elapsedSeconds
      };
    }
    const memory = this.signatureMoment;
    if (
      !memory ||
      memory.instanceId !== encounter.fish.instanceId ||
      encounter.elapsedSeconds - memory.startElapsedSeconds >= SIGNATURE_MOMENT_SECONDS
    ) {
      return null;
    }
    return { id: memory.id, copy: memory.copy };
  }

  /**
   * Reads the water at the angler's feet. Pure query: no RNG, no Work, no
   * mutation. Conditions and the local species pool are open to everyone;
   * sensing a school needs Skilled hands, placing it needs Expert eyes, and
   * naming its holding needs a Master. Never reveals a position.
   */
  public inspectWaterReading(): WaterReadingDto | null {
    const { state } = this.context;
    const access = WorldLayout.fishingAccessAt(state.player.x, state.player.z);
    const habitatId = access.habitat;
    if (!habitatId) return null;
    const ecologyId = WorldLayout.fishingEcologyAt(
      access.target?.x ?? state.player.x,
      access.target?.z ?? state.player.z
    ).id;
    const ecologyName = FISHING_ECOLOGY_DEFINITIONS[ecologyId]?.label ?? ecologyId;
    const likelySpeciesNames = this.listEligibleSportSpeciesIds(ecologyId, habitatId)
      .map((speciesId) => ContentRegistry.fishSpecies.get(speciesId)?.name)
      .filter((name): name is string => typeof name === "string")
      .slice(0, 3);
    const rankIndex = this.progression.getProficiencyLevel("fishing");
    const familiar = this.groundFamiliarity(ecologyId, habitatId);
    const familiarityLabel = familiar.level > 0 ? FAMILIARITY_LABEL[familiar.level] : null;

    let schoolHint: WaterReadingDto["schoolHint"] = null;
    if (rankIndex >= 2) {
      let nearest: { distance: number; habitatId: string; speciesIds: string[] } | null = null;
      for (const school of Object.values(state.world.activeSchools)) {
        if (school.ecologyId !== ecologyId) continue;
        const distance = distance2d(state.player, school);
        if (distance > WATER_READING_RANGED_METERS) continue;
        if (!nearest || distance < nearest.distance) {
          nearest = {
            distance,
            habitatId: school.habitatId,
            speciesIds: school.speciesWeights.map((entry) => entry.speciesId)
          };
        }
      }
      if (nearest && rankIndex >= 3) {
        const band = nearest.distance <= 30
          ? "close by" as const
          : nearest.distance <= WATER_READING_NEARBY_METERS
            ? "nearby" as const
            : "far off" as const;
        schoolHint = {
          level: "ranged",
          distanceBand: band,
          habitatName: waterWord(nearest.habitatId)
        };
        if (rankIndex >= 4) {
          schoolHint.speciesNames = nearest.speciesIds
            .map((speciesId) => ContentRegistry.fishSpecies.get(speciesId)?.name)
            .filter((name): name is string => typeof name === "string")
            .slice(0, 3);
        }
      } else if (nearest && nearest.distance <= WATER_READING_NEARBY_METERS) {
        schoolHint = { level: "nearby" };
      }
    }

    const conditions =
      `${waterWord(habitatId)} water · ${waterWord(state.clock.season)} ${waterWord(state.clock.timeOfDay)} · ${waterWord(state.weather.type)}`;
    const pool = likelySpeciesNames.length > 0
      ? ` — ${likelySpeciesNames.join(", ")} run here`
      : "";
    let hint = "";
    if (schoolHint?.level === "nearby") hint = " — fish feeding nearby!";
    else if (schoolHint?.level === "ranged") {
      hint = ` — feeding ${schoolHint.distanceBand}, ${schoolHint.habitatName?.toLowerCase()} water`;
      if (schoolHint.speciesNames && schoolHint.speciesNames.length > 0) {
        hint += `. Likely: ${schoolHint.speciesNames.join(", ")}`;
      }
    }
    if (familiarityLabel) hint += ` · ${familiarityLabel}`;
    return {
      ecologyId,
      ecologyName,
      habitatId,
      habitatName: waterWord(habitatId),
      season: state.clock.season,
      timeOfDay: state.clock.timeOfDay,
      weather: state.weather.type,
      likelySpeciesNames,
      familiarityLabel,
      schoolHint,
      brief: `${conditions}${pool}${hint}`
    };
  }

  /**
   * Familiarity for a ground, derived from journal catches of its signature
   * species. No stored per-ground memory exists anywhere by design.
   */
  private groundFamiliarity(
    ecologyId: string,
    habitatId: string
  ): { level: 0 | 1 | 2 | 3; signatureSpeciesId: string | null } {
    const signatureSpeciesId = GROUND_SIGNATURE_SPECIES[`${ecologyId}:${habitatId}`] ?? null;
    if (!signatureSpeciesId) return { level: 0, signatureSpeciesId: null };
    const catches = this.context.state.journal.fishRecords[signatureSpeciesId]?.catchCount ?? 0;
    return { level: groundFamiliarityLevel(catches), signatureSpeciesId };
  }

  /**
   * Sets the angler's drag notch (0 light, 1 balanced, 2 heavy). Applies to
   * the live fight immediately and to every later cast and hook.
   */
  public setDragNotch(notch: number): { success: boolean; reason?: string } {
    if (notch !== 0 && notch !== 1 && notch !== 2) {
      return { success: false, reason: "Drag runs Light, Balanced or Heavy" };
    }
    this.context.state.player.dragNotch = notch;
    this.encounter?.setDragNotch(notch);
    return { success: true };
  }

  public setInput(input: FishingControlInput): boolean {
    if (!this.encounter) return false;
    this.encounter.setInput(input);
    return true;
  }

  public togglePreparedLure(): { success: boolean; reason?: string; prepared?: boolean } {
    const { state } = this.context;
    if (this.encounter || state.sportFishing || state.basicFishing) {
      return { success: false, reason: "Finish fishing before changing tackle" };
    }
    if (state.player.preparedLureItemId) {
      state.player.preparedLureItemId = null;
      return { success: true, prepared: false };
    }
    if (accessibleFishingSupplyCount(state, "item.basic_lure") <= 0) {
      return { success: false, reason: "No Basic Lure is within reach" };
    }
    state.player.preparedLureItemId = "item.basic_lure";
    return { success: true, prepared: true };
  }

  public cancelAll(): void {
    this.encounter = null;
    this.pendingLandSchoolId = null;
    this.signatureMoment = null;
    this.context.state.sportFishing = null;
    this.context.state.basicFishing = null;
  }

  public tick(realDeltaSeconds: number): void {
    const { state, events } = this.context;
    if (this.encounter) {
      this.encounter.setAnchor(state.player.x, state.player.z);
      const outcome = this.encounter.tick(realDeltaSeconds);
      if (outcome === "landed") {
        const encounterState = this.encounter.getState();
        // Cargo and quest listeners are synchronous. Clear the resolved fight
        // before landCaughtFish emits FishLanded so an autosave triggered by
        // that event can only observe a valid, non-active sport-fishing state.
        this.encounter = null;
        state.sportFishing = null;
        const landing = this.cargo.landCaughtFish(
          encounterState.fish,
          true,
          () => this.commitSchoolCatch()
        );
        if (!landing.success) {
          this.pendingLandSchoolId = null;
          this.refundLostFightWork(encounterState.fish.speciesId);
          events.emit("FishEscaped", {
            speciesId: encounterState.fish.speciesId,
            reason: "no-cargo-space",
            minute: state.clock.currentMinute
          });
        }
      } else if (outcome === "escaped" || outcome === "line-snapped") {
        const encounterState = this.encounter.getState();
        this.refundLostFightWork(encounterState.fish.speciesId);
        this.pendingLandSchoolId = null;
        this.encounter = null;
        state.sportFishing = null;
        events.emit("FishEscaped", {
          speciesId: encounterState.fish.speciesId,
          reason: outcome === "line-snapped" ? "snapped" : "escaped",
          minute: state.clock.currentMinute
        });
      }
    }
    this.tickBasicFishing(realDeltaSeconds);
  }

  public startChargingCastBasic(): { success: boolean; reason?: string; reasonCode?: string } {
    const { state } = this.context;
    if (state.player.activeMountId) return { success: false, reason: "Dismount before fishing" };
    const handsBlocker = freeHandsBlocker(state.player);
    if (handsBlocker) return { success: false, reason: handsBlocker };
    if (this.encounter || state.sportFishing || state.basicFishing) return { success: false, reason: "Already fishing" };
    const access = WorldLayout.fishingAccessAt(state.player.x, state.player.z);
    const habitatId = access.habitat;
    if (!habitatId) return { success: false, reason: "Move closer to fishable water" };
    const ecologyId = WorldLayout.fishingEcologyAt(access.target?.x ?? state.player.x, access.target?.z ?? state.player.z).id;
    const rod = ContentRegistry.rods.get(state.player.equippedRodId);
    if (!rod || !rod.allowedHabitats.includes(habitatId)) {
      return { success: false, reason: "Your equipped rod cannot fish this water" };
    }

    const eligibleSpecies = this.listEligibleBasicSpecies(ecologyId, habitatId, rod.rodClass);
    if (eligibleSpecies.length === 0) return { success: false, reason: "Nothing is biting in these conditions" };
    if (!eligibleSpecies.some((fish) => this.canLandBasicSpecies(fish))) {
      return { success: false, reason: "There is no room for the catch" };
    }

    const workQuote = this.progression.quoteWorkCost(BASIC_FISHING_WORK_COST, "fishing");
    if (!workQuote.affordable) {
      return this.progression.insufficientWorkResult(workQuote, "Casting");
    }

    const hasBait = accessibleFishingSupplyCount(state, "item.bait_worms") > 0;

    state.basicFishing = {
      ecologyId,
      habitatId,
      phase: "charging-cast",
      remainingSeconds: 0,
      catchItemId: eligibleSpecies[0].id,
      willCatch: false,
      castPower: 0,
      isChargingCast: true,
      castChargeDirection: 1,
      hasBait
    };
    return { success: true };
  }

  /**
   * The wind as this cast will feel it. Kept on the domain so the charged and
   * the immediate cast paths read the same conditions through one owner.
   */
  private castWindForCurrentCast(castPower: number): CastWindEffect {
    const { state } = this.context;
    return castWindEffect({
      windDirectionDeg: state.weather.windDirectionDeg,
      windSpeed: state.weather.windSpeed,
      castHeadingRadians: state.player.rotationY,
      castPower
    });
  }

  public releaseCastBasic(castPower?: number): { success: boolean; reason?: string; reasonCode?: string } {
    const { state, rng, events } = this.context;
    const handsBlocker = freeHandsBlocker(state.player);
    if (handsBlocker) return { success: false, reason: handsBlocker };
    if (!state.basicFishing) return { success: false, reason: "Not casting" };
    if (state.basicFishing.phase !== "charging-cast" && (state.basicFishing.phase as string) !== "casting") {
      return { success: false, reason: "Not charging a cast" };
    }
    const power = Math.max(0.05, Math.min(1.0, castPower ?? state.basicFishing.castPower ?? 0.75));
    const habitatId = state.basicFishing.habitatId;
    const rod = ContentRegistry.rods.get(state.player.equippedRodId);

    const ecologyId = state.basicFishing.ecologyId;
    const eligibleSpecies = this.listEligibleBasicSpecies(ecologyId, habitatId, rod?.rodClass || "willow");
    if (eligibleSpecies.length === 0) {
      state.basicFishing = null;
      return { success: false, reason: "Nothing is biting in these conditions" };
    }

    const work = this.progression.trySpendWork(BASIC_FISHING_WORK_COST, "fishing", "Casting");
    if (!work.success) {
      state.basicFishing = null;
      return work;
    }

    let hasBait = state.basicFishing.hasBait ?? false;
    if (hasBait) {
      hasBait = this.consumeBaitIfPresent();
    }

    const catchItemId = rng.weighted(eligibleSpecies.map((fish) => ({
      value: fish.id,
      weight: hasBait ? fish.rarityWeight + 4 / Math.max(0.1, fish.rarityWeight) : fish.rarityWeight
    })));

    const newState = BasicFishingMinigame.createInitialState(
      habitatId,
      catchItemId,
      power,
      state.player.equippedRodId,
      this.progression.getProficiencyLevel("fishing"),
      hasBait,
      rng,
      state.weather.type,
      state.clock.timeOfDay,
      ecologyId,
      this.castWindForCurrentCast(power)
    );
    const lureUsed = this.consumePreparedLure();
    newState.willCatch = rod ? rng.chance(Math.min(1, rod.hookReliability + (lureUsed ? 0.18 : 0) + FISHING_TUNING.dragHookDelta[state.player.dragNotch ?? 1])) : false;
    state.basicFishing = newState;
    this.context.persistRng();
    events.emit("BasicFishingStarted", { ecologyId, habitatId, castPower: power, minute: state.clock.currentMinute });
    return { success: true };
  }

  public hookBiteBasic(): { success: boolean; reason?: string } {
    const { state, events } = this.context;
    const attempt = state.basicFishing;
    if (!attempt) return { success: false, reason: "Not fishing" };
    if (attempt.phase !== "bite-reaction") {
      return { success: false, reason: "No fish biting yet!" };
    }

    if (!attempt.willCatch) {
      this.resolveMissedBite(attempt);
      return { success: false, reason: "The fish slipped the hook" };
    }

    attempt.phase = "minigame";
    events.emit("BasicFishingMinigameStarted", {
      ecologyId: attempt.ecologyId,
      habitatId: attempt.habitatId,
      speciesId: (attempt.catchItemId || "fish.perch") as FishSpeciesId,
      hasTreasure: attempt.hasTreasure ?? false,
      minute: state.clock.currentMinute
    });
    return { success: true };
  }

  public setBasicFishingInput(isHolding: boolean): void {
    if (this.context.state.basicFishing) {
      this.context.state.basicFishing.isHolding = isHolding;
    }
  }

  public commitBasicFishing(): { success: boolean; reason?: string; reasonCode?: string } {
    const attempt = this.context.state.basicFishing;
    if (!attempt) return { success: true };
    if (attempt.phase !== "caught") {
      return { success: false, reason: "Nothing to land yet" };
    }
    if (this.tryCommitBasicCatch(attempt)) return { success: true };
    return {
      success: false,
      reason: "The satchel is full. Make space to land the catch.",
      reasonCode: "inventory-full"
    };
  }

  public cancelBasicFishing(): { success: boolean; reason?: string; reasonCode?: string } {
    const { state, events } = this.context;
    const attempt = state.basicFishing;
    if (!attempt) return { success: true };
    if (attempt.phase === "caught") {
      if (this.tryCommitBasicCatch(attempt)) return { success: true };
      return {
        success: false,
        reason: "The satchel is full. Open it to make room or discard the catch.",
        reasonCode: "inventory-full"
      };
    }
    events.emit("BasicFishingResolved", {
      ecologyId: attempt.ecologyId,
      habitatId: attempt.habitatId,
      reason: "cancelled",
      minute: state.clock.currentMinute
    });
    state.basicFishing = null;
    return { success: true };
  }

  public discardBasicCatch(): { success: boolean; reason?: string; reasonCode?: string } {
    const { state, events } = this.context;
    const attempt = state.basicFishing;
    if (!attempt || attempt.phase !== "caught") {
      return { success: false, reason: "No catch is waiting" };
    }
    events.emit("BasicFishingResolved", {
      ecologyId: attempt.ecologyId,
      habitatId: attempt.habitatId,
      reason: "cancelled",
      minute: state.clock.currentMinute
    });
    state.basicFishing = null;
    return { success: true, reasonCode: "discarded" };
  }

  public castBasic(castPower: number = 0.75): { success: boolean; reason?: string; reasonCode?: string } {
    const { state, rng, events } = this.context;
    if (state.player.activeMountId) return { success: false, reason: "Dismount before fishing" };
    const handsBlocker = freeHandsBlocker(state.player);
    if (handsBlocker) return { success: false, reason: handsBlocker };
    if (this.encounter || state.sportFishing || state.basicFishing) return { success: false, reason: "Already fishing" };
    const access = WorldLayout.fishingAccessAt(state.player.x, state.player.z);
    const habitatId = access.habitat;
    if (!habitatId) return { success: false, reason: "Move closer to fishable water" };
    const ecologyId = WorldLayout.fishingEcologyAt(access.target?.x ?? state.player.x, access.target?.z ?? state.player.z).id;
    const rod = ContentRegistry.rods.get(state.player.equippedRodId);
    if (!rod || !rod.allowedHabitats.includes(habitatId)) {
      return { success: false, reason: "Your equipped rod cannot fish this water" };
    }

    const eligibleSpecies = this.listEligibleBasicSpecies(ecologyId, habitatId, rod.rodClass);
    if (eligibleSpecies.length === 0) return { success: false, reason: "Nothing is biting in these conditions" };
    if (!eligibleSpecies.some((fish) => this.canLandBasicSpecies(fish))) {
      return { success: false, reason: "There is no room for the catch" };
    }

    const work = this.progression.trySpendWork(BASIC_FISHING_WORK_COST, "fishing", "Casting");
    if (!work.success) return work;
    const hasBait = this.consumeBaitIfPresent();

    const catchItemId = rng.weighted(
      eligibleSpecies.map((fish) => ({
        value: fish.id,
        weight: hasBait ? fish.rarityWeight + 4 / Math.max(0.1, fish.rarityWeight) : fish.rarityWeight
      }))
    );

    const fishingState = BasicFishingMinigame.createInitialState(
      habitatId,
      catchItemId,
      castPower,
      state.player.equippedRodId,
      this.progression.getProficiencyLevel("fishing"),
      hasBait,
      rng,
      state.weather.type,
      state.clock.timeOfDay,
      ecologyId,
      this.castWindForCurrentCast(castPower)
    );
    fishingState.phase = "casting" as BasicFishingPhase;
    const lureUsed = this.consumePreparedLure();
    fishingState.willCatch = rng.chance(Math.min(1, rod.hookReliability + (lureUsed ? 0.18 : 0) + FISHING_TUNING.dragHookDelta[state.player.dragNotch ?? 1]));
    state.basicFishing = fishingState;
    this.context.persistRng();
    events.emit("BasicFishingStarted", { ecologyId, habitatId, castPower, minute: state.clock.currentMinute });
    return { success: true };
  }

  public spawnSchool(habitatId: string, x: number, z: number, speciesIds: FishSpeciesId[]): FishSchoolId {
    const { state, events } = this.context;
    const ecologyId = WorldLayout.fishingEcologyAt(x, z).id;
    const physicalHabitat = Number.isFinite(x) && Number.isFinite(z) ? WorldLayout.fishingHabitatAt(x, z) : null;
    if (!FISHING_HABITATS.has(habitatId) || physicalHabitat !== habitatId) {
      throw new Error("Fish schools must be spawned in their matching physical habitat");
    }
    if (
      speciesIds.length === 0 ||
      speciesIds.some((speciesId) => {
        const fish = ContentRegistry.fishSpecies.get(speciesId);
        return !fish || !fish.isSportFish || !fish.habitats.includes(habitatId) || !fish.ecologyIds.includes(ecologyId);
      })
    ) {
      throw new Error("Fish schools require eligible sport-fish species for their habitat");
    }

    const schoolId = this.context.nextEntityId("school");
    state.world.activeSchools[schoolId] = {
      id: schoolId,
      ecologyId,
      habitatId,
      x,
      z,
      radius: 8,
      spawnedAtMinute: state.clock.currentMinute,
      expiresAtMinute: state.clock.currentMinute + 180,
      remainingCatchPotential: SCHOOL_CATCH_POTENTIAL,
      // Season scales density, not permission: a shoulder-season species is
      // present but rare. Floored above zero so a school always has a
      // selectable pool even when every member is out of its peak season.
      speciesWeights: speciesIds.map((speciesId) => {
        const fish = ContentRegistry.fishSpecies.get(speciesId);
        const rarity = fish?.rarityWeight ?? 1;
        const seasonal = fish ? speciesSeasonWeight(fish, state.clock.season) : 1;
        return { speciesId, weight: Math.max(rarity * seasonal, MINIMUM_SCHOOL_SPECIES_WEIGHT) };
      })
    };
    this.context.persistRng();
    events.emit("FishSchoolSpawned", { schoolId, ecologyId, x, z, species: speciesIds, minute: state.clock.currentMinute });
    return schoolId;
  }

  public chumSchool(schoolId: FishSchoolId): { success: boolean; reason?: string } {
    const { state, events } = this.context;
    if (state.player.activeMountId) return { success: false, reason: "Dismount before fishing" };
    const handsBlocker = freeHandsBlocker(state.player);
    if (handsBlocker) return { success: false, reason: handsBlocker };
    const school = state.world.activeSchools[schoolId];
    if (!school) return { success: false, reason: "School disappeared" };
    if (distance2d(state.player, school) > SCHOOL_INTERACTION_RADIUS) {
      return { success: false, reason: "Move closer to the fish school" };
    }
    if (school.feedingFrenzyUntilMinute && state.clock.currentMinute <= school.feedingFrenzyUntilMinute) {
      return { success: false, reason: "This school is already feeding" };
    }
    // One chum per cast, strongest scent first: a carried specialty blend is
    // a deliberate choice for this water, so it always goes over the bucket.
    let cast: (typeof CHUM_CAST_PRECEDENCE)[number] | null = null;
    for (const candidate of CHUM_CAST_PRECEDENCE) {
      if (accessibleFishingSupplyCount(state, candidate.itemId) > 0) {
        cast = candidate;
        break;
      }
    }
    if (!cast || !consumeAccessibleFishingSupply(state, cast.itemId)) {
      return { success: false, reason: "You need chum within reach" };
    }
    school.feedingFrenzyUntilMinute = state.clock.currentMinute + cast.frenzyMinutes;
    if (cast.deep) school.deepChumUntilMinute = state.clock.currentMinute + cast.frenzyMinutes;
    events.emit("FishSchoolChummed", { schoolId, ecologyId: school.ecologyId, habitatId: school.habitatId, frenzyMinutes: cast.frenzyMinutes, minute: state.clock.currentMinute });
    return { success: true };
  }

  public hookSportFish(
    schoolId: FishSchoolId
  ): { success: boolean; encounter?: FishingEncounterState; reason?: string; reasonCode?: string } {
    const { state, rng, events } = this.context;
    if (state.player.activeMountId) return { success: false, reason: "Dismount before fishing" };
    const handsBlocker = freeHandsBlocker(state.player);
    if (handsBlocker) return { success: false, reason: handsBlocker };
    if (this.encounter || state.sportFishing || state.basicFishing) return { success: false, reason: "Already fighting a fish" };
    const school = state.world.activeSchools[schoolId];
    if (!school) return { success: false, reason: "No active school" };
    if (state.clock.currentMinute >= school.expiresAtMinute || school.remainingCatchPotential <= 0) {
      return { success: false, reason: "This school has moved on" };
    }
    if (distance2d(state.player, school) > SCHOOL_INTERACTION_RADIUS) {
      return { success: false, reason: "Move closer to the fish school" };
    }
    if (!school.feedingFrenzyUntilMinute || state.clock.currentMinute > school.feedingFrenzyUntilMinute) {
      return { success: false, reason: "School is not in a feeding frenzy! Chum it first." };
    }

    const rodDef = ContentRegistry.rods.get(state.player.equippedRodId) ?? ContentRegistry.rods.get("rod.willow")!;
    const eligibleSpeciesWeights = school.speciesWeights.filter((entry) => {
      const species = ContentRegistry.fishSpecies.get(entry.speciesId);
      return Boolean(
        species &&
        species.ecologyIds.includes(school.ecologyId) &&
        rodDef.allowedHabitats.includes(school.habitatId) &&
        rodMeetsMinimum(rodDef.rodClass, species.minimumRodClass) &&
        cargoClassFits(species.cargoClass, rodDef.maximumCargoClass)
      );
    });
    if (eligibleSpeciesWeights.length === 0) {
      return { success: false, reason: "Your equipped rod cannot fish this school" };
    }
    const bearing = Math.atan2(school.x - state.player.x, school.z - state.player.z);
    const stowableSpeciesWeights = eligibleSpeciesWeights.filter((entry) => {
      const species = ContentRegistry.fishSpecies.get(entry.speciesId);
      return Boolean(species && this.cargo.canLandCargoClass(species.cargoClass));
    });
    if (stowableSpeciesWeights.length === 0) {
      return { success: false, reason: "No cargo space for the fish in this school" };
    }
    const viableSpecies = stowableSpeciesWeights.flatMap((entry) => {
      const species = ContentRegistry.fishSpecies.get(entry.speciesId)!;
      const water = findFishingWater(
        state.player.x,
        state.player.z,
        bearing,
        sportFishingMaxStartDistanceMeters(species.cargoClass),
        (x, z) => WorldLayout.isSailable(x, z)
      );
      return water ? [{ entry, species, water }] : [];
    });
    if (viableSpecies.length === 0) {
      return { success: false, reason: "Move to open water before hooking the fish" };
    }
    // Gate affordability on the priciest fish the school could hand us, so a
    // failed check never advances species RNG. The actual spend below uses the
    // rolled species' class cost and can only be cheaper, so it always clears.
    const worstHookCost = Math.max(
      ...viableSpecies.map((candidate) => SPORT_FISHING_WORK_COST_BY_CLASS[candidate.species.cargoClass])
    );
    const workQuote = this.progression.quoteWorkCost(worstHookCost, "fishing");
    if (!workQuote.affordable) {
      return this.progression.insufficientWorkResult(workQuote, "Hooking this fish");
    }
    const deepChumActive =
      school.deepChumUntilMinute !== undefined &&
      state.clock.currentMinute <= school.deepChumUntilMinute;
    const familiar = this.groundFamiliarity(school.ecologyId, school.habitatId);
    const selected = rng.weighted(
      viableSpecies.map((candidate) => ({
        value: candidate,
        weight:
          candidate.entry.weight *
          deepChumWeightMultiplier(candidate.species.minigameBehavior, deepChumActive) *
          (familiar.signatureSpeciesId === candidate.species.id
            ? familiarityWeightMultiplier(familiar.level)
            : 1)
      }))
    );
    const speciesId = selected.entry.speciesId;
    const speciesDef = selected.species;
    const water = selected.water;
    const work = this.progression.trySpendWork(
      SPORT_FISHING_WORK_COST_BY_CLASS[speciesDef.cargoClass],
      "fishing",
      "Hooking this fish"
    );
    if (!work.success) return work;
    const weightKg = rollSpeciesWeightKg(speciesDef.weightKg, rng);
    const lureUsed = this.consumePreparedLure();
    const quality = this.rollQuality(1);
    const fish: FishInstance = {
      instanceId: this.context.nextEntityId("fish_inst"),
      speciesId,
      ecologyId: school.ecologyId,
      weightKg,
      quality,
      caughtAtMinute: state.clock.currentMinute
    };
    this.encounter = new FishingEncounter(
      fish,
      state.player.equippedRodId,
      rng,
      // A heavy specimen starts farther out and a light one closer in, but
      // never beyond the validated continuous-water reach: the water check
      // passed for the full reach, so any shorter distance on the same
      // bearing is also valid.
      Math.min(
        water.distance,
        sportFishingStartDistanceForWeight(
          speciesDef.cargoClass,
          weightKg,
          speciesDef.weightKg.min,
          speciesDef.weightKg.max
        )
      ),
      { originX: state.player.x, originZ: state.player.z, bearingRadians: water.bearing,
        isWater: (x, z) => WorldLayout.isSailable(x, z) },
      {
        tackleSnapshot: { lureItemId: lureUsed ? "item.basic_lure" : null },
        dragNotch: state.player.dragNotch ?? 1,
        seaConditionSnapshot: {
          weatherType: state.weather.type,
          // The Act 5 teaching fight reads the matching rule, not the
          // weather: a trout-only starter school hooked while the maiden
          // voyage is active snapshots calm water. The weather type stays
          // truthful; only the deterministic drive pressure is forgiven.
          seaRoughness:
            isQuestActive(state.quests, "quest.act5_maiden_voyage") && isStarterTeachingSchool(school)
              ? Math.min(state.weather.seaRoughness, STARTER_SCHOOL_CALM_ROUGHNESS)
              : state.weather.seaRoughness
        }
      }
    );
    state.sportFishing = this.encounter.getState() as FishingEncounterState;
    this.pendingLandSchoolId = schoolId;
    state.sportFishing.schoolId = schoolId;
    this.context.persistRng();
    events.emit("FishHooked", { speciesId, ecologyId: school.ecologyId, habitatId: school.habitatId, weightKg: fish.weightKg, minute: state.clock.currentMinute });
    return { success: true, encounter: this.encounter.getState() };
  }

  public tickSchools(): void {
    const { state } = this.context;
    expireSpentSchools(state);
    const currentMinute = state.clock.currentMinute;
    // Act 5 has an authored entry path. The first lake school is guaranteed
    // once the rowboat has been commissioned, independent of weather or the
    // normal respawn cadence; subsequent schools retain the live ecology.
    if (
      isQuestActive(state.quests, "quest.act5_maiden_voyage") &&
      state.quests.unlockedFeatureIds.includes("boat.player_rowboat") &&
      !state.world.storySchoolSpawned
    ) {
      const starterPoint = SCHOOL_SPAWN_POINTS[0];
      const existingLake = Object.values(state.world.activeSchools).find((school) => school.ecologyId === "ecology.neva" && school.habitatId === "lake");
      if (existingLake) {
        existingLake.x = starterPoint.x;
        existingLake.z = starterPoint.z;
        existingLake.speciesWeights = [{ speciesId: "fish.trout", weight: 1 }];
        existingLake.remainingCatchPotential = Math.max(existingLake.remainingCatchPotential, 1);
        existingLake.expiresAtMinute = currentMinute + 180;
        delete existingLake.feedingFrenzyUntilMinute;
      } else {
        this.spawnSchool(starterPoint.habitatId, starterPoint.x, starterPoint.z, ["fish.trout"]);
      }
      state.world.storySchoolSpawned = true;
      state.world.lastSchoolSpawnMinute = currentMinute;
      return;
    }

    const occupiedHabitats = new Set(
      Object.values(state.world.activeSchools).map((school) => `${school.ecologyId}:${school.habitatId}`)
    );

    let spawned = false;
    for (const point of SCHOOL_SPAWN_POINTS) {
      const key = fishingPressureKey(point.ecologyId, point.habitatId);
      if (occupiedHabitats.has(key)) continue;
      const pressure = state.world.fishingPressureByHabitat[key];
      if (pressure && currentMinute < pressure.cooldownUntilMinute) continue;
      const speciesIds = this.listEligibleSportSpeciesIds(point.ecologyId, point.habitatId);
      if (speciesIds.length === 0) continue;
      const rotatedPoint = rotatedSchoolPoint(state, point);
      this.spawnSchool(rotatedPoint.habitatId, rotatedPoint.x, rotatedPoint.z, speciesIds);
      occupiedHabitats.add(key);
      spawned = true;
    }
    if (spawned) state.world.lastSchoolSpawnMinute = currentMinute;
  }

  private listEligibleSportSpeciesIds(ecologyId: FishingEcologyId, habitatId: string): FishSpeciesId[] {
    const { state } = this.context;
    const inHabitatSeason = Array.from(ContentRegistry.fishSpecies.values()).filter(
      (fish) =>
        fish.isSportFish &&
        fish.ecologyIds.includes(ecologyId) &&
        fish.habitats.includes(habitatId) &&
        isSpeciesInSeason(fish, state.clock.season)
    );
    const inConditions = inHabitatSeason.filter(
      (fish) =>
        fish.timeWindows.includes(state.clock.timeOfDay) &&
        fish.weatherPreferences.includes(state.weather.type)
    );
    return (inConditions.length > 0 ? inConditions : inHabitatSeason).map((fish) => fish.id);
  }

  private listEligibleBasicSpecies(ecologyId: FishingEcologyId, habitatId: string, rodClass: "willow" | "river" | "heavy-sport" | "offshore" | "master") {
    const { state } = this.context;
    const inHabitat = Array.from(ContentRegistry.fishSpecies.values()).filter(
      (fish) =>
        !fish.isSportFish &&
        fish.ecologyIds.includes(ecologyId) &&
        fish.habitats.includes(habitatId) &&
        isSpeciesInSeason(fish, state.clock.season) &&
        rodMeetsMinimum(rodClass, fish.minimumRodClass) &&
        ContentRegistry.items.has(fish.id)
    );
    const inConditions = inHabitat.filter(
      (fish) =>
        fish.timeWindows.includes(state.clock.timeOfDay) &&
        fish.weatherPreferences.includes(state.weather.type)
    );
    // Never AND time×weather into a hard-empty common pool for the vertical slice.
    return inConditions.length > 0 ? inConditions : inHabitat;
  }

  private consumeBaitIfPresent(): boolean {
    return consumeAccessibleFishingSupply(this.context.state, "item.bait_worms");
  }

  private consumePreparedLure(): boolean {
    const { state } = this.context;
    const lureItemId = state.player.preparedLureItemId;
    if (!lureItemId) return false;
    const consumed = consumeAccessibleFishingSupply(state, lureItemId);
    state.player.preparedLureItemId = null;
    return consumed;
  }

  private commitSchoolCatch(): void {
    const { state } = this.context;
    const schoolId = this.pendingLandSchoolId;
    this.pendingLandSchoolId = null;
    if (!schoolId) return;
    const school = state.world.activeSchools[schoolId];
    if (!school) return;
    school.remainingCatchPotential -= 1;
    if (school.remainingCatchPotential <= 0) {
      recordEndedSchool(state, schoolId);
      delete state.world.activeSchools[schoolId];
    }
  }

  /**
   * A lost fight is not a wasted trip: hand back most of the Work the hook cost
   * so a snapped line or a slipped hook stings without emptying the pool.
   */
  private refundLostFightWork(speciesId: FishSpeciesId): void {
    const species = ContentRegistry.fishSpecies.get(speciesId);
    if (!species) return;
    const spent = this.progression.getDiscountedActionCost(
      SPORT_FISHING_WORK_COST_BY_CLASS[species.cargoClass],
      "fishing"
    );
    const refund = Math.round(spent * SPORT_FISHING_WORK_REFUND_RATIO);
    if (refund <= 0) return;
    const capacity = this.context.state.player.workCapacity;
    capacity.current = Math.min(capacity.maximum, capacity.current + refund);
  }

  private rollQuality(workMultiplier: number): FishQuality {
    const roll = this.context.rng.nextFloat();
    const work = Math.max(0, Math.min(1, workMultiplier));
    const effectiveRoll = Math.min(1, roll * work);
    if (effectiveRoll > 0.92) return "trophy";
    if (effectiveRoll > 0.75) return "exceptional";
    if (effectiveRoll > 0.45) return "fine";
    return "common";
  }

  private tickBasicFishing(realDeltaSeconds: number): void {
    const { state, events, rng } = this.context;
    const attempt = state.basicFishing;
    if (!attempt || realDeltaSeconds <= 0) return;

    if (attempt.phase === "charging-cast") {
      if (attempt.isChargingCast !== false) {
        BasicFishingMinigame.tickCastCharging(attempt, realDeltaSeconds);
      }
      return;
    }

    if (
      attempt.phase === "waiting-bite" ||
      (attempt.phase as string) === "casting" ||
      (attempt.phase as string) === "waiting"
    ) {
      attempt.remainingSeconds -= realDeltaSeconds;
      if (attempt.remainingSeconds <= 0) {
        const window = attempt.biteReactionWindowSeconds ?? 1.4;
        attempt.phase = "bite-reaction";
        attempt.remainingSeconds = window;
        events.emit("BasicFishingBiteAlert", {
          ecologyId: attempt.ecologyId,
          habitatId: attempt.habitatId,
          speciesId: (attempt.catchItemId || "fish.perch") as FishSpeciesId,
          minute: state.clock.currentMinute
        });
      }
      return;
    }

    if (attempt.phase === "bite-reaction" || (attempt.phase as string) === "bite") {
      attempt.remainingSeconds -= Math.min(realDeltaSeconds, BITE_REACTION_MAX_STEP_SECONDS);
      if (attempt.remainingSeconds <= 0) {
        // AFK never auto-lands, even when willCatch rolled true.
        this.resolveMissedBite(attempt);
      }
      return;
    }

    if (attempt.phase === "minigame") {
      const outcome = BasicFishingMinigame.tick(attempt, realDeltaSeconds, rng);
      if (outcome === "landed") {
        attempt.phase = "caught";
      } else if (outcome === "escaped") {
        attempt.phase = "escaped";
        events.emit("BasicFishingResolved", {
          ecologyId: attempt.ecologyId,
          habitatId: attempt.habitatId,
          reason: "escaped",
          minute: state.clock.currentMinute
        });
      }
    }
  }

  private resolveMissedBite(attempt: BasicFishingState): void {
    const { state, events } = this.context;
    state.basicFishing = null;
    events.emit("BasicFishingResolved", {
      ecologyId: attempt.ecologyId,
      habitatId: attempt.habitatId,
      reason: "missed",
      minute: state.clock.currentMinute
    });
  }

  private tryCommitBasicCatch(attempt: BasicFishingState): boolean {
    const { state, events, rng } = this.context;
    const inventory = state.inventories[state.player.inventoryId];
    if (!attempt.catchItemId) {
      state.basicFishing = null;
      events.emit("BasicFishingResolved", {
        ecologyId: attempt.ecologyId,
        habitatId: attempt.habitatId,
        reason: "missed",
        minute: state.clock.currentMinute
      });
      return true;
    }

    const species = ContentRegistry.fishSpecies.get(attempt.catchItemId);
    const physicalCatch = Boolean(species?.tags.includes("physical-basic-catch"));
    const catchStack = physicalCatch ? [] : [{ itemId: attempt.catchItemId, quantity: 1 }];
    if ((physicalCatch && (!species || !this.cargo.canLandCargoClass(species.cargoClass)))
      || (!physicalCatch && !InventoryManager.canAddItems(inventory, catchStack))) {
      attempt.phase = "caught";
      return false;
    }

    let treasureLootItemIds: string[] | undefined;
    const treasureStack: Array<{ itemId: string; quantity: number }> = [];
    if (attempt.treasureCaught) {
      const rolled = BasicFishingMinigame.generateTreasureLoot(attempt.habitatId, rng);
      const lootCounts = new Map<string, number>();
      for (const itemId of rolled) {
        if (!ContentRegistry.items.has(itemId)) continue;
        lootCounts.set(itemId, (lootCounts.get(itemId) ?? 0) + 1);
      }
      for (const [itemId, quantity] of lootCounts) treasureStack.push({ itemId, quantity });
    }

    // The catch and its treasure are one inventory transaction. Do not land
    // the fish while silently dropping or partially granting rolled loot.
    const catchAndTreasure = [...catchStack, ...treasureStack];
    if (!InventoryManager.canAddItems(inventory, catchAndTreasure)) {
      attempt.phase = "caught";
      return false;
    }
    let physicalBoatId: BoatId | undefined;
    if (physicalCatch && species) {
      const landing = this.cargo.landCaughtFish({
        instanceId: this.context.nextEntityId("fish_inst"),
        speciesId: species.id,
        ecologyId: attempt.ecologyId,
        weightKg: rollSpeciesWeightKg(species.weightKg, rng),
        quality: attempt.quality ?? "common",
        caughtAtMinute: state.clock.currentMinute
      }, false);
      if (!landing.success) {
        attempt.phase = "caught";
        return false;
      }
      physicalBoatId = landing.boatId;
    }
    if (catchAndTreasure.length > 0) InventoryManager.addItemsAtomically(inventory, catchAndTreasure);

    if (treasureStack.length > 0) {
      treasureLootItemIds = treasureStack.flatMap(({ itemId, quantity }) =>
        Array.from({ length: quantity }, () => itemId)
      );
      events.emit("BasicFishingTreasureCaught", {
        lootItemIds: treasureLootItemIds,
        minute: state.clock.currentMinute
      });
    }

    const xpGained = attempt.isPerfect ? 50 : 25;
    this.progression.addProficiencyXp("fishing", xpGained);

    const quality = attempt.quality ?? "common";
    const speciesId = attempt.catchItemId;
    let basicRecord: "first" | "quality" | undefined;
    if (!physicalCatch && speciesId && ContentRegistry.fishSpecies.has(speciesId)) {
      const prior = state.journal.fishRecords[speciesId];
      const priorCatches = prior?.catchCount ?? 0;
      state.journal.fishRecords[speciesId] ??= {
        discovered: true,
        catchCount: 0,
        bestQuality: quality,
        firstCaughtMinute: state.clock.currentMinute
      };
      const record = state.journal.fishRecords[speciesId];
      record.discovered = true;
      record.catchCount = (record.catchCount ?? 0) + 1;
      const rank: Record<string, number> = { common: 0, fine: 1, exceptional: 2, trophy: 3 };
      if (priorCatches === 0) basicRecord = "first";
      else if ((rank[quality] ?? 0) > (rank[prior?.bestQuality ?? "common"] ?? 0)) basicRecord = "quality";
      if ((rank[quality] ?? 0) >= (rank[record.bestQuality ?? "common"] ?? 0)) {
        record.bestQuality = quality;
      }
    }

    state.basicFishing = null;
    events.emit("BasicFishingResolved", {
      ecologyId: attempt.ecologyId,
      habitatId: attempt.habitatId,
      boatId: physicalBoatId,
      catchItemId: attempt.catchItemId,
      quality,
      isPerfect: attempt.isPerfect,
      hasTreasure: attempt.hasTreasure,
      treasureLootItemIds,
      record: basicRecord,
      minute: state.clock.currentMinute
    });
    return true;
  }

  public quoteSchoolHookWork(schoolId: FishSchoolId): number {
    const school = this.context.state.world.activeSchools[schoolId];
    if (!school) return SPORT_FISHING_WORK_COST;
    const rod = ContentRegistry.rods.get(this.context.state.player.equippedRodId);
    const costs = school.speciesWeights.flatMap((entry) => {
      const species = ContentRegistry.fishSpecies.get(entry.speciesId);
      if (
        !species ||
        !rod ||
        !rodMeetsMinimum(rod.rodClass, species.minimumRodClass) ||
        !cargoClassFits(species.cargoClass, rod.maximumCargoClass) ||
        !this.cargo.canLandCargoClass(species.cargoClass)
      ) return [];
      return [SPORT_FISHING_WORK_COST_BY_CLASS[species.cargoClass]];
    });
    return costs.length > 0 ? Math.max(...costs) : SPORT_FISHING_WORK_COST;
  }

  private canLandBasicSpecies(fish: { id: string; cargoClass: CargoClass; tags: string[] }): boolean {
    if (fish.tags.includes("physical-basic-catch")) return this.cargo.canLandCargoClass(fish.cargoClass);
    const inventory = this.context.state.inventories[this.context.state.player.inventoryId];
    return InventoryManager.canAddItems(inventory, [{ itemId: fish.id, quantity: 1 }]);
  }
}
