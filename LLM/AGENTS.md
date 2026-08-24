# Neva Project Guidelines & Agent Context Memory

> **CRITICAL MANDATORY INSTRUCTION FOR ALL AI AGENTS & CODING SESSIONS**
>
> Before planning, architecting, answering questions about implementation, or making any code/art change, **read the relevant source-of-truth files until the end**. Repository-relative paths are authoritative; never depend on a developer's local absolute path.

## Canonical Source Files

The seven mandatory authorities live under `LLM/`:

1. [`LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md`](01_GAME_FOUNDATIONS_ARCHITECTURE.md) — primary technical authority: architecture, state ownership, determinism, persistence, input/modes, runtime stack, performance and cross-system invariants.
2. [`LLM/02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md`](02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md) — gameplay/balance/math authority: farming, crop lifecycle, fishing, cargo/boats, markets, Work Capacity, progression, contracts and vertical-slice rules.
3. [`LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md`](04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md) — visual authority: reference lock, geometry/facets, palette/materials, `PaletteMaterials`, lighting, canonical renderer baseline, water, vegetation, character direction, budgets and visual QA.
4. [`LLM/LLM_AGENT_ART_PIPELINE_INSTRUCTIONS.md`](LLM_AGENT_ART_PIPELINE_INSTRUCTIONS.md) — 3D/procedural/rendering production authority: Blender→GLB workflow, generator/spec rules, `VisualRenderConfig`, optimization and visual regression/style-match implementation.
5. [`LLM/ARCHEAGE_FARMING_SYSTEM.md`](ARCHEAGE_FARMING_SYSTEM.md) — farming inspiration/adaptation guide; subordinate to `01`/`02`/`04`/Art Pipeline.
6. [`LLM/03_PRODUCTION_ROADMAP_LLM_AGENT_PLAYBOOK.md`](03_PRODUCTION_ROADMAP_LLM_AGENT_PLAYBOOK.md) — execution/milestone authority including P0.5 visual foundation and P0.75 gold-standard art slice.
7. [`LLM/BLENDER.md`](BLENDER.md) — detailed operational authority for the implemented catalog-driven Blender toolchain, commands, validation, publishing, reports, previews and runtime handoff.

Code-adjacent machine authorities for the implemented art system:
- `assets/specs/asset-catalog.schema.json` defines the accepted catalog shape.
- `assets/specs/asset-catalog.json` owns generated asset identity, generator assignment, seed, dimensions, palette, min/target/max budgets, material cap, pivot, collision, instancing, LOD, nodes, read distance and parameters.
- `art/palettes/neva.palette.json` owns Blender/runtime palette tokens.
- `tools/blender/asset_budgets.json` owns Low/Medium/High scene envelopes and texture ceilings.
- `tools/blender/README.md` documents the current CLI and artifact semantics; code wins if that README drifts.
- `tools/blender/common/authored.py` is an internal deterministic construction vocabulary for reusable masonry, shingles, planks, lattice/rope, arch, root-flare and fastener geometry. It is consumed by registered family generators; it is not a generator registry, asset source of truth, or alternate export path.

Advisory, not canonical until explicitly promoted:
- [`LLM/GAME_IMPROVEMENT_RECOMMENDATIONS.md`](GAME_IMPROVEMENT_RECOMMENDATIONS.md)

If a canonical path is missing, renamed, duplicated, or points to conflicting copies, **stop and report the mismatch** rather than silently proceeding from memory or a stale file. Do not create `*_UPDATED`, `*_FINAL`, `*_COMPACT`, `(1)`, or other parallel authority names in the repository; update the canonical file instead.

---

## Agent Behavioral Rules

1. **Context First** — inspect the owning subsystem plus all relevant canonical LLM specs before planning or editing. Read them to the end, not only headings/snippets.
2. **Conflict Resolution** — priority is: human's latest explicit instruction → `01` technical authority → `02` gameplay/balance authority → `04` visual authority → Art Pipeline production authority → `BLENDER.md` operational authority → ArcheAge adaptation → Roadmap/execution → current task → existing code → agent assumption. Machine-readable catalog/schema/palette/budget files own their declared data fields. If code violates a spec, report the violation; do not treat it as precedent.
3. **No Hallucinated Systems** — build according to the documented data structures, formulas, invariants, progression and scope. Do not add adjacent systems for convenience.
4. **Simulation Owns Gameplay Truth** — Three.js meshes, shaders, animation state, DOM/UI and `userData` never become canonical gameplay state.
5. **Determinism & Saves** — no `Math.random()` in simulation; stable IDs; save-sensitive changes require migration/fixtures/tests as defined by `01`/`03`.
6. **Art & Shader Compliance** — production visuals must conform to `04` + Art Pipeline, the canonical `PaletteTokens`/`PaletteMaterials` vocabulary and the shared `VisualRenderConfig`. Avoid arbitrary production colors/materials, per-scene exposure/tone-map hacks, photoreal texture drift, and normal-world toon/ink outlines.
7. **Visual Identity Is Early Infrastructure** — do not postpone the real visual system until P14. P0.5 establishes rendering/materials; P0.75 proves the bridge/farm/harbor/coast gold-standard slices before broad asset/world production.
8. **Two Visual QA Modes** — pixel/perceptual metrics are for game-vs-approved-game regression under identical composition. Reference-image style matching reviews visual language while ignoring layout/camera/diorama/DOF/staging unless those are explicitly the task.
9. **Gameplay-Camera Approval** — never approve an asset/zone only from a flattering Blender/hero render. Validate at actual gameplay distances/cameras and representative conditions.
10. **Validation Before Success Claims** — run the required typecheck/lint/tests/build/E2E/save checks and, for visual changes, benchmark screenshots/style gates. Report actual results and known limitations.
11. **One Art Pipeline** — do not introduce parallel YAML specs, filename lists, palette lists, direct-to-public exporters, or one-off Blender entrypoints. Extend the catalog/schema contract, the owning family generator, shared `common/authored.py` construction helpers when reuse is real, the generator registry, and the `tools/blender/cli.mjs` workflow. Shared construction helpers are never registered as standalone catalog generators.
