# Neva Implementation Status Checklist

> Evidence snapshot: 2026-08-27 (Europe/Istanbul)
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

The guidance is now implemented in the working tree. `WORLD_LAYOUT_V5` is the current single layout authority symbol, its live layout revision is 7, and the authored runtime world uses a finite 600 m terrain field with no chunk-streaming system. Layout 4 is the physical-road step, and layout 5 is the northeast village hub (mill pad, plaza/market, arterial terminus) with `(0, -5)` remaining a river-crossing gateway. `terrainBaseHeight()` owns the graded landform, while final `terrainHeight()` adds deterministic nonnegative road crown/rut/shoulder/feather relief and remains the placement/anchor/normal/save-grounding authority. Three.js renders indexed road geometry at that exact final height; Rapier combines `terrainBaseHeightfield()` with a static trimesh from the same road geometry, while catalog bridge collision continues to own the bridge deck. Terrain uses smooth indexed normals/colors on continuous ground and blends toward face normals/colors for steep or cliff-heavy samples; `TerrainSurfaceMaterial` is non-flat with the r174-v3 cache contract. After the first integrated human review rejected opaque olive road bands and evenly scattered dark grass, the unchanged shared road mesh now alpha-feathers its vertex-colored shoulder into the canonical terrain and uses softer rut contrast. Existing grass GLBs now form stronger deterministic density pockets with variant-specific broad, lower silhouettes, retained semantic exclusions, no grass shadow-map casting or receiving, and centralized low/medium/high density scales of 0.24/0.48/0.60.

The original physical-road change has save impact **yes** and migration **yes**. The subsequent 2026-08-26 human-review correction changes only road blending, rut color contrast, and ground-cover presentation: save impact **no**, migration **no**. The later authored station and walkable-topology changes have save impact **yes** and migration **yes**. `CURRENT_SCHEMA_VERSION` is 16 and layout revision is 7; schema 14 remains the frozen layout-6 boundary, schema 15 relocates the canonical starter stations plus harbor fish table, adopts the current bridge/road/terrain topology, and re-grounds land truth without changing active-boat waterlines, and schema 16 preserves layout 7 while normalizing legacy clock speed and persisting the forecast successor. The repository `save_v11_layout3.json`, `save_v12_layout4.json`, `save_v13_layout5.json`, and `save_v14_layout6.json` fixtures cover the historical layout migration steps; the migration implementation also preserves layout 7 while normalizing clock speed and the forecast successor. The live catalog and public manifest contain 188 asset records and the corresponding public GLBs are present; canonical sync refreshed the manifest provenance and `art:validate -- --all` passes. The 2026-08-27 human visual-gold decision accepts the four bridge/farm/harbor/coast scenes without numeric scores. Technical-art certification and the current-tree benchmark gate remain open.

Catalog `repo://` isolated studio sheets under `tools/blender/references/isolated/` are present on disk and git-tracked. Numbered crop PNGs listed in `tools/blender/references/README.md` (`01_hero_farmhouse.png` and siblings) were never checked in; treat that as graphics-extract debt, not a second reference authority.

## Current implementation update — 2026-08-27

The asset and quest audit has now been implemented in the working tree. This section is the current code/catalog baseline; the older broad-gate snapshot below remains useful as historical evidence, but its pre-change counts and quest findings should not be read as current behavior.

### Current asset baseline

- The live source catalog and public manifest contain **188 assets**. The public manifest was synchronized at `2026-08-27T12:10:03.113Z`; record/GLB coverage, generated/public byte identity, and `npm run art:validate -- --all` pass against the current catalog/palette/toolchain provenance.
- Current public-manifest summary: **155 on target**, **33 below target**, `artContractPassed: true`; the 2026-08-27 four-scene human visual-gold decision is recorded, while technical-art certification and the current-tree benchmark rerun remain open.
- Authored world placement now includes the previously unplaced `prop_wagon_cart_a` and `fauna_cow_a`.
- `fish_trout_a` and `fish_tuna_a` are now presented as animated school members when their corresponding sport-fish school is active.
- Tomato/potato stages remain conditional crop presentation. `boat_skiff_a` is a progression-world asset: it is not created by a fresh save, but is now materialized by the live skiff purchase contract after the Fishing XP and money requirements are met.

### Complete asset coverage contract

- `src/render/assets/AssetCoverage.ts` derives a one-record-per-catalog-asset contract from the catalog, the authored environment layout, runtime landmark owners, NPC/crop/fish/boat definitions, and action attachment bindings. It does not maintain a second filename registry. The live catalog and public manifest each contain 188 records, with publication identity synchronized through the owning art workflow.
- Current disposition counts are **90 static-world**, **15 dynamic-world**, **18 conditional-world**, and **1 progression-world**; **144** assets are visible in a fresh save. Every record includes its placement source, world context, fresh-save visibility, and activation trigger.
- `tests/unit/assetPlacementAudit.test.ts` fails on catalog/public manifest mismatch, duplicate or unclassified IDs, missing GLBs, invalid grounding, unusable boat moorings, or missing crop/fish/tool bindings. Current record, GLB, coverage, generated/public byte-parity, and synchronized publication identity checks pass at 188 assets.
- Static farm, village, bridge, harbor, and coast landmarks are loaded by `WorldScene`/`WorldEnvironmentLayout`; crop stages are reachable through planting and growth; trout/tuna meshes are reachable through active sport-fishing schools; action tools/props are reachable through their simulation-owned presentation sockets; the skiff is reachable at `HARBOR_SKIFF_MOORING` after purchase.

### Current quest and persistence implementation

- The story chain has **10 explicit quests** with `nextQuestId` links rather than relying on registry insertion order.
- Objective events now require exact targets and declared farm/station/habitat/market/boat context. The Act 2 compost step, Act 5 chum step, dock step, and final Silas report are explicit objectives.
- NPC dialogue and quest completion now require speaker proximity, the active quest, a completed final step, and atomic reward capacity. Rowboat commissioning consumes **30 G + 1 Ground Grain** and records `boat.player_rowboat` in persisted quest feature unlocks.
- Fresh saves retain the physical docked rowboat as world content, but boarding is locked until the commission reward is granted. Schema **11** preserves the existing keyed `boats` record; no schema bump is required for the persisted second skiff. The current migrations preserve the feature-unlock list, the one-time Act 5 starter-school flag, harbor fish-table structure, and legacy cargo conversion.
- Act 5 guarantees one deterministic lake trout school after the rowboat is commissioned, independent of fresh-save weather/timing. Cargo emits `FishLanded` before `CargoLoaded`, allowing the authored land → stow progression to advance.
- The skiff purchase is atomic: it validates the harbor access point, Fishing XP ≥ 15,000, and 850 G before creating `boat.player_skiff`, its supply inventory, cargo slots, mooring position, and persisted ownership. Boarding, docking, cargo, HUD, ledger, physics, and rendering resolve the active boat by ID.
- The authored farm and harbor layouts keep interaction footprints readable: farm production props occupy clear meadow/road footprints; the harbor market is inland at `HARBOR_MARKET` `(64, 60)`, the persisted fish-cleaning table is at `(70.8, 61.8)`, Maeve uses the market-side approach `(65.5, 66.9)`, Silas uses the harbor-pier approach `(83, 61)`, and the docked rowboat, crates, barrel, trap, net rack, lamps, and skiff mooring use separate deterministic anchors. The harbor arterial and coastal walk terminate at the same market anchor; schema 15/layout 7 migrates the persisted fish table and other canonical stations to the current composition, while schema 16 keeps those world anchors unchanged.
- The quest tracker is mounted in the HUD, the journal contains active/completed quest records, dialogue reward UI snapshots the completed quest, planner access is gated by `feature.expedition_planner`, and quest changes are autosave triggers.

### Current narrative contract — 2026-08-27

- The current story is a ten-quest, linear coastal-inheritance spine: arrival/welcome → stewardship → farm-to-fishing preparation → river learning → village exchange → harbor responsibility → earned rowboat → first expedition → open horizons. Exact text and objective data remain in `src/content/quests.ts`; NPC roles and idle texture remain in `src/content/npcs.ts`.
- Narrative is integrated with the loop through explicit people, places, actions, and consequences. Elspeth owns the welcome/soil/trade handoffs; Barnaby connects harvest to compost, grain, and chum; Old Silas teaches currents, controls the family rowboat threshold, and receives the final report; Maeve teaches freshness, demand, and responsible sale.
- The simulation owns the story outcome: `QuestDomain` validates proximity, speaker, target/location predicates, final-step completion, atomic rewards, and `nextQuestId`. The dialogue modal, HUD, journal, audio, and world art are presentation layers and cannot advance lore independently.
- Current live presentation is contextual intro/completion/idle dialogue, compact quest tracking, and active/completed quest titles in the journal. Dialogue page position is transient; `unlockedDialogueIds`, branching dialogue, persistent transcripts, and a separate lore-codex state are not live.
- This narrative is implemented and simulation-tested, but it is not yet browser-certified as a continuous experience. The P12 browser gate must verify the actual dialogue overlay at each handoff, close/reopen behavior, completion/reward presentation, and durable quest history after reload.

### Current quest coverage map

| Quest area | Current state |
|---|---|
| Act 1 farming | Elspeth, starter farm, wheat objectives, farm-scoped events, and mounted HUD tracker are implemented. |
| Act 2 processing | Compost, windmill/hand-mill, and workbench objectives are explicit and station-scoped; waypoints use canonical anchors. |
| Act 3 river/market | River habitat and village-market predicates are enforced; bridge and produce-stall waypoints use canonical anchors. |
| Act 4 harbor | Maeve and Silas require proximity; rowboat commission requirements and feature unlock are enforced. |
| Act 5 expedition | Board → chum → hook → land → stow → dock → sell → report is explicit; deterministic starter school and fish presentation are implemented. |

### Current verification boundary

- The human-review correction for road blending and grass presentation passes **62/62** focused terrain, road-geometry, road-environment, physics, and terrain-material tests. Typecheck, lint, codegen parity, and the production build pass. The Playwright CLI wrapper could not resolve its `playwright-cli` binary; the direct-library browser evidence for the P12 work is recorded below and is separate from the corrective art pass.
- The 2026-08-26 terrain/road focused suites are recorded as green, including **74/74** current world-layout/road/physics/persistence tests and **11/11** road/material tests. The prior **364/364** Vitest result and the later in-flight **48-file / 372-test** result are historical snapshots, not current full-suite proof; do not promote either to a new phase claim without rerunning the affected suite against this tree.
- A fresh direct `tsc --noEmit`, lint, and production build pass against the 188-asset snapshot. Lint reports one pre-existing `console` warning in the gameplay-systems skill template. The build also reports a missing `/assets/ui/neva-field-journal/journal-panel.png` reference and the known large Rapier chunk. `tests/unit/artPipeline.test.ts` now passes after the canonical manifest sync, and `npm run art:validate -- --all` validates all 188 published assets.
- `npm run art:test-builders` currently fails before the Python builder suite starts: Blender 5.2.0 LTS exits with SIGSEGV during Metal backend initialization. Earlier semantic determinism evidence exists for 10 living-world assets (`foliage_flower_drift_a/b/c`, `foliage_meadow_tall_a/b`, `prop_path_slab_a/b`, `fauna_gull_a`, `fauna_butterfly_a`, `fauna_rabbit_a`), but full-family clean-source determinism and selected-publication identity hashes remain open.
- A separate 0.60-density high-tier debug view measured **103 draw calls and 887,487 visible triangles**. The fresh standard P0.75 benchmark recorded zero browser errors but, on the intentionally unmerged DEV path, measured farm **723 / 1,238,709**, bridge **9 / 185,286**, harbor **9 / 185,286**, and coast **261 / 911,948** draws/triangles. The representative debug view and the unbatched DEV benchmark are diagnostic evidence, not interchangeable production-equivalent proof.
- Chromium local review matrix now boots farm, crop stages, farmhouse interior, village market, bridge, harbor/rowboat/skiff, coast, trout, and tuna views with a canvas, coverage diagnostics, zero console errors/warnings, and no repeated `toNonIndexed()` warnings. The earlier focused matrix remains mechanical evidence only; the current isolated P0.75 benchmark exposes DEV static-prefab budget failures documented in the roadmap table. Human integrated gameplay-camera approval is recorded only for the four visual-gold scenes; full cross-browser coverage and complete quest-flow E2E proof remain outstanding.
- The runtime loader preserves authored full-resolution visibility when the current published GLB is missing an optional catalog LOD node; strict art validation remains responsible for rejecting that catalog/artifact mismatch before publication.
- Static/type/test evidence does not replace integrated gameplay-camera review, complete cross-browser gates, or human visual approval.

### P12 evidence delta — 2026-08-26

- `tests/simulation/p12VerticalSlice.test.ts` passes as a new-save command-boundary loop: Elspeth → wheat plant/water → durable save/offline growth/reload → harvest → compost/worms → Barnaby → mill → chum → river fish → village sale → Maeve → Silas rowboat commission → board/sail → deterministic trout school → chum/hook/land → physical cargo/freshness → dock/sell → final Silas report → durable reload. It asserts the completed quest chain and persisted cargo/boat state.
- Direct Playwright library fallback (the repository wrapper cannot resolve `playwright-cli`) reaches the real title-start flow in Chromium, Firefox, and WebKit on the historical 172-asset snapshot, with the 08:00 HUD clock. The same browser pass verifies keyboard movement plus inventory in all three engines; Chromium additionally verifies plant placement, rowboat board/drive/exit, and sport-fishing reel/slack/brace controls. Screenshots are in `output/playwright/p12-browser/`.
- A subsequent browser attempt against the then in-flight catalog was stopped at boot when `house_farmhouse_b.glb` was requested but absent; that historical source snapshot had 179 entries while the public manifest had 172. No invalid partial browser result is being counted as P12 evidence.
- This is stronger current evidence, but it is not a claim that the complete new-save quest loop has been executed through browser walking/sailing and every UI transaction. P12 remains open until that continuous browser matrix and its save/reload proof are completed.

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
| `npm run art:codegen:check` | Historical pass; 92 catalog assets | The generated TypeScript projection matched the then-current catalog; this row is not current 188-asset evidence. |
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

Mechanical systems through P11 exist in src. P0.75 visual-gold acceptance is recorded; its separate technical-art certification remains open. P12 browser-loop is not proven. The table separates code presence from completion evidence; do not mark P0–P11 empty/Red from the old 212-case Vitest snapshot.

| Phase | Status | Current repository evidence | Missing or failing gate evidence |
|---|---|---|---|
| P0 — Repository & Architecture | **Partial** | Deterministic simulation structure, content registry, input/mode separation, Three.js presentation, debug HUD, schema 16 / layout 7 with v11/layout-3, v12/layout-4, v13/layout-5, and v14/layout-6 fixtures, 188-asset record/GLB coverage, synchronized publication provenance, terrain-focused tests, lint, and focused browser input checks are green. | The complete P0/P12 gameplay loop remains open. |
| P0.5 — Visual Rendering Foundation | **Partial** | `VisualRenderConfig`, palette materials/tokens, lighting, water, asset loader, generated catalog adapter, batching/instancing support, Art Yard, and diagnostics exist. The shared physical-road surface, base-heightfield + exact road trimesh, selective normals/colors, r174-v3 terrain material, and monotonic clustered ground cover are implemented with focused tests. Chromium measures 103 draw calls / 887,487 triangles at the definitive 0.60-density high-tier view. | Human gameplay-camera review remains pending; do not infer visual approval from automated geometry or budget evidence. |
| P0.75 — Gold-Standard Art Slice | **Visual Gold Accepted / Technical Certification Open** | `approved-baselines.json` retains the four reference images and records the 2026-08-27 human visual-gold decision for bridge/farm/harbor/coast. The current 188 published GLBs and manifest validate against the catalog. The 33 per-asset below-target floors are advisory for this visual lane; production contracts remain enforced. A fresh `art:benchmark` attempt found no browser errors but exposed current-tree DEV measurements: farm **723 draws / 1,238,709 triangles**, bridge **9 / 185,286**, harbor **9 / 185,286**, and coast **261 / 911,948**. | The current benchmark is not green because the existing DEV layout-editor path keeps static prefabs unbatched; resolving that render-path conflict is outside this no-renderer-change plan. `art:generate:strict` and clean-source determinism remain open technical-art/release gates, including the known `prop_beehive_a` no-mesh generation blocker. P12 and P16 remain unchanged; do not claim the full release gate passed. |
| P1 — Walkable World | **Partial** | Large authored multi-district world with the northeast village as the market/mill/road hub, movement, mouse camera, input modes (pause is overlay, not GameplayMode), interactions, collision adapters, and contextual prompts exist. Current physics/world suites pass; direct movement plus inventory input passes in Chromium, Firefox, and WebKit. | Continuous browser traversal through the full authored world, including deep jump/sprint/camera/boat cases, is not proven. |
| P2 — Persistence & Time | **Partial** | IndexedDB repository, schema 16 / layout 7, migrate-then-validate, **primary + backup keys only** (quick-save writes primary, no third manual slot). The v11/layout-3, v12/layout-4, v13/layout-5, and v14/layout-6 fixtures cover the historical layout chain into v15/layout 7; schema 16 preserves that layout while normalizing legacy clock speed and persisting `weather.nextWeatherType` (the forecast successor); IDB fail returns false (no RAM promotion). Weather-bounded offline progression and quest `nextQuestId` remain intact. | Durable save/reload passes in the deterministic P12 simulation; full browser save/reload proof is still open. Overlay pause is not a serializable sim mode. |
| P3 — Farming Vertical Slice | **Partial** | Placement/actions, moisture/fertility/growth/harvest (`farm.apply-fertilizer` +20, clamp 10–100), journals, starter plots, crop rendering, and the new-save plant/water/offline-growth/harvest simulation path pass. | Continuous browser plant-save-advance-load-harvest proof remains open. Orchard persist+regrow on successful harvest is LIVE; wither-delete of regrow crops is a parallel fix. |
| P4 — Inventory & Processing | **Partial** | Finite inventories, atomic operations, processing jobs, compost, **8 recipes**, and the P12 compost/mill/chum command path pass. Harbor fish-table remains at `HARBOR_FISH_TABLE`; fish-table recipes stay station-scoped. | Full-inventory plus cancel/reload and the complete three-recipe browser loop were not proven together. |
| P5 — Basic Fishing | **Partial** | Deterministic five-phase minigame and the P12 river-fish command path pass. Held-state `fishing` input and basic-fishing modal are covered by the existing implementation. | Sport-fishing held controls pass in Chromium debug input, but continuous new-save browser fishing proof remains open. |
| P6 — Boats | **Partial** | Rowboat/skiff definitions, atomic skiff purchase, boarding/driving/docking, two-boat persistence, Act 4 commission, and the P12 boat boundary pass. Chromium debug input proves board/drive/exit. | Emergency Tow / hook-class are not live. Continuous browser dock/board/sail and save/reload proof is not complete. |
| P7 — Sport Fishing | **Partial** | Deterministic schools, encounter state machine, held-state reel/slack/brace plus fish-left/right, species profiles, HUD, and the P12 landing path pass. | Human species-behavior identification and continuous new-save browser sport-fishing proof are not complete. |
| P8 — Physical Cargo & Freshness | **Partial** | Finite physical fish cargo, one-location modeling, freshness decay, transfer/sale logic, cargo UI, and P12 cargo/freshness/reload assertions pass. | Empty/partial/external-hook boat screenshots and a current browser transfer/no-clone proof were not completed. |
| P9 — Market Economy | **Partial** | Village/harbor markets, deterministic demand/trend/season/freshness pricing, atomic sale, price-breakdown UI. LIVE stall **sells wheat/tomato/potato seed only**; produce quality does not affect sale price (journal only). | Full 8-seed shop is Deferred. No current browser proof of repeated tuna demand decay/recovery. |
| P10 — Progression & Contracts | **Partial** | Five rods, proficiency XP/ranks, five contract templates, journal, gated expedition board, explicit quest `nextQuestId` chain, feature unlocks, live skiff purchase, and the P12 rowboat capability step pass in simulation. Rank unlock tables (`farmingUnlocks` etc.) are unused; LIVE gates are `crop.minimumFarmingXp`, a few `recipe.minimumSkill`, and the skiff XP/money contract. Buy-rod remains deferred. | Three capability-changing milestones are not proven in a continuous new-save browser run. |
| P11 — Weather & Seasons | **Partial** | Seeded weather schedule, seasons, crop/market modifiers, renderer response, forecast/UI. Weather enum has **no drought**; growth buffs `light-rain` and `heavy-rain` at 1.05. | No current real-play proof that weather/season changes the correct player decision. |
| P12 — Full Vertical-Slice QA | **Partial / not complete** | `tests/simulation/p12VerticalSlice.test.ts` now passes the new-save wheat-through-quest-through-reload command loop, including the authored ten-quest state chain; direct Playwright evidence reaches the fresh title and real movement/inventory controls in Chromium/Firefox/WebKit, with deeper placement/boat/sport-input checks in Chromium. | A continuous new-save browser walk/sail/transaction loop with the actual narrative dialogue handoffs and browser save/reload proof is still missing. **Do not** mark P12 complete. |
| P13 — MVP Content Expansion | **Not reached / content tables exist** | Definitions already contain **8 crops, 12 fish, 2 boats, 8 recipes**, 5 contract templates, and 5 rods. Shop LIVE-sells wheat/tomato/potato only. | P13 is sequenced only after P12. Do not call P13 complete. Runtime art covers wheat/tomato/potato stages and trout/tuna fish models only. |
| P14 — Final Art, Audio & UX Polish | **Not reached / partial polish exists** | 188 catalog assets, complete contextual coverage classification, character/crop presentation, fish-school presentation, VFX, UI polish, accessibility/reduced-motion work, ambient/farming audio, interiors, vegetation, boats, and world dressing exist. | P12 is not green; 33 assets are below target (advisory for the visual-gold lane); audio covers ambience/farming/processing but not the complete fishing/boat/market loop; no P14 completion claim. |
| P15 — Performance & Browsers | **Partial** | Build size is under the initial-load target; Meshopt, batching, camera-distance character detail LOD, instancing, and performance diagnostics exist. The fresh 11-view Chromium matrix stayed below 220 draws / 900k triangles, and direct fresh-title boot plus movement/inventory input passed in Chromium/Firefox/WebKit. | Complete cross-browser gameplay coverage and hardware-FPS proof remain open; the local review matrix is mechanical evidence only. |
| P16 — Release Candidate | **Not reached** | No valid completion claim. | Huge uncommitted tree, incomplete continuous P12 browser matrix, unresolved art validation/strict/determinism gates, exposed debug tools, and no full-loop release proof. |

### Roadmap completion checklist

- [ ] P0 gate passes from the current working tree.
- [ ] P0.5 renderer/material/Art Yard gate is re-proven from the current working tree.
- [x] P0.75 human visual-gold decision is accepted for the bridge/farm/harbor/coast gameplay-camera slices; `art:sync -- --all`, `art:validate -- --all`, and the 2026-08-27 registry decision provide the current human/publication evidence.
- [ ] P0.75 current-tree benchmark gate is green; the isolated run had no browser errors but exceeded the unchanged upper budgets because DEV static prefabs were not batched.
- [ ] P0.75 technical-art certification passes through strict generation and clean-source determinism; this remains a release/P16 gate.
- [ ] P1 walkable-world movement/camera/collision/input gate passes.
- [ ] P2 persistence/time gate passes with the schema-11 through schema-16 migration chain and historical layout fixtures.
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
- [ ] P12 narrative proof passes: all required NPC handoffs, dialogue payloads/modal presentation, completion rewards, close/reopen behavior, and quest-history reload assertions.
- [ ] P13 content expansion is reconciled with the required P12-first sequence and receives complete runtime coverage.
- [ ] P14 final art/audio/UX coverage passes current mechanical and human in-game review gates.
- [ ] P15 target performance and browser compatibility pass on representative hardware/browsers.
- [ ] P16 release-candidate gate passes from a clean, reviewable commit.

## 4. Vertical-slice acceptance checklist

The canonical list below comes from `02` section 19. A box remains open unless the complete new-save behavior is currently proven; partial implementation is stated explicitly.

- [x] Move through starter world — current physics/world suites pass; direct Chromium/Firefox/WebKit movement input moved the player and returned to the inventory overlay.
- [ ] Sprint drains/recovers without affecting Work Capacity — unit mechanics exist; Chromium jump/sprint flow is red.
- [ ] Obtain wheat seed — a new save starts with wheat seed; an obtain/acquisition action is not proven.
- [ ] Plant and water wheat — the deterministic new-save simulation loop now passes both actions and Chromium placement input passes; the continuous browser flow remains open.
- [ ] Save/quit and return after offline growth — offline/persistence logic exists; not proven in the full current loop.
- [ ] Harvest exactly once — unit mechanics exist; current browser harvest/presentation flow fails.
- [ ] Place Worm Compost and harvest bait worms — the deterministic new-save simulation loop now passes; the continuous browser path remains open.
- [ ] Grind grain and craft chum — the deterministic new-save simulation loop now passes; the continuous browser path remains open.
- [ ] Basic fish — focused minigame and the deterministic P12 simulation path pass; browser basic-fishing transaction proof remains open.
- [ ] Commission rowboat — the deterministic new-save simulation path passes the 30 G + Ground Grain commission; browser boarding is proven in Chromium debug input but not through the continuous new-save quest.
- [ ] Sail to sport-fishing area — the deterministic P12 path passes the canonical boat movement boundary; continuous browser sailing remains open.
- [ ] Visually discover school — deterministic school activation and Chromium sport-fishing HUD input pass; integrated human/gameplay-camera proof remains open.
- [ ] Chum school — the deterministic P12 simulation path passes; continuous browser transaction proof remains open.
- [ ] Hook fish — the deterministic P12 simulation path passes; continuous browser transaction proof remains open.
- [ ] Reel/slack/brace — Chromium browser held-input assertions pass; continuous new-save browser encounter proof remains open.
- [ ] Land fish — the deterministic P12 simulation path passes; continuous browser landing proof remains open.
- [ ] Physically carry/store fish — cargo placement/freshness/reload pass in the deterministic P12 path; browser transfer/no-clone proof remains open.
- [ ] Freshness decays with time — deterministic P12 freshness assertion passes; browser save/reload proof remains open.
- [ ] Dock and sell — deterministic P12 dock/sell/report path passes; continuous browser dock/sale proof remains open.
- [ ] Price breakdown visible — UI implementation exists; no current passing browser gate.
- [ ] Gain Fishing XP — the deterministic P12 completion path advances progression; browser persistence/progression proof remains open.
- [ ] Buy/unlock capability — the deterministic rowboat commission capability step passes; browser milestone proof remains open.
- [ ] Reload with all progression intact — durable simulation save/reload passes; the continuous browser save/reload matrix remains open.
- [ ] Hear and understand the authored story spine — simulation dialogue payloads and quest chaining exist; browser proof of Elspeth → Barnaby → Silas → Maeve handoffs, completion lines, final report, and player comprehension remains open.

**Conclusion:** P12 is incomplete under the canonical rule “any missing step = incomplete vertical slice.”

## 5. Art and asset pipeline state

### Lean routine pipeline implementation

- [x] `art:preview` is absent from package scripts and CLI help paths; `tools/blender/preview.py` is deleted in the working tree.
- [x] Routine guidance says generate/publish, use the Art Yard, integrate in game, and await human game review without agent-led static preview scoring.
- [x] Catalog commands require an explicit asset/family or explicit release `--all` path.
- [x] Art Yard deep-link implementation and focused plugin tests exist.
- [x] Staging currently contains exactly three run directories.
- [x] The 188 generated/public asset copies are byte-identical and the published manifests are synchronized to the current catalog/palette/toolchain provenance; no GLBs were regenerated or reauthored by the P0.75 split.
- [x] Normal generation keeps the published mechanical GLB contract intact and reports target debt separately.
- [x] `LLM/AGENTS.md` no longer says `BLENDER.md` covers previews; static previews are forbidden and `preview.py` is gone.

### Current asset acceptance debt

Latest report: `generated/reports/asset_budget_report.json`, generated 2026-08-27T12:10:03.113Z.

- Assets: 188
- On target: 155
- Below target: 33
- Hard contract failures: 0 (`artContractPassed: true`)
- Visual status: `candidate`, not human-approved by generation alone
- Strict report flag: `false`

Below-target IDs:

- `building_barn_a`
- `char_npc_barnaby_a`
- `char_npc_elspeth_a`
- `char_npc_maeve_a`
- `char_npc_silas_a`
- `interior_farmhouse_shell`
- `item_apple_a`
- `item_bread_loaf_a`
- `item_coin_pouch_a`
- `item_compass_a`
- `item_corn_cob_a`
- `item_pie_a`
- `prop_armchair_cozy_a`
- `prop_bed_cozy_a`
- `prop_chair_rustic_a`
- `prop_cupboard_shelves_a`
- `prop_dock_lantern_a`
- `prop_farm_gate_a`
- `prop_farm_workbench_a`
- `prop_fence_section_a`
- `prop_lobster_trap_a`
- `prop_path_stone_round_a`
- `prop_path_stone_slab_a`
- `prop_produce_stall_a`
- `prop_table_dining_a`
- `prop_water_well_a`
- `rock_boulder_large_a`
- `rock_coastal_boulder_a`

Recorded human evidence: `tests/visual/reference/approved-baselines.json` retains the farm, bridge, harbor, and coast reference images approved by `human-art-director` on 2026-08-24 and records the 2026-08-27 human visual-gold decision for that four-scene scope without numeric scores. This decision is not approval of every individual asset and does not close technical-art certification; strict mechanical debt and clean-source determinism remain unresolved.

## 6. Documentation/code drift to resolve

- [x] Implement the revised shared ground contract: class-aware/selective normals and colors, physical canonical road relief, exact shared render/Rapier road geometry, and clustered monotonic ground cover. Human gameplay-camera proof remains pending.
- [x] Update canonical save guidance through schema 16 / layout 7 while retaining v10 fish-table, v11 trout-stack, v12 physical-road, v13 northeast village-hub, and v14 layout-6 migration history; schema 16 adds clock/forecast normalization without moving the world.
- [x] Add `tests/fixtures/save_v14_layout6.json` and coverage proving it migrates canonical stations and land grounding into schema 15/layout 7 without discarding unrelated simulation truth; schema-16 normalization is recorded in the migration owner; a dedicated fallback assertion remains open.
- [x] Add `tests/fixtures/save_v11_layout3.json` and focused migration coverage for player, structures, active boats, and unrelated persisted state.
- [x] Preserve the physical-road upgrade as the schema-12/layout-4 migration, then reconcile the concurrent schema-13/layout-5 authority without dropping either fixture or migration.
- [x] Reconcile the canonical rowboat step: fresh saves retain the physical boat, while Act 4 commission now consumes 30 G + Ground Grain and unlocks boarding; browser proof remains open.
- [x] Reconcile the authored quest line with explicit event targets, location predicates, canonical waypoints, atomic rewards, cargo event ordering, and the deterministic Act 5 starter school.
- [x] Reconcile the created-asset placement audit: wagon/cow are authored into the world and sport-fish GLBs are presentation-bound; conditional crops and the fresh-save-absent skiff are explicitly classified, with no audited asset left Art Yard-only.
- [x] Split P0.75 into the accepted four-scene visual-gold gate and the separate open technical-art/release certification gate; preserve current GLBs, target values, baseline images, and strict/determinism semantics.
- [x] Establish one canonical narrative contract across architecture, gameplay, roadmap, art direction, and art-production guidance; keep the live ten-quest spine separate from deferred branching/transcript/codex systems.
- [ ] Reconcile P13's “only after P12” rule with already-added 8-crop/12-fish definitions and partial P14 world/art/audio work. Preserve useful work, but do not call these phases complete ahead of P12.
- [x] HUD Work Capacity is labeled **Labor** and is not a hard block (empty Labor = reduced XP/rare chance).
- [x] Residual “previews” wording removed from `LLM/AGENTS.md`; remaining mention is that static previews are forbidden.

## 7. Next evidence-driven work order

These are the shortest blocking steps implied by the canonical phase order; they are not authorization to change gameplay direction.

1. [x] Advance the physical-road world through layout revision 4, reconcile the subsequent layout-5 northeast village hub, align shared height/collision owners, and cover both historical layouts through migration.
2. [ ] Fix the real physics/traversal failures: current focused corner/static/bridge/road suites pass and direct movement input passes in three engines; deep jump/sprint/camera/boat traversal proof remains open.
3. [x] Restore deterministic basic/sport fishing setup against the current habitats and world coordinates; the P12 simulation and Chromium held-input checks pass.
4. [ ] Diagnose Playwright's isolated locator mismatch using a fresh non-reused dev server, then rerun only the affected Chromium smoke/control tests. The wrapper is unavailable in this environment; direct Playwright library fallback passed the current browser checks.
5. [x] Make the deterministic P12 simulation loop pass from a new save, including the real rowboat acquisition/capability step; `tests/simulation/p12VerticalSlice.test.ts` passes.
6. [ ] Add/finish the continuous P12 browser narrative route: assert each named NPC handoff, contextual dialogue, completion/reward payload, close/reopen safety, and final story state; do not treat simulation-only dialogue assertions as browser proof.
7. [ ] Rerun the complete P12 browser matrix only after the narrow failures are green.
8. [ ] Continue the separate technical-art/release track: repair clean-source `prop_beehive_a` no-mesh generation, then run unchanged strict/determinism semantics. The 33 below-target records remain visible technical debt and are not reauthored by this visual-gate split; they do not block the accepted four-scene visual lane.
9. [ ] Reconcile content/art/audio coverage for all 8 crops and 12 fish only after P12 is green.
10. [ ] Profile representative hardware and Safari/WebKit for P15; do not treat SwiftShader FPS as hardware performance proof.
11. [ ] Split the large dirty tree into reviewable, intentional commits before any P16 claim.

## 8. Completion definition for this checklist

When updating a box, attach the narrowest current evidence: command/test name, passing count, relevant asset IDs or simulation path, and whether it is static, browser-runtime, hardware-performance, or human visual proof. Never infer one proof layer from another.
