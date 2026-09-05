# Project: Neva Cozy MMO Interface System Overhaul

## Architecture
- **Purity Principle**: 100% Simulation Ownership. Presentation layers (React components, HUD, modals, overlays) consume read-only DTOs. Zero gameplay logic or state mutation is performed in presentation code.
- **Visual Budget**: Persistent HUD elements occupy <20–25% of viewport area (verified on 1080p and 720p).
- **Layout Anchors**:
  - Top-Left: Player Unit Frame (crest, labor with recharge feedback, sprint with exhaustion, status chips).
  - Top-Right: Nautical Compass & Almanac (celestial dial, rotating compass radar, wind vector, POI blips) + Collapsible Quest & Contract Tracker.
  - Bottom-Center: Smart Contextual Stance Toolbar (Agronomy, Angling, Maritime, Explorer) + Action Channeling Cast Bar + Planting Seed Belt.
  - Bottom-Right: Micro-Menu (6 panels) & Purse Bar (gold counter, capacity badges).
  - Bottom-Left: Collapsible Coastal Chronicle activity feed.
  - Center/Modal Space: Dockable side-by-side MMO windows (Satchel + Market, Satchel + Ledger) on viewports >= 1024px.
  - In-World 3D Layer: Screen-projected Crop Inspection card, Farm GIS soil tile tinting, Catch inspection cards, and smart labor action prompts.

## Feature Inventory
| # | Feature | Description | Milestone | Status |
|---|---------|-------------|-----------|--------|
| 1 | F1.1 Player Unit Frame | Crest, Labor bar with recharge pulse, Sprint bar with exhaustion warning, status chips | M1 | DONE |
| 2 | F1.2 Nautical Compass & Celestial Almanac | Celestial Time Dial + Circular Nautical Compass Radar with cardinal bearings, wind arrow, POIs | M1 | DONE |
| 3 | F1.3 Collapsible Quest & Contract Tracker | Pinned under compass, tracking story quest steps and market delivery contracts with checkmarks | M1 | DONE |
| 4 | F1.4 Bottom-Right Micro-Menu & Purse Bar | 6-button icon rack, Gold counter, Bag/Cargo capacity badges | M1 | DONE |
| 5 | F2.1 Smart Contextual Stance Toolbar | Dynamic hotbar shifting between Agronomy, Angling, Maritime, and Explorer stances | M1 | DONE |
| 6 | F2.2 Action Channeling Cast Bar | High-polish MMO progress bar for farming, boarding, docking, harvesting | M1 | DONE |
| 7 | F2.3 Smart Labor Action Prompts | Contextual prompt display with embossed keycap [E], verb, target entity, Labor cost badge | M1 | DONE |
| 8 | F2.4 Planting Seed Belt Selector | Docked horizontal tray showing owned seeds with quantity badges, seasonal compatibility | M1 | DONE |
| 9 | F3.1 In-World Crop Inspection Card | In-world projected crop sheet: icon, name, stage chip, countdown label, moisture band, next action, Work cost | M2 | IN_PROGRESS |
| 10 | F3.2 Farm GIS Legend & Soil Overlay | [Alt] hold tile tinting via instanced soil mesh color modulation (moistureBatch) with HUD moisture/fertility legend | M2 | IN_PROGRESS |
| 11 | F3.3 Trophy Catch Inspection & Toast | Celebratory popover modal when landing sport fish (species, weight, length, star quality, freshness, value, PB badge) | M2 | IN_PROGRESS |
| 12 | F3.4 Contextual Hint Cards | Non-intrusive coastal discovery tips for boating, sport fishing, soil care with keyboard shortcuts | M2 | IN_PROGRESS |
| 13 | F3.5 Notice Stack & Weather Hazards | Floating notifications for items/labor and top-right warning banners for maritime hazards (fog, squall, storm waves) | M2 | IN_PROGRESS |
| 14 | F5.1 Maritime Vessel Console | Contextual helm dashboard: vessel name, insignia, docking chip, knots, heading bearing (deg/cardinal), sea-state, hull integrity, fuel gauge | M2 | IN_PROGRESS |
| 15 | F5.2 Physical Cargo Hold Bay Grid | Individual hold slots showing loaded fish cargo / trade packs, species sprites, quality medallions, real-time freshness decay bars | M2 | IN_PROGRESS |
| 16 | F4.1 Basic Fishing Minigame Widget | Cast charge meter with sweet spot, bobber alert with ripple feedback, bite-reaction hook prompt, tension mini-bar, victory/escape | M3 | PLANNED |
| 17 | F4.2 Sport Fishing Telemetry HUD | 3D circular line-tension gauge, fish stamina gauge, run distance to boat, water depth, rod deflection angle, [A]/[D] guidance, [W]/[S] tactile controls | M3 | PLANNED |
| 18 | F6.1 Satchel Inventory | Grid slots with category filter tabs ([All], [Field], [Fishing], [Supplies]), auto-sort button, item search bar, capacity indicator | M4 | PLANNED |
| 19 | F6.2 Companion Docking (Trade & Storage) | Side-by-side Market Stalls with Satchel (dynamic price quotes, trend graph, bulk sell, seed/rod shops); Boat Hold & Warehouse storage with 1-click transfer | M4 | PLANNED |
| 20 | F6.3 ArcheAge Physical Cargo Representation | Distinct visual treatment for stackable satchel goods vs heavy trade packs / trophy fish carried on back with movement speed penalty cues | M4 | PLANNED |
| 21 | F6.4 Rich MMO Item Inspect Cards | Floating cursor cards with rarity frames, freshness decay timelines, soil/season requirements, base trade value, and lore text | M4 | PLANNED |
| 22 | F7.1 Field Journal Folio | Story Spine, Contracts Board, Coastal Almanac (15 fish + 10 crops), Proficiencies/Skills progression, How-to-Play Guide | M5 | PLANNED |
| 23 | F7.2 Nautical Chart Modal | Navigational chart with landmarks, harbors, farm plots, active fishing schools, waypoints, regional market demand heatmap | M5 | PLANNED |
| 24 | F7.3 Expedition Board Modal | Maritime voyage planner with sea route maps, danger ratings, crew/cargo requirements, voyage rewards | M5 | PLANNED |
| 25 | F8.1 Pause & System Menu | Quick-save, autosave health, emergency safety actions (reset shore, recall boat), 6 audio calibration sliders, graphics quality presets | M5 | PLANNED |
| 26 | F8.2 Title Screen & Save Recovery | Title splash with Continue, New Game, Save Overview, and fail-safe recovery sheet for corrupted/read-only saves | M5 | PLANNED |
| 27 | F8.3 Activity Feed & Chronicle | Collapsible bottom-left Coastal Chronicle with filter tabs ([All], [Trade], [Farming/Fishing], [Story]) and auto-collapse | M5 | PLANNED |
| 28 | F8.4 Mobile Controls & Orientation Gate | Virtual joystick, sprint, jump, tool action, fishing controls (>=48px touch targets), forced landscape prompt | M5 | PLANNED |
| 29 | F8.5 Dev Diagnostics & Layout Editor HUD | Real-time performance metrics (FPS, frame time, draw calls, triangles, coordinates, telemetry) and F2 layout editor HUD | M5 | PLANNED |
| 30 | F9.1 Master MMO UI Verification Suite | Automated Vitest suite verifying R1–R8 rendering, Stance transitions, companion docking, fishing exclusivity, viewport budget audit (<25%), DTO purity | M6 | PLANNED |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Persistent HUD & Contextual Controls | F1.1–F1.4, F2.1–F2.4 | None | PASSED (Reviewers APPROVE, 93/93 tests PASS, Auditor CLEAN) |
| M2 | In-World Inspectors, Overlays & Maritime Console | F3.1–F3.5, F5.1–F5.2 | M1 | PASSED (typecheck + build exit 0, 158/158, chrome alignment defects fixed) |
| M3 | Dual Fishing Minigames & Cockpits | F4.1–F4.2 | M1 | PASSED (219/219 across 13 HUD suites; telemetry wired to encounter physics) |
| M4 | Dockable MMO Windows & Inventories | F6.1–F6.4 | M1 | PASSED (F6.1–F6.4 complete; 301/301 across 20 suites incl. physics) |
| M5 | Folio Almanac, System Menus & Mobile | F7.1–F7.3, F8.1–F8.5 | M1, M4 | IN_PROGRESS (F7.1 Almanac, F7.2 schools, F8.1 tow, F8.3 Chronicle DONE; F8.2/F8.4/F8.5 covered; F7.2 waypoints deferred on schema, F7.3 remains) |
| M6 | Final Verification & E2E Validation | F9.1 (`tests/unit/mmo_complete_ui.test.ts`, viewport budget audit <25%, full typecheck, build, test suite) | M1–M5 | PLANNED |
