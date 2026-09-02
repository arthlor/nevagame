import type { Camera } from "three";
import type { Object3D } from "three";

import {
  LAYOUT_EDITOR_COMMIT_PATH,
  createAuthoredDetailTag,
  createFarmFenceTag,
  createFarmPropTag,
  createInteriorPropTag,
  layoutEditCanDelete,
  layoutEditCanDuplicate,
  layoutEditWarningMessage,
  readLayoutEditTag,
  snapRadians,
  snapWorldCoord,
  type LayoutEditCommit,
  type LayoutEditHudSelection,
  type LayoutEditKind,
  type LayoutEditTag
} from "../layout-editor/layoutEdit";
import { isPlacementFootprintStable } from "../world/WorldEnvironmentLayout";
import type { WorldScene } from "../render/scene/WorldScene";
import { TerrainSnappingSystem } from "../layout-editor/TerrainSnapping";
import {
  HistoryManager,
  type EditorPoseState
} from "../layout-editor/history/HistoryManager";

export interface PlacementEditorHudState {
  active: boolean;
  selected: LayoutEditHudSelection | null;
  status: string | null;
  canUndo: boolean;
  canRedo: boolean;
}

interface PlacementEditorSync {
  pointerNdc: { x: number; y: number };
  primaryHeld: boolean;
  primaryPressed: boolean;
  shiftHeld: boolean;
  camera: Camera;
}

export class PlacementEditor {
  private active = false;
  private selected: Object3D | null = null;
  private grabbing = false;
  private dirty = false;
  private status: string | null = null;
  private commitInFlight = false;
  private pendingDelete = false;
  private pendingPasteCount = 0;
  private pendingDeleteObject: Object3D | null = null;
  private pendingCommitObject: Object3D | null = null;
  private pasteCount = 0;
  private clipboard: {
    object: Object3D;
    tag: LayoutEditTag;
    x: number;
    y: number;
    z: number;
    rotationY: number;
    scale: readonly [number, number, number];
  } | null = null;
  private readonly rotateHeld = new Set<"KeyQ" | "KeyE">();

  private readonly historyManager = new HistoryManager(100);
  private readonly terrainSnapper = new TerrainSnappingSystem();

  public constructor(
    private readonly worldScene: WorldScene,
    private readonly onChange: () => void,
    private readonly onLiveSync: (tag: LayoutEditTag, commit: LayoutEditCommit) => void,
    private readonly onStaticWorldChanged: () => void
  ) {
    this.historyManager.onDirtyChange(() => {
      this.onChange();
    });
  }

  public isActive(): boolean {
    return this.active;
  }

  public getHistoryManager(): HistoryManager {
    return this.historyManager;
  }

  public getTerrainSnapping(): TerrainSnappingSystem {
    return this.terrainSnapper;
  }

  public hudState(): PlacementEditorHudState {
    return {
      active: this.active,
      selected: this.selectionHud(),
      status: this.status,
      canUndo: this.historyManager.canUndo(),
      canRedo: this.historyManager.canRedo()
    };
  }

  public setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (!active) {
      const object = this.selected;
      const tag = object ? readLayoutEditTag(object) : null;
      if (object && tag) this.emitLiveSync(object, tag);
      this.onStaticWorldChanged();
      this.pendingPasteCount = 0;
      this.pendingCommitObject = null;
      this.clearSelection();
    } else {
      const terrains = this.worldScene.getTerrainMeshes();
      const registered = this.terrainSnapper.getTerrainMeshes();
      if (
        terrains.length > 0
        && (terrains.length !== registered.length || terrains.some((terrain, index) => terrain !== registered[index]))
      ) {
        this.terrainSnapper.registerTerrains(terrains);
      }
    }
    this.status = active
      ? "LMB drag · Q/E rotate · ⌘/Ctrl+Z/Y undo/redo · ⌘/Ctrl+C/V copy/paste · Delete · drop writes TypeScript · F2 exits"
      : null;
    this.onChange();
  }

  public toggle(): void {
    this.setActive(!this.active);
  }

  public async undo(): Promise<boolean> {
    if (!this.active || this.commitInFlight || !this.historyManager.canUndo()) return false;
    try {
      const success = await this.historyManager.undo();
      if (success) {
        this.status = "Undone";
        this.onChange();
      }
      return success;
    } catch (error) {
      this.status = error instanceof Error ? error.message : "Undo failed";
      this.onChange();
      return false;
    } finally {
      this.flushQueuedLayoutEdits();
    }
  }

  public async redo(): Promise<boolean> {
    if (!this.active || this.commitInFlight || !this.historyManager.canRedo()) return false;
    try {
      const success = await this.historyManager.redo();
      if (success) {
        this.status = "Redone";
        this.onChange();
      }
      return success;
    } catch (error) {
      this.status = error instanceof Error ? error.message : "Redo failed";
      this.onChange();
      return false;
    } finally {
      this.flushQueuedLayoutEdits();
    }
  }

  /** Returns true when Escape was consumed to deselect. */
  public handleEscape(): boolean {
    if (!this.active || !this.selected) return false;
    const object = this.selected;
    const tag = readLayoutEditTag(object);
    if (tag) this.emitLiveSync(object, tag);
    this.onStaticWorldChanged();
    this.clearSelection();
    this.onChange();
    return true;
  }

  public copySelection(): void {
    if (!this.active) return;
    if (this.commitInFlight) {
      this.status = "Waiting to copy…";
      this.onChange();
      return;
    }
    const object = this.selected;
    const tag = object ? readLayoutEditTag(object) : null;
    if (!object || !tag) {
      this.status = "Select a crate, tree, fence, or prop to copy";
      this.onChange();
      return;
    }
    if (!layoutEditCanDuplicate(tag.kind)) {
      this.status = `Can't copy ${tag.id} — unique gameplay object`;
      this.onChange();
      return;
    }
    this.clipboard = {
      object,
      tag: {
        ...tag,
        catalogAssetId: tag.catalogAssetId
          ?? (typeof object.userData.assetId === "string" ? object.userData.assetId : undefined)
      },
      x: object.position.x,
      y: object.position.y,
      z: object.position.z,
      rotationY: object.rotation.y,
      scale: [object.scale.x, object.scale.y, object.scale.z]
    };
    this.pasteCount = 0;
    this.status = `Copied ${tag.id}`;
    this.onChange();
  }

  public duplicateSelection(): void {
    if (!this.active) return;
    if (this.commitInFlight) {
      if (this.clipboard) {
        this.pendingPasteCount += 1;
        this.status = "Waiting to paste…";
        this.onChange();
      }
      return;
    }
    const selectedId = this.selected ? readLayoutEditTag(this.selected)?.id : null;
    this.copySelection();
    if (selectedId && this.clipboard?.tag.id === selectedId) void this.pasteClipboard();
  }

  public async deleteSelection(): Promise<void> {
    if (!this.active) return;
    if (this.commitInFlight) {
      this.pendingDelete = true;
      this.pendingDeleteObject = this.selected ?? this.pendingDeleteObject;
      this.status = "Waiting to delete…";
      this.onChange();
      return;
    }
    const object = this.pendingDeleteObject ?? this.selected;
    this.pendingDelete = false;
    this.pendingDeleteObject = null;
    const tag = object ? readLayoutEditTag(object) : null;
    if (!object || !tag) {
      this.status = "Select a crate, tree, fence, or prop to delete";
      this.onChange();
      return;
    }
    if (!layoutEditCanDelete(tag.kind)) {
      this.status = `Can't delete ${tag.id} — unique gameplay object`;
      this.onChange();
      return;
    }

    const deleteCommit: LayoutEditCommit = {
      kind: tag.kind,
      id: tag.id,
      x: object.position.x,
      z: object.position.z,
      rotationY: object.rotation.y,
      remove: true
    };

    const restoreCommit: LayoutEditCommit = {
      kind: tag.kind,
      id: tag.id,
      x: object.position.x,
      z: object.position.z,
      rotationY: object.rotation.y,
      y: tag.indoor || tag.fixedY !== undefined ? object.position.y : undefined,
      scale: [object.scale.x, object.scale.y, object.scale.z],
      grounding: tag.grounding,
      practicalLight: tag.practicalLight,
      propType: tag.propType,
      assetId: tag.catalogAssetId,
      restore: true
    };

    let liveObject: Object3D | null = object;

    try {
      await this.historyManager.execute({
        description: `Delete ${tag.id}`,
        execute: async () => {
          this.commitInFlight = true;
          this.status = `Deleting ${tag.id}…`;
          this.onChange();
          try {
            const result = await this.postLayoutEdit(deleteCommit);
            if (!result.ok) {
              throw new Error(result.error ?? `Delete failed (${result.status})`);
            }
            const target = this.worldScene.findLayoutEditable(tag.id) ?? liveObject;
            if (target) this.worldScene.removeLayoutEditable(target);
            if (this.selected === target) this.selected = null;
            if (this.pendingCommitObject === target) this.pendingCommitObject = null;
            liveObject = null;
            this.grabbing = false;
            this.dirty = false;
            this.status = `Deleted ${tag.id}`;
            this.onStaticWorldChanged();
          } finally {
            this.commitInFlight = false;
            this.onChange();
          }
        },
        undo: async () => {
          this.commitInFlight = true;
          this.status = `Restoring ${tag.id}…`;
          this.onChange();
          try {
            const result = await this.postLayoutEdit(restoreCommit);
            if (!result.ok) {
              throw new Error(result.error ?? `Restore failed (${result.status})`);
            }
            try {
              liveObject = await this.worldScene.duplicateLayoutEditable(null, tag, {
                x: restoreCommit.x,
                y: restoreCommit.y ?? 0,
                z: restoreCommit.z,
                rotationY: restoreCommit.rotationY,
                scale: restoreCommit.scale ?? [1, 1, 1]
              });
            } catch (error) {
              await this.rollbackPastedId(tag.kind, tag.id, {
                x: restoreCommit.x,
                z: restoreCommit.z,
                rotationY: restoreCommit.rotationY
              });
              throw error;
            }
            this.status = `Restored ${tag.id}`;
            this.onStaticWorldChanged();
          } finally {
            this.commitInFlight = false;
            this.onChange();
          }
        }
      });
    } catch (error) {
      this.status = error instanceof Error ? error.message : "Delete failed";
    } finally {
      this.flushQueuedLayoutEdits();
    }
  }

  public async pasteClipboard(): Promise<void> {
    if (!this.active) return;
    if (this.commitInFlight) {
      if (this.clipboard) {
        this.pendingPasteCount += 1;
        this.status = "Waiting to paste…";
        this.onChange();
      }
      return;
    }
    if (!this.clipboard) {
      this.status = "Copy a crate, tree, fence, or prop first (⌘/Ctrl+C)";
      this.onChange();
      return;
    }
    const clip = this.clipboard;
    const pasteOffset = this.pasteCount + 1;
    const x = snapWorldCoord(clip.x + 1.5 * pasteOffset, false);
    const z = snapWorldCoord(clip.z, false);
    let y = clip.tag.fixedY ?? clip.y;
    if (!clip.tag.indoor && clip.tag.fixedY === undefined) {
      const snapped = this.terrainSnapper.snapToSurface(x, z, { yOffset: clip.tag.yOffset });
      if (!snapped.isSlopeAcceptable) {
        this.status = `Paste target slope is too steep (${snapped.slopeDegrees.toFixed(1)}°)`;
        this.onChange();
        return;
      }
      y = snapped.point.y;
    }
    const pasteKind: LayoutEditKind = clip.tag.kind === "environment-override"
      ? "authored-detail"
      : clip.tag.kind;
    if (!footprintIsStable(clip.tag, x, z, clip.rotationY)) {
      this.status = "Paste target has an unstable footprint — move the original first";
      this.onChange();
      return;
    }
    const commit: LayoutEditCommit = {
      kind: pasteKind,
      id: clip.tag.id,
      duplicateFrom: clip.tag.id,
      assetId: clip.tag.catalogAssetId,
      x,
      z,
      rotationY: clip.rotationY,
      y: clip.tag.indoor || clip.tag.fixedY !== undefined ? y : undefined,
      scale: clip.scale,
      grounding: clip.tag.grounding,
      practicalLight: clip.tag.practicalLight,
      propType: clip.tag.propType
    };
    this.commitInFlight = true;
    this.status = `Pasting ${clip.tag.id}…`;
    this.onChange();
    try {
      const result = await this.postLayoutEdit(commit);
      if (!result.ok || !result.id) {
        this.status = result.error ?? `Paste failed (${result.status})`;
        this.onChange();
        return;
      }
      const pastedId = result.id;
      const nextTag = tagForPastedKind(pasteKind, pastedId, {
        catalogAssetId: clip.tag.catalogAssetId,
        fixedY: clip.tag.fixedY,
        grounding: clip.tag.grounding,
        practicalLight: clip.tag.practicalLight,
        propType: clip.tag.propType
      });
      try {
        const source = this.worldScene.findLayoutEditable(clip.tag.id);
        const clone = await this.worldScene.duplicateLayoutEditable(source, nextTag, {
          x,
          y,
          z,
          rotationY: clip.rotationY,
          scale: clip.scale
        });
        let livePastedObject: Object3D | null = clone;
        const restoredPaste: LayoutEditCommit = {
          ...commit,
          id: pastedId,
          duplicateFrom: undefined,
          restore: true
        };
        const removePaste: LayoutEditCommit = {
          kind: pasteKind,
          id: pastedId,
          x,
          z,
          rotationY: clip.rotationY,
          remove: true
        };
        this.historyManager.recordExecuted({
          description: `Paste ${pastedId}`,
          execute: async () => {
            this.commitInFlight = true;
            this.status = `Restoring ${pastedId}…`;
            this.onChange();
            try {
              const restoreResult = await this.postLayoutEdit(restoredPaste);
              if (!restoreResult.ok) {
                throw new Error(restoreResult.error ?? `Restore failed (${restoreResult.status})`);
              }
              try {
                livePastedObject = await this.worldScene.duplicateLayoutEditable(null, nextTag, {
                  x,
                  y,
                  z,
                  rotationY: clip.rotationY,
                  scale: clip.scale
                });
              } catch (error) {
                await this.rollbackPastedId(pasteKind, pastedId, { x, z, rotationY: clip.rotationY });
                throw error;
              }
              if (this.active) {
                this.selected = livePastedObject;
                this.worldScene.highlightLayoutEdit(livePastedObject);
              }
              this.onStaticWorldChanged();
            } finally {
              this.commitInFlight = false;
              this.onChange();
            }
          },
          undo: async () => {
            this.commitInFlight = true;
            this.status = `Removing ${pastedId}…`;
            this.onChange();
            try {
              const removeResult = await this.postLayoutEdit(removePaste);
              if (!removeResult.ok) {
                throw new Error(removeResult.error ?? `Remove failed (${removeResult.status})`);
              }
              const target = this.worldScene.findLayoutEditable(pastedId) ?? livePastedObject;
              if (target) this.worldScene.removeLayoutEditable(target);
              if (this.selected === target) this.selected = null;
              livePastedObject = null;
              this.onStaticWorldChanged();
            } finally {
              this.commitInFlight = false;
              this.onChange();
            }
          }
        });
        this.pasteCount = pasteOffset;
        this.grabbing = false;
        this.dirty = false;
        if (this.active) {
          this.selected = clone;
          this.worldScene.highlightLayoutEdit(clone);
          this.status = `Pasted ${pastedId} → ${nextTag.sourceFile}`;
        } else {
          this.worldScene.highlightLayoutEdit(null);
        }
        this.onStaticWorldChanged();
      } catch (instantiateError) {
        const rolledBack = await this.rollbackPastedId(pasteKind, pastedId, {
          x,
          z,
          rotationY: clip.rotationY
        });
        const reason = instantiateError instanceof Error
          ? instantiateError.message
          : "live instance failed";
        this.status = rolledBack
          ? `Paste failed — ${reason}`
          : `Paste wrote ${pastedId} but the live instance failed; refresh or delete it`;
      }
    } catch (error) {
      this.status = error instanceof Error ? error.message : "Paste failed";
    } finally {
      this.flushQueuedLayoutEdits();
    }
  }

  public handleKeyDown(code: string, shiftHeld: boolean): void {
    if (!this.active || this.commitInFlight || (code !== "KeyQ" && code !== "KeyE")) return;
    if (this.rotateHeld.size === 0 && this.selected && !this.grabbing) {
      const tag = readLayoutEditTag(this.selected);
      if (tag) this.historyManager.beginDrag(tag.id, this.objectPose(this.selected));
    }
    this.rotateHeld.add(code);
    this.nudgeRotation(code === "KeyQ" ? -1 : 1, shiftHeld);
  }

  public handleKeyUp(code: string): void {
    if (code !== "KeyQ" && code !== "KeyE") return;
    this.rotateHeld.delete(code);
    if (this.rotateHeld.size === 0 && !this.grabbing && this.dirty && this.selected) {
      void this.finishPoseHistory(this.selected);
    }
  }

  public sync(input: PlacementEditorSync): void {
    if (!this.active) return;

    if (this.commitInFlight) {
      if (this.grabbing && !input.primaryHeld) {
        this.grabbing = false;
        this.onStaticWorldChanged();
        if (this.dirty && this.selected) this.pendingCommitObject = this.selected;
      }
      this.worldScene.updateLayoutEditHighlight();
      return;
    }

    if (input.primaryPressed) this.beginPick(input);
    else if (this.grabbing && input.primaryHeld) this.dragTo(input);
    if (this.grabbing && !input.primaryHeld) {
      this.grabbing = false;
      this.onStaticWorldChanged();
      if (this.selected) void this.finishPoseHistory(this.selected);
    }
    this.worldScene.updateLayoutEditHighlight();
  }

  private beginPick(input: PlacementEditorSync): void {
    const picked = this.worldScene.pickLayoutEditable(input.camera, input.pointerNdc);
    if (!picked) {
      this.clearSelection();
      this.onChange();
      return;
    }
    this.selected = picked;
    this.grabbing = true;
    this.dirty = false;
    const tag = readLayoutEditTag(picked);
    if (tag) {
      this.historyManager.beginDrag(tag.id, {
        x: picked.position.x,
        y: picked.position.y,
        z: picked.position.z,
        rotationY: picked.rotation.y
      });
    }
    this.worldScene.highlightLayoutEdit(picked);
    this.status = null;
    this.onChange();
  }

  private dragTo(input: PlacementEditorSync): void {
    const object = this.selected;
    const tag = object ? readLayoutEditTag(object) : null;
    if (!object || !tag) return;
    const hit = tag.indoor || tag.fixedY !== undefined
      ? this.worldScene.raycastHorizontalPlane(input.camera, input.pointerNdc, object.position.y)
      : this.worldScene.raycastTerrain(input.camera, input.pointerNdc);
    if (!hit) return;
    const x = snapWorldCoord(hit.x, input.shiftHeld);
    const z = snapWorldCoord(hit.z, input.shiftHeld);
    let y = tag.fixedY ?? object.position.y;
    if (!tag.indoor && tag.fixedY === undefined) {
      const snapped = this.terrainSnapper.snapToSurface(x, z, { yOffset: tag.yOffset });
      if (!snapped.isSlopeAcceptable) {
        this.status = `Slope too steep (${snapped.slopeDegrees.toFixed(1)}°)`;
        this.onChange();
        return;
      }
      y = snapped.point.y;
    }
    if (object.position.x === x && object.position.z === z) return;
    object.position.set(x, y, z);
    this.dirty = true;
    this.worldScene.highlightLayoutEdit(object);
    this.worldScene.followLayoutEditGrounding();
    this.status = footprintStatus(tag, x, z, object.rotation.y);
    this.emitLiveSync(object, tag);
    this.onChange();
  }

  private nudgeRotation(direction: number, fine: boolean): void {
    const object = this.selected;
    const tag = object ? readLayoutEditTag(object) : null;
    if (!object || !tag) return;
    object.rotation.y = snapRadians(object.rotation.y + direction * ((fine ? 5 : 15) * Math.PI) / 180, fine);
    this.dirty = true;
    this.worldScene.highlightLayoutEdit(object);
    this.worldScene.followLayoutEditGrounding();
    this.status = footprintStatus(tag, object.position.x, object.position.z, object.rotation.y);
    this.emitLiveSync(object, tag);
    this.onChange();
  }

  private objectPose(object: Object3D): EditorPoseState {
    return {
      x: object.position.x,
      y: object.position.y,
      z: object.position.z,
      rotationY: object.rotation.y
    };
  }

  private async finishPoseHistory(object: Object3D): Promise<void> {
    const tag = readLayoutEditTag(object);
    if (!tag) return;
    if (this.commitInFlight) {
      this.pendingCommitObject = object;
      return;
    }
    if (!footprintIsStable(tag, object.position.x, object.position.z, object.rotation.y)) {
      this.historyManager.cancelDrag(tag.id);
      this.status = footprintStatus(tag, object.position.x, object.position.z, object.rotation.y)
        ?? "Unstable footprint — move onto flatter ground";
      this.onChange();
      return;
    }
    try {
      const recorded = await this.historyManager.endDrag(
        tag.id,
        this.objectPose(object),
        (pose) => this.applyCommittedPose(tag.id, pose),
        `Move ${tag.id}`
      );
      if (recorded) this.status = `Wrote ${tag.id} → ${tag.sourceFile}`;
      this.dirty = false;
    } catch (error) {
      this.dirty = true;
      this.status = error instanceof Error ? error.message : "Write failed";
    } finally {
      this.onChange();
      this.flushQueuedLayoutEdits();
    }
  }

  private async applyCommittedPose(id: string, pose: EditorPoseState): Promise<void> {
    const object = this.worldScene.findLayoutEditable(id);
    const tag = object ? readLayoutEditTag(object) : null;
    if (!object || !tag) throw new Error(`Layout object ${id} is not available`);
    if (!footprintIsStable(tag, pose.x, pose.z, pose.rotationY)) {
      throw new Error(footprintStatus(tag, pose.x, pose.z, pose.rotationY) ?? "Unstable footprint");
    }
    const previous = this.objectPose(object);
    object.position.set(pose.x, pose.y ?? object.position.y, pose.z);
    object.rotation.y = pose.rotationY;
    const commit: LayoutEditCommit = {
      kind: tag.kind,
      id: tag.id,
      x: pose.x,
      z: pose.z,
      rotationY: pose.rotationY,
      y: tag.indoor || tag.fixedY !== undefined ? object.position.y : undefined
    };
    this.commitInFlight = true;
    this.status = `Writing ${tag.id}…`;
    this.onChange();
    try {
      const result = await this.postLayoutEdit(commit);
      if (!result.ok) throw new Error(result.error ?? `Write failed (${result.status})`);
      this.onLiveSync(tag, commit);
      this.onStaticWorldChanged();
      if (this.selected === object) {
        this.worldScene.highlightLayoutEdit(object);
        this.dirty = false;
      }
    } catch (error) {
      object.position.set(previous.x, previous.y ?? object.position.y, previous.z);
      object.rotation.y = previous.rotationY;
      this.emitLiveSync(object, tag);
      this.onStaticWorldChanged();
      throw error;
    } finally {
      this.commitInFlight = false;
      this.onChange();
    }
  }

  private async postLayoutEdit(commit: LayoutEditCommit): Promise<{
    ok: boolean;
    error?: string;
    id?: string;
    status: number;
  }> {
    const response = await fetch(LAYOUT_EDITOR_COMMIT_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(commit)
    });
    const body = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; id?: string };
    return {
      ok: Boolean(response.ok && body.ok),
      error: body.error,
      id: body.id,
      status: response.status
    };
  }

  private async rollbackPastedId(
    kind: LayoutEditKind,
    id: string,
    pose: { x: number; z: number; rotationY: number }
  ): Promise<boolean> {
    try {
      const result = await this.postLayoutEdit({
        kind,
        id,
        x: pose.x,
        z: pose.z,
        rotationY: pose.rotationY,
        remove: true
      });
      return result.ok;
    } catch {
      return false;
    }
  }

  private flushQueuedLayoutEdits(): void {
    this.commitInFlight = false;
    this.onChange();
    if (!this.active) return;
    if (this.pendingDelete) {
      this.pendingDelete = false;
      void this.deleteSelection();
      return;
    }
    if (this.pendingPasteCount > 0) {
      this.pendingPasteCount -= 1;
      void this.pasteClipboard();
      return;
    }
    if (this.pendingCommitObject) {
      const object = this.pendingCommitObject;
      this.pendingCommitObject = null;
      void this.finishPoseHistory(object);
      return;
    }
  }

  private emitLiveSync(object: Object3D, tag: LayoutEditTag): void {
    this.onLiveSync(tag, {
      kind: tag.kind,
      id: tag.id,
      x: object.position.x,
      z: object.position.z,
      rotationY: object.rotation.y,
      y: tag.indoor || tag.fixedY !== undefined ? object.position.y : undefined
    });
  }

  private selectionHud(): LayoutEditHudSelection | null {
    const object = this.selected;
    const tag = object ? readLayoutEditTag(object) : null;
    if (!object || !tag) return null;
    return {
      id: tag.id,
      kind: tag.kind,
      x: object.position.x,
      z: object.position.z,
      rotationY: object.rotation.y,
      sourceFile: tag.sourceFile,
      warning: tag.warning
    };
  }

  private clearSelection(): void {
    this.selected = null;
    this.grabbing = false;
    this.dirty = false;
    this.pendingDelete = false;
    this.pendingDeleteObject = null;
    this.worldScene.highlightLayoutEdit(null);
  }
}

export { layoutEditWarningMessage };

function footprintIsStable(tag: LayoutEditTag, x: number, z: number, rotationY: number): boolean {
  if (!tag.grounding) return true;
  return isPlacementFootprintStable({ x, z, rotationY, grounding: tag.grounding });
}

function footprintStatus(
  tag: LayoutEditTag,
  x: number,
  z: number,
  rotationY: number
): string | null {
  if (footprintIsStable(tag, x, z, rotationY)) return null;
  return "Unstable footprint — drop will not write. Move onto flatter ground.";
}

function tagForPastedKind(
  kind: LayoutEditKind,
  id: string,
  features: {
    catalogAssetId?: string;
    fixedY?: number;
    grounding?: readonly [number, number];
    practicalLight?: boolean;
    propType?: string;
  }
): LayoutEditTag {
  const extras = {
    fixedY: features.fixedY,
    grounding: features.grounding,
    practicalLight: features.practicalLight
  };
  if (kind === "farm-prop") {
    return {
      ...createFarmPropTag(id, features.catalogAssetId, {
        propType: features.propType,
        grounding: features.grounding,
        practicalLight: features.practicalLight
      })
    };
  }
  if (kind === "farm-fence") {
    return { ...createFarmFenceTag(id, features.catalogAssetId), ...extras };
  }
  if (kind === "interior-prop") {
    return { ...createInteriorPropTag(id, features.catalogAssetId), ...extras };
  }
  return createAuthoredDetailTag(id, features.catalogAssetId, extras);
}
