# North American river otter, sculpted as a signed distance field around the game's otter skeleton
# (tools/blender/work/otter-rig.json). Units are meters in game rig space (x left, y up, z forward, ground at y = 0).
# A long streamlined body, a broad flat head with whisker pads, small eyes set high and small round ears, short legs
# with webbed feet, and a thick tapering tail; then a sleek dense coat that looks wet (spiky clumps, glossy), a paler
# throat, whiskers as hair cards. The tail and the long body get extra rings so they bend when swimming.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length
import carnivore as CV
from carnivore import local, local_n, mirror, groove, mix, hexc, rnd, wsum

ID = 'otter'
BOUNDS = (V(-0.13, 0.0, -0.74), V(0.13, 0.27, 0.47))
BAKE_DIST = (0.005, 0.016, 0.04)
DISSOLVE_DEGENERATE = True
TAIL_RINGS = 0

# ---------- landmarks (left side, +x) ----------
HF = CV.Frame(V(0.0, 0.182, 0.27), V(0.0, -0.12, 1.0), V(0.0, 1.0, 0.0))
EYE = CV.Eye(HF.pt(0.076, 0.018, 0.038), 0.0074, V(0.55, 0.42, 0.72), lid_w=0.0072, lid_h=0.0056, off=0.0006, slant=0.05,
             mound=(0.0028, 0.0024, 0.001), sink=0.25)
NOSE_S = 0.145
MOUTH = HF.pt(0.13, -0.028)
EAR_B = V(0.052, 0.205, 0.292)
EAR_A = nrm([0.55, 0.8, -0.25])
EAR_N = nrm([0.55, -0.2, 0.8])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
EAR_L, EAR_W = 0.016, 0.0115
XF, XH = 0.06, 0.066
HAND = V(XF, 0.0, 0.17)
FOOT = V(XH, 0.0, -0.105)
PATCHES = [
    (EYE.c * V(0, 1, 1) + V(0.028, -0.014, -0.014), EYE.c * V(0, 1, 1) + V(0.062, 0.014, 0.016), 0.0005),   # eye and lids
    (HF.pt(0.105, 0.0) * V(0, 1, 1) + V(0.0, -0.04, 0.0), HF.pt(0.157, 0.0) * V(0, 1, 1) + V(0.045, 0.02, 0.008), 0.0006),  # muzzle
    (V(0.04, 0.19, 0.27), V(0.085, 0.235, 0.31), 0.0006),                                                     # ear
    (V(0.025, -0.001, 0.135), V(0.1, 0.025, 0.225), 0.0006),                                                  # hand
    (V(0.02, -0.001, -0.17), V(0.115, 0.025, -0.045), 0.0006),                                                # hind foot
]

# trunk: z, top, yw (height of widest), bottom, half width, exponents
TRUNK = [
    (-0.32, 0.18, 0.145, 0.112, 0.036, 2.0, 2.0),
    (-0.27, 0.203, 0.149, 0.1, 0.054, 2.1, 2.0),
    (-0.22, 0.222, 0.152, 0.09, 0.067, 2.2, 2.0),
    (-0.14, 0.232, 0.156, 0.086, 0.073, 2.2, 2.0),
    (-0.06, 0.233, 0.155, 0.083, 0.075, 2.2, 2.0),
    (0.02, 0.227, 0.15, 0.08, 0.074, 2.2, 2.0),
    (0.1, 0.217, 0.145, 0.078, 0.07, 2.2, 2.0),
    (0.17, 0.208, 0.143, 0.08, 0.064, 2.1, 2.0),
    (0.22, 0.205, 0.147, 0.09, 0.06, 2.0, 2.0),
]
NECK = [
    (0.16, 0.15, 0.058, 0.066, 0.064, 2.0, 2.0),
    (0.168, 0.22, 0.054, 0.06, 0.06, 2.0, 2.0),
    (0.176, 0.27, 0.047, 0.055, 0.055, 2.0, 2.0),
]
# head: along the head frame (s), top, height of widest, bottom, half width, exponents; broad and flat
HEAD = [
    (0.0, 0.029, -0.006, -0.045, 0.05, 2.6, 2.0),
    (0.03, 0.033, -0.006, -0.047, 0.055, 2.9, 2.0),
    (0.06, 0.031, -0.005, -0.043, 0.053, 3.0, 2.1),
    (0.085, 0.027, -0.006, -0.037, 0.048, 2.9, 2.2),
    (0.108, 0.0235, -0.007, -0.031, 0.043, 2.8, 2.3),
    (0.126, 0.0205, -0.007, -0.026, 0.039, 2.7, 2.3),
    (0.138, 0.0165, -0.006, -0.021, 0.034, 2.6, 2.3),
    (0.146, 0.011, -0.005, -0.015, 0.026, 2.4, 2.2),
    (0.151, 0.004, -0.004, -0.009, 0.016, 2.2, 2.2),
]
FORE = [
    (0.14, 0.165, 0.026, 0.03, 0.024, 2.2, 2.2, 0.043),
    (0.1, 0.152, 0.025, 0.029, 0.023, 2.2, 2.2, 0.055),
    (0.066, 0.146, 0.021, 0.024, 0.02, 2.2, 2.2, 0.06),
    (0.04, 0.152, 0.017, 0.018, 0.016, 2.2, 2.2, 0.06),
    (0.02, 0.16, 0.0145, 0.0145, 0.0145, 2.2, 2.2, 0.06),
    (0.009, 0.165, 0.012, 0.012, 0.0135, 2.2, 2.2, 0.06),
]
HIND = [
    (0.168, -0.14, 0.036, 0.044, 0.026, 2.2, 2.2, 0.045),
    (0.12, -0.115, 0.034, 0.04, 0.028, 2.2, 2.2, 0.06),
    (0.08, -0.098, 0.027, 0.032, 0.025, 2.2, 2.2, 0.065),
    (0.05, -0.12, 0.02, 0.024, 0.019, 2.2, 2.2, 0.066),
    (0.03, -0.142, 0.017, 0.019, 0.0165, 2.2, 2.2, 0.066),
    (0.012, -0.15, 0.014, 0.014, 0.0155, 2.2, 2.2, 0.066),
]
# tail: path (y, z), radius; flattened top to bottom
TAIL = [(0.153, -0.16, 0.05), (0.15, -0.21, 0.055), (0.146, -0.25, 0.052), (0.135, -0.31, 0.046), (0.12, -0.38, 0.036), (0.102, -0.46, 0.027),
        (0.085, -0.54, 0.019), (0.071, -0.61, 0.0125), (0.062, -0.67, 0.0075), (0.058, -0.705, 0.003)]
TAIL_Z0, TAIL_Z1 = -0.205, -0.708


def _tail_keys():
    return [(y, z, r * 0.86, r * 0.86, r * 1.14, 2.0, 2.0) for y, z, r in TAIL]


def trunk(P):
    Q = mirror(P)
    d = loft(Q, TRUNK)
    d = smin(d, ellipsoid(Q, V(0.03, 0.15, 0.15), V(0.026, 0.038, 0.045)), 0.05)    # shoulders
    d = smin(d, ellipsoid(Q, V(0.032, 0.15, -0.13), V(0.028, 0.05, 0.07)), 0.06)    # haunches
    return d


def neck(P):
    Q = mirror(P)
    d = sweep(Q, NECK)
    return d


def head(P):
    Q = mirror(P)
    L = HF.loc(Q)
    d = loft(L, HEAD)
    # whisker pads: big round pads on the upper lip
    d = smin(d, ellipsoid(L, V(0.0175, -0.013, 0.124), V(0.015, 0.0125, 0.017)), 0.007)
    # cheeks below the eyes, the brow over them
    d = smin(d, ellipsoid(L, V(0.036, -0.02, 0.055), V(0.016, 0.018, 0.03)), 0.012)
    d = smin(d, round_cone(L, V(0.024, 0.024, 0.074), V(0.034, 0.022, 0.077), 0.005, 0.004), 0.008)
    # lower jaw and chin
    d = smin(d, ellipsoid(L, V(0.0, -0.026, 0.106), V(0.013, 0.0065, 0.022)), 0.008)
    # nose pad: broad, hairless
    d = smin(d, ellipsoid(L, V(0.0, 0.003, NOSE_S), V(0.012, 0.0076, 0.006)), 0.003)
    M = L * V(1, 2.5, 1)
    m = round_cone(M, V(0.0, -0.0215 * 2.5, NOSE_S - 0.004), V(0.012, -0.025 * 2.5, 0.132), 0.0014, 0.0014)
    m = smin(m, round_cone(M, V(0.012, -0.025 * 2.5, 0.132), V(0.022, -0.028 * 2.5, 0.105), 0.0014, 0.0008), 0.002)
    d = smax(d, -(m + 0.0008) / 2.5, 0.0015)
    nc = V(0.0058, 0.002, NOSE_S + 0.0042)
    n1 = ellipsoid(L, nc, V(0.0022, 0.0012, 0.0026))
    d = smax(d, -n1, 0.0008)
    d = d + groove(L[:, 0], 0.0011, 0.0008) * sstep(NOSE_S - 0.003, NOSE_S + 0.003, L[:, 2]) * sstep(-0.004, -0.008, L[:, 1])
    return d


def eye_parts(P):
    return EYE.parts(mirror(P))


def ear(P):
    Q = mirror(P)
    return CV.ear(Q, EAR_B, EAR_A, EAR_N, EAR_L, EAR_W, 'round', th0=0.0055, th1=0.003, cup=0.4, base_r=(0.008, 0.006, 0.005))


def fleg(P):
    Q = mirror(P)
    x = XF
    d = sweep(Q, FORE, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(x - 0.005, 0.11, 0.143), V(0.024, 0.035, 0.026)), 0.02)
    return d


def hleg(P):
    Q = mirror(P)
    x = XH
    d = sweep(Q, HIND, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(0.058, 0.12, -0.135), V(0.03, 0.05, 0.05)), 0.035)
    d = smin(d, ellipsoid(Q, V(x, 0.022, -0.155), V(0.013, 0.016, 0.014)), 0.01)        # heel
    return d


# digits: (angle from forward toward +x, base distance, length, radius)
FINGERS = [(-42, 0.01, 0.013, 0.0042), (-18, 0.012, 0.017, 0.0045), (0, 0.013, 0.019, 0.0046), (18, 0.012, 0.018, 0.0045), (38, 0.01, 0.015, 0.0042)]
TOES = [(-36, 0.012, 0.022, 0.0048), (-15, 0.014, 0.028, 0.005), (3, 0.015, 0.031, 0.0051), (21, 0.014, 0.029, 0.005), (40, 0.012, 0.024, 0.0048)]


def paws(P):
    Q = mirror(P)
    a, ca = CV.hand(Q, HAND, FINGERS, (0.016, 0.0085, 0.016), yaw=0.1, claw=(0.0022, 0.001), palm_c=(0.0, -0.004))
    a = smin(a, CV.web(Q, HAND, FINGERS, yaw=0.1, reach=0.7), 0.003)
    b, cb = CV.hand(Q, FOOT, TOES, (0.018, 0.0095, 0.035), yaw=0.05, claw=(0.0022, 0.001), palm_c=(0.0, -0.025))
    b = smin(b, CV.web(Q, FOOT, TOES, yaw=0.05, reach=0.78), 0.003)
    return np.minimum(a, b), np.minimum(ca, cb)


def tail(P):
    return sweep(mirror(P), _tail_keys())


def parts(P):
    ca, li, ba = eye_parts(P)
    pw, cl = paws(P)
    return {'trunk': trunk(P), 'neck': neck(P), 'head': head(P), 'ear': ear(P), 'lids': li, 'ball': ba, 'fleg': fleg(P), 'hleg': hleg(P),
            'paw': pw, 'claw': cl, 'tail': tail(P)}


def shape(P):
    d = trunk(P)
    d = smin(d, local(P, (-0.13, 0.04, 0.05), (0.13, 0.27, 0.34), neck), 0.05)
    h = local(P, (-0.11, 0.09, 0.2), (0.11, 0.26, 0.47), head)
    ca, li, ba = local_n(P, (-0.07, 0.17, 0.32), (0.07, 0.23, 0.39), eye_parts, 3)
    h = smin(h, li, 0.004)
    h = smax(h, -ca, 0.0015)
    h = smin(h, ba, 0.0008)
    d = smin(d, h, 0.035)
    d = smin(d, local(P, (-0.1, 0.17, 0.25), (0.1, 0.25, 0.34), ear), 0.005)
    fl = local(P, (-0.12, -0.01, 0.08), (0.12, 0.2, 0.26), fleg)
    d = smin(d, fl, 0.03)
    hl = local(P, (-0.13, -0.01, -0.24), (0.13, 0.22, -0.03), hleg)
    d = smin(d, hl, 0.035)
    pw, cl = local_n(P, (-0.12, -0.01, -0.18), (0.12, 0.035, 0.24), paws, 2)
    d = smin(d, pw, 0.007)
    d = np.minimum(d, cl)
    d = smin(d, local(P, (-0.1, 0.0, -0.74), (0.1, 0.26, -0.04), tail), 0.05)
    return d


PREVIEW = {
    'side': ((2.4, 0.2, -0.13), (0, 0.13, -0.13), 30),
    'front3q': ((1.3, 0.45, 1.3), (0, 0.12, -0.08), 30),
    'front': ((0.0, 0.25, 1.9), (0, 0.15, 0.0), 26),
    'rear3q': ((-1.2, 0.6, -1.5), (0, 0.12, -0.2), 30),
    'top': ((0.01, 2.2, -0.13), (0, 0.15, -0.13), 30),
    'face': ((0.2, 0.25, 0.85), (0, 0.17, 0.36), 24),
    'faceside': ((0.55, 0.2, 0.36), (0.0, 0.17, 0.36), 24),
    'feet': ((0.4, 0.08, 0.4), (0.06, 0.02, 0.0), 32),
    'hind': ((0.35, 0.12, -0.45), (0.066, 0.01, -0.1), 26),
    'headtop': ((0.05, 0.8, 0.36), (0, 0.17, 0.36), 24),
}


# ---------- game mesh ----------
KEEP = (0.44, 0.82, 0.58, 0.72, 0.55, 0.58, 0.42)


def keep(P):
    Pm = mirror(P)
    tl = sstep(-0.22, -0.27, Pm[:, 2])
    base = KEEP[0] + (KEEP[6] - KEEP[0]) * tl
    e = sstep(0.024, 0.011, np.linalg.norm(Pm - EYE.c, axis=1)) * KEEP[1]
    L = HF.loc(Pm)
    hd = sstep(-0.01, 0.02, L[:, 2]) * sstep(0.1, 0.12, Pm[:, 1]) * KEEP[2]
    m = sstep(0.1, 0.125, L[:, 2]) * sstep(-0.05, -0.04, L[:, 1]) * KEEP[3]
    a, c, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    er = sstep(-0.008, 0.0, a) * sstep(0.02, 0.012, np.abs(c)) * sstep(0.012, 0.006, np.abs(n)) * KEEP[4]
    pw = sstep(0.024, 0.014, Pm[:, 1]) * KEEP[5]
    return np.maximum.reduce([base, e, hd, m, er, pw]).astype(F)


def lowpoly_fix(bm, hi):
    """rings across the long body and the tail every few centimeters, so the swimming wave bends them smoothly"""
    import meshfix as MX
    tr = MX.tree(hi)
    # body: cut planes across z (only faces of the trunk, away from the legs and the head)
    MX.rings(bm, tr, (0.0, 0.16, 0.2), (0.0, 0.16, -0.2), 0.045, lambda c, p0, r: c.y > 0.045 and r < 0.13)
    # tail: along its path
    pts = [V(0, y, z) for y, z, _ in TAIL]
    for a, b in zip(pts[:-1], pts[1:]):
        MX.rings(bm, tr, a, b, 0.036, lambda c, p0, r: r < 0.08 and c.z < -0.2)
    MX.finish(bm)


UV_AVERAGE = True


def uv_regions(P):
    Pm = mirror(P)
    L = HF.loc(Pm)
    y, z = Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 2)
    head = (L[:, 2] > 0.0) & (y > 0.1)
    neck = ~head & (z > 0.17)
    fleg = (z > 0.05) & (y < 0.085)
    hleg = (z <= 0.05) & (y < 0.085) & (z > -0.22)
    tail = (z < -0.24)
    lab[neck] = 1
    lab[head] = 0
    lab[fleg] = 3
    lab[fleg & (y < 0.02)] = 4
    lab[hleg] = 5
    lab[hleg & (y < 0.02)] = 6
    lab[tail] = 7
    return lab


def uv_weight(P):
    Pm = mirror(P)
    L = HF.loc(Pm)
    head = sstep(-0.01, 0.02, L[:, 2]) * sstep(0.1, 0.12, Pm[:, 1])
    paw = sstep(0.035, 0.015, Pm[:, 1])
    under = sstep(0.09, 0.07, Pm[:, 1]) * sstep(0.04, 0.02, Pm[:, 0])
    return (0.92 + 0.75 * head + 0.3 * paw - 0.25 * under).astype(F)


WEIGHT_SMOOTH = (5, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['head'], 'head': HF.pt(0.146, 0.0),
         'tail1': P['tail2'], 'tail2': P['tail3'], 'tail3': V(0, 0.058, -0.71)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, 0.005, 0.05)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (HAND + V(0, 0.005, 0.035)) * m
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
    on = (ear(wpos) < 0.0015) & (a > -0.002)
    k = sstep(-0.002, 0.006, a)
    for s, sg in (('L', 1), ('R', -1)):
        CV.set_part(W, bi, on & (x * sg > 0), 'ear' + s, k)
    for s, sg in (('L', 1), ('R', -1)):
        near = (np.abs(x - sg * HAND[0]) < 0.04) & (wpos[:, 2] > HAND[2] - 0.012) & (wpos[:, 2] < HAND[2] + 0.07) & (wpos[:, 1] < 0.02)
        CV.set_part(W, bi, near, 'fpaw' + s, sstep(0.02, 0.01, wpos[:, 1]) * sstep(HAND[2] - 0.012, HAND[2] + 0.006, wpos[:, 2]))
        near = (np.abs(x - sg * FOOT[0]) < 0.045) & (wpos[:, 2] > FOOT[2] - 0.015) & (wpos[:, 2] < FOOT[2] + 0.08) & (wpos[:, 1] < 0.02)
        CV.set_part(W, bi, near, 'hpaw' + s, sstep(0.02, 0.01, wpos[:, 1]) * sstep(FOOT[2] - 0.015, FOOT[2] + 0.008, wpos[:, 2]))
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


def flow(P, N=None):
    """sleek: from the nose back over the head and along the body to the tail tip, down the legs"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    one = np.ones_like(y)
    body = np.stack([0.15 * sstep(0.03, 0.08, x), -(0.08 + 0.5 * sstep(0.17, 0.09, y)), -one], 1)
    legd = np.stack([0 * y, -one, -0.1 * one], 1)
    L = HF.loc(Q)
    head = -HF.a[None, :] + np.stack([0.25 * sstep(0.01, 0.04, x), -0.15 * sstep(0.0, -0.03, L[:, 1]), 0 * y], 1)
    taild = tail_dir(z)
    wh = sstep(0.0, 0.04, L[:, 2])
    wt = sstep(-0.2, -0.26, z)
    wl = sstep(0.085, 0.06, y) * (1 - wh) * (1 - wt) * sstep(0.02, 0.05, x)
    wb = np.clip(1 - wh - wl - wt, 0, 1)
    f = body * wb[:, None] + head * wh[:, None] + legd * wl[:, None] + taild * wt[:, None]
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
    ring = np.sqrt((El[:, 0] / (EYE.lid_w + 0.0022)) ** 2 + (ua / (EYE.lid_h + 0.002)) ** 2)
    r['lid'] = sstep(1.15, 0.9, ring) * (1 - r['ball']) * sstep(EYE.r + 0.007, EYE.r + 0.004, de)
    r['head'] = sstep(-0.01, 0.01, L[:, 2]) * sstep(0.004, 0.0, c['head'])
    r['nose'] = sstep(0.0012, 0.0, ellipsoid(L, V(0.0, 0.003, NOSE_S), V(0.0127, 0.0082, 0.0066))) * sstep(NOSE_S - 0.007, NOSE_S - 0.003, L[:, 2])
    lipu = -0.0215 - 0.0065 * sstep(0.14, 0.105, L[:, 2])
    r['lip'] = sstep(0.003, 0.0012, np.abs(L[:, 1] - lipu)) * sstep(0.1, 0.108, L[:, 2]) * r['head']
    a, cc, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    r['ear'] = sstep(0.002, 0.0005, c['ear']) * sstep(-0.003, 0.003, a)
    r['paw'] = sstep(0.003, 0.0, c['paw']) * sstep(0.024, 0.014, y)
    r['pad'] = sstep(-0.2, -0.75, N[:, 1]) * sstep(0.004, 0.0012, y)
    r['claw'] = sstep(0.0008, 0.0, c['claw'])
    r['tail'] = sstep(0.006, 0.0, c['tail']) * sstep(-0.2, -0.24, z)
    r['top'] = sstep(0.3, 0.85, N[:, 1])
    return r


K = {
    'brown': hexc(0x3F2C20), 'brownDk': hexc(0x2A1D15), 'brownHi': hexc(0x5E4532), 'throat': hexc(0xA79580), 'throatDk': hexc(0x7E6A57),
    'belly': hexc(0x4F3C2D), 'nose': hexc(0x171312), 'lip': hexc(0x2A211D), 'claw': hexc(0x3A322C), 'skin': hexc(0x2E2622), 'ball': hexc(0x0C0806),
    'pad': hexc(0x6B5A4C),
}

_scache = {}


def _clumps(P, N, R):
    """the wet coat: the hair stuck together in spiky clumps along the flow"""
    key = (len(P), float(P[:7].sum()))
    if key not in _scache:
        dens = 0.95 * (1 - R['nose']) * (1 - R['ball']) * (1 - R['claw']) * (1 - R['pad'] * R['paw']) * (1 - 0.7 * R['lip']) * sstep(EYE.r + 0.002, EYE.r + 0.005, R['eyeD'])
        lk = lambda Q: np.clip(1.0 - 0.45 * sstep(0.0, 0.04, HF.loc(mirror(Q))[:, 2]) - 0.4 * sstep(0.07, 0.03, mirror(Q)[:, 1]), 0.4, 1.2)
        cl = CV.strands(P, N, dens, flow, 0.0045, 0.006, 0.0105, 0.0013, seed=74, lenk=lk)
        fine = CV.strands(P, N, dens, flow, 0.0022, 0.0028, 0.005, 0.00045, seed=75, lenk=lk)
        _scache[key] = (cl, fine)
    return _scache[key]


def _markings(R, Pm, N):
    L = R['L']
    s, u = L[:, 2], L[:, 1]
    y, z = Pm[:, 1], Pm[:, 2]
    w2 = fbm(Pm * 45, 2, 42) - 0.5
    hd = R['head']
    # the pale throat and cheeks: lips, chin, the front of the throat, fading down the neck
    line_h = -0.012 + 0.006 * sstep(0.12, 0.17, s) + 0.006 * w2
    face_p = sstep(line_h + 0.003, line_h - 0.004, u) * hd
    throat = sstep(-0.2, -0.65, N[:, 1] - 0.3 * N[:, 2]) * sstep(0.12, 0.26, z) * sstep(0.04 + 0.01 * w2, 0.03, np.abs(Pm[:, 0]) - 0.012) * (1 - hd)
    throat = throat + sstep(-0.3, -0.8, N[:, 1]) * sstep(0.18, 0.28, z) * (1 - hd) * 0.6
    pale = np.clip(np.maximum(face_p, throat), 0, 1)
    belly = sstep(-0.3, -0.8, N[:, 1]) * sstep(0.2, 0.0, z) * sstep(-0.22, -0.15, z)
    return dict(pale=pale, belly=belly)


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y, z = Pm[:, 1], Pm[:, 2]
    M = _markings(R, Pm, N)
    n1 = fbm(Pm * 9, 3, 11)
    n2 = fbm(Pm * 40, 3, 12)
    col = np.tile(K['brown'], (len(P), 1))
    col = mix(col, K['brownDk'], R['top'] * 0.5)
    col = mix(col, K['brownHi'], sstep(0.3, 0.8, np.abs(N[:, 0])) * sstep(-0.3, 0.3, N[:, 1]) * 0.3)
    col = mix(col, K['belly'], M['belly'] * 0.5)
    col *= (0.93 + 0.14 * n1)[:, None]
    col = mix(col, mix(np.tile(K['throat'], (len(P), 1)), K['throatDk'], n2), M['pale'] * 0.85)
    col = mix(col, K['brownDk'], sstep(0.05, 0.02, y) * (1 - R['tail']) * 0.5)
    col = mix(col, K['lip'], R['lip'] * 0.8)
    col = mix(col, K['brownDk'] * 0.6, R['lid'])
    col = mix(col, K['nose'] * (0.85 + 0.3 * n2[:, None]), R['nose'])
    col = mix(col, K['skin'], R['pad'] * R['paw'])
    col = mix(col, K['claw'], R['claw'])
    cl, fine = _clumps(P, N, R)
    cs, ct = cl
    fs, ft = fine
    # clumps: a lighter wet ridge, dark partings between them; fine guard hairs over them
    col *= (1 + 0.28 * cs - 0.22 * (1 - cs) * (1 - R['nose']) + 0.08 * fs * (ft - 0.4))[:, None]
    col = mix(col, K['ball'], R['ball'])
    # glossy: a wet coat reflects
    rough = 0.4 + 0.08 * (n2 - 0.5) + 0.12 * (1 - cs) - 0.1 * R['nose'] - 0.2 * R['lid'] + 0.15 * R['pad'] * R['paw'] - 0.1 * R['claw']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    h = np.zeros(len(P), F)
    cl, fine = _clumps(P, N, R)
    h += (0.00026 * cl[0] + 0.00004 * fine[0]) * (1 - R['ball']) * (1 - R['nose']) * (1 - R['pad'] * R['paw'])
    g1, _ = worley(Pm / 0.0008, 58)
    h -= 0.00004 * sstep(0.35, 0.1, g1) * R['nose']
    g2, _ = worley(Pm / 0.001, 59)
    h += 0.00006 * sstep(0.1, 0.5, g2) * R['pad'] * R['paw']
    return h


def finish(C, ao, valid):
    return CV.finish(C, ao, valid, 0.4)


# short dense coat lying flat (wet); pups: dry, fluffy
FUR = {'len': 0.011, 'n': 4, 'lean': 1.6, 'tile': 0.0016, 'babyLen': 1.5, 'babyLean': 0.9, 'shade': 0.7, 'quality': 80}


def fur(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y = Pm[:, 1]
    ln = np.full(len(P), 0.0095, F)
    ln = ln * (1 - 0.35 * sstep(0.07, 0.03, y) * (1 - R['tail']))
    hd = R['head']
    ln = ln * (1 - hd * 0.4) * (1 - R['paw'] * 0.8) * (1 - R['ear'] * 0.5)
    ln = ln * (1 - 0.5 * hd * sstep(0.14, 0.165, L[:, 2]))
    ln = ln * (1 - R['nose']) * (1 - R['lip']) * (1 - R['claw']) * (1 - R['pad'] * R['paw']) * sstep(EYE.r + 0.0015, EYE.r + 0.004, R['eyeD'])
    dens = np.ones(len(P), F)
    return np.clip(ln, 0, FUR['len']).astype(F), dens


MAP_QUALITY = (74, 72)
PAD_SMOOTH = 4


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': CV.lid_color(col, R['eyeD'], EYE.r)}


def meta(st):
    p, r, d, lid = EYE.meta()
    return {
        'eye': {'p': p, 'r': r, 'dir': d, 'lid': lid, 'iris': 0x1E140D, 'irisR': 0.95, 'pupilR': 0.55, 'rim': 0x0A0705, 'lidCol': st['lidCol']},
        'collar': {'at': ['neck', 'head', 0.3], 'lift': 0.3},
        'belly': [0.0, 0.08, -0.12],
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.05, 1.04, 1.03],
        'rim': [0.1, 0.08, 0.06], 'flat': 0x3E2B1E,
    }


# ---------- pups: a dry, soft, even darker coat (no wet clumps) ----------
BABY_TEX = 512


def baby_paint(P, N, c, col):
    R = _regions(P, N, c)
    cl, fine = _clumps(P, N, R)
    cs = cl[0]
    # undo the clump ridges and partings, a little darker and browner overall
    out = col / (1 + 0.28 * cs - 0.22 * (1 - cs) * (1 - R['nose']))[:, None]
    fs, ft = fine
    out *= (0.9 + 0.12 * fs * (ft - 0.3))[:, None]
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['claw'] + R['pad'] * R['paw'], 0, 1)
    out = mix(out, col, keep)
    return np.clip(out, 0, 1).astype(F)


# ---------- hair cards: whiskers (pale and thick) ----------
HAIR = {'size': (64, 128), 'cols': 2, 'base': (0.62, 0.6, 0.56), 'hi': (0.75, 0.73, 0.7), 'tip': (0.85, 0.84, 0.82), 'strands': 18,
        'root': 1.0, 'rough': 0.4, 'alpha': 0.35, 'seed': 7, 'quality': 80}


def cards():
    rows = []
    for i in range(9):
        t = i / 8
        s0 = 0.115 + 0.022 * (i % 3) / 2 + 0.003 * (rnd(i, 1) - 0.5)
        u0 = -0.006 - 0.009 * (i // 3) / 2 + 0.002 * (rnd(i, 2) - 0.5)
        root = HF.pt(s0, u0, 0.026 - 0.004 * (i % 3) / 2)
        d = nrm(V(0.8, 0.0, 0.0) + HF.a * (-0.3 + 0.35 * (i % 3) / 2) + HF.u * (0.05 - 0.2 * (i // 3) / 2) + V(0, 0.08 * (rnd(i, 3) - 0.5), 0))
        rows.append((root, d, 0.05 + 0.025 * rnd(i, 4), 0.0013, 0.18, i % 2))
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
