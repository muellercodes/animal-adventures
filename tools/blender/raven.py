# round 17: common raven, on the bald eagle's body at 0.72 of its size (refit.py: eagle.py runs in a private copy, C;
# the shapes and paints here are in the eagle's units, the game's SPEC.raven uses the same k). Its own: a long, heavy,
# deep bill with a gently arched culmen and a slight droop at the tip (no hook, no cere), a tuft of bristle feathers
# over the nostrils, no brow ridge, shaggy pointed throat feathers (hackles), a slimmer body, short feathered thighs
# over long bare black scaly legs with thinner toes and curved black claws (not talons). Glossy black all over with a
# blue-purple sheen on the back, the wings and the crown. The chick: dark gray down.
# Make it with: VOXEL=0.0022 TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py raven
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, loft, fbm, vnoise, worley, length
import bird as B
from bird import mirror, groove, hexc, mix
import refit

ID = 'raven'
KS = 0.72
_M = sys.modules[__name__]
C = refit.load('eagle', ID + '_base')

# ---------- shape (eagle units) ----------
C.UPPER = [
    (0.224, 0.413, 0.395, 0.381, 0.0128, 2.2, 2.4),
    (0.245, 0.4148, 0.394, 0.3802, 0.0116, 2.2, 2.6),
    (0.265, 0.4125, 0.392, 0.3795, 0.0099, 2.1, 2.6),
    (0.285, 0.4065, 0.3885, 0.379, 0.0079, 2.0, 2.4),
    (0.303, 0.3975, 0.383, 0.3775, 0.0061, 2.0, 2.2),
    (0.317, 0.3875, 0.378, 0.3745, 0.0045, 2.0, 2.0),
    (0.327, 0.378, 0.3725, 0.3695, 0.003, 2.0, 2.0),
    (0.3315, 0.3705, 0.3675, 0.3648, 0.0017, 2.0, 2.0),
]
C.LOWER = [
    (0.226, 0.381, 0.373, 0.3638, 0.0106, 2.2, 2.2),
    (0.25, 0.3796, 0.3725, 0.3655, 0.0093, 2.2, 2.2),
    (0.275, 0.3786, 0.3725, 0.3682, 0.0069, 2.1, 2.1),
    (0.3, 0.3772, 0.3728, 0.3705, 0.0046, 2.0, 2.0),
    (0.318, 0.3755, 0.3732, 0.3718, 0.0025, 2.0, 2.0),
]
C.TOMIUM = [(0.226, 0.381), (0.25, 0.3796), (0.275, 0.3786), (0.3, 0.3772), (0.318, 0.3755), (0.327, 0.3712), (0.332, 0.366)]
C.CERE_Z = -1.0
C.NOSTRIL = V(0.0, 10.0, 10.0)
C.MOUTH = V(0.0, 0.3705, 0.328)
C.brow = lambda P: np.full(len(P), 1.0, F)
C.TOES = [dict(a=-30, len=0.044, r=0.0062, r1=0.0044, claw=0.017, clawR=0.0036, clawDrop=0.32, n=3),
          dict(a=3, len=0.054, r=0.0064, r1=0.0046, claw=0.018, clawR=0.0038, clawDrop=0.32, n=4),
          dict(a=32, len=0.044, r=0.0062, r1=0.0044, claw=0.017, clawR=0.0036, clawDrop=0.32, n=3),
          dict(a=180, len=0.04, r=0.0066, r1=0.0048, claw=0.02, clawR=0.004, clawDrop=0.34, lift=0.004, n=2)]
_head0, _neck0, _trunk0 = C.head, C.neck, C.trunk


def head(P):
    """the eagle's head with a rounder crown, a steeper forehead into the bill and a tuft of bristles over the
    nostrils at the base of the bill"""
    Q = mirror(P)
    d = ellipsoid(Q, V(0, 0.398, 0.198), V(0.042, 0.042, 0.056))
    d = smin(d, ellipsoid(Q, V(0.012, 0.382, 0.216), V(0.037, 0.033, 0.042)), 0.012)
    d = smin(d, ellipsoid(Q, V(0, 0.4, 0.228), V(0.026, 0.028, 0.026)), 0.01)
    bristle = ellipsoid(Q, V(0.006, 0.401, 0.238), V(0.0125, 0.0095, 0.022))
    return smin(d, bristle, 0.008)


def neck(P):
    """the neck with the raven's shaggy throat: long pointed hackles bulging under the chin"""
    Q = mirror(P)
    d = _neck0(P)
    return smin(d, ellipsoid(Q, V(0, 0.33, 0.19), V(0.038, 0.04, 0.036)), 0.02)


def trunk(P):
    return _trunk0(P * V(1 / 0.9, 1, 1)) * 0.92


def drum(P):
    """short feathered thighs ending above the hock"""
    Q = mirror(P)
    return round_cone(Q, V(0.048, 0.205, 0.03), V(0.06, 0.125, 0.034), 0.04, 0.024)


def tarsus(P):
    """the long bare black tarsus (scutes in front) down to the foot"""
    Q = mirror(P)
    j = round_cone(Q, V(0.062, 0.13, 0.03), C.HMETA + V(0, 0.0, 0.004), 0.0125, 0.01)
    t = B.flat_cone(Q, C.HMETA + V(0, 0.0, 0.004), C.HPAW + V(0, 0.007, -0.001), 0.0088, 0.0082, 0.9, up=(1, 0, 0))
    pad = ellipsoid(Q, C.HPAW + V(0, -0.0005, 0.002), V(0.012, 0.0075, 0.013))
    return smin(smin(j, t, 0.006), pad, 0.005)


C.head, C.neck, C.trunk, C.drum, C.tarsus = head, neck, trunk, drum, tarsus
# (the longer bill reaches past the eagle's head box, bounds and bill patch)
C.HEAD_BOX = (V(-0.07, 0.33, 0.13), V(0.07, 0.445, 0.345))
C.BOUNDS = (V(-0.64, -0.001, -0.24), V(0.64, 0.46, 0.35))
C.PATCHES = [(V(0.0, 0.34, 0.2), V(0.05, 0.43, 0.338), 0.0008), C.PATCHES[1]]

# ---------- plumage (eagle units) ----------
K = {
    'black': hexc(0x141418), 'blackHi': hexc(0x22222A), 'sheen': hexc(0x2A2C4C), 'purple': hexc(0x302440), 'edge': hexc(0x1E1E26),
    'bill': hexc(0x16161A), 'billHi': hexc(0x2A2A30), 'leg': hexc(0x18181C), 'legHi': hexc(0x2C2C32), 'talon': hexc(0x0E0E10), 'lid': hexc(0x1E1C20),
}


def _sz(P, N, R):
    s = C._size0(P, N, R)
    # the throat hackles: longer pointed feathers
    thr = sstep(0.15, 0.21, P[:, 2]) * sstep(0.36, 0.33, P[:, 1]) * sstep(0.29, 0.31, P[:, 1]) * np.clip(R['neck'] + R['head'], 0, 1)
    return s * (1 - thr) + thr * 0.012


def _fshape(P):
    y, z = P[:, 1], P[:, 2]
    thr = sstep(0.15, 0.21, z) * sstep(0.36, 0.33, y) * sstep(0.29, 0.31, y)
    return (1 - 0.4 * thr).astype(F), (1 - 0.6 * thr).astype(F), (1 + 0.8 * thr).astype(F)


C._size0, C._size, C._fshape = C._size, _sz, _fshape


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    n1 = fbm(Pm * 30, 3, 11)
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    mid = sstep(0.001, 0.005, np.abs(x)) * pl['cov']
    # glossy black, each feather a shade different; a blue-purple sheen where the feathers face up and out, the
    # feather edges a touch duller
    col = mix(np.tile(K['black'], (n, 1)), K['blackHi'], (fid - 0.5) * 0.4)
    up = sstep(0.0, 0.85, Nm[:, 1]) * feath
    col = mix(col, mix(np.tile(K['sheen'], (n, 1)), K['purple'], sstep(0.4, 0.7, fbm(Pm * 25, 2, 31))), up * 0.55 * (0.6 + 0.4 * fid))
    col = mix(col, K['edge'], sstep(0.25 * cfa, 0.05 * cfa, -pl['a']) * 0.4 * mid)
    col = mix(col, col * 0.7, sstep(0.45 * cfa, 1.3 * cfa, -pl['a']) * 0.4 * mid)
    col *= (0.94 + 0.12 * n1)[:, None]
    bl = R['bill']
    col = mix(col, mix(np.tile(K['bill'], (n, 1)), K['billHi'], sstep(0.3, 0.9, Nm[:, 1]) * 0.4), bl)
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    sc = B.scutes(Pm, nrm([0, -1, 0.15]), 0.0035, 43)[1]
    col = mix(col, mix(np.tile(K['leg'], (n, 1)), K['legHi'], sc * 0.5), lg)
    col = mix(col, K['talon'], R['claws'])
    col = mix(col, K['lid'], R['lids'] * 0.8)
    rough = 0.5 + 0.06 * (n1 - 0.5) - 0.08 * up
    rough = np.where(bl > 0.5, 0.34, rough)
    rough = np.where(lg > 0.5, 0.45, rough)
    rough = np.where(R['claws'] > 0.5, 0.3, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    h = np.zeros(len(P), F)
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    h += B.feather_height(pl, 0.035) * feath * (1 - 0.4 * hd) * sstep(0.001, 0.005, np.abs(x))
    # bristles over the nostrils: fine strokes pointing forward along the bill
    br = sstep(0.226, 0.236, z) * sstep(0.262, 0.25, z) * sstep(0.392, 0.398, y) * hd
    h += 0.00003 * np.sin(x / 0.0006 + 3 * fbm(Pm * 300, 2, 64)) * br
    h -= 0.00002 * sstep(0.5, 1.0, np.sin(np.hypot(y - 0.34, z - 0.25) / 0.0008)) * R['bill']
    h += C._leg_h(P, c, R)
    return h


KB = {'down': hexc(0x4A4848), 'downLt': hexc(0x605E5E), 'bill': hexc(0x3A3836), 'gape': hexc(0xD8B8A0), 'foot': hexc(0x4A4644), 'talon': hexc(0x2A2826)}


def paint_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    n = len(P)
    dn, tip = B.down(Pm, fl, Nm, 0.0028, 81)
    col = mix(np.tile(KB['down'], (n, 1)), KB['downLt'], tip * 0.4 + sstep(-0.2, -0.8, Nm[:, 1]) * 0.25)
    col *= (0.82 + 0.3 * dn)[:, None]
    bl = R['bill']
    gape = sstep(0.236, 0.226, Pm[:, 2]) * sstep(0.385, 0.377, Pm[:, 1])
    col = mix(col, mix(np.tile(KB['bill'], (n, 1)), KB['gape'], gape * 0.8), bl)
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    col = mix(col, KB['foot'], lg)
    col = mix(col, KB['talon'], R['claws'])
    col = mix(col, KB['down'] * 0.7, R['lids'] * 0.7)
    rough = np.where(bl + lg > 0.5, 0.45, 0.93)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


C.paint, C.detail, C.paint_baby = paint, detail, paint_baby
_meta0 = C.meta


def meta(st):
    m = _meta0(st)
    m['eye'].update({'iris': 0x1E140E, 'irisR': 0.92, 'pupilR': 0.45, 'rim': 0x0A0806, 'babyIris': 0x2A2420, 'babyLidCol': 0x4A4848})
    m.update({'flat': 0x18181E, 'rim': [0.08, 0.08, 0.1]})
    return m


C.meta = meta
C.stats = lambda P, N, c, col: {'lidCol': 0x1E1C20}


# ---------- feather blades (atlas cells: 0 primaries, 1 secondaries, 2 greater coverts, 3 lesser coverts, 4 tertials,
# 5 tail, 6 tail coverts, 7 coverts) ----------
def _cells():
    F_ = B.FeatherCell
    bk, bkH, sh, pu, sft = hexc(0x121216), hexc(0x202028), hexc(0x2A2C4A), hexc(0x2E2440), hexc(0x0A0A0C)

    def gloss(k):
        def fn(s, t, side):
            c = mix(np.tile(bk, (len(s), 1)), bkH, sstep(0.0, 0.6, np.abs(s)) * 0.3)
            c = mix(c, sh, sstep(0.2, 0.8, s) * k)
            return mix(c, pu, sstep(0.5, 0.95, t) * sstep(0.0, 0.7, s) * k * 0.6)
        return fn

    return [F_('finger', gloss(0.45), w=0.58, outer=0.55, tip=0.42, shaft=sft, notch=0.34, gloss=1),
            F_('round', gloss(0.5), w=0.72, outer=0.8, tip=0.5, shaft=sft, gloss=1),
            F_('round', gloss(0.6), w=0.8, outer=0.85, tip=0.8, shaft=sft, gloss=1),
            F_('round', gloss(0.6), w=0.8, outer=0.9, tip=1.1, shaft=sft, gloss=1),
            F_('round', gloss(0.5), w=0.76, outer=0.85, tip=0.7, shaft=sft, gloss=1),
            F_('round', gloss(0.45), w=0.66, outer=0.9, tip=0.55, shaft=sft, gloss=1),
            F_('round', gloss(0.5), w=0.76, outer=0.9, tip=0.9, shaft=sft, gloss=1),
            F_('round', gloss(0.6), w=0.8, outer=0.9, tip=0.8, shaft=sft, gloss=1)]


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = hexc(0x4E4C4C), hexc(0x3A3838)

    def dn(s, t, side):
        return mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 8


C.FEATHER_ATLAS = dict(C.FEATHER_ATLAS, cells=_cells, baby=_baby_cells)
refit.api(globals(), C, KS)
