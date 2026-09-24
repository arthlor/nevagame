# tools/

Pointer only — not an authority. Route work to the owner below; do not infer a
workflow from a folder dump.

- **Catalog art / GLB production:** obey `LLM/BLENDER.md`, then use
  `tools/authored/README.md`. The normal path is selected catalog ID → registered
  family generator → `npm run art:generate -- --asset <id>` → Art Yard →
  `Awaiting human game review`. Generators are authored Three.js factories in
  `tools/authored/generators/`; families still on Blender (`tools/blender/`,
  see its README) are ported rather than extended, and Blender stays only as
  the donor-import adapter. Preview authored generators live with
  `/__neva_art_yard?asset=<id>&live=1`. Isolated studio sheets live in
  `tools/blender/references/isolated/`.
- **World layout / F2 Place editor:** obey `LLM/LAYOUT_EDITOR.md`. Runtime editor
  code lives in `src/layout-editor/` and `src/app/PlacementEditor.ts`; the Vite
  patch boundary is `tools/layout-editor/patchPlacement.ts`.
- **UI atlas:** use the source definitions and publishing scripts under
  `tools/ui/`; generated atlas output is presentation data, not gameplay state.
- **Audio preparation:** use `tools/audio/` for local import, conversion, and
  provenance. `LLM/06_AUDIO_AND_MUSIC_DESIGN_MASTER.md` owns the seven semantic
  roles and mastering targets. Preview the resolved cue-bus/spatial mapping
  with `npm run tools -- audio plan`,
  then apply two-pass normalization with `npm run audio:normalize`. The command
  emits spatial sources as mono, other sources as stereo, and atomically
  updates runtime MP3s plus manifest hashes/durations/channels.
- **Vite development support:** development-only plugins and endpoints under
  `tools/vite/` support the owning runtime/editor workflows; they are not
  production gameplay authorities.

The unified front door is `npm run tools -- <command>`. Run it without a
command in a terminal for the interactive menu. Visual baselines use
`npm run visual:update`; normal comparison uses `npm run visual:test`.

Do not treat `tools/blender/generators/generate_all.py` as the generate-asset
front door.
