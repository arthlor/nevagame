# Neva Project Guidelines & Agent Context Memory

> **CRITICAL MANDATORY INSTRUCTION FOR ALL AI AGENTS & CODING SESSIONS**
>
> Before planning, architecting, answering questions about implementation, or making any code/art change, **read the task-owning source-of-truth files until the end**. Repository-relative paths are authoritative; never depend on a developer's local absolute path. Routine asset work must use the scoped read route below rather than loading every canonical document.

## Canonical Source Files

The seven mandatory authorities live under `LLM/`:

1. [`LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md`](01_GAME_FOUNDATIONS_ARCHITECTURE.md) — primary technical authority: architecture, state ownership, determinism, persistence, input/modes, runtime stack, performance and cross-system invariants.
2. [`LLM/02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md`](02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md) — gameplay/balance/math authority: farming, crop lifecycle, fishing, cargo/boats, markets, Work Capacity, progression, contracts and vertical-slice rules.
3. [`LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md`](04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md) — visual authority: reference lock, geometry/facets, palette/materials, `PaletteMaterials`, lighting, canonical renderer baseline, water, vegetation, character direction, budgets and visual QA.
4. [`LLM/LLM_AGENT_ART_PIPELINE_INSTRUCTIONS.md`](LLM_AGENT_ART_PIPELINE_INSTRUCTIONS.md) — 3D/procedural/rendering production authority: Blender→GLB workflow, generator/spec rules, `VisualRenderConfig`, optimization and visual regression/style-match implementation.
5. [`LLM/ARCHEAGE_FARMING_SYSTEM.md`](ARCHEAGE_FARMING_SYSTEM.md) — farming inspiration/adaptation guide; subordinate to `01`/`02`/`04`/Art Pipeline.
6. [`LLM/03_PRODUCTION_ROADMAP_LLM_AGENT_PLAYBOOK.md`](03_PRODUCTION_ROADMAP_LLM_AGENT_PLAYBOOK.md) — execution/milestone authority including P0.5 visual foundation and P0.75 gold-standard art slice.
7. [`LLM/BLENDER.md`](BLENDER.md) — detailed operational authority for the implemented catalog-driven Blender toolchain, commands, validation, publishing, reports, Art Yard handoff, and runtime integration. Static previews are forbidden; `preview.py` is gone.

Code-adjacent machine authorities for the implemented art system:
- `assets/specs/asset-catalog.schema.json` defines the accepted catalog shape.
- `assets/specs/asset-catalog.json` owns generated asset identity, generator assignment, seed, dimensions, palette, min/target/max budgets, material cap, pivot, collision and collision primitives, instancing, LOD, nodes, read distance, generator parameters, optional reference-authoring contracts, and character rig/socket/animation contracts.
- `art/palettes/neva.palette.json` owns Blender/runtime palette tokens.
- `tools/blender/asset_budgets.json` owns Low/Medium/High scene envelopes and texture ceilings.
- `tools/blender/README.md` documents the current CLI and artifact semantics; code wins if that README drifts.
- `tools/art/codegen.mjs` derives the typed asset-ID/family projection at `src/render/assets/AssetCatalog.generated.ts`; the generated file is a build artifact, never a hand-edited authority. `npm run art:codegen:check` is the stale-generated-file gate.
- `tools/vite/runtimeAssetCatalogPlugin.ts` exposes only the browser-safe runtime catalog projection, while `tools/vite/artYardPlugin.ts`, `src/art-yard/`, and `tools/art-yard/viewer.html` provide the development-only `/__neva_art_yard` review surface.
- `generated/.cache/art/` is a disposable per-asset optimized-GLB cache keyed by content/toolchain input hash. It is never published or treated as source of truth; determinism runs bypass it.
- `tools/blender/common/authored.py` is an internal deterministic construction vocabulary for reusable masonry, shingles, planks, lattice/rope, arch, root-flare and fastener geometry. It is consumed by registered family generators; it is not a generator registry, asset source of truth, or alternate export path.

Routine existing-asset work reads `AGENTS.md`, `LLM/BLENDER.md`, `tools/blender/README.md`, the selected catalog entry, owning generator, runtime integration point, and only the directly relevant Art Bible section. New/shared generator, renderer/material, gameplay-contract, and release/gold-slice work adds the owning full canonical documents. Image/study-guided assets keep a required selected-entry `referenceAuthoring` brief; do not read or emit unrelated asset briefs.

If a canonical path is missing, renamed, duplicated, or points to conflicting copies, **stop and report the mismatch** rather than silently proceeding from memory or a stale file. Do not create `*_UPDATED`, `*_FINAL`, `*_COMPACT`, `(1)`, or other parallel authority names in the repository; update the canonical file instead.

---

## Agent Behavioral Rules

1. **Context First** — use the scoped task-class routing above, then read each selected owner to the end. Do not load the full catalog or every LLM spec for routine asset changes.
2. **Conflict Resolution** — priority is: human's latest explicit instruction → `01` technical authority → `02` gameplay/balance authority → `04` visual authority → Art Pipeline production authority → `BLENDER.md` operational authority → ArcheAge adaptation → Roadmap/execution → current task → existing code → agent assumption. Machine-readable catalog/schema/palette/budget files own their declared data fields. If code violates a spec, report the violation; do not treat it as precedent.
3. **No Hallucinated Systems** — build according to the documented data structures, formulas, invariants, progression and scope. Do not add adjacent systems for convenience.
4. **Simulation Owns Gameplay Truth** — Three.js meshes, shaders, animation state, DOM/UI and `userData` never become canonical gameplay state.
5. **Determinism & Saves** — no `Math.random()` in simulation; stable IDs; save-sensitive changes require migration/fixtures/tests as defined by `01`/`03`.
6. **Art & Shader Compliance** — production visuals must conform to `04` + Art Pipeline, the canonical `PaletteTokens`/`PaletteMaterials` vocabulary and the shared `VisualRenderConfig`. Avoid arbitrary production colors/materials, per-scene exposure/tone-map hacks, photoreal texture drift, and normal-world toon/ink outlines.
7. **Visual Identity Is Early Infrastructure** — do not postpone the real visual system until P14. P0.5 establishes rendering/materials; P0.75 proves the bridge/farm/harbor/coast gold-standard slices before broad asset/world production.
8. **Two Visual QA Modes** — pixel/perceptual metrics are for game-vs-approved-game regression under identical composition. Reference-image style matching reviews visual language while ignoring layout/camera/diorama/DOF/staging unless those are explicitly the task.
9. **Gameplay-Camera Approval** — never approve an asset/zone only from a flattering Blender/hero render. Validate at actual gameplay distances/cameras and representative conditions.
10. **Validation Before Success Claims** — routine assets use selected mechanical generation/publication and typecheck only when runtime TypeScript changes. Shared-generator and release work use the heavier gates in `LLM/BLENDER.md`. The human performs everyday visual approval in the actual game; agents must report `Awaiting human game review` instead of claiming visual approval.
11. **One Art Pipeline** — do not introduce parallel YAML specs, filename lists, palette lists, direct-to-public exporters, or one-off Blender entrypoints. Extend the catalog/schema contract, the owning family generator, shared `common/authored.py` construction helpers when reuse is real, the generator registry, and the `tools/blender/cli.mjs` workflow. Keep typed IDs/family maps generated through `tools/art/codegen.mjs`; do not hand-edit `AssetCatalog.generated.ts`. Use the validated per-asset cache only as an acceleration layer, and use `/__neva_art_yard` only for dev review; neither is an authority or a production runtime surface. Shared construction helpers are never registered as standalone catalog generators.
