# Handoff Report — Explorer 3: Neva Tools v2.0 Survey (Subsystems 4 & 5)

## 1. Observation
1. **Audio Tooling**:
   - `tools/audio/ingest-freesound.mjs` exists (142 lines). Downloads CC0 MP3 previews directly from Freesound and saves them into `public/assets/audio/`, upserting records in `assets/audio/audio-manifest.json`.
   - `tools/audio/normalizeBus.mjs` is currently **missing**.
   - `assets/audio/audio-manifest.json` defines 64 sources, ~70 cues, 9 banks, and 5 beds.
   - `tests/unit/audioManifest.test.ts` (105 lines) asserts duration > 0, SHA256 checksum match against bundled public files, and valid bus associations (`["sfx", "ambience", "ui", "weather", "boat", "fishing", "music"]`).
   - Host system has `ffmpeg` installed at `/opt/homebrew/bin/ffmpeg` and `ffprobe` at `/opt/homebrew/bin/ffprobe`.

2. **Visual Regression CI**:
   - `tests/e2e/art-pipeline.spec.ts` exists (204 lines) and measures visible triangles, draw calls, and FPS across 14 views.
   - `tests/e2e/visual-regression.spec.ts` is currently **missing**.
   - `playwright.config.ts` defines desktop chromium execution on port 3000 (default timeout 30s).
   - In `src/app/GameApp.ts` (lines 2388-2490), `window.__NEVA_DEBUG` is attached, but `window.__NEVA_RENDER_READY` is not yet set or exposed for Playwright visual synchronization.
   - Four visual-gold scenes are defined in `tools/TOOLS_UPGRADE_IMPLEMENTATION_SPEC.md` §6.1 with pixel difference thresholds: `bridge_river` (250 px), `starter_farm` (350 px), `harbor_market` (400 px), `lighthouse_coast` (300 px).

3. **Unified Developer CLI**:
   - `tools/blender/cli.mjs` exists (1816 lines) handling blender art tasks (`brief`, `generate`, `validate`, `sync`, `determinism`, `test-builders`).
   - `tools/cli.mjs` is currently **missing**.
   - `package.json` contains separate scripts for `art:*`, `ui:*`, `audio:ingest`, but lacks unified `cli`, `audio:normalize`, `test:visual`, `ci:regression`, and `clean` commands.

---

## 2. Logic Chain
1. **Audio Normalization**:
   - *Observation:* Un-normalized or flat -16 LUFS normalized audio flattens dynamic range, making soft ambient cues loud and drowning out UI/transients.
   - *Requirement:* Implementing `tools/audio/normalizeBus.mjs` with 2-pass stderr `loudnorm` extraction and bus-specific target LUFS (`ui_transient`: -18, `tools_work`: -20, `footsteps_movement`: -26, `environment_ambience`: -24, `animals_wildlife`: -22, `water_splashes`: -20, `dialogue_vocals`: -16) guarantees cozy mix balance.
   - *Requirement:* Updating `assets/audio/audio-manifest.json` with new SHA256 hashes and durations ensures `tests/unit/audioManifest.test.ts` passes.

2. **Deterministic Visual Regression**:
   - *Observation:* Rendering WebGL without locking sun angles, wind uniforms, particle seeds, and shader warmup causes screenshot diff flakiness in CI.
   - *Requirement:* Enforcing the 16-point determinism matrix in `tests/e2e/visual-regression.spec.ts` combined with `window.__NEVA_RENDER_READY` handshake in `GameApp.ts` provides 100% deterministic pixel comparison.

3. **Unified Developer CLI**:
   - *Observation:* Developers currently invoke disparate scripts across `tools/blender/cli.mjs`, `tools/ui/`, `tools/audio/`, and `package.json`.
   - *Requirement:* `tools/cli.mjs` unifies `art`, `layout`, `ui`, `audio`, `test`, `ci`, and `clean` under one CLI entry point with interactive fallback and scriptable flags.

---

## 3. Caveats
- No modifications were made to project source code during this survey (strictly read-only investigation).
- While `ffmpeg` is available on the local macOS development environment, CI pipelines must ensure `ffmpeg` and `chromium` are installed in the container/runner.
- Baseline screenshot PNGs for the four gold scenes will need to be generated upon first test execution with `--update-snapshots`.

---

## 4. Conclusion
Subsystems 4 & 5 are clearly specified and ready for implementation:
1. `tools/audio/normalizeBus.mjs` will implement category-based 2-pass `loudnorm` normalization and manifest synchronization.
2. `tests/e2e/visual-regression.spec.ts` will implement the 16-point determinism matrix and gold-slice assertions.
3. `tools/cli.mjs` will establish the root developer CLI routing to all subsystems.
4. `package.json` will be updated with backwards-compatible scripts.

Full survey document available at:
`/Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_3/survey_r4_r5.md`

---

## 5. Verification Method
1. Inspect Survey Document:
   - File: `/Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_3/survey_r4_r5.md`
2. Validate Existing Test Suite:
   - Run `npm run test` to confirm current unit and simulation tests pass.
3. Verify System Dependencies:
   - Check `which ffmpeg` and `which ffprobe`.
