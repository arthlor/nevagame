# Challenger 2 Report for Milestone 1 (R1: 3D Procedural Art Pipeline & Incremental Caching)

## Verdict: APPROVE

---

## 1. Observation

### 1.1 Implementation Review
- Inspected `src/render/assets/AssetHotSwapper.ts` (lines 1–146):
  * Line 21 (`safelyDisposeInstanceGeometries`): Traverses container, calls `mesh.geometry.dispose()` on meshes, and disposes materials only if `mat.userData?.isUniqueInstanceMaterial === true` while strictly guarding `PALETTE_SPECS` members (`!Object.prototype.hasOwnProperty.call(PALETTE_SPECS, mat.name)`).
  * Line 49 (`hotSwapAssetInstances`): Matches candidate instances by `node.userData?.nevaAssetId`, `node.userData?.assetId`, `node.name === assetId`, and `node.name === "missing_asset_" + assetId`.
  * Line 68: Preserves non-visual children with `child.userData?.isDynamicAttachment` or `child.userData?.isPresentationRig`.
  * Line 79: Clones replacement hierarchy (`newModelScene.clone(true)`), attaches children to instance node.
  * Line 85: Traverses new children to execute `child.geometry.computeBoundingBox()` and `child.geometry.computeBoundingSphere()`.
  * Line 92: Calls `node.updateMatrixWorld(true)` to ensure scene-graph transform consistency.
  * Line 97: Dispatches `AssetReloadEvent` to registered listeners in `Set<AssetReloadListener>` with try/catch isolation preventing faulty listeners from throwing.
- Inspected `src/render/loaders/AssetLoader.ts` (lines 199–224):
  * Line 199 (`invalidateCache` / `invalidate`): Deletes `assetId` from `modelCache` (`Map<AssetId, THREE.Group>`) and `loadingPromises` (`Map<AssetId, Promise<THREE.Group>>`).
  * Line 213 (`reload`): Executes `this.invalidateCache(assetId)`, invokes `this.loadCached(assetId)`, and calls `AssetHotSwapper.hotSwapAssetInstances(assetId, model, activeScene)` if `activeScene` is supplied.

### 1.2 Empirical Stress Harness (`tests/unit/empirical_hot_swap_challenger.test.ts`)
Created and executed an adversarial suite of 10 challenge test cases testing:
1. **Multi-Instance Geometry Disposal**: 20 active scene instances (40 distinct geometries across body and sub-groups). Every single old `BufferGeometry.dispose()` spy was invoked exactly once (`expect(spy).toHaveBeenCalledTimes(1)`).
2. **Material Preservation**: Global `PaletteMaterials` singletons (`wood_dark_01`, `metal_dark_01`, `stone_cool_01`) were preserved without calling `dispose()`. Ephemeral per-instance materials flagged with `isUniqueInstanceMaterial` were disposed.
3. **Bounding Volumes & Deep Transform Propagation**: Swapped a 1x1x1 box into a 10x15x20 box inside a 4-level deep transform hierarchy (`Scene -> WorldZone -> District -> Plot -> Instance`). Verified that bounding box (min: `[-5, -7.5, -10]`, max: `[5, 7.5, 10]`) and bounding sphere (radius `> 10`) were recomputed, and world position was preserved without matrix drift.
4. **Target Identification & Isolation**: Verified matching via `userData.nevaAssetId`, `userData.assetId`, `node.name === assetId`, and `node.name === "missing_asset_" + assetId` (diagnostic fallback recovery) while leaving unrelated assets (`furnace_1`, `missing_asset_crafting_station_furnace_a`) completely unmodified.
5. **Listener Fault Isolation**: Throwing exceptions inside custom listeners does not break other listeners or interrupt the swap transaction.
6. **Loader Cache Invalidation**: Calling `AssetLoader.invalidateCache` successfully purges in-memory cached model references and forces fresh loads.
7. **Boundary Safety**: Handled empty scenes and zero-matching-instance scenes cleanly without throwing errors.
8. **Dynamic Attachment & Presentation Rig Preservation**: Preserves `userData.isDynamicAttachment` and `userData.isPresentationRig` nodes while removing old visual meshes.
9. **High-Density Deep Tree Memory Leak Test**: 10 instances with 5 nested parent levels (50 total geometries) verified 100% geometry disposal.
10. **Concurrent Multi-Asset Hot Swapping**: Concurrently swapping multiple independent asset types maintains strict asset isolation.

### 1.3 Execution Results
```
$ npx vitest run tests/unit/artCache.test.ts tests/unit/artPool.test.ts tests/unit/artOptimize.test.ts tests/unit/assetHotSwapper.test.ts tests/unit/artPipeline.test.ts tests/unit/assetLoader.test.ts tests/unit/empirical_hot_swap_challenger.test.ts

 Test Files  7 passed (7)
      Tests  48 passed (48)
   Duration  4.53s
```
```
$ npm run typecheck
[NEVA CODEGEN] Catalog adapter unchanged (189 assets)
[NEVA UI] Atlas adapter unchanged
[NEVA UI] Published 123 sprites to public/assets/ui/atlas
tsc --noEmit (Exit code 0)
```
```
$ npm run build
✓ built in 6.16s (Exit code 0)
```

---

## 2. Logic Chain

1. **Geometry Disposal Safety**: In WebGL/Three.js applications, replacing scene objects without calling `dispose()` on `BufferGeometry` leaves buffers in GPU VRAM, leading to memory leaks during live editing. The test suite empirically verified that `AssetHotSwapper` calls `dispose()` on 100% of old geometry instances across both flat and deeply nested hierarchies (Observation 1.2, Challenges 1 & 9).
2. **Material Singleton Protection**: Neva utilizes shared palette materials (`PaletteMaterials`) as global singletons. Disposing shared materials invalidates shaders/materials for other active entities in the scene. `AssetHotSwapper` safely distinguishes between palette singletons and ephemeral instance materials, ensuring palette materials are never disposed while ephemeral materials are cleaned up (Observation 1.2, Challenges 1 & 2).
3. **Hierarchy and Transform Correctness**: When asset models are hot-reloaded, parent coordinates, rotation, scaling, and layer masks must remain fixed, while new visual meshes must update their bounding volumes to ensure raycasting and frustum culling operate accurately. Empirical tests confirmed that bounding boxes/spheres and `matrixWorld` updates propagate correctly across deep scene hierarchies (Observation 1.2, Challenge 3).
4. **Cache Invalidation & Reload Guarantees**: `AssetLoader.invalidateCache` effectively clears internal map entries, allowing `AssetLoader.reload` to fetch updated models and swap them live into the scene (Observation 1.2, Challenge 6).

---

## 3. Caveats

- Tests were executed within a Vitest/Node environment with Three.js object graph mocks and full Three.js geometry math implementations.
- Materials that are custom-created without palette registration and without `userData.isUniqueInstanceMaterial = true` are left untouched by default to prevent accidental destruction of shared user materials.

---

## 4. Conclusion

`src/render/assets/AssetHotSwapper.ts` and `src/render/loaders/AssetLoader.ts` meet and exceed all requirements specified in Milestone 1 (R1) of `PROJECT.md` and Section 2.4 of `tools/TOOLS_UPGRADE_IMPLEMENTATION_SPEC.md`.

Final Verdict: **APPROVE**.

---

## 5. Verification Method

To independently reproduce the empirical findings:

1. **Run Subsystem 1 Unit and Adversarial Challenger Test Suite:**
   ```bash
   npx vitest run tests/unit/artCache.test.ts tests/unit/artPool.test.ts tests/unit/artOptimize.test.ts tests/unit/assetHotSwapper.test.ts tests/unit/artPipeline.test.ts tests/unit/assetLoader.test.ts tests/unit/empirical_hot_swap_challenger.test.ts
   ```
   *Expected outcome*: 7 test files passed, 48/48 tests passed (0 failures).

2. **Verify TypeScript Compilation:**
   ```bash
   npm run typecheck
   ```
   *Expected outcome*: Exits with code 0 (0 compilation errors).

3. **Verify Production Build:**
   ```bash
   npm run build
   ```
   *Expected outcome*: Vite builds client bundle cleanly in `dist/` with exit code 0.
