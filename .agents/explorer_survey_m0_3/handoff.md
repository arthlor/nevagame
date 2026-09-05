# Handoff Report — Explorer Survey M0-3 (R6, R7, R8 & Verification)

**Agent:** explorer_survey_m0_3  
**Working Directory:** `/Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_3/`  
**Parent:** orchestrator_2 (`a66ec739-374f-4ce2-8658-fb981bd1acb8`)  
**Type:** Hard Handoff (Investigation Complete)

---

## 1. Observation

1. **Companion Docking & Multi-Window Architecture (`src/ui/GameUI.tsx:434-474`)**:
   - `GameUI.tsx` renders modals mutually exclusively based on `activeModal`:
     ```tsx
     {activeModal === "inventory" && <InventoryModal ... />}
     {activeModal === "market" && <MarketModal ... />}
     {activeModal === "ledger" && <LogisticsLedgerModal ... />}
     ```
   - When `activeModal === "market"`, `MarketModal` is rendered alone in the center of the screen. The player satchel is not docked side-by-side. Instead, `MarketModal` renders its own internal list of sellable commodities (`board.sellRows`), duplicating satchel contents.
2. **Satchel Features & Inspect Cards (`src/ui/InventoryModal.tsx:40-105`)**:
   - `InventoryModal` has 4 category tabs (`All`, `Field`, `Fishing`, `Supplies`) and a capacity indicator (`inventory-capacity-pill`), but lacks an item search input and an auto-sort button.
   - Item details are rendered in a fixed inline right sidebar (`.inventory-details-card`), lacking rich floating cursor cards with rarity frames, freshness decay timelines, soil/season requirements, and lore text.
   - Physical cargo representation (heavy trade packs / large trophy fish carried on back with movement speed penalties) is not visually differentiated from stackable goods.
3. **Field Journal & Folios (`src/ui/JournalModal.tsx:28-33`)**:
   - Folios defined:
     ```tsx
     const FOLIOS: Array<{ id: JournalFolio; label: string; icon: React.ReactNode }> = [
       { id: "story", label: "Story", ... },
       { id: "records", label: "Records", ... },
       { id: "skills", label: "Skills", ... },
       { id: "guide", label: "Guide", ... }
     ];
     ```
   - Lacks a dedicated `contracts` tab (contracts currently only live inside `MarketModal` footer) and lacks a complete `almanac` encyclopedia covering all 15 fish species and 10 crops.
4. **Audio Calibration Buses (`src/audio/AudioManager.ts:15, 100-107, 322-329` vs `src/audio/AudioSettings.ts:1-10`)**:
   - `AudioManager.ts` already implements independent internal gain nodes:
     ```ts
     this.uiGain = this.context.createGain();
     this.fishingGain = this.context.createGain();
     this.boatGain = this.context.createGain();
     this.weatherGain = this.context.createGain();
     this.ambienceGain = this.context.createGain();
     this.musicGain = this.context.createGain();
     this.masterGain = this.context.createGain();
     ```
   - However, `AudioSettings.ts` and `AudioControls` in `EscapeMenuModal.tsx:364-373` only expose:
     ```ts
     export interface AudioSettings {
       master: number; music: number; sfx: number; ambience: number;
       masterMuted: boolean; musicMuted: boolean; sfxMuted: boolean; ambienceMuted: boolean;
     }
     ```
     leaving Weather, Fishing, and UI without configuration sliders.
5. **Activity Feed / Coastal Chronicle**:
   - Grep search for `chronicle` in `src/ui/` returns only modal class names (`journal-chronicle-modal`). No bottom-left activity feed component exists in the codebase.
6. **Mobile Touch Targets (`src/ui/mobile.css:597-598, 731`)**:
   - Line 597-598: `.modal-content button, ... min-height: 44px;`
   - Line 731: `@media (max-height: 430px) { :root { --mobile-control-size: 44px; } }`
   - These rules violate the `>= 48px` minimum touch target requirement.
7. **Testing Infrastructure (`vitest.config.ts`, `tests/unit/uiModals.test.ts`)**:
   - Vitest runs in `node` environment (`environment: "node"`). UI components are tested via `renderToString(React.createElement(...))` from `react-dom/server` with DOM/string assertions.
   - Dedicated master test `tests/unit/mmo_complete_ui.test.ts` does not yet exist.

---

## 2. Logic Chain

1. **R6 Companion Docking**:
   - *Premise (Obs 1):* `GameUI.tsx` renders modals as isolated full-screen overlays (`activeModal`).
   - *Inference:* Supporting companion docking requires a flexible container in `GameUI.tsx` that, when `activeModal === "market"` or `activeModal === "ledger"`, displays the vendor/ledger window on the left and the satchel on the right on viewports `>= 1024px`, while collapsing to tabs or single column on mobile.
2. **R6 Rich Item Inspect Cards & Physical Cargo**:
   - *Premise (Obs 2):* `InventoryModal` has static sidebar details and treats all items alike.
   - *Inference:* Creating a reusable `ItemInspectCard.tsx` consuming enriched slot DTOs (rarity, freshness, soil/season requirements, lore, physical cargo status) allows both `InventoryModal` and `MarketModal` to display rich MMO-grade tooltips.
3. **R7 Folio & Coastal Almanac**:
   - *Premise (Obs 3):* `JournalModal` only has 4 folios; contracts and full encyclopedia data are absent.
   - *Inference:* Adding `contracts` and `almanac` folio tabs, backed by `ContractsBoardModal.tsx` and `CoastalAlmanac.tsx` (sourcing static definitions from `ContentRegistry.crops` and `ContentRegistry.fishSpecies`), completes the Folio requirements without mutating simulation state.
4. **R8 6-Bus Audio Calibration**:
   - *Premise (Obs 4):* The underlying `AudioManager` already routes audio through `weatherGain`, `fishingGain`, and `uiGain`, but `AudioSettings` omits them.
   - *Inference:* Adding `weather`, `fishing`, and `ui` fields to `AudioSettings.ts` and rendering their sliders in `EscapeMenuModal.tsx` directly achieves full 6-bus audio calibration with zero architectural rewrites.
5. **R8 Activity Feed & Chronicle**:
   - *Premise (Obs 5):* Bottom-left chronicle is missing entirely.
   - *Inference:* A dedicated `CoastalChronicle.tsx` component with tabs `[All]`, `[Trade]`, `[Farming/Fishing]`, `[Story]` and auto-collapse after idle will satisfy R8 while maintaining `<20-25%` persistent screen coverage.
6. **Mobile Touch Standard**:
   - *Premise (Obs 6):* Modal buttons and compact viewports use 44px heights in `mobile.css`.
   - *Inference:* Updating these styles to `min-height: 48px;` and `--mobile-control-size: 48px;` guarantees 100% compliance with mobile accessibility standards.
7. **Verification Architecture**:
   - *Premise (Obs 7):* Vitest runs headless in node with `renderToString`.
   - *Inference:* `tests/unit/mmo_complete_ui.test.ts` can render every component from R1 through R8, verify DTO binding, assert input exclusivity, and compute persistent HUD bounding area budgets (<25% of 1080p and 720p) reliably and quickly.

---

## 3. Caveats

1. **Ultra Graphics Tier Implementation**: `VisualRenderConfig.ts` defines `QualityTier = "low" | "medium" | "high"`. If an "Ultra" tier is exposed in UI, it should either configure enhanced parameters on the "high" baseline (e.g., 2048 shadow map, max draw distance, 1.75 DPR cap) or require updating `VisualRenderConfig.ts` in strict compliance with project update rules.
2. **1-Click Cargo Transfer Simulation API**: Moving fish cargo between player carried slot and vessel hold slots currently relies on `CargoDomain.ts` methods (`landCaughtFish`, `discard`, `release`). A dedicated simulation command or presentation helper for direct slot-to-slot transfer should be formalized in `CargoDomain` / `contracts.ts`.
3. **No Caveats Beyond Above**: All existing UI components, simulation DTOs, audio buses, and CSS rules have been inspected in detail.

---

## 4. Conclusion

The path to delivering R6, R7, R8, and the Verification Suite is clear, fully mapped, and architecturally aligned with Neva's core principles:
- **R6 (Windows & Inventories)**: Introduce side-by-side companion docking in `GameUI.tsx`, add search and auto-sort to `InventoryModal.tsx`, build `ItemInspectCard.tsx`, and represent ArcheAge physical cargo with distinct visual frames and speed penalty cues.
- **R7 (Folio & Almanac)**: Add `contracts` and `almanac` tabs to `JournalModal.tsx`, create `CoastalAlmanac.tsx` (15 fish + 10 crops), and enhance `WorldMapModal.tsx` with active fishing schools and regional demand heatmaps.
- **R8 (System Menus & Overlays)**: Wire all 6 audio buses in `EscapeMenuModal.tsx`, add emergency boat recall and autosave health indicators, implement bottom-left `CoastalChronicle.tsx`, and enforce `>= 48px` touch targets across `mobile.css`.
- **Verification**: Implement `tests/unit/mmo_complete_ui.test.ts` to validate R1–R8 rendering, Stance transitions, companion docking, fishing exclusivity, viewport budget audit (<25% at 1080p and 720p), and 100% simulation DTO purity.

---

## 5. Verification Method

To independently verify the survey findings and ensure the codebase is primed for implementation:

1. **Typecheck Inspection**:
   ```bash
   npm run typecheck
   ```
   *Expected Result:* Zero TypeScript errors.
2. **Current Unit Test Suite**:
   ```bash
   npm run test
   ```
   *Expected Result:* All existing unit, simulation, and UI tests pass.
3. **Key File Inspections**:
   - View `src/ui/GameUI.tsx` lines 434–474 to confirm modal mutually exclusive rendering.
   - View `src/ui/InventoryModal.tsx` lines 40–105 to confirm missing search and sort.
   - View `src/audio/AudioManager.ts` lines 100–107 and `src/audio/AudioSettings.ts` lines 1–10 to confirm audio bus disparity.
   - View `src/ui/mobile.css` lines 597–598 and 731 to confirm 44px touch targets.
   - Review comprehensive architectural survey in `.agents/explorer_survey_m0_3/analysis.md`.
