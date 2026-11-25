# round 17: North Island brown kiwi (the girl), on the hen's skeleton and legs at 0.9 of her size (refit.py: chicken.py
# runs in a private copy, C; the shapes and paints here are in the hen's units, the game's SPEC.kiwi uses the same k and
# moves the neck and head bones down and forward: the kiwi carries its small head low in front of the body). Her own:
# a round, pear-shaped body highest and widest at the rump, no tail and no wings showing, a short thick neck, a small
# head with small dark eyes, a very long, thin, gently down-curved pale bill with the nostrils at its tip and long
# whisker bristles at its base, short thick legs with four strong-clawed toes. Shaggy, hair-like brown feathers
# streaked darker, a little paler and grayer below; pale gray-brown scaly legs. No feather blades (no atlas). The boy is
# smaller (SEX_LOOK), with the bill to match. The chick: a small fluffy copy (down shells, a little grayer).
# Make it with: VOXEL=0.0018 TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py kiwi
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, loft, fbm, vnoise, worley, length
import bird as B
from bird import local, local_n, mirror, groove, hexc, mix
import refit

ID = 'kiwi'
KS = 0.9
_M = sys.modules[__name__]
C = refit.load('chicken', ID + '_base')
del C.FEATHER_ATLAS   # (no wing or tail feathers: the game draws no blades for the kiwi)

# ---------- shape (hen units) ----------
C.BOUNDS = (V(-0.13, -0.001, -0.21), V(0.13, 0.36, 0.34))
C.PATCHES = [(V(0.0, 0.19, 0.15), V(0.03, 0.29, 0.33), 0.0006), (V(0.0, -0.001, -0.04), V(0.1, 0.016, 0.08), 0.0006)]
C.EYE_C = V(0.0178, 0.2745, 0.176)
C.EYE_R = 0.0038
C.EYE_DIR = nrm([0.94, 0.12, 0.3])
C.EYE_UP = nrm(np.array([0, 1, 0], F) - C.EYE_DIR * C.EYE_DIR[1])
C.EYE_SIDE = np.cross(C.EYE_UP, C.EYE_DIR)
C.LID_R = 0.003
C.MOUTH = V(0.0, 0.2005, 0.3215)
C.NOSTRIL = V(0.0028, 0.2045, 0.3155)
C.TOES = [dict(a=-30, len=0.05, r=0.0062, r1=0.004, claw=0.013, n=3), dict(a=0, len=0.058, r=0.0066, r1=0.0042, claw=0.014, n=4),
          dict(a=30, len=0.048, r=0.0062, r1=0.004, claw=0.013, n=4), dict(a=180, len=0.018, r=0.0048, r1=0.003, claw=0.009, lift=0.004, n=2, hind=True)]
TRUNK = [
    (-0.192, 0.285, 0.262, 0.24, 0.014, 2.0, 2.0),
    (-0.175, 0.31, 0.258, 0.205, 0.05, 2.1, 2.0),
    (-0.145, 0.33, 0.252, 0.172, 0.078, 2.2, 2.1),
    (-0.1, 0.338, 0.245, 0.148, 0.094, 2.3, 2.2),
    (-0.045, 0.332, 0.238, 0.136, 0.097, 2.3, 2.3),
    (0.01, 0.318, 0.236, 0.136, 0.092, 2.3, 2.3),
    (0.06, 0.298, 0.24, 0.152, 0.078, 2.2, 2.2),
    (0.095, 0.284, 0.248, 0.182, 0.058, 2.1, 2.1),
    (0.118, 0.276, 0.256, 0.218, 0.036, 2.0, 2.0),
    (0.128, 0.272, 0.258, 0.245, 0.016, 2.0, 2.0),
]
BILL = ([V(0, 0.2585, 0.19), V(0, 0.2505, 0.22), V(0, 0.2405, 0.25), V(0, 0.2285, 0.278), V(0, 0.2145, 0.302), V(0, 0.2025, 0.3205)],
        [0.0062, 0.0049, 0.0042, 0.0036, 0.003, 0.0023])


def trunk(P):
    """the pear-shaped body, round at the rump (no tail), the thighs hidden in it"""
    Q = mirror(P)
    d = loft(Q, TRUNK)
    d = smin(d, ellipsoid(Q, V(0, 0.255, -0.15), V(0.08, 0.075, 0.05)), 0.03)     # the round rump
    d = smin(d, ellipsoid(Q, V(0.0, 0.175, -0.04), V(0.075, 0.04, 0.09)), 0.03)    # the full belly over the legs
    return d


def neck(P):
    Q = mirror(P)
    return chain(Q, [V(0, 0.262, 0.095), V(0, 0.264, 0.128), V(0, 0.266, 0.152)], [0.045, 0.034, 0.026], 0.015)


def head(P):
    Q = mirror(P)
    d = ellipsoid(Q, V(0, 0.2705, 0.163), V(0.0235, 0.0235, 0.028))
    d = smin(d, ellipsoid(Q, V(0, 0.2635, 0.183), V(0.0155, 0.0158, 0.016)), 0.006)   # the face toward the bill
    return d


def beak(P):
    """the long thin bill, nearly round across, gently curved down, a shallow groove along each side; the nostril
    slits at the tip"""
    Q = mirror(P)
    S = V(1 / 0.9, 1, 1)
    d = chain(Q * S, [p * S for p in BILL[0]], BILL[1], 0.002) * 0.9
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    yc = np.interp(z, [0.19, 0.22, 0.25, 0.278, 0.302, 0.3205], [0.2585, 0.2505, 0.2405, 0.2285, 0.2145, 0.2025]).astype(F)
    d = d + groove(y - yc + 0.0008, 0.00025, 0.0003) * sstep(0.196, 0.205, z) * sstep(0.318, 0.31, z)
    nd = length((Q - C.NOSTRIL) * V(1.6, 1.4, 0.5))
    return d + 0.0004 * np.exp(-(nd / 0.0012) ** 2)


def drum(P):
    """the short thick thigh, mostly inside the body"""
    Q = mirror(P)
    return round_cone(Q, V(0.04, 0.2, 0.012), V(0.044, 0.14, 0.008), 0.032, 0.02)


def tarsus(P):
    """the thick scaly tarsus"""
    Q = mirror(P)
    j = round_cone(Q, V(0.044, 0.14, 0.008), C.HMETA + V(0, -0.002, 0.0), 0.0125, 0.0105)
    t = B.flat_cone(Q, C.HMETA + V(0, -0.002, 0.0), C.HPAW + V(0, 0.005, -0.002), 0.0088, 0.0078, 0.85, up=(1, 0, 0))
    pad = ellipsoid(Q, C.HPAW + V(0, -0.0006, 0.002), V(0.0105, 0.0066, 0.012))
    return smin(smin(j, t, 0.006), pad, 0.005)


C.trunk, C.neck, C.head, C.beak, C.drum, C.tarsus = trunk, neck, head, beak, drum, tarsus
C.comb = C.wattles = lambda P: np.full(len(P), 1.0, F)
C.arm = lambda P: np.full(len(P), 1.0, F)
C.HEAD_BOX = (V(-0.045, 0.185, 0.12), V(0.045, 0.3, 0.33))
C.NECK_BOX = (V(-0.07, 0.2, 0.06), V(0.07, 0.31, 0.2))
C.EYE_BOX = (V(-0.03, 0.262, 0.162), V(0.03, 0.288, 0.19))
C.LEG_BOX = (V(-0.085, -0.002, -0.04), V(0.085, 0.215, 0.08))


def shape(P):
    d = local(P, (-0.12, 0.12, -0.21), (0.12, 0.35, 0.15), trunk)
    d = smin(d, local(P, *C.NECK_BOX, neck), 0.025)
    h = local(P, *C.HEAD_BOX, head)
    ca, li, ba = local_n(P, *C.EYE_BOX, C.eye_parts, 3)
    h = smin(h, li, 0.002)
    h = smax(h, -ca, 0.0006)
    h = smin(h, ba, 0.0003)
    h = smin(h, local(P, *C.HEAD_BOX, beak), 0.004)
    d = smin(d, h, 0.012)
    lg = smin(local(P, *C.LEG_BOX, drum), local(P, *C.LEG_BOX, tarsus), 0.008)
    ft, cl = local_n(P, *C.LEG_BOX, C.feet, 2)
    lg = smin(lg, smin(ft, cl, 0.0008), 0.004)
    return smin(d, lg, 0.02)


def grid(h):
    lo, hi = C.BOUNDS
    xs = B.axis_steps(0.0, hi[0], [(0.0, 0.1, h * 0.75)], h)
    ys = B.axis_steps(lo[1], hi[1], [(lo[1], 0.018, h * 0.3), (0.018, 0.13, h * 0.6), (0.19, 0.29, h * 0.5)], h)
    zs = B.axis_steps(lo[2], hi[2], [(-0.05, 0.08, h * 0.6), (0.15, 0.33, h * 0.5)], h)
    return xs, ys, zs


C.shape, C.grid = shape, grid


# ---------- skinning: the neck and head run forward, not up ----------
def _spine_u(P):
    z = P[:, 2]
    un = np.interp(z, [0.06, 0.09, 0.128, 0.16, 0.2], [1.5, 2.0, 3.0, 4.0, 4.5]).astype(F)
    k = sstep(0.06, 0.09, z) * sstep(0.2, 0.22, P[:, 1])
    return (1.5 * (1 - k) + un * k).astype(F)


C._spine_u = _spine_u
C.WCFG = dict(C.WCFG, groups=[('body', ['trunk', 'neck']), ('head', ['head', 'bill', 'lids']), ('drum', ['drum']), ('tarsus', ['tarsus']),
                              ('foot', ['toes', 'claws'])], spine_u=_spine_u, head_u=4.35, hipb=(0.16, 0.19, 0.75))
_bt0 = C.bone_tips


def bone_tips(P):
    t = _bt0(P)
    t['tail'] = V(0, 0.3, -0.17)
    return t


C.bone_tips = bone_tips


# ---------- plumage (hen units): hair-like feathers ----------
K = {
    'brown': hexc(0x6A4C32), 'brownHi': hexc(0x86664A), 'dark': hexc(0x2E2016), 'gray': hexc(0x7A6A5A), 'head': hexc(0x5E4A3A),
    'bill': hexc(0xD8C6A6), 'billDk': hexc(0xA8927A), 'nostril': hexc(0x4A3A2E), 'leg': hexc(0xA8988A), 'legDk': hexc(0x7A6C60),
    'claw': hexc(0xC8B8A0), 'lid': hexc(0x3A2C22),
}


def _flow(P, N, R):
    """everything flows back along the body and down the sides, like a shaggy coat"""
    n = len(P)
    fl = np.zeros((n, 3), F)
    side = sat(-N[:, 1] * 0.6 + 0.3)
    fl[:, 1] = -0.25 - 0.7 * side
    fl[:, 2] = -1.0
    dr = R['drum']
    fl[:, 1] = fl[:, 1] * (1 - dr) - dr
    return fl / np.maximum(np.linalg.norm(fl, axis=1, keepdims=True), 1e-9)


def _size(P, N, R):
    s = np.full(len(P), 0.011, F)
    hd = np.clip(R['head'] + R['lids'] + R['neck'] * 0.5, 0, 1)
    s = s * (1 - hd) + hd * 0.0045
    return s * (1 - R['drum']) + R['drum'] * 0.008


def _fshape(P):
    """narrow, pointed, long feathers: hair, not scales"""
    n = len(P)
    return np.full(n, 0.45, F), np.full(n, 0.15, F), np.full(n, 1.7, F)


C._flow, C._size, C._fshape = _flow, _size, _fshape


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    n1 = fbm(Pm * 40, 3, 11)
    fid = pl['id']
    relb = np.abs(pl['b']) / np.maximum(pl['w'], 1e-6)
    # warm brown, each hair-feather streaked: a dark edge on each side of a paler shaft, darker at the base
    col = mix(np.tile(K['brown'], (n, 1)), K['brownHi'], (fid - 0.3) * 0.6)
    col = mix(col, K['dark'], sstep(0.55, 0.95, relb) * 0.55 * pl['cov'])
    col = mix(col, K['dark'], sstep(-0.3 * pl['len'], -0.8 * pl['len'], pl['a']) * 0.35 * pl['cov'])
    col = mix(col, K['gray'], sstep(-0.3, -0.85, Nm[:, 1]) * 0.35)
    col = mix(col, K['head'], np.clip(R['head'] + R['lids'], 0, 1) * 0.6)
    col *= (0.92 + 0.16 * n1)[:, None]
    # the pale bill, a little darker toward the base and along the groove, the nostril slits at the tip
    bl = R['bill']
    bcol = mix(np.tile(K['bill'], (n, 1)), K['billDk'], sstep(0.24, 0.195, z) * 0.4)
    bcol = mix(bcol, K['nostril'], sstep(0.0011, 0.0004, np.linalg.norm((Pm - C.NOSTRIL) * V(1.6, 1.4, 0.5), axis=1)))
    col = mix(col, bcol, bl)
    # whisker bristles round the base of the bill: dark streaks pointing forward
    wh = sstep(0.185, 0.19, z) * sstep(0.205, 0.196, z) * np.clip(R['head'], 0, 1) * sstep(0.5, 0.8, np.sin(np.arctan2(y - 0.258, x) * 18) * 0.5 + 0.5)
    col = mix(col, K['dark'], wh * 0.7)
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    sc = B.scutes(Pm, V(0, 1, 0), 0.0045, 41)[1]
    col = mix(col, mix(np.tile(K['leg'], (n, 1)), K['legDk'], sc * 0.5), lg)
    col = mix(col, K['claw'], R['claws'])
    col = mix(col, K['lid'], R['lids'] * 0.8)
    rough = 0.86 + 0.06 * (n1 - 0.5)
    rough = np.where(bl > 0.5, 0.42, rough)
    rough = np.where(lg > 0.5, 0.6, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    h = np.zeros(len(P), F)
    # hair-like feathers: a ridge along each, a step at its tip
    h += B.feather_height(pl, 0.05) * feath
    relb = np.abs(pl['b']) / np.maximum(pl['w'], 1e-6)
    h += 0.00006 * (1 - relb) * pl['cov'] * feath
    h += C._leg_h(P, c, R)
    h -= 0.000012 * sstep(0.5, 1.0, np.sin(Pm[:, 2] / 0.0007)) * R['bill']
    return h


KB = {'down': hexc(0x6E5644), 'downLt': hexc(0x8A7260), 'bill': hexc(0xD0C0A4), 'leg': hexc(0xA89A8C), 'claw': hexc(0xC0B098)}


def paint_baby(P, N, c):
    """the chick: a small fluffy copy, a little grayer brown"""
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    n = len(P)
    dn, tip = B.down(Pm, fl, Nm, 0.0022, 72)
    col = mix(np.tile(KB['down'], (n, 1)), KB['downLt'], tip * 0.4 + sstep(-0.3, -0.8, Nm[:, 1]) * 0.25)
    col *= (0.8 + 0.3 * dn)[:, None]
    col = mix(col, KB['bill'], R['bill'])
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    col = mix(col, KB['leg'], lg)
    col = mix(col, KB['claw'], R['claws'])
    col = mix(col, KB['down'] * 0.6, R['lids'] * 0.7)
    rough = np.where(R['bill'] + lg > 0.5, 0.5, 0.93)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _baby_body(Q):
    """the chick in adult space: the kiwi's own round body, a little rounder, and the neck up to the head"""
    d = ellipsoid(Q, V(0, 0.24, -0.04), V(0.095, 0.098, 0.15))
    return smin(d, round_cone(Q, V(0, 0.262, 0.08), V(0, 0.268, 0.15), 0.045, 0.027), 0.03)


def baby_offset(P, N, c):
    return B.baby_shape(P, N, C._own(c), _baby_body, (V(0.044, 0.1, 0.008), V(0.042, 0.2, 0.01), 0.012, 1.25), V(0.05, 0.27, 0.03), (0.003, 0.004))


C.paint, C.detail, C.paint_baby, C.baby_offset = paint, detail, paint_baby, baby_offset
C.FUR = dict(len=0.03, n=6, lean=0.35, tile=0.0024, babyLen=1.0, babyLean=0.35, shade=0.9, babyOnly=True, quality=80)


def fur(P, N, c):
    return B.down_fur(P, c, C.FUR['len'], ['bill', 'tarsus', 'toes', 'claws', 'lids'],
                      {'head': 0.55, 'neck': 0.85, 'drum': 0.7}, (C.EYE_C, C.EYE_R), seed=72)


C.fur = fur
_meta0 = C.meta


def meta(st):
    m = _meta0(st)
    m['eye'].update({'iris': 0x140E0A, 'irisR': 0.9, 'pupilR': 0.5, 'rim': 0x0A0806, 'babyIris': 0x140E0A, 'babyLidCol': 0x5A4636, 'lid': [0.75, -0.75, 0.12]})
    m['collar'] = {'at': ['neck', 'neck2', 0.5], 'babyAt': 0.6, 'hug': True, 'babyK': 1.6, 'lift': 0.35}
    m.update({'flat': 0x5E4630, 'rim': [0.14, 0.1, 0.08]})
    return m


C.meta = meta
C.stats = lambda P, N, c, col: {'lidCol': 0x3A2C22}
refit.api(globals(), C, KS)
