import type { ResolvedPhysicsFrame } from "../core/PhysicsAdapter";
import type { BoatId, FishCargoState, MarketId } from "../core/types";
import { HARBOR_DOCK, WORLD_SPAWN } from "../../world/WorldAnchors";
import { SAILABLE_BOUNDS, WorldLayout } from "../../world/WorldLayout";
import type { DomainContext } from "./DomainContext";
import { distance2d } from "./DomainContext";
import {
  createFullPlayerTraversalState,
  PLAYER_TRAVERSAL_TUNING
} from "../navigation/PlayerTraversal";

export class NavigationDomain {
  constructor(private readonly context: DomainContext) {}

  public commitPhysicsFrame(frame: ResolvedPhysicsFrame): { success: boolean; reason?: string } {
    const { state } = this.context;
    if (![frame.player.x, frame.player.y, frame.player.z, frame.player.rotationY].every(Number.isFinite)) {
      return { success: false, reason: "Physics returned an invalid player pose" };
    }
    const traversal = frame.player.traversal;
    if (
      traversal &&
      (!Number.isFinite(traversal.sprintStamina) ||
        traversal.sprintStamina < 0 ||
        traversal.sprintStamina > PLAYER_TRAVERSAL_TUNING.maximumSprintStamina ||
        !Number.isFinite(traversal.sprintRecoveryDelaySeconds) ||
        traversal.sprintRecoveryDelaySeconds < 0 ||
        typeof traversal.sprintExhausted !== "boolean" ||
        typeof traversal.isGrounded !== "boolean")
    ) {
      return { success: false, reason: "Physics returned an invalid traversal state" };
    }
    if (
      !WorldLayout.isInterior(frame.player.x, frame.player.z) &&
      (frame.player.x < SAILABLE_BOUNDS.minX ||
        frame.player.x > SAILABLE_BOUNDS.maxX ||
        frame.player.z < SAILABLE_BOUNDS.minZ ||
        frame.player.z > SAILABLE_BOUNDS.maxZ)
    ) {
      return { success: false, reason: "Physics returned a player pose outside the world" };
    }
    for (const [boatId, pose] of Object.entries(frame.boats)) {
      if (!state.boats[boatId]) return { success: false, reason: `Physics returned unknown boat ${boatId}` };
      if (![pose.x, pose.y, pose.z, pose.headingRadians, pose.speed].every(Number.isFinite)) {
        return { success: false, reason: `Physics returned an invalid pose for ${boatId}` };
      }
      if (
        pose.x < SAILABLE_BOUNDS.minX ||
        pose.x > SAILABLE_BOUNDS.maxX ||
        pose.z < SAILABLE_BOUNDS.minZ ||
        pose.z > SAILABLE_BOUNDS.maxZ
      ) {
        return { success: false, reason: `Physics returned ${boatId} outside sailable bounds` };
      }
    }
    const activeBoatId = state.player.activeBoatId;
    const activeBoatPose = activeBoatId ? frame.boats[activeBoatId] : undefined;
    if (activeBoatPose && Math.hypot(frame.player.x - activeBoatPose.x, frame.player.z - activeBoatPose.z) > 0.01) {
      return { success: false, reason: "Physics detached the player from the active boat" };
    }
    Object.assign(state.player, frame.player);
    for (const [boatId, pose] of Object.entries(frame.boats)) Object.assign(state.boats[boatId], pose);
    this.refreshPlayerRegion();
    return { success: true };
  }

  public setDebugPlayerPose(pose: { x: number; y: number; z: number; rotationY: number }): boolean {
    if (![pose.x, pose.y, pose.z, pose.rotationY].every(Number.isFinite)) return false;
    Object.assign(this.context.state.player, pose);
    this.refreshPlayerRegion();
    return true;
  }

  public setDebugBoatDriving(
    boatId: BoatId,
    pose: { x: number; z: number; headingRadians: number }
  ): boolean {
    if (![pose.x, pose.z, pose.headingRadians].every(Number.isFinite)) return false;
    if (!WorldLayout.isSailable(pose.x, pose.z)) return false;
    const boat = this.context.state.boats[boatId];
    if (!boat) return false;
    Object.assign(boat, {
      x: pose.x,
      y: 0,
      z: pose.z,
      headingRadians: pose.headingRadians,
      speed: 0,
      isDocked: false,
      dockedMarketId: null
    });
    Object.assign(this.context.state.player, {
      x: pose.x,
      y: 0.5,
      z: pose.z,
      rotationY: pose.headingRadians,
      activeBoatId: boatId,
      traversal: { ...this.context.state.player.traversal, isGrounded: true }
    });
    this.refreshPlayerRegion();
    return true;
  }

  public refreshPlayerRegion(): void {
    const { player } = this.context.state;
    player.currentRegionId = WorldLayout.regionAt(player.x, player.z);
  }

  public facePlayerTarget(x: number, z: number): { success: boolean; reason?: string } {
    if (![x, z].every(Number.isFinite)) {
      return { success: false, reason: "Target direction is invalid" };
    }
    const { player } = this.context.state;
    if (player.activeBoatId) {
      return { success: false, reason: "Boat heading owns facing while aboard" };
    }
    const deltaX = x - player.x;
    const deltaZ = z - player.z;
    if (Math.hypot(deltaX, deltaZ) <= 0.0001) return { success: true };
    player.rotationY = Math.atan2(deltaX, deltaZ);
    return { success: true };
  }

  public resetToSafeSpawn(): void {
    const { state } = this.context;
    const activeBoatId = state.player.activeBoatId;
    if (activeBoatId) {
      const boat = state.boats[activeBoatId];
      if (boat) {
        Object.assign(boat, {
          speed: 0,
          isDocked: true,
          dockedMarketId: HARBOR_DOCK.marketId,
          x: HARBOR_DOCK.boatPosition.x,
          y: HARBOR_DOCK.boatPosition.y,
          z: HARBOR_DOCK.boatPosition.z,
          headingRadians: 0
        });
      }
      state.player.activeBoatId = null;
    }
    Object.assign(state.player, {
      x: WORLD_SPAWN.playerPosition.x,
      y: WorldLayout.terrainHeight(WORLD_SPAWN.playerPosition.x, WORLD_SPAWN.playerPosition.z) + 0.5,
      z: WORLD_SPAWN.playerPosition.z,
      rotationY: 0,
      currentRegionId: WORLD_SPAWN.regionId,
      traversal: createFullPlayerTraversalState()
    });
  }

  public canBoardBoat(boatId: BoatId): boolean {
    const { state } = this.context;
    const boat = state.boats[boatId];
    return Boolean(
      boat &&
        (boatId !== "boat.player_rowboat" || state.quests.unlockedFeatureIds.includes("boat.player_rowboat")) &&
        !state.player.activeBoatId &&
        boat.isDocked &&
        boat.dockedMarketId === HARBOR_DOCK.marketId &&
        distance2d(state.player, HARBOR_DOCK.playerPosition) <= HARBOR_DOCK.boardRadius
    );
  }

  public boardBoat(boatId: BoatId): { success: boolean; reason?: string } {
    if (!this.canBoardBoat(boatId)) return { success: false, reason: "Move closer to the docked rowboat" };
    const { state, events } = this.context;
    const boat = state.boats[boatId]!;
    Object.assign(boat, { isDocked: false, dockedMarketId: null, speed: 0 });
    state.player.activeBoatId = boatId;
    Object.assign(state.player, {
      x: boat.x,
      y: boat.y + 0.5,
      z: boat.z,
      rotationY: boat.headingRadians,
      traversal: { ...state.player.traversal, isGrounded: true }
    });
    events.emit("BoatBoarded", { boatId, minute: state.clock.currentMinute });
    return { success: true };
  }

  public canDockActiveBoat(): boolean {
    const { state } = this.context;
    const boatId = state.player.activeBoatId;
    const boat = boatId ? state.boats[boatId] : null;
    return Boolean(boat && distance2d(boat, HARBOR_DOCK.boatPosition) <= HARBOR_DOCK.dockRadius);
  }

  public dockActiveBoat(): { success: boolean; reason?: string } {
    const { state, events } = this.context;
    const boatId = state.player.activeBoatId;
    if (!boatId) return { success: false, reason: "You are not aboard a boat" };
    if (!this.canDockActiveBoat()) return { success: false, reason: "Return to the harbor dock to disembark" };
    const boat = state.boats[boatId]!;
    Object.assign(boat, {
      x: HARBOR_DOCK.boatPosition.x,
      y: HARBOR_DOCK.boatPosition.y,
      z: HARBOR_DOCK.boatPosition.z,
      speed: 0,
      isDocked: true,
      dockedMarketId: HARBOR_DOCK.marketId
    });
    state.player.activeBoatId = null;
    Object.assign(state.player, {
      x: HARBOR_DOCK.playerPosition.x,
      y: WorldLayout.terrainHeight(HARBOR_DOCK.playerPosition.x, HARBOR_DOCK.playerPosition.z) + 0.5,
      z: HARBOR_DOCK.playerPosition.z,
      traversal: { ...state.player.traversal, isGrounded: true }
    });
    events.emit("BoatDocked", { boatId, minute: state.clock.currentMinute });
    events.emit("BoatDisembarked", { boatId, minute: state.clock.currentMinute });
    return { success: true };
  }

  public canAccessFishCargo(cargo: FishCargoState, marketId?: MarketId): boolean {
    const { state } = this.context;
    if (cargo.location.type === "player") return state.player.carriedFishCargoId === cargo.id;
    if (cargo.location.type !== "boat-hold" && cargo.location.type !== "boat-hook") return false;
    const boat = state.boats[cargo.location.containerId];
    if (!boat) return false;
    if (state.player.activeBoatId === boat.id) return true;
    return Boolean(marketId && boat.isDocked && boat.dockedMarketId === marketId);
  }
}
