---
name: threejs-procedural-architecture
description: "Compile authored procedural buildings and architectural kits in Three.js. Use for massing grammars, facade bays, cornices, roofs, ornaments, material-slot mesh output, deterministic variants. Not for reusable profile or sweep kernels."
---

# Procedural Architecture

- **Runtime contract.** Backend: dual — backend-agnostic mesh output with WebGPU/TSL shadow/detail examples. Min three: verify the backend of the specific example selected. Fallback: emitted geometry matches the project backend; do not migrate WebGL2↔WebGPU. Verified: skill pack 2026-09.
- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.

Separate design planning from mesh emission. A building generator should produce an inspectable plan before it produces triangles.

Examples are references, not templates: preserve their invariants, vary what is not load-bearing, and state which example you adapted (see `../CONVENTIONS.md`).

## Required architecture

```text
settings
  → mass grammar
  → exposed-surface graph
  → façade/roof placements
  → module registry
  → material-slot mesh writer
  → geometries
```

Read [references/grammar-and-mesh-compiler.md](references/grammar-and-mesh-compiler.md) before implementing the generator.

Read the
[procedural financial tower compiler](examples/procedural-financial-tower/building-system.js)
for seeded tier planning, semantic façade placement, reserved zones,
material-slot BufferGeometry output, projected detail, and mechanism-specific
diagnostics.

## Rules

- Massing, façade rhythm, and detail modules are separate layers.
- Resolve exposed edges before façade placement. Do not decorate hidden internal faces.
- Modules own semantic anchors and construction depth, not global building coordinates.
- Compile by material slot to reduce draw calls without destroying material separation.
- Preserve real dimensions for floor height, bay width, trim projection, and texture density.
- Randomness may select among valid designs; it must not repair invalid geometry.
- Provide topology, façade ownership, material/geometry, and shadow diagnostics
  appropriate to the renderer path.

## Acceptance

The generated building must survive:

- silhouette-only view;
- flat untextured material;
- grazing light;
- close inspection of corners and roof transitions;
- seed variation without broken bays, overlapping ownership, or floating ornament;
- triangle and module-count reporting.

## Routing boundary

Use `$threejs-procedural-geometry` for a reusable profile, sweep, ring, or mesh
writer without a building grammar. This skill owns massing, façade semantics,
architectural modules, and building-plan compilation.
