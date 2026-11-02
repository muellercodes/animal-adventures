# Brachiosaurus altithorax as current reconstructions show it, at about 0.6 of its real size (about 13 m long, the head
# about 7.5 m up), sculpted as a signed distance field around the game's skeleton (tools/blender/work/brachiosaurus-
# rig.json). Units are meters in game rig space (x left, y up, z forward, ground at y = 0).
# Shape: a deep trunk on front legs longer than the hind legs (the back slopes down to the tail), the long neck rising
# steeply like a giraffe's, a small head with the arched crest over the nostrils in front of the eyes and a broad rounded
# snout, a fairly short thick tail held off the ground, pillar legs on elephant-like feet (a horseshoe-shaped front foot
# with a thumb claw on the inside, a long padded hind foot with three claws). Skin (height field per texel): pebbly
# scales, bigger on the back, wrinkles across the neck, rings on the legs. Paint: muted gray-brown with an olive cast,
# darker mottling over the back, a paler belly. The hatchling has its own color map; its shape is the game's baby maps.
# Make it with: VOXEL=0.03 TRIS=5300 TEX=1024 WEIGHTS=transfer BLENDER_PY=... python3 tools/blender/make.py brachiosaurus
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length, axis_steps
import ungulate as U
import bird as BD
from ungulate import local as _local, local_n as _local_n, mirror as _mirror, groove

ID = 'brachiosaurus'
BOUNDS = (V(-1.3, -0.001, -7.95), V(1.3, 7.62, 5.3))
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
BAKE_DIST = (0.05, 0.14, 0.45)

# ---------- landmarks (left side, +x) ----------
XF, XH = 0.76, 0.8
FOOT_F = V(XF, 0.0, 1.36)
FOOT_H = V(XH, 0.0, -1.52)
# head frame: from the back of the skull forward and a little down to the tip of the snout
HO = V(0.0, 7.35, 4.62)
HA = nrm([0.0, -0.42, 0.91])
HU = nrm([0.0, 0.91, 0.42])
HL = 0.66


def hp(s, u, x=0.0):
    return HO + HA * s + HU * u + V(1, 0, 0) * x


def hframe(Q):
    D = Q - HO
    return np.stack([D[:, 0], D @ HU, D @ HA], 1)


EYE_C = hp(0.16, 0.045, 0.128)
EYE_R = 0.03
EYE_DIR = nrm([0.86, 0.12, 0.5])
LID_W, LID_H, LID_OFF = 0.031, 0.021, 0.0
NOS_C = V(0.048, 0.03, 0.54)            # nostril (head frame x, u, s): fleshy, near the front of the snout
MOUTH = hp(0.6, -0.1)

TRUNK = [
    (-2.9, 3.28, 2.85, 2.45, 0.46, 2.0, 2.0),
    (-2.4, 3.38, 2.75, 2.12, 0.68, 2.1, 2.0),
    (-1.8, 3.44, 2.65, 1.9, 0.86, 2.2, 2.0),
    (-1.0, 3.55, 2.58, 1.66, 0.99, 2.3, 2.0),
    (-0.2, 3.72, 2.6, 1.55, 1.05, 2.3, 2.0),
    (0.6, 3.9, 2.68, 1.6, 1.02, 2.3, 2.0),
    (1.2, 4.02, 2.8, 1.8, 0.94, 2.3, 2.1),
    (1.8, 4.04, 3.0, 2.2, 0.8, 2.2, 2.1),
    (2.35, 3.98, 3.3, 2.68, 0.62, 2.0, 2.0),
]
# neck: path (y, z) and section (top: up and back, bottom: the throat, half width)
NECK = [
    (3.05, 1.5, 0.86, 0.86, 0.76, 2.0, 2.0),
    (3.4, 2.1, 0.76, 0.78, 0.64, 2.0, 2.0),
    (3.9, 2.55, 0.6, 0.64, 0.5, 2.0, 2.0),
    (4.4, 2.9, 0.48, 0.52, 0.39, 2.0, 2.0),
    (4.95, 3.27, 0.38, 0.43, 0.31, 2.0, 2.0),
    (5.5, 3.6, 0.31, 0.36, 0.255, 2.0, 2.0),
    (6.05, 3.92, 0.25, 0.3, 0.21, 2.0, 2.0),
    (6.55, 4.2, 0.2, 0.25, 0.17, 2.0, 2.0),
    (6.98, 4.42, 0.16, 0.2, 0.145, 2.0, 2.0),
    (7.33, 4.6, 0.135, 0.16, 0.125, 2.0, 2.0),
]
# head, in the head frame: s (forward), top, yw, bottom (u), half width, exponents
HEAD = [
    (-0.1, 0.1, -0.02, -0.14, 0.14, 2.2, 2.0),
    (0.02, 0.14, -0.02, -0.17, 0.155, 2.3, 2.1),
    (0.14, 0.15, -0.02, -0.18, 0.16, 2.4, 2.2),
    (0.26, 0.12, -0.03, -0.165, 0.142, 2.5, 2.3),
    (0.4, 0.07, -0.04, -0.145, 0.135, 2.6, 2.4),
    (0.52, 0.045, -0.05, -0.13, 0.136, 2.8, 2.5),
    (0.6, 0.022, -0.055, -0.118, 0.122, 2.6, 2.4),
    (0.655, 0.0, -0.06, -0.1, 0.08, 2.2, 2.0),
]
TAIL = [
    (2.95, -2.3, 0.56, 0.6, 0.52, 2.0, 2.0),
    (2.85, -2.9, 0.5, 0.53, 0.43, 2.0, 2.0),
    (2.6, -3.6, 0.39, 0.42, 0.33, 2.0, 2.0),
    (2.3, -4.4, 0.28, 0.31, 0.24, 2.0, 2.0),
    (1.95, -5.2, 0.195, 0.215, 0.165, 2.0, 2.0),
    (1.58, -6.1, 0.125, 0.135, 0.105, 2.0, 2.0),
    (1.3, -6.95, 0.075, 0.08, 0.062, 2.0, 2.0),
    (1.12, -7.85, 0.035, 0.035, 0.03, 2.0, 2.0),
]
# legs: path (y, z), section (front, back, half width), x of the center
FORE = [
    (3.15, 1.35, 0.5, 0.52, 0.42, 2.0, 2.0, 0.6),
    (2.6, 1.3, 0.44, 0.46, 0.39, 2.0, 2.0, 0.68),
    (2.1, 1.2, 0.38, 0.4, 0.34, 2.1, 2.1, 0.73),
    (1.75, 1.15, 0.36, 0.39, 0.33, 2.1, 2.1, 0.75),
    (1.3, 1.2, 0.32, 0.33, 0.295, 2.1, 2.1, 0.76),
    (0.9, 1.26, 0.29, 0.29, 0.275, 2.2, 2.2, 0.76),
    (0.6, 1.3, 0.28, 0.28, 0.27, 2.2, 2.2, 0.76),
    (0.3, 1.34, 0.29, 0.28, 0.285, 2.3, 2.3, 0.76),
]
HIND = [
    (2.95, -1.7, 0.66, 0.66, 0.48, 2.0, 2.0, 0.55),
    (2.35, -1.62, 0.6, 0.58, 0.45, 2.0, 2.0, 0.68),
    (1.9, -1.52, 0.48, 0.48, 0.4, 2.1, 2.1, 0.74),
    (1.5, -1.45, 0.41, 0.43, 0.36, 2.1, 2.1, 0.76),
    (1.1, -1.52, 0.35, 0.37, 0.32, 2.1, 2.1, 0.77),
    (0.75, -1.64, 0.32, 0.34, 0.3, 2.2, 2.2, 0.78),
    (0.5, -1.7, 0.32, 0.34, 0.31, 2.2, 2.2, 0.78),
    (0.28, -1.66, 0.35, 0.35, 0.33, 2.3, 2.3, 0.79),
]
TK = np.asarray(TRUNK, F)


def trunk(P):
    Q = _mirror(P)
    d = loft(Q, TRUNK)
    # the shoulder (the long shoulder blade sloping down and forward over the ribs) and the hips over the thighs
    d = smin(d, ellipsoid(Q, V(0.62, 3.2, 1.3), V(0.36, 0.66, 0.52)), 0.32)
    d = smin(d, ellipsoid(Q, V(0.6, 2.75, -1.65), V(0.42, 0.66, 0.66)), 0.34)
    return d


def neck(P):
    Q = _mirror(P)
    return sweep(Q, NECK, n=64)


def head(P):
    Q = _mirror(P)
    L = hframe(Q)
    x, u, s = L[:, 0], L[:, 1], L[:, 2]
    d = loft(L, HEAD)
    # the arched crest: a tall rounded dome over the nostril openings, rising in front of the eyes
    d = smin(d, superellipsoid(L, V(0.0, 0.14, 0.27), (0.085, 0.115, 0.13), 2.2, rb=0.12), 0.07)
    # the openings of the bony nostrils on the front of the arch: shallow hollows facing up and forward
    d = d + 0.012 * np.exp(-(((np.abs(x) - 0.05) / 0.03) ** 2 + ((u - 0.17) / 0.04) ** 2 + ((s - 0.37) / 0.05) ** 2))
    # cheeks and jaw muscles behind the eye, the brow over it
    d = smin(d, ellipsoid(L, V(0.11, -0.07, 0.06), V(0.06, 0.08, 0.1)), 0.05)
    d = smin(d, ellipsoid(L, V(0.1, 0.1, 0.15), V(0.05, 0.03, 0.06)), 0.03)
    # the mouth: a lip line along the jaw (straight, no smile), round the front of the snout
    jaw = u + 0.068 + 0.02 * sstep(0.35, 0.65, s)
    lip = np.exp(-(jaw / 0.007) ** 2) * sstep(0.17, 0.23, s)
    d = d + 0.008 * lip
    # the lower jaw a little narrower than the upper (the upper lip overhangs)
    d = d + 0.006 * sstep(0.002, -0.02, jaw) * sstep(0.2, 0.3, s) * sstep(0.08, 0.13, np.abs(x))
    # the fleshy nostril near the front of the snout
    d = smax(d, -ellipsoid(L, NOS_C, V(0.014, 0.006, 0.02)), 0.006)
    return d


def eye_parts(P):
    Q = _mirror(P)
    return U.eye_parts(Q, EYE_C, EYE_R, EYE_DIR, LID_W, LID_H, LID_OFF, mound=(0.016, 0.014, 0.006),
                       brow=((-0.05, 0.042, -0.03), (0.022, 0.05, -0.02), 0.016, 0.011))


def fleg(P):
    Q = _mirror(P)
    d = sweep(Q, FORE, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(XF - 0.02, 1.78, 1.02), V(0.2, 0.2, 0.16)), 0.12)      # point of the elbow
    return d


def hleg(P):
    Q = _mirror(P)
    d = sweep(Q, HIND, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(XH + 0.02, 1.52, -1.32), V(0.2, 0.18, 0.16)), 0.12)    # knee
    return d


def manus(Q):
    """the front foot: a column of upright toes in a horseshoe, open at the back, on a thin pad; a big curved thumb
    claw on the inside front"""
    c = FOOT_F
    x, y, z = Q[:, 0] - c[0], Q[:, 1], Q[:, 2] - c[2]
    r = np.sqrt((x / 0.32) ** 2 + ((z - 0.01) / 0.3) ** 2)
    rad = 1.0 + 0.05 * sstep(0.1, 0.0, y)
    d = (r - rad) * 0.3
    d = smax(d, smax(-y + 0.002, y - 0.5, 0.03), 0.04)
    # the hollow at the back between the arms of the horseshoe
    d = smax(d, -ellipsoid(Q, c + V(0.0, 0.2, -0.33), V(0.15, 0.4, 0.12)), 0.06)
    # the toes: low rounded columns round the front
    ang = np.arctan2(x, z)
    d = d - 0.012 * sstep(0.35, 0.0, y) * (0.5 + 0.5 * np.cos(ang * 7.0)) * sstep(1.9, 1.2, np.abs(ang))
    claw = round_cone(Q, c + V(-0.22, 0.2, 0.2), c + V(-0.3, 0.14, 0.31), 0.075, 0.05)
    claw = smin(claw, round_cone(Q, c + V(-0.3, 0.14, 0.31), c + V(-0.33, 0.03, 0.37), 0.05, 0.01), 0.015)
    return d, claw


def pes(Q):
    """the hind foot: a long rounded pad (elephant-like, longer forward), three claws on the inner toes turned out"""
    c = FOOT_H
    x, y, z = Q[:, 0] - c[0], Q[:, 1], Q[:, 2] - c[2]
    zz = np.where(z > 0, z / 0.48, z / 0.37)
    r = np.sqrt((x / 0.37) ** 2 + zz ** 2)
    top = 0.4 - 0.22 * sstep(0.0, 0.42, z)
    d = (r - 1.0 - 0.06 * sstep(0.1, 0.0, y)) * 0.3
    d = smax(d, smax(-y + 0.002, y - top, 0.06), 0.05)
    claws = None
    for a, L, r0 in ((-38, 0.21, 0.062), (-12, 0.19, 0.058), (14, 0.15, 0.052)):
        ar = np.radians(a)
        b = c + V(np.sin(ar) * 0.3, 0.13, 0.08 + np.cos(ar) * 0.37)
        ao = np.radians(a + 30)
        dv = nrm([np.sin(ao), -0.35, np.cos(ao)])
        m = b + dv * L * 0.6
        e = smin(round_cone(Q, b, m, r0, r0 * 0.7), round_cone(Q, m, m + dv * L * 0.5 + V(0, -0.06, 0), r0 * 0.7, 0.008), 0.01)
        claws = e if claws is None else np.minimum(claws, e)
        d = smin(d, ellipsoid(Q, b + V(0, -0.04, -0.03), V(0.09, 0.08, 0.1)), 0.05)
    return d, claws


def feet(P):
    Q = _mirror(P)
    df, cf = manus(Q)
    dh, ch = pes(Q)
    return np.minimum(df, dh), np.minimum(cf, ch)


def tail(P):
    Q = _mirror(P)
    return sweep(Q, TAIL, n=48)


HEAD_BOX = (V(-0.3, 6.8, 4.35), V(0.3, 7.6, 5.3))
EYE_BOX = (EYE_C * V(-1, 1, 1) - V(0.09, 0.09, 0.09), EYE_C + V(0.09, 0.09, 0.09))
NECK_BOX = (V(-0.9, 2.2, 1.1), V(0.9, 7.6, 4.85))
FL_BOX = (V(-1.15, -0.1, 0.75), V(1.15, 3.7, 1.9))
HL_BOX = (V(-1.25, -0.1, -2.45), V(1.25, 3.65, -0.9))
FOOT_BOX = (V(-1.2, -0.1, -2.05), V(1.2, 0.62, 1.85))
TAIL_BOX = (V(-0.7, 0.9, -7.95), V(0.7, 3.6, -1.9))


def parts(P):
    so, li, ba, br = eye_parts(P)
    ft, cl = _local_n(P, *FOOT_BOX, feet, 2)
    return {'trunk': trunk(P), 'neck': _local(P, *NECK_BOX, neck), 'head': _local(P, *HEAD_BOX, head), 'lids': li, 'ball': ba, 'brow': br,
            'fleg': _local(P, *FL_BOX, fleg), 'hleg': _local(P, *HL_BOX, hleg), 'foot': ft, 'claw': cl, 'tail': _local(P, *TAIL_BOX, tail)}


def shape(P):
    d = trunk(P)
    d = smin(d, _local(P, *NECK_BOX, neck), 0.35)
    h = _local(P, *HEAD_BOX, head)
    ca, li, ba, br = _local_n(P, *EYE_BOX, eye_parts, 4)
    h = smin(h, li, 0.02)
    h = smin(h, br, 0.025)
    h = smax(h, -ca, 0.006)
    h = smin(h, ba, 0.003)
    d = smin(d, h, 0.12)
    d = smin(d, _local(P, *TAIL_BOX, tail), 0.3)
    d = smin(d, _local(P, *FL_BOX, fleg), 0.22)
    d = smin(d, _local(P, *HL_BOX, hleg), 0.26)
    ft, cl = _local_n(P, *FOOT_BOX, feet, 2)
    d = smin(d, ft, 0.12)
    d = smin(d, cl, 0.02)
    return d


def grid(h):
    """finer around the head (the eye, the lips, the nostrils) and the feet (the claws), coarse elsewhere"""
    lo, hi = BOUNDS
    xs = axis_steps(0.0, hi[0], [(0.0, 0.2, h * 0.3), (0.45, 1.15, h * 0.7)], h)
    ys = axis_steps(lo[1], hi[1], [(lo[1], 0.5, h * 0.5), (6.75, hi[1], h * 0.3)], h)
    zs = axis_steps(lo[2], hi[2], [(-2.1, -0.95, h * 0.6), (0.8, 1.9, h * 0.6), (4.3, hi[2], h * 0.3)], h)
    return xs, ys, zs


# fine bake-only meshes over small features (box lo, box hi on the +x side, voxel size)
PATCHES = [
    (EYE_C * V(0, 1, 1) + V(0.04, -0.1, -0.1), EYE_C * V(0, 1, 1) + V(0.22, 0.1, 0.1), 0.004),     # eye and lids
    (V(0.0, 6.85, 4.85), V(0.2, 7.55, 5.3), 0.006),                                                 # arch, snout, lips
    (V(0.4, -0.001, 1.0), V(1.12, 0.45, 1.85), 0.01),                                               # front foot, claw
    (V(0.38, -0.001, -2.0), V(1.22, 0.45, -1.0), 0.01),                                             # hind foot, claws
]

PREVIEW = {
    'side': ((24.0, 4.0, -1.0), (0, 3.6, -1.0), 34),
    'front3q': ((12.0, 7.0, 13.0), (0, 3.6, 0.0), 34),
    'rear3q': ((-12.0, 7.5, -14.0), (0, 3.4, -1.0), 34),
    'front': ((0.0, 4.5, 20.0), (0, 3.8, 0.0), 30),
    'head': ((1.6, 7.6, 6.2), (0, 7.2, 4.95), 24),
    'headside': ((2.6, 7.3, 4.95), (0, 7.2, 4.95), 22),
    'feet': ((4.0, 1.2, 4.0), (0.8, 0.4, 0.0), 34),
    'hindfoot': ((2.4, 0.9, -0.1), (0.8, 0.25, -1.5), 26),
}


# ---------- the game mesh ----------
def keep(P):
    Pm = _mirror(P)
    e = sstep(0.12, 0.06, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.85
    L = hframe(Pm)
    hd = sstep(-0.05, 0.05, L[:, 2]) * sstep(6.8, 6.95, Pm[:, 1]) * 0.95
    ft = sstep(0.3, 0.15, Pm[:, 1]) * 0.55
    base = np.full(len(P), 0.36, F)
    return np.maximum.reduce([base, e, hd, ft]).astype(F)


# where the game mesh has to bend: (from, to, pitch, reach)
BEND = [
    (V(0.0, 1.2, -7.7), V(0.0, 2.95, -2.4), 0.45, 0.7),        # tail
    (V(0.0, 3.3, 2.0), V(0.0, 7.2, 4.55), 0.38, 0.85),         # neck
    (V(XF, 3.0, 1.3), V(XF, 1.75, 1.15), 0.3, 0.5),            # upper arm
    (V(XF, 1.75, 1.15), V(XF, 0.6, 1.3), 0.3, 0.4),            # forearm
    (V(XH, 2.8, -1.68), V(XH, 1.5, -1.45), 0.3, 0.6),          # thigh
    (V(XH, 1.5, -1.45), V(XH, 0.5, -1.72), 0.3, 0.42),         # shin
]


def lowpoly_fix(bm, hi):
    import meshfix as MF
    tr = MF.tree(hi)
    for a, b, pitch, reach in BEND:
        if a[0] == 0 and b[0] == 0:
            ok = lambda c, p0, r, reach=reach: r < reach and abs(c.x) < 0.95
        else:
            ok = lambda c, p0, r, reach=reach: r < reach and abs(c.x) > 0.3
        MF.rings(bm, tr, a, b, pitch, ok)
    MF.finish(bm, 1e-5)


UV_AVERAGE = True
UV_PACK = dict(margin_method='FRACTION', margin=0.005)


def _own(c):
    keys = ['trunk', 'neck', 'head', 'tail', 'fleg', 'hleg', 'foot']
    D = np.stack([c[k] for k in keys], 1)
    o = np.argmin(D, 1)
    return {k: o == i for i, k in enumerate(keys)}


def uv_regions(P):
    """head, neck (two), trunk, tail (two), front legs, hind legs, feet"""
    Pm = _mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 3)
    L = hframe(Pm)
    neck = (z > 1.9) & (y > 3.0) | (y > 4.2)
    lab[neck] = 2
    lab[neck & (y > 5.4)] = 1
    lab[(L[:, 2] > -0.06) & (y > 6.7)] = 0
    lab[z < -2.75] = 4
    lab[z < -4.8] = 5
    fl = (x > 0.4) & (y < 2.45) & (z > 0.4)
    hl = (x > 0.38) & (y < 2.3) & (z < -0.6) & (z > -2.4)
    lab[fl] = 6
    lab[hl] = 7
    lab[(y < 0.5) & (x > 0.35) & (np.abs(z) > 0.9)] = 8
    return lab


def uv_weight(P):
    Pm = _mirror(P)
    L = hframe(Pm)
    head = sstep(-0.1, 0.0, L[:, 2]) * sstep(6.7, 6.85, Pm[:, 1])
    foot = sstep(0.5, 0.3, Pm[:, 1])
    under = sstep(2.3, 2.0, Pm[:, 1]) * sstep(0.3, 0.1, Pm[:, 0]) * sstep(-2.6, -2.0, Pm[:, 2]) * sstep(2.0, 1.6, Pm[:, 2])
    return (1.0 + 2.2 * head + 0.3 * foot - 0.3 * under).astype(F)


WEIGHT_SMOOTH = (4, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['neck2'], 'neck2': P['neck3'], 'neck3': P['neck4'], 'neck4': P['head'],
         'head': hp(HL, -0.03), 'tail1': P['tail2'], 'tail2': P['tail3'], 'tail3': P['tail4'], 'tail4': V(0, 1.12, -7.85)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT_H + V(0, 0.01, 0.4)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (FOOT_F + V(0, 0.02, 0.3)) * m
    return t


# the spine as a chain of bones along a path through their pivots (tail tip to snout): every body vertex gets a
# continuous coordinate u along it (bone i owns u in [i, i + 1])
SPINE = ['tail4', 'tail3', 'tail2', 'tail1', 'hips', 'chest', 'neck', 'neck2', 'neck3', 'neck4', 'head']
SPATH = [(1.12, -7.85), (1.55, -6.3), (2.0, -5.1), (2.45, -3.9), (2.85, -2.7), (2.8, -0.25), (3.35, 2.1), (4.4, 2.9), (5.5, 3.6), (6.55, 4.2),
         (7.35, 4.62), (7.07, 5.22)]


NECK_A = np.array([3.35, 2.1], F)
NECK_D = np.array([4.0, 2.52], F) / np.hypot(4.0, 2.52)
NECK_T = [float((np.array(p, F) - NECK_A) @ NECK_D) for p in SPATH[6:11]]


def _spine_u(Q, own):
    """tail and trunk by z, the neck by its position along the (nearly straight) line from the neck's pivot to the
    head's, so the coordinate never jumps from one bone to a far one"""
    y, z = Q[:, 1], Q[:, 2]
    u = np.interp(z, [-7.85, -6.3, -5.1, -3.9, -2.7, -0.25, 2.1], [0, 1, 2, 3, 4, 5, 6]).astype(F)
    t = (y - NECK_A[0]) * NECK_D[0] + (z - NECK_A[1]) * NECK_D[1]
    un = np.interp(t, NECK_T + [NECK_T[-1] + 0.8], [6, 7, 8, 9, 10, 11]).astype(F)
    u = np.where(own['neck'] | own['head'], un, u)
    u = np.where(own['head'], np.maximum(u, 10.0), u)
    return u


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    P = wpos.astype(F)
    Q = _mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    side = np.where(P[:, 0] >= 0, 'L', 'R')
    own = _own(parts(P))
    leg = own['fleg'] | own['hleg'] | own['foot'] | ((y < 0.6) & (x > 0.3))
    # body: one smooth chain along the spine path
    Wn = np.zeros_like(W)
    u = _spine_u(Q, own)
    for nm, w in BD.blend_chain(u, SPINE, 0.45):
        Wn[:, bi[nm]] += w * (~leg)
    # legs: along the leg by height, blending into the girdle at the top (front: chest, hind: hips)
    front = z > 0.0
    for s in 'LR':
        ms = leg & (side == s)
        for fr, bones, ys, gird in ((True, ['arm', 'fore', 'fmeta', 'fpaw'], [0.0, 0.25, 0.65, 1.75, 2.95], 'chest'),
                                    (False, ['thigh', 'shin', 'hmeta', 'hpaw'], [0.0, 0.25, 0.5, 1.5, 2.65], 'hips')):
            m = ms & (front == fr)
            if not m.any():
                continue
            ul = 4.0 - np.interp(y[m], ys, [0.0, 1.0, 2.0, 3.0, 4.0]).astype(F)     # 0 at the top (hip/shoulder) to 4 at the sole
            g = sstep(0.25, -0.25, ul) * 0.8                                        # the top of the leg into the body
            for nm, w in BD.blend_chain(ul, bones, 0.2):
                Wn[m, bi[nm + s]] += w * (1 - g)
            Wn[m, bi[gird]] += g
    Wn[:, bi['ctag']] = 0
    return Wn / np.maximum(Wn.sum(1, keepdims=True), 1e-9)


# ---------- skin paint (sRGB 0..1) and fine detail (meters) ----------
hx = U.hexc
K = {
    'skin': hx(0x736B59), 'top': hx(0x5F5B44), 'dk': hx(0x4C4838), 'belly': hx(0xA69D87), 'lt': hx(0x948B76), 'claw': hx(0x3A342C),
    'clawHi': hx(0x6A6152), 'lip': hx(0x6E6656), 'nose': hx(0x3E3A32), 'ball': hx(0x120C08), 'lid': hx(0x5A5444),
    'babyA': hx(0x837965), 'babyB': hx(0x564E3E), 'babyBelly': hx(0xAAA18B),
}


def _regions(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    r = {}
    Pm = _mirror(P)
    r['Pm'] = Pm
    r['claw'] = sstep(0.008, 0.001, c['claw'])
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    r['eyeD'] = de
    r['ball'] = sstep(0.002, 0.0006, c['ball']) * sstep(EYE_R + 0.005, EYE_R + 0.0015, de)
    r['lid'] = sstep(EYE_R + 0.014, EYE_R + 0.005, de) * (1 - r['ball'])
    L = hframe(Pm)
    r['L'] = L
    r['head'] = sstep(-0.12, 0.0, L[:, 2]) * sstep(6.7, 6.9, y)
    jaw = L[:, 1] + 0.068 + 0.02 * sstep(0.35, 0.65, L[:, 2])
    r['lips'] = sstep(0.025, 0.006, np.abs(jaw)) * sstep(0.17, 0.23, L[:, 2]) * r['head']
    r['nos'] = sstep(0.04, 0.018, np.linalg.norm((L - NOS_C) * V(1, 1.5, 1), axis=1)) * r['head']
    r['leg'] = sstep(2.0, 1.5, y) * (1 - sstep(0.5, 0.9, -N[:, 1]))
    r['foot'] = sstep(0.5, 0.25, y)
    r['belly'] = sstep(-0.2, -0.75, N[:, 1]) * sstep(2.9, 2.4, y)
    r['top'] = sstep(0.15, 0.85, N[:, 1])
    r['neck'] = sstep(1.9, 2.4, z) * sstep(3.3, 3.8, y) * (1 - r['head'])
    return r


def _hide(Pm):
    """pebbly scales (small round ones, bigger plates over the back), the grooves between them, and long wrinkles"""
    f1, f2 = worley(Pm / 0.035, 51)
    peb = sstep(0.0, 0.18, f2 - f1)
    g1, g2 = worley(Pm / 0.09, 52)
    plate = sstep(0.0, 0.12, g2 - g1)
    wr = 1 - np.abs(2 * vnoise(Pm * V(3, 14, 3), 53) - 1)
    return peb, plate, sstep(0.8, 0.98, wr)


def paint(P, N, c, baby=False):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    R = _regions(P, N, c)
    Pm = R['Pm']
    n1 = fbm(Pm * 0.7, 3, 11)
    n2 = fbm(Pm * 3.0, 3, 12)
    n3 = fbm(Pm * 9.0, 2, 13)
    peb, plate, wr = _hide(Pm)
    if baby:
        col = np.tile(K['babyA'], (len(P), 1))
        col = U.mix(col, K['babyBelly'], R['belly'] * 0.8)
        # bold dark blotches over the back and the flanks, fading on the belly
        bl = sstep(0.52, 0.66, fbm(Pm * V(2.2, 2.2, 1.4), 3, 21)) * sstep(-0.3, 0.3, N[:, 1])
        col = U.mix(col, K['babyB'], bl * 0.75)
        col *= (0.94 + 0.08 * n3 - 0.06 * (1 - peb))[:, None]
    else:
        col = np.tile(K['skin'], (len(P), 1))
        # countershading: darker, more olive on top, paler below
        col = U.mix(col, K['top'], R['top'] * 0.55)
        col = U.mix(col, K['belly'], R['belly'] * 0.75)
        # muted mottling: big soft darker patches along the back and the neck, smaller flecks on the flanks
        col = U.mix(col, K['dk'], sstep(0.5, 0.7, n1) * sstep(-0.3, 0.4, N[:, 1]) * 0.45)
        col = U.mix(col, K['dk'], sstep(0.6, 0.75, n2) * sstep(-0.1, 0.3, N[:, 1]) * 0.25 * (1 - R['belly']))
        col = U.mix(col, K['lt'], sstep(0.62, 0.8, fbm(Pm * 1.6, 3, 14)) * 0.2)
        # dusty lower legs, darker feet
        col = U.mix(col, K['lt'], R['leg'] * 0.25)
        col = U.mix(col, K['dk'], R['foot'] * 0.35)
        # each scale a little different, the grooves between them dark
        col *= (0.92 + 0.1 * n3 - 0.09 * (1 - peb) * (1 - R['head']) - 0.06 * (1 - plate) * R['top'] * (1 - R['head']) - 0.06 * wr)[:, None]
    col = U.mix(col, K['lid'], R['lid'] * 0.7)
    col = U.mix(col, K['lip'], R['lips'] * 0.5)
    col = U.mix(col, K['nose'], R['nos'] * 0.35)
    cc = U.mix(np.tile(K['claw'], (len(P), 1)), K['clawHi'], sstep(0.4, 0.8, vnoise(Pm * V(60, 8, 60), 15)) * 0.4)
    col = U.mix(col, cc, R['claw'])
    col = U.mix(col, K['ball'], R['ball'])
    rough = 0.84 + 0.06 * (n3 - 0.5) - 0.25 * R['claw'] - 0.3 * R['lid'] * sstep(EYE_R + 0.01, EYE_R + 0.004, R['eyeD']) - 0.1 * R['lips']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.96).astype(F)


def paint_baby(P, N, c):
    return paint(P, N, c, baby=True)


def detail(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    skin = (1 - R['claw']) * (1 - R['ball'])
    peb, plate, wr = _hide(Pm)
    h = np.zeros(len(P), F)
    # domed scales: small ones everywhere (finer on the head), bigger plates over the back and the top of the tail
    hp1, hp2 = worley(Pm / 0.012, 57)
    hpeb = sstep(0.0, 0.18, hp2 - hp1)
    h += 0.0035 * peb * skin * (1 - R['head']) + 0.0016 * hpeb * R['head'] * skin
    h += 0.004 * plate * R['top'] * (1 - R['head']) * skin
    # long shallow wrinkles everywhere, deeper creases across the neck (strongest at its base and its throat)
    h -= 0.004 * wr * skin
    nk = np.abs(np.sin(np.pi * ((Pm[:, 2] - 0.55 * Pm[:, 1]) / 0.11 + 0.8 * fbm(Pm * 2.5, 2, 54))))
    h -= 0.006 * np.exp(-(nk / 0.22) ** 2) * R['neck'] * (0.5 + 0.5 * sstep(4.6, 3.6, y) + 0.5 * R['belly']) * skin
    # rings round the legs (elephant-like), crowded over the wrist and the ankle
    yr = np.abs(np.sin(np.pi * (y / 0.07 + 0.7 * fbm(Pm * 4, 2, 55))))
    h -= 0.005 * np.exp(-(yr / 0.25) ** 2) * R['leg'] * (0.6 + 0.6 * sstep(1.0, 0.5, y)) * skin
    # wrinkles round the eye, fine pebbled skin on the snout
    er = np.abs(np.sin(np.pi * (R['eyeD'] / 0.012 + 0.8 * fbm(Pm * 30, 2, 56))))
    h -= 0.0012 * np.exp(-(er / 0.3) ** 2) * sstep(EYE_R + 0.008, EYE_R + 0.02, R['eyeD']) * sstep(0.13, 0.08, R['eyeD'])
    # claws: growth lines
    h -= 0.0006 * np.abs(np.sin(y * 160)) * R['claw']
    return h


def finish(C, ao, valid):
    return U.finish(C, ao, valid, floor=0.42)


MAP_QUALITY = (68, 50)
PAD_SMOOTH = 3
BABY_MAP = (384, 64)


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': U.lid_color(col, R['eyeD'], EYE_R)}


def meta(st):
    r = EYE_R
    up, dn = (LID_OFF + LID_H) / r, (LID_OFF - LID_H) / r
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.3],
                'iris': 0x6A4A22, 'irisR': 0.94, 'pupilR': 0.42, 'rim': 0x1A120A, 'lidCol': st['lidCol']},
        'collar': {'at': ['neck4', 'head', 0.3], 'r': 1.2},
        'mouth': [round(float(v), 4) for v in MOUTH],
        # lying down: the deepest part of the belly (just behind the front legs) comes to the ground
        'belly': [0.0, 1.58, -1.7],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.07, 0.07, 0.06], 'flat': 0x7C7462,
    }
