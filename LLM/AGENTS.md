# Neva — Pointer to the Root Routing Authority

> **This file holds no independent rules.** The repository-root
> [`AGENTS.md`](../AGENTS.md) is the single routing authority: canonical
> authorities, token-conscious source routing, the generate-asset prompt
> contract, the rule hierarchy, the non-negotiable project rules, the
> documentation-update contract, and completion discipline all live there.
>
> Read `../AGENTS.md` first. If this file and the root file ever disagree, the
> root file wins and the disagreement is a bug — report it.
>
> This pointer exists because prompts frequently attach the `LLM/` folder
> (`@LLM`). A folder dump is not authority; it does not change task-class
> routing.

## Why there is no duplicate rule set here

An earlier revision of this file restated the root rules with its own canonical
list, behavioural rules, and an embedded implementation snapshot (schema
version, layout revision, asset count). Those copies drifted from both the root
file and the code. Per the root file's own "one owner per fact" rule, the
duplicate was removed rather than re-synchronised.

Do not reintroduce a second routing document, a second canonical-authority
list, or a hardcoded implementation snapshot here. Current values live in their
owners:

| Fact | Owner |
|---|---|
| Schema version, layout revision, migration history | `LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md` §6 / §6.1 |
| Live content counts (crops, fish, recipes, rods, boats, quests) | `src/content/` |
| Asset counts, target status, published manifest | `assets/specs/asset-catalog.json` and `generated/reports/asset_budget_report.json` |
| Live renderer numbers | `src/render/config/VisualRenderConfig.ts` |
| Gate status and evidence | `LLM/IMPLEMENTATION_STATUS_CHECKLIST.md` |

---

## Project-Scoped Three.js Game Skills (secondary workflow guidance)

This repository includes a selected, project-scoped copy of the Three.js game
skills from [`majidmanzarpour/threejs-game-skills`](https://github.com/majidmanzarpour/threejs-game-skills),
imported at commit `7221c1f4a6d2ae189a4d85d058d24f3228499d46` (MIT). They live
under `.agents/skills/` and are **workflow helpers, not Neva authorities**. Load
only the relevant `SKILL.md` and its required references for the current task;
do not load the whole pack by default.

### Routing

| Task | Load | Neva-specific boundary |
| --- | --- | --- |
| `@LLM @tools generate assets of …` or any catalog/Blender asset generation | Do **not** start with `threejs-game-director`. After the Neva catalog + isolated sheet + owning generator, optionally load `.agents/skills/threejs-aaa-graphics-builder/references/checklists/procedural-model-quality.md` (and `model-recipes.md` when appearance is being designed) as critique vocabulary | Prefer the repo copy `.agents/skills/` over `~/.codex/skills`. Translate critique into the registered Blender family generator and `authored.py`. Provider skills never publish a direct GLB. `threejs-qa-release` is release/gold-slice only. |
| Broad Three.js runtime work, first playable work, major polish, or an explicit release investigation | `.agents/skills/threejs-game-director/SKILL.md` | Use its phase routing and ledgers, but read the owning Neva authorities first. “Premium” evidence does not replace Neva's gold-slice gates or human game review. Director is not the generate-asset entrypoint. |
| Gameplay architecture, mechanics, input, camera, physics, objectives, or game feel | `.agents/skills/threejs-gameplay-systems/SKILL.md` | `01`, `02`, and the Roadmap own state, formulas, progression, and sequencing. Neva remains single-player and non-combat; ignore the skill's combat/weapon examples. |
| Rendering, materials, shaders, terrain/roads/ground cover, VFX, lighting, world density, LOD, or visual performance | `.agents/skills/threejs-aaa-graphics-builder/SKILL.md` | `01`, `04`, `LLM_AGENT_ART_PIPELINE_INSTRUCTIONS.md` (including section 6.2 for supporting maps), `BLENDER.md`, authored world-layout semantics, `VisualRenderConfig`, `ExternalSurfaceTextures`, `PaletteMaterials`, and the catalog own the visual and asset contract. Do not create a second renderer, route network, ground mask authority, or art pipeline. |
| HUD, menus, overlays, responsive layout, or touch/UI review | `.agents/skills/threejs-game-ui-designer/SKILL.md` | DOM/React owns overlays; Three.js owns the world. Keep the world-first, contextual, compact, accessible Neva HUD and do not introduce a dashboard-style interface. |
| Blank canvas, loader/runtime failure, resize/input issue, animation issue, or measured performance investigation | `.agents/skills/threejs-debug-profiler/SKILL.md` | Reproduce and measure in the owning Neva subsystem. Preserve simulation authority, fixed-step physics, shared materials/config, and the browser budgets. |
| Browser QA, visual regression, bot playtest, production build, or release preparation | `.agents/skills/threejs-qa-release/SKILL.md` | Apply the proportional gate in `01`, the Roadmap, and `BLENDER.md`. Routine selected-asset work does not require agent screenshots, static previews, or agent-led style scoring. |
| Explicit external 3D, image, or audio generation | `.agents/skills/threejs-3d-generator/SKILL.md`, `.agents/skills/threejs-image-generator/SKILL.md`, and/or `.agents/skills/threejs-audio-generator/SKILL.md` | These use optional Tripo, Gemini, and ElevenLabs providers. They never authorize a provider call, purchase, upload, or credential use by themselves. Any approved output must still follow Neva's catalog/referenceAuthoring/registered-generator/GLB pipeline; never publish a direct provider export or put API keys in the repository. Generated audio must additionally satisfy `LLM/06_AUDIO_AND_MUSIC_DESIGN_MASTER.md` §5 asset standards and be registered in the audio manifest. |

### Precedence and integration rules

1. Read the root `AGENTS.md` and the task-owning Neva source-of-truth files before applying an external skill. Prefer the repo copy `.agents/skills/<name>/SKILL.md` over `~/.codex/skills` when they differ. The Neva authority order always wins if the external pack disagrees.
2. Keep Neva's existing runtime direction: TypeScript + Vite + vanilla Three.js/WebGL2 for the core 3D world, DOM/React only for 2D overlays, and Rapier where gameplay collision response matters. Do not copy the external scaffold into this project or introduce React Three Fiber ownership of the core world.
3. Keep canonical gameplay state in deterministic, serializable simulation data. Three.js objects, materials, animation, `userData`, DOM state, and skill-pack test hooks remain presentation/diagnostic concerns and must not become gameplay truth.
4. Keep the no-combat boundary absolute. Examples mentioning weapons, enemies, shooting, bosses, combat VFX, or combat progression are not applicable to Neva; use weather, timing, capacity, freshness, routes, preparation, and fishing skill for tension.
5. Keep static 3D production on the single Neva path: catalog/schema + palette → registered deterministic Blender family generator → staged GLB → validation/optimization → atomic publication → canonical runtime loader/Art Yard → actual-game review. The external pack's procedural, generated, or direct-GLB techniques may inform a task only after they are translated into this contract.
6. Do not apply the external pack's premium asset-sourcing requirement automatically. For routine Neva assets, follow the lean `BLENDER.md` gate and finish with `Awaiting human game review`. Use the external provider skills only for an explicitly authorized generation task or when the user requests that workflow; report credentials, outputs, licensing/plan assumptions, and blockers without exposing secrets.
7. Treat the pack's browser screenshots, scorecards, bot playtests, and release checks as additional tools for explicitly in-scope QA/release work. They do not turn a static preview into gameplay proof, replace the Art Yard/game review boundary, or override the Roadmap's open gates.
8. Do not add dependencies, framework paradigms, external services, or new persistent state merely because a skill mentions them. Apply Neva's dependency, save/migration, performance, and scope rules first, and report any source conflict instead of silently adapting around it.
9. A skill-driven change updates its owning canonical document in the same change, exactly as the root `AGENTS.md` documentation contract requires.
