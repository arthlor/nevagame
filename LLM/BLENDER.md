# BLENDER.md
## Neva — Lean Blender Production Rules for LLM Agents

> **Role:** Operational authority for catalog-driven Blender generation, GLB validation, publication, Art Yard handoff, and runtime integration.
>
> **Human/agent boundary:** Agents generate and mechanically integrate assets. The human reviews the result in the actual game and requests revisions. Routine agents do not create static previews, capture screenshots, score style, or iterate visually on the human's behalf.

> **Harbor-coast production exception:** The approved coastal rebuild explicitly authorizes reference-frame inspection, iterative gameplay-camera captures, traversal recordings and browser measurements. These are required evidence for this environment task; they do not constitute human visual approval. The scoped direction and superseded visual constraints are owned by `04` §8.1. This exception does not change routine asset-task gates.

---

# 0. Task-Class Read Order

Read every selected source to the end, but select only the owners required by the task.

## Routine existing-asset task

1. root `AGENTS.md`
2. this file
3. `tools/blender/README.md`
4. the selected entry or entries in `assets/specs/asset-catalog.json`
5. the owning family generator and any helper it directly calls
6. the runtime placement/loader/scene code being changed
7. the directly relevant section of `LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md` when appearance changes

Do not read the full catalog or every LLM authority for this task class.

## New/shared pipeline task

Add the owning full authorities:

- new generator/family/shared helper: Art Bible + `LLM_AGENT_ART_PIPELINE_INSTRUCTIONS.md`;
- renderer/material/lighting/water: `01`, Art Bible, and Art Pipeline, plus `src/render/config/VisualRenderConfig.ts` and `src/render/materials/ExternalSurfaceTextures.ts` when ground supporting maps are in scope;
- gameplay contract or persistence: `01` + `02` and the owning gameplay/runtime files;
- story-relevant zone, character, landmark, or prop design/integration: `02` narrative contract + `04` environmental-storytelling section; routine generation-only prompts keep the lean asset route and leave `02`/ArcheAge unread;
- release/gold slice: `01`, `02`, Art Bible, Art Pipeline, Roadmap, this file, README, and relevant machine contracts.

Conflict priority remains: human instruction → `01` → `02` → Art Bible → Art Pipeline → this file → machine owner for its fields → Roadmap → implementation → assumption.

---

# 1. Daily Asset Workflow

Folder dumps (`@LLM`, `@tools`) do not change this routing. First files to **obey**: root `AGENTS.md`, this file, `tools/blender/README.md`, the selected catalog entry, the owning generator, the isolated sheet if present, and the relevant Art Bible section. Other attached files are for conflict resolution only. Leave `02` and ArcheAge unread for generate-asset prompts even if `@LLM` attached them.

**Generate assets** in this repo always means: resolve or add catalog ID(s) → registered family generator → measure isolated-sheet identity into `parameters` when a sheet exists → `npm run art:brief -- --asset` only if that brief changed → `npm run art:generate -- --asset` → integrate → Art Yard link → `Awaiting human game review`. Do not run `tools/blender/generators/generate_all.py`. Do not start `threejs-game-director` for this prompt. Provider APIs (Tripo/Gemini/ElevenLabs) still need an explicit human request. If the named subject is missing from the catalog, add one catalog entry and extend the owning family generator; do not publish a one-off GLB. Ground supporting maps are not generate-asset work: do not add catalog IDs for them or run `art:generate`.

Isolated studio sheets are style-match evidence for the mapped catalog ID. Numbered crop/diorama PNGs in `tools/blender/references/README.md` are graphics-only extracts from `art-reference.png`; do not copy their camera, staging, or pixels. `art/references/neva-ui-hud-on-foot.png` is the scoped gameplay-distance graphics benchmark for starter-farm terrain, worked-earth paths, meadow flowers/foliage, crop-bed presentation, and clear-day lighting; it never authorizes copying camera, UI, layout, depth of field, tilt-shift, or composition. Catalog IDs win if a reference README drifts (`prop_wagon_cart_a`, not `vehicle_horse_cart_a`).

Sculpt in passes without screenshot/SSIM gates: blockout (primary masses and negative space vs the isolated sheet) → structure (masonry, timber, shingles, openings) → sparse tertiary readable at 8 m → palette + vertex value on the existing `COLOR_0` path. Human revision remains `asset ID + observed miss + desired change`.

Codex skill route for this prompt: prefer `.agents/skills/<name>/SKILL.md` over `~/.codex/skills`. After the Neva catalog, isolated sheet, and owning generator, Codex may load `.agents/skills/threejs-aaa-graphics-builder/references/checklists/procedural-model-quality.md` (and `model-recipes.md` when appearance is being designed) as critique vocabulary, then implement in the registered Blender family generator and `authored.py` — never a Three.js factory. `threejs-image-generator` may create or clean an isolated study only when the human asks for new reference art. `threejs-3d-generator` (Tripo) is a reconstruction study only when the human explicitly authorizes a provider call; never publish the downloaded GLB. `threejs-qa-release` stays a release/gold-slice tool.

The everyday route is:

```text
selected catalog entry
→ reference brief only when image/study guided
→ owning registered generator
→ selected generate + validation + optimization + atomic publish
→ automatic Art Yard entry
→ runtime/game integration
→ human game review
```

Commands always require an explicit selector. A bare generation command must fail rather than regenerate the full catalog.
`art:brief` is reference-guided only: it accepts selected assets/families whose
catalog entries contain `referenceAuthoring` and rejects `--all` (or a mixed
selection) before emitting a partial brief.

```bash
# Only when the selected referenceAuthoring brief changed
npm run art:brief -- --asset tree_oak_a

# Normal selected generation and publication
npm run art:generate -- --asset tree_oak_a

# Related assets may be batched by family
npm run art:generate -- --family vegetation
```

After publication, the CLI prints a direct development link such as:

```text
http://localhost:3000/__neva_art_yard?asset=tree_oak_a
```

The agent then integrates the asset into the actual game. Do not stop for a separate agent approval loop. Complete the handoff with `Awaiting human game review`.

## Daily gates

Keep:

- closed catalog/schema validation;
- selected reference-authoring validation when present;
- palette and generator-parameter validation;
- deterministic catalog seed and stable ID/name contracts;
- Blender scene validation;
- raw Khronos GLB validation;
- glTF Transform dedupe/join/prune/weld + Meshopt;
- optimized Khronos and semantic revalidation;
- dimensions, bounds, pivot, required nodes, collision, LOD, animation, material and triangle min/max checks;
- validated cache reuse;
- rollback-capable atomic publication and generated/public hash parity;
- runtime integration and TypeScript check only when runtime TypeScript changed.

Do not run for routine work:

- static Blender previews or generated preview packages;
- screenshot capture or agent image inspection;
- strict density gates;
- determinism double-generation;
- gameplay benchmarks;
- full builds, broad test suites, or unrelated linting;
- agent-led style scoring or visual approval.

---

# 2. Shared Generator and Release Gates

## Shared generator or `common/authored.py` change

1. Identify every affected catalog asset.
2. No-publish generate the affected family or explicit asset union.
3. Run authored-builder tests when shared construction changed.
4. Run semantic determinism for the affected family only.
5. Publish the affected family once mechanical checks pass.

```bash
npm run art:generate -- --family architecture --no-publish
npm run art:test-builders
npm run art:determinism -- --family architecture
npm run art:generate -- --family architecture
```

## P0.75 visual-gold gate

The visual-gold gate refreshes provenance for the existing published GLBs,
validates the current catalog/manifest contract, and runs the gameplay-camera
benchmark. It does not regenerate or reauthor assets; per-asset triangle target
floors are advisory in this lane, while production minimums, hard maximums,
materials, nodes, palette, and runtime validation remain enforced.

```bash
npm run art:sync -- --all
npm run art:validate -- --all
npm run art:benchmark
```

The benchmark must have no browser errors, no more than 220 draw calls, and no
more than 900,000 visible triangles per measured scene. It runs against the
Vite DEV server; layout-editor picking intentionally keeps static prefabs
unmerged and omits the baked static-shadow proxy. Therefore DEV measurements
are diagnostic rather than production-equivalent proof, and a current
over-budget DEV result must remain visible instead of being addressed by
relaxing `tools/blender/asset_budgets.json`.

## Technical-art certification or release gate

```bash
npm run art:generate:strict -- --all
npm run art:validate -- --all
npm run art:determinism -- --all
npm run art:benchmark
```

`art:generate:strict` and determinism retain their existing semantics. They are
separate technical-art/release gates and remain open after visual-gold approval
until clean-source generation, determinism, and the certified render-budget
path are repaired.

Release screenshots are evidence artifacts. Do not spend AI tokens reviewing or iterating on them unless the human explicitly requests visual analysis.

---

# 3. Single Source and Runtime Contract

- `assets/specs/asset-catalog.json` owns asset IDs, files, family/generator, seed, dimensions, palette, budgets, pivot, collision, instancing, LOD, required nodes, read distance, parameters, optional reference authoring, and character contracts.
- Character `parameters` may declare a repository-local animation authoring source. The registered character generator may import that source only during offline generation, calibrate it from a relaxed reference pose, and transfer selected motion only when source axes, proportions, and usable joint ranges remain compatible at target-rig-safe amplitudes. Otherwise the source is reference for a Neva-rig-authored clip. Source objects/actions are removed before the normal GLB validation and publication path; runtime never loads the source file.
- `asset-catalog.schema.json` owns the accepted shape. Do not add parallel YAML, filename lists, per-family specs, or alternate exporters.
- `art/palettes/neva.palette.json` owns production tokens and material properties.
- `tools/blender/asset_budgets.json` owns scene and texture envelopes.
- `generators/registry.py` is the only generator dispatch table. Family composition stays in its owning module; reusable deterministic mid-scale construction may live in `common/authored.py`.
- Runtime static 3D assets are optimized GLB/glTF 2.0 only. Never load `.blend`, `.fbx`, or `.obj` in the game. Ground supporting maps are the documented non-GLB exception: local processed WebPs under `public/assets/textures/terrain/`, loaded only through `ExternalSurfaceTextures`, never through `art:generate` or a catalog ID.
- `1 Blender unit = 1 meter`; use Y-up export, applied transforms, stable nodes, deliberate pivots, palette materials, and `COLOR_0`.
- Simulation owns gameplay truth. Catalog metadata, scene nodes, collision debug meshes, animations, and Three.js objects remain presentation/runtime data.

Same catalog seed + parameters + generator code must reproduce the same semantic asset. Use seeded bounded variation; never uncontrolled RGB, random material assignment, or `Math.random()`-style nondeterminism.

`art:validate` checks the catalog schema, generator-parameter contracts,
LOD/animation/reference contracts, and published GLB metrics. It does not run
family generators or prove authored geometry semantics beyond the exported
artifact contract.

## Adapted external Blender sources

Explicitly requested provider assets may become offline authoring inputs, never
direct runtime downloads. Adapt them to the existing catalog identity, palette,
dimensions/pivot, collision, LOD, budgets, and animation/socket contracts first.
Use the registered `imported_blend` generator with exactly `sourceBlend` and
`sourceCollection` parameters. Keep the durable derivative under
`art/imported/poly-pizza/`, with the export collection named for its catalog ID.
The importer exports only that collection through the shared Blender pipeline;
normal selected or full generation regenerates it instead of reverting to an
unrelated procedural model.

The schema owns the closed build-time `sourceProvenance` object, required for
`imported_blend`: provider/model identity, author, source and license URLs,
supported license, attribution, and adapted Blender source path/digest. Its
`sourceSha256` hashes the **adapted `sourceBlend` bytes**, not the original
download. The path must match `parameters.sourceBlend`, stay repository-local
after resolving symlinks, and remain outside published destinations. A changed
source at the same path invalidates the cache and fails a stale provenance
digest. Update the digest only after verifying that adapted source. These
authoring fields remain absent from the runtime catalog projection; retain any
required attribution in the game's credits before shipping a CC-BY derivative.

For an already exported, catalog-conforming derivative replacing an existing
published ID, the selected admission command is:

```bash
node tools/blender/cli.mjs admit --asset <catalog-id> --source output/<adapted-export>.glb --no-publish
```

It accepts exactly one ID and a repository-contained staged GLB, never a source
under `public/` or `generated/glb/`. It checks provenance, Khronos conformance,
required hierarchy, palette declarations, rest bounds/pivot, attributes,
LOD/skin/animation and unchanged min/max budgets. Admission preserves source
GLB bytes, reports compression from actual extensions, and explicitly records
that it did not run Blender scene validation. Omit `--no-publish` only for the
requested cutover: it reuses selected atomic publication and preserves
unselected files/manifest entries. No full `art:sync` is needed. Staging is
mechanical evidence, not approval of deformation or appearance; retain the Art
Yard and human game review gates.

Regeneration uses lossless Meshopt compression only for `imported_blend` and
checks decoded semantic parity. It must not quantize, reorder, join, weld, or
reconstruct the imported skin. The ordinary family-generator optimization path
is unchanged. Source authoring owns valid bind transforms, normalized weights,
target-compatible motion and LOD deformation; packaging cannot repair them.
Static imported sources follow the same rule for LOD0 topology, UVs, exported
split normals, smoothing boundaries, material-region identity and embedded
textures. A catalog `staticAuthoring` contract pins the immutable original,
declares one uniform scale reference and yaw, and maps every provider material
region explicitly. Solid regions carry the canonical linear palette color once
in `COLOR_0` with a neutral material factor. `texturePolicy: preserve` retains
the original base/normal texture bytes, UV/alpha/double-sided state and uses a
neutral scalar factor without a palette-colored `COLOR_0` multiplier. The
registered exporter restores the immutable source sampler state after Blender
serialization without changing image or geometry bytes. Every preserved-texture
primitive in both LODs keeps `TEXCOORD_0` and its base-color map. Solid emissive
regions export token × declared value as both their vertex color and glTF
emissive factor, with palette-owned emissive strength.

### Offline curated-source preparation

The `adapt_*` helpers under `tools/blender/` prepare reviewed source captures;
they do not publish, change the catalog, or admit arbitrary bundle members.
Run them in a fresh background Blender process with a new directory under
`output/`, never in the artist's active scene. Read the selected helper and
capture report first: supported source identities, material mappings and
dependency exclusions are deliberately narrow. Preserve the reports alongside
the candidate. A helper report's input `sourceSha256` identifies the capture;
catalog provenance must instead hash the final durable adapted `.blend`.

- **Humanoids — `adapt_imported_humanoid.py`:** read the selected catalog `humanoidAuthoring` contract, verify the immutable original source hash, and prepare it in a fresh background Blender process. Original glTF timestamps own source clip timing. Uniform stature scale and coordinate conversion preserve anatomy, topology, source deforming bones, bind transforms, UVs, normalized weights and selective split normals. Exact source part/material mappings select palette tokens; unmapped regions fail. Role clothing and missing peaceful Neva actions are authored around the retained source rig. Never fit a body or copy pose arrays onto the obsolete donor skeleton. The preparation writes a staged Blender library, GLB and mechanical report; the registered `imported_blend` generator remains the publication path.
- **Humanoid comparison — `compare_humanoid_contract.mjs`:** `--asset <id> --candidate <GLB> --report <JSON>` compares the decoded candidate against that catalog entry's immutable source. It checks one uniform coordinate transform, source bind hierarchy, oriented LOD0 triangles, UVs, normals, named-joint weights, material-region mapping and palette application. It also compares retained native performance samples and original durations. Numeric limits belong to the verifier and account for Blender/glTF representation precision. Any bounded native loop-closure repair must be declared separately from preserved source motion. The preparation's all-frame deformation report covers both LODs, distinguishes actual open seams from nearby vertices on overlapping closed surfaces, and rejects evaluated apron/body triangle intersections. Garment fitting follows a cloth envelope across gaps between limbs rather than wrapping into the underlying crotch groove. Neither report certifies runtime foot planting, grips, seats or appearance.
- **Humanoid export fidelity — `common/humanoid_export.py`:** the source preparation and registered exporter share the declared solid-palette color repair. It restores omitted later-primitive vertex colors without altering any other exported bytes, then ordinary validation and lossless optimization run. Preparation records removed source degenerate triangles explicitly; the independent comparator verifies their original area before accepting the declared omission. Unkeyed source animation properties retain the original node defaults rather than inheriting the last authored action's pose.
- **Humanoid binding and review:** catalog `humanoidRig` owns semantic source names, bind-space endpoints, sole/palm frames and bend directions. Animation entries own cadence, contact intervals and simulation commit markers; generator/source evidence stays out of the browser projection. Validate each selected character and semantic determinism before publishing the validated set atomically. The generated action checklist records the evidence for every catalog action, and leaves integrated human review pending. Source, durable Blender input, generated/public GLB and cache/manifests must agree before handoff.
- **Selected offline builds:** `generate --no-publish` and `determinism` validate the whole catalog schema and contracts, but open/hash Blender source files only for selected assets. Unfinished unrelated sources therefore cannot block an isolated equipment stage. Normal catalog validation, admission and publication still verify every source file/hash; this does not permit missing inputs in a published set.
- **Static sources — `adapt_polypizza_static.py`:** imports only the immutable
  GLB and exact node pinned by the selected catalog `staticAuthoring` contract.
  It applies the declared coordinate yaw and one uniform, ground-centered scale;
  LOD0 retains every source triangle, UV, split normal, smooth/hard boundary and
  source material-region identity. Solid material mappings bake exact palette
  token × declared value with no invented height/normal tint. Textured mappings
  retain source base/normal maps and alpha state without adding `COLOR_0`.
  Declared accessory nodes such as the cottage lantern remain separate from the
  source surface. LOD1 may simplify source geometry while preserving data layers;
  it never replaces leaf cards or rebuilds all normals as flat.
- **Static comparison — `compare_static_source_contract.mjs`:** `--asset <id>
  --candidate <GLB> --report <JSON>` compares decoded LOD0 geometry, UVs,
  normals, uniform transform, source material regions and the per-region solid
  or texture-preservation policy against the catalog-pinned original. Only exact
  `addedGeometryNodes` are excluded from source-surface equality and remain
  separately counted and color-checked. The same decoded comparison runs inside
  raw, optimized, cache, admission and published validation, so the manual JSON
  report is durable evidence rather than the only enforcement point. A Khronos
  warning may pass only when the immutable source emits the same approved
  source-preservation warning code; candidates may not add warning classes.
- **Cow — `adapt_polypizza_cow.py`:** retains the reviewed donor anatomy and
  skeleton with uniform metre-space normalization, and bakes only the peaceful
  performances selected by its `SOURCE_CLIPS` mapping into the catalog's named
  actions and same-named NLA tracks. Catalog durations/loop metadata remain the
  contract; combat and unrelated source actions are not retained. Its sampled
  deformation and loop-seam proof is captured before mesh cleanup/LOD reduction,
  so final exported LOD deformation still requires review. The adapter defaults
  to the immutable repository source capture and adjacent identity/license audit
  under `art/imported/poly-pizza/sources/`; callers may override the path only
  when reviewing a new source candidate. Static and cow
  helpers save Blender libraries/reports only; humanoid output additionally
  includes a staged GLB for decoded comparison. All continue through the
  registered `imported_blend` validation/export/publication path above.

---

# 4. Reference-Guided Assets

`referenceAuthoring` is required when supplied images, generated studies, turnarounds, or reconstruction evidence guide the asset. It is not required for ordinary catalog-driven edits without such evidence.

- Keep the brief in the selected catalog entry; do not create a second spec tree.
- Preserve source roles, component hierarchy, silhouette/negative space, hidden-surface confidence, critical features, generator bindings, failure modes, and requested review views.
- Run `art:brief` only when that selected brief changes.
- Read or emit only the selected asset's brief; do not load unrelated briefs.
- The required views describe what the human can inspect through Art Yard/game controls. They do not require static renders or agent screenshot capture.
- `ready` means the brief is structurally complete, not visually approved. Missing `repo://` files fail closed.
- Isolated studio sheets under `tools/blender/references/isolated/` may inform that one asset’s silhouette, proportions, component counts, and construction language. Diorama stills remain graphics-only. `art/references/neva-ui-hud-on-foot.png` may guide the cataloged environment assets named by the Art Bible benchmark lock, but each image-guided asset still requires its own closed `referenceAuthoring` brief and parameter bindings.
- Pass order for sheet-guided work: blockout → structure → sparse tertiary → palette. Agents do not add daily screenshot or SSIM gates.
- Human revision remains `asset ID + observed miss + desired change`.

---

# 5. Art Yard and Runtime Integration

`/__neva_art_yard` and `/art-yard` provide the asset-review surface. It uses the canonical runtime catalog, `AssetLoader`, `VisualRenderConfig`, `PaletteMaterials`, and `LightingRig`, served via Vite in development and emitted as a static production route with pre-rendered catalog metrics for live deployment.

- A successful selected publish makes the asset available automatically.
- `?asset=<catalog-id>` opens the selected asset directly.
- Orbit, distance/LOD, eye POV (1.6m), shading (lit, unlit flat albedo, wire overlay, pure wire, vertex colors, normals, LOD0, LOD1), physical dimensions/clearance/footprint, authoring sockets, skeleton rig, origin axes tripod, bounds, collision, animation scrubbing/frame-stepping, lighting, weather, ground, and water controls remain diagnostics for the human.
- Player context clips are previewed atomically with the required donkey, rowboat, or skiff companion and companion-inclusive bounds. Mounted gaits synchronize rider and animal phases; boarding/docking use the matching craft variant; `reel` layers over selectable on-foot, rowboat, or skiff bases. Timeline scrubbing seeks each action deterministically rather than changing mixer-global time.
- The normal game is the final visual judge. Integrate the catalog ID through the existing loader/placement/batching path; do not create a direct loader or local asset registry.
- Compatible repeated static assets use the existing batching/instancing path. Do not fold skinned, morph-target, or dynamic descendants into static batching. Production static LOD pieces use the existing per-instance level tracking and catalog switch distances; do not flatten them without preserving level selection. DEV keeps prefabs unmerged for layout-editor picking.
- For a story-relevant asset or zone, the integrated review also checks that its practical role and relationship to the current quest beat read at gameplay distance. This is visual/environmental evidence only; quest progression remains owned by simulation/content code.

Mechanical success permits the agent to say `generated`, `validated`, `published`, and `integrated` only when those gates passed. It does not permit `visually approved`, `final`, or `production-ready` before human game review.

---

# 6. Cache, Staging, Reports, and Retention

- `generated/.cache/art/` is disposable acceleration state keyed by asset/toolchain inputs. Keep it enabled and never publish from it without revalidation.
- `generated/.staging/run-*` contains run-local raw/optimized candidates, reports, and rollback data.
- After each successful generation/determinism command, retain only the three newest staging runs.
- Static preview history is not part of the pipeline and must not be regenerated.
- `generated/reports/asset-manifest.json` and `public/assets/models/asset-manifest.json` describe published truth.
- `generated/reports/asset_budget_report.json` describes the latest published generation quality state.
- Partial publishes merge selected assets and preserve all unselected manifest assets. Full-catalog publication alone may remove stale manifest-owned files.
- Manifest `aggregateBytes` reports the complete on-demand asset library; it is
  not the initial playable download. `downloadBudgetBytes` gates the code bundle
  through `tools/ci/check-download-budget.mjs`, while that same check applies the
  separate committed total-`dist` ratchet. Asset admission enforces each
  catalog asset's own geometry, material and texture contracts without comparing
  the full library to the code-only budget.

Do not paste full reports or logs into the task. Report only selected asset IDs, integration point, the mechanical result, actionable error excerpts if any, save impact, and `Awaiting human game review`.

---

# 7. Geometry, Materials, and Performance Minimums

Follow the relevant Art Bible section. The compact non-negotiables are:

- premium cozy, warm tactile, faceted low-poly coastal identity;
- silhouette → primary mass → secondary structure → sparse tertiary detail;
- controlled asymmetry and broad authored planes, not untouched primitives or noisy micro-detail;
- approved palette tokens and shared matte/satin material families;
- intentional hard/faceted/selective-smooth shading;
- no photoreal scans as final albedo, plastic gloss, toon/ink outlines, local exposure hacks, or beauty-camera dependencies. Processed CC0 ground supporting maps remain under Art Pipeline section 6.2 and must remap into palette families;
- collision proxies and pivots serve gameplay placement;
- LOD preserves silhouette, color blocks, and major planes;
- triangle/material/texture limits come from the catalog, Art Bible, and machine budgets;
- optimize invisible geometry/material duplication before weakening hero silhouettes.

---

# 8. Token-Conscious Agent Rules

- Use one agent for routine asset work; do not spawn parallel review agents.
- Batch related assets by family when they share the same generator context.
- Use fast/lower-reasoning models for parameter changes, generation, placement, and requested visual adjustments. Reserve high reasoning for new generator architecture or difficult failures.
- The human should send revision feedback as `asset ID + observed problem + desired change`; do not restate the entire pipeline.
- Never run a command without `--asset`, `--family`, or explicit release `--all`.
- Avoid full catalog dumps, full command logs, manifest pastes, and repeated canonical summaries.
- Never hand-copy asset counts, below-target lists, report dates, or hashes into Markdown. Cite `generated/reports/asset_budget_report.json` and the command that regenerates it.

---

# 9. Completion Contract

Routine handoff:

```text
Assets: <selected IDs>
Integration: <game/runtime location>
Mechanical generation: passed/failed
Runtime TypeScript check: passed/not required/failed
Save impact: no (unless explicitly changed)
Docs updated: <paths, or `none — no documented fact changed`>
Narrative role: <none or concise practical/story function>
Visual status: Awaiting human game review
```

Shared-generator and release tasks additionally report only the heavier gates actually run and any actionable failures.
