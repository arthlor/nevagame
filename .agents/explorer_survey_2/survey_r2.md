# Neva Tools v2.0 Survey Report: Subsystem 2 — Lossless AST Level & Placement Editor

> **Document Class:** Deep-Dive Investigation & Architectural Specification Survey  
> **Target Subsystem:** Subsystem 2 (Level & Placement Editor Tooling)  
> **Related Paths:** `tools/layout-editor/patchPlacement.ts`, `src/layout-editor/TerrainSnapping.ts`, `src/layout-editor/history/HistoryManager.ts`, `src/app/PlacementEditor.ts`, `src/world/*`, `tools/vite/layoutEditorPlugin.ts`  
> **Investigator:** Explorer 2 (Subagent Survey)  
> **Date:** 2026-08-30  

---

## 1. Executive Summary

This survey analyzes the architecture, existing codebase, and migration blueprint for **Subsystem 2: Lossless AST Level & Placement Editor** of the Neva Tools v2.0 infrastructure upgrade.

The in-game placement editor (the `F2` / `Place` DEV overlay) enables game designers and developers to interactively pose, duplicate, adjust, and delete published 3D catalog assets in the live Three.js viewport, writing canonical coordinate transformations directly back into allowlisted TypeScript source files.

### Key Investigation Takeaways
1. **Patcher Deficiencies**: `tools/layout-editor/patchPlacement.ts` currently uses 909 lines of manual bracket-counting (`extractBalanced`) and regular expression replacement. While it handles existing test cases, it lacks true AST-level AST token/whitespace preservation, does not perform atomic `.tmp` file renames, and lacks post-mutation syntax tree validation.
2. **Missing Terrain Snapping Module**: `src/layout-editor/TerrainSnapping.ts` does not exist. The client currently performs basic unaccelerated `THREE.Raycaster` queries against `terrainMesh` or relies on analytical mathematical sampling (`WorldLayout.terrainHeight`). A dedicated `TerrainSnappingSystem` powered by `three-mesh-bvh` with normal-matrix world alignment and mathematical fallback is required.
3. **Missing Undo/Redo & Drag Coalescing**: `src/layout-editor/history/HistoryManager.ts` does not exist. There is zero undo/redo support in `PlacementEditor.ts`, meaning any misclick, inadvertent drag, or accidental deletion is immediately committed without a local recovery path. Continuous pointer drags currently lack transactional coalescing.
4. **Dependency Gaps**: Neither `recast` (for lossless AST manipulation) nor `three-mesh-bvh` (for accelerated spatial queries) are declared in `package.json`.

---

## 2. Gap Analysis: Current Codebase vs Spec Requirements

| Component / Requirement | Existing Implementation | Spec Requirements (v2.0) | Gap Status |
| :--- | :--- | :--- | :--- |
| **AST Transformation Engine** | Custom regex, string slicing, and bracket-counter (`extractBalanced`) | Scoped AST transformer (`recast` + `@babel/parser` / TypeScript parser) | 🔴 **Major Gap** (Brittle string surgery; risk of AST corruption on complex syntax) |
| **Comment & Formatting Preservation** | Ad-hoc string replacement aiming to keep formatting | Native lossless AST reprinting via Recast (preserves comments, indentation, quotes, trivia) | 🔴 **Major Gap** |
| **Duplicate ID & Zero-Match Guarantees** | Implemented in parts via custom regex search | Strict scoping + invariant assertions: throws if `matchCount === 0` or `matchCount > 1` on update | 🟡 **Partial Gap** (Needs formal AST path scoping) |
| **Atomic File I/O** | Direct `fs.writeFileSync(absolute, contents)` | Write to `.tmp-${process.pid}` and replace via `fs.renameSync` | 🔴 **Missing** |
| **Post-Mutation Validation** | None (writes raw string to disk) | Re-parse emitted code with AST parser before disk commit | 🔴 **Missing** |
| **Terrain Snapping System** | Unaccelerated `WorldScene.raycastTerrain` + `WorldLayout.terrainHeight` | `src/layout-editor/TerrainSnapping.ts` using `three-mesh-bvh` + world normal matrix | 🔴 **Missing File** |
| **Command Pattern History** | None (no undo/redo) | `src/layout-editor/history/HistoryManager.ts` with `Command` interface | 🔴 **Missing File** |
| **Drag Coalescing** | None (discrete commits on pointerup, no command queue) | Transactional drag coalescing (`beginDrag` / `endDrag`) emitting single discrete command | 🔴 **Missing** |
| **Execution Guards** | Basic `commitInFlight` boolean in `PlacementEditor.ts` | Failure-safe history guard (`isExecuting` flag) popping stacks only on successful resolution | 🟡 **Partial** |

---

## 3. Subsystem 2 Technical Deep-Dive

### 3.1 Scoped Lossless AST Layout Patcher (`tools/layout-editor/patchPlacement.ts`)

#### 3.1.1 Toolchain Selection: Recast vs ts-morph vs TypeScript Compiler API vs Babel
- **`recast` (Recommended & Specified)**:
  - Specifically engineered for non-destructive codemods and AST transformation.
  - Generates a parse tree paired with original source token locations. When AST modifications are made, `recast.print(ast)` regenerates *only* the modified nodes and preserves exact whitespace, comments, indentation, semicolons, and quotes on all surrounding untouched AST nodes.
  - Integrates seamlessly with `@babel/parser` (or `recast/parsers/typescript`) for modern TypeScript syntax support.
- **`ts-morph` / `typescript` compiler API**:
  - TypeScript's native `ts.createPrinter()` is destructive: it reformats the entire file, normalizes trivia, and strips or misaligns comments.
  - `ts-morph` wraps the compiler API but adds significant bundle weight and memory overhead, with non-trivial comment preservation edge cases during array splicing.
- **`@babel/generator`**:
  - Without Recast, `@babel/generator` completely reformats the AST output from scratch.

**Verdict**: `recast` (using `@babel/parser` with typescript plugin) strictly fulfills the zero-mangling contract required by Neva's architecture.

#### 3.1.2 Scope Navigation & AST Target Nodes
The AST patcher must support three core operations across the 6 allowlisted source files:
1. **`update`**: Locate target object/call, mutate numeric properties (`x`, `z`, `rotationY`, `y`, `scale`), throw if not found or if duplicate IDs exist.
2. **`add`**: Insert a new object expression into target array or call `authoredPlacement(...)`, formatted cleanly with trailing comma.
3. **`delete` (or `remove`)**: Remove target node from array / record, or insert ID into removed array (e.g. `PLACEMENT_REMOVED`, `FARM_FENCE_REMOVED`).

```
AST Scoping Path for Object Arrays:
File Root (Program)
  └── ExportNamedDeclaration / VariableDeclaration
        └── VariableDeclarator (id: 'STARTER_PROP_ANCHORS' | 'FARMHOUSE_INTERIOR_PROPS' | ...)
              └── ArrayExpression (elements)
                    └── ObjectExpression
                          ├── Property (key: 'id', value: StringLiteral(targetId))
                          ├── Property (key: 'x', value: NumericLiteral)
                          ├── Property (key: 'z', value: NumericLiteral)
                          └── Property (key: 'rotationY', value: NumericLiteral)

AST Scoping Path for Authored Placement Function Calls:
File Root (Program)
  └── VariableDeclarator (id: 'AUTHORED_DETAIL_PLACEMENTS')
        └── ArrayExpression
              └── CallExpression (callee: 'authoredPlacement')
                    ├── Argument 0: StringLiteral(targetId)
                    └── Argument 1: ObjectExpression ({ x, z, rotationY, ... })
```

#### 3.1.3 Allowlisted Target Files & Mutation Patterns
The 6 allowlisted source files defined in `LAYOUT_EDITOR_SOURCE_FILES` exhibit distinct AST patterns that the patcher must navigate:

1. **`src/world/FarmLayout.ts`**:
   - `STARTER_STRUCTURE_ANCHORS`: Array of structure objects. Moves write farm-local coordinates (`world - STARTER_FARM_LAYOUT.origin`). Structures with processing anchors (e.g. `struct.starter_mill`) write rotation as visual yaw $-\; \pi$.
   - `STARTER_FARMSTEAD_ANCHORS`: Array containing `farmhouse` and `well`. Moving `farmhouse` must trigger outside door follow in `FarmhouseInterior.ts`.
   - `STARTER_PROP_ANCHORS`: Array of farm prop objects. Supports update, add (`copy`), and delete.
   - `FARM_FENCE_OVERRIDES`: Record object literal (`"fence_east_0": { x, z, rotationY }`).
   - `FARM_FENCE_EXTRAS`: Array of duplicated fence post anchors.
   - `FARM_FENCE_REMOVED`: Array of string IDs for deleted generated posts.
2. **`src/world/WorldLayout.ts`**:
   - `WORLD_LAYOUT_V5.architecturePads`: Array of `WorldArchitecturePad` objects (`center: { x, z }`, `rotationY`).
   - `lighthouse`, `dock`, `bridge` landmark literals: Object expressions with `x`, `z`, `rotationY`.
3. **`src/world/WorldAnchors.ts`**:
   - Named exported constants: `HARBOR_MARKET`, `VILLAGE_MARKET`, `HARBOR_FISH_TABLE`, `HARBOR_SILAS_ANCHOR`, `HARBOR_MAEVE_ANCHOR`.
4. **`src/world/WorldEnvironmentLayout.ts`**:
   - `AUTHORED_DETAIL_PLACEMENTS`: Array of `authoredPlacement("id", { assetId, x, z, rotationY, scale, grounding, practicalLight })` calls.
   - `PLACEMENT_OVERRIDES`: Record object literal for pinned seeded instances.
   - `PLACEMENT_REMOVED`: Array of string IDs for removed seeded instances.
5. **`src/world/FarmhouseInterior.ts`**:
   - `FARMHOUSE_INTERIOR_PROPS`: Array of interior furniture objects (`id`, `assetId`, `x`, `y`, `z`, `rotationY`, `scale`).
   - `FARMHOUSE_OUTSIDE_DOOR`: Object literal with `x`, `z`, and nested `exitSpawn: { x, z, rotationY }` (updated via door-follow kinematics).
6. **`src/content/npcs.ts`**:
   - `NPCS` object / records: NPC objects with `anchor: { x, z, rotationY }`.

#### 3.1.4 Safety Invariants & Atomic Disk Protocol
```
                       ┌────────────────────────────────┐
                       │ Read Target Source (.ts)       │
                       └───────────────┬────────────────┘
                                       │
                                       ▼
                       ┌────────────────────────────────┐
                       │ Parse into AST via Recast      │
                       └───────────────┬────────────────┘
                                       │
                                       ▼
                       ┌────────────────────────────────┐
                       │ Scoped AST Traversal & Patch   │
                       │ • Assert matchCount === 1 (upd)│
                       │ • Throw on 0 or >1 matches     │
                       └───────────────┬────────────────┘
                                       │
                                       ▼
                       ┌────────────────────────────────┐
                       │ Recast Print (Lossless String) │
                       └───────────────┬────────────────┘
                                       │
                                       ▼
                       ┌────────────────────────────────┐
                       │ Post-Mutation Parse Validation │
                       │ parse(outputCode) -> Throws if │
                       │ syntax is malformed            │
                       └───────────────┬────────────────┘
                                       │ Validated OK
                                       ▼
                       ┌────────────────────────────────┐
                       │ Atomic Write to Temp File:     │
                       │ ${filePath}.tmp-${process.pid} │
                       └───────────────┬────────────────┘
                                       │
                                       ▼
                       ┌────────────────────────────────┐
                       │ Atomic Rename:                 │
                       │ fs.renameSync(temp, filePath)  │
                       └────────────────────────────────┘
```

---

### 3.2 Terrain BVH Snapping (`src/layout-editor/TerrainSnapping.ts`)

#### 3.2.1 Core Objectives
During drag operations in `PlacementEditor.ts`, placing an object onto the 3D terrain requires:
1. **Accurate Contact Height**: Finding the exact collision point on the rendered terrain geometry rather than relying solely on coarse heightfield approximations.
2. **World Normal Vector Alignment**: Extracting the normal of the hit triangle face and transforming it through the terrain's world matrix to orient props or evaluate slope thresholds.
3. **High Performance**: Raycasting against complex 3D meshes on every pointermove frame must run in $< 0.1\text{ ms}$ without stalling the 60fps render loop.

#### 3.2.2 `three-mesh-bvh` Acceleration
`three-mesh-bvh` constructs a Bounding Volume Hierarchy (BVH) over `THREE.BufferGeometry`. By patching `THREE.Mesh.prototype.raycast = acceleratedRaycast` and assigning `mesh.geometry.boundsTree = new MeshBVH(geometry, { maxLeafTris: 10, strategy: SAH })`, raycasts achieve logarithmic $O(\log N)$ traversal speed.

#### 3.2.3 Coordinate Mathematics & Algorithm

$$\text{Ray Origin} = (X_{\text{world}}, Y_{\text{maxElevation}}, Z_{\text{world}}), \quad \text{Direction} = (0, -1, 0)$$

Where:
$$Y_{\text{maxElevation}} = \text{boundingBox.max.y} + 20.0$$

When the ray intersects the terrain:
1. **Hit Point**: $\mathbf{P}_{\text{hit}} = (x, y, z)$.
2. **Local Face Normal**: $\mathbf{N}_{\text{local}} = \text{hit.face.normal}$.
3. **World Normal Matrix**:
   $$\mathbf{M}_{\text{normal}} = (\mathbf{M}_{\text{world}}^{-1})^T$$
4. **World-Space Normal**:
   $$\mathbf{N}_{\text{world}} = \frac{\mathbf{M}_{\text{normal}} \cdot \mathbf{N}_{\text{local}}}{\|\mathbf{M}_{\text{normal}} \cdot \mathbf{N}_{\text{local}}\|}$$

#### 3.2.4 Fallback & Hybrid Sampling
If the raycast misses (e.g., pointer moves outside terrain bounding box) or before `bvhMesh` is registered:
- Fallback to `WorldLayout.traversalSurfaceSample(x, z)`, which performs deterministic barycentric interpolation on the heightfield grid (`sampleTraversalBasePlane`) and conformed road triangles (`sampleTraversalRoadPlane`).
- Slope threshold evaluation: Ensure $N_{\text{world}}.y \ge 0.72$ (or asset-specific threshold) and check `isPlacementFootprintStable`.

---

### 3.3 Failure-Safe Command Pattern History (`src/layout-editor/history/HistoryManager.ts`)

#### 3.3.1 Architecture Contract
The layout editor must maintain an undo/redo history to make in-game level editing resilient against user error.

```typescript
export interface Command {
  execute(): Promise<void>;
  undo(): Promise<void>;
  description: string;
}
```

#### 3.3.2 Drag Coalescing State Machine
During a drag operation, hundreds of pointermove events fire per second. Creating a command per event would flood the undo stack with sub-millimeter movements.

**Coalescing Protocol:**
1. **`beginDrag(targetId, initialPose)`**: When pointer clicks down on an editable object, store `initialPose = { x, y, z, rotationY }` in `dragInitialState` map.
2. **Drag Moves**: Update live presentation (Three.js mesh translation, grounding disc rebuild, live session sync). No commands pushed to stack.
3. **`endDrag(targetId, finalPose, applyFn)`**: On pointer up / drop:
   - Check if $\Delta x \ne 0 \lor \Delta z \ne 0 \lor \Delta \text{rotY} \ne 0$.
   - If changed, create a single discrete `Command`:
     - `execute: () => applyFn(finalPose)`
     - `undo: () => applyFn(initialPose)`
   - Execute command and push to `undoStack`.

```
[PointerDown] ──> beginDrag(targetId, initialPose)
                        │
                        ▼
[PointerMove] ──> Presentation Transform & Live Sync (0 Commands Pushed)
                        │
                        ▼
[PointerUp]   ──> endDrag(targetId, finalPose, applyFn)
                        │
                  Pose Changed?
                  ├── Yes ──> execute({ execute: apply(final), undo: apply(initial) })
                  └── No  ──> No-Op
```

#### 3.3.3 Re-entrancy & Failure Safety
- **`isExecuting` Guard**: When an async command execution (or HTTP commit) is in flight, incoming `execute`, `undo`, or `redo` invocations are immediately dropped or queued.
- **Stack Integrity on Error**:
  - `undo()` executes `await command.undo()`. If the server rejects or network errors, `undoStack.pop()` is **NOT** called. The command remains on the stack.
  - Fresh discrete actions clear `redoStack` (`this.redoStack = []`).
  - Configurable max stack depth (default 100) trims oldest items from `undoStack`.

---

## 4. Integration Points with `PlacementEditor.ts` and Live Session

### 4.1 `PlacementEditor.ts` Integration Flow
1. **Keyboard Bindings (`handleKeyDown`)**:
   - `⌘/Ctrl + Z` $\rightarrow$ `historyManager.undo()`
   - `⌘/Ctrl + Shift + Z` or `⌘/Ctrl + Y` $\rightarrow$ `historyManager.redo()`
   - `Delete` / `Backspace` $\rightarrow$ Command-wrapped delete action
   - `⌘/Ctrl + V` $\rightarrow$ Command-wrapped paste action
2. **Lifecycle Hooks**:
   - In `beginPick()`: trigger `historyManager.beginDrag(id, initialPose)`.
   - In `dragTo()`: sample surface using `terrainSnapper.snapToSurface(x, z)`.
   - In pointerup / `commitSelected()`: trigger `historyManager.endDrag(id, finalPose, applyFn)`.
3. **Live Presentation Synchronization**:
   - Ensure `onLiveSync` and `onStaticWorldChanged` fire on both `execute` and `undo` so colliders (`PhysicsWorld.replaceStaticCollision`), grounding discs, PointLights, and interact points update synchronously in the live session.

---

## 5. Dependencies and Package Requirements

To support the Subsystem 2 implementation:
1. **`devDependencies` Additions in `package.json`**:
   - `"recast": "^0.23.9"` — Lossless AST transformation engine.
   - `"three-mesh-bvh": "^0.8.2"` (or matching Three.js v0.174 compatible version) — Accelerated spatial raycasting.
2. **Engine Consistency**:
   - `@babel/parser` is already present in `node_modules` (via Vite/ESLint) and will be utilized by Recast's parser options.

---

## 6. Verification & Test Strategy

### 6.1 Unit Test Coverage Blueprint (`tests/unit/layoutEditorPatch.test.ts`)
1. **AST Lossless Transformations**:
   - Update existing object properties without altering surrounding indentation, trailing commas, or adjacent comments.
   - Insert new `authoredPlacement` call with clean formatting.
   - Delete object from array without leaving orphaned commas or syntax errors.
2. **Safety Invariant Validations**:
   - Throw `LayoutEditPatchError` when `targetId` is not found (zero-match guarantee).
   - Throw `LayoutEditPatchError` when duplicate `targetId` entries exist.
   - Reject writes that produce invalid TypeScript syntax (post-parse check).
3. **Atomic File Write Testing**:
   - Verify temp file creation and rename cycle.

### 6.2 History & Snapping Unit Tests (`tests/unit/layoutEditorHistory.test.ts` & `tests/unit/terrainSnapping.test.ts`)
1. **`HistoryManager` Tests**:
   - Single command execution, undo, redo.
   - Drag coalescing: 50 drag moves collapse into 1 undoable command.
   - Failure resilience: Rejected command leaves undo/redo stacks untouched.
   - Redo stack cleared on fresh mutation.
2. **`TerrainSnappingSystem` Tests**:
   - Raycast hit on synthetic mesh geometry returns exact contact height and world-space normal.
   - Out-of-bounds raycast returns `null` or falls back to `WorldLayout` sample.
   - Normal matrix handles scaled/translated mesh transformations accurately.

---

## 7. Conclusion & Implementation Recommendations

1. **Adopt Recast for `patchPlacement.ts`**: Replace manual substring surgery with Recast AST visitors for robust, comment-preserving TypeScript code editing.
2. **Implement `TerrainSnappingSystem`**: Provide clean BVH-accelerated surface queries with world normal alignment.
3. **Implement `HistoryManager`**: Add Command Pattern undo/redo with drag coalescing and wire into `PlacementEditor.ts`.
4. **Update `package.json`**: Add `recast` and `three-mesh-bvh` to `devDependencies`.

All changes strictly respect the Neva project rules: DEV-only presentation tooling, zero simulation coupling, deterministic world layout, and localhost-only write permissions.
