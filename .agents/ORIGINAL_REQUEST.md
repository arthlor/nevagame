# Original User Request

## Initial Request — 2026-08-30T09:53:22Z

Implement the Neva Tools Architecture & Implementation Specification (v2.0) across all 5 subsystems, providing a hardened, deterministic, incremental developer infrastructure for procedural 3D generation, AST-based layout editing, extruded texture atlases, bus-normalized audio, and deterministic WebGL regression testing.

Working directory: /Users/anilkaraca/Desktop/Neva
Integrity mode: development

## Requirements

### R1. 3D Procedural Art Pipeline & Incremental Caching
- Implement content-addressed build caching (`tools/blender/cache.mjs`) tracking generator sources, toolchain files, catalog specs, palette tokens, Blender version, and optimization configs to skip redundant asset builds.
- Implement a dynamic work-stealing Blender worker pool (`tools/blender/pool.mjs`) with concurrent FIFO queueing, process lifecycle isolation, per-asset timeouts, and signal cleanup handlers.
- Integrate glTF mesh quantization (`KHR_mesh_quantization`) and automatic derived LOD generation (`tools/blender/optimize.mjs`) using `@gltf-transform` and `meshoptimizer`.
- Implement memory-safe asset hot-swapping (`src/render/assets/AssetHotSwapper.ts` / `AssetLoader.ts`) that disposes old instance geometries, preserves instance parent transforms, clones new visual hierarchies, and recalculates bounding volumes.

### R2. Lossless AST Level & Placement Editor
- Implement a scoped, lossless AST patcher (`tools/layout-editor/patchPlacement.ts` / Recast transformer) supporting atomic update, add, and delete mutations with strict scoping, zero-match/duplicate-ID safety guarantees, atomic `.tmp` file commits, and post-mutation parse validation.
- Implement terrain surface snapping (`src/layout-editor/TerrainSnapping.ts`) using `three-mesh-bvh` accelerated raycasting and world-space normal matrix transformation for alignment.
- Implement a failure-safe Command Pattern history system (`src/layout-editor/history/HistoryManager.ts`) with undo/redo stacks, execution guards, and drag coalescing for continuous transform manipulations.

### R3. UI Texture Atlas with 2D Edge Dilation & Lossless Packaging
- Implement 2px border edge dilation and atlas packing (`tools/ui/extrudeAndPack.mjs`) using `sharp` and `maxrects-packer` to eliminate bilinear/mipmap texture bleeding.
- Output both lossless WebP and PNG atlas sheets along with JSON manifest files whose UV coordinates point strictly to the inner non-extruded frame boundaries.

### R4. Category-Based Bus Audio Normalization
- Implement bus-specific audio loudness normalization (`tools/audio/normalizeBus.mjs`) with category target standards (e.g. `ui_transient`, `tools_work`, `footsteps_movement`, `environment_ambience`, `animals_wildlife`, `water_splashes`, `dialogue_vocals`).
- Use a 2-pass stderr extraction and application process with `ffmpeg` `loudnorm` filter incorporating measured integrated loudness, true peak, loudness range, and target offset.

### R5. Deterministic Visual Regression CI & Unified Developer CLI
- Implement the 16-point determinism matrix harness for Playwright WebGL visual regression testing (`tests/e2e/visual-regression.spec.ts`) locking viewport, DPR, camera, solar vectors, water phase, seeded particles, font loading, and `window.__NEVA_RENDER_READY` handshake.
- Implement a unified developer CLI (`tools/cli.mjs`) exposing unified interactive and scriptable commands for art, layout, ui, audio, and regression tasks while maintaining backwards-compatible npm scripts in `package.json`.

## Verification Resources

- Existing test suite: `tests/unit/layoutEditorPatch.test.ts`
- Spec reference: `tools/TOOLS_UPGRADE_IMPLEMENTATION_SPEC.md`
- NPM scripts: `npm run typecheck`, `npm run test`, `npm run build`

## Acceptance Criteria

### Build & Type Safety
- [ ] `npm run typecheck` succeeds with 0 TypeScript compilation errors.
- [ ] `npm run build` bundles successfully with Vite.
- [ ] `npm run test` passes all unit tests, including AST patcher tests and history manager tests.

### Functional Subsystem Validation
- [ ] Incremental cache accurately detects changes in generator code, catalog spec, and toolchain dependencies, returning cache hits on unmodified assets.
- [ ] Recast AST placement patcher handles adds, updates, and deletes with duplicate detection and atomic file commits without mangling surrounding code or comments.
- [ ] `TerrainSnappingSystem` computes accurate surface contact points and world normals using `three-mesh-bvh`.
- [ ] UI atlas generation emits 2px edge-dilated lossless WebP/PNG sheets and manifests with accurate inner UVs.
- [ ] 2-pass audio normalizer correctly parses FFmpeg stderr JSON and applies category target LUFS.
- [ ] Playwright visual regression test file is configured with the 16-point determinism matrix.
- [ ] Unified CLI executes all subsystem tool commands cleanly.
