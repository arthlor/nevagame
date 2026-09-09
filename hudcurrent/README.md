# Neva HUD current

Browser evidence pass captured on 2026-09-08 from the local Neva runtime. The folder contains 68 PNGs at 1440×900 desktop and 844×390 touch-landscape sizes. `90-dev-diagnostics.png` and `91-dev-layout-editor-final.png` are intentionally DEV-only; the rest are player-facing or player-facing startup/recovery states.

The screenshots are evidence for the polish review, not visual approval. They were taken from a real Chromium session with the live Three.js canvas and DOM UI visible together. The source worktree was already dirty; this pass did not edit Neva source files.

## Startup, title, and recovery

- [Title](./00-start-title.png)
- [Options — Graphics](./01-start-options-graphics.png), [Audio](./01-start-options-audio.png), [Interface](./01-start-options-interface.png), [Controls](./01-start-options-controls.png)
- [Loading progress](./02-start-loading.png)
- [First-entry intro](./04-start-intro.png)
- [Save unavailable warning](./05-start-no-save-warning.png) and [continue without saving confirmation](./06-start-no-save-confirm.png)
- [Existing save summary](./07-start-existing-save.png) and [replace-save confirmation](./08-start-new-game-confirm.png)
- [Forced asset-abort error recovery](./03-start-error-recovery.png)

## Everyday world HUD

- [On-foot HUD](./10-hud-on-foot.png)
- [Expanded contextual tool belt](./11-hud-toolbar-expanded.png)
- [Farm forecast](./12-hud-farm-forecast.png)
- [Farm field-sign legend](./13-hud-farm-gis-legend.png)
- [NPC dialogue](./14-hud-dialogue.png)
- [Mounted donkey HUD](./28-hud-mounted.png)
- [Farming action status](./29-hud-farming-action.png) and [crop inspection](./29-hud-crop-inspection.png)
- [Boat console](./30-hud-boat-console.png) and [boat-driving HUD](./32-hud-boat-driving.png)
- [Sport-fishing fight HUD](./33-hud-sport-fishing.png)
- [Landed catch summary](./35-hud-catch-summary-final.png)
- [Trophy catch inspection](./36-hud-catch-inspection-observed.png)
- [Basic fishing — cast charge](./23-hud-basic-fishing-cast-charge.png), [waiting for bite](./24-hud-basic-fishing-waiting-bite.png), [bite alert](./25-hud-basic-fishing-bite.png), [reeling](./26-hud-basic-fishing-reeling.png), [landed](./27-hud-basic-fishing-landed.png), and [escaped](./27-hud-basic-fishing-escaped.png)

The sport-fishing fight capture is a clean player-facing state. The older post-fight toast capture retains the DEV-only Place chip from its first runtime pass; it is kept as evidence of the landed-catch presentation, while the inspection modal is the clean polish-review image.

## Pause and settings

- [Pause menu](./15-hud-pause.png)
- [Graphics](./16-hud-pause-settings-graphics.png), [Audio](./16-hud-pause-settings-audio.png), [Interface](./16-hud-pause-settings-interface.png), and [Controls](./16-hud-pause-settings-controls.png)
- [Safe Return confirmation](./17-hud-safe-return.png)
- [Emergency Tow confirmation](./18-hud-emergency-tow.png)
- [Collapsed active objective tracker](./09-hud-quest-tracker-collapsed.png)
- [Expanded active contracts tracker](./09-hud-contracts-expanded.png)
- [Hold & Stores logistics ledger](./37-hud-hold-and-stores.png)

## Field Journal

- [Story](./19-hud-journal-story.png)
- [Records](./19-hud-journal-records.png)
- [Coastal Almanac](./19-hud-journal-almanac.png)
- [Skills](./19-hud-journal-skills.png)
- [Guide](./19-hud-journal-guide.png)

## Nautical Chart

- [Geography lens](./20-hud-chart-geography.png)
- [Markets lens](./20-hud-chart-markets.png)
- [Fishing lens](./20-hud-chart-fishing.png)
- [Farmland lens](./20-hud-chart-farmland.png)

## Satchel and market

- [Satchel — All](./21-hud-satchel-all.png), [Field](./21-hud-satchel-field.png), [Fishing](./21-hud-satchel-fishing.png), [Supplies](./21-hud-satchel-supplies.png), and [Organize/search](./21-hud-satchel-organize.png)
- [Market — Buy](./31-hud-market-buy.png), [Sell](./31-hud-market-sell.png), and [Fish hold](./31-hud-market-fish-hold.png)
- [Expedition Board](./38-hud-expedition-board.png)
- [Market — Deliveries](./39-hud-market-deliveries.png)

The advanced save fixture exposes both the Expedition Board and the market Deliveries tab; the captures use that authored state rather than the empty harbor fixture.

## Farm placement and touch layouts

- [Farm placement](./22-hud-farm-placement.png)
- [Mobile landscape HUD](./40-mobile-landscape-hud.png)
- [Mobile landscape pause](./41-mobile-landscape-pause.png)
- [Mobile landscape chart](./42-mobile-landscape-chart.png)
- [Portrait orientation gate](./43-mobile-portrait-orientation-gate-final.png)

## DEV-only review surface

- [Diagnostics overlay](./90-dev-diagnostics.png)
- [Place/F2 layout editor](./91-dev-layout-editor-final.png)

The DEV-only screenshots are separated from the player-facing review set so debug text and layout-authoring controls are not mistaken for product HUD.

## Coverage status

The previously blocked states were closed in the final pass: basic fishing, Hold & Stores, tracker variants, portrait orientation, Place/F2, Expedition Board, Deliveries, and forced startup recovery. The only intentional exclusions from the player-facing set are the two DEV-only diagnostic/editor screenshots, which are kept separately for implementation review.
