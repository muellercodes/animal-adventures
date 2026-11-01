# White rhinoceros (the square-lipped rhino), sculpted as a signed distance field around the game's rhino skeleton
# (tools/blender/work/rhino-rig.json). Units are meters in game rig space (x left, y up, z forward, ground at y = 0).
# Shape: a huge barrel body with the hump over the neck, a long head carried low with a wide square mouth, two horns
# (on the horn bones, so calves keep only a bump), small eyes far back, tube-shaped ears, pillar legs on round feet with
# three nailed toes, a thin tail with a tuft; thick hairless skin in deep folds (neck, shoulders, flanks, legs). Paint:
# slate gray, dusty on top, darker in the folds and on the lower legs; the calf's smoother, lighter skin is the baby
# color map. Shared helpers for the hooved animals are in ungulate.py.
# Make it with: VOXEL=0.0085 TRIS=7600 WEIGHTS=transfer TEX=1024 BLENDER_PY=... python3 tools/blender/make.py rhino
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length
import ungulate as U
from ungulate import local as _local, local_n as _local_n, mirror as _mirror, groove, eround

ID = 'rhino'
BOUNDS = (V(-0.92, 0.0, -1.8), V(0.92, 1.92, 2.4))
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
BAKE_DIST = (0.018, 0.045, 0.18)

# ---------- landmarks (left side, +x) ----------
XF, XH = 0.4, 0.4
FOOT_F = V(XF, 0.0, 0.79)
FOOT_H = V(XH, 0.0, -0.95)
# head frame: from the poll (between the ears) down the face to the lips
HO = V(0.0, 1.43, 1.6)
HA = nrm([0.0, -0.8, 0.6])
HU = nrm([0.0, 0.6, 0.8])
HL = 1.2


def hp(s, u, x=0.0):
    return HO + HA * s + HU * u + V(1, 0, 0) * x


def hframe(Q):
    D = Q - HO
    return np.stack([D[:, 0], D @ HU, D @ HA], 1)


EYE_C = hp(0.32, -0.155, 0.232)
EYE_R = 0.019
EYE_DIR = nrm([0.93, 0.05, 0.36])
LID_W, LID_H, LID_OFF = 0.0175, 0.0105, 0.0008
EAR_B = hp(0.03, 0.012, 0.15)
EAR_A = nrm([0.3, 0.88, -0.36])
EAR_N = nrm([0.55, 0.05, 0.83])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
EAR_L, EAR_W = 0.25, 0.065
NOS_C = V(0.085, -0.15, 1.165)        # nostril (head frame x, u, s)
NOS_N = nrm([0.45, 0.05, 0.89])
MOUTH = hp(1.155, -0.22, 0.0)

# horns: polylines and radii (the front one on the nose, the shorter one on the forehead)
_hf = hp(0.77, -0.02)
_hr = hp(0.43, -0.01)
HORN_F = ([_hf + V(0, a, b) for a, b in ((0, 0), (0.12, 0.07), (0.27, 0.12), (0.41, 0.13), (0.52, 0.1), (0.6, 0.05))],
          [0.11, 0.087, 0.06, 0.037, 0.019, 0.006])
HORN_R = ([_hr + V(0, a, b) for a, b in ((0, 0), (0.09, 0.025), (0.17, 0.035), (0.23, 0.025), (0.27, 0.0))], [0.088, 0.066, 0.04, 0.018, 0.005])
HORN_STUB = 0.035                     # the first few cm of each horn stay on the head: the calf's bump
HORN_AX_F = nrm(HORN_F[0][1] - HORN_F[0][0])
HORN_AX_R = nrm(HORN_R[0][1] - HORN_R[0][0])
# the horn bones' pivots: the top of each stub (a calf's horns shrink to nothing there, leaving the bump)
HORN_PIV_F = HORN_F[0][0] + HORN_AX_F * HORN_STUB
HORN_PIV_R = HORN_R[0][0] + HORN_AX_R * HORN_STUB


def horns(P):
    Q = _mirror(P)
    hf, af = U.horn(Q, HORN_F[0], HORN_F[1], flat=0.86, keel=0.12, n=48)
    hr, ar = U.horn(Q, HORN_R[0], HORN_R[1], flat=0.86, keel=0.08, n=32)
    # fibrous keratin: fine lengthwise ridges
    rid = 0.0012 * (vnoise(Q * V(220, 25, 220), 31) - 0.5)
    return np.minimum(hf, hr) + rid


def horn_t(P):
    """position along the nearest horn (0 base .. 1 tip) and which horn (0 front, 1 rear)"""
    Q = _mirror(P)
    hf, af = U.horn(Q, HORN_F[0], HORN_F[1], flat=0.86, n=48)
    hr, ar = U.horn(Q, HORN_R[0], HORN_R[1], flat=0.86, n=32)
    return np.where(hf < hr, af, ar), (hr <= hf).astype(F)


# ---------- body ----------
# trunk: z, top, yw (height of widest), bottom, half width, exponent above, below
TRUNK = [
    (-1.62, 1.5, 1.38, 1.24, 0.08, 2.0, 2.0),
    (-1.55, 1.61, 1.35, 1.02, 0.3, 2.2, 2.0),
    (-1.415, 1.67, 1.3, 0.86, 0.47, 2.4, 2.1),
    (-1.21, 1.69, 1.25, 0.73, 0.56, 2.5, 2.2),
    (-0.85, 1.675, 1.22, 0.65, 0.61, 2.5, 2.2),
    (-0.43, 1.655, 1.2, 0.61, 0.63, 2.4, 2.2),
    (0.0, 1.675, 1.2, 0.6, 0.63, 2.4, 2.1),
    (0.4, 1.73, 1.22, 0.63, 0.59, 2.3, 2.0),
    (0.72, 1.77, 1.25, 0.7, 0.51, 2.2, 2.0),
    (0.98, 1.73, 1.27, 0.82, 0.43, 2.1, 2.0),
    (1.14, 1.62, 1.27, 0.96, 0.34, 2.0, 2.0),
]
# neck: path (y, z) and section (top, bottom, half width)
NECK = [
    (1.22, 0.86, 0.56, 0.52, 0.45, 2.1, 2.0),
    (1.2, 1.08, 0.52, 0.5, 0.4, 2.1, 2.0),
    (1.17, 1.3, 0.42, 0.48, 0.34, 2.0, 2.0),
    (1.12, 1.48, 0.33, 0.46, 0.29, 2.0, 2.0),
    (1.08, 1.62, 0.3, 0.42, 0.26, 2.0, 2.0),
]
# head, in the head frame: s (down the face), top, yw, bottom (u), half width, exponents
HEAD = [
    (-0.09, 0.03, -0.17, -0.38, 0.22, 2.2, 2.1),
    (0.05, 0.05, -0.18, -0.47, 0.25, 2.3, 2.1),
    (0.21, 0.045, -0.19, -0.49, 0.265, 2.4, 2.1),
    (0.38, 0.03, -0.18, -0.44, 0.245, 2.4, 2.2),
    (0.54, 0.015, -0.17, -0.38, 0.215, 2.5, 2.3),
    (0.68, 0.0, -0.17, -0.345, 0.2, 2.6, 2.4),
    (0.83, -0.01, -0.17, -0.335, 0.205, 2.7, 2.6),
    (0.96, -0.03, -0.18, -0.335, 0.225, 2.9, 2.8),
    (1.07, -0.06, -0.19, -0.31, 0.235, 3.1, 3.0),
    (1.135, -0.09, -0.2, -0.28, 0.22, 3.0, 2.8),
    (1.18, -0.12, -0.2, -0.25, 0.18, 2.6, 2.4),
]
FORE = [
    (1.3, 0.8, 0.3, 0.3, 0.26, 2.2, 2.2, 0.32),
    (1.04, 0.76, 0.27, 0.27, 0.235, 2.2, 2.2, 0.37),
    (0.8, 0.71, 0.215, 0.215, 0.2, 2.2, 2.2, 0.39),
    (0.6, 0.73, 0.19, 0.19, 0.178, 2.3, 2.3, 0.4),
    (0.42, 0.76, 0.175, 0.178, 0.168, 2.3, 2.3, 0.4),
    (0.24, 0.775, 0.168, 0.172, 0.162, 2.3, 2.3, 0.4),
]
HIND = [
    (1.42, -0.9, 0.36, 0.38, 0.27, 2.2, 2.2, 0.32),
    (1.15, -0.82, 0.34, 0.35, 0.25, 2.2, 2.2, 0.37),
    (0.88, -0.78, 0.25, 0.26, 0.205, 2.2, 2.2, 0.395),
    (0.66, -0.89, 0.195, 0.2, 0.18, 2.2, 2.2, 0.4),
    (0.48, -0.99, 0.175, 0.18, 0.168, 2.3, 2.3, 0.4),
    (0.24, -0.965, 0.168, 0.172, 0.162, 2.3, 2.3, 0.4),
]
TAIL = [
    (1.5, -1.58, 0.05, 0.05, 0.034, 2.0, 2.0),
    (1.38, -1.63, 0.042, 0.042, 0.026, 2.0, 2.0),
    (1.22, -1.665, 0.036, 0.036, 0.021, 2.0, 2.0),
    (1.06, -1.68, 0.03, 0.03, 0.018, 2.0, 2.0),
    (0.96, -1.685, 0.026, 0.026, 0.016, 2.0, 2.0),
]


def trunk(P):
    Q = _mirror(P)
    d = loft(Q, TRUNK)
    # shoulders: the shoulder blade and the big triceps behind it, the point of shoulder, the brisket
    d = smin(d, ellipsoid(Q, V(0.36, 1.32, 0.72), V(0.2, 0.36, 0.3)), 0.18)
    d = smin(d, ellipsoid(Q, V(0.38, 1.0, 0.58), V(0.17, 0.2, 0.22)), 0.16)
    d = smin(d, ellipsoid(Q, V(0.2, 0.92, 0.98), V(0.2, 0.2, 0.18)), 0.16)
    # hindquarters: the big round haunch, the point of hip, the thigh down to the stifle
    d = smin(d, ellipsoid(Q, V(0.34, 1.38, -1.05), V(0.27, 0.32, 0.4)), 0.2)
    d = smin(d, ellipsoid(Q, V(0.44, 1.52, -0.66), V(0.1, 0.1, 0.12)), 0.14)
    d = smin(d, ellipsoid(Q, V(0.38, 1.05, -0.84), V(0.18, 0.28, 0.27)), 0.16)
    # belly: a heavy barrel that hangs a little in the middle
    d = smin(d, ellipsoid(Q, V(0.0, 0.8, -0.12), V(0.5, 0.19, 0.62)), 0.16)
    return d


def neck(P):
    Q = _mirror(P)
    d = sweep(Q, NECK)
    # the hump: a ridge of muscle over the neck in front of the withers
    d = smin(d, ellipsoid(Q, V(0.0, 1.68, 1.02), V(0.26, 0.14, 0.34)), 0.14)
    # dewlap folds under the throat
    d = smin(d, ellipsoid(Q, V(0.0, 0.82, 1.3), V(0.18, 0.1, 0.2)), 0.1)
    return d


def head(P):
    Q = _mirror(P)
    L = hframe(Q)
    d = loft(L, HEAD)
    # the jaw: a deep heavy cheek under the eye, the angle of the jaw behind it
    d = smin(d, superellipsoid(L, V(0.145, -0.34, 0.27), (0.085, 0.15, 0.235), 2.3), 0.07)
    d = smin(d, ellipsoid(L, V(0.14, -0.36, 0.04), V(0.09, 0.12, 0.13)), 0.07)
    # the brow over the eye and the bony ridge forward of it
    d = smin(d, round_cone(L, V(0.2, -0.085, 0.235), V(0.175, -0.075, 0.46), 0.035, 0.022), 0.045)
    # the bosses under the horns
    d = smin(d, ellipsoid(L, V(0.0, 0.0, 0.77), V(0.13, 0.05, 0.15)), 0.05)
    d = smin(d, ellipsoid(L, V(0.0, 0.0, 0.43), V(0.11, 0.045, 0.12)), 0.05)
    # the wide square lips: the upper lip a broad flat pad across the front, the lower lip set back under it
    d = smin(d, superellipsoid(L, V(0.0, -0.22, 1.13), (0.22, 0.065, 0.055), 3.2), 0.03)
    d = smin(d, superellipsoid(L, V(0.0, -0.285, 1.06), (0.18, 0.04, 0.07), 3.0), 0.03)
    # the mouth line: along the sides of the muzzle from the corner to the front of the lips
    M = L * V(1, 2.0, 1)
    m = round_cone(M, V(0.0, -0.258 * 2.0, 1.19), V(0.19, -0.258 * 2.0, 1.12), 0.006, 0.006)
    m = smin(m, round_cone(M, V(0.19, -0.258 * 2.0, 1.12), V(0.218, -0.252 * 2.0, 0.94), 0.006, 0.002), 0.005)
    d = smax(d, -(m + 0.002) / 2.0, 0.008)
    # nostrils: curved slits on each side of the front of the muzzle, under the horn
    nn = NOS_N
    nu = nrm(np.array([0, 1, 0], F) - nn * nn[1])
    ns = np.cross(nu, nn)
    D = L - NOS_C
    N = np.stack([D @ ns, D @ nu, D @ nn], 1)
    pit = ellipsoid(N, V(0.0, 0.0, 0.0), V(0.012, 0.03, 0.03))
    pit = smin(pit, ellipsoid(N, V(-0.01, 0.022, 0.0), V(0.01, 0.014, 0.025)), 0.008)
    rim = smax(np.abs(pit + 0.005) - 0.005, N[:, 2] - 0.012, 0.004)
    d = smin(d, rim, 0.004)
    d = smax(d, -pit, 0.004)
    return d


def ears(P):
    """tube-shaped ears: a thick rolled funnel standing up from the top of the head, open toward the front and side
    along a slit, with a rounded tip"""
    Q = _mirror(P)
    tip = EAR_B + EAR_A * EAR_L
    outer = round_cone(Q, EAR_B, EAR_B + EAR_A * (EAR_L * 0.55), 0.06, 0.066)
    outer = smin(outer, round_cone(Q, EAR_B + EAR_A * (EAR_L * 0.55), tip, 0.066, 0.038), 0.02)
    outer = smin(outer, ellipsoid(Q, EAR_B + EAR_A * 0.01 - EAR_N * 0.01, V(0.065, 0.05, 0.06)), 0.03)
    inner = round_cone(Q, EAR_B + EAR_A * 0.06 + EAR_N * 0.024, tip - EAR_A * 0.045 + EAR_N * 0.03, 0.04, 0.022)
    d = smax(outer, -inner, 0.01)
    # the slit: the funnel opens toward the front and side, wider toward the tip
    a = (Q - EAR_B) @ EAR_A
    n = (Q - EAR_B) @ EAR_N
    side = np.cross(EAR_N, EAR_A)
    c = (Q - EAR_B) @ side
    slit = smax(-(n - 0.012), np.abs(c) - (0.012 + 0.03 * sat(a / EAR_L)), 0.008)
    slit = smax(slit, 0.06 - a, 0.01)
    return smax(d, -slit, 0.008)


def eye_parts(P):
    Q = _mirror(P)
    return U.eye_parts(Q, EYE_C, EYE_R, EYE_DIR, LID_W, LID_H, LID_OFF, mound=(0.012, 0.012, 0.005),
                       brow=((-0.034, 0.03, -0.02), (0.016, 0.034, -0.014), 0.012, 0.008))


def fleg(P):
    Q = _mirror(P)
    x = XF
    d = sweep(Q, FORE, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(x - 0.02, 0.86, 0.6), V(0.13, 0.12, 0.12)), 0.08)        # point of elbow
    d = smin(d, superellipsoid(Q, V(x, 0.44, 0.76), (0.15, 0.08, 0.15), 2.4), 0.06)    # knee (carpus)
    return d


def hleg(P):
    Q = _mirror(P)
    x = XH
    d = sweep(Q, HIND, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(x + 0.01, 0.84, -0.66), V(0.13, 0.11, 0.11)), 0.08)     # stifle
    d = smin(d, superellipsoid(Q, V(x, 0.6, -1.02), (0.15, 0.09, 0.16), 2.4), 0.07)     # hock
    d = smin(d, ellipsoid(Q, V(x, 0.66, -1.12), V(0.07, 0.11, 0.07)), 0.05)            # point of hock
    return d


def foot(Q, c):
    """a round foot on its pad, three toes in front, each with a broad hooflike nail (the middle one biggest)"""
    x, y, z = Q[:, 0] - c[0], Q[:, 1], Q[:, 2] - c[2]
    # the foot: a short column widening into the pad, its sole flat on the ground
    r = np.hypot(x / 1.0, z / 1.06)
    d = smax(r - (0.16 + 0.02 * sstep(0.2, 0.03, y)), smax(-y + 0.002, y - 0.26, 0.02), 0.03)
    d = smin(d, round_cone(Q, c + V(0, 0.08, 0.0), c + V(0, 0.3, 0.0), 0.165, 0.142), 0.04)
    nails = None
    for a, w, h, k in ((-40, 0.07, 0.075, 0.9), (0.0, 0.085, 0.09, 1.0), (40, 0.07, 0.075, 0.9)):
        ar = np.radians(a)
        dv = V(np.sin(ar), 0, np.cos(ar))
        nc = c + dv * 0.16
        # each nail: a short wide shell on the front of the toe, its lower edge on the ground, leaning back
        lc = Q - nc
        al = lc @ dv
        sd = lc @ V(np.cos(ar), 0, -np.sin(ar))
        yy = lc[:, 1]
        q = np.sqrt((sd / w) ** 2 + (np.maximum(yy, 0) / h) ** 2 + (np.minimum(yy, 0) / 0.01) ** 2)
        e = np.maximum((q - 1) * min(w, h) * 0.8, np.maximum(al - 0.045 + 0.25 * yy, -al - 0.04))
        e = smax(e, -yy + 0.001, 0.004)
        nails = e if nails is None else np.minimum(nails, e)
        # the toe under it, a bulge of the foot
        d = smin(d, ellipsoid(Q, nc + V(0, 0.06 * k, -0.03), V(w * 0.95, 0.07, 0.07)), 0.03)
    return d, nails


def feet(P):
    Q = _mirror(P)
    df, nf = foot(Q, FOOT_F)
    dh, nh = foot(Q, FOOT_H)
    return np.minimum(df, dh), np.minimum(nf, nh)


def tail(P):
    Q = _mirror(P)
    d = sweep(Q, TAIL)
    # the tail is flattened side to side and ends in a tuft of stiff dark hair
    d = smin(d, ellipsoid(Q, V(0.0, 0.92, -1.685), V(0.024, 0.07, 0.035)), 0.02)
    return d


def folds(P):
    """the deep skin folds and creases: rings around the neck, the fold behind the shoulder, the flank fold in front of
    the thigh, the fold along the belly, rings over the knees and above the feet (positive = carve in)"""
    Q = _mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    c = np.zeros(len(P), F)
    w = 0.02 * (vnoise(Q * V(4, 9, 4), 3) - 0.5)
    w2 = 0.04 * (vnoise(Q * V(3, 6, 3), 4) - 0.5)
    # neck: two heavy folds around the neck behind the head, deep under the throat, fading over the top; each one
    # overhangs the next, and a few shallow wrinkles between
    for z0, dep, wd in ((1.27, 0.03, 0.04), (1.43, 0.022, 0.035)):
        under = sstep(1.55, 0.95, y) * 0.75 + 0.25
        c += fold(z - z0 - 0.22 * (y - 1.2) + w + w2, wd, dep) * under * sstep(1.8, 1.55, y)
    c += groove(z - 1.35 - 0.22 * (y - 1.2) + w * 2, 0.012, 0.006) * sstep(1.6, 1.3, y)
    # shoulder fold: from the withers curving down behind the shoulder to the elbow, broad and soft
    c += fold(-(z - 0.48 + 0.32 * (y - 1.0) + w + w2), 0.06, 0.03) * sstep(0.3, 0.45, x) * sstep(0.72, 0.9, y) * sstep(1.66, 1.42, y)
    # flank fold in front of the thigh
    c += fold(z + 0.56 - 0.3 * (y - 1.0) + w + w2, 0.06, 0.028) * sstep(0.32, 0.47, x) * sstep(0.72, 0.9, y) * sstep(1.6, 1.36, y)
    # legs: an uneven fold over the knee and the hock, one above each foot
    ang = np.arctan2(x - XF, z - np.where(z > -0.2, FOOT_F[2], FOOT_H[2]))
    for jc, r0 in ((V(XF, 0.47, 0.76), 0.3), (V(XH, 0.62, -1.02), 0.3)):
        dd = length(Q - jc)
        c += fold(y - jc[1] + 0.04 * np.sin(ang * 2 + 1) + w * 2, 0.026, 0.012) * sstep(r0, r0 * 0.7, dd)
    for zc in (FOOT_F[2], FOOT_H[2]):
        nearz = sstep(0.4, 0.26, np.abs(z - zc)) * sstep(0.2, 0.3, x)
        c += fold(y - 0.32 - 0.03 * np.sin(ang * 3) + w * 2, 0.022, 0.008) * nearz
    return c


def fold(s, w, dep):
    """a skin fold across s: a crease (carved in) with the skin bulging over it on the + side"""
    return groove(s, w, dep) - 0.55 * groove(s - w * 1.3, w * 1.1, dep)


def parts(P):
    so, li, ba, br = eye_parts(P)
    ft, nl = feet(P)
    return {'trunk': trunk(P), 'neck': neck(P), 'head': head(P), 'ear': ears(P), 'lids': li, 'ball': ba, 'brow': br,
            'fleg': fleg(P), 'hleg': hleg(P), 'foot': ft, 'nail': nl, 'tail': tail(P), 'horn': _local(P, *HORN_BOX, horns)}


HORN_BOX = (V(-0.2, 0.66, 1.68), V(0.2, 1.54, 2.32))
HEAD_BOX = (V(-0.42, 0.28, 1.12), V(0.42, 1.64, 2.36))
EYE_BOX = (EYE_C * V(-1, 1, 1) - V(0.07, 0.07, 0.07), EYE_C + V(0.07, 0.07, 0.07))
EAR_BOX = (V(-0.42, 1.25, 1.34), V(0.42, 1.82, 1.86))


def shape(P):
    d = trunk(P)
    d = smin(d, _local(P, (-0.62, 0.4, 0.45), (0.62, 1.98, 1.98), neck), 0.16)
    h = _local(P, *HEAD_BOX, head)
    ca, li, ba, br = _local_n(P, *EYE_BOX, eye_parts, 4)
    h = smin(h, li, 0.02)
    h = smin(h, br, 0.02)
    h = smax(h, -ca, 0.006)
    h = smin(h, ba, 0.003)
    d = smin(d, h, 0.12)
    d = smin(d, _local(P, *EAR_BOX, ears), 0.03)
    d = smin(d, _local(P, *HORN_BOX, horns), 0.025)
    fl = _local(P, (-0.72, 0.1, 0.3), (0.72, 1.55, 1.15), fleg)
    d = smin(d, fl, 0.14)
    hl = _local(P, (-0.74, 0.1, -1.44), (0.74, 1.75, -0.34), hleg)
    d = smin(d, hl, 0.14)
    ft, nl = _local_n(P, (-0.66, -0.01, -1.5), (0.66, 0.42, 1.05), feet, 2)
    d = smin(d, ft, 0.06)
    d = smin(d, nl, 0.012)
    d = smin(d, _local(P, (-0.12, 0.8, -1.8), (0.12, 1.62, -1.44), tail), 0.05)
    d = d + _local(P, (-0.8, 0.15, -1.6), (0.8, 1.85, 1.6), folds, far=0.0)
    return d


PATCHES = [
    (EYE_C * V(0, 1, 1) + V(0.12, -0.06, -0.07), EYE_C * V(0, 1, 1) + V(0.25, 0.07, 0.07), 0.0016),   # eye and lids
    (V(0.0, 0.26, 1.86), V(0.27, 0.7, 2.36), 0.003),                                                      # nose and lips
    (V(0.0, 0.68, 1.7), V(0.17, 1.5, 2.3), 0.0032),                                                       # horns
    (V(0.06, 1.32, 1.4), V(0.32, 1.74, 1.8), 0.003),                                                      # ear
    (V(0.24, -0.001, 0.56), V(0.62, 0.16, 1.0), 0.003),                                                   # front foot
    (V(0.24, -0.001, -1.17), V(0.62, 0.16, -0.74), 0.003),                                                # hind foot
]

PREVIEW = {
    'side': ((9.5, 1.2, 0.05), (0, 1.0, 0.05), 32),
    'front3q': ((5.6, 2.6, 6.4), (0, 1.0, 0.3), 32),
    'front': ((0.0, 1.6, 8.0), (0, 1.0, 0.0), 26),
    'rear3q': ((-5.0, 2.8, -6.0), (0, 1.0, -0.3), 32),
    'top': ((0.01, 9.5, 0.0), (0, 1.0, 0.0), 30),
    'face': ((1.6, 1.45, 3.8), (0, 0.95, 1.9), 26),
    'faceside': ((2.7, 1.05, 1.95), (0.0, 0.95, 1.9), 26),
    'feet': ((1.8, 0.5, 2.2), (0.4, 0.25, 0.6), 30),
    'eye': ((0.95, 1.2, 2.2), (0.22, 1.08, 1.67), 12),
    'muzzle': ((0.9, 0.6, 3.2), (0.03, 0.45, 2.2), 18),
    'horn': ((1.6, 1.45, 3.0), (0.0, 1.05, 1.98), 22),
    'ear': ((1.0, 1.75, 2.2), (0.2, 1.5, 1.62), 16),
    'hind': ((2.0, 0.8, -2.5), (0.4, 0.6, -0.95), 28),
}

WEIGHT_SMOOTH = (6, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['neck2'], 'neck2': P['head'], 'head': hp(HL, -0.2), 'horn': HORN_F[0][-1], 'horn2': HORN_R[0][-1],
         'tail1': P['tail2'], 'tail2': V(0, 0.9, -1.685)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT_H + V(0, 0.02, 0.15)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (FOOT_F + V(0, 0.02, 0.15)) * m
        t['ear' + s] = (EAR_B + EAR_A * EAR_L) * m
    return t


def keep(P):
    Pm = _mirror(P)
    e = sstep(0.06, 0.03, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.9
    L = hframe(Pm)
    m = sstep(1.02, 1.07, L[:, 2]) * sstep(-0.34, -0.24, L[:, 1]) * 0.6
    a, c, n = U.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    er = sstep(-0.01, 0.02, a) * sstep(0.09, 0.06, np.abs(c)) * sstep(0.06, 0.03, np.abs(n)) * 0.7
    hn = U.box(Pm, HORN_BOX[0] * V(0, 1, 1), HORN_BOX[1]).astype(F) * sstep(0.02, 0.0, _local(P, *HORN_BOX, horns)) * 0.72
    f = sstep(0.14, 0.08, Pm[:, 1]) * 0.7
    tl = sstep(-1.56, -1.6, Pm[:, 2]) * sstep(0.08, 0.04, Pm[:, 0]) * sstep(1.55, 1.45, Pm[:, 1]) * 0.6
    base = np.full(len(P), 0.44, F)
    return np.maximum.reduce([base, e, m, er, hn, f, tl])


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    P = wpos.astype(F)
    Q = _mirror(P)
    side = np.where(P[:, 0] >= 0, 'L', 'R')
    W[:, bi['ctag']] = 0
    # horns: on the head first, then only what is past the stub goes to the horn bone (it hides them on calves)
    for hb in ('horn', 'horn2'):
        W[:, bi['head']] += W[:, bi[hb]]
        W[:, bi[hb]] = 0
    hn = _local(P, *HORN_BOX, horns)
    hd = _local(P, *HEAD_BOX, head)
    past_f = (Q - HORN_F[0][0]) @ HORN_AX_F > HORN_STUB
    past_r = (Q - HORN_R[0][0]) @ HORN_AX_R > HORN_STUB
    front = length(Q - HORN_F[0][2]) < length(Q - HORN_R[0][2]) + 0.05
    on_horn = (hn < 0.006) & (hn < hd - 0.002) & np.where(front, past_f, past_r) & (Q[:, 2] > 1.5)
    W[on_horn] = 0
    W[on_horn & front, bi['horn']] = 1
    W[on_horn & ~front, bi['horn2']] = 1
    # the whole head (jaw, muzzle) on the head bone, blending into neck2 behind the poll
    L = hframe(Q)
    hk = sstep(-0.02, 0.1, L[:, 2]) * sstep(0.04, 0.0, hd) * (~on_horn)
    for b in ('neck', 'neck2', 'chest', 'hips'):
        W[:, bi['head']] += W[:, bi[b]] * hk
        W[:, bi[b]] *= (1 - hk)
    # tail: along its length from tail1 to tail2; the rump around its root stays on the hips
    tl = _local(P, (-0.12, 0.8, -1.8), (0.12, 1.62, -1.44), tail)
    tr = _local(P, (-0.8, 0.5, -1.82), (0.8, 1.9, 1.3), trunk)
    on_t = (tl < 0.01) & (tl < tr - 0.004) & (Q[:, 2] < -1.54)
    u = np.clip((1.46 - Q[:, 1]) / 0.32, 0, 1)
    W[on_t] = 0
    W[on_t, bi['tail1']] = 1 - u[on_t]
    W[on_t, bi['tail2']] = u[on_t]
    for b in ('tail1', 'tail2'):
        W[~on_t, bi['hips']] += W[~on_t, bi[b]]; W[~on_t, bi[b]] = 0
    # ears
    a, c, n = U.ear_coords(Q, EAR_B, EAR_A, EAR_N)
    ed = ears(P)
    on_ear = (ed < 0.006) & (a > -0.02) & (hd > 0.004)
    k = sstep(0.0, 0.06, a)
    for s in 'LR':
        m = on_ear & (side == s)
        W[m] *= (1 - k[m])[:, None]
        W[m, bi['ear' + s]] += k[m]
        W[m, bi['ear' + ('R' if s == 'L' else 'L')]] = 0
    # feet: the whole foot below the fetlock on the paw bone
    for s in 'LR':
        sg = 1 if s == 'L' else -1
        for f, paw in ((FOOT_F, 'fpaw'), (FOOT_H, 'hpaw')):
            near = (np.abs(wpos[:, 0] - sg * f[0]) < 0.24) & (np.abs(wpos[:, 2] - f[2]) < 0.26) & (wpos[:, 1] < 0.11)
            W[near] = 0; W[near, bi[paw + s]] = 1
    return W


# ---------- skin paint (sRGB 0..1) and fine detail (meters) ----------
hx = U.hexc
K = {
    'skin': hx(0x76716A), 'skinDk': hx(0x56524D), 'skinLt': hx(0x8C867D), 'fold': hx(0x48443F), 'dust': hx(0xA29684), 'mud': hx(0x6A5B4A),
    'belly': hx(0x6C6660), 'lip': hx(0x6A625C), 'nose': hx(0x3A3633), 'horn': hx(0x5C5246), 'hornDk': hx(0x3E362E), 'hornTip': hx(0x9C907E),
    'nail': hx(0x4C443C), 'nailHi': hx(0x7A7064), 'ear': hx(0x6C6660), 'hair': hx(0x2C2824), 'ball': hx(0x120C08), 'lid': hx(0x4A4540),
    'calf': hx(0x807973), 'calfDk': hx(0x69635E), 'calfPink': hx(0x93857C), 'nub': hx(0x6E6660),
}


def _regions(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    r = {}
    Pm = _mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(x + 1e-9)
    r['Pm'], r['Nm'] = Pm, Nm
    r['nail'] = sstep(0.006, 0.001, c['nail'])
    r['horn'] = sstep(0.006, 0.001, c['horn']) * sstep(0.004, 0.0, c['horn'] - c['head'] + 0.006)
    a, cc, n = U.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    r['ea'], r['ec'] = a, cc
    r['ear'] = sstep(0.006, 0.001, c['ear']) * sstep(-0.01, 0.03, a)
    r['earIn'] = sstep(-0.1, 0.45, Nm @ EAR_N)
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    r['eyeD'] = de
    r['ball'] = sstep(0.0016, 0.0005, c['ball']) * sstep(EYE_R + 0.004, EYE_R + 0.001, de)
    r['lid'] = sstep(EYE_R + 0.01, EYE_R + 0.004, de) * (1 - r['ball'])
    L = hframe(Pm)
    r['L'] = L
    r['head'] = sstep(-0.08, 0.0, L[:, 2]) * sstep(0.02, 0.0, c['head'] - c['neck'] + 0.01) * (1 - r['horn'])
    r['lips'] = sstep(1.05, 1.11, L[:, 2]) * sstep(-0.13, -0.18, L[:, 1]) * r['head']
    r['nos'] = sstep(0.006, 0.0, c['head']) * sstep(0.05, 0.02, np.linalg.norm((L - NOS_C) * V(1, 0.6, 1), axis=1))
    r['leg'] = sstep(0.78, 0.6, y)
    r['foot'] = sstep(0.3, 0.12, y)
    r['belly'] = sstep(-0.3, -0.8, N[:, 1]) * sstep(1.0, 0.8, y) * (1 - r['leg'])
    r['top'] = sstep(0.2, 0.85, N[:, 1])
    r['tail'] = sstep(0.006, 0.001, c['tail']) * sstep(-1.56, -1.6, Pm[:, 2])
    r['tuft'] = r['tail'] * sstep(1.02, 0.96, y)
    return r


def _hide(Pm):
    """the hide's pattern: a network of fine creases between small plates, pits, and long wrinkles"""
    f1, f2 = worley(Pm / 0.022, 51)
    net = sstep(0.12, 0.02, f2 - f1)
    g1, _ = worley(Pm / 0.006, 52)
    pit = sstep(0.32, 0.08, g1)
    wr = 1 - np.abs(2 * vnoise(Pm * V(14, 50, 14), 53) - 1)
    return net, pit, sstep(0.78, 0.98, wr)


def paint(P, N, c, baby=False):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    R = _regions(P, N, c)
    Pm, L, Nm = R['Pm'], R['L'], R['Nm']
    n1 = fbm(Pm * 2.2, 3, 11)
    n2 = fbm(Pm * 9, 3, 12)
    net, pit, wr = _hide(Pm)
    fold = np.clip(folds(P) / 0.016, 0, 1)
    if baby:
        col = np.tile(K['calf'], (len(P), 1))
        col = U.mix(col, K['calfPink'], sstep(-0.2, -0.8, N[:, 1]) * 0.35 + R['lips'] * 0.5)
        col = U.mix(col, K['calfDk'], R['top'] * 0.15 + fold * 0.4 + R['foot'] * 0.3)
        col *= (0.96 + 0.06 * n1 - 0.05 * net * 0.5)[:, None]
    else:
        col = np.tile(K['skin'], (len(P), 1))
        col = U.mix(col, K['skinLt'], sstep(0.2, 0.9, N[:, 1]) * 0.45)
        col = U.mix(col, K['belly'], R['belly'] * 0.6)
        # dust and dried mud: pale dust over the back, darker mud caked on the legs and the belly
        col = U.mix(col, K['dust'], sstep(0.5, 0.72, n1) * sstep(0.1, 0.7, N[:, 1]) * 0.55)
        col = U.mix(col, K['mud'], R['leg'] * sstep(0.45, 0.7, fbm(Pm * 5, 3, 14)) * 0.5 + R['belly'] * sstep(0.55, 0.75, n2) * 0.3)
        col = U.mix(col, K['skinDk'], R['foot'] * 0.45)
        # the hide: dark creases, pits, long wrinkles; deep folds dark
        col *= (0.93 + 0.12 * n2 - 0.12 * net - 0.06 * pit - 0.08 * wr)[:, None]
        col = U.mix(col, K['fold'], fold * (0.55 - 0.3 * R['leg']))
    # head: darker around the eye, the lips and nostrils a little darker and smoother
    col = U.mix(col, K['lid'], R['lid'] * 0.8)
    col = U.mix(col, K['lip'], R['lips'] * 0.5)
    col = U.mix(col, K['nose'], R['nos'] * 0.85)
    # ears: dark hair inside and a fringe of dark hair on the rim
    a, cc = R['ea'], R['ec']
    col = U.mix(col, K['ear'], R['ear'] * 0.5)
    col = U.mix(col, K['hair'], R['ear'] * (R['earIn'] * sstep(0.06, 0.14, a) * 0.35 + sstep(0.2, 0.24, a) * 0.8) * (0.6 if baby else 1.0))
    col = U.mix(col, K['hair'], R['tuft'] * 0.9)
    # horns: dark at the base, a paler worn tip, fibrous streaks along them
    hn = R['horn'] > 0.01
    if baby:
        # a calf has no horn yet, only a smooth skin-colored nub where it will grow (the horn bones shrink away)
        col = U.mix(col, K['nub'], R['horn'] * 0.7)
        hn = hn & False
    if hn.any():
        t, which = horn_t(P[hn])
        hc = U.mix(np.tile(K['horn'], (hn.sum(), 1)), K['hornDk'], sstep(0.25, 0.0, t) * 0.6)
        hc = U.mix(hc, K['hornTip'], sstep(0.45, 0.95, t) * 0.75)
        hc *= (0.9 + 0.2 * vnoise(Pm[hn] * V(260, 20, 260), 33))[:, None]
        col[hn] = U.mix(col[hn], hc, R['horn'][hn])
    nc = U.mix(np.tile(K['nail'], (len(P), 1)), K['nailHi'], sstep(0.4, 0.8, vnoise(Pm * V(200, 12, 200), 15)) * 0.4 + sstep(0.04, 0.0, y) * 0.3)
    col = U.mix(col, nc, R['nail'])
    col = U.mix(col, K['ball'], R['ball'])
    rough = 0.82 + 0.06 * (n2 - 0.5) - 0.2 * R['nail'] - 0.12 * R['horn'] - 0.3 * R['lid'] * sstep(EYE_R + 0.008, EYE_R + 0.003, R['eyeD'])
    rough = rough - 0.15 * R['lips'] - 0.1 * R['nos'] + 0.05 * (1 - R['head']) * R['top']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.96).astype(F)


def paint_baby(P, N, c):
    return paint(P, N, c, baby=True)


def detail(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    h = np.zeros(len(P), F)
    skin = (1 - R['nail']) * (1 - R['ball']) * (1 - R['horn'])
    net, pit, wr = _hide(Pm)
    # the rough hide: creases around small plates, pits, long shallow wrinkles; stronger on the legs and the neck
    k = 1.0 + 0.8 * R['leg'] + 0.6 * sstep(0.95, 1.15, z) * sstep(1.55, 1.3, z)
    h -= (0.0009 * net + 0.0006 * wr) * skin * k
    # crossed wrinkles on the legs (the elephant-like rings)
    yr = np.abs(np.sin(np.pi * (y / 0.016 + 0.7 * fbm(Pm * 12, 2, 54))))
    h -= 0.0008 * np.exp(-(yr / 0.25) ** 2) * R['leg'] * skin
    # wrinkles around the eye and on the muzzle
    er = np.abs(np.sin(np.pi * (R['eyeD'] / 0.007 + 0.8 * fbm(Pm * 40, 2, 55))))
    h -= 0.0004 * np.exp(-(er / 0.3) ** 2) * sstep(EYE_R + 0.006, EYE_R + 0.014, R['eyeD']) * sstep(0.09, 0.06, R['eyeD'])
    mr = np.abs(np.sin(np.pi * (L[:, 2] / 0.012 + 0.6 * fbm(Pm * 30, 2, 56))))
    h -= 0.0003 * np.exp(-(mr / 0.3) ** 2) * sstep(0.92, 1.02, L[:, 2]) * R['head'] * (1 - R['lips'])
    # nostril rim and lips: fine pebbled skin
    g1, _ = worley(Pm / 0.004, 58)
    h -= 0.00015 * sstep(0.35, 0.1, g1) * np.maximum(R['nos'], R['lips'])
    # horns: fibrous lengthwise grooves; nails: growth lines
    hg = vnoise(Pm * V(500, 30, 500), 59)
    h -= 0.0003 * sstep(0.45, 0.8, hg) * R['horn']
    h -= (0.00012 * vnoise(Pm * V(900, 40, 900), 60) + 0.0001 * np.abs(np.sin(y * 500))) * R['nail']
    # tail tuft: stiff hairs
    h += 0.0004 * (vnoise(Pm * V(900, 40, 900), 61) - 0.5) * R['tuft']
    return h


def _on_horn(P):
    """which vertices are horn (as in fix_weights): past the stub of the nearest horn; and which horn"""
    Q = _mirror(P)
    hn = _local(P, *HORN_BOX, horns)
    hd = _local(P, *HEAD_BOX, head)
    past_f = (Q - HORN_F[0][0]) @ HORN_AX_F > HORN_STUB
    past_r = (Q - HORN_R[0][0]) @ HORN_AX_R > HORN_STUB
    # which horn: the nearer horn surface (the front horn's tip curves back over the rear one)
    hf, _ = U.horn(Q, HORN_F[0], HORN_F[1], flat=0.86, n=48)
    hr, _ = U.horn(Q, HORN_R[0], HORN_R[1], flat=0.86, n=32)
    front = hf < hr
    return (hn < 0.006) & (hn < hd - 0.002) & np.where(front, past_f, past_r) & (Q[:, 2] > 1.5), front


def baby_offset(P, N, c):
    """per vertex offsets in adult space: a calf has no horns yet, only a small nub where each will grow. The horns
    are pulled down onto a low cone on the top of their stubs (the game keeps the horn bones' size on the model calf,
    modelSpec.baby.hornMorph, and the horns grow back as the calf ages). The rest of the calf is the game's proportions."""
    Q = _mirror(P)
    d = np.zeros_like(Q)
    on, front = _on_horn(P)
    for H, AX, PIV, hgt, sel in ((HORN_F, HORN_AX_F, HORN_PIV_F, 0.05, on & front), (HORN_R, HORN_AX_R, HORN_PIV_R, 0.032, on & ~front)):
        if not sel.any():
            continue
        q = Q[sel]
        pts = np.array(H[0], F)
        seg = pts[1:] - pts[:-1]
        sl = np.linalg.norm(seg, axis=1)
        cum = np.concatenate([[0.0], np.cumsum(sl)]).astype(F)
        # nearest point on the horn's center line: arc length s and the point C
        best = np.full(len(q), 1e9, F); s = np.zeros(len(q), F); C = np.zeros_like(q)
        for i in range(len(seg)):
            t = np.clip(((q - pts[i]) @ seg[i]) / (sl[i] ** 2), 0, 1)
            cp = pts[i] + t[:, None] * seg[i]
            dd = np.linalg.norm(q - cp, axis=1)
            k = dd < best
            best[k] = dd[k]; s[k] = cum[i] + t[k] * sl[i]; C[k] = cp[k]
        rad = np.interp(s, cum, H[1]).astype(F)
        r_stub = np.interp(HORN_STUB, cum, H[1])
        u = np.clip((s - HORN_STUB) / (cum[-1] - HORN_STUB), 0, 1)
        rv = q - C
        rv = rv - np.outer(rv @ AX, AX)
        ring = PIV + rv * (r_stub / np.maximum(rad, 0.004))[:, None]
        new = ring + ((PIV + AX * hgt) - ring) * (u ** 0.8)[:, None]
        d[sel] = new - q
    d[:, 0] *= np.sign(P[:, 0] + 1e-9)
    return d.astype(F)


def finish(C, ao, valid):
    return U.finish(C, ao, valid, floor=0.42)


MAP_QUALITY = (76, 56)
PAD_SMOOTH = 3                 # smooth padding past 3 texels: the hide pattern smeared there cost WebP bytes
BABY_MAP = (512, 74)


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': U.lid_color(col, R['eyeD'], EYE_R)}


def meta(st):
    r = EYE_R
    up, dn = (LID_OFF + LID_H) / r, (LID_OFF - LID_H) / r
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.3],
                'iris': 0x2A1C12, 'irisR': 0.97, 'pupil': 'h', 'pupilR': 0.4, 'rim': 0x0C0705, 'lidCol': st['lidCol'],
                'lash': {'n': 14, 'len': 0.014, 'col': 0x2A2420}},
        'collar': {'at': ['neck', 'neck2', 0.35], 'w': 0.8, 'r': 0.75, 'maxR': 0.55},   # (a tilted band reached up to the hump)
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.08, 0.07, 0.06], 'flat': 0x7E7972,
    }


UV_AVERAGE = True


def uv_weight(P):
    Pm = _mirror(P)
    L = hframe(Pm)
    head = sstep(-0.1, 0.0, L[:, 2]) * sstep(1.15, 1.25, Pm[:, 2])
    hn = U.box(Pm, HORN_BOX[0] * V(0, 1, 1), HORN_BOX[1]).astype(F) * sstep(0.92, 1.0, Pm[:, 1])
    foot = sstep(0.3, 0.2, Pm[:, 1])
    under = sstep(0.9, 0.75, Pm[:, 1]) * sstep(0.62, 0.66, Pm[:, 1]) * sstep(0.25, 0.1, Pm[:, 0])
    return (0.9 + 0.55 * head * (1 - hn) + 0.1 * hn + 0.2 * foot - 0.3 * under).astype(F)


def uv_regions(P):
    Pm = _mirror(P)
    L = hframe(Pm)
    y, z = Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 2)
    head = (L[:, 2] > -0.06) & (z > 1.2)
    neck = ~head & (z > 0.85) & (y > 0.75)
    fleg = (z > -0.2) & (y < 0.8) & ~head
    hleg = (z <= -0.2) & (y < 0.9)
    lab[neck] = 1
    lab[head] = 0
    lab[fleg] = 3
    lab[fleg & (y < 0.45)] = 4
    lab[hleg] = 5
    lab[hleg & (y < 0.55)] = 6
    lab[y < 0.16] = 7
    lab[U.box(Pm, HORN_BOX[0] * V(0, 1, 1), HORN_BOX[1]) & (y > 1.0) & head & (Pm[:, 0] < 0.13)] = 8
    lab[(z < -1.52) & (y < 1.5) & (Pm[:, 0] < 0.08)] = 9
    return lab
