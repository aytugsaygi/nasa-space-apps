"""Quaternius glTF -> hologram antrenör için sade GLB.

Yalnızca en büyük mesh (gövde) kalır; göz, kaş, malzeme, doku ve UV/renk öznitelikleri atılır.
İskelet (düğümler, skin, ters bağ matrisleri) olduğu gibi korunur.
Kullanım (paket proje dışına indirilir, "Godot - UE" klasöründeki glTF kullanılır):
  python3 -I scripts/strip-trainer-model.py ".../Superhero_Male_FullBody.gltf" public/models/trainer-male.glb
  python3 -I scripts/strip-trainer-model.py ".../Superhero_Female_FullBody.gltf" public/models/trainer-female.glb
"""
import json
import os
import struct
import sys

src, dst = sys.argv[1], sys.argv[2]
g = json.load(open(src))
base = os.path.dirname(src)
bins = [open(os.path.join(base, b['uri']), 'rb').read() for b in g['buffers']]

KEEP_ATTRS = ('POSITION', 'NORMAL', 'JOINTS_0', 'WEIGHTS_0')


def vcount(m):
    return g['accessors'][m['primitives'][0]['attributes']['POSITION']]['count']


body_idx = max(range(len(g['meshes'])), key=lambda i: vcount(g['meshes'][i]))
body = g['meshes'][body_idx]
assert len(body['primitives']) == 1, 'tek primitive bekleniyor'

out_buf = bytearray()
out_views, out_acc = [], []
acc_map = {}


def copy_accessor(i):
    if i in acc_map:
        return acc_map[i]
    a = dict(g['accessors'][i])
    bv = g['bufferViews'][a['bufferView']]
    data = bins[bv.get('buffer', 0)]
    comp = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}[a['componentType']]
    ncomp = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    elem = comp * ncomp
    stride = bv.get('byteStride', elem)
    start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    chunk = b''.join(data[start + k * stride:start + k * stride + elem] for k in range(a['count']))
    while len(out_buf) % 4:
        out_buf.append(0)
    view = {'buffer': 0, 'byteOffset': len(out_buf), 'byteLength': len(chunk)}
    if 'target' in bv:
        view['target'] = bv['target']
    out_buf.extend(chunk)
    out_views.append(view)
    a['bufferView'] = len(out_views) - 1
    a.pop('byteOffset', None)
    out_acc.append(a)
    acc_map[i] = len(out_acc) - 1
    return acc_map[i]


prim = body['primitives'][0]
new_prim = {'attributes': {k: copy_accessor(prim['attributes'][k]) for k in KEEP_ATTRS}, 'indices': copy_accessor(prim['indices'])}
if 'mode' in prim:
    new_prim['mode'] = prim['mode']
skins = []
for s in g['skins']:
    s = dict(s)
    s['inverseBindMatrices'] = copy_accessor(s['inverseBindMatrices'])
    skins.append(s)

nodes = []
for n in g['nodes']:
    n = dict(n)
    if 'mesh' in n:
        if n['mesh'] == body_idx:
            n['mesh'] = 0
            n['name'] = 'Body'
        else:
            n.pop('mesh')
            n.pop('skin', None)
    nodes.append(n)

out = {
    'asset': {'version': '2.0', 'generator': 'strip-trainer-model.py (Quaternius Universal Base Characters, CC0)'},
    'scene': 0,
    'scenes': g['scenes'],
    'nodes': nodes,
    'meshes': [{'name': 'Body', 'primitives': [new_prim]}],
    'skins': skins,
    'accessors': out_acc,
    'bufferViews': out_views,
    'buffers': [{'byteLength': len(out_buf)}],
}
js = json.dumps(out, separators=(',', ':')).encode()
js += b' ' * ((4 - len(js) % 4) % 4)
while len(out_buf) % 4:
    out_buf.append(0)
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out_buf))
glb += struct.pack('<II', len(js), 0x4E4F534A) + js
glb += struct.pack('<II', len(out_buf), 0x004E4942) + bytes(out_buf)
open(dst, 'wb').write(glb)
print(dst, len(glb), 'bytes; verts', out_acc[new_prim['attributes']['POSITION']]['count'])
