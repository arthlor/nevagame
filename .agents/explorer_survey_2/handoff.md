# Handoff Report: Subsystem 2 (Lossless AST Level & Placement Editor) Survey

## 1. Observation

- **Patcher Architecture (`tools/layout-editor/patchPlacement.ts`)**:
  - File size: 909 lines.
  - Implements custom string parsing, regex matching, and bracket balancing:
    - Line 49: `replaceFieldValue(block, field, replacement)`
    - Line 69: `extractBalanced(source, openIndex)`
    - Line 91: `findIdObject(source, id)`
    - Line 867: `fs.writeFileSync(absolute, contents, "utf8")` (direct write without atomic `.tmp` rename)
  - No post-mutation AST validation step exists prior to disk write.
- **Terrain Snapping (`src/layout-editor/TerrainSnapping.ts`)**:
  - File does not currently exist (`src/layout-editor/` contains only `layoutEdit.ts` and `layoutEditLiveSession.ts`).
  - Current terrain querying in `PlacementEditor.ts:377` uses unaccelerated `WorldScene.raycastTerrain` or mathematical `WorldLayout.terrainHeight(x, z)`.
  - `WorldLayout.ts:314-341` implements barycentric interpolation on the heightfield grid (`sampleTraversalBasePlane`), and lines 377-390 implement triangle intersection for roads (`sampleTraversalRoadPlane`).
- **History Management (`src/layout-editor/history/HistoryManager.ts`)**:
  - File does not currently exist.
  - `PlacementEditor.ts` has no undo/redo stack, no keyboard handlers for `Ctrl+Z`/`Ctrl+Y`, and no drag coalescing command structure.
- **Dependencies (`package.json`)**:
  - `recast` and `three-mesh-bvh` are not listed in `dependencies` or `devDependencies`.
  - `@babel/parser`, `@babel/traverse`, `@babel/types`, and `typescript` are present in `node_modules`.
- **Existing Test Suite (`tests/unit/layoutEditorPatch.test.ts`)**:
  - 36 tests passing in Vitest covering the 6 layout source files (`FarmLayout.ts`, `WorldLayout.ts`, `WorldAnchors.ts`, `WorldEnvironmentLayout.ts`, `FarmhouseInterior.ts`, `npcs.ts`), door-follow math, and localhost plugin validation.

## 2. Logic Chain

1. **Safety Invariants**: The spec requires zero-match and duplicate-ID guarantees, atomic file renaming, and post-mutation parse validation. Regex/bracket-counting approaches in `patchPlacement.ts` are susceptible to syntax edge cases (e.g. comments with unbalanced brackets, multiline string literals, or AST refactorings).
2. **Lossless AST Codemod**: Recast is specifically designed to parse JavaScript/TypeScript into an AST while preserving comments and whitespace on unmodified subtrees upon printing. Using Recast with `@babel/parser` allows targeted updates to object literals and array elements while guaranteeing structural validity.
3. **Terrain Snapping & Performance**: Placing objects at runtime requires raycasting against the detailed terrain mesh at interactive framerates. `three-mesh-bvh` provides $O(\log N)$ spatial indexing and calculates accurate triangle face normals, which must be transformed via the normal matrix $\mathbf{M}_{\text{normal}} = (\mathbf{M}_{\text{world}}^{-1})^T$ into world space to check slope thresholds ($N_y \ge 0.72$) and align props.
4. **Command Pattern & UX**: Without an undo/redo stack, developer errors in the in-game editor directly overwrite git-tracked files without recovery. Drag coalescing is necessary to bundle thousands of mouse move events during a single drag stroke into one discrete undoable command.
5. **Architectural Separation**: All editor operations adhere to Neva's project rules: DEV-only execution (`import.meta.env.DEV`), presentation-layer isolation (no simulation mutations), and localhost-only write endpoints.

## 3. Caveats

- In-place AST transformation using Recast must be carefully tested against complex formatting patterns in existing files (e.g. trailing comments, frozen object arrays, and custom helper calls like `authoredPlacement`).
- `three-mesh-bvh` requires `THREE.BufferGeometry` to have valid position attributes and computed bounds before creating `MeshBVH`.
- No modifications were made to project source code (read-only investigation).

## 4. Conclusion

Subsystem 2 can be cleanly implemented and upgraded according to `TOOLS_UPGRADE_IMPLEMENTATION_SPEC.md` by:
1. Adding `recast` and `three-mesh-bvh` to `package.json`.
2. Upgrading `tools/layout-editor/patchPlacement.ts` to use Recast for scoped, lossless AST mutations with atomic `.tmp` writes and post-parse validation.
3. Creating `src/layout-editor/TerrainSnapping.ts` using `three-mesh-bvh` accelerated raycasts with world-space normal alignment.
4. Creating `src/layout-editor/history/HistoryManager.ts` implementing the Command Pattern with drag coalescing.
5. Integrating `TerrainSnappingSystem` and `HistoryManager` into `src/app/PlacementEditor.ts`.

## 5. Verification Method

To independently verify findings:
1. Inspect survey document: `view_file` at `/Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_2/survey_r2.md`.
2. Inspect current patcher: `view_file` at `/Users/anilkaraca/Desktop/Neva/tools/layout-editor/patchPlacement.ts`.
3. Verify test suite:
   ```bash
   npx vitest run tests/unit/layoutEditorPatch.test.ts tests/unit/physicsWorld.test.ts
   ```
4. Verify missing packages in `package.json`:
   ```bash
   node -e "['recast', 'three-mesh-bvh'].forEach(p => console.log(p, require.resolve(p)))"
   ```
