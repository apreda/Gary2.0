"""The 3D intro: an iPhone 17 Pro Max carrying the real sealed-board capture
flies in, turns to the camera and settles so its screen fills the frame
exactly as the reel's first 2D frame does (top-aligned, full width).

  blender -b --factory-startup -P blender/intro3d.py -- [--preview]

Writes public/intro3d/0001.png ... 0060.png (RGBA, 1080x1920) for Remotion.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PREVIEW = "--preview" in sys.argv
FRAMES = 60

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
scene.render.filepath = os.path.join(ROOT, "public", "intro3d", "")
scene.view_settings.view_transform = "Standard"   # the capture's colours, untouched
scene.view_settings.look = "None"
scene.render.use_motion_blur = True
scene.render.motion_blur_shutter = 0.45
ee = scene.eevee
ee.taa_render_samples = 16 if PREVIEW else 96
for attr, val in (("use_raytracing", True), ("use_shadows", True)):
    if hasattr(ee, attr):
        setattr(ee, attr, val)

world = bpy.data.worlds.new("Ink")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.004, 0.0035, 0.003, 1)
scene.world = world

# ---------------------------------------------------------------- geometry
# screen 1320:2868 like the capture; body per the 17 Pro Max's proportions
SW, SH = 0.715, 0.715 * 2868 / 1320
BW, BH, BT = 0.780, 1.634, 0.0875
SR, BR = 0.095, 0.118


def rounded_rect(w, h, r, seg=18):
    pts = []
    for cx, cz, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90),
                       (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def material(name, color, metallic=0.0, roughness=0.4, ior_level=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = roughness
    if "Specular IOR Level" in p.inputs:
        p.inputs["Specular IOR Level"].default_value = ior_level
    return m


titanium = material("Titanium", (0.05, 0.047, 0.043), metallic=1.0, roughness=0.3)
glass = material("Black glass", (0.004, 0.004, 0.004), roughness=0.04, ior_level=0.8)


def body_mesh():
    me = bpy.data.meshes.new("Body")
    bm = bmesh.new()
    outline = rounded_rect(BW, BH, BR)
    front = [bm.verts.new((x, 0.0, z)) for x, z in outline]
    back = [bm.verts.new((x, BT, z)) for x, z in outline]
    f = bm.faces.new(front)                 # CCW in (x, z): faces -Y, the camera
    f.material_index = 1
    bm.faces.new(list(reversed(back)))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[j], front[i], back[i], back[j]))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    return me


phone = bpy.data.objects.new("Phone", None)
scene.collection.objects.link(phone)
phone.rotation_mode = "QUATERNION"

body = bpy.data.objects.new("Body", body_mesh())
scene.collection.objects.link(body)
body.data.materials.append(titanium)
body.data.materials.append(glass)
bev = body.modifiers.new("Soft edges", "BEVEL")
bev.limit_method = "ANGLE"
bev.angle_limit = math.radians(40)
bev.width = 0.016
bev.segments = 10
for p in body.data.polygons:
    p.use_smooth = True
body.parent = phone


def side_button(name, x, z, length, depth=0.006):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    ob.scale = (depth, 0.03, length)
    ob.location = (x, BT / 2, z)
    ob.data.materials.append(titanium)
    b = ob.modifiers.new("Round", "BEVEL")
    b.width, b.segments = 0.4, 6
    for p in me.polygons:
        p.use_smooth = True
    ob.parent = phone


side_button("Side button", BW / 2 + 0.001, 0.22, 0.13)
side_button("Camera control", BW / 2 + 0.0005, -0.24, 0.07, 0.004)
side_button("Action button", -BW / 2 - 0.001, 0.47, 0.055)
side_button("Volume up", -BW / 2 - 0.001, 0.32, 0.09)
side_button("Volume down", -BW / 2 - 0.001, 0.19, 0.09)

# the screen: the capture, emissive, with a little glass reflection that
# fades out as the phone settles so the last frame is the capture itself
sme = bpy.data.meshes.new("Screen")
bm = bmesh.new()
uv = bm.loops.layers.uv.new("UVMap")
verts = [bm.verts.new((x, -0.0007, z)) for x, z in rounded_rect(SW, SH, SR, 24)]
face = bm.faces.new(verts)
for loop in face.loops:
    x, _, z = loop.vert.co
    loop[uv].uv = ((x + SW / 2) / SW, (z + SH / 2) / SH)
bm.to_mesh(sme)
bm.free()
screen = bpy.data.objects.new("Screen", sme)
scene.collection.objects.link(screen)
screen.parent = phone

sm = bpy.data.materials.new("Screen")
sm.use_nodes = True
nt = sm.node_tree
nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputMaterial")
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = bpy.data.images.load(os.path.join(HERE, "screen_board.png"))
tex.image.colorspace_settings.name = "sRGB"
tex.interpolation = "Cubic"
emit = nt.nodes.new("ShaderNodeEmission")
emit.inputs["Strength"].default_value = 1.0
gloss = nt.nodes.new("ShaderNodeBsdfGlossy")
gloss.inputs["Roughness"].default_value = 0.06
mix_gloss = nt.nodes.new("ShaderNodeMixShader")
transparent = nt.nodes.new("ShaderNodeBsdfTransparent")
mix_alpha = nt.nodes.new("ShaderNodeMixShader")
nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
nt.links.new(emit.outputs[0], mix_gloss.inputs[1])
nt.links.new(gloss.outputs[0], mix_gloss.inputs[2])
nt.links.new(tex.outputs["Alpha"], mix_alpha.inputs["Fac"])
nt.links.new(transparent.outputs[0], mix_alpha.inputs[1])
nt.links.new(mix_gloss.outputs[0], mix_alpha.inputs[2])
nt.links.new(mix_alpha.outputs[0], out.inputs["Surface"])
sme.materials.append(sm)
gloss_fac = mix_gloss.inputs["Fac"]

# ---------------------------------------------------------------- camera
cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
scene.collection.objects.link(cam)
cam.data.lens = 50
cam.data.sensor_fit = "HORIZONTAL"
cam.data.sensor_width = 36
cam.location = (0, 0, 0)
cam.rotation_euler = (math.radians(90), 0, 0)      # looking down +Y, +Z up
scene.camera = cam

# where the screen fills the frame: full width, top edge on the frame's top
D = SW / (36 / 50)
half_h = (SW / 2) * 1920 / 1080
END = Vector((0.0, D + 0.0007, half_h - SH / 2))

# ---------------------------------------------------------------- light
def area(name, loc, energy, color, size, target=Vector((0, 1.2, 0))):
    li = bpy.data.lights.new(name, "AREA")
    li.energy, li.color, li.size = energy, color, size
    ob = bpy.data.objects.new(name, li)
    scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (target - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return ob


area("Key", (-2.6, -0.6, 2.4), 520, (1.0, 0.86, 0.66), 2.5)
area("Gold rim", (2.4, 2.8, 1.0), 1300, (1.0, 0.68, 0.22), 1.6)
area("Low rim", (-2.2, 3.2, -1.6), 420, (1.0, 0.78, 0.4), 1.4)
sweep = area("Sweep", (3.0, -0.5, 3.0), 260, (1.0, 0.9, 0.72), 5.0)

# ---------------------------------------------------------------- motion
# Two moves: it hangs mid-frame turning toward us (the titanium catches the
# gold), then pushes straight into the screen on the last beat.
START = Vector((0.42, 2.95, -0.3))
MID = Vector((0.08, 2.15, -0.1))
ROT0 = Euler((math.radians(12), math.radians(-9), math.radians(-64))).to_quaternion()
ROT_MID = Euler((math.radians(4), math.radians(-2), math.radians(-13))).to_quaternion()
ROT1 = Quaternion()
PUSH = 34 / (FRAMES - 1)


def smooth(t):
    return t * t * (3 - 2 * t)


def inout(t):         # cubic in-out
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


for f in range(1, FRAMES + 1):
    t = (f - 1) / (FRAMES - 1)
    if t < PUSH:
        q = smooth(t / PUSH)
        loc = START.lerp(MID, q)
        rot = ROT0.slerp(ROT_MID, q)
    else:
        q = inout((t - PUSH) / (1 - PUSH))
        loc = MID.lerp(END, q)
        rot = ROT_MID.slerp(ROT1, min(1.0, q * 1.05))
    phone.location = loc
    phone.rotation_quaternion = rot
    phone.keyframe_insert("location", frame=f)
    phone.keyframe_insert("rotation_quaternion", frame=f)
    # a soft light slides across the glass while it turns
    sweep.location = (2.6 - 5.2 * smooth(t), -0.5, 2.8 - 1.2 * t)
    sweep.keyframe_insert("location", frame=f)
    gloss_fac.default_value = 0.07 * max(0.0, 1 - t / 0.8)
    gloss_fac.keyframe_insert("default_value", frame=f)

if PREVIEW:
    for f in (1, 18, 34, 46, 54, 60):
        scene.frame_set(f)
        scene.render.filepath = os.path.join(HERE, f"preview_{f:02d}.png")
        bpy.ops.render.render(write_still=True)
else:
    bpy.ops.render.render(animation=True)
print("DONE", END[:])
