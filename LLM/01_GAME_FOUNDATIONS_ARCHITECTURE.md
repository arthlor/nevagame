# Farm & Fishing Browser Game — Game Foundations & Technical Architecture

> **Role:** Primary technical source of truth. Read it for architecture, simulation ownership, renderer contracts, persistence, cross-system work, and release/gold-slice gates. Routine existing-asset work follows the scoped route in root `AGENTS.md` and `BLENDER.md` without loading this file by default. If guidance conflicts, follow §19.
> **Migration ledger:** §6.1 of this file is the single owner of the schema/layout migration history. `02` and `03` reference it and must not restate it.
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

Start: an inherited family farmhouse and starter field, basic rod, seeds, minimal storage/money, river/lake access, and the village market. Long-term: stronger stewardship of the family farm and public commons, processing, skiff, offshore fishing, cold storage, contracts, specialized crops, fish-finding tech, larger vessel, deep-sea expeditions, and a mature coastal business. Private houses and farming ground are not market purchases.

Progression fantasy: `inherit a working home → buy supplies → self-produce supplies → serve the commons → reliable trips → optimize farm for fishing → choose profitable routes → predict world → operate maritime business`.

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
- `src/content/questTracks.ts` owns the parallel track definitions, entry quests
  and unlock predicates. Each track is a linear `nextQuestId` chain, not a branch.
- `ContentRegistry` validates and exposes that content; it is the single
  runtime content entry point, not a second story database.
- `QuestDomain` owns quest progression, target/location predicates, content-owned
  turn-in costs and rewards, `nextQuestId`, and quest-related domain events.
- `GameState.quests` owns only serializable progression truth: the main track's
  act, a quest/step/progress cursor per track, the focused track, completed quest
  IDs, feature unlocks, and hints. Dialogue
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

The main story spine and independently advancing side tracks share the
narrative-mechanical contract in `02` §0.1; their current membership, counts and
chains remain owned by `src/content/quests.ts` and `src/content/questTracks.ts`.
Contextual intro, completion, herald, talk-step, idle and milestone-recognition
dialogue remain content; one talk assembles them into a transient, ordered
conversation (`02` §0.1) and saves none of it. Parallel linear tracks do not introduce branching outcomes, romance,
a dialogue transcript, relationship state or a separate
lore-codex state. Those remain future content/system decisions, not permission
to invent local flags or parallel narrative state. The current `QuestState`
contract has no reserved dialogue-unlock field; its migration history belongs
to §6.1.

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
- **Application:** save/load, input, scene transitions, ticks, renderer sync, dialogue/modal orchestration, UI events. `GameApp` coordinates the lifecycle; startup world preparation and modal market/contract commands live in focused application modules.
- **Presentation:** displays DTOs; MUST NOT decide economic/gameplay outcomes. `GameUI` receives player position, a DEV-only diagnostic snapshot, and simulation-built catch data instead of the mutable `GameState`.

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

Representative state (`CURRENT_SCHEMA_VERSION = 60`, `world.layoutRevision = 30`):
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
`ContractState` also persists `deliveredValueMoney`, the sale value locked for new partial deliveries, and `legacyUnvaluedQuantity`, the older partial units whose individual grade or fish details cannot be reconstructed. Contract expiry and completion consume that ledger once in simulation; UI state does not own it.

### Startup and the first durable write

`src/app/StartupCoordinator.ts` owns one cancellable application attempt; `StartupState` phases/progress/recovery are transient and never enter `GameState`. `src/app/startup/prepareStartupWorld.ts` runs the required asset, scene and physics stages under that attempt, while `DebugStartScenario.ts` owns DEV starting poses. The HTML shell paints before the runtime import. Title inspection reads only storage; simulation construction and cooperative terrain/road/environment preparation begin on entry. `GameApp` prevents duplicate starts and owns the single animation loop, which does not render the hidden title world.

Entry rechecks the selected save and applies migration/offline adjustment to an independent candidate. No visibility, domain-event or periodic autosave may write during preparation. Required assets, world construction, physics, saved presentation, normal camera/environment, pipeline compilation and two rendered frames precede the commit. Continue's offline update and New Game's initial save share this boundary. `IndexedDbSaveRepository` atomically writes the previous primary to backup and the candidate to primary. A previous primary this build can open is backed up migrated; one it cannot open because an incompatible (newer-schema or other-layout) build wrote it is backed up verbatim, so replacing it never destroys the only copy. Unreadable primary data never replaces a recovered backup. Read failures and blocked/aborted/timed-out operations are unavailable storage, never an empty slot. Database operations have a 10-second bound; presentation has a 30-second deadline; transfer activity refreshes the asset stall deadline.

A failed commit retains the prepared world behind the loading layer and offers Retry save or explicit unsaved continuation. Unsaved sessions keep durable writes disabled. Other fatal startup failures require a full reload with save slots preserved. Cancellation reaches downloads, cooperative work and transactions; late physics resources are disposed. After the save commit, every entry may run a transient, skippable entry cinematic (`IntroVideo`, best-effort audio); a new game whose film cannot start falls back to the camera presentation (`OpeningCameraSequence`). Neither adds simulation time or saved flags, and a film failure never fails startup. Diagnostics, benchmark and reduced-motion sessions skip the cinematic. Input and accumulated frame time are cleared before control is released after the reveal. No schema or migration is introduced by this lifecycle.

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
| v22 | 8 | Remaps in-flight basic-fishing / cargo / journal fish quality from Stardew skins (`normal/silver/gold/iridium`) onto `FishQuality` (`common/fine/exceptional/trophy`), and normalizes the legacy journal fish count field (`caughtCount` → `catchCount`). Backfills `journal.unlockedKnowledge` to `[]` when missing. | No world move. Covered by `tests/simulation/huntFixes2026.test.ts` and the persistence validation/recovery tests. |
| v23 | 8 | Adopts the centered market model. Existing authored commodities are rebased to their catalog target supply with demand `1.0`, their authored price/throughput/season values are synchronized, and `lastTickMinute` advances to the saved clock so the new model does not replay stale hours from the broken equilibrium. Unknown fixture/mod content markets remain untouched. | No world move or inventory/cargo change. Persisted RNG state is preserved, but resumed future draws may diverge because market ticks no longer consume the shared RNG stream. Covered by `tests/fixtures/save_v22_layout8.json` and `tests/simulation/persistence.test.ts`. |
| v24 | 8 → 9 | Relocates player, mount, and structure poses invalidated by the layout-9 world revision, and pulls an in-flight sport-fishing line back onto reachable water. | Preserves boats, crops, farms, inventory, cargo, quests, journal, proficiencies, and persisted RNG state. Covered by `tests/fixtures/save_v23_layout8.json` and `tests/simulation/persistence.test.ts`. |
| v25 | 9 | Calendar retune. `DAYS_PER_SEASON` drops 30 → 6, so a stored `currentMinute` now resolves to a different season; the clock is rebuilt to re-derive `season`, `year`, and `dayCount`, and every market commodity's `seasonalModifier` is refreshed from its definition's `seasonalFactors` for the new season. Every `active` contract is voided once through the normal expiry refund path. | No world move, no shape change. Voiding is version-gated rather than reconciled every load, so partial produce is refunded exactly once; `ContractDomain.tick()` refills on the next tick. A player loses at most two in-flight orders. Covered by `tests/fixtures/save_v24_calendar30.json` and `tests/simulation/persistence.test.ts`. |
| v26 | 9 → 10 | Adds `island.sunreach`, its terrain patch, regions, warm climate, fishing ecology, farm, stations, cove market, and mooring. Existing schools derive ecology from position; an in-flight basic cast becomes `ecology.neva`; contracts gain their content-owned delivery market. | Preserves existing Neva player/boat/mount/crop/farm/inventory/cargo/quest/reward/RNG truth and adds only missing registry-owned Sunreach state. Covered by `tests/fixtures/save_v25_layout9.json`, `tests/simulation/persistence.test.ts`, and `tests/unit/sunreachWorld.test.ts`. |
| v27 | 10 | Moves the mount gallop budget onto each persisted mount: stamina, recovery delay, and exhaustion. Existing mounts start rested when these fields are absent. | No world move. Preserves rider sprint state and all non-mount truth; validation bounds the new fields through `MOUNT_TUNING`. |
| v28 | 10 | Adds explicit prepared-lure state, per-ecology/habitat fishing pressure and cooldown, plus hook-time tackle and sea-condition snapshots on active sport-fishing encounters. It backfills only absent dynamics members; validation now uses the hooked species' authored leap/dive bounds and covers every persisted dynamics field. | No world move. Defaults absent fields in place without changing any already-persisted active-fish dynamics or landing progress, cargo, school association, Work, progression, or either RNG stream. Save-fixture and migration-test evidence remain pending under the source-only no-tests boundary. |
| v29 | 10 | Splits quest progress into one cursor per track. `QuestState.activeQuestId` / `activeStepIndex` / `stepProgress` become `tracks: Record<QuestTrackId, QuestTrackProgress>` plus `focusedTrackId`, and `unlockedDialogueIds` is dropped — it was declared, validated and migrated since v8 without ever being read or written. | No world move. The single pre-v29 cursor becomes `track.main` verbatim, so no objective progress, reward or completion is replayed or lost; `activeActId`, `completedQuestIds`, `unlockedFeatureIds` and `hintsShown` carry through untouched. Fixture `tests/fixtures/save_v28_layout10.json` with migration and resume coverage in `tests/simulation/questPersistence.test.ts`. |
| v30 | 10 | Adds optional `deepChumUntilMinute` timestamp to `activeSchools` so sinking chum can persist its sinker-species hook bias. | No world move. Preserves existing schools, frenzy windows, catch potentials, player/boat/cargo/contract/RNG truth. Covered by fixture `tests/fixtures/save_v29_layout10.json` and `tests/simulation/schoolChum.test.ts`. |
| v31 | 10 → 11 | Adds Neva's northern mountains, foothills, spring/overlook trails, and finite elevated river source. Re-grounds Neva structures and land poses through canonical support; deterministically moves unsafe players/mounts to dry slope-safe ground. Only boats invalidated in the changed upper reach move to type-compatible Neva moorings. Repairs affected fishing geometry and schools in compatible downstream water. | Keeps valid X/Z and boats, Sunreach, protected working ground, downstream river/fishing access, ownership, cargo, supplies, upgrades, crops, inventory, resources, catch progress, clocks, and RNG. Active fishing retains distance, depth, spool and landing progress; no synthetic catch or resource debit. Historical validators keep their own layout requirements. Covered by `tests/fixtures/save_v30_layout10.json`, `tests/simulation/terrainLayoutMigration.test.ts`, and `tests/unit/starterIslandPreservation.test.ts`; backup failure and repeat-load stability are explicit migration tests. |
| v32 | 11 → 12 | Extends Neva to a natural ocean-bounded island on all four sides (high northern sea cliffs at z ≈ -230, western beaches at x ≈ -190, eastern channel bluffs at x ≈ 184) with circumnavigable open ocean water, adds `western-beach-trail` and `northern-bluff-trail`, expands WORLD_BOUNDS to [-220, 200] × [-250, 130]. | Re-grounds on-foot Neva player and structures; validates mounts; preserves valid boat moorings, crops, farms, inventory, quests, progression, and RNG state. Covered by the independent `tests/fixtures/save_v31_layout11.json` and `tests/simulation/terrainLayout12Migration.test.ts`, including unsupported coastal players/mounts, cargo-bearing vessels, active fishing, school timers, resource/RNG preservation, repeat loads and failed-primary backup preservation. The fixture is a constructed legacy envelope derived from the planted v30 fixture with the v31/layout11 tags, not a captured historical session and never output from migration v32. |
| v33 | 12 → 13 | Rebuilds the harbor beach and landing profiles with continuous natural shoreline bathymetry and sand coverage, adds `harbor-beach-path` and `harbor-rocky-landing`. Re-grounds Neva players, mounts, and structures to updated terrain elevations; safely re-moors invalid boats and relocates invalid schools. | Preserves all player items, crops, farms, cargo, progression, quests, and RNG. Valid x/z poses are preserved and re-grounded; newly invalid shore or catalog-collision poses use deterministic nearby support. Boat holds, supplies, gear, mounted relationships and active fishing progress are retained. Covered by independent fixture `tests/fixtures/save_v32_layout12.json`, `tests/simulation/harborCoastMigration.test.ts`, and the Neva terrain regression tests. |
| v34 | 13 → 14 | Adds trail arrival compositions, village working props and denser riparian dressing. | `migrateTerrainLayout14` preserves clear poses, all resources, quests, journal, clock and RNG; relocates intersecting Neva player/mount poses through catalog collision boxes and preserves active fishing reach. Fixture: `tests/fixtures/save_v33_layout13.json`; coverage: `tests/simulation/worldDressingMigration.test.ts`. |
| v35 | 14 | Adds `quests.earlyActionCredits`, the opt-in early-action credit ledger that lets a tutorial objective be satisfied by work done before it activated. Repairs saves the old rules could strand: a save on `step.act1_water_3_crops` whose starter-garden crops are already living and wet is credited the watering it is owed; a save sitting exactly on `step.act2_compost_worms` while holding `item.bait_worms` receives a one-time legacy completion; an in-flight `recipe.compost_worms` job at `struct.starter_compost` is clamped to the onboarding pace of 12 in-game minutes. | No world move and no layout change. The watering repair is written as a credit, not as progress, so redemption keeps a single code path and cannot exceed the objective target. Worm ownership counts as recipe evidence only inside this version gate — never during normal play, and never for a new game, which no longer starts with bait worms. The compost clamp is gated on `quest.act2_harvest_and_compost` being incomplete, so a veteran's authored six-hour run is untouched. Preserves inventories, crops, farms, boats, progression, journal, clock and RNG. Fixture: `tests/fixtures/save_v34_layout14.json`, a constructed legacy envelope derived from a planted new game with the v34/layout14 tags, not a captured session. Coverage: `tests/simulation/onboardingCreditsMigration.test.ts`, `tests/simulation/questEarlyActionCredits.test.ts`, `tests/simulation/onboardingPace.test.ts`. |
| v36 | 14 → 15 | Gives mature oak, maple, pine and apple trees a lower-trunk collider and large field and coastal boulders a main-body collider, so roughly 600 previously walk-through props now block. Replaces the seeded-fill blanket ban on colliding assets with an allowlist keyed on catalog family (`vegetation`, `rock`), so scattered trunks may block while a building or dock placed by seeded fill still cannot. | `migrateTerrainLayout15` moves only a player or mount that loads inside a new collider, and only to the nearest valid support; world transactions, crops, farms, inventories, cargo, contracts, progression, journal, clock and RNG pass through untouched, and active fishing keeps its reach. Colliders are trunk-width and clear a standing actor's head; saplings, bushes, reeds, pebbles, reef and all ground cover stay passable. Measured: the new colliders block 0 of 1031 authored route samples and no station approach, door, market or dock boarding point. Fixture: `tests/fixtures/save_v34_layout14.json`. Coverage: `tests/simulation/treeRockCollisionMigration.test.ts`, `tests/unit/worldLayout.test.ts`. |
| v37 | 15 | Adds permanent player equipment, clothing presets, immutable processing-job result/economy snapshots, and the hook-time sport-fishing equipment snapshot. Legacy players receive the neutral starter outfit and tools. Pending known jobs are reconstructed from frozen v36 recipe payloads; already-collected tombstones are removed, and an unknown or incoherent pending job fails migration instead of silently substituting current content. Registered markets also reconcile v36 commodity membership: still-authored commodity state is preserved, current missing entries follow the existing market backfill, and retired listings are removed instead of making the entire save unreadable. The shipping validator binds snapshot Work/XP to its tier and rejects inconsistent status/timeline arithmetic, unbounded labels/durations, duplicate or oversized result stacks, and impossible collection payloads. | No world move. Preserves inventory, crops, boats, cargo, quests, proficiency, Work, still-authored market values, clock and RNG truth. A valid pending job keeps its frozen recipe result and remaining completion bound; an overdue legacy active job becomes complete, while a complete-before-deadline or malformed timeline is rejected. A legacy active sport encounter keeps its fight state with neutral equipment multipliers. Fixtures: `tests/fixtures/save_v36_layout15.json` and `tests/fixtures/save_v36_retired_market_commodity.json`; coverage: `tests/simulation/persistence.test.ts` and `tests/simulation/equipmentCraftingSystem.test.ts`. |
| v38 | 15 → 16 | Reshapes Neva's broad uplands and Sunreach's dry shoulders around retained work pads, routes, shorelines and the seasonal wash. | `migrateTerrainLayout16` re-grounds structures and land actors on either island, keeping valid horizontal poses and recovering obstructed or steep poses to nearby support on the same island. Mounted attachment, equipment, pending jobs, inventory, cargo, progression, clock and RNG remain intact. Active bank fishing constrains recovery to its existing reach and ecology; vessels and wet topology are unchanged. Fixture: `tests/fixtures/save_v37_layout15.json`, a complete new-game envelope retained before the terrain edit. Coverage: `tests/simulation/landscapeOverhaulMigration.test.ts` and the existing persistence/terrain suites. |
| v39 | 16 → 17 | Joins Sunreach's land and seabed continuously through sea level within a bounded coastal band and closes missing faces in the shared road-end caps. The closed coast, inland anchors, route centerlines, marine membership and offshore depth stay fixed. | `migrateTerrainLayout17` re-grounds Sunreach structures and recovers land actors onto nearby support using canonical mount validity and catalog collision. Neva actors at repaired road ends are re-seated vertically without changing X/Z; other Neva poses, interiors and boats remain untouched. Mounted attachment, bank-fishing reach/ecology, crops, farm ownership, jobs, inventory, cargo, progression, clock and RNG are preserved. Fixture: `tests/fixtures/save_v38_layout16.json`, migrated from the retained synthetic v37 new-game fixture before this shore edit, not a captured player session. Coverage: `tests/simulation/sunreachShoreMigration.test.ts`, `tests/unit/sunreachShore.test.ts` and `tests/unit/roadGeometry.test.ts`. |
| v40 | 17 → 18 | Moves the public Village Commons away from the village-market courtyard to an authored three-bed field on Neva, and publishes the Commons gate, working props and route junction. Existing Commons crop records are remapped into the new beds; land actors and custom structures saved in the former footprint are re-grounded at the new entrance. | Preserves crop IDs and state, farm ownership, inventory, cargo, quests, progression, clock, boats, journal and RNG. Only poses, the Commons farm `widthMeters`/`depthMeters`, and farm-local crop coordinates affected by the relocated Commons are changed. Coverage: the retained `tests/fixtures/save_v38_layout16.json` through the v39 → v40 migration chain and `tests/simulation/farmingPerfection.test.ts` Commons relocation regression coverage. |
| v41 | 18 → 19 | Retains the relocated public Village Commons but narrows its playable soil to three clearings inside two authored beds. Existing v40 Commons crop records are normalized into those clearings by stable farm order; the mature crops dressing the remaining soil are renderer-only and are never saved or harvested. | Preserves crop IDs, growth/moisture/health/quality state, farm ownership, inventory, cargo, quests, progression, clock, boats, journal and RNG. Only the Commons farm `widthMeters`/`depthMeters`, its farm-local crop coordinates and the world layout revision change. Coverage: the retained `tests/fixtures/save_v38_layout16.json` migration chain plus `tests/simulation/farmingPerfection.test.ts` layout-19 normalization regression coverage. |
| v42 | 19 → 20 | Adds the open-ocean islet archipelago and translates pre-v42 Sunreach poses with `x >= 300` into the expanded world. Vessels obstructed by new islets move to the nearest valid sailable water; a stranded on-foot player is recovered to walkable ground on the same island. | Preserves ownership, holds, fuel, catch, crops, contracts, clock and RNG; only affected X/Z poses move. The runner reconciles by the stored layout revision, so a development slot tagged v42 while its layout still trails runs this step instead of reading corrupt; a slot that already walked the version chain ends at the shipping revision and is untouched. Fixture `tests/fixtures/save_v41_layout19.json`; coverage `tests/simulation/oceanExpansion.test.ts`. |
| v43 | 20 | Work Capacity becomes a daily labor budget. The legacy 1,000-point pool is rescaled to the new `WORK_CAPACITY_MAXIMUM` (500) preserving how full it was, and the daily earning tallies (`earnedToday`, `earningsDay`, `mealsToday`, `laborUsedToday`, `passiveRegenSeconds`) are introduced. | No world move. Preserves `regeneratedAtMinute` and all other player truth. `tests/simulation/workCapacityMigration.test.ts` and `tests/simulation/workEconomy.test.ts`. |
| v44 | 20 | Drops capability ids a pre-v9 build wrote into `journal.unlockedKnowledge` when it granted `quest.rewards.unlocksFeature` to both the feature list and the knowledge journal. | No world move and no capability loss: `quests.unlockedFeatureIds` already carries the unlock, so the journal keeps only registry-owned knowledge ids and the validator may reject unknown ones. Fixture `tests/fixtures/save_v41_layout19.json` with injected legacy ids; coverage `tests/simulation/knowledgeJournalMigration.test.ts`. |
| v45 | 20 | Authors the farm kitchen (`struct.kitchen`, `stationType: "kitchen"`, `building_farm_kitchen_a`) in the yard pocket southeast of the farmhouse and moves the three meal recipes off the workbench. | No world move except the new structure; the starter farm gains the placement, and any in-flight meal job at the workbench follows its recipe to the kitchen so `station.type === recipe.stationType` keeps validating. Coverage `tests/simulation/kitchenMigration.test.ts` and `tests/simulation/workEconomy.test.ts`. |

| v46 | 20 | Adds the inherited horse carriage beside the farmhouse, with two empty physical fish-cargo slots. | Existing player, donkey, cargo, inventory, crops, quests, world layout, clock and RNG remain intact. Retained pre-change new-game fixture `tests/fixtures/save_v45_carriage_predecessor.json`; migration, idempotence, loaded driving and cargo-link validation in `tests/simulation/carriage.test.ts`; repository backup behavior in `tests/simulation/persistence.test.ts`. |

| v47 | 20 → 21 | Re-authors the finite upper reach as a stepped watercourse: a lip crest at z = -136 (12 m), an explicit falling segment of 7.5 m down a 1.5 m run (grade 5.0) to the landing at -134.5 (4.5 m), easing into the pool shelf held at 3.5 m from -128 to -124 before the flush sea-level handoff at -116. `NEVA_HEADWATERS.fall` publishes that segment; catalog-backed lip rock (three per rim, placed on cells that pass the footprint-stability contract) frames the crest, with an additional spire and boulder closing the open east shoulder so the upper channel cannot be read over the skyline, and the water mesh spends its own finer row spacing across the fall face. The surrounding cirque is raised around the locked reach (headwater-east-crag, spring-headwall; source, lip, landing, pool and handoff numbers unchanged) so the fall emerges from the mountain. The pool shelf is carved as an authored plunge basin (`NEVA_HEADWATERS.pool`, centred at z = -130): 10.7 m wide and 2.5 m deep against 6.0 m / 0.75 m at the lip, relaxing back toward the outflow, with two embedded catalog rim outcrops. | Only the declared headwater envelope (x -55…+20, z -186…-110) may change. Persistent poses inside it keep their X/Z when still valid standing ground (Y re-derived), otherwise move the shortest distance to the nearest valid standing ground on the same reach; the spring rest stop is the last-resort anchor, and a hull written inside the non-sailable headwater is re-docked at the harbor mooring. Inventory, cargo, farms, crops, quests, progression, clock, RNG, IDs and ownership are untouched. Retained pre-change new-game fixture `tests/fixtures/save_v46_layout20_headwater_predecessor.json`; coverage `tests/simulation/headwaterFallMigration.test.ts`, live-topology contract `tests/unit/headwaterWaterfallTopology.test.ts`, profile/normal owners `tests/unit/headwaterWater.test.ts` and `tests/unit/nevaLandforms.test.ts`. |
| v48 | 21 | Re-anchors the shipped farm kitchen pose. `struct.kitchen`'s authored anchor moved inside the southeast yard pocket after v45 shipped it by the home lane, so v45-v47 saves store the old X/Z while rendering and the processing-station approach already read the new anchor. | No layout or topology move and no other structure moves: `world.layoutRevision` stays 21. Only `struct.kitchen`'s X/Z and terrain-derived Y follow its layout owner; player, crops, cargo, inventory, quests, progression, clock, RNG and ownership are untouched. Retained pre-change fixture `tests/fixtures/save_v47_layout21_kitchen_predecessor.json`; coverage `tests/simulation/kitchenMigration.test.ts` and `tests/simulation/persistence.test.ts`. |
| v49 | 21 | Adds an optional harvest grade to inventory stacks so a produce sale can price each lot by its own grade. `InventorySlot.quality`/`ItemStack.quality` hold a `CropQuality`; the migration backfills `common` on every raw crop-harvest lot (an absent grade already quoted at the common rate) and leaves seeds, processed goods, fish items and equipment ungraded. | No world or topology move: `world.layoutRevision` stays 21. Only stack shape gains the optional field, so quantities, positions, markets, crops, cargo, quests, progression, clock, RNG and ownership are untouched, and the migration is idempotent. Retained predecessor `tests/fixtures/save_v47_layout21_kitchen_predecessor.json` runs the full chain; coverage `tests/simulation/produceQualityMigration.test.ts`. |

| v50 | 21 → 22 | Expands Neva into a mainland around the retained farm, village, river and harbor core, with new village markets registered through the existing market backfill at the saved clock. `migrateMainland50` preserves valid horizontal poses and re-grounds mainland land actors; unsafe players and mounts recover against canonical support and catalog collision, including the carriage's whole footprint. Vessels displaced by new land recover at a compatible safe mooring; displaced schools keep their ecology and habitat, and active fishing retains its progress while its reach is repaired. | No coordinate scaling, farm move or ID replacement. Crop-local coordinates, farms, inventories, physical cargo links, supplies, existing market state, contracts, quests, journal, clock and RNG remain intact. The runner also repairs a development save already tagged v50 but still on layout21. Historical schema/layout validation is pinned independently of the live revision. Retained predecessor `tests/fixtures/save_v49_layout21_mainland_predecessor.json` was migrated from the retained synthetic v47 fixture and validated before this mainland edit; it is not a captured player session. Coverage: `tests/simulation/mainlandMigration.test.ts`, including repeat loads and failed-primary backup preservation. |
| v51 | 22 → 23 | Reworks mainland landforms, contour roads and biome dressing around the same village and working-core anchors. `migrateOrganicMainland51` and v50 share `recoverMainlandLayout`: supported horizontal poses remain local, height changes re-ground actors, and new steep/wet ground or catalog collision triggers deterministic nearby recovery with the full carriage footprint. | No farm, village-market, inventory, cargo, progression or content-ID replacement. Active fishing preserves habitat, encounter progress and private RNG; a won catch keeps its pending keep/release choice. Boat and school recovery use the existing shared water rules. Schema50 remains independently valid at layout22; a development schema51/layout22 slot receives recovery once. Retained synthetic predecessor `tests/fixtures/save_v50_layout22_organic_predecessor.json` was validated before this rework; v49 and all earlier fixtures remain intact. Coverage: `tests/simulation/organicMainlandMigration.test.ts` and the shared mainland migration suite. |
| v52 | 23 → 24 | Reshapes the Neva starter watershed into connected shoulders, broader valley slopes and rounded contour trails, and repositions existing catalog dressing onto stable ground. `migrateNevaValley52` uses the shared collision-aware recovery for changed land support. | Preserves farms, crops, markets, inventories, cargo links, quests, boats and fishing state through the existing recovery contract. Valid horizontal positions remain local; unsafe positions recover deterministically. Historical schema51 validates at layout23. Retained synthetic `tests/fixtures/save_v51_layout23_valley_predecessor.json` was migrated and validated before the terrain edits. Coverage: `tests/simulation/nevaValleyMigration.test.ts` plus shared mainland recovery/backup tests. |
| v53 | 24 → 25 | Re-authors the Neva river with compact meanders, varying channel widths and bend scour. The spring feeds a taller narrow fall into an asymmetric, level plunge pool; trail grading releases continuously across its banks. `migrateRiver53` uses the shared collision-aware recovery. | No farm, work-station, bridge, estuary mouth, inventory, cargo or progression replacement. Valid actor positions remain local; unsafe land/boat positions and active fishing use the shared recovery contract. Schema52 remains pinned to layout24. Retained synthetic `tests/fixtures/save_v52_layout24_river_predecessor.json` was migrated and validated before these edits. Coverage: `tests/simulation/riverMigration.test.ts`, shared mainland recovery/backup tests, and live headwater/river topology checks. |
| v54 | 25 → 26 | Lowers the village-to-Highridge coastal road into the retained foothills and shifts its bends inland. The profile samples the shared starter ground and mainland blend instead of imposing a long elevated datum. `migrateCoastalRoad54` uses shared collision-aware actor recovery. | Farm, village, river, bridge, inventory, cargo and progression contracts remain intact. Former road actors retain safe horizontal poses and re-ground; unsupported poses recover nearby. Schema53 remains pinned to layout25. Retained synthetic `tests/fixtures/save_v53_layout25_road_predecessor.json` was validated before edits. Coverage: `tests/simulation/coastalRoadMigration.test.ts` and shared mainland recovery/backup tests. |
| v55 | 26 → 27 | Raises the headwater into a rock spring at the headwall talus: source 33.5 m, a gently graded upper chute, a tall bedrock lip at z = -136 (32 m) falling 27.5 m to the unchanged 4.5 m landing and level plunge pool, with a west rim and raised massif (`spring-mountain` 58, `spring-headwall` 48, `spring-west-rim`) hiding the source and upper chute from every gameplay stance. Shortens `farm-headwater-trail` to the rim terminus `(-48, -155)` and forks `northern-bluff-trail` west of the rim so neither route climbs the cirque; spring dressing follows the shortened trail. `migrateHeadwaterSpring55` re-grounds only persistent positional state inside the graybox envelope (X/Z kept when still valid standing ground, otherwise nearest valid support with the rim terminus as last resort; hulls re-docked at the harbor mooring). | Inventory, cargo, farms, crops, quests, progression, clock, RNG, IDs and ownership are untouched; poses outside the envelope keep X/Z with Y re-derived only when the layout stamp advances. Schema54 remains pinned to layout26. Retained synthetic `tests/fixtures/save_v54_layout26_headwater_predecessor.json` was validated before edits. Coverage: `tests/simulation/headwaterSpringMigration.test.ts`, live-topology `tests/unit/headwaterWaterfallTopology.test.ts`, concealment `tests/unit/headwaterConcealment.test.ts`, profile owners `tests/unit/headwaterWater.test.ts` and `tests/unit/nevaLandforms.test.ts`, preservation `tests/unit/starterIslandPreservation.test.ts`. |
| v56 | 27 | Trade packs gain a `ground` rest pose: `CargoLocation.type` `"ground"` with the literal container `"ground"` and finite X/Z inside the world bounds. `cargo.drop` sets the carried pack down one step ahead on walkable, non-sailable ground; `cargo.pickup` collects a grounded pack within reach; ground decays at the open-air rate from its own climate and never takes ice. | No layout or topology move: `world.layoutRevision` stays 27. No v55 save contains a ground pack, so `migrateGroundCargo56` preserves every field and only advances the version stamp. Covered by `tests/simulation/groundCargo.test.ts` and the persistence validation/recovery tests. |
| v57 | 27 → 28 | Adds `ContractState.deliveredValueMoney` for the exact market value recorded when each new partial delivery is accepted and `legacyUnvaluedQuantity` for older partials whose grade, weight, and freshness were not saved. On expiry, new deliveries settle for their recorded value; older partials retain the prior item-return or reference-value fallback. New `contract.flax_bolts` offers deliver at Reedhaven, while already-posted Village orders remain valid at their promised destination. The independent Sunreach working-settlement pass advances the layout to 28 through `migrateSunreachLayout28`. | `migrateContractSettlement57` preserves order IDs, targets, destination, quantity, reward, deadline and status, marking only active pre-v57 fulfilled units as legacy without reconstructing missing lot or fish details. The layout step re-grounds persistent Sunreach land poses against the new terrain and collision, retaining safe X/Z and recovering unsafe actors locally; it leaves contract, inventory, cargo, market, quest, clock and RNG truth intact. Retained contract predecessor `tests/fixtures/save_v56_contract_settlement_predecessor.json`; contract coverage `tests/simulation/contractSettlement.test.ts` and `tests/simulation/persistence.test.ts`; layout coverage `tests/simulation/sunreachLivingLayoutMigration.test.ts`, `tests/simulation/terrainMigrationComposition.test.ts`, and `tests/unit/sunreachLivingLayout.test.ts`. |
| v58 | 28 | Adds `light` and `prepared` processing Work tiers for newly started jobs. The tier owns both charged base Work and collection XP. | `migrateProcessingWorkTiers58` advances the schema stamp without repricing any pending job; pre-v58 `standard`/`masterwork` job snapshots retain their captured Work, XP, output, timing and identity. New tiers are valid only in v58 saves. A retained v57 pending-job predecessor and focused migration/backup tests cover preservation and repeat load. |
| v59 | 28 → 29 | Regenerates the Neva mainland procedurally from its authored causes (§10): curved range crests through the charted summits with cols and sub-peaks, concave flanks cut by drainage-aligned gullies and spurs, foothill aprons, an inland-rising plain, a shore that is beach or cliff by one headland geology, a derived outer coastline of headlands and bays, an irregular lake shore, landform-owned rock exposure, and mainland roads found by the offline least-cost router between their authored endpoints, junctions and datums. The starter district's summits and shoulders take the same concave peaked form with gullies and crest/chute rock outside the headwater cirque, which keeps its authored form exactly; the western summit boulder moves onto that summit's cap. Highridge's yard is levelled at the natural ground under its market. `migrateProceduralMainland59` uses the shared `recoverMainlandLayout`; the schema step first runs any layout step the save still lacks, because layout 28 has no schema step of its own. | Supported horizontal poses keep their X/Z and re-ground; poses on newly steep, wet or blocked ground recover to the nearest safe Neva support; boats, schools and active fishing use the shared water rules. Starter working ground, starter anchors, the lower river, the headwater cirque and every non-mainland route are unchanged; only the three mainland market heights move with their ground. Farms, crops, inventory, cargo, markets, contracts, quests, progression, clock and RNG are untouched. Schema58 remains pinned to layout28. Retained synthetic `tests/fixtures/save_v58_layout28_procedural_predecessor.json` was migrated and validated before the terrain edits, and `tests/fixtures/neva_layout28_mainland_routes.json` replays the replaced roads for historical route hashes. Coverage: `tests/simulation/proceduralMainlandMigration.test.ts`, `tests/unit/starterIslandPreservation.test.ts`, `tests/unit/nevaCoastline.test.ts`, `tests/unit/mainlandRoadRouter.test.ts` and the mainland traversal/route suites. |
| v60 | 29 → 30 | Adds village life to the starter village as catalog placements in `WorldEnvironmentLayout`: a dovecote on the square's north-east corner under the first dove orbits, a post-and-rail sheep paddock on the meadow south of the south cottage with its gate to the road, a laundry line in the west cottage's yard, two banners at the market hall and ducks on the river reach nearest the village. The dovecote and the paddock fence carry box colliders; sheep, ducks and cloth props are presentation-only. `migrateVillageLife60` uses the shared `recoverMainlandLayout`; the schema step first runs any layout step the save still lacks. | Poses the new footprints cover (player, mounts, the carriage's whole footprint) move to the nearest clear Neva support; every other actor keeps its X/Z. Terrain, routes, working ground, anchors and the layout29 preservation snapshot are unchanged. A trade pack resting under the new footprints keeps its pose and stays collectable within its reach. Farms, crops, inventory, cargo, markets, contracts, quests, progression, clock and RNG are untouched. Schema59 remains pinned to layout29. Retained synthetic `tests/fixtures/save_v59_layout29_village_life_predecessor.json` was migrated from the v58 predecessor and validated before the placement edits. Coverage: `tests/simulation/villageLifeMigration.test.ts` and `tests/unit/villageLife.test.ts`. |

Both fishing paths use a fixed 60 Hz step independently of render frames: the
sport encounter integrates its fight, and the basic cast charge/minigame
integrates on a persisted `minigameStepRemainderSeconds` accumulator so the same
seed and input timeline resolve identically at any frame rate. No offline fight
advancement is introduced.

`WorldState` owns the current world seed, `activeSchools`, per-ecology/habitat
fishing pressure/cooldown, authored `structures`, and the last school-spawn
minute. World geometry is registry-driven:
`WorldIslands` owns islands, terrain patches, closed coasts, climates, marine
fields, fishing ecologies, and the open-channel requirement;
`WorldGameplayLocations` owns farms, stations, markets, chart nodes, and
ambience; `WorldMoorings` owns moorings and sailing routes. Do not add fish
schools, structures, or island-local variants as parallel top-level fields.

`GameState.mounts` includes the donkey and inherited horse carriage. `MountState.fishCargoSlotIds` exists only on the carriage; each non-null slot must agree with a `FishCargoState.location` of type `carriage`, its mount id and slot index. The validator checks both directions and refuses duplicate or orphaned links. Speed, carriage steering and animation phase remain transient; a reload resumes the saved pose and load at rest. `Carriage.ts` owns its finite capacity, footprint, movement tuning and interaction offsets.

`PlayerState` includes serializable traversal state (`sprintStamina`, recovery delay, exhaustion, grounded state), `equippedRodId`, the unique known `ownedRodIds` set required by schema v20, permanent `equipment` ownership/equipped-slot/preset state required by schema v37, and the optional explicitly prepared lure ID. Wardrobe equipment is not an inventory stack and may not be duplicated; rods retain their existing distinct ownership contract. Traversal is simulation-owned and fixed-step; Work Capacity is a separate economy resource and must not be reused as movement stamina.

Manual production affordability and spending are simulation-owned by `ProgressionDomain`. Callers validate capability and inputs, then quote and spend the full discounted Work cost at the command's commit boundary. Capacity is checked at the transaction that actually grants the result: an item-producing processing job checks current satchel space only when collected, while an equipment job reserves permanent wardrobe capacity when it starts. An insufficient quote cannot partially drain Work, consume items, advance canonical RNG, create gameplay state, award XP, or emit a success event; presentation may only display the structured quote/result.

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
- starting ratio: `2.5 real seconds = 1 game minute` (`minutesPerRealSecond = 0.4`), `1 game day ≈ 60 real minutes`, configured centrally. Save validation rejects, and `GameClock` clamps, any speed above `MAX_MINUTES_PER_REAL_SECOND`, because live ticks and offline catch-up step minute by minute. Schema v16 snaps stored `minutesPerRealSecond === 1` to `0.4` and requires `weather.nextWeatherType` for the forecast window.

Ticking: rendering via RAF; movement/physics fixed timestep; economics event/coarse-tick; market hourly game tick; crop/freshness delta-based; weather scheduled. **Never iterate crop growth each render frame.**

# 7. Offline Progression & Persistence

On load: `offlineMs = nowUtcMs - lastSavedUtcMs`; cap at **72 real hours**. Advance in **weather-bounded segments** so a long absence does not apply one stale weather snapshot to every crop and cargo item. Inside each segment: crop growth, crop moisture, and cargo freshness. After all segments: at most one night's Work rest if the absence crossed a wake boundary (the live slow idle trickle is real-time and unpaused-only, so it does not accrue while the game is closed), motor fuel drain and spent-school expiry, then processing jobs, then contracts, then market ticks. Never auto-harvest, auto-sell, or auto-fish. The load path surfaces one combined away-report notice (crops ready/withered, jobs done, catch spoiled, contracts expired) so the return has a reason.

IndexedDB save envelope:
```ts
interface SaveEnvelope {
  schemaVersion: number;
  savedAtUtcMs: number;
  checksum?: string;
  state: GameState;
}
```
Two keys only: `primary_save` and `backup_save`. Quick-save / autosave writes primary (copying the previous primary to backup first). There is **no third manual slot**. Load **migrates then validates**. An IndexedDB write/open failure returns `false`; never promote a RAM copy onto IndexedDB later. If neither slot can be opened (corrupt or incompatible), the title screen offers only New Game behind its confirmation dialog (`StartScreen`, `startup-new-game-confirm`); **nothing is written until the player confirms** and the new world is ready. If IndexedDB is unavailable, continue without saving and keep writes blocked.

Save periodically and on purchase, sale, dock, harvest, unlock, contract completion, visibility loss—not every frame. A refused periodic save retries on the same periodic cadence, not the next frame, and warns the player once until a save succeeds again.

Collision-aware terrain recovery consumes `WorldEnvironmentLayout.createWorldStaticPlacements(seed)`, the same cached authored and seeded placement array used by the complete environment builder. That static-only path retains overrides, exclusions, footprint validation and harbor collision inputs without generating presentation-only ground cover during migration. The renderer layout generates and caches cover on its first `groundCoverPlacements` access; this separation does not change placement order, canonical poses, schema or layout revision, and does not by itself establish faster end-to-end game startup.

Every persistent schema change requires deterministic migrations (`migrateV1ToV2`, etc.). Preserve old fixtures; keep IDs stable; failed migration MUST NOT destroy backup. Before persistent changes agents state: `Save-impact: yes/no`, `Migration required: yes/no`.

Recovery: `primary → backup → title-screen New Game confirmation`; never silently wipe.

# 8. Content Registry

Definitions are data and validated at startup:
```ts
interface ContentRegistry {
  crops: ReadonlyMap<CropId, CropDefinition>;
  fishSpecies: ReadonlyMap<FishSpeciesId, FishSpeciesDefinition>;
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
  | "interact" | "interact-release" | "use-primary" | "use-primary-release" | "use-secondary"
  | "open-inventory" | "open-character" | "open-map" | "open-journal"
  | "open-ledger" | "open-planning"
  | "select-tool-1" | "select-tool-2" | "select-tool-3" | "select-tool-4" | "select-tool-5"
  | "pause"
  | "fish-reel" | "fish-slack" | "fish-brace" | "fish-left" | "fish-right"
  | "fishing.toggle-lure";
```
Fishing minigames are driven by held-state `fishing` (`isReeling`, `isSlacking`, `isBracing`, `rodDirectionAngle`) plus `fish-left` / `fish-right`, not only discrete reel/slack/brace actions. Keyboard and touch steering share the same ±0.6 semantic clamp. `fishing.toggle-lure` explicitly arms or puts away the crafted lure before a cast/hook; preparation does not consume it.

Modal rules: inventory, character, crafting, market, journal, map, ledger, planning and the landed-catch inspection are overlays, not simulation modes. The catch inspection uses the same `ModeController` overlay ownership as other modals: it blocks world input and overlay hotkeys until dismissed or replaced by the satchel, while simulation continues. `C` maps to `open-character`; interacting with a processing station opens `crafting`. Active basic-fishing and sport-fishing block inventory and equipment changes; the completed basic catch summary (`phase === "caught"`) permits opening the satchel so the player can resolve capacity before collecting. Equipment changes are also blocked while mounted, carrying physical fish cargo, moving in an undocked boat, or while a simulation action timeline is active. Any modal disables boat steering. Pause is an overlay (`GameOverlay` includes `"pause"`), not a `GameplayMode`; it suspends simulation while open and MUST NOT be persisted as a serializable sim mode.

Explicit gameplay modes (`GameplayMode`; excludes overlay-only `"menu"` / `"paused"`):
```ts
type GameplayMode = "on-foot" | "farm-placement" | "basic-fishing" | "sport-fishing" | "boat-driving" | "mounted";
```
Never infer mode from mesh/UI state. The horse carriage reuses `mounted` and `player.activeMountId`. Its W/S input drives forward/reverse, A/D steers while rolling, releasing movement brakes, and Shift requests a trot. E boards at the bench, dismounts, loads carried cargo at the rear, or collects a stored pack according to the simulation-validated contextual target. `cargo.load-carriage` and `cargo.pickup` commit each transfer atomically.

Cameras react to `GameplayMode`, never decide gameplay:
- on-foot: contextual third-person framing with damping; yaw orbits a full 360 degrees and hand pitch/zoom run from sky (-75 deg, close inspection) to near-overhead (+85 deg, far world view) in on-foot, farm-placement, boat-driving, mounted and basic-fishing; resting distance/pitch are unchanged and open exploration lowers pitch and widens the lens while working areas and nearby interactions retain task framing;
- boat: wider chase, visible horizon/forward waves/schools;
- sport fishing: tighter, visible line/fish direction, unobstructed HUD; keeps its own pitch/zoom bounds and auto-yaw and is excluded from the free-orbit range.

Reduced-motion sport fishing keeps a damped static two-subject framing but disables behavior choreography, camera trauma, and terminal cinematic beats.

`ExplorationFraming` derives a presentation-only openness weight from existing habitat, architecture, farm and shore fields, cached by player position. `GameApp` suppresses it during a modal, active work or nearby on-foot interaction, and `GameCamera` applies it through its existing pitch/FOV damping. It never alters yaw, controls, collision, routes or saved state. First manual orbit/zoom continues from the visible framing and retains the user's pitch/lens preference for the session; subsequent geography cannot recenter it. Sport-fishing and interior profiles still own their bounds. Reduced motion omits automatic exploration reframing.

`ModeController` owns gameplay mode plus the modal/overlay stack. `InputRouter` maps physical input to semantic movement, camera and action intents; camera orbit/zoom is presentation input and never becomes simulation state. `SimulationActionTimeline` owns each transient anticipation → commit → recovery clock and invokes the canonical `GameCommand` exactly once at its commit timestamp. Animation, audio and UI only observe timeline snapshots; a visual callback can never authorize an economic transaction. Cancellation before the commit attempt costs nothing, while a successful commit survives any later presentation interruption. The timeline itself is intentionally absent from `GameState`: reload cancels an uncommitted action, and a transaction already captured in a saved state remains committed without replaying.

Normal play has no standing toolbelt. `GameApp` picks one immediate world interaction for `E`; the selected crop with another currently valid verb offers those alternatives beside the prompt, and choosing one rechecks the current crop target before the existing command path runs. At a farm, owned seeds expose a direct Plant entry into the temporary seed belt. At fishable water, primary use takes out the rod and starts a cast; `R` still prepares a lure. The numbered `world.get-hud` stance actions remain keyboard shortcuts for familiar tool selection and existing input actions, with the same fishing/modal guards, but are not rendered as empty HUD slots. Equipped tool selection and the action disclosure are transient and are not saved.

The HUD's farm forecast (`F` or the almanac) opens only on foot, mounted or boat-driving, and closes when the mode leaves them or the DEV layout editor activates. While open it captures Escape, so it must never be open in a mode whose own Escape cancels a cast or placement or deselects an editor target. The Inspect verb (`use-secondary`: right-click without drag, or the touch Inspect action) inspects the pointed crop on foot; when no crop is under the pointer and the player stands at fishable water, including while driving a boat, the same verb reads the water through `inspectWaterReading()` — a pure query that spends no Work and draws no RNG. `R` remains the lure toggle; it is never a read-water shortcut.

Modal focus discovery targets visible controls, disclosure summaries and actual links, not every element with an `href`. Only the topmost dialog handles Tab and Escape; closing it restores focus to the uncovered dialog or the nearest connected, non-inert opener. SVG atlas images are decorative resources, not keyboard destinations; they must not steal the initial-focus or Tab-wrap position from the close button and other real controls. `useModalAccessibility` owns that shared focus and Escape contract.

# 10. World Scope

A finite authored mainland wraps a sheltered cove. The original farm, village and harbor remain its introductory district:
```text
Northwest farm district: starter land, farmhouse, working yard, Act 1 garden
Northeast village hub: compact market square ringed by an inn, two farmhouses and two cottages, with a well, oven, notice board and market hall at the edge; mill pad, contracts, Village Commons field, orchard fringe
River corridor: freshwater fishing, bridge, east-bank river-crossing gateway (not a village)
Southwest headland: cliffs, lighthouse, coastal walk
Southeast harbor: fish market, dock, boat vendor, fuel/ice
Western Pinewatch: forest village, timber supplies, freshwater lake, coastal freight landing
Southwestern Reedhaven: marsh village, wetland fishing, lowland river and cove landing
Northern Highridge: upland village, workshop supplies, mountain road and summit trail
Coast and offshore: local village freight, coastal fishing and the open-water Sunreach crossing
```
The introductory loop is farm → village hub → harbor. It expands into village freight circuits by road or sheltered cove, freshwater fishing trips, and skiff expeditions across the open channel. Spawn and the northwest farmhouse stay on the starter farm. World `(0, -5)` is the river-crossing apron after the bridge, not a fake village. `market.village` and the arterial road hub sit on the northeast plaza near `(40, -66)`, with the dwellings, well, oven and notice board packed tightly around it so the court reads as a village rather than a road field. The mill pad and the market hall sit off the square to the east so the court stays an open market square. The world remains finite and deliberately authored. `NevaMainland` owns the new village anchors, graded freight roads, biome fields, summits and lowland freshwater channel. `WorldIslands` owns the cove outline and complete terrain-patch registry: the retained high-resolution starter patch joins coarser mainland patches, while Sunreach and the sparse channel islets retain their independent geography. Terrain rendering, support sampling and Rapier all consume that same registry; expanding the map must never leave a rendered area without collision or a collider without visible land. Explicit sailing bounds, route points, moorings, discovery sites and fishing grounds make the larger distance playable. `WORLD_LAYOUT_V5` is a retained implementation symbol; §6.1 owns layout revisions. `WorldLayout` owns side-aware longitudinal river profiles and district fields; `WorldCompositionField` derives deterministic habitat, route, opening, and category-density causes from those authored owners. Hashed candidates are stable presentation addresses, never geography or serialized gameplay truth. Every arterial route, sea detour and scenic trail must connect gameplay, navigation, a landmark, fishing access, a discovery, or an intentional vista; do not create empty distance for its own sake. Use deterministic layout data and preserve strategic travel rather than tedious traversal. Runtime chunk streaming is not implemented.

`NevaLandforms` owns the retained starter district's asymmetric northern summits, saddles, western foothills, eastern uplands, and contour benches. Outside the headwater cirque its summits and ridge shoulders are concave peaks under a small rounded cap with drainage-aligned gullies and spurs, and their rock exposure follows the crest, upper face and scree chutes rather than a height band; inside the cirque (the v55 graybox envelope plus a margin) the authored form is kept exactly, because its rim and headwall own the source-concealment and fall-visibility contract. Protected working plots, foundations, courtyards, working routes, bridge approaches, harbor, and lighthouse remain local terraces. Broad shoulders join the spring watershed to the surrounding hills; valley carving eases into those shoulders instead of restoring full ridge height immediately beside the water. Rounded trail centerlines feed the same bench and route geometry, and the joining farm trail owns its grade through the freight-road feather. The farm trail continues to the named mountain spring and western overlook through the existing route registry; its entire corridor, shoulders, turns, and junctions must stay below 30 degrees without relaxing movement limits. Those retained foothill trails remain exploration routes. `NevaMainland` extends that relief procedurally from authored causes, never from indiscriminate height noise. Ridge spines are curved crests through the charted summits; seeded crest noise raises sub-peaks and cuts cols between summits but never moves or lowers a charted summit. Each range has a concave cross-section (steep rock near a rounded crest, a long gentle toe) that is wider on its inhabited lee side, and drainage-aligned stripe noise (`ProceduralNoise.drainageStripe`) cuts V-floored gullies and rounded spurs straight down every flank, fading where two ranges meet. Foothill aprons step down into a plain that rises inland from the coast, the freshwater valley opens wider where it is cut deep, and village yards remain local terraces. The same landform owns bare-rock exposure (crest and upper face, scree chutes, the alpine zone), which the canonical surface sample and the terrain bake both use instead of a fixed height band. Every field is a pure function of world metres and fixed salts, so terrain, Rapier, save recovery and tests agree. Its inspectable landform and normalized biome-weight fields share their causes with terrain surfaces and vegetation; woodland litter, marsh peat and grassy hummocks, and exposed upland heath resolve through the existing canonical ground weights.

`NevaCoastField` is the mainland's coastal geology: one headland field both pushes hard-rock headlands out to sea when `WorldIslands` derives the outer rim from its knots, and makes those shores cliffs, while the softer ground between erodes into bays with beaches. High ground meeting the sea also cliffs; river mouths and the sheltered cove below Pinewatch keep beaches and the short working bank their landings stand on. Terrain profile, seabed shelf and shore surface weights all read that one character. The starter district's authored coast is unchanged. `LoopSegmentIndex` answers coast distance, inside tests and projection exactly as the brute-force loop walk, so the denser outline costs no precision.

Mainland roads connect real village counters and commissions. `MAINLAND_ROUTE_PLANS` owns only their topology: endpoints, junctions, landing lips and retained starter-district datums. Every leg between them is found offline by `tools/world/mainlandRoadRouter.ts` (`npm run world:route-roads`), a heading-aware least-cost search over the shore-shaped ground a road is graded against: grade, side-slope and turning cost distance, water and village buildings are impassable, so roads take valley floors, benches and low saddles and bend rather than kink. Its knots are generated into `MainlandRoutes.generated.ts` with a terrain fingerprint; `tests/unit/mainlandRoadRouter.test.ts` fails when the landform changes without re-routing. Elevation profiles still come from that ground, with bounded longitudinal grading and narrow worked shoulders; fixed elevations are reserved for retained working-ground connectors, landing lips and village yards. The inland Highridge yard is levelled at the natural ground under its market rather than a fixed datum, so its roads arrive directly instead of climbing a raised mound. Already-sampled route centerlines feed the same route compiler, terrain benches, map, cover exclusion and collision, rather than a separately curved presentation ribbon. The forest road circles the lake head; the cove offers shorter local water freight without changing the open-channel skiff gate. Trails end at reachable fishing banks or a mountain shoulder overlook. The forest lake opens into a meandering lowland river at the shared water datum; bank carving, fishing access and downstream flow direction consume the same channel. Biome climate and drainage come from `WorldLayout`, and presentation derives its forest, marsh, upland and village composition from the same authored fields. Sunreach's terrain remains independently authored. Every mainland road grades against `mainlandRouteGroundAt`, which samples `NevaLandforms.nevaBaseGroundHeight` and the same starter/mainland blend as terrain wherever a connector enters the starter district. The village-to-Highridge connector's village gateway alone retains fixed datums; the coastal stretch settles into low ground before climbing the northern slope. This prevents a mainland-only elevation profile from creating a causeway across the lower starter terrain.

Historical terrain-preservation comparisons use the sample bounds and spacing stored with `tools/world/neva-layout10-working-preservation.json`, not the current island envelope. Its added sampling metadata records the original layout-10 Sunreach domain; the original samples, hashes, and count remain unchanged. `captureTerrainPreservation` records the actual domain for new captures, including the mainland roads, and the unit and world-acceptance audits explicitly replay historical route IDs and sample domains. Each protected field reports independently so an anchor mismatch cannot conceal a route or island regression. An authorized layout reshape freezes a revision-specific working baseline from `captureWorkingPreservation` in `tools/world/terrain-preservation.ts` (current snapshot: `tools/world/neva-layout29-working-preservation.json`; layout 30 adds placements only, so its protected fields still match it). `starterIslandPreservation.test.ts` compares the live world against that baseline and separately preserves layout21's working ground, retained working roads, Sunreach samples and old anchors; the kitchen move already documented at v48 is its only historical anchor exception. The layout23 comparison also preserves layout22 working fields and anchor coordinates; only the three mainland markets have different road-crown support heights after the contour-road rework, and the current snapshot pins those heights. Layout24 intentionally rounds the upland approach and northern bluff trails while retaining their endpoints and shared route ownership; all other route definitions remain pinned against layout23. Layout25 intentionally replaces the lower-river profile; the previous profile remains in the layout24 snapshot. Layout28 levels the Sunreach terrace beds (`TerraceProfile`) and regrades the working settlement around them, so historical comparisons take the terrace working-ground heights, the Sunreach hand-mill and workbench heights and the Sunreach samples hash from the live snapshot; their coordinates and all other working ground stay pinned, and the previous Sunreach profile remains in the layout27 snapshot. Layout29 replaces all nine mainland roads with routed legs; `tests/fixtures/neva_layout28_mainland_routes.json` restores them before any historical route-hash comparison, and the three mainland market heights follow their ground in every historical anchor comparison. Bridge and estuary stations, working ground, routes and anchors remain pinned independently. Earlier snapshots remain unchanged.

The separately documented harbor approach correction in `02` §5 is a bounded exception to exact historical equality: only the two harbor-bound route endpoints move to the open apron, and removing their road crown from beneath the stall leaves its existing bare foundation. `tools/world/neva-harbor-approach-preservation.json` pins those expected differences without replacing the old fixture. `compareTerrainPreservation` exposes both raw historical equality and the current contract checks; all other route data, anchor coordinates/metadata/heights, working plots, downstream river, and sampled Sunreach fields remain exact. `physicsWorld` separately verifies arrival at the apron against the actual fish-market collision.

# 11. Physics & Water

The off-island farmhouse interior is a supported dry floor, like an elevated deck, not marine water. `WorldLayout.isWater` excludes its authored footprint and the player walkability filter accepts that support while retaining the separate interior-entry restriction. The marine signed-distance field still describes the underlying geography; interior movement does not move the room, change ocean bounds, or alter saved poses.

Mainland save recovery uses `recoverMainlandLayout` for the layout22 through layout25 steps. It queries the same final traversal support and cached catalog collision as play, including the carriage's horse, shafts and bed footprint. A supported mount retains its saved height within the existing mount tolerance; larger height changes re-ground it. Denser render quality and distant visibility must never change those collision or saved-position decisions.

Use Rapier only where collision response matters: player/world, boat/world, dock, shoreline, simple vehicle/rigid gameplay props. Every registered terrain patch gets its translated heightfield collider; there is no single-origin terrain assumption. Boats ignore land heightfields and remain constrained by the shared marine/sailable field, mooring rules, and authored progression gates. Avoid full physics for crops, fish AI, fishing line, waves, UI, decorative props unless required. Fishing line is simulation math. `PhysicsWorld` implements the `PhysicsAdapter`; it returns a validated pose frame, and `Simulation`/the navigation domain is the only layer allowed to commit that frame into `GameState`. Physics may sample presentation `WaterSurface` for boat bob; **canonical `boat.y` stays at the waterline** so save/load never depends on wall-clock wave height. Camera sweeps and interaction line-of-sight queries are presentation/application services, not gameplay authority. Moving hulls invalidate the Rapier query tree. Hull casts refresh it before use; the character controller does so only when a current hull can reach its capsule search, using catalog-derived hull bounds plus the full movement, capsule, step and snap extents. Remote hulls are excluded from that controller query, so distant bobbing does not rebuild the whole static tree. Camera and interaction queries exclude hulls at every query stage and reuse the static tree. Hull creation/removal, collider profile changes and static edits refresh immediately. Player-only motion propagates its attached capsule pose without rebuilding the world query tree because every external query excludes that capsule. Query reuse must preserve edited-obstacle visibility, moving-boat collision, teleport and rejected-commit behavior.

Character motion follows the same one-way boundary. Fixed-step Rapier resolves the capsule, support, velocity, grounded/airborne/contact evidence, and requested gait. `PhysicsAdapter` reports signed tangential acceleration from resolved speed; braking stays negative. No mixer time, gait phase, stance lock, NPC station progress, spring state, socket constraint, or bone transform is serialized or written back into simulation. A single clip phase drives mixer sampling, catalog contact windows, footsteps, and companion synchronization; reference speed converts resolved travel into cadence. Creation/reset starts authored idle. Starts, stops, stationary turns, reversals, landing and repeated/interrupted actions have explicit transitions; pre-commit cancellation and exactly-once gameplay effects remain application/simulation responsibilities.

A physics step is a transaction, not an announcement. `PhysicsAdapter.step` stages a candidate pose; the host loop MUST report the outcome of its `physics.commit` back through `onCommitResult(success)`. On acceptance the candidate becomes the adapter's synchronisation baseline; on rejection the adapter rewinds its own bodies and baseline to the last accepted pose. Skipping the report leaves Rapier permanently ahead of `GameState`, and the next step pays a resynchronisation that clears the player's velocity for a frame. Boats need no rewind because each hull is re-derived from `GameState` every step rather than integrating a retained pose.

Walkability is evaluated once, after Rapier. The controller receives the raw steered velocity so it resolves mesh, box and terrain sliding on the full intended move; the shoreline and water projection then runs on the movement Rapier computed, and the resulting displacement is reflected back into transient velocity. Clamping the intent before the controller saw it made the two passes fight at waterlines and cliff edges and read as sticking. A mounted capsule that already overlaps a static prop is the one state steering cannot resolve; while a rider asks to move from it, `mountedDepenetrationEscape` crawls the mount toward the nearest mountable pose clear of static collision, so a prop the mount ground-snap carried into cannot hold the rider in place.

Rapier's `computedGrounded()` is necessary but not sufficient. Measured over a dock stair climb it reports grounded on 71% of frames while the actor is standing on a tread, against 99.5% on open ground, because the controller loses contact across each riser; the layout's own support evidence backs it up. Mounts are pinned to the traversal surface rather than integrated under gravity and stay grounded outright, since they have no mechanism to recover from a spurious airborne frame.

The application delivers movement on a fixed 1/60 step behind a capped accumulator, so a frame that runs long drops simulation time rather than catching all of it up. Elapsed real time is therefore not a measure of how much the player was allowed to move; `GameApp` publishes a monotonic count of delivered steps through the DEV diagnostics element and `NevaDebugSnapshot` so automated harnesses can pace themselves on simulated progress instead. It is DEV evidence and is never serialized.

Avoid repeated layout sampling in the physics step: ask for only what is needed. `WorldLayout.traversalSurfaceSample` builds its normal from four extra neighbour samples and costs roughly five times `traversalSurfaceHeight`, which returns the identical height without them; a consumer that only anchors a foot, a prop or a placement uses the height query. Where both a height and a normal are wanted at one point, sample once and share the result. `terrainSurface` and `terrainSurfaceWeights` accept a `sampledNormalY` for the same reason and callers holding a normal must pass it. Rapier point projection against a terrain heightfield scans its cells and costs milliseconds, so any query that cannot return terrain must exclude terrain colliders at the query rather than filtering the result afterwards.

Authored decks and stairs are stepped collision boxes, and the traversal surface must report the same discrete tops rather than a smoothed ramp through them. `BRIDGE_DECK_COLLISION_TOPS_LOCAL_Y` and the dock tread profile in `WorldLayout` mirror their catalog primitives for exactly this reason; the terrain heightfield sampler likewise matches Rapier's own cell diagonal. Both agreements are regression-tested against downward rays into the live physics world in `tests/simulation/physicsTraversal.test.ts`, which is the contract, not the constants. Where terrain patches have different resolutions, fine edge vertices interpolate the neighbouring coarse edge's stored heights. Render geometry, CPU traversal and Rapier consume that same stitched heightfield; `tests/unit/mainlandTerrainSeams.test.ts` protects off-road continuity as well as physical and rendered agreement.

When the application caps a long frame's physics delta, `CharacterAnimationContext.locomotionTimeScale` carries consumed time divided by full elapsed time. Only reference-speed gait playback consumes that factor, including carry layers and rider/donkey synchronization. Both use resolved speed divided by reference speed without independent minimum/maximum clamps. Mixer sampling, phase cursors, footsteps and contacts share the resulting rate and the actual loaded clip duration, avoiding accumulated catalog-rounding drift. Actions, idle, boat effort and attachment transitions retain full unpaused elapsed time. Reduced motion cannot slow essential mounted gait or mount/dismount timing independently.

Catalog `humanoidRig` binds semantic body parts to retained source bones and calibrated bind-space leg endpoints/sole markers. `HumanoidRig` is the runtime adapter, and the shared limb solver supports feet parented independently under the source root. It rotates fixed-length limbs toward reachable targets and places a detached foot in its actual parent's coordinates; it must never stretch bones or move the simulation capsule to force a contact. Post-pose foot constraints use catalog contact intervals and `WorldLayout.traversalSurfaceSample` so terrain, roads, bridges, piers and interiors share physics support. Airborne motion, teleports, reparenting and reset release locks. Equipment and seat markers own tool, cargo, fishing, rowing, boat and mount alignment. Boarding, docking, mounting and dismounting preserve the first visible world pose, follow the simulation-owned moving target and converge to its authored terminal anchor.

Post-mixer correction begins from the cached evaluated animation pose, including static source tracks, rather than resetting bones behind the mixer's property cache. Ground contact may lower the presentation pelvis within `VisualRenderConfig`'s grounding bound to keep a planted target reachable; the simulation capsule and limb lengths stay unchanged. Seat anchoring uses the sampled pelvis, and stirrup/stretcher markers represent the sole support surface with its normal, not an ankle origin. Palm and equipment grip frames use local +Y along fingers and +Z inward; exported frames must be checked against source anatomy and the actual prop surface. The presentation buffer retains each discontinuity reason with its sequence across subsequent physics pushes; renderer and camera consume it only when that sequence changes, preserving the attachment action that caused the transition.

NPC stations derive from the content-authored day phases through `npcAnchorAt` in `src/simulation/presentation/NpcPresentation.ts`. Talking, nearby queries, talk-objective/turn-in guidance and rendered station beats consume that same anchor. Omitted schedule phases use the home anchor. No NPC state is added to saves; phase boundaries relocate presentation and reset its spatial history before culling. NPC station movement keeps transient progress and resolved displacement rather than deriving position from absolute time. Dialogue pauses at the current supported position and resumes from it; animation distance throttling preserves elapsed phase. NPCs use the same humanoid controller and contact path. This is local presentation movement around the scheduled station, not saved navigation state.

Canonical pause freezes character action/attachment time, NPC station progress and the application's mount input lock together. Moving NPCs sample every rendered frame; distant stationary NPCs may throttle their mixer while retaining elapsed time. Repeated contact passes between mixer samples restore the evaluated lower-body pose first, so pelvis and leg corrections cannot accumulate.

The river is canonical landform topology, not a symmetric visual mask. `WorldLayout.riverSectionAt()` owns longitudinal surface and bed elevation, thalweg movement, independent left/right water widths and bank runs, floodplain shelves, curvature response, and estuary influence. `riverBankSample()` exposes side-aware channel, bank, wetness, erosion, and deposition causes to terrain, materials, vegetation, rocks, navigation, and fishing-access queries. Compatibility helpers may summarize that profile, but authoritative water sign, walkability, placement, and bank consumers use the side-aware sample.

`NevaHeadwaters` owns the finite rounded spring and descending profile; `RiverSectionProfile.surfaceElevation` and `WorldLayout.waterSurfaceElevation(x, z)` expose the canonical baseline. Upper bed and banks are relative to that elevation. The finite cap governs carving, wetness, vegetation, flow, water membership, and navigation together. The raised reach is nonsailable scenic water, with no fishing habitat; the sea-level join preserves the three downstream fishing reserves, bridge waterline, estuary, and harbor. CPU sampling and the dedicated headwater water surface add this baseline separately from animated waves and include its downhill derivative in normals; the sea-level water lattice yields that reach to it. Raised water must be clipped to the shared wet footprint. Surface query implementation must not introduce recursion between terrain carving and marine sampling.

MVP water: attractive, animated, readable shore, weather-controlled roughness, mid-tier acceptable, clear boat silhouettes. The global water sign is the union of registered closed coast fields: land wins when any island reports dry ground. `MarineSample` owns signed shore distance, bathymetry, shelter/exposure, reef/shallow influence, wave/flow directions, navigation hazard, and normalized ecology weights. Simulation owns `sea roughness`, `wind`, `risk`, locality, and progression gates; renderer owns waves/normals/foam/reflection approximation. Rectangular shore-profile textures preserve meters per texel and per segment instead of stretching the old square profile. Do not begin with expensive ocean simulation.

Geographical sampling conventions (W03 data contracts): world positions are X/Z meters with Y up. The sea datum is the zero baseline outside the headwater reach; there are no tides. Public water membership is signed positive-wet / negative-dry (`waterSignedDistance`). Two distance flavors exist and are never interchangeable: the exact metric projection (`shoreProjectionAt`, flagged `distanceIsMetric`) and the blended signed proximity field (`MarineSample.signedShoreDistance`), whose gradient length is not one. Shore normals are validated waterward by probe, not inferred from loop winding. Flow direction, wave travel direction and visual-noise scroll are separate fields. Optical depth is the physical water column (surface minus bed); marine/gameplay consumers intentionally retain their depth proxy until a tested consumer switch lands — the depth-map bake in `CoastalOptics` stays downstream of terrain/support and must not cycle back into the samplers it builds on. Where surfaces stack vertically, an explicit reach/body selection (stable waterfall/reach IDs) replaces any single ambiguous height answer; falling sheets stay presentation over topology, never boat support. Evaluation order is leaves (coast loops, marine, profiles) before derived projections, depth and presentation. Layout/content identity for all of this stays in §6.1.

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
- Structural vegetation and ground cover derive from inspectable district/habitat/route/opening/category fields with independent stable candidate streams. Quality tiers change local detail range, LOD and bounded cover submission while retaining placement identity and canonical collision; accepted-array indices, shared coordinates between categories, fixed lattice rows, and manual seeded overrides are not placement authorities.
- The current layout exposes `terrainBaseHeight()` for the graded landform and final `terrainHeight()` for the save/placement/anchor/normal authority. Final height adds the deterministic, nonnegative road cross-section sampled from route identity, distance along route, and lateral distance. Rapier uses `terrainBaseHeightfield()` for the coarse landform plus an exact static road trimesh built from the same indexed geometry rendered by Three.js; catalog bridge and dock collision remain the bridge-deck and pier-deck/stairs authority, with leading-edge sampling in elevated traversal height queries to step capsules smoothly over authored risers.
- Terrain color/material blending, road geometry, shoreline dressing, and ground-cover placement MUST consume the same route/shore/clearance semantics. Do not hand-tune independent masks in several render modules until roads, terrain, cover, map projection, and collision disagree. Supporting maps enrich meso/fine wear after palette remap; they cannot author a second path width, meadow mask, or collision silhouette.
- Any road cut, crown, rut, bench, bank, or other deformation that materially changes the walkable surface MUST be represented by the canonical height/normal contract consumed by rendering, Rapier, placement validity, and affected anchors. Cosmetic shader displacement is allowed only when it remains below a gameplay-camera-visible render/collision mismatch and cannot affect traversal or placement; otherwise it is a topology/layout change, not a rendering-only effect.
- A derived ground field may be analytic, mesh attributes, a compact chunk/control texture, or another measured representation. Choose the simplest form that preserves deterministic regeneration, inspectability, filtered transitions, and browser budgets. Channel packing, texture resolution, noise frequencies, and shader thresholds are implementation/config details, not save schema or permanent art doctrine.
- Rendering-only changes to normals, material fields, road surface presentation, supporting maps, cover density, or precipitation wetness have `Save-impact: no` and `Migration required: no` only while canonical topology, route/structure anchors, collision, placement validity, and serialized world data remain unchanged. A topology/layout revision that changes gameplay reachability or persistent coordinates follows the normal save/layout migration protocol.

Runtime asset contract: **GLB/glTF 2.0** for static 3D prefabs; never runtime `.blend/.fbx/.obj`. Ground supporting maps are the documented non-GLB exception: local processed images loaded only through `ExternalSurfaceTextures`, never as catalog IDs or a parallel exporter.
- Source-derived humanoids use immutable, hash-pinned, repository-local originals and license evidence. Preparation permits uniform scale and coordinate conversion while retaining source anatomy, rest transforms, deforming bones, weights, topology, UVs, material boundaries and authored split normals. Suitable peaceful source clips retain their glTF timestamp durations; missing Neva actions are authored on that same source rig. Donor-body fitting, reduced substitute skeletons, blanket flat normals and copying unrelated donor pose arrays are not accepted restoration paths. Source authoring files remain offline; the registered `imported_blend` generator packages the validated derivatives with lossless Meshopt compression and atomic publication.
- Static prefabs: catalog entry, with its optional closed `referenceAuthoring` evidence-to-generator brief when image/study guided → the brief binds identity-defining layout into catalog `parameters` → registered deterministic Blender Python family generator consumes those keys (optionally composed from shared `common/authored.py` construction helpers) → raw GLB → Khronos validation → glTF Transform dedupe/prune/weld + Meshopt → revalidation → atomic publish. A reconstruction study may inform the brief; it does not authorize a direct runtime TypeScript factory or second exporter.
- Ground supporting maps: processed CC0 derivatives published under `public/assets/textures/terrain/`, provenance and URLs owned by `src/render/materials/ExternalSurfaceTextures.ts`, sampling/blend strengths owned by `VisualRenderConfig`. They occupy the Art Bible's low-frequency tiler slot and must remap into `PaletteTokens`; photographic RGB is not final albedo. See Art Pipeline section 6.2.
- Dynamic systems: Three.js TS buffer/procedural builders (water, crop stages, seasonal tint, dynamic fish, debug proxies, and the `MeadowField` short-grass carpet derived from terrain presentation weights).
- Conventions: `1 unit = 1 meter`, Y-up, consistent forward, applied transforms, stable names/pivots, material reuse.

Machine ownership is explicit:
- `assets/specs/asset-catalog.schema.json` validates the single generated-asset catalog.
- `assets/specs/asset-catalog.json` owns asset IDs/files/families, generator names, seeds, dimensions, palette tokens, triangle floors/targets/maxima, material caps, pivots, collision primitives, instancing, LOD, required nodes, read distance, generator parameters, optional reference-authoring source/hierarchy/review contracts, and character rig/socket/animation contracts.
- `art/palettes/neva.palette.json` owns semantic palette tokens used by Blender and runtime material APIs.
- `tools/blender/asset_budgets.json` owns scene profiles, texture ceilings and the catalog pointer; it does not duplicate per-asset budgets.
- `src/render/config/VisualRenderConfig.ts` owns the live renderer baseline, including terrain/road supporting-map sampling and blend strengths. Canonical Markdown documents ownership, not a frozen copy of those numbers.
- `src/render/materials/ExternalSurfaceTextures.ts` owns supporting-map provenance, source pages, runtime URLs, wrap/filter/color-space, and the 1px load fallback. `public/assets/textures/terrain/` stores the published files; it is not a filename-list authority.
- `tools/blender/cli.mjs` is the public automation entrypoint. Its `brief` command validates and renders any reference-authoring contract without running Blender; this is authoring readiness, not visual approval. `bootstrap.py`, `generators/registry.py`, family generator modules and `common/*` are internal implementation layers. In particular, `common/authored.py` centralizes reusable deterministic mid-scale forms such as masonry courses, shingles, planks, lattice/rope, arch rings and fasteners; it must remain subordinate to the catalog entry and owning registered family generator.
- `vite.config.ts` derives the browser's virtual runtime-catalog projection directly from the same JSON at build time and includes only loader, placement and runtime animation/binding fields. The gameplay runtime projection excludes generator parameters, budgets, source URIs and reference-authoring evidence. The separately emitted Art Yard diagnostic data is a different export and includes review metadata; `tools/vite/artYardPlugin.ts` owns it. Never check in a second runtime catalog as an authority.
- `tools/art/codegen.mjs` derives `src/render/assets/AssetCatalog.generated.ts` (typed `ASSET_IDS`, family names, and family maps). `dev`, `build`, `typecheck`, and `test` refresh it; CI/review should also run `npm run art:codegen:check`. The generated adapter is never hand-edited.
- `tools/vite/runtimeAssetCatalogPlugin.ts` hot-refreshes codegen and serves the runtime-only virtual catalog; `tools/vite/artYardPlugin.ts` serves the dev-only `/__neva_art_yard` and staged `/__neva_art_stage/run-ID` review paths. The yard reuses `AssetLoader`, `VisualRenderConfig`, `PaletteMaterials`, and `LightingRig`, and is not part of the production build.
- `generated/.cache/art/` stores validated optimized GLBs by per-asset input/toolchain hash. It is disposable acceleration state, not a publish directory or authority. Release/shared-generator `art:determinism` bypasses it and regenerates both passes from the generator; routine asset work keeps the cache enabled and does not double-generate.

Runtime ownership is also one-way: generated IDs/families and the Vite runtime projection consume the canonical JSON, `src/render/assets/AssetCatalog.ts` adapts the typed/runtime projections, `AssetLoader.ts` loads Meshopt GLBs through the canonical cache/clone path, and static compatible prefab instances may be consolidated with `THREE.BatchedMesh`. Simulation remains authoritative; catalog metadata, collision proxies, animation clips, and scene nodes never become gameplay truth.

`WorldScene` coordinates scene updates. `WeatherFramePresentation` shares one sampled weather transition across consumers; `FaunaMotionPresentation` and `FishPresentation` own their visual motion/material handling; `StaticPrefabBatcher` owns compatible mesh consolidation. These modules hold presentation state only.

Example stable nodes: `boat_skiff_root`, `boat_skiff_cargo_01`, `boat_skiff_hook_left`, `house_farmhouse_a_root`, `crop_wheat_mature_root`, `fish_trout_a_root`.

Publication/report boundary:
- `generated/reports/asset-manifest.json` plus `public/assets/models/asset-manifest.json` describe the last atomically published set.
- `generated/reports/asset_budget_report.json` describes the latest atomically published quality state. An attempted or rejected generation writes `asset-report.json`/Markdown inside its run-local stage; failure before publication leaves the published manifest and report unchanged.
- `generated/.cache/art/` and the dev art yard may expose cache/input hashes and hit/miss status for review, but neither replaces the generated/public manifests or human approval.
- Release determinism and benchmark commands must not replace the canonical quality report or publish assets. Static Blender preview generation is not part of the pipeline. The Art Yard is the asset-review surface: published views are available in DEV and production, while candidate-stage endpoints are DEV-only. `BLENDER.md` §5 owns the routes and limitations.

The mainland is a populated production world rather than an MVP-size scene.
Scene draw/triangle envelopes are tier-specific in `tools/blender/asset_budgets.json`;
texture authoring remains in `04` §5. Spend the larger envelope on coherent terrain,
canopy, settlement silhouettes and nearby detail. Repeated assets share geometry
and materials; landscape cells reject distant detail before per-placement LOD work,
and ground-cover submission has a tier-owned cap independent of world area.
Trees, buildings and collision remain consistent across quality settings.
Static prefab batching is shared by production and normal DEV play. Opaque batches
skip unnecessary instance sorting and reuse their native frustum-filtered draw list
only while the view, batch transform and visibility revision are unchanged. A shadow
view invalidates that cache independently. DEV retains source hierarchies off-scene;
entering F2 restores their exact tagged meshes, and leaving F2 rebuilds the batches.
Collider refresh includes retained sources even while their render hierarchies are
dormant. This is presentation scheduling, not changed placement or save truth.

Production packaging retains the quality-gated WebP atlas pages declared by `public/assets/ui/atlas/ui-atlas.json` and all standalone runtime sprites/textures. Runtime page filenames carry a content hash, so the host may cache them immutably; the lossless PNG page is the review/diagnostic reference and production excludes it, along with legacy duplicate/unreferenced packed pages and the local HUD/probe HTML pages (`tools/vite/productionArtifactsPlugin.ts`); authored and published source files remain intact for DEV and atlas validation. `AtlasImage` requests the numbered WebP pages. The packer tiers families by first use, and the manifest's `preloadPages` names exactly the pages the title screen and normal HUD present; boot warms those through `src/ui/atlas/preloadUiAtlas.ts` without gating entry, while the remaining pages prefetch at idle or load on demand. `tools/ci/check-download-budget.mjs` separately checks the code-bundle ceiling and complete uncompressed distribution ratchet; neither metric proves actual initial playable transfer or startup time. Larger world scope does not justify duplicating shared assets in the download.
These are scene envelopes, not instructions to spend triangles uniformly. `tools/blender/asset_budgets.json` owns the exact scene/texture profiles; `assets/specs/asset-catalog.json` owns each asset's production floor, quality target, hard maximum, material limit, and LOD policy. `VisualRenderConfig` owns the richer live renderer configuration in `src/render/config/VisualRenderConfig.ts`; the guide documents ownership and invariants, not a second frozen copy of that object. `04` explains how to spend the budgets. Use glTF Transform where appropriate.

# 13. UI & Accessibility

WebGL renders world; DOM renders inventory, market, journal, farm selection, boat management, contracts, settings, tooltips.

`GameUiModalLayer` owns conditional modal rendering and loads the heavy modal components when opened. `GameApp` projects the small player/diagnostic inputs and uses the simulation fishing presenter for catch freshness; React does not inspect live cargo storage or receive canonical state.

Normal HUD uses the current composition owned by `04` §17: one immediate action prompt and controls only when a contextual choice exists. Weather warnings and fishing/boat status remain contextual. `WorldHudPresentation` supplies full Sprint values during ordinary on-foot play, including full stamina; mounted, boat, and fishing states suppress that walking resource. While mounted the same unit-frame slot shows the active mount's stamina budget (`WorldHudDto.mount`) instead, labelled Gallop on the donkey and Trot on the carriage, so the animal's burst budget stays legible. The HUD does not infer resource values. Dialogue is a contextual DOM overlay opened only from an authoritative nearby NPC interaction; the journal exposes the current story title/objective, completed quest history, a People directory of the named cast and an authored Town Notices folio (earned-state readings only, no new state or gate) without becoming a permanent dashboard. Persistent HUD target: **<20–25%** desktop viewport, **<15–18%** mobile viewport.

The normal HUD becomes hidden and inert while a modal owns focus; covered crop, field and interaction guidance is also suppressed so the world remains the backdrop. Market purchase quantities and ticket totals use the simulation commodity inspection/command contract; errors remain visible over the modal. `NoticeQueue` publishes a new array snapshot when messages change, so memoized UI observes additions, repeats and updates. The session-only Chronicle receives explicitly categorized trade, field and story events; generic input guidance stays transient. Its filters operate on the retained entries and remain available when a selected strand is empty. The chart and minimap share authored world geometry, with live player position and heading supplied to presentation. These interfaces add no saved state or alternate price, capacity, growth or travel formulas.

UI style should use centralized CSS variables, not scattered hardcoded colors. Visual details remain under `04`.

Baseline accessibility: keyboard support, readable contrast, UI scaling (with a compact 0.60 mobile default), audio sliders, reduced motion, clear focus states, non-color-only tension feedback. Settings radio groups expose one Tab stop and select with arrows/Home/End; nested almanac tabs use the same arrow-navigation contract as the journal. Catch inspection uses shared modal focus handling, and dialogue/catch shortcut handlers preserve native Enter/Space activation on focused controls. Title-screen dialogs make their covered controls inert and restore the opener after closing. Tension communicates through position/shape/sound and optionally color.

# 14. Audio & Domain Events

`src/audio/AudioManager.ts` and `assets/audio/audio-manifest.json` own implemented bus IDs, cue definitions and playback. `06` owns the intended mix and specified cue coverage; its semantic target graph is not the current runtime schema. Fishing feedback should make cast, bite, reel/strain, danger and terminal outcomes audible; dedicated cues remain design targets until manifest, trigger and listening evidence exist. Narrative feedback may respond to `NpcTalked`, `QuestStarted`, `QuestProgressed`, `QuestCompleted`, and `ActCompleted`, but audio must reinforce a real state transition rather than invent one.

Use explicit domain events such as `CropPlanted`, `CropMatured`, `CropHarvested`, `FarmFertilized`, `IrrigationInstalled`, `FarmIrrigated`, `RecipeStarted/Completed`, `FishSchoolSpawned/Activated`, `FishHooked/Escaped/Caught/Stored`, `BoatDocked`, `ItemSold`, `MarketTicked`, `WeatherChanged`, `ProficiencyRankUnlocked`, `ContractCompleted`, `NpcTalked`, `QuestStarted`, `QuestProgressed`, `QuestCompleted`, and `ActCompleted`. Success events are emitted only after their atomic mutation succeeds. `QuestCompleted` is published only after the active pointer has advanced to the next quest or epilogue, so persistence and presentation listeners observe one coherent transition. `NpcTalked` credits no objective: `QuestDomain.talkToNpc` credits a talk step itself, only for the thread whose lines it delivered. `QuestStepAhead` reports an action (or a talk) that matched a later step of a running errand and therefore counted for nothing; it is feedback only. Events may feed UI/audio/analytics/achievements/diagnostics; do not turn simulation into one opaque event bus. Narrative events are signals, not a replacement for `GameState.quests` or the content registry.

World discovery commits follow an accepted physics frame in `Simulation.commitPhysicsFrame`. `DiscoveryPresentation` derives nearby undiscovered content for the required arrival mode; simulation stores its knowledge ID and emits `PlaceDiscovered`. A discovery may atomically grant a finite registered item batch before its knowledge ID commits, and a full satchel leaves both reward and discovery available for a later return. The application consumes the committed event for a notice, Chronicle entry, autosave and optional camera framing. No camera timer enters canonical state.

# 15. Error Recovery & Diagnostics

Never soft-lock:
- zero fuel → **Emergency Tow** according to `02` §11; preserve cargo and leave fuel empty;
- lost boat → **Recall Boat** when not carrying valuable physical cargo;
- full inventory at harvest → refuse atomically and keep the crop available with a clear capacity message; no silent harvest loss or invented ground-crate fallback;
- corrupt save → primary → backup → title-screen New Game confirmation (nothing written until confirm). Unavailable IndexedDB → continue without saving; writes stay blocked.

Debug panel: FPS, frame time, draw calls, triangles, coordinates, region, mode, game time, weather, market tick, active schools, save state, world seed.

DEV walking collision inspector (`F3`, or `?colliders` on load): `CollisionDebugView` reads live Rapier box/capsule poses through `PhysicsWorld.collisionDebugSnapshot()`. Nearby solid objects appear as yellow outlines through scenery, the player capsule is cyan, lateral contacts are red, and support normals are green. Numbered labels identify nearby/contacted authored instances in a compact panel; terrain and roads report contact IDs/normals without drawing the full terrain mesh. The panel distinguishes actual walking blockage from lateral contact and `WorldLayout` walkability/water/interior restrictions, retaining the last blockage briefly after movement stops. Collider sampling runs only while enabled, at 10 Hz within 25 m; label projection follows the camera. The view is dynamically imported only in DEV and disposed with the application. It does not change collision, input semantics, world topology, simulation state, or saves. F3 ignores text entry and key repeats; the panel also has a hide button.

DEV layout editor (`F2` / `?place`, Vite `import.meta.env.DEV` only): presentation picking of discrete world objects. It is not a `GameplayMode` or `GameAction`. Dropped poses write the owning layout TypeScript via `/__neva_layout_editor/commit`; this session also debug-relocates simulation structures, market/station interact anchors, and Rapier static colliders. DEV skips static mesh merging and the baked sun-shadow proxy so picks hit live meshes and colliding meshes self-cast and follow the move. Copy/paste (`⌘/Ctrl+C` / `⌘/Ctrl+V`, or `⌘/Ctrl+D` duplicate) inserts a new catalog instance for props, fences, authored details, seeded trees (as a new authored pin), and interior furniture. Delete/Backspace removes those same kinds from source (`PLACEMENT_REMOVED` / `FARM_FENCE_REMOVED` for generated instances). Unique gameplay objects (farmhouse, mill, NPCs, landmarks, architecture pads) cannot be copied or deleted. Grass scatter, crops, boats, and the player stay undraggable. Operational owner: `LLM/LAYOUT_EDITOR.md`.

Dev commands: advance time, force weather, spawn school, set demand, grant item/money, set proficiency, damage/repair boat, save/load/reset. Protect/exclude in production.

# 16. Performance & Testing

Representative performance states: empty starter area; full farm; harbor + boat; offshore + gulls/weather; sport-fishing HUD; rain/storm; inventory/market UI. Measure FPS, frame time, memory, draw calls, loading stalls. **Profile; do not optimize by intuition.**

Visual production is not deferred until late polish. P0.75 has explicit sub-gates: the human visual decision for the four gameplay-camera slices, validation of the current generated/public published manifests against the catalog, and the measured benchmark contract. Manifest membership is owned by the publication artifacts described in §12, not a hand-copied asset count. The recorded human visual decision unlocks further authored-world expansion; the benchmark and clean-source strict/determinism evidence remain technical-art/release certification gates. Active DEV layout-editor measurements are intentionally unbatched and are diagnostic, not production-equivalent proof. Normal DEV uses static prefab batching, but production remains the performance evidence lane. No sub-gate waives production minimums, hard maximums, material/node/palette contracts, or runtime validation.

Testing layers:
- **Unit:** pure growth/yield/quality/pricing/freshness/demand/capacity/rank rules.
- **Simulation:** fixed seed/state; same 300-minute advancement → same crops/schools/market.
- **Integration:** harvest→inventory; grain→recipe→chum; catch→cargo; cargo→market→money.
- **E2E:** boot/move/plant/harvest/fish/boat/sell/save/reload/resize. Release/gold-slice WebGL gates retain screenshot evidence; routine selected-asset work receives focused Art Yard/game inspection under `BLENDER.md`, with human visual approval recorded separately.

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

A technical change is complete when the owning contract and affected callers
agree, meaningful failure paths are handled, and the relevant checks in `03`
§4 pass. Persistent changes preserve saves and update §6.1; presentation-only
work does not need new serialized state. Update the owning documentation when
a documented fact changes, as required by root `AGENTS.md`.

Story-bearing features also satisfy `02` §0.1: stable content ownership,
person/place/action/consequence, simulation-owned objectives and rewards, and
safe dialogue close/resume. Presentation must not invent progression or player
identity.

A new architecture, framework or paradigm requires the human's authorization
for that scope. Explain the concrete limitation, affected contracts, save and
performance impact, and why existing architecture is insufficient. Existing
explicit authorization remains valid; do not add a second approval checkpoint
for an already authorized change.

# 19. Source-of-Truth Priority

Root `AGENTS.md` is the single routing and conflict-resolution authority. Use
its declared owners to distinguish design intent, exact code/data fields,
observed implementation and evidence. Report code/spec disagreement and resolve
the affected decision; do not treat a bug as precedent or duplicate the
priority list here.
