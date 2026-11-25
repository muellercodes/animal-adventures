# round 17: the big crested Pteranodon longiceps (the game's "Pterodactyl"), about 7 m across the wings, sculpted as a
# signed distance field around the game's pterodactyl skeleton (tools/blender/work/pterodactyl-rig.json). Units are
# meters in game rig space (x left, y up, z forward, ground at y = 0). Built like bat.py: in its flight pose, the wings
# spread flat in the plane of the arm (y = YM), the membranes a thin plate cut to a 2D outline (_outline()).
# Shape: a small deep body covered in short fuzz (pycnofibres, fur shells), a long neck, a long skull: a straight,
# toothless, pointed beak and a long blade of a crest pointing back from the top of the skull (on its own horn bone,
# hornC: none on a hatchling, a small one on a girl); the arm (humerus, forearm, the long hand bone) and the huge
# fourth finger making the leading edge, three small clawed fingers at the knuckle, a little membrane in front of the
# arm (the propatagium) and the main membrane from the arm and the finger back to the flank and the thigh; slim hind legs
# with four clawed toes, a tiny tail.
# Paint: warm gray-brown fuzz, paler below; an ivory beak darkening toward its tip; a deep red crest with darker edges;
# dark gray-brown wing membranes with faint fibres running along them, the bones of the leading edge paler. The
# hatchling: paler and fuzzier (its own color map); its crest bone scales to nothing.
# Make it with: VOXEL=0.012 TRIS=6400 TEX=1024 BLENDER_PY=... python3 tools/blender/make.py pterodactyl
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length, axis_steps
import ungulate as U
import bird as BD
from ungulate import local as _local, local_n as _local_n, mirror as _mirror

ID = 'pterodactyl'
BOUNDS = (V(-3.55, -0.001, -0.72), V(3.55, 1.34, 1.82))
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
BAKE_DIST = (0.006, 0.02, 0.12)

# ---------- landmarks (left side, +x): the same numbers as PTERO in the game's 40_animals.js ----------
YM = 0.9
SH, EL, WR = V(0.12, YM, 0.22), V(0.38, YM, 0.22), V(0.88, YM, 0.22)
KN = V(1.48, YM, 0.22)                                    # the knuckle at the end of the long hand bone
FA = np.radians(6.0)
FDIR = V(np.cos(FA), 0.0, -np.sin(FA))
FTIP = KN + FDIR * 2.0
# the membrane's own bones (the game's PTERO.plag): pivots along the humerus, the forearm and the hand
PLAG_X = [SH[0] + 0.26 * t for t in (0.35, 0.9)] + [EL[0] + 0.5 * t for t in (0.2, 0.55, 0.9)] + [WR[0] + 0.6 * t for t in (0.2, 0.55, 0.9)]
HIP = V(0.1, 0.8, -0.16)
KNEE = V(0.12, 0.5, -0.08)
ANKLE = V(0.12, 0.12, -0.2)
FOOT = V(0.12, 0.02, -0.12)
# head frame: from the eye region forward (a little down) to the tip of the beak
HO = V(0.0, 1.08, 0.82)
HA = nrm([0.0, -0.107, 0.994])
HU = nrm([0.0, 0.994, 0.107])
HL = 0.94
CREST_B = V(0.0, 1.15, 0.8)                               # the crest's base on the skull (the hornC bone)
CREST_T = V(0.0, 1.27, 0.1)                               # its tip, far back


def hp(s, u, x=0.0):
    return HO + HA * s + HU * u + V(1, 0, 0) * x


def hframe(Q):
    D = Q - HO
    return np.stack([D[:, 0], D @ HU, D @ HA], 1)


HEAD = [
    (-0.14, 0.075, 0.0, -0.07, 0.05, 2.0, 2.0),
    (-0.05, 0.1, -0.005, -0.1, 0.066, 2.1, 2.1),
    (0.06, 0.092, -0.008, -0.1, 0.058, 2.2, 2.2),
    (0.2, 0.074, -0.01, -0.086, 0.046, 2.3, 2.3),
    (0.4, 0.056, -0.01, -0.066, 0.034, 2.3, 2.2),
    (0.6, 0.04, -0.01, -0.048, 0.024, 2.2, 2.1),
    (0.78, 0.026, -0.01, -0.031, 0.016, 2.1, 2.0),
    (0.88, 0.016, -0.009, -0.021, 0.011, 2.0, 2.0),
    (0.935, 0.006, -0.009, -0.011, 0.006, 2.0, 2.0),
]
EYE_S, EYE_U = 0.0, 0.03
EYE_R = 0.017
EYE_DIR = nrm([0.86, 0.2, 0.46])
LID_W, LID_H, LID_OFF = 0.017, 0.013, 0.0006
MOUTH = hp(0.9, -0.009)


def _seat(s, u, r, out=0.35):
    a, b = 0.0, 0.2
    for _ in range(40):
        m = 0.5 * (a + b)
        d = float(loft(np.array([[m, u, s]], F), HEAD)[0])
        a, b = (m, b) if d < 0 else (a, m)
    return hp(s, u, a - r * (1 - out))


EYE_C = _seat(EYE_S, EYE_U, EYE_R)
EYE_HF = hframe(EYE_C[None])[0]

TRUNK = [
    (-0.44, 0.85, 0.82, 0.79, 0.025, 2.0, 2.0),
    (-0.34, 0.92, 0.82, 0.72, 0.08, 2.0, 2.0),
    (-0.2, 0.98, 0.84, 0.67, 0.125, 2.1, 2.0),
    (-0.02, 1.01, 0.85, 0.64, 0.145, 2.1, 2.0),
    (0.14, 1.0, 0.87, 0.66, 0.145, 2.1, 2.0),
    (0.27, 0.99, 0.9, 0.74, 0.11, 2.0, 2.0),
    (0.34, 0.97, 0.92, 0.83, 0.065, 2.0, 2.0),
]
NECK = [
    (0.91, 0.18, 0.095, 0.11, 0.095, 2.0, 2.0),
    (0.94, 0.36, 0.072, 0.082, 0.072, 2.0, 2.0),
    (1.0, 0.54, 0.062, 0.07, 0.062, 2.0, 2.0),
    (1.05, 0.7, 0.06, 0.068, 0.058, 2.0, 2.0),
    (1.08, 0.8, 0.062, 0.072, 0.06, 2.0, 2.0),
]


def trunk(P):
    Q = _mirror(P)
    d = loft(Q, TRUNK)
    # the big breast muscles that work the wings, and the shoulder
    d = smin(d, ellipsoid(Q, V(0.04, 0.8, 0.14), V(0.09, 0.1, 0.13)), 0.05)
    d = smin(d, ellipsoid(Q, V(0.1, 0.9, 0.2), V(0.06, 0.06, 0.07)), 0.04)
    # the tiny tail
    d = smin(d, round_cone(Q, V(0.0, 0.83, -0.38), V(0.0, 0.81, -0.5), 0.022, 0.006), 0.02)
    return d


def neck(P):
    return sweep(_mirror(P), NECK, n=32)


def head(P):
    Q = _mirror(P)
    L = hframe(Q)
    x, u, s = L[:, 0], L[:, 1], L[:, 2]
    d = loft(L, HEAD)
    # the back of the skull and the jaw joint below and behind the eye
    d = smin(d, ellipsoid(L, V(0.03, -0.045, -0.06), V(0.025, 0.035, 0.05)), 0.02)
    # the mouth: a straight groove from the jaw joint to the tip of the beak, the lower jaw a little narrower
    lu = -0.012 - 0.008 * sstep(0.6, 0.0, s)
    lip = np.exp(-((u - lu) / 0.0025) ** 2) * sstep(-0.02, 0.03, s) * sstep(0.88, 0.8, s)
    d = d + 0.003 * lip + 0.0025 * sstep(lu + 0.0005, lu - 0.006, u) * sstep(0.0, 0.05, s)
    # small slit nostrils high on the beak
    no = ((s - 0.32) / 0.05) ** 2 + ((u - 0.03) / 0.006) ** 2
    d = d + 0.003 * np.exp(-no * 1.5) * sstep(0.01, 0.02, np.abs(x))
    # the eye socket
    de = (L - V(float(np.abs(EYE_HF[0])), EYE_HF[1], EYE_HF[2])) / V(0.03, 0.026, 0.032)
    d = d + 0.004 * np.exp(-np.sum(de * de, 1)) * sstep(0.03, 0.045, np.abs(x))
    ca, li, ba, br = eye_parts(P)
    d = smin(d, li, 0.005)
    d = smin(d, br, 0.006)
    d = smax(d, -ca, 0.002)
    d = smin(d, ba, 0.001)
    return d


def crest(P):
    """a long, thin blade from the top of the skull back to a point, its upper edge nearly straight, its lower edge
    rising to meet it"""
    Q = _mirror(P)
    ax = CREST_T - CREST_B
    Lc = float(np.linalg.norm(ax))
    a = ax / Lc
    up = nrm(V(0, 1, 0) - a * a[1])
    D = Q - CREST_B
    t = (D @ a) / Lc
    v = D @ up
    x = Q[:, 0]
    tt = np.clip(t, 0, 1)
    top = 0.06 * (1 - tt) ** 0.8 + 0.008
    bot = 0.12 * (1 - tt) ** 1.5 + 0.005
    hw = 0.018 * (1 - tt) + 0.004
    q = np.sqrt((x / hw) ** 2 + (np.where(v > 0, v / top, v / bot)) ** 2)
    d = (q - 1) * np.minimum(hw, 0.5 * (top + bot))
    cap = np.maximum(-t * Lc - 0.06, (t - 1) * Lc)
    return smax(d, cap, 0.004)


def eye_parts(P):
    Q = _mirror(P)
    return U.eye_parts(Q, EYE_C, EYE_R, EYE_DIR, LID_W, LID_H, LID_OFF, mound=(0.007, 0.006, 0.0025),
                       brow=((-0.018, 0.017, -0.012), (0.01, 0.019, -0.009), 0.007, 0.005))


# ---------- the wings ----------
def arm(P):
    """the humerus (thick, muscled near the shoulder), the forearm, the wrist with the little pteroid bone, the long
    hand bone, the knuckle"""
    Q = _mirror(P)
    d = round_cone(Q, SH + V(0.02, 0, 0), EL, 0.048, 0.034)
    d = smin(d, ellipsoid(Q, V(0.22, YM - 0.006, 0.2), V(0.1, 0.035, 0.045)), 0.02)
    d = smin(d, ellipsoid(Q, EL, V(0.04, 0.034, 0.036)), 0.015)
    d = smin(d, round_cone(Q, EL, WR, 0.031, 0.025), 0.012)
    d = smin(d, ellipsoid(Q, WR, V(0.04, 0.032, 0.04)), 0.012)
    d = smin(d, round_cone(Q, WR + V(-0.01, 0, 0.02), WR + V(-0.12, 0, 0.07), 0.014, 0.006), 0.01)
    d = smin(d, round_cone(Q, WR, KN, 0.025, 0.023), 0.012)
    d = smin(d, ellipsoid(Q, KN, V(0.036, 0.03, 0.034)), 0.01)
    return d


def finger(P):
    """the wing finger: four long bones from the knuckle to the tip, tapering, with knobbly joints"""
    Q = _mirror(P)
    pts = [KN + FDIR * 0.02, KN + FDIR * 0.72, KN + FDIR * 1.25, KN + FDIR * 1.66, FTIP]
    rad = [0.024, 0.018, 0.014, 0.01, 0.004]
    d = None
    for i in range(4):
        e = round_cone(Q, pts[i], pts[i + 1], rad[i], rad[i + 1])
        d = e if d is None else smin(d, e, 0.004)
    for i in (1, 2, 3):
        d = smin(d, ellipsoid(Q, pts[i], V(rad[i] * 1.5, rad[i] * 1.3, rad[i] * 1.4)), 0.005)
    return d


SMALL_F = [(0.022, 0.05, 0.07), (0.0, 0.065, 0.08), (-0.022, 0.06, 0.075)]   # (y offset, length, claw) of fingers I to III


def small_fingers(P):
    """three small fingers at the knuckle pointing forward with hooked claws (they take the ground when it walks);
    returns (fingers, claws)"""
    Q = _mirror(P)
    d, cl = None, None
    for i, (dy, L, c) in enumerate(SMALL_F):
        b = KN + V(-0.01 - 0.012 * i, dy * 0.6, 0.02)
        dv = nrm([-0.25, dy * 2.0, 1.0])
        e = b + dv * L
        f = round_cone(Q, b, e, 0.011, 0.008)
        f = smin(f, ellipsoid(Q, b + dv * L * 0.5, V(0.01, 0.009, 0.012)), 0.004)
        cd = nrm([-0.1, -0.35, 1.0])
        c0 = e + dv * 0.005
        c1 = c0 + cd * c * 0.55 + V(0, 0.006, 0)
        c2 = c1 + nrm([0.0, -0.9, 0.4]) * c * 0.5
        k = smin(round_cone(Q, c0, c1, 0.0075, 0.004), round_cone(Q, c1, c2, 0.004, 0.0008), 0.002)
        d = f if d is None else np.minimum(d, f)
        cl = k if cl is None else np.minimum(cl, k)
    return d, cl


def _bez(a, c, b, n):
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) ** 2 * a + 2 * (1 - t) * t * c + t * t * b


def _outline():
    """the left wing's membrane outline in the x-z plane (closed polygon): the propatagium in front of the arm, the
    leading edge along the hand and the finger, the long hollow trailing edge back to the flank and the thigh"""
    xz = lambda p: np.array([p[0], p[2]], F)
    pts = [np.array([[0.09, 0.3], [0.2, 0.3], [0.4, 0.29], [0.62, 0.285], [0.82, 0.27], [0.9, 0.245]], F)]
    lead = [xz(KN + FDIR * t) + np.array([0.0, 0.016], F) for t in np.linspace(-0.6, 1.95, 12)]
    pts.append(np.array(lead, F))
    tip = xz(FTIP)
    pts.append(np.array([tip + np.array([0.04, -0.01], F)], F))
    # the trailing edge: hollow between the wing tip and the thigh (a stretched, concave edge)
    att = np.array([0.15, -0.36], F)
    pts.append(_bez(tip + np.array([0.0, -0.02], F), np.array([1.6, -0.18], F), np.array([0.7, -0.58], F), 20)[1:])
    pts.append(_bez(np.array([0.7, -0.58], F), np.array([0.32, -0.6], F), att, 10)[1:])
    pts.append(np.array([[0.12, -0.3], [0.09, -0.2]], F))
    return np.concatenate(pts, 0)


_mcache = {}


def _memb2d():
    if 'g' not in _mcache:
        poly = _outline()
        x0, x1, z0, z1, h = 0.0, 3.6, -0.7, 0.4, 0.004
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
    out = (Q[:, 0] < x0) | (Q[:, 0] > x0 + h * (sh[0] - 1)) | (Q[:, 2] < z0) | (Q[:, 2] > z0 + h * (sh[1] - 1))
    return np.where(out, 1.0, g).astype(F)


def membrane(P):
    """the thin skin of the wing: thicker toward the body, thinner at the free edge, rounded rims"""
    Q = _mirror(P)
    e = memb_xz(Q)
    th = 0.007 + 0.006 * sstep(0.6, 0.15, Q[:, 0]) - 0.002 * sstep(-0.05, 0.0, e)
    dy = np.abs(Q[:, 1] - YM) - th
    return (np.sqrt(np.maximum(e, 0) ** 2 + np.maximum(dy, 0) ** 2) + np.minimum(np.maximum(e, dy), 0)).astype(F)


# ---------- legs ----------
TOES = [dict(a=-14, len=0.07, r=0.009, r1=0.006, claw=0.022, clawR=0.005, n=3), dict(a=-4, len=0.08, r=0.009, r1=0.006, claw=0.024, clawR=0.005, n=3),
        dict(a=6, len=0.08, r=0.009, r1=0.006, claw=0.024, clawR=0.005, n=3), dict(a=16, len=0.07, r=0.0085, r1=0.0055, claw=0.022, clawR=0.005, n=3)]


def leg(P):
    Q = _mirror(P)
    d = ellipsoid(Q, HIP + V(0.0, -0.06, 0.02), V(0.05, 0.11, 0.07))
    d = smin(d, round_cone(Q, HIP + V(0.01, -0.08, 0.02), KNEE, 0.036, 0.024), 0.02)
    d = smin(d, round_cone(Q, KNEE, ANKLE, 0.022, 0.016), 0.01)
    d = smin(d, round_cone(Q, ANKLE, FOOT + V(0, 0.01, 0.0), 0.016, 0.014), 0.008)
    return d


def feet(P):
    Q = _mirror(P)
    dt, dc, _ = BD.toes(Q, FOOT + V(0, 0, 0.01), TOES)
    dt = smin(dt, ellipsoid(Q, FOOT + V(0, 0.004, 0.0), V(0.03, 0.012, 0.03)), 0.006)
    return dt, dc


# ---------- assembled ----------
WING_BOX = (V(-3.6, YM - 0.04, -0.7), V(3.6, YM + 0.04, 0.36))
ARM_BOX = (V(-1.62, YM - 0.08, 0.1), V(1.62, YM + 0.08, 0.34))
FINGER_BOX = (V(-3.55, YM - 0.05, -0.05), V(3.55, YM + 0.05, 0.3))
SF_BOX = (V(-1.55, YM - 0.12, 0.15), V(1.55, YM + 0.1, 0.36))
HEAD_BOX = (V(-0.14, 0.92, 0.6), V(0.14, 1.24, 1.82))
CREST_BOX = (V(-0.06, 0.98, 0.04), V(0.06, 1.36, 0.9))
NECK_BOX = (V(-0.16, 0.76, 0.06), V(0.16, 1.18, 0.92))
LEG_BOX = (V(-0.24, -0.01, -0.34), V(0.24, 0.86, 0.06))
FOOT_BOX = (V(-0.24, -0.01, -0.3), V(0.24, 0.07, 0.04))


def parts(P):
    so, li, ba, br = eye_parts(P)
    ft, cl = _local_n(P, *FOOT_BOX, feet, 2)
    sf, sc = _local_n(P, *SF_BOX, small_fingers, 2)
    return {'trunk': trunk(P), 'neck': _local(P, *NECK_BOX, neck), 'head': _local(P, *HEAD_BOX, head), 'crest': _local(P, *CREST_BOX, crest),
            'lids': li, 'ball': ba, 'arm': _local(P, *ARM_BOX, arm), 'finger': _local(P, *FINGER_BOX, finger), 'sfing': sf,
            'memb': _local(P, *WING_BOX, membrane), 'leg': _local(P, *LEG_BOX, leg), 'foot': ft, 'claw': np.minimum(cl, sc)}


def shape(P):
    d = trunk(P)
    d = smin(d, _local(P, *NECK_BOX, neck), 0.04)
    h = _local(P, *HEAD_BOX, head)
    h = smin(h, _local(P, *CREST_BOX, crest), 0.02)
    d = smin(d, h, 0.03)
    w = _local(P, *ARM_BOX, arm)
    w = smin(w, _local(P, *FINGER_BOX, finger), 0.012)
    sf, sc = _local_n(P, *SF_BOX, small_fingers, 2)
    w = smin(w, sf, 0.008)
    w = smin(w, _local(P, *WING_BOX, membrane), 0.01)
    d = smin(d, w, 0.03)
    d = np.minimum(d, sc)
    d = smin(d, _local(P, *LEG_BOX, leg), 0.03)
    ft, cl = _local_n(P, *FOOT_BOX, feet, 2)
    d = smin(d, ft, 0.006)
    d = np.minimum(d, cl)
    return d


def grid(h):
    """finer across the thin membranes (y), round the head and the feet"""
    lo, hi = BOUNDS
    xs = axis_steps(0.0, hi[0], [(0.0, 0.16, h * 0.5), (1.38, 1.62, h * 0.6)], h)
    ys = axis_steps(lo[1], hi[1], [(lo[1], 0.06, h * 0.5), (YM - 0.05, YM + 0.05, min(h * 0.3, 0.004)), (1.0, hi[1], h * 0.5)], h)
    zs = axis_steps(lo[2], hi[2], [(-0.3, 0.04, h * 0.6), (0.7, hi[2], h * 0.45)], h)
    return xs, ys, zs


PATCHES = [
    (EYE_C * V(0, 1, 1) + V(0.02, -0.04, -0.04), EYE_C * V(0, 1, 1) + V(0.08, 0.04, 0.04), 0.0012),   # eye and lids
    (V(0.0, 0.95, 1.4), V(0.04, 1.08, 1.82), 0.002),                                                  # beak tip
    (V(0.04, -0.001, -0.25), V(0.2, 0.06, 0.04), 0.002),                                              # foot and claws
    (V(1.36, YM - 0.12, 0.16), V(1.56, YM + 0.06, 0.36), 0.002),                                      # small fingers
]

PREVIEW = {
    'top': ((0.02, 9.0, 0.3), (0, 0.9, 0.3), 40),
    'front3q': ((4.0, 2.5, 5.0), (0.8, 0.9, 0.2), 40),
    'side': ((4.0, 1.0, 0.4), (0, 0.9, 0.4), 30),
    'head': ((0.8, 1.3, 1.6), (0, 1.08, 1.1), 26),
}


# ---------- the game mesh ----------
def _wingk(Pm):
    """1 on the membranes, the finger and the arm beyond the shoulder, 0 on the body"""
    return sstep(0.17, 0.26, Pm[:, 0]) * sstep(0.06, 0.03, np.abs(Pm[:, 1] - YM))


def keep(P):
    Pm = _mirror(P)
    base = np.full(len(P), 0.4, F)
    e = sstep(0.05, 0.025, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.85
    L = hframe(Pm)
    hd = sstep(-0.15, -0.05, L[:, 2]) * sstep(0.95, 1.0, Pm[:, 1]) * sstep(0.12, 0.08, Pm[:, 0]) * 0.6
    cr = U.box(Pm, CREST_BOX[0] * V(0, 1, 1), CREST_BOX[1]).astype(F) * 0.55
    ft = sstep(0.06, 0.02, Pm[:, 1]) * 0.6
    sf = U.box(Pm, SF_BOX[0] * V(-1, 1, 1), SF_BOX[1]).astype(F) * 0.6
    wk = _wingk(Pm)
    out = np.maximum.reduce([base, e, hd, cr, ft, sf])
    tube = sstep(0.02, 0.008, np.abs(Pm[:, 1] - YM) - 0.01)
    return (out * (1 - wk) + wk * np.maximum(0.24 + 0.2 * tube, sf)).astype(F)


UV_AVERAGE = True
UV_PACK = dict(margin_method='FRACTION', margin=0.008)


def uv_regions(P):
    """head and crest, neck, body, legs and feet, arms, membrane"""
    Pm = _mirror(P)
    L = hframe(Pm)
    lab = np.full(len(P), 2)
    lab[(Pm[:, 2] > 0.3) & (Pm[:, 1] > 0.85) & (np.abs(Pm[:, 0]) < 0.12)] = 1
    lab[(L[:, 2] > -0.14) & (Pm[:, 1] > 0.95) & (np.abs(Pm[:, 0]) < 0.12)] = 0
    lab[U.box(Pm, CREST_BOX[0] * V(0, 1, 1), CREST_BOX[1]) & (Pm[:, 2] < 0.75)] = 7
    lab[(Pm[:, 1] < 0.78) & (np.abs(Pm[:, 0]) < 0.25)] = 3
    lab[(Pm[:, 0] > 0.17) & (np.abs(Pm[:, 1] - YM) < 0.06)] = 5
    return lab


def uv_weight(P):
    Pm = _mirror(P)
    L = hframe(Pm)
    head = sstep(-0.14, -0.04, L[:, 2]) * sstep(0.95, 1.0, Pm[:, 1]) * sstep(0.12, 0.08, Pm[:, 0])
    wk = _wingk(Pm)
    return (1.0 + 1.0 * head - 0.62 * wk).astype(F)


WEIGHT_SMOOTH = (0, 0)   # fix_weights builds every weight itself, blends included


def bone_tips(P):
    t = {'hips': P['neck'], 'neck': P['neck2'], 'neck2': P['head'], 'head': hp(HL, 0.0), 'hornC': CREST_T, 'tail': V(0, 0.81, -0.5)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, 0.004, 0.09)) * m
        t['wing' + s] = EL * m; t['wfore' + s] = WR * m; t['whand' + s] = KN * m; t['f0' + s] = FTIP * m
        for k, x0 in enumerate(PLAG_X):
            t['f%d%s' % (1 + k, s)] = V(x0, YM, SH[2] - 0.5) * m
    return t


def _arm_w(Q, nb):
    """weights along the leading edge by x: the humerus (into the body at the shoulder), the forearm, the hand, the
    wing finger"""
    x = Q[:, 0]
    W = np.zeros((len(Q), nb['n']), F)
    t1 = sstep(EL[0] - 0.03, EL[0] + 0.03, x)
    t2 = sstep(WR[0] - 0.03, WR[0] + 0.03, x)
    t3 = sstep(KN[0] - 0.03, KN[0] + 0.02, x)
    W[:, nb['wing']] = 1 - t1
    W[:, nb['wfore']] = t1 * (1 - t2)
    W[:, nb['whand']] = t2 * (1 - t3)
    W[:, nb['f0']] = t3
    return W


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    x = wpos[:, 0]
    Pm = _mirror(wpos)
    out = np.zeros_like(W)
    c = parts(wpos.astype(F))
    for s, sg in (('L', 1), ('R', -1)):
        side = x >= 0 if sg > 0 else x < 0
        nb = {'n': len(names)}
        for b in ('wing', 'wfore', 'whand', 'thigh', 'shin', 'hmeta', 'hpaw') + tuple('f%d' % k for k in range(9)):
            nb[b] = bi[b + s]
        for b in ('hips', 'neck', 'neck2', 'head', 'hornC', 'tail'):
            nb[b] = bi[b]
        Q = Pm[side]
        cs = {k: v[side] for k, v in c.items()}
        n = len(Q)
        Wl = np.zeros((n, len(names)), F)
        y, z = Q[:, 1], Q[:, 2]
        # body: hips; the neck along its length (neck, neck2); the head; the crest on its own bone; the tiny tail
        L = hframe(Q)
        hd = sstep(-0.16, -0.1, L[:, 2]) * sstep(0.12, 0.08, Q[:, 0]) * sstep(0.97, 1.0, y)
        cr = ((cs['crest'] < np.minimum(cs['head'], cs['neck']) + 0.002) & (cs['crest'] < 0.02)).astype(F) * sstep(0.84, 0.76, z)
        u = np.interp(z, [0.2, 0.3, 0.52, 0.7], [0.0, 1.0, 2.0, 3.0]).astype(F)
        nk = sstep(0.24, 0.32, z) * sstep(0.12, 0.08, Q[:, 0]) * (1 - hd)
        for nm, w in BD.blend_chain(u, ['hips', 'neck', 'neck2', 'head'], 0.25):
            Wl[:, nb[nm]] += w * nk
        Wl[:, nb['hips']] += (1 - nk) * (1 - hd)
        Wl[:, nb['head']] += hd * (1 - cr)
        Wl[:, nb['hornC']] += hd * cr
        # the crest behind the skull: wholly on its own bone (it reaches back past the neck's start)
        crb = cr * (1 - hd)
        Wl = Wl * (1 - crb[:, None]); Wl[:, nb['hornC']] += crb
        tl = sstep(-0.36, -0.42, z) * sstep(0.04, 0.02, Q[:, 0])
        Wl = Wl * (1 - tl[:, None]); Wl[:, nb['tail']] += tl
        # hind legs: by height, the top blending into the hips
        dl = np.minimum(cs['leg'], np.minimum(cs['foot'], cs['claw'] + 0.002))
        onl = (dl < cs['trunk'] + 0.002) & (z < 0.0) & (y < 0.82)
        kl = sstep(0.0, 0.02, cs['trunk'] - dl) * onl
        ul = 4.0 - np.interp(y, [0.0, 0.02, 0.12, 0.5, 0.8], [0.0, 1.0, 2.0, 3.0, 4.0]).astype(F)
        lw = np.zeros((n, len(names)), F)
        for nm, w in BD.blend_chain(ul, ['thigh', 'shin', 'hmeta', 'hpaw'], 0.2):
            lw[:, nb[nm]] += w
        g = sstep(0.35, -0.1, ul) * 0.85
        lw = lw * (1 - g[:, None]); lw[:, nb['hips']] += g
        onf = (cs['foot'] < cs['leg']) | ((cs['claw'] < 0.003) & (y < 0.07))
        lw[onf] = 0; lw[onf, nb['hpaw']] = 1
        Wl = Wl * (1 - kl[:, None]) + lw * kl[:, None]
        # the wing: in the plane of the arm and out past the flank
        dwp = np.minimum.reduce([cs['memb'], cs['finger'], cs['arm'], cs['sfing'], np.where(Q[:, 0] > 0.5, cs['claw'], 1.0)])
        onw = ((np.abs(y - YM) < 0.1) & (Q[:, 0] > 0.11) & (dwp < cs['trunk'] - 0.001)) | (Q[:, 0] > 0.3)
        aw = _arm_w(Q, nb)
        # behind the arm: the membrane's own bones along the arm (between the two nearest by x); out past the knuckle,
        # between the finger and the last of them by the direction from the knuckle; the hips at the flank
        px = np.array(PLAG_X, F)
        xi = np.clip(Q[:, 0], px[0], px[-1])
        j = np.clip(np.searchsorted(px, xi) - 1, 0, len(px) - 2)
        uu = (xi - px[j]) / (px[j + 1] - px[j])
        pw = np.zeros((n, len(names)), F)
        rows = np.arange(n)
        np.add.at(pw, (rows, np.array([nb['f%d' % (1 + k)] for k in j])), 1 - uu)
        np.add.at(pw, (rows, np.array([nb['f%d' % (2 + k)] for k in j])), uu)
        ang = np.degrees(np.arctan2(-(z - KN[2]), Q[:, 0] - KN[0]))
        ua = sat((ang - 8.0) / 70.0)
        ow = np.zeros((n, len(names)), F)
        ow[:, nb['f0']] = 1 - ua
        ow[:, nb['f8']] = ua
        ko = sstep(KN[0] - 0.08, KN[0] + 0.1, Q[:, 0])
        pw = pw * (1 - ko[:, None]) + ow * ko[:, None]
        kh = sstep(0.26, 0.14, Q[:, 0])
        hpw = np.zeros((n, len(names)), F); hpw[:, nb['hips']] = 1
        pw = pw * (1 - kh[:, None]) + hpw * kh[:, None]
        # the leading edge itself (the arm and the finger bones, the propatagium in front of them) on the arm's bones
        f = sstep(0.0, 0.06, SH[2] - 0.02 - z) * sstep(-0.3, 0.0, z - FTIP[2] - (SH[2] - FTIP[2]) * sat((Q[:, 0] - KN[0]) / (FTIP[0] - KN[0]))) * 0
        lead = (cs['arm'] < 0.01) | (cs['finger'] < 0.008) | (z > SH[2] + 0.015 - 0.11 * sat((Q[:, 0] - KN[0]) / (FTIP[0] - KN[0])))
        # past the knuckle the membrane's front lies along the finger: blend from the finger by distance behind it
        behind = np.where(Q[:, 0] > KN[0], (KN[2] - FDIR[2] / FDIR[0] * (Q[:, 0] - KN[0])) - z, SH[2] - z)
        kb = sstep(0.02, 0.12, behind)
        wing = aw * (1 - kb[:, None]) + pw * kb[:, None]
        wing[lead] = aw[lead]
        # the small fingers and their claws ride on the hand
        sf = (cs['sfing'] < 0.006) | ((cs['claw'] < 0.004) & (Q[:, 0] > 1.2))
        hrow = np.zeros(len(names), F); hrow[nb['whand']] = 1
        wing[sf] = hrow
        # near the body the arm goes into the shoulder
        ksh = sstep(0.2, 0.12, Q[:, 0])
        sw = np.zeros((n, len(names)), F); sw[:, nb['wing']] = 0.5; sw[:, nb['hips']] = 0.5
        wing = wing * (1 - ksh[:, None]) + sw * ksh[:, None]
        Wl[onw] = wing[onw]
        out[side] = Wl
    s = out.sum(1, keepdims=True)
    return out / np.maximum(s, 1e-9)


# ---------- the coat: direction, paint, detail ----------
def flow(P, N=None):
    """the fuzz lies back over the head and the body, down the legs"""
    Q = _mirror(P)
    y = Q[:, 1]
    one = np.ones_like(y)
    body = np.stack([0.2 * sstep(0.02, 0.1, Q[:, 0]), -(0.15 + 0.5 * sstep(0.85, 0.7, y)), -one], 1)
    legd = np.stack([0 * y, -one, 0 * y], 1)
    wl = sstep(0.75, 0.65, y) * sstep(0.2, 0.0, Q[:, 2])
    f = body * (1 - wl)[:, None] + legd * wl[:, None]
    f = f / np.maximum(np.linalg.norm(f, axis=1, keepdims=True), 1e-9)
    f[:, 0] *= np.sign(P[:, 0] + 1e-12)
    return f.astype(F)


hx = U.hexc
K = {
    'fur': hx(0x8A7A66), 'furDk': hx(0x5E5044), 'furLt': hx(0xB4A690), 'skin': hx(0x6A5C50),
    'beak': hx(0xDCCDA6), 'beakDk': hx(0x7A6A54), 'beakTip': hx(0x3A3228),
    'crest': hx(0xA84028), 'crestDk': hx(0x4A1C12), 'crestLt': hx(0xD07A3E),
    'memb': hx(0x56463C), 'membLt': hx(0x7A685A), 'membUnder': hx(0x8A7A6A), 'bone': hx(0x9A8A76),
    'claw': hx(0x1C1814), 'ball': hx(0x120C08), 'lid': hx(0x5A4C40),
    'babyFur': hx(0xB0A28C), 'babyDk': hx(0x8A7C68), 'babyMemb': hx(0x8A7C6E),
}


def _regions(P, N, c):
    r = {}
    Pm = _mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
    r['Pm'], r['Nm'] = Pm, Nm
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    L = hframe(Pm)
    r['L'] = L
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    r['eyeD'] = de
    r['ball'] = sstep(0.001, 0.0003, c['ball']) * sstep(EYE_R + 0.002, EYE_R + 0.0006, de)
    r['lid'] = sstep(EYE_R + 0.006, EYE_R + 0.002, de) * (1 - r['ball'])
    r['claw'] = sstep(0.003, 0.0006, c['claw'])
    r['head'] = sstep(-0.14, -0.06, L[:, 2]) * sstep(0.96, 1.0, y) * sstep(0.1, 0.07, x)
    r['beak'] = r['head'] * sstep(0.08, 0.16, L[:, 2])
    r['crest'] = sstep(0.004, -0.002, c['crest'] - np.minimum(c['head'], c['neck'])) * sstep(0.012, 0.003, c['crest']) * sstep(0.84, 0.74, z)
    r['wing'] = sstep(0.16, 0.24, x) * sstep(0.05, 0.03, np.abs(y - YM))
    r['bone'] = np.maximum(sstep(0.006, 0.001, c['arm']), sstep(0.005, 0.001, c['finger'])) * sstep(0.16, 0.24, x)
    r['leg'] = sstep(0.62, 0.5, y) * sstep(0.2, 0.0, z) * sstep(0.04, 0.07, x)
    r['under'] = sstep(0.0, -0.5, Nm[:, 1])
    return r


def paint(P, N, c, baby=False):
    R = _regions(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    n1 = fbm(Pm * 3.0, 3, 11)
    n3 = fbm(Pm * 20.0, 2, 13)
    if baby:
        col = np.tile(K['babyFur'], (n, 1))
        col = U.mix(col, K['babyDk'], sstep(0.2, 0.8, Nm[:, 1]) * 0.3)
        mc = U.mix(np.tile(K['babyMemb'], (n, 1)), K['membUnder'], R['under'] * 0.5)
    else:
        col = U.mix(np.tile(K['fur'], (n, 1)), K['furDk'], sstep(0.1, 0.85, Nm[:, 1]) * 0.5)
        col = U.mix(col, K['furLt'], R['under'] * sstep(0.95, 0.7, y) * 0.6)
        # the membrane: dark gray-brown on top, paler beneath, faint fibres running along the wing (out from the body,
        # bending back toward the tip), darker toward the trailing edge, the leading edge bones paler
        mc = U.mix(np.tile(K['memb'], (n, 1)), K['membLt'], sstep(0.55, 0.75, n1) * 0.35)
        fib = np.abs(np.sin((z + 0.08 * x + 0.02 * fbm(Pm * 6, 2, 31)) * 260))
        mc *= (0.95 + 0.06 * sstep(0.85, 1.0, fib))[:, None]
        e = memb_xz(Pm)
        mc = U.mix(mc, K['furDk'], sstep(-0.12, -0.01, e) * sstep(SH[2] - 0.05, SH[2] - 0.2, z) * 0.35)
        mc = U.mix(mc, K['membUnder'], R['under'] * 0.55)
    mc = U.mix(mc, K['bone'], R['bone'] * 0.55)
    col = U.mix(col, mc, R['wing'])
    col = U.mix(col, K['skin'], R['leg'] * sstep(0.35, 0.2, y) * 0.7)
    # the beak: ivory, the edges and the tip darker, a little streaky
    L = R['L']
    bc = U.mix(np.tile(K['beak'], (n, 1)), K['beakDk'], sstep(0.004, 0.0, np.abs(L[:, 1] + 0.012)) * 0.4 + 0.12 * (vnoise(Pm * V(200, 200, 12), 14) - 0.5))
    bc = U.mix(bc, K['beakDk'], sstep(0.8, 0.94, L[:, 2]) * 0.35)
    col = U.mix(col, bc, R['beak'] * (0.6 if baby else 1.0))
    # the crest: deep red, darker toward its edges, a paler streak along it
    if not baby:
        ax = CREST_T - CREST_B
        t = sat(((Pm - CREST_B) @ ax) / float(ax @ ax))
        ccol = U.mix(np.tile(K['crest'], (n, 1)), K['crestLt'], sstep(0.55, 0.85, fbm(Pm * V(10, 30, 4), 2, 33)) * 0.35)
        ccol = U.mix(ccol, K['crestDk'], sstep(0.4, 0.95, t) * 0.5 + sstep(-0.3, -0.8, Nm[:, 1]) * 0.3)
        col = U.mix(col, ccol, R['crest'])
    col *= (0.93 + 0.1 * n3)[:, None]
    col = U.mix(col, K['lid'], R['lid'] * 0.75)
    col = U.mix(col, K['claw'], R['claw'])
    col = U.mix(col, K['ball'], R['ball'])
    rough = 0.82 + 0.06 * (n3 - 0.5) - 0.2 * R['beak'] - 0.12 * R['crest'] - 0.25 * R['claw'] - 0.1 * R['wing'] - 0.3 * R['lid'] * sstep(EYE_R + 0.003, EYE_R + 0.001, R['eyeD'])
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def paint_baby(P, N, c):
    return paint(P, N, c, baby=True)


def detail(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    h = np.zeros(len(P), F)
    # fine creases across the membrane along its fibres, a few broader folds near the body
    fib = np.abs(np.sin((z + 0.08 * x + 0.02 * fbm(Pm * 6, 2, 31)) * 260))
    h -= 0.0006 * sstep(0.85, 1.0, fib) * R['wing'] * (1 - R['bone'])
    fold = fbm(Pm * V(4, 1, 12), 2, 37)
    h += 0.0015 * (fold - 0.5) * R['wing'] * sstep(1.2, 0.3, x) * (1 - R['bone'])
    # the beak: fine growth lines; the crest: streaks along it
    h -= 0.0004 * vnoise(Pm * V(300, 300, 10), 38) * R['beak']
    h -= 0.0006 * vnoise(Pm * V(20, 60, 4), 39) * R['crest']
    # scaly feet
    sh, sg = BD.scutes(Pm, nrm([0, -1, 0.15]), 0.004, 43)
    h += R['leg'] * sstep(0.3, 0.15, y) * (0.00025 * sh - 0.0002 * sg)
    return h


def finish(C, ao, valid):
    return U.finish(C, ao, valid, floor=0.45)


# the pycnofibres: a short fuzz over the body, the neck and the back of the head (none on the beak, the crest, the
# wings, the lower legs); longer and softer on a hatchling
FUR = dict(len=0.014, n=4, lean=1.0, tile=0.0016, babyLen=1.6, babyLean=0.6, shade=0.75, quality=72)


def fur(P, N, c):
    R = _regions(P, N, c)
    bare = np.maximum.reduce([R['beak'], R['crest'], R['wing'], R['claw'], R['ball'], R['lid'] * 0.9, R['leg'] * sstep(0.4, 0.25, R['Pm'][:, 1])])
    ring = sstep(EYE_R * 1.4, EYE_R * 2.6, R['eyeD'])
    flen = FUR['len'] * (1 - bare) * ring * (1 - 0.5 * R['head']) * np.clip(0.85 + 0.3 * fbm(R['Pm'] / 0.03, 2, 41), 0.6, 1.15)
    fden = 0.85 * (1 - bare) * ring
    return np.clip(flen, 0, FUR['len']).astype(F), np.clip(fden, 0, 1).astype(F)


MAP_QUALITY = (68, 52)
PAD_SMOOTH = 2
BABY_MAP = (384, 64)


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': U.lid_color(col, R['eyeD'], EYE_R)}


def meta(st):
    r = EYE_R
    up, dn = (LID_OFF + LID_H) / r, (LID_OFF - LID_H) / r
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.3],
                'iris': 0x6A3A1A, 'irisR': 0.92, 'pupilR': 0.42, 'rim': 0x2A1A0A, 'lidCol': st['lidCol']},
        'collar': {'at': ['neck', 'neck2', 0.3], 'r': 1.1},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'belly': [0.0, 0.66, -0.02],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.07, 0.07, 0.06], 'flat': 0x6A5A4C,
    }
