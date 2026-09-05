# Plan: Neva Cozy MMO Interface System Overhaul

## Overview
Comprehensive overhaul of every user-facing UI, HUD, modal, inspector, minigame, and screen across Neva into an ArcheAge / Palia-inspired cozy MMO interface system adhering to non-combat game logic, <25% viewport budget, and 100% simulation ownership.

## Milestones & Execution Plan

### M1: Persistent Gameplay HUD & Nautical Navigation (R1 & R2)
- Scope: F1.1–F1.4, F2.1–F2.4
  - F1.1 Player Unit Frame: Crest, Labor bar with recharge pulse, Sprint bar with exhaustion warning, status chips (Cargo, Rested, Soaked, Night chill)
  - F1.2 Nautical Compass & Celestial Almanac: Celestial dial, rotating nautical compass radar, wind vector, sub-region title, nearby POIs
  - F1.3 Collapsible Quest & Contract Tracker: Pinned under compass, tracking story quest steps and market delivery contracts
  - F1.4 Bottom-Right Micro-Menu & Purse Bar: 6-button icon rack (Satchel [I], Journal [J], Chart [M], Stores [L], Expeditions [P], Menu [Esc]), Gold counter, Bag/Cargo capacity badges
  - F2.1 Smart Contextual Stance Toolbar: Dynamic hotbar shifting between Agronomy, Angling, Maritime, and Explorer stances
  - F2.2 Action Channeling Cast Bar: High-polish MMO progress bar for farming, boarding, docking, harvesting
  - F2.3 Smart Labor Action Prompts: Contextual prompt with embossed keycap [E], verb, target name, Labor cost badge
  - F2.4 Planting Seed Belt Selector: Docked horizontal tray showing owned seeds with quantity badges, seasonal compatibility icons
- Iteration Cycle:
  - Step 1: Dispatch 3 Explorers (explore existing UI in `src/ui/`, contracts, styles, DTOs, and recommend implementation strategy for M1).
  - Step 2: Dispatch 1 Worker (implement M1 components, styling, integration, unit tests).
  - Step 3: Dispatch 2 Reviewers (verify correctness, DTO purity, design conformance, typecheck & tests).
  - Step 4: Dispatch 2 Challengers (adversarial testing of M1 HUD edge cases, stance switching, responsive rendering).
  - Step 5: Dispatch 1 Forensic Auditor (integrity verification, binary veto check).
  - Step 6: Evaluate Gate -> Pass M1 -> Proceed to M2.

### M2: In-World Inspectors, GIS Overlays & Maritime Console (R3 & R5)
- Scope: F3.1–F3.5, F5.1–F5.2
  - F3.1 In-World Crop Inspection Card (`CropInspection`)
  - F3.2 Farm GIS Legend & Soil Overlay (`FarmGISLegend`)
  - F3.3 Trophy Catch Inspection & Toast (`CatchInspectionModal` & `CatchSummaryToast`)
  - F3.4 Contextual Hint Cards (`ContextualHintCard`)
  - F3.5 Notice Stack & Weather Hazards (`NoticeStack`, weather warnings)
  - F5.1 Maritime Vessel Console (`MaritimeVesselConsole`)
  - F5.2 Physical Cargo Hold Bay Grid
- Iteration Cycle: Explorers -> Worker -> Reviewers -> Challengers -> Auditor -> Gate.

### M3: Dual Fishing Minigames & Cockpits (R4)
- Scope: F4.1–F4.2
  - F4.1 Basic Fishing Minigame Widget (`BasicFishingMinigameWidget`)
  - F4.2 Sport Fishing Telemetry HUD (`CircularTensionGauge`, rod deflection, depth telemetry)
- Iteration Cycle: Explorers -> Worker -> Reviewers -> Challengers -> Auditor -> Gate.

### M4: Side-by-Side Dockable MMO Windows & Inventories (R6)
- Scope: F6.1–F6.4
  - F6.1 Satchel Inventory (`InventoryModal`) with search, filter tabs, auto-sort
  - F6.2 Companion Docking (Market stalls side-by-side with Satchel, Boat Hold & Warehouse logistics ledger)
  - F6.3 ArcheAge Physical Cargo Representation (back trade pack cues, speed penalty indicators)
  - F6.4 Rich MMO Item Inspect Cards
- Iteration Cycle: Explorers -> Worker -> Reviewers -> Challengers -> Auditor -> Gate.

### M5: Folio, Almanac, System Overlays & Mobile Controls (R7 & R8)
- Scope: F7.1–F7.3, F8.1–F8.5
  - F7.1 Field Journal Folio (`JournalModal`, story spine, contracts, almanac, skills, guide)
  - F7.2 Nautical Chart Modal (`WorldMapModal`)
  - F7.3 Expedition Board Modal (`ExpeditionBoard`)
  - F8.1 Pause & System Menu (`EscapeMenuModal` with 6 audio sliders, graphics presets)
  - F8.2 Title Screen & Save Recovery (`StartScreen`, `SaveRecoverySheet`)
  - F8.3 Activity Feed & Chronicle (`CoastalChronicle`)
  - F8.4 Mobile Controls & Orientation Gate (`MobileControls`, `MobileOrientationGate` >=48px targets)
  - F8.5 Dev Diagnostics & Layout Editor HUD (`DebugOverlay`, `PlacementEditorHud`)
- Iteration Cycle: Explorers -> Worker -> Reviewers -> Challengers -> Auditor -> Gate.

### M6: Master Verification Suite & E2E Validation (R1–R8 complete)
- Scope: F9.1 (`tests/unit/mmo_complete_ui.test.ts`, viewport budget audit <25%, full typecheck, build, test suite)
- Verification & Final Human Report to `sentinel_1`.
