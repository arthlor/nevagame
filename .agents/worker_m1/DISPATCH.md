# Worker 1 Dispatch: Milestone M1 — Visual Theme, Tokens & Chrome Primitives

## Objective
Implement Milestone M1: Clean Modern-Medieval Visual Theme, CSS Design Tokens, Chrome Primitives Overhaul, Procedural SVG Flourishes, and UI Audio Infrastructure.

## Files Owned
- `src/ui/styles.css`
- `src/ui/chrome/chrome.css`
- `src/ui/chrome/Chrome.tsx`
- `src/ui/HudDecorations.tsx`
- `src/ui/audio/uiAudio.ts` (create new helper)

## Mandatory Rules & Warnings
- **MANDATORY INTEGRITY WARNING**: DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
- UI remains presentation-only (never owns simulation state).
- Run and verify:
  - `npm run typecheck`
  - `npm run assets:sync`
  - `npm run build`

## Detailed Implementation Requirements

1. **CSS Design Tokens (`src/ui/styles.css` & `src/ui/chrome/chrome.css`)**:
   - Introduce the `--mm-*` Modern-Medieval token hierarchy into `:root` in `src/ui/styles.css`:
     - Surface & Container Translucencies: `--mm-slate-900: #0c1017`, `--mm-slate-800: #141b24`, `--mm-slate-700: #1c2633`, `--mm-slate-glass: rgba(14, 20, 28, 0.90)`, `--mm-slate-glass-elevated: rgba(22, 30, 42, 0.94)`, `--mm-slate-glass-subtle: rgba(12, 17, 24, 0.75)` with `backdrop-filter: blur(12px)`.
     - Fine Timber & Wood Trim: `--mm-timber-dark: #1b120c`, `--mm-timber-mid: #2c1d14`, `--mm-timber-light: #442d1f`, `--mm-timber-border: 2px solid #4a3224`.
     - Gold-Leaf, Filigree & Brass: `--mm-gold-leaf: #d4af37`, `--mm-gold-bright: #f0dd9a`, `--mm-gold-burnished: #aa820a`, `--mm-gold-glow: rgba(212, 175, 55, 0.45)`, `--mm-gold-border: 1.5px solid #d4af37`.
     - Velvet Wells: `--mm-well-slate: radial-gradient(ellipse at 50% 50%, #16202c 0%, #0a0e14 100%)`, `--mm-well-shadow: inset 0 3px 6px rgba(0, 0, 0, 0.75), inset 0 0 0 1px rgba(0, 0, 0, 0.6)`.
     - Typography & Text: `--mm-text-ivory: #f5f0e6`, `--mm-text-gold: #f0dd9a`, `--mm-text-muted: #9e9589`, `--font-serif`, `--font-sans`.
     - Tactical Shadows: `--mm-shadow-modal`, `--mm-shadow-panel`, `--mm-glow-active`.
   - Ensure full backward compatibility with existing variable aliases (`--ui-paper`, `--ui-brass`, `--ui-ink`, etc.).

2. **Chrome Primitives (`src/ui/chrome/Chrome.tsx` & `src/ui/chrome/chrome.css`)**:
   - `ChromePanel`: Support tones `slate`, `timber`, `scroll`, `dock`, `ghost`, with dark slate translucency, gold filigree borders, brass rivets (`.chrome-rivet`), wax seal, and ribbon banner.
   - `ChromeSlot`: Velvet recessed well styling, embossed gold slot numbers, warm amber aura glow on active/hover, metallic slot bezels, and subtle drop-shadow on contained `AtlasImage` icons.
   - `ChromeButton`: Variants `primary` (slate velvet + burnished brass border + gold text), `gold` (metallic gold-leaf gradient), `secondary` (translucent slate + fine gold border), `danger` (crimson velvet + gold studs). Tactile hover scale(1.02) and active depression.
   - `ChromeMeter`: Brass framed tracks with ornate endcaps. Labor (emerald gradient), Sprint (sapphire cyan gradient), Danger/Tension (ruby gradient), Gold (liquid gold shimmer).
   - `ChromeDivider`: Ornate horizontal brass rule with center diamond crest.
   - `ChromeKeycap`: Tactile 3D stone/brass keycap badge.
   - `ChromeClose`: Gilded circular close button with hover rotation/glow.
   - `ChromeQuality`: Gilded medal badge with level colors.

3. **Procedural SVG Flourishes (`src/ui/HudDecorations.tsx`)**:
   - Author / enhance scalable SVG components:
     - `FiligreeCornerTL`, `FiligreeCornerTR`, `FiligreeCornerBL`, `FiligreeCornerBR`
     - `OrnateBrassDivider`
     - `CelestialTimeDial`
     - `MedallionPurse`
     - `EmbossedKeycap`

4. **UI Audio Helper & Interactive Wiring (`src/ui/audio/uiAudio.ts` & `Chrome.tsx`)**:
   - Create `src/ui/audio/uiAudio.ts` exporting `playUiSound(cue)` wrapping `gameAudio` for cues: `click`, `confirm`, `open`, `cloth`, `coins`, `page-turn`, `chime`.
   - Wire `playUiSound("click")` into `ChromeButton`, `ChromeClose`, `ChromeSlot` on interaction.

5. **Verification**:
   - Run `npm run typecheck`, `npm run assets:sync`, and `npm run build`.
   - Write full report with command outputs into `/Users/anilkaraca/Desktop/Neva/.agents/worker_m1/handoff.md`.
