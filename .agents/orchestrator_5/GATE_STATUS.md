# Gate Status — Milestone M2

## Gate — Iteration 1
| Agent | Role | Verdict | Source |
|-------|------|---------|--------|
| worker_m2 | teamwork_preview_worker | DONE (build passed, 84/84 tests pass) | handoff.md |
| reviewer_m2_1 | teamwork_preview_reviewer | APPROVE | handoff.md |
| reviewer_m2_2 | teamwork_preview_reviewer | APPROVE | handoff.md |
| challenger_m2_1 | teamwork_preview_challenger | REQUEST_CHANGES | handoff.md |
| challenger_m2_2 | teamwork_preview_challenger | APPROVE | handoff.md |
| auditor_m2 | teamwork_preview_auditor | INTEGRITY VIOLATION | handoff.md |

Gate Result: **FAIL** (auditor_m2 INTEGRITY VIOLATION: TypeScript compiler errors in workspace test files breaking `npm run typecheck` and canonical `npm run build`)

## Gate — Iteration 2 (empirical re-verification)
| Check | Command | Result |
|-------|---------|--------|
| Typecheck | `npx tsc --noEmit` | PASS (exit 0) |
| Canonical build | `npx tsc && npx vite build` | PASS (exit 0, 261 modules) |
| M2 + M1 HUD suites | `npx vitest run` over 8 HUD suites | PASS (158/158) |
| M2 inspectors suite | `tests/unit/mmo_inspectors_m2.test.ts` | PASS (35/35, +5 new alignment invariants) |

The Iteration 1 INTEGRITY VIOLATION (TS6133/TS6192/TS6196/TS2322/TS2353 in
`tests/unit/adversarial_m2_inspectors.test.ts`) no longer reproduces; both
`tsc --noEmit` and the canonical build exit 0.

### Chrome defects found by live-DOM inspection and fixed
1. `.hud-bottom-right-container` was missing from the `--ui-scale` list in
   `src/ui/a11y.css`, so the micro-menu/purse cluster rendered at `zoom: 1`
   while every other cluster rendered at `0.9` on any window below 1440x810,
   and its safe-area gutter sat at 14px against the others' 12.6px.
2. The top-right rail stacked three self-sized cards — almanac 330px, M2
   weather hazard banner 290px, quest tracker 300px — inside one 330px
   cluster, leaving a ragged right edge up to 40px wide. `.hud-top-right-main`
   now stretches and every card fills the rail.
3. `.micro-menu-rack` aligned a 42px system-menu disc and five 36px panels on
   their tops, leaving a 6px ragged bottom edge. The rack now centres.

Verified in the running dev server at 1280x720: all five rail elements share
one left edge (970.4) and one right edge (1267.4); every cluster reports
`zoom: 0.9` with matching 12.6px gutters; the six micro-menu buttons share a
common centre line.

Gate Result: **PASS** for the M2 UI scope.

### Out of scope, still failing
`tests/unit/empirical_m2_challenger_rigging.test.ts` (21 failures) asserts that
exported GLB animation clip durations match `assets/specs/asset-catalog.json`
(e.g. `char_npc_tomas_a/idle`: clip ends at 2.5s, catalog says 1.667s). This is
art-pipeline scope and touches no file owned by M2.

`createInitialGameState()` now takes 5–9s (measured; `buildWorldHudDto` 3ms,
`renderToString` 10ms alongside it), which times out the first test in
`tests/unit/hud_m1.test.ts` at its 30s budget. The cost is in the simulation
core, not in HUD presentation.

# Gate Status — Milestone M3 (Dual Fishing Minigames & Cockpits)

| Check | Command | Result |
|-------|---------|--------|
| Typecheck | `npx tsc --noEmit` | PASS (exit 0) |
| Build | `npx vite build` | PASS (exit 0) |
| M3 presentation suite | `tests/unit/mmo_fishing_m3.test.ts` | PASS (11/11) |
| M3 simulation suite | `tests/simulation/sportFishingTelemetry.test.ts` | PASS (7/7) |
| M1+M2+M3 HUD regression | 13 suites | PASS (219/219) |

## R4.2 — Sport Fishing Telemetry HUD
The encounter was already integrating range, depth and rod lay every step; none
of it reached the angler. `SportFishingHudDto.telemetry` now publishes:
`runDistanceMeters`, `landingDistanceMeters`, `runDistancePercent`,
`waterDepthMeters`, `rodDeflectionPercent`, `counterSwingPercent` and
`counterSwingCue`. Every value is a read of `FishingEncounter` state — no second
simulation, no smoothing of its own. `counterSwingPercent` reuses the same
`-rodDirection * fishDirection` expression the fight physics scores, so the
readout cannot drift from the mechanic.

The HUD renders a run gauge with the landing threshold marked, a depth/rod-lay
pair, and a counter-swing bar that carries the `[A]`/`[D]` cue.

## R4.1 — Basic Fishing Minigame
The cast meter previously showed Short/Medium/Long bands at 0.33/0.75, which
correspond to nothing the game rolls. The quality roll uses 0.50 and 0.85. Those
thresholds are now `BasicFishingMinigame.CAST_QUALITY_THRESHOLDS`, consumed by
both `determineQuality` and the meter, so the Good/Prime bands the player aims
at are the bands the roll reads. A dipping bobber with spreading rings was added
to the bite alert.

## Verification
- Telemetry asserted end-to-end against a live `FishingEncounter`: driving
  `distanceMeters`, `depthMeters`, `rodDirection` and `fishDirection` moves the
  readout, and `inspectSportFishingHud()` leaves encounter state byte-identical.
- Mutation-checked: flipping the counter-swing sign fails the suite.
- CSS verified in the running dev server by injecting the components' own SSR
  output — every new rule resolves (bands, gauges, `bobberDip`/`bobberRipple`).
- Full fishing HUD measures 276.8 x 299.1 px = 8.98% of a 1280x720 viewport.
  `GameUI` renders the persistent HUD only when `mode !== "sport-fishing"`, so
  the fight cockpit and the micro-menu never overlap and never sum.

## Out of scope, failing from concurrent work in the tree
`CURRENT_SCHEMA_VERSION` was bumped 29 -> 31 in the working tree while
`tests/simulation/limitsProbe.test.ts` still asserts 30. Several simulation
suites also fail on hook timeouts traceable to `createInitialGameState()` now
taking 5-9s. Both reproduce with all M3 code removed from the tree.

# Gate Status — Milestone M4 part 1 (Satchel: F6.1 controls, F6.4 inspect cards)

| Check | Command | Result |
|-------|---------|--------|
| Typecheck | `npx tsc --noEmit` | PASS (exit 0) |
| Build | `npx vite build` | PASS (exit 0) |
| M4 presentation suite | `tests/unit/mmo_satchel_m4.test.ts` | PASS (15/15) |
| M4 simulation suite | `tests/simulation/satchelSortAndInspect.test.ts` | PASS (13/13) |
| M2+M3+M4 regression | 14 suites | PASS (231/231) |

## R6.1 — Search & auto-sort
`inventory.sort-satchel` is a simulation command, not a view reorder: it merges
part-stacks up to each item's stack limit, orders by category then name then
quantity, and packs goods to the front. Item totals are conserved exactly — the
suite asserts totals before and after, that no stack exceeds its limit, that the
operation is idempotent, and that an over-full satchel is left untouched rather
than truncated.

Search is presentation-only and matches on item name, category label and the
crop a seed grows, so "wheat" finds both the seed and the grain. The predicate is
exported as `matchesSatchelSearch` and tested directly.

## R6.4 — Rich item inspect cards
New `ItemInspectionDto` + `buildItemInspectionDto`, surfaced through the existing
query/command pattern (`inventory.inspect-item`) and rendered by
`src/ui/components/ItemInspectCard.tsx` as a cursor-following card that flips
side rather than running off the viewport edge.

Rarity is taken from the only rank the content actually models — a species'
`rarityWeight` (encounter frequency). Ordinary goods return `rarity: null`
rather than a tier invented from price; the suite asserts that a scarce species
outranks a common one and that a plain seed stays unranked.

Freshness reads live `fishCargo` for a specimen actually in hand and names the
storage that sets its decay rate. Agronomy reads `CropDefinition` and resolves
from either the seed or the produce.

## Verification
- CSS confirmed in the running dev server by injecting the component's own SSR
  output: prized frame resolves gold, the caution freshness fill lands at 42% of
  the track, the stats block computes to `display: grid`.
- Card measures 248 x 157.5 px.

# Gate Status — Milestone M4 part 2 (F6.2 Companion Docking)

| Check | Command | Result |
|-------|---------|--------|
| Typecheck | `npx tsc --noEmit` | PASS (exit 0) |
| Build | `npx vite build` | PASS (exit 0) |
| Ledger transfer UI | `tests/unit/mmo_ledger_m4.test.ts` | PASS (6/6) |
| Transfer simulation | `tests/simulation/holdTransfer.test.ts` | PASS (8/8) |
| Demand outlook | `tests/unit/mmo_market_trend_m4.test.ts` | PASS (10/10) |
| M2+M3+M4 regression | 17 suites | PASS (255/255) |

## Hold & Stores was read-only
`LogisticsLedgerModal` displayed capacities and cargo but had no interaction at
all. `inventory.transfer` now moves a stack between the satchel and a vessel's
stores, atomically in both directions: goods are removed first, and if the
destination cannot take them they are put straight back, so a refused transfer
costs nothing and can never duplicate cargo. The suite asserts the combined
total across both stores is unchanged by every move, that an over-large request
moves only what is held, and that a full destination rolls back exactly.

`HoldStoresDto` gained `satchelStock` and per-vessel `stock` rows. The transfer
panel is a two-column grid — satchel beside vessel stores — which stacks to one
column below 1024px. Verified live: `295px 295px` at 1280 wide, single column
in a narrower pane.

## Market demand outlook
There is no stored price history in the simulation, so a literal trend graph
would have meant inventing state (and a save migration, while another session is
already moving the schema). Instead `market.demand-trend` samples the real
`demandFromSupply` across a window of days at the stall's current stock — the
same function the stall charges with, and deterministic over the seeded daily
trend. A test asserts every plotted point equals `demandFromSupply` evaluated
with identical inputs, so the plot cannot drift from the pricing model.

Because tomorrow's stock is unknowable, this is a projection, not a record. The
card says so on its face: "Next N days at today's stock (X of Y target)", and a
test pins that wording.

# Gate Status — Milestone M4 part 3 (F6.3 Physical Trade Packs) — M4 COMPLETE

| Check | Command | Result |
|-------|---------|--------|
| Typecheck | `npx tsc --noEmit` | PASS (exit 0) |
| Build | `npx vite build` | PASS (exit 0) |
| Trade pack simulation + physics | `tests/simulation/carriedTradePack.test.ts` | PASS (10/10) |
| Trade pack presentation | `tests/unit/mmo_tradepack_m4.test.ts` | PASS (6/6) |
| M2+M3+M4 regression | 20 suites incl. physicsWorld | PASS (301/301) |

## The HUD was promising a penalty the game did not apply
`buildStatusChips` has always pushed an "Overburdened" chip reading "Carrying
physical trade pack. Movement speed is reduced." The player speed resolved in
`PhysicsWorld.resolvePlayer` was
`(sprint ? sprintSpeed : walkSpeed) * gaitScale` — slope only. **No carry
penalty existed anywhere in the simulation.** The chip was describing a
mechanic that had never been implemented.

`CARRIED_LOAD_SPEED_SCALE` now lives beside the rest of the traversal tuning
(small 0.92, medium 0.84, large 0.72, gargantuan 0.60) and is applied to both
gaits; a mount carries the load instead of the player and is exempt. The chip
now quotes `carriedLoadPenaltyPercent` — the exact complement of the scale the
physics multiplies by — so the number on screen and the movement in the world
come from one table and cannot drift.

Verified end-to-end: walking 60 physics steps covers measurably less ground
while laden, and a gargantuan pack covers less than a small one. Mutation-
checked — removing `* loadScale` from `PhysicsWorld` fails both distance tests.

## Distinct treatment for physical cargo
`WorldHudCargoDto` gained `cargoClass` and `carrySpeedPenaltyPercent`. The
bottom-left carried-cargo note now renders as a physical pack — shoulder mark,
class-banded left border that warms from gold to amber to red as the load
climbs, and a `▼ N% speed` badge — so a pack on the back never reads like the
weightless stackable goods in the satchel.

## Milestone M4 complete
F6.1 satchel search and tidy, F6.2 companion docking and demand outlook,
F6.3 physical trade packs, F6.4 rich item inspect cards.

# Blocker clearance + Milestone M5 (in progress)

## Blocker 1 — save schema drift: FIXED
`limitsProbe` asserted the literal `30` while the tree had moved to 31. Pinning
a literal only re-breaks on the next bump, so the test now asserts that a v22
save migrates to `CURRENT_SCHEMA_VERSION`, whatever that is. A new guard walks
the whole ladder and fails naming any version that has no migration — a bump
without a migration silently strands old saves, which is the bug the literal was
standing in for. 9/9 passing.

## Blocker 2 — cold-start cost: DIAGNOSED, PARTIALLY FIXED
`createInitialGameState()` itself is ~2ms warm. The cost is one-time lazy world
generation, which vitest pays again in every worker:

| phase | cost |
|-------|------|
| terrain heightfields (384 + 256) | ~1.3s |
| road ribbon build + conform | ~1.5s |
| `attachSurfaceFieldAttributes` over road vertices | ~3.3s |

Two safe fixes landed:
1. `sampleTraversalRoadPlane` short-circuits on a route-index miss, so a query
   away from any road answers in 0ms instead of triggering the ribbon build.
   `tests/unit/roadTraversalShortCircuit.test.ts` pins the premise: no road
   vertex lies outside the 18m index padding (widest corridor 4.9m, widest
   junction 12m).
2. Collision and traversal now take `buildPathCollisionGeometry()`, which skips
   the per-vertex surface-field sampling only the renderer needs.
   `attachSurfaceFieldAttributes` provably only *adds* attributes, so the
   positions and indices those consumers read are unchanged.

Not fully cleared: `createInitialGameState` still samples near the harbour road
and so still triggers the ribbon build. Removing that needs the renderer's
surface-field pass moved off the shared template, which is a deeper change in a
subsystem under active edit. Measurement on this machine is also unreliable —
identical work timed between 4.8s and 12.7s under load.

## M5 — F8.1 pause menu recovery actions: DONE
`emergencyTow()` existed in the simulation and was reachable only by walking to
the boat, which is exactly what a stranded player cannot do. It is now a second
recovery action in the pause menu beside Safe Return, with a confirmation sheet
that keeps a refusal's reason on screen instead of dropping back to the menu.
6/6 passing.

## M5 — F8.3 Coastal Chronicle: DONE
There was no chronicle data model at all — only a CSS class name. Rather than
add saved state while the save schema is moving, the Chronicle is a retained
session view over the existing notice stream: `ChronicleLog` keeps what the
toast stack expires, categorised from the notice's structured delta (money =
trade, goods and labour = the working day) rather than by parsing wording, which
would reclassify on a copy edit. The bottom-left feed is collapsed by default,
carries the four filter tabs, and folds itself away after a quiet spell but
never while it is being read. 13/13 passing.

## Gate
Typecheck and `vite build` both exit 0 for every file in this scope; 152/152
across the 14 suites owned here.

# Cross-cutting — emoji removed from the interface

Standing instruction: no emoji anywhere in the UI; icons are quality SVG.

Emoji were spread across three layers, so the fix had to be structural rather
than a find-and-replace in components:

1. **Simulation DTOs carried glyphs.** `CompassMarkerDto.icon` and
   `HudStatusChipDto.icon` were typed `string` and held emoji, which put a
   presentation choice inside the simulation. Both are now the semantic union
   `HudIconId` ("pin", "anchor", "sprout", "pack", ...), matching the convention
   the contextual hotbar already used. The presentation layer maps the id to a
   mark via `HudIcon`, so the simulation no longer has an opinion about drawing.
2. **Content data carried glyphs.** `npcs.ts` `portraitIcon` held emoji; those
   are semantic names now too, rendered through the same mapper.
3. **Components carried glyphs.** Replaced across the unit frame crest, status
   chips, micro-menu, stance toolbar, quest tracker pins, planting belt, notice
   stack, maritime console hooks and ice badges, hint insignia, trade pack, and
   the catch modal's quality stars.

The packed atlas is generated from authored art, so subjects it does not carry
(pin, pack, anchor, landmark, sparkle, hook, snowflake, star, lock, map, waves)
are new inline SVG marks in `HudIcons.tsx`. They take `currentColor` and carry
no colour of their own, so each one picks up the tone of the chip or row holding
it. Verified live: 16x16, stroke resolves to the host's gold, baseline-aligned.

Where a glyph was decoration rather than an icon — the tick on a completed story
line, a ready contract — the state is carried by treatment (strike-through,
chip colour) instead of a replacement mark.

`tests/unit/no_emoji_in_ui.test.ts` scans `src/ui`, `src/app`, `src/content` and
`src/simulation/presentation` and fails naming file:line. Mutation-checked by
planting an emoji in the Chronicle: it was caught and reported.

Tests that pinned the old glyphs now assert the SVG structure instead
(`status-chip-icon`, `hud-svg-icon`, earned/unearned star counts).

Gate: typecheck 0, `vite build` 0, 284/284 across 19 UI suites.

# Milestone M5 — F7 folio & chart

| Check | Result |
|-------|--------|
| Typecheck / build | PASS (exit 0) |
| `tests/unit/mmo_almanac_m5.test.ts` | PASS (12/12) |
| `tests/unit/mmo_chart_schools_m5.test.ts` | PASS (10/10) |
| M2–M5 UI regression | PASS (134/134 across 10 suites) |

## F7.1 Coastal Almanac
The journal's "Records" page was a trophy shelf — it listed only what the player
had already caught. `AlmanacDto` now covers every species and crop the content
registry defines, so an undiscovered entry still shows its waters, season, run
hours, rod class and weight range: the almanac is a guide to the coast, not a
reward for finishing it. Personal counts stay withheld until the species has
actually been met, and the folio shows collection progress per strand.

Facts come from `ContentRegistry`, the same data the fishing and farming systems
run on, so the guide cannot drift from the game — a test asserts the entry's
weight range and market value are identical to the species definition. Rarity
reuses the `rarityForEncounterWeight` banding written for the item inspect card
rather than a second, divergent scale.

## F7.2 Live fishing schools on the chart
`state.world.activeSchools` already carried position, radius, expiry and frenzy
state; none of it reached the chart. Schools now render as dashed marks beneath
the player mark, nearest first, each carrying its remaining minutes, with a
feeding frenzy distinguished from an ordinary school. Expired schools are
dropped rather than drawn — sailing to a school that has already broken up is a
wasted trip. A header tally names the count and the nearest run.

## Deferred, with reason
Player-placed **waypoints** (F7.2) need state that survives a reload, which
means a save-schema field. The schema moved 29 -> 31 during this session under
another agent's work, so adding a migration now would be writing into a moving
target. Same reasoning as the market price history. The Chronicle precedent
shows a session-scoped version is possible if wanted, but a navigation mark that
silently vanishes on reload is arguably worse than none.

**F7.3** expedition sea-route map and a derived danger rating remain.

# Interface direction — RPG folio, not a dashboard

Standing direction from the user: the interface must feel like an RPG game, not
a web dashboard, and the cream parchment look is out.

## The interface was literally two design systems
`GameSheet` has two variants, `game-sheet--ink` (dark slate) and
`game-sheet--physical` (cream parchment), and the default was `physical`. HUD
components pass `family="ink"` explicitly; every modal that passed nothing got
paper by default. That, not a style decision, is why a slate HUD sat in front of
a cream folio. `modals.css` even opens by declaring itself the "slate & gold"
layer imported last to beat parchment, but `coastal.css` loads after it inside
the same cascade layer, so paper won regardless. The default is now `ink`.

## The first dark pass was still a dashboard
Flat cards, 1px hairlines, uppercase letter-spaced micro-labels over values, an
even six-column grid, pill tags, a plain form input. Rebuilt using the
ornamental vocabulary the project already ships and that the first pass ignored:
brass folio tabs with a lit active state, an engraved inset search slot, plates
with bevelled brass edges and inner shadow, a lit display-case well for the
species art, stamped plaques for rarity, and facts set as a printed index —
small-caps italic Crimson Pro labels joined to right-aligned values by dotted
leaders.

## Layout defects fixed
- Almanac labels broke mid-word (`SEA SON`, `RUN S`): the fact grid packed six
  132px columns with no `nowrap`. Now two wide measures; long season lists no
  longer overflow into the neighbouring column.
- Unrecorded entries were `opacity: 0.62`, which on the dark surface made the
  very entries that tell you where to fish unreadable. The portrait dims now;
  the text keeps full contrast.
- `Wor k 1000 / 1000` in the pause menu: meter labels now `nowrap`.
- Cast bar `-12 Work` chip collided with the timing readout: the header had
  `space-between` with no gap and no `min-width: 0`. Title truncates; chip and
  timing hold their width. Dropped the monospace face for the interface's own
  with tabular numerals.

## Chronicle was logging the wrong thing
It listed input guidance — "Planting cancelled", "Move closer to plant here" —
as if those were events, every line stamped `00:05` because `performance.now()`
was being formatted as a wall clock. It now logs only notices that moved goods,
labour, money or the story, stamped with the game-clock minute.

Gate: build 0, 142/142 across 11 suites.
