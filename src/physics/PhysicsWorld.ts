import type RAPIER from "@dimforge/rapier3d-compat";
import { ContentRegistry } from "../content/ContentRegistry";
import { boatAssetId } from "../render/assets/AssetCatalog";
import { WaterSurface } from "../render/water/WaterSurface";
import type { GameMode, GameState } from "../simulation/core/types";
import type {
  PhysicsAdapter,
  PhysicsIntent,
  PhysicsStepResult,
  PlayerMotionSample,
  ResolvedPhysicsFrame
} from "../simulation/core/PhysicsAdapter";
import {
  advancePlayerTraversal,
  PLAYER_TRAVERSAL_TUNING
} from "../simulation/navigation/PlayerTraversal";
import type { StaticCollisionProxy } from "./StaticCollision";
import { collisionPrimitivesForAsset } from "./CollisionCatalogAdapter";
import { FARMHOUSE_INTERIOR_BOUNDS } from "../world/FarmhouseInterior";
import {
  TERRAIN_RESOLUTION,
  TERRAIN_SIZE_METERS,
  WorldLayout
} from "../world/WorldLayout";

interface BoatPhysicsBody {
  body: RAPIER.RigidBody;
  colliders: RAPIER.Collider[];
  collisionCenters: Array<{ x: number; y: number; z: number }>;
  collisionYawRadians: number[];
  headingRadians: number;
  speed: number;
}

const CHARACTER_CONTROLLER_OFFSET_METERS = 0.035;
const PLAYER_CAPSULE_HALF_HEIGHT_METERS = 0.58;
const PLAYER_CAPSULE_RADIUS_METERS = 0.34;
const PLAYER_POSE_GROUND_OFFSET_METERS = 0.5;
const PLAYER_COLLIDER_CENTER_FROM_POSE_METERS =
  PLAYER_CAPSULE_HALF_HEIGHT_METERS +
  PLAYER_CAPSULE_RADIUS_METERS -
  PLAYER_POSE_GROUND_OFFSET_METERS;

function normalizeAngle(radians: number): number {
  return Math.atan2(Math.sin(radians), Math.cos(radians));
}

function steerVelocityToward(
  currentX: number,
  currentZ: number,
  targetX: number,
  targetZ: number,
  maxDelta: number
): { x: number; z: number } {
  const deltaX = targetX - currentX;
  const deltaZ = targetZ - currentZ;
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance <= maxDelta || distance <= 0.000001 || !Number.isFinite(maxDelta) || maxDelta <= 0) {
    return { x: targetX, z: targetZ };
  }
  const scale = maxDelta / distance;
  return { x: currentX + deltaX * scale, z: currentZ + deltaZ * scale };
}

function dampAngle(current: number, target: number, response: number, dt: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return normalizeAngle(current + difference * (1 - Math.exp(-response * dt)));
}

function resolveWalkableSlide(
  currentX: number,
  currentZ: number,
  moveX: number,
  moveZ: number
): { x: number; z: number; limited: boolean } {
  const isStableWalkable = (x: number, z: number): boolean =>
    WorldLayout.isWalkable(x, z) &&
    !WorldLayout.isWater(x, z) &&
    (WorldLayout.isBridgeDeck(x, z) || WorldLayout.waterSignedDistance(x, z) <= -0.01);

  if (isStableWalkable(currentX + moveX, currentZ + moveZ)) {
    return { x: moveX, z: moveZ, limited: false };
  }

  // Compute coastline/waterway tangent slide candidate
  const sampleDist = 0.25;
  const dX =
    WorldLayout.waterSignedDistance(currentX + sampleDist, currentZ) -
    WorldLayout.waterSignedDistance(currentX - sampleDist, currentZ);
  const dZ =
    WorldLayout.waterSignedDistance(currentX, currentZ + sampleDist) -
    WorldLayout.waterSignedDistance(currentX, currentZ - sampleDist);
  const gradLen = Math.hypot(dX, dZ);
  let tangentSlideX = 0;
  let tangentSlideZ = 0;
  if (gradLen > 0.0001) {
    const normalX = dX / gradLen;
    const normalZ = dZ / gradLen;
    const tangentX = -normalZ;
    const tangentZ = normalX;
    const dot = moveX * tangentX + moveZ * tangentZ;
    tangentSlideX = tangentX * dot;
    tangentSlideZ = tangentZ * dot;
  }

  const candidates = [
    { x: tangentSlideX, z: tangentSlideZ },
    { x: tangentSlideX * 0.7, z: tangentSlideZ * 0.7 },
    { x: moveX, z: 0 },
    { x: 0, z: moveZ },
    { x: moveX * 0.7, z: moveZ * 0.7 },
    { x: moveX * 0.5, z: 0 },
    { x: 0, z: moveZ * 0.5 },
    { x: moveX * 0.25, z: moveZ * 0.25 }
  ];
  let best = { x: 0, z: 0, distanceSquared: 0 };
  for (const candidate of candidates) {
    if (Math.hypot(candidate.x, candidate.z) <= 0.000001) continue;
    if (!isStableWalkable(currentX + candidate.x, currentZ + candidate.z)) continue;
    const distanceSquared = candidate.x * candidate.x + candidate.z * candidate.z;
    if (distanceSquared > best.distanceSquared) best = { ...candidate, distanceSquared };
  }
  return { x: best.x, z: best.z, limited: true };
}

export class PhysicsWorld implements PhysicsAdapter {
  private readonly rapier: typeof RAPIER;
  private readonly world: RAPIER.World;
  private readonly playerBody: RAPIER.RigidBody;
  private readonly playerCollider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly boatBodies = new Map<string, BoatPhysicsBody>();
  private readonly cameraSweepBallCache = new Map<number, RAPIER.Ball>();
  private playerVelocityX = 0;
  private playerVelocityZ = 0;
  private playerVerticalVelocity = 0;
  private playerRotationY = 0;
  private playerGrounded = true;
  private jumpBufferRemainingSeconds = 0;
  private coyoteTimeRemainingSeconds: number = PLAYER_TRAVERSAL_TUNING.coyoteTimeSeconds;

  private constructor(rapier: typeof RAPIER, staticCollision: readonly StaticCollisionProxy[]) {
    this.rapier = rapier;
    this.world = new rapier.World({ x: 0, y: -18, z: 0 });
    this.world.integrationParameters.dt = 1 / 60;
    this.playerBody = this.world.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased().setCanSleep(false)
    );
    this.playerCollider = this.world.createCollider(
      rapier.ColliderDesc.capsule(
        PLAYER_CAPSULE_HALF_HEIGHT_METERS,
        PLAYER_CAPSULE_RADIUS_METERS
      ).setFriction(0),
      this.playerBody
    );
    this.controller = this.world.createCharacterController(CHARACTER_CONTROLLER_OFFSET_METERS);
    this.controller.setApplyImpulsesToDynamicBodies(false);
    this.controller.setMaxSlopeClimbAngle((38 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((46 * Math.PI) / 180);
    this.controller.enableAutostep(0.42, 0.24, true);
    this.controller.enableSnapToGround(0.28);

    const terrain = rapier.ColliderDesc.heightfield(
      TERRAIN_RESOLUTION,
      TERRAIN_RESOLUTION,
      WorldLayout.terrainHeightfield(),
      new rapier.Vector3(TERRAIN_SIZE_METERS, 1, TERRAIN_SIZE_METERS)
    ).setFriction(0.86);
    this.world.createCollider(terrain);
    for (const proxy of staticCollision) {
      const centerX = Number.isFinite(proxy.center.x) ? proxy.center.x : 0;
      const centerY = Number.isFinite(proxy.center.y) ? proxy.center.y : 0;
      const centerZ = Number.isFinite(proxy.center.z) ? proxy.center.z : 0;
      const hx = Math.max(0.02, Number.isFinite(proxy.halfExtents.x) ? proxy.halfExtents.x : 0.1);
      const hy = Math.max(0.02, Number.isFinite(proxy.halfExtents.y) ? proxy.halfExtents.y : 0.1);
      const hz = Math.max(0.02, Number.isFinite(proxy.halfExtents.z) ? proxy.halfExtents.z : 0.1);
      const body = this.world.createRigidBody(
        rapier.RigidBodyDesc.fixed()
          .setTranslation(centerX, centerY, centerZ)
          .setRotation(proxy.rotation)
      );
      this.world.createCollider(
        rapier.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.9),
        body
      );
    }
    this.world.updateSceneQueries();
  }

  public static async create(staticCollision: readonly StaticCollisionProxy[] = []): Promise<PhysicsWorld> {
    const { default: rapier } = await import("@dimforge/rapier3d-compat");
    await rapier.init();
    return new PhysicsWorld(rapier, staticCollision);
  }

  public dispose(): void {
    for (const boat of this.boatBodies.values()) {
      for (const collider of boat.colliders) {
        this.world.removeCollider(collider, false);
      }
      this.world.removeRigidBody(boat.body);
    }
    this.boatBodies.clear();
    this.cameraSweepBallCache.clear();
    this.world.free();
  }

  private ensureBoat(
    id: string,
    boatTypeId: string,
    x: number,
    y: number,
    z: number,
    headingRadians: number,
    speed: number
  ): BoatPhysicsBody {
    const existing = this.boatBodies.get(id);
    if (existing) return existing;
    const assetId = boatAssetId(boatTypeId);
    const primitives = collisionPrimitivesForAsset(assetId);
    const normHeading = normalizeAngle(headingRadians);
    const rotation = {
      x: 0,
      y: Math.sin(normHeading / 2),
      z: 0,
      w: Math.cos(normHeading / 2)
    };
    const body = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(x, y, z)
        .setRotation(rotation)
        .setCanSleep(false)
    );
    const colliders = primitives.map((primitive) => {
      const yawRadians = ((primitive.yawDegrees ?? 0) * Math.PI) / 180;
      return this.world.createCollider(
        this.rapier.ColliderDesc.cuboid(...primitive.halfExtents)
          .setTranslation(...primitive.center)
          .setRotation({
            x: 0,
            y: Math.sin(yawRadians / 2),
            z: 0,
            w: Math.cos(yawRadians / 2)
          })
          .setFriction(0.15),
        body
      );
    });
    const created = {
      body,
      colliders,
      collisionCenters: primitives.map((primitive) => ({
        x: primitive.center[0],
        y: primitive.center[1],
        z: primitive.center[2]
      })),
      collisionYawRadians: primitives.map((primitive) => ((primitive.yawDegrees ?? 0) * Math.PI) / 180),
      headingRadians: normHeading,
      speed: Number.isFinite(speed) ? speed : 0
    };
    this.boatBodies.set(id, created);
    return created;
  }

  private castBoat(
    physics: BoatPhysicsBody,
    x: number,
    y: number,
    z: number,
    headingRadians: number,
    deltaX: number,
    deltaZ: number
  ): number | null {
    let earliest: number | null = null;
    const sinHeading = Math.sin(headingRadians);
    const cosHeading = Math.cos(headingRadians);
    for (let index = 0; index < physics.colliders.length; index++) {
      const localCenter = physics.collisionCenters[index];
      const colliderYaw = headingRadians + physics.collisionYawRadians[index];
      const hit = this.world.castShape(
        {
          x: x + localCenter.x * cosHeading + localCenter.z * sinHeading,
          y: y + localCenter.y,
          z: z - localCenter.x * sinHeading + localCenter.z * cosHeading
        },
        {
          x: 0,
          y: Math.sin(colliderYaw / 2),
          z: 0,
          w: Math.cos(colliderYaw / 2)
        },
        { x: deltaX, y: 0, z: deltaZ },
        physics.colliders[index].shape,
        0.04,
        1,
        true,
        undefined,
        undefined,
        undefined,
        physics.body
      );
      if (hit && (earliest === null || hit.time_of_impact < earliest)) {
        earliest = hit.time_of_impact;
      }
    }
    return earliest;
  }

  private resolvePlayer(
    state: Readonly<GameState>,
    input: PhysicsIntent,
    dt: number
  ): { player: ResolvedPhysicsFrame["player"]; motion: PlayerMotionSample } {
    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(0.2, dt) : 1 / 60;
    const player = state.player;
    const isInterior = WorldLayout.isInterior(player.x, player.z);
    const groundHeight = isInterior
      ? FARMHOUSE_INTERIOR_BOUNDS.floorY - PLAYER_POSE_GROUND_OFFSET_METERS
      : WorldLayout.terrainHeight(player.x, player.z);
    const footAnchorY = Math.max(player.y, groundHeight + PLAYER_POSE_GROUND_OFFSET_METERS);
    const expectedCenter = {
      x: player.x,
      y: footAnchorY + PLAYER_COLLIDER_CENTER_FROM_POSE_METERS,
      z: player.z
    };
    const bodyPosition = this.playerBody.translation();
    if (
      Math.hypot(
        bodyPosition.x - expectedCenter.x,
        bodyPosition.y - expectedCenter.y,
        bodyPosition.z - expectedCenter.z
      ) > 0.08
    ) {
      this.playerBody.setTranslation(expectedCenter, true);
      this.playerVelocityX = 0;
      this.playerVelocityZ = 0;
      this.playerVerticalVelocity = 0;
      this.playerRotationY = player.rotationY;
      this.playerGrounded =
        player.traversal.isGrounded === true ||
        Math.abs(footAnchorY - (groundHeight + PLAYER_POSE_GROUND_OFFSET_METERS)) <= 0.08;
      this.jumpBufferRemainingSeconds = 0;
      this.coyoteTimeRemainingSeconds = this.playerGrounded
        ? PLAYER_TRAVERSAL_TUNING.coyoteTimeSeconds
        : 0;
    }

    const rawInputX = Number.isFinite(input.x) ? input.x : 0;
    const rawInputZ = Number.isFinite(input.z) ? input.z : 0;
    const inputLength = Math.hypot(rawInputX, rawInputZ);
    const inputX = inputLength > 1 ? rawInputX / inputLength : rawInputX;
    const inputZ = inputLength > 1 ? rawInputZ / inputLength : rawInputZ;
    const traversalStep = advancePlayerTraversal(
      player.traversal,
      { wantsSprint: input.sprint, isMoving: inputLength > 0.001 },
      safeDt
    );
    const speed = traversalStep.isSprinting
      ? PLAYER_TRAVERSAL_TUNING.sprintSpeedMetersPerSecond
      : PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond;
    const targetVelocityX = inputX * speed;
    const targetVelocityZ = inputZ * speed;
    const acceleration = inputLength > 0.001
      ? PLAYER_TRAVERSAL_TUNING.accelerationMetersPerSecondSquared
      : PLAYER_TRAVERSAL_TUNING.decelerationMetersPerSecondSquared;
    const previousVelocityX = this.playerVelocityX;
    const previousVelocityZ = this.playerVelocityZ;
    const previousRotationY = this.playerRotationY;
    const steeredVelocity = steerVelocityToward(
      this.playerVelocityX,
      this.playerVelocityZ,
      targetVelocityX,
      targetVelocityZ,
      acceleration * safeDt
    );
    this.playerVelocityX = steeredVelocity.x;
    this.playerVelocityZ = steeredVelocity.z;

    const current = this.playerBody.translation();
    let moveX = this.playerVelocityX * safeDt;
    let moveZ = this.playerVelocityZ * safeDt;
    const requestedMoveDistance = Math.hypot(moveX, moveZ);
    let walkabilityLimited = false;
    const requestedWalkableMove = resolveWalkableSlide(current.x, current.z, moveX, moveZ);
    moveX = requestedWalkableMove.x;
    moveZ = requestedWalkableMove.z;
    walkabilityLimited = requestedWalkableMove.limited;

    if (input.jumpRequested) {
      this.jumpBufferRemainingSeconds = PLAYER_TRAVERSAL_TUNING.jumpBufferSeconds;
    } else {
      this.jumpBufferRemainingSeconds = Math.max(0, this.jumpBufferRemainingSeconds - safeDt);
    }
    if (this.playerGrounded) {
      this.coyoteTimeRemainingSeconds = PLAYER_TRAVERSAL_TUNING.coyoteTimeSeconds;
    } else {
      this.coyoteTimeRemainingSeconds = Math.max(0, this.coyoteTimeRemainingSeconds - safeDt);
    }

    if (this.jumpBufferRemainingSeconds > 0 && this.coyoteTimeRemainingSeconds > 0) {
      this.playerVerticalVelocity = PLAYER_TRAVERSAL_TUNING.jumpSpeedMetersPerSecond;
      this.playerGrounded = false;
      this.jumpBufferRemainingSeconds = 0;
      this.coyoteTimeRemainingSeconds = 0;
    } else {
      this.playerVerticalVelocity = Math.max(
        -PLAYER_TRAVERSAL_TUNING.terminalFallSpeedMetersPerSecond,
        this.playerVerticalVelocity - PLAYER_TRAVERSAL_TUNING.gravityMetersPerSecondSquared * safeDt
      );
    }
    this.controller.computeColliderMovement(this.playerCollider, {
      x: moveX,
      y: this.playerVerticalVelocity * safeDt,
      z: moveZ
    });
    const computedMovement = this.controller.computedMovement();
    const movement = {
      x: computedMovement.x,
      y: computedMovement.y,
      z: computedMovement.z
    };
    const resolvedWalkableMove = resolveWalkableSlide(current.x, current.z, movement.x, movement.z);
    movement.x = resolvedWalkableMove.x;
    movement.z = resolvedWalkableMove.z;
    walkabilityLimited ||= resolvedWalkableMove.limited;
    const horizontalMovement = Math.hypot(movement.x, movement.z);
    const horizontalLimit = speed * safeDt;
    if (horizontalMovement > horizontalLimit && horizontalMovement > 0.000001) {
      const scale = horizontalLimit / horizontalMovement;
      movement.x *= scale;
      movement.z *= scale;
    }
    let hitBlockingSurface = false;
    for (let index = 0; index < this.controller.numComputedCollisions(); index++) {
      const collision = this.controller.computedCollision(index);
      if (collision && Math.abs(collision.normal1.y) < 0.65) {
        hitBlockingSurface = true;
        break;
      }
    }

    // Ceiling bonk detection: zero vertical velocity when upward movement is blocked
    if (this.playerVerticalVelocity > 0 && movement.y < this.playerVerticalVelocity * safeDt * 0.4) {
      this.playerVerticalVelocity = 0;
    }

    this.playerGrounded = this.controller.computedGrounded();
    if (this.playerGrounded && this.playerVerticalVelocity < 0) {
      this.playerVerticalVelocity = -0.25;
    }
    this.playerBody.setTranslation(
      { x: current.x + movement.x, y: current.y + movement.y, z: current.z + movement.z },
      true
    );

    // Rapier owns collision resolution. Feeding its actual displacement back
    // into the transient velocity prevents pressure and footsteps at walls.
    const resolvedVelocityX = movement.x / safeDt;
    const resolvedVelocityZ = movement.z / safeDt;
    if (walkabilityLimited || hitBlockingSurface) {
      this.playerVelocityX = resolvedVelocityX;
      this.playerVelocityZ = resolvedVelocityZ;
    }

    if (inputLength > 0.001) {
      this.playerRotationY = dampAngle(
        Number.isFinite(this.playerRotationY) ? this.playerRotationY : player.rotationY,
        Math.atan2(inputX, inputZ),
        16,
        safeDt
      );
    } else {
      this.playerRotationY = player.rotationY;
    }
    const resolved = this.playerBody.translation();
    const resolvedSpeed = Math.hypot(resolvedVelocityX, resolvedVelocityZ);
    const resolvedMoveDistance = Math.hypot(movement.x, movement.z);
    const collisionBlocked = requestedMoveDistance > 0.0001 &&
      resolvedMoveDistance + 0.0001 < requestedMoveDistance * 0.25;

    const isResolvedInterior = WorldLayout.isInterior(resolved.x, resolved.z);
    const groundY = isResolvedInterior
      ? FARMHOUSE_INTERIOR_BOUNDS.floorY - PLAYER_POSE_GROUND_OFFSET_METERS
      : WorldLayout.terrainHeight(resolved.x, resolved.z);

    const playerPose = {
      x: resolved.x,
      // Rapier keeps a small collision skin; the canonical/visual foot anchor remains on the terrain or floor.
      y: Math.max(
        groundY + PLAYER_POSE_GROUND_OFFSET_METERS,
        resolved.y - PLAYER_COLLIDER_CENTER_FROM_POSE_METERS - CHARACTER_CONTROLLER_OFFSET_METERS
      ),
      z: resolved.z,
      rotationY: this.playerRotationY,
      traversal: {
        ...traversalStep.traversal,
        isGrounded: this.playerGrounded
      }
    };
    return {
      player: playerPose,
      motion: {
        velocity: {
          x: resolvedVelocityX,
          y: movement.y / safeDt,
          z: resolvedVelocityZ
        },
        speedMetersPerSecond: resolvedSpeed,
        accelerationMetersPerSecondSquared: Math.hypot(
          resolvedVelocityX - previousVelocityX,
          resolvedVelocityZ - previousVelocityZ
        ) / safeDt,
        turnRateRadiansPerSecond: Math.atan2(
          Math.sin(this.playerRotationY - previousRotationY),
          Math.cos(this.playerRotationY - previousRotationY)
        ) / safeDt,
        isGrounded: this.playerGrounded,
        isCollisionBlocked: collisionBlocked,
        requestedGait: inputLength <= 0.001
          ? "idle"
          : traversalStep.isSprinting
            ? "run"
            : "walk"
      }
    };
  }

  private resolveBoat(
    state: Readonly<GameState>,
    id: string,
    input: { x: number; z: number },
    mode: GameMode,
    dt: number,
    timeSeconds: number
  ): ResolvedPhysicsFrame["boats"][string] {
    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(0.2, dt) : 1 / 60;
    const rawInputX = Number.isFinite(input.x) ? input.x : 0;
    const rawInputZ = Number.isFinite(input.z) ? input.z : 0;
    const boat = state.boats[id];
    const definition = ContentRegistry.boats.get(boat.boatTypeId);
    const waterConditions = {
      seaRoughness: state.weather.seaRoughness,
      windDirectionDeg: state.weather.windDirectionDeg,
      windSpeed: state.weather.windSpeed
    };
    const water = WaterSurface.sample(boat.x, boat.z, timeSeconds, waterConditions);
    const physics = this.ensureBoat(
      id,
      boat.boatTypeId,
      boat.x,
      water.height,
      boat.z,
      boat.headingRadians,
      boat.speed
    );
    const bodyPosition = physics.body.translation();
    if (Math.hypot(bodyPosition.x - boat.x, bodyPosition.z - boat.z) > 1.5) {
      physics.headingRadians = boat.headingRadians;
      physics.speed = boat.speed;
    }

    const active = mode === "boat-driving" && state.player.activeBoatId === id && definition;
    if (active && definition) {
      const throttle = clamp(-rawInputZ, -1, 1);
      const roughnessPenalty = clamp01(
        (state.weather.seaRoughness - definition.safeSeaRoughness) / Math.max(0.1, 1 - definition.safeSeaRoughness)
      );
      const control = 1 - roughnessPenalty * 0.38;
      const targetSpeed = throttle * definition.maxSpeed * control;
      const accelerationRate = throttle === 0 ? definition.acceleration * 1.35 : definition.acceleration;
      physics.speed += (targetSpeed - physics.speed) * (1 - Math.exp(-accelerationRate * safeDt));
      if (Math.abs(physics.speed) < 0.015 && throttle === 0) physics.speed = 0;
      const steeringAuthority = 0.3 + 0.7 * clamp01(Math.abs(physics.speed) / definition.maxSpeed);
      const reverseSign = physics.speed < -0.01 || (throttle < 0 && physics.speed <= 0.05) ? -1 : 1;
      physics.headingRadians +=
        rawInputX * definition.turningRate * steeringAuthority * control * reverseSign * safeDt;
      physics.headingRadians = normalizeAngle(physics.headingRadians);
    } else {
      physics.speed += (boat.speed - physics.speed) * (1 - Math.exp(-8 * safeDt));
      physics.headingRadians = dampAngle(physics.headingRadians, boat.headingRadians, 10, safeDt);
    }

    const deltaX = Math.sin(physics.headingRadians) * physics.speed * safeDt;
    const deltaZ = Math.cos(physics.headingRadians) * physics.speed * safeDt;
    let nextX = boat.x + deltaX;
    let nextZ = boat.z + deltaZ;
    const rotation = {
      x: 0,
      y: Math.sin(physics.headingRadians / 2),
      z: 0,
      w: Math.cos(physics.headingRadians / 2)
    };

    this.world.updateSceneQueries();
    const isDesiredSailable = WorldLayout.isSailable(nextX, nextZ);
    let hitTime: number | null = null;
    if (Math.hypot(deltaX, deltaZ) > 0.00001) {
      hitTime = this.castBoat(
        physics,
        boat.x,
        water.height,
        boat.z,
        physics.headingRadians,
        deltaX,
        deltaZ
      );
    }

    if (isDesiredSailable && hitTime === null) {
      // Unobstructed sailable trajectory
    } else if (Math.hypot(deltaX, deltaZ) > 0.00001) {
      const travel = hitTime !== null ? Math.max(0, hitTime - 0.025) : 0;
      const contactX = boat.x + deltaX * travel;
      const contactZ = boat.z + deltaZ * travel;
      const remainingX = deltaX * (1 - travel);
      const remainingZ = deltaZ * (1 - travel);

      // Tangent sliding along coastline / riverbank normal in sailable water
      const sampleDist = 0.5;
      const dX =
        WorldLayout.waterSignedDistance(contactX + sampleDist, contactZ) -
        WorldLayout.waterSignedDistance(contactX - sampleDist, contactZ);
      const dZ =
        WorldLayout.waterSignedDistance(contactX, contactZ + sampleDist) -
        WorldLayout.waterSignedDistance(contactX, contactZ - sampleDist);
      const len = Math.hypot(dX, dZ);
      let shoreTangentX = 0;
      let shoreTangentZ = 0;
      if (len > 0.0001) {
        const normalX = dX / len;
        const normalZ = dZ / len;
        const tangentX = -normalZ;
        const tangentZ = normalX;
        const dot = remainingX * tangentX + remainingZ * tangentZ;
        shoreTangentX = tangentX * dot;
        shoreTangentZ = tangentZ * dot;
      }

      const axisCandidates = [
        { x: shoreTangentX, z: shoreTangentZ },
        { x: remainingX, z: 0 },
        { x: 0, z: remainingZ },
        { x: remainingX * 0.5, z: 0 },
        { x: 0, z: remainingZ * 0.5 }
      ];
      let bestSlide = { x: 0, z: 0, distanceSquared: 0 };
      for (const candidate of axisCandidates) {
        if (
          Math.hypot(candidate.x, candidate.z) <= 0.00001 ||
          !WorldLayout.isSailable(contactX + candidate.x, contactZ + candidate.z)
        ) continue;
        const slideHitTime = this.castBoat(
          physics,
          contactX,
          water.height,
          contactZ,
          physics.headingRadians,
          candidate.x,
          candidate.z
        );
        const fraction = slideHitTime === null ? 1 : Math.max(0, slideHitTime - 0.025);
        const slideX = candidate.x * fraction;
        const slideZ = candidate.z * fraction;
        const distanceSquared = slideX * slideX + slideZ * slideZ;
        if (distanceSquared > bestSlide.distanceSquared) {
          bestSlide = { x: slideX, z: slideZ, distanceSquared };
        }
      }
      nextX = contactX + bestSlide.x;
      nextZ = contactZ + bestSlide.z;
      physics.speed *= bestSlide.distanceSquared > 0.00001 ? 0.72 : 0.28;
    } else {
      nextX = boat.x;
      nextZ = boat.z;
      physics.speed = 0;
    }

    if (!WorldLayout.isSailable(nextX, nextZ)) {
      nextX = boat.x;
      nextZ = boat.z;
      physics.speed *= 0.28;
    }

    const nextWater = WaterSurface.sample(nextX, nextZ, timeSeconds, waterConditions);
    physics.body.setTranslation({ x: nextX, y: nextWater.height, z: nextZ }, true);
    physics.body.setRotation(rotation, true);
    return {
      x: nextX,
      // Wave height is transient physics/presentation state. Persist the
      // canonical waterline so save/load never depends on wall-clock time.
      y: boat.y,
      z: nextZ,
      headingRadians: physics.headingRadians,
      speed: physics.speed
    };
  }

  /**
   * Sweeps a small sphere from the camera focus toward its desired position.
   * Dynamic player/boat bodies are presentation targets, not camera obstacles.
   */
  public resolveCameraPosition(
    focus: { x: number; y: number; z: number },
    desired: { x: number; y: number; z: number },
    radius: number = 0.32
  ): { position: { x: number; y: number; z: number }; obstructed: boolean } {
    const displacement = {
      x: desired.x - focus.x,
      y: desired.y - focus.y,
      z: desired.z - focus.z
    };
    const distance = Math.hypot(displacement.x, displacement.y, displacement.z);
    if (distance <= 0.001) {
      return { position: { ...desired }, obstructed: false };
    }

    let sweepBall = this.cameraSweepBallCache.get(radius);
    if (!sweepBall) {
      sweepBall = new this.rapier.Ball(radius);
      this.cameraSweepBallCache.set(radius, sweepBall);
    }

    this.world.updateSceneQueries();
    const hit = this.world.castShape(
      focus,
      { x: 0, y: 0, z: 0, w: 1 },
      displacement,
      sweepBall,
      0.03,
      1,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      (collider) => {
        if (collider === this.playerCollider) return false;
        for (const boat of this.boatBodies.values()) {
          if (boat.colliders.includes(collider)) return false;
        }
        return true;
      }
    );
    if (!hit) return { position: { ...desired }, obstructed: false };

    const safetyFraction = 0.08 / distance;
    const fraction = Math.max(0, hit.time_of_impact - safetyFraction);
    return {
      position: {
        x: focus.x + displacement.x * fraction,
        y: focus.y + displacement.y * fraction,
        z: focus.z + displacement.z * fraction
      },
      obstructed: true
    };
  }

  public hasLineOfSight(
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
    endpointPadding: number = 0.38
  ): boolean {
    const direction = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
    const distance = Math.hypot(direction.x, direction.y, direction.z);
    if (distance <= endpointPadding) return true;
    direction.x /= distance;
    direction.y /= distance;
    direction.z /= distance;
    this.world.updateSceneQueries();
    const hit = this.world.castRay(
      new this.rapier.Ray(from, direction),
      distance - endpointPadding,
      true,
      undefined,
      undefined,
      this.playerCollider,
      undefined,
      (collider) => {
        for (const boat of this.boatBodies.values()) {
          if (boat.colliders.includes(collider)) return false;
        }
        return true;
      }
    );
    return hit === null;
  }

  public step(
    state: Readonly<GameState>,
    input: PhysicsIntent,
    mode: GameMode,
    dt: number,
    timeSeconds: number
  ): PhysicsStepResult {
    // Clean up any stale boat bodies that were removed from state
    for (const [id, boat] of this.boatBodies) {
      if (!state.boats[id]) {
        for (const collider of boat.colliders) {
          this.world.removeCollider(collider, false);
        }
        this.world.removeRigidBody(boat.body);
        this.boatBodies.delete(id);
      }
    }

    const boats: ResolvedPhysicsFrame["boats"] = {};
    for (const id of Object.keys(state.boats)) {
      boats[id] = this.resolveBoat(state, id, input, mode, dt, timeSeconds);
    }

    let player = {
      x: state.player.x,
      y: state.player.y,
      z: state.player.z,
      rotationY: state.player.rotationY,
      traversal: state.player.traversal
    };
    let playerMotion: PlayerMotionSample = {
      velocity: { x: 0, y: 0, z: 0 },
      speedMetersPerSecond: 0,
      accelerationMetersPerSecondSquared: 0,
      turnRateRadiansPerSecond: 0,
      isGrounded: state.player.traversal.isGrounded,
      isCollisionBlocked: false,
      requestedGait: "idle"
    };

    if (state.player.activeBoatId && boats[state.player.activeBoatId]) {
      // Player is aboard the boat across all modes (driving, fishing, menu, modal, paused)
      const activeBoat = boats[state.player.activeBoatId];
      player = {
        x: activeBoat.x,
        y: activeBoat.y + 0.5,
        z: activeBoat.z,
        rotationY: activeBoat.headingRadians,
        traversal: {
          ...state.player.traversal,
          isGrounded: true
        }
      };
      playerMotion = {
        velocity: {
          x: Math.sin(activeBoat.headingRadians) * activeBoat.speed,
          y: 0,
          z: Math.cos(activeBoat.headingRadians) * activeBoat.speed
        },
        speedMetersPerSecond: Math.abs(activeBoat.speed),
        accelerationMetersPerSecondSquared: 0,
        turnRateRadiansPerSecond: 0,
        isGrounded: true,
        isCollisionBlocked: false,
        requestedGait: mode === "boat-driving" ? "vehicle" : "idle"
      };
    } else if (mode === "on-foot" || mode === "farm-placement") {
      const resolvedPlayer = this.resolvePlayer(state, input, dt);
      player = resolvedPlayer.player;
      playerMotion = resolvedPlayer.motion;
    }

    this.world.step();
    return { frame: { player, boats }, playerMotion };
  }
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
