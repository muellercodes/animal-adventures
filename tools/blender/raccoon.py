# Raccoon, sculpted as a signed distance field around the game's raccoon skeleton (tools/blender/work/raccoon-rig.json).
# Units are meters in game rig space (x left, y up, z forward, ground at y = 0). A hunched, round body in a thick
# grizzled coat, a broad head with a short pointed muzzle, rounded ears, nimble hands with long fingers, flat hind feet
# and a bushy ringed tail; then the coat paint (black mask, white brows and muzzle), fur shells and whiskers.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length
import carnivore as CV
from carnivore import local, local_n, mirror, groove, mix, hexc, rnd, wsum

ID = 'raccoon'
BOUNDS = (V(-0.17, 0.0, -0.63), V(0.17, 0.42, 0.42))
BAKE_DIST = (0.006, 0.02, 0.05)
DISSOLVE_DEGENERATE = True
TAIL_RINGS = 0

# ---------- landmarks (left side, +x) ----------
# head frame: from the back of the skull forward along the muzzle (s), up across it (u)
HF = CV.Frame(V(0.0, 0.29, 0.195), V(0.0, -0.25, 1.0), V(0.0, 1.0, 0.0))
EYE = CV.Eye(HF.pt(0.096, 0.012, 0.039), 0.0078, V(0.52, 0.18, 0.83), lid_w=0.0072, lid_h=0.0052, off=0.0005, slant=0.08,
             mound=(0.003, 0.0026, 0.001), sink=0.25)
NOSE_S = 0.171
MOUTH = HF.pt(0.153, -0.026)
EAR_B = V(0.047, 0.322, 0.232)
EAR_A = nrm([0.4, 0.91, -0.08])
EAR_N = nrm([0.4, -0.05, 0.92])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
EAR_L, EAR_W = 0.042, 0.021
XF, XH = 0.068, 0.078
HAND = V(XF, 0.0, 0.142)        # under the front palm
FOOT = V(XH, 0.0, -0.118)       # under the hind sole, behind the toes
PATCHES = [
    (EYE.c * V(0, 1, 1) + V(0.02, -0.016, -0.016), EYE.c * V(0, 1, 1) + V(0.06, 0.016, 0.018), 0.0005),   # eye and lids
    (HF.pt(0.13, 0.0) * V(0, 1, 1) + V(0.0, -0.035, 0.0), HF.pt(0.19, 0.0) * V(0, 1, 1) + V(0.03, 0.02, 0.01), 0.0006),  # muzzle, nose
    (V(0.025, 0.3, 0.205), V(0.085, 0.375, 0.26), 0.0007),                                                    # ear
    (V(0.03, -0.001, 0.115), V(0.11, 0.025, 0.2), 0.0006),                                                    # hand
    (V(0.035, -0.001, -0.19), V(0.115, 0.025, -0.07), 0.0007),                                                # hind foot
]

# trunk (with its coat): z, top, yw (height of widest), bottom, half width, exponent above, below
TRUNK = [
    (-0.255, 0.322, 0.276, 0.222, 0.04, 2.0, 2.0),
    (-0.23, 0.352, 0.274, 0.19, 0.078, 2.1, 2.0),
    (-0.185, 0.372, 0.272, 0.17, 0.098, 2.2, 2.0),
    (-0.12, 0.38, 0.268, 0.16, 0.106, 2.2, 2.0),
    (-0.05, 0.372, 0.262, 0.153, 0.106, 2.2, 2.0),
    (0.02, 0.356, 0.254, 0.149, 0.1, 2.2, 2.0),
    (0.08, 0.335, 0.246, 0.147, 0.09, 2.2, 2.0),
    (0.13, 0.316, 0.242, 0.155, 0.074, 2.1, 2.0),
    (0.165, 0.303, 0.244, 0.178, 0.05, 2.0, 2.0),
]
# neck: path (y, z), section toward the nape (top), toward the throat (bot), half width, exponents
NECK = [
    (0.255, 0.1, 0.065, 0.085, 0.072, 2.0, 2.0),
    (0.262, 0.16, 0.058, 0.072, 0.066, 2.0, 2.0),
    (0.27, 0.205, 0.05, 0.062, 0.058, 2.0, 2.0),
]
# head: along the head frame (s), top, height of widest, bottom, half width, exponents (with the coat)
HEAD = [
    (-0.012, 0.03, -0.01, -0.048, 0.04, 2.2, 2.0),
    (0.015, 0.05, -0.012, -0.064, 0.058, 2.4, 2.0),
    (0.045, 0.056, -0.014, -0.068, 0.066, 2.5, 2.0),
    (0.075, 0.05, -0.012, -0.06, 0.06, 2.5, 2.0),
    (0.1, 0.036, -0.012, -0.048, 0.044, 2.4, 2.1),
    (0.122, 0.023, -0.012, -0.037, 0.027, 2.3, 2.2),
    (0.144, 0.0135, -0.011, -0.029, 0.019, 2.2, 2.3),
    (0.162, 0.007, -0.009, -0.021, 0.0135, 2.2, 2.2),
    (0.175, 0.002, -0.007, -0.014, 0.009, 2.2, 2.2),
]
FORE = [
    (0.205, 0.135, 0.034, 0.04, 0.03, 2.2, 2.2, 0.062),
    (0.155, 0.12, 0.03, 0.035, 0.027, 2.2, 2.2, 0.066),
    (0.11, 0.112, 0.024, 0.026, 0.022, 2.2, 2.2, 0.068),
    (0.075, 0.12, 0.018, 0.018, 0.0175, 2.2, 2.2, 0.068),
    (0.045, 0.13, 0.0155, 0.0155, 0.0155, 2.2, 2.2, 0.068),
    (0.02, 0.137, 0.0135, 0.0135, 0.0145, 2.2, 2.2, 0.068),
    (0.01, 0.14, 0.012, 0.012, 0.014, 2.2, 2.2, 0.068),
]
HIND = [
    (0.255, -0.14, 0.048, 0.058, 0.036, 2.2, 2.2, 0.06),
    (0.195, -0.11, 0.042, 0.05, 0.034, 2.2, 2.2, 0.07),
    (0.145, -0.092, 0.03, 0.04, 0.027, 2.2, 2.2, 0.077),
    (0.1, -0.115, 0.021, 0.028, 0.02, 2.2, 2.2, 0.079),
    (0.065, -0.143, 0.017, 0.021, 0.0175, 2.2, 2.2, 0.079),
    (0.035, -0.162, 0.016, 0.018, 0.0165, 2.2, 2.2, 0.079),
    (0.014, -0.168, 0.014, 0.014, 0.0155, 2.2, 2.2, 0.079),
]
# the tail: path (y, z), radius (round section)
TAIL = [(0.292, -0.21, 0.03), (0.283, -0.255, 0.037), (0.264, -0.315, 0.042), (0.24, -0.38, 0.044), (0.214, -0.445, 0.043),
        (0.192, -0.505, 0.039), (0.177, -0.555, 0.03), (0.17, -0.584, 0.016)]
TAIL_Z0, TAIL_Z1 = -0.21, -0.592


def _tail_keys():
    return [(y, z, r, r, r * 0.97, 2.0, 2.0) for y, z, r in TAIL]


# ---------- trunk, neck ----------
def trunk(P):
    Q = mirror(P)
    d = loft(Q, TRUNK)
    # shoulders and the round haunches under the coat
    d = smin(d, ellipsoid(Q, V(0.05, 0.27, 0.1), V(0.04, 0.05, 0.055)), 0.04)
    d = smin(d, ellipsoid(Q, V(0.055, 0.29, -0.15), V(0.05, 0.07, 0.075)), 0.05)
    # belly hanging a little between the legs
    d = smin(d, ellipsoid(Q, V(0.0, 0.17, -0.03), V(0.07, 0.04, 0.09)), 0.04)
    return d


def neck(P):
    Q = mirror(P)
    d = sweep(Q, NECK)
    # ruff under the throat
    d = smin(d, ellipsoid(Q, V(0.0, 0.205, 0.19), V(0.05, 0.045, 0.045)), 0.03)
    return d


# ---------- head ----------
def head(P):
    Q = mirror(P)
    L = HF.loc(Q)
    d = loft(L, HEAD)
    # cheek ruff: the coat flares out behind the jaw below the ears
    d = smin(d, ellipsoid(L, V(0.045, -0.032, 0.04), V(0.026, 0.03, 0.035)), 0.018)
    # brow ridge over the eyes, the cheek under them
    d = smin(d, round_cone(L, V(0.02, 0.026, 0.088), V(0.038, 0.024, 0.088), 0.008, 0.007), 0.012)
    d = smin(d, round_cone(L, V(0.038, -0.006, 0.08), V(0.03, -0.012, 0.115), 0.009, 0.006), 0.012)
    # whisker pads, lower jaw, chin
    d = smin(d, ellipsoid(L, V(0.0105, -0.016, 0.148), V(0.008, 0.0085, 0.02)), 0.006)
    d = smin(d, ellipsoid(L, V(0.0, -0.026, 0.13), V(0.012, 0.007, 0.032)), 0.008)
    # nose pad
    d = smin(d, ellipsoid(L, V(0.0, -0.001, NOSE_S), V(0.0068, 0.0052, 0.005)), 0.0028)
    # mouth: the lip line from the front back to the corner
    M = L * V(1, 2.5, 1)
    m = round_cone(M, V(0.0, -0.016 * 2.5, NOSE_S - 0.002), V(0.009, -0.0185 * 2.5, 0.155), 0.0013, 0.0013)
    m = smin(m, round_cone(M, V(0.009, -0.0185 * 2.5, 0.155), V(0.0175, -0.021 * 2.5, 0.12), 0.0013, 0.0007), 0.002)
    d = smax(d, -(m + 0.0008) / 2.5, 0.0015)
    # nostrils and the groove down the middle
    nc = V(0.0034, -0.0022, NOSE_S + 0.0038)
    n1 = ellipsoid(L, nc, V(0.0015, 0.0011, 0.0026))
    n1 = smin(n1, ellipsoid(L, nc + V(0.0018, -0.001, -0.001), V(0.001, 0.0008, 0.002)), 0.0009)
    d = smax(d, -n1, 0.0008)
    d = d + groove(L[:, 0], 0.001, 0.0007) * sstep(NOSE_S - 0.002, NOSE_S + 0.003, L[:, 2]) * sstep(-0.004, -0.007, L[:, 1])
    return d


def eye_parts(P):
    Q = mirror(P)
    carve, lids, ball = EYE.parts(Q)
    return carve, lids, ball


def ear(P):
    Q = mirror(P)
    return CV.ear(Q, EAR_B, EAR_A, EAR_N, EAR_L, EAR_W, 'round', th0=0.0065, th1=0.0028, cup=0.5, tipin=-0.002,
                  base_r=(0.012, 0.008, 0.007))


# ---------- legs, hands and feet ----------
def fleg(P):
    Q = mirror(P)
    x = XF
    d = sweep(Q, FORE, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(x - 0.004, 0.16, 0.105), V(0.026, 0.045, 0.03)), 0.02)       # upper arm, triceps
    d = smin(d, ellipsoid(Q, V(x + 0.002, 0.085, 0.122), V(0.019, 0.03, 0.019)), 0.012)     # forearm
    return d


def hleg(P):
    Q = mirror(P)
    x = XH
    d = sweep(Q, HIND, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(0.068, 0.2, -0.13), V(0.034, 0.065, 0.06)), 0.04)          # thigh
    d = smin(d, ellipsoid(Q, V(x, 0.1, -0.13), V(0.02, 0.035, 0.022)), 0.015)              # calf
    d = smin(d, ellipsoid(Q, V(x, 0.03, -0.172), V(0.0135, 0.02, 0.014)), 0.01)            # heel
    return d


# hands: (angle from forward toward +x, base distance, length, radius); the thumb is on the inside (-x)
FINGERS = [(-50, 0.011, 0.016, 0.0036), (-22, 0.013, 0.024, 0.004), (-2, 0.014, 0.028, 0.0041), (18, 0.013, 0.026, 0.004), (40, 0.011, 0.02, 0.0037)]
TOES = [(-38, 0.012, 0.013, 0.0038), (-16, 0.014, 0.017, 0.0042), (2, 0.015, 0.019, 0.0043), (20, 0.014, 0.017, 0.0042), (40, 0.012, 0.014, 0.0039)]


def paws(P):
    """the hand and the hind foot of the +x side: (paws, claws)"""
    Q = mirror(P)
    a, ca = CV.hand(Q, HAND, FINGERS, (0.016, 0.0085, 0.017), yaw=0.12, claw=(0.0028, 0.0011), palm_c=(0.0, -0.002))
    b, cb = CV.hand(Q, FOOT, TOES, (0.0165, 0.0095, 0.04), yaw=0.06, claw=(0.0026, 0.0011), palm_c=(0.0, -0.03))
    return np.minimum(a, b), np.minimum(ca, cb)


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
    d = smin(d, local(P, (-0.15, 0.1, 0.0), (0.15, 0.38, 0.3), neck), 0.05)
    h = local(P, (-0.12, 0.17, 0.12), (0.12, 0.38, 0.42), head)
    ca, li, ba = local_n(P, (-0.07, 0.24, 0.24), (0.07, 0.32, 0.33), eye_parts, 3)
    h = smin(h, li, 0.004)
    h = smax(h, -ca, 0.0015)
    h = smin(h, ba, 0.0008)
    d = smin(d, h, 0.03)
    d = smin(d, local(P, (-0.11, 0.27, 0.18), (0.11, 0.39, 0.28), ear), 0.006)
    fl = local(P, (-0.13, -0.01, 0.02), (0.13, 0.27, 0.25), fleg)
    d = smin(d, fl, 0.035)
    hl = local(P, (-0.14, -0.01, -0.3), (0.14, 0.34, 0.0), hleg)
    d = smin(d, hl, 0.04)
    pw, cl = local_n(P, (-0.13, -0.01, -0.2), (0.13, 0.04, 0.22), paws, 2)
    d = smin(d, pw, 0.008)
    d = np.minimum(d, cl)
    d = smin(d, local(P, (-0.08, 0.1, -0.64), (0.08, 0.36, -0.12), tail), 0.03)
    return d


PREVIEW = {
    'side': ((1.9, 0.3, -0.08), (0, 0.2, -0.08), 30),
    'front3q': ((1.1, 0.5, 1.15), (0, 0.2, -0.03), 30),
    'front': ((0.0, 0.3, 1.7), (0, 0.22, 0.0), 26),
    'rear3q': ((-1.0, 0.6, -1.2), (0, 0.2, -0.12), 30),
    'top': ((0.01, 1.9, -0.08), (0, 0.22, -0.08), 30),
    'face': ((0.2, 0.33, 0.75), (0, 0.27, 0.28), 24),
    'faceside': ((0.5, 0.3, 0.3), (0.0, 0.27, 0.28), 24),
    'feet': ((0.4, 0.08, 0.35), (0.06, 0.02, 0.0), 32),
    'hands': ((0.25, 0.12, 0.38), (0.068, 0.01, 0.15), 22),
    'headtop': ((0.05, 0.8, 0.28), (0, 0.28, 0.28), 24),
}


# ---------- game mesh: decimation, texture layout, skinning ----------
# keep levels: body floor, eyes, head, muzzle tip, ears, paws, the tail's floor
KEEP = (0.44, 0.82, 0.6, 0.72, 0.64, 0.68, 0.38)


def keep(P):
    """higher where the game mesh keeps more of the sculpt when decimating (never 1, which locks a vertex)"""
    Pm = mirror(P)
    tl = sstep(-0.23, -0.27, Pm[:, 2]) * sstep(0.12, 0.15, Pm[:, 1])
    base = KEEP[0] + (KEEP[6] - KEEP[0]) * tl
    e = sstep(0.026, 0.012, np.linalg.norm(Pm - EYE.c, axis=1)) * KEEP[1]
    L = HF.loc(Pm)
    hd = sstep(-0.01, 0.02, L[:, 2]) * sstep(0.2, 0.23, Pm[:, 1]) * KEEP[2]
    m = sstep(0.13, 0.155, L[:, 2]) * sstep(-0.05, -0.035, L[:, 1]) * KEEP[3]
    a, c, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    er = sstep(-0.01, 0.0, a) * sstep(0.03, 0.02, np.abs(c)) * sstep(0.014, 0.008, np.abs(n)) * KEEP[4]
    pw = sstep(0.026, 0.016, Pm[:, 1]) * KEEP[5]
    return np.maximum.reduce([base, e, hd, m, er, pw]).astype(F)


UV_AVERAGE = True


def uv_regions(P):
    Pm = mirror(P)
    L = HF.loc(Pm)
    y, z = Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 2)
    a, c, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    head = (L[:, 2] > 0.0) & (y > 0.2)
    neck = ~head & (z > 0.13) & (y > 0.17)
    fleg = (z > -0.02) & (y < 0.16)
    hleg = (z <= -0.02) & (y < 0.2) & (z > -0.24)
    tail = (z < -0.23) & ~hleg & (y > 0.11)
    lab[neck] = 1
    lab[head] = 0
    lab[head & (a > 0.004) & (np.abs(c) < 0.035)] = 8
    lab[fleg] = 3
    lab[fleg & (y < 0.03)] = 4
    lab[hleg] = 5
    lab[hleg & (y < 0.03)] = 6
    lab[tail] = 7
    return lab


def uv_weight(P):
    Pm = mirror(P)
    L = HF.loc(Pm)
    head = sstep(-0.01, 0.02, L[:, 2]) * sstep(0.2, 0.23, Pm[:, 1])
    paw = sstep(0.04, 0.02, Pm[:, 1])
    under = sstep(0.19, 0.16, Pm[:, 1]) * sstep(0.04, 0.02, Pm[:, 0])
    return (0.92 + 0.8 * head + 0.35 * paw - 0.25 * under).astype(F)


WEIGHT_SMOOTH = (5, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['head'], 'head': HF.pt(0.18, 0.0),
         'tail1': P['tail2'], 'tail2': P['tail3'], 'tail3': V(0, 0.17, -0.59)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, 0.005, 0.04)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (HAND + V(0, 0.005, 0.04)) * m
        t['ear' + s] = (EAR_B + EAR_A * EAR_L) * m
    return t


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    W[:, bi['ctag']] = 0
    x = wpos[:, 0]
    Pm = mirror(wpos)
    for b in names:
        if b.endswith('L') and b[:-1] + 'R' in bi:
            r = bi[b[:-1] + 'R']; l = bi[b]
            pos = x > 0.01
            W[pos, l] += W[pos, r]; W[pos, r] = 0
            neg = x < -0.01
            W[neg, r] += W[neg, l]; W[neg, l] = 0
    a, c, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    on = (ear(wpos) < 0.002) & (a > -0.004)
    k = sstep(-0.004, 0.01, a)
    for s, sg in (('L', 1), ('R', -1)):
        CV.set_part(W, bi, on & (x * sg > 0), 'ear' + s, k)
    # fingers and toes ride on the paw bones; the soles on the paw and meta bones
    for s, sg in (('L', 1), ('R', -1)):
        near = (np.abs(x - sg * HAND[0]) < 0.04) & (wpos[:, 2] > HAND[2] - 0.01) & (wpos[:, 2] < HAND[2] + 0.07) & (wpos[:, 1] < 0.022)
        CV.set_part(W, bi, near, 'fpaw' + s, sstep(0.022, 0.012, wpos[:, 1]) * sstep(HAND[2] - 0.01, HAND[2] + 0.008, wpos[:, 2]))
        near = (np.abs(x - sg * FOOT[0]) < 0.04) & (wpos[:, 2] > FOOT[2] - 0.01) & (wpos[:, 2] < FOOT[2] + 0.07) & (wpos[:, 1] < 0.022)
        CV.set_part(W, bi, near, 'hpaw' + s, sstep(0.022, 0.012, wpos[:, 1]) * sstep(FOOT[2] - 0.01, FOOT[2] + 0.01, wpos[:, 2]))
    s = W.sum(1, keepdims=True)
    return W / np.maximum(s, 1e-9)


# ---------- coat ----------
_TY = np.array([t[0] for t in TAIL], F)
_TZ = np.array([t[1] for t in TAIL], F)


def tail_dir(z):
    zs, ys = _TZ[::-1], _TY[::-1]
    dydz = np.interp(z, zs, np.gradient(ys, zs))
    t = np.stack([np.zeros_like(z), -dydz, -np.ones_like(z)], 1)
    return t / np.linalg.norm(t, axis=1, keepdims=True)


def tail_arc(z):
    """distance along the tail from its root (m)"""
    zs, ys = _TZ[::-1], _TY[::-1]
    seg = np.sqrt(np.diff(zs) ** 2 + np.diff(ys) ** 2)
    arc = np.concatenate([[0], np.cumsum(seg)])
    arc = arc[-1] - arc        # zs ascending: the root is the last key
    return np.interp(z, zs, arc)


def flow(P, N=None):
    """from the nose back over the head, back and down on the cheeks and the body, down the legs, along the tail"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    one = np.ones_like(y)
    body = np.stack([0.3 * sstep(0.03, 0.09, x), -(0.15 + 0.9 * sstep(0.27, 0.17, y)), -one], 1)
    neckd = np.stack([0.25 * one, -0.6 * one, -0.7 * one], 1)
    legd = np.stack([0 * y, -one, -0.05 * one], 1)
    L = HF.loc(Q)
    cheek = sstep(0.0, -0.03, L[:, 1]) * sstep(0.11, 0.07, L[:, 2])
    head = -HF.a[None, :] + np.stack([0.45 * sstep(0.01, 0.04, x) + 0.4 * cheek, -0.3 * cheek, 0 * y], 1)
    taild = tail_dir(z)
    wh = sstep(-0.005, 0.025, L[:, 2]) * sstep(0.18, 0.21, y)
    wt = sstep(-0.22, -0.25, z) * sstep(0.1, 0.13, y) * (1 - sstep(0.17, 0.12, y) * sstep(-0.26, -0.22, z))
    wn = sstep(0.11, 0.16, z) * sstep(0.17, 0.2, y) * (1 - wh)
    wl = sstep(0.16, 0.11, y) * (1 - wh - wn) * (1 - wt)
    wb = np.clip(1 - wh - wn - wl - wt, 0, 1)
    f = body * wb[:, None] + head * wh[:, None] + neckd * wn[:, None] + legd * wl[:, None] + taild * wt[:, None]
    a, c, n = CV.ear_coords(Q, EAR_B, EAR_A, EAR_N)
    we = sstep(-0.004, 0.008, a) * sstep(0.034, 0.024, np.abs(c)) * sstep(0.014, 0.008, np.abs(n))
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
    r['nose'] = sstep(0.0012, 0.0, ellipsoid(L, V(0.0, -0.001, NOSE_S), V(0.0072, 0.0056, 0.0054))) * sstep(NOSE_S - 0.006, NOSE_S - 0.002, L[:, 2])
    lipu = -0.016 - 0.005 * sstep(0.163, 0.12, L[:, 2])
    r['lip'] = sstep(0.0028, 0.0012, np.abs(L[:, 1] - lipu)) * sstep(0.115, 0.123, L[:, 2]) * r['head']
    a, cc, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    r['ea'], r['ec'], r['en'] = a, cc, n
    r['ear'] = sstep(0.0025, 0.0006, c['ear']) * sstep(-0.004, 0.004, a)
    r['earIn'] = sstep(-0.15, 0.35, Nm @ EAR_N) * sstep(0.004, -0.004, np.abs(cc) - EAR_W * 0.75 * np.sqrt(np.clip(1 - (a / EAR_L) ** 2, 0, 1)))
    r['paw'] = sstep(0.003, 0.0, c['paw']) * sstep(0.026, 0.016, y)
    r['pad'] = sstep(-0.2, -0.75, N[:, 1]) * sstep(0.005, 0.0015, y)
    r['claw'] = sstep(0.0008, 0.0, c['claw'])
    r['tarc'] = tail_arc(z)
    r['tail'] = sstep(0.006, 0.0, c['tail']) * sstep(-0.21, -0.24, z) * sstep(0.1, 0.13, y)
    r['top'] = sstep(0.3, 0.85, N[:, 1])
    return r


K = {
    'gray': hexc(0x77706A), 'grayDk': hexc(0x47423E), 'grayLt': hexc(0xA59E95), 'buff': hexc(0x9C8C76), 'tan': hexc(0x8B7457),
    'black': hexc(0x151312), 'blackHi': hexc(0x302B28), 'white': hexc(0xEAE6DF), 'cream': hexc(0xD9D2C5), 'leg': hexc(0x3A3532),
    'skin': hexc(0x2B2725), 'nose': hexc(0x121010), 'lip': hexc(0x1A1716), 'earIn': hexc(0xCFC8BE), 'claw': hexc(0x4A4440),
    'ball': hexc(0x0E0A08), 'ring': hexc(0xB0A08A),
}


def _lenk(Pm):
    L = HF.loc(Pm)
    hd = sstep(-0.005, 0.02, L[:, 2]) * sstep(0.18, 0.21, Pm[:, 1])
    lg = sstep(0.12, 0.05, Pm[:, 1]) * (1 - sstep(-0.22, -0.25, Pm[:, 2]))
    tl = sstep(-0.22, -0.26, Pm[:, 2]) * sstep(0.1, 0.13, Pm[:, 1])
    return np.clip(1.15 - 0.6 * hd - 0.55 * lg + 0.3 * tl, 0.4, 1.7)


_scache = {}


def _strands(P, N, R):
    key = (len(P), float(P[:7].sum()))
    if key not in _scache:
        dens = 0.95 * (1 - R['nose']) * (1 - R['ball']) * (1 - R['claw']) * (1 - R['pad'] * R['paw']) * (1 - 0.6 * R['lip']) * sstep(EYE.r + 0.002, EYE.r + 0.006, R['eyeD'])
        _scache[key] = CV.strands(P, N, dens, flow, 0.0042, 0.0055, 0.0095, 0.0006, seed=73, lenk=lambda Q: _lenk(mirror(Q)))
    return _scache[key]


def _markings(R, c, Pm, N):
    """the raccoon's face: black mask across the eyes and down the cheeks, white brows above it, a white muzzle and
    chin, a dark stripe down the nose bridge; pale ear rims; the tail rings"""
    L = R['L']
    s, u = L[:, 2], L[:, 1]
    xn = Pm[:, 0]
    w1 = fbm(Pm * 160, 2, 41) - 0.5
    w2 = fbm(Pm * 45, 2, 42) - 0.5
    hd = R['head']
    # mask: a band through the eyes, widest around them, sweeping back and down over the cheeks
    Ec = EYE.c
    El = HF.loc(Ec[None, :])[0]
    ds, du = s - El[2], u - El[1]
    # in the eye's own cross section: an ellipse around the eye, stretched back toward the cheek
    drop = 0.016 * sstep(-0.01, -0.05, ds)
    mband = np.sqrt((np.maximum(-ds, 0) / 0.055 + np.maximum(ds, 0) / 0.028) ** 2 + ((du + 0.003 + drop) / (0.0125 + 0.004 * sstep(0.0, -0.04, ds))) ** 2)
    mask = sstep(1.08 + 0.15 * w2, 0.92, mband) * sstep(0.008, 0.016, xn) * hd
    # white brows: an arc above the mask; white muzzle sides and chin below and in front of it
    brow = sstep(0.005, 0.0015, np.abs(du - 0.0165 + 0.6 * ds * ds)) * sstep(0.03, 0.016, np.abs(ds + 0.002)) * sstep(0.006, 0.014, xn) * hd
    muz = sstep(0.11, 0.122, s) * sstep(0.006 + 0.006 * w2, -0.004, u) * hd
    chin = sstep(-0.024, -0.034, u) * sstep(0.07, 0.1, s) * hd
    white = np.clip(np.maximum.reduce([brow, muz, chin]) * (1 - mask), 0, 1)
    # dark stripe from the forehead down the nose bridge
    bridge = sstep(0.009, 0.004, xn) * sstep(0.07, 0.1, s) * sstep(-0.004, 0.006, u) * hd * (1 - R['nose'])
    # forehead and cheek ruff a lighter gray
    ruff = sstep(0.04, 0.02, s) * sstep(0.0, -0.03, u) * hd
    # ears: pale rims and insides, dark at the back of the base
    ear_rim = R['ear'] * sstep(0.006, 0.002, EAR_W * np.sqrt(np.clip(1 - (R['ea'] / EAR_L) ** 2, 0, 1)) - np.abs(R['ec']))
    ear_rim = np.maximum(ear_rim, R['ear'] * sstep(EAR_L * 0.82, EAR_L * 0.95, R['ea']))
    ear_in = R['ear'] * R['earIn']
    ear_b = R['ear'] * (1 - R['earIn']) * sstep(0.025, 0.008, R['ea'])
    # tail: black rings (5) on buff gray, and a black tip
    ta = R['tarc']
    period = 0.066
    ph = (ta - 0.035) / period + 0.12 * w2
    ringv = np.abs(((ph % 1.0) + 1.0) % 1.0 - 0.5)
    rings = R['tail'] * sstep(0.27, 0.2, ringv) * sstep(0.01, 0.03, ta)
    tip = R['tail'] * sstep(0.385, 0.405, ta + 0.01 * w2)
    return dict(mask=mask, white=white, bridge=bridge, ruff=ruff, ear_rim=ear_rim, ear_in=ear_in, ear_b=ear_b, rings=np.maximum(rings, tip))


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y, z = Pm[:, 1], Pm[:, 2]
    M = _markings(R, c, Pm, N)
    n1 = fbm(Pm * 9, 3, 11)
    n2 = fbm(Pm * 40, 3, 12)
    col = np.tile(K['gray'], (len(P), 1))
    # darker along the back (more black guard hairs), paler and buffier on the lower sides and belly
    col = mix(col, K['grayDk'], R['top'] * 0.45)
    col = mix(col, K['grayLt'], sstep(0.2, -0.3, N[:, 1]) * 0.3)
    col = mix(col, K['buff'], sstep(-0.2, -0.7, N[:, 1]) * 0.55)
    col *= (0.92 + 0.16 * n1)[:, None]
    # legs: dark grayish brown, darker toward the paws; the hands and feet dark skin with short pale hair on top
    leg = sstep(0.17, 0.1, y) * (1 - R['tail'])
    col = mix(col, K['leg'], leg * (0.55 + 0.4 * sstep(0.1, 0.04, y)))
    col = mix(col, K['grayLt'] * 0.75, R['paw'] * sstep(0.2, 0.7, N[:, 1]) * 0.5)
    # tail: buff gray between the black rings
    col = mix(col, K['ring'] * (0.9 + 0.2 * n2[:, None]), R['tail'] * 0.7)
    col = mix(col, mix(np.tile(K['black'], (len(P), 1)), K['blackHi'], n2 * 0.6), M['rings'])
    # face
    col = mix(col, K['grayLt'], M['ruff'] * 0.6)
    col = mix(col, mix(np.tile(K['white'], (len(P), 1)), K['cream'], n2 * 0.5), M['white'])
    col = mix(col, K['grayDk'] * 0.8, M['bridge'] * 0.85)
    col = mix(col, mix(np.tile(K['black'], (len(P), 1)), K['blackHi'], n2 * 0.5), M['mask'])
    col = mix(col, K['grayDk'] * 0.7, M['ear_b'] * 0.8)
    col = mix(col, K['earIn'], M['ear_in'] * 0.85)
    col = mix(col, K['white'], M['ear_rim'] * 0.9)
    col = mix(col, K['lip'], R['lip'])
    col = mix(col, K['black'], R['lid'])
    col = mix(col, K['nose'] * (0.85 + 0.3 * n2[:, None]), R['nose'])
    col = mix(col, K['skin'], R['pad'] * R['paw'])
    col = mix(col, K['claw'], R['claw'])
    # grizzled guard hairs: dark and light tipped strokes over the coat
    s, tone = _strands(P, N, R)
    face = R['head'] * (1 - M['ruff'])
    k = s * np.where(tone < 0.4, -0.45, np.where(tone > 0.72, 0.5, 0.06)) * (1 - 0.6 * face) * (1 - 0.7 * leg) * (1 - 0.5 * M['rings'])
    col = col * (1 + np.minimum(k, 0))[:, None] + (1 - col) * np.maximum(k, 0)[:, None] * 0.75
    col = mix(col, K['ball'], R['ball'])
    rough = 0.66 + 0.08 * (n2 - 0.5) - 0.3 * R['nose'] - 0.25 * R['lid'] - 0.15 * R['lip'] - 0.2 * R['claw'] - 0.1 * R['pad'] * R['paw']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    h = np.zeros(len(P), F)
    s, tone = _strands(P, N, R)
    h += 0.00008 * s * (1 - R['ball']) * (1 - R['nose']) * (1 - R['pad'] * R['paw'])
    g1, _ = worley(Pm / 0.0007, 58)
    h -= 0.00004 * sstep(0.35, 0.1, g1) * R['nose']
    g2, _ = worley(Pm / 0.0011, 59)
    h += 0.00007 * sstep(0.1, 0.5, g2) * R['pad'] * R['paw']
    return h


def finish(C, ao, valid):
    return CV.finish(C, ao, valid, 0.4)


FUR = {'len': 0.036, 'n': 5, 'lean': 1.0, 'tile': 0.0016, 'babyLen': 1.4, 'babyLean': 0.45, 'shade': 0.62, 'quality': 80}


def fur(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y, z = Pm[:, 1], Pm[:, 2]
    ln = np.full(len(P), 0.026, F)
    ln = ln + 0.006 * sstep(-0.3, -0.8, N[:, 1]) * (1 - R['tail'])
    ln = ln + 0.004 * sstep(0.1, 0.17, z) * sstep(0.28, 0.2, y)
    leg = sstep(0.16, 0.08, y) * (1 - R['tail'])
    ln = ln * (1 - leg * 0.7)
    ln = ln * (1 - R['paw'] * 0.75)
    hd = R['head']
    ln = ln * (1 - hd) + hd * (0.008 + 0.014 * sstep(0.06, 0.03, L[:, 2]) * sstep(0.0, -0.025, L[:, 1]) - 0.005 * sstep(0.12, 0.15, L[:, 2]))
    er = R['ear']
    ln = ln * (1 - er) + er * (0.004 + 0.006 * R['earIn'])
    tl = R['tail']
    ln = ln * (1 - tl) + tl * (0.03 + 0.006 * sstep(0.05, 0.15, R['tarc']))
    ln = ln * (1 - R['nose']) * (1 - R['lip']) * (1 - R['claw']) * (1 - R['pad'] * R['paw']) * sstep(EYE.r + 0.0015, EYE.r + 0.005, R['eyeD'])
    dens = np.ones(len(P), F) * (1 - 0.3 * hd * sstep(0.12, 0.16, L[:, 2]))
    return np.clip(ln, 0, FUR['len']).astype(F), dens


MAP_QUALITY = (60, 70)
PAD_SMOOTH = 4    # texture.py: smooth padding beyond 4 texels of the islands (the grizzled coat costs bytes)


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': CV.lid_color(col, R['eyeD'], EYE.r)}


def meta(st):
    p, r, d, lid = EYE.meta()
    return {
        'eye': {'p': p, 'r': r, 'dir': d, 'lid': lid, 'iris': 0x2A1A10, 'irisR': 0.95, 'pupilR': 0.5, 'rim': 0x0C0806, 'lidCol': 0x141211},
        # snug in the thick coat (0.3 of the fur), each edge on the skin, and on the neck bones so the kit's band does
        # not stand up behind its big head
        'collar': {'at': ['neck', 'head', 0.3], 'lift': 0.3, 'hug': True, 'taper': True, 'wb': ['neck', 'chest'], 'wbk': 0.6},
        'belly': [0.0, 0.158, -0.12],
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.06, 1.05, 1.04],
        'rim': [0.12, 0.11, 0.1], 'flat': 0x6E6862,
    }


# ---------- hair cards: whiskers ----------
HAIR = {'size': (64, 128), 'cols': 2, 'base': (0.05, 0.045, 0.04), 'hi': (0.4, 0.38, 0.35), 'tip': (0.75, 0.72, 0.68), 'strands': 18,
        'root': 1.0, 'rough': 0.45, 'alpha': 0.35, 'seed': 6, 'quality': 80}


def cards():
    rows = []
    for i in range(6):
        t = i / 5
        s0 = 0.134 + 0.022 * t + 0.004 * (rnd(i, 1) - 0.5)
        u0 = -0.009 - 0.005 * ((i % 3) / 2) + 0.002 * (rnd(i, 2) - 0.5)
        root = HF.pt(s0, u0, 0.0135 - 0.004 * t)
        d = nrm(V(0.75, 0.05 * (rnd(i, 3) - 0.3), 0.0) + HF.a * (-0.2 + 0.5 * t) + HF.u * (0.08 - 0.25 * (i % 3) / 2))
        rows.append((root, d, 0.04 + 0.02 * rnd(i, 4), 0.001, 0.15, i % 2))
    out = []
    for sg in (1, -1):
        m = V(sg, 1, 1)
        out += CV.whiskers([(root * m, d * m, ln, w, droop, col) for root, d, ln, w, droop, col in rows])
    roots = np.array([cd['pts'][0] for cd in out], F)
    g = CV.gradient(shape, roots)
    dd = shape(roots)
    for cd, gg, d0 in zip(out, g, dd):
        cd['pts'][0] = cd['pts'][0] - gg * (d0 + 0.0008)
    return out
