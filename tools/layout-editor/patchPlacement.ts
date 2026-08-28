import fs from "node:fs";
import path from "node:path";

import {
  ARCHITECTURE_PLACEMENT_TO_PAD,
  allocateCopyId,
  formatRadians,
  formatWorldCoord,
  HARBOR_NPC_ANCHOR_IDS,
  layoutEditCanDelete,
  layoutEditCanDuplicate,
  LAYOUT_EDITOR_SOURCE_FILES,
  PROCESSING_STATION_LAYOUT_IDS,
  transformPointWithPose,
  type LayoutEditCommit,
  type LayoutEditKind
} from "../../src/layout-editor/layoutEdit";

const SAFE_EXPR = /^[0-9+\-*/().,\sMathPIatan2_]+$/;

export interface LayoutSourceFiles {
  farmLayout: string;
  worldLayout: string;
  worldAnchors: string;
  environment: string;
  interior: string;
  npcs: string;
}

export class LayoutEditPatchError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "LayoutEditPatchError";
  }
}

export function evalLayoutNumber(expression: string): number {
  const trimmed = expression.trim();
  if (!SAFE_EXPR.test(trimmed)) {
    throw new LayoutEditPatchError(`Unsafe numeric expression: ${trimmed}`);
  }
  const value = Function(`"use strict"; return (${trimmed});`)() as unknown;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new LayoutEditPatchError(`Expression did not evaluate to a number: ${trimmed}`);
  }
  return value;
}

export function replaceFieldValue(block: string, field: string, replacement: string): string {
  const prefix = block.match(new RegExp(`\\b${field}\\s*:\\s*`));
  if (!prefix || prefix.index === undefined) {
    throw new LayoutEditPatchError(`Missing field ${field} in layout block`);
  }
  let index = prefix.index + prefix[0].length;
  let depth = 0;
  const valueStart = index;
  while (index < block.length) {
    const char = block[index];
    if (char === "(" || char === "{" || char === "[") depth += 1;
    else if (char === ")" || char === "}" || char === "]") {
      if (depth === 0) break;
      depth -= 1;
    } else if ((char === "," || char === "\n") && depth === 0) break;
    index += 1;
  }
  return `${block.slice(0, valueStart)}${replacement}${block.slice(index)}`;
}

export function extractBalanced(source: string, openIndex: number): { text: string; end: number } {
  const open = source[openIndex];
  const close = open === "{" ? "}" : open === "(" ? ")" : open === "[" ? "]" : null;
  if (!close) throw new LayoutEditPatchError("Expected '{' or '(' or '[' to extract a block");
  let depth = 0;
  for (let index = openIndex; index < source.length; index++) {
    const char = source[index];
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return { text: source.slice(openIndex, index + 1), end: index + 1 };
      }
    }
  }
  throw new LayoutEditPatchError("Unbalanced block while patching layout source");
}

function replaceSlice(source: string, start: number, end: number, next: string): string {
  return `${source.slice(0, start)}${next}${source.slice(end)}`;
}

function findIdObject(source: string, id: string): { start: number; end: number; text: string } {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`id:\\s*"${escaped}"\\s*,`);
  const match = pattern.exec(source);
  if (!match || match.index === undefined) {
    throw new LayoutEditPatchError(`Could not find id "${id}"`);
  }
  const start = source.lastIndexOf("{", match.index);
  if (start < 0) throw new LayoutEditPatchError(`Could not find object start for "${id}"`);
  const extracted = extractBalanced(source, start);
  return { start, end: extracted.end, text: extracted.text };
}

function patchObjectXzRotation(
  block: string,
  x: number,
  z: number,
  rotationY: number | null
): string {
  let next = replaceFieldValue(block, "x", formatWorldCoord(x));
  next = replaceFieldValue(next, "z", formatWorldCoord(z));
  if (rotationY !== null && /\brotationY\s*:/.test(next)) {
    next = replaceFieldValue(next, "rotationY", formatRadians(rotationY));
  }
  return next;
}

function parseStarterFarmOrigin(farmLayout: string): { x: number; z: number } {
  const brace = findExportedObjectBrace(farmLayout, "STARTER_FARM_LAYOUT");
  const block = extractBalanced(farmLayout, brace);
  const originIndex = block.text.indexOf("origin:");
  if (originIndex < 0) throw new LayoutEditPatchError("Missing STARTER_FARM_LAYOUT.origin");
  const originBrace = block.text.indexOf("{", originIndex);
  const origin = extractBalanced(block.text, originBrace);
  const xMatch = origin.text.match(/\bx:\s*([^,\n}]+)/);
  const zMatch = origin.text.match(/\bz:\s*([^,\n}]+)/);
  if (!xMatch || !zMatch) throw new LayoutEditPatchError("Could not parse STARTER_FARM_LAYOUT.origin");
  return { x: evalLayoutNumber(xMatch[1]!), z: evalLayoutNumber(zMatch[1]!) };
}

function writeFarmLocal(
  farmLayout: string,
  commit: LayoutEditCommit
): { x: number; z: number; rotationY: number } {
  const origin = parseStarterFarmOrigin(farmLayout);
  return {
    x: commit.x - origin.x,
    z: commit.z - origin.z,
    rotationY: commit.rotationY
  };
}

function patchFarmhouseDoorFollow(
  farmLayout: string,
  interior: string,
  newWorld: { x: number; z: number; rotationY: number }
): string {
  const farmhouse = findIdObject(farmLayout, "farmhouse");
  const xMatch = farmhouse.text.match(/\bx:\s*([^,\n]+)/);
  const zMatch = farmhouse.text.match(/\bz:\s*([^,\n]+)/);
  const rotMatch = farmhouse.text.match(/\brotationY:\s*([^,\n]+)/);
  if (!xMatch || !zMatch || !rotMatch) {
    throw new LayoutEditPatchError("Could not parse farmhouse pose for door follow");
  }
  const origin = parseStarterFarmOrigin(farmLayout);
  const from = {
    x: origin.x + evalLayoutNumber(xMatch[1]!),
    z: origin.z + evalLayoutNumber(zMatch[1]!),
    rotationY: evalLayoutNumber(rotMatch[1]!)
  };
  const doorNeedle = "export const FARMHOUSE_OUTSIDE_DOOR";
  const doorIndex = interior.indexOf(doorNeedle);
  if (doorIndex < 0) throw new LayoutEditPatchError("Missing FARMHOUSE_OUTSIDE_DOOR");
  const brace = interior.indexOf("{", doorIndex);
  const doorBlock = extractBalanced(interior, brace);
  const doorX = doorBlock.text.match(/\bx:\s*([^,\n]+)/);
  const doorZ = doorBlock.text.match(/\bz:\s*([^,\n]+)/);
  if (!doorX || !doorZ) throw new LayoutEditPatchError("Could not parse FARMHOUSE_OUTSIDE_DOOR");
  const nextDoor = transformPointWithPose({
    point: { x: evalLayoutNumber(doorX[1]!), z: evalLayoutNumber(doorZ[1]!) },
    from,
    to: newWorld
  });
  let patchedDoor = replaceFieldValue(doorBlock.text, "x", formatWorldCoord(nextDoor.x));
  patchedDoor = replaceFieldValue(patchedDoor, "z", formatWorldCoord(nextDoor.z));
  const spawnIndex = patchedDoor.indexOf("exitSpawn");
  if (spawnIndex >= 0) {
    const spawnBrace = patchedDoor.indexOf("{", spawnIndex);
    const spawn = extractBalanced(patchedDoor, spawnBrace);
    const spawnX = spawn.text.match(/\bx:\s*([^,\n]+)/);
    const spawnZ = spawn.text.match(/\bz:\s*([^,\n]+)/);
    const spawnRot = spawn.text.match(/\brotationY:\s*([^,\n]+)/);
    if (!spawnX || !spawnZ || !spawnRot) {
      throw new LayoutEditPatchError("Could not parse farmhouse exitSpawn");
    }
    const nextSpawn = transformPointWithPose({
      point: { x: evalLayoutNumber(spawnX[1]!), z: evalLayoutNumber(spawnZ[1]!) },
      from,
      to: newWorld
    });
    let nextSpawnBlock = replaceFieldValue(spawn.text, "x", formatWorldCoord(nextSpawn.x));
    nextSpawnBlock = replaceFieldValue(nextSpawnBlock, "z", formatWorldCoord(nextSpawn.z));
    nextSpawnBlock = replaceFieldValue(
      nextSpawnBlock,
      "rotationY",
      formatRadians(evalLayoutNumber(spawnRot[1]!) + (newWorld.rotationY - from.rotationY))
    );
    patchedDoor = replaceSlice(patchedDoor, spawnBrace, spawn.end, nextSpawnBlock);
  }
  return replaceSlice(interior, brace, doorBlock.end, patchedDoor);
}

function patchAuthoredPlacement(source: string, id: string, commit: LayoutEditCommit): string {
  const found = findAuthoredPlacementCall(source, id);
  const brace = found.text.indexOf("{");
  const block = extractBalanced(found.text, brace);
  const next = patchObjectXzRotation(block.text, commit.x, commit.z, commit.rotationY);
  return replaceSlice(source, found.start + brace, found.start + block.end, next);
}

function upsertRecordLiteral(
  source: string,
  constName: string,
  id: string,
  entry: string
): string {
  const brace = findExportedObjectBrace(source, constName);
  const block = extractBalanced(source, brace);
  const entryNeedle = `"${id}":`;
  if (block.text.includes(entryNeedle)) {
    const entryStart = block.text.indexOf(entryNeedle);
    const valueBrace = block.text.indexOf("{", entryStart);
    const existing = extractBalanced(block.text, valueBrace);
    const nextBlock = replaceSlice(block.text, valueBrace, existing.end, entry);
    return replaceSlice(source, brace, block.end, nextBlock);
  }
  const inner = block.text.slice(1, -1).replace(/\s*$/, "");
  const trimmedInner = inner.trim();
  const separator = trimmedInner.length === 0 || trimmedInner.endsWith(",") ? "\n" : ",\n";
  const insertion = trimmedInner.length === 0
    ? `\n  "${id}": ${entry},\n`
    : `${inner}${separator}  "${id}": ${entry},\n`;
  return replaceSlice(source, brace, block.end, `{${insertion}}`);
}

function upsertPlacementOverride(source: string, commit: LayoutEditCommit): string {
  const entry = `{ x: ${formatWorldCoord(commit.x)}, z: ${formatWorldCoord(commit.z)}, rotationY: ${formatRadians(commit.rotationY)} }`;
  return upsertRecordLiteral(source, "PLACEMENT_OVERRIDES", commit.id, entry);
}

function upsertFenceOverride(source: string, commit: LayoutEditCommit): string {
  const local = writeFarmLocal(source, commit);
  const entry = `{ x: ${formatWorldCoord(local.x)}, z: ${formatWorldCoord(local.z)}, rotationY: ${formatRadians(local.rotationY)} }`;
  return upsertRecordLiteral(source, "FARM_FENCE_OVERRIDES", commit.id, entry);
}

function patchPad(source: string, padId: string, commit: LayoutEditCommit): string {
  const found = findIdObject(source, padId);
  let next = found.text;
  const centerIndex = next.indexOf("center:");
  if (centerIndex < 0) throw new LayoutEditPatchError(`Pad ${padId} is missing center`);
  const centerBrace = next.indexOf("{", centerIndex);
  const center = extractBalanced(next, centerBrace);
  let nextCenter = replaceFieldValue(center.text, "x", formatWorldCoord(commit.x));
  nextCenter = replaceFieldValue(nextCenter, "z", formatWorldCoord(commit.z));
  next = replaceSlice(next, centerBrace, center.end, nextCenter);
  next = replaceFieldValue(next, "rotationY", formatRadians(commit.rotationY));
  return replaceSlice(source, found.start, found.end, next);
}

function findExportedObjectBrace(source: string, constName: string): number {
  const marker = `export const ${constName}`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new LayoutEditPatchError(`Missing ${constName}`);
  const assign = source.indexOf("= {", markerIndex);
  if (assign < 0) throw new LayoutEditPatchError(`Missing object initializer for ${constName}`);
  return source.indexOf("{", assign);
}

function patchNamedConstXz(
  source: string,
  constName: string,
  x: number,
  z: number,
  rotationY: number | null
): string {
  const brace = findExportedObjectBrace(source, constName);
  const block = extractBalanced(source, brace);
  let next = block.text;
  if (/\bposition\s*:/.test(next)) {
    const posIndex = next.indexOf("position:");
    const posBrace = next.indexOf("{", posIndex);
    const pos = extractBalanced(next, posBrace);
    let nextPos = replaceFieldValue(pos.text, "x", formatWorldCoord(x));
    nextPos = replaceFieldValue(nextPos, "z", formatWorldCoord(z));
    next = replaceSlice(next, posBrace, pos.end, nextPos);
  } else {
    next = replaceFieldValue(next, "x", formatWorldCoord(x));
    next = replaceFieldValue(next, "z", formatWorldCoord(z));
  }
  if (rotationY !== null && /\brotationY\s*:/.test(next)) {
    next = replaceFieldValue(next, "rotationY", formatRadians(rotationY));
  }
  return replaceSlice(source, brace, block.end, next);
}

function patchLandmarkLiteral(
  source: string,
  id: "lighthouse" | "dock" | "bridge",
  commit: LayoutEditCommit
): string {
  if (id === "bridge") {
    const marker = "const BRIDGE_CENTER = Object.freeze({";
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) throw new LayoutEditPatchError("Missing BRIDGE_CENTER");
    const brace = source.indexOf("{", markerIndex);
    const block = extractBalanced(source, brace);
    let next = replaceFieldValue(block.text, "x", formatWorldCoord(commit.x));
    next = replaceFieldValue(next, "z", formatWorldCoord(commit.z));
    let patched = replaceSlice(source, brace, block.end, next);
    patched = patched.replace(
      /(bridge:\s*\{\s*x:\s*BRIDGE_CENTER\.x,\s*z:\s*BRIDGE_CENTER\.z,\s*yOffset:\s*0\.1,\s*rotationY:\s*)([^,]+)/,
      `$1${formatRadians(commit.rotationY)}`
    );
    return patched;
  }
  const needle = `${id}: {`;
  const index = source.indexOf(needle);
  if (index < 0) throw new LayoutEditPatchError(`Missing landmark ${id}`);
  const brace = source.indexOf("{", index);
  const block = extractBalanced(source, brace);
  const next = patchObjectXzRotation(block.text, commit.x, commit.z, commit.rotationY);
  return replaceSlice(source, brace, block.end, next);
}

function patchNpcLiteral(source: string, npcId: string, commit: LayoutEditCommit): string {
  const escaped = npcId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`id:\\s*"${escaped}"\\s*,`);
  const match = pattern.exec(source);
  if (!match || match.index === undefined) throw new LayoutEditPatchError(`Missing NPC ${npcId}`);
  const start = source.lastIndexOf("{", match.index);
  const npcBlock = extractBalanced(source, start);
  const anchorIndex = npcBlock.text.indexOf("anchor:");
  if (anchorIndex < 0) throw new LayoutEditPatchError(`NPC ${npcId} is missing an anchor`);
  const brace = npcBlock.text.indexOf("{", anchorIndex);
  const anchor = extractBalanced(npcBlock.text, brace);
  let nextAnchor = anchor.text;
  if (!(npcId in HARBOR_NPC_ANCHOR_IDS)) {
    nextAnchor = replaceFieldValue(nextAnchor, "x", formatWorldCoord(commit.x));
    nextAnchor = replaceFieldValue(nextAnchor, "z", formatWorldCoord(commit.z));
  }
  nextAnchor = replaceFieldValue(nextAnchor, "rotationY", formatRadians(commit.rotationY));
  const nextNpc = replaceSlice(npcBlock.text, brace, anchor.end, nextAnchor);
  return replaceSlice(source, start, npcBlock.end, nextNpc);
}

function layoutRotationForWrite(commit: LayoutEditCommit): number {
  if (
    (commit.kind === "farm-structure" || commit.kind === "world-anchor")
    && PROCESSING_STATION_LAYOUT_IDS.has(commit.id)
  ) {
    return commit.rotationY - Math.PI;
  }
  return commit.rotationY;
}

function collectLayoutIds(files: LayoutSourceFiles): Set<string> {
  const ids = new Set<string>();
  const blob = `${files.farmLayout}\n${files.environment}\n${files.interior}\n${files.worldLayout}\n${files.worldAnchors}\n${files.npcs}`;
  for (const match of blob.matchAll(/id:\s*"([^"]+)"/g)) ids.add(match[1]!);
  for (const match of blob.matchAll(/authoredPlacement\("([^"]+)"/g)) ids.add(match[1]!);
  for (const match of blob.matchAll(/"((?:fence_|seeded-fill\.|layout-derived\.|authored\.)[^"]+)":\s*\{/g)) {
    ids.add(match[1]!);
  }
  return ids;
}

function resolveDuplicateCommit(files: LayoutSourceFiles, commit: LayoutEditCommit): LayoutEditCommit {
  if (!commit.duplicateFrom) return commit;
  const pasteKind = commit.kind === "environment-override" ? "authored-detail" : commit.kind;
  if (!layoutEditCanDuplicate(pasteKind) && pasteKind !== "authored-detail") {
    throw new LayoutEditPatchError(`Cannot copy ${commit.kind}`);
  }
  if (!layoutEditCanDuplicate(commit.kind)) {
    throw new LayoutEditPatchError(`Cannot copy ${commit.kind}`);
  }
  return {
    ...commit,
    kind: pasteKind,
    id: allocateCopyId(collectLayoutIds(files), commit.duplicateFrom, commit.assetId)
  };
}

function findConstArrayOpen(source: string, constName: string): number {
  const pattern = new RegExp(`(?:export\\s+)?const\\s+${constName}\\b`);
  const match = pattern.exec(source);
  if (!match || match.index === undefined) {
    throw new LayoutEditPatchError(`Missing array ${constName}`);
  }
  const windowEnd = match.index + 280;
  const freeze = source.indexOf("Object.freeze([", match.index);
  if (freeze >= 0 && freeze < windowEnd) {
    return freeze + "Object.freeze(".length;
  }
  const assign = source.indexOf("= [", match.index);
  if (assign < 0 || assign > windowEnd) {
    throw new LayoutEditPatchError(`Missing array initializer for ${constName}`);
  }
  return source.indexOf("[", assign);
}

function insertSnippetIntoConstArray(source: string, constName: string, snippet: string): string {
  const open = findConstArrayOpen(source, constName);
  const block = extractBalanced(source, open);
  const inner = block.text.slice(1, -1).replace(/\s*$/, "");
  const comma = constArrayInnerNeedsComma(inner) ? "," : "";
  const insertion = `${inner}${comma}\n  ${snippet}\n`;
  return replaceSlice(source, open, block.end, `[${insertion}]`);
}

/** True when the last real array element has no trailing comma (comments ignored). */
function constArrayInnerNeedsComma(inner: string): boolean {
  const lines = inner.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const code = lines[index]!.replace(/\/\/.*$/, "").trim();
    if (code.length === 0) continue;
    return !code.endsWith(",");
  }
  return false;
}

function findAuthoredPlacementCall(source: string, id: string): { start: number; end: number; text: string } {
  const needle = `authoredPlacement("${id}"`;
  let from = 0;
  while (from < source.length) {
    const start = source.indexOf(needle, from);
    if (start < 0) throw new LayoutEditPatchError(`Missing authoredPlacement ${id}`);
    const after = source[start + needle.length];
    if (after === "," || after === ")" || after === " " || after === "\n" || after === "\r" || after === "\t") {
      const objStart = source.indexOf("{", start);
      if (objStart < 0) throw new LayoutEditPatchError(`Missing authoredPlacement object ${id}`);
      const obj = extractBalanced(source, objStart);
      let end = obj.end;
      while (end < source.length && source[end] !== ")") end += 1;
      if (source[end] !== ")") throw new LayoutEditPatchError(`Unclosed authoredPlacement ${id}`);
      end += 1;
      return { start, end, text: source.slice(start, end) };
    }
    from = start + needle.length;
  }
  throw new LayoutEditPatchError(`Missing authoredPlacement ${id}`);
}

/** Insert a new authoredPlacement after an existing call, keeping commas on both. */
function insertAuthoredPlacementAfter(source: string, callEnd: number, call: string): string {
  let after = callEnd;
  const trailingComma = source.slice(after).match(/^[ \t]*,/);
  if (trailingComma) after += trailingComma[0].length;
  return `${source.slice(0, callEnd)},\n  ${call},${source.slice(after)}`;
}

function formatAuthoredPlacementSnippet(commit: LayoutEditCommit): string {
  if (!commit.assetId || !/^[a-z0-9_]+$/i.test(commit.assetId)) {
    throw new LayoutEditPatchError("Copy needs a catalog assetId for this object");
  }
  const scale = commit.scale
    ? `[${commit.scale.map((value) => formatWorldCoord(value)).join(", ")}]`
    : "[1, 1, 1]";
  const fields = [
    `assetId: "${commit.assetId}"`,
    `x: ${formatWorldCoord(commit.x)}`,
    `z: ${formatWorldCoord(commit.z)}`,
    `rotationY: ${formatRadians(commit.rotationY)}`,
    `scale: ${scale}`
  ];
  if (commit.y !== undefined) fields.push(`y: ${formatWorldCoord(commit.y)}`);
  if (commit.grounding) {
    fields.push(
      `grounding: [${commit.grounding.map((value) => formatWorldCoord(value)).join(", ")}]`
    );
  }
  if (commit.practicalLight === true) {
    fields.push("practicalLight: true");
  }
  return `authoredPlacement("${commit.id}", { ${fields.join(", ")} }),`;
}

function duplicateAuthoredPlacement(source: string, commit: LayoutEditCommit): string {
  if (commit.duplicateFrom && authoredPlacementExists(source, commit.duplicateFrom)) {
    const found = findAuthoredPlacementCall(source, commit.duplicateFrom);
    const objStart = found.text.indexOf("{");
    const obj = extractBalanced(found.text, objStart);
    const patchedObj = patchObjectXzRotation(obj.text, commit.x, commit.z, commit.rotationY);
    const call = `authoredPlacement("${commit.id}", ${patchedObj})`;
    return insertAuthoredPlacementAfter(source, found.end, call);
  }
  return insertSnippetIntoConstArray(source, "AUTHORED_DETAIL_PLACEMENTS", formatAuthoredPlacementSnippet(commit));
}

function authoredPlacementExists(source: string, id: string): boolean {
  try {
    findAuthoredPlacementCall(source, id);
    return true;
  } catch (error) {
    if (error instanceof LayoutEditPatchError) return false;
    throw error;
  }
}

function duplicateNamedObject(
  source: string,
  constName: string,
  commit: LayoutEditCommit,
  localX: number,
  localZ: number
): string {
  if (!commit.duplicateFrom) throw new LayoutEditPatchError("Missing duplicate source id");
  try {
    const found = findIdObject(source, commit.duplicateFrom);
    let next = found.text.replace(
      new RegExp(`id:\\s*"${commit.duplicateFrom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
      `id: "${commit.id}"`
    );
    next = patchObjectXzRotation(next, localX, localZ, commit.rotationY);
    if (commit.y !== undefined && /\by\s*:/.test(next)) {
      next = replaceFieldValue(next, "y", formatWorldCoord(commit.y));
    }
    if (commit.scale && /\bscale\s*:/.test(next) && !/\bscale\s*:\s*\[/.test(next)) {
      next = replaceFieldValue(next, "scale", formatWorldCoord(commit.scale[0]!));
    }
    return insertSnippetIntoConstArray(source, constName, `${next},`);
  } catch (error) {
    if (!(error instanceof LayoutEditPatchError)) throw error;
    if (constName === "STARTER_PROP_ANCHORS") {
      return insertSnippetIntoConstArray(source, constName, formatFarmPropSnippet(commit, localX, localZ));
    }
    if (constName === "FARMHOUSE_INTERIOR_PROPS") {
      return insertSnippetIntoConstArray(source, constName, formatInteriorPropSnippet(commit));
    }
    throw error;
  }
}

function formatFarmPropSnippet(commit: LayoutEditCommit, localX: number, localZ: number): string {
  if (!commit.propType || !/^[a-z0-9-]+$/i.test(commit.propType)) {
    throw new LayoutEditPatchError("Copy needs the farm prop type after the original was removed");
  }
  const scale = commit.scale ? formatWorldCoord(commit.scale[0]!) : "1";
  return `{ id: "${commit.id}", type: "${commit.propType}", x: ${formatWorldCoord(localX)}, z: ${formatWorldCoord(localZ)}, rotationY: ${formatRadians(commit.rotationY)}, scale: ${scale} },`;
}

function formatInteriorPropSnippet(commit: LayoutEditCommit): string {
  if (!commit.assetId || !/^[a-z0-9_]+$/i.test(commit.assetId)) {
    throw new LayoutEditPatchError("Copy needs a catalog assetId for this object");
  }
  const scale = commit.scale ? formatWorldCoord(commit.scale[0]!) : "1";
  const y = commit.y !== undefined ? formatWorldCoord(commit.y) : "0";
  return `{ id: "${commit.id}", assetId: "${commit.assetId}", x: ${formatWorldCoord(commit.x)}, y: ${y}, z: ${formatWorldCoord(commit.z)}, rotationY: ${formatRadians(commit.rotationY)}, scale: ${scale} },`;
}

function insertDuplicate(files: LayoutSourceFiles, commit: LayoutEditCommit): LayoutSourceFiles {
  const next: LayoutSourceFiles = { ...files };
  switch (commit.kind) {
    case "authored-detail":
      next.environment = duplicateAuthoredPlacement(next.environment, commit);
      break;
    case "farm-prop": {
      const local = writeFarmLocal(next.farmLayout, commit);
      next.farmLayout = duplicateNamedObject(
        next.farmLayout,
        "STARTER_PROP_ANCHORS",
        commit,
        local.x,
        local.z
      );
      break;
    }
    case "farm-fence": {
      const local = writeFarmLocal(next.farmLayout, commit);
      next.farmLayout = insertSnippetIntoConstArray(
        next.farmLayout,
        "FARM_FENCE_EXTRAS",
        `{ id: "${commit.id}", x: ${formatWorldCoord(local.x)}, z: ${formatWorldCoord(local.z)}, rotationY: ${formatRadians(commit.rotationY)} },`
      );
      break;
    }
    case "interior-prop":
      next.interior = duplicateNamedObject(
        next.interior,
        "FARMHOUSE_INTERIOR_PROPS",
        commit,
        commit.x,
        commit.z
      );
      break;
    default:
      throw new LayoutEditPatchError(`Cannot copy ${commit.kind}`);
  }
  return next;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function constArrayHasId(source: string, constName: string, id: string): boolean {
  const open = findConstArrayOpen(source, constName);
  const block = extractBalanced(source, open);
  return new RegExp(`id:\\s*"${escapeRegExp(id)}"`).test(block.text);
}

function removeInclusiveComma(source: string, start: number, end: number): string {
  let from = start;
  let to = end;
  const after = source.slice(end).match(/^[ \t]*,/);
  if (after) {
    to = end + after[0].length;
  } else {
    const before = source.slice(0, start).match(/,[ \t]*$/);
    if (before) from = start - before[0].length;
  }
  return `${source.slice(0, from)}${source.slice(to)}`.replace(/\n[ \t]*\n[ \t]*\n/g, "\n\n");
}

function removeRecordEntry(source: string, constName: string, id: string): string {
  const brace = findExportedObjectBrace(source, constName);
  const block = extractBalanced(source, brace);
  const entryNeedle = `"${id}":`;
  const entryStart = block.text.indexOf(entryNeedle);
  if (entryStart < 0) return source;
  const valueBrace = block.text.indexOf("{", entryStart);
  const existing = extractBalanced(block.text, valueBrace);
  const nextInner = removeInclusiveComma(block.text, entryStart, existing.end);
  return replaceSlice(source, brace, block.end, nextInner);
}

function removeArrayObjectById(source: string, constName: string, id: string): string {
  const open = findConstArrayOpen(source, constName);
  const block = extractBalanced(source, open);
  const pattern = new RegExp(`id:\\s*"${escapeRegExp(id)}"\\s*,`);
  const match = pattern.exec(block.text);
  if (!match || match.index === undefined) {
    throw new LayoutEditPatchError(`Could not find id "${id}" in ${constName}`);
  }
  const localStart = block.text.lastIndexOf("{", match.index);
  const extracted = extractBalanced(block.text, localStart);
  const nextInner = removeInclusiveComma(block.text, localStart, extracted.end);
  return replaceSlice(source, open, block.end, nextInner);
}

function removeAuthoredPlacementCall(source: string, id: string): string {
  const found = findAuthoredPlacementCall(source, id);
  return removeInclusiveComma(source, found.start, found.end);
}

function upsertStringArrayId(source: string, constName: string, id: string): string {
  const open = findConstArrayOpen(source, constName);
  const block = extractBalanced(source, open);
  const needle = `"${id}"`;
  if (block.text.includes(needle)) return source;
  return insertSnippetIntoConstArray(source, constName, `${needle},`);
}

function removeLayoutEdit(files: LayoutSourceFiles, commit: LayoutEditCommit): LayoutSourceFiles {
  if (!layoutEditCanDelete(commit.kind)) {
    throw new LayoutEditPatchError(`Cannot delete ${commit.kind}`);
  }
  const next: LayoutSourceFiles = { ...files };
  switch (commit.kind) {
    case "authored-detail":
      next.environment = removeAuthoredPlacementCall(next.environment, commit.id);
      break;
    case "environment-override":
      next.environment = upsertStringArrayId(next.environment, "PLACEMENT_REMOVED", commit.id);
      next.environment = removeRecordEntry(next.environment, "PLACEMENT_OVERRIDES", commit.id);
      break;
    case "farm-prop":
      next.farmLayout = removeArrayObjectById(next.farmLayout, "STARTER_PROP_ANCHORS", commit.id);
      break;
    case "interior-prop":
      next.interior = removeArrayObjectById(next.interior, "FARMHOUSE_INTERIOR_PROPS", commit.id);
      break;
    case "farm-fence":
      if (constArrayHasId(next.farmLayout, "FARM_FENCE_EXTRAS", commit.id)) {
        next.farmLayout = removeArrayObjectById(next.farmLayout, "FARM_FENCE_EXTRAS", commit.id);
      } else {
        next.farmLayout = upsertStringArrayId(next.farmLayout, "FARM_FENCE_REMOVED", commit.id);
      }
      next.farmLayout = removeRecordEntry(next.farmLayout, "FARM_FENCE_OVERRIDES", commit.id);
      break;
    default:
      throw new LayoutEditPatchError(`Cannot delete ${commit.kind}`);
  }
  return next;
}

export function applyLayoutEditToSources(
  files: LayoutSourceFiles,
  commit: LayoutEditCommit
): LayoutSourceFiles {
  if (commit.remove) {
    return removeLayoutEdit(files, commit);
  }
  if (commit.duplicateFrom) {
    return insertDuplicate(files, resolveDuplicateCommit(files, commit));
  }
  const next: LayoutSourceFiles = { ...files };
  const rotationY = layoutRotationForWrite(commit);

  switch (commit.kind) {
    case "farmstead":
    case "farm-prop":
    case "farm-structure": {
      const local = writeFarmLocal(next.farmLayout, { ...commit, rotationY });
      const found = findIdObject(next.farmLayout, commit.id);
      const patched = patchObjectXzRotation(found.text, local.x, local.z, local.rotationY);
      next.farmLayout = replaceSlice(next.farmLayout, found.start, found.end, patched);
      if (commit.kind === "farmstead" && commit.id === "farmhouse") {
        next.interior = patchFarmhouseDoorFollow(files.farmLayout, next.interior, {
          x: commit.x,
          z: commit.z,
          rotationY: commit.rotationY
        });
      }
      break;
    }
    case "farm-fence":
      next.farmLayout = upsertFenceOverride(next.farmLayout, { ...commit, rotationY });
      break;
    case "architecture-pad":
      next.worldLayout = patchPad(next.worldLayout, commit.id, { ...commit, rotationY });
      break;
    case "landmark":
      if (commit.id === "lighthouse" || commit.id === "dock" || commit.id === "bridge") {
        next.worldLayout = patchLandmarkLiteral(next.worldLayout, commit.id, { ...commit, rotationY });
      } else if (commit.id === "fish-market") {
        next.worldAnchors = patchNamedConstXz(
          next.worldAnchors,
          "HARBOR_MARKET",
          commit.x,
          commit.z,
          rotationY
        );
      } else if (commit.id === "produce-stall") {
        next.worldAnchors = patchNamedConstXz(
          next.worldAnchors,
          "VILLAGE_MARKET",
          commit.x,
          commit.z,
          rotationY
        );
      } else {
        throw new LayoutEditPatchError(`Unsupported landmark ${commit.id}`);
      }
      break;
    case "world-anchor":
      if (commit.id === "struct.harbor_fish_table") {
        next.worldAnchors = patchNamedConstXz(
          next.worldAnchors,
          "HARBOR_FISH_TABLE",
          commit.x,
          commit.z,
          rotationY
        );
      } else {
        throw new LayoutEditPatchError(`Unsupported world-anchor ${commit.id}`);
      }
      break;
    case "authored-detail": {
      const padId = ARCHITECTURE_PLACEMENT_TO_PAD[commit.id];
      if (padId) {
        next.worldLayout = patchPad(next.worldLayout, padId, { ...commit, rotationY });
      } else {
        next.environment = patchAuthoredPlacement(next.environment, commit.id, { ...commit, rotationY });
      }
      break;
    }
    case "environment-override":
      next.environment = upsertPlacementOverride(next.environment, { ...commit, rotationY });
      break;
    case "interior-prop": {
      const found = findIdObject(next.interior, commit.id);
      let patched = patchObjectXzRotation(found.text, commit.x, commit.z, rotationY);
      if (commit.y !== undefined) patched = replaceFieldValue(patched, "y", formatWorldCoord(commit.y));
      next.interior = replaceSlice(next.interior, found.start, found.end, patched);
      break;
    }
    case "npc": {
      next.npcs = patchNpcLiteral(next.npcs, commit.id, { ...commit, rotationY });
      const harborConst = HARBOR_NPC_ANCHOR_IDS[commit.id];
      if (harborConst) {
        next.worldAnchors = patchNamedConstXz(next.worldAnchors, harborConst, commit.x, commit.z, null);
      }
      break;
    }
    default: {
      const exhaustive: never = commit.kind;
      throw new LayoutEditPatchError(`Unsupported layout edit kind ${String(exhaustive)}`);
    }
  }
  return next;
}

export function isLayoutEditCommit(value: unknown): value is LayoutEditCommit {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const kinds: LayoutEditKind[] = [
    "farmstead",
    "farm-prop",
    "farm-fence",
    "farm-structure",
    "architecture-pad",
    "landmark",
    "world-anchor",
    "authored-detail",
    "environment-override",
    "interior-prop",
    "npc"
  ];
  return (
    typeof record.kind === "string"
    && kinds.includes(record.kind as LayoutEditKind)
    && typeof record.id === "string"
    && record.id.length > 0
    && record.id.length < 180
    && typeof record.x === "number"
    && Number.isFinite(record.x)
    && typeof record.z === "number"
    && Number.isFinite(record.z)
    && typeof record.rotationY === "number"
    && Number.isFinite(record.rotationY)
    && (record.y === undefined || (typeof record.y === "number" && Number.isFinite(record.y)))
    && (record.remove === undefined || record.remove === true)
    && (record.duplicateFrom === undefined
      || (typeof record.duplicateFrom === "string"
        && record.duplicateFrom.length > 0
        && record.duplicateFrom.length < 180))
    && (record.assetId === undefined
      || (typeof record.assetId === "string" && /^[a-z0-9_]+$/i.test(record.assetId)))
    && (record.scale === undefined
      || (Array.isArray(record.scale)
        && record.scale.length === 3
        && record.scale.every((value) => typeof value === "number" && Number.isFinite(value))))
    && (record.grounding === undefined
      || (Array.isArray(record.grounding)
        && record.grounding.length === 2
        && record.grounding.every((value) => typeof value === "number" && Number.isFinite(value))))
    && (record.practicalLight === undefined || typeof record.practicalLight === "boolean")
    && (record.propType === undefined
      || (typeof record.propType === "string"
        && /^[a-z0-9-]+$/i.test(record.propType)
        && record.propType.length < 40))
  );
}

export function readLayoutSources(rootDirectory: string): LayoutSourceFiles {
  const read = (relative: string): string =>
    fs.readFileSync(path.join(rootDirectory, relative), "utf8");
  return {
    farmLayout: read(LAYOUT_EDITOR_SOURCE_FILES.farmLayout),
    worldLayout: read(LAYOUT_EDITOR_SOURCE_FILES.worldLayout),
    worldAnchors: read(LAYOUT_EDITOR_SOURCE_FILES.worldAnchors),
    environment: read(LAYOUT_EDITOR_SOURCE_FILES.environment),
    interior: read(LAYOUT_EDITOR_SOURCE_FILES.interior),
    npcs: read(LAYOUT_EDITOR_SOURCE_FILES.npcs)
  };
}

export function writeLayoutSources(
  rootDirectory: string,
  files: LayoutSourceFiles
): string[] {
  const written: string[] = [];
  const write = (relative: string, contents: string, previous: string): void => {
    if (contents === previous) return;
    const absolute = path.join(rootDirectory, relative);
    fs.writeFileSync(absolute, contents, "utf8");
    written.push(absolute);
  };
  const previous = readLayoutSources(rootDirectory);
  write(LAYOUT_EDITOR_SOURCE_FILES.farmLayout, files.farmLayout, previous.farmLayout);
  write(LAYOUT_EDITOR_SOURCE_FILES.worldLayout, files.worldLayout, previous.worldLayout);
  write(LAYOUT_EDITOR_SOURCE_FILES.worldAnchors, files.worldAnchors, previous.worldAnchors);
  write(LAYOUT_EDITOR_SOURCE_FILES.environment, files.environment, previous.environment);
  write(LAYOUT_EDITOR_SOURCE_FILES.interior, files.interior, previous.interior);
  write(LAYOUT_EDITOR_SOURCE_FILES.npcs, files.npcs, previous.npcs);
  return written;
}

export function planLayoutEdit(
  rootDirectory: string,
  commit: LayoutEditCommit
): { next: LayoutSourceFiles; files: string[]; id: string } {
  const current = readLayoutSources(rootDirectory);
  const next = applyLayoutEditToSources(current, commit);
  const files: string[] = [];
  const keys = Object.keys(LAYOUT_EDITOR_SOURCE_FILES) as Array<keyof LayoutSourceFiles>;
  for (const key of keys) {
    if (next[key] !== current[key]) {
      files.push(path.join(rootDirectory, LAYOUT_EDITOR_SOURCE_FILES[key]));
    }
  }
  const id = commit.duplicateFrom && !commit.remove
    ? resolveDuplicateCommit(current, commit).id
    : commit.id;
  return { next, files, id };
}

export function commitLayoutEdit(
  rootDirectory: string,
  commit: LayoutEditCommit,
  beforeWrite?: (files: readonly string[]) => void
): { files: string[]; id: string } {
  const planned = planLayoutEdit(rootDirectory, commit);
  beforeWrite?.(planned.files);
  writeLayoutSources(rootDirectory, planned.next);
  return { files: planned.files, id: planned.id };
}
