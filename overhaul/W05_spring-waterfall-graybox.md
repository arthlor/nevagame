# W05 — Graybox the Spring–Waterfall–River Journey

> Fragment of parent plan §9. Class: **candidate T**. Depends on: W01, W03.
> Exit gate: **G05** — graybox geometry, route and endpoint diagram reviewed;
> scoped human composition decision recorded where available. Numerical tests
> cannot self-award artistic approval. The agent may continue independent
> technical work while that visual sub-gate is pending, but must not
> mass-produce dependent assets.

**Outcome:** One connected place has a compelling silhouette, believable
source-to-sea geometry and usable routes before final art is produced.

## W05.1 — Define the local edit envelope

- [ ] Start from `NEVA_HEADWATERS`, `NEVA_SUMMITS`, the foothill trails and
      their actual runtime surroundings.
- [ ] Lock the finite source position, the downstream handoff around the
      existing `endZ`, and all unaffected bridge/farm/village/harbor support.
- [ ] Draw an explicit local geometry-change envelope and a surrounding
      continuity band in the diagnostic overlay.
- [ ] Sample the current terrain, actors, structures, paths and saved positions
      in that envelope before editing.
- [ ] Keep candidate geography fixture-only until G06. Do not enable autosave to
      a normal player save in the experimental graybox.

The source's 20 → 12 → 3 → 0 m profile provides an opportunity for a principal
fall near the first drop and smaller downstream cascades. An approximately 8 m
hero drop is a **prototype starting point**, not approved final geometry.
Preserve the source and downstream connection first; choose exact lip/landing
positions after viewing the terrain in play. [R10]

## W05.2 — Establish the spatial composition

Build, in order: source bowl, approach channel, uneven rock lip, main drop,
plunge pool, outflow, path, viewpoint and return route. Use simple candidate
geometry/materials, not final asset production.

Compose at least three gameplay views: approach with partial concealment;
oblique reveal of the main drop; close view showing where the pool drains.
Include the reverse walk. A ridge should frame the source without hiding all
navigational reference; a rock shoulder can conceal the fall before the reveal.
No forced camera rotation is required to make the scene work.

Judge the scene with foliage off and a neutral material override. Reject it
when the outline is a smooth mound behind a rectangle of water, the pool has no
outlet, the path has no believable footing, or the visual scale depends on a
free-camera angle players never use.

## W05.3 — Define the connected reach endpoints

Represent only the required headwater reaches and fall connection. Validate:

- [ ] Every upstream endpoint resolves to its intended downstream endpoint,
      with matching water level/cross-section or an explicit falling segment
      between them.
- [ ] Channel bed remains below its owned water surface where the channel is
      wet; dry shoulders remain dry.
- [ ] Pool water level is fixed by its outflow connection, not chosen
      independently for visual convenience.
- [ ] No unintended uphill open-channel segment is introduced; deliberate still
      pools are level and falls account for elevation discontinuities.
- [ ] Adjacent bank/bed envelopes do not self-intersect when the local
      centerline bends.
- [ ] Water has a finite source and a connected outlet. No branch graph,
      reservoir simulation or mass-conserving fluid solver is required.

Flow speed and visual width should be art-directed coherently; this does not
claim a physical discharge simulation. Do not introduce gameplay currents or
move boats because a decorative streak now flows faster.

## W05.4 — Keep the existing valley intact

Treat broad valley/mountain improvements as controlled shape edits, not world
reseeding. Use the existing landforms and protected working-ground masks. On
the first slice, change only the shoulders necessary to support the source,
lip, pool and reveal route.

A new cave or walk-behind passage is out of scope by default. An overhanging
rock can be visual geometry without opening a new navigable space. A genuinely
walkable overhang needs 3D support-aware traversal and W06 tests; never fake it
by raising the whole heightfield.

**G05 exit:** graybox geometry, route and endpoint diagram reviewed; scoped
human composition decision recorded where available.
**Rollback:** remove/revert the fixture-only candidate envelope and restore the
baseline maps; no production save should require reversal.
