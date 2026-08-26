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

---

## Project-Scoped Three.js Game Skills (Secondary Workflow Guidance)

This repository includes a selected, project-scoped copy of the Three.js game skills from [`majidmanzarpour/threejs-game-skills`](https://github.com/majidmanzarpour/threejs-game-skills), imported at commit `7221c1f4a6d2ae189a4d85d058d24f3228499d46` (MIT). They live under `.agents/skills/` and are workflow helpers, not additional Neva authorities. Load only the relevant `SKILL.md` and its required references for the current task; do not load the whole pack by default.

### Routing

| Task | Load | Neva-specific boundary |
| --- | --- | --- |
| Broad Three.js runtime work, first playable work, major polish, or an explicit release investigation | `.agents/skills/threejs-game-director/SKILL.md` | Use its phase routing and ledgers, but read the owning Neva authorities first. “Premium” evidence does not replace Neva's gold-slice gates or human game review. |
| Gameplay architecture, mechanics, input, camera, physics, objectives, or game feel | `.agents/skills/threejs-gameplay-systems/SKILL.md` | `01`, `02`, and the Roadmap own state, formulas, progression, and sequencing. Neva remains single-player and non-combat; ignore the skill's combat/weapon examples. |
| Rendering, materials, shaders, VFX, lighting, world density, LOD, or visual performance | `.agents/skills/threejs-aaa-graphics-builder/SKILL.md` | `04`, `LLM_AGENT_ART_PIPELINE_INSTRUCTIONS.md`, `BLENDER.md`, `VisualRenderConfig`, `PaletteMaterials`, and the catalog own the visual and asset contract. Do not create a second renderer or art pipeline. |
| HUD, menus, overlays, responsive layout, or touch/UI review | `.agents/skills/threejs-game-ui-designer/SKILL.md` | DOM/React owns overlays; Three.js owns the world. Keep the world-first, contextual, compact, accessible Neva HUD and do not introduce a dashboard-style interface. |
| Blank canvas, loader/runtime failure, resize/input issue, animation issue, or measured performance investigation | `.agents/skills/threejs-debug-profiler/SKILL.md` | Reproduce and measure in the owning Neva subsystem. Preserve simulation authority, fixed-step physics, shared materials/config, and the browser budgets. |
| Browser QA, visual regression, bot playtest, production build, or release preparation | `.agents/skills/threejs-qa-release/SKILL.md` | Apply the proportional gate in `01`, the Roadmap, and `BLENDER.md`. Routine selected-asset work does not require agent screenshots, static previews, or agent-led style scoring. |
| Explicit external 3D, image, or audio generation | `.agents/skills/threejs-3d-generator/SKILL.md`, `.agents/skills/threejs-image-generator/SKILL.md`, and/or `.agents/skills/threejs-audio-generator/SKILL.md` | These use optional Tripo, Gemini, and ElevenLabs providers. They never authorize a provider call, purchase, upload, or credential use by themselves. Any approved output must still follow Neva's catalog/referenceAuthoring/registered-generator/GLB pipeline; never publish a direct provider export or put API keys in the repository. |

### Precedence and integration rules

1. Read the root `AGENTS.md` and the task-owning Neva source-of-truth files before applying an external skill. The Neva authority order above always wins if the external pack disagrees.
2. Keep Neva's existing runtime direction: TypeScript + Vite + vanilla Three.js/WebGL2 for the core 3D world, DOM/React only for 2D overlays, and Rapier where gameplay collision response matters. Do not copy the external scaffold into this project or introduce React Three Fiber ownership of the core world.
3. Keep canonical gameplay state in deterministic, serializable simulation data. Three.js objects, materials, animation, `userData`, DOM state, and skill-pack test hooks remain presentation/diagnostic concerns and must not become gameplay truth.
4. Keep the no-combat boundary absolute. Examples mentioning weapons, enemies, shooting, bosses, combat VFX, or combat progression are not applicable to Neva; use weather, timing, capacity, freshness, routes, preparation, and fishing skill for tension.
5. Keep static 3D production on the single Neva path: catalog/schema + palette → registered deterministic Blender family generator → staged GLB → validation/optimization → atomic publication → canonical runtime loader/Art Yard → actual-game review. The external pack's procedural, generated, or direct-GLB techniques may inform a task only after they are translated into this contract.
6. Do not apply the external pack's premium asset-sourcing requirement automatically. For routine Neva assets, follow the lean `BLENDER.md` gate and finish with `Awaiting human game review`. Use the external provider skills only for an explicitly authorized generation task or when the user requests that workflow; report credentials, outputs, licensing/plan assumptions, and blockers without exposing secrets.
7. Treat the pack's browser screenshots, scorecards, bot playtests, and release checks as additional tools for explicitly in-scope QA/release work. They do not turn a static preview into gameplay proof, replace the Art Yard/game review boundary, or override the Roadmap's open gates.
8. Do not add dependencies, framework paradigms, external services, or new persistent state merely because a skill mentions them. Apply Neva's dependency, save/migration, performance, and scope rules first, and report any source conflict instead of silently adapting around it.
