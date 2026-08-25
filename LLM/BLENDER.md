# BLENDER.md
## Neva — Lean Blender Production Rules for LLM Agents

> **Role:** Operational authority for catalog-driven Blender generation, GLB validation, publication, Art Yard handoff, and runtime integration.
>
> **Human/agent boundary:** Agents generate and mechanically integrate assets. The human reviews the result in the actual game and requests revisions. Routine agents do not create static previews, capture screenshots, score style, or iterate visually on the human's behalf.

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
- renderer/material/lighting/water: `01`, Art Bible, and Art Pipeline;
- gameplay contract or persistence: `01` + `02` and the owning gameplay/runtime files;
- release/gold slice: `01`, `02`, Art Bible, Art Pipeline, Roadmap, this file, README, and relevant machine contracts.

Conflict priority remains: human instruction → `01` → `02` → Art Bible → Art Pipeline → this file → machine owner for its fields → Roadmap → implementation → assumption.

---

# 1. Daily Asset Workflow

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

## Release or gold-slice gate

```bash
npm run art:generate:strict -- --all
npm run art:validate -- --all
npm run art:benchmark
```

Release screenshots are evidence artifacts. Do not spend AI tokens reviewing or iterating on them unless the human explicitly requests visual analysis.

---

# 3. Single Source and Runtime Contract

- `assets/specs/asset-catalog.json` owns asset IDs, files, family/generator, seed, dimensions, palette, budgets, pivot, collision, instancing, LOD, required nodes, read distance, parameters, optional reference authoring, and character contracts.
- `asset-catalog.schema.json` owns the accepted shape. Do not add parallel YAML, filename lists, per-family specs, or alternate exporters.
- `art/palettes/neva.palette.json` owns production tokens and material properties.
- `tools/blender/asset_budgets.json` owns scene and texture envelopes.
- `generators/registry.py` is the only generator dispatch table. Family composition stays in its owning module; reusable deterministic mid-scale construction may live in `common/authored.py`.
- Runtime static assets are optimized GLB/glTF 2.0 only. Never load `.blend`, `.fbx`, or `.obj` in the game.
- `1 Blender unit = 1 meter`; use Y-up export, applied transforms, stable nodes, deliberate pivots, palette materials, and `COLOR_0`.
- Simulation owns gameplay truth. Catalog metadata, scene nodes, collision debug meshes, animations, and Three.js objects remain presentation/runtime data.

Same catalog seed + parameters + generator code must reproduce the same semantic asset. Use seeded bounded variation; never uncontrolled RGB, random material assignment, or `Math.random()`-style nondeterminism.

---

# 4. Reference-Guided Assets

`referenceAuthoring` is required when supplied images, generated studies, turnarounds, or reconstruction evidence guide the asset. It is not required for ordinary catalog-driven edits without such evidence.

- Keep the brief in the selected catalog entry; do not create a second spec tree.
- Preserve source roles, component hierarchy, silhouette/negative space, hidden-surface confidence, critical features, generator bindings, failure modes, and requested review views.
- Run `art:brief` only when that selected brief changes.
- Read or emit only the selected asset's brief; do not load unrelated briefs.
- The required views describe what the human can inspect through Art Yard/game controls. They do not require static renders or agent screenshot capture.
- `ready` means the brief is structurally complete, not visually approved.

---

# 5. Art Yard and Runtime Integration

`/__neva_art_yard` is the only asset-review surface. It uses the canonical runtime catalog, `AssetLoader`, `VisualRenderConfig`, `PaletteMaterials`, and `LightingRig` and remains development-only.

- A successful selected publish makes the asset available automatically.
- `?asset=<catalog-id>` opens the selected asset directly.
- Orbit, distance/LOD, wireframe, bounds, collision, animation, lighting, weather, ground, and water controls remain diagnostics for the human.
- The normal game is the final visual judge. Integrate the catalog ID through the existing loader/placement/batching path; do not create a direct loader or local asset registry.
- Compatible repeated static assets use the existing batching/instancing path. Do not fold skinned, morph-target, dynamic, or LOD descendants into static batching.

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

Do not paste full reports or logs into the task. Report only selected asset IDs, integration point, the mechanical result, actionable error excerpts if any, save impact, and `Awaiting human game review`.

---

# 7. Geometry, Materials, and Performance Minimums

Follow the relevant Art Bible section. The compact non-negotiables are:

- premium cozy, warm tactile, faceted low-poly coastal identity;
- silhouette → primary mass → secondary structure → sparse tertiary detail;
- controlled asymmetry and broad authored planes, not untouched primitives or noisy micro-detail;
- approved palette tokens and shared matte/satin material families;
- intentional hard/faceted/selective-smooth shading;
- no photoreal scans, plastic gloss, toon/ink outlines, local exposure hacks, or beauty-camera dependencies;
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

---

# 9. Completion Contract

Routine handoff:

```text
Assets: <selected IDs>
Integration: <game/runtime location>
Mechanical generation: passed/failed
Runtime TypeScript check: passed/not required/failed
Save impact: no (unless explicitly changed)
Visual status: Awaiting human game review
```

Shared-generator and release tasks additionally report only the heavier gates actually run and any actionable failures.
