# A narwhal (Monodon monoceros), a grown-up male, sculpted as a signed distance field around the game's narwhal
# skeleton (tools/blender/work/narwhal-rig.json). Units are meters in game rig space (x left, y up, z forward, the
# belly on y = 0). 4.3 m from the melon to the notch of the flukes (4.55 m to their trailing edges), 1.0 m deep, 0.93 m wide; the tusk is not part of
# the sculpt (the model is one mirrored half, and the tusk grows from the left side only): the game adds it as a rigid
# piece on the tusk bone (narwhalTusk in 40_animals.js).
# Shape: one loft from the tail stock to the melon (a spindle, thickest just behind the flippers, the tail stock
# narrow and keeled above and below), a small round head with a bulging melon and no beak, a short mouth line rising a
# little at its corner, the lower jaw set in under the melon, small eyes low on the head behind the corner of the mouth
# in a soft lid ring, one crescent blowhole on top; no dorsal fin, only a low bumpy ridge from the middle of the back
# to the tail stock; short round flippers with their tips curling up; flukes that look put on backward (the trailing
# edge bulges back, with a deep notch in the middle, and the tips sweep forward).
# Skin: smooth and wet (a faint height field: fine creases behind the head and at the flippers, a few old scratches).
# Paint: mottled, dark gray to black spots and blotches on gray-white, darkest and densest on the back and the head,
# the belly pale with few spots, the flukes and flippers dark edged; the spots differ from side to side (SIDES, as the
# cow). The calf has its own color map (paint_baby): a plain slate blue-gray, paler underneath, no spots.
# Make it with: VOXEL=0.008 TRIS=5600 TEX=768 BLENDER_PY=... python3 tools/blender/make.py narwhal
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, loft, fbm, length, _hash, frame, axis_steps
from carnivore import local, mirror, hexc, mix

ID = 'narwhal'
BOUNDS = (V(-0.7, -0.004, -2.62), V(0.7, 1.08, 2.04))
BAKE_DIST = (0.02, 0.05, 0.25)
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
SIDES = True

# ---------- landmarks (left side, +x) ----------
EYE_R = 0.019
EYE_DIR = nrm([0.9, -0.1, 0.4])
EYE_C = V(0.26, 0.346, 1.712)
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_W, LID_H, LID_OFF = 0.0165, 0.0095, -0.001
MOUTH = V(0.0, 0.302, 1.945)
BLOW = V(0.0, 0.905, 1.5)            # the blowhole on top of the head
# the mouth line: its height along z (front to the corner), the corner
MOUTH_Z = [1.83, 1.86, 1.89, 1.92, 1.96, 2.0]
MOUTH_Y = [0.338, 0.326, 0.314, 0.306, 0.302, 0.302]
CORNER_Z = 1.83

# body from the end of the tail stock to the melon, one loft: z, top, yw (height of widest), bottom, half width,
# exponents above and below the widest line (under 2 on the tail stock: the keels above and below)
BODY = [
    (-2.27, 0.592, 0.562, 0.532, 0.045, 2.0, 2.0),
    (-2.18, 0.612, 0.561, 0.51, 0.052, 1.9, 1.9),
    (-2.04, 0.646, 0.558, 0.47, 0.06, 1.7, 1.7),
    (-1.84, 0.694, 0.555, 0.418, 0.08, 1.6, 1.65),
    (-1.6, 0.752, 0.55, 0.35, 0.114, 1.65, 1.7),
    (-1.32, 0.818, 0.54, 0.268, 0.168, 1.8, 1.8),
    (-1.02, 0.877, 0.527, 0.186, 0.243, 1.95, 1.9),
    (-0.68, 0.932, 0.513, 0.106, 0.328, 2.05, 2.0),
    (-0.28, 0.972, 0.5, 0.044, 0.4, 2.1, 2.05),
    (0.12, 0.994, 0.49, 0.012, 0.443, 2.15, 2.1),
    (0.5, 1.0, 0.485, 0.002, 0.463, 2.15, 2.1),
    (0.84, 0.99, 0.48, 0.008, 0.458, 2.15, 2.1),
    (1.1, 0.96, 0.477, 0.034, 0.432, 2.1, 2.05),
    (1.32, 0.915, 0.476, 0.07, 0.392, 2.05, 2.05),
    (1.5, 0.87, 0.476, 0.108, 0.35, 2.05, 2.0),
]


# the head in front of the neck (the melon): a blunt dome, its sections ellipses (as the loft's) shrinking toward the
# front along a superellipse (exponent MEL_E) in z, so the melon is fuller than an ellipsoid; it matches the loft's
# section at z = 1.62 and takes over from it between MEL_BLEND (a loft that ended in a small section printed a ring
# on the face, and a separate melon on the loft a rim round it)
MEL_C, MEL_RZ, MEL_E = V(0.0, 0.476, 1.45), 0.55, 2.4
MEL_BLEND = (1.6, 1.72)
_s0 = (1 - ((1.62 - 1.45) / MEL_RZ) ** MEL_E) ** (1 / MEL_E)
MEL_R = (0.31 / _s0, (0.835 - 0.476) / _s0, (0.476 - 0.15) / _s0)       # half width, up, down at the dome's middle


def melon(Q):
    x, y, z = Q[:, 0], Q[:, 1] - MEL_C[1], Q[:, 2] - MEL_C[2]
    ry = np.where(y > 0, MEL_R[1], MEL_R[2])
    rxy = np.sqrt((x / MEL_R[0]) ** 2 + (y / ry) ** 2)
    t = np.maximum(z, 0) / MEL_RZ
    q = (rxy ** MEL_E + t ** MEL_E) ** (1 / MEL_E)
    return (q - 1) * 0.31


def _front_keys():
    """loft keys over the dome (the loft runs on a little into it, for the blend)"""
    k = []
    for z in (1.62, 1.7, 1.78):
        s = (1 - ((z - 1.45) / MEL_RZ) ** MEL_E) ** (1 / MEL_E)
        k.append((z, 0.476 + MEL_R[1] * s, 0.476, 0.476 - MEL_R[2] * s, MEL_R[0] * s, 2.0, 2.0))
    return k


BODY += _front_keys()
BK = np.asarray(BODY, F)


def _iz(z, col):
    return np.interp(z, BK[:, 0], BK[:, col]).astype(F)


def mouth_y(z):
    return np.interp(z, MOUTH_Z, MOUTH_Y).astype(F)


# ---------- the body and the head ----------
def ridge_h(z):
    """height of the low bumpy ridge along the back (no dorsal fin): from the middle of the back to the tail stock"""
    zz = np.asarray(z, F)
    env = sstep(0.25, -0.35, zz) * sstep(-2.0, -1.4, zz)
    n = fbm(np.stack([zz * 5.0, np.zeros_like(zz), np.zeros_like(zz)], 1), 2, 11)
    bumps = 0.55 + 0.7 * sstep(0.3, 0.75, n)
    return (0.022 * env * bumps).astype(F)


def body(P):
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    d = loft(Q, BODY)
    # the melon takes over from the loft in front of the neck
    fm = z > MEL_BLEND[0]
    if fm.any():
        k = sstep(MEL_BLEND[0], MEL_BLEND[1], z[fm])
        d[fm] = d[fm] * (1 - k) + melon(Q[fm]) * k
    # the upper lip under the melon, and the lower jaw set in under it, a little behind
    d = smin(d, ellipsoid(Q, V(0.0, 0.36, 1.875), V(0.13, 0.08, 0.075)), 0.09)
    d = smin(d, ellipsoid(Q, V(0.0, 0.265, 1.835), V(0.14, 0.08, 0.105)), 0.07)
    # a very slight crease behind the head on the top and the sides (the narwhal has a neck)
    d = d + 0.003 * np.exp(-((z - 1.34) / 0.1) ** 2) * sstep(0.3, 0.6, y)
    # the ridge along the back, only on the top line
    rh = ridge_h(z)
    yt = _iz(z, 1)
    on = np.exp(-(x / 0.05) ** 2) * sstep(yt - 0.14, yt - 0.04, y)
    d = d - rh * on
    return d


def head(P, d):
    """the head's features on the body field d (inside the head box)"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    # the mouth: a short groove round the front, rising a little toward its corner, the lower lip set in under it
    ym = mouth_y(z)
    front = sstep(CORNER_Z - 0.01, CORNER_Z + 0.025, z)
    lip = np.exp(-((y - ym) / 0.005) ** 2) * front
    low = sstep(ym + 0.002, ym - 0.012, y) * sstep(ym - 0.1, ym - 0.05, y) * sstep(CORNER_Z, CORNER_Z + 0.04, z)
    d = d + 0.005 * lip + 0.004 * low
    # the corner of the mouth: a small dimple
    corner = ellipsoid(Q, V(0.19, 0.336, CORNER_Z + 0.008), V(0.018, 0.011, 0.018))
    d = smax(d, -corner, 0.012)
    # the eye: a soft ring of lid round it, the opening, the ball
    ca, li, ba = eye_parts(P)
    d = smin(d, li, 0.012)
    d = smax(d, -ca, 0.003)
    d = smin(d, ba, 0.002)
    # the blowhole: a crescent on top of the head, its horns pointing forward
    rx, rz = x - BLOW[0], z - (BLOW[2] + 0.03)
    rr = np.sqrt(rx * rx + rz * rz)
    ang = np.arctan2(rx, -rz)                                # 0 straight back, +-pi forward
    arc = np.abs(rr - 0.045) + 0.02 * sstep(1.1, 1.5, np.abs(ang))
    top = sstep(0.8, 0.86, y)
    d = d + 0.012 * np.exp(-(arc / 0.0065) ** 2) * top
    # its lips: a low swelling round the crescent
    d = d - 0.004 * np.exp(-(((rr - 0.045) / 0.03) ** 2)) * top * sstep(1.6, 1.0, np.abs(ang))
    return d


def eye_parts(P):
    Q = mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0, -0.006), V(EYE_R + 0.016, EYE_R + 0.012, EYE_R + 0.004))
    ap = np.sqrt((s / LID_W) ** 2 + ((u - LID_OFF) / LID_H) ** 2) - 1
    ap = ap + 0.25 * sstep(0.5, 1.0, np.abs(s) / LID_W) * (np.abs(u - LID_OFF) / LID_H)
    carve = smax(ap * LID_H, -g - 0.003, 0.003)
    ball = length(D) - EYE_R * 0.92
    return carve, lids, ball


# ---------- the flippers ----------
FL_ROOT = V(0.33, 0.3, 1.0)
FL_AX = nrm([0.8, -0.42, -0.43])
FL_UP = (0.25, 1.0, 0.18)
FL_LEN = 0.4
# along the flipper (u / FL_LEN): half chord, chord center (+ toward the leading edge), half thickness, curl (up)
FL_U = [0.0, 0.15, 0.3, 0.45, 0.6, 0.72, 0.82, 0.9, 0.96, 1.0]
FL_HC = [0.1, 0.106, 0.112, 0.112, 0.106, 0.096, 0.082, 0.064, 0.042, 0.016]
FL_CC = [-0.014, -0.008, 0.002, 0.01, 0.016, 0.019, 0.02, 0.019, 0.015, 0.01]
FL_HT = [0.046, 0.041, 0.034, 0.027, 0.022, 0.019, 0.016, 0.014, 0.011, 0.008]
FL_CURL = [0.0, 0.0, 0.0, 0.003, 0.01, 0.02, 0.034, 0.05, 0.066, 0.078]
_flloft = [(u, 1.0, 0.0, -1.0, 1.0, 2.0, 2.0) for u in (0.0, 1.0)]


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
    # the section: an airfoil-ish ellipse, fuller toward the leading edge
    cs = c - cc
    ht = ht * (1.0 + 0.22 * np.clip(cs / np.maximum(hc, 1e-4), -1, 1))
    q = np.sqrt((cs / hc) ** 2 + ((t - cu) / ht) ** 2)
    d = (q - 1) * np.minimum(hc, ht)
    # the rounded tip and the root end (the root is inside the body)
    d = smax(d, smax(-u - 0.05, u - FL_LEN, 0.0), 0.03)
    return d


# ---------- the flukes ----------
FK_Y = 0.56
FK_X = [0.0, 0.08, 0.16, 0.24, 0.32, 0.4, 0.47, 0.52, 0.55, 0.57]
FK_ZL = [-2.05, -2.07, -2.085, -2.088, -2.078, -2.055, -2.025, -2.0, -1.988, -1.99]     # leading edge
FK_ZT = [-2.33, -2.47, -2.53, -2.555, -2.55, -2.51, -2.43, -2.32, -2.19, -2.06]          # trailing edge
FK_T = [0.036, 0.032, 0.026, 0.021, 0.017, 0.014, 0.011, 0.009, 0.008, 0.007]           # half thickness (max)
FK_TIP = 0.57


def _fk(xx):
    from scipy.interpolate import PchipInterpolator
    if not hasattr(_fk, 'f'):
        _fk.f = [PchipInterpolator(np.array(FK_X, np.float64), np.array(a, np.float64)) for a in (FK_ZL, FK_ZT, FK_T)]
    x = np.clip(xx, 0, FK_TIP)
    return [f(x).astype(F) for f in _fk.f]


def fluke_st(P):
    """chord fraction s (0 at the leading edge, 1 at the trailing edge) and the plate's mid height"""
    Q = mirror(P)
    xx, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
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
    # thickness along the chord: round at the leading edge, thickest at a third, thin at the trailing edge
    prof = 1.2 * (np.sqrt(s) * 1.05 - 0.6 * s - 0.45 * s * s)
    th = np.maximum(T * prof, 0.0035)
    # the tips lift a little
    yc = FK_Y + 0.02 * sstep(0.3, 0.57, xx) ** 2
    dp = np.abs(y - yc) - th
    out = smax(np.abs(z - zm) - hc, xx - FK_TIP, 0.03)
    return smax(dp, out, 0.006)


HEAD_BOX = (V(-0.4, 0.15, 1.3), V(0.4, 1.0, 2.04))
FLIP_BOX = (V(-0.72, 0.0, 0.6), V(0.72, 0.5, 1.16))
FLUKE_BOX = (V(-0.62, 0.42, -2.62), V(0.62, 0.7, -1.9))


def parts(P):
    ca, li, ba = eye_parts(P)
    return {'body': body(P), 'flipper': local(P, *FLIP_BOX, flipper), 'fluke': local(P, *FLUKE_BOX, fluke), 'lids': li, 'ball': ba}


def shape(P):
    d = body(P)
    m = np.all((P >= HEAD_BOX[0]) & (P <= HEAD_BOX[1]), axis=1)
    if m.any():
        d[m] = head(P[m], d[m])
    d = smin(d, local(P, *FLIP_BOX, flipper), 0.05)
    d = smin(d, local(P, *FLUKE_BOX, fluke), 0.035)
    return d


def grid(h):
    """finer across the thin flukes (y), the flippers, the head's features and the ridge"""
    lo, hi = BOUNDS
    xs = axis_steps(0.0, hi[0], [(0.0, 0.07, h * 0.5), (0.18, 0.32, h * 0.6), (0.36, 0.7, h * 0.6)], h)
    ys = axis_steps(lo[1], hi[1], [(0.12, 0.42, h * 0.6), (0.5, 0.64, h * 0.3), (0.84, 1.04, h * 0.6)], h)
    zs = axis_steps(lo[2], hi[2], [(-2.62, -1.9, h * 0.6), (0.68, 1.1, h * 0.6), (1.4, 2.04, h * 0.6)], h)
    return xs, ys, zs


# fine bake-only meshes over small features (box lo, box hi on the +x side, voxel size)
PATCHES = [
    (EYE_C + V(-0.035, -0.035, -0.035), EYE_C + V(0.03, 0.035, 0.035), 0.0016),       # the eye and its lids
    (V(0.0, 0.26, 1.8), V(0.24, 0.37, 2.02), 0.0024),                                # the mouth line
    (V(0.0, 0.85, 1.43), V(0.07, 0.95, 1.58), 0.002),                                # the blowhole
]

PREVIEW = {
    'side': ((9.0, 1.0, -0.2), (0, 0.5, -0.2), 34),
    'front3q': ((4.2, 2.2, 5.0), (0, 0.5, 0.2), 34),
    'rear3q': ((-4.2, 2.6, -5.2), (0, 0.5, -0.4), 34),
    'top': ((0.01, 9.5, -0.2), (0, 0.5, -0.2), 34),
    'under': ((2.5, -6.0, 0.2), (0, 0.5, -0.2), 34),
    'head3q': ((1.2, 0.9, 3.0), (0, 0.5, 1.7), 26),
    'headside': ((2.4, 0.55, 1.75), (0, 0.5, 1.7), 26),
    'face': ((0.0, 0.6, 3.4), (0, 0.5, 1.8), 24),
    'flukes': ((1.2, 2.2, -3.6), (0, 0.56, -2.25), 30),
    'flipper': ((1.9, 0.6, 1.9), (0.45, 0.3, 0.9), 26),
}


# ---------- the game mesh ----------
def keep(P):
    Pm = mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    e = sstep(0.07, 0.035, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.6
    ym = mouth_y(z)
    mo = sstep(0.02, 0.006, np.abs(y - ym)) * sstep(CORNER_Z - 0.02, CORNER_Z + 0.01, z) * 0.45
    bl = sstep(0.09, 0.05, np.linalg.norm((Pm - BLOW) * V(1, 1, 1), axis=1)) * 0.4
    rid = sstep(0.04, 0.015, x) * sstep(0.2, -0.2, z) * sstep(-1.9, -1.5, z) * sstep(_iz(z, 1) - 0.1, _iz(z, 1) - 0.03, y) * 0.36
    base = np.full(len(P), 0.32, F)
    return np.maximum.reduce([base, e, mo, bl, rid]).astype(F)


# where the game mesh has to bend: rings across the body around the joints of the spine (the chest is rigid)
def lowpoly_fix(bm, hi):
    import meshfix as MF
    tr = MF.tree(hi)

    def on_body(c, p0, r):
        w = float(_iz(np.array([c.z], F), 4)[0])
        return r < 0.62 and abs(c.x) < w + 0.03 and not (c.z < -2.0 and abs(c.x) > 0.06)
    MF.rings(bm, tr, (0.0, 0.5, 0.0), (0.0, 0.56, -2.2), 0.2, on_body)
    MF.rings(bm, tr, (0.0, 0.5, 1.0), (0.0, 0.5, 1.6), 0.16, lambda c, p0, r: r < 0.62 and not (abs(c.x) > 0.38 and c.y < 0.36 and c.z < 1.12))
    MF.finish(bm, 1e-6)


UV_AVERAGE = True
UV_PACK = dict(margin_method='FRACTION', margin=0.008)


def _onflipper(Pm):
    c, t, u = flipper_local(Pm)
    return (u > 0.07) & (np.abs(t) < 0.12) & (Pm[:, 0] > 0.36)


def uv_regions(P):
    """head, the front and back of the trunk, the tail stock, the flipper, the flukes"""
    Pm = mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 1)
    lab[z > 1.3] = 0
    lab[z < -0.3] = 2
    lab[z < -1.35] = 3
    lab[_onflipper(Pm)] = 4
    fk = (z < -1.95) & (x > 0.075)
    lab[fk & (y >= FK_Y)] = 5
    lab[fk & (y < FK_Y)] = 6
    return lab


def uv_weight(P):
    Pm = mirror(P)
    z = Pm[:, 2]
    return (1.0 + 0.45 * sstep(1.3, 1.45, z)).astype(F)


WEIGHT_SMOOTH = (0, 0.5)
SPINE = ['fluke', 'tail2', 'tail1', 'hips', 'chest', 'neck', 'head']
# pivots (z) between them, and how far each joint blends (m)
SPINE_Z = [-2.1, -1.55, -0.95, -0.35, 1.12, 1.45]
SPINE_B = [0.12, 0.2, 0.22, 0.24, 0.14, 0.12]


def bone_tips(P):
    t = {'chest': P['neck'], 'hips': P['tail1'], 'tail1': P['tail2'], 'tail2': P['fluke'], 'fluke': V(0, 0.56, -2.5),
         'neck': P['head'], 'head': V(0, 0.5, 2.0), 'tusk': V(0.08, 0.38, 2.5)}
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
    """every weight from the sculpt's own parts: the body and head one smooth chain along z, the flukes on the fluke
    bone (from a little out of the middle), the flippers on their bones from just outside the body"""
    bi = {n: i for i, n in enumerate(names)}
    P = wpos.astype(F)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    Wn = np.zeros_like(W)
    for nm, w in spine_w(z):
        Wn[:, bi[nm]] = w
    # the flukes: the plate (not the tail stock) goes with the fluke bone, the root shares it with the tail stock
    c = parts(P)
    isf = (c['fluke'] < c['body'] + 0.004) & (z < -1.9)
    kf = isf * sstep(0.035, 0.13, np.abs(x))
    one = np.zeros_like(W); one[:, bi['fluke']] = 1
    Wn = Wn * (1 - kf[:, None]) + one * kf[:, None]
    # the flippers: from just outside the body out to the tip
    ch, th, u = flipper_local(P)
    isp = (c['flipper'] < c['body'] + 0.006) & (z > 0.6) & (z < 1.2)
    kp = isp * sstep(0.07, 0.15, u)
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


def _regions(P, N, c):
    Pm = mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    r = {'Pm': Pm, 'Nm': Nm}
    r['eyeD'] = np.linalg.norm(Pm - EYE_C, axis=1)
    r['ball'] = sstep(0.003, 0.0008, c['ball']) * sstep(EYE_R + 0.004, EYE_R + 0.001, r['eyeD'])
    r['lid'] = sstep(EYE_R + 0.022, EYE_R + 0.008, r['eyeD']) * (1 - r['ball'])
    r['flip'] = sstep(0.006, 0.0, c['flipper'] - c['body'] + 0.004) * sstep(0.36, 0.4, x)
    r['fluke'] = sstep(0.006, 0.0, c['fluke'] - c['body'] + 0.004) * sstep(0.04, 0.09, x)
    r['fin'] = np.maximum(r['flip'], r['fluke'])
    r['head'] = sstep(1.32, 1.5, z)
    ym = mouth_y(z)
    r['lipD'] = y - ym
    r['lip'] = sstep(0.016, 0.004, np.abs(y - ym)) * sstep(CORNER_Z - 0.01, CORNER_Z + 0.02, z)
    yw = _iz(z, 2)
    r['belly'] = sstep(-0.15, -0.7, Nm[:, 1]) * sstep(yw - 0.02, yw - 0.12, y) * (1 - r['fin'])
    r['top'] = sstep(0.1, 0.8, Nm[:, 1]) * (1 - r['fin'])
    # the edges of the flippers and flukes (for the dark rims): chord fractions
    s, xx = fluke_st(P)
    r['fkEdge'] = r['fluke'] * np.maximum(sstep(0.82, 0.98, s), np.maximum(sstep(0.12, 0.0, s), sstep(0.5, 0.565, xx)))
    ch, th, u = flipper_local(P)
    k = np.clip(u / FL_LEN, 0, 1)
    hc = np.interp(k, FL_U, FL_HC).astype(F); cc = np.interp(k, FL_U, FL_CC).astype(F)
    r['flEdge'] = r['flip'] * np.maximum(sstep(0.62, 0.95, np.abs(ch - cc) / hc), sstep(0.8, 0.98, k))
    return r


_cache = {}


def _scratches(Pm, size, seed, frac):
    """old scratches (tusk fights): short straight lines, mostly along the body, one in some of the cells of a coarse
    grid; returns the distance to the nearest line (m) and its fade along the line"""
    f1, f2, cp = _cells(Pm, size, seed)
    r1, r2, r3, r4 = (_cell_rnd(cp, seed + k) for k in range(1, 5))
    dz = np.stack([(r1 - 0.5) * 0.9, (r2 - 0.5) * 1.2, np.ones_like(r1)], 1)
    dz /= np.linalg.norm(dz, axis=1, keepdims=True)
    q = Pm - cp
    t = (q * dz).sum(1)
    half = size * (0.25 + 0.3 * r3)
    dist = np.linalg.norm(q - dz * t[:, None], axis=1)
    fade = sstep(half, half * 0.6, np.abs(t)) * (r4 < frac)
    return dist, fade


def detail(P, N, c):
    """a few soft creases behind the head and round the flippers, old scratches, and a faint skin grain"""
    R = _regions(P, N, c)
    Pm = R['Pm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    H = np.zeros(len(P), F)
    # soft creases across the neck low on the sides (they show when the head turns), uneven and broken
    wob = 0.04 * (fbm(Pm * 3, 2, 21) - 0.5)
    brk = sstep(0.4, 0.65, fbm(Pm * V(4, 4, 1), 2, 23))
    neck = np.sin((z + wob) * 2 * np.pi / 0.06) * sstep(1.18, 1.28, z) * sstep(1.48, 1.38, z) * sstep(0.2, 0.3, x) * sstep(0.75, 0.55, y)
    H += 0.0005 * neck * brk
    # round the root of the flipper: a few folds
    ch, th, u = flipper_local(P)
    fr = np.sin(u * 2 * np.pi / 0.035) * sstep(0.03, 0.07, u) * sstep(0.13, 0.09, u) * (np.abs(th) < 0.1)
    H += 0.0006 * fr
    # old scratches: thin pale lines here and there, a few long ones and more short ones
    for k, (size, w, amp, frac) in enumerate(((0.5, 0.004, 0.0006, 0.45), (0.22, 0.0028, 0.0004, 0.35))):
        dist, fade = _scratches(Pm * V(1.0, 1.0, 1.0), size, 31 + 10 * k, frac)
        H -= amp * sstep(w, 0.0, dist) * fade * (1 - R['fin'])
    # skin grain
    H += 0.0002 * (fbm(Pm * 60, 2, 25) - 0.5)
    H *= (1 - R['ball'])
    return H.astype(F)


# ---------- paint ----------
K = {
    'cream': hexc(0xDAD8D0), 'pale': hexc(0xBDBEBB), 'gray': hexc(0x6E7276), 'dark': hexc(0x2E3338), 'black': hexc(0x25292D),
    'slate': hexc(0x4D5359), 'belly': hexc(0xE2E0D8), 'lid': hexc(0x34383D), 'ball': hexc(0x0E0C0B), 'lip': hexc(0x3A3E43),
}


def _density(R):
    """how thick the mottling is: dense on the back and the head, few spots on the belly"""
    Nm, Pm = R['Nm'], R['Pm']
    y, z = Pm[:, 1], Pm[:, 2]
    up = Nm[:, 1]
    d = 0.06 + 0.94 * sstep(-0.6, 0.7, up)
    d = d + 0.4 * R['head'] * sstep(-0.75, 0.0, up) * sstep(0.22, 0.32, y) + 0.25 * sstep(1.75, 1.9, z) * sstep(0.3, 0.38, y)
    d = d + 0.12 * sstep(-1.2, -1.9, z) * sstep(-0.5, 0.3, up)          # the tail stock darker
    d = d + 0.5 * R['fin'] * sstep(0.3, -0.3, up)                        # the undersides of the flukes and flippers too
    return np.clip(d, 0, 1.1)


# quantiles of fbm(., 3 octaves) (measured), to cut the marbling noise at a given coverage
_FQ = ([0.0, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99, 1.0], [0.1, 0.232, 0.302, 0.342, 0.416, 0.5, 0.585, 0.659, 0.7, 0.768, 0.9])


def _mottle(Pr, R):
    """dark speckles at the real point Pr (so the two sides differ): (amount 0..1, darkness 0..1).
    round 16b: fine ragged speckles, not big blotches (they read as a Holstein's): at three sizes (spots of about 1 to
    6 cm), densest and biggest on the back and the head, where they run together into a dark mottling with the pale
    ground showing through in flecks, fewer and smaller down the flanks, only a scatter on the pale belly"""
    D = _density(R)
    Q = Pr * V(1.0, 1.0, 0.8)                      # the speckles a little longer along the body
    warp = np.stack([fbm(Q * 3.0 + 4.1 * i, 2, 140 + i) for i in range(3)], 1) - 0.5
    pres = np.interp(D, [0.0, 0.15, 0.4, 0.7, 1.0, 1.1], [0.02, 0.06, 0.38, 0.72, 0.93, 0.97]).astype(F)
    grow = 0.75 + 0.5 * sstep(0.55, 1.0, D)
    amt = np.zeros(len(Pr), F)
    for k, (size, r0, r1) in enumerate(((0.075, 0.2, 0.4), (0.048, 0.18, 0.38), (0.03, 0.16, 0.34))):
        sd = 150 + 10 * k
        f1, f2, cp = _cells(Q + warp * size * 0.7, size, sd)
        rnd, rnd2 = _cell_rnd(cp, sd + 1), _cell_rnd(cp, sd + 2)
        rad = size * (r0 + (r1 - r0) * rnd) * grow
        edge = f1 + size * 0.24 * (fbm(Q * (3.0 / size), 2, sd + 3) - 0.5)
        spot = sstep(rad * 1.12, rad * 0.86, edge) * (rnd2 < pres * (1.0 - 0.15 * k))
        amt = np.maximum(amt, spot * (0.8 + 0.2 * rnd))
    # on the back the speckles run together: a dark wash under them, broken by pale flecks
    wash = sstep(0.62, 0.95, D) * sstep(0.44, 0.6, fbm(Q * 16.0 + warp * 2.0, 3, 175))
    amt = np.maximum(amt, 0.75 * wash)
    tone = 0.25 + 0.45 * fbm(Q * 4.0, 2, 90) + 0.3 * sstep(0.5, 1.0, D)
    return np.clip(amt, 0, 1), np.clip(tone, 0, 1)


def paint(P, N, c):
    """the grown-up: mottled (P is the real point: SIDES paints the -x side with P mirrored)"""
    R = _regions(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    up = Nm[:, 1]
    n = len(P)
    # the ground: cream on the belly, gray-white on the sides, a grayer wash up the back
    col = mix(np.tile(K['pale'], (n, 1)), K['cream'], sstep(0.1, -0.55, up) * 0.85)
    col = mix(col, K['gray'], sstep(-0.2, 0.75, up) * 0.85)
    col = mix(col, K['belly'], R['belly'])
    col = col * (0.95 + 0.1 * fbm(P * 1.7, 3, 7))[:, None]
    amt, tone = _mottle(P, R)
    dcol = mix(np.tile(K['slate'], (n, 1)), K['black'], tone)
    col = mix(col, dcol, amt * (1 - 0.9 * R['belly']))
    # old scratches: faint pale lines
    for k, (size, w, frac) in enumerate(((0.5, 0.005, 0.45), (0.22, 0.0035, 0.35))):
        dist, fade = _scratches(Pm, size, 31 + 10 * k, frac)
        col = mix(col, K['pale'], sstep(w, 0.0, dist) * fade * (1 - R['fin']) * amt * 0.55)
    # the flukes and flippers: darker, with dark edges
    fin = R['fin']
    col = mix(col, K['dark'], fin * 0.35 * sstep(-0.6, 0.4, up))
    col = mix(col, K['black'], np.maximum(R['fkEdge'], R['flEdge']) * 0.85)
    # the mouth line and the lower lip darker, the lids dark
    col = mix(col, K['lip'], R['lip'] * 0.15)   # (round 16b: fainter, the mouth is a small line, not a painted grin)
    col = mix(col, K['lid'], R['lid'] * 0.55)
    col = mix(col, K['ball'], R['ball'])
    rough = 0.34 + 0.06 * fbm(Pm * 5, 2, 9) - 0.2 * R['ball']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.12, 0.9).astype(F)


# ---------- the calf's own shape (round 16b) ----------
def baby_offset(P, N, c):
    """a narwhal calf's head is small and round: the top of the head in front of the blowhole slopes down to a lower,
    rounder melon (with the grown-up's tall dome scaled down it read as a sperm whale calf's square head)"""
    Q = mirror(P)
    y, z = Q[:, 1], Q[:, 2]
    out = np.zeros((len(P), 3), F)
    out[:, 1] = -0.1 * sstep(1.42, 1.92, z) * sstep(0.45, 0.82, y)
    out[:, 2] = -0.035 * sstep(1.78, 1.98, z) * sstep(0.32, 0.62, y)
    return out.astype(F)


# ---------- the calf's colors (its own color map) ----------
KB = {'slate': hexc(0x56616C), 'slateDk': hexc(0x47515B), 'belly': hexc(0x7C8792), 'lid': hexc(0x3A424A)}
BABY_SIZE = 256
BABY_MAP = (0, 70)


def paint_baby(P, N, c):
    R = _regions(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    up = Nm[:, 1]
    n = len(P)
    col = mix(np.tile(KB['slate'], (n, 1)), KB['slateDk'], sstep(0.1, 0.8, up) * 0.6)
    col = mix(col, KB['belly'], sstep(-0.2, -0.8, up) * 0.75)
    col = col * (0.97 + 0.06 * fbm(P * 2.0, 3, 17))[:, None]
    col = mix(col, KB['lid'], R['lid'] * 0.5)
    col = mix(col, K['ball'], R['ball'])
    return np.clip(col, 0, 1).astype(F), np.full(n, 0.4, F)


def finish(C, ao, valid):
    lin = np.where(C <= 0.04045, C / 12.92, ((C + 0.055) / 1.055) ** 2.4)
    lin = lin * (0.45 + 0.55 * ao[..., None])
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(np.maximum(lin, 0), 1 / 2.4) - 0.055)


# ---------- what the game needs besides the mesh ----------
MAP_QUALITY = (66, 56)
PAD_SMOOTH = 4


def stats(P, N, c, col):
    R = _regions(P, N, c)
    m = R['lid'] * sstep(EYE_R + 0.016, EYE_R + 0.008, R['eyeD'])
    rgb = lambda v: int(round(v[0] * 255)) << 16 | int(round(v[1] * 255)) << 8 | int(round(v[2] * 255))
    lid = (col * m[:, None]).sum(0) / max(m.sum(), 1e-6)
    colb, _ = paint_baby(P, N, c)
    lidb = (colb * m[:, None]).sum(0) / max(m.sum(), 1e-6)
    return {'lidCol': rgb(np.clip(lid, 0, 1)), 'babyLidCol': rgb(np.clip(lidb, 0, 1))}


def meta(st):
    r = EYE_R
    up, dn = (LID_OFF + LID_H) / r, (LID_OFF - LID_H) / r
    # no collar: a narwhal never wears one (the game draws none without a collar place)
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.25],
                'iris': 0x241A14, 'irisR': 0.97, 'pupil': 'h', 'pupilR': 0.42, 'rim': 0x0A0806, 'lidCol': st['lidCol'], 'babyLidCol': st['babyLidCol']},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'sides': True,
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.04, 0.05, 0.06], 'flat': 0x8C8E8E,
    }


# ---------- both sides of the coat (SIDES), as the cow ----------
def extra_maps(X):
    """the color map with the -x side painted too (+x side in the left half, -x side in the right half); the calf's
    plain map just doubled, at BABY_SIZE"""
    import os
    from PIL import Image
    from scipy import ndimage
    Ph, Nh, comps, valid, R, ao, v2, pad, down2 = X['Ph'], X['Nh'], X['comps'], X['valid'], X['R'], X['ao'], X['v2'], X['pad'], X['down2']
    Mx = np.array([-1, 1, 1], F)
    colm, _ = paint(Ph * Mx, Nh * Mx, comps)
    a = np.zeros((R, R, 3), F); a[valid] = colm
    C = finish(down2(pad(a, valid, 24)), ao, v2)
    near = ndimage.binary_dilation(v2, iterations=PAD_SMOOTH)
    Bl = np.stack([ndimage.uniform_filter(C[..., k], 33, mode='nearest') for k in range(3)], 2)
    C = np.where(near[..., None], C, Bl)
    im = Image.fromarray(np.clip(C[::-1] * 255 + 0.5, 0, 255).astype(np.uint8))
    p = os.path.join(X['work'], f'{ID}-color.png')
    left = Image.open(p).convert('RGB')
    both = Image.new('RGB', (left.size[0] * 2, left.size[1]))
    both.paste(left, (0, 0)); both.paste(im, (left.size[0], 0))
    both.save(p)
    pb = os.path.join(X['work'], f'{ID}-color-baby.png')
    b = Image.open(pb).convert('RGB').resize((BABY_SIZE, BABY_SIZE), Image.LANCZOS)
    bb = Image.new('RGB', (BABY_SIZE * 2, BABY_SIZE))
    bb.paste(b, (0, 0)); bb.paste(b, (BABY_SIZE, 0))
    bb.save(pb)
