# Farm & Fishing Browser Game — Production Roadmap & LLM Agent Playbook (Compact)

> **Role:** Execution manual. Prevent feature/architecture drift, regressions, and premature complexity.

# 0. Agent Mission & Read Order

Build the smallest reliable increment that strengthens:
`farm → process → prepare → sail → discover → fish → transport → sell → upgrade`.
Do not optimize for code volume.

Mandatory authority/read order:
1. `01_GAME_FOUNDATIONS_ARCHITECTURE.md`
2. `02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md`
3. `04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md`
4. `LLM_AGENT_ART_PIPELINE_INSTRUCTIONS.md`
5. `ARCHEAGE_FARMING_SYSTEM.md`
6. this roadmap
7. `BLENDER.md` + `tools/blender/README.md` for generated-asset/rendering work
8. relevant machine contracts and source files
9. relevant tests
10. current task

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
## Visual Verification
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

Generated-art changes additionally use the implemented command ladder:
```text
npm run art:generate -- --asset/--family ... --no-publish  candidate iteration
npm run art:determinism -- --asset/--family ...             semantic reproducibility
npm run art:generate                                         validated atomic publish
npm run art:validate                                         published/generated parity
npm run art:preview                                          catalog review yard
npm run art:benchmark                                        fixed bridge/farm/harbor/coast candidates
npm run art:generate:strict                                  production/gold-slice quality gate
```
Normal generation may report below-target quality debt; strict generation may not. A failed strict run does not mutate the published manifest.

`npm run art:validate` validates the published catalog/GLB contract; it does not execute family generators or prove generator-specific `parameters` completeness. A change to `tools/blender/common/authored.py` or a consuming family module must no-publish generate every impacted catalog asset before determinism, strict, preview and benchmark acceptance.

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
- screenshot harness with fixed camera/resolution/time/weather/seed;
- separate **regression QA** (game vs approved game benchmark) and **style QA** (game vs graphics references, ignoring layout unless explicitly in scope).

**Rules:** no per-zone exposure/tone-map hacks; no toon/ink outlines; no DOF/tilt-shift dependency; normal texture targets follow `04` (mostly 128–1024, 2048 rare); renderer remains browser-budgeted.

**Gate:** a simple test scene containing terrain/grass, one rock family, one tree family, warm wood, warm stone/plaster, water edge/foam, and representative shadows looks coherent from the gameplay camera and meets the `04` visual score threshold. Lock the baseline config after approval and regression-test future changes.

# 6.75. P0.75 — Gold-Standard Art Slice

**Purpose:** prove that the complete asset-production loop can reach the target aesthetic before mass production.

Build and approve, in this order unless a human explicitly changes it:
1. **Bridge + river:** terrain, stone, timber, vegetation, faceted water, foam, lighting, atmosphere.
2. **Starter farm:** farmhouse, field/crop, fence, path, tree, rocks, working props.
3. **Harbor:** dock, rowboat, fish-market/warehouse language, rope/nets/crates, ocean water.
4. **Coast/lighthouse:** cliffs, dark rocks, graphic foam, atmospheric perspective, sunset variant.

The first accepted slice must demonstrate final-or-near-final geometry language, palette/material vocabulary, renderer baseline, water/vegetation direction, scale, and gameplay-distance readability. **Do not mass-produce props, buildings, vegetation families, or zones while this gate fails.**

**Gate:** `04` Visual Acceptance passes at actual gameplay camera with overall ≥8/10, no category <7, and graphics-reference match ≥8/10; performance remains within the current browser budget; GLB export/optimization/runtime load succeeds; `npm run art:generate:strict` passes the catalog/schema/palette/min-target-max contracts; `npm run art:validate` confirms the last published generated/public set; representative semantic determinism passes; `npm run art:benchmark` captures deterministic 1440×900 bridge/farm/harbor/coast candidates. Human approval is still required before candidates become references.

# 7. P1 — Walkable World

**Build:** player controller, on-foot camera, collision, interaction system, village placeholder, farm, river, lake, harbor, coast, offshore boundary, contextual prompts. World geometry may remain content-light, but it MUST use the approved P0.5/P0.75 renderer/material foundation rather than a visually unrelated throwaway style.

**Avoid:** NPC schedules, complex animation, huge world, decorative overbuild, and mass-producing final art before the gold-standard slice is approved.

**Gate:** movement/collision/camera/resize/pause/modal input capture + representative screenshots.

# 8. P2 — Persistence & Time

**Build:** IndexedDB repo, save envelope/schema version, backup, validation, migrations, autosave, calendar, offline delta/summary.

Permanent fixtures: `save_v1_empty.json`, `save_v1_progressed.json`, `save_corrupt.json`; future versions add, never replace, fixtures.

**Gate:** reload preserves player position, money, time, dummy inventory, world seed; offline delta deterministic under fixed time.

# 9. P3 — Farming Vertical Slice

**Build:** crop definitions/state, placement validation/ghost, stages, climate, moisture, renderer sync, harvest, inventory transfer, Farming XP, save integration, offline growth. Initial crops: Wheat, Tomato, Potato.

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

Required: unit + deterministic simulation + integration + E2E + screenshots; browser matrix at least Chromium, Firefox, WebKit.

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

Browser playtest covers: boot, input, visual/aesthetic gate, save, performance. Significant renderer/material/family-generator/shared-authored-construction changes also re-run the gold-standard slices; do not approve only a flattering close render.

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

Every coding task reports:
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
- strict quality status and below-target debt:
- published manifest vs latest candidate report:
### Visual verification
### Performance notes
### Known limitations
### Next recommended task
```
Never claim success without actual validation results.

# 31. Reusable Agent Prompts

**Coding agent:** read authorities/relevant subsystem; preserve no-combat, simulation authority, deterministic RNG, versioned persistence, finite inventory, physical fish cargo, farming/fishing interdependence, no MVP multiplayer, DOM text UI, GLB runtime assets, capability progression. Identify owner/files/save/tests/performance before coding; implement smallest complete solution; run Standard Validation Gate; report results/screenshots/limitations.

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

Explicitly not yet: PvP/combat, guilds/raids/MMO server/global auction house, armed boats, NPC romance/large narrative/30+ schedules, hundreds of recipes, massive procedural world, hunger/thirst, realistic ocean physics/full rope sim/fully simulated crop biology.

# 34. Final MVP & Agent Principle

MVP succeeds when a player starts with little, grows useful resources, turns them into fishing supplies, prepares a boat, finds a temporary school, actively lands valuable fish via skillful tension, physically transports limited catch, experiences freshness + demand in payout, and spends profit on a genuinely new farming/fishing capability.

If this loop is not satisfying, **do not expand the game**. When choosing between more systems and a stronger core loop, choose the stronger core loop.
