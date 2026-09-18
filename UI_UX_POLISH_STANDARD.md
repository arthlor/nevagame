# Neva UI/UX Polish Standard & Design Specification

> **Official Design Standard for Neva HUD, Modals, and Interactive Presentation.**  
> Grounded in `LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md` and the **Guildcraft** tactile aesthetic.

---

## 1. Core Visual Philosophy

Neva's UI is designed as a **tactile, cozy maritime journal and instrument suite**. Interfaces should feel handcrafted from dark aged leather, pressed nautical parchment, polished brass, and illuminated gold leaf.

### Key Tenets
1. **Physical & Tactile**: Windows look like authentic physical artifacts (leather folios, ship logbooks, brass navigational instruments).
2. **Warm Dark Slate & Leather**: Replace cold grays and murky olive-greens with a rich, warm dark leather/slate gradient over subtle paper grain.
3. **Layered Antique Metallics**: Use brass and gold intentionally — glowing gold for active/primary focus, antique brass for structure, and muted dark bronze for secondary borders.
4. **No Awkward Gutters or Floating Gaps**: Modals must float cleanly in the viewport with zero artificial outer padding (`padding: 0` on overlays), contained by their own ornate 9-slice baroque borders.
5. **Immersive Typography**: 
   - **Serif (`Crimson Pro`)**: For narrative story titles, NPC names, lore quotes, and book headings.
   - **Sans-Serif (`Inter` / System Sans)**: For compact gauges, progress counters, tracking tags, and numerical readouts.

---

## 2. Design Tokens & Palette Reference

```css
/* Core Guildcraft UI Tokens */
--guild-slate-dark:   rgba(18, 16, 13, 0.99);
--guild-slate-mid:    rgba(28, 25, 20, 0.98);
--guild-slate-card:   rgba(18, 16, 12, 0.45);
--guild-paper-grain:  url('/assets/ui/atlas/guildcraft-paper.png');

--guild-gold-bright:  #f5da96;
--guild-gold:         #c9a75e;
--guild-gold-deep:    #a5833e;
--guild-brass-border: rgba(165, 139, 73, 0.25);
--guild-ivory:        #f2ece1;
--guild-muted:        #a89f91;

--guild-success:      #9fe29d;
--guild-success-glow: #7ecc7a;
--guild-caution:      #e4c478;
--guild-danger:       #f1a285;
```

---

## 3. Component Standards & Polish Recipes

### A. Modal Windows & Game Sheets (`.game-sheet`, `.modal-overlay`)

#### Problems Solved
- **Eliminated the Transparent Outer Border / Moat**:
  - *Root Cause 1*: The `guildcraft-panel.png` sprite had 9–12px of empty transparent padding around its perimeter (originally placed to satisfy an icon transparency keyout check in `publish-atlas.mjs`). When rendered with `border-image: ... 44 / 22px / 0 stretch` and `background-clip: padding-box`, this created a visible 5.5px transparent gutter between the gold ornate frame and the element border-box.
  - *Root Cause 2*: A `box-shadow: 0 0 1px 1px rgba(165, 139, 73, 0.25)` was drawing a 1px brass outline at the element's border box edge (5.5px outside the gold frame), making the transparent moat appear as a distinct floating rectangular border.
  - *Resolution*: 
    1. Cropped `guildcraft-panel.png` to its exact alpha bounds (`0..511` on all 4 sides) with Lanczos3 resampling, so the ornate gold frame touches the exact image boundaries.
    2. Added a panel exemption in `tools/ui/publish-atlas.mjs` to keep the atlas publisher and pack checks fully green (`npm run ui:publish:check` & `npm run ui:pack:check`).
    3. Replaced the 1px brass outline in `box-shadow` with a pure soft ambient shadow `box-shadow: 0 18px 48px rgba(0, 0, 0, 0.85)`.
    4. Snapped `border-image` to `var(--guild-panel) 38 / 18px / 0 stretch` matching `border: 18px solid transparent`. The gold frame now begins at pixel 0 with zero outer gutter and zero floating lines.
- **Removed the awkward 18px outer padding/gutter in `.modal-overlay`** that previously created an outer letterbox around centered windows.
- **Replaced mismatched olive/greenish background gradients** with warm dark leather/slate parchment.
- **Replaced browser-default bright yellow scrollbars** with custom antique brass slim scrollbars.

#### CSS Recipe
```css
/* Centered overlay with zero artificial gap */
#ui-container[data-ui="guildcraft"] :is(.modal-overlay) {
  background: rgba(8, 10, 8, 0.6) !important;
  backdrop-filter: none !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

/* 9-slice ornate sheet: perfectly flush gold frame with zero transparent gutter */
#ui-container[data-ui="guildcraft"] .game-sheet {
  color: var(--guild-ivory) !important;
  background:
    linear-gradient(180deg, rgba(28, 25, 20, 0.98) 0%, rgba(18, 16, 13, 0.99) 100%),
    var(--guild-paper-grain) center / 192px !important;
  background-clip: padding-box !important;
  border: 18px solid transparent !important;
  border-image: var(--guild-panel) 38 / 18px / 0 stretch !important;
  border-radius: 0 !important;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.85) !important;
  padding: 0 !important;
  isolation: isolate;
}
```

---

### B. Antique Brass Scrollbars

#### Problems Solved
- Eliminated stark, high-contrast yellow scrollbars on folios, journals, and stores.
- Installed slim 6px antique brass thumbs with dark recessed tracks.

#### CSS Recipe
```css
#ui-container[data-ui="guildcraft"] :is(.modal-body,.ledger-body,.stores-body,.journal-open-pages) {
  scrollbar-width: thin;
  scrollbar-color: rgba(165, 139, 73, 0.45) rgba(14, 12, 9, 0.6);
}

#ui-container[data-ui="guildcraft"] :is(.modal-body,.ledger-body,.stores-body,.journal-open-pages)::-webkit-scrollbar {
  width: 6px !important;
  height: 6px !important;
}

#ui-container[data-ui="guildcraft"] :is(.modal-body,.ledger-body,.stores-body,.journal-open-pages)::-webkit-scrollbar-track {
  background: rgba(14, 12, 9, 0.5) !important;
  border-radius: 3px !important;
}

#ui-container[data-ui="guildcraft"] :is(.modal-body,.ledger-body,.stores-body,.journal-open-pages)::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #6c5a34 0%, #4a3c20 100%) !important;
  border-radius: 3px !important;
  border: 1px solid rgba(165, 139, 73, 0.3) !important;
}

#ui-container[data-ui="guildcraft"] :is(.modal-body,.ledger-body,.stores-body,.journal-open-pages)::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #967d46 0%, #6c5a34 100%) !important;
  border-color: rgba(220, 190, 120, 0.6) !important;
}
```

---

### C. Field Journal & Folio Presentation (`.journal-chronicle-modal`)

The Field Journal is the player's core chronicle and knowledge repository. It contains 7 distinct folios:

#### 1. Global Shell & Navigation
- **Window Sizing**: Responsive `width: min(960px, calc(100vw - 24px))` and `height: min(740px, calc(100dvh - 20px))` filling the screen harmoniously.
- **Folio Tabs**: File-folder style tabs with active golden tab indicator flowing directly into the open page (`border-bottom: 1px solid rgba(165, 139, 73, 0.25)`).
- **Folio Footer**: Subtle 1px antique brass divider, italic completion status readout, and styled close action button.
- **Antique Brass Scrollbars**: Slim 6px custom scrollbars on all scrolling pages.

#### 2. Story Folio (`activeFolio === "story"`)
- **Chapter & Act Titles**: Elegant small-caps tracking header (`#b89b58`) sitting quietly above the quest title.
- **Quest Headings**: Bold 26px Crimson Pro serif in bright gold (`#f5da96`) with soft dark drop shadow for high readability.
- **Objective Cards**: Recessed card container (`rgba(18, 16, 12, 0.45)`) with location pin icon, crisp ivory text, and refined gold progress meter with glowing fill.
- **Traveler's / Speaker Quote Block (`.journal-story-brief`)**: Authentic handwritten margin note with 3px golden amber rule, italic brass speaker attribution (`#e4c478`), and warm reading copy.
- **Secondary Errands Grid**: Inset cards with category badges, gold titles, and subtle hover lift transitions.
- **Completed Stories Accordion**: Tactile button trigger with chevron indicator and glowing emerald checkmarks (`✓`).

#### 3. Guide Folio (`activeFolio === "guide"`)
- **Guide Header Card**: Gilded header plaque with circular compass medallion and crisp summary description.
- **Controls Reference Grid**: 2-column tactile card layout with embossed 3D brass keycaps (`[W]`, `[A]`, `[S]`, `[D]`, `[Space]`).
- **Core Loops & Workflow Steps**: Numbered workflow cards featuring radial brass numeral badges (`1`, `2`, `3`) with warm ivory instructional prose.

#### 4. Records Folio (`activeFolio === "records"`)
- **Milestones Board**: Expandable tier cards with gold star icons, completed count chips, and individual achievement rows with percentage progress gauges.
- **Catches & Field Notes Grid**: 2-column layout dividing marine and botanical records.
- **Fish & Crop Entries**: Circular portrait wells with dark bronze gradient bezels, glowing gold stat chips (`Landed`, `Best Catch`), and hover elevation.

#### 5. Almanac Folio (`activeFolio === "almanac"`)
- **Strand Tabs**: Tactile dual-mode buttons (`Fish` / `Crops`) with individual discovery progress counter pills (`${discovered}/${total}`).
- **Search Console**: Dark leather search bar with antique brass border, focus glow, and italic search hints.
- **Discovered vs. Unrecorded Entries**: Discovered species receive full tactile card treatment with gold left border (`#c9a75e`), while unrecorded species appear as dashed mystery entries.
- **Pill Tags**: Gilded amber pills for rarity tiers and maritime sapphire pills for sport fish / regrowth properties.
- **Definition Grid**: Recessed fact pair grid (`Waters`, `Season`, `Runs`, `Rod`, `Weight`, `Value`) with uppercase brass labels and crisp ivory values.
- **Personal Star Line**: Star badge displaying catch count and personal record weight.

#### 6. Skills Folio (`activeFolio === "skills"`)
- **Mastery Plaques**: Recessed cards with 3px gold left accent, housing skill title and embossed rank badge plaque.
- **Medallion Icon Bezels**: 48px circular radial-gradient brass medallions with category icons (`Sprout`, `Fish`, `Tools`, `Coin`).
- **XP Progression Gauge**: Integrated gold meter showing numeric XP and percentage to next rank.
- **Next Rank Preview Footer**: Inset preview block detailing the upcoming rank name and next unlock chips, or emerald glowing mastery insignia if capped.

#### 7. Notices Folio (`activeFolio === "notices"`)
- **Village Board Corkboard Grid**: Responsive grid of authentic physical notices pinned to the board.
- **Aged Sun-Bleached Parchment**: Rich tactile gradient (`#f6eed9` to `#e1d1a8`) with subtle rotation on hover.
- **3D Brass Thumbtack**: Realistic radial-shaded brass pin (`::before`) with dark shadow and needle puncture illusion.
- **Category Top Stripes**: Town (wine red), Market (ochre gold), Harbor (maritime blue), Field (forest sage).
- **Inked Typography**: Deep iron-gall ink titles (`#1e1507`), letterpress category tags, and italic quill signatures.

#### 8. People Folio (`activeFolio === "people"`)
- **Familiarity Counter**: Summary card with people icon and tabular count of familiar townsfolk.
- **Character Dossier Cards**: Tactile dossier cards with standing tier colored left borders (Tier 0 neutral, Tier 1 bronze, Tier 2 jade, Tier 3 gold).
- **Portrait Ring Medallions**: 48px circular portrait wells with gold recognition halo and corner seal badge for recognized NPCs.
- **Spoken Dialogue Quote**: Inset italic quote block capturing the NPC's living voice.
- **Location & Commission Chips**: Discrete metadata chips noting current location, completed commissions, and district origin.

---

### D. NPC Dialogue Card (`.dialogue-card`)

#### Key Enhancements
1. **Baroque Frame**: 9-slice gold ornamental panel frame (`border-image: var(--guild-panel)`).
2. **Ornamental Avatar Bezel**: Intricate gold ring frame (`/assets/ui/atlas/guildcraft-ring.png`) housing the character portrait.
3. **Speaker Header**: Grand serif name in antique gold with subtitle role in muted brass.
4. **Narrative Text**: Crimson Pro serif in bright ivory (`#f2ece1`) with 1.65 line height for maximum legibility.
5. **Illuminated Progression Beads**: Glowing golden beads (`.dialogue-bead`) indicating dialogue page progress.
6. **Keycap Action Button**: Embossed brass advance button with tactile key hint badge `[Space / Click]`.

---

### E. HUD Notifications & Toasts (`.hud-toast-pill`)

#### Key Enhancements
1. **Pill Capsule**: Compact, non-intrusive dark slate-leather pill floating in the viewport.
2. **Gilded Medallion**: Intricate circular coin bezel with crisp icon matching notification category.
3. **Dynamic Feedback**: Golden/amber delta tags (`+10`, `Level Up`) for immediate visual reward.
4. **Micro-Motion**: Smooth slide-in, spring dampening, and gentle auto-dismiss fade.

---

### F. Start Screen & Title Presentation (`.start-screen`)

#### Key Enhancements
1. **Plaque Tray Framing (`.start-screen__tray`)**:
   - Replaced plain ghost outline with the Guildcraft dark leather/slate 9-slice panel (`border-image: var(--guild-panel) 38 / 18px / 0 stretch`).
   - Sits flush against the outer border box with no transparent gap, grounded by a deep ambient drop shadow (`box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85)`).
2. **Save Scroll Card (`.start-screen__save-scroll-card`)**:
   - Replaced flat greenish box with rich dark leather/slate card gradient (`rgba(28, 24, 18, 0.75)` to `rgba(18, 15, 12, 0.85)`).
   - Antique brass hairline border (`rgba(165, 139, 73, 0.35)`) and warm inner rim highlight.
   - **Header**: Crimson Pro serif in bright gold leaf (`--guild-gold-bright`) beside the journal atlas emblem.
   - **Save Details**: Season/day badge chip in gold translucent wash with clean ivory metadata and muted timestamp.
3. **Primary Action Button (`.start-screen__button`)**:
   - Gilded maritime button in rich antique gold leaf gradient (`#6e5527` to `#2e220b`) with 1.5px `#d4af37` beveled border.
   - Embossed inner highlight and deep text shadow.
   - Hover elevates slightly (`translateY(-1px)`) with warm gold bloom (`0 0 12px rgba(212, 175, 55, 0.45)`).
4. **Secondary Action Button (`.start-screen__secondary-button`)**:
   - Warm slate-timber gradient with antique brass frame and ivory lettering.
5. **Settings Medallion Button (`.start-screen__utility-button`)**:
   - Circular nautical medallion with radial brass depth (`radial-gradient(circle at 35% 30%, #3e3422 0%, #201a12 100%)`) and gold border.
   - Subtle spring scale on hover (`scale(1.06)`).
6. **Loading Progress Meter (`.start-screen__meter`)**:
   - 8px brass-framed recessed track with warm gold-leaf animated fill (`#8a6a2a` to `#f5da96`) and golden aura.
7. **Brand Lockup**:
   - Grand Crimson Pro serif title with layered drop shadows and warm gold glow.
   - Italic gold tagline ("*Grow a home. Follow the tide.*") and gilded gradient dividing rule.
8. **Confirmation Dialogs (`.start-screen__dialog`, `.start-screen__new-game-dialog`)**:
   - Flush Guildcraft 9-slice ornate frame (`var(--guild-panel) 38 / 18px / 0 stretch`) with zero phantom gap.
   - Header with Crimson Pro serif title in bright gold leaf (`--guild-gold-bright`), antique brass hairline divider (`rgba(165, 139, 73, 0.28)`), and brass close button.
   - Body copy with warm ivory text (`--guild-ivory`) in comfortable serif typography.
   - **Dialog Actions Layout & Button Sizing Fix**:
     - *Bug*: `#ui-container .start-screen__button` was setting `width: 100% !important;` unconditionally. In a flex container with `justify-content: flex-end;`, this forced the confirm button to span the full width, causing the preceding cancel button ("Keep current game") to overflow to the left and be clipped by the dialog boundary (`p current game`).
     - *Resolution*: Excluded `.start-screen__button--dialog` from the 100% width rule via `:not(.start-screen__button--dialog)`.
     - Explicitly sized dialog action buttons with `width: auto !important; min-width: 140px; flex: 0 0 auto; white-space: nowrap;`.
     - Styled primary confirm buttons with the Guildcraft gold gradient, danger confirm buttons (`.neva-button-danger`) with ruby crimson gradient (`#6a251e` to `#2f0d09`), and secondary cancel buttons with dark brass framing.
     - Mobile responsive: Stacks action buttons vertically (`flex-direction: column-reverse`) on viewports `<= 560px`.

---

### G. Main HUD In-Game Systems (`[data-ui="guildcraft"]`)

#### Key Enhancements Across All HUD Clusters

1. **Top-Left Player Unit Frame (`.guild-player-unit-frame`, `.guild-player-work`)**:
   - **Nameplate (`.guild-player-name`)**: Authored in Crimson Pro serif with glowing gold leaf (`--guild-gold-bright`), 0.035em tracking, and crisp drop shadow.
   - **Work Capacity Track (`.guild-work-track`, `.guild-work-fill`)**: Recessed dark slate channel with 1px antique brass border. Filled with rich golden labor gradient (`#b38b38` to `#f7df9b`) and subtle horizontal energy sheen.
   - **Work Numerical Readout (`.guild-work-readout`, `.guild-work-earned`)**: Crisp ivory figures (`#fffaf0`) in tabular numerals with high-contrast shadow. Daily earnings tag styled in muted gold (`#dfbd73`) with subtle brass separator badge.
   - **Medallion Framing (`.guild-player-portrait-circle`)**: Circular embossed brass rim around the character portrait with inset shadow grounding.

2. **Top-Center Compass Ribbon (`.guild-navigation`)**:
   - **Retired in Favor of Dedicated Minimap**: The top-center compass bar has been hidden (`display: none !important;`). The top-right circular astrolabe minimap (`WorldMinimap`) already displays the player's 360° heading, North needle, terrain, nearby points of interest, quest markers & distances, and subregion names, making the top-center bar redundant visual clutter. Hiding it leaves the upper viewport clean and cinematic.

3. **Top-Right Minimap, Almanac Pills & Weather Hazard**:
   - **Minimap Cartouche (`.guild-minimap`)**: Authentic circular brass mariner's astrolabe rim with multiply paper texture overlay, deep inset vignette, and glowing gold North indicator (`.guild-minimap-north`).
   - **Calendar & Purse Pills (`.guild-calendar`, `.guild-purse`)**:
     - Upgraded from plain green/brown boxes to beveled dark leather/brass cards with warm inner rim highlights (`inset 0 1px 0 rgba(255, 235, 175, 0.2)`).
     - Gold purse features bright gold tabular figures (`font-variant-numeric: tabular-nums`) with animated green/red delta tags (`.is-gain` / `.is-spend`).
   - **Weather Hazard Banner (`.weather-hazard-banner`) & Forecast Popover**:
     - Replaced plain text close button with ornate brass `<ChromeClose>` component (`.hazard-banner-close.hazard-banner-dismiss-btn`).
     - Rich leather/slate backdrop with high-visibility hazard indicator strip (`3.5px solid #d45945` for storm/fog danger or `#dfbd73` for caution).
     - **Stacking Alignment**: Resolved popover overlap by anchoring `.forecast-popover` at `top: 20px` by default, or `top: 104px` when a hazard banner is active, completely eliminating popup clipping.

4. **Right-Center Quest & Contracts Tracker (`.guild-objectives`)**:
   - **Anchor Optimization**: Adjusted top anchor to `calc(var(--ui-safe-top) + 296px)` (and `340px` when forecast is open) so the top of the quest card never collides with the gold purse pill, while retaining a `min(540px, calc(100vh - var(--ui-safe-top) - 380px))` ceiling to prevent screen-bottom cutoff.
   - **Gilded Quest Card (`.guild-quest`)**: Gold header with parchment seal, slim 4px brass scrollbar, and beveled tab buttons for quest chains (`.quest-thread-tab`).
   - **Active Contracts Card (`.guild-contracts-tracker`)**: Compacted padding (6px 9px), margins, and amber price typography so 3 active market consignments fit cleanly in the viewport without clipping.

5. **Bottom-Center Action Prompt (`.interaction-prompt`, `.smart-action-prompt`)**:
   - **Cartouche Plaque**: Beveled pill capsule (`linear-gradient(180deg, rgba(36, 30, 21, 0.96) 0%, rgba(18, 16, 12, 0.98) 100%)`) with 1px antique brass border and warm inner highlight.
   - **Struck Brass Keycaps (`.chrome-keycap`, `.hud-keycap-badge`)**: Embossed brass button caps (`#b8934d` border, `rgba(255, 240, 180, 0.4)` top bevel, deep drop shadow) with bright ivory/gold lettering.
   - **Semantic Typography**: Bright gold serif for verbs (`.prompt-verb`), warm ivory for targets (`.prompt-target`), and muted brass for details.
   - **Work Cost Badge (`.prompt-labor-badge`)**: Beveled dark badge with energy spark icon and tabular work expenditure tag.

6. **Bottom-Right Micro-Menu (`.guild-utilities`, `.guild-utility`)**:
   - **Orbicular Medallions**: 58px circular buttons with radial metallic depth (`radial-gradient(circle at 38% 32%, #383020 0%, #1e1912 68%, #12100a 100%)`) and antique brass rims.
   - **Interactive Hover Motion**: Smooth lift (`translateY(-2px)`), warm gold rim aura, and subtle icon expansion (`scale(1.06)`).
   - **Embossed Keycap Labels (`.guild-utility-key`)**: Brass-framed keycaps anchored beneath each medallion (`I`, `J`, `M`, `L`, `P`, `Esc`).
   - **Capacity Pill Overlay (`.guild-capacity`)**: Beveled brass/leather badge on satchel and ledger buttons displaying tabular item counts (`11/16`) with warning amber and full crimson states.

7. **Screen-Space Waypoint Pointer (`.quest-pointer`)**:
   - **Glow Chevron (`.quest-pointer-chevron`)**: Polished golden pointer with dual drop shadows and radiant ambient aura.
   - **Engraved Waypoint Plaque (`.quest-pointer-caption`)**: Dark leather pill with brass hairline border and ivory serif text.
   - **Distance Metric (`.quest-pointer-range`)**: Tabular gold figures with double drop shadow for readability across any terrain background.

8. **Minimal Centered Crop Inspection Plaque (`.crop-inspection`)**:
   - **Centered Screen Positioning**: Anchored neatly at `left: 50% !important; bottom: calc(var(--ui-safe-bottom) + 120px) !important; transform: translateX(-50%) !important;` with smooth entrance motion (`animation: crop-plaque-appear 150ms`). This places the plaque cleanly in the lower focal area above the toolbelt, completely eliminating collisions with the Quest Tracker (`Freight and Favour`), Minimap, Player Frame, and Micro-menu regardless of 3D camera angles.
   - **Minimal Tactile Aesthetics**: Streamlined dimensions (`min(315px, calc(100vw - 32px))`, `8px 12px 10px 12px` padding), slim 1px antique brass border (`rgba(185, 148, 80, 0.45)`), gentle 6px corner radius, and subtle dark-leather gradient with paper grain and deep drop shadow.
   - **Unclipped Stage Meter**: Fixed the clipping defect on `STAGE` by placing track constraints (`height: 4px; overflow: hidden;`) strictly on `.chrome-meter-track` rather than the outer `.crop-growth-meter`. The countdown readout (`Ready to harvest` / `About 85 min remaining`) renders cleanly in crisp tabular serif above an organic golden-amber growth bar.
   - **Minimalist Icon Socket & Rows**: Compact 36×48px recessed socket for the crop illustration, quiet borderless close button (`.crop-inspection-close-btn`), subtle uppercase metadata labels, and highlighted action badge (`Harvest` + `26 Work`).
   - **Action Prompt Suppression**: Suppresses redundant bottom interaction prompt (`SmartActionPrompt`) while inspecting crops via `#ui-container:has(.crop-inspection) :is(.interaction-prompt, .guild-interaction-anchor)`.

9. **Smart Compact Contextual Toolbar (`.guild-tool-belt`, `SmartContextualToolbar`)**:
   - **Compact Footprint**: Dramatically shrunk slot dimensions from a bulky `82px × 86px` down to a sleek, refined `44px × 46px`. Height is cut by more than half, and total width drops from nearly 500px to under 200px when fanned out.
   - **Eliminated Bulky Baroque Picture Frame**: Removed the heavy 18px baroque picture frame (`border-image: var(--guild-panel)` with -21px insets) in favor of a sleek, modern, beveled dark leather & brushed brass dock (`rgba(28, 22, 16, 0.94)` gradient, 1px antique brass hairline border, 6px radius, and subtle inner highlight).
   - **Smart Contextual Filtering ("No Useless Icons")**:
     - Consumable slots with 0 stock (e.g. `0 seeds`, `0 fertilizer`, `0 lures`) are flagged `.is-irrelevant` and collapsed out of view (`width: 0; opacity: 0; pointer-events: none;`) during gameplay instead of sitting as useless disabled clutter. When the player acquires seeds or fertilizer, they dynamically slide into the dock with their icon and count badge.
     - Redundant tools (such as `tool.harvest` in Agronomy when hand tools and contextual prompt `[E] Harvest` already gather crops) stay collapsed unless the player explicitly equips them.
     - Most of the time in farming, the player sees a clean, focused 1-to-3 icon dock rather than a static 5-icon MMO bar.
   - **Streamlined Collapse & Hover Reveal**: At rest, the belt cleanly displays a single ~44px socket for the active tool in hand. Deliberate mouse hover (`.is-browsing`) or keyboard focus smoothly expands all sockets for browsing; unprompted transition nudges fold away in a brisk 1.4 seconds (down from 3.2s).
   - **Refined Micro Typography & Badges**: Clean 10px bold brass keycap indicators (`1`, `2`, `3`) anchored in top-left, 11px amber quantity badges (`×5`), and a unified floating tooltip card (`.guild-tool-readout`) centered above the bar.

10. **Field Journal Folios Polish (`JournalModal`, `HowToPlayGuide`, `AlmanacPage`, `NoticesPage`)**:
    - **Guide Page Layout Fix & Declutter**:
      - **Resolved 32px Vertical Text Crushing Defect**: Switched `.guide-step-card` to a robust flex row (`display: flex !important; flex-direction: row !important; align-items: flex-start !important; gap: 16px !important;`). Made `.guide-step-num` static (`position: static !important; flex-shrink: 0 !important;`) and `.guide-step-content` fluid (`flex: 1 1 auto !important; min-width: 0 !important;`). This completely resolves the bug where `position: absolute` on the number caused CSS grid to squash all step headings, paragraphs, and tips into a cramped 32px column with one word per line.
      - **Removed Redundant Section Heading**: Universally hid `.guidebook-container > .journal-page-heading` ("Working along the coast") to eliminate visual duplication directly under the journal tabs, allowing the sleek sub-tabs (`Actions | Field | Waters | Trade`) to sit cleanly at the top of the content area.
      - **Sleek Sub-Tabs & Cards**: Polished sub-tab buttons with subtle brass borders, warm hover brightness, and gold active indicators. Step cards now have a subtle warm leather background with antique brass border accents.
    - **Almanac Page Polish & Declutter**:
      - **Eliminated Orphan Dotted Underline Leaders (`------`)**: Suppressed `.almanac-facts > div::after` (`display: none !important;`), which previously generated orphan dotted dashes under every column header (`WATERS`, `SEASON`, `ROD`, `WEIGHT`, `VALUE`) when facts were displayed in vertical column cards.
      - **Structured Almanac Facts Grid**: Styled `.almanac-facts` as an auto-fitting, evenly-spaced grid with uppercase 10px muted gold headers (`dt`) and clean 13px ivory values (`dd`).
      - **Refined Search & Unrecorded Species**: Modernized `.almanac-search-input` with dark inset styling and glowing brass focus ring. Unrecorded species receive a subtle embossed brass medallion frame with darkened silhouettes so they feel mysterious and intentional rather than broken.
    - **Notices Board Visual Polish & Contrast Fix**:
      - **Fixed 0:1 Contrast / Invisible White-on-Cream Text**: Notice cards previously had light parchment backgrounds while global modal rules forced body text to ivory/white, rendering notices completely unreadable. Replaced the background with an elegant, cohesive dark leather & slate gradient (`linear-gradient(180deg, rgba(28, 24, 18, 0.78) 0%, rgba(18, 15, 12, 0.88) 100%)`) with a 1px antique brass border.
      - **Crystal-Clear Typography**: Notice titles render in warm gold serif (`#f5da96`), category tags in crisp uppercase gold, and body copy in high-contrast readable ivory (`#dcd6c8`).
      - **Replaced Clunky Knobs & Loud Stripes with Refined Accents**: Replaced the 14px protruding brass knob with a sleek 10px antique brass rivet (`.journal-notice::before`). Replaced thick primary stripes with refined 2px jewel-tone category accents (terracotta for town, gold for market, coastal slate-blue for harbor, sage green for farm).

11. **Hold & Stores Logistics Ledger (`LogisticsLedgerModal.tsx`)**:
    - **Capacity Status Dock (`.stores-capacity-line`)**: Replaced disconnected raw capacity text with a 3-tile status dock (`Satchel`, `Vessel holds`, `Carried catch`) featuring dark leather backgrounds, antique brass hairline borders, 10.5px uppercase gold labels (`dt`), and bold tabular numbers (`dd`).
    - **Tactile Supply Chips (`.stores-supply-row`, `.stores-supply-slot`)**: Rebuilt supplies into an auto-fitting grid of tactile chips. Active items (`.is-occupied`) feature warm brass borders and glowing gold counts (`#f5da96`), while empty items (`count === 0`) are gently muted (`opacity: 0.45`, dashed border).
    - **Vessel Fleet Tabs (`.stores-vessel-tabs`, `.stores-vessel-tab`)**: When a player owns multiple boats (e.g. Wooden Rowboat and Coastal Fishing Skiff), a sleek tab switcher allows toggling between vessels. This eliminates the major UX defect where the entire 15+ item satchel transfer column was duplicated for every vessel, which previously required hundreds of pixels of disorienting scrolling.
    - **Velvet Hold Wells (`.vessel-hold-slot`)**: Upgraded hold slots into 56×64px velvet wells with radial metallic depth, 1px brass border, and inner shadow.
    - **Polished Transfer Rows & Action Pills (`.ledger-transfer-row`, `.ledger-transfer-btn`)**: Rebuilt the transfer lists into 4px rounded cards with item socket, tabular gold count chip, and polished tactile brass action pills (`[Stow X]` / `[Take X]`) with gold glow and hover lift.
    - **Recessed Empty Store Wells (`.ledger-transfer-empty`)**: Styled empty vessel stores as a quiet recessed well with dashed brass border.
    - **Maritime Emerald Hull Meter**: Replaced harsh neon cyan fill with a deep maritime emerald gradient (`#164e3f` to `#42ad82`) with subtle soft glow.

12. **Expedition Board (`ExpeditionBoard.tsx`)**:
    - **Window Sizing & Flex Containment**: Sized to `width: min(880px, calc(100vw - 32px))` and `max-height: min(86vh, calc(100vh - var(--ui-safe-top) - var(--ui-safe-bottom)))` with flex layout, preventing modal overflowing or body disconnects.
    - **3-Pod Readiness Strip (`.expedition-readiness-strip`)**: Replaced the murky greenish bar with 3 distinct instrument cards (`Vessel`, `Supplies`, `Weather`) featuring dark leather backgrounds, antique brass borders, and inset shadows.
      - *Vessel Pod*: Shows vessel name in ivory serif beside a clean maritime emerald hull meter.
      - *Supplies Pod*: 2-column grid displaying all 6 expedition supplies compactly with green/gold count badges on ready items and muted styling on missing items.
      - *Weather Pod*: Weather condition in warm ivory serif with sea state description.
    - **Tactile Opportunity Cards (`.expedition-posted-notice`)**:
      - Upgraded notice cards into rich parchment/leather cards with hover elevation and gold border glow when selected (`.is-selected`).
      - Tone chips (`.expedition-notice-tone`): `Steady` rendered in amber brass badge; `Bold` rendered in maritime sapphire badge.
      - Status badges: `.is-ready` in soft emerald badge; `.is-blocked` in warm amber-terracotta badge.
    - **Notice Detail Panel (`.expedition-selected-notice`)**:
      - Large 22px luminous gold serif title and clear summary copy.
      - 3 metadata tiles (`.expedition-selected-meta`): `DESTINATION`, `RETURN`, and `DEADLINE` formatted as distinct parchment tiles with gold headers and highlighted reward values.
      - Blockers container (`.expedition-blockers`): Refined deep mahogany card with warning icon and clean numbered list, replacing the harsh red box.
      - Ready container (`.expedition-ready-note`): Soft moss emerald card with green left accent.
13. **Portolan Nautical Chart & Map System (`WorldMapModal.tsx`, `WorldChartTerrain.tsx`, `coastal.css`)**:
    - **Authentic Portolan Cartography**:
      - Replaced flat modern AutoCAD-like green sea (`#657f76`) with deep charted oceanic bathymetry (`#1a3038` to `#24424c`).
      - Added 16-ray medieval portolan rhumb/loxodromic navigation lines radiating across the archipelago from two primary windrose origins `(250, 410)` and `(760, 300)` with gold compass rings and navigation arcs.
      - Implemented 3-tier coastal bathymetric depth: outer deep shelf, inner shallow shelf, and stippled gold shoal contour.
      - Hand-inked double-line parchment coastlines (`#281e14` and `#8c734b`) with warm parchment island fills (`#ddd1b8`), hatched medieval farm plots, and arterial roads.
    - **Resolution of Text Collisions & Giant Overlapping Labels**:
      - *Root Cause*: `coastal.css` had `stroke: rgba(248, 244, 232, 0.94); stroke-width: 3.5px;` applied to all map SVG text. In zoomed view (`290×203` viewBox), 1 SVG unit = 2.24–3.4 screen pixels, turning a 3.5px stroke into a massive 7.84px solid white chalk halo around every letter. In addition, quest pins and player markers had no zoom-scaling factor, rendering at 25–40px screen sizes over adjacent labels.
      - *Resolution*: Replaced 3.5px chalk stroke with a refined, authentic 0.9px medieval paper stroke (`rgba(250, 246, 235, 0.92)`). Added zoom-aware coordinate scaling (`scale(0.45)` when zoomed) to map nodes, live fish schools, quest pins, and player beacon.
      - *Progressive Disclosure*: In Open Sea (macro view), non-major inland sub-nodes are hidden unless selected or hovered, keeping the open sea view clean, uncluttered, and majestic.
    - **Authentic 16-Point Astrolabe Windrose**:
      - Replaced generic clipart compass with an ornate 16-point medieval astrolabe windrose: dual brass bezels, dashed degree ring, 8 quarter-wind rays, alternating half-winds, deep iron cardinal points, and royal fleur-de-lis / vermilion spearhead pointing true North.
      - Zoom-adaptive positioning keeps the windrose visible and perfectly proportioned in both macro sea view and zoomed island views.
    - **Explorer's Logbook & Island Places Directory**:
      - Replaced the previously empty right sidebar with an interactive, scrollable **Places Directory** listing every charted location for the active region with place names and real-time distance in meters (`dist m`).
      - Clicking any place instantly focuses and selects the node, highlights the pin on the map, and displays relevant route/market/fishing/farm notes.
    - **Antique Brass & Parchment Area Tabs**:
      - Replaced generic grey buttons with antique brass & vellum cartographic navigation ribbon tabs with gold active states and crisp serif typography.
    - **Continuous Zoom, Pan, and LOD System**:
      - Hybrid navigation: macro preset bookmarks (`Open Sea`, `Neva Island`, `Sunreach Cove`) paired with free click-and-drag panning across the entire chart.
      - Smooth mousewheel zoom (1x to 4x) centered on cursor coordinates with clamped bounds.
      - On-canvas antique brass zoom controls (`[+]`, `[1:1]`, `[-]`) positioned in the lower-left corner of the chart canvas.
      - Dynamic continuous LOD scaling for labels, icons, markers, and beacons (`markerScale = clamp(0.38, 1 / zoomRatio, 1.0)`), completely preventing pin overlap and label clutter at high magnification.
    - **Authentic Cartographic Vignettes**:
      - *Quad-Fold Parchment Creases*: Subtle diagonal, horizontal, and vertical crease shadows and highlights simulating real folded antique parchment charts.
      - *Title Cartouche*: Classical baroque engraved ribbon cartouche (*"ARCHIPELAGUS NEVENSIS · TABULA HYDROGRAPHICA ET NAUTICA"*) anchored in the northwest corner.
      - *Neatline Graticule*: Antiqued double-rule neatline border with alternating brass checker ticks and latitude/longitude degree stamps (`34°10' N`, `12°45' W`, etc.).
      - *Mythical Sea Leviathan*: Hand-inked mythological sea monster with rhythmic surface ripples and the Latin cartographic epigraph *"Hic sunt dracones"* lurking in the outer ocean deeps.
    - **Thematic Maritime Lenses**:
      - *Markets Lens*: Golden dashed maritime shipping lanes connecting Neva Harbor and Sunreach Cove with directional flow arrows and an arbitrage trade banner.
      - *Fishing Lens*: Historic bathymetric depth soundings (`6 fm`, `34 fm`, `52 fm`) and aquatic shelf contours.
      - *Farmland Lens*: Loamy green-gold soil fertility parcel highlights overlaying agricultural plots.
    - **Waypoint Navigation & In-Game Compass Ribbon Synchronization**:
      - Direct click-to-pin nautical waypoints anywhere on land or sea (with drag-vs-click threshold detection), or via the `[🧭 Plot Course to Location]` sidebar button.
      - Dynamic course plotter line directly connecting the player to the destination with an on-chart course bearing badge (`ESE 112°`, distance, and travel time ETA).
      - Dedicated "Active Course Bearing" card in the sidebar displaying real-time heading, distance, ETA, and a `[Clear]` button.
      - Live HUD synchronization: Plotted waypoint is seamlessly injected into `worldHud.compass.nearbyMarkers` as an amber/gold pulsing beacon (`◆ WAYPOINT · [dist] m`), guiding player travel without opening the map.

14. **Character & Gear Wardrobe Modal (`CharacterScreen.tsx`, `CharacterPreview3D.tsx`, `coastal.css`)**:
    - **Interactive 3D Drag-to-Rotate Stage**:
      - Added fluid pointer event listeners (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`) on the WebGL canvas, allowing players to drag horizontally to inspect equipped clothing, hats, backpacks, and fishing rods 360°.
      - Smooth angular velocity damping (`targetAngle` interpolation) with graceful idle sway resumption after 2.5 seconds of inactivity.
      - Dynamic cursor feedback (`cursor: grab` / `cursor: grabbing`), grounded circular stone/brass dais (`.character-preview-pedestal`) with soft contact shadows and ambient golden light, replacing the broken polygon halo.
      - Gilded status pill badge (`Current Gear` / `Trying On`) with non-intrusive rotation hint badge.
    - **Tactile Recessed Gear Sockets**:
      - Upgraded all slot icons (equipped loadout and wardrobe list) into tactile 36×36px recessed brass sockets (`.character-slot__glyph`, `.character-owned-item__mark`) with radial metallic gradients, inner bevel drop shadows, and antique brass rims.
      - Synchronized selection highlight (`.is-selected`): Clicking an equipped slot on the left visually highlights it with a warm gold border and illuminated active pip, synchronizing with the right-hand comparison pane.
    - **Wardrobe Category Filter Tabs**:
      - Added compact filter tabs (`All`, `Clothes`, `Tools`, `Rods`) above Owned Gear with real-time item count pills, allowing effortless organization as the player's wardrobe expands.
      - Emerald gilded status badge (`.character-item-badge.is-equipped`) for currently worn items.
    - **Inspector & Comparison Card Overhaul**:
      - Replaced raw flat article with an embossed leather card featuring antique brass borders, Crimson Pro serif title in bright gold leaf (`--guild-gold-bright`), slot pill tag, and clean ivory description.
      - Replaced generic unstyled bullet points with illuminated golden jewel bullets (`.character-effect-bullet`), styling "No specialist bonus" in muted italic.
      - **Resolved Duplicate Disabled Button UX Defect**: When an equipped item is selected, the inspector previously rendered two disabled buttons side-by-side (`[Current]` and `[Equipped]`). Replaced this with a single polished gilded chip (`Currently Equipped`), keeping `[Try On]` and `[Equip]` for unequipped gear.
    - **Gilded Header & Capacity Readout**:
      - Crimson Pro serif title in bright gold leaf with antique brass capacity pill (`5 / 20 Spaces` and in-progress reservations).

15. **Guildcraft Satchel & Inventory Modal (`InventoryModal.tsx`, `coastal.css`)**:
    - **Persistent 16-Socket Grid (Preserving Bag Structure & Spatial Memory)**:
      - Maintained the physical 16-socket satchel layout across all category tabs (`All`, `Field`, `Fishing`, `Supplies`) and search states, adhering strictly to Art Bible `04` §17 (*"Empty slots are dimmed but keep their socket, because they are still a statement about capacity"*).
      - Dimmed non-matching items (`.is-dimmed` with 22% opacity, 70% grayscale, and hover peek lift) rather than deleting slots from the DOM into a blank void.
    - **Symmetrical 4×4 Square Grid**:
      - Replaced the awkward 6-column grid (which produced a 6 + 6 + 4 jagged tooth with 2 empty spaces on row 3) with a balanced, square 4-column × 4-row layout.
      - Sits at ~310px height, matching the right-hand item inspector pixel-for-pixel.
    - **Content-Fitting Dimensions & Zero Vertical Void**:
      - Sized modal to `width: min(820px, 94vw); height: auto; max-height: min(620px, 90vh)` to eliminate the 300px+ empty black abyss below the slots and inspector.
    - **Streamlined Navigation Ribbon & Unified Organize Disclosure**:
      - Combined the category tabs (`All`, `Field`, `Fishing`, `Supplies`) and the `[Organize]` action onto one horizontal navigation bar (`.inventory-nav-bar`).
      - Expandable search and tidy tools slide in cleanly beneath when toggled.
16. **Mobile PWA Install Prompt & Home Screen Integration (`PwaInstallPromptModal.tsx`, `usePwaInstall.ts`, `StartScreen.tsx`, `EscapeMenuModal.tsx`, `index.html`, `public/sw.js`)**:
    - **Physical Guildcraft Aesthetic & Benefits-First Presentation**:
      - Designed a dedicated Guildcraft modal (`.pwa-install-sheet`) encased in ornate 9-slice gilded framing (`tone="slate"` with brass corner rivets and parchment filigree).
      - Replaced raw browser banners with a maritime instrument prompt highlighting 3 key handheld player benefits:
        1. *Pure Fullscreen Canvas*: Eliminates mobile URL address bars, tabs, and bottom navigation bars for distraction-free coastal gameplay.
        2. *Instant 1-Tap Launch*: Adds a high-fidelity golden compass emblem icon to the player's home screen.
        3. *Smoother 60 FPS Response*: Bypasses multi-tab browser overhead and prevents accidental pull-to-refresh or navigation swipe gestures.
    - **Lobby Placement**: The automatic invitation appears on the **starter/title screen only** for handheld players (`startup.status === "title"`), never during play. Players are not interrupted mid-session; the guide stays available from the in-game Escape Menu (`Add to Home Screen`) whenever they want it.
    - **Desktop Discovery (No Auto-Popup)**: Desktop keeps the quiet title utility `Install app` beside `Options` — shown only while a native browser prompt is ready (`canPromptDirectly`) and the player has not installed or dismissed it, so it is one-time. Clicking it opens the same guide; the Escape Menu entry remains in-game.
    - **Adaptive Platform Detection & Guided Workflows**:
      - **Android (Chrome / other)**: Uses the boot-stashed `beforeinstallprompt` event for a seamless 1-tap installation via `[Add to Home Screen]`. When Chrome has not produced the native event yet (first visit / engagement heuristic), the modal falls back to explicit 3-step Android instructions instead of a dead button.
      - **iOS (Safari / Chrome)**: Automatically provides an illustrated 3-step walkthrough tailored to the detected iOS browser:
        - Step 1: Tap the Share icon (or Chrome menu button in toolbar).
        - Step 2: Scroll down and select *"Add to Home Screen"*.
        - Step 3: Tap *"Add"* in the top-right corner.
      - **Desktop**: Direct install button when the browser offers one; otherwise a toolbar install hint.
    - **Reliable Prompt Capture**: `index.html` stashes `beforeinstallprompt` and `appinstalled` before React mounts, and `usePwaInstall.ts` consumes the stashed event plus the `neva:installprompt` / `neva:appinstalled` bridge events. A pass-through `public/sw.js` (no caching) satisfies browsers that still gate installability on a `fetch` handler.
    - **Persistent State & Dismissal Snooze**:
      - Remembers user choice via `localStorage`: "Maybe Later" snoozes automatic prompts for 7 days (`neva_pwa_dismissed_until`).
      - Hides the automatic modal when already installed or running in standalone display mode (`navigator.standalone`, `display-mode: standalone`, or the `neva_pwa_installed` flag set by `appinstalled`).
      - Permanent access retained via the in-game Escape Menu (`Add to Home Screen`), allowing players to revisit installation anytime.
    - **Strict Zero-Emoji & SVG Standard Compliance**:
      - All instructional icons, step indicators, and bullets use pure inline SVGs or `HudIcons` marks, adhering 100% to the project's strict `no_emoji_in_ui` test barrier.
17. **Guildcraft Pointer Cursor (`src/ui/chrome/GuildcraftCursor.ts`, `guildcraftCursor.css`)**:
    - **Painted Pointer**: Fine-pointer desktops replace the system cursor with the published `guildcraft-pointer` sprite (30px, tip-anchored, tilted -45° up-left like a classic pointer) in one body-level node appended outside the HUD zoom, matching the compass arrow already used by the minimap family.
    - **Live States**: Interactive controls and world interaction targets scale the pointer up with a warm gold aura; disabled (`:disabled` / `aria-disabled`) controls dim and desaturate it; pressing scales it down. State comes from the existing DOM controls and the world canvas's own `cursor: pointer` signal (including changes while the mouse is still), never from new gameplay state.
    - **Safe Fallbacks**: The native cursor stays until the sprite loads and returns for coarse/touch pointers, forced-colors mode and sprite-load failure. The node is `aria-hidden` and `pointer-events: none`, and owns no input, simulation or saved state.
    - **Cascade Ownership**: `coastal.css` declares the `guild-cursor` layer before `neva-ui` (`@layer guild-cursor, neva-ui;`), so `cursor: none !important` outranks every HUD cursor rule regardless of selector specificity in both DEV and the production bundle.

---

## 4. Checklist for Future UI Components

When designing or polishing any new modal, inspector, or HUD element in Neva:
- [ ] **No Artificial Padding on Overlays**: Ensure `.modal-overlay` uses `padding: 0 !important;` with centered flexbox.
- [ ] **Material Consistency**: Use `.game-sheet` or the unified leather/slate gradient (`rgba(28, 25, 20, 0.98)` to `rgba(18, 16, 13, 0.99)`) with paper grain.
- [ ] **Border Framing**: Use `border-image: var(--guild-panel)` for major modals or `rgba(165, 139, 73, 0.25)` hairlines for cards/sections.
- [ ] **Scrollbars**: Apply the slim 6px antique brass scrollbar rules to all scrollable containers.
- [ ] **Typography Hierarchy**: Use Crimson Pro serif for titles and narrative; clean sans-serif for numbers, tags, and meters.
- [ ] **Interactive States**: Add hover and active transitions to buttons (`translateY(-1px)` and subtle brightness boosts).
- [ ] **Zero Mobile Breakage**: Use `min(...)` with safe-area variables (`env(safe-area-inset-*)`) so UI scales flawlessly on both desktop and mobile viewports.
