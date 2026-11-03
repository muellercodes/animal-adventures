# Big cats on the cat template (round 10): a species laid out in the house cat's units (cat.py, with BREED overrides
# for its own tables, as the other cats do) and scaled by KS on the way out, so all of cat.py's shapes, masks, weights,
# coat strokes and kitten offsets work unchanged at any size (the cockatiel does the same with the macaw).
#   C = bigcat.load(dict(ID='snowleopard', TAIL=...))     cat.py run in its own module C with those overrides
#   ...replace C's functions in cat units (C.paint = paint, C.head = head); inside them call hooks as C.x
#   bigcat.install(globals(), C, KS)                       the pipeline hooks, in game meters (points / KS in, * KS out)
# The game's skeleton for the species is the cat's scaled by KS too (SPEC.<id> in 40_animals.js), with any bones the
# breed moves (its own tail) moved the same way in both places.
import os, types
import numpy as np
from sdf import V, F

HERE = os.path.dirname(os.path.abspath(__file__))


def load(breed):
    C = types.ModuleType('cat_' + breed.get('ID', 'x'))
    C.__dict__['BREED'] = breed
    C.__dict__['__file__'] = os.path.join(HERE, 'cat.py')
    exec(compile(open(os.path.join(HERE, 'cat.py')).read(), 'cat.py', 'exec'), C.__dict__)
    return C


def install(g, C, KS):
    sc = lambda c: {k: v / KS for k, v in c.items()}
    g['C'], g['KS'] = C, KS
    g['BOUNDS'] = (C.BOUNDS[0] * KS, C.BOUNDS[1] * KS)
    g['PATCHES'] = [(a * KS, b * KS, h * KS) for a, b, h in C.PATCHES]
    g['BAKE_DIST'] = tuple(v * KS for v in C.BAKE_DIST)
    g['DISSOLVE_DEGENERATE'] = True
    g['TAIL_RINGS'] = 0
    g['PREVIEW'] = {k: (tuple(np.array(p) * KS), tuple(np.array(t) * KS), f) for k, (p, t, f) in C.PREVIEW.items()}
    for k in ('UV_AVERAGE', 'UV_PACK', 'WEIGHT_SMOOTH', 'MAP_QUALITY', 'PAD_SMOOTH', 'BABY_TEX', 'HAIR'):
        if hasattr(C, k):
            g[k] = getattr(C, k)
    g['FUR'] = dict(C.FUR, len=C.FUR['len'] * KS, tile=C.FUR['tile'] * KS)
    g['shape'] = lambda P: C.shape(P / KS) * KS
    g['parts'] = lambda P: {k: v * KS for k, v in C.parts(P / KS).items()}

    def grid(h):
        xs, ys, zs = C.grid(h / KS)
        return xs * KS, ys * KS, zs * KS
    g['grid'] = grid
    g['keep'] = lambda P: C.keep(P / KS)
    g['uv_regions'] = lambda P: C.uv_regions(P / KS)
    g['uv_weight'] = lambda P: C.uv_weight(P / KS)
    g['bone_tips'] = lambda P: {k: v * KS for k, v in C.bone_tips({k: v / KS for k, v in P.items()}).items()}
    g['fix_weights'] = lambda W, wpos, names, G, weld: C.fix_weights(W, (wpos / KS).astype(F), names, G, weld)

    def lowpoly_fix(bm, hi):
        # cat.py's rings in cat units: scale what it hands to meshfix
        import meshfix as MX
        rings0, finish0 = MX.rings, MX.finish
        MX.rings = lambda bm_, tr, a, b, pitch, ok: rings0(bm_, tr, np.asarray(a, F) * KS, np.asarray(b, F) * KS, pitch * KS,
                                                            lambda c, p0, r: ok(c / KS, p0 / KS, r / KS))
        MX.finish = lambda bm_, area=2e-7: finish0(bm_, area * KS * KS)
        try:
            C.lowpoly_fix(bm, hi)
        finally:
            MX.rings, MX.finish = rings0, finish0
    g['lowpoly_fix'] = lowpoly_fix
    g['flow'] = lambda P, N=None: C.flow(P / KS, N)
    g['paint'] = lambda P, N, c: C.paint(P / KS, N, sc(c))
    g['baby_paint'] = lambda P, N, c, col: C.baby_paint(P / KS, N, sc(c), col)
    g['detail'] = lambda P, N, c: C.detail(P / KS, N, sc(c)) * KS
    g['finish'] = C.finish

    def fur(P, N, c):
        ln, de = C.fur(P / KS, N, sc(c))
        return (ln * KS).astype(F), de
    g['fur'] = fur
    g['stats'] = lambda P, N, c, col: C.stats(P / KS, N, sc(c), col)

    def meta(st):
        m = C.meta(st)
        e = m['eye']
        e['p'] = [round(v * KS, 5) for v in e['p']]
        e['r'] = round(e['r'] * KS, 5)
        m['mouth'] = [round(v * KS, 4) for v in m['mouth']]
        if 'belly' in m:
            m['belly'] = [round(v * KS, 4) for v in m['belly']]
        if 'maxR' in m.get('collar', {}):
            m['collar']['maxR'] = m['collar']['maxR'] * KS
        return m
    g['meta'] = meta
    g['baby_offset'] = lambda P, N, c: (C.baby_offset(P / KS, N, sc(c)) * KS).astype(F)
    if getattr(C, 'cards', None):
        def cards():
            out = C.cards()
            for cd in out:
                cd['pts'] = cd['pts'] * KS
                cd['w'] = cd['w'] * KS
                if cd.get('baby') is not None:
                    cd['baby'] = cd['baby'] * KS
            return out
        g['cards'] = cards
        g['hair_texture'] = C.hair_texture
