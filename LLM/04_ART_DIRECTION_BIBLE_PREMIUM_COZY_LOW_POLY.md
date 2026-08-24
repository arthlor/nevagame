# Premium Cozy Low-Poly Art Direction Bible — Compact
## Farming, Fishing & Coastal Village Browser Game

> **Role:** Visual source of truth for 3D art, environment design, technical art, lighting, materials, animation, UI-world relationship, and visual QA.
> **Graphics reference lock:** `coastal_lighthouse_cliff_1787253807104.jpg`, `cozy_farmstead_plot_1787253754847.jpg`, `maritime_dock_props_1787253788406.jpg`, and `rustic_timber_bridge_1787253770645.jpg` define **rendering/asset graphics only**. They do **not** define world layout, level composition, camera angle, diorama/tabletop presentation, depth of field, tilt-shift, staging, prop placement, or scene borders. Gameplay/world architecture remains authoritative.

# 0. Global Visual Grammar

Target: a **continuous playable premium stylized low-poly coastal world** with:
```text
chunky authored geometry
visible controlled faceting + broad planar faces
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
6. **Calm but alive:** foliage/cloth/smoke/water/boats/signs/birds/splashes/windmills/laundry/rain animate subtly.

# 2. Mandatory Quality Delta

Compared with generic low-poly packs, ours MUST use authored planar forms, deliberate facet shading, selective bevels, disciplined roughness, geometry/color-driven material identity, layered greens, polygonal teal water, graphic foam, strong rock planes, angular clustered foliage, material-specific response, broad rather than noisy detail, warm key + cool fill, soft grounding, and clear normal gameplay imagery without DOF/heavy bloom.

Engineering packs may inform compression/shared-material efficiency only; they are not the final visual target. Improve **form, facets, light response, and material identity per polygon**, not polygon count everywhere.

# 3. Shape, Facets, Edges & Scale

Use trapezoids, wedges, softened boxes, faceted cylinders, irregular low-sided forms, broad cuts, chunky beams, angular rocks, low-segment curves where silhouette needs them. Avoid perfect primitive dependence, high-segment cylinders/spheres, subdivision smoothness, uniformly rounded corners, tiny triangulation noise.

Facet scale:
```text
hero rocks/terrain: large visible planes
buildings: broad surfaces + shaped edges
wood props: low-segment forms + readable chamfers
foliage: angular clustered masses
water: medium-large polygon cells
small props: simplified, not over-faceted
```
Faceting must look intentional, not accidentally triangulated.

Selective bevel/chamfer: typically **2–5 cm world-space equivalent** on doors, beams, crates, furniture, hull edges, major stones, dock posts, roof trim. Do not bevel every tiny object.

Shading:
- flat/strongly faceted: terrain, rocks, many props, foliage, clouds, stylized water;
- minimal/selective smoothing: walls/boards, hull curves, rounded tools/barrels/ropes where silhouette benefits;
- hard-edged: planks, roofs, doors, stone blocks, crates, docks, fences, beams, stairs.
Never smooth away plane language.

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

Hero buildings: player farmhouse, fish market, harbor warehouse, boat workshop, village market hall, mill, inn. Target **6k–18k triangles, 2–6 material groups max**, selective 512–1024 textures; unique silhouettes. LOD1 is required above 12k when the asset can remain visible at distance.

Support buildings: cottages/sheds/shops/barns/workshops, **2.5k–10k triangles, 1–4 material groups**.

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

AO: soft/broad at beam/stone/foundation/crate/roof/boat/dock/rock/crop contacts. Never black creases or edge-outline every polygon.

Atmosphere: subtle distance haze, reduced distant saturation/contrast, sky influence; maintain gameplay crispness.

Sky: simple pale-blue gradient + warm horizon + few large faceted cloud masses; sunset peach/amber horizon + cooler upper sky. Avoid visible photographic HDRI background.

## 7.1 Canonical Renderer Baseline — `VisualRenderConfig`

The project MUST have one renderer-level visual configuration owned by the render subsystem (for example `src/render/config/VisualRenderConfig.ts`). The gold-standard art slice calibrates it; after approval, changes are deliberate, benchmarked art-direction changes rather than per-scene fixes.

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

**Outlines are prohibited in normal world rendering:** no inverted-hull outlines, toon/ink contours, Sobel edge outlines, or black polygon-edge rendering. Shape separation comes from geometry, value/color blocks, lighting, AO/contact, and silhouette. Debug selection/highlight outlines are allowed only as temporary/contextual UI feedback.

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

Shoreline: shallow-water band + wet-ground value shift + simple foam + contextual stones/reeds/driftwood. Foam/splashes are warm white, chunky, angular, low-detail, high-contrast; use polygonal ribbons/shards for rocks/wakes, particles only as supplement.

# 9. Vegetation & Rocks

Trees: trunk + few branch cues + several irregular low-sided faceted crown clusters. Avoid spherical blobs/high-density leaf cards. Important species: **3 minimum silhouette variants, 5 preferred**; vary height/lean/spread/crown count/width/trunk thickness/warm-cool greens. Conifers use layered angular wedge/cone masses.

Grass: terrain color + sparse instanced chunky clumps + selected taller meadow/reed patches. Broad blades/angular cards; no hair grass. Use yellow-green highlights + olive/sage shadows.

Flowers: sparse clustered white/soft yellow + occasional warm red/orange; never uniform rainbow scatter.

Rocks: large planes, angular silhouette, clear top/side values, little/no texture noise. Families: warm field stone, medium/large warm boulders, dark coastal, pale shoreline, masonry. Common categories need **3–6 variants**. Dark charcoal coastal rock should contrast teal water/white foam; inland can be ochre/golden.

# 10. Farming, Fishing, Fish & Boats

**Farm:** working, personal, productive. Crop states must visibly read without UI: seeded soil, sprout, young/growing, mature, overripe/dry. Crops use chunky leaves, strong silhouettes, slightly exaggerated produce, instancing; no realistic alpha-card aesthetic. Tilled soil: broad furrows, dark warm soil, subtle damp variation.

Priority farm props: crates, baskets, watering can, bucket, hand plow, wheelbarrow, sacks, seed chest, compost/worm compost, small mill, cart, irrigation, water barrel, scarecrow, hay bale, trough. Every prop needs gameplay or strong storytelling value.

**Fishing identity:** nets, hooks, rope, floats/buoys, fish/ice crates, fillet/drying/rod racks, chum barrels, bait boxes, coolers, scale, cleats.

Fish: species-readable major body proportions + simplified fins + controlled color blocks + faceting; no cartoon faces/hyperreal scales/plastic. Preserve small/medium/large/gargantuan size contrast. Material: high-ish roughness, subtle specular edge, lighter belly, darker dorsal region.

Boats are aspirational progression silhouettes: rowboat → fishing skiff → future larger vessel. Rowboat: simple worn timber, 2 benches/oars/storage, **2.5k–6k triangles**. Skiff: compact working boat, optional small console/cabin, visible hold/hooks/rope/buoys/crates/ice/nav lamp, **6k–16k triangles**, cargo capacity visually legible.

# 11. Environment Composition & Density

Composition is governed by the game's zone needs, **not reference-image layout**.

Harbor is visual centerpiece: hero fish market/warehouse/workshop/office; support jetties, crates, barrels, nets, racks, scales, boats, rope, buoys, awnings. Layer intentionally: `village → working market edge → dock → boats → water`.

Starter farm: small/personal/imperfect/peaceful/productive/expandable; one hero farmhouse/shed, 2–3 fields, small path, water source, storage, tree/rock framing.

Village: curved paths, courtyards, clusters, terminus landmarks, changing widths/elevations; no perfect grid.

Paths: used-looking soft dirt curves with wider intersections/edge grass/occasional stones; cobble uses large stylized stones, not thousands of tiny ones.

Density rhythm: quiet farm low-medium; village medium; harbor medium-high; offshore very low.

Prop clusters are authored, not confetti (e.g. 2 crates + rope + barrel + bucket + small net, then breathing space).

Every scene has Hero/Support/Filler hierarchy. Filler does not receive hero detail.

# 12. Modular Kits & Variation

Build reusable kits but hide modular repetition.

Building: `wall_plain/window/door/shopfront`, gable/hip/turf/shingle roofs, stone foundation, beam corner/horizontal, chimney, awning, sign mount.

Dock: 2m/4m straight, corner/end/stairs/ladder/piling/cleat/rope/platform. Fence: picket/rail straight+corner, small/large gate, broken variant. Roads may use splines; avoid visible repeat seams.

Any object appearing **>10 times in one scene** needs **≥3 visual variants** or controlled procedural variation (`scale ±5–10%`, rotation, small color change). No wild scaling.

Season-ready assets should support spring/summer/autumn/winter via color parameters, foliage variants, snow overlays, seasonal prop swaps—avoid complete model replacement per season.

# 13. Characters & Animation

Characters must look as though they were authored by the same art team as the environment. Do not let character production drift into anime/chibi, realistic-human, glossy mobile-avatar, or flat-toon language.

## 13.1 Proportions & Silhouette
- Adult baseline: approximately **6–6.5 heads tall**; readable/stylized rather than realistic 7.5–8-head fashion proportions. Children/elderly may vary deliberately.
- Head: roughly **+10–15%** versus realistic proportion; hands **+10–20%** and feet **+5–10%** where needed for gameplay-distance gesture/readability. Never use 3–4-head extreme chibi proportions.
- Torso/limbs use simplified broad forms, gentle taper, readable elbows/knees, and controlled planar changes. Avoid noodle limbs, oversized toy shoes, or superhero anatomy.
- Silhouette must communicate role through practical clothing/tool shapes before facial detail. Validate at **8m/15m/30m** like environment assets.

## 13.2 Face, Eyes & Skin
- Face is built from a few soft/faceted planes: brow, nose wedge, cheek/jaw planes, simple ears, restrained mouth. No sculpted pore detail or realistic wrinkle normals.
- Eyes are small/simple and readable, not huge anime/chibi eyes; avoid black ink outlines. Eye whites should not become high-contrast glowing stickers at gameplay distance.
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
- Typical gameplay character target: **6k–18k triangles LOD0**, fewer for background NPCs; use the upper half for the player/hero only when silhouette and animation visibly benefit. LOD1 is required above 12k when the character remains visible at distance.
- Prefer **2–6 material groups max** per normal character including eyes/hair/clothes where practical.
- Standard reusable humanoid rig; consistent naming/retargeting; minimal extra bones for coat tails, hair clumps, tools only where visibly useful.
- LOD preserves head/hair/clothing silhouette, color blocks, hands/tools, then removes tertiary pieces.

## 13.6 Animation Language
Animation is slightly exaggerated, clear, soft, and grounded; neither hyperreal mocap nor rubber-limb cartoon. Prioritize readable anticipation/contact/recovery on repeated verbs: walk/run, interact, plant, water, harvest, carry fish/crate, cast/reel/brace, board boat, dock/load. Keep foot contact and tool alignment believable. Reusable ambient library: foliage, cloth, smoke, water, boats, birds, splashes, signs, windmill.

**Character gold gate:** before producing a large NPC set, approve one player/worker character in neutral idle + walk + farming interaction + fishing interaction under the canonical gameplay camera and renderer. Judge it beside farm/harbor assets, not in an isolated studio render.

# 14. Camera-Aware Modeling, LOD & Budgets

Validate assets at **8m, 15m, 30m**. If important detail disappears at 15m, enlarge the form rather than add detail.

LOD: small props usually none; trees LOD0/LOD1/optional LOD2 impostor/low mesh; hero buildings LOD0/LOD1 where useful; crops prefer instancing + distance simplification. LOD must preserve silhouette, color blocks, major facets before tertiary details.

Triangle targets:
```text
tiny prop 100–1,200 | normal prop 300–2,500 | large prop 1,000–6,000
crop clump 120–700 | tree 600–3,000
support building 2,500–10,000 | hero building 6,000–18,000
rowboat 2,500–6,000 | skiff 6,000–16,000
fish 500–2,500 | hero/legendary fish up to 4,000 by explicit override
```
The production floor/quality target/hard maximum for each generated asset is defined in `assets/specs/asset-catalog.json`. The lower bound is a validity gate and the target is a quality-review trigger, not permission to inflate meshes: silhouette, authored planes, thickness, proportion, deformation, and gameplay-camera readability must explain the spend.

Material budgets: tiny prop 1; normal 1–2; support building max 4; hero/landmark max 6; rowboat max 4; skiff max 5; character max 6. Material reuse matters strongly for draw calls.

# 15. Runtime Export, Naming, Pivot & Collision

When a real texture path is introduced, KTX2/BasisU is preferred for GLB/runtime textures; WebP/AVIF remains valid for suitable non-GLB use. The current successful geometry/vertex-color pipeline does not by itself prove KTX2 integration.

Runtime 3D: **GLB/glTF 2.0**, meters, Y-up, applied transforms, stable pivots/names, no Blender garbage/unused materials/duplicate textures. Generated files are published only through `tools/blender/cli.mjs`; do not copy Blender exports directly into `public/assets/models`.

Catalog IDs and filenames use lowercase snake case: `house_farmhouse_a`, `dock_straight_a`, `prop_crate_wood_a`, `tree_oak_a`, `crop_wheat_mature`, `boat_skiff_a`, `fish_trout_a`. Root/semantic node names are stable catalog-declared identifiers such as `house_farmhouse_a_root`, `boat_skiff_root`, and `boat_skiff_cargo_01`; collision nodes use the `COL_` prefix required by the catalog.

The implemented catalog pivot values are `ground_center`, `center`, and `buoyancy`. Buildings/trees/crops normally use ground contact; boats use buoyancy; fish/clouds and similar free objects use center. Hinged/axle subnodes may have local pivots, but the asset-level pivot must use the schema vocabulary.

Render mesh ≠ collision mesh. Collision policy is catalog-declared as `none`, `box`, or `compound`; required proxy nodes use names such as `COL_house_farmhouse_a`. Avoid per-triangle normal-environment physics.

Three.js materials: prefer `MeshStandardMaterial`; custom shaders mainly for water, stylized foliage motion, special weather—not every prop.

# 16. Tone Mapping & Post Processing

Use one consistent color pipeline: warm highlights, clean midtones, preserved accents, soft highlight rolloff, cooler fill/shadows, no crushed blacks. ACESFilmic/equivalent is acceptable if calibrated. Preserve cream plaster/foam/clouds/sunlit stone without clipping; no aggressive orange LUT.

Allowed when measurable: subtle AO/GTAO-like grounding, very subtle emissive bloom, light global grading, optional extremely subtle vignette.

Avoid normal gameplay: **DOF, tilt-shift, heavy bloom, chromatic aberration, film grain, strong vignette, motion blur, sharpening halos**. Reference beauty effects are not target graphics.

# 17. UI-to-World Relationship

UI should inherit palette warmth/material cues without literally becoming wooden boards. Keep text-heavy interfaces clean and modern. World remains primary; functional clarity outranks decorative theming.

# 18. LLM/Artist Workflow

Do not improvise art task-by-task. Work through controlled visual systems: Art Bible + Palette + Geometry Grammar + Material Library + Procedural Generators + Prefabs + World Schemas + Visual Regression.

Zone workflow:
`read bible → identify gameplay purpose → zone brief → catalog asset list → hero/support/filler → palette tokens/materials → silhouettes → registered family generators + shared authored construction grammar → staged generate/validate/optimize → runtime assemble/batch → catalog preview + fixed gameplay candidates → checklist → revise → strict gate → human approval`.

`tools/blender/common/authored.py` is the implemented shared vocabulary for deliberate mid-scale forms such as masonry courses, shingles, planks, lattice/rope, arches and fasteners. It exists to make handcrafted geometry language consistent across architecture, props and boats while preserving seeded reproducibility. It does not replace silhouette design, family-specific composition, catalog ownership or gameplay-camera review.

The machine workflow is not optional: catalog/schema/palette validation precedes Blender; normal generation records quality debt; strict generation blocks production acceptance; published manifests are distinct from the latest candidate quality report. Use the commands and artifact semantics in `BLENDER.md` / `tools/blender/README.md` rather than direct Blender-to-public export.

Zone brief fields: zone, gameplay purpose, emotion, hero landmark, primary/secondary/accent colors, architecture, ground, vegetation, water, hero/support/filler assets, ambient animation, clusters, navigation cues, prohibited elements, performance constraints.

Asset brief fields: ID/name/category/gameplay purpose/silhouette/dimensions/primary+secondary shapes/asymmetry/materials/palette/texture/triangle+material targets/LOD/pivot/collision/animation/variants/interactions/gameplay-distance readability/avoid list.

LLM asset prompts MUST reference this bible + Art Pipeline and reiterate that supplied images are **graphics only**, not layout/camera/tabletop/DOF/staging.

# 19. Visual Acceptance System

Review new zones from: hero shot, actual gameplay camera, opposite direction, close material view, weather/night if applicable. Never approve one flattering angle.

Score 1–10: silhouette, facet/geometry, palette, material, lighting, water/foliage, atmosphere, gameplay readability, consistency, distinctiveness, repetition, performance. Approval: **overall ≥8/10, no category <7, graphics-reference match ≥8/10**. Zone-layout review uses the game's zone brief, not uploaded layouts.

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
- every generator/helper parameter consumed by the asset exists in its catalog entry, and all assets impacted by shared authored-construction changes generate successfully before visual approval;
- recognizable at gameplay distance; real-world scale + stylized proportion;
- strong silhouette + intentional facets + appropriate facet scale;
- deliberate smoothing/bevels; no unnecessary micro-detail;
- shared material family + correct roughness + approved palette;
- low-frequency surfaces; correct pivot/name/GLB hierarchy;
- no unused materials; triangle/texture budgets respected;
- collision proxy correct; no shading artifacts;
- normal generation passes production floors/hard maxima and produces a quality report; production/gold-slice acceptance additionally requires `npm run art:generate:strict` to pass;
- not default primitive/photoreal/plastic/beauty-camera dependent;
- graphics plausibly belong beside references without copying layout/presentation.

## Scene Gate
Hero landmark; readable route; authored clusters + breathing room; large/medium/small rhythm; foreground/midground/background; varied repetition; farming/fishing identity; polished water/shore; grounded lighting; atmospheric depth; controlled palette/accents; no gameplay-blocking clutter; distinctive screenshot even without UI.

## Automatic Rejection
Reject raw asset-store look, primitive/un-authored forms, excessive smoothness, accidental tiny triangulation, photo textures, plastic gloss, scale inconsistency, too many materials, noisy textures, one bright green everywhere, identical trees, missing farm/maritime identity, generic blue-glass water, realistic particle-mist foam, toon/ink/black edge outlines, dependence on DOF/tilt-shift, copied reference layout, per-scene exposure/tone-map hacks, or performance-budget failure.

**Anti-AI-slop:** never fix weak composition by adding more barrels/crates/flowers/signs/lights/fences/particles/ornaments. Improve silhouette, spacing, proportion, material, lighting, landmark.

# 20. Signature Identity & Screenshot Test

Recurring motifs: turf-roof coastal farmhouses, warm timber frames, blue-green fishing trim, red/cream canvas awnings, faceted white/dark coastal rocks, rope/net details, rounded chunky skiffs, low wooden jetties, green hills meeting pale blue water. Use consistently, not universally.

Screenshot test: beside ten low-poly cozy games, ours should be identifiable. If not, strengthen regional architecture, coastal motifs, palette, silhouettes, water, and farming/fishing storytelling—not raw detail.

# 21. Production Order & Art Vertical-Slice Gate

Order:
1. **Visual language:** grass/soil/water/rock/tree/grass tuft/wood/plaster/stone.
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

Dynamic shadow casters remain strictly limited. The upper values are ceilings, not quality scores; the lower target is a signal to review whether approved hero assets, vegetation density, and faceted forms are actually present. Profile, do not guess. `tools/blender/asset_budgets.json` owns these scene envelopes; `assets/specs/asset-catalog.json` owns asset budgets.

Optimize in order: invisible geometry → material duplication → excessive texture resolution → distant LOD → tiny details. Do not immediately weaken hero silhouette.

Quality modes:
- High: full shadows/foliage, better water, higher LOD distance.
- Medium: reduced shadows/grass, standard water.
- Low: few shadows, simplified water, lower foliage density, shorter LOD.
Core silhouette/palette remain unchanged.

Lighting fails if bases float, facets disappear, roof/wall merge, wood crushes black, plaster/foam clips, materials share one highlight response, shadows are unintentionally razor-hard, AO dirties edges, water over-glosses, or warm/cool separation disappears.

Material fails if plastic, photographic/noisy, micro-normal dependent, palette-breaking, close-up dependent, visibly tiling, too flat for facet lighting, or too glossy for low-poly forms.

# 23. Worldbuilding & Source of Truth

Every area communicates work: farm=growing/storage/tools; harbor=loading/fishing/repair; market=weighing/sorting/selling; boat yard=wood/hulls/repair. Avoid irrelevant decorative medieval clichés.

Visual priority:
1. human's latest explicit visual instruction
2. this art bible
3. zone art brief
4. asset brief
5. approved existing assets
6. agent assumptions

If an existing asset conflicts, flag it; do not copy the mistake.
