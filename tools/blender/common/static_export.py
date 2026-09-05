"""Narrow post-export restoration for catalog-declared static materials.

Blender's glTF exporter always writes explicit sampler filters for imported image
nodes, even when the immutable source intentionally omitted its sampler. This
module restores texture-info and sampler JSON for catalog-declared
``texturePolicy: preserve`` regions. It also writes explicit solid emissive
factor/strength values because glTF emission cannot be driven by COLOR_0.
Image and geometry buffer bytes remain unchanged and the independent decoded
source comparator verifies the result.
"""

from __future__ import annotations

from copy import deepcopy
import hashlib
import json
from pathlib import Path
import struct


PROJECT_ROOT = Path(__file__).resolve().parents[3]
JSON_CHUNK = 0x4E4F534A


def _sha256(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def _read_glb(path: Path) -> tuple[dict, list[tuple[int, bytes]]]:
    data = path.read_bytes()
    if data[:4] != b"glTF" or len(data) < 20 or struct.unpack_from("<I", data, 4)[0] != 2:
        raise ValueError(f"Expected an embedded GLB 2.0 file: {path}")
    chunks = []
    document = None
    offset = 12
    while offset < len(data):
        size, kind = struct.unpack_from("<II", data, offset)
        end = offset + 8 + size
        if end > len(data):
            raise ValueError(f"Invalid GLB chunk length in {path}")
        payload = bytes(data[offset + 8:end])
        chunks.append((kind, payload))
        if kind == JSON_CHUNK:
            if document is not None:
                raise ValueError(f"GLB has more than one JSON chunk: {path}")
            document = json.loads(payload)
        offset = end
    if offset != len(data) or document is None:
        raise ValueError(f"GLB is missing its JSON document: {path}")
    return document, chunks


def _write_glb(path: Path, document: dict, chunks: list[tuple[int, bytes]]) -> None:
    compact = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    compact += b" " * ((-len(compact)) % 4)
    output_chunks = []
    replaced = False
    for kind, payload in chunks:
        if kind == JSON_CHUNK:
            payload = compact
            replaced = True
        output_chunks.append(struct.pack("<II", len(payload), kind) + payload)
    if not replaced:
        raise ValueError("GLB is missing its JSON chunk")
    body = b"".join(output_chunks)
    path.write_bytes(b"glTF" + struct.pack("<II", 2, 12 + len(body)) + body)


def _material_by_name(document: dict, name: str) -> dict:
    matches = [material for material in document.get("materials", []) if material.get("name") == name]
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one material region {name!r}; found {len(matches)}")
    return matches[0]


def _texture_info(material: dict, role: str) -> dict | None:
    if role == "baseColor":
        return material.get("pbrMetallicRoughness", {}).get("baseColorTexture")
    if role == "normal":
        return material.get("normalTexture")
    raise ValueError(f"Unknown texture role {role}")


def _restore_info_and_sampler(
    source_document: dict,
    candidate_document: dict,
    source_info: dict,
    candidate_info: dict,
) -> dict | None:
    source_texture = source_document.get("textures", [])[source_info["index"]]
    candidate_texture = candidate_document.get("textures", [])[candidate_info["index"]]
    candidate_index = candidate_info["index"]
    candidate_info.clear()
    candidate_info.update({"index": candidate_index})
    candidate_info.update({key: deepcopy(value) for key, value in source_info.items() if key != "index"})
    if "sampler" not in source_texture:
        candidate_texture.pop("sampler", None)
        return None
    source_sampler = source_document.get("samplers", [])[source_texture["sampler"]]
    return deepcopy(source_sampler)


def _rebuild_samplers(document: dict, requested: dict[int, dict | None]) -> None:
    textures = document.get("textures", [])
    existing = document.get("samplers", [])
    for index, texture in enumerate(textures):
        if index in requested:
            continue
        requested[index] = deepcopy(existing[texture["sampler"]]) if "sampler" in texture else None
    sampler_indices: dict[str, int] = {}
    samplers = []
    for index, texture in enumerate(textures):
        state = requested[index]
        if state is None:
            texture.pop("sampler", None)
            continue
        key = json.dumps(state, sort_keys=True, separators=(",", ":"))
        if key not in sampler_indices:
            sampler_indices[key] = len(samplers)
            samplers.append(state)
        texture["sampler"] = sampler_indices[key]
    if samplers:
        document["samplers"] = samplers
    else:
        document.pop("samplers", None)


def _linear_rgb(hex_value: str) -> list[float]:
    value = hex_value.removeprefix("#")
    if len(value) != 6:
        raise ValueError(f"Expected a six-digit palette color, received {hex_value!r}")
    channels = [int(value[index:index + 2], 16) / 255 for index in (0, 2, 4)]
    return [channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4 for channel in channels]


def restore_static_material_state(path, spec, palette) -> dict | None:
    """Restore declared source sampler and solid-emission JSON without touching BIN."""
    authoring = spec.get("staticAuthoring")
    if not authoring:
        return None
    regions = [
        name for name, mapping in authoring["materialMap"].items()
        if mapping["texturePolicy"] == "preserve"
    ]
    candidate_path = Path(path)
    candidate_document, candidate_chunks = _read_glb(candidate_path)
    non_json_before = hashlib.sha256(b"".join(
        struct.pack("<I", kind) + payload for kind, payload in candidate_chunks if kind != JSON_CHUNK
    )).hexdigest()
    requested_samplers: dict[int, dict | None] = {}
    slots = []
    source_document = None
    if regions:
        source_path = (PROJECT_ROOT / authoring["sourceFile"]).resolve(strict=True)
        if not source_path.is_relative_to(PROJECT_ROOT) or _sha256(source_path) != authoring["sourceSha256"]:
            raise ValueError(f"{spec['id']}: immutable static texture source differs from the catalog")
        source_document, _ = _read_glb(source_path)
    for region in regions:
        source_material = _material_by_name(source_document, region)
        candidate_material = _material_by_name(candidate_document, region)
        extras = candidate_material.get("extras", {})
        if extras.get("neva_source_material") != region:
            raise ValueError(f"{spec['id']}: {region} lost its source material metadata")
        for role in ("baseColor", "normal"):
            source_info = _texture_info(source_material, role)
            candidate_info = _texture_info(candidate_material, role)
            if (source_info is None) != (candidate_info is None):
                raise ValueError(f"{spec['id']}: {region} {role} texture slot differs from the source")
            if source_info is None:
                continue
            sampler = _restore_info_and_sampler(
                source_document,
                candidate_document,
                source_info,
                candidate_info,
            )
            requested_samplers[candidate_info["index"]] = sampler
            slots.append({
                "region": region,
                "role": role,
                "sampler": "source-default" if sampler is None else sampler,
            })
    _rebuild_samplers(candidate_document, requested_samplers)
    emissive_regions = []
    for region, mapping in authoring["materialMap"].items():
        if mapping["texturePolicy"] != "none":
            continue
        token = mapping["token"]
        material_spec = palette[token]
        strength = material_spec.get("emissiveStrength", 0)
        if strength <= 0:
            continue
        candidate_material = _material_by_name(candidate_document, region)
        expected = [channel * mapping["value"] for channel in _linear_rgb(material_spec["hex"])]
        candidate_material["emissiveFactor"] = expected
        if strength == 1:
            extension = candidate_material.get("extensions", {})
            extension.pop("KHR_materials_emissive_strength", None)
            if not extension:
                candidate_material.pop("extensions", None)
        else:
            candidate_material.setdefault("extensions", {})["KHR_materials_emissive_strength"] = {
                "emissiveStrength": strength,
            }
            used = candidate_document.setdefault("extensionsUsed", [])
            if "KHR_materials_emissive_strength" not in used:
                used.append("KHR_materials_emissive_strength")
                used.sort()
        emissive_regions.append({"region": region, "token": token, "factor": expected, "strength": strength})
    _write_glb(candidate_path, candidate_document, candidate_chunks)
    _, after_chunks = _read_glb(candidate_path)
    non_json_after = hashlib.sha256(b"".join(
        struct.pack("<I", kind) + payload for kind, payload in after_chunks if kind != JSON_CHUNK
    )).hexdigest()
    if non_json_before != non_json_after:
        raise ValueError(f"{spec['id']}: static material restoration changed embedded image or geometry bytes")
    return {
        "regions": sorted(regions),
        "slots": slots,
        "emissiveRegions": emissive_regions,
        "nonJsonChunksUnchanged": True,
        "nonJsonChunksSha256": non_json_after,
    }
