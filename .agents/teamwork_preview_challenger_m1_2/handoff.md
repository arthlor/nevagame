# Milestone M1 Adversarial Challenge Report: Viewport Budget & Spatial Clearance

**Agent**: `teamwork_preview_challenger_m1_2`  
**Working Directory**: `/Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_challenger_m1_2/`  
**Target Milestone**: M1 (Persistent HUD Anchors & Contextual Controls)  
**Parent Agent**: `orchestrator_4` (`6ec9cade-1e48-47ab-a126-866fd7c1f1f4`)  
**Date**: 2026-09-04T09:52:00Z  
**Empirical Verdict**: **CHALLENGE** (Desktop 1080p / 1366x768 / 720p APPROVED; Responsive 820x600 Breakpoint CHALLENGED)

---

## Challenge Summary

- **Overall risk assessment**: **MEDIUM**
- **Desktop Compliance (1080p, 1366x768, 720p)**: **100% PASS / APPROVED** (Horizon clearance > 500px, zero overlaps, coverage 6.2%–22.0% strictly < 25%).
- **Responsive Stress Compliance (820x600 / 620px height)**: **CHALLENGED** with 3 concrete spatial defects:
  1. **PlantingSeedBar vs MicroMenuPurseBar 77px Overlap**: Centered 470px seed belt collides with 238px micro-menu at 820px width.
  2. **Top Horizon Clearance < 500px**: 242px center horizon clearance at 820px width (zero overlap, but mathematically bounded < 500px for viewports < 1078px).
  3. **Bottom-Left 34vw Collision Margin**: Max-width `34vw` (278.8px) extends right edge to x=292.8px, risking ~2px overlap with centered toolbar (x=291px).
  4. **Simultaneous Extreme Full-Load Coverage (31.02%)**: When boat console, expanded quest tracker, chips, and hotbars are active simultaneously on 820x600.

---

## 1. Observation

### 1.1 Direct Code & CSS Observations
1. **Worker Audit Simplification in `tests/unit/hud_m1.test.ts:530-550`**:
   The worker tested persistent HUD viewport coverage using static, hardcoded numbers without responsive adaptation:
   ```typescript
   // Top-Left: ~240px x ~80px = 19,200 px^2
   // Top-Right: ~320px x ~150px = 48,000 px^2
   // Bottom-Left: ~280px x ~120px = 33,600 px^2
   // Bottom-Center: ~360px x ~80px = 28,800 px^2
   // Bottom-Right: ~240px x ~75px = 18,000 px^2
   const totalHudAreaPx = 147600;
   ```
   The audit only checked 1280x720 and 1920x1080, completely omitting:
   - 1366x768 (common laptop)
   - 820x600 / 620px height (responsive breakpoint)
   - Center horizon clearance verification (>= 500px)
   - Bottom row spatial clearances (Left vs Center vs Right overlap checks).

2. **Top Cluster Layout Rules (`src/ui/coastal.css:307-319, 3324-3325`)**:
   - Normal:
     ```css
     #ui-container .hud-top-left-container { width: min(360px, 42vw) !important; left: var(--ui-safe-left) !important; }
     #ui-container .hud-top-right-cluster { width: min(330px, 40vw) !important; right: var(--ui-safe-right) !important; }
     ```
   - Responsive breakpoint (`@media (max-width: 820px), (max-height: 620px)`):
     ```css
     #ui-container .hud-top-left-container { width: min(290px, 46vw) !important; }
     #ui-container .hud-top-right-cluster { width: min(260px, 42vw) !important; }
     ```

3. **Bottom Row Cluster Rules (`src/ui/coastal.css:321-360, 3326-3340`)**:
   - Bottom-Left: `left: var(--ui-safe-left) !important; max-width: min(330px, 36vw);` (or `max-width: 34vw !important;` on breakpoint).
     Boat console width: `min(270px, 31vw) !important;` normal, `min(230px, 37vw) !important;` on breakpoint.
   - Bottom-Center: `left: 50% !important; transform: translateX(-50%) !important;`
     Toolbar: 5 slots (46px normal, 42px on <=1450px/<=850px) + gaps (4px) + padding (10px) = ~238px–276px.
   - Bottom-Right: `right: var(--ui-safe-right) !important;`
     MicroMenu: 6 buttons (36px normal, 32px on breakpoint) + gaps (4px) + padding (24px) = ~238px–262px.
   - PlantingSeedBar (`src/ui/coastal.css:2866`):
     `width: min(470px, calc(100vw - 28px)) !important;`
     Centered at `left: 50%; transform: translateX(-50%);` without hiding or adjusting `MicroMenuPurseBar`.

4. **Safe Area Constants (`src/ui/styles.css:83-86`)**:
   `--ui-safe-top: max(14px, env(safe-area-inset-top));`
   `--ui-safe-right: max(14px, env(safe-area-inset-right));`
   `--ui-safe-bottom: max(14px, env(safe-area-inset-bottom));`
   `--ui-safe-left: max(14px, env(safe-area-inset-left));`

---

## 2. Adversarial Challenges

### Challenge 1: PlantingSeedBar Collides with MicroMenuPurseBar on Breakpoint (HIGH RISK)
- **Assumption challenged**: That the bottom row elements remain collision-free in all gameplay modes across responsive viewports down to 820px width.
- **Attack scenario**: The player enters farm planting mode (`mode === "farm-placement"`) on an 820x600 viewport or window.
- **Observed Geometry**:
  - `PlantingSeedBar` has `width: min(470px, calc(100vw - 28px))` = `470px`. Centered at `x = 410px`, its span is `x = [175px, 645px]`.
  - `MicroMenuPurseBar` remains rendered at `right: 14px`, spanning `x = [568px, 806px]`.
  - The right edge of `PlantingSeedBar` (645px) penetrates 77px into `MicroMenuPurseBar` (starts at 568px).
- **Blast radius**: The rightmost seed slots and the cancel button of `PlantingSeedBar` are obscured by or overlap with the micro-menu buttons and purse badge, blocking touch/pointer clicks.
- **Mitigation**:
  1. Hide `.hud-bottom-right-container` when `isPlacementActive` is true (analogous to how `SmartContextualToolbar` is hidden), OR
  2. Scale `PlantingSeedBar` to `width: min(340px, calc(100vw - 280px))` on viewports `<= 820px`.

### Challenge 2: Top Horizon Clearance Under 820px Width (MEDIUM RISK)
- **Assumption challenged**: That center horizon clearance strictly satisfies `>= 500px` across all tested viewports including 820x600.
- **Attack scenario**: Viewport width is 820px.
- **Observed Geometry**:
  - Top-Left width: `min(290px, 46vw)` = 290px. Span: `x = [14px, 304px]`.
  - Top-Right width: `min(260px, 42vw)` = 260px. Span: `x = [546px, 806px]`.
  - Center Horizon Clearance = `546 - 304 = 242px`.
  - Mathematically, for clearance to reach 500px: `Width >= 500 + 290 + 260 + 28 = 1078px`. On any viewport narrower than 1078px, clearance is strictly `< 500px`.
- **Blast radius**: The center horizon is open by 242px (zero overlap, sky is visible), but does not meet the literal 500px target intended for desktop viewports.
- **Mitigation**: Clarify the contract that `>= 500px` horizon clearance applies to viewports `>= 1280px` (720p/1080p), while `<= 820px` viewports require `clearance > 200px`.

### Challenge 3: Bottom-Left 34vw Container Collision Boundary (LOW RISK)
- **Assumption challenged**: That `.hud-bottom-left-container` cannot overlap with `.hud-play-cluster` at 820px width.
- **Attack scenario**: Bottom-left content expands to its maximum declared width `max-width: 34vw`.
- **Observed Geometry**:
  - At 820px: `34vw = 278.8px`. Right edge = `14 + 278.8 = 292.8px`.
  - Bottom-center toolbar is 238px wide, centered at 410px. Left edge = `410 - 119 = 291px`.
  - If a bottom-left container child reaches 34vw, it overlaps the toolbar by `1.8px`.
- **Mitigation**: Update `src/ui/coastal.css:3326` from `max-width: 34vw !important;` to `max-width: 32vw !important;` (262px, giving a 15px safety buffer).

### Challenge 4: Extreme Simultaneous Full-Load Coverage on 820x600 (LOW RISK)
- **Assumption challenged**: That persistent HUD screen coverage strictly remains `< 25%` across all resolutions even under simultaneous maximum load.
- **Attack scenario**: On an 820x600 screen, the player has 4 status chips, an active maritime boat console (100px), an expanded 3-step quest & contract tracker (230px), the 5-slot toolbar, and the purse bar all active at the same time.
- **Observed Geometry**:
  - Total rendered HUD area: 152,604 px².
  - Viewport area: `820 * 600 = 492,000 px²`.
  - Coverage: `152,604 / 492,000 = 31.02%` (exceeds the 25% ceiling).
  - *Note*: During standard normal exploration on 820x600, coverage is **20.70%** (< 25%, PASS).
- **Mitigation**: Auto-collapse quest tracker to header chip on viewports with height `<= 620px` when boat console or heavy modals are engaged.

---

## 3. Stress Test Results Matrix

| Resolution | Aspect Ratio | Category | Top Horizon Clearance | Bottom Clearances (L→C / C→R) | Normal Coverage | Full-Load Coverage | Status |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **1920x1080** | 16:9 | 1080p FHD | **1202px** (>=500px) | 478px / 546px | **6.19%** (<10%) | **9.79%** (<25%) | **PASS (Approved)** |
| **1366x768** | ~16:9 | Laptop | **648px** (>=500px) | 271px / 279px | **12.23%** (<15%) | **19.35%** (<25%) | **PASS (Approved)** |
| **1280x720** | 16:9 | 720p HD | **562px** (>=500px) | 228px / 236px | **13.92%** (<15%) | **22.02%** (<25%) | **PASS (Approved)** |
| **1280x620** | ~2:1 | Height Stress | **702px** (>=500px) | 228px / 240px | **14.89%** (<15%) | **22.68%** (<25%) | **PASS (Approved)** |
| **820x600** (Normal) | ~4:3 | Breakpoint | **242px** (>200px) | 47px / 39px | **20.70%** (<25%) | **31.02%** (>25%) | **CHALLENGE (Finding 1 & 4)** |
| **820x600** (Planting) | ~4:3 | Breakpoint | 242px | - / **-77px OVERLAP** | N/A | N/A | **CHALLENGE (Finding 2)** |

---

## 4. Logic Chain

1. **Top Horizon Clearance Logic**:
   - `coastal.css` fixes Top-Left width at `min(360px, 42vw)` and Top-Right width at `min(330px, 40vw)` on desktop.
   - For viewports `W >= 1280`: `W - 28 - (360 + 330) = W - 718`. At 1280px, clearance is `1280 - 718 = 562px >= 500px`. At 1920px, it is `1202px`.
   - For viewports `W <= 820` or `H <= 620`: widths shrink to 290px and 260px (`W - 28 - 550 = W - 578`). At 820px, clearance is `242px`. Clearance cannot reach 500px unless width is `>= 1078px`.

2. **Bottom Row Spatial Clearance & Overlap Logic**:
   - On desktop (1080p, 1366x768, 720p), the three bottom clusters have >200px to >500px clearance between them, guaranteeing zero collision.
   - On 820x600 in normal play, the toolbar (238px) leaves 47px to boat console and 39px to micro-menu, ensuring zero overlap.
   - However, `PlantingSeedBar` is 470px wide. When centered, it extends from x=175px to x=645px. Because `MicroMenuPurseBar` starts at x=568px, a 77px overlap is geometrically guaranteed unless micro-menu is hidden.

3. **Persistent Screen Coverage Budget Logic**:
   - Viewport area scales quadratically: 1080p is 2.07M px², 720p is 0.92M px², 820x600 is 0.49M px².
   - Standard exploration persistent elements occupy ~128K px² on desktop and ~101K px² on breakpoint.
   - As a percentage: 1080p is 6.2%, 1366x768 is 12.2%, 720p is 13.9%, and 820x600 is 20.7%. All strictly satisfy the `<20–25%` rule for normal play.
   - Simultaneous extreme full-load on 820x600 reaches 31.02%, which violates the 25% ceiling under that specific edge condition.

---

## 5. Caveats

1. **Mobile Touch Target Standards**:
   On desktop, micro-menu buttons are 36px (32px on breakpoint). On mobile devices (`data-mobile-device="true"`), buttons expand to >=48px under `mobile.css`, which is evaluated under Milestone M5.
2. **Review-Only Constraint Adhered To**:
   In strict accordance with challenger instructions, no implementation files in `src/` were modified. All challenges are supported by executable tests in `tests/unit/viewport_budget_m1_adversarial.test.ts`.

---

## 6. Conclusion & Actionable Next Steps

### Verdict: **CHALLENGE**
- **Desktop (1920x1080, 1366x768, 1280x720)**: **APPROVED**. Completely robust, spacious center horizon clearance (>500px to 1200px), zero bottom overlaps, and minimal persistent coverage (6%–22% < 25%).
- **Responsive Breakpoint (820x600)**: **CHALLENGED** with 3 required remediations:
  1. **Fix PlantingSeedBar Collision**: When `mode === "farm-placement"`, hide `.hud-bottom-right-container` (or dock it above the seed tray) to eliminate the 77px overlap with the micro-menu.
  2. **Tighten Bottom-Left Max-Width**: In `src/ui/coastal.css:3326`, change `max-width: 34vw !important;` to `max-width: 32vw !important;` to eliminate the 1.8px boundary collision risk.
  3. **Auto-Collapse Quest Tracker on Small Heights**: In `coastal.css` under `<=620px` height, default `QuestTrackerHUD` to folded/collapsed state so that total coverage on 820x600 remains under 22% even in boat mode.

---

## 7. Verification Method

To reproduce all observations and empirical calculations:

1. **Run the Adversarial Viewport Suite**:
   ```bash
   npx vitest run tests/unit/viewport_budget_m1_adversarial.test.ts
   ```
   *Result*: All 13 tests execute and pass, verifying the exact geometry and confirming both approvals and challenges.

2. **Run Worker M1 Base Suite**:
   ```bash
   npx vitest run tests/unit/hud_m1.test.ts
   ```
   *Result*: 26/26 tests pass.

3. **Verify TypeScript Safety of Viewport Suite**:
   ```bash
   npx tsc --noEmit
   ```
   *Result*: Zero compilation errors in `tests/unit/viewport_budget_m1_adversarial.test.ts`.
