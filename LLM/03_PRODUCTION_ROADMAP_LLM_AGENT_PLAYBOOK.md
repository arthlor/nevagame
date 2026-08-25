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

No milestone advances until required checks pass:
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
Release/gold-slice work uses:

```text
npm run art:generate:strict -- --all
npm run art:validate -- --all
npm run art:benchmark
```

Normal generation may report below-target quality debt; strict generation may
not. A failed strict run does not mutate the published manifest.

`npm run art:validate` validates the published catalog/GLB contract; it does not
execute family generators or prove generator-specific `parameters`
completeness. A reference-guided task validates only its selected catalog
`referenceAuthoring` contract with `npm run art:brief` when the brief changes. A
change to `tools/blender/common/authored.py` or a consuming family module must
no-publish generate and determinism-check every impacted asset before
publication.

`npm run art:codegen:check` is the CI/review consistency gate; normal `dev`,
`build`, `typecheck`, and `test` refresh the generated adapter automatically.
The validated cache remains enabled for routine work. `/__neva_art_yard` is the
sole development asset-review surface and the human performs visual approval in
the integrated game.

# 5. Phase Map

`P0 Architecture → P0.5 Visual Rendering Foundation → P0.75 Gold-Standard Art Slice → P1 World → P2 Persistence/Time → P3 Farming → P4 Inventory/Processing → P5 Basic Fishing → P6 Boats → P7 Sport Fishing → P8 Cargo/Freshness → P9 Markets → P10 Progression/Contracts → P11 Weather/Seasons → P12 Full Slice QA → P13 MVP Content → P14 Final Art/Audio/UX Polish → P15 Performance/Browsers → P16 RC`.

**Critical sequencing rule:** visual identity is established before world production, not postponed to P14. P14 expands/polishes an already-approved visual system; it is not the first point at which final materials, lighting, water, foliage, or geometry language appear.

# 6. P0 — Repository & Architecture

**Build:** Vite/TS, Three.js, Vitest, Playwright, ESLint/Prettier, folder architecture, `GameApp`, `Simulation`, seeded RNG, clock, registry, renderer, DOM UI root, debug HUD, resize handling, fixture framework.

**Gate:** browser shows 3D scene + game time + debug HUD; typecheck/lint/test/build pass.

# 6.5. P0.5 — Visual Rendering Foundation

**Purpose:** establish the reusable rendering/material systems required to make ordinary gameplay-camera screenshots plausibly belong beside the approved references before the team/agents build a large world.

**Build:**
- one canonical `VisualRenderConfig` owner for color space, tone mapping, exposure, primary sun/fill, shadow quality tiers, AO/contact, atmosphere/fog, and restrained post-processing;
- one canonical `PaletteTokens` + `PaletteMaterials` owner; production code must consume tokens/material factories instead of arbitrary runtime colors/materials;
- calibrated warm sun + cool fill, grounded shadows/AO, atmosphere, and color pipeline;
- approved stylized water prototype with faceting, 2–3 low-frequency wave layers, shallow→deep palette, Fresnel-like response, and graphic foam;
- approved vegetation/rock shading prototypes;
- catalog-backed GLB loader with Meshopt decoding, source-scene cache/clones, and compatible static-prefab `THREE.BatchedMesh` consolidation; KTX2 only when a concrete texture path is implemented;
- generated typed asset IDs/family maps plus the runtime-only Vite catalog projection, with `npm run art:codegen:check` as the stale-adapter gate;
- development-only interactive WebGL yard at `/__neva_art_yard` for orbit, declared read-distance/LOD, wireframe, collision-proxy, lighting, fog/storm, and staged-run review;
- screenshot harness with fixed camera/resolution/time/weather/seed;
- separate **regression QA** (game vs approved game benchmark) and **style QA** (game vs graphics references, ignoring layout unless explicitly in scope).

**Rules:** no per-zone exposure/tone-map hacks; no toon/ink outlines; no DOF/tilt-shift dependency; normal texture targets follow `04` (mostly 128–1024, 2048 rare); renderer remains browser-budgeted.

**Gate:** a simple test scene containing terrain/grass, one rock family, one tree family, warm wood, warm stone/plaster, water edge/foam, and representative shadows looks coherent from the gameplay camera and meets the `04` visual score threshold. `npm run art:codegen:check` passes, the art yard loads the same catalog through the canonical runtime loader, and wireframe/collision/LOD/lighting diagnostics are usable without creating a second render baseline. Lock the baseline config after approval and regression-test future changes.

# 6.75. P0.75 — Gold-Standard Art Slice

**Purpose:** prove that the complete asset-production loop can reach the target aesthetic before mass production.

Build and approve, in this order unless a human explicitly changes it:
1. **Bridge + river:** terrain, stone, timber, vegetation, faceted water, foam, lighting, atmosphere.
2. **Starter farm:** farmhouse, field/crop, fence, path, tree, rocks, working props.
3. **Harbor:** dock, rowboat, fish-market/warehouse language, rope/nets/crates, ocean water.
4. **Coast/lighthouse:** cliffs, dark rocks, graphic foam, atmospheric perspective, sunset variant.

The first accepted slice must demonstrate final-or-near-final geometry language, palette/material vocabulary, renderer baseline, water/vegetation direction, scale, and gameplay-distance readability. **Do not mass-produce props, buildings, vegetation families, or zones while this gate fails.** `tests/visual/reference/approved-baselines.json` records human approval for farm/bridge/harbor/coast on 2026-08-24 (expansion baseline registry). That does not mean P0.75 is fully passed: the mechanical world exists, but art:generate:strict is the gold-slice/release gate (not the daily asset gate) and remains open while the latest report has 19 below_target assets and strict: false. Do not reopen a candidate-selection loop merely because the authored world grows; re-review proportionately when the renderer/material contract or those reference scenes materially change.

**Gate (still open until all of this is true of the current tree):** `04` Visual Acceptance at actual gameplay camera with overall ≥8/10, no category <7, and graphics-reference match ≥8/10; every reference-guided gold asset has a `ready` catalog brief and passes its front/rear/side/three-quarter plus 8 m/15 m/read-distance review set; performance remains within the current browser budget; GLB export/optimization/runtime load succeeds; `npm run art:generate:strict` passes the catalog/schema/palette/min-target-max contracts; `npm run art:validate` confirms the last published generated/public set; representative semantic determinism passes; `npm run art:benchmark` captures deterministic 1440×900 bridge/farm/harbor/coast evidence. Human approval is required before initial candidates become references; the current four baselines satisfy that human-approval registry step only.

# 7. P1 — Walkable World

**Build:** player controller, on-foot camera, collision, interaction system, and a large authored multi-district world with northwest starter farm, northeast homestead/orchard/windmill uplands, central village, river corridor, southwest lighthouse cliffs, southeast harbor, coast, offshore boundary, arterial roads, scenic trails, and contextual prompts. World geometry may remain selectively content-light while districts are filled, but it MUST use the approved P0.5/P0.75 renderer/material foundation rather than a visually unrelated throwaway style.

**Avoid:** NPC schedules, complex animation, empty or purely decorative scale, unbounded runtime-procedural terrain, and decorative overbuild. Authored-world production may use the 2026-08-24 baseline registry, but P0.75 strict remains open (19 below_target); do not treat mass art production as fully gated-complete.

**Gate:** semantic input/`GameplayMode`, movement/collision/camera/resize, overlay pause/modal capture (pause is an overlay, not a gameplay mode), camera obstruction/line-of-sight handling, and representative screenshots. Physics returns a frame through the adapter and only the simulation commits it. Physics may sample presentation `WaterSurface` for boat bob; canonical `boat.y` stays waterline.

# 8. P2 — Persistence & Time

**Build:** IndexedDB repo, save envelope (`CURRENT_SCHEMA_VERSION = 11`, `layoutRevision` 3), **primary + backup keys only** (no third manual slot), migrate-then-validate, autosave, calendar, weather-bounded offline delta/summary, and traversal-state persistence. Schema v10 inserts the harbor fish-table and lifts y=0 stations. Schema v11 converts illegal `fish.trout` item stacks to cargo. Before the first live release, topology revisions may deliberately invalidate development saves when a human explicitly authorizes it; after release, preserve compatible legacy Work Capacity, crop journal, starter-structure, docked-boat, quest, fish-table, and traversal state through explicit migrations.

Permanent fixtures: `save_v1_empty.json`, `save_v1_progressed.json`, `save_corrupt.json`; future versions add, never replace, fixtures.

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

**Build:** Farming/Fishing/Processing/Trading XP/ranks, capability unlocks, contract templates/generator/deadlines, reputation, journal discoveries, first farm upgrade, Skiff unlock.

**Gate:** at least 3 milestones materially change capability; percentage-only bonus does not count.

# 17. P11 — Weather & Seasons

**Build:** weather simulation/forecast, clear/rain/windy/storm, water roughness, crop moisture + fish-school interactions, seasons, market season modifiers, visual/audio weather.

**Gate:** weather/season must change the correct player decision in real play.

# 18. P12 — Full Vertical-Slice QA

Required new-save loop:
`plant wheat → harvest → grow worms → make grain → make chum → basic fish → rowboat → find school → chum → sport fish → store → return → freshness loss → sell → gain proficiency → unlock/purchase upgrade → save → reload`.

Required: unit + deterministic simulation + integration + E2E + screenshots; browser matrix at least Chromium, Firefox, WebKit. Do not mark P12 complete: the last Playwright browser-loop run failed; P12 is not proven.

# 19. P13 — MVP Content Expansion

Only after P12. Expand to 8 crops/12 fish; add Apple Tree, Flax, Fishing Skiff, more contracts, market variety, journal detail. Do not add new systems unless essential.

# 20. P14 — Final Art, Audio & UX Polish

P14 assumes P0.5/P0.75 already locked the visual language. Do **not** use P14 to replace placeholder rendering with the first real art pass; use it to finish coverage, variation, animation, audio, UX, and quality across the mature vertical slice.

- Environment: complete cohesive ground/vegetation/harbor/farm/weathered architecture/water coverage using approved family generators, shared authored construction grammar and materials.
- Crops: readable stages/harvest + instancing + final stage/season variations.
- Fish: silhouettes/animation/size readability + species material polish.
- Boats: cargo points/wake/steering feedback + final working-boat detail.
- Characters, if present: conform to `04` character proportions/face/hair/clothing/material/rig rules; no separate chibi/anime/realistic visual language.
- UI: coherent theme/animations/responsive/reduced motion while keeping the world primary.
- Audio/VFX: repeated verbs and place/condition ambience receive final tactile feedback without reward-firework clutter.
Follow `04` + Art Pipeline gates; do not break the locked `VisualRenderConfig`/`PaletteMaterials` contract for one-off beauty shots.

# 21. P15 — Performance & Browser Compatibility

Test: full farm, harbor, offshore, storm, full boat, market UI, sport fishing.
Measure: FPS, frame time, draw calls, triangles, memory, asset load, long tasks.
Required work: crop instancing, material dedupe, asset compression, texture audit, loading fallback, context-loss handling, Safari validation.

# 22. P16 — Release Candidate

Must pass: all loops; migration tests; no critical console errors/soft locks/item or cargo duplication/negative inventory/infinite market exploit; budgets acceptable; debug tools removed/protected; accessibility baseline; onboarding; browser matrix.

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

For repeated meshes, large textures, shaders/post-processing/water/weather particles/new loaded regions, report:
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

**Coding agent:** use scoped task-class reading; preserve no-combat, simulation authority, deterministic RNG, versioned persistence, finite inventory, physical fish cargo, farming/fishing interdependence, DOM text UI, GLB runtime assets, and capability progression. Routine assets follow the lean gate and await human game review; broader coding work runs its proportional validation gate.

**Review agent:** inspect architecture invariants, determinism, saves, transaction safety, cargo uniqueness, formula ownership, UI/world protection, performance budgets, browser behavior. Prioritize by severity; give symptom, repro, owner, root cause, fix; no unrelated rewrites.

**Balancing agent:** inspect preparation cost, play/travel time, capacity, freshness, demand, spawn availability, skill gates, sinks; calculate profit/game-hour, profit/real-minute, profit/Work Capacity, capital, risk, attention; fix structural dominance before base rewards.

# 32. Balance/Playtest Metrics

Track: time to first harvest/fish/sport fish/boat; farm revenue/hour; basic-fishing revenue/hour; sport revenue/trip; trip duration; cargo utilization; freshness at sale; contract rate; demand variance; money earned/spent. MVP may use development logs; no analytics backend required.

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

Explicitly not yet: PvP/combat, guilds/raids/MMO server/global auction house, armed boats, NPC romance/large narrative/30+ schedules, hundreds of recipes, unbounded runtime-procedural or MMO-scale world generation, hunger/thirst, realistic ocean physics/full rope sim/fully simulated crop biology. A large authored regional world is in scope.

# 34. Final MVP & Agent Principle

MVP succeeds when a player starts with little, grows useful resources, turns them into fishing supplies, prepares a boat, finds a temporary school, actively lands valuable fish via skillful tension, physically transports limited catch, experiences freshness + demand in payout, and spends profit on a genuinely new farming/fishing capability.

If this loop is not satisfying, **do not expand the game**. When choosing between more systems and a stronger core loop, choose the stronger core loop.
