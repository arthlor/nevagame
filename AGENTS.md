# Neva Project Rules for Every Codex Session

> **Mandatory:** These rules apply to every prompt and task opened anywhere in this Neva workspace. Before planning, answering implementation questions, changing code or art, or claiming a result, read the task-owning authoritative repository files **to the end**. Repository-relative paths are authoritative; never rely on an old memory or a developer-specific absolute path when the source exists. “Relevant” is deliberately scoped: do not load every canonical document for a routine asset edit.

## Canonical authorities

1. `LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md` — primary technical authority: architecture, state ownership, determinism, persistence, input/modes, runtime stack, performance and cross-system invariants.
2. `LLM/02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md` — gameplay/balance/math authority: farming, crop lifecycle, fishing, cargo/boats, markets, Work Capacity, progression, contracts and vertical-slice rules.
3. `LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md` — visual authority: reference lock, geometry/facets, palette/materials, lighting, renderer baseline, water, vegetation, budgets and visual QA.
4. `LLM/LLM_AGENT_ART_PIPELINE_INSTRUCTIONS.md` — 3D/procedural/rendering production authority: Blender-to-GLB workflow, generator/spec rules, `VisualRenderConfig`, optimization and visual regression/style-match implementation.
5. `LLM/ARCHEAGE_FARMING_SYSTEM.md` — farming inspiration/adaptation only; subordinate to the preceding authorities.
6. `LLM/03_PRODUCTION_ROADMAP_LLM_AGENT_PLAYBOOK.md` — execution, milestones, validation, and completion-report authority.
7. `LLM/BLENDER.md` — operational authority for catalog-driven Blender production, validation, publishing, reports, Art Yard handoff, and runtime integration.

Machine-readable authorities for the fields they own:

- `assets/specs/asset-catalog.schema.json` and `assets/specs/asset-catalog.json`
- `art/palettes/neva.palette.json`
- `tools/blender/asset_budgets.json`
- `tools/blender/README.md` (code wins if this README drifts)
- `src/render/config/VisualRenderConfig.ts` (live renderer and supporting-map numbers)
- `src/render/materials/ExternalSurfaceTextures.ts` (supporting-map provenance and URLs)

If a canonical path is missing, duplicated, renamed, or conflicts with another source, stop and report it. Do not create parallel `*_UPDATED`, `*_FINAL`, `*_COMPACT`, or similar authority documents. Do not list deleted files as authorities.

### Token-conscious source routing

- Routine existing-asset work reads this file, `LLM/BLENDER.md`, `tools/blender/README.md`, the selected catalog entry, its owning generator, and the runtime integration point only. Read the directly relevant Art Bible section when appearance is being changed. Do not read the full catalog or `01`/`02`/`03`/`04`/Art Pipeline by default.
- New generator families, shared construction helpers, renderer/material changes, or gameplay-contract changes read their owning canonical document(s) in full in addition to the routine set. Ground supporting-map work is renderer/material work: also read Art Pipeline section 6.2, `VisualRenderConfig.ts`, and `ExternalSurfaceTextures.ts`.
- Release/gold-slice work reads the full canonical art/architecture set because it activates the P0.75 visual-gold benchmark and the separate strict, determinism, and cross-scene technical/release gates.
- `referenceAuthoring` remains required for image/study-guided assets. Read and validate only the selected asset brief; rerun `art:brief` only when that brief changes.
- In-game layout / Place / F2 editor work reads `LLM/LAYOUT_EDITOR.md`, `src/layout-editor/`, `src/app/PlacementEditor.ts`, and `tools/layout-editor/patchPlacement.ts`. Do not import `src/world` into the Vite patcher. Leave `02` unread unless a drop changes a saved structure contract.

## Generate-asset prompt contract

Folder dumps (`@LLM`, `@tools`) do not change task-class routing. Attachment is not equal authority. First files to **obey**: this file, `LLM/BLENDER.md`, `tools/blender/README.md`, the selected catalog entry, the owning generator, the isolated sheet if present, the relevant Art Bible section. Other attached files are for conflict resolution only. Leave `02` and ArcheAge unread for this prompt class.

“Generate assets” always means: resolve or add catalog ID(s) → registered family generator (not polyfork for isolated-sheet or unique-silhouette assets) → measure isolated-sheet identity into `parameters` when a sheet exists → `npm run art:brief -- --asset` only if that brief changed → `npm run art:generate -- --asset` → integrate → Art Yard link → `Awaiting human game review`. Do not run `tools/art/import_polyfork.mjs`, `tools/art/register_polyfork_catalog.mjs`, or `tools/blender/generators/generate_all.py`. Do not start `threejs-game-director` for this prompt. Provider APIs still need an explicit human request. If the named subject is missing from the catalog, add one catalog entry and extend the owning family generator; do not publish a one-off GLB. Ground supporting maps are not generate-asset work: do not add catalog IDs for them or run `art:generate`.

Isolated studio sheets under `tools/blender/references/isolated/` are style-match evidence for the mapped catalog ID. Numbered crop/diorama PNGs in the references README are graphics-only extracts from `art-reference.png`; catalog IDs win if that README drifts.

## Codex and threejs-game-skills

Prefer the repo copy `.agents/skills/<name>/SKILL.md` over `~/.codex/skills`. Neva authorities still win. Do not fork imported `SKILL.md` files; wrap them in this routing. Do not copy the pack’s Vite scaffold, combat examples, daily screenshot scorecards, or test hooks into Neva.

After the catalog, isolated sheet, and owning generator, Codex may load `.agents/skills/threejs-aaa-graphics-builder/references/checklists/procedural-model-quality.md` (and `model-recipes.md` when appearance is being designed) as critique vocabulary, then implement in the Blender family generator and `authored.py`. `threejs-image-generator` and `threejs-3d-generator` need an explicit human request; never publish a downloaded GLB. `threejs-qa-release` is release/gold-slice only.

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
- Runtime static 3D assets are GLB/glTF 2.0 only. Use the single catalog, schema, registered generator workflow, CLI staging/validation/optimization/atomic publication, Meshopt-aware loader, and batching/instancing path. Do not create direct exporters, parallel palette/spec files, filename lists, or runtime `.blend`/`.fbx`/`.obj` paths. Ground supporting maps are the documented non-GLB exception: local processed images under `public/assets/textures/terrain/`, owned by `ExternalSurfaceTextures` plus `VisualRenderConfig`, remapped into palette families. They are not catalog IDs and must not be produced with `art:generate`.
- Do not mass-produce world art before P0.5 and P0.75 establish and pass the renderer/material foundation plus the bridge-river, starter-farm, harbor, and coast/lighthouse visual-gold slices. Technical-art certification remains a separate release gate.

## Required task discipline

1. Read the owning subsystem and the scoped sources routed above to the end. For Blender/art tasks, follow `LLM/BLENDER.md`'s task-class read order.
2. Identify scope, state/formula owner, save impact (`yes`/`no`), migration need, affected callers, tests, visual/performance impact, and the smallest complete change before editing.
3. Implement without placeholders, fake integrations, hidden fallbacks, or unrelated cleanup.
4. Validate proportionately. Routine asset work uses selected generation/publication plus typecheck only when runtime TypeScript changes. Shared-generator and release work use the heavier gates defined in `LLM/BLENDER.md`. Static previews, screenshots, benchmarks, broad suites, and agent-led visual scoring are not daily asset gates. The human reviews integrated visuals in the actual game.
5. Never describe code as tested, browser-verified, visually approved, published, or production-ready unless that specific gate actually passed. State exact evidence and limitations.

## Phase and completion discipline

Follow the Roadmap sequence: `P0 → P0.5 → P0.75 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9 → P10 → P11 → P12 → P13 → P14 → P15 → P16`. Do not skip required gates or use P14 as the first real art pass.

Routine asset completion reports state only the asset IDs, runtime integration point, mechanical generation status, save impact, and `Awaiting human game review`. Expanded reports are reserved for shared-generator, release, migration, or other high-risk work.
