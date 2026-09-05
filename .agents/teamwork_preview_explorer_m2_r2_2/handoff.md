# Handoff Report — Milestone M2 Iteration 2 Forensic & Technical Remediation Plan

**Agent**: `teamwork_preview_explorer_m2_r2_2`  
**Role**: explorer / investigator / synthesizer  
**Parent Agent**: `orchestrator_5` (`c275e7b3-2b97-46df-81cb-0a621ce8a161`)  
**Working Directory**: `/Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_explorer_m2_r2_2/`  
**Timestamp**: 2026-09-04T14:43:00Z  
**Verdict**: **REMEDIATION SPECIFICATION READY**  
**Docs updated**: none — read-only investigation and proposal  

---

## Executive Summary

This investigation resolves the Forensic Integrity Violation reported by `teamwork_preview_auditor_m2` and the findings from challengers and reviewers regarding Milestone M2. Empirical execution reveals that `npm run typecheck` and canonical `npm run build` currently fail with exit code 2 due to strict TypeScript compilation errors (`TS6133`, `TS6192`, `TS6196`, `TS2322`, `TS2353`, `TS2740`, `TS2741`, `TS2769`) residing in test files. Furthermore, domain entity verification identified that unit tests used an unregistered fish ID (`"fish.salmon"`), which bypassed the valuation engine, and CSS specificity rules in `coastal.css` force crop inspection cards to remain docked on the screen edge rather than projecting dynamically in 3D space.

This document details the exact observations, logical deductions, and concrete line-by-line diff recommendations for the worker agent to achieve a 100% clean build, zero TypeScript errors, authentic domain simulation fidelity, and correct 3D card projection.

---

## 1. Observation

### 1.1 Empirical Command Execution & Verbatim Compiler Errors

#### Command: `npm run typecheck` (`tsc --noEmit`)
Executed in workspace `/Users/anilkaraca/Desktop/Neva`:
```bash
$ npm run typecheck
> neva@0.1.0 pretypecheck
> npm run assets:sync

[assets:sync] verified manifest with 40 entries

> neva@0.1.0 typecheck
> tsc --noEmit
```
**Exit Code**: `2`.  
**Verbatim Errors Output**:
```
tests/unit/adversarial_m2_inspectors.test.ts(7,1): error TS6133: 'FarmGISLegend' is declared but its value is never read.
tests/unit/adversarial_m2_inspectors.test.ts(10,3): error TS6133: 'CatchSummaryToast' is declared but its value is never read.
tests/unit/adversarial_m2_inspectors.test.ts(12,1): error TS6192: All imports in import declaration are unused.
tests/unit/adversarial_m2_inspectors.test.ts(27,3): error TS6133: 'qualityToStars' is declared but its value is never read.
tests/unit/adversarial_m2_inspectors.test.ts(34,3): error TS6196: 'MaritimeHazardDto' is declared but never used.
tests/unit/adversarial_m2_inspectors.test.ts(268,15): error TS2322: Type '{ id: string; cropId: string; stage: "growing"; farmId: string; x: number; z: number; rotationRadians: number; effectiveGrowthMinutes: number; moisture: number; plantedAtMinute: number; lastTendedMinute: number; }[]' is not assignable to type 'PlacedCropState[]'.
  Type '{ id: string; cropId: string; stage: "growing"; farmId: string; x: number; z: number; rotationRadians: number; effectiveGrowthMinutes: number; moisture: number; plantedAtMinute: number; lastTendedMinute: number; }' is missing the following properties from type 'PlacedCropState': lastUpdatedMinute, health, averageMoistureAccum, moistureSampleCount
tests/unit/adversarial_m2_inspectors.test.ts(305,11): error TS2353: Object literal may only specify known properties, and 'lastTendedMinute' does not exist in type 'PlacedCropState'.
tests/unit/challenger_m2_empirical_audit.test.ts(10,3): error TS6133: 'CatchSummaryToast' is declared but its value is never read.
tests/unit/challenger_m2_empirical_audit.test.ts(15,3): error TS6133: 'inferHintCategory' is declared but its value is never read.
tests/unit/challenger_m2_empirical_audit.test.ts(20,3): error TS6133: 'resolveMaritimeHazard' is declared but its value is never read.
tests/unit/challenger_m2_empirical_audit.test.ts(24,3): error TS6133: 'calculateAllometricLengthCm' is declared but its value is never read.
tests/unit/challenger_m2_empirical_audit.test.ts(25,3): error TS6133: 'qualityToStars' is declared but its value is never read.
tests/unit/challenger_m2_empirical_audit.test.ts(34,3): error TS6196: 'MaritimeHazardDto' is declared but never used.
tests/unit/challenger_m2_empirical_audit.test.ts(137,9): error TS2322: Type '"fruiting"' is not assignable to type 'CropStage'.
tests/unit/challenger_m2_empirical_audit.test.ts(140,17): error TS2322: Type '"rich"' is not assignable to type 'SoilFertilityBand'.
tests/unit/challenger_m2_empirical_audit.test.ts(141,9): error TS2739: Type '{ label: string; cost: number; }' is missing the following properties from type '{ kind: "water" | "none" | "harvest"; label: string; cost: number | null; available: boolean; blockerReason?: string | undefined; }': kind, available
tests/unit/challenger_m2_empirical_audit.test.ts(183,13): error TS2740: Type 'Readonly<{ cropId: string; name: string; stage: "growing"; stageTimingLabel: string; moisture: { band: "normal"; value: number; }; soil: { band: "fair"; fertility: number; }; immediateAction: { label: string; cost: number; blockerReason: string; }; }>' is missing the following properties from type 'CropInspectionDto': placedCropId, approximateMinutesRemaining, climate, expectedYield, and 4 more.
tests/unit/challenger_m2_empirical_audit.test.ts(243,13): error TS2741: Property 'seaWarning' is missing in type 'Readonly<{ boatId: string; name: string; speedKnots: number; seaState: "Swell"; hull: { current: number; maximum: number; percent: number; danger: false; }; fuel: { current: number; maximum: number; percent: number; danger: false; }; ... 4 more ...; showNightWarning: false; }>' but required in type 'WorldHudBoatDto'.
tests/unit/challenger_m2_empirical_audit.test.ts(289,13): error TS2322: Type 'Readonly<{ id: string; speciesId: string; weightKg: number; quality: "exceptional"; caughtAtMinute: number; freshness: number; cargoClass: "large"; location: { type: "boat-hold"; boatId: string; slotIndex: number; }; }>' is not assignable to type 'FishCargoState'.
  Types of property 'location' are incompatible.
    Property 'containerId' is missing in type '{ type: "boat-hold"; boatId: string; slotIndex: number; }' but required in type 'CargoLocation'.
tests/unit/challenger_m2_empirical_audit.test.ts(349,13): error TS6133: 'onDismiss' is declared but its value is never read.
tests/unit/challenger_m2_empirical_audit.test.ts(406,13): error TS2769: No overload matches this call.
tests/unit/challenger_m2_empirical_audit.test.ts(409,21): error TS2769: No overload matches this call.
tests/unit/challenger_m2_empirical_audit.test.ts(410,13): error TS2769: No overload matches this call.
tests/unit/challenger_m2_empirical_audit.test.ts(503,13): error TS2769: No overload matches this call.
  Object literal may only specify known properties, but 'totalCargoSlots' does not exist in type 'WorldHudBoatDto'. Did you mean to write 'cargoSlots'?
tests/unit/challenger_m2_empirical_audit.test.ts(524,9): error TS2741: Property 'expiresMs' is missing in type '{ id: number; createdMs: number; text: string; tone: "reward"; count: number; }' but required in type 'Notice'.
tests/unit/challenger_m2_empirical_audit.test.ts(531,9): error TS2741: Property 'expiresMs' is missing in type '{ id: number; createdMs: number; text: string; tone: "info"; count: number; }' but required in type 'Notice'.
tests/unit/challenger_m2_empirical_audit.test.ts(538,9): error TS2741: Property 'expiresMs' is missing in type '{ id: number; createdMs: number; text: string; tone: "success"; count: number; }' but required in type 'Notice'.
```

#### Command: `npm run build`
`package.json` specifies `"build": "tsc && vite build"`.
Because `tsc` exits with code 2, Vite build is never invoked. Standalone `npx vite build` succeeds in 2.72s with 257 modules, confirming that client application code bundles cleanly, but the gate fails due to `tsc`.

### 1.2 Inspection of `tools/world/terrain-preservation.ts`
Challenger 1 originally noted `TS2783: 'id' is specified more than once` on line 27 when it had `{ id, ...WorldLayout.landmark(id) }`.
Direct inspection of `tools/world/terrain-preservation.ts` lines 26–28:
```ts
26:     ...(["farmhouse", "well", "bridge", "fish-market", "lighthouse", "windmill", "dock"] as const)
27:       .map((id) => WorldLayout.landmark(id))
28:   ].map((anchor) => ({ ...anchor, height: fixed(WorldLayout.terrainHeight(anchor.x, anchor.z)) }));
```
`WorldLayout.landmark(id)` returns an object that already includes `id: LandmarkId`. Line 27 is currently clean and produces **zero** compiler errors under `tsconfig.json`.

### 1.3 Inspection of `tests/unit/adversarial_m2_inspectors.test.ts`
- Lines 7, 10, 12–16, 27, 34 contain imports that are never referenced:
  - `FarmGISLegend` (line 7)
  - `CatchSummaryToast` (line 10)
  - `ContextualHintCard`, `hintVisibleMs`, `inferHintCategory` (lines 12–16)
  - `qualityToStars` (line 27)
  - `MaritimeHazardDto` (line 34)
- Lines 268–280 and lines 293–307 create mock `PlacedCropState` objects that include the invalid property `lastTendedMinute: 0` (which does not exist on `PlacedCropState`), and omit required fields:
  - `lastUpdatedMinute: GameMinute`
  - `health: number`
  - `averageMoistureAccum: number`
  - `moistureSampleCount: number`
- Under `tsconfig.json` flags `"noUnusedLocals": true`, `"noUnusedParameters": true`, and `"strict": true`, these cause 7 compilation errors.

### 1.4 Inspection of `tests/unit/challenger_m2_empirical_audit.test.ts`
- This untracked test file was added by `teamwork_preview_challenger_m2_2` during its challenge run.
- It contains 20 strict TypeScript compiler errors due to unused imports/parameters, invalid enum strings (`"fruiting"`, `"rich"`), missing DTO properties (`expiresMs` in `Notice`, `seaWarning` in `WorldHudBoatDto`, `containerId` in `CargoLocation`), and incomplete mock objects passed without appropriate type assertions.
- Because `tsconfig.json` includes `"tests"`, any untracked test file in `tests/` is compiled by `tsc --noEmit`.

### 1.5 Inspection of Domain Entity Fidelity in `tests/unit/mmo_inspectors_m2.test.ts`
- In `tests/unit/mmo_inspectors_m2.test.ts` lines 301, 311, 324, 658, 660, fish cargo instances specify `speciesId: "fish.salmon"`.
- Inspection of `src/content/fish.ts` reveals 15 registered species:
  `fish.carp`, `fish.trout`, `fish.perch`, `fish.catfish`, `fish.pike`, `fish.arowana`, `fish.mackerel`, `fish.tuna`, `fish.sturgeon`, `fish.sailfish`, `fish.swordfish`, `fish.blue_marlin`, `fish.sardine`, `fish.sea_bream`, `fish.amberjack`.
  `"fish.salmon"` does NOT exist in the registry.
- In `src/simulation/fishing/trophyCatch.ts` lines 55–74:
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
- Because `"fish.salmon"` returned `undefined`, `calculateFishPrice` was completely bypassed and the fallback `10 Gold` was assigned. The unit test never tested genuine valuation math with an authentic registered species.

### 1.6 Inspection of CSS Specificity in `src/ui/coastal.css`
- In `src/ui/components/CropInspection.tsx` lines 50–59 & 75:
  ```tsx
  const projectedStyle = useMemo<React.CSSProperties | undefined>(() => {
    ...
    return {
      position: "fixed",
      left: `${Math.round(clampedLeft)}px`,
      top: `${Math.round(clampedTop)}px`,
      right: "auto",
      bottom: "auto",
      transform: "none",
      zIndex: 30
    };
  }, [projectedPosition]);

  return (
    <GameSheet
      ...
      className={`crop-inspection interactive ${className}`.trim()}
      style={projectedStyle}
      data-projected={Boolean(projectedStyle)}
  ```
- In `src/ui/coastal.css` lines 2771–2786:
  ```css
  #ui-container .crop-inspection {
    top: 50% !important;
    right: var(--ui-safe-right) !important;
    left: auto !important;
    ...
    transform: translateY(-50%) !important;
  }
  ```
- In CSS cascade mechanics, declarations with `!important` in a stylesheet take precedence over normal inline `style` declarations. Consequently, the card in a real browser is forcibly pinned to the right edge at `top: 50%`, completely ignoring the dynamically calculated 3D projected ground anchor coordinates.

---

## 2. Logic Chain

1. **Gate Invariant**:
   - Both `ORIGINAL_REQUEST.md` and `PROJECT.md` require `npm run typecheck` and `npm run build` to exit with code 0.
   - `package.json` chains `build` to `tsc && vite build`.
   - Therefore, any TypeScript compilation error in `src`, `tests`, or `tools` causes both `typecheck` and `build` to fail with exit code 2.

2. **Root Cause Analysis of Compilation Errors**:
   - `tools/world/terrain-preservation.ts` line 27 is already clean.
   - `tests/unit/adversarial_m2_inspectors.test.ts` introduced 5 unused import errors and 2 type errors where `PlacedCropState` was instantiated with an obsolete property (`lastTendedMinute`) and missing 4 required fields.
   - `tests/unit/challenger_m2_empirical_audit.test.ts` was introduced by challenger 2 and contains 20 compilation errors due to incomplete mock typings and unused imports.
   - Rectifying these two test files (or deleting the challenger 2 scratch file) directly eliminates all 27 compilation errors, bringing `tsc --noEmit` to exit code 0.

3. **Domain Simulation Integrity**:
   - `ContentRegistry.fishSpecies` holds canonical fish definitions.
   - Testing with an unregistered ID (`"fish.salmon"`) bypasses `calculateFishPrice`.
   - Switching the species ID to `"fish.trout"` (Rainbow Trout, small cargo class, average weight 3.2kg, base value 50G) or `"fish.tuna"` exercises the genuine pricing pipeline, allometric length derivation, and species name lookup.

4. **CSS Cascade & Presentation Fidelity**:
   - `CropInspection.tsx` attaches `data-projected="true"` when 3D screen projection coordinates are active.
   - When docked (offscreen / unprojected), `data-projected="false"`.
   - Scoping docked positioning rules (`top: 50% !important`, `right: var(--ui-safe-right) !important`, `left: auto !important`, `transform: translateY(-50%) !important`) to `:not([data-projected="true"])` allows inline `projectedStyle` to govern position when projected, while preserving the docked fallback when unprojected.
   - Separating visual styling (colors, borders, background, padding) from layout positioning ensures that the card retains its cozy coastal slate/ochre aesthetics in both modes.

---

## 3. Caveats

- **Untracked Test Files**: Both `tests/unit/adversarial_m2_inspectors.test.ts` and `tests/unit/challenger_m2_empirical_audit.test.ts` are currently untracked in git. If `challenger_m2_empirical_audit.test.ts` was an ephemeral test created only for audit verification, deleting it is clean and eliminates 20 errors immediately. However, if the orchestrator prefers retaining both test files for coverage, concrete diffs to fix all 20 typings in `challenger_m2_empirical_audit.test.ts` are provided below.
- **Pre-existing Legacy Test Failures**: Whole-repo Vitest (`npx vitest run`) has 19 legacy failures in completely unrelated subsystems (character vertex limits, road mesh generation, outdated save migration fixtures from early development). All M1 and M2 HUD/inspector tests pass cleanly (158+ tests).

---

## 4. Conclusion & Concrete Remediation Strategy

The worker agent should execute the following surgical changes:

### 4.1 Fix `tests/unit/adversarial_m2_inspectors.test.ts`

#### Diff 1: Clean up unused imports (lines 6–35)
```diff
--- a/tests/unit/adversarial_m2_inspectors.test.ts
+++ b/tests/unit/adversarial_m2_inspectors.test.ts
@@ -6,14 +6,7 @@ import { renderToString } from "react-dom/server";
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
@@ -25,9 +18,7 @@ import { MaritimeVesselConsole } from "../../src/ui/components/MaritimeVesselCon
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
```

#### Diff 2: Fix `PlacedCropState` mock typings (lines 268–280 and 293–307)
```diff
@@ -268,13 +259,15 @@ describe("Adversarial M2 Inspector, HUD & Telemetry Stress Suite", () => {
         const mockCrops: PlacedCropState[] = Array.from({ length: count }, (_, i) => ({
           id: `crop_${i}`,
           cropId: i % 2 === 0 ? "crop.turnip" : "crop.carrot",
           stage: "growing",
           farmId: "farm_1",
           x: i * 2,
           z: i * 2,
           rotationRadians: 0,
           effectiveGrowthMinutes: 15,
           moisture: 0.5,
-          plantedAtMinute: 0,
-          lastTendedMinute: 0
+          health: 100,
+          averageMoistureAccum: 50,
+          moistureSampleCount: 1,
+          plantedAtMinute: 0,
+          lastUpdatedMinute: 0
         }));
@@ -293,13 +286,15 @@ describe("Adversarial M2 Inspector, HUD & Telemetry Stress Suite", () => {
       const mockCrops: PlacedCropState[] = [
         {
           id: "crop_a",
           cropId: "crop.wheat",
           stage: "mature",
           farmId: "farm_home",
           x: 10,
           z: 20,
           rotationRadians: 1.57,
           effectiveGrowthMinutes: 40,
           moisture: 0.3,
-          plantedAtMinute: 0,
-          lastTendedMinute: 0
+          health: 100,
+          averageMoistureAccum: 30,
+          moistureSampleCount: 1,
+          plantedAtMinute: 0,
+          lastUpdatedMinute: 0
         }
       ];
```

---

### 4.2 Fix or Remove `tests/unit/challenger_m2_empirical_audit.test.ts`

**Recommended Action**: Remove `tests/unit/challenger_m2_empirical_audit.test.ts`:
```bash
rm tests/unit/challenger_m2_empirical_audit.test.ts
```
*Rationale*: It is an uncommitted scratch file created by challenger 2 that duplicates assertions already present in `mmo_inspectors_m2.test.ts` and `adversarial_m2_inspectors.test.ts`.

*Alternative Action (if retained)*:
1. Remove unused imports (`CatchSummaryToast`, `inferHintCategory`, `resolveMaritimeHazard`, `calculateAllometricLengthCm`, `qualityToStars`, `MaritimeHazardDto`).
2. Remove unused `onDismiss` parameter at line 349.
3. Cast mock inspection objects: `as unknown as CropInspectionDto` at lines 134, 183, and 403.
4. Add `seaWarning: null` to `WorldHudBoatDto` mock at line 243.
5. In line 289, change `boatId: "boat.1"` to `containerId: "boat.1"`.
6. In line 503, remove `totalCargoSlots: 2`.
7. In lines 524, 531, 538, add `expiresMs: 5000` to `Notice` objects.

---

### 4.3 Fix Domain Entity Fidelity in `tests/unit/mmo_inspectors_m2.test.ts`

Replace unregistered `"fish.salmon"` / `"Atlantic Salmon"` with canonical `"fish.trout"` / `"Rainbow Trout"`:

```diff
--- a/tests/unit/mmo_inspectors_m2.test.ts
+++ b/tests/unit/mmo_inspectors_m2.test.ts
@@ -298,17 +298,19 @@ describe("F3.3 Trophy Catch Inspection Modal & Toast Presentation (Milestone M2)
       it("constructs TrophyCatchDto from landed fish cargo state", () => {
         const cargo: FishCargoState = {
           id: "cargo.test.1",
-          speciesId: "fish.salmon",
+          speciesId: "fish.trout",
           weightKg: 4.5,
           quality: "exceptional",
           caughtAtMinute: 480,
           freshness: 95,
-          cargoClass: "medium",
+          cargoClass: "small",
           location: { type: "boat-hold", containerId: "boat.1" }
         };
         const dto = buildTrophyCatchDto(cargo, "weight");
         expect(dto.cargoId).toBe("cargo.test.1");
-        expect(dto.speciesId).toBe("fish.salmon");
+        expect(dto.speciesId).toBe("fish.trout");
+        expect(dto.speciesName).toBe("Rainbow Trout");
+        expect(dto.estimatedMarketValue).toBeGreaterThan(10);
         expect(dto.weightKg).toBe(4.5);
         expect(dto.quality).toBe("exceptional");
         expect(dto.qualityStars).toBe(3);
@@ -320,11 +322,11 @@ describe("F3.3 Trophy Catch Inspection Modal & Toast Presentation (Milestone M2)
 
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
-        cargoClass: "medium",
-        habitats: ["coastal", "river"],
+        cargoClass: "small",
+        habitats: ["river", "lake"],
         storageDestination: "boat-hold",
         storageLocationLabel: "Stowed in boat hold",
         record: "weight"
       };
@@ -350,7 +352,7 @@ describe("F3.3 Trophy Catch Inspection Modal & Toast Presentation (Milestone M2)
         expect(html).toContain('data-testid="catch-inspection-modal"');
         expect(html).toContain("Trophy Catch Landed!");
         expect(html).toContain("COASTAL SPORT ANGLING");
-        expect(html).toContain("Atlantic Salmon");
+        expect(html).toContain("Rainbow Trout");
 
         // Personal record banner
         expect(html).toContain("catch-record-banner record-weight");
@@ -655,9 +657,9 @@ describe("F5.1 & F5.2 Maritime Vessel Console & Cargo Hold Grid (Milestone M2)",
         {
           slotNumber: 1,
           cargo: {
-            cargoId: "fish.salmon.1",
-            name: "Atlantic Salmon",
-            speciesId: "fish.salmon",
+            cargoId: "fish.trout.1",
+            name: "Rainbow Trout",
+            speciesId: "fish.trout",
             weightKg: 5.2,
             quality: "exceptional",
             freshnessPercent: 92,
@@ -758,7 +760,7 @@ describe("F5.1 & F5.2 Maritime Vessel Console & Cargo Hold Grid (Milestone M2)",
       expect(html).toContain("boat-cargo-grid");
       expect(html).toContain("2/5"); // Occupied slots
 
-      // Internal hold bay (slot 1) with stowed salmon
+      // Internal hold bay (slot 1) with stowed trout
       expect(html).toContain("is-hold");
       expect(html).toContain("5.2kg");
       expect(html).toContain("freshness-fresh");
```

---

### 4.4 Fix CSS Specificity in `src/ui/coastal.css`

Scope docked layout properties using `:not([data-projected="true"])` so inline 3D projection styles are not overridden by `!important`:

```diff
--- a/src/ui/coastal.css
+++ b/src/ui/coastal.css
@@ -2768,11 +2768,7 @@
   color: var(--coast-cream-muted) !important;
 }
 
-#ui-container .crop-inspection {
-  top: 50% !important;
-  right: var(--ui-safe-right) !important;
-  left: auto !important;
+#ui-container .crop-inspection {
   width: min(340px, calc(100vw - 28px)) !important;
   padding: 10px 11px !important;
   color: var(--coast-cream) !important;
@@ -2781,7 +2777,13 @@
     rgba(8, 29, 37, 0.91) !important;
   border: 1px solid rgba(232, 215, 181, 0.22) !important;
   border-left: 2px solid var(--coast-ochre) !important;
   border-radius: 1px !important;
-  transform: translateY(-50%) !important;
   box-shadow: var(--coast-shadow-soft) !important;
 }
 
+#ui-container .crop-inspection:not([data-projected="true"]) {
+  top: 50% !important;
+  right: var(--ui-safe-right) !important;
+  left: auto !important;
+  transform: translateY(-50%) !important;
+}
```

---

## 5. Verification Method

Once the worker agent applies the diffs, independent verification is performed with:

```bash
# 1. Verify TypeScript compiles with ZERO errors:
npm run typecheck

# 2. Verify production bundle build succeeds:
npm run build

# 3. Verify all M2 test suites pass with registered species:
npx vitest run tests/unit/mmo_inspectors_m2.test.ts tests/unit/adversarial_m2_inspectors.test.ts

# 4. Verify all HUD and regression suites pass:
npx vitest run tests/unit/adversarial_m2_hud.test.ts tests/unit/empirical_m2_hud.test.ts tests/unit/hud_m1.test.ts
```

### Invalidation Conditions
- Any TypeScript error under `npm run typecheck` or `npm run build`.
- `calculateFishPrice` not called during trophy catch DTO building.
- Crop inspection card coordinates overridden when `data-projected="true"`.
