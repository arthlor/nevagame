---
name: threejs-bloom
description: "Implement production bloom in Three.js. Use for HDR signal ordering, threshold and radius calibration, selective bloom with material restoration, and scene-relative emissive hierarchy. Not for exposure, tone mapping, or LUTs."
---

# Bloom

- **Runtime contract.** Backend: WebGL2 (`WebGLRenderer`) — no `three/webgpu` dependency. Min three: verify the installed `three` before adapting. Fallback: n/a. Post chain is WebGL2 (`EffectComposer`/`postprocessing`); WebGPU bloom nodes vary by build. Verified: skill pack 2026-09.
- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.

Bloom is a camera/display response to bright HDR signal. Establish scene exposure and emissive luminance before tuning blur.

## Workflow

1. Inspect pre-tone-map luminance.
2. Choose which scene values should bloom.
3. Choose a single-node or dual selective-render ownership model.
4. Calibrate threshold, radius, smooth width, and strength in HDR.
5. Restore all substituted materials transactionally for selective passes.
6. Composite before exposure/tone mapping.
7. Validate base, contribution, and final views.

Read [references/hdr-bloom-system.md](references/hdr-bloom-system.md) for the
HDR ordering, dual selective-bloom transaction, compact emissive hierarchy,
and the costs and limits of each ownership model.

Apply the material substitution/restoration ownership pattern in the
reference before adding selective bloom to a composed scene.

## Invariants and strong defaults

Use these checks for the affected mechanism. Preserve concrete ownership, correctness and reproducibility contracts; adapt stylistic and tuning defaults to the brief (`../CONVENTIONS.md`).

- bloom creates the only visible form of an effect;
- all bright materials share one arbitrary emission multiplier;
- threshold is tuned after tone mapping;
- selective bloom requires mutating scene materials every frame without restoration guarantees;
- transparent particles disappear from extraction because pass ownership is unclear;
- bloom radius changes wildly with resolution;
- highlights become gray because energy is clamped too early.

## Deliverable

- Inputs: HDR scene values, tone-map ownership, and the list of intended emitters.
- Artifacts: extraction threshold/radius/strength, selective material ledger, and base/contribution/final captures.
- Acceptance: the base stays legible with bloom off; contribution only affects intended emitters; highlights do not clamp to gray.

## Routing boundary

Use `$threejs-exposure-color-grading` for metering, adaptation, tone mapping,
and LUTs. Load `$threejs-image-pipeline` only when bloom must be composed with
several shared image-space systems. A per-pixel ray integrator that owns its own
reduced-resolution target and accumulation history keeps its bloom internal;
route that to `$threejs-raymarched-space-effects`.
