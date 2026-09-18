# Appendix B — Failure Modes and Stop Conditions

> Fragment of parent plan Appendix B.

| Failure mode | Preventive measure | Stop condition |
|---|---|---|
| Fixing a stale audit finding that no longer exists | Reproduce at the current SHA before patching | No reproduction: document and skip the correction |
| A shader change silently changes habitat or navigation | Separate physical/semantic water from render weights | Any unexplained gameplay output or save delta |
| A "distance" mask is not a true distance field | Declare metric/proximity contract; project against actual segments | Unbounded/incorrect target projection |
| New depth queries introduce recursion | Ordered evaluation graph; separate raw and derived queries | Circular sampling or order-dependent results |
| Angle-texture filtering reverses flow | Wrap-aware/vector encoding tests | Direction discontinuity or NaN |
| Adjacent meshes display different water levels | Shared body datums and surface ownership | Seam, duplicate plane, floating pool or wrong support |
| New rocks block old routes or fishing | Protected envelopes, collision and casting tests | Player/cargo/quest/boat access lost |
| Old migrations change because a sampler changed | Full retained-chain tests; history-aware import trace | Unapproved legacy fixture relocation/state drift |
| A new graphics setting changes world truth | Quality-independent topology/revision | Different membership, collider, ID or save result by tier |
| A migration overwrites recoverable data | Copy → migrate → validate → existing atomic save policy | Failed load/write destroys primary or backup |
| Old tabs overwrite newer saves | Verify actual legacy writer/update protection | Unsupported concurrent writer path remains |
| Warm screenshots hide load or motion bugs | Cold start, movement and lifecycle captures | Pop, load stall, shader/capture error or missing effect |
| Test aliases hide generated drift | CI check-before-regenerate sequence | Unexplained generated changes after checks/build |
| Art overrides become a parallel renderer | Use palette/config/material owners | Per-zone exposure, duplicate baseline or arbitrary color owner |
| Approvals are overstated | Separate exact-scope human, software and hardware evidence | Required gate missing on final input identity |

Do not abandon unrelated independent work because one decision is blocked.
Isolate the blocker, preserve the last compatible build, and continue only work
that does not assume the blocked decision has passed.
