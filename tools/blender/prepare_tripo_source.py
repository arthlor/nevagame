"""Prepare an explicitly requested Tripo download as an immutable Neva source capture.

Tripo writes accessor ``min``/``max`` values rounded to zero (for example a UV
minimum of 0 when the data starts at 0.0013), which Khronos validation reports
as ``ACCESSOR_MIN_MISMATCH`` errors. This helper recomputes the declared bounds
of every accessor that already declares them from its own buffer data, drops
the provider's specular/volume material extensions, and rewrites only the GLB
JSON chunk. Geometry, skin and image bytes are copied
unchanged, and the report records both digests plus every repaired pointer so
the capture stays traceable to the provider download.

Run with plain Python (no Blender):

    python3 tools/blender/prepare_tripo_source.py <download.glb> <capture.glb> [--report <report.json>]
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import struct

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942
COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}
FORMATS = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
# Tripo tags every material with specular/volume extensions. Neva's palette owns
# roughness, metalness and specular response, and the static source contract
# rejects provider material extensions, so the capture drops them.
PROVIDER_MATERIAL_EXTENSIONS = ("KHR_materials_specular", "KHR_materials_volume")


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _chunks(data: bytes) -> list[tuple[int, bytes]]:
    if data[:4] != b"glTF" or struct.unpack_from("<I", data, 4)[0] != 2:
        raise ValueError("Expected a GLB 2.0 file")
    chunks, offset = [], 12
    while offset < len(data):
        size, kind = struct.unpack_from("<II", data, offset)
        chunks.append((kind, data[offset + 8:offset + 8 + size]))
        offset += 8 + size
    if offset != len(data):
        raise ValueError("GLB chunk lengths do not cover the file")
    return chunks


def _accessor_values(document: dict, binary: bytes, accessor: dict) -> list[list[float]]:
    if "sparse" in accessor or "bufferView" not in accessor:
        raise ValueError("Sparse or bufferless accessors are not expected in a Tripo download")
    view = document["bufferViews"][accessor["bufferView"]]
    if view.get("buffer", 0) != 0:
        raise ValueError("Only the embedded GLB buffer is supported")
    width = COMPONENTS[accessor["type"]]
    code = FORMATS[accessor["componentType"]]
    item = struct.calcsize("<" + code)
    stride = view.get("byteStride") or item * width
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    rows = []
    for index in range(accessor["count"]):
        rows.append(list(struct.unpack_from(f"<{width}{code}", binary, start + index * stride)))
    return rows


def _as_json_number(value: float, integer: bool):
    if integer:
        return int(value)
    # Round-trip the float32 value exactly so the validator's own reading matches.
    return struct.unpack("<f", struct.pack("<f", value))[0]


def prepare(download: Path, capture: Path) -> dict:
    data = download.read_bytes()
    chunks = _chunks(data)
    document = json.loads(next(payload for kind, payload in chunks if kind == JSON_CHUNK))
    binary = next(payload for kind, payload in chunks if kind == BIN_CHUNK)
    repaired = []
    for index, accessor in enumerate(document.get("accessors", [])):
        if "min" not in accessor and "max" not in accessor:
            continue
        rows = _accessor_values(document, binary, accessor)
        if not rows:
            continue
        integer = accessor["componentType"] != 5126
        for bound, pick in (("min", min), ("max", max)):
            if bound not in accessor:
                continue
            actual = [_as_json_number(pick(row[column] for row in rows), integer) for column in range(len(rows[0]))]
            for column, (declared, value) in enumerate(zip(accessor[bound], actual)):
                if declared != value:
                    repaired.append({"pointer": f"/accessors/{index}/{bound}/{column}", "declared": declared, "actual": value})
            accessor[bound] = actual
    removed_extensions = []
    for material in document.get("materials", []):
        extensions = material.get("extensions", {})
        for name in PROVIDER_MATERIAL_EXTENSIONS:
            if name in extensions:
                removed_extensions.append({"material": material.get("name"), "extension": name, "value": extensions.pop(name)})
        if not extensions:
            material.pop("extensions", None)
    for key in ("extensionsUsed", "extensionsRequired"):
        if key in document:
            document[key] = [name for name in document[key] if name not in PROVIDER_MATERIAL_EXTENSIONS]
            if not document[key]:
                document.pop(key)
    payload = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    payload += b" " * ((-len(payload)) % 4)
    body = b""
    for kind, chunk in chunks:
        body += struct.pack("<II", len(payload) if kind == JSON_CHUNK else len(chunk), kind)
        body += payload if kind == JSON_CHUNK else chunk
    output = b"glTF" + struct.pack("<II", 2, 12 + len(body)) + body
    after = _chunks(output)
    if [chunk for kind, chunk in after if kind != JSON_CHUNK] != [chunk for kind, chunk in chunks if kind != JSON_CHUNK]:
        raise ValueError("Bounds repair must not change any non-JSON chunk")
    capture.parent.mkdir(parents=True, exist_ok=True)
    capture.write_bytes(output)
    return {
        "download": download.name,
        "downloadSha256": _sha256(data),
        "capture": str(capture),
        "captureSha256": _sha256(output),
        "binaryChunkSha256": _sha256(binary),
        "repairedBounds": repaired,
        "removedMaterialExtensions": removed_extensions,
        "policy": "json-only: accessor bounds recomputed, provider material extensions removed",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("download", type=Path)
    parser.add_argument("capture", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    report = prepare(args.download, args.capture)
    if args.report:
        existing = json.loads(args.report.read_text()) if args.report.exists() else {"sources": []}
        existing["sources"] = [entry for entry in existing["sources"] if entry["capture"] != report["capture"]]
        existing["sources"].append(report)
        existing["sources"].sort(key=lambda entry: entry["capture"])
        args.report.write_text(json.dumps(existing, indent=2) + "\n")
    print(json.dumps({key: value for key, value in report.items() if key != "repairedBounds"} | {"repairedBounds": len(report["repairedBounds"])}))


if __name__ == "__main__":
    main()
