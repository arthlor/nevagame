# Neva Land — Lore & Gameplay Audit, and a Comprehensive Questline Plan

## Context

Neva Land is a finished no-combat cozy engine (~66.5k lines of TS in `src/`) with
a demo's worth of content bolted to it: `src/render` + `src/ui` ≈ 33.7k lines
against `src/content` ≈ 3.1k. Every one of the ten simulation domains is fully
implemented; nothing is a stub. The problem is not the engine.

The audit found three things worth planning around:

1. **The mid-game is a wall, not a game.** Authored content ends around hour 4.
   Act 7 then requires the skiff: **15,000 Fishing XP + 850 G**. At ~105 XP per
   lake trout, that is 80–150 sport landings, throttled by 3 catches per school,
   90+ minute school cooldowns, 5 spawn points total, and chum that costs a
   360-minute (15 real-minute) compost batch. That is **4–8 real hours repeating
   one loop with no new mechanic**. This — not the missing endgame — is the
   primary playability defect.
2. **The story stops into a null pointer.** After quest 18,
   `advanceToNextQuest` sets `activeActId = "epilogue_open"`,
   `activeQuestId = null` (`src/simulation/domains/QuestDomain.ts:467-497`), and
   `epilogue_open` has zero authored content.
3. **Half the map expansion is scenery.** Sunreach shipped — second island,
   4 regions, cove market, terrace farm, 2 NPCs, 3 fish, 2 crops, 5 Act 7 quests
   — but `region.sunreach_scrub`, `region.sunreach_ridge` and
   `chart.sunreach_reef` carry no gameplay verb, and Sunreach has exactly **one**
   sport species (`fish.amberjack`), so both of its school spawn points always
   roll the same fish.

`PLAN.md` (repo root, Sep 1) already audited and roadmapped this project. Its
Phase 0 (season pacing, shoulder seasons, crop reachability, sport-XP scaling)
and Phase 0.5 (CI) **are implemented and verified in code**. Its Phase 3.2 was
**overtaken**: the team shipped the Sunreach island, which PLAN.md explicitly
told them not to build yet (`PLAN.md:284`, `:342`). Per your direction this plan
**extends `PLAN.md` in place**.

Goal: repair the gaps, break the mid-game wall, and design a questline that takes
the game from ~3–4 hours of authored content (8–15 hours including grind) to
**20+ hours of directed play** — using the map expansion, and without breaking
the non-negotiables (no combat, no villain, no romance, simulation owns truth,
one owner per fact).

---

# Part 0 — Do this before anything else

**Six world modules that implement the entire map expansion are untracked in
git** (`??`): `src/world/SunreachWorld.ts`, `WorldIslands.ts`, `WorldMoorings.ts`,
`WorldGameplayLocations.ts`, `WorldCompositionField.ts`, `WorldCompositionAudit.ts`,
plus `tests/unit/sunreachWorld.test.ts` and eight Blender generators.
`WorldLayout.ts` already imports from all of them, so **`HEAD` does not typecheck
against the working tree**, and a stray `git clean` or a fresh clone loses the
expansion outright. The working tree carries ~415 changed paths.

Commit the expansion into reviewable commits before any of the work below starts.
`LLM/IMPLEMENTATION_STATUS_CHECKLIST.md` §7 item 11 already lists this as open.

---

# Part 1 — Audit

## 1.1 Content inventory (verified in `src/content/`, the count authority)

| Content | Count | Notes |
|---|---|---|
| Quests | **18** (42 objectives) | one linear chain; quest 10 alone holds 8 of the 42 |
| Acts | 7 authored + 1 empty (`epilogue_open`) | |
| NPCs | **6** | none is a vendor; markets are proximity triggers |
| Authored dialogue lines | **~87** total | 5 recognition entries across 6 NPCs |
| Knowledge (journal) entries | **3** | |
| Contract templates | **7** — only **2** active at once | `ContractDomain.ts:18` |
| Crops | 10 | no `seasons` field; climate + market factors only |
| Fish | 15 (12 Neva, **3** Sunreach) | 12 behaviour profiles |
| Items | 35 | `ItemCategory "tool"` exists; **zero** items use it |
| Recipes | 11 | 4 station types, 7 physical stations |
| Rods / Boats | 5 / 2 | |
| Markets | 3 (40 commodity entries) | |
| Farms | 3 (5 plantable rects) | |
| School spawn points | **5** | no river sport school |
| Proficiency ranks | 8 (0 → 100,000 XP) | |
| Persistence | schema **v28**, layout revision **10** | checklist still says v25 / rev 9 |

## 1.2 The structural gaps, in priority order

**G1 — The 15,000-XP skiff wall is the entire mid-game.** Hours ~4–12 are one
loop with no new verb, no alternate path, and a throughput ceiling set by school
cooldowns and compost timers. Everything downstream (Sunreach, Act 7, the whole
second island) sits behind it.

**G2 — Nothing takes over when the story stops.** Null `activeQuestId`, empty
tracker, and no goal that isn't "grind XP". The designed arc promises
`… → earned seamanship → open horizons` (`LLM/02` §0.1).

**G3 — The rank ladder is a promise the code does not keep.** The whole authored
chain awards **12,100 XP split across four skills**; thresholds run to 100,000
per skill. **25 of 27 `feature.*` rank unlock IDs have no consumer anywhere in
`src/`**. The two that are live (`feature.expedition_planner`,
`feature.irrigation_zone`) are granted by *quests*, not by rank. Ranks 5–7 unlock
nothing live except `rod.master`. `isProcessingRecipeUnlocked` is exported and
never called — dead code shaped like a live gate.

**G4 — Half the map expansion has no verb.** Scrub, ridge and the southern reef
are terrain + ambience + chart labels only. Sunreach's two school spawn points
share their single sport species. The terraces offer ~1,950 m² of plantable land
against **2** stocked seed types. On Neva, `farm.player_homestead` — a fully
defined private farm with an unused `leaseCost: 50` — is referenced by no quest,
no gate and no structure.

**G5 — The family/inheritance premise is three sentences.** `LLM/02` §0.1 says
the seed pouch, worn tools, homestead, family slip and final report "should form
a visible chain of memory". None of those objects exist. The hook the whole tone
rests on is unpaid.

**G6 — Repeatable content is thinner than the story.** 7 templates (3 gated at
3,000+ XP, 1 at 15,000), 2 active slots, and the `"bulk-order"` type declared in
both type unions and used by zero templates. `state.journal.fishRecords` already
persists `catchCount` / `largestWeightKg` / `bestQuality` / `firstCaughtMinute`
per species and **nothing reads it as a goal**.

## 1.3 Economy and system gaps that starve the loops

- **Crop quality does not affect produce price.** Quality is computed at harvest
  (climate 30 / moisture 25 / fertility 20 / proficiency 15 / RNG 10) and written
  to the journal; `calculateCommodityUnitPrice` is `base × demand × seasonal`
  only. Half the farming system has no economic sink — and farming is therefore
  not a viable parallel path up the XP climb.
- **Four intermediates have no market**: `item.basic_lure`, `item.fish_scraps`,
  `item.ground_grain`, `item.plant_matter`.
- **Farm lease/access is dead data** — `leaseCost`, `leaseDueMinute`,
  `accessType` are written at init and never read.
- **No cargo weight system** — slot count and cargo class only.
- **No crafting recipe picker** — `pickUnlockedStationRecipe` auto-selects the
  first affordable recipe for the station.
- **Work Capacity is a light pacer, not a budget** — the 1000 pool refills in
  ~12.5 real minutes.

## 1.4 Narrative and polish debt

- **`unlockedDialogueIds` is dead weight** — declared in `QuestState`,
  initialised, validated in `SaveSchema`, carried through migrations, never read
  or written anywhere in `src/` or `tests/`.
- **Tomas and Ines are half-built** — no `recognitionDialogue`, no row in the
  `LLM/02` §0.1 character-roles table, and no `NPC_STATION_BEATS` entry
  (`src/render/scene/npcStationBeat.ts:22-59` covers only the original four), so
  they stand perfectly still.
- **Sunreach ships three placeholder GLBs** — `prop_potting_bench_a` as the hand
  mill, `prop_farm_workbench_a` as *both* the workbench and the fish table
  (`WorldEnvironmentLayout.ts:1101-1135`).
- **`MAP_LABEL_OFFSETS` keys are stale** (`WorldMapModal.tsx:71-81`) — they still
  use `node_home_farm`-era ids while `MAP_NODES` uses `chart.*`, so **every**
  world-map label silently falls back to the default offset. The island
  silhouettes are hardcoded beziers while routes and nodes are data-driven.
- **Season pacing sets the outer bound.** `DEFAULT_MINUTES_PER_REAL_SECOND = 0.4`
  → 1 game day = **60 real minutes**; `DAYS_PER_SEASON = 6` → 1 season = **6 real
  hours**, 1 year = 24. Any season-gated *main-spine* quest is a 6–18 hour hard
  stop. This constrains the design directly (rule R3).
- Contextual onboarding (8 static hints + 1 dynamic) effectively ends at quest 10.
- `LLM/IMPLEMENTATION_STATUS_CHECKLIST.md` is drifting: it says 9 recipes (11),
  "8 crops and 12 fish" (10 and 15), schema v25 / rev 9 (v28 / rev 10), and story
  count 13 (18). Line 307 confirms the spine has **never** been walked
  end-to-end in a browser. P14's UI overhaul had **zero** verification run
  against it by explicit request.

---

# Part 2 — Design

## 2.1 Rules this plan obeys

- **R1 — No branching.** `LLM/02` §22 and `LLM/03` §33 defer branching dialogue,
  choices, relationship meters and transcripts. This adds **parallel linear
  tracks**, not branches: each track is its own `nextQuestId` chain activated by
  an explicit state predicate. No quest ever has two outcomes.
- **R2 — Person + Place + Action + Consequence** for every beat (`LLM/02` §0.1).
- **R3 — The main spine never gates on a season.** Seasonal conditions live on
  side tracks the player can leave open.
- **R4 — Unlocks are capabilities, locations, scale, automation or strategy** —
  never flat percentages (root `AGENTS.md`).
- **R5 — Simulation owns truth.** Every persisted field gets a schema bump,
  migration, historical fixture and migration test (`LLM/01` §6.1, `LLM/03` §25).
- **R6 — Content before systems.** Where a goal can be expressed with existing
  machinery (contract templates, `recognitionDialogue`, `fishRecords`,
  `minimumRodClass`), use it rather than adding state.

## 2.2 Breaking the mid-game wall (G1) — the balance changes

Adding 30 quests after the wall does not help a player standing at it. Four
changes, in order of value:

1. **Convert the skiff from an XP wall into a commission.** Today it is
   15,000 Fishing XP + 850 G bought at a mooring (`NavigationDomain.ts:450-500`).
   Make it Act 7's opening quest with a real contribution, exactly as the rowboat
   works today (30 G + 1 Ground Grain via `quest.act4_restore_rowboat`): money +
   cured goods + a Records milestone, at a materially lower XP floor (~6,000).
   This turns 4–8 hours of grind into a preparation goal that is on-theme
   ("earned, not bought") and keeps Silas's gatekeeper role intact.
2. **Give farming and trading real paths up.** Make **crop quality multiply
   produce price** (the deferred item in `LLM/02` §22) and give the four orphan
   intermediates a sell venue. Farming stops being a fishing subsidy and becomes
   a parallel route to the same goal.
3. **Raise fishing throughput where it is artificially scarce.** Add a **river
   sport school** (there is none) and **two more Sunreach sport species** so the
   island's two spawn points stop rolling the same fish. Both are content, not
   systems.
4. **Fill the climb with directed variety** — this is what `track.tides` below
   exists for. Six varied objectives across habitats, seasons, times and weather,
   each awarding the XP the player needs anyway.

## 2.3 The quest-track architecture (the enabling change)

**`src/simulation/core/QuestTypes.ts`**
```ts
export type QuestTrackId =
  | "track.main"
  | "track.homestead"     // The Family Ledger
  | "track.tides"         // Reading the Water
  | "track.tradelanes"    // Freight and Favour
  | "track.husbandry"     // Small Livestock
  | "track.festivals";    // The Turning Year

export interface QuestTrackProgress {
  activeQuestId: QuestId | null;
  activeStepIndex: number;
  stepProgress: Record<string, number>;
}

export interface QuestTrackDefinition {
  id: QuestTrackId;
  title: string;
  entryQuestId: QuestId;
  /** All predicates must hold before the entry quest activates. */
  unlock: {
    requiresCompletedQuestIds?: QuestId[];
    requiresFeatureIds?: string[];
    requiresKnowledgeIds?: string[];
    requiresRank?: { skill: SkillId; rankIndex: number };
  };
}
```
- `QuestDefinition` gains `trackId: QuestTrackId`.
- `QuestState` replaces `activeQuestId` / `activeStepIndex` / `stepProgress` with
  `tracks: Record<QuestTrackId, QuestTrackProgress>` plus `focusedTrackId`.
  `activeActId`, `completedQuestIds`, `unlockedFeatureIds`, `hintsShown` stay.
- **Delete `unlockedDialogueIds`** in the same migration — it has no reader.

**`src/simulation/domains/QuestDomain.ts`**
- `onObjectiveEvent` (`:210-261`) currently advances only the single active
  quest's `activeStepIndex`. **Fan it out over every active track**, applying the
  identical type / `targetId` / `location` match per track. One `CropHarvested`
  may legitimately advance the spine and a side track at once — that is the point.
- `talkToNpc` (`:264-335`) resolves: any track *ready to turn in* with this
  speaker → the focused track's `introDialogue` → `getMilestoneDialogue` →
  `idleDialogue`. Keeps `NPC_TALK_RADIUS = 3.5` as the proximity authority.
- New `evaluateTrackUnlocks(state)` after `QuestCompleted`, rank change, and
  knowledge/feature grants.
- `reconcileInactiveQuestChain` (`:28-45`) generalises per-track, preserving its
  "activate newly appended content without replaying rewards" contract.

**`src/content/ContentRegistry.ts:180-254`** — `validateQuestDefinitions` walks
one chain from `quest.act1_welcome` and throws `Unreachable main-story quests`
for anything off it. Change to walk **one chain per track** from each
`entryQuestId`; every quest must be reachable from its own track; cycles and
cross-track `nextQuestId` links are errors. This *increases* validator coverage.

**HUD/journal** — the world stays primary (`LLM/02` §17). The tracker shows the
focused track with a compact "+N threads" affordance; the journal Story folio
lists active tracks. One new `GameAction` (`quest.focus-track`) → `LLM/01` §9.

**Save impact: yes.** Schema **v28 → v29**: legacy cursor into
`tracks["track.main"]`, drop `unlockedDialogueIds`, default `focusedTrackId`.
New fixture beside the existing `tests/fixtures/save_v25_layout9.json` chain.

## 2.4 Track roster and content

### `track.main` — the spine, continued (18 → 31 quests)

**Act 8 — "The Dry Season"** (Sunreach interior; fills G4). Entry: complete
`quest.act7_land_sea_cycle`. Speakers: Ines, Tomas, **Perrin** (new).
1. *The Cistern Runs Low* — Perrin: read the dry wash, repair the terrace
   cistern. Unlocks Sunreach catchment irrigation. Uses the existing drainage
   model (`SunreachWorld.ts:139-181`) as the reason the place behaves this way.
2. *What the Scrub Keeps* — olives through their long cycle; the scrub's shade
   rows become a second plantable area. Starts giving the oversized terraces a
   reason to exist.
3. *The Windvane* — build the ridge lookout at `SUNREACH_ANCHORS.exposedRidge`.
   Consequence: standing on the ridge reveals active school positions from
   `state.world.activeSchools` (already persisted). This is where
   `feature.sonar_fish_finder` lands — as a **place**, not a passive stat.
4. *The Southern Shelf* — first amberjack from `chart.sunreach_reef`, using chum
   milled from Sunreach grain. Promotes the reef to a live sport ground and lands
   the two new Sunreach sport species from §2.2.
5. *Salt and Shade* — Perrin's curing practice: `recipe.salt_fish` and
   `recipe.smoke_fish` produce shelf-stable goods. **Removes the freshness clock
   from part of the catch** — a real strategy change (R4).
6. *A Route Worth Keeping* — run cured goods to Neva village under a bulk order.

**Act 9 — "The Charter"** (Neva endgame; picks up PLAN.md Phase 3.2). Speakers:
Silas, Maeve, Barnaby, **Rennick** (new — already exists as the anonymous
`Harbor Records Keeper` requester string on `contract.blue_marlin_trophy`).
1. *The Keeper of Records* — meet Rennick; the Records Board goes live.
2. *Beyond the Grounds* — buy `rod.offshore` via `purchase-upgrade`, an objective
   type with a complete implementation and **zero authored uses** today. A fourth
   `SCHOOL_SPAWN_POINTS` entry opens the **deep trench**, gated by the existing
   `minimumRodClass: "master"` machinery rather than a new flag.
3. *The Curing Shed* — Barnaby raises `struct.harbor_curing_shed`.
4. *A Standing Arrangement* — Maeve: a recurring buyer order. Grants
   `feature.standing_buyer_contracts`.
5. *The Long Fish* — Rennick: one exceptional blue marlin from the trench.
   `feature.legendary_marlin_encounters` lands here as a rare named instance.
6. *The Charter* — capstone, requiring a Records tier plus the marlin. Grants
   `feature.maritime_guild_charter`.

**Act 10 — "Open Horizons"** (1 quest, retires the `epilogue_open` void). A
closing round of reports that formally hands over the Records Board, standing
orders and the festival calendar. `activeActId` still ends at `epilogue_open` —
but now that state *means* something, because the repeatables are live.

### Side tracks (~25 quests, all linear)

| Track | Unlock | Shape | Pays off |
|---|---|---|---|
| **`track.tides` — Reading the Water** (6) | after `quest.act5_maiden_voyage` | pike in winter · sturgeon at dawn in fog · arowana in summer · catfish at night · swordfish in autumn · a full-habitat sweep | **G1 + R3.** This is the mid-game. Directed variety across the exact XP climb the skiff needs, with all season/weather gating safely off the spine. Zero new systems. |
| **`track.homestead` — The Family Ledger** (5) | after `quest.act2_harvest_and_compost` | seed pouch in the farmhouse → restore the worn tools → replant the family orchard at **`farm.player_homestead`** → repair the family slip → the last ledger page | **G5.** Activates the orphan second farm and gives `leaseCost` a reason. Pure content plus one farm-activation flag. |
| **`track.tradelanes` — Freight and Favour** (5) | after `quest.act6_harbor_promise` | first `"bulk-order"` contract → cross-island olive freight → ice logistics → cold storage → the standing-order network | Uses the dead `"bulk-order"` type; feeds Act 9. Quest-gated rather than rank-gated, because trading XP is revenue × 0.1 and rank 2 would mean 30,000 G of sales. |
| **`track.husbandry` — Small Livestock** (5) | farming rank 2 (3,000 XP — reachable) | coop and chickens (eggs) → the cow (milk → cheese) → beehive (honey → lures and preserves) → pasture rotation returning fertility to soil → Perrin's ridge goats | The largest new pillar. `fauna_chicken_a`, `fauna_cow_a`, `fauna_rabbit_a` and `prop_beehive_a` **already ship** as scenery. New sim state → migration v30. |
| **`track.festivals` — The Turning Year** (4) | after the first season turn | Spring Sowing Fair (village) → Summer Harbor Regatta → Autumn Catch Feast (Sunreach cove) → Winter Lantern Night (lighthouse) | Each becomes a **recurring calendar event** with its own demand curve and limited-window contract. The honest "come back tomorrow" hook `LLM/03` §32 permits. Migration v31. |

### Repeatables — the layer that outlives every chain

- **Records Board** — a milestone ladder that *reads* the already-persisted
  `state.journal.fishRecords` (plus crop and livestock records): species-complete
  per ecology, per-species weight thresholds, trophy grades. ~40 milestones, one
  content table + one presentation module in the existing Records folio,
  **zero new state**.
- **Contracts 7 → 24** — `ContractTemplateDefinition` is ten declarative fields,
  fully driven by `ContractDomain` and fully validated. Cover the species and
  crops Phase 0 made reachable, all three markets, and the `"bulk-order"` type.
  Ladder by `requiredXp`.
- **`MAX_ACTIVE_CONTRACTS = 2` → `contractSlotsForRank(rankIndex)`** (2 / 3 / 4).
  `refillContracts` already loops to capacity — a one-line substitution.
- **Standing orders** — recurring contracts with escalating quantity (Act 9).

### New NPCs (2, taking the roster to 8)

- **Rennick**, Harbor Records Keeper — Neva harbor. Records Board and charter.
- **Perrin**, Ridge Keeper — Sunreach ridge. Cistern, curing, goats, windvane.

Each needs a `char_npc_*_a.glb` through catalog → registered family generator →
`art:brief` → `art:generate`, an `NPC_STATION_BEATS` entry, and a row in the
`LLM/02` §0.1 character-roles table — **as do Tomas and Ines**, whose rows were
never written and who currently stand frozen.

## 2.5 Playtime accounting

| Layer | Added | Est. directed hours |
|---|---|---|
| Today (authored) | 18 quests | 3–4 (plus 4–8 h of wall) |
| §2.2 wall fixes + `track.tides` | replaces grind with content | mid-game becomes ~4–5 |
| Acts 8–10 | +13 main quests | +4–5 |
| `track.homestead` / `tradelanes` | +10 quests | +3–4 |
| Records Board + 24 contracts + standing orders | repeatable | +5–8 |
| Husbandry + festivals | ongoing loops | open-ended |

Target: **20+ hours** of non-grind content, reachable inside roughly one game
year (24 real hours at current pacing).

---

# Part 3 — Implementation phases

Each phase is independently shippable and ends with its own gate.

**Phase 0 — Commit the expansion.** Part 0 above. No code change.

**Phase A — Track engine + rank resolver.** *Save impact: yes (v29).*
`QuestTypes.ts`, `QuestDomain.ts`, `ContentRegistry.validateQuestDefinitions`,
`SaveSchema.ts`, `SaveMigrations.ts`, quest HUD/journal presentation. Add
`hasRankUnlock(xp, key, id)` to `src/content/progression.ts` on the existing
private `unlocksThroughRank` helper, and a single `isFeatureUnlocked(state, id)`
that ORs quest-granted and rank-granted unlocks — **rank capabilities never write
into `state.quests.unlockedFeatureIds`** (two owners, forced migration on every
rebalance). Triage the 27 orphan feature IDs per `PLAN.md` §2.2: delete the
flat-% ones, fold the duplicates, backfill emptied rank slots with `crop.*` /
`recipe.*` / `rod.*` IDs that already have live gating. Either call
`isProcessingRecipeUnlocked` or delete it. No new content.

**Phase B — Break the wall.** §2.2 in full: skiff commission quest, crop quality
→ produce price, sell venues for the four orphan intermediates, a river sport
school, two more Sunreach sport species. This is the phase that most changes how
the game plays.

**Phase C — Repeatables.** Records Board content table + journal folio;
contracts 7 → 24; `contractSlotsForRank`; `"bulk-order"` templates. Almost
entirely declarative against machinery that already exists.

**Phase D — `track.tides` + `track.homestead`.** Pure content on the Phase A
engine. Activates `farm.player_homestead`.

**Phase E — Act 8 "The Dry Season".** *Art.* Perrin, cistern, ridge windvane,
scrub plantable area, `chart.sunreach_reef` promoted to a live spawn point,
`recipe.salt_fish` / `recipe.smoke_fish`. **Replace the three Sunreach
placeholder GLBs** in the same phase.

**Phase F — Act 9 "The Charter" + Act 10.** *Art.* Rennick, harbor curing shed
(one new `StationType`, `"curing-shed"` — the only new station type in this
plan), deep-trench spawn point, legendary marlin instance, standing orders.

**Phase G — `track.tradelanes` + husbandry.** *Save impact: yes (v30). Art.*
Livestock as farm structures with a tend/feed verb reusing Work Capacity;
egg/milk/honey items and recipes. Reuses shipped fauna GLBs; needs coop, hutch
and pasture props.

**Phase H — Festivals.** *Save impact: yes (v31).* Calendar event state, four
festival days, per-festival demand curves and limited-window contracts.

**Phase I — NPC and journal depth.** Recognition entries 5 → ~40, keyed to the
new quests, knowledge IDs and feature unlocks. Add
`requiresRankIndex?: { skill; rankIndex }` to `NpcDefinition` (~10 lines plus one
validator line) so NPCs can react to proficiency. Knowledge entries 3 → ~20.
`NPC_STATION_BEATS` for Tomas, Ines, Rennick, Perrin.

**Phase J — Docs, checklist and polish carryover.** Part 4 below, plus the
`MAP_LABEL_OFFSETS` stale-key bug and the hardcoded island silhouettes in
`WorldMapModal.tsx`.

---

# Part 4 — Documents this change makes stale

Per root `AGENTS.md`, documentation is part of the change, not a follow-up.
Update the **owner only** — never copy a fact into a second file.

| Change | Update |
|---|---|
| `QuestState` shape, track cursors, dropped `unlockedDialogueIds` | `LLM/01` §5/§6 + the §6.1 migration ledger (v29/v30/v31 rows) |
| `quest.focus-track`, livestock tend action | `LLM/01` §9 |
| Story spine table, character roles (incl. the **missing Tomas/Ines rows**), dialogue contract, persistence boundary | `LLM/02` §0.1 |
| Contract counts, Records Board, standing orders, legendary fish | `LLM/02` §15 |
| Crop quality → price; skiff commission; new recipes/species | the owning `LLM/02` section; move each out of §22 Deferred as it ships |
| Content counts (crops, fish, recipes, quests, contracts, NPCs) | the owning `LLM/02` section, citing `src/content/` as the count authority |
| Branching deferral | **keep** it in `LLM/02` §22 — parallel tracks are not branches; say so explicitly |
| Phase gates and evidence | `LLM/03` §19/§33; `LLM/IMPLEMENTATION_STATUS_CHECKLIST.md` — and repair its existing drift (9→11 recipes, "8 crops and 12 fish"→10 and 15, v25/rev 9→v28/rev 10, story count 13→18) |
| New assets and the three placeholder replacements | the catalog entry + owning generator; **cite `generated/reports/asset_budget_report.json`**, never hand-copy counts |
| New audio cues | `LLM/06`, stating *specified* vs *wired* |
| Roadmap | **`PLAN.md`** — extend in place: mark Phase 0/0.5 delivered, record that Phase 3.2 was overtaken by the Sunreach expansion and that `:284`/`:342` ("never build a second island before the first is full") are now contradicted by shipped code, and fold Phases A–J in as its next phases |

---

# Part 5 — Verification

**Per phase**
- `npm run typecheck`, `npm run lint`, `npm run test`.
- Extend `tests/simulation/questContentValidation.test.ts` for per-track
  reachability, cross-track link rejection and cycle detection.
- New `tests/simulation/questTracks.test.ts` — one event advances every matching
  active track; a non-matching track does not advance; turn-in resolves to the
  right track; unlock predicates fire exactly at their threshold.
- New `tests/simulation/rankUnlocks.test.ts` — **every `feature.*` remaining in
  `PROFICIENCY_RANKS` has at least one consumer in `src/`**, and each flips at
  its threshold. Mirror the assertion inside
  `ContentRegistry.validateProgressionAndEquipment` so it fails at **startup**,
  not only in CI.
- Extend `tests/simulation/contentReachability.test.ts` — every new quest target,
  contract target and track entry has a source in the world.
- Phase B adds an economy check: crop quality changes produce price monotonically,
  and every item with a `baseValue` has at least one sell venue.

**Per migration (v29, v30, v31)** — `LLM/03` §25 protocol: schema bump, migration
function, a historical fixture beside the existing `tests/fixtures/save_v25_layout9.json`
chain, and a case in `tests/simulation/questPersistence.test.ts` proving a
completed pre-v29 save resumes on the right track **without replaying rewards**.

**Per world change** — re-run `npm run world:acceptance` and both 64-seed
composition audits (`tools/world/run-composition-audit-shard.ts`,
`run-sunreach-composition-audit-shard.ts`). Note that
`WorldEnvironmentLayout.ts:1046` and `:1707` **throw** if a seed cannot hit an
exact placement count, so any terrain edit in Phase E can fail world creation
outright.

**End to end**
- New `tests/e2e/act8DrySeason.spec.ts` and `tests/e2e/act9Charter.spec.ts`
  following `tests/e2e/p13Stewardship.spec.ts` (real UI actions, debug relocation
  to keep travel out of scope).
- `npm run test:e2e` and `npm run visual:test` before declaring any phase done.
- Close `LLM/IMPLEMENTATION_STATUS_CHECKLIST.md:307` — the story spine has never
  been walked end-to-end in a browser. Do it once the chain is 31 quests long and
  record it with the checklist's own evidence vocabulary.

**Human gameplay-camera review** for every art-bearing phase (E, F, G, H), per
root `AGENTS.md`. Art is not done until reviewed in the running game. Note that
P14's UI overhaul currently has **zero** verification behind it, so Phase A's HUD
work is the first chance to put evidence under that surface.

**The durable half of this plan is four guard tests** — per-track reachability,
content reachability, no-orphan feature IDs, and the startup assertion. They make
the defect classes that cost the most content permanently impossible.
