---
name: threejs-skill-router
description: "Route ambitious Three.js graphics work to the smallest expert skill set. Use for new visual systems, graphics rewrites, reference matching, or effects spanning geometry, materials, atmosphere, shadows, and post. Not for direct use of one specialist or game-loop/UI/QA work."
---

# Three.js Visual Skill Router

- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.

> Repository override (Neva): this router and the generator skills are subordinate
> to `AGENTS.md`. Provider generation (`threejs-3d-generator`,
> `threejs-image-generator`, `threejs-audio-generator`) requires an explicit human
> request, and a downloaded GLB must never be published. Where a skill gate
> conflicts with `AGENTS.md` ("Generate-asset prompt contract" or "Codex and
> threejs-game-skills"), `AGENTS.md` wins.

Select the smallest set of specialists needed to deliver the requested visual
result. This is a graphics entrypoint, not a requirement to rebuild the scene or
run every skill in the pack. Direct use of a specialist does not require loading
this router first.

## Establish the route

Read the repository's task-routing authority before selecting implementation
owners. In Neva, [root AGENTS.md](../../../AGENTS.md) owns document routing,
asset production, renderer ownership and verification; these skills supply
techniques within that contract.

- For a specific defect, trace its owning system first. Use
  `$threejs-debug-profiler` when diagnosis or measurement is the missing work.
- For visual improvement, identify the visible mismatch at the intended camera:
  silhouette, composition, material response, motion, lighting or cost. Route the
  cause, rather than treating “premium” as a request for every effect.
- For a new visual system, establish subject, scale, reference characteristics,
  motion and target devices/budget. Reuse existing project decisions.
- Start with the owning specialist. Add another only for an affected shared
  contract, such as vegetation consuming terrain masks or wind affecting bounds.
  A HUD-only task belongs to `$threejs-game-ui-designer`; whole-game creation
  belongs to `$threejs-game-director`, subject to repository routing.

Read a selected sibling at `../<skill-name>/SKILL.md` relative to this file,
preferring the repository `.agents/skills/<skill-name>/SKILL.md` copy over any
global install. If unavailable, use the session's skill catalog to find it. A missing specialist
is a capability gap to disclose, not a reason to invent a path or abandon work
that existing source and official documentation can support.

## Pack entrypoints

This table routes by visual system. For the full index, categories, backends,
prerequisites, and negative triggers, read `../README.md` and `../manifest.json`.

| Request | Load |
| --- | --- |
| explicitly requested whole-game or named multi-system orchestration | `$threejs-game-director` (explicit-only) |
| gameplay loop, physics, level design, feel | `$threejs-gameplay-systems` |
| HUD, menus, touch UI, responsive fit | `$threejs-game-ui-designer` |
| render/runtime/perf/mobile defects | `$threejs-debug-profiler` |
| release or visual-gold gate | `$threejs-qa-release`; routine checks use the project task matrix |
| generated 3D, image, or audio assets | the matching generator skill (explicit human request per `AGENTS.md`) |
| fixed-view visual evidence | `$threejs-visual-validation` |

## Route by the visual system being authored

| Required result | Load |
| --- | --- |
| shot composition, chase/side/orbit rigs, camera handoffs, projection ownership, pointer look, floating origins | `$threejs-camera-direction` |
| launch and docking timelines, procedural transform phases, springs, staging, rotating-frame alignment, debris motion | `$threejs-procedural-animation` |
| reusable scalar/vector fields, domain warping, causal masks, procedural normals | `$threejs-procedural-fields` |
| atlas-filtered blocks, planetary surfaces, hybrid texture-backed PBR soil/moss with procedural displacement and masks, ground and model moss accumulation, terrain wetness, lava/emissive surfaces, reflective wave-optical diffraction gratings, thin-film soap bubbles with Airy interference, raytraced diamond/gem refraction, dispersive glass transmission with internal reflection and volume absorption, authored frame PBR, specular AA | `$threejs-procedural-materials` |
| height-field ray marching, silhouette-aware POM, curved relief shells, relief self-shadowing | `$threejs-parallax-occlusion-mapping` |
| well-crafted and complete hard-surface object assemblies, procedural vehicles and humanoid robots, parameter-curve section tracks, tilted shell and spine lofts, pillow panels, exact polygon cuts, UV-owned apertures, spanwise airfoil lofts, sculpted rails/frames, branch rings, fin lofts, profile extrusion, inset, revolve, sweep, solidify, bevels and fillets, shell thickness, direct-topology apertures, semantic mesh writers, material slots and groups, primitive-built forms, coplanar flicker, loose/non-manifold geometry, detached parts, interpenetration, support, clearance and swept-envelope defects | `$threejs-procedural-geometry` |
| trees, surface-following ivy, painted vines, stylized grass, GPU-computed grass, GPU-culled virtual flower fields, distance-tiered plant geometry, roots, foliage, rooted wind deformation | `$threejs-procedural-vegetation` |
| buildings, façade grammars, profiles, ornaments, modular mesh writers | `$threejs-procedural-architecture` |
| planets, terrain, craters, biome fields, coastlines, spherical detail | `$threejs-procedural-planets` |
| sky scattering, planetary shells, depth-based aerial perspective | `$threejs-atmosphere-aerial-perspective` |
| weather-driven raymarched clouds and cloud shadows | `$threejs-volumetric-clouds` |
| FFT oceans, hybrid FFT/Gerstner clear water, coastal breaker transitions, signed-distance coastlines, shallow-water swash chains, wet sand, stylized above/below ocean optics, submerged Snell windows, total internal reflection, forward-refracted structures, pixel-footprint spectral LOD, aquatic perspective, caustic god rays, spectral cascades, choppy derivatives, Jacobian whitecaps | `$threejs-spectral-ocean` |
| authored analytic waves, bounded heightfield pools, object ripples, differential-area caustics, ray-traced pool volume optics, shared normals, heuristic refraction, fallback absorption, crest foam | `$threejs-water-optics` |
| falling snow, snow accumulation, model snow caps, wet asphalt puddles, procedural ripple normals, splash flipbooks, rain streaks, shared weather envelopes, surface wetness | `$threejs-precipitation-surfaces` |
| curved-ray black holes, accretion disks, wormholes and throat transits, null-geodesic integration, lensed celestial spheres and star fields | `$threejs-raymarched-space-effects` |
| filmic HDR lens-flare compositors, highlight-derived radial ghosts, field-angle pupil deformation, spectral pupil rings, localized glare and bloom, raymarched aurora curtains, finite-footprint emissive slabs, uniform volume integration, equirectangular radiance probes, WebGPU voxel fire and smoke, volumetric fluid fields, mesh-surface emitters, SDF fire collisions, particles, trails, plasma, shockwaves, holographic projections, Fresnel rim shells, scanline banding, layered event effects | `$threejs-procedural-vfx` |
| accumulated screen frost, touch clearing, wet-window rain, view-aligned droplet refraction and blur | `$threejs-temporal-surfaces` |
| stable large-world shadows, cascades, clipmaps, cached updates | `$threejs-shadow-systems` |
| GTAO, bent normals, bilateral reconstruction | `$threejs-screen-space-ambient-occlusion` |
| HDR bloom and selective emission contribution | `$threejs-bloom` |
| eye adaptation, tone mapping, LUT grading, output color | `$threejs-exposure-color-grading` |
| shared depth/normal/velocity ownership and multi-pass ordering | `$threejs-image-pipeline` |
| fixed-view diagnostics, seed sweeps, temporal and budget evidence | `$threejs-visual-validation` |

## Use examples selectively

The examples contain implementation detail worth studying. Select by the actual
mechanism and read its source before adapting it; an entry module may only
re-export the implementation. Do not load unrelated examples merely because
they share a skill folder. Examples are references, not templates: preserve their
necessary contracts and adapt the rest to the brief
(see `../CONVENTIONS.md`).

For vegetation, tree growth, meadow grass, GPU grass, virtual flower fields and
surface ivy are separate branches of the reference library. An ivy task starts
with the ivy implementation; an ash preset is relevant to ash-like growth, not a
universal plant contract. Preserve seed identity, rooted wind and placement
invariants when those mechanisms are transferred.

Before borrowing code, compare the example with the installed Three.js version,
rendering backend, shader language, asset formats and resource ownership. A raw
WebGPU example is not permission to migrate a WebGL project. If incompatible,
transfer a supported technique or explain the limitation. Preserve the project's
existing terrain, palette, asset-loader and render-loop owners instead of copying
a demo's parallel infrastructure. Check asset provenance before reuse.

## Implementation order

For a new scene, establish framing and authored forms before adding material,
lighting and atmosphere detail. Load camera, animation or shared-field skills
only when those systems change. Add image-pipeline guidance when pass ordering,
buffer ownership or compositing changes; individual effects do not automatically
require a new pipeline.

For an existing scene, change the identified owner and trace its affected
consumers. Preserve unrelated visual systems. Check the result at the intended
view distance; close-up detail alone does not establish gameplay readability.

## Routing constraints

- Do not load a skill for API setup alone. Inspect the installed Three.js version and use official docs.
- Do not route “make it beautiful” directly to post-processing. Find the missing authored system.
- Prefer one strong, inspectable visual rule over several independent noise layers.
- When adapting a supplied reference, preserve the mechanism that creates its character. Do not reduce it to a generic effect category.
- Keep object-space, world-space, and screen-space systems separate unless the composition explicitly requires coupling.
- If no retained skill matches, use the owning source and official documentation; disclose missing specialist coverage only when it affects confidence or completion.

## Acceptance evidence

Use the repository's task-specific gates. Without a project matrix, choose
checks that exercise the changed behavior and its realistic failure modes:

- Procedural placement/growth: reproducible inputs, bounded generation cost and
  stable species identity. Inspect controlling fields when needed to diagnose
  their effects; reuse existing diagnostics.
- Geometry/material/wind changes: target-distance silhouette and surface response,
  anchored deformation, affected bounds and relevant shadow behavior.
- Performance changes: compare the same scene, camera, device, quality and build
  mode; report frame-time and resource costs. Label a quality reduction explicitly.
- New multi-pass or temporal systems: inspect the affected intermediate outputs,
  history/reset behavior and applicable quality tiers. A no-post comparison is
  useful for separating scene defects from effects; a post effect must also be
  judged by its intended contribution.

Use `$threejs-visual-validation` when reproducible visual diagnostics or regression
evidence are part of the task. Do not add debug UI, a new tier system or a full
screenshot harness solely to complete a small asset or parameter edit. Complete
required gates, then broaden only for failures, changed inputs or unresolved risk.

Report the visual change, evidence, performance tradeoffs and remaining gaps.
Keep static checks, observed rendering, human visual approval and release status
separate. Do not present a proposed improvement as a measured result.
