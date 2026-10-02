# Neva Project Rules for Every Agent Session

> **Before implementation advice or edits:** Use the task route below. Read the selected owner sections **to their end**, including linked contracts, and inspect the owning implementation and affected callers. Expand the route when that trace crosses a contract boundary; use full-document reads for the broad changes named in the table. Repository-relative sources take precedence over historical memory or developer-specific paths.
>
> **This repository-root file is the single routing authority.** `LLM/AGENTS.md` is a pointer to this file and holds no independent rules. Do not add a second routing document.

## Canonical authorities

1. `LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md` — primary technical authority: architecture, state ownership, determinism, persistence, input/modes, runtime stack, performance and cross-system invariants. §6.1 is the **single migration ledger**.
2. `LLM/02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md` — gameplay/balance/math authority: farming, crop lifecycle, fishing, cargo/boats, markets, mounts, Work Capacity, progression, contracts, the authored quest/lore spine, and vertical-slice rules.
3. `LLM/06_AUDIO_AND_MUSIC_DESIGN_MASTER.md` — audio authority: bus graph, mixing/calibration, cue inventory, adaptive music, and audio asset standards. **Design-stage:** its cue inventory describes *specified targets*, not shipped coverage. `src/audio/` and the audio manifest own what actually plays; `01` §14 owns the domain-event contract that audio consumes.
4. `LLM/03_PRODUCTION_ROADMAP_LLM_AGENT_PLAYBOOK.md` — execution, milestones, validation, and completion-report authority.
5. `LLM/ASSET_PRODUCTION.md` — operational authority for catalog-driven production (authored generators, authored GLBs and frozen legacy assets), validation, publishing, reports, Art Yard handoff, and runtime integration. `tools/authored/README.md` owns how authored Three.js generators are written and frozen families ported.
6. `LLM/LAYOUT_EDITOR.md` — operational authority for the DEV-only in-game layout / Place / F2 editor.

`LLM/IMPLEMENTATION_STATUS_CHECKLIST.md` records scoped evidence, not design authority.

Agents choose and revise visual design within the current task: geometry, materials, palette, lighting, effects, composition and UI. There is no permanent art style or reference lock. References and briefs are optional, revisable task inputs. Preserve gameplay, save, runtime-interface, accessibility, provenance and measured performance contracts. Routine work completes with relevant checks and agent inspection; human visual review is required only for release or when explicitly requested.

### Guidance claims that are enforced

Prose is not a build gate, so the claims below are executed rather than trusted. Prefer adding a check to restating a fact.

| Claim | Enforced by |
|---|---|
| Content counts in `AGENTS.md`, `01`, `02` and the status checklist agree with `ContentRegistry`, and any rank threshold written beside a rank name matches `PROFICIENCY_RANKS` | `tests/unit/docContentCounts.test.ts` |
| A `ts` block in `01`/`02` names a type the runtime declares (anywhere under `src/`, classes included) and only fields it still declares; a doc may abridge a shape, not misdescribe or rename it | `tests/unit/docTypeShapes.test.ts` |
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
- `tools/art/asset_budgets.json`
- `src/content/` and `ContentRegistry` (content IDs, membership, counts and validation)
- `src/simulation/` (implemented state and formula definitions)
- `src/persistence/` (implemented save schema, migrations and recovery)
- `src/render/config/VisualRenderConfig.ts` (live renderer and supporting-map numbers)
- `src/render/materials/ExternalSurfaceTextures.ts` (supporting-map provenance and URLs)

`tools/art/README.md` documents CLI operation; `tools/art/cli.mjs` owns what the commands actually do. These implementation owners establish observed behavior, not permission to override a design invariant. Apply the conflict procedure below when they disagree with a normative rule.

Do not create parallel `*_UPDATED`, `*_FINAL`, `*_COMPACT`, or similar authorities. Do not list deleted files as authorities.

### Task routing

Always read this file first. Select sections by the requested outcome and affected contract, then combine rows as needed. An attachment, folder dump, or adjective such as “premium” does not broaden the task. Reuse sources already read in the task; reread when they change or a new decision depends on another section. `03` §4 owns the verification matrix.

| Task | Read before changing the affected contract |
|---|---|
| Documentation or copy | The owning section and its linked source. For structural guidance refactors, read the affected routing/authority sections and their downstream instructions; read full documents when changing their overall role. No runtime gates for prose alone. |
| UI presentation or input | `01` §9/§13 and the affected UI/DTO/action callers. Read the owning `02` section if a gameplay rule is involved. |
| Gameplay or balance | The owning `02` sections and §18 invariants; relevant `01` ownership/input/persistence sections; the domain, tuning/content owner and affected callers. Full `02` for a connected-loop or broad progression redesign; add the architecture route for cross-system state changes. |
| Persistence, architecture or cross-system state | `01` ownership/state/persistence sections and affected contracts; owning `02` sections. Full `01` for architecture redesign, migrations or cross-system state changes; saved-state changes also require `03` §25, the migration chain and retained fixtures. |
| Existing asset or new asset in an existing family | Full `ASSET_PRODUCTION.md` and `tools/authored/README.md`, selected catalog entry, generator (or committed authored GLB source) and runtime integration point. Read a reference or brief only when the current task selects it. |
| New generator family or shared art helpers | The asset route plus the changed construction/export contracts in `tools/authored/` and `tools/art/`, and affected family consumers. Read full `ASSET_PRODUCTION.md` for a new production path or shared pipeline redesign. |
| Renderer, material or supporting maps | `01` §12, `VisualRenderConfig` and affected render callers. Supporting maps also require `ExternalSurfaceTextures`. Full `01` for renderer architecture redesign; add gameplay/persistence routes if topology or saved truth changes. |
| Audio | Full `06`, `01` §14, runtime audio/manifest owners and triggering callers. Add the gameplay route only if gameplay state or events change. |
| Layout / Place / F2 editor | Full `LAYOUT_EDITOR.md`, `src/layout-editor/`, `src/app/PlacementEditor.ts`, `tools/layout-editor/patchPlacement.ts`. Do not import `src/world` into the Vite patcher. Add persistence/gameplay routing if saved topology or structure contracts change. |
| Milestone or gameplay sequencing | Full `03`, relevant design owners and the evidence index in `IMPLEMENTATION_STATUS_CHECKLIST.md`. |
| Release | Full `01`, `02`, `03` and `ASSET_PRODUCTION.md`; relevant audio/layout sources if included. Keep requested human review, determinism, publication and production performance evidence separate. |

`referenceAuthoring` is optional. When the task uses a recorded brief, read only that brief and rerun `art:brief` when a retained brief changes. Agents may revise or remove a brief as the task requires; its presence does not lock the asset to historical taste. Routine asset work does not load `01`, `02` or `03` by default.

## Generate-asset prompt contract

Folder dumps (`@LLM`, `@tools`) do not change task-class routing. Attachment is not equal authority. First files to **obey**: this file, `LLM/ASSET_PRODUCTION.md`, `tools/authored/README.md`, the selected catalog entry, the owning generator, and references selected by the current task. Other attached files are for conflict resolution only. Leave `02` unread for this prompt class.

“Generate assets” always means: resolve or add catalog ID(s) → registered family generator (an authored Three.js generator in `tools/authored/generators/`; when the asset belongs to a frozen legacy family, port the family first) → update catalog parameters and any task-selected brief → `npm run art:brief -- --asset` only if a retained brief changed → `npm run art:generate -- --asset` → integrate → focused Art Yard/game inspection and scoped corrections → Art Yard link and completion evidence. There is no Blender or Python production step. The upstream graphics skills do not provide an asset-generation workflow. Provider APIs still need an explicit human request. If the named subject is missing from the catalog, add one catalog entry and extend (or port and extend) the owning family generator; do not publish a one-off GLB. A GLB the human supplies (such as a Tripo generation) is the one exception to generator code: it becomes a committed `authored_glb` source with its own catalog entry and publishes through `art:generate` (`ASSET_PRODUCTION.md` §3.2). Ground supporting maps are not generate-asset work: do not add catalog IDs for them or run `art:generate`.

Images under `tools/art/references/` are an optional reference library. The current task determines which images and aspects to use. They do not override gameplay or runtime interfaces; catalog IDs win if the reference index drifts.

## Codex and upstream Three.js graphics skills

Use the repository copies under `.agents/skills/threejs-*`; read `.agents/skills/CONVENTIONS.md` with the selected skill. The 24 graphics skills provide techniques and examples. Neva's authorities still own scope, gameplay truth, asset publication, renderer configuration and verification; visual direction comes from the current task and agent judgment. The upstream pack does not provide gameplay, UI, provider-generation or release agents.

Use `threejs-skill-router` for graphics work that spans systems or has an unclear visual cause; load one specialist directly when its mechanism is already known. Apply the skill's mechanisms to Neva's existing owners and backend. Do not copy bundled scaffolds or demos wholesale into the game. External generation remains an optional source and any provider call needs an explicit human request. Use `03` §4 for checks; there is no separate Three.js release skill.

If a skill would block authorized work, apply the rule hierarchy first. If the blocker remains, link the exact `SKILL.md`, quote the instruction and explain the affected decision. Do not infer a permission gate from optional guidance.

For a broad graphics pass, use `.agents/skills/threejs-skill-router/SKILL.md` to select only the relevant specialists. After the catalog, task-selected references, and owning generator, Codex may use `.agents/skills/threejs-procedural-geometry/SKILL.md` plus its `references/geometry-craft-workflow.md` and `references/geometry-quality-gates.md` as technique guidance. Implement in the authored generator and `tools/authored/kit/` (porting a frozen legacy family first when the asset belongs to one); do not import the skill's portable geometry kit or add a parallel export path. Provider APIs need an explicit human request; never publish a downloaded GLB except as a committed `authored_glb` source through `art:generate`. Use `03` for proportional verification and release gates.

## Rule hierarchy

1. The human's latest explicit instruction sets the task and can change its design scope. Preserve existing authorization; do not ask again for a step already authorized.
2. For design decisions, use the owning authority: `01` for architecture/state/persistence, `02` for gameplay, `01` §12 and the owning implementation for rendering contracts, `ASSET_PRODUCTION.md` for production operations, `06` for audio design, `LAYOUT_EDITOR.md` for the DEV editor, and `03` for execution/gates. Cross-domain conflicts resolve in that order; audio/editor rules remain subordinate to `01`/`02` on gameplay truth.
3. Read exact content membership, configuration values, schemas and artifact disposition from their declared code/data/generated owner. Prose explains intent and constraints and links to these values. An illustrative example is not a second implementation contract.
4. Current code proves what is implemented; current test/runtime evidence proves only the behavior exercised. Neither silently changes approved design. A status log, previous pass or agent assumption cannot overrule an owner.

If an owner is missing, ambiguous or contradictory, name the sources and the affected decision. Pause that decision while resolving it from the hierarchy or the user; continue independent work. Repair an unambiguous stale reference within scope. Do not invent a replacement authority or turn an implementation bug into a design rule.

## Memory and evidence hygiene

Memory is a retrieval aid, not another project authority. Use it to find relevant
owners, prior decisions and useful reproductions; verify the parts on which the
current task depends. In particular:

- The task table above supersedes historical blanket instructions to read all four briefs for every implementation. Read the routed sources completely; expand when an affected contract crosses into another route.
- Treat remembered errors, line numbers, ports, schema versions, budgets, asset counts, visual concepts and gate results as historical until checked against their current owner. An old blocker is a lead to investigate, not a reason to repair or stop today's task without confirming it.
- Distinguish a direct human decision from an agent proposal, screen observation or inferred preference. A concept mentioned in a previous task is not permanent visual approval; use the current task, selected references and technical owners.
- When explicitly asked to update memory, record durable decisions, source pointers and reusable failure mechanisms. Include scope, evidence and a condition for rechecking any temporary observation. Correct or supersede stale guidance through the available memory-update mechanism; do not create a repository memory file that duplicates the authorities.
- Do not promote a hypothesis into a rule because a previous agent sounded confident, or reject a valid rule because of which model wrote it. Keep guidance that protects a concrete invariant or prevents a demonstrated failure; revise it using current evidence.

## Non-negotiable project rules

- Preserve the no-combat game: no weapons, hostile mobs, PvP, raids, classes, or combat substitutes. Tension comes from weather, timing, capacity, freshness, routes, preparation, and fishing skill.
- Simulation owns all canonical, serializable gameplay truth. Three.js objects, shaders, animation, DOM/UI state, and `userData` are presentation only.
- Gameplay RNG is seeded and deterministic; never use `Math.random()` in simulation. Use stable persistent IDs and migrate save-sensitive changes with fixtures/tests; never silently discard a save.
- Keep all inventory and logistics finite. Sport fish remain physical cargo, not stackable items. Offline progress never silently harvests, sells, fishes, repairs, or otherwise automates player actions without an explicitly unlocked system.
- Preserve the intended connected loop: farm to ingredients/wood/worms to processing to bait/chum/supplies to fishing to cargo/market to new capabilities. Major progression unlocks capabilities, locations, scale, automation, or strategy—not only percentage bonuses.
- Keep UI accessible and usable with clear gameplay feedback. UI may display results but never reproduce gameplay formulas or own mutations.
- Use one formula owner, clear types, explicit state machines, centralized tuning, atomic inventory/cargo transactions, and small domain modules. Do not introduce adjacent systems, giant god objects, or local presentation workarounds for simulation defects.

## Art and asset rules

- Agents may redesign appearance within task scope without a style bible, fixed reference hierarchy, mandatory geometry recipe or taste score. Inspect affected appearance and motion in the Art Yard and actual game, and correct observed defects within scope.
- `PaletteTokens` / `PaletteMaterials` and the palette JSON are shared color/material helpers that agents may revise or extend; they do not force imported source materials into a palette. Authored GLBs and frozen imported sources may retain native PBR materials, with optional vertex colors and declared texture caps. `VisualRenderConfig` owns shared renderer configuration and may evolve within task scope. Avoid parallel palette or lighting/grading authorities.
- Runtime static 3D assets are GLB/glTF 2.0 only. Use the single catalog, schema, registered producer workflow, CLI staging/validation/optimization/atomic publication, Meshopt-aware loader, and batching/instancing path. Do not create direct exporters, parallel spec files, filename lists, or runtime `.blend`/`.fbx`/`.obj` paths. Ground supporting maps are the documented non-GLB exception: local processed images under `public/assets/textures/terrain/`, owned by `ExternalSurfaceTextures` plus `VisualRenderConfig`. Preserve source/license evidence, loading and disposal; they are not catalog IDs or `art:generate` outputs.
- Triangle minimums/targets and lower LOD ratios are advisory. Enforce hard upper budgets and runtime compatibility: nodes, dimensions, pivots, collision, rigs, animations, material/texture contracts and valid GLB packaging. `--strict` remains a compatibility alias and adds no art-certification or taste gate.
- P0.5/P0.75 establish technical renderer/catalog integration. They do not prescribe four scenes, permanent visual identity, human approval before expansion, or a separate technical-art certification.

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
| Renderer baseline, palette tokens, or supporting-map behaviour | `VisualRenderConfig` / `ExternalSurfaceTextures` (code owns the numbers) and `01` §12 / `ASSET_PRODUCTION.md` when their contracts change — document ownership, not a copy of the values |
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
- Use subagents according to the active user/developer instructions. Assign bounded ownership, preserve concurrent edits and verify integration before claiming completion.
- Keep updates and handoffs concise: player-visible result, relevant evidence and remaining gaps. Use plain prose or short lists; avoid narrating routine tool calls.

1. Establish the requested outcome and inspect worktree status and existing diffs in the files you expect to touch. Preserve edits already present; re-read a file if another writer changes it before your patch. Read the owning subsystem and the scoped sources routed above to the end. For art tasks, use `LLM/ASSET_PRODUCTION.md`'s production sequence and `tools/authored/README.md` after the root route.
2. Identify scope, state/formula owner, save impact (`yes`/`no`), migration need, affected callers, tests, visual/performance impact, **the canonical documents your change makes stale**, and the smallest complete change before editing. For a repair, distinguish the observed symptom, suspected cause and evidence that would confirm the cause. Trace the affected caller-to-owner path; do not substitute a nearby passing test for the failing behavior. Keep this preflight proportional rather than emitting a mandatory form.
3. Implement without placeholders, fake integrations, hidden fallbacks, or unrelated cleanup. Update the owning documents alongside the code.
4. Validate using `03` §4's task matrix and its command-side-effect guidance; `ASSET_PRODUCTION.md` owns the art commands. Check script hooks before using a command as verification, and preserve generated drift evidence before regeneration. Inspect affected visuals in the Art Yard and actual game when appearance changes, and correct observed defects within scope. Additional captures or diagnostics are appropriate when they resolve uncertainty; full capture suites, benchmarks and numeric style scores are not daily asset gates. Report agent inspection as agent evidence; claim human approval only when it was actually given.
5. Review your own diff against the starting state before handoff. Never describe code as tested, browser-verified, visually approved, published, or production-ready unless that specific gate actually passed. State exact evidence and limitations. If relevant inputs changed during a check, scope its result to those inputs and rerun only the affected checks needed to support the final claim.

## Phase and completion discipline

Follow the Roadmap sequence: `P0 → P0.5 → P0.75 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9 → P10 → P11 → P12 → P13 → P14 → P15 → P16`. Use the applicable technical/gameplay gates; visual work may proceed autonomously throughout development without a fixed scene order or mandatory art-approval milestone.

Routine asset completion reports state the asset IDs, runtime integration point, mechanical generation status, focused inspection evidence or access gap, save impact, `Docs updated:`, and the scoped completion result. Record a human-review gap only when release or the current task explicitly requires that review. Expanded reports are reserved for shared-generator, release, migration, or other high-risk work.
