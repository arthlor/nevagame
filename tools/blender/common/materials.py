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


def _rgba(hex_value: str) -> tuple[float, float, float, float]:
    value = hex_value.removeprefix("#")
    if len(value) != 6:
        raise ValueError(f"Expected a six-digit color, received {hex_value!r}")
    return (
        int(value[0:2], 16) / 255,
        int(value[2:4], 16) / 255,
        int(value[4:6], 16) / 255,
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
    color = _rgba(spec["hex"])
    material = bpy.data.materials.new(name=token)
    material.use_nodes = True
    material.diffuse_color = color

    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new(type="ShaderNodeOutputMaterial")
    principled = nodes.new(type="ShaderNodeBsdfPrincipled")
    vertex_color = nodes.new(type="ShaderNodeVertexColor")
    vertex_color.layer_name = "Color"
    material.node_tree.links.new(vertex_color.outputs["Color"], principled.inputs["Base Color"])
    principled.inputs["Roughness"].default_value = spec["roughness"]
    principled.inputs["Metallic"].default_value = spec["metalness"]

    strength = spec.get("emissiveStrength", 0)
    if strength > 0:
        emission_color = principled.inputs.get("Emission Color") or principled.inputs.get("Emission")
        emission_strength = principled.inputs.get("Emission Strength")
        if emission_color is not None:
            material.node_tree.links.new(vertex_color.outputs["Color"], emission_color)
        if emission_strength is not None:
            emission_strength.default_value = strength

    material.node_tree.links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return material
