# ArcheAge Farming System — Neva Adaptation Blueprint (Compact)

> **Role:** Farming inspiration/adaptation guide, subordinate to `01`, `02`, `04`, and the Art Pipeline. Every number, footprint, duration, modifier, capacity, and feature in this document is historical/reference-only unless `02` explicitly promotes it. Where this file's historical ArcheAge values conflict with canonical Neva values, **use `02`**; preserve the ArcheAge behavior only as design reference unless explicitly promoted. ArcheAge factions, lore, quests, terminology, and MMO social assumptions are not Neva story content; Neva's authored narrative is defined by `02` and presented through the connected coastal work loop.

# 0. Why ArcheAge Farming Matters

ArcheAge farming works because agriculture is a **physical economic foundation**, not an isolated minigame. Preserve four ideas:
1. **Spatial footprints:** free-form world placement rewards packing/land planning.
2. **Climate affinity:** region/climate changes growth/moisture decisions.
3. **Paced energy:** Neva replaces Labor Points with canonical `WorkCapacityState` (`02`): available = 100% XP/normal rare chance; depleted = 40% XP/reduced rare chance; core play never blocked.
4. **Circularity:** farming feeds bait/chum, processing, fertilizer, lumber/boats, and later trade/logistics.

# 1. Land & Property Inspiration

ArcheAge reference models (not current Neva budgets or runtime contracts):
| Plot | Reference scale/capacity | Purpose |
|---|---|---|
| 8×8 Scarecrow Garden | ~16 small crops / ~4 saplings | starter claim |
| 16×16 Scarecrow Farm | ~64 crops / ~16 trees or pens | primary farm |
| 24×24 Farmhouse/Gazebo | cottage + large agricultural area + workstation/seedbeds | advanced homestead |
| 16×16 Aquafarm | buoy-marked submerged plot | later kelp/coral/oysters |

Permission inspiration: **Private** = owner interactions only; **Public/Unclaimed** = open starter/community use. Neva remains single-player, so use these states as progression/world-access semantics rather than anti-grief systems.

# 2. Footprint & Crop Taxonomy Inspiration

ArcheAge uses 2D circular footprints rather than rigid square grids. Neva's canonical placement still uses `CropDefinition.footprint`/simulation collision; use this section only to guide scale and free-placement feel. Do not copy these reference footprints or timings into the live catalog or simulation.

| Category | Reference footprint | Examples | Reference behavior/use |
|---|---|---|---|
| Small crops | ~0.5m radius | Wheat, Barley, Potato, Carrot, Tomato, Flax | 30m–3h, single harvest; dense packing; food/feed/grain/chum/fiber |
| Seed bundles/seedbeds | ~1.5m | Wheat/Tomato/Potato bundles | 10 seeds, faster bulk handling; bait-worm drop; scale production |
| Saplings/fruit trees | ~1.5–2.5m | Apple/Fig/Olive/Pine/etc. | 6–48h, regrowing fruit, optional logging; orchard/lumber/boats |
| Livestock | ~1.5–3m | Chickens/Sheep/Cows/etc. | feed → milk/wool/eggs/butcher; later content |
| Aquaculture | ~0.75–1.5m | Coral/Oysters/Kelp | submerged long growth; later marine expansion |

# 3. Farming Interaction Lifecycle

Desired presentation flow:
`seed select → placement projection → short planting action → moisture/care → visible growth stages → harvest/logging → workstation processing → physical logistics`.

## 3.1 Placement Projection
- Selecting seed/sapling switches to precision placement.
- Terrain-conforming footprint decal/ring follows ground.
- Valid: green; invalid overlap/fence/boundary: red + warning.
- Suggested presentation: ~0.5s planting cast + kneeling/dirt-pat animation.
- **Canonical collision/validity rules come from `02`; renderer never owns placement truth.**

## 3.2 Watering Presentation
ArcheAge reference behavior: water from well/pump, bucket animation, water arc, soil darkens/wet roughness change; historical reference hydrates to 100% and can reduce remaining growth by ~10%.

**Neva canonical rule:** use `02` moisture/growth math. Do not add the extra ~10% time reduction unless `02` is explicitly updated; preserve the visual/audio feedback regardless.

## 3.3 Crop Stages
Use canonical `02` lifecycle/thresholds exactly:
```text
seeded 0.00–0.10
sprout 0.10–0.35
growing 0.35–1.00
mature 1.00–1.30
overripe 1.30–1.60
withered >1.60
```
Presentation guidance:
- seeded: dirt mound/seeds;
- sprout: bright shoots;
- growing: half-height developing foliage;
- mature: full readable crop, subtle readiness cue;
- overripe: darker/drier visual state;
- withered: brown/slumped state, optional flies/scrap/compost presentation if canonical gameplay supports it.

## 3.4 Climate Inspiration
ArcheAge reference biomes: Temperate/Tropical/Arid/Subarctic; preferred climate historically grants roughly +20–30%, non-preferred increases time/moisture pressure.

**Neva canonical modifiers/climate IDs are defined in `02`; do not override them here.** Keep biome variety as future-content inspiration.

## 3.5 Rare Tree Outcome — Thunderstruck Concept
Potential later system: low seeded-RNG roll during large-tree stage transitions (notably Pine/Cedar) → thunder/audio/lightning VFX → transformed smoldering Thunderstruck Tree → rare logs for advanced vehicles/boat hulls. This is **non-MVP unless explicitly promoted** and MUST use deterministic simulation RNG.

## 3.6 Harvesting & Logging Presentation
- mature crop hover: sickle cursor; short sickle sweep + item feedback/chime;
- tree: axe cursor; heavier multi-swing animation; stylized fall before log conversion.
Logging remains later unless canonical scope includes it.

## 3.7 Workstation Processing Inspiration
Use workstation conversion to connect farming with other systems:
- Wheat/Barley → Ground Grain → Chum chain (canonical recipes in `02`);
- produce → compost/fertilizer inputs where canonical;
- later physical trade-pack concept: bulk produce + regional ingredient/certificate → physical cargo carried/loaded onto boat. Do not add until logistics scope explicitly includes trade packs.

# 4. Contextual Farming UX

Context cursor language (icons may be SVG/UI equivalents, not literal emoji assets):
```text
Sickle → harvestable crop
Axe → mature tree
Bucket → dry crop
Shears → later livestock
Inspect → timer/climate/soil details
Prohibited → invalid ownership/state/immature target
```

Worldspace tooltip should expose only information allowed by canonical progression, e.g. crop, stage, time/status, climate affinity, moisture, fertility, expected yield range, action cost/Work Capacity, plot/access state. Never leak exact future quality if `02` gates it.

Farming interactions may use a short cast/progress bar. Movement/ESC/environmental displacement may cancel before commit. Resource mutation occurs atomically at the authoritative completion point.

# 5. Neva Adaptation Matrix

| ArcheAge concept | Neva adaptation |
|---|---|
| Land claims | public starter + private farm boundaries via `FarmState`; single-player access semantics |
| Circular/free placement | simulation-defined footprint collision on ground plane; flexible packing |
| Growth tick | canonical game-minute deterministic growth with climate/moisture/fertility/weather |
| Single vs bundle scaling | early single seeds; later seed bundles to reduce labor and connect to bait |
| Labor Points | non-blocking Work Capacity from `02` |
| Thunderstruck Trees | optional later deterministic rare proc + lightning VFX + rare timber |
| Farmhouse processing | farm output → canonical processing/chum; later physical trade cargo |
| Aquafarms | cleanly separable post-MVP marine cultivation system |
| Visual presentation | `04` + Art Pipeline: faceted low-poly, warm matte/satin PBR, canonical palette JSON/`PaletteMaterials`/`VisualRenderConfig`, catalog-declared crop assets, readable contextual UI; no diorama dependency or toon outlines |

# 6. Implementation Rule

Use this file to preserve **interaction feel, spatial farming inspiration, and future adaptation ideas**. For actual Neva state, formulas, values, inventory, growth, Work Capacity, save behavior, and MVP scope, `01`/`02` win. For visuals, `04`/Art Pipeline/`BLENDER.md` win; generated crop identities and stage assets belong in the single catalog, never in this adaptation guide.
