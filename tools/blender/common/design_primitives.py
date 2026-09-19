"""Blender adapter for authored meshes. Palette and surface finish stay upstream.

No operators, global monkey-patches, new material tokens, random global state,
colliders, animation tracks, or runtime TypeScript changes are introduced here.
"""
from __future__ import annotations
import bpy
from common.geometry import apply_vertex_values, set_surface_normals
from common.materials import get_or_create_material
from .design_geometry import (
    DesignMesh, stable_seed, transformed, validate_mesh, crafted_box, roof_tile,
    ridge_cap, folded_leaf, canopy, geological_mass, lobed_volume, hat_brim, draped_panel,
)


def add_design_mesh(name, shape: DesignMesh, token, parent, *, location=(0,0,0),
                    rotation=(0,0,0), normal_mode='planar'):
    """Preserve the primitive-helper contract: translated origin, applied rotation."""
    validate_mesh(shape)
    shape = transformed(shape, rotation=rotation)
    mesh = bpy.data.meshes.new(f'{name}_mesh')
    obj = None
    try:
        mesh.from_pydata(shape.vertices, [], shape.faces)
        if mesh.validate(clean_customdata=False):
            raise ValueError(f'{name}: Blender repaired an invalid authored mesh')
        mesh.update(calc_edges=True)
        mesh.materials.append(get_or_create_material(token))
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = parent
        obj.location = location
        set_surface_normals(obj, normal_mode)
        for polygon in mesh.polygons:
            polygon.use_smooth = normal_mode != 'planar'
        apply_vertex_values(obj)
        return obj
    except Exception:
        if obj is not None:
            bpy.data.objects.remove(obj, do_unlink=True)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
        raise


def add_crafted_box(name, location, dimensions, token, parent, *, rotation=(0,0,0), bevel=.025, flat=True):
    return add_design_mesh(name, crafted_box(tuple(dimensions), bevel, stable_seed(name)), token, parent,
                           location=location, rotation=rotation, normal_mode='planar' if flat else 'rounded')


def add_roof_tile(name, token, parent, **geometry):
    return add_design_mesh(name, roof_tile(**geometry), token, parent)


def add_ridge_cap(name, location, length, token, parent, *, rotation=(0,0,0), width=.30, height=.20):
    return add_design_mesh(name, ridge_cap(length,width,height), token,parent,location=location,rotation=rotation)


def add_folded_leaf(name, base, length, width, facing_angle, token, parent, *, pitch=.42, droop=0, cup=.10):
    shape=folded_leaf(length,width,facing_angle,pitch=pitch,droop=droop,cup=cup,seed=stable_seed(name))
    return add_design_mesh(name,shape,token,parent,location=base,normal_mode='foliage')


def add_canopy_mass(name, location, scale, token, parent, *, subdivisions=1, rotation=(0,0,0),
                    flat=True, normal_mode='foliage', seed=None):
    shape=canopy(tuple(scale),stable_seed(name) if seed is None else seed,sides=8 if subdivisions<=1 else 12)
    return add_design_mesh(name,shape,token,parent,location=location,rotation=rotation,normal_mode=normal_mode)


def add_geological_mass(name, location, scale, token, parent, *, subdivisions=1,
                        rotation=(0,0,0), flat=True, seed=None, rings=4):
    shape=geological_mass(tuple(scale), stable_seed(name) if seed is None else seed,
                          sides=6 if subdivisions<=1 else 12, rings=rings)
    return add_design_mesh(name,shape,token,parent,location=location,rotation=rotation,normal_mode='planar')


def add_lobed_volume(name, location, scale, token, parent, *, kind='apple', rotation=(0,0,0), seed=None, sides=12):
    shape=lobed_volume(tuple(scale),stable_seed(name) if seed is None else seed,kind=kind,sides=sides)
    return add_design_mesh(name,shape,token,parent,location=location,rotation=rotation,normal_mode='rounded')


def add_hat_brim(name, location, inner, outer, token, parent):
    return add_design_mesh(name,hat_brim(inner,outer),token,parent,location=location,normal_mode='planar')


def add_draped_panel(name, location, dimensions, token, parent, *, rotation=(0,0,0), hem_ratio=1, fold=.012):
    width,thickness,height=dimensions
    shape=draped_panel(width,height,thickness,hem_ratio=hem_ratio,fold=fold)
    return add_design_mesh(name,shape,token,parent,location=location,rotation=rotation)
