# Farm & Fishing Browser Game — Production Roadmap & LLM Agent Playbook (Compact)

> **Role:** Execution manual. Prevent feature/architecture drift, regressions, and premature complexity.

# 0. Agent Mission & Read Order

Build the smallest reliable increment that strengthens:
`farm → process → prepare → sail → discover → fish → transport → sell → upgrade`.
Do not optimize for code volume.

Task-class authority/read order is routed by root `AGENTS.md` and
`BLENDER.md`. Routine existing-asset work must not load this roadmap or every
canonical file by default. Read this roadmap in full for milestone, release,
gold-slice, cross-system, or gameplay sequencing work.

Identify subsystem ownership before coding; do not search/randomly modify files.

# 1. Required Agent Preflight

Before implementation, record:
```text
Subsystem
Source of truth
Persistent-state impact
Save migration required
Renderer impact
UI impact
Test impact
Performance risk
Dependencies required
```
If ownership is unclear, inspect architecture first.

# 2. Change Rules

Agents MUST: prefer existing architecture; modify owning subsystem; avoid duplicate state/constants; keep state serializable; preserve deterministic simulation; add tests; run validation; visually verify WebGL/UI changes; report changed files and known issues.

Agents MUST NOT: silently add frameworks; rewrite architecture for convenience; add multiplayer/combat/unrelated features; remove tests to pass CI; weaken types/use `any` to hide errors; bypass migrations; duplicate content constants.

# 3. Standard Task Contract

Every ticket includes:
```md
# Task: <short title>
## Goal
## Required Reading
## In Scope
## Out of Scope
## Invariants
## Implementation Order
## Acceptance Criteria
## Required Tests
- unit:
- simulation:
- integration:
- e2e:
## Human Game Review or Release Visual Verification
## Save Compatibility
Migration required: yes/no
## Completion Report
Changed files:
Tests added:
Screenshots:
Known issues:
```

# 4. Standard Validation Gate

No phase is marked complete until its required checks pass. A recorded
sub-gate, such as the human P0.75 visual decision, may authorize the scoped
follow-on work named by that sub-gate without falsely closing the remaining
technical or release gates:
```text
npm run typecheck
npm run lint
npm run test
npm run build
relevant npm run test:e2e
relevant unit/integration/simulation tests
manual/browser screenshot check
save/load verification when persistent/user-facing
```
If a gate fails, fix it before adding features.

Routine selected-asset work is an explicit exception to the broad milestone
gate. It uses:

```text
npm run art:brief -- --asset ID       only when that image/study-guided brief changed
npm run art:generate -- --asset ID    selected validation, optimization and atomic publish
runtime integration
npm run typecheck                     only when runtime TypeScript changed
```

No bare catalog command is allowed; use `--asset`, `--family`, or explicit
release `--all`. Routine work does not run static previews, screenshots,
determinism, strict density, benchmarks, full builds, broad tests, or agent-led
visual scoring. The human checks the integrated result in the game.

Shared-generator/helper work uses affected-family no-publish generation,
builder tests when applicable, affected-family determinism, then one publish.
The P0.75 visual-gold gate uses the current published set and gameplay-camera
benchmark:

```text
npm run art:sync -- --all
npm run art:validate -- --all
npm run art:benchmark
```

Technical-art certification and release work additionally use:

```text
npm run art:generate:strict -- --all
npm run art:validate -- --all
npm run art:determinism -- --all
npm run art:benchmark
```

Normal generation may report below-target quality debt; strict generation may
not. A failed strict run does not mutate the published manifest.

`npm run art:validate` validates the catalog schema, generator-parameter
contracts, LOD/animation/reference contracts, and the published catalog/GLB
metrics. It does not execute family generators or prove that generator
geometry semantics are correct beyond the exported artifact contract. A
reference-guided task validates only its selected catalog
`referenceAuthoring` contract with `npm run art:brief` when the brief changes.
A change to `tools/blender/common/authored.py` or a consuming family module must
no-publish generate and determinism-check every impacted asset before
publication.

`npm run art:codegen:check` is the CI/review consistency gate; normal `dev`,
`build`, `typecheck`, and `test` refresh the generated adapter automatically.
The validated cache remains enabled for routine work. `/__neva_art_yard` is the
sole development asset-review surface and the human performs visual approval in
the integrated game.

# 5. Phase Map

`P0 Architecture → P0.5 Visual Rendering Foundation → P0.75 Gold-Standard Art Slice → P1 World → P2 Persistence/Time → P3 Farming → P4 Inventory/Processing → P5 Basic Fishing → P6 Boats → P7 Sport Fishing → P8 Cargo/Freshness → P9 Markets → P10 Progression/Contracts → P11 Weather/Seasons → P12 Full Slice QA (including narrative proof) → P13 MVP Content → P14 Final Art/Audio/UX Polish → P15 Performance/Browsers → P16 RC`.

**Critical sequencing rule:** visual identity is established before world production, not postponed to P14. P14 expands/polishes an already-approved visual system; it is not the first point at which final materials, lighting, water, foliage, or geometry language appear.

# 6. P0 — Repository & Architecture

**Build:** Vite/TS, Three.js, Vitest, Playwright, ESLint/Prettier, folder architecture, `GameApp`, `Simulation`, seeded RNG, clock, registry, authored NPC/quest content, renderer, DOM UI root, debug HUD, resize handling, fixture framework.

**Gate:** browser shows 3D scene + game time + debug HUD; typecheck/lint/test/build pass.

# 6.5. P0.5 — Visual Rendering Foundation

**Purpose:** establish the reusable rendering/material systems required to make ordinary gameplay-camera screenshots plausibly belong beside the approved references before the team/agents build a large world.

**Build:**
- one canonical `VisualRenderConfig` owner for color space, tone mapping, exposure, primary sun/fill, shadow quality tiers, AO/contact, atmosphere/fog, and restrained post-processing;
- one canonical `PaletteTokens` + `PaletteMaterials` owner; production code must consume tokens/material factories instead of arbitrary runtime colors/materials;
- calibrated warm sun + cool fill, grounded shadows/AO, atmosphere, and color pipeline;
- canonical ground-surface foundation: class-aware terrain normals, semantic grass/meadow/soil/path/shore/cliff blending, bounded macro/meso variation, and weather wetness through `VisualRenderConfig`;
- one authored route/profile owner shared by terrain grading/surface influence, road presentation, map projection, cover exclusion, and relevant collision queries; roads have route-kind width, worn core/ruts, soft shoulders, terrain integration, and shaped junctions;
- deterministic semantic ground-cover density with clustered short/medium/tall hierarchy, authored clearances, variant/palette grouping, instancing, draw-distance culling, and quality-tier counts;
- approved stylized water prototype with faceting, 2–3 low-frequency wave layers, shallow→deep palette, Fresnel-like response, and graphic foam;
- approved vegetation/rock shading prototypes;
- catalog-backed GLB loader with Meshopt decoding, source-scene cache/clones, and compatible static-prefab `THREE.BatchedMesh` consolidation; KTX2 only when a concrete texture path is implemented;
- generated typed asset IDs/family maps plus the runtime-only Vite catalog projection, with `npm run art:codegen:check` as the stale-adapter gate;
- development-only interactive WebGL yard at `/__neva_art_yard` for orbit, declared read-distance/LOD, wireframe, collision-proxy, lighting, fog/storm, and staged-run review;
- screenshot harness with fixed camera/resolution/time/weather/seed;
- separate **regression QA** (game vs approved game benchmark) and **style QA** (game vs graphics references, ignoring layout unless explicitly in scope).

**Rules:** no per-zone exposure/tone-map hacks; no toon/ink outlines; no DOF/tilt-shift dependency; normal texture targets follow `04` (mostly 128–1024, 2048 rare); renderer remains browser-budgeted.

**Ground-foundation implementation order:** (1) landform/normals and triangle-grid suppression; (2) semantic slope/height/route/shore fields plus macro/meso material variation; (3) terrain-integrated roads and junctions; (4) clustered instanced cover consuming those route/shore fields; (5) shoreline/cliff dressing, contact continuity, and restrained surface detail/weather. Shoreline semantics exist before cover placement even when shoreline dressing is refined afterward. Do not hide a weak earlier layer by adding more props or foliage.

**Ground acceptance:** at a fixed world seed, surface fields and cover placement regenerate identically; traversable terrain does not expose a regular triangle grid; authored landform breaks remain readable; roads have no visible slab seam or z-fighting and transition through worn cores/shoulders into surrounding ground; road and shoreline exclusions suppress inappropriate cover; short grass does not create broad dynamic-shadow load; quality tiers reduce count/distance without changing route, shore, collision, or placement truth; any materially walkable deformation agrees across render height, Rapier, placement, and anchors. Exact widths, frequencies, slopes, depths, counts, and control-field resolution remain centrally owned starting values to tune under the gameplay camera, not permanent Art Bible constants.

**Gate:** a simple test scene containing terrain/grass, one route with a junction/shoulder, one bank or slope transition, one shoreline, clustered short/tall cover, one rock family, one tree family, warm wood, warm stone/plaster, water edge/foam, and representative shadows reads coherently from the gameplay camera under the qualitative criteria in `04`. No numeric human score is required. Regular terrain topology is not the dominant pattern; road/terrain/cover/shore transitions agree; the same scene remains readable in at least one wet-weather state and across quality tiers without changing gameplay truth. `npm run art:codegen:check` passes, the art yard loads the same catalog through the canonical runtime loader, and wireframe/collision/LOD/lighting diagnostics are usable without creating a second render baseline. Lock the baseline config after approval and regression-test future changes.

# 6.75. P0.75 — Gold-Standard Art Slice

**Purpose:** prove that the complete asset-production loop can reach the target aesthetic before mass production.

Build and approve, in this order unless a human explicitly changes it:
1. **Bridge + river:** landform-dominant terrain, integrated route approaches, grass/soil/slope/shore transitions, clustered vegetation/reeds, stone, timber, faceted water, foam, lighting, atmosphere.
2. **Starter farm:** farmhouse, field/crop, fence, path, tree, rocks, working props.
3. **Harbor:** dock, rowboat, fish-market/warehouse language, rope/nets/crates, ocean water.
4. **Coast/lighthouse:** cliffs, dark rocks, graphic foam, atmospheric perspective, sunset variant.

The first accepted slice must demonstrate final-or-near-final geometry language, ground/route/cover/shore agreement, palette/material vocabulary, renderer baseline, water/vegetation direction, scale, and gameplay-distance readability. **Do not mass-produce props, buildings, vegetation families, or zones before the human visual-gold decision is accepted.** Gold-slice heroes with isolated sheets must have those files on disk under `tools/blender/references/isolated/` and identity-defining layout bound into catalog `parameters` (no silent generator defaults for primary structure). `tests/visual/reference/approved-baselines.json` retains the 2026-08-24 reference images and records the 2026-08-27 human visual-gold decision for the bridge/farm/harbor/coast scope. That decision unlocks further authored-world expansion; it does not certify the full catalog or release readiness. Per-asset triangle target floors are advisory for this visual lane; production minimums, hard maximums, materials, nodes, palette, runtime validation, and the published 188-asset manifest remain enforced. Do not reopen a candidate-selection loop merely because the authored world grows; re-review proportionately when the renderer/material/terrain-normal/route-surface contract or those reference scenes materially change.

**Visual Gold Decision:** the human-approved bridge, farm, harbor, and coast gameplay-camera slices are recorded in the existing baseline registry. This is the visual-direction decision that permits further authored-world expansion and does not invent numeric scores.

**P0.75 Technical Render Gate (open):** the current 188 published GLBs and manifest validate against the catalog, and `npm run art:benchmark` must have no browser errors, no more than 220 draw calls, and no more than 900,000 visible triangles in each measured scene. The lower per-scene/per-asset target floors are advisory in this lane and do not waive production minimums, hard maximums, material/node/palette contracts, or runtime validation. The current DEV layout-editor benchmark is intentionally unbatched, so its farm/coast over-budget result remains open evidence rather than a reason to relax `tools/blender/asset_budgets.json`.

**Technical-Art Certification (open):** `npm run art:generate:strict` retains its existing below-target rejection semantics; `npm run art:validate` confirms the published set; representative clean-source determinism passes; and the benchmark is reproducible in the certified path. The current clean-source `prop_beehive_a` no-mesh generation failure and the 33 below-target report remain visible technical debt. Release/P16 claims stay blocked until this lane and the independent gameplay/release evidence pass.

# 7. P1 — Walkable World

**Build:** player controller, on-foot camera, collision, interaction system, named NPC anchors, and a large authored multi-district world with northwest starter farm, northeast village hub (plaza/market, mill, inn, cottages, barn, homestead garden, orchard fringe), river corridor with an east-bank crossing gateway at the former stall site, southwest lighthouse cliffs, southeast harbor, coast, offshore boundary, arterial roads, scenic trails, and contextual prompts. World geometry may remain selectively content-light while districts are filled, but it MUST use the approved P0.5/P0.75 renderer/material foundation rather than a visually unrelated throwaway style. Story landmarks support the current quest spine without becoming gameplay authorities.

**Avoid:** NPC schedules, complex animation, empty or purely decorative scale, unbounded runtime-procedural terrain, and decorative overbuild. Authored-world production may use the accepted 2026-08-27 visual-gold baseline registry, while P0.75 technical-art certification remains open (33 below-target records plus the clean-source `prop_beehive_a` blocker); do not treat release or P16 as complete.

**Gate:** semantic input/`GameplayMode`, movement/collision/camera/resize, overlay pause/modal capture (pause is an overlay, not a gameplay mode), camera obstruction/line-of-sight handling, and representative screenshots. Physics returns a frame through the adapter and only the simulation commits it. Physics may sample presentation `WaterSurface` for boat bob; canonical `boat.y` stays waterline.

# 8. P2 — Persistence & Time

**Build:** IndexedDB repo, save envelope (`CURRENT_SCHEMA_VERSION = 17`, `layoutRevision` 8), **primary + backup keys only** (no third manual slot), migrate-then-validate, autosave, calendar, weather-bounded offline delta/summary, and traversal-state persistence. Schema v10 inserts the harbor fish-table and lifts y=0 stations. Schema v11 converts illegal `fish.trout` item stacks to cargo. Schema v12 migrates physical worked-road terrain without changing saved X/Z or unrelated state: on-foot players and structures re-ground through final canonical height while active boat/player waterline truth remains unchanged. Schema v13 advances layout 4 → 5 for the northeast village hub: it moves the starter mill off the homestead plantable, relocates the village market and road hub to the northeast plaza, keeps `(0, -5)` as the river-crossing gateway, preserves other structure/player/boat/crop/quest truth, and re-grounds land state. Schema v14 advances layout 5 → 6: it moves the starter mill off the packed plaza onto a southwest mill pad, keeps the village market at the northeast hub, enlarges the courtyard, preserves unrelated state, and re-grounds land state. Schema v15 advances layout 6 → 7 for the authored station/road world: it relocates the mill, starter workbench, compost bin, and harbor fish table to their canonical anchors; adopts the revised bridge/road/terrain topology; preserves unrelated simulation state; re-grounds land structures and an on-foot player; and leaves active-boat waterline state unchanged. Schema v17 advances layout 7 → 8 for the authored beach, rock-toe, and recessed-cliff topology with the same preservation and land re-grounding boundary. Before the first live release, topology revisions may deliberately invalidate development saves when a human explicitly authorizes it; after release, preserve compatible legacy Work Capacity, crop journal, starter-structure, docked-boat, quest, fish-table, and traversal state through explicit migrations.

Schema v16 does not change the authored world or the narrative state. It normalizes legacy clock speed and fills the persisted `weather.nextWeatherType` forecast successor; dialogue page position, modal state, and last-spoken line remain transient and are never saved.

Permanent fixtures add, never replace, historical saves. The physical-road migration is covered by `tests/fixtures/save_v11_layout3.json`; the subsequent mill relocation onto the plaza mill pad is covered by `tests/fixtures/save_v12_layout4.json`; moving the mill off the packed courtyard is covered by `tests/fixtures/save_v13_layout5.json`; the layout-7 station/topology migration is covered by `tests/fixtures/save_v14_layout6.json`; and the layout-8 coast-topology migration is covered by `tests/fixtures/save_v16_layout7.json`. Retain all five alongside future version fixtures.

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

**Build:** Farming/Fishing/Processing/Trading XP/ranks, capability unlocks, the explicit authored quest chain, contract templates/generator/deadlines, reputation, journal discoveries, first farm upgrade, Skiff unlock. Story rewards must change a capability, resource, knowledge state, or next decision; text alone is not progression.

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

Required: unit + deterministic simulation + integration + narrative payload/UI
E2E + screenshots; browser matrix at least Chromium, Firefox, WebKit. Do not
mark P12 complete: the last Playwright browser-loop run failed; the continuous
new-save narrative/gameplay loop and browser save/reload proof remain open.

# 19. P13 — MVP Content Expansion

Only after P12. Expand to 8 crops/12 fish; add Apple Tree, Flax, Fishing Skiff, more contracts, market variety, journal detail, and only then optional side-story or lore entries. Any new narrative must introduce a meaningful place, practice, relationship, ecological condition, logistics decision, or capability; do not add exposition-only errands or behaviorally identical quest chains. Do not add new systems unless essential.

# 20. P14 — Final Art, Audio & UX Polish

P14 assumes P0.5/P0.75 already locked the visual language. Do **not** use P14 to replace placeholder rendering with the first real art pass; use it to finish coverage, variation, animation, audio, UX, and quality across the mature vertical slice.

- Environment: complete cohesive landform/material/route/shore/clustered-cover agreement plus harbor/farm/weathered architecture/water coverage using approved world-layout semantics, family generators, shared authored construction grammar and materials.
- Crops: readable stages/harvest + instancing + final stage/season variations.
- Fish: silhouettes/animation/size readability + species material polish.
- Boats: cargo points/wake/steering feedback + final working-boat detail.
- Characters, if present: conform to `04` character proportions/face/hair/clothing/material/rig rules; no separate chibi/anime/realistic visual language.
- UI: coherent theme/animations/responsive/reduced motion while keeping the world primary.
- Narrative presentation: post-milestone NPC recognition, concise journal people/places/practices entries, and environmental story cues may deepen the live chain without introducing unowned branches or a second save system.
- Audio/VFX: repeated verbs, story transitions, and place/condition ambience receive final tactile feedback without reward-firework clutter.
Follow `04` + Art Pipeline gates; do not break the locked `VisualRenderConfig`/`PaletteMaterials` contract for one-off beauty shots.

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

Maintain deterministic screenshot states such as:
```text
starter_empty
farm_growing
farm_mature
basic_fishing
sport_fishing_tuna
sport_fishing_marlin
boat_loaded
harbor_market
rain
storm
inventory
journal
dialogue_elspeth_welcome
dialogue_barnaby_chum
dialogue_maeve_harbor
dialogue_silas_final_report
bridge_river
coastal_lighthouse
```
Use fixed camera/resolution/world state where applicable and review against `04` + Art Pipeline.

Browser playtest covers: boot, input, visual/aesthetic gate, save, performance. Significant renderer/material/family-generator/shared-authored-construction changes also re-run the gold-standard slices. Reference-guided assets first pass their deterministic brief; its requested views are inspected by the human through Art Yard/game controls rather than static preview generation.

# 24. Coding & Formula Ownership

Prefer small modules, pure functions, explicit state machines, readonly definitions, centralized formulas/tuning, strong types/names, early returns, domain tests. Avoid magic numbers, deep conditional pyramids, giant switches/god objects, ambient globals, cross-module mutation, anonymous untyped maps.

Every formula has one owner, e.g.:
```text
crop growth → simulation/farming/calculateCropGrowth.ts
fish value → simulation/economy/calculateFishValue.ts
freshness → simulation/fishing/calculateFreshness.ts
market demand → simulation/economy/updateMarket.ts
```
UI consumes results; never reproduces formulas.

Centralize tuning, e.g. `demandMin:0.65`, `demandMax:1.60`, `marketTickMinutes:60`.

Dev startup validation: duplicate IDs, missing item/habitat/unlock, invalid crop time/yield/cargo class, negative prices, unresolvable recipes. Fail loudly.

# 25. Save-Sensitive Protocol

Changes to state shape, persistent IDs, saved enums, inventory/farm/cargo/market schema require:
1. schema increment if needed
2. migration
3. old-save fixture
4. migration test
5. backup preservation

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

# 27. Dependency Protocol

Before npm dependency: explain necessity, whether current stack can solve it, runtime vs dev-only, bundle impact, maintenance risk. No packages for trivial utilities.

# 28. Feature-Creep & Bug-Fix Protocols

Do not auto-add adjacent features. Example: weather task does **not** imply lightning damage, sinking, disease, festivals, umbrellas. Add extension points only if useful.

Bug workflow: reproduce → identify owner → failing test when possible → root-cause fix → regression verify → neighboring tests. Never patch renderer symptoms for simulation bugs.

# 29. Review Severity

- **P0 Blocker:** boot failure, destroyed save, duplication exploit, soft lock, major data loss.
- **P1 Critical:** core loop, market, fishing, or boat unusable/broken.
- **P2 Major:** bad UX, significant visual regression, performance cliff, incorrect feedback.
- **P3 Minor:** polish/copy/small layout.
Fix P0/P1 before feature work.

# 30. Completion Report

General coding tasks use the expanded report below. Routine selected-asset work
instead reports only asset IDs, runtime integration point, mechanical generation
status, TypeScript status when applicable, save impact, and `Awaiting human game
review`.

Expanded report:
```md
## Completion
### What changed
### Files changed
### Gameplay behavior
### Narrative evidence
### Narrative content owner and save impact
### Save compatibility
### Tests added/updated
### Validation run
- typecheck:
- lint:
- unit:
- integration:
- e2e:
- build:
- art generate/validate/determinism when applicable:
- art codegen/codegen:check:
- art cache input hashes/hits/misses:
- strict quality status and below-target debt:
- published manifest vs latest candidate report:
### Visual verification
- interactive art yard route/stage and controls when applicable:
### Performance notes
### Known limitations
### Next recommended task
```
Never claim success without actual validation results.

# 31. Reusable Agent Prompts

**Asset generation:** `@LLM @tools check these for guidance, generate assets of <subject>` is a folder dump, not equal authority. Obey root `AGENTS.md`, `LLM/BLENDER.md`, `tools/blender/README.md`, the selected catalog entry, owning family generator, isolated sheet if present, and the relevant Art Bible section. Do not start `threejs-game-director` for this prompt. Do not run polyfork import/register or `generate_all.py`. Resolve catalog ID → registered family generator (not polyfork for isolated-sheet or unique-silhouette assets) → measure sheet identity into `parameters` → `art:brief` only if the brief changed → `npm run art:generate -- --asset` → integrate → Art Yard. Completion report is the `BLENDER.md` handoff (Art Yard link, no screenshot field): `Awaiting human game review`. Leave `02` and ArcheAge unread for this prompt class.

**Coding agent:** use scoped task-class reading; preserve no-combat, simulation authority, deterministic RNG, versioned persistence, finite inventory, physical fish cargo, farming/fishing interdependence, DOM text UI, GLB runtime assets, and capability progression. Routine assets follow the lean gate and await human game review; broader coding work runs its proportional validation gate.

**Review agent:** inspect architecture invariants, determinism, saves, transaction safety, cargo uniqueness, formula ownership, UI/world protection, performance budgets, browser behavior. Prioritize by severity; give symptom, repro, owner, root cause, fix; no unrelated rewrites.

**Balancing agent:** inspect preparation cost, play/travel time, capacity, freshness, demand, spawn availability, skill gates, sinks; calculate profit/game-hour, profit/real-minute, profit/Work Capacity, capital, risk, attention; fix structural dominance before base rewards.

# 32. Balance/Playtest Metrics

Track: time to first harvest/fish/sport fish/boat; farm revenue/hour; basic-fishing revenue/hour; sport revenue/trip; trip duration; cargo utilization; freshness at sale; contract rate; demand variance; money earned/spent; time from dialogue to the next intended action; dialogue close/reopen errors; and whether players can recall why farming matters to fishing, why freshness matters, who helps them, and why the rowboat is earned. MVP may use development logs; no analytics backend required.

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

Explicitly not yet: PvP/combat, guilds/raids/MMO server/global auction house, armed boats, NPC romance, branching/large narrative, 30+ NPC schedules, persistent dialogue transcripts, a separate lore database, hundreds of recipes, unbounded runtime-procedural or MMO-scale world generation, hunger/thirst, realistic ocean physics/full rope sim/fully simulated crop biology. The authored ten-quest MVP spine and a small post-P12 people/places/practices journal layer are in scope; a large branching narrative is not.

# 34. Final MVP & Agent Principle

MVP succeeds when a player starts with little, grows useful resources, turns them into fishing supplies, prepares a boat, finds a temporary school, actively lands valuable fish via skillful tension, physically transports limited catch, experiences freshness + demand in payout, and spends profit on a genuinely new farming/fishing capability.

If this loop is not satisfying, **do not expand the game**. When choosing between more systems and a stronger core loop, choose the stronger core loop.
