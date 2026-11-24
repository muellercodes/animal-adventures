# round 16: northern cardinal (the boy), on the chickadee's bird body 1.6 times as big (refit.py: chickadee.py runs in a
# private copy, C; the shapes and paints here are in the chickadee's units, the game's SPEC.cardinal uses the same
# numbers through songBird). His own: a thick cone-shaped bill, a pointed crest on the crown (the game's crest blades
# stand on it), a slightly smaller eye. Bright red all over, duller on the back and wings, with a black mask round the
# bill and down the chin; a red-orange bill, dull pinkish legs. The chick: brownish down, a dark bill, the yellow gape.
# The girl is cardinalf.py (her own colors on this mesh). Feather atlas: red flight feathers, coverts, tail and crest.
# Make it with: VOXEL=0.0008 TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py cardinal
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, fbm, length
import bird as B
from bird import mirror, groove, hexc, mix
import refit

ID = 'cardinal'
KS = 1.6
_M = sys.modules[__name__]
C = refit.load('chickadee', ID + '_base')

# ---------- shape (chickadee units) ----------
C.EYE_R = 0.0023
C.LID_R = 0.00185
C.MOUTH = V(0.0, 0.0699, 0.0572)
C.GAPE = V(0.0047, 0.0694, 0.0466)
UPPER = ([V(0, 0.0724, 0.0455), V(0, 0.0722, 0.0492), V(0, 0.0716, 0.0527), V(0, 0.0707, 0.0556), V(0, 0.0699, 0.0577), V(0, 0.0694, 0.0589)],
         [0.0043, 0.0037, 0.0028, 0.0018, 0.0009, 0.0003])
LOWER = ([V(0, 0.0688, 0.0462), V(0, 0.0688, 0.0505), V(0, 0.069, 0.0542), V(0, 0.0693, 0.0566)], [0.0036, 0.0029, 0.0018, 0.0007])


def beak(P):
    """a thick cone-shaped seed-eater's bill, the lower mandible nearly as deep as the upper"""
    Q = mirror(P)
    S = V(1 / 0.92, 1, 1)
    up = chain(Q * S, [p * S for p in UPPER[0]], UPPER[1], 0.0006) * 0.92
    lo = chain(Q * S, [p * S for p in LOWER[0]], LOWER[1], 0.0006) * 0.92
    d = smin(up, lo, 0.0004)
    y, z = Q[:, 1], Q[:, 2]
    # the cutting edge between the mandibles, curving down a little to the tip
    d = d + groove(y - 0.0699 + 0.03 * (z - 0.047), 0.00014, 0.0002) * sstep(0.0466, 0.0485, z) * sstep(0.058, 0.0565, z)
    return d


_head0 = C.head


def head(P):
    """the chickadee's round head with a pointed crest rising from the crown and swept back"""
    d = _head0(P)
    Q = mirror(P)
    cr = chain(Q, [V(0, 0.0838, 0.041), V(0, 0.0872, 0.0335), V(0, 0.0905, 0.026), V(0, 0.0918, 0.0215)], [0.0068, 0.0056, 0.0036, 0.0016], 0.002)
    return smin(d, cr, 0.004)


C.beak, C.head = beak, head
C.HEAD_BOX = (V(-0.018, 0.058, 0.014), V(0.018, 0.095, 0.066))
C.BOUNDS = (V(-0.085, -0.0005, -0.048), V(0.085, 0.096, 0.066))

# ---------- plumage (chickadee units) ----------
K = {
    'red': hexc(0xA8101C), 'redHi': hexc(0xBE1824), 'redBk': hexc(0x84161C), 'redDk': hexc(0x6A1014), 'breast': hexc(0xB8121E),
    'black': hexc(0x121010), 'blackHi': hexc(0x2A2424), 'bill': hexc(0xE45A34), 'billDk': hexc(0xC04428),
    'leg': hexc(0x9C7A6E), 'legHi': hexc(0xB8988A), 'claw': hexc(0x4A3A34), 'lid': hexc(0x241A1A),
}


def mask(Pm, Nm, R, k=1.0):
    """the black face mask: everything in front of a line from over the bill back to the front of the eye and down the
    throat (seen from the side), narrowing to the bib at the bottom; k > 1 makes it reach a little farther"""
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    ze = np.interp(y, [0.054, 0.058, 0.062, 0.066, 0.07, 0.0735, 0.0765, 0.0785], [0.047, 0.04, 0.0365, 0.0375, 0.0405, 0.0435, 0.0472, 0.052]).astype(F)
    wd = np.interp(y, [0.054, 0.058, 0.062, 0.066, 0.07], [0.0, 0.0055, 0.009, 0.013, 0.03]).astype(F) * k
    nz = 0.0009 * (fbm(Pm * 1100, 2, 52) - 0.5)
    on = sstep(ze - 0.0006 * k, ze + 0.0004, z + nz) * sstep(wd + 0.0008, wd - 0.0008, x + nz) * sstep(0.0779 - 0.08 * x, 0.0769 - 0.08 * x, y)
    return on * np.clip(R['head'] + R['neck'] + R['trunk'] + R['lids'], 0, 1)


def _body(Pm, Nm, R, pl, n, P):
    """the red body: duller and darker on the back, brightest on the breast, each feather a touch darker at its base"""
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    col = mix(np.tile(P['red'], (n, 1)), P['redHi'], (fid - 0.5) * 0.35)
    col = mix(col, P['redBk'], sstep(0.05, 0.75, Nm[:, 1]) * sstep(0.04, 0.0, z) * 0.75)
    col = mix(col, P['breast'], sstep(-0.1, -0.7, Nm[:, 1]) * 0.5)
    col = mix(col, P['redBk'], sstep(-0.026, -0.04, z) * 0.6)
    mid = sstep(0.0008, 0.003, np.abs(x))
    col = mix(col, col * 0.8, sstep(0.45 * cfa, 1.3 * cfa, -pl['a']) * 0.55 * pl['cov'] * mid)
    return col


def _bare(col, Pm, R, P, n):
    bl = R['bill']
    bcol = mix(np.tile(P['bill'], (n, 1)), P['billDk'], sstep(0.05, 0.058, Pm[:, 2]) * 0.3 + sstep(0.0695, 0.0685, Pm[:, 1]) * 0.15)
    col = mix(col, bcol, bl)
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    col = mix(col, mix(np.tile(P['leg'], (n, 1)), P['legHi'], sstep(0.4, 0.9, fbm(Pm * 2400, 2, 34)) * 0.4), lg)
    col = mix(col, P['claw'], R['claws'])
    col = mix(col, P['lid'], R['lids'] * 0.9)
    return col, bl, lg


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    n = len(P)
    n1 = fbm(Pm * 300, 3, 11)
    col = _body(Pm, Nm, R, pl, n, K)
    col *= (0.95 + 0.1 * n1)[:, None]
    m = mask(Pm, Nm, R)
    col = mix(col, mix(np.tile(K['black'], (n, 1)), K['blackHi'], sstep(0.4, 0.9, Nm[:, 1]) * 0.25), m)
    col, bl, lg = _bare(col, Pm, R, K, n)
    rough = 0.68 + 0.06 * (n1 - 0.5) - 0.06 * sstep(0.1, 0.8, Nm[:, 1]) * feath
    rough = np.where(bl > 0.5, 0.38, rough)
    rough = np.where(lg > 0.5, 0.55, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


# the chick (fledgling): warm gray-brown down, a dark bill with the yellow gape
KB = {'down': hexc(0x7A6658), 'downLt': hexc(0x968272), 'bill': hexc(0x3E3230), 'gape': hexc(0xF2D040), 'leg': hexc(0x9A8A84), 'lid': hexc(0x4A3A34)}


def paint_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    n = len(P)
    dn, tip = B.down(Pm, fl, Nm, 0.0007, 82)
    col = mix(np.tile(KB['down'], (n, 1)), KB['downLt'], sstep(-0.2, -0.8, Nm[:, 1]) * 0.6)
    col = mix(col, K['redBk'], sstep(0.4, 0.9, Nm[:, 1]) * 0.15)
    col *= (0.84 + 0.26 * dn)[:, None]
    gape = sstep(0.0034, 0.0016, np.linalg.norm((Pm - C.GAPE) * V(0.8, 1.3, 1.0), axis=1))
    col = mix(col, KB['bill'], R['bill'])
    col = mix(col, KB['gape'], np.clip(gape * (R['bill'] + R['head']), 0, 1))
    lg = np.clip(R['tarsus'] + R['toes'] + R['claws'], 0, 1)
    col = mix(col, KB['leg'], lg)
    col = mix(col, KB['lid'], R['lids'] * 0.8)
    rough = np.where(R['bill'] + lg > 0.5, 0.5, 0.92)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


C.paint, C.paint_baby = paint, paint_baby
_meta0 = C.meta


def meta(st):
    m = _meta0(st)
    m['eye'].update({'iris': 0x22140C, 'rim': 0x120A08})
    m['flat'] = 0xB81C28
    return m


C.meta = meta
C.stats = lambda P, N, c, col: {'lidCol': 0x241A1A}


# ---------- feather blades (atlas cells: 0 primaries, 1 secondaries, 2 greater coverts, 3 lesser coverts, 4 tertials,
# 5 tail, 6 crest, 7 marginal) ----------
def cells(pal):
    F_ = B.FeatherCell
    a, b, d, e, sh = pal

    def prim(s, t, side):
        c = mix(np.tile(a, (len(s), 1)), d, sstep(0.1, -0.5, s) * 0.6)
        c = mix(c, e, sstep(0.45, 0.85, s) * 0.5)
        return mix(c, d, sstep(0.75, 1.0, t) * 0.3)

    def sec(s, t, side):
        c = mix(np.tile(a, (len(s), 1)), d, sstep(0.0, -0.6, s) * 0.5)
        return mix(c, e, sstep(0.5, 0.85, s) * 0.4)

    def cov(s, t, side):
        return mix(np.tile(b, (len(s), 1)), e, sstep(0.55, 1.0, np.abs(s)) * 0.35)

    def tail(s, t, side):
        c = mix(np.tile(a, (len(s), 1)), d, sstep(0.0, -0.6, s) * 0.45)
        return mix(c, e, sstep(0.6, 0.9, s) * 0.35)

    def crest(s, t, side):
        return mix(np.tile(e, (len(s), 1)), b, sstep(0.0, 0.6, t) * 0.3 + sstep(0.6, 1.0, np.abs(s)) * 0.2)

    return [F_('flight', prim, w=0.58, outer=0.55, tip=0.35, shaft=sh),
            F_('round', sec, w=0.72, outer=0.85, tip=0.5, shaft=sh),
            F_('round', cov, w=0.8, outer=0.9, tip=0.8, shaft=sh),
            F_('round', cov, w=0.8, outer=0.9, tip=1.1, shaft=sh),
            F_('round', sec, w=0.76, outer=0.85, tip=0.7, shaft=sh),
            F_('round', tail, w=0.6, outer=0.85, tip=0.55, shaft=sh),
            F_('flight', crest, w=0.42, outer=0.9, tip=0.25, shaft=sh),
            F_('round', cov, w=0.8, outer=0.9, tip=0.9, shaft=sh)]


def _cells():
    # dull red flight feathers with darker inner webs and brighter outer edges, red coverts, a deep red tail
    return cells((hexc(0x861418), hexc(0x9A161E), hexc(0x5A0E12), hexc(0xB01C24), hexc(0x4A0C10)))


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = hexc(0x8C7262), hexc(0x6E5648)

    def dn(s, t, side):
        return mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 8


C.FEATHER_ATLAS = dict(C.FEATHER_ATLAS, cells=_cells, baby=_baby_cells)
C.PREVIEW = dict(C.PREVIEW)
refit.api(globals(), C, KS)
