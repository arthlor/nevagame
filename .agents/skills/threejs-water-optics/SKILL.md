---
name: threejs-water-optics
description: "Build analytic and bounded water in Three.js. Use for multi-wave displacement and normals, heightfield pools, object ripples, caustics, pool-volume ray tracing, screen refraction, and Beer-Lambert absorption. Not for open-ocean spectra or rain puddles."
---

# Water Optics

- **Runtime contract.** Backend: WebGL2 (`WebGLRenderer`) — no `three/webgpu` dependency. Min three: verify the installed `three` before adapting. Fallback: n/a. Verified: skill pack 2026-09.
- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.

Treat water as geometry motion, surface orientation, and a participating optical layer. A blue transparent material is not a water system.

Examples are references, not templates: preserve their invariants, vary what is not load-bearing, and state which example you adapted (see `../CONVENTIONS.md`).

For large stochastic seas driven by directional spectra and GPU FFTs, use
`$threejs-spectral-ocean` instead.

## Analytic surface build order

1. Define wave bands and evaluate displacement.
2. Derive the normal analytically from the same waves.
3. Choose displaced geometry or explicitly normal-only water.
4. Establish scene-color ownership for heuristic refraction.
5. Declare whether absorption uses true depth or a fallback path-length estimate.
6. Blend analytic reflection/refraction through side-aware Fresnel.
7. Derive foam and glints from the shared wave response.
8. Filter unresolved normal bands from derivatives.

Read [references/water-surface-system.md](references/water-surface-system.md)
for the exact five-wave displaced ocean, six-band normal-only water, optical
hierarchy, and the limits that distinguish both from the spectral-ocean skill.

Read the
[analytic wave optics implementation](examples/analytic-wave-optics/water-system.js) for
shared displacement/normals, derivative filtering, reflection, screen-space
refraction, absorption, Fresnel, and crest-linked foam diagnostics.

Read the
[interactive pool volume implementation](examples/interactive-pool-volume/water-volume-system.js)
for bounded RGBA height/velocity/normal simulation, local drops, moving-sphere
displacement suitable for draggable objects, differential-area caustics, and
in-shader pool/water/sphere ray tracing against the pool bounds and sphere.

## Invariants and strong defaults

Use these checks for the affected mechanism. Preserve concrete ownership, correctness and reproducibility contracts; adapt stylistic and tuning defaults to the brief (`../CONVENTIONS.md`).

- normal texture motion does not agree with displaced crests;
- heuristic refraction can sample foreground objects but the limitation is undisclosed;
- fallback path length is presented as reconstructed scene thickness;
- bounded pool caustics are a decorative projection detached from simulated
  height normals;
- micro-waves alias into sparkling noise;
- foam is a scrolling texture unrelated to the shared crest metric;
- Fresnel is replaced by constant opacity;
- reflection, refraction, and transparency are all added without energy control.

## Deliverable

- Inputs: wave bands, volume bounds, and the absorption model.
- Artifacts: wave/normal source, refraction and absorption paths, foam metric, and diagnostics.
- Acceptance: normals agree with displaced crests; the refraction limitation is disclosed; reflection, refraction, and transparency are energy-controlled.

## Routing boundary

Use `$threejs-spectral-ocean` for stochastic directional spectra, FFT
cascades, Jacobian breaking, persistent ocean foam, and any interface the camera
crosses — this skill's heuristic screen-refraction offset assumes a bounded
volume seen from air, and an open interface needs that skill's forward
projection instead. Use
`$threejs-precipitation-surfaces` for rain-driven puddle wetness, ripple masks,
and weather-coupled splashes on ground surfaces. This skill owns authored
analytic waves, bounded heightfield simulation, ray-traced pool-volume optics,
and bounded-water optics.
