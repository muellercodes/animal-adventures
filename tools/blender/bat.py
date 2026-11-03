# A fruit bat (a flying fox, round 10), sculpted as a signed distance field around the game's bat skeleton
# (tools/blender/work/bat-rig.json). Units are meters in game rig space (x left, y up, z forward, ground at y = 0).
# Built in its flight pose, wings spread: about 30 cm from nose to rump, 1.15 m across the wings. A fox-like head with
# a pointed muzzle, a black nose, big dark eyes and small pointed ears; a golden ruff over the neck and shoulders on a
# dark brown body; short hind legs with hooked claws. Each wing is the arm (humerus, forearm, a thumb with a claw at
# the wrist) and four long fingers (the 2nd to the 5th) with the thin leathery membrane between them, the arm, the
# body and the leg. The membranes are skinned to the arm, finger, body and leg bones (fix_weights), so they stretch
# and fold with the game's wing pose. Pups (the game gives them a bigger head and short wings) are grayer and fuzzier.
# Make it with: VOXEL=0.002 TRIS=6500 TEX=768 BLENDER_PY=... python3 tools/blender/make.py bat
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, loft, fbm, vnoise, worley, length
import carnivore as CV
from carnivore import local, local_n, mirror, mix, hexc

ID = 'bat'
BOUNDS = (V(-0.6, 0.0, -0.19), V(0.6, 0.175, 0.19))
BAKE_DIST = (0.0012, 0.004, 0.01)
DISSOLVE_DEGENERATE = True
TAIL_RINGS = 0

# ---------- landmarks (left side, +x), the same numbers as BAT in the game's 40_animals.js ----------
SH, EL, WR = V(0.026, 0.112, 0.052), V(0.136, 0.112, 0.052), V(0.306, 0.112, 0.052)
YM = 0.112                                   # the plane of the spread wing
# fingers from the wrist: (yaw in flight in degrees, 0 straight out, 90 straight back; length)
FING = [(-8.0, 0.12), (2.0, 0.27), (36.0, 0.22), (68.0, 0.2)]
FDIR = [V(np.cos(np.radians(a)), 0.0, -np.sin(np.radians(a))) for a, _ in FING]
FTIP = [WR + d * l for d, (_, l) in zip(FDIR, FING)]
FING_R = [(0.0028, 0.0014), (0.0034, 0.0013), (0.003, 0.0012), (0.0029, 0.0012)]
# the arm wing's bones f4 to f9 (the game's BAT.plag): pivots along the humerus and the forearm
PLAG_X = [SH[0] + 0.11 * t for t in (0.4, 0.9)] + [EL[0] + 0.17 * t for t in np.linspace(0.15, 0.9, 4)]
HIP = V(0.032, 0.09, -0.085)
KNEE = V(0.048, 0.058, -0.1)
ANKLE = V(0.052, 0.022, -0.092)
FOOT = V(0.052, 0.0, -0.08)
# head frame: from the back of the skull forward and a little down along the muzzle (s), up across it (u)
HF = CV.Frame(V(0.0, 0.124, 0.088), V(0.0, -0.13, 1.0), V(0.0, 1.0, 0.0))
EYE = CV.Eye(HF.pt(0.042, 0.005, 0.0152), 0.0068, V(0.72, 0.22, 0.66), lid_w=0.0062, lid_h=0.0057, off=0.0004, slant=0.08,
             mound=(0.0013, 0.0012, 0.0006), sink=0.1)
NOSE_S = 0.077
MOUTH = HF.pt(0.07, -0.009)
EAR_B = HF.pt(0.006, 0.018, 0.0135)
EAR_A = nrm([0.32, 0.9, -0.28])
EAR_N = nrm([0.5, 0.0, 0.86])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
EAR_L, EAR_W = 0.017, 0.0074
PATCHES = [
    (V(0.0, 0.104, 0.118), V(0.026, 0.142, 0.18), 0.0003),       # eye, nose, lips
    (V(0.004, 0.132, 0.08), V(0.032, 0.166, 0.112), 0.0003),     # ear
    (V(0.034, -0.0005, -0.102), V(0.072, 0.024, -0.05), 0.00035),  # foot and claws
    (V(0.29, 0.1, 0.04), V(0.336, 0.124, 0.09), 0.0004),         # wrist and thumb
]

# trunk (with the coat's volume): z, top, yw (height of widest), bottom, half width, exponents above, below
TRUNK = [
    (-0.112, 0.104, 0.098, 0.091, 0.008, 2.0, 2.0),
    (-0.096, 0.121, 0.1, 0.079, 0.025, 2.0, 2.0),
    (-0.064, 0.131, 0.102, 0.069, 0.035, 2.1, 2.0),
    (-0.024, 0.137, 0.104, 0.065, 0.041, 2.1, 2.0),
    (0.016, 0.139, 0.106, 0.065, 0.044, 2.1, 2.0),
    (0.046, 0.137, 0.108, 0.07, 0.041, 2.0, 2.0),
    (0.072, 0.133, 0.11, 0.08, 0.031, 2.0, 2.0),
    (0.09, 0.13, 0.112, 0.091, 0.021, 2.0, 2.0),
]
# head: along the head frame (s), top, height of widest, bottom, half width, exponents above, below
HEAD = [
    (-0.006, 0.019, 0.0, -0.019, 0.02, 2.0, 2.0),
    (0.008, 0.024, 0.001, -0.022, 0.025, 2.2, 2.0),
    (0.022, 0.023, 0.0, -0.022, 0.025, 2.2, 2.0),
    (0.036, 0.017, -0.002, -0.019, 0.019, 2.1, 2.0),
    (0.047, 0.0125, -0.004, -0.016, 0.0142, 2.0, 2.0),
    (0.058, 0.0092, -0.005, -0.0135, 0.0112, 2.0, 2.0),
    (0.068, 0.0065, -0.0055, -0.0108, 0.0088, 2.0, 2.0),
    (0.075, 0.004, -0.0055, -0.0082, 0.0066, 2.0, 2.0),
]


def trunk(P):
    Q = mirror(P)
    d = loft(Q, TRUNK)
    # the ruff: thick fur over the nape and shoulders and round the throat
    d = smin(d, ellipsoid(Q, V(0.0, 0.122, 0.064), V(0.04, 0.024, 0.032)), 0.02)
    d = smin(d, ellipsoid(Q, V(0.0, 0.09, 0.068), V(0.026, 0.02, 0.022)), 0.014)
    # the deep breast muscles that work the wings
    d = smin(d, ellipsoid(Q, V(0.016, 0.084, 0.03), V(0.022, 0.018, 0.03)), 0.014)
    return d


def head(P):
    Q = mirror(P)
    L = HF.loc(Q)
    d = loft(L, HEAD)
    # the rounded crown and the cheeks under the eyes
    d = smin(d, ellipsoid(L, V(0.0, 0.012, 0.012), V(0.02, 0.014, 0.018)), 0.01)
    d = smin(d, ellipsoid(L, V(0.0125, -0.008, 0.036), V(0.007, 0.008, 0.012)), 0.006)
    # the lower jaw under the muzzle, the chin
    d = smin(d, ellipsoid(L, V(0.0, -0.0118, 0.053), V(0.009, 0.0048, 0.02)), 0.004)
    # the nose: a black, slightly upturned pad, the nostrils as short tubes at its sides
    d = smin(d, ellipsoid(L, V(0.0, -0.0012, NOSE_S - 0.0015), V(0.0058, 0.0042, 0.003)), 0.002)
    for sg in (1.0,):
        c = V(0.0029 * sg, -0.0004, NOSE_S + 0.0002)
        d = smin(d, ellipsoid(L, c, V(0.0022, 0.002, 0.0018)), 0.0012)
        d = smax(d, -ellipsoid(L, c + V(0.0006, 0.0003, 0.0014), V(0.0009, 0.0011, 0.0012)), 0.0005)
    # the groove down the middle of the nose and upper lip
    cleft = np.maximum(np.abs(L[:, 0]) - 0.0003, np.maximum(L[:, 1] - 0.0004, -0.009 - L[:, 1]))
    cleft = np.maximum(cleft, (NOSE_S - 0.004) - L[:, 2])
    d = smax(d, -(cleft + 0.00005), 0.0004)
    # the mouth line along each side of the muzzle
    M = L * V(1, 2.5, 1)
    m = round_cone(M, V(0.0, -0.0088 * 2.5, NOSE_S - 0.006), V(0.0066, -0.0094 * 2.5, 0.062), 0.0005, 0.0005)
    m = smin(m, round_cone(M, V(0.0066, -0.0094 * 2.5, 0.062), V(0.0102, -0.0088 * 2.5, 0.046), 0.0005, 0.0004), 0.0008)
    d = smax(d, -(m + 0.0002) / 2.5, 0.0005)
    return d


def eye_parts(P):
    return EYE.parts(mirror(P))


def ear(P):
    """small, pointed and nearly bare, standing up at the back of the head, the opening forward and out"""
    Q = mirror(P)
    return CV.ear(Q, EAR_B, EAR_A, EAR_N, EAR_L, EAR_W, 'point', th0=0.0017, th1=0.0009, cup=0.6, tipin=0.0,
                  base_r=(0.005, 0.004, 0.004))


def ear_coords(Q):
    return CV.ear_coords(Q, EAR_B, EAR_A, EAR_N)


# ---------- wings ----------
def arm(P):
    """the humerus (muscled near the shoulder), the long thin forearm, the wrist and the thumb with its claw"""
    Q = mirror(P)
    d = round_cone(Q, SH + V(0.006, 0, 0), EL, 0.0095, 0.0058)
    d = smin(d, ellipsoid(Q, V(0.07, YM - 0.002, 0.05), V(0.032, 0.0085, 0.0095)), 0.006)
    d = smin(d, ellipsoid(Q, EL + V(-0.003, 0.0, -0.001), V(0.0065, 0.0058, 0.006)), 0.004)
    d = smin(d, round_cone(Q, EL, WR, 0.0055, 0.0041), 0.004)
    d = smin(d, ellipsoid(Q, WR, V(0.0058, 0.0052, 0.0058)), 0.003)
    th0, th1 = WR + V(0.004, 0.001, 0.005), WR + V(0.011, -0.001, 0.025)
    d = smin(d, round_cone(Q, th0, th1, 0.0034, 0.0023), 0.003)
    return d


def claws(P):
    """the thumb claw (a strong hook), a small claw on the 2nd finger"""
    Q = mirror(P)
    t1 = WR + V(0.011, -0.001, 0.025)
    c = round_cone(Q, t1 + V(0.0, 0.0006, 0.001), t1 + V(0.002, -0.004, 0.009), 0.0017, 0.0005)
    c = np.minimum(c, round_cone(Q, t1 + V(0.002, -0.004, 0.009), t1 + V(0.002, -0.0075, 0.0085), 0.0006, 0.0002))
    c = np.minimum(c, round_cone(Q, FTIP[0], FTIP[0] + FDIR[0] * 0.004 + V(0, -0.0015, 0), 0.0011, 0.0003))
    return c


def fingers(P):
    Q = mirror(P)
    d = None
    for k in range(4):
        r0, r1 = FING_R[k]
        a, b = WR + FDIR[k] * 0.003, FTIP[k]
        j = WR + FDIR[k] * (FING[k][1] * 0.5)
        f = smin(round_cone(Q, a, j, r0, (r0 + r1) * 0.55), round_cone(Q, j, b, (r0 + r1) * 0.55, r1), 0.002)
        # the knuckle between the long bones
        f = smin(f, ellipsoid(Q, j, V(r0 * 0.95, r0 * 0.85, r0 * 0.95)), 0.0015)
        d = f if d is None else np.minimum(d, f)
    return d


def _bez(a, c, b, n):
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) ** 2 * a + 2 * (1 - t) * t * c + t * t * b


def _scallop(a, b, k, n=14):
    """a concave trailing edge from a to b: the middle drawn in toward the wrist by k (of the length)"""
    m = (a + b) * 0.5
    c = m + nrm(WR[[0, 2]] - m) * (np.linalg.norm(b - a) * k)
    return _bez(a, c, b, n)


def _outline():
    """the left wing's membrane outline in the x-z plane (closed polygon)"""
    xz = lambda p: np.array([p[0], p[2]], F)
    t = [xz(p) for p in FTIP]
    pts = [np.array([[0.018, 0.068], [0.06, 0.069], [0.136, 0.066], [0.24, 0.064], [0.3, 0.063]], F)]
    # the 2nd finger leads, its tip joins the 3rd finger half way out
    j3 = xz(WR + FDIR[1] * (FING[1][1] * 0.55)) + np.array([0.0, 0.0035], F)
    pts.append(np.array([xz(WR + FDIR[0] * 0.02) + np.array([0, 0.004], F), t[0] + np.array([0.0, 0.0025], F), j3,
                         t[1] + np.array([0.003, 0.002], F)], F))
    pts.append(_scallop(t[1], t[2], 0.17)[1:])
    pts.append(_scallop(t[2], t[3], 0.15)[1:])
    # the arm wing: a long, gently hollow trailing edge from the 5th finger to the flank by the hip
    att = np.array([0.06, -0.15], F)
    pts.append(_bez(t[3], (t[3] + att) * 0.5 + np.array([0.0, 0.018], F), att, 24)[1:])
    pts.append(np.array([[0.035, -0.135], [0.018, -0.11]], F))
    return np.concatenate(pts, 0)


_mcache = {}


def _memb2d():
    """signed distance to the outline on a fine x-z raster (computed once), with bilinear lookup"""
    if 'g' not in _mcache:
        poly = _outline()
        x0, x1, z0, z1, h = 0.0, 0.6, -0.16, 0.1, 0.0005
        xs = np.arange(x0, x1 + h, h, dtype=F); zs = np.arange(z0, z1 + h, h, dtype=F)
        X, Z = np.meshgrid(xs, zs, indexing='ij')
        q = np.stack([X.ravel(), Z.ravel()], 1)
        a = poly; b = np.roll(poly, -1, 0)
        dist = np.full(len(q), 1e9, F); inside = np.zeros(len(q), bool)
        for i in range(len(a)):
            e = b[i] - a[i]
            w = q - a[i]
            t = np.clip((w @ e) / max(float(e @ e), 1e-12), 0, 1)
            dist = np.minimum(dist, np.linalg.norm(w - t[:, None] * e[None, :], axis=1))
            # even-odd crossings for the sign
            c = ((a[i][1] > q[:, 1]) != (b[i][1] > q[:, 1]))
            xi = a[i][0] + (q[:, 1] - a[i][1]) * (b[i][0] - a[i][0]) / (b[i][1] - a[i][1] + 1e-12)
            inside ^= c & (q[:, 0] < xi)
        _mcache['g'] = (np.where(inside, -dist, dist).reshape(X.shape).astype(F), x0, z0, h, X.shape)
    return _mcache['g']


def memb_xz(Q):
    G, x0, z0, h, sh = _memb2d()
    fx = np.clip((Q[:, 0] - x0) / h, 0, sh[0] - 1.001); fz = np.clip((Q[:, 2] - z0) / h, 0, sh[1] - 1.001)
    i, k = fx.astype(np.int64), fz.astype(np.int64)
    u, v = fx - i, fz - k
    g = (G[i, k] * (1 - u) * (1 - v) + G[i + 1, k] * u * (1 - v) + G[i, k + 1] * (1 - u) * v + G[i + 1, k + 1] * u * v)
    # outside the raster: far
    out = (Q[:, 0] < x0) | (Q[:, 0] > x0 + h * (sh[0] - 1)) | (Q[:, 2] < z0) | (Q[:, 2] > z0 + h * (sh[1] - 1))
    return np.where(out, 1.0, g).astype(F)


def membrane(P):
    """the thin membrane: thicker toward the body, thinner at the free edges, rounded rims"""
    Q = mirror(P)
    e = memb_xz(Q)
    th = 0.0013 + 0.0008 * sstep(0.08, 0.03, Q[:, 0]) - 0.0003 * sstep(-0.012, 0.0, e)
    dy = np.abs(Q[:, 1] - YM) - th
    return (np.sqrt(np.maximum(e, 0) ** 2 + np.maximum(dy, 0) ** 2) + np.minimum(np.maximum(e, dy), 0)).astype(F)


# ---------- legs ----------
TOES = [(-28, 0.002, 0.0085, 0.0016), (-13, 0.0025, 0.0095, 0.0017), (0, 0.0027, 0.01, 0.0017), (13, 0.0025, 0.0095, 0.0017),
        (28, 0.002, 0.0085, 0.0016)]


def leg(P):
    Q = mirror(P)
    d = ellipsoid(Q, HIP + V(-0.004, 0.002, 0.004), V(0.014, 0.014, 0.017))
    d = smin(d, round_cone(Q, HIP + V(0.006, -0.008, -0.006), KNEE, 0.0068, 0.0052), 0.005)
    d = smin(d, round_cone(Q, KNEE, ANKLE, 0.0048, 0.0036), 0.003)
    d = smin(d, round_cone(Q, ANKLE, FOOT + V(0.0, 0.004, -0.008), 0.0036, 0.0034), 0.003)
    return d


def feet(P):
    """narrow feet with five equal toes, each with a strongly curved claw (to hang by)"""
    Q = mirror(P)
    return CV.hand(Q, FOOT, TOES, (0.0058, 0.0028, 0.0085), yaw=0.0, claw=(0.0055, 0.0011), palm_c=(0.0, -0.002))


# ---------- assembled ----------
WING_BOX = (V(-0.6, YM - 0.012, -0.16), V(0.6, YM + 0.012, 0.1))


def parts(P):
    ca, li, ba = eye_parts(P)
    ft, cl = feet(P)
    return {'trunk': trunk(P), 'head': head(P), 'ear': ear(P), 'lids': li, 'ball': ba, 'arm': arm(P), 'finger': fingers(P),
            'memb': local(P, *WING_BOX, membrane), 'leg': leg(P), 'foot': ft, 'claw': np.minimum(cl, claws(P))}


def shape(P):
    d = trunk(P)
    h = local(P, (-0.05, 0.085, 0.06), (0.05, 0.16, 0.19), head)
    ca, li, ba = local_n(P, (-0.032, 0.112, 0.118), (0.032, 0.142, 0.148), eye_parts, 3)
    h = smin(h, li, 0.0012)
    h = smax(h, -ca, 0.0005)
    h = smin(h, ba, 0.0002)
    d = smin(d, h, 0.012)
    d = smin(d, local(P, (-0.04, 0.125, 0.07), (0.04, 0.17, 0.115), ear), 0.0025)
    w = local(P, (-0.36, YM - 0.016, 0.02), (0.36, YM + 0.016, 0.1), arm)
    w = smin(w, local(P, (-0.6, YM - 0.006, -0.12), (0.6, YM + 0.006, 0.085), fingers), 0.003)
    w = smin(w, local(P, *WING_BOX, membrane), 0.0025)
    d = smin(d, w, 0.006)
    d = smin(d, local(P, (-0.08, 0.012, -0.125), (0.08, 0.11, -0.06), leg), 0.006)
    ft, cl = local_n(P, (-0.075, -0.002, -0.1), (0.075, 0.014, -0.055), feet, 2)
    d = smin(d, ft, 0.003)
    d = np.minimum(d, cl)
    d = np.minimum(d, local(P, (-0.34, YM - 0.016, 0.04), (0.34, YM + 0.006, 0.09), claws))
    return d


def grid(h):
    """finer across the thin membranes (y), the head and the ears"""
    from sdf import axis_steps
    lo, hi = BOUNDS
    xs = axis_steps(0.0, hi[0], [(0.004, 0.032, h * 0.6)], h)
    ys = axis_steps(lo[1], hi[1], [(YM - 0.012, YM + 0.012, min(h * 0.25, 0.0005)), (0.125, 0.17, h * 0.7)], h)
    zs = axis_steps(lo[2], hi[2], [(-0.1, -0.055, h * 0.6), (0.075, 0.185, h * 0.6)], h)
    return xs, ys, zs


PREVIEW = {
    'top': ((0.002, 1.4, 0.0), (0, 0.1, -0.02), 40),
    'front3q': ((0.55, 0.45, 0.7), (0.15, 0.1, 0.0), 40),
    'side': ((0.6, 0.12, 0.0), (0, 0.1, 0.02), 30),
    'face': ((0.12, 0.15, 0.32), (0, 0.12, 0.12), 22),
    'faceside': ((0.25, 0.13, 0.13), (0.0, 0.12, 0.12), 22),
    'under': ((0.25, -0.5, 0.1), (0.15, 0.1, 0.0), 40),
    'feet': ((0.16, 0.04, 0.05), (0.04, 0.01, -0.08), 30),
    'wrist': ((0.38, 0.2, 0.2), (0.31, 0.11, 0.06), 28),
}


# ---------- game mesh: decimation, texture layout, skinning ----------
def _wingk(Pm):
    """1 on the membranes, the fingers and the forearm, 0 on the body"""
    return sstep(0.035, 0.06, Pm[:, 0]) * sstep(0.014, 0.006, np.abs(Pm[:, 1] - YM))


def keep(P):
    Pm = mirror(P)
    base = np.full(len(P), 0.44, F)
    e = sstep(0.014, 0.007, np.linalg.norm(Pm - EYE.c, axis=1)) * 0.85
    L = HF.loc(Pm)
    hd = sstep(-0.004, 0.012, L[:, 2]) * sstep(0.085, 0.095, Pm[:, 1]) * sstep(0.04, 0.03, Pm[:, 0]) * 0.62
    m = sstep(0.07, 0.08, L[:, 2]) * sstep(0.04, 0.03, Pm[:, 0]) * 0.75
    a, c, n = ear_coords(Pm)
    er = sstep(-0.002, 0.0, a) * sstep(0.01, 0.007, np.abs(c)) * sstep(0.004, 0.0025, np.abs(n)) * 0.7
    ft = sstep(0.016, 0.006, Pm[:, 1]) * 0.6
    wk = _wingk(Pm)
    out = np.maximum.reduce([base, e, hd, m, er, ft])
    # the flat membranes need few triangles; the fingers, the arm and the thumb keep their outline
    tube = sstep(0.0045, 0.0015, np.abs(Pm[:, 1] - YM) - 0.0014)
    return (out * (1 - wk) + wk * (0.26 + 0.2 * tube)).astype(F)


UV_AVERAGE = True
UV_PACK = dict(margin_method='FRACTION', margin=0.012)


def uv_regions(P):
    """head, ears, body, legs and feet, arms, membranes (top, under)"""
    Pm = mirror(P)
    L = HF.loc(Pm)
    lab = np.full(len(P), 2)
    head = (L[:, 2] > -0.002) & (Pm[:, 1] > 0.09) & (np.abs(Pm[:, 0]) < 0.04)
    a, c, n = ear_coords(Pm)
    earm = (a > 0.002) & (np.abs(c) < 0.012) & (Pm[:, 1] > 0.13)
    legs = (Pm[:, 1] < 0.08) & (Pm[:, 2] < -0.04) & (np.abs(Pm[:, 0]) > 0.02)
    wing = (Pm[:, 0] > 0.045) & (np.abs(Pm[:, 1] - YM) < 0.014)
    lab[legs] = 3
    lab[head] = 0
    lab[earm] = 8
    lab[wing] = 5
    return lab


def uv_weight(P):
    Pm = mirror(P)
    L = HF.loc(Pm)
    head = sstep(-0.002, 0.012, L[:, 2]) * sstep(0.09, 0.1, Pm[:, 1]) * sstep(0.04, 0.03, Pm[:, 0])
    wk = _wingk(Pm)
    return (1.0 + 0.9 * head - 0.62 * wk).astype(F)


WEIGHT_SMOOTH = (0, 0)   # fix_weights builds every weight itself, blends included


def bone_tips(P):
    t = {'hips': P['neck'], 'neck': P['head'], 'head': HF.pt(NOSE_S, 0.0)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, 0.002, 0.012)) * m
        t['wing' + s] = EL * m; t['wfore' + s] = WR * m; t['whand' + s] = (WR + V(0.012, 0, 0)) * m
        for k in range(4):
            t['f%d%s' % (k, s)] = FTIP[k] * m
        for k, x0 in enumerate(PLAG_X):
            t['f%d%s' % (4 + k, s)] = V(x0, YM, WR[2] - 0.08) * m
    return t


def _seg_t(Q, a, b):
    ab = b - a
    return np.clip(((Q - a) @ ab) / float(ab @ ab), 0, 1)


def _yaw(Q):
    """the direction from the wrist in the wing plane (degrees, 0 straight out, 90 straight back)"""
    return np.degrees(np.arctan2(-(Q[:, 2] - WR[2]), Q[:, 0] - WR[0]))


def _arm_w(Q, nb):
    """weights along the leading edge at each point's x: shoulder (into the body), humerus, forearm, wrist"""
    x = Q[:, 0]
    W = np.zeros((len(Q), nb['n']), F)
    t1 = sstep(EL[0] - 0.012, EL[0] + 0.012, x)
    t2 = sstep(WR[0] - 0.01, WR[0] + 0.006, x)
    W[:, nb['wing']] = (1 - t1)
    W[:, nb['wfore']] = t1 * (1 - t2)
    W[:, nb['whand']] = t2
    return W


def _hand_w(Q, nb):
    """weights in the hand wing by the direction from the wrist: between the two neighboring fingers"""
    a = _yaw(Q)
    ang = np.array([f[0] for f in FING], F)
    W = np.zeros((len(Q), nb['n']), F)
    a = np.clip(a, ang[0], ang[-1])
    for k in range(3):
        on = (a >= ang[k]) & (a <= ang[k + 1])
        u = (a[on] - ang[k]) / (ang[k + 1] - ang[k])
        W[on, nb['f%d' % k]] += (1 - u)
        W[on, nb['f%d' % (k + 1)]] += u
    W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
    # in front of the 2nd finger (the thumb, the leading edge by the wrist): the hand bone
    k = sstep(ang[0] - 6, ang[0] - 16, _yaw(Q))
    W *= (1 - k)[:, None]
    W[:, nb['whand']] += k
    return W


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    x = wpos[:, 0]
    Pm = mirror(wpos)
    y, z = Pm[:, 1], Pm[:, 2]
    n = len(wpos)
    out = np.zeros_like(W)
    c = parts(wpos.astype(F))
    for s, sg in (('L', 1), ('R', -1)):
        side = (x * sg) >= 0 if sg > 0 else x < 0
        nb = {'n': len(names)}
        for b in ('wing', 'wfore', 'whand', 'thigh', 'shin', 'hmeta', 'hpaw') + tuple('f%d' % k for k in range(10)):
            nb[b] = bi[b + s]
        nb['hips'], nb['neck'], nb['head'] = bi['hips'], bi['neck'], bi['head']
        Q = Pm[side]
        cs = {k: v[side] for k, v in c.items()}
        Wl = np.zeros((len(Q), len(names)), F)
        # body: hips, neck, head along z; the head from just behind the skull
        L = HF.loc(Q)
        th = sstep(-0.01, 0.008, L[:, 2]) * sstep(0.05, 0.04, Q[:, 0])
        tn = sstep(0.02, 0.07, Q[:, 2]) * (1 - th)
        Wl[:, nb['head']] = th
        Wl[:, nb['neck']] = tn
        Wl[:, nb['hips']] = 1 - th - tn
        # hind legs: the haunch blends into the hips, then thigh, shin, foot by height
        dl = np.minimum(cs['leg'], np.minimum(cs['foot'], cs['claw'] + 0.002))
        onl = (dl < cs['trunk'] + 0.001) & (Q[:, 2] < -0.05) & (Q[:, 0] > 0.012)
        kl = sstep(0.0, 0.006, cs['trunk'] - dl) * onl
        tk = _seg_t(Q, HIP, KNEE); ta = _seg_t(Q, KNEE, ANKLE)
        lw = np.zeros((len(Q), len(names)), F)
        k_sh = sstep(0.6, 0.95, tk)
        k_me = sstep(0.03, 0.019, Q[:, 1])
        # (the whole foot rides on the metatarsus: split onto the paw bone it came apart from the shin)
        k_pw = np.zeros(len(Q), F)
        lw[:, nb['thigh']] = 1.0
        lw = lw * (1 - k_sh[:, None]); lw[:, nb['shin']] += k_sh
        lw = lw * (1 - k_me[:, None]); lw[:, nb['hmeta']] += k_me
        lw = lw * (1 - k_pw[:, None]); lw[:, nb['hpaw']] += k_pw
        Wl = Wl * (1 - kl[:, None]) + lw * kl[:, None]
        # the wing: arm, fingers and membranes, by where they lie in the wing plane
        dwp = np.minimum(np.minimum(cs['memb'], cs['finger']), np.minimum(cs['arm'], np.where(Q[:, 0] > 0.1, cs['claw'], 1.0)))
        onw = ((np.abs(Q[:, 1] - YM) < 0.016) & (Q[:, 0] > 0.026) & (dwp < cs['trunk'] - 0.0003) & (dwp < 0.004)) | ((Q[:, 0] > 0.065) & (Q[:, 1] > 0.06))
        wing = np.zeros((len(Q), len(names)), F)
        aw = _arm_w(Q, nb)
        hw = _hand_w(Q, nb)
        # beyond the wrist (and in front of the 5th finger): the hand wing; the fingers themselves on their own bone
        r = np.linalg.norm((Q - WR)[:, [0, 2]], axis=1)
        a = _yaw(Q)
        hand = sstep(0.004, 0.016, r) * sstep(FING[3][0] + 10, FING[3][0] - 2, a) * sstep(WR[0] - 0.012, WR[0] + 0.002, Q[:, 0])
        # the arm wing behind the arm: on its own bones along the arm (between the two nearest by x), the 5th finger
        # behind the wrist, the hips at the flank; the arm itself at the leading edge
        px = np.array(PLAG_X, F)
        xi = np.clip(Q[:, 0], px[0], px[-1])
        j = np.clip(np.searchsorted(px, xi) - 1, 0, len(px) - 2)
        u = (xi - px[j]) / (px[j + 1] - px[j])
        pw = np.zeros((len(Q), len(names)), F)
        rows = np.arange(len(Q))
        np.add.at(pw, (rows, np.array([nb['f%d' % (4 + k)] for k in j])), 1 - u)
        np.add.at(pw, (rows, np.array([nb['f%d' % (5 + k)] for k in j])), u)
        k5 = sstep(WR[0] - 0.03, WR[0] + 0.006, Q[:, 0]) * sstep(FING[3][0] + 22, FING[3][0] + 2, a)
        f3 = np.zeros((len(Q), len(names)), F); f3[:, nb['f3']] = 1
        pw = pw * (1 - k5[:, None]) + f3 * k5[:, None]
        kh = sstep(0.058, 0.034, Q[:, 0])
        hp = np.zeros((len(Q), len(names)), F); hp[:, nb['hips']] = 1
        pw = pw * (1 - kh[:, None]) + hp * kh[:, None]
        f = sstep(0.003, 0.018, WR[2] - Q[:, 2])
        plag = aw * (1 - f[:, None]) + pw * f[:, None]
        wing = plag * (1 - hand[:, None]) + hw * hand[:, None]
        # the finger tubes: wholly on their finger (the wrist end blends into the hand)
        for k in range(4):
            t = _seg_t(Q, WR, FTIP[k])
            dk = np.linalg.norm(Q - (WR + np.outer(t, FTIP[k] - WR)), axis=1)
            onf = (dk < FING_R[k][0] + 0.0012) & (t > 0.02)
            kf = sstep(0.02, 0.06, t)
            row = np.zeros(len(names), F); row[nb['f%d' % k]] = 1
            wing[onf] = wing[onf] * (1 - kf[onf, None]) + row[None, :] * kf[onf, None]
        # near the body the membrane stays with the flank
        kb = sstep(0.045, 0.028, Q[:, 0])
        bodyw = np.zeros((len(Q), len(names)), F); bodyw[:, nb['hips']] = 1
        wing = wing * (1 - kb[:, None]) + bodyw * kb[:, None]
        # the arm itself near the shoulder: into the body
        ka = sstep(0.042, 0.02, Q[:, 0]) * sstep(0.012, 0.004, np.abs(Q[:, 1] - YM))
        Wl[onw] = wing[onw]
        sh = (Q[:, 0] < 0.05) & (Q[:, 0] > 0.02) & (np.abs(Q[:, 1] - YM) < 0.016) & (np.abs(Q[:, 2] - SH[2]) < 0.022) & (th < 0.01)
        sw = np.zeros((len(Q), len(names)), F); sw[:, nb['wing']] = 0.6; sw[:, nb['hips']] = 0.4
        Wl[sh & ~onw] = Wl[sh & ~onw] * (1 - ka[sh & ~onw, None]) + sw[sh & ~onw] * ka[sh & ~onw, None]
        out[side] = Wl
    s = out.sum(1, keepdims=True)
    return out / np.maximum(s, 1e-9)


# ---------- coat: direction, regions, paint ----------
def flow(P, N=None):
    """from the nose back over the head, back along the body and down its sides, out along the arms"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    one = np.ones_like(y)
    body = np.stack([0.25 * sstep(0.01, 0.04, x), -(0.2 + 0.6 * sstep(0.1, 0.07, y)), -one], 1)
    L = HF.loc(Q)
    head = -HF.a[None, :] + np.stack([0.4 * sstep(0.003, 0.02, x), 0 * y, 0 * y], 1)
    wh = sstep(-0.006, 0.01, L[:, 2]) * sstep(0.09, 0.1, y)
    armd = np.stack([one, 0 * y, -0.2 * one], 1)
    wa = sstep(0.035, 0.06, x)
    legd = np.stack([0 * y, -one, 0 * y], 1)
    wl = sstep(0.07, 0.05, y) * (1 - wh)
    wb = np.clip(1 - wh - wa - wl, 0, 1)
    f = body * wb[:, None] + head * wh[:, None] + armd * wa[:, None] + legd * wl[:, None]
    f = f / np.maximum(np.linalg.norm(f, axis=1, keepdims=True), 1e-9)
    f[:, 0] *= np.sign(P[:, 0] + 1e-12)
    return f.astype(F)


def _regions(P, N, c):
    x = P[:, 0]
    r = {}
    Pm = mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(x + 1e-9)
    r['Pm'], r['Nm'] = Pm, Nm
    y, z = Pm[:, 1], Pm[:, 2]
    L = HF.loc(Pm)
    r['L'] = L
    de = np.linalg.norm(Pm - EYE.c, axis=1)
    r['eyeD'] = de
    r['ball'] = sstep(0.0003, 0.0001, c['ball']) * sstep(EYE.r + 0.001, EYE.r + 0.0003, de)
    r['lid'] = sstep(EYE.r + 0.0035, EYE.r + 0.0018, de) * (1 - r['ball'])
    r['head'] = sstep(-0.008, 0.006, L[:, 2]) * sstep(0.002, 0.0, c['head'] - c['trunk'] + 0.004) * sstep(0.09, 0.1, y)
    r['nose'] = sstep(0.0008, 0.0, ellipsoid(L, V(0.0, -0.0012, NOSE_S - 0.0015), V(0.0064, 0.0048, 0.0036))) * sstep(NOSE_S - 0.005, NOSE_S - 0.0025, L[:, 2])
    r['muzzle'] = sstep(0.052, 0.072, L[:, 2]) * r['head']
    a, cc, n = ear_coords(Pm)
    r['ea'] = a
    r['ear'] = sstep(0.0008, 0.0002, c['ear']) * sstep(-0.001, 0.003, a)
    dw = np.minimum(np.minimum(c['memb'], c['finger']), c['arm'])
    r['wing'] = sstep(0.0008, 0.0, dw - np.minimum(c['trunk'], c['leg']) + 0.0006) * sstep(0.03, 0.045, Pm[:, 0])
    r['finger'] = sstep(0.0006, 0.0, c['finger'] - c['memb']) * r['wing']
    r['armb'] = sstep(0.0006, 0.0, c['arm'] - c['memb']) * r['wing']
    r['memb'] = r['wing'] * (1 - r['finger']) * (1 - r['armb'])
    r['foot'] = sstep(0.0008, 0.0, c['foot']) * sstep(0.014, 0.008, y)
    r['shank'] = sstep(0.0008, 0.0, c['leg'] - c['trunk'] + 0.002) * sstep(0.07, 0.05, y) * (1 - r['foot'])
    r['claw'] = sstep(0.0003, 0.0, c['claw'])
    r['top'] = sstep(0.3, 0.85, N[:, 1])
    # the ruff: the nape, the shoulders and round the throat
    r['ruff'] = sstep(0.01, 0.04, z) * sstep(0.1, 0.084, z) * (1 - r['wing']) * (1 - 0.65 * sstep(-0.1, -0.7, N[:, 1]))
    return r


K = {
    'body': hexc(0x2C201A), 'bodyLt': hexc(0x4A362A), 'belly': hexc(0x3A2A20), 'ruff': hexc(0xB27A3A), 'ruffLt': hexc(0xD09A52),
    'ruffDk': hexc(0x7E5228), 'head': hexc(0x3E2C20), 'muzzle': hexc(0x22180F), 'nose': hexc(0x0E0B0A), 'ear': hexc(0x1E1714),
    'skin': hexc(0x241B16), 'memb': hexc(0x1C1512), 'membLt': hexc(0x34281F), 'vein': hexc(0x43342A), 'claw': hexc(0x0C0A09),
    'ball': hexc(0x050303), 'lid': hexc(0x1A1210),
}


def _lenk(Pm):
    L = HF.loc(Pm)
    hd = sstep(-0.006, 0.01, L[:, 2]) * sstep(0.09, 0.1, Pm[:, 1])
    return np.clip(1.0 - 0.45 * hd, 0.4, 1.4)


_scache = {}


def _strands(P, N, R):
    key = (len(P), float(P[:7].sum()))
    if key not in _scache:
        dens = 0.92 * (1 - R['nose']) * (1 - R['ball']) * (1 - R['claw']) * (1 - R['wing']) * (1 - R['foot']) * (1 - 0.8 * R['ear']) * sstep(EYE.r + 0.0008, EYE.r + 0.002, R['eyeD'])
        _scache[key] = CV.strands(P, N, dens, flow, 0.0016, 0.0028, 0.0052, 0.00028, seed=91, lenk=lambda Q: _lenk(mirror(Q)))
    return _scache[key]


def _veins(Pm):
    """faint veins in the membranes: lines running out from the arm, branching (a stretched noise ridge)"""
    a = _yaw(Pm)
    hand = Pm[:, 0] > WR[0]
    u = np.where(hand, a / 6.0, Pm[:, 0] / 0.012)
    v = 1 - np.abs(2 * vnoise(np.stack([u, Pm[:, 0] * 30 * hand, (Pm[:, 2] - Pm[:, 0] * 0.2) * 80 * ~hand], 1), 71) - 1)
    return sstep(0.82, 0.96, v)


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    n1 = fbm(Pm * 70, 3, 11)
    n2 = fbm(Pm * 300, 3, 12)
    # coat: dark brown, a little paler underneath; the golden ruff; the head brown, the muzzle near black
    col = np.tile(K['body'], (len(P), 1))
    col = mix(col, K['belly'], sstep(-0.1, -0.7, N[:, 1]) * 0.6)
    col *= (0.92 + 0.16 * n1)[:, None]
    ru = mix(np.tile(K['ruff'], (len(P), 1)), K['ruffLt'], R['top'] * 0.5 + 0.25 * (n1 - 0.5))
    ru = mix(ru, K['ruffDk'], sstep(-0.2, -0.8, N[:, 1]) * 0.55)
    col = mix(col, ru, R['ruff'] * (1 - R['head']))
    hc = mix(np.tile(K['head'], (len(P), 1)), K['muzzle'], R['muzzle'] * 0.85)
    col = mix(col, hc, R['head'])
    col = mix(col, K['ear'], R['ear'])
    col = mix(col, K['nose'], R['nose'])
    col = mix(col, K['lid'], R['lid'])
    # coat hairs: soft strokes, the ruff's longer and lighter at the tips
    s, tone = _strands(P, N, R)
    col *= (1 + s * 0.3 * (tone - 0.4) - 0.06 * (1 - s))[:, None]
    col = mix(col, K['ruffLt'], s * sstep(0.55, 0.9, tone) * R['ruff'] * 0.35)
    # the wings: dark leathery skin, a little lighter and warmer where it is thin, faint veins, darker finger bones
    vv = _veins(Pm)
    mc = mix(np.tile(K['memb'], (len(P), 1)), K['membLt'], sstep(0.6, 0.9, n1) * 0.3 + 0.15 * sstep(0.1, 0.3, Pm[:, 0]))
    mc = mix(mc, K['vein'], vv * 0.35)
    col = mix(col, mc, R['memb'])
    col = mix(col, K['skin'], R['finger'] + R['armb'])
    col = mix(col, K['skin'], R['shank'] * 0.7 + R['foot'])
    col = mix(col, K['claw'], R['claw'])
    col = mix(col, K['ball'], R['ball'])
    rough = 0.82 + 0.06 * (n2 - 0.5) - 0.32 * R['nose'] - 0.45 * R['ball'] - 0.22 * R['wing'] - 0.3 * R['claw']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    h = np.zeros(len(P), F)
    s, tone = _strands(P, N, R)
    h += 0.00004 * s * (1 - R['wing']) * (1 - R['nose'])
    # the membranes: fine wrinkles along the fingers and the arm, raised veins
    a = _yaw(Pm)
    wr = np.sin(np.where(Pm[:, 0] > WR[0], a * 0.9, Pm[:, 0] * 900 + 6 * vnoise(Pm * 60, 72)))
    h += (0.00003 * wr + 0.00004 * _veins(Pm)) * R['memb']
    # the skin of the nose: fine pebbling
    g1, _ = worley(Pm / 0.0003, 58)
    h -= 0.000012 * sstep(0.35, 0.1, g1) * R['nose']
    return h


def finish(C, ao, valid):
    return CV.finish(C, ao, valid, 0.45)


FUR = {'len': 0.012, 'n': 4, 'lean': 1.0, 'tile': 0.0009, 'babyLen': 1.35, 'babyLean': 0.5, 'shade': 0.62, 'quality': 78}


def fur(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    ln = np.full(len(P), 0.0075, F)
    ln = ln + 0.0035 * R['ruff']
    ln = ln - 0.002 * sstep(-0.3, -0.8, N[:, 1])
    hd = R['head']
    face = 0.003 + 0.0015 * sstep(0.03, 0.0, L[:, 2]) - 0.0015 * R['muzzle']
    ln = ln * (1 - hd) + hd * face
    ln = ln * (1 - R['ear']) * (1 - R['wing']) * (1 - R['foot']) * (1 - R['claw']) * (1 - 0.7 * R['shank'])
    ln = ln * (1 - R['nose']) * sstep(EYE.r + 0.0012, EYE.r + 0.0032, R['eyeD'])
    return np.clip(ln, 0, FUR['len']).astype(F), np.ones(len(P), F)


MAP_QUALITY = (72, 64)
PAD_SMOOTH = 4


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': CV.lid_color(col, R['eyeD'], EYE.r)}


def meta(st):
    p, r, d, lid = EYE.meta()
    return {
        # big dark brown eyes with a large pupil
        'eye': {'p': p, 'r': r, 'dir': d, 'lid': lid, 'iris': 0x2A1608, 'irisR': 0.95, 'pupilR': 0.55, 'rim': 0x0A0604, 'lidCol': 0x1E1612,
                'babyLidCol': 0x3A3430},
        # a band round the neck in the ruff, just behind the head
        'collar': {'at': ['neck', 'head', 0.55], 'w': 0.6, 'r': 0.6, 'lift': 0.25},
        'belly': [0.0, 0.066, -0.01],
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.1, 0.07, 0.05], 'flat': 0x2C201A,
    }


# ---------- pups: grayer and fuzzier, the ruff only a pale wash ----------
BABY_TEX = 256


def baby_paint(P, N, c, col):
    R = _regions(P, N, c)
    keep_ = np.clip(R['nose'] + R['ball'] + R['lid'] + R['claw'], 0, 1)
    fur_ = (1 - R['wing']) * (1 - R['foot']) * (1 - R['ear'])
    out = mix(col, hexc(0x5E5852), 0.6 * (1 - keep_) * fur_)
    out = mix(out, hexc(0x8A7E70), R['ruff'] * (1 - R['head']) * 0.5)
    out = mix(out, hexc(0x3E3430), R['wing'] * 0.5)
    return np.clip(out, 0, 1).astype(F)
