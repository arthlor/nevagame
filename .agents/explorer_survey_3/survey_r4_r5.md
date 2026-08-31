# Neva Tools v2.0 Architecture & Implementation Survey: Subsystems 4 & 5

> **Author:** Explorer 3  
> **Target Subsystems:**  
> - **Subsystem 4:** Category-Based Bus Audio Normalization (`tools/audio/normalizeBus.mjs`)  
> - **Subsystem 5:** Deterministic Visual Regression CI (`tests/e2e/visual-regression.spec.ts`) & Unified Developer CLI (`tools/cli.mjs`)  
> **Date:** 2026-08-30  
> **Status:** Read-Only Technical Survey & Architectural Gap Analysis

---

## 1. Executive Summary & Context

The Neva Tools v2.0 upgrade establishes a deterministic, high-velocity developer toolchain across procedural 3D art, AST layout editing, extruded UI atlases, bus-normalized audio, and deterministic WebGL regression testing.

This survey focuses on **Subsystem 4** (Audio Normalization) and **Subsystem 5** (Deterministic Visual Regression & Unified CLI). Both subsystems bridge offline asset preparation with runtime stability, eliminating mix harshness and UI flakiness in browser environments.

### Summary Matrix

| Subsystem Component | Target Path | Current Status | Core Gap / Requirement |
| :--- | :--- | :--- | :--- |
| **Audio Ingest** | `tools/audio/ingest-freesound.mjs` | **Existing** | Downloads CC0 MP3s directly to `public/assets/audio/` without loudness normalization. |
| **Audio Normalizer** | `tools/audio/normalizeBus.mjs` | **Missing** | Needs 2-pass stderr `loudnorm` filter with category target LUFS / True Peak standards and manifest synchronization. |
| **Audio Manifest** | `assets/audio/audio-manifest.json` | **Existing (v2)** | 64 audio sources and ~70 cues; needs bus categorization mapping and hash update automation. |
| **Visual Regression** | `tests/e2e/visual-regression.spec.ts` | **Missing** | Needs 16-point determinism matrix harness, `window.__NEVA_RENDER_READY` handshake, and 4 gold-slice baseline tests. |
| **E2E Benchmark** | `tests/e2e/art-pipeline.spec.ts` | **Existing** | Measures draw calls/triangles, but does not perform pixel-exact baseline regression diffing. |
| **Unified CLI** | `tools/cli.mjs` | **Missing** | `tools/blender/cli.mjs` exists for Blender art; needs root CLI coordinating `art`, `layout`, `ui`, `audio`, `test`, `ci`, `clean`. |
| **NPM Scripts** | `package.json` | **Partial** | Missing `cli`, `audio:normalize`, `test:visual`, `ci:regression`, `clean` commands. |

---

## 2. Subsystem 4: Category-Based Bus Audio Normalization

### 2.1 Problem Analysis & Rationale
Universal audio normalization (e.g. standardizing every sound file to a flat -16.0 LUFS) severely damages mix dynamics in a peaceful, cozy simulator. A quiet footstep on meadow turf or a delicate water drop must not sound as loud as heavy thunder, a rowboat wake, or an inventory purchase chime.

Subsystem 4 introduces **Bus-Specific Loudness Targets** based on acoustic categories, mastered using a strict **2-pass FFmpeg `loudnorm` process**.

---

### 2.2 Audio Bus Categorization & Loudness Standards

According to `TOOLS_UPGRADE_IMPLEMENTATION_SPEC.md` §5.1 and `LLM/06_AUDIO_AND_MUSIC_DESIGN_MASTER.md` §2.1 / §5.1, audio assets are categorized into 7 primary bus categories plus music and weather beds:

| Audio Bus Category | Target Integrated Loudness ($I$) | True Peak Ceiling ($TP$) | Dynamics Range ($LRA$) | Channel Mode | Example Cues & Sound Assets |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ui_transient` | **-18.0 LUFS** | **-1.5 dBTP** | **8.0** | Stereo | `ui-click`, `ui-confirm`, `ui-error`, `ui-inventory`, `ui-cloth`, `page-turn`, `coins`, `quest-bell`, `contract-stamp`, `treasure-chime` |
| `tools_work` | **-20.0 LUFS** | **-2.0 dBTP** | **9.0** | Mono (3D) | `hoe-till`, `plant-dirt`, `watering-can`, `sickle-swish`, `harvest-cut`, `crop-rustle`, `wood-saw`, `workstation-grind`, `ice-shovel`, `fertilizer-dust` |
| `footsteps_movement` | **-26.0 LUFS** | **-4.0 dBTP** | **6.0** | Mono (3D) | `footsteps-dirt`, `footsteps-grass`, `footsteps-wood`, `footsteps-dock`, `footsteps-sand`, `footsteps-water`, `donkey-trot` |
| `environment_ambience` | **-24.0 LUFS** | **-3.0 dBTP** | **12.0** | Stereo (Bed) | `ambience-wind`, `ambience-insects`, `ambience-birds`, `dawn-birds`, `ocean-waves`, `fireplace`, `market-murmur` |
| `animals_wildlife` | **-22.0 LUFS** | **-2.5 dBTP** | **10.0** | Mono (3D) | `donkey-snort`, `seagulls`, `fish-flop` |
| `water_splashes` | **-20.0 LUFS** | **-2.0 dBTP** | **10.0** | Mono (3D) | `water-splash` (variants a–d), `water-drop`, `boat-row`, `boat-wake`, `fishing-cast`, `fishing-reel-*`, `line-snap` |
| `dialogue_vocals` | **-16.0 LUFS** | **-1.0 dBTP** | **8.0** | Stereo/Mono | Future NPC greeting murmurs, voice stingers, announcer cues |
| `music` | **-20.0 LUFS** | **-2.0 dBTP** | **10.0** | Stereo | `theme`, `music-village`, `music-piano`, `music-folk-calm`, `music-guitar-arpeggio` |
| `weather` | **-18.0 LUFS** | **-2.0 dBTP** | **10.0** | Stereo / Mono (Thunder) | `rain-light`, `rain-heavy`, `thunder` |

---

### 2.3 2-Pass Stderr `loudnorm` Algorithm

FFmpeg's `loudnorm` filter requires a two-pass workflow because single-pass dynamic normalization alters dynamic envelopes on the fly, causing audible pumping and distortion on short transient SFX.

#### Pass 1: Analysis & Stderr Extraction
- Run FFmpeg with `-af loudnorm=I=${targetLufs}:TP=${truePeak}:LRA=${lra}:print_format=json` against `-f null -`.
- Capture output strictly from `stderr` (FFmpeg writes analysis stats to stderr, not stdout).
- Match and parse the JSON block containing:
  - `input_i`: Measured integrated loudness of source file (LUFS).
  - `input_tp`: Measured true peak of source file (dBTP).
  - `input_lra`: Measured loudness range (LU).
  - `input_thresh`: Measured threshold (LUFS).
  - `target_offset`: Target gain offset adjustment (LU).

```javascript
// Stderr JSON Pattern Regex
const jsonMatch = stderrOutput.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
const stats = JSON.parse(jsonMatch[0]);
```

#### Pass 2: Parameterized Application
- Execute Pass 2 with exact measured parameters:
  `-af loudnorm=I=${targetLufs}:TP=${truePeak}:LRA=${lra}:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true`
- Output target: normalized audio written atomically to output directory (default: `public/assets/audio/`).

---

### 2.4 Channel Layout & Format Handling
- **Channel Allocation:**
  - **Mono (1 Channel):** All 3D spatialized sources (`tools_work`, `footsteps_movement`, `animals_wildlife`, `water_splashes`). WebAudio `PannerNode` requires mono audio buffers to correctly compute spatial panning, HRTF filtering, and distance attenuation without stereo phasing issues.
  - **Stereo (2 Channels):** All ambient beds (`environment_ambience`), weather loops (`weather`), music stems (`music`), and UI non-positional sounds (`ui_transient`).
- **Format Codecs:**
  - Runtime format: **MP3 (192-320 kbps)** or **lossless WAV / OGG** support.
  - Sample rate: Standardized to **44.1 kHz** or **48.0 kHz** (preventing browser resampling overhead).

---

### 2.5 Batch Processing Pipeline & Audio Manifest Synchronization

The CLI tool `tools/audio/normalizeBus.mjs` must support:
1. **Source Discovery:** Inspect `assets/audio/ingest.json`, `assets/audio/audio-manifest.json`, and `public/assets/audio/*.mp3`.
2. **Category Resolution:** Heuristically or explicitly map each sound ID / cue to its corresponding bus category.
3. **Atomic Processing:** Process files into a staging directory before overwriting runtime assets.
4. **Manifest Synchronization:**
   - Recompute SHA256 hashes and duration in seconds via `afinfo` / `ffprobe` / `node:crypto`.
   - Update `assets/audio/audio-manifest.json` with updated `sha256`, `durationSeconds`, and bus loudness targets.
5. **Validation Test:** Run `tests/unit/audioManifest.test.ts` to ensure zero broken references or checksum mismatches.

---

## 3. Subsystem 5: Deterministic Visual Regression CI & Unified Developer CLI

### 3.1 Part A: Deterministic Visual Regression CI (`tests/e2e/visual-regression.spec.ts`)

#### Problem Statement
WebGL rendering tests in CI environments often suffer from flakiness due to asynchronous shader compilation, variable device pixel ratios, random wind/water phases, font loading delays, and dynamic lighting/exposure cycles.

Subsystem 5 establishes the **16-Point Determinism Matrix** ensuring pixel-exact WebGL rendering comparisons across test runs.

---

### 3.2 The 16-Point Determinism Matrix

| # | Determinism Dimension | Implementation Contract | Verification / Hook |
|---|---|---|---|
| **1** | **Resolution** | Fixed viewport size locked at `1920x1080` (or `1440x900` baseline). | `page.setViewportSize({ width: 1920, height: 1080 })` |
| **2** | **Device Pixel Ratio (DPR)** | Enforce `devicePixelRatio = 1.0`. | Playwright browser context option / `window.devicePixelRatio = 1` |
| **3** | **Camera Framing** | Authored fixed position, lookAt target, and FOV for each gold scene. | URL query parameter `?goldTest=<sceneId>` overrides camera controls. |
| **4** | **Solar Vectors & Atmosphere** | Fixed solar azimuth ($215^\circ$) and solar elevation ($38^\circ$). | `LightingRig` solar calculations locked to fixed simulation minute. |
| **5** | **Weather State** | Fixed weather state: `WEATHER_CLEAR` (no random cloud cover or rain particles). | Parameter `artWeather=clear` / `weather=clear`. |
| **6** | **Wind Direction & Velocity** | Static wind vector locked at `(0.4, 0.0, 0.1)`. | Uniform `uWind` locked in foliage/grass shaders. |
| **7** | **Water Phase** | Ocean and river procedural wave uniform time $= 0.0$. | Uniform `uTime` locked to `0.0` in water shaders. |
| **8** | **Skeletal Animation** | Skeleton and character animation tick paused at $t = 0.0$. | `AnimationController` evaluation frozen at frame 0. |
| **9** | **Particles & Foliage Jitter** | Seeded PRNG initialized with fixed seed (e.g. `seed=42`). | Deterministic mulberry32 PRNG for particle placement. |
| **10** | **Simulation State** | Deterministic snapshot loaded (no random crop growth or NPC wandering). | Headless save fixture loaded into `Simulation`. |
| **11** | **Anti-Aliasing Mode** | TAA temporal jitter disabled; FXAA or deterministic MSAA locked. | `TAAPass` jitter offset $=(0, 0)$. |
| **12** | **Exposure & Tone Mapping** | Exposure fixed at $1.0$ (disable dynamic eye-adaptation adaptation loops). | `VisualRenderConfig.exposure = 1.0`. |
| **13** | **Font Loading** | Await `document.fonts.ready` before frame capture. | `await page.evaluate(() => document.fonts.ready)`. |
| **14** | **Render Handshake** | Synchronize capture on `window.__NEVA_RENDER_READY === true`. | `await page.waitForFunction(() => window.__NEVA_RENDER_READY === true, { timeout: 20000 })`. |
| **15** | **Browser Binary** | Pinned Chromium browser engine in Playwright. | `@playwright/test` pinned Chromium project. |
| **16** | **GPU Device & Backend** | Headless CI uses `--use-gl=angle --use-angle=swiftshader`. | Chromium launch flags in `playwright.config.ts`. |

---

### 3.3 Gold Slice Scenes & Pixel Diffing Thresholds

The visual regression suite targets the four canonical visual-gold slices defined in `LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md`:

| Scene ID | Description & Framing | Allowed Pixel Diff Threshold (`maxDiffPixels`) | Baseline Image Name |
| :--- | :--- | :--- | :--- |
| `bridge_river` | Wooden bridge crossing river with water shaders, reeds, riverbed stones, and willow trees. | **250 px** | `bridge_river-baseline.png` |
| `starter_farm` | Farmhouse, tilled soil plots, crop stages, irrigation well, wooden fence, and tool rack. | **350 px** | `starter_farm-baseline.png` |
| `harbor_market` | Salt-weathered pier, fishmonger stall, crates, barrels, skiff moored at dock, tide water. | **400 px** | `harbor_market-baseline.png` |
| `lighthouse_coast` | Coastal cliff, lighthouse beacon tower, ocean surf shoreline, rock outcrops, coastal pines. | **300 px** | `lighthouse_coast-baseline.png` |

#### Playwright Assertion Contract
```typescript
const canvas = page.locator("canvas#game-canvas");
await expect(canvas).toHaveScreenshot(`${scene.id}-baseline.png`, {
  animations: "disabled",
  maxDiffPixels: scene.maxDiffPixels
});
```

---

### 3.4 Runtime Handshake Integration in `src/app/GameApp.ts`

To support `window.__NEVA_RENDER_READY`:
1. `GameApp` must listen for `goldTest` query parameters in URL (`?goldTest=bridge_river&seed=42`).
2. When `goldTest` is present:
   - Configure camera pose to authored gold viewpoint.
   - Freeze simulation and presentation clocks at $t = 0.0$.
   - Force synchronous compilation of all scene shaders (`renderer.compile(scene, camera)`).
   - Render 2 initial warmup frames to ensure WebGL pipeline and textures are uploaded to GPU.
   - Set `window.__NEVA_RENDER_READY = true`.

---

## 4. Subsystem 5: Part B: Unified Developer CLI (`tools/cli.mjs`)

### 4.1 Architecture & Command Hierarchy

Currently, various developer tasks are split across individual scripts (`tools/blender/cli.mjs`, `tools/art/codegen.mjs`, `tools/ui/publish-atlas.mjs`, `tools/audio/ingest-freesound.mjs`).

`tools/cli.mjs` provides a **single unified developer command center** supporting both an interactive prompt menu (when invoked with no arguments) and scriptable command-line arguments.

```
tools/cli.mjs
├── art
│   ├── brief          (Generate asset brief from catalog specs)
│   ├── generate       (Run dynamic Blender worker pool with cache)
│   ├── validate       (Run asset budget, topology & schema validation)
│   ├── sync           (Sync generated GLB models to public assets)
│   ├── determinism    (Verify asset export bitwise determinism)
│   ├── test-builders  (Execute procedural builder unit tests)
│   └── benchmark      (Run Playwright art benchmark suite)
├── layout
│   ├── patch          (Run Recast AST layout patcher on scene files)
│   ├── audit          (Audit placement IDs and world layout coherence)
│   └── snap           (Test BVH terrain surface snapping)
├── ui
│   ├── slice          (Slice UI source sheets)
│   ├── pack           (Extrude 2px edges and pack lossless WebP/PNG atlas)
│   ├── publish        (Publish UI atlases to public assets)
│   └── codegen        (Emit TypeScript token and frame bindings)
├── audio
│   ├── ingest         (Download CC0 preview files from Freesound)
│   ├── normalize      (Run category-based 2-pass stderr loudnorm)
│   └── audit          (Verify audio manifest integrity and checksums)
├── test
│   ├── unit           (Run Vitest unit and simulation tests)
│   ├── e2e            (Run standard Playwright E2E tests)
│   ├── visual         (Run 16-point WebGL visual regression suite)
│   └── all            (Run full test suite sequentially)
├── ci
│   ├── verify         (Run typecheck, lint, and test validation)
│   └── regression     (Run full CI visual regression and budget verification)
└── clean
    ├── cache          (Clear .cache build hashes)
    ├── staging        (Clear generated staging directories)
    └── all            (Full clean of generated artifacts)
```

---

### 4.2 CLI User Experience & Execution Contract

1. **Interactive Mode (TTY):**
   - When run in an interactive terminal without arguments (`node tools/cli.mjs`), display an ANSI-styled menu allowing developers to navigate subsystems, select asset IDs, toggle `--strict`, or run tests.
   - Lightweight zero-dependency ANSI styling / prompt loop or native Node.js `readline`.
2. **Scriptable Mode (CI & Automation):**
   - Direct argument parsing (e.g. `node tools/cli.mjs audio normalize --bus footsteps_movement`).
   - Supports global flags:
     - `--help` / `-h`: Print command reference.
     - `--quiet` / `-q`: Suppress informational output.
     - `--json`: Output machine-readable JSON reports.
     - `--strict`: Enforce hard budget limits.
3. **Signal & Process Management:**
   - Properly forward `SIGINT` (`Ctrl+C`) and `SIGTERM` signals to spawned child processes.
   - Clean up temporary files on exit.

---

### 4.3 `package.json` Scripts Integration

The following additions and updates in `package.json` preserve 100% backwards compatibility while routing through the unified CLI:

```json
{
  "scripts": {
    "cli": "node tools/cli.mjs",
    "audio:ingest": "node tools/cli.mjs audio ingest",
    "audio:normalize": "node tools/cli.mjs audio normalize",
    "audio:audit": "node tools/cli.mjs audio audit",
    "test:visual": "playwright test tests/e2e/visual-regression.spec.ts --project=chromium",
    "test:visual:update": "playwright test tests/e2e/visual-regression.spec.ts --project=chromium --update-snapshots",
    "ci:verify": "npm run typecheck && npm run lint && npm run test",
    "ci:regression": "npm run ci:verify && npm run test:visual",
    "clean": "node tools/cli.mjs clean"
  }
}
```

---

## 5. Toolchain Prerequisites & Dependencies

### 5.1 System / Host Binaries
- **FFmpeg & FFprobe:** Required for 2-pass loudness normalization (`ffmpeg -af loudnorm=...`).
  - *Current Status on Host:* Verified available at `/opt/homebrew/bin/ffmpeg` and `/opt/homebrew/bin/ffprobe`.
- **Node.js:** Node.js v20+ with ES Modules support (`node:crypto`, `node:child_process`, `node:fs`).
- **Blender:** Headless Blender 4.x+ binary for 3D art generation.
- **Chromium:** Playwright-managed Chromium browser for WebGL visual regression.

### 5.2 NPM Package Dependencies
- Existing: `@playwright/test` (v1.50.1), `vitest` (v3.0.5), `sharp` (v0.35.4), `three` (v0.174.0), `typescript` (v5.7.3).
- Required for atlas packaging: `maxrects-packer`.

---

## 6. Implementation Checklist & Verification Strategy

### Verification Matrix for Subsystems 4 & 5

| Verification Target | Command / Method | Expected Outcome |
| :--- | :--- | :--- |
| **Audio Normalization (Pass 1 & 2)** | `node tools/audio/normalizeBus.mjs --dry-run` | Successfully parses FFmpeg stderr JSON, extracts target offsets, and computes target gain without error. |
| **Audio Manifest Integrity** | `npm run test tests/unit/audioManifest.test.ts` | All audio sources have valid durations, matched SHA256 hashes, and valid bus mappings. |
| **Visual Regression Suite** | `npm run test:visual` | Playwright captures 4 gold slice scenes, awaits `__NEVA_RENDER_READY`, and verifies pixel diffs within specified thresholds. |
| **Unified Developer CLI** | `node tools/cli.mjs --help`<br>`node tools/cli.mjs audio --help`<br>`node tools/cli.mjs art validate` | Subcommands execute reliably, return status code 0, and cleanly propagate child errors. |
| **Build & Typecheck** | `npm run typecheck`<br>`npm run build` | Zero TypeScript errors, clean Vite production bundle. |

---

*Survey complete and documented for integration by subsequent implementation agents.*
