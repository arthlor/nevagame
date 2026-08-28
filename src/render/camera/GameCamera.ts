import * as THREE from "three";
import type { CameraInputIntent } from "../../input/InputRouter";
import type {
  BoatMotionSample,
  PlayerMotionSample
} from "../../simulation/core/PhysicsAdapter";
import type { GameMode } from "../../simulation/core/types";
import { WorldLayout } from "../../world/WorldLayout";
import { FARMHOUSE_INTERIOR_BOUNDS } from "../../world/FarmhouseInterior";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";

export interface CameraCollisionResolver {
  resolveCameraPosition(
    focus: { x: number; y: number; z: number },
    desired: { x: number; y: number; z: number },
    radius?: number
  ): { position: { x: number; y: number; z: number }; obstructed: boolean };
}

export interface CameraMotionInput {
  player: PlayerMotionSample;
  boat?: BoatMotionSample;
  discontinuityReason?: "none" | "teleport" | "load" | "recovery" | "boarding" | "docking";
  discontinuitySequence?: number;
  lookHint?: { x: number; y: number; z: number };
  fightReachMeters?: number;
  lineTension?: number;
  snapTimerSeconds?: number;
  fightBehavior?: string;
}

export interface CameraProfile {
  distance: number;
  minDistance: number;
  maxDistance: number;
  pitchRadians: number;
  minPitchRadians: number;
  maxPitchRadians: number;
  focusHeight: number;
  lookAhead: number;
  fovDegrees: number;
}

const degrees = THREE.MathUtils.degToRad;
const REFERENCE_ASPECT_RATIO = 16 / 9;

export const CAMERA_TUNING = Object.freeze({
  horizontalOrbitRadiansPerPixel: 0.0045,
  verticalOrbitRadiansPerPixel: 0.0038,
  zoomMetersPerWheelPixel: 0.009,
  rotationResponse: 18,
  distanceResponse: 10,
  profileResponse: 9,
  horizontalFollowResponse: 14,
  verticalFollowResponse: 9,
  obstructionRecoveryResponse: 5.5,
  collisionRadiusMeters: 0.32,
  terrainClearanceMeters: 0.48,
  teleportSnapDistanceMeters: 8,
  maximumNarrowAspectFovIncreaseDegrees: 9
});

const ON_FOOT_PROFILE: CameraProfile = {
  distance: 11.2,
  minDistance: 7,
  maxDistance: 16,
  pitchRadians: degrees(27.5),
  minPitchRadians: degrees(16),
  maxPitchRadians: degrees(58),
  focusHeight: 1.22,
  lookAhead: 2.35,
  fovDegrees: 47
};

export const INTERIOR_CAMERA_PROFILE: CameraProfile = {
  distance: 4.6,
  minDistance: 2.8,
  maxDistance: 5.8,
  pitchRadians: degrees(18),
  minPitchRadians: degrees(8),
  maxPitchRadians: degrees(32),
  focusHeight: 0.95,
  lookAhead: 0.85,
  fovDegrees: 52
};

export const CAMERA_PROFILES: Readonly<Record<GameMode, CameraProfile>> = {
  "on-foot": ON_FOOT_PROFILE,
  "farm-placement": {
    ...ON_FOOT_PROFILE,
    distance: 14,
    minDistance: 9.5,
    maxDistance: 19,
    pitchRadians: degrees(43),
    focusHeight: 0.7,
    lookAhead: 1,
    fovDegrees: 44
  },
  "boat-driving": {
    ...ON_FOOT_PROFILE,
    distance: 16.8,
    minDistance: 11.2,
    maxDistance: 23,
    pitchRadians: degrees(30),
    focusHeight: 1.46,
    lookAhead: 6.4,
    fovDegrees: 51
  },
  mounted: {
    ...ON_FOOT_PROFILE,
    distance: 13.2,
    minDistance: 9.5,
    maxDistance: 19,
    pitchRadians: degrees(29),
    focusHeight: 1.55,
    lookAhead: 3.2,
    fovDegrees: 49
  },
  "basic-fishing": {
    ...ON_FOOT_PROFILE,
    distance: 10.5,
    minDistance: 8,
    maxDistance: 14,
    pitchRadians: degrees(31),
    focusHeight: 1.25,
    lookAhead: 4.8,
    fovDegrees: 46
  },
  "sport-fishing": {
    ...ON_FOOT_PROFILE,
    distance: 9.5,
    minDistance: 8,
    maxDistance: 13,
    pitchRadians: degrees(34),
    focusHeight: 1.45,
    lookAhead: 7,
    fovDegrees: 43
  },
  menu: ON_FOOT_PROFILE,
  paused: ON_FOOT_PROFILE
};

/** Longer boom for pelagic fights so a 40 m+ tuna stays on screen. */
export const SPORT_TUNA_CAMERA_PROFILE: CameraProfile = {
  ...ON_FOOT_PROFILE,
  distance: 13.6,
  minDistance: 10,
  maxDistance: 19,
  pitchRadians: degrees(28),
  minPitchRadians: degrees(16),
  maxPitchRadians: degrees(52),
  focusHeight: 1.58,
  lookAhead: 11.2,
  fovDegrees: 48
};

export class GameCamera {
  public readonly camera: THREE.PerspectiveCamera;
  private readonly rawAnchor = new THREE.Vector3();
  private readonly currentAnchor = new THREE.Vector3();
  private readonly currentLookAt = new THREE.Vector3();
  private readonly desiredCameraPosition = new THREE.Vector3();
  private readonly collisionPosition = new THREE.Vector3();
  private readonly motionLookAhead = new THREE.Vector3();
  private readonly vehicleMotionOffset = new THREE.Vector3();
  private currentMode: GameMode = "on-foot";
  private currentProfile: CameraProfile = ON_FOOT_PROFILE;
  private desiredYaw = Math.PI;
  private currentYaw = Math.PI;
  private desiredPitch = ON_FOOT_PROFILE.pitchRadians;
  private currentPitch = ON_FOOT_PROFILE.pitchRadians;
  private currentDistance = ON_FOOT_PROFILE.distance;
  private currentFocusHeight = ON_FOOT_PROFILE.focusHeight;
  private currentLookAhead = ON_FOOT_PROFILE.lookAhead;
  private zoomOffset = 0;
  private obstructionFraction = 1;
  private obstructionActive = false;
  private anchorInitialized = false;
  private landingOffsetY = 0;
  private vehicleMotionPhase = 0;
  private lastContactEvent: PlayerMotionSample["contactEvent"] = "none";
  private lastDiscontinuitySequence = -1;
  private fightTrauma = 0;
  private fightTraumaPhase = 0;
  private reducedMotion = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

  constructor(aspectRatio: number = 16 / 9) {
    this.camera = new THREE.PerspectiveCamera(ON_FOOT_PROFILE.fovDegrees, aspectRatio, 0.12, 900);
    this.camera.position.set(0, 7, -11.8);
    this.currentLookAt.set(0, 1.1, 2.2);
  }

  public setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
  }

  /**
   * Applies a deterministic, collision-independent framing used only by the
   * development art-direction captures. Gameplay always follows update().
   */
  public setFixedView(
    position: Readonly<{ x: number; y: number; z: number }>,
    target: Readonly<{ x: number; y: number; z: number }>,
    fovDegrees: number = ON_FOOT_PROFILE.fovDegrees
  ): void {
    this.camera.position.set(position.x, position.y, position.z);
    this.currentLookAt.set(target.x, target.y, target.z);
    this.camera.fov = fovDegrees;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.currentLookAt);
  }

  /**
   * Applies presentation input before fixed-step movement so WASD uses the
   * exact view basis the player sees in the same render frame.
   */
  public applyInput(mode: GameMode, input: Readonly<CameraInputIntent>): void {
    const isInterior = WorldLayout.isInterior(this.currentAnchor.x, this.currentAnchor.z);
    const profile = this.activateMode(mode, isInterior);
    const hasOrbitDelta = Math.abs(input.orbitDeltaX) > 0 || Math.abs(input.orbitDeltaY) > 0;

    if (hasOrbitDelta) {
      this.desiredYaw = wrapAngle(
        this.desiredYaw - input.orbitDeltaX * CAMERA_TUNING.horizontalOrbitRadiansPerPixel
      );
      this.desiredPitch = clamp(
        this.desiredPitch + input.orbitDeltaY * CAMERA_TUNING.verticalOrbitRadiansPerPixel,
        profile.minPitchRadians,
        profile.maxPitchRadians
      );

      // Drag-orbit should track the hand without a delayed tail. Damping is
      // reserved for authored profile transitions, target follow and zoom.
      this.currentYaw = this.desiredYaw;
      this.currentPitch = this.desiredPitch;
    }

    if (Math.abs(input.zoomDelta) > 0) {
      this.zoomOffset = clamp(
        this.zoomOffset + input.zoomDelta * CAMERA_TUNING.zoomMetersPerWheelPixel,
        profile.minDistance - profile.distance,
        profile.maxDistance - profile.distance
      );
    }
  }

  public update(
    targetPos: THREE.Vector3,
    mode: GameMode,
    deltaSeconds: number,
    input?: CameraInputIntent,
    collisionResolver?: CameraCollisionResolver,
    motionInput?: CameraMotionInput
  ): void {
    const dt = Math.min(0.1, Math.max(0, deltaSeconds));
    if (input) this.applyInput(mode, input);
    const isInterior = WorldLayout.isInterior(targetPos.x, targetPos.z);
    const profile = this.activateMode(mode, isInterior, motionInput?.fightReachMeters ?? 0);
    let framingDistance = profile.distance;
    if (mode === "sport-fishing" && motionInput?.lookHint) {
      const dx = motionInput.lookHint.x - targetPos.x;
      const dz = motionInput.lookHint.z - targetPos.z;
      const along = Math.abs(dx * Math.sin(this.desiredYaw) + dz * Math.cos(this.desiredYaw)) * 0.5;
      const across = Math.abs(dx * Math.cos(this.desiredYaw) - dz * Math.sin(this.desiredYaw)) * 0.5;
      const halfFov = THREE.MathUtils.degToRad(responsiveVerticalFov(profile.fovDegrees, this.camera.aspect)) * 0.5;
      const vertical = along * Math.sin(this.desiredPitch)
        + Math.abs(motionInput.lookHint.y - targetPos.y - profile.focusHeight) * Math.cos(this.desiredPitch) * 0.5 + 2;
      framingDistance = Math.max(profile.distance, Math.max(
        across / (Math.tan(halfFov) * Math.max(0.5, this.camera.aspect)),
        vertical / Math.tan(halfFov)
      ) + along * Math.cos(this.desiredPitch) + 3);
    }
    const targetDistance = clamp(framingDistance + this.zoomOffset,
      profile.minDistance, framingDistance + profile.maxDistance - profile.distance);

    if (this.reducedMotion) {
      this.currentYaw = this.desiredYaw;
      this.currentPitch = this.desiredPitch;
      this.currentDistance = targetDistance;
      this.currentFocusHeight = profile.focusHeight;
      this.currentLookAhead = profile.lookAhead;
    } else {
      this.currentYaw = dampAngle(this.currentYaw, this.desiredYaw, CAMERA_TUNING.rotationResponse, dt);
      this.currentPitch = damp(this.currentPitch, this.desiredPitch, CAMERA_TUNING.rotationResponse, dt);
      this.currentDistance = damp(this.currentDistance, targetDistance, CAMERA_TUNING.distanceResponse, dt);
      this.currentFocusHeight = damp(this.currentFocusHeight, profile.focusHeight, CAMERA_TUNING.profileResponse, dt);
      this.currentLookAhead = damp(this.currentLookAhead, profile.lookAhead, CAMERA_TUNING.profileResponse, dt);
    }

    const explicitDiscontinuity = this.updateMotionResponse(motionInput, mode, dt);
    this.rawAnchor.set(
      targetPos.x + this.vehicleMotionOffset.x,
      targetPos.y + this.currentFocusHeight + this.landingOffsetY + this.vehicleMotionOffset.y,
      targetPos.z + this.vehicleMotionOffset.z
    );
    const teleported = this.anchorInitialized &&
      this.currentAnchor.distanceToSquared(this.rawAnchor) > CAMERA_TUNING.teleportSnapDistanceMeters ** 2;
    if (!this.anchorInitialized || this.reducedMotion || teleported || explicitDiscontinuity) {
      this.currentAnchor.copy(this.rawAnchor);
      this.anchorInitialized = true;
      if (teleported || explicitDiscontinuity) this.obstructionFraction = 1;
    } else {
      const horizontalFollow = 1 - Math.exp(-CAMERA_TUNING.horizontalFollowResponse * dt);
      const verticalFollow = 1 - Math.exp(-CAMERA_TUNING.verticalFollowResponse * dt);
      this.currentAnchor.x = THREE.MathUtils.lerp(this.currentAnchor.x, this.rawAnchor.x, horizontalFollow);
      this.currentAnchor.z = THREE.MathUtils.lerp(this.currentAnchor.z, this.rawAnchor.z, horizontalFollow);
      this.currentAnchor.y = THREE.MathUtils.lerp(this.currentAnchor.y, this.rawAnchor.y, verticalFollow);
    }

    const lookDirectionX = -Math.sin(this.currentYaw);
    const lookDirectionZ = -Math.cos(this.currentYaw);
    this.currentLookAt.set(
      this.currentAnchor.x + lookDirectionX * this.currentLookAhead + this.motionLookAhead.x,
      this.currentAnchor.y,
      this.currentAnchor.z + lookDirectionZ * this.currentLookAhead + this.motionLookAhead.z
    );
    if (mode === "sport-fishing" && motionInput?.lookHint) {
      if (!this.fishingFocusActive || explicitDiscontinuity) this.fishingFocus.copy(this.currentLookAt);
      this.fishingFocusActive = true;
      const follow = this.reducedMotion ? 1 : 1 - Math.exp(-8 * dt);
      this.fishingFocus.x = THREE.MathUtils.lerp(this.fishingFocus.x, (this.currentAnchor.x + motionInput.lookHint.x) * 0.5, follow);
      this.fishingFocus.z = THREE.MathUtils.lerp(this.fishingFocus.z, (this.currentAnchor.z + motionInput.lookHint.z) * 0.5, follow);
      this.fishingFocus.y = THREE.MathUtils.lerp(this.fishingFocus.y, (this.currentAnchor.y + motionInput.lookHint.y) * 0.5, follow);
      this.currentLookAt.copy(this.fishingFocus);
    } else {
      this.fishingFocusActive = false;
    }
    const horizontalDistance = Math.cos(this.currentPitch) * this.currentDistance;
    this.desiredCameraPosition.set(
      this.currentLookAt.x + Math.sin(this.currentYaw) * horizontalDistance,
      this.currentLookAt.y + Math.sin(this.currentPitch) * this.currentDistance,
      this.currentLookAt.z + Math.cos(this.currentYaw) * horizontalDistance
    );
    const groundClearance = WorldLayout.isInterior(this.desiredCameraPosition.x, this.desiredCameraPosition.z)
      ? 0.17
      : WorldLayout.terrainHeight(this.desiredCameraPosition.x, this.desiredCameraPosition.z);
    this.desiredCameraPosition.y = Math.max(
      this.desiredCameraPosition.y,
      groundClearance + CAMERA_TUNING.terrainClearanceMeters
    );
    if (isInterior) {
      this.clampInteriorBoom();
    }

    let safeFraction = 1;
    let collisionHit = false;
    if (collisionResolver) {
      const collision = collisionResolver.resolveCameraPosition(
        this.currentAnchor,
        this.desiredCameraPosition,
        CAMERA_TUNING.collisionRadiusMeters
      );
      this.collisionPosition.set(
        collision.position.x,
        collision.position.y,
        collision.position.z
      );
      collisionHit = collision.obstructed;
      if (collisionHit) {
        const desiredBoomLength = this.currentAnchor.distanceTo(this.desiredCameraPosition);
        safeFraction = desiredBoomLength <= 0.0001
          ? 1
          : clamp(this.currentAnchor.distanceTo(this.collisionPosition) / desiredBoomLength, 0, 1);
      }
    }

    if (collisionHit) {
      // Pull inward immediately; delaying this transition would put the near
      // plane inside the obstacle. Outward recovery remains deliberately soft.
      this.obstructionFraction = Math.min(this.obstructionFraction, safeFraction);
    } else if (this.reducedMotion) {
      this.obstructionFraction = 1;
    } else {
      this.obstructionFraction = damp(
        this.obstructionFraction,
        1,
        CAMERA_TUNING.obstructionRecoveryResponse,
        dt
      );
      if (this.obstructionFraction > 0.9995) this.obstructionFraction = 1;
    }

    this.obstructionActive = collisionHit || this.obstructionFraction < 0.9995;
    this.camera.position.copy(this.currentAnchor).lerp(
      this.desiredCameraPosition,
      this.obstructionFraction
    );

    const tension = motionInput?.lineTension ?? 0;
    const snapTimer = motionInput?.snapTimerSeconds ?? 0;
    const danger = tension >= 94 || snapTimer > 0.2;
    const burstStarted = motionInput?.fightBehavior === "burst" && this.previousFightBehavior !== "burst";
    if (mode === "sport-fishing" && !this.reducedMotion
      && (burstStarted || (danger && !this.previousFightDanger))) this.fightTrauma = 0.18;
    if (mode !== "sport-fishing") this.fightTrauma = 0;
    this.previousFightBehavior = motionInput?.fightBehavior;
    this.previousFightDanger = danger;
    this.fightTrauma = Math.max(0, this.fightTrauma - 1.7 * dt);
    if (this.fightTrauma > 0.012 && !this.reducedMotion) {
      this.fightTraumaPhase += dt;
      const magnitude = this.fightTrauma * this.fightTrauma * 0.1;
      this.camera.position.x += Math.sin(this.fightTraumaPhase * 31.4) * magnitude;
      this.camera.position.y += Math.sin(this.fightTraumaPhase * 27.1) * magnitude * 0.42;
    } else if (this.reducedMotion) {
      this.fightTrauma = 0;
    }

    const targetFov = responsiveVerticalFov(profile.fovDegrees, this.camera.aspect);
    this.camera.fov = this.reducedMotion
      ? targetFov
      : damp(this.camera.fov, targetFov, CAMERA_TUNING.profileResponse, dt);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.currentLookAt);
  }

  /** Converts on-foot WASD intent into a horizontal world vector based on the current view. */
  public cameraRelativeMovement(
    local: Readonly<{ x: number; z: number }>,
    out: { x: number; z: number }
  ): { x: number; z: number } {
    const forwardX = -Math.sin(this.currentYaw);
    const forwardZ = -Math.cos(this.currentYaw);
    const rightX = -forwardZ;
    const rightZ = forwardX;
    out.x = rightX * local.x + forwardX * -local.z;
    out.z = rightZ * local.x + forwardZ * -local.z;
    const length = Math.hypot(out.x, out.z);
    if (length > 1) {
      out.x /= length;
      out.z /= length;
    }
    return out;
  }

  public handleResize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  public framingState(): Readonly<{
    yawRadians: number;
    pitchRadians: number;
    distance: number;
    resolvedDistance: number;
    obstructionFraction: number;
    obstructed: boolean;
    fovDegrees: number;
  }> {
    return {
      yawRadians: this.currentYaw,
      pitchRadians: this.currentPitch,
      distance: this.currentDistance,
      resolvedDistance: this.camera.position.distanceTo(this.currentAnchor),
      obstructionFraction: this.obstructionFraction,
      obstructed: this.obstructionActive,
      fovDegrees: this.camera.fov
    };
  }

  private updateMotionResponse(
    motionInput: CameraMotionInput | undefined,
    mode: GameMode,
    dt: number
  ): boolean {
    const sequence = motionInput?.discontinuitySequence;
    const hasNewDiscontinuity = sequence !== undefined && sequence !== this.lastDiscontinuitySequence;
    const explicitDiscontinuity = Boolean(
      hasNewDiscontinuity &&
      motionInput?.discontinuityReason &&
      motionInput.discontinuityReason !== "none"
    );
    if (sequence !== undefined) this.lastDiscontinuitySequence = sequence;

    if (this.reducedMotion || !motionInput) {
      this.motionLookAhead.set(0, 0, 0);
      this.vehicleMotionOffset.set(0, 0, 0);
      this.landingOffsetY = 0;
      this.lastContactEvent = motionInput?.player.contactEvent ?? "none";
      return explicitDiscontinuity;
    }

    const velocity = motionInput.player.velocity;
    let desiredLookAheadX = velocity.x * CANONICAL_RENDER_CONFIG.motion.cameraLookAheadSeconds;
    let desiredLookAheadZ = velocity.z * CANONICAL_RENDER_CONFIG.motion.cameraLookAheadSeconds;
    const desiredLength = Math.hypot(desiredLookAheadX, desiredLookAheadZ);
    const maximumLookAhead = CANONICAL_RENDER_CONFIG.motion.cameraLookAheadMaxMeters;
    if (desiredLength > maximumLookAhead && desiredLength > 0.0001) {
      const scale = maximumLookAhead / desiredLength;
      desiredLookAheadX *= scale;
      desiredLookAheadZ *= scale;
    }
    const lookAheadSmoothing = 1 - Math.exp(
      -CANONICAL_RENDER_CONFIG.motion.cameraLookAheadResponse * dt
    );
    this.motionLookAhead.x = THREE.MathUtils.lerp(
      this.motionLookAhead.x,
      desiredLookAheadX,
      lookAheadSmoothing
    );
    this.motionLookAhead.z = THREE.MathUtils.lerp(
      this.motionLookAhead.z,
      desiredLookAheadZ,
      lookAheadSmoothing
    );

    if (
      motionInput.player.contactEvent !== this.lastContactEvent &&
      motionInput.player.contactEvent === "land-hard"
    ) {
      this.landingOffsetY = -CANONICAL_RENDER_CONFIG.motion.cameraLandingImpulseMeters *
        motionInput.player.landingImpactStrength;
    }
    this.lastContactEvent = motionInput.player.contactEvent;
    this.landingOffsetY = damp(
      this.landingOffsetY,
      0,
      CANONICAL_RENDER_CONFIG.motion.cameraLandingResponse,
      dt
    );

    const boat = mode === "boat-driving" || mode === "basic-fishing" || mode === "sport-fishing"
      ? motionInput.boat
      : undefined;
    let desiredVehicleX = 0;
    let desiredVehicleY = 0;
    let desiredVehicleZ = 0;
    if (boat) {
      this.vehicleMotionPhase += dt * (2.1 + boat.roughnessResponse * 2.4);
      const rightX = Math.cos(this.currentYaw);
      const rightZ = -Math.sin(this.currentYaw);
      const lateral = THREE.MathUtils.clamp(
        boat.yawRateRadiansPerSecond,
        -2,
        2
      ) * CANONICAL_RENDER_CONFIG.motion.cameraBoatYawMeters;
      desiredVehicleX += rightX * lateral;
      desiredVehicleZ += rightZ * lateral;
      const horizontalSpeed = Math.hypot(boat.velocity.x, boat.velocity.z);
      if (horizontalSpeed > 0.05) {
        const boatForwardLead = CANONICAL_RENDER_CONFIG.motion.cameraBoatForwardLeadMeters;
        desiredLookAheadX += boat.velocity.x / horizontalSpeed * boatForwardLead;
        desiredLookAheadZ += boat.velocity.z / horizontalSpeed * boatForwardLead;
        const accelerationOffset = THREE.MathUtils.clamp(
          boat.accelerationMetersPerSecondSquared / 12,
          -1,
          1
        ) * CANONICAL_RENDER_CONFIG.motion.cameraBoatAccelerationMeters;
        desiredVehicleX -= boat.velocity.x / horizontalSpeed * accelerationOffset;
        desiredVehicleZ -= boat.velocity.z / horizontalSpeed * accelerationOffset;
      }
      desiredVehicleY = Math.sin(this.vehicleMotionPhase) * boat.roughnessResponse * 0.045;
    }
    const vehicleSmoothing = 1 - Math.exp(-8 * dt);
    this.vehicleMotionOffset.x = THREE.MathUtils.lerp(
      this.vehicleMotionOffset.x,
      desiredVehicleX,
      vehicleSmoothing
    );
    this.vehicleMotionOffset.y = THREE.MathUtils.lerp(
      this.vehicleMotionOffset.y,
      desiredVehicleY,
      vehicleSmoothing
    );
    this.vehicleMotionOffset.z = THREE.MathUtils.lerp(
      this.vehicleMotionOffset.z,
      desiredVehicleZ,
      vehicleSmoothing
    );

    if (explicitDiscontinuity) {
      this.motionLookAhead.set(0, 0, 0);
      this.vehicleMotionOffset.set(0, 0, 0);
      this.landingOffsetY = 0;
    }
    return explicitDiscontinuity;
  }

  private readonly fishingFocus = new THREE.Vector3();
  private fishingFocusActive = false;
  private previousFightBehavior: string | undefined;
  private previousFightDanger = false;

  private activateMode(mode: GameMode, isInterior = false, fightReachMeters = 0): CameraProfile {
    const activeMode = mode === "menu" || mode === "paused" ? this.currentMode : mode;
    let nextProfile = CAMERA_PROFILES[activeMode] ?? ON_FOOT_PROFILE;
    if (activeMode === "on-foot" && isInterior) {
      nextProfile = INTERIOR_CAMERA_PROFILE;
    }
    if (activeMode === "sport-fishing" && (fightReachMeters >= 38
      || (fightReachMeters === 0 && this.currentProfile === SPORT_TUNA_CAMERA_PROFILE))) {
      nextProfile = SPORT_TUNA_CAMERA_PROFILE;
    }
    if (activeMode === this.currentMode && nextProfile === this.currentProfile) return nextProfile;

    const previousProfile = this.currentProfile;
    const zoomRatio = normalizedZoomOffset(previousProfile, this.zoomOffset);
    this.desiredPitch = clamp(
      this.desiredPitch + nextProfile.pitchRadians - previousProfile.pitchRadians,
      nextProfile.minPitchRadians,
      nextProfile.maxPitchRadians
    );
    this.zoomOffset = zoomOffsetFromRatio(nextProfile, zoomRatio);
    this.currentMode = activeMode;
    this.currentProfile = nextProfile;
    return nextProfile;
  }

  private clampInteriorBoom(): void {
    const bounds = FARMHOUSE_INTERIOR_BOUNDS;
    const maxY = bounds.ceilingY - 0.28;
    const minY = bounds.floorY + 0.32;
    if (this.desiredCameraPosition.y > maxY) {
      const sinPitch = Math.sin(this.currentPitch);
      if (sinPitch > 0.04) {
        const maxDistance = Math.max(0.8, (maxY - this.currentLookAt.y) / sinPitch);
        const desiredLength = this.currentAnchor.distanceTo(this.desiredCameraPosition);
        const t = Math.min(1, maxDistance / Math.max(0.001, desiredLength));
        this.desiredCameraPosition.lerpVectors(this.currentLookAt, this.desiredCameraPosition, t);
      }
      this.desiredCameraPosition.y = Math.min(this.desiredCameraPosition.y, maxY);
    }
    this.desiredCameraPosition.y = clamp(this.desiredCameraPosition.y, minY, maxY);
    this.desiredCameraPosition.x = clamp(this.desiredCameraPosition.x, bounds.minX + 0.45, bounds.maxX - 0.45);
    this.desiredCameraPosition.z = clamp(this.desiredCameraPosition.z, bounds.minZ + 0.45, bounds.maxZ - 0.45);
  }
}

function damp(current: number, target: number, response: number, dt: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-response * dt));
}

function dampAngle(current: number, target: number, response: number, dt: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return wrapAngle(current + difference * (1 - Math.exp(-response * dt)));
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function normalizedZoomOffset(profile: CameraProfile, offset: number): number {
  if (offset >= 0) {
    return offset / Math.max(0.0001, profile.maxDistance - profile.distance);
  }
  return offset / Math.max(0.0001, profile.distance - profile.minDistance);
}

function zoomOffsetFromRatio(profile: CameraProfile, ratio: number): number {
  const clampedRatio = clamp(ratio, -1, 1);
  return clampedRatio >= 0
    ? clampedRatio * (profile.maxDistance - profile.distance)
    : clampedRatio * (profile.distance - profile.minDistance);
}

function responsiveVerticalFov(baseDegrees: number, aspectRatio: number): number {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0 || aspectRatio >= REFERENCE_ASPECT_RATIO) {
    return baseDegrees;
  }
  const baseRadians = degrees(baseDegrees);
  const maintainedHorizontalFov = 2 * Math.atan(
    Math.tan(baseRadians / 2) * REFERENCE_ASPECT_RATIO / aspectRatio
  );
  return clamp(
    THREE.MathUtils.radToDeg(maintainedHorizontalFov),
    baseDegrees,
    baseDegrees + CAMERA_TUNING.maximumNarrowAspectFovIncreaseDegrees
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
