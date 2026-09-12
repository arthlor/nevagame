---
name: threejs-procedural-animation
description: "Animate procedural object transform timelines in Three.js. Use for launch, staging, docking, spin, springs, rotating-frame alignment, debris, frame-rate-independent motion. Not for camera framing or particle VFX."
---

# Procedural Animation

- **Runtime contract.** Backend: WebGL2 (`WebGLRenderer`) — no `three/webgpu` dependency. Min three: verify the installed `three` before adapting. Fallback: n/a. Backend-agnostic transform math; examples run under either backend. Verified: skill pack 2026-09.
- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.

Animate semantic state, not unrelated transform curves. Define phases,
coordinate frames, velocities, and ownership before writing per-frame updates.

## Build order

1. Define the timeline phases and event boundaries.
2. Choose the frame for each motion: world, subject local, orbital radial,
   docking axis, or camera shot.
3. Derive target position/orientation from that frame.
4. Use analytic kinematics for authored travel and springs for responsive
   convergence.
5. Preserve world transforms when detaching children from a hierarchy.
6. Separate translation, alignment, spin, and secondary debris state.
7. Clamp integration delta and reset every state variable on replay/disposal.

Read [references/procedural-motion-and-docking-systems.md](references/procedural-motion-and-docking-systems.md)
for the launch, staging, docking, debris, spring, quaternion, and
frame-rate-independent response implementations.

## Invariants and strong defaults

Use these checks for the affected mechanism. Preserve concrete ownership, correctness and reproducibility contracts; adapt stylistic and tuning defaults to the brief (`../CONVENTIONS.md`).

- Use elapsed seconds and `deltaSeconds`; do not make motion frame-count based.
- Derive orientation from direction/frame, then apply roll or spin as a
  separate quaternion.
- Decompose docking error into axial and radial components.
- Switch from spring convergence to an exact terminal pose at the end of a
  sequence.
- When reparenting an animated object, capture world position, quaternion, and
  scale before removal.
- Use seeded randomness when motion must be reproducible.
- Keep visual shake in a bounded envelope and separate it from trajectory.

## Deliverable

- Inputs: timeline phases, coordinate frames, and target poses.
- Artifacts: phase table, per-phase frame, spring/kinematic constants, and replay reset behavior.
- Acceptance: motion is frame-rate independent; reparenting keeps world transforms; the terminal pose is exact.

## Routing boundary

Use `$threejs-camera-direction` for shot composition and camera handoffs.
Use `$threejs-procedural-vfx` when the deliverable is primarily plasma, sparks,
or effect pooling rather than object transform motion.
