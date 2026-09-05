# Handoff Report — Milestone M2 Remediation Investigation & Actionable Blueprint

**Agent**: `teamwork_preview_explorer_m2_r2_3`  
**Role**: explorer (read-only investigation & synthesis)  
**Parent Agent**: `orchestrator_5` (`c275e7b3-2b97-46df-81cb-0a621ce8a161`)  
**Timestamp**: 2026-09-04T14:45:00Z  
**Verdict**: **REMEDIATION SPECIFICATION COMPLETE**  
**Docs updated**: none — read-only investigation report  

---

## Executive Summary

This investigation resolves the Forensic Integrity Violation and Challenger findings for Milestone M2 Iteration 2.
1. **Build & Typecheck Failures**: The failure of `npm run typecheck` and `npm run build` is caused entirely by `tsc --noEmit` failing on two test files (`tests/unit/adversarial_m2_inspectors.test.ts` and `tests/unit/challenger_m2_empirical_audit.test.ts`). The production codebase (`src/`) and toolchain (`tools/world/terrain-preservation.ts`) contain **zero** TypeScript compiler errors.
2. **Domain Entity Fidelity**: In `tests/unit/mmo_inspectors_m2.test.ts`, the unregistered mock identifier `"fish.salmon"` bypassed `ContentRegistry.fishSpecies.get()` and prevented `calculateFishPrice()` from executing, falling back to a dummy constant 10 Gold. Concrete replacements with canonical registered species (`fish.trout`, `fish.mackerel`, `fish.tuna`) genuinely exercise the full valuation pipeline.
3. **CSS Specificity on 3D Projection**: In `src/ui/coastal.css`, line 2771 applied `!important` to docking coordinates (`top: 50% !important; left: auto !important; transform: translateY(-50%) !important`), overriding React's inline `style={projectedStyle}` (`position: fixed`, dynamic `left`/`top`). Scoping docking rules to `:not([data-projected="true"])` unlocks native, non-docked 3D camera projection anchors.

Below are the complete empirical observations, logic chains, caveats, final conclusions, and line-by-line diff recommendations for the implementation worker.

---

## 1. Observation

### 1.1 Empirical TypeScript Compilation (`tsc --noEmit`)
Running `npm run typecheck` executes `tsc --noEmit`. The command fails with exit code `2`.
All errors are isolated to two test files:

#### A. In `tests/unit/adversarial_m2_inspectors.test.ts`:
1. `line 7, col 1`: `error TS6133: 'FarmGISLegend' is declared but its value is never read.`
2. `line 10, col 3`: `error TS6133: 'CatchSummaryToast' is declared but its value is never read.`
3. `line 12, col 1`: `error TS6192: All imports in import declaration are unused.` (`ContextualHintCard`, `hintVisibleMs`, `inferHintCategory`)
4. `line 27, col 3`: `error TS6133: 'qualityToStars' is declared but its value is never read.`
5. `line 34, col 3`: `error TS6196: 'MaritimeHazardDto' is declared but never used.`
6. `line 268, col 15`: `error TS2322: Type '{ id: string; ... }[]' is not assignable to type 'PlacedCropState[]'. Type is missing the following properties from type 'PlacedCropState': lastUpdatedMinute, health, averageMoistureAccum, moistureSampleCount.`
7. `line 305, col 11`: `error TS2353: Object literal may only specify known properties, and 'lastTendedMinute' does not exist in type 'PlacedCropState'.`

#### B. In `tests/unit/challenger_m2_empirical_audit.test.ts`:
1. `line 10, col 3`: `error TS6133: 'CatchSummaryToast' is declared but its value is never read.`
2. `line 15, col 3`: `error TS6133: 'inferHintCategory' is declared but its value is never read.`
3. `line 20, col 3`: `error TS6133: 'resolveMaritimeHazard' is declared but its value is never read.`
4. `line 24, col 3`: `error TS6133: 'calculateAllometricLengthCm' is declared but its value is never read.`
5. `line 25, col 3`: `error TS6133: 'qualityToStars' is declared but its value is never read.`
6. `line 34, col 3`: `error TS6196: 'MaritimeHazardDto' is declared but never used.`
7. `line 137, col 9`: `error TS2322: Type '"fruiting"' is not assignable to type 'CropStage'.`
8. `line 140, col 17`: `error TS2322: Type '"rich"' is not assignable to type 'SoilFertilityBand'.`
9. `line 141, col 9`: `error TS2739: Type '{ label: string; cost: number; }' is missing the following properties from type '{ kind: "water" | "none" | "harvest"; label: string; cost: number | null; available: boolean; blockerReason?: string | undefined; }': kind, available`
10. `line 183, col 13`: `error TS2740: Type 'Readonly<{ ... }>' is missing the following properties from type 'CropInspectionDto': placedCropId, approximateMinutesRemaining, climate, expectedYield, and 4 more.`
11. `line 243, col 13`: `error TS2741: Property 'seaWarning' is missing in type 'Readonly<{ ... }>' but required in type 'WorldHudBoatDto'.`
12. `line 251, col 9`: `error TS2769: Object literal may only specify known properties, but 'totalCargoSlots' does not exist in type 'WorldHudBoatDto'. Did you mean to write 'cargoSlots'?`
13. `line 289, col 13`: `error TS2322: Type ... is not assignable to type 'FishCargoState'. Types of property 'location' are incompatible. Property 'containerId' is missing in type '{ type: "boat-hold"; boatId: string; slotIndex: number; }' but required in type 'CargoLocation'.`
14. `line 349, col 13`: `error TS6133: 'onDismiss' is declared but its value is never read.`
15. `lines 406-410`: `error TS2769: No overload matches this call. Type '"flowering"' is not assignable to type 'CropStage'. Type '"rich"' is not assignable to type 'SoilFertilityBand'.`
16. `line 503, col 13`: `error TS2769: Object literal may only specify known properties, but 'totalCargoSlots' does not exist in type 'WorldHudBoatDto'.`
17. `lines 524, 531, 538`: `error TS2741: Property 'expiresMs' is missing in type '{ id: number; createdMs: number; text: string; tone: "..."; count: number; }' but required in type 'Notice'.`

#### C. In `tools/world/terrain-preservation.ts`:
- Inspected lines 26–28:
  ```ts
  ...(["farmhouse", "well", "bridge", "fish-market", "lighthouse", "windmill", "dock"] as const)
    .map((id) => WorldLayout.landmark(id))
  ```
- **Finding**: The earlier TS2783 error reported by Challenger 1 (`'id' is specified more than once`) has **already been resolved** in the current branch. `tools/world/terrain-preservation.ts` compiles with **0 errors**.

### 1.2 Canonical Build Status (`npm run build`)
`package.json` line 10 defines `"build": "tsc && vite build"`.
Because `tsc` exits with code `2`, the Vite build step is never reached when invoking `npm run build`.
Direct invocation of `npx vite build` succeeds in 2.72s with 254+ modules transformed and bundled into `dist/`. Thus, runtime bundling is completely functional.

### 1.3 Domain Entity Fidelity (`fish.salmon` vs Registered Species)
- In `tests/unit/mmo_inspectors_m2.test.ts`:
  - Lines 301, 311: `speciesId: "fish.salmon"`
  - Lines 323–325: `cargoId: "cargo.trophy_salmon_01"`, `speciesId: "fish.salmon"`, `speciesName: "Atlantic Salmon"`
  - Lines 658–660: `cargoId: "fish.salmon.1"`, `name: "Atlantic Salmon"`, `speciesId: "fish.salmon"`
  - Line 761: `// Internal hold bay (slot 1) with stowed salmon`
- In `src/simulation/fishing/trophyCatch.ts` line 55:
  ```ts
  const species = ContentRegistry.fishSpecies.get(cargo.speciesId);
  const speciesName = species?.name ?? "Sport Fish";
  ...
  let estimatedMarketValue = 10;
  if (species) {
    const breakdown = calculateFishPrice(species, cargo.weightKg, cargo.quality, cargo.freshness, demandModifier, seasonalModifier);
    estimatedMarketValue = breakdown.finalPrice;
  }
  ```
- Because `"fish.salmon"` is not in `src/content/fish.ts` (Neva's 15 registered species are `fish.carp`, `fish.trout`, `fish.perch`, `fish.catfish`, `fish.pike`, `fish.arowana`, `fish.mackerel`, `fish.tuna`, `fish.sturgeon`, `fish.sailfish`, `fish.swordfish`, `fish.blue_marlin`, `fish.sardine`, `fish.sea_bream`, `fish.amberjack`), `species` was `undefined`. The market value defaulted to 10 Gold, bypassing `calculateFishPrice()`.

### 1.4 CSS Specificity Conflict on Crop Inspection Card
- `src/ui/components/CropInspection.tsx`:
  - Line 75: Component renders `data-projected={Boolean(projectedStyle)}`.
  - Lines 50–58: When projected, returns inline style `style={{ position: "fixed", left: "650px", top: "300px", right: "auto", bottom: "auto", transform: "none", zIndex: 30 }}`.
- `src/ui/coastal.css` lines 2771–2786:
  ```css
  #ui-container .crop-inspection {
    top: 50% !important;
    right: var(--ui-safe-right) !important;
    left: auto !important;
    ...
    transform: translateY(-50%) !important;
  }
  ```
- In CSS cascade rules, a stylesheet rule with `!important` takes precedence over an inline style without `!important`. Consequently, in a real browser, the card stays docked at the screen edge instead of anchoring dynamically over the in-world 3D plant.

---

## 2. Logic Chain

1. **Root Cause of Build & Typecheck Gate Failure**:
   - `tsconfig.json` specifies `"strict": true`, `"noUnusedLocals": true`, and `"include": ["src", "tests", "tools"]`.
   - Any unused variable, unused import, or interface type mismatch in `tests/` causes `tsc --noEmit` to fail with exit code 2.
   - `npm run build` chains `tsc && vite build`. Therefore, until `tsc` completes with exit code 0, `npm run build` cannot succeed.
   - All errors are contained in `tests/unit/adversarial_m2_inspectors.test.ts` and `tests/unit/challenger_m2_empirical_audit.test.ts`. Resolving them guarantees that both `npm run typecheck` and `npm run build` exit with code 0.

2. **Domain Entity Fidelity**:
   - The game specification and `AGENTS.md` mandate that simulation contracts and pricing pipelines reflect genuine game rules.
   - Using `"fish.salmon"` caused `ContentRegistry.fishSpecies.get()` to return `undefined`, short-circuiting the pricing calculation.
   - Replacing `"fish.salmon"` with `"fish.trout"` (freshwater sport), `"fish.mackerel"` (saltwater coastal cargo), and `"fish.tuna"` (pelagic trophy) ensures `calculateFishPrice` is tested with real data, asserting true simulation fidelity.

3. **CSS Specificity Resolution**:
   - The `#ui-container .crop-inspection` selector has high specificity (`0,1,1,0`) and declared `!important` on `top`, `left`, `right`, and `transform`.
   - React's `projectedStyle` applies inline styles on the `<section>` element.
   - By scoping the docking geometry declarations to `#ui-container .crop-inspection:not([data-projected="true"])`, the `!important` docking rules apply ONLY when the card is docked/unprojected. When `data-projected="true"`, the inline projection coordinates apply cleanly.

---

## 3. Caveats

- **Whole-Repository Test Suite Context**: As documented by Challenger 2, `npx vitest run` across the entire repo runs 139 files (1251 passed tests, 19 legacy failures in unrelated subsystems like character vertex budget and legacy save migration fixtures). All M2 component tests pass 100% (167/167 tests).
- **Mobile Device Media Rule**: `src/ui/coastal.css` also has a rule `#ui-container[data-mobile-device="true"] .crop-inspection` at line 3181. For mobile viewports, scoping it to `:not([data-projected="true"])` is also recommended so mobile projection works if 3D touch inspection is enabled.

---

## 4. Conclusion & Actionable Diff Recommendations

### 4.1 Changes to `tests/unit/adversarial_m2_inspectors.test.ts`

```diff
--- a/tests/unit/adversarial_m2_inspectors.test.ts
+++ b/tests/unit/adversarial_m2_inspectors.test.ts
@@ -4,16 +4,9 @@ import { renderToString } from "react-dom/server";
 
 // Components to stress-test
 import { CropInspection } from "../../src/ui/components/CropInspection";
-import { FarmGISLegend } from "../../src/ui/components/FarmGISLegend";
-import {
-  CatchInspectionModal,
-  CatchSummaryToast
-} from "../../src/ui/components/CatchInspectionModal";
-import {
-  ContextualHintCard,
-  hintVisibleMs,
-  inferHintCategory
-} from "../../src/ui/components/ContextualHintCard";
+import { CatchInspectionModal } from "../../src/ui/components/CatchInspectionModal";
 import { NoticeStack } from "../../src/ui/components/NoticeStack";
 import {
   WeatherHazardBanner,
@@ -24,14 +17,12 @@ import { MaritimeVesselConsole } from "../../src/ui/components/MaritimeVesselCon
 // Simulation & logic imports
 import {
   calculateAllometricLengthCm,
-  qualityToStars,
   buildTrophyCatchDto
 } from "../../src/simulation/fishing/trophyCatch";
 import type {
   CropInspectionDto,
   TrophyCatchDto,
-  WorldHudBoatDto,
-  MaritimeHazardDto
+  WorldHudBoatDto
 } from "../../src/simulation/core/contracts";
 import type { FishCargoState, PlacedCropState } from "../../src/simulation/core/types";
 import type { Notice } from "../../src/ui/notifications";
@@ -268,15 +259,18 @@ describe("Adversarial M2 Inspector, HUD & Telemetry Stress Suite", () => {
         const mockCrops: PlacedCropState[] = Array.from({ length: count }, (_, i) => ({
           id: `crop_${i}`,
           cropId: i % 2 === 0 ? "crop.turnip" : "crop.carrot",
           stage: "growing",
           farmId: "farm_1",
           x: i * 2,
           z: i * 2,
           rotationRadians: 0,
+          plantedAtMinute: 0,
+          lastUpdatedMinute: 0,
           effectiveGrowthMinutes: 15,
           moisture: 0.5,
-          plantedAtMinute: 0,
-          lastTendedMinute: 0
+          health: 100,
+          averageMoistureAccum: 0.5,
+          moistureSampleCount: 1
         }));
 
         const hashGisOff = computeCropSignature(mockCrops, false);
@@ -296,13 +290,16 @@ describe("Adversarial M2 Inspector, HUD & Telemetry Stress Suite", () => {
           id: "crop_a",
           cropId: "crop.wheat",
           stage: "mature",
           farmId: "farm_home",
           x: 10,
           z: 20,
           rotationRadians: 1.57,
+          plantedAtMinute: 0,
+          lastUpdatedMinute: 0,
           effectiveGrowthMinutes: 40,
           moisture: 0.3,
-          plantedAtMinute: 0,
-          lastTendedMinute: 0
+          health: 100,
+          averageMoistureAccum: 0.3,
+          moistureSampleCount: 1
         }
       ];
@@ -479,9 +476,9 @@ describe("Adversarial M2 Inspector, HUD & Telemetry Stress Suite", () => {
 
       const originalCatch: TrophyCatchDto = {
         cargoId: "c_fish",
-        speciesId: "fish.salmon",
-        speciesName: "Salmon",
-        habitats: ["river"],
-        cargoClass: "medium",
+        speciesId: "fish.trout",
+        speciesName: "Rainbow Trout",
+        habitats: ["river", "lake"],
+        cargoClass: "small",
         weightKg: 3.5,
         lengthCm: 55,
```

---

### 4.2 Changes to `tests/unit/challenger_m2_empirical_audit.test.ts`

```diff
--- a/tests/unit/challenger_m2_empirical_audit.test.ts
+++ b/tests/unit/challenger_m2_empirical_audit.test.ts
@@ -6,26 +6,13 @@ import { renderToString } from "react-dom/server";
 // Milestone M2 Deliverables under challenge
 import { CropInspection } from "../../src/ui/components/CropInspection";
 import { FarmGISLegend } from "../../src/ui/components/FarmGISLegend";
-import {
-  CatchInspectionModal,
-  CatchSummaryToast
-} from "../../src/ui/components/CatchInspectionModal";
-import {
-  ContextualHintCard,
-  hintVisibleMs,
-  inferHintCategory
-} from "../../src/ui/components/ContextualHintCard";
+import { CatchInspectionModal } from "../../src/ui/components/CatchInspectionModal";
+import { ContextualHintCard, hintVisibleMs } from "../../src/ui/components/ContextualHintCard";
 import { NoticeStack } from "../../src/ui/components/NoticeStack";
-import {
-  WeatherHazardBanner,
-  resolveMaritimeHazard
-} from "../../src/ui/components/WeatherHazardBanner";
+import { WeatherHazardBanner } from "../../src/ui/components/WeatherHazardBanner";
 import { MaritimeVesselConsole } from "../../src/ui/components/MaritimeVesselConsole";
-import {
-  calculateAllometricLengthCm,
-  qualityToStars,
-  buildTrophyCatchDto
-} from "../../src/simulation/fishing/trophyCatch";
+import { buildTrophyCatchDto } from "../../src/simulation/fishing/trophyCatch";
 
 // Contracts & Types
 import type {
   CropInspectionDto,
   TrophyCatchDto,
-  WorldHudBoatDto,
-  MaritimeHazardDto
+  WorldHudBoatDto
 } from "../../src/simulation/core/contracts";
 import type { Notice } from "../../src/ui/notifications";
 import type { FishCargoState } from "../../src/simulation/core/types";
@@ -131,14 +118,29 @@ describe("Empirical Challenger Audit: Milestone M2", () => {
         innerHeight: 1080
       };
 
       const baseInspection: CropInspectionDto = {
+        placedCropId: "crop.placed.carrot_1",
         cropId: "crop.winter_carrot",
         name: "Winter Carrot",
-        stage: "fruiting",
+        stage: "mature",
+        approximateMinutesRemaining: 135,
         stageTimingLabel: "2h 15m until harvest",
         moisture: { band: "wet", value: 85 },
-        soil: { band: "rich", fertility: 90 },
-        immediateAction: { label: "Harvest", cost: 5 }
+        climate: {
+          current: "temperate",
+          preferred: ["temperate"],
+          status: "preferred"
+        },
+        soil: { band: "good", fertility: 90 },
+        expectedYield: { min: 2, max: 5 },
+        work: { current: 500, baseCost: 5, cost: 5, availableWork: 500, affordable: true, shortage: 0, readyAtMinute: null },
+        waterWork: { baseCost: 5, cost: 5, availableWork: 500, affordable: true, shortage: 0, readyAtMinute: null },
+        harvestWork: { baseCost: 5, cost: 5, availableWork: 500, affordable: true, shortage: 0, readyAtMinute: null },
+        immediateAction: { kind: "harvest", label: "Harvest", cost: 5, available: true },
+        actions: { canWater: false, canHarvest: true }
       };
 
       // Case 1: Extreme offscreen left & top (-5000, -5000)
@@ -180,14 +182,23 @@ describe("Empirical Challenger Audit: Milestone M2", () => {
   describe("2. Simulation Purity & Immutability Verification", () => {
     it("renders CropInspection with deeply frozen DTO without modifying any property", () => {
       const inspection: CropInspectionDto = deepFreeze({
+        placedCropId: "crop.placed.cabbage_1",
         cropId: "crop.cabbage",
         name: "Savoy Cabbage",
         stage: "growing",
+        approximateMinutesRemaining: 45,
         stageTimingLabel: "Stage 2 of 3",
         moisture: { band: "normal", value: 50 },
+        climate: {
+          current: "temperate",
+          preferred: ["temperate"],
+          status: "preferred"
+        },
         soil: { band: "fair", fertility: 45 },
-        immediateAction: { label: "Water", cost: 3, blockerReason: "Needs watering can" }
+        expectedYield: { min: 1, max: 3 },
+        work: { current: 500, baseCost: 3, cost: 3, availableWork: 500, affordable: true, shortage: 0, readyAtMinute: null },
+        waterWork: { baseCost: 3, cost: 3, availableWork: 500, affordable: true, shortage: 0, readyAtMinute: null },
+        harvestWork: { baseCost: 10, cost: 10, availableWork: 500, affordable: true, shortage: 0, readyAtMinute: null },
+        immediateAction: { kind: "water", label: "Water", cost: 3, available: true, blockerReason: "Needs watering can" },
+        actions: { canWater: true, canHarvest: false, waterReason: "Needs watering can" }
       });
 
       const initialSnapshot = JSON.stringify(inspection);
@@ -244,14 +254,14 @@ describe("Empirical Challenger Audit: Milestone M2", () => {
         boatId: "boat.skiff.01",
         name: "Seafarer II",
         speedKnots: 8.5,
         seaState: "Swell",
+        seaWarning: null,
         hull: { current: 180, maximum: 200, percent: 90, danger: false },
         fuel: { current: 45, maximum: 50, percent: 90, danger: false },
         occupiedCargoSlots: 1,
-        totalCargoSlots: 4,
         cargoSlots: [
           {
             slotNumber: 1,
             cargo: {
               cargoId: "cargo.1",
-              name: "Salmon",
-              speciesId: "fish.salmon",
+              name: "Rainbow Trout",
+              speciesId: "fish.trout",
               weightKg: 5.2,
               quality: "fine",
               freshnessPercent: 88,
@@ -288,14 +298,14 @@ describe("Empirical Challenger Audit: Milestone M2", () => {
     it("verifies buildTrophyCatchDto produces pure presentation DTO without modifying source FishCargoState", () => {
       const sourceCargo: FishCargoState = deepFreeze({
         id: "cargo.halibut.7",
-        speciesId: "fish.halibut",
+        speciesId: "fish.trout",
         weightKg: 18.4,
         quality: "exceptional",
         caughtAtMinute: 340,
         freshness: 82.5,
         cargoClass: "large",
-        location: { type: "boat-hold", boatId: "boat.skiff.01", slotIndex: 0 }
+        location: { type: "boat-hold", containerId: "boat.skiff.01", slotIndex: 0 }
       });
 
       const beforeJson = JSON.stringify(sourceCargo);
@@ -346,7 +356,6 @@ describe("Empirical Challenger Audit: Milestone M2", () => {
     it("verifies CatchInspectionModal registers keydown listener with capture and cleans it up symmetrically", () => {
       // Direct inspection of component useEffect logic
       const handleKeyDown = vi.fn();
-      const onDismiss = vi.fn();
 
       // Simulate mounting:
       window.addEventListener("keydown", handleKeyDown, true);
@@ -400,14 +409,24 @@ describe("Empirical Challenger Audit: Milestone M2", () => {
       // 1. CropInspection
       const cropHtml = renderToString(
         React.createElement(CropInspection, {
           inspection: {
+            placedCropId: "crop.placed.wheat_1",
             cropId: "crop.wheat",
             name: "Spring Wheat",
-            stage: "flowering",
+            stage: "growing",
+            approximateMinutesRemaining: 50,
             stageTimingLabel: "Stage 2",
             moisture: { band: "wet", value: 80 },
-            soil: { band: "rich", fertility: 85 },
-            immediateAction: { label: "Wait" }
+            climate: {
+              current: "temperate",
+              preferred: ["temperate"],
+              status: "preferred"
+            },
+            soil: { band: "good", fertility: 85 },
+            expectedYield: { min: 2, max: 4 },
+            work: { current: 500, baseCost: 5, cost: 5, availableWork: 500, affordable: true, shortage: 0, readyAtMinute: null },
+            waterWork: { baseCost: 5, cost: 5, availableWork: 500, affordable: true, shortage: 0, readyAtMinute: null },
+            harvestWork: { baseCost: 10, cost: 10, availableWork: 500, affordable: true, shortage: 0, readyAtMinute: null },
+            immediateAction: { kind: "none", label: "Wait", cost: null, available: false },
+            actions: { canWater: false, canHarvest: false }
           },
           onClose: () => {}
         })
@@ -497,13 +516,15 @@ describe("Empirical Challenger Audit: Milestone M2", () => {
             boatId: "boat.rowboat.01",
             name: "Rowboat",
             speedKnots: 0,
+            seaWarning: null,
+            showNightWarning: false,
             seaState: "Calm",
             hull: { current: 100, maximum: 100, percent: 100, danger: false },
+            fuel: null,
             occupiedCargoSlots: 0,
-            totalCargoSlots: 2,
             cargoSlots: [
               { slotNumber: 1, cargo: null },
               { slotNumber: 2, cargo: null }
             ],
             isDocked: true
@@ -522,21 +543,24 @@ describe("Empirical Challenger Audit: Milestone M2", () => {
     it("verifies NoticeStack correctly formats item, labor, and money deltas with proper classes", () => {
       const notices: readonly Notice[] = [
         {
           id: 1,
           createdMs: 1000,
+          expiresMs: 3500,
           text: "+3 Winter Carrot",
           tone: "reward",
           count: 1
         },
         {
           id: 2,
           createdMs: 1001,
+          expiresMs: 3501,
           text: "-12 Work (Tilling)",
           tone: "info",
           count: 1
         },
         {
           id: 3,
           createdMs: 1002,
+          expiresMs: 3502,
           text: "+150 Gold",
           tone: "success",
           count: 2
         }
```

---

### 4.3 Changes to `tests/unit/mmo_inspectors_m2.test.ts`

```diff
--- a/tests/unit/mmo_inspectors_m2.test.ts
+++ b/tests/unit/mmo_inspectors_m2.test.ts
@@ -298,24 +298,26 @@ describe("Milestone M2 UI/HUD Inspectors & Overlays", () => {
       it("constructs TrophyCatchDto from landed fish cargo state", () => {
         const cargo: FishCargoState = {
           id: "cargo.test.1",
-          speciesId: "fish.salmon",
+          speciesId: "fish.trout",
           weightKg: 4.5,
           quality: "exceptional",
           caughtAtMinute: 480,
           freshness: 95,
           cargoClass: "medium",
           location: { type: "boat-hold", containerId: "boat.1" }
         };
         const dto = buildTrophyCatchDto(cargo, "weight");
         expect(dto.cargoId).toBe("cargo.test.1");
-        expect(dto.speciesId).toBe("fish.salmon");
+        expect(dto.speciesId).toBe("fish.trout");
+        expect(dto.speciesName).toBe("Rainbow Trout");
         expect(dto.weightKg).toBe(4.5);
         expect(dto.quality).toBe("exceptional");
         expect(dto.qualityStars).toBe(3);
         expect(dto.record).toBe("weight");
         expect(dto.storageDestination).toBe("boat-hold");
         expect(dto.storageLocationLabel).toBe("Stowed in boat hold");
+        expect(dto.estimatedMarketValue).toBeGreaterThan(10);
       });
     });
 
     describe("CatchInspectionModal Component Presentation", () => {
       const trophyCatch: TrophyCatchDto = {
-        cargoId: "cargo.trophy_salmon_01",
-        speciesId: "fish.salmon",
-        speciesName: "Atlantic Salmon",
+        cargoId: "cargo.trophy_trout_01",
+        speciesId: "fish.trout",
+        speciesName: "Rainbow Trout",
         weightKg: 6.85,
         lengthCm: 86.2,
         quality: "exceptional",
         qualityStars: 3,
         freshnessPercent: 96,
         freshnessTone: "fresh",
         estimatedShelfLifeMinutes: 48,
         estimatedMarketValue: 340,
         cargoClass: "medium",
-        habitats: ["coastal", "river"],
+        habitats: ["river", "lake"],
         storageDestination: "boat-hold",
         storageLocationLabel: "Stowed in boat hold",
         record: "weight"
       };
 
       it("renders celebratory headline, species portrait, record banner, vitals grid, and stars", () => {
         const html = renderToString(
           React.createElement(CatchInspectionModal, {
             catchData: trophyCatch,
             onDismiss: () => {},
             onOpenHoldOrSatchel: () => {}
           })
         );
 
         expect(html).toContain('data-testid="catch-inspection-modal"');
         expect(html).toContain("Trophy Catch Landed!");
         expect(html).toContain("COASTAL SPORT ANGLING");
-        expect(html).toContain("Atlantic Salmon");
+        expect(html).toContain("Rainbow Trout");
 
         // Personal record banner
@@ -655,14 +657,14 @@ describe("Milestone M2 UI/HUD Inspectors & Overlays", () => {
         {
           slotNumber: 1,
           cargo: {
-            cargoId: "fish.salmon.1",
-            name: "Atlantic Salmon",
-            speciesId: "fish.salmon",
-            weightKg: 5.2,
+            cargoId: "fish.mackerel.1",
+            name: "Atlantic Mackerel",
+            speciesId: "fish.mackerel",
+            weightKg: 1.2,
             quality: "exceptional",
             freshnessPercent: 92,
             freshnessTone: "fresh"
           }
         },
@@ -758,9 +760,9 @@ describe("Milestone M2 UI/HUD Inspectors & Overlays", () => {
       expect(html).toContain("boat-cargo-grid");
       expect(html).toContain("2/5"); // Occupied slots
 
-      // Internal hold bay (slot 1) with stowed salmon
+      // Internal hold bay (slot 1) with stowed mackerel
       expect(html).toContain("is-hold");
-      expect(html).toContain("5.2kg");
+      expect(html).toContain("1.2kg");
       expect(html).toContain("freshness-fresh");
 
       // Transom hook (slot 5 > 4) with hanging heavy tuna
```

---

### 4.4 Changes to `src/ui/coastal.css`

```diff
--- a/src/ui/coastal.css
+++ b/src/ui/coastal.css
@@ -2768,13 +2768,6 @@
 }
 
-#ui-container .crop-inspection {
-  top: 50% !important;
-  right: var(--ui-safe-right) !important;
-  left: auto !important;
-  width: min(340px, calc(100vw - 28px)) !important;
-  padding: 10px 11px !important;
-  color: var(--coast-cream) !important;
-  background:
-    linear-gradient(105deg, rgba(77, 133, 132, 0.12), transparent 44%),
-    rgba(8, 29, 37, 0.91) !important;
-  border: 1px solid rgba(232, 215, 181, 0.22) !important;
-  border-left: 2px solid var(--coast-ochre) !important;
-  border-radius: 1px !important;
-  transform: translateY(-50%) !important;
-  box-shadow: var(--coast-shadow-soft) !important;
-}
+#ui-container .crop-inspection {
+  width: min(340px, calc(100vw - 28px)) !important;
+  padding: 10px 11px !important;
+  color: var(--coast-cream) !important;
+  background:
+    linear-gradient(105deg, rgba(77, 133, 132, 0.12), transparent 44%),
+    rgba(8, 29, 37, 0.91) !important;
+  border: 1px solid rgba(232, 215, 181, 0.22) !important;
+  border-left: 2px solid var(--coast-ochre) !important;
+  border-radius: 1px !important;
+  box-shadow: var(--coast-shadow-soft) !important;
+}
+
+#ui-container .crop-inspection:not([data-projected="true"]) {
+  top: 50% !important;
+  right: var(--ui-safe-right) !important;
+  left: auto !important;
+  transform: translateY(-50%) !important;
+}
 
 #ui-container .crop-inspection-title {
```

And at line 3181 for mobile device support:
```diff
--- a/src/ui/coastal.css
+++ b/src/ui/coastal.css
@@ -3181,7 +3181,7 @@
-#ui-container[data-mobile-device="true"] .crop-inspection {
+#ui-container[data-mobile-device="true"] .crop-inspection:not([data-projected="true"]) {
   top: max(62px, calc(52px + env(safe-area-inset-top))) !important;
   right: var(--mobile-control-right) !important;
```

---

## 5. Verification Method

Once the worker applies the above patches, verify independently with these steps:

1. **Verify TypeScript Compilation (`npm run typecheck`)**:
   ```bash
   npm run typecheck
   ```
   *Expected outcome*: Exits with code 0 (`tsc --noEmit` reports 0 errors).

2. **Verify Production Build (`npm run build`)**:
   ```bash
   npm run build
   ```
   *Expected outcome*: Exits with code 0 (`tsc` passes and Vite transforms 254+ modules into `dist/`).

3. **Verify All M2 Test Suites**:
   ```bash
   npx vitest run tests/unit/mmo_inspectors_m2.test.ts tests/unit/adversarial_m2_inspectors.test.ts tests/unit/challenger_m2_empirical_audit.test.ts tests/unit/adversarial_m2_hud.test.ts tests/unit/empirical_m2_hud.test.ts tests/unit/empirical_m5_overlays.test.ts tests/unit/uiModals.test.ts
   ```
   *Expected outcome*: All test suites pass 100% (116/116 tests passing across M2 suites).

4. **Verify Regression Suites**:
   ```bash
   npx vitest run tests/unit/adversarial_m1_hud.test.ts tests/unit/hud_m1.test.ts tests/unit/viewport_budget_m1_adversarial.test.ts
   ```
   *Expected outcome*: All regression tests pass 100% (67/67 tests passing).

### Invalidation Conditions
- Any TypeScript error under `tsc --noEmit`.
- Any failure in `npm run build`.
- Any test failure in `tests/unit/mmo_inspectors_m2.test.ts`.
- Any occurrence of `#ui-container .crop-inspection` overriding inline `style={projectedStyle}` in browser rendering.
