import type RAPIER from "@dimforge/rapier3d-compat";
import { ContentRegistry } from "../content/ContentRegistry";
import { boatAssetId } from "../render/assets/AssetCatalog";
import { WaterSurface } from "../render/water/WaterSurface";
import type { GameMode, GameState, TimeWindowId } from "../simulation/core/types";
import type {
  BoatMotionSample,
  PhysicsAdapter,
  PhysicsContactSurface,
  PhysicsIntent,
  PhysicsStepResult,
  PlayerMotionSample,
  ResolvedPhysicsFrame
} from "../simulation/core/PhysicsAdapter";
import {
  advancePlayerTraversal,
  PLAYER_TRAVERSAL_TUNING,
  slopeGaitScale
} from "../simulation/navigation/PlayerTraversal";
import type { StaticCollisionProxy } from "./StaticCollision";
import { collisionPrimitivesForAsset } from "./CollisionCatalogAdapter";
import {
  TERRAIN_RESOLUTION,
  TERRAIN_SIZE_METERS,
  WorldLayout
} from "../world/WorldLayout";
import { HARBOR_DOCK, harborMooringForBoatType } from "../world/WorldAnchors";
import { MOUNT_TUNING } from "../simulation/mounts/Mounts";

interface BoatPhysicsBody {
  body: RAPIER.RigidBody;
  colliders: RAPIER.Collider[];
  collisionCenters: Array<{ x: number; y: number; z: number }>;
  collisionYawRadians: number[];
  headingRadians: number;
  speed: number;
}

interface ResolvedBoatStep {
  pose: ResolvedPhysicsFrame["boats"][string];
  motion: BoatMotionSample;
}

const CHARACTER_CONTROLLER_OFFSET_METERS = 0.035;
const PLAYER_CAPSULE_HALF_HEIGHT_METERS = 0.62;
const PLAYER_CAPSULE_RADIUS_METERS = 0.32;
const PLAYER_POSE_GROUND_OFFSET_METERS = 0.5;
const PLAYER_COLLIDER_CENTER_FROM_POSE_METERS =
  PLAYER_CAPSULE_HALF_HEIGHT_METERS +
  PLAYER_CAPSULE_RADIUS_METERS -
  PLAYER_POSE_GROUND_OFFSET_METERS;
const PLAYER_GROUND_SNAP_METERS = 0.38;
const PLAYER_APEX_VERTICAL_SPEED_METERS_PER_SECOND = 0.55;
const PLAYER_HARD_LANDING_SPEED_METERS_PER_SECOND = 8.5;
const PLAYER_LANDING_RESPONSE_MAX_SPEED_METERS_PER_SECOND = 15;
const MOUNT_CAPSULE_HALF_HEIGHT_METERS = 0.58;
const MOUNT_CAPSULE_RADIUS_METERS = 0.62;
const MOUNT_COLLIDER_CENTER_FROM_POSE_METERS =
  MOUNT_CAPSULE_HALF_HEIGHT_METERS +
  MOUNT_CAPSULE_RADIUS_METERS -
  MOUNT_TUNING.playerPoseGroundOffsetMeters;
let terrainBaseHeightfieldCache: Float32Array | null = null;
let roadColliderGeometryCache: { vertices: Float32Array; indices: Uint32Array } | null = null;

function sharedTerrainBaseHeightfield(): Float32Array {
  terrainBaseHeightfieldCache ??= WorldLayout.terrainBaseHeightfield();
  return terrainBaseHeightfieldCache;
}

function sharedRoadColliderGeometry(): { vertices: Float32Array; indices: Uint32Array } {
  if (roadColliderGeometryCache) return roadColliderGeometryCache;
  const geometry = WorldLayout.buildPathGeometry();
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  if (!index) {
    geometry.dispose();
    throw new Error("[PhysicsWorld] Canonical road geometry must be indexed for Rapier trimesh collision");
  }
  roadColliderGeometryCache = {
    vertices: Float32Array.from(position.array),
    indices: Uint32Array.from(index.array)
  };
  geometry.dispose();
  return roadColliderGeometryCache;
}

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

function moveToward(current: number, target: number, maximumDelta: number): number {
  if (Math.abs(target - current) <= maximumDelta) return target;
  return current + Math.sign(target - current) * maximumDelta;
}

/**
 * A capsule reaches the next bridge box before its center does. Sample the
 * leading edge on the authored bridge profile so Rapier receives the small
 * upward step before that edge can catch the capsule.
 */
function bridgeAwareTraversalSurfaceHeightForMove(
  currentX: number,
  currentZ: number,
  moveX: number,
  moveZ: number,
  leadingEdgeDistance: number
): number {
  const targetX = currentX + moveX;
  const targetZ = currentZ + moveZ;
  const targetHeight = WorldLayout.traversalSurfaceSample(targetX, targetZ).height;
  const moveLength = Math.hypot(moveX, moveZ);
  if (moveLength <= 0.000001) return targetHeight;

  const leadingX = targetX + (moveX / moveLength) * leadingEdgeDistance;
  const leadingZ = targetZ + (moveZ / moveLength) * leadingEdgeDistance;
  const bridgeSurfaceAhead =
    WorldLayout.isBridgeDeck(targetX, targetZ) ||
    WorldLayout.isBridgeApproach(targetX, targetZ) ||
    WorldLayout.isBridgeDeck(leadingX, leadingZ) ||
    WorldLayout.isBridgeApproach(leadingX, leadingZ);
  if (!bridgeSurfaceAhead) return targetHeight;

  return Math.max(
    targetHeight,
    WorldLayout.traversalSurfaceSample(leadingX, leadingZ).height
  );
}

function mountedTraversalSurfaceHeightForMove(
  currentX: number,
  currentZ: number,
  moveX: number,
  moveZ: number
): number {
  return bridgeAwareTraversalSurfaceHeightForMove(
    currentX,
    currentZ,
    moveX,
    moveZ,
    MOUNT_CAPSULE_RADIUS_METERS + CHARACTER_CONTROLLER_OFFSET_METERS
  );
}

function playerTraversalSurfaceHeightForMove(
  currentX: number,
  currentZ: number,
  moveX: number,
  moveZ: number
): number {
  return bridgeAwareTraversalSurfaceHeightForMove(
    currentX,
    currentZ,
    moveX,
    moveZ,
    PLAYER_CAPSULE_RADIUS_METERS + CHARACTER_CONTROLLER_OFFSET_METERS
  );
}

function groundEvidenceAt(
  x: number,
  z: number
): {
  normal: { x: number; y: number; z: number };
  surface: PhysicsContactSurface;
} {
  const sample = WorldLayout.traversalSurfaceSample(x, z);
  if (sample.source === "interior") {
    return { normal: sample.normal, surface: "interior-floor" };
  }
  if (sample.source === "bridge" || sample.source === "pier") {
    return { normal: sample.normal, surface: "bridge-deck" };
  }
  return {
    normal: sample.normal,
    surface: WorldLayout.terrainSurface(x, z)
  };
}

function resolveWalkableSlide(
  currentX: number,
  currentZ: number,
  moveX: number,
  moveZ: number,
  allowInterior: boolean = true
): { x: number; z: number; limited: boolean } {
  const isStableWalkable = (x: number, z: number): boolean =>
    WorldLayout.isWalkable(x, z) &&
    !WorldLayout.isWater(x, z) &&
    (allowInterior || !WorldLayout.isInterior(x, z)) &&
    (WorldLayout.isBridgeDeck(x, z) || WorldLayout.isBridgeApproach(x, z) || WorldLayout.isPierDeck(x, z) || WorldLayout.waterSignedDistance(x, z) <= -0.01);

  if (isStableWalkable(currentX + moveX, currentZ + moveZ)) {
    return { x: moveX, z: moveZ, limited: false };
  }

  if (!isStableWalkable(currentX, currentZ)) {
    const nearest = WorldLayout.nearestValidGround({ x: currentX, z: currentZ }, 8);
    const recoverX = nearest.x - currentX;
    const recoverZ = nearest.z - currentZ;
    const recoverLen = Math.hypot(recoverX, recoverZ);
    if (recoverLen > 0.0001 && isStableWalkable(nearest.x, nearest.z)) {
      const step = Math.min(recoverLen, Math.max(0.16, Math.hypot(moveX, moveZ)));
      const scaledX = (recoverX / recoverLen) * step;
      const scaledZ = (recoverZ / recoverLen) * step;
      if (isStableWalkable(currentX + scaledX, currentZ + scaledZ)) {
        return { x: scaledX, z: scaledZ, limited: true };
      }
    }
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
  private playerCollider: RAPIER.Collider;
  private playerColliderMounted = false;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly boatBodies = new Map<string, BoatPhysicsBody>();
  private readonly cameraSweepBallCache = new Map<number, RAPIER.Ball>();
  private readonly terrainCollider: RAPIER.Collider;
  private playerVelocityX = 0;
  private playerVelocityZ = 0;
  private playerVerticalVelocity = 0;
  private playerRotationY = 0;
  private playerGrounded = true;
  private playerGroundNormal = { x: 0, y: 1, z: 0 };
  private playerContactSurface: PhysicsContactSurface = "unknown";
  private lastResolvedPlayerPose: ResolvedPhysicsFrame["player"] | null = null;
  private lastPlayerAttachmentKey: string | null = null;
  private jumpBufferRemainingSeconds = 0;
  private coyoteTimeRemainingSeconds: number = PLAYER_TRAVERSAL_TUNING.coyoteTimeSeconds;
  private readonly staticPropBodies: RAPIER.RigidBody[] = [];

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
    this.controller.enableSnapToGround(PLAYER_GROUND_SNAP_METERS);

    const terrain = rapier.ColliderDesc.heightfield(
      TERRAIN_RESOLUTION,
      TERRAIN_RESOLUTION,
      sharedTerrainBaseHeightfield(),
      new rapier.Vector3(TERRAIN_SIZE_METERS, 1, TERRAIN_SIZE_METERS)
    ).setFriction(0.86);
    this.terrainCollider = this.world.createCollider(terrain);
    const road = sharedRoadColliderGeometry();
    this.world.createCollider(
      rapier.ColliderDesc.trimesh(road.vertices, road.indices).setFriction(0.9)
    );
    this.ingestStaticCollision(staticCollision);
    this.world.updateSceneQueries();
  }

  private ensurePlayerColliderProfile(mounted: boolean): void {
    if (mounted === this.playerColliderMounted) return;
    this.world.removeCollider(this.playerCollider, false);
    this.playerCollider = this.world.createCollider(
      this.rapier.ColliderDesc.capsule(
        mounted ? MOUNT_CAPSULE_HALF_HEIGHT_METERS : PLAYER_CAPSULE_HALF_HEIGHT_METERS,
        mounted ? MOUNT_CAPSULE_RADIUS_METERS : PLAYER_CAPSULE_RADIUS_METERS
      ).setFriction(0),
      this.playerBody
    );
    this.playerColliderMounted = mounted;
    this.controller.setMaxSlopeClimbAngle(
      mounted ? Math.acos(MOUNT_TUNING.maximumSlopeNormalY) : (38 * Math.PI) / 180
    );
    if (mounted) this.controller.disableSnapToGround();
    else this.controller.enableSnapToGround(PLAYER_GROUND_SNAP_METERS);
    this.world.updateSceneQueries();
  }

  public static async create(staticCollision: readonly StaticCollisionProxy[] = []): Promise<PhysicsWorld> {
    const { default: rapier } = await import("@dimforge/rapier3d-compat");
    await rapier.init();
    return new PhysicsWorld(rapier, staticCollision);
  }

  /** DEV layout editor: rebuild authored prop/building colliders from current presentation poses. */
  public replaceStaticCollision(proxies: readonly StaticCollisionProxy[]): void {
    for (const body of this.staticPropBodies) {
      this.world.removeRigidBody(body);
    }
    this.staticPropBodies.length = 0;
    this.ingestStaticCollision(proxies);
    this.world.updateSceneQueries();
  }

  private ingestStaticCollision(proxies: readonly StaticCollisionProxy[]): void {
    for (const proxy of proxies) {
      const centerX = Number.isFinite(proxy.center.x) ? proxy.center.x : 0;
      const centerY = Number.isFinite(proxy.center.y) ? proxy.center.y : 0;
      const centerZ = Number.isFinite(proxy.center.z) ? proxy.center.z : 0;
      const hx = Math.max(0.02, Number.isFinite(proxy.halfExtents.x) ? proxy.halfExtents.x : 0.1);
      const hy = Math.max(0.02, Number.isFinite(proxy.halfExtents.y) ? proxy.halfExtents.y : 0.1);
      const hz = Math.max(0.02, Number.isFinite(proxy.halfExtents.z) ? proxy.halfExtents.z : 0.1);
      const body = this.world.createRigidBody(
        this.rapier.RigidBodyDesc.fixed()
          .setTranslation(centerX, centerY, centerZ)
          .setRotation(proxy.rotation)
      );
      this.world.createCollider(
        this.rapier.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.9),
        body
      );
      this.staticPropBodies.push(body);
    }
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
        physics.body,
        (collider) => collider !== this.playerCollider && collider !== this.terrainCollider
      );
      if (hit && (earliest === null || hit.time_of_impact < earliest)) {
        earliest = hit.time_of_impact;
      }
    }
    return earliest;
  }

  /** True when a compound hull already intersects static world geometry. */
  private boatOverlapsStatic(
    physics: BoatPhysicsBody,
    x: number,
    y: number,
    z: number,
    headingRadians: number
  ): boolean {
    const probes: ReadonlyArray<readonly [number, number]> = [
      [0.03, 0],
      [-0.03, 0],
      [0, 0.03],
      [0, -0.03]
    ];
    for (const [deltaX, deltaZ] of probes) {
      const hitTime = this.castBoat(physics, x, y, z, headingRadians, deltaX, deltaZ);
      if (hitTime !== null && hitTime <= 0.001) return true;
    }
    return false;
  }

  /**
   * Nudge a penetrating hull to the nearest nearby sailable pose. Harbor slips
   * sit against a solid piling wall; a toi=0 start otherwise freezes every cast.
   */
  private freeBoatFromOverlap(
    physics: BoatPhysicsBody,
    x: number,
    y: number,
    z: number,
    headingRadians: number
  ): { x: number; z: number } {
    if (!this.boatOverlapsStatic(physics, x, y, z, headingRadians)) return { x, z };
    const snaps = [
      HARBOR_DOCK.boatPosition,
      { x: HARBOR_DOCK.boatPosition.x, z: HARBOR_DOCK.boatPosition.z + 2.4 },
      { x: x + 1.8, z },
      { x: x + 1.8, z: z + 2.2 },
      { x, z: z + 2.6 }
    ];
    for (const snap of snaps) {
      if (!WorldLayout.isSailable(snap.x, snap.z)) continue;
      if (!this.boatOverlapsStatic(physics, snap.x, y, snap.z, headingRadians)) {
        return { x: snap.x, z: snap.z };
      }
    }
    const dock = WorldLayout.landmark("dock");
    const awayX = x - dock.x;
    const awayZ = z - dock.z;
    const awayLength = Math.hypot(awayX, awayZ);
    const directions: Array<{ x: number; z: number }> = [];
    if (awayLength > 0.0001) {
      directions.push({ x: awayX / awayLength, z: awayZ / awayLength });
    }
    for (const candidate of [
      { x: 1, z: 0 },
      { x: 1, z: 1 },
      { x: 0, z: 1 },
      { x: 1, z: -1 },
      { x: 0, z: -1 },
      { x: -1, z: 1 },
      { x: -1, z: -1 },
      { x: -1, z: 0 }
    ]) {
      const length = Math.hypot(candidate.x, candidate.z);
      directions.push({ x: candidate.x / length, z: candidate.z / length });
    }
    for (const step of [0.18, 0.4, 0.75, 1.2, 1.8, 2.6]) {
      for (const direction of directions) {
        const nextX = x + direction.x * step;
        const nextZ = z + direction.z * step;
        if (!WorldLayout.isSailable(nextX, nextZ)) continue;
        if (!this.boatOverlapsStatic(physics, nextX, y, nextZ, headingRadians)) {
          return { x: nextX, z: nextZ };
        }
      }
    }
    return { x, z };
  }

  private playerAttachmentKey(state: Readonly<GameState>): string {
    if (state.player.activeBoatId) return `boat:${state.player.activeBoatId}`;
    if (state.player.activeMountId) return `mount:${state.player.activeMountId}`;
    return "on-foot";
  }

  private shouldSynchronizePlayerBody(
    state: Readonly<GameState>,
    attachmentKey: string
  ): boolean {
    const previous = this.lastResolvedPlayerPose;
    if (!previous || this.lastPlayerAttachmentKey !== attachmentKey) return true;
    const player = state.player;
    return (
      Math.hypot(player.x - previous.x, player.y - previous.y, player.z - previous.z) > 0.0005 ||
      Math.abs(normalizeAngle(player.rotationY - previous.rotationY)) > 0.0005 ||
      player.traversal.isGrounded !== previous.traversal.isGrounded
    );
  }

  private resolvePlayer(
    state: Readonly<GameState>,
    input: PhysicsIntent,
    dt: number,
    synchronizeBody: boolean
  ): { player: ResolvedPhysicsFrame["player"]; motion: PlayerMotionSample } {
    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(0.2, dt) : 1 / 60;
    const player = state.player;
    const isMounted = player.activeMountId !== null;
    this.ensurePlayerColliderProfile(isMounted);
    const groundHeight = WorldLayout.traversalSurfaceSample(player.x, player.z).height;
    const footAnchorY = isMounted
      ? groundHeight + MOUNT_TUNING.playerPoseGroundOffsetMeters
      : player.traversal.isGrounded
        ? groundHeight + PLAYER_POSE_GROUND_OFFSET_METERS
        : player.y;
    const expectedCenter = {
      x: player.x,
      y: footAnchorY + (isMounted ? MOUNT_COLLIDER_CENTER_FROM_POSE_METERS : PLAYER_COLLIDER_CENTER_FROM_POSE_METERS),
      z: player.z
    };
    if (synchronizeBody) {
      this.playerBody.setTranslation(expectedCenter, true);
      this.playerVelocityX = 0;
      this.playerVelocityZ = 0;
      this.playerVerticalVelocity = 0;
      this.playerRotationY = player.rotationY;
      this.playerGrounded = isMounted || player.traversal.isGrounded === true;
      this.jumpBufferRemainingSeconds = 0;
      this.coyoteTimeRemainingSeconds = this.playerGrounded
        ? PLAYER_TRAVERSAL_TUNING.coyoteTimeSeconds
        : 0;
      if (this.playerGrounded) {
        const groundEvidence = groundEvidenceAt(player.x, player.z);
        this.playerGroundNormal = groundEvidence.normal;
        this.playerContactSurface = groundEvidence.surface;
      }
    }

    const wasGrounded = this.playerGrounded;
    let jumpStarted = false;

    const rawInputX = Number.isFinite(input.x) ? input.x : 0;
    const rawInputZ = Number.isFinite(input.z) ? input.z : 0;
    const inputLength = Math.hypot(rawInputX, rawInputZ);
    const inputX = inputLength > 1 ? rawInputX / inputLength : rawInputX;
    const inputZ = inputLength > 1 ? rawInputZ / inputLength : rawInputZ;
    const traversalStep = isMounted
      ? {
          traversal: { ...player.traversal, isGrounded: true },
          isSprinting: input.sprint
        }
      : advancePlayerTraversal(
          player.traversal,
          { wantsSprint: input.sprint, isMoving: inputLength > 0.001 },
          safeDt
        );
    const gaitScale = this.playerGrounded
      ? slopeGaitScale(this.playerGroundNormal, inputX, inputZ)
      : 1;
    const speed = (isMounted
      ? traversalStep.isSprinting
        ? MOUNT_TUNING.trotSpeedMetersPerSecond
        : MOUNT_TUNING.walkSpeedMetersPerSecond
      : traversalStep.isSprinting
        ? PLAYER_TRAVERSAL_TUNING.sprintSpeedMetersPerSecond
        : PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond) * gaitScale;
    const targetVelocityX = inputX * speed;
    const targetVelocityZ = inputZ * speed;
    const acceleration = inputLength > 0.001
      ? isMounted
        ? MOUNT_TUNING.accelerationMetersPerSecondSquared
        : PLAYER_TRAVERSAL_TUNING.accelerationMetersPerSecondSquared
      : isMounted
        ? MOUNT_TUNING.decelerationMetersPerSecondSquared
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
    const requestedWalkableMove = resolveWalkableSlide(current.x, current.z, moveX, moveZ, !isMounted);
    moveX = requestedWalkableMove.x;
    moveZ = requestedWalkableMove.z;
    walkabilityLimited = requestedWalkableMove.limited;

    if (isMounted) {
      this.jumpBufferRemainingSeconds = 0;
      this.coyoteTimeRemainingSeconds = 0;
      this.playerGrounded = true;
      this.playerVerticalVelocity = 0;
    } else if (input.jumpRequested) {
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
      jumpStarted = true;
      this.jumpBufferRemainingSeconds = 0;
      this.coyoteTimeRemainingSeconds = 0;
    } else {
      this.playerVerticalVelocity = Math.max(
        -PLAYER_TRAVERSAL_TUNING.terminalFallSpeedMetersPerSecond,
        this.playerVerticalVelocity - PLAYER_TRAVERSAL_TUNING.gravityMetersPerSecondSquared * safeDt
      );
    }
    const verticalVelocityBeforeCollision = this.playerVerticalVelocity;
    const centerSurfaceY = WorldLayout.traversalSurfaceSample(current.x + moveX, current.z + moveZ).height;
    const targetSurfaceY = isMounted
      ? mountedTraversalSurfaceHeightForMove(current.x, current.z, moveX, moveZ)
      : this.playerGrounded
        ? playerTraversalSurfaceHeightForMove(current.x, current.z, moveX, moveZ)
        : 0;
    const leadRaisesSurface = (isMounted || this.playerGrounded) && targetSurfaceY > centerSurfaceY + 0.0001;
    const targetCenterY = isMounted
      ? targetSurfaceY
        + MOUNT_TUNING.playerPoseGroundOffsetMeters
        + MOUNT_COLLIDER_CENTER_FROM_POSE_METERS
      : targetSurfaceY + PLAYER_POSE_GROUND_OFFSET_METERS + PLAYER_COLLIDER_CENTER_FROM_POSE_METERS;
    this.controller.computeColliderMovement(this.playerCollider, {
      x: moveX,
      y: isMounted || leadRaisesSurface ? targetCenterY - current.y : this.playerVerticalVelocity * safeDt,
      z: moveZ
    });
    const computedMovement = this.controller.computedMovement();
    const movement = {
      x: computedMovement.x,
      y: computedMovement.y,
      z: computedMovement.z
    };
    const resolvedWalkableMove = resolveWalkableSlide(current.x, current.z, movement.x, movement.z, !isMounted);
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
      if (!collision) continue;
      if (Math.abs(collision.normal1.y) < 0.65) {
        hitBlockingSurface = true;
      }
    }

    // Ceiling bonk detection: zero vertical velocity when upward movement is blocked
    if (!isMounted && this.playerVerticalVelocity > 0 && movement.y < this.playerVerticalVelocity * safeDt * 0.4) {
      this.playerVerticalVelocity = 0;
    }

    const resolvedSupport = !isMounted
      ? WorldLayout.traversalSurfaceSample(current.x + movement.x, current.z + movement.z).height
      : centerSurfaceY;
    const resolvedFootFromBody = current.y + movement.y - (
      isMounted ? MOUNT_COLLIDER_CENTER_FROM_POSE_METERS : PLAYER_COLLIDER_CENTER_FROM_POSE_METERS
    );
    const supportGap = resolvedFootFromBody - (
      resolvedSupport + (isMounted
        ? MOUNT_TUNING.playerPoseGroundOffsetMeters
        : PLAYER_POSE_GROUND_OFFSET_METERS)
    );
    this.playerGrounded = isMounted || this.controller.computedGrounded() || (
      !jumpStarted &&
      this.playerVerticalVelocity <= 0 &&
      supportGap >= -0.08 &&
      supportGap <= PLAYER_GROUND_SNAP_METERS + CHARACTER_CONTROLLER_OFFSET_METERS
    );
    const landed = !isMounted && !wasGrounded && this.playerGrounded && verticalVelocityBeforeCollision < -0.5;
    const landingSpeed = landed ? Math.max(0, -verticalVelocityBeforeCollision) : 0;
    if (isMounted) {
      this.playerVerticalVelocity = 0;
    } else if (this.playerGrounded && this.playerVerticalVelocity < 0) {
      this.playerVerticalVelocity = -0.25;
    }
    this.playerBody.setTranslation(
      { x: current.x + movement.x, y: current.y + movement.y, z: current.z + movement.z },
      true
    );

    // Rapier owns collision resolution. Feeding its actual displacement back
    // into the transient velocity prevents pressure and footsteps at walls.
    let resolvedVelocityX = movement.x / safeDt;
    let resolvedVelocityZ = movement.z / safeDt;
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
    // The catalog bridge collision is a crowned series of walkable deck boxes.
    // A capsule can touch the rising corner of the next box while still
    // advancing across the deck; preserve a true blocked result for stalls,
    // but do not surface that expected step contact as route obstruction.
    const advancingAcrossBridgeStep =
      WorldLayout.isBridgeDeck(current.x, current.z) &&
      WorldLayout.isBridgeDeck(resolved.x, resolved.z) &&
      resolvedMoveDistance >= requestedMoveDistance * 0.75;
    const collisionBlocked = requestedMoveDistance > 0.0001 &&
      (walkabilityLimited || hitBlockingSurface) &&
      resolvedMoveDistance + 0.0001 < requestedMoveDistance * 0.9 &&
      !advancingAcrossBridgeStep;
    if (collisionBlocked && resolvedMoveDistance < requestedMoveDistance * 0.1) {
      // Rapier can return a few millimetres of contact-skin correction while
      // the player is pressing squarely into a wall. It is not travel and
      // must not advance gait phase or emit footsteps.
      this.playerVelocityX = 0;
      this.playerVelocityZ = 0;
      resolvedVelocityX = 0;
      resolvedVelocityZ = 0;
    }

    const groundY = WorldLayout.traversalSurfaceSample(resolved.x, resolved.z).height;

    if (this.playerGrounded) {
      const evidence = groundEvidenceAt(resolved.x, resolved.z);
      this.playerContactSurface = evidence.surface;
      this.playerGroundNormal = evidence.normal;
    }
    const resolvedVerticalVelocity = isMounted ? 0 : movement.y / safeDt;
    const airbornePhase = isMounted || this.playerGrounded
      ? "grounded"
      : resolvedVerticalVelocity > PLAYER_APEX_VERTICAL_SPEED_METERS_PER_SECOND
        ? "rising"
        : resolvedVerticalVelocity < -PLAYER_APEX_VERTICAL_SPEED_METERS_PER_SECOND
          ? "falling"
          : "apex";
    const contactEvent = isMounted
      ? "none"
      : jumpStarted
      ? "takeoff"
      : landed
        ? landingSpeed >= PLAYER_HARD_LANDING_SPEED_METERS_PER_SECOND
          ? "land-hard"
          : "land-soft"
        : "none";
    const landingImpactStrength = isMounted ? 0 : landed
      ? clamp01(
          (landingSpeed - 2.5) /
          (PLAYER_LANDING_RESPONSE_MAX_SPEED_METERS_PER_SECOND - 2.5)
        )
      : 0;
    const slopeRadians = this.playerGrounded
      ? Math.acos(clamp(this.playerGroundNormal.y, -1, 1))
      : 0;

    const playerPose = {
      x: resolved.x,
      // Rapier keeps a small collision skin; the canonical/visual foot anchor remains on the terrain or floor.
      y: isMounted
        ? (leadRaisesSurface
          ? Math.max(groundY, targetSurfaceY) + MOUNT_TUNING.playerPoseGroundOffsetMeters
          : groundY + MOUNT_TUNING.playerPoseGroundOffsetMeters)
        : this.playerGrounded
          ? groundY + PLAYER_POSE_GROUND_OFFSET_METERS
          : resolved.y - PLAYER_COLLIDER_CENTER_FROM_POSE_METERS,
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
          y: resolvedVerticalVelocity,
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
        groundNormal: { ...this.playerGroundNormal },
        slopeRadians,
        airbornePhase,
        contactEvent,
        landingImpactStrength,
        contactSurface: this.playerContactSurface,
        isCollisionBlocked: collisionBlocked,
        requestedGait: inputLength <= 0.001
          ? "idle"
          : isMounted
            ? traversalStep.isSprinting ? "trot" : "walk"
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
  ): ResolvedBoatStep {
    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(0.2, dt) : 1 / 60;
    const rawInputX = clamp(Number.isFinite(input.x) ? input.x : 0, -1, 1);
    const rawInputZ = clamp(Number.isFinite(input.z) ? input.z : 0, -1, 1);
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

    const previousHeadingRadians = physics.headingRadians;
    const previousSpeed = physics.speed;
    let throttle = 0;
    let steering = 0;
    let controlEffort = 0;
    let roughnessResponse = 0;

    const active = mode === "boat-driving" && state.player.activeBoatId === id && definition;
    if (active && definition) {
      const outOfFuel = definition.fuelCapacity > 0 && boat.fuel <= 0;
      throttle = outOfFuel ? 0 : clamp(-rawInputZ, -1, 1);
      steering = rawInputX;
      const roughnessPenalty = clamp01(
        (state.weather.seaRoughness + nightSeaExtra(state.clock.timeOfDay) - definition.safeSeaRoughness)
          / Math.max(0.1, 1 - definition.safeSeaRoughness)
      );
      const control = 1 - roughnessPenalty * 0.38;
      const mooring = harborMooringForBoatType(boat.boatTypeId);
      const mooringDistance = Math.hypot(
        boat.x - mooring.boatPosition.x,
        boat.z - mooring.boatPosition.z
      );
      const dockingAssist = clamp01(
        (mooring.dockRadius + 3 - mooringDistance) / 3
      ) * clamp01((2.2 - Math.abs(physics.speed)) / 2.2);
      const reverseLimit = definition.maxSpeed * 0.42;
      const requestedLimit = throttle >= 0 ? definition.maxSpeed : reverseLimit;
      let targetSpeed = throttle * requestedLimit * control;
      if (dockingAssist > 0 && mooringDistance > 0.35) {
        const toMooringX = mooring.boatPosition.x - boat.x;
        const toMooringZ = mooring.boatPosition.z - boat.z;
        const driveX = Math.sin(physics.headingRadians) * (throttle >= 0 ? 1 : -1);
        const driveZ = Math.cos(physics.headingRadians) * (throttle >= 0 ? 1 : -1);
        const approaching = driveX * toMooringX + driveZ * toMooringZ > 0;
        if (approaching) {
          const assistedLimit = 1.65;
          targetSpeed = clamp(
            targetSpeed,
            -Math.max(0.8, assistedLimit * (1 - dockingAssist * 0.45)),
            Math.max(1.05, assistedLimit * (1 - dockingAssist * 0.2))
          );
        }
      }
      const isActiveBraking =
        Math.abs(throttle) > 0.01 &&
        Math.abs(physics.speed) > 0.05 &&
        Math.sign(throttle) !== Math.sign(physics.speed);
      const accelerationRate = throttle === 0
        ? definition.acceleration * (0.22 + dockingAssist * 0.58)
        : definition.acceleration * (isActiveBraking ? 2.2 : 1);
      physics.speed = moveToward(
        physics.speed,
        targetSpeed,
        accelerationRate * safeDt
      );
      if (Math.abs(physics.speed) < 0.015 && throttle === 0) physics.speed = 0;
      const steeringAuthority = 0.3 + 0.7 * clamp01(Math.abs(physics.speed) / definition.maxSpeed);
      const reverseSign = physics.speed < -0.01 || (throttle < 0 && physics.speed <= 0.05) ? -1 : 1;
      physics.headingRadians +=
        rawInputX * definition.turningRate * steeringAuthority * control * reverseSign * safeDt;
      physics.headingRadians = normalizeAngle(physics.headingRadians);
      roughnessResponse = roughnessPenalty * clamp01(
        0.25 + Math.abs(physics.speed) / definition.maxSpeed
      );
      controlEffort = clamp01(Math.max(
        Math.abs(throttle),
        Math.abs(steering) * steeringAuthority
      ));
    } else {
      physics.speed += (boat.speed - physics.speed) * (1 - Math.exp(-8 * safeDt));
      physics.headingRadians = dampAngle(physics.headingRadians, boat.headingRadians, 10, safeDt);
    }

    const deltaX = Math.sin(physics.headingRadians) * physics.speed * safeDt;
    const deltaZ = Math.cos(physics.headingRadians) * physics.speed * safeDt;
    const requestedTravelDistance = Math.hypot(deltaX, deltaZ);
    this.world.updateSceneQueries();
    let originX = boat.x;
    let originZ = boat.z;
    if (active) {
      const freed = this.freeBoatFromOverlap(
        physics,
        originX,
        water.height,
        originZ,
        physics.headingRadians
      );
      originX = freed.x;
      originZ = freed.z;
    }
    let nextX = originX + deltaX;
    let nextZ = originZ + deltaZ;
    let collisionBlocked = false;
    const rotation = {
      x: 0,
      y: Math.sin(physics.headingRadians / 2),
      z: 0,
      w: Math.cos(physics.headingRadians / 2)
    };

    const isDesiredSailable = WorldLayout.isSailable(nextX, nextZ);
    let hitTime: number | null = null;
    if (Math.hypot(deltaX, deltaZ) > 0.00001) {
      hitTime = this.castBoat(
        physics,
        originX,
        water.height,
        originZ,
        physics.headingRadians,
        deltaX,
        deltaZ
      );
    }

    if (isDesiredSailable && hitTime === null) {
      // Unobstructed sailable trajectory
    } else if (Math.hypot(deltaX, deltaZ) > 0.00001) {
      collisionBlocked = true;
      const travel = hitTime !== null ? Math.max(0, hitTime - 0.025) : 0;
      const contactX = originX + deltaX * travel;
      const contactZ = originZ + deltaZ * travel;
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
      physics.speed *= bestSlide.distanceSquared > 0.00001 ? 0.72 : 0.16;
    } else {
      nextX = originX;
      nextZ = originZ;
      if (Math.hypot(originX - boat.x, originZ - boat.z) <= 0.00001) physics.speed = 0;
    }

    if (!WorldLayout.isSailable(nextX, nextZ)) {
      collisionBlocked = true;
      nextX = WorldLayout.isSailable(originX, originZ) ? originX : boat.x;
      nextZ = WorldLayout.isSailable(originX, originZ) ? originZ : boat.z;
      physics.speed *= 0.16;
    }

    const nextWater = WaterSurface.sample(nextX, nextZ, timeSeconds, waterConditions);
    physics.body.setTranslation({ x: nextX, y: nextWater.height, z: nextZ }, true);
    physics.body.setRotation(rotation, true);
    const resolvedDeltaX = nextX - boat.x;
    const resolvedDeltaZ = nextZ - boat.z;
    const resolvedTravelDistance = Math.hypot(resolvedDeltaX, resolvedDeltaZ);
    const blockedFraction = requestedTravelDistance > 0.00001
      ? clamp01(1 - resolvedTravelDistance / requestedTravelDistance)
      : 0;
    const referenceSpeed = Math.max(0.1, definition?.maxSpeed ?? Math.abs(previousSpeed));
    const contactStrength = collisionBlocked
      ? clamp01(blockedFraction * (0.35 + Math.abs(previousSpeed) / referenceSpeed))
      : 0;
    return {
      pose: {
        x: nextX,
        // Wave height is transient physics/presentation state. Persist the
        // canonical waterline so save/load never depends on wall-clock time.
        y: boat.y,
        z: nextZ,
        headingRadians: physics.headingRadians,
        speed: physics.speed
      },
      motion: {
        velocity: {
          x: resolvedDeltaX / safeDt,
          y: 0,
          z: resolvedDeltaZ / safeDt
        },
        accelerationMetersPerSecondSquared: (physics.speed - previousSpeed) / safeDt,
        yawRateRadiansPerSecond: normalizeAngle(
          physics.headingRadians - previousHeadingRadians
        ) / safeDt,
        throttle,
        steering,
        controlEffort,
        roughnessResponse,
        isCollisionBlocked: collisionBlocked,
        contactStrength
      }
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
        if (this.isBoatCollider(collider)) return false;
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

  private isBoatCollider(collider: RAPIER.Collider): boolean {
    for (const boat of this.boatBodies.values()) {
      if (boat.colliders.includes(collider)) return true;
    }
    return false;
  }

  private colliderHalfExtentPadding(collider: RAPIER.Collider, minPadding: number): number {
    const shape = collider.shape as {
      type: number;
      halfExtents?: { x: number; y: number; z: number };
      radius?: number;
    };
    if (shape.halfExtents) {
      return Math.max(minPadding, shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z);
    }
    if (typeof shape.radius === "number") {
      return Math.max(minPadding, shape.radius);
    }
    return minPadding;
  }

  /**
   * Candidate stations (mill/workbench/compost/fish-table/stall) occlude their
   * own interaction point when endpointPadding is smaller than their half-extents.
   * Ignore colliders that contain `to` or whose surface is within padding of it.
   * Terrain and boats are never treated as the candidate. Crops with collision
   * none have no collider at `to` and keep using the default padding.
   */
  private colliderBelongsToEndpoint(
    collider: RAPIER.Collider,
    to: { x: number; y: number; z: number },
    padding: number
  ): boolean {
    if (collider === this.playerCollider || collider === this.terrainCollider) return false;
    if (this.isBoatCollider(collider)) return false;
    if (collider.containsPoint(to)) return true;
    const projection = collider.projectPoint(to, true);
    if (!projection) return false;
    return Math.hypot(
      projection.point.x - to.x,
      projection.point.y - to.y,
      projection.point.z - to.z
    ) <= padding;
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

    let padding = endpointPadding;
    this.world.intersectionsWithPoint(
      to,
      (collider) => {
        if (this.colliderBelongsToEndpoint(collider, to, endpointPadding)) {
          padding = Math.max(padding, this.colliderHalfExtentPadding(collider, endpointPadding));
        }
        return true;
      },
      undefined,
      undefined,
      this.playerCollider
    );
    const nearest = this.world.projectPoint(
      to,
      true,
      undefined,
      undefined,
      this.playerCollider
    );
    if (
      nearest &&
      this.colliderBelongsToEndpoint(nearest.collider, to, endpointPadding)
    ) {
      padding = Math.max(padding, this.colliderHalfExtentPadding(nearest.collider, endpointPadding));
    }

    if (distance <= padding) return true;

    const hit = this.world.castRay(
      new this.rapier.Ray(from, direction),
      distance - padding,
      true,
      undefined,
      undefined,
      this.playerCollider,
      undefined,
      (collider) => {
        if (this.isBoatCollider(collider)) return false;
        if (this.colliderBelongsToEndpoint(collider, to, endpointPadding)) return false;
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
    const boatMotion: Record<string, BoatMotionSample> = {};
    for (const id of Object.keys(state.boats)) {
      const resolvedBoat = this.resolveBoat(state, id, input, mode, dt, timeSeconds);
      boats[id] = resolvedBoat.pose;
      boatMotion[id] = resolvedBoat.motion;
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
      groundNormal: { x: 0, y: 1, z: 0 },
      slopeRadians: 0,
      airbornePhase: state.player.traversal.isGrounded ? "grounded" : "falling",
      contactEvent: "none",
      landingImpactStrength: 0,
      contactSurface: "unknown",
      isCollisionBlocked: false,
      requestedGait: "idle"
    };

    const attachmentKey = this.playerAttachmentKey(state);
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
      const activeBoatMotion = boatMotion[state.player.activeBoatId];
      playerMotion = {
        velocity: activeBoatMotion
          ? { ...activeBoatMotion.velocity }
          : {
              x: Math.sin(activeBoat.headingRadians) * activeBoat.speed,
              y: 0,
              z: Math.cos(activeBoat.headingRadians) * activeBoat.speed
            },
        speedMetersPerSecond: Math.abs(activeBoat.speed),
        accelerationMetersPerSecondSquared: Math.abs(
          activeBoatMotion?.accelerationMetersPerSecondSquared ?? 0
        ),
        turnRateRadiansPerSecond: activeBoatMotion?.yawRateRadiansPerSecond ?? 0,
        isGrounded: true,
        groundNormal: { x: 0, y: 1, z: 0 },
        slopeRadians: 0,
        airbornePhase: "grounded",
        contactEvent: "none",
        landingImpactStrength: 0,
        contactSurface: "boat-deck",
        isCollisionBlocked: activeBoatMotion?.isCollisionBlocked ?? false,
        requestedGait: mode === "boat-driving" ? "vehicle" : "idle"
      };
    } else if (
      (mode === "on-foot" || mode === "farm-placement") ||
      (mode === "mounted" && state.player.activeMountId !== null)
    ) {
      const resolvedPlayer = this.resolvePlayer(
        state,
        input,
        dt,
        this.shouldSynchronizePlayerBody(state, attachmentKey)
      );
      player = resolvedPlayer.player;
      playerMotion = resolvedPlayer.motion;
    }

    this.world.step();
    this.lastResolvedPlayerPose = {
      ...player,
      traversal: { ...player.traversal }
    };
    this.lastPlayerAttachmentKey = attachmentKey;
    return { frame: { player, boats }, playerMotion, boatMotion };
  }
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function nightSeaExtra(timeOfDay: TimeWindowId): number {
  if (timeOfDay === "night") return 0.22;
  if (timeOfDay === "dusk") return 0.1;
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
