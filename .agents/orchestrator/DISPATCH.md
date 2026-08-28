## 2026-08-27T17:07:07Z
You are the Project Orchestrator for Neva's Clean Modern-Medieval UI Overhaul.
Your working directory is `/Users/anilkaraca/Desktop/Neva/.agents/orchestrator`.

The user request is authoritatively recorded in `/Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md` and detailed project architecture and milestone plans are in `/Users/anilkaraca/Desktop/Neva/PROJECT.md`.

NOTE: Milestone 1 (Design Tokens, Chrome Primitives, SVG Flourishes in `HudDecorations.tsx`, and `uiAudio.ts`) has already been implemented and verified.
Resume execution directly from Milestone 2 (In-Game Split-Corners HUD) through Milestones 3, 4, 5, and 6 as defined in PROJECT.md:

- Milestone 2: Classic RPG Split-Corners In-Game HUD (`HUD.tsx`, `QuestTrackerHUD.tsx`, `hud.css`, `FarmForecastPopover.tsx`, etc.)
- Milestone 3: Slate & Gold Ornate Modals (Part A: `InventoryModal.tsx`, `MarketModal.tsx`, `JournalModal.tsx`, `WorldMapModal.tsx`, `HowToPlayGuide.tsx`)
- Milestone 4: Slate & Gold Ornate Modals (Part B: `LogisticsLedgerModal.tsx`, `DialogueModal.tsx`, `EscapeMenuModal.tsx`, `StartScreen.tsx`, `ExpeditionBoard.tsx`)
- Milestone 5: Tactile Gameplay Overlays, Minigames & Audio Polish (`BasicFishingMinigameWidget.tsx`, `FishingHUD.tsx`, `PlantingSeedBar.tsx`, `FarmGISLegend.tsx`, `CatchInspectionModal.tsx`, `ContextualHintCard.tsx`, `GameUI.tsx`)
- Milestone 6: Final Verification & Build Certification (`npm run typecheck`, `npm run assets:sync`, `npm run build`)

Key Non-Negotiable Invariants:
1. UI remains strictly presentation-only, receiving `GameState` and invoking provided callbacks without owning simulation mutations.
2. Maintain existing sprite assets from `public/assets/ui/atlas` via `uiAtlas.ts` / `AtlasImage.tsx`.
3. Keep `progress.md` updated at every milestone step.
4. Ensure `npm run typecheck`, `npm run assets:sync`, and `npm run build` pass cleanly before reporting completion.
