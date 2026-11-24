# round 16: ruby-throated hummingbird (the girl), on the chickadee's bird body at 0.62 of its size with short legs
# (refit.py: chickadee.py runs in a private copy, C, the legs shortened by DROP; the shapes and paints here are in the
# chickadee's units, the game's SPEC.hummingbird uses the same numbers through songBird). Her own: a long, thin,
# straight bill, tiny feet. Emerald green above (golden green to blue green as the light turns), gray-white below with
# green-washed flanks, a white throat, a dark patch behind the eye with a small white spot above it, a black bill.
# Feather atlas: dark flight feathers, green coverts, a rounded tail: green in the middle, the outer feathers green, then
# black, then white at the tips. The boy is hummingbirdm.py (his ruby throat and dark forked tail on this mesh). The
# chick: like her, softer and grayer, in down.
# Make it with: VOXEL=0.0003 TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py hummingbird
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, fbm, length
import bird as B
from bird import mirror, groove, hexc, mix
import refit

ID = 'hummingbird'
KS = 0.62
DROP = 0.0098
_M = sys.modules[__name__]
C = refit.load('chickadee', ID + '_base')

# ---------- shape (chickadee units) ----------
C.MOUTH = V(0.0, 0.0701, 0.0776)
C.GAPE = V(0.0017, 0.0707, 0.0474)
UPPER = ([V(0, 0.0721, 0.0466), V(0, 0.0718, 0.052), V(0, 0.0714, 0.059), V(0, 0.071, 0.066), V(0, 0.0706, 0.0725), V(0, 0.0702, 0.0778)],
         [0.0016, 0.0011, 0.00085, 0.0007, 0.00055, 0.00028])
LOWER = ([V(0, 0.0706, 0.047), V(0, 0.0705, 0.054), V(0, 0.0703, 0.064), V(0, 0.0701, 0.0745)], [0.0012, 0.0008, 0.00062, 0.00034])
# tiny feet
C.TOES = [dict(t, len=t['len'] * 0.62, claw=t['claw'] * 0.7, r=t['r'] * 0.8, r1=t['r1'] * 0.8) for t in C.TOES]


def beak(P):
    """a long, thin, straight bill, round in section, the lower mandible just under the upper"""
    Q = mirror(P)
    up = chain(Q, UPPER[0], UPPER[1], 0.0004)
    lo = chain(Q, LOWER[0], LOWER[1], 0.0004)
    d = smin(up, lo, 0.0002)
    y, z = Q[:, 1], Q[:, 2]
    d = d + groove(y - 0.0706 + 0.008 * (z - 0.047), 0.00007, 0.00008) * sstep(0.047, 0.049, z) * sstep(0.075, 0.072, z)
    return d


_trunk0 = C.trunk


def trunk(P):
    """a slimmer body than the chickadee's"""
    return _trunk0(P * V(1 / 0.86, 1, 1)) * 0.9


C.beak, C.trunk = beak, trunk
C.HEAD_BOX = (V(-0.018, 0.058, 0.02), V(0.018, 0.09, 0.082))
C.BOUNDS = (V(-0.085, -0.0005, -0.048), V(0.085, 0.09, 0.082))
C.PATCHES = [(V(0.0, 0.064, 0.038), V(0.015, 0.082, 0.081), 0.00012), (V(0.0, -0.0005, -0.006), V(0.022, 0.006, 0.018), 0.00011)]
_grid0 = C.grid


def grid(h):
    xs, ys, zs = _grid0(h)
    zs = np.unique(np.concatenate([zs, np.arange(0.064, 0.082, h * 0.6)]))
    return xs, ys, zs


C.grid = grid

# ---------- plumage (chickadee units) ----------
K = {
    'green': hexc(0x3A6C3A), 'greenGo': hexc(0x667A34), 'greenBl': hexc(0x2C6652), 'greenDk': hexc(0x2A4E2E),
    'white': hexc(0xE8E8E2), 'whiteSh': hexc(0xD0D2CA), 'flank': hexc(0x98A284), 'ear': hexc(0x3A3A36),
    'bill': hexc(0x141414), 'leg': hexc(0x2A2A2A), 'legHi': hexc(0x404040), 'claw': hexc(0x141414), 'lid': hexc(0x2A2A2A),
}


def _greens(Pm, Nm, pl, n, k=1.0):
    """iridescent green: golden green where the feathers face up and forward, blue green on the sides"""
    fid = pl['id']
    g = mix(np.tile(K['green'], (n, 1)), K['greenGo'], sat(0.5 * Nm[:, 1] + 0.3 * Nm[:, 2]) * 0.5 + (fid - 0.5) * 0.3)
    return mix(g, K['greenBl'], sstep(0.3, 0.9, np.abs(Nm[:, 0])) * 0.4 * k)


def _base(Pm, Nm, R, pl, n):
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    cfa = np.maximum(pl['c'], 1e-4)
    under = np.clip(sstep(0.0, -0.55, Nm[:, 1]) + sstep(0.2, 0.7, Nm[:, 2]) * sstep(0.058, 0.05, y) * sstep(0.0, 0.015, z), 0, 1)
    col = mix(_greens(Pm, Nm, pl, n), K['white'], under)
    # green-washed flanks
    col = mix(col, K['flank'], sstep(0.25, 0.75, np.abs(Nm[:, 0])) * sstep(0.2, -0.4, Nm[:, 1]) * sstep(0.03, 0.0, z) * 0.6)
    # the throat and the chin white below a line from the bill corner back under the eye
    hd = np.clip(R['head'] + R['neck'] + R['lids'], 0, 1)
    yl = np.interp(z, [0.03, 0.04, 0.046, 0.05], [0.064, 0.0685, 0.0702, 0.0712]).astype(F)
    thr = sstep(yl + 0.0006, yl - 0.0006, y) * sstep(0.025, 0.034, z) * hd
    col = mix(col, mix(np.tile(K['white'], (n, 1)), K['whiteSh'], sstep(0.3, -0.5, Nm[:, 1]) * 0.4), thr)
    # the dark patch behind the eye and the small white spot just behind and above it
    ec = C.EYE_C
    ear = sstep(0.0058, 0.0035, np.linalg.norm((Pm - (ec + V(0.0, -0.0026, -0.004))) * V(1.0, 1.2, 0.8), axis=1))
    col = mix(col, K['ear'], ear * hd * 0.7)
    spot = sstep(0.0018, 0.0011, np.linalg.norm(Pm - (ec + V(0.001, 0.0016, -0.0036)), axis=1))
    col = mix(col, K['white'], spot * hd)
    mid = sstep(0.0008, 0.003, np.abs(x))
    col = mix(col, col * 0.82, sstep(0.45 * cfa, 1.3 * cfa, -pl['a']) * 0.5 * pl['cov'] * mid)
    return col, thr


def _bare(col, Pm, R, n):
    bl = R['bill']
    col = mix(col, K['bill'], bl)
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    col = mix(col, K['leg'], lg)
    col = mix(col, K['claw'], R['claws'])
    col = mix(col, K['lid'], R['lids'] * 0.9)
    return col, bl, lg


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    n = len(P)
    n1 = fbm(Pm * 300, 3, 11)
    col, thr = _base(Pm, Nm, R, pl, n)
    # her throat: faint gray streaks
    col = mix(col, K['whiteSh'] * 0.85, thr * sstep(0.55, 0.8, fbm(Pm * 1500, 2, 71)) * 0.4)
    col *= (0.95 + 0.1 * n1)[:, None]
    col, bl, lg = _bare(col, Pm, R, n)
    rough = 0.6 + 0.06 * (n1 - 0.5) - 0.12 * sstep(0.0, 0.8, Nm[:, 1]) * feath
    rough = np.where(bl > 0.5, 0.3, rough)
    rough = np.where(lg > 0.5, 0.5, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


KB = {'down': hexc(0x8A8E80), 'bill': hexc(0x2A2826), 'gape': hexc(0xE8D06A), 'leg': hexc(0x4A4A4A), 'lid': hexc(0x3A3A38)}


def paint_baby(P, N, c):
    """the chick: her colors, softer and grayer, in down"""
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    n = len(P)
    dn, tip = B.down(Pm, fl, Nm, 0.0007, 82)
    col, thr = _base(Pm, Nm, R, pl, n)
    col = mix(col, KB['down'], np.full(n, 0.45, F))
    col *= (0.84 + 0.26 * dn)[:, None]
    gape = sstep(0.0022, 0.001, np.linalg.norm((Pm - C.GAPE) * V(0.8, 1.3, 1.0), axis=1))
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
    m['eye'].update({'iris': 0x120C08, 'rim': 0x0A0806})
    m['flat'] = 0x5A8A58
    return m


C.meta = meta
C.stats = lambda P, N, c, col: {'lidCol': 0x2A2A2A}


# ---------- feather blades (atlas cells: 0 primaries, 1 secondaries, 2 greater coverts, 3 lesser coverts, 4 tertials,
# 5 tail (middle), 6 spare, 7 outer tail) ----------
def cells(tail_mid, tail_out):
    F_ = B.FeatherCell
    dk, dk2, gr, grD, sh = hexc(0x34303A), hexc(0x24222A), hexc(0x3E7A48), hexc(0x2C5A36), hexc(0x1A181E)

    def prim(s, t, side):
        c = mix(np.tile(dk, (len(s), 1)), dk2, sstep(0.0, -0.6, s) * 0.5)
        return mix(c, hexc(0x4A4652), sstep(0.5, 0.9, s) * 0.3)

    def cov(s, t, side):
        return mix(np.tile(gr, (len(s), 1)), grD, sstep(0.55, 1.0, np.abs(s)) * 0.4)

    def tert(s, t, side):
        return mix(np.tile(grD, (len(s), 1)), dk, sstep(0.5, 1.0, t) * 0.4)

    return [F_('flight', prim, w=0.5, outer=0.45, tip=0.2, shaft=sh),
            F_('flight', prim, w=0.62, outer=0.7, tip=0.35, shaft=sh),
            F_('round', cov, w=0.8, outer=0.9, tip=0.8, shaft=sh),
            F_('round', cov, w=0.8, outer=0.9, tip=1.1, shaft=sh),
            F_('round', tert, w=0.76, outer=0.85, tip=0.7, shaft=sh),
            F_('round', tail_mid, w=0.6, outer=0.85, tip=0.6, shaft=sh),
            F_('round', cov, w=0.6, outer=0.85, tip=0.6, shaft=sh),
            F_('round', tail_out, w=0.6, outer=0.85, tip=0.7, shaft=sh)]


def _tail_mid(s, t, side):
    c = mix(np.tile(hexc(0x3E7A48), (len(s), 1)), hexc(0x2C5A36), sstep(0.0, -0.6, s) * 0.4)
    return mix(c, hexc(0x1E1E22), sstep(0.7, 0.9, t) * 0.6)


def _tail_out(s, t, side):
    c = mix(np.tile(hexc(0x3E7A48), (len(s), 1)), hexc(0x141418), sstep(0.35, 0.45, t))
    return mix(c, hexc(0xF4F4F0), sstep(0.76, 0.82, t))


def _cells():
    return cells(_tail_mid, _tail_out)


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = hexc(0x6E7A64), hexc(0x56604E)

    def dn(s, t, side):
        return mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 8


C.FEATHER_ATLAS = dict(C.FEATHER_ATLAS, cells=_cells, baby=_baby_cells)
refit.api(globals(), C, KS, DROP)
