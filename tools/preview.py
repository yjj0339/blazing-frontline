# -*- coding: utf-8 -*-
"""导入 GLB 渲染预览图 -> shots/preview_*.png（Workbench 稳定出几何，TRACK_TO 对准）"""
import bpy, os, math

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
MODELS = os.path.join(ROOT, 'assets', 'models')
SHOTS = os.path.join(ROOT, 'shots')
os.makedirs(SHOTS, exist_ok=True)

def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

def bbox_of(root):
    xs, ys, zs = [], [], []
    def rec(o):
        if o.type == 'MESH':
            for c in o.bound_box:
                w = o.matrix_world @ __import__('mathutils').Vector(c)
                xs.append(w.x); ys.append(w.y); zs.append(w.z)
        for c in o.children:
            rec(c)
    rec(root)
    if not xs:
        return None
    return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))

def load(fname, x=0, y=0, rot=0):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, fname))
    new = [o for o in bpy.data.objects if o not in before]
    root = None
    for o in new:
        if o.parent is None or o.parent not in new:
            root = o
    root.location.x = x
    root.location.y = y
    root.rotation_euler.z = rot
    bpy.context.view_layer.update()
    bb = bbox_of(root)
    print('LOADED', fname, 'root=', root.name, 'type=', root.type, 'bb=', bb)
    return root

def setup_cam(loc, look_at, lens=50):
    cam = bpy.data.cameras.new('cam')
    cam.lens = lens
    o = bpy.data.objects.new('cam', cam)
    bpy.context.collection.objects.link(o)
    o.location = loc
    tgt = bpy.data.objects.new('tgt', None)
    bpy.context.collection.objects.link(tgt)
    tgt.location = look_at
    con = o.constraints.new('TRACK_TO')
    con.target = tgt
    bpy.context.scene.camera = o

def sun():
    l = bpy.data.lights.new('sun', 'SUN')
    l.energy = 3
    o = bpy.data.objects.new('sun', l)
    bpy.context.collection.objects.link(o)
    o.rotation_euler = (0.8, 0.2, 0.5)

def render(fname):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'TEXTURE'
    sc.display.shading.show_shadows = True
    sc.render.resolution_x = 900
    sc.render.resolution_y = 700
    sc.render.filepath = os.path.join(SHOTS, fname)
    bpy.ops.render.render(write_still=True)
    print('rendered', fname)

clear()
sun()
s = load('soldier.glb')
s.rotation_euler.z = 0
setup_cam((1.6, -3.4, 1.3), (0, 0, 0.95))
render('preview_soldier_front.png')

clear()
sun()
s = load('soldier.glb')
# 摆持枪姿态（与 bots.js 相同的两段肢体参数）
import mathutils
def get(name):
    return next(o for o in bpy.data.objects if o.name == name)
def fin(o, x, y=0.0, z=0.0):
    o.rotation_euler.x += x; o.rotation_euler.y += y; o.rotation_euler.z += z
for o in bpy.data.objects:
    o.rotation_mode = 'XYZ'
fin(get('arm_R'), -1.05, 0, -0.32)
fin(get('fore_R'), -0.62)
fin(get('arm_L'), -1.28, 0.32, 0.42)
fin(get('fore_L'), -0.75)
fin(get('leg_R'), 0.18)
fin(get('shin_R'), 0.22)
fin(get('leg_L'), -0.12)
bpy.context.view_layer.update()
setup_cam((2.2, -3.2, 1.4), (0.05, 0, 1.15))
render('preview_soldier_pose.png')

clear()
sun()
load('fp_ar.glb', -1.0, 0.7)
load('fp_sg.glb', 1.0, 0.7)
load('fp_sr.glb', -1.0, -0.9)
load('fp_pg.glb', 1.0, -0.9)
setup_cam((0, -4.2, 1.5), (0, 0, 0.55))
render('preview_fp_weapons.png')

clear()
sun()
load('props.glb')
setup_cam((10, -13, 9), (10, 0, 0.8), lens=40)
render('preview_props.png')
print('PREVIEW DONE')
