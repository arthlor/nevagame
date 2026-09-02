# Character construction spec

Derived from `art/references/char-reference-turnaround.png`. Every character builder
and critic works from this. It describes CONSTRUCTION, not costume — each character
keeps their own trade outfit.

## What the reference proves

One continuous figure. No element is a separate blob parked near the body. The five
detail insets exist specifically to sell contact: the face, the hand, the boot, the
pocket-and-strap stitching, and the satchel with its tool loop.

## Non-negotiables

**Continuity.** No open air at any joint. Shoulder, elbow, hip, knee and wrist are
transitions in one surface, not gaps between two primitives. A neck flows into a jaw.

**Garments wrap.** A garment is a surface offset from the body it sits on, following
its silhouette. It is never a box parked in front of a torso. Corners follow the body's
curve; a hem is a modelled edge that follows a curve; an apron lies flat on the chest.

**Everything attaches.** Every garment has a visible point of contact. A strap passes
over the shoulder and rests on it, deforming to it. An apron ties at the back. A satchel
strap crosses the torso and conforms to it. Nothing is held in place by coincidence of
position.

**Bands ring, they do not project.** A rolled cuff is a volumetric ring that circles the
arm. A collar circles the neck. A hat band circles the crown. None of these is a flat
two-sided wafer sticking sideways out of a sleeve, and none passes through the skull.

**Boots are built.** Sole plate, welt, heel block, toe cap, ankle opening. The leg enters
the boot at a modelled opening; it does not plunge into a mass.

**Hands are hands.** Palm continuous with the forearm, no wrist seam, thumb attached,
knuckles readable. Not three floating blocks.

**Faces are seated.** Eyes sit in sockets, not proud of the surface. Brows are on the
face, not floating slabs above it. Facial hair attaches to the jaw. Nothing occludes the
face at the front view — including the character's own hat brim.

**Detail is modelled, not noised.** Seams, hems, welts, pocket edges, stitch lines,
buckles. Random vertex displacement reads as damage, never as craft.

**Values separate.** Garment, trouser and boot hold distinct values in every view,
including the rear. No character collapses to one hue head to foot.

**Mesh hygiene.** No z-fighting slivers, no unsealed holes, no stray geometry, no
self-intersecting shells.

## Material story

Cloth garment + cream canvas + brown leather + brass hardware. Tokens only, from
`art/palettes/neva.palette.json`:

| role in the outfit | token |
|---|---|
| skin | `plaster_warm_01` |
| apron / canvas | `canvas_cream_01` |
| leather, boots, satchel | `wood_dark_01`, `leather_harness_01` |
| buckles, rivets, fittings | `metal_brass_01` |

The garment hue is what distinguishes the cast; the cream/leather/brass signature is
what unifies it.

| character | trade | garment hue |
|---|---|---|
| the player | coastal worker | `accent_teal_01` (the reference's own teal) |
| Elspeth | Village Baker & Garden Elder | `foliage_sage_01` |
| Barnaby | Homestead Handyman & Craftsman | `accent_ochre_01` |
| Old Silas | Harbor Salt & Master Angler | `water_mid_01` over `leather_harness_01` oilskin |
| Maeve | Fishmonger & Market Master | `accent_teal_01` |
| Tomas | Cove Boatkeeper | `water_mid_01` |
| Ines | Terrace Grower | `foliage_olive_01` |

## Budgets

`assets/specs/asset-catalog.json` owns them. Characters: 7,800 triangle target,
16,000 hard max (18,000 for the player), 7–8 materials. Spend geometry on silhouette,
contact and garment fit — not on density.

## The loop

```
node tools/blender/cli.mjs generate --asset <id>
node tools/gauntlet/capture-turnaround.mjs --assets <id> --out output/gauntlet/current
```
Then look at `output/gauntlet/current/<id>-SHEET.png` beside the reference.
