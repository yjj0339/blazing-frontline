# -*- coding: utf-8 -*-
"""无头 Blender 建模《烈日战线》全部资产 -> assets/models/*.glb
士兵：分件独立枢轴（origin=关节），JS 端按节点名摆动（fangkuai-epic 验证管线）。
建模惯例：角色面朝 Blender -Y（导出 glTF 后即 three 的 +Z）；
第一人称视图模型面朝 Blender +Y（导出后 three 的 -Z，即相机前方）。
颜色一律经 srgb() 转线性，避免发粉。
"""
import bpy, math, os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'models')
os.makedirs(OUT, exist_ok=True)

def srgb(r, g, b, a=1.0):
    return ((r/255.0)**2.2, (g/255.0)**2.2, (b/255.0)**2.2, a)

# ---------------- 材质 ----------------
def mat(name, rgb, rough=1.0, metal=0.0, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = srgb(*rgb)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    try:
        bsdf.inputs['Specular IOR Level'].default_value = 0.06
    except Exception:
        pass
    if emit > 0:
        try:
            bsdf.inputs['Emission Color'].default_value = srgb(*rgb)
            bsdf.inputs['Emission Strength'].default_value = emit
        except Exception:
            pass
    return m

M = {}
def build_mats():
    M['skin']   = mat('skin',   (232, 176, 138))
    M['tmain']  = mat('T_main', (59, 110, 165))      # 队色主色 JS 换
    M['tvest']  = mat('T_vest', (42, 74, 112))       # 队色背心 JS 换
    M['dark']   = mat('dark',   (52, 56, 64))        # 战术裤
    M['boots']  = mat('boots',  (44, 38, 32))
    M['glove']  = mat('glove',  (58, 52, 44))
    M['visor']  = mat('visor',  (66, 226, 255), rough=0.35, emit=0.9)
    M['mask']   = mat('mask',   (40, 44, 52))
    M['gun']    = mat('gun',    (58, 63, 70), rough=0.75)
    M['gund']   = mat('gund',   (32, 35, 40), rough=0.85)
    M['gunl']   = mat('gunl',   (108, 112, 118), rough=0.7)   # 枪浅件
    M['glass']  = mat('glass',  (26, 32, 40), rough=0.25)
    M['wood']   = mat('wood',   (169, 123, 79))
    M['woodd']  = mat('woodd',  (134, 96, 58))
    M['steel']  = mat('steel',  (154, 163, 172), rough=0.6)      # 集装箱 JS 可换色
    M['steel2'] = mat('steel2', (120, 128, 134), rough=0.65)
    M['sand']   = mat('sand',   (201, 179, 130))
    M['barrel'] = mat('barrel', (61, 111, 168), rough=0.55)
    M['rock']   = mat('rock',   (141, 144, 137))
    M['strap']  = mat('strap',  (36, 40, 46))

# ---------------- 几何 helper ----------------
def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for block in list(bpy.data.meshes):
        if block.users == 0:
            bpy.data.meshes.remove(block)

def box(name, m, size, loc, rot=(0, 0, 0), bevel=0.012, seg=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        mod = o.modifiers.new(' bev', 'BEVEL')
        mod.width = bevel
        mod.segments = seg
        mod.limit_method = 'ANGLE'
    o.data.materials.append(m)
    return o

def cyl(name, m, r, depth, loc, rot=(0, 0, 0), verts=12, bevel=0.008):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.active_object
    o.name = name
    if bevel > 0:
        mod = o.modifiers.new(' bev', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    o.data.materials.append(m)
    return o

def sph(name, m, r, loc, detail=2):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=r, location=loc, subdivisions=detail)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(m)
    return o

def join(objs, name, pivot):
    """join 到 objs[0]，origin 移到 pivot"""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    bpy.ops.object.mode_set(mode='OBJECT')
    saved = bpy.context.scene.cursor.location.copy()
    bpy.context.scene.cursor.location = pivot
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR', center='MEDIAN')
    bpy.context.scene.cursor.location = saved
    return o

def parent_to(child, p):
    child.parent = p
    child.matrix_parent_inverse = p.matrix_world.inverted()
    bpy.context.view_layer.update()

def empty(name, loc=(0, 0, 0)):
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=loc)
    e = bpy.context.active_object
    e.name = name
    e.empty_display_size = 0.2
    return e

def export(root, fname):
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    def rec(o):
        for c in o.children:
            c.select_set(True)
            rec(c)
    rec(root)
    bpy.context.view_layer.objects.active = root
    path = os.path.join(OUT, fname)
    try:
        bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_apply=True)
    except TypeError:
        bpy.ops.export_scene.gltf(filepath=path, export_use_selection=True, export_format='GLB', export_apply=True)
    print('exported', fname, os.path.getsize(path), 'bytes')

# ============================================================
# 士兵 v2（面朝 -Y）：两段四肢（肘/膝独立枢轴）、圆盔、全套装具
# ============================================================
def build_soldier():
    clear()
    root = empty('Soldier')

    # ---- 腿：大腿(leg) + 小腿(shin，挂在大腿下) ----
    for side, sx in (('L', -1), ('R', 1)):
        x = 0.105 * sx
        # 大腿组：大腿+护膝，pivot 髋 0.92
        thigh = box(f'thigh_{side}', M['dark'], (0.155, 0.18, 0.42), (x, 0, 0.71))
        tpanl = box(f'tpanl_{side}', M['strap'], (0.16, 0.17, 0.10), (x, -0.01, 0.62))
        knee  = box(f'knee_{side}',  M['strap'], (0.15, 0.165, 0.09), (x, -0.025, 0.505), bevel=0.03, seg=3)
        leg = join([thigh, tpanl, knee], f'leg_{side}', (x, 0, 0.92))
        # 小腿组：小腿+靴，pivot 膝 0.49
        shin  = box(f'shinbox_{side}', M['dark'], (0.13, 0.145, 0.34), (x, -0.005, 0.305))
        cuff  = box(f'cuff_{side}',  M['strap'], (0.14, 0.155, 0.07), (x, -0.01, 0.43))
        boot  = box(f'boot_{side}',  M['boots'], (0.15, 0.25, 0.12), (x, -0.05, 0.06))
        sole  = box(f'sole_{side}',  M['gund'],  (0.16, 0.26, 0.035), (x, -0.05, 0.0175))
        shinJ = join([shin, cuff, boot, sole], f'shin_{side}', (x, 0, 0.49))
        parent_to(shinJ, leg)
        parent_to(leg, root)

    # ---- 躯干（pivot 骨盆 0.94）----
    torso_geo = [
        box('hips',   M['dark'],  (0.34, 0.25, 0.13), (0, 0, 0.965)),
        box('chest',  M['tmain'], (0.40, 0.235, 0.44), (0, 0, 1.215)),
        box('belt',   M['strap'], (0.415, 0.255, 0.06), (0, 0, 0.985)),
        box('buckle', M['gunl'],  (0.08, 0.265, 0.045), (0, 0, 0.985)),
        # 战术背心 + 弹匣袋
        box('vest',   M['tvest'], (0.355, 0.30, 0.34), (0, -0.005, 1.215)),
        box('pouch1', M['strap'], (0.085, 0.05, 0.10), (-0.095, -0.165, 1.15)),
        box('pouch2', M['strap'], (0.085, 0.05, 0.10), (0.0,   -0.165, 1.15)),
        box('pouch3', M['strap'], (0.085, 0.05, 0.10), (0.095, -0.165, 1.15)),
        box('suspL',  M['strap'], (0.05, 0.035, 0.28), (-0.125, -0.02, 1.36)),
        box('suspR',  M['strap'], (0.05, 0.035, 0.28), (0.125, -0.02, 1.36)),
        # 对讲机 + 天线
        box('radio',  M['gund'],  (0.05, 0.065, 0.10), (0.145, -0.14, 1.32)),
        cyl('antenna', M['gund'], 0.007, 0.30, (0.145, -0.115, 1.50), verts=6, bevel=0),
        # 背包 + 卷毯 + 水壶
        box('pack',   M['tvest'], (0.27, 0.13, 0.32), (0, 0.175, 1.17)),
        box('packtop',M['strap'], (0.19, 0.11, 0.07), (0, 0.185, 1.365)),
        box('roll',   M['sand'],  (0.29, 0.10, 0.10), (0, 0.195, 1.435), bevel=0.03),
        cyl('canteen', M['sand'], 0.05, 0.11, (-0.155, 0.155, 1.03), verts=10),
        # 肩甲 + 领口
        box('padL',   M['tvest'], (0.09, 0.23, 0.075), (-0.235, 0, 1.40)),
        box('padR',   M['tvest'], (0.09, 0.23, 0.075), (0.235, 0, 1.40)),
        box('collar', M['strap'], (0.19, 0.15, 0.045), (0, -0.045, 1.455)),
    ]
    torso = join(torso_geo, 'torso', (0, 0, 0.94))
    parent_to(torso, root)

    # ---- 头（pivot 颈 1.50）：圆盔+耳罩+护目镜框+面罩 ----
    neck  = box('neck',  M['skin'], (0.10, 0.10, 0.07), (0, 0, 1.515))
    face  = box('face',  M['skin'], (0.195, 0.205, 0.20), (0, -0.005, 1.60))
    helm  = box('helm',  M['tmain'], (0.245, 0.25, 0.13), (0, 0.005, 1.685))
    helmT = sph('helmT', M['tmain'], 0.127, (0, 0.0, 1.742), detail=2)
    brim  = box('brim',  M['tmain'], (0.255, 0.245, 0.045), (0, -0.012, 1.616))
    earL  = box('earL',  M['mask'],  (0.035, 0.085, 0.095), (-0.122, 0.0, 1.60))
    earR  = box('earR',  M['mask'],  (0.035, 0.085, 0.095), (0.122, 0.0, 1.60))
    vfr   = box('vfr',   M['gund'],  (0.185, 0.06, 0.04), (0, -0.118, 1.60))
    visor = box('visor', M['visor'], (0.165, 0.045, 0.06), (0, -0.118, 1.628))
    mask  = box('mask',  M['mask'],  (0.145, 0.045, 0.085), (0, -0.10, 1.535))
    headj = join([neck, face, helm, helmT, brim, earL, earR, vfr, visor, mask], 'head', (0, 0, 1.50))
    parent_to(headj, torso)

    # ---- 手臂：上臂(arm) + 前臂(fore，挂在臂下)，pivot 肩/肘 ----
    for side, sx in (('L', -1), ('R', 1)):
        x = 0.26 * sx
        delt  = sph(f'delt_{side}', M['tmain'], 0.078, (x + 0.005*sx, 0, 1.405), detail=1)
        upper = box(f'upper_{side}', M['tmain'], (0.112, 0.112, 0.26), (x + 0.008*sx, 0, 1.265))
        arm = join([delt, upper], f'arm_{side}', (x, 0, 1.42))
        fore  = box(f'foreb_{side}', M['tmain'], (0.095, 0.095, 0.24), (x + 0.014*sx, -0.008, 0.975))
        elbp  = box(f'elbp_{side}',  M['strap'], (0.115, 0.115, 0.075), (x + 0.012*sx, -0.002, 1.115), bevel=0.025)
        hand  = box(f'hand_{side}',  M['glove'], (0.095, 0.10, 0.115), (x + 0.016*sx, -0.028, 0.835))
        thumb = box(f'thumb_{side}', M['glove'], (0.03, 0.045, 0.05), (x + 0.016*sx + 0.055*sx, -0.02, 0.85))
        foreJ = join([fore, elbp, hand, thumb], f'fore_{side}', (x + 0.012*sx, 0, 1.13))
        parent_to(foreJ, arm)
        parent_to(arm, torso)

    # ---- 步枪（同 v1，细节略增：导轨块、枪带环）----
    gun = [
        cyl('barrel', M['gun'], 0.022, 0.42, (0.12, -0.32, 1.235), rot=(math.pi/2, 0, 0), verts=10),
        cyl('muzz',   M['gund'], 0.028, 0.08, (0.12, -0.545, 1.235), rot=(math.pi/2, 0, 0), verts=10),
        box('recv',   M['gun'],  (0.06, 0.26, 0.095), (0.12, -0.05, 1.235)),
        box('rail',   M['gund'], (0.03, 0.24, 0.022), (0.12, -0.10, 1.292)),
        box('rail2',  M['gund'], (0.022, 0.03, 0.018), (0.12, -0.16, 1.31)),
        box('handgrd',M['gund'], (0.055, 0.17, 0.07), (0.12, -0.235, 1.235)),
        box('foregrip',M['gund'],(0.035, 0.05, 0.09), (0.12, -0.30, 1.17), rot=(0.25, 0, 0)),
        box('mag',    M['gund'], (0.05, 0.075, 0.15), (0.12, 0.015, 1.12), rot=(-0.22, 0, 0)),
        box('magbase',M['gunl'], (0.055, 0.08, 0.02), (0.12, 0.015, 1.045), rot=(-0.22, 0, 0)),
        box('grip',   M['gund'], (0.045, 0.06, 0.115), (0.12, 0.085, 1.135), rot=(0.30, 0, 0)),
        box('stock',  M['gun'],  (0.05, 0.17, 0.10), (0.12, 0.20, 1.22)),
        box('stockp', M['gund'], (0.055, 0.045, 0.12), (0.12, 0.285, 1.22)),
        box('sightF', M['gund'], (0.022, 0.02, 0.045), (0.12, -0.30, 1.30)),
        box('eject',  M['gund'], (0.018, 0.06, 0.03), (0.155, -0.02, 1.235)),
        box('slingR', M['gunl'], (0.014, 0.014, 0.05), (0.12, 0.14, 1.16)),
        box('laser',  M['gund'], (0.025, 0.045, 0.03), (0.145, -0.20, 1.20)),
    ]
    rifle = join(gun, 'rifle', (0.12, 0.085, 1.135))
    parent_to(rifle, torso)

    export(root, 'soldier.glb')
    return root

# ============================================================
# 第一人称视图模型（面朝 +Y -> three 相机 -Z），原点=右手握把
# ============================================================
def _fp_arms(rifle_len_front, left_hand_x=0.0, left_hand_y=0.20):
    """返回双手臂部件列表（手套+袖子），右手在原点握把处"""
    parts = []
    # 右手 + 右袖（从右下后方伸入）
    parts.append(box('rhand', M['glove'], (0.075, 0.10, 0.10), (0, -0.075, -0.015), rot=(0.15, 0, 0)))
    parts.append(box('rcuff', M['tmain'], (0.085, 0.07, 0.095), (0.008, -0.155, -0.05), rot=(0.55, 0, 0.12)))
    parts.append(box('rarm',  M['tvest'], (0.095, 0.20, 0.10), (0.045, -0.29, -0.10), rot=(0.95, 0, 0.18)))
    # 左手 + 左袖（托前护木）
    parts.append(box('lhand', M['glove'], (0.075, 0.10, 0.095), (left_hand_x, left_hand_y, -0.045), rot=(0.1, 0, 0)))
    parts.append(box('lcuff', M['tmain'], (0.085, 0.07, 0.09), (left_hand_x - 0.02, left_hand_y + 0.10, -0.075), rot=(-0.6, 0, -0.15)))
    parts.append(box('larm',  M['tvest'], (0.09, 0.20, 0.095), (left_hand_x - 0.055, left_hand_y + 0.22, -0.135), rot=(-1.05, 0, -0.2)))
    return parts

def build_fp(kind):
    clear()
    root = empty('FP_Root')
    parts = []
    if kind == 'ar':
        parts += [
            box('recv',    M['gun'],  (0.055, 0.26, 0.085), (0, 0.02, 0.03)),
            box('rail',    M['gund'], (0.03, 0.22, 0.02), (0, 0.0, 0.082)),
            cyl('barrel',  M['gun'],  0.017, 0.30, (0, 0.29, 0.045), rot=(math.pi/2, 0, 0), verts=10),
            cyl('muzz',    M['gund'], 0.024, 0.075, (0, 0.475, 0.045), rot=(math.pi/2, 0, 0), verts=10),
            box('handgrd', M['gund'], (0.05, 0.16, 0.065), (0, 0.20, 0.04)),
            box('mag',     M['gund'], (0.045, 0.075, 0.14), (0, 0.055, -0.06), rot=(-0.22, 0, 0)),
            box('grip',    M['gund'], (0.04, 0.055, 0.105), (0, -0.075, -0.045), rot=(0.3, 0, 0)),
            box('stock',   M['gun'],  (0.048, 0.14, 0.085), (0, -0.175, 0.015)),
            box('sightR',  M['gund'], (0.035, 0.02, 0.05), (0, -0.075, 0.105)),
            box('sightF',  M['gund'], (0.02, 0.018, 0.04), (0, 0.14, 0.105)),
            box('laser',   M['gund'], (0.024, 0.04, 0.028), (0.032, 0.12, 0.028)),
        ]
        parts += _fp_arms(0.30, 0, 0.20)
    elif kind == 'sg':
        parts += [
            cyl('barrel',  M['gun'],  0.023, 0.42, (0, 0.24, 0.05), rot=(math.pi/2, 0, 0), verts=10),
            cyl('tube',    M['gunl'], 0.019, 0.34, (0, 0.19, 0.005), rot=(math.pi/2, 0, 0), verts=10),
            box('recv',    M['gun'],  (0.06, 0.18, 0.095), (0, -0.05, 0.02)),
            box('pump',    M['woodd'],(0.055, 0.13, 0.06), (0, 0.13, 0.005)),
            box('grip',    M['woodd'],(0.042, 0.06, 0.11), (0, -0.10, -0.045), rot=(0.35, 0, 0)),
            box('stock',   M['woodd'],(0.05, 0.16, 0.09), (0, -0.22, 0.0), rot=(0.08, 0, 0)),
            box('bead',    M['gund'], (0.012, 0.012, 0.018), (0, 0.445, 0.075)),
        ]
        parts += _fp_arms(0.30, 0, 0.13)
    elif kind == 'sr':
        parts += [
            cyl('barrel',  M['gun'],  0.016, 0.52, (0, 0.36, 0.045), rot=(math.pi/2, 0, 0), verts=10),
            cyl('muzz',    M['gund'], 0.022, 0.09, (0, 0.645, 0.045), rot=(math.pi/2, 0, 0), verts=10),
            box('recv',    M['gun'],  (0.055, 0.30, 0.09), (0, 0.0, 0.025)),
            box('rail',    M['gund'], (0.028, 0.30, 0.018), (0, 0.0, 0.078)),
            box('stock',   M['gun'],  (0.048, 0.20, 0.10), (0, -0.23, -0.005)),
            box('cheek',   M['gund'], (0.04, 0.10, 0.045), (0, -0.20, 0.065)),
            box('grip',    M['gund'], (0.04, 0.055, 0.11), (0, -0.10, -0.05), rot=(0.3, 0, 0)),
            box('mag',     M['gund'], (0.042, 0.09, 0.10), (0, 0.04, -0.055)),
            # 大瞄镜
            cyl('scope',   M['gund'], 0.032, 0.22, (0, 0.02, 0.115), rot=(math.pi/2, 0, 0), verts=12),
            cyl('scopeF',  M['gund'], 0.04, 0.05, (0, 0.145, 0.115), rot=(math.pi/2, 0, 0), verts=12),
            cyl('scopeB',  M['gund'], 0.038, 0.045, (0, -0.105, 0.115), rot=(math.pi/2, 0, 0), verts=12),
            sph('lensF',   M['glass'], 0.032, (0, 0.172, 0.115), detail=1),
            box('scopeM1', M['gund'], (0.02, 0.03, 0.045), (0, 0.02, 0.075)),
            box('bolt',    M['gunl'], (0.05, 0.02, 0.02), (0.045, -0.02, 0.03)),
        ]
        parts += _fp_arms(0.36, 0, 0.30)
    elif kind == 'pg':
        parts += [
            box('slide',   M['gunl'], (0.042, 0.19, 0.055), (0, 0.05, 0.035)),
            box('frame',   M['gun'],  (0.04, 0.15, 0.045), (0, 0.03, -0.005)),
            cyl('barrel',  M['gund'], 0.012, 0.03, (0, 0.15, 0.038), rot=(math.pi/2, 0, 0), verts=10),
            box('grip',    M['gund'], (0.038, 0.05, 0.115), (0, -0.045, -0.055), rot=(0.28, 0, 0)),
            box('magbase', M['gun'],  (0.042, 0.055, 0.02), (0, -0.05, -0.115), rot=(0.28, 0, 0)),
            box('guard',   M['gun'],  (0.03, 0.07, 0.014), (0, 0.02, -0.038)),
            box('sightF',  M['gund'], (0.012, 0.012, 0.02), (0, 0.135, 0.072)),
            box('sightR',  M['gund'], (0.028, 0.014, 0.02), (0, -0.025, 0.072)),
        ]
        # 手枪：左手叠握（副手包住右手）
        parts.append(box('lhand', M['glove'], (0.08, 0.09, 0.10), (-0.035, -0.09, -0.045), rot=(0.2, 0, 0)))
        parts.append(box('lcuff', M['tmain'], (0.085, 0.07, 0.09), (-0.055, -0.165, -0.09), rot=(0.6, 0, -0.15)))
        parts.append(box('larm',  M['tvest'], (0.09, 0.18, 0.095), (-0.085, -0.28, -0.15), rot=(1.0, 0, -0.22)))
    for p in parts:
        parent_to(p, root)
    body = join(parts, 'fp_' + kind, (0, 0, 0))
    export(body, f'fp_{kind}.glb')

# ============================================================
# 战场道具（各自独立节点，origin=底部中心）
# ============================================================
def build_props():
    clear()
    root = empty('Props')
    x0 = 0.0

    def place(node, dx):
        parent_to(node, root)
        node.location.x = dx
        bpy.context.view_layer.update()
        return node

    # 大木箱
    a = [
        box('cb', M['wood'], (0.9, 0.9, 0.9), (0, 0, 0.45)),
        box('cbt', M['woodd'], (0.94, 0.94, 0.05), (0, 0, 0.885)),
        box('cbb', M['woodd'], (0.94, 0.94, 0.05), (0, 0, 0.045)),
        box('cbx1', M['woodd'], (0.06, 0.94, 0.9), (0.42, 0, 0.45)),
        box('cbx2', M['woodd'], (0.06, 0.94, 0.9), (-0.42, 0, 0.45)),
        box('cby', M['woodd'], (0.9, 0.06, 0.9), (0, 0.42, 0.45)),
        box('cby2', M['woodd'], (0.9, 0.06, 0.9), (0, -0.42, 0.45)),
    ]
    place(join(a, 'CrateBig', (0, 0, 0)), x0); x0 += 2.2

    # 小木箱
    s = 0.55
    a = [
        box('cs', M['wood'], (s, s, s), (0, 0, s/2)),
        box('cst', M['woodd'], (s+0.04, s+0.04, 0.045), (0, 0, s-0.02)),
        box('csx1', M['woodd'], (0.05, s+0.02, s), (s/2-0.02, 0, s/2)),
        box('csx2', M['woodd'], (0.05, s+0.02, s), (-s/2+0.02, 0, s/2)),
        box('csz', M['woodd'], (s+0.02, 0.05, s), (0, s/2-0.02, s/2)),
    ]
    place(join(a, 'CrateSmall', (0, 0, 0)), x0); x0 += 1.8

    # 油桶
    a = [
        cyl('bb', M['barrel'], 0.28, 0.88, (0, 0, 0.44), verts=14),
        cyl('br1', M['steel2'], 0.295, 0.05, (0, 0, 0.24), verts=14),
        cyl('br2', M['steel2'], 0.295, 0.05, (0, 0, 0.64), verts=14),
        cyl('btop', M['barrel'], 0.282, 0.03, (0, 0, 0.895), verts=14),
        cyl('bcap', M['steel2'], 0.06, 0.04, (0.1, 0.08, 0.925), verts=8),
    ]
    place(join(a, 'Barrel', (0, 0, 0)), x0); x0 += 1.6

    # 沙袋墙
    a = []
    rows = [(0.16, 3, 0.15), (0.44, 3, 0.15), (0.72, 2, 0.15)]
    for ri, (z, n, h) in enumerate(rows):
        for i in range(n):
            w = 0.62
            x = (i - (n-1)/2) * (w + 0.02)
            a.append(box(f'sb{ri}_{i}', M['sand'], (w, 0.42, h*1.9), (x, 0, z + h*0.5), rot=(0, 0, 0.06*((i%2)*2-1)), bevel=0.09, seg=3))
    place(join(a, 'Sandbag', (0, 0, 0)), x0); x0 += 2.6

    # 集装箱（基础灰色，JS 克隆换色）
    L, Wd, H = 6.0, 2.44, 2.6
    a = [
        box('cnb', M['steel'], (L, Wd, H), (0, 0, H/2), bevel=0.02),
    ]
    # 竖棱纹（两侧+顶部）
    n = 11
    for i in range(n):
        x = -L/2 + 0.45 + i * (L-0.9)/(n-1)
        a.append(box(f'cnp{i}', M['steel2'], (0.14, Wd+0.02, H-0.25), (x, 0, H/2)))
    a.append(box('cndo', M['steel2'], (0.06, Wd+0.03, H-0.2), (L/2-0.12, 0, (H-0.2)/2)))
    a.append(box('cndo2', M['steel2'], (0.06, Wd+0.03, H-0.2), (-L/2+0.12, 0, (H-0.2)/2)))
    for sx in (-1, 1):
        for sy in (-1, 1):
            a.append(box(f'cnc{sx}{sy}', M['gund'], (0.3, 0.3, 0.3), (sx*(L/2-0.12), sy*(Wd/2-0.12), 0.15)))
            a.append(box(f'cncT{sx}{sy}', M['gund'], (0.3, 0.3, 0.3), (sx*(L/2-0.12), sy*(Wd/2-0.12), H-0.15)))
    place(join(a, 'Container', (0, 0, 0)), x0); x0 += 8.0

    # 哨塔
    a = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            a.append(cyl(f'tleg{sx}{sy}', M['woodd'], 0.09, 2.6, (sx*1.1, sy*1.1, 1.3), rot=(0.06*sx, -0.06*sy, 0), verts=8))
    a.append(box('tdeck', M['wood'], (2.9, 2.9, 0.12), (0, 0, 2.66)))
    for sx in (-1, 1):
        a.append(box('traily', M['woodd'], (2.9, 0.07, 0.07), (0, sx*1.4, 3.35)))
        a.append(box('trailx', M['woodd'], (0.07, 2.9, 0.07), (sx*1.4, 0, 3.35)))
    for i in range(8):
        px = -1.4 + (i % 4) * 0.933
        py = -1.4 + (i // 4) * 2.8
        a.append(box(f'tpost{i}', M['woodd'], (0.07, 0.07, 0.75), (px if i % 4 else px, py, 3.05)))
    for sx in (-1, 1):
        for sy in (-1, 1):
            a.append(cyl(f'troof{sx}{sy}', M['woodd'], 0.05, 0.9, (sx*1.1, sy*1.1, 3.85), rot=(0.15*sx, -0.15*sy, 0), verts=6))
    a.append(box('troof', M['tvest'], (3.3, 3.3, 0.09), (0, 0, 4.25), bevel=0.02))
    for i in range(5):
        a.append(box(f'tlad{i}', M['woodd'], (0.5, 0.05, 0.06), (0, 1.52, 0.45 + i*0.5)))
    a.append(box('tladr', M['woodd'], (0.05, 0.05, 2.6), (-0.24, 1.5, 1.3)))
    a.append(box('tladr2', M['woodd'], (0.05, 0.05, 2.6), (0.24, 1.5, 1.3)))
    place(join(a, 'Tower', (0, 0, 0)), x0); x0 += 6.0

    # 围栏段
    a = [
        box('f1', M['woodd'], (0.09, 0.09, 1.25), (-0.95, 0, 0.625)),
        box('f2', M['woodd'], (0.09, 0.09, 1.25), (0.95, 0, 0.625)),
        box('f3', M['wood'], (2.0, 0.05, 0.16), (0, 0, 1.05)),
        box('f4', M['wood'], (2.0, 0.05, 0.16), (0, 0, 0.72)),
        box('f5', M['wood'], (2.0, 0.05, 0.16), (0, 0, 0.39)),
    ]
    place(join(a, 'Fence', (0, 0, 0)), x0); x0 += 2.8

    # 断墙
    a = [
        box('w1', M['steel2'], (1.8, 0.3, 2.2), (-0.6, 0, 1.1), bevel=0.02),
        box('w2', M['steel2'], (1.0, 0.3, 1.4), (0.9, 0, 0.7), bevel=0.02),
        box('w3', M['sand'], (0.5, 0.4, 0.5), (0.15, 0.02, 0.25), bevel=0.06),
    ]
    place(join(a, 'WallRuin', (0, 0, 0)), x0); x0 += 3.4

    # 木托盘
    a = [box(f'pl{i}', M['wood'], (1.2, 0.16, 0.035), (0, -0.5 + i*0.5, 0.105)) for i in range(3)]
    a += [box(f'pw{i}', M['woodd'], (0.16, 1.16, 0.035), (-0.5 + i*0.5, 0, 0.035)) for i in range(3)]
    a += [box(f'pb{i}', M['woodd'], (0.16, 1.16, 0.07), (-0.5 + i*0.5, 0, 0.0)) for i in range(3)]
    place(join(a, 'Pallet', (0, 0, 0)), x0); x0 += 2.0

    # 手雷
    a = [
        sph('gbody', M['gund'], 0.055, (0, 0, 0.06), detail=2),
        cyl('gneck', M['gunl'], 0.02, 0.03, (0, 0, 0.115), verts=8),
        box('glever', M['gunl'], (0.012, 0.02, 0.07), (0.02, 0, 0.12), rot=(0.3, 0, 0)),
        cyl('gpin', M['gunl'], 0.008, 0.03, (-0.02, 0.02, 0.135), rot=(0, math.pi/2, 0), verts=6),
    ]
    place(join(a, 'Grenade', (0, 0, 0)), x0); x0 += 1.0

    # 石头
    for name, r, dx in (('Rock1', 0.55, 0.0), ('Rock2', 0.35, 1.6)):
        bpy.ops.mesh.primitive_ico_sphere_add(radius=r, location=(dx, 0, r*0.55), subdivisions=1)
        o = bpy.context.active_object
        o.name = name
        for v in o.data.vertices:
            v.co.x *= (1 + ((v.index * 37 % 10) - 5) * 0.04)
            v.co.y *= (1 + ((v.index * 17 % 10) - 5) * 0.04)
            v.co.z *= 0.72
        bpy.ops.object.shade_flat()
        o.data.materials.append(M['rock'])
        place(o, x0); x0 += 2.4

    export(root, 'props.glb')

# ============================================================
build_mats()
build_soldier()
for k in ('ar', 'sg', 'sr', 'pg'):
    build_fp(k)
build_props()
print('ALL DONE')
