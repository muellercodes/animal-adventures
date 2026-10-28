# A brown mackerel tabby house cat, sculpted as a signed distance field around the game's cat skeleton
# (tools/blender/work/cat-rig.json). Units are meters in game rig space (x left, y up, z forward, ground at y = 0).
# Shape first (a supple body with a loose belly, slim legs on small round paws, a long tail of even thickness, a round
# head with wide cheeks and whisker pads, a short muzzle, big forward facing eyes and tall ears wide at the base), then
# the tabby coat: a warm ticked brown with black mackerel stripes, the M on the forehead, lines from the eyes over the
# cheeks, necklaces, barred legs, a ringed tail with a dark tip, a pale chin and belly, the brick red nose. Fur shells
# for the short dense coat, hair cards for the whiskers and the ear furnishings. Kittens get a rounder little body
# (baby offsets), a fluffier grayer coat with softer stripes, and blue eyes.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length
import carnivore as CV
from carnivore import local, local_n, mirror, groove, mix, hexc, rnd, wsum

ID = 'cat'
BOUNDS = (V(-0.075, 0.0, -0.46), V(0.075, 0.36, 0.29))
BAKE_DIST = (0.003, 0.009, 0.022)
DISSOLVE_DEGENERATE = True
TAIL_RINGS = 0

# ---------- landmarks (left side, +x) ----------
HF = CV.Frame(V(0.0, 0.292, 0.178), V(0.0, -0.074, 1.0), V(0.0, 1.0, 0.0))
EYE = CV.Eye(HF.pt(0.066, 0.0055, 0.0178), 0.0094, V(0.33, 0.07, 0.94), lid_w=0.0086, lid_h=0.0064, off=0.0004, slant=0.16,
             mound=(0.0016, 0.0014, 0.0006), sink=0.42)
NOSE_S = 0.096
MOUTH = HF.pt(0.086, -0.026)
EAR_B = V(0.0245, 0.305, 0.197)
EAR_A = nrm([0.38, 0.92, -0.04])
EAR_N = nrm([0.38, -0.08, 0.92])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
EAR_L, EAR_W = 0.046, 0.0205
XF, XH = 0.038, 0.041
PAW_F = V(XF, 0.0, 0.106)
PAW_H = V(XH, 0.0, -0.152)
PATCHES = [
    (EYE.c * V(0, 1, 1) + V(0.006, -0.014, -0.014), EYE.c * V(0, 1, 1) + V(0.032, 0.014, 0.016), 0.0003),   # eye and lids
    (HF.pt(0.07, 0.0) * V(0, 1, 1) + V(0.0, -0.045, -0.004), HF.pt(0.102, 0.0) * V(0, 1, 1) + V(0.024, 0.012, 0.004), 0.0003),  # muzzle
    (V(0.006, 0.296, 0.175), V(0.05, 0.356, 0.218), 0.0004),                                                   # ear
    (V(0.016, -0.001, 0.08), V(0.06, 0.02, 0.124), 0.0004),                                                    # front paw
    (V(0.018, -0.001, -0.18), V(0.064, 0.02, -0.13), 0.0004),                                                  # hind paw
]

# trunk: z, top, yw (height of widest), bottom, half width, exponents
TRUNK = [
    (-0.205, 0.222, 0.205, 0.188, 0.018, 2.0, 2.0),
    (-0.19, 0.234, 0.206, 0.172, 0.036, 2.1, 2.0),
    (-0.16, 0.243, 0.208, 0.163, 0.047, 2.2, 2.0),
    (-0.12, 0.248, 0.21, 0.17, 0.048, 2.3, 2.0),
    (-0.08, 0.25, 0.208, 0.163, 0.046, 2.3, 2.0),
    (-0.03, 0.248, 0.204, 0.141, 0.049, 2.3, 2.0),
    (0.02, 0.245, 0.2, 0.128, 0.052, 2.3, 2.0),
    (0.06, 0.243, 0.196, 0.122, 0.051, 2.3, 2.0),
    (0.1, 0.241, 0.195, 0.125, 0.045, 2.2, 2.0),
    (0.125, 0.233, 0.193, 0.138, 0.039, 2.1, 2.0),
    (0.14, 0.222, 0.192, 0.155, 0.029, 2.0, 2.0),
]
NECK = [
    (0.2, 0.09, 0.04, 0.046, 0.04, 2.0, 2.0),
    (0.222, 0.135, 0.032, 0.039, 0.034, 2.0, 2.0),
    (0.248, 0.163, 0.027, 0.031, 0.029, 2.0, 2.0),
    (0.274, 0.181, 0.024, 0.026, 0.026, 2.0, 2.0),
    (0.29, 0.188, 0.02, 0.022, 0.022, 2.0, 2.0),
]
# head: along the head frame (s), top, height of widest, bottom, half width, exponents above, below
HEAD = [
    (-0.006, 0.016, 0.0, -0.019, 0.02, 2.2, 2.0),
    (0.008, 0.026, -0.002, -0.027, 0.032, 2.5, 2.0),
    (0.024, 0.031, -0.004, -0.031, 0.0375, 2.6, 2.0),
    (0.04, 0.031, -0.007, -0.033, 0.0385, 2.6, 2.1),
    (0.054, 0.027, -0.009, -0.033, 0.036, 2.4, 2.2),
    (0.066, 0.02, -0.011, -0.032, 0.03, 2.2, 2.3),
    (0.077, 0.012, -0.012, -0.03, 0.023, 2.2, 2.3),
    (0.087, 0.006, -0.013, -0.027, 0.018, 2.2, 2.2),
    (0.094, 0.0, -0.013, -0.022, 0.012, 2.1, 2.1),
]
FORE = [
    (0.205, 0.118, 0.025, 0.028, 0.02, 2.0, 2.0, 0.03),
    (0.175, 0.112, 0.024, 0.027, 0.019, 2.0, 2.0, 0.034),
    (0.14, 0.092, 0.019, 0.024, 0.016, 2.1, 2.1, 0.037),
    (0.11, 0.074, 0.015, 0.018, 0.0138, 2.2, 2.2, 0.038),
    (0.08, 0.078, 0.0118, 0.0128, 0.0118, 2.2, 2.2, 0.038),
    (0.05, 0.084, 0.0098, 0.0098, 0.0102, 2.2, 2.2, 0.038),
    (0.032, 0.089, 0.0094, 0.0094, 0.0098, 2.2, 2.2, 0.038),
    (0.02, 0.094, 0.0088, 0.0088, 0.0094, 2.2, 2.2, 0.038),
    (0.012, 0.098, 0.009, 0.009, 0.0096, 2.2, 2.2, 0.038),
]
HIND = [
    (0.215, -0.14, 0.033, 0.038, 0.025, 2.0, 2.0, 0.03),
    (0.18, -0.13, 0.034, 0.04, 0.027, 2.0, 2.0, 0.036),
    (0.145, -0.108, 0.025, 0.033, 0.021, 2.1, 2.0, 0.04),
    (0.115, -0.089, 0.0165, 0.023, 0.0165, 2.2, 2.1, 0.041),
    (0.09, -0.125, 0.0125, 0.0185, 0.0135, 2.2, 2.2, 0.041),
    (0.065, -0.172, 0.0098, 0.0125, 0.0108, 2.2, 2.2, 0.041),
    (0.04, -0.168, 0.0092, 0.0092, 0.0098, 2.2, 2.2, 0.041),
    (0.02, -0.162, 0.0092, 0.0092, 0.0102, 2.2, 2.2, 0.041),
    (0.012, -0.157, 0.0095, 0.0095, 0.0105, 2.2, 2.2, 0.041),
]
# the tail: path (y, z), radius (even thickness down to a rounded tip)
TAIL = [(0.207, -0.185, 0.0135), (0.203, -0.205, 0.0124), (0.193, -0.245, 0.0116), (0.183, -0.28, 0.0112), (0.167, -0.32, 0.0107),
        (0.15, -0.36, 0.0102), (0.13, -0.395, 0.0097), (0.115, -0.425, 0.009), (0.106, -0.443, 0.0074), (0.102, -0.451, 0.004)]


def _tail_keys():
    return [(y, z, r, r, r, 2.0, 2.0) for y, z, r in TAIL]


def _tail_poly(n=80):
    from scipy.interpolate import PchipInterpolator
    K_ = np.array([(y, z) for y, z, _ in TAIL], np.float64)
    seg = np.linalg.norm(np.diff(K_, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    f = PchipInterpolator(s, K_, axis=0)
    ss = np.linspace(0, s[-1], n)
    yz = f(ss)
    return np.stack([np.zeros(n), yz[:, 0], yz[:, 1]], 1), ss / s[-1], s[-1]


_TP, _TT, TAIL_LEN = _tail_poly()
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
_TB = {'tail1': V(0, 0.205, -0.19), 'tail2': V(0, 0.185, -0.28), 'tail3': V(0, 0.15, -0.36)}
TB_T = [float(_TT[np.linalg.norm(_TP[:, 1:] - _TB[b][1:], axis=1).argmin()]) for b in TAIL_BONES]


def tail_weights(t):
    w = np.zeros((len(t), 3), F)
    edges = TB_T[1:]
    for i in range(3):
        lo = sstep(edges[i - 1] - 0.07, edges[i - 1] + 0.07, t) if i > 0 else np.ones_like(t)
        hi = 1 - sstep(edges[i] - 0.07, edges[i] + 0.07, t) if i < 2 else np.ones_like(t)
        w[:, i] = lo * hi
    return w / np.maximum(w.sum(1, keepdims=True), 1e-9)


def flat_cone(Q, a, b, r1, r2, kx):
    """a round cone flattened across x by kx (thigh and shoulder muscles are flat from side to side)"""
    S = Q.copy()
    S[:, 0] = a[0] + (Q[:, 0] - a[0]) / kx
    return round_cone(S, a, V(a[0], b[1], b[2]), r1, r2) * kx


# ---------- trunk, neck ----------
def trunk(P):
    Q = mirror(P)
    d = loft(Q, TRUNK)
    # shoulder blades, set high and close (they show over the back when the cat walks)
    d = smin(d, round_cone(Q, V(0.03, 0.18, 0.12), V(0.02, 0.236, 0.09), 0.016, 0.013), 0.02)
    # the breast between the front legs
    d = smin(d, ellipsoid(Q, V(0.0, 0.165, 0.128), V(0.025, 0.03, 0.02)), 0.02)
    # the loose belly flap (primordial pouch) hanging between the hind legs
    d = smin(d, ellipsoid(Q, V(0.0, 0.15, -0.075), V(0.028, 0.016, 0.05)), 0.03)
    # the flank fold from the belly to the stifle
    d = smin(d, flat_cone(Q, V(0.028, 0.168, -0.065), V(0.036, 0.135, -0.09), 0.01, 0.009, 0.9), 0.015)
    return d


def neck(P):
    Q = mirror(P)
    d = sweep(Q, NECK)
    d = smin(d, ellipsoid(Q, V(0.0, 0.2, 0.15), V(0.026, 0.026, 0.022)), 0.02)     # throat ruff
    return d


# ---------- head ----------
def head(P):
    Q = mirror(P)
    L = HF.loc(Q)
    d = loft(L, HEAD)
    # cheeks: full and round below and behind the eyes (the cat's wide face)
    d = smin(d, ellipsoid(L, V(0.026, -0.016, 0.042), V(0.016, 0.017, 0.022)), 0.012)
    # brow ridge over each eye, the gentle stop between them
    d = smin(d, round_cone(L, V(0.007, 0.016, 0.058), V(0.02, 0.0155, 0.06), 0.004, 0.0035), 0.006)
    # whisker pads: two round cushions either side of the nose, the chin under them
    d = smin(d, ellipsoid(L, V(0.0098, -0.016, 0.084), V(0.0108, 0.0095, 0.0105)), 0.005)
    d = smin(d, ellipsoid(L, V(0.0, -0.028, 0.08), V(0.0085, 0.0058, 0.0095)), 0.004)
    # nose leather: a small triangle pointing down, on top of the pads
    NL = L - V(0.0, -0.0048, NOSE_S - 0.0022)
    NL[:, 0] = NL[:, 0] / (1.0 + 85.0 * np.clip(NL[:, 1], -0.0042, 0.0042))
    d = smin(d, ellipsoid(NL, V(0.0, 0.0, 0.0), V(0.0048, 0.0036, 0.0028)), 0.0025)
    # mouth: the inverted Y: the philtrum down from the nose, the lip lines back under the pads
    M = L * V(1, 2.0, 1)
    m = round_cone(M, V(0.0, -0.011 * 2.0, NOSE_S + 0.001), V(0.0, -0.0225 * 2.0, NOSE_S - 0.004), 0.0004, 0.0004)
    m = smin(m, round_cone(M, V(0.0, -0.0225 * 2.0, NOSE_S - 0.004), V(0.012, -0.0255 * 2.0, 0.078), 0.0004, 0.0004), 0.0006)
    m = smin(m, round_cone(M, V(0.012, -0.0255 * 2.0, 0.078), V(0.018, -0.0245 * 2.0, 0.066), 0.0004, 0.0003), 0.0006)
    d = smax(d, -(m + 0.0002) / 2.0, 0.0005)
    # nostrils: small commas at the sides of the leather
    nc = V(0.0028, -0.0045, NOSE_S + 0.0025)
    d = smax(d, -ellipsoid(L, nc, V(0.0011, 0.0008, 0.0012)), 0.0005)
    return d


def eye_parts(P):
    return EYE.parts(mirror(P))


def ear(P):
    Q = mirror(P)
    return CV.ear(Q, EAR_B, EAR_A, EAR_N, EAR_L, EAR_W, 'point', th0=0.0032, th1=0.0011, cup=0.85, tipin=-0.0015,
                  base_r=(0.007, 0.005, 0.004))


# ---------- legs and paws ----------
def fleg(P):
    Q = mirror(P)
    x = XF
    d = sweep(Q, FORE, mirror_x=False)
    d = smin(d, flat_cone(Q, V(0.034, 0.19, 0.122), V(0.038, 0.115, 0.074), 0.021, 0.015, 0.8), 0.015)   # upper arm
    d = smin(d, ellipsoid(Q, V(x - 0.002, 0.106, 0.064), V(0.009, 0.01, 0.009)), 0.008)                 # point of elbow
    d = smin(d, ellipsoid(Q, V(x + 0.001, 0.078, 0.082), V(0.011, 0.028, 0.012)), 0.008)                # forearm muscles
    return d


def hleg(P):
    Q = mirror(P)
    x = XH
    d = sweep(Q, HIND, mirror_x=False)
    d = smin(d, flat_cone(Q, V(0.034, 0.212, -0.145), V(0.04, 0.12, -0.094), 0.046, 0.019, 0.62), 0.025)     # thigh
    d = smin(d, flat_cone(Q, V(0.032, 0.205, -0.18), V(0.039, 0.1, -0.15), 0.025, 0.013, 0.7), 0.02)         # hamstrings
    d = smin(d, ellipsoid(Q, V(x, 0.092, -0.13), V(0.011, 0.024, 0.013)), 0.01)                               # gaskin
    d = smin(d, ellipsoid(Q, V(x, 0.065, -0.178), V(0.0072, 0.009, 0.0075)), 0.005)                           # point of hock
    return d


F_TOES = [(0.0047, 0.0068, 0.0054, 0.0062, 0.0), (-0.0047, 0.0068, 0.0054, 0.0062, 0.0), (0.0112, 0.0006, 0.005, 0.0056, 0.0004),
          (-0.0112, 0.0006, 0.005, 0.0056, 0.0004)]
H_TOES = [(0.0044, 0.0064, 0.0051, 0.006, 0.0), (-0.0044, 0.0064, 0.0051, 0.006, 0.0), (0.0104, 0.0005, 0.0047, 0.0054, 0.0004),
          (-0.0104, 0.0005, 0.0047, 0.0054, 0.0004)]


def paws(P):
    """small round paws, the claws drawn in (none show)"""
    Q = mirror(P)
    a, _ = CV.paw(Q, PAW_F, F_TOES, pad=(0.0108, 0.0085, 0.0105), claw=None, yaw=0.06)
    b, _ = CV.paw(Q, PAW_H, H_TOES, pad=(0.0102, 0.0082, 0.0104), claw=None, yaw=0.04)
    # the front dewclaw on the inside of the wrist
    dw = round_cone(Q, V(XF - 0.007, 0.022, 0.09), V(XF - 0.009, 0.016, 0.095), 0.0026, 0.0018)
    return np.minimum(smin(a, dw, 0.003), b), np.full(len(P), 1.0, F)


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
    d = smin(d, local(P, (-0.075, 0.12, 0.0), (0.075, 0.34, 0.25), neck), 0.03)
    h = local(P, (-0.065, 0.23, 0.15), (0.065, 0.345, 0.29), head)
    ca, li, ba = local_n(P, (-0.04, 0.275, 0.215), (0.04, 0.32, 0.27), eye_parts, 3)
    h = smin(h, li, 0.003)
    h = smax(h, -ca, 0.001)
    h = smin(h, ba, 0.0006)
    d = smin(d, h, 0.014)
    d = smin(d, local(P, (-0.065, 0.285, 0.165), (0.065, 0.36, 0.225), ear), 0.004)
    fl = local(P, (-0.075, -0.005, 0.03), (0.075, 0.26, 0.16), fleg)
    d = smin(d, fl, 0.018)
    hl = local(P, (-0.075, -0.005, -0.23), (0.075, 0.27, -0.04), hleg)
    d = smin(d, hl, 0.02)
    pw, cl = local_n(P, (-0.065, -0.005, -0.19), (0.065, 0.03, 0.13), paws, 2)
    d = smin(d, pw, 0.005)
    d = smin(d, local(P, (-0.03, 0.06, -0.46), (0.03, 0.235, -0.16), tail), 0.012)
    return d


PREVIEW = {
    'side': ((1.5, 0.2, -0.08), (0, 0.17, -0.08), 30),
    'front3q': ((0.85, 0.42, 0.9), (0, 0.17, -0.03), 30),
    'front': ((0.0, 0.25, 1.2), (0, 0.2, 0.0), 26),
    'rear3q': ((-0.75, 0.5, -0.95), (0, 0.17, -0.1), 30),
    'top': ((0.01, 1.5, -0.08), (0, 0.17, -0.08), 30),
    'face': ((0.12, 0.31, 0.62), (0, 0.29, 0.22), 24),
    'headside': ((0.5, 0.3, 0.22), (0, 0.29, 0.22), 20),
    'faceside': ((0.42, 0.29, 0.23), (0.0, 0.29, 0.22), 24),
    'headfront': ((0.0, 0.3, 0.75), (0, 0.29, 0.22), 18),
    'head3q': ((0.28, 0.33, 0.55), (0, 0.29, 0.22), 20),
    'headtop': ((0.02, 0.7, 0.22), (0, 0.29, 0.22), 22),
    'feet': ((0.28, 0.06, 0.28), (0.03, 0.02, 0.0), 30),
    'eye': ((0.1, 0.3, 0.33), (0.018, 0.298, 0.244), 12),
}


# ---------- game mesh ----------
KEEP = (0.44, 0.82, 0.6, 0.72, 0.6, 0.56, 0.4)


def keep(P):
    Pm = mirror(P)
    tl = sstep(-0.185, -0.205, Pm[:, 2])
    base = KEEP[0] + (KEEP[6] - KEEP[0]) * tl
    e = sstep(0.026, 0.013, np.linalg.norm(Pm - EYE.c, axis=1)) * KEEP[1]
    L = HF.loc(Pm)
    hd = sstep(-0.006, 0.01, L[:, 2]) * sstep(0.24, 0.26, Pm[:, 1]) * KEEP[2]
    m = sstep(0.07, 0.085, L[:, 2]) * sstep(-0.045, -0.035, L[:, 1]) * KEEP[3]
    a, c, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    er = sstep(-0.004, 0.0, a) * sstep(0.03, 0.022, np.abs(c)) * sstep(0.008, 0.004, np.abs(n)) * KEEP[4]
    pw = sstep(0.022, 0.012, Pm[:, 1]) * KEEP[5]
    return np.maximum.reduce([base, e, hd, m, er, pw]).astype(F)


def lowpoly_fix(bm, hi):
    """rings across the supple body and the neck and along the tail, so the cat arches, sits, climbs, curls up into a
    ball and carries its tail up in a smooth curve"""
    import meshfix as MX
    tr = MX.tree(hi)
    MX.rings(bm, tr, (0.0, 0.2, 0.12), (0.0, 0.205, -0.19), 0.022, lambda c, p0, r: c.y > 0.12 and r < 0.075)
    pts = [V(0, k[0], k[1]) for k in NECK]
    for a, b in zip(pts[:-2], pts[1:-1]):
        MX.rings(bm, tr, a, b, 0.022, lambda c, p0, r: r < 0.05 and c.z > 0.08 and c.y > 0.17)
    pts = [V(0, y, z) for y, z, _ in TAIL]
    for a, b in zip(pts[:-1], pts[1:]):
        MX.rings(bm, tr, a, b, 0.016, lambda c, p0, r: r < 0.02 and c.z < -0.19)
    MX.finish(bm, 5e-9)


UV_AVERAGE = True
UV_PACK = dict(margin_method='FRACTION', margin=0.01)


def uv_regions(P):
    Pm = mirror(P)
    L = HF.loc(Pm)
    y, z = Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 2)
    a, c, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    head = (L[:, 2] > -0.006) & (y > 0.24)
    neck = ~head & (z > 0.12) & (y > 0.17)
    fleg = (z > 0.03) & (y < 0.15) & ~neck
    hleg = (z <= 0.03) & (y < 0.17) & (z > -0.19)
    tl = (z < -0.19)
    lab[neck] = 1
    lab[head] = 0
    lab[head & (a > 0.003) & (np.abs(c) < 0.03)] = 8
    lab[fleg] = 3
    lab[fleg & (y < 0.06)] = 4
    lab[hleg] = 5
    lab[hleg & (y < 0.07)] = 6
    lab[tl] = 7
    return lab


def uv_weight(P):
    Pm = mirror(P)
    L = HF.loc(Pm)
    head = sstep(-0.006, 0.01, L[:, 2]) * sstep(0.24, 0.26, Pm[:, 1])
    paw = sstep(0.025, 0.012, Pm[:, 1])
    under = sstep(0.16, 0.14, Pm[:, 1]) * sstep(0.02, 0.012, Pm[:, 0]) * sstep(0.13, 0.1, Pm[:, 1])
    return (0.92 + 0.9 * head + 0.2 * paw - 0.25 * under).astype(F)


WEIGHT_SMOOTH = (6, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'rump': P['hips'], 'chest': P['neck'], 'neck': P['neck2'], 'neck2': P['head'], 'head': HF.pt(0.095, 0.0),
         'tail1': P['tail2'], 'tail2': P['tail3'], 'tail3': V(0, 0.102, -0.451)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (PAW_H + V(0, 0.004, 0.012)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (PAW_F + V(0, 0.004, 0.012)) * m
        t['ear' + s] = (EAR_B + EAR_A * EAR_L) * m
    return t


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    W[:, bi['ctag']] = 0
    x = wpos[:, 0]
    Pm = mirror(wpos)
    y, z = Pm[:, 1], Pm[:, 2]
    for b in names:
        if b.endswith('L') and b[:-1] + 'R' in bi:
            r = bi[b[:-1] + 'R']; l = bi[b]
            pos = x > 0.004
            W[pos, l] += W[pos, r]; W[pos, r] = 0
            neg = x < -0.004
            W[neg, r] += W[neg, l]; W[neg, l] = 0
    # the tail: by position along its middle line, blending into the rump at its root
    tt, td = tail_t(Pm)
    on = (z < -0.18) & (td < 0.025) & (y > 0.07)
    if on.any():
        tw = tail_weights(tt[on])
        k = sstep(-0.18, -0.2, z[on])[:, None]
        rows = np.zeros((on.sum(), W.shape[1]), F)
        for i, b in enumerate(TAIL_BONES):
            rows[:, bi[b]] = tw[:, i]
        W[on] = W[on] * (1 - k) + rows * k
    # ears ride on the ear bones, blending into the head at the base
    a, c, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    on = (ear(wpos) < 0.0012) & (a > -0.002)
    k = sstep(-0.002, 0.008, a)
    for s, sg in (('L', 1), ('R', -1)):
        CV.set_part(W, bi, on & (x * sg > 0), 'ear' + s, k)
    for s, sg in (('L', 1), ('R', -1)):
        for c0, b in ((PAW_F, 'fpaw'), (PAW_H, 'hpaw')):
            near = (np.abs(x - sg * c0[0]) < 0.02) & (z > c0[2] - 0.012) & (z < c0[2] + 0.024) & (y < 0.02)
            CV.set_part(W, bi, near, b + s, sstep(0.018, 0.009, y))
    s = W.sum(1, keepdims=True)
    return W / np.maximum(s, 1e-9)


# ---------- coat ----------
_NY = np.array([k[0] for k in NECK], F)
_NZ = np.array([k[1] for k in NECK], F)


def tail_dir(P):
    tt, _ = tail_t(P)
    k = np.clip((tt * (len(_TP) - 1)).astype(int), 0, len(_TP) - 2)
    t = _TP[k + 1] - _TP[k]
    return (t / np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-9)).astype(F)


def flow(P, N=None):
    """from the nose back over the head, back along the body and down its sides, down the legs, along the tail"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    one = np.ones_like(y)
    body = np.stack([0.25 * sstep(0.01, 0.035, x), -(0.12 + 0.8 * sstep(0.2, 0.15, y)), -one], 1)
    neckd = np.stack([0.2 * one, -1.0 * one, -0.6 * one], 1)
    legd = np.stack([0 * y, -one, -0.1 * one], 1)
    L = HF.loc(Q)
    cheek = sstep(0.0, -0.015, L[:, 1]) * sstep(0.07, 0.05, L[:, 2])
    headd = -HF.a[None, :] + np.stack([0.35 * sstep(0.004, 0.02, x) + 0.6 * cheek, -0.3 * cheek, 0 * y], 1)
    taild = tail_dir(Q)
    wh = sstep(-0.006, 0.012, L[:, 2]) * sstep(0.245, 0.265, y)
    wt = sstep(-0.185, -0.2, z)
    wn = sstep(0.11, 0.15, z) * sstep(0.17, 0.2, y) * (1 - wh)
    wl = sstep(0.16, 0.12, y) * (1 - wh - wn) * (1 - wt)
    wb = np.clip(1 - wh - wn - wl - wt, 0, 1)
    f = body * wb[:, None] + headd * wh[:, None] + neckd * wn[:, None] + legd * wl[:, None] + taild * wt[:, None]
    a, c, n = CV.ear_coords(Q, EAR_B, EAR_A, EAR_N)
    we = sstep(-0.002, 0.006, a) * sstep(0.03, 0.02, np.abs(c)) * sstep(0.008, 0.004, np.abs(n))
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
    r['ball'] = sstep(0.0005, 0.0001, c['ball']) * sstep(EYE.r + 0.002, EYE.r + 0.0005, de)
    El = EYE.loc(Pm)
    ua = El[:, 1] - EYE.off - EYE.slant * El[:, 0]
    ring = np.sqrt((El[:, 0] / (EYE.lid_w + 0.0018)) ** 2 + (ua / (EYE.lid_h + 0.0016)) ** 2)
    r['ring'] = ring
    r['lid'] = sstep(1.15, 0.9, ring) * (1 - r['ball']) * sstep(EYE.r + 0.006, EYE.r + 0.003, de)
    r['head'] = sstep(-0.006, 0.006, L[:, 2]) * sstep(0.002, 0.0, c['head'])
    NL = L - V(0.0, -0.0048, NOSE_S - 0.0022)
    NL[:, 0] = NL[:, 0] / (1.0 + 85.0 * np.clip(NL[:, 1], -0.0042, 0.0042))
    r['nose'] = sstep(0.0006, -0.0002, ellipsoid(NL, V(0.0, 0.0, 0.0), V(0.0052, 0.004, 0.0034))) * sstep(NOSE_S - 0.006, NOSE_S - 0.003, L[:, 2])
    lipu = -0.0255 + 0.001 * sstep(0.07, 0.085, L[:, 2])
    r['lip'] = sstep(0.0011, 0.0004, np.abs(L[:, 1] - lipu)) * sstep(0.068, 0.074, L[:, 2]) * r['head']
    r['phil'] = sstep(0.0008, 0.0003, np.abs(L[:, 0])) * sstep(-0.009, -0.011, L[:, 1]) * sstep(-0.024, -0.021, L[:, 1]) * sstep(0.085, 0.09, L[:, 2]) * r['head']
    a, cc, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    r['ea'], r['ec'], r['en'] = a, cc, n
    r['ear'] = sstep(0.0012, 0.0003, c['ear']) * sstep(-0.002, 0.004, a)
    r['earIn'] = sstep(-0.15, 0.35, Nm @ EAR_N) * sstep(0.003, -0.002, np.abs(cc) - EAR_W * 0.82 * (1 - a / EAR_L))
    r['paw'] = sstep(0.0015, 0.0, c['paw']) * sstep(0.02, 0.012, y)
    r['pad'] = sstep(-0.2, -0.75, N[:, 1]) * sstep(0.003, 0.001, y)
    r['claw'] = np.zeros(len(P), F)
    tt, td = tail_t(Pm)
    r['tt'] = tt
    r['tail'] = sstep(0.003, 0.0, c['tail']) * sstep(-0.18, -0.195, z)
    r['top'] = sstep(0.3, 0.85, N[:, 1])
    return r


K = {
    'ground': hexc(0x8E6C46), 'warm': hexc(0xA67E50), 'ticked': hexc(0x624830), 'stripe': hexc(0x2C2016), 'stripeHi': hexc(0x4A3826),
    'buff': hexc(0xD4BC90), 'white': hexc(0xEEE6D4), 'nose': hexc(0xB46A5E), 'noseRim': hexc(0x2E1E18), 'earIn': hexc(0xD8AE9E),
    'pad': hexc(0x3A2826), 'ball': hexc(0x0C0806), 'lid': hexc(0x1A120C), 'eyePale': hexc(0xE2D2B4),
}


def _lenk(Pm):
    L = HF.loc(Pm)
    hd = sstep(-0.006, 0.012, L[:, 2]) * sstep(0.245, 0.265, Pm[:, 1])
    lg = sstep(0.1, 0.05, Pm[:, 1]) * (1 - sstep(-0.185, -0.2, Pm[:, 2]))
    return np.clip(1.0 - 0.5 * hd - 0.4 * lg, 0.4, 1.4)


_scache = {}


def _strands(P, N, R):
    key = (len(P), float(P[:7].sum()))
    if key not in _scache:
        dens = 0.92 * (1 - R['nose']) * (1 - R['ball']) * (1 - R['pad'] * R['paw']) * (1 - 0.7 * R['lip']) * sstep(EYE.r + 0.0015, EYE.r + 0.004, R['eyeD'])
        _scache[key] = CV.strands(P, N, dens, flow, 0.0024, 0.0032, 0.0058, 0.00042, seed=93, lenk=lambda Q: _lenk(mirror(Q)))
    return _scache[key]


def _bars(f, w, wob):
    """thin dark bars at each whole number of f (width w, a share of the spacing), wobbling by wob"""
    g = f + wob
    a = np.abs(g - np.round(g))
    return sstep(w, w * 0.45, a)


def _tabby(R, Pm, N):
    """the brown mackerel tabby pattern as masks: stripes (black), pale (chin, throat, belly, inner legs)"""
    L = R['L']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    s, u = L[:, 2], L[:, 1]
    w1 = fbm(Pm * 150, 2, 51) - 0.5
    w2 = fbm(Pm * 40, 2, 52) - 0.5
    hd = R['head']
    tl = R['tail']
    trunk = (1 - hd) * (1 - tl)
    # height on the side of the body (1 along the spine, 0 at the widest line, -1 under the belly), from the normal
    up = np.clip(N[:, 1], -1, 1)
    # mackerel: narrow bars down the sides, about 15 mm apart, leaning back as they go down, broken here and there
    bodyz = (z + 0.035 * (1 - up)) / 0.0155
    mack = _bars(bodyz, 0.15 + 0.05 * w2, 0.35 * w1 + 0.2 * w2) * sstep(-0.55, -0.15, up) * sstep(0.95, 0.75, up) * 0.9
    mack = mack * sstep(0.35, 0.6, fbm(Pm * 70, 2, 53) + 0.25) * sstep(-0.205, -0.18, z) * sstep(0.115, 0.09, z) * trunk
    mack = np.clip(mack, 0, 1)
    # the dark band along the spine (three lines run together), on to the tail
    spine = sstep(0.012 + 0.003 * w2, 0.006, x) * sstep(0.6, 0.85, up) * sstep(-0.21, -0.17, z) * sstep(0.13, 0.1, z) * trunk
    # neck: lines running back from the head down the nape
    nape = _bars(x / 0.0095, 0.17, 0.2 * w1) * sstep(0.45, 0.8, up) * sstep(0.1, 0.13, z) * (1 - hd) * sstep(0.022, 0.014, x)
    # necklaces: two or three bands across the chest
    neckl = _bars((y + 0.6 * (z - 0.13)) / 0.025 + 0.3, 0.14, 0.3 * w1) * sstep(0.08, 0.12, z) * sstep(-0.1, -0.5, N[:, 1] - 0.6 * N[:, 2]) * (1 - hd) * sstep(0.12, 0.15, y)
    # legs: bars across, closer together lower down; dark backs of the hind feet up to the hock
    legs = sstep(0.16, 0.13, y) * sstep(0.014, 0.022, y) * (1 - tl)
    legbars = _bars(y / (0.014 + 0.007 * sstep(0.03, 0.12, y)), 0.17, 0.25 * w1) * legs * (0.55 + 0.45 * sstep(0.0, -0.5, -R['Nm'][:, 0]))
    hock = sstep(0.065, 0.045, y) * sstep(-0.1, -0.6, N[:, 2]) * sstep(0.0, -0.06, z) * sstep(0.004, 0.01, y)
    # belly spots in rows
    sp, _ = worley(Pm / 0.011, 54)
    belly_sp = sstep(0.42, 0.3, sp) * sstep(-0.35, -0.7, up) * trunk * sstep(0.14, 0.11, y)
    # tail: rings closer toward the tip, the last 3 cm dark
    tt = R['tt']
    rings = _bars(tt * TAIL_LEN / (0.024 - 0.006 * tt) + 0.4, 0.2, 0.15 * w1) * tl * sstep(0.08, 0.2, tt)
    tip = tl * sstep(0.89 + 0.02 * w2, 0.93, tt)
    tail_top = tl * sstep(0.3, 0.8, N[:, 1]) * 0.35
    # head: the M on the forehead (four lines up from the brows), the crown lines back to the neck, a line back from the
    # outer corner of each eye and one across the cheek, the dark lid rims
    mx = _bars(x / 0.0058 + 0.5, 0.2, 0.15 * w1) * sstep(0.04, 0.052, s) * sstep(0.075, 0.064, s) * sstep(0.012, 0.018, u) * hd
    crown = _bars(x / 0.0068 + 0.5, 0.18, 0.15 * w1) * sstep(0.042, 0.03, s) * sstep(0.015, 0.024, u) * hd
    El = (Pm - EYE.c)
    cheek1 = sstep(0.0022, 0.0009, np.abs(u - 0.0045 + 0.42 * (s - 0.058))) * sstep(0.058, 0.05, s) * sstep(0.022, 0.03, s) * sstep(0.02, 0.026, x) * hd
    cheek2 = sstep(0.0022, 0.0009, np.abs(u + 0.012 + 0.5 * (s - 0.05))) * sstep(0.055, 0.045, s) * sstep(0.018, 0.028, s) * sstep(0.022, 0.03, x) * hd
    stripes = np.clip(np.maximum.reduce([mack, spine, nape * 0.9, neckl * 0.8, legbars * 0.85, hock, belly_sp * 0.75, rings * 0.95, tip, tail_top,
                                         mx * 0.95, crown * 0.85, cheek1 * 0.9, cheek2 * 0.8]), 0, 1)
    # pale: chin and upper lip, the whisker pads, the throat, belly and inner legs; pale rims round the eyes
    chin = sstep(-0.018, -0.024, u) * sstep(0.06, 0.07, s) * hd
    pads = sstep(0.018, 0.012, np.linalg.norm((L - V(0.0098, -0.016, 0.084)) * V(1, 1, 0.8), axis=1)) * hd
    throat = sstep(-0.2, -0.6, N[:, 1] - 0.4 * N[:, 2]) * sstep(0.12, 0.15, z) * (1 - hd)
    belly = sstep(-0.5, -0.85, up) * trunk * sstep(0.17, 0.13, y)
    inner = sstep(0.0, -0.5, R['Nm'][:, 0]) * sstep(0.16, 0.1, y) * sstep(0.02, 0.04, y) * (1 - tl)
    eyering = sstep(1.7, 1.3, R['ring']) * sstep(1.0, 1.15, R['ring']) * hd
    pale = np.clip(np.maximum.reduce([chin, pads * 0.85, throat * 0.6, belly * 0.7, inner * 0.6, eyering * 0.75]), 0, 1)
    return dict(stripes=stripes, pale=pale, chin=chin, pads=pads, eyering=eyering)


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y, z = Pm[:, 1], Pm[:, 2]
    M = _tabby(R, Pm, N)
    n1 = fbm(Pm * 25, 3, 11)
    n2 = fbm(Pm * 140, 3, 12)
    # ground: warm buff, the ticking (dark tipped hairs) heavier along the back
    col = np.tile(K['ground'], (len(P), 1))
    col = mix(col, K['warm'], sstep(0.0, -0.6, N[:, 1]) * 0.5)
    col = mix(col, K['ticked'], R['top'] * 0.45 * (1 - R['head'] * 0.6))
    col *= (0.92 + 0.16 * n1)[:, None]
    # face: warmer, rufous around the nose and over the brows
    col = mix(col, K['warm'], R['head'] * sstep(0.07, 0.085, L[:, 2]) * 0.45)
    pal = mix(np.tile(K['buff'], (len(P), 1)), K['white'], np.clip(M['chin'] + M['pads'] * 0.7 + M['eyering'] * 0.5, 0, 1))
    col = mix(col, pal, M['pale'])
    # stripes: black with a brown edge
    st = M['stripes']
    col = mix(col, K['stripeHi'], sstep(0.05, 0.55, st) * 0.75)
    col = mix(col, K['stripe'] * (0.85 + 0.3 * n2[:, None]), sstep(0.45, 0.95, st) * 0.85)
    # ears: the outsides ticked brown, the insides pink skin with pale fur at the edges
    col = mix(col, K['ticked'], R['ear'] * (1 - R['earIn']) * 0.6)
    col = mix(col, K['earIn'], R['ear'] * R['earIn'] * 0.85)
    # bare parts
    nose = mix(np.tile(K['nose'], (len(P), 1)), K['noseRim'], sstep(0.4, 0.8, n2) * 0.15)
    col = mix(col, nose, R['nose'])
    col = mix(col, K['noseRim'], R['phil'] * 0.45 + R['lip'] * 0.35)
    col = mix(col, K['lid'], R['lid'])
    col = mix(col, K['pad'], R['pad'] * R['paw'])
    # coat hairs: fine strokes, the ticking
    s, tone = _strands(P, N, R)
    col *= (1 + s * 0.24 * (tone - 0.4) - 0.05 * (1 - s))[:, None]
    tick = s * sstep(0.18, 0.08, tone) * (1 - M['pale']) * (1 - st) * (1 - R['ear'] * R['earIn'])
    col = mix(col, K['stripe'], tick * 0.12)
    col = mix(col, K['ball'], R['ball'])
    rough = 0.64 + 0.08 * (n2 - 0.5) - 0.25 * R['nose'] - 0.3 * R['lid'] - 0.15 * R['lip']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    h = np.zeros(len(P), F)
    s, tone = _strands(P, N, R)
    h += 0.00004 * s * (1 - R['ball']) * (1 - R['nose'])
    g1, _ = worley(Pm / 0.0004, 58)
    h -= 0.00002 * sstep(0.35, 0.1, g1) * R['nose']
    return h


def finish(C, ao, valid):
    return CV.finish(C, ao, valid, 0.45)


FUR = {'len': 0.02, 'n': 4, 'lean': 1.5, 'tile': 0.0011, 'babyLen': 1.6, 'babyLean': 0.55, 'shade': 0.66, 'quality': 80}


def fur(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y, z = Pm[:, 1], Pm[:, 2]
    ln = np.full(len(P), 0.012, F)
    ln = ln + 0.005 * sstep(-0.3, -0.8, N[:, 1]) * (1 - R['tail'])                     # belly
    ln = ln + 0.004 * sstep(0.1, 0.14, z) * sstep(0.22, 0.17, y)                         # ruff and chest
    ln = ln + 0.003 * sstep(-0.12, -0.16, z) * sstep(0.0, -0.6, N[:, 2]) * sstep(0.08, 0.14, y)   # breeches
    leg = sstep(0.14, 0.09, y) * (1 - R['tail'])
    ln = ln * (1 - leg * 0.5)
    hd = R['head']
    ln = ln * (1 - hd) + hd * (0.005 + 0.004 * sstep(0.03, 0.01, L[:, 2]) * sstep(0.0, -0.015, L[:, 1]) - 0.002 * sstep(0.07, 0.085, L[:, 2]))
    er = R['ear']
    ln = ln * (1 - er) + er * (0.0012 + 0.0045 * R['earIn'] * sstep(0.0, 0.01, R['ea']) * sstep(0.035, 0.015, R['ea']))
    tl = R['tail']
    ln = ln * (1 - tl) + tl * (0.012 + 0.002 * sstep(0.2, 0.8, R['tt']))
    ln = ln * (1 - R['paw'] * 0.6)
    ln = ln * (1 - R['nose']) * (1 - R['lip']) * (1 - R['phil']) * (1 - R['pad'] * R['paw']) * sstep(1.25, 1.6, R['ring'])
    return np.clip(ln, 0, FUR['len']).astype(F), np.ones(len(P), F)


MAP_QUALITY = (74, 72)
PAD_SMOOTH = 4


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': CV.lid_color(col, R['eyeD'], EYE.r)}


def meta(st):
    p, r, d, lid = EYE.meta()
    return {
        # green-gold eyes, the pupil a narrow vertical slit in daylight; kittens' eyes are blue
        'eye': {'p': p, 'r': r, 'dir': d, 'lid': [1.0, -0.9, 0.18], 'iris': 0xA8A23A, 'irisR': 0.97, 'pupil': 'v', 'pupilR': 0.42, 'rim': 0x4A4410,
                'lidCol': st['lidCol'], 'babyLidCol': 0x9A8A76, 'babyIris': 0x6E8EAE},
        'collar': {'at': ['neck', 'neck2', 0.75], 'lift': 0.5},
        'belly': [0.0, 0.142, -0.07],
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.2, 0.14, 0.08], 'flat': 0x8C7458,
    }


# ---------- kittens: a rounder little body, a fluffier grayer coat with softer stripes ----------
BABY_TEX = 384
KITTEN = dict(c=V(0.0, 0.196, -0.035), r=(0.052, 0.05, 0.175), rb=0.072, e=2.1, maxd=0.02)


def _egg_walk(Q, Nm):
    g = KITTEN
    egg = lambda X: superellipsoid(X, g['c'], g['r'], g['e'], rb=g['rb'])
    X = Q.copy()
    for _ in range(12):
        X = X - Nm * np.clip(egg(X), -0.004, 0.004)[:, None]
    d = X - Q
    ln = np.linalg.norm(d, axis=1, keepdims=True)
    return d * np.minimum(1, g['maxd'] / np.maximum(ln, 1e-9))


def baby_offset(P, N, c):
    """the slim body rounds off into a kitten's pot belly (the game adds the big head and ears, the short muzzle and
    the short legs)"""
    Q = mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
    d = _egg_walk(Q, Nm)
    legd = np.minimum(c['fleg'], c['hleg'])
    w = sstep(0.02, -0.004, c['trunk'] - legd)
    w = w * sstep(-0.006, 0.024, np.minimum(c['head'], c['neck']) - c['trunk']) * sstep(0.14, 0.08, Q[:, 2]) * sstep(-0.225, -0.175, Q[:, 2])
    w = w * (1 - sstep(0.012, -0.002, c['tail']))
    d = d * w[:, None]
    d[:, 0] *= np.sign(P[:, 0] + 1e-9)
    return d.astype(F)


def baby_paint(P, N, c, col):
    R = _regions(P, N, c)
    Pm = R['Pm']
    M = _tabby(R, Pm, N)
    n2 = fbm(Pm * 140, 3, 12)
    kit = mix(np.tile(hexc(0x8C7C68), (len(P), 1)), hexc(0xA49480), n2)
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['lip'] + R['phil'] + R['pad'] * R['paw'] + R['ear'] * R['earIn'], 0, 1)
    out = mix(col, kit, 0.45 * (1 - keep) * (1 - M['stripes'] * 0.6) * (1 - M['pale']))
    out = mix(out, hexc(0x3A3028), M['stripes'] * 0.25 * (1 - keep))
    return np.clip(out, 0, 1).astype(F)


# ---------- hair cards: whiskers, eyebrow whiskers, ear furnishings ----------
def hair_texture():
    import smallfur as SF
    wh = [(0.0, (0.86, 0.82, 0.74)), (1.0, (0.97, 0.95, 0.9))]
    whd = [(0.0, (0.25, 0.2, 0.16)), (0.25, (0.8, 0.76, 0.68)), (1.0, (0.96, 0.94, 0.9))]
    furn = [(0.0, (0.86, 0.8, 0.7)), (1.0, (0.95, 0.92, 0.86))]
    cols = [dict(kind='hair', stops=wh, n=12, wid=1.8, end=(0.95, 1.0), wave=0.02, root=1.0),
            dict(kind='hair', stops=whd, n=12, wid=1.8, end=(0.95, 1.0), wave=0.02, root=1.0),
            dict(kind='hair', stops=furn, n=40, wid=1.2, end=(0.5, 1.0), wave=0.1, root=0.05)]
    return SF.strand_texture((96, 128), cols, seed=29)


HAIR = {'size': (96, 128), 'cols': 3, 'base': (0.86, 0.82, 0.74), 'hi': (0.95, 0.92, 0.86), 'tip': (0.97, 0.95, 0.9), 'strands': 20,
        'root': 1.0, 'rough': 0.45, 'alpha': 0.35, 'seed': 29, 'quality': 80}


def cards():
    out = []
    # whiskers: four rows on each whisker pad, long, white, curving forward and down a little
    rows = []
    for i in range(10):
        r_, k_ = i // 3, i % 3
        if r_ > 3:
            break
        s0 = 0.076 + 0.006 * k_ + 0.0015 * (rnd(i, 1) - 0.5)
        u0 = -0.0125 - 0.003 * r_ + 0.0008 * (rnd(i, 2) - 0.5)
        root = HF.pt(s0, u0, 0.0135 + 0.0015 * k_)
        d = nrm(V(0.85, 0.0, 0.0) + HF.a * (0.15 - 0.25 * k_ / 2) + HF.u * (0.12 - 0.12 * r_) + V(0, 0.05 * (rnd(i, 3) - 0.5), 0))
        rows.append((root, d, 0.055 + 0.015 * rnd(i, 4) - 0.006 * r_, 0.0009, 0.12, i % 2))
    wk = []
    for sg in (1, -1):
        m = V(sg, 1, 1)
        wk += CV.whiskers([(root * m, d * m, ln, w, droop, col) for root, d, ln, w, droop, col in rows], baby=0.6)
        # eyebrow whiskers: two above each eye, sweeping up and out
        for j in range(2):
            root = EYE.c + V(0.002 + 0.004 * j, 0.0105, -0.004 - 0.002 * j)
            d = nrm(V(0.55, 0.75, 0.25 - 0.2 * j))
            wk += CV.whiskers([(root * m, d * m, 0.03 + 0.006 * j, 0.0007, -0.15, 1)], baby=0.6)
    roots = np.array([cd['pts'][0] for cd in wk], F)
    g = CV.gradient(shape, roots, 0.0003)
    dd = shape(roots)
    for cd, gg, d0 in zip(wk, g, dd):
        cd['pts'][0] = cd['pts'][0] - gg * (d0 + 0.0005)
    out += wk
    return out
