# Rhode Island Red hen, sculpted as a signed distance field around the game's chicken skeleton (bird.py has the
# shared bird parts). Units are meters in game rig space (x left, y up, z forward, ground at y = 0). Made in the
# rig's bind pose: the wing arm sticks out flat to the side under the game's feather blades.
# Make it with: TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py chicken
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, loft, frame, fbm, vnoise, worley, length
import bird as B
from bird import local, local_n, mirror, groove, hexc, mix

ID = 'chicken'
BOUNDS = (V(-0.32, -0.001, -0.19), V(0.32, 0.45, 0.2))
PATCHES = [
    (V(0.0, 0.37, 0.1), V(0.03, 0.448, 0.198), 0.0006),        # beak, eye, comb, wattles
    (V(0.0, -0.001, -0.04), V(0.1, 0.016, 0.075), 0.0006),     # foot
]
BAKE_DIST = (0.005, 0.014, 0.05)
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
UV_PACK = dict(shape_method='CONCAVE', rotate_method='ANY')

# ---------- landmarks (left side; bone pivots from the rig) ----------
HIPS, TAILB, NECK, NECK2, HEAD, COMB = V(0, 0.24, 0), V(0, 0.29, -0.12), V(0, 0.29, 0.085), V(0, 0.35, 0.11), V(0, 0.4, 0.125), V(0, 0.42, 0.15)
THIGH, SHIN, HMETA, HPAW = V(0.037, 0.215, -0.01), V(0.042, 0.165, 0.03), V(0.042, 0.1, -0.008), V(0.042, 0.007, 0.004)
SH, EL, WR, WT = V(0.06, 0.29, 0.05), V(0.1336, 0.29, 0.05), V(0.2256, 0.29, 0.05), V(0.2946, 0.29, 0.05)
EYE_C = V(0.0148, 0.4135, 0.1355)
EYE_R = 0.0052
EYE_DIR = nrm([0.94, 0.12, 0.32])
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_R = 0.0041
MOUTH = V(0.0, 0.3912, 0.1825)
NOSTRIL = V(0.0042, 0.4045, 0.1585)
EARLOBE = V(0.0155, 0.3985, 0.1215)
FOOT = HPAW + V(0, 0.0, 0.002)
TOES = [dict(a=-30, len=0.044, r=0.0042, r1=0.0027, claw=0.0085, n=3), dict(a=0, len=0.054, r=0.0046, r1=0.0029, claw=0.009, n=4),
        dict(a=30, len=0.042, r=0.0042, r1=0.0027, claw=0.0085, n=4), dict(a=180, len=0.02, r=0.0036, r1=0.0024, claw=0.0072, lift=0.004, n=2, hind=True)]

# trunk: z, top, yw (height of widest), bottom, half width, exponent above, below
TRUNK = [
    (-0.152, 0.322, 0.304, 0.288, 0.016, 2.0, 2.0),
    (-0.132, 0.334, 0.294, 0.246, 0.042, 2.1, 2.0),
    (-0.100, 0.337, 0.280, 0.206, 0.062, 2.3, 2.2),
    (-0.060, 0.334, 0.266, 0.175, 0.073, 2.4, 2.3),
    (-0.010, 0.327, 0.257, 0.161, 0.077, 2.4, 2.4),
    (0.040, 0.319, 0.255, 0.163, 0.073, 2.4, 2.3),
    (0.078, 0.311, 0.258, 0.178, 0.063, 2.3, 2.2),
    (0.104, 0.306, 0.265, 0.203, 0.047, 2.2, 2.1),
    (0.121, 0.301, 0.272, 0.236, 0.026, 2.1, 2.0),
    (0.129, 0.296, 0.278, 0.262, 0.010, 2.0, 2.0),
]
# beak (both mandibles): z, top, yw, bottom, half width, exponents
BEAK = [
    (0.146, 0.4145, 0.4015, 0.3885, 0.0088, 2.3, 2.2),
    (0.156, 0.4108, 0.3995, 0.3895, 0.0076, 2.3, 2.2),
    (0.165, 0.4058, 0.3972, 0.3906, 0.006, 2.3, 2.2),
    (0.173, 0.4002, 0.3950, 0.3912, 0.0043, 2.2, 2.1),
    (0.179, 0.3958, 0.3930, 0.3908, 0.0027, 2.1, 2.0),
    (0.1835, 0.3922, 0.3908, 0.3892, 0.001, 2.0, 2.0),
]
TOMIUM = [(0.15, 0.3962), (0.16, 0.3952), (0.168, 0.3942), (0.176, 0.3928), (0.183, 0.3912)]
# single comb (hen: small): points along its top edge (z, height above the base line)
COMB_PTS = [(0.161, -0.004), (0.158, 0.0015), (0.154, 0.007), (0.149, 0.0125), (0.144, 0.0085), (0.139, 0.0155), (0.133, 0.0105), (0.127, 0.0165), (0.121, 0.0105),
            (0.115, 0.0145), (0.109, 0.008), (0.104, 0.0105), (0.099, 0.003), (0.096, -0.004)]


def _interp(tab, z):
    zz = np.array([k[0] for k in tab], F); yy = np.array([k[1] for k in tab], F)
    o = np.argsort(zz)
    return np.interp(z, zz[o], yy[o]).astype(F)


def _tom_y(z):
    return _interp(TOMIUM, z)


# ---------- body ----------
def trunk(P):
    Q = mirror(P)
    d = loft(Q, TRUNK)
    # full round breast
    d = smin(d, ellipsoid(Q, V(0, 0.232, 0.058), V(0.066, 0.07, 0.064)), 0.03)
    # fluffy cushion under the tail and the saddle rising into it
    d = smin(d, ellipsoid(Q, V(0, 0.268, -0.122), V(0.046, 0.046, 0.042)), 0.025)
    d = smin(d, ellipsoid(Q, V(0, 0.322, -0.098), V(0.042, 0.026, 0.058)), 0.025)
    # side pockets for the folded wing
    d = smin(d, ellipsoid(Q, V(0.05, 0.255, -0.03), V(0.02, 0.03, 0.09)), 0.03)
    # soft fluffy thighs and belly between the legs
    d = smin(d, ellipsoid(Q, V(0, 0.178, -0.025), V(0.055, 0.025, 0.07)), 0.03)
    return d


def neck(P):
    Q = mirror(P)
    d = chain(Q, [V(0, 0.282, 0.076), V(0, 0.33, 0.098), V(0, 0.372, 0.112), V(0, 0.398, 0.12)], [0.046, 0.031, 0.024, 0.021], 0.012)
    # hackles: the neck feathers flare over the shoulders like a cape
    d = smin(d, ellipsoid(Q, V(0, 0.302, 0.062), V(0.052, 0.04, 0.05)), 0.02)
    return d


def head(P):
    Q = mirror(P)
    d = ellipsoid(Q, V(0, 0.4105, 0.127), V(0.0168, 0.018, 0.024))
    d = smin(d, ellipsoid(Q, V(0, 0.4065, 0.1445), V(0.0138, 0.0142, 0.015)), 0.006)   # face toward the beak
    d = smin(d, ellipsoid(Q, V(0, 0.4045, 0.112), V(0.0158, 0.019, 0.016)), 0.008)    # nape
    d = smin(d, ellipsoid(Q, V(0, 0.3905, 0.142), V(0.0095, 0.0085, 0.016)), 0.006)   # throat under the beak
    # earlobe: a small flat oval
    el = frame(Q, EARLOBE, nrm([1, -0.1, -0.15]), (0, 1, 0))
    q = np.sqrt((el[:, 0] / 0.0042) ** 2 + (el[:, 1] / 0.0058) ** 2)
    d = d - 0.0006 * sstep(1.0, 0.6, q) * sstep(0.006, 0.0, np.abs(el[:, 2]))
    return d


def beak(P):
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    d = loft(Q, BEAK)
    yt = _tom_y(z)
    d = d + groove(y - yt, 0.0004, 0.0006) * sstep(0.15, 0.156, z)
    d = d + 0.0003 * sstep(yt - 0.0002, yt - 0.0018, y) * sstep(yt - 0.006, yt - 0.003, y) * sstep(0.152, 0.16, z)
    # nostril slit under a small flap (operculum)
    nl = frame(Q, NOSTRIL, nrm([0, -0.35, 1]), (0.25, 1, 0))
    nq = np.sqrt((nl[:, 0] / 0.0008) ** 2 + (nl[:, 2] / 0.0028) ** 2)
    d = d + 0.0006 * sstep(1.0, 0.5, nq) * sstep(0.003, 0.0, np.abs(nl[:, 1]))
    # culmen ridge
    d = d - 0.00035 * sstep(0.003, 0.0, x) * sstep(yt + 0.003, yt + 0.008, y)
    return d


def comb(P):
    """single comb: a thin serrated blade standing on the crown, from above the nostrils back over the head"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    base = 0.4105 + 0.018 * np.sqrt(np.maximum(0, 1 - ((z - 0.127) / 0.027) ** 2)) - 0.0022
    h = _interp(COMB_PTS, z)
    top = base + h
    th = 0.0021 * (1 - 0.5 * sat((y - base) / 0.018)) + 0.0006
    d = np.maximum(np.abs(x) - th, y - top)
    d = np.maximum(d, base - 0.006 - y)
    d = smax(d, np.maximum(0.097 - z, z - 0.16), 0.002)
    return d * 0.8


def wattles(P):
    Q = mirror(P)
    d = ellipsoid(Q, V(0.0042, 0.3785, 0.152), V(0.0042, 0.0088, 0.0058))
    return smin(d, ellipsoid(Q, V(0.0035, 0.3855, 0.156), V(0.0035, 0.004, 0.0045)), 0.002)


def eye_parts(P):
    Q = mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0, -0.0008), V(EYE_R + 0.0026, EYE_R + 0.0026, EYE_R + 0.0012))
    ap = np.sqrt(s * s + u * u) - LID_R
    carve = smax(ap, -(g + 0.001), 0.0006)
    ball = length(D) - EYE_R * 0.92
    return carve, lids, ball


# ---------- legs ----------
def drum(P):
    """the feathered drumstick (fluffy thigh feathers) down to the hock"""
    Q = mirror(P)
    d = round_cone(Q, V(0.04, 0.2, 0.012), V(0.042, 0.122, 0.008), 0.03, 0.0125)
    return smin(d, ellipsoid(Q, V(0.044, 0.168, 0.012), V(0.03, 0.04, 0.034)), 0.012)


def tarsus(P):
    Q = mirror(P)
    j = round_cone(Q, V(0.042, 0.125, 0.004), HMETA + V(0, -0.002, 0.0), 0.0072, 0.0068)              # hock
    t = B.flat_cone(Q, HMETA + V(0, -0.002, 0.0), HPAW + V(0, 0.004, -0.002), 0.0058, 0.0052, 0.8, up=(1, 0, 0))
    pad = ellipsoid(Q, HPAW + V(0, -0.0006, 0.001), V(0.0072, 0.0052, 0.0082))
    spur = round_cone(Q, V(0.042, 0.034, -0.009), V(0.042, 0.032, -0.0125), 0.0018, 0.0009)               # a hen's tiny spur
    return smin(smin(smin(j, t, 0.005), pad, 0.004), spur, 0.0015)


def feet(P):
    Q = mirror(P)
    tt, cl, _ = B.toes(Q, FOOT, [t for t in TOES if not t.get('hind')])
    ht, hc, _ = B.toes(Q, HPAW + V(0, 0.003, -0.005), [t for t in TOES if t.get('hind')], ground=0.0)
    return np.minimum(tt, ht), np.minimum(cl, hc)


def arm(P):
    Q = mirror(P)
    return B.wing_arm(Q, [SH + V(-0.012, -0.004, -0.004), EL, WR, WT], [0.028, 0.026, 0.02, 0.007], [0.0085, 0.0072, 0.0056, 0.0024], lead=0.62)


# ---------- assembly ----------
def grid(h):
    """rectilinear sculpt grid: h over the body, finer near the ground (toes, claws), through the wing arm and the head"""
    lo, hi = BOUNDS
    xs = B.axis_steps(0.0, hi[0], [(0.0, 0.1, h * 0.75), (0.11, 0.33, h * 1.25)], h)
    ys = B.axis_steps(lo[1], hi[1], [(lo[1], 0.018, h * 0.3), (0.018, 0.12, h * 0.6), (0.278, 0.302, h * 0.4), (0.37, 0.448, h * 0.5)], h)
    zs = B.axis_steps(lo[2], hi[2], [(-0.05, 0.08, h * 0.6), (0.09, 0.2, h * 0.5)], h)
    return xs, ys, zs


HEAD_BOX = (V(-0.04, 0.36, 0.085), V(0.04, 0.448, 0.198))
LEG_BOX = (V(-0.085, -0.002, -0.04), V(0.085, 0.215, 0.08))
ARM_BOX = (V(0.02, 0.27, 0.02), V(0.335, 0.31, 0.08))
EYE_BOX = (V(-0.03, 0.4, 0.122), V(0.03, 0.428, 0.15))
NECK_BOX = (V(-0.07, 0.24, 0.0), V(0.07, 0.42, 0.15))


def parts(P):
    """named component distances (for paint masks and weights)"""
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    ft, cl = local_n(P, *LEG_BOX, feet, 2)
    return {'trunk': trunk(P), 'neck': local(P, *NECK_BOX, neck), 'head': local(P, *HEAD_BOX, head), 'bill': local(P, *HEAD_BOX, beak),
            'comb': local(P, *HEAD_BOX, comb), 'wattle': local(P, *HEAD_BOX, wattles), 'lids': li, 'ball': ba, 'carve': ca,
            'drum': local(P, *LEG_BOX, drum), 'tarsus': local(P, *LEG_BOX, tarsus), 'toes': ft, 'claws': cl, 'arm': local(mirror(P), *ARM_BOX, arm)}


def shape(P):
    d = local(P, (-0.11, 0.14, -0.19), (0.11, 0.36, 0.14), trunk)
    d = smin(d, local(P, *NECK_BOX, neck), 0.02)
    h = local(P, *HEAD_BOX, head)
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    h = smin(h, li, 0.003)
    h = smax(h, -ca, 0.0008)
    h = smin(h, ba, 0.0004)
    h = smin(h, local(P, *HEAD_BOX, beak), 0.003)
    h = smin(h, local(P, *HEAD_BOX, comb), 0.0025)
    h = smin(h, local(P, *HEAD_BOX, wattles), 0.003)
    d = smin(d, h, 0.01)
    lg = smin(local(P, *LEG_BOX, drum), local(P, *LEG_BOX, tarsus), 0.007)
    ft, cl = local_n(P, *LEG_BOX, feet, 2)
    f = smin(ft, cl, 0.0008)
    lg = smin(lg, f, 0.004)
    d = smin(d, lg, 0.014)
    d = smin(d, local(mirror(P), *ARM_BOX, arm), 0.01)
    return d


# ---------- skinning ----------
WEIGHT_SMOOTH = (0, 0)
SPINE = ['tail', 'hips', 'neck', 'neck2', 'head']


def _spine_u(P):
    y, z = P[:, 1], P[:, 2]
    ut = 1.5 + np.clip((z + 0.112) / 0.04, -1, 0)
    un = np.interp(y, [0.25, 0.292, 0.35, 0.398, 0.45], [1.5, 2.0, 3.0, 4.0, 5.0]).astype(F)
    yn = y - 0.29 - 0.7 * np.maximum(0, 0.075 - z)
    k = sstep(0.0, 0.02, yn)
    return ut * (1 - k) + un * k


WCFG = dict(groups=[('body', ['trunk', 'neck']), ('head', ['head', 'bill', 'lids']), ('comb', ['comb', 'wattle'], 'comb'), ('drum', ['drum']),
                    ('tarsus', ['tarsus']), ('foot', ['toes', 'claws']), ('arm', ['arm'])],
            bias={'body': 0.0015}, spine=SPINE, spine_u=_spine_u, head_u=4.35, knee=(0.155, 0.175), hipb=(0.17, 0.195, 0.75),
            ankle_d=(0.118, 0.106), ankle=(0.092, 0.108), pad=(0.016, 0.006), toe_up=(0.009, 0.018), arm=(SH, EL, WR, WT), arm_root=(0.078, 0.058))


def fix_weights(W, wpos, names, G, weld):
    """weights from the sculpt's own parts (see bird.part_weights); the comb and wattles ride on the comb bone, which
    the game shrinks away for chicks"""
    return B.part_weights(W, wpos, names, parts(wpos.astype(F)), WCFG)


def bone_tips(P):
    t = {'hips': P['neck'], 'tail': TAILB + V(0, 0.04, -0.05), 'neck': P['neck2'], 'neck2': P['head'], 'head': MOUTH, 'comb': COMB + V(0, 0.01, -0.03)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, -0.004, 0.05)) * m
        t['wing' + s] = P['wfore' + s]; t['wfore' + s] = P['whand' + s]; t['whand' + s] = WT * m
    return t


OWN_KEYS = ['trunk', 'neck', 'head', 'bill', 'comb', 'wattle', 'drum', 'tarsus', 'toes', 'claws', 'arm', 'lids']


def _own(c):
    D = np.stack([c[k] for k in OWN_KEYS], 1)
    o = np.argmin(D, 1)
    return {k: (o == i).astype(F) for i, k in enumerate(OWN_KEYS)}


def keep(P):
    Pm = mirror(P)
    R = _own(parts(P))
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    ball = sstep(EYE_R * 0.97, EYE_R * 0.8, de)
    k = 0.45 * R['trunk'] + 0.55 * R['neck'] + 0.78 * R['head'] + 0.82 * R['bill'] + 0.8 * (R['comb'] + R['wattle']) + 0.85 * R['lids']
    k += 0.6 * R['drum'] + 0.72 * R['tarsus'] + 0.8 * (R['toes'] + R['claws']) + 0.2 * R['arm']
    rim = sstep(EYE_R + 0.004, EYE_R + 0.0012, de) * sstep(EYE_R * 0.9, EYE_R * 1.0, de) * 0.85
    return np.maximum(k, rim) * (1 - ball)


# ---------- plumage and skin paint ----------
K = {
    'red': hexc(0x7A2A12), 'redHi': hexc(0x9A3E1C), 'redDk': hexc(0x4E180A), 'gold': hexc(0xA4501E), 'black': hexc(0x15130F),
    'blackG': hexc(0x1A2418), 'skin': hexc(0xB02320), 'skinDk': hexc(0x7E1410), 'comb': hexc(0xC0241E), 'combHi': hexc(0xD8443A),
    'beak': hexc(0xC8A060), 'beakDk': hexc(0x7A5A32), 'leg': hexc(0xE0B23C), 'legRed': hexc(0xC87A3A), 'claw': hexc(0xB09060),
    'lid': hexc(0xA82018),
}


def _flow(P, N, R):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    n = len(P)
    fl = np.zeros((n, 3), F)
    side = sat(-N[:, 1] * 0.6 + 0.2)
    fl[:, 1] = -0.2 - 0.6 * side
    fl[:, 2] = -1.0
    breast = sstep(0.04, 0.11, z) * sstep(0.29, 0.22, y)
    fl[:, 1] -= 1.6 * breast
    fl[:, 2] += 0.6 * breast
    # the saddle and cushion feathers sweep back and up into the tail
    sad = sstep(-0.06, -0.11, z) * sstep(0.28, 0.31, y)
    fl[:, 1] += 0.5 * sad
    nk = np.maximum(R['neck'], R['head'] + R['lids'])
    hd = sstep(0.39, 0.405, y) * nk
    fl[:, 1] = fl[:, 1] * (1 - nk) + nk * (-1.0 * (1 - hd) - 0.3 * hd)
    fl[:, 2] = fl[:, 2] * (1 - nk) + nk * (-0.35 * (1 - hd) - 1.0 * hd)
    dr = R['drum']
    fl[:, 1] = fl[:, 1] * (1 - dr) - dr
    fl[:, 2] = fl[:, 2] * (1 - dr) - 0.25 * dr
    ar = R['arm']
    fl[:, 0] = fl[:, 0] * (1 - ar) + 0.3 * ar
    fl[:, 1] *= (1 - ar)
    fl[:, 2] = fl[:, 2] * (1 - ar) - ar
    return fl / np.maximum(np.linalg.norm(fl, axis=1, keepdims=True), 1e-9)


def _size(P, N, R):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    s = np.full(len(P), 0.011, F)
    s = s + 0.004 * sstep(0.9, 0.3, np.abs(N[:, 1])) * sstep(-0.12, -0.06, z) * sstep(0.08, 0.02, z)
    s = s + 0.004 * sstep(0.29, 0.31, y) * sstep(0.0, -0.06, z)                            # saddle
    s = s - 0.002 * sstep(-0.3, -0.8, N[:, 1])
    nk = R['neck']
    s = s * (1 - nk) + nk * np.interp(y, [0.29, 0.34, 0.39], [0.011, 0.007, 0.0045]).astype(F)
    hd = R['head'] + R['lids']
    s = s * (1 - hd) + hd * 0.0025
    s = s * (1 - R['drum']) + R['drum'] * 0.007
    s = s * (1 - R['arm']) + R['arm'] * 0.006
    return s


def _fshape(P):
    """hackles and saddle feathers are long and pointed, the body's round"""
    y, z = P[:, 1], P[:, 2]
    hk = sstep(0.3, 0.33, y) * sstep(0.04, 0.07, z)
    sd = sstep(0.29, 0.31, y) * sstep(-0.04, -0.08, z)
    pt = np.maximum(hk, sd)
    n = len(P)
    return (1 - 0.35 * pt).astype(F), (1 - 0.8 * pt).astype(F), (1 + 0.6 * pt).astype(F)


_pcache = {}


def _plum(P, N, c):
    key = (len(P), float(P[:7].sum()))
    if key not in _pcache:
        R = _own(c)
        Pm = mirror(P)
        Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
        fl = _flow(Pm, Nm, R)
        sz = _size(Pm, Nm, R)
        feath = np.clip(R['trunk'] + R['neck'] + R['head'] + R['drum'] + R['arm'], 0, 1)
        pl = B.plumage(Pm, Nm, fl, sz, _fshape, seed=4)
        _pcache.clear()
        _pcache[key] = (R, Pm, Nm, fl, sz, feath, pl)
    return _pcache[key]


def _face(Pm, R):
    """bare red skin around the eye and over the cheek"""
    de = np.linalg.norm((Pm - (EYE_C + V(0, -0.002, 0.004))) * V(0.6, 1.0, 0.85), axis=1)
    return sstep(0.0095, 0.006, de) * np.clip(R['head'] + R['lids'], 0, 1)


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n1 = fbm(Pm * 40, 3, 11)
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    rel = np.abs(pl['b']) / np.maximum(pl['w'], 1e-6)
    tipd = sat(pl['e'] / (0.35 * cfa))
    # deep mahogany red, glossier and brighter on the back and the hackles, the feather tips catch the light
    col = mix(np.tile(K['red'], (len(P), 1)), K['redHi'], sstep(0.1, 0.8, Nm[:, 1]) * 0.45)
    col = mix(col, K['redDk'], sstep(-0.2, -0.8, Nm[:, 1]) * 0.35)
    col = mix(col, K['redHi'], (1 - tipd) * 0.3 * pl['cov'])
    # scalloped look: a darker band just inside every feather's edge and its shaded base under the next one
    col = mix(col, K['redDk'], sstep(0.55, 0.85, (1 - tipd) * 0.3 + rel * 0.7) * 0.35 * pl['cov'])
    col = mix(col, K['redDk'], sstep(0.4 * cfa, 1.2 * cfa, -pl['a']) * 0.3 * pl['cov'])
    # neck hackles: golden red with black centers low on the neck
    hk = np.clip(R['neck'], 0, 1) * sstep(0.31, 0.33, y)
    col = mix(col, K['gold'], hk * sstep(0.34, 0.39, y) * 0.5)
    col = mix(col, K['black'], hk * sstep(0.37, 0.32, y) * sstep(0.45, 0.1, rel) * sstep(0.2 * cfa, 0.9 * cfa, -pl['a']) * 0.75)
    # black tail coverts at the back of the cushion
    col = mix(col, K['blackG'], sstep(-0.118, -0.135, z) * sstep(0.27, 0.3, y) * 0.8)
    col *= ((0.95 + 0.1 * fid) * (0.94 + 0.12 * n1))[:, None]
    # head: small red-brown feathers, bare red face, red earlobe
    face = _face(Pm, R)
    col = mix(col, K['skin'], face)
    col = mix(col, K['skinDk'], face * sstep(0.4, 0.8, fbm(Pm * 900, 2, 31)) * 0.3)
    elo = sstep(1.0, 0.75, np.sqrt(((Pm - EARLOBE) * V(1, 1 / 1.4, 1)) ** 2 @ np.ones(3, F)) / 0.0045)
    col = mix(col, K['skin'], elo * np.clip(R['head'], 0, 1))
    # comb and wattles: red, darker in the grooves, a little lighter on the points
    cw = np.clip(R['comb'] + R['wattle'], 0, 1)
    ccol = mix(np.tile(K['comb'], (len(P), 1)), K['combHi'], sstep(0.4, 0.8, fbm(Pm * 500, 2, 33)) * 0.4)
    col = mix(col, ccol, cw)
    # beak: horn colored, darker at the base on top; legs yellow, reddish at the scale edges; claws pale horn
    bk = R['bill']
    bcol = mix(np.tile(K['beak'], (len(P), 1)), K['beakDk'], sstep(0.168, 0.15, z) * sstep(_tom_y(z) + 0.004, _tom_y(z) + 0.01, y) * 0.6)
    bcol = mix(bcol, K['beakDk'] * 0.5, sstep(0.0011, 0.0003, np.linalg.norm((Pm - NOSTRIL) * V(1.6, 1.4, 0.45), axis=1)))
    col = mix(col, bcol, bk)
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    lcol = mix(np.tile(K['leg'], (len(P), 1)), K['legRed'], sstep(0.4, 0.9, fbm(Pm * 300, 2, 34)) * 0.25)
    col = mix(col, lcol, lg)
    col = mix(col, K['claw'], R['claws'])
    col = mix(col, K['lid'], R['lids'] * 0.8)
    rough = 0.72 + 0.06 * (n1 - 0.5) - 0.15 * sstep(0.1, 0.8, Nm[:, 1]) * feath
    rough = np.where(cw > 0.5, 0.55, rough)
    rough = np.where(bk > 0.5, 0.45, rough)
    rough = np.where(lg > 0.5, 0.5, rough)
    rough = np.where(face > 0.5, 0.55, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _leg_h(P, c, R):
    Pm = mirror(P)
    h = np.zeros(len(P), F)
    fr = sstep(-0.004, 0.003, Pm[:, 2] - (HMETA[2] + (HPAW[2] - HMETA[2]) * sat((HMETA[1] - Pm[:, 1]) / (HMETA[1] - HPAW[1]))))
    sh, sg = B.scutes(Pm, V(0, 1, 0), 0.0035, 41)
    rh, rg = B.reticulate(Pm, 0.0016, 42)
    h += R['tarsus'] * (fr * (0.00012 * sh - 0.0001 * sg) + (1 - fr) * (0.00006 * rh - 0.00006 * rg))
    th, tg = B.scutes(Pm, nrm([0.2, 0, 1]), 0.0026, 43)
    up = sstep(0.0015, 0.0045, Pm[:, 1])
    h += R['toes'] * (up * (0.00008 * th - 0.00008 * tg) + (1 - up) * 0.00006 * rh)
    return h


def detail(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    h = np.zeros(len(P), F)
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    h += B.feather_height(pl, 0.045) * feath * (1 - 0.6 * hd)
    cf = pl['c']
    big = sstep(0.006, 0.012, cf) * pl['cov'] * feath
    bar = np.sin(2 * np.pi * (pl['a'] * 0.7 + np.abs(pl['b'])) / 0.0009)
    h -= 0.000014 * sstep(0.3, 1.0, bar) * big
    h += 0.00004 * sstep(0.0007, 0.0, np.abs(pl['b'])) * sstep(-0.4 * cf, -0.9 * cf, pl['a']) * big
    # bare face: fine wrinkly skin; comb and wattles: bumpy
    f1, _ = worley(Pm / 0.0006, 62)
    face = _face(Pm, R)
    h -= 0.00002 * sstep(0.3, 0.0, f1) * face
    cw = np.clip(R['comb'] + R['wattle'], 0, 1)
    h += 0.00005 * (fbm(Pm * 1200, 2, 63) - 0.5) * cw - 0.00002 * sstep(0.3, 0.0, f1) * cw
    # beak: fine growth lines
    h -= 0.000015 * sstep(0.5, 1.0, np.sin(z / 0.0006)) * R['bill']
    h += _leg_h(P, c, R)
    return h


def finish(C, ao, valid):
    return B.finish_ao(C, ao, 0.3)


# ---------- the chick (baby maps) ----------
KB = {'yel': hexc(0xF0CC58), 'yelPale': hexc(0xF6E49A), 'yelDk': hexc(0xD8A844), 'beak': hexc(0xD8A45E), 'leg': hexc(0xE0A868), 'claw': hexc(0xD0B090)}


def paint_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, fl, Nm, 0.0018, 72)
    col = mix(np.tile(KB['yel'], (len(P), 1)), KB['yelPale'], sstep(-0.2, -0.7, Nm[:, 1]))
    col = mix(col, KB['yelDk'], sstep(0.3, 0.8, Nm[:, 1]) * 0.25 + R['arm'] * 0.3)
    col *= (0.74 + 0.38 * dn + 0.1 * tip)[:, None]
    col = mix(col, KB['beak'], R['bill'])
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    col = mix(col, KB['leg'], lg)
    col = mix(col, KB['claw'], R['claws'])
    col = mix(col, KB['yelDk'] * 0.8, R['lids'] * 0.6)
    rough = np.where(R['bill'] + lg > 0.5, 0.55, 0.93)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _baby_body(Q):
    """the chick in adult space (the game's baby proportions shrink it afterwards): an egg of down, a short thick neck"""
    d = ellipsoid(Q, V(0, 0.25, -0.012), V(0.07, 0.08, 0.106))
    d = smin(d, round_cone(Q, V(0, 0.29, 0.055), V(0, 0.385, 0.112), 0.036, 0.022), 0.035)
    # thin legs coming out of the down (the drumsticks of the hen shrink onto them)
    return d


def baby_offset(P, N, c):
    """per vertex: where the baby's surface lies relative to the adult's (adult space; see bird.baby_shape)"""
    return B.baby_shape(P, N, _own(c), _baby_body, (V(0.042, 0.1, -0.008), V(0.04, 0.22, 0.01), 0.008, 1.25), SH + V(-0.022, -0.012, -0.01), (0.0035, 0.0045))


def detail_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, fl, Nm, 0.0018, 72)
    return 0.00028 * (dn - 0.5) * feath + 0.5 * _leg_h(P, c, R)


# ---------- feather blades (atlas cells, same order as the game's feather cells) ----------
def _vn(s, t, base, edge, k=0.5):
    return mix(np.tile(base, (len(s), 1)), edge, sstep(0.55, 1.0, np.abs(s)) * k)


def _cells():
    F_ = B.FeatherCell
    red, redDk, redHi, blk, blkG = hexc(0x7A2A12), hexc(0x4E180A), hexc(0x9A3E1C), hexc(0x16120E), hexc(0x1C2618)

    def prim(s, t, side):
        c = mix(np.tile(blk, (len(s), 1)), red, sstep(0.05, 0.25, s) * 0.85)
        return mix(c, redDk, sstep(0.3, 0.0, t) * 0.5)

    def sec(s, t, side):
        c = mix(np.tile(blk, (len(s), 1)), red, sstep(-0.1, 0.15, s))
        return mix(c, redDk, sstep(0.3, 0.0, t) * 0.4)

    def gcov(s, t, side):
        return _vn(s, t, red, redHi, 0.5) * (0.92 + 0.12 * t)[:, None]

    def lcov(s, t, side):
        return mix(_vn(s, t, red, redHi, 0.4), redDk, sstep(0.45, 0.0, np.abs(s)) * 0.2)

    def tail(s, t, side):
        c = _vn(s, t, blkG, blk, 0.6)
        return mix(c, redDk, sstep(0.25, 0.0, t) * 0.7)

    def tcov(s, t, side):
        c = _vn(s, t, blk, blkG, 0.5)
        return mix(c, red, sstep(0.45, 0.0, t) * 0.8)

    def saddle(s, t, side):
        c = _vn(s, t, red, redHi, 0.7)
        return mix(c, blk, sstep(0.75, 0.95, t) * sstep(0.5, 0.0, np.abs(s)) * 0.6)

    def under(s, t, side):
        return _vn(s, t, hexc(0x9A5A34), hexc(0xB8784C), 0.6)

    return [F_('flight', prim, w=0.62, outer=0.55, tip=0.4, shaft=hexc(0x2A1A10)),
            F_('round', sec, w=0.72, outer=0.8, tip=0.45, shaft=hexc(0x3A2014)),
            F_('round', gcov, w=0.8, outer=0.85, tip=0.8, shaft=hexc(0x5A2412)),
            F_('round', lcov, w=0.8, outer=0.9, tip=1.2, shaft=hexc(0x5A2412)),
            F_('round', tail, w=0.66, outer=0.85, tip=0.5, shaft=hexc(0x2A2420), gloss=1),
            F_('round', tcov, w=0.62, outer=0.9, tip=0.7, shaft=hexc(0x2A2420), gloss=1),
            F_('flight', saddle, w=0.5, outer=0.9, tip=0.5, shaft=hexc(0x5A2412)),
            F_('round', under, w=0.8, outer=0.9, tip=0.8, shaft=hexc(0x7A4A2A))]


def _baby_cells():
    F_ = B.FeatherCell
    y1, y2 = hexc(0xF0D56C), hexc(0xD8B04E)
    def dn(s, t, side):
        return mix(np.tile(y1, (len(s), 1)), y2, sstep(0.5, 0.0, t) * 0.35)
    return [F_('down', dn)] * 8


FEATHER_ATLAS = {'size': (1024, 512), 'out': (512, 256), 'cells': _cells, 'baby': _baby_cells, 'quality': (72, 80, 72),
                 'alpha_quality': 50}


def extra_maps(X):
    B.extra_maps(sys.modules[__name__], X)


def export_extra(meta, out_dir, work):
    B.export_extra(sys.modules[__name__], meta, out_dir, work)


MAP_QUALITY = (75, 70)
BABY_MAPS = {'size': 512, 'quality': (74, 72)}


def stats(P, N, c, col):
    R = _own(c)
    de = np.linalg.norm(mirror(P) - EYE_C, axis=1)
    m = sstep(EYE_R + 0.004, EYE_R + 0.002, de) * (1 - R['bill'])
    lid = (col * m[:, None]).sum(0) / max(m.sum(), 1e-6) * 0.9
    return {'lidCol': int(round(lid[0] * 255)) << 16 | int(round(lid[1] * 255)) << 8 | int(round(lid[2] * 255))}


def meta(st):
    r = EYE_R
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [0.8, -0.8, 0.12],
                'iris': 0xC8641E, 'irisR': 0.8, 'pupilR': 0.42, 'rim': 0x4A2008, 'babyIris': 0x1E140E, 'lidCol': st['lidCol'], 'babyLidCol': 0xC8A050},
        'collar': {'at': ['neck', 'neck2', 0.45], 'babyAt': 0.75, 'hug': True, 'babyK': 1.8},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.12, 0.08, 0.06], 'flat': 0x7A3A20,
    }
