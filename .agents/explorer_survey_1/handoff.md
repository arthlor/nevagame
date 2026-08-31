# Handoff Report: Subsystems 1 & 3 Survey

**Agent:** Explorer 1 (`explorer_survey_1`)  
**Parent:** Orchestrator (`f2c82b53-0804-475c-80b4-755579100dfb`)  
**Mission:** Survey and technical investigation of Subsystem 1 (3D Art Pipeline & Incremental Caching) and Subsystem 3 (UI Texture Atlas with 2D Edge Dilation & Lossless Packaging) for Neva Tools v2.0.

---

## 1. Observation

1. **`tools/blender/cli.mjs` (1816 lines):**
   - Contains a monolithic pipeline: argument parsing, catalog validation, synchronous `spawnSync` invocation of Blender (line 832), inline glTF validation (lines 954-1190), and basic Meshopt optimization (lines 1214-1229).
   - Does **not** implement modular architecture: `tools/blender/cache.mjs`, `tools/blender/pool.mjs`, and `tools/blender/optimize.mjs` are absent as standalone modules.
   - Lacks `KHR_mesh_quantization` (`quantize`), vertex cache optimization (`reorder`), and derived LOD generation (`simplify` via `MeshoptSimplifier`).

2. **Runtime Hot-Swapper & Loader (`src/render/loaders/AssetLoader.ts` & `src/render/assets/`):**
   - `src/render/loaders/AssetLoader.ts` contains `private static modelCache: Map<AssetId, THREE.Group>` (line 59) but provides no cache invalidation (`invalidate`) or hot-reload methods.
   - `src/render/assets/AssetHotSwapper.ts` does **not** exist in the repository.

3. **UI Pipeline (`tools/ui/`):**
   - Contains `slice-sheet.mjs`, `publish-atlas.mjs`, `codegen.mjs`, and `lib/sheetSlicer.mjs`.
   - Slices and copies individual `.png` files into `public/assets/ui/atlas/`.
   - `tools/ui/extrudeAndPack.mjs` does **not** exist in the repository.
   - No 2px edge dilation or MaxRects bin packing currently exists.

4. **Package Dependencies (`package.json`):**
   - Present & verified: `@gltf-transform/core` (4.4.2), `@gltf-transform/functions` (4.4.2), `@gltf-transform/extensions` (4.4.2), `meshoptimizer` (1.2.0), `sharp` (0.35.4), `gltf-validator` (2.0.0-dev.3.10), `ajv` (8.20.0).
   - Missing: `maxrects-packer` (required for UI atlas bin packing), `recast` and `three-mesh-bvh` (required for Subsystem 2).

---

## 2. Logic Chain

1. **Incremental Build Caching (R1):**
   - Observation: Blender generation is time-consuming and currently runs in a blocking single-threaded process.
   - Deduction: Extracting `tools/blender/cache.mjs` with a deterministic SHA-256 key comprising `generator_code`, `common_toolchain_hash`, `catalog_spec`, `palette`, `blender_version`, and `optimize_config` enables instantaneous cache hits on unmodified assets, bypassing Blender invocation entirely.

2. **Worker Pool Concurrency (R1):**
   - Observation: `cli.mjs` passes all missing assets to a single `spawnSync` call, causing large multi-component assets to block fast simple props.
   - Deduction: Implementing `tools/blender/pool.mjs` with a shared FIFO queue, configurable concurrency (`os.cpus().length - 1`), isolated `.worker-${workerId}` scratch directories, and per-asset watchdog timeouts (60s) achieves maximal multi-core throughput and process isolation.

3. **glTF Optimization & Quantization (R1):**
   - Observation: Current `optimizeAsset` in `cli.mjs` only executes `dedup`, `join`, `prune`, `weld`, and `meshopt`.
   - Deduction: Integrating `quantize` (14-bit pos, 10-bit normal, 12-bit UV, 8-bit color) via `KHR_mesh_quantization` and `reorder` from `@gltf-transform/functions`, plus derived LOD simplification via `MeshoptSimplifier`, will dramatically reduce GLB download size and GPU vertex fetch overhead.

4. **Memory-Safe Asset Hot-Swapping (R1):**
   - Observation: Materials in Neva are shared canonical singletons managed by `PaletteMaterials`. Disposing materials during asset reload invalidates other meshes across the scene.
   - Deduction: `AssetHotSwapper.ts` must traverse instances, dispose only `BufferGeometry` buffers, preserve parent transforms, re-clone new child nodes, and recompute bounding volumes without touching shared palette materials.

5. **2D Edge Dilation Atlas Packing (R3):**
   - Observation: Serving hundreds of loose PNGs increases network roundtrips, and sampling near sprite edges with bilinear filtering causes transparent-black alpha bleed.
   - Deduction: Implementing `tools/ui/extrudeAndPack.mjs` with 2px border dilation (stretching edge pixels outward and filling corners with clamped texels) and packing into 2048x2048 lossless WebP/PNG sheets with `maxrects-packer` completely eliminates dark border artifacts and reduces HTTP overhead to 1-2 sheet requests.

---

## 3. Caveats

1. **Dependency Installation:** `maxrects-packer` is not currently in `package.json`. It must either be added to `package.json` and installed, or a self-contained MaxRects bin packing algorithm can be bundled into `tools/ui/lib/`.
2. **Subsystems 2, 4, 5 Scope:** This report specifically focused on Subsystems 1 and 3 as requested. Subsystems 2 (AST level editor), 4 (audio normalization), and 5 (deterministic regression CI) are surveyed by peer explorer agents.
3. **Single Multi-LOD vs Separate LOD Files:** Neva's current catalog schema supports both inline LOD hierarchies (`requiredNodes: ["LOD0", "LOD1"]`) and potential derived LOD files. Builder agents should ensure `optimize.mjs` handles both catalog declarations gracefully.

---

## 4. Conclusion

The architectural upgrade path for Subsystems 1 & 3 is fully defined, highly feasible, and supported by existing packages (`@gltf-transform`, `meshoptimizer`, `sharp`):
- **R1 Implementation Scope:**
  - Build `tools/blender/cache.mjs`
  - Build `tools/blender/pool.mjs`
  - Build `tools/blender/optimize.mjs`
  - Refactor `tools/blender/cli.mjs` to delegate to these modular components
  - Implement `src/render/assets/AssetHotSwapper.ts` and integrate with `src/render/loaders/AssetLoader.ts`
- **R3 Implementation Scope:**
  - Add `maxrects-packer` to `package.json`
  - Build `tools/ui/extrudeAndPack.mjs` with 2px dilation and dual lossless WebP/PNG packaging
  - Integrate with `tools/ui/codegen.mjs` and `src/ui/chrome/uiAtlas.ts`

Full detailed analysis, code architectures, mathematical hash definitions, pixel diagrams, and integration contracts are documented in:
`/Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_1/survey_r1_r3.md`

---

## 5. Verification Method

To independently verify these findings:
1. Check `tools/blender/` file tree: `ls tools/blender/` confirms `cache.mjs`, `pool.mjs`, and `optimize.mjs` are missing.
2. Check `tools/ui/` file tree: `ls tools/ui/` confirms `extrudeAndPack.mjs` is missing.
3. Check `src/render/assets/`: confirms `AssetHotSwapper.ts` is missing.
4. Check package availability:
   `node -e "Promise.all(['@gltf-transform/core', '@gltf-transform/functions', 'meshoptimizer', 'sharp'].map(p => import(p))).then(() => console.log('Core dependencies OK'))"`
5. Typecheck & test baseline:
   `npm run typecheck`
