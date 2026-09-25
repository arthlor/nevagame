# ASSET_PRODUCTION.md
## Neva — Lean Asset Production Rules for LLM Agents

> **Role:** Operational authority for catalog-driven asset production, GLB validation, publication, Art Yard handoff, and runtime integration.
>
> **Producers:** Every catalog asset has exactly one producer, decided by its `generator`, and the art CLI (`tools/art/cli.mjs`, Node only) sends both build producers through the same validation, optimisation, cache, publication and determinism gates:
>
> - **Authored Three.js generators** (`tools/authored/`, see its README) are the main asset generation system: TypeScript factories on the shared kit, registered in `tools/authored/generators/registry.ts` with a parameter contract in `contracts.json`.
> - **Authored GLBs** (`generator: "authored_glb"`) publish a committed source GLB named by `parameters.sourceGlb`: a Tripo generation, another provider download, a photo-reconstructed building exported by `tools/authored/export.mjs`, or an adapted derivative.
> - **Frozen legacy assets** belong to families whose Blender generators were retired (`tools/art/legacy-generators.json`). Their published GLB is the record: `art:validate` and `art:sync` keep checking it, but nothing rebuilds it. To change one, port its family to an authored generator or replace the asset with an `authored_glb` source.
>
> There is no Blender or Python step in production. `art:list` prints each selected asset's producer.
>
> **Inspection and approval:** Agents generate, integrate, and inspect affected assets in the Art Yard and actual game, correcting observed defects within the authorized scope. Use focused screenshots, motion checks or diagnostic views when they answer a visual question. Human visual approval remains a separate decision; agent inspection and mechanical success do not grant it.

> **Harbor-coast evidence:** The approved coastal rebuild requires reference-frame inspection, iterative gameplay-camera captures, traversal recordings and browser measurements under `04` §8.1. These task-specific requirements exceed routine focused inspection and do not constitute human visual approval.

---

# 0. Task-Class Read Order

Root `AGENTS.md` owns the task/read table and conflict procedure. Use its
asset, shared-helper, renderer, gameplay/persistence or release route as
appropriate. This file owns the production sequence after routing, not a
second hierarchy. Read selected catalog entries and their direct generator
helpers in full; do not dump the full catalog for one asset.

---

# 1. Daily Asset Workflow

Folder dumps (`@LLM`, `@tools`) do not change this routing. First files to **obey**: root `AGENTS.md`, this file, `tools/authored/README.md`, the selected catalog entry, the owning generator (or committed source GLB), the isolated sheet if present, and the relevant Art Bible section. Other attached files are for conflict resolution only. Leave `02` and ArcheAge unread for generate-asset prompts even if `@LLM` attached them.

**Generate assets** in this repo always means: resolve or add catalog ID(s) → registered authored generator (port a frozen family before changing it) → measure isolated-sheet identity into `parameters` when a sheet exists → `npm run art:brief -- --asset` only if that brief changed → `npm run art:generate -- --asset` → integrate → focused Art Yard/game inspection and scoped corrections → Art Yard link → `Awaiting human game review`. The upstream graphics skills do not define asset generation. Provider APIs (Tripo/Gemini/ElevenLabs) still need an explicit human request. If the named subject is missing from the catalog, add one catalog entry and extend (or port and extend) the owning family generator; do not publish a one-off GLB. A GLB the human supplies (for example a Tripo generation) enters only as a committed `authored_glb` source with its own catalog entry (§3.2), never by copying it into `public/`. Ground supporting maps are not generate-asset work: do not add catalog IDs for them or run `art:generate`.

Isolated studio sheets are style-match evidence for the mapped catalog ID. Numbered crop/diorama PNGs in `tools/art/references/README.md` are graphics-only extracts from `art-reference.png`; do not copy their camera, staging, or pixels. `art/references/neva-ui-hud-on-foot.png` is the scoped gameplay-distance graphics benchmark for starter-farm terrain, worked-earth paths, meadow flowers/foliage, crop-bed presentation, and clear-day lighting; it never authorizes copying camera, UI, layout, depth of field, tilt-shift, or composition. The later grass study selected in Art Bible §7.2.4 owns continuous meadow coverage and fine-blade proportions. Catalog IDs win if a reference README drifts (`prop_wagon_cart_a`, not `vehicle_horse_cart_a`).

Sculpt in passes, using focused inspection where it resolves form or readability: blockout (primary masses and negative space vs the isolated sheet) → structure (masonry, timber, shingles, openings) → sparse tertiary readable at 8 m → palette + vertex value on the existing `COLOR_0` path. Human revision remains `asset ID + observed miss + desired change`.

Codex skill route for this prompt: use `.agents/skills/threejs-procedural-geometry/SKILL.md` as technique guidance, then consult its `references/geometry-craft-workflow.md` and `references/geometry-quality-gates.md` only when relevant. For a broad visual pass, use `.agents/skills/threejs-skill-router/SKILL.md` and load the smallest relevant specialists. The catalog, isolated sheet and owning generator still decide Neva asset production; implement in the registered authored generator and `tools/authored/kit/`. When the asset is frozen, port its family first (faithfully where it already reads well, redesigned where it reads weakly; `tools/authored/README.md` owns the porting steps). This pack has no provider-generation or release agent; provider calls need explicit human authorization, and release checks follow `03`.

The everyday route is:

```text
selected catalog entry
→ reference brief only when image/study guided
→ owning registered generator, or committed authored GLB source
→ selected generate + validation + optimization + atomic publish
→ automatic Art Yard entry
→ runtime/game integration
→ focused Art Yard/game inspection and scoped corrections
→ human game review
```

Commands always require an explicit selector. A bare generation command must fail rather than regenerate the full catalog.
`art:brief` is reference-guided only: it accepts selected assets/families whose
catalog entries contain `referenceAuthoring` and rejects `--all` (or a mixed
selection) before emitting a partial brief. A selection that names a frozen
asset explicitly fails `generate` and `determinism`; a family or `--all`
selection skips frozen members and says how many it skipped.

```bash
# Only when the selected referenceAuthoring brief changed
npm run art:brief -- --asset prop_water_well_a

# Normal selected generation and publication
npm run art:generate -- --asset prop_water_well_a

# Related assets may be batched by family
npm run art:generate -- --family prop

# Which producer owns each selected asset
npm run art:list -- --family character
```

After publication, the CLI prints a direct development link such as:

```text
http://localhost:3000/__neva_art_yard?asset=prop_water_well_a
```

Integrate the asset and inspect the changed appearance or motion through the existing Art Yard/game controls, including its gameplay read distance. Correct observed defects within scope. If the runtime cannot be accessed, report that inspection gap precisely and complete independent mechanical work. Complete the handoff with `Awaiting human game review`; do not invent another approval loop.

## Daily gates

Keep:

- closed catalog/schema validation;
- selected reference-authoring validation when present;
- palette and generator-parameter validation;
- deterministic catalog seed and stable ID/name contracts;
- the authored producer's semantic art contract (`tools/authored/README.md`), or the authored-GLB producer's admission checks (§3.2);
- raw Khronos GLB validation;
- glTF Transform dedupe/join/prune/weld + Meshopt (or the authored-GLB packaging mode, §3.2);
- optimized Khronos and semantic revalidation;
- dimensions, bounds, pivot, required nodes, collision, LOD, animation, material, texture and triangle min/max checks;
- validated cache reuse;
- rollback-capable atomic publication and generated/public hash parity;
- runtime integration and focused inspection of changed appearance or motion; TypeScript check only when runtime TypeScript changed.

The following are not routine requirements; use them only when the task or an unresolved concern warrants them:

- generated preview packages;
- strict density gates or determinism double-generation;
- gameplay benchmarks, full capture sets, full builds or broad test suites.

Do not introduce numeric style scoring as an asset gate. Human visual approval remains required for visual acceptance.

---

# 2. Shared Generator and Release Gates

## Shared kit or pipeline change

1. Identify every affected catalog asset (every consumer of the changed kit module, or every asset when the CLI, `glb.mjs`, `optimize.mjs` or `surface_contract.mjs` changed).
2. No-publish generate the affected family or explicit asset union.
3. Run the authored-kit and pipeline tests when shared construction or packaging changed.
4. Run semantic determinism for the affected family only.
5. Publish the affected family once mechanical checks pass.

```bash
npm run art:generate -- --family prop --no-publish
npx vitest run tests/unit/authoredKit.test.ts tests/unit/authoredPipeline.test.ts tests/unit/authoredGlb.test.ts
npm run art:test
npm run art:determinism -- --family prop
npm run art:generate -- --family prop
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

The benchmark rejects browser errors and enforces its machine-owned preferred
scene limits. It runs against the
Vite DEV server; layout-editor picking intentionally keeps static prefabs
unmerged and omits the baked static-shadow proxy. Therefore DEV measurements
are diagnostic rather than production-equivalent proof, and a current
over-budget DEV result must remain visible instead of being addressed by
relaxing `tools/art/asset_budgets.json`.

## Technical-art certification or release gate

```bash
npm run art:generate:strict -- --all
npm run art:validate -- --all
npm run art:determinism -- --all
npm run art:benchmark
```

`--all` builds every authored and authored-GLB asset; frozen assets are
covered by `art:validate`, which checks all of them. `art:generate:strict`
rejects below-target candidates before publication; normal generation may
publish that quality debt. Do not pad invisible geometry to reach a target. If
an approved asset makes its target inappropriate, propose a catalog
reassessment with silhouette, deformation and measured cost evidence; existing
strict semantics remain in force until a scoped change is authorized.

These commands establish different evidence: strict generation/publication,
published validation, determinism and DEV render diagnostics. Production
performance uses `npm run test:budget` and, where world scope requires it,
`npm run world:acceptance`. `03` §4 defines those lanes. Human visual approval
does not close technical certification; current results belong in the status
checklist, not a hardcoded open/closed claim here.

Inspect required release screenshots as evidence and investigate visible discrepancies. Correct defects within the authorized scope, rerunning the affected checks when inputs change. A capture alone is not human visual approval or performance proof.

---

# 3. Single Source and Runtime Contract

- `assets/specs/asset-catalog.json` owns asset IDs, files, family/generator, seed, dimensions, palette, budgets, pivot, collision, instancing, LOD, required nodes, read distance, parameters, optional reference authoring, and character contracts.
- `asset-catalog.schema.json` owns the accepted shape. Do not add parallel YAML, filename lists, per-family specs, or alternate exporters.
- `art/palettes/neva.palette.json` owns production tokens and material properties.
- `tools/art/asset_budgets.json` owns scene and texture envelopes.
- `tools/authored/generators/registry.ts` is the only generator dispatch table, `contracts.json` its parameter contracts, and `tools/art/legacy-generators.json` the recorded parameter contracts of the frozen families. A generator name belongs to exactly one of them; the CLI refuses a dual registration.
- Runtime static 3D assets are optimized GLB/glTF 2.0 only. Never load `.blend`, `.fbx`, or `.obj` in the game, and never load a GLB outside the catalog: every runtime model, including the Tripo cast, goes through `AssetLoader` by catalog ID. Ground supporting maps are the documented non-GLB exception: local processed WebPs under `public/assets/textures/terrain/`, loaded only through `ExternalSurfaceTextures`, never through `art:generate` or a catalog ID.
- glTF space is metres, +Y up, front +Z; use stable node names, deliberate pivots, palette materials, and `COLOR_0` on every untextured primitive.
- Simulation owns gameplay truth. Catalog metadata, scene nodes, collision debug meshes, animations, and Three.js objects remain presentation/runtime data.

Same catalog seed + parameters + generator code must reproduce the same semantic asset; an authored GLB reproduces from the same source bytes and `textureMaxSize`. Use seeded bounded variation; never uncontrolled RGB, random material assignment, or `Math.random()`-style nondeterminism.

`art:validate` checks the catalog schema, generator-parameter contracts,
LOD/animation/reference contracts, source provenance, and published GLB
metrics for every selected asset, frozen ones included. It does not run family
generators or prove authored geometry semantics beyond the exported artifact
contract.

## 3.1 Procedural skinned creatures

Every fauna and fish asset except the cow and the Tripo donkey and draft horse
(authored GLBs) is a procedural skinned creature: one continuous surface per
LOD bound to an armature authored in its generator, never a pile of primitives
rotating on empties. The authored kit (`tools/authored/kit/rig.ts`,
`clips.ts`, `lod.ts`) owns construction; `tools/authored/README.md` owns its
rules.

- **Weighting.** Weight each authored part only to the bones that drive it.
  Nearest-bone weighting across a whole surface lets a limb bone that passes
  through the body capture the flank. Weights are solved deterministically in
  code.
- **Node contract.** Every pivot node named in `requiredNodes` stays at its
  historic location, because `WorldScene` resolves them by name.
  Gameplay-facing sockets and grips stay on object-animated nodes. A fish's
  head bone is never keyed, so the mouth stays on `<id>_mouth_hook`, which the
  fishing line follows.
- **Clips.** Each catalog clip is exactly one glTF animation with the catalog
  name and duration. Clips the runtime plays together, such as the gull's
  `flap` and `glide`, must target disjoint transforms.
- **Validation.** Khronos `NODE_SKINNED_MESH_NON_ROOT` is accepted only when
  `validateGlb` proves every ancestor of every skinned mesh is an identity
  transform. `AssetLoader` gives any skinned asset the conservative culling
  envelope, and `tests/unit/characterCullingBounds.test.ts` holds every exported
  fauna and fish pose inside it. `surface_contract.mjs` checks every decoded
  primitive's skin weights, deformation and loop endpoints on all LODs for
  `surfaceAuthoring` assets and animated authored GLBs (`npm run art:test`
  covers the checker itself).

## 3.2 Authored GLB sources

Use `generator: "authored_glb"` for a model whose authored form is a GLB
rather than generator code: an explicitly requested provider generation
(Tripo), a CC0/CC-BY provider model, a photo-reconstructed building exported
by `tools/authored/export.mjs`, or a retained adapted derivative. Its
`parameters` are exactly:

- `sourceGlb` — a repository-relative GLB under `art/` (`art/imported/<provider>/…`
  or `art/authored/<model>/export/…`). The CLI rejects sources outside the
  repository or inside `public/`, `generated/` or other published trees.
- `textureMaxSize` — `256`, `512`, `1024` or `2048`: the largest embedded
  texture edge the published file may carry.

The catalog entry carries the same identity, dimensions, pivot, palette,
budget, required nodes, collision, LOD and animation contracts as any other
asset. Commit the source unchanged; the producer, not a hand edit, normalizes
it:

1. **Normalize** (`tools/art/glb.mjs`, byte-level on the GLB's own JSON and
   binary chunk, so node order, names, skins, clips and extras stay as
   authored): recompute declared accessor `min`/`max` from the data (Tripo
   rounds them, which Khronos rejects); drop provider material extensions the
   palette owns (`KHR_materials_specular`, `KHR_materials_volume`, and a
   zero-effect `KHR_materials_emissive_strength`); resample embedded textures
   larger than `textureMaxSize` and re-encode them as WebP
   (`EXT_texture_webp`), leaving textures within the cap byte-identical.
   Geometry bytes are never rewritten here, and a source that needs nothing
   is published from its own bytes.
2. **Admit**: exactly one node per required name, every mesh under the
   catalog root, rest bounds within 0.25–1.35× the catalog dimensions on each
   axis, and for a `ground_center` pivot a lowest point no deeper than a tenth
   of the height (a seated foundation) and no higher than a twentieth (a
   removed ground sheet), each with a small absolute floor.
3. **Package** by what the source is: a source already carrying
   `EXT_meshopt_compression` keeps its geometry bytes; a skinned or animated
   source gets lossless Meshopt with decoded parity (no quantize, reorder,
   join, weld or skin reconstruction); a static source gets the full
   dedupe/prune/weld/quantize/Meshopt optimisation.
4. **Validate** like every asset, with the authored-GLB material profile: a
   textured primitive needs `TEXCOORD_0` instead of `COLOR_0`; an untextured
   primitive needs `COLOR_0` and a material named for a declared palette
   token; images must fit `textureMaxSize`; double-sided materials remain the
   source's decision; `COL_*` collision meshes are exempt from the colour
   rule. An authored GLB may declare an empty palette only when every
   primitive is textured. `surfaceAuthoring` is rejected: the source owns its
   normals and colours.

The cache keys an authored GLB on its source bytes, so replacing the source
at the same path rebuilds it. Source authoring owns valid bind transforms,
normalized weights, target-compatible motion and LOD deformation; packaging
cannot repair them.

**Provenance.** A provider-derived asset declares `sourceProvenance`
(provider/model identity, author, source and licence URLs, supported licence,
attribution, and `sourceFile` + `sourceSha256`). The CLI verifies the licence
URL, the provider's identity format and the `sourceFile` digest; update the
digest only after verifying that source. Tripo provenance uses provider
`tripo`, licence `Tripo-Terms`, `https://www.tripo3d.ai/` and the generation
UUID as `modelId`; rights follow the generating account's Tripo plan. These
authoring fields stay out of the runtime catalog projection; retain any
required attribution in the game's credits before shipping a CC-BY
derivative.

**Characters.** A character authored GLB with catalog `animationClips` must
also declare `rigNode` and `socketNodes`, and its clips pass the same
per-clip duration and node checks. Catalog `humanoidRig` owns semantic source
names, bind-space endpoints, sole/palm frames and bend directions for the
contracted humanoids; after a rig changes, re-extract its legs/arms with
`node tools/art/extract_humanoid_binding.mjs` from the published GLB. A
static provider figure (the Tripo townsfolk) declares no clips; the runtime
scales it by the factor `WorldScene` owns.

**Retained adapted derivatives.** The adapted player, Quaternius/Poly Pizza
NPCs, cow, donkey, draft horse, galleon and Tripo cottage were prepared by
retired Blender adapters. Their exported derivatives are the committed
sources under `art/imported/<provider>/adapted/`; the adapter `.blend`
libraries stay beside them as provenance (`sourceFile`), and the untouched
provider downloads under `sources/`. Changing one of these assets means
producing a new derivative GLB with the tool of the human's choice, committing
it at the same path, and running the selected `art:generate`.

**Photo-reconstructed buildings.** `npm run art:authored` rebuilds these
buildings' committed exports in headless Chromium (their factories paint
canvas textures, which the export bakes into palette `COLOR_0`) and then
publishes them through `art:generate`; `--no-publish` stops at the committed
source. It never copies a GLB into `public/` itself.

---

# 4. Reference-Guided Assets

`referenceAuthoring` is required when supplied images, generated studies, turnarounds, or reconstruction evidence guide the asset. It is not required for ordinary catalog-driven edits without such evidence.

- Keep the brief in the selected catalog entry; do not create a second spec tree.
- Preserve source roles, component hierarchy, silhouette/negative space, hidden-surface confidence, critical features, generator bindings, failure modes, and requested review views.
- Run `art:brief` only when that selected brief changes.
- Read or emit only the selected asset's brief; do not load unrelated briefs.
- The required views define review coverage through Art Yard/game controls. Agents use the views relevant to the changed form, hidden surfaces or motion; human acceptance retains the full applicable coverage. Routine work does not require a static-render package or capture of every view.
- `ready` means the brief is structurally complete, not visually approved. Missing `repo://` files fail closed.
- A brief on a frozen asset remains the evidence for its port; its generator bindings name the frozen family's recorded parameters until the port replaces them.
- Isolated studio sheets under `tools/art/references/isolated/` may inform that one asset's silhouette, proportions, component counts, and construction language. Diorama stills remain graphics-only. `art/references/neva-ui-hud-on-foot.png` may guide the cataloged environment assets named by the Art Bible benchmark lock, but each image-guided asset still requires its own closed `referenceAuthoring` brief and parameter bindings.
- Pass order for sheet-guided work: blockout → structure → sparse tertiary → palette. Use focused visual checks as needed; do not add a daily full screenshot or SSIM gate.
- Human revision remains `asset ID + observed miss + desired change`.

---

# 5. Art Yard and Runtime Integration

`/__neva_art_yard` and `/art-yard` provide the asset-review surface. It uses the canonical runtime catalog, `AssetLoader`, `VisualRenderConfig`, `PaletteMaterials`, and `LightingRig`, served via Vite in development and emitted as a static production route with pre-rendered catalog metrics for live deployment.

- A successful selected publish makes the asset available automatically.
- `?asset=<catalog-id>` opens the selected asset directly; `&live=1` builds an authored generator in the page instead of loading the published GLB.
- Character animation review automatically attaches the matching fishing, farming, carry, tailoring, toolmaking and equipment-inspection props through the same socket rules as the world. Runtime-context scrubbing also seeks the reel crank, so a paused hand and handle share the same phase. Static provider figures are reviewed as static models.
- Orbit, distance/LOD, eye POV (1.6m), shading (lit, unlit flat albedo, wire overlay, pure wire, vertex colors, normals, LOD0, LOD1), physical dimensions/clearance/footprint, authoring sockets, skeleton rig, origin axes tripod, bounds, collision, animation scrubbing/frame-stepping, lighting, weather, ground, and water controls support focused agent inspection and human review.
- Player context clips are previewed atomically with the required donkey, rowboat, or skiff companion and companion-inclusive bounds. Mounted gaits synchronize rider and animal phases; boarding/docking use the matching craft variant; `reel` layers over selectable on-foot, rowboat, or skiff bases. Timeline scrubbing seeks each action deterministically rather than changing mixer-global time.
- The normal game is the final visual judge. Integrate the catalog ID through the existing loader/placement/batching path; do not create a direct loader or local asset registry.
- Compatible repeated static assets use the existing batching/instancing path. Do not fold skinned, morph-target, or dynamic descendants into static batching. Production static LOD pieces use the existing per-instance level tracking and catalog switch distances; do not flatten them without preserving level selection. DEV keeps prefabs unmerged for layout-editor picking.
- For a story-relevant asset or zone, the integrated review also checks that its practical role and relationship to the current quest beat read at gameplay distance. This is visual/environmental evidence only; quest progression remains owned by simulation/content code.

Mechanical success permits the agent to say `generated`, `validated`, `published`, and `integrated` only when those gates passed. It does not permit `visually approved`, `final`, or `production-ready` before human game review.

---

# 6. Cache, Staging, Reports, and Retention

- `generated/.cache/art/` is disposable acceleration state keyed by asset/toolchain inputs (authored sources for generators, source bytes for authored GLBs). Keep it enabled and never publish from it without revalidation.
- `generated/.staging/run-*` contains run-local raw/optimized candidates, reports, and rollback data.
- After each successful generation/determinism command, retain only the three newest staging runs.
- Static preview history is not part of the pipeline and must not be regenerated.
- `public/assets/models/asset-manifest.json` (tracked) and its `generated/reports/asset-manifest.json` mirror describe published truth. A partial publish merges into the tracked public manifest, so a fresh clone without `generated/` publishes safely.
- `generated/reports/asset_budget_report.json` describes the latest published generation quality state.
- Partial publishes merge selected assets and preserve all unselected manifest assets. Full-catalog publication alone may remove stale manifest-owned files.
- Manifest `aggregateBytes` reports the complete on-demand asset library; it is
  not the initial playable download. `downloadBudgetBytes` gates the code bundle
  through `tools/ci/check-download-budget.mjs`, while that same check applies the
  separate committed total-`dist` ratchet. Asset admission enforces each
  catalog asset's own geometry, material and texture contracts without comparing
  the full library to the code-only budget.

Do not paste full reports or logs into the task. Report selected asset IDs, integration point, mechanical result, focused inspection evidence or access gap, actionable errors if any, save impact, `Docs updated:`, and `Awaiting human game review`.

---

# 7. Geometry, Materials, and Performance Minimums

Follow the relevant Art Bible section. The compact non-negotiables are:

- premium cozy, warm tactile, faceted low-poly coastal identity;
- silhouette → primary mass → secondary structure → sparse tertiary detail;
- controlled asymmetry and broad authored planes, not untouched primitives or noisy micro-detail;
- approved palette tokens and shared matte/satin material families;
- intentional hard/faceted/selective-smooth shading;
- no photoreal scans as final albedo, plastic gloss, toon/ink outlines, local exposure hacks, or beauty-camera dependencies. Processed CC0 ground supporting maps remain under Art Pipeline section 6.2 and must remap into palette families;
- provider textures stay within the asset's `textureMaxSize` and the Art Bible's texture targets; a larger cap needs a stated reason;
- collision proxies and pivots serve gameplay placement;
- LOD preserves silhouette, color blocks, and major planes;
- triangle/material/texture limits come from the catalog, Art Bible, and machine budgets;
- optimize invisible geometry/material duplication before weakening hero silhouettes.

---

# 8. Token-Conscious Agent Rules

- Use one agent for routine asset work; do not spawn parallel review agents.
- Batch related assets by family when they share the same generator context.
- Keep the user-selected model and reasoning settings. Reduce unnecessary work through focused context, cache reuse and scoped verification.
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
Inspection: <affected views/motion checked and result, or exact access gap>
Visual status: Awaiting human game review
```

Shared-kit, pipeline and release tasks additionally report only the heavier gates actually run and any actionable failures.
