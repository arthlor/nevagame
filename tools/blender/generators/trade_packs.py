"""Reference-led timber backpack carriers; cargo identity stays catalog-owned."""

from common.design_primitives import add_crafted_box

import math

import bpy
from mathutils import Matrix, Vector

from common.authored import add_plank_field, add_rope_line
from common.geometry import add_box, add_ico, add_limb_tube, add_lofted_form, add_tri_prism, seeded_rng
from common.lod import create_lod_roots, consolidate_lod_level
from .fish import stylized_fish


def _roles(spec):
    return ('wood_honey_01', 'wood_dark_01', 'canvas_cream_01', 'burlap_grain_01',
            'leather_harness_01', 'metal_brass_01', spec['parameters']['stripeToken'])


def _frame(spec, root, detail):
    p = spec['parameters']
    w, d, h, rim = p['width'], p['depth'], p['frameHeight'], p['basketHeight']
    wood, dark, canvas, rope, leather, brass, ink = _roles(spec)
    n = lambda part: f"{root.name}_{part}"
    # The basket rests between runners; the taller rear posts carry the harness.
    for side in (-1, 1):
        x = side * w * .46
        for back in (False, True):
            y = d * (.43 if back else -.43)
            ph = h if back else rim + .045
            add_crafted_box(n(f'post_{side}_{back}'), (x, y, ph/2), (.075, .075, ph), wood, root, bevel=.012)
            for z in (.12, ph-.13):
                points = [(x + .058*math.cos(i*math.tau/12), y + .058*math.sin(i*math.tau/12), z+i*.0025)
                          for i in range(25 if detail else 13)]
                add_rope_line(n(f'lashing_{side}_{back}_{int(z*100)}'), points, .012, rope, root, vertices=5)
        add_crafted_box(n(f'runner_{side}'), (x, 0, .09), (.09, d+.12, .09), dark, root, bevel=.012)
    add_plank_field(n('floor'), (0, 0, .16), w-.08, d-.06, .045,
                    (wood, dark), root, count=6 if detail else 4, seed=spec['seed'], bevel=.006)
    for side in (-1, 1):
        for row in range(3):
            z = .23 + row*(rim-.23)/3
            add_crafted_box(n(f'front_board_{side}_{row}'), (0, side*d*.43, z),
                    (w-.03, .04, (rim-.20)/3*.91), wood, root, bevel=.006)
            add_crafted_box(n(f'side_board_{side}_{row}'), (side*w*.46, 0, z),
                    (.035, d-.04, (rim-.20)/3*.91), wood, root, bevel=.006)
        add_crafted_box(n(f'crossbar_{side}'), (0, d*.43, h*(.31 if side<0 else .86)),
                (w, .065, .075), dark, root, bevel=.01)
        add_limb_tube(n(f'brace_{side}'), [(side*w*.42, d*.39, h*.84),(0,d*.39,h*.53)],
                      [(.025,.035)]*2, wood, root, sides=4, normal_mode='planar')
        # Broad leather straps arc away from the padded back, leaving shoulder space.
        strap = [(side*w*.32, d*.47,h*.84),(side*w*.32,d*.69,h*.88),
                 (side*w*.34,d*.85,h*.70),(side*w*.34,d*.82,h*.43),
                 (side*w*.33,d*.61,h*.20),(side*w*.33,d*.45,h*.22)]
        add_limb_tube(n(f'shoulder_strap_{side}'), strap, [(.014,.043)]*len(strap),
                      leather, root, sides=4, normal_mode='planar')
        bx, by, bz = side*w*.33, d*.66, h*.30
        add_rope_line(n(f'buckle_{side}'), [(bx-.04,by,bz-.035),(bx+.04,by,bz-.035),
                      (bx+.04,by,bz+.035),(bx-.04,by,bz+.035),(bx-.04,by,bz-.035)],
                      .007, brass, root, vertices=4)
    add_box(n('back_pad'), (0,d*.475,h*.57), (w*.67,.075,h*.46), canvas, root, bevel=.025)
    # A closed folded liner surrounds a genuinely open cargo well.
    for side in (-1,1):
        add_box(n(f'liner_x_{side}'), (side*(w*.46-.034),0,rim-.085), (.028,d*.81,.21), canvas,root,bevel=.008)
        add_box(n(f'liner_y_{side}'), (0,side*(d*.43-.032),rim-.085), (w*.82,.027,.21),canvas,root,bevel=.008)
    perimeter=[(-w*.46,-d*.43,rim),(w*.46,-d*.43,rim),(w*.46,d*.43,rim),
               (-w*.46,d*.43,rim),(-w*.46,-d*.43,rim)]
    add_rope_line(n('rolled_canvas_rim'),perimeter,.034,canvas,root,vertices=8 if detail else 6)
    add_rope_line(n('basket_lashing'),[(x,y,z-.065) for x,y,z in perimeter],.016,rope,root,vertices=6)
    # The front cloth has a pointed hem and shallow broad folds, not a paper plane.
    for i in range(5):
        x=(i-2)*w*.125
        hem=rim-.32-(.055 if i==2 else .022 if i in (1,3) else 0)
        add_box(n(f'cloth_panel_{i}'),(x,-d*.49-.008*(i%2),(rim+hem)/2),
                (w*.13,.018,rim-hem),canvas,root,bevel=.006)
    for side in (-1,1):
        add_box(n(f'cloth_stripe_{side}'),(side*w*.255,-d*.514,rim-.145),(.018,.012,.275),ink,root,bevel=.002)
    # A large stitched shipping seal reads at distance; the cargo itself supplies identity.
    add_ico(n('seal'),(0,-d*.535,rim-.19),(.066,.014,.060),ink,root,subdivisions=1)
    if detail:
        for i in range(3):
            add_rope_line(n(f'wave_mark_{i}'),[(-w*.13,-d*.54,rim-.28-i*.025),
                (0,-d*.54,rim-.29-i*.025),(w*.13,-d*.54,rim-.28-i*.025)],.005,ink,root,vertices=4)
    return w,d,h,rim


def _fish_payload(spec, root, detail, w, d, rim):
    p=spec['parameters']
    holder=bpy.data.objects.new(f'{root.name}_catch',None)
    bpy.context.collection.objects.link(holder)
    holder.parent=root
    keys=('species','length','girth','finScale','bodyDepth','bodySegments','radialSegments','tailPeduncle')
    fp={key:p[key] for key in keys}
    if not detail:
        fp['bodySegments']=8
        fp['radialSegments']=8
    before=set(bpy.context.scene.objects)
    stylized_fish({'id':f'{root.name}_fish','parameters':fp,'palette':[p['backToken'],p['bellyToken'],p['accentToken']]},holder)
    if p['species'] == 'sailfish':
        add_limb_tube(f'{root.name}_sailfish_bill',
                      [(0,-p['length']*.49,0),(0,-p['length']*.72,.004),(0,-p['length']*.98,.007)],
                      [p['girth']*.11,p['girth']*.055,.002],p['backToken'],holder,sides=6)
    # Flatten only this static catch, preserving the live fish generator and its animation.
    bpy.context.view_layer.update()
    transform=Matrix.Translation((0,-d*.03,rim+.065)) @ Matrix.Rotation(math.pi/2,4,'Z') @ Matrix.Rotation(-.20,4,'Y')
    created=set(bpy.context.scene.objects)-before
    for obj in sorted(created,key=lambda ob:ob.name):
        if obj.type!='MESH': continue
        for modifier in list(obj.modifiers):
            if modifier.type=='ARMATURE': obj.modifiers.remove(modifier)
        obj.data.transform(transform @ obj.matrix_world)
        obj.parent=root
        obj.matrix_parent_inverse.identity()
        obj.matrix_basis.identity()
        obj.name=f'{root.name}_{obj.name}'
    for obj in created:
        # The catch is flattened into the carrier, so its rig and motion
        # carriers must not survive as a stray hierarchy or skin.
        if obj.type in {'EMPTY','ARMATURE'}: bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.objects.remove(holder,do_unlink=True)
    rope,canvas,ink=_roles(spec)[3],_roles(spec)[2],_roles(spec)[6]
    rng=seeded_rng(spec['seed'])
    for i in range(18 if detail else 7):
        x=rng.uniform(-w*.37,w*.37); y=rng.uniform(-d*.30,d*.30)
        add_ico(f'{root.name}_ice_{i}',(x,y,rim-.008),(.046,.033,.035),p['bellyToken'],root,
                rotation=(.2,.1,rng.uniform(0,3)),subdivisions=1)
    # A coarse net pocket and cork floats retain the reference's working-fisher silhouette.
    for j in range(4 if detail else 2):
        points=[]
        for k in range(7):
            t=k/6
            points.append((w*.51+.065*math.sin(t*math.pi), (j-1.5)*.065*math.sin(t*math.pi), rim-.03-t*.39))
        add_rope_line(f'{root.name}_net_{j}',points,.009,rope,root,vertices=5)
    for j in range(3):
        z=rim-.08-j*.12
        add_rope_line(f'{root.name}_net_cross_{j}',[(w*.53,-.10,z),(w*.585,0,z-.03),(w*.53,.10,z)],.008,rope,root,vertices=5)
    for j,y in enumerate((-.16,.16)):
        add_rope_line(f'{root.name}_float_tie_{j}',[(w*.48,y,rim-.02),(w*.57,y,rim-.16)],.009,rope,root,vertices=5)
        add_lofted_form(f'{root.name}_float_{j}',[((w*.57,y,z),r,r) for z,r in
                         [(rim-.29,.020),(rim-.27,.035),(rim-.20,.035),(rim-.17,.017)]],canvas,root,sides=8)
        add_box(f'{root.name}_float_band_{j}',(w*.60,y,rim-.235),(.009,.055,.032),ink,root,bevel=.004)


def _crop_payload(spec,root,detail,w,d,rim):
    p=spec['parameters']; crop=p['commodity']; token=p['produceToken']; leaf='foliage_leaf_01'
    rope=_roles(spec)[3]; rng=seeded_rng(spec['seed'])
    n=lambda part:f'{root.name}_{part}'
    if crop in ('wheat','barley','flax'):
        for bundle in range(3):
            x=(bundle-1)*w*.21
            for j in range(7 if detail else 4):
                dx=rng.uniform(-.06,.06); dy=rng.uniform(-d*.2,d*.2)
                top=rim+.14+rng.uniform(0,.12)
                add_rope_line(n(f'stalk_{bundle}_{j}'),[(x+dx,dy,rim-.22),(x+dx*.7,dy,top)],.008,token,root,vertices=5)
                if crop!='flax':
                    for k in range(3 if detail else 2):
                        add_ico(n(f'ear_{bundle}_{j}_{k}'),(x+dx*.7+(-1)**k*.012,dy,top-.06+k*.025),
                                (.018,.022,.032 if crop=='wheat' else .041),token,root,subdivisions=1)
            add_rope_line(n(f'bundle_tie_{bundle}'),[(x+.075*math.cos(k*math.tau/12),.08*math.sin(k*math.tau/12),rim+.025)
                for k in range(13)],.012,rope,root,vertices=5)
    else:
        for i in range(11 if detail else 7):
            x=((i%4)-1.5)*w*.19+rng.uniform(-.018,.018)
            y=((i//4)-1)*d*.24
            z=rim-.015+(i%3)*.018
            if crop=='carrot':
                add_lofted_form(n(f'carrot_{i}'),[((x-.025,y,z-.18),.009,.009),((x,y,z-.05),.042,.039),
                    ((x+.01,y,z+.06),.048,.044),((x+.01,y,z+.09),.025,.024)],token,root,sides=8)
            elif crop=='corn':
                add_lofted_form(n(f'cob_{i}'),[((x,y,z-.16),.018,.018),((x,y,z-.10),.055,.048),
                    ((x+.02,y,z+.10),.047,.044),((x+.03,y,z+.17),.014,.014)],token,root,sides=8)
            elif crop=='olive':
                for k in range(4 if detail else 2):
                    add_ico(n(f'olive_{i}_{k}'),(x+(k%2)*.043,y+(k//2)*.035,z),(.024,.021,.031),token,root,subdivisions=1)
            else:
                radius=.072 if crop=='potato' else .068
                add_lofted_form(n(f'produce_{i}'),[((x,y,z+dz),radius*a,radius*b) for dz,a,b in
                    [(-.065,.24,.30),(-.04,.9,.8),(.015,1, .94),(.057,.70,.66),(.068,.25,.25)]],token,root,sides=9 if detail else 7)
            if crop in ('carrot','corn','apple','tomato'):
                for k in range(3 if crop in ('carrot','corn') else 1):
                    add_tri_prism(n(f'leaf_{i}_{k}'),(x+(k-1)*.02,y,z+.07),(.035,.012,.15 if crop in ('carrot','corn') else .035),
                                  leaf,root,rotation=(.2*(k-1),.25*(k-1),k*1.7))


def _build(spec,root,fish):
    for index,level in create_lod_roots(spec,root):
        w,d,h,rim=_frame(spec,level,index==0)
        (_fish_payload if fish else _crop_payload)(spec,level,index==0,w,d,rim)
        consolidate_lod_level(level,level.name)


def fish_trade_pack(spec,root):
    _build(spec,root,True)


def crop_trade_pack(spec,root):
    _build(spec,root,False)
