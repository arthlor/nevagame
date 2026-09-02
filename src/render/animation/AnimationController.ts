import * as THREE from "three";
import type {
  BoatMotionSample,
  PlayerMotionSample
} from "../../simulation/core/PhysicsAdapter";
import type { GameMode } from "../../simulation/core/types";
import {
  ASSET_BY_ID,
  type AssetId,
  type RuntimeAnimationClipSpec
} from "../assets/AssetCatalog";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { HumanoidFootSupportSolver } from "./HumanoidFootSupportSolver";

export type PlayerAnimation =
  | "idle"
  | "walk_start"
  | "walk"
  | "run_start"
  | "run"
  | "stop"
  | "turn_left"
  | "turn_right"
  | "jump"
  | "jump_start"
  | "fall"
  | "land_soft"
  | "land_hard"
  | "plant"
  | "water"
  | "harvest"
  | "pickup"
  | "carry_idle"
  | "carry_walk"
  | "carry_run"
  | "place"
  | "workstation"
  | "cast"
  | "hookset"
  | "fishing_idle"
  | "reel"
  | "slack"
  | "brace"
  | "board"
  | "board_skiff"
  | "dock"
  | "dock_skiff"
  | "rowboat_idle"
  | "row"
  | "skiff_idle"
  | "skiff_fishing"
  | "skiff_drive"
  | "mounted_idle"
  | "mounted_walk"
  | "mounted_trot"
  | "mounted_gallop"
  | "mount"
  | "mount_right"
  | "dismount"
  | "dismount_right"
  | "talk_gesture";

export interface BoatAnimationInput {
  boatTypeId: string;
  throttle: number;
  steering: number;
  motion?: BoatMotionSample;
}

export interface CharacterAnimationContext {
  mode: GameMode;
  motion: PlayerMotionSample;
  carrying: boolean;
  talking?: boolean;
  facingRadians?: number;
  fishingInput?: {
    isReeling: boolean;
    isSlacking: boolean;
    isBracing: boolean;
    rodDirectionAngle?: number;
    loadRatio?: number;
    pumpLoadRatio?: number;
    behaviorPhase?: "tell" | "drive" | "recovery";
    retrievalMetersPerSecond?: number;
    shakeAmplitude?: number;
  };
  boatInput?: BoatAnimationInput;
}

export interface CharacterAnimationEvent {
  name: string;
  clip: PlayerAnimation;
}

export interface CharacterMotionFrame {
  bobY: number;
  leanX: number;
  leanZ: number;
  groundPitch: number;
  groundRoll: number;
  leftFootOffsetY: number;
  rightFootOffsetY: number;
  clip: PlayerAnimation;
  events: readonly CharacterAnimationEvent[];
}

export interface CharacterGroundSurfaceSample {
  height: number;
  normal: Readonly<{ x: number; y: number; z: number }>;
}

interface RigPart {
  object: THREE.Object3D;
  position: THREE.Vector3;
  rotation: THREE.Euler;
}

interface SecondarySpring {
  velocityX: number;
  velocityZ: number;
  angleX: number;
  angleZ: number;
}

interface FootContactState {
  locked: boolean;
  targetWorld: THREE.Vector3;
}

interface ManagedTransition {
  clip: PlayerAnimation;
  next: PlayerAnimation;
  elapsed: number;
}

interface ContactRecovery {
  clip: "land_soft" | "land_hard";
  elapsed: number;
  duration: number;
}

interface DesiredLayers {
  base: PlayerAnimation;
  upper: PlayerAnimation | null;
}

const LOOPING_CLIPS = new Set<PlayerAnimation>([
  "idle",
  "walk",
  "run",
  "fall",
  "carry_idle",
  "carry_walk",
  "carry_run",
  "fishing_idle",
  "reel",
  "slack",
  "brace",
  "rowboat_idle",
  "row",
  "skiff_idle",
  "skiff_fishing",
  "skiff_drive",
  "mounted_idle",
  "mounted_walk",
  "mounted_trot",
  "mounted_gallop",
  "talk_gesture"
]);

const MOVING_BASE_CLIPS = new Set<PlayerAnimation>([
  "walk",
  "run",
  "mounted_walk",
  "mounted_trot",
  "mounted_gallop"
]);
// Terrain contact is deliberately restricted to moving gaits: an idle that
// tilts to the ground plane amplifies every small terrain irregularity while
// the player is standing still. Carrying variants ground like their base gait.
const TERRAIN_CONTACT_BASE_CLIPS = new Set<PlayerAnimation>([
  "walk_start",
  "walk",
  "carry_walk",
  "run_start",
  "run",
  "carry_run"
]);
const PHASE_COMPATIBLE_BASE_CLIPS = new Set<PlayerAnimation>([
  "walk",
  "run",
  "mounted_walk",
  "mounted_trot",
  "mounted_gallop"
]);
const PHASE_COMPATIBLE_UPPER_CLIPS = new Set<PlayerAnimation>([
  "carry_walk",
  "carry_run"
]);
const BASE_TRANSITION_CLIPS = new Set<PlayerAnimation>([
  "walk_start",
  "run_start",
  "stop",
  "turn_left",
  "turn_right"
]);
const AIRBORNE_CLIPS = new Set<PlayerAnimation>([
  "jump",
  "jump_start",
  "fall",
  "land_soft",
  "land_hard"
]);
const UPPER_BODY_ONE_SHOTS = new Set<PlayerAnimation>([
  "water",
  "workstation",
  "cast",
  "hookset"
]);
const FISHING_UPPER_PULSES = new Set<PlayerAnimation>(["reel", "slack", "brace"]);

const RIG_ALIASES: Record<string, readonly string[]> = {
  root: ["rig_root", "character_root"],
  pelvis: ["rig_pelvis", "character_pelvis", "pelvis"],
  spine: ["rig_spine", "character_spine", "spine"],
  spine_02: ["rig_spine_02", "character_spine_02", "spine_02"],
  chest: ["rig_chest", "character_chest", "chest"],
  neck: ["rig_neck", "character_neck", "neck"],
  clavicle_left: ["rig_clavicle_left", "character_clavicle_left", "clavicle_left"],
  clavicle_right: ["rig_clavicle_right", "character_clavicle_right", "clavicle_right"],
  head: ["rig_head", "character_head", "head"],
  arm_left: ["rig_upper_arm_left", "character_upper_arm_left", "arm_left"],
  arm_right: ["rig_upper_arm_right", "character_upper_arm_right", "arm_right"],
  forearm_left: ["rig_forearm_left", "character_forearm_left", "forearm_left", "char_player_hand_left"],
  forearm_right: ["rig_forearm_right", "character_forearm_right", "forearm_right", "char_player_hand_right"],
  hand_left: ["rig_hand_left", "character_hand_left", "hand_left"],
  hand_right: ["rig_hand_right", "character_hand_right", "hand_right"],
  thigh_left: ["rig_thigh_left", "character_thigh_left", "thigh_left"],
  thigh_right: ["rig_thigh_right", "character_thigh_right", "thigh_right"],
  shin_left: ["rig_shin_left", "character_shin_left", "shin_left"],
  shin_right: ["rig_shin_right", "character_shin_right", "shin_right"],
  boot_left: ["rig_foot_left", "character_boot_left", "boot_left", "foot_left"],
  boot_right: ["rig_foot_right", "character_boot_right", "boot_right", "foot_right"],
  toe_left: ["rig_toe_left", "character_toe_left", "toe_left"],
  toe_right: ["rig_toe_right", "character_toe_right", "toe_right"]
};

const UPPER_TRACK_TOKENS = [
  "rig_spine",
  "rig_chest",
  "rig_neck",
  "rig_clavicle_",
  "rig_head",
  "rig_upper_arm_",
  "rig_forearm_",
  "rig_hand_",
  "character_spine",
  "character_chest",
  "character_neck",
  "character_clavicle_",
  "character_head",
  "character_upper_arm_",
  "character_forearm_",
  "character_hand_",
  "char_player_hand_"
] as const;

const ALL_PLAYER_ANIMATIONS: readonly PlayerAnimation[] = [
  "idle",
  "walk_start",
  "walk",
  "run_start",
  "run",
  "stop",
  "turn_left",
  "turn_right",
  "jump",
  "jump_start",
  "fall",
  "land_soft",
  "land_hard",
  "plant",
  "water",
  "harvest",
  "pickup",
  "carry_idle",
  "carry_walk",
  "carry_run",
  "place",
  "workstation",
  "cast",
  "hookset",
  "fishing_idle",
  "reel",
  "slack",
  "brace",
  "board",
  "board_skiff",
  "dock",
  "dock_skiff",
  "rowboat_idle",
  "row",
  "skiff_idle",
  "skiff_fishing",
  "skiff_drive",
  "mounted_idle",
  "mounted_walk",
  "mounted_trot",
  "mounted_gallop",
  "mount",
  "mount_right",
  "dismount",
  "dismount_right",
  "talk_gesture"
];

const SECONDARY_RIG_ALIASES: Record<string, readonly string[]> = {
  backpack: ["rig_backpack"],
  canteen_left: ["rig_canteen_left"],
  canteen_right: ["rig_canteen_right"],
  hat_brim: ["rig_hat_brim"]
};

export function isPlayerRigObjectName(name: string): boolean {
  return Object.values(RIG_ALIASES).some((aliases) =>
    aliases.some((alias) => name === alias || name.includes(`__${alias}_`))
  );
}

function isUpperBodyTrack(trackName: string): boolean {
  const targetName = trackName.slice(0, Math.max(0, trackName.lastIndexOf(".")));
  return UPPER_TRACK_TOKENS.some((token) => targetName.includes(token));
}

function maskedClip(
  clip: THREE.AnimationClip,
  layer: "upper" | "lower"
): THREE.AnimationClip {
  const includeUpper = layer === "upper";
  const tracks = clip.tracks
    .filter((track) => isUpperBodyTrack(track.name) === includeUpper)
    .map((track) => track.clone());
  return new THREE.AnimationClip(`${clip.name}__${layer}`, clip.duration, tracks);
}

/**
 * Catalog-driven three-layer character controller. Simulation motion selects
 * clips and authored markers; the mixer, masks, grounding, and additive lean
 * remain presentation-only.
 */
export class HumanoidAnimator {
  private readonly root: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<PlayerAnimation, THREE.AnimationAction>();
  private readonly lowerActions = new Map<PlayerAnimation, THREE.AnimationAction>();
  private readonly upperActions = new Map<PlayerAnimation, THREE.AnimationAction>();
  private readonly specs = new Map<PlayerAnimation, RuntimeAnimationClipSpec>();
  private readonly rigParts = new Map<string, RigPart>();
  private readonly footSupportSolver: HumanoidFootSupportSolver;
  private readonly secondaryParts = new Map<string, RigPart>();
  private readonly secondarySprings = new Map<string, SecondarySpring>();
  private readonly scratchPosition = new THREE.Vector3();
  private readonly rootWorldPosition = new THREE.Vector3();
  private readonly footWorldPosition = new THREE.Vector3();
  private readonly footTargetWorld = new THREE.Vector3();
  private readonly footContactStates: Record<"left" | "right", FootContactState> = {
    left: { locked: false, targetWorld: new THREE.Vector3() },
    right: { locked: false, targetWorld: new THREE.Vector3() }
  };
  private readonly footSoleClearanceMeters: Record<"left" | "right", number> = {
    left: 0.12,
    right: 0.12
  };

  private activeBaseClip: PlayerAnimation = "idle";
  private activeBaseMasked = false;
  private baseClipElapsed = 0;
  private basePlaybackScale = 1;
  private activeUpperClip: PlayerAnimation | null = null;
  private upperClipElapsed = 0;
  private upperPlaybackScale = 1;
  private activeAction: PlayerAnimation | null = null;
  private activeActionLayer: "full" | "upper" = "full";
  private actionElapsed = 0;
  private contactRecovery: ContactRecovery | null = null;
  private transition: ManagedTransition | null = null;
  private lastDesiredBase: PlayerAnimation = "idle";
  private lastContactEvent: PlayerMotionSample["contactEvent"] = "none";
  private elapsed = 0;
  private groundPitch = 0;
  private groundRoll = 0;
  private leftFootOffsetY = 0;
  private rightFootOffsetY = 0;
  private groundingFootIkScale = 1;

  public constructor(root: THREE.Object3D) {
    this.root = root;
    this.mixer = new THREE.AnimationMixer(root);
    this.footSupportSolver = new HumanoidFootSupportSolver(root);
    const asset = ASSET_BY_ID.get(root.userData.assetId as AssetId);
    const stampedSpecs = root.userData.animationClipSpecs as RuntimeAnimationClipSpec[] | undefined;
    const catalogSpecs = [
      ...(asset?.animationClips ?? []),
      ...(asset?.additionalAnimationClips ?? [])
    ];
    for (const spec of stampedSpecs ?? catalogSpecs) {
      if (this.isAnimationName(spec.name)) this.specs.set(spec.name, spec);
    }
    const clips = (root.userData.animationClips as THREE.AnimationClip[] | undefined) ?? [];
    for (const clip of clips) {
      if (!this.isAnimationName(clip.name)) continue;
      this.actions.set(clip.name, this.mixer.clipAction(clip));
      this.lowerActions.set(clip.name, this.mixer.clipAction(maskedClip(clip, "lower")));
      this.upperActions.set(clip.name, this.mixer.clipAction(maskedClip(clip, "upper")));
      if (!this.specs.has(clip.name)) {
        this.specs.set(clip.name, {
          name: clip.name,
          durationSeconds: clip.duration,
          loop: LOOPING_CLIPS.has(clip.name)
        });
      }
    }
    const collectAliases = (
      map: Map<string, RigPart>,
      aliasesBySemantic: Record<string, readonly string[]>
    ): void => {
      root.traverse((object) => {
        for (const [semantic, aliases] of Object.entries(aliasesBySemantic)) {
          if (!aliases.some((alias) => object.name === alias || object.name.includes(`__${alias}_`))) {
            continue;
          }
          const existing = map.get(semantic);
          if (!existing || (object instanceof THREE.Bone && !(existing.object instanceof THREE.Bone))) {
            map.set(semantic, {
              object,
              position: object.position.clone(),
              rotation: object.rotation.clone()
            });
          }
        }
      });
    };
    collectAliases(this.rigParts, RIG_ALIASES);
    collectAliases(this.secondaryParts, SECONDARY_RIG_ALIASES);
    for (const [semantic] of this.secondaryParts) {
      this.secondarySprings.set(semantic, {
        velocityX: 0,
        velocityZ: 0,
        angleX: 0,
        angleZ: 0
      });
    }
    root.updateWorldMatrix(true, true);
    root.getWorldPosition(this.rootWorldPosition);
    for (const side of ["left", "right"] as const) {
      const foot = this.rigParts.get(`boot_${side}`)?.object;
      if (!foot) continue;
      foot.getWorldPosition(this.footWorldPosition);
      this.footSoleClearanceMeters[side] = THREE.MathUtils.clamp(
        this.footWorldPosition.y - this.rootWorldPosition.y,
        0.04,
        0.24
      );
    }
  }

  public play(action: PlayerAnimation): void {
    if (action === "idle") {
      this.cancelAction();
      return;
    }
    const spec = this.specs.get(action);
    // Fishing hold clips are normally loops selected by simulation input, but
    // domain events also need a short presentation pulse for hook-set and
    // escape feedback. The pulse never mutates the underlying encounter.
    if (spec?.loop && !FISHING_UPPER_PULSES.has(action)) return;
    this.activeAction = action;
    this.activeActionLayer = UPPER_BODY_ONE_SHOTS.has(action) || FISHING_UPPER_PULSES.has(action)
      ? "upper"
      : "full";
    this.actionElapsed = 0;
    this.transition = null;
  }

  public cancelAction(): void {
    this.activeAction = null;
    this.actionElapsed = 0;
  }

  /**
   * Releases world-space correction history without cancelling an interaction
   * action that may have triggered the same canonical pose discontinuity.
   */
  public resetSpatialState(): void {
    this.contactRecovery = null;
    this.transition = null;
    this.lastContactEvent = "none";
    this.groundPitch = 0;
    this.groundRoll = 0;
    this.leftFootOffsetY = 0;
    this.rightFootOffsetY = 0;
    this.groundingFootIkScale = 1;
    for (const state of Object.values(this.footContactStates)) state.locked = false;
    for (const spring of this.secondarySprings.values()) {
      spring.velocityX = 0;
      spring.velocityZ = 0;
      spring.angleX = 0;
      spring.angleZ = 0;
    }
    for (const [semantic, part] of this.secondaryParts) {
      const spring = this.secondarySprings.get(semantic);
      if (!spring) continue;
      part.object.rotation.copy(part.rotation);
    }
  }

  /**
   * Clears presentation-only history after teleports, save loads, and parent
   * changes. Physics and simulation remain the sole owners of player truth.
   */
  public resetTransientState(): void {
    this.mixer.stopAllAction();
    this.activeBaseClip = "idle";
    this.activeBaseMasked = false;
    this.baseClipElapsed = 0;
    this.basePlaybackScale = 1;
    this.activeUpperClip = null;
    this.upperClipElapsed = 0;
    this.upperPlaybackScale = 1;
    this.activeAction = null;
    this.actionElapsed = 0;
    this.lastDesiredBase = "idle";
    this.resetSpatialState();
  }

  /**
   * Returns the authored duration used by the one-shot action timer. Keeping
   * this lookup here lets application-level interaction locks follow the same
   * catalog contract as the visible animation.
   */
  public actionDurationSeconds(action: PlayerAnimation): number {
    return this.clipDuration(action, 0.8);
  }

  /** Releases mixer bindings when a scene lifetime ends. */
  public dispose(): void {
    this.cancelAction();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
    this.actions.clear();
    this.lowerActions.clear();
    this.upperActions.clear();
    this.specs.clear();
    this.rigParts.clear();
    this.secondaryParts.clear();
    this.secondarySprings.clear();
  }

  public currentClip(): PlayerAnimation {
    return this.displayClip();
  }

  public playbackState(): Readonly<{
    clip: PlayerAnimation;
    playbackScale: number;
    activeAction: PlayerAnimation | null;
    baseClip: PlayerAnimation;
    upperClip: PlayerAnimation | null;
    basePhase: number;
  }> {
    const clip = this.displayClip();
    return {
      clip,
      playbackScale: clip === this.activeUpperClip
        ? this.upperPlaybackScale
        : this.basePlaybackScale,
      activeAction: this.activeAction,
      baseClip: this.activeBaseClip,
      upperClip: this.activeUpperClip,
      basePhase: this.normalizedBasePhase()
    };
  }

  public normalizedBasePhase(): number {
    const duration = this.clipDuration(this.activeBaseClip, 0);
    return duration > 0 ? wrapTime(this.baseClipElapsed, duration) / duration : 0;
  }

  public update(
    deltaSeconds: number,
    context: CharacterAnimationContext,
    reducedMotion: boolean = false
  ): CharacterMotionFrame {
    const dt = THREE.MathUtils.clamp(deltaSeconds, 0, 0.1);
    this.elapsed += dt;
    this.updateAction(dt);
    this.updateContactRecovery(context.motion, dt);

    const desired = this.desiredLayers(context);
    let selectedBase: PlayerAnimation;
    let selectedUpper: PlayerAnimation | null;

    if (this.activeAction && this.activeActionLayer === "full") {
      selectedBase = this.activeAction;
      selectedUpper = null;
    } else if (this.contactRecovery) {
      selectedBase = this.contactRecovery.clip;
      selectedUpper = null;
    } else {
      selectedBase = this.resolveTransition(desired.base, context.motion, dt);
      selectedUpper = this.activeAction && this.activeActionLayer === "upper"
        ? this.activeAction
        : desired.upper;
    }
    this.lastDesiredBase = desired.base;

    // A hook-set or catch gesture must not replace a seated lower body.
    if (context.boatInput && this.activeAction
      && ["brace", "cast", "hookset", "slack", "pickup"].includes(this.activeAction)) {
      selectedBase = context.boatInput.boatTypeId === "boat.rowboat" ? "rowboat_idle" : "skiff_fishing";
      selectedUpper = this.activeAction;
    }
    const baseMasked = selectedUpper !== null;
    this.setBaseClip(selectedBase, context.motion.speedMetersPerSecond, context.boatInput, baseMasked);
    this.setUpperClip(selectedUpper, context.motion.speedMetersPerSecond);
    if (context.mode === "sport-fishing" && this.activeUpperClip === "reel") {
      this.upperPlaybackScale = THREE.MathUtils.clamp((context.fishingInput?.retrievalMetersPerSecond ?? 0) * 0.8, 0.15, 1.6);
      this.upperActions.get("reel")?.setEffectiveTimeScale(this.upperPlaybackScale);
    }

    const baseBefore = this.baseClipElapsed;
    const baseDuration = this.clipDuration(this.activeBaseClip);
    this.baseClipElapsed += this.clipAdvance(
      this.activeBaseClip,
      context.motion.speedMetersPerSecond,
      dt,
      this.basePlaybackScale
    );
    const events = this.collectEvents(
      this.activeBaseClip,
      baseBefore,
      this.baseClipElapsed,
      baseDuration,
      context,
      this.basePlaybackScale,
      false
    );
    if (this.specs.get(this.activeBaseClip)?.loop && baseDuration > 0) {
      this.baseClipElapsed = wrapTime(this.baseClipElapsed, baseDuration);
    }

    if (this.activeUpperClip) {
      const upperBefore = this.upperClipElapsed;
      const upperDuration = this.clipDuration(this.activeUpperClip);
      this.upperClipElapsed += this.clipAdvance(
        this.activeUpperClip,
        context.motion.speedMetersPerSecond,
        dt,
        this.upperPlaybackScale
      );
      events.push(...this.collectEvents(
        this.activeUpperClip,
        upperBefore,
        this.upperClipElapsed,
        upperDuration,
        context,
        this.upperPlaybackScale,
        true
      ));
      if (this.specs.get(this.activeUpperClip)?.loop && upperDuration > 0) {
        this.upperClipElapsed = wrapTime(this.upperClipElapsed, upperDuration);
      }
    }

    const hasAuthoredBase = this.activeBaseAction() !== undefined;
    if (hasAuthoredBase) this.restoreProceduralRig(dt);
    else this.fadeOutAuthoredLayers();
    this.mixer.update(dt);

    let proceduralFrame: CharacterMotionFrame | null = null;
    if (!hasAuthoredBase) {
      proceduralFrame = this.applyProceduralPose(
        dt,
        this.displayClip(),
        context,
        reducedMotion,
        events
      );
    }

    this.updateGrounding(dt, context, reducedMotion);
    this.applySecondarySprings(dt, context, reducedMotion);
    const bodyGroundPitch = this.groundPitch * CANONICAL_RENDER_CONFIG.motion.groundingBodyTiltScale;
    const bodyGroundRoll = this.groundRoll * CANONICAL_RENDER_CONFIG.motion.groundingBodyTiltScale;

    // Steer the torso toward the rod, dig in against the load, and let a
    // head-shaking fish buzz a fine tremor through the stance.
    const fishShake = context.fishingInput?.shakeAmplitude ?? 0;
    const rodLean = (context.fishingInput?.rodDirectionAngle ?? 0) * 0.16
      + (reducedMotion ? 0 : Math.sin(this.elapsed * 26) * fishShake * 0.02);
    const pumpLoad = context.fishingInput?.pumpLoadRatio ?? 0;
    const recoverySet = context.fishingInput?.behaviorPhase === "recovery" ? 0.025 : 0;
    const fishingLean = -Math.min(1.2, context.fishingInput?.loadRatio ?? 0) * 0.14
      - (context.fishingInput?.isBracing ? 0.055 + pumpLoad * 0.055 : 0)
      - recoverySet;

    if (proceduralFrame) {
      return {
        ...proceduralFrame,
        leanZ: proceduralFrame.leanZ + rodLean,
        leanX: proceduralFrame.leanX + fishingLean,
        groundPitch: bodyGroundPitch,
        groundRoll: bodyGroundRoll,
        leftFootOffsetY: this.leftFootOffsetY,
        rightFootOffsetY: this.rightFootOffsetY
      };
    }

    return {
      bobY: reducedMotion ? 0 : this.additiveBob(context),
      leanX: (reducedMotion ? 0 : this.additiveLeanX(context)) + fishingLean,
      leanZ: reducedMotion ? 0 : this.additiveLeanZ(context) + rodLean,
      groundPitch: bodyGroundPitch,
      groundRoll: bodyGroundRoll,
      leftFootOffsetY: this.leftFootOffsetY,
      rightFootOffsetY: this.rightFootOffsetY,
      clip: this.displayClip(),
      events
    };
  }

  private desiredLayers(context: CharacterAnimationContext): DesiredLayers {
    const { mode, motion, carrying, fishingInput, boatInput } = context;
    if (!motion.isGrounded && (mode === "on-foot" || mode === "farm-placement")) {
      if (motion.airbornePhase === "rising") {
        return { base: this.actions.has("jump_start") ? "jump_start" : "jump", upper: null };
      }
      return { base: this.actions.has("fall") ? "fall" : "jump", upper: null };
    }
    if (mode === "sport-fishing") {
      const upper = fishingInput?.isSlacking
        ? "slack"
        : fishingInput?.isReeling
          ? "reel"
          : fishingInput?.isBracing
            ? "brace"
            : "fishing_idle";
      const craftStance = boatInput?.boatTypeId === "boat.rowboat"
        ? "rowboat_idle"
        : boatInput?.boatTypeId === "boat.skiff"
          ? "skiff_fishing"
          : "idle";
      return { base: craftStance, upper };
    }
    if (mode === "basic-fishing") return { base: "idle", upper: "fishing_idle" };
    if (mode === "boat-driving") {
      if (boatInput?.boatTypeId === "boat.rowboat") {
        const blocked = boatInput.motion?.isCollisionBlocked ?? motion.isCollisionBlocked;
        const exerting = Math.abs(boatInput.throttle) > 0.05 && !blocked;
        return { base: exerting ? "row" : "rowboat_idle", upper: null };
      }
      if (boatInput?.boatTypeId === "boat.skiff") {
        const effort = boatInput.motion?.controlEffort ?? Math.max(
          Math.abs(boatInput.throttle),
          Math.abs(boatInput.steering)
        );
        return { base: effort > 0.05 ? "skiff_drive" : "skiff_idle", upper: null };
      }
      return { base: "idle", upper: null };
    }
    if (mode === "mounted") {
      if (motion.speedMetersPerSecond <= 0.1 || motion.isCollisionBlocked) {
        return { base: "mounted_idle", upper: null };
      }
      return {
        base: motion.requestedGait === "gallop"
          ? "mounted_gallop"
          : motion.requestedGait === "trot"
            ? "mounted_trot"
            : "mounted_walk",
        upper: null
      };
    }
    if (motion.speedMetersPerSecond <= 0.1 || motion.isCollisionBlocked) {
      const upper = carrying
        ? "carry_idle"
        : context.talking && this.actions.has("talk_gesture")
          ? "talk_gesture"
          : null;
      return { base: "idle", upper };
    }
    const running = motion.requestedGait === "run";
    const locomotionUpper = carrying
      ? running ? "carry_run" : "carry_walk"
      : context.talking && this.actions.has("talk_gesture")
        ? "talk_gesture"
        : null;
    return {
      base: running ? "run" : "walk",
      upper: locomotionUpper
    };
  }

  private resolveTransition(
    desired: PlayerAnimation,
    motion: PlayerMotionSample,
    dt: number
  ): PlayerAnimation {
    if (
      AIRBORNE_CLIPS.has(desired) ||
      desired === "row" ||
      desired === "rowboat_idle" ||
      desired === "skiff_idle" ||
      desired === "skiff_fishing" ||
      desired === "skiff_drive" ||
      desired === "mounted_idle" ||
      desired === "mounted_walk" ||
      desired === "mounted_trot" ||
      desired === "mounted_gallop"
    ) {
      this.transition = null;
      return desired;
    }
    if (this.transition) {
      this.transition.elapsed += dt;
      this.transition.next = desired;
      const duration = this.clipDuration(this.transition.clip);
      if (duration > 0 && this.transition.elapsed < duration) return this.transition.clip;
      const next = this.transition.next;
      this.transition = null;
      return next;
    }
    if (desired === this.lastDesiredBase) return desired;
    const startClip = desired === "walk"
      ? "walk_start"
      : desired === "run"
        ? "run_start"
        : null;
    if (startClip && !MOVING_BASE_CLIPS.has(this.lastDesiredBase) && this.actions.has(startClip)) {
      this.transition = { clip: startClip, next: desired, elapsed: 0 };
      return startClip;
    }
    if (!MOVING_BASE_CLIPS.has(desired) && Math.abs(motion.turnRateRadiansPerSecond) > 0.8) {
      const clip = motion.turnRateRadiansPerSecond > 0 ? "turn_left" : "turn_right";
      if (this.actions.has(clip)) {
        this.transition = { clip, next: desired, elapsed: 0 };
        return clip;
      }
    }
    return desired;
  }

  private updateAction(dt: number): void {
    if (!this.activeAction) return;
    this.actionElapsed += dt;
    if (this.actionElapsed >= this.clipDuration(this.activeAction, 0.6)) {
      this.cancelAction();
    }
  }

  private updateContactRecovery(motion: PlayerMotionSample, dt: number): void {
    if (
      motion.contactEvent !== this.lastContactEvent &&
      (motion.contactEvent === "land-soft" || motion.contactEvent === "land-hard")
    ) {
      const preferred = motion.contactEvent === "land-hard" ? "land_hard" : "land_soft";
      if (this.actions.has(preferred)) {
        this.contactRecovery = {
          clip: preferred,
          elapsed: 0,
          duration: this.clipDuration(preferred, preferred === "land_hard" ? 0.48 : 0.32)
        };
        this.transition = null;
      }
    }
    this.lastContactEvent = motion.contactEvent;
    if (!this.contactRecovery) return;
    this.contactRecovery.elapsed += dt;
    if (this.contactRecovery.elapsed >= this.contactRecovery.duration) {
      this.contactRecovery = null;
    }
  }

  private setBaseClip(
    next: PlayerAnimation,
    speed: number,
    boatInput: BoatAnimationInput | undefined,
    masked: boolean
  ): void {
    const scale = this.playbackScale(next, speed, boatInput);
    const actionMap = masked ? this.lowerActions : this.actions;
    if (next === this.activeBaseClip && masked === this.activeBaseMasked) {
      this.basePlaybackScale = scale;
      actionMap.get(next)?.setEffectiveTimeScale(scale);
      return;
    }
    const blend = this.baseBlendSeconds(next);
    const previousClip = this.activeBaseClip;
    const previousAction = this.activeBaseAction();
    const previousDuration = this.clipDuration(previousClip, 0);
    const preservePhase = this.shouldPreserveBasePhase(previousClip, next);
    const previousPhase = previousDuration > 0
      ? wrapTime(this.baseClipElapsed, previousDuration) / previousDuration
      : 0;
    const nextAction = actionMap.get(next);
    const spec = this.specs.get(next);
    if (nextAction) {
      nextAction.reset();
      if (preservePhase) nextAction.time = previousPhase * this.clipDuration(next);
      else if (scale < 0) nextAction.time = Math.max(0, this.clipDuration(next) - 0.0001);
      nextAction.clampWhenFinished = !spec?.loop;
      nextAction.setLoop(spec?.loop ? THREE.LoopRepeat : THREE.LoopOnce, spec?.loop ? Infinity : 1);
      nextAction.setEffectiveTimeScale(scale).play();
      if (previousAction && previousAction !== nextAction) {
        nextAction.crossFadeFrom(previousAction, blend, false);
      } else {
        nextAction.fadeIn(blend);
      }
    } else {
      previousAction?.fadeOut(blend);
    }
    this.activeBaseClip = next;
    this.activeBaseMasked = masked;
    this.baseClipElapsed = preservePhase
      ? previousPhase * this.clipDuration(next)
      : scale < 0 ? this.clipDuration(next) : 0;
    this.basePlaybackScale = scale;
  }

  private setUpperClip(next: PlayerAnimation | null, speed: number): void {
    if (next === this.activeUpperClip) {
      if (next) {
        this.upperPlaybackScale = this.playbackScale(next, speed);
        this.upperActions.get(next)?.setEffectiveTimeScale(
          this.upperPlaybackScale
        );
      }
      return;
    }
    const blend = CANONICAL_RENDER_CONFIG.motion.actionBlendSeconds;
    if (this.activeUpperClip) this.upperActions.get(this.activeUpperClip)?.fadeOut(blend);
    this.activeUpperClip = next;
    const preservePhase = Boolean(next && PHASE_COMPATIBLE_UPPER_CLIPS.has(next));
    const basePhase = this.normalizedBasePhase();
    this.upperClipElapsed = preservePhase && next ? basePhase * this.clipDuration(next) : 0;
    this.upperPlaybackScale = next ? this.playbackScale(next, speed) : 1;
    if (!next) return;
    const action = this.upperActions.get(next);
    const spec = this.specs.get(next);
    if (action) {
      action.reset();
      if (preservePhase) action.time = this.upperClipElapsed;
      action.clampWhenFinished = !spec?.loop;
      action.setLoop(spec?.loop ? THREE.LoopRepeat : THREE.LoopOnce, spec?.loop ? Infinity : 1);
      action.setEffectiveTimeScale(this.upperPlaybackScale).fadeIn(blend).play();
    }
  }

  private shouldPreserveBasePhase(previous: PlayerAnimation, next: PlayerAnimation): boolean {
    if (previous === next && this.specs.get(next)?.loop) return true;
    return PHASE_COMPATIBLE_BASE_CLIPS.has(previous) && PHASE_COMPATIBLE_BASE_CLIPS.has(next);
  }

  private playbackScale(
    clip: PlayerAnimation,
    speed: number,
    boatInput?: BoatAnimationInput
  ): number {
    const spec = this.specs.get(clip);
    if (clip === "row" && boatInput) {
      const direction = boatInput.throttle < 0 ? -1 : 1;
      return direction * THREE.MathUtils.clamp(
        0.68 + Math.abs(boatInput.throttle) * 0.62,
        0.68,
        1.3
      );
    }
    if (clip === "skiff_drive" && boatInput) {
      const effort = boatInput.motion?.controlEffort ?? Math.max(
        Math.abs(boatInput.throttle),
        Math.abs(boatInput.steering)
      );
      return THREE.MathUtils.clamp(0.78 + effort * 0.42, 0.78, 1.2);
    }
    if (spec?.referenceSpeedMetersPerSecond) {
      return THREE.MathUtils.clamp(
        speed / spec.referenceSpeedMetersPerSecond,
        CANONICAL_RENDER_CONFIG.motion.locomotionPlaybackMinimum,
        CANONICAL_RENDER_CONFIG.motion.locomotionPlaybackMaximum
      );
    }
    return 1;
  }

  private clipAdvance(
    clip: PlayerAnimation,
    speed: number,
    dt: number,
    playbackScale: number
  ): number {
    const spec = this.specs.get(clip);
    if (spec?.referenceSpeedMetersPerSecond && Math.abs(playbackScale) > 0) {
      const resolvedTravelMeters = Math.max(0, speed) * dt;
      return Math.sign(playbackScale) * resolvedTravelMeters / spec.referenceSpeedMetersPerSecond;
    }
    return dt * playbackScale;
  }

  private collectEvents(
    clip: PlayerAnimation,
    before: number,
    after: number,
    duration: number,
    context: CharacterAnimationContext,
    playbackScale: number,
    upperLayer: boolean
  ): CharacterAnimationEvent[] {
    const spec = this.specs.get(clip);
    if (!spec?.events?.length || duration <= 0) return [];
    const forward = playbackScale >= 0;
    const wrapped = spec.loop && (forward ? after >= duration : after < 0);
    return spec.events
      .filter((event) => {
        if (upperLayer && event.name.startsWith("footstep_")) return false;
        if (event.name.startsWith("footstep_")) {
          if (
            context.motion.speedMetersPerSecond <= 0.15 ||
            !context.motion.isGrounded ||
            context.motion.isCollisionBlocked
          ) return false;
        }
        if (event.name.startsWith("paddle_")) {
          if (
            context.boatInput?.motion?.isCollisionBlocked ||
            Math.abs(context.boatInput?.throttle ?? 0) <= 0.05
          ) return false;
        }
        if (forward) {
          return wrapped
            ? event.timeSeconds > before || event.timeSeconds <= wrapTime(after, duration)
            : event.timeSeconds > before && event.timeSeconds <= after;
        }
        const wrappedAfter = duration + after;
        return wrapped
          ? event.timeSeconds < before || event.timeSeconds >= wrappedAfter
          : event.timeSeconds < before && event.timeSeconds >= after;
      })
      .map((event) => ({ name: event.name, clip }));
  }

  private baseBlendSeconds(next: PlayerAnimation): number {
    if (this.activeAction || UPPER_BODY_ONE_SHOTS.has(next)) {
      return CANONICAL_RENDER_CONFIG.motion.actionBlendSeconds;
    }
    if (next === "land_soft" || next === "land_hard") {
      return CANONICAL_RENDER_CONFIG.motion.recoveryBlendSeconds;
    }
    return CANONICAL_RENDER_CONFIG.motion.locomotionBlendSeconds;
  }

  private additiveBob(_context: CharacterAnimationContext): number {
    // Authored locomotion already contains contact compression and push-off.
    // A second sinusoidal root bob detached the body from the planted feet.
    return 0;
  }

  private additiveLeanX(context: CharacterAnimationContext): number {
    if (context.motion.contactEvent === "land-hard") {
      return 0.07 * context.motion.landingImpactStrength;
    }
    if (context.mode === "boat-driving") {
      return -THREE.MathUtils.clamp(
        (context.boatInput?.motion?.accelerationMetersPerSecondSquared ?? 0) / 20,
        -0.055,
        0.055
      );
    }
    if (!MOVING_BASE_CLIPS.has(this.activeBaseClip)) return 0;
    return 0.025 * THREE.MathUtils.clamp(
      context.motion.accelerationMetersPerSecondSquared / 18,
      0,
      1
    );
  }

  private additiveLeanZ(context: CharacterAnimationContext): number {
    if (context.mode === "boat-driving") {
      return -THREE.MathUtils.clamp(
        context.boatInput?.motion?.yawRateRadiansPerSecond ?? 0,
        -1.8,
        1.8
      ) * 0.035;
    }
    return -THREE.MathUtils.clamp(
      context.motion.turnRateRadiansPerSecond,
      -4,
      4
    ) * 0.012;
  }

  private updateGrounding(
    dt: number,
    context: CharacterAnimationContext,
    reducedMotion: boolean
  ): void {
    const canGround =
      TERRAIN_CONTACT_BASE_CLIPS.has(this.activeBaseClip) &&
      context.motion.isGrounded &&
      context.motion.slopeRadians <= THREE.MathUtils.degToRad(38) &&
      (context.mode === "on-foot" || context.mode === "farm-placement");
    let desiredPitch = 0;
    let desiredRoll = 0;
    let desiredLeftFoot = 0;
    let desiredRightFoot = 0;
    this.groundingFootIkScale = this.activeBaseClip === "run" ||
      this.activeBaseClip === "run_start" ||
      this.activeBaseClip === "carry_run"
      ? CANONICAL_RENDER_CONFIG.motion.groundingRunFootIkScale
      : this.activeBaseClip === "walk" ||
        this.activeBaseClip === "walk_start" ||
        this.activeBaseClip === "carry_walk"
        ? CANONICAL_RENDER_CONFIG.motion.groundingWalkFootIkScale
        : 1;
    if (canGround) {
      const yaw = context.facingRadians ?? 0;
      const normal = context.motion.groundNormal;
      const localNormalX = normal.x * Math.cos(yaw) - normal.z * Math.sin(yaw);
      const localNormalZ = normal.x * Math.sin(yaw) + normal.z * Math.cos(yaw);
      const safeNormalY = Math.max(0.2, normal.y);
      const maxTilt = CANONICAL_RENDER_CONFIG.motion.groundingMaxTiltRadians;
      desiredPitch = THREE.MathUtils.clamp(
        Math.atan2(localNormalZ, safeNormalY),
        -maxTilt,
        maxTilt
      );
      desiredRoll = THREE.MathUtils.clamp(
        -Math.atan2(localNormalX, safeNormalY),
        -maxTilt,
        maxTilt
      );
      const halfStanceMeters = 0.16;
      const maxFootOffset = CANONICAL_RENDER_CONFIG.motion.groundingMaxFootOffsetMeters;
      desiredLeftFoot = THREE.MathUtils.clamp(
        localNormalX * halfStanceMeters / safeNormalY,
        -maxFootOffset,
        maxFootOffset
      );
      desiredRightFoot = THREE.MathUtils.clamp(
        -localNormalX * halfStanceMeters / safeNormalY,
        -maxFootOffset,
        maxFootOffset
      );
      desiredLeftFoot *= this.groundingFootIkScale;
      desiredRightFoot *= this.groundingFootIkScale;
    }
    if (reducedMotion) {
      desiredPitch = 0;
      desiredRoll = 0;
    }
    const smoothing = 1 - Math.exp(
      -CANONICAL_RENDER_CONFIG.motion.groundingResponse * Math.max(0, dt)
    );
    this.groundPitch = THREE.MathUtils.lerp(this.groundPitch, desiredPitch, smoothing);
    this.groundRoll = THREE.MathUtils.lerp(this.groundRoll, desiredRoll, smoothing);
    this.leftFootOffsetY = THREE.MathUtils.lerp(this.leftFootOffsetY, desiredLeftFoot, smoothing);
    this.rightFootOffsetY = THREE.MathUtils.lerp(this.rightFootOffsetY, desiredRightFoot, smoothing);
  }

  /**
   * Applies world-space stance locks after the mixer pose and character root
   * transform have both been resolved. Each sole samples the same authored
   * traversal support as Rapier, so terrain, roads, bridges, piers, and
   * interiors cannot disagree with the visible feet.
   */
  public resolveGroundContacts(
    context: CharacterAnimationContext,
    sampleSurface: (x: number, z: number) => CharacterGroundSurfaceSample
  ): void {
    const enabled = CANONICAL_RENDER_CONFIG.motion.footIkEnabled &&
      TERRAIN_CONTACT_BASE_CLIPS.has(this.activeBaseClip) &&
      context.motion.isGrounded &&
      context.motion.slopeRadians <= THREE.MathUtils.degToRad(38) &&
      (context.mode === "on-foot" || context.mode === "farm-placement") &&
      !context.boatInput;
    if (!enabled) {
      for (const state of Object.values(this.footContactStates)) state.locked = false;
      return;
    }

    this.root.updateWorldMatrix(true, true);
    for (const side of ["left", "right"] as const) {
      const thigh = this.rigParts.get(`thigh_${side}`)?.object;
      const shin = this.rigParts.get(`shin_${side}`)?.object;
      const foot = this.rigParts.get(`boot_${side}`)?.object;
      if (!thigh || !shin || !foot) continue;

      foot.getWorldPosition(this.footWorldPosition);
      const contactWeight = this.footContactWeight(side);
      const state = this.footContactStates[side];
      if (contactWeight <= 0.001) {
        state.locked = false;
        continue;
      }
      if (!state.locked) {
        state.locked = true;
        state.targetWorld.copy(this.footWorldPosition);
      }

      const surface = sampleSurface(state.targetWorld.x, state.targetWorld.z);
      const strength = contactWeight * this.groundingFootIkScale;
      const maxHorizontalCorrection = 0.22;
      const correctionX = THREE.MathUtils.clamp(
        state.targetWorld.x - this.footWorldPosition.x,
        -maxHorizontalCorrection,
        maxHorizontalCorrection
      );
      const correctionZ = THREE.MathUtils.clamp(
        state.targetWorld.z - this.footWorldPosition.z,
        -maxHorizontalCorrection,
        maxHorizontalCorrection
      );
      const desiredY = surface.height + this.footSoleClearanceMeters[side];
      const correctionY = THREE.MathUtils.clamp(
        desiredY - this.footWorldPosition.y,
        -CANONICAL_RENDER_CONFIG.motion.groundingMaxFootOffsetMeters,
        CANONICAL_RENDER_CONFIG.motion.groundingMaxFootOffsetMeters
      );
      this.footTargetWorld.copy(this.footWorldPosition).add(
        this.scratchPosition.set(correctionX, correctionY, correctionZ).multiplyScalar(strength)
      );
      this.solveTwoBoneChain(
        thigh,
        shin,
        foot,
        this.footTargetWorld,
        side === "left" ? -1 : 1
      );
    }
  }

  private footContactWeight(side: "left" | "right"): number {
    if (!TERRAIN_CONTACT_BASE_CLIPS.has(this.activeBaseClip)) return 0;
    if (this.activeBaseClip === "walk_start" || this.activeBaseClip === "run_start") {
      return side === "left" ? 1 : 0;
    }
    const duration = this.clipDuration(this.activeBaseClip, 0);
    const event = this.specs.get(this.activeBaseClip)?.events?.find(
      (candidate) => candidate.name === `footstep_${side}`
    );
    if (!event || duration <= 0) return 0.5;
    const phaseAfterContact = wrapTime(this.baseClipElapsed - event.timeSeconds, duration) / duration;
    // A running foot leaves the floor much earlier than a walking foot. Using
    // the walk's near-half-cycle lock on run stretched the planted leg behind
    // the body after toe-off and turned the flight phase into a drag.
    const running = this.activeBaseClip === "run" || this.activeBaseClip === "carry_run";
    const holdUntil = running ? 0.12 : 0.30;
    const releaseBy = running ? 0.30 : 0.48;
    return 1 - THREE.MathUtils.smoothstep(phaseAfterContact, holdUntil, releaseBy);
  }

  private applySecondarySprings(
    dt: number,
    context: CharacterAnimationContext,
    reducedMotion: boolean
  ): void {
    const scale = reducedMotion
      ? CANONICAL_RENDER_CONFIG.motion.reducedMotionSecondaryScale
      : 1;
    const clampedDt = THREE.MathUtils.clamp(dt, 0, 0.05);
    const stiffness = CANONICAL_RENDER_CONFIG.motion.secondarySpringStiffness;
    const damping = CANONICAL_RENDER_CONFIG.motion.secondarySpringDamping;
    const accel = THREE.MathUtils.clamp(
      context.motion.accelerationMetersPerSecondSquared,
      -24,
      24
    );
    const turn = THREE.MathUtils.clamp(context.motion.turnRateRadiansPerSecond, -4, 4);
    const responses: Record<string, number> = {
      backpack: 0.012,
      canteen_left: 0.018,
      canteen_right: 0.016,
      hat_brim: 0.01
    };
    for (const [semantic, part] of this.secondaryParts) {
      const spring = this.secondarySprings.get(semantic);
      if (!spring) continue;
      if (scale <= 0) {
        spring.velocityX = 0;
        spring.velocityZ = 0;
        spring.angleX = 0;
        spring.angleZ = 0;
        part.object.rotation.x = part.rotation.x;
        part.object.rotation.z = part.rotation.z;
        continue;
      }
      const response = responses[semantic] ?? 0.012;
      const targetX = THREE.MathUtils.clamp(-accel * response, -0.18, 0.18) * scale;
      const targetZ = THREE.MathUtils.clamp(-turn * response * 0.45, -0.14, 0.14) * scale;
      spring.velocityX += (targetX - spring.angleX) * stiffness * clampedDt;
      spring.velocityZ += (targetZ - spring.angleZ) * stiffness * clampedDt;
      const decay = Math.exp(-damping * clampedDt);
      spring.velocityX *= decay;
      spring.velocityZ *= decay;
      spring.angleX += spring.velocityX * clampedDt;
      spring.angleZ += spring.velocityZ * clampedDt;
      part.object.rotation.x = part.rotation.x + spring.angleX;
      part.object.rotation.z = part.rotation.z + spring.angleZ;
    }
  }

  private displayClip(): PlayerAnimation {
    if (this.activeAction) return this.activeAction;
    if (this.contactRecovery) return this.contactRecovery.clip;
    if (
      this.activeUpperClip &&
      this.activeUpperClip !== "carry_idle" &&
      this.activeUpperClip !== "carry_walk" &&
      this.activeUpperClip !== "carry_run"
    ) {
      return this.activeUpperClip;
    }
    if (BASE_TRANSITION_CLIPS.has(this.activeBaseClip) || AIRBORNE_CLIPS.has(this.activeBaseClip)) {
      return this.activeBaseClip;
    }
    return this.activeUpperClip ?? this.activeBaseClip;
  }

  private activeBaseAction(): THREE.AnimationAction | undefined {
    return (this.activeBaseMasked ? this.lowerActions : this.actions).get(this.activeBaseClip);
  }

  private clipDuration(clip: PlayerAnimation, fallback = 1): number {
    return this.specs.get(clip)?.durationSeconds
      ?? this.actions.get(clip)?.getClip().duration
      ?? fallback;
  }

  private isAnimationName(value: string): value is PlayerAnimation {
    return (ALL_PLAYER_ANIMATIONS as readonly string[]).includes(value);
  }

  private fadeOutAuthoredLayers(): void {
    const blend = CANONICAL_RENDER_CONFIG.motion.locomotionBlendSeconds;
    this.activeBaseAction()?.fadeOut(blend);
    if (this.activeUpperClip) this.upperActions.get(this.activeUpperClip)?.fadeOut(blend);
  }

  private restoreProceduralRig(_deltaSeconds: number): void {
    for (const part of this.rigParts.values()) {
      part.object.position.copy(part.position);
      part.object.rotation.copy(part.rotation);
    }
  }

  private posePart(name: string, pivotY: number, angleX: number, smoothing: number): void {
    const part = this.rigParts.get(name);
    if (!part) return;
    const cosine = Math.cos(angleX);
    const sine = Math.sin(angleX);
    const relativeY = part.position.y - pivotY;
    const relativeZ = part.position.z;
    this.scratchPosition.set(
      part.position.x,
      pivotY + relativeY * cosine - relativeZ * sine,
      relativeY * sine + relativeZ * cosine
    );
    part.object.position.lerp(this.scratchPosition, smoothing);
    part.object.rotation.x = THREE.MathUtils.lerp(
      part.object.rotation.x,
      part.rotation.x + angleX,
      smoothing
    );
  }

  private readonly chainIk = {
    shoulder: new THREE.Vector3(), elbow: new THREE.Vector3(), wrist: new THREE.Vector3(),
    direction: new THREE.Vector3(), bend: new THREE.Vector3(), desiredElbow: new THREE.Vector3(),
    from: new THREE.Vector3(), to: new THREE.Vector3(),
    rotation: new THREE.Quaternion(), world: new THREE.Quaternion(), parent: new THREE.Quaternion()
  };

  /** Constrains either hand to an authored world-space grip marker. */
  public alignHandGrip(side: "left" | "right", target: THREE.Vector3): void {
    const upper = this.rigParts.get(`arm_${side}`)?.object;
    const lower = this.rigParts.get(`forearm_${side}`)?.object;
    const hand = this.rigParts.get(`hand_${side}`)?.object;
    if (!upper || !lower || !hand) return;
    this.solveTwoBoneChain(upper, lower, hand, target, side === "left" ? -1 : 1);
  }

  /** Keeps mounted boots on the authored stirrup supports after the mixer pose. */
  public alignFootSupports(leftTarget: THREE.Vector3, rightTarget: THREE.Vector3): void {
    this.footSupportSolver.alignFeet(leftTarget, rightTarget);
  }

  /** Backward-compatible semantic wrapper for the fishing rod's free hand. */
  public alignFishingGrip(target: THREE.Vector3): void {
    this.alignHandGrip("left", target);
  }

  private solveTwoBoneChain(
    upper: THREE.Object3D,
    lower: THREE.Object3D,
    end: THREE.Object3D,
    target: THREE.Vector3,
    fallbackBendX: number
  ): void {
    const k = this.chainIk;
    upper.getWorldPosition(k.shoulder);
    lower.getWorldPosition(k.elbow);
    end.getWorldPosition(k.wrist);
    const a = k.shoulder.distanceTo(k.elbow);
    const b = k.elbow.distanceTo(k.wrist);
    if (a < 0.001 || b < 0.001) return;
    k.direction.subVectors(target, k.shoulder);
    const rawDistance = k.direction.length();
    if (rawDistance < 0.0001) return;
    const distance = THREE.MathUtils.clamp(rawDistance, Math.abs(a - b) + 0.001, a + b - 0.001);
    k.direction.normalize();
    k.bend.subVectors(k.elbow, k.shoulder).addScaledVector(k.direction, -k.bend.dot(k.direction));
    if (k.bend.lengthSq() < 0.00001) {
      k.bend.set(fallbackBendX, 0, 0)
        .addScaledVector(k.direction, -fallbackBendX * k.direction.x);
    }
    k.bend.normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    k.desiredElbow.copy(k.shoulder).addScaledVector(k.direction, along)
      .addScaledVector(k.bend, Math.sqrt(Math.max(0, a * a - along * along)));
    k.from.subVectors(k.elbow, k.shoulder).normalize();
    k.to.subVectors(k.desiredElbow, k.shoulder).normalize();
    this.rotateChainBone(upper, k.from, k.to);
    lower.getWorldPosition(k.elbow);
    end.getWorldPosition(k.wrist);
    k.from.subVectors(k.wrist, k.elbow).normalize();
    k.to.subVectors(target, k.elbow).normalize();
    this.rotateChainBone(lower, k.from, k.to);
  }

  private rotateChainBone(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): void {
    const k = this.chainIk;
    k.rotation.setFromUnitVectors(from, to);
    bone.getWorldQuaternion(k.world).premultiply(k.rotation);
    if (bone.parent) bone.parent.getWorldQuaternion(k.parent).invert();
    else k.parent.identity();
    bone.quaternion.copy(k.parent.multiply(k.world));
    bone.updateWorldMatrix(false, true);
  }

  private applyProceduralPose(
    dt: number,
    clip: PlayerAnimation,
    context: CharacterAnimationContext,
    reducedMotion: boolean,
    events: readonly CharacterAnimationEvent[]
  ): CharacterMotionFrame {
    const motion = context.motion;
    const smoothing = 1 - Math.exp(-18 * Math.max(0, dt));
    const rate = clip === "run" || clip === "carry_run" ? 11.2 : 8.2;
    const moving = motion.speedMetersPerSecond > 0.1 &&
      (clip === "walk" || clip === "run" || clip === "carry_walk" || clip === "carry_run");
    const strength = clip === "run" || clip === "carry_run" ? 0.5 : moving ? 0.34 : 0;
    const step = Math.sin(this.elapsed * rate) * strength;
    let leftArm = step;
    let rightArm = -step;
    let leftLeg = -step * 0.76;
    let rightLeg = step * 0.76;
    if (clip === "jump" || clip === "jump_start" || clip === "fall") {
      leftArm = 0.18;
      rightArm = -0.18;
      leftLeg = -0.32;
      rightLeg = -0.2;
    } else if (clip === "rowboat_idle" || clip === "row" || clip === "skiff_idle" || clip === "skiff_drive") {
      const stroke = clip === "row" ? Math.sin(this.elapsed * 4.2) : 0;
      leftArm = rightArm = -0.58 + stroke * 0.34;
      leftLeg = rightLeg = 1.12;
    } else if (clip === "reel" || clip === "brace" || clip === "slack" || clip === "fishing_idle") {
      const seated = context.mode === "sport-fishing"
        && (context.boatInput?.boatTypeId === "boat.rowboat"
          || context.boatInput?.boatTypeId === "boat.skiff");
      if (clip === "reel") {
        leftArm = -0.62;
        rightArm = -0.78;
      } else if (clip === "brace") {
        leftArm = -0.78;
        rightArm = -0.92;
      } else if (clip === "slack") {
        leftArm = -0.42;
        rightArm = -0.38 + Math.sin(this.elapsed * 3.1) * 0.08;
      } else {
        leftArm = -0.58;
        rightArm = -0.72;
      }
      if (seated) {
        leftLeg = rightLeg = 1.12;
      }
    } else if (this.activeAction) {
      const duration = this.clipDuration(this.activeAction, 0.6);
      const contact = Math.sin(THREE.MathUtils.clamp(this.actionElapsed / duration, 0, 1) * Math.PI);
      leftArm = rightArm = -0.82 * contact;
      leftLeg += 0.2 * contact;
    }
    this.posePart("arm_left", 1.48, leftArm, smoothing);
    this.posePart("forearm_left", 1.48, leftArm * 0.72, smoothing);
    this.posePart("arm_right", 1.48, rightArm, smoothing);
    this.posePart("forearm_right", 1.48, rightArm * 0.72, smoothing);
    this.posePart("thigh_left", 0.84, leftLeg, smoothing);
    this.posePart("shin_left", 0.84, leftLeg * 0.72, smoothing);
    this.posePart("boot_left", 0.84, leftLeg * 0.42, smoothing);
    this.posePart("thigh_right", 0.84, rightLeg, smoothing);
    this.posePart("shin_right", 0.84, rightLeg * 0.72, smoothing);
    this.posePart("boot_right", 0.84, rightLeg * 0.42, smoothing);
    const rodLean = (context.fishingInput?.rodDirectionAngle ?? 0) * 0.2;
    return {
      bobY: reducedMotion || AIRBORNE_CLIPS.has(clip) || !moving
        ? 0
        : Math.abs(Math.sin(this.elapsed * rate)) * 0.026,
      leanX: reducedMotion ? 0 : AIRBORNE_CLIPS.has(clip) ? -0.045 : -0.02,
      leanZ: reducedMotion ? 0 : rodLean,
      groundPitch: 0,
      groundRoll: 0,
      leftFootOffsetY: 0,
      rightFootOffsetY: 0,
      clip,
      events
    };
  }
}

function wrapTime(value: number, duration: number): number {
  return ((value % duration) + duration) % duration;
}

export { HumanoidAnimator as AnimationController };
