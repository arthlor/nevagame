# Farm & Fishing Browser Game — Gameplay Systems Implementation (Compact)

> **Role:** Canonical gameplay, balance, formulas, state contracts, and vertical-slice authority. Requires `01_GAME_FOUNDATIONS_ARCHITECTURE.md`.

# 0. Gameplay Thesis & MVP Scope

This is one connected production economy: **farming prepares fishing → fishing creates physical cargo → logistics determine realized value → profit unlocks operational capability**. Decisions should trade immediate sale vs processing/preparation, extra catch vs freshness/weather/capacity, and market-value crops vs self-supply crops.

Do not expand content before the vertical-slice gate passes.

| Category | MVP |
|---|---|
| Crops (8) | Wheat, Barley, Corn, Tomato, Potato, Carrot, Flax, Apple Tree |
| Farm utilities | Worm Compost, Basic Fertilizer, Watering, Soil Fertility, Climate Match |
| Freshwater fish (6) | Carp, Trout, Perch, Catfish, Pike, Arowana |
| Saltwater fish (6) | Mackerel, Tuna, Sturgeon, Sailfish, Swordfish, Blue Marlin |
| Boats (2) | Rowboat, Fishing Skiff |
| Markets (2) | Village Produce Market, Harbor Fish Market |

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
weather:    light-rain 1.05 | heavy-rain 1.05 | other 1.00
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

`CropQuality` ends at `prize`; `FishQuality` ends at `trophy`. They are separate typed contracts even though their lower tiers share names. The v4 save migration converts legacy crop `trophy` journal values to `prize`; fish journal values remain `trophy`. Work Capacity depletion reduces the seeded rare-quality contribution through a deterministic rare-chance multiplier; it never changes the authoritative quality owner or makes core farming unavailable.

Harvest:
```text
quantity = seededRandom(baseYield.min, baseYield.max)
         × healthModifier
         × proficiencyModifier
```
Recommended endgame yield ceiling from skill: **~25%**; progression value should mostly come from capabilities.

Initial balance:
| Crop | Growth | Preferred Climate | Yield | Purpose |
|---|---:|---|---:|---|
| Wheat | 60m | Temperate | 3–5 | ground grain/chum |
| Barley | 90m | Temperate | 3–6 | ground grain/chum |
| Corn | 150m | Warm | 2–5 | feed/market |
| Tomato | 120m | Temperate | 3–5 | market/food |
| Potato | 180m | Cool | 3–6 | market/food |
| Carrot | 90m | Cool | 2–5 | feed/food |
| Flax | 240m | Temperate | 2–4 | fiber |
| Apple Tree | 720m | Temperate | 4–8 | orchard/regrow |
These are starting values, not sacred final numbers.

# 3. Water, Soil, Compost & Orchards

Moisture starts on `0–100`. Watering restores substantial moisture; rain restores moisture; late irrigation reduces labor. Do not require constant re-clicking or let watering dominate play.

```ts
interface SoilState {
  fertility: number;
  moistureRetention: number;
}
```
Harvest reduces fertility (floor **10**). `farm.apply-fertilizer` restores **+20** fertility, clamps **10–100**, and consumes `item.basic_fertilizer`. Desired circularity: `fish scraps → fertilizer → better crops → grain → chum → fishing`.

Worm Compost MVP: **180 game-minute maturation**, **20–30 bait worms**, one harvest. Initial recipe: `Plant Matter + Compost Starter → Worm Compost`. Never provide infinite starter bait from a permanent object.

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
LIVE recipes (8):
```text
Wheat → Ground Grain                 (hand-mill)
Barley → Ground Grain                (hand-mill)
Ground Grain + Bait Worms → Chum     (workbench)
Flax + Fish Scraps → Feather Lure    (workbench; minimumSkill processing 500)
Fish Scraps → Basic Fertilizer       (fish-table)
Plant Matter + Compost Starter → Worms (compost-bin)
Perch → Fish Scraps                  (fish-table)
Mackerel → Fish Scraps               (fish-table)
```
`recipe.fish_to_fertilizer`, `recipe.perch_to_scraps`, and `recipe.mackerel_to_scraps` require `stationType: "fish-table"`. Every recipe should support the core loop.

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
   - **Perfect Catch**: If fish never leaves the bar, grants "PERFECT!", $+100\%$ bonus Fishing XP, and $+1$ tier fish quality upgrade (Normal $\rightarrow$ Silver $\rightarrow$ Gold $\rightarrow$ Iridium).
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
Default controls: held-state `fishing` — hold LMB/W reel; S/RMB slack; Space brace; A/D (`fish-left` / `fish-right`) rod direction. Discrete `fish-reel` / `fish-slack` / `fish-brace` actions exist, but the encounter is driven by held state. Keyboard-only path required; no mandatory precision gestures.

Tension:
```text
0–10 dangerously slack
10–80 safe
80–100 danger
100 line snap
```
Response depends on fish behavior (rests → reel; bursts/dives/runs → manage direction/slack/brace/tension).

Landing requires:
```text
stamina <= landingThreshold
AND distanceMeters <= landingDistance
AND lineTension within valid range
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
}
```
Species MUST feel behaviorally distinct:
- Carp: low stamina, weak bursts, long rests, slow turns.
- Trout: quick, frequent surface, medium stamina.
- Tuna: high stamina, long runs, few rests.
- Swordfish: strong bursts, rapid switches.
- Blue Marlin: very high stamina, long runs, surface leaps, high pressure, rare.
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
Rowboat: first vehicle, lake sport/nearshore, tiny cargo/low speed/poor rough sea; fuel may be omitted.

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
| Storm | risk | rare opportunity | dangerous |
MVP may initially implement clear/rain/windy/storm.

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
Available: 100% proficiency XP, normal rare chance/efficiency. Empty: **40% XP**, reduced rare chance, base production still works. **Never hard-block core play.**

MVP proficiencies: Farming, Fishing, Processing, Trading. Later: Husbandry, Boatbuilding. Shared ranks: Novice → Apprentice → Skilled → Expert → Master → Artisan → Famed → Legendary.

Fishing / trading rank-unlock tables are content data and **unused as live gates** — see Deferred. LIVE fishing/trading capability is XP for rank display plus explicit quest feature unlocks (e.g. rowboat boarding) and per-definition `minimumSkill` / `minimumFarmingXp`.

# 15. Contracts, Journal & Legendary Fish

Contracts replace arbitrary fetch quests. Types: produce order, fresh fish order, weight/quality target, timed delivery, supply preparation, seasonal order.

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

Journal tracks species discovery, largest weight, best quality, habitat, season, time, weather, personal record. Do not reveal all ecology immediately; knowledge unlock is progression.

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
First-hour beats: first harvest → self-produced bait → market sale → school spotted → sport fish landed → physical cargo decision → meaningful upgrade goal. Tutorial copy stays contextual/minimal.

# 17. HUD & UX

Persistent normal HUD: day/time/weather + money + context prompt. Work Capacity is shown as **Labor** and is **not a hard block** (empty Labor = 40% XP / reduced rare chance; core play continues). Boat adds fuel/cargo/weather warning. Fishing adds tension/stamina/distance/behavior. No permanent dashboard.

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

# 18. System Invariants

**Farming:** invalid placement impossible; harvest cannot duplicate; maturity from simulation; quality calculated once at harvest.

**Inventory:** atomic transactions; capacity/quantity never negative.

**Fishing:** one active encounter/player; outcome deterministic for seed + input timeline; sport fish becomes cargo.

**Boat:** one fish max per cargo slot; each fish exists in exactly one location.

**Market:** sale removes asset once, adds money once, uses simulation price state.

**Traversal:** sprint stamina/recovery/exhaustion/grounded state is serializable and fixed-step; it is distinct from Work Capacity and must not be owned by the renderer or input layer.

**Save:** loaded state validates; persistent IDs resolve; current schema v11 migrations preserve legacy Work Capacity/crop journals, authored starter structures, docked boat positions, quest feature unlocks, the Act 5 starter-school flag, the harbor fish-table structure, and traversal state without discarding the save. Schema v10 inserts the harbor fish-table and lifts y=0 stations; schema v11 converts illegal `fish.trout` item stacks to cargo.

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
- [ ] any new generated 3D representation is added through the single schema/catalog/registered-family-generator pipeline; shared `common/authored.py` construction helpers may support the family generator but never become a second pipeline, and catalog IDs/nodes remain presentation metadata rather than simulation state
- [ ] user-facing visual changes pass actual-gameplay-camera review against `04` + Art Pipeline; no gameplay mechanic depends on beauty-camera-only presentation
- [ ] failure handling
- [ ] no invariant broken
- [ ] user-facing E2E path updated

# 22. Deferred (not live)

The preceding sections are the **LIVE** implementation authority. The items below are authored design or content tables that exist in files but are **not implemented as gameplay gates / systems**. Do not treat them as live. Do not implement them opportunistically without an explicit task.

- **Produce quality vs price.** Crop quality is computed at harvest and written to the journal. It does **not** currently multiply village/harbor produce sale price (`calculateCommodityUnitPrice` is `base × demand × seasonal` only).
- **Rank unlock tables.** `PROFICIENCY_RANKS` `farmingUnlocks` / `fishingUnlocks` / `tradingUnlocks` / `processingUnlocks` are unused. LIVE gates are `crop.minimumFarmingXp` and a few `recipe.minimumSkill` values, plus explicit quest `unlockedFeatureIds`.
- **Full seed shop / buy-rod.** Village stall sells **wheat, tomato, potato** seed only. The other five seeds are not stocked. There is no buy-rod command; the rowboat is commissioned through Act 4 (30 G + Ground Grain), while the fishing skiff is purchased at its harbor mooring after the live XP and money requirement.
- **Sport keep/release UI.** Landing auto-stows into a free cargo/carry slot or emits `FishEscaped`. No keep/release decision. Player-carry can be inspected from the HUD cargo pill.
- **Drought weather.** The weather enum has **no** `drought`. Growth weather buffs are `light-rain` and `heavy-rain` at **1.05**; other types are 1.00.
- **Authored ice location table.** LIVE ice is a slot `hasIce` flag or `item.crushed_ice` in backpack / boat supply, which forces storage modifier **0.4** wherever that ice resolves. The carried/hold/ice-box/cold-storage table is the design target, not a live per-location ice lookup.
- **Sport lure to hook.** A lure is **not** required to hook a chummed school.
- **External hook verb and Emergency Tow.** The skiff purchase and persisted second vessel are live. External-hook class as a distinct live verb and zero-fuel Emergency Tow are not live.
