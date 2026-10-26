# Domestic goat (light brown and white, Toggenburg colors), sculpted as a signed distance field around the game's goat
# skeleton (tools/blender/work/goat-rig.json). Units are meters in game rig space (x left, y up, z forward, ground at
# y = 0). Shape (a deep barrel with angular hips, slim neck with wattles, a wedge shaped head, ears held out, backswept
# ridged horns on the horn bone, horn buds for the kids, split hooves with dewclaws, the short upright tail as its own
# piece), then paint, fine detail, the coat (longer along the spine and the thighs) and the beard as hair cards. Shared
# helpers for the hooved animals are in ungulate.py.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length
import ungulate as U
from ungulate import local as _local, local_n as _local_n, mirror as _mirror, groove, eround

ID = 'goat'
BOUNDS = (V(-0.2, 0.0, -0.56), V(0.2, 1.06, 0.64))
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
BAKE_DIST = (0.006, 0.016, 0.06)

# ---------- landmarks (left side, +x) ----------
XF, XH = 0.085, 0.085
HOOF_F = V(XF, 0.0, 0.252)
HOOF_H = V(XH, 0.0, -0.31)
# head frame: the skull's axis from the back of the head down the face (HA), HU up toward the forehead
HO = V(0.0, 0.915, 0.375)
HA = nrm([0.0, -0.59, 0.81])
HU = nrm([0.0, 0.81, 0.59])
HL = 0.24


def hp(s, u, x=0.0):
    return HO + HA * s + HU * u + V(1, 0, 0) * x


def hframe(Q):
    D = Q - HO
    return np.stack([D[:, 0], D @ HU, D @ HA], 1)


EYE_C = hp(0.068, 0.028, 0.0405)
EYE_R = 0.0118
EYE_DIR = nrm([0.86, 0.16, 0.48])
LID_W, LID_H, LID_OFF = 0.0118, 0.0074, 0.0004
EAR_B = hp(0.02, 0.026, 0.042)
EAR_A = nrm([0.72, 0.22, 0.66])
EAR_N = nrm([-0.4, -0.25, 0.88])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
EAR_L, EAR_W = 0.105, 0.024
NOS_C = V(0.009, -0.006, 0.229)
NOS_N = nrm([0.7, 0.05, 0.71])
MOUTH = hp(0.228, -0.034, 0.0)

# horns: from the top of the head behind the eyes, back over the neck in a scimitar curve, a little apart
HORN = ([V(0.021, 0.926, 0.436), V(0.025, 0.957, 0.43), V(0.031, 0.99, 0.41), V(0.038, 1.014, 0.381), V(0.045, 1.027, 0.346), V(0.05, 1.027, 0.311),
         V(0.053, 1.017, 0.284)], [0.0122, 0.0116, 0.0104, 0.0089, 0.0071, 0.005, 0.0024])
HORN_BOX = (V(-0.07, 0.9, 0.26), V(0.07, 1.045, 0.46))
HORN_AX = nrm(HORN[0][1] - HORN[0][0])     # up the horn from its base
HORN_STUB = 0.017                           # the base of the horn stays on the head (a kid's horn bud)
BUD = V(0.021, 0.93, 0.434)

PATCHES = [
    (EYE_C * V(0, 1, 1) + V(0.02, -0.022, -0.026), EYE_C * V(0, 1, 1) + V(0.068, 0.022, 0.026), 0.0006),   # eye and lids
    (hp(0.18, 0.0) * V(0, 1, 1) + V(0.0, -0.06, -0.01), hp(0.25, 0.0) * V(0, 1, 1) + V(0.03, 0.02, 0.04), 0.0007),   # nose and lips
    (V(0.03, 0.86, 0.36), V(0.16, 0.95, 0.47), 0.0009),                                                    # ear
    (V(0.0, 0.905, 0.265), V(0.07, 1.045, 0.455), 0.0008),                                                 # horn
    (V(0.055, -0.001, 0.21), V(0.115, 0.08, 0.29), 0.0007),                                                # front hoof
    (V(0.055, -0.001, -0.35), V(0.115, 0.08, -0.27), 0.0007),                                              # hind hoof
]

# trunk: z, top, yw (height of widest), bottom, half width, exponent above, below
TRUNK = [
    (-0.5, 0.645, 0.612, 0.585, 0.03, 2.0, 1.9),
    (-0.47, 0.682, 0.612, 0.55, 0.075, 2.0, 1.9),
    (-0.42, 0.712, 0.61, 0.522, 0.106, 2.0, 1.9),
    (-0.35, 0.738, 0.606, 0.482, 0.126, 2.1, 1.9),
    (-0.2, 0.74, 0.598, 0.418, 0.15, 2.1, 1.9),
    (-0.05, 0.736, 0.585, 0.394, 0.16, 2.1, 1.9),
    (0.08, 0.744, 0.585, 0.402, 0.153, 2.1, 1.9),
    (0.18, 0.762, 0.595, 0.418, 0.132, 2.0, 1.9),
    (0.26, 0.772, 0.605, 0.43, 0.106, 2.0, 1.9),
    (0.32, 0.75, 0.612, 0.465, 0.08, 1.9, 1.9),
    (0.36, 0.705, 0.62, 0.53, 0.052, 1.9, 1.9),
]
NECK = [
    (0.6, 0.245, 0.115, 0.115, 0.072, 1.9, 2.0),
    (0.67, 0.3, 0.086, 0.092, 0.06, 1.9, 2.0),
    (0.75, 0.343, 0.064, 0.068, 0.047, 2.0, 2.1),
    (0.83, 0.371, 0.052, 0.056, 0.04, 2.0, 2.1),
    (0.9, 0.384, 0.045, 0.05, 0.036, 2.0, 2.1),
]
HEAD = [
    (-0.022, 0.026, 0.0, -0.038, 0.03, 2.2, 2.0),
    (0.015, 0.042, 0.004, -0.058, 0.043, 2.4, 1.9),
    (0.055, 0.046, 0.006, -0.068, 0.048, 2.6, 1.8),
    (0.088, 0.04, 0.002, -0.066, 0.041, 2.5, 1.8),
    (0.12, 0.032, -0.004, -0.06, 0.031, 2.3, 1.9),
    (0.152, 0.026, -0.008, -0.054, 0.024, 2.2, 2.0),
    (0.183, 0.021, -0.011, -0.049, 0.02, 2.2, 2.1),
    (0.208, 0.017, -0.013, -0.044, 0.018, 2.3, 2.3),
    (0.225, 0.01, -0.015, -0.039, 0.016, 2.4, 2.4),
    (0.236, 0.0, -0.017, -0.033, 0.012, 2.2, 2.2),
]
FORE = [
    (0.52, 0.205, 0.05, 0.058, 0.044, 2.2, 2.2, 0.075),
    (0.43, 0.2, 0.038, 0.04, 0.033, 2.2, 2.2, 0.083),
    (0.34, 0.207, 0.028, 0.027, 0.026, 2.3, 2.3, 0.085),
    (0.265, 0.218, 0.021, 0.02, 0.021, 2.4, 2.4, 0.085),
]
HIND = [
    (0.66, -0.34, 0.1, 0.13, 0.055, 2.1, 2.1, 0.058),
    (0.58, -0.325, 0.105, 0.155, 0.058, 2.1, 2.0, 0.068),
    (0.5, -0.31, 0.088, 0.14, 0.05, 2.1, 2.0, 0.077),
    (0.43, -0.31, 0.062, 0.095, 0.04, 2.1, 2.1, 0.083),
    (0.37, -0.325, 0.04, 0.058, 0.03, 2.2, 2.2, 0.085),
    (0.32, -0.348, 0.028, 0.038, 0.024, 2.2, 2.2, 0.085),
]


def trunk(P):
    Q = _mirror(P)
    d = loft(Q, TRUNK)
    # withers, the shoulder blade, point of shoulder, triceps, breast
    d = smin(d, ellipsoid(Q, V(0.0, 0.752, 0.2), V(0.03, 0.018, 0.07)), 0.04)
    d = smin(d, ellipsoid(Q, V(0.075, 0.64, 0.22), V(0.04, 0.08, 0.06)), 0.08)
    d = smin(d, ellipsoid(Q, V(0.083, 0.54, 0.28), V(0.03, 0.03, 0.026)), 0.06)
    d = smin(d, ellipsoid(Q, V(0.078, 0.49, 0.19), V(0.036, 0.05, 0.045)), 0.05)
    d = smin(d, ellipsoid(Q, V(0.03, 0.5, 0.29), V(0.032, 0.045, 0.03)), 0.06)
    # angular hindquarters: the hip bones (hooks) and pin bones show under the skin, the thigh is lean
    d = smin(d, ellipsoid(Q, V(0.084, 0.702, -0.27), V(0.016, 0.012, 0.018)), 0.04)
    d = smin(d, ellipsoid(Q, V(0.04, 0.655, -0.488), V(0.016, 0.018, 0.016)), 0.03)
    d = smin(d, ellipsoid(Q, V(0.06, 0.6, -0.455), V(0.045, 0.07, 0.05)), 0.05)
    d = smin(d, ellipsoid(Q, V(0.072, 0.6, -0.4), V(0.048, 0.085, 0.075)), 0.05)
    # the base of the neck in front of the chest, filled out (no crease where the throat meets the chest)
    d = smin(d, ellipsoid(Q, V(0.0, 0.56, 0.318), V(0.06, 0.08, 0.058)), 0.06)
    # the barrel: a big round belly
    d = smin(d, ellipsoid(Q, V(0.0, 0.47, -0.08), V(0.15, 0.08, 0.22)), 0.05)
    # flank fold toward the stifle
    d = smin(d, ellipsoid(Q, V(0.06, 0.48, -0.25), V(0.04, 0.025, 0.05)), 0.04)
    return d


def neck(P):
    Q = _mirror(P)
    d = sweep(Q, NECK)
    d = smin(d, ellipsoid(Q, V(0.0, 0.9, 0.36), V(0.032, 0.03, 0.035)), 0.025)
    return d


def wattles(P):
    """two fleshy tassels hanging from the throat"""
    Q = _mirror(P)
    return round_cone(Q, V(0.015, 0.714, 0.399), V(0.019, 0.664, 0.414), 0.0045, 0.0068)


def head(P):
    Q = _mirror(P)
    L = hframe(Q)
    d = loft(L, HEAD)
    # cheek, the bony ridge under the eye
    d = smin(d, superellipsoid(L, V(0.024, -0.043, 0.09), (0.016, 0.026, 0.036), 2.4), 0.01)
    d = smin(d, round_cone(L, V(0.036, -0.006, 0.075), V(0.029, -0.015, 0.115), 0.003, 0.0018), 0.012)
    # the poll between the horns and the forehead
    d = smin(d, ellipsoid(L, V(0.0, 0.04, 0.03), V(0.03, 0.012, 0.04)), 0.015)
    # muzzle: upper lip (split in the middle), lower lip and chin
    d = smin(d, ellipsoid(L, V(0.0, -0.008, 0.224), V(0.0155, 0.014, 0.014)), 0.008)
    d = smin(d, ellipsoid(L, V(0.0, -0.027, 0.217), V(0.0155, 0.0105, 0.018)), 0.008)
    d = smin(d, ellipsoid(L, V(0.0, -0.045, 0.192), V(0.011, 0.008, 0.019)), 0.009)
    d = d + groove(L[:, 0], 0.0025, 0.0016) * sstep(0.212, 0.226, L[:, 2]) * sstep(-0.01, -0.02, L[:, 1]) * sstep(-0.036, -0.03, L[:, 1])
    # mouth slit
    M = L * V(1, 2.4, 1)
    m = round_cone(M, V(0.0, -0.035 * 2.4, 0.235), V(0.012, -0.036 * 2.4, 0.218), 0.002, 0.002)
    m = smin(m, round_cone(M, V(0.012, -0.036 * 2.4, 0.218), V(0.016, -0.037 * 2.4, 0.178), 0.002, 0.0007), 0.0015)
    d = smax(d, -(m + 0.001) / 2.0, 0.0025)
    # nostrils: slanted slits at the front of the muzzle
    nn = NOS_N
    nu = nrm(np.array([0, 1, 0], F) - nn * nn[1])
    ns = np.cross(nu, nn)
    D = L - NOS_C
    N = np.stack([D @ ns, D @ nu, D @ nn], 1)
    pit = ellipsoid(N, V(0.0, 0.0, 0.0), V(0.0028, 0.008, 0.01))
    d = smax(d, -pit, 0.0012)
    # horn buds: the bony bumps under the horns (all a kid has)
    d = smin(d, ellipsoid(Q, BUD + V(0.0, 0.002, 0.0), V(0.011, 0.008, 0.011)), 0.008)
    return d


def ears(P):
    Q = _mirror(P)
    return U.ear(Q, EAR_B, EAR_A, EAR_N, EAR_L, EAR_W, cup=0.45, th0=0.007, th1=0.0028, tip=0.6, base_r=(0.014, 0.013, 0.013), roll=0.1)


def eye_parts(P):
    Q = _mirror(P)
    return U.eye_parts(Q, EYE_C, EYE_R, EYE_DIR, LID_W, LID_H, LID_OFF, mound=(0.0055, 0.005, 0.0023),
                       brow=((-0.015, 0.015, -0.009), (0.007, 0.016, -0.006), 0.0045, 0.0032))


def horns(P):
    Q = _mirror(P)
    d, _ = U.horn(Q, *HORN, flat=0.78, pitch=0.0065, depth=0.0006, keel=0.12)
    return d


def fleg(P):
    Q = _mirror(P)
    x = XF
    d = sweep(Q, FORE, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(x - 0.004, 0.41, 0.172), V(0.017, 0.02, 0.018)), 0.02)      # point of elbow
    d = smin(d, superellipsoid(Q, V(x, 0.237, 0.218), (0.016, 0.022, 0.017), 2.6), 0.02)   # knee
    d = smin(d, eround(Q, V(x, 0.22, 0.222), V(x, 0.075, 0.225), 0.0135, 0.0128, 0.9, x), 0.01)
    d = smin(d, eround(Q, V(x, 0.21, 0.21), V(x, 0.075, 0.212), 0.0085, 0.009, 1.1, x), 0.01)
    return d


def fpastern(P):
    Q = _mirror(P)
    x = XF
    d = ellipsoid(Q, V(x, 0.062, 0.222), V(0.016, 0.019, 0.018))
    d = smin(d, round_cone(Q, V(x, 0.058, 0.226), V(x, 0.026, 0.246), 0.013, 0.0155), 0.01)
    return d


def hleg(P):
    Q = _mirror(P)
    x = XH
    d = sweep(Q, HIND, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(0.086, 0.445, -0.24), V(0.018, 0.02, 0.018)), 0.03)        # stifle
    d = smin(d, eround(Q, V(x, 0.45, -0.385), V(x, 0.315, -0.385), 0.01, 0.0105, 0.8, x), 0.015)
    d = smin(d, superellipsoid(Q, V(x, 0.3, -0.36), (0.019, 0.024, 0.024), 2.5), 0.012)  # hock
    d = smin(d, ellipsoid(Q, V(x - 0.002, 0.316, -0.385), V(0.01, 0.016, 0.011)), 0.008)
    d = smin(d, eround(Q, V(x, 0.28, -0.35), V(x, 0.075, -0.338), 0.014, 0.0128, 0.9, x), 0.01)
    d = smin(d, eround(Q, V(x, 0.27, -0.366), V(x, 0.075, -0.352), 0.0085, 0.009, 1.1, x), 0.01)
    return d


def hpastern(P):
    Q = _mirror(P)
    x = XH
    d = ellipsoid(Q, V(x, 0.062, -0.343), V(0.0155, 0.019, 0.018))
    d = smin(d, round_cone(Q, V(x, 0.058, -0.34), V(x, 0.026, -0.322), 0.013, 0.015), 0.01)
    return d


def hooves(P):
    Q = _mirror(P)
    hf = U.cloven(Q, HOOF_F, 0.054, 0.04, 0.03, 0.015, 0.55, 0.003)
    hh = U.cloven(Q, HOOF_H, 0.052, 0.038, 0.029, 0.015, 0.5, 0.003)
    return np.minimum(hf, hh)


DEW_F, DEW_H = V(XF, 0.042, 0.212), V(XH, 0.042, -0.355)


def dews(P):
    Q = _mirror(P)
    dn = nrm([0.0, -0.7, -0.7])
    return np.minimum(U.dewclaws(Q, DEW_F, 0.008, 0.004, 0.009, dn), U.dewclaws(Q, DEW_H, 0.008, 0.004, 0.009, dn))


# ---------- tail: its own piece, short and carried up ----------
TAIL = [
    (0.66, -0.462, 0.015, 0.015, 0.018, 2.0, 2.0),
    (0.69, -0.49, 0.011, 0.012, 0.023, 2.2, 2.2),
    (0.722, -0.506, 0.009, 0.01, 0.021, 2.2, 2.2),
    (0.748, -0.51, 0.006, 0.007, 0.012, 2.0, 2.0),
]


def tail(P):
    return sweep(_mirror(P), TAIL)


def folds(P):
    Q = _mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    c = np.zeros(len(P), F)
    w = 0.004 * (vnoise(Q * V(20, 40, 20), 3) - 0.5)
    side = sstep(0.06, 0.1, x)
    c += groove(z - 0.27 + 0.55 * (y - 0.55) + w, 0.01, 0.0004) * side * sstep(0.52, 0.56, y) * sstep(0.7, 0.65, y)
    c += groove(z - 0.15 - 0.3 * (y - 0.48) + w, 0.009, 0.0006) * side * sstep(0.42, 0.46, y) * sstep(0.56, 0.52, y)
    c += groove(z + 0.43 - 0.18 * (y - 0.55) + w, 0.009, 0.0014) * sstep(0.05, 0.08, x) * sstep(0.44, 0.5, y) * sstep(0.68, 0.62, y)
    c += groove(z + 0.372 + 0.05 * (y - 0.35), 0.006, 0.0016) * sstep(0.32, 0.34, y) * sstep(0.42, 0.38, y) * sstep(0.07, 0.08, x)
    # ribs show a little on a dairy goat
    rib = np.sin((z + 0.1 * (y - 0.55)) * 2 * np.pi / 0.038)
    c += 0.0002 * sstep(0.6, 1.0, rib) * sstep(0.13, 0.15, x) * sstep(0.5, 0.55, y) * sstep(0.68, 0.62, y) * sstep(-0.17, -0.08, z) * sstep(0.14, 0.06, z)
    return c


def parts(P):
    so, li, ba, br = eye_parts(P)
    return {'trunk': trunk(P), 'neck': neck(P), 'head': head(P), 'ear': ears(P), 'lids': li, 'ball': ba, 'fleg': fleg(P), 'hleg': hleg(P),
            'fpas': fpastern(P), 'hpas': hpastern(P), 'hoof': hooves(P), 'dew': dews(P), 'tail': tail(P), 'wattle': wattles(P),
            'horn': _local(P, *HORN_BOX, horns)}


def body(P):
    d = trunk(P)
    d = smin(d, _local(P, (-0.14, 0.38, 0.0), (0.14, 1.0, 0.54), neck), 0.1)
    d = smin(d, _local(P, (-0.04, 0.64, 0.37), (0.04, 0.73, 0.43), wattles), 0.006)
    h = _local(P, (-0.075, 0.68, 0.33), (0.075, 0.97, 0.63), head)
    ca, li, ba, br = _local_n(P, EYE_C * V(-1, 1, 1) - V(0.025, 0.03, 0.03), EYE_C + V(0.025, 0.03, 0.03), eye_parts, 4)
    h = smin(h, li, 0.006)
    h = smin(h, br, 0.006)
    h = smax(h, -ca, 0.0025)
    h = smin(h, ba, 0.001)
    d = smin(d, h, 0.025)
    d = smin(d, _local(P, (-0.17, 0.84, 0.35), (0.17, 0.96, 0.48), ears), 0.006)
    d = smin(d, _local(P, *HORN_BOX, horns), 0.005)
    fl = _local(P, (-0.14, 0.05, 0.13), (0.14, 0.58, 0.29), fleg)
    d = smin(d, fl, 0.03)
    hl = _local(P, (-0.16, 0.05, -0.5), (0.16, 0.72, -0.17), hleg)
    d = smin(d, hl, 0.03)
    fp = _local(P, (-0.12, 0.01, 0.19), (0.12, 0.09, 0.27), fpastern)
    hpp = _local(P, (-0.12, 0.01, -0.38), (0.12, 0.09, -0.3), hpastern)
    d = smin(d, smin(fp, hpp, 0.0), 0.01)
    dw = _local(P, (-0.12, 0.02, 0.19), (0.12, 0.06, 0.23), dews)
    dw = np.minimum(dw, _local(P, (-0.12, 0.02, -0.38), (0.12, 0.06, -0.34), dews))
    d = smin(d, dw, 0.006)
    ho = _local(P, (-0.13, -0.01, 0.21), (0.13, 0.05, 0.3), hooves)
    ho = np.minimum(ho, _local(P, (-0.13, -0.01, -0.35), (0.13, 0.05, -0.26), hooves))
    d = smin(d, ho, 0.004)
    d = d + _local(P, (-0.17, 0.3, -0.5), (0.17, 0.8, 0.36), folds, far=0.0)
    return d


def tail_l(P):
    return _local(P, (-0.04, 0.63, -0.53), (0.04, 0.77, -0.43), tail)


PIECES = [body, tail_l]


def shape(P):
    return np.minimum(body(P), tail_l(P))


PREVIEW = {
    'side': ((2.7, 0.55, 0.05), (0, 0.5, 0.05), 30),
    'front3q': ((1.6, 0.85, 1.8), (0, 0.5, 0.08), 30),
    'front': ((0.0, 0.6, 2.6), (0, 0.55, 0.0), 26),
    'rear3q': ((-1.4, 0.9, -1.8), (0, 0.5, -0.1), 30),
    'face': ((0.4, 0.97, 1.15), (0, 0.86, 0.48), 26),
    'faceside': ((0.85, 0.9, 0.52), (0.0, 0.86, 0.5), 24),
    'feet': ((0.5, 0.14, 0.62), (0.08, 0.08, 0.12), 30),
    'eye': ((0.3, 0.92, 0.6), (0.05, 0.9, 0.46), 12),
    'muzzle': ((0.25, 0.8, 0.85), (0.01, 0.77, 0.58), 16),
    'horn': ((0.6, 1.08, 0.75), (0.03, 0.96, 0.38), 22),
    'tail': ((-0.4, 0.75, -1.1), (0.0, 0.66, -0.46), 22),
}

WEIGHT_SMOOTH = (6, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['neck2'], 'neck2': P['head'], 'head': hp(HL, -0.02), 'horn': HORN[0][-1], 'tail1': P['tail1'] + V(0, 0.08, -0.04)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (HOOF_H + V(0, 0.01, 0.03)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (HOOF_F + V(0, 0.01, 0.03)) * m
        t['ear' + s] = (EAR_B + EAR_A * EAR_L) * m
    return t


def keep(P):
    Pm = _mirror(P)
    e = sstep(0.026, 0.015, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.9
    L = hframe(Pm)
    m = sstep(0.18, 0.205, L[:, 2]) * sstep(-0.07, -0.04, L[:, 1]) * sstep(0.045, 0.03, Pm[:, 0]) * 0.8
    a, c, n = U.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    er = sstep(-0.01, 0.01, a) * sstep(0.04, 0.03, np.abs(c)) * sstep(0.02, 0.01, np.abs(n)) * 0.7
    hn = U.box(Pm, V(0.0, 0.93, 0.27), HORN_BOX[1]).astype(F) * 0.8
    h = sstep(0.05, 0.03, Pm[:, 1]) * 0.75
    wt = sstep(0.72, 0.7, Pm[:, 1]) * sstep(0.66, 0.68, Pm[:, 1]) * sstep(0.37, 0.38, Pm[:, 2]) * sstep(0.03, 0.025, Pm[:, 0]) * 0.5
    return np.maximum.reduce([e, m, er, hn, h, wt])


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    P = wpos.astype(F)
    Q = _mirror(P)
    side = np.where(P[:, 0] >= 0, 'L', 'R')
    tl = tail_l(P)
    bd = body(P)
    on_tail = (np.abs(tl) < 0.002) & (bd > -0.003) & (np.abs(tl) < np.abs(bd) + 0.001)
    W[on_tail] = 0
    W[on_tail, bi['tail1']] = 1
    body_v = ~on_tail
    for mb, nb in (('tail1', 'hips'), ('horn', 'head')):
        W[body_v, bi[nb]] += W[body_v, bi[mb]]
        W[body_v, bi[mb]] = 0
    W[:, bi['ctag']] = 0
    # horns ride on the horn bone only (it hides them on kids, who keep their horn buds)
    hn = _local(P, *HORN_BOX, horns)
    hd = _local(P, (-0.075, 0.68, 0.33), (0.075, 0.97, 0.63), head)
    on_horn = body_v & (hn < 0.0025) & (hn < hd - 0.0004) & ((Q - HORN[0][0]) @ HORN_AX > HORN_STUB)
    W[on_horn] = 0; W[on_horn, bi['horn']] = 1
    # wattles ride on the upper neck
    on_w = body_v & (_local(P, (-0.04, 0.64, 0.37), (0.04, 0.73, 0.43), wattles) < 0.002) & (Q[:, 1] < 0.707)
    W[on_w] = 0; W[on_w, bi['neck2']] = 1
    a, c, n = U.ear_coords(Q, EAR_B, EAR_A, EAR_N)
    ed = ears(P)
    on_ear = body_v & (ed < 0.0025) & (a > -0.01) & ~on_horn
    k = sstep(0.0, 0.025, a)
    for s in 'LR':
        m = on_ear & (side == s)
        W[m] *= (1 - k[m])[:, None]
        W[m, bi['ear' + s]] += k[m]
        W[m, bi['ear' + ('R' if s == 'L' else 'L')]] = 0
    for s in 'LR':
        sg = 1 if s == 'L' else -1
        for f, paw in ((HOOF_F, 'fpaw'), (HOOF_H, 'hpaw')):
            near = (np.abs(wpos[:, 0] - sg * f[0]) < 0.045) & (np.abs(wpos[:, 2] - f[2]) < 0.06) & (wpos[:, 1] < 0.045)
            W[near] = 0; W[near, bi[paw + s]] = 1
    return W


# ---------- coat paint (sRGB 0..1) and fine detail (meters) ----------
hx = U.hexc
K = {
    'tan': hx(0x8E6741), 'tanLt': hx(0xA67D52), 'tanDk': hx(0x5E4129), 'dorsal': hx(0x4E3522), 'white': hx(0xEFEBE2), 'cream': hx(0xD9CBB3),
    'nose': hx(0x5C4C46), 'noseDk': hx(0x2E2522), 'hoof': hx(0x3A3430), 'hoofHi': hx(0x5E5650), 'earIn': hx(0xD4B8A6), 'earSpot': hx(0x3E2C20),
    'ball': hx(0x100A08), 'lid': hx(0x3A2A1E), 'hornBase': hx(0x5A5147), 'hornTip': hx(0xB8AC94), 'hornDk': hx(0x3C352E), 'wattle': hx(0x9C7A55),
}


def flow(P, N=None):
    """coat direction: back along the body and down its sides, down the neck, down the face, down the legs, out along
    the ears, up the tail"""
    Q = _mirror(P)
    y, z = Q[:, 1], Q[:, 2]
    one = np.ones_like(y)
    body = np.stack([0 * y, -(0.15 + 0.9 * sstep(0.7, 0.5, y)), -one], 1)
    neckd = np.stack([0 * y, -0.75 * one, -0.55 * one], 1)
    legd = np.stack([0 * y, -one, -0.1 * one], 1)
    head = np.tile(HA, (len(P), 1))
    L = hframe(Q)
    wh = sstep(-0.04, 0.0, L[:, 2]) * sstep(0.8, 0.84, y)
    wn = sstep(0.26, 0.33, z) * sstep(0.55, 0.62, y) * (1 - wh)
    wl = sstep(0.42, 0.34, y) * (1 - wh - wn)
    a, c, n = U.ear_coords(Q, EAR_B, EAR_A, EAR_N)
    we = sstep(-0.005, 0.012, a) * sstep(0.04, 0.03, np.abs(c)) * sstep(0.02, 0.01, np.abs(n))
    tl = sstep(-0.46, -0.48, z) * sstep(0.65, 0.67, y) * sstep(0.035, 0.025, Q[:, 0])
    f = body * (1 - wh - wn - wl)[:, None] + head * wh[:, None] + neckd * wn[:, None] + legd * wl[:, None]
    f = f * (1 - we)[:, None] + EAR_A[None, :] * we[:, None]
    f = f * (1 - tl)[:, None] + V(0, 1, -0.6)[None, :] * tl[:, None]
    f = f / np.maximum(np.linalg.norm(f, axis=1, keepdims=True), 1e-9)
    f[:, 0] *= np.sign(P[:, 0] + 1e-12)
    return f.astype(F)


def _regions(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    r = {}
    Pm = _mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(x + 1e-9)
    r['Pm'], r['Nm'] = Pm, Nm
    r['hoof'] = sstep(0.002, 0.0003, c['hoof'])
    r['dew'] = sstep(0.002, 0.0003, c['dew']) * (1 - r['hoof'])
    hb = (Pm - HORN[0][0]) @ HORN_AX
    r['horn'] = sstep(0.002, 0.0004, c['horn']) * sstep(0.008, 0.013, hb)
    r['bud'] = sstep(0.002, 0.0004, c['horn']) * sstep(0.008, 0.016, hb + 0.004) * (1 - r['horn'])
    r['tail'] = sstep(0.0025, 0.0004, c['tail']) * sstep(0.0, 0.003, c['trunk'])
    r['wattle'] = sstep(0.002, 0.0004, c['wattle']) * sstep(0.71, 0.705, Pm[:, 1])
    a, cc, n = U.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    r['ea'], r['ec'] = a, cc
    r['ear'] = sstep(0.003, 0.0006, c['ear']) * sstep(-0.004, 0.012, a)
    r['earIn'] = sstep(-0.1, 0.45, Nm @ EAR_N)
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    r['eyeD'] = de
    r['ball'] = sstep(0.0008, 0.0002, c['ball']) * sstep(EYE_R + 0.0025, EYE_R + 0.0006, de)
    r['lid'] = sstep(EYE_R + 0.0045, EYE_R + 0.0018, de) * (1 - r['ball'])
    L = hframe(Pm)
    r['L'] = L
    r['head'] = sstep(-0.04, -0.01, L[:, 2]) * sstep(0.006, 0.0, c['head']) * (1 - r['horn'])
    r['muzzle'] = sstep(0.185, 0.215, L[:, 2]) * r['head']
    r['nos'] = sstep(0.003, 0.0, c['head']) * sstep(0.01, 0.0035, np.linalg.norm((L - NOS_C) * V(1, 0.5, 1), axis=1))
    r['leg'] = sstep(0.4, 0.32, y) * (1 - r['tail'])
    r['belly'] = sstep(-0.3, -0.8, N[:, 1]) * sstep(0.55, 0.45, y) * (1 - r['leg'])
    r['top'] = sstep(0.2, 0.85, N[:, 1])
    r['spine'] = sstep(0.75, 0.95, N[:, 1]) * sstep(0.04, 0.012, Pm[:, 0]) * sstep(-0.48, -0.42, z) * sstep(0.34, 0.26, z)
    r['thigh'] = sstep(-0.3, -0.42, z) * sstep(0.38, 0.46, y) * sstep(0.7, 0.62, y) * sstep(-0.2, -0.6, N[:, 2])
    return r


_scache = {}


def _strands(P, N, R):
    key = (len(P), float(P[:7].sum()))
    if key not in _scache:
        dens = 0.85 * (1 - R['hoof']) * (1 - R['dew']) * (1 - R['horn']) * (1 - R['ball']) * (1 - R['muzzle'] * 0.6) * (1 - R['wattle'] * 0.7) * sstep(EYE_R + 0.003, EYE_R + 0.007, R['eyeD'])
        _scache[key] = U.strands(P, N, dens, flow, cell=0.0028, l0=0.006, l1=0.012, wid=0.0004)
    return _scache[key]


def paint(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    R = _regions(P, N, c)
    Pm, L, Nm = R['Pm'], R['L'], R['Nm']
    n1 = fbm(Pm * 8, 3, 11)
    n2 = fbm(Pm * 30, 3, 12)
    col = np.tile(K['tan'], (len(P), 1))
    col = U.mix(col, K['tanLt'], sstep(0.2, 0.75, np.abs(N[:, 0])) * sstep(-0.3, 0.3, N[:, 1]) * 0.35)
    col = U.mix(col, K['tanDk'], R['top'] * 0.35)
    col = U.mix(col, K['dorsal'], R['spine'] * 0.6)
    col *= (0.93 + 0.14 * n1)[:, None]
    col = U.mix(col, K['cream'], R['belly'] * 0.5)
    # white: socks below the knees and hocks, up the backs of the hind legs, the rump each side of the tail
    sock = sstep(0.27, 0.22, y) * (1 - sstep(0.16, 0.6, Nm[:, 2]) * sstep(0.2, 0.26, y) * (z > 0))
    col = U.mix(col, K['white'], sstep(0.29, 0.24, y) * 0.95)
    inner = sstep(0.05, -0.55, Nm[:, 0])
    col = U.mix(col, K['white'], inner * sstep(0.42, 0.28, y) * sstep(0.2, 0.24, y) * 0.8)
    col = U.mix(col, K['white'], sstep(-0.3, -0.6, Nm[:, 2]) * sstep(0.38, 0.3, y) * (z < 0) * 0.85)
    rump = sstep(-0.43, -0.48, z) * sstep(0.72, 0.66, y) * sstep(0.56, 0.62, y) * sstep(0.06, 0.02, Pm[:, 0])
    col = U.mix(col, K['white'], rump * 0.85)
    del sock
    # tail: brown on top, white underneath
    col = U.mix(col, K['white'], R['tail'] * sstep(0.0, 0.5, -N[:, 1] + N[:, 2] * 0.5) * 0.8)
    # ears: white rims and insides, a dark spot inside
    a, cc = R['ea'], R['ec']
    ear = R['ear']
    col = U.mix(col, K['white'], ear * np.maximum(sstep(0.2, 0.5, R['earIn']) * 0.85, sstep(0.016, 0.024, np.abs(cc)) * sstep(0.03, 0.06, a)))
    col = U.mix(col, K['earIn'], ear * R['earIn'] * sstep(0.015, 0.03, a) * sstep(0.014, 0.008, np.abs(cc)) * 0.6)
    col = U.mix(col, K['earSpot'], ear * sstep(0.3, 0.6, R['earIn']) * sstep(0.008, 0.004, np.linalg.norm(np.stack([a - 0.075, cc * 1.2], 1), axis=1)) * 0.7)
    # face: two white stripes from above the eyes down to the muzzle, white muzzle, dark around the nostrils
    hd = R['head']
    sx = np.abs(np.abs(L[:, 0]) - 0.024 + 0.035 * sat((L[:, 2] - 0.05) / 0.2) * 0.25)
    stripe = sstep(0.0092, 0.0052, sx + 0.002 * (n2 - 0.5)) * sstep(0.0, 0.02, L[:, 1] + 0.02 * sat((L[:, 2] - 0.1) / 0.15)) * sstep(0.01, 0.04, L[:, 2])
    col = U.mix(col, K['white'], stripe * hd * 0.92)
    col = U.mix(col, K['tanDk'], hd * sstep(0.012, 0.004, np.abs(L[:, 0])) * sstep(0.02, 0.035, L[:, 1]) * sstep(0.02, 0.06, L[:, 2]) * 0.4)
    col = U.mix(col, K['white'], R['muzzle'] * 0.9)
    col = U.mix(col, K['white'], hd * sstep(-0.035, -0.05, L[:, 1]) * sstep(0.11, 0.16, L[:, 2]) * 0.6)
    col = U.mix(col, K['nose'], hd * sstep(0.218, 0.23, L[:, 2]) * sstep(-0.028, -0.014, L[:, 1]) * 0.7)
    col = U.mix(col, K['noseDk'], R['nos'] * 0.85)
    col = U.mix(col, K['lid'], R['lid'])
    col = U.mix(col, K['wattle'], R['wattle'] * 0.6)
    s = _strands(P, N, R)
    col *= (1 + (s * 0.18 - 0.06) * (1 - R['hoof']) * (1 - R['horn']))[:, None]
    # hooves and dewclaws: dark grey horn
    hc = U.mix(np.tile(K['hoof'], (len(P), 1)), K['hoofHi'], sstep(0.4, 0.8, vnoise(Pm * V(600, 30, 600), 15)) * 0.6 + sstep(0.012, 0.0, y) * 0.3)
    col = U.mix(col, hc, np.maximum(R['hoof'], R['dew']))
    # horns: dark at the base, paler toward the tips, darker in the grooves between the ridges
    _, fr = U.horn(Pm, *HORN)
    rings = 0.5 + 0.5 * np.cos(2 * np.pi * fr * 0.212 / 0.0065)
    hc = U.mix(np.tile(K['hornBase'], (len(P), 1)), K['hornTip'], sstep(0.15, 0.95, fr) + 0.2 * (n2 - 0.5))
    hc = U.mix(hc, K['hornDk'], (1 - rings) * 0.35 * sstep(1.0, 0.6, fr))
    col = U.mix(col, hc, R['horn'])
    col = U.mix(col, K['hornBase'] * 0.9 + hx(0x6E5A50) * 0.1, R['bud'] * 0.8)
    col = U.mix(col, K['ball'], R['ball'])
    rough = 0.62 + 0.08 * (n2 - 0.5) - 0.3 * R['hoof'] - 0.2 * R['horn'] * fr - 0.25 * R['nos'] - 0.2 * R['wattle']
    rough = rough - 0.25 * R['lid'] * sstep(EYE_R + 0.004, EYE_R + 0.0015, R['eyeD'])
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    h = np.zeros(len(P), F)
    skin = (1 - R['hoof']) * (1 - R['ball']) * (1 - R['horn']) * (1 - R['dew'])
    h += 0.00005 * _strands(P, N, R) * skin
    v1, v2 = worley(Pm * V(60, 18, 60), 31)
    vein = sstep(0.06, 0.0, v2 - v1) * (sstep(0.4, 0.3, y) * sstep(0.1, 0.16, y) + R['head'] * sstep(0.1, 0.14, L[:, 2]) * sstep(0.22, 0.18, L[:, 2]))
    h += 0.00008 * vein * skin
    er = np.abs(np.sin(np.pi * (R['eyeD'] / 0.0022 + 0.8 * fbm(Pm * 150, 2, 55))))
    h -= 0.00008 * np.exp(-(er / 0.3) ** 2) * sstep(EYE_R + 0.0025, EYE_R + 0.005, R['eyeD']) * sstep(0.024, 0.016, R['eyeD'])
    h -= (0.00004 * vnoise(Pm * V(1500, 60, 1500), 59) + 0.00002 * np.abs(np.sin(y * 1300))) * R['hoof']
    # horns: fine lengthwise grain over the ridges
    h += 0.00004 * (vnoise(Pm * V(80, 1200, 80), 61) - 0.5) * R['horn']
    return h


def finish(C, ao, valid):
    return U.finish(C, ao, valid)


# ---------- coat: fur shells (medium, longer along the spine and over the thighs) ----------
FUR = {'len': 0.02, 'n': 4, 'lean': 1.4, 'tile': 0.0017, 'babyLen': 1.6, 'babyLean': 0.55, 'quality': 80}


def fur(P, N, c):
    R = _regions(P, N, c)
    ln = np.full(len(P), 0.0085, F)
    ln = ln * (1 - R['head'] * 0.45) * (1 - R['leg'] * 0.45)
    ln = ln + R['spine'] * 0.009 + R['thigh'] * 0.01 + R['belly'] * 0.002
    ln = ln + R['tail'] * 0.006
    ln = ln * (1 - R['hoof']) * (1 - R['dew']) * (1 - R['horn']) * (1 - R['muzzle'] * 0.5) * (1 - R['nos']) * (1 - R['wattle'] * 0.8)
    ln = ln * sstep(EYE_R + 0.003, EYE_R + 0.007, R['eyeD'])
    dens = np.ones(len(P), F)
    return np.clip(ln, 0, FUR['len']).astype(F), dens


MAP_QUALITY = (70, 68)


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': U.lid_color(col, R['eyeD'], EYE_R)}


def meta(st):
    r = EYE_R
    up, dn = (LID_OFF + LID_H) / r, (LID_OFF - LID_H) / r
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.25],
                'iris': 0xC9963A, 'irisR': 0.92, 'pupil': 'h', 'pupilR': 0.46, 'rim': 0x2A1A0A, 'lidCol': st['lidCol'],
                'lash': {'n': 14, 'len': 0.008, 'col': 0x3A2A1C}},
        'collar': {'at': ['neck2', 'head', 0.35], 'w': 0.85, 'maxR': 0.07},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.04, 1.03, 1.02],
        'rim': [0.15, 0.11, 0.08], 'flat': 0x8C6640,
    }


# ---------- hair cards: the beard ----------
HAIR = {'size': (128, 128), 'cols': 4, 'base': (0.2, 0.14, 0.09), 'hi': (0.42, 0.32, 0.22), 'tip': (0.5, 0.4, 0.3), 'strands': 50,
        'root': 0.15, 'rough': 0.6, 'alpha': 0.3, 'seed': 5, 'quality': 70}


def cards():
    out = []
    k = 6
    O, D, specs = [], [], []
    for i in range(14):
        xo = (U.rnd(i, 1) - 0.5) * 0.022
        s0 = 0.135 + 0.055 * U.rnd(i, 2)
        O.append(hp(s0, -0.12, xo)); D.append(HU)
        specs.append((i, xo, s0))
    roots = U.surface(shape, np.array(O), np.array(D), far=0.2)
    for (i, xo, s0), root in zip(specs, roots):
        Lh = (0.06 + 0.05 * U.rnd(i, 3)) * (0.6 + 0.4 * sat((s0 - 0.135) / 0.055))
        fwd = HA * V(0, 0, 1)
        ts = np.linspace(0, 1, k)
        pts = np.array([root - HU * 0.002 + V(0, -1, 0) * (Lh * t) + fwd * (0.012 * t) + V(xo * 0.3 * t, 0, 0) for t in ts], F)
        sd = nrm(np.array([np.cos(i * 1.3), 0.0, np.sin(i * 1.3) * 0.5], F) + V(0.7, 0, 0))
        out.append({'pts': pts, 'w': np.linspace(0.014, 0.02, k), 'nrm': np.tile(nrm(V(0, -0.3, 1)), (k, 1)), 'side': np.tile(sd, (k, 1)),
                    'col': i % HAIR['cols'], 'bones': [{'_skin': 1.0}] * k,
                    'baby': np.array([root + (p - root) * 0.15 for p in pts], F)})
    allp = np.concatenate([c['pts'][1:] for c in out]).astype(F)
    allp = U.push_out(shape, allp, 0.003)
    o = 0
    for c in out:
        n = len(c['pts']) - 1
        c['pts'] = np.concatenate([c['pts'][:1], allp[o:o + n]]).astype(F); o += n
    return out


UV_AVERAGE = True


def uv_weight(P):
    Pm = _mirror(P)
    L = hframe(Pm)
    head = sstep(-0.05, 0.0, L[:, 2]) * sstep(0.76, 0.82, Pm[:, 1])
    hn = U.box(Pm, V(0.0, 0.93, 0.27), HORN_BOX[1]).astype(F)
    hoof = sstep(0.06, 0.04, Pm[:, 1])
    under = sstep(0.45, 0.4, Pm[:, 1]) * sstep(0.38, 0.4, Pm[:, 1]) * sstep(0.08, 0.04, Pm[:, 0])
    return (0.92 + 0.7 * head * (1 - hn) + 0.3 * hn + 0.3 * hoof - 0.3 * under).astype(F)


def uv_regions(P):
    Pm = _mirror(P)
    L = hframe(Pm)
    y, z = Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 2)
    head = (L[:, 2] > -0.03) & (z > 0.33) & (y > 0.78)
    neck = ~head & (z > 0.27) & (y > 0.55)
    fleg = (z > 0.0) & (y < 0.45)
    hleg = (z <= 0.0) & (y < 0.47)
    lab[neck] = 1
    lab[head] = 0
    lab[fleg] = 3
    lab[fleg & (y < 0.24)] = 4
    lab[hleg] = 5
    lab[hleg & (y < 0.3)] = 6
    lab[y < 0.05] = 7
    lab[U.box(Pm, V(0.0, 0.935, 0.27), HORN_BOX[1]) & (Pm[:, 1] + 0.3 * np.maximum(0.0, 0.42 - Pm[:, 2]) > 0.93)] = 8
    lab[(z < -0.46) & (y > 0.64) & (Pm[:, 0] < 0.035)] = 9
    return lab
