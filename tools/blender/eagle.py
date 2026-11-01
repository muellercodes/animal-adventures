# Bald eagle, sculpted as a signed distance field around the game's eagle skeleton (bird.py has the shared bird
# parts). Units are meters in game rig space (x left, y up, z forward, ground at y = 0). Made in the rig's bind pose,
# level like the macaw (the flight pose; the game tilts the body up to stand), the wing arm flat to the side under the
# game's feather blades. Dark chocolate brown body, white head and neck, the big hooked yellow bill and cere, a heavy
# brow over the pale yellow eye, feathered thighs and upper legs, bare yellow scaled feet with black talons.
# The eaglet: woolly gray-brown down (fur shells), a dark bill, a rounder body.
# Make it with: VOXEL=0.0025 TRIS=6400 TEX=1024 BLENDER_PY=... python3 tools/blender/make.py eagle
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, loft, frame, fbm, vnoise, worley, length
import bird as B
from bird import local, local_n, mirror, groove, hexc, mix

ID = 'eagle'
BOUNDS = (V(-0.64, -0.001, -0.24), V(0.64, 0.46, 0.33))
PATCHES = [
    (V(0.0, 0.33, 0.17), V(0.06, 0.44, 0.315), 0.0008),        # bill, cere, eye, brow
    (V(0.0, -0.001, -0.04), V(0.13, 0.03, 0.1), 0.0008),        # feet and talons
]
BAKE_DIST = (0.006, 0.018, 0.07)
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
UV_PACK = dict(shape_method='CONCAVE', rotate_method='ANY')

HIPS, TAILB, NECK, HEAD = V(0, 0.24, 0), V(0, 0.262, -0.18), V(0, 0.29, 0.14), V(0, 0.37, 0.2)
THIGH, SHIN, HMETA, HPAW = V(0.05, 0.215, 0.02), V(0.062, 0.155, 0.065), V(0.064, 0.105, 0.015), V(0.064, 0.012, 0.034)
SH, EL, WR, WT = V(0.075, 0.305, 0.07), V(0.235, 0.305, 0.07), V(0.435, 0.305, 0.07), V(0.585, 0.305, 0.07)
EYE_C = V(0.0335, 0.4035, 0.2285)
EYE_R = 0.0088
EYE_DIR = nrm([0.62, 0.05, 0.78])
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_R = 0.0071
MOUTH = V(0.0, 0.372, 0.293)
NOSTRIL = V(0.0085, 0.3935, 0.2585)
FOOT = HPAW + V(0, 0.0, 0.0)
TOES = [dict(a=-34, len=0.042, r=0.0088, r1=0.0066, claw=0.032, clawR=0.0056, clawDrop=0.32, n=2),
        dict(a=3, len=0.052, r=0.009, r1=0.0068, claw=0.034, clawR=0.0058, clawDrop=0.32, n=3),
        dict(a=36, len=0.042, r=0.0088, r1=0.0066, claw=0.031, clawR=0.0055, clawDrop=0.32, n=2),
        dict(a=180, len=0.034, r=0.0094, r1=0.0072, claw=0.038, clawR=0.006, clawDrop=0.34, lift=0.004, n=2)]

# the level body: z, top, yw (height of widest), bottom, half width, exponents
TRUNK = [
    (-0.215, 0.276, 0.267, 0.258, 0.014, 2.0, 2.0),
    (-0.185, 0.29, 0.262, 0.236, 0.045, 2.1, 2.0),
    (-0.13, 0.307, 0.255, 0.198, 0.077, 2.2, 2.1),
    (-0.06, 0.323, 0.248, 0.163, 0.1, 2.3, 2.3),
    (0.0, 0.331, 0.245, 0.149, 0.109, 2.3, 2.4),
    (0.06, 0.333, 0.25, 0.151, 0.106, 2.3, 2.3),
    (0.11, 0.331, 0.262, 0.17, 0.092, 2.2, 2.2),
    (0.148, 0.322, 0.275, 0.205, 0.07, 2.1, 2.1),
    (0.17, 0.31, 0.285, 0.248, 0.04, 2.0, 2.0),
]
# the bill as lofts along z (z, top, yw, bot, half width, exponents): the upper bill deep and narrow, its culmen curving
# down into the hook; the lower bill under it to the cutting edge
UPPER = [
    (0.232, 0.4095, 0.393, 0.381, 0.0146, 2.2, 2.6),
    (0.246, 0.4115, 0.393, 0.3795, 0.014, 2.2, 2.8),
    (0.26, 0.4105, 0.391, 0.378, 0.0126, 2.2, 2.8),
    (0.273, 0.405, 0.387, 0.376, 0.0104, 2.1, 2.6),
    (0.283, 0.396, 0.381, 0.3725, 0.0086, 2.0, 2.4),
    (0.29, 0.386, 0.374, 0.3665, 0.0071, 2.0, 2.2),
    (0.2945, 0.3755, 0.3655, 0.3595, 0.0058, 2.0, 2.0),
    (0.297, 0.3655, 0.358, 0.353, 0.0046, 2.0, 2.0),
    (0.2978, 0.3575, 0.3525, 0.3485, 0.0034, 2.0, 2.0),
]
LOWER = [
    (0.232, 0.381, 0.3735, 0.3635, 0.0104, 2.2, 2.2),
    (0.25, 0.3795, 0.3728, 0.3652, 0.0092, 2.2, 2.2),
    (0.264, 0.3778, 0.3722, 0.3672, 0.0072, 2.1, 2.1),
    (0.275, 0.376, 0.3718, 0.369, 0.005, 2.0, 2.0),
    (0.28, 0.3745, 0.3716, 0.3698, 0.003, 2.0, 2.0),
]
TOMIUM = [(0.23, 0.3815), (0.25, 0.3796), (0.265, 0.378), (0.278, 0.3758), (0.286, 0.3715), (0.292, 0.364), (0.297, 0.352)]
CERE_Z = 0.258


def _interp(tab, z):
    zz = np.array([k[0] for k in tab], F); yy = np.array([k[1] for k in tab], F)
    return np.interp(z, zz, yy).astype(F)


def _tom_y(z):
    return _interp(TOMIUM, z)


def trunk(P):
    Q = mirror(P)
    d = loft(Q, TRUNK)
    d = smin(d, ellipsoid(Q, V(0, 0.232, 0.085), V(0.082, 0.078, 0.075)), 0.04)          # full breast
    d = smin(d, ellipsoid(Q, V(0.068, 0.292, -0.02), V(0.036, 0.04, 0.13)), 0.035)       # side pockets for the folded wings
    d = smin(d, ellipsoid(Q, V(0.0, 0.31, 0.06), V(0.07, 0.03, 0.09)), 0.04)             # broad shoulders (the back)
    return d


def neck(P):
    Q = mirror(P)
    return chain(Q, [V(0, 0.268, 0.112), V(0, 0.322, 0.153), V(0, 0.364, 0.178)], [0.068, 0.056, 0.049], 0.02)


def head(P):
    """long flat-crowned head, full cheeks; the brow ridge is its own part"""
    Q = mirror(P)
    d = ellipsoid(Q, V(0, 0.394, 0.2), V(0.043, 0.04, 0.056))
    d = smin(d, ellipsoid(Q, V(0.012, 0.382, 0.218), V(0.038, 0.033, 0.042)), 0.012)     # cheeks and the gape
    d = smin(d, ellipsoid(Q, V(0, 0.395, 0.235), V(0.026, 0.026, 0.024)), 0.01)          # forehead into the cere
    # flat crown, a little raised hackle of feathers at the nape
    d = smax(d, Q[:, 1] - 0.4285 - 0.012 * sstep(0.21, 0.15, Q[:, 2]), 0.012)
    return d


def brow(P):
    """the heavy bony ridge over the eye (the bald eagle's frown)"""
    Q = mirror(P)
    return chain(Q, [V(0.025, 0.4125, 0.208), V(0.0328, 0.4122, 0.2235), V(0.0335, 0.4105, 0.2385), V(0.0262, 0.4062, 0.2505)], [0.0045, 0.0058, 0.0054, 0.0036], 0.003)


def beak(P):
    """the big hooked upper bill (deep, narrow across) with the cere at its base, and the lower bill"""
    Q = mirror(P)
    up = loft(Q, UPPER)
    lo = loft(Q, LOWER)
    y, z = Q[:, 1], Q[:, 2]
    yt = _tom_y(z)
    d = smin(up, lo, 0.0012)
    d = d + groove(y - yt, 0.0004, 0.0005) * sstep(0.238, 0.246, z) * sstep(0.29, 0.284, z)
    # the cere's front edge: a small step onto the horny bill
    d = d - 0.0007 * sstep(CERE_Z + 0.003, CERE_Z, z) * sstep(0.383, 0.388, y)
    # nostril in the cere
    nd = length((Q - NOSTRIL) * V(1, 1.3, 0.8))
    d = d + 0.0011 * np.exp(-(nd / 0.0019) ** 2)
    return d


def eye_parts(P):
    Q = mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0, -0.0015), V(EYE_R + 0.0022, EYE_R + 0.002, EYE_R + 0.0008))
    ap = np.sqrt(s * s + (u * 1.05) ** 2) - LID_R
    carve = smax(ap, -(g + 0.0012), 0.0007)
    ball = length(D) - EYE_R * 0.92
    return carve, lids, ball


def drum(P):
    """the feathered thighs: thick, shaggy trousers"""
    Q = mirror(P)
    d = round_cone(Q, V(0.048, 0.205, 0.03), V(0.06, 0.112, 0.036), 0.044, 0.03)
    d = smin(d, round_cone(Q, V(0.062, 0.116, 0.034), V(0.064, 0.064, 0.03), 0.026, 0.0165), 0.014)
    # the shaggy hem of the trousers over the top of the bare tarsus
    return smin(d, ellipsoid(Q, V(0.064, 0.072, 0.029), V(0.019, 0.012, 0.02)), 0.008)


def tarsus(P):
    """the bare lower tarsus (scutes in front) down to the foot"""
    Q = mirror(P)
    t = B.flat_cone(Q, V(0.064, 0.074, 0.027), HPAW + V(0, 0.008, -0.001), 0.0118, 0.0118, 0.9, up=(1, 0, 0))
    pad = ellipsoid(Q, HPAW + V(0, -0.0005, 0.002), V(0.016, 0.0095, 0.017))
    return smin(t, pad, 0.006)


def feet(P):
    Q = mirror(P)
    tt, cl, _ = B.toes(Q, FOOT, TOES)
    return tt, cl


def arm(P):
    Q = mirror(P)
    return B.wing_arm(Q, [SH + V(-0.02, -0.006, -0.006), EL, WR, WT], [0.082, 0.078, 0.062, 0.02], [0.022, 0.019, 0.015, 0.006], lead=0.62)


def grid(h):
    lo, hi = BOUNDS
    xs = B.axis_steps(0.0, hi[0], [(0.0, 0.14, h * 0.8), (0.15, 0.64, h * 1.4)], h)
    ys = B.axis_steps(lo[1], hi[1], [(lo[1], 0.035, h * 0.4), (0.035, 0.12, h * 0.7), (0.285, 0.325, h * 0.6), (0.33, 0.44, h * 0.55)], h)
    zs = B.axis_steps(lo[2], hi[2], [(-0.03, 0.1, h * 0.6), (0.17, 0.32, h * 0.55)], h)
    return xs, ys, zs


HEAD_BOX = (V(-0.07, 0.33, 0.13), V(0.07, 0.445, 0.315))
NECK_BOX = (V(-0.08, 0.18, 0.04), V(0.08, 0.43, 0.24))
LEG_BOX = (V(-0.13, -0.002, -0.05), V(0.13, 0.27, 0.11))
ARM_BOX = (V(0.03, 0.27, 0.0), V(0.64, 0.335, 0.13))
EYE_BOX = (V(-0.055, 0.39, 0.21), V(0.055, 0.42, 0.248))


def parts(P):
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    ft, cl = local_n(P, *LEG_BOX, feet, 2)
    return {'trunk': trunk(P), 'neck': local(P, *NECK_BOX, neck), 'head': local(P, *HEAD_BOX, head), 'brow': local(P, *HEAD_BOX, brow),
            'bill': local(P, *HEAD_BOX, beak), 'lids': li, 'ball': ba, 'carve': ca, 'drum': local(P, *LEG_BOX, drum),
            'tarsus': local(P, *LEG_BOX, tarsus), 'toes': ft, 'claws': cl, 'arm': local(mirror(P), *ARM_BOX, arm)}


def shape(P):
    d = local(P, (-0.13, 0.11, -0.24), (0.13, 0.36, 0.2), trunk)
    d = smin(d, local(P, *NECK_BOX, neck), 0.03)
    h = local(P, *HEAD_BOX, head)
    h = smin(h, local(P, *HEAD_BOX, brow), 0.009)
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    h = smin(h, li, 0.004)
    h = smax(h, -ca, 0.001)
    h = smin(h, ba, 0.0006)
    h = smin(h, local(P, *HEAD_BOX, beak), 0.005)
    d = smin(d, h, 0.02)
    lg = smin(local(P, *LEG_BOX, drum), local(P, *LEG_BOX, tarsus), 0.008)
    ft, cl = local_n(P, *LEG_BOX, feet, 2)
    lg = smin(lg, smin(ft, cl, 0.001), 0.005)
    d = smin(d, lg, 0.025)
    d = smin(d, local(mirror(P), *ARM_BOX, arm), 0.016)
    return d


PREVIEW = {
    'side': ((1.7, 0.28, 0.04), (0, 0.22, 0.04), 30),
    'front3q': ((0.9, 0.55, 1.05), (0, 0.24, 0.06), 30),
    'front': ((0.0, 0.32, 1.6), (0, 0.24, 0.0), 30),
    'rear3q': ((-0.8, 0.6, -1.1), (0, 0.24, -0.04), 30),
    'top': ((0.01, 1.8, 0.0), (0, 0.24, 0.0), 30),
    'face': ((0.18, 0.43, 0.42), (0.0, 0.39, 0.25), 24),
    'faceside': ((0.32, 0.4, 0.26), (0.0, 0.385, 0.25), 22),
    'feet': ((0.26, 0.08, 0.32), (0.064, 0.03, 0.04), 26),
}

# ---------- skinning ----------
WEIGHT_SMOOTH = (0, 0)
SPINE = ['tail', 'hips', 'neck', 'head']


def _spine_u(P):
    y, z = P[:, 1], P[:, 2]
    ut = 1.5 + np.clip((z + 0.17) / 0.05, -1, 0)
    un = np.interp(y, [0.25, 0.3, 0.37, 0.45], [1.5, 2.0, 3.0, 4.0]).astype(F)
    yn = y - 0.29 - 0.6 * np.maximum(0, 0.12 - z)
    k = sstep(0.0, 0.03, yn)
    return ut * (1 - k) + un * k


WCFG = dict(groups=[('body', ['trunk', 'neck']), ('head', ['head', 'brow', 'bill', 'lids']), ('drum', ['drum']), ('tarsus', ['tarsus']),
                    ('foot', ['toes', 'claws']), ('arm', ['arm'])],
            bias={'body': 0.002}, spine=SPINE, spine_u=_spine_u, head_u=3.35, knee=(0.14, 0.17), hipb=(0.17, 0.2, 0.75),
            ankle_d=(0.112, 0.098), ankle=(0.085, 0.105), pad=(0.026, 0.012), toe_up=(0.012, 0.024), arm=(SH, EL, WR, WT), arm_root=(0.11, 0.085))


def fix_weights(W, wpos, names, G, weld):
    return B.part_weights(W, wpos, names, parts(wpos.astype(F)), WCFG)


def bone_tips(P):
    t = {'hips': P['neck'], 'tail': TAILB + V(0, 0.0, -0.12), 'neck': P['head'], 'head': MOUTH}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, -0.004, 0.05)) * m
        t['wing' + s] = P['wfore' + s]; t['wfore' + s] = P['whand' + s]; t['whand' + s] = WT * m
    return t


OWN_KEYS = ['trunk', 'neck', 'head', 'brow', 'bill', 'drum', 'tarsus', 'toes', 'claws', 'arm', 'lids']


def _own(c):
    D = np.stack([c[k] for k in OWN_KEYS], 1)
    o = np.argmin(D, 1)
    return {k: (o == i).astype(F) for i, k in enumerate(OWN_KEYS)}


def keep(P):
    Pm = mirror(P)
    R = _own(parts(P))
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    ball = sstep(EYE_R * 0.97, EYE_R * 0.8, de)
    k = 0.45 * R['trunk'] + 0.55 * R['neck'] + 0.76 * R['head'] + 0.8 * R['brow'] + 0.84 * R['bill'] + 0.85 * R['lids']
    k += 0.55 * R['drum'] + 0.7 * R['tarsus'] + 0.8 * (R['toes'] + R['claws']) + 0.2 * R['arm']
    rim = sstep(EYE_R + 0.005, EYE_R + 0.0015, de) * sstep(EYE_R * 0.9, EYE_R * 1.0, de) * 0.85
    return np.maximum(k, rim) * (1 - ball)


# ---------- plumage and skin paint ----------
K = {
    'brown': hexc(0x3A2817), 'brownHi': hexc(0x56402A), 'brownDk': hexc(0x22170D), 'edge': hexc(0x6A5236),
    'white': hexc(0xF4F2EC), 'whiteSh': hexc(0xD6D0C4), 'whiteDk': hexc(0xB8B0A2),
    'bill': hexc(0xF2BE26), 'billHi': hexc(0xF8D660), 'billDk': hexc(0xC8901A), 'cere': hexc(0xF0C030),
    'foot': hexc(0xF0C23C), 'footDk': hexc(0xC8962A), 'talon': hexc(0x141110), 'lid': hexc(0xE8C850), 'lore': hexc(0xE8E2D6),
}


def _hood(Pm, R):
    """the white head and neck: everything above a ragged line around the lower neck"""
    y, z = Pm[:, 1], Pm[:, 2]
    a, b = V(0, 0.268, 0.112), V(0, 0.364, 0.178)
    t, _ = B.seg_t(Pm, a, b)
    rag = 0.12 * (fbm(Pm * V(60, 20, 60), 2, 41) - 0.5) + 0.06 * (vnoise(Pm * 160, 42) - 0.5)
    on = sstep(0.22, 0.32, t + rag) * sstep(0.08, 0.12, z + 0.3 * (y - 0.3))
    hd = np.clip(R['head'] + R['brow'] + R['lids'], 0, 1)
    return np.clip(np.maximum(on * np.clip(R['neck'] + R['trunk'], 0, 1), hd), 0, 1)


def _flow(P, N, R):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    n = len(P)
    fl = np.zeros((n, 3), F)
    side = sat(-N[:, 1] * 0.6 + 0.2)
    fl[:, 1] = -0.2 - 0.5 * side
    fl[:, 2] = -1.0
    breast = sstep(0.05, 0.13, z) * sstep(0.27, 0.2, y)
    fl[:, 1] -= 1.5 * breast
    fl[:, 2] += 0.6 * breast
    nk = np.maximum(R['neck'], R['head'] + R['lids'] + R['brow'])
    hd = sstep(0.37, 0.39, y) * nk
    fl[:, 1] = fl[:, 1] * (1 - nk) + nk * (-1.0 * (1 - hd) - 0.25 * hd)
    fl[:, 2] = fl[:, 2] * (1 - nk) + nk * (-0.45 * (1 - hd) - 1.0 * hd)
    dr = R['drum']
    fl[:, 1] = fl[:, 1] * (1 - dr) - dr
    fl[:, 2] = fl[:, 2] * (1 - dr) - 0.35 * dr
    ar = R['arm']
    fl[:, 0] = fl[:, 0] * (1 - ar) + 0.3 * ar
    fl[:, 1] *= (1 - ar)
    fl[:, 2] = fl[:, 2] * (1 - ar) - ar
    return fl / np.maximum(np.linalg.norm(fl, axis=1, keepdims=True), 1e-9)


def _size(P, N, R):
    y = P[:, 1]
    s = np.full(len(P), 0.022, F)
    s = s + 0.006 * sstep(0.9, 0.3, np.abs(N[:, 1])) * sstep(-0.12, -0.06, P[:, 2]) * sstep(0.1, 0.03, P[:, 2])
    s = s - 0.004 * sstep(-0.3, -0.8, N[:, 1])
    nk = R['neck']
    s = s * (1 - nk) + nk * np.interp(y, [0.27, 0.33, 0.37], [0.016, 0.011, 0.008]).astype(F)
    hd = R['head'] + R['lids'] + R['brow']
    s = s * (1 - hd) + hd * 0.0055
    s = s * (1 - R['drum']) + R['drum'] * 0.01
    s = s * (1 - R['arm']) + R['arm'] * 0.012
    return s


def _fshape(P):
    n = len(P)
    return np.ones(n, F), np.ones(n, F) * 0.8, np.ones(n, F) * 1.05


_pcache = {}


def _plum(P, N, c):
    key = (len(P), float(P[:7].sum()))
    if key not in _pcache:
        R = _own(c)
        Pm = mirror(P)
        Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
        fl = _flow(Pm, Nm, R)
        sz = _size(Pm, Nm, R)
        feath = np.clip(R['trunk'] + R['neck'] + R['head'] + R['brow'] + R['drum'] + R['arm'], 0, 1)
        pl = B.plumage(Pm, Nm, fl, sz, _fshape, seed=17)
        _pcache.clear()
        _pcache[key] = (R, Pm, Nm, fl, sz, feath, pl)
    return _pcache[key]


def _feet_col(Pm, R, n):
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    sc = B.scutes(Pm, nrm([0, -1, 0.15]), 0.004, 43)[1]
    rh, rg = B.reticulate(Pm, 0.0018, 44)
    c = mix(np.tile(K['foot'], (n, 1)), K['footDk'], sc * 0.35 + rg * 0.3)
    return c, lg


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    n1 = fbm(Pm * 30, 3, 11)
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    relb = np.abs(pl['b']) / np.maximum(pl['w'], 1e-6)
    # dark chocolate brown, each feather a shade different, the tips a touch paler and warmer (worn edges)
    col = mix(np.tile(K['brown'], (n, 1)), K['brownHi'], (fid - 0.4) * 0.5 + sstep(0.2, 0.9, Nm[:, 1]) * 0.15)
    # (not on the midline, where the mirrored feathers meet and would draw a parting line)
    mid = sstep(0.001, 0.005, np.abs(x)) * pl['cov']
    col = mix(col, K['brownDk'], sstep(0.45 * cfa, 1.4 * cfa, -pl['a']) * 0.4 * mid)
    col = mix(col, K['edge'], sstep(0.25 * cfa, 0.05 * cfa, -pl['a']) * sstep(0.2, 0.9, relb) * 0.25 * mid)
    col *= (0.94 + 0.12 * n1)[:, None]
    # the white head and neck, faintly shaded where the feathers overlap
    hood = _hood(Pm, R)
    wcol = mix(np.tile(K['white'], (n, 1)), K['whiteSh'], sstep(0.35 * cfa, 1.2 * cfa, -pl['a']) * 0.35 * mid + sstep(-0.2, -0.8, Nm[:, 1]) * 0.25)
    wcol = mix(wcol, K['whiteDk'], sstep(0.6, 0.85, fbm(Pm * 90, 2, 45)) * 0.15)
    col = mix(col, wcol, hood)
    # white under the tail (the undertail coverts)
    ut = sstep(-0.16, -0.2, z) * sstep(0.1, -0.5, Nm[:, 1]) * R['trunk']
    col = mix(col, wcol, ut * 0.9)
    # the bill and cere: bright yellow, paler on the ridge, a darker cutting edge; the cere a little more orange
    bl = R['bill']
    bcol = mix(np.tile(K['bill'], (n, 1)), K['billHi'], sstep(0.2, 0.9, Nm[:, 1]) * 0.35)
    bcol = mix(bcol, K['billDk'], sstep(0.0015, 0.0, np.abs(y - _tom_y(z))) * 0.6 * sstep(0.25, 0.26, z))
    bcol = mix(bcol, K['cere'], sstep(CERE_Z + 0.002, CERE_Z - 0.002, z) * sstep(0.38, 0.386, y))
    col = mix(col, bcol, bl)
    # pale yellow skin around the eye (the eyelid ring) and the bare lores in front of it
    col = mix(col, K['lid'], R['lids'] * sstep(EYE_R + 0.0024, EYE_R + 0.0008, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.8)
    # legs: feathered brown thighs; bare yellow scaled tarsus and toes; black talons
    fc, lg = _feet_col(Pm, R, n)
    col = mix(col, fc, lg)
    col = mix(col, K['talon'], R['claws'])
    rough = 0.72 + 0.06 * (n1 - 0.5) - 0.06 * sstep(0.1, 0.8, Nm[:, 1]) * feath
    rough = np.where(bl > 0.5, 0.32, rough)
    rough = np.where(lg > 0.5, 0.5, rough)
    rough = np.where(R['claws'] > 0.5, 0.28, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _leg_h(P, c, R):
    Pm = mirror(P)
    h = np.zeros(len(P), F)
    sh, sg = B.scutes(Pm, nrm([0, -1, 0.15]), 0.004, 43)
    rh, rg = B.reticulate(Pm, 0.0018, 44)
    front = sstep(-0.2, 0.4, np.where(R['tarsus'] > 0.5, 1.0, 0.0))
    h += R['tarsus'] * (0.00012 * sh - 0.0001 * sg) * front
    h += np.clip(R['toes'], 0, 1) * (0.0001 * rh - 0.0001 * rg)
    h -= 0.00003 * sstep(0.5, 1.0, np.sin(np.hypot(Pm[:, 1], Pm[:, 2]) / 0.0008)) * R['claws']
    return h


def detail(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    h = np.zeros(len(P), F)
    hd = np.clip(R['head'] + R['lids'] + R['brow'], 0, 1)
    h += B.feather_height(pl, 0.035) * feath * (1 - 0.4 * hd) * sstep(0.001, 0.005, np.abs(x))
    big = sstep(0.01, 0.02, pl['c']) * pl['cov'] * feath
    bar = np.sin(2 * np.pi * (pl['a'] * 0.7 + np.abs(pl['b'])) / 0.0013)
    h -= 0.00002 * sstep(0.3, 1.0, bar) * big
    # bill: growth lines along the upper bill; the cere a little pebbled
    h -= 0.00002 * sstep(0.5, 1.0, np.sin(np.hypot(y - 0.34, z - 0.25) / 0.0008)) * R['bill'] * sstep(CERE_Z, CERE_Z + 0.004, z)
    f1, _ = worley(Pm / 0.0007, 63)
    h -= 0.000015 * sstep(0.3, 0.0, f1) * R['bill'] * sstep(CERE_Z + 0.002, CERE_Z - 0.002, z)
    h += _leg_h(P, c, R)
    return h


def finish(C, ao, valid):
    return B.finish_ao(C, ao, 0.3)


# ---------- the eaglet: woolly gray-brown down (fur shells), a dark bill, pale feet ----------
KB = {'down': hexc(0x7C7268), 'downLt': hexc(0x9A9086), 'head': hexc(0x8C8278), 'bill': hexc(0x2E2A26), 'gape': hexc(0xE0C890), 'foot': hexc(0xE0CC90), 'talon': hexc(0x3A3430)}


def paint_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    dn, tip = B.down(Pm, fl, Nm, 0.0028, 81)
    col = mix(np.tile(KB['down'], (n, 1)), KB['downLt'], tip * 0.4 + sstep(-0.2, -0.8, Nm[:, 1]) * 0.25)
    col = mix(col, KB['head'], np.clip(R['head'] + R['brow'], 0, 1) * 0.5)
    col *= (0.82 + 0.3 * dn)[:, None]
    bl = R['bill']
    bcol = mix(np.tile(KB['bill'], (n, 1)), KB['gape'], sstep(CERE_Z + 0.002, CERE_Z - 0.003, z) * 0.6)
    col = mix(col, bcol, bl)
    fc, lg = _feet_col(Pm, R, n)
    col = mix(col, mix(fc, KB['foot'], np.full(n, 0.6, F)), lg)
    col = mix(col, KB['talon'], R['claws'])
    col = mix(col, KB['down'] * 0.7, R['lids'] * 0.7)
    rough = np.where(bl + lg > 0.5, 0.45, 0.93)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _baby_body(Q):
    """a round woolly egg of a body and a thick neck up to the head"""
    d = ellipsoid(Q, V(0, 0.235, 0.0), V(0.1, 0.095, 0.15))
    return smin(d, round_cone(Q, V(0, 0.27, 0.1), V(0, 0.37, 0.18), 0.07, 0.052), 0.04)


def baby_offset(P, N, c):
    return B.baby_shape(P, N, _own(c), _baby_body, (V(0.064, 0.07, 0.03), V(0.05, 0.21, 0.03), 0.016, 1.2), SH + V(-0.035, -0.02, -0.01), (0.004, 0.006))


def detail_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, fl, Nm, 0.0028, 81)
    return 0.0004 * (dn - 0.5) * feath + _leg_h(P, c, R)


# the eaglet's woolly down as fur shells (babyOnly: the adult keeps its feathers)
FUR = dict(len=0.05, n=6, lean=0.3, tile=0.0034, babyLen=1.0, babyLean=0.3, shade=0.85, babyOnly=True, quality=80)


def fur(P, N, c):
    return B.down_fur(P, c, FUR['len'], ['bill', 'tarsus', 'toes', 'claws', 'lids'],
                      {'head': 0.7, 'brow': 0.4, 'neck': 0.85, 'arm': 0.8, 'drum': 0.8}, (EYE_C, EYE_R), seed=81)


def flow(P, N):
    return B.down_flow(sys.modules[__name__], P, N)


# ---------- feather blades (atlas cells, same order as the game's feather cells) ----------
def _cells():
    F_ = B.FeatherCell
    br, brD, brL, wh, whS = hexc(0x382616), hexc(0x1C130B), hexc(0x5A4330), hexc(0xF2F0EA), hexc(0xD8D2C6)

    def prim(s, t, side):
        c = mix(np.tile(brD, (len(s), 1)), br, sstep(0.0, 0.6, s) * 0.4)
        return mix(c, hexc(0x120C07), sstep(0.55, 1.0, t) * 0.5)

    def sec(s, t, side):
        c = mix(np.tile(br, (len(s), 1)), brD, sstep(0.2, -0.6, s) * 0.5)
        return mix(c, brD, sstep(0.75, 1.0, t) * 0.3)

    def cov(s, t, side):
        c = mix(np.tile(br, (len(s), 1)), brL, sstep(0.55, 1.0, np.abs(s)) * 0.35)
        return mix(c, brL, sstep(0.85, 1.0, t) * 0.35)

    def tail(s, t, side):
        return mix(np.tile(wh, (len(s), 1)), whS, sstep(0.6, 1.0, np.abs(s)) * 0.35 + sstep(0.3, 0.0, t) * 0.25)

    return [F_('finger', prim, w=0.6, outer=0.55, tip=0.42, shaft=hexc(0x2A1C10), notch=0.38),
            F_('round', sec, w=0.74, outer=0.8, tip=0.5, shaft=hexc(0x2A1C10)),
            F_('round', cov, w=0.8, outer=0.85, tip=0.8, shaft=hexc(0x2A1C10)),
            F_('round', cov, w=0.8, outer=0.9, tip=1.1, shaft=hexc(0x2A1C10)),
            F_('round', sec, w=0.76, outer=0.85, tip=0.7, shaft=hexc(0x2A1C10)),
            F_('round', tail, w=0.72, outer=0.9, tip=0.7, shaft=hexc(0xC8C2B6)),
            F_('round', tail, w=0.78, outer=0.9, tip=0.9, shaft=hexc(0xC8C2B6)),
            F_('round', cov, w=0.8, outer=0.9, tip=0.8, shaft=hexc(0x2A1C10))]


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = hexc(0x8C8278), hexc(0x6E655C)
    def dn(s, t, side):
        return mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 8


FEATHER_ATLAS = {'size': (1024, 512), 'out': (512, 256), 'cells': _cells, 'baby': _baby_cells, 'quality': (74, 80, 72),
                 'alpha_quality': 50}


def extra_maps(X):
    B.extra_maps(sys.modules[__name__], X)


def export_extra(meta, out_dir, work):
    B.export_extra(sys.modules[__name__], meta, out_dir, work)


MAP_QUALITY = (76, 70)
BABY_MAPS = {'size': 512, 'quality': (74, 72)}


def stats(P, N, c, col):
    return {'lidCol': 0xE6E0D0}


def meta(st):
    r = EYE_R
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [0.58, -0.84, 0.12],
                'iris': 0xF4E8A4, 'irisR': 0.92, 'pupilR': 0.34, 'rim': 0x8A7A40, 'lidCol': st['lidCol'], 'babyIris': 0x2A2018, 'babyLidCol': 0x6E655C},
        'collar': {'at': ['neck', 'head', 0.3], 'w': 0.8, 'babyAt': 0.35, 'hug': True, 'babyK': 1.6, 'lift': 0.35},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.1, 0.08, 0.06], 'flat': 0x3A2818,
    }
