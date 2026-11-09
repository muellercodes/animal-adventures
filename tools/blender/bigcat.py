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


class LegWarp:
    """longer legs (round 11, the cheetah): a map from the cat's units (as cat.py is laid out) to the species' own,
    which lifts the body by dy and stretches the legs between heights ya and yb to make up for it (blending over w either
    side, so there is no crease). Behind the rump (z below z1, fading out by z0) points are only lifted, so a tail that
    hangs low keeps its round section. x and z do not change. The game moves the bones, lofts and eyes with the same
    map (legWarp in 40_animals.js), so both must keep the same numbers."""
    def __init__(self, ya, yb, dy, w, z0, z1):
        self.ya, self.yb, self.dy, self.w, self.z0, self.z1 = ya, yb, dy, w, z0, z1
        self.s = 1.0 + dy / (yb - ya)

    @staticmethod
    def _ss(a, b, x):
        t = np.clip((x - a) / (b - a), 0.0, 1.0)
        return t * t * (3 - 2 * t)

    @staticmethod
    def _J(y, a, b):
        # the integral of a smooth step from a to b, from below a up to y
        u = np.clip((y - a) / (b - a), 0.0, 1.0)
        return (b - a) * (u ** 3 - 0.5 * u ** 4) + np.maximum(y - b, 0.0)

    def D(self, y):
        w = self.w
        return (self.s - 1) * (self._J(y, self.ya - w, self.ya + w) - self._J(y, self.yb - w, self.yb + w))

    def B(self, y):
        w = self.w
        return self._ss(self.ya - w, self.ya + w, y) - self._ss(self.yb - w, self.yb + w, y)

    def Z(self, z):
        return self._ss(self.z0, self.z1, z)

    def fwd(self, P):
        """cat units to the species' units"""
        P = np.asarray(P, F)
        Q = P.copy()
        Z = self.Z(P[..., 2])
        Q[..., 1] = P[..., 1] + Z * self.D(P[..., 1]) + self.dy * (1 - Z)
        return Q

    def inv(self, P):
        """the species' units back to the cat's (a few Newton steps: the map only ever stretches)"""
        P = np.asarray(P, F)
        Z = self.Z(P[..., 2])
        c = P[..., 1] - self.dy * (1 - Z)
        y = c - Z * self.D(c) * (1.0 / self.s)
        for _ in range(8):
            y = y - (y + Z * self.D(y) - c) / (1 + Z * (self.s - 1) * self.B(y))
        Q = P.copy()
        Q[..., 1] = y
        return Q.astype(F)


def load(breed):
    C = types.ModuleType('cat_' + breed.get('ID', 'x'))
    C.__dict__['BREED'] = breed
    C.__dict__['__file__'] = os.path.join(HERE, 'cat.py')
    exec(compile(open(os.path.join(HERE, 'cat.py')).read(), 'cat.py', 'exec'), C.__dict__)
    return C


def install(g, C, KS, warp=None):
    """the pipeline hooks in game meters; warp (a LegWarp) maps the cat's units to the species' own on the way out"""
    sc = lambda c: {k: v / KS for k, v in c.items()}
    if warp is None:
        pin = lambda P: P / KS
        pout = lambda Q: Q * KS
    else:
        pin = lambda P: warp.inv(np.asarray(P, F) / KS)
        pout = lambda Q: warp.fwd(np.asarray(Q, F)) * KS
    g['C'], g['KS'], g['WARP'] = C, KS, warp
    g['BOUNDS'] = (C.BOUNDS[0] * KS, C.BOUNDS[1] * KS) if warp is None else (C.BOUNDS[0] * KS, (C.BOUNDS[1] + V(0, warp.dy, 0)) * KS)
    g['PATCHES'] = [(pout(a), pout(b), h * KS) for a, b, h in C.PATCHES]
    g['BAKE_DIST'] = tuple(v * KS for v in C.BAKE_DIST)
    g['DISSOLVE_DEGENERATE'] = True
    g['TAIL_RINGS'] = 0
    if warp is None:
        g['PREVIEW'] = {k: (tuple(np.array(p) * KS), tuple(np.array(t) * KS), f) for k, (p, t, f) in C.PREVIEW.items()}
    else:
        g['PREVIEW'] = {k: (tuple(pout(np.array(p, F))), tuple(pout(np.array(t, F))), f) for k, (p, t, f) in C.PREVIEW.items()}
    for k in ('UV_AVERAGE', 'UV_PACK', 'WEIGHT_SMOOTH', 'MAP_QUALITY', 'PAD_SMOOTH', 'BABY_TEX', 'HAIR'):
        if hasattr(C, k):
            g[k] = getattr(C, k)
    g['FUR'] = dict(C.FUR, len=C.FUR['len'] * KS, tile=C.FUR['tile'] * KS)
    g['shape'] = lambda P: C.shape(pin(P)) * KS
    g['parts'] = lambda P: {k: v * KS for k, v in C.parts(pin(P)).items()}

    def grid(h):
        xs, ys, zs = C.grid(h / KS)
        if warp is not None:
            # even steps in height over the lifted body (the stretched legs would get coarser steps otherwise)
            from sdf import axis_steps
            ys = np.asarray(axis_steps(g['BOUNDS'][0][1] / KS, g['BOUNDS'][1][1] / KS, [], h / KS), F)
        return xs * KS, ys * KS, zs * KS
    g['grid'] = grid
    g['keep'] = lambda P: C.keep(pin(P))
    g['uv_regions'] = lambda P: C.uv_regions(pin(P))
    g['uv_weight'] = lambda P: C.uv_weight(pin(P))
    if warp is None:
        g['bone_tips'] = lambda P: {k: v * KS for k, v in C.bone_tips({k: v / KS for k, v in P.items()}).items()}
    else:
        g['bone_tips'] = lambda P: {k: pout(v) for k, v in C.bone_tips({k: pin(np.asarray(v, F)[None])[0] for k, v in P.items()}).items()}
    g['fix_weights'] = lambda W, wpos, names, G, weld: C.fix_weights(W, np.asarray(pin(wpos), F), names, G, weld)

    def lowpoly_fix(bm, hi):
        # cat.py's rings in cat units: scale what it hands to meshfix
        import meshfix as MX
        rings0, finish0 = MX.rings, MX.finish
        if warp is None:
            MX.rings = lambda bm_, tr, a, b, pitch, ok: rings0(bm_, tr, np.asarray(a, F) * KS, np.asarray(b, F) * KS, pitch * KS,
                                                                lambda c, p0, r: ok(c / KS, p0 / KS, r / KS))
        else:
            from mathutils import Vector
            vin = lambda c: Vector([float(v) for v in pin(np.array([tuple(c)], F))[0]])
            MX.rings = lambda bm_, tr, a, b, pitch, ok: rings0(bm_, tr, pout(a), pout(b), pitch * KS,
                                                                lambda c, p0, r: ok(vin(c), vin(p0), r / KS))
        MX.finish = lambda bm_, area=2e-7: finish0(bm_, area * KS * KS)
        try:
            C.lowpoly_fix(bm, hi)
        finally:
            MX.rings, MX.finish = rings0, finish0
    g['lowpoly_fix'] = lowpoly_fix
    g['flow'] = lambda P, N=None: C.flow(pin(P), N)
    g['paint'] = lambda P, N, c: C.paint(pin(P), N, sc(c))
    g['baby_paint'] = lambda P, N, c, col: C.baby_paint(pin(P), N, sc(c), col)
    g['detail'] = lambda P, N, c: C.detail(pin(P), N, sc(c)) * KS
    g['finish'] = C.finish

    def fur(P, N, c):
        ln, de = C.fur(pin(P), N, sc(c))
        return (ln * KS).astype(F), de
    g['fur'] = fur
    g['stats'] = lambda P, N, c, col: C.stats(pin(P), N, sc(c), col)

    def meta(st):
        m = C.meta(st)
        e = m['eye']
        if warp is None:
            e['p'] = [round(v * KS, 5) for v in e['p']]
            e['r'] = round(e['r'] * KS, 5)
            m['mouth'] = [round(v * KS, 4) for v in m['mouth']]
            if 'belly' in m:
                m['belly'] = [round(v * KS, 4) for v in m['belly']]
        else:
            e['p'] = [round(float(v), 5) for v in pout(np.array(e['p'], F))]
            e['r'] = round(e['r'] * KS, 5)
            m['mouth'] = [round(float(v), 4) for v in pout(np.array(m['mouth'], F))]
            if 'belly' in m:
                m['belly'] = [round(float(v), 4) for v in pout(np.array(m['belly'], F))]
        if 'maxR' in m.get('collar', {}):
            m['collar']['maxR'] = m['collar']['maxR'] * KS
        return m
    g['meta'] = meta
    if warp is None:
        g['baby_offset'] = lambda P, N, c: (C.baby_offset(P / KS, N, sc(c)) * KS).astype(F)
    else:
        def baby_offset(P, N, c):
            Q = pin(P)
            return (pout(Q + C.baby_offset(Q, N, sc(c))) - pout(Q)).astype(F)
        g['baby_offset'] = baby_offset
    if getattr(C, 'cards', None):
        def cards():
            out = C.cards()
            for cd in out:
                cd['pts'] = pout(cd['pts'])
                cd['w'] = cd['w'] * KS
                if cd.get('baby') is not None:
                    cd['baby'] = pout(cd['baby'])
            return out
        g['cards'] = cards
        g['hair_texture'] = C.hair_texture
