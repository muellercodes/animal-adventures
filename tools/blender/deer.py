# White-tailed deer buck in its reddish summer coat, sculpted as a signed distance field around the game's deer
# skeleton (tools/blender/work/deer-rig.json). Units are meters in game rig space (x left, y up, z forward, ground at
# y = 0). Shape (trunk, neck, head, slender legs with dewclaws and split hooves, large ears, the flat tail as its own
# piece, antlers on the antler bone), then paint (with the fawn's spots as the baby color map), fine detail and the
# coat. Shared helpers for the hooved animals are in ungulate.py.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length
import ungulate as U
from ungulate import local as _local, local_n as _local_n, mirror as _mirror, groove, eround

ID = 'deer'
BOUNDS = (V(-0.25, 0.0, -0.8), V(0.25, 1.79, 0.99))
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
BAKE_DIST = (0.008, 0.02, 0.08)

# ---------- landmarks (left side, +x) ----------
XF, XH = 0.1, 0.096                  # front and hind leg columns
HOOF_F = V(XF, 0.0, 0.338)           # ground center of the front hoof (both claws)
HOOF_H = V(XH, 0.0, -0.443)
# head frame: the skull's axis from the back of the head down the face (HA), HU up toward the forehead
HO = V(0.0, 1.412, 0.588)
HA = nrm([0.0, -0.4, 0.917])
HU = nrm([0.0, 0.917, 0.4])
HL = 0.372                           # back of the skull to the tip of the nose along HA (m)


def hp(s, u, x=0.0):
    """head frame (along, up, side) to rig space"""
    return HO + HA * s + HU * u + V(1, 0, 0) * x


def hframe(Q):
    """head frame coordinates (x side, u up, s along) of rig points"""
    D = Q - HO
    return np.stack([D[:, 0], D @ HU, D @ HA], 1)


EYE_C = hp(0.092, 0.03, 0.05)
EYE_R = 0.0155
EYE_DIR = nrm([0.88, 0.14, 0.45])
LID_W, LID_H, LID_OFF = 0.0152, 0.0088, 0.0006
EAR_B = hp(0.002, 0.042, 0.05)
EAR_A = nrm([0.8, 0.52, -0.3])
EAR_N = nrm([0.42, 0.08, 0.9])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
EAR_L, EAR_W = 0.165, 0.043
NOS_C = V(0.0125, -0.004, 0.354)     # nostril (head frame x, u, s)
NOS_N = nrm([0.75, -0.1, 0.65])      # where it opens to (head frame)
MOUTH = hp(0.35, -0.046, 0.0)

# ---------- antlers (left side; the right one mirrors it): main beam and tines, polylines with radii ----------
BURR = hp(0.07, 0.059, 0.035)
_B = BURR
ANTLER = [
    # main beam: out, up and back from the burr, then sweeping forward and in
    ([_B, _B + V(0.032, 0.05, -0.012), _B + V(0.082, 0.096, -0.022), _B + V(0.132, 0.13, 0.0), _B + V(0.161, 0.149, 0.058), _B + V(0.155, 0.162, 0.128),
      _B + V(0.127, 0.168, 0.183), _B + V(0.083, 0.163, 0.218)],
     [0.0155, 0.0135, 0.0125, 0.0115, 0.0105, 0.0088, 0.0066, 0.0032]),
    # brow tine
    ([_B + V(0.028, 0.045, -0.01), _B + V(0.03, 0.088, -0.002), _B + V(0.027, 0.122, 0.01), _B + V(0.021, 0.146, 0.026)], [0.0078, 0.0058, 0.0042, 0.0022]),
    # G2, the longest
    ([_B + V(0.105, 0.112, -0.012), _B + V(0.108, 0.165, -0.012), _B + V(0.105, 0.218, -0.002), _B + V(0.096, 0.262, 0.016), _B + V(0.085, 0.286, 0.034)],
     [0.0095, 0.0076, 0.0058, 0.0038, 0.0019]),
    # G3
    ([_B + V(0.16, 0.15, 0.072), _B + V(0.161, 0.2, 0.078), _B + V(0.155, 0.244, 0.092), _B + V(0.144, 0.272, 0.112)], [0.0086, 0.0066, 0.0045, 0.0019]),
    # G4, short
    ([_B + V(0.142, 0.165, 0.158), _B + V(0.139, 0.196, 0.168), _B + V(0.131, 0.219, 0.182)], [0.0068, 0.0048, 0.0019]),
]
TUBES = U.Tubes(ANTLER, n=28, k=0.007)
BURR_AX = nrm(ANTLER[0][0][1] - ANTLER[0][0][0])     # up the beam from the burr
ANT_LO, ANT_HI = TUBES.lo * V(0, 1, 1) + V(0.005, 0, 0), TUBES.hi
ANT_BOX = (V(-ANT_HI[0], ANT_LO[1] - 0.025, ANT_LO[2]), ANT_HI)     # the antlers and pedicles, both sides

PATCHES = [
    (EYE_C * V(0, 1, 1) + V(0.025, -0.03, -0.035), EYE_C * V(0, 1, 1) + V(0.085, 0.03, 0.035), 0.0007),   # eye and lids
    (hp(0.27, 0.0) * V(0, 1, 1) + V(0.0, -0.075, -0.01), hp(0.38, 0.0) * V(0, 1, 1) + V(0.04, 0.02, 0.04), 0.0008),   # nose and lips
    (V(0.03, 1.43, 0.53), V(0.2, 1.62, 0.66), 0.0011),                                                    # ear
    (ANT_LO, ANT_HI, 0.0011),                                                                             # antler
    (V(0.065, -0.001, 0.29), V(0.135, 0.12, 0.38), 0.0008),                                               # front hoof, dewclaws
    (V(0.06, -0.001, -0.51), V(0.13, 0.12, -0.4), 0.0008),                                                # hind hoof, dewclaws
]

# trunk: z, top, yw (height of widest), bottom, half width, exponent above, below
TRUNK = [
    (-0.705, 0.94, 0.89, 0.835, 0.04, 2.2, 2.0),
    (-0.66, 0.99, 0.885, 0.775, 0.095, 2.3, 2.0),
    (-0.58, 1.018, 0.88, 0.735, 0.13, 2.4, 2.1),
    (-0.47, 1.03, 0.875, 0.712, 0.15, 2.5, 2.2),
    (-0.33, 1.025, 0.865, 0.708, 0.158, 2.5, 2.2),
    (-0.16, 1.02, 0.855, 0.68, 0.164, 2.4, 2.1),
    (0.0, 1.028, 0.85, 0.652, 0.165, 2.4, 2.0),
    (0.12, 1.045, 0.85, 0.64, 0.158, 2.35, 2.0),
    (0.24, 1.068, 0.86, 0.642, 0.143, 2.2, 2.0),
    (0.33, 1.078, 0.87, 0.66, 0.122, 2.0, 2.0),
    (0.4, 1.05, 0.88, 0.71, 0.098, 1.9, 2.0),
    (0.45, 0.99, 0.89, 0.79, 0.065, 1.9, 2.0),
]
# neck: path (y, z), section toward the crest (top), toward the throat (bot), half width, exponents
NECK = [
    (0.94, 0.33, 0.14, 0.16, 0.105, 1.9, 2.0),
    (1.04, 0.415, 0.11, 0.122, 0.085, 1.9, 2.0),
    (1.15, 0.482, 0.088, 0.096, 0.068, 1.9, 2.1),
    (1.26, 0.535, 0.072, 0.08, 0.057, 2.0, 2.1),
    (1.36, 0.57, 0.062, 0.07, 0.05, 2.0, 2.1),
    (1.42, 0.585, 0.052, 0.06, 0.045, 2.0, 2.1),
]
# head: along HA from the back of the skull (s), toward the forehead (top), height of widest, toward the jaw (bot),
# half width, exponents
HEAD = [
    (-0.03, 0.03, 0.0, -0.05, 0.036, 2.2, 2.0),
    (0.015, 0.05, 0.005, -0.078, 0.05, 2.4, 1.9),
    (0.065, 0.056, 0.01, -0.094, 0.058, 2.6, 1.8),
    (0.115, 0.05, 0.004, -0.092, 0.052, 2.6, 1.8),
    (0.165, 0.04, -0.002, -0.08, 0.04, 2.4, 1.9),
    (0.215, 0.032, -0.008, -0.07, 0.032, 2.3, 2.0),
    (0.265, 0.026, -0.012, -0.062, 0.027, 2.2, 2.1),
    (0.31, 0.022, -0.014, -0.057, 0.025, 2.2, 2.2),
    (0.343, 0.017, -0.016, -0.054, 0.025, 2.3, 2.3),
    (0.362, 0.006, -0.019, -0.046, 0.021, 2.2, 2.2),
]
# legs: sweeps down the leg (y, z), section toward the front (top), toward the back (bot), half width, exponents, column x
FORE = [
    (0.8, 0.268, 0.07, 0.082, 0.052, 2.2, 2.2, 0.09),
    (0.68, 0.262, 0.054, 0.06, 0.044, 2.2, 2.2, 0.097),
    (0.58, 0.27, 0.041, 0.042, 0.035, 2.2, 2.3, 0.1),
    (0.47, 0.284, 0.03, 0.029, 0.027, 2.3, 2.4, 0.1),
    (0.375, 0.296, 0.024, 0.023, 0.022, 2.4, 2.4, 0.1),
]
HIND = [
    (0.95, -0.475, 0.16, 0.19, 0.075, 2.2, 2.2, 0.072),
    (0.84, -0.455, 0.155, 0.19, 0.074, 2.2, 2.2, 0.086),
    (0.73, -0.445, 0.105, 0.155, 0.06, 2.1, 2.1, 0.094),
    (0.63, -0.458, 0.062, 0.1, 0.043, 2.1, 2.2, 0.097),
    (0.555, -0.482, 0.047, 0.068, 0.034, 2.2, 2.2, 0.097),
    (0.5, -0.5, 0.034, 0.05, 0.028, 2.3, 2.2, 0.096),
]


# ---------- trunk and muscles ----------
def trunk(P):
    Q = _mirror(P)
    d = loft(Q, TRUNK)
    # withers: the spines over the shoulder blades
    d = smin(d, ellipsoid(Q, V(0.0, 1.05, 0.28), V(0.035, 0.02, 0.08)), 0.05)
    # shoulder: the muscles over the shoulder blade, the point of the shoulder, triceps behind the elbow, the breast
    d = smin(d, ellipsoid(Q, V(0.09, 0.92, 0.3), V(0.045, 0.1, 0.07)), 0.07)
    d = smin(d, ellipsoid(Q, V(0.1, 0.815, 0.365), V(0.035, 0.035, 0.03)), 0.05)
    d = smin(d, ellipsoid(Q, V(0.098, 0.74, 0.255), V(0.05, 0.075, 0.065)), 0.06)
    d = smin(d, ellipsoid(Q, V(0.04, 0.76, 0.385), V(0.045, 0.07, 0.04)), 0.06)
    # hindquarters: croup, the big thigh muscles round from behind, the buttock, the point of hip
    d = smin(d, ellipsoid(Q, V(0.07, 0.985, -0.45), V(0.09, 0.075, 0.17)), 0.07)
    d = smin(d, ellipsoid(Q, V(0.115, 0.915, -0.46), V(0.055, 0.1, 0.14)), 0.06)
    d = smin(d, ellipsoid(Q, V(0.065, 0.865, -0.6), V(0.058, 0.11, 0.07)), 0.05)
    d = smin(d, ellipsoid(Q, V(0.122, 0.995, -0.33), V(0.02, 0.02, 0.022)), 0.05)
    # flank: the fold of skin from the belly to the front of the thigh
    d = smin(d, ellipsoid(Q, V(0.085, 0.735, -0.31), V(0.045, 0.035, 0.07)), 0.05)
    # belly: round under the barrel
    d = smin(d, ellipsoid(Q, V(0.0, 0.715, -0.0), V(0.14, 0.06, 0.2)), 0.05)
    return d


def neck(P):
    Q = _mirror(P)
    d = sweep(Q, NECK)
    # the top of the neck behind the head, up to the back of the skull
    d = smin(d, ellipsoid(Q, V(0.0, 1.405, 0.56), V(0.04, 0.04, 0.05)), 0.03)
    # larynx: a soft bulge high on the throat
    d = smin(d, ellipsoid(Q, V(0.0, 1.3, 0.61), V(0.03, 0.035, 0.03)), 0.03)
    return d


def head(P):
    Q = _mirror(P)
    L = hframe(Q)
    d = loft(L, HEAD)
    # cheek over the back of the jaw, the bony cheek ridge under the eye
    d = smin(d, superellipsoid(L, V(0.03, -0.058, 0.115), (0.02, 0.034, 0.05), 2.4), 0.012)
    d = smin(d, round_cone(L, V(0.05, -0.01, 0.1), V(0.04, -0.022, 0.165), 0.004, 0.002), 0.015)
    # forehead between the antlers, a little raised; the nose bridge
    d = smin(d, ellipsoid(L, V(0.0, 0.05, 0.07), V(0.04, 0.012, 0.05)), 0.02)
    # muzzle: the nose pad in front, upper lip under it, chin under the lower lip
    d = smin(d, superellipsoid(L, V(0.0, -0.008, 0.343), (0.023, 0.02, 0.021), 2.7), 0.012)
    d = smin(d, ellipsoid(L, V(0.0, -0.036, 0.338), V(0.022, 0.013, 0.024)), 0.012)
    d = smin(d, ellipsoid(L, V(0.0, -0.06, 0.305), V(0.015, 0.01, 0.022)), 0.012)
    # mouth: a slit from below the nose back to the corner
    M = L * V(1, 2.4, 1)
    m = round_cone(M, V(0.0, -0.047 * 2.4, 0.352), V(0.018, -0.049 * 2.4, 0.33), 0.0025, 0.0025)
    m = smin(m, round_cone(M, V(0.018, -0.049 * 2.4, 0.33), V(0.024, -0.05 * 2.4, 0.275), 0.0025, 0.0008), 0.002)
    d = smax(d, -(m + 0.0012) / 2.0, 0.003)
    # philtrum: the groove down the middle of the upper lip
    d = d + groove(L[:, 0], 0.0035, 0.0018) * sstep(0.32, 0.34, L[:, 2]) * sstep(-0.012, -0.026, L[:, 1]) * sstep(-0.05, -0.042, L[:, 1])
    # nostrils: comma shaped openings at the sides of the nose pad, facing forward and out
    nn = NOS_N
    nu = nrm(np.array([0, 1, 0], F) - nn * nn[1])
    ns = np.cross(nu, nn)
    D = L - NOS_C
    N = np.stack([D @ ns, D @ nu, D @ nn], 1)
    pit = ellipsoid(N, V(0.0, 0.004, 0.0), V(0.0042, 0.011, 0.014))
    pit = smin(pit, ellipsoid(N, V(-0.003, -0.008, 0.0), V(0.0035, 0.0065, 0.012)), 0.005)
    rim = smax(np.abs(pit + 0.0025) - 0.0022, N[:, 2] - 0.006, 0.002)
    d = smin(d, rim, 0.002)
    d = smax(d, -pit, 0.0015)
    # tear gland: a dark slit in front of the eye
    gl = round_cone(L, V(0.053, 0.014, 0.12), V(0.045, 0.004, 0.145), 0.0018, 0.001)
    d = smax(d, -gl, 0.002)
    return d


def jawline(P):
    """the back and lower edge of the jaw: a soft groove where it meets the throat"""
    Q = _mirror(P)
    L = hframe(Q)
    ch = superellipsoid(L, V(0.03, -0.058, 0.115), (0.02, 0.034, 0.05), 2.4)
    cu, cs = L[:, 1] + 0.058, L[:, 2] - 0.115
    m = np.clip(sstep(0.0, -0.05, cs) + sstep(-0.02, -0.05, cu), 0, 1) * sstep(0.015, 0.03, Q[:, 0])
    return groove(ch + 0.0015, 0.006, 0.0025) * m


def ears(P):
    Q = _mirror(P)
    return U.ear(Q, EAR_B, EAR_A, EAR_N, EAR_L, EAR_W, cup=0.55, th0=0.008, th1=0.003, tip=0.55, base_r=(0.02, 0.02, 0.018), roll=0.12)


def eye_parts(P):
    Q = _mirror(P)
    return U.eye_parts(Q, EYE_C, EYE_R, EYE_DIR, LID_W, LID_H, LID_OFF, mound=(0.0075, 0.0065, 0.003),
                       brow=((-0.02, 0.019, -0.011), (0.009, 0.021, -0.008), 0.0055, 0.004))


# ---------- antlers ----------
def antler(P):
    Q = _mirror(P)
    d = TUBES.field(Q)
    p0, p1 = ANTLER[0][0][0], ANTLER[0][0][1]
    m = U.box(Q, p0 - 0.04, p0 + 0.04)
    if m.any():
        q = Q[m]
        e = d[m]
        # the burr: a rough ring of bony pearls where the antler leaves the pedicle
        ax = nrm(p1 - p0)
        D = q - (p0 + ax * 0.006)
        al = D @ ax
        rr = length(D - np.outer(al, ax))
        ring = np.sqrt((rr - 0.0162) ** 2 + (al * 1.2) ** 2) - 0.0056
        f1, _ = worley(q / 0.0045, 41)
        ring = ring - 0.0011 * sstep(0.55, 0.15, f1)
        e = smin(e, ring, 0.005)
        # the pedicle under it, a short bony stalk on the skull
        e = smin(e, round_cone(q, p0 - ax * 0.012, p0 - ax * 0.002, 0.0135, 0.014), 0.006)
        # pearls on the lower beam
        f2, _ = worley(q / 0.0035, 42)
        e = e - 0.0006 * sstep(0.5, 0.12, f2) * sstep(0.04, 0.015, length(q - p0)) * sstep(0.004, 0.0, e)
        d[m] = e
    return d


# ---------- legs ----------
def fleg(P):
    Q = _mirror(P)
    x = XF
    # forearm: muscular at the top, tapering to the knee
    d = sweep(Q, FORE, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(x + 0.006, 0.55, 0.292), V(0.026, 0.07, 0.022)), 0.02)
    d = smin(d, ellipsoid(Q, V(x - 0.004, 0.655, 0.222), V(0.02, 0.026, 0.024)), 0.03)       # point of elbow
    # knee: flat in front, the accessory carpal bone behind
    d = smin(d, superellipsoid(Q, V(x, 0.348, 0.298), (0.021, 0.03, 0.022), 2.8), 0.02)
    d = smin(d, ellipsoid(Q, V(x, 0.362, 0.276), V(0.011, 0.015, 0.01)), 0.008)
    # cannon: slender bone in front, tendons behind
    d = smin(d, eround(Q, V(x, 0.33, 0.304), V(x, 0.12, 0.306), 0.0128, 0.0118, 0.85, x), 0.012)
    d = smin(d, eround(Q, V(x, 0.31, 0.288), V(x, 0.125, 0.29), 0.0085, 0.0095, 1.1, x), 0.012)
    return d


def fpastern(P):
    Q = _mirror(P)
    x = XF
    d = ellipsoid(Q, V(x, 0.1, 0.302), V(0.016, 0.022, 0.02))                                  # fetlock
    d = smin(d, round_cone(Q, V(x, 0.095, 0.306), V(x, 0.033, 0.33), 0.0135, 0.016), 0.012)  # pastern
    return d


def hleg(P):
    Q = _mirror(P)
    x = XH
    # thigh and gaskin, the stifle in front
    d = sweep(Q, HIND, mirror_x=False)
    # hamstring down to the point of hock, hollow in front of it
    d = smin(d, eround(Q, V(x, 0.62, -0.535), V(x, 0.47, -0.53), 0.012, 0.013, 0.8, x), 0.018)
    # hock: an angular joint, the point behind
    d = smin(d, superellipsoid(Q, V(x, 0.445, -0.502), (0.022, 0.03, 0.03), 2.5), 0.016)
    d = smin(d, ellipsoid(Q, V(x - 0.003, 0.47, -0.537), V(0.012, 0.02, 0.013)), 0.01)
    # cannon: bone and tendons; the hind cannon is long and very slim
    d = smin(d, eround(Q, V(x, 0.42, -0.488), V(x, 0.12, -0.478), 0.0135, 0.012, 0.85, x), 0.012)
    d = smin(d, eround(Q, V(x, 0.41, -0.508), V(x, 0.125, -0.496), 0.009, 0.0095, 1.1, x), 0.012)
    return d


def hpastern(P):
    Q = _mirror(P)
    x = XH
    d = ellipsoid(Q, V(x, 0.1, -0.483), V(0.015, 0.021, 0.019))
    d = smin(d, round_cone(Q, V(x, 0.095, -0.48), V(x, 0.033, -0.458), 0.013, 0.0152), 0.012)
    return d


def hooves(P):
    Q = _mirror(P)
    hf = U.cloven(Q, HOOF_F, 0.066, 0.041, 0.037, 0.017, 0.62, 0.0028)
    hh = U.cloven(Q, HOOF_H, 0.062, 0.038, 0.035, 0.016, 0.58, 0.0026)
    return np.minimum(hf, hh)


DEW_F, DEW_H = V(XF, 0.07, 0.3), V(XH, 0.07, -0.486)


def dews(P):
    Q = _mirror(P)
    dn = nrm([0.0, -0.75, -0.66])
    return np.minimum(U.dewclaws(Q, DEW_F, 0.0085, 0.0045, 0.012, dn), U.dewclaws(Q, DEW_H, 0.008, 0.0042, 0.011, dn))


# ---------- tail: its own piece (it lifts into a flag when the deer runs) ----------
TAIL = [
    (0.985, -0.648, 0.021, 0.021, 0.028, 2.0, 2.0),
    (0.958, -0.69, 0.016, 0.017, 0.038, 2.2, 2.2),
    (0.905, -0.716, 0.013, 0.015, 0.043, 2.3, 2.3),
    (0.845, -0.728, 0.011, 0.013, 0.041, 2.3, 2.3),
    (0.795, -0.727, 0.009, 0.011, 0.032, 2.2, 2.2),
    (0.768, -0.722, 0.007, 0.008, 0.02, 2.0, 2.0),
]


def tail(P):
    return sweep(_mirror(P), TAIL)


# ---------- muscle grooves and folds (meters, carved into the surface) ----------
def folds(P):
    Q = _mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    c = np.zeros(len(P), F)
    w = 0.006 * (vnoise(Q * V(14, 30, 14), 3) - 0.5)
    side = sstep(0.07, 0.12, x)
    # front edge of the shoulder blade, the line between the triceps and the shoulder
    c += groove(z - 0.36 + 0.55 * (y - 0.8) + w, 0.014, 0.0012) * side * sstep(0.76, 0.82, y) * sstep(1.0, 0.94, y)
    c += groove(z - 0.215 - 0.3 * (y - 0.72) + w, 0.012, 0.0016) * side * sstep(0.64, 0.69, y) * sstep(0.84, 0.78, y)
    # hindquarters: the line down the back of the thigh between the big muscles
    c += groove(z + 0.57 - 0.18 * (y - 0.8) + w, 0.012, 0.0018) * sstep(0.06, 0.1, x) * sstep(0.68, 0.74, y) * sstep(0.98, 0.9, y)
    # hollow in front of the hamstring above the hock
    c += groove(z + 0.518 + 0.05 * (y - 0.5), 0.008, 0.002) * sstep(0.47, 0.5, y) * sstep(0.6, 0.55, y) * sstep(0.08, 0.09, x)
    # faint ribs on the barrel
    rib = np.sin((z + 0.1 * (y - 0.8)) * 2 * np.pi / 0.052)
    c += 0.0004 * sstep(0.6, 1.0, rib) * sstep(0.14, 0.16, x) * sstep(0.72, 0.78, y) * sstep(0.95, 0.88, y) * sstep(-0.22, -0.12, z) * sstep(0.2, 0.08, z)
    return c


def parts(P):
    so, li, ba, br = eye_parts(P)
    return {'trunk': trunk(P), 'neck': neck(P), 'head': head(P), 'ear': ears(P), 'lids': li, 'ball': ba, 'fleg': fleg(P), 'hleg': hleg(P),
            'fpas': fpastern(P), 'hpas': hpastern(P), 'hoof': hooves(P), 'dew': dews(P), 'tail': tail(P),
            'antler': _local(P, *ANT_BOX, antler)}


def body(P):
    d = trunk(P)
    d = smin(d, _local(P, (-0.2, 0.72, 0.12), (0.2, 1.52, 0.74), neck), 0.05)
    h = _local(P, (-0.09, 1.2, 0.5), (0.09, 1.52, 0.99), head)
    ca, li, ba, br = _local_n(P, EYE_C * V(-1, 1, 1) - V(0.03, 0.04, 0.04), EYE_C + V(0.03, 0.04, 0.04), eye_parts, 4)
    h = smin(h, li, 0.008)
    h = smin(h, br, 0.008)
    h = smax(h, -ca, 0.003)
    h = smin(h, ba, 0.001)
    d = smin(d, h, 0.03)
    d = d + _local(P, (-0.09, 1.2, 0.55), (0.09, 1.45, 0.82), jawline, far=0.0)
    d = smin(d, _local(P, (-0.22, 1.4, 0.5), (0.22, 1.66, 0.68), ears), 0.008)
    an = _local(P, *ANT_BOX, antler)
    d = smin(d, an, 0.004)
    fl = _local(P, (-0.17, 0.08, 0.17), (0.17, 0.86, 0.36), fleg)
    d = smin(d, fl, 0.04)
    hl = _local(P, (-0.2, 0.08, -0.72), (0.2, 1.02, -0.25), hleg)
    d = smin(d, hl, 0.04)
    fp = _local(P, (-0.13, 0.02, 0.27), (0.13, 0.13, 0.36), fpastern)
    hpp = _local(P, (-0.13, 0.02, -0.52), (0.13, 0.13, -0.43), hpastern)
    d = smin(d, smin(fp, hpp, 0.0), 0.012)
    dw = _local(P, (-0.13, 0.03, 0.26), (0.13, 0.09, 0.3), dews)
    dw = np.minimum(dw, _local(P, (-0.13, 0.03, -0.53), (0.13, 0.09, -0.48), dews))
    d = smin(d, dw, 0.007)
    ho = _local(P, (-0.14, -0.01, 0.29), (0.14, 0.06, 0.39), hooves)
    ho = np.minimum(ho, _local(P, (-0.14, -0.01, -0.49), (0.14, 0.06, -0.39), hooves))
    d = smin(d, ho, 0.004)
    d = d + _local(P, (-0.2, 0.4, -0.7), (0.2, 1.3, 0.5), folds, far=0.0)
    return d


def tail_l(P):
    return _local(P, (-0.06, 0.74, -0.76), (0.06, 1.02, -0.62), tail)


PIECES = [body, tail_l]


def shape(P):
    return np.minimum(body(P), tail_l(P))


# camera views for tools/blender/preview.py: position, target, field of view (game rig space)
PREVIEW = {
    'side': ((4.6, 0.95, 0.1), (0, 0.85, 0.1), 30),
    'front3q': ((2.7, 1.45, 3.0), (0, 0.85, 0.15), 30),
    'front': ((0.0, 1.0, 4.4), (0, 0.9, 0.0), 26),
    'rear3q': ((-2.3, 1.5, -3.0), (0, 0.85, -0.15), 30),
    'face': ((0.55, 1.55, 1.75), (0, 1.42, 0.72), 26),
    'faceside': ((1.2, 1.45, 0.78), (0.0, 1.42, 0.74), 24),
    'feet': ((0.75, 0.22, 0.85), (0.1, 0.12, 0.2), 30),
    'hind': ((1.0, 0.5, -1.1), (0.1, 0.45, -0.45), 34),
    'eye': ((0.38, 1.44, 0.84), (0.055, 1.42, 0.69), 12),
    'muzzle': ((0.3, 1.3, 1.2), (0.01, 1.28, 0.9), 16),
    'headside': ((1.6, 1.5, 0.72), (0, 1.5, 0.72), 26),
    'antler': ((0.9, 1.75, 1.3), (0.08, 1.56, 0.73), 24),
    'tail': ((-0.6, 0.95, -1.6), (0.0, 0.88, -0.66), 22),
}

# ---------- skinning ----------
WEIGHT_SMOOTH = (6, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['neck2'], 'neck2': P['head'], 'head': hp(HL, -0.03), 'antler': BURR + V(0, 0.2, 0.05),
         'tail1': P['tail2'], 'tail2': P['tail2'] + V(0, -0.1, 0)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (HOOF_H + V(0, 0.01, 0.04)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (HOOF_F + V(0, 0.01, 0.04)) * m
        t['ear' + s] = (EAR_B + EAR_A * EAR_L) * m
    return t


def keep(P):
    """1 where the game mesh keeps more of the sculpt when decimating: eyes, nose and lips, ears, antlers, hooves"""
    Pm = _mirror(P)
    e = sstep(0.034, 0.019, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.9
    L = hframe(Pm)
    m = sstep(0.29, 0.33, L[:, 2]) * sstep(-0.1, -0.06, L[:, 1]) * sstep(0.06, 0.04, Pm[:, 0]) * 0.8
    a, c, n = U.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    er = sstep(-0.01, 0.01, a) * sstep(0.06, 0.04, np.abs(c)) * sstep(0.03, 0.015, np.abs(n)) * 0.7
    an = U.box(Pm, ANT_LO - V(0.01, 0.01, 0.01), ANT_HI) * 0.85
    h = sstep(0.07, 0.045, Pm[:, 1]) * 0.75
    tl = sstep(0.8, 0.78, Pm[:, 1]) * sstep(-0.69, -0.71, Pm[:, 2]) * 0.3
    return np.maximum.reduce([e, m, er, an.astype(F), h, tl])


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    P = wpos.astype(F)
    Q = _mirror(P)
    side = np.where(P[:, 0] >= 0, 'L', 'R')
    # the tail piece: tail1 at the root, more tail2 toward its end
    tl = tail_l(P)
    bd = body(P)
    on_tail = (np.abs(tl) < 0.0025) & (bd > -0.004) & (np.abs(tl) < np.abs(bd) + 0.001)
    t = sat((0.975 - P[:, 1]) / 0.2)
    W[on_tail] = 0
    W[on_tail, bi['tail1']] = 1 - 0.75 * t[on_tail]
    W[on_tail, bi['tail2']] = 0.75 * t[on_tail]
    body_v = ~on_tail
    # no tail or antler weights on the body (the rump stays on the hips, the head on the head)
    for mb, nb in (('tail1', 'hips'), ('tail2', 'hips'), ('antler', 'head')):
        W[body_v, bi[nb]] += W[body_v, bi[mb]]
        W[body_v, bi[mb]] = 0
    W[:, bi['ctag']] = 0
    # antlers ride on the antler bone only (it hides them on young deer)
    an = _local(P, *ANT_BOX, antler)
    hd = _local(P, (-0.09, 1.2, 0.5), (0.09, 1.52, 0.99), head)
    on_ant = body_v & (an < 0.003) & (an < hd - 0.0005) & ((Q - BURR) @ BURR_AX > -0.001)
    W[on_ant] = 0; W[on_ant, bi['antler']] = 1
    # ears: the ear bone from a little above the base, blending into the head at the base
    a, c, n = U.ear_coords(Q, EAR_B, EAR_A, EAR_N)
    ed = ears(P)
    on_ear = body_v & (ed < 0.003) & (a > -0.012) & ~on_ant
    k = sstep(0.0, 0.03, a)
    for s in 'LR':
        m = on_ear & (side == s)
        W[m] *= (1 - k[m])[:, None]
        W[m, bi['ear' + s]] += k[m]
        W[m, bi['ear' + ('R' if s == 'L' else 'L')]] = 0
    # hooves and dewclaws ride on the foot bones only
    for s in 'LR':
        sg = 1 if s == 'L' else -1
        for f, paw in ((HOOF_F, 'fpaw'), (HOOF_H, 'hpaw')):
            near = (np.abs(wpos[:, 0] - sg * f[0]) < 0.05) & (np.abs(wpos[:, 2] - f[2]) < 0.07) & (wpos[:, 1] < 0.075)
            W[near] = 0; W[near, bi[paw + s]] = 1
    return W


# ---------- coat paint (sRGB 0..1) and fine detail (meters), evaluated on the baked surface ----------
hx = U.hexc
K = {
    'coat': hx(0x8C5A3A), 'coatLt': hx(0x9E6B47), 'coatDk': hx(0x6B472F), 'back': hx(0x553A28), 'face': hx(0x766050), 'faceDk': hx(0x4A3829),
    'white': hx(0xF1EEE7), 'cream': hx(0xDCCDB5), 'nose': hx(0x151110), 'noseHi': hx(0x2C2522), 'hoof': hx(0x26211E), 'hoofHi': hx(0x48403A),
    'earIn': hx(0xCFC3B4), 'earRim': hx(0x2C221B), 'gland': hx(0x2A1F18), 'ball': hx(0x100A08), 'lid': hx(0x2A1E16),
    'antBase': hx(0x5A4733), 'antMid': hx(0x8C7553), 'antTip': hx(0xE8DFCB), 'antDk': hx(0x3E3123), 'leg': hx(0x86603F), 'legDk': hx(0x5E432E),
    'fawn': hx(0x94562F), 'fawnDk': hx(0x6E3E22), 'spot': hx(0xF3EEE4),
}


def flow(P, N=None):
    """direction the coat lies in: back along the body and down its sides, down the neck toward the chest, down the
    face toward the nose, down the legs, out along the ears, down the tail"""
    Q = _mirror(P)
    y, z = Q[:, 1], Q[:, 2]
    one = np.ones_like(y)
    body = np.stack([0 * y, -(0.12 + 0.9 * sstep(1.0, 0.75, y)), -one], 1)
    neckd = np.stack([0 * y, -0.8 * one, -0.5 * one], 1)
    legd = np.stack([0 * y, -one, -0.1 * one], 1)
    head = np.tile(HA, (len(P), 1))
    L = hframe(Q)
    wh = sstep(-0.05, 0.0, L[:, 2]) * sstep(1.3, 1.36, y)
    wn = sstep(0.36, 0.46, z) * sstep(0.85, 0.95, y) * (1 - wh)
    wl = sstep(0.68, 0.58, y) * (1 - wh - wn)
    a, c, n = U.ear_coords(Q, EAR_B, EAR_A, EAR_N)
    we = sstep(-0.005, 0.015, a) * sstep(0.06, 0.04, np.abs(c)) * sstep(0.03, 0.015, np.abs(n))
    tl = sstep(-0.66, -0.68, z) * sstep(1.0, 0.98, y) * sstep(0.05, 0.03, Q[:, 0])
    f = body * (1 - wh - wn - wl)[:, None] + head * wh[:, None] + neckd * wn[:, None] + legd * wl[:, None]
    f = f * (1 - we)[:, None] + EAR_A[None, :] * we[:, None]
    f = f * (1 - tl)[:, None] + V(0, -1, -0.2)[None, :] * tl[:, None]
    f = f / np.maximum(np.linalg.norm(f, axis=1, keepdims=True), 1e-9)
    f[:, 0] *= np.sign(P[:, 0] + 1e-12)
    return f.astype(F)


def _regions(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    r = {}
    Pm = _mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(x + 1e-9)
    r['Pm'], r['Nm'] = Pm, Nm
    r['hoof'] = sstep(0.0025, 0.0004, c['hoof'])
    r['dew'] = sstep(0.0025, 0.0004, c['dew']) * (1 - r['hoof'])
    r['antler'] = sstep(0.0025, 0.0005, c['antler']) * sstep(-0.006, -0.001, (Pm - BURR) @ BURR_AX)
    r['tail'] = sstep(0.003, 0.0005, c['tail']) * sstep(0.0, 0.004, c['trunk'])
    a, cc, n = U.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    r['ea'], r['ec'] = a, cc
    r['ear'] = sstep(0.004, 0.0008, c['ear']) * sstep(-0.005, 0.015, a)
    r['earIn'] = sstep(-0.1, 0.45, Nm @ EAR_N)
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    r['eyeD'] = de
    r['ball'] = sstep(0.001, 0.0002, c['ball']) * sstep(EYE_R + 0.003, EYE_R + 0.0008, de)
    r['lid'] = sstep(EYE_R + 0.006, EYE_R + 0.0025, de) * (1 - r['ball'])
    L = hframe(Pm)
    r['L'] = L
    r['head'] = sstep(-0.05, -0.01, L[:, 2]) * sstep(0.008, 0.0, c['head']) * (1 - r['antler'])
    r['muzzle'] = sstep(0.3, 0.335, L[:, 2]) * r['head']
    # the nose pad: the front of the muzzle above the lip, around the nostrils
    nf = N @ HA
    pad = sstep(0.338, 0.346, L[:, 2] + 0.2 * np.maximum(-L[:, 1] - 0.02, 0) - 0.15 * np.abs(L[:, 0])) * sstep(-0.032, -0.024, L[:, 1]) * sstep(0.1, 0.4, nf)
    r['nose'] = pad * r['head']
    r['nos'] = sstep(0.004, 0.0, c['head']) * sstep(0.012, 0.004, np.linalg.norm((L - NOS_C) * V(1, 0.6, 1), axis=1))
    r['leg'] = sstep(0.62, 0.5, y) * (1 - r['tail'])
    r['belly'] = sstep(-0.3, -0.8, N[:, 1]) * sstep(0.85, 0.72, y) * (1 - r['leg'])
    r['top'] = sstep(0.2, 0.85, N[:, 1])
    return r


_scache = {}


def _strands(P, N, R):
    key = (len(P), float(P[:7].sum()))
    if key not in _scache:
        dens = 0.85 * (1 - R['hoof']) * (1 - R['dew']) * (1 - R['antler']) * (1 - R['ball']) * (1 - R['nose']) * sstep(EYE_R + 0.004, EYE_R + 0.008, R['eyeD'])
        _scache[key] = U.strands(P, N, dens, flow, cell=0.0026, l0=0.005, l1=0.009, wid=0.00038)
    return _scache[key]


def _antler_col(P, N, R, n2):
    """antler: dark brown and rough at the base, grooved, lighter up the beam, polished ivory tips"""
    Pm = R['Pm']
    j, s, fr, dd, ang = TUBES.coords(Pm)
    tip = np.where(j == 0, sstep(0.7, 0.98, fr), sstep(0.45, 0.95, fr))
    col = np.tile(K['antBase'], (len(P), 1))
    col = U.mix(col, K['antMid'], sstep(0.05, 0.45, fr) * np.where(j == 0, 1.0, 0.7) + 0.25 * (n2 - 0.5))
    col = U.mix(col, K['antTip'], tip)
    gr = _grooves(Pm, j, s, fr, ang)
    col = U.mix(col, K['antDk'], sat(-gr / 0.0005) * 0.5 * (1 - tip))
    # the burr and the pearls: dark between them
    col = U.mix(col, K['antDk'], sstep(0.03, 0.01, length(Pm - ANTLER[0][0][0])) * 0.35)
    return col, tip


def _grooves(Pm, j, s, fr, ang):
    """antler ridges: shallow grooves along the beam and tines, wandering a little, fading toward the smooth tips"""
    w = 0.6 * (fbm(Pm * 90, 2, 71) - 0.5)
    g = np.cos(ang * 7 + w * 3 + j * 1.3)
    return -0.0005 * sstep(0.2, 0.95, g) * (1 - sstep(0.5, 0.9, fr))


def paint(P, N, c, baby=False):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    n1 = fbm(Pm * 6, 3, 11)
    n2 = fbm(Pm * 26, 3, 12)
    col = np.tile(K['coat'], (len(P), 1))
    # warmer and lighter on the flanks, darker along the back; a grizzled dark line down the spine
    col = U.mix(col, K['coatLt'], sstep(0.2, 0.75, np.abs(N[:, 0])) * sstep(-0.3, 0.3, N[:, 1]) * 0.3)
    col = U.mix(col, K['coatDk'], R['top'] * 0.35)
    col = U.mix(col, K['back'], sstep(0.85, 0.97, N[:, 1]) * sstep(0.045, 0.01, Pm[:, 0]) * sstep(-0.65, -0.55, z) * sstep(0.45, 0.35, z) * 0.45)
    col *= (0.94 + 0.12 * n1)[:, None]
    # legs: tan, darker down the front of the cannons, a tuft over the gland on the outside of the hind cannon
    col = U.mix(col, K['leg'], R['leg'] * 0.7)
    col = U.mix(col, K['legDk'], R['leg'] * sstep(0.2, 0.8, R['Nm'][:, 2]) * sstep(0.42, 0.3, y) * 0.55)
    mg = sstep(0.022, 0.012, np.linalg.norm((Pm - V(XH + 0.012, 0.3, -0.49)) * V(1, 0.45, 1), axis=1))
    col = U.mix(col, K['legDk'], mg * 0.7)
    # white: belly and the insides of the legs, the throat patch, the inner thighs and under the tail
    inner = sstep(0.05, -0.55, R['Nm'][:, 0])
    col = U.mix(col, K['white'], R['belly'] * (0.85 + 0.15 * n2))
    col = U.mix(col, K['cream'], inner * sstep(0.62, 0.45, y) * sstep(0.12, 0.2, y) * 0.45)
    col = U.mix(col, K['white'], inner * sstep(0.45, 0.6, y) * sstep(0.9, 0.78, y) * 0.85)
    rump = sstep(-0.58, -0.66, z) * sstep(0.95, 0.88, y) * sstep(0.75, 0.82, y) * sstep(0.075, 0.03, Pm[:, 0])
    col = U.mix(col, K['white'], rump * 0.9)
    thr = sstep(0.0, 0.45, R['Nm'][:, 2] - R['Nm'][:, 1] * 0.3) * sstep(1.12, 1.18, y) * sstep(1.33, 1.27, y) * sstep(0.64, 0.57, z) * (1 - R['head'])
    col = U.mix(col, K['white'], thr * (0.9 + 0.1 * n2))
    # tail: brown on top with a dark line, white edges and white underneath
    tl = R['tail']
    tw = np.maximum(sstep(-0.05, 0.35, N[:, 2]), sstep(0.025, 0.04, Pm[:, 0]))
    col = U.mix(col, K['coatDk'], tl * sstep(0.008, 0.0, Pm[:, 0]) * 0.6)
    col = U.mix(col, K['white'], tl * tw * (0.92 + 0.08 * n2))
    # ears: tan outside, pale inside with dark skin showing through, dark rims at the tips
    a, cc = R['ea'], R['ec']
    ear = R['ear']
    col = U.mix(col, K['face'], ear * 0.5)
    col = U.mix(col, K['earIn'], ear * R['earIn'] * sstep(0.015, 0.05, a) * sstep(0.04, 0.025, np.abs(cc)) * 0.9)
    rim = ear * np.maximum(sstep(0.135, 0.16, a), sstep(0.03, 0.04, np.abs(cc)) * (1 - R['earIn']) * sstep(0.08, 0.12, a))
    col = U.mix(col, K['earRim'], rim * 0.8)
    # face: grey brown, a darker forehead and nose bridge, the white eye ring, the tear gland, the white band behind the
    # black nose, white chin and lips with dark spots at the corners of the mouth
    hd = R['head']
    col = U.mix(col, K['face'], hd * sstep(-0.02, 0.05, L[:, 2]) * 0.8)
    col = U.mix(col, K['faceDk'], hd * sstep(0.01, 0.045, L[:, 1]) * sstep(0.05, 0.035, np.abs(L[:, 0])) * sstep(0.0, 0.08, L[:, 2]) * 0.55)
    col = U.mix(col, K['faceDk'], hd * sstep(0.015, 0.03, L[:, 1]) * sstep(0.025, 0.012, np.abs(L[:, 0])) * sstep(0.12, 0.3, L[:, 2]) * 0.5)
    ring = sstep(EYE_R + 0.011, EYE_R + 0.006, R['eyeD']) * sstep(EYE_R + 0.002, EYE_R + 0.005, R['eyeD'])
    col = U.mix(col, K['white'], ring * hd * 0.85)
    gl = sstep(0.006, 0.002, np.linalg.norm(np.stack([L[:, 0] - 0.05, L[:, 1] - 0.011, (L[:, 2] - 0.131) * 0.4], 1), axis=1))
    col = U.mix(col, K['gland'], gl * hd * 0.85)
    col = U.mix(col, K['lid'], R['lid'])
    band = sstep(0.305, 0.315, L[:, 2]) * sstep(0.335, 0.326, L[:, 2] + 0.2 * np.maximum(-L[:, 1] - 0.02, 0)) * sstep(-0.035, -0.02, L[:, 1])
    col = U.mix(col, K['white'], band * hd * 0.85)
    chin = sstep(-0.035, -0.05, L[:, 1]) * sstep(0.2, 0.26, L[:, 2])
    col = U.mix(col, K['white'], chin * hd * 0.9)
    lipdot = sstep(0.009, 0.004, np.linalg.norm(np.stack([L[:, 0] - 0.024, L[:, 1] + 0.064, (L[:, 2] - 0.295) * 0.6], 1), axis=1))
    col = U.mix(col, K['nose'], lipdot * hd * 0.8)
    col = U.mix(col, U.mix(np.tile(K['nose'], (len(P), 1)), K['noseHi'], n2 * 0.6), R['nose'])
    col = U.mix(col, hx(0x060505), R['nos'] * 0.9)
    # coat hairs: fine strokes, a little lighter or darker than the coat around them
    s = _strands(P, N, R)
    col *= (1 + (s * 0.16 - 0.05) * (1 - R['hoof']) * (1 - R['antler']))[:, None]
    if baby:
        col = _fawn(P, N, R, col, n1, n2)
    # hooves: dark horn, lighter at the toe; dewclaws the same
    hc = U.mix(np.tile(K['hoof'], (len(P), 1)), K['hoofHi'], sstep(0.4, 0.8, vnoise(Pm * V(600, 30, 600), 15)) * 0.6 + sstep(0.015, 0.0, y) * 0.3)
    col = U.mix(col, hc, np.maximum(R['hoof'], R['dew']))
    # antlers
    ac, tip = _antler_col(P, N, R, n2)
    col = U.mix(col, ac, R['antler'])
    col = U.mix(col, K['ball'], R['ball'])
    rough = 0.62 + 0.08 * (n2 - 0.5)
    rough = rough - 0.26 * R['nose'] - 0.3 * R['hoof'] + 0.12 * R['antler'] * (1 - tip) - 0.12 * R['antler'] * tip
    rough = rough - 0.25 * R['lid'] * sstep(EYE_R + 0.005, EYE_R + 0.002, R['eyeD'])
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _fawn(P, N, R, col, n1, n2):
    """fawn: a warmer red brown coat with rows of white spots along the back and flanks"""
    Pm = R['Pm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    body = (1 - R['head']) * (1 - R['leg']) * (1 - R['tail']) * (1 - R['ear'])
    warm = body * (1 - R['belly']) * sstep(-0.5, 0.2, N[:, 1] + 0.3)
    col = U.mix(col, K['fawn'] * (0.94 + 0.12 * n1[:, None]), warm * 0.75)
    col = U.mix(col, K['fawnDk'], warm * sstep(0.85, 0.97, N[:, 1]) * sstep(0.03, 0.01, x) * 0.6)
    # spots: two rows beside the spine, more scattered over the flanks and the rump, none on the belly, neck or legs
    side = sstep(0.0, 0.025, x) * sstep(0.78, 0.86, y) * sstep(-0.66, -0.6, z) * sstep(0.36, 0.26, z) * warm
    # two rows of spots each side of the spine (the spot centers sit on the rows, a little jittered)
    from sdf import _hash
    rows = np.zeros(len(P), F)
    for ri, r0 in enumerate((0.032, 0.068)):
        pitch = 0.042 + 0.006 * ri
        k0 = np.floor(z / pitch).astype(np.int64)
        for dk in (-1, 0, 1):
            k = k0 + dk
            jz = (_hash(k, k * 0 + ri, k * 0, 95) - 0.5) * 0.35 * pitch
            jx = (_hash(k, k * 0 + ri, k * 0, 96) - 0.5) * 0.012
            rr = 0.0085 + 0.004 * _hash(k, k * 0 + ri, k * 0, 97)
            dd = np.sqrt((x - r0 - jx) ** 2 + ((z - (k + 0.5) * pitch - jz) * 0.8) ** 2)
            rows = np.maximum(rows, sstep(rr, rr * 0.55, dd) * sstep(0.93, 0.97, y + 0.06 * N[:, 1]))
    s1 = rows
    s2, _ = U.spots(Pm * V(1.0, 1, 0.8), 0.036, 0.009, 0.0135, seed=92)
    flank = sstep(0.07, 0.12, x) * sstep(0.8, 0.88, y)
    sp = np.maximum(s1, s2 * flank * sstep(0.2, 0.45, vnoise(Pm * 14, 93)))
    col = U.mix(col, K['spot'], sp * side * 0.92)
    return col


def paint_baby(P, N, c):
    return paint(P, N, c, baby=True)


def detail(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    h = np.zeros(len(P), F)
    skin = (1 - R['hoof']) * (1 - R['ball']) * (1 - R['antler']) * (1 - R['dew'])
    h += 0.000035 * _strands(P, N, R) * skin
    # veins on the face and down the legs
    v1, v2 = worley(Pm * V(50, 15, 50), 31)
    vein = sstep(0.06, 0.0, v2 - v1) * (sstep(0.6, 0.45, y) * sstep(0.15, 0.25, y) + R['head'] * sstep(0.14, 0.2, L[:, 2]) * sstep(0.3, 0.25, L[:, 2]))
    h += 0.0001 * vein * skin
    # nose pad: fine pebbled skin and the wrinkles around the nostrils
    g1, _ = worley(Pm / 0.0018, 58)
    h -= 0.00008 * sstep(0.35, 0.1, g1) * R['nose']
    wr = np.abs(np.sin(np.pi * (np.linalg.norm(L - NOS_C, axis=1) / 0.0025 + 0.6 * fbm(Pm * 120, 2, 54))))
    h -= 0.0001 * np.exp(-(wr / 0.3) ** 2) * R['nos'] * R['nose']
    # around the eye: fine folds of the lids
    er = np.abs(np.sin(np.pi * (R['eyeD'] / 0.0028 + 0.8 * fbm(Pm * 120, 2, 55))))
    h -= 0.0001 * np.exp(-(er / 0.3) ** 2) * sstep(EYE_R + 0.003, EYE_R + 0.006, R['eyeD']) * sstep(0.03, 0.02, R['eyeD'])
    # hooves: growth lines; antlers: ridges and pearls
    h -= (0.00004 * vnoise(Pm * V(1500, 60, 1500), 59) + 0.00002 * np.abs(np.sin(y * 1100))) * R['hoof']
    an = R['antler'] > 0.01
    if an.any():
        j, s, fr, dd, ang = TUBES.coords(Pm[an])
        g = _grooves(Pm[an], j, s, fr, ang)
        p1, _ = worley(Pm[an] / 0.0026, 43)
        pearl = 0.00025 * sstep(0.5, 0.15, p1) * sstep(0.12, 0.03, s)
        h[an] += (g + pearl) * R['antler'][an]
    return h


def finish(C, ao, valid):
    return U.finish(C, ao, valid)


# ---------- coat: fur shells ----------
FUR = {'len': 0.01, 'n': 4, 'lean': 1.8, 'tile': 0.0016, 'babyLen': 1.7, 'babyLean': 1.0, 'quality': 70}


def fur(P, N, c):
    """fur length (meters) and strand density per point"""
    R = _regions(P, N, c)
    ln = np.full(len(P), 0.0055, F)
    ln = ln * (1 - R['head'] * 0.4) * (1 - R['leg'] * 0.35)
    ln = ln + R['belly'] * 0.0015
    ln = ln + R['ear'] * R['earIn'] * sstep(0.01, 0.06, R['ea']) * 0.003
    ln = ln + R['tail'] * 0.004
    ln = ln * (1 - R['hoof']) * (1 - R['dew']) * (1 - R['antler']) * (1 - R['nose']) * sstep(EYE_R + 0.004, EYE_R + 0.009, R['eyeD'])
    dens = np.ones(len(P), F)
    return np.clip(ln, 0, FUR['len']).astype(F), dens


MAP_QUALITY = (72, 62)
BABY_MAP = (512, 68)    # the fawn's color map: size, WebP quality


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': U.lid_color(col, R['eyeD'], EYE_R)}


def meta(st):
    r = EYE_R
    up, dn = (LID_OFF + LID_H) / r, (LID_OFF - LID_H) / r
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.3],
                'iris': 0x24160C, 'irisR': 0.97, 'pupil': 'h', 'pupilR': 0.42, 'rim': 0x0C0705, 'lidCol': st['lidCol'],
                'lash': {'n': 18, 'len': 0.013, 'col': 0x1C1410}},
        'collar': {'at': ['neck2', 'head', 0.45], 'w': 0.8, 'maxR': 0.09},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.16, 0.1, 0.07], 'flat': 0x9A5C34,
    }


# ---------- hair cards: the white fringe around the tail ----------
HAIR = {'size': (128, 128), 'cols': 4, 'base': (0.84, 0.82, 0.78), 'hi': (0.96, 0.95, 0.93), 'tip': (0.93, 0.91, 0.87), 'strands': 36,
        'root': 0.2, 'rough': 0.7, 'alpha': 0.3, 'seed': 7, 'quality': 72}


def _tail_frame(t):
    """point on the tail's middle line (t 0 root .. 1 tip), its tangent, and its half width there"""
    from scipy.interpolate import PchipInterpolator
    K_ = np.array(TAIL, np.float64)
    seg = np.linalg.norm(np.diff(K_[:, :2], axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    f = PchipInterpolator(s, K_, axis=0)
    u = s[-1] * t
    k = f(u); dk = f(u, 1)
    T = V(0.0, dk[0], dk[1]); T = T / np.linalg.norm(T)
    return V(0.0, k[0], k[1]), T, float(k[4])


def _tail_bones(y):
    t = float(np.clip((0.975 - y) / 0.2, 0, 1))
    return U.wsum(('tail1', 1 - 0.75 * t), ('tail2', 0.75 * t))


def cards():
    out = []
    k = 4
    i = 0
    for t in np.linspace(0.2, 0.95, 9):
        C, T, w = _tail_frame(t)
        for sg in (1, -1):
            i += 1
            side = V(sg, 0, 0)
            root = C + side * w * 0.75
            L = 0.03 + 0.018 * t + 0.008 * U.rnd(i, 1)
            dr = nrm(side * 1.0 + T * (0.45 + 0.3 * t) + V(0, 0, -0.15))
            ts = np.linspace(0, 1, k)
            pts = np.array([root + dr * (L * s_) + T * (0.004 * s_ * s_) for s_ in ts], F)
            bw = _tail_bones(float(root[1]))
            nr = np.tile(nrm(V(0, 0, -1) - T * float(np.dot(V(0, 0, -1), T))), (k, 1))
            out.append({'pts': pts, 'w': np.linspace(0.026, 0.03, k), 'nrm': nr, 'side': np.tile(T, (k, 1)), 'col': i % HAIR['cols'],
                        'bones': [bw] * k, 'baby': np.array([root + (p - root) * 0.55 for p in pts], F)})
    # the tip: a brush of longer hair beyond the end of the tail
    C, T, w = _tail_frame(1.0)
    for j, a in enumerate((-0.6, 0.0, 0.6)):
        i += 1
        root = C - T * 0.012 + V(a * w * 0.5, 0, 0)
        dr = nrm(T + V(a * 0.5, 0, 0))
        pts = np.array([root + dr * (0.05 * s_) for s_ in np.linspace(0, 1, k)], F)
        bw = _tail_bones(float(root[1]))
        out.append({'pts': pts, 'w': np.linspace(0.026, 0.032, k), 'nrm': np.tile(V(0, 0, -1), (k, 1)), 'side': np.tile(V(1, 0, 0), (k, 1)),
                    'col': i % HAIR['cols'], 'bones': [bw] * k, 'baby': np.array([root + (p - root) * 0.55 for p in pts], F)})
    return out


# ---------- texture layout ----------
UV_AVERAGE = True


def uv_weight(P):
    """linear texel density per island center: the face most, the antlers and hooves more, the belly less"""
    Pm = _mirror(P)
    L = hframe(Pm)
    head = sstep(-0.06, 0.0, L[:, 2]) * sstep(1.25, 1.32, Pm[:, 1])
    ant = U.box(Pm, ANT_LO, ANT_HI).astype(F)
    hoof = sstep(0.08, 0.05, Pm[:, 1])
    under = sstep(0.75, 0.68, Pm[:, 1]) * sstep(0.6, 0.66, Pm[:, 1]) * sstep(0.08, 0.04, Pm[:, 0])
    return (0.92 + 0.75 * head * (1 - ant) + 0.35 * ant + 0.3 * hoof - 0.3 * under).astype(F)


def uv_regions(P):
    """texture layout regions: head, neck, trunk, legs (upper and lower), hooves, antler, tail"""
    Pm = _mirror(P)
    L = hframe(Pm)
    y, z = Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 2)
    head = (L[:, 2] > -0.04) & (z > 0.5) & (y > 1.25)
    neck = ~head & (z > 0.36) & (y > 0.82)
    fleg = (z > 0.0) & (y < 0.7)
    hleg = (z <= 0.0) & (y < 0.75)
    lab[neck] = 1
    lab[head] = 0
    lab[fleg] = 3
    lab[fleg & (y < 0.36)] = 4
    lab[hleg] = 5
    lab[hleg & (y < 0.47)] = 6
    lab[y < 0.075] = 7
    lab[U.box(Pm, ANT_LO, ANT_HI) & (y > BURR[1] - 0.004)] = 8
    lab[(z < -0.655) & (y > 0.74) & (y < 1.0) & (Pm[:, 0] < 0.055)] = 9
    return lab
