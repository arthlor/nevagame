"""Regression for Blender 5.2 multi-material COLOR_0 export."""

from __future__ import annotations

import json
from pathlib import Path
import struct
import sys
import tempfile

import bpy

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "tools" / "blender"))

from common.materials import MATERIAL_SPECS, get_or_create_material
from common.pipeline import (
    _prepare_imported_vertex_color_export,
    _validate_vertex_color_contract,
    clean_scene,
)
from common.static_export import restore_static_material_state
from adapt_polypizza_static import _configure_solid_source_emission


def _glb(path: Path):
    data = path.read_bytes()
    document = binary = None
    offset = 12
    while offset < len(data):
        size, kind = struct.unpack_from("<II", data, offset)
        payload = data[offset + 8:offset + 8 + size]
        if kind == 0x4E4F534A:
            document = json.loads(payload)
        elif kind == 0x004E4942:
            binary = payload
        offset += 8 + size
    if document is None or binary is None:
        raise AssertionError("export did not contain JSON and BIN chunks")
    return document, binary


def _float_accessor(document, binary, index):
    accessor = document["accessors"][index]
    view = document["bufferViews"][accessor["bufferView"]]
    if accessor["componentType"] != 5126 or accessor["type"] not in {"VEC3", "VEC4"}:
        raise AssertionError("expected dense FLOAT color accessor")
    width = 3 if accessor["type"] == "VEC3" else 4
    stride = view.get("byteStride", width * 4)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return [
        struct.unpack_from(f"<{width}f", binary, start + row * stride)
        for row in range(accessor["count"])
    ]


def main():
    clean_scene()
    mesh = bpy.data.meshes.new("imported_test_surface")
    vertices = []
    faces = []
    for index in range(6):
        start = len(vertices)
        x = index * 2
        vertices.extend([(x, 0, 0), (x + 1, 0, 0), (x, 0, 1)])
        faces.append((start, start + 1, start + 2))
    mesh.from_pydata(vertices, [], faces)
    tokens = (
        "stone_warm_01",
        "wood_honey_01",
        "animal_hide_black_01",
        "animal_hide_white_01",
        "emissive_window_01",
        "emissive_lantern_01",
    )
    materials = [get_or_create_material(token) for token in tokens]
    window_index = tokens.index("emissive_window_01")
    materials[window_index] = materials[window_index].copy()
    materials[window_index].name = "Windows"
    materials[window_index]["neva_palette_token"] = "emissive_window_01"
    materials[window_index]["neva_source_material"] = "Windows"
    _configure_solid_source_emission(materials[window_index], "emissive_window_01", 0.94)
    for material in materials:
        mesh.materials.append(material)
    for index, polygon in enumerate(mesh.polygons):
        polygon.material_index = index
    color = mesh.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="CORNER")
    mesh.color_attributes.active_color = color
    mesh.color_attributes.render_color_index = mesh.color_attributes.find(color.name)
    expected = {}
    values = (0.8, 0.9, 0.84, 0.97, 0.94, 1.0)
    for polygon, value in zip(mesh.polygons, values):
        material = materials[polygon.material_index]
        rgb = tuple(channel * value for channel in material.diffuse_color[:3])
        expected[material.name] = rgb
        for loop_index in polygon.loop_indices:
            color.data[loop_index].color = (*rgb, 1)
    obj = bpy.data.objects.new("imported_test_surface", mesh)
    bpy.context.collection.objects.link(obj)
    _validate_vertex_color_contract("imported_test", obj)
    report = _prepare_imported_vertex_color_export({"id": "imported_test"}, [obj])
    if report["renamedMeshes"] != [obj.name]:
        raise AssertionError(report)

    texture_mesh = bpy.data.meshes.new("textured_source_surface")
    texture_mesh.from_pydata([(0, 0, 0), (0, 1, 0), (0, 0, 1)], [], [(0, 1, 2)])
    texture_material = get_or_create_material("wood_warm_01").copy()
    texture_material.name = "NormalTree_Bark"
    texture_material["neva_palette_token"] = "wood_warm_01"
    texture_material["neva_source_material"] = "NormalTree_Bark"
    texture_mesh.materials.append(texture_material)
    texture_obj = bpy.data.objects.new("textured_source_surface", texture_mesh)
    bpy.context.collection.objects.link(texture_obj)
    texture_spec = {
        "id": "texture_test",
        "staticAuthoring": {
            "materialMap": {
                "NormalTree_Bark": {
                    "token": "wood_warm_01", "value": 1.0, "texturePolicy": "preserve",
                },
            },
        },
    }
    if _validate_vertex_color_contract("texture_test", texture_obj, texture_spec) != ({"wood_warm_01"}, 0):
        raise AssertionError("texture-preserving source should not require COLOR_0")
    texture_report = _prepare_imported_vertex_color_export(texture_spec, [texture_obj])
    if texture_report["textureOnlyMeshes"] != [texture_obj.name]:
        raise AssertionError(texture_report)
    try:
        _validate_vertex_color_contract("texture_test", texture_obj)
    except RuntimeError:
        pass
    else:
        raise AssertionError("missing COLOR_0 must fail without explicit texture preservation")
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "imported_test.glb"
        bpy.ops.export_scene.gltf(
            filepath=str(path), export_format="GLB", use_selection=False,
            export_yup=True, export_attributes=True, export_materials="EXPORT",
            export_normals=True, export_all_vertex_colors=True,
            export_vertex_color="ACTIVE", export_cameras=False,
            export_lights=False, export_animations=False,
            export_meshopt_compression_enable=False, check_existing=False,
        )
        exported_document, _ = _glb(path)
        generated_lantern = next(
            material for material in exported_document["materials"]
            if material.get("name") == "emissive_lantern_01"
        )
        lantern_expected = expected["emissive_lantern_01"]
        lantern_emissive = generated_lantern.get("emissiveFactor")
        if lantern_emissive is None or max(
            abs(actual - wanted) for actual, wanted in zip(lantern_emissive, lantern_expected)
        ) > 1e-6:
            raise AssertionError(
                "generated palette emission was not exported as its canonical token color: "
                f"{lantern_emissive}"
            )
        lantern_strength = generated_lantern.get("extensions", {}).get(
            "KHR_materials_emissive_strength", {}
        ).get("emissiveStrength")
        expected_strength = MATERIAL_SPECS["emissive_lantern_01"]["emissiveStrength"]
        if lantern_strength is None or abs(lantern_strength - expected_strength) > 1e-6:
            raise AssertionError(f"generated lantern emissive strength differs: {lantern_strength}")
        restore_static_material_state(path, {
            "id": "imported_test",
            "staticAuthoring": {
                "materialMap": {
                    material.name: {
                        "token": token,
                        "value": value,
                        "texturePolicy": "none",
                    }
                    for material, token, value in zip(
                        materials,
                        tokens,
                        values,
                    )
                },
            },
        }, MATERIAL_SPECS)
        document, binary = _glb(path)
        for primitive in document["meshes"][0]["primitives"]:
            material = document["materials"][primitive["material"]]
            name = material["name"]
            factor = material.get("pbrMetallicRoughness", {}).get("baseColorFactor", [1, 1, 1, 1])
            if factor != [1, 1, 1, 1]:
                raise AssertionError(f"{name}: palette would be multiplied twice: {factor}")
            rows = _float_accessor(document, binary, primitive["attributes"]["COLOR_0"])
            if any(max(abs(actual - wanted) for actual, wanted in zip(row[:3], expected[name])) > 1e-6 for row in rows):
                raise AssertionError(f"{name}: COLOR_0 was replaced or changed")
            if name == "Windows":
                emissive = material.get("emissiveFactor")
                if emissive is None or max(abs(actual - wanted) for actual, wanted in zip(emissive, expected[name])) > 1e-6:
                    raise AssertionError(
                        f"{name}: emissiveFactor {emissive} did not retain "
                        f"token * source-region value {expected[name]}"
                    )
                strength = material.get("extensions", {}).get("KHR_materials_emissive_strength", {}).get("emissiveStrength")
                if strength != 2:
                    raise AssertionError(f"{name}: emissive strength differs from the palette contract: {strength}")
    print("[NEVA ART] imported multi-material COLOR_0 export passed")


if __name__ == "__main__":
    main()
