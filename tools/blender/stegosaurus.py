# round 17: Stegosaurus stenops, about 9.5 m long, sculpted as a signed distance field around the game's skeleton
# (tools/blender/work/stegosaurus-rig.json). Units are meters in game rig space (x left, y up, z forward, ground at
# y = 0). Laid out like triceratops.py (the trunk loft, sweeps for the neck, the legs and the tail, the head in its own
# frame).
# Shape: a deep, fairly narrow body with the back arching high over the hips and sloping steeply down to the shoulders,
# a short neck and a small, long, low head held near the ground (a toothless beak at the front, the eye high on the
# side, a small nostril), short front legs on broad five-fingered feet, long pillar-like hind legs on three hoofed toes,
# a long tail held off the ground ending in two pairs of long spikes (the thagomizer). The plates are not in the
# sculpt: they alternate left and right, and a sculpt is one mirrored half (the game's SPEC.stegosaurus.modelAccent
# builds them on the spine bones).
# Skin (height field per texel): small rounded scales with bigger ones in rows over the back and the flanks, wrinkles
# round the legs and across the neck, bony studs under the throat. Paint: an olive-brown back, paler olive flanks with
# faint darker stripes down them, a pale belly and throat, a dark beak, pale spikes darkening at their bases.
# The hatchling: the game's baby maps with its own size, its own paler color map; its plates are buds (in the game).
# Make it with: VOXEL=0.026 TRIS=6000 TEX=1024 WEIGHTS=transfer BLENDER_PY=... python3 tools/blender/make.py stegosaurus
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length, axis_steps
import ungulate as U
import bird as BD
from ungulate import local as _local, local_n as _local_n, mirror as _mirror

ID = 'stegosaurus'
BOUNDS = (V(-1.2, -0.001, -5.6), V(1.2, 3.1, 4.15))
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
BAKE_DIST = (0.04, 0.12, 0.4)

# ---------- landmarks (left side, +x) ----------
XF, XH = 0.6, 0.6
FOOT_F = V(XF, 0.0, 1.42)
FOOT_H = V(XH, 0.0, -0.6)
# head frame: from the back of the skull forward and down to the tip of the beak
HO = V(0.0, 1.03, 3.4)
HA = nrm([0.0, -0.45, 0.893])
HU = nrm([0.0, 0.893, 0.45])
HL = 0.71


def hp(s, u, x=0.0):
    return HO + HA * s + HU * u + V(1, 0, 0) * x


def hframe(Q):
    D = Q - HO
    return np.stack([D[:, 0], D @ HU, D @ HA], 1)


HEAD = [
    (-0.1, 0.1, -0.02, -0.12, 0.1, 2.0, 2.0),
    (0.04, 0.145, -0.02, -0.17, 0.135, 2.1, 2.1),
    (0.18, 0.15, -0.02, -0.17, 0.13, 2.2, 2.2),
    (0.34, 0.12, -0.025, -0.145, 0.1, 2.3, 2.2),
    (0.5, 0.085, -0.03, -0.12, 0.076, 2.3, 2.1),
    (0.62, 0.05, -0.035, -0.095, 0.052, 2.1, 2.0),
    (0.7, 0.014, -0.04, -0.072, 0.026, 2.0, 2.0),
]
EYE_S, EYE_U = 0.17, 0.055
EYE_R = 0.024
EYE_DIR = nrm([0.9, 0.18, 0.4])
LID_W, LID_H, LID_OFF = 0.024, 0.017, 0.001
MOUTH = hp(0.67, -0.07)


def _seat(s, u, r, out=0.35):
    a, b = 0.0, 0.4
    for _ in range(40):
        m = 0.5 * (a + b)
        d = float(loft(np.array([[m, u, s]], F), HEAD)[0])
        a, b = (m, b) if d < 0 else (a, m)
    return hp(s, u, a - r * (1 - out))


EYE_C = _seat(EYE_S, EYE_U, EYE_R)
EYE_HF = hframe(EYE_C[None])[0]

TRUNK = [
    (-2.05, 2.62, 2.42, 2.2, 0.22, 2.0, 2.0),
    (-1.75, 2.86, 2.38, 1.85, 0.52, 2.0, 2.0),
    (-1.5, 2.96, 2.32, 1.62, 0.64, 2.1, 2.0),
    (-0.9, 3.02, 2.15, 1.22, 0.78, 2.2, 2.0),
    (-0.2, 2.92, 1.95, 0.98, 0.86, 2.3, 2.0),
    (0.5, 2.64, 1.75, 0.94, 0.83, 2.3, 2.0),
    (1.1, 2.3, 1.55, 0.95, 0.71, 2.2, 2.0),
    (1.55, 2.02, 1.48, 1.02, 0.52, 2.1, 2.0),
    (1.95, 1.72, 1.44, 1.18, 0.26, 2.0, 2.0),
]
NECK = [
    (1.7, 1.25, 0.32, 0.42, 0.4, 2.0, 2.0),
    (1.62, 1.85, 0.36, 0.42, 0.37, 2.0, 2.0),
    (1.42, 2.35, 0.25, 0.28, 0.24, 2.0, 2.0),
    (1.24, 2.9, 0.15, 0.18, 0.14, 2.0, 2.0),
    (1.1, 3.3, 0.11, 0.13, 0.1, 2.0, 2.0),
]
TAIL = [
    (2.35, -1.0, 0.25, 0.35, 0.34, 2.0, 2.0),
    (2.44, -1.85, 0.4, 0.47, 0.42, 2.0, 2.0),
    (2.38, -2.5, 0.33, 0.37, 0.33, 2.0, 2.0),
    (2.28, -3.1, 0.26, 0.28, 0.25, 2.0, 2.0),
    (2.08, -3.7, 0.19, 0.2, 0.18, 2.0, 2.0),
    (1.86, -4.3, 0.13, 0.14, 0.12, 2.0, 2.0),
    (1.66, -4.82, 0.09, 0.095, 0.085, 2.0, 2.0),
    (1.5, -5.25, 0.055, 0.06, 0.05, 2.0, 2.0),
    (1.42, -5.48, 0.025, 0.025, 0.022, 2.0, 2.0),
]
# the thagomizer: two pairs of long spikes near the end of the tail, pointing out, up and back
SPIKES = [
    ([V(0.05, 1.74, -4.72), V(0.25, 1.98, -4.88), V(0.44, 2.17, -5.08), V(0.56, 2.28, -5.24)], [0.075, 0.055, 0.03, 0.006]),
    ([V(0.04, 1.6, -5.08), V(0.24, 1.76, -5.28), V(0.42, 1.88, -5.5), V(0.52, 1.93, -5.66)], [0.07, 0.05, 0.028, 0.006]),
]
FORE = [
    (1.45, 1.38, 0.34, 0.36, 0.3, 2.0, 2.0, 0.5),
    (1.1, 1.3, 0.26, 0.28, 0.24, 2.0, 2.0, 0.58),
    (0.78, 1.22, 0.2, 0.22, 0.19, 2.1, 2.1, 0.63),
    (0.5, 1.3, 0.16, 0.17, 0.155, 2.1, 2.1, 0.61),
    (0.28, 1.37, 0.15, 0.15, 0.15, 2.2, 2.2, 0.6),
    (0.12, 1.41, 0.17, 0.16, 0.17, 2.3, 2.3, 0.6),
]
HIND = [
    (2.4, -0.62, 0.52, 0.52, 0.4, 2.0, 2.0, 0.46),
    (1.75, -0.45, 0.44, 0.42, 0.34, 2.0, 2.0, 0.56),
    (1.2, -0.32, 0.28, 0.3, 0.24, 2.1, 2.1, 0.6),
    (0.85, -0.52, 0.21, 0.24, 0.2, 2.1, 2.1, 0.6),
    (0.45, -0.72, 0.18, 0.21, 0.18, 2.2, 2.2, 0.6),
    (0.18, -0.64, 0.2, 0.2, 0.2, 2.3, 2.3, 0.6),
]


def trunk(P):
    Q = _mirror(P)
    d = loft(Q, TRUNK)
    # the hips over the thighs and the shoulders over the front legs
    d = smin(d, ellipsoid(Q, V(0.5, 2.4, -0.62), V(0.34, 0.6, 0.6)), 0.3)
    d = smin(d, ellipsoid(Q, V(0.46, 1.45, 1.3), V(0.28, 0.42, 0.42)), 0.25)
    return d


def neck(P):
    Q = _mirror(P)
    d = sweep(Q, NECK, n=24)
    return d


def head(P):
    Q = _mirror(P)
    L = hframe(Q)
    x, u, s = L[:, 0], L[:, 1], L[:, 2]
    d = loft(L, HEAD)
    # cheeks below and behind the eye, a little ridge over the eye
    d = smin(d, ellipsoid(L, V(0.08, -0.06, 0.12), V(0.05, 0.05, 0.08)), 0.04)
    d = smin(d, ellipsoid(L, V(0.07, 0.085, 0.18), V(0.04, 0.022, 0.05)), 0.025)
    # the toothless beak: the upper beak a little over the lower at the front
    d = smin(d, round_cone(L, V(0.0, 0.0, 0.62), V(0.0, -0.06, 0.71), 0.03, 0.012), 0.02)
    # the mouth: a groove along the jaw, the cheeks over it (an ornithischian's cheeks)
    jaw = u + 0.065 - 0.012 * sstep(0.35, 0.65, s)
    lip = np.exp(-(jaw / 0.006) ** 2) * sstep(0.1, 0.18, s)
    d = d + 0.006 * lip
    # the nostril near the top front of the snout
    no = ((s - 0.6) / 0.03) ** 2 + ((u - 0.02) / 0.02) ** 2
    d = d + 0.008 * np.exp(-no * 1.5) * sstep(0.02, 0.04, np.abs(x))
    # the eye socket
    de = (L - V(float(np.abs(EYE_HF[0])), EYE_HF[1], EYE_HF[2])) / V(0.04, 0.035, 0.045)
    d = d + 0.005 * np.exp(-np.sum(de * de, 1)) * sstep(0.06, 0.09, np.abs(x))
    return d


def eye_parts(P):
    Q = _mirror(P)
    return U.eye_parts(Q, EYE_C, EYE_R, EYE_DIR, LID_W, LID_H, LID_OFF, mound=(0.011, 0.01, 0.004),
                       brow=((-0.03, 0.026, -0.02), (0.015, 0.03, -0.015), 0.013, 0.009))


def spikes(P):
    """the thagomizer's four spikes (fields), and their arc fractions"""
    Q = _mirror(P)
    out, arc = None, None
    for pts, rad in SPIKES:
        h, a = U.horn(Q, pts, rad, flat=0.85, keel=0.05, n=12)
        if out is None:
            out, arc = h, a
        else:
            m = h < out
            out, arc = np.where(m, h, out), np.where(m, a, arc)
    return out, arc


def fleg(P):
    Q = _mirror(P)
    d = sweep(Q, FORE, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(XF + 0.03, 0.8, 1.12), V(0.15, 0.14, 0.12)), 0.08)       # point of the elbow
    d = smin(d, ellipsoid(Q, V(XF, 0.32, 1.34), V(0.17, 0.1, 0.17)), 0.08)              # the wrist
    return d


def hleg(P):
    Q = _mirror(P)
    d = sweep(Q, HIND, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(XH + 0.01, 1.2, -0.2), V(0.17, 0.15, 0.14)), 0.08)       # knee
    d = smin(d, ellipsoid(Q, V(XH, 0.46, -0.74), V(0.19, 0.11, 0.2)), 0.08)             # ankle and heel
    return d


def _hoof(Q, b, dv, L, w, h):
    m = b + dv * L * 0.45
    toe = round_cone(Q, b, m, w * 0.85, w * 0.75)
    e = m + dv * L * 0.55
    hv = superellipsoid(Q, (m + e) * 0.5 + V(0, -h * 0.25, 0), (w, h, L * 0.42), 2.6, ax=dv, up=(0, 1, 0))
    return toe, hv


def manus(Q):
    """the front foot: a short, broad, round pad (elephant-like) with five stubby fingers round its front"""
    c = FOOT_F
    x, y, z = Q[:, 0] - c[0], Q[:, 1], Q[:, 2] - c[2]
    r = np.sqrt((x / 0.19) ** 2 + ((z + 0.01) / 0.18) ** 2)
    d = (r - 1.0) * 0.17
    d = smax(d, smax(-y + 0.002, y - 0.26, 0.03), 0.03)
    hooves = None
    for a, L, w, h in ((-60, 0.12, 0.045, 0.04), (-30, 0.14, 0.05, 0.045), (0, 0.15, 0.052, 0.046), (30, 0.13, 0.048, 0.042), (58, 0.1, 0.04, 0.035)):
        ar = np.radians(a)
        b = c + V(-np.sin(ar) * 0.12, 0.06, 0.06 + np.cos(ar) * 0.09)
        dv = nrm([-np.sin(ar), -0.3, np.cos(ar)])
        toe, hv = _hoof(Q, b, dv, L, w, h)
        d = smin(d, toe, 0.03)
        hooves = hv if hooves is None else np.minimum(hooves, hv)
    return d, hooves


def pes(Q):
    """the hind foot: a broad pad and three short toes with broad blunt hooves"""
    c = FOOT_H
    x, y, z = Q[:, 0] - c[0], Q[:, 1], Q[:, 2] - c[2]
    zz = np.where(z > 0, z / 0.24, z / 0.22)
    r = np.sqrt((x / 0.22) ** 2 + zz ** 2)
    d = (r - 1.0) * 0.2
    d = smax(d, smax(-y + 0.002, y - (0.32 - 0.18 * sstep(0.0, 0.24, z)), 0.04), 0.04)
    hooves = None
    for a, L, w, h in ((-25, 0.24, 0.075, 0.065), (0, 0.27, 0.085, 0.07), (25, 0.23, 0.072, 0.062)):
        ar = np.radians(a)
        b = c + V(-np.sin(ar) * 0.12, 0.08, 0.1 + np.cos(ar) * 0.1)
        dv = nrm([-np.sin(ar), -0.22, np.cos(ar)])
        toe, hv = _hoof(Q, b, dv, L, w, h)
        d = smin(d, toe, 0.04)
        hooves = hv if hooves is None else np.minimum(hooves, hv)
    return d, hooves


def feet(P):
    Q = _mirror(P)
    df, cf = manus(Q)
    dh, ch = pes(Q)
    return np.minimum(df, dh), np.minimum(cf, ch)


def tail(P):
    return sweep(_mirror(P), TAIL, n=72)


HEAD_BOX = (V(-0.35, 0.45, 3.0), V(0.35, 1.4, 4.15))
EYE_BOX = (EYE_C * V(-1, 1, 1) - V(0.07, 0.07, 0.07), EYE_C + V(0.07, 0.07, 0.07))
NECK_BOX = (V(-0.75, 0.6, 0.6), V(0.75, 2.5, 3.65))
FL_BOX = (V(-1.0, -0.1, 0.7), V(1.0, 2.1, 2.0))
HL_BOX = (V(-1.15, -0.1, -1.7), V(1.15, 3.45, 0.4))
FOOT_BOX = (V(-1.0, -0.1, -1.0), V(1.0, 0.4, 1.85))
TAIL_BOX = (V(-0.8, 1.1, -5.6), V(0.8, 3.2, -0.6))
SPIKE_BOX = (V(-0.7, 1.4, -5.75), V(0.7, 2.4, -4.55))


def parts(P):
    so, li, ba, br = eye_parts(P)
    ft, cl = _local_n(P, *FOOT_BOX, feet, 2)
    sp, sa = _local_n(P, *SPIKE_BOX, spikes, 2)
    return {'trunk': trunk(P), 'neck': _local(P, *NECK_BOX, neck), 'head': _local(P, *HEAD_BOX, head), 'lids': li, 'ball': ba, 'brow': br,
            'fleg': _local(P, *FL_BOX, fleg), 'hleg': _local(P, *HL_BOX, hleg), 'foot': ft, 'claw': cl, 'tail': _local(P, *TAIL_BOX, tail),
            'spike': sp}


def shape(P):
    d = trunk(P)
    d = smin(d, _local(P, *NECK_BOX, neck), 0.3)
    h = _local(P, *HEAD_BOX, head)
    ca, li, ba, br = _local_n(P, *EYE_BOX, eye_parts, 4)
    h = smin(h, li, 0.01)
    h = smin(h, br, 0.012)
    h = smax(h, -ca, 0.004)
    h = smin(h, ba, 0.002)
    d = smin(d, h, 0.1)
    t = _local(P, *TAIL_BOX, tail)
    sp, sa = _local_n(P, *SPIKE_BOX, spikes, 2)
    t = smin(t, sp, 0.03)
    d = smin(d, t, 0.14)
    d = smin(d, _local(P, *FL_BOX, fleg), 0.18)
    d = smin(d, _local(P, *HL_BOX, hleg), 0.22)
    ft, cl = _local_n(P, *FOOT_BOX, feet, 2)
    d = smin(d, ft, 0.08)
    d = smin(d, cl, 0.015)
    return d


def grid(h):
    """finer round the small head and the feet, and round the spikes"""
    lo, hi = BOUNDS
    xs = axis_steps(0.0, hi[0], [(0.0, 0.7, h * 0.6)], h)
    ys = axis_steps(lo[1], hi[1], [(lo[1], 0.4, h * 0.5), (0.6, 1.45, h * 0.45)], h)
    zs = axis_steps(lo[2], hi[2], [(-5.75, -4.55, h * 0.5), (-1.0, -0.2, h * 0.6), (1.0, 1.85, h * 0.6), (3.1, hi[2], h * 0.35)], h)
    return xs, ys, zs


PATCHES = [
    (EYE_C * V(0, 1, 1) + V(0.03, -0.07, -0.07), EYE_C * V(0, 1, 1) + V(0.18, 0.07, 0.07), 0.003),   # eye and lids
    (V(0.0, 0.55, 3.75), V(0.12, 1.0, 4.15), 0.005),                                               # beak, nostril
    (V(0.3, -0.001, 1.05), V(0.9, 0.3, 1.8), 0.008),                                                # front foot
    (V(0.3, -0.001, -0.95), V(0.9, 0.36, -0.1), 0.008),                                             # hind foot
]

PREVIEW = {
    'side': ((18.0, 2.0, -0.6), (0, 1.7, -0.6), 34),
    'front3q': ((9.0, 4.0, 10.0), (0, 1.6, 0.0), 34),
    'rear3q': ((-9.0, 4.5, -10.0), (0, 1.7, -1.0), 34),
    'head': ((1.2, 1.3, 5.2), (0, 0.95, 3.7), 24),
    'headside': ((2.4, 1.0, 3.7), (0, 0.95, 3.7), 24),
    'tail': ((3.0, 3.5, -6.5), (0.2, 1.8, -5.0), 30),
}


# ---------- the game mesh ----------
def keep(P):
    Pm = _mirror(P)
    e = sstep(0.08, 0.04, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.85
    L = hframe(Pm)
    hd = sstep(-0.05, 0.05, L[:, 2]) * sstep(3.0, 3.15, Pm[:, 2]) * 0.7
    sk = U.box(Pm, SPIKE_BOX[0] * V(0, 1, 1) + V(0.1, 0, 0), SPIKE_BOX[1]).astype(F) * 0.62
    ft = sstep(0.28, 0.12, Pm[:, 1]) * 0.55
    base = np.full(len(P), 0.33, F)
    return np.maximum.reduce([base, e, hd, sk, ft]).astype(F)


BEND = [
    (V(0.0, 1.45, -5.4), V(0.0, 2.5, -1.8), 0.42, 0.62),       # tail
    (V(0.0, 1.7, 1.8), V(0.0, 1.05, 3.4), 0.3, 0.6),           # neck
    (V(XF, 1.45, 1.38), V(XF, 0.78, 1.22), 0.24, 0.42),        # upper arm
    (V(XF, 0.78, 1.22), V(XF, 0.3, 1.36), 0.22, 0.32),         # forearm
    (V(XH, 2.4, -0.62), V(XH, 1.2, -0.32), 0.3, 0.6),          # thigh
    (V(XH, 1.2, -0.32), V(XH, 0.45, -0.72), 0.25, 0.36),       # shin
]


def lowpoly_fix(bm, hi):
    import meshfix as MF
    tr = MF.tree(hi)
    for a, b, pitch, reach in BEND:
        if a[0] == 0 and b[0] == 0:
            ok = lambda c, p0, r, reach=reach: r < reach and abs(c.x) < 0.9
        else:
            ok = lambda c, p0, r, reach=reach: r < reach and abs(c.x) > 0.25
        MF.rings(bm, tr, a, b, pitch, ok)
    MF.finish(bm, 1e-5)


UV_AVERAGE = True
UV_PACK = dict(margin_method='FRACTION', margin=0.005)


def _own(c):
    keys = ['trunk', 'neck', 'head', 'tail', 'spike', 'fleg', 'hleg', 'foot']
    D = np.stack([c[k] for k in keys], 1)
    o = np.argmin(D, 1)
    return {k: o == i for i, k in enumerate(keys)}


def uv_regions(P):
    """head, neck, trunk, tail (two), spikes, front legs, hind legs, feet"""
    Pm = _mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 2)
    L = hframe(Pm)
    lab[(z > 1.95) & (y < 1.95)] = 1
    lab[(L[:, 2] > -0.06) & (z > 3.0)] = 0
    lab[z < -1.9] = 3
    lab[z < -3.7] = 4
    lab[(z < -4.55) & (x > 0.12)] = 5
    lab[(x > 0.32) & (y < 1.3) & (z > 0.7)] = 6
    lab[(x > 0.3) & (y < 1.7) & (z < 0.2) & (z > -1.2)] = 7
    lab[(y < 0.32) & (x > 0.3) & (np.abs(z) > 0.3)] = 8
    return lab


def uv_weight(P):
    Pm = _mirror(P)
    L = hframe(Pm)
    head = sstep(-0.06, 0.0, L[:, 2]) * sstep(3.0, 3.15, Pm[:, 2])
    foot = sstep(0.36, 0.22, Pm[:, 1])
    under = sstep(1.2, 1.0, Pm[:, 1]) * sstep(0.3, 0.1, Pm[:, 0]) * sstep(-1.0, -0.5, Pm[:, 2]) * sstep(1.4, 0.9, Pm[:, 2])
    return (1.0 + 2.2 * head + 0.3 * foot - 0.3 * under).astype(F)


WEIGHT_SMOOTH = (4, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['neck2'], 'neck2': P['head'], 'head': hp(HL, -0.03),
         'tail1': P['tail2'], 'tail2': P['tail3'], 'tail3': P['tail4'], 'tail4': V(0, 1.42, -5.48)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT_H + V(0, 0.01, 0.3)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (FOOT_F + V(0, 0.02, 0.22)) * m
    return t


SPINE = ['tail4', 'tail3', 'tail2', 'tail1', 'hips', 'chest', 'neck', 'neck2', 'head']
NECK_A = np.array([1.75, 1.3], F)
NECK_D = np.array([1.0 - 1.75, 3.5 - 1.3], F) / np.hypot(1.0 - 1.75, 3.5 - 1.3)
NECK_T = [float((np.array(p, F) - NECK_A) @ NECK_D) for p in [(1.75, 1.3), (1.45, 2.25), (1.2, 2.9), (1.0, 3.5)]]


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    P = wpos.astype(F)
    Q = _mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    side = np.where(P[:, 0] >= 0, 'L', 'R')
    own = _own(parts(P))
    leg = own['fleg'] | own['hleg'] | own['foot'] | ((y < 0.45) & (x > 0.25))
    Wn = np.zeros_like(W)
    # body and tail by z (the spikes on the last tail bone), the neck along its line from the shoulders to the head
    u = np.interp(z, [-5.5, -4.8, -3.9, -2.8, -1.7, -0.6, 1.3], [0, 1, 2, 3, 4, 5, 6]).astype(F)
    t = (y - NECK_A[0]) * NECK_D[0] + (z - NECK_A[1]) * NECK_D[1]
    un = np.interp(t, NECK_T + [NECK_T[-1] + 0.6], [6, 7, 8, 9, 10]).astype(F)
    nk = own['neck'] | own['head'] | ((z > 1.5) & ~leg)
    u = np.where(nk, np.maximum(u, un), u)
    u = np.where(own['head'], np.maximum(u, 8.0), u)
    u = np.where(own['spike'], 0.5, u)
    for nm, w in BD.blend_chain(u, SPINE, 0.4):
        Wn[:, bi[nm]] += w * (~leg)
    front = z > 0.4
    for s in 'LR':
        ms = leg & (side == s)
        for fr, bones, ys, gird in ((True, ['arm', 'fore', 'fmeta', 'fpaw'], [0.0, 0.16, 0.3, 0.78, 1.3], 'chest'),
                                    (False, ['thigh', 'shin', 'hmeta', 'hpaw'], [0.0, 0.2, 0.45, 1.2, 2.2], 'hips')):
            m = ms & (front == fr)
            if not m.any():
                continue
            ul = 4.0 - np.interp(y[m], ys, [0.0, 1.0, 2.0, 3.0, 4.0]).astype(F)
            g = sstep(0.25, -0.25, ul) * 0.8
            for nm, w in BD.blend_chain(ul, bones, 0.2):
                Wn[m, bi[nm + s]] += w * (1 - g)
            Wn[m, bi[gird]] += g
    Wn[:, bi['ctag']] = 0
    return Wn / np.maximum(Wn.sum(1, keepdims=True), 1e-9)


# ---------- the hatchling's shape: the spikes as small buds ----------
def baby_offset(P, N, c):
    Q = _mirror(P)
    sg = np.where(P[:, 0] >= 0, 1.0, -1.0).astype(F)
    out = np.zeros_like(P)
    for pts, rad in SPIKES:
        h, a = U.horn(Q, pts, rad, n=10)
        on = (h < 0.02) & (h <= c['spike'] + 0.005)
        w = 0.72 * sstep(0.04, 0.3, a)
        dd = -(Q - pts[0]) * w[:, None]
        out[on] += dd[on]
    out[:, 0] *= sg
    return out.astype(F)


# ---------- skin paint (sRGB 0..1) and fine detail (meters) ----------
hx = U.hexc
K = {
    'skin': hx(0x76704E), 'top': hx(0x4C4A32), 'dk': hx(0x3A3826), 'belly': hx(0xC4BC98), 'lt': hx(0x9A9470), 'stripe': hx(0x45402C),
    'spike': hx(0xE0D4B6), 'spikeB': hx(0x6E6450), 'beak': hx(0x2A2620), 'hoof': hx(0x2E2A24), 'hoofHi': hx(0x5E554A),
    'ball': hx(0x120C08), 'lid': hx(0x4E4A36), 'stud': hx(0xA8A07E),
    'babyA': hx(0x9A9472), 'babyB': hx(0x66603E), 'babyBelly': hx(0xD0C8A6),
}


def _regions(P, N, c):
    r = {}
    Pm = _mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    r['Pm'] = Pm
    r['claw'] = sstep(0.008, 0.002, c['claw'])
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    r['eyeD'] = de
    r['ball'] = sstep(0.002, 0.0006, c['ball']) * sstep(EYE_R + 0.004, EYE_R + 0.001, de)
    r['lid'] = sstep(EYE_R + 0.012, EYE_R + 0.004, de) * (1 - r['ball'])
    L = hframe(Pm)
    r['L'] = L
    r['head'] = sstep(-0.08, 0.0, L[:, 2]) * sstep(3.0, 3.15, z)
    r['beak'] = sstep(0.52, 0.6, L[:, 2]) * r['head'] * sstep(0.02, -0.0, np.abs(L[:, 1] + 0.035) - 0.06)
    sp, sa = spikes(P)
    r['spike'] = sstep(0.012, 0.002, sp - c['tail'] + 0.01) * sstep(0.03, 0.005, sp)
    r['spikeT'] = sa
    jaw = L[:, 1] + 0.065 - 0.012 * sstep(0.35, 0.65, L[:, 2])
    r['lips'] = sstep(0.015, 0.004, np.abs(jaw)) * sstep(0.1, 0.18, L[:, 2]) * r['head']
    r['leg'] = sstep(1.3, 0.8, y) * sstep(0.28, 0.42, x) * (1 - sstep(0.5, 0.9, -N[:, 1]))
    r['foot'] = sstep(0.32, 0.16, y)
    r['belly'] = sstep(-0.2, -0.75, N[:, 1]) * sstep(1.7, 1.2, y)
    r['top'] = sstep(0.15, 0.85, N[:, 1])
    r['neck'] = sstep(1.9, 2.3, z) * (1 - r['head'])
    return r


def _hide(Pm):
    """small rounded scales, bigger ones in rows over the back and the flanks"""
    f1, f2 = worley(Pm / 0.035, 51)
    small = sstep(0.0, 0.18, f2 - f1)
    g1, g2 = worley(Pm * V(1, 1.6, 1) / 0.1, 52)
    big = sstep(0.0, 0.15, g2 - g1)
    wr = 1 - np.abs(2 * vnoise(Pm * V(3, 12, 3), 53) - 1)
    return small, big, sstep(0.8, 0.98, wr)


def paint(P, N, c, baby=False):
    R = _regions(P, N, c)
    Pm = R['Pm']
    y, z = Pm[:, 1], Pm[:, 2]
    n1 = fbm(Pm * 0.8, 3, 11)
    n3 = fbm(Pm * 9.0, 2, 13)
    small, big, wr = _hide(Pm)
    if baby:
        col = np.tile(K['babyA'], (len(P), 1))
        col = U.mix(col, K['babyBelly'], R['belly'] * 0.85)
        bl = sstep(0.5, 0.66, fbm(Pm * V(2.4, 2.4, 1.6), 3, 21)) * sstep(-0.3, 0.3, N[:, 1])
        col = U.mix(col, K['babyB'], bl * 0.6)
        col *= (0.94 + 0.08 * n3 - 0.05 * (1 - small))[:, None]
    else:
        col = np.tile(K['skin'], (len(P), 1))
        dors = sstep(-0.15, 0.75, N[:, 1])
        col = U.mix(col, K['top'], dors * (0.8 - 0.35 * R['leg']))
        under = sstep(-0.1, -0.7, N[:, 1]) * (1 - R['leg']) * (1 - R['foot'])
        col = U.mix(col, K['belly'], np.maximum(R['belly'], under * 0.85) * 0.85)
        # faint darker stripes running down the flanks from the back, soft mottling
        st = sstep(0.62, 0.86, np.sin(2 * np.pi * (z + 0.25 * fbm(Pm * 0.8, 2, 21)) / 0.7) * 0.5 + 0.5) * sstep(-0.4, 0.3, N[:, 1]) * sstep(2.0, 1.3, z) * sstep(-3.5, -2.5, z)
        col = U.mix(col, K['stripe'], st * 0.4 * (1 - under))
        col = U.mix(col, K['dk'], sstep(0.55, 0.75, n1) * sstep(-0.3, 0.4, N[:, 1]) * 0.3)
        col = U.mix(col, K['lt'], R['leg'] * 0.2)
        col = U.mix(col, K['dk'], R['foot'] * 0.3)
        col *= (0.9 + 0.12 * n3 - 0.1 * (1 - small) - 0.08 * (1 - big) * (1 - R['belly']) - 0.05 * wr)[:, None]
    sc = U.mix(np.tile(K['spike'], (len(P), 1)), K['spikeB'], sstep(0.5, 0.05, R['spikeT']) * 0.85)
    sc *= (0.94 + 0.08 * vnoise(Pm * V(40, 6, 40), 17))[:, None]
    col = U.mix(col, sc, R['spike'] * (0.3 if baby else 1.0))
    col = U.mix(col, K['beak'], R['beak'] * (0.6 if baby else 0.9))
    col = U.mix(col, K['lid'], R['lid'] * 0.7)
    col = U.mix(col, K['dk'], R['lips'] * 0.4)
    cc = U.mix(np.tile(K['hoof'], (len(P), 1)), K['hoofHi'], sstep(0.4, 0.8, vnoise(Pm * V(50, 8, 50), 15)) * 0.4)
    col = U.mix(col, cc, R['claw'])
    col = U.mix(col, K['ball'], R['ball'])
    rough = 0.84 + 0.06 * (n3 - 0.5) - 0.25 * R['claw'] - 0.22 * R['spike'] - 0.2 * R['beak'] - 0.3 * R['lid'] * sstep(EYE_R + 0.008, EYE_R + 0.003, R['eyeD'])
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.96).astype(F)


def paint_baby(P, N, c):
    return paint(P, N, c, baby=True)


def detail(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y = Pm[:, 1]
    skin = (1 - R['claw']) * (1 - R['ball']) * (1 - R['spike']) * (1 - R['beak'])
    small, big, wr = _hide(Pm)
    h = np.zeros(len(P), F)
    h += 0.003 * small * skin * (1 - 0.5 * R['head'])
    h += 0.005 * big * skin * (1 - R['head']) * (1 - R['belly'])
    h -= 0.003 * wr * skin
    yr = np.abs(np.sin(np.pi * (y / 0.05 + 0.7 * fbm(Pm * 4, 2, 55))))
    h -= 0.004 * np.exp(-(yr / 0.25) ** 2) * R['leg'] * skin
    nk = np.abs(np.sin(np.pi * ((Pm[:, 2] - 0.5 * Pm[:, 1]) / 0.07 + 0.8 * fbm(Pm * 2.5, 2, 54))))
    h -= 0.004 * np.exp(-(nk / 0.22) ** 2) * R['neck'] * skin
    sg = vnoise(Pm * V(60, 8, 60), 59)
    h -= 0.0012 * sg * (R['spike'] + R['beak'])
    er = np.abs(np.sin(np.pi * (R['eyeD'] / 0.008 + 0.8 * fbm(Pm * 30, 2, 56))))
    h -= 0.0008 * np.exp(-(er / 0.3) ** 2) * sstep(EYE_R + 0.006, EYE_R + 0.015, R['eyeD']) * sstep(0.09, 0.05, R['eyeD'])
    h -= 0.0006 * np.abs(np.sin(y * 150)) * R['claw']
    return h


def finish(C, ao, valid):
    return U.finish(C, ao, valid, floor=0.42)


MAP_QUALITY = (66, 48)
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
                'iris': 0x6A4A20, 'irisR': 0.93, 'pupilR': 0.42, 'rim': 0x1A120A, 'lidCol': st['lidCol']},
        'collar': {'at': ['neck', 'neck2', 0.4], 'r': 1.2},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'belly': [0.0, 0.96, -0.2],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.07, 0.07, 0.06], 'flat': 0x767052,
    }
