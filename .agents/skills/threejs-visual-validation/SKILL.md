---
name: threejs-visual-validation
description: "Validate advanced Three.js graphics as authored systems. Use for fixed-view visual contracts, field and pass diagnostics, no-post baselines, seed sweeps, camera-scale tests, temporal stability, and GPU budgets. Not for supplying the implementation."
---

# Visual Validation

- **Stack contract.** Backend-agnostic protocol; record renderer, backend, build mode, seed, and camera with every capture.
- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.

Evaluate the mechanism that creates the image. A beautiful hero screenshot can hide unstable fields, broken depth, seed failures, or post-processing dependence.

## Select evidence for the changed mechanism

Begin with the intended result and most plausible failure. Use the relevant
parts of [references/graphics-validation-protocol.md](references/graphics-validation-protocol.md):

- fixed inputs and camera for reproducible comparisons;
- an isolation/no-post view when compositing or post-processing obscures the cause;
- field/pass diagnostics when a mechanism or shared owner needs proof;
- camera-distance or seed coverage when those inputs affect the changed result;
- motion checks for temporal claims;
- resource measurements when making performance claims.

Reuse existing inspection controls. Add a diagnostic only when needed to answer
a concrete unresolved question; no universal mosaic, stress-seed sweep, capture
package or new inspection UI is required. Neva's `03` §4 defines task gates and
`04` §19 owns visual acceptance. Report the relevant evidence and exact gaps;
agent inspection does not grant human approval.

## Invariants and strong defaults

Use these checks for the affected mechanism. Preserve concrete ownership, correctness and reproducibility contracts; adapt stylistic and tuning defaults to the brief (`../CONVENTIONS.md`).

- a motion, multi-view or stability claim relies on a single frame;
- a compositing defect cannot be isolated with available diagnostics;
- a claimed deterministic comparison cannot reproduce its inputs;
- GPU time is inferred only from CPU frame time;
- temporal artifacts are judged from still images;
- comparison thresholds ignore intentional stochastic pixels without stabilizing them.

## Routing boundary

This skill evaluates an implementation; it does not supply the implementation
mechanism. Read the owning implementation and use its specialist when technical
guidance is needed, then select the evidence this protocol contributes.
