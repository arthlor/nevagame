# Neva Tools v2.0 Architecture Survey: Subsystems 1 & 3

**Survey Author:** Explorer Agent 1 (Art Pipeline & UI Atlas Survey)  
**Date:** 2026-08-30  
**Target Scope:**
- **Subsystem 1:** 3D Procedural Art Pipeline & Incremental Caching (`tools/blender/`, `src/render/assets/`, `src/render/loaders/`)
- **Subsystem 3:** UI Texture Atlas with 2D Edge Dilation & Lossless Packaging (`tools/ui/`, `src/ui/`)

---

## 1. Executive Summary & Architectural Overview

The Neva Tools Architecture & Implementation Specification (v2.0) outlines a high-performance, deterministic developer and build pipeline. This survey evaluates the gap between the existing codebase and the target specifications for **Subsystem 1 (3D Art Pipeline)** and **Subsystem 3 (UI Texture Atlas)**.

### Subsystem Verdicts
1. **Subsystem 1 (3D Procedural Art & Incremental Caching):**
   - **Current State:** Monolithic 1816-line script `tools/blender/cli.mjs` handling argument parsing, catalog validation, toolchain hashing, synchronous single-process Blender execution (`spawnSync`), glTF validation, and basic Meshopt encoding. `tools/blender/cache.mjs`, `pool.mjs`, and `optimize.mjs` do **not** exist as standalone modules.
   - **Gaps:** Lacks dynamic worker process pool with work-stealing concurrency; lacks `KHR_mesh_quantization` vertex quantization and automatic `MeshoptSimplifier` derived LOD pipeline; lacks `AssetHotSwapper.ts` with safe Three.js geometry disposal and active scene hierarchy hot-reloading in runtime.
   - **Feasibility:** All core dependencies (`@gltf-transform/core`, `@gltf-transform/functions`, `@gltf-transform/extensions`, `meshoptimizer`, `gltf-validator`) are already installed in `devDependencies`.

2. **Subsystem 3 (UI Texture Atlas with 2D Edge Dilation & Lossless Packaging):**
   - **Current State:** `tools/ui/` provides sheet slicing (`slice-sheet.mjs`), single-file sprite publication (`publish-atlas.mjs`), and TypeScript enum codegen (`codegen.mjs`). Sprites are stored and served as loose individual 256x256 PNGs in `public/assets/ui/atlas/`.
   - **Gaps:** `tools/ui/extrudeAndPack.mjs` does **not** exist. There is currently no 2px edge dilation (bleed elimination) and no texture bin packing into unified atlas sheets.
   - **Feasibility:** `sharp` is installed and fully functional. `maxrects-packer` is missing from `package.json` and must be installed/added.

---

## 2. Subsystem 1: 3D Procedural Art Pipeline & Incremental Caching

### 2.1 File Map & Current vs. Target Architecture

| Component | Target Path | Current Status | Required Action / Spec Architecture |
| :--- | :--- | :--- | :--- |
| **Incremental Build Cache** | `tools/blender/cache.mjs` | Inline in `cli.mjs` (partial) | Extract into dedicated module. Implement SHA-256 caching across generator code, common toolchain files, asset spec, palette tokens, Blender version, and optimization config. |
| **Blender Worker Pool** | `tools/blender/pool.mjs` | Non-existent (`cli.mjs` runs 1 blocking `spawnSync`) | Implement dynamic FIFO work-stealing worker pool with configurable concurrency (`os.cpus().length - 1`), isolated worker scratch directories, per-asset timeouts (60s), and SIGINT/SIGTERM handlers. |
| **glTF Optimization & LODs** | `tools/blender/optimize.mjs` | Basic transform inline in `cli.mjs` | Implement `optimizeAndGenerateLods` with `weld`, `dedup`, `prune`, `quantize` (`KHR_mesh_quantization`: 14-bit pos, 10-bit normal, 12-bit UV, 8-bit color), `reorder`, and `meshopt`. Add derived LOD simplification using `MeshoptSimplifier`. |
| **Asset Hot-Swapper** | `src/render/assets/AssetHotSwapper.ts` | Non-existent | Implement runtime class to traverse active scene, safely dispose old instance geometries (strictly sparing shared `PaletteMaterials`), clone new model hierarchy, preserve transforms/layer masks, and recompute bounding volumes. |
| **Asset Loader Integration** | `src/render/loaders/AssetLoader.ts` | Implemented (static caching only) | Extend with cache invalidation (`invalidate(assetId)`), live reload, and integration with `AssetHotSwapper`. |

---

### 2.2 SHA-256 Content-Addressed Caching Architecture

#### Input Hash Specification
To ensure 100% deterministic cache hits and zero stale builds, the caching key must track every input contributing to the generated artifact:

$$\text{InputHash} = \text{SHA256}(\text{generator\_code} \parallel \text{common\_toolchain\_hash} \parallel \text{catalog\_entry} \parallel \text{palette} \parallel \text{blender\_version} \parallel \text{optimize\_config})$$

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   INPUT SOURCES                                        │
│  1. tools/blender/generators/<family>.py (exact generator source code)                 │
│  2. tools/blender/common/*.py (all common geometry/material/pipeline helpers)         │
│  3. tools/blender/bootstrap.py, registry.py, cli.mjs, schema, budgets, package-lock    │
│  4. asset-catalog.json (exact asset JSON spec object, stably stringified)              │
│  5. neva.palette.json (palette version and exact token values referenced by asset)     │
│  6. Blender binary version string (e.g. "4.2.0")                                       │
│  7. Optimization config object (quantization bits, weld tolerance, meshopt level)      │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                    SHA-256 Digest
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CACHE STORAGE STRUCTURE                                   │
│  generated/.cache/art/${inputHash}/                                                    │
│    ├── <asset.file>           (Optimized production GLB artifact)                      │
│    └── <asset.file>.json      (Validation metadata, triangle metrics, semantic hash)   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Cache Lifecycle Contracts
1. **Atomic Reads & Invalidation (`isAssetCurrent` / `readAssetCache`):**
   - Check if `generated/.cache/art/${inputHash}/<asset.file>` and `.json` exist.
   - Parse metadata: verify `version`, `inputHash`, `artContractStatus === "passed"`, and match recorded `fileHash` against physical file.
   - If valid, skip invoking Python/Blender and gltf-transform; copy cached artifact directly to destination.
2. **Atomic Writes (`writeAssetCache`):**
   - Stage artifact copy to temporary `.next-${process.pid}` file.
   - Write metadata JSON atomically using rename to prevent partial writes during interrupted builds.

---

### 2.3 Dynamic Work-Stealing Blender Worker Pool (`pool.mjs`)

#### The Bottleneck in Current Code
Currently, `cli.mjs` executes Blender via a single synchronous `spawnSync` invocation passing all missing assets in a single CLI command (`--asset id1 --asset id2 ...`). When a batch contains a complex building (e.g., `village_building` with 12 variants) alongside small props (`seed_pouch`, `pebble_cluster`), the execution is single-threaded and serialized in Python.

#### Worker Pool Execution Architecture
```
                         ┌─────────────────────────────┐
                         │   Miss Assets FIFO Queue    │
                         │ [Asset A, Asset B, Asset C] │
                         └──────────────┬──────────────┘
                                        │
                 ┌──────────────────────┼──────────────────────┐
                 ▼ (Worker 0)           ▼ (Worker 1)           ▼ (Worker N-1)
       ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
       │ Headless Blender  │  │ Headless Blender  │  │ Headless Blender  │
       │ .worker-0 scratch │  │ .worker-1 scratch │  │ .worker-k scratch │
       │ Timeout: 60s      │  │ Timeout: 60s      │  │ Timeout: 60s      │
       └─────────┬─────────┘  └─────────┬─────────┘  └─────────┬─────────┘
                 │                      │                      │
                 └──────────────────────┼──────────────────────┘
                                        │
                                        ▼
                         ┌─────────────────────────────┐
                         │ Aggregated Blender Reports  │
                         │ [Report A, Report B, ...]   │
                         └─────────────────────────────┘
```

#### Pool Invariants & Safety Contracts
1. **Work-Stealing Concurrency:** Default worker count = `Math.max(1, Math.min(missAssets.length, os.cpus().length - 1))`. Workers pull from the shared FIFO queue as soon as they complete their current asset.
2. **Process Lifecycle Isolation:**
   - Each worker runs in headless background mode: `blender --background --python tools/blender/bootstrap.py -- --catalog ... --output ... --report ... --asset <id>`.
   - Each worker uses an isolated scratch directory (`.worker-${workerId}`) to avoid race conditions on report files.
3. **Per-Asset Watchdog Timeout:**
   - Set a 60,000ms timer on spawned child process.
   - On timeout: terminate worker with `SIGKILL`, reject promise with detailed error, and clean up active process set.
4. **Signal Cleanup:**
   - Listen for `SIGINT` and `SIGTERM` on main Node process.
   - Cleanly kill all active child worker processes in `activeProcesses` set before exiting.

---

### 2.4 glTF Optimization & Derived LOD Pipeline (`optimize.mjs`)

#### glTF-Transform Pipeline Steps
The pipeline processes raw Blender GLB exports into production runtime assets:

```
[Raw Blender GLB]
       │
       ▼
 1. weld({ tolerance: 0.0005 })
       │  (Unifies coincident vertex seams from procedural generation)
       ▼
 2. dedup()
       │  (Deduplicates identical accessors and material definitions)
       ▼
 3. prune({ keepLeaves: true, keepAttributes: true, keepExtras: true })
       │  (Strips unused scene graph nodes while preserving COLOR_0 & sockets)
       ▼
 4. quantize({ pos: 14, normal: 10, uv: 12, color: 8 })
       │  (KHR_mesh_quantization: compresses 32-bit floats to compact integer formats)
       ▼
 5. reorder({ encoder: MeshoptEncoder })
       │  (Optimizes vertex ordering for GPU vertex cache locality)
       ▼
 6. meshopt({ encoder: MeshoptEncoder, level: "medium" })
       │  (EXT_meshopt_compression: applies byte-level entropy compression)
       ▼
[Production LOD0 GLB]
```

#### Derived LOD Generation
When `assetSpec.lodLevels` defines multiple distance tiers:
- For LOD1, LOD2, etc., read a fresh unquantized copy of the raw GLB.
- Apply `weld({ tolerance: 0.001 })`.
- Apply `simplify({ simplifier: MeshoptSimplifier, ratio: targetRatio, error: 0.02 })`.
- Apply `dedup()`, `prune()`, `quantize({ pos: 12, normal: 8, color: 8 })`, `reorder()`, and `meshopt()`.
- Export derived LOD GLBs according to the catalog contract.

---

### 2.5 Live In-Place Asset Hot-Swapping (`AssetHotSwapper.ts`)

#### Memory Safety & Disposal Invariant
In Three.js applications, hot-swapping assets without disposing WebGL buffers causes severe VRAM leaks. However, blindly calling `.dispose()` on all materials is fatal in Neva because materials are shared canonical instances (`PaletteMaterials`).

```
                              ┌───────────────────────────────┐
                              │     Three.js Active Scene     │
                              └───────────────┬───────────────┘
                                              │
                                              ▼ Traverse
                      ┌───────────────────────────────────────────────┐
                      │ Find node with matching assetId & isGroup     │
                      └───────────────────────┬───────────────────────┘
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    ▼                                                   ▼
     ┌─────────────────────────────┐                     ┌─────────────────────────────┐
     │   1. Geometry Disposal      │                     │   2. Material Preservation  │
     │ mesh.geometry.dispose()     │                     │ DO NOT dispose shared       │
     │ Release VRAM vertex buffers │                     │ PaletteMaterials singletons │
     └──────────────┬──────────────┘                     └──────────────┬──────────────┘
                    │                                                   │
                    └─────────────────────────┬─────────────────────────┘
                                              │
                                              ▼
                      ┌───────────────────────────────────────────────┐
                      │   3. Visual Hierarchy Replacement             │
                      │ - Remove old children (preserve dynamic hooks)│
                      │ - Clone new model scene hierarchy             │
                      │ - Attach new children to existing parent group│
                      │ - Preserve parent world transform & tags      │
                      └───────────────────────┬───────────────────────┘
                                              │
                                              ▼
                      ┌───────────────────────────────────────────────┐
                      │   4. Bounding Volume Recalculation            │
                      │ - mesh.geometry.computeBoundingBox()          │
                      │ - mesh.geometry.computeBoundingSphere()       │
                      │ - Update world matrix                         │
                      └───────────────────────────────────────────────┘
```

#### Hot-Swapper Implementation Contract
1. `AssetHotSwapper.safelyDisposeInstanceGeometries(container: THREE.Object3D)`: Traverses only the target instance; disposes geometry buffers on all `THREE.Mesh` nodes.
2. `AssetHotSwapper.hotSwapAssetInstances(assetId, newModelScene, activeScene)`:
   - Identifies instances via `node.userData.nevaAssetId === assetId` or `node.userData.assetId === assetId`.
   - Cleans old visual geometry.
   - Preserves instance parent position, rotation, scale, layers, and simulation attachments.
   - Attaches cloned children from the newly loaded asset.
   - Recomputes bounding boxes/spheres.
3. `AssetLoader.ts` integration:
   - Exposes `AssetLoader.invalidate(assetId)` to purge `modelCache` and `loadingPromises`.
   - Exposes `AssetLoader.reload(assetId, activeScene)` to fetch the updated GLB and trigger `AssetHotSwapper.hotSwapAssetInstances`.

---

## 3. Subsystem 3: UI Texture Atlas with 2D Edge Dilation & Lossless Packaging

### 3.1 The Bilinear / Mipmap Bleeding Problem
When individual UI sprites are packed into a single texture atlas without edge dilation:
1. **Bilinear Texture Filtering:** When an icon is sampled at fractional coordinates, the GPU interpolates between adjacent texels. If the border texels border transparent black (`rgba(0, 0, 0, 0)`), the color channels blend towards black, creating a dark, discolored halo around the sprite edges.
2. **Neighbor Bleed:** If two distinct sprites sit adjacent in the atlas, sampling near the edge can pull colors from the neighboring icon.

```
Without Dilation:
[ Neighbor / Black ] | [ Sprite Edge ] -> Interpolation creates dark / dirty fringe

With 2px Dilation:
[ Dilated Sprite Edge (2px) ] | [ Actual Sprite Edge ] | [ Dilated Sprite Edge (2px) ]
                              ▲                      ▲
                       UV_min points here      UV_max points here
```

---

### 3.2 2D Edge Extrusion / Bleed Elimination Algorithm

`dilateSpriteEdges(inputBuffer, extrude = 2)` expands each sprite by 2px on all sides:
- **Input:** $W \times H$ raw RGBA image.
- **Output:** $(W + 4) \times (H + 4)$ raw RGBA image.

```
                    ┌───┬───────────────────────────────┬───┐
      Extrude Top   │TL │       Top Edge (2px)          │TR │  y in [0, extrude-1]
                    ├───┼───────────────────────────────┼───┤
                    │   │                               │   │
      Center &      │ L │        Original Sprite        │ R │
      Sides         │2px│      Inner Non-Extruded       │2px│  y in [extrude, H+extrude-1]
                    │   │        (W x H pixels)         │   │
                    ├───┼───────────────────────────────┼───┤
      Extrude Bottom│BL │      Bottom Edge (2px)        │BR │  y in [H+extrude, H+2*extrude-1]
                    └───┴───────────────────────────────┴───┘
```

#### Pixel Mapping Rules
1. **Center Region:** Copy `(x, y)` from source to `(x + extrude, y + extrude)` in output.
2. **Top Edge:** Replicate source row $y = 0$ upward into output rows $y = 0 \dots \text{extrude}-1$.
3. **Bottom Edge:** Replicate source row $y = H - 1$ downward into output rows $y = (H + \text{extrude}) \dots (H + 2\text{extrude} - 1)$.
4. **Left & Right Edges (with corner clamping):**
   - For every output row $y \in [0, \text{outH}-1]$, calculate clamped source row:
     $$\text{srcY} = \min(\max(y - \text{extrude}, 0), H - 1)$$
   - Replicate source column $x = 0$ leftward into output columns $x = 0 \dots \text{extrude}-1$.
   - Replicate source column $x = W - 1$ rightward into output columns $x = (W + \text{extrude}) \dots (W + 2\text{extrude} - 1)$.
5. **Corner Quads:** The clamping logic automatically ensures:
   - Top-Left quad $(0\dots 1, 0\dots 1)$ is filled with source pixel $(0, 0)$.
   - Top-Right quad $(W+2\dots W+3, 0\dots 1)$ is filled with source pixel $(W-1, 0)$.
   - Bottom-Left quad $(0\dots 1, H+2\dots H+3)$ is filled with source pixel $(0, H-1)$.
   - Bottom-Right quad $(W+2\dots W+3, H+2\dots H+3)$ is filled with source pixel $(W-1, H-1)$.

---

### 3.3 MaxRects Atlas Bin Packing & Dual Lossless Output

#### Packing Specifications
- **Max Dimensions:** $2048 \times 2048$ pixels per bin.
- **Packer Engine:** `MaxRectsPacker` with `{ smart: true, pot: true }`.
- **Spacing / Padding:** 2px padding between packed rectangles.
- **Dual Lossless Formats:**
  1. Lossless WebP: `sharp(canvas).webp({ lossless: true })` (primary runtime format for modern browsers).
  2. Lossless PNG: `sharp(canvas).png({ compressionLevel: 9 })` (fallback format).

#### Manifest & UV Coordinate Contract
The UV coordinates written to the manifest **MUST point strictly to the inner non-extruded frame**, never the outer extruded boundary:

```typescript
const innerX = rect.x + 2;
const innerY = rect.y + 2;

manifest.frames[rect.name] = {
  frame: {
    x: innerX,
    y: innerY,
    w: rect.data.innerWidth,
    h: rect.data.innerHeight
  },
  uv: {
    u0: innerX / bin.width,
    v0: innerY / bin.height,
    u1: (innerX + rect.data.innerWidth) / bin.width,
    v1: (innerY + rect.data.innerHeight) / bin.height
  },
  binIndex
};
```

---

### 3.4 UI System Integration

#### Current Sprite Usage in Neva
- Sprites are referenced via helper resolvers in `src/ui/chrome/uiAtlas.ts` (e.g. `atlasForFish`, `atlasForItem`, `atlasForGrowth`, `atlasForWeather`).
- These resolvers map item IDs to static URL strings generated by `tools/ui/codegen.mjs` into `src/ui/chrome/uiAtlas.generated.ts`.

#### Upgrade Path for Atlas Integration
1. `tools/ui/extrudeAndPack.mjs` consumes all sliced sprites from `assets/ui/atlas/`.
2. Packages dilated sprites into `public/assets/ui/atlas_0.webp` and `public/assets/ui/atlas_0.png`.
3. Emits `public/assets/ui/ui-atlas.manifest.json`.
4. Updates `tools/ui/codegen.mjs` to generate typed frame bounds and UV coordinates in `src/ui/chrome/uiAtlas.generated.ts`, allowing both CSS sprite background positioning (`background-position` / `background-size`) and WebGL quad sampling without breaking existing simulation string keys.

---

## 4. Dependencies & Package Analysis

### 4.1 Dependency Inventory

| Package | Version in Repo | Status | Target Role |
| :--- | :--- | :--- | :--- |
| `sharp` | `^0.35.4` | Installed & Verified | Image buffer manipulation, 2D edge dilation, WebP/PNG encoding |
| `@gltf-transform/core` | `^4.4.2` | Installed & Verified | glTF document reading, transformation, and writing |
| `@gltf-transform/functions` | `^4.4.2` | Installed & Verified | `quantize`, `weld`, `dedup`, `prune`, `reorder`, `simplify`, `meshopt` |
| `@gltf-transform/extensions` | `^4.4.2` | Installed & Verified | KHR and vendor glTF extensions |
| `meshoptimizer` | `^1.2.0` | Installed & Verified | `MeshoptDecoder`, `MeshoptEncoder`, `MeshoptSimplifier` |
| `gltf-validator` | `^2.0.0-dev.3.10` | Installed & Verified | Khronos standard GLB validation |
| `ajv` | `^8.20.0` | Installed & Verified | JSON schema validation for asset catalog |
| `maxrects-packer` | *Not in package.json* | **Missing** | Bin packing 2D sprites into 2048x2048 texture atlases |
| `recast` | *Not in package.json* | **Missing** (Subsystem 2) | AST level & placement editor patching |
| `three-mesh-bvh` | *Not in package.json* | **Missing** (Subsystem 2) | Fast BVH raycasting for terrain snapping |

---

## 5. Implementation Recommendations for Builders

1. **Subsystem 1 (R1):**
   - Create `tools/blender/cache.mjs` exporting `computeCommonToolchainHash`, `computeAssetSourceHash`, `isAssetCurrent`, `readAssetCache`, `writeAssetCache`.
   - Create `tools/blender/pool.mjs` exporting `runDynamicBlenderPool` with work-stealing FIFO queue, child process isolation, watchdog timeouts, and signal forwarding.
   - Create `tools/blender/optimize.mjs` exporting `optimizeAndGenerateLods` utilizing `@gltf-transform/functions` (`quantize`, `reorder`, `meshopt`, `simplify`) and `meshoptimizer`.
   - Update `tools/blender/cli.mjs` to consume `cache.mjs`, `pool.mjs`, and `optimize.mjs`.
   - Create `src/render/assets/AssetHotSwapper.ts` with `safelyDisposeInstanceGeometries` and `hotSwapAssetInstances`.
   - Update `src/render/loaders/AssetLoader.ts` to support cache invalidation and live asset reloading.

2. **Subsystem 3 (R3):**
   - Add `maxrects-packer` to `package.json` devDependencies (or provide self-contained bin packer fallback).
   - Create `tools/ui/extrudeAndPack.mjs` implementing `dilateSpriteEdges` (2px clamped extrusion) and `packLosslessUiAtlas`.
   - Update `package.json` scripts to wire `ui:pack` / `assets:sync` into the new extruded atlas pipeline.
