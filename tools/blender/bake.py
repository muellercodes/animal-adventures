# Step 3 (Blender, Cycles): bake the sculpt onto the game mesh's UV layout. Bakes the high-detail surface position
# and normal (object space) at 2x the texture size and ambient occlusion at the texture size. The textures themselves
# are made from these in texture.py. Writes work/<id>-bake.npz.
# Usage: <blender python> tools/blender/bake.py pig [texture size, default 1024]
import importlib, os, sys, time
import numpy as np
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import meshutil as MU

SP = sys.argv[1] if len(sys.argv) > 1 else 'pig'
TEX = int(sys.argv[2]) if len(sys.argv) > 2 else 1024
S = importlib.import_module(SP)
# cage extrusion and ray length for the bake, and the occlusion distance (meters): species can scale them to their size
CAGE, RAY = getattr(S, 'BAKE_CAGE', (0.012, 0.03))
AO_DIST = getattr(S, 'AO_DIST', 0.12)
WORK = os.path.join(HERE, 'work')
t0 = time.time()

bpy.ops.wm.read_factory_settings(use_empty=True)
if hasattr(S, 'make_bake'):
    # a species with an exact surface (no sculpt) writes work/<id>-bake.npz itself
    S.make_bake(WORK, TEX)
    sys.exit(print(f'saved {SP}-bake.npz ({time.time() - t0:.0f}s)'))
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.use_denoising = False
hi = np.load(os.path.join(WORK, f'{SP}-hi.npz'))
lo = np.load(os.path.join(WORK, f'{SP}-lo.npz'))

# bounds for encoding positions into 0..1
allv = np.concatenate([hi['bv'], hi['tv']] + ([hi['pv']] if len(hi['pv']) else []))
PLO, PHI = allv.min(0) - 0.01, allv.max(0) + 0.01

# ---------- high detail sources: body, fine patches, tail ----------
src = []
for vk, fk in (('bv', 'bf'), ('pv', 'pf'), ('tv', 'tf')):
    if not len(hi[fk]):
        continue
    ob = bpy.data.objects.new('hi_' + vk, MU.mesh('hi_' + vk, hi[vk], hi[fk]))
    sc.collection.objects.link(ob)
    src.append(ob)
# emission = encoded position (only used by the EMIT bake)
mh = bpy.data.materials.new('hi'); mh.use_nodes = True
nt = mh.node_tree; nt.nodes.clear()
geo = nt.nodes.new('ShaderNodeNewGeometry')
sub = nt.nodes.new('ShaderNodeVectorMath'); sub.operation = 'SUBTRACT'; sub.inputs[1].default_value = tuple(PLO)
div = nt.nodes.new('ShaderNodeVectorMath'); div.operation = 'DIVIDE'; div.inputs[1].default_value = tuple(PHI - PLO)
em = nt.nodes.new('ShaderNodeEmission')
out = nt.nodes.new('ShaderNodeOutputMaterial')
nt.links.new(geo.outputs['Position'], sub.inputs[0]); nt.links.new(sub.outputs[0], div.inputs[0])
nt.links.new(div.outputs[0], em.inputs['Color']); nt.links.new(em.outputs[0], out.inputs['Surface'])
for ob in src:
    ob.data.materials.append(mh)

# ---------- bake target: the half mesh with the packed UVs ----------
Vh, Fh, UVf = lo['half_v'], lo['half_f'], lo['half_uv']
tgt = bpy.data.objects.new('lo', MU.mesh('lo', Vh, Fh))
sc.collection.objects.link(tgt)
uvl = tgt.data.uv_layers.new(name='UVMap')
uvl.data.foreach_set('uv', UVf.reshape(-1, 2).ravel())
mt = bpy.data.materials.new('lo'); mt.use_nodes = True
tn = mt.node_tree.nodes['Principled BSDF']
img_node = mt.node_tree.nodes.new('ShaderNodeTexImage')
mt.node_tree.nodes.active = img_node
tgt.data.materials.append(mt)


def bake(kind, size, samples, **kw):
    img = bpy.data.images.new(kind, size, size, alpha=True, float_buffer=True)
    img.colorspace_settings.name = 'Non-Color'
    img.generated_color = (0, 0, 0, 0)
    img_node.image = img
    sc.cycles.samples = samples
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in src:
        o.select_set(True)
    tgt.select_set(True)
    bpy.context.view_layer.objects.active = tgt
    t = time.time()
    bpy.ops.object.bake(type=kind, use_selected_to_active=True, cage_extrusion=CAGE, max_ray_distance=RAY, margin=0, use_clear=True, **kw)
    a = np.empty(size * size * 4, np.float32)
    img.pixels.foreach_get(a)
    print(f'baked {kind} {size} in {time.time() - t:.0f}s')
    return a.reshape(size, size, 4)


R2 = TEX * 2
nrm = bake('NORMAL', R2, 1, normal_space='OBJECT', normal_r='POS_X', normal_g='POS_Y', normal_b='POS_Z')
pos = bake('EMIT', R2, 1)
sc.world = bpy.data.worlds.new('w')
sc.world.light_settings.distance = AO_DIST
ao = bake('AO', TEX, 48)
np.savez_compressed(os.path.join(WORK, f'{SP}-bake.npz'), nrm=nrm, pos=pos, ao=ao, plo=PLO, phi=PHI)
print(f'saved {SP}-bake.npz ({time.time() - t0:.0f}s)')
