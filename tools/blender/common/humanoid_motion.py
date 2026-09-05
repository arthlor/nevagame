"""Author Neva performances on the original Quaternius skeleton in world space.

The source's independent Foot controls are endpoints, not shin children. Limb
solutions preserve bind lengths; no donor local channels or bone scales are used.
All distances below are metres at a 1.9 m stature and uniformly scale with it.
"""
from __future__ import annotations
import math,json,struct
import bpy
from mathutils import Matrix, Quaternion, Vector

SEMANTICS = {'root':'Root','pelvis':'Body','hips':'Hips','spine':'Abdomen','spine_02':'Torso','chest':'Chest','neck':'Neck','head':'Head'}
for side, suffix in [('left','L'),('right','R')]:
    for semantic, source in [('clavicle','Shoulder'),('upper_arm','UpperArm'),('forearm','LowerArm'),('hand','Wrist'),('thigh','UpperLeg'),('shin','LowerLeg'),('foot','Foot')]:
        SEMANTICS[f'{semantic}_{side}'] = f'{source}.{suffix}'


TRANSITIONS = {
    'walk_start':('Idle_Neutral','Walk'),'run_start':('Idle_Neutral','Run'),'stop':('Walk','Idle_Neutral'),
    'mount':('Idle_Neutral','mounted_idle'),'mount_right':('Idle_Neutral','mounted_idle'),
    'dismount':('mounted_idle','Idle_Neutral'),'dismount_right':('mounted_idle','Idle_Neutral'),
    'board':('Idle_Neutral','rowboat_idle'),'board_skiff':('Idle_Neutral','skiff_idle'),
    'dock':('rowboat_idle','Idle_Neutral'),'dock_skiff':('skiff_idle','Idle_Neutral'),
    'pickup':('Idle_Neutral','carry_idle'),'place':('carry_idle','Idle_Neutral'),
    'jump_start':('Idle_Neutral','fall'),'land_soft':('fall','Idle_Neutral'),'land_hard':('fall','Idle_Neutral')
}

def source_node_defaults(rig,path):
    """Recover sparse glTF defaults independently of the imported active action.

    The exporter converts a bone basis through its local bind matrix. Invert
    that exact conversion to retain omitted source node TRS (neck, wrists and
    fingers), which the importer's first active action can otherwise overwrite.
    """
    data=path.read_bytes()
    document=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]]) if data[:4]==b'glTF' else json.loads(data)
    nodes={node.get('name'):node for node in document['nodes']}
    axis=Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)))
    result={}
    for bone in rig.data.bones:
        node=nodes[bone.name]
        if 'matrix' in node:
            values=node['matrix'];local=Matrix([values[i::4] for i in range(4)])
        else:
            rotation=node.get('rotation',[0,0,0,1]);local=Matrix.LocRotScale(Vector(node.get('translation',[0,0,0])),Quaternion((rotation[3],*rotation[:3])),Vector(node.get('scale',[1,1,1])))
        correction=bone.parent.matrix_local.inverted()@bone.matrix_local if bone.parent else axis@bone.matrix_local
        result[bone.name]=correction.inverted()@local
    return result


def ease(t):
    t=max(0.,min(1.,t)); return t*t*(3.-2.*t)


def hump(t, peak=.5):
    return ease(t/peak) if t<=peak else ease((1-t)/(1-peak))


def grip_profile(name,t):
    """Authored equipment ownership; native performances never enter this path."""
    if name.startswith('carry_'):return {'left':('cup',1.),'right':('cup',1.)}
    if name in ('pickup','place'):
        amount=ease((t-.35)/.35) if name=='pickup' else 1-ease((t-.5)/.35)
        return {side:('cup',amount) for side in ('left','right')}
    if name in ('cast','hookset','fishing_idle','reel','slack','brace','skiff_fishing','row'):
        return {side:('handle',1.) for side in ('left','right')}
    if name in ('water','harvest','workstation','skiff_drive'):return {'right':('handle',1.)}
    if name.startswith('mounted_'):return {side:('reins',1.) for side in ('left','right')}
    if name in ('mount','mount_right','dismount','dismount_right'):
        amount=ease(t) if name.startswith('mount') else 1-ease(t)
        return {side:('reins',amount) for side in ('left','right')}
    return {}


def bind_action(rig, action):
    data=rig.animation_data_create(); data.action=action; data.use_nla=False
    if action and action.slots: data.action_slot=action.slots[0]


def frame_set(frame):
    bpy.context.scene.frame_set(math.floor(frame), subframe=frame%1)
    bpy.context.view_layer.update()


def curves(action):
    return [fc for layer in action.layers for strip in layer.strips for bag in strip.channelbags for fc in bag.fcurves]


def sample_basis(rig, action, seconds, defaults=None):
    if defaults:
        bind_action(rig,None)
        for bone in rig.pose.bones:bone.matrix_basis=defaults[bone.name]
    bind_action(rig,action); frame_set(seconds*30)
    return {p.name:p.matrix_basis.copy() for p in rig.pose.bones}


class Performer:
    def __init__(self, rig, stature):
        self.rig=rig; self.unit=stature/1.9
        self.inverse=rig.matrix_world.inverted()
        self.rest={b.name:rig.matrix_world@b.matrix_local for b in rig.data.bones}
        self.tips={side:self.rest[SEMANTICS['shin_'+side]].inverted()@self.rest[SEMANTICS['foot_'+side]].translation for side in ('left','right')}

    def bone(self, semantic): return self.rig.pose.bones[SEMANTICS[semantic]]
    def world(self, semantic): return self.rig.matrix_world@self.bone(semantic).matrix
    def point(self, semantic): return self.world(semantic).translation.copy()
    def set_world(self, semantic, matrix):
        self.bone(semantic).matrix=self.inverse@matrix; bpy.context.view_layer.update()
    def offset(self, semantic, displacement):
        mat=self.world(semantic); mat.translation+=Vector(displacement)*self.unit; self.set_world(semantic,mat)
    def rotate(self, semantic, axis, radians):
        mat=self.world(semantic); origin=mat.translation.copy()
        rot=Matrix.Translation(origin)@Quaternion(Vector(axis),radians).to_matrix().to_4x4()@Matrix.Translation(-origin)
        self.set_world(semantic,rot@mat)
    def aim(self, semantic, old_vector, new_vector):
        if min(old_vector.length,new_vector.length)<1e-7: return
        mat=self.world(semantic); origin=mat.translation.copy()
        rot=old_vector.normalized().rotation_difference(new_vector.normalized()).to_matrix().to_4x4()
        self.set_world(semantic,Matrix.Translation(origin)@rot@Matrix.Translation(-origin)@mat)
    def solve(self, side, target, pole, arm=False, endpoint_matrix=None):
        a=('upper_arm_' if arm else 'thigh_')+side
        b=('forearm_' if arm else 'shin_')+side
        c=('hand_' if arm else 'foot_')+side
        origin=self.point(a); joint=self.point(b)
        virtual=self.point(c) if arm else self.world(b)@self.tips[side]
        l1=(self.rest[SEMANTICS[b]].translation-self.rest[SEMANTICS[a]].translation).length
        l2=((self.rest[SEMANTICS[c]].translation-self.rest[SEMANTICS[b]].translation).length)
        direction=target-origin; distance=max(1e-6,min(direction.length,l1+l2-1e-5)); direction.normalize()
        distance=max(abs(l1-l2)+1e-5,distance)
        target=origin+direction*distance
        bend=pole-origin; bend-=direction*bend.dot(direction)
        if bend.length<1e-6: bend=Vector((0,-1,0)); bend-=direction*bend.dot(direction)
        bend.normalize(); along=(l1*l1-l2*l2+distance*distance)/(2*distance)
        knee=origin+direction*along+bend*math.sqrt(max(0,l1*l1-along*along))
        self.aim(a,joint-origin,knee-origin)
        joint=self.point(b)
        virtual=self.point(c) if arm else self.world(b)@self.tips[side]
        self.aim(b,virtual-joint,target-joint)
        # Only independent source feet translate; hierarchical wrists follow bones.
        if not arm:
            mat=endpoint_matrix.copy() if endpoint_matrix else self.world(c)
            mat.translation=target; self.set_world(c,mat)
        elif endpoint_matrix:
            mat=endpoint_matrix.copy(); mat.translation=self.point(c); self.set_world(c,mat)

    def hands(self, targets, amount=1., palms=False):
        for side, target in targets.items():
            sign=1 if side=='left' else -1
            target=Vector(target)*self.unit
            self.solve(side,self.point('hand_'+side).lerp(target,amount),Vector((sign*.58,.08,1.02))*self.unit,arm=True)

    def grip(self,side,kind,amount):
        """Curl actual source phalanges toward the anatomical palm normal.

        Bone 1 is the long metacarpal, not a finger knuckle. Keep its source
        shape and rotate joints 2/3/4; this avoids folding the palm itself.
        Axes are measured from each source chain after wrist positioning.
        """
        suffix='L' if side=='left' else 'R'
        wrist=self.world('hand_'+side).to_quaternion()
        inward=wrist@Vector((0,0,-1))
        angles={'handle':(math.radians(70),math.radians(90),math.radians(45)),
                'reins':(math.radians(60),math.radians(75),math.radians(40)),
                'cup':(math.radians(25),math.radians(30),math.radians(18))}[kind]
        def world(name):return self.rig.matrix_world@self.rig.pose.bones[name].matrix
        def turn(name,axis,angle):
            matrix=world(name);origin=matrix.translation.copy()
            self.rig.pose.bones[name].matrix=self.inverse@(Matrix.Translation(origin)@Quaternion(axis,angle*amount).to_matrix().to_4x4()@Matrix.Translation(-origin)@matrix)
            bpy.context.view_layer.update()
        for finger in ('Index','Middle','Ring','Pinky'):
            direction=world(f'{finger}3.{suffix}').translation-world(f'{finger}2.{suffix}').translation
            axis=direction.normalized().cross(inward).normalized()
            for joint,angle in zip((2,3,4),angles):turn(f'{finger}{joint}.{suffix}',axis,angle)
        # Oppose the thumb across the palm before flexion, mirrored by its
        # measured source handedness. The palm-facing curl axis stays anatomical.
        thumb_factor=.45 if kind=='cup' else .8 if kind=='reins' else 1.
        turn(f'Thumb1.{suffix}',inward,(-1 if side=='left' else 1)*.55*thumb_factor)
        direction=world(f'Thumb3.{suffix}').translation-world(f'Thumb2.{suffix}').translation
        axis=direction.normalized().cross(inward).normalized()
        turn(f'Thumb2.{suffix}',axis,.42*thumb_factor)
        turn(f'Thumb3.{suffix}',axis,.36*thumb_factor)

    def pose(self, name, t, duration):
        u=self.unit; standing_feet={side:self.world('foot_'+side) for side in ('left','right')}
        # Body is the leg parent, Hips only controls the torso on the source rig.
        squat=0.; lean=0.; seated=0.; mount=0.; hands=None
        phase=2*math.pi*t
        base_hold={'left':(.20,-.25,1.25),'right':(-.20,-.25,1.25)}
        fishing={'left':(.10,-.27,1.31),'right':(-.08,-.24,1.28)}
        if name.startswith('carry_'): hands=base_hold
        elif name=='talk_gesture':
            amount=hump(t,.40); self.rotate('chest',(0,0,1),.07*math.sin(phase));self.rotate('head',(1,0,0),.04*math.sin(phase*2))
            self.hands({'right':(-.28,-.32,1.34)},amount);return
        elif name in ('walk_start','run_start','stop'):
            amount=ease(t) if name!='stop' else 1-ease(t)
            lean=(.13 if name=='run_start' else .05)*amount
            for side in ('left','right'):
                sign=1 if side=='left' else -1
                target=standing_feet[side].translation+Vector((0,-sign*.12*math.sin(math.pi*t),.045*max(0,sign*math.sin(math.pi*t))))*u
                self.solve(side,target,self.point('thigh_'+side)+Vector((0,-1,0))*u,endpoint_matrix=standing_feet[side])
        elif name in ('turn_left','turn_right'):
            direction=1 if name=='turn_left' else -1
            self.rotate('chest',(0,0,1),direction*.16*hump(t))
            for side in ('left','right'):
                target=standing_feet[side].translation.copy(); swing=math.sin(math.pi*t)**2
                target.y+=direction*(.09 if side=='left' else -.09)*swing*u
                first_side='right' if direction>0 else 'left'
                lift=max(0,math.sin(phase)*(1 if side==first_side else -1))
                target.z+=.035*lift*u
                self.solve(side,target,self.point('thigh_'+side)+Vector((0,-1,0))*u,endpoint_matrix=standing_feet[side])
        elif name=='jump_start': squat=.22*hump(t,.36);lean=.14*hump(t,.36)
        elif name=='fall':
            squat=.12;lean=.07;hands={'left':(.35,-.05,1.22),'right':(-.35,-.05,1.22)}
            for side in ('left','right'): standing_feet[side].translation.z+=.10*u
        elif name.startswith('land_'): squat=(.30 if name=='land_hard' else .15)*hump(t,.25);lean=.22*hump(t,.25)
        elif name in ('plant','pickup','place','harvest','water','workstation'):
            peak={'plant':.455,'pickup':.526,'place':.727,'harvest':.458,'water':.48,'workstation':.571}[name]
            reach=hump(t,peak)
            squat=(.39 if name in ('plant','pickup','place') else .20 if name=='harvest' else .06)*reach
            lean=(.52 if name in ('plant','pickup','place') else .30 if name=='harvest' else .12)*reach
            if name in ('plant','harvest'): hands={'right':(-.17,-.46,.36 if name=='plant' else .69),'left':(.20,-.23,.78)}
            elif name in ('pickup','place'): hands={'right':(-.20,-.44,.45),'left':(.20,-.44,.45)}
            elif name=='water': hands={'right':(-.22,-.47,1.00),'left':(.06,-.33,1.06)}
            else:hands={'right':(-.20,-.42,1.01),'left':(.20,-.40,1.06)}
            hands={side:self.point('hand_'+side).lerp(Vector(v)*u,reach)/u for side,v in hands.items()}
        elif name in ('cast','hookset','fishing_idle','reel','slack','brace','skiff_fishing'):
            hands=fishing.copy();lean=.04
            if name=='cast':
                draw=hump(min(1,t/.62),.6) if t<.62 else 0
                release=hump(t,.68)
                hands={side:(v[0]+(.045 if side=='right' else 0)*draw,v[1]+(.28 if side=='right' else .20)*draw,v[2]+(.32 if side=='right' else .20)*draw) for side,v in fishing.items()};lean=-.10*draw+.08*release
            elif name=='hookset':
                pull=hump(t,.35);hands={s:(v[0]+(.045 if s=='right' else 0)*pull,v[1]+.17*pull,v[2]+.19*pull) for s,v in hands.items()};lean=-.12*pull
            elif name=='reel':
                v=fishing['left'];hands['left']=(v[0]-.025*math.sin(phase),v[1]+.025*math.cos(phase),v[2])
            elif name=='slack':hands={s:(v[0]+(.03 if s=='right' else 0),v[1],v[2]-.09) for s,v in hands.items()}
            elif name=='brace':squat=.08;lean=-.14;hands={s:(v[0],v[1]+.08,v[2]+.07) for s,v in hands.items()}
        elif name in ('rowboat_idle','row','skiff_idle','skiff_drive'):
            seated=1 if name in ('rowboat_idle','row') else 0
            if name=='row':
                stroke=math.cos(phase); lean=.12*stroke
                hands={'left':(.28,-.30-.14*stroke,.90+.04*math.sin(phase)),'right':(-.28,-.30-.14*stroke,.90+.04*math.sin(phase))}
            elif name=='skiff_drive':hands={'left':(.23,-.30,1.07),'right':(-.28,-.25,1.05)}
            elif name=='skiff_idle':hands={'left':(.21,-.20,1.03),'right':(-.21,-.20,1.03)}
            else:hands={'left':(.22,-.24,.80),'right':(-.22,-.24,.80)}
        elif name.startswith('mounted_'):
            mount=1; bounce={'mounted_idle':.004,'mounted_walk':.014,'mounted_trot':.025,'mounted_gallop':.04}[name]
            self.offset('pelvis',(0,0,bounce*math.sin(phase)));lean=.05 if name!='mounted_gallop' else .18
            hands={'left':(.15,-.37,1.00),'right':(-.15,-.37,1.00)}
        elif name in ('mount','mount_right','dismount','dismount_right'):
            mount=ease(t) if name.startswith('mount') else 1-ease(t)
            lean=.14*math.sin(math.pi*t);hands={'left':(.17,-.33,1.02),'right':(-.17,-.33,1.02)}
            side='right' if name.endswith('_right') else 'left'
            self.offset('pelvis',((1 if side=='left' else -1)*.06*math.sin(math.pi*t),0,0))
            standing_feet[side].translation.z+=.20*u*math.sin(math.pi*t)
        elif name in ('board','board_skiff','dock','dock_skiff'):
            seated=(ease(t) if name.startswith('board') else 1-ease(t)) if 'skiff' not in name else 0
            squat=.09*math.sin(math.pi*t);lean=.10*math.sin(math.pi*t)
            side='left' if name.startswith('board') else 'right'
            standing_feet[side].translation+=Vector((0,-.20*math.sin(math.pi*t),.18*math.sin(math.pi*t)))*u
        else: raise ValueError(f'No source-rig performance recipe for {name}')
        if squat or seated:self.offset('pelvis',(0,0,-squat-.38*seated))
        if lean:self.rotate('hips',(1,0,0),lean*.5);self.rotate('spine',(1,0,0),lean*.5)
        # Carry locomotion retains the native leg performance exactly.
        if not name.startswith('carry_') and name not in ('walk_start','run_start','stop','turn_left','turn_right'):
            for side in ('left','right'):
                sign=1 if side=='left' else -1; endpoint=standing_feet[side]; target=endpoint.translation.copy()
                if seated:target=target.lerp(Vector((sign*.17,-.47,.09))*u,seated)
                if mount:
                    mounted=self.point('pelvis')+Vector((sign*.31,.02,-.65))*u
                    target=target.lerp(mounted,mount)
                pole=self.point('thigh_'+side)+Vector((sign*.14*mount,-1,.05))*u
                self.solve(side,target,pole,endpoint_matrix=endpoint)
        if hands:self.hands(hands)
        for side,(kind,amount) in grip_profile(name,t).items():self.grip(side,kind,amount)


def author_actions(rig,spec,source_defaults):
    rig.data.pose_position='POSE'
    source={a.name.split('|')[-1]:a for a in list(bpy.data.actions)}
    if any(name not in source for name in ('Idle_Neutral','Walk','Run')):raise ValueError('Original peaceful source clips are missing')
    clips=[*spec['animationClips'],*spec.get('additionalAnimationClips',[])]
    original_actions=set(bpy.data.actions)
    # Sample original basis before constructing actions, so a new action never
    # influences sampling of the next one through retained pose channels.
    source_baselines={name:sample_basis(rig,source[name],0,source_defaults) for name in ('Idle_Neutral','Walk','Run')}
    neutral=source_baselines['Idle_Neutral']
    native={name:[(float(fc.keyframe_points[0].co.x),float(fc.keyframe_points[-1].co.x)) for fc in curves(source[name])] for name in ('Idle_Neutral','Walk','Run')}
    performer=Performer(rig,spec['humanoidAuthoring']['heightMeters']); prepared=[]; report=[]
    for clip in clips:
        name=clip['name']; duration=clip['durationSeconds']; motion=clip['motionSource']; authored=motion['kind']=='authored'
        source_name=motion.get('sourceClip') if not authored else 'Walk' if name=='carry_walk' else 'Run' if name=='carry_run' else None
        if not authored:
            action=source[source_name].copy();action.name=name
            # glTF permits omitted channels to inherit non-identity node TRS.
            # Blender's exported bind nodes need explicit keys for those source
            # defaults (notably Woman fingers), otherwise sparse native actions
            # silently fall back to the bind pose after another action runs.
            bind_action(rig,action)
            present={fc.data_path for fc in curves(action)};default_channels=[]
            for bone in rig.pose.bones:bone.matrix_basis=source_baselines[source_name][bone.name]
            bpy.context.view_layer.update()
            for bone in rig.pose.bones:
                for channel in ('location','rotation_quaternion','scale'):
                    if bone.path_from_id(channel) not in present:
                        bone.keyframe_insert(data_path=channel,frame=0,group=bone.name);bone.keyframe_insert(data_path=channel,frame=duration*30,group=bone.name);default_channels.append(bone.name+'.'+channel)
            for fc in curves(action):
                if fc.data_path not in present:
                    for key in fc.keyframe_points:key.interpolation='LINEAR'
            # Preserve native channels/timestamps, repairing only a discontinuous
            # loop endpoint in the source Run (same duration, no speed retiming).
            loop_repaired=False
            if source_name=='Run':
                for fc in curves(action):
                    keys=fc.keyframe_points
                    if len(keys)>1 and abs(keys[-1].co.y-keys[0].co.y)>1e-6:
                        end=duration*30;start=max(0,end-3)
                        for key in keys:
                            if key.co.x>start:key.co.y=key.co.y*(1-ease((key.co.x-start)/(end-start)))+keys[0].co.y*ease((key.co.x-start)/(end-start))
                        loop_repaired=True
        else:
            default_channels=[]
            action=bpy.data.actions.new(name); action.use_fake_user=True
            frames=sorted(set([float(f) for f in range(math.ceil(duration*30))]+[duration*30]))
            snapshots=[]
            for frame in frames:
                if source_name:
                    base_action=next((a for a in prepared if a.name==source_name.lower()),source[source_name])
                    original_duration=(base_action.frame_range[1]-base_action.frame_range[0])/30
                    basis=sample_basis(rig,base_action,(frame/30)%original_duration,source_defaults)
                else:basis=neutral
                snapshots.append(basis)
            bind_action(rig,action)
            endpoints=[];endpoint_errors=[]
            if name in TRANSITIONS:
                for label in TRANSITIONS[name]:
                    bind_action(rig,None)
                    base=source_baselines[label] if label in source_baselines else neutral
                    for bone in rig.pose.bones:bone.matrix_basis=base[bone.name]
                    bpy.context.view_layer.update()
                    if label not in source_baselines:performer.pose(label,0,duration)
                    endpoints.append({bone.name:bone.matrix_basis.copy() for bone in rig.pose.bones})
                    endpoint_errors.append({side:performer.point('foot_'+side)-(performer.world('shin_'+side)@performer.tips[side]) for side in ('left','right')})
            bind_action(rig,action)
            for frame,basis in zip(frames,snapshots):
                frame_set(frame)
                for bone in rig.pose.bones:bone.matrix_basis=basis[bone.name]
                bpy.context.view_layer.update();t=frame/(duration*30);performer.pose(name,t,duration)
                if endpoints and (t<.2 or t>.8):
                    target=endpoints[0] if t<.2 else endpoints[1]
                    amount=1-ease(t/.2) if t<.2 else ease((t-.8)/.2)
                    for bone in rig.pose.bones:
                        loc,rot,scale=bone.matrix_basis.decompose();tl,tr,ts=target[bone.name].decompose()
                        bone.matrix_basis=Matrix.LocRotScale(loc.lerp(tl,amount),rot.slerp(tr,amount),scale.lerp(ts,amount))
                    bpy.context.view_layer.update()
                    # Independent feet do not follow quaternion interpolation
                    # of the thigh/shin. Re-establish that endpoint after a
                    # transition blend, retaining the native endpoint residual
                    # at its exact terminal pose without stretching either bone.
                    for side in ('left','right'):
                        mat=performer.world('foot_'+side)
                        mat.translation=performer.world('shin_'+side)@performer.tips[side]+endpoint_errors[0 if t<.2 else 1][side]*amount
                        performer.set_world('foot_'+side,mat)
                for bone in rig.pose.bones:
                    bone.rotation_mode='QUATERNION'
                    for channel in ('location','rotation_quaternion','scale'):bone.keyframe_insert(data_path=channel,frame=frame,group=bone.name)
            for fc in curves(action):
                for key in fc.keyframe_points:key.interpolation='LINEAR'
            loop_repaired=False
        action.use_fake_user=True
        action['neva_loop']=clip['loop']
        if 'commitMarkerSeconds'in clip:action['neva_commit_marker_seconds']=clip['commitMarkerSeconds']
        if 'referenceSpeedMetersPerSecond'in clip:action['neva_reference_speed_meters_per_second']=clip['referenceSpeedMetersPerSecond']
        prepared.append(action);report.append({'name':name,'kind':motion['kind'],'sourceClip':source_name,'durationSeconds':duration,'sourceDefaultChannelsMaterialized':default_channels,'sourceRunLoopClosure':loop_repaired,'loopClosureStartSeconds':duration-.1 if loop_repaired else None,'loopClosureEndSeconds':duration if loop_repaired else None,'loopClosureWindowSeconds':.1 if loop_repaired else None,'authoredGripProfiles':{side:kind for side,(kind,_) in grip_profile(name,.5).items()} if authored else {},'curves':len(curves(action))})
    data=rig.animation_data_create();data.action=None
    for track in list(data.nla_tracks):data.nla_tracks.remove(track)
    for action in original_actions:bpy.data.actions.remove(action)
    for action in prepared:
        track=data.nla_tracks.new();track.name=action.name;track.mute=True
        track.strips.new(action.name,0,action)
    bind_action(rig,next(a for a in prepared if a.name=='idle'))
    frame_set(0);rig.data.pose_position='REST'
    return prepared,report
