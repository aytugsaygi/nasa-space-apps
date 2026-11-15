"""
Z-Anatomy Blender dosyasından hologram modeli üretir.

Kaynak: Z-Anatomy - The libre 3D atlas of anatomy (CC BY-SA 4.0),
temel model BodyParts3D (CC BY-SA 2.1 Japan). Üretilen GLB de CC BY-SA 4.0'dır.
Lisansı ticari olmayan (NC) parçalar (iç kulak, böbrek) kullanılmaz.

Çıktı:
  - anatomy.glb: 8 bölge için dış yüzey (skin_<bölge>) ile tek parça kas ve iskelet katmanları.
    Kas/iskelet köşe noktalarının rengi (COLOR_0) yapı numarasını taşır: R*255 + G*255*256.
  - anatomy-names.json: her katman için [ad, Latince ad, bölge numarası] listesi (yapı numarası = sıra + 1).

Çalıştırma (betik otomatik çalıştırma kapalı):
  blender -b --disable-autoexec Startup.blend --python export-zanatomy.py -- <anatomy.glb> <anatomy-names.json> <TA2.csv>
"""

import json
import re
import sys

import bmesh
import bpy
from mathutils import Vector, kdtree
from mathutils.bvhtree import BVHTree

ARGS = sys.argv[sys.argv.index('--') + 1 :]
OUT, NAMES_OUT, TA2_PATH = ARGS[0], ARGS[1], ARGS[2]
# Web için katman başına toplam üçgen hedefi
TARGET_TRIS = {'muscles': 560_000, 'bones': 300_000}

# Lisans: iç kulak (CC BY-NC-SA) ve böbrek (CC BY-NC) modelleri ticari olmayan lisanslıdır, kullanılmaz.
# "White matter" modelinin lisansı belirtilmemiştir, kullanılmaz.
EXCLUDE_LICENSE = re.compile(r'^(cochlea|vestibule)$|semicircular|utricle|saccule|endolymph|perilymph|kidney|renal pelvis|white matter', re.I)
# Görünürlük ve sunum: organları örten zarlar, çok sayıda küçük lenf düğümü ve dış genital organlar
EXCLUDE_VIEW = re.compile(r'pleura|spinal dura|^dura mater|arachnoid|pia mater|peritoneum|omentum|mesentery|\bnodes\b|penis|testis|scrot', re.I)

REGIONS = ['bas', 'gogus', 'sirt', 'ustKol', 'onKol', 'eller', 'bacaklar', 'ayaklar']

SKIN_MAP = {
    'bas': [
        'Angle of mouth', 'Anterior notch of auricle', 'Antihelix', 'Antitragus', 'Apex of auricle', 'Auricular region',
        'Auricular tubercle', 'Buccal region', 'Carotid triangle', 'Cavity of concha', 'Concha of auricle',
        'Crura of antihelix', 'Cymba conchae', 'Eminentia conchae', 'Eminentia fossae triangularis', 'Eminentia scaphae',
        'Eyebrow', 'Fossa antihelica', 'Frontal region', 'Greater supraclavicular fossa', 'Helix', 'Infra-orbital region',
        'Intertragic incisure', 'Labial commissure', 'Lateral region of neck', 'Lesser supraclavicular fossa',
        'Lobule of auricle', 'Mastoid region', 'Mental region', 'Mentolabial sulcus', 'Muscular triangle', 'Nasal region',
        'Nasolabial sulcus', 'Occipital region', 'Oral region', 'Orbital region', 'Parietal region',
        'Parotideomasseteric region', 'Philtrum', 'Posterior auricular groove', 'Posterior region of neck', 'Scapha',
        'Sternocleidomastoid region', 'Submandibular triangle', 'Submental triangle', 'Temporal region', 'Tragus',
        'Triangular fossa', 'Tubercle of upper lip', 'Zygomatic region',
    ],
    'gogus': [
        'Deltopectoral triangle', 'Epigastric region', 'Hypochondriac region', 'Hypogastric region', 'Infraclavicular fossa',
        'Inframammary region', 'Inguinal region', 'Lateral region of abdomen', 'Lateral region of thorax', 'Mammary region',
        'Pectoral region', 'Presternal region', 'Umbilical region', 'Umbilicus',
    ],
    'sirt': [
        'Gluteal fold', 'Gluteal region', 'Infrascapular region', 'Interscapular region', 'Lumbar region',
        'Sacral region', 'Scapular region', 'Triangle of auscultation', 'Vertebral region',
    ],
    'ustKol': ['Anterior region of arm', 'Posterior region of arm', 'Deltoid region', 'Lateral bicipital groove', 'Medial bicipital groove'],
    'onKol': [
        'Anterior region of elbow', 'Posterior region of elbow', 'Cubital fossa', 'Anterior region of forearm',
        'Posterior region of forearm', 'Lateral border of forearm', 'Medial border of forearm', 'Anterior region of wrist',
        'Posterior region of wrist', 'Radial foveola',
    ],
    'eller': ['Dorsal surfaces of digits of hand', 'Dorsum of hand', 'Nail plate', 'Palm', 'Palmar surfaces of digits of hand', 'Perionyx'],
    'bacaklar': [
        'Anterior region of knee', 'Posterior region of knee', 'Anterior region of leg', 'Posterior region of leg',
        'Anterior region of thigh', 'Posterior region of thigh', 'Femoral triangle', 'Hip region', 'Popliteal fossa',
    ],
    'ayaklar': [
        'Anterior region of ankle', 'Distal transverse arch of foot', 'Proximal transverse arch of foot',
        'Dorsal surfaces of digits of foot', 'Dorsum of foot', 'Hallucial eminence', 'Heel region', 'Lateral border of foot',
        'Medial border of foot', 'Lateral malleolus', 'Medial malleolus', 'Lateral part of longitudinal arch of foot',
        'Medial part of longitudinal arch of foot', 'Lateral retromalleolar region', 'Medial retromalleolar region',
        'Metatarsal region', 'Nail plate (foot)', 'Perionyx (foot)', 'Plantar surfaces of digits of foot', 'Sole',
    ],
}
NAME_TO_REGION = {n: r for r, names in SKIN_MAP.items() for n in names}
# Sunumda dikkat dağıtmaması için dış genital ve perine yüzeyi kullanılmaz
SKIP_SKIN = {'Urogenital region', 'Anal region'}

# Dışarıdan görünmeyen derin kaslar: hologramda katkısı yok, sadece boyut artırır.
# Karın duvarının iç katmanları (iç eğik ve enine karın kası) ile kasıkta görünen iliopsoas (psoas, iliacus) dahildir.
DEEP = re.compile(
    r'intercostal|transversus thoracis|innermost|pharyn|palat|stylo|gloss|laryn|uvula|veli|arytenoid|cricothyroid|'
    r'diaphragm|quadratus lumborum|multifidus|rotatores|interspinal|intertransvers|levator ani|coccygeus|'
    r'obturator internus|sphincter|tongue|subcostal|levatores costarum|semispinalis|longus colli|longus capitis|'
    r'bulbospongiosus|ischiocavernosus|perine|cremaster|dartos|penis|scrot|rectus capitis|obliquus capitis|scalene|auricular|tarsal muscle|stapedius|tensor tympani|ocular|rectus (superior|inferior|medialis|lateralis)|'
    # Kasları dıştan saran fasya ve kas arası zarlar: kasların üstünü örter
    r'\bfascia\b|intermuscular septum|investing|'
    # Kas olmayan küçük yardımcı yapılar (bursa ve tendon kılıfları): kasların üstünde durup tıklamayı kaslardan alır
    r'bursa|tendon sheath|synovial sheath|fibrous sheath',
    re.I,
)


def base_name(name):
    return re.sub(r'\.(l|r|\d+)$', '', re.sub(r'\.\d{3}$', '', name))


def side_of(name):
    n = re.sub(r'\.\d{3}$', '', name)
    return 'sol' if n.endswith('.l') else 'sağ' if n.endswith('.r') else None


# İngilizce adın Latince karşılığı (Terminologia Anatomica 2)
LATIN = {}
with open(TA2_PATH, encoding='utf-8-sig') as f:
    # Dosyada her satırın tamamı tırnak içinde: "id;English;Latin;..."
    for line in f:
        row = line.strip().strip('"').split(';')
        if len(row) > 2 and row[1]:
            LATIN.setdefault(row[1].strip().lower(), row[2].strip())


def unhide(layer_col):
    """Gizli koleksiyonların da değerlendirilmesi (modifier, eğri kalınlığı) için görünür yapar."""
    layer_col.exclude = False
    layer_col.hide_viewport = False
    layer_col.collection.hide_viewport = False
    for ch in layer_col.children:
        unhide(ch)


unhide(bpy.context.view_layer.layer_collection)
for o in bpy.data.objects:
    o.hide_viewport = False
    try:
        o.hide_set(False)
    except RuntimeError:
        pass

# Damarlar 0,5 mm yarıçaplı eğriler: hologramda görünür olmaları için kalınlaştır, köşe sayısını azalt
for cname, min_r in [('5: Cardiovascular system', 0.0012), ('7: Nervous system & Sense organs', 0.0008)]:
    for o in bpy.data.collections[cname].objects:
        if o.type == 'CURVE':
            o.data.bevel_depth = max(o.data.bevel_depth * 3, min_r)
            o.data.bevel_resolution = 2
            o.data.resolution_u = min(o.data.resolution_u, 6)
bpy.context.view_layer.update()
DG = bpy.context.evaluated_depsgraph_get()


def triangles_of(obj):
    """Nesnenin modifier uygulanmış, dünya koordinatlı üçgenleri."""
    ev = obj.evaluated_get(DG)
    try:
        me = ev.to_mesh()
    except RuntimeError:
        return None
    if me is None or len(me.polygons) == 0:
        ev.to_mesh_clear()
        return None
    me.transform(obj.matrix_world)
    bm = bmesh.new()
    bm.from_mesh(me)
    ev.to_mesh_clear()
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    # Aynalanmış (negatif ölçekli) nesnelerde üçgen yönü ters kalır; düzeltilmezse yüzeyin
    # bir yarısı içe bakar ve iki yarı farklı aydınlanır
    if obj.matrix_world.determinant() < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    bm.normal_update()
    return bm


def new_object(bm, name):
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def decimate(obj, ratio):
    if ratio >= 1:
        return
    mod = obj.modifiers.new('dec', 'DECIMATE')
    mod.ratio = ratio
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
        bpy.ops.object.modifier_apply(modifier='dec')


# ---------- Dış yüzey (bölgelere göre) ----------
skin_col = bpy.data.collections['9: Regions of human body']
skin_bms = {r: bmesh.new() for r in REGIONS}
unmapped = set()
for o in skin_col.objects:
    if o.type != 'MESH' or o.name.endswith(('.j', '.g')):
        continue
    b = base_name(o.name)
    region = NAME_TO_REGION.get(b)
    if region is None:
        if b not in SKIP_SKIN and 'hair' not in b.lower() and 'eyelash' not in b.lower():
            unmapped.add(b)
        continue
    tmp = triangles_of(o)
    if tmp is None:
        continue
    bm = skin_bms[region]
    for f in tmp.faces:
        try:
            bm.faces.new([bm.verts.new(v.co) for v in f.verts])
        except ValueError:
            pass
    tmp.free()
print('Eşlenmeyen dış yüzey parçaları:', sorted(unmapped))

# Bir noktanın bölgesi: en yakın dış yüzey üçgeninin bölgesi
skin_centers = []
for i, r in enumerate(REGIONS):
    for f in skin_bms[r].faces:
        skin_centers.append((f.calc_center_median().copy(), i))
skin_tree = kdtree.KDTree(len(skin_centers))
for idx, (c, _) in enumerate(skin_centers):
    skin_tree.insert(c, idx)
skin_tree.balance()


def region_index(co):
    return skin_centers[skin_tree.find(co)[1]][1]


exported = [new_object(skin_bms[r], f'skin_{r}') for r in REGIONS]


# ---------- Karın duvarı ----------
# Z-Anatomy'de eğik ve enine karın kaslarının yassı kirişleri (aponevroz) düz karın kasının (rectus abdominis)
# önünü tamamen örter; karın tek parça görünür ve rectus seçilemez. Bu kasların rectus'un hemen önünde kalan
# yüzleri atılır: önde rectus ve ak çizgi, yanlarda eğik kaslar ayrı ayrı görünür.
ABDOMINAL_WALL = re.compile(r'^(external abdominal oblique|internal abdominal oblique|transversus abdominis) muscle$', re.I)
OVER_RECTUS = 0.03  # m: yüzün önünden içeri doğru bu mesafede rectus varsa yüz atılır


def rectus_tree():
    verts, polys = [], []
    for o in bpy.data.collections['4: Muscular system'].all_objects:
        if base_name(o.name) != 'Rectus abdominis muscle' or o.type != 'MESH':
            continue
        tmp = triangles_of(o)
        if tmp is None:
            continue
        offset = len(verts)
        tmp.verts.index_update()
        verts.extend(v.co.copy() for v in tmp.verts)
        polys.extend([offset + v.index for v in f.verts] for f in tmp.faces)
        tmp.free()
    return BVHTree.FromPolygons(verts, polys) if polys else None


def region_mean_y(region):
    ys = [c.y for c, i in skin_centers if i == REGIONS.index(region)]
    return sum(ys) / max(len(ys), 1)


RECTUS = rectus_tree()
# Vücudun önden arkaya doğrultusu: göğüs-karın yüzeyinden sırt yüzeyine
INWARD = Vector((0.0, 1.0 if region_mean_y('sirt') > region_mean_y('gogus') else -1.0, 0.0))


def trim_over_rectus(bm):
    if RECTUS is None:
        return 0
    doomed = [f for f in bm.faces if RECTUS.ray_cast(f.calc_center_median(), INWARD, OVER_RECTUS)[0] is not None]
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    return len(doomed)


# ---------- Kas ve iskelet katmanları ----------
def build_layer(name, objects):
    bm = bmesh.new()
    sid_layer = bm.verts.layers.int.new('sid')
    structures = []
    for o in objects:
        tmp = triangles_of(o)
        if tmp is None:
            continue
        if name == 'muscles' and ABDOMINAL_WALL.match(base_name(o.name)):
            print(f'{o.name}: rectus önündeki {trim_over_rectus(tmp)} yüz atıldı')
            if not tmp.faces:
                tmp.free()
                continue
        sid = len(structures) + 1
        center = Vector((0.0, 0.0, 0.0))
        for v in tmp.verts:
            center += v.co
        center /= max(len(tmp.verts), 1)
        b = base_name(o.name)
        side = side_of(o.name)
        label = f'{b} ({side})' if side else b
        structures.append([label, LATIN.get(b.lower(), ''), region_index(center)])
        for f in tmp.faces:
            vs = []
            for v in f.verts:
                nv = bm.verts.new(v.co)
                nv[sid_layer] = sid
                vs.append(nv)
            try:
                bm.faces.new(vs)
            except ValueError:
                pass
        tmp.free()

    # Sadeleştirmeden sonra her köşeye en yakın özgün köşenin yapı numarası verilir
    bm.verts.ensure_lookup_table()
    tree = kdtree.KDTree(len(bm.verts))
    ids = []
    for i, v in enumerate(bm.verts):
        tree.insert(v.co, i)
        ids.append(v[sid_layer])
    tree.balance()

    total = len(bm.faces)
    obj = new_object(bm, name)
    decimate(obj, min(1.0, TARGET_TRIS[name] / max(total, 1)))

    me = obj.data
    col = me.color_attributes.new('sid', 'FLOAT_COLOR', 'POINT')
    for i, v in enumerate(me.vertices):
        sid = ids[tree.find(v.co)[1]]
        col.data[i].color = ((sid % 256) / 255, (sid // 256) / 255, 0.0, 1.0)
    me.color_attributes.active_color = col
    me.color_attributes.render_color_index = me.color_attributes.find('sid')
    print(f'{name}: {len(structures)} yapı, {total} -> {len(me.polygons)} üçgen')
    return obj, structures


def pick(collections, keep):
    out = []
    for collection in collections:
        for o in bpy.data.collections[collection].objects:
            name = base_name(o.name)
            if o.type not in ('MESH', 'CURVE') or o.name.endswith(('.j', '.g', '.t')):
                continue
            if EXCLUDE_LICENSE.search(name) or EXCLUDE_VIEW.search(name) or not keep(o):
                continue
            out.append(o)
    return out


names = {}
for layer, collections, keep in [
    ('muscles', ['4: Muscular system'], lambda o: o.type == 'MESH' and not DEEP.search(o.name)),
    ('bones', ['1: Skeletal system'], lambda o: o.type == 'MESH'),
]:
    obj, structures = build_layer(layer, pick(collections, keep))
    exported.append(obj)
    names[layer] = structures

with open(NAMES_OUT, 'w', encoding='utf-8') as f:
    json.dump(names, f, ensure_ascii=False, separators=(',', ':'))

# ---------- Dışa aktarma ----------
bpy.ops.object.select_all(action='DESELECT')
for o in exported:
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_normals=True,
    export_texcoords=False,
    export_materials='NONE',
    export_vertex_color='ACTIVE',
    export_active_vertex_color_when_no_material=True,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=7,
    export_draco_position_quantization=14,
    export_draco_normal_quantization=10,
    export_draco_color_quantization=12,
)
print('Yazıldı:', OUT, NAMES_OUT)
