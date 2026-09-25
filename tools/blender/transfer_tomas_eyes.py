"""Transfer Tomas's painted eyes in rest-space onto the retained player texture.

Run in a fresh Blender process. Writes a candidate library and report only; the
catalog importer owns validation and publication. Rig, UVs, topology and actions
are unchanged. The two projected eye rectangles are measured in metres on the
source surfaces, not dependent on a viewport or UV packing.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

ROOT = Path(__file__).resolve().parents[2]

def image_array(image):
    w, h = image.size
    pixels = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape(h, w, 4)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    out = ROOT / args.output_dir
    out.mkdir(parents=True, exist_ok=True)
    catalog = json.loads((ROOT / 'assets/specs/asset-catalog.json').read_text())
    spec = next(a for a in catalog['assets'] if a['id'] == 'char_player_a')
    with bpy.data.libraries.load(str(ROOT / spec['parameters']['sourceBlend']), link=False) as (_, dst):
        dst.collections = ['char_player_a']
    collection = dst.collections[0]
    bpy.context.scene.collection.children.link(collection)
    player = next(o for o in collection.all_objects if o.name == 'char_player_a_surface_LOD0')
    original_objects = set(bpy.data.objects)
    donor_path = ROOT / 'public/assets/models/char_npc_tomas_b.glb'
    bpy.ops.import_scene.gltf(filepath=str(donor_path))
    donor = next(o for o in bpy.data.objects if o not in original_objects and o.type == 'MESH' and o.name.startswith('tripo_node_'))
    donor.data.calc_loop_triangles()
    # Donor capture is one metre tall; uniform scale matches the 1.9m player.
    dv = [Vector((v.co.x * 1.9, v.co.y * 1.9, v.co.z * 1.9)) for v in donor.data.vertices]
    # Blender importer can keep mesh coordinates under a rotation, so use world coordinates.
    bpy.context.view_layer.update()
    dv = [(donor.matrix_world @ v.co) * 1.9 for v in donor.data.vertices]
    dt = list(donor.data.loop_triangles)
    bvh = BVHTree.FromPolygons(dv, [t.vertices for t in dt], all_triangles=True)
    donor_image = next(n.image for n in donor.data.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    source = image_array(donor_image)
    dh, dw = source.shape[:2]
    image = next(n.image for n in player.data.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    pixels = image_array(image)
    before = pixels.copy()
    h, w = pixels.shape[:2]
    player.data.calc_loop_triangles()
    uv = player.data.uv_layers.active.data
    # Measured from front projection: x in [-.18,.18], z in [1.49,1.87].
    to_world = lambda x, y: ((x / 384 - .5) * .36, 1.87 - y / 384 * .38)
    eyes = [(to_world(135, 214), to_world(134, 190)), (to_world(251, 214), to_world(247, 190))]
    radius_x, radius_z = .036, .031
    changed = set()
    for tri in player.data.loop_triangles:
        pos = [player.matrix_world @ player.data.vertices[i].co for i in tri.vertices]
        if min(p.z for p in pos) > 1.73 or max(p.z for p in pos) < 1.60 or min(p.y for p in pos) > 0: continue
        uvs = np.array([[uv[l].uv.x * w, uv[l].uv.y * h] for l in tri.loops])
        lo = np.maximum(0, np.floor(uvs.min(axis=0)).astype(int))
        hi = np.minimum([w-1, h-1], np.ceil(uvs.max(axis=0)).astype(int))
        a, b, c = uvs
        matrix = np.column_stack((b-a, c-a))
        if abs(np.linalg.det(matrix)) < 1e-8: continue
        inverse = np.linalg.inv(matrix)
        for y in range(lo[1], hi[1]+1):
            for x in range(lo[0], hi[0]+1):
                bc = inverse @ (np.array([x+.5,y+.5])-a)
                weights = [1-bc.sum(),bc[0],bc[1]]
                if min(weights) < -1e-5: continue
                p = sum((pos[i]*weights[i] for i in range(3)), Vector())
                for target, origin in eyes:
                    dx, dz = p.x-target[0], p.z-target[1]
                    q = ((dx/radius_x)**2+(dz/radius_z)**2)**.5
                    if q >= 1: continue
                    hit, _, idx, _ = bvh.ray_cast(Vector((origin[0]+dx,-5,origin[1]+dz)),Vector((0,1,0)))
                    if hit is None: raise RuntimeError('Missing eye projection')
                    t = dt[idx]
                    tc = [Vector((*donor.data.uv_layers.active.data[l].uv,0)) for l in t.loops]
                    tuv = barycentric_transform(hit,*[dv[v] for v in t.vertices],*tc)
                    color = source[min(dh-1,max(0,int(tuv.y*dh))),min(dw-1,max(0,int(tuv.x*dw)))].copy()
                    # Match the donor's surrounding skin to the player's warmer flat planes;
                    # preserve neutral whites, dark pupils, and the donor's highlights exactly.
                    saturation = float(color[:3].max()-color[:3].min())
                    skin = min(1,max(0,(saturation-.15)/.15)) * min(1,max(0,(float(color[0])-.35)/.25))
                    color[:3] = np.clip(color[:3]+skin*np.array([.025,.045,.035]),0,1)
                    alpha = min(1,max(0,(1-q)/.22)); alpha=alpha*alpha*(3-2*alpha)
                    pixels[y,x,:3] = before[y,x,:3]*(1-alpha)+color[:3]*alpha
                    changed.add((x,y))
    if len(changed) < 100: raise RuntimeError('No meaningful eye region transferred')
    replacement=bpy.data.images.new('char_player_tomas_eyes',width=w,height=h,alpha=True)
    replacement.pixels.foreach_set(pixels.ravel())
    replacement.filepath_raw=str(out/'char_player_tomas_eyes.png'); replacement.file_format='PNG'; replacement.save(); replacement.pack()
    for mat in {m for obj in collection.all_objects if obj.type=='MESH' for m in obj.data.materials}:
        for node in mat.node_tree.nodes:
            if node.type=='TEX_IMAGE' and node.image==image: node.image=replacement
    bpy.data.libraries.write(str(out/'char_player_a.blend'),{collection},fake_user=True,compress=True)
    report={'donor':str(donor_path.relative_to(ROOT)), 'donorSha256':hashlib.sha256(donor_path.read_bytes()).hexdigest(), 'changedTexturePixels':len(changed),'textureDimensions':[w,h], 'geometryChanged':False,'rigChanged':False,'animationsChanged':False,'sourceBlend':spec['parameters']['sourceBlend'],'sourceSha256':hashlib.sha256((ROOT/spec['parameters']['sourceBlend']).read_bytes()).hexdigest()}
    (out/'eye-transfer-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))

if __name__=='__main__': main()
