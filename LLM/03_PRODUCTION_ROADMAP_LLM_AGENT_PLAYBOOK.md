# Farm & Fishing Browser Game — Production Roadmap & LLM Agent Playbook

> **Role:** Execution manual. Prevent feature/architecture drift, regressions, and premature complexity.

# 0. Agent Mission & Read Order

Build the smallest reliable increment that strengthens:
`farm → process → prepare → sail → discover → fish → transport → sell → upgrade`.
Do not optimize for code volume.

Root `AGENTS.md` alone owns task-class reading. Routine assets use its scoped
route; milestone, release and gameplay-sequencing tasks read this roadmap in
full. Other tasks use the selected contract or validation sections.

Identify subsystem ownership before coding; do not search/randomly modify files.

# 1. Required Agent Preflight

Identify the player outcome, owning subsystem/formula, affected callers,
persistent-state impact and migration need, stale documentation, and relevant
visual/performance risks. Inspect those owners before choosing the smallest
complete change. Keep this brief for routine work; do not produce empty fields.

# 2. Change Rules

Use existing architecture, serializable state, seeded simulation RNG, atomic
transactions and stable content IDs. Fix the owning subsystem and verify the
changed behavior using §4. Add tests when they protect a meaningful contract or
plausible regression. Preserve unrelated changes and existing evidence.

Do not add frameworks or adjacent features, bypass migrations, weaken types or
tests to get a pass, duplicate formulas, or treat presentation as gameplay truth.

# 3. Standard Task Contract

A task needs a concrete outcome and acceptance evidence, not a mandatory long
form. For work that needs a written plan, use:

```text
Outcome: what the player can do or understand afterward
Owner and contract: state/formula/content source; invariants and affected callers
Scope: smallest complete change and any consequential exclusions
Save impact / migration: yes or no, with the preservation boundary if yes
Docs: owning sections whose contract changes
Acceptance: behavior to demonstrate, checks from §4, human review if applicable
```

Label each statement as needed: **current contract**, **implemented behavior**,
**proposal/deferred**, or **observed evidence**. An unchecked design target is
not an implementation result. If a feature is not fun or comprehensible in
play, passing code tests alone does not satisfy its product outcome (§32).

# 4. Standard Validation Gate

This is the single task-to-verification matrix. Combine applicable rows; run
only checks needed for the changed behavior and risk. Broaden when a failure or
unresolved concern requires it. A phase closes only when all its required gates
pass. A recorded human sub-gate may authorize its scoped follow-on work while
independent technical or release gates remain open.

| Change | Minimum relevant evidence | When to broaden |
|---|---|---|
| Documentation or copy | Diff, references and consistency with owning sources; content validation when membership is discussed | Runtime only if behavior changed; no build or broad suite for prose |
| UI styling/presentation | Diff and affected layout/interaction states in the browser or the user's requested live review; focused semantic check when useful | Input, focus, responsive or DTO changes require their affected interaction checks; screenshots do not prove callbacks |
| Gameplay/formula/content | Focused domain/content tests and direct typecheck; exercise changed callers and realistic failure/atomicity cases | Browser for changed player interaction; connected-loop playtest for a new mechanic or material balance change |
| Save/schema/topology | §25: retained fixtures, migration/reload/idempotence and backup preservation, affected domain tests, typecheck | Continuous gameplay save/reload when the changed path crosses UI/world state |
| Routine selected asset | `BLENDER.md` §1 selected generation/publication and integration; brief only when changed; typecheck only for runtime TS edits | Human reviews integrated visuals. No routine strict, double-generation, screenshot scoring or full-suite gate |
| Shared generator/helper | `BLENDER.md` §2 affected-family generation, builder coverage where applicable, determinism and publication | Revisit affected gold slices when the visual contract materially changes |
| Renderer/material/world performance | Relevant shader/config/geometry checks, affected gameplay-camera scenes and matching-quality production profiling | Tier fallbacks, memory, loading and affected traversal; frozen `world:acceptance` when world composition/topology is the task |
| Audio | Manifest/source checks and focused lifecycle/trigger tests; actual listening for audible changes | Startup, suspend/resume, loop stop/cancel, repeated-cue load and mix under representative play |
| DEV layout editor | `LAYOUT_EDITOR.md` checks for affected kinds, input and write targets | Add gameplay/save/physics checks only when their contracts change |
| Milestone/release | Phase-specific acceptance plus the relevant full static/test/build, production budget and browser matrix gates | Art certification and human visual/product acceptance remain independent, explicitly recorded gates |

**Commands and side effects.** In `package.json`, `predev`, `prebuild`,
`pretypecheck` and `pretest` run `assets:sync`, which can regenerate and publish
asset/UI adapters. Do not use those aliases for a read-only consistency check.
Use the check-only order in `.github/workflows/ci.yml` before regeneration can
hide drift. Direct checks include:

```bash
npm run art:codegen:check
npm run ui:codegen:check
npm run ui:publish:check
npm run ui:pack:check
npm run content:validate
npx tsc --noEmit
npx vitest run <affected-test-path>
```

This is a command reference, not a requirement to run every line per task.
`npx eslint <affected-paths>` checks selected code; `npx vite build` builds the
current adapters without the `prebuild` regeneration hook. Asset CLI commands
require explicit `--asset`, `--family` or authorized release `--all` selectors;
publication and `art:sync` are mutations. `BLENDER.md` owns their full sequence.

**Performance lanes.** `npm run art:benchmark` uses the DEV Playwright setup;
its unmerged editor scene is diagnostic evidence. `npm run test:budget` uses
the isolated production build configured by `playwright.budget.config.ts`.
`npm run world:acceptance` owns frozen multi-scene/world evidence as described
in Art Pipeline §13.3. Do not compare DEV and production as equivalent or infer
performance from FPS alone. Record actual quality, viewport/DPR, hardware,
frame-time distribution, draws/triangles and memory for the affected scenario.

**Evidence boundaries.** Keep source/static, unit/simulation, browser,
human visual/product, asset publication, and release evidence distinct in
`IMPLEMENTATION_STATUS_CHECKLIST.md`. Name the command, scope, result and
artifact; record source/input identity for costly or concurrent runs. A failed
run stays failed even if a narrower retry passes. Do not date-stamp old results
as current, infer an unrun gate from a neighboring pass, or inflate a historical
human approval into approval of a changed scene.

# 5. Phase Map

`P0 Architecture → P0.5 Visual Rendering Foundation → P0.75 Gold-Standard Art Slice → P1 World → P2 Persistence/Time → P3 Farming → P4 Inventory/Processing → P5 Basic Fishing → P6 Boats → P7 Sport Fishing → P8 Cargo/Freshness → P9 Markets → P10 Progression/Contracts → P11 Weather/Seasons → P12 Full Slice QA (including narrative proof) → P13 MVP Content → P14 Final Art/Audio/UX Polish → P15 Performance/Browsers → P16 RC`.

**Critical sequencing rule:** visual identity is established before world production, not postponed to P14. P14 expands/polishes an already-approved visual system; it is not the first point at which final materials, lighting, water, foliage, or geometry language appear.

# 6. P0 — Repository & Architecture

**Build:** Vite/TS, Three.js, Vitest, Playwright, ESLint/Prettier, folder architecture, `GameApp`, `Simulation`, seeded RNG, clock, registry, authored NPC/quest content, renderer, DOM UI root, debug HUD, resize handling, fixture framework.

**Gate:** browser shows 3D scene + game time + debug HUD; typecheck/lint/test/build pass.

# 6.5. P0.5 — Visual Rendering Foundation

**Purpose:** establish the reusable rendering/material systems required to make ordinary gameplay-camera screenshots plausibly belong beside the approved references before the team/agents build a large world.

**Build:**
- one canonical `VisualRenderConfig` owner for color space, tone mapping, exposure, primary sun/fill, shadow quality tiers, AO/contact, atmosphere/fog, restrained post-processing, and live ground supporting-map sampling/blend strengths;
- one canonical `PaletteTokens` + `PaletteMaterials` owner; production code must consume tokens/material factories instead of arbitrary runtime colors/materials;
- calibrated warm sun + cool fill, grounded shadows/AO, atmosphere, and color pipeline;
- canonical ground-surface foundation: class-aware terrain normals, semantic grass/meadow/soil/path/shore/cliff blending, bounded macro/meso variation, weather wetness through `VisualRenderConfig`, and optional world-space supporting maps remapped into palette families (never photographic RGB as final albedo, never a second route/meadow mask);
- one authored route/profile owner shared by terrain grading/surface influence, road presentation, map projection, cover exclusion, and relevant collision queries; roads have route-kind width, worn core/ruts, soft shoulders, terrain integration, and shaped junctions;
- deterministic causal composition fields for district, habitat, route framing, openings, and independent category densities; stable priority-prefix placement with core/edge/isolate/landmark/riparian roles, authored clearances, variant/palette grouping, instancing, draw-distance culling, and quality-tier counts;
- approved water prototype following `04` §8: shared low-frequency displacement, continuous depth/transmission, filtered reflection and arriving/spreading/fading surf;
- approved vegetation/rock shading prototypes;
- catalog-backed GLB loader with Meshopt decoding, source-scene cache/clones, and compatible static-prefab `THREE.BatchedMesh` consolidation; ground supporting maps currently ship as local WebP through `ExternalSurfaceTextures`; KTX2 remains preferred for later GLB-embedded textures;
- generated typed asset IDs/family maps plus the runtime-only Vite catalog projection, with `npm run art:codegen:check` as the stale-adapter gate;
- interactive WebGL yard at `/__neva_art_yard` (published views also ship in production; stage endpoints are DEV-only) for orbit, declared read-distance/LOD, wireframe, collision-proxy, lighting, fog/storm, and staged-run review;
- screenshot harness with fixed camera/resolution/time/weather/seed;
- separate **regression QA** (game vs approved game benchmark) and **style QA** (game vs graphics references, ignoring layout unless explicitly in scope).

**Rules:** no per-zone exposure/tone-map hacks; no toon/ink outlines; no DOF/tilt-shift dependency; normal texture targets follow `04` (mostly 128–1024, 2048 rare); renderer remains browser-budgeted.

**Ground-foundation implementation order:** (1) landform/normals and triangle-grid suppression; (2) semantic slope/height/route/shore fields plus macro/meso material variation; (3) terrain-integrated roads and junctions; (4) clustered instanced cover consuming those route/shore fields; (5) shoreline/cliff dressing, contact continuity, and restrained surface detail/weather. Shoreline semantics exist before cover placement even when shoreline dressing is refined afterward. Do not hide a weak earlier layer by adding more props or foliage.

**Ground acceptance:** at a fixed world seed, surface fields and cover placement regenerate identically; traversable terrain does not expose a regular triangle grid; authored landform breaks remain readable; roads have no visible slab seam or z-fighting and transition through worn cores/shoulders into surrounding ground; supporting maps remain palette-remapped world-space tilers and cannot become a photographic dirt slab, a blurry ribbon, or a second independent mask; road and shoreline exclusions suppress inappropriate cover; short grass does not create broad dynamic-shadow load; quality tiers reduce count/distance without changing route, shore, collision, or placement truth; any materially walkable deformation agrees across render height, Rapier, placement, and anchors. Exact widths, frequencies, slopes, depths, counts, control-field resolution, and supporting-map strengths remain centrally owned starting values to tune under the gameplay camera, not permanent Art Bible constants.

**Gate:** a simple test scene containing terrain/grass, one route with a junction/shoulder, one bank or slope transition, one shoreline, clustered short/tall cover, one rock family, one tree family, warm wood, warm stone/plaster, water edge/foam, and representative shadows reads coherently from the gameplay camera under the qualitative criteria in `04`. No numeric human score is required. Regular terrain topology is not the dominant pattern; road/terrain/cover/shore transitions agree; the same scene remains readable in at least one wet-weather state and across quality tiers without changing gameplay truth. `npm run art:codegen:check` passes, the art yard loads the same catalog through the canonical runtime loader, and wireframe/collision/LOD/lighting diagnostics are usable without creating a second render baseline. Lock the baseline config after approval and regression-test future changes.

# 6.75. P0.75 — Gold-Standard Art Slice

**Purpose:** prove that the complete asset-production loop can reach the target aesthetic before mass production.

Build and approve, in this order unless a human explicitly changes it:
1. **Bridge + river:** landform-dominant terrain, integrated route approaches, grass/soil/slope/shore transitions, clustered vegetation/reeds, stone, timber, water and surf following `04` §8, lighting, atmosphere.
2. **Starter farm:** farmhouse, field/crop, fence, path, tree, rocks, working props.
3. **Harbor:** dock, rowboat, fish-market/warehouse language, rope/nets/crates, ocean water.
4. **Coast/lighthouse:** cliffs, dark rocks, graphic foam, atmospheric perspective, sunset variant.

The first accepted slice must demonstrate final-or-near-final geometry language, ground/route/cover/shore agreement, palette/material vocabulary, renderer baseline, water/vegetation direction, scale, and gameplay-distance readability. **Do not mass-produce props, buildings, vegetation families, or zones before the human visual-gold decision is accepted.** Gold-slice heroes with isolated sheets must have those files on disk under `tools/blender/references/isolated/` and identity-defining layout bound into catalog `parameters` (no silent generator defaults for primary structure). `tests/visual/reference/approved-baselines.json` owns recorded baseline images and human decisions. Preserve their scope; `IMPLEMENTATION_STATUS_CHECKLIST.md` owns historical evidence and open gates. Re-review affected slices when their renderer, material, terrain, route or reference contract materially changes.

**Visual Gold Decision:** human review of the bridge, farm, harbor and coast from the gameplay camera. Per-asset target floors are advisory for this visual decision; production minimums, hard maximums, material/node/palette contracts and runtime validation still apply.

**Technical Render Gate:** validate the published set and measure the affected scenes against their machine-owned budgets. Keep DEV `art:benchmark` diagnostics and production `test:budget`/world evidence labeled separately (§4); an unbatched DEV failure does not establish a production pass or failure. Gate status belongs in the checklist.

**Technical-Art Certification:** strict generation, published-set validation, semantic determinism and reproducible render evidence follow `BLENDER.md` §2. Strict generation currently rejects below-target assets; the generated published report owns the debt. Reassessing an asset target requires a deliberate catalog change and supporting visual/performance evidence, never filler geometry or an undocumented gate waiver.

# 7. P1 — Walkable World

**Build:** player controller, on-foot camera, collision, interaction system, named NPC anchors, and a large authored multi-district world with northwest starter farm, northeast village hub (plaza/market, mill, inn, cottages, barn, homestead garden, orchard fringe), a side-aware longitudinal river corridor with a bridge gateway and usable fishing banks, southwest lighthouse cliffs, southeast harbor, coast, offshore boundary, arterial roads, scenic trails, causal vegetation/opening fields, and contextual prompts. World geometry may remain selectively content-light while districts are filled, but it MUST use the approved P0.5/P0.75 renderer/material foundation rather than a visually unrelated throwaway style. Story landmarks support the current quest spine without becoming gameplay authorities.

**Avoid:** NPC schedules, complex animation, empty or purely decorative scale, unbounded runtime-procedural terrain, and decorative overbuild. Authored-world production follows the scope of recorded human approval in the baseline registry; independent certification status belongs in the checklist and generated reports.

**Gate:** semantic input/`GameplayMode`, movement/collision/camera/resize, overlay pause/modal capture (pause is an overlay, not a gameplay mode), camera obstruction/line-of-sight handling, and representative screenshots. Physics returns a frame through the adapter and only the simulation commits it. Physics may sample presentation `WaterSurface` for boat bob; canonical `boat.y` stays waterline.

# 8. P2 — Persistence & Time

**Build:** IndexedDB repo using the current schema and layout revision owned by `01` §6.1, **primary + backup keys only** (no third manual slot), migrate-then-validate, autosave, calendar, weather-bounded offline delta/summary, traversal-state persistence, persisted mount state, and persisted rod ownership.

**`01` §6.1 is the single migration ledger.** Read the per-version history
there; this roadmap must not restate it. Dialogue page position, modal state,
and the last-spoken line remain transient and are never saved.

Before the first live release, topology revisions may deliberately invalidate development saves when a human explicitly authorizes it; after release, preserve compatible legacy Work Capacity, crop journal, starter-structure, docked-boat, quest, fish-table, traversal, mount, sport-fishing, and rod-ownership state through explicit migrations.

Permanent fixtures add, never replace, historical saves. The physical-road migration is covered by `tests/fixtures/save_v11_layout3.json`; the subsequent mill relocation onto the plaza mill pad is covered by `tests/fixtures/save_v12_layout4.json`; moving the mill off the packed courtyard is covered by `tests/fixtures/save_v13_layout5.json`; the layout-7 station/topology migration is covered by `tests/fixtures/save_v14_layout6.json`; the layout-8 coast-topology migration is covered by `tests/fixtures/save_v16_layout7.json`; and the causal river/layout-9 migration is covered by `tests/fixtures/save_v23_layout8.json`. Retain them alongside future version fixtures.

**Gate:** reload preserves player position, money, time, dummy inventory, world seed; offline delta deterministic under fixed time.

# 9. P3 — Farming Vertical Slice

**Build:** crop definitions/state, deterministic oriented-footprint placement/ghost, stages, climate, moisture, renderer sync, harvest, inventory transfer, Farming XP, save integration, offline growth, and presentation-only action timing with simulation commit markers. Initial crops: Wheat, Tomato, Potato.

**Gate:** `plant → save → advance time → load → harvest exactly once`; no duplication; screenshots empty/growing/mature.

# 10. P4 — Inventory & Processing

**Build:** finite inventory, item definitions/stack limits/atomic transactions, farm crate, Hand Mill, recipes/jobs, Worm Compost, Ground Grain, Chum.

**Gate:** `Wheat → Ground Grain`; `Worm Compost → Bait Worms`; `Ground Grain + Bait Worms → Chum`; full-inventory + cancel/reload tests; no duplication.

# 11. P5 — Basic Fishing

**Build:** water validation, rod, worms, cast/wait/bite/catch-miss, habitat tables, Fishing XP, small fish items, journal shell, audio.

**Gate:** river/lake tables differ; fixed seed reproduces outcome.

# 12. P6 — Boats

**Build:** Rowboat, board/disembark, boat mode/camera, steering, simple collision, docking, save state, recall safety.

**Gate:** `walk to dock → board → sail → dock elsewhere → save → reload`; no mode/input corruption.

# 13. P7 — Sport Fishing

Build in order:
1. **School simulation:** spawn, lifetime, species weights, chumming, depletion.
2. **Presentation:** gulls, water disturbance, interaction cue.
3. **Encounter:** fish instance, stamina, distance, tension, behavior, escape/snap/landing.
4. **Controls/UI:** reel, slack, brace, direction, HUD, audio.

Initial species: Carp, Trout, Tuna, Swordfish, Blue Marlin.

**Gate:** human can identify species behavior without species name; if all feel the same, fail.

# 14. P8 — Physical Cargo & Freshness

**Build:** weight, quality, `FishCargo`, player carry, boat slots/visible cargo, freshness/storage modifiers, transfer interactions.

**Gate invariants:** one fish/one location; one fish/slot; transfer never clones; freshness persists. Screenshots: empty boat, partial load, large external-hook fish.

# 15. P9 — Market Economy

**Build:** definitions, commodity state, demand index/tick, supply feedback, produce/fish/freshness pricing, price breakdown, trends.

**Gate:** repeated tuna sales gradually lower tuna demand; time recovers demand; same fish at freshness 100 vs 50 yields different value; one pricing source of truth.

# 16. P10 — Progression & Contracts

**Build:** Farming/Fishing/Processing/Trading XP/ranks, capability unlocks, the explicit authored quest chain, contract templates/generator/deadlines, reputation, journal discoveries, first farm upgrade, Skiff unlock, and persisted harbor tackle progression. Willow → River → Heavy Sport → Offshore → Master purchases require the preceding owned rod plus the live Fishing XP gate; buying auto-equips, and owned rods can be switched only while no fishing action is active. Manual production uses the full discounted Work cost as a hard atomic gate; traversal, boats, cargo, trade, quests, and dialogue remain free. Story rewards must change a capability, resource, knowledge state, or next decision; text alone is not progression.

**Gate:** at least 3 milestones materially change capability; percentage-only bonus does not count.

# 17. P11 — Weather & Seasons

**Build:** weather simulation/forecast, clear/rain/windy/storm, water roughness, crop moisture + fish-school interactions, seasons, market season modifiers, visual/audio weather.

**Gate:** weather/season must change the correct player decision in real play.

# 18. P12 — Full Vertical-Slice QA

Required new-save loop:
`plant wheat → harvest → grow worms → make grain → make chum → basic fish → rowboat → find school → chum → sport fish → store → return → freshness loss → sell → gain proficiency → unlock/purchase upgrade → save → reload`.

The loop's narrative route is equally required:
`Elspeth welcome → sow/water → Barnaby harvest/compost → Barnaby mill/chum → Silas river lesson → Elspeth village trade → Maeve harbor lesson → Silas rowboat commission → Silas maiden-voyage briefing → Maeve fish sale → Silas final report`.

At each handoff, the browser must show the correct speaker, quest title/act,
contextual line(s), objective, and—when applicable—completion line and reward.
The test must verify that dialogue is caused by the authoritative NPC
interaction and that closing/reopening the overlay neither loses progress nor
duplicates a reward. A distinctive stable phrase may be asserted for current
string-array content; tests should not fail on punctuation or styling-only copy
edits. The simulation test may prove quest state and dialogue payloads, but it
does not replace browser proof of the actual modal, HUD, navigation, and
save/reload experience.

Recorded P12 human acceptance is indexed in `IMPLEMENTATION_STATUS_CHECKLIST.md` and authorizes the scope stated there. Automated continuous save/reload proof and the release browser matrix remain separate gates; a historical product decision does not close them.

# 19. P13 — MVP Content Expansion

Expand after the P12 product gate when a new crop, fish, recipe, contract,
location or narrative changes preparation, ecology, logistics, market judgment
or capability. Current membership and progression come from `src/content/`,
including `quests.ts` and `questTracks.ts`; do not freeze a second content total
here. `02` owns the gameplay and narrative contract.

**Gate:** validate new content and unlock predicates, affected domain behavior,
old-save reconciliation and the connected player route. For an island or quest
track, demonstrate departure/unlock → local activity → consequence/reward →
return → save/reload using the real interaction path. Debug relocation may
support a narrow UI test but cannot prove traversal or discovery. Human review
covers comprehension, useful choices and repetition (§32); status and past
stewardship/Sunreach runs belong in the checklist.

# 20. P14 — Final Art, Audio & UX Polish

P14 assumes P0.5/P0.75 already locked the visual language. Do **not** use P14 to replace placeholder rendering with the first real art pass; use it to finish coverage, variation, animation, audio, UX, and quality across the mature vertical slice.

- Environment: complete cohesive landform/material/route/shore/clustered-cover agreement plus harbor/farm/weathered architecture/water coverage using approved world-layout semantics, family generators, shared authored construction grammar and materials.
- Crops: readable stages/harvest + instancing + final stage/season variations.
- Fish: silhouettes/animation/size readability + species material polish.
- Boats: cargo points/wake/steering feedback + final working-boat detail.
- Characters, if present: conform to `04` character proportions/face/hair/clothing/material/rig rules; no separate chibi/anime/realistic visual language.
- UI: the `04` §17 coastal HUD/physical-interface language is applied across title/loading/recovery, normal and fishing HUD, farming, dialogue, satchel, market, Hold & Stores, chart, journal/guide, expedition, pause/settings, confirmations, and landscape touch fallback. Each player surface consumes a narrow simulation-owned presentation query instead of reconstructing facts from full `GameState`; responsive fit, keyboard focus/return, non-color state cues, and reduced motion remain acceptance requirements while keeping the world primary.
- Narrative presentation: post-milestone NPC recognition, concise journal people/places/practices entries, and environmental story cues may deepen the live chain without introducing unowned branches or a second save system.
- Audio/VFX: repeated verbs, story transitions, and place/condition ambience receive final tactile feedback without reward-firework clutter.
Follow `04` + Art Pipeline gates; do not break the locked `VisualRenderConfig`/`PaletteMaterials` contract for one-off beauty shots.

P14 UI implementation is not completion evidence by itself. Do not mark P14 complete until the human has reviewed the integrated game at the requested desktop sizes, UI-scale extremes, long/empty/full/blocked states, keyboard-only flow, reduced motion, and the existing landscape touch fallback.

# 21. P15 — Performance & Browser Compatibility

Test: full farm, harbor, offshore, storm, full boat, market UI, sport fishing.
Measure: FPS, frame time, draw calls, triangles, memory, asset load, long tasks.
Required work: crop instancing, material dedupe, asset compression, texture audit, loading fallback, context-loss handling, Safari validation.

# 22. P16 — Release Candidate

Must pass: all loops and the complete authored story spine; migration tests; no critical console errors/soft locks/item or cargo duplication/negative inventory/infinite market exploit; budgets acceptable; debug tools removed/protected; accessibility baseline; onboarding; browser matrix; and no narrative progression/reward duplication or unearned capability unlock.

# 23. Test, Visual Regression & Style-Match Discipline

Tests assert deterministic truths, not vague effects. Fixed seed/time/input where possible.

Use two distinct visual QA modes and never confuse them:

1. **Regression QA — game vs approved game benchmark.** Same scene/state/camera/resolution/render config. Pixel/perceptual metrics such as SSIM/LPIPS, histogram/luminance, and screenshot diffs are appropriate for detecting unintended change.
2. **Style-match QA — game vs supplied graphics references.** Layout, camera, staging, diorama/tabletop presentation, DOF, and scene borders are ignored unless the current task explicitly concerns them. Review geometry/facet language, silhouette/proportion, palette distribution, roughness/material response, lighting/AO/shadows, water/foam, vegetation, atmosphere, detail frequency, and realism drift. Do not require pixel similarity between different compositions.

Use existing fixed views and affected real-player routes; their definitions
belong to the test/harness source rather than a second screenshot-name list.
`04` §19 owns visual criteria, Art Pipeline §13 owns capture contracts, and §4
here determines which evidence the task requires. Human game review remains
the visual acceptance boundary for routine assets.

For world composition/topology, Art Pipeline §13.3 owns `world:acceptance`:
frozen inputs/build, matching-content final/no-post views, preservation audits,
real-input traversal, tier coverage and distinct software/hardware lanes.
Preserve historical sampling domains and the bounded correction in `01` §10;
a new layout must not erase its old fixtures. A narrower starter-terrain run
cannot certify all islands. Source drift, skipped checks and failed lanes
remain explicit limitations even if selected scenes render successfully.

# 24. Coding & Formula Ownership

Prefer small modules, pure functions, explicit state machines, readonly definitions, centralized formulas/tuning, strong types/names, early returns, domain tests. Avoid magic numbers, deep conditional pyramids, giant switches/god objects, ambient globals, cross-module mutation, anonymous untyped maps.

Every formula has one owner, e.g.:
```text
crop growth → src/simulation/farming/calculateCropGrowth.ts
fish value → src/simulation/economy/calculateFishValue.ts
freshness → src/simulation/fishing/calculateFreshness.ts
market demand and marginal quotes → src/simulation/economy/marketPricing.ts
market hourly replay and supply recovery → src/simulation/economy/updateMarket.ts
```
UI consumes results; never reproduces formulas.

Link the owning tuning module; do not copy its current numeric configuration into task instructions.

Dev startup validation: duplicate IDs, missing item/habitat/unlock, invalid crop time/yield/cargo class, negative prices, unresolvable recipes. Fail loudly.

# 25. Save-Sensitive Protocol

Changes to state shape, persistent IDs, saved enums, inventory/farm/cargo/market schema require:
1. schema increment if needed
2. migration
3. old-save fixture
4. migration test
5. backup preservation
6. a new row in the `01` §6.1 migration ledger, in the same change

# 26. Performance-Sensitive Protocol

For repeated meshes, ground-cover density/visibility, terrain control textures or generated fields, large textures, shaders/post-processing/water/weather particles/new loaded regions, report:
```text
draw-call impact
triangle impact
texture impact
memory expectation
fallback/degradation behavior
```
and run representative browser profiling.

When post-processing is under test, compare `final` with the same-quality `no-post` path owned by Art Pipeline §13.3, without changing seed, camera, quality, cover, shadows, time, weather, DPR, or loaded assets. That owner defines which render passes and water inputs remain active; do not substitute a direct-render path that changes water quality. Inventory render targets and collect GPU frame timing where supported; otherwise label the hardware claim blocked.

# 27. Dependency Protocol

Before npm dependency: explain necessity, whether current stack can solve it, runtime vs dev-only, bundle impact, maintenance risk. No packages for trivial utilities.

# 28. Feature-Creep & Bug-Fix Protocols

Do not auto-add adjacent features. Example: weather task does **not** imply lightning damage, sinking, disease, festivals, umbrellas. Add extension points only if useful.

Bug workflow: reproduce → identify owner → failing test when possible → root-cause fix → regression verify → neighboring tests. Never patch renderer symptoms for simulation bugs.

Regression coverage should exercise the real owner with independent expected
outcomes. Keep the following boundaries when selecting or repairing tests:

| Area | Contract to protect | Existing evidence owner |
|---|---|---|
| Tooling and generated data | Lint source/tooling, not nested worktrees or generated evidence. Preserve complete geometry/atlas coverage without pathological assertion loops. | `eslint.config.js`, existing builder/atlas suites |
| Imported asset admission | Valid loop fixtures move and return to their start. Reject broken raw/Meshopt loops without altering source bytes, either published GLB destination or either manifest. | `tests/unit/artAdmission.test.ts` |
| Browser traversal timing | Pace held input and progress checks on delivered fixed steps (`data-physics-steps` / `NevaDebugSnapshot.physicsStepCount`), never on wall-clock time. `GameApp` caps its physics accumulator, so a starved browser drops simulation time instead of catching it up: real elapsed time is not a measure of how much the player was allowed to move, spend or drain. Wall clock is valid only for detecting a page that has stopped stepping entirely. | `tests/e2e/p12VerticalSlice.spec.ts` step pacing and `StepWatchdog`; `control-foundation.spec.ts` `hold`/`waitForSteps` |
| HUD semantics and interaction | Render current components/DTOs; assert selected and unselected tools, Work, seed blockers and vessel states. Clock expectations are independent of production formulas. SSR is not responsive/input proof. | `tests/unit/hud_m1.test.ts`, `tests/unit/viewport_budget_m1_adversarial.test.ts`, `tests/e2e/control-foundation.spec.ts` |
| Responsive coverage | Measure visible HTML descendants/hit targets with current CSS, not atlas resources or copied geometry. Cluster bounds are conservative occupancy, not painted pixels. Add separate high-load/vessel/placement scenarios where affected. | Current browser scenarios and styles |
| Source-rig animation | Load published Meshopt assets and compare bones/phase against an independent source-clip mixer across frame rates, hitches, pause, reduced motion and reset. Check semantic palms/equipment docking and fixed-length contacts. | Art Pipeline §10 and existing animation suites |
| Cover distribution | Distinguish generated budgets from final harbor clearance; do not refill intentionally open sand. Compare habitat bias with independently seeded eligible-ground samples; clustering and density are different properties. | `HarborCoastLayout` and existing world/cover suites |
| Atomic blocked dismount | Hold a valid mounted actor and control the two landing predicates. A refusal preserves saved state/events; restoring queries permits dismount. Real terrain traversal is separate. | Mount domain and Rapier traversal suites |
| Production render budget | Record actual viewport/DPR, settled quality, diagnostics/errors and worst sampled draws/triangles. Geometry inventory is not per-pass visibility; build/size success cannot clear a render overrun. | `playwright.budget.config.ts`, production budget test |

The production budget configuration owns its isolated build/artifact directory
and fixed high-tier viewport. Older auto-quality or different-viewport runs are
diagnostics, not comparable baselines. Preserve failed results and current
input scope in the checklist rather than appending run history to this playbook.

# 29. Review Severity

- **P0 Blocker:** boot failure, destroyed save, duplication exploit, soft lock, major data loss.
- **P1 Critical:** core loop, market, fishing, or boat unusable/broken.
- **P2 Major:** bad UX, significant visual regression, performance cliff, incorrect feedback.
- **P3 Minor:** polish/copy/small layout.
Fix P0/P1 before feature work.

# 30. Completion Report

Lead with changed behavior and why it matters, then give only relevant evidence:

- Owning files and `Docs updated:` paths, or `none — no documented fact changed`.
- Checks actually run, their result and scope; link retained evidence when useful.
- Save/migration impact for gameplay or persistence work.
- Material gaps: browser, human game review, performance, publication or release.

Routine selected-asset reports use the compact `BLENDER.md` handoff, including
asset IDs, runtime integration, mechanical publication status, save impact,
`Docs updated:` and `Awaiting human game review`. No empty screenshot field or
mandatory full-suite checklist. Never claim success without relevant evidence.

# 31. Reusable Agent Prompts

**Asset generation:** apply root `AGENTS.md`'s generate-asset contract and `BLENDER.md`'s selected production/handoff sequence. Folder attachments and external skills do not broaden the route or authorize provider calls.

**Coding agent:** use scoped task-class reading; preserve no-combat, simulation authority, deterministic RNG, versioned persistence, finite inventory, physical fish cargo, farming/fishing interdependence, DOM text UI, GLB runtime assets, and capability progression. Routine assets follow the lean gate and await human game review; broader coding work runs its proportional validation gate.

**Review agent:** inspect architecture invariants, determinism, saves, transaction safety, cargo uniqueness, formula ownership, UI/world protection, performance budgets, browser behavior. Prioritize by severity; give symptom, repro, owner, root cause, fix; no unrelated rewrites.

**Balancing agent:** inspect preparation cost, play/travel time, capacity, freshness, demand, spawn availability, skill gates, sinks; calculate profit/game-hour, profit/real-minute, profit/Work Capacity, capital, risk, attention; fix structural dominance before base rewards.

# 32. Balance/Playtest Metrics

Track: time to first harvest/fish/sport fish/boat; farm revenue/hour; basic-fishing revenue/hour; sport revenue/trip; trip duration; cargo utilization; freshness at sale; contract rate; demand variance; money earned/spent; time from dialogue to the next intended action; dialogue close/reopen errors; and whether players can recall why farming matters to fishing, why freshness matters, who helps them, and why the rowboat is earned. MVP may use development logs; no analytics backend required.

Before accepting a new mechanic or substantial balance change, observe a representative player session and record:

| Question | Evidence to seek |
|---|---|
| What meaningful choice changed? | Two plausible actions with understandable consequences; no single permanently dominant route |
| How does it connect farming, preparation, fishing or trade? | A player uses the connection and can explain why it helped |
| What repetition did it remove or justify? | Time/attention spent on repeated verbs, and whether the player wanted another trip |
| What can the player still do after failure or depletion? | A useful free action, clear recovery path and attainable next goal after low Work, lost tackle/catch or poor sales |
| Does the consequence read in the world? | Player notices weather, load, freshness or opportunity without inspecting formulas |

These are product acceptance observations, not a mandate for a new analytics
service or extra mechanics. Diagnose the failed loop before adding content.

Maintain an economy sanity sheet per chain: inputs, real/game time, capacity, expected gross/net. Update balancing docs after major value changes.

Ask testers:
- Why did farming matter to fishing?
- Was school discovery exciting?
- Was fishing skillful?
- Did boat capacity force decisions?
- Did freshness create useful urgency?
- Was market-price change understandable?
- Did major upgrades matter?
- What became repetitive?
- Was world scale right?
- Did you feel combat was needed?
If combat is requested due to low tension, improve systemic risk first.

UX failure signals: players buy all bait/ignore farm; farm one crop forever/ignore fishing; always target one fish; always wait for full boat; ignore freshness/weather/market; cannot explain price; storage feels punitive; watering dominates.

# 33. Content Expansion & Explicit Non-Scope

Post-MVP content must create at least one new preparation strategy, ecological condition, logistics decision, market behavior, capability, or progression path. Do not add dozens of behaviorally identical crops.

Candidates only after stable MVP: livestock, beekeeping, orchards, irrigation networks, ports/regional trade, cold-storage business, longliner, trophy/legendary fish, boat customization, employee automation, multiple farm climates, seasonal festivals, shared online market, co-op. Multiplayer last.

Explicitly not yet: PvP/combat, guilds/raids/MMO server/global auction house, armed boats, NPC romance, branching/large narrative, 30+ NPC schedules, persistent dialogue transcripts, a separate lore database, hundreds of recipes, unbounded runtime-procedural or MMO-scale world generation, hunger/thirst, realistic ocean physics/full rope sim/fully simulated crop biology. The authored linear spine, parallel linear tracks and small people/places/practices journal layer described by `02` are in scope; a large branching narrative is not. Content counts and track definitions belong to `src/content/`, not a second list here.

# 34. Final MVP & Agent Principle

MVP succeeds when a player starts with little, grows useful resources, turns them into fishing supplies, prepares a boat, finds a temporary school, actively lands valuable fish via skillful tension, physically transports limited catch, experiences freshness + demand in payout, and spends profit on a genuinely new farming/fishing capability.

If this loop is not satisfying, **do not expand the game**. When choosing between more systems and a stronger core loop, choose the stronger core loop.
