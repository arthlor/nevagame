# Authored assets (code -> GLB)

This directory holds Neva's **code-authored** buildings: procedural TypeScript factories that are the
editable source of truth, plus the tool that turns them into the catalog GLBs Art Yard and the game
load.

```bash
npm run art:authored                         # rebuild every authored model (also publishes)
npm run art:authored -- building_wooden_outhouse_a   # rebuild one
npm run art:authored -- --no-publish         # offline source only
```

Each run writes one GLB into `art/authored/<model>/export/` (the offline source, committed) and
copies it to `public/assets/models/` (the runtime path the catalog and Art Yard read). Runtime never
reads the `export/` directory.

## Why a non-Blender path exists

Every other catalog asset is produced by a Blender generator under `tools/blender/generators/`. These
buildings were reconstructed from reference photos as measurable, code-only Three.js factories,
and porting them to Blender would discard the reconstruction. So `tools/authored` is a deliberate,
documented exception: a TS -> GLB production path. It does not replace the Blender pipeline and adds
no catalog authority: every asset it emits still passes the same catalog schema, generator, palette,
and budget validation as any Blender-built asset.

## Editing

- Edit `tools/authored/<model>/create<Model>Model.ts`. The factories import only `three` (0.174);
  `tools/` is in `tsconfig.json`'s `include`, so `npm run typecheck` and `npm run lint` cover them.
- The root object name must stay `<assetId>_root` (the catalog `rootNode`).
- Run `npm run art:authored`, then publish/`art:codegen` as usual. Do not hand-edit the GLB.

## Catalog integration

Each model has a normal `assets/specs/asset-catalog.json` entry with `generator: "prebuilt_glb"` and
`parameters.sourceGlb` pointing at the offline export. They appear in Art Yard like any other asset.

They are deliberately **outside the Blender published manifest** (`generated/reports/asset-manifest.json`
/ `public/assets/models/asset-manifest.json`). `validatePublishedManifest`, `syncPublishedManifest`,
`validatePublished`, and the Blender `generate`/`determinism` build set all skip `prebuilt_glb`, so
the manifest keeps meaning "produced and validated by Blender". The catalog still requires a valid
generator contract, palette tokens, and a budget, and `npm run art:codegen` / CI's
`art:codegen:check` enforce that.

## Adaptation

The builder re-skins each factory's textured materials onto Neva's palette before export
(`adaptToPalette` in `export-entry.ts`):

- Every mesh maps to one of at most 16 shared palette-token materials named for the token, sampled
  from the mesh's true average colour (`material.color x texture average x vertex tint`). Tokens are
  drawn from a craft subset so a plaster wall never lands on a water-foam token.
- Textures are dropped (flat, faceted style) and COLOR_0 is baked with the full authored colour, with
  the material factor left white, so the loader's `multiply` reproduces the original colour.
- `side: DoubleSide` is preserved, which the thatch/foliage/panel shells depend on.
- Emissive parts map to `emissive_window_01` / `emissive_lantern_01`; Neva drives their strength.

Result: 10–16 materials and zero textures per model (was 16–36 materials and up to 24 textures),
with the look intact. `npm run art:authored -- --raw` skips adaptation for comparison.

**Structure.** Each exported scene is
`<id>_root` → `<id>_LOD0` (full) + `<id>_LOD1`/`_LOD2` (meshoptimizer-decimated) + `COL_<id>` (box
collider, hidden by `AssetLoader`). The collider is sized to the **building only** — the lot's garden,
fences and stored props are excluded via `LOT_NODES` so the placed garden stays walkable instead of
becoming an invisible wall. The catalog declares the LOD tier, `lodLevels` and the `requiredNodes`,
with box `collisionPrimitives` (also building-only) as the physics proxy. LOD1/LOD0 ratio is about
0.4–0.8 depending on how much of the model is genuinely reducible.

`art:validate` (the Khronos validator) is still not run for authored assets; they are outside its
Blender manifest.

## Determinism

The factories seed their procedural noise, and the builder always builds with defaults. Two runs are
not byte-identical — three's `GLTFExporter` packs textures asynchronously, so only the order of the
image bufferViews varies — but they are semantically identical: same hierarchy, same geometry bytes,
same texture set. `--verify` builds each target twice and asserts that:

```bash
npm run art:authored -- --verify
```

The builder also strips glTF `extras` from every object. The factories keep a `sculptRuntime`
inspector payload in `userData` that embeds three's random UUIDs, which `GLTFExporter` would
otherwise copy into the asset and make the bytes differ every build. Neva reads none of it.
