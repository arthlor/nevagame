---
name: threejs-parallax-occlusion-mapping
description: "Build silhouette-aware parallax occlusion mapping in Three.js WebGPU/TSL. Use for height-field ray marching, relief UVs, clipped curved silhouettes, inflated shells, and relief self-shadowing. Not for ordinary PBR."
---

# Parallax Occlusion Mapping

- **Runtime contract.** Backend: WebGPU/TSL (`three/webgpu`, `three/tsl`) — requires a WebGPU-capable runtime. Min three: verify the installed build exposes the referenced TSL nodes (`Fn`/`If`/`Loop`). Fallback: not provided; state any GLSL port. Verified: skill pack 2026-09.
- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.

Treat relief as a coupled intersection, coverage, normal, and shadow system.
Do not stop at offsetting texture coordinates.

Examples are references, not templates: preserve their invariants, vary what is not load-bearing, and state which example you adapted (see `../CONVENTIONS.md`).

## Build order

```text
tangent frame and height convention
  -> view-ray march and hit refinement
  -> bounded or curved silhouette coverage
  -> shared marched sampling
  -> height-derived shading normal
  -> light-ray self-shadow march
  -> relief-aware cast/received shadow positions
```

Read [references/silhouette-relief-contract.md](references/silhouette-relief-contract.md)
for the intersection contract, flat and curved silhouette modes, shell
inflation, shadow integration, quality controls, and diagnostics.

Read the
[silhouette relief implementation](examples/silhouette-relief/ParallaxOcclusion.js)
for the complete TSL march, binary hit refinement, gradient-safe sampling,
coverage, horizon trimming, curved sag, and self-shadow function.

Read the
[complete bulkhead assembly](examples/silhouette-relief/silhouette-relief-system.js)
and its [packed procedural height maps](examples/silhouette-relief/bulkhead-height-maps.js)
for a wall, deck, relief columns, and overhead pipes using height-derived
normals, inflated cylinder shells, alpha-to-coverage, shadow-mask carving,
marched shadow depth, and received-shadow positions.

## Required controls

- world or UV relief scale;
- minimum and maximum view-march layers;
- silhouette bounds and feathering;
- curved-surface curvature or curvature callback;
- horizon trimming and edge erosion;
- self-shadow steps, bias, and strength;
- geometry, carved, and full-relief shadow modes;
- height, coverage, marched UV, normal, and shadow diagnostics.

## Invariants and strong defaults

Use these checks for the affected mechanism. Preserve concrete ownership, correctness and reproducibility contracts; adapt stylistic and tuning defaults to the brief (`../CONVENTIONS.md`).

- color, normal, and roughness rebuild separate view marches unintentionally;
- a curved host uses flat silhouette clipping at its geometric horizon;
- an inflated shell changes the relief floor instead of keeping it on the base surface;
- alpha-tested beauty coverage is assumed to carve shadow maps automatically;
- derivative sampling runs behind discard on drivers where it erodes coverage;
- grazing rays divide by an unbounded view-space Z component;
- relief self-shadowing darkens fill or emission indiscriminately.

## Routing boundary

Use `$threejs-procedural-materials` when no ray-marched height intersection or
silhouette ownership is required. Use `$threejs-procedural-geometry` when the
silhouette must be actual mesh topology rather than a view-dependent relief.
