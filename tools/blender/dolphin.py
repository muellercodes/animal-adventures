# round 18: a common bottlenose dolphin (Tursiops truncatus), a grown-up, sculpted as a signed distance field around the
# game's dolphin skeleton (tools/blender/work/dolphin-rig.json). Units are meters in game rig space (x left, y up,
# z forward, the belly on y = 0). 2.8 m from the tip of the beak to the tips of the flukes, 0.6 m deep (0.84 m to the
# tip of the dorsal fin), 0.5 m wide. Made from narwhal.py (one loft, flippers and flukes on their own frames, weights
# all from the sculpt's own parts); the steps are the narwhal's.
# Shape: one loft from the tail stock to the tip of the beak: a streamlined spindle, thickest just behind the flippers,
# the tail stock narrow and keeled above and below; in front of the blowhole the top line falls over the rounded melon
# and turns sharply at the crease into the short thick beak (the loft's own keys: a separate melon or beak printed a rim
# round the face on the narwhal), the lower jaw a little longer than the upper. The mouth line runs back along the beak
# and turns up at its corner (the "smile"), the small eye just behind and above the corner in a soft lid ring, one
# crescent blowhole on top (horns forward). A tall curved (falcate) dorsal fin in the middle of the back, pointed
# flippers low on the sides, broad pointed flukes with a notch in the middle.
# Skin: smooth and wet (a faint grain, a few pale rake marks from other dolphins' teeth).
# Paint: gray, a darker cape over the back from the melon to the tail stock, dipping a little under the dorsal fin, the
# belly and the throat pale, the lower jaw pale, a faint dark line from the eye to the flipper; darker fins. The calf has
# its own color map (paint_baby): paler, a faint cape, and faint pale fetal fold stripes across its sides.
# Make it with: VOXEL=0.004 TRIS=4200 WEIGHTS=transfer TEX=1024 BLENDER_PY=... python3 tools/blender/make.py dolphin
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, loft, fbm, length, _hash, frame, axis_steps
from carnivore import local, mirror, hexc, mix

ID = 'dolphin'
BOUNDS = (V(-0.44, -0.004, -1.7), V(0.44, 0.87, 1.18))
BAKE_DIST = (0.015, 0.04, 0.16)
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True

# ---------- the body: one loft from the end of the tail stock to the tip of the beak ----------
# z, top, yw (height of widest), bottom, half width, exponents above and below the widest line (under 2 on the tail
# stock: the keels above and below). In front of the blowhole (z 0.76) the top falls over the melon and turns at the
# crease (z 1.015) into the beak.
BODY = [
    (-1.45, 0.383, 0.36, 0.337, 0.022, 2.0, 2.0),
    (-1.38, 0.398, 0.36, 0.322, 0.027, 1.9, 1.9),
    (-1.28, 0.42, 0.358, 0.296, 0.034, 1.7, 1.7),
    (-1.15, 0.452, 0.354, 0.256, 0.046, 1.6, 1.65),
    (-1.0, 0.488, 0.348, 0.208, 0.066, 1.65, 1.7),
    (-0.85, 0.52, 0.342, 0.16, 0.093, 1.8, 1.8),
    (-0.68, 0.548, 0.335, 0.11, 0.13, 1.95, 1.9),
    (-0.5, 0.568, 0.327, 0.068, 0.168, 2.05, 2.0),
    (-0.3, 0.583, 0.318, 0.035, 0.203, 2.1, 2.05),
    (-0.08, 0.593, 0.31, 0.012, 0.232, 2.15, 2.1),
    (0.12, 0.595, 0.305, 0.003, 0.248, 2.15, 2.1),
    (0.3, 0.586, 0.3, 0.008, 0.246, 2.15, 2.1),
    (0.45, 0.565, 0.296, 0.024, 0.232, 2.1, 2.05),
    (0.58, 0.537, 0.292, 0.046, 0.21, 2.1, 2.0),
    (0.68, 0.51, 0.289, 0.066, 0.19, 2.05, 2.0),
    (0.76, 0.48, 0.286, 0.085, 0.17, 2.05, 2.0),
    (0.84, 0.44, 0.281, 0.104, 0.148, 2.0, 2.0),
    (0.9, 0.4, 0.276, 0.12, 0.128, 2.0, 2.0),
    (0.95, 0.355, 0.27, 0.134, 0.108, 2.0, 2.0),
    (0.99, 0.31, 0.262, 0.145, 0.088, 2.0, 2.0),
    (1.015, 0.278, 0.255, 0.152, 0.074, 2.0, 2.0),
    (1.04, 0.266, 0.247, 0.158, 0.064, 2.0, 2.0),
    (1.08, 0.256, 0.236, 0.166, 0.052, 2.0, 2.0),
    (1.11, 0.246, 0.226, 0.172, 0.042, 2.0, 2.0),
]


def _front_keys():
    """the tip of the beak: sections shrinking along a quarter ellipse to a tiny one"""
    k = []
    z0, top0, yw0, bot0, w0 = 1.11, 0.246, 0.226, 0.172, 0.042
    for z in (1.125, 1.138, 1.147, 1.152):
        s = np.sqrt(max(1 - ((z - z0) / 0.043) ** 2, 0.0025))
        k.append((z, yw0 + (top0 - yw0) * s, yw0, yw0 - (yw0 - bot0) * s, w0 * s, 2.0, 2.0))
    return k


BODY += _front_keys()
BK = np.asarray(BODY, F)


def _iz(z, col):
    return np.interp(z, BK[:, 0], BK[:, col]).astype(F)


# ---------- landmarks (left side, +x) ----------
EYE_R = 0.0125
EYE_DIR = nrm([0.93, 0.06, 0.36])
EYE_C = V(0.1345, 0.27, 0.852)
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_W, LID_H, LID_OFF = 0.0115, 0.0072, -0.0005
MOUTH = V(0.0, 0.2, 1.13)
BLOW = V(0.0, 0.48, 0.76)            # the blowhole on top of the head
# the mouth line: its height along z, from its corner (the "smile" turning up) to the tip of the beak
MOUTH_Z = [0.885, 0.905, 0.93, 0.96, 1.0, 1.05, 1.1, 1.16]
MOUTH_Y = [0.246, 0.235, 0.225, 0.216, 0.209, 0.204, 0.201, 0.2]
CORNER_Z = 0.885


def mouth_y(z):
    return np.interp(z, MOUTH_Z, MOUTH_Y).astype(F)


def body(P):
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    d = loft(Q, BODY)
    # the lower jaw a little longer than the upper, rounded under the tip of the beak
    d = smin(d, ellipsoid(Q, V(0.0, 0.188, 1.11), V(0.034, 0.024, 0.045)), 0.02)
    # the crease between the melon and the beak: a soft groove over the top and the sides
    zc = 1.012 - 0.06 * sstep(0.0, 0.09, x) * sstep(0.2, 0.3, y)
    d = d + 0.0035 * np.exp(-((z - zc) / 0.012) ** 2) * sstep(0.22, 0.26, y)
    return d


def head(P, d):
    """the head's features on the body field d (inside the head box)"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    # the mouth: a groove along the beak and round its tip, turning up at the corner, the lips a little full above it
    ym = mouth_y(z)
    on = sstep(CORNER_Z - 0.004, CORNER_Z + 0.02, z)
    d = d + 0.0042 * np.exp(-((y - ym) / 0.0035) ** 2) * on
    d = d - 0.0012 * np.exp(-((y - ym - 0.008) / 0.006) ** 2) * on * sstep(1.12, 1.02, z)
    # the corner: a small dimple
    corner = ellipsoid(Q, V(0.127, MOUTH_Y[0] + 0.001, CORNER_Z + 0.004), V(0.01, 0.0065, 0.012))
    d = smax(d, -corner, 0.006)
    # the eye: a soft ring of lid round it, the opening, the ball
    ca, li, ba = eye_parts(P)
    d = smin(d, li, 0.008)
    d = smax(d, -ca, 0.002)
    d = smin(d, ba, 0.0015)
    # the blowhole: a crescent on top of the head, its horns pointing forward
    rx, rz = x - BLOW[0], z - (BLOW[2] + 0.018)
    rr = np.sqrt(rx * rx + rz * rz)
    ang = np.arctan2(rx, -rz)                                # 0 straight back, +-pi forward
    arc = np.abs(rr - 0.024) + 0.012 * sstep(1.1, 1.5, np.abs(ang))
    top = sstep(BLOW[1] - 0.05, BLOW[1] - 0.02, y)
    d = d + 0.008 * np.exp(-(arc / 0.0035) ** 2) * top
    d = d - 0.0025 * np.exp(-(((rr - 0.024) / 0.016) ** 2)) * top * sstep(1.6, 1.0, np.abs(ang))
    return d


def eye_parts(P):
    Q = mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0, -0.004), V(EYE_R + 0.01, EYE_R + 0.008, EYE_R + 0.003))
    ap = np.sqrt((s / LID_W) ** 2 + ((u - LID_OFF) / LID_H) ** 2) - 1
    ap = ap + 0.25 * sstep(0.5, 1.0, np.abs(s) / LID_W) * (np.abs(u - LID_OFF) / LID_H)
    carve = smax(ap * LID_H, -g - 0.002, 0.002)
    ball = length(D) - EYE_R * 0.92
    return carve, lids, ball


# ---------- the dorsal fin ----------
# a plate across x = 0, its outline along y: the leading edge (convex, swept back) and the trailing edge (concave),
# meeting at the pointed tip over the back of its base; thickest near the leading edge, thin at the trailing edge
DF_Y = [0.55, 0.6, 0.65, 0.7, 0.75, 0.79, 0.82, 0.845]
DF_ZL = [0.17, 0.085, 0.01, -0.07, -0.15, -0.22, -0.285, -0.35]
DF_ZT = [-0.33, -0.275, -0.245, -0.235, -0.245, -0.27, -0.305, -0.35]
DF_T = [0.034, 0.029, 0.023, 0.018, 0.013, 0.009, 0.006, 0.004]
DF_TIP = 0.845


def fin_st(P):
    Q = mirror(P)
    y, z = Q[:, 1], Q[:, 2]
    yy = np.clip(y, DF_Y[0], DF_TIP)
    zl, zt = np.interp(yy, DF_Y, DF_ZL).astype(F), np.interp(yy, DF_Y, DF_ZT).astype(F)
    return (zl - z) / np.maximum(zl - zt, 1e-4), y


def fin(P):
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    yy = np.clip(y, DF_Y[0], DF_TIP)
    zl, zt, T = (np.interp(yy, DF_Y, a).astype(F) for a in (DF_ZL, DF_ZT, DF_T))
    hc, zm = 0.5 * (zl - zt), 0.5 * (zl + zt)
    s = np.clip((zl - z) / np.maximum(zl - zt, 1e-4), 0, 1)
    prof = 1.2 * (np.sqrt(s) * 1.05 - 0.6 * s - 0.45 * s * s)
    th = np.maximum(T * prof, 0.0025)
    dp = x - th
    out = smax(np.abs(z - zm) - hc, y - DF_TIP, 0.012)
    out = smax(out, DF_Y[0] - y, 0.0)
    return smax(dp, out, 0.004)


# ---------- the flippers ----------
FL_ROOT = V(0.18, 0.16, 0.46)
FL_AX = nrm([0.66, -0.3, -0.69])
FL_UP = (0.35, 1.0, 0.1)
FL_LEN = 0.34
# along the flipper (u / FL_LEN): half chord, chord center (+ toward the leading edge), half thickness, curl (up)
FL_U = [0.0, 0.12, 0.25, 0.38, 0.5, 0.62, 0.74, 0.85, 0.94, 1.0]
FL_HC = [0.072, 0.076, 0.075, 0.07, 0.062, 0.052, 0.04, 0.027, 0.014, 0.004]
FL_CC = [0.0, 0.002, 0.002, 0.0, -0.004, -0.009, -0.014, -0.018, -0.021, -0.022]
FL_HT = [0.03, 0.026, 0.022, 0.019, 0.016, 0.013, 0.011, 0.008, 0.006, 0.004]
FL_CURL = [0.0] * 10


def flipper_local(P):
    """(chord, thickness, along) coordinates in the left flipper's frame, chord + toward its leading edge"""
    Q = mirror(P)
    L = frame(Q, FL_ROOT, FL_AX, FL_UP)
    return -L[:, 0], L[:, 1], L[:, 2]


def flipper(P):
    c, t, u = flipper_local(P)
    k = np.clip(u / FL_LEN, 0, 1)
    hc = np.interp(k, FL_U, FL_HC).astype(F)
    cc = np.interp(k, FL_U, FL_CC).astype(F)
    ht = np.interp(k, FL_U, FL_HT).astype(F)
    cu = np.interp(k, FL_U, FL_CURL).astype(F)
    cs = c - cc
    ht = ht * (1.0 + 0.22 * np.clip(cs / np.maximum(hc, 1e-4), -1, 1))
    q = np.sqrt((cs / hc) ** 2 + ((t - cu) / ht) ** 2)
    d = (q - 1) * np.minimum(hc, ht)
    d = smax(d, smax(-u - 0.04, u - FL_LEN, 0.0), 0.012)
    return d


# ---------- the flukes ----------
FK_Y = 0.36
FK_X = [0.0, 0.04, 0.08, 0.12, 0.16, 0.2, 0.24, 0.27, 0.295, 0.31]
FK_ZL = [-1.33, -1.345, -1.365, -1.395, -1.43, -1.475, -1.525, -1.57, -1.612, -1.642]     # leading edge
FK_ZT = [-1.475, -1.505, -1.522, -1.536, -1.55, -1.566, -1.588, -1.608, -1.628, -1.646]  # trailing edge
FK_T = [0.03, 0.028, 0.025, 0.021, 0.017, 0.013, 0.01, 0.008, 0.006, 0.005]             # half thickness (max)
FK_TIP = 0.31


def _fk(xx):
    from scipy.interpolate import PchipInterpolator
    if not hasattr(_fk, 'f'):
        _fk.f = [PchipInterpolator(np.array(FK_X, np.float64), np.array(a, np.float64)) for a in (FK_ZL, FK_ZT, FK_T)]
    x = np.clip(xx, 0, FK_TIP)
    return [f(x).astype(F) for f in _fk.f]


def fluke_st(P):
    """chord fraction s (0 at the leading edge, 1 at the trailing edge)"""
    Q = mirror(P)
    xx, z = Q[:, 0], Q[:, 2]
    zl, zt, _ = _fk(xx)
    return (zl - z) / np.maximum(zl - zt, 1e-4), xx


def fluke(P):
    Q = mirror(P)
    xx, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    zl, zt, T = _fk(xx)
    hc = 0.5 * (zl - zt)
    zm = 0.5 * (zl + zt)
    s = np.clip((zl - z) / np.maximum(zl - zt, 1e-4), 0, 1)
    prof = 1.2 * (np.sqrt(s) * 1.05 - 0.6 * s - 0.45 * s * s)
    th = np.maximum(T * prof, 0.0025)
    yc = FK_Y + 0.006 * sstep(0.15, 0.31, xx) ** 2
    dp = np.abs(y - yc) - th
    out = smax(np.abs(z - zm) - hc, xx - FK_TIP, 0.012)
    return smax(dp, out, 0.004)


HEAD_BOX = (V(-0.24, 0.1, 0.62), V(0.24, 0.56, 1.18))
FLIP_BOX = (V(-0.44, -0.004, 0.16), V(0.44, 0.24, 0.52))
FLUKE_BOX = (V(-0.36, 0.3, -1.7), V(0.36, 0.42, -1.26))
FIN_BOX = (V(-0.06, 0.5, -0.4), V(0.06, 0.87, 0.22))


def parts(P):
    ca, li, ba = eye_parts(P)
    return {'body': body(P), 'flipper': local(P, *FLIP_BOX, flipper), 'fluke': local(P, *FLUKE_BOX, fluke), 'fin': local(P, *FIN_BOX, fin),
            'lids': li, 'ball': ba}


def shape(P):
    d = body(P)
    m = np.all((P >= HEAD_BOX[0]) & (P <= HEAD_BOX[1]), axis=1)
    if m.any():
        d[m] = head(P[m], d[m])
    d = smin(d, local(P, *FIN_BOX, fin), 0.035)
    d = smin(d, local(P, *FLIP_BOX, flipper), 0.03)
    d = smin(d, local(P, *FLUKE_BOX, fluke), 0.022)
    return d


def grid(h):
    """finer across the thin flukes (y), the flippers, the dorsal fin (x) and the head's features"""
    lo, hi = BOUNDS
    xs = axis_steps(0.0, hi[0], [(0.0, 0.05, h * 0.45), (0.1, 0.16, h * 0.6), (0.17, 0.44, h * 0.7)], h)
    ys = axis_steps(lo[1], hi[1], [(0.02, 0.26, h * 0.7), (0.32, 0.4, h * 0.35), (0.44, 0.5, h * 0.6)], h)
    zs = axis_steps(lo[2], hi[2], [(-1.7, -1.26, h * 0.6), (0.2, 0.5, h * 0.7), (0.72, 1.18, h * 0.6)], h)
    return xs, ys, zs


# fine bake-only meshes over small features (box lo, box hi on the +x side, voxel size)
PATCHES = [
    (EYE_C + V(-0.024, -0.024, -0.024), EYE_C + V(0.02, 0.024, 0.024), 0.0011),       # the eye and its lids
    (V(0.0, 0.185, 0.87), V(0.14, 0.26, 1.16), 0.0016),                              # the mouth line
    (V(0.0, 0.44, 0.71), V(0.045, 0.5, 0.8), 0.0014),                                # the blowhole
]

PREVIEW = {
    'side': ((6.0, 0.6, -0.2), (0, 0.38, -0.2), 34),
    'front3q': ((2.8, 1.5, 3.4), (0, 0.35, 0.1), 34),
    'rear3q': ((-2.8, 1.8, -3.5), (0, 0.35, -0.3), 34),
    'top': ((0.01, 6.2, -0.2), (0, 0.35, -0.2), 34),
    'under': ((1.7, -4.0, 0.1), (0, 0.35, -0.2), 34),
    'head3q': ((0.8, 0.55, 1.9), (0, 0.3, 0.9), 26),
    'headside': ((1.6, 0.32, 0.95), (0, 0.3, 0.92), 26),
    'face': ((0.0, 0.38, 2.3), (0, 0.3, 1.0), 24),
    'flukes': ((0.8, 1.4, -2.4), (0, 0.36, -1.5), 30),
    'fin': ((1.5, 0.9, -0.1), (0, 0.65, -0.1), 26),
}


# ---------- the game mesh ----------
def keep(P):
    Pm = mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    e = sstep(0.05, 0.025, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.6
    ym = mouth_y(z)
    mo = sstep(0.014, 0.004, np.abs(y - ym)) * sstep(CORNER_Z - 0.015, CORNER_Z + 0.008, z) * 0.45
    bl = sstep(0.06, 0.035, np.linalg.norm(Pm - BLOW, axis=1)) * 0.4
    cr = sstep(0.03, 0.01, np.abs(z - 1.0)) * sstep(0.2, 0.25, y) * 0.35
    fe = sstep(0.62, 0.66, y) * sstep(0.03, 0.01, x) * 0.35
    base = np.full(len(P), 0.32, F)
    return np.maximum.reduce([base, e, mo, bl, cr, fe]).astype(F)


# where the game mesh has to bend: rings across the body around the joints of the spine (the chest is rigid)
def lowpoly_fix(bm, hi):
    import meshfix as MF
    tr = MF.tree(hi)

    def on_body(c, p0, r):
        w = float(_iz(np.array([c.z], F), 4)[0])
        top = float(_iz(np.array([c.z], F), 1)[0])
        return r < 0.4 and abs(c.x) < w + 0.02 and c.y < top + 0.02 and not (c.z < -1.3 and abs(c.x) > 0.04)
    MF.rings(bm, tr, (0.0, 0.3, -0.1), (0.0, 0.36, -1.4), 0.12, on_body)
    MF.rings(bm, tr, (0.0, 0.3, 0.42), (0.0, 0.29, 0.8), 0.1, lambda c, p0, r: r < 0.4 and not (abs(c.x) > 0.2 and c.y < 0.2 and c.z < 0.55))
    MF.finish(bm, 1e-6)


UV_AVERAGE = True
UV_PACK = dict(margin_method='FRACTION', margin=0.008)


def _onflipper(Pm):
    c, t, u = flipper_local(Pm)
    return (u > 0.05) & (np.abs(t) < 0.08) & (Pm[:, 0] > 0.2)


def uv_regions(P):
    """head, the front and back of the trunk, the tail stock, the flipper, the flukes (top, under), the dorsal fin"""
    Pm = mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 1)
    lab[z > 0.62] = 0
    lab[z < -0.3] = 2
    lab[z < -0.9] = 3
    lab[_onflipper(Pm)] = 4
    fk = (z < -1.3) & (x > 0.045)
    lab[fk & (y >= FK_Y)] = 5
    lab[fk & (y < FK_Y)] = 6
    lab[(y > _iz(z, 1) + 0.015) & (z > -0.4) & (z < 0.2)] = 7
    return lab


def uv_weight(P):
    Pm = mirror(P)
    z = Pm[:, 2]
    return (1.0 + 0.5 * sstep(0.62, 0.8, z)).astype(F)


WEIGHT_SMOOTH = (0, 0.5)
SPINE = ['fluke', 'tail2', 'tail1', 'hips', 'chest', 'neck', 'head']
# pivots (z) between them, and how far each joint blends (m)
SPINE_Z = [-1.33, -1.06, -0.72, -0.3, 0.5, 0.7]
SPINE_B = [0.07, 0.12, 0.15, 0.18, 0.1, 0.09]


def bone_tips(P):
    t = {'chest': P['neck'], 'hips': P['tail1'], 'tail1': P['tail2'], 'tail2': P['fluke'], 'fluke': V(0, 0.36, -1.6),
         'neck': P['head'], 'head': V(0, 0.25, 1.1)}
    for s, sg in (('L', 1), ('R', -1)):
        t['flipper' + s] = (FL_ROOT + FL_AX * FL_LEN) * V(sg, 1, 1)
    return t


def spine_w(z):
    """weights of the spine bones by z: each bone bends the body behind (or for the neck and head, in front of) its
    pivot, blended over SPINE_B at each joint"""
    out = []
    n = len(SPINE)
    for j, nm in enumerate(SPINE):
        lo = sstep(SPINE_Z[j - 1] - SPINE_B[j - 1], SPINE_Z[j - 1] + SPINE_B[j - 1], z) if j > 0 else np.ones_like(z)
        hi = sstep(SPINE_Z[j] + SPINE_B[j], SPINE_Z[j] - SPINE_B[j], z) if j < n - 1 else np.ones_like(z)
        out.append((nm, lo * hi))
    return out


def fix_weights(W, wpos, names, G, weld):
    """every weight from the sculpt's own parts: the body, the dorsal fin and the head one smooth chain along z, the
    flukes on the fluke bone (from a little out of the middle), the flippers on their bones from just outside the body"""
    bi = {n: i for i, n in enumerate(names)}
    P = wpos.astype(F)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    Wn = np.zeros_like(W)
    for nm, w in spine_w(z):
        Wn[:, bi[nm]] = w
    c = parts(P)
    isf = (c['fluke'] < c['body'] + 0.003) & (z < -1.26)
    kf = isf * sstep(0.025, 0.08, np.abs(x))
    one = np.zeros_like(W); one[:, bi['fluke']] = 1
    Wn = Wn * (1 - kf[:, None]) + one * kf[:, None]
    ch, th, u = flipper_local(P)
    isp = (c['flipper'] < c['body'] + 0.004) & (z > 0.16) & (z < 0.52)
    kp = isp * sstep(0.04, 0.1, u)
    for s, sg in (('L', 1), ('R', -1)):
        m = (x * sg > 0)
        k = kp * m
        one = np.zeros_like(W); one[:, bi['flipper' + s]] = 1
        Wn = Wn * (1 - k[:, None]) + one * k[:, None]
    return Wn / np.maximum(Wn.sum(1, keepdims=True), 1e-9)


# ---------- skin: a faint height field ----------
def _cells(Q, size, seed):
    """Worley cells: nearest and second distances (meters) and the nearest cell's center"""
    X = Q / size
    f = np.floor(X).astype(np.int64)
    f1 = np.full(len(Q), 9.0, F); f2 = np.full(len(Q), 9.0, F)
    best = np.zeros((len(Q), 3), F)
    for dz in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                cx, cy, cz = f[:, 0] + dx, f[:, 1] + dy, f[:, 2] + dz
                fp = np.stack([cx + 0.1 + 0.8 * _hash(cx, cy, cz, seed), cy + 0.1 + 0.8 * _hash(cx, cy, cz, seed + 1), cz + 0.1 + 0.8 * _hash(cx, cy, cz, seed + 2)], 1).astype(F)
                d = np.linalg.norm(fp - X, axis=1)
                m = d < f1
                f2 = np.where(m, f1, np.minimum(f2, d))
                f1 = np.where(m, d, f1)
                best[m] = fp[m]
    return f1 * size, f2 * size, best * size


def _cell_rnd(C, seed):
    k = np.round(C * 1000).astype(np.int64)
    return _hash(k[:, 0], k[:, 1], k[:, 2], seed)


def _rakes(Pm, size, seed, frac):
    """rake marks (other dolphins' teeth): a few sets of three short parallel lines, slanting across the body, one in
    some of the cells of a coarse grid; returns the distance to the nearest line (m) and its fade along the line"""
    f1, f2, cp = _cells(Pm, size, seed)
    r1, r2, r3, r4 = (_cell_rnd(cp, seed + k) for k in range(1, 5))
    dz = np.stack([(r1 - 0.5) * 0.4, 0.6 + (r2 - 0.5) * 0.8, 0.5 + 0.5 * r2], 1)
    dz /= np.linalg.norm(dz, axis=1, keepdims=True)
    q = Pm - cp
    t = (q * dz).sum(1)
    half = size * (0.12 + 0.12 * r3)
    perp = q - dz * t[:, None]
    # three lines 6 mm apart, side by side along the body
    side = np.cross(dz, np.array([1.0, 0, 0], F)); side /= np.maximum(np.linalg.norm(side, axis=1, keepdims=True), 1e-6)
    o = (perp * side).sum(1)
    dist = np.minimum(np.minimum(np.abs(o), np.abs(o - 0.006)), np.abs(o + 0.006))
    dist = np.sqrt(dist ** 2 + np.maximum(np.linalg.norm(perp, axis=1) ** 2 - o ** 2, 0))
    fade = sstep(half, half * 0.5, np.abs(t)) * (r4 < frac)
    return dist, fade


def _regions(P, N, c):
    Pm = mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    r = {'Pm': Pm, 'Nm': Nm}
    r['eyeD'] = np.linalg.norm(Pm - EYE_C, axis=1)
    r['ball'] = sstep(0.003, 0.0008, c['ball']) * sstep(EYE_R + 0.004, EYE_R + 0.001, r['eyeD'])
    r['lid'] = sstep(EYE_R + 0.016, EYE_R + 0.006, r['eyeD']) * (1 - r['ball'])
    r['flip'] = sstep(0.005, 0.0, c['flipper'] - c['body'] + 0.003) * sstep(0.19, 0.22, x)
    r['fluke'] = sstep(0.005, 0.0, c['fluke'] - c['body'] + 0.003) * sstep(0.025, 0.06, x)
    r['dfin'] = sstep(0.005, 0.0, c['fin'] - c['body'] + 0.003) * sstep(_iz(z, 1) - 0.005, _iz(z, 1) + 0.025, y)
    r['fin'] = np.maximum(np.maximum(r['flip'], r['fluke']), r['dfin'])
    ym = mouth_y(z)
    r['lipD'] = y - ym
    r['beak'] = sstep(0.99, 1.03, z)
    yw = _iz(z, 2)
    r['belly'] = sstep(-0.1, -0.6, Nm[:, 1]) * sstep(yw + 0.01, yw - 0.07, y) * (1 - r['fin'])
    s, xx = fluke_st(P)
    r['fkEdge'] = r['fluke'] * np.maximum(sstep(0.85, 0.99, s), sstep(0.27, 0.305, xx))
    return r


def detail(P, N, c):
    """a faint skin grain, a few pale rake marks, soft creases round the flipper roots and behind the head"""
    R = _regions(P, N, c)
    Pm = R['Pm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    H = np.zeros(len(P), F)
    # soft creases behind the head low on the sides (they show when the head turns)
    wob = 0.03 * (fbm(Pm * 3, 2, 21) - 0.5)
    brk = sstep(0.4, 0.65, fbm(Pm * V(4, 4, 1), 2, 23))
    neck = np.sin((z + wob) * 2 * np.pi / 0.04) * sstep(0.55, 0.62, z) * sstep(0.74, 0.67, z) * sstep(0.12, 0.18, x) * sstep(0.34, 0.24, y)
    H += 0.00035 * neck * brk
    ch, th, u = flipper_local(P)
    fr = np.sin(u * 2 * np.pi / 0.025) * sstep(0.02, 0.04, u) * sstep(0.085, 0.06, u) * (np.abs(th) < 0.06)
    H += 0.0004 * fr
    for k, (size, w, amp, frac) in enumerate(((0.3, 0.0016, 0.00025, 0.35), (0.18, 0.0012, 0.0002, 0.25))):
        dist, fade = _rakes(Pm, size, 61 + 10 * k, frac)
        H -= amp * sstep(w, 0.0, dist) * fade * (1 - R['fin']) * (1 - R['belly'])
    H += 0.00012 * (fbm(Pm * 80, 2, 25) - 0.5)
    H *= (1 - R['ball'])
    return H.astype(F)


# ---------- paint ----------
K = {
    'side': hexc(0x666C73), 'cape': hexc(0x3A4047), 'belly': hexc(0xDAD7D1), 'pink': hexc(0xD9C8C4), 'throat': hexc(0xC9C8C4),
    'fin': hexc(0x41474E), 'flip': hexc(0x3E444B), 'finUnder': hexc(0x5C6269), 'edge': hexc(0x2C3136), 'stripe': hexc(0x50565D),
    'lid': hexc(0x2E3237), 'ball': hexc(0x0E0C0B), 'lip': hexc(0x3A3F44), 'chin': hexc(0xBFBDB8), 'scar': hexc(0x9EA3A8),
}


def _cape(Pm, Nm):
    """how much of the dark cape: over the back from the melon to the tail stock, its lower edge dipping a little under
    the dorsal fin and rising toward the head and the flukes, soft and a little wavy"""
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    up = Nm[:, 1]
    top, yw = _iz(z, 1), _iz(z, 2)
    edge = yw + (top - yw) * (0.38 - 0.16 * np.exp(-((z + 0.15) / 0.35) ** 2) + 0.14 * sstep(0.45, 0.85, z) - 0.08 * sstep(-0.7, -1.2, z))
    edge = edge + 0.012 * (fbm(Pm * V(2, 2, 3), 2, 77) - 0.5)
    k = sstep(edge - 0.03, edge + 0.03, y) * sstep(-0.2, 0.25, up)
    # the cape reaches forward over the melon and fades out down the top of the beak
    k = k * (1 - 0.55 * sstep(0.95, 1.08, z))
    return k


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    up = Nm[:, 1]
    n = len(P)
    col = np.tile(K['side'], (n, 1))
    col = mix(col, K['cape'], _cape(Pm, Nm) * (1 - R['fin']))
    # the pale belly and throat: the line between gray and white runs along the side a little under the widest line,
    # reaching higher on the throat and in front of the flipper, soft
    yw = _iz(z, 2)
    bl = yw - 0.06 + 0.05 * sstep(0.3, 0.75, z) * sstep(1.0, 0.85, z) - 0.03 * sstep(-0.6, -1.2, z) + 0.01 * (fbm(Pm * V(2, 2, 3), 2, 81) - 0.5)
    bk = sstep(bl + 0.03, bl - 0.04, y) * (1 - R['fin'])
    col = mix(col, K['throat'], bk * sstep(0.55, 0.8, z))
    col = mix(col, K['belly'], bk * sstep(0.85, 0.6, z))
    col = mix(col, K['pink'], bk * 0.35 * sstep(0.2, -0.3, z) * sstep(-0.9, -0.5, z) * sstep(-0.6, -0.9, up))
    # the lower jaw pale, the tip of the chin paler; the top of the beak gray
    col = mix(col, K['chin'], sstep(0.0, -0.01, R['lipD']) * sstep(0.95, 1.05, z) * 0.85)
    # a faint dark line from the eye back to the flipper, and the mouth line itself a little darker
    ex = np.interp(z, [0.4, 0.85], [0.17, EYE_C[1]]).astype(F)
    st = np.exp(-((y - ex) / 0.018) ** 2) * sstep(0.42, 0.5, z) * sstep(0.86, 0.8, z) * sstep(0.08, 0.12, x)
    col = mix(col, K['stripe'], st * 0.35)
    col = mix(col, K['lip'], np.exp(-(R['lipD'] / 0.0025) ** 2) * sstep(CORNER_Z - 0.005, CORNER_Z + 0.01, z) * 0.4)
    # the fins: the dorsal fin dark, the flippers and the tops of the flukes dark, under the flukes paler, dark edges
    col = mix(col, K['fin'], R['dfin'])
    col = mix(col, K['flip'], R['flip'] * sstep(-0.5, 0.3, up))
    col = mix(col, K['finUnder'], R['flip'] * sstep(0.3, -0.5, up))
    col = mix(col, K['fin'], R['fluke'] * sstep(-0.3, 0.3, up))
    col = mix(col, K['finUnder'], R['fluke'] * sstep(0.3, -0.3, up))
    col = mix(col, K['edge'], R['fkEdge'] * 0.6)
    # rake marks: faint pale lines
    for k, (size, w, frac) in enumerate(((0.3, 0.002, 0.35), (0.18, 0.0015, 0.25))):
        dist, fade = _rakes(Pm, size, 61 + 10 * k, frac)
        col = mix(col, K['scar'], sstep(w, 0.0, dist) * fade * (1 - R['fin']) * (1 - R['belly']) * 0.4)
    col = col * (0.96 + 0.08 * fbm(Pm * 2.2, 3, 7))[:, None]
    col = mix(col, K['lid'], R['lid'] * 0.6)
    col = mix(col, K['ball'], R['ball'])
    rough = 0.3 + 0.05 * fbm(Pm * 5, 2, 9) - 0.18 * R['ball']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.1, 0.9).astype(F)


# ---------- the calf's colors (its own color map) ----------
KB = {'side': hexc(0x737980), 'cape': hexc(0x585E65), 'belly': hexc(0xD6D4CF), 'fold': hexc(0x9DA2A7), 'fin': hexc(0x5A6067), 'lid': hexc(0x464C52)}
BABY_SIZE = 256
BABY_MAP = (256, 70)


def paint_baby(P, N, c):
    R = _regions(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    col = np.tile(KB['side'], (n, 1))
    col = mix(col, KB['cape'], _cape(Pm, Nm) * 0.7 * (1 - R['fin']))
    yw = _iz(z, 2)
    bl = yw - 0.04 + 0.05 * sstep(0.3, 0.75, z) * sstep(1.0, 0.85, z)
    col = mix(col, KB['belly'], sstep(bl + 0.03, bl - 0.05, y) * (1 - R['fin']))
    # the fetal fold stripes: five or six faint pale bands across the middle of each side, up and down, a little
    # uneven, fading out over the back and into the belly
    ph = (z + 0.025 * (fbm(Pm * V(1, 3, 1), 2, 91) - 0.5)) / 0.1
    band = sstep(0.3, 0.85, np.cos(ph * 2 * np.pi)) * sstep(-0.3, -0.18, z) * sstep(0.3, 0.18, z)
    band = band * sstep(yw - 0.1, yw - 0.02, y) * sstep(_iz(z, 1) - 0.05, _iz(z, 1) - 0.14, y) * (1 - R['fin'])
    col = mix(col, KB['fold'], band * 0.32)
    col = mix(col, KB['fin'], R['fin'])
    col = col * (0.97 + 0.06 * fbm(Pm * 2.0, 3, 17))[:, None]
    col = mix(col, KB['lid'], R['lid'] * 0.5)
    col = mix(col, K['ball'], R['ball'])
    return np.clip(col, 0, 1).astype(F), np.full(n, 0.34, F)


def finish(C, ao, valid):
    lin = np.where(C <= 0.04045, C / 12.92, ((C + 0.055) / 1.055) ** 2.4)
    lin = lin * (0.45 + 0.55 * ao[..., None])
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(np.maximum(lin, 0), 1 / 2.4) - 0.055)


# ---------- what the game needs besides the mesh ----------
MAP_QUALITY = (66, 56)
PAD_SMOOTH = 4


def stats(P, N, c, col):
    R = _regions(P, N, c)
    m = R['lid'] * sstep(EYE_R + 0.012, EYE_R + 0.006, R['eyeD'])
    rgb = lambda v: int(round(v[0] * 255)) << 16 | int(round(v[1] * 255)) << 8 | int(round(v[2] * 255))
    lid = (col * m[:, None]).sum(0) / max(m.sum(), 1e-6)
    colb, _ = paint_baby(P, N, c)
    lidb = (colb * m[:, None]).sum(0) / max(m.sum(), 1e-6)
    return {'lidCol': rgb(np.clip(lid, 0, 1)), 'babyLidCol': rgb(np.clip(lidb, 0, 1))}


def meta(st):
    r = EYE_R
    up, dn = (LID_OFF + LID_H) / r, (LID_OFF - LID_H) / r
    # no collar: a dolphin never wears one (the game draws none without a collar place)
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.25],
                'iris': 0x3A281C, 'irisR': 0.96, 'pupil': 'h', 'pupilR': 0.45, 'rim': 0x0A0806, 'lidCol': st['lidCol'], 'babyLidCol': st['babyLidCol']},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.04, 0.05, 0.06], 'flat': 0x6A7076,
    }
