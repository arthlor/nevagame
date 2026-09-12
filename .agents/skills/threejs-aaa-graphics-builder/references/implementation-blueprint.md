# AAA Graphics Implementation Blueprint

Use selected sections when the requested graphics work exposes a missing shared owner or architecture problem. Start with the current implementation. In Neva, `01`, `04`, Art Pipeline and `BLENDER.md` own architecture, appearance and production; these examples do not create another contract.

## Illustrative Ownership for New Projects

```text
src/assets/MaterialLibrary.ts
src/assets/ProceduralTextures.ts
src/assets/DecalShapes.ts
src/assets/ModelDiagnostics.ts
src/assets/ImportedAssetRegistry.ts
src/assets/modelFactories/HeroFactory.ts
src/assets/modelFactories/ObstacleFactory.ts
src/assets/modelFactories/RewardFactory.ts
src/assets/modelFactories/WorldPropKit.ts
src/systems/LightingRig.ts
src/systems/RenderPipeline.ts
src/systems/VfxSystem.ts
src/systems/WorldArtDirector.ts
src/systems/QualityDiagnostics.ts
```

These names illustrate responsibilities, not required new files. Reuse the existing owners for materials, geometry, effects, rendering and diagnostics. Neva static models belong to its registered Blender families, not new runtime factories.

## Asset Source and Affected Surfaces

Choose suitable existing, authored procedural or explicitly authorized external
sources by the brief, provenance, fidelity and resource budget. No hero asset
requires a provider output or a credential probe. Load a generator only for the
authorized provider task. Neva static assets retain its catalog, registered
Blender generator, validation and publication path; never publish a downloaded
GLB directly.

For a scoped pass, inspect and improve the named surfaces. For a whole-scene
pass, consider the relevant subjects, interactions, world composition, materials,
lighting, motion and UI cohesion. Do not require enemies, fixed variant counts,
collectibles or additional effects where the game or task does not need them.
Imported assets need the project’s scale, pivot, bounds, collision, animation,
provenance and resource checks before integration.

## Technical Art Contract

For a broad change to graphics architecture, record only new or changed decisions: visible purpose, shared ownership, resource envelope, batching/LOD strategy and integration risks. `references/technical-art.md` supplies optional planning detail; reuse the project’s existing brief and budgets.

Measure costly effects against the existing budget and intended result before expanding their use.

## Material Library

Use the project’s named material roles and shared cache. `references/technical-art.md` illustrates possible roles for new projects; Neva uses `PaletteTokens`/`PaletteMaterials` and its palette JSON. Add a role only for a current material need.

## Procedural Texture And Decal Kit

Use canvas textures, shape geometry, or thin offset meshes for detail that would otherwise require external assets:

- Panel lines and access hatches.
- Trim sheets and edge bands.
- Window strips, city light grids, arena markings.
- Hazard stripes, arrows, target indicators, lane glyphs.
- Scratches, wear, noise, dirt, heat tint, scorch marks.
- UI/world icon motifs reused in HUD and diegetic markers.

Set texture filtering, mipmaps, repeat/wrap, color space, and anisotropy intentionally. Avoid unique full-size textures for tiny repeated marks.

When image generation is explicitly authorized, `threejs-image-generator` can supply 2D source art such as: terrain/rock/asphalt/snow/moss texture references, sci-fi trim sheets, signs, hazard stripes, cockpit decals, sky/background plates, menu/loading art, faction logos, pickup icons, ability icons, and GUI glyphs. Use the resulting images either as actual 2D assets or as image-to-3D inputs.

## Model Factories

Factories should return a grouped object plus metadata:

```ts
type ModelFactoryResult = {
  root: THREE.Group;
  collision?: THREE.Object3D;
  lod?: THREE.LOD;
  bounds?: THREE.Box3;
  diagnostics?: {
    meshes: number;
    materials: number;
    geometries: number;
    triangles?: number;
  };
};
```

Use named child meshes for readable debugging. Separate visual detail from collision proxies. Keep repeated detail instanced where practical.

For imported 3D models, use the existing registry/loader; a new project may need a wrapper returning metadata such as: root group, bounds, collision proxy, animation clips, and diagnostics. Never put 3D/image/audio generation API calls in browser runtime code.

## World Art Director

For a new world or a composition pass, consider applicable depth layers:

- Play layer: ground, lanes, rails, objective path, hazards, pickups.
- Near layer: speed props, signs, arches, barriers, debris, foreground occluders used carefully.
- Mid layer: buildings, cliffs, hangars, pillars, platforms, arena machinery.
- Far layer: skyline, terrain silhouettes, nebula/cloud/fog cards, parallax planes.
- Motion layer: speed lines, particles, trail strips, dust, sparks, screen-space UI feedback.

Every layer should support gameplay readability. Do not obscure threats or the next decision.

## Render Pipeline

Own renderer setup in one place:

- `outputColorSpace = THREE.SRGBColorSpace`.
- Tone mapping and exposure selected for the art direction.
- DPR capped for mobile and high-density displays.
- Shadows enabled only for objects that benefit from grounding.
- Post-processing is limited and measured: bloom, vignette, chromatic aberration, film grain, or color grade only when they improve authored forms.
- Resize updates canvas, renderer, camera, composer, and UI CSS variables.

## VFX System

When VFX are in scope, use the existing event-driven owner; `references/technical-art.md` provides examples. Effects should be pooled, readable, and tied to state; they must clarify state instead of adding permanent particle clutter.

## Diagnostics

Use existing diagnostics for the changed mechanism. Relevant measurements can include renderer calls, triangles, resources and DPR/post/shadow settings, plus:

- Scene mesh count, instanced mesh count, unique materials/geometries/textures.
- Approximate visible prop counts by layer.
- Relevant view or motion evidence and observed defects.
- Performance notes after post-processing, shadows, or many repeated props.

## Browser Game Budgets

Use project-owned budgets. The starting values in `references/technical-art.md` are examples for projects without a budget, not additional Neva limits. Measure matching scenarios when the change affects performance.

## Implementation Order

1. Inspect the affected gameplay view and identify the cause of the visible miss.
2. Reuse the owning material, generator, layout or renderer system.
3. Improve relevant form, spacing, material or lighting in coherent increments.
4. Add effects or assets only where the requested result needs them.
5. Inspect the changed views and motion, correct scoped defects, and measure
   plausible resource impacts. Follow the project task matrix for completion.
