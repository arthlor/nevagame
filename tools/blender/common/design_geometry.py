"""Small, deterministic, closed design meshes. No Blender or third-party dependency.

Coordinates use Blender's Z-up convention. These builders replace geometric
primitives, not the catalog, exporter, palette, collision or animation system.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import math
import random
from collections import Counter
from collections.abc import Sequence

Vec3 = tuple[float, float, float]
Face = tuple[int, ...]


@dataclass(frozen=True)
class DesignMesh:
    vertices: tuple[Vec3, ...]
    faces: tuple[Face, ...]


def stable_seed(value: object) -> int:
    """Never use Python's process-randomized hash() for authored geometry."""
    return int.from_bytes(hashlib.blake2b(str(value).encode('utf-8'), digest_size=8).digest(), 'little')


def _positive(*values: float) -> None:
    if not all(math.isfinite(v) and v > 0 for v in values):
        raise ValueError('Design dimensions must be finite and positive')


def _sub(a: Vec3, b: Vec3) -> Vec3:
    return tuple(a[i] - b[i] for i in range(3))


def _cross(a: Vec3, b: Vec3) -> Vec3:
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def _dot(a: Vec3, b: Vec3) -> float:
    return sum(a[i]*b[i] for i in range(3))


def signed_volume(mesh: DesignMesh) -> float:
    # Relative to a local origin: distant placement must not cause cancellation.
    origin = mesh.vertices[0]
    total = 0.0
    for f in mesh.faces:
        a = _sub(mesh.vertices[f[0]], origin)
        for i in range(1, len(f)-1):
            b, c = _sub(mesh.vertices[f[i]], origin), _sub(mesh.vertices[f[i+1]], origin)
            total += _dot(a, _cross(b, c)) / 6.0
    return total


def _closed(vertices: Sequence[Vec3], faces: Sequence[Face]) -> DesignMesh:
    mesh = DesignMesh(tuple(tuple(float(c) for c in p) for p in vertices), tuple(tuple(f) for f in faces))
    if signed_volume(mesh) < 0:
        mesh = DesignMesh(mesh.vertices, tuple(tuple(reversed(f)) for f in mesh.faces))
    return mesh


def validate_mesh(mesh: DesignMesh) -> None:
    """Fail on topology mistakes; do not silently repair the artist's mesh."""
    if len(mesh.vertices) < 4 or not mesh.faces:
        raise ValueError('A closed mesh needs at least four vertices and faces')
    if not all(len(p) == 3 and all(math.isfinite(c) for c in p) for p in mesh.vertices):
        raise ValueError('Nonfinite vertex')
    edges: Counter = Counter()
    oriented: Counter = Counter()
    used = set()
    for face in mesh.faces:
        if len(face) < 3 or len(set(face)) != len(face):
            raise ValueError('Degenerate face')
        if any(i < 0 or i >= len(mesh.vertices) for i in face):
            raise ValueError('Face index out of range')
        used.update(face)
        area = 0.0
        a = mesh.vertices[face[0]]
        for j in range(1, len(face)-1):
            n = _cross(_sub(mesh.vertices[face[j]], a), _sub(mesh.vertices[face[j+1]], a))
            area += math.sqrt(_dot(n, n)) * .5
        if area <= 1e-15:
            raise ValueError('Zero-area face')
        for a, b in zip(face, face[1:] + face[:1]):
            edges[tuple(sorted((a, b)))] += 1
            oriented[(a, b)] += 1
    if len(used) != len(mesh.vertices):
        raise ValueError('Loose vertex')
    if any(n != 2 for n in edges.values()):
        raise ValueError('Open or non-manifold edge')
    if any(oriented[(a, b)] != 1 or oriented[(b, a)] != 1 for a, b in edges):
        raise ValueError('Inconsistent face winding')
    if signed_volume(mesh) <= 0:
        raise ValueError('Inverted or zero-volume shell')


def loft(rings: Sequence[Sequence[Vec3]]) -> DesignMesh:
    """Loft equal-sized perimeter rings, including closed end caps."""
    if len(rings) < 2 or len(rings[0]) < 3:
        raise ValueError('Loft requires two rings with three or more vertices')
    n = len(rings[0])
    if any(len(ring) != n for ring in rings):
        raise ValueError('Loft rings must have identical vertex counts')
    vertices = [point for ring in rings for point in ring]
    faces = []
    for row in range(len(rings)-1):
        for j in range(n):
            a, b = row*n+j, row*n+(j+1)%n
            faces.append((a, b, b+n, a+n))
    faces.extend((tuple(reversed(range(n))), tuple((len(rings)-1)*n+j for j in range(n))))
    return _closed(vertices, faces)


def transformed(mesh: DesignMesh, location: Vec3 = (0, 0, 0), rotation: Vec3 = (0, 0, 0)) -> DesignMesh:
    """Euler XYZ, applied into vertices, like the existing primitive helpers."""
    sx, sy, sz = (math.sin(a) for a in rotation)
    cx, cy, cz = (math.cos(a) for a in rotation)
    vertices = []
    for x, y, z in mesh.vertices:
        y, z = cx*y-sx*z, sx*y+cx*z
        x, z = cy*x+sy*z, -sy*x+cy*z
        x, y = cz*x-sz*y, sz*x+cz*y
        vertices.append((x+location[0], y+location[1], z+location[2]))
    return DesignMesh(tuple(vertices), mesh.faces)


def crafted_box(dimensions: Vec3, bevel: float = .025, seed: int = 0) -> DesignMesh:
    """Planed timber: straight endpoints, eased arrises, restrained middle swell.

    The supplied envelope is never exceeded. No random crooked posts, exploded
    grain strips or per-face color noise. Chamfered: 24 vertices / 44 triangles.
    Explicit bevel=0 retains the inexpensive 8-vertex / 12-triangle box.
    """
    _positive(*dimensions)
    if not math.isfinite(bevel) or bevel < 0:
        raise ValueError('Bevel must be finite and nonnegative')
    axis = max(range(3), key=lambda i: dimensions[i])
    u, v = (axis+1)%3, (axis+2)%3
    length, a, b = dimensions[axis], dimensions[u]*.5, dimensions[v]*.5
    if bevel == 0:
        # Far-LOD builders deliberately turn chamfers off. Respect that budget.
        rings = []
        for t in (-.5, .5):
            ring = []
            for x, y in ((-a,-b),(a,-b),(a,b),(-a,b)):
                co = [0.0, 0.0, 0.0]
                co[axis], co[u], co[v] = t*length, x, y
                ring.append(tuple(co))
            rings.append(ring)
        return loft(rings)
    chamfer = min(bevel, min(a, b)*.32)
    outline = ((-a+chamfer,-b), (a-chamfer,-b), (a,-b+chamfer), (a,b-chamfer),
               (a-chamfer,b), (-a+chamfer,b), (-a,b-chamfer), (-a,-b+chamfer))
    rng = random.Random(seed)
    taper = rng.uniform(.986, .996)
    rings = []
    for t, factor in ((-.5, taper), (0, 1), (.5, taper)):
        ring = []
        for x, y in outline:
            co = [0.0, 0.0, 0.0]
            co[axis], co[u], co[v] = t*length, x*factor, y*factor
            ring.append(tuple(co))
        rings.append(ring)
    return loft(rings)


def roof_tile(d0: float, d1: float, u0: float, u1: float, *, half_span: float,
              pitch: float, eave_z: float, side: int, center_x: float = 0,
              center_y: float = 0, side_gable: bool = False,
              thickness: float = .085, camber: float = .008) -> DesignMesh:
    """Closed, softly crowned clay wedge in roof-surface coordinates.

    d runs UP a roof slope, u runs along the ridge. Headlap is supplied by the
    caller. A thicker downhill nose puts the next course physically above the
    previous course instead of overlapping coplanar boxes.
    """
    _positive(d1-d0, u1-u0, half_span, thickness)
    if side not in (-1, 1) or not 0 <= pitch < math.pi*.49:
        raise ValueError('Invalid roof side or pitch')
    co, si = math.cos(pitch), math.sin(pitch)
    rings = []
    for d, lip in ((d0, thickness), (d1, thickness*.32)):
        # The underside follows the wedge too. At a standard 24% headlap,
        # the upper nose clears the previous course instead of sharing its base.
        underside = lip * .62
        cross = ((u0,underside), (u1,underside), (u1,lip), ((u0+u1)*.5,lip+camber), (u0,lip))
        ring = []
        for u, normal_offset in cross:
            transverse = side*(half_span-co*d+si*normal_offset)
            z = eave_z+si*d+co*normal_offset
            ring.append((u+center_x, transverse+center_y, z) if side_gable
                        else (transverse+center_x, u+center_y, z))
        rings.append(ring)
    return loft(rings)


def clipped_courses(slope: float, ridge_length: float, rows: int, columns: int):
    """Yield clipped staggered rectangles; no half-tile beyond either gable."""
    _positive(slope, ridge_length)
    if not isinstance(rows, int) or not isinstance(columns, int) or rows < 1 or columns < 1:
        raise ValueError('Roof rows and columns must be positive integers')
    ds, du = slope/rows, ridge_length/columns
    for row in range(rows):
        d0, d1 = row*ds, min(slope, (row+1.24)*ds)
        offset = -.5*du if row%2 else 0
        for column in range(columns+(row%2)):
            a = -ridge_length*.5+column*du+offset
            b = a+du
            # Deliberate narrow seams, not the 12%-wide black channels of the old grid.
            u0, u1 = max(-ridge_length*.5,a), min(ridge_length*.5,b)
            gap = min(.012, (u1-u0)*.045)
            if u1-u0 > 2*gap:
                yield row, column, d0, d1, u0+gap*.5, u1-gap*.5


def ridge_cap(length: float, width: float = .30, height: float = .20, sides: int = 6) -> DesignMesh:
    """A hollow half-round tile, not a row of rectangular blocks."""
    _positive(length, width, height)
    if sides < 3:
        raise ValueError('Ridge caps require at least three arc segments')
    rx, rz = width*.5, height
    wall = min(width, height)*.16
    outline = [(rx*math.cos(j*math.pi/sides), rz*math.sin(j*math.pi/sides)) for j in range(sides+1)]
    outline += [((rx-wall)*math.cos(j*math.pi/sides), (rz-wall)*math.sin(j*math.pi/sides))
                for j in reversed(range(sides+1))]
    # End polygons are concave annuli: split them into paired arc quads, not an ngon fan.
    n = len(outline)
    verts = [(x,y,z) for y in (-length*.5,length*.5) for x,z in outline]
    faces = [(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
    for j in range(sides):
        k = n-1-j
        faces.append((j,k,k-1,j+1))
        faces.append((n+j,n+j+1,n+k-1,n+k))
    return _closed(verts, faces)


def folded_leaf(length: float, width: float, angle: float, *, pitch: float = .42,
                droop: float = 0, cup: float = .10, seed: int = 0) -> DesignMesh:
    """Pointed creased blade: broad shoulder, midrib ridge and a turned-down tip.

    Both ends collapse to a single apex, so the petiole and tip carry real
    triangles instead of the near-zero-width ring slivers that quantized
    exports can flip.
    """
    _positive(length, width)
    rng = random.Random(seed)
    twist = rng.uniform(-.12,.12)
    forward = (math.cos(angle), math.sin(angle), 0.0)
    across = (-forward[1], forward[0], 0.0)

    def section(t: float, breadth: float):
        reach = length*(math.cos(pitch)*t+.12*t*t)
        rise = length*(math.sin(pitch)*t+.20*math.sin(math.pi*t)-droop*.92*t*t)
        slope_x = math.cos(pitch)+.24*t
        slope_z = math.sin(pitch)+.20*math.pi*math.cos(math.pi*t)-1.84*droop*t
        norm = math.hypot(slope_x,slope_z)
        normal = (-forward[0]*slope_z/norm,-forward[1]*slope_z/norm,slope_x/norm)
        center = (forward[0]*reach,forward[1]*reach,rise)
        ridge = max(.0002,width*(.07+cup*.35)*math.sin(math.pi*(.04+.92*t)))
        asym = twist*math.sin(math.pi*t)
        offsets = [tuple(across[k]*width*breadth*(1+asym)+normal[k]*width*asym*.20 for k in range(3)),
                   tuple(normal[k]*ridge for k in range(3)),
                   tuple(-across[k]*width*breadth*(1-asym)-normal[k]*width*asym*.20 for k in range(3)),
                   tuple(-normal[k]*max(.0002,width*.018) for k in range(3))]
        return center, [tuple(center[k]+o[k] for k in range(3)) for o in offsets]

    base, _ = section(0, 0)
    rings = [section(t, breadth)[1] for t, breadth in ((.22,.34), (.48,.49), (.76,.29))]
    tip, _ = section(1, 0)
    vertices = [base] + [point for ring in rings for point in ring] + [tip]
    n = 4
    faces = [(0, 1+(j+1)%n, 1+j) for j in range(n)]
    for row in range(len(rings)-1):
        a, b = 1+row*n, 1+(row+1)*n
        faces.extend((a+j, a+(j+1)%n, b+(j+1)%n, b+j) for j in range(n))
    last = 1+(len(rings)-1)*n
    faces.extend((last+j, last+(j+1)%n, len(vertices)-1) for j in range(n))
    return _closed(vertices, faces)


def canopy(scale: Vec3, seed: int, sides: int = 10) -> DesignMesh:
    """A connected, off-centre leafy pad with a scalloped crown and shallow belly."""
    _positive(*scale)
    if sides < 6:
        raise ValueError('Canopy needs at least six sides')
    phase = random.Random(seed).uniform(-math.pi, math.pi)
    rings = []
    for z, radius in ((-.86,.34),(-.50,.80),(.02,1.0),(.54,.84),(.86,.43)):
        ring = []
        for i in range(sides):
            a = i*math.tau/sides
            # Coherent three-lobed clusters: same feature at every height, no chatter.
            r = radius*(.94+.045*math.sin(a*3+phase)+.015*math.cos(a*5-phase))
            shift = .035*math.sin(phase)*(z+.86)
            ring.append(((math.cos(a)*r+shift)*scale[0],
                         (math.sin(a)*r+.025*math.cos(phase)*z)*scale[1],
                         (z+.025*math.sin(a*3+phase)*(1-abs(z)))*scale[2]))
        rings.append(ring)
    return loft(rings)


def geological_mass(scale: Vec3, seed: int, sides: int = 8, rings: int = 4) -> DesignMesh:
    """Bedded, fractured rock with broad shoulders and a planar sloping crown."""
    _positive(*scale)
    if sides < 6:
        raise ValueError('Rock needs at least six sides')
    rng = random.Random(seed)
    phase = rng.uniform(-.14,.14)
    outline = [(math.cos(i*math.tau/sides+phase)*rng.uniform(.88,1),
                math.sin(i*math.tau/sides+phase)*rng.uniform(.90,1)) for i in range(sides)]
    levels = ((-1,.80),(-.68,1),(.28,.96),(.82,.65)) if rings >= 4 else ((-1,.84),(-.10,.98),(.82,.65))
    ring_data = []
    for z, radius in levels:
        ring = []
        for x,y in outline:
            zz = z if z == -1 else z+.12*x-.07*y
            ring.append(((x*radius+.06*(z+1))*scale[0],(y*radius-.025*(z+1))*scale[1],zz*scale[2]))
        ring_data.append(ring)
    return loft(ring_data)


def lobed_volume(scale: Vec3, seed: int, *, kind: str = 'apple', sides: int = 12) -> DesignMesh:
    """Fruit/food/sack silhouettes with an authored shoulder and a closed dimple."""
    _positive(*scale)
    profiles = {
        'apple': ((-1,.18),(-.72,.72),(-.15,1),(.46,.95),(.80,.61),(.71,.12)),
        'tomato': ((-.92,.22),(-.62,.78),(-.05,1),(.55,.91),(.88,.44),(.80,.10)),
        'bread': ((-.74,.56),(-.50,.92),(.05,1),(.54,.86),(.87,.45),(.92,.12)),
        'sack': ((-.96,.63),(-.63,.95),(.06,1),(.52,.78),(.83,.34),(1,.29)),
    }
    if kind not in profiles or sides < 6:
        raise ValueError('Unknown volume profile or insufficient sides')
    phase = random.Random(seed).uniform(-math.pi,math.pi)
    rings = []
    for z,r in profiles[kind]:
        ring = []
        for i in range(sides):
            a = i*math.tau/sides
            rib = 1+.027*math.cos(5*a+phase)*(.55+.45*abs(z))
            ring.append((math.cos(a)*r*rib*scale[0], math.sin(a)*r*rib*scale[1],z*scale[2]))
        rings.append(ring)
    return loft(rings)


def hat_brim(inner: float, outer: float, *, thickness: float = .018, sides: int = 16) -> DesignMesh:
    """Closed swept annulus with a lifted edge; the crown opening remains empty."""
    _positive(inner,outer-inner,thickness)
    if sides < 6:
        raise ValueError('Brim needs at least six sides')
    vertices = []
    # Four topological rings around the annulus; final profile joins back to first.
    for r, dz in ((inner,0),(outer,.016),(outer,.016-thickness),(inner,-thickness)):
        for i in range(sides):
            a=i*math.tau/sides
            wave=.024*(r-inner)/(outer-inner)*math.cos(2*a+.4)
            vertices.append((r*math.cos(a),r*math.sin(a)*.92,dz+wave))
    faces=[]
    for row in range(4):
        other=(row+1)%4
        for i in range(sides):
            j=(i+1)%sides
            faces.append((row*sides+i,row*sides+j,other*sides+j,other*sides+i))
    return _closed(vertices,faces)


def draped_panel(width: float,height: float,thickness: float, *, hem_ratio: float = 1,
                 fold: float = .012) -> DesignMesh:
    """A closed hanging cloth panel; front is -Y, top at +Z, origin at centre."""
    _positive(width,height,thickness,hem_ratio)
    cols, rows = 4, 3
    vertices=[]
    for back in (False, True):
        for j in range(rows+1):
            t=j/rows
            for i in range(cols+1):
                u=i/cols
                w=width*(hem_ratio+(1-hem_ratio)*t)
                y=-fold*math.cos(u*math.tau*2)*(1-t*.65)+(thickness*.5 if back else -thickness*.5)
                z=(t-.5)*height + .012*height*math.cos(u*math.tau)*(1-t)
                vertices.append(((u-.5)*w,y,z))
    n=(rows+1)*(cols+1)
    faces=[]
    for j in range(rows):
        for i in range(cols):
            a=j*(cols+1)+i;b=a+1;c=b+cols+1;d=a+cols+1
            faces.extend(((a,b,c,d),(n+d,n+c,n+b,n+a)))
    boundary=list(range(cols+1))
    boundary += [j*(cols+1)+cols for j in range(1,rows+1)]
    boundary += [rows*(cols+1)+i for i in reversed(range(cols))]
    boundary += [j*(cols+1) for j in reversed(range(1,rows))]
    for a,b in zip(boundary,boundary[1:]+boundary[:1]):
        faces.append((b,a,n+a,n+b))
    return _closed(vertices,faces)
