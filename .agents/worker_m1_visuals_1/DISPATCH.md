## 2026-08-28T13:57:25Z
You are worker_m1_visuals_1 (teamwork_preview_worker).
Your working directory is: /Users/anilkaraca/Desktop/Neva/.agents/worker_m1_visuals_1
You MUST create your directory if it doesn't exist and write all your metadata/handoff files there.

Read the authoritative files:
- /Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md
- /Users/anilkaraca/Desktop/Neva/PROJECT.md
- /Users/anilkaraca/Desktop/Neva/LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md
- /Users/anilkaraca/Desktop/Neva/LLM/BLENDER.md
- /Users/anilkaraca/Desktop/Neva/.agents/survey_explorer_art_1/handoff.md

Mission:
Execute Milestone 1: Procedural 3D Visual Modeling & Asset Catalog Validation.
Scope:
1. Upgrade and calibrate the procedural 3D visual models in `tools/blender/generators/characters.py` (`coastal_worker` and `npc_character`) for all 5 characters:
   - `char_player_a` (traveler/farmer: straw hat, utility vest, quilted lapels, cargo pockets, trousers, boots)
   - `char_npc_elspeth_a` (gardener: bonnet with ribbons, hair bun, apron bib & skirt, trowel holster)
   - `char_npc_barnaby_a` (handyman: flat cap, ear pencil, craftsman apron, tool belt, hammer)
   - `char_npc_silas_a` (dockmaster: sou'wester hat, sea coat, brass watch chain, foam-white beard)
   - `char_npc_maeve_a` (merchant: braided hair bun, neck scarf, fishmonger apron, scale pin)
2. Ensure distinct, readable occupational silhouettes adhering to the Neva Art Bible §13.
3. Calibrate triangle counts: Player LOD0 target ~12,000 tris (max 18,000); NPC LOD0 target 8,000–8,500 tris (max 16,000); valid LOD1 levels adhering to LOD ratios.
4. Ensure palette token assignments strictly use `neva.palette.json` with <=6 materials per character and valid `COLOR_0` baking.
5. Generate and validate character assets using:
   `npm run art:validate -- --family character`

Write ownership:
- You own `tools/blender/generators/characters.py` and `assets/specs/asset-catalog.json`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Write your handoff report to:
`/Users/anilkaraca/Desktop/Neva/.agents/worker_m1_visuals_1/handoff.md`
including verification commands and exact outputs, then notify your parent.
