# Three.js Skill Pack

The 24 `threejs-*` skill directories in this folder are installed verbatim from
[Threejs Awesome Graphics Agent Skills](https://github.com/scottstts/Threejs-Awesome-Graphics-Agent-Skills),
upstream commit `d1cb23dcce6ea8ee4a60f6159daeb79d4b511dba` (v0.11.0). The MIT
license is in `LICENSES/Threejs-Awesome-Graphics-Agent-Skills.MIT`.

Neva's root `AGENTS.md` and subsystem authorities remain the routing and design
owners. These skills provide graphics techniques and examples; they do not
supply Neva's gameplay, UI, asset publication, release, palette, or renderer
contracts.

## Start here

- Visual work that crosses systems or has an unclear graphics cause: `threejs-skill-router`.
- One known visual mechanism: load its specialist directly; the router is optional.
- Evidence for a changed visual system: `threejs-visual-validation`, using the gates in `LLM/03_PRODUCTION_ROADMAP_LLM_AGENT_PLAYBOOK.md`.
- Gameplay, UI, audio, asset generation, and release tasks: use the corresponding Neva authority in root `AGENTS.md`; this graphics pack has no specialist agents for those jobs.

## Image and rendering systems

| Skill | Use when |
| --- | --- |
| `threejs-image-pipeline` | Several image-space systems share buffers, pass order, or output ownership |
| `threejs-bloom` | HDR bloom and selective emission |
| `threejs-exposure-color-grading` | Exposure, tone mapping, LUTs, and output color |
| `threejs-screen-space-ambient-occlusion` | GTAO, bent normals, and denoising |
| `threejs-shadow-systems` | Stable cascades, cached clipmaps, and texel stability |
| `threejs-atmosphere-aerial-perspective` | Sky scattering and aerial perspective |
| `threejs-volumetric-clouds` | Weather-shaped cloud volumes and shadows |
| `threejs-procedural-vfx` | Lens flare, aurora, fire/smoke, sparks, trails, and holograms |
| `threejs-raymarched-space-effects` | Curved-ray space effects such as black holes and wormholes |

## Geometry and surfaces

| Skill | Use when |
| --- | --- |
| `threejs-procedural-geometry` | Mesh construction, profiles, lofts, assemblies, and geometry audits |
| `threejs-procedural-architecture` | Building massing and façade grammars |
| `threejs-procedural-materials` | Causal PBR, optical materials, and surface response |
| `threejs-procedural-fields` | Shared scalar/vector fields and procedural causes |
| `threejs-parallax-occlusion-mapping` | Height-field ray marching and silhouette-aware relief |
| `threejs-procedural-vegetation` | Trees, grass, ivy, fields, and rooted wind |
| `threejs-procedural-planets` | Spherical terrain, ridges, craters, and biomes |
| `threejs-spectral-ocean` | FFT oceans and coastal wave/optics systems |
| `threejs-water-optics` | Analytic waves, bounded water, and water optics |
| `threejs-precipitation-surfaces` | Rain/snow, wetness, puddles, and splash coupling |
| `threejs-temporal-surfaces` | View-aligned frost and wet-window history |

## Motion

| Skill | Use when |
| --- | --- |
| `threejs-camera-direction` | Camera rigs, composition, and camera handoffs |
| `threejs-procedural-animation` | Transform timelines, springs, and authored motion phases |

## Neva adaptation

- Root `AGENTS.md` owns scope and precedence; `04` owns appearance, `VisualRenderConfig` owns renderer values, and `ASSET_PRODUCTION.md` plus `tools/authored/README.md` own asset production.
- Keep Neva's warm, faceted coastal identity. Adapt technical mechanisms and parameters; do not adopt unrelated example aesthetics or migrate the renderer because an example uses another backend.
- Use only the validation that applies to the changed mechanism and the project task matrix. A skill checklist does not authorize an unrelated system rewrite, new quality tier, diagnostic UI, or capture harness.
- This pack has no gameplay, UI, provider-generation, or release agent. Use Neva's existing owners and workflows for those tasks.

## Pack files

- `CONVENTIONS.md` — Neva adaptation rules for examples and evidence.
- `manifest.json` — skill names, categories, backend labels, and optional pairings.
- `tools/validate_skills.py` — validates frontmatter, links, cross-references, manifest coverage, and mirrored examples.
- `_shared/duplication-manifest.json` — intentional mirrored source trees.
