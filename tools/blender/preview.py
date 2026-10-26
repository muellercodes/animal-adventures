# Quick Cycles renders of the sculpted high-detail body (shape review while iterating on the sculpt).
# Usage: <blender python> tools/blender/preview.py pig [out dir] [view,view,...]
import os, sys, math
import numpy as np
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SP = sys.argv[1] if len(sys.argv) > 1 else 'pig'
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'work', 'preview')
VIEWS = {
    'side': ((2.6, 0.5, 0.08), (0, 0.38, 0.08), 30),
    'front3q': ((1.5, 0.75, 1.75), (0, 0.38, 0.1), 30),
    'front': ((0.0, 0.5, 2.6), (0, 0.38, 0.0), 26),
    'rear3q': ((-1.4, 0.9, -1.8), (0, 0.38, -0.1), 30),
    'top': ((0.01, 2.8, 0.0), (0, 0.4, 0.05), 30),
    'face': ((0.42, 0.6, 1.25), (0, 0.48, 0.6), 22),
    'faceside': ((0.75, 0.55, 0.62), (0.0, 0.5, 0.6), 22),
    'feet': ((0.55, 0.12, 0.6), (0.12, 0.05, 0.1), 30),
    'ears3q': ((0.9, 0.85, 1.2), (0.0, 0.6, 0.5), 22),
    'earsback': ((0.7, 0.9, -0.2), (0.0, 0.62, 0.5), 22),
    'eye': ((0.3, 0.57, 0.68), (0.0815, 0.548, 0.565), 12),
    'mouth': ((0.45, 0.33, 0.85), (0.04, 0.39, 0.68), 18),
}
want = sys.argv[3].split(',') if len(sys.argv) > 3 else ['side', 'front3q', 'front', 'rear3q', 'face', 'feet']
os.makedirs(OUT, exist_ok=True)


def gl(p):  # game (x, y up, z forward) -> blender (x, -z, y up)
    return Vector((p[0], -p[2], p[1]))


bpy.ops.wm.read_factory_settings(use_empty=True)
d = np.load(os.path.join(HERE, 'work', f'{SP}-hi.npz'))
objs = []
for vk, fk in (('bv', 'bf'), ('pv', 'pf'), ('tv', 'tf')):
    v, f = d[vk], d[fk]
    if not len(f): continue
    me = bpy.data.meshes.new(vk)
    vb = np.stack([v[:, 0], -v[:, 2], v[:, 1]], 1)
    me.vertices.add(len(vb)); me.vertices.foreach_set('co', vb.ravel())
    me.loops.add(f.size); me.loops.foreach_set('vertex_index', f.ravel().astype(np.int32))
    me.polygons.add(len(f)); me.polygons.foreach_set('loop_start', np.arange(0, f.size, 3, dtype=np.int32))
    me.update(); me.validate()
    me.shade_smooth()
    ob = bpy.data.objects.new(vk, me); bpy.context.scene.collection.objects.link(ob); objs.append(ob)
mat = bpy.data.materials.new('skin'); mat.use_nodes = True
b = mat.node_tree.nodes['Principled BSDF']
b.inputs['Base Color'].default_value = (0.86, 0.55, 0.5, 1)
b.inputs['Roughness'].default_value = 0.55
for ob in objs: ob.data.materials.append(mat)
# ground
bpy.ops.mesh.primitive_plane_add(size=8)
g = bpy.context.object
gm = bpy.data.materials.new('g'); gm.use_nodes = True
gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.25, 0.32, 0.18, 1)
g.data.materials.append(gm)
# lights: sun + sky
sc = bpy.context.scene
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.5; sun.angle = 0.05
so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
so.rotation_euler = (math.radians(50), 0, math.radians(35))
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.65, 0.8, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.use_denoising = True
sc.cycles.device = 'CPU'
sc.render.resolution_x, sc.render.resolution_y = 640, 440
sc.view_settings.view_transform = 'Standard'
cam = bpy.data.cameras.new('c'); co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
for name in want:
    p, t, fov = VIEWS[name]
    co.location = gl(p)
    dirv = gl(t) - gl(p)
    co.rotation_euler = dirv.to_track_quat('-Z', 'Y').to_euler()
    cam.angle = math.radians(fov) * 640 / 440
    sc.render.filepath = os.path.join(OUT, f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', name)
