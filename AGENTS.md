# Neva Project Rules for Every Agent Session

> **Mandatory:** Before planning, answering implementation questions, editing, or claiming a result, use the task route below and read each routed document or section **to its end**, plus the owning implementation and affected callers. Full-document reads are required where the table says so. Repository-relative sources take precedence over old memory or developer-specific paths.
>
> **This repository-root file is the single routing authority.** `LLM/AGENTS.md` is a pointer to this file and holds no independent rules. Do not add a second routing document.

## Canonical authorities

1. `LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md` — primary technical authority: architecture, state ownership, determinism, persistence, input/modes, runtime stack, performance and cross-system invariants. §6.1 is the **single migration ledger**.
2. `LLM/02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md` — gameplay/balance/math authority: farming, crop lifecycle, fishing, cargo/boats, markets, mounts, Work Capacity, progression, contracts, the authored quest/lore spine, and vertical-slice rules.
3. `LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md` — visual authority: reference lock, geometry/facets, palette/materials, lighting, renderer baseline, water, vegetation, budgets and visual QA.
4. `LLM/LLM_AGENT_ART_PIPELINE_INSTRUCTIONS.md` — 3D/procedural/rendering production authority: Blender-to-GLB workflow, generator/spec rules, `VisualRenderConfig`, optimization and visual regression/style-match implementation.
5. `LLM/06_AUDIO_AND_MUSIC_DESIGN_MASTER.md` — audio authority: bus graph, mixing/calibration, cue inventory, adaptive music, and audio asset standards. **Design-stage:** its cue inventory describes *specified targets*, not shipped coverage. `src/audio/` and the audio manifest own what actually plays; `01` §14 owns the domain-event contract that audio consumes.
6. `LLM/ARCHEAGE_FARMING_SYSTEM.md` — farming inspiration/adaptation only; subordinate to the preceding authorities.
7. `LLM/03_PRODUCTION_ROADMAP_LLM_AGENT_PLAYBOOK.md` — execution, milestones, validation, and completion-report authority.
8. `LLM/BLENDER.md` — operational authority for catalog-driven Blender production, validation, publishing, reports, Art Yard handoff, and runtime integration.
9. `LLM/LAYOUT_EDITOR.md` — operational authority for the DEV-only in-game layout / Place / F2 editor.

`LLM/IMPLEMENTATION_STATUS_CHECKLIST.md` is a status snapshot, not an authority. There is no `05_` document.

### Guidance claims that are enforced

Prose is not a build gate, so the claims below are executed rather than trusted. Prefer adding a check to restating a fact.

| Claim | Enforced by |
|---|---|
| Content counts in `AGENTS.md`, `01`, `02` and the status checklist agree with `ContentRegistry`, and any rank threshold written beside a rank name matches `PROFICIENCY_RANKS` | `tests/unit/docContentCounts.test.ts` |
| A `ts` block in `01`/`02` names only fields the runtime type still declares (a doc may abridge a shape, not misdescribe it) | `tests/unit/docTypeShapes.test.ts` |
| The crop-growth, cargo-freshness, market-demand and soil-fertility tables in `02` match the constants that own them | `tests/unit/docTuningValues.test.ts` |
| `01` §6.1's ledger ends at the shipping schema and layout revision with no gaps, and §4 names only real npm scripts | `tests/unit/docArchitectureClaims.test.ts` |
| Work Capacity is debited/credited only in `ProgressionDomain`; every cost reaches a quote or spend as a named constant; traversal, cargo, market, quest and contract charge no Work | `tests/simulation/workCapacityContract.test.ts` |
| Rank rows advertise only gates the content actually owns | `ContentRegistry.validateProgressionAndEquipment` |
| Every `feature.*` id a rank lists has a consumer in `src/` | `tests/simulation/rankUnlocks.test.ts` |
| Quest targets, locations and chains resolve | `tools/content/validate.ts` (`npm run content:validate`) |

A number a validator can derive does not belong in prose. `02` §14 is the worked example: it states the Work Capacity invariants and names their test, and holds no cost values at all.

Implementation and generated owners for the fields they declare:

- `assets/specs/asset-catalog.schema.json` and `assets/specs/asset-catalog.json`
- `art/palettes/neva.palette.json`
- `tools/blender/asset_budgets.json`
- `src/content/` and `ContentRegistry` (content IDs, membership, counts and validation)
- `src/simulation/` (implemented state and formula definitions)
- `src/persistence/` (implemented save schema, migrations and recovery)
- `src/render/config/VisualRenderConfig.ts` (live renderer and supporting-map numbers)
- `src/render/materials/ExternalSurfaceTextures.ts` (supporting-map provenance and URLs)

`tools/blender/README.md` documents CLI operation; `tools/blender/cli.mjs` owns what the commands actually do. These implementation owners establish observed behavior, not permission to override a design invariant. Apply the conflict procedure below when they disagree with a normative rule.

Do not create parallel `*_UPDATED`, `*_FINAL`, `*_COMPACT`, or similar authorities. Do not list deleted files as authorities.

### Task routing

Always read this file first. Combine rows when a task crosses their boundaries; an attachment or folder dump does not broaden the task. `03` §4 owns the verification matrix.

| Task | Read before changing the affected contract |
|---|---|
| Documentation or copy | The owning section and its linked source; for structural guidance refactors, all documents whose routing or authority changes. No runtime gates for prose alone. |
| UI presentation or input | `04` §17; `01` §9/§13 and the affected UI/DTO/action callers. Read the owning `02` section if a gameplay rule is involved. |
| Gameplay or balance | Full `02`; relevant `01` ownership/input/persistence sections; the domain, tuning/content owner and callers. Full `01` for state-shape or cross-system contract changes. |
| Persistence, architecture or cross-system state | Full `01`, the owning `02` sections, `03` §25, migration chain and retained fixtures. |
| Existing asset or new asset in an existing family | Full `BLENDER.md` and `tools/blender/README.md`, selected catalog entry, generator and runtime integration point. Read the isolated sheet and relevant `04` section when appearance changes. |
| New generator family or shared art helpers | The asset route plus full Art Pipeline and the owning visual sections of `04`; affected family consumers. |
| Renderer, material or supporting maps | Full `01`, `04` and Art Pipeline; `VisualRenderConfig` and affected render callers. Supporting maps also require `ExternalSurfaceTextures` and Art Pipeline §6.2. |
| Audio | Full `06`, `01` §14, runtime audio/manifest owners and triggering callers. Add the gameplay route only if gameplay state or events change. |
| Layout / Place / F2 editor | Full `LAYOUT_EDITOR.md`, `src/layout-editor/`, `src/app/PlacementEditor.ts`, `tools/layout-editor/patchPlacement.ts`. Do not import `src/world` into the Vite patcher. Add persistence/gameplay routing if saved topology or structure contracts change. |
| Milestone or gameplay sequencing | Full `03`, relevant design owners and the evidence index in `IMPLEMENTATION_STATUS_CHECKLIST.md`. |
| Release or visual-gold slice | Full `01`, `02`, `03`, `04`, Art Pipeline and `BLENDER.md`; relevant audio/layout sources if included. Keep human visual, strict/determinism and production performance gates separate. |

`referenceAuthoring` remains required for image/study-guided assets. Read only the selected brief; rerun `art:brief` when that brief changes. Routine asset work does not load `01`, `02`, `03`, full `04`, full Art Pipeline or ArcheAge by default.

## Generate-asset prompt contract

Folder dumps (`@LLM`, `@tools`) do not change task-class routing. Attachment is not equal authority. First files to **obey**: this file, `LLM/BLENDER.md`, `tools/blender/README.md`, the selected catalog entry, the owning generator, the isolated sheet if present, the relevant Art Bible section. Other attached files are for conflict resolution only. Leave `02` and ArcheAge unread for this prompt class.

“Generate assets” always means: resolve or add catalog ID(s) → registered family generator → measure isolated-sheet identity into `parameters` when a sheet exists → `npm run art:brief -- --asset` only if that brief changed → `npm run art:generate -- --asset` → integrate → Art Yard link → `Awaiting human game review`. Do not run `tools/blender/generators/generate_all.py`. Do not start `threejs-game-director` for this prompt. Provider APIs still need an explicit human request. If the named subject is missing from the catalog, add one catalog entry and extend the owning family generator; do not publish a one-off GLB. Ground supporting maps are not generate-asset work: do not add catalog IDs for them or run `art:generate`.

Isolated studio sheets under `tools/blender/references/isolated/` are style-match evidence for the mapped catalog ID. Numbered crop/diorama PNGs in the references README are graphics-only extracts from `art-reference.png`; catalog IDs win if that README drifts.

## Codex and threejs-game-skills

Prefer the repo copy `.agents/skills/<name>/SKILL.md` over `~/.codex/skills`. Neva authorities still win. Do not fork imported `SKILL.md` files; wrap them in this routing. Do not copy the pack’s Vite scaffold, combat examples, daily screenshot scorecards, or test hooks into Neva.

If a skill would block authorized work, apply the rule hierarchy first. If the blocker remains, link the exact `SKILL.md`, quote the instruction and explain the affected decision. Do not infer a permission gate from optional guidance.

After the catalog, isolated sheet, and owning generator, Codex may load `.agents/skills/threejs-aaa-graphics-builder/references/checklists/procedural-model-quality.md` (and `model-recipes.md` when appearance is being designed) as critique vocabulary, then implement in the Blender family generator and `authored.py`. `threejs-image-generator` and `threejs-3d-generator` need an explicit human request; never publish a downloaded GLB. `threejs-qa-release` is release/gold-slice only.

## Rule hierarchy

1. The human's latest explicit instruction sets the task and can change its design scope. Preserve existing authorization; do not ask again for a step already authorized.
2. For design decisions, use the owning authority: `01` for architecture/state/persistence, `02` for gameplay, `04` for appearance, Art Pipeline for rendering/asset implementation, `BLENDER.md` for production operations, `06` for audio design, `LAYOUT_EDITOR.md` for the DEV editor, and `03` for execution/gates. Cross-domain conflicts resolve in that order; audio/editor rules remain subordinate to `01`/`02` on gameplay truth. ArcheAge is inspiration only.
3. Read exact content membership, configuration values, schemas and artifact disposition from their declared code/data/generated owner. Prose explains intent and constraints and links to these values. An illustrative example is not a second implementation contract.
4. Current code proves what is implemented; current test/runtime evidence proves only the behavior exercised. Neither silently changes approved design. A status log, previous pass or agent assumption cannot overrule an owner.

If an owner is missing, ambiguous or contradictory, name the sources and the affected decision. Pause that decision while resolving it from the hierarchy or the user; continue independent work. Repair an unambiguous stale reference within scope. Do not invent a replacement authority or turn an implementation bug into a design rule.

## Memory and evidence hygiene

Memory is a retrieval aid, not another project authority. Use it to find relevant
owners, prior decisions and useful reproductions; verify the parts on which the
current task depends. In particular:

- The task table above supersedes historical blanket instructions to read all four briefs for every implementation. Read the routed sources completely; expand when an affected contract crosses into another route.
- Treat remembered errors, line numbers, ports, schema versions, budgets, asset counts, visual concepts and gate results as historical until checked against their current owner. An old blocker is a lead to investigate, not a reason to repair or stop today's task without confirming it.
- Distinguish a direct human decision from an agent proposal, screen observation or inferred preference. A concept mentioned in a previous task is not permanent visual approval; use the current brief and owning art section.
- When explicitly asked to update memory, record durable decisions, source pointers and reusable failure mechanisms. Include scope, evidence and a condition for rechecking any temporary observation. Correct or supersede stale guidance through the available memory-update mechanism; do not create a repository memory file that duplicates the authorities.
- Do not promote a hypothesis into a rule because a previous agent sounded confident, or reject a valid rule because of which model wrote it. Keep guidance that protects a concrete invariant or prevents a demonstrated failure; revise it using current evidence.

## Non-negotiable project rules

- Preserve the no-combat game: no weapons, hostile mobs, PvP, raids, classes, or combat substitutes. Tension comes from weather, timing, capacity, freshness, routes, preparation, and fishing skill.
- Simulation owns all canonical, serializable gameplay truth. Three.js objects, shaders, animation, DOM/UI state, and `userData` are presentation only.
- Gameplay RNG is seeded and deterministic; never use `Math.random()` in simulation. Use stable persistent IDs and migrate save-sensitive changes with fixtures/tests; never silently discard a save.
- Keep all inventory and logistics finite. Sport fish remain physical cargo, not stackable items. Offline progress never silently harvests, sells, fishes, repairs, or otherwise automates player actions without an explicitly unlocked system.
- Preserve the intended connected loop: farm to ingredients/wood/worms to processing to bait/chum/supplies to fishing to cargo/market to new capabilities. Major progression unlocks capabilities, locations, scale, automation, or strategy—not only percentage bonuses.
- Keep the world first and the HUD contextual, compact, accessible, and non-dashboard-like. UI may display results but never reproduce gameplay formulas or own mutations.
- Use one formula owner, clear types, explicit state machines, centralized tuning, atomic inventory/cargo transactions, and small domain modules. Do not introduce adjacent systems, giant god objects, or local presentation workarounds for simulation defects.

## Art and asset rules

- Preserve the premium cozy, warm tactile coastal identity: authored simplified geometry, deliberate asymmetry, warm sun/cool fill, broad AO/contact grounding, functional coastal/farm details, and gameplay-camera readability. The approved reference-led harbor direction in `04` §8/§8.1 supersedes polygon-cell water and restrictive coastal stone, crown, surface and capture rules; that section owns the scoped exceptions. Measure silhouette, draw, memory and frame cost instead of forcing the harbor into an arbitrary low-poly limit.
- Avoid primitive-only/toy-like art, photoreal textures, noisy micro detail, plastic gloss, chibi/anime drift, generic fantasy kitbashing, diorama-only styling, heavy bloom/DOF, local exposure/tone-map hacks, and permanent toon/ink outlines.
- Production color/materials must use `PaletteTokens`/`PaletteMaterials` and the palette JSON. `VisualRenderConfig` is the only renderer baseline; zone/asset code cannot invent a second lighting or grading system.
- Runtime static 3D assets are GLB/glTF 2.0 only. Use the single catalog, schema, registered generator workflow, CLI staging/validation/optimization/atomic publication, Meshopt-aware loader, and batching/instancing path. Do not create direct exporters, parallel palette/spec files, filename lists, or runtime `.blend`/`.fbx`/`.obj` paths. Ground supporting maps are the documented non-GLB exception: local processed images under `public/assets/textures/terrain/`, owned by `ExternalSurfaceTextures` plus `VisualRenderConfig`, remapped into palette families. They are not catalog IDs and must not be produced with `art:generate`.
- Do not mass-produce world art before P0.5 and P0.75 establish and pass the renderer/material foundation plus the bridge-river, starter-farm, harbor, and coast/lighthouse visual-gold slices. Technical-art certification remains a separate release gate.

## Documentation is part of the change, not a follow-up

**When implementation changes a documented contract, update its owner in the same change.** A repair that restores the existing contract needs no ceremonial rewrite. Leaving a changed documented fact stale is incomplete.

Before you report a task finished, check this table and update every row your
change touched. Update the **owner only** — never copy the fact into a second
file.

| If you changed… | Update, in the same change |
|---|---|
| `CURRENT_SCHEMA_VERSION`, a migration, or `layoutRevision` | `01` §6 version line **and** the §6.1 migration ledger row; add the fixture/test named by `03` §25 |
| Canonical `GameState` shape, a domain's state, or a formula owner | `01` §5/§6 and the owning `02` section |
| A gameplay rule, cost, gate, tier, or balance number | the owning `02` section; if it becomes live, move it out of `02` §22 Deferred |
| Content membership, counts, unlocks or authored progression | the relevant `src/content/` owner; update `02` only when the design contract changes. Use `npm run content:validate` for totals instead of hand-copying them into prose. |
| A `GameplayMode`, `GameAction`, or input mapping | `01` §9 |
| Renderer baseline, palette tokens, or supporting-map behaviour | `VisualRenderConfig` / `ExternalSurfaceTextures` (code owns the numbers) and the relevant `04` / Art Pipeline section — document ownership, not a copy of the values |
| The asset catalog, generators, or the published manifest | the catalog entry; **do not** hand-copy asset counts or below-target lists into Markdown — cite `generated/reports/asset_budget_report.json` |
| The layout editor's kinds, bindings, or write targets | `LLM/LAYOUT_EDITOR.md` §4/§9 |
| A roadmap gate's status or evidence | `03` for the gate definition; `LLM/IMPLEMENTATION_STATUS_CHECKLIST.md` for the evidence, with the narrowest proof (command, test name, passing count) |
| An audio bus, cue id, or manifest field | `LLM/06_AUDIO_AND_MUSIC_DESIGN_MASTER.md`, and say whether the cue is specified or actually wired |

Rules for these updates:

- **One owner per fact.** Keep normative formulas in their owning gameplay section with a link to the implementation; keep enumerations and configuration values in code/data. Other documents link rather than repeat them.
- **No hand-copied inventories** of asset IDs, counts, hashes or git state as current authority. Link the source or regenerating command. Scoped test counts, dates and input hashes belong in evidence records and describe only that run.
- **Replace superseded guidance.** Edit the owning paragraph rather than appending another rule at the end. Preserve migration history in `01` §6.1 and verification history in the status checklist; mark proposals and deferred work explicitly.
- **Never date-stamp a claim you did not verify in this change.** If you update a section, either re-verify its evidence or explicitly mark the untouched parts as historical.
- Say `Docs updated:` (with paths) or `Docs updated: none — no documented fact changed` in every completion report.

## Required task discipline

Apply the [OpenAI prompting guidance](https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices) through these Neva-specific boundaries:

- Treat an action request as authorization to deliver the scoped result, including its required checks and documentation. Analysis-only requests remain read-only. Resolve routine, reversible choices from the owning sources; ask only when a missing decision materially changes the outcome, cost, saved data or external state. Prepare the authorized, reviewable work before seeking any still-required approval.
- Continue until the requested outcome is supported by the applicable evidence or an exact blocker remains. A harbor screenshot cannot close a performance gate; a domain test cannot establish that a fishing interaction works in the browser.
- After the required checks pass, repeat or broaden them only for changed inputs, failures or unresolved concerns, following `03` §4.
- Use subagents only when the user or an applicable instruction explicitly requests delegation. When authorized, assign bounded ownership, preserve concurrent edits and verify integration before claiming completion.
- Keep updates and handoffs concise: player-visible result, relevant evidence and remaining gaps. Use plain prose or short lists; avoid narrating routine tool calls.

1. Establish the requested outcome and inspect worktree status and existing diffs in the files you expect to touch. Preserve edits already present; re-read a file if another writer changes it before your patch. Read the owning subsystem and the scoped sources routed above to the end. For Blender/art tasks, use `LLM/BLENDER.md`'s production sequence after the root route.
2. Identify scope, state/formula owner, save impact (`yes`/`no`), migration need, affected callers, tests, visual/performance impact, **the canonical documents your change makes stale**, and the smallest complete change before editing. For a repair, distinguish the observed symptom, suspected cause and evidence that would confirm the cause. Trace the affected caller-to-owner path; do not substitute a nearby passing test for the failing behavior. Keep this preflight proportional rather than emitting a mandatory form.
3. Implement without placeholders, fake integrations, hidden fallbacks, or unrelated cleanup. Update the owning documents alongside the code.
4. Validate using `03` §4's task matrix and its command-side-effect guidance; `BLENDER.md` owns the art commands. Check script hooks before using a command as verification, and preserve generated drift evidence before regeneration. Static previews, screenshots, benchmarks, broad suites and agent-led visual scoring are not daily asset gates. The human reviews integrated visuals in the actual game.
5. Review your own diff against the starting state before handoff. Never describe code as tested, browser-verified, visually approved, published, or production-ready unless that specific gate actually passed. State exact evidence and limitations. If relevant inputs changed during a check, scope its result to those inputs and rerun only the affected checks needed to support the final claim.

## Phase and completion discipline

Follow the Roadmap sequence: `P0 → P0.5 → P0.75 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9 → P10 → P11 → P12 → P13 → P14 → P15 → P16`. Do not skip required gates or use P14 as the first real art pass.

Routine asset completion reports state only the asset IDs, runtime integration point, mechanical generation status, save impact, `Docs updated:`, and `Awaiting human game review`. Expanded reports are reserved for shared-generator, release, migration, or other high-risk work.
