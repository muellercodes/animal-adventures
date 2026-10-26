# Pink farm pig (Large White / Yorkshire), sculpted as a signed distance field around the game's pig skeleton.
# Units are meters in game rig space (x left, y up, z forward, ground at y = 0); bone pivots come from the game
# (tools/blender/work/pig-rig.json) and the body is built to fit them. Shape here, paint and fine detail further down.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, chain, loft, frame, fbm, vnoise, worley, length

ID = 'pig'
BOUNDS = (V(-0.25, 0.0, -0.66), V(0.25, 0.80, 0.84))
# small features meshed again on a finer grid for baking only (box lo, box hi on the +x side, voxel size)
PATCHES = [
    (V(0.045, 0.505, 0.525), V(0.12, 0.59, 0.605), 0.0006),    # eye and lids
    (V(0.0, 0.37, 0.70), V(0.08, 0.50, 0.80), 0.0008),       # snout disc and mouth
    (V(0.075, -0.001, 0.215), V(0.165, 0.09, 0.32), 0.0008),  # front hoof
    (V(0.075, -0.001, -0.37), V(0.165, 0.09, -0.26), 0.0008),  # hind hoof
    (V(0.03, 0.57, 0.42), V(0.22, 0.79, 0.65), 0.001),         # ear
]

# ---------- landmarks ----------
XL = 0.12                       # leg columns (bone x)
FOOT_F = V(XL, 0.0, 0.266)      # front foot (under the hoof center)
FOOT_H = V(XL, 0.0, -0.314)     # hind foot
EYE_C = V(0.0815, 0.548, 0.565)  # left eyeball center
EYE_R = 0.0125
EYE_DIR = nrm([0.8, 0.16, 0.58])
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)   # frame: x side, y up, z gaze
# lid opening (half width, half height, center offset up) in meters
LID_W, LID_H, LID_OFF = 0.0106, 0.0068, -0.0012
SNOUT_C = V(0.0, 0.437, 0.770)  # snout disc center (front face a little ahead of it)
EAR_B, EAR_L = V(0.068, 0.604, 0.47), 0.175     # ear base and length; it points along EAR_A, its inside faces EAR_N
EAR_A = nrm([0.34, 0.78, 0.52])
EAR_N = nrm([0.42, -0.32, 0.85])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
MOUTH = V(0.0, 0.384, 0.722)

# trunk: z, top, yw (height of widest), bottom, half width, exponent above, below
TRUNK = [
    (-0.575, 0.60, 0.49, 0.40, 0.04, 2.1, 2.1),
    (-0.55, 0.636, 0.48, 0.34, 0.11, 2.2, 2.1),
    (-0.50, 0.660, 0.47, 0.305, 0.158, 2.3, 2.2),
    (-0.42, 0.682, 0.468, 0.298, 0.192, 2.35, 2.25),
    (-0.28, 0.699, 0.465, 0.28, 0.203, 2.4, 2.3),
    (-0.12, 0.709, 0.462, 0.254, 0.202, 2.4, 2.3),
    (0.03, 0.703, 0.465, 0.25, 0.203, 2.4, 2.3),
    (0.16, 0.688, 0.47, 0.266, 0.207, 2.35, 2.25),
    (0.26, 0.668, 0.47, 0.292, 0.194, 2.3, 2.2),
    (0.34, 0.654, 0.47, 0.305, 0.17, 2.25, 2.2),
    (0.40, 0.632, 0.47, 0.322, 0.14, 2.2, 2.2),
    (0.45, 0.59, 0.47, 0.36, 0.09, 2.2, 2.2),
    (0.48, 0.55, 0.47, 0.40, 0.05, 2.2, 2.2),
]
# head: from inside the neck to the snout disc
HEAD = [
    (0.26, 0.56, 0.465, 0.38, 0.06, 2.2, 2.2),
    (0.31, 0.605, 0.465, 0.335, 0.115, 2.2, 2.2),
    (0.37, 0.632, 0.465, 0.305, 0.150, 2.2, 2.2),
    (0.45, 0.636, 0.45, 0.302, 0.152, 2.2, 2.3),
    (0.51, 0.618, 0.458, 0.312, 0.132, 2.2, 2.3),
    (0.57, 0.586, 0.468, 0.330, 0.104, 2.2, 2.3),
    (0.63, 0.547, 0.456, 0.350, 0.078, 2.2, 2.4),
    (0.68, 0.516, 0.444, 0.366, 0.064, 2.2, 2.4),
    (0.73, 0.497, 0.440, 0.380, 0.057, 2.2, 2.4),
    (0.765, 0.488, 0.438, 0.388, 0.054, 2.2, 2.4),
]


def _box(P, lo, hi):
    return np.all((P >= lo) & (P <= hi), axis=1)


def _local(P, lo, hi, fn, far=1.0):
    """evaluate fn only inside the box (keeps big grids fast); far elsewhere"""
    m = _box(P, np.asarray(lo, F), np.asarray(hi, F))
    out = np.full(len(P), far, F)
    if m.any():
        out[m] = fn(P[m])
    return out


def _local_n(P, lo, hi, fn, n, far=1.0):
    """like _local for a function returning n arrays"""
    m = _box(P, np.asarray(lo, F), np.asarray(hi, F))
    out = [np.full(len(P), far, F) for _ in range(n)]
    if m.any():
        for o, r in zip(out, fn(P[m])):
            o[m] = r
    return out


def _mirror(P):
    Q = P.copy(); Q[:, 0] = np.abs(Q[:, 0]); return Q


def groove(s, width, depth):
    return depth * np.exp(-(s / width) ** 2)


# ---------- parts ----------
def trunk(P):
    Q = _mirror(P)
    d = loft(Q, TRUNK)
    # hams: two big rounded masses at the back, a groove between them under the tail
    d = smin(d, superellipsoid(Q, V(0.092, 0.455, -0.425), (0.122, 0.195, 0.178), 2.05, rb=0.205), 0.07)
    # shoulders over the front legs
    d = smin(d, superellipsoid(Q, V(0.09, 0.50, 0.17), (0.122, 0.17, 0.13), 2.2, rb=0.2), 0.07)
    # full belly, a little lower in the middle
    d = smin(d, ellipsoid(Q, V(0.0, 0.33, -0.06), V(0.168, 0.085, 0.24)), 0.06)
    # slight hollow behind the shoulder blade and in front of the ham (flank)
    d = smax(d, -ellipsoid(Q, V(0.235, 0.36, -0.25), V(0.04, 0.09, 0.045)), 0.03)
    return d


def head(P):
    Q = _mirror(P)
    d = loft(Q, HEAD)
    # heavy jowls under and behind the cheeks
    d = smin(d, ellipsoid(Q, V(0.072, 0.358, 0.465), V(0.082, 0.07, 0.105)), 0.04)
    # cheek (chewing muscle) and lower jaw
    d = smin(d, ellipsoid(Q, V(0.078, 0.425, 0.535), V(0.048, 0.062, 0.07)), 0.03)
    d = smin(d, ellipsoid(Q, V(0.035, 0.365, 0.655), V(0.032, 0.022, 0.075)), 0.025)
    # nasal bridge: slightly dished face, a little ridge down the top of the snout
    d = smin(d, ellipsoid(Q, V(0.0, 0.5, 0.68), V(0.034, 0.014, 0.08)), 0.035)
    # mouth: a flat slit under the overhanging upper lip, fading out at the corner (y squashed so it is thin)
    M = Q * V(1, 2.6, 1) - V(0, 0.384 * 1.6, 0)
    m = round_cone(M, V(0.0, 0.386, 0.752), V(0.03, 0.384, 0.744), 0.0042, 0.0042)
    m = smin(m, round_cone(M, V(0.03, 0.384, 0.744), V(0.058, 0.377, 0.66), 0.0042, 0.0032), 0.002)
    m = smin(m, round_cone(M, V(0.058, 0.377, 0.66), V(0.066, 0.374, 0.63), 0.0032, 0.0008), 0.002)
    d = smax(d, -(m + 0.0022) / 1.6, 0.004)
    return d


def snout(P):
    """snout disc: a short rounded oval cylinder facing forward and a little down, with two nostrils"""
    Q = _mirror(P)
    ax = nrm([0, -0.13, 1])
    L = frame(Q, SNOUT_C, ax, (0, 1, 0))
    rx, ry, e = 0.053, 0.046, 2.3
    q = (np.abs(L[:, 0] / rx) ** e + np.abs(L[:, 1] / ry) ** e) ** (1 / e)
    ds = (q - 1) * ry
    # front face slightly domed, the rim a little raised
    rr = np.clip(q, 0, 1)
    front = 0.012 + 0.0025 * (1 - rr ** 2) - 0.0015 * sstep(0.75, 0.97, rr)
    dz = np.maximum(L[:, 2] - front, -0.03 - L[:, 2])
    dd = np.stack([np.maximum(ds, 0), np.maximum(dz, 0)], 1)
    d = np.sqrt((dd ** 2).sum(1)) + np.minimum(np.maximum(ds, dz), 0) - 0.006
    # nostrils: oval pits, tilted in at the top
    n = ellipsoid(Q, SNOUT_C + ax * 0.016 + V(0.0175, 0.0, 0.0), V(0.0075, 0.0125, 0.015))
    d = smax(d, -n, 0.0035)
    return d


def ear(P):
    """thin, slightly cupped ear standing up and forward (left side; mirrored)"""
    Q = _mirror(P)
    B, A, Nn = EAR_B, EAR_A, EAR_N
    Nn = nrm(Nn - A * np.dot(Nn, A))
    C = np.cross(Nn, A)
    D = Q - B
    a, c, n = D @ A, D @ C, D @ Nn
    Ln = EAR_L
    u = np.clip(a / Ln, 0, 1)
    hw = 0.076 * (1 - u ** 1.8) ** 0.62 * (0.82 + 0.18 * sstep(0.0, 0.25, u)) + 0.0008
    # the front edge of the ear sits a little higher (asymmetric leaf)
    cc = c - 0.006 * np.sin(np.pi * u)
    # cupped like a funnel at the base (so it never looks like a thin blade from behind), flatter toward the tip,
    # and the tip bends forward
    mid = hw * (cc / hw) ** 2 * (0.4 * (1 - u) ** 1.2 + 0.2) + 0.014 * u ** 2
    th = 0.5 * (0.017 * (1 - u) + 0.0062 * u)
    d_out = np.abs(cc) - hw
    d_end = np.maximum(-a, a - Ln)
    d_th = np.abs(n - mid) - th
    d = smax(smax(d_out, d_th, 0.003), d_end, 0.004)
    return d


def eye_parts(P):
    """lid mound around the eye (add), the almond opening in front of the eye (carve), the eyeball (add)"""
    Q = _mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0006, 0.0), V(EYE_R + 0.0085, EYE_R + 0.0058, EYE_R + 0.0026))
    ua = u - LID_OFF
    ap = np.sqrt((s / LID_W) ** 2 + (ua / LID_H) ** 2) - 1
    # almond: the opening narrows to points at the corners
    ap = ap + 0.22 * sstep(0.45, 1.0, np.abs(s) / LID_W) * (np.abs(ua) / LID_H)
    carve = smax(ap * LID_H, -g, 0.001)
    ball = length(D) - EYE_R * 0.84
    return carve, lids, ball


def legs(P):
    Q = _mirror(P)
    x = XL
    fz = FOOT_F[2]
    front = chain(Q, [V(0.118, 0.34, 0.232), V(0.12, 0.25, 0.226), V(0.12, 0.19, 0.236), V(0.12, 0.135, 0.247), V(0.12, 0.118, 0.25), V(0.12, 0.076, 0.256), V(0.12, 0.046, fz - 0.004)],
                  [0.064, 0.056, 0.046, 0.037, 0.035, 0.03, 0.027], 0.01)
    front = smin(front, ellipsoid(Q, V(0.118, 0.257, 0.196), V(0.04, 0.045, 0.038)), 0.025)      # elbow
    front = smin(front, ellipsoid(Q, V(0.12, 0.133, 0.252), V(0.035, 0.022, 0.032)), 0.01)       # knee (carpus)
    hz = FOOT_H[2]
    hind = chain(Q, [V(0.11, 0.37, -0.31), V(0.115, 0.275, -0.292), V(0.12, 0.205, -0.322), V(0.12, 0.16, -0.338), V(0.12, 0.12, -0.334), V(0.12, 0.076, -0.322), V(0.12, 0.046, hz - 0.004)],
                 [0.092, 0.07, 0.049, 0.038, 0.031, 0.028, 0.026], 0.012)
    hind = smin(hind, ellipsoid(Q, V(0.12, 0.172, -0.368), V(0.022, 0.03, 0.022)), 0.014)       # point of hock
    hind = smin(hind, round_cone(Q, V(0.12, 0.175, -0.37), V(0.112, 0.3, -0.395), 0.015, 0.035), 0.02)  # hamstring
    return front, hind


def hooves(P):
    """two wedge-shaped digits per foot (cloven) with a flat sole, and two small dew claws behind"""
    Q = _mirror(P)
    out_h, out_d = None, None
    for f in (FOOT_F, FOOT_H):
        for side in (-1, 1):
            cx = f[0] + side * 0.0146
            lx = (Q[:, 0] - cx) * side          # + outward, - toward the cleft
            ly = Q[:, 1]
            lz = Q[:, 2] - f[2] + 0.004
            h = 0.042 - 1.25 * np.maximum(lz + 0.008, 0)
            d_top = (ly - h) * 0.62
            d_sole = 0.0004 - ly
            hw = 0.0128 * (0.6 + 0.4 * sat((0.03 - lz) / 0.04)) ** 0.6
            # outer side rounded, inner side flat against the cleft
            d_side = np.where(lx > 0, lx - hw, -lx - hw * 0.88)
            d_back = -(lz + 0.023)
            dg = smax(smax(d_top, d_sole, 0.009), smax(d_side, d_back, 0.008), 0.006)
            out_h = dg if out_h is None else np.minimum(out_h, dg)
            dc = round_cone(Q, V(f[0] + side * 0.023, 0.064, f[2] - 0.022), V(f[0] + side * 0.025, 0.036, f[2] - 0.035), 0.0078, 0.0032)
            out_d = dc if out_d is None else np.minimum(out_d, dc)
    return out_h, out_d


# ---------- skin folds and creases (meters, carved into the surface) ----------
def folds(P):
    Q = _mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    c = np.zeros(len(P), F)
    w = 0.008 * (vnoise(Q * V(10, 26, 10), 3) - 0.5) + 0.004 * (vnoise(Q * 60, 4) - 0.5)
    # neck: two soft folds low on the side of the neck between jowl and shoulder, fading out toward the top
    low = sstep(0.46, 0.34, y) * sstep(0.04, 0.1, x + 0.04 * sstep(0.38, 0.3, y))
    for z0, dep in ((0.352, 0.0018), (0.384, 0.0022)):
        c += groove(z - z0 - 0.08 * (0.45 - y) + w, 0.0048, dep) * low * (0.6 + 0.8 * vnoise(Q * 18, 9))
    # double chin under the jaw
    c += groove(z - 0.505 + 0.25 * (0.32 - y) + w * 0.5, 0.0055, 0.0018) * sstep(0.355, 0.31, y)
    # flank fold in front of the stifle and the fold behind the elbow
    c += groove(z + 0.232 + 0.4 * (y - 0.3) + w * 0.4, 0.007, 0.0024) * sstep(0.16, 0.2, x) * sstep(0.42, 0.33, y) * sstep(0.24, 0.27, y)
    c += groove(z - 0.18 - 0.35 * (y - 0.27) + w * 0.4, 0.006, 0.0022) * sstep(0.15, 0.19, x) * sstep(0.38, 0.3, y) * sstep(0.23, 0.26, y)
    # creases on the front of the knee and of the fetlock (not all around)
    for (zc, yc, front) in ((0.252, 0.133, 1), (-0.334, 0.122, 1), (FOOT_F[2], 0.066, 1), (FOOT_H[2], 0.066, 1)):
        near = sstep(0.05, 0.025, np.hypot(x - XL, z - zc)) * sstep(-0.005, 0.02, (z - zc) * front)
        c += (groove(y - yc - 0.005 + w * 0.3, 0.0018, 0.0010) + groove(y - yc + 0.004 + w * 0.3, 0.0018, 0.0008)) * near
    # soft lumpiness of fat under the skin
    c += 0.0008 * (fbm(Q * 22, 3, 5) - 0.5) * sstep(0.1, 0.2, y)
    return c


def parts(P):
    """named component distances (for paint masks)"""
    so, li, ba = eye_parts(P)
    fr, hi = legs(P)
    ho, de = hooves(P)
    return {'trunk': trunk(P), 'head': head(P), 'snout': snout(P), 'ear': ear(P), 'lids': li, 'ball': ba, 'fleg': fr, 'hleg': hi, 'hoof': ho, 'dew': de}


def shape(P):
    d = trunk(P)
    fr, hi = legs(P)
    d = smin(d, fr, 0.045)
    d = smin(d, hi, 0.05)
    h = _local(P, (-0.2, 0.25, 0.3), (0.2, 0.7, 0.84), head)
    h = smin(h, _local(P, (-0.09, 0.36, 0.7), (0.09, 0.52, 0.84), snout), 0.012)
    ca, li, ba = _local_n(P, (-0.13, 0.5, 0.52), (0.13, 0.6, 0.61), eye_parts, 3)
    h = smin(h, li, 0.012)
    h = smax(h, -ca, 0.004)
    h = smin(h, ba, 0.0012)
    d = smin(d, h, 0.06)
    d = smin(d, _local(P, (-0.22, 0.56, 0.42), (0.22, 0.8, 0.66), ear), 0.016)
    ho, de = _local_n(P, (-0.16, -0.01, -0.36), (0.16, 0.07, 0.31), hooves, 2)
    d = smin(d, ho, 0.007)
    d = smin(d, de, 0.006)
    d = d + _local(P, (-0.25, 0.0, -0.45), (0.25, 0.6, 0.6), folds, far=0.0)
    return d


# ---------- tail: an explicit tube (too thin for the voxel grid) ----------
def tail_curve(n=40):
    pts, rad = [], []
    base = V(0.0, 0.592, -0.556)
    for i in range(n + 1):
        u = i / n
        # out and down from the rump, then a loose curl to the right
        a = u * np.pi * 2.6
        r = 0.026 * (1 - 0.35 * u)
        p = base + V(0, 0.012, -0.018) * min(1, u * 6) + V(np.sin(a) * r, -0.045 * u - (1 - np.cos(a)) * r * 0.55, -0.012 - u * 0.05 - (1 - np.cos(a)) * r * 0.35)
        pts.append(p)
        rad.append(0.0075 * (1 - u) + 0.0032 * u)
    return np.array(pts, F), np.array(rad, F)


TAIL_RINGS = 18

# ---------- skinning ----------
WEIGHT_SMOOTH = (6, 0.5)   # laplacian smoothing passes over the game mesh, strength


def ear_tip():
    return EAR_B + EAR_A * EAR_L


def bone_tips(P):
    """bone segments for automatic weights: each pivot to the next joint (or a tip point)"""
    toeF = FOOT_F + V(0, 0.012, 0.035)
    toeH = FOOT_H + V(0, 0.012, 0.035)
    tp, _ = tail_curve(20)
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['head'], 'head': SNOUT_C + V(0, 0, 0.01), 'tail1': tp[-1]}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = toeH * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = toeF * m
        t['ear' + s] = ear_tip() * m
    return t


def keep(P):
    """1 where the game mesh should keep more of the sculpt's detail when decimating (eyes, snout disc, hooves)"""
    Pm = np.abs(P) * V(1, 0, 0) + P * V(0, 1, 1)
    e = sstep(0.034, 0.02, np.linalg.norm(Pm - EYE_C, axis=1))
    s = sstep(0.06, 0.045, np.linalg.norm((Pm - SNOUT_C) * V(1, 1, 2.5), axis=1))
    s = np.maximum(s, sstep(0.02, 0.008, np.abs(Pm[:, 1] - 0.38)) * sstep(0.6, 0.64, Pm[:, 2]) * sstep(0.09, 0.05, Pm[:, 0]) * 0.8)
    h = sstep(0.06, 0.035, Pm[:, 1]) * 0.7
    return np.maximum(np.maximum(e, s), h)


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    tail = np.zeros(len(wpos), bool); tail[weld[G['tail']]] = True
    W[tail] = 0; W[tail, bi['tail1']] = 1
    W[:, bi['ctag']] = 0
    # hooves and dew claws ride on the foot bones only
    for s in 'LR':
        sg = 1 if s == 'L' else -1
        for f, paw, meta in ((FOOT_F, 'fpaw', 'fmeta'), (FOOT_H, 'hpaw', 'hmeta')):
            near = (np.abs(wpos[:, 0] - sg * f[0]) < 0.05) & (np.abs(wpos[:, 2] - f[2]) < 0.06)
            low = near & (wpos[:, 1] < 0.03)
            W[low] = 0; W[low, bi[paw + s]] = 1
    return W


# ---------- skin paint (sRGB 0..1) and fine detail (meters), evaluated on the baked surface ----------
def _hex(h):
    return np.array([((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255], F)


K = {
    'skin': _hex(0xE6A894), 'back': _hex(0xE9B4A0), 'pink': _hex(0xE8998A), 'belly': _hex(0xECA394), 'flush': _hex(0xDC8478),
    'earIn': _hex(0xEC978A), 'snout': _hex(0xD7837C), 'nostril': _hex(0x4A2522), 'lid': _hex(0xD3857C),
    'hoof': _hex(0xC8B49A), 'hoofDk': _hex(0x5E5248), 'dirt': _hex(0x7A6550), 'freckle': _hex(0xA89A9E), 'ball': _hex(0x1C1410),
    'hair': _hex(0xFBF2E6),
}


def _mix(c, k, t):
    t = np.clip(t, 0, 1)[:, None]
    return c + (k - c) * t


def _flow(P):
    """direction the bristles lie in: back along the body, down the sides and legs"""
    y = P[:, 1]
    down = 0.25 + 0.9 * sstep(0.5, 0.3, y) + 1.5 * sstep(0.26, 0.15, y)
    d = np.stack([np.zeros_like(y), -down, -np.ones_like(y)], 1)
    return d / np.linalg.norm(d, axis=1, keepdims=True)


_bcache = {}


def bristles(P, N, dens):
    """sparse short bristles: one possible strand per 5.5 mm cell, a thin segment along the hair flow.
    Returns coverage 0..1 per point."""
    from sdf import _hash
    key = (len(P), float(P[:7].sum()))
    if key in _bcache:
        return _bcache[key]
    cell = 0.0055
    out = np.zeros(len(P), F)
    on = dens > 0.01
    Q, Nq, D = P[on], N[on], dens[on]
    G = np.floor(Q / cell).astype(np.int64)
    best = np.zeros(len(Q), F)
    for dz in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                c = G + np.array([dx, dy, dz])
                h0, h1, h2, h3, h4 = (_hash(c[:, 0], c[:, 1], c[:, 2], s) for s in (41, 42, 43, 44, 45))
                live = h3 < D
                s0 = (c + np.stack([h0, h1, h2], 1)) * cell
                fl = _flow(s0)
                fl = fl - Nq * (fl * Nq).sum(1, keepdims=True)
                fl /= np.maximum(np.linalg.norm(fl, axis=1, keepdims=True), 1e-9)
                L = 0.005 + 0.005 * h4
                r = Q - s0
                r = r - Nq * (r * Nq).sum(1, keepdims=True)
                t = np.clip((r * fl).sum(1) / L, 0, 1)
                dist = np.linalg.norm(r - fl * (L * t)[:, None], axis=1)
                w = 0.00011 * (1 - 0.65 * t)
                line = sstep(w * 2.2, w * 0.4, dist) * (1 - 0.5 * t) * live
                best = np.maximum(best, line)
    out[on] = best
    _bcache[key] = out
    return out


def _regions(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    r = {}
    Pm = P.copy(); Pm[:, 0] = np.abs(x)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(x + 1e-9)
    r['hoof'] = sstep(0.0025, 0.0004, c['hoof'])
    r['dew'] = sstep(0.0025, 0.0004, c['dew'])
    r['disc'] = sstep(0.004, 0.0008, c['snout']) * sstep(0.735, 0.752, z)
    r['ear'] = sstep(0.004, 0.0008, c['ear']) * sstep(0.0, 0.02, (Pm - EAR_B) @ EAR_A)
    r['earIn'] = sstep(-0.2, 0.3, Nm @ EAR_N)
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    r['ball'] = sstep(0.0012, 0.0003, c['ball']) * sstep(EYE_R + 0.004, EYE_R + 0.001, de)
    r['lid'] = sstep(EYE_R + 0.0105, EYE_R + 0.004, de) * (1 - r['ball'])
    r['eyeD'] = de
    r['leg'] = sstep(0.24, 0.16, y)
    r['belly'] = sstep(-0.3, -0.75, N[:, 1]) * sstep(0.36, 0.28, y)
    r['top'] = sstep(0.1, 0.7, N[:, 1])
    r['Pm'] = Pm
    return r


def _dens(R):
    hv = np.maximum(R['hoof'], R['dew'])
    return 0.55 * (0.5 + 0.6 * R['top']) * (1 - R['belly'] * 0.7) * (1 - R['disc']) * (1 - R['ear'] * 0.8) * (1 - hv) * sstep(EYE_R + 0.008, EYE_R + 0.014, R['eyeD'])


def paint(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    R = _regions(P, N, c)
    Pm = R['Pm']
    n1 = fbm(Pm * 7, 3, 11)
    n2 = fbm(Pm * 26, 3, 12)
    col = np.tile(K['skin'], (len(P), 1))
    col = _mix(col, K['back'], R['top'] * 0.7)
    col = _mix(col, K['pink'], sstep(0.45, 0.3, y) * (1 - R['top']) * 0.6)
    col = _mix(col, K['belly'], R['belly'] * 0.7)
    # mottling and a few flushed patches
    col *= (0.95 + 0.1 * n1)[:, None]
    col = _mix(col, K['flush'], sstep(0.6, 0.78, n2) * 0.18 + sstep(0.64, 0.82, n1) * 0.12)
    # pressure points and skin creases are redder
    cr = folds(P) / 0.002
    col = _mix(col, K['flush'], np.clip(cr, 0, 1) * 0.55)
    for jc in (V(XL, 0.135, 0.255), V(XL, 0.165, -0.36), V(XL, 0.25, 0.2)):
        col = _mix(col, K['flush'], sstep(0.04, 0.015, np.linalg.norm(Pm - jc, axis=1)) * 0.35)
    # rare grey freckles
    f1, _ = worley(Pm * 70, 21)
    fr = sstep(0.32, 0.18, f1) * (vnoise(Pm * 70, 22) > 0.86) * (1 - R['leg'])
    col = _mix(col, K['freckle'], fr * 0.45)
    # face: pink around the eyes, lids, snout
    col = _mix(col, K['flush'], sstep(0.035, 0.016, R['eyeD']) * 0.35)
    col = _mix(col, K['lid'], R['lid'] * 0.6)
    D = Pm - EYE_C
    s_, u_ = D @ EYE_SIDE, D @ EYE_UP - LID_OFF
    ap = np.sqrt((s_ / LID_W) ** 2 + (u_ / LID_H) ** 2)
    col = _mix(col, K['nostril'], sstep(1.45, 1.05, ap) * sstep(EYE_R + 0.008, EYE_R + 0.003, R['eyeD']) * 0.7)
    col = _mix(col, K['snout'], sstep(0.69, 0.75, z) * sstep(0.08, 0.04, np.abs(x)) * 0.5)
    disc = R['disc']
    col = _mix(col, K['snout'], disc)
    nos = ellipsoid(Pm, SNOUT_C + nrm([0, -0.13, 1]) * 0.016 + V(0.0175, 0, 0), V(0.0075, 0.0125, 0.015))
    col = _mix(col, K['nostril'], sstep(0.002, -0.003, nos) * disc)
    col = _mix(col, K['dirt'], disc * sstep(0.5, 0.75, fbm(Pm * 90, 2, 13)) * 0.3)
    # ears: thinner skin shows pink on the inside, veins on the back
    col = _mix(col, K['earIn'], R['ear'] * R['earIn'] * 0.8)
    vf1, vf2 = worley(Pm * 110, 31)
    vein = sstep(0.07, 0.0, vf2 - vf1) * R['ear'] * (1 - R['earIn'])
    col = _mix(col, K['flush'] * 0.92, vein * 0.5)
    # legs: a little grime toward the feet; hooves pale horn, darker toward the sole
    dirt = R['leg'] * sstep(0.2, 0.06, y) * sstep(0.35, 0.65, fbm(Pm * 30, 3, 14))
    col = _mix(col, K['dirt'], dirt * 0.55 + R['belly'] * sstep(0.55, 0.8, n2) * 0.15)
    hcol = _mix(np.tile(K['hoof'], (len(P), 1)), K['hoofDk'], sstep(0.02, 0.0, y) * 0.8 + 0.25 * vnoise(Pm * V(700, 40, 700), 15))
    col = _mix(col, hcol, np.maximum(R['hoof'], R['dew']))
    # bristles
    b = bristles(P, N, _dens(R))
    col = _mix(col, K['hair'], b * 0.85)
    col = _mix(col, K['ball'], R['ball'])
    rough = 0.62 + 0.08 * (n2 - 0.5)
    rough = rough - 0.2 * disc - 0.15 * np.maximum(R['hoof'], R['dew']) - 0.25 * R['lid'] * sstep(EYE_R + 0.006, EYE_R + 0.003, R['eyeD']) + 0.1 * dirt
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    R = _regions(P, N, c)
    Pm = R['Pm']
    h = np.zeros(len(P), F)
    hv = np.maximum(R['hoof'], R['dew'])
    skin = (1 - hv) * (1 - R['ball'])
    # pores
    f1, _ = worley(Pm / 0.0016, 51)
    h -= 0.00006 * sstep(0.32, 0.05, f1) * skin * (1 - R['disc'])
    # fine crossed skin lines
    a = 1 - np.abs(2 * vnoise(Pm * V(260, 900, 260), 52) - 1)
    b = 1 - np.abs(2 * vnoise(Pm * V(900, 260, 700), 53) - 1)
    h -= 0.00004 * (sstep(0.75, 1.0, a) + sstep(0.75, 1.0, b)) * skin
    # transverse wrinkles over the top of the snout
    wr = np.abs(np.sin(np.pi * (z / 0.0068 + 0.6 * fbm(Pm * 60, 2, 54))))
    snout_top = sstep(0.6, 0.64, z) * sstep(0.745, 0.73, z) * sstep(0.0, 0.5, N[:, 1]) * (1 - R['disc'])
    h -= 0.00028 * np.exp(-(wr / 0.28) ** 2) * snout_top
    # wrinkles around the eye
    er = np.abs(np.sin(np.pi * (R['eyeD'] / 0.0032 + 0.8 * fbm(Pm * 90, 2, 55))))
    h -= 0.00018 * np.exp(-(er / 0.3) ** 2) * sstep(EYE_R + 0.005, EYE_R + 0.009, R['eyeD']) * sstep(0.034, 0.022, R['eyeD'])
    # creases in the neck folds and across joints
    cr = np.abs(np.sin(np.pi * (z / 0.0045 + 0.5 * fbm(Pm * 70, 2, 56))))
    neck = sstep(0.46, 0.36, y) * sstep(0.31, 0.34, z) * sstep(0.47, 0.42, z)
    h -= 0.00012 * np.exp(-(cr / 0.3) ** 2) * neck
    yr = np.abs(np.sin(np.pi * (y / 0.004 + 0.4 * fbm(Pm * 70, 2, 57))))
    for jc in (V(XL, 0.135, 0.255), V(XL, 0.066, FOOT_F[2]), V(XL, 0.066, FOOT_H[2]), V(XL, 0.13, -0.335)):
        h -= 0.0001 * np.exp(-(yr / 0.3) ** 2) * sstep(0.03, 0.012, np.linalg.norm(Pm - jc, axis=1)) * skin
    # snout disc: big pores
    g1, _ = worley(Pm / 0.0024, 58)
    h -= 0.00016 * sstep(0.4, 0.1, g1) * R['disc']
    # ear veins stand out a little on the back of the ear
    vf1, vf2 = worley(Pm * 110, 31)
    h += 0.00012 * sstep(0.07, 0.0, vf2 - vf1) * R['ear'] * (1 - R['earIn'])
    # hooves: fine vertical grain and growth rings
    h -= (0.00004 * vnoise(Pm * V(1400, 60, 1400), 59) + 0.00003 * np.abs(np.sin(y * 900))) * hv
    # bristle shafts
    h += 0.00005 * bristles(P, N, _dens(R))
    return h


def finish(C, ao, valid):
    """fold ambient occlusion into the color (linear light)"""
    lin = np.where(C <= 0.04045, C / 12.92, ((C + 0.055) / 1.055) ** 2.4)
    lin = lin * (0.3 + 0.7 * ao[..., None])
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(np.maximum(lin, 0), 1 / 2.4) - 0.055)


# ---------- what the game needs besides the mesh ----------
MAP_QUALITY = (82, 85)   # WebP quality: color, normal


def stats(P, N, c, col):
    R = _regions(P, N, c)
    m = R['lid'] * sstep(EYE_R + 0.009, EYE_R + 0.005, R['eyeD'])
    lid = (col * m[:, None]).sum(0) / max(m.sum(), 1e-6) * 0.86
    return {'lidCol': int(round(lid[0] * 255)) << 16 | int(round(lid[1] * 255)) << 8 | int(round(lid[2] * 255))}


def meta(st):
    r = EYE_R
    up, dn = (LID_OFF + LID_H) / r, (LID_OFF - LID_H) / r
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.42],
                'iris': 0x7C5434, 'irisR': 0.95, 'pupilR': 0.32, 'lidCol': st['lidCol'],
                'lash': {'n': 11, 'len': 0.0095, 'col': 0xEFE2D2}},
        # pigs have hardly any neck: the collar sits just behind the jowls
        'collar': {'at': ['chest', 'neck', 0.92], 'w': 0.8},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.03, 0.98, 0.98],
    }
