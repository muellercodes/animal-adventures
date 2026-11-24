# round 16: toco toucan, on the macaw's bird body at 0.88 of its size (refit.py: parrot.py runs in a private copy, C;
# the shapes and paints here are in the macaw's units, the game's SPEC.toucan uses the same numbers). Its own: the
# huge bill (about 19 cm: deep at the base, narrow across, the top curving down to the point; the cutting edges
# saw-toothed), short rounded wings (the wing arm shortened to the game's toucan wing). Black all over with a white throat
# and chest (a yellow wash at its lower edge), white over the base of the tail and red under it; a ring of bare blue
# skin round the dark eye inside a patch of bare orange skin; the bill orange with a red-orange ridge along the top, a
# big black spot at the tip and a thin black line round its base; blue-gray legs. The chick: dark gray down, a pale
# yellowish bill. Boys and girls look alike.
# Make it with: VOXEL=0.0018 TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py toucan
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, loft, fbm, length
import bird as B
from bird import mirror, groove, hexc, mix
import refit

ID = 'toucan'
KS = 0.88
_M = sys.modules[__name__]
C = refit.load('parrot', ID + '_base')

# ---------- shape (macaw units) ----------
# the bill: (z, top, yw, bot, w, eTop, eBot)
BILL = [
    (0.112, 0.416, 0.379, 0.342, 0.0205, 2.2, 2.2),
    (0.15, 0.416, 0.38, 0.346, 0.0196, 2.2, 2.2),
    (0.19, 0.41, 0.378, 0.349, 0.0174, 2.2, 2.3),
    (0.23, 0.4, 0.373, 0.35, 0.0147, 2.2, 2.3),
    (0.27, 0.386, 0.365, 0.347, 0.0117, 2.2, 2.3),
    (0.3, 0.372, 0.357, 0.343, 0.0087, 2.2, 2.3),
    (0.322, 0.358, 0.349, 0.339, 0.0057, 2.1, 2.2),
    (0.338, 0.346, 0.342, 0.337, 0.0026, 2.0, 2.0),
]
_BK = np.array(BILL, F)
TOM = ([0.112, 0.15, 0.2, 0.25, 0.29, 0.32, 0.338], [0.371, 0.371, 0.369, 0.364, 0.356, 0.347, 0.341])
C.MOUTH = V(0.0, 0.342, 0.336)
C.NOSTRIL = V(0.006, 0.414, 0.118)


def tom_y(z):
    return np.interp(z, TOM[0], TOM[1]).astype(F)


def top_y(z):
    return np.interp(z, _BK[:, 0], _BK[:, 1]).astype(F)


def beak(P):
    """the toucan's bill: a deep, narrow, light bill as long as the body, the cutting edges saw-toothed"""
    Q = mirror(P)
    d = loft(Q, BILL)
    y, z = Q[:, 1], Q[:, 2]
    saw = 0.5 + 0.5 * np.sin(z * 2 * np.pi / 0.011)
    d = d + groove(y - tom_y(z) - 0.0012 * saw * sstep(0.16, 0.2, z), 0.0008, 0.0016) * sstep(0.115, 0.125, z) * sstep(0.334, 0.326, z)
    return d


def neck(P):
    """a short, thick neck (the macaw's is slimmer)"""
    Q = mirror(P)
    return chain(Q, [V(0, 0.232, 0.082), V(0, 0.288, 0.096), V(0, 0.338, 0.102)], [0.056, 0.05, 0.045], 0.014)


C.beak, C.neck = beak, neck
# the head's front comes in where the bill meets it
C.HEAD_BOX = (V(-0.05, 0.31, 0.05), V(0.05, 0.43, 0.345))
C.BOUNDS = (V(-0.33, -0.001, -0.17), V(0.33, 0.44, 0.35))
C.PATCHES = [(V(0.0, 0.33, 0.08), V(0.045, 0.43, 0.345), 0.0009), (V(0.0, -0.001, -0.04), V(0.09, 0.02, 0.06), 0.0006)]
_grid0 = C.grid


def grid(h):
    xs, ys, zs = _grid0(h)
    zs = np.unique(np.concatenate([zs[zs < 0.19], np.arange(0.19, 0.35, h * 0.7)]))
    return xs, ys, zs


C.grid = grid
# short rounded wings: the wing arm as long as the game's toucan wing (stdWing s = 0.862 in macaw units)
_ws = 0.862
C.EL = C.SH + V(0.08 * _ws, 0, 0)
C.WR = C.EL + V(0.1 * _ws, 0, 0)
C.WT = C.WR + V(0.075 * _ws, 0, 0)
C.WCFG = dict(C.WCFG, arm=(C.SH, C.EL, C.WR, C.WT))

# ---------- plumage, skin and bill (macaw units) ----------
K = {
    'black': hexc(0x121212), 'blackHi': hexc(0x2A282E), 'blackBr': hexc(0x241E1A), 'white': hexc(0xF2EEDE), 'whiteSh': hexc(0xDCD6C4),
    'yellow': hexc(0xF2D488), 'red': hexc(0xC81E28), 'redDk': hexc(0x9A1820),
    'orange': hexc(0xF2841A), 'orangeLt': hexc(0xF8A830), 'ridge': hexc(0xE04A1A), 'billBlk': hexc(0x141210),
    'skin': hexc(0xF08A22), 'ring': hexc(0x3A70D8), 'ringDk': hexc(0x2850A8),
    'leg': hexc(0x5A6C90), 'legHi': hexc(0x7888A8), 'claw': hexc(0x2A2C34), 'lid': hexc(0x2E5AB8),
}


def _bib(Pm, Nm, R):
    """the white throat and chest: from the chin round the cheeks below the eye skin, down the front of the breast"""
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    yb = np.interp(z, [0.0, 0.03, 0.06, 0.09, 0.11, 0.13], [0.31, 0.255, 0.228, 0.232, 0.27, 0.33]).astype(F)
    on = sstep(yb - 0.003, yb + 0.003, y) * sstep(0.388, 0.38, y) * sstep(-0.35, 0.05, Nm[:, 2] - 0.15 * np.abs(Nm[:, 0]))
    on *= sstep(0.03, 0.055, z + 0.6 * (y - 0.3))
    return on * np.clip(R['trunk'] + R['neck'] + R['head'] + R['lids'], 0, 1)


def _eye_skin(Pm, R):
    d = np.linalg.norm((Pm - C.EYE_C) * V(1.0, 1.0, 0.85), axis=1)
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    ring = sstep(C.EYE_R + 0.006, C.EYE_R + 0.0045, d) * hd
    skin = sstep(0.021, 0.0175, np.linalg.norm((Pm - (C.EYE_C + V(0.0, -0.003, 0.004))) * V(1.0, 0.95, 0.8), axis=1)) * hd
    return np.maximum(skin, ring), ring


def _body(Pm, Nm, R, pl, n):
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    col = mix(np.tile(K['black'], (n, 1)), K['blackHi'], sstep(0.3, 0.9, Nm[:, 1]) * 0.35 + (fid - 0.5) * 0.15)
    col = mix(col, K['blackBr'], sstep(-0.2, -0.8, Nm[:, 1]) * 0.4)
    # white over the base of the tail, red under it
    col = mix(col, K['white'], sstep(-0.09, -0.112, z) * sstep(0.198, 0.212, y) * sstep(0.2, 0.6, Nm[:, 1]))
    col = mix(col, mix(np.tile(K['red'], (n, 1)), K['redDk'], (fid - 0.5) * 0.4), sstep(-0.085, -0.11, z) * sstep(0.2, 0.185, y) * sstep(0.1, -0.4, Nm[:, 1]))
    b = _bib(Pm, Nm, R)
    wcol = mix(np.tile(K['white'], (n, 1)), K['whiteSh'], sstep(0.3, -0.5, Nm[:, 1]) * 0.35)
    yb = np.interp(z, [0.0, 0.03, 0.06, 0.09, 0.11, 0.13], [0.31, 0.255, 0.228, 0.232, 0.27, 0.33]).astype(F)
    wcol = mix(wcol, K['yellow'], sstep(yb + 0.012, yb + 0.003, y) * 0.7)
    col = mix(col, wcol, b)
    col = mix(col, col * 0.82, sstep(0.45 * cfa, 1.2 * cfa, -pl['a']) * 0.35 * pl['cov'])
    return col


def _bill_col(Pm, n):
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    tt = top_y(z)
    col = mix(np.tile(K['orange'], (n, 1)), K['orangeLt'], sstep(0.36, 0.345, y) * 0.5 + 0.3 * (fbm(Pm * 120, 2, 81) - 0.5))
    col = mix(col, K['ridge'], sstep(tt - 0.009, tt - 0.003, y) * sstep(0.125, 0.14, z))
    # the big black spot at the tip of the upper bill, the black tip of the lower bill, the thin black line at the base
    up = sstep(tom_y(z) - 0.001, tom_y(z) + 0.001, y)
    col = mix(col, K['billBlk'], sstep(0.288, 0.3, z + 0.25 * (y - 0.35)) * up)
    col = mix(col, K['billBlk'], sstep(0.312, 0.322, z) * (1 - up) * 0.8)
    col = mix(col, K['billBlk'], sstep(0.122, 0.117, z))
    # the saw-toothed cutting edge, dark
    col = mix(col, K['billBlk'] * 2, sstep(0.0018, 0.0008, np.abs(y - tom_y(z))) * sstep(0.122, 0.13, z) * 0.6)
    return col


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    n = len(P)
    n1 = fbm(Pm * 40, 3, 11)
    col = _body(Pm, Nm, R, pl, n)
    col *= (0.95 + 0.1 * n1)[:, None]
    sk, ring = _eye_skin(Pm, R)
    col = mix(col, mix(np.tile(K['skin'], (n, 1)), K['ring'], ring), sk)
    bl = R['bill']
    col = mix(col, _bill_col(Pm, n), bl)
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    col = mix(col, mix(np.tile(K['leg'], (n, 1)), K['legHi'], sstep(0.4, 0.9, fbm(Pm * 300, 2, 34)) * 0.4), lg)
    col = mix(col, K['claw'], R['claws'])
    col = mix(col, K['lid'], R['lids'] * 0.9)
    rough = 0.66 + 0.06 * (n1 - 0.5) - 0.08 * sstep(0.1, 0.8, Nm[:, 1]) * feath
    rough = np.where(sk > 0.5, 0.45, rough)
    rough = np.where(bl > 0.5, 0.3, rough)
    rough = np.where(lg > 0.5, 0.55, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


KB = {'down': hexc(0x3A3836), 'downLt': hexc(0x56524E), 'skin': hexc(0xC8A8A0), 'bill': hexc(0xDCCC92), 'billDk': hexc(0xB0A070), 'foot': hexc(0x8A8E9A)}


def paint_baby(P, N, c):
    """the chick: dark gray down over pinkish skin, a pale yellowish bill"""
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    n = len(P)
    dn, tip = B.down(Pm, fl, Nm, 0.0016, 74)
    col = mix(np.tile(KB['skin'], (n, 1)), mix(np.tile(KB['down'], (n, 1)), KB['downLt'], sstep(-0.2, -0.8, Nm[:, 1]) * 0.6), sstep(0.15, 0.45, dn))
    bl = R['bill']
    col = mix(col, mix(np.tile(KB['bill'], (n, 1)), KB['billDk'], sstep(0.12, 0.117, Pm[:, 2])), bl)
    lg = np.clip(R['tarsus'] + R['toes'] + R['claws'], 0, 1)
    col = mix(col, KB['foot'], lg)
    col = mix(col, K['ringDk'], R['lids'] * 0.6)
    rough = np.where(bl + lg > 0.5, 0.5, 0.88)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


C.paint, C.paint_baby = paint, paint_baby
_meta0 = C.meta


def meta(st):
    m = _meta0(st)
    m['eye'].update({'iris': 0x3A2214, 'irisR': 0.9, 'pupilR': 0.45, 'rim': 0x1A1008, 'babyIris': 0x1A120C})
    m['flat'] = 0x1E1E1E
    return m


C.meta = meta
C.stats = lambda P, N, c, col: {'lidCol': 0x2E5AB8}


# ---------- feather blades (atlas cells: 0 primaries, 1 secondaries, 2 greater coverts, 3 lesser coverts, 4 tertials,
# 5 tail, 6 white uppertail coverts, 7 spare) ----------
def _cells():
    F_ = B.FeatherCell
    bk, bkH, bkB, wh, whS, sh = hexc(0x141416), hexc(0x2C2A30), hexc(0x2A2420), hexc(0xF2EEDE), hexc(0xD8D2C0), hexc(0x0E0E10)

    def flight(s, t, side):
        c = mix(np.tile(bk, (len(s), 1)), bkB, sstep(0.0, -0.6, s) * 0.5)
        return mix(c, bkH, sstep(0.55, 0.95, s) * 0.5)

    def cov(s, t, side):
        return mix(np.tile(bk, (len(s), 1)), bkH, sstep(0.55, 1.0, np.abs(s)) * 0.5)

    def white(s, t, side):
        return mix(np.tile(wh, (len(s), 1)), whS, sstep(0.55, 1.0, np.abs(s)) * 0.4)

    return [F_('flight', flight, w=0.6, outer=0.6, tip=0.45, shaft=sh),
            F_('round', flight, w=0.72, outer=0.85, tip=0.55, shaft=sh),
            F_('round', cov, w=0.8, outer=0.9, tip=0.8, shaft=sh),
            F_('round', cov, w=0.8, outer=0.9, tip=1.1, shaft=sh),
            F_('round', flight, w=0.76, outer=0.85, tip=0.7, shaft=sh),
            F_('round', flight, w=0.6, outer=0.85, tip=0.7, shaft=sh),
            F_('round', white, w=0.8, outer=0.9, tip=0.9, shaft=hexc(0xC8C2B0)),
            F_('round', cov, w=0.8, outer=0.9, tip=0.9, shaft=sh)]


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = hexc(0x3A3836), hexc(0x2A2826)

    def dn(s, t, side):
        return mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 8


C.FEATHER_ATLAS = dict(C.FEATHER_ATLAS, cells=_cells, baby=_baby_cells)
refit.api(globals(), C, KS)
