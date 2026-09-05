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
import { resolveHumanoidRig, type HumanoidRigBinding } from "./HumanoidRig";
import { TwoBoneConstraintSolver } from "./TwoBoneConstraintSolver";

export type PlayerAnimation =
  | "idle"
  | "walk_start"
  | "walk"
  | "run_start"
  | "run"
  | "stop"
  | "turn_left"
  | "turn_right"
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
  /** Fraction of frame time consumed by movement; only distance-driven gaits use it. */
  locomotionTimeScale?: number;
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

interface SourcePoseSnapshot {
  object: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3;
  posedPosition: THREE.Vector3; posedQuaternion: THREE.Quaternion; posedScale: THREE.Vector3;
}

interface FootContactState {
  locked: boolean;
  targetWorld: THREE.Vector3;
}

interface ManagedTransition {
  clip: PlayerAnimation;
  next: PlayerAnimation;
}

interface ContactRecovery {
  clip: "land_soft" | "land_hard";
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

const ALL_PLAYER_ANIMATIONS: readonly PlayerAnimation[] = [
  "idle",
  "walk_start",
  "walk",
  "run_start",
  "run",
  "stop",
  "turn_left",
  "turn_right",
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

function maskedClip(
  clip: THREE.AnimationClip,
  layer: "upper" | "lower",
  upperNodes: ReadonlySet<string>
): THREE.AnimationClip {
  const includeUpper = layer === "upper";
  const tracks = clip.tracks
    .filter((track) => upperNodes.has(THREE.PropertyBinding.parseTrackName(track.name).nodeName) === includeUpper)
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
  private readonly footSupportSolver: HumanoidFootSupportSolver;
  private readonly rigBinding: HumanoidRigBinding;
  private readonly sharedChainSolver = new TwoBoneConstraintSolver();
  private readonly restTransforms: SourcePoseSnapshot[] = [];
  private readonly groundPoseTransforms: SourcePoseSnapshot[] = [];
  private groundPoseCorrected = false;
  private readonly scratchPosition = new THREE.Vector3();
  private readonly footWorldPosition = new THREE.Vector3();
  private readonly footTargetWorld = new THREE.Vector3();
  private readonly pelvisWorldPosition = new THREE.Vector3();
  private readonly supportRootWorldPosition = new THREE.Vector3();
  private readonly groundContactTargets = {
    left: { target: new THREE.Vector3(), normal: new THREE.Vector3(), weight: 0 },
    right: { target: new THREE.Vector3(), normal: new THREE.Vector3(), weight: 0 }
  };
  private readonly footContactStates: Record<"left" | "right", FootContactState> = {
    left: { locked: false, targetWorld: new THREE.Vector3() },
    right: { locked: false, targetWorld: new THREE.Vector3() }
  };
  private activeBaseClip: PlayerAnimation = "idle";
  private baseStarted = false;
  private hasEvaluatedPose = false;
  private restartAction = false;
  private previewClip: PlayerAnimation | null = null;
  private pendingPreviewPhase: number | null = null;
  private headLookYaw = 0;
  private activeBaseMasked = false;
  private baseClipElapsed = 0;
  private basePlaybackScale = 1;
  private activeUpperClip: PlayerAnimation | null = null;
  private upperClipElapsed = 0;
  private upperPlaybackScale = 1;
  private activeAction: PlayerAnimation | null = null;
  private activeActionLayer: "full" | "upper" = "full";
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
    this.rigBinding = resolveHumanoidRig(root);
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
      const upperNodes = this.rigBinding.upperBodyNodes;
      this.lowerActions.set(clip.name, this.mixer.clipAction(maskedClip(clip, "lower", upperNodes)));
      this.upperActions.set(clip.name, this.mixer.clipAction(maskedClip(clip, "upper", upperNodes)));
      if (!this.specs.has(clip.name)) {
        this.specs.set(clip.name, {
          name: clip.name,
          durationSeconds: clip.duration,
          loop: LOOPING_CLIPS.has(clip.name)
        });
      }
    }
    root.traverse((object) => {
      if (object instanceof THREE.Bone) this.restTransforms.push({ object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone(),
        posedPosition: object.position.clone(), posedQuaternion: object.quaternion.clone(), posedScale: object.scale.clone() });
    });
    const groundNodes = new Set<THREE.Object3D | undefined>([this.rigBinding.bones.pelvis]);
    for (const leg of Object.values(this.rigBinding.legs)) {
      groundNodes.add(leg.thigh); groundNodes.add(leg.shin); groundNodes.add(leg.foot);
    }
    this.groundPoseTransforms.push(...this.restTransforms.filter((entry) => groundNodes.has(entry.object)));
    if (this.rigBinding.production) {
      for (const spec of this.specs.values()) {
        if (!spec.optional && !this.actions.has(spec.name as PlayerAnimation)) {
          throw new Error(`[HumanoidAnimator] ${asset?.id}: missing authored clip ${spec.name}`);
        }
      }
    }
  }

  public play(action: PlayerAnimation): void {
    if (action === "idle") {
      this.cancelAction();
      return;
    }
    const spec = this.specs.get(action);
    if (!this.actions.has(action)) {
      throw new Error(`[HumanoidAnimator] Missing authored action ${action}`);
    }
    // Fishing hold clips are normally loops selected by simulation input, but
    // domain events also need a short presentation pulse for hook-set and
    // escape feedback. The pulse never mutates the underlying encounter.
    if (spec?.loop && !FISHING_UPPER_PULSES.has(action)) return;
    this.activeAction = action;
    this.restartAction = true;
    this.activeActionLayer = UPPER_BODY_ONE_SHOTS.has(action) || FISHING_UPPER_PULSES.has(action)
      ? "upper"
      : "full";
    this.transition = null;
  }

  public cancelAction(): void {
    this.activeAction = null;
  }

  /**
   * Releases world-space correction history without cancelling an interaction
   * action that may have triggered the same canonical pose discontinuity.
   */
  public resetSpatialState(): void {
    this.restoreGroundContactPose();
    this.contactRecovery = null;
    this.transition = null;
    this.lastContactEvent = "none";
    this.groundPitch = 0;
    this.groundRoll = 0;
    this.leftFootOffsetY = 0;
    this.rightFootOffsetY = 0;
    this.groundingFootIkScale = 1;
    this.headLookYaw = 0;
    for (const state of Object.values(this.footContactStates)) state.locked = false;
  }

  /**
   * Clears presentation-only history after teleports, save loads, and parent
   * changes. Physics and simulation remain the sole owners of player truth.
   */
  public resetTransientState(): void {
    this.mixer.stopAllAction();
    for (const { object, position, quaternion, scale } of this.restTransforms) {
      object.position.copy(position); object.quaternion.copy(quaternion); object.scale.copy(scale);
    }
    this.captureMixerPose();
    this.activeBaseClip = "idle";
    this.baseStarted = false;
    this.hasEvaluatedPose = false;
    this.restartAction = false;
    this.previewClip = null;
    this.pendingPreviewPhase = null;
    this.activeBaseMasked = false;
    this.baseClipElapsed = 0;
    this.basePlaybackScale = 1;
    this.activeUpperClip = null;
    this.upperClipElapsed = 0;
    this.upperPlaybackScale = 1;
    this.activeAction = null;
    this.lastDesiredBase = "idle";
    this.resetSpatialState();
  }

  /**
   * Returns the authored duration used by the one-shot action timer. Keeping
   * this lookup here lets application-level interaction locks follow the same
   * catalog contract as the visible animation.
   */
  public actionDurationSeconds(action: PlayerAnimation): number {
    if (!this.actions.has(action)) throw new Error(`[HumanoidAnimator] Missing authored action ${action}`);
    return this.clipDuration(action);
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
    return duration > 0 ? (this.specs.get(this.activeBaseClip)?.loop
      ? wrapTime(this.baseClipElapsed, duration) / duration
      : THREE.MathUtils.clamp(this.baseClipElapsed / duration, 0, 1)) : 0;
  }

  /** Art Yard selects real actions while retaining the production pose/contact path. */
  public setPreviewClip(clip: PlayerAnimation | null): void {
    if (clip && !this.actions.has(clip)) throw new Error(`[HumanoidAnimator] Missing preview clip ${clip}`);
    this.resetTransientState();
    this.previewClip = clip;
  }

  public setPreviewPhase(normalized: number): void {
    this.pendingPreviewPhase = THREE.MathUtils.clamp(normalized, 0, 1);
  }

  public previewPhase(): number {
    if (!this.previewClip || this.activeUpperClip !== this.previewClip) return this.normalizedBasePhase();
    const duration = this.clipDuration(this.previewClip);
    return this.specs.get(this.previewClip)?.loop
      ? wrapTime(this.upperClipElapsed, duration) / duration
      : THREE.MathUtils.clamp(this.upperClipElapsed / duration, 0, 1);
  }

  /** World-up additive yaw is independent of the source head's bone axes. */
  public lookTowardHeading(relativeWorldYaw: number, deltaSeconds: number): void {
    const head = this.rigBinding.bones.head;
    if (!head) return;
    this.headLookYaw = THREE.MathUtils.damp(this.headLookYaw, THREE.MathUtils.clamp(relativeWorldYaw, -0.75, 0.75), 10, Math.max(0, deltaSeconds));
    head.updateWorldMatrix(true, false);
    const k = this.chainIk;
    k.rotation.setFromAxisAngle(k.direction.set(0, 1, 0), this.headLookYaw);
    head.getWorldQuaternion(k.world).premultiply(k.rotation);
    if (head.parent) head.parent.getWorldQuaternion(k.parent).invert();
    else k.parent.identity();
    head.quaternion.copy(k.parent.multiply(k.world)).normalize();
    head.updateWorldMatrix(false, true);
  }

  public update(
    deltaSeconds: number,
    context: CharacterAnimationContext,
    reducedMotion: boolean = false
  ): CharacterMotionFrame {
    let remaining = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    const events: CharacterAnimationEvent[] = [];
    let result: CharacterMotionFrame;
    do {
      const dt = Math.min(remaining, 1 / 30);
      result = this.updateStep(dt, context, reducedMotion);
      events.push(...result.events);
      remaining -= dt;
    } while (remaining > 0.000001);
    return { ...result, events };
  }

  private updateStep(dt: number, context: CharacterAnimationContext, reducedMotion: boolean): CharacterMotionFrame {
    this.elapsed += dt;
    this.updateAction();
    this.updateContactRecovery(context.motion);

    const desired = this.desiredLayers(context);
    let selectedBase: PlayerAnimation;
    let selectedUpper: PlayerAnimation | null;

    if (this.previewClip) {
      const upperPreview = UPPER_BODY_ONE_SHOTS.has(this.previewClip)
        || FISHING_UPPER_PULSES.has(this.previewClip)
        || this.previewClip === "fishing_idle"
        || this.previewClip === "talk_gesture"
        || this.previewClip.startsWith("carry_");
      selectedBase = upperPreview ? desired.base : this.previewClip;
      selectedUpper = upperPreview ? this.previewClip : null;
      if (upperPreview && context.boatInput) {
        selectedBase = context.boatInput.boatTypeId === "boat.rowboat" ? "rowboat_idle" : "skiff_fishing";
      }
    } else if (this.activeAction && this.activeActionLayer === "full") {
      selectedBase = this.activeAction;
      selectedUpper = null;
    } else if (this.contactRecovery) {
      selectedBase = this.contactRecovery.clip;
      selectedUpper = null;
    } else {
      selectedBase = this.resolveTransition(desired.base, context.motion);
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
    const locomotionTimeScale = THREE.MathUtils.clamp(context.locomotionTimeScale ?? 1, 0, 1);
    this.setBaseClip(selectedBase, context.motion.speedMetersPerSecond, context.boatInput, baseMasked, locomotionTimeScale);
    this.setUpperClip(selectedUpper, context.motion.speedMetersPerSecond, locomotionTimeScale);
    this.restartAction = false;
    if (this.pendingPreviewPhase !== null) {
      const upper = this.previewClip !== null && this.previewClip === this.activeUpperClip;
      const time = this.pendingPreviewPhase * this.clipDuration(upper ? this.activeUpperClip! : this.activeBaseClip);
      if (upper) this.upperClipElapsed = time;
      else this.baseClipElapsed = time;
      const action = upper ? this.upperActions.get(this.activeUpperClip!) : this.activeBaseAction();
      if (action) { action.time = time; action.paused = false; }
      this.pendingPreviewPhase = null;
    }
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
      if (this.specs.get(this.activeUpperClip)?.loop && upperDuration > 0 && this.activeAction !== this.activeUpperClip) {
        this.upperClipElapsed = wrapTime(this.upperClipElapsed, upperDuration);
      }
    }

    this.restoreMixerPose();
    this.mixer.update(dt);
    this.captureMixerPose();
    this.hasEvaluatedPose = true;
    this.updateGrounding(dt, context, reducedMotion);
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
        return { base: "jump_start", upper: null };
      }
      return { base: "fall", upper: null };
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
    motion: PlayerMotionSample
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
      const starting = this.transition.clip === "walk_start" || this.transition.clip === "run_start";
      const moving = MOVING_BASE_CLIPS.has(desired);
      if ((starting && desired !== this.transition.next) || (!starting && moving)) {
        this.transition = null;
        return desired;
      }
      if ((this.transition.clip === "turn_left" || this.transition.clip === "turn_right")
        && Math.abs(motion.turnRateRadiansPerSecond) > 0.8) {
        const turn = motion.turnRateRadiansPerSecond > 0 ? "turn_left" : "turn_right";
        if (turn !== this.transition.clip && this.actions.has(turn)) {
          this.transition = { clip: turn, next: desired };
          return turn;
        }
      }
      this.transition.next = desired;
      const duration = this.clipDuration(this.transition.clip);
      if (duration > 0 && this.baseClipElapsed < duration) return this.transition.clip;
      const next = this.transition.next;
      this.transition = null;
      return next;
    }
    if (desired === "idle" && MOVING_BASE_CLIPS.has(this.lastDesiredBase) && this.actions.has("stop")) {
      this.transition = { clip: "stop", next: desired };
      return "stop";
    }
    if (desired === "idle" && Math.abs(motion.turnRateRadiansPerSecond) > 0.8) {
      const clip = motion.turnRateRadiansPerSecond > 0 ? "turn_left" : "turn_right";
      if (this.actions.has(clip)) {
        this.transition = { clip, next: desired };
        return clip;
      }
    }
    if (desired === this.lastDesiredBase) return desired;
    const startClip = desired === "walk"
      ? "walk_start"
      : desired === "run"
        ? "run_start"
        : null;
    if (startClip && !MOVING_BASE_CLIPS.has(this.lastDesiredBase) && this.actions.has(startClip)) {
      this.transition = { clip: startClip, next: desired };
      return startClip;
    }
    if (!MOVING_BASE_CLIPS.has(desired) && Math.abs(motion.turnRateRadiansPerSecond) > 0.8) {
      const clip = motion.turnRateRadiansPerSecond > 0 ? "turn_left" : "turn_right";
      if (this.actions.has(clip)) {
        this.transition = { clip, next: desired };
        return clip;
      }
    }
    return desired;
  }

  private updateAction(): void {
    if (!this.activeAction || this.restartAction) return;
    const time = this.activeUpperClip === this.activeAction
      ? this.upperClipElapsed
      : this.activeBaseClip === this.activeAction ? this.baseClipElapsed : 0;
    if (time >= this.clipDuration(this.activeAction)) this.cancelAction();
  }

  private updateContactRecovery(motion: PlayerMotionSample): void {
    if (
      motion.contactEvent !== this.lastContactEvent &&
      (motion.contactEvent === "land-soft" || motion.contactEvent === "land-hard")
    ) {
      const preferred = motion.contactEvent === "land-hard" ? "land_hard" : "land_soft";
      if (this.actions.has(preferred)) {
        this.contactRecovery = {
          clip: preferred,
          duration: this.clipDuration(preferred, preferred === "land_hard" ? 0.48 : 0.32)
        };
        this.transition = null;
        this.baseStarted = false;
        if (this.activeBaseClip === preferred) this.baseClipElapsed = 0;
      }
    }
    this.lastContactEvent = motion.contactEvent;
    if (!this.contactRecovery) return;
    if (this.activeBaseClip === this.contactRecovery.clip && this.baseClipElapsed >= this.contactRecovery.duration) {
      this.contactRecovery = null;
    }
  }

  private setBaseClip(
    next: PlayerAnimation,
    speed: number,
    boatInput: BoatAnimationInput | undefined,
    masked: boolean,
    locomotionTimeScale: number
  ): void {
    const scale = this.playbackScale(next, speed, boatInput, locomotionTimeScale);
    const actionMap = masked ? this.lowerActions : this.actions;
    if (this.baseStarted && next === this.activeBaseClip && masked === this.activeBaseMasked
      && !(this.restartAction && next === this.activeAction)) {
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
    if (!nextAction) throw new Error(`[HumanoidAnimator] Missing base clip ${next}`);
    const spec = this.specs.get(next);
    if (nextAction) {
      nextAction.reset();
      if (preservePhase) nextAction.time = previousPhase * this.clipDuration(next);
      else if (scale < 0) nextAction.time = this.clipDuration(next);
      nextAction.clampWhenFinished = !spec?.loop;
      nextAction.setLoop(spec?.loop ? THREE.LoopRepeat : THREE.LoopOnce, spec?.loop ? Infinity : 1);
      nextAction.setEffectiveTimeScale(scale).play();
      if (this.previewClip || !this.hasEvaluatedPose) {
        if (previousAction && previousAction !== nextAction) previousAction.stop();
        nextAction.stopFading().setEffectiveWeight(1);
      } else if (previousAction && previousAction !== nextAction) {
        nextAction.crossFadeFrom(previousAction, blend, false);
      } else {
        nextAction.fadeIn(blend);
      }
    } else {
      previousAction?.fadeOut(blend);
    }
    this.activeBaseClip = next;
    this.baseStarted = true;
    this.activeBaseMasked = masked;
    this.baseClipElapsed = preservePhase
      ? previousPhase * this.clipDuration(next)
      : scale < 0 ? this.clipDuration(next) : 0;
    this.basePlaybackScale = scale;
  }

  private setUpperClip(next: PlayerAnimation | null, speed: number, locomotionTimeScale: number): void {
    if (next === this.activeUpperClip && !(this.restartAction && next === this.activeAction)) {
      if (next) {
        this.upperPlaybackScale = this.playbackScale(next, speed, undefined, locomotionTimeScale);
        this.upperActions.get(next)?.setEffectiveTimeScale(
          this.upperPlaybackScale
        );
      }
      return;
    }
    const blend = CANONICAL_RENDER_CONFIG.motion.actionBlendSeconds;
    if (this.activeUpperClip) {
      const previous = this.upperActions.get(this.activeUpperClip);
      if (this.previewClip) previous?.stop(); else previous?.fadeOut(blend);
    }
    this.activeUpperClip = next;
    const preservePhase = Boolean(next && PHASE_COMPATIBLE_UPPER_CLIPS.has(next));
    const basePhase = this.normalizedBasePhase();
    this.upperClipElapsed = preservePhase && next ? basePhase * this.clipDuration(next) : 0;
    this.upperPlaybackScale = next ? this.playbackScale(next, speed, undefined, locomotionTimeScale) : 1;
    if (!next) return;
    const action = this.upperActions.get(next);
    if (!action) throw new Error(`[HumanoidAnimator] Missing upper clip ${next}`);
    const spec = this.specs.get(next);
    if (action) {
      action.reset();
      if (preservePhase) action.time = this.upperClipElapsed;
      action.clampWhenFinished = !spec?.loop;
      action.setLoop(spec?.loop ? THREE.LoopRepeat : THREE.LoopOnce, spec?.loop ? Infinity : 1);
      action.setEffectiveTimeScale(this.upperPlaybackScale).play();
      if (this.previewClip || !this.hasEvaluatedPose) action.stopFading().setEffectiveWeight(1);
      else action.fadeIn(blend);
    }
  }

  private shouldPreserveBasePhase(previous: PlayerAnimation, next: PlayerAnimation): boolean {
    if (previous === next && this.specs.get(next)?.loop) return true;
    return PHASE_COMPATIBLE_BASE_CLIPS.has(previous) && PHASE_COMPATIBLE_BASE_CLIPS.has(next);
  }

  private playbackScale(
    clip: PlayerAnimation,
    speed: number,
    boatInput?: BoatAnimationInput,
    locomotionTimeScale = 1
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
      return Math.max(0, speed) / spec.referenceSpeedMetersPerSecond * locomotionTimeScale;
    }
    return 1;
  }

  private clipAdvance(
    _clip: PlayerAnimation,
    _speed: number,
    dt: number,
    playbackScale: number
  ): number {
    // The same rate advances the mixer, contact phase, and event cursor.
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
      -1,
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
        -localNormalX * halfStanceMeters / safeNormalY,
        -maxFootOffset,
        maxFootOffset
      );
      desiredRightFoot = THREE.MathUtils.clamp(
        localNormalX * halfStanceMeters / safeNormalY,
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
    this.restoreGroundContactPose();
    const enabled = CANONICAL_RENDER_CONFIG.motion.footIkEnabled &&
      this.hasGroundContactClip() &&
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
      if (!this.footSupportSolver.soleWorldPosition(side, this.footWorldPosition)) continue;
      const contactWeight = this.footContactWeight(side);
      this.groundContactTargets[side].weight = 0;
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
      const strength = contactWeight;
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
      const desiredY = surface.height;
      const correctionY = THREE.MathUtils.clamp(
        desiredY - this.footWorldPosition.y,
        -CANONICAL_RENDER_CONFIG.motion.groundingMaxFootOffsetMeters,
        CANONICAL_RENDER_CONFIG.motion.groundingMaxFootOffsetMeters
      );
      this.footTargetWorld.copy(this.footWorldPosition).add(
        this.scratchPosition.set(correctionX, correctionY, correctionZ).multiplyScalar(strength)
      );
      const contact = this.groundContactTargets[side];
      contact.target.copy(this.footTargetWorld);
      contact.normal.set(surface.normal.x, surface.normal.y, surface.normal.z);
      contact.weight = strength;
    }
    this.groundPoseCorrected = true;
    // Native independent-foot rigs can slightly exceed a rigid leg's reach.
    // Adapt the presentation pelvis within the existing grounding budget, then
    // solve both legs from that common body pose; the simulation root stays put.
    let pelvisDrop = 0;
    for (const side of ["left", "right"] as const) {
      const contact = this.groundContactTargets[side];
      if (contact.weight > 0) pelvisDrop = Math.max(pelvisDrop,
        this.footSupportSolver.requiredPelvisDrop(side, contact.target, contact.normal, contact.weight));
    }
    const pelvis = this.rigBinding.bones.pelvis;
    if (pelvis && pelvisDrop > 0) {
      pelvis.getWorldPosition(this.pelvisWorldPosition);
      this.pelvisWorldPosition.y -= Math.min(pelvisDrop, CANONICAL_RENDER_CONFIG.motion.groundingMaxFootOffsetMeters);
      if (pelvis.parent) pelvis.parent.worldToLocal(this.pelvisWorldPosition);
      pelvis.position.copy(this.pelvisWorldPosition);
      pelvis.updateWorldMatrix(false, true);
    }
    for (const side of ["left", "right"] as const) {
      const contact = this.groundContactTargets[side];
      if (contact.weight > 0) this.footSupportSolver.alignSole(side, contact.target, contact.normal, contact.weight);
    }
  }

  private footContactWeight(side: "left" | "right"): number {
    if (!this.hasGroundContactClip()) return 0;
    const spec = this.specs.get(this.activeBaseClip);
    const contacts = spec?.contacts?.[side];
    if (contacts) {
      const duration = this.clipDuration(this.activeBaseClip, 0);
      const time = spec?.loop ? wrapTime(this.baseClipElapsed, duration) : this.baseClipElapsed;
      let weight = 0;
      for (const interval of contacts) {
        if (time < interval.start || time > interval.end) continue;
        const fade = Math.min(0.05, (interval.end - interval.start) * 0.2);
        const enter = interval.start === 0 ? 1 : THREE.MathUtils.smoothstep(time - interval.start, 0, fade);
        const wrapsIntoStart = spec?.loop && Math.abs(interval.end - duration) < 0.00001 && contacts.some((other) => other.start === 0);
        const leave = wrapsIntoStart ? 1 : THREE.MathUtils.smoothstep(interval.end - time, 0, fade);
        weight = Math.max(weight, enter * leave);
      }
      return weight;
    }
    return 0;
  }

  private hasGroundContactClip(): boolean {
    if (this.activeBaseClip === "idle" || this.activeBaseClip === "carry_idle") return false;
    return Boolean(this.specs.get(this.activeBaseClip)?.contacts);
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
    // The cursor and mixer must wrap at the same exported sampler duration;
    // rounded catalog seconds otherwise accumulate a phase offset each loop.
    return this.actions.get(clip)?.getClip().duration
      ?? this.specs.get(clip)?.durationSeconds
      ?? fallback;
  }

  private isAnimationName(value: string): value is PlayerAnimation {
    return (ALL_PLAYER_ANIMATIONS as readonly string[]).includes(value);
  }

  private restoreGroundContactPose(): void {
    if (!this.groundPoseCorrected) return;
    for (const { object, posedPosition, posedQuaternion, posedScale } of this.groundPoseTransforms) {
      object.position.copy(posedPosition); object.quaternion.copy(posedQuaternion); object.scale.copy(posedScale);
    }
    this.groundPoseCorrected = false;
  }

  private restoreMixerPose(): void {
    this.groundPoseCorrected = false;
    // PropertyMixer may skip identical samples. Restore the last evaluated pose,
    // never bind pose, so a skipped write cannot erase an authored static track.
    for (const { object, posedPosition, posedQuaternion, posedScale } of this.restTransforms) {
      object.position.copy(posedPosition);
      object.quaternion.copy(posedQuaternion);
      object.scale.copy(posedScale);
    }
  }

  private captureMixerPose(): void {
    for (const { object, posedPosition, posedQuaternion, posedScale } of this.restTransforms) {
      posedPosition.copy(object.position);
      posedQuaternion.copy(object.quaternion);
      posedScale.copy(object.scale);
    }
  }

  private readonly chainIk = {
    direction: new THREE.Vector3(), bend: new THREE.Vector3(),
    rotation: new THREE.Quaternion(), world: new THREE.Quaternion(), parent: new THREE.Quaternion()
  };

  private readonly handGripWorld = new THREE.Quaternion();
  private readonly handGripLocalRotation = new THREE.Quaternion();
  private readonly handGripOffset = new THREE.Vector3();
  private readonly handGripScale = new THREE.Vector3();
  private readonly handGripTarget = new THREE.Vector3();

  /** Constrains either palm marker to an authored world-space grip frame. */
  public alignHandGrip(side: "left" | "right", target: THREE.Vector3, worldOrientation?: THREE.Quaternion): void {
    const arm = this.rigBinding.arms[side];
    if (arm) {
      const k = this.chainIk;
      this.root.updateWorldMatrix(true, true);
      arm.hand.getWorldQuaternion(this.handGripWorld);
      if (arm.grip) {
        arm.grip.getWorldPosition(this.handGripOffset);
        arm.hand.worldToLocal(this.handGripOffset);
        if (worldOrientation) {
          arm.grip.getWorldQuaternion(this.handGripLocalRotation);
          this.handGripLocalRotation.premultiply(k.parent.copy(this.handGripWorld).invert()).invert();
          this.handGripWorld.copy(worldOrientation).multiply(this.handGripLocalRotation);
        }
        arm.hand.getWorldScale(this.handGripScale);
        this.handGripOffset.multiply(this.handGripScale).applyQuaternion(this.handGripWorld);
      } else {
        this.handGripOffset.set(0, 0, 0);
        if (worldOrientation) this.handGripWorld.copy(worldOrientation);
      }
      this.handGripTarget.copy(target).sub(this.handGripOffset);
      this.root.getWorldQuaternion(k.world);
      k.bend.copy(arm.bendDirection).applyQuaternion(k.world);
      this.sharedChainSolver.solve(arm.upper, arm.lower, arm.lowerTip, this.handGripTarget, k.bend);
      if (arm.hand.parent) arm.hand.parent.getWorldQuaternion(k.parent).invert();
      else k.parent.identity();
      arm.hand.quaternion.copy(k.parent.multiply(this.handGripWorld)).normalize();
      arm.hand.updateWorldMatrix(false, true);
      return;
    }
  }

  /** Seat contact follows the sampled pelvis, independent of its source bind height. */
  public alignPelvisSupport(worldSeat: THREE.Vector3): void {
    const pelvis = this.rigBinding.bones.pelvis;
    if (!pelvis) return;
    this.root.updateWorldMatrix(true, true);
    pelvis.getWorldPosition(this.pelvisWorldPosition);
    this.root.getWorldPosition(this.supportRootWorldPosition);
    this.supportRootWorldPosition.add(worldSeat).sub(this.pelvisWorldPosition);
    if (this.root.parent) this.root.parent.worldToLocal(this.supportRootWorldPosition);
    this.root.position.copy(this.supportRootWorldPosition);
    this.root.updateWorldMatrix(false, true);
  }

  /** Keeps mounted boots on the authored stirrup supports after the mixer pose. */
  public alignFootSupports(leftTarget: THREE.Vector3, rightTarget: THREE.Vector3,
    leftNormal: Readonly<{ x: number; y: number; z: number }> = THREE.Object3D.DEFAULT_UP,
    rightNormal: Readonly<{ x: number; y: number; z: number }> = leftNormal): void {
    this.footSupportSolver.alignFeet(leftTarget, rightTarget, leftNormal, rightNormal);
  }

}

function wrapTime(value: number, duration: number): number {
  return ((value % duration) + duration) % duration;
}

export { HumanoidAnimator as AnimationController };
