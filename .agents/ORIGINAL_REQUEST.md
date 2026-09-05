# Original User Request

## Initial Request — 2026-08-30T09:53:22Z

Implement the Neva Tools Architecture & Implementation Specification (v2.0) across all 5 subsystems, providing a hardened, deterministic, incremental developer infrastructure for procedural 3D generation, AST-based layout editing, extruded texture atlases, bus-normalized audio, and deterministic WebGL regression testing.

Working directory: /Users/anilkaraca/Desktop/Neva
Integrity mode: development

## Requirements

### R1. 3D Procedural Art Pipeline & Incremental Caching
- Implement content-addressed build caching (`tools/blender/cache.mjs`) tracking generator sources, toolchain files, catalog specs, palette tokens, Blender version, and optimization configs to skip redundant asset builds.
- Implement a dynamic work-stealing Blender worker pool (`tools/blender/pool.mjs`) with concurrent FIFO queueing, process lifecycle isolation, per-asset timeouts, and signal cleanup handlers.
- Integrate glTF mesh quantization (`KHR_mesh_quantization`) and automatic derived LOD generation (`tools/blender/optimize.mjs`) using `@gltf-transform` and `meshoptimizer`.
- Implement memory-safe asset hot-swapping (`src/render/assets/AssetHotSwapper.ts` / `AssetLoader.ts`) that disposes old instance geometries, preserves instance parent transforms, clones new visual hierarchies, and recalculates bounding volumes.

### R2. Lossless AST Level & Placement Editor
- Implement a scoped, lossless AST patcher (`tools/layout-editor/patchPlacement.ts` / Recast transformer) supporting atomic update, add, and delete mutations with strict scoping, zero-match/duplicate-ID safety guarantees, atomic `.tmp` file commits, and post-mutation parse validation.
- Implement terrain surface snapping (`src/layout-editor/TerrainSnapping.ts`) using `three-mesh-bvh` accelerated raycasting and world-space normal matrix transformation for alignment.
- Implement a failure-safe Command Pattern history system (`src/layout-editor/history/HistoryManager.ts`) with undo/redo stacks, execution guards, and drag coalescing for continuous transform manipulations.

### R3. UI Texture Atlas with 2D Edge Dilation & Lossless Packaging
- Implement 2px border edge dilation and atlas packing (`tools/ui/extrudeAndPack.mjs`) using `sharp` and `maxrects-packer` to eliminate bilinear/mipmap texture bleeding.
- Output both lossless WebP and PNG atlas sheets along with JSON manifest files whose UV coordinates point strictly to the inner non-extruded frame boundaries.

### R4. Category-Based Bus Audio Normalization
- Implement bus-specific audio loudness normalization (`tools/audio/normalizeBus.mjs`) with category target standards (e.g. `ui_transient`, `tools_work`, `footsteps_movement`, `environment_ambience`, `animals_wildlife`, `water_splashes`, `dialogue_vocals`).
- Use a 2-pass stderr extraction and application process with `ffmpeg` `loudnorm` filter incorporating measured integrated loudness, true peak, loudness range, and target offset.

### R5. Deterministic Visual Regression CI & Unified Developer CLI
- Implement the 16-point determinism matrix harness for Playwright WebGL visual regression testing (`tests/e2e/visual-regression.spec.ts`) locking viewport, DPR, camera, solar vectors, water phase, seeded particles, font loading, and `window.__NEVA_RENDER_READY` handshake.
- Implement a unified developer CLI (`tools/cli.mjs`) exposing unified interactive and scriptable commands for art, layout, ui, audio, and regression tasks while maintaining backwards-compatible npm scripts in `package.json`.

## Verification Resources

- Existing test suite: `tests/unit/layoutEditorPatch.test.ts`
- Spec reference: `tools/TOOLS_UPGRADE_IMPLEMENTATION_SPEC.md`
- NPM scripts: `npm run typecheck`, `npm run test`, `npm run build`

## Acceptance Criteria

### Build & Type Safety
- [ ] `npm run typecheck` succeeds with 0 TypeScript compilation errors.
- [ ] `npm run build` bundles successfully with Vite.
- [ ] `npm run test` passes all unit tests, including AST patcher tests and history manager tests.

### Functional Subsystem Validation
- [ ] Incremental cache accurately detects changes in generator code, catalog spec, and toolchain dependencies, returning cache hits on unmodified assets.
- [ ] Recast AST placement patcher handles adds, updates, and deletes with duplicate detection and atomic file commits without mangling surrounding code or comments.
- [ ] `TerrainSnappingSystem` computes accurate surface contact points and world normals using `three-mesh-bvh`.
- [ ] UI atlas generation emits 2px edge-dilated lossless WebP/PNG sheets and manifests with accurate inner UVs.
- [ ] 2-pass audio normalizer correctly parses FFmpeg stderr JSON and applies category target LUFS.
- [ ] Playwright visual regression test file is configured with the 16-point determinism matrix.
- [ ] Unified CLI executes all subsystem tool commands cleanly.

## 2026-09-03T11:32:03Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: Full multi-agent teamwork team

Comprehensively overhaul every user-facing UI, HUD, modal, inspector, minigame, and screen across Neva into an ArcheAge / Palia-inspired cozy MMO interface system while strictly adhering to Neva's non-combat coastal trade/farming/fishing game logic, world-first <20-25% persistent screen coverage, and canonical simulation ownership.

Working directory: /Users/anilkaraca/Desktop/Neva
Integrity mode: development

## Comprehensive Requirements (Zero Interface Left Out)

### R1. Persistent Gameplay HUD & Nautical Navigation
- **Top-Left Player Unit Frame**: Crest/avatar frame, Labor (Work Capacity `current/maximum`) bar with recharge feedback, Sprint Stamina bar (with exhaustion warning), and active status chips (Overburdened Cargo pack, Well Rested, Rain Soaked, Night Water chill).
- **Top-Right Nautical Compass & Almanac**: Integrated Celestial Time Dial (hour/minute, day/season, solar/lunar astronomical rotation) combined with a Circular Nautical Compass Radar displaying cardinal bearings, wind direction arrow, current sub-region title, and nearby objective/station markers (Farm plot, Harbor dock, Active Quest beacon, Fishing school).
- **Collapsible Quest & Contract Tracker**: Pinned under the top-right compass, displaying active story quest steps and market delivery contracts with checkmarks and fold/unfold toggles.
- **Bottom-Right Micro-Menu & Purse Bar**: Compact icon rack for major panels (Satchel `[I]`, Field Journal `[J]`, Nautical Chart `[M]`, Hold & Stores `[L]`, Expeditions `[P]`, Menu `[Esc]`), anchored with an animated Gold Purse counter and Bag/Cargo capacity badges (e.g. `14/20` slots, `1/1` Back Pack).

### R2. Contextual Toolbar, Action Channeling & Smart Prompts
- **Smart Contextual Stance Toolbar**: Mode-driven hotbar that dynamically shifts loadouts:
  - *Agronomy Stance* (On farm plot): Slots 1–5 bind to Hoe, Seed Belt Flyout (with active seed icon & seed count), Watering Can (with water reservoir meter), Fertilizer/Compost, and Weeding/Harvest.
  - *Angling Stance* (Near water/in boat): Slots 1–5 bind to Cast Rod, Lure/Tacklebox, Chum/Bait Bucket, Keepnet/Fish Bag, and Stow Rod.
  - *Maritime Stance* (Boating): Integrated vehicle dashboard showing Helm control, Knots/Heading, Hull Integrity meter, Fuel tank meter, and Fish Cargo Hold slots.
  - *Explorer Stance* (Travel): Quick access to Satchel, Pocket Chart, Rations, and Lantern.
- **Farming & Interaction Action Cast Bar (`FarmingActionStatus`)**: High-polish MMO action-channeling progress bar for planting, tilling, watering, fertilizing, harvesting, processing, boarding, docking, and crafting.
- **Smart Labor Action Prompts**: Floating contextual prompt display showing primary key (`[E]`), interaction verb, target entity name, and Labor cost badge (e.g., `[E] Harvest Winter Carrot (-5 Work)`).
- **Planting Seed Belt Selector (`PlantingSeedBar`)**: Docked horizontal tray showing owned seeds with quantity badges, seasonal compatibility icons, and soil suitability hints during placement mode.

### R3. In-World Inspectors, GIS Overlays & Toasts
- **Crop Inspection Card (`CropInspection`)**: Live inspection sheet when examining crops: crop icon, name, growth stage chip, stage timing countdown/progress label, soil moisture band (`wet`, `ideal`, `dry`), immediate next action (`Water`, `Harvest`, `Fertilize`), and Work cost.
- **Farm GIS Legend & Soil Overlay (`FarmGISLegend`)**: Activated via `[Alt]` hold: in-world tile tinting with HUD legend indicating soil moisture levels and nitrogen/compost fertility.
- **Trophy Catch Inspection Card (`CatchInspectionModal` & `CatchSummaryToast`)**: Celebratory popover card when landing a sport fish: species portrait, weight in kg, length, star quality tier, freshness timer, market estimated value, and personal best record badge.
- **Contextual Hint Cards (`ContextualHintCard`)**: Non-intrusive coastal discovery tips for first-time systems (boating navigation, sport fishing mechanics, soil care) with clean dismiss and keyboard shortcuts.
- **Notice Stack & Weather Hazards (`NoticeStack`, `weather.hazard`)**: Sleek floating notifications for item gains/losses, labor shifts, and top-right warning banners for maritime hazards (dense fog, squall, storm waves).

### R4. Dual Fishing Minigames & Cockpits
- **Basic Fishing Minigame (`BasicFishingMinigameWidget`)**:
  - Cast charge meter with sweet-spot indicator.
  - Water surface bobber alert with haptic/visual ripple feedback.
  - Precision bite-reaction hook prompt (`[Space] Hook!`).
  - Reeling tension mini-bar (maintaining the bobber within the moving tension window) and catch victory / escape outcomes.
- **Sport Fishing Telemetry HUD (`FishingHUD`)**:
  - 3D circular line-tension gauge (safe slack, optimal tension, near-snap danger alarm).
  - Fish stamina gauge, run distance indicator (meters to boat), and water depth telemetry.
  - Rod deflection angle and counter-swing guidance (`[A]` / `[D]`).
  - Reeling (`[W]`) vs Slacking (`[S]`) tactile controls with audio-visual strain cues.

### R5. Maritime Vessel Console (`hud-boat-panel`)
- Contextual nautical dashboard when helm is engaged:
  - Vessel name, registration insignia, and docking status chip.
  - Speed log in knots, heading bearing, and sea-state condition (calm, choppy, rough).
  - Hull integrity bar (with damage tint) and Fuel tank level gauge.
  - Physical Cargo Hold bay grid: individual hold slots showing loaded fish cargo / trade packs, species sprites, quality medallions, and real-time freshness decay bars.

### R6. Side-by-Side Dockable MMO Windows & Inventories
- **Satchel Inventory (`InventoryModal`)**: Grid slots with category filter tabs (`[All]`, `[Farming]`, `[Fishing]`, `[Supplies]`), auto-sort button, item search bar, and bag capacity indicator.
- **Companion Docking (Trade & Storage)**:
  - *Market Stalls (`MarketModal`)*: Vendor sheet docks side-by-side with player Satchel; dynamic price quotes, local supply/demand trend graph, bulk "Sell All Produce" button, Seed shop, Rod equipment shop with tier comparisons, and contract hand-in.
  - *Boat Hold & Warehouse Storage (`LogisticsLedgerModal`)*: Multi-vessel fleet overview, cargo manifest, warehouse stock, and 1-click transfer between satchel and hold.
- **ArcheAge Physical Cargo Representation**: Distinct visual treatment for stackable satchel goods vs heavy physical trade packs / large trophy fish carried on the player's back (with movement speed penalty cues).
- **Rich MMO Item Inspect Cards**: Floating cursor cards displaying item name, rarity frame, freshness decay timeline, soil/season requirements, base trade value, and lore text.

### R7. Folio, Almanac & Expedition Planners
- **Field Journal Folio (`JournalModal`)**: Parchment desk folio with bookmark tabs:
  - *Story Spine*: Active quest narrative, chapter milestones, completed lore log.
  - *Contracts Board*: Live delivery orders, deadlines, profit margins, turn-in targets.
  - *Coastal Almanac*: Fish species encyclopedia (habitats, bait preferences, size records) and Crop almanac (growth seasons, water needs, yield).
  - *Proficiencies / Skills*: Rank progression bars for Agriculture, Angling, Seamanship, Commerce.
  - *How-to-Play Guide*: Illustrated controls, mechanics reference, and gameplay tips (`HowToPlayGuide.tsx`, `ControlsReference.tsx`).
- **Nautical Chart Modal (`WorldMapModal`)**: Full-screen navigational chart with discovered landmarks, harbors, farm plots, active fishing schools, waypoints, and regional market demand heatmap.
- **Expedition Board Modal (`ExpeditionBoard`)**: Maritime voyage planner for unlocked offshore expeditions: sea route maps, danger ratings, crew/cargo requirements, and voyage rewards.

### R8. System Overlays, Title Screen & Dev Tooling
- **Pause & System Menu (`EscapeMenuModal`)**:
  - Quick-save button and autosave health indicator.
  - Emergency safety actions: "Reset player to safe shore", "Emergency Tow / Recall Boat".
  - Audio configuration panel: independent calibration sliders for Master, Music, Ambience, Weather, Fishing, and UI.
  - Graphics quality selector: Low, Medium, High, Ultra presets with live renderer adaptation (`InterfaceSettings.tsx`).
- **Title Screen & Save Recovery (`StartScreen`, `SaveRecoverySheet`)**:
  - Title splash screen with Continue, New Game, and Save Overview (gold, day, season, playtime).
  - Critical Save Recovery Sheet: fail-safe dialogs for corrupted, incompatible, or read-only storage states with explicit player confirmation.
  - **Activity Feed & Chronicle (Bottom-Left)**:
  - Collapsible Coastal Chronicle with filter tabs (`[All]`, `[Trade]`, `[Farming/Fishing]`, `[Story]`) and auto-collapse.
- **Mobile Touch Controls & Orientation Gate (`MobileControls`, `MobileOrientationGate`)**:
  - Virtual analog joystick, sprint toggle, jump button, virtual tool action button, and virtual fishing controls.
  - Forced landscape orientation lock prompt for mobile browsers.
- **Developer Diagnostics & Placement Editor (`DebugOverlay`, `PlacementEditorHud`)**:
  - Real-time performance metrics (FPS, frame time, draw calls, triangles, player coordinates, camera/locomotion telemetry, time-advance and weather debug triggers).
  - `F2` In-Game Layout Editor HUD for picking, moving, and committing world props.

## Verification & Acceptance Criteria

### Automated Test Suite
- [ ] Run `npm run typecheck` — zero TypeScript compiler errors across all UI files and controllers.
- [ ] Run `npm test` — all unit, modal, and HUD tests pass without regressions.
- [ ] Dedicated test suite `tests/unit/mmo_complete_ui.test.ts`:
  - Verify every one of the 8 requirement areas (R1 through R8) renders without crash and binds correctly to simulation DTOs.
  - Verify Smart Stance Bar transitions correctly across Agronomy, Angling, Maritime, and Explorer modes.
  - Verify side-by-side companion docking logic between Satchel and Market/Hold.
  - Verify basic fishing and sport fishing HUD states activate exclusively during active fishing phases.
- [ ] Viewport Budget Audit: Test assertions verifying that persistent HUD elements occupy <25% of 1080p and 720p viewports.

### Runtime & Interaction Guardrails
- [ ] 100% Simulation Ownership: All UI components consume read-only DTOs; zero game logic or state mutation duplicated in presentation.
- [ ] Modal Priority & Input Exclusivity: Modal overlays properly block world input; active fishing blocks conflicting modals from opening.
- [ ] Mobile Touch Targets: All interactive buttons and slots meet or exceed the 48px touch target standard on mobile viewports.
- [ ] 60 FPS UI performance with zero layout thrashing or unmetered re-renders.

