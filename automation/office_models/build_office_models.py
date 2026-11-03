"""Bangun Kantor Penjaga Keamanan di Blender mengikuti konsep Nano Banana yang disetujui CEO.

Jalankan:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python-exit-code 1 --python automation/office_models/build_office_models.py -- --blend <OUT.blend>

Satu koleksi per GLB: Room (lantai, dinding, tulisan, meja hiasan), Agent (di titik asal),
dan Station_<id> yang sudah berada di posisi akhirnya. Posisi meja harus sama dengan
LAYOUT di frontend/src/office/securityOfficeScene.ts. Koordinat three.js (x, z) menjadi
(x, -z) di Blender; depan setiap perabot menghadap -Y (glTF memetakannya ke +Z).
Material "Screen" diwarnai ulang oleh halaman sesuai tingkat temuan.
"""

import argparse
import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
PALETTE = {
    "Skin": ((0.89, 0.72, 0.6), 0.6, 0),
    "Hair": ((0.2, 0.2, 0.21), 0.7, 0),
    "Shirt": ((0.2, 0.42, 0.77), 0.65, 0),
    "Collar": ((0.15, 0.33, 0.64), 0.65, 0),
    "Pants": ((0.17, 0.17, 0.18), 0.7, 0),
    "Shoe": ((0.2, 0.21, 0.22), 0.5, 0),
    "Badge": ((0.88, 0.71, 0.18), 0.35, 0.2),
    "VisorFrame": ((0.18, 0.19, 0.2), 0.4, 0),
    "Visor": ((0.48, 0.92, 0.55), 0.2, 1.6),
    "Mouth": ((0.12, 0.1, 0.1), 0.6, 0),
    "White": ((0.9, 0.9, 0.89), 0.55, 0),
    "Drawer": ((0.8, 0.81, 0.8), 0.55, 0),
    "Metal": ((0.14, 0.15, 0.17), 0.4, 0),
    "Monitor": ((0.14, 0.16, 0.2), 0.45, 0),
    "Screen": ((0.6, 0.64, 0.7), 0.3, 0.6),
    "ScreenUi": ((0.95, 0.96, 0.98), 0.4, 0.5),
    "ScreenBlue": ((0.24, 0.52, 0.85), 0.3, 0.7),
    "ScreenNavy": ((0.15, 0.22, 0.42), 0.3, 0.4),
    "TileOrange": ((0.95, 0.6, 0.18), 0.3, 0.6),
    "TileGreen": ((0.3, 0.72, 0.38), 0.3, 0.6),
    "Chart": ((0.98, 0.55, 0.2), 0.3, 1.0),
    "Chair": ((0.33, 0.68, 0.45), 0.6, 0),
    "Rack": ((0.22, 0.23, 0.24), 0.45, 0),
    "RackFace": ((0.13, 0.14, 0.15), 0.45, 0),
    "Led": ((0.25, 0.9, 0.4), 0.3, 3.0),
    "Locker": ((0.86, 0.88, 0.87), 0.5, 0),
    "Lock": ((0.3, 0.32, 0.35), 0.4, 0),
    "Ink": ((0.27, 0.29, 0.32), 0.6, 0),
    "Wall": ((0.28, 0.34, 0.47), 0.8, 0),
    "Stripe": ((0.29, 0.62, 0.39), 0.7, 0),
    "WallText": ((0.86, 0.89, 0.94), 0.6, 0),
    "Slab": ((0.88, 0.9, 0.89), 0.7, 0),
    "TileMint": ((0.6, 0.82, 0.73), 0.7, 0),
    "TileLight": ((0.9, 0.95, 0.93), 0.7, 0),
}


def linear(color):
    # Warna di PALETTE ditulis dalam sRGB seperti diambil dari gambar konsep; Blender dan glTF memakai linear.
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in color)


def material(name):
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    color, roughness, emission = PALETTE[name]
    color = linear(color)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*color, 1)
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def finish(obj, name, mat, bevel=0.0, segments=3, smooth=False):
    obj.name = name
    obj.data.name = name
    obj.data.materials.append(material(mat))
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = segments
        modifier.limit_method = "ANGLE"
    if smooth or bevel:
        bpy.ops.object.shade_smooth()
    return obj


def box(name, size, location, mat, bevel=0.015, rotation=(0, 0, 0), segments=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    bpy.context.object.scale = size
    return finish(bpy.context.object, name, mat, bevel, segments)


def sphere(name, radius, location, mat, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=location, segments=32, ring_count=16)
    bpy.context.object.scale = scale
    return finish(bpy.context.object, name, mat, smooth=True)


def cylinder(name, radius, depth, location, mat, rotation=(0, 0, 0), vertices=24, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=location, rotation=rotation, vertices=vertices)
    bpy.context.object.scale = scale
    return finish(bpy.context.object, name, mat, bevel=min(radius, depth) * 0.15)


def text(name, body, location, rotation, size, mat):
    bpy.ops.object.text_add(location=location, rotation=rotation)
    curve = bpy.context.object.data
    curve.body = body
    curve.size = size
    curve.extrude = 0.008
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.font = bpy.data.fonts.load(FONT, check_existing=True)
    bpy.ops.object.convert(target="MESH")
    return finish(bpy.context.object, name, mat)


class Piece:
    """Objek yang dibuat di dalam blok ini dipindah dan diputar bersama (yaw = arah depan three.js)."""

    def __init__(self, x=0.0, z=0.0, yaw=0.0):
        self.matrix = Matrix.Translation(Vector((x, -z, 0))) @ Matrix.Rotation(yaw, 4, "Z")

    def __enter__(self):
        self.before = set(bpy.data.objects)

    def __exit__(self, *_):
        for obj in set(bpy.data.objects) - self.before:
            obj.matrix_world = self.matrix @ obj.matrix_world


def collection(name):
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[name]
    return coll


# ---- Perabot (koordinat lokal: lantai di z=0, depan menghadap -Y) ----

def desk(width=2.2, depth=1.0, pedestal=None):
    box("DeskTop", (width, depth, 0.08), (0, 0, 0.84), "White", 0.01)
    for side in (-1, 1):
        x = side * (width / 2 - 0.04)
        if pedestal == side:
            px = side * (width / 2 - 0.26)
            box("Pedestal", (0.5, depth - 0.06, 0.8), (px, 0, 0.4), "White", 0.01)
            for i in range(3):
                z = 0.17 + i * 0.25
                box("DrawerFront", (0.44, 0.02, 0.21), (px, -depth / 2 + 0.02, z), "Drawer", 0.005)
                box("DrawerPull", (0.12, 0.02, 0.02), (px, -depth / 2 + 0.005, z + 0.06), "Lock", 0.005)
        else:
            box("PanelLeg", (0.06, depth - 0.06, 0.8), (x, 0, 0.4), "White", 0.01)
    box("Keyboard", (0.5, 0.17, 0.025), (0, -0.2, 0.893), "Monitor", 0.008)
    box("Mouse", (0.06, 0.09, 0.025), (0.36, -0.2, 0.893), "Monitor", 0.012)


def monitor(x=0.0, y=0.18, width=0.62, height=0.42, yaw=0.0, screen="Screen", ui="lines"):
    with Piece(x, -y, yaw):
        top = 0.88
        box("MonitorFoot", (0.26, 0.17, 0.02), (0, 0.04, top + 0.01), "Monitor", 0.006)
        box("MonitorNeck", (0.05, 0.04, 0.2), (0, 0.06, top + 0.1), "Monitor", 0.005)
        cz = top + 0.2 + height / 2
        box("MonitorFrame", (width + 0.05, 0.045, height + 0.05), (0, 0, cz), "Monitor", 0.008)
        box("Screen", (width, 0.01, height), (0, -0.025, cz), screen, 0)
        front = -0.032
        if ui == "lines":
            box("UiHeader", (width * 0.86, 0.004, height * 0.12), (0, front, cz + height * 0.34), "ScreenUi", 0)
            for i, w in enumerate((0.5, 0.36, 0.44)):
                box("UiLine", (width * w, 0.004, height * 0.06), (-width * (0.43 - w / 2), front, cz + height * (0.1 - i * 0.17)), "ScreenUi", 0)
            box("UiBlock", (width * 0.26, 0.004, height * 0.36), (width * 0.28, front, cz - height * 0.08), "ScreenUi", 0)
        elif ui == "chart":
            points = [(-0.42, -0.25), (-0.25, 0.05), (-0.1, -0.1), (0.05, 0.22), (0.2, 0.0), (0.42, 0.28)]
            for (ax, az), (bx, bz) in zip(points, points[1:]):
                ax, az, bx, bz = ax * width, az * height, bx * width, bz * height
                length = math.hypot(bx - ax, bz - az)
                box("UiChart", (length, 0.004, 0.018), ((ax + bx) / 2, front, cz + (az + bz) / 2), "Chart", 0,
                    rotation=(0, -math.atan2(bz - az, bx - ax), 0))
            box("UiAxis", (width * 0.88, 0.004, 0.01), (0, front, cz - height * 0.38), "ScreenUi", 0)
        elif ui == "dashboard":
            for i in range(3):
                box("UiBar", (width * 0.1, 0.004, height * (0.25 + i * 0.15)), (-width * (0.34 - i * 0.13), front, cz - height * (0.2 - i * 0.07)), "ScreenUi", 0)
            box("UiPanel", (width * 0.38, 0.004, height * 0.5), (width * 0.22, front, cz), "ScreenUi", 0)


def chair():
    box("ChairSeat", (0.46, 0.44, 0.08), (0, 0, 0.47), "Chair", 0.03)
    box("ChairBack", (0.44, 0.07, 0.48), (0, 0.24, 0.8), "Chair", 0.03)
    box("ChairSpine", (0.05, 0.05, 0.25), (0, 0.24, 0.5), "Metal", 0.01)
    cylinder("ChairPost", 0.03, 0.32, (0, 0, 0.27), "Metal")
    for i in range(5):
        a = i * 2 * math.pi / 5
        box("ChairLeg", (0.3, 0.05, 0.03), (math.cos(a) * 0.15, math.sin(a) * 0.15, 0.08), "Metal", 0.01, rotation=(0, 0, a))
        sphere("Caster", 0.03, (math.cos(a) * 0.29, math.sin(a) * 0.29, 0.03), "Metal")


def rack():
    box("RackBody", (0.85, 0.85, 2.15), (0, 0, 1.075), "Rack", 0.02)
    box("RackFace", (0.72, 0.02, 1.95), (0, -0.425, 1.075), "RackFace", 0.005)
    for row in range(13):
        z = 0.22 + row * 0.14
        box("RackUnit", (0.66, 0.01, 0.1), (0, -0.437, z), "Rack", 0.003)
        for col in range(3):
            box("Led", (0.035, 0.01, 0.022), (-0.26 + col * 0.06, -0.445, z), "Led", 0)


def lockers(width=2.6):
    box("LockerBody", (width, 0.55, 1.35), (0, 0, 0.675), "Locker", 0.015)
    cols = 4
    door = (width - 0.1) / cols
    for row in range(2):
        for col in range(cols):
            x = -width / 2 + 0.05 + door * (col + 0.5)
            z = 0.36 + row * 0.62
            box("LockerDoor", (door - 0.04, 0.02, 0.58), (x, -0.28, z), "Locker", 0.006)
            box("LockerLock", (0.05, 0.012, 0.1), (x + door * 0.3, -0.296, z + 0.05), "Lock", 0.004)


def archive_box(x, y, z):
    box("ArchiveBox", (0.72, 0.5, 0.48), (x, y, z + 0.24), "White", 0.02)
    text("ArchiveLabel", "PRIVACY\nARCHIVE", (x, y - 0.255, z + 0.26), (math.pi / 2, 0, 0), 0.105, "Ink")


def watch_post():
    box("PostBase", (2.9, 0.7, 0.1), (0, 0, 0.05), "White", 0.02)
    box("PostPanel", (2.8, 0.3, 2.45), (0, 0, 1.3), "White", 0.03)
    box("Screen", (2.3, 0.01, 0.2), (0, -0.155, 2.1), "Screen", 0)
    text("PostTitle", "PRODUCTION WATCH POST", (0, -0.165, 2.1), (math.pi / 2, 0, 0), 0.12, "ScreenUi")
    box("PostScreen", (2.3, 0.01, 1.15), (0, -0.155, 1.38), "ScreenNavy", 0)
    front = -0.162
    box("TileOrange", (0.55, 0.004, 0.45), (0.0, front, 1.62), "TileOrange", 0)
    box("TileGreen", (0.55, 0.004, 0.45), (0.72, front, 1.62), "TileGreen", 0)
    for i in range(3):
        box("TileBlue", (0.5, 0.004, 0.12), (-0.78, front, 1.75 - i * 0.2), "ScreenBlue", 0)
    for i, w in enumerate((1.7, 1.2)):
        box("PostLine", (w, 0.004, 0.08), (-0.2 + (w - 1.7) / 2, front, 1.18 - i * 0.17), "ScreenBlue", 0)
    box("TileSmall", (0.18, 0.004, 0.32), (0.95, front, 1.0), "TileOrange", 0)


# ---- Ruangan, agen, dan meja per bidang ----

def build_room():
    collection("Room")
    box("Slab", (12.4, 10.4, 0.3), (0, 0, -0.15), "Slab", 0.04)
    mesh = bpy.data.meshes.new("FloorTiles")
    bm = bmesh.new()
    nx, nz = 20, 16
    for i in range(nx):
        for j in range(nz):
            x0, y0 = -6 + i * 12 / nx, -5 + j * 10 / nz
            verts = [bm.verts.new((x, y, 0.002)) for x, y in ((x0, y0), (x0 + 12 / nx, y0), (x0 + 12 / nx, y0 + 10 / nz), (x0, y0 + 10 / nz))]
            bm.faces.new(verts).material_index = (i + j) % 2
    bm.to_mesh(mesh)
    bm.free()
    floor = bpy.data.objects.new("FloorTiles", mesh)
    bpy.context.collection.objects.link(floor)
    mesh.materials.append(material("TileMint"))
    mesh.materials.append(material("TileLight"))
    box("WallBack", (12.3, 0.3, 3.0), (-0.15, 5.15, 1.5), "Wall", 0.01)
    box("WallLeft", (0.3, 10.0, 3.0), (-6.15, 0, 1.5), "Wall", 0.01)
    box("StripeBack", (12.0, 0.04, 0.32), (0, 4.99, 1.55), "Stripe", 0)
    box("StripeLeft", (0.04, 10.0, 0.32), (-5.99, 0, 1.55), "Stripe", 0)
    text("LabelCode", "CODE AUDIT", (-5.98, -1.8, 2.25), (math.pi / 2, 0, math.pi / 2), 0.36, "WallText")
    text("LabelCeo", "EXECUTIVE CEO DESK", (1.6, 4.98, 2.25), (math.pi / 2, 0, 0), 0.3, "WallText")
    text("LabelServer", "SERVER ROOM", (4.55, 4.98, 2.25), (math.pi / 2, 0, 0), 0.3, "WallText")
    # Meja hiasan bermonitor biru di depan kiri, seperti di konsep.
    with Piece(-2.3, 2.5):
        desk(2.0, 0.95)
        monitor(screen="ScreenBlue")


def shield(name, location, size, mat):
    # Perisai: atas datar, bawah lancip, menghadap -Y.
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    outline = [(-1, 1), (1, 1), (1, 0.15), (0, -1), (-1, 0.15)]
    face = bm.faces.new([bm.verts.new((x * size, 0, z * size * 1.15)) for x, z in outline])
    extruded = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, vec=(0, 0.012, 0), verts=[v for v in extruded["geom"] if isinstance(v, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(material(mat))
    return obj


def build_agent():
    # Mengikuti gambar karakter: kepala besar bulat persegi (hampir separuh tinggi), visor hijau
    # berbingkai gelap, polo biru berkerah V dengan lencana perisai, celana dan sepatu gelap.
    collection("Agent")
    for side in (-1, 1):
        box(f"Shoe{side}", (0.17, 0.27, 0.1), (side * 0.1, -0.03, 0.05), "Shoe", 0.04)
        box(f"Leg{side}", (0.15, 0.18, 0.26), (side * 0.1, 0, 0.21), "Pants", 0.03)
        box(f"Sleeve{side}", (0.15, 0.2, 0.17), (side * 0.28, 0, 0.71), "Shirt", 0.06, rotation=(0, side * 0.3, 0))
        cylinder(f"Arm{side}", 0.05, 0.14, (side * 0.315, 0, 0.58), "Skin", rotation=(0, side * 0.1, 0))
        sphere(f"Hand{side}", 0.07, (side * 0.325, 0, 0.47), "Skin", scale=(0.9, 0.9, 1.1))
        sphere(f"Ear{side}", 0.055, (side * 0.285, 0.02, 1.1), "Skin", scale=(0.6, 1, 1))
        box(f"Strap{side}", (0.025, 0.46, 0.1), (side * 0.29, 0.02, 1.17), "VisorFrame", 0.01)
    box("Belt", (0.42, 0.26, 0.09), (0, 0, 0.375), "Pants", 0.03)
    box("Torso", (0.46, 0.3, 0.38), (0, 0, 0.6), "Shirt", 0.08, segments=4)
    for side in (-1, 1):
        box(f"Collar{side}", (0.12, 0.02, 0.07), (side * 0.055, -0.152, 0.765), "Collar", 0.01, rotation=(0, -side * 0.5, 0))
    shield("Badge", (0.12, -0.158, 0.67), 0.04, "Badge")
    cylinder("Neck", 0.07, 0.06, (0, 0, 0.82), "Skin")
    box("Head", (0.56, 0.5, 0.5), (0, 0, 1.11), "Skin", 0.17, segments=5)
    box("HairTop", (0.58, 0.53, 0.2), (0, 0.015, 1.34), "Hair", 0.1, segments=5)
    box("HairBack", (0.56, 0.16, 0.32), (0, 0.19, 1.2), "Hair", 0.07, segments=4)
    box("VisorRim", (0.6, 0.07, 0.17), (0, -0.245, 1.17), "VisorFrame", 0.03)
    box("Visor", (0.52, 0.02, 0.11), (0, -0.285, 1.17), "Visor", 0.01)
    sphere("Nose", 0.032, (0, -0.255, 1.05), "Skin")
    bpy.ops.mesh.primitive_torus_add(major_radius=0.06, minor_radius=0.008, location=(0, -0.252, 1.0), rotation=(math.pi / 2, 0, 0))
    smile = bpy.context.object
    bm = bmesh.new()
    bm.from_mesh(smile.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > 0.005], context="VERTS")
    bm.to_mesh(smile.data)
    bm.free()
    finish(smile, "Smile", "Mouth")


def build_stations():
    collection("Station_code")
    with Piece(-5.0, 1.8, math.pi / 2):
        desk(2.0, 0.95)
        monitor(screen="Screen")
    with Piece(-3.95, 2.45, -math.pi / 2):
        chair()

    collection("Station_privacy")
    with Piece(-3.4, -4.35):
        desk(2.4, 1.0, pedestal=1)
        monitor(x=-0.3)
        archive_box(0.55, 0.15, 0.88)
    with Piece(-5.25, -4.35):
        box("ArchiveCabinet", (0.75, 0.9, 1.1), (0, 0, 0.55), "White", 0.015)
        for i in range(3):
            box("CabinetDrawer", (0.65, 0.02, 0.3), (0, -0.455, 0.2 + i * 0.35), "Drawer", 0.005)
        archive_box(0, 0, 1.1)
    with Piece(-5.6, -1.6, math.pi / 2):
        lockers()

    collection("Station_production")
    with Piece(-0.6, -1.0):
        watch_post()

    collection("Station_ceo")
    with Piece(1.6, -4.3):
        desk(2.4, 1.0, pedestal=1)
        monitor(x=-0.4, yaw=0.18, screen="Screen", ui="dashboard")
        monitor(x=0.32, yaw=-0.18, screen="Screen", ui="lines")

    collection("Station_deps")
    for x in (3.95, 5.1):
        with Piece(x, -4.45):
            rack()
    with Piece(4.5, -1.6):
        desk(2.0, 0.95, pedestal=1)
        monitor(x=-0.2)
    with Piece(3.8, -0.7, math.pi):
        chair()

    collection("Station_logs")
    with Piece(1.2, 3.2):
        desk(2.2, 1.0)
        monitor(x=-0.36, yaw=0.22, ui="lines")
        monitor(x=0.36, yaw=-0.22, screen="ScreenBlue", ui="chart")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", required=True)
    options = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build_room()
    build_agent()
    build_stations()
    bpy.ops.wm.save_as_mainfile(filepath=options.blend)


main()
