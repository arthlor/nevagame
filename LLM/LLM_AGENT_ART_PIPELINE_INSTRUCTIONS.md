# LLM Agent Art Pipeline & Rendering Instructions

> **Role:** Mandatory implementation guide for new/shared generators, renderer/material work, and release/gold-slice art gates. Routine existing-asset tasks follow the lean route in `ASSET_PRODUCTION.md` and read only directly relevant sections here when needed. `04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md` owns **what the game looks like**; this file owns **how agents produce it reliably**.

# 0. Architecture Boundary

Runtime architecture follows `01`:
```text
React/DOM UI: HUD, inventory, market, journal, crafting, dialogue, menus, settings
Three.js: world, terrain, characters, buildings, props, vegetation, lighting/shadows, water, weather, VFX
Domain Simulation: authoritative serializable gameplay state, clock/calendar, farming, fishing, boats/cargo, economy, persistence
```
Use TypeScript, Vite, Three.js (WebGL2 baseline; WebGPU/TSL allowed where justified), Rapier, domain simulation, optional Miniplex/bitECS for rendering/spatial work, Vanilla TS/React DOM, optional Zustand. **No React Three Fiber ownership of core 3D scene.**

# 1. Hybrid Art Production Pipeline

Use two production paths for authored 3D:
1. **Static prefabs:** catalog/schema + registered family generators → GLB/glTF 2.0 → Khronos validate → glTF Transform/Meshopt → atomic publish → runtime. The main producer is the **authored Three.js generator** system (`tools/authored/`: TypeScript factories on the shared kit, built in Node by the pipeline; see its README). The second producer is the **authored GLB** (`authored_glb`): a committed source GLB such as an explicitly requested Tripo generation, published through the same gates. Families built by the retired Blender generators are frozen: validated, never rebuilt, and ported into the authored system before they change. There is no Blender or Python step.
2. **Dynamic/procedural runtime systems:** Three.js TS builders + shared `PaletteMaterials` for smooth water, crop growth visuals, seasonal tint, dynamic fish, debug proxies.

Ground supporting maps are not a third prefab pipeline. They are renderer presentation textures owned by `ExternalSurfaceTextures` + `VisualRenderConfig` (section 6.2). Do not register them as catalog IDs, run `art:generate` for them, or treat `public/assets/textures/terrain/` as a filename-list authority.

Preferred flow:
`LLM agent → one catalog entry (+ referenceAuthoring brief when evidence-guided) → registered authored generator (tools/authored/generators + kit) → staged GLB → validation/optimization → atomic publish → catalog-backed Three.js loader`.

Project boundaries:
```text
assets/specs/asset-catalog.{json,schema.json}  generated-asset contract
  optional referenceAuthoring                  evidence-to-generator contract, not a second spec
art/palettes/neva.palette.json                 semantic palette contract
tools/art/cli.mjs                              public art CLI (Node only; authored + authored_glb)
tools/art/{cache,glb,optimize,surface_contract}.mjs
                                                cache, GLB normalization, packaging, decoded surface checks
tools/art/legacy-generators.json               recorded parameter contracts of frozen families
art/imported/, art/authored/*/export/          committed authored GLB sources
tools/authored/generators/                     authored Three.js generators + registry/contracts
tools/authored/kit/                            shared authored construction kit
tools/authored/pipeline/                       authored producer (Node) + live Art Yard build
tools/art/codegen.mjs                              typed ID/family-map generation
generated/.staging/                            run-local candidates and backups
generated/glb/                                 last published optimized GLBs
generated/.cache/art/                          disposable validated per-asset cache
generated/reports/                             manifest, human report, quality report
public/assets/models/                          runtime-published GLBs + manifest
src/render/assets + loaders                     catalog consumer and GLB loader
src/render/config/VisualRenderConfig.ts         live renderer + supporting-map strengths
src/render/materials/ExternalSurfaceTextures.ts supporting-map provenance and load contract
public/assets/textures/terrain/                 published ground supporting-map WebPs
tools/vite/runtimeAssetCatalogPlugin.ts         virtual runtime-only catalog projection/HMR
tools/vite/artYardPlugin.ts                     published yard + DEV stage routes
src/art-yard/ + tools/art-yard/viewer.html      interactive asset review surface
tests/visual/candidates/                        unapproved gameplay-camera captures
```
Game consumes optimized assets; art tools produce them. Do not couple asset generation to gameplay logic.

# 2. Geometry & Shading Implementation Rules

All output MUST follow `04` Global Visual Grammar. Pipeline-specific rules:
- design low-poly geometry from the start; do not make realistic high-poly meshes then decimate;
- silhouette → primary mass → secondary structure → sparse tertiary detail;
- strong readable planes, controlled asymmetry, slightly exaggerated proportions;
- bevels small relative to object, usually **1 segment**, occasionally 2 on hero assets; deliberate/weighted normals where useful;
- smooth/selectively smoothed: traversable grass/soil/path terrain where regular mesh topology would otherwise dominate; macro landforms and semantic material regions retain the stylized read;
- flat/faceted: cliffs, terrain cuts, exposed banks, hero landforms, rocks, mountains and structural decoration (water is smooth; `04` §8);
- authored normal interpolation: characters/creatures, trunks/stems, shaped produce, cloud masses and rounded tools/vessels/ropes/hull curves; vegetation crown lobes and broad leaf folds may deliberately use planar faces to retain the low-poly form required by `04` §9;
- the `foliage` surface mode is for thin rooted blades. It smooths like `rounded`, then bends each smoothing group toward the asset's up axis only as far as every face's winding allows, so a grass blade shades like the meadow rather than as a grey or black shard and a root cap keeps its own normal. The frozen `grass_clump` output carries it, and a port must reproduce it; planar and rounded output is unchanged;
- hard edges: planks, roofs, doors, blocks, crates, docks, fences, beams, stairs.
Never rely on default smoothing.

Procedural catalog entries may opt into `surfaceAuthoring: { normalPolicy: "authored", facetColors: "rest_face" }`. This is a build-time contract, rejected for `authored_glb` (a source GLB owns its normals and colours); the runtime catalog projection, IDs, pivots, collision, sockets, animation timings and LOD interfaces remain unchanged. It means: planar and rounded surfaces are tagged before joins; broad construction regions may carry the shared value zones (`sunTop`, `weatherSide`, `groundContact`, `patch`, `wear`), whose multipliers the optional `surfaceAuthoring.valueZones` object overrides per asset within its bounded schema range; after LOD construction, angle-weighted corner normals are computed across connected rounded faces, stopping at sharp edges, planar boundaries and a crease limit, and material boundaries alone do not split normal groups; the facet colour bake resolves the rest hierarchy, so animated parts do not carry restarted lighting ramps. The frozen families' GLBs carry the retired Blender implementation of this bake. An authored generator that declares the contract produces the same result with the kit (`shade`/`tone` value masks inside the `COLOR_0` contract, explicit flat or smooth normals), and `surface_contract.mjs` enforces the decoded result on every built and published asset that declares it: one constant colour per facet and no averaged normal opposing its triangle's winding.

Organic junctions use shared boundary loops or deliberately matched attachments before skin binding (the kit's lofts bury a limb's root station in the body). Joining meshes is a packaging operation, not a continuity test. Keep separately constructed boards, horns, clothing, handles, leaf blades and hardware separate. Reuse lofts, limb tubes, profile sweeps, conforming shells and profiled vessels, and chamfer structural hard-surface meshes after construction; make rims, hulls, blades and roof edges thick enough to read, with actual working openings. Existing species profiles, crop stages, wind attributes, mounted contacts and clip timing remain owned by their catalog/generator contracts.

Tube and blade cross-sections transport their frames through bends instead of switching reference axes. Branch rings retain the opening's polar angles and use fitted collars; closed leaf caps must have consistent outward winding on both sides of a frond. Strongly folded polygons split into their actual planes before normal-group evaluation while retaining one original authored face color. The decoded procedural surface gate rejects averaged corner normals that oppose a triangle's winding, including secondary material primitives and reduced levels.

Palette-only procedural surfaces export no unused UV layers. Stray UVs have no appearance role and must not create vertex seams or destabilize semantic determinism. Textured authored GLBs keep their `TEXCOORD_0` and bypass this surface finish entirely.

Runtime crop batches retain exported normals when merging palette regions and use those normals in their shared wind material; they must not replace them with derivative flat shading. Authored planar corners remain sharp in the normal attribute. This preserves one instanced batch per crop stage and the existing wind and lifecycle behavior. `tests/unit/cropAuthoredSurface.test.ts` checks the published stage GLBs through that runtime batching path.

`tests/unit/authoredKit.test.ts` covers kit winding, normals, markers and determinism, and `tests/unit/authoredPipeline.test.ts` every authored asset's art contract and byte-for-byte determinism. `surface_contract.mjs`, called by the normal CLI validator, checks every decoded material primitive in raw and optimized GLBs, including skin weights before Three.js can normalize them. It also samples exported skin deformation and loop endpoints on all LODs after reduction. Animated authored GLBs (the adapted characters and animals) receive those final deformation checks while retaining their source color policy; `npm run art:test` covers the checker. These checks do not certify appearance. Selected no-publish generation, semantic determinism and validated publication use the existing CLI; membership comes from the active catalog and registry. Preserve static instancing declarations and rigid-part batching, and measure the production cost of skinned surfaces under matching scene conditions.

# 3. World Scale & Modular Standards

`1 world unit = 1 meter`.

The current runtime world is a finite authored composition: `WORLD_LAYOUT_V5`
is a retained implementation symbol; layout revisions belong to `01` §6.1. The
terrain field is 600 m. Runtime chunk streaming is not implemented. The
following values are **authoring heuristics only** for making reusable forms;
they are not runtime grid, streaming, or asset-budget contracts:
```text
Building modules: 2m / 4m / 8m
Fence module: 2m
Path module: 2m
Terrain chunk: 32×32m
Large streaming chunk: 128×128m
Rotation snap: 15° / 30° / 45°
Common prop scale: 0.90 / 1.00 / 1.10
```
The 32 m terrain grouping may help authoring or future tooling; the 128 m
streaming concept is future-only and must not be described as a live system.
Break repetition using controlled offsets, scale/rotation variation, terrain
adaptation, clustering, landmarks, and irregular paths.

# 4. Material, Vertex Color, Texture & Palette Systems

The canonical vocabulary is `art/palettes/neva.palette.json`; use its lowercase semantic tokens, for example:
```text
wood_honey_01 / wood_warm_01 / wood_dark_01 / wood_weathered_01
stone_golden_01 / stone_warm_01 / stone_cool_01 / rock_coastal_dark_01
foliage_sage_01 / foliage_olive_01 / foliage_shadow_01 / soil_warm_01
roof_terracotta_01 / roof_turf_01 / metal_dark_01 / metal_brass_01
canvas_cream_01 / rope_hemp_01 / foam_warm_01 / emissive_lantern_01
```
Variation comes mainly from geometry, vertex colors, palette/hue shifts, roughness, lighting/AO, controlled semantic fields/masks—not unrelated materials. Terrain, road, shore, farm, and cover consumers must derive from the same authored world-layout semantics rather than maintaining visually similar but independent masks.

Vertex colors are first-class. For the opt-in `rest_face` bake, multiply the linear palette RGB by `0.91 + 0.07 * dot(faceNormal, assetUp)`, using the authored face normal in the asset's rest space, and write one identical value to every corner of that face. Broad authored value zones are the only sanctioned way to carry wear, weather, moss/ground or patch value changes beyond that base: a tagged face multiplies the base by its zone's bounded multiplier (the closed zone vocabulary, its bounds and the shared default multipliers live in the catalog schema's `surfaceAuthoring.valueZones`, which also bounds per-asset overrides). Zone tagging survives joins, is removed before export, and must stay broad — one zone per construction region, never grain, noise or per-triangle variation, and it may not cross a palette-token boundary or create a normal seam. The finalizer runs after joins and LOD construction and before export. It replaces per-component height/key-direction gradients, so moving parts do not carry separate restarted lighting ramps. Keep authored material regions broad and purposeful; do not create a normal seam or extra material just to change a face's value. Export through the shared `COLOR_0` path for every material primitive, including secondary material primitives. Semantic terrain/supporting-map fields and preserved imported-source colors retain their existing owners. **Never uncontrolled random RGB.**

Textures support, never define, style. Use for subtle roughness, stylized masks, AO/lightmaps, decals/signs/markings, and the ground supporting-map contract in section 6.2. Normal targets follow `04`: **128–256 tiny, 256–512 normal, 512–1024 hero, 2048 rare/shared exception**. Any broader 1K–2K architecture allowance is a ceiling, not the default. Avoid photogrammetry/photo bark-rock-grass as final albedo, noisy terrain, excessive resolution, high-frequency normals/micro scratches/scans. Processed CC0 supporting maps are allowed only as the Art Bible's low-frequency tiler: local reduced derivatives, world-space sampled, palette-remapped, and owned by `VisualRenderConfig` plus `ExternalSurfaceTextures`.

Use shared palette tokens (`wood_warm_01`, `stone_warm_01`, `foliage_spring_01`, `water_shallow_01`, etc.). Do not scatter arbitrary runtime colors. The palette JSON owns token definitions; `04` owns their visual use. This pipeline exposes them through one runtime material API such as `PaletteTokens.ts` + `PaletteMaterials.ts`.

Minimum production behavior:
```ts
const wood = paletteMaterials.standard("wood_warm_01", { vertexColors: true });
const stone = paletteMaterials.standard("stone_golden_01", { vertexColors: true });
```
Implementation syntax may differ, but material requests must resolve through shared cached families. Builders/agents may apply deterministic bounded vertex-color/value variation; they MUST NOT create a new material instance/hex color for every prop. Debug-only colors are exempt. Asset-spec validation should reject unknown palette tokens.

Seasonal presentation is derived by `simulation/presentation/SeasonPresentation` and consumed by `SeasonalTint` in foliage/cover shaders and `LightingRig`. The palette ramp lives only in `VisualRenderConfig`; shared uniforms add no instance attributes or geometry. `WindowMaterial` varies existing architecture-window emission by pad cohort under the same practical-light envelope, without adding practical lights.

# 5. Lighting, Baking & Canonical Renderer Configuration

Lighting follows `04`: warm sun + soft/cool sky contribution + controlled AO/contact + atmosphere + restrained emissives + filmic tone map. Sun direction must reveal planes; shadows welcoming but grounding; AO visible at contacts; avoid flat/harsh HDR/pure-white sun. Use globally controlled exposure, not per-scene hacks.

Implement one render-subsystem-owned `VisualRenderConfig` (name may differ) that centrally controls output color space, tone mapping, exposure, sun/fill baseline, shadow quality tiers, AO/contact policy, atmosphere/fog, restrained bloom and global grade, and the live ground supporting-map sampling/blend strengths. Gold-standard slices calibrate its exact numbers; after approval, renderer changes are explicit art-direction changes with benchmark review.

Semantic systems may modify it through controlled inputs (time of day, season, weather, quality mode). Zone/asset code may NOT independently override global exposure/tone mapping/saturation or create a different world-lighting stack to rescue one scene. Fix the asset/composition/local practical lighting, or deliberately revise the canonical config and re-run all gold slices.

The runtime presentation layer smooths integer clock advancement and explicit time skips over a continuous wrapped day-cycle envelope; canonical `GameMinute` remains unchanged. Quality selection and Auto adaptation similarly target a continuous low→medium→high level: blend density/distance and effect strength, rate-limit repeated population/LOD rebuilds, and stage discrete DPR/shadow/post ownership at adjacent-tier crossings. Do not allocate every quality-dependent render target or repopulate every repeated system in the input/UI callback.

Shadow filtering is tier-owned in `VisualRenderConfig.shadows.type`: Low uses the single-sample depth comparison, while Medium and High use soft PCF. All retain the same silhouette-casting and atlas ownership. The atlas combines packed depth for Basic/PCF filters; variance shadow formats require its legacy path. A performance comparison must retain shadows and report the actual filter, rather than treating a shadow-disabled diagnostic as the delivered result.

`AtmosphereSky` owns the procedural weather sky, its bounded linear-radiance render target, and the small `CloudShadows` sunlight-transmittance map. `RendererPipeline` renders it inside the frame timer before the opaque world and existing water capture, includes it in target diagnostics, and warms its shader during entry preparation. The sky display participates in the same tone-map/output path as the world. World-space field advection survives wind changes; deterministic weather-shaped masses have vertical profiles and subtractive erosion, with a short sun transmittance march on High. Medium/Low use cheaper layers from the same field. Fixed spatial sample offsets break up horizontal integration bands; a compact five-tap reconstruction filters that integration noise in the fresh reduced-resolution linear frame. The same target carries cloud/moon transmittance in alpha. The existing full-resolution sky display adds seeded, pixel-filtered star points after cloud reconstruction, applies that transmittance, then restores opaque output alpha. Stars add no target or geometry submission and share the sky camera, seed and night-visibility uniforms. There is no frame-index noise or temporal history: no stale sky can survive a cut, resize or quality change. This is a bounded coastal-world adaptation of the cloud skill's weather-volume approach, not its planetary shell/package stack.

`cloudFieldGlsl` is the shared cloud-density owner for the sky and world-projected sunlight. The shadow map follows a texel-snapped world region, corrects receiver elevation, and fades at its bounds and low sun angles. Palette, terrain, vegetation and water materials consume that one map; it attenuates solar illumination while preserving sky fill and local lights.

`WeatherPresentation` eases cloud cover, storm/clear appearance, precipitation, visibility, sea roughness and the shortest wind-heading arc once per presentation timestamp. The simulation weather and forecast remain untouched.

`AtmosphereMaterial` composes those shared receivers with `AerialPerspective`: a bounded analytic height/distance segment model using meter-scale world coordinates, the sky’s zenith/horizon radiance and the same base haze coefficient. Haze is applied in linear radiance before tone mapping, replaces the standard fog mix on affected surfaces, preserves the finite-world distance cutoff, and is shared by both water tessellations. Water accounts for haze already present in its opaque snapshot instead of applying it twice. This uses the atmosphere skill’s small-world analytic tier; planetary LUTs and ellipsoid transforms are unnecessary for these islands. Sky and shared lighting both suppress lightning under reduced motion.

`bindGtaoSceneDepth` in `RendererPipeline.ts` binds the current composer read buffer's depth before GTAO gathering, including after buffer swaps and resize. Gathering and bilateral denoising use the installed GTAO shader's depth-derived view normals, so the AO path follows depth-writing geometry and its actual shader displacement/discard behavior without an extra override-material scene draw. Non-depth-writing transparent effects do not become opaque AO surfaces. The scene/composer owns this borrowed depth; GTAO teardown must not dispose it. Diagnostics inventory both gather and denoise targets. Keep existing quality tuning, temporal reuse and world content unchanged, and verify contacts in the farm, bridge, harbor and coast views; this is not motion-vector temporal accumulation or a claim that the overall render budget passes.

Do **not** use normal-world toon/ink edge rendering: inverted-hull outlines, Sobel/post edge outlines, black mesh edges and comic contours are prohibited. Selection/debug/context highlights may use temporary outlines if they are clearly UI feedback rather than the base art style.

Bake static information where useful: lightmaps, AO, vertex AO, static shadow gradients, emissive masks. Real-time lighting focuses on sun, moving actors/props, weather/time, gameplay lanterns, temporary effects. Do not spend runtime budget on static detail that can be baked safely.

# 6. Water & Vegetation Implementation

`LandscapeWind` adapts the procedural-vegetation skill's stylized-meadow traveling front to Neva's existing catalog GLBs and shared material variants. World-space gusts and a world-to-local vector transform keep differently rotated/scaled instances aligned with weather; tree color and coastal depth passes share that deformation. Ground-cover provenance supplies local woodland/grove shelter without per-frame habitat sampling. Instancing, stable near/far selection and frustum compaction remain the population owner; wind padding is measured in world meters. No alternate palette/shader lighting system is introduced.

The connected short-grass carpet is the one runtime procedural vegetation surface, owned by `src/render/vegetation/` in the same way as terrain and water.
- **Source data.** `MeadowFieldSource` copies heights and a cover control grid out of the indexed terrain geometry, using the semantic weights the terrain already blends. It rasterizes the road ribbon's broad material coverage, architecture pads, the interior pocket and ground-touching collision footprints into an exclusion field. The road and meadow exclusion share the world-space edge cell and fade at the control grid's resolution; camera-pixel antialiasing and fine dither remain in the road shader. The channel contract and memory are documented in that file.
- **Draw path.** `MeadowField` draws world-aligned tiles as two instanced blade strips per terrain patch, a near and a far detail. Blades are placed, bent, coloured and lit in the vertex stage; the shader samples the drawn triangle surface, so roots never float or sink. Tiles are player-anchored, and each tier draws a stable prefix of one low-discrepancy sequence. Wind uses the shared `LandscapeWind` front and the player's push.
- **Shading.** `MeadowColorField` is the palette-token colour field that both the terrain and the blades evaluate. Its broad growth signal also controls bounded blade height and density through `VisualRenderConfig.meadow.field`, so patch variation does not add candidates or shader noise samples. It applies the shared `SeasonalTint` transform once. Blade materials chain the standard `AtmosphereMaterial`, cloud shade and rain response. The backlight term rides the standard direct-light path, so shadow and cloud shade already dim it.
- **Replaces.** The carpet replaces the `foliage_grass_a/b/c` scatter. Those catalog IDs remain reviewable but are no longer placed.
- **Review.** The Art Yard previews the carpet with `?ground=meadow`.
- **Ownership.** `VisualRenderConfig.meadow` and `quality.meadowField` own every number.

`waterField.ts` owns the baked water field: one 3 m lattice with two encodings — the profile texel (RGBA8: river weight, ocean weight, and the local travel direction stored as a vector, so linear filtering cannot swing it through the opposite heading at ±π) and the depth texel (RGBA16F: still-water column depth, bed elevation, signed shore distance, coastal contact weight). `WaterFieldStore` computes texels lazily through the canonical marine/shore queries and memoises them; the startup bake walks the remaining texels cooperatively through the same function, so the textures upload the very arrays the CPU wave mirror samples and lazy and baked texels are byte-identical. `waterFieldUvTransform` lands every lattice node on a texel centre, so the store's bilinear sample reproduces `LinearFilter` exactly; the former `(p - min) / size` mapping displaced the whole field by up to half a texel. Dry texels carry the river class `WATER_FIELD_BANK_DILATION_METERS` onto the bank, because a land texel otherwise reads as open sea and filtering blended sea swell into narrow channels. `WorldLayout` conservatively indexes coast-segment bounds to reject contact samples beyond every shore treatment's reach; the harbor override remains first, and eligible samples retain the exact projection and contact formula. Sampling remains cooperative and abortable, with no textures allocated until both arrays are complete; the startup timing marks still identify water-field preparation separately from water geometry.

`WaterLod.ts` draws the horizontal sea as a camera-centred CDLOD lattice: a world-aligned quadtree is selected once per frame against distance rings and the view frustum (`FacetedWater.updateCamera`) and drawn as instances of one 16 × 16 patch and one quarter patch — two draw calls for the whole visible sea. Cells double with every ring from `VisualRenderConfig.waterSurface.lod.finestCellMeters`, which keeps the triangles at a roughly constant size on screen. Inside the outer part of each ring the odd vertices slide onto the next-coarser grid, so a ring is geometrically identical to its coarser neighbour at their boundary: no cracks, no popping, and node origins on fixed world positions so the lattice never swims. `waterLodRanges` rejects any `rangeScale`/`morphStartRatio` pair that breaks the crack-free inequality, and `tests/unit/waterLod.test.ts` checks every ring boundary for T-junctions and the selection for single coverage. Wave bands are faded out of a ring's geometry before they could alias (`WATER_WAVE_CONFIG.lodSamplesPerWavelength`, evaluated at the morphed cell size so both sides of a boundary agree) and reach the shading instead as slope variance. The elevated headwater reach keeps a fixed, row-refined surface over exactly the rectangle it owns (`createWaterGeometry`, densified across the fall face); it and the sea-level lattice split on `nevaHeadwaterOwnsSurface` with complementary discards and the same horizontal-orbit suppression toward their seam. Culling tiles and the near patch are retired: the lattice itself is the near detail.

Water follows `04` §8: continuous depth absorption and real shallow-bed visibility, a smooth surface of gentle plane-wave swell with fine ripples from a detail normal map, angle- and roughness-dependent reflection of the atmosphere's sky probe, and arriving/breaking/spreading surf. Permanent intersection outlines remain superseded. `HarborCoast.ts` supplies the pure coastal profile to `WorldLayout`; marine queries and the derived depth texel sample the same indexed terrain bed. Shore distance locates contact but never substitutes for depth. The swash is one shared level (`nevaSwashLevel`, mirrored by `swashLevel()` in `WaterSurface.ts`): the water surface is lifted by it across the swash zone and `nevaCoastalWash` darkens and laces the terrain against the same level, so the wet line and the water's edge cannot disagree. Boat presentation against that field — the crest-riding blend, the bounded rough-water lift, hull heave/tilt smoothing, the hull contact-foam energy and the storm-helm heel and wreck-list echoes — belongs to `VisualRenderConfig.boats`. Physics and `WaterSurface` own the canonical waterline and the single numeric wave field: the CPU mirror reads the baked field through `WaterFieldStore`, so a hull floats on the surface that is drawn, and a height query costs about a microsecond once its texels are warm. Keep these queries acyclic and preserve elevated headwater baselines.

The elevated reach is a moving river, not a raised lake. River ripples are advected with the two-phase flow-map scheme in world-aligned texture space — two copies offset along the baked channel tangent by at most one cycle of travel, half a cycle apart and cross-faded — so offsets stay bounded and the pattern follows every bend instead of shearing; drifting light/dark patches and bank lace ride the same scheme, at a depth-scaled speed (a shallow bank drifts slower than the thalweg). Never rotate or scale texture coordinates by a spatially varying direction: levered by world position it shears the pattern into stripes. The shading darkens the deep thalweg, keeps the shallow shelf pale from the sampled bed depth, thins the surface into the bank, and adds rapids ribbons with the patchy grade gate. `HeadwaterFall.ts` draws the authored drop as a ballistic nappe pinned to the lip and the landing, with a convex cross-section, slow rope-like ribs shaded by the gradient of the same field that displaces them, detail ripples streaking down the sheet, soft-edged threads that stretch and converge along the arc, sky-probe reflection blurred by aeration, a crest highlight, an opaque plunging body whose only soft parts are the ragged rim and glassy crest, a submerged foot that continues the arc below the pool surface (`sinkRunMeters`), impact plumes, and deterministic soft, noise-eroded spray puffs (`HeadwaterFallMist.ts`); `waterShadingGlsl.ts` adds radial plunge rings gated to flat pool water. All of it is presentation over `NEVA_HEADWATERS`; `VisualRenderConfig.waterSurface.headwaters` owns the numbers, and no capture read is introduced.

`CoastalOptics` shares the canonical `MAINLAND_LAKE` bounds with all water materials, and `waterShadingGlsl` uses that regional weight to attenuate lake current and detail while retaining the freshwater classification and wave displacement. Freshwater absorption, lake ripple and current scales belong to `VisualRenderConfig.waterSurface.optics`. Optical alpha is unpremultiplied before the separate shoreline-coverage fade; captured and uncaptured tiers apply that coverage consistently. Current noise is skipped outside flowing freshwater, and plunge noise/rings are evaluated only near the headwater basin. Thresholded foam/filament fields remap signed noise to a bounded unit interval. The fall packet phase uses monotonic ballistic travel time, and SSR accepts only a real negative-to-positive depth bracket.

`RendererPipeline` owns the High-tier opaque color/depth snapshot, captured once immediately before the first water draw from the active scene target. `OpaqueWaterSnapshotPass` performs one same-resolution fullscreen GPU draw: integer texel reads copy linear color and sampled hardware depth directly, with `AlwaysDepth` and depth writes preserving even far-plane pixels. It avoids the synchronous unpack-state queries in the installed Three.js texture-copy path, does not tone-map or blend, and never re-renders scene geometry. Entry preparation compiles this shader against its linear snapshot target; the nested draw suppresses shadow updates and XR, preserves automatic-clear state, and restores the active target, cube face and mip level. The pass owns and disposes its quad/material with the pipeline. Separate sampled textures prevent feedback; reconstruct underwater thickness with the camera inverse projection and reject refracted samples that are off-screen or in front of the water. Do not render the opaque world again for refraction. Lower tiers blend bathymetry-based transmission over the real opaque bed. Extinction grows with sea state on every tier (`optics.roughTurbidity`), so the faceted terrain never shows through deep, rough water. Normals are smooth: the interpolated analytic wave normal plus ripple gradients from one procedural, tileable detail normal map (`WaterDetailNormals.ts`, mipmapped, sampled in world-aligned texture space — two drifting layers on the sea, the flow map on rivers). The mip shortfall of the averaged normals is Toksvig slope variance; together with the wave bands a ring cannot draw it lowers grazing Fresnel, lifts and blurs the reflected sky and widens a GGX sun lobe, so a distant sea keeps its colour and a glitter path instead of mirroring the horizon or sparkling into noise. Reflection samples the atmosphere's equirectangular sky probe (`AtmosphereSky.reflectionTarget`, rendered from the sky shader every few frames at `atmosphere.reflectionProbe` resolution) through its mips by roughness, rescaled to the palette sky's mean brightness so HDR sky radiance cannot swamp the palette-unit body; SSR blends onto it on High. The swash lip and object-contact foam sit on a band measured horizontally from the water's edge (column depth over its local gradient), over the smooth baked bed (the exact snapshot depth follows every terrain triangle and drew zig-zag lines), switching to the exact column only where it rises steeply at rocks, posts and hulls on the captured tier and only in rough water. Every GLSL water surface applies the normal tone-map/output-color conversion. Resize, quality changes and disposal release owned targets and clear sampler references. `VisualRenderConfig` owns optical and material tuning.

`HarborCoastLayout.ts` authors the connected habitat through the existing catalog placement/culling path. New palms and understory use closed geometry and exported `_NEVA_WIND` weights; trunk and petiole bases remain anchored, and shadow materials use the same weighted deformation. Compatible geometry/materials retain instancing/batching and conservative animated bounds. On the market approach, reserve crown clearance behind the default camera boom as well as trunk clearance beside the footpath; validate this in moving traversal, since fixed views can miss canopy occlusion. Other tree families retain their established motion. New huts keep wall openings, floor/threshold collision and ordinary human scale. Existing coral IDs remain in `WorldEnvironmentLayout`, placed beyond the shallow wash shelf with their catalog heights fully submerged; transparent water must not expose formerly hidden dry coral tips. `CoastalSurfaceMaterial` supplies bounded mineral/roughness variation to the coastal stone tokens through the shared material cache; it does not bake lighting or add a separate color pipeline.

Coastal rock placement must clear the catalog-projected rowboat and skiff hulls at the unchanged moorings and along their immediate departure lanes. A sailable terrain sample alone cannot establish that a new rock leaves the vessel usable. The harbor collision regression checks the published compound hulls against the same projected rock boxes used by runtime physics; existing physics owns recovery from a saved penetrating hull.

Vegetation is generator-family based:
```text
TREE_PINE TREE_OAK TREE_FRUIT TREE_BUSH
FLOWER_WHITE/YELLOW/RED
GRASS_SHORT/TALL
REEDS CATTAILS
```
Families support seed, height/width, canopy clusters or authored fronds/leaves, trunk bend/branches, palette, scale and asymmetry. Clustered crowns remain appropriate for inland trees; leaning coastal palms use distinct open frond silhouettes. No smooth spheres.

Shallow sunlit beds carry a stylised caustic network in `waterShadingGlsl.ts` (`nevaCaustics`): two drifting Voronoi cell-edge layers, multiplied so the network breaks and re-forms, displaced by the surface slope over the bed. On the captured tier it modulates only the captured bed radiance before absorption, excluding the captured aerial inscattering; lower tiers lighten the shallow body instead. `FacetedWater` shares the actual solar direction/strength with both surfaces independently of the moon/lightning reflection key. Depth, roughness, cloud shade, sun elevation, freshwater and pixel footprint suppress the response; `VisualRenderConfig.waterSurface.optics` owns its strength and depth fade. No new target, draw call, displacement or buoyancy formula is introduced.

## 6.1 Terrain, Route & Ground-Cover Implementation Contract

`RainSurfaceMaterial` composes a palette-family albedo/roughness response before shared Standard lighting. `PaletteMaterials` retains semantic token metadata when names change on vegetation or ground-cover clones; the existing atmosphere hook chains rain after each authored surface/wind patch. `WorldScene.updateEnvironment` supplies the terrain's current wetness and the same interior exclusion used by rain. It introduces no independent weather clock, texture, render target, material clone or draw. The resolved world normal supplies a bounded upward/runoff mask; it does not test awning/roof visibility. Fogless UI previews opt out through `USE_FOG`. Wood/stone/foliage response numbers belong to `VisualRenderConfig.rainSurfaces`; soil, roads, water and character skin retain their existing owners. The precipitation skill informed shared-event and normal-mask principles; no GPL puddle example source or assets were copied.

Implement the Art Bible's five ground layers through one coordinated presentation contract:

1. Authoritative world-layout/route/shore/farm data owns semantics that affect traversal, collision, placement or map projection.
2. A single deterministic derivation exposes filtered surface weights/influences for grass/meadow/soil/path/shoulder/beach/riverbed/wet shore/cliff (names may evolve with the canonical palette and world model).
3. Terrain geometry/materials, road presentation, shoreline dressing, and cover placement consume those shared signals.
4. Weather/time/quality mode modulates presentation through `VisualRenderConfig`; it never mutates gameplay moisture or creates local renderer baselines.

Representation is deliberately not prescribed. Analytic queries, vertex attributes, compact per-chunk control textures, or cached buffers are allowed. Select by measured update cost, texture/fill-rate cost, transition quality, diagnostics, and maintainability. If using a control texture, document channel semantics, world bounds, filtering, generation seed/input hash, invalidation, and memory in the owning implementation—not in a parallel art spec.

Sunreach's `WorldLayout.terrainSurfaceSample` blends sand, worked ground and seabed weights across the indexed coast. A binary land/water switch in these material weights makes the terrain cells visible through shallow water even when the sea-level geometry is continuous. This filtered presentation transition does not alter marine membership, terrain height, collision or saved state.

Surface-detail tangent frames are constructed in world space and transformed back into the standard shader's view space, so camera orbit cannot rotate the apparent relief. Terrain rain roughness is applied after dry supporting-map blending.

`TerrainSurfaceMaterial` explicitly opts out of the palette-object rain hook: its cloned foliage token describes the base palette, while its mixed soil/shore shader already owns wetness. Shared cloud shade and aerial perspective still apply. Sunreach's dry palette is a normalized byte per terrain vertex derived from the canonical drainage sample, retained by spatial batching. Dry slope exposure uses the same protected grass-to-stone presentation transfer as the headland, leaving canonical surface weights intact. The shared material remaps broad ground/stone color, protects farm and marine weights, and adds no texture or material instance. Neva's climate weight is zero. The existing supporting-map signals provide variation; they do not create a new ecology or gameplay field.

Terrain normals are class-aware. Normal continuity may cross non-feature triangulation edges in broad traversable grass/soil/path regions when flat triangles read as topology. It stops or transitions deliberately at authored ridges, terraces, cliffs, cuts, exposed banks, rock shelves, and hero landforms. Never globally smooth every surface or globally flat-shade the terrain as a shortcut.

`TerrainSurfaceMaterial` samples the existing shared meadow field at terrain vertices and passes carpet/thatch colors to the fragment stage; sub-grid clump brightness uses its mean rather than aliasing into coarse triangles. The shared field overload preserves detailed clump sampling for grass. Fragment distance blending still matches the live grass radius and both stages use the same seasonal palette. Grass supporting maps are sampled only on vegetated fragments, and beach maps only where shore semantics contribute. Terrain underlay reuses the evaluated ground cell instead of a separate cellular query. Unworked soil and damp banks use the existing dry/damp soil weights for both palette and roughness, while mineral warmth and sheltered moss reuse broad supporting-map signals and the already computed face normal. These are material responses on every island, with no change to terrain positions, normals, canonical surface weights, placement membership or save layout.

Road implementation requirements:
- preserve the canonical wheel-wear and shoulder profile in normalized render-only `roadProfile` attributes. `RoadSurfaceMaterial` applies that wear after supporting-map color, couples it to roughness, and uses pixel-footprint filtering at the exposed coverage edge; `VisualRenderConfig.roadSurface` owns the strengths.
- reuse the existing edge cell for shared boundary variation; interrupted wheel wear and greener loose-shoulder pockets reuse supporting-map signals. Color and roughness consume the same wear breakup without adding another field or moving the canonical coverage edge.
- derive exposed junction coverage on the conformed render clone from the canonical route cross-section and junction core; keep collision positions and indices identical. Shore-facing headland rock exposure transfers grass/meadow weight to cliff only in render attributes, using canonical slope/coast signals and the strength owned by `VisualRenderConfig`; protect farm and route cores.
- one authored route/profile owner for geometry, terrain grading, surface influence, map projection, cover exclusion, and relevant collision/interaction queries;
- any deformation that materially changes the walkable surface is incorporated into the canonical height/normal query used by rendering, Rapier, placement, and affected anchors; cosmetic shader displacement stays below visible render/collision mismatch and never changes traversal;
- route-kind widths, crown/depression/ruts, shoulders, feather, junctions, caps, bridge transitions, and steep-route cuts are explicit/profiled rather than scattered magic numbers;
- a terrain-conforming road mesh is permitted when it is visibly integrated and robust against z-fighting; shader/control-field-only roads are also permitted; neither approach may create a second route network;
- the visible merge has one owner: do not stack a coarse terrain-grid dirt tint under a broad transparent road feather. Use a narrow world-space irregular coverage transition with pixel-scale anti-aliasing and, when the post path has no MSAA, world-space dither so it cannot form a muddy halo or change through transparent draw ordering;
- road center, shoulder, and surrounding cover are reviewed together from gameplay cameras.

Ground-cover implementation requirements:
- deterministic world-seed derivation with stable placement IDs where identity is exposed;
- one inspectable composition sample combining authored district envelopes, route projection, river/floodplain causes, openings, architecture/farm/landmark/fishing/coast clearances, and independent category-salted macro/meso fields;
- independent category candidate streams and species hashes, deterministic priority inhibition, and explicit core/edge/isolate/landmark/riparian/route-frame roles; IDs derive from category/address/slot rather than accepted-array index;
- semantic density plus authored exclusions/clearances, clustered patch signals, variant families, and patch-level palette grouping;
- short grass and tall meadow cover reuse assembly-space wind height for a bounded base-to-tip value ramp, owned by `VisualRenderConfig.groundSurface`; retain flower colors, instancing, wind anchoring and bounds. Rooted grass, tall meadow and flower instances bend their authored normals toward the terrain normal (`groundSurface.foliageNormalUp`), so thin closed blades never take only the ground bounce;
- the short-grass carpet itself is `MeadowField` (section 6). Its density derives from the terrain's shared semantic weights and its exclusions from the same road ribbon and collision footprints, never from an independent mask;
- high-count uniform geometry uses `InstancedMesh`/the established batching path, with quality-tier counts and draw-distance culling. Fine grass patches follow the canonical terrain tangent; `VisualRenderConfig.quality` owns their separate near draw distance and bounded distant instance cap so greater meadow coverage does not multiply full-detail grass across the horizon. Catalog LODs retain a stable subset of the same roots. Ground-cover batches submit one detail level per placement, selected by player distance and quality; camera changes only frustum submission;
- structural landscape batches choose catalog LOD once per complete placement, sharing the decision across material parts and ignoring fog-rejected cells. Trees, buildings and major rocks retain structural range on every tier; small rocks and understory use `quality.landscapeDetailDrawDistanceMeters`. `quality.groundCoverInstanceCap` bounds each catalog asset's submitted clumps independently of total continent population. Higher tier restores detail without regenerating placements or changing collision;
- distance selection and world-asset LOD membership are anchored to the player/world focus. Camera orbit, pitch, zoom, and look-ahead direction may not reshuffle instances or switch asset membership; ordinary off-screen frustum rejection remains allowed;
- short cover generally receives light but does not cast dynamic shadows; reserve real shadows/contact for readable clumps and anchors;
- changing quality tier may reduce count/distance, not change route readability, shoreline continuity, collision, or gameplay truth.

Do not derive bushes from grass coordinates, cycle assets by accepted-array index, fill fixed ellipses, lay reeds at a fixed cadence, or use a habitat-cell lattice as visible coverage. Hashed candidate addresses are allowed only as stable invisible address space. Authored overrides remain available for deliberate layout-editor pins, but seeded overrides must be empty while the field rules are being accepted.

River-facing consumers use `WorldLayout.riverSectionAt()` and `riverBankSample()`: independent left/right water widths and banks, moving thalweg, bed elevation, floodplain, wetness, erosion/deposition, and estuary influence are canonical. In natural reaches, terrain meets surface elevation at the declared water edge and rises onto dry banks; the engineered bridge and estuary retain their transition contracts. Terrain height/normals, Rapier support, water sign, walkability, fishing access, soils, rocks, riparian cover, roads, and bridge approaches must not recreate the river from an absolute centerline-distance formula.

The retained starter mountain form and walking benches come from `NevaLandforms`; its rounded trail samples are shared by the route compiler and bench-distance query, while sparse authored elevation knots bound the walking grade. Broad bench feathers release into the watershed, and the farm trail retains grade ownership where a freight-road feather overlaps it. `WorldLayout` owns the upper valley and canonical river meanders, widths and bed scour. Trail fill releases continuously across the riparian bank rather than stopping at a binary water-distance cutoff; the mainland's larger crescent, settlements, river and routes come from `NevaMainland` through canonical terrain. The patch registry retains the original detailed grid and adds adjoining bounded grids whose wider authored features remain resolved. Route geometry, map projection, collision and vegetation clearance consume the same paths. The coastal village-to-Highridge profile shares `NevaLandforms.nevaBaseGroundHeight` with the retained terrain and blends into the mainland landform before its bounded grade is computed. Preserve working-pad datums only at the village gateway; do not extrapolate those datums along the coast. Inland exposure extends the shared stone/soil field and suppresses exposed summit cover without adding a second material palette.

Mainland composition consumes `mainlandBiomeWeightsAt`, shared water/height queries and the compiled road projection. `MainlandSettlementLayout.mainlandSettlementClearanceAt` preserves oriented building approaches and specific working stations instead of excluding a whole village radius. `MainlandEnvironmentLayout` gives canopy, understory, outcrops, wet margins and instanced cover independent, jittered spatial addresses. Macro groves, glades and ecotones determine acceptance; local spacing protects physical trees, work sites and stopping places. No global tree quota may leave later parts of the continent blank. New geography may increase the indexed population; shared render quality owns submitted detail distance and LOD, with collision derived from the same complete placement set on every tier. Reuse published LOD tree families for the dominant canopy and keep non-LOD variants as identity accents. Starter scatter addresses remain scoped to their inherited bounds.

`NevaHeadwaters` supplies the finite source bounds and surface-elevation knots to terrain and water. The spring approach remains gently graded, the main drop is concentrated at its bedrock lip, and the receiving plunge basin holds a level surface before the outlet rapids. `HeadwaterFall` sizes the jet from the lip section rather than the pool width, shares the water uniforms, and filters irregular advected filaments without adding a simulation texture or another render pass. `WaterSurface` and the shared GLSL helpers add the same static baseline separately from waves and include the downhill gradient in normals. Both fragment paths clip raised water using the canonical shore profile. The dedicated headwater surface refines rows across the reach it owns; the sea-level LOD lattice takes over at the last elevation knot, where the profile has returned to sea level, on the same world-space ownership test, so there are no overlapping grids with different interpolation chords. `VisualRenderConfig.waterSurface.headwaters` owns row and column spacing and restrained broken-foam tuning; preserve the depth-texel channel meanings and quality tiers. Validate source, downstream join, and nearby dry banks from gameplay cameras, including reduced motion and camera movement across the headwater seam.

World consumers iterate `WORLD_TERRAIN_PATCHES` and sample the closed
coast/marine registry; they do not assume one square heightfield per island or
one centered at the origin. The Neva mainland has adjoining patches with shared
canonical border support. Terrain meshes, translated Rapier heightfields, snapping, routes,
composition, map nodes, water, and diagnostics all resolve the owning island
from world position. The shared water surface may span a rectangular union of
patches, but its shore-profile texture preserves world meters per texel and per
segment, and the global sign treats a point as land when any registered island
coast reports dry ground. Submerged visual aprons soften outer patch seams and
must never become walkable collision or a second shoreline authority.
Sparse channel islets use their own bounded patches and terrain-surface sample,
with compact authored placement clusters rather than a full Neva or Sunreach
composition pass. Keep the southern landing clear, give every islet a distinct
long-distance silhouette, and keep most of the channel as open water. Increasing
the ocean dimensions must not scale the CPU-authored profile/depth texture into
an unbounded startup task; its code-owned world-space sample pitch stays stable.

For continuous grass coverage and blade proportions, the later user-selected `art/references/lush-grass/meadow-reference.png` owns the meadow direction. The starter-farm ground/path pass still uses `art/references/neva-ui-hud-on-foot.png` as its gameplay-distance graphics benchmark. Translate its warm sandy-ochre polygonal paths, irregular but softly integrated grass shoulder, intermittent stepping stones, low chamomile/daisy cover, chunky foliage, wet-edge reeds, faceted crowns, golden wheat/pumpkin-bed read, and warm-key/cool-fill lighting into the canonical route, palette, catalog, instancing, water, and render-config owners. Supporting maps may enrich packed-core wear and meadow meso breakup only after palette remap (section 6.2). The transition must retain broad faceted regions without binary cutout holes, black seams, or a blurry uniform ribbon. Do not copy its camera, UI, layout, composition, depth of field, or tilt-shift, and do not create a second surface field or renderer baseline.

Terrain/ground shader work must use a stable program cache key, fail clearly when patched Three.js chunks drift, keep uniforms/config centrally owned, dispose generated textures/materials, and receive focused tests for deterministic field/texture generation, bounds, mask protection, wetness transitions, supporting-map provenance/load fallback, and program-key stability. Do not copy a reference's realism, texture frequency, or exact numeric thresholds into code without gameplay-camera validation.

## 6.2 Ground Supporting-Map Contract

Ground supporting maps are a renderer presentation system. They are not catalog GLBs, not a second route/meadow mask, and not save-schema. They occupy the Art Bible's optional low-frequency tiler slot.

Owners:

- `src/render/config/VisualRenderConfig.ts` owns `terrainSurface.externalTextures`, `roadSurface.externalTexture`, polygon/edge/path-transition strengths, and roughness bounds. Tune numbers there; do not fork them into a parallel spec.
- `src/render/materials/ExternalSurfaceTextures.ts` owns source name, source page, runtime URL, texture kind, wrap/filter/color-space, and the 1px fallback used while images decode.
- `public/assets/textures/terrain/` stores the published local WebP derivatives. It is not an asset catalog and must not gain a filename-list authority.
- Beach/wet shore use the same application model as meadows: remap the supporting map into palette bands, blend palette base and remapped source through the shared `VisualRenderConfig`-owned strengths, then apply through semantic masks. Vegetation and shore masks are derived from the packed surface field with a gradual crossfade (`vegetationMask`, `shoreMask`); shore also receives the meadow polygon value-band and `terrainShorePolygonTint` stack. Do not route beach through a second attenuated `beachColorMix` pass.
- `RoadSurfaceMaterial` consumes Grass Path 2 on the shared route mesh. `VisualRenderConfig` attenuates its fine color, roughness, and relief contribution while retaining the broader wear and packed-core/shoulder response. Coverage and pixel dither stay on this material; `RoadCoverage.ts` shares its broad coverage field with the meadow exclusion raster.
- `GroundPolygonCells.ts` owns the shared world-space Worley field so meadow mosaic, road-edge irregularity, and road-side grass exclusion use the same cell source.

Current selected sources are Poly Haven CC0 maps: Grass Path 2 for the road, Leafy Grass and Sparse Grass for meadows, and Coast Sand 01 for beach and wet-shore breakup. Keep the source pages in `ExternalSurfaceTextures` when replacing a derivative so provenance is not lost. Licensing remains CC0; do not add non-CC0 ground maps without an explicit human decision.

Required behavior:

- sample in world XZ with explicit rotation; never let mesh UVs or camera orbit change the field;
- remap luminance/chrominance into `PaletteTokens` (`foliage_sage_01` / olive / grass for meadows; `path_dust_01` / `soil_dry_01` / `sand_warm_01` for worked ground; `sand_warm_01` / `shore_wet_01` for beach and wet shore). Photographic RGB is not the final diffuse;
- keep roughness bounded and palette-preserving; precipitation wetness stays on the existing terrain wetness owner;
- protect water, shore, farm, and other non-meadow/non-road surfaces with the existing semantic masks;
- if a file fails to load, log loudly and leave the deterministic palette/procedural path active;
- dispose loaded textures with the owning material.

Do not:

- register these maps as catalog IDs or run `art:generate` / Tripo for them;
- publish a downloaded photogrammetry GLB or an unprocessed photo as ground albedo;
- invent a second `VisualRenderConfig`, palette file, or per-zone ground material;
- change route width, collision, topology, or save schema to “make the texture fit.”

`Save-impact: no` and `Migration required: no` while canonical height, route geometry, Rapier, placement, and serialized world data stay unchanged. Human gameplay-camera review remains required; supporting-map presence is not visual approval.

# 7. Procedural Generator Library

`tools/authored/generators/registry.ts` is the only generator-name dispatch table, with one parameter contract per name in `contracts.json`. Family composition lives in the owning family folder (`fauna/`, `props/`, `tools/`, `buildings/`, `fish/`, and so on). Extend an appropriate family and register one stable name; do not create an alternate entrypoint or filename list. Same catalog seed + parameters + generator code MUST reproduce the same semantic output. Families whose Blender generators were retired are frozen (`tools/art/legacy-generators.json` records their parameter contracts): their published GLBs stay validated, and changing one means porting the family into the registry (`tools/authored/README.md`).

Explicitly requested external assets and other GLB-authored models enter through
the `authored_glb` producer: a committed source GLB (`parameters.sourceGlb`)
with a declared `textureMaxSize`. This is the same catalog/validation/publication
pipeline, not a direct-download runtime lane. `ASSET_PRODUCTION.md` §3.2 owns the
workflow; the catalog schema owns build-time `sourceProvenance`, whose digest
identifies the provenance source file. The source GLB bytes participate in
per-asset cache invalidation. When provenance depends on a provider-source
capture rather than a directly readable glTF, the optional all-or-none capture
fields pin its repository path, digest, structural audit and license evidence;
catalog validation verifies the four files as one provenance bundle.
Skinned or animated sources retain authored bind data and motion through
lossless compression-only packaging with decoded semantic parity, never generic
quantization or hierarchy-changing transforms. Existing palette, silhouette,
LOD, animation, collision and production budgets still apply. Normalization
repairs only declared accessor bounds, provider material extensions and
over-cap textures; it never rewrites geometry, UVs, normals or skins.

`tools/authored/kit/` is below that registry boundary. It provides the reusable deliberate construction systems generators share: superellipse and profiled lofts, boxes with chamfers and tapered ends, closed cloth panels and rings, conforming patches and discs, identity-rest rigs and skin binding, cyclic gait tracks and posing solvers, authored LOD levels, collision and palm-frame grip markers, palette-token materials with linear `COLOR_0`, and the seeded RNG. `generators/props/parts.ts` holds shared prop parts (rope and catenaries, hewn timber, burlap sacks, spoked wheels, knotted nets, produce). Reuse or extend them when several assets need the same visual construction language. Do not register kit helpers, call them directly from the CLI, let them own palette/budget/file metadata, or treat “authored” as permission for unseeded one-off geometry. Any helper control exposed to an asset remains an explicit catalog `parameters` key and must reproduce from the same catalog seed. `tests/unit/authoredKit.test.ts` and `tests/unit/authoredPipeline.test.ts` cover kit construction, the registry/contract match, every authored asset's art contract and byte-for-byte determinism.

# 8. Machine-Readable Asset Specs

Every generated asset MUST be one entry in `assets/specs/asset-catalog.json`, validated by `asset-catalog.schema.json`. Do not add parallel YAML or per-family spec files. Minimum implemented shape:
```json
{
  "id": "tree_oak_b",
  "file": "tree_oak_b.glb",
  "family": "vegetation",
  "generator": "oak_tree",
  "seed": 25,
  "dimensions": { "width": 5.2, "depth": 4.6, "height": 5.8 },
  "palette": ["wood_warm_01", "foliage_olive_01", "foliage_shadow_01"],
  "budget": {
    "trianglesMin": 300,
    "trianglesTarget": 2800,
    "trianglesMax": 5000,
    "materialsMax": 4
  },
  "pivot": "ground_center",
  "collision": "none",
  "instancing": true,
  "lod": "medium",
  "rootNode": "tree_oak_b_root",
  "requiredNodes": ["tree_oak_b_root", "tree_oak_b_LOD0", "tree_oak_b_LOD1"],
  "readDistanceMeters": 30,
  "parameters": {
    "height": 5.4,
    "spread": 2.5,
    "canopyClusters": 17,
    "lean": -0.09,
    "branchCount": 7,
    "rootCount": 8
  }
}
```
The numeric values in this shape-only example mirror the current `tree_oak_b`
entry for readability; they are illustrative and must never be copied to a
different asset. The catalog entry is authoritative.
The schema is closed (`additionalProperties: false`): extend the schema deliberately before adding a new contract field. Unknown palette tokens, duplicate/unsafe IDs or filenames, missing roots, or invalid min ≤ target ≤ max ordering fail before any producer runs.

## 8.1 Reference-Guided Authoring Contract

Use the optional catalog `referenceAuthoring` object when an asset is derived from supplied images, generated concept studies, turnarounds, or a reconstruction study. This is Neva's adaptation of the useful img2threejs discipline, not adoption of its shipping architecture. It must capture:

- each source and whether it informs form language, silhouette, proportion, structure, materials, detail density, or workflow;
- a non-shallow parent/child component inventory with importance, shape, count, and readable cues;
- silhouette and negative-space requirements;
- a hidden-surface inference strategy plus explicit confidence and continuity requirements;
- critical features linked to component IDs;
- bindings from the brief to existing catalog generator parameters; `parameterBindings` must cover every **primary** component for gold-slice family generators (`farmhouse`, `lighthouse`, `stone_bridge`, `working_dock`, `fish_market`);
- concrete failure modes;
- front, rear, side, three-quarter, 8 m, 15 m, and declared-read-distance review views.

Run `npm run art:brief -- --asset ID` when the selected brief changes. The command validates local `repo://` evidence, HTTPS sources, hierarchy/cycles, feature links, parameter bindings and review coverage, then prints a deterministic brief/hash. Missing `repo://` files fail closed; `ready` does not excuse absent evidence. Do not read or print unrelated asset briefs. `draft` means usable for exploration but not strict acceptance; `ready` means the authoring contract is complete, not that the asset is visually approved.

Registered generators consume catalog `parameters` only. They must not parse `referenceAuthoring` JSON. The brief binds identity-defining layout into those parameter keys; the registered generator reads the keys.

Reference admission is visual judgment, not a brittle background-color heuristic. Preserve the original evidence. If segmentation, transparency, or a clean isolated concept makes the subject easier to read, record the normalized derivative as another study and do not let it silently replace the original. A generated rear/side study is an inference: record hidden-surface confidence so the human can inspect continuity through Art Yard/game controls.

Translate accepted hierarchy and parameters into the registered authored generator and the shared kit, porting a frozen family first. Do not ship unregistered reconstruction factories, source-image-dependent runtime geometry, a second palette/material/lighting system, a separate per-asset spec tree, or a direct exporter. Runtime-dynamic systems continue to follow the explicit Three.js path in section 1; static reference-authored assets remain staged, validated, optimized GLBs.

Reference-authoring and source-provenance data are build-time only. The Vite virtual catalog module projects loader/placement, collision, LOD, rig/socket, and animation-contract fields directly from the canonical JSON without creating a checked-in second catalog; source URIs, authoring prose, generator parameters and budgets must be absent from the production browser bundle.

`npm run art:codegen` derives `src/render/assets/AssetCatalog.generated.ts` from the canonical catalog. It owns typed `ASSET_IDS`, family names, and family maps only; it is generated and must never be hand-edited. `npm run art:codegen:check` fails when the adapter is stale. The Vite runtime plugin may refresh codegen during development, while production consumes only the runtime projection.

Generated-asset budgets are centralized with their dimensions, palette, pivot, collision, instancing, LOD, and required-node contracts in `assets/specs/asset-catalog.json`; scene envelopes remain in `tools/art/asset_budgets.json`. Every generated candidate reports triangle count, material groups, mesh/node count, file size, target status, bounds and required-node coverage in its run-local stage. Atomic publication promotes the combined quality state to `generated/reports/asset_budget_report.json`; a rejected candidate does not replace it. Normal generation rejects assets outside production minimum/hard maximum or material/pivot/spec contracts and reports below-target assets. `npm run art:generate:strict` retains its existing semantics and additionally rejects every below-target asset; it is the technical-art/release certification gate, separate from P0.75 visual-gold acceptance. Do not satisfy a floor or target by blind subdivision: additional geometry must improve silhouette, planes, thickness, deformation, or gameplay-camera readability.

Implemented command contract:
```bash
npm run art:codegen
npm run art:codegen:check
npm run art:brief -- --asset prop_water_well_a
npm run art:generate -- --asset prop_water_well_a
npm run art:generate -- --family prop --no-publish
npm run art:generate -- --all
npm run art:sync -- --all
npm run art:generate:strict -- --all
npm run art:validate -- --all
npm run art:determinism -- --asset prop_water_well_a
npm run art:list -- --family character
npm run art:test
npm run art:benchmark
npm run art:benchmark:extended
```
Every catalog command requires `--asset`, `--family`, or explicit release `--all`; a bare command fails. Repeated `--asset`/`--family` selectors form a union. `--no-publish` keeps both published directories unchanged. `--strict` belongs only to `generate`. `art:sync -- --all` refreshes published manifest provenance and derived measurements against existing GLBs; it does not regenerate or reauthor them. `generate` and `determinism` build only authored and `authored_glb` assets: naming a frozen asset fails, and a family or `--all` selection skips frozen members, which `validate` and `sync` still cover.

`generate` uses a unique `generated/.staging/run-*` directory, computes a per-asset input/toolchain hash, revalidates a matching optimized GLB from `generated/.cache/art/` when available, and builds only cache misses (authored generators in Node; authored GLBs from their committed source). Cache artifacts are acceleration state: they are validated before reuse, never published, and report `inputHash`/`cacheHit`. A catalog/spec/palette/generator/kit/pipeline-file/producer-version change, or a changed authored-GLB source, invalidates the affected asset. Shared-generator/release `art:determinism` bypasses the cache; routine asset work does not double-generate. Only the three newest successful staging runs are retained.

After cache selection or generation, the CLI validates the producer's art contract and the raw GLB, applies dedupe/join/prune/weld/Meshopt for generator output and static authored GLBs (lossless compression-only with decoded parity for skinned or animated authored GLBs; source bytes for an authored GLB already carrying Meshopt), validates optimized GLBs, then promotes selected GLBs plus manifests in one rollback-capable transaction. `ASSET_PRODUCTION.md` §3.2 owns authored-GLB normalization and admission. Partial runs merge their selected results into the tracked published manifest and preserve other assets; only a full-catalog publish may remove files owned by the previous manifest that no longer exist in the catalog. Published truth is `generated/reports/asset-manifest.json` plus `public/assets/models/asset-manifest.json`. Determinism and benchmarks do not publish or replace that truth.

# 9. World Generation & Composition

Runtime LLMs MUST NOT invent world art. Development agents create deterministic validated world data; runtime loads authored/pregenerated content.

Procedural generation is allowed only when deterministic/seeded, constrained by biome grammar, built from approved prefabs, visually validated, and overrideable by authored data.

World-layout semantics may generate deterministic presentation fields for surface blending and cover density. These are derived art data, not permission for runtime-random terrain or a second gameplay world. Important routes, shorelines, farms, structures, clearances, and landmark composition remain authored/overrideable.

The current finite world uses a hierarchical district/habitat/route/opening composition field over stable category-specific candidate streams. It establishes large openings, cluster structure, route frames, riparian pockets, and isolates before asset selection. Quality tiers use stable priority prefixes. The field and non-serializable placement tags are inspection surfaces; they do not replace `WorldLayout`, create saved procedural geography, or authorize runtime regeneration from camera position.

Important areas require visual anchors, readable routes, foreground/midground/background, prop clusters, negative space, height variation, sightline control, landmarks, compositional asymmetry. Avoid even scatter, identical rotations/spacing, world-axis alignment everywhere. Modular settlements must still feel authored.

## 9.1 Narrative-to-art contract

Art supports the live story spine in `02` rather than inventing a parallel
world history. Every zone or story-relevant asset brief must identify, when
applicable, its narrative promise, the quest/action it supports, the person or
role associated with it, the practical evidence a player should read, and the
future-content boundary it must not imply. For the current loop this means:

```text
starter farm  = inherited care and preparation
village       = community exchange and shared work
river/bridge  = learning to read currents
harbor        = perishable responsibility and earned seamanship
coast/offshore= orientation, temporary abundance, and open horizons
```

Use the existing catalog, world-layout, zone-brief, and runtime integration
contracts. Do not create a lore YAML, filename list, or unvalidated asset
metadata tree just to annotate story meaning. Narrative notes belong in the
owning task/zone/asset brief unless a future machine-readable field is
explicitly added to the existing schema with validation and migration-aware
ownership. Visual cues may foreshadow a future system, but they must not claim
that deferred P13/P14 content is playable or make a prop the authority for a
quest condition.

# 10. Instancing & Physics

Repeated environment assets MUST be evaluated for batching/instancing; any static asset appearing roughly **>10 times** is a strong candidate. Common: grass, wheat/crops, flowers, rocks, fence modules, repeated trees, reeds, debris, repeated roof/architecture modules. The current static-prefab path groups compatible material/geometry signatures into `THREE.BatchedMesh`; use `InstancedMesh` for uniform high-count runtime systems where it is the clearer fit. Animated, skinned or morph-target meshes must not be folded into static batching.

Rapier is for gameplay-relevant physics: player capsule, NPC collision if present, triggers, doors, boats, rigid gameplay props, raycasts/moving obstacles. Do **not** create complex bodies for every flower/crop/plank/rock/small prop. Use simple primitives/proxies; collision need not match render mesh.

Rigged character production remains catalog-driven. The rigged humanoids (the player and the adapted `_a` cast) and the adapted animals are retained derivatives of licensed originals, committed as `authored_glb` sources under `art/imported/<provider>/adapted/`; the retired Blender adapters prepared them. Any replacement derivative keeps the same standard: preserve source topology, anatomy, deforming bones, rest transforms, normalized weights, UVs, material-region boundaries and custom split normals; donor-body fitting and reduced replacement rigs are prohibited. A source clip's glTF timestamps own its timing. Preserve suitable peaceful performances and author missing Neva actions on the retained rig. Catalog `humanoidRig` supplies semantic bones and bind-space contact calibration; catalog clips own loop behavior, reference speed, contact intervals and commit markers. Only runtime-required binding and clip fields enter the browser projection. Static provider figures (the Tripo townsfolk) declare no rig or clips.

Skinned or animated authored GLBs use lossless compression, not welding or normal reconstruction that changes source seams. The pipeline validates each clip's catalog timing and nodes, skin deformation and loop seams in both LODs, and semantic determinism before atomic publication. Source fidelity against the original is the derivative author's evidence to supply; structure-only or donor-array equality cannot certify source fidelity or motion.

The equipment assets come from the authored tool, rod and workstation-prop generators and the frozen `wearable_equipment` family; clothing, hand tools, fishing rods and workstation presentation props remain separate catalog assets even when they share deterministic construction helpers. Catalog dimensions, palette tokens, socket intent, required nodes and budgets own each export. Runtime attachment metadata lives with the gameplay equipment definition and is resolved by the shared `CharacterEquipmentAssembler`; it may hide a named starter garment or attach a catalog GLB, but it must clone loader results per consumer and cannot mutate a cached character scene. The world avatar and Character preview therefore assemble the same assets without turning Three.js node visibility into gameplay ownership.

Solid-color source regions carry their explicit palette mapping once: a material named for a declared palette token and the linear token colour in `COLOR_0`, which the authored-GLB validator requires of every untextured primitive. Texture-preserving regions keep their original base/normal maps and `TEXCOORD_0` and carry no palette-colored `COLOR_0` multiplier; normalization only resamples an image above the asset's `textureMaxSize` (to WebP) and otherwise keeps texture, sampler, geometry and skin bytes. Native sparse animation channels retain the original glTF node defaults, including unkeyed fingers and wrists. Solid emissive source regions write the same token × region value to `COLOR_0` and `emissiveFactor`, with the palette's emissive strength; vertex color alone cannot tint glTF emission.

Runtime uses one clip clock and the shared semantic humanoid/contact path. Fixed-length limb solving supports independently parented feet, clamps unreachable endpoints and preserves authored orientation while aligning established contact. It never changes simulation position or canonical gameplay outcomes. Equipment stays owned by its authored object hierarchy (for example an oar by its boat/oarlock); character hands follow grip markers after the mixer pose. Required equipment grips must resolve their exported anatomical palm-frame metadata; missing markers or frames fail explicitly instead of silently using legacy axes. Mounted hold clips follow the donkey's physical rein endpoints after saddle and sole placement; attachment reach keeps those hand constraints released.

The first humanoid pose after construction or a full presentation reset evaluates its selected base and upper clips at full weight, even when elapsed time is zero. A paused load or frozen benchmark must show the authored idle, carry, fishing or vehicle stance rather than wait forever in the source bind pose for a fade clock to advance. Later locomotion/action/contact transitions retain their normal blends; spatial-only contact resets do not turn them into first-pose initialization. Do not warm up by advancing simulation time or special-case a benchmark camera to conceal an animator defect.

`AssetLoader` replaces every skinned asset's invalid per-piece rest bounds — characters, fauna and fish alike — with one conservative actor-local envelope, transformed once into every skinned mesh's local frame. This keeps hats, hair and eyes visible through seated and reaching poses, and a grazing head, beating wing or bending tail visible through its sweep, while still rejecting off-screen actors. Existing whole-actor distance visibility and catalog LOD selection still own distant cost; do not recompute every deformed vertex's bounds per frame or disable culling for unrelated world assets.

Authored grasp profiles curl the source finger phalanges with thumb opposition while preserving the original metacarpals and native performances. Palm contact positions derive from source knuckles and convert physical offsets through the actual bind transform, including source rigs with scaled parents. Preparation reports record each action's grasp profile; actual exported-character tests measure tool, cargo, boat and rein contacts independently of the authoring report.

Added role garments must fit the source's interior surface as well as its silhouette edges. Sample the torso and legs across the garment panel, preserve clearance, and transfer source surface weights rather than assigning an entire span from one nearby vertex. Any local tailoring allowance for a source jacket hem is an authoring measurement of that derivative, not a runtime field. Check the evaluated garment against the original body across its action library and both LODs; finite transforms and intact seams alone cannot detect a body piercing an apron. Preserve a small garment's topology when simplification breaks that clearance. Fix the added garment without altering the preserved source anatomy.

Optional tied-hair additions use explicit palette tokens. Anchor these details to the retained hair surface and bind them to the source head; preserve the original hair and face geometry. Check attachment, outward normals and visibility from side and rear views. These are small rigid styling details, with no added hair simulation or runtime authoring fields.

Rod bending and reel presentation consume the full encounter elapsed time through a stable damped-spring step; throttled updates and zero-time pause must preserve the same tip and grip pose. The reel stays rigid while its secondary grip follows the handle. These are presentation dynamics only, and cannot change fishing outcomes or save state.

# 11. Optimization & LOD

The procedural post-export baseline uses glTF Transform and Meshopt, followed by Khronos revalidation and generated/public hash parity; `tools/art/optimize.mjs` owns the exact transform sequence. Skinned or animated authored GLBs use its lossless compression-only path, and an authored GLB that already carries Meshopt keeps its geometry bytes. Catalog entries may declare generated `lodLevels`: each level has a required named root, switch distance, and measured triangle-ratio envelope relative to LOD0. Generators consolidate only within a level; raw/optimized validation budgets LOD0, records packaged triangles and per-level ratios, and runtime converts the named roots into `THREE.LOD`. Static batching preserves catalog switch distances through per-instance level tracking in production and normal DEV play; active F2 editing restores the retained unmerged prefabs for picking. Skinned, morph-target and dynamic meshes remain excluded from static batching. KTX2/BasisU and broader distance culling remain permitted extensions when a current asset/scene requires them. Ground supporting maps currently use local WebP through `ExternalSurfaceTextures`; that path does not by itself prove KTX2 integration. Runtime chunk streaming is not implemented; do not describe it as shipped or add it to the current world contract without a separate architecture decision.

Do not optimize away art direction: hero silhouette/faceting can matter more than a few hundred triangles.

`WorldScene.batchCompatibleMeshes` groups static prefabs by island, material identity, shadow policy, and vertex layout. Spatial fog cells control instance visibility inside those batches rather than fragmenting material draws. A batch instance is visible only when both its fog cell and catalog LOD permit it; neither update may override the other. Texture-free UV stripping reuses one batch-only derivative per source geometry and leaves the source buffer unchanged. `staticBatchSubmission` disables depth sorting for opaque batches while preserving native per-pass instance frustum rejection. Its bounded draw-list cache uses exact camera/batch matrices and revisions from public visibility/transform mutations; another shadow or main view rebuilds the correct list before submission. It does not access Three.js private draw buffers or reuse the main-view subset for shadows.

`EditableStaticSources` preserves DEV source mesh identities, layers and hierarchy while normal play uses the same static batches. Fully dormant roots leave scene traversal; roots with lights, sprites or unbatched dynamic content remain live. F2 disposes the static batches and restores those sources for ordinary picking and editing. Exiting F2 re-batches their current poses, invalidates LOD/shadow classification and detaches dormant roots again. Collider rebuilds include retained sources, including a paste that completes after editor exit. Active-editor shadows follow the individual props; collision and authored provider-region materials remain unchanged.

`RigidAnimationBatch` handles production rigid fauna separately from static batching. Original mesh nodes remain in their authored hierarchy as animation and socket owners; only their render layers are suppressed. Compatible opaque parts submit through shared-material batches whose transforms and inherited visibility refresh after animation and world-anchored LOD updates, before color, GTAO, and shadow rendering. Skinned/morph meshes, transparent surfaces, and custom per-mesh render/depth behavior remain unbatched. Disposal restores source layers and releases only batch-owned buffers/textures. DEV editor prefabs remain unchanged. Ambient flyer shadow policy comes from `VisualRenderConfig.shadows.castAmbientFlyers` at both loading and final world-policy application.

LOD priority:
1. retain silhouette
2. retain color blocks
3. retain major faceted planes
4. remove tertiary decoration
5. simplify secondary geometry
6. reduce hidden/back faces where useful
Distant LODs MUST NOT become smooth generic blobs.

# 12. Camera-Aware Validation

`VegetationTintMaterial` applies main-view opaque dither clearance only to catalog foliage materials. `WorldScene` updates a shared view-space presented-player focus once per render and during entry preparation; the existing transformed fragment position supports plain, instanced and batched trees without per-placement material clones. A bounded near-camera volume and softened finite camera-to-player corridor protect the view. Main-camera position and direction guard the shared uniforms against secondary views. Foliage and bark have distinct program keys; bark and shadow depth materials never receive the cutout. Main-view depth already feeds GTAO, so no extra scene pass is required. This changes neither camera collision nor canonical tree placement/collision; `VisualRenderConfig.foliageObstruction` owns its dimensions.

Production terrain/road culling is implemented by `src/render/scene/spatialSurfaceBatch.ts` and integrated by `WorldScene`. It partitions the existing triangles into shared-material batches with identity instance transforms, retaining all vertex attributes and world-sampling coordinates. Bounds include complete boundary-crossing triangles; each pass uses its own frustum. DEV keeps unbatched editor geometry. Validate triangle/attribute and raycast parity separately from production render costs; disposing a surface batch must also release its instance textures. This is presentation-only and does not change terrain resolution, the save layout, or visual quality tiers.

Ground-cover frustum submission is separate from its stable distance/density selection. `GroundCoverRenderer` bounds the entire source assembly plus shader wind displacement, retains each placement's phase during compaction, and releases instance buffers during disposal. Verify opposite camera headings and edge-intersecting/wind-displaced clumps without changing selected membership. The ground-cover color and GTAO passes use the same main-camera subset; this non-shadow-casting layer is not culled against the sun camera.

Approve assets from the actual gameplay camera, never only close studio renders. Inspect silhouette, color separation, prop/path/interaction/shadow readability, overlap. Tiny invisible details are generally unnecessary. Character assets additionally require an in-world style-lock check beside approved environment materials before large NPC production.

# 13. Deterministic Visual QA — Regression vs Style Match

The implemented fixed art views are:
```text
/?debug=1&artView=bridge
/?debug=1&artView=farm
/?debug=1&artView=harbor
/?debug=1&artView=coast

tests/visual/candidates/
  bridge-candidate.png
  farm-candidate.png
  harbor-candidate.png
  coast-candidate.png
```
`npm run art:benchmark` captures the fixed gameplay-camera views and reports
errors, upper-budget checks and measurements under `tests/visual/candidates/`.
`tests/e2e/art-pipeline.spec.ts` and `tools/art/asset_budgets.json` own its
views and limits; `art:benchmark:extended` adds the configured diagnostic views.
The baseline registry owns approved comparisons and human decisions. Capture
is evidence for review, not authorization to replace an approved baseline.

This benchmark runs against Vite DEV. Normal play now batches static prefabs;
active F2 editing restores unmerged source meshes, and DEV terrain remains available
for editor snapping. Label DEV captures diagnostic; production budget evidence
uses `test:budget`, and frozen world comparisons
use §13.3. `03` §4 owns which task needs each lane. Routine asset work uses focused inspection rather than this full capture set; additional task-specific harbor evidence remains required by `04` §8.1.


The Art Yard is the asset-review surface; `tools/vite/artYardPlugin.ts` serves it during DEV and emits published views/data in production. `ASSET_PRODUCTION.md` §5 owns its route contract. It uses the same `AssetLoader`, runtime catalog, `VisualRenderConfig`, `PaletteMaterials`, and `LightingRig` as the game and supports direct `?asset=<catalog-id>` links plus orbit, distance/LOD, triangle counts, wireframe, collision, animation, lighting, fog/storm, ground, and water diagnostics. Character playback uses real elapsed time, respects catalog one-shot/loop settings, and offers raw-clip inspection alongside the shared production controller/contact context. Normal diagnostics show exported split normals rather than forcing flat shading. Mounted player clips are reviewed as a synchronized rider-and-mount pair so saddle contact, gait phase, and counter-motion remain visible in context. Candidate-stage endpoints are DEV-only. The human performs visual approval in the actual integrated game.

## 13.1 Regression QA — Game vs Approved Game
Same scene/state/camera/resolution/config only. Where available compare screenshot diff, SSIM, LPIPS, histogram/luminance, palette distribution and silhouette/edge metrics. These detect unintended change; they do not define artistic quality. Intentional accepted changes update benchmarks only after review.

## 13.2 Style-Match QA — Game vs Supplied Graphics References
Do **not** apply pixel-similarity thresholds across different compositions. Reference-image comparison intentionally ignores layout, camera angle, diorama/tabletop framing, depth of field/tilt-shift, scene borders and prop staging unless the task explicitly targets composition. Qualitative review assesses geometry/faceting, silhouette/proportion, roughness/material response, palette/warm-cool distribution, lighting/shadows/AO, water/foam, vegetation/rocks, atmosphere, detail frequency, gameplay readability and realism/plastic drift.

A game screenshot passes style QA when it plausibly belongs beside the references as a continuous playable world without copying their presentation.

## 13.3 Frozen World-Composition Acceptance

`npm run world:acceptance` is the additive acceptance path for causal world, river, and composition changes. It records and revalidates a SHA-256 input digest, runs check-only generated-adapter verification, builds once, serves the static production bundle on a unique port, and writes only beneath `output/world-alignment/<digest>/`. Normal acceptance must not update candidate images, approved baselines, benchmark JSON, snapshots, catalog output, or published assets.

Movement uses real input along the authored routes. A route ending at a solid market stall reaches the simulation-resolved trade interaction; the harness opens and closes the actual market dialog before departing. It must not require a player to stand inside the counter's anchor or use a larger generic arrival radius to hide a blocked traversal waypoint.

Preservation loads `tools/world/neva-layout<revision>-preservation.json` for the live layout revision and fails on absent references or changed terrain, routes, landmarks, sampling or per-seed placements. After an explicitly authorized layout/reference change, `npm run world:acceptance -- --refresh-preservation` captures a revision-specific mechanical reference with input identity and deterministic placement hashes, retaining historical revisions. This explicit maintenance mode exits before build/captures and is not a composition, performance or visual approval; rerun normal acceptance afterward.

Composition audits compare habitat roles separately: total vegetation increases from exposed headland to working farm to village; harbor low vegetation exceeds village low vegetation, while village canopy share exceeds the harbor's. The scalar density contrast remains a separate check. This follows `04` §11 rather than requiring one tree-heavy score to increase through every district.

Neva spacing diagnostics retain raw histogram ratios alongside the supported lower bounds. The 1.35 repetition limit applies to a one-sided 95% Wilson lower bound for a spacing bin against its four neighboring bins; an isolated low-count excess cannot establish a lattice. This is an evidence screen, not a claim that spatial pairs are independent. Synthetic regular-lattice and supported-excess tests must still fail the screen. Placement hashes, openings, route/fishing clearance, isolate share and determinism remain independent gates.

Capture modes are presentation diagnostics over identical world content: `final`; a same-quality `no-post` path that disables GTAO while retaining the High-tier scene-color/depth target and water optics; and named district, habitat, route, density, opening, river-profile, wetness, erosion/deposition, and fishing-access overlays. Lower tiers render directly. Final/no-post comparisons keep seed, camera, quality, cover, shadows, time, weather, DPR, and loaded assets identical and fail if content counts differ.

Changing capture mode invalidates the retained AO sample. Frames with GTAO disabled must not advance its refresh bookkeeping or claim to have gathered a reusable frame. Returning to `final` gathers and denoises the current scene before reusing AO; repeating an unchanged mode preserves the normal refresh cadence. Mode changes do not recreate the scene/water targets or disable output-color conversion.

The approved harbor-coast production task uses `tools/world/coastal-review.mjs` for normal-camera comparisons, real-keyboard traversal and warmed route frame measurements. Run against an isolated production output for performance evidence; DEV captures are visual diagnosis only. `setReviewEnvironment` is restricted to persistence-disabled local world acceptance. It sets the existing simulation weather/clock while keeping the normal camera and actor clocks running; reports record actual presentation time, so these moving comparisons are not pixel-identical wave-phase baselines. The previous benchmark-camera path retains fixed art-time support. Record any source drift and keep failed/overlay captures out of the final evidence set.

The harness runs a deterministic SwiftShader lane and a real Chrome hardware lane. GPU performance evidence requires non-blocking `EXT_disjoint_timer_query_webgl2` samples with warm-up, query buffering, and disjoint rejection; FPS cannot substitute. The report inventories composer buffers, GTAO targets, shadow maps, dimensions, formats, samples, depth/stencil state, estimated target bytes, and renderer geometry/texture memory separately. Browser/page/network errors, HMR, source-digest drift, zero assets, or repeated canonical scene identity fail the lane. Automated captures remain comparison evidence for human gameplay-camera review, never automatic aesthetic approval.

# 14. Agent Roles & Working Rules

Routine asset work uses one agent and no parallel visual-review agents. The human is the art director. Specialized agents are reserved for explicitly requested new/shared systems or release investigations.

Every relevant agent MUST:
1. follow the task-class read route in `ASSET_PRODUCTION.md`;
2. read the selected reference-authoring contract and rerun its brief only when changed;
3. preserve visual vocabulary;
4. prefer reusable systems over hacks;
5. use deterministic seeds for generated art/world content;
6. reuse palette/material tokens;
7. avoid duplicate asset families;
8. assess performance;
9. run the task-class mechanical gates;
10. inspect affected appearance or motion through the Art Yard and game, correct scoped defects, and leave human visual approval pending;
11. use broader benchmarks when required by `03` §4 or a concrete unresolved concern; keep routine inspection focused.

“More realistic” is not an improvement unless explicitly requested. Default = more coherent, readable, stylized, intentional.

# 15. Prohibited Visual Drift

Unless explicitly approved, reject: photogrammetry/photo bark-rock-grass as final albedo; unprocessed photo-ground; noisy terrain/hyper-detailed PBR/micro normals; regular flat-shaded terrain topology dominating traversable ground; featureless globally smoothed terrain; hard floating road ribbons; independent road/terrain/cover masks; uniform ground-cover scatter; spherical foliage/realistic branching/ocean; excessive gloss; generic asset-store realism; perfectly straight forests/uniform spacing/rotations; thin architecture; high-frequency clutter; uncontrolled material proliferation/colors; per-scene exposure/tone-map/color hacks; toon/ink/black world outlines; high-poly invisible detail; runtime LLM world composition; diorama-only world design. Processed CC0 supporting maps remain under section 6.2 and are not a general photogrammetry exception.

Required across final game: readable planes/silhouettes/chunky geometry/selective bevels/cohesive warm palette/handcrafted irregularity/low-frequency detail/asymmetry/stylized architecture/selectively smoothed traversable ground with faceted cliffs/cuts/rocks/clustered simplified vegetation/warm sun+cool fill/AO grounding/soft shadows/atmosphere/emissives/continuous depth and surf under `04` §8/coherent roughness/consistent proportions/gameplay-camera readability.

# 16. Rendering Pipeline Target

Conceptual runtime:
`optimized GLBs → Three.js/TSL materials → vertex colors → directional + environment light → baked light/AO where appropriate → dynamic contact/shadows → stylized water/foliage shaders → fog/atmosphere → subtle justified bloom → controlled grade → filmic tone map → final`.

Post-processing remains subtle; never substitute bloom/vignette/chromatic aberration/sharpening/saturation for geometry/material/lighting quality.

`WorldScene.prepareForEntry` and `RendererPipeline.prepareForEntry` own general first-frame preparation; capture remains a consumer through its compatibility wrapper. `WorldScene.prepareGeometry` is an internal startup stage for procedural terrain, water and route presentation. It follows bounded required-GLB preload and precedes prefab population; this order keeps placement unchanged and distant scenery present at entry. Startup awaits saved actors, attachments and active fishing presentation, camera/environment initialization, selected pipeline readiness and two complete frames behind the illustration. Required catalog GLBs reject consistently in development and production. Optional supporting-map failure retains the procedural path and is listed in startup diagnostics. Water maps, terrain rows, road conformity/surface attributes and cover candidates share deterministic generator computation between synchronous tools and cooperative startup builders; task yields change scheduling, never topology, seed order or density. Cooperative geometry yields report real progress to the bounded startup stall timer. Cancellation prevents further scene mutation and disposes late owned resources. GPU/driver compilation and upload stalls must be reported separately from application batching measurements.

# 17. Gold-Standard Reference Slices

`03` §6.5/§6.75 owns renderer foundation, gold-slice order and the separate
human/render/technical-art gates. `04` owns what the slices must look like.
`tests/visual/reference/approved-baselines.json` owns approved images and
recorded human decisions. The status checklist owns run evidence; generated
reports own published budget disposition. Link those owners instead of copying
dates, counts, pass claims or debt lists here. P14 completes coverage and polish
after the visual direction is established.

# 18. Definition of Done — Asset

This is a contract checklist across mechanical readiness and eventual human
acceptance. `ASSET_PRODUCTION.md` supplies the task-specific commands; routine agents
complete mechanical integration and focused inspection, then hand off `Awaiting human game review`.
Do not treat visual checklist items as an instruction to start an agent scoring
loop or require release gates for one asset.

- [ ] any supplied/reference evidence is represented by a valid `referenceAuthoring` contract and deterministic brief hash
- [ ] component hierarchy, negative space, critical features, hidden-surface confidence, and generator bindings are implemented rather than merely described
- [ ] approved silhouette language + palette/material family
- [ ] gameplay-distance polygon density
- [ ] deliberate shading/bevel/vertex color
- [ ] optimized UV/textures where used
- [ ] collision defined where needed
- [ ] instancing eligibility defined
- [ ] LOD policy defined where needed
- [ ] generated typed adapter is fresh (`npm run art:codegen:check`)
- [ ] per-asset input hash/cache status is recorded; cache artifacts are not published
- [ ] GLB export + asset validation + runtime load succeed
- [ ] published to the Art Yard and integrated into the actual game for human review
- [ ] if story-relevant, the silhouette/material/prop context communicates the intended practical role without inventing an unimplemented plot or gameplay condition
- [ ] no realism/style drift

# 19. Definition of Done — Environment/POI

- [ ] major anchor
- [ ] readable paths/traversal
- [ ] foreground/midground/background separation
- [ ] authored prop placement + clustered vegetation + broken repetition
- [ ] terrain normals/material regions, roads, shoreline and ground-cover density agree with the same authored world-layout semantics
- [ ] global lighting/AO grounding
- [ ] approved water where applicable
- [ ] performance budget met
- [ ] generated asset budget report has no hard violations
- [ ] P0.75 visual-gold gate is accepted for the four gameplay-camera slices
- [ ] technical-art strict/determinism gate passes when production or release certification is required
- [ ] capture evidence provided when required by `03` §4 or the scoped `04` §8.1 environment review
- [ ] integrated game is ready for human review
- [ ] visual regression passes or approved
- [ ] the zone's narrative promise is readable from gameplay cameras through people, routes, landmarks, and practical work cues; required quest progression does not depend on noticing decorative art
- [ ] no prohibited drift

# 20. Final Technical Direction

Default unless `01`/human explicitly supersedes:
```text
CLIENT: TypeScript, Vite, Three.js/WebGL2 (+ WebGPU/TSL when justified),
InstancedMesh/BatchedMesh, GLTFLoader, MeshoptDecoder, optional KTX2Loader when implemented, Rapier,
optional Miniplex/bitECS, React DOM, Zustand

ART: catalog/schema + authored Three.js generators (Node) + committed authored GLB sources; frozen legacy GLBs until ported; semantic COLOR_0 + GLB export; ground supporting maps via ExternalSurfaceTextures + VisualRenderConfig (section 6.2)
OPTIMIZATION: implemented gltf-transform + Meshopt; KTX2/BasisU preferred for GLB-embedded textures; supporting maps currently local WebP
WORLD: validated JSON/TS schemas + seeded authored layout + prefabs + district/POI composition + authored overrides; no runtime chunk streaming
QA: AJV schema checks + producer art contracts + Khronos glTF validation + decoded surface contract + semantic determinism + Vitest + Playwright candidates + human style review
```

Highest-priority rule: preserve the approved visual identity unless doing so makes the game unacceptably slow, unstable, or unmaintainable. Target is not realism; it is one coherent skilled-art-team look across the whole game.
