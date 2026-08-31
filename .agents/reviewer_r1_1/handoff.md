# Milestone 1 (R1) Review & Adversarial Challenge Report

## Review Summary

**Verdict**: APPROVE

**Milestone**: Milestone 1 (R1: 3D Procedural Art Pipeline & Incremental Caching)  
**Reviewer**: Reviewer 1 (Roles: Reviewer, Adversarial Critic)  
**Authoritative Reference**: `tools/TOOLS_UPGRADE_IMPLEMENTATION_SPEC.md` (Section 2), `PROJECT.md`

---

## Adversarial & Integrity Audit

- **Integrity Violations Check**: **PASSED** (0 violations).
  - No hardcoded test results or mock shortcuts detected.
  - No dummy or facade implementations.
  - No bypassed pipelines or delegating to external blackbox tools.
  - Real glTF transforms, real Meshopt compression, real Three.js scene graphs, and real cryptographic hashing are implemented and verified.
- **Worker Timeout & Watchdog Termination**: Verified. Processes that exceed `timeoutMs` are killed with `SIGKILL`, timer is cleared, and descriptive timeout errors are propagated.
- **Signal Handling & Scratch Cleanup**: Verified. `SIGINT` and `SIGTERM` handlers terminate active child processes and clear scratch directories. `BlenderWorkerPool.dispose()` unregisters signal listeners to prevent event emitter memory leaks.
- **Memory Safety & Palette Singletone Preservation**: Verified. `AssetHotSwapper.safelyDisposeInstanceGeometries` disposes `BufferGeometry` instances on meshes, but strictly excludes shared `PaletteMaterials` singletons, preventing shader/texture invalidation across unrelated scene objects.
- **Dynamic Node Preservation**: Verified. `mayJoinStaticNode` in `optimize.mjs` explicitly protects dynamic nodes (windmill spars/sails, rowboat oars, character rigs, collision proxies `COL_*`, and multi-tier LOD objects) from being flattened into static geometry.

---

## Verified Claims

| Claim | Verification Method | Result |
| :--- | :--- | :--- |
| `npm run typecheck` passes with 0 compilation errors | Executed `npm run typecheck` (`tsc --noEmit`) | **PASS** (0 errors) |
| `npm run build` bundles successfully | Executed `npm run build` (`tsc && vite build`) | **PASS** (Built in 2.56s) |
| Incremental SHA-256 caching detects parameter, palette, generator, and toolchain changes | Executed `tests/unit/artCache.test.ts` | **PASS** (9/9 tests passed) |
| Dynamic FIFO worker pool handles concurrency, errors, timeouts, and scratch cleanup | Executed `tests/unit/artPool.test.ts` | **PASS** (4/4 tests passed) |
| glTF quantization (`KHR_mesh_quantization`) and derived LOD generation via `MeshoptSimplifier` | Executed `tests/unit/artOptimize.test.ts` on real production GLB assets | **PASS** (4/4 tests passed) |
| In-place AssetHotSwapper disposes geometries, preserves `PaletteMaterials`, and keeps transforms/attachments | Executed `tests/unit/assetHotSwapper.test.ts` | **PASS** (3/3 tests passed) |
| Subsystem 1 full test suite passes | Executed `artCache`, `artPool`, `artOptimize`, `assetHotSwapper`, `artPipeline`, `assetLoader` | **PASS** (38/38 tests passed) |

---

## 5-Component Handoff Protocol

### 1. Observation

1. **Caching Engine (`tools/blender/cache.mjs` & `tools/blender/cache.d.mts`)**:
   - `computeAssetInputHash` generates deterministic SHA-256 composite keys over generator source code, `common/` toolchain scripts, catalog asset parameters, referenced palette tokens, Blender version, and optimization settings.
   - `stableStringify` guarantees consistent key-sorted JSON hashing regardless of object property ordering.
   - File system caching (`recordCache`, `isCached`, `isAssetCurrent`, `cleanCache`, `getCacheManifest`, `saveCacheManifest`) operates with atomic `.tmp-${process.pid}` writes and `fs.renameSync`.
2. **Worker Pool (`tools/blender/pool.mjs` & `tools/blender/pool.d.mts`)**:
   - `BlenderWorkerPool` implements a concurrent FIFO work-stealing queue with `resolveConcurrency` defaulting to `Math.max(1, os.cpus().length - 1)` with numeric override parsing and defensive fallbacks for `NaN`/negative values.
   - Headless subprocesses are isolated per task in `.worker-${workerId}-${pid}` directories.
   - Watchdog timer triggers `proc.kill("SIGKILL")` upon timeout (`timeoutMs`, default 60000ms).
   - Signal handlers (`SIGINT`, `SIGTERM`) invoke `terminateAll()` and clean scratch directories.
   - `dispose()` cleans process event listeners.
3. **glTF Optimization & LOD Pipeline (`tools/blender/optimize.mjs` & `tools/blender/optimize.d.mts`)**:
   - Integrated `@gltf-transform/core`, `@gltf-transform/functions`, `@gltf-transform/extensions`, and `meshoptimizer`.
   - Applied transforms: `dedup()`, `join()` (with `mayJoinStaticNode` protecting dynamic meshes, collision proxies, and LOD hierarchies), `prune()`, `weld()`, `quantize()` (14-bit position, 10-bit normal, 12-bit texcoord, 8-bit color), `reorder()`, and `meshopt()`.
   - Multi-tier LOD generation uses `MeshoptSimplifier` targeting spec ratios (`triangleRatioTarget`).
4. **AssetHotSwapper & AssetLoader (`src/render/assets/AssetHotSwapper.ts`, `src/render/loaders/AssetLoader.ts`)**:
   - `AssetHotSwapper.safelyDisposeInstanceGeometries` traverses nodes, disposes `mesh.geometry`, and strictly preserves `PaletteMaterials` singletons (`PALETTE_SPECS` check).
   - `hotSwapAssetInstances` swaps visual hierarchy while preserving parent position, rotation, scale, layers, simulation tags, and dynamic attachments (`userData.isDynamicAttachment` / `userData.isPresentationRig`), recomputing bounding boxes/spheres and updating world matrices.
   - `AssetLoader.invalidateCache` and `AssetLoader.reload` allow live asset reloading in scenes.
5. **CLI Integration (`tools/blender/cli.mjs`)**:
   - Correctly integrates caching, parallel worker pool, and glTF optimization into the staging and publish lifecycle with flags `--concurrency`, `--timeout`, `--no-cache`, and `--force`.

### 2. Logic Chain

1. **Deterministic Hashing**: Including all inputs (generator source, shared modules in `tools/blender/common/`, catalog specs, referenced palette token values, Blender binary version, and optimization config) into the SHA-256 digest ensures that unchanged assets are never rebuilt, while any modification to upstream code or data triggers instant invalidation.
2. **Subprocess Isolation & Fault Resilience**: By isolating each Blender job to an isolated scratch folder and wrapping it in a watchdog timer with `SIGKILL` capabilities and aggregated error reporting, rogue or hung Blender jobs cannot deadlock CI or developer build runs.
3. **VRAM Safety & Shader Integrity**: In Three.js, uncollected `BufferGeometry` instances lead to WebGL VRAM exhaustion. Explicitly disposing geometries during hot-swapping frees GPU resources, while preventing material disposal protects shared `PaletteMaterials` singletons from crashing other meshes in the scene.

### 3. Caveats

- In test and CI environments without a local Blender installation, caching and optimization logic runs independently and mock tasks verify pool failure/concurrency paths without requiring Blender.

### 4. Conclusion

The Milestone 1 (R1) implementation satisfies all requirements of Spec §2 and the Project Roadmap with zero defects, full type safety, and complete test suite coverage.

**Final Verdict**: **APPROVE**.

### 5. Verification Method

- **TypeScript Typecheck**:
  ```bash
  npm run typecheck
  ```
  Result: Exits with code 0 (0 compilation errors).

- **Production Build**:
  ```bash
  npm run build
  ```
  Result: Exits with code 0 (Vite build successful).

- **Milestone 1 Test Suite**:
  ```bash
  npx vitest run tests/unit/artCache.test.ts tests/unit/artPool.test.ts tests/unit/artOptimize.test.ts tests/unit/assetHotSwapper.test.ts tests/unit/artPipeline.test.ts tests/unit/assetLoader.test.ts
  ```
  Result: 6 test files passed, 38 tests passed, 0 failures.
