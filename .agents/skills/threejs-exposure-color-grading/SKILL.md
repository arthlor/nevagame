---
name: threejs-exposure-color-grading
description: "Build a measured exposure and grading path in Three.js. Use for luminance metering, log-average exposure, asymmetric adaptation, single tone-map ownership, and 3D LUT grading. Not for bloom."
---

# Exposure and Color Grading

- **Runtime contract.** Backend: WebGL2 (`WebGLRenderer`) — no `three/webgpu` dependency. Min three: verify the installed `three` before adapting. Fallback: n/a. Post chain is WebGL2 unless the project owns a WebGPU post graph. Verified: skill pack 2026-09.
- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.

Treat exposure, tone mapping, grading, and output conversion as distinct stages. Tune them from measured HDR signal, not by stacking compensating color operations.

## Order

```text
HDR scene
  → luminance meter
  → adapted exposure
  → tone map
  → creative grade / 3D LUT
  → final output conversion
```

Read [references/scene-referred-color-pipeline.md](references/scene-referred-color-pipeline.md)
for the exact 64x36 meter, encoded readback, adaptation constants, 32-cube LUT,
and signal-ownership ambiguities.

## Invariants and strong defaults

Use these checks for the affected mechanism. Preserve concrete ownership, correctness and reproducibility contracts; adapt stylistic and tuning defaults to the brief (`../CONVENTIONS.md`).

- tone mapping occurs in both materials and post;
- exposure is used to repair physically inconsistent light ratios;
- meter weighting and scene framing are not inspected;
- adaptation speed is the same toward light and dark;
- LUT input/output spaces are undocumented;
- sRGB encoding happens twice;
- a display-domain LUT is moved before tone mapping without being rebuilt.

## Deliverable

- Inputs: HDR scene, intended exposure range, and the grade direction.
- Artifacts: meter target, adaptation constants, generated LUT, and before/after captures.
- Acceptance: tone mapping happens once; sRGB encodes once; LUT input/output spaces are documented and verified.

## Routing boundary

Use `$threejs-bloom` for HDR glow contribution and
`$threejs-image-pipeline` when this color path must share ownership with AO,
atmosphere, or effect-local render targets.
