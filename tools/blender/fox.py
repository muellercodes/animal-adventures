# Red fox, sculpted as a signed distance field around the game's fox skeleton (tools/blender/work/fox-rig.json).
# Units are meters in game rig space (x left, y up, z forward, ground at y = 0). Shape first (trunk, neck, head,
# ears, legs, paws, the brush), then the coat paint, fine detail, fur shells and hair cards (whiskers).
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length
import carnivore as CV
from carnivore import local, local_n, mirror, groove, mix, hexc, rnd, wsum

ID = 'fox'
BOUNDS = (V(-0.16, 0.0, -0.68), V(0.16, 0.56, 0.43))
BAKE_DIST = (0.006, 0.02, 0.05)
DISSOLVE_DEGENERATE = True
TAIL_RINGS = 0

# ---------- landmarks (left side, +x) ----------
# head frame: from the back of the skull forward along the muzzle (s), up across it (u)
HF = CV.Frame(V(0.0, 0.405, 0.245), V(0.0, -0.17, 1.0), V(0.0, 1.0, 0.0))
EYE = CV.Eye(HF.pt(0.0755, 0.022, 0.0258), 0.0084, V(0.46, 0.12, 0.88), lid_w=0.0078, lid_h=0.0049, off=0.0006, slant=0.22,
             mound=(0.003, 0.0026, 0.001), sink=0.3)
NOSE_S = 0.153
MOUTH = HF.pt(0.138, -0.022)
EAR_B = V(0.03, 0.442, 0.273)
EAR_A = nrm([0.36, 0.93, 0.02])
EAR_N = nrm([0.42, -0.12, 0.9])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
EAR_L, EAR_W = 0.08, 0.025
XF, XH = 0.047, 0.046
PAW_F = V(XF, 0.0, 0.124)
PAW_H = V(XH, 0.0, -0.155)
PATCHES = [
    (EYE.c * V(0, 1, 1) + V(0.012, -0.016, -0.016), EYE.c * V(0, 1, 1) + V(0.05, 0.016, 0.018), 0.0005),   # eye and lids
    (HF.pt(0.11, 0.0) * V(0, 1, 1) + V(0.0, -0.035, 0.0), HF.pt(0.16, 0.0) * V(0, 1, 1) + V(0.03, 0.02, 0.01), 0.0006),  # muzzle, nose, lips
    (V(0.012, 0.43, 0.245), V(0.085, 0.53, 0.3), 0.0007),                                                     # ear
    (V(0.02, -0.001, 0.095), V(0.075, 0.03, 0.155), 0.0007),                                                  # front paw
    (V(0.02, -0.001, -0.18), V(0.075, 0.03, -0.12), 0.0007),                                                  # hind paw
]

# trunk (with its coat): z, top, yw (height of widest), bottom, half width, exponent above, below
TRUNK = [
    (-0.255, 0.35, 0.31, 0.272, 0.03, 2.2, 2.0),
    (-0.235, 0.362, 0.308, 0.258, 0.05, 2.3, 2.1),
    (-0.2, 0.37, 0.307, 0.25, 0.06, 2.4, 2.1),
    (-0.15, 0.371, 0.31, 0.252, 0.062, 2.4, 2.1),
    (-0.09, 0.372, 0.314, 0.258, 0.06, 2.4, 2.1),
    (-0.03, 0.373, 0.312, 0.246, 0.062, 2.4, 2.1),
    (0.03, 0.375, 0.306, 0.228, 0.066, 2.4, 2.1),
    (0.08, 0.377, 0.302, 0.214, 0.066, 2.3, 2.1),
    (0.125, 0.374, 0.3, 0.212, 0.06, 2.2, 2.1),
    (0.16, 0.366, 0.3, 0.226, 0.046, 2.1, 2.1),
    (0.185, 0.35, 0.302, 0.25, 0.028, 2.0, 2.0),
]
# neck: path (y, z), section toward the nape (top), toward the throat (bot), half width, exponents
NECK = [
    (0.3, 0.09, 0.066, 0.08, 0.058, 2.0, 2.0),
    (0.33, 0.16, 0.052, 0.068, 0.05, 2.0, 2.0),
    (0.362, 0.212, 0.044, 0.056, 0.044, 2.0, 2.0),
    (0.392, 0.245, 0.038, 0.046, 0.039, 2.0, 2.0),
]
# head: along the head frame (s), top, height of widest, bottom, half width, exponents (with the coat)
HEAD = [
    (-0.012, 0.028, 0.0, -0.032, 0.028, 2.2, 2.0),
    (0.01, 0.043, 0.0, -0.045, 0.039, 2.5, 2.0),
    (0.035, 0.047, 0.002, -0.047, 0.042, 2.6, 2.0),
    (0.06, 0.042, 0.004, -0.044, 0.038, 2.6, 2.0),
    (0.08, 0.032, 0.002, -0.038, 0.029, 2.5, 2.1),
    (0.1, 0.02, -0.004, -0.032, 0.0195, 2.3, 2.2),
    (0.12, 0.0125, -0.006, -0.026, 0.015, 2.2, 2.3),
    (0.14, 0.0078, -0.006, -0.0175, 0.011, 2.2, 2.3),
    (0.157, 0.0038, -0.0055, -0.0115, 0.0072, 2.2, 2.2),
]
FORE = [
    (0.29, 0.125, 0.03, 0.036, 0.023, 2.2, 2.2, 0.04),
    (0.24, 0.112, 0.027, 0.033, 0.021, 2.2, 2.2, 0.043),
    (0.195, 0.098, 0.022, 0.026, 0.02, 2.2, 2.2, 0.046),
    (0.16, 0.094, 0.0175, 0.0165, 0.0155, 2.2, 2.2, 0.047),
    (0.11, 0.1, 0.0128, 0.0118, 0.0122, 2.2, 2.2, 0.047),
    (0.07, 0.106, 0.0108, 0.0105, 0.0108, 2.2, 2.2, 0.047),
    (0.045, 0.11, 0.0103, 0.0103, 0.0105, 2.2, 2.2, 0.047),
    (0.026, 0.115, 0.0105, 0.0105, 0.011, 2.2, 2.2, 0.047),
    (0.012, 0.117, 0.0105, 0.0105, 0.011, 2.2, 2.2, 0.047),
]
HIND = [
    (0.262, -0.142, 0.034, 0.044, 0.023, 2.0, 2.0, 0.036),
    (0.21, -0.12, 0.03, 0.04, 0.023, 2.2, 2.2, 0.042),
    (0.17, -0.132, 0.02, 0.03, 0.019, 2.2, 2.2, 0.046),
    (0.13, -0.16, 0.014, 0.021, 0.0135, 2.2, 2.2, 0.046),
    (0.1, -0.18, 0.0118, 0.0155, 0.0118, 2.2, 2.2, 0.046),
    (0.065, -0.174, 0.0104, 0.011, 0.0104, 2.2, 2.2, 0.046),
    (0.028, -0.164, 0.0105, 0.0105, 0.011, 2.2, 2.2, 0.046),
    (0.012, -0.164, 0.0105, 0.0105, 0.011, 2.2, 2.2, 0.046),
]
# the brush: path (y, z), radius (round section)
TAIL = [(0.316, -0.2, 0.027), (0.307, -0.245, 0.035), (0.288, -0.295, 0.042), (0.26, -0.355, 0.046), (0.231, -0.425, 0.05),
        (0.207, -0.495, 0.049), (0.191, -0.555, 0.042), (0.183, -0.603, 0.028), (0.181, -0.632, 0.01)]


def _tail_keys():
    return [(y, z, r, r, r * 0.97, 2.0, 2.0) for y, z, r in TAIL]


# ---------- trunk, neck ----------
def trunk(P):
    Q = mirror(P)
    d = loft(Q, TRUNK)
    # shoulder blades over the withers, the point of shoulder in front
    d = smin(d, ellipsoid(Q, V(0.034, 0.335, 0.09), V(0.026, 0.045, 0.05)), 0.04)
    d = smin(d, ellipsoid(Q, V(0.038, 0.27, 0.135), V(0.02, 0.024, 0.02)), 0.03)
    # breast between the front legs, rounded and furry
    d = smin(d, ellipsoid(Q, V(0.0, 0.255, 0.155), V(0.042, 0.05, 0.04)), 0.03)
    # croup and rump, a little rounded over the hips
    d = smin(d, ellipsoid(Q, V(0.03, 0.335, -0.185), V(0.035, 0.04, 0.06)), 0.03)
    # belly: tucked up toward the flank
    return d


def neck(P):
    Q = mirror(P)
    d = sweep(Q, NECK)
    # ruff: thick fur under the throat and on the sides of the neck
    d = smin(d, ellipsoid(Q, V(0.0, 0.305, 0.205), V(0.042, 0.052, 0.05)), 0.03)
    d = smin(d, ellipsoid(Q, V(0.028, 0.35, 0.215), V(0.03, 0.04, 0.04)), 0.025)
    return d


# ---------- head ----------
def head(P):
    Q = mirror(P)
    L = HF.loc(Q)
    d = loft(L, HEAD)
    # cheek ruff: the fur flares out behind the jaw and under the ear
    d = smin(d, ellipsoid(L, V(0.033, -0.026, 0.04), V(0.021, 0.026, 0.03)), 0.015)
    # zygomatic arch under the eye, the hollow along the muzzle in front of it
    d = smin(d, round_cone(L, V(0.028, -0.006, 0.055), V(0.024, -0.008, 0.088), 0.008, 0.006), 0.012)
    d = d + groove(np.sqrt((L[:, 0] - 0.019) ** 2 + ((L[:, 1] + 0.002) * 0.8) ** 2), 0.006, 0.0018) * sstep(0.09, 0.1, L[:, 2]) * sstep(0.135, 0.12, L[:, 2])
    # whisker pads on the upper lip
    d = smin(d, ellipsoid(L, V(0.0085, -0.0115, 0.128), V(0.0062, 0.0068, 0.02)), 0.005)
    # lower jaw and the small chin
    d = smin(d, ellipsoid(L, V(0.0, -0.0215, 0.108), V(0.0105, 0.0058, 0.034)), 0.008)
    # nose pad
    d = smin(d, ellipsoid(L, V(0.0, 0.0, NOSE_S + 0.001), V(0.0058, 0.0046, 0.0044)), 0.0025)
    # mouth: the lip line from the front back to the corner below the eye
    M = L * V(1, 2.5, 1)
    m = round_cone(M, V(0.0, -0.0155 * 2.5, 0.152), V(0.0085, -0.017 * 2.5, 0.138), 0.0013, 0.0013)
    m = smin(m, round_cone(M, V(0.0085, -0.017 * 2.5, 0.138), V(0.0155, -0.0195 * 2.5, 0.098), 0.0013, 0.0007), 0.002)
    d = smax(d, -(m + 0.0008) / 2.5, 0.0015)
    # nostrils: comma shaped openings facing forward and out, the groove down the middle (philtrum)
    for sg in (1,):
        nc = V(0.003 * sg, -0.0018, NOSE_S + 0.0036)
        n1 = ellipsoid(L, nc, V(0.0014, 0.001, 0.0024))
        n1 = smin(n1, ellipsoid(L, nc + V(0.0016, -0.0009, -0.001), V(0.0009, 0.0007, 0.0018)), 0.0009)
        d = smax(d, -n1, 0.0008)
    d = d + groove(L[:, 0], 0.0009, 0.0007) * sstep(NOSE_S - 0.002, NOSE_S + 0.003, L[:, 2]) * sstep(-0.004, -0.007, L[:, 1])
    return d


def eye_parts(P):
    Q = mirror(P)
    carve, lids, ball = EYE.parts(Q)
    L = EYE.loc(Q)
    brow = round_cone(L, V(-0.012, 0.0095, -0.004), V(0.009, 0.0105, -0.005), 0.0045, 0.0035)
    return carve, lids, ball, brow


def ear(P):
    Q = mirror(P)
    return CV.ear(Q, EAR_B, EAR_A, EAR_N, EAR_L, EAR_W, 'point', th0=0.0065, th1=0.0016, cup=0.55, tipin=-0.004,
                  base_r=(0.009, 0.006, 0.0045))


# ---------- legs and paws ----------
def fleg(P):
    Q = mirror(P)
    x = XF
    d = sweep(Q, FORE, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(x - 0.003, 0.235, 0.092), V(0.019, 0.04, 0.026)), 0.02)     # triceps behind the arm
    d = smin(d, ellipsoid(Q, V(x, 0.184, 0.08), V(0.012, 0.014, 0.011)), 0.012)              # point of elbow
    d = smin(d, ellipsoid(Q, V(x + 0.002, 0.14, 0.101), V(0.0135, 0.03, 0.0135)), 0.012)     # forearm muscles
    d = smin(d, ellipsoid(Q, V(x, 0.065, 0.103), V(0.0115, 0.012, 0.0115)), 0.008)          # wrist
    return d


def hleg(P):
    Q = mirror(P)
    x = XH
    d = sweep(Q, HIND, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(0.034, 0.258, -0.172), V(0.019, 0.06, 0.05)), 0.045)        # thigh
    d = smin(d, ellipsoid(Q, V(0.034, 0.24, -0.205), V(0.021, 0.05, 0.026)), 0.025)        # hamstrings behind
    d = smin(d, ellipsoid(Q, V(x, 0.205, -0.112), V(0.02, 0.022, 0.018)), 0.015)            # stifle
    d = smin(d, round_cone(Q, V(x, 0.172, -0.162), V(x, 0.112, -0.196), 0.008, 0.006), 0.012)   # Achilles tendon
    d = smin(d, ellipsoid(Q, V(x, 0.104, -0.196), V(0.0085, 0.012, 0.0095)), 0.006)         # point of hock
    return d


F_TOES = [(0.0042, 0.007, 0.0049, 0.0092, 0.0), (-0.0042, 0.007, 0.0049, 0.0092, 0.0), (0.0108, 0.0005, 0.0045, 0.008, 0.0005),
          (-0.0108, 0.0005, 0.0045, 0.008, 0.0005)]
H_TOES = [(0.0039, 0.0065, 0.0046, 0.0088, 0.0), (-0.0039, 0.0065, 0.0046, 0.0088, 0.0), (0.0099, 0.0003, 0.0042, 0.0076, 0.0005),
          (-0.0099, 0.0003, 0.0042, 0.0076, 0.0005)]


def paws(P):
    """both paws of the +x side: (paw, claws)"""
    Q = mirror(P)
    a, ca = CV.paw(Q, PAW_F, F_TOES, pad=(0.0112, 0.0088, 0.0125), claw=(0.0028, 0.001), yaw=0.08)
    b, cb = CV.paw(Q, PAW_H, H_TOES, pad=(0.0106, 0.0085, 0.0125), claw=(0.0026, 0.0009), yaw=0.05)
    return np.minimum(a, b), np.minimum(ca, cb)


def tail(P):
    return sweep(mirror(P), _tail_keys())


# ---------- assembled ----------
def parts(P):
    ca, li, ba, br = eye_parts(P)
    pw, cl = paws(P)
    return {'trunk': trunk(P), 'neck': neck(P), 'head': head(P), 'ear': ear(P), 'lids': li, 'ball': ba, 'fleg': fleg(P), 'hleg': hleg(P),
            'paw': pw, 'claw': cl, 'tail': tail(P)}


def shape(P):
    d = trunk(P)
    d = smin(d, local(P, (-0.13, 0.17, -0.06), (0.13, 0.5, 0.33), neck), 0.06)
    h = local(P, (-0.1, 0.29, 0.14), (0.1, 0.5, 0.43), head)
    ca, li, ba, br = local_n(P, (-0.06, 0.39, 0.29), (0.06, 0.45, 0.36), eye_parts, 4)
    h = smin(h, li, 0.004)
    h = smin(h, br, 0.006)
    h = smax(h, -ca, 0.0015)
    h = smin(h, ba, 0.0008)
    d = smin(d, h, 0.025)
    d = smin(d, local(P, (-0.1, 0.41, 0.23), (0.1, 0.56, 0.33), ear), 0.006)
    fl = local(P, (-0.11, -0.01, -0.02), (0.11, 0.36, 0.22), fleg)
    d = smin(d, fl, 0.035)
    hl = local(P, (-0.12, -0.01, -0.33), (0.12, 0.38, 0.02), hleg)
    d = smin(d, hl, 0.04)
    pw, cl = local_n(P, (-0.08, -0.01, -0.19), (0.08, 0.04, 0.16), paws, 2)
    d = smin(d, pw, 0.008)
    d = np.minimum(d, cl)
    d = smin(d, local(P, (-0.08, 0.1, -0.67), (0.08, 0.38, -0.12), tail), 0.02)
    return d


# camera views for tools/blender/preview.py: position, target, field of view (game rig space)
PREVIEW = {
    'side': ((2.3, 0.35, -0.1), (0, 0.27, -0.1), 30),
    'front3q': ((1.3, 0.6, 1.4), (0, 0.27, -0.05), 30),
    'front': ((0.0, 0.4, 2.0), (0, 0.3, 0.0), 26),
    'rear3q': ((-1.2, 0.7, -1.5), (0, 0.27, -0.15), 30),
    'top': ((0.01, 2.3, -0.1), (0, 0.3, -0.1), 30),
    'face': ((0.2, 0.47, 0.75), (0, 0.41, 0.3), 24),
    'faceside': ((0.5, 0.43, 0.32), (0.0, 0.41, 0.31), 24),
    'feet': ((0.35, 0.08, 0.35), (0.04, 0.03, 0.0), 30),
    'eye': ((0.14, 0.44, 0.45), (0.032, 0.418, 0.325), 12),
    'muzzle': ((0.12, 0.42, 0.55), (0.0, 0.39, 0.37), 18),
    'headside': ((0.7, 0.42, 0.3), (0, 0.42, 0.3), 24),
    'headtop': ((0.05, 0.9, 0.3), (0, 0.42, 0.3), 24),
}


# ---------- game mesh: decimation, texture layout, skinning ----------
def keep(P):
    """higher where the game mesh keeps more of the sculpt when decimating: a floor over the whole body (big smooth
    areas would get almost nothing), more on the eyes, nose and lips, ears, paws (never 1, which locks a vertex)"""
    Pm = mirror(P)
    tl = sstep(-0.22, -0.26, Pm[:, 2]) * sstep(0.12, 0.15, Pm[:, 1])
    base = KEEP[0] + (KEEP[6] - KEEP[0]) * tl
    e = sstep(0.026, 0.012, np.linalg.norm(Pm - EYE.c, axis=1)) * KEEP[1]
    L = HF.loc(Pm)
    hd = sstep(-0.01, 0.02, L[:, 2]) * sstep(0.32, 0.35, Pm[:, 1]) * KEEP[2]
    m = sstep(0.105, 0.13, L[:, 2]) * sstep(-0.05, -0.03, L[:, 1]) * KEEP[3]
    a, c, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    er = sstep(-0.012, 0.0, a) * sstep(0.034, 0.024, np.abs(c)) * sstep(0.016, 0.008, np.abs(n)) * KEEP[4]
    pw = sstep(0.03, 0.018, Pm[:, 1]) * KEEP[5]
    return np.maximum.reduce([base, e, hd, m, er, pw]).astype(F)


# keep levels: body floor, eyes, head, muzzle tip, ears, paws, the brush's floor
KEEP = (0.44, 0.82, 0.6, 0.72, 0.6, 0.58, 0.36)


UV_AVERAGE = True


def uv_regions(P):
    """texture layout regions, unwrapped one by one: head, ears, neck, trunk, upper and lower legs, the brush"""
    Pm = mirror(P)
    L = HF.loc(Pm)
    y, z = Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 2)
    a, c, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    head = (L[:, 2] > 0.0) & (y > 0.32)
    neck = ~head & (z > 0.14) & (y > 0.27)
    fleg = (z > -0.02) & (y < 0.235)
    hleg = (z <= -0.02) & (y < 0.25) & (z > -0.235)
    tail = (z < -0.22) & ~hleg & (y > 0.13)
    lab[neck] = 1
    lab[head] = 0
    lab[head & (a > 0.006) & (np.abs(c) < 0.04)] = 8
    lab[fleg] = 3
    lab[fleg & (y < 0.11)] = 4
    lab[hleg] = 5
    lab[hleg & (y < 0.12)] = 6
    lab[tail & (z < -0.24)] = 7
    return lab


def uv_weight(P):
    """linear texel density per island center: the face most, then the ears and paws; the belly and inner legs less"""
    Pm = mirror(P)
    L = HF.loc(Pm)
    head = sstep(-0.01, 0.02, L[:, 2]) * sstep(0.3, 0.34, Pm[:, 1])
    paw = sstep(0.05, 0.025, Pm[:, 1])
    under = sstep(0.27, 0.24, Pm[:, 1]) * sstep(0.03, 0.015, Pm[:, 0]) * sstep(0.2, 0.15, Pm[:, 1])
    return (0.92 + 0.8 * head + 0.25 * paw - 0.25 * under).astype(F)


WEIGHT_SMOOTH = (5, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['neck2'], 'neck2': P['head'], 'head': HF.pt(0.155, 0.0),
         'tail1': P['tail2'], 'tail2': P['tail3'], 'tail3': V(0, 0.18, -0.63)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (PAW_H + V(0, 0.005, 0.02)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (PAW_F + V(0, 0.005, 0.02)) * m
        t['ear' + s] = (EAR_B + EAR_A * EAR_L) * m
    return t


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    W[:, bi['ctag']] = 0
    x = wpos[:, 0]
    Pm = mirror(wpos)
    # nothing of the other side's legs and ears (the transfer can reach across the belly and the chest)
    for b in names:
        if b.endswith('L') and b[:-1] + 'R' in bi:
            r = bi[b[:-1] + 'R']; l = bi[b]
            pos = x > 0.008
            W[pos, l] += W[pos, r]; W[pos, r] = 0
            neg = x < -0.008
            W[neg, r] += W[neg, l]; W[neg, l] = 0
    # ears ride on the ear bones, blending into the head at the base
    a, c, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    ear_d = ear(wpos)
    on = (ear_d < 0.002) & (a > -0.004)
    k = sstep(-0.004, 0.012, a)
    for s, sg in (('L', 1), ('R', -1)):
        CV.set_part(W, bi, on & (x * sg > 0), 'ear' + s, k)
    # paws: the toes and pads on the paw bones
    for s, sg in (('L', 1), ('R', -1)):
        for c0, b in ((PAW_F, 'fpaw'), (PAW_H, 'hpaw')):
            near = (np.abs(x - sg * c0[0]) < 0.03) & (np.abs(wpos[:, 2] - c0[2]) < 0.035) & (wpos[:, 1] < 0.03)
            CV.set_part(W, bi, near, b + s, sstep(0.026, 0.014, wpos[:, 1]))
    s = W.sum(1, keepdims=True)
    return W / np.maximum(s, 1e-9)


# ---------- coat: direction, regions, paint ----------
_TY = np.array([t[0] for t in TAIL], F)
_TZ = np.array([t[1] for t in TAIL], F)


def tail_dir(z):
    """unit direction along the brush toward its tip at depth z"""
    zs, ys = _TZ[::-1], _TY[::-1]
    dydz = np.interp(z, zs, np.gradient(ys, zs))
    t = np.stack([np.zeros_like(z), -dydz, -np.ones_like(z)], 1)
    return t / np.linalg.norm(t, axis=1, keepdims=True)


def tail_t(z):
    return np.clip((-0.205 - z) / (0.632 - 0.205), 0, 1)


def flow(P, N=None):
    """direction the coat lies in: from the nose back over the head, down and back on the cheeks, back along the body
    and down its sides, down the legs, along the brush to its tip, up the ears"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    one = np.ones_like(y)
    body = np.stack([0.25 * sstep(0.02, 0.06, x), -(0.12 + 0.9 * sstep(0.33, 0.25, y)), -one], 1)
    neckd = np.stack([0.2 * one, -0.75 * one, -0.55 * one], 1)
    legd = np.stack([0 * y, -one, -0.1 * one], 1)
    L = HF.loc(Q)
    cheek = sstep(0.0, -0.025, L[:, 1]) * sstep(0.1, 0.06, L[:, 2])
    head = -HF.a[None, :] + np.stack([0.35 * sstep(0.005, 0.03, x) + 0.4 * cheek, -0.35 * cheek, 0 * y], 1)
    taild = tail_dir(z)
    wh = sstep(-0.005, 0.025, L[:, 2]) * sstep(0.3, 0.335, y)
    wt = sstep(-0.215, -0.245, z) * sstep(0.1, 0.14, y) * (1 - sstep(0.22, 0.17, y) * sstep(-0.26, -0.22, z))
    wn = sstep(0.12, 0.17, z) * sstep(0.26, 0.3, y) * (1 - wh)
    wl = sstep(0.24, 0.2, y) * (1 - wh - wn) * (1 - wt)
    wb = np.clip(1 - wh - wn - wl - wt, 0, 1)
    f = body * wb[:, None] + head * wh[:, None] + neckd * wn[:, None] + legd * wl[:, None] + taild * wt[:, None]
    a, c, n = CV.ear_coords(Q, EAR_B, EAR_A, EAR_N)
    we = sstep(-0.004, 0.01, a) * sstep(0.04, 0.028, np.abs(c)) * sstep(0.014, 0.008, np.abs(n))
    f = f * (1 - we)[:, None] + EAR_A[None, :] * we[:, None]
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
    r['ball'] = sstep(0.0008, 0.0002, c['ball']) * sstep(EYE.r + 0.003, EYE.r + 0.0008, de)
    El = EYE.loc(Pm)
    ua = El[:, 1] - EYE.off - EYE.slant * El[:, 0]
    ring = np.sqrt((El[:, 0] / (EYE.lid_w + 0.0025)) ** 2 + (ua / (EYE.lid_h + 0.0022)) ** 2)
    r['lid'] = sstep(1.15, 0.9, ring) * (1 - r['ball']) * sstep(EYE.r + 0.008, EYE.r + 0.004, de)
    r['head'] = sstep(-0.01, 0.01, L[:, 2]) * sstep(0.004, 0.0, c['head'])
    r['nose'] = sstep(0.0012, 0.0, ellipsoid(L, V(0.0, 0.0, NOSE_S + 0.001), V(0.0062, 0.005, 0.0048))) * sstep(NOSE_S - 0.006, NOSE_S - 0.002, L[:, 2])
    lipu = -0.0155 - 0.0045 * sstep(0.15, 0.1, L[:, 2])
    r['lip'] = sstep(0.0028, 0.0012, np.abs(L[:, 1] - lipu)) * sstep(0.093, 0.1, L[:, 2]) * r['head']
    a, cc, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    r['ea'], r['ec'], r['en'] = a, cc, n
    r['ear'] = sstep(0.0025, 0.0006, c['ear']) * sstep(-0.004, 0.006, a)
    r['earIn'] = sstep(-0.15, 0.35, Nm @ EAR_N) * sstep(0.004, -0.004, np.abs(cc) - EAR_W * 0.8 * (1 - a / EAR_L))
    r['paw'] = sstep(0.003, 0.0, c['paw']) * sstep(0.03, 0.02, y)
    r['pad'] = sstep(-0.2, -0.75, N[:, 1]) * sstep(0.006, 0.002, y)
    r['claw'] = sstep(0.0008, 0.0, c['claw'])
    r['tt'] = tail_t(z)
    r['tail'] = sstep(0.006, 0.0, c['tail']) * sstep(-0.2, -0.23, z) * sstep(0.12, 0.15, y)
    r['top'] = sstep(0.3, 0.85, N[:, 1])
    return r


K = {
    'red': hexc(0xC65D21), 'redDk': hexc(0x8A3814), 'redLt': hexc(0xD9813A), 'gold': hexc(0xE0A15A), 'rust': hexc(0xA44418),
    'white': hexc(0xF1ECE3), 'cream': hexc(0xE3D8C6), 'gray': hexc(0xB8ADA2), 'black': hexc(0x1B1613), 'blackHi': hexc(0x3B2D24),
    'nose': hexc(0x151110), 'lip': hexc(0x1E1715), 'earIn': hexc(0xEDE3D3), 'pad': hexc(0x2C2522), 'claw': hexc(0x37302B),
    'ball': hexc(0x100A08), 'smoke': hexc(0x6E5446),
}


def _lenk(Pm):
    """stroke length factor: short on the face and lower legs, long on the body, longest on the brush"""
    L = HF.loc(Pm)
    hd = sstep(-0.005, 0.02, L[:, 2]) * sstep(0.3, 0.335, Pm[:, 1])
    lg = sstep(0.2, 0.12, Pm[:, 1]) * (1 - sstep(-0.22, -0.25, Pm[:, 2]))
    tl = sstep(-0.22, -0.26, Pm[:, 2]) * sstep(0.12, 0.15, Pm[:, 1])
    return np.clip(1.0 - 0.5 * hd - 0.45 * lg + 0.6 * tl, 0.4, 1.7)


_scache = {}


def _strands(P, N, R):
    key = (len(P), float(P[:7].sum()))
    if key not in _scache:
        dens = 0.9 * (1 - R['nose']) * (1 - R['ball']) * (1 - R['claw']) * (1 - R['pad']) * (1 - 0.6 * R['lip']) * sstep(EYE.r + 0.002, EYE.r + 0.006, R['eyeD'])
        _scache[key] = CV.strands(P, N, dens, flow, 0.0042, 0.0055, 0.0095, 0.0006, seed=71, lenk=lambda Q: _lenk(mirror(Q)))
    return _scache[key]


def _markings(R, c, Pm, N):
    """white, black and dark masks of the red fox coat"""
    L = R['L']
    s, u = L[:, 2], L[:, 1]
    y, z = Pm[:, 1], Pm[:, 2]
    xn = Pm[:, 0]
    w1 = fbm(Pm * 160, 2, 41) - 0.5
    w2 = fbm(Pm * 45, 2, 42) - 0.5
    hd = R['head']
    # white: upper lip and lower cheeks below a line from the nose back under the eye into the cheek ruff, the chin
    line = np.interp(s, [0.0, 0.015, 0.03, 0.05, 0.07, 0.09, 0.12, 0.16], [-0.04, -0.03, -0.019, -0.009, -0.006, -0.0065, -0.0055, -0.0035]) + 0.008 * w2 + 0.004 * w1
    face_w = sstep(line + 0.002, line - 0.003, u) * sstep(0.0, 0.012, s) * hd
    # the throat and a bib down the chest between the front legs
    bibw = 0.03 + 0.012 * sstep(0.2, 0.3, y) + 0.016 * w2
    under_neck = sstep(0.12, 0.17, z) * sstep(bibw, bibw - 0.012, xn) * sstep(0.36, 0.33, y + 0.25 * (z - 0.2)) * (1 - hd * sstep(0.0, 0.02, s))
    chest = sstep(0.12, 0.15, z) * sstep(0.02 + 0.016 * w2, 0.01, xn) * sstep(0.2, 0.24, y) * sstep(0.31, 0.28, y)
    white = np.maximum.reduce([face_w, under_neck, chest])
    ear_in = R['ear'] * R['earIn']
    # belly: cream to gray, not as bright as the bib; pale inner legs
    belly = sstep(-0.3, -0.75, N[:, 1]) * sstep(0.27, 0.24, y) * sstep(0.14, 0.1, z) * sstep(-0.21, -0.17, z)
    inner_leg = sstep(0.0, -0.4, R['Nm'][:, 0]) * sstep(0.27, 0.2, y) * sstep(0.07, 0.11, y)
    # black: ear backs and tips, stockings, a mark from the eye down the muzzle
    ear_b = R['ear'] * (1 - R['earIn']) * sstep(0.01, 0.025, R['ea'])
    ear_tip = R['ear'] * sstep(EAR_L * 0.62, EAR_L * 0.8, R['ea'])
    front = sstep(-0.02, 0.02, z)
    nfront = sstep(-0.2, 0.5, N[:, 2])
    stock_f = front * sstep(0.2 + 0.03 * nfront + 0.04 * w2, 0.16 + 0.03 * nfront, y) * (1 - R['tail'])
    hind = sstep(0.0, -0.04, z) * sstep(-0.215, -0.19, z)
    stock_h = hind * np.maximum(sstep(0.12 + 0.04 * w2, 0.09, y), sstep(0.17, 0.12, y) * sstep(0.0, 0.6, N[:, 2]))
    paws = sstep(0.04, 0.025, y)
    stock = np.clip(np.maximum.reduce([stock_f, stock_h, paws]), 0, 1)
    tear = sstep(0.004, 0.0015, np.abs(u - (0.012 - 0.32 * (s - 0.075)))) * sstep(0.072, 0.082, s) * sstep(0.115, 0.1, s) * sstep(0.012, 0.02, xn) * hd
    # the brush: white tip, a dark spot over the gland near the base
    tt = R['tt']
    th = 0.835 + 0.06 * w2
    tip = R['tail'] * sstep(th, th + 0.035, tt)
    gland = R['tail'] * sstep(0.022, 0.012, np.sqrt(xn ** 2 + ((z + 0.3) * 0.6) ** 2)) * sstep(0.2, 0.6, N[:, 1])
    return dict(white=white, ear_in=ear_in, belly=belly, inner_leg=inner_leg, ear_b=ear_b, ear_tip=ear_tip, stock=stock, tear=tear, tip=tip, gland=gland)


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y, z = Pm[:, 1], Pm[:, 2]
    M = _markings(R, c, Pm, N)
    n1 = fbm(Pm * 9, 3, 11)
    n2 = fbm(Pm * 40, 3, 12)
    col = np.tile(K['red'], (len(P), 1))
    # rufous back, orange sides, golden lower flanks
    col = mix(col, K['redDk'], R['top'] * 0.4 * (1 - R['head'] * 0.5))
    col = mix(col, K['redLt'], sstep(0.25, -0.35, N[:, 1]) * 0.6)
    col = mix(col, K['gold'], sstep(-0.1, -0.5, N[:, 1]) * 0.45)
    col *= (0.93 + 0.14 * n1)[:, None]
    # grizzled hindquarters and the top of the brush
    griz = sstep(0.55, 0.75, fbm(Pm * 120, 2, 13))
    col = mix(col, K['smoke'], griz * sstep(-0.12, -0.2, z) * (1 - R['tail']) * 0.3)
    col = mix(col, K['redDk'], R['tail'] * sstep(-0.2, 0.7, N[:, 1]) * 0.35 * (1 - M['tip']))
    # face: orange forehead and muzzle top, a little paler around the eyes
    col = mix(col, K['redLt'], R['head'] * sstep(0.03, 0.012, R['eyeD']) * 0.4)
    col = mix(col, K['rust'], R['head'] * sstep(0.08, 0.12, L[:, 2]) * sstep(-0.006, 0.006, L[:, 1]) * 0.5)
    # white and pale areas
    wcol = mix(np.tile(K['white'], (len(P), 1)), K['cream'], n2 * 0.6)
    col = mix(col, K['gray'], M['belly'] * 0.75 + M['inner_leg'] * 0.5)
    col = mix(col, wcol, M['white'])
    col = mix(col, K['earIn'], M['ear_in'] * 0.92)
    col = mix(col, wcol, M['tip'])
    # black: stockings, ear backs and tips, nose, lips, eye rims, the tear mark, the gland spot
    blk = mix(np.tile(K['black'], (len(P), 1)), K['blackHi'], n2 * 0.8)
    col = mix(col, blk, M['stock'])
    col = mix(col, blk, np.maximum(M['ear_b'] * 0.92, M['ear_tip']))
    col = mix(col, K['smoke'] * 0.55, M['tear'] * 0.7 + M['gland'] * 0.75)
    col = mix(col, K['lip'], R['lip'])
    col = mix(col, K['black'] * 0.9, R['lid'])
    col = mix(col, K['nose'] * (0.85 + 0.3 * n2[:, None]), R['nose'])
    col = mix(col, K['pad'], R['pad'] * R['paw'])
    col = mix(col, K['claw'], R['claw'])
    # coat hairs: strokes a little lighter (tips) or darker (roots) than the coat around them
    s, tone = _strands(P, N, R)
    col *= (1 + s * 0.22 * (tone - 0.35) - 0.04 * (1 - s))[:, None]
    # black tipped guard hairs on the brush, most along its top
    gh = s * sstep(0.22, 0.12, tone) * R['tail'] * (1 - M['tip']) * (0.5 + 0.5 * sstep(-0.3, 0.6, N[:, 1]))
    col = mix(col, K['black'], gh * 0.75)
    col = mix(col, K['ball'], R['ball'])
    rough = 0.62 + 0.08 * (n2 - 0.5) - 0.3 * R['nose'] - 0.25 * R['lid'] - 0.15 * R['lip'] - 0.2 * R['claw']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    h = np.zeros(len(P), F)
    s, tone = _strands(P, N, R)
    h += 0.00007 * s * (1 - R['ball']) * (1 - R['nose'])
    # nose leather: fine cobbled bumps; paw pads: rough
    g1, _ = worley(Pm / 0.0007, 58)
    h -= 0.00004 * sstep(0.35, 0.1, g1) * R['nose']
    g2, _ = worley(Pm / 0.0012, 59)
    h += 0.00006 * sstep(0.1, 0.5, g2) * R['pad'] * R['paw']
    return h


def finish(C, ao, valid):
    return CV.finish(C, ao, valid, 0.5)


# ---------- coat: fur shells ----------
# len: longest fur (m); per point fur() gives the length; n layers at close range, lean = how far the tips comb over
# along the flow (times the length), tile = strand spacing (m); kits: longer, fluffier, more upright
FUR = {'len': 0.032, 'n': 5, 'lean': 1.1, 'tile': 0.0016, 'babyLen': 1.45, 'babyLean': 0.45, 'shade': 0.65, 'quality': 80}


def fur(P, N, c):
    """fur length (meters) and strand density per point"""
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y, z = Pm[:, 1], Pm[:, 2]
    ln = np.full(len(P), 0.019, F)
    ln = ln + 0.004 * sstep(-0.3, -0.8, N[:, 1]) * (1 - R['tail'])                 # belly
    ln = ln + 0.008 * sstep(0.12, 0.2, z) * sstep(0.36, 0.28, y)                    # ruff and bib
    ln = ln + 0.006 * sstep(-0.16, -0.2, z) * sstep(0.3, 0.2, y) * sstep(0.12, 0.17, y) * sstep(-0.3, 0.3, -N[:, 2])   # breeches
    leg = sstep(0.23, 0.15, y) * (1 - R['tail'])
    ln = ln * (1 - leg * 0.72)
    hd = R['head']
    ln = ln * (1 - hd) + hd * (0.006 + 0.012 * sstep(0.06, 0.03, L[:, 2]) * sstep(0.0, -0.02, L[:, 1]) - 0.003 * sstep(0.1, 0.13, L[:, 2]))
    er = R['ear']
    ln = ln * (1 - er) + er * (0.003 + 0.011 * R['earIn'] * sstep(0.004, 0.03, R['ea']) * sstep(0.07, 0.05, R['ea']))
    tl = R['tail']
    ln = ln * (1 - tl) + tl * (0.024 + 0.008 * sstep(0.05, 0.35, R['tt']) - 0.012 * sstep(0.85, 1.0, R['tt']))
    ln = ln * (1 - R['nose']) * (1 - R['lip']) * (1 - R['claw']) * (1 - R['pad'] * R['paw']) * sstep(EYE.r + 0.0015, EYE.r + 0.005, R['eyeD'])
    dens = np.ones(len(P), F) * (1 - 0.3 * hd * sstep(0.1, 0.14, L[:, 2]))
    return np.clip(ln, 0, FUR['len']).astype(F), dens


MAP_QUALITY = (72, 72)


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': CV.lid_color(col, R['eyeD'], EYE.r)}


def meta(st):
    p, r, d, lid = EYE.meta()
    return {
        'eye': {'p': p, 'r': r, 'dir': d, 'lid': lid, 'iris': 0xC98A2C, 'irisR': 0.9, 'pupil': 'v', 'pupilR': 0.5, 'rim': 0x2A1608,
                'lidCol': st['lidCol'], 'babyLidCol': 0x5A4A42, 'babyIris': 0x6F7C82},
        'collar': {'at': ['neck2', 'head', 0.0]},
        # belly contact point under the hips (the legs are too close to the middle for the export's own search)
        'belly': [0.0, 0.254, -0.14],
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.2, 0.12, 0.07], 'flat': 0xB4521E,
    }


# ---------- kits: grayer brown fuzz, a pale muzzle, only a hint of red (the baby color map) ----------
BABY_TEX = 512


def baby_paint(P, N, c, col):
    R = _regions(P, N, c)
    Pm = R['Pm']
    M = _markings(R, c, Pm, N)
    n2 = fbm(Pm * 40, 3, 12)
    kit = mix(np.tile(hexc(0x584A44), (len(P), 1)), hexc(0x766456), n2)
    keep = np.clip(M['tip'] + R['nose'] + R['ball'] + R['lid'] + R['lip'] + R['claw'] + R['pad'] * R['paw'], 0, 1)
    pale = np.clip(M['white'] * 0.45 + M['belly'] * 0.35, 0, 1)
    out = mix(col, kit, 0.9 * (1 - keep))
    out = mix(out, mix(np.tile(hexc(0x9A8A7B), (len(P), 1)), hexc(0xB2A495), n2), pale * (1 - keep))
    s, tone = _strands(P, N, R)
    out *= (1 + s * 0.18 * (tone - 0.35))[:, None]
    return np.clip(out, 0, 1).astype(F)


# ---------- hair cards: whiskers ----------
HAIR = {'size': (64, 128), 'cols': 2, 'base': (0.05, 0.04, 0.035), 'hi': (0.12, 0.1, 0.09), 'tip': (0.3, 0.27, 0.25), 'strands': 18,
        'root': 1.0, 'rough': 0.45, 'alpha': 0.35, 'seed': 5, 'quality': 80}


def cards():
    rows = []
    for i in range(6):
        t = i / 5
        s0 = 0.118 + 0.022 * t + 0.004 * (rnd(i, 1) - 0.5)
        u0 = -0.0085 - 0.0045 * ((i % 3) / 2) + 0.002 * (rnd(i, 2) - 0.5)
        root = HF.pt(s0, u0, 0.0118 - 0.004 * t)
        d = nrm(V(0.75, 0.05 * (rnd(i, 3) - 0.3), 0.0) + HF.a * (-0.15 + 0.5 * t) + HF.u * (0.1 - 0.25 * (i % 3) / 2))
        rows.append((root, d, 0.045 + 0.02 * rnd(i, 4), 0.0011, 0.12, i % 2))
    out = []
    for sg in (1, -1):
        m = V(sg, 1, 1)
        out += CV.whiskers([(root * m, d * m, ln, w, droop, col) for root, d, ln, w, droop, col in rows])
    # roots sit in the skin: put them on the surface, a little in
    roots = np.array([cd['pts'][0] for cd in out], F)
    g = CV.gradient(shape, roots)
    dd = shape(roots)
    for cd, gg, d0 in zip(out, g, dd):
        cd['pts'][0] = cd['pts'][0] - gg * (d0 + 0.0008)
    return out
