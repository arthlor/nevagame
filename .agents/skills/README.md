# Three.js Skill Pack

Routing index for the skills in this directory. Skill files are the source of
truth for technique; this file and `manifest.json` are the index for selection,
tooling, and validation. Repository `AGENTS.md` outranks every skill here.

## Start here

- Explicitly selected whole-game or named multi-system orchestration: `threejs-game-director` (explicit-only).
- One visual system or a graphics rewrite: `threejs-skill-router`.
- A specific rendering defect: the owning system skill, or `threejs-debug-profiler` when diagnosis is the task.
- A generated asset: the relevant generator skill, only with an explicit human request (`AGENTS.md` "Codex and threejs-game-skills").

## Entry and meta

| Skill | Use when | Backend |
| --- | --- | --- |
| `threejs-game-director` | explicitly selected whole-game or named multi-system orchestration | both |
| `threejs-skill-router` | route visual work to the smallest skill set | n/a |
| `threejs-visual-validation` | fixed-view contracts, seed sweeps, budget evidence | agnostic |

## Game layers

| Skill | Use when | Backend |
| --- | --- | --- |
| `threejs-gameplay-systems` | loop, mechanics, input, physics, level/encounter, feel | both |
| `threejs-aaa-graphics-builder` | scoped authored visual improvement | both |
| `threejs-game-ui-designer` | HUD, menus, touch UI, responsive fit | dom |
| `threejs-debug-profiler` | render/runtime/perf/mobile bugs and profiling | both |
| `threejs-qa-release` | release or visual-gold gates; routine checks use the project matrix | both |

## Image and rendering systems

| Skill | Use when | Backend |
| --- | --- | --- |
| `threejs-image-pipeline` | several post systems share buffers/order | webgl2 |
| `threejs-bloom` | HDR bloom and selective emission | webgl2 |
| `threejs-exposure-color-grading` | metering, tone mapping, LUTs | webgl2 |
| `threejs-screen-space-ambient-occlusion` | GTAO, bent normals, denoise | webgl2 |
| `threejs-shadow-systems` | cascades, cached clipmaps, texel stability | webgl2 (+TSL) |
| `threejs-atmosphere-aerial-perspective` | sky scattering and aerial perspective | webgl2 |
| `threejs-volumetric-clouds` | weather cloud volumes and shadows | webgl2 |
| `threejs-raymarched-space-effects` | black holes, wormholes, geodesic integration | webgl2 |
| `threejs-procedural-vfx` | lens flare, aurora, fire/smoke, sparks, holograms | dual |

## Geometry and surfaces

| Skill | Use when | Backend |
| --- | --- | --- |
| `threejs-procedural-geometry` | hard-surface/humanoid assemblies, topology | dual |
| `threejs-procedural-architecture` | buildings, facades, architectural kits | dual |
| `threejs-procedural-materials` | causal PBR, films, gems, glass, diffraction | webgpu-tsl |
| `threejs-procedural-fields` | shared scalar/vector causes | agnostic |
| `threejs-procedural-planets` | coupled planetary bodies | webgl2 |
| `threejs-parallax-occlusion-mapping` | relief ray marching, silhouette, self-shadow | webgpu-tsl |
| `threejs-procedural-vegetation` | trees, grass, ivy, flower fields, rooted wind | dual |
| `threejs-water-optics` | analytic and bounded water | webgl2 |
| `threejs-spectral-ocean` | FFT oceans, coastal breakers, Snell optics | dual |
| `threejs-precipitation-surfaces` | rain/snow, puddles, splashes, wetness | webgl2 |
| `threejs-temporal-surfaces` | frost/thaw history, wet-window rain | webgl2 |

## Motion

| Skill | Use when | Backend |
| --- | --- | --- |
| `threejs-camera-direction` | rigs, cinematic framing, camera handoffs | agnostic |
| `threejs-procedural-animation` | transform timelines, docking, springs, debris | agnostic |

## Generators (explicit human request only)

| Skill | Use when | Provider |
| --- | --- | --- |
| `threejs-3d-generator` | text/image-to-3D, rigging, retargeting, stylization | Tripo |
| `threejs-image-generator` | concepts, textures, skies, decals, icons, GUI art | Gemini |
| `threejs-audio-generator` | SFX, ambience, TTS, voice conversion, cleanup | ElevenLabs |

## Conventions and tooling

- `CONVENTIONS.md` — scope, risk-based checks, adaptable examples and evidence boundaries.
- `agents/openai.yaml` — per-skill invocation policy and short starter prompt. The director and provider generators are explicit-only; focused technical skills remain discoverable.
- `manifest.json` — machine-readable index (category, backend, pairs_with).
- `tools/validate_skills.py` — frontmatter, links, cross-refs, drift, and contract checks.
- `_shared/duplication-manifest.json` — intentional mirrors that must not drift.
