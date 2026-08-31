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

The current MVP has ten explicit quests in a stable `nextQuestId` chain. This
table is the narrative contract for the P12 loop; the code in
`src/content/quests.ts` remains the source of exact copy and objective data.

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
| 10 | `quest.act5_maiden_voyage` — **The Call of the Deep** | The player completes the land-to-sea-to-market practice and returns with proof of responsibility. | Board → chum → hook → land → stow → dock → sell → report; unlock `feature.expedition_planner` and the epilogue state. | Old Silas |

The story deliberately ends this MVP on **open horizons**, not on a claim that
every island, species, or future system is already playable. Copy such as
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

The live dialogue model has three contextual sources:

- `introDialogue`: returned when the active quest's speaker is contacted and
  the quest is not ready for final turn-in; it frames the next action.
- `completionDialogue`: returned when the active quest's final objective is
  complete and the player talks to the correct speaker; the quest is completed
  atomically and rewards are granted by `QuestDomain`.
- NPC `idleDialogue`: returned when the contacted NPC is not the active quest
  speaker; it provides place/role texture without changing quest state.

The talk command requires the authoritative proximity check. `NpcTalked`,
`QuestStarted`, `QuestProgressed`, `QuestCompleted`, and `ActCompleted` are
signals for UI/audio/diagnostics; they are not a second narrative database.
The DOM dialogue overlay may show speaker name, role, district, line pages,
and reward summary. The HUD shows only the current title/objective and the
journal shows the current story entry plus completed quest titles. Keep the
world primary and avoid a permanent text-heavy quest dashboard.

The current representation uses content-owned string arrays. Do not add
branching, line-level save state, or local UI flags as a shortcut. If future
optional lore requires persistence, introduce stable content IDs and an
explicit unlock/discovery contract first; `unlockedDialogueIds` is reserved,
not live functionality.

## Narrative persistence boundary

Dialogue page position, open/closed modal state, and the last spoken line are
transient. Save only the simulation truth needed to resume the story:
`activeActId`, `activeQuestId`, `activeStepIndex`, `stepProgress`,
`completedQuestIds`, `unlockedFeatureIds`, and the currently implemented hint
state. Save/load must preserve the quest chain and capability unlocks without
replaying rewards or requiring a conversation page to be serialized. Any new
story discovery field is a save-sensitive change and requires the schema,
migration, historical fixture, and migration test protocol from `01`.

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

## Narrative improvement backlog (not yet live)

After P12 proves the current chain, improve lore in this order:

1. **Pay off the family throughline:** seed pouch, worn tools, homestead,
   family slip, and the final report should form a visible chain of memory;
   add only clues that the player can encounter in the existing world.
2. **Give NPCs stateful recognition:** vary a small number of post-milestone
   lines after explicit quest completions. Use stable unlock IDs and tests;
   never infer dialogue state from array position or UI history.
3. **Make the journal a useful story record:** add concise people/places/
   practices entries unlocked by witnessed events, while keeping formulas and
   quest authority in simulation. Do not turn it into a lore encyclopedia.
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

Default normalized stages:
```text
0.00–0.10 seeded
0.10–0.35 sprout
0.35–1.00 growing
1.00–1.30 mature
1.30–1.60 overripe
>1.60     withered
```
Override per crop only when necessary.

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
These are starting values, not sacred final numbers.

# 3. Water, Soil, Compost & Orchards

Moisture starts on `0–100`. Watering restores substantial moisture; rain restores moisture; late irrigation reduces repeated manual Work. Do not require constant re-clicking or let watering dominate play.

```ts
interface SoilState {
  fertility: number;
  moistureRetention: number;
}
```
Harvest reduces fertility (floor **10**). `farm.apply-fertilizer` restores **+20** fertility, clamps **10–100**, and consumes `item.basic_fertilizer`. Desired circularity: `fish scraps → fertilizer → better crops → grain → chum → fishing`.

Worm Compost MVP: **360 game-minute maturation**, **20–30 bait worms**, one harvest. Initial recipe: `Plant Matter + Compost Starter → Worm Compost`. Village sells `item.compost_starter` as a finite paid refill. Never provide infinite starter bait from a permanent object.

Apple Tree / orchards: on a **successful harvest**, a `regrows` crop persists and resets onto its regrow timer (`sapling → mature → fruit ready → harvest → regrowth timer → fruit ready`). Intended: **regrow crops never wither-delete** (wither-delete of orchard trees is a parallel fix; do not document wither-delete as live orchard behavior). Tree chopping is later unless explicitly included.

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
LIVE recipes (9 — `src/content/recipes.ts` is the count authority):
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
```
`recipe.fish_to_fertilizer`, `recipe.perch_to_scraps`, `recipe.mackerel_to_scraps`, and `recipe.carp_to_scraps` require `stationType: "fish-table"`. Every recipe should support the core loop.

# 6. Basic Fishing

Purpose: engaging early and accessible fishing loop, Fishing XP, common fish/ingredients, low-risk income, and bait utility. Requires rod + valid water (Bait Worms optional for faster bite and higher rarity).

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
5. **Catch Summary**: Displays caught fish, quality stars, weight, Perfect bonus, and treasure loot; atomically commits items to inventory.

Missed bite window = **miss** (session cleared; reason `"missed"`). `willCatch` defaults **false** until the rod's hook roll.

Basic-fishing **blocks inventory**. Sport-fishing MUST block inventory the same way.

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
Sport fishing requires an active chummed school, a compatible rod, no conflicting mode, and a non-expired school. A lure is **not** required to hook (see Deferred). Cargo space is not required to hook; landing auto-stows into a free cargo/carry slot or emits `FishEscaped` — there is no keep/release decision UI (player-carry can be inspected from the HUD).

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
```
Spawn inputs: region, habitat, season, time, weather, world seed, recent pressure, cooldown. Presentation cues: circling gulls, surface splashes, occasional jumps; fish finders later improve detection.

Lifecycle: `Inactive → Spawned → Chummed → Feeding Frenzy → Depleted|Expired → Cooldown`. Schools never persist forever.

# 8. Sport-Fishing Encounter

```ts
interface FishingEncounterState {
  fish: FishInstance;
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
Default controls: held-state `fishing` — hold LMB/W to wind; S/RMB to yield line; Space to lift/load the rod; A/D (`fish-left` / `fish-right`) to counter the fish with rod direction. Discrete `fish-reel` / `fish-slack` / `fish-brace` actions retain their stable input IDs, but the encounter is driven by held state. The player-facing rhythm is **read one fish action → match its one highlighted response → reel during recovery**. Runs ask for the opposite rod direction, dives/bursts/shakes ask for a brace, surface recovery asks for winding, and line danger can temporarily override the behavior answer with `W` for slack or `S` for overload. The deeper lift-and-wind rod-load model remains simulation-owned, but the HUD must not require the player to parse it as a second simultaneous minigame. Keyboard-only path required; no mandatory precision gestures.

Tension:
```text
0–10 dangerously slack
10–80 safe
80–100 danger
100 line snap
```
Response depends on fish behavior. Every non-rest behavior has a deterministic tell, drive and recovery window derived from the persisted behavior clock. A selected behavior lasts at least 3.2 seconds, with at least 0.85 seconds of readable tell and 0.75 seconds of recovery; dangerously slack line warns for at least 2.2 seconds before it can escape. Runs reward counter-steering, bursts/dives reward a controlled lift or yield, and recovery is the high-value winding window. Reeling across a run loses purchase and adds cross-load; holding Space indefinitely is not free because it raises tension.

Landing requires:
```text
stamina <= landingThreshold
AND distanceMeters <= landingDistance
AND lineTension within valid range
AND the valid range is held continuously for 0.55 seconds
```
On land: auto-stow into a free hold/hook/player-carry slot, or `FishEscaped` if no space. Do not implement combat-style HP defeat.

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
The encounter owns coupled line extension, rod-blank load, retrieval/payout, fish effort, inertia, heading/depth response and fatigue. `FishingTuning` owns shared constants; authored profiles own species strength, timing, movement and behavior weights. Reel attempts stall under load and restrict automatic drag; yield overrides retrieval; lifting stores up to 1.25 normalized rod load and deliberately weakens simultaneous winding. Releasing the lift while winding returns the stored load as retrieval, especially during recovery. Rod direction responds gradually. Persistent head shakes ring tension and consume line integrity. The fish endpoint and the full angler-to-fish reach must remain on one continuous water path after the permitted short shoreline lead; a fish cannot run behind an island while the taut line cuts across land. Rest can recover limited stamina; line damage does not heal during the fight. Landing requires at least 12 normalized tension and less than the equipped rod's safe limit, alongside the fatigue/distance thresholds and sustained 0.55-second hold.

Schema v19 persists `FishingEncounterState.dynamics`, including position/velocity components, spool length, response state, behavior timing, a private seeded RNG state and the 60 Hz step remainder. New rod-load, fish-speed, head-shake and landing-hold fields are lazily backfilled so an active older fight restores without a schema bump or resource reset. Unreachable legacy distances can shorten to a continuous water reach. Presentation consumes the encounter through one shared sample; it cannot move fish to manufacture camera readability or decide outcomes.

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
LIVE ice: a slot `hasIce` flag **or** `item.crushed_ice` in the backpack / boat supply inventory forces storage modifier **0.4** anywhere that ice resolves. The authored location table below is the design target, not the live ice path (see Deferred):
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

Fishing Skiff: LIVE acquisition at the authored harbor skiff mooring requires **15,000 Fishing XP and 850 G**. The atomic purchase creates the persisted `boat.player_skiff`, its eight-slot supply inventory, four internal medium cargo slots, two external large hooks, fuel tank, and better rough-water tolerance. A fresh save does not create a skiff; it remains a progression-world asset until purchased.

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
- The mount mesh, animation, and rider attachment are presentation. Mount pose
  is committed from the validated physics frame exactly like the player pose;
  Three.js never owns mount position.

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

Harbor sells `item.crushed_ice` so freshness vs capacity is an expedition prep. Contracts refill from existing templates (max 1–2 active, honor `requiredXp`).

Sea risk:
```text
riskScore = weatherSeaRoughness × boatVulnerability × offshoreDistanceFactor
```
Effects: slower control, greater repair probability, harder fishing, warnings. Avoid arbitrary instant destruction.

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

Market tick: **every 60 game minutes**. Supply trends toward baseline; consumption lowers supply; demand responds to supply/target; seasons modify target; small seeded noise varies results. Prices MUST remain understandable, not chaotic.

Demand clamp: **0.65x–1.60x** (UI may show 65–160%).

```text
producePrice = basePrice × demandModifier × seasonalModifier
fishPrice = speciesBasePrice × weightModifier × qualityModifier × freshnessModifier × demandModifier × seasonalModifier
```
LIVE: produce **quality does not affect sale price** (quality is computed and journaled only). Fish quality **does** affect price. Example Blue Marlin: `140 × 1.35 × 1.10 × 0.95 × 1.25 × 1.05 ≈ 259`. UI must explain components.

Selling raises local supply; repeated dumping gradually lowers premium. Never crash price dramatically from one ordinary sale.

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

Most rank-unlock tables remain content data rather than universal live gates — see Deferred. Rod progression is live at the harbor: Willow → River → Heavy Sport → Offshore → Master, requiring the preceding owned rod plus Fishing XP thresholds 1,000 / 3,000 / 15,000 / 60,000. Purchase prices are 120 / 380 / 950 / 2,500 G; purchase adds and equips atomically, while any owned rod can be re-equipped at the harbor outside an active fishing encounter.

# 15. Contracts, Journal & Legendary Fish

Contracts replace repeatable arbitrary fetch quests. The authored story chain remains separate: its ten quests teach the connected farm-to-sea loop, use named NPCs and locations, and advance through explicit `nextQuestId` links. Contracts may reuse the same economy, habitats, and preparation systems, but they must not silently rewrite story progress or become required lore exposition.

```ts
interface ContractTemplate {
  id: ContractTemplateId;
  type: ContractType;
  requesterId: string;
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
Generator MUST validate feasibility. Example contract pattern: 3 Tuna, Fine+, freshness ≥80, 2-day deadline, reward money + Trading XP + reputation.

Journal tracks species discovery, largest weight, best quality, habitat, season, time, weather, personal record, and the current/completed authored quest titles. Do not reveal all ecology immediately; knowledge unlock is progression. The current MVP does not yet persist a dialogue transcript or a full lore codex. Optional people/place/practice entries are a post-P12 extension and must be unlocked by explicit witnessed events rather than by opening a menu.

Legendary fish are later content requiring combinations of season/weather/time/special bait/minimum rod/rare school/habitat. Difficulty comes from behavior, not huge HP.

# 16. Storage & Economy

Storage progression: `Backpack → Farm Crate → Barn Storage → Warehouse → Cold Storage`. Each changes decisions; cold storage enables delaying fish sale for demand but is constrained by cost/capacity.

Coherent sinks: seeds, land lease, processing equipment, boat purchase/repair, fuel, ice, lures, storage upgrades, farm upgrades. Avoid arbitrary repeated taxes.

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

Persistent normal HUD: compact clock + gold top-right, slim quest top-left, Work/Sprint bottom-left, bottom-center context prompt and 5-slot tool hotbar. Work is a hard, fully funded manual-production constraint; prompts show discounted costs and blocked feedback shows required/available Work plus recovery timing. Boat adds fuel/cargo/weather warning. During sport fishing, unrelated boat/Work panels yield to one compact fight panel: fish energy, one highlighted behavior response, one qualitative tension band, contextual landing progress, and line integrity only after meaningful damage. Weight, quality, distance, timer, rod-load math and simultaneous explanatory rows stay out of the active decision layer. An eight-second first-fight hint explains the matching rule, then leaves the world and fish as the focus. No permanent dashboard.

Farm UI: crop, growth, preferred/current climate, moisture, soil, expected yield range, footprint. Village produce stall **currently sells wheat / tomato / potato seed only** (LIVE).

Market UI: current price, demand %, recent trend, owned quantity, quality/freshness modifiers; show explanatory sale breakdown.

Boat UI: fuel, durability, cargo slots, supply inventory, rough-sea suitability; cargo UI MUST map to physical slots.

Forecast: Now, +2h, +5h, storm probability; later skill/equipment can improve accuracy.

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

**Save:** loaded state validates and persistent IDs resolve. The current schema
is **v21 / layout revision 8**; migrations preserve legacy Work Capacity and
crop journals, authored starter structures, docked boat positions, quest feature
unlocks, the Act 5 starter-school flag, the harbor fish-table structure,
traversal state, mount state, and equipped/owned fishing capability without
discarding the save. **`01` §6.1 is the single migration ledger** — read it
there and do not restate the per-version history in this document.

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
- **Remaining rank unlock tables.** Rod entries in `fishingUnlocks` are live through the harbor tackle progression. Other `farmingUnlocks` / `fishingUnlocks` / `tradingUnlocks` / `processingUnlocks` entries remain non-live unless also backed by `crop.minimumFarmingXp`, `recipe.minimumSkill`, explicit quest features, or another named contract.
- **Full seed shop.** Village stall sells **wheat, tomato, potato** seed only. The other five seeds are not stocked. The rowboat is commissioned through Act 4 (30 G + Ground Grain), while the fishing skiff is purchased at its harbor mooring after the live XP and money requirement.
- **Sport keep/release UI.** Landing auto-stows into a free cargo/carry slot or emits `FishEscaped`. No keep/release decision. Player-carry can be inspected from the HUD cargo pill.
- **Drought weather.** The weather enum has **no** `drought`. Growth weather buffs are `light-rain`, `heavy-rain`, and `storm` at **1.05**; other types are 1.00. Storm restores crop moisture like heavy rain.
- **Authored ice location table.** LIVE ice is a slot `hasIce` flag or `item.crushed_ice` in backpack / boat supply, which forces storage modifier **0.4** wherever that ice resolves. The carried/hold/ice-box/cold-storage table is the design target, not a live per-location ice lookup.
- **Sport lure to hook.** A lure is **not** required to hook a chummed school.
- **External hook verb and Emergency Tow.** The skiff purchase and persisted second vessel are live. External-hook class as a distinct live verb and zero-fuel Emergency Tow are not live.
- **Branching dialogue, persistent transcripts, and lore codex.** The ten-quest linear chain, contextual intro/completion/idle dialogue, quest titles/objectives, completed quest history, and feature/knowledge unlocks are live. Branches, relationship variables, dialogue page saves, a transcript, and a separate `loreDiscoveries` state are not live; do not add them opportunistically.
- **NPC schedules and romance.** Named NPC roles and fixed authored anchors are live. Daily schedules, relationship progression, romance, and large companion/story systems remain out of scope for the MVP.
