"""Shared Blender materials backed by Neva's canonical palette JSON."""

from __future__ import annotations

import json
from pathlib import Path

import bpy


PROJECT_ROOT = Path(__file__).resolve().parents[3]
PALETTE_PATH = PROJECT_ROOT / "art" / "palettes" / "neva.palette.json"

with PALETTE_PATH.open("r", encoding="utf-8") as palette_file:
    _PALETTE_DOCUMENT = json.load(palette_file)

MATERIAL_SPECS: dict[str, dict] = _PALETTE_DOCUMENT["tokens"]


def srgb_channel_to_linear(value: float) -> float:
    """Convert a canonical sRGB palette channel to scene-linear RGB."""
    if value <= 0.04045:
        return value / 12.92
    return ((value + 0.055) / 1.055) ** 2.4


def hex_to_linear_rgba(hex_value: str) -> tuple[float, float, float, float]:
    """Decode a six-digit sRGB token for Blender/glTF's linear color path."""
    value = hex_value.removeprefix("#")
    if len(value) != 6:
        raise ValueError(f"Expected a six-digit color, received {hex_value!r}")
    srgb = (
        int(value[0:2], 16) / 255,
        int(value[2:4], 16) / 255,
        int(value[4:6], 16) / 255,
    )
    return (
        srgb_channel_to_linear(srgb[0]),
        srgb_channel_to_linear(srgb[1]),
        srgb_channel_to_linear(srgb[2]),
        1.0,
    )


def get_or_create_material(token: str) -> bpy.types.Material:
    """Return one scene-local material for a canonical semantic token."""
    if token not in MATERIAL_SPECS:
        known = ", ".join(sorted(MATERIAL_SPECS))
        raise KeyError(f"Unknown palette token {token!r}. Known tokens: {known}")

    existing = bpy.data.materials.get(token)
    if existing is not None:
        return existing

    spec = MATERIAL_SPECS[token]
    color = hex_to_linear_rgba(spec["hex"])
    material = bpy.data.materials.new(name=token)
    material.diffuse_color = color
    # Every generated primitive is closed geometry. Keeping back-face culling
    # enabled avoids exporting every shared palette material as double-sided.
    material.use_backface_culling = True

    node_tree = material.node_tree
    if node_tree is None:
        raise RuntimeError(f"Blender did not create a node tree for palette material {token}")
    nodes = node_tree.nodes
    nodes.clear()
    output = nodes.new(type="ShaderNodeOutputMaterial")
    principled = nodes.new(type="ShaderNodeBsdfPrincipled")
    vertex_color = nodes.new(type="ShaderNodeVertexColor")
    vertex_color.layer_name = "Color"
    node_tree.links.new(vertex_color.outputs["Color"], principled.inputs["Base Color"])
    principled.inputs["Roughness"].default_value = spec["roughness"]
    principled.inputs["Metallic"].default_value = spec["metalness"]

    strength = spec.get("emissiveStrength", 0)
    if strength > 0:
        emission_color = principled.inputs.get("Emission Color") or principled.inputs.get("Emission")
        emission_strength = principled.inputs.get("Emission Strength")
        if emission_color is not None:
            # glTF has no vertex-color input for emissiveFactor. Linking
            # COLOR_0 here makes Blender 5.2 export a white emissive material,
            # even though the base color remains correct. Generated palette
            # materials therefore use their canonical token color for emission;
            # source regions that need a per-region value own a distinct
            # explicit emission in their adapter.
            emission_color.default_value = color
        if emission_strength is not None:
            emission_strength.default_value = strength

    node_tree.links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return material
