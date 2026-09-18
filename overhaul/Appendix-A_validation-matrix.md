# Appendix A — Required Regression and Acceptance Matrix

> Fragment of parent plan Appendix A. Scenario IDs are proposed evidence
> labels, not claims that corresponding tests already exist. Add coverage to
> existing suites/harnesses first.

| ID | Scenario | Required assertion/evidence | First gate |
|---|---|---|---|
| GEO-01 | Western sea probe `(-220, -60)` | Water membership and render-region classification agree with ocean location; no full river weight | G02 |
| GEO-02 | North/east/south/west on each island | Coast projection points toward local water; no global-axis misclassification | G02/G03 |
| GEO-03 | Dry points near river and island edges | No visible water sheet or flow influence leaks onto dry ground | G03/G04 |
| GEO-04 | River finite source cap and headwater bounds | River ends at source; no raised-water triangles outside owned footprint | G03/G07 |
| GEO-05 | Estuary overlap and lake school | Smooth presentation handoff; original ecology, habitat and quest IDs preserved | G02/G10 |
| GEO-06 | Shore corners, concavities and nearest-segment changes | Stable projected direction/ownership; bounded search succeeds or safely rejects | G03 |
| GEO-07 | All derived-map edges/texel centers | Consistent bounds/encoding; no unexpected clamp strip or mixed datum | G03 |
| GEO-08 | Flow angles near -π/+π and opposing influences | Interpolation yields intended direction, not a wraparound reversal or zero/NaN vector | G03 |
| GEO-09 | Signed proximity versus actual distance | Consumers do not assume blended field gradient length equals one | G03 |
| GEO-10 | Bed-depth consumer comparison | Optical depth uses actual support; gameplay proxy changes only where explicitly approved | G03/G08 |
| ACCESS-01 | Valid shore access on both islands | Stable footing, clear approach/cast, correct nearest target and habitat | G02 |
| ACCESS-02 | Cliff edge, obstructed cast, too-far shore | Correct rejection; no teleporting target to a distant coast | G02 |
| ACCESS-03 | Bridge deck/approach and pier/stairs/slips | Existing traversal, fishing, hull clearance and support remain correct | G02/G06 |
| ACCESS-04 | Existing river fishing reserves | Enough approach/cast clearance after vegetation and bank changes | G08/G09 |
| WATER-01 | CPU math vs decoded map vs GPU result | Separate error budgets; shader compiles and output is numerically/visually checked | G03/G07 |
| WATER-02 | Near patch crosses river/sea/fall boundaries | No disappearing surface, duplicate plane, sudden datum change or phase reset | G07 |
| WATER-03 | Lip → sheet → pool → outflow | Matching endpoints and actual rendered continuity through the full motion sequence | G07 |
| WATER-04 | Grazing angles and transparent overlap | No dark rectangles, incorrect sorting, doubled fog/color, or self-refraction | G07 |
| WATER-05 | All coast kinds and reference harbor | Intentional foam/contact coverage; reference-led harbor remains coherent | G04 |
| WATER-06 | Reduced motion, quality changes, pause/resume | Physical surface/membership unchanged; bobbing and rendered waves remain consistent | G07/G11 |
| TERRAIN-01 | Neutral material, cover/foam disabled | Large forms and contact geometry work without concealment | G05/G08 |
| TERRAIN-02 | Heightfield/mesh/road joins | Shared support agrees; no hidden ground in gorge, floating feet or collision jitter | G06/G08 |
| TERRAIN-03 | Render displacement/culling bounds | Fall and spray remain visible when near frustum edges or viewed from far away | G07 |
| SAVE-01 | All retained legacy fixtures | Full migration chain validates; only approved fields/poses differ | G06 |
| SAVE-02 | Already-current fixture reloaded repeatedly | No repeat migration effects, duplicate relocations, cargo duplication or drift | G06 |
| SAVE-03 | Mounted/on-foot/boat/cargo states | Stable relationships, clear pose, correct support and inventory/ownership preserved | G06 |
| SAVE-04 | Active basic/sport fishing | Resume/recovery follows approved rules; no silent catch, loss, cancellation or ecology switch | G06 |
| SAVE-05 | Storage failure, interrupted write, invalid candidate | Original/backup recoverable; no destructive fallback to new game | G06 |
| SAVE-06 | Older/newer client, newer save, multiple tabs | Incompatible writes cannot silently overwrite a migrated save; defined upgrade/recovery path | G06/G12 |
| WORLD-01 | Composition seeds 0–63 plus repeated seed | Existing full harness preserved; intentional local changes isolated and documented | G09/G10 |
| WORLD-02 | Farm → process → sail → fish → carry → sell | Full connected loop and save/reload remain functional | G10/G12 |
| PRESENT-01 | Approach/reveal/reverse gameplay camera | Landmark and route legible without forced rotation; no obstruction regression | G09 |
| AUDIO-01 | Listen; mute/suspend/leave/re-enter | Correct mix and locality; no duplicate/stuck loops or suspended-context failure | G09 |
| PERF-01 | Matched production scenes and target hardware | Existing budgets plus adopted frame goals; no DEV/production substitution | G11 |
| PERF-02 | Repeated visits, tier switches and aborted loads | Resources stabilize; no stale async attachment or disposal of live shared resources | G11 |
| BROWSER-01 | Chrome/Firefox/WebKit/actual Safari lanes | Required per-engine evidence and actual Safari distinction recorded | G11 |
| RELEASE-01 | Cached/missing assets and stale clients | Consistent code/catalog/maps/assets; compatible save/update behaviour | G12 |

## Error tolerances and thresholds

Do not copy numerical tolerances blindly across layers.

- **Unchanged topology:** require identical classification away from the
  declared numerical boundary band; log every sign difference and investigate
  whether it reflects a real footprint change.
- **Authored joins:** require the same endpoint data and datum. A very small
  CPU-coordinate comparison tolerance, such as `1e-5 m`, is a proposed
  numerical check for shared authored data — not a GPU precision claim.
- **Rendered joins:** evaluate actual geometry discretization, filtering,
  displacement and camera views. Preserve the existing headwater chord-error
  test's purpose; the inspected test uses a less-than-3 cm criterion for its
  sampled profile. Do not infer that all new waterfall geometry automatically
  meets it. [R11]
- **CPU/GPU waves:** establish separate tolerances for analytic math,
  encoded/interpolated maps and actual rendered coarse meshes. Test error
  across the entire supported roughness/wind/time range, not one favorable frame.
- **Traversal support:** derive tolerances from the current actor/controller
  and existing exact road/bridge/pier contracts. No threshold may permit
  visible floating or trapping merely because the test passes.
- **Visual diffs:** pin inputs/environment; require review of intentional
  changes. A looser global screenshot threshold is not an accepted fix.
- **Performance:** preserve machine-owned hard limits. Define target hardware,
  variability, adopted frame-time target and any permitted regression before
  profiling the candidate.

No later agent may relax a threshold solely to close a failed gate. Any
justified change needs the old/new limit, rationale, evidence and
owning-source update.
