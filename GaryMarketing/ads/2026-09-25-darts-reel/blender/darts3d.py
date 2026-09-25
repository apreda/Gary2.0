"""The Darts reel's open: the app's own dartboard (DartboardPlan in
ios/GaryApp/Darts/DartsBoard.swift: 20 wedges, gold/gray treble and double,
gray outer bull, gold eye) built in 3D. Three gold darts thunk into it on the
beat at the spots the app uses for three darts, then it drops onto the phone,
lands on the real Thursday Night Football board, dissolves into the capture,
and the phone pushes in until its screen fills the frame exactly as the
reel's first 2D frame does.

  blender -b --factory-startup -P blender/darts3d.py -- [--preview]

Writes public/darts3d/0001.png ... (RGBA 1080x1920) for Remotion.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PREVIEW = "--preview" in sys.argv
FRAMES = 150            # 5 s: darts on B1-B3, the drop B4-B7, the push B7-B10
LANDS = (16, 31, 46)    # 1-based frames: beats 1, 2, 3 at 30 fps / 120 BPM

# ---------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 1080, 1920
scene.render.resolution_percentage = 50 if PREVIEW else 100
scene.render.fps = 30
scene.frame_start, scene.frame_end = 1, FRAMES
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = os.path.join(ROOT, "public", "darts3d", "")
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.render.use_motion_blur = True
scene.render.motion_blur_shutter = 0.5
ee = scene.eevee
ee.taa_render_samples = 16 if PREVIEW else 96
for attr, val in (("use_raytracing", True), ("use_shadows", True)):
    if hasattr(ee, attr):
        setattr(ee, attr, val)
world = bpy.data.worlds.new("Ink")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.004, 0.0035, 0.003, 1)
scene.world = world


def lin(hexs):
    h = hexs.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


FADERS = []     # every Mix(Transparent) fac on the board and darts: 1 = solid


def material(name, color, metallic=0.0, roughness=0.5, bump=0.0, emission=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = roughness
    if "Specular IOR Level" in p.inputs and not metallic:
        p.inputs["Specular IOR Level"].default_value = 0.22
    if bump:
        tex = nt.nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = 900.0
        tex.inputs["Detail"].default_value = 6.0
        bn = nt.nodes.new("ShaderNodeBump")
        bn.inputs["Strength"].default_value = bump * 0.4
        nt.links.new(tex.outputs["Fac"], bn.inputs["Height"])
        nt.links.new(bn.outputs["Normal"], p.inputs["Normal"])
    out = nt.nodes["Material Output"]
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.inputs["Fac"].default_value = 1.0
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(p.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    FADERS.append(mix.inputs["Fac"])
    return m


# ---------------------------------------------------------------- the board
P = 172.0
BULL, OBULL = 11.5 / P, 26 / P
TRE, DBL = (98 / P, 110 / P), (160 / P, 172 / P)
DEPTH = 0.16

wedge_a = material("Wedge charcoal", lin("#1F1B16"), roughness=0.9, bump=0.25)
wedge_b = material("Wedge black", lin("#0A0908"), roughness=0.9, bump=0.25)
ring_gold = material("Ring gold", lin("#7D6420"), roughness=0.75, bump=0.2)
ring_gray = material("Ring gray", lin("#34312C"), roughness=0.8, bump=0.2)
base = material("Board base", lin("#090808"), roughness=0.6)
wire = material("Wire", (0.1, 0.095, 0.088), metallic=1.0, roughness=0.55)


def pt(r, deg, y=0.0):
    a = math.radians(deg)
    return Vector((r * math.sin(a), y, r * math.cos(a)))     # 0 deg at top, clockwise


board_me = bpy.data.meshes.new("Board")
bm = bmesh.new()
MATS = [wedge_a, wedge_b, ring_gold, ring_gray, base]


def sector(r0, r1, a0, a1, mi, steps=8):
    outer = [bm.verts.new(pt(r1, a1 - (a1 - a0) * k / steps)) for k in range(steps + 1)]
    inner = [bm.verts.new(pt(r0, a0 + (a1 - a0) * k / steps)) for k in range(steps + 1)]
    f = bm.faces.new(outer + inner)          # CCW seen from -Y: faces the camera
    f.material_index = mi


for i in range(20):
    a0 = -9 + 18 * i
    a1 = a0 + 18
    w_mi, r_mi = (0, 2) if i % 2 == 0 else (1, 3)
    sector(OBULL, TRE[0], a0, a1, w_mi)
    sector(TRE[0], TRE[1], a0, a1, r_mi)
    sector(TRE[1], DBL[0], a0, a1, w_mi)
    sector(DBL[0], DBL[1], a0, a1, r_mi)
ring_steps = 96
sector_ob = [bm.verts.new(pt(OBULL, -360 * k / ring_steps)) for k in range(ring_steps)]
sector_in = [bm.verts.new(pt(BULL, 360 * k / ring_steps)) for k in range(ring_steps)]
for k in range(ring_steps):             # the gray outer bull as quads
    a = -360 * k / ring_steps
    b = -360 * (k + 1) / ring_steps
    q = [bm.verts.new(pt(OBULL, a)), bm.verts.new(pt(OBULL, b)), bm.verts.new(pt(BULL, b)), bm.verts.new(pt(BULL, a))]
    bm.faces.new(q).material_index = 3
eye = bm.faces.new([bm.verts.new(pt(BULL, -360 * k / 64)) for k in range(64)])
eye.material_index = 2
# the side and back of the board
side_n = 160
front_ring = [bm.verts.new(pt(1.0, 360 * k / side_n)) for k in range(side_n)]
back_ring = [bm.verts.new(pt(1.0, 360 * k / side_n, DEPTH)) for k in range(side_n)]
for k in range(side_n):
    j = (k + 1) % side_n
    bm.faces.new((front_ring[k], front_ring[j], back_ring[j], back_ring[k])).material_index = 4
bm.faces.new(back_ring).material_index = 4
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
bm.normal_update()
bm.to_mesh(board_me)
bm.free()
for m in MATS:
    board_me.materials.append(m)

board = bpy.data.objects.new("Board", None)
scene.collection.objects.link(board)
board.rotation_mode = "QUATERNION"
face = bpy.data.objects.new("Board face", board_me)
scene.collection.objects.link(face)
face.parent = board


def wire_curve(name, points, closed=False):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = 0.0022
    cu.bevel_resolution = 2
    sp = cu.splines.new("POLY")
    sp.points.add(len(points) - 1)
    for p_, v in zip(sp.points, points):
        p_.co = (v.x, v.y, v.z, 1)
    sp.use_cyclic_u = closed
    ob = bpy.data.objects.new(name, cu)
    ob.data.materials.append(wire)
    scene.collection.objects.link(ob)
    ob.parent = board


for i in range(20):
    a = -9 + 18 * i
    wire_curve(f"Spoke {i}", [pt(OBULL, a, -0.003), pt(1.0, a, -0.003)])
for r in (BULL, OBULL, TRE[0], TRE[1], DBL[0], 0.996):
    wire_curve(f"Ring {r:.3f}", [pt(r, 360 * k / 180, -0.003) for k in range(180)], closed=True)

# ---------------------------------------------------------------- darts
gold = material("Dart gold", lin("#C9A227"), metallic=1.0, roughness=0.22)
pale = material("Dart pale", lin("#F4E4BA"), roughness=0.45)
steel = material("Dart tip", lin("#F4E4BA"), metallic=1.0, roughness=0.2)
DART_L = 0.42


def solid(name, build, mat, parent):
    me = bpy.data.meshes.new(name)
    b = bmesh.new()
    build(b)
    b.to_mesh(me)
    b.free()
    for p_ in me.polygons:
        p_.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(mat)
    scene.collection.objects.link(ob)
    ob.parent = parent
    return ob


def cone(r1, r2, z0, z1, seg=28):
    def f(b):
        bmesh.ops.create_cone(b, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=z1 - z0,
                              matrix=Matrix.Translation((0, 0, (z0 + z1) / 2)))
    return f


def fin(angle):
    def f(b):
        ca, sa = math.cos(angle), math.sin(angle)
        prof = [(0.0, 0.27), (0.0, 0.42), (0.078, 0.42), (0.078, 0.36)]
        vs = [b.verts.new((r * ca, r * sa, z)) for r, z in prof]
        b.faces.new(vs)
    return f


def make_dart(n):
    root = bpy.data.objects.new(f"Dart {n}", None)
    scene.collection.objects.link(root)
    root.rotation_mode = "QUATERNION"
    root.scale = (1.45, 1.45, 1.45)
    root.parent = board
    solid(f"Tip {n}", cone(0.0, 0.0105, 0.0, 0.075), steel, root)
    solid(f"Barrel {n}", cone(0.021, 0.024, 0.075, 0.195), gold, root)
    for k in range(5):
        z = 0.1 + k * 0.018
        solid(f"Grip {n}.{k}", cone(0.0262, 0.0262, z, z + 0.006), gold, root)
    solid(f"Shaft {n}", cone(0.0085, 0.0085, 0.195, 0.33), gold, root)
    for k in range(4):
        solid(f"Flight {n}.{k}", fin(math.pi / 4 + k * math.pi / 2), gold if k % 2 == 0 else pale, root)
    return root


# the app's spots for three darts, in its 358-point plan
SPOTS = [(292, 96), (70, 182), (276, 276)]
darts = []
for n, (sx, sy) in enumerate(SPOTS):
    d = make_dart(n)
    tip = Vector(((sx - 179) / P, 0.012, (179 - sy) / P))
    back = Vector((0.34 + 0.05 * n, -1.0, 0.42 - 0.04 * n)).normalized()   # flights up and right, toward us
    darts.append((d, tip, back))

# ---------------------------------------------------------------- the phone
SW, SH = 0.715, 0.715 * 2868 / 1320
BW, BH, BT = 0.780, 1.634, 0.0875
SR, BR = 0.095, 0.118
titanium = material("Titanium", (0.05, 0.047, 0.043), metallic=1.0, roughness=0.3)
glass = material("Black glass", (0.004, 0.004, 0.004), roughness=0.04)
FADERS.remove(titanium.node_tree.nodes["Mix Shader"].inputs["Fac"])
FADERS.remove(glass.node_tree.nodes["Mix Shader"].inputs["Fac"])


def rounded_rect(w, h, r, seg=18):
    pts = []
    for cx, cz, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90),
                       (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


phone = bpy.data.objects.new("Phone", None)
scene.collection.objects.link(phone)
phone.rotation_mode = "QUATERNION"
bme = bpy.data.meshes.new("Body")
b = bmesh.new()
outline = rounded_rect(BW, BH, BR)
front = [b.verts.new((x, 0.0, z)) for x, z in outline]
backv = [b.verts.new((x, BT, z)) for x, z in outline]
b.faces.new(front).material_index = 1
b.faces.new(list(reversed(backv)))
for i in range(len(outline)):
    j = (i + 1) % len(outline)
    b.faces.new((front[j], front[i], backv[i], backv[j]))
b.to_mesh(bme)
b.free()
body = bpy.data.objects.new("Body", bme)
scene.collection.objects.link(body)
bme.materials.append(titanium)
bme.materials.append(glass)
bev = body.modifiers.new("Soft edges", "BEVEL")
bev.limit_method, bev.angle_limit, bev.width, bev.segments = "ANGLE", math.radians(40), 0.016, 10
for p_ in bme.polygons:
    p_.use_smooth = True
body.parent = phone

sme = bpy.data.meshes.new("Screen")
b = bmesh.new()
uv = b.loops.layers.uv.new("UVMap")
f_ = b.faces.new([b.verts.new((x, -0.0007, z)) for x, z in rounded_rect(SW, SH, SR, 24)])
for loop in f_.loops:
    x, _, z = loop.vert.co
    loop[uv].uv = ((x + SW / 2) / SW, (z + SH / 2) / SH)
b.to_mesh(sme)
b.free()
screen = bpy.data.objects.new("Screen", sme)
scene.collection.objects.link(screen)
screen.parent = phone
sm = bpy.data.materials.new("Screen")
sm.use_nodes = True
nt = sm.node_tree
nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputMaterial")
t_empty = nt.nodes.new("ShaderNodeTexImage")
t_empty.image = bpy.data.images.load(os.path.join(HERE, "screen_tnf_empty.png"))
t_real = nt.nodes.new("ShaderNodeTexImage")
t_real.image = bpy.data.images.load(os.path.join(HERE, "screen_tnf.png"))
for t in (t_empty, t_real):
    t.image.colorspace_settings.name = "sRGB"
    t.interpolation = "Cubic"
swap = nt.nodes.new("ShaderNodeMix")
swap.data_type = "RGBA"
nt.links.new(t_empty.outputs["Color"], swap.inputs[6])
nt.links.new(t_real.outputs["Color"], swap.inputs[7])
emit = nt.nodes.new("ShaderNodeEmission")
nt.links.new(swap.outputs[2], emit.inputs["Color"])
trn = nt.nodes.new("ShaderNodeBsdfTransparent")
mix_a = nt.nodes.new("ShaderNodeMixShader")
nt.links.new(t_real.outputs["Alpha"], mix_a.inputs["Fac"])
nt.links.new(trn.outputs[0], mix_a.inputs[1])
nt.links.new(emit.outputs[0], mix_a.inputs[2])
nt.links.new(mix_a.outputs[0], out.inputs["Surface"])
sme.materials.append(sm)
swap_fac = swap.inputs[0]

# ---------------------------------------------------------------- camera + light
cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
scene.collection.objects.link(cam)
cam.data.lens, cam.data.sensor_fit, cam.data.sensor_width = 50, "HORIZONTAL", 36
cam.rotation_euler = (math.radians(90), 0, 0)
scene.camera = cam
D = SW / (36 / 50)
half_h = (SW / 2) * 1920 / 1080
END = Vector((0.0, D + 0.0007, half_h - SH / 2))


def area(name, loc, energy, color, size, target=Vector((0, 2.0, 0))):
    li = bpy.data.lights.new(name, "AREA")
    li.energy, li.color, li.size = energy, color, size
    ob = bpy.data.objects.new(name, li)
    scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (target - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return ob


area("Key", (-2.2, -0.4, 2.6), 170, (1.0, 0.86, 0.66), 2.2)
area("Front fill", (0.4, -0.6, 0.9), 22, (1.0, 0.93, 0.82), 3.0)
area("Gold rim", (2.6, 3.4, 1.2), 900, (1.0, 0.68, 0.22), 1.6)
area("Low rim", (-2.4, 3.6, -1.8), 380, (1.0, 0.78, 0.4), 1.4)

# ---------------------------------------------------------------- motion
BOARD_LOCAL = Matrix.Translation(((660 / 1320 - 0.5) * SW, -0.004, (0.5 - 1586.5 / 2868) * SH))
BOARD_R = 580 / 1320 * SW
HERO_R = 0.62


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def inout(t):
    t = min(1.0, max(0.0, t))
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def phone_pose(f):
    below = (Vector((0.18, 3.1, -3.4)), Euler((math.radians(38), 0, math.radians(-8))).to_quaternion())
    view = (Vector((0.0, 1.62, -0.06)), Euler((math.radians(5), 0, math.radians(-5))).to_quaternion())
    end = (END, Quaternion())
    if f <= 56:
        return below
    if f <= 106:
        q = inout((f - 56) / 50)
        return below[0].lerp(view[0], q), below[1].slerp(view[1], q)
    q = inout((f - 106) / (FRAMES - 106))
    return view[0].lerp(end[0], q), view[1].slerp(end[1], q)


def hero_pose(f):
    t = (f - 1) / 59
    loc = Vector((-0.07, 2.25 - 0.2 * smooth(t), 0.02))
    for land in LANDS:                       # each thunk knocks the board back a touch
        if f >= land:
            loc.y += 0.035 * math.exp(-(f - land) / 3.0)
    rot = Euler((math.radians(-9 + 5 * smooth(t)), 0, math.radians(27 - 13 * smooth(t)))).to_quaternion()
    return loc, rot, HERO_R


for f in range(1, FRAMES + 1):
    ploc, prot = phone_pose(f)
    phone.location, phone.rotation_quaternion = ploc, prot
    phone.keyframe_insert("location", frame=f)
    phone.keyframe_insert("rotation_quaternion", frame=f)

    # the board: hero, then down onto the phone's board, then riding the phone
    hloc, hrot, hs = hero_pose(min(f, 60))
    pm = Matrix.Translation(ploc) @ prot.to_matrix().to_4x4()
    target = pm @ BOARD_LOCAL
    q = inout((f - 58) / 48)
    lift = 0.22 * (1 - q)
    tloc = target.to_translation() + (prot @ Vector((0, -lift, 0)))
    board.location = hloc.lerp(tloc, q)
    board.rotation_quaternion = hrot.slerp(prot, q)
    s = hs + (BOARD_R - hs) * q
    board.scale = (s, s, s)
    board.keyframe_insert("location", frame=f)
    board.keyframe_insert("rotation_quaternion", frame=f)
    board.keyframe_insert("scale", frame=f)

    # the darts: in flight for 8 frames, then stuck and shivering
    for n, (d, tip, back) in enumerate(darts):
        land = LANDS[n]
        base = Vector((0, 0, 1)).rotation_difference(back)
        if f < land - 8:
            d.location = tip + back * 30        # not yet thrown: far behind the camera
            d.rotation_quaternion = base
        elif f < land:
            u = (f - (land - 8)) / 8
            d.location = tip + back * (4.2 * (1 - u) ** 1.6) + Vector((0, 0, 0.18 * math.sin(math.pi * u)))
            d.rotation_quaternion = base
        else:
            k = f - land
            wob = math.radians(7) * math.exp(-k / 5) * math.sin(2 * math.pi * k / 4.5)
            axis = back.cross(Vector((0, 0, 1))).normalized()
            d.location = tip
            d.rotation_quaternion = Quaternion(axis, wob) @ base
        d.keyframe_insert("location", frame=f)
        d.keyframe_insert("rotation_quaternion", frame=f)

    # the 3D board dissolves into the real one as it lands
    fade = 1 - smooth((f - 98) / 12)
    for fac in FADERS:
        fac.default_value = fade
        fac.keyframe_insert("default_value", frame=f)
    swap_fac.default_value = smooth((f - 98) / 12)
    swap_fac.keyframe_insert("default_value", frame=f)

if PREVIEW:
    for f in (1, 12, 16, 31, 46, 58, 80, 100, 110, 128, 150):
        scene.frame_set(f)
        scene.render.filepath = os.path.join(HERE, f"preview_{f:03d}.png")
        bpy.ops.render.render(write_still=True)
else:
    bpy.ops.render.render(animation=True)
print("DONE")
