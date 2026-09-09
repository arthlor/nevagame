# Guildcraft HUD source art

Produced with the built-in image-generation tool for the user-selected medieval MMO interface. The selected layout references live in `art/references/guildcraft/`; `LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md` section 17 owns the visual contract.

The shipped source sheets are `guildcraft-chrome.png` and `guildcraft-portrait.png`, both 1254 by 1254 pixels. They contain presentation art only. Labels, resource values, quantities, selection, weather and gameplay actions are live DOM content.

## Frame sheet

The first request below returned a drawn checkerboard rather than usable alpha. The shipped revision uses a flat magenta background with disconnected sprite islands, including the empty ring center, for the existing keyed extraction pipeline. The original checkerboard attempt is not shipped.

Use case: ui-mockup. Asset type: production transparent sprite sheet of medieval MMO interface chrome for the attached game's HUD. Use attached image only as exact MATERIAL AND EDGE-RELIEF reference. Deliver a single square 1536x1536 PNG on genuinely transparent background with exactly NINE well separated assets arranged in a regular 3 column by 3 row grid, each centered inside its own equal 512x512 cell with ample 45px clear gutter. No labels, letters, numbers or item icons anywhere. Shallow hand-painted antique brass rim over blackened metal and warm near-black leather, excellent old MMO painting, restrained decorative metal rivets, luminous worn edge bevels and darker recess. Front view orthographic 2D, absolutely no perspective. Top row left: empty square recessed leather item slot with chamfered corners and fine dark antique brass border. Top row center: exact same square slot selected, with brighter gold inner bevel and tiny gold diamond at bottom middle, no glow halo. Top row right: perfectly circular antique brass portrait/minimap frame with transparent empty circular center, tiny cardinal-point brass diamond decorations, no background or map. Middle row left: SQUARE broad dark-leather window panel with a thin sculpted double antique brass rim, evenly straight edges, minimal small carved ornaments exclusively in the four corners, uncluttered leather center; designed for nine-slice scaling. Middle row center: a long narrow horizontal empty dark-leather resource bar, about 4.5:1 width-height, double gold-brass bevel, right end tapered to point, no fill or text. Middle row right: wide shallow button/title cartouche, about 3.5:1 width-height, arched shoulders and small chamfers, black leather center, thin antique brass rim. Bottom row left: red wax wheat seal with one engraved golden wheat ear. Bottom row center: small three-dimensional painted cream and brass triangular north-pointing navigation arrow, simple strong silhouette. Bottom row right: sun medallion, warm amber round central sun encircled by eight short rays in a dark bronze round frame. Keep all nine fully contained and disconnected with real transparent gutters, preserve transparent holes. This is a sprite atlas for real reusable controls, not a screenshot mockup.

## Portrait

The matching portrait depicts an adult coastal wayfarer with brown hair, an ochre shirt and a dark vest, painted inside a circular silhouette on a flat magenta background. It is a decorative profile emblem matching the selected reference, not a character customization choice or canonical saved identity.

## Processing

`assets/ui/ui-atlas.manifest.json` owns island selection, output size, key tolerances, alpha trimming and edge despill. Run the existing `tools/ui/slice-sheet.mjs` for the named sheets, then `ui:codegen`, `ui:publish` and `ui:atlas`. No provider key or image-generation call ships in the client.

The source islands are reused as portrait/minimap rings, normal/selected slots, scalable window borders, resource frames, title plaques, objective seals and weather art. The pointer is available to presentation in the same family. Browser captures and interaction evidence for this implementation are under `output/guildcraft/`.
