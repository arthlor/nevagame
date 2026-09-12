---
name: threejs-image-pipeline
description: "Compose a deliberate final-image pipeline in Three.js. Use for shared depth/normal/velocity ownership, GTAO plus bloom plus exposure ordering, effect-local render targets, and pass diagnostics. Not for one isolated effect."
---

# Image Pipeline

- **Runtime contract.** Backend: WebGL2 (`WebGLRenderer`) — no `three/webgpu` dependency. Min three: verify the installed `three` before adapting. Fallback: n/a. Pass graph is WebGL2 unless the project owns a WebGPU post graph. Verified: skill pack 2026-09.
- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.

Use this skill only when composing several image-space systems or defining shared buffers. For one effect, load its atomic skill instead.

Load:

- `$threejs-screen-space-ambient-occlusion` for GTAO, bent normals, denoising, or AO application;
- `$threejs-bloom` for HDR extraction and bloom;
- `$threejs-exposure-color-grading` for metering, adaptation, tone mapping, LUTs, and output conversion.

The pipeline must expose its signals and ordering. Do not install a pile of effects and tune the final frame blindly.

## Signal order

```text
scene HDR color + depth + normals + albedo where required
  → lighting-related screen effects
  → atmosphere/transparency composition
  → bloom
  → exposure
  → tone mapping
  → grading
  → lens/presentation effects
  → output conversion
```

Read [references/production-image-pipeline.md](references/production-image-pipeline.md)
for four production pass graphs, their buffer/resolution contracts, and the
ownership boundaries between whole-scene and effect-local graphs.

## Rules

- Tone-map once.
- Keep HDR bloom before tone mapping.
- Meter exposure from a small luminance target, not the final 8-bit screen.
- Separate direct and indirect light before applying bent-normal ambient tint when possible.
- Upsample low-resolution effects with depth/normal-aware weights.
- Build pass toggles and effect-only views before tuning.
- UI rendered in the same target needs an explicit protection strategy.
- Do not load all atomic post skills by default. Route only the effects actually requested.

## Deliverable

- Inputs: the image-space systems in scope, buffer ownership, and the output target.
- Artifacts: pass graph, buffer formats/resolutions, per-pass toggles, and diagnostic captures.
- Acceptance: every pass is toggleable; no doubled tone map or encode; low-resolution effects upsample depth/normal-aware.

## Routing boundary

Use this skill when multiple image-space systems must share buffers, ordering,
or output ownership. For one isolated effect, use its atomic skill without
loading this coordinator.
