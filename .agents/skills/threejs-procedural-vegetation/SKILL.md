---
name: threejs-procedural-vegetation
description: "Grow authored procedural trees, grass, ivy, and flower fields in Three.js or WebGPU. Use for species tables, recursive branches, surface-following vines, GPU-culled flowers, distance LOD, rooted wind. Not for generic profile sweeps."
---

# Procedural Vegetation

- **Runtime contract.** Backend: dual — WebGL2 examples plus raw-WebGPU/TSL modules. Min three: verify the backend of the specific example selected. Fallback: match the project backend; do not migrate WebGL2↔WebGPU. Verified: skill pack 2026-09.
- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.

Represent a plant as a growth hierarchy plus rendering adaptations. Do not model it as randomly scattered cylinders.

Examples are references, not templates: preserve their invariants, vary what is not load-bearing, and state which example you adapted (see `../CONVENTIONS.md`).

## Build sequence

1. Define a per-level species table: length, radius, taper, child count, emergence range, angle, twist, gnarliness, sections, radial segments.
2. Grow branches iteratively from a queue so recursion depth and budgets remain inspectable.
3. Emit each branch as oriented rings with an intentional UV seam.
4. Update section orientation from:
   - inherited direction;
   - stochastic curvature;
   - tropism or external force;
   - optional attraction constraints.
5. Spawn children with stratified longitudinal slots and independently permuted angular slots.
6. Generate leaves only after branch topology is stable.
7. Build foliage normals from both card orientation and local crown volume.
8. Choose wind scope explicitly. Leaf-root deformation, branch hierarchy deformation, and whole-tree sway are separate systems.

Read [references/structured-ash-growth-system.md](references/structured-ash-growth-system.md) and preserve its preset, continuation, child-placement, leaf, material, wind, and composition contracts before tuning.

Read the [Ash Growth System implementation](examples/structured-ash-growth/tree-system.js)
with its [authored preset](examples/structured-ash-growth/ash-preset.js) for a
contract-accurate implementation and its diagnostic attributes.

Read the
[stylized meadow grass implementation](examples/stylized-meadow-grass/grass-system.js)
for authored blade-cluster geometry with a procedural fallback, image-driven
path masking, per-instance origin/facing attributes, circular-arc rooted wind,
gust fronts, tip flutter, color clumps, macro variation, translucency, and rim
diagnostics.

Read the
[GPU-computed grass implementation](examples/gpu-computed-grass/gpu-grass-system.js)
for MRT blade-parameter generation, deterministic terrain-conforming placement,
Voronoi clumps, Bezier blade folding, wind-facing yaw, distance LOD/culling,
normal/color fading, translucency, and field diagnostics.

Read [references/gpu-culled-flower-field.md](references/gpu-culled-flower-field.md)
for the exact virtual-address, ecology, hierarchical-compaction, indirect-draw,
distance-tier, atlas, wind, contact, resource, and diagnostic contracts.

Read the
[GPU-culled flower-field entry](examples/gpu-culled-flower-field/gpu-culled-flower-field.js)
and its complete
[raw WebGPU implementation](examples/gpu-culled-flower-field/source/gpu-culled-flower-field.ts)
for zero-record integer candidate reconstruction, 32 by 32 tile culling,
three visible-ID streams, indirect near/middle/far draws, curved textured
petals, identity-preserving horizon heads, and rooted moving-contact response.

Read the
[procedural surface ivy entry](examples/procedural-surface-ivy/ivy-effect.js)
and its complete
[TypeScript implementation](examples/procedural-surface-ivy/source/ivy.ts)
for seeded spline-following stems, repeated mesh reprojection, tangent-plane
creep and droop, parallel-transport tube rings, growth reveal, instanced leaves
and umbels, and rigid petiole-hinge wind. Treat the TypeScript modules as the
only implementation; the entry file only re-exports them.

## Invariants and strong defaults

Use these checks for the affected mechanism. Preserve concrete ownership, correctness and reproducibility contracts; adapt stylistic and tuning defaults to the brief (`../CONVENTIONS.md`).

- branches form visible helices;
- dense grass ignores terrain height or clump-level variation;
- every child emerges at the same relative height;
- bark texture scale changes with branch radius;
- leaves reveal flat card normals under rotation;
- leaf wind moves card roots instead of remaining anchored;
- branch wind is claimed to match a reference whose branches are static;
- different seeds change species identity rather than controlled variation;
- geometry cost grows without a per-level budget;
- surface-following stems are offset from the host or flip normals across seams;
- ivy branches ignore the tangent plane while attached;
- leaf wind rotates around the card center instead of the petiole.
- a million-flower field allocates CPU transforms or per-candidate records;
- distant flower LOD replaces species identity with one generic sprite;
- compaction and direct rendering reconstruct different roots or acceptance;
- flower heads stay world-up after their stems bend.

## Routing boundary

Use `$threejs-procedural-geometry` for generic branch-ring emission without a
growth model. This skill owns species tables, vine and branch topology,
surface-following growth, foliage, grass fields, roots, and rooted wind.
