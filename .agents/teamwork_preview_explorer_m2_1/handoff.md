# Handoff Report — Milestone M2: F3.1 Crop Inspection Card & F3.2 Farm GIS Legend / Soil Overlay

**Explorer Agent**: `teamwork_preview_explorer_m2_1`  
**Parent Agent**: `orchestrator_4` (`6ec9cade-1e48-47ab-a126-866fd7c1f1f4`)  
**Date**: 2026-09-04  
**Scope**: F3.1 In-World Crop Inspection Card (`CropInspection.tsx`) and F3.2 Farm GIS Legend & Soil Overlay (`FarmGISLegend.tsx`)  

---

## 1. Observation

### F3.1: In-World Crop Inspection Card (`CropInspection.tsx`)

1. **Inline Implementation & Static Screen Docking**:
   - In `src/ui/GameUI.tsx` (lines 622–689), `CropInspection` is implemented as an internal component:
     ```tsx
     export const CropInspection: React.FC<{
       inspection: CropInspectionDto;
       onClose?: () => void;
     }> = ({ inspection, onClose }) => {
       const moistureTone =
         inspection.moisture.band === "wet"
           ? "wet"
           : inspection.moisture.band === "normal"
             ? "ideal"
             : "dry";
       return (
         <GameSheet
           family="ink"
           as="section"
           className="crop-inspection interactive"
           ...
     ```
   - In `src/ui/overlays.css` (lines 75–87) and `src/ui/coastal.css` (line 2771), the CSS positions `.crop-inspection` statically at the screen edge:
     ```css
     #ui-container .crop-inspection {
       position: absolute;
       top: 50%;
       right: var(--ui-safe-right);
       bottom: auto !important;
       left: auto;
       z-index: 30;
       width: min(300px, calc(100vw - 24px));
       transform: translateY(-50%);
     }
     ```
   - It is NOT an isolated component in `src/ui/components/CropInspection.tsx` (violating `PROJECT.md` code layout), and lacks in-world 3D world-to-screen coordinate positioning.

2. **Triggering & Lifecycle in `GameApp.ts`**:
   - **Raycast Pick & Interaction Trigger**:
     In `src/app/GameApp.ts` (lines 1364–1368 & 3354–3363):
     ```ts
     case "use-secondary":
       if (this.activeModal) return;
       if (this.mode === "farm-placement") this.exitCropPlacement();
       else if (this.mode === "on-foot") this.inspectPointedCrop();
       break;
     ```
     `this.inspectPointedCrop()` retrieves pointer NDC from `this.inputRouter.getInputState().pointerNdc`, calls `this.worldScene.pickCrop(this.gameCamera.camera, pointer)`, resolves the target, and sets `this.inspectedCrop = this.sim.inspectCrop(cropId);`.
   - **Dismissal Conditions**:
     - Moving > 6m away (`src/app/GameApp.ts` lines 2704–2707):
       ```ts
       const world = farmLocalToWorld(placed.farmId, placed);
       const dx = this.sim.state.player.x - world.x;
       const dz = this.sim.state.player.z - world.z;
       if (dx * dx + dz * dz > 36) {
         this.inspectedCrop = null;
       }
       ```
     - Escape key press (`pause` action, line 1371): closes inspection.
     - Crop harvest / removal (line 2701): if placed crop no longer exists in `state.crops`.
     - Close button click: calls `onDismissCropInspection()` (line 4004).
   - **Watering Refresh**:
     In `src/app/GameApp.ts` (line 3594):
     `this.inspectedCrop = action === "water" ? this.sim.inspectCrop(placedCropId) : null;`
     Watering refreshes the inspection card with updated moisture state, while harvesting clears it.

3. **Screen Projection & Viewport Clamping**:
   - In `src/app/GameApp.ts` (lines 3026–3036), projection exists on the debug/acceptance harness:
     ```ts
     projectWorldPoint: (x, z) => {
       const canvas = this.worldScene.renderer.domElement;
       const bounds = canvas.getBoundingClientRect();
       const projected = new THREE.Vector3(x, WorldLayout.terrainHeight(x, z), z)
         .project(this.gameCamera.camera);
       return {
         x: bounds.left + ((projected.x + 1) * 0.5) * bounds.width,
         y: bounds.top + ((1 - projected.y) * 0.5) * bounds.height,
         visible: projected.z >= -1 && projected.z <= 1
       };
     }
     ```
   - However, `this.inspectedCrop` passed into `GameUI` does NOT pass screen coordinates, so `CropInspection` cannot anchor to the crop in 3D.
   - `WorldLayout.terrainHeight(world.x, world.z)` gives the exact ground height, and `farmLocalToWorld(placed.farmId, placed)` in `src/world/FarmLayout.ts` (line 318) gives the world `{x, z}` coordinates.

4. **Display Elements in `CropInspectionDto` (`src/simulation/core/contracts.ts`, lines 583–614)**:
   - `cropId`: string (mapped to sprite via `atlasForCrop(inspection.cropId) ?? atlasForGrowth(inspection.stage)`)
   - `name`: string
   - `stage`: `CropStage` ("seeded" | "sprout" | "growing" | "mature" | "overripe" | "withered")
   - `approximateMinutesRemaining`: number | null
   - `stageTimingLabel`: string (e.g. "Ready in about 40 minutes")
   - `moisture`: `{ value: number; band: CropMoistureBand }` ("dry" | "normal" | "wet")
   - `climate`: `{ current: ClimateId; preferred: readonly ClimateId[]; status: CropClimateStatus }`
   - `soil`: `{ fertility: number; band: SoilFertilityBand }` ("low" | "fair" | "good")
   - `work`: `WorkCostQuote & { current: number }`
   - `immediateAction`: `{ kind: "water" | "harvest" | "none"; label: string; cost: number | null; available: boolean; blockerReason?: string }`
   - `actions`: `{ canWater: boolean; canHarvest: boolean; waterReason?: string; harvestReason?: string }`

---

### F3.2: Farm GIS Legend & Soil Overlay (`FarmGISLegend.tsx`)

1. **`[Alt]` Hold Handling in `InputRouter.ts`**:
   - In `src/input/InputRouter.ts` (line 115):
     ```ts
     farmGisHeld: hasAny(keys, "AltLeft", "AltRight")
     ```
   - When `worldInputSuspended` is true (e.g. modal active), line 265 returns `deriveSemanticInput(EMPTY_KEYS, ...)` so `farmGisHeld` is safely suppressed.
   - In `src/app/GameApp.ts` (lines 4237–4248):
     ```ts
     private syncFarmGisHold(): void {
       const held = this.inputRouter.getInputState().farmGisHeld;
       if (held === this.isFarmGisHeld) return;
       this.isFarmGisHeld = held;
       this.worldScene.setFarmGisMode(held);
     }
     ```
   - `syncFarmGisHold()` is executed every frame in `GameApp.render()` (line 1679).
   - In `src/app/GameApp.ts` (line 4043), `isFarmGisHeld: this.isFarmGisHeld` is passed to `GameUI`.
   - In `src/ui/GameUI.tsx` (line 385):
     `<FarmGISLegend visible={mode !== "sport-fishing" && isFarmGisHeld} />`

2. **In-World Soil Mesh Tinting Defect (`WorldScene.ts` & `CropInstanceRenderer.ts`)**:
   - In `src/render/scene/WorldScene.ts` (lines 735–743):
     ```ts
     private isFarmGisMode: boolean = false;
     public setFarmGisMode(active: boolean): void {
       this.isFarmGisMode = active;
     }
     public getFarmGisMode(): boolean {
       return this.isFarmGisMode;
     }
     ```
     `isFarmGisMode` is stored in `WorldScene`, but NEVER passed to any renderer!
   - In `src/render/scene/WorldScene.ts` (line 4089):
     ```ts
     this.cropInstances.sync(state, timeSeconds, this.weatherMotion);
     ```
     Notice `isFarmGisMode` is omitted from `sync()`.
   - In `src/render/scene/CropInstanceRenderer.ts` (lines 244–257):
     `moistureMesh` is an `InstancedMesh` with geometry `makeDisturbedSoilGeometry()`.
     In `updateMoistureBatch()` (lines 548–553):
     ```ts
     const band = cropMoistureBand(crop.moisture);
     this.color.set(
       PALETTE_HEX[band === "wet" ? "soil_damp_01" : band === "dry" ? "soil_dry_01" : "soil_warm_01"]
     );
     batch.mesh.setColorAt(index, this.color);
     ```
     It only colors soil by default moisture palette tokens, completely ignoring GIS mode and soil fertility.
   - In `CropInstanceRenderer.ts` (line 458): `computeCropSignature()` does not hash `isFarmGisMode`. Therefore, when `[Alt]` is held or released, `sync()` does not detect any change and exits without updating the mesh colors.

3. **Farm GIS Legend Widget (`src/ui/components/FarmGISLegend.tsx`)**:
   - In `src/ui/components/FarmGISLegend.tsx` (lines 20–41), the component renders 5 generic items:
     - `UI_GIS.moist` -> "Good moisture"
     - `UI_GIS.dry` -> "Dry soil"
     - `UI_GIS.harvestReady` -> "Ready to harvest"
     - `UI_GIS.growing` -> "Growing"
     - `UI_GIS.prepared` -> "Prepared soil"
   - Missing: Nitrogen/compost fertility levels (`SoilFertilityBand`: "low" | "fair" | "good", or Rich / Balanced / Depleted) and explicit moisture tiers (Saturated / Ideal / Dry).

4. **Existing Unit Tests**:
   - `tests/unit/empirical_m5_overlays.test.ts` (lines 242–256):
     ```ts
     it("renders the farm GIS legend and crop inspection plaque", () => {
       const gis = renderToString(React.createElement(FarmGISLegend, { visible: true }));
       expect(gis).toContain('data-testid="farm-gis-legend"');
       expect(gis).toContain("Field signs");
       expect(gis).toContain("Good moisture");
       expect(gis).toContain("Ready to harvest");

       const crop = renderToString(
         React.createElement(CropInspection, { inspection: cropInspection, onClose: () => {} })
       );
       expect(crop).toContain('data-testid="crop-inspection"');
       expect(crop).toContain("Wheat");
       expect(crop).toContain("Moisture");
       expect(crop).toContain("Water crop");
     });
     ```
   - `tests/e2e/p12VerticalSlice.spec.ts` (lines 535–544):
     Tests dismissing `getByTestId("crop-inspection")` by clicking `getByRole("button", { name: "Close crop inspection" })`.

---

## 2. Logic Chain

1. **Extraction of `CropInspection.tsx`**:
   - *Premise*: Following the project layout in `PROJECT.md` (Code Layout line 76), `CropInspection` must reside in `src/ui/components/CropInspection.tsx`.
   - *Inference*: Extracting `CropInspection` from `src/ui/GameUI.tsx` to `src/ui/components/CropInspection.tsx` and re-exporting it from `GameUI.tsx` ensures modularity while maintaining 100% backward compatibility for all existing imports and tests.

2. **Projection & Clamping Protocol**:
   - *Premise*: `CropInspection` should appear anchored in-world near the inspected crop, yet stay readable and contained within the browser viewport.
   - *Inference*:
     - When `inspectedCrop` is non-null, `placed = state.crops[placedCropId]` gives the crop's local coordinates.
     - `farmLocalToWorld(placed.farmId, placed)` computes world `{x, z}`, and `WorldLayout.terrainHeight(x, z) + 0.35` provides ground elevation.
     - In `GameApp.ts`, projecting with `camera.project(new THREE.Vector3(x, y + 0.5, z))` gives Normalized Device Coordinates (NDC) `v`.
     - *Depth validation*: If `v.z > 1` (behind the camera) or outside frustum bounds, screen projection is invalid; the component falls back to the safe docked position (`right: var(--ui-safe-right); top: 50%`).
     - *Viewport clamping*: For valid projection, calculate pixel coords:
       `screenX = bounds.left + ((v.x + 1) * 0.5) * bounds.width;`
       `screenY = bounds.top + ((1 - v.y) * 0.5) * bounds.height;`
       Clamp with a 16px safe margin:
       `clampedX = Math.max(16, Math.min(window.innerWidth - cardWidth - 16, screenX));`
       `clampedY = Math.max(16, Math.min(window.innerHeight - cardHeight - 16, screenY));`
     - Provide `projectedPosition?: { x: number; y: number; visible: boolean } | null` to `CropInspection`. If null, fall back to static CSS docking.

3. **In-World Soil Mesh Tinting under GIS Mode**:
   - *Premise*: When `[Alt]` is held, the player expects an immediate visual GIS overlay on all farm soil plots indicating moisture and fertility.
   - *Inference*:
     - In `WorldScene.ts`, pass `isFarmGisMode` into `this.cropInstances.sync(state, timeSeconds, this.weatherMotion, this.isFarmGisMode)`.
     - In `CropInstanceRenderer.ts`:
       - Include `isFarmGisMode` in `computeCropSignature()` so toggling `[Alt]` invalidates the signature and forces a batch update.
       - In `updateMoistureBatch(crops, isFarmGisMode)`:
         - When `isFarmGisMode === false`: keep natural soil palette (`soil_dry_01`, `soil_warm_01`, `soil_damp_01`).
         - When `isFarmGisMode === true`:
           - Look up crop moisture band (`cropMoistureBand(crop.moisture)`: "dry" | "normal" | "wet").
           - Look up farm soil fertility (`state.farms[crop.farmId]?.soil.fertility ?? 50`, band: "low" | "fair" | "good").
           - Modulate instance color using canonical palette tokens:
             - Moisture base:
               - "wet": `PALETTE_HEX.accent_teal_01` (#3F8D8C) / `soil_damp_01` (#5E4937)
               - "normal" / "ideal": `PALETTE_HEX.foliage_sage_01` (#8E9E54) / `soil_warm_01` (#775333)
               - "dry": `PALETTE_HEX.accent_ochre_01` (#D59B45) / `soil_dry_01` (#A17445)
             - Fertility modifier:
               - High fertility (>= 80 / "good"): modulate with golden highlight (`PALETTE_HEX.stone_golden_01` / `foliage_highlight_01`).
               - Low fertility (< 30 / "low"): desaturate/pale tint (`PALETTE_HEX.stone_cool_01`).
           - Set instance color and trigger `batch.mesh.instanceColor.needsUpdate = true`.

4. **Enhancing `FarmGISLegend.tsx`**:
   - *Premise*: F3.2 requires the HUD legend to show moisture levels and nitrogen/compost fertility.
   - *Inference*:
     - Keep existing test strings intact (`"Field signs"`, `"Good moisture"`, `"Ready to harvest"`, and `data-testid="farm-gis-legend"`).
     - Group items into clear sections:
       - **Soil Moisture**:
         - Good moisture / Ideal (`UI_GIS.moist`)
         - Dry soil / Thirsty (`UI_GIS.dry`)
         - Saturated / Heavy damp (`UI_GIS.prepared`)
       - **Soil Fertility & Compost**:
         - Rich fertility / Fertilized (`>= 80`, +10% growth rate)
         - Fair fertility / Balanced (`30–79`, baseline growth rate)
         - Low fertility / Depleted (`< 30`, -20% growth rate — apply compost/fertilizer)
       - **Growth Status**:
         - Ready to harvest (`UI_GIS.harvestReady`)
         - Growing (`UI_GIS.growing`)

---

## 3. Caveats

1. **Pure Presentation vs. Simulation Ownership**:
   - Screen coordinates and camera projection are 100% presentation concerns. No projection math or Three.js objects should ever enter `src/simulation/`.
   - `CropInspectionDto` remains a pure simulation contract. Screen coordinates should be passed as optional presentation props (e.g. `projectedPosition?: { x: number; y: number; visible: boolean }`) at the UI / `GameApp` layer.
2. **SSR / Vitest Compatibility**:
   - In server-side rendering or Vitest headless tests (`renderToString`), `window.innerWidth`, `window.innerHeight`, and canvas bounds may be undefined or mock values.
   - `CropInspection.tsx` and clamping math must gracefully default when running in environments without a DOM / canvas bounding box (falling back to static CSS positioning).
3. **Palette Token Constraint**:
   - Neva Project Rules forbid arbitrary RGB/HEX colors in 3D rendering. All GIS mesh colors MUST map to canonical tokens in `art/palettes/neva.palette.json` (`PALETTE_HEX`).

---

## 4. Conclusion

The existing codebase already possesses the underlying simulation DTOs (`CropInspectionDto`, `SoilState`, `cropMoistureBand`, `soilFertilityBand`), input routing (`farmGisHeld`), and instanced mesh infrastructure (`CropInstanceRenderer.moistureBatch`).

To achieve full Milestone M2 compliance for F3.1 and F3.2:
1. **F3.1**:
   - Extract `CropInspection.tsx` into `src/ui/components/CropInspection.tsx` and re-export from `GameUI.tsx`.
   - Wire in-world 3D camera projection from `GameApp.ts` with safe margin viewport clamping (`16px <= x <= innerWidth - width - 16px`, `16px <= y <= innerHeight - height - 16px`), with fallback to static CSS docking when off-screen or behind the camera.
   - Maintain all display elements: crop icon, name, stage chip, countdown label, moisture band (`wet`/`ideal`/`dry`), immediate next action, Work cost, and close button.
2. **F3.2**:
   - Wire `isFarmGisMode` from `WorldScene.ts` into `CropInstanceRenderer.sync()`.
   - Incorporate `isFarmGisMode` into `computeCropSignature()` to ensure immediate batch invalidation on `[Alt]` press.
   - Update `updateMoistureBatch()` to modulate soil instance colors according to both moisture band and farm fertility using canonical palette tokens.
   - Expand `FarmGISLegend.tsx` to display both moisture tiers and nitrogen/compost fertility bands while preserving all existing test selectors and labels.

---

## 5. Verification Method

### Test Suite Execution
Run Vitest on existing overlay tests and the proposed M2 suite:
```bash
npm test tests/unit/empirical_m5_overlays.test.ts
npm run typecheck
```

### Proposed New Test Suite: `tests/unit/adversarial_m2_inspectors_overlays.test.ts`
Implement tests verifying:
1. `CropInspection.tsx`:
   - Renders with valid `CropInspectionDto` without crashing.
   - Displays icon, crop name, stage chip, countdown label, moisture badge (`wet`/`ideal`/`dry`), next action, and Work cost.
   - Applies projected inline coordinates when `projectedPosition` is provided and in-bounds.
   - Falls back to default CSS docking when `projectedPosition` is null or `visible: false`.
   - Clamping bounds assertion: coordinates never exceed viewport boundaries minus card dimensions and safe margins (16px).
   - Closes on Escape key press and Close button click.
2. `FarmGISLegend.tsx`:
   - Renders when `visible: true`, returns null when `visible: false`.
   - Contains `data-testid="farm-gis-legend"`, `"Field signs"`, `"Good moisture"`, `"Ready to harvest"`.
   - Contains fertility indicators (Rich, Fair, Low / Depleted).
3. Soil Mesh Tinting & `[Alt]` Input:
   - `InputRouter` derives `farmGisHeld: true` on `AltLeft`/`AltRight` keydown, and `false` when `worldInputSuspended: true`.
   - `CropInstanceRenderer` updates `moistureBatch` colors when `isFarmGisMode` transitions between `true` and `false`.
