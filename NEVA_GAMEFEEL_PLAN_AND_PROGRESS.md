# Neva — Game-Feel Plan and Progress

**Status as of 12 Sep 2026: every item in the plan has landed on `main`.**
Phase 1 (Wayfinding) was built in this session and shipped in `82c1d62`.
Phases 2–5 shipped across `0e18dcc`, `9521d39`, `939dafb` and `82c1d62`.
This document was re-audited line by line against the code, not the commit
messages.

**Constraints:** no new Blender/GLB assets, no new quests. Code-built geometry,
re-placement of existing catalog props, material swaps and VFX were in scope.

---

## Part A — The diagnosis (why the game didn't feel like a game)

Neva already had a finished engine and real content: 44 quests across 4 tracks,
10 acts, 2 islands, 6 NPCs, a deeply tuned sport-fishing fight, and a 78-cue
audio graph. What it lacked was the connective tissue that makes systems read
as a world:

1. **The player couldn't see where to go.** All 44 quests carry a location, and
   the only thing drawn from it was a flat 0.75 m ring on the ground.
2. **The world was uninhabited.** The village had 16 buildings and **zero
   NPCs**. One music track played for the whole game while four authored themes
   sat unused, and most of the map shared a single wind loop.
3. **Time passed and nothing changed.** No seasonal colour, and no lit windows
   at night.
4. **The core loop had no juice.** Farming and trading had none of the feedback
   that sport fishing already had.
5. **Exploration was unrewarded, and the endgame was blank.** Four trails ended
   in nothing, and after Act 10 the tracker simply went empty.

---

## Part B — Status of every item

### Phase 1 — Wayfinding ✅ *(built this session)*

| # | Item | Where it lives |
|---|---|---|
| 1.1 | Quest markers on the compass, never distance-culled or truncated; a chart node on the same spot yields to the quest pin | `WorldHudPresentation.ts` → `buildCompassMarkers` |
| 1.2 | Real SVG icons on the compass ribbon instead of `◆`; new `IconQuest` gem | `NauticalCompassAlmanac.tsx`, `HudIcons.tsx` |
| 1.3 | Minimap quest pins; off-view targets clamp to a rim chevron | `WorldMinimap.tsx` |
| 1.4 | World-map quest layer with a dashed course line | `WorldMapModal.tsx` |
| 1.5 | World→screen projection and the edge/hanging quest pointer | `worldScreenProjection.ts`, `QuestPointerOverlay.ts` |
| 1.6 | 14 m additive beacon shaft that cross-fades with the ground ring on arrival | `WorldScene.ts` → `questBeaconRangeMix` |
| 1.7 | Distance chip in the quest tracker | `QuestTrackerHUD.tsx` |

Two bugs were fixed along the way:
- A target **behind the camera** used to project as if it were in front, so the
  arrow pointed the wrong way.
- The **map projection clamp** collapsed bearings at the frame edge.

### Phase 2 — World life ✅

| # | Item | Where it lives |
|---|---|---|
| 2.1 | NPC day schedules, all 6 NPCs, 12 phase slots. **One shared `npcAnchorAt` drives talking, quest targets and rendering**, and NPCs return to their role anchor when a turn-in is waiting. | `NpcPresentation.ts`, `content/npcs.ts` |
| 2.2 | World-space barks, preferring the highest-gated recognition line the player has earned | `buildNearbyNpcBarks`, `NpcBarkOverlay.ts` |
| 2.3 | Ambience layer gains come from the 10 authored region profiles | `WorldAudioPresentation.ts` |
| 2.4 | Music routing across region, time and activity, with a dwell-based hysteresis | `WorldMusicRouting`, `AudioManager.ts` |
| 2.5 | All six previously silent cues now play, plus a UI hover cue | `gameplayAudio.ts`, `uiAudio.ts` |
| 2.6 | Lit windows at night, staggered per building, via an emissive swap rather than lights | `WindowMaterial.ts` |
| 2.7 | Seasonal tint, continuous across the season boundary | `SeasonalTint.ts` |

### Phase 3 — Juice ✅

| # | Item | Where it lives |
|---|---|---|
| 3.1 | Floating world-space `+G` / item / XP / record text | `RewardFeedbackPresentation`, `WorldRewardOverlay.ts` |
| 3.2 | The hover ring animates (rotates) | `WorldScene.ts` |
| 3.3 | Harvest scale-punch on the crop at the commit marker | `CropInstanceRenderer.punchHarvest` |
| 3.4 | Camera trauma on records and act completion, plus a 3-frame hit-stop. **The hit-stop skips rendering only; the fixed 60 Hz simulation step keeps advancing**, as the plan required. | `GameApp.playRewardCameraBeat` |

### Phase 4 — Level design ✅

| # | Item | Where it lives |
|---|---|---|
| 4.1 | All four dead-end trails pay off: a discovery notice, a journal entry, and a physical arrival composition — bench, signpost and rock, or driftwood and a fire pit at the beach. **Verified by measuring the placements** at each endpoint. | `content/discoveries.ts`, `WorldEnvironmentLayout.ts` |
| 4.2 | Arrival framing on discovery reuses the `ART_VIEW_PRESETS`, and any input cancels it | `GameCamera.beginArrivalView` |
| 4.3 | Market-day dressing in the village (20 authored props) | `WorldEnvironmentLayout.ts` |
| 4.4 | Reeds up from ">10" to 55 along the river | pinned in `worldLayout.test.ts` |
| 4.5 | Background boats on fixed orbits across the channel | `ambientBoats.ts` |

### Phase 5 — Bookends ✅

| # | Item | Where it lives |
|---|---|---|
| 5.1 | Cold open: a new game holds on the `farm-mountains` framing, then eases down to the player | `OpeningCameraSequence.ts` |
| 5.2 | Hints grew from 8 to 16: storm, spoilage, open channel, stamina, market, contract, nightfall and rank-up | `buildNextWorldHint` |
| 5.3 | After the questline ends, the tracker shows the nearest 3 unearned Records Board milestones instead of going blank | `buildEndgameRecordTracker` |

---

## Part C — Verification (12 Sep)

- **Typecheck: clean across the whole project.** This includes
  `uiBugHunt.test.ts`, which failed to typecheck on 8 Sep.
- **Unit tests: 245 files, 2,102 tests, all passing** (`npx vitest run`,
  419 s). The `worldLayout.test.ts` grass-scale failure noted on 8 Sep is
  gone.
- **Tests covering the plan's risk points all exist and pass:**
  - quest markers and behind-camera projection: `questWayfinding.test.ts`
  - NPC anchor agreement between simulation and render: `npcSchedules.test.ts`
  - music dwell/hysteresis: `worldAudioPresentation.test.ts`
  - seasonal and window continuity: `seasonalPresentation.test.ts`
  - discoveries: `worldDiscoveries.test.ts`
  - hints and endgame tracker: `worldGuidance.test.ts`
  - opening camera: `openingCamera.test.ts`
  - reward feedback: `rewardFeedback.test.ts`
- **Not covered by tests:** three render-only pieces — the reward overlay DOM,
  the harvest punch, and the hit-stop hold.

---

## Part D — Loose ends

**Resolved since 8 Sep:**
- The Act 9 offshore rod now sits at **Expert (7,500 Fishing XP)** instead of
  Master (15,000). That removes the main-spine grind wall.

**Downgraded:**
- `step.act7_stow_bream`: the description reads *"Land a **second** Sea
  Bream"*, so the player is told the truth. Only the internal step id is
  misleading. Cosmetic.

**Still open, small:**
- The Western Beach and Northern Bluff discoveries have no arrival framing,
  because no preset exists for them.
- The Sunreach Reef Shelf discovery has no props within 12 m. It's a
  view-over-water point, so this is arguably correct.

**Needs your decision — two rotation bugs, currently unowned:**

Session neva-b5 found two real rotation sign bugs. Both need a layout-18 save
migration. **No session is doing that migration.** Scheduling it is your call.

- **`WorldEnvironmentLayout.rotatedOffset`** turns positions the wrong way when
  placing things around a building's footprint. Correcting it makes world
  generation throw on `authored.orchard.farmhouse`, so that building's pad, or
  the terrain under it, has to be re-authored first.
- **`WorldLayout.nevaWorkingGroundProtection`** has the same sign error in the
  other direction. Correcting it changes terrain at 436 of 25,767 sampled points
  around the buildings, by up to 2.56 m, and swaps one scattered placement.
- **After the fix, 13 of the 14 rotated buildings sit inside their footprints;**
  with the current math most corners fail. `village.cottage-south` fails either
  way, so its footprint looks too small.
- **Already fixed by neva-b5:** the same sign error in the rain-shelter check,
  which only affects visuals and needed no migration. Covered by
  `tests/unit/rainShelter.test.ts`.
