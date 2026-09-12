---
name: threejs-volumetric-clouds
description: "Implement volumetric clouds in Three.js. Use for weather-driven density, bounded raymarching, shape erosion, silver lining, temporal reconstruction, cloud shadows, and quality tiers. Not for molecular sky or voxel fire."
---

# Volumetric Clouds

- **Runtime contract.** Backend: WebGL2 (`WebGLRenderer`) — no `three/webgpu` dependency. Min three: verify the installed `three` before adapting. Fallback: n/a. WebGL2 examples depend on the `postprocessing` library. Verified: skill pack 2026-09.
- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.
- **Mirrored source.** The `source/` tree mirrors `threejs-atmosphere-aerial-perspective/examples/lut-aerial-perspective/source/`; keep shared files byte-identical and confine additions to `clouds/` (see `_shared/duplication-manifest.json`).

Cloud quality comes from density organization, lighting, and temporal stability—not from increasing march steps over unstructured noise.

Examples are references, not templates: preserve their invariants, vary what is not load-bearing, and state which example you adapted (see `../CONVENTIONS.md`).

## System order

1. Define the cloud volume and layer bounds.
2. Generate or source weather, base-shape, detail, and turbulence fields.
3. Build a density function with vertical and weather profiles.
4. Raymarch only the bounded occupied segment.
5. Integrate transmittance and lighting front-to-back.
6. Reconstruct low-resolution output temporally.
7. Project a separate low-cost cloud-shadow solution.

Read [references/weather-volume-and-reconstruction.md](references/weather-volume-and-reconstruction.md) before implementing or auditing the cloud system.

Read the [weather volume cloud entry](examples/weather-volume-clouds/cloud-effect.js)
and its `source/` modules for weather-layer ownership, spherical shell bounds,
authored shape/detail sampling, cloud shadow maps, temporal upscale,
atmospheric composition, and package-owned diagnostics.

## Required controls

- coverage, cloud type, precipitation, and anvil bias;
- base/top altitude and vertical density profile;
- shape/detail scales and erosion;
- wind for each field;
- primary step count, light step count, and empty-space policy;
- history weight and disocclusion threshold;
- cloud-shadow extent, resolution, and update rate.

## Invariants and strong defaults

Use these checks for the affected mechanism. Preserve concrete ownership, correctness and reproducibility contracts; adapt stylistic and tuning defaults to the brief (`../CONVENTIONS.md`).

- density is only `fbm(position)`;
- the raymarch traverses the full camera range;
- detail noise adds density instead of eroding shaped masses;
- temporal history is accepted across disocclusion;
- shadows use the full beauty raymarch;
- every cloud layer shares the same wind and density profile.

## Routing boundary

Use `$threejs-atmosphere-aerial-perspective` for molecular/aerosol scattering
without weather density. Use `$threejs-procedural-vfx` for emissive aurora
curtain slabs or bounded interactive voxel fire and smoke with velocity,
pressure, emitter, and collision fields. This skill owns weather-shaped cloud
volumes, reconstruction, cloud lighting, and cloud shadows.
