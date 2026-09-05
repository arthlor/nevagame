"""Stage the two admitted Poly Pizza environment pilots as Neva Blender libraries.

Run with Blender's --python flag and arguments after --. This authoring helper
never exports or publishes GLBs. The registered imported-Blender generator and
normal art CLI remain the only runtime publication path.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "tools" / "blender"))

from common.materials import MATERIAL_SPECS, get_or_create_material  # noqa: E402
from common.pipeline import _validate_vertex_color_contract  # noqa: E402


def _sha256(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def _triangles(mesh: bpy.types.Mesh) -> int:
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def _bounds(mesh: bpy.types.Mesh) -> tuple[Vector, Vector]:
    if not mesh.vertices:
        raise ValueError("The selected source contains no vertices")
    return (
        Vector(tuple(min(vertex.co[axis] for vertex in mesh.vertices) for axis in range(3))),
        Vector(tuple(max(vertex.co[axis] for vertex in mesh.vertices) for axis in range(3))),
    )


def _empty(collection, name, parent=None, location=(0.0, 0.0, 0.0)):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    obj.empty_display_type = "PLAIN_AXES"
    return obj


def _validate_source_surface(mesh: bpy.types.Mesh) -> dict:
    """Measure the source without welding, retriangulating, or rebuilding normals."""
    if any(len(polygon.vertices) != 3 for polygon in mesh.polygons):
        raise ValueError("Static source LOD0 must already be triangulated")
    mesh.calc_loop_triangles()
    degenerate = []
    for triangle in mesh.loop_triangles:
        a, b, c = (mesh.vertices[index].co for index in triangle.vertices)
        area = (b - a).cross(c - a).length * 0.5
        if not math.isfinite(area) or area < 1e-12:
            degenerate.append(triangle.index)
    if degenerate:
        raise ValueError(f"Static source contains degenerate triangles: {degenerate[:12]}")
    if not mesh.uv_layers:
        raise ValueError("Static source LOD0 must retain its source UV coordinates")
    split_positions = {}
    for loop in mesh.loops:
        position = tuple(round(value, 7) for value in mesh.vertices[loop.vertex_index].co)
        normal = tuple(round(value, 6) for value in loop.normal)
        if not all(math.isfinite(value) for value in (*position, *normal)):
            raise ValueError("Static source contains a non-finite position or loop normal")
        split_positions.setdefault(position, set()).add(normal)
    return {
        "vertices": len(mesh.vertices),
        "triangles": len(mesh.loop_triangles),
        "loops": len(mesh.loops),
        "uvLayers": [layer.name for layer in mesh.uv_layers],
        "smoothPolygons": sum(polygon.use_smooth for polygon in mesh.polygons),
        "flatPolygons": sum(not polygon.use_smooth for polygon in mesh.polygons),
        "splitNormalPositions": sum(len(normals) > 1 for normals in split_positions.values()),
        "cleanup": "none-source-topology-and-loop-data-preserved",
    }


def _normalize(mesh: bpy.types.Mesh, authoring: dict) -> dict:
    minimum, maximum = _bounds(mesh)
    dimensions = maximum - minimum
    if min(dimensions) <= 1e-6:
        raise ValueError("The donor must be a complete volumetric asset")
    axis_names = ("width", "depth", "height")
    reference = authoring["scaleReference"]
    reference_axis = axis_names.index(reference["axis"])
    uniform_scale = reference["meters"] / dimensions[reference_axis]
    center = Vector(((minimum.x + maximum.x) / 2, (minimum.y + maximum.y) / 2, minimum.z))
    mesh.transform(Matrix.Diagonal((uniform_scale, uniform_scale, uniform_scale, 1.0)) @ Matrix.Translation(-center))
    mesh.update()
    return {
        "sourceDimensions": list(dimensions),
        "uniformScale": uniform_scale,
        "scaleReference": reference,
        "dimensions": list(dimensions * uniform_scale),
        "policy": "uniform-ground-center-source-preserving",
    }


def _alpha_materials(mesh):
    return [
        material.name for material in mesh.materials
        if material and material.node_tree and any(
            link.to_socket.name == "Alpha" for link in material.node_tree.links
        )
    ]


def _entry_lantern_location(mesh: bpy.types.Mesh, spec: dict) -> tuple[float, float, float]:
    """Measure the practical-light anchor without changing the source surface."""
    # Measured entry-side offset in the adapted facade. It is independent of
    # the retired procedural doorWidth parameter after catalog cutover.
    x = spec["dimensions"]["width"] * (0.8 / 6.2)
    z = spec["dimensions"]["height"] * 0.275
    tree = BVHTree.FromPolygons([vertex.co for vertex in mesh.vertices], [list(polygon.vertices) for polygon in mesh.polygons])
    hit, _, _, _ = tree.ray_cast(Vector((x, -spec["dimensions"]["depth"], z)), Vector((0, 1, 0)))
    if hit is None:
        raise ValueError("No front facade at the entry-lantern anchor; review the source orientation")
    center = Vector((x, hit.y - 0.18, z))
    return tuple(center)


def _entry_lantern_mesh(name: str, location, materials) -> bpy.types.Mesh:
    """Build the declared accessory as its own LOD-owned mesh."""
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    bm = bmesh.new()
    try:
        def box(location, dimensions, material_index):
            result = bmesh.ops.create_cube(bm, size=1.0)
            for vertex in result["verts"]:
                vertex.co = Vector(tuple(vertex.co[axis] * dimensions[axis] + location[axis] for axis in range(3)))
            for face in {face for vertex in result["verts"] for face in vertex.link_faces}:
                face.material_index = material_index
        center = Vector(location)
        wood, glass = 0, 1
        box(center, (0.12, 0.12, 0.21), glass)
        for dz in (-0.13, 0.13):
            box(center + Vector((0, 0, dz)), (0.20, 0.20, 0.04), wood)
        for dx in (-0.08, 0.08):
            for dy in (-0.08, 0.08):
                box(center + Vector((dx, dy, 0)), (0.025, 0.025, 0.25), wood)
        box(center + Vector((0, 0.10, 0.17)), (0.05, 0.23, 0.05), wood)
        bm.to_mesh(mesh)
    finally:
        bm.free()
    mesh.update()
    for material in materials:
        mesh.materials.append(material)
    return mesh


def _canonical_material_name(name: str) -> str:
    return re.sub(r"\.\d{3}$", "", name)


def _region_material_name(token: str, source: str) -> str:
    safe_source = re.sub(r"[^A-Za-z0-9_]+", "_", source).strip("_")
    if not safe_source:
        raise ValueError(f"Source material {source!r} has no stable identity")
    return safe_source


def _preserve_textured_material(
    source: bpy.types.Material,
    token: str,
    value: float,
    source_identity: str,
) -> bpy.types.Material:
    if source.node_tree is None:
        raise ValueError(f"Textured source material {source.name!r} has no node tree")
    image_nodes = [node for node in source.node_tree.nodes if node.type == "TEX_IMAGE" and node.image]
    if not image_nodes:
        raise ValueError(f"Textured source material {source.name!r} has no image data to preserve")
    material = source.copy()
    expected_name = _region_material_name(token, source_identity)
    material.name = expected_name
    if material.name != expected_name:
        raise ValueError(f"Palette material name collision while preserving {source.name!r}")
    material.diffuse_color = (value, value, value, 1.0)
    principled = [node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"]
    if len(principled) != 1:
        raise ValueError(f"Textured source material {source.name!r} needs one Principled shader")
    shader = principled[0]
    shader.inputs["Base Color"].default_value = (value, value, value, 1.0)
    shader.inputs["Roughness"].default_value = MATERIAL_SPECS[token]["roughness"]
    shader.inputs["Metallic"].default_value = MATERIAL_SPECS[token]["metalness"]
    material["neva_palette_token"] = token
    material["neva_source_material"] = source_identity
    return material


def _configure_solid_source_emission(
    material: bpy.types.Material,
    token: str,
    value: float,
) -> None:
    """Author glTF emission explicitly because COLOR_0 cannot modulate it.

    Solid source regions keep their visible base color in COLOR_0 with a white
    base factor. Blender can connect that attribute to Principled emission, but
    glTF has no vertex-color input for emissiveFactor and the exporter otherwise
    substitutes white. Each source region owns its own material, so writing the
    exact token * region value here preserves both region identity and color.
    """
    strength = MATERIAL_SPECS[token].get("emissiveStrength", 0)
    if strength <= 0:
        return
    if material.node_tree is None:
        raise ValueError(f"Emissive source material {material.name!r} has no node tree")
    principled = [node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"]
    if len(principled) != 1:
        raise ValueError(f"Emissive source material {material.name!r} needs one Principled shader")
    shader = principled[0]
    emission_color = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
    emission_strength = shader.inputs.get("Emission Strength")
    if emission_color is None or emission_strength is None:
        raise ValueError(f"Emissive source material {material.name!r} lacks emission inputs")
    for link in list(emission_color.links):
        material.node_tree.links.remove(link)
    rgb = tuple(channel * value for channel in material.diffuse_color[:3])
    emission_color.default_value = (*rgb, 1.0)
    emission_strength.default_value = strength


def _remap_materials(mesh: bpy.types.Mesh, spec: dict) -> tuple[list[dict], dict[str, str]]:
    source_names = [material.name if material else "" for material in mesh.materials]
    declared = spec["staticAuthoring"]["materialMap"]
    canonical_names = [_canonical_material_name(name) for name in source_names]
    if set(canonical_names) != set(declared):
        raise ValueError(
            f"Source material map mismatch; source={sorted(set(canonical_names))}, "
            f"declared={sorted(declared)}"
        )
    mapping = [declared[name] for name in canonical_names]
    if not source_names:
        raise ValueError("The donor has no semantic material slots")
    polygon_sources = [polygon.material_index for polygon in mesh.polygons]
    if any(index >= len(mapping) for index in polygon_sources):
        raise ValueError("The donor references a missing material slot")
    tokens = list(dict.fromkeys(item["token"] for item in mapping))
    if set(tokens) - set(spec["palette"]):
        raise ValueError("The current catalog palette does not allow the reviewed donor mapping")
    token_policies = {}
    for item in mapping:
        previous_policy = token_policies.setdefault(item["token"], item["texturePolicy"])
        if previous_policy != item["texturePolicy"]:
            raise ValueError(f"Palette token {item['token']} mixes texture policies")
    if len(set(token_policies.values())) > 1:
        raise ValueError("One source mesh cannot mix solid COLOR_0 and texture-preserving policies")
    source_materials = list(mesh.materials)
    # The imported donor still owns these datablocks. Move their Blender-only
    # names aside so the adapted material can retain the exact provider region
    # identity without acquiring an unstable `.001` suffix.
    for index, (source, canonical) in enumerate(zip(source_materials, canonical_names)):
        source.name = f"__neva_source_{index}_{canonical}"
    mesh.materials.clear()
    for source, canonical, item in zip(source_materials, canonical_names, mapping):
        token = item["token"]
        if token_policies[token] == "preserve":
            material = _preserve_textured_material(source, token, item["value"], canonical)
        else:
            material = get_or_create_material(token).copy()
            expected_name = _region_material_name(token, canonical)
            material.name = expected_name
            if material.name != expected_name:
                raise ValueError(f"Palette material name collision while preserving {canonical!r}")
            material["neva_palette_token"] = token
            material["neva_source_material"] = canonical
            _configure_solid_source_emission(material, token, item["value"])
        mesh.materials.append(material)
    values = mesh.attributes.new(name="neva_source_value", type="FLOAT", domain="FACE")
    for polygon, source_index in zip(mesh.polygons, polygon_sources):
        item = mapping[source_index]
        token, value = item["token"], item["value"]
        polygon.material_index = source_index
        values.data[polygon.index].value = value
    return ([
        {
            "source": name,
            "canonicalSource": canonical,
            "token": item["token"],
            "value": item["value"],
            "texturePolicy": item["texturePolicy"],
        }
        for name, canonical, item in zip(source_names, canonical_names, mapping)
    ], token_policies)


def _bake_colors(mesh: bpy.types.Mesh, token_policies: dict[str, str], fallback_values=None) -> int:
    for attribute in list(mesh.color_attributes):
        mesh.color_attributes.remove(attribute)
    if set(token_policies.values()) == {"preserve"}:
        source_values = mesh.attributes.get("neva_source_value")
        if source_values:
            mesh.attributes.remove(source_values)
        return 0
    attribute = mesh.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="CORNER")
    mesh.color_attributes.active_color = attribute
    mesh.color_attributes.render_color_index = mesh.color_attributes.find(attribute.name)
    source_values = mesh.attributes.get("neva_source_value")
    for polygon in mesh.polygons:
        material = mesh.materials[polygon.material_index]
        token = material.get("neva_palette_token", material.name)
        if token_policies.get(token) == "preserve":
            color = (1.0, 1.0, 1.0, 1.0)
        else:
            if source_values:
                source_value = source_values.data[polygon.index].value
            elif fallback_values and token in fallback_values:
                source_value = fallback_values[token]
            else:
                raise ValueError(f"Missing explicit solid value for {token}")
            color = tuple(channel * source_value for channel in material.diffuse_color[:3]) + (1.0,)
        for loop_index in polygon.loop_indices:
            attribute.data[loop_index].color = color
    if source_values:
        mesh.attributes.remove(source_values)
    return len(attribute.data)


def _reduced_mesh(obj, scene, target_ratio: float) -> bpy.types.Mesh:
    modifier = obj.modifiers.new(name="NEVA_LOD_Simplification", type="DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = target_ratio
    modifier.use_collapse_triangulate = True
    # Preserve material boundaries so roof/wall and crown/trunk separation
    # remain readable when the distant mesh drops tertiary geometry.
    modifier.delimit = {"MATERIAL"}
    try:
        with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
            scene.view_layers[0].update()
            graph = bpy.context.evaluated_depsgraph_get()
            result = bpy.data.meshes.new_from_object(obj.evaluated_get(graph), preserve_all_data_layers=True, depsgraph=graph)
    finally:
        obj.modifiers.remove(modifier)
    return result


def _markers(collection, root, spec, lantern_location=None):
    for index, primitive in enumerate(spec.get("collisionPrimitives", [])):
        cx, cy, cz = primitive["center"]
        hx, hy, hz = primitive["halfExtents"]
        name = f"COL_{spec['id']}" if index == 0 else f"COL_{spec['id']}_{primitive['id']}"
        marker = _empty(collection, name, root, (cx, -cz, cy))
        marker["neva_marker"] = "collision"
        marker["shape"] = "box"
        marker["dimensions"] = [hx * 2, hz * 2, hy * 2]
        marker.rotation_euler.z = math.radians(primitive.get("yawDegrees", 0))
    if spec["id"] == "house_cottage_a":
        if lantern_location is None:
            raise ValueError("The cottage practical light requires an actual lantern")
        lantern = _empty(collection, "cottage_a_lantern_glow", root, lantern_location)
        lantern["neva_marker"] = "practical_light"


def _validate_staging(spec, collection, lod_groups) -> dict:
    nodes = {obj.name: obj for obj in collection.all_objects}
    missing = set(spec["requiredNodes"]) - set(nodes)
    if missing:
        raise ValueError(f"Missing catalog nodes: {sorted(missing)}")
    materials = set()
    palette_tokens = set()
    lod_metrics = []
    first_count = sum(_triangles(obj.data) for obj in lod_groups[0])
    for group, level in zip(lod_groups, spec["lodLevels"]):
        count = sum(_triangles(obj.data) for obj in group)
        ratio = count / first_count
        if not level["triangleRatioMin"] <= ratio <= level["triangleRatioMax"]:
            raise ValueError(f"{level['node']}: LOD triangle ratio {ratio:.4f} violates the catalog")
        color_loops = 0
        surface_metrics = []
        for obj in group:
            if obj.parent is not nodes[level["node"]] or obj.parent.type != "EMPTY":
                raise ValueError(f"{obj.name}: invalid LOD parent")
            used, loops = _validate_vertex_color_contract(spec["id"], obj, spec)
            palette_tokens.update(used)
            materials.update(material.name for material in obj.data.materials if material)
            color_loops += loops
            obj.data.calc_loop_triangles()
            for triangle in obj.data.loop_triangles:
                a, b, c = (obj.data.vertices[index].co for index in triangle.vertices)
                if (b - a).cross(c - a).length < 1e-8:
                    raise ValueError(f"{obj.name}: degenerate triangle survived adaptation")
            surface_metrics.append({
                "node": obj.name,
                "triangles": _triangles(obj.data),
                "vertices": len(obj.data.vertices),
                "loops": len(obj.data.loops),
                "uvLayers": [layer.name for layer in obj.data.uv_layers],
                "smoothPolygons": sum(polygon.use_smooth for polygon in obj.data.polygons),
                "flatPolygons": sum(not polygon.use_smooth for polygon in obj.data.polygons),
                "colorLoops": loops,
            })
        lod_metrics.append({
            "node": level["node"], "triangles": count, "ratio": ratio,
            "colorLoops": color_loops, "surfaces": surface_metrics,
        })
    budget = spec["budget"]
    if not budget["trianglesMin"] <= first_count <= budget["trianglesMax"]:
        raise ValueError(f"LOD0 has {first_count} triangles; catalog requires {budget['trianglesMin']}..{budget['trianglesMax']}. Geometry will not be padded.")
    if len(materials) > budget["materialsMax"]:
        raise ValueError("Staged source exceeds the catalog material cap")
    expected_meshes = {obj for group in lod_groups for obj in group}
    for obj in collection.all_objects:
        if obj.type == "MESH" and obj not in expected_meshes:
            raise ValueError(f"Unexpected rendered object outside LODs: {obj.name}")
        if "." in obj.name:
            raise ValueError(f"Unstable Blender name: {obj.name}")
    points = [vertex.co for obj in lod_groups[0] for vertex in obj.data.vertices]
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    return {
        "lodLevels": lod_metrics,
        "materials": sorted(materials),
        "paletteTokens": sorted(palette_tokens),
        "bounds": {"min": minimum, "max": maximum},
        "requiredNodes": sorted(nodes),
        "qualityStatus": "on_target" if first_count >= budget["trianglesTarget"] else "below_target",
    }


def adapt(args) -> dict:
    catalog = json.loads((PROJECT_ROOT / "assets/specs/asset-catalog.json").read_text())
    spec = next((asset for asset in catalog["assets"] if asset["id"] == args.asset), None)
    if spec is None:
        raise ValueError(f"Unknown catalog asset {args.asset!r}")
    authoring = spec.get("staticAuthoring")
    if spec.get("generator") != "imported_blend" or not authoring:
        raise ValueError("Static adaptation requires a catalog-declared imported_blend staticAuthoring contract")
    source_relative = Path(authoring["sourceFile"])
    source_path = (PROJECT_ROOT / source_relative).resolve(strict=True)
    if source_relative.is_absolute() or not source_path.is_relative_to(PROJECT_ROOT):
        raise ValueError("staticAuthoring.sourceFile must stay inside the repository")
    if source_path.suffix.lower() != ".glb" or _sha256(source_path) != authoring["sourceSha256"]:
        raise ValueError("staticAuthoring source GLB path or SHA-256 does not match the immutable original")
    output_dir = Path(args.output_dir).resolve()
    blend_path = output_dir / f"{args.asset}.blend"
    report_path = output_dir / f"{args.asset}-adaptation-report.json"
    if blend_path.exists() or report_path.exists():
        raise FileExistsError("Use a new staging directory; this helper does not overwrite an earlier candidate")
    digest = _sha256(source_path)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "NEVA_POLYPIZZA_STATIC_ADAPTATION"
    bpy.ops.import_scene.gltf(filepath=str(source_path))
    scene.view_layers[0].update()
    variant = authoring["sourceNode"]
    donors = [obj for obj in scene.objects if obj.name == variant and obj.type == "MESH"]
    if len(donors) != 1:
        raise ValueError(f"Immutable source must contain exactly one mesh node {variant!r}")
    donor = donors[0]
    if donor.modifiers or donor.data.shape_keys:
        raise ValueError("Static pilots must not contain rig/modifier/morph dependencies")
    alpha_materials = _alpha_materials(donor.data)
    collection = bpy.data.collections.new(args.asset)
    scene.collection.children.link(collection)
    root = _empty(collection, spec["rootNode"])
    root["neva_asset_root"] = True
    provenance = spec["sourceProvenance"]
    root["polypizza_id"] = provenance["modelId"]
    root["polypizza_licence"] = provenance["license"]
    root["polypizza_attribution"] = provenance["attribution"]
    root["neva_source_sha256"] = digest
    root["neva_source_variant"] = variant
    mesh = donor.data.copy()
    mesh.name = f"{args.asset}_LOD0_surface_mesh"
    source_surface = _validate_source_surface(mesh)
    yaw = math.radians(authoring["yawDegrees"])
    mesh.transform(Matrix.Rotation(yaw, 4, "Z") @ donor.matrix_world)
    original_triangles = _triangles(mesh)
    normalization = _normalize(mesh, authoring)
    normalization["sourceYawDegrees"] = math.degrees(yaw)
    normalized_surface = _validate_source_surface(mesh)
    lantern_location = _entry_lantern_location(mesh, spec) if authoring.get("addedGeometryNodes") else None
    mapping, token_policies = _remap_materials(mesh, spec)
    color_loops = _bake_colors(mesh, token_policies)
    materials_by_source = {
        material.get("neva_source_material"): material for material in mesh.materials if material
    }
    lantern_materials = None
    lantern_values = None
    lantern_policies = None
    if authoring.get("addedGeometryNodes"):
        try:
            lantern_materials = [materials_by_source["Wood_Side"], materials_by_source["Windows"]]
            lantern_mappings = [authoring["materialMap"]["Wood_Side"], authoring["materialMap"]["Windows"]]
        except KeyError as error:
            raise ValueError("Declared cottage lantern needs mapped Wood_Side and Windows regions") from error
        if any(item["texturePolicy"] != "none" for item in lantern_mappings):
            raise ValueError("Declared cottage lantern requires solid Wood_Side and Windows mappings")
        lantern_values = {item["token"]: item["value"] for item in lantern_mappings}
        lantern_policies = {item["token"]: item["texturePolicy"] for item in lantern_mappings}
        if len(authoring["addedGeometryNodes"]) != len(spec["lodLevels"]):
            raise ValueError("addedGeometryNodes must declare one LOD-owned lantern surface per level")
    lod_groups = []
    for index, level in enumerate(spec["lodLevels"]):
        lod_root = _empty(collection, level["node"], root)
        lod_root["neva_lod_index"] = index
        lod_root["neva_lod_distance_meters"] = level["distanceMeters"]
        if index == 0:
            level_mesh = mesh
        else:
            desired_ratio = min(0.38, level["triangleRatioMax"] * 0.85)
            level_mesh = _reduced_mesh(lod_groups[0][0], scene, desired_ratio)
            level_mesh.name = f"{args.asset}_LOD{index}_surface_mesh"
        obj = bpy.data.objects.new(f"{args.asset}_LOD{index}_surface", level_mesh)
        collection.objects.link(obj)
        obj.parent = lod_root
        obj.matrix_basis = Matrix.Identity(4)
        group = [obj]
        if lantern_materials:
            lantern_name = authoring["addedGeometryNodes"][index]
            lantern_mesh = _entry_lantern_mesh(lantern_name, lantern_location, lantern_materials)
            _bake_colors(
                lantern_mesh,
                lantern_policies,
                lantern_values,
            )
            lantern = bpy.data.objects.new(lantern_name, lantern_mesh)
            collection.objects.link(lantern)
            lantern.parent = lod_root
            lantern.matrix_basis = Matrix.Identity(4)
            group.append(lantern)
        lod_groups.append(group)
    _markers(collection, root, spec, lantern_location)
    scene.view_layers[0].update()
    metrics = _validate_staging(spec, collection, lod_groups)
    report = {
        "assetId": args.asset, "sourceModelId": provenance["modelId"],
        "sourceUrl": provenance["sourceUrl"], "sourceFile": str(source_relative),
        "sourceSha256": digest, "sourceVariant": variant,
        "license": provenance["license"], "attribution": provenance["attribution"],
        "sourceTriangles": original_triangles, "normalization": normalization,
        "sourceSurfaceBeforeTransform": source_surface,
        "sourceSurfaceAfterTransform": normalized_surface,
        "materialRemap": mapping, "metrics": metrics,
        "sourceAlphaMaterials": alpha_materials, "lod0ColorLoops": color_loops,
        "lanternLocation": lantern_location,
        "outputBlend": str(blend_path), "outputCollection": args.asset,
        "saveImpact": False, "publication": "not_performed",
        "visualStatus": "Awaiting human game review",
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    bpy.data.libraries.write(str(blend_path), {collection}, path_remap="RELATIVE", fake_user=True, compress=True)
    report["outputSha256"] = _sha256(blend_path)
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset", required=True)
    parser.add_argument("--output-dir", required=True)
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    adapt(parser.parse_args(arguments))


if __name__ == "__main__":
    main()
