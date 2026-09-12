---
name: threejs-atmosphere-aerial-perspective
description: "Implement physically motivated sky and aerial perspective in Three.js. Use for planetary atmosphere, Rayleigh/Mie scattering, precomputed LUTs, sun and moon discs, and depth-based transmittance or inscattering. Not for weather clouds."
---

# Atmosphere and Aerial Perspective

- **Runtime contract.** Backend: WebGL2 (`WebGLRenderer`) — no `three/webgpu` dependency. Min three: verify the installed `three` before adapting. Fallback: n/a. WebGL2 examples depend on the `postprocessing` and `three-stdlib` libraries. Verified: skill pack 2026-09.
- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.
- **Mirrored source.** `examples/lut-aerial-perspective/source/` is the canonical copy of the atmosphere/geospatial/effects tree also shipped by `threejs-volumetric-clouds`; keep them byte-identical (see `_shared/duplication-manifest.json`).

Treat sky rendering and aerial perspective as two views of the same scattering model. They must share radii, density profiles, coefficients, sun direction, exposure scale, and coordinate transforms.

Examples are references, not templates: preserve their invariants, vary what is not load-bearing, and state which example you adapted (see `../CONVENTIONS.md`).

## Choose the implementation tier

- Small scene with no orbital camera: analytic height/distance approximation.
- Planetary ground-to-space camera: ray integration or precomputed LUTs.
- Large geospatial world: LUTs plus world-to-planet transform, altitude correction, and depth-aware aerial perspective.

Read [references/atmosphere-system-contract.md](references/atmosphere-system-contract.md)
before implementation. It separates the LUT/ellipsoid architecture from
dynamic integration and the shell/post handoff.

Read the [LUT sky and aerial-perspective entry](examples/lut-aerial-perspective/atmosphere-effect.js)
and its `source/` modules for the SkyMaterial, SkyLightProbe,
SunDirectionalLight, AerialPerspectiveEffect, precomputed-texture loader,
sun/moon direction, lens flare, tone mapping, and dithering path used by the
LUT example.

## Required outputs

- sky radiance;
- sun transmittance/color;
- segment transmittance from camera to visible surface;
- segment inscattering;
- optional sky irradiance for materials;
- explicit scale conversion between world units and atmosphere units.

## Invariants and strong defaults

Use these checks for the affected mechanism. Preserve concrete ownership, correctness and reproducibility contracts; adapt stylistic and tuning defaults to the brief (`../CONVENTIONS.md`).

- sky and terrain haze use different sun directions or coefficients;
- the atmosphere is a uniformly transparent sphere;
- camera altitude is measured in a local flat frame during orbital motion;
- scene depth is treated as linear when it is not;
- exposure is used to hide incorrect radiance scale;
- atmosphere fades abruptly at shell entry.

## Routing boundary

This skill owns molecular/aerosol sky scattering and surface-segment aerial
perspective. Use `$threejs-volumetric-clouds` for weather-shaped cloud density,
temporal cloud reconstruction, and cloud shadows. Use
`$threejs-procedural-vfx` for emissive aurora curtain volumes and their
perspective/equirectangular radiance materials, and for standalone filmic HDR
lens-flare compositors. Keep the LUT example's lens flare here when it remains
one stage in the sky-scattering and aerial-perspective composition.
