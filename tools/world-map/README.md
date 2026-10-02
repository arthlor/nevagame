# Source-derived world map

The full chart uses one clean WebP plus the generated projection in
`public/assets/world-map/manifest.json`. The minimap keeps its existing
`WorldChartTerrain` behavior. The atlas pipeline adds no browser-side terrain
sampling, Python, static-placement generation, tiles, large source rasters or
extra render loop.

## Regenerate after a world/layout change

Use the repository's supported Node version and `npm ci`. Only explicit map
regeneration also needs Python 3.11+ and the pinned packages in `requirements.txt`:

```sh
python3 -m venv /tmp/neva-world-map-venv
/tmp/neva-world-map-venv/bin/python -m pip install -r tools/world-map/requirements.txt
PYTHON=/tmp/neva-world-map-venv/bin/python npm run map:build
npm run map:test
npm run map:check
```

`PYTHON` may point to an existing compatible interpreter. Missing packages,
incompatible versions or missing Pillow WebP support fail before extraction,
with setup instructions. Fonts, a browser, a display server and system-specific
paths are not required. The ordinary game build/dev/test commands do not install
or invoke Python and do not regenerate the map.

For a pipeline/toolchain change, verify two independent source extractions and
renders before publication:

```sh
PYTHON=/tmp/neva-world-map-venv/bin/python npm run map:build -- --verify --keep-work
```

`--verify` requires byte-identical WebP and manifest outputs. `--keep-work` prints
the temporary extraction/master directory for visual inspection. Those files are
review evidence only and must not be copied into the runtime directory. Inspect
the generated base and the open chart at representative desktop/touch sizes.
Source determinism and image inspection do not replace browser interaction or
measured production performance checks.

Include these generated files together with the source change:

- `public/assets/world-map/world-map-2048.webp`
- `public/assets/world-map/manifest.json`
- `tools/world-map/build-info.json`

Restart the dev server and reload the chart after regeneration so its imported
manifest and cache-busted image URL update together.

Do not edit them by hand. `config.json` owns map presentation resolution, sampling
pitch and the fixed reference seed. Geography remains owned by `src/world/`.

## Ownership and projection

- `extract.ts` runs in Vite-node using `vite.config.ts` in this directory and the
  existing runtime asset-catalog plugin. It imports the current `WorldLayout`,
  mainland water/biome fields, compiled route samples, farm layouts, brook
  courses and complete static-placement generator. There is no frozen bundle,
  copied catalog, commit-specific branch or copied lake formula.
- Terrain heights and water membership are sampled through their canonical
  queries. The lake/lowland river outline is a contour of the current water
  union. Sampling bounds derive from authored water geometry and fail on an
  open contour rather than silently truncating the river.
- `render.py` derives cartographic relief, contours, nearshore tint, sparse
  source-positioned canopy, roads, farm rectangles and source-positioned/rotated building symbols.
  Nearshore tint is decorative, not quantitative bathymetry. It renders no
  labels, discovery points, quest icons, notes, player marker or destinations.
  Buildings use declared grounding extents when available; otherwise they use a
  small standard cartographic symbol. They are not surveyed collider, roof or
  mesh outlines. Default-seed
  scenery is a reference base and may differ from another save's tree seed.
- `build.mjs` validates the bounded WebP, writes the shared projection and
  publishes the receipt last. It refuses to publish if source inputs changed
  while the build was running. Failed generation retains the prior outputs.
- `manifest.projection` is the only full-chart transform: world X/Z metres,
  +X to the right, +Z down, north = -Z. Bounds come from `SAILABLE_BOUNDS`.
  Pixel X/Y = padding + (world X/Z - bounds minX/minZ) × pixelsPerWorldUnit;
  UV = pixel X/Y divided by projection width/height. Scale UV into the displayed
  image dimensions and account separately for letterboxing. The full chart's
  transform is not the legacy clamped minimap projection.
- `manifest.texture` records the runtime filename, dimensions, encoded/decoded
  byte sizes and SHA-256. The runtime uses the hash in its URL for cache busting.
  Runtime labels and limited live overlays continue to come from existing
  presentation DTOs and authored chart nodes, with their visibility rules.

## Cheap freshness checks

`npm run map:check` is read-only Node work. It never imports the world, starts
Vite, samples terrain, generates placements, invokes Python, decodes an image or
changes a file. It rediscovers transitive imports from the extraction and build
scripts, hashes those sources plus the current catalog, package/lockfile, Node version file, TS resolution
config and Python requirements, then checks both published output hashes.
New/deleted imports and changed generation scripts invalidate the same receipt.
The detailed file list lives in the tools-only receipt; the browser imports only
the small projection/texture manifest.

The fingerprint is independent of git branch, commit ID, checkout directory,
timestamps and sampling duration. npm dependencies are pinned by the lockfile;
Node/Python versions and the Pillow libwebp version are recorded in the receipt.
Byte-for-byte determinism is verified for the recorded toolchain; changing its
versions requires regeneration and review, including when a platform provides a
different libwebp build. `map:check` intentionally needs no Python installation.

A stale/corrupted map exits nonzero and lists changed inputs or outputs with the
regeneration command. Do not replace the source hash with a new git commit or
refresh the receipt without a real build. The standalone check is suitable for
CI before any generation can hide drift.

`npm run map:test` exercises fresh/stale inputs, newly introduced imports, output
integrity and deterministic closed water contours. Mutation cases use isolated
temporary copies and never alter the working world or published assets.
