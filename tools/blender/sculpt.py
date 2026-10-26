# Step 1: sculpt the high-detail body. Evaluates the species' signed distance field on a voxel grid (the +x half,
# mirrored), meshes it with marching cubes and adds the tail tube. Writes work/<id>-hi.npz.
# Usage: <blender python> tools/blender/sculpt.py pig [voxel size in m, default 0.002]
import importlib, os, sys, time
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sdf import mesh_half, mesh_box, crop, mirror, F

SP = sys.argv[1] if len(sys.argv) > 1 else 'pig'
H = float(sys.argv[2]) if len(sys.argv) > 2 else 0.002
S = importlib.import_module(SP)
WORK = os.path.join(HERE, 'work')
os.makedirs(WORK, exist_ok=True)


def tube(pts, rad, segs, cap=True):
    """tube mesh along a polyline (parallel transport frames), closed at the tip"""
    n = len(pts)
    T = np.gradient(pts, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    Nv = np.cross(T[0], [1, 0, 0] if abs(T[0][0]) < 0.9 else [0, 1, 0]); Nv /= np.linalg.norm(Nv)
    V, Fc = [], []
    for i in range(n):
        Nv = Nv - T[i] * np.dot(Nv, T[i]); Nv /= np.linalg.norm(Nv)
        B = np.cross(T[i], Nv)
        for j in range(segs):
            a = 2 * np.pi * j / segs
            V.append(pts[i] + (Nv * np.cos(a) + B * np.sin(a)) * rad[i])
    for i in range(n - 1):
        for j in range(segs):
            a, b = i * segs + j, i * segs + (j + 1) % segs
            Fc += [[a, b, a + segs], [b, b + segs, a + segs]]
    if cap:
        V.append(pts[-1] + T[-1] * rad[-1] * 0.9)
        t = len(V) - 1
        for j in range(segs):
            Fc.append([(n - 1) * segs + j, (n - 1) * segs + (j + 1) % segs, t])
    return np.array(V, F), np.array(Fc, np.int64)


if __name__ == '__main__':
    t0 = time.time()
    if hasattr(S, 'make_game_mesh'):
        sys.exit(print(f'{SP}: no sculpt (the species builds its game mesh and surface directly)'))
    lo, hi = S.BOUNDS
    if getattr(S, 'PIECES', None):
        # separate closed pieces meshed one by one, so they overlap without merging (a turtle's rigid shell and the
        # soft body that slides in and out of it)
        vs, fs, o = [], [], 0
        for fn in S.PIECES:
            a, b = mesh_half(fn, lo, hi, H)
            vs.append(a); fs.append(b + o); o += len(a)
        v, f = np.concatenate(vs), np.concatenate(fs)
    else:
        v, f = mesh_half(S.shape, lo, hi, H)
    print(f'body: {len(v)} verts {len(f)} tris in {time.time() - t0:.1f}s')
    # bake-only detail patches: fine meshes over small features, replacing the coarse triangles in their core
    # (v, f stay whole for the game mesh; bv, bf is the bake copy with the patch cores cut out)
    bv, bf = v, f
    pv, pf = [], []
    for lo_p, hi_p, hp in getattr(S, 'PATCHES', []):
        t1 = time.time()
        a, b = mesh_box(S.shape, lo_p, hi_p, hp)
        m = 3 * hp
        lo_k = lo_p + m
        if lo_p[0] <= 0:
            lo_k[0] = 0.0   # the patch meets its mirror image on the x = 0 grid plane
        a, b = crop(a, b, lo_k, hi_p - m)
        core_lo, core_hi = lo_p + 4 * H, hi_p - 4 * H
        if lo_p[0] <= 0:
            core_lo = core_lo.copy(); core_lo[0] = -1
        for sg in (1, -1):
            lo_c, hi_c = core_lo.copy(), core_hi.copy()
            if sg < 0:
                lo_c[0], hi_c[0] = -core_hi[0], -core_lo[0]
            bv, bf = crop(bv, bf, lo_c, hi_c, inside=False)
        pv.append(a); pf.append(b)
        print(f'patch {lo_p} {len(b)} tris in {time.time() - t1:.1f}s')
    if pv:
        o = 0; PV, PF = [], []
        for a, b in zip(pv, pf):
            a2, b2 = mirror(a, b)
            PV.append(a2); PF.append(b2 + o); o += len(a2)
        pv, pf = np.concatenate(PV), np.concatenate(PF)
    else:
        pv, pf = np.zeros((0, 3), F), np.zeros((0, 3), np.int64)
    if getattr(S, 'TAIL_RINGS', 0):
        tp, tr = S.tail_curve(60)
        tv, tf = tube(tp, tr, 16)
    else:
        # no tail tube: the species has its tail in the field (or no tail, like the frog)
        tv, tf = np.zeros((0, 3), F), np.zeros((0, 3), np.int64)
    np.savez_compressed(os.path.join(WORK, f'{SP}-hi.npz'), v=v, f=f, bv=bv, bf=bf, pv=pv, pf=pf, tv=tv, tf=tf, h=H)
    print('saved', os.path.join(WORK, f'{SP}-hi.npz'))
