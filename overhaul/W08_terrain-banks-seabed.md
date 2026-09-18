# W08 — Finish Terrain, Riverbanks and Shallow Seabed in the Slice

> Fragment of parent plan §12. Class: **P/T**. Depends on: W07.
> Exit gate: **G08** — neutral/frozen/cover-off views and ordinary gameplay
> views pass; local geometry solves the contacts without excessive detail;
> topology deltas are accounted for.

**Outcome:** The landscape remains convincing with particles, grass and
decorative props disabled.

## W08.1 — Refine macro and middle-scale landforms

Preserve broad valley readability. Add only the necessary shoulders, saddles,
benches and exposed faces that explain the local watercourse and viewpoint.
Avoid increasing terrain resolution globally to solve a few near-bank contacts.

On continuous terrain, retain the shared support basis. On exceptional rocks,
use approved meshes with buried/interlocking joins. Keep cliff strata/planes
coherent within one rock family; do not turn every surface into random
high-frequency noise.

## W08.2 — Finish the contact sequence

In this order, inspect and repair:

```text
path crown → shoulder → surrounding ground
upper bank → lower damp bank → submerged bed
rock face → buried base → terrain
pool edge → depth transition → outflow
shore ground → wet band → shallow seabed
building/working pad → graded approach → route
```

Do not conceal seams with reeds, foam or rocks until geometry and material
weights agree. Wetness must not create floating shiny strips or a second
shoreline inconsistent with water membership.

## W08.3 — Use surface-specific geometry and normal treatment

Keep meadow/field planes calm; reserve sharper angular breaks for exposed
rock/cliffs. Resolve bank/shore contacts locally. Suppress dominant regular
triangle-grid shading on walkable ground while retaining deliberate silhouette
facets. Use the existing terrain/material authority, not an indiscriminate
`flatShading=true` rewrite. [R01, R04]

## W08.4 — Author distinctive river reaches

Within approved envelopes, finish a quiet pool/run, a shallow stony run, an
outside-bank treatment, an inside depositional shelf and the transition toward
the estuary. Use existing curvature/erosion/deposition fields rather than
re-scattering mirrored banks. Keep the bridge-lock region and existing fishing
access reserves protected. [R09]

Use subtle advected surface patterns for quiet flow and localized whitewater at
actual constrictions. All visual motion follows the reach coordinate. Do not
add riverbed obstructions that silently trap an active fish encounter or
invalidate a fishing-line path.

## W08.5 — Author shallow seabed shapes and reconcile depth use

Improve visible shelves, sand tongues, embedded rocks and small deeper pockets
only where the gameplay camera can read them. Keep bed geometry continuous with
shore ground.

Use actual bed depth for optics. For marine/gameplay consumers, retain the
existing proxy until a separately tested consumer switch is approved. A switch
to physical depth can change fish distribution, hazard gates, line dynamics or
boat constraints even without changing water membership. Do not bundle that
change with aesthetic seabed work.

The depth-map bake must remain downstream of the terrain/support owner; it must
not create a marine → terrain → marine cycle. Test that actual depth, signed
mask and baseline agree near the source, pool, banks and all modified shelves.

## W08.6 — Re-run the topology gate when necessary

Every collider, traversable slope, reach footprint or baseline change
introduced here must update the affected-envelope report and pass W06's checks
again. "Finishing pass" is not a save-safety exemption. Group compatible
unpublished edits into the candidate revision deliberately; never mutate a
revision already released to players.

**G08 exit:** neutral/frozen/cover-off views and ordinary gameplay views pass;
local geometry solves the contacts without excessive detail; topology deltas
are accounted for.
**Rollback:** retain finished materials only when compatible with the prior
tested geometry; otherwise restore the complete local terrain/maps/collision
bundle together.
