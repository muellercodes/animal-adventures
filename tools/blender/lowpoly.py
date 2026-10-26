# Step 2 (Blender): the game mesh. Decimates the sculpt to the game budget, keeps the +x half and unwraps it (the -x
# half mirrors it in the game, so both sides share texels), adds a low tail tube with its own UV island, packs the
# UVs, and computes skin weights for the game skeleton. Writes work/<id>-lo.npz.
# Usage: <blender python> tools/blender/lowpoly.py pig [triangles, default 6000] [weights: heat | transfer]
import importlib, json, os, sys, time
import numpy as np
import bpy, bmesh

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import meshutil as MU

SP = sys.argv[1] if len(sys.argv) > 1 else 'pig'
TRIS = int(sys.argv[2]) if len(sys.argv) > 2 else 6000
WMODE = sys.argv[3] if len(sys.argv) > 3 else 'heat'
S = importlib.import_module(SP)
WORK = os.path.join(HERE, 'work')
RIG = json.load(open(os.path.join(WORK, f'{SP}-rig.json')))['adult']
t0 = time.time()

bpy.ops.wm.read_factory_settings(use_empty=True)
hi = np.load(os.path.join(WORK, f'{SP}-hi.npz'))


def obj(name, v, f):
    ob = bpy.data.objects.new(name, MU.mesh(name, v, f))
    bpy.context.scene.collection.objects.link(ob)
    return ob


def activate(ob):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)


# ---------- decimate (symmetric), keep the +x half ----------
body = obj('body', hi['v'], hi['f'])
NTR = getattr(S, 'TAIL_RINGS', 0)    # 0: no separate tail tube (the tail is part of the sculpt)
tail_tris = 2 * 8 * (NTR - 1) + 8 if NTR else 0
mod = body.modifiers.new('dec', 'DECIMATE')
mod.ratio = (TRIS - tail_tris) / len(hi['f'])
mod.use_symmetry = True
mod.symmetry_axis = 'X'
# keep more triangles on small features (species keep(): 1 = keep); the collapse cost grows where the group is low
if hasattr(S, 'keep'):
    vg = body.vertex_groups.new(name='keep')
    kw = S.keep(hi['v'])
    for val in np.unique(np.round(kw, 2)):
        ids = np.where(np.round(kw, 2) == val)[0]
        vg.add(ids.tolist(), float(val), 'REPLACE')
    mod.vertex_group = 'keep'
    mod.invert_vertex_group = True
    mod.vertex_group_factor = 12.0
dg = bpy.context.evaluated_depsgraph_get()
me = bpy.data.meshes.new_from_object(body.evaluated_get(dg))
body.modifiers.clear()
body.data = me
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(1, 0, 0), clear_inner=True)
for v in bm.verts:
    if abs(v.co.x) < 1e-5:
        v.co.x = 0.0
bmesh.ops.triangulate(bm, faces=bm.faces[:])
# species fix-ups on the decimated half before unwrapping (extra edge loops where it has to bend, ...)
if hasattr(S, 'lowpoly_fix'):
    S.lowpoly_fix(bm, hi)
bm.to_mesh(me); bm.free()
print(f'decimated half: {len(me.polygons)} tris ({time.time() - t0:.0f}s)')

# ---------- UVs: smart project the half body ----------
activate(body)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
if hasattr(S, 'unwrap'):
    S.unwrap(body)      # the species' own islands (edit mode, everything selected)
else:
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004, area_weight=0.0, scale_to_bounds=False)
bpy.ops.object.mode_set(mode='OBJECT')

# ---------- tail: low tube with a cylinder unwrap ----------
nt = 0
if NTR:
    tp, tr = S.tail_curve(NTR - 1)
    tv, tf, tuv = MU.tube_uv(tp, tr, 8)
    nt = len(tf)
    tail = obj('tail', tv, tf)
    uvl = tail.data.uv_layers.new(name='UVMap')
    uvl.data.foreach_set('uv', tuv[tf.ravel()].ravel())
    # one object, one UV layout
    activate(body); tail.select_set(True)
    bpy.ops.object.join()
lo = bpy.context.view_layer.objects.active
lo.name = 'lo'
bpy.context.scene.tool_settings.use_uv_select_sync = True
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.pack_islands(rotate=True, margin=0.0045, **getattr(S, 'UV_PACK', {}))
bpy.ops.object.mode_set(mode='OBJECT')

# read back: positions, triangles, per-corner uvs; tail faces are the last ones
m = lo.data
V = np.empty(len(m.vertices) * 3, np.float32); m.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
L = np.empty(len(m.loops), np.int32); m.loops.foreach_get('vertex_index', L)
UV = np.empty(len(m.loops) * 2, np.float32); m.uv_layers.active.data.foreach_get('uv', UV); UV = UV.reshape(-1, 2)
Fh = L.reshape(-1, 3)
# stretch the packed layout to fill the square (packing leaves a strip unused)
a, b = UV.min(0), UV.max(0)
UV = 0.002 + (UV - a) / (b - a) * 0.996
UVf = UV.reshape(-1, 3, 2)
is_tail = np.zeros(len(Fh), bool)
if nt:
    is_tail[-nt:] = True
print(f'uv packed: {len(Fh)} tris, {len(V)} verts ({time.time() - t0:.0f}s)')

# ---------- full mesh for the game (mirror the half, add the tail) ----------
G = MU.game_mesh(V, Fh, UVf, is_tail)
print(f'game mesh: {len(G["pos"])} verts {len(G["idx"]) // 3} tris')

# ---------- skin weights on the welded full mesh ----------
W = MU.weights(G, RIG, WMODE, S)
G.update(W)
np.savez_compressed(os.path.join(WORK, f'{SP}-lo.npz'), half_v=V, half_f=Fh, half_uv=UVf, half_tail=is_tail, **G)
print(f'saved {SP}-lo.npz ({time.time() - t0:.0f}s)')
