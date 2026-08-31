# Neva Tools Architecture & Implementation Specification (v2.0)

> **Document Status:** Authoritative Engineering Blueprint & Reference Implementation Guide  
> **Target Subsystems:** `tools/blender`, `tools/art`, `tools/art-yard`, `tools/layout-editor`, `tools/ui`, `tools/audio`, `tools/vite`, `tests/e2e`  
> **Core Objective:** Provide a hardened, deterministic, incremental, and high-velocity developer infrastructure for 3D procedural generation, lossless AST-based level editing, extruded texture atlases, category-normalized Web Audio, and pixel-exact WebGL regression testing.

---

## 1. System Architecture & Priority Matrix

```
                                    ┌────────────────────────┐
                                    │    CATALOG & SPECS     │
                                    │  asset-catalog.json    │
                                    │  neva.palette.json     │
                                    └───────────┬────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CONTENT-ADDRESSED CACHE                                       │
│          hash(generator_src + catalog_spec + palette + blender_ver + optimize_config)           │
│                            [Skip unchanged -> Instant incremental hits]                         │
└───────────────────────────────────────┬─────────────────────────────────────────────────────────┘
                                        │ (Cache Misses Only)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                DYNAMIC WORKER POOL (FIFO QUEUE)                                 │
│                                node tools/blender/pool.mjs                                      │
├─────────────────────┬──────────────────────┬──────────────────────┬─────────────────────────────┤
│  1. 3D ART & OPT    │ 2. LEVEL & LAYOUT    │ 3. UI ATLAS PIPELINE │ 4. AUDIO (BUS-NORMALIZED)   │
│  • Work-Steal Queue │ • three-mesh-bvh     │ • MaxRects 2D Pack   │ • Multi-Bus Loudness        │
│  • Quantize + LODs  │ • Lossless AST Patch │ • 2px Edge Extrude   │ • Stderr 2-Pass loudnorm    │
│  • Safe Disposal HMR│ • Failure-Safe Undo  │ • Lossless WebP+PNG  │ • Targeted SFX Sprites      │
└──────────┬──────────┴──────────┬───────────┴──────────┬───────────┴──────────────┬──────────────┘
           │                     │                      │                          │
           ▼                     ▼                      ▼                          ▼
┌─────────────────────┬──────────────────────┬──────────────────────┬─────────────────────────────┐
│  PUBLIC 3D MODELS   │  LAYOUT CODE BASES   │  PUBLIC UI ATLASES   │  AUDIO BUFFERS & MANIFEST   │
│  public/assets/     │  src/world/*Layout.ts│  public/assets/ui/   │  public/assets/audio/       │
└─────────────────────┴──────────────────────┴──────────────────────┴─────────────────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               5. DETERMINISTIC CI REGRESSION                                    │
│  • 16-Point Determinism Matrix (Fixed seed, clock, pixelRatio=1, locked camera & sun)          │
│  • Per-Scene Pixel Diffs (pixelmatch) + GPU VRAM, Triangle & Draw Call Budgets                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Priority Ranking

| Priority | Focus Area | Deliverables |
| :--- | :--- | :--- |
| **P0 (Critical)** | **Safety, Speed & Core Loop** | 1. Lossless AST placement patcher (scoped target, duplicate check, atomic rename, add/delete support)<br>2. Failure-safe Command Pattern undo/redo with drag coalescing<br>3. `three-mesh-bvh` surface snapping with world-space normal alignment<br>4. Dynamic work-stealing Blender worker pool<br>5. Content-addressed incremental build cache with common dependency tracking<br>6. Vertex quantization (`KHR_mesh_quantization`) + derived LOD exports<br>7. Memory-safe in-place asset HMR with explicit GPU resource disposal<br>8. 16-point deterministic WebGL visual regression harness |
| **P1 (High)** | **Packaging & DX** | 1. Extruded 2D UI texture atlas packaging (`maxrects-packer` + 2px edge dilation + lossless WebP)<br>2. Unified interactive developer CLI (`tools/cli.mjs`)<br>3. Automated VRAM & draw call budget reporting |
| **P2 (Targeted)** | **Audio Refinement** | 1. Bus-based audio normalization (category target LUFS)<br>2. Correct 2-pass stderr `loudnorm` script<br>3. Selective audio sprites for high-frequency UI/transient SFX |

---

## 2. Subsystem 1: 3D Procedural Art & Asset Pipeline

### 2.1 Content-Addressed Incremental Build Cache

Every asset artifact is keyed against a deterministic input hash including its generator source and common generator helper dependencies:

$$\text{InputHash} = \text{SHA256}(\text{generator\_code} \parallel \text{common\_toolchain\_hash} \parallel \text{catalog\_entry} \parallel \text{palette} \parallel \text{blender\_version} \parallel \text{optimize\_config})$$

```typescript
// tools/blender/cache.mjs
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function computeCommonToolchainHash(commonDir: string): string {
  const hash = crypto.createHash("sha256");
  const files = fs.readdirSync(commonDir).filter(f => f.endsWith(".py")).sort();
  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(commonDir, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function computeAssetSourceHash(
  assetSpec: Record<string, unknown>,
  generatorCode: string,
  commonToolchainHash: string,
  paletteJson: string,
  blenderVersion: string,
  optimizeConfig: Record<string, unknown>
): string {
  const hash = crypto.createHash("sha256");
  hash.update(JSON.stringify(assetSpec));
  hash.update("\0");
  hash.update(generatorCode);
  hash.update("\0");
  hash.update(commonToolchainHash);
  hash.update("\0");
  hash.update(paletteJson);
  hash.update("\0");
  hash.update(blenderVersion);
  hash.update("\0");
  hash.update(JSON.stringify(optimizeConfig));
  return hash.digest("hex");
}

export function isAssetCurrent(cacheDir: string, assetId: string, sourceHash: string): boolean {
  const metaPath = path.join(cacheDir, `${assetId}.meta.json`);
  if (!fs.existsSync(metaPath)) return false;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    return meta.sourceHash === sourceHash && fs.existsSync(meta.artifactPath);
  } catch {
    return false;
  }
}
```

---

### 2.2 Dynamic Work-Stealing Blender Worker Pool (`tools/blender/pool.mjs`)

#### Architecture Contract
- **Work-Stealing Queue**: Assets are pulled from a shared concurrent FIFO queue, preventing slow complex assets (e.g. multi-story buildings) from bottlenecking static chunks.
- **Process Isolation**: Each worker runs headless with clean scene lifecycle and isolated stdout/stderr streams.
- **Signal Handling**: Forward `SIGINT`/`SIGTERM` to worker processes; clean up scratch directories on exit.

```javascript
// tools/blender/pool.mjs (Reference Implementation)
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";

export async function runDynamicBlenderPool({
  blenderPath,
  bootstrapScript,
  catalogPath,
  missAssets,
  outputDir,
  strict = false,
  concurrency = Math.max(1, os.cpus().length - 1),
  timeoutMs = 60000
}) {
  if (!missAssets.length) return [];

  const queue = [...missAssets];
  const activeProcesses = new Set();
  const results = [];
  const errors = [];

  const cleanup = () => {
    for (const proc of activeProcesses) {
      try { proc.kill("SIGKILL"); } catch {}
    }
  };
  process.on("SIGINT", () => { cleanup(); process.exit(1); });
  process.on("SIGTERM", () => { cleanup(); process.exit(1); });

  async function workerLoop(workerId) {
    const workerScratch = path.join(outputDir, `.worker-${workerId}`);
    fs.mkdirSync(workerScratch, { recursive: true });

    while (queue.length > 0) {
      const asset = queue.shift();
      if (!asset) break;

      const reportPath = path.join(workerScratch, `${asset.id}.json`);
      const args = [
        "--background",
        "--python", bootstrapScript,
        "--",
        "--catalog", catalogPath,
        "--output", outputDir,
        "--report", reportPath,
        "--asset", asset.id
      ];
      if (strict) args.push("--strict");

      try {
        await new Promise((resolve, reject) => {
          const proc = spawn(blenderPath, args, { stdio: ["ignore", "pipe", "pipe"] });
          activeProcesses.add(proc);

          let stderr = "";
          proc.stderr.on("data", (d) => { stderr += d.toString(); });

          const timer = setTimeout(() => {
            proc.kill("SIGKILL");
            reject(new Error(`Timeout (${timeoutMs}ms) generating asset: ${asset.id}`));
          }, timeoutMs);

          proc.on("close", (code) => {
            clearTimeout(timer);
            activeProcesses.delete(proc);
            if (code !== 0) {
              reject(new Error(`Asset ${asset.id} failed (code ${code}):\n${stderr.slice(-500)}`));
              return;
            }
            if (!fs.existsSync(reportPath)) {
              reject(new Error(`Worker emitted no report for ${asset.id}`));
              return;
            }
            const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
            results.push(report);
            resolve();
          });
        });
      } catch (err) {
        errors.push(err);
      }
    }

    try { fs.rmSync(workerScratch, { recursive: true, force: true }); } catch {}
  }

  const workerCount = Math.min(missAssets.length, concurrency);
  await Promise.all(Array.from({ length: workerCount }, (_, i) => workerLoop(i)));

  if (errors.length > 0) {
    throw new Error(`Blender generation failed for ${errors.length} asset(s):\n${errors.map(e => e.message).join("\n")}`);
  }

  return results;
}
```

---

### 2.3 glTF Quantization & Derived LOD Generation

```javascript
// tools/blender/optimize.mjs
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  weld,
  dedup,
  prune,
  quantize,
  reorder,
  simplify,
  meshopt
} from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

export async function optimizeAndGenerateLods(sourceGlbPath, outputBaseDir, assetSpec) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(sourceGlbPath);

  // 1. Optimize Base LOD0
  await doc.transform(
    weld({ tolerance: 0.0005 }),
    dedup(),
    prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }),
    quantize({
      quantizePosition: 14,
      quantizeNormal: 10,
      quantizeTexcoord: 12,
      quantizeColor: 8
    }),
    reorder({ encoder: MeshoptEncoder }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" })
  );

  const lod0Path = path.join(outputBaseDir, `${assetSpec.id}.glb`);
  await io.write(lod0Path, doc);

  // 2. Generate Derived LODs if spec defines lodLevels
  if (assetSpec.lodLevels && assetSpec.lodLevels.length > 1) {
    for (let i = 1; i < assetSpec.lodLevels.length; i++) {
      const level = assetSpec.lodLevels[i];
      const lodDoc = await io.read(sourceGlbPath); // read fresh unquantized copy

      await lodDoc.transform(
        weld({ tolerance: 0.001 }),
        simplify({
          simplifier: MeshoptSimplifier,
          ratio: level.triangleRatioTarget ?? (1.0 / (i + 1)),
          error: 0.02
        }),
        dedup(),
        prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }),
        quantize({ quantizePosition: 12, quantizeNormal: 8, quantizeColor: 8 }),
        reorder({ encoder: MeshoptEncoder }),
        meshopt({ encoder: MeshoptEncoder, level: "medium" })
      );

      const lodPath = path.join(outputBaseDir, `${assetSpec.id}.lod${i}.glb`);
      await io.write(lodPath, lodDoc);
    }
  }
}
```

---

### 2.4 Live In-Place Asset Hot-Swapping with Safe GPU Resource Disposal

#### Disposal Contract
When an asset instance is hot-swapped:
1. **Validate Compatibility**: Matching socket names, animation rigs, and bounding volume parity.
2. **Dispose Geometries**: Dispose old `BufferGeometry` instances. Do **not** dispose global shared `PaletteMaterials` to avoid invalidating other assets. Dispose only unique per-instance materials.
3. **Hierarchy Re-Cloning**: Swap child meshes and socket attach points while preserving the instance's parent transform, layer masks, and simulation tags.
4. **Bounding Volume Recalculation**: Recompute bounding boxes and notify BVH/spatial acceleration trees.

```typescript
// src/render/assets/AssetHotSwapper.ts (Reference Implementation)
import * as THREE from "three";

export class AssetHotSwapper {
  public static safelyDisposeInstanceGeometries(container: THREE.Object3D): void {
    container.traverse((node) => {
      if (node instanceof THREE.Mesh && node.geometry) {
        node.geometry.dispose();
      }
    });
  }

  public static hotSwapAssetInstances(
    assetId: string,
    newModelScene: THREE.Group,
    activeScene: THREE.Scene
  ): number {
    let replacedCount = 0;

    activeScene.traverse((node) => {
      if (node.userData?.nevaAssetId === assetId && node instanceof THREE.Group) {
        // 1. Dispose old geometry
        AssetHotSwapper.safelyDisposeInstanceGeometries(node);

        // 2. Remove old visual children (preserving non-visual attachments)
        const toRemove: THREE.Object3D[] = [];
        for (const child of node.children) {
          if (!child.userData?.isDynamicAttachment) {
            toRemove.push(child);
          }
        }
        for (const child of toRemove) {
          node.remove(child);
        }

        // 3. Clone and attach new model hierarchy
        const clonedNew = newModelScene.clone(true);
        while (clonedNew.children.length > 0) {
          node.add(clonedNew.children[0]);
        }

        // 4. Recalculate bounds
        node.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.computeBoundingBox();
            child.geometry.computeBoundingSphere();
          }
        });

        replacedCount++;
      }
    });

    return replacedCount;
  }
}
```

---

## 3. Subsystem 2: In-Game Level & Placement Editor

### 3.1 Scoped Lossless AST Layout Patcher (`tools/layout-editor/patchPlacement.ts`)

#### Safety Invariants
- **Target Scoping**: Navigates strictly: `ExportNamedDeclaration -> VariableDeclarator -> ObjectExpression -> ArrayProperty('placements') -> ObjectExpression(id === targetId)`.
- **Zero-Match & Duplicate-ID Guarantees**: Throws if `matches === 0` or `matches > 1`.
- **Atomic File Write**: Writes to `.tmp` file and replaces via `fs.renameSync`.
- **Post-Mutation Validation**: Re-parses the resulting string with AST parser to prove structural validity before committing.
- **Add / Delete Operations**: Supports atomic insertion and deletion of placement elements in AST without destroying code comments.

```typescript
// tools/layout-editor/astPatcher.ts (Reference Implementation)
import fs from "node:fs";
import { parse, print, types } from "recast";
import * as tsParser from "recast/parsers/typescript";

const b = types.builders;
const n = types.namedTypes;

export interface PlacementMutation {
  kind: "update" | "add" | "delete";
  targetId: string;
  data?: {
    assetId?: string;
    x?: number;
    y?: number;
    z?: number;
    rotationY?: number;
    scale?: number;
  };
}

export function patchPlacementInFile(filePath: string, mutation: PlacementMutation): void {
  const sourceCode = fs.readFileSync(filePath, "utf8");
  const ast = parse(sourceCode, { parser: tsParser });
  let matchCount = 0;

  types.visit(ast, {
    visitProperty(path) {
      if (n.Identifier.check(path.node.key) && path.node.key.name === "placements") {
        if (n.ArrayExpression.check(path.node.value)) {
          const elements = path.node.value.elements;

          if (mutation.kind === "delete") {
            const initialLen = elements.length;
            path.node.value.elements = elements.filter((el) => {
              if (!n.ObjectExpression.check(el)) return true;
              const idProp = el.properties.find(
                (p): p is types.namedTypes.ObjectProperty =>
                  n.ObjectProperty.check(p) &&
                  n.Identifier.check(p.key) &&
                  p.key.name === "id" &&
                  n.StringLiteral.check(p.value) &&
                  p.value.value === mutation.targetId
              );
              if (idProp) matchCount++;
              return !idProp;
            });
            if (elements.length === initialLen) {
              throw new Error(`Delete failed: target ID "${mutation.targetId}" not found`);
            }
          } else if (mutation.kind === "update") {
            for (const el of elements) {
              if (n.ObjectExpression.check(el)) {
                const idProp = el.properties.find(
                  (p): p is types.namedTypes.ObjectProperty =>
                    n.ObjectProperty.check(p) &&
                    n.Identifier.check(p.key) &&
                    p.key.name === "id" &&
                    n.StringLiteral.check(p.value) &&
                    p.value.value === mutation.targetId
                );

                if (idProp) {
                  matchCount++;
                  if (mutation.data) {
                    for (const [key, val] of Object.entries(mutation.data)) {
                      if (val === undefined) continue;
                      const existing = el.properties.find(
                        (p): p is types.namedTypes.ObjectProperty =>
                          n.ObjectProperty.check(p) &&
                          n.Identifier.check(p.key) &&
                          p.key.name === key
                      );
                      const propVal = typeof val === "string"
                        ? b.stringLiteral(val)
                        : b.numericLiteral(Number(val.toFixed(4)));

                      if (existing) {
                        existing.value = propVal;
                      } else {
                        el.properties.push(b.objectProperty(b.identifier(key), propVal));
                      }
                    }
                  }
                }
              }
            }
          } else if (mutation.kind === "add") {
            if (mutation.data) {
              const newProps: types.namedTypes.ObjectProperty[] = [
                b.objectProperty(b.identifier("id"), b.stringLiteral(mutation.targetId))
              ];
              for (const [key, val] of Object.entries(mutation.data)) {
                if (val === undefined) continue;
                const propVal = typeof val === "string"
                  ? b.stringLiteral(val)
                  : b.numericLiteral(Number(val.toFixed(4)));
                newProps.push(b.objectProperty(b.identifier(key), propVal));
              }
              elements.push(b.objectExpression(newProps));
              matchCount = 1;
            }
          }
        }
      }
      this.traverse(path);
    }
  });

  if (mutation.kind === "update" && matchCount === 0) {
    throw new Error(`Target layout ID "${mutation.targetId}" not found in ${filePath}`);
  }
  if (mutation.kind === "update" && matchCount > 1) {
    throw new Error(`Duplicate layout ID "${mutation.targetId}" found in ${filePath} (${matchCount} occurrences)`);
  }

  const outputCode = print(ast).code;

  // Post-parse validation check
  parse(outputCode, { parser: tsParser });

  // Atomic write
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, outputCode, "utf8");
  fs.renameSync(tempPath, filePath);
}
```

---

### 3.2 Terrain BVH Snapping with World-Space Normal Alignment

```typescript
// src/layout-editor/TerrainSnapping.ts
import * as THREE from "three";
import { MeshBVH, acceleratedRaycast, SAH } from "three-mesh-bvh";

THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class TerrainSnappingSystem {
  private bvhMesh: THREE.Mesh | null = null;
  private raycaster = new THREE.Raycaster();
  private maxElevation = 500;

  public constructor() {
    this.raycaster.firstHitOnly = true;
  }

  public registerTerrain(mesh: THREE.Mesh): void {
    if (!mesh.geometry.boundsTree) {
      mesh.geometry.boundsTree = new MeshBVH(mesh.geometry, {
        maxLeafTris: 10,
        strategy: SAH // Explicit exported constant
      });
    }
    mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox) {
      this.maxElevation = mesh.geometry.boundingBox.max.y + 20.0;
    }
    this.bvhMesh = mesh;
  }

  public snapToSurface(worldX: number, worldZ: number): { point: THREE.Vector3; worldNormal: THREE.Vector3 } | null {
    if (!this.bvhMesh) return null;

    this.raycaster.ray.origin.set(worldX, this.maxElevation, worldZ);
    this.raycaster.ray.direction.set(0, -1, 0);

    const hits = this.raycaster.intersectObject(this.bvhMesh, false);
    if (!hits.length) return null;

    const hit = hits[0];
    const localNormal = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0);

    // Transform local normal to world space via NormalMatrix
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
    const worldNormal = localNormal.applyMatrix3(normalMatrix).normalize();

    return {
      point: hit.point,
      worldNormal
    };
  }
}
```

---

### 3.3 Failure-Safe Undo/Redo & Drag Coalescing

```typescript
// src/layout-editor/history/HistoryManager.ts
export interface Command {
  execute(): Promise<void>;
  undo(): Promise<void>;
  description: string;
}

export class HistoryManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private isExecuting = false;
  private dragInitialState: Map<string, { x: number; z: number; rotationY: number }> | null = null;

  public beginDrag(targetId: string, initialPos: { x: number; z: number; rotationY: number }): void {
    if (!this.dragInitialState) this.dragInitialState = new Map();
    this.dragInitialState.set(targetId, { ...initialPos });
  }

  public endDrag(
    targetId: string,
    finalPos: { x: number; z: number; rotationY: number },
    applyFn: (pos: { x: number; z: number; rotationY: number }) => Promise<void>
  ): void {
    if (!this.dragInitialState || !this.dragInitialState.has(targetId)) return;
    const initial = this.dragInitialState.get(targetId)!;
    this.dragInitialState.delete(targetId);

    // Coalesce all continuous drag moves into one discrete undoable command
    if (initial.x !== finalPos.x || initial.z !== finalPos.z || initial.rotationY !== finalPos.rotationY) {
      this.execute({
        description: `Move ${targetId}`,
        execute: async () => applyFn(finalPos),
        undo: async () => applyFn(initial)
      });
    }
  }

  public async execute(command: Command): Promise<void> {
    if (this.isExecuting) return;
    this.isExecuting = true;
    try {
      await command.execute();
      this.undoStack.push(command);
      this.redoStack = []; // Clear redo on fresh action
    } finally {
      this.isExecuting = false;
    }
  }

  public async undo(): Promise<void> {
    if (this.isExecuting || !this.undoStack.length) return;
    const command = this.undoStack[this.undoStack.length - 1];
    this.isExecuting = true;
    try {
      await command.undo();
      this.undoStack.pop(); // Pop ONLY after successful undo
      this.redoStack.push(command);
    } finally {
      this.isExecuting = false;
    }
  }

  public async redo(): Promise<void> {
    if (this.isExecuting || !this.redoStack.length) return;
    const command = this.redoStack[this.redoStack.length - 1];
    this.isExecuting = true;
    try {
      await command.execute();
      this.redoStack.pop(); // Pop ONLY after successful redo
      this.undoStack.push(command);
    } finally {
      this.isExecuting = false;
    }
  }
}
```

---

## 4. Subsystem 3: UI Texture Atlas with 2D Edge Dilation

### 4.1 2px Border Edge Extrusion & Lossless WebP Packaging

To eliminate texture bleeding across neighboring sprites during bilinear filtering and mipmapping, extract the 1px perimeter edges and stretch/dilate them outward into a 2px extruded boundary.

```
┌────────────────────────────────────────────────────────┐
│ [Corner TL]       [Extruded Top Edge]      [Corner TR] │
│ ┌────────────────────────────────────────────────────┐ │
│ │                                                    │ │
│ │ [Extruded Left]   [Actual Sprite]  [Extruded Right]│ │
│ │                   (UVs point here)                 │ │
│ │                                                    │ │
│ └────────────────────────────────────────────────────┘ │
│ [Corner BL]     [Extruded Bottom Edge]     [Corner BR] │
└────────────────────────────────────────────────────────┘
```

```javascript
// tools/ui/extrudeAndPack.mjs (Reference Implementation)
import sharp from "sharp";
import { MaxRectsPacker } from "maxrects-packer";

export async function dilateSpriteEdges(inputBuffer, extrude = 2) {
  const image = sharp(inputBuffer).ensureAlpha();
  const { width, height } = await image.metadata();
  const raw = await image.raw().toBuffer();

  const outW = width + extrude * 2;
  const outH = height + extrude * 2;
  const outBuf = Buffer.alloc(outW * outH * 4);

  // Copy center
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = ((y + extrude) * outW + (x + extrude)) * 4;
      outBuf.set(raw.subarray(srcIdx, srcIdx + 4), dstIdx);
    }
  }

  // Extrude Top and Bottom edges
  for (let e = 0; e < extrude; e++) {
    for (let x = 0; x < width; x++) {
      const topSrc = (0 * width + x) * 4;
      const topDst = (e * outW + (x + extrude)) * 4;
      outBuf.set(raw.subarray(topSrc, topSrc + 4), topDst);

      const botSrc = ((height - 1) * width + x) * 4;
      const botDst = ((height + extrude + e) * outW + (x + extrude)) * 4;
      outBuf.set(raw.subarray(botSrc, botSrc + 4), botDst);
    }
  }

  // Extrude Left and Right edges (including corners)
  for (let y = 0; y < outH; y++) {
    const srcY = Math.min(Math.max(y - extrude, 0), height - 1);
    const leftSrc = (srcY * width + 0) * 4;
    const rightSrc = (srcY * width + (width - 1)) * 4;

    for (let e = 0; e < extrude; e++) {
      const leftDst = (y * outW + e) * 4;
      const rightDst = (y * outW + (width + extrude + e)) * 4;
      outBuf.set(raw.subarray(leftSrc, leftSrc + 4), leftDst);
      outBuf.set(raw.subarray(rightSrc, rightSrc + 4), rightDst);
    }
  }

  const resultPng = await sharp(outBuf, { raw: { width: outW, height: outH, channels: 4 } }).png().toBuffer();
  return { buffer: resultPng, innerWidth: width, innerHeight: height, extrude };
}

export async function packLosslessUiAtlas(sprites, outputBase, atlasName) {
  const packer = new MaxRectsPacker(2048, 2048, 2, { smart: true, pot: true });

  for (const sprite of sprites) {
    const dilated = await dilateSpriteEdges(sprite.buffer, 2);
    packer.add({
      name: sprite.name,
      width: dilated.innerWidth + 4,
      height: dilated.innerHeight + 4,
      data: dilated
    });
  }

  const manifest = { atlas: atlasName, frames: {} };

  for (const [binIndex, bin] of packer.bins.entries()) {
    const canvas = sharp({
      create: {
        width: bin.width,
        height: bin.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    });

    const composites = bin.rects.map(r => ({ input: r.data.buffer, left: r.x, top: r.y }));

    // Explicit lossless WebP and PNG
    await canvas.composite(composites).webp({ lossless: true }).toFile(`${outputBase}/${atlasName}_${binIndex}.webp`);
    await canvas.composite(composites).png().toFile(`${outputBase}/${atlasName}_${binIndex}.png`);

    for (const rect of bin.rects) {
      // Manifest UV coordinates point strictly to the inner non-extruded frame
      const innerX = rect.x + 2;
      const innerY = rect.y + 2;
      manifest.frames[rect.name] = {
        frame: { x: innerX, y: innerY, w: rect.data.innerWidth, h: rect.data.innerHeight },
        uv: {
          u0: innerX / bin.width,
          v0: innerY / bin.height,
          u1: (innerX + rect.data.innerWidth) / bin.width,
          v1: (innerY + rect.data.innerHeight) / bin.height
        },
        binIndex
      };
    }
  }

  return manifest;
}
```

---

## 5. Subsystem 4: Category-Based Audio Normalization

### 5.1 Bus Loudness Standards

Universal normalization breaks mix dynamics. The canonical seven semantic bus
roles and their exact loudness/true-peak targets are owned by
`LLM/06_AUDIO_AND_MUSIC_DESIGN_MASTER.md` §2.1. The tool maps live manifest cue
buses and spatial flags to those roles; legacy manifest bus names are routing
aliases, not a second mastering standard.

---

### 5.2 Correct Stderr 2-Pass `loudnorm` Script

`tools/audio/normalizeBus.mjs` captures pass-one JSON from ffmpeg stderr and
feeds all measured fields plus offset into pass two. It pads to the latest cue
end, enforces mono for spatial sources and stereo otherwise, stages every
selected output, rolls back any partially promoted set on failure, and updates
manifest hash/duration/channel metadata atomically. `--dry-run` prints the
resolved plan and `--check` verifies runtime-file parity without rewriting.

---

## 6. Subsystem 5: Deterministic Visual Regression CI

### 6.1 16-Point Determinism Matrix

To eliminate test flakiness in Playwright WebGL rendering:

1. **Resolution**: Locked viewport `1920x1080`
2. **DPR**: `devicePixelRatio = 1.0`
3. **Camera**: Authored fixed position, lookAt, and FOV
4. **Sun/Atmosphere**: Fixed solar azimuth ($215^\circ$) and elevation ($38^\circ$)
5. **Weather**: Fixed state `WEATHER_CLEAR`
6. **Wind**: Vector `(0.4, 0.0, 0.1)`
7. **Water Phase**: Ocean/River uniform time $= 0.0$
8. **Animation**: Skeleton tick paused at time $= 0.0$
9. **Particles**: Seeded PRNG initialized at seed `42`
10. **Simulation**: Deterministic snapshot loaded
11. **Anti-Aliasing**: TAA jitter disabled; FXAA or raw multi-sample locked
12. **Tone-Mapping**: Exposure fixed at `1.0` (no eye-adaptation adaptation loops)
13. **Fonts**: `document.fonts.ready` awaited
14. **Asset Loading**: Handshake on `window.__NEVA_RENDER_READY === true`
15. **Browser**: Chromium build pinned in Playwright
16. **GPU Device**: `--use-gl=angle --use-angle=swiftshader` in headless CI

```typescript
// tests/e2e/visual-regression.spec.ts
import { test, expect } from "@playwright/test";

const GOLD_SCENES = [
  { id: "bridge_river", maxDiffPixels: 250 },
  { id: "starter_farm", maxDiffPixels: 350 },
  { id: "harbor_market", maxDiffPixels: 400 },
  { id: "lighthouse_coast", maxDiffPixels: 300 }
];

for (const scene of GOLD_SCENES) {
  test(`Gold Slice Visual Match: ${scene.id}`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`http://localhost:3000/?goldTest=${scene.id}&seed=42`);

    await page.waitForFunction(() => window.__NEVA_RENDER_READY === true, { timeout: 20000 });

    const canvas = page.locator("canvas#neva-viewport");
    await expect(canvas).toHaveScreenshot(`${scene.id}-baseline.png`, {
      animations: "disabled",
      maxDiffPixels: scene.maxDiffPixels
    });
  });
}
```

---

## 7. Migration & Rollout Plan

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: P0 CORE SAFETY & DEV SPEED (Immediate)                                     │
│ • tools/blender/cache.mjs (Content-addressed incremental builds)                     │
│ • tools/blender/pool.mjs (Dynamic work-stealing Blender worker pool)                 │
│ • tools/layout-editor/patchPlacement.ts (Scoped Recast AST transformer)              │
│ • src/layout-editor/TerrainSnapping.ts (three-mesh-bvh + world normals)              │
│ • src/render/assets/AssetLoader.ts (Safe GPU disposal HMR)                           │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ STAGE 2: P1 PACKAGING & DX                                                           │
│ • tools/ui/extrudeAndPack.mjs (2px edge extrusion + lossless WebP)                  │
│ • tools/cli.mjs (Unified CLI entrypoint)                                             │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ STAGE 3: P2 AUDIO & REGRESSION GATES                                                 │
│ • tools/audio/normalizeBus.mjs (Category-based 2-pass stderr loudnorm)               │
│ • tests/e2e/visual-regression.spec.ts (16-point determinism matrix)                   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```
