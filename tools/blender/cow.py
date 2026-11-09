# A Holstein dairy cow, sculpted as a signed distance field around the game's skeleton (tools/blender/work/cow-rig.json).
# Units are meters in game rig space (x left, y up, z forward, ground at y = 0); about 2.45 m from the nose to the rump,
# 1.45 m at the withers. Built like the giraffe (giraffe.py): a trunk loft, a neck sweep, the head as a loft in its own
# frame, leg sweeps, cloven hooves and dewclaws from ungulate.py.
# Shape: a deep, angular dairy body with a straight back, the hip bones (hooks and pins) and the tail head showing, a
# big belly, a modest udder with four teats between the hind legs, a thin neck with a small dewlap, a long face with a
# flat forehead, a bony poll between the ears, prominent eyes, a wide muzzle with a big nose pad, ears held out
# sideways, thin legs with knobby knees and hocks, a long thin tail with a switch.
# Paint: crisp black patches on white that differ from side to side (SIDES: the color map holds both sides), white legs,
# belly, udder and switch, a black head with a white blaze down to a pink-gray muzzle. The calf has the same patches;
# its udder is taken away by its baby offsets (baby_offset) and its shape is the game's baby maps.
# Make it with: VOXEL=0.0065 TRIS=4000 TEX=768 WEIGHTS=transfer BLENDER_PY=... python3 tools/blender/make.py cow
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, length, axis_steps
import ungulate as U
import bird as BD
from ungulate import local as _local, local_n as _local_n, mirror as _mirror

ID = 'cow'
BOUNDS = (V(-0.5, -0.001, -1.12), V(0.5, 1.56, 1.5))
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
BAKE_DIST = (0.015, 0.045, 0.15)
SIDES = True

# ---------- landmarks (left side, +x) ----------
XF, XH = 0.19, 0.2
HOOF_F = V(XF, 0.0, 0.545)
HOOF_H = V(XH, 0.0, -0.7)
# head frame: from the poll forward and down along the face to the nose
HO = V(0.0, 1.455, 1.075)
HA = nrm([0.0, -0.74, 0.67])
HU = nrm([0.0, 0.67, 0.74])
HL = 0.55


def hp(s, u, x=0.0):
    return HO + HA * s + HU * u + V(1, 0, 0) * x


def hframe(Q):
    D = Q - HO
    return np.stack([D[:, 0], D @ HU, D @ HA], 1)


EYE_C = hp(0.145, -0.052, 0.109)
EYE_R = 0.0235
EYE_DIR = nrm([0.9, 0.15, 0.4])
LID_W, LID_H, LID_OFF = 0.026, 0.0192, 0.0015
MOUTH = hp(0.5, -0.115)
NOSE = hp(0.53, -0.03)
EAR_B = hp(0.05, -0.075, 0.095)
EAR_A = nrm([0.94, -0.1, -0.25])
EAR_N = nrm([0.15, 0.3, 0.94])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
EAR_L, EAR_W = 0.225, 0.066
UDDER = V(0.0, 0.69, -0.6)
TEATS = [V(0.068, 0.6, -0.5), V(0.06, 0.6, -0.69)]
TEAT_L = 0.065

# trunk: z, top, yw, bottom, half width, exponents (a flat-topped, angular dairy back over a round deep belly)
TRUNK = [
    (-0.97, 1.36, 1.22, 1.06, 0.1, 2.2, 2.0),
    (-0.9, 1.415, 1.18, 0.88, 0.2, 2.5, 2.0),
    (-0.7, 1.45, 1.13, 0.8, 0.27, 2.6, 2.0),
    (-0.42, 1.43, 1.05, 0.68, 0.34, 2.4, 2.0),
    (-0.12, 1.42, 1.0, 0.62, 0.385, 2.2, 2.0),
    (0.18, 1.43, 1.02, 0.65, 0.36, 2.2, 2.0),
    (0.42, 1.445, 1.06, 0.74, 0.28, 2.1, 2.0),
    (0.62, 1.37, 1.02, 0.8, 0.22, 2.0, 2.0),
    (0.76, 1.22, 1.0, 0.86, 0.15, 2.0, 2.0),
]
# neck: path (y, z), section (top: the crest, bottom: the throat and dewlap, half width)
NECK = [
    (1.14, 0.5, 0.3, 0.32, 0.27, 2.0, 2.0),
    (1.19, 0.72, 0.22, 0.29, 0.19, 2.0, 2.0),
    (1.27, 0.92, 0.15, 0.2, 0.13, 2.0, 2.0),
    (1.35, 1.05, 0.11, 0.15, 0.1, 2.0, 2.0),
]
# head, in the head frame: s, top (the front of the face), yw, bottom (the jaw), half width, exponents
HEAD = [
    (-0.03, 0.0, -0.06, -0.14, 0.085, 2.2, 2.0),
    (0.04, 0.012, -0.055, -0.2, 0.11, 2.7, 2.1),
    (0.13, 0.012, -0.06, -0.245, 0.115, 2.7, 2.2),
    (0.22, 0.006, -0.055, -0.23, 0.102, 2.6, 2.3),
    (0.32, 0.002, -0.055, -0.2, 0.088, 2.6, 2.4),
    (0.42, 0.0, -0.06, -0.18, 0.086, 2.7, 2.5),
    (0.49, -0.002, -0.065, -0.16, 0.095, 2.9, 2.6),
    (0.535, -0.01, -0.07, -0.145, 0.094, 3.0, 2.6),
    (0.56, -0.025, -0.075, -0.12, 0.075, 2.6, 2.4),
]
# legs: path (y, z), section (front, back, half width), x of the center
FORE = [
    (1.08, 0.6, 0.13, 0.13, 0.13, 2.0, 2.0, 0.16),
    (0.86, 0.47, 0.095, 0.1, 0.085, 2.0, 2.0, 0.185),
    (0.66, 0.475, 0.07, 0.062, 0.058, 2.1, 2.1, 0.19),
    (0.45, 0.5, 0.048, 0.046, 0.048, 2.2, 2.2, 0.19),
    (0.3, 0.505, 0.033, 0.036, 0.033, 2.2, 2.2, 0.19),
    (0.15, 0.515, 0.038, 0.04, 0.038, 2.2, 2.2, 0.19),
    (0.075, 0.54, 0.036, 0.034, 0.042, 2.2, 2.2, 0.19),
]
HIND = [
    (1.22, -0.72, 0.17, 0.17, 0.14, 2.0, 2.0, 0.16),
    (0.96, -0.56, 0.13, 0.17, 0.115, 2.0, 2.0, 0.195),
    (0.74, -0.66, 0.075, 0.11, 0.07, 2.0, 2.0, 0.205),
    (0.53, -0.8, 0.042, 0.06, 0.048, 2.1, 2.1, 0.2),
    (0.33, -0.76, 0.033, 0.038, 0.032, 2.2, 2.2, 0.2),
    (0.15, -0.725, 0.038, 0.04, 0.038, 2.2, 2.2, 0.2),
    (0.075, -0.705, 0.036, 0.034, 0.042, 2.2, 2.2, 0.2),
]
TAIL = [
    (1.4, -0.93, 0.05, 0.05, 0.05, 2.0, 2.0),
    (1.33, -1.0, 0.035, 0.035, 0.032, 2.0, 2.0),
    (1.1, -1.04, 0.022, 0.022, 0.021, 2.0, 2.0),
    (0.75, -1.05, 0.018, 0.018, 0.017, 2.0, 2.0),
    (0.58, -1.05, 0.018, 0.018, 0.017, 2.0, 2.0),
]
SWITCH = (V(0.0, 0.43, -1.05), V(0.045, 0.2, 0.045))


def trunk(P):
    Q = _mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    d = loft(Q, TRUNK)
    # the shoulder, the hooks (hip points), the thurl, the pins and the tail head
    d = smin(d, ellipsoid(Q, V(0.2, 1.18, 0.52), V(0.12, 0.26, 0.2)), 0.12)
    d = smin(d, ellipsoid(Q, V(0.25, 1.39, -0.63), V(0.06, 0.05, 0.08)), 0.07)
    d = smin(d, ellipsoid(Q, V(0.24, 1.22, -0.78), V(0.07, 0.1, 0.1)), 0.08)
    d = smin(d, ellipsoid(Q, V(0.1, 1.355, -0.95), V(0.05, 0.045, 0.05)), 0.04)
    d = smin(d, ellipsoid(Q, V(0.0, 1.405, -0.9), V(0.045, 0.04, 0.08)), 0.04)
    # the brisket between the front legs, a flank fold from the belly to the stifle
    d = smin(d, ellipsoid(Q, V(0.0, 0.88, 0.62), V(0.13, 0.12, 0.16)), 0.1)
    d = smin(d, U.eround(Q, V(0.22, 0.86, -0.3), V(0.26, 0.92, -0.55), 0.12, 0.1, 0.55, 0.24), 0.1)
    # the hollow in front of the hooks (the paralumbar fossa) and a hint of ribs
    d = d + 0.012 * np.exp(-(((z + 0.42) / 0.09) ** 2 + ((y - 1.26) / 0.1) ** 2)) * sstep(0.2, 0.32, x)
    return d


def neck(P):
    Q = _mirror(P)
    d = sweep(Q, NECK, n=40)
    # the dewlap: a thin fold of skin under the throat to the brisket
    t = np.clip((Q[:, 2] - 0.62) / 0.42, 0, 1)
    yb = 0.86 + (1.12 - 0.86) * t ** 1.2
    dw = np.maximum(np.abs(Q[:, 0]) - 0.035 * (1 - 0.6 * t), yb - Q[:, 1])
    dw = smax(dw, smax(0.6 - Q[:, 2], Q[:, 2] - 1.02, 0.02), 0.02)
    dw = smax(dw, Q[:, 1] - 1.22, 0.04)
    return smin(d, dw, 0.06)


def head(P):
    Q = _mirror(P)
    L = hframe(Q)
    x, u, s = L[:, 0], L[:, 1], L[:, 2]
    d = loft(L, HEAD)
    # the poll: a bony ridge across the top between the ears
    d = smin(d, round_cone(L, V(-0.07, -0.02, 0.02), V(0.07, -0.02, 0.02), 0.032, 0.032), 0.03)
    d = smin(d, ellipsoid(L, V(0.075, -0.035, 0.03), V(0.035, 0.035, 0.035)), 0.02)
    # the cheeks (jaw muscles) and the angle of the jaw
    d = smin(d, ellipsoid(L, V(0.07, -0.17, 0.17), V(0.045, 0.075, 0.1)), 0.04)
    # a flat forehead with a soft dip between the eyes, the nasal bridge
    d = d + 0.006 * np.exp(-((s - 0.2) / 0.06) ** 2 - (x / 0.04) ** 2) * sstep(-0.03, 0.0, u)
    # the muzzle: the nose pad (a wide flat plate in front), the nostrils at its sides, the thick upper and lower lips
    d = smin(d, superellipsoid(L, V(0.0, -0.062, 0.528), (0.09, 0.06, 0.036), 2.6), 0.025)
    d = smin(d, ellipsoid(L, V(0.058, -0.075, 0.5), V(0.042, 0.05, 0.05)), 0.02)
    # the nostrils: commas at the sides of the pad, opening forward and out, curling in at the top
    nos = L - V(0.07, -0.058, 0.55)
    ca, sa = np.cos(0.7), np.sin(0.7)
    nos = np.stack([nos[:, 0] * ca + nos[:, 2] * sa, nos[:, 1], -nos[:, 0] * sa + nos[:, 2] * ca], 1)
    nos[:, 0] -= 0.25 * (nos[:, 1] / 0.02) ** 2 * 0.012
    d = smax(d, -ellipsoid(nos, V(0, 0, 0), V(0.007, 0.022, 0.02)), 0.005)
    d = smin(d, ellipsoid(L, V(0.0, -0.135, 0.475), V(0.065, 0.032, 0.06)), 0.025)
    # the mouth line from the corner under the nose pad
    mo = np.exp(-((u + 0.098 + 0.06 * sstep(0.47, 0.38, s)) / 0.006) ** 2) * sstep(0.36, 0.42, s) * sstep(0.56, 0.5, s)
    d = d + 0.006 * mo
    ca, li, ba, br = eye_parts(P)
    d = smin(d, li, 0.012)
    d = smin(d, br, 0.014)
    d = smax(d, -ca, 0.004)
    d = smin(d, ba, 0.002)
    return d


def ears(P):
    Q = _mirror(P)
    return U.ear(Q, EAR_B, EAR_A, EAR_N, EAR_L, EAR_W, cup=0.5, th0=0.022, th1=0.009, tip=0.25, base_r=(0.03, 0.03, 0.028), roll=0.05)


def eye_parts(P):
    Q = _mirror(P)
    return U.eye_parts(Q, EYE_C, EYE_R, EYE_DIR, LID_W, LID_H, LID_OFF, mound=(0.013, 0.011, 0.006),
                       brow=((-0.03, 0.026, -0.018), (0.018, 0.029, -0.014), 0.013, 0.009))


def fleg(P):
    Q = _mirror(P)
    d = sweep(Q, FORE, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(XF, 0.445, 0.505), V(0.05, 0.052, 0.05)), 0.03)        # knee
    d = smin(d, ellipsoid(Q, V(XF, 0.15, 0.51), V(0.042, 0.042, 0.046)), 0.025)       # fetlock
    return d


def hleg(P):
    Q = _mirror(P)
    d = sweep(Q, HIND, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(XH, 0.53, -0.81), V(0.045, 0.06, 0.06)), 0.03)         # hock
    d = smin(d, ellipsoid(Q, V(XH, 0.565, -0.865), V(0.025, 0.045, 0.03)), 0.025)     # point of the hock
    d = smin(d, ellipsoid(Q, V(XH, 0.15, -0.725), V(0.042, 0.042, 0.046)), 0.025)     # fetlock
    return d


def hooves(P):
    Q = _mirror(P)
    hf = U.cloven(Q, HOOF_F, 0.135, 0.105, 0.085, 0.045, 0.62, 0.007)
    hh = U.cloven(Q, HOOF_H, 0.13, 0.1, 0.082, 0.045, 0.62, 0.007)
    return np.minimum(hf, hh)


def dew(P):
    Q = _mirror(P)
    dn = nrm([0.0, -0.75, -0.66])
    a = U.dewclaws(Q, V(XF, 0.095, 0.49), 0.022, 0.011, 0.024, dn)
    b = U.dewclaws(Q, V(XH, 0.095, -0.755), 0.022, 0.011, 0.024, dn)
    return np.minimum(a, b)


def udder(P):
    """the udder: two halves with a groove between them, attached high between the thighs; four teats"""
    Q = _mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    d = ellipsoid(Q, UDDER + V(0.045, 0.0, 0.0), V(0.1, 0.11, 0.2))
    d = smin(d, ellipsoid(Q, V(0.0, 0.78, -0.72), V(0.12, 0.13, 0.12)), 0.06)
    d = d + 0.008 * np.exp(-(x / 0.012) ** 2) * sstep(0.8, 0.66, y)
    t = None
    for tp in TEATS:
        e = round_cone(Q, tp + V(0, 0.03, 0), tp + V(0.006, -TEAT_L, 0.0), 0.014, 0.0105)
        t = e if t is None else np.minimum(t, e)
    return smin(d, t, 0.02), t


def tail(P):
    Q = _mirror(P)
    d = sweep(Q, TAIL)
    # the switch: a long tuft of hair at the end
    w = 0.01 * (fbm(Q * 28, 2, 71) - 0.5)
    tf = ellipsoid(Q, SWITCH[0], SWITCH[1]) + w
    return smin(d, tf, 0.04), tf


HEAD_BOX = (V(-0.3, 0.8, 0.85), V(0.3, 1.56, 1.5))
EAR_BOX = (V(-0.36, 1.12, 0.85), V(0.36, 1.5, 1.28))
NECK_BOX = (V(-0.4, 0.6, 0.25), V(0.4, 1.56, 1.25))
FL_BOX = (V(-0.42, -0.05, 0.25), V(0.42, 1.3, 0.8))
HL_BOX = (V(-0.44, -0.05, -1.05), V(0.44, 1.45, -0.3))
HOOF_BOX = (V(-0.32, -0.05, -0.85), V(0.32, 0.12, 0.7))
DEW_BOX = (V(-0.3, 0.02, -0.82), V(0.3, 0.14, 0.55))
UDDER_BOX = (V(-0.25, 0.45, -0.92), V(0.25, 0.95, -0.3))
TAIL_BOX = (V(-0.12, 0.15, -1.12), V(0.12, 1.52, -0.85))


def parts(P):
    so, li, ba, br = eye_parts(P)
    tl, tf = _local_n(P, *TAIL_BOX, tail, 2)
    ud, teat = _local_n(P, *UDDER_BOX, udder, 2)
    return {'trunk': trunk(P), 'neck': _local(P, *NECK_BOX, neck), 'head': _local(P, *HEAD_BOX, head), 'ear': _local(P, *EAR_BOX, ears),
            'lids': li, 'ball': ba, 'brow': br, 'udder': ud, 'teat': teat,
            'fleg': _local(P, *FL_BOX, fleg), 'hleg': _local(P, *HL_BOX, hleg), 'hoof': _local(P, *HOOF_BOX, hooves),
            'dew': _local(P, *DEW_BOX, dew), 'tail': tl, 'switch': tf}


def shape(P):
    d = trunk(P)
    d = smin(d, _local(P, *NECK_BOX, neck), 0.14)
    d = smin(d, _local(P, *HEAD_BOX, head), 0.07)
    d = smin(d, _local(P, *EAR_BOX, ears), 0.015)
    d = smin(d, _local(P, *FL_BOX, fleg), 0.1)
    d = smin(d, _local(P, *HL_BOX, hleg), 0.1)
    d = smin(d, _local(P, *UDDER_BOX, lambda Q: udder(Q)[0]), 0.05)
    d = smin(d, _local(P, *HOOF_BOX, hooves), 0.025)
    d = smin(d, _local(P, *DEW_BOX, dew), 0.008)
    tl, tf = _local_n(P, *TAIL_BOX, tail, 2)
    # the tail joins the body only at its root (it swings free of the buttocks below)
    k = 0.05 * sstep(1.3, 1.4, P[:, 1]) + 1e-4
    h = np.maximum(k - np.abs(d - tl), 0) / k
    return np.minimum(d, tl) - h * h * k * 0.25


def grid(h):
    """finer around the head, the lower legs and the hooves"""
    lo, hi = BOUNDS
    xs = axis_steps(0.0, hi[0], [(0.0, 0.14, h * 0.6), (0.14, 0.3, h * 0.5)], h)
    ys = axis_steps(lo[1], hi[1], [(lo[1], 0.2, h * 0.35), (0.2, 0.62, h * 0.55), (0.9, hi[1], h * 0.6)], h)
    zs = axis_steps(lo[2], hi[2], [(-0.9, -0.6, h * 0.55), (0.4, 0.62, h * 0.55), (0.95, hi[2], h * 0.45)], h)
    return xs, ys, zs


PATCHES = [
    (EYE_C * V(0, 1, 1) + V(0.05, -0.05, -0.05), EYE_C * V(0, 1, 1) + V(0.15, 0.05, 0.05), 0.0018),   # eye and lids
    (V(0.0, 0.88, 1.28), V(0.11, 1.12, 1.5), 0.0025),                                                 # muzzle, nostrils, lips
    (V(0.08, -0.001, 0.4), V(0.3, 0.14, 0.66), 0.0028),                                                # front hoof and dewclaws
    (V(0.08, -0.001, -0.84), V(0.32, 0.14, -0.58), 0.0028),                                            # hind hoof and dewclaws
    (V(0.0, 0.5, -0.76), V(0.1, 0.64, -0.44), 0.0025),                                                 # teats
]

PREVIEW = {
    'side': ((5.6, 1.0, 0.2), (0, 0.85, 0.2), 30),
    'front3q': ((3.2, 1.7, 3.6), (0, 0.9, 0.25), 30),
    'rear3q': ((-3.0, 1.9, -3.4), (0, 0.85, -0.2), 30),
    'head': ((0.9, 1.45, 2.3), (0, 1.22, 1.25), 26),
    'headside': ((1.6, 1.25, 1.22), (0, 1.22, 1.22), 26),
    'headfront': ((0.0, 1.35, 2.6), (0, 1.2, 1.2), 22),
    'legs': ((1.6, 0.5, 0.9), (0.2, 0.35, 0.0), 30),
    'under': ((1.4, 0.35, -1.6), (0.0, 0.65, -0.55), 30),
}


# ---------- the game mesh ----------
def keep(P):
    Pm = _mirror(P)
    e = sstep(0.07, 0.035, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.85
    L = hframe(Pm)
    hd = sstep(-0.05, 0.05, L[:, 2]) * sstep(0.95, 1.05, Pm[:, 2]) * 0.6
    mz = sstep(0.44, 0.5, L[:, 2]) * sstep(1.1, 1.2, Pm[:, 2]) * 0.75
    a, c, n = U.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    er = sstep(-0.01, 0.03, a) * sstep(0.08, 0.05, np.abs(c)) * sstep(0.05, 0.02, np.abs(n)) * 0.7
    lg = sstep(0.62, 0.45, Pm[:, 1]) * sstep(0.1, 0.14, Pm[:, 0]) * 0.5
    hf = sstep(0.14, 0.07, Pm[:, 1]) * 0.62
    ud = U.box(Pm, UDDER_BOX[0] * V(0, 1, 1), UDDER_BOX[1]).astype(F) * sstep(0.68, 0.6, Pm[:, 1]) * sstep(0.15, 0.1, Pm[:, 0]) * 0.65
    tl = U.box(Pm, TAIL_BOX[0] * V(0, 1, 1), TAIL_BOX[1]).astype(F) * sstep(-0.99, -1.01, Pm[:, 2]) * 0.6
    base = np.full(len(P), 0.38, F)
    return np.maximum.reduce([base, e, hd, mz, er, lg, hf, ud, tl]).astype(F)


BEND = [
    (V(0.0, 1.18, 0.55), V(0.0, 1.38, 1.08), 0.09, 0.42),      # neck
    (V(XF, 1.0, 0.62), V(XF, 0.78, 0.47), 0.08, 0.2),         # upper arm
    (V(XF, 0.78, 0.47), V(XF, 0.42, 0.5), 0.08, 0.1),         # forearm
    (V(XF, 0.42, 0.5), V(XF, 0.12, 0.52), 0.08, 0.075),       # cannon
    (V(XH, 1.15, -0.68), V(XH, 0.88, -0.48), 0.08, 0.22),     # thigh
    (V(XH, 0.88, -0.48), V(XH, 0.5, -0.8), 0.08, 0.12),       # gaskin
    (V(XH, 0.5, -0.8), V(XH, 0.12, -0.73), 0.08, 0.075),      # hind cannon
    (V(0.0, 1.38, -1.0), V(0.0, 0.62, -1.05), 0.09, 0.05),    # tail
]


def lowpoly_fix(bm, hi):
    import meshfix as MF
    tr = MF.tree(hi)
    for a, b, pitch, reach in BEND:
        if a[0] == 0 and b[2] < -0.9:
            ok = lambda c, p0, r, reach=reach: r < reach and abs(c.x) < 0.06 and c.z < -0.98
        elif a[0] == 0 and b[0] == 0:
            ok = lambda c, p0, r, reach=reach: r < reach and abs(c.x) < 0.33 and c.z > 0.5
        else:
            ok = lambda c, p0, r, reach=reach: r < reach and abs(c.x) > 0.09
        MF.rings(bm, tr, a, b, pitch, ok)
    MF.finish(bm, 1e-6)


UV_AVERAGE = True
UV_PACK = dict(margin_method='FRACTION', margin=0.006)

OWN_KEYS = ['trunk', 'neck', 'head', 'ear', 'fleg', 'hleg', 'hoof', 'dew', 'udder', 'tail']


def _own(c):
    D = np.stack([c[k] for k in OWN_KEYS], 1)
    o = np.argmin(D, 1)
    return {k: o == i for i, k in enumerate(OWN_KEYS)}


def uv_regions(P):
    """head and ears, neck, trunk (two), front legs (two), hind legs (two), hooves, udder, tail"""
    Pm = _mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 3)
    lab[z < -0.3] = 10
    L = hframe(Pm)
    lab[(z > 0.66) & (y > 1.0)] = 2
    lab[(L[:, 2] > -0.04) & (z > 0.98)] = 0
    lab[(z > 0.66) & (y > 0.8) & (y <= 1.0) & (x < 0.12)] = 2
    fl = (x > 0.1) & (y < 0.85) & (z > 0.0)
    hl = (x > 0.1) & (y < 0.95) & (z <= 0.0) & (z > -0.98)
    lab[fl] = 4
    lab[fl & (y < 0.44)] = 5
    lab[hl] = 6
    lab[hl & (y < 0.52)] = 7
    lab[y < 0.09] = 8
    lab[(z < -0.3) & (z > -0.9) & (y < 0.8) & (x < 0.17)] = 1
    lab[(z < -0.985) & (y < 1.38) & (x < 0.07)] = 9
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
    """each region on its own (conformal, so the islands are compact and few); the legs are tubes, so they are cut
    open along their inner side first"""
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
    head = sstep(-0.06, 0.0, L[:, 2]) * sstep(0.95, 1.02, Pm[:, 2])
    lg = sstep(0.62, 0.45, Pm[:, 1])
    return (1.0 + 1.3 * head + 0.25 * lg).astype(F)


WEIGHT_SMOOTH = (4, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['neck2'], 'neck2': P['head'],
         'head': hp(HL, -0.06), 'tail1': P['tail2'], 'tail2': P['tail3'], 'tail3': V(0, 0.25, -1.05)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (HOOF_H + V(0, 0.02, 0.08)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (HOOF_F + V(0, 0.02, 0.08)) * m
        t['ear' + s] = (EAR_B + EAR_A * EAR_L) * m
    return t


SPINE = ['hips', 'chest', 'neck', 'neck2', 'head']
NECK_A = np.array([1.2, 0.55], F)
NECK_D = np.array([1.41 - 1.2, 1.1 - 0.55], F) / np.hypot(1.41 - 1.2, 1.1 - 0.55)
NECK_T = [0.0] + [float((np.array(p, F) - NECK_A) @ NECK_D) for p in ((1.27, 0.72), (1.33, 0.95), (1.41, 1.1))]


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    P = wpos.astype(F)
    Q = _mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    side = np.where(P[:, 0] >= 0, 'L', 'R')
    own = _own(parts(P))
    leg = own['fleg'] | own['hleg'] | own['hoof'] | own['dew']
    Wn = np.zeros_like(W)
    # trunk by z (hips behind, chest in front), the neck along its line from the base to the poll, the head
    u = np.interp(z, [-1.0, -0.62, 0.45, 0.62], [0.0, 0.0, 1.0, 1.35]).astype(F)
    t = (y - NECK_A[0]) * NECK_D[0] + (z - NECK_A[1]) * NECK_D[1]
    un = np.interp(t, NECK_T + [NECK_T[-1] + 0.4], [1.6, 2, 3, 4, 4]).astype(F)
    nk = own['neck'] | own['head'] | own['ear']
    u = np.where(nk, np.maximum(un, np.where(own['neck'], 1.35, 0.0)), u)
    u = np.where(own['head'] | own['ear'], np.maximum(u, 4.0), u)
    body = ~(leg | own['tail'])
    for nm, w in BD.blend_chain(u, SPINE, 0.3):
        Wn[:, bi[nm]] += w * body
    for s in 'LR':
        # ears on their own bones
        m = own['ear'] & (side == s)
        a, _, _ = U.ear_coords(Q[m], EAR_B, EAR_A, EAR_N)
        k = sstep(0.0, 0.04, a)
        Wn[m] *= (1 - k)[:, None]
        Wn[m, bi['ear' + s]] += k
        # legs by height down each leg, into the chest or the hips at the top; hooves and dewclaws on the paw bones
        for fr, bones, ys, gird in ((True, ['arm', 'fore', 'fmeta', 'fpaw'], [0.0, 0.12, 0.42, 0.78, 1.05], 'chest'),
                                    (False, ['thigh', 'shin', 'hmeta', 'hpaw'], [0.0, 0.12, 0.5, 0.88, 1.2], 'hips')):
            m = leg & (side == s) & ((z > -0.1) == fr)
            if not m.any():
                continue
            ul = 4.0 - np.interp(y[m], ys, [0.0, 1.0, 2.0, 3.0, 4.0]).astype(F)
            g = sstep(0.35, -0.2, ul) * 0.85
            for nm, w in BD.blend_chain(ul, bones, 0.2):
                Wn[m, bi[nm + s]] += w * (1 - g)
            Wn[m, bi[gird]] += g
        mh = (own['hoof'] | own['dew']) & (side == s)
        Wn[mh] = 0
        Wn[mh & (z > -0.1), bi['fpaw' + s]] = 1
        Wn[mh & (z <= -0.1), bi['hpaw' + s]] = 1
    # the udder rides on the hips
    m = own['udder']
    Wn[m] = 0
    Wn[m, bi['hips']] = 1
    # tail: down its length, the root into the hips
    m = own['tail']
    ut = np.interp(y[m], [0.25, 0.7, 1.05, 1.42], [3.0, 2.0, 1.0, 0.0]).astype(F)
    g = sstep(0.25, -0.1, ut)
    for nm, w in BD.blend_chain(ut, ['tail1', 'tail2', 'tail3'], 0.2):
        Wn[m, bi[nm]] += w * (1 - g)
    Wn[m, bi['hips']] += g
    Wn[:, bi['ctag']] = 0
    return Wn / np.maximum(Wn.sum(1, keepdims=True), 1e-9)


# ---------- the calf's own shape: no udder ----------
def baby_offset(P, N, c):
    Q = _mirror(P)
    own = _own(c)
    m = own['udder'] | (c['udder'] < 0.012)
    out = np.zeros((len(P), 3), F)
    if m.any():
        # each udder point moves up onto the belly (the trunk and the legs without the udder), faded at the edges
        def body(R):
            d = trunk(R)
            d = smin(d, _local(R, *HL_BOX, hleg), 0.1)
            return d
        o = Q[m] + V(0, -0.02, 0)
        tgt = U.surface(body, o, np.tile(V(0, 1, 0), (len(o), 1)), far=0.6, steps=90)
        dlt = (tgt - Q[m]) * sstep(0.0, 0.03, c['trunk'][m] - c['udder'][m] + 0.02)[:, None]
        dlt[:, 1] = np.maximum(dlt[:, 1], 0)
        dlt[:, 1] += 0.01 * sstep(0.0, 0.05, dlt[:, 1])
        out[m] = dlt
    out[:, 0] *= np.sign(P[:, 0] + 1e-9)
    return out.astype(F)


# ---------- coat paint (sRGB 0..1) and fine detail (meters) ----------
hx = U.hexc
K = {
    'white': hx(0xEEEAE2), 'whiteSh': hx(0xD9D3C8), 'black': hx(0x181615), 'blackHi': hx(0x2C2826), 'nose': hx(0xB89490), 'noseDk': hx(0x6A5452),
    'udder': hx(0xE6C8BE), 'teat': hx(0xD9A89E), 'hoof': hx(0x3A3430), 'hoofLt': hx(0x5E554C), 'ball': hx(0x100A06), 'lid': hx(0x2A2220),
    'earIn': hx(0xC9B4AA), 'switch': hx(0xF2EEE6),
}


def _regions(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    r = {}
    Pm = _mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(x + 1e-9)
    r['Pm'], r['Nm'] = Pm, Nm
    r['hoof'] = sstep(0.005, 0.001, np.minimum(c['hoof'], c['dew']))
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    r['eyeD'] = de
    r['ball'] = sstep(0.0016, 0.0005, c['ball']) * sstep(EYE_R + 0.004, EYE_R + 0.001, de)
    r['lid'] = sstep(EYE_R + 0.008, EYE_R + 0.003, de) * (1 - r['ball'])
    L = hframe(Pm)
    r['L'] = L
    r['head'] = sstep(-0.06, 0.02, L[:, 2]) * sstep(0.96, 1.04, Pm[:, 2])
    r['nose'] = sstep(0.006, 0.0, c['head'] - 0.0) * sstep(0.5, 0.515, L[:, 2] + 0.25 * np.maximum(L[:, 1] + 0.03, 0)) * r['head']
    a, cc, n = U.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    r['ear'] = sstep(0.006, 0.001, c['ear']) * sstep(-0.01, 0.03, a)
    r['earIn'] = sstep(-0.1, 0.45, Nm @ EAR_N) * r['ear'] * sstep(0.004, 0.012, np.abs(cc) * 0 + (EAR_W - np.abs(cc)))
    r['udder'] = sstep(0.006, 0.0, c['udder'] - c['trunk'] + 0.004) * sstep(0.8, 0.72, y)
    r['teat'] = sstep(0.004, 0.0, c['teat'])
    r['switch'] = sstep(0.01, 0.0, c['switch']) * sstep(0.68, 0.6, y)
    # white below the knees and hocks (a little higher behind), on the belly and between the legs
    r['low'] = sstep(0.5, 0.4, y + 0.06 * (z < 0)) * sstep(0.09, 0.13, Pm[:, 0])
    r['belly'] = sstep(-0.45, -0.85, N[:, 1]) * sstep(0.95, 0.8, y)
    return r


def _patches(P, R):
    """the Holstein pattern: a low-frequency noise field (from the real, unmirrored point, so the two sides differ)
    cut with a crisp but wavy edge: big black patches on white"""
    W = P + 0.06 * (np.stack([vnoise(P * 3.1 + 1.7, 81), vnoise(P * 3.1 + 4.1, 82), vnoise(P * 3.1 + 7.3, 83)], 1) - 0.5)
    n = fbm(W * V(1.9, 2.3, 1.6) + V(3.3, 0.0, 1.1), 3, 84)
    n = n + 0.05 * (fbm(W * 9, 2, 85) - 0.5)
    # more black over the back and the shoulders, more white low down
    n = n + 0.08 * sstep(0.95, 1.35, P[:, 1]) - 0.05 * sstep(0.95, 0.75, P[:, 1])
    return sstep(0.505, 0.52, n)


def paint(P, N, c, baby=False):
    R = _regions(P, N, c)
    Pm, Nm, L = R['Pm'], R['Nm'], R['L']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    blk = _patches(P, R)
    # the head: black with a white blaze from the forehead down the face to the muzzle, the ears black
    s, u = L[:, 2], L[:, 1]
    # (a star on the forehead narrowing down the face, wider again over the muzzle; a little off the middle)
    bw = 0.02 + 0.03 * sstep(0.2, 0.1, s) * sstep(0.0, 0.08, s) + 0.035 * sstep(0.36, 0.5, s)
    wob = 0.022 * (fbm(P * V(14, 14, 14) + 2.0, 3, 86) - 0.5)
    blaze = sstep(bw + 0.003, bw - 0.003, np.abs(P[:, 0] - 0.007 + wob)) * sstep(0.03, 0.07, s + 0.02 * fbm(P * 12, 2, 87)) * sstep(-0.075, -0.035, u - 0.05 * sstep(0.4, 0.55, s))
    hd = R['head'] * sstep(0.0, 0.04, s + 0.03)
    blk = blk * (1 - hd) + hd * (1 - blaze)
    blk = np.maximum(blk, R['ear'])
    # white: lower legs, belly, udder, the switch
    blk = blk * (1 - R['low']) * (1 - R['belly'] * sstep(-0.62, -0.85, N[:, 1])) * (1 - R['udder']) * (1 - R['switch'])
    blk = blk * (1 - sstep(0.06, 0.0, c['tail']) * sstep(0.9, 0.75, y))
    jit = fbm(Pm * 60, 2, 87)
    white = U.mix(np.tile(K['white'], (len(P), 1)), K['whiteSh'], 0.4 * (jit - 0.3) + 0.2 * sstep(-0.2, -0.8, Nm[:, 1]))
    black = U.mix(np.tile(K['black'], (len(P), 1)), K['blackHi'], 0.6 * jit * sstep(-0.2, 0.6, Nm[:, 1]))
    col = U.mix(white, black, blk)
    col = U.mix(col, K['udder'], R['udder'] * 0.75)
    col = U.mix(col, K['teat'], R['teat'])
    col = U.mix(col, K['earIn'], R['earIn'] * 0.55)
    # the muzzle: a pink-gray nose pad mottled darker, dark nostrils
    nm = U.mix(np.tile(K['nose'], (len(P), 1)), K['noseDk'], 0.5 * sstep(0.45, 0.75, fbm(Pm * 40, 3, 88)))
    nl = np.linalg.norm(hframe(Pm) - V(0.052, -0.035, 0.548), axis=1)
    nm = U.mix(nm, hx(0x2A1E1C), sstep(0.022, 0.012, nl))
    col = U.mix(col, nm, R['nose'])
    col = U.mix(col, K['lid'], R['lid'] * 0.85)
    hcol = U.mix(np.tile(K['hoof'], (len(P), 1)), K['hoofLt'], 0.4 * sstep(0.3, 0.7, fbm(Pm * V(80, 8, 80), 2, 89)))
    col = U.mix(col, hcol, R['hoof'])
    col = U.mix(col, K['ball'], R['ball'])
    col *= (0.97 + 0.06 * fbm(Pm * 40, 2, 13))[:, None]
    rough = 0.76 - 0.3 * R['hoof'] - 0.35 * R['lid'] * sstep(EYE_R + 0.006, EYE_R + 0.002, R['eyeD']) - 0.32 * R['nose'] - 0.1 * blk
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.96).astype(F)


def detail(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    skin = (1 - R['hoof']) * (1 - R['ball']) * (1 - R['nose']) * (1 - R['teat'])
    h = np.zeros(len(P), F)
    # the short coat: fine strokes, back along the body and down the legs
    leg = sstep(0.9, 0.7, y) * sstep(0.1, 0.14, x)
    st = vnoise(Pm * V(240, 60, 240), 91) * leg + vnoise(Pm * V(220, 220, 55), 92) * (1 - leg)
    h += 0.0003 * (st - 0.5) * skin
    # the switch and the poll: coarse hair
    hs = vnoise(Pm * V(500, 40, 500), 93)
    h += 0.0025 * (hs - 0.5) * R['switch']
    # skin folds across the neck and the dewlap, wrinkles round the knees and the fetlocks
    nk = sstep(0.62, 0.72, z) * sstep(1.05, 0.95, z) * sstep(0.95, 1.05, y + 0.0)
    wr = np.abs(np.sin(np.pi * ((z - 0.3 * y) / 0.045 + 0.8 * fbm(Pm * 5, 2, 94))))
    h -= 0.0016 * np.exp(-(wr / 0.22) ** 2) * nk
    wl = np.abs(np.sin(np.pi * (y / 0.018 + 0.6 * fbm(Pm * 9, 2, 95))))
    h -= 0.0008 * np.exp(-(wl / 0.25) ** 2) * (sstep(0.06, 0.0, np.abs(y - 0.45)) + sstep(0.04, 0.0, np.abs(y - 0.16))) * R['low']
    # the nose pad: a fine pebbled pattern of little plates
    f1, f2 = __import__('sdf').worley(Pm * 260, 96)
    h += 0.0004 * sstep(0.0, 0.25, f2 - f1) * R['nose']
    h -= 0.0003 * np.abs(np.sin(y * 500)) * R['hoof']
    return h


def finish(C, ao, valid):
    return U.finish(C, ao, valid, floor=0.45)


MAP_QUALITY = (74, 58)
PAD_SMOOTH = 3


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': U.lid_color(col, R['eyeD'], EYE_R)}


def meta(st):
    r = EYE_R
    up, dn = (LID_OFF + LID_H) / r, (LID_OFF - LID_H) / r
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.3],
                'iris': 0x2A1A10, 'irisR': 0.97, 'pupil': 'h', 'pupilR': 0.45, 'rim': 0x0C0705, 'lidCol': st['lidCol'],
                'lash': {'n': 16, 'len': 0.016, 'col': 0x16120F}},
        'collar': {'at': ['neck', 'neck2', 0.6], 'r': 0.8},
        'mouth': [round(float(v), 4) for v in MOUTH],
        # lying down: the brisket and the belly come to the ground
        'belly': [0.0, 0.62, -0.1],
        'sides': True,
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.06, 0.06, 0.06], 'flat': 0x8A8682,
    }


# ---------- both sides of the coat (SIDES) ----------
def extra_maps(X):
    """the color map with the -x side painted too: +x side in the left half, -x side in the right half (the patches
    are not mirrored). texture.py has written the +x side as work/cow-color.png; this paints the other side the same
    way and writes both into it."""
    import os
    from PIL import Image
    Ph, Nh, comps, valid, R, ao, v2, pad, down2 = X['Ph'], X['Nh'], X['comps'], X['valid'], X['R'], X['ao'], X['v2'], X['pad'], X['down2']
    Mx = np.array([-1, 1, 1], F)
    colm, _ = paint(Ph * Mx, Nh * Mx, comps)
    a = np.zeros((R, R, 3), F); a[valid] = colm
    C = finish(down2(pad(a, valid, 24)), ao, v2)
    from scipy import ndimage
    near = ndimage.binary_dilation(v2, iterations=PAD_SMOOTH)
    Bl = np.stack([ndimage.uniform_filter(C[..., k], 33, mode='nearest') for k in range(3)], 2)
    C = np.where(near[..., None], C, Bl)
    im = Image.fromarray(np.clip(C[::-1] * 255 + 0.5, 0, 255).astype(np.uint8))
    p = os.path.join(X['work'], f'{ID}-color.png')
    left = Image.open(p).convert('RGB')
    both = Image.new('RGB', (left.size[0] * 2, left.size[1]))
    both.paste(left, (0, 0)); both.paste(im, (left.size[0], 0))
    both.save(p)
