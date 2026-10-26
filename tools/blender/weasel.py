# Long-tailed weasel, sculpted as a signed distance field around the game's weasel skeleton
# (tools/blender/work/weasel-rig.json). Units are meters in game rig space (x left, y up, z forward, ground at y = 0).
# A long slim body, a long neck, a small flat head with short rounded ears set low, short legs, a tail about half the
# body length with a bushier tip; rich brown back, cream underside with a crisp edge, a black tail tip, a pink nose,
# whiskers as hair cards. Kits: grayer fuzz (the baby color map). The body and the tail get extra rings so the weasel
# can stand up on its hind legs and curl up to sleep.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length
import carnivore as CV
from carnivore import local, local_n, mirror, groove, mix, hexc, rnd, wsum

ID = 'weasel'
BOUNDS = (V(-0.045, 0.0, -0.216), V(0.045, 0.115, 0.176))
BAKE_DIST = (0.0015, 0.005, 0.012)
DISSOLVE_DEGENERATE = True
TAIL_RINGS = 0

# ---------- landmarks (left side, +x) ----------
HF = CV.Frame(V(0.0, 0.0885, 0.097), V(0.0, -0.12, 1.0), V(0.0, 1.0, 0.0))
EYE = CV.Eye(HF.pt(0.032, 0.0068, 0.0104), 0.0028, V(0.6, 0.3, 0.74), lid_w=0.0026, lid_h=0.0019, off=0.0002, slant=0.1,
             mound=(0.0011, 0.001, 0.0004), sink=0.25)
NOSE_S = 0.055
MOUTH = HF.pt(0.048, -0.0066)
EAR_B = V(0.0112, 0.0962, 0.1045)
EAR_A = nrm([0.55, 0.78, -0.3])
EAR_N = nrm([0.6, -0.2, 0.75])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
EAR_L, EAR_W = 0.0075, 0.0062
XF, XH = 0.0135, 0.015
HAND = V(XF, 0.0, 0.046)
FOOT = V(XH, 0.0, -0.057)
PATCHES = [
    (EYE.c * V(0, 1, 1) + V(0.004, -0.0055, -0.0055), EYE.c * V(0, 1, 1) + V(0.016, 0.0055, 0.006), 0.00018),   # eye and lids
    (HF.pt(0.04, 0.0) * V(0, 1, 1) + V(0.0, -0.012, 0.0), HF.pt(0.062, 0.0) * V(0, 1, 1) + V(0.011, 0.008, 0.003), 0.00022),  # muzzle
    (V(0.005, 0.09, 0.096), V(0.022, 0.106, 0.112), 0.00022),                                                     # ear
    (V(0.004, -0.0005, 0.036), V(0.024, 0.008, 0.058), 0.0002),                                                   # hand
    (V(0.004, -0.0005, -0.074), V(0.026, 0.008, -0.045), 0.0002),                                                 # hind foot
]

# trunk: z, top, yw (height of widest), bottom, half width, exponents
TRUNK = [
    (-0.1, 0.0505, 0.0425, 0.0345, 0.0085, 2.0, 2.0),
    (-0.088, 0.0585, 0.044, 0.0295, 0.0145, 2.1, 2.0),
    (-0.068, 0.0648, 0.047, 0.0294, 0.0176, 2.2, 2.0),
    (-0.04, 0.0692, 0.051, 0.0332, 0.0178, 2.2, 2.0),
    (-0.014, 0.07, 0.0525, 0.035, 0.0174, 2.2, 2.0),
    (0.012, 0.0676, 0.0505, 0.0336, 0.017, 2.2, 2.0),
    (0.036, 0.0636, 0.047, 0.0308, 0.0172, 2.2, 2.0),
    (0.052, 0.0632, 0.048, 0.0335, 0.016, 2.1, 2.0),
]
NECK = [
    (0.048, 0.04, 0.0158, 0.0165, 0.0166, 2.0, 2.0),
    (0.053, 0.058, 0.015, 0.0158, 0.0156, 2.0, 2.0),
    (0.061, 0.073, 0.0145, 0.015, 0.015, 2.0, 2.0),
    (0.073, 0.088, 0.014, 0.0142, 0.0144, 2.0, 2.0),
    (0.085, 0.1, 0.0128, 0.0132, 0.0136, 2.0, 2.0),
]
# head: small and flat, broad across the cheeks, a short tapering muzzle
HEAD = [
    (-0.006, 0.008, 0.0, -0.0098, 0.0112, 2.3, 2.0),
    (0.006, 0.0115, 0.0005, -0.0124, 0.0168, 2.9, 2.0),
    (0.018, 0.0122, 0.001, -0.0124, 0.0175, 3.0, 2.0),
    (0.029, 0.011, 0.001, -0.011, 0.0148, 2.8, 2.1),
    (0.038, 0.0086, 0.0005, -0.0094, 0.0112, 2.5, 2.2),
    (0.046, 0.0066, 0.0, -0.0075, 0.0084, 2.3, 2.3),
    (0.052, 0.0048, 0.0, -0.0056, 0.0062, 2.2, 2.2),
    (0.0565, 0.0023, 0.0, -0.0032, 0.0038, 2.2, 2.2),
]
FORE = [
    (0.042, 0.043, 0.0092, 0.0102, 0.0084, 2.2, 2.2, 0.011),
    (0.03, 0.038, 0.0076, 0.0086, 0.0072, 2.2, 2.2, 0.0125),
    (0.021, 0.0342, 0.006, 0.0063, 0.0058, 2.2, 2.2, 0.0135),
    (0.013, 0.037, 0.0048, 0.0048, 0.0047, 2.2, 2.2, 0.0135),
    (0.0072, 0.0408, 0.0043, 0.0043, 0.0044, 2.2, 2.2, 0.0135),
    (0.0028, 0.0438, 0.0037, 0.0037, 0.0041, 2.2, 2.2, 0.0135),
]
HIND = [
    (0.047, -0.07, 0.0118, 0.0128, 0.0094, 2.2, 2.2, 0.011),
    (0.035, -0.062, 0.0102, 0.0116, 0.0088, 2.2, 2.2, 0.0135),
    (0.0232, -0.0552, 0.0076, 0.0092, 0.0068, 2.2, 2.2, 0.015),
    (0.0152, -0.0638, 0.0056, 0.0062, 0.0053, 2.2, 2.2, 0.015),
    (0.0092, -0.0712, 0.0047, 0.0051, 0.0046, 2.2, 2.2, 0.015),
    (0.0035, -0.0685, 0.0039, 0.0039, 0.0042, 2.2, 2.2, 0.015),
]
TAIL = [(0.0432, -0.086, 0.0092), (0.0432, -0.1, 0.0073), (0.044, -0.124, 0.0063), (0.0452, -0.15, 0.0064), (0.0467, -0.174, 0.0073),
        (0.0481, -0.194, 0.0068), (0.049, -0.206, 0.0036)]


def _tail_keys():
    return [(y, z, r, r, r, 2.0, 2.0) for y, z, r in TAIL]


def trunk(P):
    Q = mirror(P)
    d = loft(Q, TRUNK)
    d = smin(d, ellipsoid(Q, V(0.011, 0.047, 0.036), V(0.008, 0.012, 0.012)), 0.008)      # shoulders
    d = smin(d, ellipsoid(Q, V(0.012, 0.048, -0.064), V(0.0085, 0.014, 0.016)), 0.009)    # haunches
    return d


def neck(P):
    return sweep(mirror(P), NECK)


def head(P):
    Q = mirror(P)
    L = HF.loc(Q)
    d = loft(L, HEAD)
    d = smin(d, ellipsoid(L, V(0.012, -0.004, 0.016), V(0.006, 0.008, 0.01)), 0.004)      # cheeks
    d = smin(d, ellipsoid(L, V(0.0042, -0.0034, 0.047), V(0.0034, 0.0034, 0.0065)), 0.0018)  # whisker pads
    d = smin(d, ellipsoid(L, V(0.0, -0.0072, 0.041), V(0.0045, 0.0026, 0.01)), 0.0025)    # lower jaw
    d = smin(d, ellipsoid(L, V(0.0, 0.0002, NOSE_S + 0.0005), V(0.0028, 0.0021, 0.0019)), 0.0012)   # nose
    M = L * V(1, 2.5, 1)
    m = round_cone(M, V(0.0, -0.0052 * 2.5, NOSE_S - 0.001), V(0.0036, -0.006 * 2.5, 0.048), 0.0005, 0.0005)
    m = smin(m, round_cone(M, V(0.0036, -0.006 * 2.5, 0.048), V(0.0066, -0.007 * 2.5, 0.037), 0.0005, 0.0003), 0.0008)
    d = smax(d, -(m + 0.0003) / 2.5, 0.0006)
    nc = V(0.0012, -0.0006, NOSE_S + 0.0018)
    d = smax(d, -ellipsoid(L, nc, V(0.00042, 0.0003, 0.0006)), 0.0002)
    return d


def eye_parts(P):
    return EYE.parts(mirror(P))


def ear(P):
    Q = mirror(P)
    return CV.ear(Q, EAR_B, EAR_A, EAR_N, EAR_L, EAR_W, 'round', th0=0.0024, th1=0.0012, cup=0.45, base_r=(0.0035, 0.0025, 0.002))


def fleg(P):
    Q = mirror(P)
    return sweep(Q, FORE, mirror_x=False)


def hleg(P):
    Q = mirror(P)
    d = sweep(Q, HIND, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(0.013, 0.036, -0.066), V(0.008, 0.013, 0.013)), 0.006)    # thigh
    return d


FINGERS = [(-36, 0.0028, 0.0038, 0.0013), (-13, 0.0032, 0.0047, 0.0014), (7, 0.0033, 0.0049, 0.0014), (27, 0.0031, 0.0044, 0.0014), (48, 0.0026, 0.0032, 0.0012)]
TOES = [(-32, 0.003, 0.0042, 0.0013), (-11, 0.0034, 0.0052, 0.0014), (8, 0.0035, 0.0055, 0.0014), (27, 0.0033, 0.005, 0.0014), (46, 0.0028, 0.0036, 0.0012)]


def paws(P):
    Q = mirror(P)
    a, ca = CV.hand(Q, HAND, FINGERS, (0.0046, 0.0024, 0.0048), yaw=0.08, claw=(0.0009, 0.00035), palm_c=(0.0, -0.001))
    b, cb = CV.hand(Q, FOOT, TOES, (0.0048, 0.0026, 0.0085), yaw=0.06, claw=(0.0009, 0.00035), palm_c=(0.0, -0.0055))
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
    d = smin(d, local(P, (-0.04, 0.015, 0.02), (0.04, 0.12, 0.12), neck), 0.012)
    h = local(P, (-0.035, 0.065, 0.08), (0.035, 0.112, 0.176), head)
    ca, li, ba = local_n(P, (-0.022, 0.085, 0.12), (0.022, 0.104, 0.142), eye_parts, 3)
    h = smin(h, li, 0.0015)
    h = smax(h, -ca, 0.0005)
    h = smin(h, ba, 0.0003)
    d = smin(d, h, 0.008)
    d = smin(d, local(P, (-0.03, 0.085, 0.09), (0.03, 0.112, 0.12), ear), 0.002)
    fl = local(P, (-0.035, -0.003, 0.02), (0.035, 0.065, 0.065), fleg)
    d = smin(d, fl, 0.008)
    hl = local(P, (-0.04, -0.003, -0.095), (0.04, 0.07, -0.035), hleg)
    d = smin(d, hl, 0.009)
    pw, cl = local_n(P, (-0.03, -0.002, -0.078), (0.03, 0.01, 0.062), paws, 2)
    d = smin(d, pw, 0.0025)
    d = np.minimum(d, cl)
    d = smin(d, local(P, (-0.022, 0.02, -0.216), (0.022, 0.07, -0.05), tail), 0.006)
    return d


PREVIEW = {
    'side': ((0.85, 0.06, -0.02), (0, 0.045, -0.02), 30),
    'front3q': ((0.45, 0.17, 0.45), (0, 0.045, 0.0), 30),
    'front': ((0.0, 0.08, 0.65), (0, 0.05, 0.0), 26),
    'rear3q': ((-0.4, 0.2, -0.5), (0, 0.045, -0.04), 30),
    'top': ((0.002, 0.8, -0.02), (0, 0.05, -0.02), 30),
    'face': ((0.06, 0.11, 0.3), (0, 0.088, 0.125), 24),
    'faceside': ((0.18, 0.095, 0.13), (0.0, 0.088, 0.125), 24),
    'feet': ((0.13, 0.025, 0.12), (0.014, 0.005, 0.0), 30),
    'headtop': ((0.02, 0.3, 0.125), (0, 0.09, 0.125), 24),
}


# ---------- game mesh ----------
KEEP = (0.44, 0.8, 0.58, 0.7, 0.55, 0.56, 0.42)


def keep(P):
    Pm = mirror(P)
    tl = sstep(-0.085, -0.1, Pm[:, 2])
    base = KEEP[0] + (KEEP[6] - KEEP[0]) * tl
    e = sstep(0.009, 0.0045, np.linalg.norm(Pm - EYE.c, axis=1)) * KEEP[1]
    L = HF.loc(Pm)
    hd = sstep(-0.004, 0.006, L[:, 2]) * sstep(0.065, 0.072, Pm[:, 1]) * KEEP[2]
    m = sstep(0.04, 0.05, L[:, 2]) * sstep(-0.015, -0.01, L[:, 1]) * KEEP[3]
    a, c, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    er = sstep(-0.003, 0.0, a) * sstep(0.01, 0.007, np.abs(c)) * sstep(0.004, 0.002, np.abs(n)) * KEEP[4]
    pw = sstep(0.008, 0.004, Pm[:, 1]) * KEEP[5]
    return np.maximum.reduce([base, e, hd, m, er, pw]).astype(F)


def lowpoly_fix(bm, hi):
    """rings across the long body and neck and along the tail, so the weasel bends smoothly when it stands up,
    bounds along and curls up"""
    import meshfix as MX
    tr = MX.tree(hi)
    MX.rings(bm, tr, (0.0, 0.05, 0.05), (0.0, 0.048, -0.098), 0.011, lambda c, p0, r: c.y > 0.022 and r < 0.03)
    pts = [V(0, k[0], k[1]) for k in NECK]
    for a, b in zip(pts[:-1], pts[1:]):
        MX.rings(bm, tr, a, b, 0.01, lambda c, p0, r: r < 0.022 and c.z > 0.045)
    pts = [V(0, y, z) for y, z, _ in TAIL]
    for a, b in zip(pts[:-1], pts[1:]):
        MX.rings(bm, tr, a, b, 0.011, lambda c, p0, r: r < 0.014 and c.z < -0.088)
    MX.finish(bm, 2e-9)


UV_AVERAGE = True


def uv_regions(P):
    Pm = mirror(P)
    L = HF.loc(Pm)
    y, z = Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 2)
    head = (L[:, 2] > -0.002) & (y > 0.068)
    neck = ~head & (z > 0.05)
    fleg = (z > 0.02) & (y < 0.03) & (z < 0.07)
    hleg = (z <= 0.02) & (y < 0.032) & (z > -0.085)
    tail = (z < -0.088)
    lab[neck] = 1
    lab[head] = 0
    lab[fleg] = 3
    lab[hleg] = 5
    lab[tail] = 7
    return lab


def uv_weight(P):
    Pm = mirror(P)
    L = HF.loc(Pm)
    head = sstep(-0.004, 0.006, L[:, 2]) * sstep(0.065, 0.072, Pm[:, 1])
    paw = sstep(0.012, 0.005, Pm[:, 1])
    return (0.92 + 0.8 * head + 0.3 * paw).astype(F)


WEIGHT_SMOOTH = (5, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'rump': P['hips'], 'chest': P['neck'], 'neck': P['neck2'], 'neck2': P['head'], 'head': HF.pt(0.055, 0.0),
         'tail1': P['tail2'], 'tail2': P['tail3'], 'tail3': V(0, 0.049, -0.207)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, 0.002, 0.008)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (HAND + V(0, 0.002, 0.008)) * m
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
            pos = x > 0.003
            W[pos, l] += W[pos, r]; W[pos, r] = 0
            neg = x < -0.003
            W[neg, r] += W[neg, l]; W[neg, l] = 0
    a, c, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    on = (ear(wpos) < 0.0006) & (a > -0.001)
    k = sstep(-0.001, 0.003, a)
    for s, sg in (('L', 1), ('R', -1)):
        CV.set_part(W, bi, on & (x * sg > 0), 'ear' + s, k)
    for s, sg in (('L', 1), ('R', -1)):
        near = (np.abs(x - sg * HAND[0]) < 0.012) & (wpos[:, 2] > HAND[2] - 0.003) & (wpos[:, 2] < HAND[2] + 0.02) & (wpos[:, 1] < 0.0055)
        CV.set_part(W, bi, near, 'fpaw' + s, sstep(0.0055, 0.003, wpos[:, 1]))
        near = (np.abs(x - sg * FOOT[0]) < 0.012) & (wpos[:, 2] > FOOT[2] - 0.004) & (wpos[:, 2] < FOOT[2] + 0.022) & (wpos[:, 1] < 0.0055)
        CV.set_part(W, bi, near, 'hpaw' + s, sstep(0.0055, 0.003, wpos[:, 1]))
    s = W.sum(1, keepdims=True)
    return W / np.maximum(s, 1e-9)


# ---------- coat ----------
_TY = np.array([t[0] for t in TAIL], F)
_TZ = np.array([t[1] for t in TAIL], F)
_NY = np.array([t[0] for t in NECK], F)
_NZ = np.array([t[1] for t in NECK], F)


def tail_dir(z):
    zs, ys = _TZ[::-1], _TY[::-1]
    dydz = np.interp(z, zs, np.gradient(ys, zs))
    t = np.stack([np.zeros_like(z), -dydz, -np.ones_like(z)], 1)
    return t / np.linalg.norm(t, axis=1, keepdims=True)


def tail_t(z):
    return np.clip((-0.088 - z) / (0.207 - 0.088), 0, 1)


def flow(P, N=None):
    """from the nose back over the head, down the long neck and along the body to the tail tip, down the legs"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    one = np.ones_like(y)
    body = np.stack([0.2 * sstep(0.006, 0.016, x), -(0.1 + 0.6 * sstep(0.05, 0.035, y)), -one], 1)
    dydz = np.interp(z, _NZ, np.gradient(_NY, _NZ))
    neckd = np.stack([0.1 * one, -dydz, -one], 1)
    legd = np.stack([0 * y, -one, -0.1 * one], 1)
    L = HF.loc(Q)
    head = -HF.a[None, :] + np.stack([0.3 * sstep(0.003, 0.01, x), -0.2 * sstep(0.0, -0.008, L[:, 1]), 0 * y], 1)
    taild = tail_dir(z)
    wh = sstep(-0.002, 0.008, L[:, 2]) * sstep(0.066, 0.074, y)
    wn = sstep(0.04, 0.055, z) * (1 - wh)
    wt = sstep(-0.085, -0.095, z)
    wl = sstep(0.026, 0.018, y) * (1 - wh - wn) * (1 - wt) * sstep(0.004, 0.009, x)
    wb = np.clip(1 - wh - wn - wl - wt, 0, 1)
    f = body * wb[:, None] + head * wh[:, None] + neckd * wn[:, None] + legd * wl[:, None] + taild * wt[:, None]
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
    r['ball'] = sstep(0.0003, 0.00008, c['ball']) * sstep(EYE.r + 0.0012, EYE.r + 0.0003, de)
    El = EYE.loc(Pm)
    ua = El[:, 1] - EYE.off - EYE.slant * El[:, 0]
    ring = np.sqrt((El[:, 0] / (EYE.lid_w + 0.0009)) ** 2 + (ua / (EYE.lid_h + 0.0008)) ** 2)
    r['lid'] = sstep(1.15, 0.9, ring) * (1 - r['ball']) * sstep(EYE.r + 0.003, EYE.r + 0.0015, de)
    r['head'] = sstep(-0.004, 0.004, L[:, 2]) * sstep(0.0015, 0.0, c['head'])
    r['nose'] = sstep(0.0005, 0.0, ellipsoid(L, V(0.0, 0.0002, NOSE_S + 0.0005), V(0.0031, 0.0024, 0.0022))) * sstep(NOSE_S - 0.003, NOSE_S - 0.0012, L[:, 2])
    lipu = -0.0052 - 0.0018 * sstep(0.051, 0.038, L[:, 2])
    r['lip'] = sstep(0.0011, 0.0005, np.abs(L[:, 1] - lipu)) * sstep(0.036, 0.039, L[:, 2]) * r['head']
    a, cc, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    r['ea'], r['ec'] = a, cc
    r['ear'] = sstep(0.0008, 0.0002, c['ear']) * sstep(-0.001, 0.0015, a)
    r['earIn'] = sstep(-0.15, 0.35, Nm @ EAR_N)
    r['paw'] = sstep(0.001, 0.0, c['paw']) * sstep(0.0075, 0.0045, y)
    r['pad'] = sstep(-0.2, -0.75, N[:, 1]) * sstep(0.0015, 0.0005, y)
    r['claw'] = sstep(0.0003, 0.0, c['claw'])
    r['tt'] = tail_t(z)
    r['tail'] = sstep(0.002, 0.0, c['tail']) * sstep(-0.084, -0.092, z)
    r['top'] = sstep(0.3, 0.85, N[:, 1])
    return r


K = {
    'brown': hexc(0x5B3317), 'back': hexc(0x40240F), 'warm': hexc(0x72421E), 'cream': hexc(0xEBD7A0), 'throat': hexc(0xF2E5C0),
    'tip': hexc(0x15110F), 'foot': hexc(0x5A341A), 'earRim': hexc(0xB89A72), 'nose': hexc(0xC98584), 'noseDk': hexc(0x8E5352),
    'lip': hexc(0x3A2416), 'claw': hexc(0xC9BBA8), 'pad': hexc(0x9C7466), 'ball': hexc(0x0C0806),
}


def _strands(P, N, R):
    key = (len(P), float(P[:7].sum()))
    if key not in _scache:
        dens = 0.9 * (1 - R['nose']) * (1 - R['ball']) * (1 - R['claw']) * (1 - R['pad'] * R['paw']) * (1 - 0.6 * R['lip']) * sstep(EYE.r + 0.0008, EYE.r + 0.002, R['eyeD'])
        lk = lambda Q: np.clip(1.0 - 0.45 * sstep(-0.002, 0.008, HF.loc(mirror(Q))[:, 2]) - 0.4 * sstep(0.022, 0.01, mirror(Q)[:, 1]) + 0.35 * sstep(0.75, 0.9, tail_t(Q[:, 2])), 0.4, 1.5)
        _scache[key] = CV.strands(P, N, dens, flow, 0.0019, 0.0024, 0.0042, 0.00034, seed=76, lenk=lk)
    return _scache[key]


_scache = {}


def _markings(R, Pm, N):
    """cream underside with a crisp, slightly ragged edge: chin, upper lip, throat, chest and belly, the insides of the
    legs; the black tail tip"""
    L = R['L']
    s, u = L[:, 2], L[:, 1]
    y, z = Pm[:, 1], Pm[:, 2]
    w1 = fbm(Pm * 900, 2, 41) - 0.5
    w2 = fbm(Pm * 260, 2, 42) - 0.5
    hd = R['head']
    # body: the line along the lower side, rising up the neck to just under the ear
    up = N[:, 1]
    line_b = -0.42 + 0.5 * sstep(0.03, 0.09, z) + 0.06 * w2 + 0.03 * w1
    body = sstep(line_b + 0.06, line_b - 0.06, up) * (1 - hd) * (1 - R['tail'])
    # head: the upper lip and chin, under the jaw and the cheek below the eye
    line_h = -0.0035 - 0.001 * sstep(0.03, 0.01, s) + 0.0012 * w2 + 0.0005 * w1
    face = sstep(line_h + 0.0006, line_h - 0.0006, u) * hd
    leg_in = sstep(0.0, -0.6, R['Nm'][:, 0]) * sstep(0.03, 0.022, y) * sstep(0.016, 0.022, y) * sstep(0.02, 0.06, z)
    cream = np.clip(np.maximum.reduce([body, face, leg_in * 0.5]) * (1 - R['paw']), 0, 1)
    th = 0.66 + 0.04 * w2
    tip = R['tail'] * sstep(th, th + 0.04, R['tt'])
    return dict(cream=cream, tip=tip)


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y, z = Pm[:, 1], Pm[:, 2]
    M = _markings(R, Pm, N)
    n1 = fbm(Pm * 30, 3, 11)
    n2 = fbm(Pm * 140, 3, 12)
    col = np.tile(K['brown'], (len(P), 1))
    col = mix(col, K['back'], R['top'] * 0.6)
    col = mix(col, K['warm'], sstep(0.55, 0.2, np.abs(N[:, 1] - 0.05)) * 0.35)
    col *= (0.92 + 0.16 * n1)[:, None]
    col = mix(col, K['back'], R['head'] * sstep(0.04, 0.055, L[:, 2]) * sstep(0.0, 0.005, L[:, 1]) * 0.5)
    col = mix(col, K['foot'], R['paw'] * 0.6)
    cr = mix(np.tile(K['cream'], (len(P), 1)), K['throat'], sstep(0.04, 0.09, z) + R['head'])
    col = mix(col, cr * (0.95 + 0.1 * n2[:, None]), M['cream'])
    col = mix(col, K['tip'] * (0.9 + 0.4 * n2[:, None]), M['tip'])
    col = mix(col, K['earRim'], R['ear'] * sstep(EAR_L * 0.55, EAR_L * 0.85, R['ea']) * 0.6)
    col = mix(col, K['lip'], R['lip'] * 0.7)
    col = mix(col, K['back'] * 0.5, R['lid'])
    col = mix(col, mix(np.tile(K['nose'], (len(P), 1)), K['noseDk'], sstep(-0.3, -0.9, N[:, 1]) * 0.6), R['nose'])
    col = mix(col, K['pad'], R['pad'] * R['paw'])
    col = mix(col, K['claw'], R['claw'])
    s, tone = _strands(P, N, R)
    col *= (1 + s * 0.2 * (tone - 0.35) - 0.04 * (1 - s))[:, None]
    col = mix(col, K['ball'], R['ball'])
    rough = 0.6 + 0.08 * (n2 - 0.5) - 0.25 * R['nose'] - 0.25 * R['lid'] - 0.1 * R['lip'] - 0.2 * R['claw']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    h = np.zeros(len(P), F)
    s, tone = _strands(P, N, R)
    h += 0.000025 * s * (1 - R['ball']) * (1 - R['nose'])
    g1, _ = worley(Pm / 0.00028, 58)
    h -= 0.000015 * sstep(0.35, 0.1, g1) * R['nose']
    return h


def finish(C, ao, valid):
    return CV.finish(C, ao, valid, 0.4)


FUR = {'len': 0.0058, 'n': 4, 'lean': 1.2, 'tile': 0.0008, 'babyLen': 1.8, 'babyLean': 0.45, 'shade': 0.7, 'quality': 80}


def fur(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y = Pm[:, 1]
    ln = np.full(len(P), 0.0042, F)
    ln = ln * (1 - 0.4 * sstep(0.03, 0.012, y) * (1 - R['tail']))
    hd = R['head']
    ln = ln * (1 - hd * 0.45) * (1 - R['paw'] * 0.6) * (1 - R['ear'] * 0.5)
    tl = R['tail']
    ln = ln * (1 - tl) + tl * (0.0045 + 0.0013 * sstep(0.6, 0.85, R['tt']))
    ln = ln * (1 - 0.5 * hd * sstep(0.052, 0.062, L[:, 2]))
    ln = ln * (1 - R['nose']) * (1 - R['lip']) * (1 - R['claw']) * (1 - R['pad'] * R['paw']) * sstep(EYE.r + 0.0006, EYE.r + 0.0016, R['eyeD'])
    return np.clip(ln, 0, FUR['len']).astype(F), np.ones(len(P), F)


MAP_QUALITY = (76, 72)
PAD_SMOOTH = 3


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': CV.lid_color(col, R['eyeD'], EYE.r)}


def meta(st):
    p, r, d, lid = EYE.meta()
    return {
        'eye': {'p': p, 'r': r, 'dir': d, 'lid': lid, 'iris': 0x120B07, 'irisR': 0.95, 'pupilR': 0.55, 'rim': 0x080503, 'lidCol': st['lidCol']},
        'collar': {'at': ['neck2', 'head', 0.55]},
        'belly': [0.0, 0.035, -0.018],
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.14, 0.09, 0.05], 'flat': 0x593216,
    }


# ---------- kits: softer, grayer fuzz with a paler belly and a gray tail tip ----------
BABY_TEX = 256


def baby_paint(P, N, c, col):
    R = _regions(P, N, c)
    Pm = R['Pm']
    M = _markings(R, Pm, N)
    n2 = fbm(Pm * 140, 3, 12)
    kit = mix(np.tile(hexc(0x76604F), (len(P), 1)), hexc(0x968070), n2)
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['claw'] + R['pad'] * R['paw'], 0, 1)
    out = mix(col, kit, 0.55 * (1 - keep) * (1 - M['cream']))
    out = mix(out, hexc(0xEDE3CC), M['cream'] * 0.5 * (1 - keep))
    out = mix(out, hexc(0x6E6660), M['tip'] * 0.7)
    return np.clip(out, 0, 1).astype(F)


# ---------- hair cards: whiskers ----------
HAIR = {'size': (64, 128), 'cols': 2, 'base': (0.09, 0.07, 0.055), 'hi': (0.18, 0.15, 0.12), 'tip': (0.35, 0.32, 0.3), 'strands': 18,
        'root': 1.0, 'rough': 0.45, 'alpha': 0.35, 'seed': 8, 'quality': 80}


def cards():
    rows = []
    for i in range(5):
        s0 = 0.041 + 0.007 * (i % 3) / 2 + 0.001 * (rnd(i, 1) - 0.5)
        u0 = -0.0018 - 0.0026 * (i // 3) + 0.0006 * (rnd(i, 2) - 0.5)
        root = HF.pt(s0, u0, 0.0062 - 0.0012 * (i % 3) / 2)
        d = nrm(V(0.8, 0.0, 0.0) + HF.a * (-0.25 + 0.35 * (i % 3) / 2) + HF.u * (0.08 - 0.25 * (i // 3)) + V(0, 0.08 * (rnd(i, 3) - 0.5), 0))
        rows.append((root, d, 0.02 + 0.008 * rnd(i, 4), 0.00045, 0.15, i % 2))
    out = []
    for sg in (1, -1):
        m = V(sg, 1, 1)
        out += CV.whiskers([(root * m, d * m, ln, w, droop, col) for root, d, ln, w, droop, col in rows])
    roots = np.array([cd['pts'][0] for cd in out], F)
    g = CV.gradient(shape, roots, 0.0002)
    dd = shape(roots)
    for cd, gg, d0 in zip(out, g, dd):
        cd['pts'][0] = cd['pts'][0] - gg * (d0 + 0.0003)
    return out
