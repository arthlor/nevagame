# Neva Implementation Status Checklist

> Evidence snapshot: 2026-08-26 (Europe/Istanbul)
>
> This file is a status snapshot and working checklist, not a new design or technical authority. The authority order remains `LLM/AGENTS.md`. Update this file in place when evidence changes; do not treat checked source presence as proof that a roadmap gate passed.

## 1. Audit basis

Canonical Markdown currently in `LLM/` (do not list deleted files):

- `LLM/AGENTS.md`
- `LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md`
- `LLM/02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md`
- `LLM/03_PRODUCTION_ROADMAP_LLM_AGENT_PLAYBOOK.md`
- `LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md`
- `LLM/LLM_AGENT_ART_PIPELINE_INSTRUCTIONS.md`
- `LLM/ARCHEAGE_FARMING_SYSTEM.md`
- `LLM/BLENDER.md`
- `LLM/IMPLEMENTATION_STATUS_CHECKLIST.md`

`LLM/GAME_IMPROVEMENT_RECOMMENDATIONS.md` is **deleted** and is not an authority. `LLM/.DS_Store` is macOS metadata, not a project document.

Evidence labels used below:

- **Green** — the phase's current gate has direct passing evidence.
- **Partial** — meaningful implementation exists, but one or more required gate checks failed or were not run.
- **Red** — a required current gate is known to fail.
- **Not reached** — sequencing or prerequisite gates prevent a completion claim.
- **Recorded human evidence** — the repository records a human decision; this audit does not recreate or reinterpret it.

## Guidance update — 2026-08-26

The canonical ground guidance now distinguishes selectively smoothed traversable grass/soil/path surfaces from strongly faceted cliffs, cuts, exposed banks, rocks, and hero landforms. It also requires terrain materials, authored routes/road presentation, shoreline dressing, and ground-cover density to derive from the same world-layout semantics.

The guidance is now implemented in the working tree. `WORLD_LAYOUT_V5` is the current single layout authority; layout 4 is the physical-road step, and layout 5 is the northeast village hub (mill pad, plaza/market, arterial terminus) with `(0, -5)` remaining a river-crossing gateway. `terrainBaseHeight()` owns the graded landform, while final `terrainHeight()` adds deterministic nonnegative road crown/rut/shoulder/feather relief and remains the placement/anchor/normal/save-grounding authority. Three.js renders indexed road geometry at that exact final height; Rapier combines `terrainBaseHeightfield()` with a static trimesh from the same road geometry, while catalog bridge collision continues to own the bridge deck. Terrain uses smooth indexed normals/colors on continuous ground and blends toward face normals/colors for steep or cliff-heavy samples; `TerrainSurfaceMaterial` is non-flat with the r174-v3 cache contract. After the first integrated human review rejected opaque olive road bands and evenly scattered dark grass, the unchanged shared road mesh now alpha-feathers its vertex-colored shoulder into the canonical terrain and uses softer rut contrast. Existing grass GLBs now form stronger deterministic density pockets with variant-specific broad, lower silhouettes, retained semantic exclusions, no grass shadow-map casting or receiving, and centralized low/medium/high density scales of 0.24/0.48/0.60.

The original physical-road change has save impact **yes** and migration **yes**. The subsequent 2026-08-26 human-review correction changes only road blending, rut color contrast, and ground-cover presentation: save impact **no**, migration **no**. `CURRENT_SCHEMA_VERSION` remains 13 and layout revision remains 5 because the northeast village hub follows the schema-12/layout-4 physical-road step. The repository `save_v11_layout3.json` fixture verifies unchanged X/Z, rotations, cargo, progression, and unrelated persisted state, final-height re-grounding for on-foot players and structures, and unchanged active-boat/player waterline state; `save_v12_layout4.json` covers the subsequent mill/plaza migration. The catalog and byte-identical generated/public manifests contain 172 assets, including `house_cottage_a`, `house_cottage_b`, `building_inn_a`, `building_village_market_hall_a`, and `building_barn_a`; their stored publication provenance does not yet match the concurrently changed catalog/palette/toolchain identity, so publication validation remains pending rather than being silently refreshed by this terrain task. First integrated visual review: **Rejected**. Corrective pass: **Awaiting human game review**.

Catalog `repo://` isolated studio sheets under `tools/blender/references/isolated/` are present on disk and git-tracked. Numbered crop PNGs listed in `tools/blender/references/README.md` (`01_hero_farmhouse.png` and siblings) were never checked in; treat that as graphics-extract debt, not a second reference authority.

## Current implementation update — 2026-08-25

The asset and quest audit has now been implemented in the working tree. This section is the current code/catalog baseline; the older broad-gate snapshot below remains useful as historical evidence, but its pre-change counts and quest findings should not be read as current behavior.

### Current asset baseline

- Generated/public manifests contain **92 assets**, generated at `2026-08-25T11:06:26.231Z`.
- Mechanical report: **73 on target**, **19 below target**, `artContractPassed: true`; visual status remains a candidate awaiting human gameplay-camera review.
- Authored world placement now includes the previously unplaced `prop_wagon_cart_a` and `fauna_cow_a`.
- `fish_trout_a` and `fish_tuna_a` are now presented as animated school members when their corresponding sport-fish school is active.
- Tomato/potato stages remain conditional crop presentation. `boat_skiff_a` is a progression-world asset: it is not created by a fresh save, but is now materialized by the live skiff purchase contract after the Fishing XP and money requirements are met.

### Complete asset coverage contract

- `src/render/assets/AssetCoverage.ts` derives a one-record-per-catalog-asset contract from the 92-asset catalog, the authored environment layout, runtime landmark owners, NPC/crop/fish/boat definitions, and action attachment bindings. It does not maintain a second filename registry.
- Current disposition counts are **58 static-world**, **15 dynamic-world**, **18 conditional-world**, and **1 progression-world**; **65** assets are visible in a fresh save. Every record includes its placement source, world context, fresh-save visibility, and activation trigger.
- `tests/unit/assetPlacementAudit.test.ts` fails on catalog/public manifest mismatch, duplicate or unclassified IDs, missing GLBs, invalid grounding, unusable boat moorings, or missing crop/fish/tool bindings. Generated and public manifests are checked for 92-asset parity.
- Static farm, village, bridge, harbor, and coast landmarks are loaded by `WorldScene`/`WorldEnvironmentLayout`; crop stages are reachable through planting and growth; trout/tuna meshes are reachable through active sport-fishing schools; action tools/props are reachable through their simulation-owned presentation sockets; the skiff is reachable at `HARBOR_SKIFF_MOORING` after purchase.

### Current quest and persistence implementation

- The story chain has **10 explicit quests** with `nextQuestId` links rather than relying on registry insertion order.
- Objective events now require exact targets and declared farm/station/habitat/market/boat context. The Act 2 compost step, Act 5 chum step, dock step, and final Silas report are explicit objectives.
- NPC dialogue and quest completion now require speaker proximity, the active quest, a completed final step, and atomic reward capacity. Rowboat commissioning consumes **30 G + 1 Ground Grain** and records `boat.player_rowboat` in persisted quest feature unlocks.
- Fresh saves retain the physical docked rowboat as world content, but boarding is locked until the commission reward is granted. Schema **11** preserves the existing keyed `boats` record; no schema bump is required for the persisted second skiff. The current migrations preserve the feature-unlock list, the one-time Act 5 starter-school flag, harbor fish-table structure, and legacy cargo conversion.
- Act 5 guarantees one deterministic lake trout school after the rowboat is commissioned, independent of fresh-save weather/timing. Cargo emits `FishLanded` before `CargoLoaded`, allowing the authored land → stow progression to advance.
- The skiff purchase is atomic: it validates the harbor access point, Fishing XP ≥ 15,000, and 850 G before creating `boat.player_skiff`, its supply inventory, cargo slots, mooring position, and persisted ownership. Boarding, docking, cargo, HUD, ledger, physics, and rendering resolve the active boat by ID.
- The authored farm and harbor layouts keep interaction footprints readable: farm production props occupy clear meadow/road footprints; the harbor market is inland at `HARBOR_MARKET` `(64, 60)`, the persisted fish-cleaning table remains at `(71, 60.8)`, Maeve uses the market-side approach `(65.5, 66.9)`, Silas remains on the harbor-pier approach `(78.5, 64.5)`, and the docked rowboat, crates, barrel, trap, net rack, lamps, and skiff mooring use separate deterministic anchors. The harbor arterial and coastal walk now terminate at the same market anchor; no save-schema bump was required.
- The quest tracker is mounted in the HUD, the journal contains active/completed quest records, dialogue reward UI snapshots the completed quest, planner access is gated by `feature.expedition_planner`, and quest changes are autosave triggers.

### Current quest coverage map

| Quest area | Current state |
|---|---|
| Act 1 farming | Elspeth, starter farm, wheat objectives, farm-scoped events, and mounted HUD tracker are implemented. |
| Act 2 processing | Compost, windmill/hand-mill, and workbench objectives are explicit and station-scoped; waypoints use canonical anchors. |
| Act 3 river/market | River habitat and village-market predicates are enforced; bridge and produce-stall waypoints use canonical anchors. |
| Act 4 harbor | Maeve and Silas require proximity; rowboat commission requirements and feature unlock are enforced. |
| Act 5 expedition | Board → chum → hook → land → stow → dock → sell → report is explicit; deterministic starter school and fish presentation are implemented. |

### Current verification boundary

- The human-review correction for road blending and grass presentation passes **62/62** focused terrain, road-geometry, road-environment, physics, and terrain-material tests. Typecheck, lint, codegen parity, and the production build pass. The Playwright CLI wrapper could not resolve its `playwright-cli` binary, so no new browser or screenshot claim is attached to this corrective pass.
- The 2026-08-26 terrain/road focused suites are green, including **74/74** current world-layout/road/physics/persistence tests and **11/11** road/material tests. The latest full Vitest run passes **349/350** tests; its sole failure is the existing art-pipeline publication-provenance check described below, not terrain, road, physics, grass, or persistence behavior.
- `npm run art:codegen:check`, `npm run typecheck`, `npm run lint`, and the production build pass on the current **172-asset** adapter. Lint reports one pre-existing `console` warning in the gameplay-systems skill template. `tests/unit/artPipeline.test.ts` passes **14/15** checks: generated/public copies are byte-identical and complete, but their stored catalog/palette/toolchain identity is stale after concurrent art changes. This terrain pass did not republish those unrelated assets.
- Focused Chromium traversal and budget verification passes **3/3**. The definitive 0.60-density high-tier scene is **88 draw calls and 852,419 visible triangles**, below the preferred **≤220 / ≤900k** limits.
- Chromium local review matrix now boots farm, crop stages, farmhouse interior, village market, bridge, harbor/rowboat/skiff, coast, trout, and tuna views with a canvas, coverage diagnostics, zero console errors/warnings, and no repeated `toNonIndexed()` warnings. Representative views remain below the 220 draw-call / 900k triangle high-tier targets. Screenshots are mechanical evidence only; human integrated gameplay-camera approval, full cross-browser coverage, and complete quest-flow E2E proof remain outstanding.
- The runtime loader preserves authored full-resolution visibility when the current published GLB is missing an optional catalog LOD node; strict art validation remains responsible for rejecting that catalog/artifact mismatch before publication.
- Static/type/test evidence does not replace integrated gameplay-camera review, complete cross-browser gates, or human visual approval.

## 2. Git and verification snapshot

### Git

- Branch: `main`
- HEAD: `7293da6fb0ad3ba0d377f803b10cb227b90eab44` (`Initial Neva game source and remediation`, 2026-08-24 09:52:30 +0300)
- Repository history: one commit.
- Before adding this checklist, the working tree had 238 changed paths: 123 tracked modifications, 2 tracked deletions, and 113 untracked paths.
- The tracked diff covered 125 files with 23,857 insertions and 7,032 deletions, plus binary GLB/image changes.
- This snapshot therefore describes `main` **plus a very large uncommitted working tree**, not a clean commit or release candidate.
- No save migration or deployment was performed by this audit.

### Checks run for this audit

The table below is retained only as the historical pre-change gate snapshot. Use the current implementation evidence in section 1 above for this terrain/road pass; do not reinterpret the older counts as current results.

| Check | Result | What it proves |
|---|---|---|
| `npm run art:codegen:check` | Pass; 92 catalog assets | Generated TypeScript catalog projection matches the current catalog. |
| TypeScript `tsc --noEmit` | Pass | Current TypeScript sources type-check. |
| `eslint .` | Pass with 3 `console.log` warnings in `neva-world-check.ts` | No lint errors; warnings remain. |
| `npm run build` | Pass | Production bundle builds. Output was 14.79 MiB, under the documented 20 MiB initial-load target. Vite warned that the Rapier chunk is about 2.06 MB minified. |
| Full Vitest suite | **~262 `it`/`test` cases in `tests/` (grep 2026-08-25); typecheck expected green** | Do not use the old 212-case fail snapshot. Suite is larger now. Passing count last reported around 255; this checklist does not re-run the suite. |
| Chromium gameplay/control E2E | **Art review matrix passes; full gameplay loop remains unproven** | The 11-view authored placement matrix boots cleanly, but do not mark P12 complete without the new-save quest/control loop. Do not cascade this into empty/Red for P0–P11 systems that exist in src. |
| Firefox continuation | Incomplete | The first movement/camera scenario passed; the deep jump case was skipped by design; the run was stopped after repeated Chromium blockers. |
| WebKit | Not run | No current Safari/WebKit evidence. |
| Browser screenshot inspection | Mechanical inspection only | The game rendered a farm scene, character, HUD, controls, and debug overlay. This is not visual approval. |

### Current automated failures

Historical (stale) Vitest failure clusters — do not treat as current:

- `tests/simulation/gameplayFixes.test.ts` — 7 failures around habitat/catch expectations, fish-school coordinates, and the old safe-spawn position.
- `tests/simulation/persistence.test.ts` — the historical layout-revision expectation has been superseded by the passing schema-12/layout-4 fixture migration coverage.
- `tests/simulation/ownership.test.ts` — 2 crop-placement/ownership failures around the moved starter layout.
- `tests/simulation/simulationLoop.test.ts` — 1 fish-school/habitat failure, so the full deterministic vertical loop is not green.
- `tests/unit/physicsEdgeCases.test.ts` — 2 collision/tunneling failures.
- `tests/unit/physicsWorld.test.ts` — 4 static collision, camera sweep, bridge traversal, and boat collision failures.
- `tests/unit/worldLayout.test.ts` — the historical terrain/landmark-height timeout is superseded by the focused passing terrain/road/selective-normal run.

Observed Chromium failures included insufficient movement after camera rotation, jump not returning to grounded within the assertion window, gait/presentation drift, harvest remaining in idle, farmhouse collision timeout, harbor/boat interaction instability, crop placement timeout, and deterministic sport-fishing setup failure. The isolated three-test gameplay smoke also failed to locate clock/debug elements even though its DOM snapshot and screenshot contained them; treat those three as a test-harness/served-build synchronization problem until diagnosed, not as proof that the visible HUD failed to render.

## 3. Roadmap gate status

Mechanical systems through P11 exist in src. P0.75 strict visual gate is still open. P12 browser-loop is not proven. The table separates code presence from completion evidence; do not mark P0–P11 empty/Red from the old 212-case Vitest snapshot.

| Phase | Status | Current repository evidence | Missing or failing gate evidence |
|---|---|---|---|
| P0 — Repository & Architecture | **Partial** | Deterministic simulation structure, content registry, input/mode separation, Three.js presentation, debug HUD, schema 13 / layout 5 with explicit v11/layout-3 and v12/layout-4 migration fixtures, 172-asset catalog/manifest parity after village-building publication, terrain-focused tests, lint, and focused Chromium traversal are green. | The complete P0/P12 gameplay loop also remains broader than this focused traversal gate. |
| P0.5 — Visual Rendering Foundation | **Partial** | `VisualRenderConfig`, palette materials/tokens, lighting, water, asset loader, generated catalog adapter, batching/instancing support, Art Yard, and diagnostics exist. The shared physical-road surface, base-heightfield + exact road trimesh, selective normals/colors, r174-v3 terrain material, and monotonic clustered ground cover are implemented with focused tests. Chromium measures 88 draw calls / 852,419 triangles at the definitive 0.60-density high-tier view. | Human gameplay-camera review remains pending; do not infer visual approval from automated geometry or budget evidence. |
| P0.75 — Gold-Standard Art Slice | **Partial** | `approved-baselines.json` records human approval for farm/bridge/harbor/coast on 2026-08-24. Generated/public manifests contain 92 assets. Mechanical world exists. | Latest report: 19 `below_target`, `strict: false`. `art:generate:strict` is not the daily gate and is still open. Do not claim P0.75 fully passed. |
| P1 — Walkable World | **Partial** | Large authored multi-district world with the northeast village as the market/mill/road hub, movement, mouse camera, input modes (pause is overlay, not GameplayMode), interactions, collision adapters, and contextual prompts exist. | Browser/Playwright walkable-world gate is not proven. Do not use stale physics-test failures as the only current evidence. |
| P2 — Persistence & Time | **Partial** | IndexedDB repository, schema 13 / layout 5, migrate-then-validate, **primary + backup keys only** (quick-save writes primary, no third manual slot). The schema-11/layout-3 fixture verifies physical-road re-grounding, active-boat preservation, and unrelated-state preservation; the schema-12/layout-4 fixture verifies the subsequent mill/plaza village-hub move. IDB fail returns false (no RAM promotion). Weather-bounded offline progression and quest `nextQuestId` remain intact. | Full save/reload browser proof not run. Overlay pause is not a serializable sim mode. |
| P3 — Farming Vertical Slice | **Partial** | Placement/actions, moisture/fertility/growth/harvest (`farm.apply-fertilizer` +20, clamp 10–100), journals, starter plots, and crop rendering exist. | New-save plant-save-advance-load-harvest is not proven in browser. Orchard persist+regrow on successful harvest is LIVE; wither-delete of regrow crops is a parallel fix. |
| P4 — Inventory & Processing | **Partial** | Finite inventories, atomic operations, processing jobs, compost, **8 recipes**. Harbor fish-table at `HARBOR_FISH_TABLE`; `fish_to_fertilizer` / `perch_to_scraps` / `mackerel_to_scraps` require `stationType` fish-table. | Full-inventory plus cancel/reload and the complete three-recipe browser loop were not proven together. |
| P5 — Basic Fishing | **Partial** | Deterministic five-phase minigame exists. Missed bite = miss; `willCatch` default false. Held-state `fishing` input. Basic-fishing blocks inventory. | Sport-fishing should also block inventory (parallel code fix). P12 loop not proven. |
| P6 — Boats | **Partial** | Rowboat/skiff definitions, atomic skiff purchase, boarding/driving/docking, two-boat persistence, and Act 4 commission exist. Physics may sample WaterSurface for boat bob; canonical boat.y stays waterline. | Emergency Tow / hook-class are not live. Browser dock/board/sail loop is not proven. |
| P7 — Sport Fishing | **Partial** | Deterministic schools, encounter state machine, held-state reel/slack/brace plus fish-left/right, species profiles, HUD exist. Landing is auto-stow or FishEscaped. Lure not required to hook. | Human species-behavior identification and browser sport loop are not proven. |
| P8 — Physical Cargo & Freshness | **Partial** | Finite physical fish cargo, one-location modeling, freshness decay, transfer/sale logic, and cargo UI exist; relevant unit assertions pass. | Empty/partial/external-hook boat screenshots and a current browser transfer/no-clone proof were not completed. |
| P9 — Market Economy | **Partial** | Village/harbor markets, deterministic demand/trend/season/freshness pricing, atomic sale, price-breakdown UI. LIVE stall **sells wheat/tomato/potato seed only**; produce quality does not affect sale price (journal only). | Full 8-seed shop is Deferred. No current browser proof of repeated tuna demand decay/recovery. |
| P10 — Progression & Contracts | **Partial** | Five rods, proficiency XP/ranks, five contract templates, journal, gated expedition board, explicit quest `nextQuestId` chain and feature unlocks, and live skiff purchase. Rank unlock tables (`farmingUnlocks` etc.) are unused; LIVE gates are `crop.minimumFarmingXp`, a few `recipe.minimumSkill`, and the skiff XP/money contract. Buy-rod remains deferred. | Three capability-changing milestones are not proven in a new-save browser run. |
| P11 — Weather & Seasons | **Partial** | Seeded weather schedule, seasons, crop/market modifiers, renderer response, forecast/UI. Weather enum has **no drought**; growth buffs `light-rain` and `heavy-rain` at 1.05. | No current real-play proof that weather/season changes the correct player decision. |
| P12 — Full Vertical-Slice QA | **Red / not proven** | Systems through P11 exist in src; the authored 11-view placement/browser matrix is clean and content counts look like P13 tables. | Full new-save wheat-through-quest-through-reload browser proof is still missing. **Do not** mark P12 complete. |
| P13 — MVP Content Expansion | **Not reached / content tables exist** | Definitions already contain **8 crops, 12 fish, 2 boats, 8 recipes**, 5 contract templates, and 5 rods. Shop LIVE-sells wheat/tomato/potato only. | P13 is sequenced only after P12. Do not call P13 complete. Runtime art covers wheat/tomato/potato stages and trout/tuna fish models only. |
| P14 — Final Art, Audio & UX Polish | **Not reached / partial polish exists** | 92 catalog assets, complete contextual coverage classification, character/crop presentation, fish-school presentation, VFX, UI polish, accessibility/reduced-motion work, ambient/farming audio, interiors, vegetation, boats, and world dressing exist. | P12 is not green; 19 assets are below target; audio covers ambience/farming/processing but not the complete fishing/boat/market loop; no current human in-game approval. |
| P15 — Performance & Browsers | **Partial** | Build size is under the initial-load target; Meshopt, batching, camera-distance character detail LOD, instancing, and performance diagnostics exist. The fresh 11-view Chromium matrix stayed below 220 draws / 900k triangles and emitted no startup errors or geometry warnings. | Cross-browser coverage and hardware-FPS proof remain open; the local review matrix is mechanical evidence only. |
| P16 — Release Candidate | **Not reached** | No valid completion claim. | Huge uncommitted tree, failed unit/E2E gates, incomplete browser matrix, unresolved strict art debt, exposed debug tools, and no full-loop release proof. |

### Roadmap completion checklist

- [ ] P0 gate passes from the current working tree.
- [ ] P0.5 renderer/material/Art Yard gate is re-proven from the current working tree.
- [ ] P0.75 strict gold-slice mechanical gate passes; recorded human references remain the visual baseline.
- [ ] P1 walkable-world movement/camera/collision/input gate passes.
- [ ] P2 persistence/time gate passes with schema-11 migration fixtures.
- [ ] P3 farming save/load/harvest-once gate passes.
- [ ] P4 inventory/processing/full-inventory/cancel-reload gate passes.
- [ ] P5 deterministic basic-fishing habitat gate passes.
- [ ] P6 dock/board/sail/dock/save/reload plus acquisition gate passes.
- [ ] P7 sport-fishing behavior and human identification gate passes.
- [ ] P8 physical cargo/freshness/no-clone gate passes.
- [ ] P9 market demand/freshness/single-formula gate passes.
- [ ] P10 three capability-changing milestones pass.
- [ ] P11 weather/season decision gate passes in real play.
- [ ] P12 entire new-save vertical slice passes in simulation, integration, E2E, and Chromium/Firefox/WebKit.
- [ ] P13 content expansion is reconciled with the required P12-first sequence and receives complete runtime coverage.
- [ ] P14 final art/audio/UX coverage passes current mechanical and human in-game review gates.
- [ ] P15 target performance and browser compatibility pass on representative hardware/browsers.
- [ ] P16 release-candidate gate passes from a clean, reviewable commit.

## 4. Vertical-slice acceptance checklist

The canonical list below comes from `02` section 19. A box remains open unless the complete new-save behavior is currently proven; partial implementation is stated explicitly.

- [ ] Move through starter world — controller/world exist; Chromium movement and collision evidence is red.
- [ ] Sprint drains/recovers without affecting Work Capacity — unit mechanics exist; Chromium jump/sprint flow is red.
- [ ] Obtain wheat seed — a new save starts with wheat seed; an obtain/acquisition action is not proven.
- [ ] Plant and water wheat — mechanics exist; current ownership/placement and browser flow fail.
- [ ] Save/quit and return after offline growth — offline/persistence logic exists; not proven in the full current loop.
- [ ] Harvest exactly once — unit mechanics exist; current browser harvest/presentation flow fails.
- [ ] Place Worm Compost and harvest bait worms — compost/recipe exist, but the new-save placement-to-harvest flow is not proven.
- [ ] Grind grain and craft chum — processing recipes exist; not proven through the passing full loop.
- [ ] Basic fish — focused minigame passes; habitat/catch integration is red.
- [ ] Commission rowboat — fresh save has the docked physical boat, but the Act 4 30 G + Ground Grain commission and browser boarding path still need end-to-end proof.
- [ ] Sail to sport-fishing area — boat code exists; boat/harbor/collision gates are red.
- [ ] Visually discover school — school rendering exists; no current browser/human proof.
- [ ] Chum school — simulation code exists; current school setup fails in integration.
- [ ] Hook fish — encounter code exists; current sport-fishing startup fails.
- [ ] Reel/slack/brace — input/state/UI exist; current sport-fishing E2E startup fails before the control assertions.
- [ ] Land fish — deterministic landing logic exists; no passing current end-to-end encounter.
- [ ] Physically carry/store fish — cargo model exists; no passing current browser transfer proof.
- [ ] Freshness decays with time — focused mechanics pass; still unproven inside the full new-save loop.
- [ ] Dock and sell — market/sale code exists; boat/dock browser gate is red.
- [ ] Price breakdown visible — UI implementation exists; no current passing browser gate.
- [ ] Gain Fishing XP — progression implementation exists; no current passing full-loop proof.
- [ ] Buy/unlock capability — definitions exist; no passing current milestone flow.
- [ ] Reload with all progression intact — persistence exists; the full-loop simulation and browser matrix are red.

**Conclusion:** P12 is incomplete under the canonical rule “any missing step = incomplete vertical slice.”

## 5. Art and asset pipeline state

### Lean routine pipeline implementation

- [x] `art:preview` is absent from package scripts and CLI help paths; `tools/blender/preview.py` is deleted in the working tree.
- [x] Routine guidance says generate/publish, use the Art Yard, integrate in game, and await human game review without agent-led static preview scoring.
- [x] Catalog commands require an explicit asset/family or explicit release `--all` path.
- [x] Art Yard deep-link implementation and focused plugin tests exist.
- [x] Staging currently contains exactly three run directories.
- [x] Generated report and public manifests are byte-identical, each with 92 assets and the same spec/palette/toolchain hashes.
- [x] Normal generation keeps the published mechanical GLB contract intact and reports target debt separately.
- [x] `LLM/AGENTS.md` no longer says `BLENDER.md` covers previews; static previews are forbidden and `preview.py` is gone.

### Current asset acceptance debt

Latest report: `generated/reports/asset_budget_report.json`, generated 2026-08-25T11:06:26.231Z.

- Assets: 92
- On target: 73
- Below target: 19
- Hard contract failures: 0 (`artContractPassed: true`)
- Visual status: `candidate`, not human-approved by generation alone
- Strict report flag: `false`

Below-target IDs:

- `building_fish_market_a`
- `building_lighthouse_a`
- `building_windmill_a`
- `char_npc_barnaby_a`
- `char_npc_elspeth_a`
- `char_npc_maeve_a`
- `char_npc_silas_a`
- `char_player_a`
- `fauna_chicken_a`
- `fauna_cow_a`
- `interior_farmhouse_shell`
- `prop_armchair_cozy_a`
- `prop_bed_cozy_a`
- `prop_chair_rustic_a`
- `prop_cupboard_shelves_a`
- `prop_farm_workbench_a`
- `prop_produce_stall_a`
- `prop_table_dining_a`
- `prop_water_well_a`

Recorded human evidence: `tests/visual/reference/approved-baselines.json` records farm, bridge, harbor, and coast approval by `human-art-director` on 2026-08-24. This audit accepts that registry as historical human evidence but does not claim the current game is visually approved. Current approval still requires the user to review the actual game, and strict mechanical debt remains unresolved.

## 6. Documentation/code drift to resolve

- [x] Implement the revised shared ground contract: class-aware/selective normals and colors, physical canonical road relief, exact shared render/Rapier road geometry, and clustered monotonic ground cover. Human gameplay-camera proof remains pending.
- [x] Update canonical save guidance through schema 13 / layout 5 while retaining v10 fish-table, v11 trout-stack, v12 physical-road, and v13 northeast village-hub migration history.
- [x] Add `tests/fixtures/save_v11_layout3.json` and focused migration coverage for player, structures, active boats, and unrelated persisted state.
- [x] Preserve the physical-road upgrade as the schema-12/layout-4 migration, then reconcile the concurrent schema-13/layout-5 authority without dropping either fixture or migration.
- [x] Reconcile the canonical rowboat step: fresh saves retain the physical boat, while Act 4 commission now consumes 30 G + Ground Grain and unlocks boarding; browser proof remains open.
- [x] Reconcile the authored quest line with explicit event targets, location predicates, canonical waypoints, atomic rewards, cargo event ordering, and the deterministic Act 5 starter school.
- [x] Reconcile the created-asset placement audit: wagon/cow are authored into the world and sport-fish GLBs are presentation-bound; conditional crops and the fresh-save-absent skiff are explicitly classified, with no audited asset left Art Yard-only.
- [ ] Reconcile P13's “only after P12” rule with already-added 8-crop/12-fish definitions and partial P14 world/art/audio work. Preserve useful work, but do not call these phases complete ahead of P12.
- [x] HUD Work Capacity is labeled **Labor** and is not a hard block (empty Labor = reduced XP/rare chance).
- [x] Residual “previews” wording removed from `LLM/AGENTS.md`; remaining mention is that static previews are forbidden.

## 7. Next evidence-driven work order

These are the shortest blocking steps implied by the canonical phase order; they are not authorization to change gameplay direction.

1. [x] Advance the physical-road world through layout revision 4, reconcile the subsequent layout-5 northeast village hub, align shared height/collision owners, and cover both historical layouts through migration.
2. [ ] Fix the real physics/traversal failures: corner collision, sprint tunneling, static collision, camera sweep, bridge traversal, boat collision, regrounding, and Chromium movement distance.
3. [ ] Restore deterministic basic/sport fishing setup against the current habitats and world coordinates.
4. [ ] Diagnose Playwright's isolated locator mismatch using a fresh non-reused dev server, then rerun only the affected Chromium smoke/control tests.
5. [ ] Make the deterministic P12 simulation loop pass from a new save, including a real rowboat acquisition/capability step or an explicitly approved canonical change.
6. [ ] Rerun the complete P12 browser matrix only after the narrow failures are green.
7. [ ] Resolve the 19 below-target assets and run the P0.75 strict/validate/determinism/benchmark gate as one release/gold-slice check; leave visual judgment to the human in the game.
8. [ ] Reconcile content/art/audio coverage for all 8 crops and 12 fish only after P12 is green.
9. [ ] Profile representative hardware and Safari/WebKit for P15; do not treat SwiftShader FPS as hardware performance proof.
10. [ ] Split the large dirty tree into reviewable, intentional commits before any P16 claim.

## 8. Completion definition for this checklist

When updating a box, attach the narrowest current evidence: command/test name, passing count, relevant asset IDs or simulation path, and whether it is static, browser-runtime, hardware-performance, or human visual proof. Never infer one proof layer from another.
