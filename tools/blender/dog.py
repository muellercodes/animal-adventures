# A friendly golden retriever (with a little yellow Labrador in it), sculpted as a signed distance field around the
# game's dog skeleton (tools/blender/work/dog-rig.json). Units are meters in game rig space (x left, y up, z forward,
# ground at y = 0). Shape first (deep chest, level back, strong neck, broad skull with a clear stop and a deep muzzle,
# soft drop ears, straight legs on round compact paws, a thick tail), then the golden coat: paint with long wavy
# strokes, lighter feathering on the chest, belly, the backs of the legs and under the tail, fur shells and hair cards
# (the tail's feathering, the ear fringes and the whiskers). Puppies get a rounder body (baby offsets) and a pale cream
# coat of their own.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length
import carnivore as CV
from carnivore import local, local_n, mirror, groove, mix, hexc, rnd, wsum

ID = 'dog'
BOUNDS = (V(-0.17, 0.0, -0.69), V(0.17, 0.79, 0.62))
BAKE_DIST = (0.006, 0.02, 0.05)
DISSOLVE_DEGENERATE = True
TAIL_RINGS = 0

# ---------- landmarks (left side, +x) ----------
# head frame: from the back of the skull forward along the muzzle (s), up across it (u)
HF = CV.Frame(V(0.0, 0.715, 0.335), V(0.0, -0.2, 1.0), V(0.0, 1.0, 0.0))
EYE = CV.Eye(HF.pt(0.108, 0.014, 0.0425), 0.0108, V(0.5, 0.12, 0.86), lid_w=0.0104, lid_h=0.0066, off=0.0006, slant=0.1,
             mound=(0.0034, 0.003, 0.0012), sink=0.3)
NOSE_S = 0.232
MOUTH = HF.pt(0.2, -0.05)
# the drop ear: hangs from the fold (EAR_B) along EAR_A, its flat side facing out along EAR_N
EAR_B = V(0.067, 0.727, 0.392)
EAR_A = nrm([0.12, -1.0, 0.08])
EAR_N = nrm([1.0, 0.12, -0.12])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
EAR_C = np.cross(EAR_N, EAR_A)          # across the ear, toward the front
EAR_L, EAR_W = 0.105, 0.04
XF, XH = 0.077, 0.081
PAW_F = V(XF, 0.0, 0.187)
PAW_H = V(XH, 0.0, -0.262)
PATCHES = [
    (EYE.c * V(0, 1, 1) + V(0.022, -0.02, -0.02), EYE.c * V(0, 1, 1) + V(0.062, 0.02, 0.022), 0.0006),   # eye and lids
    (HF.pt(0.19, 0.0) * V(0, 1, 1) + V(0.0, -0.075, -0.01), HF.pt(0.258, 0.0) * V(0, 1, 1) + V(0.045, 0.02, 0.01), 0.0008),  # muzzle, nose, lips
    (V(0.032, 0.6, 0.33), V(0.11, 0.765, 0.43), 0.0012),                                                     # ear
    (V(0.04, -0.001, 0.15), V(0.115, 0.04, 0.225), 0.0009),                                                  # front paw
    (V(0.045, -0.001, -0.3), V(0.12, 0.04, -0.22), 0.0009),                                                  # hind paw
]

# trunk: z, top, yw (height of widest), bottom, half width, exponent above, below
TRUNK = [
    (-0.395, 0.522, 0.478, 0.428, 0.04, 2.1, 2.0),
    (-0.375, 0.543, 0.48, 0.398, 0.075, 2.2, 2.0),
    (-0.33, 0.556, 0.482, 0.385, 0.096, 2.3, 2.0),
    (-0.26, 0.561, 0.486, 0.395, 0.098, 2.4, 2.0),
    (-0.18, 0.56, 0.488, 0.413, 0.092, 2.4, 2.0),
    (-0.1, 0.561, 0.48, 0.38, 0.102, 2.4, 2.0),
    (-0.02, 0.563, 0.468, 0.335, 0.11, 2.4, 2.0),
    (0.06, 0.566, 0.46, 0.307, 0.113, 2.4, 2.0),
    (0.13, 0.571, 0.458, 0.3, 0.109, 2.3, 2.0),
    (0.19, 0.566, 0.458, 0.31, 0.1, 2.2, 2.0),
    (0.235, 0.545, 0.452, 0.33, 0.088, 2.1, 2.0),
    (0.27, 0.518, 0.448, 0.362, 0.064, 2.0, 2.0),
]
# neck: path (y, z), section toward the nape (top), toward the throat (bot), half width, exponents
NECK = [
    (0.47, 0.16, 0.095, 0.095, 0.092, 2.0, 2.0),
    (0.52, 0.235, 0.078, 0.096, 0.08, 2.0, 2.0),
    (0.585, 0.295, 0.068, 0.08, 0.07, 2.0, 2.0),
    (0.645, 0.325, 0.06, 0.068, 0.062, 2.0, 2.0),
    (0.7, 0.345, 0.05, 0.055, 0.052, 2.0, 2.0),
]
# head: along the head frame (s), top, height of widest, bottom, half width, exponents above, below
HEAD = [
    (-0.02, 0.026, 0.0, -0.034, 0.036, 2.3, 2.0),
    (0.008, 0.045, -0.004, -0.05, 0.058, 2.6, 2.0),
    (0.04, 0.053, -0.008, -0.058, 0.066, 2.6, 2.0),
    (0.07, 0.052, -0.01, -0.061, 0.066, 2.5, 2.1),
    (0.095, 0.048, -0.012, -0.062, 0.058, 2.4, 2.2),
    (0.112, 0.041, -0.016, -0.063, 0.048, 2.3, 2.3),
    (0.126, 0.028, -0.019, -0.063, 0.041, 2.2, 2.3),
    (0.14, 0.018, -0.021, -0.062, 0.039, 2.2, 2.4),
    (0.17, 0.014, -0.023, -0.061, 0.038, 2.2, 2.5),
    (0.2, 0.011, -0.024, -0.058, 0.037, 2.3, 2.5),
    (0.222, 0.007, -0.024, -0.053, 0.035, 2.4, 2.4),
    (0.236, 0.001, -0.024, -0.046, 0.031, 2.3, 2.2),
]
# front leg: path (y, z), section forward (top), back (bot), half width across, exponents, x of the middle
FORE = [
    (0.45, 0.205, 0.05, 0.055, 0.044, 2.0, 2.0, 0.062),
    (0.4, 0.185, 0.045, 0.054, 0.042, 2.0, 2.0, 0.07),
    (0.345, 0.153, 0.037, 0.05, 0.037, 2.1, 2.1, 0.075),
    (0.29, 0.135, 0.033, 0.043, 0.034, 2.2, 2.2, 0.077),
    (0.23, 0.14, 0.03, 0.034, 0.032, 2.2, 2.2, 0.077),
    (0.17, 0.146, 0.026, 0.027, 0.028, 2.2, 2.2, 0.077),
    (0.115, 0.151, 0.023, 0.023, 0.025, 2.2, 2.2, 0.077),
    (0.085, 0.153, 0.024, 0.024, 0.025, 2.2, 2.2, 0.077),
    (0.055, 0.159, 0.022, 0.022, 0.023, 2.2, 2.2, 0.077),
    (0.03, 0.168, 0.022, 0.022, 0.024, 2.2, 2.2, 0.077),
]
HIND = [
    (0.5, -0.27, 0.07, 0.08, 0.05, 2.0, 2.0, 0.058),
    (0.44, -0.25, 0.075, 0.085, 0.052, 2.0, 2.0, 0.068),
    (0.37, -0.208, 0.06, 0.075, 0.046, 2.1, 2.0, 0.076),
    (0.305, -0.172, 0.038, 0.055, 0.037, 2.2, 2.1, 0.08),
    (0.245, -0.212, 0.03, 0.046, 0.031, 2.2, 2.2, 0.081),
    (0.19, -0.262, 0.022, 0.033, 0.024, 2.2, 2.2, 0.081),
    (0.15, -0.296, 0.02, 0.026, 0.023, 2.2, 2.2, 0.081),
    (0.1, -0.297, 0.021, 0.022, 0.023, 2.2, 2.2, 0.081),
    (0.055, -0.29, 0.021, 0.021, 0.023, 2.2, 2.2, 0.081),
    (0.03, -0.282, 0.021, 0.021, 0.024, 2.2, 2.2, 0.081),
]
# the tail: path (y, z), radius (a thick root tapering to the tip; the feathering is coat and hair cards)
TAIL = [(0.507, -0.36, 0.028), (0.5, -0.39, 0.026), (0.477, -0.435, 0.0235), (0.448, -0.472, 0.0215), (0.413, -0.52, 0.0192),
        (0.38, -0.565, 0.017), (0.345, -0.61, 0.0145), (0.318, -0.645, 0.0115), (0.304, -0.663, 0.0065)]


def _tail_keys():
    return [(y, z, r, r * 0.95, r, 2.0, 2.0) for y, z, r in TAIL]


def _tail_poly(n=80):
    from scipy.interpolate import PchipInterpolator
    K_ = np.array([(y, z) for y, z, _ in TAIL], np.float64)
    seg = np.linalg.norm(np.diff(K_, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    f = PchipInterpolator(s, K_, axis=0)
    ss = np.linspace(0, s[-1], n)
    yz = f(ss)
    return np.stack([np.zeros(n), yz[:, 0], yz[:, 1]], 1), ss / s[-1]


_TP, _TT = _tail_poly()
_TREE = []


def tail_t(P):
    """position along the tail (0 root .. 1 tip) and distance from its middle line, for mirrored points"""
    if not _TREE:
        from scipy.spatial import cKDTree
        _TREE.append(cKDTree(_TP))
    yz = np.stack([np.zeros(len(P)), P[:, 1], P[:, 2]], 1).astype(np.float64)
    d, k = _TREE[0].query(yz)
    return _TT[k].astype(F), d.astype(F)


TAIL_BONES = ['tail1', 'tail2', 'tail3']
_TB = {'tail1': V(0, 0.5, -0.37), 'tail2': V(0, 0.445, -0.47), 'tail3': V(0, 0.38, -0.565)}
TB_T = [float(_TT[np.linalg.norm(_TP[:, 1:] - _TB[b][1:], axis=1).argmin()]) for b in TAIL_BONES]


def tail_weights(t):
    """bone weights along the tail at t (0..1): each bone from its start to the next one's, blended over a short span"""
    w = np.zeros((len(t), 3), F)
    edges = TB_T[1:]
    for i in range(3):
        lo = sstep(edges[i - 1] - 0.06, edges[i - 1] + 0.06, t) if i > 0 else np.ones_like(t)
        hi = 1 - sstep(edges[i] - 0.06, edges[i] + 0.06, t) if i < 2 else np.ones_like(t)
        w[:, i] = lo * hi
    return w / np.maximum(w.sum(1, keepdims=True), 1e-9)


# ---------- trunk, neck ----------
def trunk(P):
    Q = mirror(P)
    d = loft(Q, TRUNK)
    # shoulder blades sloping back over the withers, the point of shoulder in front
    d = smin(d, round_cone(Q, V(0.07, 0.43, 0.215), V(0.056, 0.54, 0.14), 0.03, 0.026), 0.05)
    d = smin(d, ellipsoid(Q, V(0.078, 0.44, 0.226), V(0.03, 0.034, 0.03)), 0.04)
    # the breast (prosternum) between the front legs
    d = smin(d, ellipsoid(Q, V(0.0, 0.41, 0.24), V(0.05, 0.06, 0.04)), 0.04)
    # croup and the big muscles of the haunch
    d = smin(d, ellipsoid(Q, V(0.05, 0.505, -0.3), V(0.05, 0.05, 0.08)), 0.05)
    # the flank: the skin fold from the belly to the stifle (no notch between the belly and the thigh)
    d = smin(d, flat_cone(Q, V(0.055, 0.41, -0.1), V(0.072, 0.335, -0.18), 0.035, 0.026, 0.9), 0.05)
    # belly line: the loin tucked up (soft, no hard edge)
    d = smax(d, -(ellipsoid(Q, V(0.0, 0.33, -0.2), V(0.16, 0.075, 0.11))), 0.04)
    return d


def neck(P):
    Q = mirror(P)
    d = sweep(Q, NECK)
    # the crest of the neck, the throat a little loose
    d = smin(d, ellipsoid(Q, V(0.0, 0.575, 0.24), V(0.06, 0.05, 0.07)), 0.04)
    d = smin(d, ellipsoid(Q, V(0.0, 0.52, 0.33), V(0.055, 0.055, 0.05)), 0.04)
    return d


# ---------- head ----------
def head(P):
    Q = mirror(P)
    L = HF.loc(Q)
    d = loft(L, HEAD)
    # broad skull: the temporal muscles over the top, the occiput a gentle rise behind
    d = smin(d, ellipsoid(L, V(0.026, 0.026, 0.035), V(0.03, 0.026, 0.05)), 0.02)
    # cheeks (masseter) under and behind the eye
    d = smin(d, ellipsoid(L, V(0.05, -0.026, 0.06), V(0.018, 0.028, 0.038)), 0.02)
    # brows over the eyes, the furrow up the middle of the forehead from the stop
    d = smin(d, round_cone(L, V(0.016, 0.03, 0.098), V(0.038, 0.026, 0.104), 0.011, 0.008), 0.012)
    d = d + groove(L[:, 0], 0.006, 0.0032) * sstep(0.06, 0.09, L[:, 2]) * sstep(0.135, 0.115, L[:, 2]) * sstep(0.0, 0.02, L[:, 1])
    # under the eye the muzzle narrows a little
    d = d + groove(np.sqrt((L[:, 0] - 0.04) ** 2 + ((L[:, 1] + 0.008) * 0.8) ** 2), 0.007, 0.0028) * sstep(0.12, 0.135, L[:, 2]) * sstep(0.165, 0.15, L[:, 2])
    # the flews: the upper lips hang over the lower jaw at the sides, a fold at the corner of the mouth
    d = smin(d, ellipsoid(L, V(0.026, -0.043, 0.18), V(0.0155, 0.024, 0.05)), 0.012)
    d = smin(d, ellipsoid(L, V(0.031, -0.05, 0.13), V(0.012, 0.012, 0.02)), 0.01)
    # lower jaw and chin, a little behind the upper lip
    d = smin(d, ellipsoid(L, V(0.0, -0.058, 0.157), V(0.026, 0.014, 0.062)), 0.014)
    # nose leather: big and wide, a little proud of the muzzle
    nose = superellipsoid(L, V(0.0, -0.004, NOSE_S - 0.002), (0.0158, 0.0118, 0.0105), 3.0, rb=0.0105)
    nose = smax(nose, L[:, 2] - (NOSE_S + 0.0062) + 0.25 * np.abs(L[:, 0]), 0.004)
    d = smin(d, nose, 0.005)
    # mouth: the lip line from the front back to the corner below the eye
    M = L * V(1, 2.5, 1)
    m = round_cone(M, V(0.0, -0.0505 * 2.5, 0.216), V(0.019, -0.054 * 2.5, 0.198), 0.0018, 0.0018)
    m = smin(m, round_cone(M, V(0.019, -0.054 * 2.5, 0.198), V(0.035, -0.057 * 2.5, 0.135), 0.0018, 0.0012), 0.003)
    d = smax(d, -(m + 0.0012) / 2.5, 0.002)
    # nostrils: comma shaped, facing forward and out; the groove down the middle (philtrum) to the lip
    nc = V(0.0058, -0.0035, NOSE_S + 0.0062)
    n1 = ellipsoid(L, nc, V(0.0028, 0.002, 0.004))
    n1 = smin(n1, ellipsoid(L, nc + V(0.003, -0.0017, -0.002), V(0.0016, 0.0013, 0.0032)), 0.0014)
    d = smax(d, -n1, 0.0014)
    d = d + groove(L[:, 0], 0.0016, 0.0016) * sstep(NOSE_S - 0.004, NOSE_S + 0.008, L[:, 2]) * sstep(-0.006, -0.014, L[:, 1])
    return d


def eye_parts(P):
    Q = mirror(P)
    carve, lids, ball = EYE.parts(Q)
    return carve, lids, ball


def drop_ear(Q):
    """the soft drop ear: a leaf shaped flap hanging from the fold, wrapped a little around the cheek, its lower edge
    standing a little off it; thick (the leather plus its coat), thinner toward the tip and the edges"""
    D = Q - EAR_B
    a, c, n = D @ EAR_A, D @ EAR_C, D @ EAR_N
    u = np.clip(a / EAR_L, 0, 1)
    # outline: as wide as the fold at the top, widest a third of the way down, a rounded tip
    hw = EAR_W * np.where(u < 0.33, 0.78 + 0.22 * np.sqrt(np.clip(u / 0.33, 0, 1)), np.sqrt(np.clip(1 - ((u - 0.33) / 0.67) ** 2, 0, 1)))
    hw = hw + 0.002
    cc = c - 0.006 * u - 0.004 * np.sin(np.pi * u)            # the tip swings a little forward
    k = np.clip(cc / np.maximum(hw, 1e-4), -1.3, 1.3)
    mid = -0.009 * k * k + 0.01 * u * u + 0.004 * u           # cupped round the cheek, the lower part off it
    th = 0.0065 * (1 - u) + 0.0042 * u
    th = th * (1 - 0.35 * k * k)
    d_out = np.abs(cc) - hw
    d_th = np.abs(n - mid) - np.maximum(th, 0.0015)
    d_end = np.maximum(-a + 0.004, a - EAR_L)
    d = smax(smax(d_out, d_th, 0.004), d_end, 0.008)
    # the fold: the ear leather rolls over the top of the skull here
    d = smin(d, ellipsoid(Q, EAR_B + EAR_A * 0.004 - EAR_N * 0.004, V(0.012, 0.012, 0.03)), 0.01)
    return d


def ear(P):
    return drop_ear(mirror(P))


def ear_coords(Pm):
    D = Pm - EAR_B
    return D @ EAR_A, D @ EAR_C, D @ EAR_N


# ---------- legs and paws ----------
def flat_cone(Q, a, b, r1, r2, kx):
    """a round cone flattened across x by kx (thigh and shoulder muscles are flat from side to side)"""
    S = Q.copy()
    S[:, 0] = a[0] + (Q[:, 0] - a[0]) / kx
    return round_cone(S, a, V(a[0], b[1], b[2]), r1, r2) * kx + 0.0


def fleg(P):
    Q = mirror(P)
    x = XF
    d = sweep(Q, FORE, mirror_x=False)
    # upper arm from the point of shoulder to the elbow, the triceps mass behind it
    d = smin(d, flat_cone(Q, V(0.074, 0.445, 0.222), V(0.077, 0.31, 0.13), 0.045, 0.032, 0.8), 0.03)
    d = smin(d, flat_cone(Q, V(0.07, 0.42, 0.16), V(0.075, 0.31, 0.112), 0.042, 0.03, 0.8), 0.03)
    d = smin(d, ellipsoid(Q, V(x - 0.002, 0.29, 0.106), V(0.02, 0.022, 0.018)), 0.016)   # point of elbow
    d = smin(d, ellipsoid(Q, V(x + 0.003, 0.22, 0.146), V(0.022, 0.05, 0.022)), 0.016)   # forearm muscles
    d = smin(d, ellipsoid(Q, V(x, 0.088, 0.148), V(0.019, 0.018, 0.019)), 0.01)          # wrist
    d = smin(d, ellipsoid(Q, V(x - 0.004, 0.072, 0.138), V(0.009, 0.01, 0.009)), 0.006)  # the stopper pad behind it
    return d


def hleg(P):
    Q = mirror(P)
    x = XH
    d = sweep(Q, HIND, mirror_x=False)
    # the thigh: a broad flat muscle mass from the croup down to the stifle, the hamstrings behind it to the hock
    d = smin(d, flat_cone(Q, V(0.064, 0.47, -0.29), V(0.077, 0.32, -0.19), 0.085, 0.038, 0.58), 0.05)
    d = smin(d, flat_cone(Q, V(0.062, 0.47, -0.36), V(0.074, 0.27, -0.27), 0.052, 0.026, 0.65), 0.05)
    d = smin(d, ellipsoid(Q, V(x, 0.31, -0.158), V(0.03, 0.03, 0.024)), 0.02)           # stifle
    d = smin(d, ellipsoid(Q, V(x - 0.002, 0.255, -0.232), V(0.022, 0.05, 0.026)), 0.02)  # second thigh (gaskin)
    d = smin(d, round_cone(Q, V(x, 0.235, -0.255), V(x, 0.16, -0.318), 0.011, 0.008), 0.016)   # Achilles tendon
    d = smin(d, ellipsoid(Q, V(x, 0.152, -0.318), V(0.013, 0.017, 0.013)), 0.01)        # point of hock
    return d


F_TOES = [(0.0101, 0.016, 0.0116, 0.019, 0.0), (-0.0101, 0.016, 0.0116, 0.019, 0.0), (0.025, 0.0017, 0.0108, 0.0165, 0.001),
          (-0.025, 0.0017, 0.0108, 0.0165, 0.001)]
H_TOES = [(0.0095, 0.0149, 0.0108, 0.0176, 0.0), (-0.0095, 0.0149, 0.0108, 0.0176, 0.0), (0.0233, 0.0011, 0.0101, 0.0154, 0.001),
          (-0.0233, 0.0011, 0.0101, 0.0154, 0.001)]


def paws(P):
    """both paws of the +x side: (paw, claws): round compact feet, thick pads"""
    Q = mirror(P)
    a, ca = CV.paw(Q, PAW_F, F_TOES, pad=(0.026, 0.02, 0.024), claw=(0.006, 0.0026), yaw=0.1)
    b, cb = CV.paw(Q, PAW_H, H_TOES, pad=(0.024, 0.019, 0.023), claw=(0.0055, 0.0024), yaw=0.06)
    # the front dewclaw, high on the inside of the pastern
    dw = round_cone(Q, V(XF - 0.012, 0.05, 0.156), V(XF - 0.017, 0.038, 0.164), 0.0045, 0.0028)
    cdw = round_cone(Q, V(XF - 0.017, 0.037, 0.165), V(XF - 0.019, 0.03, 0.17), 0.0018, 0.0008)
    return np.minimum(smin(a, dw, 0.006), b), np.minimum.reduce([ca, cb, cdw])


def tail(P):
    return sweep(mirror(P), _tail_keys())


# ---------- assembled ----------
def parts(P):
    ca, li, ba = eye_parts(P)
    pw, cl = paws(P)
    return {'trunk': trunk(P), 'neck': neck(P), 'head': head(P), 'ear': ear(P), 'lids': li, 'ball': ba, 'fleg': fleg(P), 'hleg': hleg(P),
            'paw': pw, 'claw': cl, 'tail': tail(P)}


def shape(P):
    d = trunk(P)
    d = smin(d, local(P, (-0.17, 0.3, -0.06), (0.17, 0.79, 0.45), neck), 0.07)
    h = local(P, (-0.13, 0.55, 0.27), (0.13, 0.79, 0.62), head)
    ca, li, ba = local_n(P, (-0.08, 0.68, 0.39), (0.08, 0.75, 0.48), eye_parts, 3)
    h = smin(h, li, 0.005)
    h = smax(h, -ca, 0.0018)
    h = smin(h, ba, 0.001)
    d = smin(d, h, 0.035)
    d = smin(d, local(P, (-0.13, 0.58, 0.3), (0.13, 0.79, 0.46), ear), 0.012)
    fl = local(P, (-0.16, -0.01, 0.02), (0.16, 0.62, 0.32), fleg)
    d = smin(d, fl, 0.045)
    hl = local(P, (-0.17, -0.01, -0.47), (0.17, 0.66, -0.06), hleg)
    d = smin(d, hl, 0.05)
    pw, cl = local_n(P, (-0.13, -0.01, -0.32), (0.13, 0.07, 0.24), paws, 2)
    d = smin(d, pw, 0.012)
    d = np.minimum(d, cl)
    d = smin(d, local(P, (-0.06, 0.26, -0.69), (0.06, 0.55, -0.32), tail), 0.03)
    return d


# camera views for tools/blender/preview.py: position, target, field of view (game rig space)
PREVIEW = {
    'side': ((3.0, 0.5, -0.02), (0, 0.4, -0.02), 30),
    'front3q': ((1.7, 0.9, 1.8), (0, 0.4, 0.0), 30),
    'front': ((0.0, 0.6, 2.6), (0, 0.45, 0.0), 26),
    'rear3q': ((-1.5, 1.0, -2.0), (0, 0.4, -0.1), 30),
    'top': ((0.01, 3.0, -0.05), (0, 0.4, -0.05), 30),
    'face': ((0.3, 0.78, 1.15), (0, 0.69, 0.45), 24),
    'faceside': ((0.9, 0.7, 0.46), (0.0, 0.69, 0.45), 24),
    'feet': ((0.55, 0.12, 0.55), (0.06, 0.05, 0.0), 30),
    'eye': ((0.22, 0.73, 0.6), (0.042, 0.71, 0.45), 12),
    'muzzle': ((0.2, 0.7, 0.85), (0.0, 0.66, 0.55), 18),
    'headside': ((1.0, 0.7, 0.45), (0, 0.69, 0.45), 26),
    'headtop': ((0.05, 1.3, 0.45), (0, 0.69, 0.45), 26),
    'headfront': ((0.0, 0.72, 1.4), (0, 0.69, 0.45), 20),
    'head3q': ((0.55, 0.78, 1.0), (0, 0.69, 0.45), 22),
}


# ---------- game mesh: decimation, rings, texture layout, skinning ----------
# keep levels: body floor, eyes, head, muzzle tip, ears, paws, the tail's floor
KEEP = (0.44, 0.82, 0.6, 0.72, 0.56, 0.58, 0.4)


def keep(P):
    """higher where the game mesh keeps more of the sculpt when decimating (never 1, which locks a vertex)"""
    Pm = mirror(P)
    tl = sstep(-0.37, -0.4, Pm[:, 2]) * sstep(0.25, 0.3, Pm[:, 1])
    base = KEEP[0] + (KEEP[6] - KEEP[0]) * tl
    e = sstep(0.034, 0.016, np.linalg.norm(Pm - EYE.c, axis=1)) * KEEP[1]
    L = HF.loc(Pm)
    hd = sstep(-0.02, 0.02, L[:, 2]) * sstep(0.56, 0.6, Pm[:, 1]) * KEEP[2]
    m = sstep(0.19, 0.22, L[:, 2]) * sstep(-0.09, -0.07, L[:, 1]) * KEEP[3]
    a, c, n = ear_coords(Pm)
    er = sstep(-0.01, 0.005, a) * sstep(EAR_W + 0.012, EAR_W, np.abs(c)) * sstep(0.03, 0.015, np.abs(n)) * sstep(EAR_L + 0.01, EAR_L, a) * KEEP[4]
    pw = sstep(0.045, 0.028, Pm[:, 1]) * KEEP[5]
    return np.maximum.reduce([base, e, hd, m, er, pw]).astype(F)


def lowpoly_fix(bm, hi):
    """rings across the body and the neck and along the tail, so the dog bends smoothly when it gallops, sits, wags
    and curls up to sleep"""
    import meshfix as MX
    tr = MX.tree(hi)
    MX.rings(bm, tr, (0.0, 0.48, 0.2), (0.0, 0.49, -0.37), 0.05, lambda c, p0, r: c.y > 0.3 and r < 0.17)
    pts = [V(0, k[0], k[1]) for k in NECK]
    for a, b in zip(pts[:-2], pts[1:-1]):
        MX.rings(bm, tr, a, b, 0.05, lambda c, p0, r: r < 0.12 and c.z > 0.2 and c.y > 0.42)
    pts = [V(0, y, z) for y, z, _ in TAIL]
    for a, b in zip(pts[:-1], pts[1:]):
        MX.rings(bm, tr, a, b, 0.038, lambda c, p0, r: r < 0.04 and c.z < -0.375)
    MX.finish(bm, 2e-8)


UV_AVERAGE = True
UV_PACK = dict(margin_method='FRACTION', margin=0.008)


def uv_regions(P):
    """texture layout regions, unwrapped one by one: head, ears, neck, trunk, upper and lower legs, the tail"""
    Pm = mirror(P)
    L = HF.loc(Pm)
    y, z = Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 2)
    a, c, n = ear_coords(Pm)
    head = (L[:, 2] > -0.012) & (y > 0.58)
    neck = ~head & (z > 0.2) & (y > 0.45)
    fleg = (z > 0.05) & (y < 0.4) & ~neck
    hleg = (z <= 0.05) & (y < 0.44) & (z > -0.38)
    tl = (z < -0.375) & (y > 0.25)
    lab[neck] = 1
    lab[head] = 0
    lab[(a > 0.006) & (np.abs(c) < EAR_W + 0.01) & (np.abs(n) < 0.025) & (a < EAR_L + 0.01)] = 8
    lab[fleg] = 3
    lab[fleg & (y < 0.2)] = 4
    lab[hleg] = 5
    lab[hleg & (y < 0.2)] = 6
    lab[tl] = 7
    return lab


def uv_weight(P):
    """linear texel density per island: the face most, then the ears and paws; the belly and inner legs less"""
    Pm = mirror(P)
    L = HF.loc(Pm)
    head = sstep(-0.02, 0.02, L[:, 2]) * sstep(0.58, 0.62, Pm[:, 1])
    paw = sstep(0.06, 0.03, Pm[:, 1])
    under = sstep(0.4, 0.36, Pm[:, 1]) * sstep(0.05, 0.03, Pm[:, 0]) * sstep(0.34, 0.25, Pm[:, 1])
    return (0.9 + 0.85 * head + 0.25 * paw - 0.25 * under).astype(F)


WEIGHT_SMOOTH = (6, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'rump': P['hips'], 'chest': P['neck'], 'neck': P['neck2'], 'neck2': P['head'], 'head': HF.pt(0.24, 0.0),
         'tail1': P['tail2'], 'tail2': P['tail3'], 'tail3': V(0, 0.304, -0.663)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (PAW_H + V(0, 0.01, 0.03)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (PAW_F + V(0, 0.01, 0.03)) * m
        t['ear' + s] = (EAR_B + EAR_A * EAR_L) * m
    return t


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    W[:, bi['ctag']] = 0
    x = wpos[:, 0]
    Pm = mirror(wpos)
    y, z = Pm[:, 1], Pm[:, 2]
    # nothing of the other side's legs and ears
    for b in names:
        if b.endswith('L') and b[:-1] + 'R' in bi:
            r = bi[b[:-1] + 'R']; l = bi[b]
            pos = x > 0.01
            W[pos, l] += W[pos, r]; W[pos, r] = 0
            neg = x < -0.01
            W[neg, r] += W[neg, l]; W[neg, l] = 0
    # the tail: by position along its middle line, blending into the rump at its root
    tt, td = tail_t(Pm)
    on = (z < -0.37) & (td < 0.05) & (y > 0.25)
    if on.any():
        tw = tail_weights(tt[on])
        k = sstep(-0.37, -0.4, z[on])[:, None]
        rows = np.zeros((on.sum(), W.shape[1]), F)
        for i, b in enumerate(TAIL_BONES):
            rows[:, bi[b]] = tw[:, i]
        W[on] = W[on] * (1 - k) + rows * k
    # ears ride on the ear bones, blending into the head at the fold
    a, c, n = ear_coords(Pm)
    on = (drop_ear(Pm) < 0.003) & (a > -0.006) & (head(wpos) > -0.002)
    k = sstep(-0.004, 0.02, a)
    for s, sg in (('L', 1), ('R', -1)):
        CV.set_part(W, bi, on & (x * sg > 0), 'ear' + s, k)
    # paws: the toes and pads on the paw bones
    for s, sg in (('L', 1), ('R', -1)):
        for c0, b in ((PAW_F, 'fpaw'), (PAW_H, 'hpaw')):
            near = (np.abs(x - sg * c0[0]) < 0.045) & (z > c0[2] - 0.03) & (z < c0[2] + 0.05) & (y < 0.045)
            CV.set_part(W, bi, near, b + s, sstep(0.04, 0.022, y))
    s = W.sum(1, keepdims=True)
    return W / np.maximum(s, 1e-9)


# ---------- coat: direction, regions, paint ----------
_NY = np.array([k[0] for k in NECK], F)
_NZ = np.array([k[1] for k in NECK], F)


def tail_dir(P):
    tt, _ = tail_t(P)
    k = np.clip((tt * (len(_TP) - 1)).astype(int), 0, len(_TP) - 2)
    t = _TP[k + 1] - _TP[k]
    t = t / np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-9)
    return t.astype(F)


def flow(P, N=None):
    """direction the coat lies in: from the nose back over the head, down the cheeks, back along the body and down its
    sides, down the legs (and back along their feathering), along the tail and down off its underside, down the ears"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    one = np.ones_like(y)
    body = np.stack([0.3 * sstep(0.03, 0.08, x), -(0.15 + 0.9 * sstep(0.48, 0.36, y)), -one], 1)
    dydz = np.interp(z, _NZ, np.gradient(_NY, _NZ))
    neckd = np.stack([0.25 * one, -1.2 * one + 0.4 * sstep(0.55, 0.65, y), -0.6 * one], 1)
    legd = np.stack([0 * y, -one, -0.15 * one - 0.4 * sstep(0.3, 0.2, y)], 1)
    L = HF.loc(Q)
    cheek = sstep(0.0, -0.03, L[:, 1]) * sstep(0.15, 0.1, L[:, 2])
    headd = -HF.a[None, :] + np.stack([0.35 * sstep(0.01, 0.04, x) + 0.4 * cheek, -0.5 * cheek, 0 * y], 1)
    taild = tail_dir(Q) + np.stack([0 * y, -0.5 * one, 0 * y], 1) * sstep(0.2, -0.4, (N[:, 1] if N is not None else 0 * y))[:, None]
    wh = sstep(-0.015, 0.02, L[:, 2]) * sstep(0.6, 0.64, y)
    wt = sstep(-0.37, -0.4, z) * sstep(0.25, 0.3, y)
    wn = sstep(0.18, 0.26, z) * sstep(0.4, 0.46, y) * (1 - wh)
    wl = sstep(0.4, 0.33, y) * (1 - wh - wn) * (1 - wt)
    wb = np.clip(1 - wh - wn - wl - wt, 0, 1)
    f = body * wb[:, None] + headd * wh[:, None] + neckd * wn[:, None] + legd * wl[:, None] + taild * wt[:, None]
    a, c, n = ear_coords(Q)
    we = sstep(-0.006, 0.01, a) * sstep(EAR_W + 0.012, EAR_W, np.abs(c)) * sstep(0.03, 0.014, np.abs(n)) * sstep(EAR_L + 0.012, EAR_L, a)
    f = f * (1 - we)[:, None] + (EAR_A + 0.25 * EAR_C)[None, :] * we[:, None]
    f = f / np.maximum(np.linalg.norm(f, axis=1, keepdims=True), 1e-9)
    f[:, 0] *= np.sign(P[:, 0] + 1e-12)
    return f.astype(F)


def _regions(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    r = {}
    Pm = mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(x + 1e-9)
    r['Pm'], r['Nm'] = Pm, Nm
    L = HF.loc(Pm)
    r['L'] = L
    de = np.linalg.norm(Pm - EYE.c, axis=1)
    r['eyeD'] = de
    r['ball'] = sstep(0.001, 0.0002, c['ball']) * sstep(EYE.r + 0.004, EYE.r + 0.001, de)
    El = EYE.loc(Pm)
    ua = El[:, 1] - EYE.off - EYE.slant * El[:, 0]
    ring = np.sqrt((El[:, 0] / (EYE.lid_w + 0.0028)) ** 2 + (ua / (EYE.lid_h + 0.0025)) ** 2)
    r['lid'] = sstep(1.15, 0.9, ring) * (1 - r['ball']) * sstep(EYE.r + 0.01, EYE.r + 0.005, de)
    r['head'] = sstep(-0.015, 0.012, L[:, 2]) * sstep(0.005, 0.0, c['head'])
    r['nose'] = sstep(0.0012, 0.0, superellipsoid(L, V(0.0, -0.004, NOSE_S - 0.002), (0.0162, 0.0122, 0.0112), 3.0, rb=0.011)) * sstep(NOSE_S - 0.01, NOSE_S - 0.005, L[:, 2])
    lipu = -0.0515 - 0.004 * sstep(0.2, 0.145, L[:, 2])
    r['lip'] = sstep(0.0022, 0.0008, np.abs(L[:, 1] - lipu)) * sstep(0.135, 0.15, L[:, 2]) * r['head']
    a, cc, n = ear_coords(Pm)
    r['ea'], r['ec'], r['en'] = a, cc, n
    r['ear'] = sstep(0.003, 0.0008, c['ear']) * sstep(-0.004, 0.01, a)
    r['earIn'] = sstep(0.1, -0.4, Nm @ EAR_N)
    r['paw'] = sstep(0.004, 0.0, c['paw']) * sstep(0.045, 0.03, y)
    r['pad'] = sstep(-0.2, -0.75, N[:, 1]) * sstep(0.008, 0.003, y)
    r['claw'] = sstep(0.001, 0.0, c['claw'])
    tt, td = tail_t(Pm)
    r['tt'] = tt
    r['tail'] = sstep(0.008, 0.0, c['tail']) * sstep(-0.37, -0.4, z) * sstep(0.25, 0.3, y)
    r['top'] = sstep(0.3, 0.85, N[:, 1])
    return r


K = {
    'gold': hexc(0xC98C48), 'goldDk': hexc(0xA86E32), 'goldLt': hexc(0xDDA866), 'cream': hexc(0xEBCB92), 'pale': hexc(0xF1DDB2),
    'muzzle': hexc(0xD8A462), 'nose': hexc(0x171211), 'lip': hexc(0x1E1615), 'pad': hexc(0x2A2220), 'claw': hexc(0x3A302A),
    'clawLt': hexc(0xB8A890), 'ball': hexc(0x0E0806), 'earDk': hexc(0x9C6430), 'skin': hexc(0x8A6A5A),
}


def _lenk(Pm):
    """stroke length factor: short on the face and paws, long on the body, longest on the feathering and the ears"""
    L = HF.loc(Pm)
    y, z = Pm[:, 1], Pm[:, 2]
    hd = sstep(-0.015, 0.02, L[:, 2]) * sstep(0.6, 0.64, y)
    lg = sstep(0.3, 0.18, y) * (1 - sstep(-0.37, -0.4, z))
    tl = sstep(-0.37, -0.42, z) * sstep(0.25, 0.3, y)
    a, c, n = ear_coords(Pm)
    er = sstep(0.0, 0.02, a) * sstep(EAR_W + 0.01, EAR_W - 0.004, np.abs(c)) * sstep(0.025, 0.012, np.abs(n)) * sstep(EAR_L + 0.01, EAR_L - 0.01, a)
    return np.clip(1.0 - 0.6 * hd - 0.45 * lg + 0.5 * tl + 0.3 * er, 0.35, 1.6)


_scache = {}


def _strands(P, N, R):
    key = (len(P), float(P[:7].sum()))
    if key not in _scache:
        dens = 0.92 * (1 - R['nose']) * (1 - R['ball']) * (1 - R['claw']) * (1 - R['pad']) * (1 - 0.7 * R['lip']) * sstep(EYE.r + 0.003, EYE.r + 0.008, R['eyeD'])
        _scache[key] = CV.strands(P, N, dens, flow, 0.0055, 0.008, 0.016, 0.0009, seed=91, lenk=lambda Q: _lenk(mirror(Q)))
    return _scache[key]


def _markings(R, Pm, N):
    """the pale feathering: the throat and chest, the belly, the backs of the legs ("trousers"), under the tail; a
    darker saddle and ears, a paler muzzle"""
    L = R['L']
    y, z = Pm[:, 1], Pm[:, 2]
    w2 = fbm(Pm * 30, 2, 42) - 0.5
    hd = R['head']
    Nm = R['Nm']
    chest = sstep(0.16, 0.24, z) * sstep(0.55, 0.42, y + 0.1 * w2) * sstep(0.2, -0.4, N[:, 1] - N[:, 2] * 0.3) * (1 - hd)
    throat = sstep(0.25, 0.32, z) * sstep(-0.1, -0.6, N[:, 1] - 0.5 * N[:, 2]) * (1 - hd)
    belly = sstep(-0.35, -0.8, N[:, 1]) * sstep(0.44, 0.38, y) * (1 - R['tail'])
    fback = sstep(0.05, 0.12, z) * sstep(-0.1, -0.7, N[:, 2]) * sstep(0.1, 0.2, y) * sstep(0.4, 0.32, y)
    trousers = sstep(-0.18, -0.24, z) * sstep(0.0, -0.6, N[:, 2]) * sstep(0.2, 0.3, y) * sstep(0.52, 0.42, y) * (1 - R['tail'])
    inner = sstep(0.0, -0.5, Nm[:, 0]) * sstep(0.42, 0.34, y) * sstep(0.08, 0.14, y)
    under_tail = R['tail'] * sstep(0.1, -0.5, N[:, 1])
    pale = np.clip(np.maximum.reduce([chest, throat, belly, fback * 0.8, trousers, inner * 0.6, under_tail]), 0, 1) * (1 - R['ear'])
    saddle = R['top'] * (1 - hd) * sstep(0.44, 0.5, y) * (1 - R['tail'] * 0.5)
    muzzle = hd * sstep(0.13, 0.17, L[:, 2])
    brow = hd * sstep(0.022, 0.012, np.linalg.norm(Pm - (EYE.c + V(-0.004, 0.017, -0.004)), axis=1))
    return dict(pale=pale, saddle=saddle, muzzle=muzzle, brow=brow)


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y, z = Pm[:, 1], Pm[:, 2]
    M = _markings(R, Pm, N)
    n1 = fbm(Pm * 8, 3, 11)
    n2 = fbm(Pm * 40, 3, 12)
    col = np.tile(K['gold'], (len(P), 1))
    col = mix(col, K['goldLt'], sstep(0.2, -0.4, N[:, 1]) * 0.5)
    col = mix(col, K['goldDk'], M['saddle'] * 0.55)
    col *= (0.93 + 0.14 * n1)[:, None]
    # face: a little paler muzzle and brows, the darker gold over the skull
    col = mix(col, K['muzzle'], M['muzzle'] * 0.45 + M['brow'] * 0.35)
    col = mix(col, K['goldDk'], R['head'] * sstep(0.4, 0.9, N[:, 1]) * sstep(0.1, 0.06, L[:, 2]) * 0.3)
    # ears a shade darker and richer
    col = mix(col, K['earDk'], R['ear'] * 0.5)
    # pale feathering
    pal = mix(np.tile(K['cream'], (len(P), 1)), K['pale'], n2 * 0.6)
    col = mix(col, pal, M['pale'] * 0.85)
    # bare parts: nose, lips, eye rims, pads, claws
    col = mix(col, K['lip'], R['lip'] * 0.55)
    col = mix(col, K['lip'], R['lid'] * 0.95)
    # nose leather: dark gray-brown with a cobbled sheen, the nostrils darker
    nos = mix(np.tile(K['nose'], (len(P), 1)), hexc(0x3A302C), sstep(0.3, 0.8, n2) * 0.6)
    col = mix(col, nos, R['nose'])
    col = mix(col, K['pad'], R['pad'] * R['paw'])
    col = mix(col, mix(np.tile(K['claw'], (len(P), 1)), K['clawLt'], sstep(0.4, 0.7, n1)), R['claw'])
    # coat hairs: long strokes lighter at the tips, darker between the locks
    s, tone = _strands(P, N, R)
    col *= (1 + s * 0.28 * (tone - 0.4) - 0.07 * (1 - s))[:, None]
    col = mix(col, K['ball'], R['ball'])
    rough = 0.64 + 0.08 * (n2 - 0.5) - 0.18 * R['nose'] - 0.3 * R['lid'] - 0.12 * R['lip'] - 0.25 * R['claw']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    h = np.zeros(len(P), F)
    s, tone = _strands(P, N, R)
    h += 0.00011 * s * (1 - R['ball']) * (1 - R['nose']) * (1 - R['lip'])
    # nose leather: a fine cobbled grain; paw pads rough
    g1, _ = worley(Pm / 0.0011, 58)
    h -= 0.00006 * sstep(0.35, 0.1, g1) * R['nose']
    g2, _ = worley(Pm / 0.0016, 59)
    h += 0.00008 * sstep(0.1, 0.5, g2) * R['pad'] * R['paw']
    return h


def finish(C, ao, valid):
    return CV.finish(C, ao, valid, 0.45)


# ---------- coat: fur shells ----------
FUR = {'len': 0.055, 'n': 5, 'lean': 1.35, 'tile': 0.0018, 'babyLen': 1.25, 'babyLean': 0.6, 'shade': 0.62, 'quality': 80}


def fur(P, N, c):
    """fur length (meters) and strand density per point: a medium coat over the body, longer on the neck ruff, the
    chest, the belly, the backs of the legs and the tail; short on the face, the fronts of the legs and the paws"""
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y, z = Pm[:, 1], Pm[:, 2]
    M = _markings(R, Pm, N)
    ln = np.full(len(P), 0.026, F)
    ln = ln + 0.012 * sstep(0.2, 0.3, z) * sstep(0.62, 0.5, y) * (1 - R['head'])          # ruff and chest
    ln = ln + 0.014 * M['pale']                                                               # feathering
    leg = sstep(0.38, 0.25, y) * (1 - R['tail'])
    back = sstep(0.0, -0.6, N[:, 2])
    ln = ln * (1 - leg * (0.7 - 0.45 * back * sstep(0.12, 0.2, y)))
    hd = R['head']
    ln = ln * (1 - hd) + hd * (0.007 + 0.01 * sstep(0.04, 0.0, L[:, 2]) - 0.003 * sstep(0.13, 0.17, L[:, 2]))
    er = R['ear']
    ln = ln * (1 - er) + er * (0.012 + 0.012 * sstep(0.3, 0.7, R['ea'] / EAR_L) + 0.008 * sstep(EAR_W * 0.5, EAR_W, np.abs(R['ec'])))
    tl = R['tail']
    ln = ln * (1 - tl) + tl * (0.026 + 0.026 * sstep(0.2, -0.5, N[:, 1]) * sstep(0.05, 0.3, R['tt']) - 0.012 * sstep(0.85, 1.0, R['tt']))
    ln = ln * (1 - R['paw'] * 0.6)
    ln = ln * (1 - R['nose']) * (1 - R['lip']) * (1 - R['claw']) * (1 - R['pad'] * R['paw']) * sstep(EYE.r + 0.003, EYE.r + 0.009, R['eyeD'])
    dens = np.ones(len(P), F) * (1 - 0.3 * hd * sstep(0.15, 0.2, L[:, 2]))
    return np.clip(ln, 0, FUR['len']).astype(F), dens


MAP_QUALITY = (72, 70)
PAD_SMOOTH = 4


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': CV.lid_color(col, R['eyeD'], EYE.r)}


def meta(st):
    p, r, d, lid = EYE.meta()
    return {
        'eye': {'p': p, 'r': r, 'dir': d, 'lid': lid, 'iris': 0x5C3416, 'irisR': 0.9, 'pupilR': 0.46, 'rim': 0x1A0E06,
                'lidCol': st['lidCol'], 'babyLidCol': 0xC8A070, 'babyIris': 0x2E2A2A},
        # the band sits high on the neck behind the jaw and sinks into the ruff (maxR: the slice must not catch the
        # chest or the ears)
        'collar': {'at': ['neck2', 'head', 0.15], 'lift': 0.35, 'maxR': 0.085},
        'belly': [0.0, 0.41, -0.14],
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.22, 0.14, 0.06], 'flat': 0xC98C48,
    }


# ---------- puppies: a rounder little body and a pale cream coat ----------
BABY_TEX = 512
PUPPY = dict(c=V(0.0, 0.45, -0.07), r=(0.118, 0.114, 0.345), rb=0.148, e=2.05, maxd=0.07)


def _egg_walk(Q, Nm):
    g = PUPPY
    egg = lambda X: superellipsoid(X, g['c'], g['r'], g['e'], rb=g['rb'])
    X = Q.copy()
    for _ in range(16):
        X = X - Nm * np.clip(egg(X), -0.008, 0.008)[:, None]
    d = X - Q
    ln = np.linalg.norm(d, axis=1, keepdims=True)
    return d * np.minimum(1, g['maxd'] / np.maximum(ln, 1e-9))


def baby_offset(P, N, c):
    """per vertex offsets in adult space (the game adds the bigger head, short muzzle, big ears and short legs): the
    deep chest and tucked loin round off into a puppy's barrel with a full little belly"""
    Q = mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
    d = _egg_walk(Q, Nm)
    legd = np.minimum(c['fleg'], c['hleg'])
    w = sstep(0.07, -0.02, c['trunk'] - legd)
    w = w * sstep(-0.02, 0.06, np.minimum(c['head'], c['neck']) - c['trunk']) * sstep(0.3, 0.16, Q[:, 2]) * sstep(-0.47, -0.39, Q[:, 2])
    w = w * (1 - sstep(0.03, -0.005, c['tail']))
    d = d * w[:, None]
    d[:, 0] *= np.sign(P[:, 0] + 1e-9)
    return d.astype(F)


def baby_paint(P, N, c, col):
    R = _regions(P, N, c)
    Pm = R['Pm']
    M = _markings(R, Pm, N)
    n2 = fbm(Pm * 40, 3, 12)
    pup = mix(np.tile(hexc(0xDDB57A), (len(P), 1)), hexc(0xEACB94), n2)
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['lip'] + R['claw'] + R['pad'] * R['paw'], 0, 1)
    out = mix(col, pup, 0.8 * (1 - keep))
    out = mix(out, hexc(0xCB9A60), (M['saddle'] * 0.3 + R['ear'] * 0.3) * (1 - keep))
    s, tone = _strands(P, N, R)
    out *= (1 + s * 0.12 * (tone - 0.4))[:, None]
    return np.clip(out, 0, 1).astype(F)


# ---------- hair cards: the tail's feathering and whiskers ----------
def hair_texture():
    import smallfur as SF
    gold = [(0.0, (0.66, 0.43, 0.2)), (0.5, (0.8, 0.56, 0.28)), (1.0, (0.92, 0.76, 0.5))]
    gold2 = [(0.0, (0.6, 0.38, 0.17)), (0.6, (0.76, 0.52, 0.25)), (1.0, (0.88, 0.7, 0.44))]
    pale = [(0.0, (0.82, 0.62, 0.36)), (0.5, (0.92, 0.78, 0.52)), (1.0, (0.96, 0.88, 0.7))]
    wh = [(0.0, (0.1, 0.08, 0.07)), (1.0, (0.3, 0.26, 0.22))]
    cols = [dict(kind='hair', stops=wh, n=14, wid=1.6, end=(0.95, 1.0), wave=0.02, root=1.0),
            dict(kind='hair', stops=gold, n=60, wid=1.5, end=(0.45, 1.0), wave=0.14, root=0.04),
            dict(kind='hair', stops=gold2, n=60, wid=1.5, end=(0.4, 1.0), wave=0.16, root=0.04),
            dict(kind='hair', stops=pale, n=64, wid=1.5, end=(0.4, 1.0), wave=0.16, root=0.04)]
    return SF.strand_texture((256, 256), cols, seed=23)


HAIR = {'size': (256, 256), 'cols': 4, 'base': (0.66, 0.43, 0.2), 'hi': (0.8, 0.56, 0.28), 'tip': (0.92, 0.76, 0.5), 'strands': 40,
        'root': 0.05, 'rough': 0.6, 'alpha': 0.3, 'seed': 23, 'quality': 78}


def _tail_bone_weights(p):
    tt, _ = tail_t(mirror(np.asarray(p, F)[None, :]))
    tw = tail_weights(tt)[0]
    return {b: float(w) for b, w in zip(TAIL_BONES, tw) if w > 1e-3}


def _tail_cards():
    """the flag: locks along the underside and the sides of the tail, hanging down and back, longest in the middle"""
    out = []
    n = 40
    for i in range(n):
        t = 0.1 + 0.85 * ((i * 0.618034) % 1.0)
        q = min(int(t * (len(_TP) - 1)), len(_TP) - 2)
        C = _TP[q]; T = nrm(_TP[q + 1] - _TP[q])
        X = V(1.0, 0, 0)
        U = nrm(np.cross(T, X))          # the path normal: down and back for a tail going back and down
        down = U if U[1] < 0 else -U
        side = 1 if i % 2 else -1
        ang = (0.15 + 0.75 * rnd(i, 3)) * side          # 0 straight down, toward the side
        radial = nrm(down * np.cos(ang) + X * np.sin(ang))
        r0 = np.interp(t, np.linspace(0, 1, len(TAIL)), [k[2] for k in TAIL])
        ln = (0.045 + 0.05 * np.sin(np.pi * min(1.0, t * 1.1)) ** 0.8) * (0.8 + 0.35 * rnd(i, 5))
        k = 4
        ts = np.linspace(0, 1, k)
        root = C + radial * r0 * 0.8
        dirv = nrm(radial * 0.75 + T * (0.6 + 0.3 * rnd(i, 7)) + V(0, -0.25, 0))
        pts = np.array([root + dirv * (ln * u) + V(0, -0.012, 0) * u * u for u in ts], F)
        sd = nrm(np.cross(radial, T))
        out.append({'pts': pts, 'w': np.linspace(0.03, 0.038, k) * (0.85 + 0.3 * rnd(i, 9)), 'nrm': np.tile(radial, (k, 1)), 'side': np.tile(sd, (k, 1)),
                    'col': 1 + i % 3, 'baby': None})
    return out


def cards():
    out = []
    # whiskers: short and stiff from the whisker pads, a few over the eyes
    rows = []
    for i in range(4):
        s0 = 0.162 + 0.03 * (i % 3) / 2 + 0.004 * (rnd(i, 1) - 0.5)
        u0 = -0.022 - 0.01 * (i // 3) + 0.003 * (rnd(i, 2) - 0.5)
        root = HF.pt(s0, u0, 0.031 - 0.004 * (i % 3) / 2)
        d = nrm(V(0.8, 0.0, 0.0) + HF.a * (-0.2 + 0.4 * (i % 3) / 2) + HF.u * (0.15 - 0.25 * (i // 3)))
        rows.append((root, d, 0.03 + 0.012 * rnd(i, 4), 0.0008, 0.15, 0))
    wk = []
    for sg in (1, -1):
        m = V(sg, 1, 1)
        wk += CV.whiskers([(root * m, d * m, ln, w, droop, col) for root, d, ln, w, droop, col in rows], baby=0.6)
    roots = np.array([cd['pts'][0] for cd in wk], F)
    g = CV.gradient(shape, roots)
    dd = shape(roots)
    for cd, gg, d0 in zip(wk, g, dd):
        cd['pts'][0] = cd['pts'][0] - gg * (d0 + 0.001)
    out += wk
    # the tail's feathering: roots in the skin, the rest following the tail bones at their own place along it
    tc = _tail_cards()
    allp = np.concatenate([c_['pts'][1:] for c_ in tc]).astype(F)
    allp = CV.push_out(shape, allp, 0.008)
    o = 0
    for c_ in tc:
        n_ = len(c_['pts']) - 1
        c_['pts'] = np.concatenate([c_['pts'][:1], allp[o:o + n_]]).astype(F); o += n_
        c_['bones'] = [{'_skin': 1.0}] + [wsum(*[(b, w) for b, w in _tail_bone_weights(p).items()]) for p in c_['pts'][1:]]
        r0 = c_['pts'][0]
        c_['baby'] = np.array([r0 + (p - r0) * 0.2 for p in c_['pts']], F)
    roots = np.array([c_['pts'][0] for c_ in tc], F)
    g = CV.gradient(shape, roots)
    dd = shape(roots)
    for c_, gg, d0 in zip(tc, g, dd):
        c_['pts'][0] = c_['pts'][0] - gg * (d0 + 0.002)
    out += tc
    return out
