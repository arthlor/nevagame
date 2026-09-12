---
name: threejs-procedural-fields
description: "Design shared scalar and vector field stacks for Three.js materials and geometry. Use for terrain or planet height, biomes, wear, moisture, clouds, water masks, displacement, domain warping, derivative normals. Not for channel assembly or a full planet body."
---

# Procedural Fields

- **Runtime contract.** Backend: WebGL2 (`WebGLRenderer`) — no `three/webgpu` dependency. Min three: verify the installed `three` before adapting. Fallback: n/a. Field math is backend-agnostic; the referenced planet example ships WebGL2 GLSL. Verified: skill pack 2026-09.
- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.

Do not start by stacking noise. Start by defining the fields the object physically or stylistically needs.

## Field contract

Before shader code, write a field bundle:

```text
coordinates
  → macro form
  → meso structure
  → derived causes
  → material channels
```

Example:

```text
sphereDirection
  → warpedDirection
  → elevation + ridges + craterDepth
  → slope + cavity + latitude + moisture
  → biome + color + roughness + bump
```

## Required workflow

1. Choose coordinates that remain stable under camera and object motion.
2. Lock real or perceptual scale for each frequency band.
3. Create named primary fields. Never hide the whole look in one expression.
4. Derive secondary fields from causes: slope from normals, shore from sea-level distance, wear from exposure, dirt from cavity.
5. Reuse the same fields across color, roughness, normal, displacement, emission, and scattering.
6. Add debug output for every named field.
7. Filter high-frequency fields by derivatives, tessellation density, or camera distance.

Read [references/field-stack-recipes.md](references/field-stack-recipes.md)
before implementation. It records sphere, terrain, water, and
structured-placement field contracts plus common parity defects.

Read the
[procedural planet surface](../threejs-procedural-planets/examples/procedural-planet-surface/planet-system.js)
for a shared CPU/GLSL field bundle whose height, continents, climate, biomes,
roughness, and normals remain independently inspectable.

## Invariants and strong defaults

Use these checks for the affected mechanism. Preserve concrete ownership, correctness and reproducibility contracts; adapt stylistic and tuning defaults to the brief (`../CONVENTIONS.md`).

- Independent noise per channel produces visual soup. Share structure.
- Domain warp the coordinates, not every result.
- Warp spherical coordinates tangentially, then renormalize.
- Use different frequency bands for silhouette, regions, surface breakup, and micro-normal.
- Do not displace geometry with frequencies the mesh cannot represent.
- Keep categorical masks broad enough to avoid isolated “bubble” regions.
- Parameter names must describe perception: `ridgeWidth`, `coastBlend`, `cavityDarkening`, not `noise3Amount`.

## Deliverable

- Inputs: coordinates, scale bands, and the required causes.
- Artifacts: named field bundle, a debug view per field, and the filtering policy.
- Acceptance: channels share causes; every field is inspectable on its own; high frequencies are filtered by footprint.

## Routing boundary

Use this skill when the shared field model is the task. Use
`$threejs-procedural-materials` when the task is channel assembly and material
response, and `$threejs-procedural-planets` when the deliverable is a complete
planetary body.
