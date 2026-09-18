# Farm & Fishing Browser Game — Gameplay Systems Implementation

> **Role:** Canonical gameplay, balance, formulas, narrative-mechanics, state contracts, and vertical-slice authority. Read with the architecture sections routed by root `AGENTS.md`. Exact live content IDs and copy remain owned by `src/content/`; this document defines their gameplay/lore contract and must not become a second content database or art-budget source.

Exact serialized types live in `src/simulation/core/types.ts` and content types
in `src/content/types.ts`; TypeScript blocks below explain relationships and are
not copyable schema definitions. Sections describe the current gameplay
contract unless labeled **design target** or **deferred**. A contract still
needs implementation and play evidence; `03` defines gates and the status
checklist records their results.

# 0. Gameplay Thesis & MVP Scope

This is one connected production economy and one connected story: **farming prepares fishing → fishing creates physical cargo → logistics determine realized value → profit unlocks operational capability**. The player's understanding of that chain is the first narrative progression. Decisions should trade immediate sale vs processing/preparation, extra catch vs freshness/weather/capacity, and market-value crops vs self-supply crops.

Do not expand content before the vertical-slice gate passes.

The playable scope combines crops/orchards, compost and irrigation, processing,
basic and sport fishing, finite boats/cargo, and local/regional markets.
Current membership, availability, requirements and counts belong to
`src/content/` through `ContentRegistry`; run `npm run content:validate` for
validated totals. Do not interpret the original milestone's smaller content
list as a cap on the existing game or permission to expand it.

# 0.1 Narrative, Lore & Quest Contract

## Player promise

The player inherits a quiet coastal homestead and gradually becomes part of
Neva Cove by learning the work that keeps the island connected. The story is
not about defeating an enemy or collecting lore for its own sake. It is about
turning neglected knowledge into a living practice: care for the soil, make
what the river and sea require, bring the catch home responsibly, and earn the
right to carry the family boat beyond the harbor.

The emotional progression is:

```text
arrival → welcome → stewardship → interdependence → local belonging
→ harbor responsibility → earned seamanship → open horizons
```

The tone is warm, salt-weathered, observant, and quietly hopeful. Thematic
anchors are stewardship, memory carried by objects and routines, reciprocity
between land and sea, earned belonging, and responsible abundance. Pressure
comes from weather, distance, freshness, finite capacity, timing, uncertain
knowledge, and preparation mistakes. Do not introduce combat, a villain,
romance, fixed protagonist identity, or a melodramatic crisis to manufacture
stakes.

## Narrative-mechanical rule

Every story beat must connect all four:

1. **Person:** someone with a practical role and a reason to care;
2. **Place:** a readable farm, path, bridge, market, harbor, boat slip, or
   fishing ground;
3. **Action:** a real player verb such as plant, water, process, fish, sail,
   carry, sell, or report;
4. **Consequence:** a changed capability, resource, relationship, knowledge
   state, or next decision.

Dialogue explains, frames, or reflects the action; it does not substitute for
the action. A player may close a dialogue and resume the objective without
losing progress. Reading a line alone must never advance a non-talk objective.
Conversely, the corresponding simulation event must be the authority for
mechanical quest progress, rewards, and unlocks.

## Live story spine

The main track is a stable `nextQuestId` chain. Its beats progress from inherited
soil and farm-to-sea preparation through earned seamanship, stewardship,
Sunreach's dry-soil/reef/return-trade decisions, the harbor charter and a closing
round. `src/content/quests.ts` owns exact quests, acts, copy, costs, rewards and
objectives; `src/content/questTracks.ts` owns chain membership and unlocks.

The closing round leads to `epilogue_open`. Contracts, records and side tracks
provide continuing goals. The main spine must not require a season-exclusive
species or an extreme long-tail tackle grind; those goals belong in optional
tracks or records so the next story beat remains attainable.

| Track | Narrative purpose | Gameplay constraint |
|---|---|---|
| Main spine | Turn inheritance into useful local practice and earned responsibility | Every beat advances a person/place/action/consequence connection; unlocks are earned through simulation events |
| The Cove Commons | Make the inherited family farm, shared tools and public orchard matter through use | Stewardship and long-growing orchard goals fit optional play and cannot block the main route |
| Freight and Favour | Let Maeve's promises teach volume, freshness, grade and distance | Target feasible contract types rather than depending on a specific randomly offered template |
| Reading the Water | Let Silas teach ecology through actual fishing | Species availability owns seasonal/hour/weather conditions; avoid a second narrative ecology system |

Each track advances linearly with its own cursor. Parallel tracks are not
branching outcomes. A milestone can invite another horizon without claiming
that every future island or system is already playable. Keep authored unlock
predicates and content reachability validated at registry startup.

## Character roles

| Character | Role in Neva Cove | What the player learns from them | Continuity rule |
|---|---|---|---|
| **Elspeth** | Village baker and garden elder; keeper of the homestead's welcome and food memory. | Soil, planting, moisture, and the first honest exchange. | She is the first social anchor and should recognize the player's growing competence without becoming a generic tutorial narrator. |
| **Barnaby** | Homestead handyman and craftsman; translator between raw harvest and useful equipment. | Compost, grain, workbench craft, and the farm-to-fishing connection. | His language is practical, tactile, and specific about materials and upkeep. |
| **Old Silas** | Harbor salt and master angler; keeper of the river lesson, family slip, and seamanship threshold. | Currents, fishing discipline, the rowboat, and the responsibility of returning with a catch. | He tests judgment and attention, not combat strength; the old boat is a relationship to maintain, not merely a reward flag. |
| **Maeve** | Fishmonger and market master; steward of cold storage, price, and fair exchange. | Freshness, demand, perishability, and the social cost of wasting a catch. | Her market language must make economy feel like local practice rather than an abstract spreadsheet. |

The player remains the connective tissue. Never assign a name, gender, voice,
occupation, or family trauma that the current player-facing design has not
chosen. The family history should be felt through the homestead, rowboat,
tools, routes, and other people's remembered practices before it is explained
in exposition.

## Dialogue and presentation contract

The live dialogue model has six contextual sources:

- `introDialogue`: the speaker's ask; it frames the next action.
- `completionDialogue`: delivered when the active quest's final objective is
  complete and the player talks to the correct speaker; the quest is completed
  atomically and rewards are granted by `QuestDomain`.
- `herald` (optional, `{ npcId, lines }`): someone other than the speaker who
  sets the errand up while the speaker is out of reach. Act 7's speaker lives
  across a channel the player has no boat for, so Silas explains the skiff and
  Tomas greets the player on arrival. A herald may not be its quest's speaker.
- objective `dialogue` (optional): what the target says when a `talk-npc` step
  aimed at someone *other* than the speaker is fulfilled — the Act 10 round of
  farewells. The registry rejects it on any other shape.
- NPC `idleDialogue`: place/role texture when nothing in play involves them.
- NPC `recognitionDialogue`: the latest content-authored entry whose completed
  quest, feature, knowledge and **proficiency-rank** predicates match; it
  recognizes milestones without relationship state, branches, or
  UI-owned history. `requiresRankIndex` lets an NPC react to proficiency, the
  one axis they were previously blind to. Every predicate is validated at
  startup, so an entry cannot silently reference something nothing grants and
  quietly retire itself.

**One conversation per talk.** `QuestDomain.talkToNpc` returns ordered
`ConversationSegment`s assembled in one atomic command, never saved:

1. every errand this person can close is closed (completion, rewards, any
   turn-in cost handed over, the next errand begun);
2. a `talk-npc` step aimed at this person is spoken and credited — on step 0
   the speaker's ask *is* the step; a later talk step to the speaker is a report
   back that the completion answers without replaying the ask; anyone else says
   the step's own `dialogue`;
3. an errand this conversation began is introduced by the same mouth (its
   speaker's ask, or the herald's word of it);
4. otherwise what they are waiting on or have heard of, main track first and at
   most two, so a side thread's ask is heard alongside the spine;
5. otherwise recognition or idle lines.

A talk step is credited only for the thread whose words were delivered;
`NpcTalked` is a signal for audio and telemetry and credits nothing. Crediting
every track from it closed the Cove Commons' "hear me out" step while the
player listened to a different errand, and let side-errand intros hijack the
Act 10 round. An errand with a `turnInCost` is never paid in the breath that
asked for it: the player leaves with the ask and chooses to come back. A
refused close (no room for the reward) completes nothing and says why under the
repeated ask. A talk to someone a running errand wants *later* emits
`QuestStepAhead`, as any action that would count for a later step does.

Nearby world barks consume the same recognition selector in `NpcPresentation`; they reuse authored lines without changing quests. An NPC with something pending for the player — an errand of theirs to close, or a talk step aimed at them — barks their authored `beckonLines` instead; a herald alone is not a reason, because it can stand for hours and a call repeated that long is nagging. The person just spoken to holds their barks for 30 seconds after a conversation. One projected bubble yields to panels and uses transient per-NPC cooldowns, with no saved dialogue history.

The talk command requires the authoritative proximity check against `npcAnchorAt(npcId, clock, quests)` in `src/simulation/presentation/NpcPresentation.ts`. Content in `npcs.ts` schedules day-phase stations; omitted phases retain the home anchor. The renderer, nearby targeting and quest talk/turn-in destinations use the same station, so a quest giver cannot be visible at one place while the tracker points at another. **One quest-aware exception:** while the NPC speaks for an active quest whose final objective is complete and was earned away from them (any type except `talk-npc`, which completes inside the conversation itself), the function returns the NPC's role anchor instead of the schedule stop. That holds Barnaby at the farmhouse workbench for the Act 2 hand-in he names while leaving him a Village Market figure the rest of the day. This derives from the existing clock and quest cursor, adds no saved NPC state, and never advances a track. Elspeth retains her daytime garden welcome; the other stops populate the village and both islands at their authored phases. `NpcTalked`,
`QuestStarted`, `QuestProgressed`, `QuestCompleted`, and `ActCompleted` are
signals for UI/audio/diagnostics; they are not a second narrative database.
The DOM dialogue overlay may show speaker name, role, district, line pages,
each segment's thread heading, what was handed over and the reward summary.
The HUD shows only the current title/objective (plus, for an acquisition step,
the requirement lines `ActiveQuestDto.requirements` publishes) and the journal
shows the current story entry, the ask as it was put (`ActiveQuestDto.brief`,
content-derived rather than a transcript) and completed quest titles. Keep the
world primary and avoid a permanent text-heavy quest dashboard.

The current representation uses content-owned string arrays and stable
knowledge-entry IDs. Do not add
branching, line-level save state, or local UI flags as a shortcut. If future
optional lore requires persistence, introduce stable content IDs and an
explicit unlock/discovery contract first. Retired fields and their migrations
are recorded only in `01` §6.1.

## Early-action credit ledger

`quests.earlyActionCredits` banks an action that matched no active objective so
a player who works ahead of the tutorial is credited when the step finally
activates. This exists because working ahead could genuinely strand a save:
watering during the sow step threw the event away, and `FarmingDomain.water`
refuses an already-wet crop, so the watering objective became unsatisfiable
until moisture decayed. The compost step was worse — starting stock is exactly
two runs of `recipe.compost_worms` and `item.compost_starter` is purchase-only.

Rules, owned by `QuestDomain`:

- **Opt-in.** Only an objective declaring `creditsEarlyActions: true` banks or
  redeems. `ContentRegistry` rejects the flag unless the type is one of
  `plant-crop`, `water-crop`, `harvest-crop`, `craft-recipe`, a `location` is
  declared, and the quest is on the main track. Those four types are the only
  ones dispatched outside `worldEvent()`; anything else fans one happening
  across several candidate locations and would bank duplicates.
- **One predicate.** Banking and redemption both run `objectiveAcceptsAction`,
  the same gate the live path uses. A shape the live path would reject is never
  banked, and a banked shape is one the live path would have accepted.
- **Bank only when nothing wanted it.** `onObjectiveEvent` banks only if no
  active track credited the event, so one action can never be counted twice.
- **Redeem after the clear.** `stepProgress` is wiped when the cursor advances;
  redemption runs strictly afterwards, or the credit lands in a discarded map.
- **Bounded.** Capped at the objective's `targetQuantity`, at
  `MAX_EARLY_ACTION_CREDIT_QUANTITY` (64) and `MAX_EARLY_ACTION_CREDIT_RECORDS`
  (16). `reconcileQuestCursors` prunes credits no remaining objective watches,
  so the ledger empties after the tutorial.
- **Said, not banked, elsewhere.** Outside those opted-in steps nothing is
  banked. An action that matches a *later* step of a running errand emits
  `QuestStepAhead` (once per errand per world event) so presentation can say
  what comes first instead of the work vanishing without a word.

A new game no longer starts with `item.bait_worms`: Act 2's compost run is the
player's first bait, and pre-granting a stack made that lesson skippable. The
starting satchel is 10 wheat, 6 tomato and 6 potato seeds, 2 compost starter
and 8 plant matter — exactly two runs of `recipe.compost_worms`.

## Background townsfolk

`src/render/scene/ambientTownsfolk.ts` adds three villagers around the village
market, the inn approach and the harbor apron. They are presentation only, and
the mechanism is deliberately structural rather than a set of opt-out flags:
they are absent from `ContentRegistry.npcs`, which is the single registry that
every interaction prompt, dialogue path, quest gate, world bark and telemetry
hook iterates. Their character models are `collision: "none"` and they live in
`environmentGroup` rather than `staticPrefabGroup`, so they carry no physics;
they are not tagged for the layout editor; and nothing about them is written to
a save. Their poses are pure functions of the clock, so two clients showing the
same minute show the same street.

Stations and drift radii were solved against the full keep-out set — market and
harbor-market radii, every building envelope, every workstation approach, the
farmhouse door and `HARBOR_DOCK.playerPosition` — and re-solved by
`tests/simulation/ambientTownsfolk.test.ts`, so moving one without re-checking
fails rather than quietly standing in a doorway.

## Onboarding pace

`ONBOARDING_PACE` (`src/simulation/core/OnboardingPace.ts`) is the single owner
of the opening tutorial's compressed clock, and holds until
`quest.act2_harvest_and_compost` is completed. Wheat in `farm.starter_garden`
grows at 5x (roughly 68-90 real seconds to mature rather than 7.5 real
minutes); `recipe.compost_worms` at `struct.starter_compost` takes 12 in-game
minutes rather than 360 (30 real seconds rather than 15 real minutes). No crop
or recipe is duplicated — the same content definitions are used with an
effective-duration calculation layered over them.

`effectiveRecipeDurationMinutes` is the sole owner of job duration.
`ProcessingDomain.start` and the interaction prompt both call it, so a quoted
duration and a scheduled one cannot disagree; presentation must never read
`recipe.durationMinutes` directly. Duration is captured into `completesAtMinute`
at start, so finishing the gating quest mid-job cannot stretch the wait.

The recipe pace additionally requires that no tutorial compost has run yet —
neither recorded on `step.act2_compost_worms` nor banked as a credit. Gating on
the quest alone would be an economy hole rather than a pacing choice: a player
who simply never turned Act 2 in could run a profitable 360-minute recipe every
30 real seconds. The crop gate needs no such tightening, since fertility drains
and seeds run out.

## Narrative persistence boundary

Dialogue page position, open/closed modal state, and the last spoken line are
transient. Save only the simulation truth needed to resume the story:
`activeActId`, `tracks` (one `{activeQuestId, activeStepIndex, stepProgress}`
cursor per quest track), `focusedTrackId`, `completedQuestIds`, `unlockedFeatureIds`,
`journal.unlockedKnowledge`, `earlyActionCredits`, and the currently implemented hint state. Save/load must preserve the quest chain and
capability/knowledge unlocks without replaying rewards or requiring a
conversation page to be serialized. Appending quests to an existing track needs no schema
bump because these fields store stable string IDs; adding a *track* is a
schema change requiring the `01` §6.1 protocol. On load, an inactive
older save that completed Quest 10 follows its now-authored `nextQuestId` once,
without replaying Quest 10 rewards. Any new story state shape still requires
the schema, migration, historical fixture, and migration-test protocol from
`01`.

## Narrative change protocol

Treat lore changes as product changes with an explicit ownership and evidence
path:

1. **Copy or role clarification:** edit the owning content definition, keep
   stable quest/NPC/objective/unlock IDs, and check tone, player projection,
   and the person/place/action/consequence rule. This has no save impact when
   the state contract is unchanged.
2. **New objective, reward, speaker, or location predicate:** update the
   content type, `QuestDomain` event/predicate owner, canonical world anchor,
   and focused simulation tests together. A decorative prop or a line of text
   cannot be the only authority for completion.
3. **New discovery, relationship, branch, or remembered conversation:** stop
   and model the state explicitly before writing content. Define stable IDs,
   unlock predicates, save impact, schema/migration/fixture coverage, reload
   behavior, and a return path. Do not smuggle persistent lore into UI flags,
   array positions, analytics, or DOM history.
4. **Environmental or character expression:** update the owning `04` zone or
   asset brief and the existing catalog/layout/runtime integration when the
   visual cue changes. Review it from the gameplay camera; it may support the
   story but cannot silently create a new quest condition or imply deferred
   content is playable.
5. **Acceptance:** use `03` §4 for the affected contract. Changed progression
   needs domain/reload coverage and its affected browser narrative route; copy
   alone does not require replaying all P12. Keep
   simulation payload evidence, modal/UI evidence, human gameplay-camera
   evidence, and release evidence as separate claims.

## Narrative improvement criteria

Apply these criteria when revising the existing story or proposing further content; this is not a list of unimplemented systems:

1. **Pay off the family throughline:** seed pouch, inherited farmhouse and
   starter field, worn tools, family slip, the public commons and the final
   report should form a visible chain of memory; add only clues that the player
   can encounter in the existing world.
2. **Extend the live milestone recognition sparingly:** the content-owned NPC roster
   can recognize completed quests, feature unlocks, and knowledge IDs. Add only
   lines that reflect a real state change; never infer state from UI history.
3. **Extend the live journal selectively:** use the content-owned knowledge registry. Add people/place/practice entries only after
   witnessed events, while keeping formulas and quest authority in simulation.
4. **Add environmental storytelling:** use worn routes, repaired objects,
   market tools, boat marks, and readable work clusters as optional evidence;
   never gate a required objective on noticing a decorative prop.
5. **Introduce agency only when it has a real consequence:** a small tradeoff
   around timing, preparation, or who benefits is preferable to cosmetic
   dialogue branches. A branch requires explicit state ownership, save rules,
   tests, and a return path; otherwise keep the authored chain linear.
6. **Playtest comprehension:** players should be able to explain why farming
   matters to fishing, what freshness changes, why Silas withholds the boat,
   and how Maeve's market differs from the village stall without reading code.

# 1. Item, Farm & Crop Contracts

```ts
type ItemCategory =
  | "seed" | "produce" | "grain" | "bait" | "fishing-supply"
  | "crafting-material" | "tool" | "fuel" | "ice" | "fertilizer"
  | "processed-food" | "misc";
```
Large sport fish are **not items**.

```ts
interface FarmState {
  id: FarmId;
  regionId: RegionId;
  widthMeters: number;
  depthMeters: number;
  climateId: ClimateId;
  soil: SoilState;
  placedCropIds: PlacedCropId[];
  placedStructureIds: StructureId[];
  leaseCost: number;
  leaseDueMinute: GameMinute;
  accessType: "public" | "private";
}

interface CropDefinition {
  id: CropId;
  name: string;
  seedItemId: ItemId;
  harvestItemId: ItemId;
  footprint: { width: number; depth: number };
  baseGrowthMinutes: number;
  preferredClimates: ClimateId[];
  /** Optional climates that are neither preferred nor poor (modifier 1.00). Potato/corn treat temperate as neutral. */
  neutralClimates?: ClimateId[];
  baseYield: { min: number; max: number };
  waterNeed: number;
  fertilityCost: number;
  regrows: boolean;
  regrowMinutes?: number;
  minimumFarmingXp: number;
  tags: string[];
}

type CropStage = "seeded" | "sprout" | "growing" | "mature" | "overripe" | "withered";

interface PlacedCropState {
  id: PlacedCropId;
  cropId: CropId;
  farmId: FarmId;
  x: number;
  z: number;
  rotationRadians: number;
  plantedAtMinute: GameMinute;
  lastUpdatedMinute: GameMinute;
  effectiveGrowthMinutes: number;
  moisture: number;
  health: number;
  stage: CropStage;
  averageMoistureAccum: number;
  qualityInputsAccum: CropQualityInputs;
}
```
The family farmhouse and starter field are inherited at new-game start. The
public `farm.player_homestead` is the Village Commons: it has three concurrent
crop slots, represented by `cropCapacity` in `WORLD_FARM_DEFINITIONS` and
enforced by `FarmingDomain.validatePlacement`. The authored scene presents
those slots as three clearings inside two cultivated beds; mature crops around
the clearings are renderer-only dressing and never become harvestable crop
records. Harvesting an annual crop frees its slot; a regrowing tree continues
to occupy one. The market courtyard has no plantable farm surface.

All crop tuning belongs in definitions or centralized config.

# 2. Crop Placement, Growth, Quality & Harvest

Placement MUST validate: inside permitted farm; no overlap; valid surface; enough footprint; seed available; crop unlocked; no structure-clearance conflict. Simulation footprints—not mesh bounds—are authoritative. Crop rotation is derived deterministically from world seed, farm/crop identity, and quantized placement position; overlap uses oriented crop footprints, not a circular render approximation. Structure anchors and clearance remain simulation/world data.

Growth:
```text
effectiveGrowthDelta = elapsedGameMinutes
  × climateModifier × moistureModifier × fertilityModifier × weatherModifier

climate:    preferred 1.20 | neutral 1.00 | poor 0.80
moisture:   healthy   1.00 | dry     0.85 | very dry 0.60
fertility:  excellent 1.10 | normal  1.00 | poor     0.80
weather:    light-rain 1.05 | heavy-rain 1.05 | storm 1.05 | other 1.00
total clamp: 0.50x–1.50x
(No drought weather type is live.)
```
`ONBOARDING_PACE` owns a separate pacing scalar applied to the result *after*
the 0.50x-1.50x clamp. It is deliberately outside the clamp: those bounds say
how far the environment may help or hurt a crop, and folding a pacing
multiplier into them would silently reduce the tutorial's 5x to about 1.14x.
`FarmingDomain.tick`, `FarmingDomain.inspect` and the offline catch-up all pass
the same scalar, so the displayed countdown matches what the tick delivers.

`CROP_GROWTH_MODIFIERS` (`src/simulation/farming/calculateCropGrowth.ts`) owns
these values and the moisture/fertility thresholds that select between them;
the table above is held to it by `tests/unit/docTuningValues.test.ts`. It is
repeated here because it explains the model, not because this document decides
it — the values used to live as bare literals behind a comment pointing back at
this section, which left neither side owning them.

`sampleFarmEnvironment(farm, weather, local)` is the pure owner for the local
climate inputs consumed by crop growth and cargo freshness. It combines the
weather snapshot with the registered island climate, exposure, drainage,
effective precipitation, and evaporation multiplier. Realtime and segmented
offline progression call the same sampler; neither path may substitute a
farm-wide climate shortcut. Sunreach is warm and dry, with terrace retention
`0.45`; the exposed ridge is hotter/drier than the sheltered cove, while the
seasonal wash increases local moisture potential without becoming a river.

Time-to-mature still uses the climate/moisture/fertility/weather product (clamped 0.50x–1.50x). After a crop reaches mature, the harvest and wither windows accumulate **calendar minutes 1:1** and do **not** use that speed-up. Better climate therefore shortens time-to-mature without shrinking the harvest window.

Default stages:
```text
0.00–0.10 of baseGrowthMinutes     seeded
0.10–0.35 of baseGrowthMinutes     sprout
0.35–1.00 of baseGrowthMinutes     growing
mature + 0–12h calendar            mature
mature + 12–24h calendar           overripe
mature + >24h calendar             withered (annuals only)
```
`regrows` orchard trees skip wither-from-growth. A withered plot (annual, or a legacy withered tree) can be cleared with no harvest XP or produce. Wheat planted in the morning on starter soil remains harvestable after several hours of fishing and after `restUntilDawn`.

Quality tiers: `Common`, `Fine`, `Exceptional`, `Prize`. One centralized quality function uses underlying score:
```text
climate match       30%
average moisture    25%
soil fertility      20%
farming proficiency 15%
seeded RNG           10%
```
UI and harvest MUST use the same calculation.

`CropQuality` ends at `prize`; `FishQuality` ends at `trophy`. They are separate typed contracts even though their lower tiers share names. Legacy conversion and preservation rules are recorded in `01` §6.1. Work affordability is validated before quality RNG advances. A fully funded action uses the normal quality calculation; an unfunded action produces no roll or mutation.

Harvest:
```text
quantity = seededRandom(baseYield.min, baseYield.max)
         × healthModifier
         × proficiencyModifier
```
Recommended endgame yield ceiling from skill: **~25%**; progression value should mostly come from capabilities.

Harvest quality also multiplies the harvest action's Farming XP: Common `1.0`, Fine `1.1`, Exceptional `1.25`, Prize `1.5`. This is immediate progression feedback only; stacked produce still has no per-lot quality and therefore cannot be priced by harvest grade.

Initial balance:
| Crop | Growth | Preferred Climate | Yield | Purpose |
|---|---:|---|---:|---|
| Wheat | 180m | Temperate | 3–5 | ground grain/chum |
| Barley | 90m | Temperate | 3–6 | ground grain/chum |
| Corn | 150m | Warm | 2–5 | feed/market |
| Tomato | 240m | Temperate | 3–5 | market/food |
| Potato | 360m | Cool | 3–6 | market/food |
| Carrot | 90m | Cool | 2–5 | feed/food |
| Flax | 240m | Temperate | 2–4 | fiber |
| Apple Tree | 720m | Temperate | 4–8 | orchard/regrow |
| Sunflower | 210m | Warm | 3–6 | ground grain/chum |
| Olive Tree | 840m | Warm | 4–8 | orchard/regrow/market |
These are starting values, not sacred final numbers.

# 3. Water, Soil, Compost & Orchards

Moisture starts on `0–100`. Watering restores substantial moisture; rain restores moisture; late irrigation reduces repeated manual Work. Do not require constant re-clicking or let watering dominate play.

```ts
interface SoilState {
  fertility: number;
  moistureRetention: number;
}
```
Harvest reduces fertility (floor **10**). `farm.apply-fertilizer` restores **+20** fertility, clamps **10–100**, and consumes `item.basic_fertilizer`. `FERTILITY_MIN`, `FERTILITY_MAX` and `FERTILITY_RESTORE` (`src/simulation/domains/FarmingDomain.ts`) own these three numbers. Applying onto already-100 fertility is a no-op success (`FarmFertilized`, no item spent) so Quest 13 can complete. Desired circularity: `fish scraps → fertilizer → better crops → grain → chum → fishing`.

`moistureRetention` (0–1) slows dry-out: `moistureChangePerHour` scales drought by `1 - retention * 0.5`. Rain still restores full moisture.

Compost is a finite processing job that turns Plant Matter plus Compost Starter into bait worms. `recipe.compost_worms` in `src/content/recipes.ts` owns duration, quantities and station requirements. Village sells `item.compost_starter` as a finite paid refill. Never provide infinite starter bait from a permanent object.

Apple Tree / orchards: on a **successful harvest**, a `regrows` crop persists, **resets health to 100**, and sets `effectiveGrowthMinutes` from `cropDef.regrowMinutes` (not `baseGrowthMinutes * 0.5`), returning stage `"growing"` so seeded/sprout are skipped. Orchards never wither from growth. A withered plot can be cleared (`crop.harvest`) with no XP or produce.

# 4. Farming Progression

Shared ranks/XP:
```text
0 Novice | 1,000 Apprentice | 3,000 Skilled | 7,500 Expert
15,000 Master | 30,000 Artisan | 60,000 Famed | 100,000 Legendary
```
XP sources: planting, successful harvest, crop care, farm contracts, advanced farm processing. Prevent repeat-plant/uproot and cheap reversible XP exploits.

`crop.minimumFarmingXp` owns crop access. Section 14 owns the shared progression-table contract, including live processing-rank and rod gates and validation against content requirements; do not treat every rank-unlock column as unused.

# 5. Inventory, Processing & Equipment

```ts
interface InventoryState { id: InventoryId; slotCount: number; slots: InventorySlot[]; }
interface InventorySlot { itemId?: ItemId; quantity?: number; }

interface PlayerEquipmentState {
  ownedIds: EquipmentId[];
  equipped: Record<EquipmentSlot, EquipmentId>;
  presets: Record<EquipmentPresetId, Record<ClothingSlot, EquipmentId>>;
  wardrobeCapacity: number;
}
```
Rules: finite slots, defined stack limits, atomic transactions, and no silent item loss. Capacity is checked by the transaction that actually grants an item. Starting a timed item job does not require an output slot that may be freed or filled before collection; collecting it checks current satchel capacity and leaves the completed result at the station on failure. A permanent-equipment result instead reserves wardrobe capacity when the job starts. Failure leaves inputs, Work, RNG, XP and existing jobs unchanged.

MVP stations: `Hand Mill`, `Workbench`, harbor **Fish Cleaning Table** at `HARBOR_FISH_TABLE` (`struct.harbor_fish_table`, `stationType: "fish-table"`). New-game station `y` is terrain height. The reference-led harbor coast connects the existing apron to the eastern beach and rocky fishing access through the shared `harbor-beach-path` and `harbor-rocky-landing` routes. Shore support and marine bathymetry share `WorldLayout` and its pure `HarborCoast` profile; visual sand/foam fields do not create another gameplay shoreline. Coastal shelters are environment assets, not new stations, rewards or progression gates. Saved terrain/collision recovery follows `01` §6.1. Harbor arterial and coastal routes terminate at `HARBOR_MARKET_APRON` (`x: 64.5, z: 54.5`) in front of the fish market stall counter, keeping the route corridor, fish-cleaning table, and shore-stairs approaches unobstructed by building collision.
```ts
interface ProcessingJobState {
  id: ProcessingJobId;
  recipeId: RecipeId;
  stationId: StructureId;
  startedAtMinute: GameMinute;
  completesAtMinute: GameMinute;
  status: "active" | "complete";
  recipeName: string;
  outputLabel: string;
  result: RecipeResult;
  workTier: ProcessingWorkTier;
  presentationKind: ProcessingPresentationKind;
  baseWork: number;
  chargedWork: number;
  xpReward: number;
  effectiveDurationMinutes: number;
}

interface RecipeDefinition {
  id: RecipeId;
  stationType: StationType;
  inputs: ItemStack[];
  result: RecipeResult;
  durationMinutes: number;
  workTier: ProcessingWorkTier;
  presentationKind: ProcessingPresentationKind;
  minimumSkill?: { skill: SkillId; xp: number };
  tags: string[];
}
```

`src/content/recipes.ts` owns recipe membership, inputs, results, authored duration, tier, presentation kind and gates. `src/content/equipment.ts` owns permanent equipment membership, slots, effects, icons and presentation bindings. `ContentRegistry` validates both graphs; `ProcessingDomain`, `EquipmentDomain` and `ProgressionDomain` are the only mutation/formula owners. Do not maintain a second item or recipe database in UI, animation, Three.js nodes or documentation.

## 5.1 Processing transaction and save contract

Starting and collecting are separate simulation commands:

1. **Start quote:** validate a real station and its front approach, station type, recipe/rank gate, ingredients, free hands, Work affordability, and—only for an equipment result—unique ownership plus available or reserved wardrobe capacity. An empty station is valid. At most one active or complete job may reference a station; every job must reference an existing station.
2. **Commit:** `SimulationActionTimeline` owns the action clock and commit timestamp. It replays the canonical command exactly once at the marker; animation and audio are observers. Before the marker, cancellation or reload costs nothing. After a successful marker, presentation interruption cannot undo the economic transaction.
3. **Wait:** only an already-committed job may advance from `active` to `complete`, including through bounded offline progression. Offline time never starts or collects a job. A completed result may wait indefinitely and continues to occupy its station.
4. **Collect:** revalidate the station approach and current destination capacity. Grant the captured result and captured Processing XP atomically, emit completion once, then remove the job. A full satchel or wardrobe leaves the completed job intact.

A job snapshots its result, user-facing labels, tier, Work debit, XP, presentation kind and effective duration when it starts. Later content edits cannot change an in-flight economic result. Save validation permits zero jobs, rejects more than one non-collected job per station, and validates the snapshot itself rather than re-deriving it from mutable recipe content: tier-owned Work/XP, status against the saved clock, exact start/end/duration arithmetic, bounded labels and duration, and unique item stacks within the empty-satchel and per-item limits. Collection defensively rechecks the frozen economic payload before granting output or XP. Schema migration and reload behavior belong to `01` §6.1.

Content validation rejects duplicate item-output stacks, any individual output above its item stack limit, and any authored batch that cannot fit in the canonical empty player satchel. This is an authoring sanity check, not a start-time capacity reservation: current satchel space is intentionally re-evaluated only when the player collects the finished item result.

Existing recipes retain their prior outputs, gates and authored/effective durations and enter the `standard` compatibility tier. `PROCESSING_WORK_BY_TIER` and `PROCESSING_XP_BY_TIER` own the exact tier values; the v36 compatibility fixture verifies every former recipe's result, Work, XP, authored duration, new-game and steady-state effective duration, authored minimum-skill gate, effective progression gate and presentation kind before the new equipment recipes are considered. `standard` and `masterwork` communicate production scale; they are not rarity labels and do not bypass rank gates.

Representative connections remain grain → chum, fish scraps → fertilizer, local fish → supplies/preserved food, farm fiber → tackle and textiles, and workshop materials → durable clothing/tools. Lure production has two recovery speeds: a low-efficiency novice recipe uses renewable plant matter and composted worms for one immediate replacement, while the later batch recipe turns harvested flax and fish scraps into two. Every recipe must support preparation, useful recovery, preservation, equipment or trade.

## 5.2 Processing progression and economy proof

The Processing gates use the shared proficiency ladder rather than a private rank table. A representative mixed route reaches Apprentice at 1,015 XP with 29 collections across nine novice recipes and no recipe repeated more than six times. A second mixed leg reaches Skilled at 3,010 total XP with 55 more collections across twelve apprentice-available recipes and no recipe repeated more than eleven times. `tests/simulation/equipmentCraftingSystem.test.ts` executes both processing legs through their live rank checks and start → wait → ready → collect transactions, with inputs explicitly supplied to represent production, purchase or quest acquisition and outputs consumed or sold between jobs. `tests/simulation/contentReachability.test.ts` separately proves every required input has an actual source. This establishes the processing cadence and gate reachability, not full-session acquisition time or player-perceived repetition; those remain playtest questions. Tune the gates or tier rewards if playtesting shows the cadence is repetitive; do not hide a rebalance inside a type migration.

Purchased-input processing is a legitimate workshop business, not free resale arbitrage. Direct buy → sell remains a loss. Selected processed commodities may return a modest median margin after paying retail inputs, but the margin is bounded and consumes Work, station occupancy and time; market supply/demand still changes realized returns. `tests/simulation/economyBalance.test.ts` checks both halves. Farming or fishing should improve margins and self-sufficiency, but is not a universal prerequisite for profit.

## 5.3 Permanent equipment and work outfits

Equipment is permanent, unique and durability-free. Clothing (`head`, `outerwear`, `feet`) plus the watering and harvest tools live in the wardrobe, outside finite satchel stacks; the fishing rod keeps its existing owned-rod state and appears as the sixth Character-screen slot. The wardrobe has finite capacity, including reservations for pending equipment jobs. Crafted duplicates are rejected rather than converted, stacked or silently lost.

Field and Sea presets save/apply clothing only. Tools and rods remain deliberate per-activity choices. Applying a preset validates every item first and changes all three clothing slots atomically. Switching is intentionally convenient in a safe state—this is a work-outfit system, not a penalty puzzle—but is blocked during an action timeline, fishing, mounting, physical-fish carrying, or unsafe boat movement. Character-screen equips, market purchases that auto-equip a rod, market rod swaps and their board affordances all consume the same simulation-owned safe-state guard. The Character screen's Try On state is local presentation and never changes canonical equipment until Equip or Apply succeeds.

Equipment effects are composable content data with one consumer per rule. The starter set is neutral. The Field Hat reduces planting/fertilizing Work so it never competes with the specialist watering can or sickle; farming and fishing clothing form convenient activity outfits, while the two watering cans and two sickles remain within-activity sidegrades between reach/throughput and yield/throughput. Exact effect membership and values belong to `src/content/equipment.ts` and are exercised through the real farming/fishing commands, not just helper tests.

For a Work action, proficiency first produces the actual rounded integer cost without gear, `neutralCost`. Equipment then proposes `round(neutralCost × multiplier)`, but the final cost may never be below `ceil(0.80 × neutralCost)`. The guarantee therefore caps **additional actions per Work** at 25% even for small costs and after proficiency rounding; it does not claim to cap total XP per Work, because crop quality and Processing XP are separate reward contracts. UI comparisons must disclose when integer rounding or the throughput floor limits a nominal effect.

Reach is action-specific. Water-target acquisition, water prompt, quote and command share watering reach; harvest equivalents share harvest reach. Information-only inspection has its own reach and cannot veto an otherwise legal watering target. Furrow Boots explicitly affect water, harvest and inspection; a Long-Spout Can affects watering only. No generic crop-target distance may collapse those contracts back into one radius.

# 6. Basic Fishing

Purpose: engaging early and accessible fishing loop, Fishing XP, common fish/ingredients, low-risk income, and bait utility. Requires rod + valid water (Bait Worms optional: wait time cut ~40% **and** rarity weights biased toward rarer species before `rng.weighted`). Fishing supplies resolve from the satchel and then the active vessel during play, or the explicitly selected vessel in expedition planning; remote unselected vessel inventories are not accessible. A crafted lure is optional for basic fishing, must be explicitly armed before casting, is consumed only after a valid paid cast begins, and improves that cast's hook reliability. Wait is also multiplied by authored weather, time-of-day, and wind modifiers in `FishingTuning`.

**Wind on the cast.** The wind takes a bank cast three ways, all from one owner (`src/simulation/fishing/castWind.ts`, numbers in `FISHING_TUNING.castWind`). It is read relative to the caster, not the world, so the same blow is a tailwind or a headwind depending on which way the angler turns to face the water. A tailwind carries the cast further and a headwind drops it short; a crosswind sets the bobber down off the aim line, further on a harder cast. Bite wait follows a well rather than a slope: a ripple fishes best, and both a glassy calm and a hard blow are worse than it. The reading is pure and takes no RNG, so the same cast in the same conditions always lands the same way. `castLateralDriftMeters` is presentation-facing simulation state; it carries no save migration because it is optional and derived at cast time.

### 6.1 State Machine & 5 Phases
`Idle → Charging-Cast → Waiting-Bite → Bite-Reaction → Minigame → Caught|Escaped → Idle`

1. **Charging-Cast**: Holding action key charges casting power meter ($0.0 \rightarrow 1.0 \rightarrow 0.0$). Releasing casts bobber ($3\text{m} - 12\text{m}$, then scaled by any tail or head wind). Deeper casts lower bite wait times, reduce trash odds, and boost high quality tiers.
2. **Waiting-Bite**: Bobber floats in 3D water. Wait time influenced by bait (`item.bait_worms` cuts wait by ~40%), cast depth, weather, time of day, and the wind.
3. **Bite-Reaction**: Visual alert ("!") and sound cue. Player has a reaction window ($1.2\text{s} - 1.5\text{s}$) to hook the fish ("HIT!").
4. **Green Catch-Bar Minigame**:
   - **Physics**: Normalized vertical track ($0.0 - 1.0$). Holding action key applies upward thrust ($+2.8\,\text{u/s}^2$); releasing applies downward gravity ($-1.9\,\text{u/s}^2$). Elastic bounce on bottom floor.
   - **Bar Height**: $\text{Height} = 0.20 + \text{RodBonus} (0.02 - 0.08) + (\text{ProficiencyRank} \times 0.015)$.
   - **Fish AI (5 Archetypes)**: `mixed` (balanced), `smooth` (gentle sine), `sinker` (bottom bias), `floater` (top bias), `dart` (erratic lunges). Difficulty ($15-95$) scales speed and jitter.
   - **Progress Gauge**: $+0.26/\text{s}$ when fish inside bar, $-0.14/\text{s}$ when outside. Reaching $100\%$ lands the fish; dropping to $0\%$ causes an escape.
   - **Sunken Treasure**: $18\%$ chance for treasure chest icon. Holding green bar over chest fills progress ($+0.45/\text{s}$) to unlock bonus loot (seeds, ores, coins, bait).
   - **Perfect Catch**: If fish never leaves the bar, grants "PERFECT!", bonus Fishing XP, and a $+1$ tier fish quality upgrade along the canonical `FishQuality` ladder `common → fine → exceptional → trophy` (§9). **Silver/Gold/Iridium are UI atlas skin names only** (`src/ui/chrome/uiAtlas.ts` maps `trophy → iridium`); they are not a quality enum and must never be introduced into simulation state.
5. **Catch Summary**: Phase stays `"caught"` until the player commits or explicitly discards it. Commit (`fishing.commit-basic`) writes the stack using `FishQuality` only (`common | fine | exceptional | trophy`). If fish+treasure cannot fit, the session stays `"caught"`; the UI offers **Open satchel** and **Discard catch**, and Escape cannot silently destroy the waiting catch. Successful commit also writes `journal.fishRecords`.

Missed bite window = **miss** (session cleared; reason `"missed"`). `willCatch` defaults **false** until the rod's hook roll. Bite-reaction window is rolled at cast (`1.2s–1.5s`). Hook requires `phase === "bite-reaction"` only.

Basic fishing blocks inventory except while `phase === "caught"`. Sport-fishing MUST block inventory.

### 6.2 World Fishing Access

`WorldLayout.fishingAccessAt()` is the single spatial rule for ordinary bank fishing. It combines walkable support, the current side-aware bank slope, a reachable water target on the same side of the channel, and a reserved approach/casting clearing. Bridge-lesson and authored pier access remain explicit supported cases. `nearbyFishingHabitat()` is a compatibility query over that result; callers must not recreate access from river center distance or a water mask.

The authored world retains at least three stable river-access components, including the bridge lesson area. Structural vegetation and rocks must yield to their approach and casting envelopes, while the route and district fields keep the access legible from normal traversal. A visually wet bank is not automatically fishable, and presentation cannot move a cast target across land to manufacture access.

Neva's river begins at the finite mountain spring defined by `src/world/NevaHeadwaters.ts`. Its elevated headwater reach is scenic water: `WorldLayout.isSailable()` excludes it and `fishingHabitatAt()` returns no habitat there. The downstream river-access reserves, bridge lesson, harbor waterline, and Sunreach access keep their existing gameplay roles. This terrain change adds no fishing progression gate, species, reward, or capability; recovery of saved upper-river boats and ongoing catches follows the migration contract in `01` §6.1.

Fishing locality is content and simulation truth. Every species declares its
allowed `ecologyIds`; school spawn, basic casts, quest objectives, and catch
events carry the ecology selected by `WorldLayout.fishingEcologyAt()`. The 15
live species in `src/content/fish.ts` include Sunreach Sardine as a basic cove
catch, Golden Sea Bream as a basic reef/shore catch that becomes physical
cargo, and Greater Amberjack as a sport catch at the exposed reef edge.
Sunreach species cannot spawn in Neva ecology; transported fish remain normal
items or cargo and do not change identity.

# 7. Fish Species & Schools

```ts
interface FishSpeciesDefinition {
  id: FishSpeciesId;
  name: string;
  habitats: HabitatId[];
  seasons: SeasonId[];
  timeWindows: TimeWindowId[];
  weatherPreferences: WeatherTag[];
  weightKg: { min: number; average: number; max: number };
  baseMarketValue: number;
  rarityWeight: number;
  behaviorProfileId: FishBehaviorProfileId;
  minimumRodClass: RodClass;
  cargoClass: "small" | "medium" | "large" | "gargantuan";
  tags: string[];
}
```
Sport fishing requires an active chummed school, a compatible rod, no conflicting mode, a non-expired school, a prepared lure physically within the satchel or active/selected vessel supplies, and at least one species that both the equipped rod and the current carry/active-vessel capacity can accept. Species that exceed the rod's `maximumCargoClass`, fail its minimum class, or cannot be stowed are filtered before the species RNG draw. Landing immediately stows into the player carry slot or active boat cargo hold. Stowed living catch can be released (`cargo.release`) to free space; release preserves honest accounting: the school's catch potential remains consumed, journal catch records stand, and no sale, scraps, or bonus XP are awarded (spoiled fish with freshness $\le 0$ cannot be released and must be discarded as scraps). The lure must be explicitly armed and is consumed only after the hook's Work payment succeeds. A missing or stale prepared lure refuses before canonical RNG or Work changes; the successful hook snapshots the consumed lure into the encounter, where it modestly reduces fish drive and head-shake damage without changing species odds, quality, or minimum tells. Losing the fight does not refund the lure.

```ts
interface FishSchoolState {
  id: FishSchoolId;
  habitatId: HabitatId;
  x: number;
  z: number;
  radius: number;
  spawnedAtMinute: GameMinute;
  expiresAtMinute: GameMinute;
  feedingFrenzyUntilMinute?: GameMinute;
  deepChumUntilMinute?: GameMinute;
  remainingCatchPotential: number;
  speciesWeights: Array<{ speciesId: FishSpeciesId; weight: number }>;
}

interface FishingPressureState {
  ecologyId: FishingEcologyId;
  habitatId: HabitatId;
  lastEndedMinute: GameMinute;
  cooldownUntilMinute: GameMinute;
  recentCatchCount: number;
}
```
Spawn inputs: ecology, habitat, season, time, weather, world seed, recent pressure, cooldown. Cooldown begins when a school depletes or expires, not when it originally spawned; recent landed catches extend the bounded per-habitat cooldown and decay over time. Each new school deterministically rotates among small authored offsets that remain inside its registered ecology/habitat. Occupancy is **per authored spawn point** (`schoolSpawnPointIndex`, derived from position, never stored) while pressure stays per habitat: keying occupancy on ecology+habitat let Neva's first offshore point shadow the second forever, so the deep trench Act 9 sends the player to never held a school. The open channel adds authored coast and offshore opportunities near its sparse islets, while Sunreach's coast point sits on the reef edge where the shelf drops away — the fishery Tomas describes and Acts 7–8 send the player to — rather than at the cove mouth. Every point must resolve to its declared ecology and habitat through `WorldLayout`; an islet cannot manufacture a school by presentation alone. Quest anchors for fishing grounds are read from these points (`schoolGround` in `quests.ts`), and a fishing objective's tracker target is the nearest live school matching its water and species, falling back to that anchor. Presentation binds weighted species models, a frenzy gull, surface splashes, and occasional jumps to the actual school; fish finders later improve detection.

Lifecycle: `Inactive → Spawned → Chummed → Feeding Frenzy → Depleted|Expired → Cooldown`. Schools never persist forever.

# 8. Sport-Fishing Encounter

```ts
interface FishingEncounterState {
  fish: FishInstance;
  rodId: RodId;
  tackleSnapshot: { lureItemId: ItemId | null };
  seaConditionSnapshot: { weatherType: WeatherTag; seaRoughness: number };
  stamina: number;
  maxStamina: number;
  distanceMeters: number;
  lineTension: number;
  lineIntegrity: number;
  fishDirection: number;
  behavior: "rest" | "run-left" | "run-right" | "dive" | "surface" | "burst" | "shake";
  behaviorUntilSeconds: number;
  elapsedSeconds: number;
  result: "active" | "landed" | "escaped" | "line-snapped";
}
```
Default controls: held-state `fishing` — hold LMB/W to wind; S/RMB to yield line; Space to lift/load the rod; A/D (`fish-left` / `fish-right`) to counter the fish with rod direction. Keyboard and touch both clamp steering to ±0.6. Discrete `fish-reel` / `fish-slack` / `fish-brace` actions retain their stable input IDs, but the encounter is driven by held state. The player-facing rhythm is **read one fish action → match its one highlighted response → reel when the simulation reports a real low-effort/stored-load opportunity**. Runs ask for the opposite rod direction; dives and bursts ask for a brace; bracing during a headshake suppresses shake damage while retaining its normal tension cost. The landing window asks for neutral **Hold steady** and clears held touch input because reeling would raise tension and cancel progress. Line danger can temporarily override the behavior answer with W to recover slack or S to yield overload. The deeper lift-and-wind rod-load model remains simulation-owned, but the HUD must not require the player to parse it as a second simultaneous minigame. Keyboard-only path required; no mandatory precision gestures.

Tension bands are derived from the equipped rod and published by the simulation DTO:
```text
below minimumLandingTension: dangerously slack
minimumLandingTension … rod.maxSafeTension: safe
at/above rod.maxSafeTension: danger and integrity damage
99+ sustained through snapGraceSeconds: line snap
```
Response depends on fish behavior. Every non-rest behavior has a deterministic tell, drive and recovery window derived from the persisted behavior clock. A selected behavior lasts at least 3.2 seconds, with at least 0.85 seconds of readable tell and 0.75 seconds of recovery; dangerously slack line warns for at least 2.2 seconds before it can escape. Runs reward counter-steering, bursts/dives reward a controlled lift or yield, and recovery is the high-value winding window. Reeling across a run loses purchase and adds cross-load; holding Space indefinitely is not free because it raises tension.

The final approach is coupled to exhaustion through `fishingFightDistance` in
`FishingTuning`: a fish with substantial energy holds an arc away from the
angler, and that arc closes smoothly as it tires. Inward motion and spool
retrieval respect the same boundary, so winding cannot pull a lively fish
under the boat or build artificial overload against the approach limit.
Short-water starts and already-close saved encounters are never teleported
outward. Behavior effort and actively controlled safe line pressure both
produce fatigue; controlled pressure prevents a long, nearly exhausted tail
without shortening species tells or removing mistakes and line damage.
Pacing is checked by following the actual HUD responses across species in
`tests/simulation/sportFishingPacing.test.ts`, rather than requiring large fish
to consume a fixed multiple of a smaller fish's time.

Yield payout covers both current drive and remaining outward momentum, so
easing the line still relieves tension after a heavy fish ends its burst.

Once exhausted, the decision prompt prioritizes winding the fish into reach,
easing tension into the landing band, then holding steady. The yield warning
precedes the rod's damage band. Captured touch input is released when the
highlighted action changes, so the previous response cannot remain held behind
a relabelled button.

Landing requires:
```text
stamina <= landingThreshold
AND distanceMeters <= landingDistance
AND lineTension within valid range
AND the valid range is held continuously for 0.55 seconds (an interruption resets the hold)
```
On land: auto-stow into a free hold/hook/player-carry slot, or `FishEscaped` if no space — a won fight with a failed stow does **not** consume the school. A successful stow commits school catch potential/pressure before `FishLanded`, so event-driven autosaves observe the cargo and its consumed school catch as one outcome. Hook will not roll a species the current hold/carry cannot fit. `SCHOOL_SPAWN_POINTS` covers every sport habitat — river, lake, coast and offshore on Neva, coast and offshore on Sunreach — and `tests/simulation/seasonalAvailability.test.ts` asserts none of them is empty in any season. The river point sits on the charted Silverwater access so the water Act 3 teaches stays a sport ground; `fish.tuna` and `fish.sailfish` range into `ecology.sunreach` as migratory pelagics, which is why the island's two points no longer roll a single species. Reef and river residents stay local to their island. Do not implement combat-style HP defeat.

```ts
interface FishBehaviorProfile {
  id: FishBehaviorProfileId;
  baseStamina: number;
  behaviorWeights: Record<FishBehavior, number>;
  minBehaviorDurationSeconds: number;
  maxBehaviorDurationSeconds: number;
  burstStrength: number;
  directionalForce: number;
  tensionSensitivity: number;
  escapeSlackSeconds: number;
  shakeHz?: number;
  shakeAmplitude?: number;
  inertia?: number;
  turnRate?: number;
  diveDepthMeters?: number;
  surfaceLeapMeters?: number;
  tellSeconds?: number;
  recoverySeconds?: number;
  pumpResistance?: number;
}
```
The encounter owns coupled line extension, rod-blank load, retrieval/payout, fish effort, inertia, heading/depth response and fatigue. `FishingTuning` owns shared constants and the single species-aware depth-bound helper used by both motion and save validation; authored profiles own species strength, timing, movement and behavior weights. Reel attempts stall under load and restrict automatic drag; yield overrides retrieval; lifting stores up to 1.25 normalized rod load and deliberately weakens simultaneous winding. Releasing the lift while winding returns the stored load as retrieval, especially during recovery. Rod direction responds gradually. Persistent head shakes ring tension and consume line integrity; bracing reduces the shake component but can still overload the rod. Hook-time `seaRoughness` adds a bounded deterministic drive modifier, and the mandatory hook-time lure snapshot reduces drive/shake pressure; neither changes behavior duration or the minimum tell/recovery clocks. The fish endpoint and the full angler-to-fish reach must remain on one continuous water path after the permitted short shoreline lead; a fish cannot run behind an island while the taut line cuts across land. Rest can recover limited stamina; line damage does not heal during the fight. Landing requires at least 12 normalized tension and less than the equipped rod's safe limit, alongside the fatigue/distance thresholds and sustained 0.55-second hold. Save/reload preserves the exact accumulated landing hold and never manufactures completion merely because the fish is inside the landing window.

Fight starts scale with specimen weight through `sportFishingStartDistanceForWeight`, shifting the cargo class base across `[base - spread, base + spread]` (small $\pm 5$, medium $\pm 7$, large $\pm 8$, gargantuan $\pm 10$ m) bounded by continuous validated water reach. Anglers can adjust line drag across three notches (`dragNotch`: 0=Light, 1=Balanced, 2=Heavy): light drag pays line sooner ($0.85\times$ tension threshold) with $+0.03$ hook reliability; heavy drag holds firmer ($1.15\times$ threshold) with $-0.03$ reliability. Mid-fight changes take effect immediately on the next fixed step.

Species signature moments pulse once per encounter on the first characteristic behavior trigger (`trout:surface`, `catfish:dive`, `pike:shake`, `arowana:surface`, `tuna:run`, `sturgeon:dive`, `sailfish:surface`, `swordfish:burst`, `blue_marlin:surface`, `carp:run`, `amberjack:run`), lasting `SIGNATURE_MOMENT_SECONDS` without mutating fight dynamics or RNG. The sample always carries the moment; the global `prefers-reduced-motion` rule suppresses its animation. Landmark catches flag `"first"`, `"weight"`, or `"quality"` records before updating the journal.

Reading the water (`inspectWaterReading()`) provides query-only environmental awareness at bank access points: Novice players read current conditions and local species run; Skilled (3,000 XP) senses nearby surface feeding; Expert (7,500 XP) senses directional distance bands; Master (15,000 XP) identifies species holding in the school. Ground familiarity (0–3) is derived without persistent per-spot state from `journal.fishRecords` counts, granting a $1.00\times$ to $1.75\times$ hook roll bias toward that ground's signature species.

`FishingEncounterState.dynamics` owns the persisted fight state and private seeded RNG. Its field additions, tackle/condition snapshots and legacy-distance preservation are recorded only in `01` §6.1; consult the current type and validator before editing. Presentation consumes the encounter through one shared sample; it cannot move fish to manufacture camera readability or decide outcomes. Its transient terminal bridge is driven only by `FishLanded` or `FishEscaped` and distinguishes landed, escaped, snapped, and failed-stow feedback without serializing presentation state; both terminal events fire only after the active encounter is cleared, so their autosave cannot resurrect a resolved fight.

Species MUST feel behaviorally distinct:
- Carp: low stamina, weak bursts, long rests, slow turns.
- Trout: quick, frequent surface, medium stamina.
- Catfish: heavy, slow turns, deep stubborn pressure and long recovery tells.
- Pike: sharp turns and violent hook-shaking.
- Arowana: agile surface runs and pronounced leaps.
- Tuna: high stamina, long inertial runs, deep dives, few head shakes.
- Sturgeon: maximum freshwater inertia, deep pressure and slow commitments.
- Sailfish: fast directional changes, surface display and long fin-readable arcs.
- Swordfish: deep powerful runs, strong bursts and short recoveries.
- Blue Marlin: very high stamina and inertia, long runs, violent shakes and large surface leaps; rare.
If species differ only by stamina, implementation fails.

# 9. Rods & Fish Instances

```ts
interface RodDefinition {
  id: RodId;
  rodClass: RodClass;
  reelPower: number;
  maxSafeTension: number;
  controlResponsiveness: number;
  hookReliability: number;
  allowedHabitats: HabitatId[];
  maximumCargoClass: "small" | "medium" | "large" | "gargantuan";
}
```
Progression examples: Basic Willow → River → Heavy Sport → Offshore → Master. Capabilities matter more than raw percentage boosts.

Sport-hook eligibility enforces both `minimumRodClass` and the equipped rod's `maximumCargoClass` before the species RNG draw.

```ts
interface FishInstance {
  instanceId: FishInstanceId;
  speciesId: FishSpeciesId;
  weightKg: number;
  quality: "common" | "fine" | "exceptional" | "trophy";
  caughtAtMinute?: GameMinute;
}
```
Weight uses a non-uniform distribution: most near species average, rare values near maximum.

# 10. Physical Cargo & Freshness

A player-carried fish occupies both hands. `domainRules.freeHandsBlocker` owns the shared eligibility rule consumed by farming, processing and fishing entry points; their commit paths reject competing tool actions before consuming Work, inventory or RNG. Crop inspection and application animation preflight report the same blocker. Cargo remains visible and unchanged until an explicit cargo transaction frees the hands; tool use never hides or automatically discards it. This does not change cargo capacity, economy tuning or saved state.

Sport fish and the authored physical basic catch are **fish trade packs**. They
land in a boat cargo slot (or the player's hands when a compatible shore
landing is possible). `cargo.pickup` is the explicit, free transaction that
moves one pack from an accessible boat slot into the player's hands; a docked
hold is accessible, but it is never treated as carried cargo. The Harbor Fish
Market does not sell these packs and does not offer a bulk shortcut. The player
must carry the pack to the Village Produce Market, which is the inland trade
center, on foot or riding the donkey, and sell it from the Trade packs ledger. The inherited horse carriage carries two compatible small/medium packs in independent slots. At its rear, `cargo.load-carriage` moves the carried pack into the first free slot; `cargo.pickup` collects a stored pack. Both require an on-foot player within reach, refuse fishing/boarding conflicts and preserve cargo on rejection. A full bed never consumes or drops the carried pack. Each pack remains in exactly one boat slot, carriage slot or player carry location throughout the handoff. Cart cargo uses open-air freshness and the cart's local climate, including offline progression; no remote satchel ice cools it. Unload and carry each pack to the counter to sell it.

```ts
interface FishCargoState {
  id: FishCargoId;
  speciesId: FishSpeciesId;
  weightKg: number;
  quality: FishQuality;
  caughtAtMinute: GameMinute;
  freshness: number;
  cargoClass: "small" | "medium" | "large" | "gargantuan";
  location: CargoLocation;
}
```
Freshness starts at **100**:
```text
freshnessLoss = elapsedMinutes × speciesBaseDecay × ambientTemperatureModifier × storageModifier
```
`ambientTemperatureModifier` uses the cargo holder's current registered local
climate sample, not a global island name or the player's position when the
cargo is stored elsewhere. Realtime and offline decay use the same segmented
temperature inputs.
LIVE ice: a slot `hasIce` flag **or** `item.crushed_ice` in the satchel / boat supply inventory forces storage modifier **0.4** anywhere that ice resolves. The authored location table below is the design target, not the live ice path (see Deferred):
```text
carried openly 1.00 | boat hold 0.80 | ice box 0.40 | cold storage 0.15
```
Freshness price:
```text
90–100 1.00
75–89  0.95
50–74  0.80
25–49  0.55
1–24   0.30
0      cannot sell as fresh fish
```
`FRESHNESS_STORAGE_MODIFIERS` and `FRESHNESS_PRICE_BRACKETS`
(`src/simulation/fishing/calculateFreshness.ts`) own both tables;
`tests/unit/docTuningValues.test.ts` holds these copies to them. Repeat them
here to explain the model, not to decide it.

At 0: process/discard/fertilizer; never silently delete.

For fishing preparation and Expedition Board readiness, accessible supplies are the satchel followed by the active vessel, or the board's deterministically selected vessel when planning ashore. Consumption is satchel-first and atomic. Remote vessel supply inventories never satisfy a live fishing action or appear as packed for the selected trip.

# 11. Boats & Sea Safety

```ts
interface BoatDefinition {
  id: BoatTypeId;
  name: string;
  maxSpeed: number;
  acceleration: number;
  turningRate: number;
  fuelCapacity: number;
  durabilityMax: number;
  fishCargoSlots: BoatCargoSlotDefinition[];
  supplySlotCount: number;
  safeSeaRoughness: number;
  requiredSkillXp?: { skill: SkillId; xp: number };
}

interface BoatState {
  id: BoatId;
  boatTypeId: BoatTypeId;
  x: number; y: number; z: number;
  headingRadians: number;
  fuel: number;
  durability: number;
  fishCargoSlotIds: Array<FishCargoId | null>;
  supplyInventoryId: InventoryId;
  upgrades: BoatUpgradeId[];
}
```
Rowboat: first vehicle, lake sport/nearshore, tiny cargo/low speed/poor rough sea; fuel may be omitted. The live definition keeps its 4.5 m/s top speed with a 3.0 m/s² launch ramp so short player-led steering inputs remain responsive at the browser's 30 FPS floor (`src/content/boats.ts` owns the tuning).

Fishing Skiff: LIVE acquisition at the authored harbor skiff mooring requires **7,500 Fishing XP and 850 G**. The atomic purchase creates the persisted `boat.player_skiff`, its eight-slot supply inventory, four internal medium cargo slots, two **external gargantuan hooks** (needed to stow blue marlin; do not nerf marlin to large), fuel tank, and better rough-water tolerance. `item.boat_fuel` is sold at the harbor; `boat.refuel` (dock, nearby, or aboard) consumes one can and fills `fuel` to `fuelCapacity`. A fresh save does not create a skiff; it remains a progression-world asset until purchased.

The Neva–Sunreach sailing centerline, serviced ports and optional islet landings are world registries. Sunreach sits far enough from Neva for the crossing to read as an expedition; Gull's Rest, Driftwood Cay and Lantern Shoal remain off the direct line as small skiff-only detours with walkable landings, discoveries and nearby fishing opportunities. Their `marketId: null` moorings permit docking and reboarding but provide no trade, refuel or automatic service. `MOTOR_FUEL_PER_GAME_MINUTE` in `NavigationDomain` owns motor burn, and the route regression must keep a full-tank direct round trip feasible with a useful reserve.
The open-channel exposure gate is physical navigation: a rowboat is stopped at
the safe-side edge, speed is cleared, and one contextual notice names the
Coastal Fishing Skiff requirement. The skiff may cross. This is not a UI-only
lock or a teleporter; fuel and return-route feasibility remain ordinary boat
economy constraints.

Boat entry and exit remain presentation over simulation-owned transactions. The rowboat uses a pelvis-contact marker on its physical bench, while the chairless skiff uses a root-aligned standing driver station with planted deck support. Rowboat/skiff boarding and docking variants may preserve the player's initial world pose, follow the moving craft, and converge to those anchors, but they do not change boat state, controls, or persistence.

Crude Emergency Tow is live: a crewed motor boat with an empty tank can be towed to the nearest compatible serviced mooring for a 25 G flat fee (`boat.emergency-tow`), cargo and fuel untouched. Unserviced islet landings never become a tow destination. External-hook class as a distinct verb remains deferred — see below.

## 11A. On-Foot Traversal

On-foot traversal owns a small serializable state separate from Work Capacity:

```ts
interface PlayerTraversalState {
  sprintStamina: number;
  sprintRecoveryDelaySeconds: number;
  sprintExhausted: boolean;
  isGrounded: boolean;
}
```

Movement input requests sprint; fixed-step traversal rules own stamina drain, recovery delay, exhaustion, and grounded state. Rapier resolves the physical pose through `PhysicsAdapter`, then the simulation commits the validated frame. The renderer may display movement/action feedback but may not mutate traversal or invent a second stamina resource. Any traversal-state schema change requires a deterministic save migration and fixture coverage.

`PLAYER_TRAVERSAL_TUNING` in `src/simulation/navigation/PlayerTraversal.ts` owns on-foot speed, acceleration, deceleration, and sprint stamina response. Catalog locomotion reference speeds and the animation controller must stay calibrated to those resolved travel speeds; presentation may vary phase/playback from actual travel, but it must not preserve an obsolete faster gait by making the feet slide or over-cranking cadence.

Shipped on-foot speeds are 2.0 m/s walking and 5.2 m/s sprinting. Locomotion
playback is `resolvedSpeed / clip.referenceSpeed` and is deliberately
**unbounded**: the clip advancing at exactly ground speed is what keeps feet
planted, so a clamp would introduce the sliding a clamp is usually reached for.
The cost is that the donor `walk` and `run` clips (authored at 1.465 and 3.261
m/s) now run at about 1.37x and 1.59x on flat ground, and up to 1.82x sprinting
down the steepest bank the slope scale allows. Those figures are pinned by
`tests/unit/locomotionPlaybackRate.test.ts` so a further speed increase has to
be a deliberate decision rather than a silent one; retiming them properly means
re-authoring the imported humanoid's root motion, not editing a constant.

Riding must beat walking at every tier, so `MOUNT_TUNING` moved with it: 2.3 /
5.8 / 7.5 m/s for walk, trot and gallop. Mount clips are *derived* from those
numbers — `tools/blender/generators/characters.py` computes each gait's
duration from stride reach divided by the catalog reference speed and refuses
to build if the two disagree — so changing mount tuning always means editing
`fauna_donkey_a`'s clip reference speeds and durations and regenerating it. The
rider's own `mounted_walk` / `mounted_trot` / `mounted_gallop` clips on
`char_player_a` mirror the same three numbers and must be re-baked with
`tools/blender/adapt_imported_humanoid.py` in the same change, or the rider
bobs out of step with the animal. The gallop retune to 7.5 m/s landed ahead of
that rebake: until both assets are regenerated via `art:generate`, gallop
playback runs at tuning over catalog (~0.89x) with feet planted. Mounted playback is otherwise exactly 1.0.

`slopeGaitScale()` uses the horizontal component of the upward support normal as downhill: movement against the height gradient gains the bounded downhill response, movement along it receives the uphill penalty, and contour travel is neutral. `PhysicsAdapter` reports signed tangential acceleration from resolved movement, so braking is negative and constant-speed turning is not forward acceleration. This motion evidence is transient presentation input, not additional saved traversal state.

## 11B. Mounts (LIVE)

Mounts provide land traversal. The starter pack donkey and inherited horse carriage exist in fresh saves; migration adds the carriage to existing saves without replacing progress. The carriage parks on the open southern edge of the farmhouse yard, facing the exit, with two physical cargo slots governed by §10. There is no purchase, breeding, feeding, durability or stabling economy.

`MountState` in `src/simulation/core/types.ts` owns pose and gallop-resource
fields, plus the carriage-only physical cargo slot pointers. `GameState.mounts` is keyed by stable mount ID;
`player.activeMountId` alone determines whether the player is riding.
`"mounted"` is an explicit `GameplayMode`; migration history is in `01` §6.1.

Contract:

- **Board / dismount** are the `mount.board` and `mount.dismount` commands,
  owned by `NavigationDomain`. Boarding requires the player within
  `boardRadiusMeters` of a valid mount pose on mountable ground; dismount
  resolves to a cleared adjacent pose. A pose that is not on valid ground, or a
  frame that reports both an active boat and an active mount, is rejected.
  Carrying a trade pack does not block boarding the donkey: the pack rides on
  the rider's back at the mount's unpenalized speed. Boarding the carriage
  while carrying stays blocked; load its bed at the rear on foot.
- **Mounted traversal is free of Work costs and awards no XP.** Walk/trot
  remain available while gallop uses the mount-owned resource described below.
- **Mounting suspends manual production.** Planting, crop tending, harvest,
  fertilizing, processing stations, fish-cargo handling, and both fishing modes
  refuse while `activeMountId` is set, with a `Dismount before …` reason. This
  is the intended boundary: the mount moves you between work sites, it does not
  let you work from the saddle. Riding with an already-carried pack is passive
  carrying, not handling, and stays allowed on the donkey.
- **`MOUNT_TUNING` in `src/simulation/mounts/Mounts.ts` is the tuning owner** for
  walk/trot/gallop speed, gallop stamina and recovery, acceleration, pose offsets, board radius, ground tolerance,
  and maximum mountable slope. Do not scatter those numbers into presentation,
  input, or physics code.
- **The mounted controller snaps to ground at `0.26 m`.** Ground snapping used
  to be disabled outright while mounted, which let the taller capsule float clear
  of authored risers at gallop and catch the next box edge on the way down. The
  value clears the authored 0.18 m dock riser and the bridge segment steps while
  staying under the on-foot snap; mounts are pinned to the
  traversal surface rather than integrated under gravity, so they report grounded
  outright and have no airborne state to recover from. See `01` §11.
- The donkey offers walk, sustained trot and a stamina-limited gallop. Riding
  does not drain the player's sprint resource: `advanceMountGait` advances the
  mount's own persisted gallop stamina, recovery delay and exhaustion at the
  fixed traversal step. `PhysicsAdapter` returns that result and
  `NavigationDomain` commits it to the active mount. The budget outlasts the
  rider's own sprint (roughly seven seconds of gallop against four and a half),
  and the HUD shows it as Gallop in the unit-frame stamina slot while mounted.
  Carried trade packs never slow the mount: the animal carries the load, so
  laden and unladen gaits resolve identically. Exhaustion prevents
  galloping until the configured recovery threshold is reached; ordinary
  movement remains available. Schema history belongs to `01` §6.1.
- The mount mesh, animation, and rider attachment are presentation. Mount pose
  is committed from the validated physics frame exactly like the player pose;
  Three.js never owns mount position.
- Rider and donkey locomotion begin from the same normalized gait phase and
  preserve compatible phase across walk/trot transitions. The rider's mounted
  pelvis motion absorbs the animal's authored body rise instead of adding a
  second bounce; this coupling remains transient presentation state.
- Stationary donkey and rider idle use their authored neutral support poses;
  moving-gait foot constraints do not bend the animal or rider to local floor
  samples while they are standing still.
- The authored `mount` / `dismount` action duration is a transient presentation
  boundary: application input, traversal, and the mount prompt are locked until
  that catalog clip ends. This lock is not serialized and does not alter
  NavigationDomain truth.
- Mount and dismount select authored left/right variants from approach and the
  simulation-selected cleared landing side. Reparenting preserves the first
  visible world pose; dismount keeps the rider attached through the leg-over
  phase, releases at foot contact, and finishes exactly at the selected ground
  pose. The rider socket and authored left/right stirrup sockets own pelvis and
  foot support; terrain contact solving does not modify mounted poses.

The horse carriage uses `Carriage.ts` for capacity, interaction offsets, collision footprint, driving tuning and its trot stamina budget. W/S moves it forward or backward at the walk speed, A/D steers only while rolling, release brakes, and Shift trots while the budget lasts: roughly ten seconds of trot, then a forced walk until recovery. Walking and reversing stay free. `PhysicsWorld` advances the budget through the shared `advanceMountGait` stepper and commits it to the carriage mount, and the HUD shows it as Trot in the unit-frame stamina slot. `PhysicsWorld` checks the bed, shafts and horse across each fixed-step movement and turn against static collision and dry slope-safe support. Parked bed and horse colliders block pedestrians. The catalog horse gait follows resolved movement, the wheels follow signed travel, and the player sits at the authored driver socket. The initial parking pose and exit clearance are tested against the actual world collision projection. The carriage walk/trot retune to 1.6/3.2 m/s landed ahead of its clip rebake like the donkey gallop above: the presentation reference stays pinned to the baked 1.1/2.1 m/s cadence until the carriage assembly is regenerated.

Deferred for mounts: purchase/ownership progression, general mount inventory,
feeding, further species, and working while mounted. The gallop budget
described above is live, not deferred.

# 12. Weather & Sea Risk

```ts
interface WeatherState {
  type: "clear" | "cloudy" | "light-rain" | "heavy-rain" | "windy" | "fog" | "storm"; // no drought
  windDirectionDeg: number;
  windSpeed: number;
  precipitation: number;
  cloudCover: number;
  seaRoughness: number;
  visibility: number;
  temperatureC: number;
}
```
| Weather | Farming | Fishing | Sailing |
|---|---|---|---|
| Clear | neutral | species dependent | easiest |
| Light Rain | moisture gain | some bonuses | normal |
| Heavy Rain | heavy moisture | visibility loss | rougher |
| Windy | faster drying | school shifts | direction matters |
| Fog | neutral | rare-species hook | poor visibility |
| Storm | heavy moisture (as heavy rain) | rare opportunity | dangerous |
MVP may initially implement clear/rain/windy/storm.

Weather fronts last **360–720 game minutes**. Seasonal weights keep the same types: spring wetter, summer clearer, autumn foggier, winter stormier. Forecast UI shows **Now / +2h / +5h** plus season via `weather.nextWeatherType`.

Harbor sells `item.crushed_ice` so freshness vs capacity is an expedition prep.
Sunreach Cove also stocks finite fuel and ice plus its local seeds and produce;
`MarketDomain` derives wares from the content-owned market definitions
rather than hardcoded village/harbor arrays.
Contracts refill according to §15
and honor `requiredXp`. Refill first preserves an attainable produce listing and,
after rowboat access, an attainable fishing listing when eligible content
exists. `MarketDomain.inspectExpeditionBoard()` presents a steady and a bold
route from those contracts or its scoped produce/sport-fish demand signals,
with blockers for deadline, tackle, chum, ice, rough water, and cargo space.
The UI does not reproduce pricing, demand, or feasibility formulas.

Sea risk:
```text
riskScore = weatherSeaRoughness × boatVulnerability × offshoreDistanceFactor
```
Effects: slower control, greater repair probability, harder fishing, warnings. Sport fishing snapshots weather type and `seaRoughness` at hook time, then applies a bounded deterministic pressure modifier without shortening minimum tells or changing the condition mid-fight. The Act 5 teaching fight is the one exception: a trout-only starter school hooked while `quest.act5_maiden_voyage` is active snapshots roughness capped at calm (0.25) with the weather type left truthful, so the first sport fish teaches the matching rule instead of the weather. Avoid arbitrary instant destruction.

# 13. Markets & Pricing

```ts
interface MarketCommodityState {
  itemId: ItemId;
  basePrice: number;
  demandIndex: number;
  localSupply: number;
  consumptionRate: number;
  seasonalModifier: number;
  lastTickMinute: GameMinute;
}
```
Fish may use species IDs.

Market tick: **every 60 game minutes**. `targetSupply` is the resting fixed point. Player sales push supply above it, purchases pull supply below it, and the authored `consumptionRatePerHour` moves either glut or shortage linearly back toward target. Demand is derived from normalized supply deviation with elasticity **0.60**, plus a pure deterministic item/day trend (**±0.15**) and item/hour noise (**±0.025**) hashed from world seed and time. Market demand never draws from the shared gameplay RNG stream, so live and offline replay agree exactly. Prices MUST remain understandable, not chaotic.

Demand clamp: **0.65x–1.60x** (UI may show 65–160%). `marketPricing.ts` owns the elasticity, trend and noise amplitudes, the clamp and the retail multiplier (`DEMAND_ELASTICITY`, `DAILY_TREND_AMPLITUDE`, `HOURLY_NOISE_AMPLITUDE`, `DEMAND_MIN`/`DEMAND_MAX`, `RETAIL_MARKUP`); it also owns `sampleDemandTrend` and the three-word demand label (`demandLabelFromModifier` / `demandLabelFromPercent`), so the commodity outlook, the world stall board and the sell quote all read one trend and one label definition. `tests/unit/docTuningValues.test.ts` holds the figures above to them.

```text
producePrice = basePrice × demandModifier × seasonalModifier
fishPrice = speciesBasePrice × weightModifier × qualityModifier × freshnessModifier × demandModifier × seasonalModifier
```
LIVE: produce **quality does not affect sale price** (quality is computed and journaled only; harvest feedback labels it a grade that boosts Farming XP, so the mastery track pays in progression, not gold). Fish quality affects price **in the cargo lane only** — a landed `FishCargoState` carries its own quality and `calculateFishPrice` prices it. A fish held as a satchel *item* is a fungible stack with no per-instance quality and settles at the same commodity quote as any other item; it must never be priced from the journal's best-ever record, which paid a permanent trophy multiplier on every later common catch while the market board quoted a lower number. Example Blue Marlin (base 480): `480 × 1.35 (weight) × 1.25 (fine) × 0.95 (freshness 75–89) × 1.25 (demand) × 1.05 (season) ≈ 1010`. UI must explain components.

Physical fish trade packs use the same deterministic fish formula, but only at
the Village Produce Market after the player is carrying the pack. Ordinary
non-pack physical fish, if authored later, remain in the fish-market cargo
lane. This separation is why a docked boat can be inspected for contracts or
logistics without making a pack sale available.

Selling raises local supply; repeated dumping gradually lowers price, while town throughput restores it toward the centered market. Never crash price dramatically from one ordinary sale. Single and bulk trades are priced as the exact sum of deterministic one-unit marginal fills, including across clamp boundaries, so one bulk fill and the same sequence of one-unit fills pay the same total. Trading XP is derived from total realized revenue with no per-click minimum.

Buys are capped at `floor(localSupply)`, reduce stall supply, and use a **1.25 retail multiplier** over wholesale. For a commodity sold at more than one market, the retail quote also floors its effective modifier at the best current wholesale modifier across those markets; an immediate cross-market round trip cannot profit even when demand differs. `MarketDomain.inspectFish` / `sellFish` handle the ordinary fish lane, while `inspectTradePack` / `sellTradePack` handle the carried trade-pack lane and return `FishPriceBreakdown`; UI must not call `calculateFishPrice`.

`MarketDomain` owns the `market.get-board`, `market.quote-sale`, `market.quote-purchase`, `expedition.get-board`, affordability, demand-signal, fish-breakdown, and bulk-sale presentation queries. The market and expedition DTOs contain wares, owned goods, fish valuations, carried trade-pack valuations, rod gates, contract readiness/blockers, scoped opportunity demand, affordability, stock, and one plain demand signal; React renders them and does not import economy formulas, inventory operations, market-domain constants, or rod progression tables. Sell-all produce and ordinary fish validate the full quote first and then commit as one atomic domain transaction; fish trade packs are deliberately excluded from bulk sale and require one manual carry-and-sell transaction each.
# 14. Work Capacity & Proficiencies

**Owners.** `WorkCapacityState` (`src/simulation/core/types.ts`) is the shape.
`ProgressionDomain` owns the pool, the ceiling, the daily earn cap, the rest
fraction and baseline floor, the meal limit and the proficiency discount curve.
Each action's base cost is exported once by its own domain:
`FARMING_ACTION_COST`, `BASIC_FISHING_WORK_COST`,
`SPORT_FISHING_WORK_COST_BY_CLASS`, `SPORT_FISHING_WORK_REFUND_RATIO`,
`PROCESSING_WORK_COST`. Read the constants for the numbers; this section does
not restate them, because a second copy is what breaks them.

**Work is earned, not waited for.** Waking time does not refill the pool. The
real supply comes from four bounded sources: a night's rest at the farmhouse (a
fraction of the ceiling plus a baseline floor, exempt from the daily cap), a
crafted and eaten provision (a per-item `consumable` amount, limited by
`WORK_MEAL_DAILY_LIMIT`), a labor-shift minigame at an authored chore station
(`LABOR_STATIONS`; clean strikes grant Work and each station counts once per
day), and skill rebates on a perfect basic catch or a landed sport fish. Meals,
labor and skill all draw on one `WORK_DAILY_EARN_CAP`, so no activity can be
ground into unlimited production. One further floor exists: a slow real-time
idle trickle (`WORK_PASSIVE_REGEN_AMOUNT` every
`WORK_PASSIVE_REGEN_INTERVAL_SECONDS` real seconds) while the game runs
unpaused, clamped by the ceiling and exempt from the daily cap, so an empty pool
is never permanently stuck. Offline grants at most one rest; it does not add the
trickle. The authored farm kitchen (`struct.kitchen`) hosts the meal recipes;
the meat of the economy stays in the domains and content, not the HUD.

**Enforced by `tests/simulation/workCapacityContract.test.ts`:** the pool is
debited and credited only inside `ProgressionDomain`; every cost reaches a quote
or a spend as a named constant and never a literal; navigation, cargo, market,
quest and contract domains charge no Work; and no module re-exports a cost that
another already owns. That suite exists because prose did not hold: this
section stated the planting cost correctly while `GameApp` quoted a different
hardcoded number into the interaction prompt, so a narrow band of Work read as
affordable and the action was then refused.

**Invariants** — the part code cannot state for itself:

- Work gates manual physical production only: planting, watering, harvesting,
  fertilizing, irrigation, processing start, basic-fishing cast, sport-fishing
  hook. Traversal, boats, cargo handling, trading, quests and dialogue are free.
  Work Capacity is an economy resource and must never be reused as movement
  stamina; `player.traversal.sprintStamina` is a separate pool.
- A credit from rest, a meal, a labor shift or a skill rebate is clamped by the
  pool ceiling; the earn sources except rest are additionally clamped by the
  daily earn cap. Only `ProgressionDomain` writes the pool.
- A discrete capture source — a meal or a labor shift — checks for room for its
  **full** grant before it commits, so a limited daily resource is never spent
  for a trivial partial restore. A labor shift abandons itself if the player
  leaves the station's reach or opens a fishing encounter before the strike, and
  a station is only marked used once its Work has actually been credited.
- A failed affordability check that follows a meal or item cost must not consume
  the item for no gain: the item is removed only after the grant has room, and
  the removal is restored on a zero grant.
- An action costs its **full discounted cost** or does not happen. Partial
  payment is forbidden.
- A failed affordability check spends nothing and cannot consume items, advance
  gameplay RNG, create state, award XP, or emit success events. Where an action
  rolls before it can know its price — the sport-fishing hook — the check runs
  against the priciest fish the school could yield, so a refusal never advances
  the species RNG; the affordable path then spends the rolled fish's own class
  cost, which can only be cheaper.
- Bait, lure and chum are item costs. Work is charged on the cast or the hook,
  not on preparation.
- A lost fight refunds a share of **what the hook actually charged**, captured at
  hook time on the encounter. Re-deriving the cost at refund time paid against
  whatever discount tier the player had reached by then, which differs whenever a
  contract or quest settles mid-fight and grants XP synchronously.
- The cost quote is the single authority for prompts: base cost, discounted cost,
  floored available Work for display, shortage, affordability and estimated ready
  minute. An insufficient result uses `insufficient-work` and reports required
  Work, available Work and ready time.

**Proficiencies.** Farming, Fishing, Processing, Trading are live; Husbandry and
Boatbuilding are deferred. Rank names and thresholds live in
`src/content/progression.ts`.

The rank-unlock table advertises gates that live with the content, and for the
processing column it is also a live gate: `isProcessingRecipeUnlocked` checks a
recipe's rank in `ProcessingDomain`. That is safe to run beside
`recipe.minimumSkill` only because `ContentRegistry.validateProgressionAndEquipment`
asserts at startup that every crop, recipe and boat is advertised in exactly the
band its own gate implies, so the table cannot drift from the content. The one
column the table genuinely owns is rods: `rodFishingXpRequirement` reads a rod's
requirement back out of `fishingUnlocks`.

A rank may only list a `feature.*` id present in `LIVE_FEATURE_IDS`
(`src/content/progression.ts`), the set the simulation actually reads;
`tests/simulation/rankUnlocks.test.ts` asserts the converse, that every id in that
set has a consumer in `src/`. Read `LIVE_FEATURE_IDS`, rank rows and their
consumers directly; do not advertise an unlock merely because a name sounds
suitable. Contract-board capacity is a separate live rank/charter consequence
(§15), so an empty item-unlock row does not imply rank has no gameplay effect.

**Rods.** Willow → River → Heavy Sport → Offshore → Master, each requiring the
preceding rod owned plus a Fishing XP threshold; `src/content/rods.ts` owns the
prices and `fishingUnlocks` owns the thresholds. Offshore tackle shares the Expert
seamanship threshold with the skiff, so Act 9 requires preparation and purchase
without a second proficiency grind. Master tackle remains an optional long-tail
Records Board goal. Purchase adds and equips
atomically. Any owned rod can be re-equipped at a stall that sells tackle,
outside an active fishing encounter — the stall does not have to stock that rod,
which is what keeps the starter `rod.willow` re-equippable when it is sold
nowhere. Ownership is the gate, and because a rod cannot be bought twice, a
`purchase-upgrade` objective naming one must also be satisfiable from
`player.ownedRodIds` at load; see `reconcileSatisfiedQuestObjectives`.

# 15. Contracts, Journal & Legendary Fish

Contracts replace repeatable arbitrary fetch quests. The authored story spine and parallel linear tracks remain separate; the Live story spine section and `src/content/{quests,questTracks}.ts` own their scope and content. They use named NPCs and locations and advance through explicit `nextQuestId` links. A story objective may require completion of any feasible contract, but contract generation remains repeatable economy content and does not carry lore or choose story branches.

```ts
interface ContractTemplateDefinition {
  id: ContractTemplateId;
  type: "produce" | "fresh-fish" | "quality-target" | "bulk-order";
  requesterName: string;
  deliveryMarketId: MarketId;
  itemOrSpeciesPool: string[];
  quantityRange: [number, number];
  minQuality?: string;
  minFreshness?: number;
  minWeightKgRange?: [number, number];
  durationMinutes: number;
  rewardBaseMultiplier: number;
  rewardSkill: SkillId;
  requiredXp?: number;
  tags?: readonly string[];
}
```
Generator MUST validate feasibility, use the template-owned delivery market for readiness and completion, and preserve the produce/fishing choice rule above.

**The board serves the story.** A quest's `complete-contract` step may name one template, a contract type, or a tag (`tag:cross-channel` is carried by the orders whose goods must cross the channel); `contractObjectiveTargets` owns that mapping for both the quest dispatch and the board. When refill has a free slot and a running story step is waiting on a kind of order the board is not showing, it posts the gentlest feasible template of that kind (lowest grade, no weight floor, no strict freshness) before the produce/fishing preference. The player may also **pass on** an order with nothing yet delivered against it (`contract.pass`): the order is struck (`expired`, so no refund is due) and a replacement is posted at once, never the order just passed. An order with goods delivered against it stays until filled or expired. Act 9's grade-and-volume step, Act 6 and the Freight and Favour track used to wait on dice for up to two real hours of slot turnover. `src/content/contracts.ts` is the count authority; the board spans village produce laddered by each crop's own Farming XP gate, harbor sport-fish orders laddered by rod and cargo class, and Sunreach cove orders for the pelagics that range there.

Feasibility includes reaching the delivery market. A market at the far end of a sailing route in `WORLD_SAILING_ROUTES` (Sunreach Cove) offers orders only once the player owns that route's vessel (the Coastal Fishing Skiff); the rowboat cannot make the crossing, so an earlier cove order could only expire. `canReachDeliveryMarket` in `ContractDomain` owns the rule, and the expedition board reports a contract it blocks.

Contracts run in two lanes, not four: item delivery and physical fish cargo. `bulk-order` is an **item** lane type — `isProduceContractType` in `domainRules.ts` owns that split. It previously had no live templates because the feasibility and refund branches asked `type === "produce"` directly and routed it into the fish lane, where an item target can never match. A physical basic-catch species (Golden Sea Bream) carries an item registration only so it can be cast; board readiness and bulk-demand reporting route it through the cargo lane via `isPhysicalTradePackSpecies`, never as a satchel stack.

The board's capacity is owned by `contractSlotsForRank` in `src/content/progression.ts`. `ContractDomain` passes both Trading rank and the maritime guild charter unlock: the charter increases capacity in addition to rank progression. Refill may leave fewer listings when no feasible template exists. Wider capacity must offer useful choices without bypassing feasibility or delivery requirements.

Contract money is fixed at generation from a **rest-demand market reference**, then multiplied by the template premium. Produce reference includes the delivery market's current seasonal factor. Fish reference includes the contract's minimum quality, minimum freshness, and minimum or average weight modifiers. Live demand is deliberately excluded so accepting or rerolling during a demand spike cannot manipulate the fixed reward. If an expired partially fulfilled produce contract cannot return items because the satchel is full, its money refund uses the same rest reference rather than raw item value. A partially fulfilled **fish** contract refunds on the same reference: its delivered cargo was physically removed on delivery, so expiry compensates rather than forfeiting the kept promise.

Trail, vista, island and channel arrivals reuse journal `unlockedKnowledge` IDs from `src/content/discoveries.ts`, registered by `knowledge.ts`. An accepted simulation pose discovers each once; reloading cannot rediscover it. The Channel Seam requires arrival aboard a boat, while the three islets require landing and walking onto their discovery sites. Driftwood Cay's one-time saved-supplies cache atomically grants its registered fuel-and-chum batch; if the satchel cannot accept the full batch, neither the reward nor its discovery commits. These discoveries are not quests or progression gates.

Journal tracks species discovery, largest weight, best quality, habitat, season, time, weather, personal record, current/completed authored quest titles, and stable unlocked practice entries. Its **Notices** folio is authored community flavour from `src/content/villageBulletin.ts`, selected from already-earned quest, feature, knowledge and rank state. The same folio opens from the village-square notice board (`VILLAGE_BULLETIN`); that prop is presentation-only and adds no collider, interaction cooldown or saved state. The board pins existing earned facts as town voice; it owns no persisted state, creates no quest or objective, and gates no reward. The **People** folio is the same kind of reading for the named cast: each person's authored title and station, the recognition line the world currently uses, and a standing derived from completed commissions and earned recognition. It introduces no relationship, affinity or schedule state; §22 still defers those systems. The **Records Board** reads that same journal as a ladder of standing goals and adds no state of its own: per-ecology discovery, a weight and a grade record for every sport species, mastery for every crop, and two sweeps. Milestones are *derived* from `src/content/` rather than authored row by row, so a new species or crop brings its own record with it; `src/content/records.ts` owns only the thresholds and tiers, and a species' tier is taken from the rod it needs so the board inherits the existing difficulty axis instead of inventing one. Weight records exist only for sport species, because a basic catch never records a weight. Once every authored track is exhausted, `WorldGuidancePresentation` also supplies the nearest unearned milestones to the HUD tracker, ordered by existing progress; no quest or objective is created. It surfaces in the journal's Records folio, showing each tier's completion count and the two goals nearest to falling rather than every milestone at once. `knowledge.land_sea_cycle` is live after Quest 13; mill and compost quests grant `knowledge.wheat_milling` and `knowledge.worm_composting`. The family throughline is written one witnessed object at a time — the seed pouch, the family slip and the worn mill handle (`knowledge.family_seed_pouch`, `knowledge.family_slip`, `knowledge.worn_handle`) — and `reconcileCompletedQuestKnowledge` writes a completed errand's knowledge IDs, and nothing else, into saves that finished it before the entry existed. Journal `unlockedKnowledge` only stores IDs that exist in `knowledge.ts` (boat/feature IDs are not knowledge). Do not reveal all ecology immediately; knowledge unlock is progression. The game does not persist a dialogue transcript or a separate lore codex.

Legendary fish are later content requiring combinations of season/weather/time/special bait/minimum rod/rare school/habitat. Difficulty comes from behavior, not huge HP.

# 16. Storage & Economy

**Design target:** `Satchel → Farm Crate → Barn Storage → Warehouse → Cold Storage`. This is the intended progression, not a claim that every purchase/upgrade path ships. Live containers and transfers come from simulation definitions and domain callers; location-specific cold storage remains deferred (§22). Each promoted stage must change a capacity, preservation or timing decision.

Coherent sinks: seeds, processing equipment, boat purchase/repair, fuel, ice, lures, storage upgrades, farm upgrades. The rowboat commission supplies the first small lure batch; finite harbor tackle stock is the buy-back recovery path when a player returns without one, while the workbench recipes own renewable self-supply. The family farmhouse and starter field are inherited at new-game start; the Village Commons is public. `leaseCost` / `accessType` remain compatibility fields in saved farm state, but no private house or farming ground is sold or leased through a market and there is **no live land-lease charge**. Avoid arbitrary repeated taxes.

Starter 60–90m target: plant/harvest, worms, basic fish, grain processing, chum, first sport fishing, meaningful fish sale, clear next boat/farm upgrade. Do not hide signature fishing behind hours of grind.

Onboarding targets:
```text
0:00 garden arrival
0:01 wheat seeds
0:02 plant/water
0:04 basic fishing
0:06 common fish
0:08 farm return
0:10 wheat near maturity / harvest path
```
First-hour beats: welcome/inheritance → first harvest → self-produced bait → market sale → school spotted → sport fish landed → physical cargo decision → meaningful upgrade goal. Tutorial copy stays contextual/minimal: each explanation should answer the immediate “why this matters” question and then return control to the world.

# 17. HUD & UX

`04` §17 owns normal HUD composition and visual identity. Present clock/weather, relevant hazards/objective, Work/conditional traversal/cargo state, and one immediate action using the owning DTOs. Tool names appear briefly after a change. Work is a hard, fully funded manual-production constraint; prompts show discounted costs and blocked feedback gives the next useful action. During sport fishing, unrelated HUD yields to one compact fight readout: fish energy, one highlighted response, one qualitative tension band, contextual landing progress, and line integrity only after meaningful damage. `FishingDomain.inspectSportFishingHud` owns that presentation DTO, including the semantic response action (which may be neutral), normalized steering magnitude, rod-relative tension boundaries, landing readiness, and post-damage integrity; React renders it without importing fishing tuning or interpreting keys as mechanics. Weight, quality, distance, timer, rod-load math and simultaneous explanatory rows stay out of the active decision layer. A brief first-fight hint explains the matching rule, then leaves the world and fish as the focus. Reduced motion retains damped static two-subject framing but disables behavior biases, trauma, and terminal choreography. No permanent dashboard.

Farm UI: temporary seed-belt extension; crop stage/time, moisture, and one immediate action/cost or blocker; held field tint with an edge legend; anchored Now / +2h / +5h coast forecast. `FarmingDomain.inspect` owns the crop timing and immediate-action presentation fields, while the simulation-owned `weather.get-farm-forecast` query supplies the qualitative forecast DTO; React renders both without duplicating gameplay or forecast thresholds. Seed stock belongs to each market's `retailItemIds` in `src/content/markets.ts`; crop-owned proficiency requirements govern access. UI must not impose a separate starter-only seed list.

Market UI: ledger sections for wares, goods, ordinary fish hold, carried trade packs, and contextual contracts. A selected market ticket shows the domain quote, owned amount, plain demand signal, and one clear action; fish quotes show the ordered domain-owned breakdown. Catch-time UI never estimates value.

Boat UI: hull, applicable fuel, physical cargo-slot silhouettes, and sea warning; cargo UI MUST map to physical slots and rowboats never show fuel.

Contextual toolbar entries execute their simulation-published actions rather than assigning fixed tool meanings to numbered slots. Farming exposes hand tools, seeds, watering, fertilizer, and harvest; angling and maritime expose rod/lure preparation plus existing supplies/storage access; exploration opens the existing satchel, chart, expedition board, stores, and journal. No ration, lantern, water-reservoir, player wetness, or warmth mechanic is implied by a control or status chip when no such simulation system exists. Weather warnings remain weather information, not invented player debuffs.

Vessel slot type comes from the boat definition. The HUD's ice indicator queries the same location-based built-in and accessible loose-ice rule as cargo freshness, including empty bays; the UI must not infer hooks from slot number or reproduce preservation formulas. These are presentation contracts and do not change saved state, storage capacity, ice consumption, or freshness tuning.

Forecast: anchored, non-modal Now / +2h / +5h conditions with qualitative rain, wind, and sea readings.

Journal: Story uses `ActiveQuestDto` for the current objective, readiness and the ask as it was put (`brief`: the herald's lines while the speaker is still out of reach, otherwise the speaker's intro), Records reveal only journal-owned discoveries, Skills render `ProgressionDomain.inspectSkills`, and Guide controls come from `src/ui/keybindings.ts`. React does not reconstruct quest readiness, rank thresholds, or unlock formulas.

Quest tracker: an acquisition step (`purchase-upgrade`) publishes `ActiveQuestDto.requirements` — for the skiff its Fishing XP and gold, for a rod the prior rod, its rank threshold and price — measured against the player, so a gate reads as a path while the player can still act on it rather than only as a refusal at the counter. The tracker renders them; it does not derive them. Rod refusals at the water say which rod would do and which stalls stock it (`rodAdviceFor` in `FishingDomain`).

`WorldGuidancePresentation` derives first market, contract, storm-at-sea, spoilage, nightfall, rank, channel and sprint hints from canonical state; the existing `hintsShown` map records display, and the application waits for the current hint or modal to clear.

Player surfaces consume narrow simulation-owned presentation results rather than full `GameState`: `world.get-hud` owns clock/weather/hazard/Work/Sprint/tool/vessel/cargo readouts; `crop.get-seed-belt`, `inventory.get-satchel`, `cargo.get-hold-stores`, `world.get-map`, `journal.get-pages`, `world.get-pause`, and `expedition.get-board` own their corresponding physical interfaces. The sport-fishing HUD DTO also publishes its normalized steering magnitude. React may keep transient selection, focus, open-page, and popover state, but it does not reconstruct inventory availability, safety gates, discovered knowledge, readiness, progression, prices, or other gameplay outcomes.

Audio gameplay cues:
```text
Farming: soil, plant, water, harvest, mill
Fishing: cast, bite, reel, strain, near-snap, splash, catch, escape
Boat: engine/sail, hull, wake, dock
Weather: wind, rain, thunder
```

Dialogue gameplay cues:
```text
NPC approach: readable role/location prompt → talk → contextual intro or idle lines
Quest completion: final action → return to named speaker → completion lines → atomic reward → next objective
Act transition: completion feedback → new act/quest title → new place, verb, or capability
```

Dialogue must not compete with the action it teaches. Keep the active quest
visible behind or after the overlay, make the next destination legible, and
allow the player to close/reopen the conversation without duplicating rewards
or resetting objective progress. Completion dialogue is a consequence of a
completed simulation step, not a button that can be pressed early.

# 18. System Invariants

**Farming:** invalid placement impossible; harvest cannot duplicate; maturity from simulation; quality calculated once at harvest.

**Inventory:** atomic transactions; capacity/quantity never negative.

**Fishing:** one active encounter/player; outcome deterministic for seed + input timeline; sport fish becomes cargo.

**Transport:** one fish max per boat or carriage cargo slot; each fish exists in exactly one location. A failed transfer changes neither side.

**Market:** sale removes asset once, adds money once, uses simulation price state; a physical fish trade pack can only be sold from the player's carry location at the inland trade center, never directly from a boat hold or through the fish-market bulk lane.

**Traversal:** sprint stamina/recovery/exhaustion/grounded state is serializable and fixed-step; it is distinct from Work Capacity and must not be owned by the renderer or input layer.

**Narrative:** the active quest and objective are simulation truth; exact story
copy is content-registry data; talk range, speaker identity, target/location
predicates, rewards, and `nextQuestId` are validated by `QuestDomain`. A wrong
NPC, a remote talk, an out-of-order event, or a closed dialogue cannot advance
the story. A quest completion and its reward happen once, even if the UI is
mounted twice or the player reloads immediately afterward.

**Save:** loaded state validates and persistent IDs resolve. Current schema and
layout versions are owned solely by `01` §6.1; migrations preserve legacy Work Capacity and
crop journals, authored starter structures, docked boat positions, quest feature
unlocks, the Act 5 starter-school flag, the harbor fish-table structure,
traversal state, mount state, and equipped/owned fishing capability without
discarding the save. Read the single migration ledger there and do not copy its
current schema number or per-version history into this document.

# 19. Vertical-Slice Acceptance Gate

These checkboxes define acceptance, not current status. Evidence belongs in
`IMPLEMENTATION_STATUS_CHECKLIST.md`. A new save MUST support:
- [ ] move through starter world
- [ ] sprint/traversal state drains and recovers without affecting Work Capacity
- [ ] obtain wheat seed
- [ ] plant + water wheat
- [ ] save/quit and return after offline growth
- [ ] harvest once
- [ ] place Worm Compost and harvest bait worms
- [ ] grind grain + craft chum
- [ ] craft or pack a lure
- [ ] basic fish
- [ ] commission rowboat with the harbor permit and Ground Grain, then board it
- [ ] sail to sport-fishing area
- [ ] visually discover school
- [ ] chum school
- [ ] explicitly arm a lure and hook fish
- [ ] reel/slack/brace
- [ ] land fish
- [ ] physically carry/store fish
- [ ] freshness decays with time
- [ ] dock + sell
- [ ] price breakdown visible
- [ ] gain Fishing XP
- [ ] buy/unlock capability
- [ ] reload with all progression intact

Narrative acceptance is part of the same gate:
- [ ] fresh start presents Elspeth's Act 1 welcome dialogue in the actual dialogue overlay
- [ ] each required handoff presents the correct speaker, act/title, and contextual instruction before the next action
- [ ] each completed quest presents completion dialogue once, grants its reward once, and advances to the explicit next quest
- [ ] the Act 5 sequence presents the farm-to-sea-to-market payoff and final Silas report in the browser
- [ ] closing/reopening dialogue does not change quest state or duplicate a reward
- [ ] reload preserves active/completed quest IDs and feature unlocks without serializing a transient dialogue page
- [ ] the player can explain why farm inputs matter to fishing, why freshness matters, and why the rowboat is earned

Any missing step = incomplete vertical slice.

# 20. Balance & Anti-Patterns

Balance for decision quality, system interdependence, meaningful preparation/return trips, visible progression. Apply `03` §32's player-choice, repetition and recovery observations; an empty Work meter or failed trip must still leave a useful free action and a clear attainable next step. Do not optimize for realism, maximal grind, retention manipulation, or constant reward fireworks.

When one activity dominates, inspect in order: **market demand → preparation inputs → capacity → travel time → freshness → spawn availability → skill gate → only then base payout**. Do not immediately nerf value.

Reject:
```text
every fish everywhere
fixed market forever
infinite inventory
manual watering forever
fishing as random loot button
fish differentiated only by HP
gear progression only +%
hundreds of useless recipes
quests unrelated to economy
combat as endgame
offline auto-harvest without unlocked automation
price formulas duplicated in UI
```

# 21. Gameplay Feature Definition of Done

A feature is complete when its intended player outcome is demonstrated through
the owning domain and affected callers, without violating §18. Apply the
relevant row of `03` §4; add state, UI, rendering, tests or save handling only
where the actual feature needs them. Do not invent a layer to tick a box.

For a story-bearing change, demonstrate the person/place/action/consequence
connection, contextual feedback and a safe resume/close path. New 3D
representations use the catalog and registered generator pipeline. Visual
clarity must hold at gameplay distance; no mechanic may depend on a beauty
camera. Update this document when the rule or design scope changes and move
newly implemented requirements out of Deferred. Report remaining human or
release gates explicitly.

# 22. Deferred (not live)

This section owns deferred gameplay scope and points to the live boundary where needed. Earlier **design target** examples are also proposals, not shipped features. Promote a deferred requirement only within an explicit task, updating its owning section, implementation and relevant evidence together.

- **Produce quality vs price.** Crop quality is computed at harvest and written to the journal. It does **not** currently multiply village/harbor produce sale price (`marketPricing.ts` marginal quotes price `base × live demand × seasonal` only).
- **Unrestricted shop purchase for quest capabilities.** Seed stock/reachability is live and content-owned (§17). The pump and rowboat retain their quest-gated acquisition, while the skiff uses its harbor purchase (§11). A generic shop listing must not bypass those capability contracts.
- **Sport keep/release UI.** Landing auto-stows into a free cargo/carry slot or emits `FishEscaped`. A separate pre-landing keep/release decision is deferred. Existing post-landing cargo inspection/release is a different live action and must remain available.
- **Drought weather.** No drought enum/system is live. Existing weather effects belong to §2/§12 and their tuning owners; dry-climate content does not introduce a new weather state.
- **Authored ice location table.** §10 owns the implemented ice-resolution rule. The carried/hold/ice-box/cold-storage table is a design target, not a live per-location ice lookup.
- **External hook verb.** The skiff purchase and persisted second vessel are live, as is the crude zero-fuel Emergency Tow above. External-hook class as a distinct live verb remains deferred.
- **Branching dialogue, persistent transcripts, and separate lore codex.** The authored spine and parallel linear tracks, contextual intro/completion/idle/milestone dialogue, quest titles/objectives, completed quest history, and feature/knowledge unlocks are live. Branches, relationship variables, dialogue page saves, a transcript, and a separate `loreDiscoveries` state are not live; do not add them opportunistically.
  **Parallel quest tracks are not branching and are live.** A track is its own linear `nextQuestId` chain with its own cursor, activated by an explicit state predicate (`QuestTrackDefinition.unlock`). No quest has two possible outcomes and no dialogue offers a choice; the player simply carries more than one thread. The validator enforces this by walking one chain per track and rejecting a `nextQuestId` that crosses tracks. `src/content/questTracks.ts` owns the current track registry and unlock predicates; the Live story spine section owns the main narrative scope.
- **NPC relationships and romance.** Named NPC roles and clock-derived station schedules are live as described in §0.1. Relationship progression, romance, and large companion/story systems remain deferred.
- **Physical character ragdoll.** `HumanoidRagdoll` remains standalone support;
  the no-combat MVP does not instantiate or step a live character ragdoll in
  `PhysicsWorld`.
