# Farm & Fishing Browser Game — Gameplay Systems Implementation (Compact)

> **Role:** Canonical gameplay, balance, formulas, narrative-mechanics, state contracts, and vertical-slice authority. Requires `01_GAME_FOUNDATIONS_ARCHITECTURE.md`. Exact live content IDs and copy remain owned by `src/content/`; this document defines their gameplay/lore contract and must not become a second content database or art-budget source.

# 0. Gameplay Thesis & MVP Scope

This is one connected production economy and one connected story: **farming prepares fishing → fishing creates physical cargo → logistics determine realized value → profit unlocks operational capability**. The player's understanding of that chain is the first narrative progression. Decisions should trade immediate sale vs processing/preparation, extra catch vs freshness/weather/capacity, and market-value crops vs self-supply crops.

Do not expand content before the vertical-slice gate passes.

| Category | MVP |
|---|---|
| Crops (8) | Wheat, Barley, Corn, Tomato, Potato, Carrot, Flax, Apple Tree |
| Farm utilities | Worm Compost, Basic Fertilizer, Watering, Soil Fertility, Climate Match |
| Freshwater fish (6) | Carp, Trout, Perch, Catfish, Pike, Arowana |
| Saltwater fish (6) | Mackerel, Tuna, Sturgeon, Sailfish, Swordfish, Blue Marlin |
| Boats (2) | Rowboat, Fishing Skiff |
| Markets (2) | Village Produce Market, Harbor Fish Market |

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

The current game has eighteen explicit quests in one stable `nextQuestId`
chain. Sequences 1–10 are the accepted P12 loop; 11–13 are the focused P13
stewardship postscript; 14–18 are Act 7's Sunreach land-sea route. `src/content/quests.ts` remains the source of exact
copy, IDs, counts, costs, rewards, and objective data.

| Sequence | Quest | Story beat | Mechanical bridge and consequence | Speaker |
|---|---|---|---|---|
| 1 | `quest.act1_welcome` — **The Inherited Soil** | Elspeth welcomes the inheritor and places the family history in the soil and fields. | Talk at the Starter Garden Gate; receive wheat seeds and Farming XP. | Elspeth |
| 2 | `quest.act1_sow_wheat` — **Sowing the First Furrows** | The first act of care is deliberate planting, not passive inheritance. | Plant 3 wheat in the starter garden; unlock the watering lesson. | Elspeth |
| 3 | `quest.act1_water_crops` — **Morning Dew & Moisture** | Care is repeated and time-dependent; the land answers attention. | Water 3 planted crops; transition from tending to waiting for growth. | Elspeth |
| 4 | `quest.act2_harvest_and_compost` — **The Cycle of the Soil** | Barnaby reveals that harvest is not an endpoint: scraps and grain become future sea supplies. | Harvest 3 wheat and cultivate Bait Worms at the compost bin; earn processing knowledge. | Barnaby |
| 5 | `quest.act2_mill_and_craft_chum` — **Milling & Mixing Chum** | Farm work becomes maritime preparation through the mill and workbench. | Grind Wheat into Ground Grain and craft Chum; make the upcoming fishing trip possible. | Barnaby |
| 6 | `quest.act3_river_angler` — **Reading the Currents** | Silas teaches that Neva's water has to be read before it can be relied on. | Catch 2 freshwater fish at the river corridor; gain Fishing XP and local confidence. | Old Silas |
| 7 | `quest.act3_market_intro` — **Fair Trade at the Village** | The player's work enters the community's exchange rather than remaining private. | Sell an item at the village market; open the path toward harbor trade. | Elspeth |
| 8 | `quest.act4_harbor_journey` — **Journey to the Salt** | Maeve reframes the catch as perishable responsibility, not just a high number on a price list. | Meet Maeve at the fish market and learn freshness, demand, and return-time pressure. | Maeve |
| 9 | `quest.act4_restore_rowboat` — **Commissioning the Old Rowboat** | The family boat is a trust that must be made ready through contribution, not a free teleport to progression. | Talk to Silas with 30 G and 1 Ground Grain; consume the cost and unlock `boat.player_rowboat`. | Old Silas |
| 10 | `quest.act5_maiden_voyage` — **The Call of the Deep** | The player completes the land-to-sea-to-market practice and returns with proof of responsibility. | Board → chum → hook → land → stow → dock → sell → report; unlock `feature.expedition_planner` and the stewardship postscript. | Old Silas |
| 11 | `quest.act6_harbor_promise` — **A Promise Made at the Board** | Maeve asks the player to choose a commitment they can actually keep. | Complete any feasible active contract before its deadline; receive 150 G and 3 Fish Scraps as practical preparation. | Maeve |
| 12 | `quest.act6_field_pump` — **Water Where It Matters** | Barnaby turns contract income into durable farm capacity. | Install the 120 G field pump and irrigate the starter farm; the new capability changes future field work. | Barnaby |
| 13 | `quest.act6_land_sea_cycle` — **The Land-Sea Cycle** | The catch returns value to the soil instead of ending at sale. | Process the supplied scraps into fertilizer at the harbor fish table, fertilize the starter farm, and unlock `knowledge.land_sea_cycle`. | Barnaby |
| 14 | `quest.act7_open_channel` — **Across the Open Channel** | The skiff turns the eastern horizon into a reachable working place. | Own and board the skiff, cross the skiff-gated channel, dock at Sunreach Cove, and meet Tomas. | Tomas |
| 15 | `quest.act7_terraces_for_the_sun` — **Terraces for the Sun** | Warm, fast-drying soil rewards attentive care. | Meet Ines, plant and water three Sunflowers on the Sunreach terraces, then harvest one. | Ines |
| 16 | `quest.act7_seed_for_the_sea` — **Seed for the Sea** | The new crop connects directly back to fishing preparation. | Mill Sunflower Seed into Ground Grain and craft Chum at the Sunreach workbench. | Tomas |
| 17 | `quest.act7_reef_answer` — **The Reef's Answer** | Local ecology and physical logistics must agree. | Chum Sunreach waters, land a Golden Sea Bream, prove that catch entered the player skiff, then sell it at the cove market. | Tomas |
| 18 | `quest.act7_land_sea_cycle` — **The Sunreach Land-Sea Cycle** | The cove feeds the terrace and the terrace prepares the next voyage. | Catch a local Sardine, clean it into scraps, fertilize the terraces, and report to Ines. | Ines |

The accepted P12 spine reaches **open horizons**; the live P13 postscript then
turns that freedom into stewardship without adding a branch. It is not a claim
that every island, species, or future system is already playable. Copy such as
“the entire archipelago is open” must be understood as an invitation to the
next content horizon, not evidence that P13 content is complete.

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

The live dialogue model has four contextual sources:

- `introDialogue`: returned when the active quest's speaker is contacted and
  the quest is not ready for final turn-in; it frames the next action.
- `completionDialogue`: returned when the active quest's final objective is
  complete and the player talks to the correct speaker; the quest is completed
  atomically and rewards are granted by `QuestDomain`.
- NPC `idleDialogue`: returned when the contacted NPC is not the active quest
  speaker; it provides place/role texture without changing quest state.
- NPC `recognitionDialogue`: the latest content-authored entry whose completed
  quest, feature, and knowledge predicates match; it recognizes milestones
  without relationship state, schedules, branches, or UI-owned history.

The talk command requires the authoritative proximity check. `NpcTalked`,
`QuestStarted`, `QuestProgressed`, `QuestCompleted`, and `ActCompleted` are
signals for UI/audio/diagnostics; they are not a second narrative database.
The DOM dialogue overlay may show speaker name, role, district, line pages,
and reward summary. The HUD shows only the current title/objective and the
journal shows the current story entry plus completed quest titles. Keep the
world primary and avoid a permanent text-heavy quest dashboard.

The current representation uses content-owned string arrays and stable
knowledge-entry IDs. Do not add
branching, line-level save state, or local UI flags as a shortcut. If future
optional lore requires persistence, introduce stable content IDs and an
explicit unlock/discovery contract first. The reserved `unlockedDialogueIds`
field was removed in v29 after twenty schema versions without a reader.

## Narrative persistence boundary

Dialogue page position, open/closed modal state, and the last spoken line are
transient. Save only the simulation truth needed to resume the story:
`activeActId`, `tracks` (one `{activeQuestId, activeStepIndex, stepProgress}`
cursor per quest track), `focusedTrackId`, `completedQuestIds`, `unlockedFeatureIds`,
`journal.unlockedKnowledge`, and the currently implemented hint state. Save/load must preserve the quest chain and
capability/knowledge unlocks without replaying rewards or requiring a
conversation page to be serialized. Appending quests to an existing track needs no schema
bump because these fields store stable string IDs; adding a *track* is a
schema change, and v29 is the one that introduced them. On load, an inactive
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
5. **Acceptance:** run the narrow content/domain checks first, then the
   deterministic P12 path and the affected browser narrative route. Keep
   simulation payload evidence, modal/UI evidence, human gameplay-camera
   evidence, and release evidence as separate claims.

## Narrative improvement backlog

After P12 proves the current chain, improve lore in this order:

1. **Pay off the family throughline:** seed pouch, worn tools, homestead,
   family slip, and the final report should form a visible chain of memory;
   add only clues that the player can encounter in the existing world.
2. **Extend the live milestone recognition sparingly:** the current four NPCs
   can recognize completed quests, feature unlocks, and knowledge IDs. Add only
   lines that reflect a real state change; never infer state from UI history.
3. **Extend the live journal selectively:** `knowledge.land_sea_cycle` is the
   first concise practice entry. Add people/place/practice entries only after
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

`sampleFarmEnvironment(state, farm, x, z)` is the pure owner for the local
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

`CropQuality` ends at `prize`; `FishQuality` ends at `trophy`. They are separate typed contracts even though their lower tiers share names. The v4 save migration converts legacy crop `trophy` journal values to `prize`; fish journal values remain `trophy`. Work affordability is validated before quality RNG advances. A fully funded action uses the normal quality calculation; an unfunded action produces no roll or mutation.

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
Harvest reduces fertility (floor **10**). `farm.apply-fertilizer` restores **+20** fertility, clamps **10–100**, and consumes `item.basic_fertilizer`. Applying onto already-100 fertility is a no-op success (`FarmFertilized`, no item spent) so Quest 13 can complete. Desired circularity: `fish scraps → fertilizer → better crops → grain → chum → fishing`.

`moistureRetention` (0–1) slows dry-out: `moistureChangePerHour` scales drought by `1 - retention * 0.5`. Rain still restores full moisture.

Worm Compost MVP: **360 game-minute maturation**, **20–30 bait worms**, one harvest. Initial recipe: `Plant Matter + Compost Starter → Worm Compost`. Village sells `item.compost_starter` as a finite paid refill. Never provide infinite starter bait from a permanent object.

Apple Tree / orchards: on a **successful harvest**, a `regrows` crop persists, **resets health to 100**, and sets `effectiveGrowthMinutes` from `cropDef.regrowMinutes` (not `baseGrowthMinutes * 0.5`), returning stage `"growing"` so seeded/sprout are skipped. Orchards never wither from growth. A withered plot can be cleared (`crop.harvest`) with no XP or produce.

# 4. Farming Progression

Shared ranks/XP:
```text
0 Novice | 1,000 Apprentice | 3,000 Skilled | 7,500 Expert
15,000 Master | 30,000 Artisan | 60,000 Famed | 100,000 Legendary
```
XP sources: planting, successful harvest, crop care, farm contracts, advanced farm processing. Prevent repeat-plant/uproot and cheap reversible XP exploits.

LIVE crop gates are `crop.minimumFarmingXp` (and a few `recipe.minimumSkill` values). Rank unlock tables (`farmingUnlocks`, `fishingUnlocks`, `tradingUnlocks`, `processingUnlocks`) exist in content data but are **unused** — see Deferred.

# 5. Inventory & Processing

```ts
interface InventoryState { id: InventoryId; slotCount: number; slots: InventorySlot[]; }
interface InventorySlot { itemId?: ItemId; quantity?: number; }
```
Rules: finite slots, defined stack limits, atomic transactions, no silent item loss. Any transaction validates inputs/output capacity first, then mutates once; failure leaves state unchanged.

MVP stations: `Hand Mill`, `Workbench`, harbor **Fish Cleaning Table** at `HARBOR_FISH_TABLE` (`struct.harbor_fish_table`, `stationType: "fish-table"`). New-game station `y` is terrain height.
```ts
interface ProcessingJobState {
  id: ProcessingJobId;
  recipeId: RecipeId;
  stationId: StructureId;
  startedAtMinute: GameMinute;
  completesAtMinute: GameMinute;
  status: "active" | "complete" | "collected";
}

interface RecipeDefinition {
  id: RecipeId;
  stationType: StationType;
  inputs: ItemStack[];
  outputs: ItemStack[];
  durationMinutes: number;
  minimumSkill?: { skill: SkillId; xp: number };
  tags: string[];
}
```
LIVE recipes (11 — `src/content/recipes.ts` is the count authority):
```text
Wheat → Ground Grain                 (hand-mill)
Barley → Ground Grain                (hand-mill)
Ground Grain + Bait Worms → Chum     (workbench)
Flax + Fish Scraps → Feather Lure    (workbench; minimumSkill processing 500)
Fish Scraps → Basic Fertilizer       (fish-table)
Plant Matter + Compost Starter → Worms (compost-bin)
Perch → Fish Scraps                  (fish-table)
Mackerel → Fish Scraps               (fish-table)
Carp → Fish Scraps                   (fish-table)
Sunflower Seed → Ground Grain        (hand-mill)
Sardine → Fish Scraps                (fish-table)
```
`recipe.fish_to_fertilizer`, `recipe.perch_to_scraps`, `recipe.mackerel_to_scraps`, and `recipe.carp_to_scraps` require `stationType: "fish-table"`. Every recipe should support the core loop.

# 6. Basic Fishing

Purpose: engaging early and accessible fishing loop, Fishing XP, common fish/ingredients, low-risk income, and bait utility. Requires rod + valid water (Bait Worms optional: wait time cut ~40% **and** rarity weights biased toward rarer species before `rng.weighted`). Fishing supplies resolve from the satchel and then the active vessel during play, or the explicitly selected vessel in expedition planning; remote unselected vessel inventories are not accessible. A crafted lure must be explicitly armed before casting, is consumed only after a valid paid cast begins, and improves that cast's hook reliability. Wait is also multiplied by authored weather and time-of-day modifiers in `FishingTuning`.

### 6.1 State Machine & 5 Phases
`Idle → Charging-Cast → Waiting-Bite → Bite-Reaction → Minigame → Caught|Escaped → Idle`

1. **Charging-Cast**: Holding action key charges casting power meter ($0.0 \rightarrow 1.0 \rightarrow 0.0$). Releasing casts bobber ($3\text{m} - 12\text{m}$). Deeper casts lower bite wait times, reduce trash odds, and boost high quality tiers.
2. **Waiting-Bite**: Bobber floats in 3D water. Wait time influenced by bait (`item.bait_worms` cuts wait by ~40%), cast depth, weather, and time of day.
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
Sport fishing requires an active chummed school, a compatible rod, no conflicting mode, a non-expired school, and at least one species that both the equipped rod and the current carry/active-vessel capacity can accept. Species that exceed the rod's `maximumCargoClass`, fail its minimum class, or cannot be stowed are filtered before the species RNG draw. Landing remains automatic; there is no keep/release decision UI. A lure is optional, must be explicitly armed, is consumed only after a valid paid hook succeeds, and makes the resulting fight modestly more forgiving without changing quality or minimum tells.

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
Spawn inputs: ecology, habitat, season, time, weather, world seed, recent pressure, cooldown. Cooldown begins when a school depletes or expires, not when it originally spawned; recent landed catches extend the bounded per-habitat cooldown and decay over time. Each new school deterministically rotates among small authored offsets that remain inside its registered ecology/habitat. Presentation binds weighted species models, a frenzy gull, surface splashes, and occasional jumps to the actual school; fish finders later improve detection.

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

Landing requires:
```text
stamina <= landingThreshold
AND distanceMeters <= landingDistance
AND lineTension within valid range
AND the valid range is held continuously for 0.55 seconds
```
On land: auto-stow into a free hold/hook/player-carry slot, or `FishEscaped` if no space — a won fight with a failed stow does **not** consume the school. A successful stow commits school catch potential/pressure before `FishLanded`, so event-driven autosaves observe the cargo and its consumed school catch as one outcome. Hook will not roll a species the current hold/carry cannot fit. `SCHOOL_SPAWN_POINTS` covers every sport habitat — river, lake, coast and offshore on Neva, coast and offshore on Sunreach — and `tests/simulation/seasonalAvailability.test.ts` asserts none of them is empty in any season. The river point sits on the charted Silverwater access so the water Act 3 teaches stays a sport ground; `fish.tuna` and `fish.sailfish` range into `ecology.sunreach` as migratory pelagics, which is why the island's two points no longer roll a single species. Reef and river residents stay local to their island. Do not implement combat-style HP defeat.

```ts
interface FishBehaviorProfile {
  id: FishBehaviorProfileId;
  baseStamina: number;
  behaviorWeights: Record<FishBehavior, number>;
  minBehaviorDuration: number;
  maxBehaviorDuration: number;
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
The encounter owns coupled line extension, rod-blank load, retrieval/payout, fish effort, inertia, heading/depth response and fatigue. `FishingTuning` owns shared constants and the single species-aware depth-bound helper used by both motion and save validation; authored profiles own species strength, timing, movement and behavior weights. Reel attempts stall under load and restrict automatic drag; yield overrides retrieval; lifting stores up to 1.25 normalized rod load and deliberately weakens simultaneous winding. Releasing the lift while winding returns the stored load as retrieval, especially during recovery. Rod direction responds gradually. Persistent head shakes ring tension and consume line integrity; bracing reduces the shake component but can still overload the rod. Hook-time `seaRoughness` adds a bounded deterministic drive modifier, and a prepared-lure snapshot reduces drive/shake pressure; neither changes behavior duration or the minimum tell/recovery clocks. The fish endpoint and the full angler-to-fish reach must remain on one continuous water path after the permitted short shoreline lead; a fish cannot run behind an island while the taut line cuts across land. Rest can recover limited stamina; line damage does not heal during the fight. Landing requires at least 12 normalized tension and less than the equipped rod's safe limit, alongside the fatigue/distance thresholds and sustained 0.55-second hold. Save/reload preserves the exact accumulated landing hold and never manufactures completion merely because the fish is inside the landing window.

Schema v19 introduced `FishingEncounterState.dynamics`, including position/velocity components, spool length, response state, behavior timing, a private seeded RNG state and the 60 Hz step remainder. Schema v28 backfills absent rod-load, fish-speed, head-shake, and landing-hold values, begins validating every dynamics field, and adds tackle/sea-condition snapshots while preserving every already-persisted fight value exactly. Unreachable pre-v24 distances may shorten to a continuous water reach only in their owning migration. Presentation consumes the encounter through one shared sample; it cannot move fish to manufacture camera readability or decide outcomes. Its transient terminal bridge is driven only by `FishLanded` or `FishEscaped` and distinguishes landed, escaped, snapped, and failed-stow feedback without serializing presentation state; both terminal events fire only after the active encounter is cleared, so their autosave cannot resurrect a resolved fight.

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

```ts
interface FishCargoState {
  id: FishCargoId;
  speciesId: FishSpeciesId;
  weightKg: number;
  quality: FishQuality;
  caughtAtMinute: GameMinute;
  freshness: number;
  cargoClass: "small" | "medium" | "large" | "gargantuan";
  location: PlayerCarryLocation | BoatCargoLocation | ColdStorageLocation;
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
  unlockRequirement?: ProgressionRequirement;
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

Fishing Skiff: LIVE acquisition at the authored harbor skiff mooring requires **6,000 Fishing XP and 850 G**. The atomic purchase creates the persisted `boat.player_skiff`, its eight-slot supply inventory, four internal medium cargo slots, two **external gargantuan hooks** (needed to stow blue marlin; do not nerf marlin to large), fuel tank, and better rough-water tolerance. `item.boat_fuel` is sold at the harbor; `boat.refuel` (dock, nearby, or aboard) consumes one can and fills `fuel` to `fuelCapacity`. A fresh save does not create a skiff; it remains a progression-world asset until purchased.

The Neva–Sunreach sailing centerline and both moorings are world registries.
The open-channel exposure gate is physical navigation: a rowboat is stopped at
the safe-side edge, speed is cleared, and one contextual notice names the
Coastal Fishing Skiff requirement. The skiff may cross. This is not a UI-only
lock or a teleporter; fuel and return-route feasibility remain ordinary boat
economy constraints.

Boat entry and exit remain presentation over simulation-owned transactions. The rowboat uses a pelvis-contact marker on its physical bench, while the chairless skiff uses a root-aligned standing driver station with planted deck support. Rowboat/skiff boarding and docking variants may preserve the player's initial world pose, follow the moving craft, and converge to those anchors, but they do not change boat state, controls, or persistence.

Emergency Tow / hook-class gameplay is **not live** — see Deferred.

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

## 11B. Mounts (LIVE)

Mounts are a **traversal capability**, not a vehicle economy and not a second
boat. The starter pack donkey exists from a fresh save; there is no mount
purchase, breeding, feeding, durability, stabling, or mount cargo system, and
none may be added without an explicit task.

```ts
interface MountState {
  id: MountId;                 // "mount.donkey_starter"
  mountTypeId: MountTypeId;    // "mount.donkey"
  x: number; y: number; z: number;
  rotationY: number;
}
```

`GameState.mounts` is a keyed record; `player.activeMountId` is the single
authority for whether the player is riding. `"mounted"` is an explicit
`GameplayMode`. Schema v18 persists both (see `01` §6.1).

Contract:

- **Board / dismount** are the `mount.board` and `mount.dismount` commands,
  owned by `NavigationDomain`. Boarding requires the player within
  `boardRadiusMeters` of a valid mount pose on mountable ground; dismount
  resolves to a cleared adjacent pose. A pose that is not on valid ground, or a
  frame that reports both an active boat and an active mount, is rejected.
- **Mounted traversal is free.** Riding costs no Work and awards no XP. Sprint
  while mounted is the trot speed, not a separate resource.
- **Mounting suspends manual production.** Planting, crop tending, harvest,
  fertilizing, processing stations, fish-cargo handling, and both fishing modes
  refuse while `activeMountId` is set, with a `Dismount before …` reason. This
  is the intended boundary: the mount moves you between work sites, it does not
  let you work from the saddle.
- **`MOUNT_TUNING` in `src/simulation/mounts/Mounts.ts` is the tuning owner** for
  walk/trot speed, acceleration, pose offsets, board radius, ground tolerance,
  and maximum mountable slope. Do not scatter those numbers into presentation,
  input, or physics code.
- The live donkey walk matches sustained on-foot walking and the trot is a
  faster travel tier. Riding does not drain sprint stamina, so mounted travel
  remains the sustained-travel advantage without forcing either gait beyond
  the authored leg reach.
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

Deferred for mounts: purchase/ownership progression, mount inventory or cargo,
stamina, feeding, additional species, and mounted interaction verbs.

# 12. Weather & Sea Risk

```ts
interface WeatherSnapshot {
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
`MarketDomain` derives wares from the three content-owned market definitions
rather than hardcoded village/harbor arrays.
Contracts refill from existing templates with at most two active listings and
honor `requiredXp`. Refill first preserves an attainable produce listing and,
after rowboat access, an attainable fishing listing when eligible content
exists. `MarketDomain.inspectExpeditionBoard()` presents a steady and a bold
route from those contracts or its scoped produce/sport-fish demand signals,
with blockers for deadline, tackle, chum, ice, rough water, and cargo space.
The UI does not reproduce pricing, demand, or feasibility formulas.

Sea risk:
```text
riskScore = weatherSeaRoughness × boatVulnerability × offshoreDistanceFactor
```
Effects: slower control, greater repair probability, harder fishing, warnings. Sport fishing snapshots weather type and `seaRoughness` at hook time, then applies a bounded deterministic pressure modifier without shortening minimum tells or changing the condition mid-fight. Avoid arbitrary instant destruction.

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

Demand clamp: **0.65x–1.60x** (UI may show 65–160%).

```text
producePrice = basePrice × demandModifier × seasonalModifier
fishPrice = speciesBasePrice × weightModifier × qualityModifier × freshnessModifier × demandModifier × seasonalModifier
```
LIVE: produce **quality does not affect sale price** (quality is computed and journaled only). Fish quality **does** affect price. Example Blue Marlin: `140 × 1.35 × 1.10 × 0.95 × 1.25 × 1.05 ≈ 259`. UI must explain components.

Selling raises local supply; repeated dumping gradually lowers price, while town throughput restores it toward the centered market. Never crash price dramatically from one ordinary sale. Single and bulk trades are priced as the exact sum of deterministic one-unit marginal fills, including across clamp boundaries, so one bulk fill and the same sequence of one-unit fills pay the same total. Trading XP is derived from total realized revenue with no per-click minimum.

Buys are capped at `floor(localSupply)`, reduce stall supply, and use a **1.25 retail multiplier** over wholesale. For a commodity sold at more than one market, the retail quote also floors its effective modifier at the best current wholesale modifier across those markets; an immediate cross-market round trip cannot profit even when demand differs. `MarketDomain.inspectFish` / `sellFish` return `FishPriceBreakdown`; UI must not call `calculateFishPrice`.

`MarketDomain` owns the `market.get-board`, `market.quote-sale`, `market.quote-purchase`, `expedition.get-board`, affordability, demand-signal, fish-breakdown, and bulk-sale presentation queries. The market and expedition DTOs contain wares, owned goods, fish valuations, rod gates, contract readiness/blockers, scoped opportunity demand, affordability, stock, and one plain demand signal; React renders them and does not import economy formulas, inventory operations, market-domain constants, or rod progression tables. Sell-all produce and sell-all fish validate the full quote first and then commit as one atomic domain transaction; UI must never loop single-item callbacks or present a partially completed bulk sale.

# 14. Work Capacity & Proficiencies

```ts
interface WorkCapacityState {
  current: number;
  maximum: number;
  regeneratedAtMinute: GameMinute;
}
```
Work is a deliberate hard resource for manual physical production. Planting, watering, harvesting, fertilizing, irrigation, processing start, basic-fishing cast, and sport-fishing hook require their **full discounted cost**. A failed affordability check spends nothing and cannot consume items, advance gameplay RNG, create state, award XP, or emit success events. Work recovers at 200 per in-game hour while playing and 100 per in-game hour through bounded offline progression, capped at 1,000. Proficiency reduces the relevant action cost by 5% per rank, capped at 35%. Traversal, boats, cargo handling, trading, quests, and dialogue do not cost Work.

Base Work costs are: plant 10, water 5, harvest 45, fertilize 8, irrigate 8, processing-job start 35, basic-fishing cast 15, and sport-fishing hook by the school's worst possible cargo class: small 18 / medium 28 / large 36 / gargantuan 44. The worst-case discounted quote is checked before the species roll; an unaffordable attempt spends nothing and advances no gameplay RNG, while an affordable attempt spends the rolled fish's actual class cost. Bait, lure, and chum remain item costs; Work is charged only on the actual cast or hook. If a hooked fish escapes, snaps the line, or cannot be stowed after a won fight, 60% of the discounted hook cost is refunded.

The single cost authority returns base cost, discounted cost, floored available Work for display, shortage, affordability, and the estimated in-game ready minute. Action prompts show the discounted Work cost. An insufficient result uses `insufficient-work` and reports required Work, available Work, and ready time. Partial payment is forbidden.

MVP proficiencies: Farming, Fishing, Processing, Trading. Later: Husbandry, Boatbuilding. Shared ranks: Novice → Apprentice → Skilled → Expert → Master → Artisan → Famed → Legendary.

The rank-unlock table is an **advertisement of live gates, not a second gate**. `crop.minimumFarmingXp`, `recipe.minimumSkill` and `boat.requiredSkillXp` own their own requirements; `ContentRegistry.validateProgressionAndEquipment` asserts at startup that every crop, recipe and boat is advertised in exactly the band its own gate implies, and that every crop and recipe appears somewhere, so the table cannot drift from the content. The one column the table genuinely owns is rods: `rodFishingXpRequirement` reads a rod's requirement back out of `fishingUnlocks`.

A rank may only list a `feature.*` id present in `LIVE_FEATURE_IDS` (`src/content/progression.ts`), which is the set the simulation actually reads; `tests/simulation/rankUnlocks.test.ts` asserts the converse, that every id in that set has a consumer in `src/`. Both live features — `feature.expedition_planner` and `feature.irrigation_zone` — are granted by quests, so neither appears in a rank. Ranks 5 and 7 currently advertise nothing, and rank 6 only `rod.master`: that is the honest state of high-proficiency play and is content work to fill, not a table edit.

Rod progression is live at the harbor: Willow → River → Heavy Sport → Offshore → Master, requiring the preceding owned rod plus Fishing XP thresholds 1,000 / 3,000 / 15,000 / 60,000. Purchase prices are 120 / 380 / 950 / 2,500 G; purchase adds and equips atomically. Any owned rod can be re-equipped at a stall that sells tackle, outside an active fishing encounter — the stall does not have to stock that rod, which is what keeps the starter `rod.willow` re-equippable when it is sold nowhere.

# 15. Contracts, Journal & Legendary Fish

Contracts replace repeatable arbitrary fetch quests. The authored story chain remains separate: its eighteen quests teach the connected farm-to-sea loop, stewardship postscript, and Sunreach extension, use named NPCs and locations, and advance through explicit `nextQuestId` links. A story objective may require completion of any feasible contract, but contract generation remains repeatable economy content and does not carry lore or choose story branches.

```ts
interface ContractTemplate {
  id: ContractTemplateId;
  type: ContractType;
  requesterId: string;
  deliveryMarketId: MarketId;
  itemOrSpeciesPool: string[];
  quantityRange: [number, number];
  qualityRequirement?: string;
  freshnessRequirement?: number;
  weightRequirementKg?: number;
  durationMinutes: number;
  rewardFormulaId: string;
  progressionGate?: ProgressionRequirement;
}
```
Generator MUST validate feasibility, use the template-owned delivery market for readiness and completion, and preserve the produce/fishing choice rule above. The seven live templates in `src/content/contracts.ts` include an olive delivery from Sunreach to Neva village and a fresh reef-fish order delivered at Sunreach Cove.

Contract money is fixed at generation from a **rest-demand market reference**, then multiplied by the template premium. Produce reference includes the delivery market's current seasonal factor. Fish reference includes the contract's minimum quality, minimum freshness, and minimum or average weight modifiers. Live demand is deliberately excluded so accepting or rerolling during a demand spike cannot manipulate the fixed reward. If an expired partially fulfilled produce contract cannot return items because the satchel is full, its money refund uses the same rest reference rather than raw item value.

Journal tracks species discovery, largest weight, best quality, habitat, season, time, weather, personal record, current/completed authored quest titles, and stable unlocked practice entries. `knowledge.land_sea_cycle` is live after Quest 13; mill and compost quests grant `knowledge.wheat_milling` and `knowledge.worm_composting`. Journal `unlockedKnowledge` only stores IDs that exist in `knowledge.ts` (boat/feature IDs are not knowledge). Do not reveal all ecology immediately; knowledge unlock is progression. The game does not persist a dialogue transcript or a separate lore codex.

Legendary fish are later content requiring combinations of season/weather/time/special bait/minimum rod/rare school/habitat. Difficulty comes from behavior, not huge HP.

# 16. Storage & Economy

Storage progression: `Satchel → Farm Crate → Barn Storage → Warehouse → Cold Storage`. Each changes decisions; cold storage enables delaying fish sale for demand but is constrained by cost/capacity.

Coherent sinks: seeds, processing equipment, boat purchase/repair, fuel, ice, lures, storage upgrades, farm upgrades. Homestead `leaseCost` / `accessType` are unused — both starter garden and homestead stay plantable on day 1; there is **no live land-lease charge**. Avoid arbitrary repeated taxes.

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

Persistent normal HUD: compact clock/weather/gold top-right, severe hazards plus one slim objective top-left, Work/conditional Sprint/cargo or vessel status bottom-left, and one verb-first prompt with a 5-slot tool belt bottom-center. Tool names appear briefly after a change. Work is a hard, fully funded manual-production constraint; prompts show discounted costs and blocked feedback gives the next useful action. During sport fishing, unrelated HUD yields to one compact fight readout: fish energy, one highlighted response, one qualitative tension band, contextual landing progress, and line integrity only after meaningful damage. `FishingDomain.inspectSportFishingHud` owns that presentation DTO, including the semantic response action (which may be neutral), normalized steering magnitude, rod-relative tension boundaries, landing readiness, and post-damage integrity; React renders it without importing fishing tuning or interpreting keys as mechanics. Weight, quality, distance, timer, rod-load math and simultaneous explanatory rows stay out of the active decision layer. A brief first-fight hint explains the matching rule, then leaves the world and fish as the focus. Reduced motion retains damped static two-subject framing but disables behavior biases, trauma, and terminal choreography. No permanent dashboard.

Farm UI: temporary seed-belt extension; crop stage/time, moisture, and one immediate action/cost or blocker; held field tint with an edge legend; anchored Now / +2h / +5h coast forecast. `FarmingDomain.inspect` owns the crop timing and immediate-action presentation fields, while the simulation-owned `weather.get-farm-forecast` query supplies the qualitative forecast DTO; React renders both without duplicating gameplay or forecast thresholds. Village produce stall **currently sells wheat / tomato / potato seed only** (LIVE).

Market UI: ledger sections for wares, goods, fish hold, and contextual contracts. A selected market ticket shows the domain quote, owned amount, plain demand signal, and one clear action; fish quotes show the ordered domain-owned breakdown. Catch-time UI never estimates value.

Boat UI: hull, applicable fuel, physical cargo-slot silhouettes, and sea warning; cargo UI MUST map to physical slots and rowboats never show fuel.

Forecast: anchored, non-modal Now / +2h / +5h conditions with qualitative rain, wind, and sea readings.

Journal: Story uses `ActiveQuestDto` for the current objective and readiness, Records reveal only journal-owned discoveries, Skills render `ProgressionDomain.inspectSkills`, and Guide controls come from `src/ui/keybindings.ts`. React does not reconstruct quest readiness, rank thresholds, or unlock formulas.

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

**Boat:** one fish max per cargo slot; each fish exists in exactly one location.

**Market:** sale removes asset once, adds money once, uses simulation price state.

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

A new save MUST support:
- [ ] move through starter world
- [ ] sprint/traversal state drains and recovers without affecting Work Capacity
- [ ] obtain wheat seed
- [ ] plant + water wheat
- [ ] save/quit and return after offline growth
- [ ] harvest once
- [ ] place Worm Compost and harvest bait worms
- [ ] grind grain + craft chum
- [ ] basic fish
- [ ] commission rowboat with the harbor permit and Ground Grain, then board it
- [ ] sail to sport-fishing area
- [ ] visually discover school
- [ ] chum school
- [ ] hook fish
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

Balance for decision quality, system interdependence, meaningful preparation/return trips, visible progression. Do not optimize for realism, maximal grind, retention manipulation, or constant reward fireworks.

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

Every feature requires:
- [ ] data definition
- [ ] simulation state
- [ ] pure calculations where appropriate
- [ ] deterministic tests
- [ ] save/load support
- [ ] debug visibility
- [ ] UI communication
- [ ] renderer representation
- [ ] if story-bearing: a person/place/action/consequence connection, contextual dialogue or journal feedback, and a tested resume/close path
- [ ] any new generated 3D representation is added through the single schema/catalog/registered-family-generator pipeline; shared `common/authored.py` construction helpers may support the family generator but never become a second pipeline, and catalog IDs/nodes remain presentation metadata rather than simulation state
- [ ] user-facing visual changes pass actual-gameplay-camera review against `04` + Art Pipeline; no gameplay mechanic depends on beauty-camera-only presentation
- [ ] failure handling
- [ ] no invariant broken
- [ ] user-facing E2E path updated
- [ ] this document's owning section is updated in the same change when the feature alters a documented rule, cost, gate, tier, count, or Deferred entry (see the documentation contract in root `AGENTS.md`)

# 22. Deferred (not live)

The preceding sections are the **LIVE** implementation authority. The items below are authored design or content tables that exist in files but are **not implemented as gameplay gates / systems**. Do not treat them as live. Do not implement them opportunistically without an explicit task.

- **Produce quality vs price.** Crop quality is computed at harvest and written to the journal. It does **not** currently multiply village/harbor produce sale price (`calculateCommodityUnitPrice` is `base × demand × seasonal` only).
- **Purchase gates that are not shop verbs.** Every crop's seed is now stocked somewhere — the village stall carries eight and the Sunreach cove stall the two warm-dry crops — so `crop.minimumFarmingXp` is the only thing pacing seed access; `tests/simulation/contentReachability.test.ts` asserts that across all markets. Still not open shop verbs: the irrigation pump (`farm.buy-irrigation` is gated on Quest 12, `quest.act6_field_pump`, and an already-owned pump auto-completes that install step) and the rowboat (commissioned through Act 4 for 30 G + Ground Grain). The fishing skiff is purchased at its harbor mooring against the live XP and money requirement.
- **Sport keep/release UI.** Landing auto-stows into a free cargo/carry slot or emits `FishEscaped`. No keep/release decision. Player-carry can be inspected from the HUD cargo pill.
- **Drought weather.** The weather enum has **no** `drought`. Growth weather buffs are `light-rain`, `heavy-rain`, and `storm` at **1.05**; other types are 1.00. Storm restores crop moisture like heavy rain.
- **Authored ice location table.** LIVE ice is a slot `hasIce` flag or `item.crushed_ice` in satchel / boat supply, which forces storage modifier **0.4** wherever that ice resolves. The carried/hold/ice-box/cold-storage table is the design target, not a live per-location ice lookup.
- **Mandatory sport lure gate.** A lure is **not** required to hook a chummed school. Explicit preparation, successful-hook consumption, and fight forgiveness are live; making lure possession mandatory remains deferred.
- **External hook verb and Emergency Tow.** The skiff purchase and persisted second vessel are live. External-hook class as a distinct live verb and zero-fuel Emergency Tow are not live.
- **Branching dialogue, persistent transcripts, and separate lore codex.** The eighteen-quest chain, contextual intro/completion/idle/milestone dialogue, quest titles/objectives, completed quest history, and feature/knowledge unlocks are live. Branches, relationship variables, dialogue page saves, a transcript, and a separate `loreDiscoveries` state are not live; do not add them opportunistically.
  **Parallel quest tracks are not branching and remain in scope.** A track is its own linear `nextQuestId` chain with its own cursor, activated by an explicit state predicate (`QuestTrackDefinition.unlock`). No quest has two possible outcomes and no dialogue offers a choice; the player simply carries more than one thread. The validator enforces this by walking one chain per track and rejecting a `nextQuestId` that crosses tracks. Only `track.main` currently exists.
- **NPC schedules and romance.** Named NPC roles and fixed authored anchors are live. Daily schedules, relationship progression, romance, and large companion/story systems remain out of scope for the MVP.
- **Physical character ragdoll.** `HumanoidRagdoll` remains standalone support;
  the no-combat MVP does not instantiate or step a live character ragdoll in
  `PhysicsWorld`.
