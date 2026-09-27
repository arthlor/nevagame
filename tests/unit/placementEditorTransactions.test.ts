import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Object3D, PerspectiveCamera, Vector3 } from "three";
vi.mock("../../src/world/WorldEnvironmentLayout", () => ({ isPlacementFootprintStable: () => true }));
vi.mock("../../src/layout-editor/TerrainSnapping", () => ({ TerrainSnappingSystem: class {
  getTerrainMeshes() { return []; }
  snapToSurface(x: number, z: number) { return { point: new Vector3(x, 0, z), isSlopeAcceptable: true }; }
} }));
import { PlacementEditor } from "../../src/app/PlacementEditor";
import { createFarmStructureTag, LAYOUT_EDIT_USERDATA_KEY } from "../../src/layout-editor/layoutEdit";
import type { WorldScene } from "../../src/render/scene/WorldScene";

const camera = new PerspectiveCamera();
function fixture() {
  const object = new Object3D();
  object.position.set(2, 0, 3);
  object.userData[LAYOUT_EDIT_USERDATA_KEY] = { ...createFarmStructureTag("struct.workbench"), kind: "interaction-placement", rotationWriteMode: "direct" };
  const scene = {
    getTerrainMeshes: () => [], pickLayoutEditable: () => object, findLayoutEditable: () => object,
    raycastTerrain: (_camera: unknown, pointer: { x: number; y: number }) => new Vector3(pointer.x, 0, pointer.y),
    highlightLayoutEdit: vi.fn(), updateLayoutEditHighlight: vi.fn(), followLayoutEditGrounding: vi.fn()
  };
  const sync = vi.fn(), collision = vi.fn();
  const editor = new PlacementEditor(scene as unknown as WorldScene, () => {}, sync, collision);
  editor.setActive(true);
  const input = (x: number, z: number, primaryPressed = false, primaryHeld = true) =>
    editor.sync({ camera, pointerNdc: { x, y: z }, primaryPressed, primaryHeld, shiftHeld: true });
  return { object, editor, input, sync, collision };
}

beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })));
afterEach(() => vi.unstubAllGlobals());

describe("layout editor pose transactions", () => {
  it("keeps the grabbed point under the pointer without snapping the model origin to the cursor", () => {
    const f = fixture(); f.input(4, 5, true); f.input(10, 11);
    expect(f.object.position.x).toBe(8); expect(f.object.position.z).toBe(9);
  });
  it.each(["escape", "exit"])("restores mesh, interactions and collision when %s cancels a preview", mode => {
    const f = fixture(); f.input(2, 3, true); f.input(12, 13);
    if (mode === "escape") f.editor.handleEscape(); else f.editor.setActive(false);
    expect(f.object.position.toArray()).toEqual([2, 0, 3]);
    expect(f.sync.mock.lastCall?.[1]).toMatchObject({ x: 2, z: 3 });
    expect(f.collision).toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("rolls back a rejected source write instead of leaving invisible unsaved gameplay changes", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "Write rejected" }) } as Response);
    const f = fixture(); f.input(2, 3, true); f.input(12, 13); f.input(12, 13, false, false);
    await vi.waitFor(() => expect(f.editor.hudState().status).toContain("placement restored"));
    expect(f.object.position.toArray()).toEqual([2, 0, 3]);
    expect(f.sync.mock.lastCall?.[1]).toMatchObject({ x: 2, z: 3 });
    expect(f.editor.getHistoryManager().getUndoStackSize()).toBe(0);
  });
  it("writes once per drag and updates gameplay and collision through undo and redo", async () => {
    const f = fixture(); f.input(2, 3, true); f.input(7, 8); f.input(12, 13); f.input(12, 13, false, false);
    await vi.waitFor(() => expect(f.editor.getHistoryManager().canUndo()).toBe(true));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await f.editor.undo()).toBe(true);
    expect(f.object.position.toArray()).toEqual([2, 0, 3]);
    expect(f.sync.mock.lastCall?.[1]).toMatchObject({ x: 2, z: 3 });
    expect(await f.editor.redo()).toBe(true);
    expect(f.object.position.toArray()).toEqual([12, 0, 13]);
    expect(f.sync.mock.lastCall?.[1]).toMatchObject({ x: 12, z: 13 });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("keeps Place active while a source write is in flight", async () => {
    let release!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const f = fixture(); f.input(2, 3, true); f.input(12, 13); f.input(12, 13, false, false);
    f.editor.setActive(false); expect(f.editor.isActive()).toBe(true);
    release({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response);
    await vi.waitFor(() => expect(f.editor.getHistoryManager().canUndo()).toBe(true));
    f.editor.setActive(false); expect(f.editor.isActive()).toBe(false);
    expect(f.object.position.x).toBe(12);
  });
  it("cannot duplicate or delete a gameplay workshop", async () => {
    const f = fixture(); f.input(2, 3, true); f.input(2, 3, false, false);
    f.editor.copySelection(); await f.editor.deleteSelection();
    expect(fetch).not.toHaveBeenCalled();
  });
});
