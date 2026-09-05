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
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | F1.1 Player Unit Frame | Crest, Labor bar with recharge pulse, Sprint bar with exhaustion warning, status chips (Cargo, Rested, Soaked, Night chill) | M1 | Survey M0-1 |
| 2 | F1.2 Nautical Compass & Celestial Almanac | Celestial Time Dial + Circular Nautical Compass Radar with cardinal bearings, wind arrow, sub-region title, nearby POIs | M1 | Survey M0-1 |
| 3 | F1.3 Collapsible Quest & Contract Tracker | Pinned under compass, tracking story quest steps and market delivery contracts with checkmarks and fold toggle | M1 | Survey M0-1 |
| 4 | F1.4 Bottom-Right Micro-Menu & Purse Bar | 6-button icon rack (Satchel [I], Journal [J], Chart [M], Stores [L], Expeditions [P], Menu [Esc]), Gold counter, Bag/Cargo capacity badges | M1 | Survey M0-1 |
| 5 | F2.1 Smart Contextual Stance Toolbar | Dynamic hotbar shifting between Agronomy, Angling, Maritime, and Explorer stances based on pure queries | M1 | Survey M0-1 |
| 6 | F2.2 Action Channeling Cast Bar | High-polish MMO progress bar for farming, boarding, docking, harvesting with progress spark and cancel cues | M1 | Survey M0-1 |
| 7 | F2.3 Smart Labor Action Prompts | Contextual prompt display with embossed keycap [E], interaction verb, target entity name, and Labor cost badge (-5 Work) | M1 | Survey M0-1 |
| 8 | F2.4 Planting Seed Belt Selector | Docked horizontal tray showing owned seeds with quantity badges, seasonal compatibility icons, and soil suitability hints | M1 | Survey M0-1 |
| 9 | F3.1 In-World Crop Inspection Card | In-world projected crop sheet: icon, name, stage chip, countdown label, moisture band, next action, Work cost | M2 | Survey M0-2 |
| 10 | F3.2 Farm GIS Legend & Soil Overlay | [Alt] hold tile tinting via instanced soil mesh color modulation (moistureBatch) with HUD moisture/fertility legend | M2 | Survey M0-2 |
| 11 | F3.3 Trophy Catch Inspection & Toast | Celebratory popover modal when landing sport fish (species, weight, length, star quality, freshness, value, PB badge) | M2 | Survey M0-2 |
| 12 | F3.4 Contextual Hint Cards | Non-intrusive coastal discovery tips for boating, sport fishing, soil care with keyboard shortcuts | M2 | Survey M0-2 |
| 13 | F3.5 Notice Stack & Weather Hazards | Floating notifications for items/labor and top-right warning banners for maritime hazards (fog, squall, storm waves) | M2 | Survey M0-2 |
| 14 | F5.1 Maritime Vessel Console | Contextual helm dashboard: vessel name, insignia, docking chip, knots, heading bearing (deg/cardinal), sea-state, hull integrity, fuel gauge | M2 | Survey M0-2 |
| 15 | F5.2 Physical Cargo Hold Bay Grid | Individual hold slots showing loaded fish cargo / trade packs, species sprites, quality medallions, real-time freshness decay bars | M2 | Survey M0-2 |
| 16 | F4.1 Basic Fishing Minigame Widget | Cast charge meter with sweet spot, bobber alert with ripple feedback, bite-reaction hook prompt, tension mini-bar, victory/escape | M3 | Survey M0-2 |
| 17 | F4.2 Sport Fishing Telemetry HUD | 3D circular line-tension gauge, fish stamina gauge, run distance to boat, water depth, rod deflection angle, [A]/[D] guidance, [W]/[S] tactile controls | M3 | Survey M0-2 |
| 18 | F6.1 Satchel Inventory | Grid slots with category filter tabs ([All], [Field], [Fishing], [Supplies]), auto-sort button, item search bar, capacity indicator | M4 | Survey M0-3 |
| 19 | F6.2 Companion Docking (Trade & Storage) | Side-by-side Market Stalls with Satchel (dynamic price quotes, trend graph, bulk sell, seed/rod shops); Boat Hold & Warehouse storage with 1-click transfer | M4 | Survey M0-3 |
| 20 | F6.3 ArcheAge Physical Cargo Representation | Distinct visual treatment for stackable satchel goods vs heavy trade packs / trophy fish carried on back with movement speed penalty cues | M4 | Survey M0-3 |
| 21 | F6.4 Rich MMO Item Inspect Cards | Floating cursor cards with rarity frames, freshness decay timelines, soil/season requirements, base trade value, and lore text | M4 | Survey M0-3 |
| 22 | F7.1 Field Journal Folio | Story Spine, Contracts Board, Coastal Almanac (15 fish + 10 crops), Proficiencies/Skills progression, How-to-Play Guide | M5 | Survey M0-3 |
| 23 | F7.2 Nautical Chart Modal | Navigational chart with landmarks, harbors, farm plots, active fishing schools, waypoints, regional market demand heatmap | M5 | Survey M0-3 |
| 24 | F7.3 Expedition Board Modal | Maritime voyage planner with sea route maps, danger ratings, crew/cargo requirements, voyage rewards | M5 | Survey M0-3 |
| 25 | F8.1 Pause & System Menu | Quick-save, autosave health, emergency safety actions (reset shore, recall boat), 6 audio calibration sliders, graphics quality presets | M5 | Survey M0-3 |
| 26 | F8.2 Title Screen & Save Recovery | Title splash with Continue, New Game, Save Overview, and fail-safe recovery sheet for corrupted/read-only saves | M5 | Survey M0-3 |
| 27 | F8.3 Activity Feed & Chronicle | Collapsible bottom-left Coastal Chronicle with filter tabs ([All], [Trade], [Farming/Fishing], [Story]) and auto-collapse | M5 | Survey M0-3 |
| 28 | F8.4 Mobile Controls & Orientation Gate | Virtual joystick, sprint, jump, tool action, fishing controls (>=48px touch targets), forced landscape prompt | M5 | Survey M0-3 |
| 29 | F8.5 Dev Diagnostics & Layout Editor HUD | Real-time performance metrics (FPS, frame time, draw calls, triangles, coordinates, telemetry) and F2 layout editor HUD | M5 | Survey M0-3 |
| 30 | F9.1 Master MMO UI Verification Suite | Automated Vitest suite verifying R1–R8 rendering, Stance transitions, companion docking, fishing exclusivity, viewport budget audit (<25%), DTO purity | M6 | Survey M0-3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Persistent HUD & Contextual Controls | F1.1–F1.4, F2.1–F2.4 (Player Unit Frame, Compass/Almanac, Tracker, Micro-menu, Stances, Cast Bar, Prompts, Seed Belt) | Survey M0 | DONE |
| M2 | In-World Inspectors, Overlays & Maritime Console | F3.1–F3.5, F5.1–F5.2 (CropInspection, FarmGISLegend, CatchInspection, ContextualHints, NoticeStack, MaritimeVesselConsole) | M1 | IN_PROGRESS |
| M3 | Dual Fishing Minigames & Cockpits | F4.1–F4.2 (BasicFishingMinigameWidget sweet spot/ripple, Sport Fishing Telemetry HUD with CircularTensionGauge) | M1 | PLANNED |
| M4 | Dockable MMO Windows & Inventories | F6.1–F6.4 (Satchel search/sort, Companion Docking Market & LogisticsLedger, Physical Cargo, Rich Item Inspect Cards) | M1 | PLANNED |
| M5 | Folio Almanac, System Menus & Mobile | F7.1–F7.3, F8.1–F8.5 (Field Journal Folio, Almanac, Chart, Expedition, System Menu 6-bus, Title Screen, Chronicle, Mobile >=48px) | M1, M4 | PLANNED |
| M6 | Final Verification & E2E Validation | F9.1 (`tests/unit/mmo_complete_ui.test.ts`, viewport budget audit <25%, full typecheck, build, test suite) | M1–M5 | PLANNED |

## Interface Contracts
### WorldHudDto Expansion (`src/simulation/core/contracts.ts` & `WorldHudPresentation.ts`)
- `stance: "agronomy" | "angling" | "maritime" | "explorer"`
- `compass: { headingDegrees: number; headingCardinal: string; windDegrees: number; subRegionTitle: string; nearbyMarkers: Array<{ id: string; type: string; x: number; z: number; label: string; icon: string }> }`
- `statusEffects: Array<{ id: string; label: string; type: "buff" | "debuff" | "warning"; description: string }>`
- `capacity: { satchelUsed: number; satchelMax: number; cargoUsed: number; cargoMax: number }`
- `activeContracts: Array<{ id: string; title: string; current: number; target: number; unit: string; completed: boolean }>`

### Companion Docking Layout (`src/ui/GameUI.tsx`)
- Container layout `.companion-dock-container` displaying vendor/ledger modal on left and `InventoryModal` on right for viewport width >= 1024px.
- Single modal priority for viewport width < 1024px (collapses to single active window).

### In-World Projection Protocol (`src/ui/components/CropInspection.tsx` & `GameApp.ts`)
- Screen position derived via `camera.project(worldPosition)`. Clamped within viewport safe margins (`16px <= x <= window.innerWidth - width - 16px`).

## Code Layout
- `src/ui/hud/`: `PlayerUnitFrame.tsx`, `NauticalCompassAlmanac.tsx`, `MicroMenuPurseBar.tsx`, `SmartContextualToolbar.tsx`, `SmartActionPrompt.tsx`
- `src/ui/components/`: `FarmingActionStatus.tsx`, `PlantingSeedBar.tsx`, `CropInspection.tsx`, `FarmGISLegend.tsx`, `CatchInspectionModal.tsx`, `CatchSummaryToast.tsx`, `ContextualHintCard.tsx`, `NoticeStack.tsx`, `MaritimeVesselConsole.tsx`, `ItemInspectCard.tsx`, `CoastalChronicle.tsx`
- `src/ui/fishing/`: `BasicFishingMinigameWidget.tsx`, `CircularTensionGauge.tsx`
- `src/ui/modals/`: `InventoryModal.tsx`, `MarketModal.tsx`, `LogisticsLedgerModal.tsx`, `JournalModal.tsx`, `WorldMapModal.tsx`, `ExpeditionBoard.tsx`, `EscapeMenuModal.tsx`, `ContractsBoardModal.tsx`, `CoastalAlmanac.tsx`
- `src/ui/styles/`: `hud.css`, `modals.css`, `overlays.css`, `mobile.css`
- `tests/unit/`: `mmo_complete_ui.test.ts`
