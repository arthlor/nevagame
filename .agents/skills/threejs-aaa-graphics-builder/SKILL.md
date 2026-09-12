---
name: threejs-aaa-graphics-builder
description: "Improve authored Three.js visuals when the user requests a graphics pass or identifies weak form, composition, materials or lighting. Scope the pass to the named surfaces. Not for new-game orchestration, provider generation, or a single known technical defect."
---

# Three.js AAA Graphics Builder

- **Stack contract.** Retain the project's renderer backend, asset loader and resource owners.
- **Scope and evidence.** Follow `../CONVENTIONS.md` and repository `AGENTS.md`.

Use the current art brief and actual gameplay view to identify the strongest
visible mismatch. In Neva, `04` owns appearance, Art Pipeline owns implementation,
and `BLENDER.md` owns catalog production. Their contracts take precedence over
generic examples. Premium quality can be achieved with authored procedural work;
external generation is optional and requires an explicit human request.

## Workflow

1. Inspect the affected scene or asset at the intended camera and supported
   viewport. Determine whether the miss is form, composition, material, lighting,
   motion, readability or cost; use the established intent rather than inventing
   a new style brief for each edit.
2. Trace that cause to its owner and select the relevant reference below. Reuse
   existing materials, generators, diagnostics and render configuration.
3. Improve the named surfaces in coherent passes. Authored form and spacing
   usually precede material/light refinement. Add effects only for a clear
   visual or gameplay purpose; do not fill the scene to meet a density score.
4. Inspect the changed result and correct observable defects within scope. Use
   motion, multiple angles, tier checks or measurements when needed to resolve
   uncertainty. Follow `03` §4 for the required checks and stop repeating them
   once they support the result.
5. Report what visibly improved, the evidence, material tradeoffs and remaining
   gaps. Human visual approval and release certification remain separate.

## Reference selection

Read the selected sections and example source before adapting a technique:

- [implementation-blueprint.md](references/implementation-blueprint.md): broad
  graphics ownership or missing shared architecture; reuse Neva's existing owners.
- [model-recipes.md](references/model-recipes.md) and
  [procedural-model-quality.md](references/checklists/procedural-model-quality.md):
  silhouette and construction vocabulary for affected models.
- [render-recipes.md](references/render-recipes.md) and
  [material-lighting-quality.md](references/checklists/material-lighting-quality.md):
  lighting and material response.
- [shader-cookbook.md](references/shader-cookbook.md): relevant shader patterns;
  verify compatibility and tune to the brief rather than copying fixed values.
- [technical-art.md](references/technical-art.md),
  [technical-art-quality.md](references/checklists/technical-art-quality.md) and
  [performance-safe-visual-detail.md](references/checklists/performance-safe-visual-detail.md):
  resource, LOD, batching or rendering-cost decisions.
- [visual-scorecard.md](references/visual-scorecard.md),
  [aaa-visual-scorecard.md](references/checklists/aaa-visual-scorecard.md) and
  [aaa-game-quality-gate.md](references/checklists/aaa-game-quality-gate.md): optional
  critique prompts, not numeric gates or permission to expand the task.
- [prompt-templates.md](references/prompt-templates.md): only for reusable prompts.

No reference ledger, provider-output quota, automatic reviewer delegation or
all-reference preload is required. Neva's `04` §19 owns visual acceptance.
