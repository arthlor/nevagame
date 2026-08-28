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
import { WorldLayout } from "../world/WorldLayout";
import { isPlacementFootprintStable } from "../world/WorldEnvironmentLayout";
import type { WorldScene } from "../render/scene/WorldScene";

export interface PlacementEditorHudState {
  active: boolean;
  selected: LayoutEditHudSelection | null;
  status: string | null;
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

  public constructor(
    private readonly worldScene: WorldScene,
    private readonly onChange: () => void,
    private readonly onLiveSync: (tag: LayoutEditTag, commit: LayoutEditCommit) => void,
    private readonly onStaticWorldChanged: () => void
  ) {}

  public isActive(): boolean {
    return this.active;
  }

  public hudState(): PlacementEditorHudState {
    return {
      active: this.active,
      selected: this.selectionHud(),
      status: this.status
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
    }
    this.status = active
      ? "LMB drag · Q/E rotate · ⌘/Ctrl+C/V copy/paste · Delete · drop writes TypeScript · F2 exits"
      : null;
    this.onChange();
  }

  public toggle(): void {
    this.setActive(!this.active);
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
    const commit: LayoutEditCommit = {
      kind: tag.kind,
      id: tag.id,
      x: object.position.x,
      z: object.position.z,
      rotationY: object.rotation.y,
      remove: true
    };
    this.commitInFlight = true;
    this.status = `Deleting ${tag.id}…`;
    this.onChange();
    try {
      const result = await this.postLayoutEdit(commit);
      if (!result.ok) {
        this.status = result.error ?? `Delete failed (${result.status})`;
        this.onChange();
        return;
      }
      if (this.clipboard?.tag.id === tag.id) this.clipboard = null;
      if (this.pendingCommitObject === object) this.pendingCommitObject = null;
      this.worldScene.removeLayoutEditable(object);
      if (this.selected === object) this.selected = null;
      this.grabbing = false;
      this.dirty = false;
      this.status = `Deleted ${tag.id}`;
      this.onStaticWorldChanged();
    } catch (error) {
      this.status = error instanceof Error ? error.message : "Delete failed";
    } finally {
      this.flushQueuedLayoutEdits(false);
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
    const y = clip.tag.indoor ? clip.y : WorldLayout.terrainHeight(x, z) + clip.tag.yOffset;
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
      y: clip.tag.indoor ? y : undefined,
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
      this.flushQueuedLayoutEdits(false);
    }
  }

  public handleKeyDown(code: string, shiftHeld: boolean): void {
    if (!this.active || this.commitInFlight || (code !== "KeyQ" && code !== "KeyE")) return;
    this.rotateHeld.add(code);
    this.nudgeRotation(code === "KeyQ" ? -1 : 1, shiftHeld);
  }

  public handleKeyUp(code: string): void {
    if (code === "KeyQ" || code === "KeyE") this.rotateHeld.delete(code);
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
      if (this.dirty) void this.commitSelected();
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
    this.worldScene.highlightLayoutEdit(picked);
    this.status = null;
    this.onChange();
  }

  private dragTo(input: PlacementEditorSync): void {
    const object = this.selected;
    const tag = object ? readLayoutEditTag(object) : null;
    if (!object || !tag) return;
    const hit = tag.indoor
      ? this.worldScene.raycastHorizontalPlane(input.camera, input.pointerNdc, object.position.y)
      : this.worldScene.raycastTerrain(input.camera, input.pointerNdc);
    if (!hit) return;
    const x = snapWorldCoord(hit.x, input.shiftHeld);
    const z = snapWorldCoord(hit.z, input.shiftHeld);
    const y = tag.indoor ? object.position.y : WorldLayout.terrainHeight(x, z) + tag.yOffset;
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
    if (!this.grabbing) void this.commitSelected();
  }

  private async commitSelected(): Promise<void> {
    if (this.selected) await this.commitObject(this.selected);
  }

  private async commitObject(object: Object3D): Promise<void> {
    const tag = readLayoutEditTag(object);
    if (!tag || this.commitInFlight) return;
    if (!footprintIsStable(tag, object.position.x, object.position.z, object.rotation.y)) {
      this.status = footprintStatus(tag, object.position.x, object.position.z, object.rotation.y)
        ?? "Unstable footprint — move onto flatter ground";
      this.onChange();
      return;
    }
    let wrote = false;
    const commit: LayoutEditCommit = {
      kind: tag.kind,
      id: tag.id,
      x: object.position.x,
      z: object.position.z,
      rotationY: object.rotation.y,
      y: tag.indoor ? object.position.y : undefined
    };
    this.commitInFlight = true;
    this.status = `Writing ${tag.id}…`;
    this.onChange();
    try {
      const result = await this.postLayoutEdit(commit);
      if (!result.ok) {
        this.status = result.error ?? `Write failed (${result.status})`;
        this.onChange();
        return;
      }
      this.onLiveSync(tag, commit);
      this.onStaticWorldChanged();
      if (this.selected === object) {
        this.dirty = object.position.x !== commit.x
          || object.position.z !== commit.z
          || object.rotation.y !== commit.rotationY;
      }
      this.status = `Wrote ${tag.id} → ${tag.sourceFile}`;
      wrote = true;
    } catch (error) {
      this.status = error instanceof Error ? error.message : "Write failed";
    } finally {
      this.flushQueuedLayoutEdits(wrote);
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

  private flushQueuedLayoutEdits(wrote: boolean): void {
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
      void this.commitObject(object);
      return;
    }
    if (wrote && this.dirty && this.selected) void this.commitSelected();
  }

  private emitLiveSync(object: Object3D, tag: LayoutEditTag): void {
    this.onLiveSync(tag, {
      kind: tag.kind,
      id: tag.id,
      x: object.position.x,
      z: object.position.z,
      rotationY: object.rotation.y,
      y: tag.indoor ? object.position.y : undefined
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
    grounding?: readonly [number, number];
    practicalLight?: boolean;
    propType?: string;
  }
): LayoutEditTag {
  const extras = {
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
