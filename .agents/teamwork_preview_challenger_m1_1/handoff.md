# Milestone M1 Adversarial Challenge Report: Persistent HUD & Contextual Controls

**Agent**: `teamwork_preview_challenger_m1_1`  
**Working Directory**: `/Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_challenger_m1_1/`  
**Parent Agent**: `orchestrator_4` (`6ec9cade-1e48-47ab-a126-866fd7c1f1f4`)  
**Target Milestone**: M1 (HUD & Contextual Controls)  
**Date**: 2026-09-04T09:52:00Z  
**Verdict**: **CHALLENGE** (Empirically Confirmed Defects)

---

## 1. Observation

### 1.1 Test Suite & Typecheck Baseline
1. **TypeScript Type Safety**:
   Command: `npm run typecheck`
   Result: Exited with code 0 (0 compilation errors).
2. **Milestone M1 Unit Test Suite (`tests/unit/hud_m1.test.ts`)**:
   Command: `npx vitest run tests/unit/hud_m1.test.ts`
   Result: 26 / 26 passed (4.49s).
3. **M1 Adversarial & Empirical Stress Suite (`tests/unit/adversarial_m1_hud.test.ts`)**:
   Command: `npx vitest run tests/unit/adversarial_m1_hud.test.ts`
   Result: 28 / 28 passed (4.34s).
4. **Combined Regression Run (M1 + Notifications + Modals)**:
   Command: `npx vitest run tests/unit/adversarial_m1_hud.test.ts tests/unit/hud_m1.test.ts tests/unit/uiModals.test.ts tests/unit/hudNotifications.test.ts`
   Result: 80 / 80 passed across 4 files (18.58s).

### 1.2 Direct Code Observations & Confirmed Defects

#### Defect 1: `SmartActionPrompt` Target Name Mangling & Misparsed Labor Cost
- **Location**: `src/ui/hud/SmartActionPrompt.tsx:72-81`
- **Verbatim Code**:
  ```typescript
  // 2. Check for labor cost badge, e.g. "(-5 Work)" or "(5 Work)" or "-5 Work" or "· 8 Work"
  let laborCost: number | null = null;
  const workMatch = rest.match(/\(?\s*-?(\d+)\s*Work\)?/i);
  if (workMatch) {
    laborCost = Number.parseInt(workMatch[1], 10);
  }

  // Sanitize description text by stripping out the labor cost text to prevent duplication
  let sanitized = rest
    .replace(/\s*\(?\s*-?\d+\s*Work\)?/gi, "")
    .replace(/\s*·\s*$/, "")
    .trim();
  ```
- **Observed Behavior**:
  When input is `promptText = "[E] Deliver 5 Work Orders (-10 Work)"`:
  1. `workMatch` searches from the start of `rest` without anchoring to the end of the prompt or checking for parentheses.
  2. The first match is `" 5 Work"`. It sets `laborCost = 5` (incorrect; actual labor is 10).
  3. `rest.replace(/\s*\(?\s*-?\d+\s*Work\)?/gi, "")` globally strips both `" 5 Work"` and `" (-10 Work)"`.
  4. The target description is stripped to `"Orders"` instead of `"5 Work Orders"`.
  5. The prompt renders: `Deliver Orders [-5 Work]` instead of `Deliver 5 Work Orders [-10 Work]`.
- **Empirical Evidence**: Verified by `tests/unit/adversarial_m1_hud.test.ts:399`.

#### Defect 2: `SmartActionPrompt` Renders a Ghost Prompt on Whitespace-Only Input
- **Location**: `src/ui/hud/SmartActionPrompt.tsx:51-52`
- **Verbatim Code**:
  ```typescript
  function parseStructuredPrompt(
    text: string | null,
    toastMessage?: string | null
  ): ParsedPromptStructure | null {
    if (!text) return null;
    const trimmed = text.trim();
    if (toastMessage && trimmed === toastMessage.trim()) {
      return null;
    }
  ```
- **Observed Behavior**:
  When `promptText = "   "` (e.g. whitespace padded strings or empty string templates):
  1. `if (!text)` evaluates to `false` because `"   "` is truthy.
  2. `trimmed` evaluates to `""`.
  3. There is no `if (!trimmed) return null;` guard.
  4. `parseStructuredPrompt` returns: `{ rawKey: "E", verb: "", target: "", laborCost: null, detail: null, cleanLabel: "", fullLabel: "" }`.
  5. `SmartActionPrompt` renders:
     ```html
     <div class="smart-action-prompt interaction-prompt" role="status" data-testid="context-prompt" aria-label="">
       <div class="prompt-content-row banner-content-row">
         <span class="prompt-keycap-slot">
           <span class="hud-keycap-badge chrome-keycap">E</span>
         </span>
         <span class="banner-text prompt-action-description">
           <span class="prompt-target"></span>
         </span>
       </div>
     </div>
     ```
  This creates an unlabelled, floating ghost interaction prompt with keycap `[E]` on screen.
- **Empirical Evidence**: Verified by `tests/unit/adversarial_m1_hud.test.ts:386`.

#### Defect 3: `detectContextualStance` Unhandled `TypeError` on Non-Finite (`NaN`) Coordinates
- **Location**: `src/simulation/presentation/WorldHudPresentation.ts:48-60` and `src/world/WorldLayout.ts:1886-1894`
- **Observed Behavior**:
  When `state.player.x = NaN; state.player.z = NaN;`:
  `detectContextualStance(state)` calls `WorldLayout.fishingAccessAt(state.player.x, state.player.z)`.
  In `WorldLayout.ts:1886`, `this.isBridgeDeck(x, z)` attempts river section lookup with `NaN` indexing, resulting in `undefined` geometry nodes and throwing:
  ```
  TypeError: Cannot read properties of undefined (reading 'x')
      at Function.fishingAccessAt (src/world/WorldLayout.ts:1890)
      at detectContextualStance (src/simulation/presentation/WorldHudPresentation.ts:55)
  ```
  Since `buildWorldHudDto` runs on every animation frame in the main render loop, non-finite coordinates crash the React HUD loop.
- **Empirical Evidence**: Verified by `tests/unit/adversarial_m1_hud.test.ts:301-324`.

#### Defect 4: Action Cast Bar (`FarmingActionStatus`) Outputs `style="left: NaN%"` on `NaN` Progress
- **Location**: `src/ui/components/FarmingActionStatus.tsx:42-48`
- **Observed Behavior**:
  When `action.progress = NaN`:
  `Math.round(NaN * 100)` is `NaN`, `Math.max(0, NaN)` is `NaN`, and `Math.min(100, NaN)` is `NaN`.
  The spark element renders:
  ```html
  <div class="cast-bar-spark" style="left: NaN%;" aria-hidden="true"></div>
  ```
  and the timing readout renders:
  ```html
  <span class="cast-bar-timing" aria-hidden="true">NaNs / 0.7s · NaN%</span>
  ```
- **Empirical Evidence**: Verified by `tests/unit/adversarial_m1_hud.test.ts:550`.

---

## 2. Logic Chain

1. **Prompt Sanitization Overreach (Defect 1)**:
   - *Observation*: `workMatch` uses unanchored `/\(?\s*-?(\d+)\s*Work\)?/i`.
   - *Logic*: Any gameplay entity containing numbers followed by "Work" (e.g. "5 Work Orders", "2 Woodworking Benches") triggers premature regex capture. This causes `laborCost` to be parsed from the entity title instead of the authored cost, and the global replace wipes the name from `sanitized`.
   - *Conclusion*: `SmartActionPrompt` corrupts user-facing text and miscalculates labor requirements for title-embedded numbers.

2. **Whitespace Truthiness (Defect 2)**:
   - *Observation*: `if (!text) return null;` checks only truthiness before `.trim()`.
   - *Logic*: Non-empty strings of spaces (e.g. `" "`) bypass the null check. Since no post-trim emptiness check exists, the parser returns default key `"E"` with empty strings for verb and target, causing a visible ghost prompt box to render in the DOM.
   - *Conclusion*: A post-trim guard `if (!trimmed) return null;` is required to prevent ghost prompts.

3. **Spatial Query Propagation (Defect 3)**:
   - *Observation*: `detectContextualStance` passes player coordinates directly to `WorldLayout.fishingAccessAt` without validating finiteness.
   - *Logic*: `WorldLayout.riverSectionAt` assumes numeric indices. If coordinates are `NaN` (due to physics glitches or ungrounded raycasts), array/interpolation access returns `undefined`, triggering an unhandled `TypeError` during property access.
   - *Conclusion*: `detectContextualStance` must check `Number.isFinite(state.player.x) && Number.isFinite(state.player.z)` and fall back to `"explorer"`.

---

## 3. Caveats

1. **Non-Failure Areas**:
   - Zero work capacity (`0/0`), negative work capacity (`-15/100`), exhausted stamina (`0/0 Winded`), massive gold (`999,999 G`, `100M G`), and 100+ seeds in `PlantingSeedBar` (hotkeys strictly clamped to 1–9) all render reliably without throwing.
   - Sequential rapid stance switches (`agronomy -> angling -> maritime -> explorer -> unknown/null/undefined`) correctly fall back to `"explorer"` stance without crashing.
   - Deeply frozen immutable DTO structures (`Object.freeze`) render without mutation errors across all components.
2. **Review Scope Boundary**:
   - Per Project Rules, the challenger is review-only and does not modify implementation code directly. Fixes must be applied by the implementation worker.

---

## 4. Conclusion

**Verdict: CHALLENGE**

While the core layout anchors, gold corner brackets, and basic stance transitions are solid, Milestone M1 cannot be approved without remediating the following:
1. **Fix `SmartActionPrompt.tsx` Labor Parsing**: Anchor labor matching to parenthesized expressions or trailing strings (`/\((?:-\s*)?(\d+)\s*Work\)\s*$/i`) so entity names like `"5 Work Orders"` are not corrupted.
2. **Fix `SmartActionPrompt.tsx` Whitespace Guard**: Add `if (!trimmed) return null;` immediately after `const trimmed = text.trim();` to prevent ghost `[E]` prompts.
3. **Fix `detectContextualStance` Finiteness Check**: Guard `detectContextualStance` with `if (!Number.isFinite(state.player.x) || !Number.isFinite(state.player.z)) return "explorer";` in `src/simulation/presentation/WorldHudPresentation.ts`.
4. **Sanitize `FarmingActionStatus` Progress**: Default non-finite progress to `0` using `Number.isFinite(action.progress) ? action.progress : 0;` to avoid `left: NaN%`.

---

## 5. Verification Method

To independently verify all findings:

1. **Run M1 Adversarial Test Suite**:
   ```bash
   npx vitest run tests/unit/adversarial_m1_hud.test.ts
   ```
   *Expected Result*: All 28 tests pass, validating both the robust boundary handlers and asserting the documented defect reproductions.

2. **Run Full Combined Test Suite**:
   ```bash
   npx vitest run tests/unit/hud_m1.test.ts tests/unit/adversarial_m1_hud.test.ts tests/unit/uiModals.test.ts tests/unit/hudNotifications.test.ts
   ```
   *Expected Result*: All 80 tests pass across all 4 suites.

3. **Run TypeScript Compilation**:
   ```bash
   npm run typecheck
   ```
   *Expected Result*: Exits with code 0 (0 compilation errors).
