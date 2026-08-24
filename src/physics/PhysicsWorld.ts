import type RAPIER from "@dimforge/rapier3d-compat";
import { ContentRegistry } from "../content/ContentRegistry";
import { WaterSurface } from "../render/water/WaterSurface";
import type { GameMode, GameState } from "../simulation/core/types";
import {
  TERRAIN_RESOLUTION,
  TERRAIN_SIZE_METERS,
  WorldLayout
} from "../world/WorldLayout";

export interface PhysicsFrameResult {
  player: { x: number; y: number; z: number; rotationY: number };
  boats: Record<string, { x: number; y: number; z: number; headingRadians: number; speed: number }>;
}

interface BoatPhysicsBody {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  headingRadians: number;
  speed: number;
}

function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

function dampAngle(current: number, target: number, response: number, dt: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-response * dt));
}

export class PhysicsWorld {
  private readonly rapier: typeof RAPIER;
  private readonly world: RAPIER.World;
  private readonly playerBody: RAPIER.RigidBody;
  private readonly playerCollider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly boatBodies = new Map<string, BoatPhysicsBody>();
  private playerVelocityX = 0;
  private playerVelocityZ = 0;
  private playerVerticalVelocity = 0;
  private playerRotationY = 0;

  private constructor(rapier: typeof RAPIER) {
    this.rapier = rapier;
    this.world = new rapier.World({ x: 0, y: -18, z: 0 });
    this.world.integrationParameters.dt = 1 / 60;
    this.playerBody = this.world.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased().setCanSleep(false)
    );
    this.playerCollider = this.world.createCollider(
      rapier.ColliderDesc.capsule(0.58, 0.34).setFriction(0),
      this.playerBody
    );
    this.controller = this.world.createCharacterController(0.035);
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
    for (const collider of WorldLayout.staticColliders()) {
      const body = this.world.createRigidBody(
        rapier.RigidBodyDesc.fixed().setTranslation(...collider.center)
      );
      this.world.createCollider(
        rapier.ColliderDesc.cuboid(...collider.halfExtents).setFriction(0.9),
        body
      );
    }
    this.world.updateSceneQueries();
  }

  public static async create(): Promise<PhysicsWorld> {
    const { default: rapier } = await import("@dimforge/rapier3d-compat");
    await rapier.init();
    return new PhysicsWorld(rapier);
  }

  private ensureBoat(id: string, x: number, y: number, z: number, headingRadians: number, speed: number): BoatPhysicsBody {
    const existing = this.boatBodies.get(id);
    if (existing) return existing;
    const body = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(x, y + 0.34, z)
        .setCanSleep(false)
    );
    const collider = this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(0.82, 0.3, 1.9).setFriction(0.15),
      body
    );
    const created = { body, collider, headingRadians, speed };
    this.boatBodies.set(id, created);
    return created;
  }

  private resolvePlayer(
    state: Readonly<GameState>,
    input: { x: number; z: number; sprint: boolean },
    dt: number
  ): PhysicsFrameResult["player"] {
    const player = state.player;
    const groundHeight = WorldLayout.terrainHeight(player.x, player.z);
    const footAnchorY = Math.max(player.y, groundHeight + 0.5);
    const expectedCenter = { x: player.x, y: footAnchorY + 0.42, z: player.z };
    const bodyPosition = this.playerBody.translation();
    if (
      Math.hypot(
        bodyPosition.x - expectedCenter.x,
        bodyPosition.y - expectedCenter.y,
        bodyPosition.z - expectedCenter.z
      ) > 0.08
    ) {
      this.playerBody.setTranslation(expectedCenter, true);
      this.playerVerticalVelocity = 0;
    }

    const inputLength = Math.hypot(input.x, input.z);
    const inputX = inputLength > 1 ? input.x / inputLength : input.x;
    const inputZ = inputLength > 1 ? input.z / inputLength : input.z;
    const speed = input.sprint ? 7.4 : 4.35;
    const targetVelocityX = inputX * speed;
    const targetVelocityZ = inputZ * speed;
    const acceleration = inputLength > 0.001 ? 30 : 38;
    this.playerVelocityX = moveToward(this.playerVelocityX, targetVelocityX, acceleration * dt);
    this.playerVelocityZ = moveToward(this.playerVelocityZ, targetVelocityZ, acceleration * dt);

    const current = this.playerBody.translation();
    let moveX = this.playerVelocityX * dt;
    let moveZ = this.playerVelocityZ * dt;
    if (!WorldLayout.isWalkable(current.x + moveX, current.z + moveZ)) {
      if (WorldLayout.isWalkable(current.x + moveX, current.z)) moveZ = 0;
      else if (WorldLayout.isWalkable(current.x, current.z + moveZ)) moveX = 0;
      else {
        moveX = 0;
        moveZ = 0;
        this.playerVelocityX = 0;
        this.playerVelocityZ = 0;
      }
    }

    this.playerVerticalVelocity = Math.max(-22, this.playerVerticalVelocity - 18 * dt);
    this.controller.computeColliderMovement(this.playerCollider, {
      x: moveX,
      y: this.playerVerticalVelocity * dt,
      z: moveZ
    });
    const movement = this.controller.computedMovement();
    if (this.controller.computedGrounded() && this.playerVerticalVelocity < 0) {
      this.playerVerticalVelocity = -0.25;
    }
    this.playerBody.setTranslation(
      { x: current.x + movement.x, y: current.y + movement.y, z: current.z + movement.z },
      true
    );

    if (inputLength > 0.001) {
      this.playerRotationY = dampAngle(
        this.playerRotationY || player.rotationY,
        Math.atan2(inputX, inputZ),
        16,
        dt
      );
    } else {
      this.playerRotationY = player.rotationY;
    }
    const resolved = this.playerBody.translation();
    return {
      x: resolved.x,
      y: Math.max(WorldLayout.terrainHeight(resolved.x, resolved.z) + 0.5, resolved.y - 0.42),
      z: resolved.z,
      rotationY: this.playerRotationY
    };
  }

  private resolveBoat(
    state: Readonly<GameState>,
    id: string,
    input: { x: number; z: number },
    mode: GameMode,
    dt: number,
    timeSeconds: number
  ): PhysicsFrameResult["boats"][string] {
    const boat = state.boats[id];
    const definition = ContentRegistry.boats.get(boat.boatTypeId);
    const water = WaterSurface.sample(boat.x, boat.z, timeSeconds, state.weather.seaRoughness);
    const physics = this.ensureBoat(id, boat.x, water.height, boat.z, boat.headingRadians, boat.speed);
    const bodyPosition = physics.body.translation();
    if (Math.hypot(bodyPosition.x - boat.x, bodyPosition.z - boat.z) > 1.5) {
      physics.headingRadians = boat.headingRadians;
      physics.speed = boat.speed;
    }

    const active = mode === "boat-driving" && state.player.activeBoatId === id && definition;
    if (active && definition) {
      const throttle = clamp(-input.z, -1, 1);
      const roughnessPenalty = clamp01(
        (state.weather.seaRoughness - definition.safeSeaRoughness) / Math.max(0.1, 1 - definition.safeSeaRoughness)
      );
      const control = 1 - roughnessPenalty * 0.38;
      const targetSpeed = throttle * definition.maxSpeed * control;
      const accelerationRate = throttle === 0 ? definition.acceleration * 1.35 : definition.acceleration;
      physics.speed += (targetSpeed - physics.speed) * (1 - Math.exp(-accelerationRate * dt));
      if (Math.abs(physics.speed) < 0.015 && throttle === 0) physics.speed = 0;
      const steeringAuthority = 0.3 + 0.7 * clamp01(Math.abs(physics.speed) / definition.maxSpeed);
      const reverseSign = physics.speed < -0.05 ? -1 : 1;
      physics.headingRadians +=
        input.x * definition.turningRate * steeringAuthority * control * reverseSign * dt;
    } else {
      physics.speed += (boat.speed - physics.speed) * (1 - Math.exp(-8 * dt));
      physics.headingRadians = dampAngle(physics.headingRadians, boat.headingRadians, 10, dt);
    }

    const deltaX = Math.sin(physics.headingRadians) * physics.speed * dt;
    const deltaZ = Math.cos(physics.headingRadians) * physics.speed * dt;
    let nextX = boat.x + deltaX;
    let nextZ = boat.z + deltaZ;
    const rotation = {
      x: 0,
      y: Math.sin(physics.headingRadians / 2),
      z: 0,
      w: Math.cos(physics.headingRadians / 2)
    };

    this.world.updateSceneQueries();
    if (WorldLayout.isSailable(nextX, nextZ) && Math.hypot(deltaX, deltaZ) > 0.00001) {
      const hit = this.world.castShape(
        { x: boat.x, y: water.height + 0.34, z: boat.z },
        rotation,
        { x: deltaX, y: 0, z: deltaZ },
        physics.collider.shape,
        0.04,
        1,
        true,
        undefined,
        undefined,
        physics.collider,
        physics.body
      );
      if (hit) {
        const travel = Math.max(0, hit.time_of_impact - 0.04);
        nextX = boat.x + deltaX * travel;
        nextZ = boat.z + deltaZ * travel;
        physics.speed *= 0.18;
      }
    } else if (!WorldLayout.isSailable(nextX, nextZ)) {
      nextX = boat.x;
      nextZ = boat.z;
      physics.speed *= 0.18;
    }

    const nextWater = WaterSurface.sample(nextX, nextZ, timeSeconds, state.weather.seaRoughness);
    physics.body.setTranslation({ x: nextX, y: nextWater.height + 0.34, z: nextZ }, true);
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

  public step(
    state: Readonly<GameState>,
    input: { x: number; z: number; sprint: boolean },
    mode: GameMode,
    dt: number,
    timeSeconds: number
  ): PhysicsFrameResult {
    const boats: PhysicsFrameResult["boats"] = {};
    for (const id of Object.keys(state.boats)) {
      boats[id] = this.resolveBoat(state, id, input, mode, dt, timeSeconds);
    }

    let player = {
      x: state.player.x,
      y: state.player.y,
      z: state.player.z,
      rotationY: state.player.rotationY
    };
    if (mode === "on-foot") {
      player = this.resolvePlayer(state, input, dt);
    } else if (mode === "boat-driving" && state.player.activeBoatId) {
      const activeBoat = boats[state.player.activeBoatId];
      if (activeBoat) {
        player = {
          x: activeBoat.x,
          y: activeBoat.y + 0.5,
          z: activeBoat.z,
          rotationY: activeBoat.headingRadians
        };
      }
    }

    this.world.step();
    return { player, boats };
  }
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
