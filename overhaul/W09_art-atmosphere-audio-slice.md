# W09 — Complete One Integrated Art, Atmosphere and Audio Slice

> Fragment of parent plan §13. Class: **P/T**. Depends on: W08.
> Exit gate: **G09** — a visually accepted and technically validated connected
> slice; remaining independent gates explicitly named. Expansion depending on
> visual approval stays blocked until that approval exists.

**Outcome:** The spring–fall–river journey has coherent assets, habitat, sound,
atmosphere and camera readability, and is ready to serve as the expansion
reference.

## W09.1 — Produce a small coherent asset kit

Inventory existing assets before adding any. Reuse or selectively adapt
suitable cliff/lip rocks, bank boulders, embedded fragments, one or two
relevant tree forms, understory/reeds and a small number of route details.

For each changed/new static asset, follow the actual `BLENDER.md` / CLI route:
catalog selection, scoped reference/brief where required, family-generator
parameters, generation/staging, validation, optimized publication, runtime
integration and Art Yard/game review. Do not call mass `generate_all`,
download a replacement asset, or publish a direct ad hoc export. [R01, R15]

Verify dimensions, unit scale, pivot, rotations, material/palette reuse,
collision proxies, LOD silhouette and resource budgets from their owning
catalog/configuration. New IDs are proposed only after catalog review; do not
treat this plan's descriptive asset names as existing IDs.

## W09.2 — Compose habitat groups, not uniform scatter

Extend `WorldCompositionField.ts` and `WorldEnvironmentLayout.ts` with local
masks/grouping that preserve stable seeded addresses and independent category
randomness. Use the existing route, architecture, fishing, opening and shore
clearances. [R12]

Compose a dominant group, supporting group and purposeful open area at the main
views. Put roots or understory where the bank supports them; keep exposed cliff
faces and working paths comparatively open. Use coherent variation within
groups rather than a different arbitrary scale/color at every instance.

Quality changes must select stable subsets or equivalent representations. They
must not reseed the world, move a collidable trunk, block a previously clear
route, remove the hero landmark, or alter a resource's availability.

## W09.3 — Add local waterfall/river sound through the audio owner

Read the full routed audio design (`06`) and actual runtime/manifest before
adding cues. Use licensed/provenanced assets or the existing procedural
mechanism as authorized. Do not introduce an external provider call implicitly.

Create a distance-shaped fall sound that becomes audible on approach, with a
local impact component and quieter downstream character. Reuse the existing
bus/mix/settings model. Use geometry-aware attenuation/occlusion only to the
extent supported or cheaply justified; do not create an expensive per-frame
raycast system for every decorative emitter.

Test actual listening, mute/volume settings, suspend/resume, entering
interiors, pause/modal states, repeated entry/exit, cancelled loading and
cleanup. No duplicate loops or waterfall sound continuing after its scene is
disposed. Audible changes require listening evidence; waveform inspection alone
is not approval. [R01, R04]

## W09.4 — Tune existing lighting and atmosphere

Keep one global color pipeline and lighting rig. Tune the shared configuration,
regional environmental inputs and local damp/mist parameters — not per-zone
tone mapping or exposure hacks.

Protect navigational contrast at midday, dusk, night and in storms. Keep mist
local enough to preserve the water's silhouette and route. Avoid heavy bloom,
depth of field, permanent white foam, photographic textures and microdetail
that conflicts with the approved coastal language.

## W09.5 — Extend existing camera framing gently

Use `ExplorationFraming.ts` and `GameCamera.ts`; preserve manual orbit/input
and task-state behaviour. Add local framing hints only when the default
gameplay view benefits, with bounded smoothing and respect for player control.
No involuntary rotation to force a reveal.

Check on-foot, mounted, boat-driving and fishing states; the waterfall should
not alter unrelated fishing camera or UI focus. Re-test occlusion and
tree/rock collisions on approach and return. [R16]

## W09.6 — Run the slice decision

Present matched gameplay-camera comparisons and short motion traversals.
Review:

- [ ] The river visibly comes from a source, passes over a lip and leaves the pool.
- [ ] The source, fall and river are recognizable at ordinary gameplay distances.
- [ ] Large and middle-scale forms carry the image; no noise or vegetation is concealing weak terrain.
- [ ] Ground, route, rock, bank and water contacts are coherent.
- [ ] The approach/reveal/return route is usable without forced camera behaviour.
- [ ] Sound, mist and movement reinforce the same place.
- [ ] All tiers preserve landmark and route identity.
- [ ] Save/traversal/performance gates apply to the exact reviewed input set.

Record human visual acceptance in the existing baseline decision registry and
status checklist, with its exact scope. Record technical and asset-certification
decisions separately. Never overwrite old expected screenshots to make an
unintended change pass. The agent's own critique is useful evidence, not a
substitute for required human approval. [R04]

**G09 exit:** a visually accepted and technically validated connected slice;
remaining independent gates explicitly named.
**Rollback:** restore the previously accepted local asset/configuration bundle.
Keep migrations and geography compatible; do not roll back topology through an
art flag.
