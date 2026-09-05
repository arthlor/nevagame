# Dispatch — Explorer Survey M0-3: Dockable Windows, Folio/Almanac, System Menus & Test Suite (R6, R7, R8 & Verification)

## 1. Identity & Context
- Agent: explorer_survey_m0_3
- Archetype: teamwork_preview_explorer
- Working directory: /Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_3/
- Parent: orchestrator_2 (ID: a66ec739-374f-4ce2-8658-fb981bd1acb8)

## 2. Objective
Map and investigate the full technical scope for R6, R7, R8 and the Verification Suite:
- **R6: Side-by-Side Dockable MMO Windows & Inventories**:
  - Satchel Inventory (`InventoryModal`): Categories ([All], [Farming], [Fishing], [Supplies]), auto-sort, search bar, capacity indicator.
  - Companion Docking: Market Stalls (`MarketModal`) side-by-side with Satchel, dynamic price quotes, trend graph, bulk sell, seed shop, rod shop; Boat Hold & Warehouse Storage (`LogisticsLedgerModal`) with fleet overview, warehouse stock, 1-click transfer.
  - ArcheAge Physical Cargo: Stackable satchel goods vs heavy back pack / trophy fish cargo with speed penalty visual cues.
  - Rich MMO Item Inspect Cards: Cursor cards with rarity frame, freshness decay timeline, soil/season requirements, trade value, lore text.
- **R7: Folio, Almanac & Expedition Planners**:
  - Field Journal Folio (`JournalModal`): Story Spine, Contracts Board, Coastal Almanac (fish & crop encyclopedias), Proficiencies/Skills rank progression, How-to-Play Guide (`HowToPlayGuide.tsx`, `ControlsReference.tsx`).
  - Nautical Chart Modal (`WorldMapModal`): Landmarks, harbors, plots, active fishing schools, waypoints, regional market demand heatmap.
  - Expedition Board Modal (`ExpeditionBoard`): Maritime voyage planner with sea routes, danger ratings, requirements, rewards.
- **R8: System Overlays, Title Screen & Dev Tooling**:
  - Pause & System Menu (`EscapeMenuModal`): Quick-save, autosave health, emergency safety actions (reset shore, recall boat), audio calibration sliders (Master, Music, Ambience, Weather, Fishing, UI), graphics quality presets (Low, Medium, High, Ultra in `InterfaceSettings.tsx`).
  - Title Screen & Save Recovery (`StartScreen`, `SaveRecoverySheet`): Continue, New Game, Save Overview, fail-safe recovery for corrupted/read-only saves.
  - Activity Feed & Chronicle (bottom-left): Collapsible Coastal Chronicle with tabs ([All], [Trade], [Farming/Fishing], [Story]).
  - Mobile Touch Controls & Orientation Gate (`MobileControls`, `MobileOrientationGate`): Virtual joystick, sprint, jump, tool action, fishing controls (>= 48px touch targets), forced landscape prompt.
  - Dev Diagnostics & Layout HUD (`DebugOverlay`, `PlacementEditorHud`): Telemetry metrics, time/weather triggers, F2 layout editor HUD.
- **Verification Infrastructure**:
  - Existing test harness in `tests/unit/`
  - Blueprint for dedicated test suite `tests/unit/mmo_complete_ui.test.ts`
  - Viewport budget audit methodology (<25% of 1080p and 720p)
  - 100% Simulation ownership / DTO purity checks
  - Modal priority and input exclusivity architecture.

## 3. Authoritative Reference Documents (Read to the end)
- /Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md (under section "## 2026-09-03T11:32:03Z")
- /Users/anilkaraca/Desktop/Neva/AGENTS.md
- /Users/anilkaraca/Desktop/Neva/LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md
- /Users/anilkaraca/Desktop/Neva/LLM/02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md
- /Users/anilkaraca/Desktop/Neva/LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md

## 4. Codebase Exploration Targets
Investigate:
- Existing modals (`src/ui/modals/`, `InventoryModal`, `MarketModal`, `WorldMapModal`, `JournalModal`, etc.)
- Docking window layout and multi-window positioning
- Mobile controls and responsive layout in `src/ui/`
- Test setup (`vitest.config.ts`, `tests/unit/`, mock simulation state)
- Simulation contracts for economy/market, inventory, cargo packs, save management, and settings.

## 5. Required Output
Write your comprehensive findings to `/Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_3/analysis.md` and a summarized `/Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_3/handoff.md`:
1. Current State: What exists vs what is missing or needs overhaul.
2. Architecture & File Inventory: Exact files to create, modify, or refactor.
3. Simulation DTO Dependencies: Which simulation interfaces supply the required data.
4. Test Architecture Plan: Structure for `tests/unit/mmo_complete_ui.test.ts` and viewport auditing.
5. Concrete Implementation Recommendations.

## 2026-09-03T11:34:25Z
You are explorer_survey_m0_3. Your working directory is /Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_3/.
Read your dispatch instructions in /Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_3/DISPATCH.md and the authoritative user request in /Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md (specifically section "## 2026-09-03T11:32:03Z").
Also read /Users/anilkaraca/Desktop/Neva/AGENTS.md.
Investigate R6 (Side-by-Side Dockable MMO Windows & Inventories), R7 (Folio, Almanac & Expedition Planners), R8 (System Overlays, Title Screen & Dev Tooling), and Verification Infrastructure (tests/unit/mmo_complete_ui.test.ts, viewport budget audit, simulation DTO purity).
Survey all existing files under src/ui/modals/, tests/, etc.
Write your detailed report to /Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_3/analysis.md and your summary to /Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_3/handoff.md.
When finished, send a message to orchestrator_2 (parent) notifying completion.

