# A dromedary camel (one hump), sculpted as a signed distance field around the game's skeleton
# (tools/blender/work/camel-rig.json). Units are meters in game rig space (x left, y up, z forward, ground at y = 0);
# about 3.0 m from the lips to the rump, 1.9 m at the shoulder, the hump 2.2 m up. Built like the cow (cow.py) and the
# giraffe: a trunk loft with the hump on it, a neck sweep, the head as a loft in its own frame, leg sweeps.
# Shape: a deep chest with the chest pad, a tucked-up waist, one round hump over the middle of the back, the rump
# sloping to a short tail with a tuft; a long neck dipping down from the shoulders and curving up to the head; a narrow
# head with a rounded skull, heavy brows over big hooded eyes, small round ears, a long muzzle with slit nostrils, a
# split upper lip and a droopy lower lip; long thin legs with knobby knees (with calluses) and hocks, wide flat padded
# feet with two toes and small nails. Long hair on the hump, the shoulders and the throat; the tail tuft.
# Paint: sandy tan, browner over the hump, the neck and the shoulders, cream below, gray-brown lips, dark calluses and
# soles. The calf: woolly and pale (its own color map and fur shells on babies only), a tiny hump (baby offsets).
# Make it with: VOXEL=0.008 TRIS=3700 TEX=768 WEIGHTS=transfer BLENDER_PY=... python3 tools/blender/make.py camel
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, length, axis_steps
import ungulate as U
import bird as BD
from ungulate import local as _local, local_n as _local_n, mirror as _mirror

ID = 'camel'
BOUNDS = (V(-0.52, -0.001, -1.27), V(0.52, 2.28, 2.04))
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
BAKE_DIST = (0.015, 0.045, 0.15)

# ---------- landmarks (left side, +x) ----------
XF, XH = 0.22, 0.22
FOOT_F = V(XF, 0.0, 0.5)
FOOT_H = V(XH, 0.0, -0.95)
# head frame: from the poll forward (a little down) along the face to the lips
HO = V(0.0, 2.07, 1.41)
HA = nrm([0.0, -0.22, 0.975])
HU = nrm([0.0, 0.975, 0.22])
HL = 0.57


def hp(s, u, x=0.0):
    return HO + HA * s + HU * u + V(1, 0, 0) * x


def hframe(Q):
    D = Q - HO
    return np.stack([D[:, 0], D @ HU, D @ HA], 1)


EYE_C = hp(0.13, -0.035, 0.083)
EYE_R = 0.022
EYE_DIR = nrm([0.86, 0.18, 0.47])
LID_W, LID_H, LID_OFF = 0.023, 0.0145, -0.004
MOUTH = hp(0.5, -0.115)
EAR_B = hp(-0.015, 0.0, 0.06)
EAR_A = nrm([0.45, 0.75, -0.48])
EAR_N = nrm([0.55, 0.1, 0.83])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
EAR_L, EAR_W = 0.085, 0.036
HUMP = (V(0.0, 1.9, -0.2), V(0.25, 0.32, 0.56))

# trunk: z, top, yw, bottom, half width, exponents (the hump is its own part on top)
TRUNK = [
    (-1.08, 1.75, 1.6, 1.42, 0.1, 2.2, 2.0),
    (-0.97, 1.84, 1.59, 1.3, 0.21, 2.2, 2.0),
    (-0.72, 1.89, 1.6, 1.32, 0.27, 2.2, 2.0),
    (-0.42, 1.9, 1.58, 1.28, 0.3, 2.2, 2.0),
    (-0.08, 1.92, 1.57, 1.19, 0.32, 2.2, 2.0),
    (0.25, 1.9, 1.54, 1.1, 0.3, 2.2, 2.0),
    (0.48, 1.82, 1.5, 1.12, 0.24, 2.1, 2.0),
    (0.64, 1.68, 1.46, 1.26, 0.16, 2.0, 2.0),
]
# neck: path (y, z), section (top: the back of the neck, the outside of its curve; bottom: the throat; half width)
NECK = [
    (1.6, 0.22, 0.2, 0.28, 0.2, 2.0, 2.0),
    (1.64, 0.5, 0.24, 0.3, 0.21, 2.0, 2.0),
    (1.56, 0.76, 0.16, 0.2, 0.14, 2.0, 2.0),
    (1.48, 1.0, 0.12, 0.15, 0.105, 2.0, 2.0),
    (1.55, 1.24, 0.11, 0.125, 0.095, 2.0, 2.0),
    (1.76, 1.37, 0.1, 0.105, 0.085, 2.0, 2.0),
    (2.0, 1.41, 0.09, 0.09, 0.075, 2.0, 2.0),
]
# head, in the head frame: s, top, yw, bottom (the jaw), half width, exponents
HEAD = [
    (-0.05, 0.0, -0.06, -0.12, 0.06, 2.2, 2.0),
    (0.02, 0.035, -0.05, -0.15, 0.078, 2.3, 2.1),
    (0.12, 0.04, -0.05, -0.18, 0.085, 2.4, 2.2),
    (0.22, 0.03, -0.055, -0.17, 0.068, 2.4, 2.2),
    (0.32, 0.02, -0.06, -0.15, 0.056, 2.4, 2.2),
    (0.42, 0.012, -0.065, -0.14, 0.054, 2.4, 2.2),
    (0.5, 0.004, -0.07, -0.135, 0.058, 2.5, 2.3),
    (0.55, -0.02, -0.075, -0.12, 0.052, 2.4, 2.2),
    (0.575, -0.045, -0.08, -0.105, 0.035, 2.2, 2.0),
]
# legs: path (y, z), section (front, back, half width), x of the center
FORE = [
    (1.56, 0.52, 0.14, 0.14, 0.13, 2.0, 2.0, 0.19),
    (1.16, 0.36, 0.09, 0.1, 0.08, 2.0, 2.0, 0.22),
    (0.9, 0.39, 0.066, 0.062, 0.056, 2.1, 2.1, 0.22),
    (0.63, 0.43, 0.055, 0.055, 0.055, 2.2, 2.2, 0.22),
    (0.4, 0.45, 0.034, 0.04, 0.034, 2.2, 2.2, 0.22),
    (0.17, 0.46, 0.045, 0.045, 0.045, 2.2, 2.2, 0.22),
    (0.08, 0.47, 0.045, 0.045, 0.05, 2.2, 2.2, 0.22),
]
HIND = [
    (1.66, -0.79, 0.21, 0.2, 0.155, 2.0, 2.0, 0.18),
    (1.24, -0.6, 0.14, 0.17, 0.115, 2.0, 2.0, 0.235),
    (0.98, -0.82, 0.075, 0.1, 0.068, 2.0, 2.0, 0.23),
    (0.7, -1.02, 0.045, 0.06, 0.05, 2.1, 2.1, 0.22),
    (0.42, -1.0, 0.034, 0.04, 0.034, 2.2, 2.2, 0.22),
    (0.17, -0.99, 0.045, 0.045, 0.045, 2.2, 2.2, 0.22),
    (0.08, -0.98, 0.045, 0.045, 0.05, 2.2, 2.2, 0.22),
]
TAIL = [
    (1.78, -1.03, 0.045, 0.045, 0.045, 2.0, 2.0),
    (1.68, -1.11, 0.032, 0.032, 0.03, 2.0, 2.0),
    (1.48, -1.15, 0.022, 0.022, 0.02, 2.0, 2.0),
    (1.34, -1.16, 0.018, 0.018, 0.017, 2.0, 2.0),
]
TUFT = (V(0.0, 1.3, -1.165), V(0.038, 0.13, 0.034))


def trunk_base(P):
    Q = _mirror(P)
    d = loft(Q, TRUNK)
    # the shoulder, the withers rising into the hump, the chest pad, the haunch
    d = smin(d, ellipsoid(Q, V(0.2, 1.62, 0.45), V(0.12, 0.28, 0.2)), 0.12)
    d = smin(d, ellipsoid(Q, V(0.0, 1.1, 0.34), V(0.11, 0.05, 0.15)), 0.08)
    d = smin(d, ellipsoid(Q, V(0.19, 1.66, -0.84), V(0.09, 0.16, 0.15)), 0.1)
    # a flank fold from the belly to the stifle (the thigh is wrapped in skin down to it)
    d = smin(d, U.eround(Q, V(0.2, 1.33, -0.36), V(0.24, 1.28, -0.58), 0.1, 0.085, 0.6, 0.22), 0.1)
    return d


def hump(P):
    Q = _mirror(P)
    c, r = HUMP
    # a round hump, steeper behind, with a shaggy top
    # (rounder and steeper in front, a long slope down to the croup behind)
    k = 1 + 0.25 * sstep(0.0, 0.3, Q[:, 2] - c[2]) - 0.12 * sstep(0.0, -0.4, Q[:, 2] - c[2])
    R = (Q - c) * V(1, 1, 1)
    R[:, 2] = R[:, 2] * k
    R[:, 1] = R[:, 1] + 0.08 * sstep(0.0, -0.5, Q[:, 2] - c[2]) * sat((Q[:, 1] - c[1]) / 0.3)
    h = ellipsoid(R, V(0, 0, 0), r)
    h = h - 0.006 * (fbm(Q * 18, 2, 61) - 0.5) * sstep(2.05, 2.15, Q[:, 1])
    return h


def trunk(P):
    return smin(trunk_base(P), hump(P), 0.2)


def neck(P):
    Q = _mirror(P)
    d = sweep(Q, NECK, n=48)
    # the long hair on the throat (a shaggy fringe under the lower neck)
    y, z = Q[:, 1], Q[:, 2]
    fr = ellipsoid(Q, V(0.0, 1.38, 0.86), V(0.07, 0.1, 0.22))
    fr = fr - 0.012 * (fbm(Q * 22, 2, 62) - 0.5)
    return smin(d, fr, 0.06)


def head(P):
    Q = _mirror(P)
    L = hframe(Q)
    x, u, s = L[:, 0], L[:, 1], L[:, 2]
    d = loft(L, HEAD)
    # a rounded skull at the back, the cheeks
    d = smin(d, ellipsoid(L, V(0.0, -0.02, 0.01), V(0.075, 0.07, 0.08)), 0.04)
    d = smin(d, ellipsoid(L, V(0.05, -0.12, 0.18), V(0.035, 0.06, 0.09)), 0.035)
    # the muzzle: a fleshy upper lip split down the middle, overhanging a droopy lower lip
    d = smin(d, ellipsoid(L, V(0.03, -0.09, 0.52), V(0.035, 0.045, 0.06)), 0.02)
    d = d + 0.006 * np.exp(-(x / 0.005) ** 2) * sstep(0.5, 0.56, s) * sstep(-0.04, -0.1, u)
    d = smin(d, ellipsoid(L, V(0.0, -0.15, 0.47), V(0.038, 0.032, 0.07)), 0.02)
    mo = np.exp(-((u + 0.128 + 0.02 * sstep(0.48, 0.38, s)) / 0.005) ** 2) * sstep(0.34, 0.42, s) * sstep(0.6, 0.52, s)
    d = d + 0.007 * mo
    # the nostrils: slits on top of the muzzle, slanting back and out
    nos = L - V(0.03, -0.01, 0.53)
    ca, sa = np.cos(0.6), np.sin(0.6)
    nos = np.stack([nos[:, 0] * ca - nos[:, 2] * sa, nos[:, 1], nos[:, 0] * sa + nos[:, 2] * ca], 1)
    d = smax(d, -ellipsoid(nos, V(0, 0, 0), V(0.004, 0.012, 0.022)), 0.004)
    ca_, li, ba, br = eye_parts(P)
    d = smin(d, li, 0.012)
    d = smin(d, br, 0.014)
    d = smax(d, -ca_, 0.004)
    d = smin(d, ba, 0.002)
    return d


def ears(P):
    Q = _mirror(P)
    return U.ear(Q, EAR_B, EAR_A, EAR_N, EAR_L, EAR_W, cup=0.6, th0=0.018, th1=0.009, tip=0.0, base_r=(0.022, 0.022, 0.02), roll=0.08)


def eye_parts(P):
    Q = _mirror(P)
    # heavy brows over hooded eyes
    return U.eye_parts(Q, EYE_C, EYE_R, EYE_DIR, LID_W, LID_H, LID_OFF, mound=(0.012, 0.011, 0.006),
                       brow=((-0.032, 0.026, -0.016), (0.02, 0.028, -0.012), 0.016, 0.011))


def foot(Q, c):
    """a camel's foot: a wide flat pad under two toes with a cleft between them in front, a small nail on each toe"""
    d = None
    for sd in (1, -1):
        t = superellipsoid(Q, c + V(sd * 0.042, 0.034, 0.035), (0.05, 0.036, 0.085), 2.4)
        d = t if d is None else smin(d, t, 0.03)
    d = smin(d, ellipsoid(Q, c + V(0.0, 0.04, -0.035), V(0.075, 0.042, 0.075)), 0.04)
    # the cleft between the toes, open in front
    cl = np.maximum(np.abs(Q[:, 0] - c[0]) - 0.004, c[2] + 0.06 - Q[:, 2])
    d = smax(d, -cl, 0.008)
    # flat soles
    d = smax(d, -Q[:, 1] + 0.0004, 0.01)
    return d


def nails(Q, c):
    d = None
    for sd in (1, -1):
        n = ellipsoid(Q, c + V(sd * 0.042, 0.036, 0.115), V(0.02, 0.016, 0.02))
        d = n if d is None else np.minimum(d, n)
    return d


def fleg(P):
    Q = _mirror(P)
    d = sweep(Q, FORE, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(XF, 0.63, 0.435), V(0.058, 0.068, 0.062)), 0.03)       # knee
    d = smin(d, ellipsoid(Q, V(XF, 0.62, 0.478), V(0.042, 0.048, 0.022)), 0.02)       # knee callus
    d = smin(d, ellipsoid(Q, V(XF, 0.18, 0.46), V(0.045, 0.045, 0.048)), 0.025)      # fetlock
    return d


def hleg(P):
    Q = _mirror(P)
    d = sweep(Q, HIND, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(XH, 0.71, -1.03), V(0.048, 0.065, 0.065)), 0.03)       # hock
    d = smin(d, ellipsoid(Q, V(XH, 0.75, -1.08), V(0.026, 0.045, 0.03)), 0.025)       # point of the hock
    d = smin(d, ellipsoid(Q, V(XH, 0.18, -0.99), V(0.045, 0.045, 0.048)), 0.025)     # fetlock
    return d


def feet(P):
    Q = _mirror(P)
    return np.minimum(foot(Q, FOOT_F), foot(Q, FOOT_H)), np.minimum(nails(Q, FOOT_F), nails(Q, FOOT_H))


def tail(P):
    Q = _mirror(P)
    d = sweep(Q, TAIL)
    w = 0.01 * (fbm(Q * 30, 2, 71) - 0.5)
    tf = ellipsoid(Q, TUFT[0], TUFT[1]) + w
    return smin(d, tf, 0.03), tf


HEAD_BOX = (V(-0.25, 1.72, 1.25), V(0.25, 2.25, 2.04))
EAR_BOX = (V(-0.2, 1.95, 1.28), V(0.2, 2.25, 1.5))
NECK_BOX = (V(-0.36, 1.05, 0.0), V(0.36, 2.15, 1.6))
FL_BOX = (V(-0.45, -0.05, 0.15), V(0.45, 1.8, 0.75))
HL_BOX = (V(-0.46, -0.05, -1.24), V(0.46, 1.95, -0.35))
FOOT_BOX = (V(-0.36, -0.05, -1.13), V(0.36, 0.14, 0.7))
TAIL_BOX = (V(-0.1, 1.08, -1.26), V(0.1, 1.88, -0.95))


def parts(P):
    so, li, ba, br = eye_parts(P)
    tl, tf = _local_n(P, *TAIL_BOX, tail, 2)
    ft, nl = _local_n(P, *FOOT_BOX, feet, 2)
    return {'trunk': trunk_base(P), 'hump': hump(P), 'neck': _local(P, *NECK_BOX, neck), 'head': _local(P, *HEAD_BOX, head),
            'ear': _local(P, *EAR_BOX, ears), 'lids': li, 'ball': ba, 'brow': br,
            'fleg': _local(P, *FL_BOX, fleg), 'hleg': _local(P, *HL_BOX, hleg), 'foot': ft, 'nail': nl, 'tail': tl, 'tuft': tf}


def shape(P):
    d = trunk(P)
    d = smin(d, _local(P, *NECK_BOX, neck), 0.16)
    d = smin(d, _local(P, *HEAD_BOX, head), 0.07)
    d = smin(d, _local(P, *EAR_BOX, ears), 0.012)
    d = smin(d, _local(P, *FL_BOX, fleg), 0.1)
    d = smin(d, _local(P, *HL_BOX, hleg), 0.11)
    ft, nl = _local_n(P, *FOOT_BOX, feet, 2)
    d = smin(d, ft, 0.03)
    d = smin(d, nl, 0.006)
    tl, tf = _local_n(P, *TAIL_BOX, tail, 2)
    k = 0.05 * sstep(1.63, 1.73, P[:, 1]) + 1e-4
    h = np.maximum(k - np.abs(d - tl), 0) / k
    return np.minimum(d, tl) - h * h * k * 0.25


def grid(h):
    """finer around the head, the knees, the lower legs and the feet"""
    lo, hi = BOUNDS
    xs = axis_steps(0.0, hi[0], [(0.0, 0.12, h * 0.55), (0.14, 0.32, h * 0.5)], h)
    ys = axis_steps(lo[1], hi[1], [(lo[1], 0.2, h * 0.35), (0.2, 0.75, h * 0.55), (1.75, hi[1], h * 0.6)], h)
    zs = axis_steps(lo[2], hi[2], [(-1.15, -0.75, h * 0.55), (0.3, 0.65, h * 0.55), (1.3, hi[2], h * 0.45)], h)
    return xs, ys, zs


PATCHES = [
    (EYE_C * V(0, 1, 1) + V(0.04, -0.05, -0.05), EYE_C * V(0, 1, 1) + V(0.14, 0.05, 0.05), 0.0018),   # eye and lids
    (V(0.0, 1.75, 1.82), V(0.1, 2.0, 2.04), 0.0025),                                                  # muzzle, nostrils, lips
    (V(0.1, -0.001, 0.36), V(0.34, 0.12, 0.66), 0.003),                                                # front foot
    (V(0.1, -0.001, -1.1), V(0.34, 0.12, -0.8), 0.003),                                                # hind foot
]

PREVIEW = {
    'side': ((6.6, 1.2, 0.35), (0, 1.1, 0.35), 32),
    'front3q': ((3.8, 2.2, 4.2), (0, 1.2, 0.35), 32),
    'rear3q': ((-3.6, 2.4, -4.0), (0, 1.1, -0.1), 32),
    'head': ((0.9, 2.15, 2.6), (0, 1.95, 1.65), 26),
    'headside': ((1.6, 1.98, 1.68), (0, 1.95, 1.68), 26),
    'headfront': ((0.0, 2.05, 3.1), (0, 1.95, 1.6), 22),
    'legs': ((1.6, 0.5, 1.0), (0.22, 0.35, 0.0), 30),
    'feet': ((0.9, 0.35, 1.2), (0.22, 0.05, 0.4), 26),
}


# ---------- the game mesh ----------
def keep(P):
    Pm = _mirror(P)
    e = sstep(0.07, 0.035, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.85
    L = hframe(Pm)
    hd = sstep(-0.05, 0.05, L[:, 2]) * sstep(1.3, 1.4, Pm[:, 2]) * 0.6
    mz = sstep(0.42, 0.48, L[:, 2]) * sstep(1.6, 1.7, Pm[:, 2]) * 0.75
    a, c, n = U.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    er = sstep(-0.01, 0.02, a) * sstep(0.05, 0.03, np.abs(c)) * sstep(0.04, 0.015, np.abs(n)) * 0.7
    lg = sstep(0.75, 0.55, Pm[:, 1]) * sstep(0.12, 0.16, Pm[:, 0]) * 0.5
    ft = sstep(0.12, 0.07, Pm[:, 1]) * 0.62
    tl = U.box(Pm, TAIL_BOX[0] * V(0, 1, 1), TAIL_BOX[1]).astype(F) * sstep(-1.075, -1.1, Pm[:, 2]) * 0.6
    base = np.full(len(P), 0.38, F)
    return np.maximum.reduce([base, e, hd, mz, er, lg, ft, tl]).astype(F)


BEND = [
    (V(0.0, 1.62, 0.55), V(0.0, 1.48, 1.0), 0.09, 0.4),       # neck, the lower part
    (V(0.0, 1.48, 1.0), V(0.0, 2.0, 1.41), 0.08, 0.3),        # neck, the upper part
    (V(XF, 1.5, 0.52), V(XF, 1.14, 0.36), 0.08, 0.2),         # upper arm
    (V(XF, 1.14, 0.36), V(XF, 0.62, 0.43), 0.08, 0.1),        # forearm
    (V(XF, 0.62, 0.43), V(XF, 0.16, 0.46), 0.08, 0.075),      # cannon
    (V(XH, 1.6, -0.77), V(XH, 1.24, -0.58), 0.08, 0.22),      # thigh
    (V(XH, 1.24, -0.58), V(XH, 0.7, -1.02), 0.08, 0.12),      # gaskin
    (V(XH, 0.7, -1.02), V(XH, 0.17, -0.99), 0.08, 0.075),     # hind cannon
    (V(0.0, 1.74, -1.07), V(0.0, 1.22, -1.17), 0.08, 0.05),   # tail
]


def lowpoly_fix(bm, hi):
    import meshfix as MF
    tr = MF.tree(hi)
    for a, b, pitch, reach in BEND:
        if a[0] == 0 and b[2] < -1.0:
            ok = lambda c, p0, r, reach=reach: r < reach and abs(c.x) < 0.06 and c.z < -1.075
        elif a[0] == 0 and b[0] == 0:
            ok = lambda c, p0, r, reach=reach: r < reach and abs(c.x) < 0.3 and c.z > 0.52
        else:
            ok = lambda c, p0, r, reach=reach: r < reach and abs(c.x) > 0.1
        MF.rings(bm, tr, a, b, pitch, ok)
    MF.finish(bm, 1e-6)


UV_AVERAGE = True
UV_PACK = dict(margin_method='FRACTION', margin=0.006)

OWN_KEYS = ['trunk', 'hump', 'neck', 'head', 'ear', 'fleg', 'hleg', 'foot', 'nail', 'tail']


def _own(c):
    D = np.stack([c[k] for k in OWN_KEYS], 1)
    o = np.argmin(D, 1)
    return {k: o == i for i, k in enumerate(OWN_KEYS)}


def uv_regions(P):
    """head and ears, neck (two), trunk (two), front legs (two), hind legs (two), feet, tail"""
    Pm = _mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 3)
    lab[z < -0.25] = 10
    L = hframe(Pm)
    nk = (z > 0.6) & (y > 1.25)
    lab[nk] = 2
    lab[nk & (z > 1.12)] = 1
    lab[(L[:, 2] > -0.05) & (z > 1.33) & (y > 1.75)] = 0
    fl = (x > 0.11) & (y < 1.3) & (z > 0.0)
    hl = (x > 0.11) & (y < 1.4) & (z <= 0.0) & (z > -1.25)
    lab[fl] = 4
    lab[fl & (y < 0.64)] = 5
    lab[hl] = 6
    lab[hl & (y < 0.7)] = 7
    lab[y < 0.1] = 8
    lab[(z < -1.075) & (y < 1.76) & (x < 0.07)] = 9
    return lab


TUBES = {4: 'F', 5: 'F', 6: 'H', 7: 'H', 8: 'FH'}


def _leg_angle(C, which):
    """angle of each face center around its leg's middle line (0 on the outside, +-pi on the inside)"""
    x, y, z = C[:, 0], C[:, 1], C[:, 2]
    th = np.zeros(len(C), F)
    for w, keys, xc in (('F', FORE, XF), ('H', HIND, XH)):
        K = np.asarray(keys, F)[::-1]
        zc = np.interp(y, K[:, 0], K[:, 1])
        m = (which == w) | ((which == 'FH') & ((z > -0.1) == (w == 'F')))
        th[m] = np.arctan2(z[m] - zc[m], x[m] - xc)
    return th


def unwrap(ob):
    """each region on its own (conformal); the legs are tubes, so they are cut open along their inner side first"""
    import bmesh, bpy
    me = ob.data
    bm = bmesh.from_edit_mesh(me)
    bm.faces.ensure_lookup_table()
    C = np.array([list(f.calc_center_median()) for f in bm.faces], np.float32)
    lab = uv_regions(C)
    which = np.array([TUBES.get(int(k), '') for k in lab])
    th = _leg_angle(C, which)
    for e in bm.edges:
        lf = e.link_faces
        if len(lf) != 2:
            continue
        a, b = lf[0].index, lf[1].index
        if lab[a] != lab[b] or (which[a] and abs(th[a] - th[b]) > np.pi):
            e.seam = True
    for k in np.unique(lab):
        bm = bmesh.from_edit_mesh(me)
        bm.faces.ensure_lookup_table()
        for f in bm.faces:
            f.select_set(bool(lab[f.index] == k))
        bmesh.update_edit_mesh(me)
        bpy.ops.uv.unwrap(method='CONFORMAL', margin=0.004)
    bpy.ops.mesh.select_all(action='SELECT')


def uv_weight(P):
    Pm = _mirror(P)
    L = hframe(Pm)
    head = sstep(-0.06, 0.0, L[:, 2]) * sstep(1.3, 1.36, Pm[:, 2]) * sstep(1.7, 1.78, Pm[:, 1])
    lg = sstep(0.75, 0.55, Pm[:, 1])
    return (1.0 + 1.3 * head + 0.25 * lg).astype(F)


WEIGHT_SMOOTH = (4, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['neck2'], 'neck2': P['neck3'], 'neck3': P['head'],
         'head': hp(HL, -0.06), 'tail1': P['tail2'], 'tail2': V(0, 1.16, -1.17)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT_H + V(0, 0.03, 0.1)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (FOOT_F + V(0, 0.03, 0.1)) * m
        t['ear' + s] = (EAR_B + EAR_A * EAR_L) * m
    return t


SPINE = ['hips', 'chest', 'neck', 'neck2', 'neck3', 'head']
# the neck's pivots along its curve (y, z): its weights follow the arc length along that polyline
NECK_PTS = np.array([(1.58, 0.52), (1.62, 0.7), (1.47, 1.0), (1.6, 1.3), (1.97, 1.43)], F)


def _neck_u(y, z):
    """position along the neck's pivot polyline: 1.6 at its base, 2 at 'neck', 3 at 'neck2', 4 at 'neck3', 5 at 'head'"""
    best = np.full(len(y), np.inf, F); u = np.zeros(len(y), F)
    vals = [1.6, 2.0, 3.0, 4.0, 5.0]
    for i in range(len(NECK_PTS) - 1):
        a, b = NECK_PTS[i], NECK_PTS[i + 1]
        ab = b - a
        t = np.clip(((y - a[0]) * ab[0] + (z - a[1]) * ab[1]) / float(ab @ ab), 0, 1)
        d = np.hypot(y - a[0] - t * ab[0], z - a[1] - t * ab[1])
        m = d < best
        best = np.where(m, d, best); u = np.where(m, vals[i] + t * (vals[i + 1] - vals[i]), u)
    return u


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    P = wpos.astype(F)
    Q = _mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    side = np.where(P[:, 0] >= 0, 'L', 'R')
    own = _own(parts(P))
    leg = own['fleg'] | own['hleg'] | own['foot'] | own['nail']
    Wn = np.zeros_like(W)
    # trunk (and hump) by z, the neck along its curve, the head
    u = np.interp(z, [-1.07, -0.72, 0.4, 0.55], [0.0, 0.0, 1.0, 1.5]).astype(F)
    un = _neck_u(y, z)
    nk = own['neck'] | own['head'] | own['ear']
    u = np.where(nk, np.maximum(un, np.where(own['neck'], 1.5, 0.0)), u)
    u = np.where(own['head'] | own['ear'], np.maximum(u, 5.0), u)
    body = ~(leg | own['tail'])
    for nm, w in BD.blend_chain(u, SPINE, 0.3):
        Wn[:, bi[nm]] += w * body
    for s in 'LR':
        m = own['ear'] & (side == s)
        a, _, _ = U.ear_coords(Q[m], EAR_B, EAR_A, EAR_N)
        k = sstep(0.0, 0.025, a)
        Wn[m] *= (1 - k)[:, None]
        Wn[m, bi['ear' + s]] += k
        for fr, bones, ys, gird in ((True, ['arm', 'fore', 'fmeta', 'fpaw'], [0.0, 0.16, 0.62, 1.14, 1.52], 'chest'),
                                    (False, ['thigh', 'shin', 'hmeta', 'hpaw'], [0.0, 0.17, 0.7, 1.24, 1.66], 'hips')):
            m = leg & (side == s) & ((z > -0.15) == fr)
            if not m.any():
                continue
            ul = 4.0 - np.interp(y[m], ys, [0.0, 1.0, 2.0, 3.0, 4.0]).astype(F)
            g = sstep(0.35, -0.2, ul) * 0.85
            for nm, w in BD.blend_chain(ul, bones, 0.2):
                Wn[m, bi[nm + s]] += w * (1 - g)
            Wn[m, bi[gird]] += g
        mf = (own['foot'] | own['nail']) & (side == s)
        Wn[mf] = 0
        Wn[mf & (z > -0.15), bi['fpaw' + s]] = 1
        Wn[mf & (z <= -0.15), bi['hpaw' + s]] = 1
    m = own['tail']
    ut = np.interp(y[m], [1.13, 1.46, 1.76], [2.0, 1.0, 0.0]).astype(F)
    g = sstep(0.25, -0.1, ut)
    for nm, w in BD.blend_chain(ut, ['tail1', 'tail2'], 0.2):
        Wn[m, bi[nm]] += w * (1 - g)
    Wn[m, bi['hips']] += g
    Wn[:, bi['ctag']] = 0
    return Wn / np.maximum(Wn.sum(1, keepdims=True), 1e-9)


# ---------- the calf's own shape: a tiny hump ----------
def baby_offset(P, N, c):
    Q = _mirror(P)
    out = np.zeros((len(P), 3), F)
    m = (c['hump'] < c['trunk'] + 0.06) & (Q[:, 1] > 1.7)
    if m.any():
        # each hump point moves down onto the back (the trunk without the hump), leaving a small rise
        o = Q[m] + V(0, 0.02, 0)
        tgt = U.surface(trunk_base, o, np.tile(V(0, -1, 0), (len(o), 1)), far=0.5, steps=90)
        k = 0.82 * sstep(-0.02, 0.06, c['trunk'][m] - c['hump'][m])
        dlt = (tgt - Q[m]) * k[:, None]
        dlt[:, 1] = np.minimum(dlt[:, 1], 0)
        dlt[:, 0] = dlt[:, 2] = 0
        out[m] = dlt
    out[:, 0] *= np.sign(P[:, 0] + 1e-9)
    return out.astype(F)


# ---------- coat paint (sRGB 0..1) and fine detail (meters) ----------
hx = U.hexc
K = {
    'coat': hx(0xB08350), 'coatDk': hx(0x84602F), 'coatLt': hx(0xCDAA78), 'cream': hx(0xDCC49A), 'hair': hx(0x6E4A26),
    'lip': hx(0x6A5848), 'lipDk': hx(0x3E3229), 'callus': hx(0x5A4C40), 'sole': hx(0x3A322C), 'nail': hx(0x2E2824),
    'ball': hx(0x100A06), 'lid': hx(0x5A422E), 'earIn': hx(0xC8AE88),
    'calf': hx(0xBCA078), 'calfDk': hx(0x9E8258),
}


def _regions(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    r = {}
    Pm = _mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(x + 1e-9)
    r['Pm'], r['Nm'] = Pm, Nm
    r['foot'] = sstep(0.006, 0.001, c['foot'])
    r['sole'] = r['foot'] * sstep(0.03, 0.012, Pm[:, 1]) * sstep(-0.2, -0.6, N[:, 1] + 0.3 * sstep(0.02, 0.0, Pm[:, 1]))
    r['nail'] = sstep(0.004, 0.0, c['nail'])
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    r['eyeD'] = de
    r['ball'] = sstep(0.0016, 0.0005, c['ball']) * sstep(EYE_R + 0.004, EYE_R + 0.001, de)
    r['lid'] = sstep(EYE_R + 0.008, EYE_R + 0.003, de) * (1 - r['ball'])
    L = hframe(Pm)
    r['L'] = L
    r['head'] = sstep(-0.06, 0.02, L[:, 2]) * sstep(1.3, 1.38, Pm[:, 2]) * sstep(1.72, 1.8, y)
    r['muzzle'] = sstep(0.4, 0.5, L[:, 2]) * r['head']
    r['lips'] = sstep(0.44, 0.5, L[:, 2]) * sstep(-0.06, -0.1, L[:, 1]) * r['head']
    a, cc, n = U.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    r['ear'] = sstep(0.006, 0.001, c['ear']) * sstep(-0.01, 0.02, a)
    r['earIn'] = sstep(-0.1, 0.45, Nm @ EAR_N) * r['ear']
    r['tuft'] = sstep(0.012, 0.0, c['tuft']) * sstep(1.46, 1.38, y)
    # the long hair: the top of the hump, the shoulders, the throat fringe
    r['humpHair'] = sstep(0.03, -0.01, c['hump'] - c['trunk']) * sstep(2.0, 2.12, y)
    r['throat'] = sstep(0.0, 0.02, c['neck'] - 0.0) * 0 + sstep(0.03, -0.01, c['neck']) * sstep(0.7, 0.85, z) * sstep(1.05, 0.95, z) * sstep(1.5, 1.38, y) * sstep(-0.1, -0.5, N[:, 1] + 0.3 * N[:, 2])
    r['callus'] = (sstep(0.03, 0.015, np.linalg.norm((Pm - V(XF, 0.62, 0.478)) / V(1.0, 1.1, 0.6), axis=1)) * (Pm[:, 2] > 0.44)
                   + sstep(0.035, 0.015, np.linalg.norm((Pm - V(0.0, 1.0, 0.34)) / V(1.1, 0.5, 1.0), axis=1) - 0.06))
    r['callus'] = np.clip(r['callus'], 0, 1)
    r['belly'] = sstep(-0.35, -0.85, N[:, 1]) * sstep(1.45, 1.25, y)
    r['inner'] = sstep(0.1, -0.5, Nm[:, 0]) * sstep(1.4, 1.1, y) * sstep(0.12, 0.17, Pm[:, 0])
    return r


def paint(P, N, c, baby=False):
    R = _regions(P, N, c)
    Pm, Nm, L = R['Pm'], R['Nm'], R['L']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n1 = fbm(Pm * 3, 3, 21)
    n2 = fbm(Pm * 25, 2, 22)
    if baby:
        col = U.mix(np.tile(K['calf'], (len(P), 1)), K['calfDk'], 0.35 * sstep(0.4, 0.95, Nm[:, 1]) + 0.25 * (n1 - 0.4))
        col = U.mix(col, K['cream'], 0.25 * R['belly'])
    else:
        col = U.mix(np.tile(K['coat'], (len(P), 1)), K['coatDk'], 0.3 * sstep(0.45, 0.95, Nm[:, 1]) + 0.6 * (n1 - 0.45))
        # the coat in soft tufts and strands: a little lighter and darker here and there
        col = U.mix(col, K['coatLt'], 0.35 * sstep(0.55, 0.8, fbm(Pm * V(9, 4, 9), 2, 23)))
        col = U.mix(col, K['coatDk'], 0.3 * sstep(0.5, 0.75, vnoise(Pm * V(120, 30, 120), 24)) * sstep(0.95, 1.4, y))
        # browner, longer hair over the hump, the shoulders and the throat; paler below and inside the legs
        col = U.mix(col, K['hair'], 0.55 * R['humpHair'] + 0.45 * R['throat'] + 0.25 * R['tuft'])
        col = U.mix(col, K['coatLt'], 0.45 * R['belly'] + 0.35 * R['inner'])
        col = U.mix(col, K['coatLt'], 0.4 * sstep(0.7, 0.4, y) * sstep(0.1, 0.15, x))
        col = U.mix(col, K['callus'], R['callus'] * 0.85)
    # the face: paler round the eyes and on the muzzle, gray-brown lips, dark nostrils
    col = U.mix(col, K['cream'], R['muzzle'] * 0.35)
    col = U.mix(col, K['lip'], R['lips'] * 0.75)
    col = U.mix(col, K['lid'], R['lid'] * 0.8)
    col = U.mix(col, K['earIn'], R['earIn'] * 0.5)
    nos = hframe(Pm) - V(0.03, -0.01, 0.53)
    ca, sa = np.cos(0.6), np.sin(0.6)
    nd = np.linalg.norm(np.stack([nos[:, 0] * ca - nos[:, 2] * sa, nos[:, 1], nos[:, 0] * sa + nos[:, 2] * ca], 1) / V(0.006, 0.016, 0.026), axis=1)
    col = U.mix(col, K['lipDk'], sstep(1.3, 0.9, nd))
    col = U.mix(col, K['sole'], np.maximum(R['sole'], R['foot'] * 0.25))
    col = U.mix(col, K['nail'], R['nail'])
    col = U.mix(col, K['ball'], R['ball'])
    col *= (0.95 + 0.1 * n2)[:, None]
    rough = 0.82 - 0.3 * R['nail'] - 0.35 * R['lid'] * sstep(EYE_R + 0.006, EYE_R + 0.002, R['eyeD']) - 0.15 * R['lips']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.96).astype(F)


def paint_baby(P, N, c):
    return paint(P, N, c, baby=True)


def detail(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    skin = (1 - R['nail']) * (1 - R['ball']) * (1 - R['sole'])
    h = np.zeros(len(P), F)
    # the coat: soft strokes back along the body and down the legs
    leg = sstep(1.2, 1.0, y) * sstep(0.12, 0.16, x)
    st = vnoise(Pm * V(200, 50, 200), 91) * leg + vnoise(Pm * V(180, 180, 45), 92) * (1 - leg)
    h += 0.0004 * (st - 0.5) * skin
    # long shaggy hair on the hump, the throat and the tail tuft
    hs = vnoise(Pm * V(260, 50, 260), 93)
    h += 0.0025 * (hs - 0.5) * np.maximum.reduce([R['humpHair'], R['throat'], R['tuft']])
    # calluses: rough, pitted skin; wrinkles round the knees and the fetlocks; creases across the lower neck
    h += 0.0008 * (fbm(Pm * 220, 2, 94) - 0.5) * R['callus']
    wl = np.abs(np.sin(np.pi * (y / 0.02 + 0.6 * fbm(Pm * 9, 2, 95))))
    h -= 0.0008 * np.exp(-(wl / 0.25) ** 2) * (sstep(0.07, 0.0, np.abs(y - 0.63)) + sstep(0.04, 0.0, np.abs(y - 0.18))) * sstep(0.12, 0.16, x)
    h -= 0.0004 * np.abs(np.sin(z * 300)) * R['sole']
    return h


def finish(C, ao, valid):
    return U.finish(C, ao, valid, floor=0.45)


# the calf's woolly coat: fur shells on babies only
FUR = dict(len=0.05, n=4, lean=0.45, tile=0.004, babyLen=1.0, babyLean=0.45, shade=0.8, babyOnly=True, quality=70)


def fur(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    bare = np.maximum.reduce([R['nail'], R['foot'], R['ball'], R['lid'] * 0.9, R['lips']])
    short = 1 - 0.6 * R['head'] - 0.5 * sstep(0.7, 0.3, Pm[:, 1]) * sstep(0.12, 0.16, Pm[:, 0])
    ring = sstep(EYE_R * 1.3, EYE_R * 2.6, R['eyeD'])
    tuft = np.clip(0.85 + 0.35 * fbm(Pm / 0.04, 2, 41), 0.6, 1.2)
    flen = FUR['len'] * short * (1 - bare) * ring * tuft
    fden = 0.9 * (1 - bare) * ring
    return np.clip(flen, 0, FUR['len']).astype(F), np.clip(fden, 0, 1).astype(F)


def flow(P, N):
    """the coat lies back along the body, down the legs and the sides, back along the neck and the head"""
    Pm = _mirror(P)
    y = Pm[:, 1]
    d = np.tile(V(0, -0.25, -1.0), (len(P), 1))
    legk = (sstep(1.3, 1.05, y) * sstep(0.12, 0.17, Pm[:, 0]))[:, None]
    d = d * (1 - legk) + V(0, -1, -0.05) * legk
    d = d - N * np.sum(d * N, 1, keepdims=True)
    d = d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-6)
    return d.astype(F)


MAP_QUALITY = (72, 58)
PAD_SMOOTH = 3
BABY_MAP = (256, 60)


def stats(P, N, c, col):
    R = _regions(P, N, c)
    # the calf's closed lids take the calf's own coat round the eye (with the adult's they showed as brown balls)
    colb, _ = paint(P, N, c, baby=True)
    return {'lidCol': U.lid_color(col, R['eyeD'], EYE_R), 'babyLidCol': U.lid_color(colb, R['eyeD'], EYE_R)}


def meta(st):
    r = EYE_R
    up, dn = (LID_OFF + LID_H) / r, (LID_OFF - LID_H) / r
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.3],
                'iris': 0x2A1A10, 'irisR': 0.97, 'pupil': 'h', 'pupilR': 0.45, 'rim': 0x0C0705, 'lidCol': st['lidCol'], 'babyLidCol': st['babyLidCol'],
                'lash': {'n': 18, 'len': 0.024, 'col': 0x1E1612}},
        'collar': {'at': ['neck2', 'neck3', 0.6], 'r': 0.8},
        'mouth': [round(float(v), 4) for v in MOUTH],
        # kneeling: the chest pad comes to the ground
        'belly': [0.0, 1.0, 0.34],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.06, 0.05, 0.04], 'flat': 0xB98E58,
    }
