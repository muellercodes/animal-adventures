# A reticulated giraffe, the head about 5 m up, sculpted as a signed distance field around the game's skeleton
# (tools/blender/work/giraffe-rig.json). Units are meters in game rig space (x left, y up, z forward, ground at y = 0).
# Shape: a short deep trunk on very long legs, high withers and the back sloping down to the rump, the long neck with a
# short upright mane, a long head with big eyes, two hair-tufted ossicones and a median lump on the forehead, leaf-shaped
# ears, knobby knees and hocks, cloven hooves, a long thin tail ending in a black tuft. Paint: crisp liver-red polygon
# patches parted by thin white lines (a Voronoi pattern whose cells shrink up the neck and down the legs), plain cream
# below the knees and hocks, a tan face. The calf's paler patches are the baby color map; its shape is the game's baby
# maps.
# Make it with: VOXEL=0.02 TRIS=3600 TEX=768 WEIGHTS=transfer BLENDER_PY=... python3 tools/blender/make.py giraffe
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length, axis_steps
import ungulate as U
import bird as BD
from ungulate import local as _local, local_n as _local_n, mirror as _mirror

ID = 'giraffe'
BOUNDS = (V(-0.62, -0.001, -1.62), V(0.62, 5.12, 2.62))
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
BAKE_DIST = (0.02, 0.06, 0.2)

# ---------- landmarks (left side, +x) ----------
XF, XH = 0.3, 0.3
HOOF_F = V(XF, 0.0, 0.68)
HOOF_H = V(XH, 0.0, -0.8)
# head frame: from the poll forward and down to the lips
HO = V(0.0, 4.8, 1.95)
HA = nrm([0.0, -0.5, 0.87])
HU = nrm([0.0, 0.87, 0.5])
HL = 0.68


def hp(s, u, x=0.0):
    return HO + HA * s + HU * u + V(1, 0, 0) * x


def hframe(Q):
    D = Q - HO
    return np.stack([D[:, 0], D @ HU, D @ HA], 1)


EYE_C = hp(0.15, 0.05, 0.12)
EYE_R = 0.03
EYE_DIR = nrm([0.88, 0.05, 0.47])
LID_W, LID_H, LID_OFF = 0.028, 0.02, 0.0
MOUTH = hp(0.66, -0.1)
EAR_B = hp(0.0, 0.06, 0.1)
EAR_A = nrm([0.85, 0.25, -0.45])
EAR_N = nrm([0.35, 0.1, 0.93])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
EAR_L, EAR_W = 0.2, 0.05
# ossicones: base, direction, length
OSS = (hp(0.03, 0.09, 0.065), nrm([0.12, 0.95, -0.28]), 0.15)

TRUNK = [
    (-1.3, 2.62, 2.35, 2.08, 0.16, 2.0, 2.0),
    (-1.15, 2.72, 2.32, 1.97, 0.3, 2.1, 2.0),
    (-0.85, 2.76, 2.3, 1.93, 0.36, 2.2, 2.0),
    (-0.5, 2.83, 2.3, 1.9, 0.38, 2.3, 2.0),
    (-0.1, 2.93, 2.35, 1.88, 0.39, 2.3, 2.0),
    (0.3, 3.06, 2.42, 1.9, 0.38, 2.3, 2.0),
    (0.55, 3.13, 2.5, 1.96, 0.35, 2.2, 2.0),
    (0.8, 3.1, 2.6, 2.1, 0.3, 2.1, 2.0),
    (0.95, 3.0, 2.68, 2.32, 0.22, 2.0, 2.0),
]
# neck: path (y, z), section (top: the back of the neck, bottom: the throat, half width)
NECK = [
    (2.75, 0.55, 0.45, 0.5, 0.36, 2.0, 2.0),
    (3.05, 0.9, 0.36, 0.42, 0.3, 2.0, 2.0),
    (3.55, 1.25, 0.26, 0.3, 0.22, 2.0, 2.0),
    (4.05, 1.55, 0.2, 0.24, 0.17, 2.0, 2.0),
    (4.45, 1.8, 0.16, 0.19, 0.135, 2.0, 2.0),
    (4.75, 1.95, 0.13, 0.15, 0.11, 2.0, 2.0),
]
# head, in the head frame: s, top, yw, bottom (u), half width, exponents
HEAD = [
    (-0.06, 0.1, -0.02, -0.14, 0.1, 2.2, 2.0),
    (0.06, 0.13, 0.0, -0.16, 0.125, 2.3, 2.1),
    (0.16, 0.12, 0.0, -0.165, 0.13, 2.4, 2.2),
    (0.3, 0.08, -0.02, -0.15, 0.095, 2.4, 2.2),
    (0.45, 0.06, -0.03, -0.14, 0.08, 2.4, 2.2),
    (0.57, 0.05, -0.03, -0.14, 0.085, 2.5, 2.3),
    (0.64, 0.02, -0.04, -0.12, 0.07, 2.4, 2.2),
    (0.68, -0.02, -0.05, -0.1, 0.04, 2.2, 2.0),
]
# legs: path (y, z), section (front, back, half width), x of the center
FORE = [
    (2.45, 0.7, 0.2, 0.22, 0.16, 2.0, 2.0, 0.3),
    (2.1, 0.6, 0.17, 0.2, 0.13, 2.0, 2.0, 0.3),
    (1.85, 0.5, 0.13, 0.15, 0.1, 2.0, 2.0, 0.3),
    (1.4, 0.52, 0.09, 0.1, 0.075, 2.1, 2.1, 0.3),
    (1.0, 0.55, 0.075, 0.08, 0.065, 2.2, 2.2, 0.3),
    (0.6, 0.57, 0.05, 0.055, 0.045, 2.2, 2.2, 0.3),
    (0.24, 0.6, 0.055, 0.06, 0.05, 2.2, 2.2, 0.3),
    (0.12, 0.64, 0.05, 0.05, 0.05, 2.2, 2.2, 0.3),
    (0.06, 0.67, 0.06, 0.05, 0.06, 2.2, 2.2, 0.3),
]
HIND = [
    (2.35, -0.85, 0.3, 0.28, 0.2, 2.0, 2.0, 0.3),
    (2.05, -0.72, 0.25, 0.25, 0.17, 2.0, 2.0, 0.31),
    (1.8, -0.6, 0.17, 0.17, 0.12, 2.0, 2.0, 0.33),
    (1.45, -0.8, 0.12, 0.12, 0.09, 2.1, 2.1, 0.32),
    (1.07, -1.0, 0.08, 0.08, 0.065, 2.2, 2.2, 0.3),
    (0.65, -0.96, 0.05, 0.055, 0.045, 2.2, 2.2, 0.3),
    (0.24, -0.92, 0.055, 0.06, 0.05, 2.2, 2.2, 0.3),
    (0.12, -0.86, 0.05, 0.05, 0.05, 2.2, 2.2, 0.3),
    (0.06, -0.82, 0.06, 0.05, 0.06, 2.2, 2.2, 0.3),
]
TAIL = [
    (2.62, -1.26, 0.06, 0.06, 0.05, 2.0, 2.0),
    (2.2, -1.42, 0.04, 0.04, 0.035, 2.0, 2.0),
    (1.6, -1.47, 0.03, 0.03, 0.025, 2.0, 2.0),
    (1.2, -1.48, 0.022, 0.022, 0.02, 2.0, 2.0),
]


def _mane_points(n=14):
    """points along the top of the neck (the path pushed out by its top section) for the mane"""
    K = np.asarray(NECK, F)
    from scipy.interpolate import PchipInterpolator
    seg = np.linalg.norm(np.diff(K[:, :2], axis=0), axis=1)
    t = np.concatenate([[0], np.cumsum(seg)])
    f = PchipInterpolator(t, K, axis=0)
    ts = np.linspace(0.1, t[-1] - 0.02, n)
    S = f(ts)
    dS = f(ts, 1)
    out = []
    for (y, z, top), (dy, dz) in zip(S[:, :3], dS[:, :2]):
        # the section's top lies along the tangent turned +90 degrees: up and back for the rising neck
        ln = np.hypot(dy, dz)
        out.append(V(0.0, y + dz / ln * top, z - dy / ln * top))
    return out


MANE = _mane_points()


def trunk(P):
    Q = _mirror(P)
    d = loft(Q, TRUNK)
    # the withers rising into the neck, the shoulder, the haunch
    d = smin(d, ellipsoid(Q, V(0.0, 3.05, 0.55), V(0.2, 0.2, 0.35)), 0.15)
    d = smin(d, ellipsoid(Q, V(0.22, 2.6, 0.62), V(0.16, 0.42, 0.25)), 0.15)
    d = smin(d, ellipsoid(Q, V(0.22, 2.35, -0.95), V(0.18, 0.35, 0.3)), 0.15)
    return d


def neck(P):
    Q = _mirror(P)
    d = sweep(Q, NECK, n=48)
    # the short upright mane along the top of the neck
    rad = np.linspace(0.04, 0.025, len(MANE)).astype(F)
    m = U.chain(Q, MANE, rad, 0.02)
    return smin(d, m, 0.03), m


def head(P):
    Q = _mirror(P)
    L = hframe(Q)
    x, u, s = L[:, 0], L[:, 1], L[:, 2]
    d = loft(L, HEAD)
    # the median lump on the forehead, the cheeks, the soft lips
    d = smin(d, ellipsoid(L, V(0.0, 0.1, 0.25), V(0.035, 0.03, 0.05)), 0.03)
    d = smin(d, ellipsoid(L, V(0.07, -0.06, 0.2), V(0.06, 0.07, 0.1)), 0.04)
    d = smin(d, ellipsoid(L, V(0.0, -0.02, 0.63), V(0.06, 0.05, 0.05)), 0.03)
    # nostril slits, the mouth
    d = smax(d, -ellipsoid(L, V(0.045, 0.035, 0.6), V(0.01, 0.006, 0.025)), 0.006)
    mo = np.exp(-((u + 0.075 - 0.02 * (s - 0.5)) / 0.006) ** 2) * sstep(0.48, 0.55, s)
    d = d + 0.008 * mo
    # ossicones: short columns rising up and back, a knob of black hair on top
    b, a, ln = OSS
    d = smin(d, round_cone(Q, b, b + a * ln, 0.035, 0.028), 0.03)
    d = smin(d, ellipsoid(Q, b + a * (ln + 0.01), V(0.038, 0.035, 0.038)), 0.02)
    ca, li, ba, br = eye_parts(P)
    d = smin(d, li, 0.012)
    d = smin(d, br, 0.012)
    d = smax(d, -ca, 0.004)
    d = smin(d, ba, 0.002)
    return d


def tufts(P):
    Q = _mirror(P)
    b, a, ln = OSS
    return ellipsoid(Q, b + a * (ln + 0.012), V(0.04, 0.037, 0.04))


def ears(P):
    Q = _mirror(P)
    return U.ear(Q, EAR_B, EAR_A, EAR_N, EAR_L, EAR_W, cup=0.45, th0=0.026, th1=0.012, tip=0.6, base_r=(0.035, 0.035, 0.032), roll=0.06)


def eye_parts(P):
    Q = _mirror(P)
    return U.eye_parts(Q, EYE_C, EYE_R, EYE_DIR, LID_W, LID_H, LID_OFF, mound=(0.012, 0.01, 0.004),
                       brow=((-0.04, 0.03, -0.02), (0.015, 0.035, -0.015), 0.012, 0.008))


def fleg(P):
    Q = _mirror(P)
    d = sweep(Q, FORE, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(XF, 1.0, 0.56), V(0.075, 0.07, 0.085)), 0.04)        # knee
    d = smin(d, ellipsoid(Q, V(XF, 0.25, 0.6), V(0.06, 0.06, 0.065)), 0.03)         # fetlock
    return d


def hleg(P):
    Q = _mirror(P)
    d = sweep(Q, HIND, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(XH, 1.08, -1.03), V(0.07, 0.08, 0.08)), 0.04)        # hock
    d = smin(d, ellipsoid(Q, V(XH, 1.12, -1.1), V(0.035, 0.06, 0.04)), 0.03)        # point of the hock
    d = smin(d, ellipsoid(Q, V(XH, 0.25, -0.92), V(0.06, 0.06, 0.065)), 0.03)       # fetlock
    return d


def hooves(P):
    Q = _mirror(P)
    hf = U.cloven(Q, HOOF_F, 0.24, 0.16, 0.16, 0.09, 0.55, 0.008)
    hh = U.cloven(Q, HOOF_H, 0.23, 0.15, 0.155, 0.09, 0.55, 0.008)
    return np.minimum(hf, hh)


def tail(P):
    Q = _mirror(P)
    d = sweep(Q, TAIL)
    # the long black tuft at the end
    w = 0.012 * (fbm(Q * 30, 2, 71) - 0.5)
    tf = ellipsoid(Q, V(0.0, 0.98, -1.48), V(0.055, 0.28, 0.055)) + w
    return smin(d, tf, 0.04), tf


HEAD_BOX = (V(-0.3, 4.25, 1.75), V(0.3, 5.12, 2.62))
EYE_BOX = (EYE_C * V(-1, 1, 1) - V(0.07, 0.07, 0.07), EYE_C + V(0.07, 0.07, 0.07))
EAR_BOX = (V(-0.4, 4.6, 1.6), V(0.4, 5.05, 2.15))
NECK_BOX = (V(-0.5, 2.1, 0.0), V(0.5, 5.0, 2.15))
FL_BOX = (V(-0.6, -0.05, 0.3), V(0.6, 2.8, 0.95))
HL_BOX = (V(-0.62, -0.05, -1.4), V(0.62, 2.75, -0.35))
HOOF_BOX = (V(-0.55, -0.05, -1.1), V(0.55, 0.22, 0.9))
TAIL_BOX = (V(-0.15, 0.6, -1.62), V(0.15, 2.75, -1.15))


def parts(P):
    so, li, ba, br = eye_parts(P)
    nk, mane = _local_n(P, *NECK_BOX, neck, 2)
    tl, tf = _local_n(P, *TAIL_BOX, tail, 2)
    return {'trunk': trunk(P), 'neck': nk, 'mane': mane, 'head': _local(P, *HEAD_BOX, head), 'ear': _local(P, *EAR_BOX, ears),
            'lids': li, 'ball': ba, 'brow': br, 'tuft': _local(P, *HEAD_BOX, tufts),
            'fleg': _local(P, *FL_BOX, fleg), 'hleg': _local(P, *HL_BOX, hleg), 'hoof': _local(P, *HOOF_BOX, hooves), 'tail': tl, 'ttuft': tf}


def shape(P):
    d = trunk(P)
    nk, mane = _local_n(P, *NECK_BOX, neck, 2)
    d = smin(d, nk, 0.2)
    d = smin(d, _local(P, *HEAD_BOX, head), 0.08)
    d = smin(d, _local(P, *EAR_BOX, ears), 0.015)
    d = smin(d, _local(P, *FL_BOX, fleg), 0.12)
    d = smin(d, _local(P, *HL_BOX, hleg), 0.14)
    d = smin(d, _local(P, *HOOF_BOX, hooves), 0.035)
    tl, tf = _local_n(P, *TAIL_BOX, tail, 2)
    d = smin(d, tl, 0.06)
    return d


def grid(h):
    """finer around the head, the lower legs and the hooves"""
    lo, hi = BOUNDS
    xs = axis_steps(0.0, hi[0], [(0.0, 0.16, h * 0.5), (0.2, 0.42, h * 0.5)], h)
    ys = axis_steps(lo[1], hi[1], [(lo[1], 0.3, h * 0.35), (0.3, 1.9, h * 0.55), (4.3, hi[1], h * 0.35)], h)
    zs = axis_steps(lo[2], hi[2], [(-1.15, -0.65, h * 0.55), (0.4, 0.85, h * 0.55), (1.75, hi[2], h * 0.35)], h)
    return xs, ys, zs


PATCHES = [
    (EYE_C * V(0, 1, 1) + V(0.06, -0.06, -0.06), EYE_C * V(0, 1, 1) + V(0.19, 0.06, 0.06), 0.002),   # eye and lids
    (V(0.0, 4.25, 2.2), V(0.12, 4.6, 2.62), 0.003),                                                  # muzzle, lips, nostrils
    (V(0.0, 4.75, 1.8), V(0.16, 5.1, 2.1), 0.0035),                                                  # ossicones
    (V(0.12, -0.001, 0.4), V(0.48, 0.22, 0.9), 0.004),                                               # front hoof
    (V(0.12, -0.001, -1.08), V(0.48, 0.22, -0.6), 0.004),                                            # hind hoof
]

PREVIEW = {
    'side': ((9.5, 2.6, 0.4), (0, 2.5, 0.4), 34),
    'front3q': ((5.5, 4.0, 6.5), (0, 2.6, 0.5), 34),
    'rear3q': ((-5.5, 4.0, -5.5), (0, 2.4, 0.0), 34),
    'head': ((1.2, 5.0, 3.3), (0, 4.7, 2.2), 26),
    'headside': ((2.0, 4.7, 2.25), (0, 4.65, 2.25), 24),
    'legs': ((2.6, 0.9, 1.6), (0.3, 0.6, 0.0), 30),
}


# ---------- the game mesh ----------
def keep(P):
    Pm = _mirror(P)
    e = sstep(0.09, 0.045, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.85
    L = hframe(Pm)
    hd = sstep(-0.05, 0.05, L[:, 2]) * sstep(1.75, 1.85, Pm[:, 2]) * 0.6
    a, c, n = U.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    er = sstep(-0.01, 0.03, a) * sstep(0.08, 0.05, np.abs(c)) * sstep(0.05, 0.02, np.abs(n)) * 0.7
    lg = sstep(1.2, 0.9, Pm[:, 1]) * 0.5
    hf = sstep(0.24, 0.12, Pm[:, 1]) * 0.6
    tl = U.box(Pm, TAIL_BOX[0] * V(0, 1, 1), TAIL_BOX[1]).astype(F) * sstep(-1.18, -1.25, Pm[:, 2]) * 0.6
    base = np.full(len(P), 0.36, F)
    return np.maximum.reduce([base, e, hd, er, lg, hf, tl]).astype(F)


BEND = [
    (V(0.0, 2.8, 0.7), V(0.0, 4.7, 1.95), 0.2, 0.55),          # neck
    (V(XF, 2.3, 0.65), V(XF, 1.85, 0.5), 0.15, 0.3),          # upper arm
    (V(XF, 1.85, 0.5), V(XF, 1.0, 0.55), 0.15, 0.16),         # forearm
    (V(XF, 1.0, 0.55), V(XF, 0.22, 0.6), 0.15, 0.12),         # cannon
    (V(XH, 2.2, -0.8), V(XH, 1.8, -0.6), 0.15, 0.32),         # thigh
    (V(XH, 1.8, -0.6), V(XH, 1.05, -1.02), 0.15, 0.2),        # gaskin
    (V(XH, 1.05, -1.02), V(XH, 0.22, -0.92), 0.15, 0.12),     # hind cannon
]


def lowpoly_fix(bm, hi):
    import meshfix as MF
    tr = MF.tree(hi)
    for a, b, pitch, reach in BEND:
        if a[0] == 0 and b[0] == 0:
            ok = lambda c, p0, r, reach=reach: r < reach and abs(c.x) < 0.45 and c.z > 0.4
        else:
            ok = lambda c, p0, r, reach=reach: r < reach and abs(c.x) > 0.12
        MF.rings(bm, tr, a, b, pitch, ok)
    MF.finish(bm, 1e-6)


UV_AVERAGE = True
UV_PACK = dict(margin_method='FRACTION', margin=0.005)

OWN_KEYS = ['trunk', 'neck', 'head', 'ear', 'fleg', 'hleg', 'hoof', 'tail']


def _own(c):
    D = np.stack([c[k] for k in OWN_KEYS], 1)
    o = np.argmin(D, 1)
    return {k: o == i for i, k in enumerate(OWN_KEYS)}


def uv_regions(P):
    """head and ears, neck (two), trunk, front legs (two), hind legs (two), hooves, tail"""
    Pm = _mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 3)
    L = hframe(Pm)
    nk = (z > 0.75) | (y > 3.15)
    lab[nk] = 2
    lab[nk & (y > 3.8)] = 1
    lab[(L[:, 2] > -0.06) & (y > 4.45)] = 0
    fl = (x > 0.14) & (y < 2.0) & (z > 0.0)
    hl = (x > 0.14) & (y < 2.0) & (z <= 0.0)
    lab[fl] = 4
    lab[fl & (y < 1.0)] = 5
    lab[hl] = 6
    lab[hl & (y < 1.05)] = 7
    lab[y < 0.16] = 8
    lab[(z < -1.24) & (y < 2.55) & (x < 0.1)] = 9
    return lab


def uv_weight(P):
    Pm = _mirror(P)
    L = hframe(Pm)
    head = sstep(-0.08, 0.0, L[:, 2]) * sstep(4.4, 4.5, Pm[:, 1])
    lg = sstep(1.2, 0.9, Pm[:, 1])
    return (1.0 + 1.6 * head + 0.4 * lg).astype(F)


WEIGHT_SMOOTH = (4, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['neck2'], 'neck2': P['neck3'], 'neck3': P['neck4'], 'neck4': P['head'],
         'head': hp(HL, -0.06), 'tail1': P['tail2'], 'tail2': P['tail3'], 'tail3': V(0, 0.72, -1.48)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (HOOF_H + V(0, 0.02, 0.12)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (HOOF_F + V(0, 0.02, 0.12)) * m
        t['ear' + s] = (EAR_B + EAR_A * EAR_L) * m
    return t


SPINE = ['hips', 'chest', 'neck', 'neck2', 'neck3', 'neck4', 'head']
NECK_A = np.array([3.0, 0.9], F)
NECK_D = np.array([4.72 - 3.0, 1.95 - 0.9], F) / np.hypot(4.72 - 3.0, 1.95 - 0.9)
NECK_T = [0.0] + [float((np.array(p, F) - NECK_A) @ NECK_D) for p in ((3.55, 1.25), (4.05, 1.55), (4.45, 1.8), (4.72, 1.95))]


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    P = wpos.astype(F)
    Q = _mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    side = np.where(P[:, 0] >= 0, 'L', 'R')
    own = _own(parts(P))
    leg = own['fleg'] | own['hleg'] | own['hoof']
    Wn = np.zeros_like(W)
    # trunk by z (hips behind, chest in front), the neck along its line from the base to the poll, the head
    u = np.interp(z, [-1.3, -0.85, 0.5, 0.9], [0.0, 0.2, 1.0, 1.6]).astype(F)
    t = (y - NECK_A[0]) * NECK_D[0] + (z - NECK_A[1]) * NECK_D[1]
    un = np.interp(t, NECK_T + [NECK_T[-1] + 0.6], [2, 3, 4, 5, 6, 7]).astype(F)
    nk = own['neck'] | own['head'] | own['ear']
    u = np.where(nk, np.maximum(un, np.where(own['neck'], 1.6, 0.0)), u)
    u = np.where(own['head'] | own['ear'], np.maximum(u, 6.0), u)
    body = ~(leg | own['tail'])
    for nm, w in BD.blend_chain(u, SPINE, 0.35):
        Wn[:, bi[nm]] += w * body
    for s in 'LR':
        # ears on their own bones
        m = own['ear'] & (side == s)
        a, _, _ = U.ear_coords(Q[m], EAR_B, EAR_A, EAR_N)
        k = sstep(0.0, 0.05, a)
        Wn[m] *= (1 - k)[:, None]
        Wn[m, bi['ear' + s]] += k
        # legs by height down each leg, into the chest or the hips at the top; hooves on the paw bones
        for fr, bones, ys, gird in ((True, ['arm', 'fore', 'fmeta', 'fpaw'], [0.0, 0.22, 1.0, 1.85, 2.45], 'chest'),
                                    (False, ['thigh', 'shin', 'hmeta', 'hpaw'], [0.0, 0.22, 1.05, 1.8, 2.35], 'hips')):
            m = leg & (side == s) & ((z > -0.2) == fr)
            if not m.any():
                continue
            ul = 4.0 - np.interp(y[m], ys, [0.0, 1.0, 2.0, 3.0, 4.0]).astype(F)
            g = sstep(0.3, -0.2, ul) * 0.85
            for nm, w in BD.blend_chain(ul, bones, 0.2):
                Wn[m, bi[nm + s]] += w * (1 - g)
            Wn[m, bi[gird]] += g
        mh = own['hoof'] & (side == s)
        Wn[mh] = 0
        Wn[mh & (z > -0.2), bi['fpaw' + s]] = 1
        Wn[mh & (z <= -0.2), bi['hpaw' + s]] = 1
    # tail: down its length, the root into the hips
    m = own['tail']
    ut = np.interp(y[m], [0.7, 1.55, 2.1, 2.6], [3.0, 2.0, 1.0, 0.0]).astype(F)
    g = sstep(0.25, -0.1, ut)
    for nm, w in BD.blend_chain(ut, ['tail1', 'tail2', 'tail3'], 0.2):
        Wn[m, bi[nm]] += w * (1 - g)
    Wn[m, bi['hips']] += g
    Wn[:, bi['ctag']] = 0
    return Wn / np.maximum(Wn.sum(1, keepdims=True), 1e-9)


# ---------- coat paint (sRGB 0..1) and fine detail (meters) ----------
hx = U.hexc
K = {
    'patch': hx(0x7A3519), 'patchDk': hx(0x5A2410), 'patchLt': hx(0x9A4A24), 'line': hx(0xF0E6D2), 'leg': hx(0xE6DAC2), 'face': hx(0xC08C56),
    'muzzle': hx(0xB49878), 'mane': hx(0x6A3E22), 'black': hx(0x1E1A16), 'hoof': hx(0x34302A), 'ball': hx(0x100A06), 'lid': hx(0x3A2A1E),
    'earIn': hx(0xE2D6C2), 'oss': hx(0x9A6A40),
    'calf': hx(0xB0693A), 'calfDk': hx(0x8E4E28), 'calfLine': hx(0xF2EADA),
}


def _regions(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    r = {}
    Pm = _mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(x + 1e-9)
    r['Pm'], r['Nm'] = Pm, Nm
    r['hoof'] = sstep(0.006, 0.001, c['hoof'])
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    r['eyeD'] = de
    r['ball'] = sstep(0.0016, 0.0005, c['ball']) * sstep(EYE_R + 0.004, EYE_R + 0.001, de)
    r['lid'] = sstep(EYE_R + 0.01, EYE_R + 0.004, de) * (1 - r['ball'])
    L = hframe(Pm)
    r['L'] = L
    r['head'] = sstep(-0.1, 0.0, L[:, 2]) * sstep(4.4, 4.5, y)
    r['muzzle'] = sstep(0.42, 0.55, L[:, 2]) * r['head']
    a, cc, n = U.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    r['ear'] = sstep(0.006, 0.001, c['ear']) * sstep(-0.01, 0.03, a)
    r['earIn'] = sstep(-0.1, 0.45, Nm @ EAR_N) * r['ear']
    r['tuft'] = sstep(0.008, 0.0, c['tuft'])
    b, ad, ln = OSS
    r['oss'] = sstep(0.01, 0.0, length(Pm - (b + ad * ln * 0.5)) - ln * 0.6) * (1 - r['tuft']) * r['head']
    r['mane'] = sstep(0.012, 0.0, c['mane']) * sstep(0.0, 0.01, c['mane'] - c['neck'] + 0.012)
    r['ttuft'] = sstep(0.01, 0.0, c['ttuft']) * sstep(1.3, 1.2, y)
    # plain cream legs below the knees and the hocks
    r['low'] = sstep(1.05, 0.85, y) * sstep(0.12, 0.2, x)
    r['belly'] = sstep(-0.3, -0.8, N[:, 1]) * sstep(2.2, 1.95, y) * (1 - r['low'])
    return r


def _reticulate(Pm, R, baby=False):
    """the patch pattern: Voronoi cells (polygons) whose size shrinks up the neck and down the legs; the line width"""
    y, z = Pm[:, 1], Pm[:, 2]
    leg = sstep(2.0, 1.7, y) * sstep(0.14, 0.22, Pm[:, 0])
    cs = 0.2 * (1 - leg) + leg * np.interp(y, [0.8, 1.3, 2.0], [0.07, 0.11, 0.18]).astype(F)
    nk = sstep(3.0, 3.4, y)
    cs = cs * (1 - nk) + nk * np.interp(y, [3.0, 4.6], [0.18, 0.1]).astype(F)
    cs = cs * (1 - R['head']) + R['head'] * 0.06
    X = Pm / cs[:, None]
    X = X + 0.12 * (np.stack([vnoise(Pm * 3 + 1.7, 81), vnoise(Pm * 3 + 4.1, 82), vnoise(Pm * 3 + 7.3, 83)], 1) - 0.5)
    f1, f2 = worley(X, 84)
    e = f2 - f1
    lw = (0.11 if baby else 0.07) * (1 + 0.6 * R['head'])
    line = sstep(lw, lw * 0.55, e)
    # darker centers in the patches (the "stars" of a reticulated coat)
    star = sstep(0.55, 0.15, f1)
    return line, star, f1


def paint(P, N, c, baby=False):
    R = _regions(P, N, c)
    Pm, Nm, L = R['Pm'], R['Nm'], R['L']
    y = Pm[:, 1]
    line, star, f1 = _reticulate(Pm, R, baby)
    n2 = fbm(Pm * 6, 3, 12)
    if baby:
        col = U.mix(np.tile(K['calf'], (len(P), 1)), K['calfDk'], star * 0.4)
        col = U.mix(col, K['calfLine'], line)
    else:
        col = U.mix(np.tile(K['patch'], (len(P), 1)), K['patchDk'], star * 0.45 + 0.15 * (n2 - 0.5))
        col = U.mix(col, K['patchLt'], sstep(0.3, -0.5, Nm[:, 1]) * 0.25)
        col = U.mix(col, K['line'], line)
    # the belly paler (the patches fade), the lower legs plain cream with a few faint spots
    col = U.mix(col, K['line'], R['belly'] * 0.45)
    spot = sstep(0.35, 0.2, f1) * sstep(0.6, 1.0, y)
    col = U.mix(col, U.mix(np.tile(K['leg'], (len(P), 1)), K['patchLt'], spot * 0.25), R['low'])
    # the face tan with small patches, a paler muzzle, dark round the eye
    col = U.mix(col, K['face'], R['head'] * 0.55)
    col = U.mix(col, K['muzzle'], R['muzzle'] * 0.75)
    col = U.mix(col, K['lid'], R['lid'] * 0.8)
    col = U.mix(col, K['earIn'], R['earIn'] * 0.8)
    col = U.mix(col, K['oss'], R['oss'] * 0.5)
    col = U.mix(col, K['black'], np.maximum(R['tuft'], R['ttuft']) * 0.95)
    col = U.mix(col, K['mane'], R['mane'] * 0.85)
    col = U.mix(col, K['hoof'], R['hoof'])
    col = U.mix(col, K['ball'], R['ball'])
    col *= (0.96 + 0.08 * fbm(Pm * 40, 2, 13))[:, None]
    rough = 0.82 - 0.25 * R['hoof'] - 0.35 * R['lid'] * sstep(EYE_R + 0.006, EYE_R + 0.002, R['eyeD']) - 0.1 * R['muzzle']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.96).astype(F)


def paint_baby(P, N, c):
    return paint(P, N, c, baby=True)


def detail(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    y = Pm[:, 1]
    skin = (1 - R['hoof']) * (1 - R['ball'])
    h = np.zeros(len(P), F)
    # the short coat: fine strokes along the body (down the neck and the legs)
    st = vnoise(Pm * V(260, 70, 260), 91)
    h += 0.00035 * (st - 0.5) * skin
    # the mane and the tufts: stiff hairs
    hs = vnoise(Pm * V(900, 60, 900), 92)
    h += 0.003 * (hs - 0.5) * np.maximum.reduce([R['mane'], R['tuft'], R['ttuft']])
    # wrinkles across the throat and the knees, hoof growth lines
    wr = np.abs(np.sin(np.pi * (y / 0.03 + 0.6 * fbm(Pm * 6, 2, 93))))
    h -= 0.0012 * np.exp(-(wr / 0.25) ** 2) * (sstep(0.3, 0.05, np.abs(y - 1.0)) * R['low'] + 0.0)
    h -= 0.0003 * np.abs(np.sin(y * 600)) * R['hoof']
    return h


def finish(C, ao, valid):
    return U.finish(C, ao, valid, floor=0.45)


MAP_QUALITY = (40, 44)
PAD_SMOOTH = 3
BABY_MAP = (192, 44)


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': U.lid_color(col, R['eyeD'], EYE_R)}


def meta(st):
    r = EYE_R
    up, dn = (LID_OFF + LID_H) / r, (LID_OFF - LID_H) / r
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.3],
                'iris': 0x2A1A10, 'irisR': 0.97, 'pupil': 'h', 'pupilR': 0.45, 'rim': 0x0C0705, 'lidCol': st['lidCol'],
                'lash': {'n': 16, 'len': 0.022, 'col': 0x1E1612}},
        'collar': {'at': ['neck3', 'neck4', 0.5], 'r': 0.9},
        'mouth': [round(float(v), 4) for v in MOUTH],
        # lying down: the brisket and the belly come to the ground
        'belly': [0.0, 1.9, -0.85],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.08, 0.06, 0.05], 'flat': 0x8A4A26,
    }
