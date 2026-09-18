# W03 — Consolidate Geographical Contracts and Derived-Map Generation

> Fragment of parent plan §7. Class: **B/P**. Depends on: W02.
> Exit gate: **G03** — fields agree, no recursive sampling, old footprint
> intact, maps versioned/cached coherently, shader-path parity tested.

**Outcome:** Shore geometry, terrain/water depth, flow, rendering, access and
dressing consume a coherent, inspectable geographical model.

This is an incremental extraction, not permission to build a generic terrain
engine. Keep public `WorldLayout` compatibility methods. Prefer extending
existing interfaces before creating files.

## W03.1 — Establish the evaluation order

Logical data flow:

```text
authored coast loops + river stations/reaches + landforms + fixed anchors
    → basic projections/membership + authored water datums
    → natural ground / bed shaping
    → protected working pads + road/bridge/pier support
    → canonical support samples and local collision geometry
    → derived depth/material/flow/composition fields
    → baked runtime control maps and render geometry
    → presentation only: waves, foam, caustics, wet sheen, particles
```

Audit the actual import/call graph before moving any function. A routine
producing bed elevation must not call a marine routine that calls that same bed
routine. Split a lightweight raw shore/exposure query from a derived depth
query only where necessary. Add regression tests that repeatedly call the public
sampling functions in different orders and receive the same results.

## W03.2 — Define conventions once

Record in the owning architecture/art sections and types:

| Quantity | Required convention |
|---|---|
| Position | Existing world X/Z horizontal axes, Y up, meters |
| Sea datum | Preserve the current datum; no tide or global water-level change |
| Signed membership | Existing positive-water / negative-dry convention at the public interface |
| Distance | Identify exact nearest-boundary distance versus a blended signed proximity field; never silently treat them as interchangeable |
| River station | Distance along a directed reach, upstream to downstream |
| River lateral coordinate | Explicit local normal orientation and legacy left/right mapping |
| Shore normal | Validated direction toward water, not guessed from X/Z winding alone |
| Flow/current | Separate from wave travel direction and surface visual-noise motion |
| Water depth | Named physical water-column depth versus intentionally retained gameplay depth proxy |
| Surface ownership | Stable water body/reach ID and selected surface; falling sheets are not horizontal boat-support surfaces |
| Revision | Published layout/content identity and derived-map format/hash |

## W03.3 — Introduce only the data contracts consumers need

**Proposed shapes, not existing exports, not copy-paste replacements.** Reuse
repository types and narrow fields after tracing actual consumers. Avoid
embedding Three.js classes in new canonical data.

```text
ShoreProjection
  islandId, segmentId, boundaryPointXZ
  tangentXZ, waterwardNormalXZ
  signedDistanceMeters, distanceIsMetric
  shoreKind, exposure, shelter

RiverReachProjection
  reachId, stationMeters, nearestPointXZ
  tangentXZ, lateralMeters
  leftWidthMeters, rightWidthMeters
  baselineElevationMeters, bedElevationMeters
  upstream/downstream endpoint references

WaterColumnSample
  waterBodyId, baselineElevationMeters, bedElevationMeters
  depthMeters, flowDirectionXZ, localWetMembership
  supportKind: horizontal | graded | none

WaterfallDefinition
  stable id, upstreamReachId, downstreamReachId
  lip cross-section, landing cross-section, shaped sheet centerline3D
  pool footprint, exclusion envelope, local dampness envelope
  render/material preset reference, local sound reference
```

Use an explicit body ID or height-aware selector wherever multiple surfaces
share X/Z. Do not force a waterfall, undercut rock and lower pool into one
ambiguous `height(x,z)` answer. Current boat-support queries remain limited to
their supported horizontal/graded water surfaces.

## W03.4 — Preserve the current footprint during extraction

Compare old/new wet membership, terrain support, route projections,
bridge/pier values, fishing habitat, region/ecology and seeded composition
outside declared exceptions. Protect handoff values to the existing bridge and
lower river exactly within established floating-point tolerances.

Do not convert the entire river to an arc-length spline merely to improve a
shader. Introduce a local directed reach representation for the headwater
candidate only when W05 demonstrates the need; keep legacy wrappers elsewhere
until a measured or design requirement justifies migration.

## W03.5 — Generate consistent maps and caches

- [ ] Generate land/water, coast kind/exposure, baseline/bed depth and flow maps
      from the same input identity, with declared bounds, resolution, units,
      filter and channel encoding.
- [ ] Keep control maps as non-color data; preserve the linear color workflow
      for actual color. Custom shader output must join the existing conversion
      path exactly once. [E02]
- [ ] Test direction encodings across `-π/+π`. Linearly filtering encoded angles
      can interpolate through the wrong direction; choose decoded vectors with
      renormalization or another proven circular treatment when needed. Treat as
      a test risk, not an already proven Neva bug.
- [ ] Specify normalized sample coordinates and texel-center conventions once.
      Test both ends, corners, clamp behaviour, dry neighbors, island seams and
      mixed baselines near a fall.
- [ ] Do not average water levels or flow across unrelated water bodies at a
      mask boundary. Use sufficient padding, local geometry ownership or
      separate local maps where required.
- [ ] Key caches by relevant layout/content/seed/config/input identity. Do not
      key physical fields by visual quality tier.
- [ ] Prepare changed derived fields before use; publish them together rather
      than mixing old water maps with new terrain for a frame.
- [ ] Reuse the cooperative-task mechanism; move work to a worker or build-time
      bake only if measured latency warrants it. An aborted rebuild must not
      replace valid live resources or dispose resources still in use.

For CPU/GPU height checks, separate canonical math parity from
sampled-texture error and coarse-triangle chord error. Predeclare test
tolerances from the actual encoding/resolution; do not claim bit-exact identity
from a filtered byte map.

**G03 exit:** fields agree, no recursive sampling, old footprint remains
intact, maps are versioned/cached coherently and shader-path parity is tested.
**Rollback:** retain a tested compatibility path in the development branch; do
not ship multiple competing geography owners or mix map versions.
