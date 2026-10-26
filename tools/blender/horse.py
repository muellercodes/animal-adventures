# Bay horse, sculpted as a signed distance field around the game's horse skeleton (tools/blender/work/horse-rig.json).
# Units are meters in game rig space (x left, y up, z forward, ground at y = 0). Shape first (trunk, neck, head, legs,
# hooves), then paint, fine detail, the coat (fur shells) and the hair cards for the mane, forelock and tail.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, chain, loft, sweep, frame, fbm, vnoise, worley, length

ID = 'horse'
BOUNDS = (V(-0.42, 0.0, -1.16), V(0.42, 2.2, 1.56))
# small features meshed again on a finer grid for baking only (box lo, box hi on the +x side, voxel size); set below
PATCHES = []

# ---------- landmarks (left side, +x) ----------
XF, XH = 0.178, 0.19                 # front and hind leg columns
HOOF_F = V(XF, 0.0, 0.366)           # ground contact center of the front hoof
HOOF_H = V(XH, 0.0, -0.668)
# head frame: from the poll down the face (HA), HU toward the forehead and nose bridge
HO = V(0.0, 1.93, 1.03)
HA = nrm([0.0, -0.757, 0.653])
HU = nrm([0.0, 0.653, 0.757])
HS = 0.92                            # head length scale: head frame lengths along HA are design units of HS meters
HL = 0.675                           # poll to muzzle tip along HA (design units)


def hp(s, u, x=0.0):
    """head frame (along, up, side) to rig space"""
    return HO + HA * (s * HS) + HU * u + V(1, 0, 0) * x


EYE_C = hp(0.2, 0.032, 0.08)
EYE_R = 0.0225
EYE_DIR = nrm([0.86, 0.12, 0.49])
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_W, LID_H, LID_OFF = 0.019, 0.0125, 0.0005
EAR_B, EAR_L = hp(-0.012, 0.05, 0.056), 0.165
EAR_A = nrm([0.2, 0.94, 0.27])
EAR_N = nrm([0.5, -0.1, 0.86])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
NOS_C = V(0.04, 0.008, 0.626)        # nostril center in the head frame (x, u, s)
NOS_N = nrm([0.62, 0.12, 0.78])       # direction the nostril opens to (head frame)
MOUTH = hp(0.655, -0.07, 0.0)
PATCHES = [
    (EYE_C * V(0, 1, 1) + V(0.035, -0.045, -0.05), EYE_C * V(0, 1, 1) + V(0.135, 0.045, 0.05), 0.0008),   # eye and lids
    (V(0.0, 1.33, 1.34), V(0.095, 1.52, 1.5), 0.0011),                                                    # muzzle, nostrils, lips
    (V(0.02, 1.94, 0.98), V(0.13, 2.16, 1.15), 0.0012),                                                   # ear
    (V(0.1, -0.001, 0.28), V(0.25, 0.14, 0.45), 0.0013),                                                  # front hoof
    (V(0.11, -0.001, -0.76), V(0.27, 0.14, -0.59), 0.0013),                                               # hind hoof
]

# trunk: z, top, yw (height of widest), bottom, half width, exponent above, below
TRUNK = [
    (-1.05, 1.44, 1.36, 1.26, 0.07, 2.2, 2.0),
    (-1.0, 1.515, 1.34, 1.19, 0.15, 2.3, 2.0),
    (-0.92, 1.555, 1.33, 1.13, 0.215, 2.4, 2.1),
    (-0.80, 1.585, 1.32, 1.10, 0.255, 2.5, 2.2),
    (-0.62, 1.603, 1.31, 1.07, 0.282, 2.5, 2.2),
    (-0.45, 1.598, 1.30, 1.035, 0.296, 2.5, 2.2),
    (-0.25, 1.58, 1.28, 0.985, 0.306, 2.4, 2.1),
    (-0.05, 1.556, 1.275, 0.962, 0.31, 2.4, 2.0),
    (0.12, 1.57, 1.28, 0.972, 0.298, 2.35, 2.0),
    (0.26, 1.605, 1.30, 1.0, 0.272, 2.2, 2.0),
    (0.38, 1.638, 1.32, 1.05, 0.235, 2.0, 2.0),
    (0.48, 1.628, 1.33, 1.10, 0.205, 1.9, 2.0),
    (0.56, 1.585, 1.34, 1.17, 0.165, 1.9, 2.0),
    (0.62, 1.50, 1.33, 1.24, 0.11, 2.0, 2.0),
]
# neck: path (y, z), section toward the crest (top), toward the throat (bot), half width, exponents
NECK = [
    (1.35, 0.46, 0.29, 0.25, 0.2, 1.9, 2.0),
    (1.47, 0.64, 0.25, 0.215, 0.165, 1.9, 2.0),
    (1.60, 0.81, 0.205, 0.172, 0.128, 1.9, 2.1),
    (1.73, 0.935, 0.162, 0.125, 0.09, 2.0, 2.1),
    (1.83, 1.01, 0.125, 0.095, 0.074, 2.0, 2.1),
]
# head: along HA from the poll, toward the forehead (top), height of widest, toward the jaw (bot), half width
HEAD = [
    (-0.03, 0.035, -0.03, -0.1, 0.062, 2.2, 2.0),
    (0.03, 0.066, -0.03, -0.16, 0.09, 2.5, 1.8),
    (0.1, 0.074, -0.025, -0.215, 0.102, 2.8, 1.7),
    (0.17, 0.074, -0.02, -0.225, 0.103, 2.8, 1.7),
    (0.24, 0.07, -0.02, -0.2, 0.09, 2.6, 1.8),
    (0.3, 0.065, -0.018, -0.16, 0.076, 2.4, 2.0),
    (0.37, 0.061, -0.016, -0.13, 0.068, 2.3, 2.1),
    (0.44, 0.057, -0.015, -0.118, 0.063, 2.3, 2.2),
    (0.52, 0.055, -0.014, -0.104, 0.064, 2.3, 2.3),
    (0.58, 0.05, -0.016, -0.098, 0.069, 2.3, 2.4),
    (0.63, 0.04, -0.022, -0.095, 0.068, 2.4, 2.4),
    (0.665, 0.02, -0.03, -0.088, 0.058, 2.2, 2.2),
]
# legs: sweeps down the leg (y, z), section toward the front (top), toward the back (bot), half width, exponents, column x
FORE = [
    (1.12, 0.29, 0.12, 0.13, 0.095, 2.2, 2.2, 0.165),
    (0.97, 0.287, 0.098, 0.092, 0.078, 2.2, 2.2, 0.175),
    (0.83, 0.29, 0.076, 0.06, 0.06, 2.2, 2.3, 0.178),
    (0.68, 0.29, 0.054, 0.046, 0.048, 2.3, 2.4, 0.178),
    (0.55, 0.29, 0.046, 0.041, 0.044, 2.4, 2.4, 0.178),
]
HIND = [
    (1.32, -0.70, 0.30, 0.34, 0.13, 2.2, 2.2, 0.16),
    (1.15, -0.67, 0.265, 0.335, 0.125, 2.2, 2.2, 0.19),
    (1.0, -0.67, 0.215, 0.27, 0.105, 2.1, 2.1, 0.2),
    (0.87, -0.69, 0.14, 0.185, 0.078, 2.1, 2.2, 0.2),
    (0.76, -0.725, 0.082, 0.125, 0.058, 2.2, 2.2, 0.195),
    (0.67, -0.755, 0.062, 0.09, 0.05, 2.3, 2.2, 0.19),
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


def hframe(Q):
    """head frame coordinates (x side, u up, s along) of rig points"""
    D = Q - HO
    return np.stack([D[:, 0], D @ HU, (D @ HA) / HS], 1)


def eround(Q, a, b, ra, rb, sx=1.0, cx=0.0):
    """round cone squashed across x by sx about the column x = cx (flat legs, tendons)"""
    R = Q.copy(); R[:, 0] = cx + (R[:, 0] - cx) / sx
    a = np.array(a, F); b = np.array(b, F)
    a[0] = cx + (a[0] - cx) / sx; b[0] = cx + (b[0] - cx) / sx
    return round_cone(R, a, b, ra, rb) * min(1.0, sx)


# ---------- trunk and muscles ----------
def trunk(P):
    Q = _mirror(P)
    d = loft(Q, TRUNK)
    # shoulder: the muscles over the shoulder blade, a broad low mound from the withers to the point of shoulder
    sc0, sc1 = V(0.13, 1.55, 0.33), V(0.2, 1.27, 0.5)
    d = smin(d, ellipsoid(Q, (sc0 + sc1) * 0.5 + V(-0.04, -0.06, 0.01), V(0.07, 0.14, 0.12)), 0.12)
    d = smin(d, ellipsoid(Q, V(0.18, 1.245, 0.52), V(0.055, 0.06, 0.055)), 0.08)            # point of shoulder
    d = smin(d, ellipsoid(Q, V(0.17, 1.15, 0.34), V(0.09, 0.13, 0.12)), 0.1)               # triceps over the elbow
    d = smin(d, ellipsoid(Q, V(0.06, 1.16, 0.52), V(0.075, 0.12, 0.07)), 0.1)              # breast (pectorals)
    # hindquarters: croup and gluteals (round from behind), the buttock behind, the point of hip
    d = smin(d, ellipsoid(Q, V(0.13, 1.4, -0.75), V(0.17, 0.19, 0.31)), 0.12)
    d = smin(d, ellipsoid(Q, V(0.2, 1.3, -0.74), V(0.1, 0.2, 0.25)), 0.1)
    d = smin(d, ellipsoid(Q, V(0.11, 1.27, -0.955), V(0.1, 0.2, 0.11)), 0.09)              # buttock (hamstrings)
    # flank: skin from the belly to the stifle
    d = smin(d, ellipsoid(Q, V(0.17, 1.08, -0.45), V(0.08, 0.09, 0.13)), 0.08)
    d = smin(d, ellipsoid(Q, V(0.215, 1.45, -0.47), V(0.035, 0.035, 0.04)), 0.09)          # point of hip
    # belly: round and a little low
    d = smin(d, ellipsoid(Q, V(0.0, 1.07, -0.12), V(0.27, 0.13, 0.33)), 0.08)
    return d


def neck(P):
    Q = _mirror(P)
    d = sweep(Q, NECK)
    # the top of the neck behind the poll, up to the back of the skull
    d = smin(d, ellipsoid(Q, V(0.0, 1.89, 0.97), V(0.07, 0.07, 0.1)), 0.05)
    # crest: the arched top line of the neck
    d = smin(d, sweep(Q, [(1.57, 0.36, 0.01, 0.06, 0.04, 2, 2), (1.75, 0.66, 0.03, 0.06, 0.055, 2, 2), (1.88, 0.86, 0.025, 0.05, 0.05, 2, 2), (1.95, 0.98, 0.02, 0.045, 0.045, 2, 2), (1.97, 1.03, 0.018, 0.04, 0.04, 2, 2)]), 0.06)
    return d


def head(P):
    Q = _mirror(P)
    L = hframe(Q)
    d = loft(L, HEAD)
    # cheek: the big flat round chewing muscle over the back of the jaw
    d = smin(d, superellipsoid(L, V(0.07, -0.135, 0.15), (0.046, 0.11, 0.13), 2.6), 0.015)
    # facial crest: a bony ridge from under the eye forward along the cheek
    d = smin(d, round_cone(L, V(0.086, -0.035, 0.2), V(0.072, -0.06, 0.32), 0.008, 0.004), 0.025)
    # muzzle: soft upper lip in front, chin under the lower lip
    d = smin(d, ellipsoid(L, V(0.0, -0.04, 0.635), V(0.058, 0.045, 0.034)), 0.03)
    d = smin(d, ellipsoid(L, V(0.0, -0.098, 0.58), V(0.038, 0.026, 0.04)), 0.025)
    # mouth: a slit from the front of the lips back to the corner
    M = L * V(1, 2.4, 1)
    m = round_cone(M, V(0.0, -0.072 * 2.4, 0.668), V(0.045, -0.072 * 2.4, 0.625), 0.004, 0.004)
    m = smin(m, round_cone(M, V(0.045, -0.072 * 2.4, 0.625), V(0.052, -0.074 * 2.4, 0.565), 0.004, 0.001), 0.003)
    d = smax(d, -(m + 0.002) / 2.0, 0.004)
    # nostrils: a flared rim around a deep comma shaped opening that faces forward and out
    nn = NOS_N
    nu = nrm(np.array([0, 1, 0], F) - nn * nn[1])
    ns = np.cross(nu, nn)
    D = L - NOS_C
    a, b, c = D @ ns, D @ nu, D @ nn
    N = np.stack([a, b, c], 1)
    pit = ellipsoid(N, V(0.0, 0.008, 0.0), V(0.011, 0.024, 0.03))
    pit = smin(pit, ellipsoid(N, V(0.008, -0.017, 0.0), V(0.008, 0.013, 0.026)), 0.012)
    d = smin(d, ellipsoid(N, V(0.0, 0.0, -0.008), V(0.026, 0.038, 0.02)), 0.016)
    # the flared rim around the opening (alar fold), then the opening
    rim = smax(np.abs(pit + 0.0055) - 0.0048, N[:, 2] - 0.012, 0.004)
    d = smin(d, rim, 0.004)
    d = smax(d, -pit, 0.003)
    return d


def jawline(P):
    """the back and lower edge of the jaw: a soft groove around the cheek where it meets the throat"""
    Q = _mirror(P)
    L = hframe(Q)
    ch = superellipsoid(L, V(0.07, -0.135, 0.15), (0.046, 0.11, 0.13), 2.6)
    cu, cs = L[:, 1] + 0.135, L[:, 2] - 0.15
    m = np.clip(sstep(0.0, -0.08, cs) + sstep(-0.04, -0.09, cu), 0, 1) * sstep(0.03, 0.06, Q[:, 0])
    return groove(ch + 0.002, 0.009, 0.0045) * m


def ear(P):
    """cupped, pointed ear standing up (left side, mirrored)"""
    Q = _mirror(P)
    B, A, Nn = EAR_B, EAR_A, EAR_N
    C = np.cross(Nn, A)
    D = Q - B
    a, c, n = D @ A, D @ C, D @ Nn
    u = np.clip(a / EAR_L, 0, 1)
    hw = 0.038 * np.maximum(np.sin(np.pi * np.clip(u * 0.8 + 0.2, 0, 1)), 0) ** 0.75 * (1 - 0.25 * u) + 0.0012
    # deep cup facing forward and out, thinner toward the tip which turns in a little
    k = np.clip(c / np.maximum(hw, 1e-4), -1.2, 1.2)
    mid = hw * k * k * 0.7 * (1 - 0.55 * u) - 0.01 * (1 - u) ** 1.5
    th = 0.5 * (0.011 * (1 - u) + 0.0035 * u)
    d_out = np.abs(c - 0.006 * u * u) - hw
    d_th = np.abs(n - mid) - th
    d_end = np.maximum(-a, a - EAR_L)
    d = smax(smax(d_out, d_th, 0.003), d_end, 0.006)
    # round base where the ear meets the poll
    d = smin(d, ellipsoid(Q, B + A * 0.012 - Nn * 0.01, V(0.03, 0.028, 0.026)), 0.012)
    return d


def eye_parts(P):
    """lid mound around the eye (add), the opening in front of the eye (carve), the eyeball (add), brow ridge (add)"""
    Q = _mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.001, -0.003), V(EYE_R + 0.009, EYE_R + 0.0075, EYE_R + 0.0035))
    ua = u - LID_OFF
    ap = np.sqrt((s / LID_W) ** 2 + (ua / LID_H) ** 2) - 1
    ap = ap + 0.25 * sstep(0.45, 1.0, np.abs(s) / LID_W) * (np.abs(ua) / LID_H)
    carve = smax(ap * LID_H, -g, 0.0015)
    ball = length(D) - EYE_R * 0.86
    # bony orbit rim above and behind the eye
    brow = round_cone(L, V(-0.03, 0.026, -0.016), V(0.012, 0.03, -0.012), 0.008, 0.006)
    return carve, lids, ball, brow


# ---------- legs ----------
def fleg(P):
    Q = _mirror(P)
    x = XF
    # forearm: muscular at the top, tapering to the knee; extensor muscles in front
    d = sweep(Q, FORE, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(x + 0.012, 0.85, 0.318), V(0.045, 0.12, 0.04)), 0.03)
    d = smin(d, ellipsoid(Q, V(x - 0.006, 1.03, 0.205), V(0.035, 0.045, 0.04)), 0.05)        # point of elbow
    # knee: flat in front, the accessory carpal bone behind
    d = smin(d, superellipsoid(Q, V(x, 0.505, 0.29), (0.042, 0.055, 0.04), 2.8), 0.035)
    d = smin(d, ellipsoid(Q, V(x, 0.525, 0.25), V(0.019, 0.026, 0.018)), 0.012)
    # cannon: bone in front, tendons behind with a groove between
    d = smin(d, eround(Q, V(x, 0.48, 0.302), V(x, 0.27, 0.304), 0.029, 0.027, 0.95, x), 0.02)
    d = smin(d, eround(Q, V(x, 0.45, 0.268), V(x, 0.27, 0.267), 0.017, 0.019, 1.15, x), 0.02)
    d = smin(d, chestnuts(P), 0.006)
    return d


CHEST_F = (V(XF - 0.043, 0.635, 0.29), V(0.008, 0.026, 0.017))      # chestnuts: horny patches inside the legs
CHEST_H = (V(XH - 0.047, 0.555, -0.755), V(0.007, 0.019, 0.013))


def chestnuts(P):
    Q = _mirror(P)
    return np.minimum(ellipsoid(Q, *CHEST_F), ellipsoid(Q, *CHEST_H))


def fpastern(P):
    Q = _mirror(P)
    x = XF
    d = ellipsoid(Q, V(x, 0.235, 0.29), V(0.038, 0.048, 0.046))                            # fetlock
    d = smin(d, ellipsoid(Q, V(x, 0.205, 0.252), V(0.016, 0.014, 0.016)), 0.01)              # ergot
    d = smin(d, round_cone(Q, V(x, 0.22, 0.302), V(x, 0.1, 0.334), 0.033, 0.041), 0.015)   # pastern
    d = smin(d, ellipsoid(Q, V(x, 0.098, 0.338), V(0.047, 0.016, 0.05)), 0.012)              # coronet band
    return d


def hleg(P):
    Q = _mirror(P)
    x = XH
    # thigh and gaskin, the stifle in front
    d = sweep(Q, HIND, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(0.215, 1.0, -0.45), V(0.05, 0.06, 0.05)), 0.07)
    # hamstring down to the point of hock (the Achilles tendon), hollow in front of it
    d = smin(d, eround(Q, V(x, 0.9, -0.86), V(x, 0.675, -0.842), 0.024, 0.026, 0.8, x), 0.03)
    # hock: broad, angular joint
    d = smin(d, superellipsoid(Q, V(x, 0.625, -0.765), (0.05, 0.055, 0.058), 2.5), 0.03)
    d = smin(d, ellipsoid(Q, V(x - 0.006, 0.66, -0.836), V(0.025, 0.035, 0.025)), 0.015)    # point of hock
    # cannon: bone and tendons
    d = smin(d, eround(Q, V(x, 0.58, -0.742), V(x, 0.28, -0.728), 0.031, 0.028, 0.95, x), 0.02)
    d = smin(d, eround(Q, V(x, 0.56, -0.781), V(x, 0.28, -0.768), 0.018, 0.019, 1.15, x), 0.02)
    d = smin(d, chestnuts(P), 0.006)
    return d


def hpastern(P):
    Q = _mirror(P)
    x = XH
    d = ellipsoid(Q, V(x, 0.245, -0.74), V(0.037, 0.048, 0.045))
    d = smin(d, ellipsoid(Q, V(x, 0.215, -0.778), V(0.015, 0.014, 0.016)), 0.01)
    d = smin(d, round_cone(Q, V(x, 0.23, -0.728), V(x, 0.1, -0.696), 0.032, 0.039), 0.015)
    d = smin(d, ellipsoid(Q, V(x, 0.096, -0.692), V(0.045, 0.016, 0.048)), 0.012)
    return d


def hoof(Q, c, rx, rz, hf, hh, slope):
    """hoof: a slanted cone on an oval sole; hf height at the toe, hh at the heels, slope = how far the coronet
    sits back from the toe per meter of height"""
    x, y, z = Q[:, 0] - c[0], Q[:, 1], Q[:, 2] - c[2]
    k = np.clip(y / hf, 0, 1.2)
    zc = z + slope * y * 0.5
    r = np.sqrt((x / (rx * (1 - 0.15 * k))) ** 2 + (zc / (rz * (1 - 0.22 * k))) ** 2)
    d_side = (r - 1) * rx * (1 - 0.18 * k)
    top = hh + (hf - hh) * sat(0.5 + zc / (2 * rz))
    d = smax(smax(d_side, y - top, 0.012), -y + 0.0005, 0.006)
    return d


def hooves(P):
    Q = _mirror(P)
    hf = hoof(Q, HOOF_F, 0.058, 0.064, 0.096, 0.048, 0.7)
    hh = hoof(Q, HOOF_H, 0.054, 0.062, 0.094, 0.048, 0.6)
    return np.minimum(hf, hh)


# ---------- muscle grooves and folds (meters, carved into the surface) ----------
def folds(P):
    Q = _mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    c = np.zeros(len(P), F)
    w = 0.01 * (vnoise(Q * V(8, 20, 8), 3) - 0.5)
    side = sstep(0.12, 0.2, x)
    # front edge of the shoulder blade and the line between the triceps and the shoulder
    c += groove(z - 0.53 + 0.62 * (y - 1.25) + w, 0.025, 0.0022) * side * sstep(1.2, 1.3, y) * sstep(1.55, 1.45, y)
    c += groove(z - 0.36 - 0.3 * (y - 1.2) + w, 0.02, 0.003) * side * sstep(1.0, 1.08, y) * sstep(1.3, 1.22, y)
    # jugular groove low on the side of the neck
    c += groove((z - 0.62) * 0.72 - (y - 1.3) * 0.69 + 0.05 + w * 0.5, 0.03, 0.0018) * sstep(0.05, 0.1, x) * sstep(1.25, 1.42, y) * sstep(1.8, 1.62, y)
    # hindquarters: the line down the back of the thigh between the big muscles
    c += groove(z + 0.86 - 0.18 * (y - 1.2) + w, 0.02, 0.0035) * sstep(0.1, 0.16, x) * sstep(0.95, 1.05, y) * sstep(1.45, 1.35, y)
    # flank fold in front of the stifle
    c += groove(z + 0.37 - 0.45 * (y - 1.05) + w * 0.6, 0.015, 0.004) * sstep(0.2, 0.25, x) * sstep(0.98, 1.04, y) * sstep(1.22, 1.12, y)
    # hollow in front of the hamstring above the hock
    c += groove(z + 0.81 + 0.05 * (y - 0.75), 0.014, 0.004) * sstep(0.68, 0.72, y) * sstep(0.88, 0.8, y) * sstep(0.15, 0.17, x)
    # faint ribs on the barrel
    rib = np.sin((z + 0.1 * (y - 1.2)) * 2 * np.pi / 0.085)
    c += 0.0007 * sstep(0.6, 1.0, rib) * sstep(0.26, 0.3, x) * sstep(1.05, 1.15, y) * sstep(1.4, 1.3, y) * sstep(-0.35, -0.2, z) * sstep(0.25, 0.1, z)
    return c


def parts(P):
    so, li, ba, br = eye_parts(P)
    tp, tr = tail_curve(16)
    dock = np.min(np.stack([round_cone(P, tp[i], tp[i + 1], tr[i], tr[i + 1]) for i in range(len(tp) - 1)]), 0)
    return {'trunk': trunk(P), 'neck': neck(P), 'head': head(P), 'ear': ear(P), 'lids': li, 'ball': ba, 'fleg': fleg(P), 'hleg': hleg(P),
            'fpas': fpastern(P), 'hpas': hpastern(P), 'hoof': hooves(P), 'chest': chestnuts(P), 'dock': dock}


def shape(P):
    d = trunk(P)
    d = smin(d, _local(P, (-0.32, 1.1, 0.25), (0.32, 2.05, 1.15), neck), 0.08)
    h = _local(P, (-0.17, 1.25, 0.72), (0.17, 2.06, 1.56), head)
    ca, li, ba, br = _local_n(P, (-0.15, 1.72, 1.09), (0.15, 1.9, 1.27), eye_parts, 4)
    h = smin(h, li, 0.012)
    h = smin(h, br, 0.012)
    h = smax(h, -ca, 0.004)
    h = smin(h, ba, 0.0015)
    d = smin(d, h, 0.045)
    d = d + _local(P, (-0.17, 1.4, 0.75), (0.17, 2.0, 1.25), jawline, far=0.0)
    d = smin(d, _local(P, (-0.2, 1.88, 0.92), (0.2, 2.2, 1.18), ear), 0.012)
    fl = _local(P, (-0.3, 0.2, 0.1), (0.3, 1.25, 0.45), fleg)
    d = smin(d, fl, 0.06)
    hl = _local(P, (-0.36, 0.22, -1.1), (0.36, 1.5, -0.3), hleg)
    d = smin(d, hl, 0.06)
    fp = _local(P, (-0.24, 0.08, 0.22), (0.24, 0.29, 0.38), fpastern)
    hpp = _local(P, (-0.25, 0.08, -0.81), (0.25, 0.29, -0.65), hpastern)
    d = smin(d, smin(fp, hpp, 0.0), 0.02)
    ho = _local(P, (-0.26, -0.01, 0.28), (0.26, 0.12, 0.45), hooves)
    ho = np.minimum(ho, _local(P, (-0.27, -0.01, -0.75), (0.27, 0.12, -0.58), hooves))
    d = smin(d, ho, 0.008)
    d = d + _local(P, (-0.36, 0.6, -1.1), (0.36, 1.8, 0.75), folds, far=0.0)
    return d


# ---------- tail dock: an explicit tube (the hair is cards) ----------
def tail_curve(n=40):
    pts, rad = [], []
    for i in range(n + 1):
        u = i / n
        p = V(0.0, 1.535 - 0.2 * u ** 1.3, -0.955 - 0.13 * u + 0.03 * u * u)
        pts.append(p)
        rad.append(0.042 * (1 - u) + 0.022 * u)
    return np.array(pts, F), np.array(rad, F)


TAIL_RINGS = 12

# camera views for tools/blender/preview.py: position, target, field of view (game rig space)
PREVIEW = {
    'side': ((5.6, 1.2, 0.15), (0, 1.05, 0.15), 30),
    'front3q': ((3.2, 1.8, 3.6), (0, 1.05, 0.2), 30),
    'front': ((0.0, 1.3, 5.5), (0, 1.05, 0.0), 26),
    'rear3q': ((-2.8, 1.9, -3.8), (0, 1.05, -0.2), 30),
    'face': ((0.75, 1.85, 2.45), (0, 1.66, 1.2), 24),
    'faceside': ((1.6, 1.75, 1.35), (0.0, 1.68, 1.2), 22),
    'feet': ((1.1, 0.35, 1.2), (0.18, 0.25, 0.1), 32),
    'hind': ((1.4, 0.8, -1.6), (0.15, 0.7, -0.7), 36),
    'eye': ((0.55, 1.86, 1.38), (0.096, 1.79, 1.18), 12),
    'muzzle': ((0.45, 1.5, 1.85), (0.03, 1.44, 1.45), 18),
    'headside': ((2.3, 1.62, 1.08), (0, 1.62, 1.08), 26),
}

# ---------- skinning ----------
WEIGHT_SMOOTH = (6, 0.5)   # laplacian smoothing passes over the game mesh, strength


def bone_tips(P):
    """bone segments for automatic weights (WEIGHTS=heat): each pivot to the next joint (or a tip point)"""
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['neck2'], 'neck2': P['head'], 'head': hp(HL, -0.03), 'mane1': P['mane2'], 'mane2': P['head'],
         'tail1': P['tail2'], 'tail2': P['tail3'], 'tail3': P['tail3'] + V(0, -0.3, 0)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (HOOF_H + V(0, 0.01, 0.06)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (HOOF_F + V(0, 0.01, 0.06)) * m
        t['ear' + s] = (EAR_B + EAR_A * EAR_L) * m
    return t


def keep(P):
    """1 where the game mesh keeps more of the sculpt when decimating: eyes, nostrils and lips, ears, hooves"""
    Pm = np.abs(P) * V(1, 0, 0) + P * V(0, 1, 1)
    e = sstep(0.05, 0.028, np.linalg.norm(Pm - EYE_C, axis=1))
    L = hframe(Pm)
    m = sstep(0.52, 0.58, L[:, 2]) * sstep(-0.2, -0.1, L[:, 1]) * 0.85
    a = (Pm - EAR_B) @ EAR_A
    ed = np.linalg.norm((Pm - EAR_B) - np.outer(a, EAR_A), axis=1)
    er = sstep(-0.02, 0.0, a) * sstep(0.07, 0.045, ed) * 0.8
    h = sstep(0.13, 0.09, Pm[:, 1]) * 0.6
    return np.maximum.reduce([e, m, er, h])


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    tail = np.zeros(len(wpos), bool); tail[weld[G['tail']]] = True
    # the dock: tail1 at the root, more tail2 toward its end
    tp, _ = tail_curve(40)
    if tail.any():
        ax = tp[-1] - tp[0]
        t = np.clip(((wpos[tail] - tp[0]) @ ax) / float(ax @ ax), 0, 1)
        W[tail] = 0
        W[tail, bi['tail1']] = 1 - 0.6 * t
        W[tail, bi['tail2']] = 0.6 * t
    body = ~tail
    # the coat under the mane rides on the neck (the mane bones move only the hair); no tail weights on the rump
    for mb, nb in (('mane1', 'neck'), ('mane2', 'neck2'), ('tail1', 'hips'), ('tail2', 'hips'), ('tail3', 'hips')):
        W[body, bi[nb]] += W[body, bi[mb]]
        W[body, bi[mb]] = 0
    W[:, bi['ctag']] = 0
    # hooves ride on the foot bones only
    for s in 'LR':
        sg = 1 if s == 'L' else -1
        for f, paw in ((HOOF_F, 'fpaw'), (HOOF_H, 'hpaw')):
            near = (np.abs(wpos[:, 0] - sg * f[0]) < 0.09) & (np.abs(wpos[:, 2] - f[2]) < 0.1) & (wpos[:, 1] < 0.105)
            W[near] = 0; W[near, bi[paw + s]] = 1
    return W


# ---------- coat paint (sRGB 0..1) and fine detail (meters), evaluated on the baked surface ----------
def _hex(h):
    return np.array([((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255], F)


K = {
    'bay': _hex(0x67331A), 'bayLt': _hex(0x8C4824), 'bayDk': _hex(0x43200F), 'black': _hex(0x18120F), 'blackHi': _hex(0x2E241E),
    'muzzle': _hex(0x271D1A), 'skin': _hex(0x2C2220), 'nostril': _hex(0x120C0B), 'white': _hex(0xE4DCCF), 'hoof': _hex(0x2B2622), 'hoofHi': _hex(0x4D463F),
    'chest': _hex(0x3B3330), 'earIn': _hex(0x6E5A4C), 'ball': _hex(0x100A08), 'lid': _hex(0x2B1E18),
}


def _mix(c, k, t):
    t = np.clip(t, 0, 1)[:, None]
    return c + (k - c) * t


def flow(P, N=None):
    """direction the coat lies in: back along the body and down its sides, down the neck from the crest, down the
    face toward the muzzle, down the legs, out along the ears"""
    Q = _mirror(P)
    y, z = Q[:, 1], Q[:, 2]
    one = np.ones_like(y)
    body = np.stack([0 * y, -(0.12 + 0.9 * sstep(1.45, 1.1, y)), -one], 1)
    neckd = np.stack([0 * y, -0.75 * one, -0.45 * one], 1)
    legd = np.stack([0 * y, -one, -0.12 * one], 1)
    head = np.tile(HA, (len(P), 1))
    L = hframe(Q)
    wh = sstep(-0.06, 0.02, L[:, 2]) * sstep(-0.32, -0.25, L[:, 1])
    wn = sstep(0.42, 0.62, z) * sstep(1.2, 1.38, y) * (1 - wh)
    wl = sstep(1.0, 0.86, y) * (1 - wh - wn)
    a = (Q - EAR_B) @ EAR_A
    we = sstep(-0.005, 0.02, a) * sstep(0.07, 0.04, np.linalg.norm((Q - EAR_B) - np.outer(a, EAR_A), axis=1))
    f = body * (1 - wh - wn - wl)[:, None] + head * wh[:, None] + neckd * wn[:, None] + legd * wl[:, None]
    f = f * (1 - we)[:, None] + EAR_A[None, :] * we[:, None]
    f = f / np.maximum(np.linalg.norm(f, axis=1, keepdims=True), 1e-9)
    f[:, 0] *= np.sign(P[:, 0] + 1e-12)
    return f.astype(F)


def _regions(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    r = {}
    Pm = P.copy(); Pm[:, 0] = np.abs(x)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(x + 1e-9)
    r['Pm'] = Pm
    r['hoof'] = sstep(0.003, 0.0005, c['hoof'])
    r['chest'] = sstep(0.003, 0.0, c['chest'])
    r['dock'] = sstep(0.006, 0.0, c['dock']) * sstep(-0.94, -0.97, z)
    r['ear'] = sstep(0.004, 0.0008, c['ear']) * sstep(-0.01, 0.015, (Pm - EAR_B) @ EAR_A)
    r['earIn'] = sstep(-0.1, 0.4, Nm @ EAR_N)
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    r['eyeD'] = de
    r['ball'] = sstep(0.0012, 0.0003, c['ball']) * sstep(EYE_R + 0.004, EYE_R + 0.001, de)
    r['lid'] = sstep(EYE_R + 0.009, EYE_R + 0.004, de) * (1 - r['ball'])
    L = hframe(Pm)
    r['L'] = L
    r['head'] = sstep(-0.06, -0.02, L[:, 2]) * sstep(0.01, 0.0, c['head'])
    r['muzzle'] = sstep(0.5, 0.6, L[:, 2]) * r['head']
    D = L - NOS_C
    r['nos'] = sstep(0.03, 0.012, np.linalg.norm(D * V(1, 0.7, 1), axis=1))
    n1 = vnoise(Pm * 9, 61) - 0.5
    front = sstep(0.12, 0.2, z) * sstep(1.1, 0.9, y)
    hind = sstep(-0.4, -0.5, z) * sstep(1.1, 0.9, y)
    r['points'] = front * sstep(0.6 + 0.04 * n1, 0.5 + 0.04 * n1, y) + hind * sstep(0.7 + 0.04 * n1, 0.6 + 0.04 * n1, y)
    r['leg'] = sstep(1.0, 0.86, y)
    r['belly'] = sstep(-0.3, -0.8, N[:, 1]) * sstep(1.2, 1.05, y) * (1 - r['leg'])
    r['top'] = sstep(0.2, 0.8, N[:, 1])
    cr = Nm[:, 1] * 0.82 - Nm[:, 2] * 0.57
    r['crest'] = sstep(0.04, 0.02, Pm[:, 0]) * sstep(0.6, 0.8, cr) * sstep(0.36, 0.42, z) * sstep(0.98, 0.9, z) * sstep(1.55, 1.62, y) * (1 - r['head'])
    sd = np.sqrt(Pm[:, 0] ** 2 * 1.3 + ((L[:, 2] - 0.15) * 0.7) ** 2) + 0.007 * (vnoise(Pm * 150, 62) - 0.5) + 0.005 * (vnoise(Pm * 50, 63) - 0.5)
    r['star'] = sstep(0.017, 0.012, sd) * sstep(0.035, 0.055, L[:, 1]) * r['head']
    return r


def strands(P, N, dens, cell=0.0032, l0=0.006, l1=0.012, wid=0.00045, seed=70):
    """coat hairs as short strokes along the flow: one possible stroke per cell (texture bombing, so the strokes follow
    the flow wherever it turns). Returns coverage 0..1"""
    from sdf import _hash
    out = np.zeros(len(P), F)
    on = dens > 0.01
    Q, Nq, D = P[on], N[on], dens[on]
    G = np.floor(Q / cell).astype(np.int64)
    best = np.zeros(len(Q), F)
    for dz in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                c = G + np.array([dx, dy, dz])
                h0, h1, h2, h3, h4 = (_hash(c[:, 0], c[:, 1], c[:, 2], seed + s) for s in range(5))
                s0 = ((c + np.stack([h0, h1, h2], 1)) * cell).astype(F)
                fl = flow(s0)
                fl = fl - Nq * (fl * Nq).sum(1, keepdims=True)
                fl /= np.maximum(np.linalg.norm(fl, axis=1, keepdims=True), 1e-9)
                Lh = l0 + (l1 - l0) * h4
                rr = Q - s0
                rr = rr - Nq * (rr * Nq).sum(1, keepdims=True)
                t = np.clip((rr * fl).sum(1) / Lh, 0, 1)
                dist = np.linalg.norm(rr - fl * (Lh * t)[:, None], axis=1)
                w = wid * (1 - 0.6 * t)
                line = sstep(w * 2.0, w * 0.3, dist) * (1 - 0.4 * t) * (h3 < D)
                best = np.maximum(best, line * (0.6 + 0.4 * h0))
    out[on] = best
    return out


_scache = {}


def _strands(P, N, R):
    key = (len(P), float(P[:7].sum()))
    if key not in _scache:
        dens = 0.85 * (1 - R['hoof']) * (1 - R['chest']) * (1 - R['ball']) * (1 - R['muzzle'] * 0.6) * sstep(EYE_R + 0.006, EYE_R + 0.012, R['eyeD'])
        _scache[key] = strands(P, N, dens)
    return _scache[key]


def paint(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    n1 = fbm(Pm * 5, 3, 11)
    n2 = fbm(Pm * 22, 3, 12)
    col = np.tile(K['bay'], (len(P), 1))
    # warmer and lighter on the flanks and shoulder, a touch darker along the back and under the belly
    col = _mix(col, K['bayLt'], sstep(0.2, 0.75, np.abs(N[:, 0])) * sstep(-0.3, 0.3, N[:, 1]) * 0.35)
    col = _mix(col, K['bayDk'], R['top'] * 0.25 + R['belly'] * 0.3)
    col *= (0.94 + 0.12 * n1)[:, None]
    # soft dapples on the barrel and hindquarters
    f1, f2 = worley(Pm * 14, 21)
    dap = sstep(0.05, 0.3, f2 - f1) * sstep(0.95, 1.15, y) * sstep(1.0, 1.15, y) * sstep(0.2, -0.1, z) * (1 - R['leg'])
    col = _mix(col, K['bayLt'], dap * 0.18)
    # the coat darkens into the black points: lower legs, mane line, ear rims, dock
    col = _mix(col, K['bayDk'], R['leg'] * 0.25)
    pts = R['points']
    blk = _mix(np.tile(K['black'], (len(P), 1)), K['blackHi'], n2 * 0.7)
    col = _mix(col, blk, pts)
    col = _mix(col, blk, R['crest'] * 0.9 + R['dock'])
    a = (Pm - EAR_B) @ EAR_A
    ed = np.abs(((Pm - EAR_B) @ np.cross(EAR_N, EAR_A)))
    rim = R['ear'] * np.maximum(sstep(0.11, 0.15, a), sstep(0.022, 0.034, ed) * (1 - R['earIn']))
    col = _mix(col, blk, rim * 0.9)
    col = _mix(col, K['earIn'], R['ear'] * R['earIn'] * sstep(0.02, 0.05, a) * 0.85)
    # face: darker around the eyes and down to a dark soft muzzle; a small white star on the forehead
    col = _mix(col, K['bayDk'], sstep(0.045, 0.026, R['eyeD']) * 0.3)
    col = _mix(col, K['lid'], R['lid'])
    col = _mix(col, K['bayDk'], sstep(0.38, 0.5, L[:, 2]) * R['head'] * 0.6)
    col = _mix(col, K['muzzle'], R['muzzle'])
    col = _mix(col, K['nostril'], R['nos'] * R['muzzle'] * sstep(0.004, -0.004, c['head']) * 0.9)
    col = _mix(col, K['white'], R['star'] * (0.85 + 0.15 * n2))
    # hooves: dark horn with lighter streaks; chestnuts grey and horny
    hcol = _mix(np.tile(K['hoof'], (len(P), 1)), K['hoofHi'], sstep(0.4, 0.8, vnoise(Pm * V(500, 25, 500), 15)) * 0.7 + sstep(0.02, 0.0, y) * 0.3)
    col = _mix(col, hcol, R['hoof'])
    col = _mix(col, K['chest'] * (0.8 + 0.4 * n2[:, None]), R['chest'])
    # coat hairs: fine strokes, a little lighter or darker than the coat around them
    s = _strands(P, N, R)
    col *= (1 + (s * 0.16 - 0.05) * (1 - R['hoof']))[:, None]
    col = _mix(col, K['ball'], R['ball'])
    rough = 0.44 + 0.08 * (n2 - 0.5)
    rough = rough + 0.15 * R['muzzle'] - 0.2 * R['hoof'] + 0.15 * R['chest'] + 0.12 * pts - 0.25 * R['lid'] * sstep(EYE_R + 0.008, EYE_R + 0.004, R['eyeD'])
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    h = np.zeros(len(P), F)
    skin = (1 - R['hoof']) * (1 - R['ball'])
    # coat: the hair strokes
    h += 0.00004 * _strands(P, N, R) * skin
    # veins over the face and down the legs
    v1, v2 = worley(Pm * V(30, 9, 30), 31)
    vein = sstep(0.06, 0.0, v2 - v1) * (sstep(1.0, 0.75, y) * (1 - R['points'] * 0.5) * sstep(0.3, 0.45, y) + R['head'] * sstep(0.18, 0.3, L[:, 2]) * sstep(0.5, 0.42, L[:, 2]))
    h += 0.00018 * vein * skin
    # muzzle: soft wrinkled skin, whisker pores, lips
    g1, _ = worley(Pm / 0.0035, 58)
    h -= 0.00012 * sstep(0.35, 0.1, g1) * R['muzzle']
    wr = np.abs(np.sin(np.pi * (np.linalg.norm(L - NOS_C, axis=1) / 0.004 + 0.6 * fbm(Pm * 80, 2, 54))))
    h -= 0.00015 * np.exp(-(wr / 0.3) ** 2) * R['nos'] * R['muzzle']
    # wrinkles in front of the hocks and knees and above the fetlocks
    yr = np.abs(np.sin(np.pi * (y / 0.006 + 0.4 * fbm(Pm * 50, 2, 57))))
    for jc in (V(XF, 0.5, 0.33), V(XH, 0.62, -0.705), V(XF, 0.27, 0.33), V(XH, 0.28, -0.69)):
        h -= 0.00012 * np.exp(-(yr / 0.3) ** 2) * sstep(0.05, 0.02, np.linalg.norm(Pm - jc, axis=1)) * skin
    # around the eye: fine folds of the lids
    er = np.abs(np.sin(np.pi * (R['eyeD'] / 0.004 + 0.8 * fbm(Pm * 90, 2, 55))))
    h -= 0.00016 * np.exp(-(er / 0.3) ** 2) * sstep(EYE_R + 0.005, EYE_R + 0.01, R['eyeD']) * sstep(0.045, 0.03, R['eyeD'])
    # hooves: vertical grain and growth rings; chestnuts rough and layered
    h -= (0.00005 * vnoise(Pm * V(1200, 50, 1200), 59) + 0.00003 * np.abs(np.sin(y * 700))) * R['hoof']
    k1, _ = worley(Pm / 0.004, 60)
    h += 0.0002 * sstep(0.1, 0.5, k1) * R['chest']
    return h


def finish(C, ao, valid):
    """fold ambient occlusion into the color (linear light)"""
    lin = np.where(C <= 0.04045, C / 12.92, ((C + 0.055) / 1.055) ** 2.4)
    lin = lin * (0.35 + 0.65 * ao[..., None])
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(np.maximum(lin, 0), 1 / 2.4) - 0.055)


# ---------- coat: fur shells ----------
# len: longest fur (m); per point fur() gives the length; n layers at close range, lean = how far the tips comb over
# along the flow (times the length), tile = strand spacing (m); babies: longer, fluffier, more upright
FUR = {'len': 0.01, 'n': 4, 'lean': 1.8, 'tile': 0.0017, 'babyLen': 2.2, 'babyLean': 0.6, 'quality': 80}


def fur(P, N, c):
    """fur length (meters) and strand density per point"""
    R = _regions(P, N, c)
    L = R['L']
    ln = np.full(len(P), 0.0055, F)
    ln = ln * (1 - R['head'] * 0.35) * (1 - R['leg'] * 0.3)
    ln = ln * (1 - R['muzzle'] * 0.6)
    a = (R['Pm'] - EAR_B) @ EAR_A
    ln = ln + R['ear'] * R['earIn'] * sstep(0.01, 0.05, a) * 0.004
    # a tuft at the back of the fetlocks
    for f in (V(XF, 0.215, 0.255), V(XH, 0.225, -0.775)):
        ln = ln + 0.004 * sstep(0.04, 0.015, np.linalg.norm(R['Pm'] - f, axis=1))
    ln = ln * (1 - R['hoof']) * (1 - R['chest']) * (1 - R['nos'] * R['muzzle']) * sstep(EYE_R + 0.006, EYE_R + 0.013, R['eyeD'])
    dens = np.ones(len(P), F) * (1 - 0.3 * R['muzzle'])
    return np.clip(ln, 0, FUR['len']).astype(F), dens


MAP_QUALITY = (78, 74)   # WebP quality: color, normal


def stats(P, N, c, col):
    R = _regions(P, N, c)
    # the coat just around the eye (the game draws the closing lids on the eye ball in this color)
    m = sstep(EYE_R + 0.03, EYE_R + 0.016, R['eyeD']) * sstep(EYE_R + 0.008, EYE_R + 0.014, R['eyeD'])
    lid = (col * m[:, None]).sum(0) / max(m.sum(), 1e-6) * 0.8
    return {'lidCol': int(round(lid[0] * 255)) << 16 | int(round(lid[1] * 255)) << 8 | int(round(lid[2] * 255))}


def meta(st):
    r = EYE_R
    up, dn = (LID_OFF + LID_H) / r, (LID_OFF - LID_H) / r
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.32],
                'iris': 0x3B2212, 'irisR': 0.97, 'pupil': 'h', 'pupilR': 0.42, 'rim': 0x0E0806, 'lidCol': st['lidCol'],
                'lash': {'n': 18, 'len': 0.017, 'col': 0x1E1612}},
        'collar': {'at': ['neck', 'neck2', 0.8], 'w': 0.8, 'r': 0.85},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.08, 1.04, 1.0],
        'rim': [0.16, 0.12, 0.09], 'flat': 0x81401D,
    }


# ---------- hair cards: mane, forelock and tail ----------
HAIR = {'size': (384, 384), 'cols': 6, 'base': (0.075, 0.058, 0.05), 'hi': (0.2, 0.135, 0.095), 'tip': (0.3, 0.18, 0.1), 'strands': 60,
        'root': 0.14, 'rough': 0.5, 'alpha': 0.3, 'seed': 3, 'quality': 75}


def _surface(o, d, far=0.5, steps=160):
    """first points where the body surface is met going from o (outside) along d; o, d (n, 3), all rays at once"""
    o = np.atleast_2d(np.asarray(o, np.float64)); d = np.atleast_2d(np.asarray(d, np.float64))
    d = d / np.linalg.norm(d, axis=1, keepdims=True)
    ts = np.linspace(0, far, steps)
    P = (o[:, None, :] + ts[None, :, None] * d[:, None, :]).reshape(-1, 3).astype(F)
    inside = shape(P).reshape(len(o), steps) < 0
    k = np.where(inside.any(1), inside.argmax(1), steps - 1)
    lo, hi = ts[np.maximum(k - 1, 0)], ts[k]
    for _ in range(18):
        m = 0.5 * (lo + hi)
        s = shape((o + m[:, None] * d).astype(F)) < 0
        hi = np.where(s, m, hi); lo = np.where(s, lo, m)
    return (o + hi[:, None] * d).astype(F)


def _neck_frame(t):
    """point on the neck's middle line (t 0 withers .. 1 poll), its tangent and the crest direction"""
    from scipy.interpolate import PchipInterpolator
    K_ = np.array(NECK, np.float64)
    seg = np.linalg.norm(np.diff(K_[:, :2], axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    f = PchipInterpolator(s, K_[:, :2], axis=0)
    u = s[-1] * (0.08 + 0.92 * t)
    yz = f(u); dyz = f(u, 1); dyz /= np.linalg.norm(dyz)
    return V(0.0, yz[0], yz[1]), V(0.0, dyz[0], dyz[1]), V(0.0, dyz[1], -dyz[0])


def _rnd(i, k):
    x = (i * 7919 + k * 104729 + 12345) % 2147483647
    for _ in range(3):
        x = (x * 48271) % 2147483647
    return (x % 100000) / 100000.0


def _wsum(*pairs):
    d = {}
    for n, w in pairs:
        if w > 1e-4:
            d[n] = d.get(n, 0) + w
    return d


def _mane_weights(p, t):
    """the root moves with the skin under it ('_skin', from the body's weights), the tips flop with the mane bones"""
    z = float(p[2])
    mk = 'mane1' if z < 0.74 else 'mane2'
    wm = 0.55 * t ** 1.5 * sstep(1.02, 0.9, z)
    return _wsum(('_skin', 1 - wm), (mk, wm))


def cards():
    out = []
    # mane: falls from the crest and lies along the right side of the neck; two layers of locks. Each lock walks
    # over the neck's surface (rays from the middle of the neck at growing angles) for its length.
    M, k, NA = 46, 7, 28
    side = V(-1.0, 0.0, 0.0)
    angs = np.linspace(0.0, 2.1, NA)
    specs, O, D = [], [], []
    for layer in (0, 1):
        for i in range(M):
            t0 = min(0.995, max(0.0, (i + 0.5 * layer + 0.3 * (_rnd(i, 1 + layer) - 0.5)) / M))
            C, T, U = _neck_frame(t0)
            Lh = (0.12 + 0.12 * np.sin(np.pi * min(1.0, t0 * 1.1)) ** 0.6) * (1 - 0.12 * layer) * (0.85 + 0.3 * _rnd(i, 3 + layer))
            dirs = np.array([nrm(U * np.cos(a) + side * np.sin(a)) for a in angs])
            O += list(C + dirs * 0.5); D += list(-dirs)
            specs.append((layer, i, t0, C, T, U, Lh, dirs))
    hits = _surface(np.array(O), np.array(D)).reshape(len(specs), NA, 3)
    for (layer, i, t0, C, T, U, Lh, dirs), hit in zip(specs, hits):
        arc = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(hit, axis=0), axis=1))])
        root = hit[0] - U * 0.004
        ts = np.linspace(0, 1, k)
        pts, nr = [root], [dirs[0]]
        for t in ts[1:]:
            sa = min(t * Lh, arc[-1])
            p = np.array([np.interp(sa, arc, hit[:, c]) for c in range(3)])
            dn = nrm(np.array([np.interp(sa, arc, dirs[:, c]) for c in range(3)]))
            off = 0.004 + 0.008 * t + 0.007 * layer + 0.004 * _rnd(i, 7)
            pts.append(p + dn * off - T * 0.03 * t * t)
            nr.append(dn)
        pts = np.array(pts, F)
        out.append({'pts': pts, 'w': np.linspace(0.034, 0.03, k) * (1.1 - 0.2 * layer), 'nrm': np.array(nr, F), 'side': np.tile(T, (k, 1)),
                    'col': (i * 3 + layer * 5) % HAIR['cols'], 'bones': [_mane_weights(p, t) for p, t in zip(pts, ts)],
                    'baby': np.array([root + U * (0.06 * t) - T * 0.008 * t for t in ts], F)})
    # a few short locks falling to the left side
    angs = np.linspace(0.0, 1.2, 12)
    O, D, specs = [], [], []
    for i in range(26):
        t0 = 0.04 + 0.92 * (i + 0.5 * _rnd(i, 31)) / 26
        C, T, U = _neck_frame(t0)
        dirs = np.array([nrm(U * np.cos(a) - side * np.sin(a)) for a in angs])
        O += list(C + dirs * 0.5); D += list(-dirs)
        specs.append((i, C, T, U, (0.06 + 0.08 * _rnd(i, 32)) * (0.6 + 0.4 * np.sin(np.pi * t0)), dirs))
    hits = _surface(np.array(O), np.array(D)).reshape(len(specs), len(angs), 3)
    k = 4
    for (i, C, T, U, Lh, dirs), hit in zip(specs, hits):
        arc = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(hit, axis=0), axis=1))])
        root = hit[0] - U * 0.004
        ts = np.linspace(0, 1, k)
        pts, nr = [root], [dirs[0]]
        for t in ts[1:]:
            sa = min(t * Lh, arc[-1])
            p = np.array([np.interp(sa, arc, hit[:, c]) for c in range(3)])
            dn = nrm(np.array([np.interp(sa, arc, dirs[:, c]) for c in range(3)]))
            pts.append(p + dn * (0.005 + 0.008 * t)); nr.append(dn)
        pts = np.array(pts, F)
        out.append({'pts': pts, 'w': np.full(k, 0.028), 'nrm': np.array(nr, F), 'side': np.tile(T, (k, 1)), 'col': (i * 5 + 2) % HAIR['cols'],
                    'bones': [_mane_weights(p, t) for p, t in zip(pts, ts)], 'baby': np.array([root + U * (0.05 * t) for t in ts], F)})
    # forelock: from between the ears forward down the forehead
    k = 6
    O, D, specs = [], [], []
    for i in range(6):
        xo = (i - 2.5) * 0.009 + 0.004 * (_rnd(i, 11) - 0.5)
        Lf = 0.13 + 0.07 * _rnd(i, 12)
        for j in range(k):
            t = j / (k - 1)
            O.append(hp(Lf * t * 0.95, 0.25, xo * (1 + 1.4 * t))); D.append(-HU)
        specs.append((i, xo))
    hits = _surface(np.array(O), np.array(D)).reshape(len(specs), k, 3)
    for (i, xo), hit in zip(specs, hits):
        ts = np.linspace(0, 1, k)
        root = hit[0] - HU * 0.003
        pts = np.array([root] + [hit[j] + HU * (0.008 + 0.01 * np.sin(np.pi * ts[j]) + 0.004 * ts[j]) for j in range(1, k)], F)
        out.append({'pts': pts, 'w': np.linspace(0.024, 0.016, k), 'nrm': np.tile(HU, (k, 1)), 'side': np.tile(V(1, 0, 0), (k, 1)),
                    'col': (i * 5 + 1) % HAIR['cols'], 'bones': [{'_skin': 1.0}] * k,
                    'baby': np.array([root + (p - root) * 0.28 + HU * 0.008 * t for p, t in zip(pts, ts)], F)})
    # tail: hair from the whole dock, falling to above the hocks, spread around it
    tp, tr = tail_curve(40)
    k = 9
    for i in range(42):
        ft = 0.05 + 0.92 * _rnd(i, 21)
        a = (-1.0 + 2.0 * _rnd(i, 22)) * 1.7
        q = min(int(ft * 40), 39)
        Td = nrm(tp[q + 1] - tp[q])
        Ud = nrm(np.cross(Td, V(1, 0, 0)))
        if Ud[1] < 0:
            Ud = -Ud
        Sd = np.cross(Ud, Td)
        radial = nrm(Ud * np.cos(a) + Sd * np.sin(a))
        root = tp[q] + radial * tr[q] * 0.8
        yt = 0.58 + 0.14 * _rnd(i, 23)
        spread = 0.045 + 0.06 * _rnd(i, 24)
        sway = (_rnd(i, 25) - 0.5) * 0.06
        pts, bw = [], []
        for j in range(k):
            t = j / (k - 1)
            o_ = radial * (0.015 + spread * np.sin(np.pi * min(1.0, t * 1.15)) ** 0.6) * min(1.0, t * 6)
            back = V(0, 0, -1) * (0.1 * np.sin(np.pi * min(1.0, t * 1.2)) ** 0.6 * min(1.0, t * 5))
            p = root + o_ + back + V(sway * np.sin(np.pi * t), (yt - root[1]) * t ** 1.1, 0)
            pts.append(p)
            yy = float(p[1])
            if yy > 1.3:
                hb = {'tail1': 1.0}
            elif yy > 1.0:
                f = (1.3 - yy) / 0.3
                hb = _wsum(('tail1', 1 - f), ('tail2', f))
            else:
                f = min(1.0, (1.0 - yy) / 0.3)
                hb = _wsum(('tail2', 1 - f), ('tail3', f))
            ks = max(0.0, 1 - t * 5)
            bw.append(_wsum(('_skin', ks), *[(n, w * (1 - ks)) for n, w in hb.items()]))
        pts = np.array(pts, F)
        ts = np.linspace(0, 1, k)
        # cards turned every way around the hanging hair, so the tail has volume from behind and from the side
        ph = np.pi * (i * 0.618034 % 1.0)
        sd0 = V(np.cos(ph), 0.0, np.sin(ph))
        tw = (_rnd(i, 26) - 0.5) * 1.2
        sd = np.array([nrm(sd0 * np.cos(tw * t) + radial * np.sin(tw * t)) for t in ts], F)
        out.append({'pts': pts, 'w': np.linspace(0.045, 0.075, k), 'nrm': np.tile(nrm(radial + V(0, 0, -0.3)), (k, 1)), 'side': sd,
                    'col': i % HAIR['cols'], 'bones': bw, 'baby': np.array([root + (p - root) * 0.36 + radial * 0.025 * t for p, t in zip(pts, ts)], F)})
    # nothing inside the body: push hair points out along the field gradient (not the roots, which sit in the skin)
    allp = np.concatenate([c['pts'][1:] for c in out]).astype(F)
    allp = _push_out(allp, 0.006)
    o = 0
    for c in out:
        n = len(c['pts']) - 1
        c['pts'] = np.concatenate([c['pts'][:1], allp[o:o + n]]).astype(F); o += n
    return out


def _push_out(P, clear):
    """move points closer to the body than clear out along the field gradient"""
    P = P.astype(F).copy()
    e = 0.002
    for _ in range(5):
        d = shape(P)
        m = d < clear
        if not m.any():
            break
        Q = P[m]
        g = np.stack([shape(Q + np.eye(3, dtype=F)[k] * e) - d[m] for k in range(3)], 1) / e
        g /= np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)
        P[m] = Q + g * (clear - d[m])[:, None]
    return P


# ---------- texture layout ----------
UV_AVERAGE = True   # lowpoly.py: same texel size on every island, then uv_weight() gives some more


def uv_weight(P):
    """linear texel density per island center: the face most, the eyes and muzzle even more, the belly less"""
    Pm = np.abs(P) * V(1, 0, 0) + P * V(0, 1, 1)
    L = hframe(Pm)
    head = sstep(-0.08, 0.0, L[:, 2]) * sstep(0.85, 0.95, Pm[:, 2])
    hoof = sstep(0.14, 0.1, Pm[:, 1])
    under = sstep(1.1, 1.0, Pm[:, 1]) * sstep(0.9, 1.0, Pm[:, 1]) * sstep(0.12, 0.06, Pm[:, 0])
    return (0.92 + 0.75 * head + 0.25 * hoof - 0.3 * under).astype(F)


def uv_regions(P):
    """texture layout regions: lowpoly.py unwraps each on its own, so no island runs from the body up the neck into
    the head (long islands like that pack badly)"""
    Pm = np.abs(P) * V(1, 0, 0) + P * V(0, 1, 1)
    L = hframe(Pm)
    y, z = Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 2)
    head = (L[:, 2] > -0.06) & (z > 0.85) & (y > 1.2)
    neck = ~head & (z > 0.42) & (y > 1.15)
    fleg = (z > 0.0) & (y < 1.0)
    hleg = (z <= 0.0) & (y < 1.05)
    lab[neck] = 1
    lab[head] = 0
    lab[fleg] = 3
    lab[fleg & (y < 0.5)] = 4
    lab[hleg] = 5
    lab[hleg & (y < 0.6)] = 6
    lab[y < 0.11] = 7
    return lab
