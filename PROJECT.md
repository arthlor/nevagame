# Project: Neva Tools Architecture & Implementation Specification (v2.0)

## Architecture
The Neva Tools Upgrade v2.0 modernizes the content production pipeline, editor experience, audio normalization, visual regression CI, and developer tooling across 5 distinct subsystems:
- **R1: 3D Procedural Art Pipeline & Incremental Caching**: Parallel Blender subprocess pool, cryptographic SHA-256 cache invalidation, glTF-Transform quantization/LOD optimization, and client-side AssetHotSwapper with clean GPU memory disposal.
- **R2: Lossless AST Level & Placement Editor**: Recast-backed lossless AST manipulation of TypeScript placement files, three-mesh-bvh accelerated terrain height snapping & normal alignment, and transaction-batched Command-Pattern HistoryManager for undo/redo.
- **R3: UI Texture Atlas with 2D Edge Dilation & Lossless Packaging**: Clamped alpha edge dilation to prevent bilinear bleeding, MaxRects bin packing, dual lossless WebP + PNG generation, and pixel-perfect sprite manifest mapping.
- **R4: Semantic Bus Audio Normalization**: Two-pass EBU R128 (`loudnorm`) ffmpeg normalization using the seven canonical roles owned by `LLM/06_AUDIO_AND_MUSIC_DESIGN_MASTER.md`, automated mono/stereo policy, cue-range preservation, and duration/channel/SHA-256 synchronization into `assets/audio/audio-manifest.json`.
- **R5: Deterministic Visual Regression CI & Unified Developer CLI**: 16-point deterministic visual regression test harness in Playwright targeting 4 visual-gold scenes with `window.__NEVA_RENDER_READY` handshake, and root `tools/cli.mjs` developer CLI routing all tooling commands.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | SHA-256 Multi-Input Cache Engine | Computes composite hash of generator python, shared lib, parameters, and config to skip unchanged asset generation | M1 (R1) | Spec §2.1 |
| 2 | Worker Thread / Subprocess Pool | Dynamic FIFO work-stealing pool with process isolation, worker recycling, per-asset timeouts, and signal handling | M1 (R1) | Spec §2.2 |
| 3 | glTF Quantization & LOD Optimizer | Uses gltf-transform and meshoptimizer for KHR_mesh_quantization, vertex cache optimization, and derived LOD generation | M1 (R1) | Spec §2.3 |
| 4 | Runtime AssetHotSwapper | Live client-side hot-swapping replacing meshes, recalculating bounds, preserving PaletteMaterials singletons, and disposing old geometries | M1 (R1) | Spec §2.4 |
| 5 | AssetLoader Cache Invalidation | Exposes reload hooks and cache invalidation in AssetLoader for seamless hot-swapping | M1 (R1) | Spec §2.4 |
| 6 | Lossless AST Placement Patcher | Recast/Babel-powered AST codemod for `patchPlacement.ts` preserving exact comments, indentation, formatting, and object literals | M2 (R2) | Spec §3.1 |
| 7 | Accelerated Terrain Snapping | `TerrainSnapping.ts` providing BVH/raycast elevation, barycentric interpolation fallback, normal matrix alignment, and slope gating | M2 (R2) | Spec §3.2 |
| 8 | Transactional HistoryManager | Command Pattern undo/redo stack with configurable depth, grouped drag operations, and dirty state integration in PlacementEditor | M2 (R2) | Spec §3.3 |
| 9 | 2D Clamped Edge Dilation | Extrudes non-transparent boundary pixels by 2px into padding to eliminate dark bilinear/mipmap filtering fringes | M3 (R3) | Spec §4.1 |
| 10 | MaxRects Atlas Packaging | Packs dilated sprite sheets into dual lossless WebP + PNG with JSON manifest referencing inner non-extruded UVs | M3 (R3) | Spec §4.2 |
| 11 | Two-Pass Category Loudness Normalization | Normalizes audio assets using ffmpeg loudnorm filter according to bus category LUFS and True Peak targets | M4 (R4) | Spec §5.1 |
| 12 | Audio Manifest Synchronization | Automatically updates durations, channels, and SHA-256 hashes in `assets/audio/audio-manifest.json` | M4 (R4) | Spec §5.2 |
| 13 | 16-Point Deterministic Visual Regression Harness | Playwright test suite freezing clocks, random seeds, shaders, and animations with `window.__NEVA_RENDER_READY` handshake | M5 (R5) | Spec §6.1 |
| 14 | Gold-Slice Pixel Diff Baselines | Automated comparison of bridge_river, starter_farm, harbor_market, lighthouse_coast against strict pixel thresholds | M5 (R5) | Spec §6.1 |
| 15 | Unified Developer CLI (`tools/cli.mjs`) | Root CLI router supporting `art`, `layout`, `ui`, `audio`, `test`, `ci`, `clean` with interactive and scriptable modes | M5 (R5) | Spec §6.2 |
| 16 | Package.json Scripts Update | Standardizes npm scripts for all tools, regression tests, and verification | M5 (R5) | Spec §6.2 |
| 17 | Full Verification Suite | End-to-end verification passing `npm run typecheck`, `npm run test`, and `npm run build` with 0 errors | M6 (Verification) | Spec §7.1 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | R1: 3D Procedural Art Pipeline & Incremental Caching | `tools/blender/cache.mjs`, `tools/blender/pool.mjs`, `tools/blender/optimize.mjs`, `src/render/assets/AssetHotSwapper.ts`, `src/render/loaders/AssetLoader.ts` | None | DONE |
| M2 | R2: Lossless AST Level & Placement Editor | `tools/layout-editor/patchPlacement.ts`, `src/layout-editor/TerrainSnapping.ts`, `src/layout-editor/history/HistoryManager.ts`, `src/app/PlacementEditor.ts` | None | DONE |
| M3 | R3: UI Texture Atlas & 2D Edge Dilation | `tools/ui/extrudeAndPack.mjs`, package dependencies | None | DONE |
| M4 | R4: Category-Based Bus Audio Normalization | `tools/audio/normalizeBus.mjs`, `assets/audio/audio-manifest.json` update | None | DONE |
| M5 | R5: Visual Regression CI & Developer CLI | `tests/e2e/visual-regression.spec.ts`, `src/app/GameApp.ts` handshake, `tools/cli.mjs`, `package.json` | M1, M2, M3, M4 | DONE |
| M6 | Final Verification & E2E Validation | Full typecheck, unit tests, build, and functional verification across all 5 subsystems | M1, M2, M3, M4, M5 | DONE |

### Verification Notes (M6)
- `npm run tools:ci` is the complete gate: asset/codegen synchronization, typecheck, lint, full Vitest, production build, audio manifest parity, and four-scene Playwright visual comparison.
- Current full-suite evidence: 100 test files / 969 tests pass; lint reports 0 errors and 45 warnings; the production bundle builds against the synchronized catalog/public manifest; all four deterministic visual scenes compare cleanly. The generated asset report owns its record count.
- A local production-preview smoke returned HTTP 200, entered a fresh game, rendered a 1440×900 canvas, and reported no page or console errors. No deployment was performed.
- `npm run audio:normalize` has been applied to the bundled runtime sources; `npm run audio:normalize:check` verifies SHA-256/duration/channel parity without rewriting them.
- The R3 atlas stress suite includes lossless PNG/WebP parity, exact inner-pixel fidelity, large packing batches, and stale-manifest detection.
- Pixel comparison is mechanical regression evidence. Human gameplay-camera visual approval and in-game listening/mix review remain separate product gates.

## Interface Contracts
### R1 Art Pipeline & AssetLoader
- `AssetHotSwapper.reloadAsset(assetId: string, model: THREE.Object3D)`: replaces live instances in scene hierarchy, disposes old geometries, preserves `PaletteMaterials` references, updates bounding spheres/boxes.
- `AssetLoader.invalidateCache(assetId: string)`: purges memory cache for assetId.

### R2 Layout Editor & HistoryManager
- `HistoryManager.execute(command: IEditorCommand)`: executes the command, records it only after success, clears redo, and marks editor dirty; `recordExecuted` covers a live edit already applied before its source commit.
- `TerrainSnapping.snapToTerrain(position: THREE.Vector3, alignNormal: boolean)`: returns the snapped position, world normal, `slopeDegrees`, and `isSlopeAcceptable`.
- `patchPlacement(filePath: string, mutations: PlacementMutation[])`: returns AST-transformed file content preserving all comments, indentation, and trailing commas.

### R3 UI Atlas Packer
- Output: `public/assets/ui/atlas/ui-atlas.png`, `public/assets/ui/atlas/ui-atlas.webp`, `public/assets/ui/atlas/ui-atlas.json`, `src/ui/atlas/AtlasManifest.ts`.
- Frame coordinates strictly map to non-dilated source boundaries with `innerX`, `innerY`, `innerWidth`, `innerHeight`.

### R4 Audio Normalization
- `LLM/06_AUDIO_AND_MUSIC_DESIGN_MASTER.md` §2.1 owns the seven semantic roles and their loudness/true-peak targets; this file does not duplicate those numbers.
- Live cue buses and spatial flags resolve each source to a semantic role. Spatial sources become mono; non-spatial/UI/ambience/music sources become stereo.
- Normalization stages the whole selected set, pads output through the latest cue end, rolls back partial promotion, and updates `sha256`, `durationSeconds`, and `channels` together.

### R5 Visual Regression & CLI
- `window.__NEVA_RENDER_READY`: boolean flag exposed on window once scene loading, geometry compilation, shadow maps, and initial frames stabilize.
- `tools/cli.mjs <command>`: returns exit code 0 on success, non-zero on failure.

## Code Layout
- `tools/blender/`: `cache.mjs`, `pool.mjs`, `optimize.mjs`, `cli.mjs`
- `tools/layout-editor/`: `patchPlacement.ts`
- `tools/ui/`: `extrudeAndPack.mjs`
- `tools/audio/`: `normalizeBus.mjs`
- `tools/`: `cli.mjs`
- `src/render/assets/`: `AssetHotSwapper.ts`
- `src/render/loaders/`: `AssetLoader.ts`
- `src/layout-editor/`: `TerrainSnapping.ts`, `history/HistoryManager.ts`
- `tests/e2e/`: `visual-regression.spec.ts`
- `tests/unit/`: unit test suites for tools and editor modules

## Making the Upgrade Effective in the Game

1. Restart the development server with `npm run tools -- layout dev` (or
   `npm run dev`). Predev runs `assets:sync`, so the current art adapter and UI
   atlas are regenerated before the game opens.
2. In DEV, press **F2** (or use `?place`) to use the layout editor. A successful
   drop, paste, delete, undo, or redo writes an allowlisted TypeScript layout
   source; inspect that git diff and keep only intentional world changes.
   Production builds intentionally contain no editor endpoint.
3. Runtime audio files and manifest metadata are already normalized. After
   changing a source, inspect `npm run tools -- audio plan`, run
   `npm run audio:normalize`, then listen in the actual gameplay contexts.
4. Run `npm run visual:test` for ordinary comparison. Use
   `npm run visual:update` only after an intentional renderer/UI change and
   inspect all four gameplay-camera images before accepting the new baseline.
5. Build the distributable game with `npm run build` and serve/deploy `dist`
   through the intended host. This implementation does not itself deploy the
   game.
