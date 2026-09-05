"""Prepare a catalog humanoid from original source geometry and timestamps.

Run only in fresh background Blender. This source-first preparation keeps the
original 62-bone bind rig, modular geometry, UVs, normals and skin weights. Only
one stature scale, palette remapping, role clothing and source-rig performances
are authored. The normal catalog generator owns validation and publication.
"""
from __future__ import annotations
import argparse, hashlib, json, math, re, statistics, sys
from collections import Counter
from pathlib import Path
import bpy
from mathutils import Matrix, Quaternion, Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
HERE=Path(__file__).resolve().parent; REPO=HERE.parents[1];sys.path.insert(0,str(HERE))
from common.materials import MATERIAL_SPECS,get_or_create_material,hex_to_linear_rgba
from common.humanoid_motion import SEMANTICS,author_actions,bind_action,frame_set,curves,source_node_defaults,TRANSITIONS
from common.humanoid_export import restore_solid_humanoid_colors


def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def bounds(meshes):
    points=[obj.matrix_world@v.co for obj in meshes for v in obj.data.vertices]
    return Vector([min(v[i] for v in points) for i in range(3)]),Vector([max(v[i] for v in points) for i in range(3)])
def weights(obj):return [[(obj.vertex_groups[g.group].name,round(g.weight,9)) for g in v.groups] for v in obj.data.vertices]
def fingerprint(obj):
    obj.data.calc_loop_triangles()
    return {'vertices':len(obj.data.vertices),'triangles':len(obj.data.loop_triangles),'smoothPolygons':sum(p.use_smooth for p in obj.data.polygons),'customNormals':obj.data.has_custom_normals,'uvLayers':len(obj.data.uv_layers),'materialRegionSha256':hashlib.sha256(json.dumps([p.material_index for p in obj.data.polygons]).encode()).hexdigest(),'weightSha256':hashlib.sha256(json.dumps(weights(obj)).encode()).hexdigest()}
def empty(name,col,parent=None):
    obj=bpy.data.objects.new(name,None);col.objects.link(obj);obj.parent=parent;return obj


def remap_materials(obj,spec):
    source=[];mapping={};indices=[p.material_index for p in obj.data.polygons]
    for material in obj.data.materials:
        key=obj.name.split('.')[0]+'/'+material.name.split('.')[0]
        token=spec['humanoidAuthoring']['materialMap'].get(key)
        if token is None:raise ValueError(f'Unmapped source material region: {key}')
        if token not in spec['palette']:raise ValueError(f'Source material region {key} selects token outside catalog palette')
        source.append(token);mapping[key]=token
    obj.data.materials.clear()
    for token in source:obj.data.materials.append(get_or_create_material(token))
    for poly,index in zip(obj.data.polygons,indices):poly.material_index=index
    existing=obj.data.color_attributes.get('Color')
    if existing:obj.data.color_attributes.remove(existing)
    colors=obj.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
    for poly in obj.data.polygons:
        rgba=hex_to_linear_rgba(MATERIAL_SPECS[source[poly.material_index]]['hex'])
        for i in poly.loop_indices:colors.data[i].color=rgba
    obj.data.color_attributes.active_color_index=len(obj.data.color_attributes)-1
    obj.data.color_attributes.render_color_index=len(obj.data.color_attributes)-1
    return mapping


def source_meshes(rig):return [o for o in bpy.context.scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' and m.object==rig for m in o.modifiers)]


def remove_source_degenerate_faces(obj,uniform_scale):
    old=obj.data;removed=[p for p in old.polygons if p.area<1e-8]
    if not removed:return []
    if old.shape_keys:raise ValueError('Source morph targets require explicit topology-preserving cleanup')
    removed_ids={p.index for p in removed};retained=[p for p in old.polygons if p.index not in removed_ids]
    records=[{'part':obj.name.split('.')[0],'triangleIndex':p.index,'areaMetersSquared':p.area/(uniform_scale*uniform_scale)} for p in removed]
    skin=weights(obj);group_names=[group.name for group in obj.vertex_groups];normals=[old.corner_normals[i].vector.copy() for p in retained for i in p.loop_indices]
    data=bpy.data.meshes.new(old.name+'_clean');data.from_pydata([v.co for v in old.vertices],[],[list(p.vertices) for p in retained]);data.update()
    for material in old.materials:data.materials.append(material)
    for new,prior in zip(data.polygons,retained):new.material_index=prior.material_index;new.use_smooth=prior.use_smooth
    for layer in old.uv_layers:
        uv=data.uv_layers.new(name=layer.name);values=[layer.data[i].uv.copy() for p in retained for i in p.loop_indices]
        for item,value in zip(uv.data,values):item.uv=value
    data.normals_split_custom_set(normals);obj.data=data
    for name in group_names:
        if obj.vertex_groups.get(name) is None:obj.vertex_groups.new(name=name)
    for index,influences in enumerate(skin):
        for name,weight in influences:obj.vertex_groups[name].add([index],weight,'REPLACE')
    bpy.data.meshes.remove(old)
    return records

def tied_hair_accessories(meshes,rig,spec,col):
    """Gather the retained bob into a small half-up tie without replacing it."""
    style=spec['humanoidAuthoring'].get('hairStyle')
    if style is None:return []
    if style['style']!='half_up_bun':raise ValueError('Unsupported source hair accessory style')
    u=spec['humanoidAuthoring']['heightMeters']/1.9
    points=[];triangles=[]
    for obj in meshes:
        obj.data.calc_loop_triangles();offset=len(points)
        points.extend(obj.matrix_world@v.co for v in obj.data.vertices)
        triangles.extend(tuple(offset+i for i in tri.vertices) for tri in obj.data.loop_triangles
                         if obj.data.materials[tri.material_index].name==style['hairToken'])
    if not triangles:raise ValueError('Tied hair requires a retained, explicitly mapped hair surface')
    hair=[points[i] for triangle in triangles for i in triangle]
    height=max(p.z for p in hair)-.09*u
    center_x=(min(p.x for p in hair)+max(p.x for p in hair))/2
    surface=BVHTree.FromPolygons(points,triangles,all_triangles=True)
    base,_,_,_=surface.ray_cast(Vector((center_x,2*u,height)),Vector((0,-1,0)))
    if base is None:raise ValueError('Half-up tie misses the back of the retained hair')
    # Embed the short gathered neck in the existing bob; the restrained bun
    # then projects behind the skull while staying below its original crown.
    base.y-=.006*u
    def head_bound(name,vertices,faces,token):
        if token not in spec['humanoidAuthoring']['accessoryPalette']:raise ValueError('Hair token missing from explicit accessory palette')
        data=bpy.data.meshes.new(spec['id']+'_'+name+'_mesh');data.from_pydata(vertices,[],faces);data.update()
        obj=bpy.data.objects.new(spec['id']+'_'+name+'_LOD0',data);col.objects.link(obj);data.materials.append(get_or_create_material(token))
        uv=data.uv_layers.new(name='UVMap');colors=data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
        for loop in data.loops:
            point=data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=((point.x-base.x)/u+.5,(point.z-base.z)/u+.5)
            colors.data[loop.index].color=hex_to_linear_rgba(MATERIAL_SPECS[token]['hex'])
        group=obj.vertex_groups.new(name='Head');group.add(list(range(len(vertices))),1,'REPLACE')
        mod=obj.modifiers.new('SourceRig','ARMATURE');mod.object=rig
        return obj
    bun=[];segments=8
    profile=[(0,.027,.030,0),(.016,.027,.030,0),(.039,.053,.048,.007),(.063,.043,.039,.014),(.077,.017,.018,.016)]
    for depth,width,rise,lift in profile:
        for i in range(segments):
            angle=math.tau*i/segments
            bun.append(base+Vector((math.cos(angle)*width,depth,math.sin(angle)*rise+lift))*u)
    faces=[tuple(range(segments-1,-1,-1)),tuple(range((len(profile)-1)*segments,len(profile)*segments))]
    faces.extend((row*segments+i,row*segments+(i+1)%segments,(row+1)*segments+(i+1)%segments,(row+1)*segments+i)
                 for row in range(len(profile)-1) for i in range(segments))
    faces=[tuple(reversed(face)) for face in faces]
    # The tie is a narrow cloth band around the gathered neck, not a floating
    # ornament. Its square section remains readable at the gameplay camera.
    tie=[]
    for depth,radius in ((.004,.034),(.012,.034),(.012,.029),(.004,.029)):
        for i in range(segments):
            angle=math.tau*i/segments
            tie.append(base+Vector((math.cos(angle)*radius,depth,math.sin(angle)*radius))*u)
    tie_faces=[(ring*segments+i,ring*segments+(i+1)%segments,((ring+1)%4)*segments+(i+1)%segments,((ring+1)%4)*segments+i)
               for ring in range(4) for i in range(segments)]
    tie_faces=[tuple(reversed(face)) for face in tie_faces]
    return [head_bound('half_up_bun',bun,faces,style['hairToken']),head_bound('hair_tie',tie,tie_faces,style['tieToken'])]


def role_accessories(meshes,rig,spec,col):
    """Small clothing panels use source weights; anatomy is never reconstructed."""
    bpy.context.view_layer.update()
    role=spec['humanoidAuthoring']['role'];u=spec['humanoidAuthoring']['heightMeters']/1.9
    extras=tied_hair_accessories(meshes,rig,spec,col)
    if role=='dockmaster':
        head=rig.matrix_world@rig.data.bones['Head'].head_local
        points=[]
        for z,width,depth in [(.075,.095,.045),(-.035,.088,.065),(-.095,.040,.025)]:
            for i in range(8):
                angle=i*math.tau/8;points.append(head+Vector((math.cos(angle)*width,-.12+math.sin(angle)*depth,z))*u)
        faces=[tuple(range(7,-1,-1)),tuple(range(16,24))]
        for ring in range(2):
            for i in range(8):faces.append((ring*8+i,ring*8+(i+1)%8,(ring+1)*8+(i+1)%8,(ring+1)*8+i))
        data=bpy.data.meshes.new(spec['id']+'_beard_mesh');data.from_pydata(points,[],faces);data.update()
        obj=bpy.data.objects.new(spec['id']+'_beard_LOD0',data);col.objects.link(obj);data.materials.append(get_or_create_material('hair_silver_01'))
        uv=data.uv_layers.new(name='UVMap');colors=data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
        for loop in data.loops:colors.data[loop.index].color=hex_to_linear_rgba(MATERIAL_SPECS['hair_silver_01']['hex']);v=data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(v.x/u+.5,v.z/u)
        group=obj.vertex_groups.new(name='Head');group.add(list(range(len(points))),1,'REPLACE');mod=obj.modifiers.new('SourceRig','ARMATURE');mod.object=rig
        return extras+[obj]
    if role not in ('gardener','market_keeper','handyman'):return extras
    # Fit the whole panel, including its centre, to the original torso AND
    # trousers. Edge-only samples made a flat chord through the waist/thighs.
    supports=[obj for obj in meshes if any(part in obj.name for part in ('Body','Legs','Pants'))]
    source_points=[];source_weights=[];source_faces=[]
    for obj in supports:
        offset=len(source_points);obj.data.calc_loop_triangles()
        source_points.extend(obj.matrix_world@v.co for v in obj.data.vertices)
        source_weights.extend(weights(obj))
        source_faces.extend(tuple(offset+i for i in tri.vertices) for tri in obj.data.loop_triangles)
    surface=BVHTree.FromPolygons(source_points,source_faces,all_triangles=True)
    def interpolate_weights(indices,factors):
        combined=Counter()
        for index,factor in zip(indices,factors):
            for name,weight in source_weights[index]:combined[name]+=weight*max(0.,factor)
        values=sorted(combined.items(),key=lambda item:(-item[1],item[0]))[:4]
        total=sum(weight for _,weight in values)
        if total<=0:raise ValueError('Apron surface sample has no source skin weights')
        return [(name,weight/total) for name,weight in values]
    def sample(x,height):
        hit,_,face,_=surface.ray_cast(Vector((x,-2*u,height)),Vector((0,1,0)))
        if hit is None:return None
        indices=source_faces[face];a,b,c=[source_points[i] for i in indices]
        ab=b-a;ac=c-a;ap=hit-a;denom=ab.length_squared*ac.length_squared-ab.dot(ac)**2
        v=(ac.length_squared*ap.dot(ab)-ab.dot(ac)*ap.dot(ac))/denom
        w=(ab.length_squared*ap.dot(ac)-ab.dot(ac)*ap.dot(ab))/denom
        return hit.y,interpolate_weights(indices,(1-v-w,v,w))
    material='cloth_teal_01' if role=='market_keeper' else 'canvas_cream_01'
    # Leave the retained native thumb swing clear at the hip. The lower hem
    # flares modestly beneath that sweep, while the bib stays torso-width.
    outline=[(.76,.14),(.91,.115),(1.07,.13),(1.26,.125)]
    rows=[]
    for (low,lw),(high,hw) in zip(outline,outline[1:]):
        steps=math.ceil((high-low)/.045)
        rows.extend((low+(high-low)*i/steps,lw+(hw-lw)*i/steps) for i in range(steps))
    rows.append(outline[-1]);columns=9
    clearance_profile=spec['humanoidAuthoring'].get('apronClearanceProfile',[])
    if any(a['heightMeters']>=b['heightMeters'] for a,b in zip(clearance_profile,clearance_profile[1:])):
        raise ValueError('Apron clearance profile heights must increase')
    def authored_ease(height):
        # Source jackets can have a projecting lower hem. The catalog owns
        # any local tailoring allowance; source skin and motions stay intact.
        for low,high in zip(clearance_profile,clearance_profile[1:]):
            if low['heightMeters']<=height<=high['heightMeters']:
                fraction=(height-low['heightMeters'])/(high['heightMeters']-low['heightMeters'])
                return low['additionalForwardMeters']+(high['additionalForwardMeters']-low['additionalForwardMeters'])*fraction
        return 0.
    points=[];influences=[]
    for height,width in rows:
        xs=[width*u*(2*i/(columns-1)-1) for i in range(columns)]
        hull=[]
        for i in range(81):
            x=width*u*(2*i/80-1);value=sample(x,height*u)
            if value is None:continue
            point=(x,*value)
            # Cloth spans the recessed crotch and trouser creases. A literal
            # front ray at x=0 otherwise wraps the apron into those grooves.
            while len(hull)>1:
                a,b=hull[-2:]
                cross=(b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0])
                if cross>1e-10:break
                hull.pop()
            hull.append(point)
        if not hull:raise ValueError('Apron row misses source torso/trouser envelope')
        for x in xs:
            a=max((point for point in hull if point[0]<=x),key=lambda point:point[0],default=hull[0])
            b=min((point for point in hull if point[0]>=x),key=lambda point:point[0],default=hull[-1])
            blend=0 if a[0]==b[0] else (x-a[0])/(b[0]-a[0])
            combined=Counter()
            for point,factor in ((a,1-blend),(b,blend)):
                for name,weight in point[2]:combined[name]+=weight*factor
            groups=sorted(combined.items(),key=lambda item:(-item[1],item[0]))[:4];total=sum(w for _,w in groups)
            y=a[1]+(b[1]-a[1])*blend;groups=[(n,w/total) for n,w in groups]
            # An apron hangs across the front; it does not turn around the
            # thigh sides into the native arm swing. Keep only a shallow bow.
            y=min(y,min(point[1] for point in hull)+.02*u)
            # Blended left/right thigh weights shorten the hanging center
            # during a step. A small hem flare clears that measured envelope
            # without moving the whole bib or changing the native stride.
            hem_flare=.018*max(0,min(1,(1.07-height)/.31))
            points.append(Vector((x,y-(.018+hem_flare)*u-authored_ease(height*u),height*u)));influences.append(groups)
    front_count=len(points);points += [p+Vector((0,.004*u,0)) for p in points];influences += list(influences)
    faces=[(row*columns+column,row*columns+column+1,(row+1)*columns+column+1,(row+1)*columns+column)
           for row in range(len(rows)-1) for column in range(columns-1)]
    faces += [tuple(front_count+j for j in reversed(face)) for face in list(faces)]
    edge=[*range(columns),*(row*columns+columns-1 for row in range(1,len(rows))),
          *range(front_count-2,front_count-columns-1,-1),*(row*columns for row in range(len(rows)-2,0,-1))]
    faces += [(a,a+front_count,b+front_count,b) for a,b in zip(edge,edge[1:]+edge[:1])]
    data=bpy.data.meshes.new(spec['id']+'_apron_mesh');data.from_pydata(points,[],faces);data.update()
    obj=bpy.data.objects.new(spec['id']+'_apron_LOD0',data);col.objects.link(obj)
    data.materials.append(get_or_create_material(material));uv=data.uv_layers.new(name='UVMap');colors=data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
    for poly in data.polygons:
        for loop in poly.loop_indices:colors.data[loop].color=hex_to_linear_rgba(MATERIAL_SPECS[material]['hex']);v=data.vertices[data.loops[loop].vertex_index].co;uv.data[loop].uv=(v.x/u+.5,v.z/u)
    for name in rig.data.bones:obj.vertex_groups.new(name=name.name)
    for index,groups in enumerate(influences):
        for name,weight in groups:obj.vertex_groups[name].add([index],weight,'REPLACE')
    mod=obj.modifiers.new('SourceRig','ARMATURE');mod.object=rig
    return extras+[obj]


def make_lod(meshes,col,root):
    results=[]
    for source in meshes:
        obj=source.copy();obj.data=source.data.copy();obj.name=source.name.replace('LOD0','LOD1');col.objects.link(obj);obj.parent=root
        mods=[m for m in obj.modifiers if m.type=='ARMATURE']
        for m in mods:m.show_viewport=False
        # The small fitted apron grid carries the evaluated garment clearance.
        # Collapsing its cross-thigh spans cuts through the retained walk pose.
        if len(obj.data.polygons)>40 and '_apron_' not in obj.name:
            # glTF corner splits are shading data, not geometric boundaries.
            # Weld coincident source corners before reduction so the decimator
            # cannot turn a closed source garment into disconnected holes.
            weld=obj.modifiers.new('CornerTopologyWeld','WELD');weld.merge_threshold=.000001
            bpy.context.view_layer.objects.active=obj;bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.ops.object.modifier_apply(modifier=weld.name)
            dec=obj.modifiers.new('LODReduction','DECIMATE');dec.ratio=.44;dec.use_collapse_triangulate=True
            bpy.context.view_layer.objects.active=obj;bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.ops.object.modifier_apply(modifier=dec.name)
        for m in mods:m.show_viewport=True
        # Preserve source groups; normalized interpolation protects four-weight
        # glTF influence limits after simplification, never on the LOD0 source.
        for v in obj.data.vertices:
            values=sorted([(g.group,g.weight) for g in v.groups if g.weight>1e-8],key=lambda p:-p[1])[:4];total=sum(w for _,w in values)
            if not total:raise ValueError('Unweighted LOD vertex')
            for group in obj.vertex_groups:group.remove([v.index])
            for index,w in values:obj.vertex_groups[index].add([v.index],w/total,'REPLACE')
        color=obj.data.color_attributes['Color']
        for p in obj.data.polygons:
            rgba=hex_to_linear_rgba(MATERIAL_SPECS[obj.data.materials[p.material_index].name]['hex'])
            for loop in p.loop_indices:color.data[loop].color=rgba
        results.append(obj)
    return results


def seam_candidates(meshes, boundary_only=False):
    boundaries={}
    for obj in meshes:
        positions=[tuple(round(c,5) for c in v.co) for v in obj.data.vertices]
        edges=Counter()
        for p in obj.data.polygons:
            vertices=list(p.vertices)
            for a,b in zip(vertices,vertices[1:]+vertices[:1]):edges[tuple(sorted((positions[a],positions[b])))]+=1
        open_positions={p for edge,count in edges.items() if count==1 for p in edge}
        boundaries[obj.name]={i for i,p in enumerate(positions) if p in open_positions}
    vertices=[(o.name,v.index,o.matrix_world@v.co) for o in meshes for v in o.data.vertices]
    tree=KDTree(len(vertices))
    for i,(_,_,p) in enumerate(vertices):tree.insert(p,i)
    tree.balance();pairs=[]
    for i,(name,index,p) in enumerate(vertices):
        for _,j,d in tree.find_range(p,.008):
            other,vi,_=vertices[j]
            if j>i and other!=name and (not boundary_only or index in boundaries[name] or vi in boundaries[other]):pairs.append((name,index,other,vi,d))
    return pairs


def apron_intersections(meshes,samples):
    """Actual deformed triangle intersections, not projected arm occlusion."""
    aprons=[obj for obj in meshes if '_apron_' in obj.name]
    if not aprons:return 0
    surfaces=[obj for obj in meshes if any(part in obj.name for part in ('Body','Legs','Pants'))]
    def tree(obj):
        obj.data.calc_loop_triangles()
        return BVHTree.FromPolygons(samples[obj.name],[tuple(t.vertices) for t in obj.data.loop_triangles],all_triangles=True)
    bodies=[tree(obj) for obj in surfaces]
    return sum(len(tree(apron).overlap(body)) for apron in aprons for body in bodies)


def diagnose(rig,lods,actions,spec):
    pairs={lod:seam_candidates(meshes, boundary_only=True) for lod,meshes in lods.items()}
    nearby_pairs={lod:seam_candidates(meshes) for lod,meshes in lods.items()}
    rest_lengths={b.name:(rig.matrix_world@b.head_local-rig.matrix_world@b.parent.head_local).length for b in rig.data.bones if b.parent and b.name not in ('Body','Root','Hips','Foot.L','Foot.R','PT.L','PT.R','Shoulder.L','Shoulder.R')}
    contact_local={}
    for side in ('left','right'):
        bone=rig.data.bones[SEMANTICS['foot_'+side]];inv=(rig.matrix_world@bone.matrix_local).inverted();points=[]
        for obj in lods['LOD0']:
            for v in obj.data.vertices:
                if any(obj.vertex_groups[g.group].name==bone.name and g.weight>.8 for g in v.groups):points.append(inv@(obj.matrix_world@v.co))
        if not points:raise ValueError(f'No weighted source sole vertices for {side}')
        contact_local[side]=points
    rig.data.pose_position='POSE';rows=[];contacts={};failures=[];reference_speeds={}
    for action in actions:
        bind_action(rig,action);start,end=map(float,action.frame_range)
        frames=sorted(set([start,end]+[float(i) for i in range(math.ceil(start),math.floor(end)+1)]+[float(k.co.x) for fc in curves(action) for k in fc.keyframe_points]))
        max_gap={lod:0. for lod in lods};max_nearby={lod:0. for lod in lods};apron_pairs={lod:0 for lod in lods};max_length=0.;finite=True;first={};loop_error={lod:0. for lod in lods};sole={'left':[],'right':[]};foot_positions={'left':[],'right':[]}
        for n,frame in enumerate(frames):
            frame_set(frame)
            for bone,length in rest_lengths.items():
                pb=rig.pose.bones[bone];actual=(rig.matrix_world@pb.matrix.translation-rig.matrix_world@pb.parent.matrix.translation).length
                max_length=max(max_length,abs(actual-length))
            for side,points in contact_local.items():
                mat=rig.matrix_world@rig.pose.bones[SEMANTICS['foot_'+side]].matrix
                sole[side].append(min((mat@p).z for p in points))
                foot_positions[side].append(mat.translation.copy())
            deps=bpy.context.evaluated_depsgraph_get()
            for lod,meshes in lods.items():
                samples={}
                for obj in meshes:
                    evaluated=obj.evaluated_get(deps);data=evaluated.to_mesh()
                    samples[obj.name]=[evaluated.matrix_world@v.co for v in data.vertices];evaluated.to_mesh_clear()
                finite=finite and all(math.isfinite(c) for pts in samples.values() for p in pts for c in p)
                max_gap[lod]=max(max_gap[lod],max(((samples[a][i]-samples[b][j]).length-d for a,i,b,j,d in pairs[lod]),default=0.))
                max_nearby[lod]=max(max_nearby[lod],max(((samples[a][i]-samples[b][j]).length-d for a,i,b,j,d in nearby_pairs[lod]),default=0.))
                apron_pairs[lod]=max(apron_pairs[lod],apron_intersections(meshes,samples))
                if n==0:first[lod]=samples
                if n==len(frames)-1:loop_error[lod]=max(((p-first[lod][name][i]).length for name,pts in samples.items() for i,p in enumerate(pts)),default=0.)
        clip=next(c for c in [*spec['animationClips'],*spec.get('additionalAnimationClips',[])] if c['name']==action.name)
        supported=not (action.name=='fall' or action.name.startswith('mounted_') or action.name in ('rowboat_idle','row','skiff_idle','skiff_drive','mount','mount_right','dismount','dismount_right','board','dock','board_skiff','dock_skiff'))
        intervals={};stance_speeds=[]
        locomotion=action.name in ('walk','run','carry_walk','carry_run')
        for side,heights in sole.items():
            threshold=min(heights)+.018
            if locomotion:
                points=foot_positions[side];velocities=[]
                for i,p in enumerate(points):
                    a=max(0,i-1);b=min(len(points)-1,i+1)
                    velocities.append((points[b].y-points[a].y)/max(1e-6,(frames[b]-frames[a])/30))
                ankle_floor=min(p.z for p in points)
                # Backwards foot travel is the planted phase of an in-place
                # source gait; the forward recovery arc never claims contact.
                active=[v>.1 and p.z<=ankle_floor+.10 for v,p in zip(velocities,points)]
                for i in range(1,len(active)-1):
                    if active[i-1] and active[i+1]:active[i]=True
                stance_speeds.extend(v for v,on in zip(velocities,active) if on and v>.1)
            else:active=[supported and h<=threshold for h in heights]
            ranges=[];begin=None
            for i,on in enumerate(active):
                if on and begin is None:begin=frames[max(0,i-1)]/30 if i else frames[0]/30
                if begin is not None and (not on or i==len(active)-1):
                    endtime=frames[i]/30
                    if endtime>begin:ranges.append({'start':round(begin,6),'end':round(endtime,6)})
                    begin=None
            intervals[side]=ranges
        contacts[action.name]=intervals
        if locomotion:
            if not stance_speeds:raise ValueError(f'No backwards-travel stance samples for {action.name}')
            reference_speeds[action.name]=round(statistics.median(stance_speeds),6)
            action['neva_reference_speed_meters_per_second']=reference_speeds[action.name]
        passed=finite and max(max_gap.values())<=.02 and max_length<=.003 and max(apron_pairs.values())==0 and (not clip['loop'] or max(loop_error.values())<=.006)
        row={'name':action.name,'kind':clip['motionSource']['kind'],'sourceTimebase':'seconds','sampleCount':len(frames),'finite':finite,'maxBoneLengthErrorMeters':max_length,'maxSeamGrowthMeters':max_gap,'nearbyClosedSurfacePairGrowthMeters':max_nearby,'apronPenetratingTrianglePairs':apron_pairs,'loopSurfaceErrorMeters':loop_error,'mechanicalPass':passed,'contacts':intervals,'measuredReferenceSpeedMetersPerSecond':reference_speeds.get(action.name)}
        rows.append(row)
        if not passed:failures.append(action.name)
    rig.data.pose_position='REST';bind_action(rig,next(a for a in actions if a.name=='idle'));frame_set(0)
    return {'allFrameDeformation':rows,'seamCandidateCounts':{lod:len(p) for lod,p in pairs.items()},'nearbyClosedSurfacePairCounts':{lod:len(p) for lod,p in nearby_pairs.items()},'closedSurfaceAttachmentReview':'PENDING: fixed nearby vertex distances are retained as diagnostics, not open-seam measurements; source clothing uses closed overlapping volumes.','referenceSpeeds':reference_speeds,'failedClips':failures,'mechanicalPass':not failures},contacts


def measured_events(clip,contacts):
    events=[dict(event) for event in clip.get('events',[])]
    for side in ('left','right'):
        intervals=contacts[side]
        if not intervals:continue
        wrap=len(intervals)>1 and intervals[0]['start']==0 and abs(intervals[-1]['end']-clip['durationSeconds'])<1e-5
        onset=intervals[-1]['start'] if wrap else intervals[0]['start']
        for event in events:
            if event['name']=='footstep_'+side:event['timeSeconds']=onset
    return events


def action_checklist(spec,motions,diagnostic,contacts):
    """One catalog-derived row per action; unobserved gates stay explicit."""
    measured={row['name']:row for row in diagnostic['allFrameDeformation']}
    origins={row['name']:row for row in motions};rows=[]
    for clip in [*spec['animationClips'],*spec.get('additionalAnimationClips',[])]:
        name=clip['name'];equipment=[]
        if name.startswith('carry_') or name in ('pickup','place'):equipment=['cargo cradle: both palm grips']
        if name in ('cast','hookset','fishing_idle','reel','slack','brace','skiff_fishing'):equipment=['fishing rod: right primary grip, left reel grip']
        if name=='water':equipment=['watering can: right primary grip']
        if name=='harvest':equipment=['sickle: right primary grip']
        if name=='workstation':equipment=['workstation scoop: right primary grip']
        if name in ('rowboat_idle','row','board','dock'):equipment+=['rowboat seat and footrests','paired oar grips' if name=='row' else 'hands released']
        if name in ('skiff_idle','skiff_drive','skiff_fishing','board_skiff','dock_skiff'):equipment+=['skiff standing deck','right helm grip' if name=='skiff_drive' else 'helm released']
        if name.startswith('mounted_') or name in ('mount','mount_right','dismount','dismount_right'):equipment+=['donkey saddle and stirrups']
        transition=TRANSITIONS.get(name)
        rows.append({'name':name,'origin':origins[name],'durationSeconds':clip['durationSeconds'],'loop':clip['loop'],'contacts':contacts[name],'commitMarkerSeconds':clip.get('commitMarkerSeconds'),'events':measured_events(clip,contacts[name]),'referenceSpeedMetersPerSecond':diagnostic['referenceSpeeds'].get(name,clip.get('referenceSpeedMetersPerSecond')),'equipment':equipment,'transitionRules':{'sourcePose':transition[0] if transition else None,'terminalPose':transition[1] if transition else None,'endpointBlendFraction':.2 if transition else None,'loopClosureWindowSeconds':origins[name]['loopClosureWindowSeconds']},'mechanical':{'status':'PASS' if measured[name]['mechanicalPass'] else 'FAIL','evidence':measured[name]},'sourceFidelity':{'status':'PENDING_INDEPENDENT_COMPARISON','report':spec['id']+'.fidelity.json'},'runtime':{'status':'PENDING_OBSERVATION'},'humanReview':{'status':'PENDING_GAME_REVIEW'}})
    return rows


def export_collection(path,root,col):
    for obj in col.all_objects:
        if obj.type=='ARMATURE':obj.data.pose_position='POSE'
    bpy.ops.object.select_all(action='DESELECT')
    for obj in col.all_objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_cameras=False,export_lights=False,export_extras=True,export_materials='EXPORT',export_texcoords=True,export_normals=True,export_attributes=True,export_all_vertex_colors=True,export_vertex_color='ACTIVE',export_skins=True,export_all_influences=False,export_influence_nb=4,export_animations=True,export_animation_mode='ACTIONS',export_merge_animation='ACTION',export_force_sampling=False,export_optimize_animation_size=True,export_anim_slide_to_zero=True,export_frame_step=1,export_morph=False,export_apply=False,export_rest_position_armature=True,export_meshopt_compression_enable=False,check_existing=False)


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--asset',required=True);parser.add_argument('--output-dir',type=Path,required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);out=args.output_dir.resolve()
    if not bpy.app.background:raise RuntimeError('Fresh background Blender required')
    if not out.is_relative_to(REPO/'output'):raise ValueError('Preparation stays in repository output staging')
    out.mkdir(parents=True,exist_ok=True)
    spec=next(a for a in json.loads((REPO/'assets/specs/asset-catalog.json').read_text())['assets'] if a['id']==args.asset);authoring=spec['humanoidAuthoring'];source=REPO/authoring['sourceFile']
    if sha(source)!=authoring['sourceSha256']:raise ValueError('Original source checksum mismatch')
    bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.render.fps=30;scene.render.fps_base=1
    bpy.ops.import_scene.gltf(filepath=str(source));rig=next(o for o in scene.objects if o.type=='ARMATURE')
    source_defaults=source_node_defaults(rig,source)
    bind_action(rig,None);rig.data.pose_position='REST';meshes=source_meshes(rig)
    if len(rig.data.bones)!=62:raise ValueError('Expected original complete 62-joint source rig')
    if authoring.get('headSourceFile'):
        if sha(REPO/authoring['headSourceFile'])!=authoring['headSourceSha256']:raise ValueError('Original modular head checksum mismatch')
        old=set(scene.objects);actions=set(bpy.data.actions);bpy.ops.import_scene.gltf(filepath=str(REPO/authoring['headSourceFile']))
        donor=next(o for o in set(scene.objects)-old if o.type=='ARMATURE');head=next(o for o in source_meshes(donor) if 'Head' in o.name)
        if any(max(abs(rig.data.bones[b.name].matrix_local[i][j]-b.matrix_local[i][j]) for i in range(4) for j in range(4))>1e-5 for b in donor.data.bones):raise ValueError('Modular head has incompatible bind skeleton')
        for obj in [o for o in meshes if 'Head' in o.name]:meshes.remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
        world=head.matrix_world.copy();head.parent=rig;head.matrix_world=world
        for mod in head.modifiers:
            if mod.type=='ARMATURE':mod.object=rig
        meshes.append(head)
        for obj in set(scene.objects)-old-{head}:bpy.data.objects.remove(obj,do_unlink=True)
        for action in set(bpy.data.actions)-actions:bpy.data.actions.remove(action)
    for obj in list(meshes):
        if obj.name in authoring.get('omitParts',[]):meshes.remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
    before={o.name:fingerprint(o) for o in meshes};source_names={o:o.name for o in meshes};low,high=bounds(meshes);scale=authoring['heightMeters']/(high.z-low.z)
    normalize=Matrix.Scale(scale,4)@Matrix.Translation(Vector((-(low.x+high.x)/2,0,-low.z)))
    original_bind={b.name:[list(row) for row in b.matrix_local] for b in rig.data.bones}
    rig_world=normalize@rig.matrix_world
    col=bpy.data.collections.new(args.asset);scene.collection.children.link(col);root=empty(spec['rootNode'],col);root['neva_asset_root']=True;lodroots={i:empty(f'{args.asset}_LOD{i}',col,root) for i in (0,1)}
    mapping={};cleanup=[]
    for index,obj in enumerate(meshes):
        mat=normalize@obj.matrix_world;obj.data.transform(mat);obj.data.update();obj.parent=lodroots[0];obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=Matrix.Identity(4)
        cleanup.extend(remove_source_degenerate_faces(obj,scale))
        mapping.update(remap_materials(obj,spec));obj.name=f'{args.asset}_{re.sub("[^A-Za-z0-9_]","_",source_names[obj])}_LOD0'
        for existing in list(obj.users_collection):existing.objects.unlink(obj)
        col.objects.link(obj)
    rig.parent=root;rig.matrix_world=rig_world;rig.name=spec['rigNode'];rig.data.name=rig.name+'_skeleton'
    for existing in list(rig.users_collection):existing.objects.unlink(rig)
    col.objects.link(rig)
    for obj in list(scene.objects):
        if obj not in {root,rig,*meshes,*lodroots.values()}:bpy.data.objects.remove(obj,do_unlink=True)
    for pose in rig.pose.bones:pose.custom_shape=None
    after={source_names[o]:fingerprint(o) for o in meshes}
    for name in before:
        removed_count=sum(r['part']==name.split('.')[0] for r in cleanup)
        compared=['vertices','customNormals','uvLayers','weightSha256'] if removed_count else list(before[name])
        if any(before[name][key]!=after[name][key] for key in compared) or before[name]['triangles']-after[name]['triangles']!=removed_count:raise ValueError(f'Source surface/skin contract changed outside declared cleanup: {name}')
    extras=role_accessories(meshes,rig,spec,col)
    for obj in extras:obj.parent=lodroots[0]
    meshes+=extras;lod1=make_lod(meshes,col,lodroots[1]);bpy.context.view_layer.update()
    prefix='char_player' if args.asset=='char_player_a' else args.asset
    for name in spec['requiredNodes']:
        if name in bpy.data.objects:continue
        if 'hand' in name or 'tool_socket' in name:bone=SEMANTICS['hand_left' if name.endswith('left') else 'hand_right']
        else:bone=SEMANTICS['pelvis']
        marker=empty(name,col);marker.parent=rig;marker.parent_type='BONE';marker.parent_bone=bone;marker['neva_marker']='socket'
        bpy.context.view_layer.update();matrix=rig.matrix_world@rig.data.bones[bone].matrix_local
        # Source wrists sit at the hand base. Palm markers use source hand
        # direction (bone +Y), so runtime IK targets the grip rather than wrist.
        if 'hand' in name or 'tool_socket' in name:
            rotation=matrix.to_quaternion()
            suffix='L' if name.endswith('left') else 'R'
            knuckles=[rotation.inverted()@((rig.matrix_world@rig.data.bones[f'{finger}2.{suffix}'].matrix_local).translation-matrix.translation) for finger in ('Index','Middle','Ring','Pinky')]
            # Source bone 1 is the palm/metacarpal. Place a held handle just
            # proximal to its real knuckles, where phalanges can wrap around it.
            # Measure in world metres, not source bone units: the Woman source
            # uses centimetre-scale local joints and must retain that bind rig.
            unit=authoring['heightMeters']/1.9
            grip_center=Vector((0,sum(p.y for p in knuckles)/4-.02*unit,-.025*unit))
            position=matrix.translation+rotation@grip_center
            # Anatomical grip frame: +Y fingers, +Z inward palm. Source wrist
            # +Z is dorsal, measured from the original thumb/finger geometry.
            # glTF rebases Empty local axes as well as world coordinates. The
            # extra local X turn gives FINAL glTF +Y fingers / +Z inward palm.
            matrix=Matrix.LocRotScale(position,rotation@Quaternion((0,1,0),math.pi)@Quaternion((1,0,0),-math.pi/2),Vector((1,1,1)))
        elif 'carry_socket' in name:matrix=Matrix.Translation(Vector((0,-.25,1.37))*authoring['heightMeters']/1.9)
        elif 'hip_socket' in name:matrix=Matrix.Translation(Vector((-.19,.02,.93))*authoring['heightMeters']/1.9)
        marker.matrix_world=matrix
    actions,motions=author_actions(rig,spec,source_defaults)
    if original_bind!={b.name:[list(row) for row in b.matrix_local] for b in rig.data.bones}:raise ValueError('Source bind skeleton changed')
    diagnostic,contacts=diagnose(rig,{'LOD0':meshes,'LOD1':lod1},actions,spec)
    for obj in col.all_objects:obj.hide_set(False);obj.hide_viewport=False;obj.hide_render=False
    report={'assetId':args.asset,'sourceFile':authoring['sourceFile'],'sourceSha256':sha(source),'uniformScale':scale,'sourceToPreparedBlenderMatrix':[list(row) for row in normalize],'sourceParts':{name:obj.name for obj,name in source_names.items()},'headSourceFile':authoring.get('headSourceFile'),'omittedParts':authoring.get('omitParts',[]),'heightMeters':authoring['heightMeters'],'sourceBindMatricesUnchanged':True,'sourceSurfaceBefore':before,'sourceSurfaceAfter':after,'materials':mapping,'motions':motions,'diagnostics':diagnostic,'contacts':contacts,'humanReview':'PENDING','published':False}
    report['sourceCleanup']={'removedDegenerateTriangles':cleanup}
    report['actionChecklist']=action_checklist(spec,motions,diagnostic,contacts)
    report_path=out/f'{args.asset}.report.json';report_path.write_text(json.dumps(report,indent=2)+'\n')
    rig.data.pose_position='POSE';bind_action(rig,next(a for a in actions if a.name=='idle'));frame_set(0)
    blend=out/f'{args.asset}.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True);export_collection(out/f'{args.asset}.glb',root,col)
    report['sourceColorExport']=restore_solid_humanoid_colors(out/f'{args.asset}.glb',spec,MATERIAL_SPECS)
    report_path.write_text(json.dumps(report,indent=2)+'\n')
    print('NEVA_SOURCE_HUMANOID_STAGED',report_path, 'MECHANICAL_PASS',diagnostic['mechanicalPass'])

if __name__=='__main__':main()
