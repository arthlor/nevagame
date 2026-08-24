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

Placement MUST validate: inside permitted farm; no overlap; valid surface; enough footprint; seed available; crop unlocked; no structure-clearance conflict. Simulation footprints—not mesh bounds—are authoritative.

Growth:
```text
effectiveGrowthDelta = elapsedGameMinutes
  × climateModifier × moistureModifier × fertilityModifier × weatherModifier

climate:    preferred 1.20 | neutral 1.00 | poor 0.80
moisture:   healthy   1.00 | dry     0.85 | very dry 0.60
fertility:  excellent 1.10 | normal  1.00 | poor     0.80
weather:    light rain 1.05 | normal 1.00 | drought  0.85
total clamp: 0.50x–1.50x
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
Harvest reduces fertility; Basic Fertilizer restores it. Desired circularity: `fish scraps → fertilizer → better crops → grain → chum → fishing`.

Worm Compost MVP: **180 game-minute maturation**, **20–30 bait worms**, one harvest. Initial recipe: `Plant Matter + Compost Starter → Worm Compost`. Never provide infinite starter bait from a permanent object.

Apple Tree: `sapling → mature → fruit ready → harvest → regrowth timer → fruit ready`; tree persists. Tree chopping is later unless explicitly included.

# 4. Farming Progression

Shared ranks/XP:
```text
0 Novice | 1,000 Apprentice | 3,000 Skilled | 7,500 Expert
15,000 Master | 30,000 Artisan | 60,000 Famed | 100,000 Legendary
```
XP sources: planting, successful harvest, crop care, farm contracts, advanced farm processing. Prevent repeat-plant/uproot and cheap reversible XP exploits.

Capability examples:
| XP | Farming unlock |
|---:|---|
| 0 | starter crops |
| 1,000 | quality preview |
| 3,000 | efficient worm compost |
| 7,500 | seed bundles |
| 15,000 | irrigation |
| 30,000 | orchard specialization |
| 60,000 | premium seed selection |
| 100,000 | master crop strains |

# 5. Inventory & Processing

```ts
interface InventoryState { id: InventoryId; slotCount: number; slots: InventorySlot[]; }
interface InventorySlot { itemId?: ItemId; quantity?: number; }
```
Rules: finite slots, defined stack limits, atomic transactions, no silent item loss. Any transaction validates inputs/output capacity first, then mutates once; failure leaves state unchanged.

MVP stations: `Hand Mill`, `Workbench`, `Fish Cleaning Table`.
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
Minimum recipes:
```text
Wheat → Ground Grain
Barley → Ground Grain
Ground Grain + Bait Worms → Chum Bucket
Basic Materials → Fishing Lure
Fish Scraps → Basic Fertilizer
```
Every recipe should support the core loop.

# 6. Basic Fishing

Purpose: relaxed early activity, Fishing XP, common fish/ingredients/low-risk income. Requires rod + bait worms + valid water.

State: `Idle → Casting → Waiting → Bite → Success|Miss → Retrieve → Idle`. No sport-fishing minigame here.

Outcome inputs: habitat, season, time, weather, rod quality, fishing proficiency, seeded RNG. Small/basic fish may be normal items; sport fish use physical cargo.

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
Sport fishing requires active chummed school, compatible rod, valid lure, no conflicting mode, and non-expired school. Cargo space is not required to hook; lack of space becomes a landing decision.

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
Default controls: hold LMB reel; release stop pressure; A/D rod direction; Space brace; S slack. Keyboard-only path required; no mandatory precision gestures.

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
Do not implement combat-style HP defeat.

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

Fishing Skiff: first serious boat; **4 internal medium slots + 2 external large hooks + supply chest + fuel tank + better rough-water tolerance**. It MUST materially extend expedition length/profitability.

Zero fuel → Emergency Tow: harbor return + money cost + game-time advance + small reputation/contract consequence where relevant. Never strand the save.

# 12. Weather & Sea Risk

```ts
interface WeatherSnapshot {
  type: "clear" | "cloudy" | "light-rain" | "heavy-rain" | "windy" | "fog" | "storm";
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
producePrice = basePrice × qualityModifier × demandModifier × seasonalModifier
fishPrice = speciesBasePrice × weightModifier × qualityModifier × freshnessModifier × demandModifier × seasonalModifier
```
Example Blue Marlin: `140 × 1.35 × 1.10 × 0.95 × 1.25 × 1.05 ≈ 259`. UI must explain components.

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

Fishing capability unlocks:
| XP | Unlock |
|---:|---|
| 0 | basic fishing |
| 1,000 | lake sport fishing |
| 3,000 | improved line |
| 7,500 | coastal fish |
| 15,000 | fishing skiff eligibility |
| 30,000 | fish finder |
| 60,000 | offshore heavy fish |
| 100,000 | legendary fish |

Trading:
| XP | Unlock |
|---:|---|
| 0 | village market |
| 2,000 | harbor wholesale |
| 7,500 | price history |
| 15,000 | premium contracts |
| 30,000 | short forecast |
| 60,000 | export buyers |

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

Persistent normal HUD: day/time/weather + money + context prompt. Boat adds fuel/cargo/weather warning. Fishing adds tension/stamina/distance/behavior. No permanent dashboard.

Farm UI: crop, growth, preferred/current climate, moisture, soil, expected yield range, footprint; do not reveal exact future quality before relevant proficiency unlock.

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

**Save:** loaded state validates; persistent IDs resolve.

# 19. Vertical-Slice Acceptance Gate

A new save MUST support:
- [ ] move through starter world
- [ ] obtain wheat seed
- [ ] plant + water wheat
- [ ] save/quit and return after offline growth
- [ ] harvest once
- [ ] place Worm Compost and harvest bait worms
- [ ] grind grain + craft chum
- [ ] basic fish
- [ ] acquire rowboat
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
