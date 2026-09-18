# W02 — Fix Water Classification and Coastal Access Without Moving Terrain

> Fragment of parent plan §6. Class: **B** (behaviour correction, unchanged
> topology). Depends on: W01.
> Exit gate: **G02** — D01/D03 pass with actual updated values; ocean/river
> visual transitions reviewed; no protected topology, economic state, IDs or
> save versions changed.

**Outcome:** Ocean looks/behaves like ocean around the whole island, and valid
shore fishing targets the water beside the player.

## W02.1 — Correct render-region membership

In `WaterSurface.ts`, restrict river influence to the actual river corridor and
finite source reach. Derive coastal/offshore weighting from the shared
island/marine representation rather than the southern `coastlineZ(x)` coordinate
alone. Blend river and sea only in the authored estuary overlap.

Preserve all existing water masks, coast geometry, river widths/elevations,
canonical `isSailable` behaviour and protected bridge/pier semantics in this
patch. Render wave class is not permission to change fishing ecology, fish
populations, progression gates or boat state.

## W02.2 — Keep wave contracts intact

- [ ] Preserve the numeric low-frequency wave owner and existing CPU/GPU
      parameter/time conventions.
- [ ] Assert regional weights are bounded and sum to one within numerical
      tolerance where evaluated.
- [ ] Validate river flow orientation against the reach tangent and coast wave
      orientation against local shore exposure.
- [ ] Compare CPU reference values, decoded profile textures and actual
      GPU-rendered samples. String presence in GLSL is useful linkage evidence
      but not proof a shader compiles or produces the correct surface.
- [ ] Test estuary transitions, source caps, patch seams, wind headings,
      roughness extremes and near/far handoffs.

## W02.3 — Generalize coastal fishing targets

Reuse the existing Sunreach nearest-water logic where valid, but do not assume
an approximate signed field has unit gradient everywhere. For each Neva coastal
candidate, find a nearby shore projection or a bounded search into water,
validate terrain support/slope, reach, clear casting segment, and target
habitat, then return the established response shape.

Preserve bridge, pier, river-access-reserve and interior priority. Verify both
positive and negative results. A path to water behind a wall or below an
inaccessible cliff is not valid access.

## W02.4 — Verify corrected behaviour through gameplay callers

Exercise basic fishing and sport-fishing approach/target selection from newly
recognized valid shore points; retain original river reserves, pier and tutorial
locations. Recheck saved active casts without changing their ecology or silently
cancelling them.

**G02 exit:** D01/D03 pass with actual updated values; ocean/river visual
transitions are reviewed; no protected topology, economic state, IDs or save
versions changed.
**Rollback:** revert the classification/access patch; re-run focused parity
tests. Reclassify as T and follow W06 first if any canonical
support/navigation change proves unavoidable.
