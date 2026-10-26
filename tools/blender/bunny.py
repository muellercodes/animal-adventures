# Eastern cottontail, sculpted as a signed distance field around the game's bunny skeleton
# (tools/blender/work/bunny-rig.json). Units are meters in game rig space (x left, y up, z forward, ground at y = 0).
# A round body with a high rump, big haunches over long furry hind feet, slender front legs, a short thick neck, a
# rounded head with big bulging eyes set high on the sides, a blunt muzzle with a split upper lip and slit nostrils,
# long upright ears (thin, cupped, rolled at the base) and a round cottontail. Agouti coat: buff hairs with dark tips,
# a rusty nape, pale eye rings, a white belly and the white underside of the tail; the ears' insides are pink skin
# with veins and sparse hairs. Kits are rounder, fluffier and darker with a white star (the baby color map).
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length
import carnivore as CV
from carnivore import local, local_n, mirror, groove, mix, hexc, rnd, wsum

ID = 'bunny'
BOUNDS = (V(-0.1, 0.0, -0.215), V(0.1, 0.4, 0.235))
BAKE_DIST = (0.003, 0.01, 0.03)
DISSOLVE_DEGENERATE = True
TAIL_RINGS = 0

# ---------- landmarks (left side, +x) ----------
# head frame: from the back of the skull forward along the muzzle (s), up across it (u)
HF = CV.Frame(V(0.0, 0.232, 0.098), V(0.0, -0.13, 1.0), V(0.0, 1.0, 0.0))
EYE = CV.Eye(HF.pt(0.05, 0.017, 0.0385), 0.0104, V(0.93, 0.2, 0.3), lid_w=0.0094, lid_h=0.0088, off=0.0004, slant=0.05,
             mound=(0.0034, 0.003, 0.0012), sink=0.04)
NOSE_S = 0.112
MOUTH = HF.pt(0.1, -0.021)
EAR_B = V(0.017, 0.262, 0.112)
EAR_A = nrm([0.2, 0.95, -0.2])
EAR_N = nrm([0.42, 0.0, 1.0])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
EAR_L, EAR_W = 0.104, 0.0185
XF, XH = 0.04, 0.063
HAND = V(XF, 0.0, 0.092)
HEEL = V(XH, 0.0, -0.124)
TOE = V(XH - 0.001, 0.0, 0.016)
KNEE = V(XH + 0.001, 0.074, -0.004)
TAILC = V(0.0, 0.155, -0.18)
PATCHES = [
    (EYE.c * V(0, 1, 1) + V(0.022, -0.016, -0.016), EYE.c * V(0, 1, 1) + V(0.05, 0.016, 0.018), 0.0004),   # eye and lids
    (HF.pt(0.085, 0.0) * V(0, 1, 1) + V(0.0, -0.036, 0.0), HF.pt(0.122, 0.0) * V(0, 1, 1) + V(0.03, 0.016, 0.004), 0.0004),  # muzzle, nose, lips
    (V(0.004, 0.255, 0.075), V(0.06, 0.375, 0.15), 0.0006),                                                    # ears
]

# trunk (with the dense under fur): z, top, yw (height of widest), bottom, half width, exponents above, below
TRUNK = [
    (-0.182, 0.172, 0.136, 0.098, 0.03, 2.0, 2.0),
    (-0.166, 0.198, 0.133, 0.072, 0.054, 2.1, 2.0),
    (-0.135, 0.216, 0.13, 0.056, 0.068, 2.2, 2.1),
    (-0.095, 0.226, 0.128, 0.051, 0.072, 2.2, 2.2),
    (-0.05, 0.219, 0.128, 0.054, 0.07, 2.2, 2.2),
    (-0.005, 0.208, 0.13, 0.057, 0.066, 2.2, 2.2),
    (0.035, 0.2, 0.132, 0.06, 0.061, 2.2, 2.1),
    (0.07, 0.199, 0.136, 0.064, 0.055, 2.1, 2.0),
    (0.098, 0.203, 0.142, 0.074, 0.046, 2.0, 2.0),
    (0.12, 0.2, 0.152, 0.095, 0.032, 2.0, 2.0),
]
# head: along the head frame (s), top, height of widest, bottom, half width, exponents (with the fur)
HEAD = [
    (-0.008, 0.026, -0.004, -0.036, 0.028, 2.2, 2.0),
    (0.012, 0.035, -0.003, -0.044, 0.04, 2.4, 2.1),
    (0.035, 0.037, -0.004, -0.047, 0.045, 2.5, 2.2),
    (0.057, 0.033, -0.006, -0.045, 0.042, 2.5, 2.3),
    (0.077, 0.025, -0.008, -0.039, 0.033, 2.4, 2.3),
    (0.094, 0.018, -0.009, -0.032, 0.024, 2.3, 2.3),
    (0.106, 0.012, -0.009, -0.025, 0.0165, 2.2, 2.2),
    (0.115, 0.0055, -0.008, -0.017, 0.0095, 2.2, 2.2),
]
# hind foot: a long furry foot flat on the ground from the heel to the toes (local x around XH)
FOOT = [
    (-0.132, 0.022, 0.014, 0.004, 0.008, 2.0, 2.0),
    (-0.12, 0.028, 0.014, 0.0, 0.0115, 2.0, 2.2),
    (-0.09, 0.024, 0.012, 0.0, 0.0125, 2.0, 2.4),
    (-0.05, 0.021, 0.01, 0.0, 0.0128, 2.0, 2.5),
    (-0.012, 0.0185, 0.009, 0.0, 0.0132, 2.0, 2.5),
    (0.008, 0.016, 0.008, 0.0, 0.0125, 2.0, 2.4),
    (0.02, 0.0115, 0.006, 0.0, 0.0098, 2.0, 2.2),
    (0.028, 0.0075, 0.004, 0.0, 0.0065, 2.0, 2.0),
]


def trunk(P):
    Q = mirror(P)
    d = loft(Q, TRUNK)
    # round rump over the hips, shoulders, the deep chest between the front legs
    d = smin(d, ellipsoid(Q, V(0.03, 0.17, -0.11), V(0.04, 0.048, 0.06)), 0.03)
    d = smin(d, ellipsoid(Q, V(0.028, 0.15, 0.075), V(0.022, 0.035, 0.03)), 0.02)
    d = smin(d, ellipsoid(Q, V(0.0, 0.112, 0.095), V(0.034, 0.04, 0.032)), 0.02)
    return d


def neck(P):
    Q = mirror(P)
    d = ellipsoid(Q, V(0.0, 0.19, 0.098), V(0.04, 0.042, 0.042))
    # throat and the full fur under the jaw
    d = smin(d, ellipsoid(Q, V(0.0, 0.172, 0.118), V(0.03, 0.03, 0.03)), 0.02)
    return d


# ---------- head ----------
def head(P):
    Q = mirror(P)
    L = HF.loc(Q)
    d = loft(L, HEAD)
    # full cheeks below and behind the eye
    d = smin(d, ellipsoid(L, V(0.03, -0.022, 0.045), V(0.016, 0.022, 0.03)), 0.014)
    # brow ridge over the eye, a shallow hollow in front of it along the muzzle
    d = d + groove(np.sqrt((L[:, 0] - 0.026) ** 2 + ((L[:, 1] - 0.004) * 0.8) ** 2), 0.007, 0.0016) * sstep(0.066, 0.075, L[:, 2]) * sstep(0.098, 0.088, L[:, 2])
    # whisker pads: two round puffs either side of the split lip
    d = smin(d, ellipsoid(L, V(0.0072, -0.0135, 0.104), V(0.0085, 0.0085, 0.0105)), 0.004)
    # chin and lower lip, small, under the pads
    d = smin(d, ellipsoid(L, V(0.0, -0.026, 0.092), V(0.0085, 0.0055, 0.012)), 0.006)
    # nose: a soft rounded tip
    d = smin(d, ellipsoid(L, V(0.0, -0.0025, NOSE_S + 0.0005), V(0.0078, 0.0064, 0.0052)), 0.004)
    # the cleft from the nose down the middle of the upper lip, opening into the mouth
    cleft = np.maximum(np.abs(L[:, 0]) - 0.0006, np.maximum(L[:, 1] - (-0.0085), -0.0205 - L[:, 1]))
    d = smax(d, -(cleft + 0.0001), 0.0008)
    # mouth line: back from the bottom of the cleft under the whisker pad
    M = L * V(1, 2.5, 1)
    m = round_cone(M, V(0.0, -0.0215 * 2.5, 0.1035), V(0.0075, -0.0225 * 2.5, 0.097), 0.0009, 0.0009)
    m = smin(m, round_cone(M, V(0.0075, -0.0225 * 2.5, 0.097), V(0.0125, -0.0215 * 2.5, 0.086), 0.0009, 0.0005), 0.0015)
    d = smax(d, -(m + 0.0005) / 2.5, 0.001)
    # nostrils: slits running from the top of the nose down and out (they meet over the cleft, an inverted Y)
    for t in np.linspace(0, 1, 6):
        c = V(0.0012 + 0.0038 * t, 0.0004 - 0.0034 * t, NOSE_S + 0.0046 - 0.0016 * t)
        d = smax(d, -ellipsoid(L, c, V(0.0007, 0.0007, 0.0012)), 0.0005)
    return d


def eye_parts(P):
    Q = mirror(P)
    carve, lids, ball = EYE.parts(Q)
    L = EYE.loc(Q)
    brow = round_cone(L, V(-0.012, 0.0095, -0.004), V(0.008, 0.0105, -0.005), 0.004, 0.003)
    return carve, lids, ball, brow


# ---------- ears ----------
def ear_coords(Q):
    return CV.ear_coords(Q, EAR_B, EAR_A, EAR_N)


def ear(P):
    """long, thin, upright: narrow and rolled into a cone at the base, widest past the middle, a rounded tip; the
    opening (pink skin) faces forward and out, the back is furred. Thicker toward the base and along the rims."""
    Q = mirror(P)
    a, c, n = ear_coords(Q)
    u = np.clip(a / EAR_L, 0, 1)
    hw = EAR_W * (0.74 * np.sqrt(np.clip(1 - ((u - 0.52) / 0.54) ** 2, 0, 1)) + 0.3 * (1 - u)) + 0.0008
    k = np.clip(c / np.maximum(hw, 1e-4), -1.25, 1.25)
    cup = 1.05 - 0.75 * sstep(0.0, 0.55, u)
    mid = hw * (k * k - 0.45) * cup * 0.75 + 0.002 * u * u
    th = 0.5 * (0.0042 * (1 - u) + 0.0023 * u) * (1 + 0.25 * sstep(0.6, 1.0, np.abs(k)))
    d_out = np.abs(c) - hw
    d_th = np.abs(n - mid) - th
    d_end = np.maximum(-a - 0.006, a - EAR_L)
    d = smax(smax(d_out, d_th, 0.0018), d_end, 0.008)
    # the base: a thick rolled root blending into the head, the lower part of the ear rolled around its opening
    d = smin(d, ellipsoid(Q, EAR_B - EAR_A * 0.002, V(0.0145, 0.013, 0.013)), 0.01)
    d = smin(d, round_cone(Q, EAR_B, EAR_B + EAR_A * 0.034 - EAR_N * 0.002, 0.0105, 0.006), 0.008)
    return d


# ---------- legs and feet ----------
def hleg(P):
    Q = mirror(P)
    # the haunch: a big rounded thigh on the side of the rump, its front edge at the knee
    d = ellipsoid(Q, V(XH - 0.013, 0.104, -0.072), V(0.033, 0.064, 0.074))
    d = smin(d, ellipsoid(Q, V(XH - 0.006, 0.078, -0.028), V(0.026, 0.038, 0.04)), 0.02)
    d = smin(d, ellipsoid(Q, V(XH - 0.004, 0.05, -0.1), V(0.022, 0.03, 0.04)), 0.02)
    # shin: from the knee down and back to the heel along the inside of the haunch
    d = smin(d, round_cone(Q, KNEE, HEEL + V(0.0, 0.022, 0.006), 0.016, 0.011), 0.012)
    return d


def hfoot(P):
    Q = mirror(P) - V(XH, 0.0, 0.0)
    d = loft(Q, FOOT, mirror_x=False)
    # four toes under the fur: shallow grooves across the front of the foot
    for ox in (-0.0046, 0.0, 0.0046):
        g = groove(Q[:, 0] - ox, 0.0011, 0.0009) * sstep(0.0, 0.012, Q[:, 2]) * sstep(0.004, 0.012, Q[:, 1])
        d = d + g
    # claws peeking out of the fur at the toe tips
    cl = np.full(len(P), 1.0, F)
    for ox, oz in ((-0.0068, 0.024), (-0.0023, 0.029), (0.0023, 0.029), (0.0068, 0.024)):
        cl = np.minimum(cl, round_cone(Q, V(ox, 0.005, oz - 0.004), V(ox * 1.05, 0.0018, oz + 0.004), 0.0012, 0.0004))
    return d, cl


def fleg(P):
    Q = mirror(P)
    x = XF
    # upper arm in the chest, the slender forearm, a small furry paw
    d = ellipsoid(Q, V(x - 0.004, 0.105, 0.074), V(0.019, 0.034, 0.025))
    d = smin(d, round_cone(Q, V(x, 0.082, 0.075), V(x, 0.026, 0.084), 0.0158, 0.0112), 0.014)
    return d


def fpaw(P):
    Q = mirror(P) - HAND
    d = ellipsoid(Q, V(0.0, 0.008, 0.0), V(0.0105, 0.0095, 0.017))
    d = smin(d, round_cone(Q, V(0.0, 0.02, -0.01), V(0.0, 0.01, -0.002), 0.0088, 0.009), 0.006)
    d = smax(d, -Q[:, 1] + 0.0004, 0.002)
    for ox in (-0.0036, 0.0, 0.0036):
        d = d + groove(Q[:, 0] - ox, 0.0009, 0.0007) * sstep(0.004, 0.012, Q[:, 2]) * sstep(0.003, 0.009, Q[:, 1])
    cl = np.full(len(P), 1.0, F)
    for ox, oz in ((-0.0054, 0.0145), (-0.0018, 0.0175), (0.0018, 0.0175), (0.0054, 0.0145)):
        cl = np.minimum(cl, round_cone(Q, V(ox, 0.0042, oz - 0.003), V(ox * 1.05, 0.0014, oz + 0.0035), 0.001, 0.00035))
    return d, cl


def tail(P):
    Q = mirror(P)
    d = ellipsoid(Q, TAILC, V(0.022, 0.024, 0.019))
    return smin(d, ellipsoid(Q, TAILC + V(0.0, -0.005, 0.013), V(0.018, 0.019, 0.016)), 0.01)


# ---------- assembled ----------
def parts(P):
    ca, li, ba, br = eye_parts(P)
    hf, hc = hfoot(P)
    fp, fc = fpaw(P)
    return {'trunk': trunk(P), 'neck': neck(P), 'head': head(P), 'ear': ear(P), 'lids': li, 'ball': ba, 'fleg': fleg(P), 'hleg': hleg(P),
            'foot': hf, 'hand': fp, 'claw': np.minimum(hc, fc), 'tail': tail(P)}


def shape(P):
    d = trunk(P)
    d = smin(d, local(P, (-0.07, 0.12, 0.04), (0.07, 0.26, 0.16), neck), 0.03)
    h = local(P, (-0.07, 0.16, 0.06), (0.07, 0.3, 0.235), head)
    ca, li, ba, br = local_n(P, (-0.06, 0.225, 0.12), (0.06, 0.27, 0.175), eye_parts, 4)
    h = smin(h, li, 0.003)
    h = smin(h, br, 0.006)
    h = smax(h, -ca, 0.0012)
    h = smin(h, ba, 0.0006)
    d = smin(d, h, 0.025)
    d = smin(d, local(P, (-0.075, 0.24, 0.06), (0.075, 0.4, 0.16), ear), 0.006)
    d = smin(d, local(P, (-0.085, 0.006, -0.16), (0.085, 0.18, 0.04), hleg), 0.02)
    hf, hc = local_n(P, (-0.085, -0.002, -0.145), (0.085, 0.04, 0.045), hfoot, 2)
    d = smin(d, hf, 0.012)
    d = np.minimum(d, hc)
    d = smin(d, local(P, (-0.065, 0.0, 0.03), (0.065, 0.145, 0.11), fleg), 0.016)
    fp, fc = local_n(P, (-0.06, -0.002, 0.06), (0.06, 0.035, 0.12), fpaw, 2)
    d = smin(d, fp, 0.006)
    d = np.minimum(d, fc)
    d = smin(d, local(P, (-0.04, 0.115, -0.21), (0.04, 0.19, -0.145), tail), 0.012)
    return d


def grid(h):
    """finer spacing across the ears (thin plates facing forward), the eyes and the muzzle"""
    from sdf import axis_steps
    lo, hi = BOUNDS
    xs = axis_steps(0.0, hi[0], [], h)
    ys = axis_steps(lo[1], hi[1], [], h)
    zs = axis_steps(lo[2], hi[2], [(0.07, 0.155, h * 0.45), (0.155, 0.225, h * 0.7)], h)
    return xs, ys, zs


PREVIEW = {
    'side': ((1.3, 0.2, 0.0), (0, 0.17, 0.0), 30),
    'front3q': ((0.75, 0.38, 0.8), (0, 0.17, 0.02), 30),
    'front': ((0.0, 0.25, 1.2), (0, 0.2, 0.0), 26),
    'rear3q': ((-0.7, 0.42, -0.8), (0, 0.16, -0.05), 30),
    'top': ((0.002, 1.3, 0.0), (0, 0.15, 0.0), 30),
    'face': ((0.14, 0.27, 0.48), (0, 0.235, 0.16), 24),
    'faceside': ((0.4, 0.25, 0.17), (0.0, 0.24, 0.16), 24),
    'feet': ((0.3, 0.06, 0.25), (0.05, 0.02, -0.03), 30),
    'ears': ((0.25, 0.35, 0.4), (0.0, 0.3, 0.12), 26),
    'muzzle': ((0.07, 0.23, 0.36), (0.0, 0.215, 0.2), 16),
}


# ---------- game mesh: decimation, texture layout, skinning ----------
KEEP = (0.44, 0.8, 0.6, 0.72, 0.62, 0.56, 0.5)


def keep(P):
    Pm = mirror(P)
    base = np.full(len(P), KEEP[0], F)
    e = sstep(0.022, 0.011, np.linalg.norm(Pm - EYE.c, axis=1)) * KEEP[1]
    L = HF.loc(Pm)
    hd = sstep(-0.01, 0.015, L[:, 2]) * sstep(0.18, 0.2, Pm[:, 1]) * KEEP[2]
    m = sstep(0.085, 0.1, L[:, 2]) * sstep(-0.035, -0.02, L[:, 1]) * KEEP[3]
    a, c, n = ear_coords(Pm)
    er = sstep(-0.004, 0.006, a) * sstep(0.03, 0.022, np.abs(c)) * sstep(0.012, 0.007, np.abs(n)) * KEEP[4]
    pw = sstep(0.022, 0.012, Pm[:, 1]) * KEEP[5]
    tl = sstep(0.03, 0.015, np.linalg.norm((Pm - TAILC) / V(1, 1, 1.2), axis=1)) * KEEP[6]
    return np.maximum.reduce([base, e, hd, m, er, pw, tl]).astype(F)


UV_AVERAGE = True


def uv_regions(P):
    """head, ears, neck and chest, trunk, haunch, front legs, hind feet, tail"""
    Pm = mirror(P)
    L = HF.loc(Pm)
    y, z = Pm[:, 1], Pm[:, 2]
    a, c, n = ear_coords(Pm)
    lab = np.full(len(P), 2)
    head = (L[:, 2] > 0.004) & (y > 0.17)
    earm = (a > 0.008) & (np.abs(c) < 0.04) & (y > 0.25)
    neck = ~head & (z > 0.06) & (y > 0.135)
    fleg = (z > 0.045) & (y < 0.105) & ~neck
    foot = (y < 0.03) & (z < 0.045) & (np.abs(Pm[:, 0] - XH) < 0.025)
    haunch = (np.abs(Pm[:, 0]) > 0.035) & (y < 0.17) & (y >= 0.03) & (z < 0.03) & (z > -0.15)
    tl = np.linalg.norm((Pm - TAILC) / V(1, 1, 1.2), axis=1) < 0.026
    lab[neck] = 1
    lab[head] = 0
    lab[earm] = 8
    lab[haunch] = 5
    lab[fleg] = 3
    lab[foot] = 6
    lab[tl] = 7
    return lab


def uv_weight(P):
    Pm = mirror(P)
    L = HF.loc(Pm)
    head = sstep(-0.01, 0.015, L[:, 2]) * sstep(0.17, 0.2, Pm[:, 1])
    a, c, n = ear_coords(Pm)
    er = sstep(0.0, 0.02, a) * (Pm[:, 1] > 0.25)
    under = sstep(0.09, 0.06, Pm[:, 1]) * sstep(0.04, 0.02, Pm[:, 0])
    return (0.92 + 0.75 * head + 0.2 * er - 0.2 * under).astype(F)


WEIGHT_SMOOTH = (5, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['head'], 'head': P['nose'], 'nose': HF.pt(0.118, 0.0),
         'tail1': TAILC + V(0, 0.005, -0.02)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = TOE * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (HAND + V(0, 0.004, 0.02)) * m
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
            pos = x > 0.004
            W[pos, l] += W[pos, r]; W[pos, r] = 0
            neg = x < -0.004
            W[neg, r] += W[neg, l]; W[neg, l] = 0
    side = lambda sg: x * sg > 0
    # ears ride on the ear bones, blending into the head at the root
    a, c, n = ear_coords(Pm)
    on = (ear(wpos) < 0.002) & (a > -0.006) & (y > 0.245)
    k = sstep(-0.004, 0.012, a)
    for s, sg in (('L', 1), ('R', -1)):
        CV.set_part(W, bi, on & side(sg), 'ear' + s, k)
    # the head (and the nose bone's muzzle) for everything in front of the neck above the throat
    L = HF.loc(Pm)
    hd = (L[:, 2] > -0.01) & (y > 0.19) & ~on
    CV.set_part(W, bi, hd, 'head', sstep(-0.01, 0.012, L[:, 2]))
    CV.set_part(W, bi, hd, 'nose', sstep(0.075, 0.1, L[:, 2]) * 0.8)
    # hind feet: the toes on the paw bone, the long sole on the metatarsus, the heel blending into the shin
    for s, sg in (('L', 1), ('R', -1)):
        ft = (np.abs(x - sg * XH) < 0.022) & (y < 0.036) & (z < 0.04) & (z > -0.145)
        CV.set_part(W, bi, ft, 'hmeta' + s, sstep(0.036, 0.024, y))
        CV.set_part(W, bi, ft, 'hpaw' + s, sstep(-0.03, -0.005, z) * sstep(0.03, 0.02, y))
        # the haunch on the thigh (outer side and back), the shin inside it
        hn = (np.abs(x) > 0.03) & side(sg) & (y > 0.03) & (y < 0.17) & (z < 0.025) & (z > -0.15) & (hleg(wpos) < 0.003)
        CV.set_part(W, bi, hn, 'thigh' + s, 0.7 * sstep(0.03, 0.05, y))
        # front paws: the paw bone, the wrist on the metacarpus
        fp = (np.abs(x - sg * XF) < 0.018) & (y < 0.03) & (z > 0.07) & (z < 0.12)
        CV.set_part(W, bi, fp, 'fmeta' + s, sstep(0.03, 0.018, y))
        CV.set_part(W, bi, fp, 'fpaw' + s, sstep(0.02, 0.01, y))
    # tail
    tl = np.linalg.norm((Pm - TAILC) / V(1, 1, 1.2), axis=1) < 0.026
    CV.set_part(W, bi, tl & (z < -0.16), 'tail1', sstep(-0.16, -0.175, z))
    s = W.sum(1, keepdims=True)
    return W / np.maximum(s, 1e-9)


# ---------- coat: direction, regions, paint ----------
def flow(P, N=None):
    """from the nose back over the head and down the cheeks, along the back from the shoulders to the rump and down
    the sides, down the legs and forward along the feet, out along the ears (the backs), out from the tail"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    one = np.ones_like(y)
    body = np.stack([0.3 * sstep(0.02, 0.06, x), -(0.15 + 0.9 * sstep(0.17, 0.1, y)), -one], 1)
    legd = np.stack([0 * y, -one, -0.1 * one], 1)
    footd = np.stack([0 * y, -0.15 * one, one], 1)
    L = HF.loc(Q)
    cheek = sstep(0.0, -0.025, L[:, 1]) * sstep(0.08, 0.04, L[:, 2])
    head = -HF.a[None, :] + np.stack([0.4 * sstep(0.004, 0.03, x) + 0.4 * cheek, -0.4 * cheek, 0 * y], 1)
    tl = Q - TAILC
    taild = tl / np.maximum(np.linalg.norm(tl, axis=1, keepdims=True), 1e-6) + V(0, 0.3, -0.5)[None, :]
    wh = sstep(-0.012, 0.015, L[:, 2]) * sstep(0.18, 0.205, y)
    wt = sstep(0.03, 0.02, np.linalg.norm((Q - TAILC) / V(1, 1, 1.2), axis=1)) * sstep(-0.155, -0.165, z)
    wf = sstep(0.03, 0.018, y) * sstep(0.03, 0.02, np.abs(x - XH)) * sstep(0.045, 0.03, z)
    wl = sstep(0.1, 0.06, y) * (1 - wh) * (1 - wt) * (1 - wf) * sstep(0.03, 0.05, z)
    wb = np.clip(1 - wh - wl - wt - wf, 0, 1)
    f = body * wb[:, None] + head * wh[:, None] + legd * wl[:, None] + taild * wt[:, None] + footd * wf[:, None]
    a, c, n = ear_coords(Q)
    we = sstep(-0.004, 0.012, a) * sstep(0.034, 0.024, np.abs(c)) * sstep(0.012, 0.008, np.abs(n)) * (y > 0.24)
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
    ring = np.sqrt((El[:, 0] / (EYE.lid_w + 0.002)) ** 2 + (ua / (EYE.lid_h + 0.0018)) ** 2)
    r['ring'] = ring
    r['lid'] = sstep(1.12, 0.9, ring) * (1 - r['ball']) * sstep(EYE.r + 0.007, EYE.r + 0.004, de)
    r['head'] = sstep(-0.012, 0.01, L[:, 2]) * sstep(0.004, 0.0, c['head']) * sstep(0.18, 0.2, y)
    r['nose'] = sstep(0.0012, 0.0, ellipsoid(L, V(0.0, -0.0015, NOSE_S + 0.0005), V(0.0072, 0.0062, 0.0052))) * sstep(NOSE_S - 0.006, NOSE_S - 0.002, L[:, 2]) * sstep(-0.0095, -0.006, L[:, 1])
    r['cleft'] = sstep(0.0016, 0.0005, np.abs(L[:, 0])) * sstep(-0.023, -0.019, L[:, 1]) * sstep(-0.004, -0.008, L[:, 1]) * sstep(0.098, 0.104, L[:, 2])
    lipu = -0.0215 - 0.001 * sstep(0.1, 0.088, L[:, 2])
    r['lip'] = sstep(0.0018, 0.0007, np.abs(L[:, 1] - lipu)) * sstep(0.084, 0.09, L[:, 2]) * r['head']
    a, cc, n = ear_coords(Pm)
    r['ea'], r['ec'], r['en'] = a, cc, n
    r['ear'] = sstep(0.0025, 0.0006, c['ear']) * sstep(0.0, 0.012, a) * sstep(0.245, 0.255, y)
    # the inside of the ear: the side facing the opening, inside the rims
    u = np.clip(a / EAR_L, 0, 1)
    hw = EAR_W * (0.74 * np.sqrt(np.clip(1 - ((u - 0.52) / 0.54) ** 2, 0, 1)) + 0.3 * (1 - u)) + 0.0008
    r['earU'], r['earK'] = u, cc / np.maximum(hw, 1e-4)
    r['earIn'] = sstep(-0.1, 0.4, Nm @ EAR_N) * sstep(0.95, 0.75, np.abs(r['earK']))
    r['foot'] = sstep(0.002, 0.0, c['foot']) * sstep(0.03, 0.02, y)
    r['hand'] = sstep(0.002, 0.0, c['hand']) * sstep(0.024, 0.016, y)
    r['claw'] = sstep(0.0005, 0.0, c['claw'])
    r['sole'] = sstep(-0.3, -0.8, N[:, 1]) * sstep(0.004, 0.0015, y)
    r['tail'] = sstep(0.004, 0.0, c['tail']) * sstep(-0.158, -0.168, z)
    r['top'] = sstep(0.3, 0.85, N[:, 1])
    return r


K = {
    'buff': hexc(0x8F7C66), 'brown': hexc(0x695645), 'dark': hexc(0x261E17), 'tip': hexc(0xC6B79E), 'gray': hexc(0x8A847A),
    'rust': hexc(0x9C6842), 'cinn': hexc(0x9C7652), 'white': hexc(0xF1EEE8), 'cream': hexc(0xE4DACB), 'throat': hexc(0xA8916F),
    'ring': hexc(0xD6C8B0), 'earBk': hexc(0x857462), 'earEdge': hexc(0x2C241D), 'earIn': hexc(0xD9A99C), 'earInDk': hexc(0xB97C74),
    'vein': hexc(0xA0524E), 'nose': hexc(0x8E6E66), 'noseDk': hexc(0x553E3A), 'lip': hexc(0x4B3A30), 'foot': hexc(0xC4B296),
    'claw': hexc(0xB8AA98), 'ball': hexc(0x0C0806),
}


def _lenk(Pm):
    L = HF.loc(Pm)
    hd = sstep(-0.012, 0.015, L[:, 2]) * sstep(0.18, 0.205, Pm[:, 1])
    lg = sstep(0.08, 0.04, Pm[:, 1]) * sstep(0.03, 0.05, Pm[:, 2])
    a, c, n = ear_coords(Pm)
    er = sstep(0.0, 0.012, a) * (Pm[:, 1] > 0.25)
    return np.clip(1.0 - 0.45 * hd - 0.4 * lg - 0.45 * er, 0.4, 1.5)


_scache = {}


def _strands(P, N, R):
    key = (len(P), float(P[:7].sum()))
    if key not in _scache:
        dens = 0.92 * (1 - R['nose']) * (1 - R['ball']) * (1 - R['claw']) * (1 - 0.6 * R['lip']) * (1 - 0.85 * R['ear'] * R['earIn']) * sstep(EYE.r + 0.0015, EYE.r + 0.004, R['eyeD'])
        _scache[key] = CV.strands(P, N, dens, flow, 0.0026, 0.004, 0.0075, 0.00042, seed=81, lenk=lambda Q: _lenk(mirror(Q)))
    return _scache[key]


def _markings(R, Pm, N):
    """white belly and throat edge, white tail underside, pale eye ring, whitish chin, rusty nape, the white star of
    the forehead (faint on adults), dark ear rims"""
    L = R['L']
    s, u = L[:, 2], L[:, 1]
    y, z = Pm[:, 1], Pm[:, 2]
    w1 = fbm(Pm * 260, 2, 41) - 0.5
    w2 = fbm(Pm * 70, 2, 42) - 0.5
    hd = R['head']
    up = N[:, 1]
    # belly: white below a soft line along the lower flanks, under the chest; the inner haunch pale
    line = -0.42 + 0.08 * w2 + 0.04 * w1 + 0.12 * sstep(0.04, 0.09, z)
    belly = sstep(line + 0.1, line - 0.1, up) * (1 - hd) * sstep(0.13, 0.1, y) * (1 - R['foot']) * (1 - R['tail'])
    # throat: a buff collar band in front of the neck, the chin and lower lips white
    throat = sstep(0.07, 0.1, z) * sstep(0.2, 0.16, y) * sstep(0.12, 0.14, y) * sstep(-0.1, -0.5, up) * (1 - hd)
    chin = sstep(-0.02, -0.03, u + 0.004 * w2) * sstep(0.06, 0.08, s) * hd
    ring = sstep(1.42 + 0.12 * w2, 1.15, R['ring']) * (1 - R['lid']) * (1 - R['ball']) * sstep(EYE.r + 0.012, EYE.r + 0.007, R['eyeD'])
    nape = sstep(0.06, 0.09, z) * sstep(0.2, 0.235, y) * sstep(0.2, 0.7, up) * sstep(0.012, 0.0, L[:, 2] - 0.005) * (1 - R['ear'])
    nape = np.maximum(nape, sstep(0.02, -0.012, L[:, 2]) * sstep(0.3, 0.7, up) * sstep(0.19, 0.22, y) * sstep(0.06, 0.085, z) * (1 - R['ear']))
    star = sstep(0.006 + 0.0015 * w2, 0.003, np.sqrt(Pm[:, 0] ** 2 + ((s - 0.05) * 0.8) ** 2)) * sstep(0.028, 0.034, u) * hd
    tail_w = R['tail'] * sstep(0.45, 0.0, N[:, 1] + 0.3 * N[:, 2])
    ear_rim = R['ear'] * sstep(0.62, 0.8, R['earU']) * sstep(0.75, 0.95, np.abs(R['earK'])) * (R['earK'] > 0)
    ear_tip = R['ear'] * sstep(0.9, 0.98, R['earU'])
    return dict(belly=belly, throat=throat, chin=chin, ring=ring, nape=nape, star=star, tail_w=tail_w, ear_rim=np.maximum(ear_rim, ear_tip * 0.7))


def _veins(R, Pm):
    """branching veins in the pink inside of the ear: a central vessel up the middle with side branches toward the rims"""
    u, k = R['earU'], R['earK']
    w = fbm(Pm * 600, 2, 61) - 0.5
    main = sstep(0.12, 0.03, np.abs(k - 0.05 + 0.08 * w)) * sstep(0.1, 0.2, u) * sstep(0.85, 0.7, u)
    # side branches: lines slanting up and out from the middle
    br = np.zeros_like(u)
    for j, t0 in enumerate((0.25, 0.38, 0.5, 0.62, 0.74)):
        for sg in (-1, 1):
            t = u - t0 - 0.12 * np.abs(k) * (1 + 0.3 * w)
            br = np.maximum(br, sstep(0.016, 0.004, np.abs(t)) * sstep(0.02, 0.12, k * sg) * sstep(0.8, 0.45, np.abs(k)))
    return np.clip(main * 0.9 + br * 0.6, 0, 1)


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y, z = Pm[:, 1], Pm[:, 2]
    M = _markings(R, Pm, N)
    n1 = fbm(Pm * 25, 3, 11)
    n2 = fbm(Pm * 120, 3, 12)
    col = np.tile(K['buff'], (len(P), 1))
    # darker brown along the back, grayer on the flanks
    col = mix(col, K['brown'], R['top'] * 0.55)
    col = mix(col, K['gray'], sstep(0.35, -0.1, N[:, 1]) * 0.25)
    col *= (0.92 + 0.16 * n1)[:, None]
    # rusty nape and front legs, cinnamon on the shoulders
    col = mix(col, K['rust'], M['nape'] * 0.85)
    fl = sstep(0.11, 0.07, y) * sstep(0.04, 0.06, z) * (1 - R['hand'])
    col = mix(col, K['cinn'], fl * 0.75)
    # head: buff cheeks, a grizzled forehead, pale muzzle
    col = mix(col, K['tip'], R['head'] * sstep(-0.004, -0.02, L[:, 1]) * sstep(0.03, 0.06, L[:, 2]) * 0.35)
    col = mix(col, K['cream'] * 0.95, R['head'] * sstep(0.088, 0.104, L[:, 2]) * sstep(-0.006, -0.012, L[:, 1]) * 0.6)
    col = mix(col, K['throat'], M['throat'] * 0.7)
    wcol = mix(np.tile(K['white'], (len(P), 1)), K['cream'], n2 * 0.5)
    col = mix(col, wcol, M['belly'])
    col = mix(col, wcol, M['chin'] * 0.9)
    col = mix(col, K['ring'], M['ring'] * 0.75)
    # feet: pale tan tops, whiter toward the toes
    col = mix(col, K['foot'], R['foot'] * 0.7 + R['hand'] * 0.5)
    # tail: brown on top, cotton white underneath and behind
    col = mix(col, K['white'], M['tail_w'])
    # ears: grizzled gray-brown backs with a black rim at the tip; pink skin inside with veins
    eb = R['ear'] * (1 - R['earIn'])
    col = mix(col, K['earBk'], eb * 0.6)
    ein = R['ear'] * R['earIn']
    skin = mix(np.tile(K['earIn'], (len(P), 1)), K['earInDk'], sstep(0.4, 0.05, R['earU']) * 0.6 + (n2 - 0.5) * 0.3)
    skin = mix(skin, K['vein'], _veins(R, Pm) * 0.75)
    col = mix(col, skin, ein)
    col = mix(col, K['earEdge'], M['ear_rim'] * 0.85)
    # the rims of the inside carry pale hairs
    col = mix(col, K['cream'], ein * sstep(0.55, 0.85, np.abs(R['earK'])) * 0.5)
    # nose leather, the cleft, lips, the dark eye rims
    col = mix(col, K['lip'], np.maximum(R['lip'] * 0.8, R['cleft'] * 0.6))
    col = mix(col, K['dark'], R['lid'] * 0.92)
    col = mix(col, mix(np.tile(K['nose'], (len(P), 1)), K['noseDk'], sstep(-0.2, -0.8, N[:, 1]) * 0.5 + sstep(0.2, 0.0, np.abs(N[:, 0])) * 0.0), R['nose'])
    col = mix(col, K['claw'], R['claw'])
    # agouti: each hair has a dark tip, a buff band and gray base; the strokes show the tips and the bands
    s, tone = _strands(P, N, R)
    coat = (1 - R['ear'] * R['earIn']) * (1 - M['belly'] * 0.7) * (1 - M['tail_w']) * (1 - R['nose'])
    dk = s * sstep(0.3, 0.15, tone) * coat
    lt = s * sstep(0.65, 0.85, tone) * coat
    col = mix(col, K['dark'], dk * 0.72 * (1 - M['ring'] * 0.7) * (1 - R['foot'] * 0.6))
    col = mix(col, K['tip'], lt * 0.5)
    col *= (1 + s * 0.12 * (tone - 0.5) - 0.04 * (1 - s))[:, None]
    col = mix(col, K['ball'], R['ball'])
    rough = 0.66 + 0.08 * (n2 - 0.5) - 0.3 * R['nose'] - 0.25 * R['lid'] - 0.15 * R['lip'] - 0.2 * R['claw'] - 0.12 * R['ear'] * R['earIn']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    h = np.zeros(len(P), F)
    s, tone = _strands(P, N, R)
    h += 0.00004 * s * (1 - R['ball']) * (1 - R['nose'])
    # veins raised a little on the inside of the ears
    h += 0.00002 * _veins(R, Pm) * R['ear'] * R['earIn']
    g1, _ = worley(Pm / 0.0005, 58)
    h -= 0.00002 * sstep(0.35, 0.1, g1) * R['nose']
    return h


def finish(C, ao, valid):
    return CV.finish(C, ao, valid, 0.45)


# ---------- coat: fur shells ----------
FUR = {'len': 0.03, 'n': 5, 'lean': 0.7, 'tile': 0.0014, 'babyLen': 1.35, 'babyLean': 0.4, 'shade': 0.62, 'quality': 80}


def fur(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y, z = Pm[:, 1], Pm[:, 2]
    ln = np.full(len(P), 0.021, F)
    ln = ln + 0.005 * sstep(-0.3, -0.8, N[:, 1]) * (1 - R['tail'])                 # belly
    ln = ln + 0.004 * sstep(0.2, 0.6, N[:, 1]) * sstep(-0.02, -0.1, z)             # rump
    leg = sstep(0.08, 0.04, y) * sstep(0.03, 0.05, z)
    ln = ln * (1 - leg * 0.55)
    hd = R['head']
    ln = ln * (1 - hd) + hd * (0.007 + 0.009 * sstep(0.05, 0.025, L[:, 2]) * sstep(0.0, -0.02, L[:, 1]) + 0.003 * sstep(0.04, 0.01, L[:, 2]) - 0.003 * sstep(0.085, 0.105, L[:, 2]))
    er = R['ear']
    ln = ln * (1 - er) + er * (0.0035 * (1 - R['earIn']) + R['earIn'] * 0.004 * sstep(0.6, 0.9, np.abs(R['earK'])))
    ft = np.maximum(R['foot'], R['hand'])
    ln = ln * (1 - ft) + ft * 0.009
    tl = R['tail']
    ln = ln * (1 - tl) + tl * 0.03
    ln = ln * (1 - R['nose']) * (1 - R['lip']) * (1 - R['claw']) * (1 - R['cleft']) * sstep(EYE.r + 0.0015, EYE.r + 0.005, R['eyeD'])
    dens = np.ones(len(P), F) * (1 - 0.35 * hd * sstep(0.09, 0.11, L[:, 2])) * (1 - 0.6 * er * R['earIn'])
    return np.clip(ln, 0, FUR['len']).astype(F), dens


MAP_QUALITY = (74, 72)
PAD_SMOOTH = 3


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': CV.lid_color(col, R['eyeD'], EYE.r)}


def meta(st):
    p, r, d, lid = EYE.meta()
    return {
        # a round eye open wide: the game's lids stay out of sight until it blinks
        'eye': {'p': p, 'r': r, 'dir': d, 'lid': [1.1, -1.1, 0.1], 'iris': 0x2A1A10, 'irisR': 0.96, 'pupilR': 0.6, 'rim': 0x0A0604,
                'lidCol': 0x4C4036, 'babyLidCol': 0x483C32},
        'collar': {'at': ['neck', 'head', 0.45]},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.16, 0.12, 0.08], 'flat': 0x8A7158,
    }


# ---------- kits: a darker, more even fuzz with the white star ----------
BABY_TEX = 384


def baby_paint(P, N, c, col):
    R = _regions(P, N, c)
    Pm = R['Pm']
    M = _markings(R, Pm, N)
    n2 = fbm(Pm * 120, 3, 12)
    kit = mix(np.tile(hexc(0x6B5843), (len(P), 1)), hexc(0x85705A), n2)
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['claw'] + R['ear'] * R['earIn'] + M['belly'] + M['tail_w'], 0, 1)
    out = mix(col, kit, 0.45 * (1 - keep))
    out = mix(out, hexc(0xEDE6DA), M['star'] * 0.8)
    return np.clip(out, 0, 1).astype(F)


# ---------- hair cards: whiskers ----------
HAIR = {'size': (64, 128), 'cols': 2, 'base': (0.1, 0.085, 0.07), 'hi': (0.5, 0.47, 0.43), 'tip': (0.78, 0.76, 0.72), 'strands': 18,
        'root': 1.0, 'rough': 0.45, 'alpha': 0.35, 'seed': 9, 'quality': 80}


def cards():
    rows = []
    for i in range(7):
        t = i / 6
        s0 = 0.098 + 0.01 * (i % 3) / 2 + 0.002 * (rnd(i, 1) - 0.5)
        u0 = -0.008 - 0.004 * (i // 3) + 0.0015 * (rnd(i, 2) - 0.5)
        root = HF.pt(s0, u0, 0.0105 - 0.002 * (i % 3) / 2)
        d = nrm(V(0.8, 0.0, 0.0) + HF.a * (-0.3 + 0.35 * (i % 3) / 2) + HF.u * (0.15 - 0.2 * (i // 3)) + V(0, 0.1 * (rnd(i, 3) - 0.5), 0))
        rows.append((root, d, 0.045 + 0.02 * rnd(i, 4), 0.0009, 0.12, i % 2))
    # two long hairs over each eye
    for i in range(2):
        root = EYE.c + V(-0.004 + 0.006 * i, 0.011, 0.002)
        rows.append((root, nrm(V(0.6, 0.6, -0.2 + 0.3 * i)), 0.03, 0.0008, 0.05, 1))
    out = []
    for sg in (1, -1):
        m = V(sg, 1, 1)
        out += CV.whiskers([(root * m, d * m, ln, w, droop, col) for root, d, ln, w, droop, col in rows])
    roots = np.array([cd['pts'][0] for cd in out], F)
    g = CV.gradient(shape, roots)
    dd = shape(roots)
    for cd, gg, d0 in zip(out, g, dd):
        cd['pts'][0] = cd['pts'][0] - gg * (d0 + 0.0006)
    return out
