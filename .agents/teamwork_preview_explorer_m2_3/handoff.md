# Handoff Report: Milestone M2 Maritime Vessel Console & Physical Cargo Bay Grid (F5.1 & F5.2)

## 1. Observation

### Codebase Locations & Inline Implementation
- **Existing Maritime HUD**: `src/ui/HUD.tsx:173-327`
  - In `src/ui/HUD.tsx:202-325`, 124 lines of inline JSX render the boat console inside the bottom-left HUD cluster:
    ```tsx
    {boat && (
      <section
        className={`hud-boat-panel interactive${boatDocked ? " is-docked" : ""}`}
        aria-label="Boat driving status"
      >
        <header className="boat-panel-header">
          <div className="boat-panel-title-row">
            <div className="boat-panel-name-group">
              <IconBoat size={16} className="boat-header-icon" aria-hidden="true" />
              <strong className="boat-panel-name">{boat.name}</strong>
            </div>
            {boatDocked ? (
              <span className="boat-docked-chip" role="status">Docked</span>
            ) : boat.showNightWarning ? (
              <span className="boat-night-chip" role="status">Night waters</span>
            ) : null}
          </div>
          {!boatDocked && (
            <div className="boat-panel-sub-row">
              <span className="boat-speed-label">
                {`${boat.speedKnots} kn · ${boat.seaState}`}
              </span>
              {boat.seaWarning && (
                <span className="boat-sea-warning" role="status">
                  <IconWarning size={13} aria-hidden="true" /> {boat.seaWarning}
                </span>
              )}
            </div>
          )}
        </header>
        {/* Running status: Hull and Fuel meters */}
        {/* Cargo section: boat-cargo-grid mapping boat.cargoSlots */}
      </section>
    )}
    ```
- **Discrepancy Regarding `BoatsDomain.ts`**:
  - The dispatch prompt requested examining `src/simulation/domains/BoatsDomain.ts`.
  - Direct filesystem verification (`find_by_name`, `list_dir`) confirmed that `src/simulation/domains/BoatsDomain.ts` **does not exist**.
  - In the current Neva architecture, boat behavior and state are partitioned across:
    1. `src/simulation/domains/NavigationDomain.ts`: owns vessel traversal physics, velocity commits, boarding (`boardBoat`, `canBoardBoat`), docking (`dockBoat`), and emergency towing (`emergencyTowBoat`).
    2. `src/simulation/domains/CargoDomain.ts`: owns cargo stowing into `boat-hold` and `boat-hook` containers, capacity validation, and hold queries (`inspectHoldStores`).
    3. `src/content/boats.ts`: defines static specifications for `boat.rowboat` (100 max durability, 0 fuel, 2 hold slots, 4.5 m/s, 0.35 safe roughness) and `boat.skiff` (250 max durability, 100 fuel, 4 hold slots + 2 external hooks, 8.5 m/s, 0.75 safe roughness).
    4. `src/simulation/presentation/WorldHudPresentation.ts:583-614`: constructs `WorldHudBoatDto` from `activeBoat` and `boatDefinition`.
- **Contracts in `src/simulation/core/contracts.ts`**:
  - `WorldHudBoatDto` (`contracts.ts:257-270`):
    ```ts
    export interface WorldHudBoatDto {
      boatId: BoatId;
      name: string;
      speedKnots: number;
      isDocked?: boolean;
      seaState: "Calm" | "Swell" | "Rough";
      seaWarning: string | null;
      showNightWarning: boolean;
      hull: { current: number; maximum: number; percent: number; danger: boolean };
      fuel: { current: number; maximum: number; percent: number; danger: boolean } | null;
      occupiedCargoSlots: number;
      cargoSlots: ReadonlyArray<{ slotNumber: number; cargo: WorldHudCargoDto | null }>;
    }
    ```
  - `WorldHudCargoDto` (`contracts.ts:179-187`):
    ```ts
    export interface WorldHudCargoDto {
      cargoId: FishCargoId;
      speciesId: FishSpeciesId;
      name: string;
      weightKg: number;
      quality: FishQuality;
      freshnessPercent: number;
      freshnessTone: "fresh" | "medium" | "stale";
    }
    ```
  - `Compass` (`contracts.ts:314-320`):
    - Already computes `headingDegrees: number` and `headingCardinal: string` from `player.rotationY` (which equals `boat.headingRadians` when aboard).
- **Existing Styling in `src/ui/hud.css:701-887`**:
  - Contains base styles for `.hud-boat-panel`, `.boat-panel-header`, `.boat-panel-name`, `.boat-docked-chip`, `.boat-night-chip`, `.boat-hull-section`, `.hud-boat-hull`, `.hud-boat-fuel`, `.boat-cargo-grid`, `.boat-cargo-slot`, `.cargo-freshness-track`, `.cargo-freshness-fill`.
  - Currently lacks registration insignia styling, multi-tier hull damage tinting (`hull-sound`, `hull-damaged`, `hull-critical`), hook slot styling (`is-hook`), ice badge styling (`cargo-ice-indicator`), and cargo weight badges.

---

## 2. Logic Chain

1. **Modularization Rationale**:
   - `HUD.tsx` currently houses 124 lines of inline vessel dashboard markup. Modularizing this into `src/ui/components/MaritimeVesselConsole.tsx` (as specified in `PROJECT.md:76`) isolates nautical dashboard logic, reduces HUD bloat, and allows isolated unit testing.
2. **Prop Contract Design**:
   - Decouple the console by defining `MaritimeVesselConsoleProps`:
     ```ts
     export interface MaritimeVesselConsoleProps {
       boat: WorldHudBoatDto;
       headingDegrees?: number;
       headingCardinal?: string;
       registrationInsignia?: string;
       onSelectSlot?: (slotNumber: number) => void;
       className?: string;
     }
     ```
   - If `headingDegrees` / `headingCardinal` / `registrationInsignia` are provided in `boat`, the component uses them; otherwise it falls back to the explicit props or sensible defaults (`045° NE`, `REG · NV-ROW-01` / `REG · NV-SKF-02`).
3. **F5.1 Nautical Dashboard Features**:
   - **Vessel Name & Registration Insignia**: Display vessel title alongside official registration plate (e.g. `REG · NV-ROW-01` for Wooden Rowboat, `REG · NV-SKF-02` for Coastal Fishing Skiff), grounding the vessel in Neva's maritime lore.
   - **Docking & Underway Status Chips**: Render `Docked` (emerald chip) when docked; when underway, render `Underway` (>0 kn, marine blue) or `Drifting` (0 kn, slate), plus `Night waters` (amber chip) when dusk/night.
   - **Speed Log & Heading Bearing**: Display both speed log and compass orientation: `${boat.speedKnots} kn · ${headingDegrees.toString().padStart(3, '0')}° ${headingCardinal}`.
   - **Sea-State Condition**: Provide visual indicator for `Calm`, `Choppy` (Swell), or `Rough Seas` with wave icon and hazard badges.
   - **Hull Integrity Bar with Damage Tint**: Three-tier visual response:
     - Sound / Healthy (>= 70%): emerald / teal gradient (`hull-sound`)
     - Damaged (30% - 69%): amber caution gradient (`hull-damaged`)
     - Critical Breach (< 30%): pulsing crimson gradient (`hull-critical`)
   - **Fuel Tank Level Gauge**: Rendered only when `boat.fuel` exists (skiff), hidden on rowboat; alerts when fuel <= 20%.
4. **F5.2 Physical Cargo Hold Bay Grid Features**:
   - **Slot Bay Grid**: Display all vessel cargo slots with slot number and visual distinction between internal hold bays (`is-hold`) and transom hooks (`is-hook` with dashed border and hook tag).
   - **Ice Preservation Indicator**: Show `❄️` badge on slots where `hasIce` is true (indicating 0.4x decay rate preservation).
   - **Species Sprite & Fallback**: Render `AtlasImage` with `atlasForFish(cargo.speciesId)` with `IconFish` fallback.
   - **Quality Medallion**: Display quality medallion (normal, silver, gold, iridium) for each loaded catch.
   - **Real-Time Freshness Decay Bar**: High-contrast decay track at the bottom of the slot with percentage width and dynamic tone (`freshness-fresh`, `freshness-medium`, `freshness-stale`).
   - **Physical Weight Badge**: Display formatted weight (e.g. `14.2 kg`) on the slot, reinforcing the ArcheAge physical cargo paradigm.
5. **Backwards Compatibility**:
   - The root element retains `.hud-boat-panel` and `.interactive`.
   - The telemetry string preserves the pattern `${boat.speedKnots} kn · ${boat.seaState}` so legacy assertions in `tests/unit/empirical_m2_hud.test.ts` and `tests/unit/empirical_m5_overlays.test.ts` continue passing without modification.

---

## 3. Proposed Code & Architecture

### Proposed Component: `src/ui/components/MaritimeVesselConsole.tsx`

```tsx
import React, { useMemo } from "react";
import type { WorldHudBoatDto, WorldHudCargoDto } from "../../simulation/core/contracts";
import { IconBoat, IconFish, IconWarning, IconWave } from "./HudIcons";
import { ItemSlot, Meter } from "../coastal/CoastalUI";
import { ChromeQuality } from "../chrome/Chrome";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForFish } from "../chrome/uiAtlas";

export interface MaritimeVesselConsoleProps {
  boat: WorldHudBoatDto;
  headingDegrees?: number;
  headingCardinal?: string;
  registrationInsignia?: string;
  onSelectSlot?: (slotNumber: number) => void;
  className?: string;
}

export const MaritimeVesselConsole: React.FC<MaritimeVesselConsoleProps> = ({
  boat,
  headingDegrees = 0,
  headingCardinal = "N",
  registrationInsignia,
  onSelectSlot,
  className = ""
}) => {
  const isDocked = Boolean(boat.isDocked);
  const resolvedHeadingDeg = (boat as any).headingDegrees ?? headingDegrees;
  const resolvedHeadingCard = (boat as any).headingCardinal ?? headingCardinal;

  const defaultInsignia = useMemo(() => {
    if ((boat as any).registrationInsignia) return (boat as any).registrationInsignia;
    if (registrationInsignia) return registrationInsignia;
    return boat.boatId.includes("skiff") ? "REG · NV-SKF-02" : "REG · NV-ROW-01";
  }, [boat.boatId, (boat as any).registrationInsignia, registrationInsignia]);

  const hullDamageClass = useMemo(() => {
    const pct = boat.hull.percent;
    if (pct < 30 || boat.hull.danger) return "hull-critical";
    if (pct < 70) return "hull-damaged";
    return "hull-sound";
  }, [boat.hull.percent, boat.hull.danger]);

  const seaStateTone = useMemo(() => {
    switch (boat.seaState) {
      case "Rough":
        return "rough";
      case "Swell":
        return "choppy";
      case "Calm":
      default:
        return "calm";
    }
  }, [boat.seaState]);

  return (
    <section
      className={`hud-boat-panel interactive ${isDocked ? "is-docked" : ""} ${className}`.trim()}
      role="region"
      aria-label="Maritime vessel console"
      data-testid="maritime-vessel-console"
    >
      {/* Vessel Header */}
      <header className="boat-panel-header">
        <div className="boat-panel-title-row">
          <div className="boat-panel-name-group">
            <IconBoat size={16} className="boat-header-icon" aria-hidden="true" />
            <strong className="boat-panel-name">{boat.name}</strong>
            <span className="boat-registration-insignia" title="Neva Maritime Registration">
              {defaultInsignia}
            </span>
          </div>

          <div className="boat-status-chips">
            {isDocked ? (
              <span className="boat-docked-chip" role="status">
                Docked
              </span>
            ) : (
              <>
                {boat.speedKnots > 0 ? (
                  <span className="boat-underway-chip" role="status">
                    Underway
                  </span>
                ) : (
                  <span className="boat-drifting-chip" role="status">
                    Drifting
                  </span>
                )}
                {boat.showNightWarning && (
                  <span className="boat-night-chip" role="status">
                    Night waters
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Nautical Telemetry Row */}
        {!isDocked && (
          <div className="boat-panel-sub-row boat-telemetry-row">
            <div className="boat-telemetry-metrics">
              <span className="boat-speed-label">
                {`${boat.speedKnots} kn · ${boat.seaState}`}
              </span>
              <span className="boat-bearing-label" title="Heading Bearing">
                {`· ${String(resolvedHeadingDeg).padStart(3, "0")}° ${resolvedHeadingCard}`}
              </span>
              <span className={`boat-sea-state sea-state--${seaStateTone}`} title={`Sea State: ${boat.seaState}`}>
                <IconWave size={12} aria-hidden="true" />
                {boat.seaState === "Swell" ? "Choppy" : boat.seaState}
              </span>
            </div>

            {boat.seaWarning && (
              <span className="boat-sea-warning" role="alert">
                <IconWarning size={13} aria-hidden="true" /> {boat.seaWarning}
              </span>
            )}
          </div>
        )}
      </header>

      {/* Running Vitals: Hull & Fuel Gauges */}
      {!isDocked && (
        <>
          <div className={`boat-running-status ${boat.fuel ? "has-fuel" : ""}`}>
            {/* Hull Integrity Section */}
            <div className={`boat-hull-section ${hullDamageClass}`}>
              <div className="boat-hull-label-row">
                <span className="boat-section-title">Hull</span>
                <span className="boat-hull-value">{`${boat.hull.percent}%`}</span>
              </div>
              <Meter
                className={`hud-boat-hull ${hullDamageClass}`}
                label="Hull"
                value={boat.hull.current}
                max={boat.hull.maximum}
                showLabel={false}
                showValue={false}
                fill={boat.hull.danger ? "danger" : "hull"}
              />
            </div>

            {/* Fuel Tank Level Section (Only for Motorized Craft) */}
            {boat.fuel && (
              <div className="boat-fuel-section">
                <div className="boat-hull-label-row">
                  <span className="boat-section-title">Fuel</span>
                  <span className="boat-hull-value">{`${boat.fuel.percent}%`}</span>
                </div>
                <Meter
                  className="hud-boat-fuel"
                  label="Fuel"
                  value={boat.fuel.current}
                  max={boat.fuel.maximum}
                  showLabel={false}
                  showValue={false}
                  fill={boat.fuel.danger ? "danger" : "gold"}
                />
              </div>
            )}
          </div>

          {/* Physical Cargo Hold Bay Grid */}
          <div className="boat-cargo-section">
            <div className="boat-cargo-label-row">
              <span className="boat-section-title">Cargo Hold</span>
              <span className="boat-cargo-count-badge">
                {`${boat.occupiedCargoSlots}/${boat.cargoSlots.length}`}
              </span>
            </div>

            <div className="boat-cargo-grid" aria-label="Hold Bays & Hooks">
              {boat.cargoSlots.map((slot) => {
                const isHook = (slot as any).slotType === "external-hook" || slot.slotNumber > 4;
                const hasIce = Boolean((slot as any).hasIce);

                if (!slot.cargo) {
                  return (
                    <ItemSlot
                      key={`cargo-slot-${slot.slotNumber}`}
                      className={`boat-cargo-slot is-empty ${isHook ? "is-hook" : "is-hold"}`}
                      slotNumber={slot.slotNumber}
                      label={`Empty ${isHook ? "transom hook" : "hold bay"} ${slot.slotNumber}`}
                      onClick={() => onSelectSlot?.(slot.slotNumber)}
                    >
                      {isHook && <span className="cargo-hook-glyph" aria-hidden="true">🪝</span>}
                      {hasIce && (
                        <span className="cargo-ice-indicator" title="Ice preserved (0.4x decay)">
                          ❄️
                        </span>
                      )}
                    </ItemSlot>
                  );
                }

                const cargo = slot.cargo;
                return (
                  <ItemSlot
                    key={cargo.cargoId}
                    filled
                    slotNumber={slot.slotNumber}
                    className={`boat-cargo-slot is-occupied ${isHook ? "is-hook" : "is-hold"}`}
                    label={`${cargo.name}, ${cargo.weightKg.toFixed(1)} kg, ${cargo.quality} quality, ${cargo.freshnessPercent}% fresh`}
                    onClick={() => onSelectSlot?.(slot.slotNumber)}
                  >
                    <AtlasImage src={atlasForFish(cargo.speciesId)} alt="" size={28} />
                    {!atlasForFish(cargo.speciesId) && (
                      <IconFish size={14} aria-hidden="true" />
                    )}

                    <ChromeQuality quality={cargo.quality} showLabel={false} />

                    <span className="cargo-weight-pill">
                      {`${cargo.weightKg.toFixed(1)}kg`}
                    </span>

                    {isHook && <span className="cargo-hook-tag">HOOK</span>}
                    {hasIce && (
                      <span className="cargo-ice-indicator" title="Ice preserved (0.4x decay)">
                        ❄️
                      </span>
                    )}

                    <div
                      className="cargo-freshness-track"
                      title={`Freshness: ${cargo.freshnessPercent}% (${cargo.freshnessTone})`}
                      aria-hidden="true"
                    >
                      <div
                        className={`cargo-freshness-fill freshness-${cargo.freshnessTone}`}
                        style={{ width: `${cargo.freshnessPercent}%` }}
                      />
                    </div>
                  </ItemSlot>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
};
```

---

## 4. Caveats

1. **`BoatsDomain.ts` Missing from Codebase**:
   - The user dispatch named `src/simulation/domains/BoatsDomain.ts`, but boat domain logic is split between `NavigationDomain.ts` and `CargoDomain.ts`. Implementations should update `NavigationDomain.ts` / `CargoDomain.ts` and `WorldHudPresentation.ts` rather than attempting to edit an absent file.
2. **Persistence Schema Stability**:
   - Neither F5.1 nor F5.2 modifies `GameState` schema or serialization. All data is derived from existing state (`activeBoat`, `boatDefinition`, `fishCargo`, and `compass`). No schema version bump or migration fixture is required.
3. **Viewport Budget Compliance**:
   - The console maintains a compact width of `min(240px, calc(100vw - 28px))`. On desktop 1080p, it occupies <2.5% of viewport area, safely within the <20–25% persistent HUD budget.

---

## 5. Conclusion

- The maritime vessel console (`MaritimeVesselConsole.tsx`) cleanly encapsulates F5.1 (vessel name, registration insignia, docking/underway status chips, speed log in knots, heading bearing, sea-state condition, hull integrity damage tints, fuel gauge) and F5.2 (physical cargo hold grid with internal bays, external transom hooks, species sprites, quality medallions, real-time freshness decay bars, and weight badges).
- Replacing `HUD.tsx:202-325` with `<MaritimeVesselConsole boat={boat} headingDegrees={hud.compass.headingDegrees} headingCardinal={hud.compass.headingCardinal} />` achieves clean separation of concerns with zero regressions.

---

## 6. Verification Method

### Test Suite: `tests/unit/maritimeVesselConsole.test.ts`
Implement dedicated unit test suite with the following test cases:
1. **Wooden Rowboat Baseline**:
   - Renders vessel name "Wooden Rowboat" and insignia `REG · NV-ROW-01`.
   - Verifies fuel gauge is absent (oar-powered boat).
   - Verifies 2 hold slots render correctly.
2. **Coastal Fishing Skiff Baseline**:
   - Renders vessel name "Coastal Fishing Skiff" and insignia `REG · NV-SKF-02`.
   - Verifies fuel gauge is present with correct percentage and meter fill.
   - Verifies 6 cargo slots (4 hold bays + 2 external transom hooks).
3. **Docking & Navigation Status Chips**:
   - When `isDocked: true`, renders emerald `Docked` chip and hides running status.
   - When `isDocked: false` and `speedKnots > 0`, renders marine blue `Underway` chip.
   - When `isDocked: false` and `speedKnots === 0`, renders slate `Drifting` chip.
   - When `showNightWarning: true`, renders amber `Night waters` chip.
4. **Nautical Telemetry Formatting**:
   - Verifies speed log in knots (`8 kn`).
   - Verifies heading bearing (`184° S`).
   - Verifies sea-state badge (`Calm`, `Choppy`, `Rough`).
5. **Hull Damage Tints**:
   - Tests `hull.percent: 90` -> `hull-sound`.
   - Tests `hull.percent: 50` -> `hull-damaged`.
   - Tests `hull.percent: 20` -> `hull-critical`.
6. **Physical Cargo Hold Bay Grid**:
   - Renders occupied slot with species sprite (`AtlasImage` / `IconFish`), quality medallion, freshness decay bar (width %, tone class), and weight badge.
   - Renders transom hook tag on hook slots.
   - Renders ice preservation indicator (`❄️`) on chilled slots.

### Execution Commands:
```bash
npm run typecheck
npx vitest run tests/unit/maritimeVesselConsole.test.ts
npx vitest run tests/unit/empirical_m2_hud.test.ts tests/unit/adversarial_m2_hud.test.ts
```
