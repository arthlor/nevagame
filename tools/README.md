# tools/

Pointer only — not an authority. Catalog-driven Blender production is owned by
`LLM/BLENDER.md` and documented for daily use in `tools/blender/README.md`.

Folder dumps (`@tools`, `@LLM`) do not change that routing. “Generate assets”
means: selected catalog ID → registered family generator →
`npm run art:generate -- --asset <id>` → Art Yard →
`Awaiting human game review`.

Do not treat `tools/art/import_polyfork.mjs`,
`tools/art/register_polyfork_catalog.mjs`, or
`tools/blender/generators/generate_all.py` as the generate-asset front door.
Isolated studio sheets live in `tools/blender/references/isolated/`.
