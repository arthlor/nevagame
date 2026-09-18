# W07 — Build the Waterfall and Connected Water Presentation

> Fragment of parent plan §11. Class: **P/T-bound**. Depends on: W04, W06.
> Exit gate: **G07** — the complete animated slice connects visibly and
> physically, compiles on tested render paths, preserves G06 safety evidence.

**Outcome:** A low-poly waterfall reads as water leaving a lip, falling,
impacting and draining — not a scrolling white rectangle.

## W07.1 — Separate surface ownership

Define ownership for upper channel, lip, falling sheet, impact pool and
outflow. Exclude unrelated horizontal/base/near water surfaces from the falling
segment and any area where they would overlap the wrong datum.

Use the W03 body/reach data. Do not teach the global ocean height sampler to
return a vertical sheet's Y or a rock overhang. Dedicated fall geometry is
presentation over explicit topology, not a new boat-support surface.

## W07.2 — Construct a shaped principal sheet

Build a directed, uneven sheet between authored lip and landing cross-sections;
its silhouette may bow or separate around rocks. Start with one principal water
body and limited supporting ribbons. Keep the source endpoints and landing area
visible enough to understand the connection.

Use generated dynamic geometry through the existing water path, and
catalog-backed rocks through the asset path. Do not export a unique one-off
rock GLB outside the catalog or put the animated water effect into a static
asset pipeline that cannot control its flow.

## W07.3 — Add the effect in this order

1. A readable main aqua water body with restrained light/dark variation.
2. Surface streaks moving from the actual lip toward the landing, using distance
   along the sheet, not world-Z scrolling.
3. Limited breakup/ribbons and edge detail.
4. Localized impact foam tied to the actual intersection with the pool.
5. Pool foam patches that spread and settle into downstream outflow.
6. Sparse pooled spray; add local mist only after the structure works without it.

Use the existing palette/material and render-config owners. Avoid permanently
white or emissive water; check dusk and night so foam remains readable without
glowing independently of the scene.

## W07.4 — Integrate the render passes correctly

- [ ] Prefer an opaque/mostly opaque principal form when it fits the approved
      art treatment; reserve alpha blending for edges, spray and mist.
- [ ] Define depth-test/write and draw-pass ownership per component. Do not
      solve every artifact with `renderOrder` or `DoubleSide`.
- [ ] Keep refraction capture free of self-feedback: a water pass must not
      sample an output target it is currently writing or capture the same water
      twice.
- [ ] Confirm color-space/tone-map and atmospheric integration occur once
      through the existing pipeline; do not stack a local exposure correction
      over an incorrectly converted shader.
- [ ] Verify steep-sheet normals from its geometry/local tangent frame, not the
      ocean's horizontal normal formula.
- [ ] Expand CPU-side bounding boxes/spheres to cover all shader-displaced
      geometry and particle extents. A zero-height source plane is not
      sufficient bounds for a raised fall.
- [ ] Test supported framebuffer/filtering paths and degraded optics without
      changing topology.

Three.js documents transparency-ordering limitations for
overlapping/intersecting transparent geometry. More transparent layers are not
a general fix for convincing water. [E02, E04]

## W07.5 — Make time and quality behaviour safe

Share appropriate presentation time/conditions at connected water handoffs;
avoid discontinuities when pausing, resuming, loading, changing quality or
moving the near patch. Preserve the existing distinction between simulated
waterline and visual bob/waves.

Reduced motion can reduce streak contrast, spray, mist drift and other purely
visual motion. It must not desynchronize the rendered low-frequency surface
from the CPU surface used for bobbing. Keep quality-independent physical
footprints and channel/support restrictions.

## W07.6 — Verify connectivity in stills and motion

Inspect above/below/side views of the lip, falling section, pool and outflow;
also use only the legal player camera and routes. Include entry/exit of the
near-water patch, far distances, transition to low quality, storm conditions
and dusk/night.

Use endpoint equality and rendered join tests separately: identical authored
endpoints do not prove that differently tessellated or shaded meshes meet
visibly. No gaps, z-fighting, duplicate horizontal planes, dark transparent
rectangles, upstream-moving streaks or pool edges floating above ground are
acceptable.

**G07 exit:** the complete animated slice connects visibly and physically,
compiles on tested render paths and preserves the G06 safety evidence.
**Rollback:** fall back to the simpler tested water presentation while keeping
the same candidate topology and safe support. Never remove the visible falling
body entirely while leaving an unexplained new gorge.
