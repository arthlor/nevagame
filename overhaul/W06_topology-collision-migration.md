# W06 — Integrate Topology, Collision and Save Migration Before Enabling It

> Fragment of parent plan §10. Class: **T**. Depends on: W05.
> Exit gate: **G06** — migrated saves validate and survive repeated
> play/reload; no unexplained relocation or protected-state drift; collision
> and support agree; experimental topology can be enabled for the candidate build.

**Outcome:** The redesigned source/drop/pool and path work for actual players,
mounts, boats, saves and interactions — not only the render camera.

## W06.1 — Allocate the content revision and migration deliberately

Read the current schema/layout constants, architecture §6.1, all relevant
historical migrations, retained fixtures, and production roadmap §25. Determine
whether the change needs a schema revision, layout revision, or both through
the repository's established chain.

Keep experimental visual flags separate from persisted topology identity. The
new topology must be selected by a compatible build/content revision, not by
the player's graphics setting or a runtime "waterfall off" toggle.

Historical migrations may reference current world samplers. Trace those imports
and test the entire supported chain against the candidate. Do not assume
changing a sampler affects only the newest migration. Do not rewrite old
migration results or expected fixtures simply to accept newly introduced
relocation. The existing `migrateTerrainLayout17.ts` is useful evidence of
support re-grounding, mount/player coupling, active-fishing origins and
collision-aware recovery — not a template to copy without tracing. [R14]

## W06.2 — Resolve terrain/support ownership

- [ ] Use the heightfield for continuous ground; use catalog-backed static rock
      geometry with simplified static collision for the lip and exceptional
      cliff shapes.
- [ ] Ensure the hidden heightfield does not fill a new visible gorge or
      protrude through a walkable mesh. Carve the support coherently or keep
      the overhang non-traversable.
- [ ] Keep one authoritative support answer for each traversal query. Where
      stacked support exists, use the actor's 3D context and the existing
      physics query path rather than selecting an arbitrary X/Z height.
- [ ] Avoid coincident terrain and rock colliders that produce jitter or
      contradictory contacts. Verify collision groups, static/kinematic
      interactions and camera-obstruction geometry.
- [ ] Preserve road crowns, shoulders, bridge entrances, pier stairs and
      terrain-grid triangle orientation. Reuse exact shared support geometry
      where already established.
- [ ] Validate ground slope, step height, clearance and reachable component
      using current controller tuning, not invented constants in rendering code.

Rapier distinguishes heightfield, triangle-mesh and other collider shapes;
heightfields describe an X/Z grid with one elevation per vertex. Triangle meshes
are appropriate for selected static shapes, while dynamic bodies should follow
the project's existing suitable hull/compound approach. Do not copy constructor
signatures from current documentation without verifying the locked Rapier
version. [E01]

## W06.3 — Build the affected-entity analysis

For each retained fixture, classify every persistent positional entity as
unchanged, re-ground-at-same-XZ, locally relocate, or unresolved. Include
players on foot, mounted players and their mount, active boats/passengers,
unmounted mounts, placed structures, dropped/carried cargo, farm objects and
any persisted fishing state.

Least-disruptive order:

1. Preserve the existing pose when still valid.
2. Preserve X/Z and recompute canonical support Y when only height changed.
3. Relocate within the same reachable land/water component and island,
   preserving access and associations.
4. Use an explicitly approved recovery anchor only when local recovery cannot work.
5. Block that candidate migration when no rule preserves the necessary state;
   do not silently delete, sell, discard, cancel or teleport to a different island.

Validation must include slope, clearance, collision, landing access, correct
region/ecology, boat hull clearance and applicable navigation restrictions —
not just `isWalkable(x,z)`.

## W06.4 — Preserve compound relationships and active actions

Move player/mount and boat/passenger relationships consistently. Preserve cargo
IDs, capacity assignments, attachments, freshness and ownership. Do not
duplicate a physical fish as an inventory item.

For active basic/sport fishing, preserve the action state, target/habitat,
line/origin geometry and deterministic progression where possible. Use an
existing documented cancellation/recovery policy only when it applies; otherwise
the fixture remains a blocker. Do not invent a refund or automatic success to
hide a relocation failure.

For farming, preserve plot IDs, crop growth, soil and recurrence/time
semantics. Do not resnap all farms globally because one upper river bank changed.

## W06.5 — Protect persistence transaction boundaries

Inspect `IndexedDbSaveRepository.ts` before changing storage behaviour. Migrate
an in-memory copy, validate it completely, and only then commit through the
existing primary/backup policy. A failed migration must preserve recoverable
original data and show a recoverable failure state, never a fresh empty world.

Test storage failures, an interrupted commit, backup load, repeated load, and a
newer-schema save presented to an older/incompatible reader. Use the existing
two-slot policy; external test exports do not become a third live save slot.

Test multiple tabs/writers using the current locking/version protections. A new
client's guard does not automatically prevent an already-running old client
from writing. Where legacy writers cannot be safely fenced, require an explicit
compatible-update/closure strategy before same-origin rollout; do not claim a
database-version bump alone solves old writer races.

## W06.6 — Run the migration/traversal matrix

- [ ] Migrate every retained supported revision through the full chain, not
      only the immediately previous one.
- [ ] Re-load an already migrated save: no duplicate relocation, lost state or
      repeated migration effects. Test the guarded migration entrypoint; only
      demand helper idempotence where its contract requires it.
- [ ] Perform save → reload → play → save → reload during on-foot, mounted,
      boat-driving, cargo-carrying, active basic fishing and active sport
      fishing scenarios.
- [ ] Confirm unaffected normalized gameplay fields and protected poses match
      the allowed-difference manifest.
- [ ] Traverse approach, lip-side path, pool route and downstream handoff in
      both directions, including camera obstruction and leaving/returning.
- [ ] Reject accidental boating/fishing through the fall or pool if excluded by
      the current gameplay contract.
- [ ] Test the whole preserved farm/bridge/pier/harbor loop after local terrain
      integration.

**G06 exit:** migrated saves validate and survive repeated play/reload; no
unexplained relocation or protected-state drift; collision and support agree;
experimental topology can be enabled for the candidate build.
**Rollback:** before any real migrated save is written, restore the old
candidate build/fixtures. After new saves exist, use a compatible forward fix
or a reviewed backward migration. Do not restore an older binary that cannot
read current saves. A visual feature flag cannot reverse topology safely.
