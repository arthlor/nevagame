# Farm & Fishing Browser Game — Game Foundations & Technical Architecture (Compact)

> **Role:** Primary technical source of truth. Read before all other project specs. If guidance conflicts, follow §41.
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
UI: Vanilla TS or React DOM; UI state via vanilla observers or Zustand. **Do not wrap the core 3D world in React Three Fiber.** Three.js owns 3D; DOM/React owns 2D overlays. Canonical simulation remains domain-driven; optional Miniplex/bitECS/spatial indexing may support rendering/streaming/VFX only.

Asset tooling: implemented glTF Transform + Meshopt + Khronos validation; KTX2/BasisU when a concrete texture path is added; SpectorJS/browser diagnostics for profiling.

Required scripts (compatible stable versions): `dev`, `build` (`tsc && vite build`), `preview`, `typecheck`, `lint`, `lint:fix`, `test`, `test:watch`, `test:e2e`.

# 5. Architecture

```text
CONTENT DEFINITIONS → SIMULATION → APPLICATION SERVICES → PRESENTATION ADAPTERS → THREE.JS / DOM / AUDIO
```
- **Content:** static crops, fish, recipes, boats, items, markets, regions, unlocks, contracts.
- **Simulation:** authoritative mutable state + deterministic rules.
- **Application:** save/load, input, scene transitions, ticks, renderer sync, UI events.
- **Presentation:** displays state; MUST NOT decide economic/gameplay outcomes.

Recommended repository ownership:
```text
src/
  app/            bootstrap, GameApp, lifecycle, GameModeController
  simulation/     core + farming/fishing/boats/weather/economy/inventory/crafting/progression/contracts/world
  content/        registry + crops/fish/items/recipes/boats/markets/regions/progression
  render/         app/loaders/sync/objects/water/weather/materials/fx
  input/          GameAction/InputRouter/KeyboardInput/PointerInput
  ui/             root/hud/inventory/farm/market/journal/boat/contracts/settings/shared
  persistence/    SaveSchema/SaveRepository/IndexedDbSaveRepository/SaveMigrations/SaveValidator
  audio/ diagnostics/ assets/ main.ts
tests/ unit/ simulation/ integration/ fixtures/ e2e/
```

# 6. Canonical State, IDs, RNG & Time

Representative state:
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
  boats: Record<BoatId, BoatState>;
  fishSchools: Record<FishSchoolId, FishSchoolState>;
  weather: WeatherState;
  markets: Record<MarketId, MarketState>;
  progression: ProgressionState;
  contracts: ContractState[];
  journal: JournalState;
  metadata: GameMetadata;
}
```
All state MUST be JSON-serializable.

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
- starting ratio: `1 real second = 1 game minute`, `1 game day = 24 real minutes`, configured centrally.

Ticking: rendering via RAF; movement/physics fixed timestep; economics event/coarse-tick; market hourly game tick; crop/freshness delta-based; weather scheduled. **Never iterate crop growth each render frame.**

# 7. Offline Progression & Persistence

On load: `offlineMs = nowUtcMs - savedAtUtcMs`; cap at **72 real hours**. Deterministically advance in order:
1. calendar
2. crop growth
3. crop moisture
4. processing jobs
5. spoilage/freshness
6. contracts
7. market ticks
8. weather
9. return summary

IndexedDB save envelope:
```ts
interface SaveEnvelope {
  schemaVersion: number;
  savedAtUtcMs: number;
  checksum?: string;
  state: GameState;
}
```
Maintain primary autosave, backup autosave, manual save. Save periodically and on purchase, sale, dock, harvest, unlock, contract completion, visibility loss—not every frame.

Every persistent schema change requires deterministic migrations (`migrateV1ToV2`, etc.). Preserve old fixtures; keep IDs stable; failed migration MUST NOT destroy backup. Before persistent changes agents state: `Save-impact: yes/no`, `Migration required: yes/no`.

Recovery: corruption tries `primary → backup → safe new-game prompt`; never silently wipe.

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
}
```
Fail clearly on unknown IDs, recipes referencing missing items, fish missing habitats, duplicate persistent IDs.

# 9. Input, Modes & Cameras

Map physical input to semantic actions:
```ts
type GameAction =
  | "move-forward" | "move-backward" | "move-left" | "move-right"
  | "interact" | "use-primary" | "use-secondary"
  | "open-inventory" | "open-map" | "open-journal" | "pause"
  | "fish-reel" | "fish-slack" | "fish-brace";
```
Modal rules: inventory may pause movement; fishing blocks inventory; modal disables boat steering; pause suspends simulation except explicit UI.

Explicit modes:
```ts
type GameMode = "on-foot" | "farm-placement" | "basic-fishing" | "sport-fishing" | "boat-driving" | "menu" | "paused";
```
Never infer mode from mesh/UI state.

Cameras react to `GameMode`, never decide gameplay:
- on-foot: 3/4 third-person, damping, moderate zoom, readable farm placement;
- boat: wider chase, visible horizon/forward waves/schools;
- sport fishing: tighter, visible line/fish direction, unobstructed HUD.

# 10. MVP World Scope

Compact intentional world:
```text
Village: public garden, produce market, processing, contracts
Player Farm Zone: private land
River: basic/freshwater fishing
Lake: freshwater sport fishing
Harbor: fish market, dock, boat vendor, fuel/ice
Coast: coastal fishing
Offshore: higher-value sport fishing
```
Do not build a huge open world. Travel must remain strategic, not boring.

# 11. Physics & Water

Use Rapier only where collision response matters: player/world, boat/world, dock, shoreline, simple vehicle/rigid gameplay props. Avoid full physics for crops, fish AI, fishing line, waves, UI, decorative props unless required. Fishing line is simulation math.

MVP water: attractive, animated, readable shore, weather-controlled roughness, mid-tier acceptable, clear boat silhouettes. Simulation owns `sea roughness`, `wind`, `risk`; renderer owns waves/normals/foam/reflection approximation. Do not begin with expensive ocean simulation.

# 12. Art & Asset Runtime Contract

Visual authority: `04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md`; production authority: `LLM_AGENT_ART_PIPELINE_INSTRUCTIONS.md`. Architecture only requires a handcrafted, coherent stylized coastal world; no mismatched hyper-real PBR, toy/mobile look, candy saturation, generic fantasy UI, clutter, excessive bloom, AI texture artifacts, inconsistent scale, or toon/ink outlines.

Canonical visual-system ownership:
- `PaletteTokens` / `PaletteMaterials` own production color/material vocabulary. Production render code and generated assets MUST reference approved tokens/material families rather than scattering arbitrary colors or one-off materials.
- `VisualRenderConfig` owns the renderer color pipeline, exposure, primary sun/fill setup, shadow quality tiers, AO/contact policy, atmosphere defaults, and post-processing baseline. Scene/zone code may request semantic conditions such as time-of-day or weather; it MUST NOT invent local exposure/tone-mapping/light hacks.
- The approved renderer/material baseline is established by the gold-standard art slice in `03` + `04` + Art Pipeline and then treated as a regression-controlled contract.
- Pixel-level screenshot regression compares the game to its own approved benchmark states; style-reference review compares visual language to supplied references and intentionally ignores layout/camera differences unless composition is the task.

Runtime asset contract: **GLB/glTF 2.0 only**; never runtime `.blend/.fbx/.obj`.
- Static prefabs: catalog entry → registered deterministic Blender Python family generator, optionally composed from shared `common/authored.py` construction helpers → raw GLB → Khronos validation → glTF Transform dedupe/prune/weld + Meshopt → revalidation → atomic publish.
- Dynamic systems: Three.js TS buffer/procedural builders (water, crop stages, seasonal tint, dynamic fish, debug proxies).
- Conventions: `1 unit = 1 meter`, Y-up, consistent forward, applied transforms, stable names/pivots, material reuse.

Machine ownership is explicit:
- `assets/specs/asset-catalog.schema.json` validates the single generated-asset catalog.
- `assets/specs/asset-catalog.json` owns asset IDs/files/families, generator names, seeds, dimensions, palette tokens, triangle floors/targets/maxima, material caps, pivots, collision, instancing, LOD, required nodes, read distance and generator parameters.
- `art/palettes/neva.palette.json` owns semantic palette tokens used by Blender and runtime material APIs.
- `tools/blender/asset_budgets.json` owns scene profiles, texture ceilings and the catalog pointer; it does not duplicate per-asset budgets.
- `tools/blender/cli.mjs` is the public automation entrypoint. `bootstrap.py`, `generators/registry.py`, family generator modules and `common/*` are internal implementation layers. In particular, `common/authored.py` centralizes reusable deterministic mid-scale forms such as masonry courses, shingles, planks, lattice/rope, arch rings and fasteners; it must remain subordinate to the catalog entry and owning registered family generator.

Runtime ownership is also one-way: `src/render/assets/AssetCatalog.ts` consumes the JSON catalog, `AssetLoader.ts` loads Meshopt GLBs through the canonical cache/clone path, and static compatible prefab instances may be consolidated with `THREE.BatchedMesh`. Simulation remains authoritative; catalog metadata and scene nodes never become gameplay truth.

Example stable nodes: `boat_skiff_root`, `boat_skiff_cargo_01`, `boat_skiff_hook_left`, `house_farmhouse_a_root`, `crop_wheat_mature_root`, `fish_trout_a_root`.

Publication/report boundary:
- `generated/reports/asset-manifest.json` plus `public/assets/models/asset-manifest.json` describe the last atomically published set.
- `generated/reports/asset_budget_report.json` describes the latest `generate` attempt, including a rejected strict candidate; it is a quality report, not proof of publication.
- Determinism and preview commands must not replace the canonical quality report or publish assets.

MVP guardrails:
```text
Initial playable download: target <20 MB
MVP compressed total: target <80 MB
High-quality gameplay target: 250k–900k visible triangles, <=220 draw calls preferred
High-quality hard ceiling: 1.5M visible triangles, <=300 draw calls
Textures: follow `04` as the normal target — 128–256 tiny, 256–512 normal props, 512–1024 hero assets; 2048 is rare/shared/exceptional. Any 1K–2K allowance here is a ceiling, not a default.
Repeated crops/props: instancing/material reuse
```
These are scene envelopes, not instructions to spend triangles uniformly. `tools/blender/asset_budgets.json` owns scene/texture profiles; `assets/specs/asset-catalog.json` owns each asset's production floor, quality target, hard maximum, material limit, and LOD policy. `04` explains how to spend them. Use glTF Transform where appropriate.

# 13. UI & Accessibility

WebGL renders world; DOM renders inventory, market, journal, farm selection, boat management, contracts, settings, tooltips.

Normal HUD: top-left compact day/time/weather; top-right money; bottom-center context prompt; temporary fishing/boat status. Persistent HUD target: **<20–25%** desktop viewport.

UI style should use centralized CSS variables, not scattered hardcoded colors. Visual details remain under `04`.

Baseline accessibility: keyboard support, readable contrast, UI scaling, audio sliders, reduced motion, clear focus states, non-color-only tension feedback. Tension communicates through position/shape/sound and optionally color.

# 14. Audio & Domain Events

Audio categories: `master`, `music`, `ambience`, `weather`, `boat`, `fishing`, `ui`. Fishing feedback MUST include cast, bite, reel, strain, near-snap, splash, catch, snap/escape so fishing is not meter-only.

Use explicit domain events such as `CropPlanted`, `CropMatured`, `CropHarvested`, `RecipeStarted/Completed`, `FishSchoolSpawned/Activated`, `FishHooked/Escaped/Caught/Stored`, `BoatDocked`, `ItemSold`, `MarketTicked`, `WeatherChanged`, `ProficiencyRankUnlocked`, `ContractCompleted`. Events may feed UI/audio/analytics/achievements/diagnostics; do not turn simulation into one opaque event bus.

# 15. Error Recovery & Diagnostics

Never soft-lock:
- zero fuel → **Emergency Tow** (money + time);
- lost boat → **Recall Boat** when not carrying valuable physical cargo;
- full inventory at harvest → keep on plant, temporary ground crate, or block with clear message; never destroy harvest;
- corrupt save → primary → backup → safe prompt.

Debug panel: FPS, frame time, draw calls, triangles, coordinates, region, mode, game time, weather, market tick, active schools, save state, world seed.

Dev commands: advance time, force weather, spawn school, set demand, grant item/money, set proficiency, damage/repair boat, save/load/reset. Protect/exclude in production.

# 16. Performance & Testing

Representative performance states: empty starter area; full farm; harbor + boat; offshore + gulls/weather; sport-fishing HUD; rain/storm; inventory/market UI. Measure FPS, frame time, memory, draw calls, loading stalls. **Profile; do not optimize by intuition.**

Visual production is not deferred until late polish. Before broad world/content asset production, the renderer/material foundation and at least one gold-standard gameplay-camera scene MUST satisfy `04` + Art Pipeline. Large asset batches are blocked if the gold slice is visually below target, even when performance/tests pass.

Testing layers:
- **Unit:** pure growth/yield/quality/pricing/freshness/demand/capacity/rank rules.
- **Simulation:** fixed seed/state; same 300-minute advancement → same crops/schools/market.
- **Integration:** harvest→inventory; grain→recipe→chum; catch→cargo; cargo→market→money.
- **E2E:** boot/move/plant/harvest/fish/boat/sell/save/reload/resize. WebGL changes require screenshots.

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
