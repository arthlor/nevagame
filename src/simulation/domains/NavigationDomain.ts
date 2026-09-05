import type { ResolvedPhysicsFrame } from "../core/PhysicsAdapter";
import { ContentRegistry } from "../../content/ContentRegistry";
import { InventoryManager } from "../inventory/InventoryManager";
import type { BoatId, BoatState, FishCargoState, GameState, MarketId, MountId } from "../core/types";
import {
  HARBOR_SKIFF_MOORING,
  WORLD_SPAWN
} from "../../world/WorldAnchors";
import { SAILABLE_BOUNDS, WorldLayout } from "../../world/WorldLayout";
import type { DomainContext } from "./DomainContext";
import { distance2d } from "./DomainContext";
import {
  createFullPlayerTraversalState,
  PLAYER_TRAVERSAL_TUNING
} from "../navigation/PlayerTraversal";
import {
  isValidMountPose,
  isValidPlayerMountGround,
  isPlayerAtMountPose,
  mountPoseFromPlayer,
  playerPoseFromMount,
  resolveMountDismountPose,
  MOUNT_TUNING,
  STARTER_DONKEY_ID,
  STARTER_DONKEY_TYPE_ID
} from "../mounts/Mounts";
import {
  dockedMooring,
  nearestMooring
} from "../../world/WorldMoorings";
import { SUNREACH_ANCHORS } from "../../world/WorldIslands";

/** Drain motor-skiff fuel from simulation minutes while the vessel is underway. */
export function drainMotorFuel(state: GameState, minutes: number): void {
  if (minutes <= 0) return;
  for (const boat of Object.values(state.boats)) {
    const definition = ContentRegistry.boats.get(boat.boatTypeId);
    if (!definition || definition.fuelCapacity <= 0) continue;
    if (Math.abs(boat.speed) < 0.02) continue;
    const speedRatio = Math.min(1, Math.abs(boat.speed) / Math.max(0.01, definition.maxSpeed));
    boat.fuel = Math.max(0, boat.fuel - minutes * 2 * speedRatio);
  }
}

export class NavigationDomain {
  private openChannelNoticeShown = false;

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
    const activeMountId = state.player.activeMountId;
    if (activeBoatId && activeMountId) {
      return { success: false, reason: "Physics returned mutually exclusive boat and mount state" };
    }
    const activeBoatPose = activeBoatId ? frame.boats[activeBoatId] : undefined;
    if (activeBoatPose && Math.hypot(frame.player.x - activeBoatPose.x, frame.player.z - activeBoatPose.z) > 0.01) {
      return { success: false, reason: "Physics detached the player from the active boat" };
    }
    if (activeMountId) {
      const mount = state.mounts[activeMountId];
      if (
        !mount ||
        !isValidMountPose(mount) ||
        frame.player.traversal.isGrounded !== true ||
        !isValidPlayerMountGround(frame.player) ||
        !isValidMountPose({ ...mount, ...mountPoseFromPlayer(frame.player) })
      ) {
        return { success: false, reason: "Physics returned an invalid mounted pose" };
      }
    }
    if (activeBoatId && activeBoatPose) {
      const boat = state.boats[activeBoatId];
      const approachDistance = Math.max(8, Math.abs(boat.speed) * 2);
      const approachX = activeBoatPose.x + Math.sin(boat.headingRadians) * approachDistance;
      const approachZ = activeBoatPose.z + Math.cos(boat.headingRadians) * approachDistance;
      const requirement = WorldLayout.navigationRequirementAt(activeBoatPose.x, activeBoatPose.z)
        ?? WorldLayout.navigationRequirementAt(boat.x, boat.z)
        ?? WorldLayout.navigationRequirementAt(approachX, approachZ);
      if (requirement && boat.boatTypeId !== requirement.requiredBoatTypeId) {
        if (!this.openChannelNoticeShown) {
          this.context.events.emit("Notification", {
            title: "Open channel ahead",
            message: requirement.message,
            type: "warning"
          });
          this.openChannelNoticeShown = true;
        }
      } else {
        this.openChannelNoticeShown = false;
      }
    }
    Object.assign(state.player, frame.player);
    for (const [boatId, pose] of Object.entries(frame.boats)) Object.assign(state.boats[boatId], pose);
    if (activeMountId) {
      Object.assign(state.mounts[activeMountId]!, mountPoseFromPlayer(state.player));
      // The gallop budget is the animal's, so it lives on the mount and is
      // saved with it rather than being recomputed from the rider.
      if (frame.mountGait) Object.assign(state.mounts[activeMountId]!, frame.mountGait);
    }
    this.refreshPlayerRegion();
    return { success: true };
  }

  /** Drain motor-skiff fuel from simulation minutes while the vessel is underway. */
  public tickFuel(minutes: number): void {
    drainMotorFuel(this.context.state, minutes);
  }

  public setDebugPlayerPose(pose: { x: number; y: number; z: number; rotationY: number }): boolean {
    if (![pose.x, pose.y, pose.z, pose.rotationY].every(Number.isFinite)) return false;
    const state = this.context.state;
    if (state.player.activeMountId) {
      const mount = state.mounts[state.player.activeMountId];
      if (
        !mount ||
        !isValidMountPose(mount) ||
        state.player.traversal.isGrounded !== true ||
        !isValidPlayerMountGround(pose) ||
        !isValidMountPose({ ...mount, ...mountPoseFromPlayer(pose) })
      ) return false;
    }
    Object.assign(state.player, pose);
    if (state.player.activeMountId) Object.assign(state.mounts[state.player.activeMountId]!, mountPoseFromPlayer(state.player));
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
    if (!boat || this.context.state.player.activeMountId) return false;
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
    if (player.activeMountId) {
      return { success: false, reason: "Dismount before changing direction" };
    }
    const deltaX = x - player.x;
    const deltaZ = z - player.z;
    if (Math.hypot(deltaX, deltaZ) <= 0.0001) return { success: true };
    player.rotationY = Math.atan2(deltaX, deltaZ);
    return { success: true };
  }

  public resetToSafeSpawn(): { success: boolean; reason?: string } {
    const { state } = this.context;
    if (state.player.activeMountId) {
      return { success: false, reason: "Dismount first before using Safe Return" };
    }
    const activeBoatId = state.player.activeBoatId;
    if (activeBoatId) {
      const boat = state.boats[activeBoatId];
      if (
        state.player.carriedFishCargoId ||
        boat?.fishCargoSlotIds.some((cargoId) => cargoId !== null)
      ) {
        return {
          success: false,
          reason: "Return to the harbor before using Safe Return while carrying physical fish cargo"
        };
      }
      if (boat) {
        const mooring = nearestMooring(boat.x, boat.z, boat.boatTypeId);
        Object.assign(boat, {
          speed: 0,
          isDocked: true,
          dockedMarketId: mooring.marketId,
          x: mooring.boatPosition.x,
          y: mooring.boatPosition.y,
          z: mooring.boatPosition.z,
          headingRadians: 0
        });
      }
      state.player.activeBoatId = null;
    }
    const recovery = WorldLayout.islandAt(state.player.x, state.player.z) === "island.sunreach"
      ? SUNREACH_ANCHORS.dockPlayer
      : WORLD_SPAWN.playerPosition;
    Object.assign(state.player, {
      x: recovery.x,
      y: WorldLayout.traversalSurfaceHeight(
        recovery.x,
        recovery.z
      ) + 0.5,
      z: recovery.z,
      rotationY: 0,
      currentRegionId: WorldLayout.regionAt(recovery.x, recovery.z),
      traversal: createFullPlayerTraversalState()
    });
    return { success: true };
  }

  public canBoardBoat(boatId: BoatId): boolean {
    const { state } = this.context;
    const boat = state.boats[boatId];
    const mooring = boat ? dockedMooring(boat.dockedMarketId, boat.boatTypeId, boat.x, boat.z) : null;
    return Boolean(
      boat &&
        (boatId !== "boat.player_rowboat" || state.quests.unlockedFeatureIds.includes("boat.player_rowboat")) &&
        !state.player.activeBoatId &&
        !state.player.activeMountId &&
        boat.isDocked &&
        mooring &&
        boat.dockedMarketId === mooring.marketId &&
        (
          distance2d(state.player, mooring.playerPosition) <= mooring.boardRadius ||
          distance2d(state.player, boat) <= mooring.hullBoardRadius
        )
    );
  }

  public boardBoat(boatId: BoatId): { success: boolean; reason?: string } {
    if (!this.canBoardBoat(boatId)) return { success: false, reason: "Move closer to the docked vessel" };
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

  private mountBoardFailure(mountId: MountId): string | null {
    const { state } = this.context;
    const mount = state.mounts[mountId];
    if (mountId !== STARTER_DONKEY_ID || !mount || mount.mountTypeId !== STARTER_DONKEY_TYPE_ID) {
      return "That mount is unavailable";
    }
    if (state.player.activeMountId) return "You are already riding a mount";
    if (state.player.activeBoatId) return "Disembark from the boat first";
    if (state.basicFishing || state.sportFishing) return "Finish fishing first";
    if (state.player.carriedFishCargoId) return "Stow physical fish cargo before riding";
    if (state.player.traversal.isGrounded !== true) return "Land before mounting";
    if (!isValidPlayerMountGround(state.player)) return "Move onto dry, walkable ground first";
    if (!isValidMountPose(mount)) return "The donkey is not on stable ground";
    if (distance2d(state.player, mount) > MOUNT_TUNING.boardRadiusMeters) return "Move closer to the donkey";
    return null;
  }

  public canBoardMount(mountId: MountId = STARTER_DONKEY_ID): boolean {
    return this.mountBoardFailure(mountId) === null;
  }

  public boardMount(mountId: MountId = STARTER_DONKEY_ID): { success: boolean; reason?: string } {
    const failure = this.mountBoardFailure(mountId);
    if (failure) return { success: false, reason: failure };
    const { state, events } = this.context;
    const mount = state.mounts[mountId]!;
    const pose = playerPoseFromMount(mount);
    Object.assign(state.player, {
      ...pose,
      activeMountId: mountId,
      traversal: { ...state.player.traversal, isGrounded: true }
    });
    events.emit("MountBoarded", { mountId, minute: state.clock.currentMinute });
    return { success: true };
  }

  public canDismountMount(): boolean {
    const { state } = this.context;
    const mountId = state.player.activeMountId;
    const mount = mountId ? state.mounts[mountId] : undefined;
    if (!mountId || !mount || !isValidMountPose(mount)) return false;
    const pose = { ...mount, ...mountPoseFromPlayer(state.player) };
    return state.player.traversal.isGrounded === true &&
      isPlayerAtMountPose(state.player, mount, 0.24) &&
      isValidPlayerMountGround(state.player) &&
      isValidMountPose(pose) &&
      resolveMountDismountPose(state.player) !== null;
  }

  public dismountMount(): { success: boolean; reason?: string } {
    const { state, events } = this.context;
    const mountId = state.player.activeMountId;
    const mount = mountId ? state.mounts[mountId] : undefined;
    if (!mountId || !mount || !isValidMountPose(mount)) {
      return { success: false, reason: "You are not riding the donkey" };
    }
    const pose = { ...mount, ...mountPoseFromPlayer(state.player) };
    const dismountPose = resolveMountDismountPose(state.player);
    if (state.player.traversal.isGrounded !== true ||
      !isPlayerAtMountPose(state.player, mount, 0.24) ||
      !isValidPlayerMountGround(state.player) ||
      !isValidMountPose(pose) ||
      !dismountPose) {
      return { success: false, reason: "There is no safe ground to dismount here" };
    }
    Object.assign(mount, mountPoseFromPlayer(state.player));
    Object.assign(state.player, dismountPose, {
      activeMountId: null,
      traversal: { ...state.player.traversal, isGrounded: true }
    });
    this.refreshPlayerRegion();
    events.emit("MountDisembarked", { mountId, minute: state.clock.currentMinute });
    return { success: true };
  }

  public canDockActiveBoat(): boolean {
    const { state } = this.context;
    const boatId = state.player.activeBoatId;
    const boat = boatId ? state.boats[boatId] : null;
    const mooring = boat ? nearestMooring(boat.x, boat.z, boat.boatTypeId) : null;
    return Boolean(boat && mooring && distance2d(boat, mooring.boatPosition) <= mooring.dockRadius);
  }

  public dockActiveBoat(): { success: boolean; reason?: string } {
    const { state, events } = this.context;
    if (state.player.activeMountId) return { success: false, reason: "Dismount before docking a boat" };
    const boatId = state.player.activeBoatId;
    if (!boatId) return { success: false, reason: "You are not aboard a boat" };
    if (!this.canDockActiveBoat()) return { success: false, reason: "Return to the harbor dock to disembark" };
    const boat = state.boats[boatId]!;
    const mooring = nearestMooring(boat.x, boat.z, boat.boatTypeId);
    Object.assign(boat, {
      x: mooring.boatPosition.x,
      y: mooring.boatPosition.y,
      z: mooring.boatPosition.z,
      speed: 0,
      isDocked: true,
      dockedMarketId: mooring.marketId
    });
    state.player.activeBoatId = null;
    Object.assign(state.player, {
      x: mooring.playerPosition.x,
      y: WorldLayout.traversalSurfaceHeight(
        mooring.playerPosition.x,
        mooring.playerPosition.z
      ) + 0.5,
      z: mooring.playerPosition.z,
      traversal: { ...state.player.traversal, isGrounded: true }
    });
    events.emit("BoatDocked", { boatId, marketId: mooring.marketId, minute: state.clock.currentMinute });
    events.emit("BoatDisembarked", { boatId, minute: state.clock.currentMinute });
    return { success: true };
  }

  /** Flat fee for a tow to the nearest compatible mooring. */
  public static readonly EMERGENCY_TOW_COST = 25;

  /**
   * Crude zero-fuel recovery. Safe Return refuses while carrying physical
   * fish, so the tow is the cargo-safe counterpart: it docks the crewed boat
   * at the nearest compatible mooring with cargo and fuel untouched, for a
   * flat fee. No clock advance — the lost trip is the time cost.
   */
  public emergencyTow(): { success: boolean; reason?: string; cost?: number } {
    const { state, events } = this.context;
    if (state.player.activeMountId) return { success: false, reason: "Dismount before signaling a tow" };
    const boatId = state.player.activeBoatId;
    if (!boatId) return { success: false, reason: "Board a boat before signaling a tow" };
    const boat = state.boats[boatId];
    if (!boat) return { success: false, reason: "Boat not found" };
    const definition = ContentRegistry.boats.get(boat.boatTypeId);
    if (!definition || definition.fuelCapacity <= 0) {
      return { success: false, reason: "This boat needs no tow — row it home" };
    }
    if (boat.fuel > 0) return { success: false, reason: "The tank still has fuel — sail on" };
    if (state.player.money < NavigationDomain.EMERGENCY_TOW_COST) {
      return { success: false, reason: `Emergency tow needs ${NavigationDomain.EMERGENCY_TOW_COST} G` };
    }
    const mooring = nearestMooring(boat.x, boat.z, boat.boatTypeId);
    state.player.money -= NavigationDomain.EMERGENCY_TOW_COST;
    Object.assign(boat, {
      x: mooring.boatPosition.x,
      y: mooring.boatPosition.y,
      z: mooring.boatPosition.z,
      speed: 0,
      isDocked: true,
      dockedMarketId: mooring.marketId
    });
    state.player.activeBoatId = null;
    Object.assign(state.player, {
      x: mooring.playerPosition.x,
      y: WorldLayout.traversalSurfaceHeight(
        mooring.playerPosition.x,
        mooring.playerPosition.z
      ) + 0.5,
      z: mooring.playerPosition.z,
      traversal: { ...state.player.traversal, isGrounded: true }
    });
    this.refreshPlayerRegion();
    events.emit("BoatDocked", { boatId, marketId: mooring.marketId, minute: state.clock.currentMinute });
    events.emit("BoatDisembarked", { boatId, minute: state.clock.currentMinute });
    events.emit("Notification", {
      title: "Emergency tow",
      message: "Towed to the nearest mooring · catch kept · refuel before sailing",
      type: "warning"
    });
    return { success: true, cost: NavigationDomain.EMERGENCY_TOW_COST };
  }

  public refuel(boatId?: BoatId): { success: boolean; reason?: string } {
    const { state } = this.context;
    if (state.player.activeMountId) return { success: false, reason: "Dismount before handling fuel" };
    const targetId = boatId ?? state.player.activeBoatId ?? null;
    if (!targetId) return { success: false, reason: "No boat to refuel" };
    const boat = state.boats[targetId];
    if (!boat) return { success: false, reason: "Boat not found" };
    const definition = ContentRegistry.boats.get(boat.boatTypeId);
    if (!definition || definition.fuelCapacity <= 0) {
      return { success: false, reason: "This boat does not take fuel" };
    }
    const aboard = state.player.activeBoatId === boat.id;
    const near = distance2d(state.player, boat) <= 4.5;
    if (!aboard && !near && !boat.isDocked) {
      return { success: false, reason: "Move to the boat or dock before refueling" };
    }
    if (boat.fuel >= definition.fuelCapacity) {
      return { success: false, reason: "The tank is already full" };
    }
    const inventory = state.inventories[state.player.inventoryId];
    const fuel = [{ itemId: "item.boat_fuel", quantity: 1 }];
    if (!InventoryManager.hasItems(inventory, fuel)) {
      return { success: false, reason: "No boat fuel in the satchel" };
    }
    if (!InventoryManager.removeItemsAtomically(inventory, fuel)) {
      return { success: false, reason: "No boat fuel in the satchel" };
    }
    boat.fuel = definition.fuelCapacity;
    return { success: true };
  }

  public purchaseSkiff(): { success: boolean; reason?: string; cost?: number } {
    const { state, events } = this.context;
    const boatId = "boat.player_skiff";
    if (state.boats[boatId]) return { success: false, reason: "You already own the coastal skiff" };
    const definition = ContentRegistry.boats.get("boat.skiff");
    if (!definition || !definition.requiredSkillXp) return { success: false, reason: "Coastal skiff contract is unavailable" };
    if (distance2d(state.player, HARBOR_SKIFF_MOORING.playerPosition) > HARBOR_SKIFF_MOORING.boardRadius) {
      return { success: false, reason: "Move closer to the skiff mooring" };
    }
    const requiredXp = definition.requiredSkillXp.xp;
    if (state.player.proficiencies[definition.requiredSkillXp.skill] < requiredXp) {
      return { success: false, reason: `Requires ${requiredXp.toLocaleString()} Fishing XP` };
    }
    if (state.player.money < definition.costMoney) {
      return { success: false, reason: `You need ${definition.costMoney} G for the coastal skiff` };
    }

    const supplyInventoryId = "inv.skiff_supply";
    if (state.inventories[supplyInventoryId]) return { success: false, reason: "Skiff supplies are already registered" };
    const supplyInventory = InventoryManager.createInventory(supplyInventoryId, definition.supplySlotCount);
    const boat: BoatState = {
      id: boatId,
      boatTypeId: definition.id,
      x: HARBOR_SKIFF_MOORING.boatPosition.x,
      y: HARBOR_SKIFF_MOORING.boatPosition.y,
      z: HARBOR_SKIFF_MOORING.boatPosition.z,
      headingRadians: 0,
      speed: 0,
      fuel: definition.fuelCapacity,
      durability: definition.durabilityMax,
      fishCargoSlotIds: definition.fishCargoSlots.map(() => null),
      supplyInventoryId,
      upgrades: [],
      isDocked: true,
      dockedMarketId: HARBOR_SKIFF_MOORING.marketId
    };

    // All checks are complete before mutating money, inventory or ownership.
    state.player.money -= definition.costMoney;
    state.inventories[supplyInventoryId] = supplyInventory;
    state.boats[boatId] = boat;
    if (!state.quests.unlockedFeatureIds.includes(boatId)) state.quests.unlockedFeatureIds.push(boatId);
    events.emit("BoatPurchased", {
      boatId,
      boatTypeId: definition.id,
      cost: definition.costMoney,
      minute: state.clock.currentMinute
    });
    return { success: true, cost: definition.costMoney };
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
