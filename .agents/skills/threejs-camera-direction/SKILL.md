---
name: threejs-camera-direction
description: "Direct authored Three.js camera systems. Use for chase, side, or orbit rigs, cinematic framing, pointer look, camera handoffs, floating origins, projection ownership. Not for object transform timelines."
---

# Camera Direction

- **Runtime contract.** Backend: WebGL2 (`WebGLRenderer`) — no `three/webgpu` dependency. Min three: verify the installed `three` before adapting. Fallback: n/a. Backend-agnostic camera math; examples run under either backend. Verified: skill pack 2026-09.
- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.

Treat the camera as an authored visual system, not a passive viewport. Compose
the subject, establish scale, choose a stable up frame, and make every mode
handoff explicit.

## Build order

1. Define the design frame: subject size, screen occupancy, lens, near/far,
   motion, and horizon/up convention.
2. Build camera targets in semantic frames: ship, body surface, docking axis,
   or scene-authored shot.
3. Derive position and orientation independently, then combine them once.
4. Add input orbit/look only inside declared yaw/pitch and spatial constraints.
5. Add frame-rate-independent follow or a bounded spring where the reference
   uses inertia.
6. Snapshot and restore camera projection/state when a scene owns it.
7. Test mode transitions, cuts, pointer-lock reacquisition, resize, and large
   coordinates.

Read [references/camera-rig-and-cinematic-systems.md](references/camera-rig-and-cinematic-systems.md)
for exact chase/side/orbit rigs, projection values, transition
rules, floating-origin shot, pointer controls, and implementation limits.

## Invariants and strong defaults

Use these checks for the affected mechanism. Preserve concrete ownership, correctness and reproducibility contracts; adapt stylistic and tuning defaults to the brief (`../CONVENTIONS.md`).

- Use subject dimensions to derive offsets; do not tune one fixed distance for
  differently scaled assets.
- For planetary motion, derive up from the dominant body rather than global Y.
- Interpolate position with `lerp` and orientation with `slerp`.
- During an explicit handoff, use one interpolation stage. Do not stack a
  transition blend and a second follow smoother over the same interval.
- Re-sync yaw/pitch from the camera when pointer lock is acquired.
- Update the projection matrix whenever FOV, near, far, or aspect changes.
- Keep stars or infinite backgrounds camera-relative when large translation
  would create false parallax or precision loss.
- Restore camera and input ownership on scene disposal.

## Deliverable

- Inputs: subject dimensions, lens, up convention, and the mode list.
- Artifacts: per-mode frames, transition rules, constraint ranges, and lifecycle restore.
- Acceptance: offsets scale with the subject; position uses lerp and orientation slerp; each handoff uses one blend stage.

## Routing boundary

Use `$threejs-procedural-animation` for object motion timelines, springs,
docking, staging, and debris. This skill owns how the scene is viewed and how
camera modes hand off.
