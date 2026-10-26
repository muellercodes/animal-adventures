# Mute swan, sculpted as a signed distance field around the game's swan skeleton (bird.py has the shared bird
# parts). Units are meters in game rig space (x left, y up, z forward, ground at y = 0). Made in the rig's bind pose:
# the wing arm sticks out flat to the side under the game's feather blades.
# Make it with: VOXEL=0.004 TRIS=6500 TEX=1024 BLENDER_PY=... python3 tools/blender/make.py swan
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, loft, frame, fbm, vnoise, worley, length
import bird as B
from bird import local, local_n, mirror, groove, hexc, mix

ID = 'swan'
BOUNDS = (V(-0.76, -0.002, -0.57), V(0.76, 1.07, 0.6))
PATCHES = [
    (V(0.0, 0.93, 0.33), V(0.045, 1.05, 0.585), 0.0009),       # bill, knob, eye
    (V(0.0, -0.002, -0.1), V(0.21, 0.03, 0.1), 0.001),         # foot
]
BAKE_DIST = (0.008, 0.02, 0.1)
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
UV_PACK = dict(shape_method='CONCAVE', rotate_method='ANY')

# ---------- landmarks (left side; bone pivots from the rig) ----------
HIPS, TAILB, NECK, NECK2, NECK3, HEAD = V(0, 0.36, 0), V(0, 0.41, -0.4), V(0, 0.45, 0.3), V(0, 0.6, 0.42), V(0, 0.8, 0.375), V(0, 0.97, 0.39)
THIGH, SHIN, HMETA, HPAW = V(0.075, 0.28, -0.08), V(0.085, 0.19, -0.03), V(0.085, 0.1, -0.08), V(0.085, 0.01, -0.06)
SH, EL, WR, WT = V(0.1, 0.5, 0.16), V(0.288, 0.5, 0.16), V(0.523, 0.5, 0.16), V(0.6993, 0.5, 0.16)
EYE_C = V(0.0225, 1.0215, 0.4075)
EYE_R = 0.0062
EYE_DIR = nrm([0.92, 0.16, 0.36])
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_R = 0.0049
MOUTH = V(0.0, 0.9515, 0.535)
NOSTRIL = V(0.0108, 0.979, 0.47)
KNOB = V(0.0, 1.0155, 0.444)
FOOT = HPAW + V(0, 0.0, 0.004)
TOES = [dict(a=-27, len=0.106, r=0.0068, r1=0.0036, claw=0.01, n=4), dict(a=0, len=0.128, r=0.0072, r1=0.0038, claw=0.011, n=4),
        dict(a=27, len=0.115, r=0.0068, r1=0.0036, claw=0.01, n=4), dict(a=180, len=0.024, r=0.0045, r1=0.003, claw=0.006, lift=0.008, n=2, hind=True)]

TRUNK = [
    (-0.535, 0.457, 0.444, 0.432, 0.014, 2.0, 2.0),
    (-0.495, 0.472, 0.432, 0.394, 0.058, 2.1, 2.0),
    (-0.425, 0.49, 0.412, 0.334, 0.118, 2.2, 2.1),
    (-0.33, 0.506, 0.392, 0.272, 0.158, 2.3, 2.3),
    (-0.2, 0.518, 0.378, 0.222, 0.182, 2.4, 2.6),
    (-0.05, 0.522, 0.372, 0.205, 0.188, 2.4, 2.8),
    (0.08, 0.518, 0.376, 0.208, 0.178, 2.4, 2.6),
    (0.18, 0.506, 0.386, 0.228, 0.158, 2.3, 2.4),
    (0.26, 0.49, 0.4, 0.268, 0.124, 2.2, 2.2),
    (0.32, 0.472, 0.414, 0.322, 0.08, 2.1, 2.1),
    (0.35, 0.458, 0.424, 0.37, 0.036, 2.0, 2.0),
]
BILL = [
    (0.425, 1.011, 0.991, 0.9755, 0.021, 2.4, 2.2),
    (0.44, 1.0, 0.982, 0.9675, 0.0198, 2.6, 2.2),
    (0.46, 0.9885, 0.9735, 0.9595, 0.0182, 2.8, 2.2),
    (0.485, 0.978, 0.9655, 0.953, 0.0168, 3.0, 2.2),
    (0.508, 0.9695, 0.959, 0.9488, 0.0158, 3.0, 2.2),
    (0.522, 0.9645, 0.9555, 0.9472, 0.0148, 2.8, 2.1),
    (0.532, 0.9605, 0.953, 0.9472, 0.0115, 2.4, 2.0),
    (0.539, 0.957, 0.9515, 0.9485, 0.0048, 2.0, 2.0),
]
TOMIUM = [(0.43, 0.9835), (0.46, 0.9725), (0.49, 0.963), (0.515, 0.9565), (0.53, 0.9525), (0.538, 0.9512)]
NECK_PTS = [V(0, 0.448, 0.31), V(0, 0.535, 0.393), V(0, 0.625, 0.428), V(0, 0.725, 0.416), V(0, 0.82, 0.38), V(0, 0.905, 0.358), V(0, 0.975, 0.373)]
NECK_R = [0.09, 0.066, 0.053, 0.046, 0.041, 0.038, 0.035]


def _interp(tab, z):
    zz = np.array([k[0] for k in tab], F); yy = np.array([k[1] for k in tab], F)
    return np.interp(z, zz, yy).astype(F)


def _tom_y(z):
    return _interp(TOMIUM, z)


# ---------- body ----------
def trunk(P):
    Q = mirror(P)
    d = loft(Q, TRUNK)
    d = smin(d, ellipsoid(Q, V(0, 0.365, 0.2), V(0.15, 0.15, 0.14)), 0.06)              # deep round breast
    d = smin(d, ellipsoid(Q, V(0.12, 0.45, -0.12), V(0.06, 0.06, 0.26)), 0.06)           # side pockets under the folded wings
    d = smin(d, ellipsoid(Q, V(0, 0.42, -0.44), V(0.07, 0.05, 0.09)), 0.04)              # rump rising to the short tail
    d = smin(d, ellipsoid(Q, V(0, 0.235, -0.06), V(0.13, 0.04, 0.2)), 0.06)              # flat keel
    return d


def _neck_curve(n=24):
    """smooth curve through the neck points (Catmull-Rom) and radii, so the neck has no knots"""
    Pp = np.array(NECK_PTS, F); Rr = np.array(NECK_R, F)
    Pp = np.concatenate([2 * Pp[:1] - Pp[1:2], Pp, 2 * Pp[-1:] - Pp[-2:-1]])
    pts, rad = [], []
    for i in range(1, len(Pp) - 2):
        for k in range(n // (len(NECK_PTS) - 1)):
            t = k / (n // (len(NECK_PTS) - 1))
            p0, p1, p2, p3 = Pp[i - 1], Pp[i], Pp[i + 1], Pp[i + 2]
            q = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
            pts.append(q.astype(F)); rad.append(float(Rr[i - 1] + (Rr[i] - Rr[i - 1]) * t))
    pts.append(Pp[-2].astype(F)); rad.append(float(Rr[-1]))
    return pts, rad


_NC = None


def neck(P):
    global _NC
    if _NC is None:
        _NC = _neck_curve()
    Q = mirror(P)
    return chain(Q, _NC[0], _NC[1], 0.01)


def head(P):
    Q = mirror(P)
    d = ellipsoid(Q, V(0, 1.011, 0.384), V(0.0275, 0.0305, 0.046))
    d = smin(d, ellipsoid(Q, V(0, 1.004, 0.418), V(0.021, 0.0235, 0.027)), 0.01)      # forehead toward the bill
    d = smin(d, ellipsoid(Q, V(0.008, 0.996, 0.398), V(0.022, 0.024, 0.032)), 0.01)   # cheeks
    d = smin(d, ellipsoid(Q, V(0, 0.982, 0.425), V(0.015, 0.012, 0.024)), 0.01)       # chin
    return d


def bill(P):
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    d = loft(Q, BILL)
    yt = _tom_y(z)
    d = d + groove(y - yt, 0.0007, 0.0011) * sstep(0.43, 0.44, z)
    d = d + 0.0006 * sstep(yt - 0.0004, yt - 0.003, y) * sstep(yt - 0.012, yt - 0.007, y) * sstep(0.43, 0.445, z)
    nl = frame(Q, NOSTRIL, nrm([0.0, -0.3, 1]), (0.4, 1, 0))
    nq = np.sqrt((nl[:, 0] / 0.0022) ** 2 + (nl[:, 2] / 0.0065) ** 2)
    d = d + 0.0018 * sstep(1.0, 0.5, nq) * sstep(0.006, 0.0, np.abs(nl[:, 1]))
    return d


def knob(P):
    """the black knob (berry) on the forehead at the base of the bill"""
    Q = mirror(P)
    return ellipsoid(Q, KNOB, V(0.0105, 0.0125, 0.019))


def nail(P):
    Q = mirror(P)
    return ellipsoid(Q, V(0, 0.9545, 0.5315), V(0.0092, 0.0042, 0.0095))


def eye_parts(P):
    Q = mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0, -0.001), V(EYE_R + 0.003, EYE_R + 0.003, EYE_R + 0.0015))
    ap = np.sqrt(s * s + u * u) - LID_R
    carve = smax(ap, -(g + 0.0012), 0.0008)
    ball = length(D) - EYE_R * 0.92
    return carve, lids, ball


# ---------- legs ----------
def drum(P):
    Q = mirror(P)
    return round_cone(Q, V(0.078, 0.26, -0.045), V(0.085, 0.118, -0.072), 0.05, 0.019)


def tarsus(P):
    Q = mirror(P)
    j = round_cone(Q, V(0.085, 0.122, -0.074), HMETA + V(0, -0.003, 0.0), 0.0125, 0.013)
    t = B.flat_cone(Q, HMETA + V(0, -0.003, 0.0), HPAW + V(0, 0.006, -0.002), 0.011, 0.0095, 0.72, up=(1, 0, 0))
    pad = ellipsoid(Q, HPAW + V(0, -0.001, 0.002), V(0.013, 0.009, 0.015))
    return smin(smin(j, t, 0.008), pad, 0.007)


def feet(P):
    Q = mirror(P)
    tt, cl, _ = B.toes(Q, FOOT, [t for t in TOES if not t.get('hind')])
    ht, hc, _ = B.toes(Q, HPAW + V(0, 0.012, -0.008), [t for t in TOES if t.get('hind')], ground=0.008)
    wb = B.web(Q, FOOT, TOES, 0.0022, reach=0.94, sag=0.14)
    return np.minimum(tt, ht), np.minimum(cl, hc), wb


def arm(P):
    Q = mirror(P)
    return B.wing_arm(Q, [SH + V(-0.03, -0.008, -0.008), EL, WR, WT], [0.07, 0.064, 0.05, 0.018], [0.02, 0.017, 0.013, 0.006], lead=0.62)


# ---------- assembly ----------
def grid(h):
    lo, hi = BOUNDS
    xs = B.axis_steps(0.0, hi[0], [(0.0, 0.23, h * 0.8), (0.24, 0.76, h * 1.4)], h)
    ys = B.axis_steps(lo[1], hi[1], [(lo[1], 0.03, h * 0.3), (0.03, 0.13, h * 0.6), (0.475, 0.525, h * 0.5), (0.93, 1.05, h * 0.5)], h)
    zs = B.axis_steps(lo[2], hi[2], [(-0.1, 0.1, h * 0.6), (0.33, 0.6, h * 0.5)], h)
    return xs, ys, zs


HEAD_BOX = (V(-0.06, 0.92, 0.32), V(0.06, 1.06, 0.6))
NECK_BOX = (V(-0.11, 0.38, 0.22), V(0.11, 1.02, 0.5))
LEG_BOX = (V(-0.21, -0.003, -0.13), V(0.21, 0.3, 0.1))
ARM_BOX = (V(0.04, 0.46, 0.08), V(0.75, 0.54, 0.22))
EYE_BOX = (V(-0.04, 1.005, 0.39), V(0.04, 1.04, 0.425))


def parts(P):
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    ft, cl, wb = local_n(P, *LEG_BOX, feet, 3)
    return {'trunk': trunk(P), 'neck': local(P, *NECK_BOX, neck), 'head': local(P, *HEAD_BOX, head), 'bill': local(P, *HEAD_BOX, bill),
            'knob': local(P, *HEAD_BOX, knob), 'nail': local(P, *HEAD_BOX, nail), 'lids': li, 'ball': ba, 'carve': ca,
            'drum': local(P, *LEG_BOX, drum), 'tarsus': local(P, *LEG_BOX, tarsus), 'toes': ft, 'claws': cl, 'web': wb,
            'arm': local(mirror(P), *ARM_BOX, arm)}


def shape(P):
    d = local(P, (-0.25, 0.18, -0.56), (0.25, 0.56, 0.38), trunk)
    d = smin(d, local(P, *NECK_BOX, neck), 0.05)
    h = local(P, *HEAD_BOX, head)
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    h = smin(h, li, 0.004)
    h = smax(h, -ca, 0.001)
    h = smin(h, ba, 0.0006)
    bl = smin(local(P, *HEAD_BOX, bill), local(P, *HEAD_BOX, nail), 0.002)
    bl = smin(bl, local(P, *HEAD_BOX, knob), 0.006)
    h = smin(h, bl, 0.006)
    d = smin(d, h, 0.02)
    lg = smin(local(P, *LEG_BOX, drum), local(P, *LEG_BOX, tarsus), 0.012)
    ft, cl, wb = local_n(P, *LEG_BOX, feet, 3)
    f = smin(smin(ft, wb, 0.002), cl, 0.0012)
    lg = smin(lg, f, 0.006)
    d = smin(d, lg, 0.025)
    d = smin(d, local(mirror(P), *ARM_BOX, arm), 0.02)
    return d


# ---------- skinning ----------
WEIGHT_SMOOTH = (0, 0)
SPINE = ['tail', 'hips', 'neck', 'neck2', 'neck3', 'head']


def _spine_u(P):
    y, z = P[:, 1], P[:, 2]
    ut = 1.5 + np.clip((z + 0.4) / 0.07, -1, 0)
    un = np.interp(y, [0.36, 0.45, 0.6, 0.8, 0.965, 1.07], [1.5, 2.0, 3.0, 4.0, 5.0, 6.0]).astype(F)
    yn = y - 0.44 - 0.8 * np.maximum(0, 0.29 - z)
    k = sstep(0.0, 0.04, yn)
    return ut * (1 - k) + un * k


WCFG = dict(groups=[('body', ['trunk', 'neck']), ('head', ['head', 'bill', 'knob', 'nail', 'lids']), ('drum', ['drum']), ('tarsus', ['tarsus']),
                    ('foot', ['toes', 'claws', 'web']), ('arm', ['arm'])],
            bias={'body': 0.003}, spine=SPINE, spine_u=_spine_u, head_u=5.35, knee=(0.18, 0.21), hipb=(0.205, 0.24, 0.75),
            ankle_d=(0.125, 0.108), ankle=(0.09, 0.115), pad=(0.026, 0.01), toe_up=(0.016, 0.03), arm=(SH, EL, WR, WT), arm_root=(0.15, 0.11))


def fix_weights(W, wpos, names, G, weld):
    return B.part_weights(W, wpos, names, parts(wpos.astype(F)), WCFG)


def bone_tips(P):
    t = {'hips': P['neck'], 'tail': TAILB + V(0, 0.03, -0.12), 'neck': P['neck2'], 'neck2': P['neck3'], 'neck3': P['head'], 'head': MOUTH}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, -0.006, 0.12)) * m
        t['wing' + s] = P['wfore' + s]; t['wfore' + s] = P['whand' + s]; t['whand' + s] = WT * m
    return t


OWN_KEYS = ['trunk', 'neck', 'head', 'bill', 'knob', 'nail', 'drum', 'tarsus', 'toes', 'web', 'claws', 'arm', 'lids']


def _own(c):
    D = np.stack([c[k] for k in OWN_KEYS], 1)
    o = np.argmin(D, 1)
    return {k: (o == i).astype(F) for i, k in enumerate(OWN_KEYS)}


def keep(P):
    Pm = mirror(P)
    R = _own(parts(P))
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    ball = sstep(EYE_R * 0.97, EYE_R * 0.8, de)
    k = 0.42 * R['trunk'] + 0.6 * R['neck'] + 0.78 * R['head'] + 0.8 * (R['bill'] + R['knob'] + R['nail']) + 0.85 * R['lids']
    k += 0.55 * R['drum'] + 0.72 * R['tarsus'] + 0.78 * (R['toes'] + R['web'] + R['claws']) + 0.2 * R['arm']
    rim = sstep(EYE_R + 0.005, EYE_R + 0.0015, de) * sstep(EYE_R * 0.9, EYE_R * 1.0, de) * 0.85
    return np.maximum(k, rim) * (1 - ball)


# ---------- plumage and skin paint ----------
K = {
    'white': hexc(0xE9E8E3), 'shade': hexc(0xCFCFCB), 'warm': hexc(0xF1EEE6), 'buff': hexc(0xD8C6A2), 'bill': hexc(0xD9582A),
    'billDk': hexc(0xB8462A), 'black': hexc(0x141312), 'leg': hexc(0x262422), 'legHi': hexc(0x3A3633), 'nostril': hexc(0x2A1612),
}


def _flow(P, N, R):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    n = len(P)
    fl = np.zeros((n, 3), F)
    side = sat(-N[:, 1] * 0.6 + 0.2)
    fl[:, 1] = -0.2 - 0.55 * side
    fl[:, 2] = -1.0
    breast = sstep(0.16, 0.28, z) * sstep(0.46, 0.35, y)
    fl[:, 1] -= 1.6 * breast
    fl[:, 2] += 0.6 * breast
    nk = np.maximum(R['neck'], R['head'] + R['lids'])
    hd = sstep(0.96, 0.99, y) * nk
    fl[:, 1] = fl[:, 1] * (1 - nk) + nk * (-1.0 * (1 - hd) - 0.3 * hd)
    fl[:, 2] = fl[:, 2] * (1 - nk) + nk * (-0.2 * (1 - hd) - 1.0 * hd)
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
    s = np.full(len(P), 0.02, F)
    s = s + 0.012 * sstep(0.9, 0.3, np.abs(N[:, 1])) * sstep(-0.35, -0.2, z) * sstep(0.2, 0.08, z)
    s = s + 0.01 * sstep(0.1, 0.13, x) * sstep(0.44, 0.48, y) * sstep(-0.38, -0.25, z)       # scapulars
    s = s - 0.006 * sstep(-0.3, -0.8, N[:, 1])
    nk = R['neck']
    s = s * (1 - nk) + nk * np.interp(y, [0.45, 0.6, 0.8, 0.95], [0.016, 0.007, 0.0045, 0.0035]).astype(F)
    hd = R['head'] + R['lids']
    s = s * (1 - hd) + hd * 0.0028
    s = s * (1 - R['drum']) + R['drum'] * 0.008
    s = s * (1 - R['arm']) + R['arm'] * 0.012
    return s


def _fshape(P):
    n = len(P)
    return np.ones(n, F) * 1.05, np.ones(n, F), np.ones(n, F)


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
        pl = B.plumage(Pm, Nm, fl, sz, _fshape, seed=6)
        _pcache.clear()
        _pcache[key] = (R, Pm, Nm, fl, sz, feath, pl)
    return _pcache[key]


def _lores(Pm):
    """bare black skin from the eye forward to the bill"""
    z = Pm[:, 2]
    yl = 1.0215 - 0.36 * (z - 0.408)
    return sstep(0.0046, 0.0026, np.abs(Pm[:, 1] - yl - 0.001)) * sstep(0.405, 0.414, z) * sstep(0.445, 0.435, z) + sstep(0.0074, 0.0062, np.linalg.norm(Pm - EYE_C, axis=1))


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n1 = fbm(Pm * 20, 3, 11)
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    col = mix(np.tile(K['white'], (len(P), 1)), K['warm'], sstep(0.2, 0.8, Nm[:, 1]) * 0.4)
    col = mix(col, K['shade'], sstep(-0.3, -0.85, Nm[:, 1]) * 0.35)
    # soft gray in the creases of the feathers (white plumage shows its structure as shadow only)
    col = mix(col, K['shade'] * 0.92, sstep(0.45 * cfa, 1.2 * cfa, -pl['a']) * 0.3 * pl['cov'])
    col *= (0.975 + 0.05 * fid)[:, None]
    # a faint rusty wash on the head and the front of the neck (iron stain from dabbling)
    nk = np.clip(R['neck'] + R['head'], 0, 1)
    col = mix(col, K['buff'], nk * sstep(0.75, 0.98, y) * (0.25 + 0.2 * n1) * sstep(-0.5, 0.4, Nm[:, 2]))
    # bill: orange red, black base, edges, nail, knob and lores
    bl = R['bill']
    yt = _tom_y(z)
    bcol = mix(np.tile(K['bill'], (len(P), 1)), K['billDk'], sstep(yt + 0.002, yt - 0.002, y) * 0.5)
    base = sstep(0.452, 0.44, z) + sstep(0.0018, 0.0006, np.abs(y - yt)) * 0.9
    bcol = mix(bcol, K['black'], np.clip(base, 0, 1))
    bcol = mix(bcol, K['nostril'], sstep(0.0025, 0.0012, np.linalg.norm((Pm - NOSTRIL) * V(1.2, 1.5, 0.4), axis=1)))
    col = mix(col, bcol, bl)
    blk = np.clip(R['knob'] + R['nail'] + _lores(Pm) * np.clip(R['head'] + R['lids'] + bl, 0, 1), 0, 1)
    col = mix(col, K['black'], blk)
    # legs and feet black
    lg = np.clip(R['tarsus'] + R['toes'] + R['web'] + R['claws'], 0, 1)
    col = mix(col, mix(np.tile(K['leg'], (len(P), 1)), K['legHi'], sstep(0.5, 0.9, n1) * 0.4), lg)
    col = mix(col, K['black'], R['lids'] * 0.7)
    rough = 0.82 + 0.05 * (n1 - 0.5)
    rough = np.where(bl > 0.5, 0.42, rough)
    rough = np.where(blk > 0.5, 0.38, rough)
    rough = np.where(lg > 0.5, 0.5, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _leg_h(P, c, R):
    Pm = mirror(P)
    h = np.zeros(len(P), F)
    rh, rg = B.reticulate(Pm, 0.0026, 42)
    sh, sg = B.scutes(Pm, V(0, 1, 0), 0.005, 41)
    fr = sstep(-0.006, 0.004, Pm[:, 2] - (HMETA[2] + (HPAW[2] - HMETA[2]) * sat((HMETA[1] - Pm[:, 1]) / (HMETA[1] - HPAW[1]))))
    h += R['tarsus'] * (0.00008 * rh - 0.00009 * rg) * (1 - 0.5 * fr) + R['tarsus'] * fr * (0.0001 * sh - 0.0001 * sg)
    th, tg = B.scutes(Pm, nrm([0.15, 0, 1]), 0.004, 43)
    up = sstep(0.002, 0.006, Pm[:, 1])
    h += R['toes'] * (up * (0.0001 * th - 0.0001 * tg) + (1 - up) * 0.00006 * rh)
    wh, wg = B.reticulate(Pm, 0.0016, 44)
    h += R['web'] * (0.00003 * wh - 0.00004 * wg)
    return h


def detail(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    h = np.zeros(len(P), F)
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    h += B.feather_height(pl, 0.03) * feath * (1 - 0.5 * hd)
    cf = pl['c']
    big = sstep(0.01, 0.02, cf) * pl['cov'] * feath
    bar = np.sin(2 * np.pi * (pl['a'] * 0.7 + np.abs(pl['b'])) / 0.0016)
    h -= 0.00002 * sstep(0.3, 1.0, bar) * big
    h += 0.00007 * sstep(0.0012, 0.0, np.abs(pl['b'])) * sstep(-0.4 * cf, -0.9 * cf, pl['a']) * big
    h += 0.00003 * (fbm(Pm * 500, 2, 61) - 0.5) * hd
    bl = R['bill']
    f1, _ = worley(Pm / 0.0009, 62)
    h -= 0.00002 * sstep(0.3, 0.0, f1) * bl
    h += 0.00006 * (fbm(Pm * 600, 2, 63) - 0.5) * R['knob']
    h += _leg_h(P, c, R)
    return h


def finish(C, ao, valid):
    return B.finish_ao(C, ao, 0.32)


# ---------- the cygnet (baby maps) ----------
KB = {'gray': hexc(0x8C8378), 'pale': hexc(0xB2A99D), 'dark': hexc(0x6C645A), 'bill': hexc(0x3A3634), 'leg': hexc(0x3A3634)}


def paint_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, fl, Nm, 0.003, 73)
    col = mix(np.tile(KB['gray'], (len(P), 1)), KB['pale'], sstep(-0.2, -0.7, Nm[:, 1]))
    col = mix(col, KB['dark'], sstep(0.3, 0.8, Nm[:, 1]) * 0.3)
    col *= (0.74 + 0.38 * dn + 0.1 * tip)[:, None]
    bl = np.clip(R['bill'] + R['knob'] + R['nail'], 0, 1)
    col = mix(col, KB['bill'], bl)
    lg = np.clip(R['tarsus'] + R['toes'] + R['web'] + R['claws'], 0, 1)
    col = mix(col, KB['leg'], lg)
    col = mix(col, KB['dark'] * 0.6, R['lids'] * 0.6)
    rough = np.where(bl + lg > 0.5, 0.55, 0.93)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _baby_body(Q):
    d = ellipsoid(Q, V(0, 0.37, 0.0), V(0.17, 0.165, 0.33))
    global _NC
    if _NC is None:
        _NC = _neck_curve()
    d = smin(d, chain(Q, _NC[0], _NC[1], 0.01), 0.06)
    return d


def _baby_extra(Q, Nm, R):
    """cygnets have no knob: press it into the bill (through the baby head's 1.55 scale)"""
    return -Nm * (0.0105 / 1.55 * R['knob'])[:, None]


def baby_offset(P, N, c):
    """per vertex: where the baby's surface lies relative to the adult's (adult space; see bird.baby_shape)"""
    # the neck keeps its own shape (the game's baby neck maps make it short and thick): pushed onto a fat neck the
    # S curve folds up when it shortens
    R = dict(_own(c)); R['neck'] = np.zeros(len(P), F)
    return B.baby_shape(P, N, R, _baby_body, (V(0.085, 0.1, -0.08), V(0.082, 0.27, -0.04), 0.014, 1.3), SH + V(-0.05, -0.03, -0.02), (0.007, 0.009), maxd=0.12, extra=_baby_extra)


def detail_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, fl, Nm, 0.003, 73)
    return 0.0005 * (dn - 0.5) * feath + 0.5 * _leg_h(P, c, R)


# ---------- feather blades (atlas cells, same order as the game's feather cells) ----------
def _vn(s, t, base, edge, k=0.5):
    return mix(np.tile(base, (len(s), 1)), edge, sstep(0.55, 1.0, np.abs(s)) * k)


def _cells():
    F_ = B.FeatherCell
    w, sh, wm = hexc(0xEDECE7), hexc(0xD4D4D0), hexc(0xF5F3EE)

    def prim(s, t, side):
        return mix(_vn(s, t, w, sh, 0.5), hexc(0xC8C8C4), sstep(0.5, 1.0, t) * 0.25)

    def sec(s, t, side):
        return _vn(s, t, w, sh, 0.4)

    def cov(s, t, side):
        return mix(_vn(s, t, w, wm, 0.5), sh, sstep(0.4, 0.0, np.abs(s)) * 0.15)

    def tail(s, t, side):
        return _vn(s, t, hexc(0xE4E3DE), sh, 0.5)

    return [F_('flight', prim, w=0.62, outer=0.55, tip=0.42, shaft=hexc(0xD8D6D0)),
            F_('round', sec, w=0.72, outer=0.8, tip=0.45, shaft=hexc(0xDAD8D2)),
            F_('round', cov, w=0.8, outer=0.85, tip=0.8, shaft=hexc(0xDAD8D2)),
            F_('round', cov, w=0.8, outer=0.9, tip=1.2, shaft=hexc(0xDAD8D2)),
            F_('round', sec, w=0.76, outer=0.85, tip=0.6, shaft=hexc(0xDAD8D2)),
            F_('round', tail, w=0.62, outer=0.85, tip=0.7, shaft=hexc(0xDAD8D2)),
            F_('round', cov, w=0.7, outer=0.9, tip=0.9, shaft=hexc(0xDAD8D2)),
            F_('round', cov, w=0.8, outer=0.9, tip=0.8, shaft=hexc(0xDAD8D2))]


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = hexc(0xA39A90), hexc(0x8A8278)
    def dn(s, t, side):
        return mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 8


FEATHER_ATLAS = {'size': (1024, 512), 'out': (512, 256), 'cells': _cells, 'baby': _baby_cells, 'quality': (72, 80, 72),
                 'alpha_quality': 50}


def extra_maps(X):
    B.extra_maps(sys.modules[__name__], X)


def export_extra(meta, out_dir, work):
    B.export_extra(sys.modules[__name__], meta, out_dir, work)


MAP_QUALITY = (75, 68)
BABY_MAPS = {'size': 512, 'quality': (74, 72)}


def stats(P, N, c, col):
    return {'lidCol': 0x141312}


def meta(st):
    r = EYE_R
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [0.8, -0.8, 0.12],
                'iris': 0x2A1A10, 'irisR': 0.88, 'pupilR': 0.45, 'rim': 0x0A0806, 'lidCol': st['lidCol'], 'babyLidCol': 0x5A544E},
        'collar': {'at': ['neck', 'neck2', 0.5], 'babyAt': 0.6, 'hug': True, 'babyK': 1.8},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.12, 0.12, 0.12], 'flat': 0xE0DED8,
    }
