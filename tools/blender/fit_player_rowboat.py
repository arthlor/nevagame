"""Fit only the player's row/idle and boarding endpoints to the catalog rowboat.

Run in fresh background Blender after sample_rowboat_motion.mjs. Retains the
source surfaces, bind skeleton, skinning, and every unrelated action. Writes a
staged Blender library and mechanical report; the catalog CLI owns publication.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))
from common.humanoid_motion import Performer, bind_action, curves, ease, frame_set, sample_basis
from common.materials import get_or_create_material, hex_to_linear_rgba, MATERIAL_SPECS
from common.pipeline import create_root
from generators.boats import rowboat
from adapt_imported_humanoid import diagnose, fingerprint


def action_digest(action):
    return hashlib.sha256(json.dumps([(fc.data_path, fc.array_index,
        [(list(k.co), k.interpolation, list(k.handle_left), list(k.handle_right)) for k in fc.keyframe_points])
        for fc in curves(action)], sort_keys=True).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    output = args.output_dir.resolve()
    if not bpy.app.background or not output.is_relative_to(REPO / 'output'):
        raise ValueError('Use fresh background Blender and a repository output directory')
    output.mkdir(parents=True, exist_ok=True)
    catalog = json.loads((REPO / 'assets/specs/asset-catalog.json').read_text())
    spec = next(a for a in catalog['assets'] if a['id'] == 'char_player_a')
    boat_spec = next(a for a in catalog['assets'] if a['id'] == 'boat_rowboat_a')
    source = REPO / spec['parameters']['sourceBlend']
    source_digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if source_digest != spec['sourceProvenance']['sourceSha256']:
        raise ValueError('Player source changed before fitting')
    samples = json.loads((output / 'stroke-samples.json').read_text())
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30
    with bpy.data.libraries.load(str(source), link=False) as (_, requested):
        requested.collections = [spec['parameters']['sourceCollection']]
    collection = requested.collections[0]
    bpy.context.scene.collection.children.link(collection)
    rig = next(o for o in collection.all_objects if o.type == 'ARMATURE')
    meshes = [o for o in collection.all_objects if o.type == 'MESH']
    before_surfaces = {o.name: fingerprint(o) for o in meshes}
    before_bind = {b.name: [list(row) for row in b.matrix_local] for b in rig.data.bones}
    actions = {strip.action.name: strip.action for track in rig.animation_data.nla_tracks for strip in track.strips}
    edited = {'row', 'rowboat_idle', 'board', 'dock'}
    preserved = {name: action_digest(action) for name, action in actions.items() if name not in edited}
    neutral = sample_basis(rig, actions['idle'], 0)
    bind_action(rig, None)
    for bone in rig.pose.bones:
        bone.matrix_basis = neutral[bone.name]
    bpy.context.view_layer.update()
    performer = Performer(rig, spec['humanoidAuthoring']['heightMeters'])
    palms = {}
    for side in ('left', 'right'):
        marker = next(o for o in collection.all_objects if o.name == spec['humanoidRig']['grips'][side])
        palms[side] = performer.world('hand_' + side).inverted() @ marker.matrix_world
    root = create_root(boat_spec['rootNode'])
    rowboat(boat_spec, root)
    bpy.context.view_layer.update()
    seat = bpy.data.objects['boat_rowboat_rower_seat'].matrix_world.translation.copy()
    grips = {side: bpy.data.objects[f'boat_rowboat_oar_{side}_grip'].matrix_world.copy() for side in ('left', 'right')}
    locks = {side: bpy.data.objects[f'boat_rowboat_oarlock_{side}'].matrix_world.translation.copy() for side in grips}
    supports = {side: bpy.data.objects[f'boat_rowboat_foot_{side}_socket'].matrix_world.copy() for side in grips}
    conversion = Matrix.Rotation(math.pi / 2, 4, 'X')
    contact_errors = []

    def reset():
        for bone in rig.pose.bones:
            bone.matrix_basis = neutral[bone.name]
        bpy.context.view_layer.update()

    def fit_pose(phase, rotations=None):
        reset()
        body = performer.world('pelvis')
        body.translation = seat
        performer.set_world('pelvis', body)
        lean = .13 * math.cos(phase * math.tau) if rotations else .025
        performer.rotate('hips', (1, 0, 0), lean * .45)
        performer.rotate('spine', (1, 0, 0), lean * .55)
        for side in grips:
            sign = 1 if side == 'left' else -1
            metadata = spec['humanoidRig']['legs'][side]
            rest = performer.rest[spec['humanoidRig']['bones']['foot_' + side]]
            _, rotation, scale = rest.decompose()
            normal = (rotation @ Vector(metadata['soleNormal'])).normalized()
            wanted_normal = (supports[side].to_quaternion() @ Vector((0, 0, 1))).normalized()
            rotation = normal.rotation_difference(wanted_normal) @ rotation
            foot = Matrix.LocRotScale(Vector(), rotation, scale)
            foot.translation = supports[side].translation - foot.to_3x3() @ Vector(metadata['soleOffset'])
            performer.solve(side, foot.translation, seat + Vector((sign * .20, -.85, .20)), endpoint_matrix=foot)
            target = grips[side].copy()
            if rotations:
                values = rotations[side]
                gltf_rotation = Matrix([values[i::4] for i in range(4)])
                delta = conversion @ gltf_rotation @ conversion.inverted()
                target = Matrix.Translation(locks[side]) @ delta @ Matrix.Translation(-locks[side]) @ target
            wrist = target @ palms[side].inverted()
            pole = performer.point('upper_arm_' + side) + Vector((sign * .35, .35, -.35))
            performer.solve(side, wrist.translation, pole, arm=True, endpoint_matrix=wrist)
            performer.grip(side, 'handle', 1.)
            palm = performer.world('hand_' + side) @ palms[side]
            sole = performer.world('foot_' + side) @ Vector(metadata['soleOffset'])
            contact_errors.append({'phase': phase, 'side': side,
                'palmMeters': (palm.translation - target.translation).length,
                'soleMeters': (sole - supports[side].translation).length})

    clips = {c['name']: c for c in spec['animationClips']}
    prepared = {}
    for name in ('rowboat_idle', 'row'):
        duration = clips[name]['durationSeconds']
        frames = samples['frames'] if name == 'row' else [
            {'frame': frame, 'phase': frame / (duration * 30)}
            for frame in [*range(math.ceil(duration * 30)), duration * 30]]
        snapshots = []
        bind_action(rig, None)
        for sample in frames:
            if name == 'rowboat_idle' and snapshots:
                snapshots.append(snapshots[0])
                continue
            fit_pose(sample['phase'], sample.get('rotations'))
            snapshots.append({bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones})
        actions[name].name = name + '_before_rowboat_fit'
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        for key, value in actions[name].items(): action[key] = value
        bind_action(rig, action)
        for sample, basis in zip(frames, snapshots):
            frame_set(sample['frame'])
            for bone in rig.pose.bones:
                bone.matrix_basis = basis[bone.name]
                bone.rotation_mode = 'QUATERNION'
                for channel in ('location', 'rotation_quaternion', 'scale'):
                    bone.keyframe_insert(data_path=channel, frame=sample['frame'], group=bone.name)
        for fc in curves(action):
            for key in fc.keyframe_points: key.interpolation = 'LINEAR'
        prepared[name] = action

    terminal = sample_basis(rig, prepared['rowboat_idle'], 0)
    for name in ('board', 'dock'):
        action = actions[name]
        duration = clips[name]['durationSeconds']
        frames = sorted({float(k.co.x) for fc in curves(action) for k in fc.keyframe_points})
        snapshots = [(frame, sample_basis(rig, action, frame / 30)) for frame in frames]
        for frame, basis in snapshots:
            t = frame / (duration * 30)
            amount = ease((t - .8) / .2) if name == 'board' else 1 - ease(t / .2)
            if amount <= 0: continue
            bind_action(rig, None)
            for bone in rig.pose.bones:
                loc, rot, scale = basis[bone.name].decompose()
                target_loc, target_rot, target_scale = terminal[bone.name].decompose()
                bone.matrix_basis = Matrix.LocRotScale(loc.lerp(target_loc, amount), rot.slerp(target_rot, amount), scale.lerp(target_scale, amount))
            bpy.context.view_layer.update()
            for side in grips:
                foot = performer.world('foot_' + side)
                performer.solve(side, foot.translation, performer.point('thigh_' + side) + Vector((0, -1, 0)), endpoint_matrix=foot)
            basis = {bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones}
            bind_action(rig, action)
            for bone in rig.pose.bones:
                bone.matrix_basis = basis[bone.name]
                for channel in ('location', 'rotation_quaternion', 'scale'):
                    bone.keyframe_insert(data_path=channel, frame=frame, group=bone.name)
        prepared[name] = action
    for track in rig.animation_data.nla_tracks:
        for strip in track.strips:
            original = next((name for name, action in actions.items() if action == strip.action), None)
            if original in prepared:
                strip.action = prepared[original]
                if strip.action.slots: strip.action_slot = strip.action.slots[0]
    for name in ('row', 'rowboat_idle'):
        bpy.data.actions.remove(actions[name])

    # Source material regions, vertices, skinning and normals stay intact.
    original = json.loads((REPO / spec['humanoidAuthoring']['sourceFile']).read_text())
    source_parts = {node['name']: original['meshes'][node['mesh']] for node in original['nodes'] if 'mesh' in node}
    for obj in meshes:
        part = next(name for name in source_parts if f'_{name}_LOD' in obj.name)
        materials = [original['materials'][p['material']]['name'] for p in source_parts[part]['primitives']]
        if len(materials) != len(obj.data.materials): raise ValueError(f'{obj.name}: source material slots changed')
        tokens = [spec['humanoidAuthoring']['materialMap'][part + '/' + name] for name in materials]
        for index, token in enumerate(tokens): obj.data.materials[index] = get_or_create_material(token)
        color = obj.data.color_attributes['Color']
        for polygon in obj.data.polygons:
            rgba = hex_to_linear_rgba(MATERIAL_SPECS[tokens[polygon.material_index]]['hex'])
            for loop in polygon.loop_indices: color.data[loop].color = rgba
    assert before_surfaces == {o.name: fingerprint(o) for o in meshes}, 'Source topology or skinning changed'
    assert before_bind == {b.name: [list(row) for row in b.matrix_local] for b in rig.data.bones}, 'Bind skeleton changed'
    assert preserved == {name: action_digest(actions[name]) for name in preserved}, 'Unrelated action changed'
    diagnostic, _ = diagnose(rig, {lod: [o for o in meshes if lod in o.name] for lod in ('LOD0', 'LOD1')},
                             [*prepared.values(), actions['idle']], spec)
    report = {'sourceSha256': source_digest, 'motionOwner': samples['owner'], 'changedActions': list(prepared),
              'preservedActionCount': len(preserved), 'sourceGeometryAndBindUnchanged': True,
              'contacts': contact_errors, 'diagnostics': diagnostic}
    report['mechanicalPass'] = diagnostic['mechanicalPass'] and all(max(r['palmMeters'], r['soleMeters']) < .005 for r in contact_errors)
    (output / 'rowboat-fit.report.json').write_text(json.dumps(report, indent=2) + '\n')
    if not report['mechanicalPass']: raise ValueError('Rowboat fitting failed; see rowboat-fit.report.json')
    bind_action(rig, actions['idle']); rig.data.pose_position = 'POSE'; frame_set(0)
    bpy.data.libraries.write(str(output / 'char_player_a.blend'), {collection}, fake_user=True, compress=True)
    print('PLAYER_ROWBOAT_FIT_PASS', 'preserved actions', len(preserved),
          'max palm', max(r['palmMeters'] for r in contact_errors), 'max sole', max(r['soleMeters'] for r in contact_errors))


if __name__ == '__main__': main()
