"""Scene lifecycle, validation, export, and report helpers."""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

from .materials import MATERIAL_SPECS
from .humanoid_export import restore_solid_humanoid_colors
from .static_export import restore_static_material_state


def clean_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def create_root(name: str) -> bpy.types.Object:
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    root["neva_asset_root"] = True
    return root


def _scene_bounds(meshes: list[bpy.types.Object]) -> tuple[list[float], list[float]]:
    points: list[Vector] = []
    for obj in meshes:
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    minimum = [min(point[index] for point in points) for index in range(3)]
    maximum = [max(point[index] for point in points) for index in range(3)]
    return minimum, maximum


def _is_descendant_of(obj: bpy.types.Object, ancestor: bpy.types.Object) -> bool:
    parent = obj.parent
    while parent is not None:
        if parent is ancestor:
            return True
        parent = parent.parent
    return False


def _preserved_texture_tokens(spec: dict | None) -> set[str]:
    if not spec or not spec.get("staticAuthoring"):
        return set()
    return {
        mapping["token"]
        for mapping in spec["staticAuthoring"]["materialMap"].values()
        if mapping["texturePolicy"] == "preserve"
    }


def _material_palette_token(material: bpy.types.Material | None) -> str | None:
    """Resolve a canonical token without collapsing imported source regions."""
    if material is None:
        return None
    token = material.get("neva_palette_token", material.name)
    return token if isinstance(token, str) else None


def _validate_vertex_color_contract(
    asset_id: str,
    obj: bpy.types.Object,
    spec: dict | None = None,
) -> tuple[set[str], int]:
    """Verify that every rendered corner carries its material token in linear COLOR_0.

    Neva's GLBs intentionally keep their semantic palette color in COLOR_0 while
    the material owns roughness and metalness. This catches missing attributes,
    stale colors after material reassignment, and accidental sRGB-as-linear data
    before the exporter or optimizer can make those defects harder to diagnose.
    """
    mesh = obj.data
    preserved_texture_tokens = _preserved_texture_tokens(spec)
    rendered_tokens = {
        _material_palette_token(mesh.materials[polygon.material_index])
        for polygon in mesh.polygons
        if polygon.material_index < len(mesh.materials) and mesh.materials[polygon.material_index] is not None
    }
    rendered_tokens.discard(None)
    attribute = mesh.color_attributes.get("Color")
    if attribute is None:
        if rendered_tokens and rendered_tokens.issubset(preserved_texture_tokens):
            return rendered_tokens, 0
        raise RuntimeError(f"{asset_id}: {obj.name} is missing the Color vertex attribute")
    if attribute.domain != "CORNER":
        raise RuntimeError(f"{asset_id}: {obj.name} Color must use CORNER domain, found {attribute.domain}")
    if len(attribute.data) != len(mesh.loops):
        raise RuntimeError(
            f"{asset_id}: {obj.name} Color has {len(attribute.data)} values for {len(mesh.loops)} loops"
        )

    used_tokens: set[str] = set()
    for polygon in mesh.polygons:
        if polygon.material_index >= len(mesh.materials):
            raise RuntimeError(f"{asset_id}: {obj.name} polygon references a missing material slot")
        material = mesh.materials[polygon.material_index]
        token = _material_palette_token(material)
        if material is None or token not in MATERIAL_SPECS:
            name = None if material is None else material.name
            raise RuntimeError(f"{asset_id}: {obj.name} polygon uses unknown material {name!r}")
        used_tokens.add(token)
        if token in preserved_texture_tokens:
            for loop_index in polygon.loop_indices:
                actual = Vector(attribute.data[loop_index].color[:3])
                if (actual - Vector((1.0, 1.0, 1.0))).length > 1e-5:
                    raise RuntimeError(
                        f"{asset_id}: {obj.name} textured material {token!r} "
                        "must use neutral COLOR_0"
                    )
            continue
        expected = Vector(material.diffuse_color[:3])
        expected_length_squared = expected.length_squared
        if expected_length_squared <= 1e-8:
            raise RuntimeError(f"{asset_id}: {obj.name} material {token!r} has no usable base color")
        for loop_index in polygon.loop_indices:
            actual = Vector(attribute.data[loop_index].color[:3])
            if not all(math.isfinite(channel) for channel in actual):
                raise RuntimeError(f"{asset_id}: {obj.name} has non-finite COLOR_0 data")
            value = actual.dot(expected) / expected_length_squared
            residual = (actual - expected * value).length
            if not 0.70 <= value <= 1.04 or residual > 0.025:
                raise RuntimeError(
                    f"{asset_id}: {obj.name} COLOR_0 does not match linear token {token!r} "
                    f"(value={value:.3f}, residual={residual:.4f})"
                )
    return used_tokens, len(attribute.data)


def _prepare_imported_vertex_color_export(
    spec: dict,
    meshes: list[bpy.types.Object],
) -> dict:
    """Avoid Blender 5.2's later-material COLOR_0 substitution.

    The exporter resolves an active layer named ``Color`` to glTF ``COLOR_0``
    for the first material, but looks the layer up by its glTF semantic for
    subsequent materials and silently emits white when that name is absent.
    Naming the already-validated Blender layer ``COLOR_0`` makes both lookups
    agree. This runs only in the isolated imported-source export process; the
    durable authoring library and all decoded attribute values stay unchanged.
    """
    asset_id = spec["id"]
    preserved_texture_tokens = _preserved_texture_tokens(spec)
    renamed_meshes = []
    texture_only_meshes = []
    retargeted_materials = set()
    for obj in meshes:
        mesh = obj.data
        source = mesh.color_attributes.get("Color")
        semantic = mesh.color_attributes.get("COLOR_0")
        if source is not None and semantic is not None and source is not semantic:
            raise RuntimeError(f"{asset_id}: {obj.name} has ambiguous Color and COLOR_0 layers")
        attribute = semantic or source
        if attribute is None:
            tokens = {
                _material_palette_token(material) for material in mesh.materials
                if material is not None
            }
            if tokens and tokens.issubset(preserved_texture_tokens):
                texture_only_meshes.append(obj.name)
                continue
            raise RuntimeError(f"{asset_id}: {obj.name} is missing its validated color layer")
        if attribute.name != "COLOR_0":
            attribute.name = "COLOR_0"
            renamed_meshes.append(obj.name)
        mesh.color_attributes.active_color = attribute
        mesh.color_attributes.render_color_index = mesh.color_attributes.find(attribute.name)
        for material in mesh.materials:
            if material is None or material.node_tree is None or material in retargeted_materials:
                continue
            for node in material.node_tree.nodes:
                if node.type == "VERTEX_COLOR" and node.layer_name == "Color":
                    node.layer_name = "COLOR_0"
            retargeted_materials.add(material)
    return {
        "semantic": "COLOR_0",
        "renamedMeshes": sorted(renamed_meshes),
        "textureOnlyMeshes": sorted(texture_only_meshes),
        "retargetedMaterials": sorted(material.name for material in retargeted_materials),
    }


def _validate_animation_contract(
    spec: dict,
    objects: list[bpy.types.Object],
    meshes: list[bpy.types.Object],
) -> list[dict]:
    clips = [
        *(spec.get("animationClips") or []),
        *(spec.get("additionalAnimationClips") or []),
    ]
    if not clips:
        return []
    asset_id = spec["id"]
    if spec["family"] == "character":
        armatures = [obj for obj in objects if obj.type == "ARMATURE" and obj.name == spec["rigNode"]]
        if len(armatures) != 1:
            raise RuntimeError(f"{asset_id}: expected one armature named {spec['rigNode']}")
        armature = armatures[0]
        for mesh in meshes:
            modifiers = [modifier for modifier in mesh.modifiers if modifier.type == "ARMATURE"]
            if len(modifiers) != 1 or modifiers[0].object is not armature:
                raise RuntimeError(f"{asset_id}: {mesh.name} is not bound to {spec['rigNode']}")
            if not mesh.vertex_groups:
                raise RuntimeError(f"{asset_id}: {mesh.name} has no skin weights")
        nodes = {obj.name: obj for obj in objects}
        for socket_name in spec["socketNodes"]:
            socket = nodes.get(socket_name)
            if socket is None or socket.type != "EMPTY" or socket.get("neva_marker") != "socket":
                raise RuntimeError(f"{asset_id}: invalid socket node {socket_name}")
            if socket.parent is not armature or socket.parent_type != "BONE" or not socket.parent_bone:
                raise RuntimeError(f"{asset_id}: socket {socket_name} is not bone-parented")

    fps = bpy.context.scene.render.fps / bpy.context.scene.render.fps_base
    metrics = []
    clips_by_name = {clip["name"]: clip for clip in clips}
    for clip in clips:
        action = bpy.data.actions.get(clip["name"])
        source_clip = clip
        if action is None and clip.get("optional", False):
            source_clip = clips_by_name.get(clip.get("fallbackClip"))
            action = bpy.data.actions.get(clip.get("fallbackClip", ""))
        if action is None or source_clip is None:
            raise RuntimeError(f"{asset_id}: missing required authored action {clip['name']}")
        duration = (action.frame_range[1] - action.frame_range[0]) / fps
        if abs(duration - source_clip["durationSeconds"]) > (1 / 60 + 0.002):
            raise RuntimeError(
                f"{asset_id}: {clip['name']} duration {duration:.3f} does not match "
                f"{source_clip['durationSeconds']:.3f}"
            )
        marker = source_clip.get("commitMarkerSeconds")
        if marker is not None and abs(action.get("neva_commit_marker_seconds", -1) - marker) > 0.001:
            raise RuntimeError(f"{asset_id}: {clip['name']} commit marker metadata is missing or stale")
        if bool(action.get("neva_loop", False)) != source_clip["loop"]:
            raise RuntimeError(f"{asset_id}: {clip['name']} loop metadata is missing or stale")
        reference_speed = source_clip.get("referenceSpeedMetersPerSecond")
        if reference_speed is not None and abs(
            action.get("neva_reference_speed_meters_per_second", -1) - reference_speed
        ) > 0.001:
            raise RuntimeError(f"{asset_id}: {clip['name']} reference speed metadata is missing or stale")
        metrics.append({
            "name": clip["name"],
            "durationSeconds": duration,
            "commitMarkerSeconds": marker,
            "loop": clip["loop"],
            "referenceSpeedMetersPerSecond": reference_speed,
            "optional": clip.get("optional", False),
            "fallbackClip": clip.get("fallbackClip"),
            "events": clip.get("events", []),
        })
    return metrics


def validate_and_export(spec: dict, output_path: Path) -> dict:
    asset_id = spec["id"]
    objects = list(bpy.context.scene.objects)
    meshes = [obj for obj in objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"{asset_id}: generator produced no meshes")

    node_names = [obj.name for obj in objects]
    if len(node_names) != len(set(node_names)):
        raise RuntimeError(f"{asset_id}: duplicate node names")
    anonymous_prefixes = ("Cube", "Cylinder", "Cone", "Icosphere", "Sphere", "Torus")
    anonymous = [name for name in node_names if name.startswith(anonymous_prefixes) or "." in name]
    if anonymous:
        raise RuntimeError(f"{asset_id}: anonymous or unstable node names: {anonymous}")

    missing_nodes = sorted(set(spec["requiredNodes"]) - set(node_names))
    if missing_nodes:
        raise RuntimeError(f"{asset_id}: missing required nodes: {missing_nodes}")

    animation_metrics = _validate_animation_contract(spec, objects, meshes)

    material_names: set[str] = set()
    used_material_names: set[str] = set()
    vertex_color_loops = 0
    packaged_triangle_count = 0
    triangles_by_mesh: dict[bpy.types.Object, int] = {}
    degenerate_count = 0
    degenerate_by_object: dict[str, int] = {}
    for obj in meshes:
        if not all(math.isfinite(value) for value in (*obj.location, *obj.scale, *obj.rotation_euler)):
            raise RuntimeError(f"{asset_id}: {obj.name} has non-finite transform data")
        if any(abs(value - 1.0) > 0.0001 for value in obj.scale):
            raise RuntimeError(f"{asset_id}: {obj.name} has unapplied scale {tuple(obj.scale)}")
        obj.data.calc_loop_triangles()
        mesh_triangles = len(obj.data.loop_triangles)
        triangles_by_mesh[obj] = mesh_triangles
        packaged_triangle_count += mesh_triangles
        for triangle in obj.data.loop_triangles:
            vertices = [obj.data.vertices[index].co for index in triangle.vertices]
            if (vertices[1] - vertices[0]).cross(vertices[2] - vertices[0]).length < 1e-8:
                degenerate_count += 1
                degenerate_by_object[obj.name] = degenerate_by_object.get(obj.name, 0) + 1
        for material in obj.data.materials:
            if material is None:
                continue
            material_names.add(material.name)
            token = _material_palette_token(material)
            if token not in MATERIAL_SPECS:
                raise RuntimeError(f"{asset_id}: unknown material {material.name!r}")
        used_tokens, color_loops = _validate_vertex_color_contract(asset_id, obj, spec)
        used_material_names.update(used_tokens)
        vertex_color_loops += color_loops

    if degenerate_count:
        details = ", ".join(f"{name}={count}" for name, count in sorted(degenerate_by_object.items()))
        raise RuntimeError(f"{asset_id}: contains {degenerate_count} degenerate triangles ({details})")
    lod_metrics = []
    triangle_count = packaged_triangle_count
    if spec.get("lodLevels"):
        nodes_by_name = {obj.name: obj for obj in objects}
        lod_meshes: set[bpy.types.Object] = set()
        for level in spec["lodLevels"]:
            level_root = nodes_by_name[level["node"]]
            descendants = {obj for obj in meshes if _is_descendant_of(obj, level_root)}
            overlap = lod_meshes.intersection(descendants)
            if overlap:
                raise RuntimeError(
                    f"{asset_id}: meshes belong to multiple LOD levels: {sorted(obj.name for obj in overlap)}"
                )
            lod_meshes.update(descendants)
            lod_metrics.append({
                "node": level["node"],
                "distanceMeters": level["distanceMeters"],
                "triangles": sum(triangles_by_mesh[obj] for obj in descendants),
            })
        outside = sorted(obj.name for obj in set(meshes) - lod_meshes)
        if outside:
            raise RuntimeError(f"{asset_id}: rendered meshes are outside declared LOD levels: {outside}")
        triangle_count = lod_metrics[0]["triangles"]
        if triangle_count <= 0:
            raise RuntimeError(f"{asset_id}: LOD0 contains no triangles")
        for metric, level in zip(lod_metrics, spec["lodLevels"]):
            metric["ratio"] = metric["triangles"] / triangle_count
            if not level["triangleRatioMin"] <= metric["ratio"] <= level["triangleRatioMax"]:
                raise RuntimeError(
                    f"{asset_id}: {level['node']} triangle ratio {metric['ratio']:.3f} is outside "
                    f"{level['triangleRatioMin']:.3f}..{level['triangleRatioMax']:.3f}"
                )

    budget = spec["budget"]
    if not budget["trianglesMin"] <= triangle_count <= budget["trianglesMax"]:
        raise RuntimeError(
            f"{asset_id}: {triangle_count} triangles outside "
            f"{budget['trianglesMin']}..{budget['trianglesMax']}"
        )
    if len(material_names) > budget["materialsMax"]:
        raise RuntimeError(f"{asset_id}: {len(material_names)} materials exceeds {budget['materialsMax']}")
    undeclared = sorted(used_material_names - set(spec["palette"]))
    if undeclared:
        raise RuntimeError(f"{asset_id}: generator used undeclared palette tokens {undeclared}")
    # Catalog palette entries are an allow-list for the family generator, not
    # a requirement to spend one material per token. Small imported prefabs
    # commonly declare a shared family palette while staying within a two-
    # material budget. The undeclared-token and material-cap checks above keep
    # the actual artifact constrained.

    minimum, maximum = _scene_bounds(meshes)
    actual_dimensions = [maximum[index] - minimum[index] for index in range(3)]
    expected_dimensions = [
        spec["dimensions"]["width"], spec["dimensions"]["depth"], spec["dimensions"]["height"]
    ]
    for actual, expected, axis in zip(actual_dimensions, expected_dimensions, ("width", "depth", "height")):
        if actual > expected * 1.35 or actual < expected * 0.25:
            raise RuntimeError(
                f"{asset_id}: generated {axis} {actual:.3f} is incompatible with spec {expected:.3f}"
            )
    if spec["pivot"] == "ground_center" and not -0.12 <= minimum[2] <= 0.18:
        raise RuntimeError(f"{asset_id}: ground pivot is invalid; minimum Z is {minimum[2]:.3f}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    export_object = meshes[0]
    for selected in bpy.context.view_layer.objects:
        selected.select_set(False)
    export_object.select_set(True)
    bpy.context.view_layer.objects.active = export_object
    export_override = {
        "object": export_object,
        "active_object": export_object,
        "selected_objects": [export_object],
        "selected_editable_objects": [export_object],
    }
    window_manager = getattr(bpy.context, "window_manager", None)
    window = next(iter(window_manager.windows), None) if window_manager else None
    if window is not None:
        export_override.update(window=window, screen=window.screen)
    # Canonical palm/contact frames are consumed at runtime; keep their explicit
    # marker together with the quaternion for procedural equipment as well.
    imported_options = {"export_extras": any(obj.get("neva_grip_frame") for obj in objects)}
    if spec.get("generator") == "imported_blend":
        # Imported derivatives already contain baked object transforms, authored
        # weights and clips. Keep the same export contract as their staging pass;
        # regeneration must not resample actions or apply skin modifiers.
        imported_options = {
            "export_extras": True,
            "export_materials": "EXPORT",
            "export_texcoords": True,
            "export_normals": True,
            "export_all_vertex_colors": True,
            "export_vertex_color": "ACTIVE",
            "export_skins": True,
            "export_all_influences": False,
            "export_influence_nb": 4,
            "export_merge_animation": "ACTION",
            "export_force_sampling": False,
            "export_optimize_animation_size": True,
            "export_anim_slide_to_zero": True,
            "export_frame_step": 1,
            "export_morph": False,
            "export_rest_position_armature": True,
            "export_meshopt_compression_enable": False,
        }
    # Single-key bone channels may take the exporter's evaluated-pose path.
    # Geometry/binds still use export_rest_position_armature, but actions require
    # POSE evaluation so sparse native defaults never become identity.
    if spec.get("humanoidAuthoring"):
        for obj in objects:
            if obj.type == "ARMATURE": obj.data.pose_position = "POSE"
    imported_color_export = None
    if spec.get("generator") == "imported_blend":
        imported_color_export = _prepare_imported_vertex_color_export(spec, meshes)
    with bpy.context.temp_override(**export_override):
        bpy.ops.export_scene.gltf(
            filepath=str(output_path),
            export_format="GLB",
            use_selection=False,
            export_apply=spec.get("generator") != "imported_blend",
            export_yup=True,
            export_attributes=True,
            export_animation_mode=(
                "NLA_TRACKS"
                if (spec.get("animationClips") or spec.get("additionalAnimationClips")) and spec["family"] != "character"
                else "ACTIONS"
            ),
            export_cameras=False,
            export_lights=False,
            **imported_options,
        )
    static_material_export = restore_static_material_state(output_path, spec, MATERIAL_SPECS)
    source_color_export = restore_solid_humanoid_colors(output_path, spec, MATERIAL_SPECS)
    quality_status = "on_target" if triangle_count >= budget["trianglesTarget"] else "below_target"
    return {
        "id": asset_id,
        "file": spec["file"],
        "nodes": len(objects),
        "meshes": len(meshes),
        "triangles": triangle_count,
        "packagedTriangles": packaged_triangle_count,
        "lodLevels": lod_metrics,
        "qualityStatus": quality_status,
        "budget": budget,
        "fileSizeBytes": output_path.stat().st_size,
        "materials": sorted(material_names),
        "paletteTokensUsed": sorted(used_material_names),
        "vertexColorLoops": vertex_color_loops,
        "vertexColorSpace": "linear-srgb",
        "importedColorExport": imported_color_export,
        "staticMaterialExport": static_material_export,
        "sourceColorExport": source_color_export,
        "artContractStatus": "passed",
        "bounds": {"min": minimum, "max": maximum},
        "dimensions": actual_dimensions,
        "requiredNodes": spec["requiredNodes"],
        "animationClips": animation_metrics,
    }
