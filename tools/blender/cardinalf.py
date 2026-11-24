# round 16: a girl cardinal: the boy's body (cardinal.py, the same mesh: BASE) with her own plumage. Warm tan-brown,
# grayer olive-brown on the back, buff below; red tinges on the crest, the wings and the tail; a smaller, grayer mask
# round the bill; a coral-orange bill. Her own color map, feather atlas and settings; her chicks borrow the boy's baby
# maps (they look alike). Run tools/blender/coat.py cardinalf after the cardinal.
import os
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cardinal.py')).read(), 'cardinal.py', 'exec'))
BASE = 'cardinal'
ID = 'cardinalf'
_M = sys.modules[__name__]
# (no baby_paint(): her chicks use the boy's baby maps)

KF = {
    'red': hexc(0x94765A), 'redHi': hexc(0xA28462), 'redBk': hexc(0x786650), 'redDk': hexc(0x5E5040), 'breast': hexc(0xAA8A66),
    'black': hexc(0x4E4646), 'blackHi': hexc(0x605858), 'bill': hexc(0xEC7A44), 'billDk': hexc(0xCC6030),
    'leg': hexc(0x9C7E72), 'legHi': hexc(0xB89A8C), 'claw': hexc(0x4A3A34), 'lid': hexc(0x4A403C), 'tinge': hexc(0x963A2C),
}


def paint_f(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    n1 = fbm(Pm * 300, 3, 11)
    col = _body(Pm, Nm, R, pl, n, KF)
    # the red tinge on the crest and the crown, a warm wash on the breast
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    col = mix(col, KF['tinge'], hd * sstep(0.081, 0.088, y) * 0.75)
    col = mix(col, KF['tinge'], sstep(-0.1, -0.6, Nm[:, 1]) * sstep(0.03, 0.045, z) * 0.12)
    col *= (0.95 + 0.1 * n1)[:, None]
    m = mask(Pm, Nm, R, 0.7) * 0.8
    col = mix(col, mix(np.tile(KF['black'], (n, 1)), KF['blackHi'], sstep(0.4, 0.9, Nm[:, 1]) * 0.25), m)
    col, bl, lg = _bare(col, Pm, R, KF, n)
    rough = 0.7 + 0.06 * (n1 - 0.5) - 0.05 * sstep(0.1, 0.8, Nm[:, 1]) * feath
    rough = np.where(bl > 0.5, 0.38, rough)
    rough = np.where(lg > 0.5, 0.55, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


C.paint = paint_f
_meta_m = C.meta


def meta_f(st):
    m = _meta_m(st)
    m['flat'] = 0x94765A
    return m


C.meta = meta_f
C.stats = lambda P, N, c, col: {'lidCol': 0x4A403C}


def _cells_f():
    # gray-brown flight feathers edged red, brown coverts with a red wash, a dull red tail and a red-brown crest
    return cells((hexc(0x645040), hexc(0x765646), hexc(0x463828), hexc(0x9A3A2C), hexc(0x362C24)))


FEATHER_ATLAS = dict(FEATHER_ATLAS, cells=_cells_f)
