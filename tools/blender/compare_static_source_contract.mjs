/**
 * Independent decoded-GLB fidelity gate for catalog-owned static imports.
 *
 * The preparation helper and Blender exporter are intentionally outside this
 * verifier.  It reads the immutable provider GLB again, derives the one
 * catalog-declared uniform transform, and compares that source directly with
 * the candidate's LOD0 surface.  It never edits or publishes an asset.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Matrix3, Matrix4, Vector3 } from "three";

import { createNodeIO, ensureMeshoptReady } from "./optimize.mjs";

const POSITION_TOLERANCE_METERS = 0.0001;
const NORMAL_TOLERANCE_RADIANS = Math.PI / 900; // 0.2 degrees.
const UV_TOLERANCE = 0.00002;
const COLOR_TOLERANCE = 0.00002;
const MATERIAL_SCALAR_TOLERANCE = 0.00002;
const CELL_SIZE_METERS = POSITION_TOLERANCE_METERS;

const sha256Bytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha256File = (filename) => sha256Bytes(fs.readFileSync(filename));

const maxArrayError = (left, right) => {
  if (!left || !right || left.length !== right.length) return Infinity;
  if (![...left, ...right].every(Number.isFinite)) return Infinity;
  return Math.max(0, ...left.map((value, index) => Math.abs(value - right[index])));
};

const linearChannel = (value) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

function paletteValues(paletteDocument) {
  return Object.fromEntries(
    Object.entries(paletteDocument.tokens ?? paletteDocument).map(([name, value]) => {
      if (!value?.hex) throw new Error(`Palette token ${name} has no hex value`);
      const hex = value.hex.replace(/^#/, "");
      return [name, {
        linear: [0, 2, 4].map((offset) => linearChannel(Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)),
        roughness: value.roughness,
        metalness: value.metalness,
        emissiveStrength: value.emissiveStrength ?? 0,
      }];
    }),
  );
}

function oneNode(document, name, role) {
  const matches = document.getRoot().listNodes().filter((node) => node.getName() === name);
  if (matches.length !== 1) {
    throw new Error(`${role} must contain exactly one node ${name}; found ${matches.length}`);
  }
  if (!matches[0].getMesh()) throw new Error(`${role} node ${name} has no mesh`);
  return matches[0];
}

function transformPoint(matrix, values) {
  return new Vector3().fromArray(values).applyMatrix4(matrix);
}

function transformedBounds(node, rotation) {
  const sourceWorld = new Matrix4().fromArray(node.getWorldMatrix());
  const matrix = rotation.clone().multiply(sourceWorld);
  const minimum = new Vector3(Infinity, Infinity, Infinity);
  const maximum = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const primitive of node.getMesh().listPrimitives()) {
    const position = primitive.getAttribute("POSITION");
    if (!position) throw new Error(`${node.getName()} loses POSITION`);
    for (let index = 0; index < position.getCount(); index += 1) {
      const point = transformPoint(matrix, position.getElement(index, []));
      minimum.min(point);
      maximum.max(point);
    }
  }
  return { minimum, maximum, matrix };
}

/**
 * Blender's Z-up yaw becomes the same numeric Y-up yaw after glTF export.
 * Ground-centering maps to midpoint X/Z plus minimum Y in runtime coordinates.
 */
export function declaredSourceTransform(sourceNode, authoring) {
  const yaw = authoring.yawDegrees * Math.PI / 180;
  const rotation = new Matrix4().makeRotationY(yaw);
  const { minimum, maximum, matrix: rotatedSourceWorld } = transformedBounds(sourceNode, rotation);
  const dimensions = {
    width: maximum.x - minimum.x,
    depth: maximum.z - minimum.z,
    height: maximum.y - minimum.y,
  };
  const sourceExtent = dimensions[authoring.scaleReference.axis];
  if (!Number.isFinite(sourceExtent) || sourceExtent <= 0) {
    throw new Error(`Source has no usable ${authoring.scaleReference.axis} extent`);
  }
  const uniformScale = authoring.scaleReference.meters / sourceExtent;
  const center = new Vector3(
    (minimum.x + maximum.x) * 0.5,
    minimum.y,
    (minimum.z + maximum.z) * 0.5,
  );
  const outerMatrix = new Matrix4()
    .makeScale(uniformScale, uniformScale, uniformScale)
    .multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z))
    .multiply(rotation);
  const output = outerMatrix.clone().multiply(new Matrix4().fromArray(sourceNode.getWorldMatrix()));
  return {
    matrix: output,
    outerMatrix,
    uniformScale,
    sourceDimensions: dimensions,
    outputDimensions: Object.fromEntries(
      Object.entries(dimensions).map(([axis, value]) => [axis, value * uniformScale]),
    ),
    groundCenter: center.toArray(),
    yawDegrees: authoring.yawDegrees,
  };
}

function primitiveRegion(primitive, fallback = "") {
  const material = primitive.getMaterial();
  const extras = material?.getExtras?.() ?? {};
  return extras.neva_source_material ?? material?.getName() ?? fallback;
}

function primitiveToken(primitive) {
  const material = primitive.getMaterial();
  const extras = material?.getExtras?.() ?? {};
  return extras.neva_palette_token ?? material?.getName() ?? null;
}

function corner(primitive, vertexIndex, world, normalMatrix, sourceRegion) {
  const position = primitive.getAttribute("POSITION");
  const normal = primitive.getAttribute("NORMAL");
  const uv = primitive.getAttribute("TEXCOORD_0");
  if (!position || !normal || !uv) {
    throw new Error(`${sourceRegion} loses POSITION, NORMAL, or TEXCOORD_0`);
  }
  return {
    position: transformPoint(world, position.getElement(vertexIndex, [])).toArray(),
    normal: new Vector3()
      .fromArray(normal.getElement(vertexIndex, []))
      .applyMatrix3(normalMatrix)
      .normalize()
      .toArray(),
    uv: uv.getElement(vertexIndex, []),
    color: primitive.getAttribute("COLOR_0")?.getElement(vertexIndex, []) ?? null,
  };
}

function trianglesByRegion(node, outerTransform, sourceDocument) {
  const result = new Map();
  const nodeWorld = new Matrix4().fromArray(node.getWorldMatrix());
  const world = outerTransform.clone().multiply(nodeWorld);
  const normalMatrix = new Matrix3().getNormalMatrix(world);
  for (const primitive of node.getMesh().listPrimitives()) {
    const fallback = primitive.getMaterial()?.getName() ?? "<unnamed>";
    const region = sourceDocument ? fallback : primitiveRegion(primitive, fallback);
    const indices = primitive.getIndices();
    const position = primitive.getAttribute("POSITION");
    if (!position) throw new Error(`${region} loses POSITION`);
    const count = indices?.getCount() ?? position.getCount();
    if (count % 3 !== 0) throw new Error(`${region} is not a triangle list`);
    const rows = result.get(region) ?? [];
    const cached = new Map();
    const at = (streamIndex) => {
      const vertexIndex = indices?.getScalar(streamIndex) ?? streamIndex;
      if (!cached.has(vertexIndex)) {
        cached.set(vertexIndex, corner(primitive, vertexIndex, world, normalMatrix, region));
      }
      return cached.get(vertexIndex);
    };
    for (let index = 0; index < count; index += 3) {
      rows.push([at(index), at(index + 1), at(index + 2)]);
    }
    result.set(region, rows);
  }
  return result;
}

const cell = (position) => position.map((value) => Math.floor(value / CELL_SIZE_METERS));
const cellKey = (coordinates) => coordinates.join(",");

/** Match oriented triangles while allowing exporter reindexing and cyclic starts. */
export function compareRegionTriangles(sourceTriangles, candidateTriangles) {
  const buckets = new Map();
  candidateTriangles.forEach((triangle, index) => {
    triangle.forEach((value, cornerIndex) => {
      const key = cellKey(cell(value.position));
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ index, cornerIndex });
    });
  });
  const used = new Set();
  const errors = {
    positionMeters: 0,
    normalRadians: 0,
    uv: 0,
    color: 0,
    missingTriangles: 0,
  };
  for (const source of sourceTriangles) {
    const origin = cell(source[0].position);
    const possible = [];
    for (let x = -1; x <= 1; x += 1) {
      for (let y = -1; y <= 1; y += 1) {
        for (let z = -1; z <= 1; z += 1) {
          possible.push(...(buckets.get(cellKey([origin[0] + x, origin[1] + y, origin[2] + z])) ?? []));
        }
      }
    }
    let best = null;
    for (const match of possible) {
      if (used.has(match.index)) continue;
      const candidate = candidateTriangles[match.index];
      const positionError = Math.max(...source.map((value, index) =>
        maxArrayError(value.position, candidate[(match.cornerIndex + index) % 3].position)));
      if (positionError > POSITION_TOLERANCE_METERS) continue;
      const normalError = Math.max(...source.map((value, index) =>
        new Vector3().fromArray(value.normal).angleTo(
          new Vector3().fromArray(candidate[(match.cornerIndex + index) % 3].normal),
        )));
      const uvError = Math.max(...source.map((value, index) =>
        maxArrayError(value.uv, candidate[(match.cornerIndex + index) % 3].uv)));
      if (!best || positionError + normalError + uvError < best.score) {
        best = {
          ...match,
          positionError,
          normalError,
          uvError,
          score: positionError + normalError + uvError,
        };
      }
    }
    if (!best) {
      errors.missingTriangles += 1;
      continue;
    }
    used.add(best.index);
    errors.positionMeters = Math.max(errors.positionMeters, best.positionError);
    errors.normalRadians = Math.max(errors.normalRadians, best.normalError);
    errors.uv = Math.max(errors.uv, best.uvError);
  }
  const passed = sourceTriangles.length === candidateTriangles.length
    && errors.missingTriangles === 0
    && errors.positionMeters <= POSITION_TOLERANCE_METERS
    && errors.normalRadians <= NORMAL_TOLERANCE_RADIANS
    && errors.uv <= UV_TOLERANCE;
  return {
    sourceTriangles: sourceTriangles.length,
    candidateTriangles: candidateTriangles.length,
    matchedTriangles: used.size,
    ...errors,
    passed,
  };
}

function textureState(material, role) {
  const accessors = {
    baseColor: ["getBaseColorTexture", "getBaseColorTextureInfo"],
    normal: ["getNormalTexture", "getNormalTextureInfo"],
    metallicRoughness: ["getMetallicRoughnessTexture", "getMetallicRoughnessTextureInfo"],
    occlusion: ["getOcclusionTexture", "getOcclusionTextureInfo"],
    emissive: ["getEmissiveTexture", "getEmissiveTextureInfo"],
  };
  const methods = accessors[role];
  if (!methods) throw new Error(`Unknown material texture role ${role}`);
  const texture = material[methods[0]]();
  const info = material[methods[1]]();
  if (!texture) return null;
  const image = texture.getImage();
  if (!image) throw new Error(`${material.getName()} ${role} texture has no embedded image`);
  const transform = info?.getExtension?.("KHR_texture_transform") ?? null;
  return {
    imageSha256: sha256Bytes(image),
    mimeType: texture.getMimeType(),
    texCoord: info?.getTexCoord?.() ?? 0,
    wrapS: info?.getWrapS?.() ?? 10497,
    wrapT: info?.getWrapT?.() ?? 10497,
    minFilter: info?.getMinFilter?.() ?? null,
    magFilter: info?.getMagFilter?.() ?? null,
    scale: role === "normal" ? material.getNormalScale() : null,
    strength: role === "occlusion" ? material.getOcclusionStrength() : null,
    transform: transform ? {
      offset: transform.getOffset(),
      rotation: transform.getRotation(),
      scale: transform.getScale(),
      texCoord: transform.getTexCoord(),
    } : null,
  };
}

function materialByRegion(node, sourceDocument) {
  const result = new Map();
  for (const primitive of node.getMesh().listPrimitives()) {
    const material = primitive.getMaterial();
    if (!material) throw new Error(`${node.getName()} contains an unmaterialed primitive`);
    const region = sourceDocument ? material.getName() : primitiveRegion(primitive);
    if (result.has(region) && result.get(region) !== material) {
      throw new Error(`${node.getName()} duplicates material identity ${region}`);
    }
    result.set(region, material);
  }
  return result;
}

function compareMaterialRegion(source, candidate, region, mapping, palette) {
  const issues = [];
  const extras = candidate.getExtras?.() ?? {};
  const token = primitiveToken({ getMaterial: () => candidate });
  const paletteEntry = palette[token];
  if (candidate.getName() !== region) issues.push(`candidate name is ${candidate.getName()}`);
  if (extras.neva_source_material !== region) issues.push("source-region metadata differs");
  if (token !== mapping.token) issues.push(`palette token is ${String(token)}`);
  if (!paletteEntry) issues.push(`unknown palette token ${String(token)}`);

  const baseFactor = candidate.getBaseColorFactor();
  const expectedFactor = mapping.texturePolicy === "preserve"
    ? [mapping.value, mapping.value, mapping.value, 1]
    : [1, 1, 1, 1];
  const factorError = maxArrayError(baseFactor, expectedFactor);
  if (factorError > MATERIAL_SCALAR_TOLERANCE) issues.push(`base factor error ${factorError}`);
  if (paletteEntry) {
    if (Math.abs(candidate.getRoughnessFactor() - paletteEntry.roughness) > MATERIAL_SCALAR_TOLERANCE) {
      issues.push("roughness differs from palette token");
    }
    if (Math.abs(candidate.getMetallicFactor() - paletteEntry.metalness) > MATERIAL_SCALAR_TOLERANCE) {
      issues.push("metalness differs from palette token");
    }
  }

  const emissiveExtension = candidate.getExtension("KHR_materials_emissive_strength");
  const emissiveStrength = emissiveExtension?.getEmissiveStrength?.() ?? 1;
  const expectedEmissive = paletteEntry?.emissiveStrength > 0
    ? paletteEntry.linear.map((value) => value * mapping.value)
    : [0, 0, 0];
  const emissiveFactorError = maxArrayError(candidate.getEmissiveFactor(), expectedEmissive);
  if (emissiveFactorError > MATERIAL_SCALAR_TOLERANCE) {
    issues.push(`emissive factor error ${emissiveFactorError}`);
  }
  if (paletteEntry?.emissiveStrength > 0) {
    if (Math.abs(emissiveStrength - paletteEntry.emissiveStrength) > MATERIAL_SCALAR_TOLERANCE) {
      issues.push("emissive strength differs from palette token");
    }
  } else if (emissiveExtension) {
    issues.push("non-emissive region exports emissive-strength metadata");
  }

  const sourceExtensionNames = source.listExtensions().map((extension) => extension.extensionName).sort();
  const candidateExtensionNames = candidate.listExtensions().map((extension) => extension.extensionName).sort();
  const allowedExtensionNames = paletteEntry?.emissiveStrength > 0
    && Math.abs(paletteEntry.emissiveStrength - 1) > MATERIAL_SCALAR_TOLERANCE
    ? ["KHR_materials_emissive_strength"]
    : [];
  const unsupportedSourceExtensions = sourceExtensionNames.filter(
    (name) => !allowedExtensionNames.includes(name),
  );
  if (unsupportedSourceExtensions.length) {
    issues.push(`immutable source uses unsupported material extensions: ${unsupportedSourceExtensions.join(", ")}`);
  }
  if (JSON.stringify(candidateExtensionNames) !== JSON.stringify(allowedExtensionNames)) {
    issues.push(
      `material extensions differ: expected [${allowedExtensionNames.join(", ")}], `
      + `found [${candidateExtensionNames.join(", ")}]`,
    );
  }

  const textureRoles = ["baseColor", "normal", "metallicRoughness", "occlusion", "emissive"];
  const sourceTextures = Object.fromEntries(textureRoles.map((role) => [role, textureState(source, role)]));
  const candidateTextures = Object.fromEntries(textureRoles.map((role) => [role, textureState(candidate, role)]));
  if (mapping.texturePolicy === "none") {
    const unexpectedRoles = textureRoles.filter((role) => candidateTextures[role]);
    if (unexpectedRoles.length) {
      issues.push(`solid region unexpectedly contains textures: ${unexpectedRoles.join(", ")}`);
    }
    if (candidate.getAlphaMode() !== "OPAQUE") issues.push("solid region is not opaque");
    if (Math.abs(candidate.getAlphaCutoff() - 0.5) > MATERIAL_SCALAR_TOLERANCE) {
      issues.push("solid region has a non-default alpha cutoff");
    }
    if (candidate.getDoubleSided()) issues.push("solid region is double-sided");
  } else {
    for (const role of textureRoles) {
      if (JSON.stringify(sourceTextures[role]) !== JSON.stringify(candidateTextures[role])) {
        issues.push(`${role} texture state differs`);
      }
    }
    if (candidate.getAlphaMode() !== source.getAlphaMode()) issues.push("alpha mode differs");
    if (Math.abs(candidate.getAlphaCutoff() - source.getAlphaCutoff()) > MATERIAL_SCALAR_TOLERANCE) {
      issues.push("alpha cutoff differs");
    }
    if (candidate.getDoubleSided() !== source.getDoubleSided()) issues.push("double-sided state differs");
  }
  return {
    region,
    token,
    texturePolicy: mapping.texturePolicy,
    factorError,
    sourceTextures,
    candidateTextures,
    alphaMode: candidate.getAlphaMode(),
    doubleSided: candidate.getDoubleSided(),
    emissiveFactor: candidate.getEmissiveFactor(),
    emissiveStrength,
    emissiveFactorError,
    sourceExtensionNames,
    candidateExtensionNames,
    allowedExtensionNames,
    issues,
    passed: issues.length === 0,
  };
}

function validateSolidColors(candidateNode, materialMap, palette) {
  const rows = [];
  for (const primitive of candidateNode.getMesh().listPrimitives()) {
    const region = primitiveRegion(primitive);
    const mapping = materialMap[region];
    if (!mapping || mapping.texturePolicy !== "none") continue;
    const color = primitive.getAttribute("COLOR_0");
    const expected = palette[mapping.token].linear.map((value) => value * mapping.value);
    let maximumError = 0;
    if (!color) maximumError = Infinity;
    else {
      for (let index = 0; index < color.getCount(); index += 1) {
        const actual = color.getElement(index, []);
        maximumError = Math.max(maximumError, maxArrayError(actual.slice(0, 3), expected));
        if (actual.length === 4) maximumError = Math.max(maximumError, Math.abs(actual[3] - 1));
      }
    }
    rows.push({ region, vertices: color?.getCount() ?? 0, maximumError, passed: maximumError <= COLOR_TOLERANCE });
  }
  return rows;
}

function validateTexturedColorAbsence(candidateNode, materialMap) {
  const rows = [];
  for (const primitive of candidateNode.getMesh().listPrimitives()) {
    const region = primitiveRegion(primitive);
    const mapping = materialMap[region];
    if (!mapping || mapping.texturePolicy !== "preserve") continue;
    const present = Boolean(primitive.getAttribute("COLOR_0"));
    rows.push({ region, colorAttributePresent: present, passed: !present });
  }
  return rows;
}

function validateRenderedNode(node, sourceMaterials, materialMap, palette, options = {}) {
  const issues = [];
  const materialRows = [];
  const attributeRows = [];
  const seenRegions = new Set();
  for (const primitive of node.getMesh().listPrimitives()) {
    const region = primitiveRegion(primitive);
    const mapping = materialMap[region];
    const position = primitive.getAttribute("POSITION");
    const normal = primitive.getAttribute("NORMAL");
    const uv = primitive.getAttribute("TEXCOORD_0");
    const color = primitive.getAttribute("COLOR_0");
    const attributeIssues = [];
    if (!mapping) {
      attributeIssues.push("material region is not catalog-mapped");
    } else {
      const requireSourceUv = options.sourceSurface || mapping.texturePolicy === "preserve";
      if (!position) attributeIssues.push("POSITION is missing");
      if (!normal) attributeIssues.push("NORMAL is missing");
      if (requireSourceUv && !uv) attributeIssues.push("TEXCOORD_0 is missing");
      if (mapping.texturePolicy === "preserve" && color) {
        attributeIssues.push("textured region contains COLOR_0");
      }
      if (mapping.texturePolicy === "none" && !color) {
        attributeIssues.push("solid region is missing COLOR_0");
      }
    }
    const attributeRow = {
      node: node.getName(),
      region,
      hasPosition: Boolean(position),
      hasNormal: Boolean(normal),
      hasUv0: Boolean(uv),
      hasColor0: Boolean(color),
      issues: attributeIssues,
      passed: attributeIssues.length === 0,
    };
    attributeRows.push(attributeRow);
    if (!attributeRow.passed) {
      issues.push(`${node.getName()} ${region}: ${attributeIssues.join(", ")}`);
    }
    if (!mapping || seenRegions.has(region)) continue;
    seenRegions.add(region);
    const sourceMaterial = sourceMaterials.get(region);
    const candidateMaterial = primitive.getMaterial();
    if (!sourceMaterial || !candidateMaterial) {
      issues.push(`${node.getName()} ${region}: source or candidate material is missing`);
      continue;
    }
    const row = compareMaterialRegion(sourceMaterial, candidateMaterial, region, mapping, palette);
    materialRows.push({ node: node.getName(), ...row });
    if (!row.passed) {
      issues.push(`${node.getName()} material ${region}: ${row.issues.join(", ")}`);
    }
  }
  const solidColors = validateSolidColors(node, materialMap, palette);
  for (const row of solidColors) {
    if (!row.passed) issues.push(`${node.getName()} solid COLOR_0 differs in ${row.region}`);
  }
  const texturedColors = validateTexturedColorAbsence(node, materialMap);
  for (const row of texturedColors) {
    if (!row.passed) issues.push(`${node.getName()} textured region ${row.region} contains COLOR_0`);
  }
  return {
    node: node.getName(),
    sourceSurface: Boolean(options.sourceSurface),
    attributes: attributeRows,
    materials: materialRows,
    solidColors,
    texturedColors,
    issues,
    passed: issues.length === 0,
  };
}

function lodRenderedNodes(candidate, spec, levelIndex) {
  const lodName = spec.lodLevels?.[levelIndex]?.node;
  const matches = candidate.getRoot().listNodes().filter((node) => node.getName() === lodName);
  if (matches.length !== 1) throw new Error(`Candidate must contain exactly one ${lodName}`);
  const nodes = [];
  matches[0].traverse((node) => {
    if (node.getMesh()) nodes.push(node);
  });
  return nodes.sort((left, right) => left.getName().localeCompare(right.getName()));
}

function lod0MeshNames(candidate, spec) {
  const lodName = spec.lodLevels?.[0]?.node;
  const matches = candidate.getRoot().listNodes().filter((node) => node.getName() === lodName);
  if (matches.length !== 1) throw new Error(`Candidate must contain exactly one ${lodName}`);
  const meshNames = [];
  matches[0].traverse((node) => {
    if (node.getMesh()) meshNames.push(node.getName());
  });
  return meshNames.sort();
}

export function compareStaticDocuments(source, candidate, spec, palette) {
  const issues = [];
  const sourceNode = oneNode(source, spec.staticAuthoring.sourceNode, "Source");
  const candidateNode = oneNode(candidate, `${spec.id}_LOD0_surface`, "Candidate");
  const declared = declaredSourceTransform(sourceNode, spec.staticAuthoring);
  const sourceRegions = trianglesByRegion(sourceNode, declared.outerMatrix, true);
  const candidateRegions = trianglesByRegion(candidateNode, new Matrix4(), false);
  const expectedRegions = new Set(Object.keys(spec.staticAuthoring.materialMap));
  const sourceRegionNames = new Set(sourceRegions.keys());
  const candidateRegionNames = new Set(candidateRegions.keys());
  for (const region of expectedRegions) {
    if (!sourceRegionNames.has(region)) issues.push(`Immutable source region missing: ${region}`);
    if (!candidateRegionNames.has(region)) issues.push(`Candidate source region missing: ${region}`);
  }
  for (const region of sourceRegionNames) {
    if (!expectedRegions.has(region)) issues.push(`Unmapped immutable source region: ${region}`);
  }
  for (const region of candidateRegionNames) {
    if (!expectedRegions.has(region)) issues.push(`Unexpected candidate source region: ${region}`);
  }

  const surfaces = [];
  for (const region of [...expectedRegions].sort()) {
    if (!sourceRegions.has(region) || !candidateRegions.has(region)) continue;
    const row = compareRegionTriangles(sourceRegions.get(region), candidateRegions.get(region));
    surfaces.push({ region, ...row });
    if (!row.passed) issues.push(`Source surface differs in ${region}`);
  }

  const sourceMaterials = materialByRegion(sourceNode, true);
  const candidateMaterials = materialByRegion(candidateNode, false);
  const materials = [];
  for (const region of [...expectedRegions].sort()) {
    const sourceMaterial = sourceMaterials.get(region);
    const candidateMaterial = candidateMaterials.get(region);
    if (!sourceMaterial || !candidateMaterial) continue;
    const row = compareMaterialRegion(
      sourceMaterial,
      candidateMaterial,
      region,
      spec.staticAuthoring.materialMap[region],
      palette,
    );
    materials.push(row);
    if (!row.passed) issues.push(`Material contract differs in ${region}: ${row.issues.join(", ")}`);
  }

  const solidColors = validateSolidColors(candidateNode, spec.staticAuthoring.materialMap, palette);
  for (const row of solidColors) {
    if (!row.passed) issues.push(`Solid COLOR_0 differs in ${row.region}`);
  }
  const texturedColors = validateTexturedColorAbsence(candidateNode, spec.staticAuthoring.materialMap);
  for (const row of texturedColors) {
    if (!row.passed) issues.push(`Textured region ${row.region} incorrectly contains COLOR_0`);
  }

  const lodMeshes = lod0MeshNames(candidate, spec);
  const allowed = new Set([
    `${spec.id}_LOD0_surface`,
    ...(spec.staticAuthoring.addedGeometryNodes ?? []).filter((name) => name.includes("LOD0")),
  ]);
  const unexpectedMeshes = lodMeshes.filter((name) => !allowed.has(name));
  const missingMeshes = [...allowed].filter((name) => !lodMeshes.includes(name));
  if (unexpectedMeshes.length) issues.push(`Unexpected LOD0 meshes: ${unexpectedMeshes.join(", ")}`);
  if (missingMeshes.length) issues.push(`Missing declared LOD0 meshes: ${missingMeshes.join(", ")}`);

  const renderedLods = [];
  for (let levelIndex = 0; levelIndex < spec.lodLevels.length; levelIndex += 1) {
    const sourceSurfaceName = `${spec.id}_LOD${levelIndex}_surface`;
    const nodes = lodRenderedNodes(candidate, spec, levelIndex);
    const declaredAdded = new Set(
      (spec.staticAuthoring.addedGeometryNodes ?? [])
        .filter((name) => name.includes(`LOD${levelIndex}`)),
    );
    const allowedNames = new Set([sourceSurfaceName, ...declaredAdded]);
    const actualNames = new Set(nodes.map((node) => node.getName()));
    for (const name of allowedNames) {
      if (!actualNames.has(name)) issues.push(`Missing declared LOD${levelIndex} mesh: ${name}`);
    }
    for (const name of actualNames) {
      if (!allowedNames.has(name)) issues.push(`Unexpected LOD${levelIndex} mesh: ${name}`);
    }
    const nodeReports = [];
    for (const node of nodes) {
      const row = validateRenderedNode(
        node,
        sourceMaterials,
        spec.staticAuthoring.materialMap,
        palette,
        { sourceSurface: node.getName() === sourceSurfaceName },
      );
      nodeReports.push(row);
      for (const issue of row.issues) issues.push(`LOD${levelIndex}: ${issue}`);
    }
    renderedLods.push({
      levelIndex,
      node: spec.lodLevels[levelIndex].node,
      meshNames: [...actualNames].sort(),
      nodes: nodeReports,
      passed: nodeReports.every((row) => row.passed)
        && [...allowedNames].every((name) => actualNames.has(name))
        && [...actualNames].every((name) => allowedNames.has(name)),
    });
  }

  const expectedDimensions = [
    spec.dimensions.width,
    spec.dimensions.depth,
    spec.dimensions.height,
  ];
  const outputDimensions = [
    declared.outputDimensions.width,
    declared.outputDimensions.depth,
    declared.outputDimensions.height,
  ];
  const dimensionError = maxArrayError(expectedDimensions, outputDimensions);
  if (dimensionError > POSITION_TOLERANCE_METERS) {
    issues.push(`Catalog dimensions differ from declared uniform source transform by ${dimensionError} m`);
  }

  return {
    assetId: spec.id,
    passed: issues.length === 0,
    issues,
    tolerances: {
      positionMeters: POSITION_TOLERANCE_METERS,
      normalRadians: NORMAL_TOLERANCE_RADIANS,
      normalDegrees: NORMAL_TOLERANCE_RADIANS * 180 / Math.PI,
      uv: UV_TOLERANCE,
      color: COLOR_TOLERANCE,
    },
    transform: {
      uniformScale: declared.uniformScale,
      yawDegrees: declared.yawDegrees,
      sourceDimensions: declared.sourceDimensions,
      outputDimensions: declared.outputDimensions,
      groundCenter: declared.groundCenter,
      matrix: declared.matrix.toArray(),
      catalogDimensionMaxErrorMeters: dimensionError,
    },
    lod0Meshes: lodMeshes,
    sourceRegionCount: sourceRegionNames.size,
    candidateRegionCount: candidateRegionNames.size,
    surfaces,
    materials,
    solidColors,
    texturedColors,
    renderedLods,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const value = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const assetId = value("--asset");
  const candidatePath = value("--candidate");
  const reportPath = value("--report");
  if (!assetId || !candidatePath || !reportPath) {
    throw new Error(
      "Usage: node tools/blender/compare_static_source_contract.mjs "
      + "--asset ID --candidate model.glb --report report.json",
    );
  }
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const catalog = JSON.parse(fs.readFileSync(path.join(repo, "assets/specs/asset-catalog.json"), "utf8"));
  const spec = catalog.assets.find((asset) => asset.id === assetId);
  if (!spec?.staticAuthoring) throw new Error(`No immutable static source contract for ${assetId}`);
  const sourcePath = path.resolve(repo, spec.staticAuthoring.sourceFile);
  const resolvedCandidate = path.resolve(candidatePath);
  if (!fs.existsSync(sourcePath)) throw new Error(`Immutable source is missing: ${sourcePath}`);
  if (!fs.existsSync(resolvedCandidate)) throw new Error(`Candidate is missing: ${resolvedCandidate}`);

  await ensureMeshoptReady();
  const io = createNodeIO();
  const [source, candidate] = await Promise.all([
    io.read(sourcePath),
    io.read(resolvedCandidate),
  ]);
  const palette = paletteValues(
    JSON.parse(fs.readFileSync(path.join(repo, "art/palettes/neva.palette.json"), "utf8")),
  );
  const report = compareStaticDocuments(source, candidate, spec, palette);
  report.inputs = {
    sourceFile: spec.staticAuthoring.sourceFile,
    sourceSha256: sha256File(sourcePath),
    declaredSourceSha256: spec.staticAuthoring.sourceSha256,
    candidateFile: resolvedCandidate,
    candidateSha256: sha256File(resolvedCandidate),
  };
  if (report.inputs.sourceSha256 !== report.inputs.declaredSourceSha256) {
    report.issues.push("Immutable source hash differs from catalog");
    report.passed = false;
  }
  fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
  fs.writeFileSync(path.resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    assetId,
    passed: report.passed,
    issues: report.issues,
    uniformScale: report.transform.uniformScale,
    outputDimensions: report.transform.outputDimensions,
    surfaces: report.surfaces.map((row) => ({
      region: row.region,
      passed: row.passed,
      sourceTriangles: row.sourceTriangles,
      candidateTriangles: row.candidateTriangles,
      positionMeters: row.positionMeters,
      normalDegrees: row.normalRadians * 180 / Math.PI,
      uv: row.uv,
      missingTriangles: row.missingTriangles,
    })),
  }, null, 2));
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
