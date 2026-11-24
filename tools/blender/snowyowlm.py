# round 16: a boy snowy owl: the girl's body (snowyowl.py, the same mesh: BASE) with his own plumage, nearly pure white
# with a few small dark spots on the crown, the back and the wings and hardly any on the front; his flight and tail
# feathers white with a few small spots near their tips. His own color map, feather atlas and settings; his owlets
# borrow the girl's baby maps (owlets look alike). The game makes him a little smaller (SEX_LOOK). Run
# tools/blender/coat.py snowyowlm after the snowy owl.
import os
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'snowyowl.py')).read(), 'snowyowl.py', 'exec'))
BASE = 'snowyowl'
ID = 'snowyowlm'
_M = sys.modules[__name__]
# (no baby_paint(): his owlets use the girl's baby maps)


def paint_m(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    n = len(P)
    n1 = fbm(Pm * 40, 3, 11)
    col = _base(Pm, Nm, R, pl, n)
    m = _marks(Pm, Nm, R, pl, 0.7, 0.05, sparse=0.82)
    col = mix(col, K['barLt'], m)
    col *= (0.96 + 0.08 * n1)[:, None]
    col = _bare(col, Pm, Nm, R, n)
    rough = 0.88 + 0.05 * (n1 - 0.5)
    rough = np.where(R['bill'] > 0.5, 0.38, rough)
    rough = np.where(R['claws'] > 0.5, 0.3, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


C.paint = paint_m
_meta_f = C.meta


def meta_m(st):
    m = _meta_f(st)
    m['flat'] = 0xF0EEE8
    return m


C.meta = meta_m
FEATHER_ATLAS = dict(FEATHER_ATLAS, cells=lambda: cells(0.7, spots=True))
