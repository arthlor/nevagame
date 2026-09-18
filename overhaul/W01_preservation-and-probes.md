# W01 — Lock Preservation Boundaries and Prove the Problems

> Fragment of parent plan §5. Class: diagnostic. Depends on: W00.
> Exit gate: **G01** — targeted failures reproducible, baseline preservation
> checks work, affected callers known, coverage gaps visible.

**Outcome:** Every later patch has a defined area in which it may change the
world and meaningful evidence outside that area that it did not.

## W01.1 — Inventory protected relationships

- [ ] Trace callers of water membership, water elevation, river profile, marine
      depth, shoreline distance, fishing access, terrain support, route
      projection, region/ecology, placement and migrations.
- [ ] Record bridge deck/approaches, pier/stairs/slips, boat moorings and launch
      lanes, farm plots, building pads/frontages, station interactions,
      NPC/quest anchors, interiors, mount routes and cargo pickup zones.
- [ ] Include map/chart rendering, layout-editor snapping, save recovery,
      rain/surface audio and vegetation exclusion consumers.
- [ ] Distinguish material-only "cliff" labels from collision or traversal
      restrictions. A steep-looking surface must not accidentally become a
      walkable field or vice versa.

## W01.2 — Add a compact protected-state fixture set

Capture normalized data from retained saves and procedural seeds. Protect stable
IDs, inventory quantities, gold, crop state, soil state, timers, quest progress,
knowledge/unlocks, cargo identities/ownership/slots/freshness, boat and mount
associations, world seed and RNG state.

For scenery-independent simulation replay, use identical seed, input sequence
and simulated time. Allow only explicitly approved access-result corrections or
migration paths. Do not compare against a save that has advanced offline time
and then mislabel ordinary progression as migration damage.

Maintain an explicit **allowed-difference manifest** for every change: field
paths, world envelope, reason, owner and supporting test. Compare all other
normalized state exactly, excluding only explicitly transient or timestamp
fields. Never permit a blanket `world.*` exemption.

## W01.3 — Create geographical probes

- [ ] Sample land, sea and shoreline on all four sides of both islands, the
      channel, river mouth, finite source cap, river edges, patch edges and
      protected structures.
- [ ] Include `(-220, -60)` for the audited render-classification finding;
      derive additional locations from current coast segments rather than
      assuming arbitrary coordinates are water.
- [ ] Add cases just inside/outside each boundary and corners where the nearest
      coast segment changes.
- [ ] Check NaN/Infinity, invalid weights, wrong direction signs, accidental
      river influence in remote sea and non-finite normals.
- [ ] Assert physical water exists independently of whether a bridge/pier allows
      traversal above it. Preserve existing public exceptions until their
      callers are explicitly migrated.

Extend existing files such as `tests/unit/worldLayout.test.ts`,
`headwaterWater.test.ts`, `waterSurfaceNormal.test.ts`,
`waterShaderLinkage.test.ts`, `harborCoast.test.ts`, `sunreachWorld.test.ts`,
and the preservation/composition tests. Verify file names on the implementation
checkout. New tests live beside the owning suite, not in a second test
framework. [R11–R13]

## W01.4 — Record an expected failure before a correction

For each D01–D03 reproduction, capture the old actual value, expected corrected
value, and owner path. Run the failing test on the baseline, then implement the
fix. Do not assert that every coastal point is fishable: steep cliffs,
structures, inaccessible footing and out-of-reach water must remain blocked.

**G01 exit:** targeted failures are reproducible, baseline preservation checks
work, affected callers are known, and coverage gaps are visible.
**Rollback:** diagnostic/test-only changes can be reverted independently; retain
evidence of the original failures.
