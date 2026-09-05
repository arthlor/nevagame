# Minimalist Tidebook HUD review

Final result: passed for desktop layout and interactions; awaiting human design review.

## Current brief

The user superseded the ornate image-matching brief with a request for a more minimalist HUD that retains the medieval/MMO character. The original image at `art/references/neva-tidebook-hud.png` is now material inspiration, not a pixel-equality target. The world renderer is outside this UI redesign.

The implementation retains illustrated tools, a small nautical instrument, parchment-colored serif text, and muted brass edges. Large leather quest frames, hinged tool plaques, decorative meter frames, calendar paper, and hanging purse artwork have been removed from the mounted HUD. The five stance-specific actions and live simulation-derived values remain intact.

## Desktop evidence

- `output/tidebook-qa/minimal-1672x941.png`: actual browser viewport 1672 × 941; Auto UI scale 1.15. Quest/objective/progress, compass, calendar/weather, purse, Work/Sprint, five tool slots, and utility controls remain readable and separate. The real fog warning is visible.
- `output/tidebook-qa/minimal-1280x720.png`: actual browser viewport 1280 × 720; Auto UI scale 0.9. The compact action and utility groups remain within the viewport. This capture preceded the final warning-width correction; the final desktop capture shows that correction.
- The satchel button was clicked in the revised compact layout. The live Satchel dialog opened with inventory contents and was closed with its Close button.
- Earlier interaction checks in this implementation also exercised tool selection, forecast, journal, chart, contract expansion, and pause/resume. Those handlers were preserved in the minimalist pass.
- Temporary viewport overrides were reset and the Small interface preference was restored after captures. The preview remains at `http://localhost:3341/`.

## Findings and corrections

- P2, resolved: the ornate HUD occupied too much attention and space for the user's revised brief. Replaced the large silhouette frames with compact slots, slim resources, and a text-first objective tracker.
- P2, resolved: a narrow weather rail forced the warning into many short lines after shrinking the clock. The contextual warning now has its own wider, right-aligned width.
- P2, resolved during initial implementation: atlas artwork could expose neighboring sprite pixels when letterboxed. Each AtlasImage now clips the underlying page to its declared frame.
- P3, accepted scope limit: the original painted study is not reproduced pixel for pixel. Its large ornaments were explicitly superseded by the user's request.

## Verification boundary

The final HUD component, atlas packing, and sheet-selection tests pass. TypeScript (`tsc --noEmit`) and the scoped whitespace check pass. The final combined focused run passed 49 of 50 tests. The fishing rod/stow test exceeded its 30-second timeout, and its isolated file rerun again passed 8 tests with that same timeout. This remains a verification gap; no assertion mismatch was reported. An earlier pre-minimalist run passed all 50 tests.

No save schema, canonical gameplay state, migration, input binding, or renderer configuration changed for the minimalist revision. Touch fallback rules retain 44 px action targets and lift the HUD above movement controls; physical mobile-device review has not been performed. No production performance benchmark, deployment, or release certification is claimed.
