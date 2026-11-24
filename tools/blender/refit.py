# round 16: a new bird refitted from an existing bird file (the cardinal, the blue jay and the hummingbird from
# chickadee.py, the toucan from parrot.py, the snowy owl from owl.py). load() runs the base file in a private module of
# its own (its own globals), so the new species can replace any of its shapes, constants and paints there, in the
# base's units; api() then writes the pipeline's hooks into the new species' module, in game meters: every point goes
# to the base's units as P / KS, with the legs made shorter (or longer) by DROP (base units): the body comes down that
# far between the feet and the knees (y' = y - DROP * sstep(YA, YB, y), the same as songBird in 40_animals.js), and
# lengths come back times KS. The game's spec uses the same numbers (songBird, SPEC.toucan, SPEC.snowyowl).
import os, sys, types
import numpy as np
import bird as B
from sdf import V, F, sstep

HERE = os.path.dirname(os.path.abspath(__file__))


def load(base, name):
    """a private copy of tools/blender/<base>.py: its functions read and write only the copy's globals"""
    path = os.path.join(HERE, base + '.py')
    m = types.ModuleType(name)
    m.__file__ = path
    sys.modules[name] = m
    exec(compile(open(path).read(), path, 'exec'), m.__dict__)
    return m


def api(ns, C, KS, DROP=0.0, YA=0.002, YB=0.022):
    """the pipeline's hooks for a species module (ns: its globals()) made from the base copy C"""
    M = sys.modules[ns['__name__']]

    def yb(y):
        """game-shape y (base units) to the base's y: solve y = yc - DROP * sstep(YA, YB, yc)"""
        if not DROP:
            return y
        yc = y + DROP * sstep(YA, YB, y)
        for _ in range(10):
            yc = y + DROP * sstep(YA, YB, yc)
        return yc

    def fw(P):
        """game meters to the base's units"""
        Q = np.asarray(P, F) / KS
        if DROP:
            Q = Q.copy()
            Q[..., 1] = yb(Q[..., 1])
        return Q.astype(F)

    def bw(Q):
        """the base's units to game meters"""
        P = np.array(Q, F)
        if DROP:
            P[..., 1] = P[..., 1] - DROP * sstep(YA, YB, P[..., 1])
        return (P * KS).astype(F)

    def cs(c):
        return {k: v / KS for k, v in c.items()}

    ns['_fw'], ns['_bw'], ns['_cs'], ns['_C'] = fw, bw, cs, C
    ns['shape'] = lambda P: (C.shape(fw(P)) * KS).astype(F)
    ns['parts'] = lambda P: {k: (v * KS).astype(F) for k, v in C.parts(fw(P)).items()}
    if hasattr(C, 'grid'):
        def grid(h):
            xs, ys, zs = C.grid(h / KS)
            return np.asarray(xs) * KS, bw(np.stack([np.zeros_like(ys), ys, np.zeros_like(ys)], 1))[:, 1], np.asarray(zs) * KS
        ns['grid'] = grid
    ns['keep'] = lambda P: C.keep(fw(P))
    ns['fix_weights'] = lambda W, wpos, names, G, weld: C.fix_weights(W, fw(wpos), names, G, weld)

    def bone_tips(P):
        t = C.bone_tips({k: fw(v) for k, v in P.items()})
        out = {k: bw(v) for k, v in t.items()}
        for k, v in P.items():
            if k not in out:
                out[k] = np.asarray(v, F) + V(0, 0.01 * KS, 0)
        return out
    ns['bone_tips'] = bone_tips
    ns['paint'] = lambda P, N, c: C.paint(fw(P), N, cs(c))
    ns['detail'] = lambda P, N, c: (C.detail(fw(P), N, cs(c)) * KS).astype(F)
    ns['finish'] = C.finish
    if hasattr(C, 'paint_baby'):
        ns['paint_baby'] = lambda P, N, c: C.paint_baby(fw(P), N, cs(c))
        ns['detail_baby'] = lambda P, N, c: (C.detail_baby(fw(P), N, cs(c)) * KS).astype(F)
    if hasattr(C, 'baby_offset'):
        ns['baby_offset'] = lambda P, N, c: (C.baby_offset(fw(P), N, cs(c)) * KS).astype(F)
    if hasattr(C, 'FUR'):
        fur = dict(C.FUR)
        fur['len'] = C.FUR['len'] * KS
        fur['tile'] = C.FUR['tile'] * KS
        ns['FUR'] = fur

        def fur_fn(P, N, c):
            ln, den = C.fur(fw(P), N, cs(c))
            return (ln * KS).astype(F), den
        ns['fur'] = fur_fn
        ns['flow'] = lambda P, N: C.flow(fw(P), N)
    ns['_own'] = C._own
    ns['_flow'] = lambda Pm, Nm, R: C._flow(fw(Pm), Nm, R)
    ns['stats'] = lambda P, N, c, col: C.stats(fw(P), N, cs(c), col)

    def meta(st):
        m = C.meta(st)
        e = m['eye']
        e['p'] = [round(float(v), 5) for v in bw(e['p'])]
        e['r'] = round(e['r'] * KS, 5)
        if 'lash' in e and 'len' in e['lash']:
            e['lash']['len'] *= KS
        m['mouth'] = [round(float(v), 4) for v in bw(m['mouth'])]
        return m
    ns['meta'] = meta
    ns['extra_maps'] = lambda X: B.extra_maps(M, X)
    ns['export_extra'] = lambda meta_, out_dir, work: B.export_extra(M, meta_, out_dir, work)
    lo, hi = C.BOUNDS
    ns['BOUNDS'] = (bw(lo), bw(hi))
    ns['PATCHES'] = [(bw(a), bw(b), h * KS) for a, b, h in getattr(C, 'PATCHES', [])]
    if hasattr(C, 'BAKE_DIST'):
        ns['BAKE_DIST'] = tuple(v * KS for v in C.BAKE_DIST)
    for k in ('TAIL_RINGS', 'DISSOLVE_DEGENERATE', 'UV_PACK', 'WEIGHT_SMOOTH', 'FEATHER_ATLAS', 'MAP_QUALITY', 'BABY_MAPS', 'PAD_SMOOTH'):
        if hasattr(C, k):
            ns[k] = getattr(C, k)
    if hasattr(C, 'PREVIEW'):
        ns['PREVIEW'] = {k: (tuple(np.array(a) * KS), tuple(np.array(b) * KS), f) for k, (a, b, f) in C.PREVIEW.items()}
