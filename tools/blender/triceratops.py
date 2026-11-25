# round 17: Triceratops horridus, about 8.6 m long and 3 m tall at the hips, sculpted as a signed distance field around
# the game's skeleton (tools/blender/work/triceratops-rig.json). Units are meters in game rig space (x left, y up,
# z forward, ground at y = 0). Laid out like brachiosaurus.py (the trunk loft, sweeps for the legs and the tail, the
# head in its own frame).
# Shape: a broad barrel of a body, highest over the hips and sloping down to the shoulders, short thick legs (the
# elbows a little out), a short thick tail held off the ground; a huge head (about 2 m to the top of the frill): a deep
# wedge of a face ending in a hooked parrot-like beak, a short nose horn over big nostrils, two long brow horns (about
# 1 m) curving forward over the eyes, the cheeks flaring out below them, and the solid bony frill rising up and back
# from the skull, a little dished in front, its rim thickened and edged with small knobs (epoccipitals). Feet: five
# short fingers in front (hooves on the inner three), four toes behind (three big hooves).
# Skin (height field per texel): big rounded scales with smaller ones between them, bigger knobbly scales down the
# back, wrinkles round the legs and the neck; horn and beak sheaths with fine grain. Paint: an olive-brown back, warm
# tan flanks with faint darker bands, a pale belly and throat, the frill darker toward its rim with pale knobs, ivory
# horns darkening toward their bases, a dark beak. The hatchling: the game's baby maps with its own size, a stubby
# frill and horn buds (baby_offset), its own paler color map.
# Make it with: VOXEL=0.026 TRIS=6400 TEX=1024 WEIGHTS=transfer BLENDER_PY=... python3 tools/blender/make.py triceratops
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length, axis_steps
import ungulate as U
import bird as BD
from ungulate import local as _local, local_n as _local_n, mirror as _mirror

ID = 'triceratops'
BOUNDS = (V(-1.35, -0.001, -4.6), V(1.35, 3.25, 4.35))
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
BAKE_DIST = (0.04, 0.12, 0.4)

# ---------- landmarks (left side, +x) ----------
XF, XH = 0.82, 0.72
FOOT_F = V(XF, 0.0, 1.34)
FOOT_H = V(XH, 0.0, -0.92)
# head frame: from the back of the skull (the neck joint) forward and down to the tip of the beak
HO = V(0.0, 1.85, 2.45)
HA = nrm([0.0, -0.385, 0.923])
HU = nrm([0.0, 0.923, 0.385])
HL = 1.93


def hp(s, u, x=0.0):
    return HO + HA * s + HU * u + V(1, 0, 0) * x


def hframe(Q):
    D = Q - HO
    return np.stack([D[:, 0], D @ HU, D @ HA], 1)


# head, in the head frame: s (forward), top, yw (height of the widest), bottom (u), half width, exponents
HEAD = [
    (-0.18, 0.26, -0.05, -0.34, 0.3, 2.0, 2.0),
    (0.08, 0.42, -0.05, -0.56, 0.47, 2.0, 2.2),
    (0.36, 0.47, -0.08, -0.64, 0.52, 2.0, 2.3),
    (0.62, 0.45, 0.0, -0.62, 0.4, 2.2, 2.3),
    (0.88, 0.39, 0.0, -0.56, 0.29, 2.4, 2.3),
    (1.14, 0.33, -0.02, -0.5, 0.23, 2.5, 2.4),
    (1.4, 0.27, -0.04, -0.44, 0.185, 2.5, 2.3),
    (1.62, 0.19, -0.07, -0.38, 0.14, 2.3, 2.2),
    (1.8, 0.09, -0.12, -0.32, 0.085, 2.2, 2.0),
    (1.92, -0.04, -0.16, -0.27, 0.035, 2.0, 2.0),
]
EYE_S, EYE_U = 0.58, 0.27
EYE_R = 0.046
EYE_DIR = nrm([0.88, 0.16, 0.45])
LID_W, LID_H, LID_OFF = 0.046, 0.032, 0.002
MOUTH = hp(1.86, -0.27)


def _seat(s, u, r, out=0.35):
    """the eye's center for a ball of radius r standing out of the head loft's side at (s, u) by out times r"""
    a, b = 0.0, 0.8
    for _ in range(40):
        m = 0.5 * (a + b)
        d = float(loft(np.array([[m, u, s]], F), HEAD)[0])
        a, b = (m, b) if d < 0 else (a, m)
    return hp(s, u, a - r * (1 - out))


EYE_C = _seat(EYE_S, EYE_U, EYE_R)
EYE_HF = hframe(EYE_C[None])[0]

# brow horns: polylines (rig space) from the base over and behind the eye, up and forward, curving forward at the tip
_bb = hp(0.6, 0.47, 0.2)
BROW_PTS = [_bb, _bb + V(0.04, 0.24, 0.24), _bb + V(0.09, 0.4, 0.58), _bb + V(0.13, 0.46, 0.88), _bb + V(0.15, 0.44, 1.02)]
BROW_RAD = [0.125, 0.1, 0.07, 0.035, 0.008]
# the nose horn: short and blunt on top of the snout over the nostrils
_nb = hp(1.38, 0.26)
NOSE_PTS = [_nb + V(0, -0.02, 0), _nb + V(0, 0.14, 0.06), _nb + V(0, 0.26, 0.14), _nb + V(0, 0.31, 0.2)]
NOSE_RAD = [0.11, 0.08, 0.045, 0.012]
# the frill: a plate in its own frame (x across, t up and back along it, n out of its front face), rising from the
# back of the skull; its lower corners come down beside the jaw joints behind the eyes (the squamosals), so from the
# side it is a broad fan behind the eye, and from the front a shield round the head
FO = V(0.0, 1.7, 2.65)
FA = nrm([0.0, 0.935, -0.355])
FN = nrm(np.cross(FA, V(1, 0, 0)))          # its front face points forward and up
if FN[2] < 0:
    FN = -FN
# outline: a superellipse centered at t = FR_C, half heights FR_HT above and FR_HB below (squarer below: the corners),
# half width FR_W
FR_C, FR_HT, FR_HB, FR_W = 0.8, 0.64, 0.86, 0.86
FR_DISH = 0.32                              # how far its sides come forward (a shallow bowl: from the side they show)
N_KNOB = 9                                  # epoccipitals on each side of the rim


def fframe(Q):
    D = Q - FO
    return np.stack([D[:, 0], D @ FA, D @ FN], 1)


def _frad(x, t):
    """the frill outline's 'radius': 1 on the outline, less inside"""
    ex = np.abs(x) / FR_W
    up = t > FR_C
    et = np.abs(t - FR_C) / np.where(up, FR_HT, FR_HB)
    p = np.where(up, 2.3, 3.5)
    return (ex ** p + et ** p) ** (1 / p)


def _dish(x, t):
    """how far forward (along FN) the frill's middle surface sits: its sides come forward (a shallow bowl), its top
    leans back a little"""
    ex, et = x / FR_W, (t - FR_C) / FR_HT
    return FR_DISH * ex * ex - 0.06 * np.maximum(et, 0) ** 2


TRUNK = [
    (-2.3, 2.6, 2.36, 2.1, 0.26, 2.0, 2.0),
    (-2.0, 2.86, 2.3, 1.75, 0.62, 2.0, 2.0),
    (-1.5, 3.04, 2.2, 1.4, 0.88, 2.1, 2.0),
    (-0.9, 3.1, 2.05, 1.05, 1.08, 2.2, 2.0),
    (-0.2, 3.0, 1.92, 0.9, 1.22, 2.3, 2.0),
    (0.5, 2.82, 1.82, 0.9, 1.2, 2.3, 2.0),
    (1.1, 2.6, 1.74, 0.98, 1.06, 2.2, 2.0),
    (1.6, 2.4, 1.74, 1.12, 0.84, 2.1, 2.0),
    (2.05, 2.26, 1.8, 1.3, 0.58, 2.0, 2.0),
]
NECK = [
    (1.9, 1.6, 0.4, 0.5, 0.5, 2.0, 2.0),
    (1.92, 2.05, 0.45, 0.5, 0.46, 2.0, 2.0),
    (1.88, 2.45, 0.38, 0.45, 0.36, 2.0, 2.0),
]
TAIL = [
    (2.3, -1.4, 0.36, 0.44, 0.44, 2.0, 2.0),
    (2.4, -1.9, 0.42, 0.48, 0.46, 2.0, 2.0),
    (2.3, -2.3, 0.39, 0.44, 0.4, 2.0, 2.0),
    (2.08, -2.9, 0.31, 0.34, 0.29, 2.0, 2.0),
    (1.76, -3.45, 0.22, 0.24, 0.2, 2.0, 2.0),
    (1.45, -3.92, 0.14, 0.15, 0.13, 2.0, 2.0),
    (1.17, -4.28, 0.075, 0.075, 0.07, 2.0, 2.0),
    (1.0, -4.48, 0.03, 0.03, 0.03, 2.0, 2.0),
]
# legs: path (y, z), section (front, back, half width), x of the center
FORE = [
    (1.75, 1.2, 0.42, 0.45, 0.36, 2.0, 2.0, 0.66),
    (1.35, 1.12, 0.34, 0.37, 0.31, 2.0, 2.0, 0.79),
    (0.95, 1.06, 0.27, 0.29, 0.25, 2.1, 2.1, 0.86),
    (0.65, 1.15, 0.22, 0.22, 0.21, 2.1, 2.1, 0.84),
    (0.36, 1.25, 0.2, 0.19, 0.2, 2.2, 2.2, 0.82),
    (0.16, 1.3, 0.22, 0.2, 0.22, 2.3, 2.3, 0.82),
]
HIND = [
    (2.25, -0.95, 0.62, 0.62, 0.46, 2.0, 2.0, 0.55),
    (1.6, -0.75, 0.5, 0.48, 0.4, 2.0, 2.0, 0.66),
    (1.08, -0.62, 0.35, 0.37, 0.3, 2.1, 2.1, 0.7),
    (0.75, -0.84, 0.27, 0.31, 0.25, 2.1, 2.1, 0.71),
    (0.48, -1.0, 0.23, 0.27, 0.22, 2.2, 2.2, 0.72),
    (0.2, -0.95, 0.25, 0.25, 0.24, 2.3, 2.3, 0.72),
]


def trunk(P):
    Q = _mirror(P)
    d = loft(Q, TRUNK)
    # the shoulder over the front leg and the big hip over the thigh
    d = smin(d, ellipsoid(Q, V(0.62, 1.75, 1.2), V(0.36, 0.55, 0.5)), 0.3)
    d = smin(d, ellipsoid(Q, V(0.58, 2.35, -0.95), V(0.42, 0.6, 0.7)), 0.34)
    return d


def neck(P):
    return sweep(_mirror(P), NECK, n=24)


def horn_parts(P):
    """the two brow horns and the nose horn (fields), with their arc fractions (0 at the base, 1 at the tip)"""
    Q = _mirror(P)
    hb, ab = U.horn(Q, BROW_PTS, BROW_RAD, flat=0.88, keel=0.06, n=18)
    Qn = Q * V(1, 1, 1)
    hn, an = U.horn(Qn, NOSE_PTS, NOSE_RAD, flat=0.75, n=10)
    return hb, ab, hn, an


def frill(P):
    """the solid bony frill: an oval plate rising up and back from the skull roof, dished in front, the rim thick and
    edged with knobs"""
    Q = _mirror(P)
    L = fframe(Q)
    x, t, n = L[:, 0], L[:, 1], L[:, 2]
    # the outline in the plate (its lower middle sinks into the skull)
    r = _frad(x, t)
    e2d = (r - 1.0) * min(FR_W, FR_HT)
    # the plate dishes forward toward its sides (the middle sits back), and leans back a little toward the top
    nn = n - _dish(x, t)
    th = 0.045 + 0.04 * sstep(0.7, 0.98, r)
    dn = np.abs(nn + 0.01) - th
    d = np.sqrt(np.maximum(e2d, 0) ** 2 + np.maximum(dn, 0) ** 2) + np.minimum(np.maximum(e2d, dn), 0)
    # a low ridge up the middle of the back of the frill and bony thickening round the base
    d = smin(d, ellipsoid(L, V(0.0, 0.6, -0.06), V(0.12, 0.5, 0.07)), 0.06)
    for kx, kt, kn, ox, ot in KNOBS:
        d = smin(d, round_cone(L, V(kx - ox * 0.03, kt - ot * 0.03, kn), V(kx + ox * 0.075, kt + ot * 0.075, kn), 0.055, 0.016), 0.025)
    return d


def _knobs():
    """the epoccipitals: small triangular knobs round the rim (the upper rim and the sides), pointing out of the
    outline: (x, t, n, outward x, outward t) in the frill frame"""
    out = []
    for i in range(N_KNOB):
        a = np.radians(5 + i * (128.0 / (N_KNOB - 1)))
        sx, st = np.sin(a), np.cos(a)
        lo, hi = 0.0, 3.0
        for _ in range(40):
            m = 0.5 * (lo + hi)
            rr = float(_frad(np.array([m * sx * FR_W], F), np.array([FR_C + m * st * (FR_HT if st > 0 else FR_HB)], F))[0])
            lo, hi = (m, hi) if rr < 1 else (lo, m)
        kx, kt = lo * sx * FR_W, FR_C + lo * st * (FR_HT if st > 0 else FR_HB)
        e = 1e-3
        gx = float(_frad(np.array([kx + e], F), np.array([kt], F))[0] - _frad(np.array([kx - e], F), np.array([kt], F))[0])
        gt = float(_frad(np.array([kx], F), np.array([kt + e], F))[0] - _frad(np.array([kx], F), np.array([kt - e], F))[0])
        g = np.hypot(gx, gt) + 1e-9
        kn = float(_dish(np.array([kx], F), np.array([kt], F))[0]) - 0.01
        out.append((kx, kt, kn, gx / g, gt / g))
    return out


KNOBS = _knobs()


def head(P):
    Q = _mirror(P)
    L = hframe(Q)
    x, u, s = L[:, 0], L[:, 1], L[:, 2]
    d = loft(L, HEAD)
    # the cheeks: the jugals flare out and down below the eyes, ending in a blunt point (the epijugal)
    d = smin(d, round_cone(L, V(0.3, -0.12, 0.42), V(0.56, -0.42, 0.4), 0.15, 0.06), 0.12)
    # the deep lower jaw and its corner below the cheek, the jaw muscles behind the eye
    d = smin(d, ellipsoid(L, V(0.26, -0.45, 0.7), V(0.12, 0.2, 0.45)), 0.1)
    d = smin(d, ellipsoid(L, V(0.32, 0.12, 0.25), V(0.14, 0.2, 0.22)), 0.12)
    # the brow: a bony boss round the base of each horn, over the eye
    d = smin(d, ellipsoid(L, V(0.2, 0.44, 0.6), V(0.16, 0.08, 0.16)), 0.08)
    # the nostril: a big oval hollow on the side of the snout, below and in front of the nose horn
    no = ((s - 1.5) / 0.11) ** 2 + ((u - 0.06) / 0.08) ** 2
    d = d + 0.035 * np.exp(-no * 1.5) * sstep(0.06, 0.12, np.abs(x))
    # the hooked beak: the upper beak (rostral) comes down to a point over the lower one (predentary)
    d = smin(d, round_cone(L, V(0.0, -0.04, 1.8), V(0.0, -0.36, 1.97), 0.075, 0.018), 0.05)
    # the mouth: a groove along the jaw line, the upper beak overlapping the lower at the front
    jaw = u + 0.3 + 0.04 * sstep(1.2, 0.8, s) - 0.04 * sstep(1.6, 1.88, s)
    lip = np.exp(-(jaw / 0.012) ** 2) * sstep(0.75, 0.85, s)
    d = d + 0.014 * lip
    # rough bony skin over the snout and the top of the skull
    lump = (fbm(Q * 4.5, 2, 61) - 0.5) * sstep(0.9, 1.1, s) * sstep(0.0, 0.15, u)
    d = d - 0.014 * lump
    # the eye socket: a hollow round the eye under the horn's boss
    de = (L - V(float(np.abs(EYE_HF[0])), EYE_HF[1], EYE_HF[2])) / V(0.08, 0.07, 0.09)
    d = d + 0.012 * np.exp(-np.sum(de * de, 1)) * sstep(0.18, 0.28, np.abs(x))
    return d


def eye_parts(P):
    Q = _mirror(P)
    return U.eye_parts(Q, EYE_C, EYE_R, EYE_DIR, LID_W, LID_H, LID_OFF, mound=(0.022, 0.02, 0.008),
                       brow=((-0.06, 0.05, -0.04), (0.03, 0.058, -0.03), 0.028, 0.02))


def fleg(P):
    Q = _mirror(P)
    d = sweep(Q, FORE, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(XF + 0.04, 0.98, 0.98), V(0.2, 0.18, 0.16)), 0.1)      # point of the elbow
    d = smin(d, ellipsoid(Q, V(XF, 0.4, 1.22), V(0.23, 0.12, 0.23)), 0.1)              # the wrist
    return d


def hleg(P):
    Q = _mirror(P)
    d = sweep(Q, HIND, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(XH + 0.01, 1.1, -0.48), V(0.2, 0.17, 0.16)), 0.1)      # knee
    d = smin(d, ellipsoid(Q, V(XH, 0.5, -1.06), V(0.24, 0.13, 0.26)), 0.1)             # ankle and heel
    return d


def _hoof(Q, b, dv, L, w, h):
    """a toe ending in a broad blunt hoof: a short thick toe and the hoof as a flattened rounded wedge"""
    m = b + dv * L * 0.45
    toe = round_cone(Q, b, m, w * 0.85, w * 0.75)
    e = m + dv * L * 0.55
    hv = superellipsoid(Q, (m + e) * 0.5 + V(0, -h * 0.25, 0), (w, h, L * 0.42), 2.6, ax=dv, up=(0, 1, 0))
    return toe, hv


def manus(Q):
    """the front foot: a short broad pad with five stubby fingers spread round its front (hooves on the inner three)"""
    c = FOOT_F
    x, y, z = Q[:, 0] - c[0], Q[:, 1], Q[:, 2] - c[2]
    r = np.sqrt((x / 0.25) ** 2 + ((z + 0.02) / 0.22) ** 2)
    d = (r - 1.0) * 0.22
    d = smax(d, smax(-y + 0.002, y - 0.32, 0.03), 0.04)
    hooves = None
    for a, L, w, h, hf in ((-58, 0.2, 0.065, 0.06, 1), (-25, 0.24, 0.075, 0.07, 1), (5, 0.24, 0.075, 0.07, 1), (35, 0.18, 0.06, 0.05, 0), (62, 0.13, 0.05, 0.04, 0)):
        ar = np.radians(a)
        b = c + V(-np.sin(ar) * 0.14, 0.09, 0.1 + np.cos(ar) * 0.1)
        dv = nrm([-np.sin(ar), -0.25, np.cos(ar)])
        toe, hv = _hoof(Q, b, dv, L, w, h)
        d = smin(d, toe, 0.04)
        if hf:
            hooves = hv if hooves is None else np.minimum(hooves, hv)
        else:
            d = smin(d, hv, 0.03)
    return d, hooves


def pes(Q):
    """the hind foot: a broad pad and four toes, the inner three big with broad hooves, a small fourth"""
    c = FOOT_H
    x, y, z = Q[:, 0] - c[0], Q[:, 1], Q[:, 2] - c[2]
    zz = np.where(z > 0, z / 0.3, z / 0.26)
    r = np.sqrt((x / 0.28) ** 2 + zz ** 2)
    d = (r - 1.0) * 0.24
    d = smax(d, smax(-y + 0.002, y - (0.36 - 0.2 * sstep(0.0, 0.3, z)), 0.05), 0.05)
    hooves = None
    for a, L, w, h in ((-30, 0.28, 0.085, 0.075), (-5, 0.32, 0.095, 0.08), (22, 0.28, 0.085, 0.075)):
        ar = np.radians(a)
        b = c + V(-np.sin(ar) * 0.16, 0.1, 0.14 + np.cos(ar) * 0.12)
        dv = nrm([-np.sin(ar), -0.22, np.cos(ar)])
        toe, hv = _hoof(Q, b, dv, L, w, h)
        d = smin(d, toe, 0.05)
        hooves = hv if hooves is None else np.minimum(hooves, hv)
    d = smin(d, round_cone(Q, c + V(0.2, 0.12, 0.05), c + V(0.3, 0.06, 0.16), 0.06, 0.045), 0.04)
    return d, hooves


def feet(P):
    Q = _mirror(P)
    df, cf = manus(Q)
    dh, ch = pes(Q)
    return np.minimum(df, dh), np.minimum(cf, ch)


def tail(P):
    return sweep(_mirror(P), TAIL, n=64)


HEAD_BOX = (V(-0.8, 0.9, 1.9), V(0.8, 3.0, 4.35))
FRILL_BOX = (V(-1.1, 1.6, 1.8), V(1.1, 3.25, 3.35))
HORN_BOX = (V(-0.65, 1.4, 2.9), V(0.65, 3.1, 4.35))
EYE_BOX = (EYE_C * V(-1, 1, 1) - V(0.12, 0.12, 0.12), EYE_C + V(0.12, 0.12, 0.12))
NECK_BOX = (V(-0.8, 1.1, 1.2), V(0.8, 2.6, 2.9))
FL_BOX = (V(-1.3, -0.1, 0.5), V(1.3, 2.5, 2.0))
HL_BOX = (V(-1.3, -0.1, -2.0), V(1.3, 3.25, 0.2))
FOOT_BOX = (V(-1.25, -0.1, -1.4), V(1.25, 0.45, 1.85))
TAIL_BOX = (V(-0.85, 0.75, -4.65), V(0.85, 3.2, -0.7))


def parts(P):
    so, li, ba, br = eye_parts(P)
    ft, cl = _local_n(P, *FOOT_BOX, feet, 2)
    hb, ab, hn, an = _local_n(P, *HORN_BOX, horn_parts, 4)
    return {'trunk': trunk(P), 'neck': _local(P, *NECK_BOX, neck), 'head': _local(P, *HEAD_BOX, head), 'frill': _local(P, *FRILL_BOX, frill),
            'horn': np.minimum(hb, hn), 'lids': li, 'ball': ba, 'brow': br,
            'fleg': _local(P, *FL_BOX, fleg), 'hleg': _local(P, *HL_BOX, hleg), 'foot': ft, 'claw': cl, 'tail': _local(P, *TAIL_BOX, tail)}


def shape(P):
    d = trunk(P)
    d = smin(d, _local(P, *NECK_BOX, neck), 0.3)
    h = _local(P, *HEAD_BOX, head)
    h = smin(h, _local(P, *FRILL_BOX, frill), 0.08)
    hb, ab, hn, an = _local_n(P, *HORN_BOX, horn_parts, 4)
    h = smin(h, hb, 0.05)
    h = smin(h, hn, 0.04)
    ca, li, ba, br = _local_n(P, *EYE_BOX, eye_parts, 4)
    h = smin(h, li, 0.02)
    h = smin(h, br, 0.025)
    h = smax(h, -ca, 0.006)
    h = smin(h, ba, 0.003)
    d = smin(d, h, 0.14)
    d = smin(d, _local(P, *TAIL_BOX, tail), 0.14)
    d = smin(d, _local(P, *FL_BOX, fleg), 0.2)
    d = smin(d, _local(P, *HL_BOX, hleg), 0.25)
    ft, cl = _local_n(P, *FOOT_BOX, feet, 2)
    d = smin(d, ft, 0.1)
    d = smin(d, cl, 0.02)
    return d


def grid(h):
    """finer around the head (the eye, the beak, the horns, the frill's rim) and the feet"""
    lo, hi = BOUNDS
    xs = axis_steps(0.0, hi[0], [(0.0, 0.95, h * 0.6)], h)
    ys = axis_steps(lo[1], hi[1], [(lo[1], 0.45, h * 0.5), (1.0, hi[1], h * 0.55)], h)
    zs = axis_steps(lo[2], hi[2], [(-1.4, -0.4, h * 0.6), (0.8, 1.8, h * 0.6), (1.7, hi[2], h * 0.5)], h)
    return xs, ys, zs


PATCHES = [
    (EYE_C * V(0, 1, 1) + V(0.2, -0.12, -0.12), EYE_C * V(0, 1, 1) + V(0.52, 0.14, 0.14), 0.005),   # eye and lids
    (V(0.0, 0.95, 3.6), V(0.25, 1.6, 4.35), 0.008),                                               # beak, nostril
    (V(0.4, -0.001, 0.95), V(1.15, 0.38, 1.8), 0.01),                                              # front foot, hooves
    (V(0.35, -0.001, -1.35), V(1.15, 0.42, -0.45), 0.01),                                          # hind foot, hooves
]

PREVIEW = {
    'side': ((17.0, 2.0, -0.2), (0, 1.6, -0.2), 34),
    'front3q': ((8.5, 4.0, 10.0), (0, 1.7, 0.4), 34),
    'rear3q': ((-9.0, 4.5, -10.0), (0, 1.6, -0.5), 34),
    'front': ((0.0, 2.4, 11.0), (0, 1.8, 2.0), 30),
    'head': ((2.6, 2.6, 6.2), (0, 2.0, 3.1), 30),
    'headside': ((4.4, 2.2, 3.1), (0, 2.1, 3.1), 30),
    'feet': ((3.4, 1.0, 3.6), (0.8, 0.3, 0.2), 34),
}


# ---------- the game mesh ----------
def keep(P):
    Pm = _mirror(P)
    e = sstep(0.14, 0.07, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.85
    L = hframe(Pm)
    hd = sstep(-0.1, 0.05, L[:, 2]) * sstep(1.95, 2.1, Pm[:, 2]) * 0.62
    bk = sstep(1.6, 1.75, L[:, 2]) * 0.8
    F2 = fframe(Pm)
    rim = sstep(0.3, 0.12, np.abs(_frad(F2[:, 0], F2[:, 1]) - 1.0)) * sstep(1.9, 2.2, Pm[:, 1]) * sstep(3.3, 2.7, Pm[:, 2]) * 0.55
    ft = sstep(0.32, 0.15, Pm[:, 1]) * 0.55
    base = np.full(len(P), 0.33, F)
    return np.maximum.reduce([base, e, hd, bk, rim, ft]).astype(F)


BEND = [
    (V(0.0, 1.0, -4.5), V(0.0, 2.5, -1.7), 0.42, 0.7),         # tail
    (V(0.0, 1.9, 1.7), V(0.0, 1.85, 2.5), 0.3, 0.85),          # neck
    (V(XF, 1.75, 1.2), V(XF, 0.95, 1.06), 0.28, 0.5),          # upper arm
    (V(XF, 0.95, 1.06), V(XF, 0.4, 1.25), 0.25, 0.4),          # forearm
    (V(XH, 2.2, -0.95), V(XH, 1.08, -0.62), 0.3, 0.65),        # thigh
    (V(XH, 1.08, -0.62), V(XH, 0.48, -1.0), 0.26, 0.42),       # shin
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
    keys = ['trunk', 'neck', 'head', 'frill', 'horn', 'tail', 'fleg', 'hleg', 'foot']
    D = np.stack([c[k] for k in keys], 1)
    o = np.argmin(D, 1)
    return {k: o == i for i, k in enumerate(keys)}


def uv_regions(P):
    """head, frill, horns, trunk, tail, front legs, hind legs, feet"""
    Pm = _mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 3)
    L = hframe(Pm)
    F2 = fframe(Pm)
    lab[(L[:, 2] > -0.1) & (z > 2.0)] = 0
    lab[(F2[:, 1] > 0.12) & (z < 3.2) & (y > 2.0) & (L[:, 2] < 0.5)] = 1
    lab[(z < -1.75)] = 4
    lab[(x > 0.42) & (y < 1.6) & (z > 0.6)] = 5
    lab[(x > 0.38) & (y < 1.85) & (z < -0.2) & (z > -1.6)] = 6
    lab[(y < 0.4) & (x > 0.35) & (np.abs(z) > 0.5)] = 7
    return lab


def uv_weight(P):
    Pm = _mirror(P)
    L = hframe(Pm)
    head = sstep(-0.1, 0.0, L[:, 2]) * sstep(1.95, 2.1, Pm[:, 2])
    foot = sstep(0.4, 0.25, Pm[:, 1])
    under = sstep(1.3, 1.05, Pm[:, 1]) * sstep(0.35, 0.1, Pm[:, 0]) * sstep(-1.3, -0.8, Pm[:, 2]) * sstep(1.4, 0.9, Pm[:, 2])
    return (1.0 + 1.3 * head + 0.3 * foot - 0.3 * under).astype(F)


WEIGHT_SMOOTH = (4, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['head'], 'head': hp(HL, -0.2),
         'tail1': P['tail2'], 'tail2': P['tail3'], 'tail3': P['tail4'], 'tail4': V(0, 0.98, -4.58)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT_H + V(0, 0.01, 0.35)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (FOOT_F + V(0, 0.02, 0.3)) * m
    return t


SPINE = ['tail4', 'tail3', 'tail2', 'tail1', 'hips', 'chest', 'neck', 'head']


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    P = wpos.astype(F)
    Q = _mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    side = np.where(P[:, 0] >= 0, 'L', 'R')
    own = _own(parts(P))
    leg = own['fleg'] | own['hleg'] | own['foot'] | ((y < 0.5) & (x > 0.3))
    hd = own['head'] | own['frill'] | own['horn']
    Wn = np.zeros_like(W)
    # body: one chain along z (the head, its frill and horns all on the head bone)
    u = np.interp(z, [-4.6, -4.1, -3.55, -2.8, -1.9, -0.9, 1.15, 2.0, 2.45], [0, 1, 2, 3, 4, 5, 6, 7, 8]).astype(F)
    u = np.where(hd, 8.0, u)
    u = np.where(own['neck'] & (z > 2.2), np.maximum(u, 7.3), u)
    for nm, w in BD.blend_chain(u, SPINE, 0.4):
        Wn[:, bi[nm]] += w * (~leg)
    front = z > 0.2
    for s in 'LR':
        ms = leg & (side == s)
        for fr, bones, ys, gird in ((True, ['arm', 'fore', 'fmeta', 'fpaw'], [0.0, 0.2, 0.36, 0.95, 1.55], 'chest'),
                                    (False, ['thigh', 'shin', 'hmeta', 'hpaw'], [0.0, 0.22, 0.48, 1.08, 2.0], 'hips')):
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


# ---------- the hatchling's shape: a stubby frill and horn buds ----------
def baby_offset(P, N, c):
    Q = _mirror(P)
    sg = np.where(P[:, 0] >= 0, 1.0, -1.0).astype(F)
    out = np.zeros_like(P)
    # the frill: drawn in toward its base to about a third of its height, and narrower
    F2 = fframe(Q)
    onf = (c['frill'] < np.minimum(c['head'], c['trunk']) + 0.03) & (F2[:, 1] > -0.05)
    t = np.maximum(F2[:, 1], 0.0)
    kt = 0.68 * sstep(0.0, 0.25, t)
    d = -np.outer(kt * t, FA) - np.outer(0.45 * F2[:, 0] * sstep(0.0, 0.3, t), V(1, 0, 0))
    out[onf] += d[onf]
    # the horns: buds (each point drawn toward the horn's base)
    for pts, k in ((BROW_PTS, 0.82), (NOSE_PTS, 0.6)):
        base = pts[0]
        hb, ab = U.horn(Q, pts, BROW_RAD if pts is BROW_PTS else NOSE_RAD, n=12)
        on = (hb < 0.02) & (hb <= c['horn'] + 0.005)
        w = k * sstep(0.03, 0.25, ab)
        dd = -(Q - base) * w[:, None]
        out[on] += dd[on]
    out[:, 0] *= sg
    return out.astype(F)


# ---------- skin paint (sRGB 0..1) and fine detail (meters) ----------
hx = U.hexc
K = {
    'skin': hx(0x7A6A4C), 'top': hx(0x4A4230), 'dk': hx(0x3A3426), 'belly': hx(0xC6B896), 'lt': hx(0x9A8A66),
    'frill': hx(0x6E5A3E), 'rim': hx(0x3C3024), 'rust': hx(0x8A4E2E), 'knob': hx(0xC8B894),
    'horn': hx(0xE2D6BA), 'hornB': hx(0x6E604C), 'beak': hx(0x24201C), 'beakHi': hx(0x4A443C),
    'hoof': hx(0x2E2A24), 'hoofHi': hx(0x5E554A), 'ball': hx(0x120C08), 'lid': hx(0x4E4636),
    'babyA': hx(0x9C8C6C), 'babyB': hx(0x6A5C44), 'babyBelly': hx(0xCEC2A2),
}


def _regions(P, N, c):
    r = {}
    Pm = _mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    r['Pm'] = Pm
    r['claw'] = sstep(0.01, 0.002, c['claw'])
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    r['eyeD'] = de
    r['ball'] = sstep(0.003, 0.001, c['ball']) * sstep(EYE_R + 0.006, EYE_R + 0.002, de)
    r['lid'] = sstep(EYE_R + 0.02, EYE_R + 0.007, de) * (1 - r['ball'])
    L = hframe(Pm)
    r['L'] = L
    r['head'] = sstep(-0.12, 0.0, L[:, 2]) * sstep(1.95, 2.1, z)
    r['horn'] = sstep(0.012, 0.002, c['horn'] - np.minimum(c['head'], c['frill']) + 0.01) * sstep(0.03, 0.005, c['horn'])
    hb, ab, hn, an = horn_parts(P)
    r['hornT'] = np.where(hb < hn, ab, an)
    r['beak'] = sstep(1.62, 1.72, L[:, 2]) * r['head'] * (1 - r['horn'])
    F2 = fframe(Pm)
    r['F'] = F2
    fr = sstep(0.01, -0.005, c['frill'] - np.minimum(c['head'], c['trunk'])) * sstep(-0.05, 0.1, F2[:, 1])
    r['frill'] = fr * (1 - r['horn'])
    rr = _frad(F2[:, 0], F2[:, 1])
    r['frillR'] = rr
    r['knob'] = sstep(1.0, 1.08, rr) * r['frill']
    r['back'] = sstep(0.0, -0.3, (N * FN).sum(1)) * r['frill']
    jaw = L[:, 1] + 0.3 + 0.04 * sstep(1.2, 0.8, L[:, 2]) - 0.04 * sstep(1.6, 1.88, L[:, 2])
    r['lips'] = sstep(0.03, 0.008, np.abs(jaw)) * sstep(0.75, 0.85, L[:, 2]) * r['head']
    no = ((L[:, 2] - 1.5) / 0.11) ** 2 + ((L[:, 1] - 0.06) / 0.08) ** 2
    r['nos'] = sstep(1.3, 0.4, no) * r['head']
    r['leg'] = sstep(1.5, 1.0, y) * sstep(0.35, 0.5, x) * (1 - sstep(0.5, 0.9, -N[:, 1]))
    r['foot'] = sstep(0.4, 0.2, y)
    r['belly'] = sstep(-0.2, -0.75, N[:, 1]) * sstep(1.8, 1.3, y)
    r['top'] = sstep(0.15, 0.85, N[:, 1])
    r['neck'] = sstep(1.5, 1.9, z) * sstep(2.6, 2.3, z) * (1 - r['head'])
    return r


def _hide(Pm):
    """big rounded scales (Triceratops skin impressions show scales up to 10 cm) with small ones between them"""
    f1, f2 = worley(Pm / 0.06, 51)
    big = sstep(0.0, 0.2, f2 - f1)
    g1, g2 = worley(Pm / 0.025, 52)
    small = sstep(0.0, 0.18, g2 - g1)
    wr = 1 - np.abs(2 * vnoise(Pm * V(3, 12, 3), 53) - 1)
    return big, small, sstep(0.8, 0.98, wr)


def paint(P, N, c, baby=False):
    R = _regions(P, N, c)
    Pm = R['Pm']
    y, z = Pm[:, 1], Pm[:, 2]
    n1 = fbm(Pm * 0.8, 3, 11)
    n3 = fbm(Pm * 9.0, 2, 13)
    big, small, wr = _hide(Pm)
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
        # faint darker bands across the back and the flanks, soft mottling
        band = sstep(0.6, 0.85, np.sin(2 * np.pi * (z + 0.3 * fbm(Pm * 0.7, 2, 21)) / 1.1) * 0.5 + 0.5) * sstep(-0.3, 0.4, N[:, 1]) * sstep(1.9, 1.2, z) * sstep(-2.2, -1.6, z)
        col = U.mix(col, K['dk'], band * 0.35 * (1 - under))
        col = U.mix(col, K['dk'], sstep(0.55, 0.75, n1) * sstep(-0.3, 0.4, N[:, 1]) * 0.3)
        col = U.mix(col, K['lt'], R['leg'] * 0.2)
        col = U.mix(col, K['dk'], R['foot'] * 0.3)
        # the face a little paler under the eye, darker over the snout
        col = U.mix(col, K['lt'], R['head'] * sstep(0.1, -0.3, R['L'][:, 1]) * 0.25)
        # the frill: warm brown, darkening toward its rim, a few muted rusty patches on its front, pale knobs
        fc = U.mix(np.tile(K['frill'], (len(P), 1)), K['rim'], sstep(0.55, 0.95, R['frillR']) * 0.7)
        fc = U.mix(fc, K['rust'], sstep(0.62, 0.78, fbm(Pm * 2.2, 3, 27)) * sstep(0.85, 0.5, R['frillR']) * (1 - R['back']) * 0.45)
        fc = U.mix(fc, K['top'], R['back'] * 0.5)
        fc = U.mix(fc, K['knob'], R['knob'] * 0.75)
        col = U.mix(col, fc, R['frill'])
        col *= (0.9 + 0.12 * n3 - 0.12 * (1 - big) - 0.06 * (1 - small) - 0.05 * wr)[:, None]
    # horns: ivory, darkening and grooved toward the base
    hc = U.mix(np.tile(K['horn'], (len(P), 1)), K['hornB'], sstep(0.55, 0.05, R['hornT']) * 0.85)
    hc *= (0.94 + 0.08 * vnoise(Pm * V(40, 6, 40), 17))[:, None]
    col = U.mix(col, hc, R['horn'] * (0.25 if baby else 1.0))
    bc = U.mix(np.tile(K['beak'], (len(P), 1)), K['beakHi'], sstep(0.4, 0.8, vnoise(Pm * V(30, 30, 8), 16)) * 0.4)
    col = U.mix(col, bc, R['beak'] * (0.6 if baby else 1.0))
    col = U.mix(col, K['lid'], R['lid'] * 0.7)
    col = U.mix(col, K['dk'], R['nos'] * 0.35)
    col = U.mix(col, K['dk'], R['lips'] * 0.4)
    cc = U.mix(np.tile(K['hoof'], (len(P), 1)), K['hoofHi'], sstep(0.4, 0.8, vnoise(Pm * V(50, 8, 50), 15)) * 0.4)
    col = U.mix(col, cc, R['claw'])
    col = U.mix(col, K['ball'], R['ball'])
    rough = 0.84 + 0.06 * (n3 - 0.5) - 0.25 * R['claw'] - 0.22 * R['horn'] - 0.2 * R['beak'] - 0.3 * R['lid'] * sstep(EYE_R + 0.012, EYE_R + 0.005, R['eyeD'])
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.96).astype(F)


def paint_baby(P, N, c):
    return paint(P, N, c, baby=True)


def detail(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y = Pm[:, 1]
    skin = (1 - R['claw']) * (1 - R['ball']) * (1 - R['horn']) * (1 - R['beak'])
    big, small, wr = _hide(Pm)
    h = np.zeros(len(P), F)
    # big domed scales everywhere (bigger and knobblier over the back), small ones between them; fine grain on the face
    h += 0.006 * big * skin * (1 - 0.6 * R['head']) * (1 + 0.5 * R['top'])
    h += 0.0025 * small * skin
    h -= 0.003 * wr * skin * (1 - R['frill'])
    # the frill: fine bony texture with grooves (blood vessel tracks) running out to the rim
    F2 = R['F']
    ang = np.arctan2(F2[:, 0], F2[:, 1] - 0.05)
    gv = np.abs(np.sin(ang * 22 + 1.5 * fbm(Pm * 3, 2, 58)))
    h -= 0.004 * np.exp(-(gv / 0.25) ** 2) * R['frill'] * sstep(0.3, 0.6, R['frillR'])
    # wrinkles round the legs and across the neck
    yr = np.abs(np.sin(np.pi * (y / 0.06 + 0.7 * fbm(Pm * 4, 2, 55))))
    h -= 0.005 * np.exp(-(yr / 0.25) ** 2) * R['leg'] * skin
    nk = np.abs(np.sin(np.pi * (Pm[:, 2] / 0.09 + 0.8 * fbm(Pm * 2.5, 2, 54))))
    h -= 0.005 * np.exp(-(nk / 0.22) ** 2) * R['neck'] * skin
    # horns and beak: fine lengthwise grain and growth rings
    hg = vnoise(Pm * V(60, 8, 60), 59)
    h -= 0.0012 * hg * (R['horn'] + R['beak'])
    h -= 0.002 * np.abs(np.sin(R['hornT'] * 60)) * R['horn'] * sstep(0.6, 0.1, R['hornT'])
    # wrinkles round the eye, hoof growth lines
    er = np.abs(np.sin(np.pi * (R['eyeD'] / 0.016 + 0.8 * fbm(Pm * 20, 2, 56))))
    h -= 0.0015 * np.exp(-(er / 0.3) ** 2) * sstep(EYE_R + 0.012, EYE_R + 0.03, R['eyeD']) * sstep(0.2, 0.12, R['eyeD'])
    h -= 0.0008 * np.abs(np.sin(y * 120)) * R['claw']
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
                'iris': 0x7A5426, 'irisR': 0.93, 'pupilR': 0.4, 'rim': 0x1A120A, 'lidCol': st['lidCol']},
        'collar': {'at': ['neck', 'head', 0.3], 'r': 1.2},
        'mouth': [round(float(v), 4) for v in MOUTH],
        # lying down: the deepest part of the belly comes to the ground
        'belly': [0.0, 0.97, -0.2],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.07, 0.07, 0.06], 'flat': 0x7A6A50,
    }
