"""Narrow export corrections for declared solid-color source humanoids.

Blender 5.2's glTF exporter substitutes white for a shared vertex-color layer on
second and later material regions (primitive_extract.material_idxs_using_vc).
Repair only the already-validated, palette-owned COLOR_0 bytes. Geometry, normals,
UVs, joints, weights, bind matrices, timestamps and all other accessors stay exact.
"""
from __future__ import annotations
import hashlib,json,math,struct
from pathlib import Path

COMPONENT={5121:('B',1),5123:('H',2),5125:('I',4),5126:('f',4)}


def restore_solid_humanoid_colors(path,spec,palette):
    if 'humanoidAuthoring' not in spec:return None
    path=Path(path);data=bytearray(path.read_bytes())
    if data[:4]!=b'glTF' or struct.unpack_from('<I',data,4)[0]!=2:raise ValueError('Expected raw GLB2 export')
    offset=12;document=None;binary_start=None
    while offset<len(data):
        size,kind=struct.unpack_from('<II',data,offset)
        if kind==0x4e4f534a:document=json.loads(data[offset+8:offset+8+size])
        elif kind==0x004e4942:binary_start=offset+8
        offset+=8+size
    if document is None or binary_start is None:raise ValueError('GLB source export needs JSON and BIN chunks')
    allowed=set(spec['humanoidAuthoring']['materialMap'].values())|set(spec['humanoidAuthoring'].get('accessoryPalette',[]))
    touched={};changed=0;primitives=0
    def accessor(index):
        a=document['accessors'][index];view=document['bufferViews'][a['bufferView']]
        if view.get('buffer',0)!=0 or 'sparse'in a:raise ValueError('Raw source color correction requires dense embedded accessors')
        kind,size=COMPONENT[a['componentType']];width={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']]
        return a,kind,size,width,binary_start+view.get('byteOffset',0)+a.get('byteOffset',0),view.get('byteStride',size*width)
    for mesh in document.get('meshes',[]):
        for primitive in mesh.get('primitives',[]):
            material=document['materials'][primitive['material']];token=material.get('name')
            if token not in allowed:raise ValueError(f'Undeclared solid humanoid palette region {token}')
            pbr=material.get('pbrMetallicRoughness',{})
            if pbr.get('baseColorFactor',[1,1,1,1])!=[1,1,1,1] or 'baseColorTexture'in pbr:raise ValueError('Source color must be applied once through COLOR_0 with white PBR base')
            color=palette[token]['hex'].lstrip('#');srgb=[int(color[i:i+2],16)/255 for i in (0,2,4)]
            rgba=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in srgb]+[1.]
            a,kind,size,width,start,stride=accessor(primitive['attributes']['COLOR_0'])
            if kind!='f' or a.get('normalized',False):raise ValueError('Source humanoid colors must retain FLOAT32 palette precision')
            if 'indices'in primitive:
                ia,ik,isz,iw,ib,ist=accessor(primitive['indices']);indices={struct.unpack_from('<'+ik,data,ib+i*ist)[0] for i in range(ia['count'])}
            else:indices=set(range(a['count']))
            for i in indices:
                for c in range(width):
                    address=start+i*stride+c*size;value=rgba[c]
                    if address in touched and abs(touched[address]-value)>1e-7:raise ValueError('Different palette regions share the same color corner')
                    before=struct.unpack_from('<f',data,address)[0]
                    if not math.isfinite(before):raise ValueError('Source export contains a non-finite color')
                    if abs(before-value)>1e-7:changed+=1
                    touched[address]=value;struct.pack_into('<f',data,address,value)
            primitives+=1
    before=bytearray(path.read_bytes());after=bytearray(data)
    # Establish an exact byte-level non-color invariant, not an informal promise.
    for address in touched:before[address:address+4]=b'\0'*4;after[address:address+4]=b'\0'*4
    if before!=after:raise ValueError('Solid-color correction changed a non-color byte')
    path.write_bytes(data)
    return {'primitives':primitives,'correctedChannels':changed,'otherBytesUnchanged':True,'maskedPayloadSha256':hashlib.sha256(after).hexdigest()}
