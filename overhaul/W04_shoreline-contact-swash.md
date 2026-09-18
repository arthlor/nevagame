# W04 — Extend Shoreline Contact and Swash Around Both Islands

> Fragment of parent plan §8. Class: **P**. Depends on: W03.
> Exit gate: **G04** — all-side coverage overlay has an intentional owner,
> harbor comparisons acceptable, no doubled foam or dry-ground spill, reduced
> tiers preserve the same playable shore.

**Outcome:** Sand, rock shelves, cliffs and sheltered shores each have coherent
water contact without a uniform foam outline.

## W04.1 — Author a shore-treatment table

Classify existing shoreline sections using the shared shore projection, slope,
exposure and existing art inputs. Begin with sand, rock shelf, cliff toe and
sheltered landing/cove. Preserve the reference-led harbor treatment as a
protected comparison region. Do not overwrite it with averaged island-wide
settings. [R01, R08]

## W04.2 — Replace geographical special cases with shared coverage

Replace the remaining global-X/southern-coast effect placement where
appropriate with local shore coordinates and direction. Keep the proven
shader/material mechanism where it works. Enumerate which renderer owns contact
foam at every shore region.

Remove redundant legacy patches only after the replacement is verified in the
same region. Do not run full-strength patch foam and full-strength continuous
wash on top of one another. Maintain stable phase along connected shore
sections and deliberate transition zones; avoid arbitrary phase resets at
segment or island seams.

## W04.3 — Connect water, foam and dampness

Drive advancing wash, foam breakup and wet-sand presentation from the same
local event/phase where they represent the same wave. Use bounded persistent
dampness presentation; it must not become a new crop-moisture or
gameplay-flooding system.

Keep foam sparse in sheltered water, intermittent around rocks and concentrated
at actual turbulence. Do not place bright foam along every riverbank. Caustics
remain shallow-water, lighting-dependent detail rather than a universal
underwater pattern.

## W04.4 — Validate adverse conditions

Test grazing camera angles, storm and calm conditions, day/night, all quality
tiers, thin shore wedges, docks, boats/rocks intersecting the surface, map
bounds and the estuary. Where optical capture or filtering is unsupported,
provide the existing reduced optical path with equivalent coast identity and
physical membership.

**G04 exit:** all-side coverage overlay has an intentional owner, harbor
comparisons remain acceptable, no doubled foam or dry-ground spill, reduced
tiers preserve the same playable shore.
**Rollback:** disable only the new presentation treatment by a compatible
visual flag or revert the shader patch. Do not alter geography as a graphics
fallback.
