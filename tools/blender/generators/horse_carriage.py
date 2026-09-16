"""Draft horse and merchant carriage, in metres with -Y forward.

The horse has connected anatomy and deterministic region weights. Locomotion
solves a two-link leg against a planted/swinging hoof trajectory before baking
the bones. Cargo markers describe presentation fit, never inventory capacity.
"""
import math
import bpy
from mathutils import Matrix, Vector
from common.geometry import (add_box, add_cylinder, add_ico, add_limb_tube,
    add_ring, add_marker, graft_limb, apply_vertex_values, remember_rest_transform)
from common.creature import (bone, build_creature_armature, finish_creature_skin,
    decimate_skinned_lod, author_creature_clip)
from common.materials import get_or_create_material


def _weights(obj, indices, values):
    for name in values:
        if obj.vertex_groups.get(name) is None:
            obj.vertex_groups.new(name=name)
    for index in indices:
        for item in list(obj.data.vertices[index].groups):
            obj.vertex_groups[item.group].remove([index])
        for name, value in values.items():
            if value > 1e-8:
                obj.vertex_groups[name].add([index], value, 'REPLACE')


def _bind_part(obj, rig, name):
    _weights(obj, range(len(obj.data.vertices)), {name: 1.0})
    finish_creature_skin(obj, rig)
    return obj


def _pose_segment(rig, name, head, tail):
    rest = rig.data.bones[name]
    rotation = (rest.tail_local - rest.head_local).rotation_difference(Vector(tail) - Vector(head))
    desired = rotation.to_matrix().to_4x4() @ rest.matrix_local
    desired.translation = Vector(head)
    pose = rig.pose.bones[name]
    pose.matrix = desired
    pose.rotation_mode = 'QUATERNION'


def _knee(hip, foot, upper, lower, sign):
    vector = foot - hip
    distance = vector.length
    direction = vector.normalized()
    along = (upper * upper - lower * lower + distance * distance) / (2 * distance)
    height = math.sqrt(max(0.0, upper * upper - along * along))
    perpendicular = Vector((0, -direction.z, direction.y)) * sign
    return hip + direction * along + perpendicular * height


def draft_horse(spec, root):
    prefix = spec['id']
    coat, dark, cream, leather, brass = spec['palette']
    lod = add_marker(prefix + '_LOD0', (0, 0, 0), root)
    far = add_marker(prefix + '_LOD1', (0, 0, 0), root)
    sections = [
        (0,.99,1.44,.15,.24), (0,.80,1.46,.33,.38),
        (0,.52,1.43,.39,.40), (0,.12,1.40,.41,.40),
        (0,-.27,1.42,.38,.40), (0,-.57,1.49,.31,.38),
        (0,-.72,1.70,.25,.32), (0,-.85,1.96,.20,.28),
        (0,-1.04,2.18,.19,.23), (0,-1.22,2.20,.20,.22),
        (0,-1.38,2.07,.175,.20), (0,-1.55,1.90,.15,.17),
        (0,-1.71,1.81,.145,.13), (0,-1.80,1.80,.12,.105),
    ]
    surface = add_limb_tube(prefix+'_body', [r[:3] for r in sections],
                            [r[3:] for r in sections], coat, lod, sides=16)
    surface.data.materials.append(get_or_create_material(dark))
    surface.data.materials.append(get_or_create_material(cream))
    for face in surface.data.polygons:
        if face.center.y < -1.61:
            face.material_index = 1
        elif face.center.y < -1.20 and abs(face.center.x) < .07 and face.normal.z > .25:
            face.material_index = 2
    limbs = {}
    definitions = [bone('horse_spine',(0,.7,1.45),(0,-.55,1.45)),
                   bone('horse_neck',(0,-.57,1.49),(0,-1.05,2.18)),
                   bone('horse_head',(0,-1.06,2.17),(0,-1.75,1.80)),
                   bone('horse_tail',(0,.96,1.64),(0,1.18,.68))]
    joints = {}
    for name, x, y, front in [('front_left',.285,-.52,True),('front_right',-.285,-.52,True),
                            ('rear_left',.29,.66,False),('rear_right',-.29,.66,False)]:
        hip = Vector((x,y,1.34))
        knee = Vector((x,y+(.04 if front else .15),.68))
        foot = Vector((x,y-.015,.145))
        joints[name] = (hip,knee,foot,front)
        target=Vector((x,y,1.23))
        candidates=[f for f in surface.data.polygons if len(f.vertices)==4 and f.center.z>1.1 and f.normal.x*x>.04]
        first=min(candidates,key=lambda f:(f.center-target).length_squared)
        neighbors=[f for f in candidates if f.index!=first.index and len(set(first.vertices)&set(f.vertices))==2]
        second=min(neighbors,key=lambda f:(f.center-target).length_squared)
        points=[(x,y,1.15),(x,y,1.00),(x,knee.y,.80),tuple(knee),
                (x,y,.44),(x,y,.23),tuple(foot)]
        limbs[name]=graft_limb(surface,[first.index,second.index],points,
            [.18 if front else .21,.145,.10,.092,.065,.065,.08],token=coat)
        definitions += [bone('horse_'+name,hip,knee),bone('horse_'+name+'_lower',knee,foot),
                        bone('horse_'+name+'_hoof',foot,(x,y-.16,.08))]
    for side, sign in [('left',1),('right',-1)]:
        definitions.append(bone('horse_ear_'+side,(sign*.14,-1.08,2.35),(sign*.19,-1.05,2.59)))
    rig=build_creature_armature(prefix+'_rig',definitions,root)
    rig.show_in_front=True
    for vertex in surface.data.vertices:
        y=vertex.co.y
        neck=max(0,min(1,(-y-.48)/.30))
        head=max(0,min(1,(-y-1.00)/.24))
        _weights(surface,[vertex.index],{'horse_spine':1-neck,'horse_neck':neck*(1-head),'horse_head':head})
    for name,rings in limbs.items():
        for ring in rings:
            for index in ring:
                z=surface.data.vertices[index].co.z
                upper=max(0,min(1,(1.34-z)/.38))
                lower=max(0,min(1,(.84-z)/.31))
                hoof=max(0,min(1,(.27-z)/.12))
                _weights(surface,[index],{'horse_spine':1-upper,
                    'horse_'+name:upper*(1-lower),
                    'horse_'+name+'_lower':upper*lower*(1-hoof),
                    'horse_'+name+'_hoof':upper*lower*hoof})
    finish_creature_skin(surface,rig)
    decimate_skinned_lod(surface,rig,.56,prefix+'_body_far',far)
    for name,(hip,knee,foot,front) in joints.items():
        hoof=add_limb_tube(prefix+'_hoof_'+name,
            [(foot.x,foot.y,.21),(foot.x,foot.y-.028,.135),(foot.x,foot.y-.05,.032)],
            [(.082,.075),(.105,.12),(.115,.15)],dark,lod,sides=10)
        _bind_part(hoof,rig,'horse_'+name+'_hoof')
    for side,sign in [('left',1),('right',-1)]:
        ear=add_limb_tube(prefix+'_ear_'+side,
             [(sign*.135,-1.085,2.32),(sign*.16,-1.075,2.44),(sign*.18,-1.06,2.59)],
             [(.068,.055),(.056,.036),(.008,.012)],coat,lod,sides=8)
        _bind_part(ear,rig,'horse_ear_'+side)
        eye=add_ico(prefix+'_eye_'+side,(sign*.186,-1.31,2.19),(.025,.040,.025),dark,lod,subdivisions=2)
        _bind_part(eye,rig,'horse_head')
        nostril=add_ico(prefix+'_nostril_'+side,(sign*.131,-1.71,1.86),(.014,.044,.023),dark,lod,subdivisions=1)
        _bind_part(nostril,rig,'horse_head')
        strap=add_limb_tube(prefix+'_cheek_strap_'+side,
            [(sign*.19,-1.04,2.31),(sign*.212,-1.31,2.15),(sign*.16,-1.64,1.91)],
            [.018,.018,.018],leather,lod,sides=6)
        _bind_part(strap,rig,'horse_head')
        ring=add_ring(prefix+'_bit_'+side,(sign*.175,-1.66,1.87),.046,.009,brass,lod,
                      major_segments=12,minor_segments=4,rotation=(0,math.pi/2,0))
        _bind_part(ring,rig,'horse_head')
    mane=add_limb_tube(prefix+'_mane',[(0,-.48,1.83),(0,-.65,2.02),(0,-.81,2.22),(0,-1.03,2.41)],
                       [(.052,.035),(.065,.095),(.063,.10),(.036,.055)],dark,lod,sides=10)
    for vertex in mane.data.vertices:
        amount=max(0,min(1,(-vertex.co.y-.48)/.35))
        _weights(mane,[vertex.index],{'horse_spine':1-amount,'horse_neck':amount})
    finish_creature_skin(mane,rig)
    tail=add_limb_tube(prefix+'_tail',[(0,.96,1.66),(.025,1.15,1.46),(.05,1.26,1.07),(.04,1.30,.65),(.01,1.28,.38)],
                       [.075,.095,.105,.09,.015],dark,lod,sides=10)
    _bind_part(tail,rig,'horse_tail')
    # Collar is a continuous padded oval around the lower neck, with working hames.
    collar_points=[(.30*math.cos(t),-.69+.07*math.sin(t),1.53+.40*math.sin(t)) for t in [i*math.tau/20 for i in range(21)]]
    collar=add_limb_tube(prefix+'_collar',collar_points,[.056]*21,leather,lod,sides=8)
    _bind_part(collar,rig,'horse_spine')
    for sign in [-1,1]:
        hame=add_limb_tube(prefix+('_hame_left' if sign>0 else '_hame_right'),
             [(sign*.22,-.72,1.23),(sign*.34,-.71,1.51),(sign*.23,-.69,1.88)],
             [.022,.026,.020],brass,lod,sides=6)
        _bind_part(hame,rig,'horse_spine')
        add_marker(prefix+('_trace_left' if sign>0 else '_trace_right'),(sign*.36,-.53,1.36),root,marker_type='socket')
        trace=add_limb_tube(prefix+'_trace_strap_'+str(sign),
            [(sign*.34,-.62,1.48),(sign*.46,-.30,1.37),(sign*.48,.70,1.25),(sign*.48,2.10,1.05)],
            [(.012,.028)]*4,leather,lod,sides=4)
        _bind_part(trace,rig,'horse_spine')
        rein=add_limb_tube(prefix+'_rein_'+str(sign),
            [(sign*.175,-1.66,1.87),(sign*.32,-1.01,1.80),(sign*.46,-.2,1.65),
             (sign*.45,.80,1.54),(sign*.24,2.46,1.77)],
            [.011]*5,leather,lod,sides=6)
        for vertex in rein.data.vertices:
            head=max(0,min(1,(-vertex.co.y-.90)/.65))
            _weights(rein,[vertex.index],{'horse_head':head,'horse_spine':1-head})
        finish_creature_skin(rein,rig)
    girth=add_limb_tube(prefix+'_girth',
        [(.422*math.cos(t),-.15,1.40+.41*math.sin(t)) for t in [i*math.tau/24 for i in range(25)]],
        [(.025,.040)]*25,leather,lod,sides=6)
    _bind_part(girth,rig,'horse_spine')
    breeching=add_limb_tube(prefix+'_breeching',
        [(-.40,.35,1.41),(-.36,.84,1.40),(0,1.06,1.40),(.36,.84,1.40),(.40,.35,1.41)],
        [(.018,.033)]*5,leather,lod,sides=6)
    _bind_part(breeching,rig,'horse_spine')
    for obj in list(lod.children):
        if obj is surface:
            continue
        copy=obj.copy(); copy.data=obj.data.copy(); copy.name=obj.name+'_far'
        bpy.context.collection.objects.link(copy); copy.parent=far
    # Two-link IK is baked in bind space; full-width hoof soles stay level in stance.
    bpy.context.scene.render.fps=25
    for clip in spec['animationClips']:
        action=bpy.data.actions.new(clip['name'])
        action.use_fake_user=True; action['neva_loop']=clip['loop']
        if 'referenceSpeedMetersPerSecond' in clip:
            action['neva_reference_speed_meters_per_second']=clip['referenceSpeedMetersPerSecond']
        rig.animation_data_create(); rig.animation_data.action=action
        for track in rig.animation_data.nla_tracks: track.mute=True
        duration=clip['durationSeconds']; frames=round(duration*25)
        for frame in range(frames+1):
            p=frame/frames
            for pb in rig.pose.bones: pb.matrix_basis=Matrix.Identity(4)
            idle=clip['name']=='idle'; trot=clip['name']=='trot'
            drop=0 if idle else .09
            for name in ['horse_spine','horse_neck','horse_head','horse_tail','horse_ear_left','horse_ear_right']:
                rest=rig.data.bones[name]
                _pose_segment(rig,name,rest.head_local-Vector((0,0,drop)),rest.tail_local-Vector((0,0,drop)))
            for name,(hip,knee,foot,front) in joints.items():
                phase=({'rear_left':0,'front_left':.25,'rear_right':.5,'front_right':.75}[name]
                       if not trot else (0 if name in ('front_left','rear_right') else .5))
                q=(p-phase)%1
                stance=.62 if not trot else .52
                reach=0 if idle else clip['referenceSpeedMetersPerSecond']*duration*stance/2
                target=foot.copy()
                if q < stance:
                    target.y += -reach+2*reach*q/stance
                else:
                    u=(q-stance)/(1-stance)
                    smooth=u*u*(3-2*u)
                    target.y += reach-2*reach*smooth
                    target.z += (0 if idle else (.16 if trot else .12))*math.sin(math.pi*u)**2
                moving_hip=hip-Vector((0,0,drop))
                upper_length=(knee-hip).length; lower_length=(foot-knee).length
                if (target-moving_hip).length > upper_length+lower_length+1e-6:
                    raise ValueError(f'{name}: hoof target exceeds anatomical leg reach')
                joint=knee if idle else _knee(moving_hip,target,upper_length,lower_length,1)
                _pose_segment(rig,'horse_'+name,moving_hip,joint)
                _pose_segment(rig,'horse_'+name+'_lower',joint,target)
                _pose_segment(rig,'horse_'+name+'_hoof',target,target+Vector((0,-.145,-.065)))
            rig.pose.bones['horse_head'].rotation_mode='XYZ'
            rig.pose.bones['horse_head'].rotation_euler.x=.025*math.sin(math.tau*p)
            rig.pose.bones['horse_tail'].rotation_mode='XYZ'
            rig.pose.bones['horse_tail'].rotation_euler.y=.075*math.sin(math.tau*p)
            for pb in rig.pose.bones:
                pb.keyframe_insert('location',frame=frame)
                pb.keyframe_insert('rotation_euler' if pb.rotation_mode=='XYZ' else 'rotation_quaternion',frame=frame)
                pb.keyframe_insert('scale',frame=frame)
        rig.animation_data.action=None
        track=rig.animation_data.nla_tracks.new(); track.name=clip['name']
        track.strips.new(clip['name'],0,action)
    for track in rig.animation_data.nla_tracks: track.mute=False
    for pb in rig.pose.bones: pb.matrix_basis=Matrix.Identity(4)
    bpy.context.scene.frame_set(0)


def merchant_carriage(spec, root):
    p=spec['parameters']; width=p['bedWidth']; length=p['bedLength']; radius=p['wheelRadius']
    honey,dark,teal,iron,brass=spec['palette']
    prefix=spec['id']; bed=radius+.32
    body=add_marker(prefix+'_body',(0,0,0),root)
    def box(name,loc,size,token=honey,parent=body,bevel=.012):
        return add_box(prefix+'_'+name,loc,size,token,parent,bevel=bevel)
    for sign in [-1,1]:
        box('chassis_'+str(sign),(sign*width*.33,0,bed-.20),(.14,length+.28,.19),dark)
    for index in range(9):
        box('deck_%02d'%index,(-width/2+(index+.5)*width/9,0,bed),
            (width/9-.012,length,.095),honey)
    for sign in [-1,1]:
        for row in range(3):
            box('side_%d_%d'%(sign,row),(sign*(width/2+.015),0,bed+.14+row*.17),
                (.075,length+.12,.135),teal if row==1 else honey)
        box('rail_'+str(sign),(sign*(width/2+.015),0,bed+.60),(.12,length+.20,.09),dark)
        for index,y in enumerate([-length*.46,0,length*.46]):
            box('stake_%d_%d'%(sign,index),(sign*(width/2+.045),y,bed+.30),(.10,.11,.69),dark)
            for z in [bed+.12,bed+.48]:
                add_ico(prefix+'_rivet_%d_%d_%d'%(sign,index,round(z*100)),
                        (sign*(width/2+.10),y,z),(.018,.025,.025),brass,body)
    box('headboard',(0,-length/2,bed+.28),(width,.09,.54))
    gate=add_marker(prefix+'_tailgate',(0,length/2,bed+.06),body)
    box('tailgate_panel',(0,0,.21),(width,.075,.42),teal,gate)
    for sign in [-1,1]:
        box('tailgate_brace_'+str(sign),(sign*width*.34,.045,.20),(.075,.025,.44),iron,gate,.004)
    # Driver bench ahead of cargo; rails leave the two cargo bays unobstructed.
    box('driver_seat',(0,-length*.40,bed+.79),(width+.07,.46,.10),dark)
    box('driver_back',(0,-length*.28,bed+1.01),(width+.08,.08,.38),teal)
    for sign in [-1,1]:
        box('seat_support_'+str(sign),(sign*width*.37,-length*.4,bed+.43),(.10,.12,.67),dark)
        box('step_'+str(sign),(sign*(width*.5+.15),-length*.34,bed-.18),(.30,.40,.06),iron)
        points=[(sign*.49,-length*.44,bed-.17),(sign*.51,-length*.75,bed-.05),
                (sign*.51,-length*.98,1.22),(sign*.48,-length*.5-p['shaftLength'],1.33)]
        add_limb_tube(prefix+'_shaft_'+str(sign),points,[.055,.052,.046,.035],honey,body,sides=8)
    add_marker(prefix+'_driver_socket',(0,-length*.40,bed+.85),body,marker_type='socket')
    for index,y in enumerate([-.08,length*.33],1):
        add_marker(prefix+'_cargo_%02d'%index,(0,y,bed+.049),body,marker_type='socket')
        for sign in [-1,1]:
            add_ring(prefix+'_tie_%d_%d'%(index,sign),(sign*(width/2+.07),y,bed+.52),
                     .052,.010,iron,body,major_segments=10,minor_segments=4,rotation=(math.pi/2,0,0))
    wheels=[]
    for axle,y in [('front',-length*.39),('rear',length*.37)]:
        steering=add_marker(prefix+'_'+axle+'_axle',(0,y,radius),root)
        add_cylinder(prefix+'_'+axle+'_beam',(0,0,0),.064,width+.50,iron,steering,
                     vertices=8,rotation=(0,math.pi/2,0))
        for sign in [-1,1]:
            wheel=add_marker(prefix+'_'+axle+('_left' if sign>0 else '_right')+'_wheel',
                             (sign*(width/2+.24),0,0),steering)
            wheels.append(wheel)
            add_ring(wheel.name+'_felloe',(0,0,0),radius-.055,.065,honey,wheel,
                     major_segments=24,minor_segments=6,rotation=(0,math.pi/2,0))
            add_ring(wheel.name+'_tire',(0,0,0),radius-.014,.020,iron,wheel,
                     major_segments=24,minor_segments=4,rotation=(0,math.pi/2,0))
            add_cylinder(wheel.name+'_hub',(0,0,0),.11,.24,dark,wheel,vertices=12,rotation=(0,math.pi/2,0),bevel=.01)
            add_cylinder(wheel.name+'_cap',(sign*.14,0,0),.073,.032,brass,wheel,vertices=10,rotation=(0,math.pi/2,0))
            for i in range(12):
                angle=math.tau*i/12
                add_limb_tube(wheel.name+'_spoke_%02d'%i,
                    [(0,.09*math.cos(angle),.09*math.sin(angle)),
                     (0,(radius-.09)*math.cos(angle),(radius-.09)*math.sin(angle))],
                     [.025,.019],honey,wheel,sides=6)
    for clip in spec['animationClips']:
        duration=clip['durationSeconds']; frames=round(duration*25)
        tracks=[(body,[(f/25,(0,0,0),(0,0,.006*math.sin(math.tau*f/frames)))
                      for f in range(frames+1)])]
        for wheel in wheels:
            speed=clip.get('referenceSpeedMetersPerSecond',0)
            keys=[(f/25,(speed*(f/25)/radius,0,0),(0,0,0)) for f in range(frames+1)]
            tracks.append((wheel,keys))
        if clip['name']=='load':
            tracks.append((gate,[(0,(0,0,0),(0,0,0)),(duration*.5,(-math.pi/2,0,0),(0,0,0)),
                                  (duration,(-math.pi/2,0,0),(0,0,0))]))
        author_creature_clip(spec,clip['name'],frame_rate=25,object_tracks=tracks)
    bpy.context.scene.frame_set(0)
