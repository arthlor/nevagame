# LAYOUT_EDITOR.md
## Neva — In-Game Layout / Placement Editor

> **Role:** Operational owner for the DEV-only in-game layout editor (the Place / F2 tool). It places and moves **already published GLBs** in the world. It is not the Blender catalog pipeline, Art Yard, or a `GameplayMode`.
>
> **Authority:** `01` still owns architecture invariants. This file owns how the editor is used, which files it may write, and how the client, Vite plugin, and live session stay aligned. If this file and `01` disagree, `01` wins; report the mismatch.

This is the tool people mean by “asset editor” in play: click a well, stall, fence, or tree in the running game and write its pose back into layout TypeScript.

---

# 1. What it is

The editor is a **presentation picker** that runs only when Vite `import.meta.env.DEV` is true. `GameApp` constructs `PlacementEditor` in that case and never in a production build.

It is **not**:

- a `GameplayMode` or `GameAction`
- simulation-owned save state (`layoutRevision` is not bumped by a drop)
- a GLB generator (that remains catalog → Blender → `art:generate`)
- a license to invent weapons, combat, or extra HUD dashboards

Simulation still owns canonical gameplay. A drop writes **layout source**. The same session also debug-relocates a few interact/sim poses so you can keep playing without a refresh. Other saves keep their stored structure coordinates until those saves are moved in-game.

---

# 2. How to use it

Requires `npm run dev` (the Vite plugin is `apply: "serve"` only). Production builds have no editor and no commit endpoint.

| Action | Binding |
| --- | --- |
| Toggle | **F2** or the **Place** chip |
| Auto-on at boot | `?place` on the URL |
| Select | Left mouse on a tagged object |
| Move | Drag on terrain (or the interior Y-plane indoors) |
| Fine move / rotate | **Shift** while dragging or rotating |
| Rotate | **Q** / **E** (15°, or 5° with Shift) |
| Copy / paste / duplicate | **⌘/Ctrl+C**, **⌘/Ctrl+V**, **⌘/Ctrl+D** |
| Undo | **⌘/Ctrl+Z** |
| Redo | **Shift+⌘/Ctrl+Z** or **⌘/Ctrl+Y** |
| Delete | **Delete** or **Backspace** |
| Deselect | **Escape** (first Escape deselects; it does not exit) |
| Exit | **F2** or Place chip again |

Useful URLs:

```text
http://localhost:3000/
http://localhost:3000/?place
http://localhost:3000/?place&debugStart=farm
```

WASD and right-mouse orbit still work. While the editor is on, left-mouse does **not** fire `use-primary` (planting, fishing hold, and so on). Interact with **E** is also suppressed so Q/E can rotate.

Click the **mesh you can see** — house, well, fence post, crate, stall, mill, NPC, authored tree. Instanced grass, flowers, pebbles, crops, boats, the player, terrain, water, sky, and roads are not tagged and will not select.

A yellow `BoxHelper` and the banner id mean the pick worked. “Click to select…” means the ray missed a tagged mesh (usually scatter, or empty ground).

---

# 3. Architecture

```text
canvas LMB
  → InputRouter (canvas-only pointer, queued pick NDC, no use-primary)
  → GameApp.syncLayoutEditor
  → PlacementEditor (select / drag / rotate / copy / delete)
  → WorldScene.pickLayoutEditable  (userData.layoutEdit on discrete roots)
  → POST /__neva_layout_editor/commit   (localhost, same-origin JSON, Vite serve only)
  → tools/layout-editor/patchPlacement.ts
  → allowlisted layout TypeScript
```

Shared contract (kinds, commit JSON, source file map, duplicate/delete policy) lives in `src/layout-editor/layoutEdit.ts`. The browser and the Node patcher both import that file. **Do not import `src/world/*` into `patchPlacement.ts` or `layoutEditorPlugin.ts`** — that would pull the world graph into the Vite plugin and restart the server on layout edits.

| Layer | Owner | Persistence |
| --- | --- | --- |
| Mesh pose while dragging | Three.js presentation | none |
| Interact / station / market this session | `layoutEditLiveSession` + `sim.debugRelocate*` | session only |
| Rapier static colliders this session | `PhysicsWorld.replaceStaticCollision` | session only |
| Pose after a successful drop | layout TypeScript | git source |
| Player save | unchanged | not rewritten by the editor |

Writes are **localhost-only** (`localhost`, `127.0.0.1`, `::1`) **and same-origin**: the
plugin also requires an `application/json` content type, a loopback `Origin` when one is
sent, and `Sec-Fetch-Site: same-origin` when the browser sends it. The `Host` header alone
is whatever the browser dialled, so without those a page on any origin could post a
`text/plain` form — no CORS preflight required — at a running dev server and rewrite
`src/world`. Commits are also **serialized** server-side: each one is a read-modify-write
over the same six files, so overlapping requests would otherwise plan against the
pre-write tree and drop each other.

A commit either lands in **every** file it touches or in none. Moving the farmhouse also
moves the interior door; moving a harbor NPC also moves its world anchor. All changed
files are parse-checked before any rename, and an earlier rename is rolled back from the
captured previous content if a later one fails.

Layout **ids are restricted to `[A-Za-z0-9_.-]`** (up to 180 characters). Ids are
interpolated into generated TypeScript, so the charset — not the parse check — is what
stops a commit body from closing a string literal and writing arbitrary code. Every
published id already fits: `farm_hay_a`, `struct.starter_mill`, `fence_west_-4`,
`authored.copy.prop_crate_a.1`.

The plugin suppresses Vite HMR for ~2.5 s on files it just wrote so a drop does not immediately full-reload the game.

---

# 4. What can be edited

Each spawned discrete object gets `userData.layoutEdit` (`LAYOUT_EDIT_USERDATA_KEY`). The pick walks from the hit mesh up to that tagged root.

| Kind | Examples | Source | Copy / delete |
| --- | --- | --- | --- |
| `farmstead` | farmhouse, well | `FarmLayout.ts` (farm-local xz) | no |
| `farm-prop` | starter crates, farm props | `STARTER_PROP_ANCHORS` | yes |
| `farm-fence` | generated posts | `FARM_FENCE_OVERRIDES` / `FARM_FENCE_EXTRAS` | yes |
| `farm-structure` | mill, workbench, compost | `FarmLayout.ts`; yaw stored as visual − π | no |
| `architecture-pad` | village cottages, inn, barn, market hall | `WorldLayout.ts` pad `center` | no |
| `landmark` | bridge, dock, lighthouse, fish-market, produce-stall | `WorldLayout.ts` or `WorldAnchors.ts` | no |
| `world-anchor` | harbor fish table | `WorldAnchors.ts` | no |
| `authored-detail` | authored trees, rocks, harbor posts | `authoredPlacement(...)` in `WorldEnvironmentLayout.ts` | yes |
| `environment-override` | seeded/layout-derived instance after a move | `PLACEMENT_OVERRIDES` | paste as **authored** pin; delete via `PLACEMENT_REMOVED` |
| `interior-prop` | farmhouse furniture | `FarmhouseInterior.ts` (keeps Y) | yes |
| `npc` | Barnaby, Elspeth, Silas, Maeve | `npcs.ts`; harbor xz also in `WorldAnchors.ts` | no |

Farm kinds are authored in **farm-local** coordinates (`world − STARTER_FARM_LAYOUT.origin`). The HUD shows **world** xz.

Moving the farmhouse also follows `FARMHOUSE_OUTSIDE_DOOR` (and its exit spawn) in `FarmhouseInterior.ts`. Farm **paths are not** auto-rerouted.

Processing stations (mill, workbench, compost, harbor fish table) write yaw as `visualRotationY - π` so the approach marker stays in front of the working face.

Objects with catalog `grounding` half-extents refuse a write if the footprint is unstable (`isPlacementFootprintStable`). The banner says so; move onto flatter ground.

Outdoor drag and paste resolve the registered terrain through
`TerrainSnapping`: its BVH raycast supplies height and world-space normal, with
the canonical terrain sampler as the fallback. A surface beyond the configured
slope limit is rejected before source is written. Indoor props keep their
authored Y plane.

---

# 5. Copy, paste, delete

Allowed: `farm-prop`, `farm-fence`, `authored-detail`, `environment-override`, `interior-prop`.

Blocked (unique gameplay objects): farmhouse, well, mill and other stations, NPCs, landmarks, architecture pads. Unique interact anchors (markets, processing stations, NPC talk radii) are not copied.

Paste:

1. POSTs `duplicateFrom` + catalog `assetId` / scale, and any placement extras (`grounding`, `practicalLight`, farm `propType`).
2. Patcher allocates a new id (`*.copy.N`, `_copy_N`, or `authored.copy.<asset>_N` for seeded sources). The returned id is the allocated copy id, not a guessed “first new string” in the file.
3. Seeded/layout-derived copies become a new **authored** pin, not another seeded override. The pin keeps `grounding` / `practicalLight` when those were on the commit.
4. Client **re-instantiates** from `AssetLoader` (same SkeletonUtils path as spawn) and binds lights, fauna mixers, shadow policy, and collision — it does not `Object3D.clone` the live mesh. If instantiate fails, the client POSTs `remove` for the new id so source and scene stay aligned.
5. Contact grounding discs are rebuilt from live tagged **world** poses so a pasted tree is not a hollow shadow at the old spot.
6. Paste/delete/drop while a write is in flight are queued. Extra ⌘/Ctrl+V taps increment a paste count (they are not dropped). Copy is blocked while a write is in flight so a queued paste cannot silently switch clipboard. Delete targets the object selected when Delete was pressed, not the clone that paste may select afterward.
7. Copy, then delete the original, then paste still works: authored pins rebuild from commit fields; farm props use `propType`; interior props use `assetId` / `y`.
8. Exiting Place (F2) while a paste is in flight still instantiates the object that already wrote to source, but does not leave a yellow helper up after the editor is off. Queued extra pastes are discarded on exit.

Delete:

- Authored details and farm props / interior props are removed from their arrays.
- Generated fence posts that are not in `FARM_FENCE_EXTRAS` are listed in `FARM_FENCE_REMOVED`.
- Seeded instances are listed in `PLACEMENT_REMOVED` (and dropped from `PLACEMENT_OVERRIDES`).
- Runtime unbind disposes parented PointLights and stops fauna mixers for that instance.

Move/rotate pointer activity is coalesced into one history item at drop. Paste
and delete record reversible source plus live-scene operations, including the
stable allocated ID needed to restore a removed copy. Undo/redo is serialized
with layout writes, preserves the stack when a commit fails, clears redo after
a new edit, and retains the latest 100 items. History is session-only; its
commands rewrite the allowlisted source just like the original operation and
never enter `GameState`.

---

# 6. Live session (no refresh)

On drag, rotate, drop, paste, delete, Escape deselect, and F2 exit:

1. **Physics** — `WorldScene.syncLayoutEditPresentation()` reprojects catalog collision boxes from current prefab poses; `PhysicsWorld.replaceStaticCollision` swaps Rapier static cuboids.
2. **Grounding** — the merged `static_contact_grounding` mesh is rebuilt from tagged roots that have `grounding`. Drag and rotate also rebuild so contact discs follow the mesh, not only drop/paste.
3. **Practical lights** — In DEV, PointLights are parented to `_glow` / `_beacon` nodes (or the root for AABB fallback) so they follow drag. Production keeps scene-rooted lights so mesh merge cannot strip them. Quality budget uses world position. Paste registers a new light; delete disposes it.
4. **Shadows (DEV)** — colliding props self-cast. Production still merges static meshes and uses the baked `static_shadow_silhouette_proxy`.
5. **Fauna** — paste registers a new mixer on the duplicated cow/chicken/rabbit; delete stops and uncaches that mixer.
6. **Interact (unique objects only)** — `applyLayoutEditLiveSession` on move of objects that cannot be copied:
   - produce stall → `VILLAGE_MARKET` + `market.village` interaction
   - fish-market landmark → `HARBOR_MARKET` + `market.harbor` interaction
   - mill / workbench / compost / fish table → `sim.debugRelocateStructure` + processing-station approach
   - NPCs → content anchor + `relocateNpcPresentation`

Duplicated crates, lamps, trees, fences, and interior furniture do not gain new E-to-interact points. They keep pick tags, catalog collision, and the spawn presentation of the original (light, animation, grounding, shadows).

While the editor is active, gameplay interact rings and quest waypoints are cleared so a stale teal ring does not sit on the old pose.

These session mutations are **not** the save. Closing the tab without a successful drop leaves source unchanged.

---

# 7. Why DEV skips mesh merge

Production `mergeStaticPrefabMeshes` pulls visible LOD meshes into `BatchedMesh` siblings and then strips the original LOD children. Layout tags stay on the empty group. Raycasts against those roots miss, so F2 looked “on” (green Place chip) while clicks did nothing.

DEV therefore:

- does **not** merge static prefabs
- does **not** add the baked sun-shadow proxy
- forces colliding meshes to `castShadow` so the shadow follows the drag

Draw-call cost is higher in `npm run dev`. That is the intended trade for
picking the mesh you see. These DEV measurements are editor diagnostics, not
P0.75 production-budget evidence: `npm run art:benchmark` must be interpreted
with this unmerged layout-editor path in mind, and its current farm/coast
over-budget result remains an open technical render gate rather than a reason
to change the scene budgets.

Clicks are queued on **pointerdown** (`consumeLayoutPrimaryPress`) so a short tap between animation frames is not lost. The router still requires the event target to be the canvas (`#game-canvas`). Full-screen overlays (`StartScreen`, dialogue backdrop, pause menu) eat LMB; close them first.

---

# 8. What was built (and why)

0. **DEV code stays out of production** — `GameApp` imports `PlacementEditor` dynamically
   inside its `import.meta.env.DEV` branch. A static import kept the editor, its history
   stack, `three-mesh-bvh`, and a module-scope `THREE.Mesh.prototype.raycast` patch in
   every shipped build for a tool that cannot run there.
1. **In-game posing instead of hand-editing TypeScript** — walk to the object, drop, get a git-visible layout change.
2. **No new gameplay mode** — F2 is a DEV overlay. Simulation modes stay on-foot / farm-placement / boat / fishing.
3. **Allowlisted source patcher** — only the six layout files below; numeric fields only; unsafe expressions rejected.
4. **Vite serve plugin** — `POST /__neva_layout_editor/commit`, localhost + same-origin JSON only, serialized commits, HMR suppression after write.
5. **Presentation tags** — `userData.layoutEdit` on discrete roots; grass scatter stays untagged.
6. **Select vs write** — click selects; source writes only on a real move, rotate, paste, or delete.
7. **Copy/paste/delete** for props, fences, authored details, seeded pins, interior furniture; unique buildings refuse it.
8. **Farmhouse door follow** when the house moves; processing-station yaw convention preserved.
9. **Live collision, grounding, parented lights, fauna mixers, and unique-object interact** so a moved stall or pasted lamp is not a hollow shadow + dark copy.
10. **Place chip in the normal DEV HUD** (`http://localhost:3000/` without `?debug`), not hidden behind a chrome rule.
11. **DEV unmerged meshes + pointerdown pick queue** so the chip being green actually means you can click the well.
12. **Terrain-aware placement + transactional history** so drag/paste reject unsafe slopes and move/rotate/paste/delete can be undone without partial source/live-scene divergence.

---

# 9. Files

| Path | Role |
| --- | --- |
| `src/layout-editor/layoutEdit.ts` | kinds, tags, commit JSON, snap/format, duplicate ids |
| `src/layout-editor/layoutEditLiveSession.ts` | session market / station overlays |
| `src/app/PlacementEditor.ts` | pick, drag, rotate, copy/paste/delete, POST |
| `src/app/GameApp.ts` | F2, input, live sync, collider rebuild, HUD |
| `src/input/InputRouter.ts` | layout LMB capture, pick queue, suppress use-primary |
| `src/ui/PlacementEditorHud.tsx` | Place chip + banner |
| `src/render/scene/WorldScene.ts` | tags, pick, duplicate/remove, feature bind, DEV skip merge, collider rebuild |
| `src/physics/PhysicsWorld.ts` | `replaceStaticCollision` / `ingestStaticCollision` |
| `src/world/ProcessingStationApproach.ts` | `debugRelocateProcessingStationApproach` |
| `tools/vite/layoutEditorPlugin.ts` | serve-only POST + HMR suppress |
| `tools/layout-editor/patchPlacement.ts` | TypeScript surgery |
| `vite.config.ts` | registers the plugin |

Allowlisted write targets:

- `src/world/FarmLayout.ts`
- `src/world/WorldLayout.ts`
- `src/world/WorldAnchors.ts`
- `src/world/WorldEnvironmentLayout.ts`
- `src/world/FarmhouseInterior.ts`
- `src/content/npcs.ts`

## 9.1 Narrative placement boundary

The editor may improve the staging of a story-relevant person, route, or
working prop, but it does not author quest lore or progression. Keep the
current narrative relationships readable: Elspeth at the starter garden and
village exchange, Barnaby at the homestead workbench, Maeve at the fish market,
and Old Silas at the harbor pier/rowboat threshold. If a placement change
affects a quest `locationAnchor`, NPC proximity, line of sight, or the meaning
of a landmark, update the owning world/content source and its focused tests in
the same change. Never solve a quest/content mismatch by moving a mesh only;
the simulation predicate and the visual cue must agree.

---

# 10. Tests

```bash
npx vitest run tests/unit/layoutEditorSourceRoundTrip.test.ts tests/unit/layoutEditorPatch.test.ts tests/unit/terrainSnapping.test.ts tests/unit/historyManager.test.ts tests/unit/empirical_r2_terrain_history_stress.test.ts tests/unit/physicsWorld.test.ts
```

`layoutEditorSourceRoundTrip.test.ts` runs every editable kind against the **shipped**
layout sources, not fixtures, and asserts the x, z and rotation it asked for actually
appear in written text. The patcher matches source by shape, so a refactor in
`WorldLayout.ts` or `FarmLayout.ts` can silently stop a field from being written while the
editor still reports "Wrote &lt;id&gt;" — that is exactly how the bridge lost its yaw. The
same file pushes each allowlisted source through the write gate, which is how a parser
that could not read `interface X extends Y` (and therefore rejected every farm commit)
would now be caught.

Patcher tests cover math (door follow / yaw), source edits (move, copy, delete,
restore, overrides), duplicate extras (`practicalLight`, `grounding`,
seeded→authored pins, interior y/assetId), duplicate array commas after
consecutive pastes, copy.1 vs copy.10 id lookup, paste after the original was
removed, live interact session restore, and the Vite plugin `apply: "serve"` +
localhost host check. Terrain/history suites cover BVH/fallback snapping,
world-normal alignment, slope boundaries, stack limits, drag coalescing,
transaction rollback, failed undo/redo, and re-entrancy. Physics tests cover
replacing static colliders after a layout move.

Do not claim the editor is visually approved; the human confirms picks and drops in the actual game.

---

# 11. Invariants (do not break)

- No `GameplayMode` named “layout” / “place”.
- No silent `layoutRevision` bump; saves are not rewritten by a drop.
- No `src/world` imports in `patchPlacement.ts` or the Vite plugin.
- Production never constructs `PlacementEditor`, never loads its module, and never serves the commit route.
- Simulation remains the serializable gameplay authority; Three.js `userData` is a pick tag only.
- Unique buildings, NPCs, landmarks, and architecture pads cannot be copied or deleted.
- Duplicating a prop re-instantiates from the catalog and binds the same spawn features (lights, fauna, shadows, grounding, collision). It does not invent new gameplay interact points.
- Grass/crop/boat/player/terrain stay undraggable.
- Unstable architecture footprints refuse a write.
- Commit endpoint stays POST + localhost + same-origin JSON + allowlisted files, and commits stay serialized and all-or-nothing across files.
- Layout ids written into source stay inside `[A-Za-z0-9_.-]`.
- The write gate parses with Babel directly. Do not route it back through recast: its `ast-types` cannot read `interface X extends Y`, which silently blocked every `FarmLayout.ts` commit.

When adding a new movable object: tag it in `WorldScene`, add a kind (or reuse one), teach the patcher the exact source shape, add a fixture-style unit test, decide copy/delete, and update §4 and §9 of this file in the same change. Do not special-case presentation in `userData` to paper over a missing layout field.
