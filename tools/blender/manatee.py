# An Amazonian manatee (Trichechus inunguis), a grown-up, sculpted as a signed distance field around the game's manatee
# skeleton (tools/blender/work/manatee-rig.json). Units are meters in game rig space (x left, y up, z forward, the
# belly on y = 0). 2.6 m from the lip to the edge of the paddle, 0.9 m deep, 0.84 m wide. Made from narwhal.py (the
# closest body: one loft, flippers, a flat tail plate).
# Shape: one loft from the tail stock to the head, a long round body thickest at the chest, hardly any neck (a soft
# crease behind the head); a small head ending in a big round muzzle: the upper lip is two fat bristly pads, split in
# the middle, facing down and forward, the short lower lip tucked in under them, the mouth between; the two nostrils on
# top of the front of the snout (crescent slits with flap valves); tiny eyes in a puckered ring of lid; a pinhole ear;
# long paddle flippers with no nails; a round paddle of a tail (a spoon, widest two thirds of the way back, no notch).
# Skin: smooth, with fine wrinkles all over (in the normal map), deeper folds at the neck and the flipper roots,
# bristle follicles on the lip pads.
# Paint: dark slate gray, darker along the back, a little lighter under; the white to pink patch on the chest and
# belly this species has (ragged edged, between the flippers and on back along the belly); the muzzle a little
# browner, the bristles dark; a few pale old scars. The calf has its own color map (paint_baby): paler gray, smoother,
# the patch fainter.
# Make it with: VOXEL=0.005 TRIS=4600 WEIGHTS=transfer TEX=1024 BLENDER_PY=... python3 tools/blender/make.py manatee sculpt export
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, loft, fbm, length, _hash, frame, axis_steps
from carnivore import local, mirror, hexc, mix

ID = 'manatee'
BOUNDS = (V(-0.72, -0.004, -1.43), V(0.72, 0.94, 1.27))
BAKE_DIST = (0.02, 0.05, 0.2)
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True

# ---------- landmarks (left side, +x) ----------
EYE_R = 0.0095
EYE_DIR = nrm([0.93, 0.12, 0.34])
EYE_C = V(0.237, 0.505, 0.862)
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_W, LID_H, LID_OFF = 0.0075, 0.0058, 0.0
EAR = V(0.279, 0.49, 0.74)               # a pinhole ear behind the eye
MOUTH = V(0.0, 0.165, 1.115)
NOSE = V(0.042, 0.505, 1.16)            # the left nostril, on top of the front of the snout
# the lip pads (the split upper lip), the muzzle behind them, the lower lip
PAD_C, PAD_R = V(0.055, 0.25, 1.1), V(0.09, 0.09, 0.1)
MUZ_C, MUZ_R = V(0.0, 0.31, 1.08), V(0.17, 0.155, 0.15)
LOW_C, LOW_R = V(0.0, 0.15, 1.02), V(0.085, 0.05, 0.075)

# body from the end of the tail stock to the head, one loft: z, top, yw (height of widest), bottom, half width,
# exponents above and below the widest line
BODY = [
    (-1.04, 0.525, 0.47, 0.415, 0.11, 2.0, 2.0),
    (-0.94, 0.58, 0.47, 0.355, 0.165, 2.0, 2.0),
    (-0.8, 0.655, 0.468, 0.275, 0.232, 2.05, 2.0),
    (-0.62, 0.735, 0.465, 0.185, 0.298, 2.1, 2.05),
    (-0.4, 0.815, 0.46, 0.095, 0.358, 2.15, 2.1),
    (-0.14, 0.875, 0.455, 0.032, 0.403, 2.2, 2.15),
    (0.12, 0.9, 0.45, 0.006, 0.42, 2.2, 2.15),
    (0.36, 0.878, 0.45, 0.018, 0.402, 2.2, 2.1),
    (0.52, 0.83, 0.448, 0.055, 0.355, 2.15, 2.05),
    (0.63, 0.785, 0.445, 0.085, 0.315, 2.1, 2.0),
    (0.74, 0.742, 0.44, 0.105, 0.285, 2.05, 2.0),
    (0.86, 0.69, 0.43, 0.12, 0.255, 2.0, 2.0),
    (0.96, 0.632, 0.415, 0.13, 0.226, 2.0, 2.0),
    (1.04, 0.585, 0.39, 0.14, 0.2, 2.0, 2.0),
    (1.1, 0.545, 0.37, 0.16, 0.18, 2.0, 2.0),
]


def _front_keys():
    """the loft's rounded front, the top of the snout curving down to the face: sections shrinking along a quarter
    ellipse to a tiny one"""
    k = []
    z0, top0, yw0, bot0, w0 = 1.1, 0.545, 0.37, 0.16, 0.18
    for z in (1.13, 1.16, 1.18, 1.195):
        s = np.sqrt(max(1 - ((z - z0) / 0.1) ** 2, 0.0025))
        k.append((z, yw0 + (top0 - yw0) * s, yw0, yw0 - (yw0 - bot0) * s, w0 * s, 2.0, 2.0))
    return k


BODY += _front_keys()
BK = np.asarray(BODY, F)


def _iz(z, col):
    return np.interp(z, BK[:, 0], BK[:, col]).astype(F)


# ---------- the body and the head ----------
def body(P):
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    d = loft(Q, BODY)
    # the muzzle: a big round snout, the two lip pads in front and under it (split in the middle: the mirror), the
    # short lower lip tucked in under them
    d = smin(d, ellipsoid(Q, MUZ_C, MUZ_R), 0.08)
    d = smin(d, ellipsoid(Q, PAD_C, PAD_R), 0.035)
    d = smin(d, ellipsoid(Q, LOW_C, LOW_R), 0.03)
    # a soft crease behind the head on the top and the sides (the neck), and a fold under the chin
    d = d + 0.003 * np.exp(-((z - 0.64) / 0.05) ** 2) * sstep(0.25, 0.55, y)
    d = d + 0.004 * np.exp(-((z - 0.93) / 0.03) ** 2) * sstep(0.2, 0.12, y)
    return d


def head(P, d):
    """the head's features on the body field d (inside the head box)"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    # the mouth: a groove between the lip pads and the lower lip, round the front and back along the sides
    pad = ellipsoid(Q, PAD_C, PAD_R)
    low = ellipsoid(Q, LOW_C, LOW_R)
    gap = np.abs(pad - low)
    d = d + 0.008 * np.exp(-(gap / 0.006) ** 2) * sstep(0.1, 0.13, y) * sstep(0.22, 0.17, y) * sstep(0.95, 1.0, z)
    # the cleft between the two lip pads, down the front
    d = d + 0.007 * np.exp(-(x / 0.012) ** 2) * sstep(1.12, 1.18, z) * sstep(0.38, 0.3, y) * sstep(0.14, 0.2, y)
    # the nostrils: two crescent slits on top of the front of the snout, their flaps (valves) closed, the slit curving
    # back at the outer end
    nx, nz = x - NOSE[0], z - NOSE[2]
    ang = np.arctan2(nx, nz)
    rr = np.sqrt(nx * nx + nz * nz)
    arc = np.abs(rr - 0.017) + 0.012 * sstep(1.4, 2.2, np.abs(ang - 0.5))
    top = sstep(0.45, 0.48, y)
    d = d + 0.007 * np.exp(-(arc / 0.0032) ** 2) * top
    d = d - 0.003 * np.exp(-(rr / 0.024) ** 2) * top                                   # the flap swells a little
    # the eye: a puckered ring of lid round it, the opening, the ball
    ca, li, ba = eye_parts(P)
    d = smin(d, li, 0.008)
    d = smax(d, -ca, 0.002)
    d = smin(d, ba, 0.0015)
    # the ear: a tiny pinhole
    d = smax(d, -(length(Q - EAR) - 0.0035), 0.003)
    return d


def eye_parts(P):
    Q = mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0, -0.004), V(EYE_R + 0.011, EYE_R + 0.01, EYE_R + 0.003))
    ap = np.sqrt((s / LID_W) ** 2 + ((u - LID_OFF) / LID_H) ** 2) - 1
    carve = smax(ap * LID_H, -g - 0.002, 0.002)
    ball = length(D) - EYE_R * 0.92
    return carve, lids, ball


# ---------- the flippers ----------
FL_ROOT = V(0.33, 0.29, 0.52)
FL_AX = nrm([0.7, -0.42, -0.58])
FL_UP = (0.45, 1.0, 0.1)
FL_LEN = 0.46
# along the flipper (u / FL_LEN): half chord, chord center (+ toward the leading edge), half thickness, curl (up)
FL_U = [0.0, 0.15, 0.3, 0.42, 0.55, 0.68, 0.8, 0.9, 0.96, 1.0]
FL_HC = [0.078, 0.068, 0.062, 0.066, 0.078, 0.086, 0.086, 0.074, 0.052, 0.018]
FL_CC = [-0.004, -0.002, 0.0, 0.004, 0.008, 0.01, 0.01, 0.008, 0.006, 0.004]
FL_HT = [0.042, 0.036, 0.031, 0.028, 0.025, 0.022, 0.019, 0.016, 0.013, 0.009]
FL_CURL = [0.0, 0.0, 0.0, 0.0, 0.0, -0.004, -0.008, -0.012, -0.015, -0.016]


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
    ht = ht * (1.0 + 0.15 * np.clip(cs / np.maximum(hc, 1e-4), -1, 1))
    q = np.sqrt((cs / hc) ** 2 + ((t - cu) / ht) ** 2)
    d = (q - 1) * np.minimum(hc, ht)
    d = smax(d, smax(-u - 0.05, u - FL_LEN, 0.0), 0.04)
    return d


# ---------- the paddle (the tail) ----------
FK_Y = 0.47
FK_X = [0.0, 0.06, 0.12, 0.18, 0.23, 0.27, 0.3, 0.32, 0.33]
FK_ZL = [-0.93, -0.935, -0.95, -0.972, -1.0, -1.032, -1.07, -1.11, -1.16]       # leading edge
FK_ZT = [-1.39, -1.387, -1.376, -1.356, -1.327, -1.292, -1.252, -1.212, -1.16]  # trailing edge
FK_T = [0.05, 0.048, 0.044, 0.038, 0.032, 0.026, 0.02, 0.015, 0.01]           # half thickness (max)
FK_TIP = 0.33


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
    s = (zl - z) / np.maximum(zl - zt, 1e-4)
    return s, xx


def fluke(P):
    Q = mirror(P)
    xx, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    zl, zt, T = _fk(xx)
    hc = 0.5 * (zl - zt)
    zm = 0.5 * (zl + zt)
    s = np.clip((zl - z) / np.maximum(zl - zt, 1e-4), 0, 1)
    # thickness along the chord: full at the front (it runs on from the tail stock), thinning to a rounded rim
    prof = 1.0 - 0.75 * s ** 1.6
    th = np.maximum(T * prof, 0.006)
    yc = FK_Y + 0.01 * sstep(0.15, 0.33, xx)
    dp = np.abs(y - yc) - th
    out = smax(np.abs(z - zm) - hc, xx - FK_TIP, 0.04)
    return smax(dp, out, 0.01)


HEAD_BOX = (V(-0.36, 0.08, 0.6), V(0.36, 0.7, 1.27))
FLIP_BOX = (V(-0.74, -0.004, 0.2), V(0.74, 0.42, 0.7))
FLUKE_BOX = (V(-0.4, 0.38, -1.43), V(0.4, 0.56, -0.88))


def parts(P):
    ca, li, ba = eye_parts(P)
    return {'body': body(P), 'flipper': local(P, *FLIP_BOX, flipper), 'fluke': local(P, *FLUKE_BOX, fluke), 'lids': li, 'ball': ba}


def shape(P):
    d = body(P)
    m = np.all((P >= HEAD_BOX[0]) & (P <= HEAD_BOX[1]), axis=1)
    if m.any():
        d[m] = head(P[m], d[m])
    d = smin(d, local(P, *FLIP_BOX, flipper), 0.05)
    d = smin(d, local(P, *FLUKE_BOX, fluke), 0.06)
    return d


def grid(h):
    """finer across the thin paddle (y), the flippers and the head's features"""
    lo, hi = BOUNDS
    xs = axis_steps(0.0, hi[0], [(0.0, 0.08, h * 0.5), (0.18, 0.3, h * 0.6), (0.3, 0.72, h * 0.7)], h)
    ys = axis_steps(lo[1], hi[1], [(-0.004, 0.32, h * 0.7), (0.4, 0.54, h * 0.4), (0.42, 0.53, h * 0.6)], h)
    zs = axis_steps(lo[2], hi[2], [(-1.43, -0.88, h * 0.6), (0.2, 0.7, h * 0.7), (0.78, 1.27, h * 0.5)], h)
    return xs, ys, zs


# fine bake-only meshes over small features (box lo, box hi on the +x side, voxel size)
PATCHES = [
    (EYE_C + V(-0.022, -0.022, -0.022), EYE_C + V(0.02, 0.022, 0.022), 0.0012),       # the eye and its lids
    (V(0.0, 0.42, 1.08), V(0.09, 0.5, 1.2), 0.0016),                                 # the nostrils
    (V(0.0, 0.08, 0.95), V(0.16, 0.24, 1.24), 0.0022),                               # the mouth
]

PREVIEW = {
    'side': ((6.0, 0.7, -0.05), (0, 0.45, -0.05), 34),
    'front3q': ((3.0, 1.6, 3.6), (0, 0.45, 0.1), 34),
    'rear3q': ((-3.0, 1.9, -3.6), (0, 0.45, -0.3), 34),
    'top': ((0.01, 6.5, -0.05), (0, 0.45, -0.05), 34),
    'under': ((1.8, -4.2, 0.1), (0, 0.45, 0.0), 34),
    'head3q': ((0.9, 0.7, 2.2), (0, 0.4, 1.0), 26),
    'headside': ((1.8, 0.45, 1.0), (0, 0.4, 0.95), 26),
    'face': ((0.0, 0.5, 2.6), (0, 0.33, 1.1), 22),
    'paddle': ((0.9, 1.6, -2.4), (0, 0.47, -1.15), 30),
    'flipper': ((1.5, 0.3, 1.3), (0.45, 0.2, 0.45), 26),
}


# ---------- the game mesh ----------
def keep(P):
    Pm = mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    e = sstep(0.045, 0.022, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.6
    mo = sstep(0.06, 0.02, np.abs(ellipsoid(Pm, PAD_C, PAD_R) - ellipsoid(Pm, LOW_C, LOW_R))) * sstep(0.95, 1.0, z) * sstep(0.26, 0.2, y) * 0.45
    no = sstep(0.05, 0.025, np.linalg.norm(Pm - NOSE, axis=1)) * 0.45
    mz = sstep(1.0, 1.08, z) * 0.4
    base = np.full(len(P), 0.32, F)
    return np.maximum.reduce([base, e, mo, no, mz]).astype(F)


# where the game mesh has to bend: rings across the body around the joints of the spine, and across the neck
def lowpoly_fix(bm, hi):
    import meshfix as MF
    tr = MF.tree(hi)

    def on_body(c, p0, r):
        w = float(_iz(np.array([c.z], F), 4)[0])
        return r < 0.5 and abs(c.x) < w + 0.03 and not (c.z < -0.92 and abs(c.x) > 0.1)
    MF.rings(bm, tr, (0.0, 0.45, -0.05), (0.0, 0.47, -1.02), 0.11, on_body)
    MF.rings(bm, tr, (0.0, 0.45, 0.5), (0.0, 0.43, 0.9), 0.1, lambda c, p0, r: r < 0.5 and not (abs(c.x) > 0.3 and c.y < 0.33 and c.z < 0.7))
    MF.finish(bm, 1e-6)


UV_AVERAGE = True
UV_PACK = dict(margin_method='FRACTION', margin=0.008)


def _onflipper(Pm):
    c, t, u = flipper_local(Pm)
    return (u > 0.06) & (np.abs(t) < 0.1) & (Pm[:, 0] > 0.34)


def uv_regions(P):
    """head, the front and back of the trunk, the tail stock, the flipper, the paddle top and under"""
    Pm = mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 1)
    lab[z > 0.62] = 0
    lab[z < -0.2] = 2
    lab[z < -0.72] = 3
    lab[_onflipper(Pm)] = 4
    fk = (z < -0.93) & (x > 0.1)
    lab[fk & (y >= FK_Y)] = 5
    lab[fk & (y < FK_Y)] = 6
    return lab


def uv_weight(P):
    Pm = mirror(P)
    z = Pm[:, 2]
    return (1.0 + 0.5 * sstep(0.62, 0.8, z)).astype(F)


WEIGHT_SMOOTH = (0, 0.5)
SPINE = ['fluke', 'tail2', 'tail1', 'hips', 'chest', 'neck', 'head']
# pivots (z) between them, and how far each joint blends (m)
SPINE_Z = [-1.0, -0.9, -0.65, -0.3, 0.6, 0.8]
SPINE_B = [0.06, 0.09, 0.14, 0.18, 0.1, 0.09]


def bone_tips(P):
    t = {'chest': P['neck'], 'hips': P['tail1'], 'tail1': P['tail2'], 'tail2': P['fluke'], 'fluke': V(0, 0.47, -1.35),
         'neck': P['head'], 'head': V(0, 0.45, 1.0), 'snout': V(0, 0.3, 1.2)}
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
    """every weight from the sculpt's own parts: the body and head one smooth chain along z, the lip pads and the
    front of the muzzle on the snout bone, the paddle on the fluke bone, the flippers on their bones from just outside
    the body"""
    bi = {n: i for i, n in enumerate(names)}
    P = wpos.astype(F)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    Wn = np.zeros_like(W)
    for nm, w in spine_w(z):
        Wn[:, bi[nm]] = w
    # the muzzle's lower front (the lip pads, the lower lip): the snout bone, so the lips can work
    ks = sstep(0.99, 1.09, z) * sstep(0.44, 0.36, y)
    one = np.zeros_like(W); one[:, bi['snout']] = 1
    Wn = Wn * (1 - ks[:, None]) + one * ks[:, None]
    c = parts(P)
    isf = (c['fluke'] < c['body'] + 0.004) & (z < -0.9)
    kf = isf * sstep(0.08, 0.16, np.abs(x))
    one = np.zeros_like(W); one[:, bi['fluke']] = 1
    Wn = Wn * (1 - kf[:, None]) + one * kf[:, None]
    ch, th, u = flipper_local(P)
    isp = (c['flipper'] < c['body'] + 0.006) & (z > 0.2) & (z < 0.7)
    kp = isp * sstep(0.06, 0.14, u)
    for s, sg in (('L', 1), ('R', -1)):
        m = (x * sg > 0)
        k = kp * m
        one = np.zeros_like(W); one[:, bi['flipper' + s]] = 1
        Wn = Wn * (1 - k[:, None]) + one * k[:, None]
    return Wn / np.maximum(Wn.sum(1, keepdims=True), 1e-9)


# ---------- skin: wrinkles in a height field ----------
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


def _regions(P, N, c):
    Pm = mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    r = {'Pm': Pm, 'Nm': Nm}
    r['eyeD'] = np.linalg.norm(Pm - EYE_C, axis=1)
    r['ball'] = sstep(0.002, 0.0006, c['ball']) * sstep(EYE_R + 0.003, EYE_R + 0.0008, r['eyeD'])
    r['lid'] = sstep(EYE_R + 0.014, EYE_R + 0.005, r['eyeD']) * (1 - r['ball'])
    r['flip'] = sstep(0.006, 0.0, c['flipper'] - c['body'] + 0.004) * sstep(0.36, 0.4, x)
    r['fluke'] = sstep(0.006, 0.0, c['fluke'] - c['body'] + 0.004) * sstep(0.08, 0.14, x) * (z < -0.9)
    r['fin'] = np.maximum(r['flip'], r['fluke'])
    r['head'] = sstep(0.62, 0.78, z)
    # the lip pads (bristly) and the muzzle round them
    r['pad'] = sstep(0.012, -0.004, ellipsoid(Pm, PAD_C, PAD_R) - 0.004) * sstep(0.98, 1.04, z)
    r['muz'] = sstep(0.95, 1.08, z)
    r['mouth'] = sstep(0.012, 0.002, np.abs(ellipsoid(Pm, PAD_C, PAD_R) - ellipsoid(Pm, LOW_C, LOW_R))) * sstep(0.95, 1.0, z) * sstep(0.25, 0.2, y)
    r['nose'] = sstep(0.03, 0.016, np.linalg.norm((Pm - NOSE) * V(1, 1.6, 1), axis=1))
    r['top'] = sstep(0.1, 0.8, Nm[:, 1]) * (1 - r['fin'])
    r['under'] = sstep(-0.15, -0.75, Nm[:, 1]) * (1 - r['fin'])
    # the chest and belly patch: under the body from between the flippers back along the belly; its outline a noise
    # cut inside a soft oval (so it is ragged and blotchy, with a few small islands of gray in it and pale flecks
    # round it), never a hard shape
    warp = np.stack([fbm(Pm * 1.8 + 4.3 * i, 2, 120 + i) for i in range(3)], 1) - 0.5
    Q = Pm + warp * 0.12
    oval = np.sqrt((Q[:, 0] / 0.3) ** 2 + ((Q[:, 2] - 0.12) / 0.5) ** 2)
    env = sstep(1.15, 0.45, oval) * sstep(-0.1, -0.6, Nm[:, 1])
    n = fbm(Pm * V(5.0, 5.0, 3.2), 3, 121)
    r['patch'] = sstep(0.5, 0.56, n + 0.5 * env - 0.2) * sstep(0.02, 0.2, env) * (1 - r['fin'])
    return r


_cache = {}


def _scratches(Pm, size, seed, frac):
    """old scars (boat strikes and branches): short lines, mostly across the back, in some of the cells of a grid"""
    f1, f2, cp = _cells(Pm, size, seed)
    r1, r2, r3, r4 = (_cell_rnd(cp, seed + k) for k in range(1, 5))
    dz = np.stack([np.ones_like(r1), (r2 - 0.5) * 1.2, (r1 - 0.5) * 1.4], 1)
    dz /= np.linalg.norm(dz, axis=1, keepdims=True)
    q = Pm - cp
    t = (q * dz).sum(1)
    half = size * (0.2 + 0.25 * r3)
    dist = np.linalg.norm(q - dz * t[:, None], axis=1)
    fade = sstep(half, half * 0.6, np.abs(t)) * (r4 < frac)
    return dist, fade


def _wrinkles(Pm, size, seed, stretch):
    """a net of fine creases: the edges of Worley cells, stretched along the body (so most run round it)"""
    Q = Pm * stretch
    warp = np.stack([fbm(Q * (0.12 / size) + 3.1 * i, 2, seed + 5 + i) for i in range(3)], 1) - 0.5
    f1, f2, cp = _cells(Q + warp * size * 1.2, size, seed)
    e = f2 - f1
    return sstep(size * 0.16, 0.0, e)


def detail(P, N, c):
    """fine wrinkles all over (finer on the head and flippers), deeper folds at the neck and round the flippers, the
    bristle follicles on the lip pads, a few old scars and a faint skin grain"""
    R = _regions(P, N, c)
    Pm = R['Pm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    H = np.zeros(len(P), F)
    # the creases: a coarse net and a fine one, the fine one strongest on the head, the flippers and the tail stock
    coarse = _wrinkles(Pm, 0.035, 211, V(1.0, 1.0, 0.45))
    fine = _wrinkles(Pm, 0.012, 223, V(1.0, 1.0, 0.6))
    vary = 0.55 + 0.45 * sstep(0.35, 0.65, fbm(Pm * 3.0, 2, 230))
    fk = 0.6 + 0.4 * np.maximum.reduce([R['head'], R['fin'], sstep(-0.6, -0.95, z)])
    H -= (0.0006 * coarse * vary + 0.00035 * fine * fk) * (1 - R['pad'])
    # deeper folds round the neck (they show when the head turns) and round the flipper roots
    wob = 0.03 * (fbm(Pm * 3, 2, 21) - 0.5)
    neck = np.sin((z + wob) * 2 * np.pi / 0.045) * sstep(0.56, 0.62, z) * sstep(0.74, 0.68, z) * sstep(0.12, 0.25, x)
    H += 0.0008 * neck * sstep(0.35, 0.65, fbm(Pm * V(4, 4, 1), 2, 23))
    ch, th, u = flipper_local(P)
    fr = np.sin(u * 2 * np.pi / 0.03) * sstep(0.02, 0.06, u) * sstep(0.12, 0.08, u) * (np.abs(th) < 0.08)
    H += 0.0007 * fr
    # the bristles' follicles on the lip pads: little round pits, each with a stiff bristle stub in it
    f1, f2, cp = _cells(Pm, 0.009, 241)
    H += R['pad'] * (0.0007 * sstep(0.0028, 0.0008, f1) - 0.0003 * sstep(0.0011, 0.0, f1))
    # sparse fine hairs over the body: tiny pits far apart
    f1b, _, _ = _cells(Pm, 0.03, 251)
    H -= 0.00025 * sstep(0.0016, 0.0, f1b) * (1 - R['pad'])
    # old scars: shallow grooves
    for k, (size, w, amp, frac) in enumerate(((0.45, 0.004, 0.0006, 0.3), (0.2, 0.0025, 0.0004, 0.25))):
        dist, fade = _scratches(Pm, size, 31 + 10 * k, frac)
        H -= amp * sstep(w, 0.0, dist) * fade * (1 - R['fin']) * R['top']
    H += 0.00018 * (fbm(Pm * 70, 2, 25) - 0.5)
    H *= (1 - R['ball'])
    return H.astype(F)


# ---------- paint ----------
K = {
    'skin': hexc(0x3B3E40), 'back': hexc(0x2D3032), 'under': hexc(0x474A4B), 'brown': hexc(0x47433F), 'patch': hexc(0xE2D3CD),
    'pink': hexc(0xCFA8A2), 'scar': hexc(0x707372), 'lid': hexc(0x303336), 'ball': hexc(0x0D0B0A), 'mouth': hexc(0x2A2624),
    'bristle': hexc(0x262422), 'algae': hexc(0x4E5A46),
}


def paint(P, N, c):
    """the grown-up"""
    R = _regions(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    col = np.tile(K['skin'], (n, 1))
    col = mix(col, K['back'], R['top'] * 0.75)
    col = mix(col, K['under'], R['under'] * 0.6)
    # broad soft mottling, and a faint greenish film of algae here and there on the back
    col = col * (0.9 + 0.16 * fbm(Pm * 2.2, 3, 7))[:, None]
    col = mix(col, K['algae'], R['top'] * 0.25 * sstep(0.5, 0.75, fbm(Pm * 1.6, 3, 8)))
    # the muzzle a little browner, the lip pads dark with bristles
    col = mix(col, K['brown'], R['muz'] * 0.45)
    f1, f2, cp = _cells(Pm, 0.009, 241)
    col = mix(col, K['bristle'], R['pad'] * (0.35 + 0.65 * sstep(0.0025, 0.0008, f1)))
    col = mix(col, K['mouth'], R['mouth'] * 0.8)
    col = mix(col, K['back'], R['nose'] * 0.6)
    # the chest and belly patch: white to pink, pinker toward its middle, its edge a little broken
    pk = sstep(0.4, 0.7, fbm(Pm * 3.0, 2, 130))
    pc = mix(np.tile(K['patch'], (n, 1)), K['pink'], pk * 0.65)
    col = mix(col, pc, R['patch'] * 0.9)
    # the flippers and the paddle's rim a little darker
    col = mix(col, K['back'], R['fin'] * 0.3)
    s, xx = fluke_st(P)
    col = mix(col, K['back'], R['fluke'] * sstep(0.8, 0.98, s) * 0.4)
    # old scars: pale lines on the back
    for k, (size, w, frac) in enumerate(((0.45, 0.005, 0.3), (0.2, 0.0035, 0.25))):
        dist, fade = _scratches(Pm, size, 31 + 10 * k, frac)
        col = mix(col, K['scar'], sstep(w, 0.0, dist) * fade * (1 - R['fin']) * R['top'] * 0.6)
    col = mix(col, K['lid'], R['lid'] * 0.6)
    col = mix(col, K['ball'], R['ball'])
    rough = 0.46 + 0.08 * fbm(Pm * 5, 2, 9) - 0.25 * R['ball'] + 0.1 * R['pad']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.12, 0.9).astype(F)


# ---------- the calf's colors (its own color map) ----------
KB = {'skin': hexc(0x55595C), 'back': hexc(0x4A4E51), 'under': hexc(0x63676A), 'patch': hexc(0xC9B8B3), 'lid': hexc(0x3E4245), 'pad': hexc(0x47443F)}
BABY_MAP = (256, 70)


def paint_baby(P, N, c):
    R = _regions(P, N, c)
    n = len(P)
    col = np.tile(KB['skin'], (n, 1))
    col = mix(col, KB['back'], R['top'] * 0.6)
    col = mix(col, KB['under'], R['under'] * 0.6)
    col = col * (0.97 + 0.06 * fbm(P * 2.0, 3, 17))[:, None]
    col = mix(col, KB['pad'], R['pad'] * 0.5)
    col = mix(col, KB['patch'], R['patch'] * 0.55)
    col = mix(col, KB['lid'], R['lid'] * 0.5)
    col = mix(col, K['ball'], R['ball'])
    return np.clip(col, 0, 1).astype(F), np.full(n, 0.42, F)


def finish(C, ao, valid):
    lin = np.where(C <= 0.04045, C / 12.92, ((C + 0.055) / 1.055) ** 2.4)
    lin = lin * (0.45 + 0.55 * ao[..., None])
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(np.maximum(lin, 0), 1 / 2.4) - 0.055)


# ---------- what the game needs besides the mesh ----------
MAP_QUALITY = (70, 58)
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
    # no collar: a manatee never wears one
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.25],
                'iris': 0x1E1612, 'irisR': 0.97, 'pupil': 'h', 'pupilR': 0.4, 'rim': 0x0A0806, 'lidCol': st['lidCol'], 'babyLidCol': st['babyLidCol']},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.04, 0.05, 0.05], 'flat': 0x585C5E,
    }
