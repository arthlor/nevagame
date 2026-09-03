# Farm & Fishing Browser Game — Game Foundations & Technical Architecture (Compact)

> **Role:** Primary technical source of truth. Read it for architecture, simulation ownership, renderer contracts, persistence, cross-system work, and release/gold-slice gates. Routine existing-asset work follows the scoped route in root `AGENTS.md` and `BLENDER.md` without loading this file by default. If guidance conflicts, follow §19.
> **Migration ledger:** §6 and §7 of this file are the single owner of the schema/layout migration history. `02` and `03` reference it and must not restate it.
> **Audience:** LLM coding agents, technical leads, gameplay programmers, technical artists.

# 0. Project Definition

Build a **single-player 3D browser game about farming, fishing, production, logistics, market decisions, and economic progression**. Keep ArcheAge-style non-combat strengths: physical farmland, climate-sensitive timed crops, professions, bait/chum production, freshwater + sport fishing, physical fish cargo, finite boats/storage, trade logistics, dynamic demand, and location/distance economics.

**Never add:** combat, weapons, hostile mobs/NPCs, PvP, piracy, gear-score grind, raids, classes. Risk comes from weather/rough seas, freshness, capacity, fuel, market timing, crop timing, deadlines, durability, difficult fish, and preparation mistakes.

# 1. Product Pillars

Every feature MUST reinforce at least one pillar.

1. **Physical Production:** resources come from actual production/gathering; avoid magical generation. `seed → crop → harvest → processing`; `worms/grain → bait/chum`; `tree → lumber → boat component`.
2. **Interlocking Professions:** farming and fishing feed each other. Farming-only and fishing-only remain viable; strongest self-sufficient loop combines both: `farm → ingredients/wood/worms → processing → bait/chum/supplies → fishing → fish/scraps/trophies → market/processing/fertilizer → money → better farm/tools/boats/storage`.
3. **Physical Logistics:** farms/crops/boats/cargo/storage occupy space; transport takes time; location affects value. **No infinite inventory.**
4. **Knowledge Is Progression:** reward learned climates, schedules, habitats, fish behavior, weather/seasons, demand, routes, storage, and preparation—not only stats.
5. **Capability-Based Progression:** major milestones unlock verbs, locations, scale, automation, or strategies rather than primarily `+%` bonuses (e.g. Offshore Rod → Large saltwater fish; Irrigation Pump → connected-crop maintenance).

# 2. Player Fantasy & Loops

Start: tiny public garden, basic rod, seeds, minimal storage/money, river/lake access, village market. Long-term: private farm/orchard, processing, skiff, offshore fishing, cold storage, contracts, specialized crops, fish-finding tech, larger vessel, deep-sea expeditions, mature coastal business.

Progression fantasy: `buy supplies → self-produce supplies → reliable trips → optimize farm for fishing → choose profitable routes → predict world → operate maritime business`.

Core loops:
- **Micro (30s–3m):** inspect → interact → feedback → decision.
- **Farm (5–20m):** maturity → harvest → soil/water → replant → process → fishing supplies.
- **Expedition (20–60m):** market + forecast → prepare → sail → scout → chum → hook → tension → store → continue/return → dock → sell/process.
- **Meta (days/weeks):** earn → capability → specialize → regions/species → optimize → contracts → infrastructure.

## 2.1 Narrative & Lore Contract

Neva's MVP is a **coastal inheritance story told through useful work**. The
player arrives at the long-waiting family homestead in Neva Cove, learns how
soil, water, craft, river, harbor, and open sea depend on one another, and earns
the knowledge and capability to reopen the family's maritime future. The
protagonist's name, gender, voice, and unspoken personal history remain
player-projected; authored content must not require a fixed identity to make
the story work.

The intended tone is warm, salt-weathered, observant, and quietly hopeful.
Thematic anchors are **stewardship, memory carried by objects and routines,
reciprocity between land and sea, earned belonging, and responsible abundance**.
Conflict is non-combat: weather, distance, freshness, capacity, timing,
uncertain knowledge, and the consequences of preparation create pressure.

Narrative ownership is explicit:

- `src/content/quests.ts`, `src/content/npcs.ts`, and `src/content/knowledge.ts`
  own the current authored story text, quest titles, acts, speakers,
  objectives, milestone recognition, and journal knowledge entries.
- `ContentRegistry` validates and exposes that content; it is the single
  runtime content entry point, not a second story database.
- `QuestDomain` owns quest progression, target/location predicates, content-owned
  turn-in costs and rewards, `nextQuestId`, and quest-related domain events.
- `GameState.quests` owns only serializable progression truth: active quest and
  step, progress, completed quest IDs, feature unlocks, and hints. Dialogue
  pages are a transient presentation interaction; do not save the current page,
  modal state, or DOM text.
- `GameApp`, `DialogueModal`, `QuestTrackerHUD`, `JournalModal`, audio, and
  world presentation consume simulation results. They must never decide that a
  lore beat, reward, or quest objective happened.
- `WorldLayout`/environment composition and the Art Bible own environmental
  storytelling cues. A prop, landmark, or material may suggest history, but it
  cannot become the gameplay authority for a quest condition.

Every authored story beat must connect **a person, a place, a player action,
and a consequence**. Dialogue explains or deepens a decision the player can
make; it must not replace the action. Quest progression must remain valid if a
player closes a dialogue early and resumes the objective. Conversely, a
mechanic must not silently advance because the player merely read text.

The current game uses one explicit 18-quest chain: the accepted ten-quest P12
spine, a three-quest P13 stewardship postscript, and five Act 7 Sunreach quests. Contextual intro,
completion, idle, and milestone-recognition dialogue all remain content. It
does not include branching outcomes, romance, NPC schedules, a dialogue
transcript, relationship state, or a separate lore-codex state.
Those are future content/system decisions, not permission to invent local
flags or parallel narrative state. `unlockedDialogueIds` remains a reserved
field until a real unlock model, content IDs, migration plan, and tests exist.

# 3. Non-Negotiable Invariants

- **No combat:** no player health combat, weapons, enemies, attack UI/trees, boat weapons. Fishing tension/stamina is not combat.
- **Simulation owns truth:** canonical gameplay state MUST be serializable simulation data, never Three.js `userData`, meshes/materials/mixers, DOM, or local UI state.
- **Seeded gameplay RNG only:** never `Math.random()` in simulation. Non-deterministic visual-only particles are allowed.
- **Finite storage:** every backpack/crate/chest/boat hold/cold store has capacity.
- **Sport fish are physical cargo:** large sport fish MUST NOT become stackable inventory items.
- **Offline ≠ hidden automation:** offline may advance growth, processing, spoilage, contracts, markets, weather/calendar; it MUST NOT auto-harvest/sell/manual-fish/repair unless an explicit unlocked automation system permits it.
- **World-first UI:** no permanent full-width header/footer, equal-weight dashboard panels, center dashboards, or giant quest cards. DOM UI is preferred for overlays but should be contextual/collapsible.

# 4. Platform & Stack

**MVP:** desktop Chrome/Edge/Firefox/Safari; prioritize `1920×1080`, `2560×1440`, `1440×900`, `1366×768`; keyboard + mouse first. Later: PWA, controller, native wrapper, Steam. Not MVP: mobile-first controls, multiplayer, console.

Runtime:
```text
Node.js >= 20
TypeScript + Vite
Three.js (WebGL2 baseline; WebGPURenderer + TSL/Node Materials allowed for advanced water/foliage)
IndexedDB
Vitest
Playwright
ESLint + Prettier
Rapier 3D
```
UI: Vanilla TS or React DOM; UI state via vanilla observers or Zustand. **Do not wrap the core 3D world in React Three Fiber.** Three.js owns 3D; DOM/React owns 2D overlays. Canonical simulation remains domain-driven; optional Miniplex/bitECS/spatial indexing may support rendering/VFX only and must not imply a runtime-streamed world.

Asset tooling: implemented glTF Transform + Meshopt + Khronos validation; KTX2/BasisU remains preferred for GLB-embedded textures. Ground supporting maps currently ship as local WebP derivatives under `public/assets/textures/terrain/` through `ExternalSurfaceTextures`; SpectorJS/browser diagnostics for profiling.

Required scripts (compatible stable versions): `dev`, `build` (`tsc && vite build`), `preview`, `typecheck`, `lint`, `lint:fix`, `test`, `test:watch`, `test:e2e`.

# 5. Architecture

```text
CONTENT DEFINITIONS → SIMULATION → APPLICATION SERVICES → PRESENTATION ADAPTERS → THREE.JS / DOM / AUDIO
```
- **Content:** static crops, fish, recipes, boats, items, markets, regions, unlocks, contracts.
- **Narrative content:** static NPC definitions, authored quest chain, dialogue, and story-facing discovery labels.
- **Expedition choices:** `buildExpeditionOpportunities()` is a pure simulation
  query over active contracts, market demand, weather, owned equipment, cargo,
  and supplies. React renders its DTO and never recomputes prices or readiness.
- **Simulation:** authoritative mutable state + deterministic rules.
- **Application:** save/load, input, scene transitions, ticks, renderer sync, dialogue/modal orchestration, UI events.
- **Presentation:** displays state; MUST NOT decide economic/gameplay outcomes.

Recommended repository ownership:
```text
src/
  app/            bootstrap, GameApp, lifecycle, ModeController, presentation action controllers
  simulation/     core + domains + navigation + farming/fishing/boats/weather/economy/inventory/crafting/progression/contracts/world
  physics/        PhysicsWorld, catalog collision projection, static collision proxies
  content/        registry + crops/fish/items/recipes/boats/markets/regions/progression
  render/         app/loaders/sync/objects/water/weather/materials/fx
  input/          GameAction/InputRouter/KeyboardInput/PointerInput
  ui/             root/hud/inventory/farm/market/journal/boat/contracts/settings/shared
  persistence/    SaveSchema/SaveRepository/IndexedDbSaveRepository/SaveMigrations/SaveValidator
  audio/ diagnostics/ assets/ main.ts
tests/ unit/ simulation/ integration/ fixtures/ e2e/
```

# 6. Canonical State, IDs, RNG & Time

Representative state (`CURRENT_SCHEMA_VERSION = 29`, `world.layoutRevision = 10`):
```ts
interface GameState {
  schemaVersion: number;
  worldSeed: number;
  clock: ClockState;
  player: PlayerState;
  world: WorldState;
  farms: Record<FarmId, FarmState>;
  crops: Record<PlacedCropId, PlacedCropState>;
  inventories: Record<InventoryId, InventoryState>;
  processingJobs: Record<ProcessingJobId, ProcessingJobState>;
  basicFishing: BasicFishingState | null;
  sportFishing: FishingEncounterState | null;
  boats: Record<BoatId, BoatState>;
  fishCargo: Record<FishCargoId, FishCargoState>;
  weather: WeatherState;
  markets: Record<MarketId, MarketState>;
  contracts: ContractState[];
  journal: JournalState;
  quests: QuestState; // one cursor per track; completed IDs; feature/knowledge unlocks
  metadata: GameMetadata;
}
```
All state MUST be JSON-serializable. Proficiency XP lives on `player.proficiencies`; do not invent a parallel top-level `progression` blob. New-game station `y` is `terrainHeight(x, z)`.

## 6.1 Migration Ledger (canonical)

This table is the **single owner** of the schema/layout migration history. `02`,
`03`, and the status checklist reference it; they must not restate it. Append a
row here in the same change that adds the migration, and follow the
save-sensitive protocol in `03` §25.

| Schema | Layout | What it changes | Preservation boundary |
|---|---|---|---|
| v10 | — | Inserts the harbor fish-table (`HARBOR_FISH_TABLE` / `struct.harbor_fish_table`); lifts `y = 0` stations onto terrain. | Unrelated state untouched. |
| v11 | — | Converts illegal `fish.trout` item stacks to cargo. | Keyed `boats` record preserved. |
| v12 | 3 → 4 | Physical worked-road relief. Re-grounds an on-foot player and placed structures through final canonical terrain height. | Preserves X/Z, rotations, crops, inventory, cargo, markets, progression, quests, boat truth; active boat plus its player waterline unchanged. |
| v13 | 4 → 5 | Northeast village hub: moves `struct.starter_mill` off the homestead plantable onto the mill pad; relocates `market.village` and the arterial road hub to the northeast plaza; keeps the former stall site as a river-crossing gateway. | Preserves crops, Work Capacity, boats, quests, fish-table; re-grounds land truth. |
| v14 | 5 → 6 | Moves `struct.starter_mill` off the packed plaza onto a southwest mill pad; keeps `market.village` at the northeast hub; enlarges the village courtyard. | Preserves other structure/player/boat/crop/quest truth; re-grounds land truth. |
| v15 | 6 → 7 | Relocates the mill, starter workbench, compost bin, and harbor fish table to canonical anchors; adopts the revised bridge/road/terrain topology. | Preserves crops, inventory, cargo, boats, markets, quests, progression, unrelated structures; active boat plus its player waterline unchanged. |
| v16 | 7 | No world move. Retunes the live/offline clock from `1` to `0.4` game minutes per real second when a save still stores the old stopwatch ratio; fills `weather.nextWeatherType` so the Now / +2h / +5h forecast can persist. | World anchors and narrative state unchanged. |
| v17 | 7 → 8 | Authored beach, rock-toe, and recessed-cliff coast topology. | Same preservation and land re-grounding boundary as v15; X/Z unchanged. |
| v18 | 8 | Adds persisted starter mount state and player mount ownership. | Unrelated state untouched. |
| v19 | 8 | Adds sport-fishing dynamics: continuous fish bearing/depth/velocity, line length, rod response, behavior duration, a private RNG stream, and the fixed-step remainder. | Preserves the active catch, stamina, line condition, school association, cargo, and progression. A legacy line may be shortened only when its old presentation distance cannot fit reachable water. |
| v20 | 8 | Adds `player.ownedRodIds`; grants every rod through the equipped tier. | Legacy saves retain current capability and can switch back to earlier habitat coverage. |
| v21 | 8 | Rescales a legacy non-canonical `player.workCapacity` pool to the `WORK_CAPACITY_MAXIMUM` (1,000) ceiling, preserving how full it was. A zero/absent old maximum fills to full. | No world move. Preserves `regeneratedAtMinute` and all other player truth. Covered by `tests/simulation/persistence.test.ts`. |
| v22 | 8 | Remaps in-flight basic-fishing / cargo / journal fish quality from Stardew skins (`normal/silver/gold/iridium`) onto `FishQuality` (`common/fine/exceptional/trophy`). Backfills `journal.unlockedKnowledge` to `[]` when missing. | No world move. Covered by `tests/simulation/huntFixes2026.test.ts`. |
| v23 | 8 | Adopts the centered market model. Existing authored commodities are rebased to their catalog target supply with demand `1.0`, their authored price/throughput/season values are synchronized, and `lastTickMinute` advances to the saved clock so the new model does not replay stale hours from the broken equilibrium. Unknown fixture/mod content markets remain untouched. | No world move or inventory/cargo change. Persisted RNG state is preserved, but resumed future draws may diverge because market ticks no longer consume the shared RNG stream. Covered by `tests/fixtures/save_v22_layout8.json` and `tests/simulation/persistence.test.ts`. |
| v24 | 8 → 9 | Relocates player, mount, and structure poses invalidated by the layout-9 world revision, and pulls an in-flight sport-fishing line back onto reachable water. | Preserves boats, crops, farms, inventory, cargo, quests, journal, proficiencies, and persisted RNG state. Covered by `tests/fixtures/save_v23_layout8.json` and `tests/simulation/persistence.test.ts`. |
| v25 | 9 | Calendar retune. `DAYS_PER_SEASON` drops 30 → 6, so a stored `currentMinute` now resolves to a different season; the clock is rebuilt to re-derive `season`, `year`, and `dayCount`, and every market commodity's `seasonalModifier` is refreshed from its definition's `seasonalFactors` for the new season. Every `active` contract is voided once through the normal expiry refund path. | No world move, no shape change. Voiding is version-gated rather than reconciled every load, so partial produce is refunded exactly once; `ContractDomain.tick()` refills on the next tick. A player loses at most two in-flight orders. Covered by `tests/fixtures/save_v24_calendar30.json` and `tests/simulation/persistence.test.ts`. |
| v26 | 9 → 10 | Adds `island.sunreach`, its terrain patch, regions, warm climate, fishing ecology, farm, stations, cove market, and mooring. Existing schools derive ecology from position; an in-flight basic cast becomes `ecology.neva`; contracts gain their content-owned delivery market. | Preserves existing Neva player/boat/mount/crop/farm/inventory/cargo/quest/reward/RNG truth and adds only missing registry-owned Sunreach state. Covered by `tests/fixtures/save_v25_layout9.json`, `tests/simulation/persistence.test.ts`, and `tests/unit/sunreachWorld.test.ts`. |
| v27 | 10 | Moves the mount gallop budget onto each persisted mount: stamina, recovery delay, and exhaustion. Existing mounts start rested when these fields are absent. | No world move. Preserves rider sprint state and all non-mount truth; validation bounds the new fields through `MOUNT_TUNING`. |
| v28 | 10 | Adds explicit prepared-lure state, per-ecology/habitat fishing pressure and cooldown, plus hook-time tackle and sea-condition snapshots on active sport-fishing encounters. It backfills only absent dynamics members; validation now uses the hooked species' authored leap/dive bounds and covers every persisted dynamics field. | No world move. Defaults absent fields in place without changing any already-persisted active-fish dynamics or landing progress, cargo, school association, Work, progression, or either RNG stream. Save-fixture and migration-test evidence remain pending under the source-only no-tests boundary. |
| v29 | 10 | Splits quest progress into one cursor per track. `QuestState.activeQuestId` / `activeStepIndex` / `stepProgress` become `tracks: Record<QuestTrackId, QuestTrackProgress>` plus `focusedTrackId`, and `unlockedDialogueIds` is dropped — it was declared, validated and migrated since v8 without ever being read or written. | No world move. The single pre-v29 cursor becomes `track.main` verbatim, so no objective progress, reward or completion is replayed or lost; `activeActId`, `completedQuestIds`, `unlockedFeatureIds` and `hintsShown` carry through untouched. Fixture `tests/fixtures/save_v28_layout10.json` with migration and resume coverage in `tests/simulation/questPersistence.test.ts`. |

Fishing uses a 60 Hz encounter step independently of render frames. No offline
fight advancement is introduced.

`WorldState` owns the current world seed, `activeSchools`, per-ecology/habitat
fishing pressure/cooldown, authored `structures`, and the last school-spawn
minute. World geometry is registry-driven:
`WorldIslands` owns islands, terrain patches, closed coasts, climates, marine
fields, fishing ecologies, and the open-channel requirement;
`WorldGameplayLocations` owns farms, stations, markets, chart nodes, and
ambience; `WorldMoorings` owns moorings and sailing routes. Do not add fish
schools, structures, or island-local variants as parallel top-level fields.

`PlayerState` includes serializable traversal state (`sprintStamina`, recovery delay, exhaustion, grounded state), `equippedRodId`, the unique known `ownedRodIds` set required by schema v20, and the optional explicitly prepared lure ID. Traversal is simulation-owned and fixed-step; Work Capacity is a separate economy resource and must not be reused as movement stamina.

Manual production affordability and spending are simulation-owned by `ProgressionDomain`. Callers validate capability, inputs, and output capacity first, then quote and spend the full discounted Work cost as one transaction boundary. An insufficient quote cannot partially drain Work, consume items, advance canonical RNG, create gameplay state, award XP, or emit a success event; presentation may only display the structured quote/result.

Use stable typed/string IDs (`CropId`, `FishSpeciesId`, `FarmId`, `BoatId`, `MarketId`, `InventoryId`). Persistent content IDs use stable machine names such as `crop.wheat`, `fish.blue_marlin`, `boat.rowboat`, `market.harbor`. Never use display names; never rename persistent IDs without migration.

Seeded RNG API:
```ts
interface Rng {
  nextFloat(): number;
  intInclusive(min: number, max: number): number;
  range(min: number, max: number): number;
  chance(probability: number): boolean;
  weighted<T>(entries: ReadonlyArray<{ value: T; weight: number }>): T;
}
```
Use for harvest/quality, fish weight/schools, weather, markets. Tests MUST accept fixed seed.

Time:
- wall time only for save timestamp, offline elapsed, diagnostics;
- canonical simulation time = integer `GameMinute`;
- starting ratio: `2.5 real seconds = 1 game minute` (`minutesPerRealSecond = 0.4`), `1 game day ≈ 60 real minutes`, configured centrally. Schema v16 snaps stored `minutesPerRealSecond === 1` to `0.4` and requires `weather.nextWeatherType` for the forecast window.

Ticking: rendering via RAF; movement/physics fixed timestep; economics event/coarse-tick; market hourly game tick; crop/freshness delta-based; weather scheduled. **Never iterate crop growth each render frame.**

# 7. Offline Progression & Persistence

On load: `offlineMs = nowUtcMs - lastSavedUtcMs`; cap at **72 real hours**. Advance in **weather-bounded segments** so a long absence does not apply one stale weather snapshot to every crop and cargo item. Inside each segment: crop growth, crop moisture, and cargo freshness. After all segments: processing jobs, then contracts, then market ticks. Never auto-harvest, auto-sell, or auto-fish.

IndexedDB save envelope:
```ts
interface SaveEnvelope {
  schemaVersion: number;
  savedAtUtcMs: number;
  checksum?: string;
  state: GameState;
}
```
Two keys only: `primary_save` and `backup_save`. Quick-save / autosave writes primary (copying the previous primary to backup first). There is **no third manual slot**. Load **migrates then validates**. An IndexedDB write/open failure returns `false`; never promote a RAM copy onto IndexedDB later. If both slots are corrupt, show the `new-game-confirm` overlay and **block autosave until the player confirms**. If IndexedDB is unavailable, continue without saving and keep writes blocked.

Save periodically and on purchase, sale, dock, harvest, unlock, contract completion, visibility loss—not every frame.

Every persistent schema change requires deterministic migrations (`migrateV1ToV2`, etc.). Preserve old fixtures; keep IDs stable; failed migration MUST NOT destroy backup. Before persistent changes agents state: `Save-impact: yes/no`, `Migration required: yes/no`.

Recovery: `primary → backup → new-game-confirm overlay`; never silently wipe.

# 8. Content Registry

Definitions are data and validated at startup:
```ts
interface ContentRegistry {
  crops: ReadonlyMap<CropId, CropDefinition>;
  fish: ReadonlyMap<FishSpeciesId, FishSpeciesDefinition>;
  items: ReadonlyMap<ItemId, ItemDefinition>;
  recipes: ReadonlyMap<RecipeId, RecipeDefinition>;
  boats: ReadonlyMap<BoatTypeId, BoatDefinition>;
  markets: ReadonlyMap<MarketId, MarketDefinition>;
  npcs: ReadonlyMap<NpcId, NpcDefinition>;
  quests: ReadonlyMap<QuestId, QuestDefinition>;
}
```
Fail clearly on unknown IDs, recipes referencing missing items, fish missing habitats, quests referencing missing speakers/next quests/reward items, duplicate persistent IDs, and invalid objective quantities. Story text may be revised, but quest IDs, objective IDs, and unlock IDs are persistent contracts once a save can contain them.

# 9. Input, Modes & Cameras

Map physical input to semantic actions:
```ts
type GameAction =
  | "move-forward" | "move-backward" | "move-left" | "move-right"
  | "interact" | "use-primary" | "use-secondary"
  | "open-inventory" | "open-map" | "open-journal" | "pause"
  | "fish-reel" | "fish-slack" | "fish-brace" | "fish-left" | "fish-right"
  | "fishing.toggle-lure";
```
Fishing minigames are driven by held-state `fishing` (`isReeling`, `isSlacking`, `isBracing`, `rodDirectionAngle`) plus `fish-left` / `fish-right`, not only discrete reel/slack/brace actions. Keyboard and touch steering share the same ±0.6 semantic clamp. `fishing.toggle-lure` explicitly arms or puts away the crafted lure before a cast/hook; preparation does not consume it.

Modal rules: inventory may pause movement; **basic-fishing and sport-fishing block inventory**; modal disables boat steering. Pause is an overlay (`GameOverlay` includes `"pause"`), not a `GameplayMode`. It suspends simulation while open and MUST NOT be persisted as a serializable sim mode.

Explicit gameplay modes (`GameplayMode`; excludes overlay-only `"menu"` / `"paused"`):
```ts
type GameplayMode = "on-foot" | "farm-placement" | "basic-fishing" | "sport-fishing" | "boat-driving" | "mounted";
```
Never infer mode from mesh/UI state.

Cameras react to `GameplayMode`, never decide gameplay:
- on-foot: 3/4 third-person, damping, moderate zoom, readable farm placement;
- boat: wider chase, visible horizon/forward waves/schools;
- sport fishing: tighter, visible line/fish direction, unobstructed HUD.

Reduced-motion sport fishing keeps a damped static two-subject framing but disables behavior choreography, camera trauma, and terminal cinematic beats.

`ModeController` owns gameplay mode plus the modal/overlay stack. `InputRouter` maps physical input to semantic movement, camera and action intents; camera orbit/zoom is presentation input and never becomes simulation state. `FarmingActionController` may time an authored presentation clip, but only its commit callback may call a simulation command; interruption before commit must leave gameplay state unchanged.

# 10. World Scope

Large intentional authored region:
```text
Northwest farm district: starter land, farmhouse, working yard, Act 1 garden
Northeast village hub: plaza/market, mill pad southwest of the courtyard, inn, cottages, barn, contracts, private homestead garden, orchard fringe
River corridor: freshwater fishing, bridge, east-bank river-crossing gateway (not a village)
Southwest headland: cliffs, lighthouse, coastal walk
Southeast harbor: fish market, dock, boat vendor, fuel/ice
Coast and offshore: coastal and higher-value sport fishing
```
The loop is farm → village hub → harbor. Spawn and the northwest farmhouse stay on the starter farm. World `(0, -5)` is the river-crossing apron after the bridge, not a fake village. `market.village` and the arterial road hub sit on the northeast plaza near `(54, -52)`. The mill pad sits southwest of that courtyard so the packed plaza stays an open market square. The current world is a finite, deliberately authored multi-district composition rather than an unbounded or runtime-procedural map: its implementation uses a 600 m terrain field with explicit world and sailing bounds, while `WORLD_LAYOUT_V5` is a retained symbol whose live layout revision is 9. `WorldLayout` owns side-aware longitudinal river profiles and district fields; `WorldCompositionField` derives deterministic habitat, route, opening, and category-density causes from those authored owners. Hashed candidates are stable presentation addresses, never geography or serialized gameplay truth. Every arterial route and scenic trail must connect gameplay, navigation, a landmark, or an intentional vista; do not create empty distance for its own sake. Use deterministic layout data and preserve strategic travel rather than tedious traversal. Runtime chunk streaming is not implemented.

# 11. Physics & Water

Use Rapier only where collision response matters: player/world, boat/world, dock, shoreline, simple vehicle/rigid gameplay props. Every registered terrain patch gets its translated heightfield collider; there is no single-origin terrain assumption. Boats ignore land heightfields and remain constrained by the shared marine/sailable field, mooring rules, and authored progression gates. Avoid full physics for crops, fish AI, fishing line, waves, UI, decorative props unless required. Fishing line is simulation math. `PhysicsWorld` implements the `PhysicsAdapter`; it returns a validated pose frame, and `Simulation`/the navigation domain is the only layer allowed to commit that frame into `GameState`. Physics may sample presentation `WaterSurface` for boat bob; **canonical `boat.y` stays at the waterline** so save/load never depends on wall-clock wave height. Camera sweeps and interaction line-of-sight queries are presentation/application services, not gameplay authority.

Character motion follows the same one-way boundary. Fixed-step physics resolves the capsule, support, velocity, grounded/airborne/contact evidence, and requested gait; interpolation may carry that transient sample into rendering, but no mixer time, gait phase, stance lock, spring state, socket constraint, or bone transform is serialized or written back into simulation. Locomotion clips are in-place presentation whose phase and playback rate follow resolved travel. Authored walk/run starts are eligible only when their terminal pose is exactly equal to phase zero of the corresponding loop; the controller hands off at that phase instead of restarting the gait. During authored moving stance phases, post-pose foot constraints sample `WorldLayout.traversalSurfaceSample` so terrain, road, bridge, pier, and interior support remain consistent with physics. Neutral human and animal idles preserve the authored rest support chain without terrain-driven foot locks or slope tilt. Authored grip/seat markers own tool, carried cargo, fishing, rowing, boat, and mount alignment; parent changes or presentation discontinuities must release world-space locks and stale blend/spring history. Boarding, docking, mounting, and dismounting remain presentation-only spatial transitions: they preserve the first-frame world pose across reparenting, follow the simulation-owned moving target, and finish with an exact lock to its authored terminal anchor.

The river is canonical landform topology, not a symmetric visual mask. `WorldLayout.riverSectionAt()` owns longitudinal bed elevation, thalweg movement, independent left/right water widths and bank runs, floodplain shelves, curvature response, and estuary influence. `riverBankSample()` exposes side-aware channel, bank, wetness, erosion, and deposition causes to terrain, materials, vegetation, rocks, navigation, and fishing-access queries. Compatibility helpers may summarize that profile, but authoritative water sign, walkability, placement, and bank consumers use the side-aware sample.

MVP water: attractive, animated, readable shore, weather-controlled roughness, mid-tier acceptable, clear boat silhouettes. The global water sign is the union of registered closed coast fields: land wins when any island reports dry ground. `MarineSample` owns signed shore distance, bathymetry, shelter/exposure, reef/shallow influence, wave/flow directions, navigation hazard, and normalized ecology weights. Simulation owns `sea roughness`, `wind`, `risk`, locality, and progression gates; renderer owns waves/normals/foam/reflection approximation. Rectangular shore-profile textures preserve meters per texel and per segment instead of stretching the old square profile. Do not begin with expensive ocean simulation.

# 12. Art & Asset Runtime Contract

Visual authority: `04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md`; production authority: `LLM_AGENT_ART_PIPELINE_INSTRUCTIONS.md`. Architecture only requires a handcrafted, coherent stylized coastal world; no mismatched hyper-real PBR, toy/mobile look, candy saturation, generic fantasy UI, clutter, excessive bloom, AI texture artifacts, inconsistent scale, or toon/ink outlines.

Canonical visual-system ownership:
- `PaletteTokens` / `PaletteMaterials` own production color/material vocabulary. Production render code and generated assets MUST reference approved tokens/material families rather than scattering arbitrary colors or one-off materials.
- `VisualRenderConfig` owns the renderer color pipeline, exposure, primary sun/fill setup, shadow quality tiers, AO/contact policy, atmosphere defaults, post-processing baseline, and live ground supporting-map sampling/blend strengths. Scene/zone code may request semantic conditions such as time-of-day or weather; it MUST NOT invent local exposure/tone-mapping/light hacks or a second ground-texture contract.
- The approved renderer/material baseline is established by the gold-standard art slice in `03` + `04` + Art Pipeline and then treated as a regression-controlled contract.
- Pixel-level screenshot regression compares the game to its own approved benchmark states; style-reference review compares visual language to supplied references and intentionally ignores layout/camera differences unless composition is the task.

Canonical ground-presentation ownership:
- Authored world-layout data owns terrain height/normal queries, route centerlines and profiles, farm/structure clearances, water/shore relationships, and other semantics that affect traversal or interaction. Rendering may derive surface weights, road/shore influence, wetness, disturbance, and vegetation-density signals from those owners; the derived representation is presentation data, not a second world or gameplay authority.
- River water, bed, bank, floodplain, wetness, erosion/deposition, fishing access, and riparian placement derive from the same `RiverSectionProfile` / `RiverBankSample` contract. Independent absolute-distance masks are not permitted for those consumers.
- Structural vegetation and ground cover derive from inspectable district/habitat/route/opening/category fields with independent stable candidate streams. Quality tiers retain stable priority prefixes; accepted-array indices, shared coordinates between categories, fixed lattice rows, and manual seeded overrides are not placement authorities.
- The current layout exposes `terrainBaseHeight()` for the graded landform and final `terrainHeight()` for the save/placement/anchor/normal authority. Final height adds the deterministic, nonnegative road cross-section sampled from route identity, distance along route, and lateral distance. Rapier uses `terrainBaseHeightfield()` for the coarse landform plus an exact static road trimesh built from the same indexed geometry rendered by Three.js; catalog bridge collision remains the bridge-deck authority.
- Terrain color/material blending, road geometry, shoreline dressing, and ground-cover placement MUST consume the same route/shore/clearance semantics. Do not hand-tune independent masks in several render modules until roads, terrain, cover, map projection, and collision disagree. Supporting maps enrich meso/fine wear after palette remap; they cannot author a second path width, meadow mask, or collision silhouette.
- Any road cut, crown, rut, bench, bank, or other deformation that materially changes the walkable surface MUST be represented by the canonical height/normal contract consumed by rendering, Rapier, placement validity, and affected anchors. Cosmetic shader displacement is allowed only when it remains below a gameplay-camera-visible render/collision mismatch and cannot affect traversal or placement; otherwise it is a topology/layout change, not a rendering-only effect.
- A derived ground field may be analytic, mesh attributes, a compact chunk/control texture, or another measured representation. Choose the simplest form that preserves deterministic regeneration, inspectability, filtered transitions, and browser budgets. Channel packing, texture resolution, noise frequencies, and shader thresholds are implementation/config details, not save schema or permanent art doctrine.
- Rendering-only changes to normals, material fields, road surface presentation, supporting maps, cover density, or precipitation wetness have `Save-impact: no` and `Migration required: no` only while canonical topology, route/structure anchors, collision, placement validity, and serialized world data remain unchanged. A topology/layout revision that changes gameplay reachability or persistent coordinates follows the normal save/layout migration protocol.

Runtime asset contract: **GLB/glTF 2.0** for static 3D prefabs; never runtime `.blend/.fbx/.obj`. Ground supporting maps are the documented non-GLB exception: local processed images loaded only through `ExternalSurfaceTextures`, never as catalog IDs or a parallel exporter.
- Character animation sources may be declared as catalog-owned, repository-local authoring inputs. The generator may retarget a selected source clip only when its relaxed pose, axes, proportions, and usable joint ranges are compatible with Neva's canonical semantic rig. Repeated locomotion that fails that test is authored directly on the Neva rig with catalog-owned duration, reference speed, and contact markers; a source clip may remain motion reference rather than exported motion. Every path strips source meshes and root motion and exports in-place 30 FPS presentation clips, so the source library never becomes a runtime dependency.
- Static prefabs: catalog entry, with its optional closed `referenceAuthoring` evidence-to-generator brief when image/study guided → the brief binds identity-defining layout into catalog `parameters` → registered deterministic Blender Python family generator consumes those keys (optionally composed from shared `common/authored.py` construction helpers) → raw GLB → Khronos validation → glTF Transform dedupe/prune/weld + Meshopt → revalidation → atomic publish. A reconstruction study may inform the brief; it does not authorize a direct runtime TypeScript factory or second exporter.
- Ground supporting maps: processed CC0 derivatives published under `public/assets/textures/terrain/`, provenance and URLs owned by `src/render/materials/ExternalSurfaceTextures.ts`, sampling/blend strengths owned by `VisualRenderConfig`. They occupy the Art Bible's low-frequency tiler slot and must remap into `PaletteTokens`; photographic RGB is not final albedo. See Art Pipeline section 6.2.
- Dynamic systems: Three.js TS buffer/procedural builders (water, crop stages, seasonal tint, dynamic fish, debug proxies).
- Conventions: `1 unit = 1 meter`, Y-up, consistent forward, applied transforms, stable names/pivots, material reuse.

Machine ownership is explicit:
- `assets/specs/asset-catalog.schema.json` validates the single generated-asset catalog.
- `assets/specs/asset-catalog.json` owns asset IDs/files/families, generator names, seeds, dimensions, palette tokens, triangle floors/targets/maxima, material caps, pivots, collision primitives, instancing, LOD, required nodes, read distance, generator parameters, optional reference-authoring source/hierarchy/review contracts, and character rig/socket/animation contracts.
- `art/palettes/neva.palette.json` owns semantic palette tokens used by Blender and runtime material APIs.
- `tools/blender/asset_budgets.json` owns scene profiles, texture ceilings and the catalog pointer; it does not duplicate per-asset budgets.
- `src/render/config/VisualRenderConfig.ts` owns the live renderer baseline, including terrain/road supporting-map sampling and blend strengths. Canonical Markdown documents ownership, not a frozen copy of those numbers.
- `src/render/materials/ExternalSurfaceTextures.ts` owns supporting-map provenance, source pages, runtime URLs, wrap/filter/color-space, and the 1px load fallback. `public/assets/textures/terrain/` stores the published files; it is not a filename-list authority.
- `tools/blender/cli.mjs` is the public automation entrypoint. Its `brief` command validates and renders any reference-authoring contract without running Blender; this is authoring readiness, not visual approval. `bootstrap.py`, `generators/registry.py`, family generator modules and `common/*` are internal implementation layers. In particular, `common/authored.py` centralizes reusable deterministic mid-scale forms such as masonry courses, shingles, planks, lattice/rope, arch rings and fasteners; it must remain subordinate to the catalog entry and owning registered family generator.
- `vite.config.ts` derives the browser's virtual runtime-catalog projection directly from the same JSON at build time and includes only loader/placement fields. Generator parameters, budgets, source URIs, and reference-authoring evidence must not ship in the client bundle. Never check in a second runtime catalog as an authority.
- `tools/art/codegen.mjs` derives `src/render/assets/AssetCatalog.generated.ts` (typed `ASSET_IDS`, family names, and family maps). `dev`, `build`, `typecheck`, and `test` refresh it; CI/review should also run `npm run art:codegen:check`. The generated adapter is never hand-edited.
- `tools/vite/runtimeAssetCatalogPlugin.ts` hot-refreshes codegen and serves the runtime-only virtual catalog; `tools/vite/artYardPlugin.ts` serves the dev-only `/__neva_art_yard` and staged `/__neva_art_stage/run-ID` review paths. The yard reuses `AssetLoader`, `VisualRenderConfig`, `PaletteMaterials`, and `LightingRig`, and is not part of the production build.
- `generated/.cache/art/` stores validated optimized GLBs by per-asset input/toolchain hash. It is disposable acceleration state, not a publish directory or authority. Release/shared-generator `art:determinism` bypasses it and regenerates both passes from the generator; routine asset work keeps the cache enabled and does not double-generate.

Runtime ownership is also one-way: generated IDs/families and the Vite runtime projection consume the canonical JSON, `src/render/assets/AssetCatalog.ts` adapts the typed/runtime projections, `AssetLoader.ts` loads Meshopt GLBs through the canonical cache/clone path, and static compatible prefab instances may be consolidated with `THREE.BatchedMesh`. Simulation remains authoritative; catalog metadata, collision proxies, animation clips, and scene nodes never become gameplay truth.

Example stable nodes: `boat_skiff_root`, `boat_skiff_cargo_01`, `boat_skiff_hook_left`, `house_farmhouse_a_root`, `crop_wheat_mature_root`, `fish_trout_a_root`.

Publication/report boundary:
- `generated/reports/asset-manifest.json` plus `public/assets/models/asset-manifest.json` describe the last atomically published set.
- `generated/reports/asset_budget_report.json` describes the latest `generate` attempt, including a rejected strict candidate; it is a quality report, not proof of publication.
- `generated/.cache/art/` and the dev art yard may expose cache/input hashes and hit/miss status for review, but neither replaces the generated/public manifests or human approval.
- Release determinism and benchmark commands must not replace the canonical quality report or publish assets. Static Blender preview generation is not part of the pipeline; the development Art Yard is the sole asset-review surface.

MVP guardrails:
```text
Initial playable download: target <20 MB
MVP compressed total: target <80 MB
High-quality gameplay target: 250k–900k visible triangles, <=220 draw calls preferred
High-quality hard ceiling: 1.5M visible triangles, <=300 draw calls
Textures: follow `04` as the normal target — 128–256 tiny, 256–512 normal props, 512–1024 hero assets; 2048 is rare/shared/exceptional. Any 1K–2K allowance here is a ceiling, not a default.
Repeated crops/props: instancing/material reuse
```
These are scene envelopes, not instructions to spend triangles uniformly. `tools/blender/asset_budgets.json` owns the exact scene/texture profiles; `assets/specs/asset-catalog.json` owns each asset's production floor, quality target, hard maximum, material limit, and LOD policy. `VisualRenderConfig` owns the richer live renderer configuration in `src/render/config/VisualRenderConfig.ts`; the guide documents ownership and invariants, not a second frozen copy of that object. `04` explains how to spend the budgets. Use glTF Transform where appropriate.

# 13. UI & Accessibility

WebGL renders world; DOM renders inventory, market, journal, farm selection, boat management, contracts, settings, tooltips.

Normal HUD: compact clock + gold top-right; slim quest (and weather warnings) top-left; Work/Sprint bottom-left; bottom-center context prompt and 5-slot tool hotbar; temporary fishing/boat status. Dialogue is a contextual DOM overlay opened only from an authoritative nearby NPC interaction; the journal exposes the current story title/objective and completed quest history without becoming a permanent dashboard. Persistent HUD target: **<20–25%** desktop viewport.

UI style should use centralized CSS variables, not scattered hardcoded colors. Visual details remain under `04`.

Baseline accessibility: keyboard support, readable contrast, UI scaling, audio sliders, reduced motion, clear focus states, non-color-only tension feedback. Tension communicates through position/shape/sound and optionally color.

# 14. Audio & Domain Events

Audio categories: `master`, `music`, `ambience`, `weather`, `boat`, `fishing`, `ui`. Fishing feedback MUST include cast, bite, reel, strain, near-snap, splash, catch, snap/escape so fishing is not meter-only. Narrative feedback may respond to `NpcTalked`, `QuestStarted`, `QuestProgressed`, `QuestCompleted`, and `ActCompleted`, but audio must reinforce a real state transition rather than invent one.

Use explicit domain events such as `CropPlanted`, `CropMatured`, `CropHarvested`, `FarmFertilized`, `IrrigationInstalled`, `FarmIrrigated`, `RecipeStarted/Completed`, `FishSchoolSpawned/Activated`, `FishHooked/Escaped/Caught/Stored`, `BoatDocked`, `ItemSold`, `MarketTicked`, `WeatherChanged`, `ProficiencyRankUnlocked`, `ContractCompleted`, `NpcTalked`, `QuestStarted`, `QuestProgressed`, `QuestCompleted`, and `ActCompleted`. Success events are emitted only after their atomic mutation succeeds. `QuestCompleted` is published only after the active pointer has advanced to the next quest or epilogue, so persistence and presentation listeners observe one coherent transition. Events may feed UI/audio/analytics/achievements/diagnostics; do not turn simulation into one opaque event bus. Narrative events are signals, not a replacement for `GameState.quests` or the content registry.

# 15. Error Recovery & Diagnostics

Never soft-lock:
- zero fuel → **Emergency Tow** (money + time);
- lost boat → **Recall Boat** when not carrying valuable physical cargo;
- full inventory at harvest → keep on plant, temporary ground crate, or block with clear message; never destroy harvest;
- corrupt save → primary → backup → `new-game-confirm` overlay (autosave blocked until confirm). Unavailable IndexedDB → continue without saving; writes stay blocked.

Debug panel: FPS, frame time, draw calls, triangles, coordinates, region, mode, game time, weather, market tick, active schools, save state, world seed.

DEV layout editor (`F2` / `?place`, Vite `import.meta.env.DEV` only): presentation picking of discrete world objects. It is not a `GameplayMode` or `GameAction`. Dropped poses write the owning layout TypeScript via `/__neva_layout_editor/commit`; this session also debug-relocates simulation structures, market/station interact anchors, and Rapier static colliders. DEV skips static mesh merging and the baked sun-shadow proxy so picks hit live meshes and colliding meshes self-cast and follow the move. Copy/paste (`⌘/Ctrl+C` / `⌘/Ctrl+V`, or `⌘/Ctrl+D` duplicate) inserts a new catalog instance for props, fences, authored details, seeded trees (as a new authored pin), and interior furniture. Delete/Backspace removes those same kinds from source (`PLACEMENT_REMOVED` / `FARM_FENCE_REMOVED` for generated instances). Unique gameplay objects (farmhouse, mill, NPCs, landmarks, architecture pads) cannot be copied or deleted. Grass scatter, crops, boats, and the player stay undraggable. Operational owner: `LLM/LAYOUT_EDITOR.md`.

Dev commands: advance time, force weather, spawn school, set demand, grant item/money, set proficiency, damage/repair boat, save/load/reset. Protect/exclude in production.

# 16. Performance & Testing

Representative performance states: empty starter area; full farm; harbor + boat; offshore + gulls/weather; sport-fishing HUD; rain/storm; inventory/market UI. Measure FPS, frame time, memory, draw calls, loading stalls. **Profile; do not optimize by intuition.**

Visual production is not deferred until late polish. P0.75 has explicit sub-gates: the human visual decision for the four gameplay-camera slices, current 189-asset published-manifest validation, and the measured benchmark contract. The recorded human visual decision unlocks further authored-world expansion; the benchmark and clean-source strict/determinism evidence remain technical-art/release certification gates. DEV layout-editor measurements are intentionally unbatched and are diagnostic, not production-equivalent proof. No sub-gate waives production minimums, hard maximums, material/node/palette contracts, or runtime validation.

Testing layers:
- **Unit:** pure growth/yield/quality/pricing/freshness/demand/capacity/rank rules.
- **Simulation:** fixed seed/state; same 300-minute advancement → same crops/schools/market.
- **Integration:** harvest→inventory; grain→recipe→chum; catch→cargo; cargo→market→money.
- **E2E:** boot/move/plant/harvest/fish/boat/sell/save/reload/resize. Release/gold-slice WebGL gates retain screenshot evidence; routine selected-asset work is integrated for human review in the actual game without agent screenshot capture.

Architecture gate before large gameplay implementation:
- [ ] project boots
- [ ] simulation independent
- [ ] renderer reads simulation
- [ ] seeded RNG works
- [ ] game clock exists
- [ ] IndexedDB save/load works
- [ ] migration framework exists
- [ ] content registry validates
- [ ] input mapping exists
- [ ] DOM UI root exists
- [ ] debug overlay exists
- [ ] Vitest works
- [ ] Playwright boots game
- [ ] screenshot capture works
- [ ] no gameplay truth in Three.js nodes

# 17. Architectural Anti-Patterns

Reject/refactor:
```text
huge Game.ts / Player.ts / World.ts
business logic in click handlers or Three.js objects
Math.random() in simulation
unversioned saves
hardcoded content in UI
duplicate inventory or clock systems
renderer-driven crop maturity
UI-driven sale prices
infinite inventories
sport fish item stacks
market updates every render frame
physics fishing line
per-scene exposure/tone-mapping hacks or arbitrary production colors
toon/inverted-hull/Sobel/ink outlines in normal world rendering
combat added as tension
```

# 18. Definition of Done

Any technical feature requires:
- [ ] correct subsystem ownership
- [ ] serializable state
- [ ] deterministic behavior tested
- [ ] save/load works
- [ ] UI communicates it
- [ ] renderer reflects it
- [ ] no duplicate state
- [ ] failure state handled
- [ ] tests/typecheck/lint/build pass
- [ ] browser behavior verified manually or automatically
- [ ] every canonical document the change makes stale is updated in the same change (see the documentation contract in root `AGENTS.md`); save/layout changes add their §6.1 ledger row

Any story-bearing feature additionally requires:
- [ ] a stable content owner and persistent IDs where progression can be saved
- [ ] a person/place/action/consequence connection that serves the current loop
- [ ] explicit simulation events or objective predicates for every mechanical beat
- [ ] contextual dialogue/journal presentation that can close and resume safely
- [ ] no hidden progression, invented player identity, or presentation-owned lore state

Architecture changes require human approval with: problem, current limitation, proposed change, affected modules, save impact, performance impact, dependency, alternatives, and why current architecture cannot solve it safely. Never silently introduce a new framework/paradigm.

# 19. Source-of-Truth Priority

1. Human's latest explicit instruction
2. `01_GAME_FOUNDATIONS_ARCHITECTURE.md` — technical authority
3. `02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md` — gameplay/balance/math authority
4. `04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md` — visual authority
5. `LLM_AGENT_ART_PIPELINE_INSTRUCTIONS.md` — art pipeline/procedural production
6. `ARCHEAGE_FARMING_SYSTEM.md` — agriculture adaptation
7. `03_PRODUCTION_ROADMAP_LLM_AGENT_PLAYBOOK.md` — milestones/execution
8. Current task
9. Existing code
10. Agent assumption

If code violates these specs, report the mismatch; do not use the violation as precedent.
