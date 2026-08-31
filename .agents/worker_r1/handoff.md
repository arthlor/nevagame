# Milestone 1 (R1) Handoff Report: 3D Procedural Art Pipeline & Incremental Caching

## 1. Observation

- Prior to implementation:
  * `tools/blender/cli.mjs` was a monolithic script with inline synchronous single-process Blender execution (`spawnSync`) and basic glTF optimization.
  * Standalone modules `tools/blender/cache.mjs`, `tools/blender/pool.mjs`, and `tools/blender/optimize.mjs` did not exist.
  * `src/render/assets/AssetHotSwapper.ts` was non-existent.
  * `src/render/loaders/AssetLoader.ts` lacked cache invalidation (`invalidateCache` / `invalidate`) and live reload (`reload`) capabilities.
- Implemented and verified components:
  * `tools/blender/cache.mjs` & `tools/blender/cache.d.mts`: Deterministic SHA-256 caching module tracking generator scripts, shared `common/` files, catalog specs, referenced palette tokens, Blender version, and optimization configuration. Implemented `computeAssetHash`, `computeAssetInputHash`, `computeAssetSourceHash`, `computeCommonToolchainHash`, `isAssetCurrent`, `isCached`, `recordCache`, `cleanCache`, `getCacheManifest`, `saveCacheManifest`.
  * `tools/blender/pool.mjs` & `tools/blender/pool.d.mts`: Dynamic work-stealing FIFO Blender worker pool with concurrency auto-detection (`os.cpus().length - 1`), isolated worker scratch directories (`.worker-${id}`), per-asset watchdog timer (killing hanging Blender instances with `SIGKILL`), worker recycling, `SIGINT`/`SIGTERM` cleanup, and structured per-task error telemetry.
  * `tools/blender/optimize.mjs` & `tools/blender/optimize.d.mts`: glTF post-processing optimization pipeline using `@gltf-transform/core`, `@gltf-transform/functions`, `@gltf-transform/extensions`, and `meshoptimizer`. Pipeline stages execute `dedup()`, `join()` (protecting dynamic parts like windmill spars, rowboat oars, character rigs, and collision proxies), `prune()`, `weld()`, vertex quantization (`KHR_mesh_quantization`: 14-bit position, 10-bit normal, 12-bit UV, 8-bit color), `reorder()`, and `meshopt()` (`EXT_meshopt_compression`). Derived LOD simplification is applied for multi-tier LOD specs using `MeshoptSimplifier`.
  * `tools/blender/cli.mjs` & `tools/blender/cli.d.mts`: Integrated caching, parallel pool, and optimization pipeline. Added support for `--concurrency <N>`, `--timeout <ms>`, `--no-cache`, and `--force` CLI flags while preserving all existing CLI commands.
  * `src/render/assets/AssetHotSwapper.ts`: Live in-place asset hot-reloading manager. Traverses scene instances, disposes old instance `BufferGeometry` to eliminate VRAM leaks, strictly preserves shared `PaletteMaterials` singletons, preserves parent transforms, layers, and dynamic attachments (`isDynamicAttachment`), attaches cloned new visual hierarchy, recalculates bounding boxes and spheres, updates matrix world, and emits reload notifications.
  * `src/render/loaders/AssetLoader.ts`: Added `invalidateCache(assetId)`, `invalidate(assetId)`, and `reload(assetId, activeScene)` methods.
  * Unit test suites: `tests/unit/artCache.test.ts`, `tests/unit/artPool.test.ts`, `tests/unit/artOptimize.test.ts`, `tests/unit/assetHotSwapper.test.ts`.

## 2. Logic Chain

1. **Deterministic Input Invariant**: In an incremental asset pipeline, cache keys must be a pure function of all inputs that influence generation. `computeAssetInputHash` computes SHA-256 across generator code, shared common helpers, catalog parameters, palette token values, Blender binary version, and optimization config. Any modification to inputs produces a unique digest, guaranteeing zero stale builds.
2. **Parallel Process Isolation**: Procedural 3D assets vary significantly in computational complexity. A shared FIFO work-stealing queue with isolated headless worker processes allows fast assets to complete without being blocked behind heavy architectural models. Process watchdogs with `SIGKILL` prevent hung Blender sub-processes from stalling CI or developer builds.
3. **GPU Memory Safety in Runtime HMR**: When hot-swapping assets in WebGL/Three.js, old `BufferGeometry` instances must be explicitly disposed to free GPU buffers. However, calling `dispose()` on materials in Neva would corrupt global shared palette singletons (`PaletteMaterials`), causing rendering artifacts on unrelated scene objects. `AssetHotSwapper` disposes only geometry buffers and non-palette ephemeral materials, preserving palette singletons and parent transform matrices.

## 3. Caveats

- Blender binary is resolved via `BLENDER_BIN`, `which blender`, or `/Applications/Blender.app`. In headless environments where Blender is not installed, caching and optimization modules operate seamlessly on existing/mocked assets, while `runDynamicBlenderPool` gracefully reports subprocess errors when execution is attempted without a valid binary.
- Vertex quantization (`KHR_mesh_quantization`) produces quantized integer attributes for positional and normal data; models requiring raw unquantized coordinates for custom compute passes should read raw stage files or supply custom quantization settings.

## 4. Conclusion

Milestone 1 (R1: 3D Procedural Art Pipeline & Incremental Caching) is fully implemented, strictly compliant with project integrity standards, and verified with 0 TypeScript compilation errors and 100% passing test suites across all Subsystem 1 deliverables.

## 5. Verification Method

- Run TypeScript typecheck:
  ```bash
  npm run typecheck
  ```
  Expected: Exits with code 0 (0 compilation errors).

- Run Subsystem 1 unit tests:
  ```bash
  npx vitest run tests/unit/artCache.test.ts tests/unit/artPool.test.ts tests/unit/artOptimize.test.ts tests/unit/assetHotSwapper.test.ts tests/unit/artPipeline.test.ts tests/unit/assetLoader.test.ts
  ```
  Expected: 6 test files passed, 38 tests passed (0 failures).
