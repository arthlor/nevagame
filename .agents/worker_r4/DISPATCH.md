## 2026-08-30T10:43:53Z
Task: Implement Milestone 4 (R4: Category-Based Bus Audio Normalization)
Working directory: /Users/anilkaraca/Desktop/Neva/.agents/worker_r4/
Scope:
1. `tools/audio/normalizeBus.mjs` & `tools/audio/normalizeBus.d.mts`:
   - Category Target Matrix (ui_transient, tools_work, footsteps_movement, environment_ambience, animals_wildlife, water_splashes, dialogue_vocals, music, weather)
   - 2-pass EBU R128 (`loudnorm`) processing with ffmpeg
   - Channel topology preservation (mono vs stereo)
   - Synchronize with `assets/audio/audio-manifest.json` (duration, channels, sha256 hash)
   - CLI options: `--bus <name>`, `--check`, `--force`, `--dry-run`
2. `package.json`: `audio:normalize`, `audio:normalize:check`
3. Unit tests: `tests/unit/audioNormalization.test.ts` + verify `tests/unit/audioManifest.test.ts`
4. Verification: `npm run typecheck`, `npm run test`
