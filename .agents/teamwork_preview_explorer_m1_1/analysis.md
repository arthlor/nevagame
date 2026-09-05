# Technical Analysis: Milestone M1 Persistent Gameplay HUD & Nautical Navigation (F1.1–F1.4)

**Agent**: `teamwork_preview_explorer_m1_1`  
**Working Directory**: `/Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_explorer_m1_1/`  
**Milestone**: M1 (Persistent Gameplay HUD & Nautical Navigation)  
**Date**: 2026-09-04T09:28:00Z  

---

## 1. Executive Summary
This analysis details the architecture, component hierarchy, simulation DTO contracts, telemetry bridges, and verification results for Milestone M1 (Persistent Gameplay HUD & Nautical Navigation). The scope encompasses:
- **F1.1 Player Unit Frame**: Top-Left vitals, labor recharge pulse, sprint winded warning, and 4 status chips.
- **F1.2 Nautical Compass Radar & Celestial Almanac**: Top-Right circular radar, dynamic compass rose rotation (-heading), relative wind pointer, POI blips, celestial clock dial, subregion banner, and weather forecast popover toggle `[F]`.
- **F1.3 Collapsible Quest & Contract Tracker**: Top-Right collapsible story quest & delivery contracts tracker with progress bars, ready badges, and destination markers.
- **F1.4 Bottom-Right Micro-Menu & Purse Bar**: Bottom-Right gold purse counter with animated delta floaters, satchel & cargo pack capacity badges, and 6-panel micro-menu rack (`[I]`, `[J]`, `[M]`, `[L]`, `[P]`, `[Esc]`).

All 4 features have been examined against the Neva Purity Principle (100% Simulation Ownership), Viewport Coverage Budget (<20–25% ceiling), and the canonical project authorities (`LLM/01`, `LLM/02`, `LLM/04`, `PROJECT.md`).

---

## 2. Telemetry Bridging & Simulation DTO Mapping

| Feature | Simulation State Source | Presenter Function (`WorldHudPresentation.ts`) | DTO Field in `WorldHudDto` | UI Component & Render Point |
|---|---|---|---|---|
| **Labor (Work Capacity)** | `state.player.workCapacity` (`current`, `maximum`) | `buildWorldHudDto`: computes `workCurrent`, `maximum`, `exhausted: current < 1`, `recharging: current < maximum` | `hud.work: { current, maximum, exhausted, recharging, showLowNotice }` | `PlayerUnitFrame.tsx`: `<Meter variant="labor" fill={exhausted ? "danger" : "gold"}>` + glowing `.is-recharging` animation |
| **Sprint Stamina** | `state.player.traversal` (`sprintStamina`, `sprintExhausted`) | `buildWorldHudDto`: computes `sprintCurrent`, `sprintMaximum` (100), `showSprint` | `hud.sprint: { current, maximum, exhausted } \| null` | `PlayerUnitFrame.tsx`: `<Meter fill={exhausted ? "danger" : "sprint"}>` + `.unit-exhaustion-badge` (`Winded`) |
| **Status Chips** | Pure queries: `carriedFishCargoId`, `workCapacity`, `weather.type`, `activeBoatId`, clock night/dusk | `buildStatusChips(state)` | `hud.statusEffects: ReadonlyArray<HudStatusChipDto>` | `PlayerUnitFrame.tsx`: `.status-chips-rack` rendering chips for `overburdened`, `well-rested`, `rain-soaked`, `night-water-chill` |
| **Celestial Time & Clock** | `state.clock` (`currentMinute`, `dayCount`, `season`, `timeOfDay`) | `buildWorldHudDto`: computes `hour`, `minute`, `label` ("08:00"), `seasonLabel`, `dayInSeason`, `dialRotation` | `hud.clock: { label, hour, seasonLabel, dayInSeason, timeOfDayLabel, dialRotation, isNight }` | `NauticalCompassAlmanac.tsx`: centered `CelestialTimeDial` + weather button readout |
| **Compass Heading** | `state.player.rotationY` (radians) | `getHeadingCardinal(headingDegrees)` where `deg = ((-rotationY * 180) / PI + 360) % 360` | `hud.compass.headingDegrees`, `hud.compass.headingCardinal` | `NauticalCompassAlmanac.tsx`: `<g transform="rotate(-headingDegrees 75 75)">` rotating rose + `90° E` banner |
| **Wind Vector** | `state.weather.windDirectionDeg`, `state.weather.windSpeed` | `buildWorldHudDto`: `windDegrees: Math.round(weather.windDirectionDeg)` | `hud.compass.windDegrees` | `NauticalCompassAlmanac.tsx`: relative angle `(wind - heading + 360) % 360` driving SVG arrow |
| **Subregion & Markers** | `player.currentRegionId`, `WORLD_CHART_NODES`, `world.activeSchools` | `buildCompassMarkers(state, headingDeg)`: projects POIs <= 350m & schools <= 250m | `hud.compass.subRegionTitle`, `hud.compass.nearbyMarkers` | `NauticalCompassAlmanac.tsx`: title banner + projected SVG blips with pulsing sonar rings |
| **Story Quests** | `state.quests` (`QuestsState`) | `QuestsDomain.getActiveQuestDto(state)` | Passed as `activeQuest: ActiveQuestDto \| null` | `QuestTrackerHUD.tsx`: collapsible wood cluster, progress bar, ready badge, location pin |
| **Market Contracts** | `state.contracts` (`ContractState[]`) | `buildHudContracts(state)` | `hud.activeContracts: ReadonlyArray<HudContractDto>` | `QuestTrackerHUD.tsx`: collapsible contracts cluster, target item/fish name, reward G, current/target, destination pin |
| **Purse & Floating Deltas** | `state.player.money` (number) | `buildWorldHudDto`: `money: player.money` | `hud.money: number` | `MicroMenuPurseBar.tsx`: `${money.toLocaleString()} G` + `useEffect` delta floater (`+X G` / `-X G`) |
| **Bag & Cargo Capacity** | `inventories[player.inventoryId]`, `player.carriedFishCargoId` | `buildWorldHudDto`: computes `satchelUsed`, `satchelMax` (20), `cargoUsed` (0 or 1), `cargoMax` (1) | `hud.capacity: { satchelUsed, satchelMax, cargoUsed, cargoMax }` | `MicroMenuPurseBar.tsx`: `🎒 8/20` (warning at >=90%, full at 100%) and `📦 0/1` badges |
| **Micro-Menu Panels** | User click or physical keypress (`I`, `J`, `M`, `L`, `P`, `Esc`) | Dispatches `onOpenModal(modal)` | N/A (UI action router) | `MicroMenuPurseBar.tsx`: 6-button toolbar with keycaps and tooltips; Expeditions disabled with `🔒` until unlocked |

---

## 3. Viewport Coverage Budget Analysis

The Neva Art Direction Bible (`LLM/04`, line 513) mandates that persistent HUD coverage remains strictly under `<20–25%` of desktop viewport area to keep the world first.

### Measured Cluster Dimensions:
1. **Top-Left Player Unit Frame**:
   - CSS width: `240px`, height: `80px`
   - Area: $240 \times 80 = 19,200\text{ px}^2$
2. **Top-Right Nautical Compass Radar & Almanac**:
   - CSS width: `320px`, height: `150px`
   - Area: $320 \times 150 = 48,000\text{ px}^2$
3. **Bottom-Left Context Notes & Boat Console**:
   - CSS width: `280px`, height: `120px` (when active)
   - Area: $280 \times 120 = 33,600\text{ px}^2$
4. **Bottom-Center Contextual Toolbar & Smart Action Prompt**:
   - CSS width: `360px`, height: `80px`
   - Area: $360 \times 80 = 28,800\text{ px}^2$
5. **Bottom-Right Micro-Menu & Purse Bar**:
   - CSS width: `240px`, height: `75px`
   - Area: $240 \times 75 = 18,000\text{ px}^2$

**Total Persistent HUD Area**:
$$\text{Total Area} = 19,200 + 48,000 + 33,600 + 28,800 + 18,000 = 147,600\text{ px}^2$$

### Resolution Coverage Ratios:
- **1080p Viewport** ($1920 \times 1080 = 2,073,600\text{ px}^2$):
  $$\text{Coverage} = \frac{147,600}{2,073,600} \approx \mathbf{7.12\%} \quad (\ll 20\%)$$
- **720p Viewport** ($1280 \times 720 = 921,600\text{ px}^2$):
  $$\text{Coverage} = \frac{147,600}{921,600} \approx \mathbf{16.01\%} \quad (< 20\%)$$

Both resolutions strictly satisfy the project rule and pass the automated budget assertion in `tests/unit/hud_m1.test.ts`.

---

## 4. Test Suite Audit & Discrepancy Note

### 4.1 Passed Test Suites
1. `tests/unit/hud_m1.test.ts`: **16/16 passed**
   - Unit frame vitals, labor pulse, stamina exhaustion, status chips.
   - Compass rose rotation, wind vector, POI blip projection.
   - Micro-menu buttons, purse counter, capacity warning thresholds.
   - Smart stance transitions (Agronomy, Maritime, Explorer).
   - High-polish MMO cast bar (`FarmingActionStatus`).
   - Collapsible quest and delivery contract tracker.
   - Viewport coverage budget audit.
2. `tests/unit/uiModals.test.ts`: **6/6 passed**
3. `npm run typecheck`: **0 errors** (`tsc --noEmit` exits cleanly).

### 4.2 Legacy Test Discrepancy: `tests/unit/hudNotifications.test.ts:159`
- **Observed Failure**:
  ```
  ❯ tests/unit/hudNotifications.test.ts:159:18
      158|     expect(html).toContain("hud-tool-belt-readout");
      159|     expect(html).toContain("Seeds");
  ```
- **Root Cause**:
  `tests/unit/hudNotifications.test.ts` was written against the pre-M1 static tool belt where slot 2 was named `"Seeds"`. Under M1 Requirement R2 (Smart Contextual Toolbar), slot 2 in Agronomy Stance was renamed to `"Seed Belt"` (`WorldHudPresentation.ts:257`), and its detail is rendered as e.g. `"Wheat (10)"`.
  Consequently, `html` contains `"Seed Belt"` and `"Wheat (10)"`, but not the literal substring `"Seeds"`.
- **Recommended Remediation for Implementation / Maintenance**:
  In `tests/unit/hudNotifications.test.ts` line 159, update the assertion to accept the new M1 slot name:
  ```ts
  expect(html).toContain("Seed"); // or expect(html).toContain("Seed Belt")
  ```
  or in `WorldHudPresentation.ts` line 257:
  ```ts
  name: "Seed Belt",
  detail: seedName ? `${seedName} Seeds (${seedTotal})` : "No seeds",
  ```
  This preserves backwards compatibility with legacy tests while honoring the M1 specification.
