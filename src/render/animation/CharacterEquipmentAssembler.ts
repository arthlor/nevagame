import * as THREE from "three";
import { ContentRegistry } from "../../content/ContentRegistry";
import { STARTER_EQUIPMENT_IDS } from "../../content/equipment";
import type { EquipmentSlot, GameState } from "../../simulation/core/types";
import type { AssetId } from "../assets/AssetCatalog";
import { AssetLoader } from "../loaders/AssetLoader";
import { applyEquipmentSocketPose } from "./CharacterEquipment";
import { resolveHumanoidRig } from "./HumanoidRig";

export type CharacterToolKey = "water" | "sickle" | "rod";

export interface CharacterVisualAsset {
  assetId: string;
  scale?: number;
}

export interface CharacterVisualLoadout {
  head: CharacterVisualAsset | null;
  outerwear: CharacterVisualAsset | null;
  feet: CharacterVisualAsset | null;
  wateringTool: CharacterVisualAsset;
  harvestTool: CharacterVisualAsset;
  rod: CharacterVisualAsset;
}

function visualForEquipmentSlot(
  state: Readonly<GameState>,
  slot: EquipmentSlot
): CharacterVisualAsset | null {
  const definition = ContentRegistry.equipment.get(state.player.equipment.equipped[slot]);
  const assetId = definition?.presentation.assetId;
  return assetId ? { assetId, scale: definition.presentation.scale } : null;
}

export function characterVisualLoadoutFromState(state: Readonly<GameState>): CharacterVisualLoadout {
  const rodAssetId = ContentRegistry.rods.get(state.player.equippedRodId)?.assetId ?? "tool_fishing_rod_a";
  return {
    head: visualForEquipmentSlot(state, "head"),
    outerwear: visualForEquipmentSlot(state, "outerwear"),
    feet: visualForEquipmentSlot(state, "feet"),
    wateringTool: visualForEquipmentSlot(state, "watering-tool") ?? { assetId: "tool_watering_can_a" },
    harvestTool: visualForEquipmentSlot(state, "harvest-tool") ?? { assetId: "tool_sickle_a" },
    rod: { assetId: rodAssetId }
  };
}

export interface CharacterEquipmentAssemblerOptions {
  loadModel?: (assetId: AssetId) => Promise<THREE.Group>;
  onToolChanged?: (key: CharacterToolKey, object: THREE.Group | null) => void;
  onAssetError?: (assetId: string, error: unknown) => void;
  onSyncSettled?: (failedAssetIds: readonly string[]) => void;
  configureObject?: (object: THREE.Object3D) => void;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  maxLoadAttempts?: number;
  now?: () => number;
}

type WearableSlot = Extract<EquipmentSlot, "head" | "outerwear" | "feet">;
type VisualSlot = WearableSlot | CharacterToolKey;

interface BaseLayerMaterialSwap {
  mesh: THREE.Mesh;
  original: THREE.Material | THREE.Material[];
  regionMaterials: THREE.Material[];
}

interface StarterLayerControl {
  setVisible(visible: boolean): void;
  dispose(): void;
}

interface FailedVisual {
  visualKey: string;
  assetId: string;
  attempts: number;
  retryAtMs: number;
}

const WEARABLE_NODE: Record<Exclude<WearableSlot, "feet">, string> = {
  head: "wearable_head_anchor",
  outerwear: "wearable_body_anchor"
};

const TOOL_SOCKET = "char_player_tool_socket";
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const DEFAULT_RETRY_MAX_DELAY_MS = 8_000;
const DEFAULT_MAX_LOAD_ATTEMPTS = 4;

function visualKey(visual: CharacterVisualAsset | null): string | null {
  return visual ? `${visual.assetId}@${visual.scale ?? "authored"}` : null;
}

function copyLoadout(loadout: CharacterVisualLoadout): CharacterVisualLoadout {
  return {
    head: loadout.head ? { ...loadout.head } : null,
    outerwear: loadout.outerwear ? { ...loadout.outerwear } : null,
    feet: loadout.feet ? { ...loadout.feet } : null,
    wateringTool: { ...loadout.wateringTool },
    harvestTool: { ...loadout.harvestTool },
    rod: { ...loadout.rod }
  };
}

/**
 * Shared world/preview assembler. It mounts independent loader clones onto
 * bind-frame anchors and never mutates the cached character or equipment GLB.
 */
export class CharacterEquipmentAssembler {
  private readonly anchors: Record<"head" | "outerwear" | "foot-left" | "foot-right", THREE.Object3D>;
  private readonly starterLayers = new Map<WearableSlot, StarterLayerControl>();
  private readonly loadModel: (assetId: AssetId) => Promise<THREE.Group>;
  private readonly wearables = new Map<WearableSlot, THREE.Object3D[]>();
  private readonly tools = new Map<CharacterToolKey, THREE.Group>();
  private readonly resolvedVisuals = new Map<VisualSlot, string | null>();
  private readonly failedVisuals = new Map<VisualSlot, FailedVisual>();
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly maxLoadAttempts: number;
  private readonly now: () => number;
  private generation = 0;
  private disposed = false;
  private requestedSignature = "";
  private latestLoadout: CharacterVisualLoadout | null = null;
  private syncPromise: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly character: THREE.Group,
    private readonly options: CharacterEquipmentAssemblerOptions = {}
  ) {
    this.loadModel = options.loadModel ?? ((assetId) => AssetLoader.loadModel(assetId));
    this.retryBaseDelayMs = Math.max(1, options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS);
    this.retryMaxDelayMs = Math.max(this.retryBaseDelayMs, options.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS);
    this.maxLoadAttempts = Math.max(1, options.maxLoadAttempts ?? DEFAULT_MAX_LOAD_ATTEMPTS);
    this.now = options.now ?? Date.now;
    const rig = resolveHumanoidRig(character);
    const head = rig.bones.head;
    const chest = rig.bones.chest ?? rig.bones.spine;
    const leftFoot = rig.bones.foot_left;
    const rightFoot = rig.bones.foot_right;
    if (!head || !chest || !leftFoot || !rightFoot) {
      throw new Error("[CharacterEquipmentAssembler] Player rig lacks wearable attachment bones");
    }
    // Build these while the freshly loaded model is still in bind pose. Their
    // target transforms are authored in the character frame, not guessed from
    // each bone's local axis convention.
    this.anchors = {
      head: this.createBindFrameAnchor(head, "equipment_head_anchor", new THREE.Vector3(0, 1.78, 0)),
      outerwear: this.createBindFrameAnchor(chest, "equipment_body_anchor", new THREE.Vector3(0, 1.12, 0)),
      // The rig's Foot.L sits at character-frame +X (Foot.R at -X), so each
      // anchor must share its bone's side or the boots render on crossed legs.
      "foot-left": this.createBindFrameAnchor(leftFoot, "equipment_foot_left_anchor", new THREE.Vector3(0.13, 0.10, 0)),
      "foot-right": this.createBindFrameAnchor(rightFoot, "equipment_foot_right_anchor", new THREE.Vector3(-0.13, 0.10, 0))
    };
    try {
      for (const slot of ["head", "outerwear", "feet"] as const) {
        this.starterLayers.set(slot, this.createStarterLayerControl(slot));
      }
    } catch (error) {
      for (const control of this.starterLayers.values()) control.dispose();
      for (const anchor of Object.values(this.anchors)) anchor.removeFromParent();
      throw error;
    }
  }

  public async sync(loadout: CharacterVisualLoadout): Promise<void> {
    if (this.disposed) return;
    const nextLoadout = copyLoadout(loadout);
    const signature = JSON.stringify(nextLoadout);
    const changed = signature !== this.requestedSignature;
    this.latestLoadout = nextLoadout;

    if (changed) {
      this.requestedSignature = signature;
      this.failedVisuals.clear();
      this.clearRetryTimer();
    } else {
      if (this.syncPromise) {
        await this.syncPromise;
        return;
      }
      if (this.failedVisuals.size === 0) return;
      const retryDue = [...this.failedVisuals.values()].some(
        (failure) => failure.attempts < this.maxLoadAttempts && failure.retryAtMs <= this.now()
      );
      if (!retryDue) {
        this.scheduleRetry();
        return;
      }
    }

    const generation = ++this.generation;
    this.syncPromise = Promise.all([
      this.syncWearable("head", nextLoadout.head, generation),
      this.syncWearable("outerwear", nextLoadout.outerwear, generation),
      this.syncWearable("feet", nextLoadout.feet, generation),
      this.syncTool("water", nextLoadout.wateringTool, generation),
      this.syncTool("sickle", nextLoadout.harvestTool, generation),
      this.syncTool("rod", nextLoadout.rod, generation)
    ]).then(() => undefined).finally(() => {
      if (generation !== this.generation) return;
      this.syncPromise = null;
      this.options.onSyncSettled?.([...new Set(
        [...this.failedVisuals.values()].map((failure) => failure.assetId)
      )]);
      this.scheduleRetry();
    });
    await this.syncPromise;
  }

  public setToolVisible(key: CharacterToolKey, visible: boolean): void {
    const tool = this.tools.get(key);
    if (tool) tool.visible = visible;
  }

  public hideTools(): void {
    for (const tool of this.tools.values()) tool.visible = false;
  }

  public dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.clearRetryTimer();
    for (const objects of this.wearables.values()) for (const object of objects) object.removeFromParent();
    for (const [key, object] of this.tools) {
      object.removeFromParent();
      this.options.onToolChanged?.(key, null);
    }
    for (const control of this.starterLayers.values()) control.dispose();
    for (const anchor of Object.values(this.anchors)) anchor.removeFromParent();
    this.wearables.clear();
    this.tools.clear();
    this.starterLayers.clear();
    this.failedVisuals.clear();
  }

  private createBindFrameAnchor(
    bone: THREE.Object3D,
    name: string,
    characterPosition: THREE.Vector3
  ): THREE.Object3D {
    this.character.updateWorldMatrix(true, true);
    bone.updateWorldMatrix(true, false);
    const desiredWorld = new THREE.Matrix4().multiplyMatrices(
      this.character.matrixWorld,
      new THREE.Matrix4().makeTranslation(characterPosition.x, characterPosition.y, characterPosition.z)
    );
    const local = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().copy(bone.matrixWorld).invert(), desiredWorld);
    const anchor = new THREE.Object3D();
    anchor.name = name;
    local.decompose(anchor.position, anchor.quaternion, anchor.scale);
    bone.add(anchor);
    return anchor;
  }

  private createStarterLayerControl(slot: WearableSlot): StarterLayerControl {
    const starter = STARTER_EQUIPMENT_IDS
      .map((id) => ContentRegistry.equipment.get(id))
      .find((definition) => definition?.slot === slot);
    const binding = starter?.presentation.characterBaseLayer;
    if (!starter || !binding) {
      throw new Error(`[CharacterEquipmentAssembler] Missing starter base-layer binding for ${slot}`);
    }
    const targetMaterials = new Set(binding.materialNames);
    const foundMaterials = new Set<string>();
    const swaps: BaseLayerMaterialSwap[] = [];
    try {
      for (const nodeName of binding.nodeNames) {
        const node = this.character.getObjectByName(nodeName);
        if (!node) throw new Error(`[CharacterEquipmentAssembler] Player is missing ${nodeName}`);
        node.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          const original = mesh.material;
          const materials = Array.isArray(original) ? original : [original];
          const regionMaterials: THREE.Material[] = [];
          const next = materials.map((material) => {
            if (!targetMaterials.has(material.name)) return material;
            foundMaterials.add(material.name);
            const clone = material.clone();
            regionMaterials.push(clone);
            return clone;
          });
          if (regionMaterials.length === 0) return;
          mesh.material = Array.isArray(original) ? next : next[0];
          swaps.push({ mesh, original, regionMaterials });
        });
      }
      const missing = binding.materialNames.filter((name) => !foundMaterials.has(name));
      if (missing.length > 0) {
        throw new Error(`[CharacterEquipmentAssembler] ${starter.id} is missing material region ${missing.join(", ")}`);
      }
    } catch (error) {
      for (const swap of swaps) {
        swap.mesh.material = swap.original;
        for (const material of swap.regionMaterials) material.dispose();
      }
      throw error;
    }
    return {
      setVisible: (visible) => {
        for (const swap of swaps) {
          for (const material of swap.regionMaterials) material.visible = visible;
        }
      },
      dispose: () => {
        for (const swap of swaps) {
          swap.mesh.material = swap.original;
          for (const material of swap.regionMaterials) material.dispose();
        }
      }
    };
  }

  private clearWearable(slot: WearableSlot): void {
    for (const object of this.wearables.get(slot) ?? []) object.removeFromParent();
    this.wearables.delete(slot);
  }

  private async syncWearable(
    slot: WearableSlot,
    visual: CharacterVisualAsset | null,
    generation: number
  ): Promise<void> {
    const requestedVisual = visualKey(visual);
    if (this.resolvedVisuals.get(slot) === requestedVisual) {
      this.failedVisuals.delete(slot);
      return;
    }
    if (!visual) {
      this.clearWearable(slot);
      this.starterLayers.get(slot)?.setVisible(true);
      this.resolvedVisuals.set(slot, null);
      this.failedVisuals.delete(slot);
      return;
    }
    try {
      const payload = await this.loadModel(visual.assetId as AssetId);
      if (this.disposed || generation !== this.generation) return;
      const mounted: THREE.Object3D[] = [];
      if (slot === "feet") {
        const left = payload.getObjectByName("wearable_foot_left");
        const right = payload.getObjectByName("wearable_foot_right");
        if (!left || !right) throw new Error(`${visual.assetId} is missing paired foot anchors`);
        left.removeFromParent();
        right.removeFromParent();
        this.mountWearablePart(left, this.anchors["foot-left"], visual.scale);
        this.mountWearablePart(right, this.anchors["foot-right"], visual.scale);
        mounted.push(left, right);
      } else {
        const part = payload.getObjectByName(WEARABLE_NODE[slot]);
        if (!part) throw new Error(`${visual.assetId} is missing ${WEARABLE_NODE[slot]}`);
        part.removeFromParent();
        this.mountWearablePart(part, this.anchors[slot], visual.scale);
        mounted.push(part);
      }
      this.clearWearable(slot);
      this.wearables.set(slot, mounted);
      this.starterLayers.get(slot)?.setVisible(false);
      this.resolvedVisuals.set(slot, requestedVisual);
      this.failedVisuals.delete(slot);
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      this.recordFailure(slot, requestedVisual!, visual.assetId);
      this.options.onAssetError?.(visual.assetId, error);
      // Keep the previous visible item. Asset failure is presentation-only.
    }
  }

  private mountWearablePart(part: THREE.Object3D, anchor: THREE.Object3D, scale?: number): void {
    part.position.set(0, 0, 0);
    part.quaternion.identity();
    part.scale.setScalar(scale ?? 1);
    part.userData.dynamicPresentation = true;
    this.options.configureObject?.(part);
    anchor.add(part);
  }

  private async syncTool(
    key: CharacterToolKey,
    visual: CharacterVisualAsset,
    generation: number
  ): Promise<void> {
    const requestedVisual = visualKey(visual)!;
    if (this.resolvedVisuals.get(key) === requestedVisual) {
      this.failedVisuals.delete(key);
      return;
    }
    try {
      const object = await this.loadModel(visual.assetId as AssetId);
      if (this.disposed || generation !== this.generation) return;
      const socket = this.character.getObjectByName(TOOL_SOCKET);
      if (!socket) throw new Error(`Player is missing ${TOOL_SOCKET}`);
      applyEquipmentSocketPose(object, visual.assetId, visual.scale);
      object.name = `cosmetic_${key}`;
      object.visible = false;
      object.userData.socketBaseQuaternion = object.quaternion.clone();
      object.userData.dynamicPresentation = true;
      this.options.configureObject?.(object);
      socket.add(object);
      const previous = this.tools.get(key);
      previous?.removeFromParent();
      this.tools.set(key, object);
      this.resolvedVisuals.set(key, requestedVisual);
      this.failedVisuals.delete(key);
      this.options.onToolChanged?.(key, object);
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      this.recordFailure(key, requestedVisual, visual.assetId);
      this.options.onAssetError?.(visual.assetId, error);
    }
  }

  private recordFailure(slot: VisualSlot, requestedVisual: string, assetId: string): void {
    const previous = this.failedVisuals.get(slot);
    const attempts = previous?.visualKey === requestedVisual ? previous.attempts + 1 : 1;
    const delay = Math.min(this.retryMaxDelayMs, this.retryBaseDelayMs * (2 ** (attempts - 1)));
    this.failedVisuals.set(slot, {
      visualKey: requestedVisual,
      assetId,
      attempts,
      retryAtMs: this.now() + delay
    });
  }

  private scheduleRetry(): void {
    if (this.disposed || this.retryTimer || this.syncPromise || !this.latestLoadout) return;
    const retryable = [...this.failedVisuals.values()]
      .filter((failure) => failure.attempts < this.maxLoadAttempts)
      .sort((a, b) => a.retryAtMs - b.retryAtMs);
    if (retryable.length === 0) return;
    const delay = Math.max(0, retryable[0].retryAtMs - this.now());
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.disposed && this.latestLoadout) void this.sync(this.latestLoadout);
    }, delay);
  }

  private clearRetryTimer(): void {
    if (!this.retryTimer) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}
