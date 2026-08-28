# Progress — worker_m1_visuals_1

Last visited: 2026-08-28T14:07:00Z

- [x] Investigate character specs, generators, validation CLI, and triangle counts.
- [x] Upgrade `_build_npc_character` in `tools/blender/generators/characters.py` with authored occupational geometry for Elspeth, Barnaby, Silas, Maeve.
- [x] Calibrate triangle subdivisions and facet counts to hit 8,000–8,500 tris for NPCs and ~12,000 for Player LOD0 without warnings.
- [x] Ensure LOD1 levels remain within valid ratio ranges [0.08, 0.52].
- [x] Ensure palette tokens strictly respect <=6 materials per character.
- [x] Run `npm run art:generate -- --family character` (published 5 assets).
- [x] Run `npm run art:validate -- --family character` (5/5 passed with 0 errors).
- [x] Run `npm run art:determinism -- --family character` (semantic determinism passed for 5 assets).
- [x] Run `vitest run tests/unit/artPipeline.test.ts` (15/15 passed).
- [x] Write handoff report and notify parent.
