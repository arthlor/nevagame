# Neva Project Rules for Every Codex Session

> **Mandatory:** These rules apply to every prompt and task opened anywhere in this Neva workspace. Before planning, answering implementation questions, changing code or art, or claiming a result, read the relevant authoritative repository files **to the end**. Repository-relative paths are authoritative; never rely on an old memory or a developer-specific absolute path when the source exists.

## Canonical authorities

1. `LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md` — primary technical authority: architecture, state ownership, determinism, persistence, input/modes, runtime stack, performance and cross-system invariants.
2. `LLM/02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md` — gameplay/balance/math authority: farming, crop lifecycle, fishing, cargo/boats, markets, Work Capacity, progression, contracts and vertical-slice rules.
3. `LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md` — visual authority: reference lock, geometry/facets, palette/materials, lighting, renderer baseline, water, vegetation, budgets and visual QA.
4. `LLM/LLM_AGENT_ART_PIPELINE_INSTRUCTIONS.md` — 3D/procedural/rendering production authority: Blender-to-GLB workflow, generator/spec rules, `VisualRenderConfig`, optimization and visual regression/style-match implementation.
5. `LLM/ARCHEAGE_FARMING_SYSTEM.md` — farming inspiration/adaptation only; subordinate to the preceding authorities.
6. `LLM/03_PRODUCTION_ROADMAP_LLM_AGENT_PLAYBOOK.md` — execution, milestones, validation, and completion-report authority.
7. `LLM/BLENDER.md` — operational authority for catalog-driven Blender production, validation, publishing, reports, previews, and runtime handoff.

Machine-readable authorities for the fields they own:

- `assets/specs/asset-catalog.schema.json` and `assets/specs/asset-catalog.json`
- `art/palettes/neva.palette.json`
- `tools/blender/asset_budgets.json`
- `tools/blender/README.md` (code wins if this README drifts)

`LLM/GAME_IMPROVEMENT_RECOMMENDATIONS.md` is advisory unless explicitly promoted. If a canonical path is missing, duplicated, renamed, or conflicts with another source, stop and report it. Do not create parallel `*_UPDATED`, `*_FINAL`, `*_COMPACT`, or similar authority documents.

## Rule hierarchy

Resolve conflicts in this order: the human's latest explicit instruction; `01`; `02`; `04`; Art Pipeline; `BLENDER.md`; machine-readable owner for its declared fields; ArcheAge adaptation; Roadmap; current code; agent assumption. Report an existing code/spec conflict rather than treating code as precedent.

## Non-negotiable project rules

- Preserve the no-combat game: no weapons, hostile mobs, PvP, raids, classes, or combat substitutes. Tension comes from weather, timing, capacity, freshness, routes, preparation, and fishing skill.
- Simulation owns all canonical, serializable gameplay truth. Three.js objects, shaders, animation, DOM/UI state, and `userData` are presentation only.
- Gameplay RNG is seeded and deterministic; never use `Math.random()` in simulation. Use stable persistent IDs and migrate save-sensitive changes with fixtures/tests; never silently discard a save.
- Keep all inventory and logistics finite. Sport fish remain physical cargo, not stackable items. Offline progress never silently harvests, sells, fishes, repairs, or otherwise automates player actions without an explicitly unlocked system.
- Preserve the intended connected loop: farm to ingredients/wood/worms to processing to bait/chum/supplies to fishing to cargo/market to new capabilities. Major progression unlocks capabilities, locations, scale, automation, or strategy—not only percentage bonuses.
- Keep the world first and the HUD contextual, compact, accessible, and non-dashboard-like. UI may display results but never reproduce gameplay formulas or own mutations.
- Use one formula owner, clear types, explicit state machines, centralized tuning, atomic inventory/cargo transactions, and small domain modules. Do not introduce adjacent systems, giant god objects, or local presentation workarounds for simulation defects.

## Art and asset rules

- Preserve the premium cozy, warm tactile, faceted low-poly coastal identity: authored planar geometry, deliberate asymmetry, warm sun/cool fill, broad AO/contact grounding, teal polygonal water, functional coastal/farm details, and gameplay-camera readability.
- Avoid primitive-only/toy-like art, photoreal textures, noisy micro detail, plastic gloss, chibi/anime drift, generic fantasy kitbashing, diorama-only styling, heavy bloom/DOF, local exposure/tone-map hacks, and permanent toon/ink outlines.
- Production color/materials must use `PaletteTokens`/`PaletteMaterials` and the palette JSON. `VisualRenderConfig` is the only renderer baseline; zone/asset code cannot invent a second lighting or grading system.
- Runtime static assets are GLB/glTF 2.0 only. Use the single catalog, schema, registered generator workflow, CLI staging/validation/optimization/atomic publication, Meshopt-aware loader, and batching/instancing path. Do not create direct exporters, parallel palette/spec files, filename lists, or runtime `.blend`/`.fbx`/`.obj` paths.
- Do not mass-produce world art before P0.5 and P0.75 establish and pass the renderer/material foundation plus bridge-river, starter-farm, harbor, and coast/lighthouse gold slices.

## Required task discipline

1. Read the owning subsystem and all relevant canonical sources to the end. For Blender/art tasks, follow `LLM/BLENDER.md`'s mandatory read order.
2. Identify scope, state/formula owner, save impact (`yes`/`no`), migration need, affected callers, tests, visual/performance impact, and the smallest complete change before editing.
3. Implement without placeholders, fake integrations, hidden fallbacks, or unrelated cleanup.
4. Validate proportionately: typecheck, lint, focused unit/simulation/integration tests, build, relevant E2E, and save/load checks when applicable. Visual work also needs the prescribed generation/validation/determinism/benchmark gates and actual gameplay-camera review. Keep regression QA (approved game vs same game state) separate from style QA (graphics language vs reference images).
5. Never describe code as tested, browser-verified, visually approved, published, or production-ready unless that specific gate actually passed. State exact evidence and limitations.

## Phase and completion discipline

Follow the Roadmap sequence: `P0 → P0.5 → P0.75 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9 → P10 → P11 → P12 → P13 → P14 → P15 → P16`. Do not skip required gates or use P14 as the first real art pass.

Completion reports state: what/files changed, gameplay behavior, save compatibility, tests added/updated, every validation actually run, visual verification, performance notes, known limitations, and the next recommended task.
