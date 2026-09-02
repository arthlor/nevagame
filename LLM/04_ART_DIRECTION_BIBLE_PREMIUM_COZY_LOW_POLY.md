# Premium Cozy Low-Poly Art Direction Bible — Compact
## Farming, Fishing & Coastal Village Browser Game

> **Role:** Visual source of truth for 3D art, environment design, technical art, lighting, materials, animation, UI-world relationship, and visual QA.
> **Graphics reference lock:** `coastal_lighthouse_cliff_1787253807104.jpg`, `cozy_farmstead_plot_1787253754847.jpg`, `maritime_dock_props_1787253788406.jpg`, `rustic_timber_bridge_1787253770645.jpg`, and `art/references/neva-ui-hud-on-foot.png` define **rendering/asset graphics only**. `art/references/neva-ui-hud-on-foot.png` is the authoritative gameplay-distance benchmark for starter-farm ground, warm worked-earth paths, meadow flowers/foliage, crop-bed presentation, and clear-day lighting/color balance. These references do **not** define world layout, level composition, camera angle, UI composition, diorama/tabletop presentation, depth of field, tilt-shift, staging, prop placement, or scene borders. Gameplay/world architecture remains authoritative.
>
> **Two evidence classes:** (1) diorama/gold stills (`art/references/art-reference.png` and the graphics-lock images above) remain graphics-only and do not define world layout, camera, or staging; (2) isolated studio sheets under `tools/blender/references/isolated/` may inform **that one asset’s** silhouette, proportions, component counts, and construction language. Neither class is a pixel-copy target. Style-match the construction language; do not copy diorama pixels.

# 0. Global Visual Grammar

Target: a **continuous playable premium stylized low-poly coastal world** with:
```text
chunky authored geometry
visible controlled faceting + broad planar forms
selectively smoothed traversable ground whose macro landforms remain stylized
large readable shape breaks
selective small bevels/chamfers
texture-light low-frequency surfaces
matte-to-satin stylized PBR
warm wood/ochre stone/cream plaster/terracotta accents
olive/sage/golden vegetation
turquoise/teal polygonal water
charcoal coastal rocks
graphic warm-white foam/splashes
warm directional sun + cool sky fill
soft contact shadows + restrained AO
simple stylized clouds
warm emissive lamps/windows where relevant
strong gameplay-camera readability
browser-optimized GLB assets
```
Short form: **warm, tactile, faceted low-poly — not flat, plastic, photoreal, or diorama-dependent.**

Never rely on beauty-camera effects for style. If a reference cue conflicts with gameplay readability or world architecture, gameplay wins.

# 1. Core Art Pillars

1. **Handcrafted:** controlled asymmetry/imperfection; no procedural uniformity or noise-for-noise's-sake.
2. **Readable:** silhouette → color block → major structure → secondary detail → micro detail. If it only works in a close Blender render, it fails.
3. **Cozy, not childish:** warm/soft without chibi proportions, candy colors, huge cartoon eyes, or toy roundness.
4. **Functional:** environment shows what systems do (fish rack dries fish; cold store reads insulated; dock has ropes/cleats/ladders; farm shed has tools/storage).
5. **Coastal:** weathered timber, rope, canvas, painted wood, retaining stone, faded colors, iron/brass, blue-green accents, crates/buoys/oars/boats. Avoid generic fantasy-village drift.
6. **Calm but alive:** foliage/cloth/smoke/water/boats/signs/birds/splashes/windmills/laundry/rain animate subtly. Sparse, world-anchored fireflies may add a palette-controlled night accent; they remain render-only ambience and never become a gameplay signal.

# 2. Mandatory Quality Delta

Compared with generic low-poly packs, ours MUST use authored planar forms, deliberate facet shading, selective bevels, disciplined roughness, geometry/color-driven material identity, layered greens, polygonal teal water, graphic foam, strong rock planes, angular clustered foliage, material-specific response, broad rather than noisy detail, warm key + cool fill, soft grounding, and clear normal gameplay imagery without DOF/heavy bloom.

Engineering packs may inform compression/shared-material efficiency only; they are not the final visual target. Improve **form, facets, light response, and material identity per polygon**, not polygon count everywhere.

# 3. Shape, Facets, Edges & Scale

Use trapezoids, wedges, softened boxes, faceted cylinders, irregular low-sided forms, broad cuts, chunky beams, angular rocks, low-segment curves where silhouette needs them. Avoid perfect primitive dependence, high-segment cylinders/spheres, subdivision smoothness, uniformly rounded corners, tiny triangulation noise.

Facet scale:
```text
traversable terrain: broad landforms/color regions; never a regular triangle grid
cliffs/cuts/hero landforms: large visible planes
buildings: broad surfaces + shaped edges
wood props: low-segment forms + readable chamfers
foliage: angular clustered masses
water: medium-large polygon cells
small props: simplified, not over-faceted
```
Faceting must look intentional, not accidentally triangulated.

Selective bevel/chamfer: typically **2–5 cm world-space equivalent** on doors, beams, crates, furniture, hull edges, major stones, dock posts, roof trim. Do not bevel every tiny object.

Shading:
- smooth/selectively smoothed: walkable grass/soil/path surfaces where exposed mesh topology would dominate; retain authored macro breaks through geometry, material fields, and bounded normal transitions;
- flat/strongly faceted: cliffs, terrain cuts, exposed banks, rocks, hero landforms, many props, foliage, clouds, stylized water;
- minimal/selective smoothing: walls/boards, hull curves, rounded tools/barrels/ropes where silhouette benefits;
- hard-edged: planks, roofs, doors, stone blocks, crates, docks, fences, beams, stairs.
Never smooth away plane language.

Normal continuity may cross triangulation edges that do not represent an authored feature. It must stop or transition deliberately at authored ridges, terraces, banks, cuts, cliffs, rock shelves, and other intentional landform breaks. The rule is feature-aware continuity, not globally smooth terrain.

For ground, the visual unit is the **hill, mound, bank, terrace, shelf, cut, or route corridor**—not each triangle. A terrain mesh fails when regular topology reads as a checkerboard/folded-cardboard pattern from the gameplay camera, even if every triangle is technically flat shaded. Selective smoothing is not permission for featureless subdivision-smooth hills; macro geometry and material transitions must still carry the low-poly identity.

Controlled asymmetry: slight roof offsets, unequal planks, beam variation, crooked fence, uneven stones, subtle lean. Functional, not random.

Technical scale: **1 unit = 1 meter**. Readability exaggeration guidance:
```text
doors +5–10% width
windows +10–20%
roof thickness +15%
timber beams +20%
small props +10–25%
ropes/nets thicker than realistic
fish cargo accurate-ish but readable
```

# 4. Architecture

Identity: coastal/northern-European influence + storybook simplification + working fishing settlement + warm farm homestead; not historical reconstruction.

Typical construction: stone foundation → timber frame → warm plaster/timber walls → thick stylized roof → simple trim → practical windows → weathered doors.

Roof families: turf, warm wooden shingle, desaturated red clay, dark weathered plank, simple thatch. Turf is signature, not universal. Roofs use 2–4 broad overlapping planes, thickness, slight ridge unevenness, occasional patch/color sections, integrated chimneys; never model every shingle.

Hero buildings: player farmhouse, fish market, harbor warehouse, boat workshop, village market hall, mill, inn. Give each a distinct silhouette, readable structural planes, and a useful gameplay-distance LOD. Exact triangle floors/targets/hard maxima, material caps, texture-related fields, required nodes, pivots, and LOD declarations belong to the individual entry in `assets/specs/asset-catalog.json`; this guide must not be treated as a second asset-budget table. The current architecture catalog reaches approximately **33k target / 70k hard maximum** for some hero variants, while smaller landmarks are lower. Spend that range only when silhouette, structure, or gameplay readability justifies it.

Support buildings: cottages, sheds, shops, barns, and workshops use the same catalog-owned contract. Do not infer a universal support-building triangle or material range from this guide.

# 5. Materials, Textures & Surface Detail

Target **stylized PBR with low visual frequency**: neither flat-unlit nor photoreal texture-heavy. Richness comes from geometry planes, base/vertex color grouping, roughness differences, warm/cool light, AO/contact, selective specular response. Material identity should survive without normal maps.

Shared families:
```text
Wood: Honey/Warm/Dark/Weathered
Plaster: Cream/Warm
Stone: Golden/Warm/Cool + Coastal Dark Rock
Grass: Sage/Olive + Soil Warm
Roofs: Terracotta/Shingle/Turf
Metal: Dark/Brass
Cloth: Cream/Red
Rope
Water Faceted
Foam
```
Reuse aggressively; vary via parameters/palette, not duplicate shaders.

Texture hierarchy:
`geometry → base/vertex color/palette atlas → roughness → baked/vertex AO → optional low-frequency tiler → hero authored texture only if justified`.
Recommended sizes: **128–256 tiny**, **256–512 normal props**, **512–1024 hero**, **2048 rare shared atlas/exception only**. Avoid unique high-res ordinary props and using texture resolution to fake broad modeled form. If another technical document mentions 1K–2K textures, treat that as a permissive ceiling for exceptional cases, **not** the normal production target; this Art Bible owns the default texture-resolution policy.

Ground supporting maps, when used, occupy the **optional low-frequency tiler** slot only. They must be remapped into approved palette families and sampled in world space. They may not become the ground's photographic albedo, replace semantic grass/soil/path blending, or introduce a second lighting/grading stack. Exact scales, rotations, mip/lod policy, and blend strengths belong in `VisualRenderConfig`.

Good surface detail: plank bands, large stone blocks, roof-plane color changes, one broad wear/moss/value zone, beam joints, board thickness. Avoid photographic grain, scratches, dense dirt, micro-normal breakup, speckle, high-frequency grunge.

Starting roughness:
```text
raw/dry wood 0.70–0.90 | painted wood 0.55–0.75 | plaster 0.80–0.95
stone 0.78–0.95 | coastal rock 0.65–0.88 | cloth 0.85–1.00 | rope 0.90–1.00
iron 0.45–0.65 | brass 0.35–0.55 | wet wood 0.35–0.50 | fish 0.45–0.65
water custom
```
No accidental plastic gloss, sparkly stone, or dominant metal response.

# 6. Palette & Color Distribution

Principle: **warm, rich, natural, clean; slightly more saturated than muted baseline; never candy-colored.** Anchors (directional, not immutable runtime constants):
```text
Sky Pale Blue #BFD9E6 | Warm Horizon #F2C89C
Sea Light Turquoise #72C5CD | Mid Teal #4CA6B7 | Deep #2E6F86 | Foam #F6F3E8
Grass Yellow #B3B75A | Sage #8E9E54 | Olive #667A3E | Shadow #465B32
Pine #405C38 | Leaf #7D8F43 | Leaf Highlight #A0A756
Honey Wood #B8783F | Warm #8D5D36 | Dark #563825 | Weathered #765C47
Warm Plaster #D9BE8D | Cream #E8D5AC
Golden Stone #C18A52 | Warm #A97855 | Cool #7D7C72 | Coastal Dark #34383E
Soil #775333
Terracotta #B94F36 | Deep Red #8F3C32 | Warm Orange #C96C3F
Canvas Cream #E8D8B4 | Accent Red #B84B3D | Ochre #D59B45 | Teal #3F8D8C | Brass #A47B43
```
Scene balance: **55–65%** natural greens/woods/stone/cream; **20–30%** cool water/sky/shadows; **8–15%** terracotta/ochre/red; **<5%** very bright focal accents. Use broad masses, not peppered accents. Keep cool counterbalance.

## 6.1 Canonical `PaletteTokens` / `PaletteMaterials` Contract

Palette consistency must be enforceable in code, not only described in prose. Production render code, generated catalog entries, procedural builders, and shader parameters MUST refer to approved semantic tokens/material families. Do not scatter raw hex/RGB values through gameplay/world code and do not create near-duplicate `MeshStandardMaterial` instances for trivial shade differences.

The implemented data owner is `art/palettes/neva.palette.json`. It defines each token's hex color, material family, roughness, metalness and optional emission. Current families include sky/horizon, water/foam, grass/foliage, wood, plaster, stone/coastal rock, soil, roof, canvas, accents, metal, fish and emissive tokens. `src/render/materials/PaletteTokens.ts` / `PaletteMaterials.ts` are runtime consumers, while `tools/blender/common/materials.py` consumes the same JSON for Blender output. Do not maintain a second hand-written token list in prose, a generator or a loader.

Generated geometry bakes the semantic token color plus bounded planar/height value modulation into the `Color` vertex attribute. The Blender material graph reads that attribute directly for Base Color and supported emission, so GLB export must retain `COLOR_0`. Asset specs may request deterministic bounded variation around declared tokens; they may not invent unrelated colors. Palette changes happen centrally and are reviewed on all gold-standard slices. Debug colors are exempt when clearly dev-only.

# 7. Lighting, Shadows, AO, Sky & Atmosphere

Lighting target: warm directional sun, cool environment fill, medium-soft readable cast shadows, strong contact grounding, restrained broad AO, subtle warm bounce impression, controlled highlights, visible facet changes.

Recommended day setup: `1 directional sun + hemisphere/environment fill + restrained AO/contact solution + optional local emissives`. Sun angle **~25–50°**, subtly warm key/cool fill. Golden hour can push warmer/lower; normal gameplay preserves color accuracy.

Avoid flat white noon, hard black shadows, unrealistic HDR contrast, ambient wash that erases facets, or orange grading as a substitute for lighting.

Shadows: one primary directional system; soft penumbra; enough density to anchor buildings/rocks/boats/crates/fences/crops. Do not shadow every grass blade or make softness so broad things float.

`VisualRenderConfig.shadows` owns which asset families cast and the per-tier shadow-camera coverage; nothing else may gate casting. Two rules constrain those numbers. The shadow camera must span the ground the gameplay camera actually shows, not a bubble around the player — a coverage radius smaller than the visible ground reads to a player as "this world has no shadows at all", because the only shadows on screen are the handful near their feet. And the key light must stay well above the hemisphere fill: at comparable intensities a fully occluded surface is barely darker than a lit one, so shadows render correctly and still fail to read.

AO: soft/broad at beam/stone/foundation/crate/roof/boat/dock/rock/crop contacts. Never black creases or edge-outline every polygon.

Atmosphere: subtle distance haze, reduced distant saturation/contrast, sky influence; maintain gameplay crispness. The clear-weather far plane is also what conceals the terrain plane's cut edge, so it must stay inside the terrain grid's extent; a far plane beyond the landform resolves the world's border against the sky and removes every depth cue at once. `VisualRenderConfig.fog` owns the numbers and `tests/unit/rendererFoundation.test.ts` holds the invariant.

Sky: simple pale-blue gradient + warm horizon + few large faceted cloud masses; sunset peach/amber horizon + cooler upper sky. Avoid visible photographic HDRI background.

## 7.1 Canonical Renderer Baseline — `VisualRenderConfig`

The project MUST have one renderer-level visual configuration owned by the render subsystem (currently `src/render/config/VisualRenderConfig.ts`). The gold-standard art slice calibrates it; after approval, changes are deliberate, benchmarked art-direction changes rather than per-scene fixes. The live object is richer than the compact interface below; treat this as the minimum ownership shape, not a copy of current numeric settings. It also owns terrain/road supporting-map sampling, rotations, mip/lod policy, and blend strengths; keep those numbers in `VisualRenderConfig.ts`, not in this Bible.

The config must centrally own at least:
```ts
interface VisualRenderConfig {
  outputColorSpace: "srgb";
  toneMapping: "aces-filmic" | "approved-equivalent";
  exposure: number;
  sun: { elevationDeg: number; azimuthDeg: number; warmth: number; intensity: number };
  skyFill: { coolness: number; intensity: number };
  shadows: { quality: "low" | "medium" | "high"; mapSize: number; softness: number; bias: number };
  ao: { enabled: boolean; strength: number; radiusMeters: number };
  atmosphere: { enabled: boolean; density: number; distanceDesaturation: number };
  bloom: { enabled: boolean; strength: number; threshold: number };
  grade: { saturation: number; contrast: number; warmth: number };
}
```

**Calibration procedure:** begin with ACESFilmic/equivalent, neutral project exposure near `1.0`, one warm directional key at roughly **25–50° elevation**, a softer/cooler fill, medium-soft shadowing, restrained broad AO, subtle atmospheric distance separation, and bloom effectively off except restrained emissive response. Tune the exact runtime values while validating bridge/farm/harbor/coast slices; once approved, store the chosen numbers in the canonical config and regression-test them.

Allowed variation is semantic and system-driven: time of day, season, weather, interior/exterior transition, quality mode. Zone scripts MUST NOT locally alter exposure, tone mapping, global saturation, or invent a second sun/fill scheme merely to make one screenshot attractive. If a zone looks weak under the shared baseline, fix geometry, material, placement, local practical lights, atmosphere parameters allowed by the system, or the global baseline through an explicit art-direction review.

Time-of-day presentation must interpolate the simulation clock through one continuous cyclic envelope: dawn/day/dusk/night labels may describe gameplay time, but they must not cause a one-frame lighting, sky, fog, celestial, practical-light, or exposure step. Graphics-quality changes likewise travel through adjacent tiers over the centrally configured handoff window. Density/distance/effect contribution may blend continuously; discrete framebuffer, shadow-map, and pass ownership changes are staged at tier boundaries so they do not all rebuild in one frame. Simulation time, route/shore truth, and core silhouette/palette never blend or change with this presentation handoff.

**Outlines are prohibited in normal world rendering:** no inverted-hull outlines, toon/ink contours, Sobel edge outlines, or black polygon-edge rendering. Shape separation comes from geometry, value/color blocks, lighting, AO/contact, and silhouette. Debug selection/highlight outlines are allowed only as temporary/contextual UI feedback.

# 7.2 Ground Surface, Roads, Cover & Contact

Treat the landscape as one coordinated five-layer system:

```text
authored landform geometry
→ semantic surface/material fields
→ route/farm/shore/disturbance influence
→ clustered ground cover
→ lighting, AO/contact and weather response
```

The layers must agree spatially. A road cannot suppress grass at one width while its dirt surface, terrain grading, map projection, and collision use unrelated widths. A shoreline cannot darken the terrain without also guiding appropriate reeds/stones/foam. Presentation signals are deterministically derived from the authored world-layout owners defined in `01`; they never become gameplay truth.

## 7.2.1 Terrain Form & Three Scales of Variation

Use authored meso landforms rather than indiscriminate height noise: shallow depressions, shelves, humps, banks, route cuts, terrace changes, and flattened working ground. The regular terrain grid must not be legible as the dominant pattern.

`TERRAIN_RESOLUTION` in `src/world/WorldLayout.ts` owns the grid step, and the step is a legibility constraint rather than a free performance dial: it must resolve the narrowest authored feature the grid is asked to carry — river channel, beach, and graded road shoulder widths. A step that exceeds those widths turns each bank and waterline into a single hard triangle row no shader can recover.

Ground richness uses three restrained scales:
- **macro:** district/landform-scale warm, cool, dry, fertile, valley, and coastal shifts;
- **meso:** the primary visible breakup—broad grass, worn ground, moisture, soil exposure, and roughness patches;
- **fine:** very subtle shared tonal/roughness breakup only; never photographic grain or micro-normal noise.

Exact meter bands belong in `VisualRenderConfig`/the owning implementation brief and must be tuned at the gameplay camera. Use only as many frequencies as remain visibly purposeful. Terrain identity should read as `macro landform + broad palette regions + meso material patches + physical cover`, not `one green + random polygon noise`.

## 7.2.2 Semantic Surface Blending

One canonical ground-surface system resolves approved palette families such as grass/sage/olive, warm/damp soil, path dust, sand, wet shore, riverbed, and coastal stone. Blend from authored semantics plus terrain normal/slope, height where meaningful, route/farm/shore influence, bounded world-space variation, and system-owned weather. Do not create unrelated per-zone ground materials.

Supporting maps may add meso/fine wear, value, and roughness only after they are converted into those palette families: sage/olive/grass for meadows, path dust/dry soil/warm sand for worked ground, and warm sand/wet-shore families for beach transitions. Dry beach and its wet edge must retain one continuous source structure while semantic shore wetness owns the darker, smoother response. Raw photographic RGB is not a legal final diffuse. A missing map must leave the deterministic palette/procedural path active rather than inventing a second material.

The terrain material/shader is a specialization that consumes the canonical palette, renderer conditions, geometry, and derived surface fields. It must not own a second terrain vocabulary, route network, shoreline model, or gameplay state.

Slope transitions expose earth/stone progressively on terrain that visually reads as a bank, cut, shelf, or cliff. Use broad filtered transitions with bounded deterministic irregularity; never visible contour bands or a universal angle table blindly applied to every district. Traversable slopes can remain grass-dominant while steep/exposed formations retain strong faceting and rock/soil identity.

A compact control texture is allowed, but not mandated. Analytic fields, mesh attributes, or chunk data are equally valid when they preserve a single source, filtering, inspectability, determinism, and performance. Channel meanings/resolution are implementation contracts, not Art Bible constants.

## 7.2.3 Roads as Worked Ground

Roads are authored route corridors, not clean orange ribbons or visibly floating planes. Different route kinds use human-scale widths and a readable cross-section:

```text
grass → irregular shoulder/grass intrusion → compacted edge → worn core/ruts
```

They conform to and subtly grade the land, with crown/depression, wear, soft shoulders, occasional contextual stones, and controlled irregularity. Steep routes may form a small cut or bench instead of wrapping over every terrain fluctuation. A separate surface mesh is acceptable only when it shares the canonical route/profile owner, follows the terrain, feathers into it, avoids z-fighting/visible slab thickness, and cannot drift from terrain/cover/collision semantics. Any deformation that materially changes the walkable surface follows `01`'s canonical height/collision contract; cosmetic-only displacement must remain visually and physically negligible. Do not require a shader-only road solution when the existing shared route system satisfies the visual contract.

The visible route edge must be owned once. Prefer a narrow world-space irregular coverage edge over stacking a coarse terrain tint beneath a wide transparent road feather; overlapping metre-scale blends create muddy halos and view-order instability. Pixel-scale anti-aliasing, world-space dither, and shared Worley cells with the meadow mosaic are allowed when they keep the silhouette irregular and faceted. They must not turn the shoulder into a blurry ribbon, a binary triangle-edge fringe, or a several-metre brown halo. Terrain may contribute only a bounded path underlay inside that same shoulder. Terrain and road variation remains world-space and cannot change with camera orbit, pitch, or zoom. Supporting maps on the road drive packed-core wear and shoulder grass intrusion; they do not author a second route width.

## 7.2.4 Clustered Ground Cover

Ground cover is distributed by deterministic causal composition fields, not uniform scatter or coverage quotas. District, habitat, route-frame/gateway, opening, river-bank, architecture, farm, building, landmark, fishing-access, and coastline causes combine before category-specific macro/meso variation. Stable candidate addresses remain invisible; selection establishes cores, edges, isolates, landmarks, riparian pockets, and large connected openings before individual assets are considered. Trees, bushes, flowers, short cover, reeds, and rocks use independent candidate and species streams so one category cannot inherit another's coordinates or accepted-array order. Density responds to meadow/soil/shore/slope/route/farm/building/landmark clearances and preserves authored breathing room. Use a hierarchy:
- short chunky grass as the common low silhouette;
- medium clumps as patch structure;
- tall meadow/reeds only in selected wet edges, depressions, borders, and unused shoulders.

Cluster palette variation by patch/area (sage, olive, yellow-green, shadow green, dry straw-green), not independent random color per blade. Repeated cover uses instancing/batching, distance/quality-tier culling, bounded variants, and little or no dynamic shadow casting. Large clumps and world anchors still need soft contact grounding; do not add a dark blob under every blade.

Do not use visible habitat-cell lattices, fixed ellipse fills, stratified patch-center coverage, fixed riverbank rows, accepted-index asset cycling, or seeded screenshot-specific overrides as composition rules. Quality tiers select stable priority prefixes so retained instances keep their identity. Route corridors must alternate useful open and framed segments without forming repetitive walls, while the farm and headland/coast retain large connected breathing spaces.

Increase perceived coverage before raw instance count: use broader cheap clumps, clustered patch rhythm, coordinated palette/value regions, distance-aware density, and preserved open ground. Never pursue another game's vegetation count literally; the scene budgets and gameplay-camera result own the decision.

Distance budgets and LOD membership for terrain dressing use the player/world anchor, not the render camera or its look-ahead direction. Camera orbit, pitch, and zoom must not regenerate a ground field, reshuffle nearby cover, or switch world-asset membership. Ordinary frustum rejection may skip objects that are genuinely off-screen; it must not cause visible in-frame popping from stale or camera-led bounds.

## 7.2.5 Shore & Weather Continuity

Land-to-water transitions read as `dry ground → floodplain shelf → darker vegetation → upper/lower bank → wet soil/stone → reeds/pebbles where appropriate → shallow water → moving thalweg/deeper water`. River transitions consume the side-aware longitudinal profile: outside bends read steeper and erosional, inside bends gain shallower depositional shelves, straight reaches may form riffles, and the estuary blends continuously into the coastal shelf. Reeds/cattails form discontinuous depositional pockets and leave fishing-access gaps; erosional banks favor exposed soil and rocks. Foam is contextual around obstacles, supports, fast water, wakes, and exposed coast—not a uniform calm-river outline.

Precipitation wetness is a shared render response: palette-preserving darkening plus bounded roughness/specular change, smoothed over time and controlled centrally. It must not make the world glossy/plastic, recolor protected non-ground surfaces accidentally, or mutate soil moisture/gameplay state.

## 7.2.6 Starter-Farm Gameplay Benchmark Lock

For starter-farm environment graphics, `art/references/neva-ui-hud-on-foot.png` fixes the following construction language at the normal gameplay camera:

- grass and worked ground separate through broad polygon regions with a narrow, filtered shoulder; the silhouette stays irregular and faceted, but it must merge without dark cutout holes, black seams, or an obvious floating overlay. Avoid both a blurry uniform ribbon and a binary cell-step fringe. Supporting maps may enrich wear inside those regions; they must not replace this construction language with a photographic dirt slab;
- paths use warm sandy-ochre/tan cores with restrained value variation, occasional grass intrusion, and intermittent low flagstones/stepping stones rather than continuous cobble;
- meadow coverage combines a continuous low, broad grass read with deterministic clustered chamomile/daisy drifts, chunky leafy bushes, and authored breathing room around routes, fields, buildings, and interactions. Flower heads sit within the meadow silhouette rather than reading as repeated tall bouquets; reeds/cattails stay on wet edges instead of ordinary dry path shoulders;
- tree crowns read as several asymmetrical faceted masses rather than spheres or leaf-card noise;
- mature wheat reads as dense warm-gold heads, while decorative pumpkin beds read through chunky faceted fruit, broad leaves, and vines. Only simulation-owned crop states are interactive gameplay truth;
- the clear-day baseline begins from an approximately 35-degree sun elevation and 45-degree azimuth, warm key light, cool ambient fill, contact grounding, and palette-preserving ACES output. `VisualRenderConfig` owns the exact calibrated values.

This is a graphics-language lock, not permission to copy the reference camera, layout, UI, depth of field, tilt-shift, or scene composition. Bloom and depth of field remain disabled in ordinary world rendering.

# 8. Water, Waves, Shoreline & Foam

Water is a hero system: **faceted, layered, blue-green, clean, moderately reflective, low-frequency, animated, browser-efficient**.

Recommended shader layers:
```text
shallow/deep color gradient
+ low-frequency world-space vertex waves
+ faceted/quantized normals
+ large polygonal color/normal cells
+ Fresnel edge reflection
+ soft sun highlight
+ shore/collision foam mask
+ weather-driven amplitude
```
Optional one subtle low-frequency scrolling normal. Avoid realistic high-frequency normals, SSR for MVP, tiny waves, noisy foam, mirror water. Low-resolution displaced geometry + flat/quantized normals is acceptable if it profiles best.

Water color: shallow light turquoise/aqua → mid teal/blue-green → deep darker desaturated blue; brighter shore, large regions, no electric cyan.

Waves: broad directional low-frequency displacement and faceted response; boat motion may sample simplified matching wave function.

Shoreline: shallow-water band + wet-ground value shift + simple foam + contextual stones/reeds/driftwood. Filtered supporting-map breakup may continue from dry beach into the wet band only through the canonical shore weights; it cannot paint a second shoreline or replace physical stones and cover. Foam/splashes are warm white, chunky, angular, low-detail, high-contrast; use polygonal ribbons/shards for rocks/wakes, particles only as supplement.

# 9. Vegetation & Rocks

Trees: trunk + few branch cues + several irregular low-sided faceted crown clusters. Avoid spherical blobs/high-density leaf cards. Important species: **3 minimum silhouette variants, 5 preferred**; vary height/lean/spread/crown count/width/trunk thickness/warm-cool greens. Conifers use layered angular wedge/cone masses.

Grass: terrain color + clustered instanced chunky short cover + selected medium/taller meadow/reed patches. Broad blades/angular cards; no hair grass. Use yellow-green highlights + olive/sage shadows, with patch-level palette grouping and semantic suppression around roads/buildings/farms/steep exposed ground.

Flowers: sparse clustered white/soft yellow + occasional warm red/orange; never uniform rainbow scatter.

Rocks: large planes, angular silhouette, clear top/side values, little/no texture noise. Families: warm field stone, medium/large warm boulders, dark coastal, pale shoreline, masonry. Common categories need **3–6 variants**. Dark charcoal coastal rock should contrast teal water/white foam; inland can be ochre/golden.

# 10. Farming, Fishing, Fish & Boats

**Farm:** working, personal, productive. Crop states must visibly read without UI: seeded soil, sprout, young/growing, mature, overripe/dry. Crops use chunky leaves, strong silhouettes, slightly exaggerated produce, instancing; no realistic alpha-card aesthetic. Tilled soil: broad furrows, dark warm soil, subtle damp variation.

Priority farm props: crates, baskets, watering can, bucket, hand plow, wheelbarrow, sacks, seed chest, compost/worm compost, small mill, cart, irrigation, water barrel, scarecrow, hay bale, trough. Every prop needs gameplay or strong storytelling value.

**Fishing identity:** nets, hooks, rope, floats/buoys, fish/ice crates, fillet/drying/rod racks, chum barrels, bait boxes, coolers, scale, cleats.

Fish: species-readable major body proportions + simplified fins + controlled color blocks + faceting; no cartoon faces/hyperreal scales/plastic. Preserve small/medium/large/gargantuan size contrast. Material: high-ish roughness, subtle specular edge, lighter belly, darker dorsal region. Every live sport species uses its own catalog-generated silhouette and an authored mouth-hook node; stand-in trout/tuna swaps are not acceptable. During a fight the simulation-owned depth remains unchanged, while the opaque-water presentation may show a restrained teal-tinted translucent silhouette and distance-only presentation scale so the actual hooked fish stays trackable without outlines or magical glow. The fishing line runs continuously from an authored rod line-exit marker to that mouth hook, with its aerial section depth-tested against the angler and boat and only its post-water-entry section receiving the thin subdued underwater treatment. Its bend is constructed in the line's local frame so camera orbit cannot slide it sideways; it must not billboard-twist, detach, cut across the character, or become a dotted world-space ribbon. Both hands stay locked to authored rod grips. Sport-fishing stance is craft-specific: the angler fishes seated and braced from the rowboat, but moves to a clear working-deck station and takes a wide standing stance on the skiff. The two-subject fight camera keeps angler and fish readable with slow focus/yaw settling and restrained behavior offsets; fish behavior must read primarily from the fish, rod and water, not rapid camera motion. School disturbance is a small translucent surface ripple plus directly readable fish, never a large opaque target ring.

Boats are progression silhouettes: rowboat → fishing skiff → future larger vessel. Rowboat: simple worn timber, two benches/oars/storage, with the current catalog target/hard maximum at **5.5k / 6k triangles**. Skiff: compact working boat, optional small console/cabin, visible hold/hooks/rope/buoys/crates/ice/nav lamp, with the current catalog target/hard maximum at **8.5k / 16k triangles**. The catalog remains the authority for all floors, targets, materials, nodes, and future variants.

# 11. Environment Composition & Density

Composition is governed by the game's zone needs, **not reference-image layout**.

Harbor is visual centerpiece: hero fish market/warehouse/workshop/office; support jetties, crates, barrels, nets, racks, scales, boats, rope, buoys, awnings. Layer intentionally: `village → working market edge → dock → boats → water`.

Starter farm: small/personal/imperfect/peaceful/productive/expandable; one hero farmhouse/shed, 2–3 fields, small path, water source, storage, tree/rock framing.

Village: curved paths, courtyards, clusters, terminus landmarks, changing widths/elevations; no perfect grid.

Paths: used-looking soft dirt curves with route-appropriate width, shaped intersections, compacted/worn cores, soft shoulders, edge-grass intrusion, subtle terrain grading, and occasional stones; cobble uses large stylized stones, not thousands of tiny ones.

Density rhythm: the farm preserves broad working openings and wooded outer edges; the village increases enclosure outside plazas, doors, roads, and the bridge gateway; the harbor uses low tree enclosure with denser working edges and open waterfront sightlines; the headland is sparse, wind-exposed, rocky, and horizon-open; offshore remains very low. The river is a discontinuous riparian corridor shaped by wetness, deposition, erosion, bends, access, and district boundaries rather than a continuous green wall.

Sunreach is the warm-dry counterpoint, not a recolored Neva. Its silhouette is
a sheltered western cove rising through dry-stone working terraces and olive
groves to pale exposed ridge planes, with a seasonal wash cutting downslope
toward a readable southern reef shelf. Use warm ochre soil, sun-bleached stone,
sage scrub, olive foliage, sunflower gold, terracotta/cream cove accents, and
teal water as broad masses. Density moves from a compact working cove to
ordered terrace openings, clustered scrub core/edge/isolate rhythm, a sparse
wind-exposed ridge, and an open reef horizon. Preserve the farm, route, wash,
market, dock, and fishing approach clearances; avoid desert clichés, tropical
palms, duplicated Neva forest density, evenly scattered scrub, and a second
river corridor.

Prop clusters are authored, not confetti (e.g. 2 crates + rope + barrel + bucket + small net, then breathing space).

Every scene has Hero/Support/Filler hierarchy. Filler does not receive hero detail.

## 11.1 Environmental Storytelling & Narrative Readability

Neva's visual story is carried by working places, worn routes, repaired
objects, and the relationship between land and water. Narrative dressing must
support the live eighteen-quest spine in `02`; it must not become a second quest
system or a pile of decorative clues. A player should feel who keeps a place
working and why the next district matters before reading a large amount of
text.

| Area | Narrative promise | Visual evidence | Gameplay relationship |
|---|---|---|---|
| Northwest starter farm | This is inherited responsibility becoming home. | Tilled furrows, seed pouch, watering can, worn fence repairs, compost, workbench, farmhouse warmth, and a clear garden gate. | Planting, watering, harvest, and processing are readable as care and preparation, not isolated minigames. |
| Northeast village hub | Private work becomes community exchange. | Curved paths converge on the produce market; bakery, cottages, mill, barn, and courtyard show different kinds of shared labor. | The market and mill route should explain why the player leaves the farm and where local trust is built. |
| River corridor and bridge | The first crossing is a lesson in reading a living place. | Worn bridge approaches, visible banks, reeds, calmer water, simple fishing traces, and a route that remains legible from both sides. | Basic fishing is framed as learning currents before attempting the open water. |
| Southeast harbor | The sea is a working economy with consequences. | Fish tables, scales, ice, crates, nets, rope, drying racks, mooring hardware, market frontage, and the family rowboat slip. | Freshness, cargo, boat preparation, and Maeve/Silas dialogue have visible context. |
| Southwest headland and lighthouse | The island is larger than the first route and requires orientation. | Cliffs, beacon/lighthouse silhouette, wind-shaped vegetation, lookout lines, and restrained navigation marks. | It provides optional horizon/context and future route promise without blocking the current P12 story. |
| Coast and offshore fishing grounds | Abundance is temporary, ecological, and worth returning from responsibly. | Gulls, water disturbance, wake, changing depth/color, sparse horizon, and readable school presence; avoid magical glow as the only signal. | School discovery, weather, time, travel distance, and freshness create the expedition's pressure. |
| Sunreach Cove, terraces, ridge, and reef | A second island is a different working ecology connected by seamanship, not a detached biome diorama. | Skiff mooring and cove market; dry-stone terraces, Sunflowers and olive forms; seasonal wash, sage scrub, exposed ridge planes, and visible reef shelf. | The crossing, local crop-to-chum chain, physical Sea Bream stow, cove sale, and fish-scraps return to terrace soil remain readable as one route. |

Environmental story rules:

- Give each narrative prop a practical or navigational reason to exist and
  place it in an authored cluster with breathing room. Do not fix weak lore by
  adding barrels, signs, flowers, papers, or clutter.
- Prefer visible evidence of use—worn path cores, repaired timber, sorted
  catch, damp soil, stacked supplies, maintained rope—over exposition plaques.
- A story cue may deepen or orient a required action, but noticing it must never
  be the only way to satisfy a required quest objective or unlock.
- Repeat motifs with variation: family woodwork, blue-green fishing trim,
  rope/net language, warm grain/soil, and the transition from furrow to water.
- Keep text/signage short and readable at gameplay distance. The dialogue and
  journal remain the authoritative explanation; the world supplies evidence,
  mood, and anticipation.
- Review the farm, bridge, harbor, and coast cues from the actual gameplay
  camera. A diorama or beauty render can prove style, not narrative usability.

# 12. Modular Kits & Variation

Build reusable kits but hide modular repetition.

Building: `wall_plain/window/door/shopfront`, gable/hip/turf/shingle roofs, stone foundation, beam corner/horizontal, chimney, awning, sign mount.

Dock: 2m/4m straight, corner/end/stairs/ladder/piling/cleat/rope/platform. Fence: picket/rail straight+corner, small/large gate, broken variant. Roads may use splines; avoid visible repeat seams.

Any object appearing **>10 times in one scene** needs **≥3 visual variants** or controlled procedural variation (`scale ±5–10%`, rotation, small color change). No wild scaling.

Season-ready assets should support spring/summer/autumn/winter via color parameters, foliage variants, snow overlays, seasonal prop swaps—avoid complete model replacement per season.

# 13. Characters & Animation

Characters must look as though they were authored by the same art team as the environment. The player/worker baseline stays premium faceted coastal low-poly; named NPCs may use the catalog-declared `chibi-storybook` variant: compact, animation-film-inspired storybook proportions with the same tactile materials, grounded contacts, and role-specific coastal clothing. Do not let either variant drift into realistic-human, glossy mobile-avatar, flat-toon, or generic anime language.

## 13.1 Proportions & Silhouette
- Player/worker baseline: approximately **6–6.5 heads tall**; readable/stylized rather than realistic 7.5–8-head fashion proportions.
- Chibi-storybook NPC variant: approximately **4.5–5 heads tall** across the visible head mass; use a compact torso, short sturdy limbs, broad hands, and a clearly readable head without collapsing into an extreme 3-head mascot.
- Head: enlarge the NPC variant enough to carry expression at gameplay distance; hands **+10–20%** and feet **+5–10%** where needed for gesture/readability. Keep the silhouette authored rather than toy-round.
- Torso/limbs use simplified broad forms, gentle taper, readable elbows/knees, and controlled planar changes. Avoid noodle limbs, oversized toy shoes, or superhero anatomy.
- Silhouette must communicate role through practical clothing/tool shapes before facial detail. Validate at **8m/15m/30m** like environment assets.

## 13.2 Face, Eyes & Skin
- Face is built from a few soft/faceted planes: brow, nose wedge, cheek/jaw planes, simple ears, restrained mouth. No sculpted pore detail or realistic wrinkle normals.
- Player eyes remain small/simple and readable. NPCs may use larger, warm, simple storybook eyes for expression and gameplay readability; avoid black ink outlines, glowing whites, or sticker-like contrast at distance.
- Facial expression relies on brows/eyes/mouth and modest blendshape/bone changes; no rubber-face deformation.
- Skin is matte/satin stylized PBR with broad value variation only; starting roughness **~0.65–0.85**, low metalness, no waxy subsurface/plastic look.

## 13.3 Hair & Facial Hair
- Hair is authored as **chunky low-frequency clumps/locks**, typically several primary masses plus a few secondary pieces; no thousands of strands and no realistic hair-card forest.
- Preserve faceted silhouette and warm/cool value grouping. Beards/moustaches use the same clumped geometric language.

## 13.4 Clothing & Materials
- Practical coastal/farm clothing: canvas, linen, wool, simple leather, weathered workwear; muted blue, ochre, rust, cream, forest green, brown, restrained red/teal accents. No modern neon, glossy synthetic sportswear, ornate high-fantasy armor, or combat gear.
- Folds are broad modeled planes/creases at shoulders, elbows, waist, knees, hems; do not paint high-frequency fabric wrinkles.
- Reuse shared cloth/leather/metal palette/material families; character-specific textures should stay low-frequency and support identifiers, not carry the whole style.

## 13.5 Budgets, Rigging & LOD
- Character triangle and material budgets are catalog-owned; use the declared entry rather than a universal range. LOD1 is required when the catalog contract declares it and the character remains visible at distance.
- Prefer the catalog-declared material cap and shared material families; do not introduce a second character budget table here.
- Standard reusable humanoid rig; consistent naming/retargeting; minimal extra bones for coat tails, hair clumps, tools only where visibly useful.
- The `chibi-storybook` NPC variant shares the standard humanoid rig, sockets, and animation contract; its catalog style parameter changes the proportion set and mesh placement together so interaction anchors do not drift.
- Licensed source animation libraries may inform the canonical rig offline when a catalog entry declares the source. Retarget only motion whose relaxed pose, axes, proportions, and usable joint ranges transfer cleanly; otherwise use it as reference and author the performance directly on Neva's rig. Keep Neva's interaction clips and gameplay markers, and export in-place 30 FPS motion without shipping the source rig or mesh.
- Preserve joint volume on the hero player and weight deformation across usable limb lengths; do not spend the character budget on disconnected joint ornaments while elbows, knees, shoulders, or hips collapse in the shipped clips.
- LOD preserves head/hair/clothing silhouette, color blocks, hands/tools, then removes tertiary pieces.

## 13.6 Animation Language
Animation is slightly exaggerated, clear, soft, and grounded; neither hyperreal mocap nor rubber-limb cartoon. Prioritize readable anticipation/contact/recovery on repeated verbs: walk/run, interact, plant, water, harvest, carry fish/crate, cast/reel/brace, board boat, dock/load. Keep foot contact and tool alignment believable. Reusable ambient library: foliage, cloth, smoke, water, boats, birds, splashes, signs, windmill.

Repeated locomotion uses explicit contact/pass/recovery poses and an in-place stride calibrated to the catalog reference speed. Blender forward is `-Y`; glTF export and the runtime heading convention map that authored direction to model-local `+Z` (yaw zero also faces world `+Z`). A forward contact places the landing foot ahead, support carries it backward relative to the pelvis, and recovery folds and returns it forward; never repair this with a blanket whole-rig axis inversion. Imported motion is calibrated from a relaxed source pose and transferred at target-rig-safe amplitudes; source bind-pose axes are never copied directly. Compatible walk/run/carry and mounted transitions preserve normalized phase rather than restarting both legs during a crossfade. Authored walk/run starts are used only when their final pose exactly equals loop phase zero; otherwise locomotion crossfades directly without a false start clip. During moving stance phases, the visible feet are constrained after the authored pose and world transform against the canonical traversal surface; stance locks release during swing, airborne motion, vehicles, mounting, presentation discontinuities, and neutral idle. Human and animal idles retain an explicitly keyed, planted rest stance instead of being continuously warped to local floor samples. Quadruped gaits use explicit plant/load/toe-off/recovery phases, a verified model-forward axis, and clean non-gait leg keys rather than sinusoidal pendulum legs or an inherited first gait frame. This is presentation correction, never root-motion or save authority.

Interactions constrain the character to authored equipment markers after the base pose: both fishing hands use rod grips, carried cargo occupies the body-front two-hand hold rather than a backpack-side socket, rowboat oars remain boat/oarlock-owned while hands follow their moving grip markers, and mounted pelvis placement derives from the rig's rest pelvis rather than a copied character-specific offset. Mounted knees project forward and open around the animal's barrel while the lower legs fold back to authored stirrup sockets without thigh pedalling. The rowboat keeps pelvis contact on its physical bench, knees forward of the hips, and both feet braced against authored foot-stretcher supports through rowing; the chairless skiff uses a planted standing helm stance. Boarding, docking, mounting, and dismounting preserve the first visible world pose and converge to exact context anchors. Contact constraints should stabilize the authored performance, not erase anticipation, weight shift, or the interaction's simulation-owned commit timing.

**Character gold gate:** before producing a large NPC set, approve one player/worker character in neutral idle + walk + farming interaction + fishing interaction under the canonical gameplay camera and renderer. Judge it beside farm/harbor assets, not in an isolated studio render.

**Narrative role cues:** character silhouette, clothing wear, carried tools, and
station context should communicate practical identity at distance. Elspeth
reads as garden/bakery stewardship, Barnaby as timber/workbench craft, Maeve as
fish market/cold-storage trade, and Old Silas as weathered harbor/seamanship.
These are visual role cues, not new gameplay tags or permission to assign fixed
backstories that are absent from the canonical quest content.

# 14. Camera-Aware Modeling, LOD & Budgets

Validate assets at **8m, 15m, 30m**, plus each catalog-declared `readDistanceMeters`. The 8/15/30 m views are baseline review distances, not a replacement for an asset's declared gameplay read distance. If important detail disappears at 15m, enlarge the form rather than add detail.

LOD: small props usually none; trees LOD0/LOD1/optional LOD2 impostor/low mesh; hero buildings LOD0/LOD1 where useful; crops prefer instancing + distance simplification. LOD must preserve silhouette, color blocks, major facets before tertiary details.

Non-normative visual scale heuristics (not production budgets):
```text
tiny prop ≪ normal prop ≪ large prop
crop clump < tree < support building < hero building
rowboat < skiff; ordinary fish stay compact and readable
```
The production floor/quality target/hard maximum for each generated asset is defined in `assets/specs/asset-catalog.json`. The lower bound is a validity gate and the target is a quality-review trigger, not permission to inflate meshes: silhouette, authored planes, thickness, proportion, deformation, and gameplay-camera readability must explain the spend.

Material budgets are also catalog-owned; current entries may use up to eight material groups where the asset contract requires it. Material reuse still matters strongly for draw calls, but this guide must not override an individual catalog cap.

# 15. Runtime Export, Naming, Pivot & Collision

When a real texture path is introduced, KTX2/BasisU is preferred for GLB-embedded textures; WebP/AVIF remains valid for suitable non-GLB use. Ground supporting maps currently use that non-GLB WebP path under `public/assets/textures/terrain/`. The current successful geometry/vertex-color pipeline does not by itself prove KTX2 integration.

Runtime 3D: **GLB/glTF 2.0**, meters, Y-up, applied transforms, stable pivots/names, no Blender garbage/unused materials/duplicate textures. Generated files are published only through `tools/blender/cli.mjs`; do not copy Blender exports directly into `public/assets/models`. Supporting maps are not catalog GLBs and must not be published through that prefab path.

Catalog IDs and filenames use lowercase snake case: `house_farmhouse_a`, `dock_straight_a`, `prop_crate_wood_a`, `tree_oak_a`, `crop_wheat_mature`, `boat_skiff_a`, `fish_trout_a`. Root/semantic node names are stable catalog-declared identifiers such as `house_farmhouse_a_root`, `boat_skiff_root`, and `boat_skiff_cargo_01`; collision nodes use the `COL_` prefix required by the catalog.

The implemented catalog pivot values are `ground_center`, `center`, and `buoyancy`. Buildings/trees/crops normally use ground contact; boats use buoyancy; fish/clouds and similar free objects use center. Hinged/axle subnodes may have local pivots, but the asset-level pivot must use the schema vocabulary.

Render mesh ≠ collision mesh. Collision policy is catalog-declared as `none`, `box`, or `compound`; required proxy nodes use names such as `COL_house_farmhouse_a`. Avoid per-triangle normal-environment physics.

Three.js materials: prefer `MeshStandardMaterial`; custom shaders mainly for water, stylized foliage motion, special weather—not every prop.

# 16. Tone Mapping & Post Processing

Use one consistent color pipeline: warm highlights, clean midtones, preserved accents, soft highlight rolloff, cooler fill/shadows, no crushed blacks. ACESFilmic/equivalent is acceptable if calibrated. Preserve cream plaster/foam/clouds/sunlit stone without clipping; no aggressive orange LUT.

Allowed when measurable: subtle AO/GTAO-like grounding, very subtle emissive bloom, light global grading, optional extremely subtle vignette.

Avoid normal gameplay: **DOF, tilt-shift, heavy bloom, chromatic aberration, film grain, strong vignette, motion blur, sharpening halos**. Reference beauty effects are not target graphics.

# 17. UI-to-World Relationship

Neva has two related interface families. **World HUD** uses sparse translucent blue-charcoal ink plates, cream text, restrained ochre/brass emphasis, icon-led meters, and clipped silhouettes. **Physical interfaces** read as handled coastal objects: satchel, open field journal, nautical chart, market ticket/ledger, posted expedition notices, and a pause vignette over the live world. Both inherit Neva's warm, salt-weathered, faceted material cues without turning every surface into a wooden board.

The world remains primary. Normal play targets roughly 15–18% persistent HUD coverage and must stay below the 20–25% ceiling. Keep the player, current path, NPC, crop, bobber, fish, and vessel readable. Use compact edge clusters, one verb-first contextual prompt, and brief tool-name expansion; remove permanent empty objectives and unrelated HUD during sport fishing. True sheets use the modal stack, while forecast, field legend, contextual teaching, and HUD details stay non-modal.

Text-heavy surfaces favor readable sans-serif copy with tabular numerals; serif is reserved for titles, story, and lore. Avoid nested cards, pill-tab rows, generic dashboards, widget sidebars, visible browser scrollbars, large form layouts, excessive rounded panels, rivets, filigree, glow, and redundant headings. State is carried by text, shape, icon, and structure as well as color. Focus is unmistakable; 44 px touch targets and safe areas apply to the landscape fallback. Interaction transitions use 120–180 ms and sheet transitions 220–300 ms; reduced motion removes typing, sliding, pulsing, and decorative movement.

The stylesheet owner is `src/ui/coastal.css`. Its cascade order is explicit: legacy compatibility, tokens, primitives, HUD, surfaces, touch, responsive fit, and accessibility. New player-facing styling belongs in the appropriate semantic layer; legacy sheets remain lowest-priority compatibility inputs until their selectors have no remaining callers.

Dialogue is a bottom cinematic ribbon that preserves the person and place. The satchel is slot-first, the market is a ledger with one selected ticket, the map is a near-full-screen chart, and the journal is an open folio for Story, Records, Skills, and Guide. Pause is a left-aligned menu over the dimmed live world, with graphics, audio, interface, and controls on separate pages. Every player surface consumes a narrow simulation-owned presentation result; React keeps transient interaction state only and never reproduces pricing, growth, travel-time, ecology, inventory availability, vessel safety, progression, or readiness formulas.

# 18. LLM/Artist Workflow

Do not improvise art task-by-task. Work through controlled visual systems: Art Bible + Palette + Geometry Grammar + Material Library + Procedural Generators + Prefabs + World Schemas + Visual Regression.

Zone workflow:
`read owning sections → identify gameplay purpose → catalog assets → palette/materials → referenceAuthoring brief when evidence-guided → registered generators/helpers → selected generate/validate/optimize/publish → Art Yard entry → runtime assemble/batch → human review in the game`. Fixed gameplay-camera captures and benchmark evidence support P0.75 visual-gold acceptance; strict generation and determinism are separate technical-art/release gates, not everyday asset steps.

`tools/blender/common/authored.py` is the implemented shared vocabulary for deliberate mid-scale forms such as masonry courses, shingles, planks, lattice/rope, arches and fasteners. It exists to make handcrafted geometry language consistent across architecture, props and boats while preserving seeded reproducibility. It does not replace silhouette design, family-specific composition, catalog ownership or gameplay-camera review.

The machine workflow is not optional: catalog/schema/palette validation precedes Blender; normal generation records quality debt; strict generation blocks production acceptance; published manifests are distinct from the latest candidate quality report. Use the commands and artifact semantics in `BLENDER.md` / `tools/blender/README.md` rather than direct Blender-to-public export.

Zone brief fields: zone, gameplay purpose, narrative promise/story beat, emotional state, people/roles present, hero landmark, primary/secondary/accent colors, architecture, ground, vegetation, water, hero/support/filler assets, practical story props, ambient animation, clusters, navigation cues, required player decision, prohibited elements, performance constraints.

Asset brief fields: ID/name/category/gameplay purpose/silhouette/dimensions/primary+secondary shapes/asymmetry/materials/palette/texture/triangle+material targets/LOD/pivot/collision/animation/variants/interactions/gameplay-distance readability/avoid list. When references guide the asset, the catalog's closed `referenceAuthoring` object additionally records source roles, component hierarchy, negative space, hidden-surface strategy/confidence, critical features, bindings to generator parameters, failure modes, and required multi-angle/gameplay-distance views. Run `npm run art:brief -- --asset ID` once when that selected brief changes; `ready` describes brief completeness, never visual approval.

The reference-authoring layer may borrow feature-inventory and multi-view iteration methods from reconstruction tools, but static Neva production still ends in the registered Blender-generator/GLB pipeline. A cleaned or generated source derivative is supporting evidence, not silent replacement for the original. Inferred rear/side structure remains confidence-labeled until the actual GLB is reviewed.

New-family, shared-generator, renderer, and release/gold-slice prompts MUST reference this bible + Art Pipeline and reiterate that supplied images are **graphics only**, not layout/camera/tabletop/DOF/staging. Routine existing-asset prompts use only the selected entry, owning generator, `BLENDER.md`, and directly relevant sections.

# 19. Visual Acceptance System

Review new zones from: hero shot, actual gameplay camera, opposite direction, close material view, weather/night if applicable. Reference-authored assets additionally require front, rear, side, three-quarter, 8 m, 15 m, and declared-read-distance views. Never approve one flattering angle.

The dev-only `/__neva_art_yard` is the sole asset-review surface: it reuses the
canonical `VisualRenderConfig`, `PaletteMaterials`, `LightingRig` and runtime
loader, while exposing orbit, distance/LOD, wireframe, collision and lighting
diagnostics. A successful publish is available there through
`?asset=<catalog-id>`. The controls help the human inspect contract or
readability problems; they are not agent style approval. The actual integrated
game remains the final visual judge.

For human visual review, use a qualitative checklist covering silhouette, facet/geometry, palette, material, lighting, water/foliage, atmosphere, gameplay readability, consistency, distinctiveness, repetition, and performance. Do not invent or require numeric scores when recording a human decision. The P0.75 visual-gold decision is the explicit human approval of the four gameplay-camera slices; current-manifest validation and the upper-budget benchmark are separate mechanical/technical evidence recorded by `03`/`BLENDER.md`. The registry records decision and scope, not a fabricated score. Zone-layout review uses the game's zone brief, not uploaded layouts. Routine agents do not perform or report a visual score.

## 19.1 Regression QA — Game vs Approved Game Benchmark
Use identical scene/state/seed/camera/resolution/time/weather/render configuration. Screenshot diff, SSIM, LPIPS, histogram/luminance, palette-distribution and silhouette/edge metrics may detect unintended changes. A metric failure is a review signal, not permission to optimize visuals toward a number. Approved intentional art changes replace the benchmark only after human/Art Director approval.

## 19.2 Style-Match QA — Game vs Supplied Graphics References
This is **not** pixel matching. Unless composition is explicitly the task, ignore reference layout, camera angle, scene border, diorama/tabletop presentation, DOF/tilt-shift and prop staging. Review instead:
- authored geometry/facet scale and selective bevel language;
- silhouette/proportion/exaggeration;
- palette distribution and warm/cool balance;
- roughness/specular/material separation;
- sunlight/fill/shadow/AO/contact grounding;
- polygonal water, teal depth structure, foam/splash language;
- vegetation/rock clustering and angular forms;
- atmospheric depth;
- detail frequency and avoidance of photoreal/plastic/toy drift;
- whether the screenshot plausibly belongs to the same visual family while remaining a continuous playable game.

Do not use SSIM/LPIPS thresholds between compositionally different reference images and game screenshots as an approval target.

## Asset Gate
- catalog/schema/palette validation passes; generator, seed and required nodes are declared;
- supplied/reference evidence is represented by a valid non-shallow `referenceAuthoring` brief whose hierarchy, critical features, parameter bindings, hidden-surface confidence, failure modes, and review views survive implementation;
- every generator/helper parameter consumed by the asset exists in its catalog entry with no silent `params.get(..., default)` for primary structure, and all assets impacted by shared authored-construction changes generate successfully before human visual approval;
- recognizable at gameplay distance; real-world scale + stylized proportion;
- strong silhouette + intentional facets + appropriate facet scale;
- deliberate smoothing/bevels; no unnecessary micro-detail;
- shared material family + correct roughness + approved palette;
- low-frequency surfaces; correct pivot/name/GLB hierarchy;
- no unused materials; triangle/texture budgets respected;
- collision proxy correct; no shading artifacts;
- normal generation passes production floors/hard maxima and produces a quality report; P0.75 visual-gold acceptance additionally requires the four gameplay-camera human decisions, current manifest validation, and the upper-budget benchmark; technical-art/release certification additionally requires `npm run art:generate:strict` and determinism to pass;
- not default primitive/photoreal/plastic/beauty-camera dependent;
- graphics plausibly belong beside references without copying layout/presentation.

## Scene Gate
Hero landmark; readable route; authored clusters + breathing room; large/medium/small rhythm; foreground/midground/background; varied repetition; farming/fishing identity; terrain topology subordinate to landforms; roads/cover/shore semantics aligned; polished water/shore; grounded lighting; atmospheric depth; controlled palette/accents; no gameplay-blocking clutter; distinctive screenshot even without UI.

## Automatic Rejection
Reject raw asset-store look, primitive/un-authored forms, featureless smooth terrain, regular terrain triangles dominating the image, accidental tiny triangulation, hard road/grass ribbons, binary green/water seams, evenly random ground cover, photo textures, plastic gloss, scale inconsistency, too many materials, noisy textures, one bright green everywhere, identical trees, missing farm/maritime identity, generic blue-glass water, realistic particle-mist foam, toon/ink/black edge outlines, dependence on DOF/tilt-shift, copied reference layout, per-scene exposure/tone-map hacks, or performance-budget failure.

**Anti-AI-slop:** never fix weak composition by adding more barrels/crates/flowers/signs/lights/fences/particles/ornaments. Improve silhouette, spacing, proportion, material, lighting, landmark.

# 20. Signature Identity & Screenshot Test

Recurring motifs: turf-roof coastal farmhouses, warm timber frames, blue-green fishing trim, red/cream canvas awnings, faceted white/dark coastal rocks, rope/net details, rounded chunky skiffs, low wooden jetties, green hills meeting pale blue water. Use consistently, not universally.

Screenshot test: beside ten low-poly cozy games, ours should be identifiable. If not, strengthen regional architecture, coastal motifs, palette, silhouettes, water, and farming/fishing storytelling—not raw detail.

# 21. Production Order & Art Vertical-Slice Gate

Order:
1. **Visual language:** selectively smoothed traversable ground + faceted cliffs/cuts, semantic grass/soil/path/shore blending, clustered cover, water, rock/tree/grass tuft/wood/plaster/stone.
2. **Starter farm:** farmhouse/field/fence/crate/basket/watering can/compost/well-barrel/path.
3. **Harbor:** dock/rowboat/fish market/warehouse/nets/rack/buoys/rope/crates.
4. **Fishing:** rod/chum/skiff/fish/school splash/gulls/hooks.
5. **Village:** cottages/shops/stalls/inn/mill/landmarks.
Never build 100 props before style approval.

Before mass production, one scene must contain farmhouse, small wheat field, tree, rocks, fence, path, water edge, dock, rowboat, 3–5 fishing props, and demonstrate **final materials, lighting direction, water, foliage direction, scale**. If not beautiful, stop and refine.

# 22. Browser Performance & Quality Modes

At gameplay camera: **60 FPS preferred; 30 FPS hard minimum**. Quality-mode envelopes are:

```text
High:   250k–900k target visible triangles, <=220 draws preferred; 1.5M / 300 hard
Medium: 150k–600k target visible triangles, <=200 draws preferred; 900k / 280 hard
Low:     80k–350k target visible triangles, <=180 draws preferred; 600k / 240 hard
```

Shadow-caster policy is owned by `VisualRenderConfig.shadows` and is enforced by family, not by a per-placement distance allowlist; the shadow frustum owns the per-frame cost. Static placements reach the sun pass through their shared batches, so a batch that casts costs one extra draw rather than one per instance. The upper values are ceilings, not quality scores; the lower target is a signal to review whether approved hero assets, vegetation density, and faceted forms are actually present. Profile, do not guess. `tools/blender/asset_budgets.json` owns these scene envelopes; `assets/specs/asset-catalog.json` owns asset budgets.

Optimize in order: invisible geometry → material duplication → excessive texture resolution → distant LOD → tiny details. Do not immediately weaken hero silhouette.

Quality modes:
- High: full approved cover density/shadows, better water, higher LOD distance.
- Medium: reduced cover draw distance/density and shadows, standard water; retain semantic patches/route/shore transitions.
- Low: few shadows, simplified water, lower cover density/shorter LOD; retain landform silhouette, surface ownership, road shoulders, and shoreline continuity.
Core silhouette/palette remain unchanged.

Switching modes, including an Auto decision, must ramp density, draw distance, precipitation budgets, contact/AO contribution, and LOD distance through the shared transition owner. Expensive discrete DPR, shadow, and post-path changes are crossed one adjacent tier at a time; do not synchronously rebuild every quality subsystem on the selection frame.

Lighting fails if bases float, facets disappear, roof/wall merge, wood crushes black, plaster/foam clips, materials share one highlight response, shadows are unintentionally razor-hard, AO dirties edges, water over-glosses, or warm/cool separation disappears.

Material fails if plastic, photographic/noisy, micro-normal dependent, palette-breaking, close-up dependent, visibly tiling, too flat for facet lighting, or too glossy for low-poly forms.

# 23. Worldbuilding & Source of Truth

Every area communicates work and a place in the story: farm=growing/storage/tools and inherited care; harbor=loading/fishing/repair and maritime responsibility; market=weighing/sorting/selling and community exchange; river/bridge=currents/learning/crossing; boat yard=wood/hulls/repair and earned capability; lighthouse/coast=orientation and future horizons. Avoid irrelevant decorative medieval clichés.

`02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md` owns the current story spine,
dialogue intent, objective/reward meaning, and narrative progression. This
bible owns how that intent becomes visible through form, palette, composition,
wear, props, landmarks, and atmosphere. `01` owns state and presentation
boundaries. If visual evidence conflicts with a quest condition, simulation and
quest content win; repair the visual cue rather than adding a hidden rule.

Visual priority:
1. human's latest explicit visual instruction
2. this art bible
3. zone art brief
4. asset brief
5. approved existing assets
6. agent assumptions

If an existing asset conflicts, flag it; do not copy the mistake.
