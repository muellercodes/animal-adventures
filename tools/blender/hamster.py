# A Syrian (golden) hamster (round 7), sculpted as a signed distance field around the game's hamster skeleton
# (tools/blender/work/hamster-rig.json). Units are meters in game rig space (x left, y up, z forward, ground at y = 0).
# About 15 cm long: a round, compact body, the belly close to the ground on short legs (only the forearms, the little
# pink hands with four fingers and the long pink hind feet show under the fur), a big head that runs into the body
# with no neck to speak of, full cheek pouches (the game swells them as it eats: the cheek bones), small round thin
# ears, shiny black bulging eyes, a small pink nose over a split lip, whiskers, and a tiny stub of a tail. The coat is
# soft and dense: golden orange with darker ticking along the back, white belly, chest, chin and lower cheeks, a dark
# cheek flash behind each pouch. Pups (the game makes their head bigger) get a paler, fluffier coat.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length
import carnivore as CV
from carnivore import local, local_n, mirror, groove, mix, hexc, rnd, wsum

ID = 'hamster'
BOUNDS = (V(-0.055, 0.0, -0.092), V(0.055, 0.09, 0.088))
BAKE_DIST = (0.0012, 0.004, 0.01)
DISSOLVE_DEGENERATE = True
TAIL_RINGS = 0

# ---------- landmarks (left side, +x) ----------
# head frame: from the back of the skull forward and a little down along the muzzle (s), up across it (u)
HF = CV.Frame(V(0.0, 0.05, 0.028), V(0.0, -0.25, 1.0), V(0.0, 1.0, 0.0))
EYE = CV.Eye(HF.pt(0.026, 0.011, 0.0226), 0.0034, V(0.8, 0.3, 0.52), lid_w=0.0031, lid_h=0.0029, off=0.0001, slant=0.05,
             mound=(0.0009, 0.0008, 0.0003), sink=0.12)
NOSE_S = 0.0555
MOUTH = HF.pt(0.049, -0.012)
EAR_B = V(0.0185, 0.069, 0.033)
EAR_A = nrm([0.42, 0.88, -0.18])
EAR_N = nrm([0.55, 0.05, 0.84])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
EAR_L, EAR_W = 0.0118, 0.0068
XF, XH = 0.0205, 0.026
HAND = V(XF, 0.0, 0.037)
FOOT = V(XH, 0.0, -0.035)
TAILC = V(0.0, 0.027, -0.083)
CHEEK = HF.pt(0.022, -0.011, 0.024)           # middle of the cheek pouch
PATCHES = [
    (EYE.c * V(0, 1, 1) + V(0.016, -0.007, -0.007), EYE.c * V(0, 1, 1) + V(0.031, 0.007, 0.007), 0.0002),   # eye and lids
    (HF.pt(0.042, 0.0) * V(0, 1, 1) + V(0.0, -0.02, -0.004), HF.pt(0.061, 0.0) * V(0, 1, 1) + V(0.012, 0.01, 0.004), 0.00022),  # nose, lips
    (V(0.01, 0.062, 0.022), V(0.034, 0.086, 0.045), 0.00025),                                                   # ear
    (V(0.01, -0.0005, 0.028), V(0.032, 0.01, 0.05), 0.0002),                                                     # hand
    (V(0.014, -0.0005, -0.05), V(0.038, 0.01, -0.018), 0.0002),                                                  # hind foot
]

# trunk (with the dense coat's volume): z, top, yw (height of widest), bottom, half width, exponents above, below
TRUNK = [
    (-0.082, 0.042, 0.033, 0.024, 0.01, 2.0, 2.0),
    (-0.075, 0.057, 0.035, 0.015, 0.025, 2.0, 2.0),
    (-0.062, 0.068, 0.037, 0.0105, 0.034, 2.1, 2.0),
    (-0.044, 0.075, 0.038, 0.0075, 0.039, 2.1, 2.1),
    (-0.022, 0.0775, 0.039, 0.0072, 0.041, 2.1, 2.1),
    (0.0, 0.0765, 0.04, 0.0078, 0.04, 2.1, 2.1),
    (0.018, 0.0735, 0.041, 0.011, 0.037, 2.1, 2.0),
    (0.032, 0.07, 0.042, 0.014, 0.033, 2.0, 2.0),
]
# head: along the head frame (s), top, height of widest, bottom, half width, exponents above, below
HEAD = [
    (-0.004, 0.022, 0.0, -0.024, 0.029, 2.2, 2.0),
    (0.01, 0.0235, -0.002, -0.026, 0.032, 2.3, 2.1),
    (0.022, 0.021, -0.004, -0.0262, 0.031, 2.3, 2.2),
    (0.033, 0.0165, -0.005, -0.0238, 0.0255, 2.2, 2.2),
    (0.042, 0.0118, -0.006, -0.0205, 0.0195, 2.1, 2.1),
    (0.049, 0.0075, -0.0065, -0.0165, 0.0138, 2.0, 2.0),
    (0.054, 0.0032, -0.0068, -0.012, 0.0085, 2.0, 2.0),
]


def trunk(P):
    Q = mirror(P)
    d = loft(Q, TRUNK)
    # the round rump and the soft chest between the forelegs
    d = smin(d, ellipsoid(Q, V(0.0, 0.042, -0.05), V(0.04, 0.034, 0.034)), 0.02)
    d = smin(d, ellipsoid(Q, V(0.0, 0.03, 0.026), V(0.022, 0.018, 0.016)), 0.012)
    return d


def head(P):
    Q = mirror(P)
    L = HF.loc(Q)
    d = loft(L, HEAD)
    # the cheek pouches: full even when empty
    d = smin(d, ellipsoid(Q, CHEEK, V(0.0115, 0.0115, 0.0145)), 0.009)
    # whisker pads either side of the split lip, the small chin
    d = smin(d, ellipsoid(L, V(0.0052, -0.0062, 0.049), V(0.0058, 0.0054, 0.0058)), 0.004)
    d = smin(d, ellipsoid(L, V(0.0, -0.0128, 0.046), V(0.0046, 0.0033, 0.0052)), 0.003)
    # the nose: a small soft pad at the tip
    d = smin(d, ellipsoid(L, V(0.0, 0.0004, NOSE_S - 0.0004), V(0.0034, 0.0026, 0.0019)), 0.0018)
    # the cleft from the nose down the middle of the upper lip
    cleft = np.maximum(np.abs(L[:, 0]) - 0.00025, np.maximum(L[:, 1] - (-0.0026), -0.0085 - L[:, 1]))
    cleft = np.maximum(cleft, (NOSE_S - 0.0035) - L[:, 2])
    d = smax(d, -(cleft + 0.00005), 0.0003)
    # mouth line back from the bottom of the cleft under each whisker pad
    M = L * V(1, 2.5, 1)
    m = round_cone(M, V(0.0, -0.0088 * 2.5, 0.051), V(0.004, -0.0112 * 2.5, 0.047), 0.0004, 0.0004)
    m = smin(m, round_cone(M, V(0.004, -0.0112 * 2.5, 0.047), V(0.0068, -0.0112 * 2.5, 0.041), 0.0004, 0.0003), 0.0006)
    d = smax(d, -(m + 0.0002) / 2.5, 0.0004)
    # nostrils: commas at the sides of the nose
    for t in np.linspace(0, 1, 4):
        c = V(0.0012 + 0.0014 * t, 0.0004 - 0.0014 * t, NOSE_S + 0.0012 - 0.0008 * t)
        d = smax(d, -ellipsoid(L, c, V(0.00045, 0.00045, 0.0006)), 0.0003)
    return d


def eye_parts(P):
    return EYE.parts(mirror(P))


def ear(P):
    """small, round and thin, nearly bare: it stands up from the top of the head, the opening forward and out"""
    Q = mirror(P)
    return CV.ear(Q, EAR_B, EAR_A, EAR_N, EAR_L, EAR_W, 'round', th0=0.0017, th1=0.001, cup=0.65, tipin=0.0,
                  base_r=(0.0045, 0.0035, 0.003))


def ear_coords(Q):
    return CV.ear_coords(Q, EAR_B, EAR_A, EAR_N)


# ---------- legs ----------
def fleg(P):
    Q = mirror(P)
    x = XF
    # the upper arm in the chest fur, a short forearm, the wrist
    d = ellipsoid(Q, V(x - 0.003, 0.026, 0.028), V(0.0085, 0.012, 0.009))
    d = smin(d, round_cone(Q, V(x, 0.018, 0.028), V(x, 0.006, 0.034), 0.0052, 0.0036), 0.005)
    return d


def hleg(P):
    Q = mirror(P)
    x = XH
    # the haunch in the coat, the short shin down to the heel
    d = ellipsoid(Q, V(x - 0.003, 0.03, -0.04), V(0.013, 0.018, 0.02))
    d = smin(d, round_cone(Q, V(x, 0.019, -0.031), V(x, 0.007, -0.045), 0.005, 0.0037), 0.005)
    return d


FINGERS = [(-38, 0.0022, 0.0041, 0.00082), (-12, 0.0026, 0.0051, 0.0009), (13, 0.0026, 0.0051, 0.0009), (38, 0.0022, 0.0041, 0.00082)]
TOES = [(-34, 0.0032, 0.0042, 0.0009), (-14, 0.0042, 0.0052, 0.00095), (4, 0.0045, 0.0055, 0.00095), (22, 0.0042, 0.0052, 0.00095),
        (42, 0.0033, 0.004, 0.00085)]


def paws(P):
    """little pink hands with four slender fingers; long pink hind feet with five toes; tiny pale claws"""
    Q = mirror(P)
    a, ca = CV.hand(Q, HAND, FINGERS, (0.0036, 0.0019, 0.0041), yaw=0.12, claw=(0.0011, 0.00028), palm_c=(0.0, -0.0012))
    b, cb = CV.hand(Q, FOOT, TOES, (0.0043, 0.0022, 0.0088), yaw=0.08, claw=(0.0011, 0.0003), palm_c=(0.0, -0.0058))
    return np.minimum(a, b), np.minimum(ca, cb)


def tail(P):
    Q = mirror(P)
    return ellipsoid(Q, TAILC, V(0.0036, 0.0032, 0.0062))


# ---------- assembled ----------
def parts(P):
    ca, li, ba = eye_parts(P)
    pw, cl = paws(P)
    return {'trunk': trunk(P), 'head': head(P), 'ear': ear(P), 'lids': li, 'ball': ba, 'fleg': fleg(P), 'hleg': hleg(P),
            'paw': pw, 'claw': cl, 'tail': tail(P)}


def shape(P):
    d = trunk(P)
    h = local(P, (-0.055, 0.008, 0.012), (0.055, 0.08, 0.088), head)
    ca, li, ba = local_n(P, (-0.036, 0.048, 0.03), (0.036, 0.072, 0.058), eye_parts, 3)
    h = smin(h, li, 0.0012)
    h = smax(h, -ca, 0.0004)
    h = smin(h, ba, 0.0002)
    d = smin(d, h, 0.012)
    d = smin(d, local(P, (-0.045, 0.055, 0.015), (0.045, 0.09, 0.05), ear), 0.0025)
    d = smin(d, local(P, (-0.04, -0.002, 0.008), (0.04, 0.045, 0.05), fleg), 0.006)
    d = smin(d, local(P, (-0.05, -0.002, -0.07), (0.05, 0.055, -0.015), hleg), 0.008)
    pw, cl = local_n(P, (-0.045, -0.002, -0.056), (0.045, 0.012, 0.052), paws, 2)
    d = smin(d, pw, 0.0025)
    d = np.minimum(d, cl)
    d = smin(d, local(P, (-0.015, 0.015, -0.092), (0.015, 0.04, -0.07), tail), 0.004)
    return d


def grid(h):
    """finer spacing across the thin ears"""
    from sdf import axis_steps
    lo, hi = BOUNDS
    xs = axis_steps(0.0, hi[0], [(0.012, 0.032, h * 0.6)], h)
    ys = axis_steps(lo[1], hi[1], [], h)
    zs = axis_steps(lo[2], hi[2], [(0.024, 0.045, h * 0.5)], h)
    return xs, ys, zs


PREVIEW = {
    'side': ((0.55, 0.06, 0.0), (0, 0.04, 0.0), 30),
    'front3q': ((0.32, 0.16, 0.38), (0, 0.04, 0.0), 30),
    'front': ((0.0, 0.08, 0.5), (0, 0.045, 0.0), 26),
    'rear3q': ((-0.3, 0.18, -0.36), (0, 0.04, -0.02), 30),
    'top': ((0.002, 0.55, 0.0), (0, 0.04, 0.0), 30),
    'face': ((0.08, 0.08, 0.2), (0, 0.05, 0.05), 24),
    'faceside': ((0.18, 0.06, 0.06), (0.0, 0.05, 0.05), 24),
    'headfront': ((0.0, 0.07, 0.26), (0, 0.05, 0.05), 20),
    'feet': ((0.12, 0.02, 0.1), (0.02, 0.005, 0.0), 30),
    'under': ((0.1, -0.04, 0.08), (0.0, 0.01, 0.0), 34),
}


# ---------- game mesh: decimation, texture layout, skinning ----------
KEEP = (0.44, 0.8, 0.6, 0.72, 0.7, 0.6, 0.5)


def keep(P):
    Pm = mirror(P)
    base = np.full(len(P), KEEP[0], F)
    e = sstep(0.008, 0.004, np.linalg.norm(Pm - EYE.c, axis=1)) * KEEP[1]
    L = HF.loc(Pm)
    hd = sstep(0.0, 0.012, L[:, 2]) * sstep(0.01, 0.02, Pm[:, 1]) * KEEP[2]
    m = sstep(0.038, 0.046, L[:, 2]) * KEEP[3]
    a, c, n = ear_coords(Pm)
    er = sstep(-0.002, 0.0, a) * sstep(0.01, 0.0075, np.abs(c)) * sstep(0.004, 0.0025, np.abs(n)) * KEEP[4]
    pw = sstep(0.008, 0.004, Pm[:, 1]) * KEEP[5]
    tl = sstep(0.008, 0.004, np.linalg.norm(Pm - TAILC, axis=1)) * KEEP[6]
    return np.maximum.reduce([base, e, hd, m, er, pw, tl]).astype(F)


def lowpoly_fix(bm, hi):
    """rings across the body so it sits up, curls up to sleep and bends at a scurry smoothly"""
    import meshfix as MX
    tr = MX.tree(hi)
    MX.rings(bm, tr, (0.0, 0.042, 0.03), (0.0, 0.04, -0.075), 0.008, lambda c, p0, r: c.y > 0.012 and r < 0.05)
    MX.finish(bm, 2e-9)


UV_AVERAGE = True
UV_PACK = dict(margin_method='FRACTION', margin=0.014)


def uv_regions(P):
    """head, ears, trunk, legs, hands, feet, tail"""
    Pm = mirror(P)
    L = HF.loc(Pm)
    y, z = Pm[:, 1], Pm[:, 2]
    a, c, n = ear_coords(Pm)
    lab = np.full(len(P), 2)
    head = (L[:, 2] > 0.002) & (y > 0.012)
    earm = (a > 0.002) & (np.abs(c) < 0.012) & (y > 0.064)
    legs = (y < 0.024) & (np.abs(Pm[:, 0]) > 0.012) & ~head
    hand = (y < 0.008) & (z > 0.02) & (np.abs(Pm[:, 0] - XF) < 0.012)
    foot = (y < 0.008) & (z < -0.015) & (np.abs(Pm[:, 0] - XH) < 0.014)
    tl = np.linalg.norm(Pm - TAILC, axis=1) < 0.008
    lab[legs] = 3
    lab[head] = 0
    lab[earm] = 8
    lab[hand] = 4
    lab[foot] = 6
    lab[tl] = 7
    return lab


def uv_weight(P):
    Pm = mirror(P)
    L = HF.loc(Pm)
    head = sstep(0.0, 0.012, L[:, 2]) * sstep(0.01, 0.02, Pm[:, 1])
    paw = sstep(0.008, 0.004, Pm[:, 1])
    under = sstep(0.016, 0.01, Pm[:, 1]) * (1 - head) * (1 - paw)
    return (0.92 + 0.8 * head + 0.3 * paw - 0.25 * under).astype(F)


WEIGHT_SMOOTH = (5, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'rump': V(0, 0.035, -0.08), 'chest': P['neck'], 'neck': P['head'], 'head': HF.pt(0.056, 0.0), 'tail1': TAILC + V(0, -0.002, -0.006),
         'cheekL': CHEEK + V(0.006, 0, 0), 'cheekR': (CHEEK + V(0.006, 0, 0)) * V(-1, 1, 1)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, 0.002, 0.01)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (HAND + V(0, 0.002, 0.007)) * m
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
            pos = x > 0.002
            W[pos, l] += W[pos, r]; W[pos, r] = 0
            neg = x < -0.002
            W[neg, r] += W[neg, l]; W[neg, l] = 0
    side = lambda sg: x * sg > 0
    # the head: everything in front of the neck above the chest fur
    L = HF.loc(Pm)
    hd = (L[:, 2] > -0.006) & (y > 0.014)
    CV.set_part(W, bi, hd, 'head', sstep(-0.006, 0.008, L[:, 2]))
    # the cheek pouches on the cheek bones (the game swells them)
    ck = np.linalg.norm((Pm - CHEEK) / V(1.0, 1.0, 0.8), axis=1)
    for s, sg in (('L', 1), ('R', -1)):
        CV.set_part(W, bi, hd & side(sg), 'cheek' + s, sstep(0.016, 0.008, ck) * 0.9)
    # ears
    a, c, n = ear_coords(Pm)
    on = (ear(wpos) < 0.0008) & (a > -0.001)
    k = sstep(-0.001, 0.004, a)
    for s, sg in (('L', 1), ('R', -1)):
        CV.set_part(W, bi, on & side(sg), 'ear' + s, k)
        # hands and feet: the paw bones, the wrist and heel on the metapodials
        fp = (np.abs(x - sg * XF) < 0.012) & (y < 0.012) & (z > 0.022) & (z < 0.05)
        CV.set_part(W, bi, fp, 'fmeta' + s, sstep(0.012, 0.007, y))
        CV.set_part(W, bi, fp, 'fpaw' + s, sstep(0.006, 0.003, y) * sstep(0.031, 0.035, z))
        ft = (np.abs(x - sg * XH) < 0.014) & (y < 0.012) & (z < -0.015) & (z > -0.056)
        CV.set_part(W, bi, ft, 'hmeta' + s, sstep(0.012, 0.007, y))
        CV.set_part(W, bi, ft, 'hpaw' + s, sstep(-0.04, -0.032, z) * sstep(0.008, 0.004, y))
    # the tail stub
    tl = np.linalg.norm(Pm - TAILC, axis=1) < 0.008
    CV.set_part(W, bi, tl, 'tail1', sstep(-0.076, -0.082, z))
    s = W.sum(1, keepdims=True)
    return W / np.maximum(s, 1e-9)


# ---------- coat: direction, regions, paint ----------
def flow(P, N=None):
    """from the nose back over the head and down the cheeks, back along the body and down its sides, down the legs"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    one = np.ones_like(y)
    body = np.stack([0.3 * sstep(0.01, 0.03, x), -(0.15 + 0.9 * sstep(0.04, 0.02, y)), -one], 1)
    legd = np.stack([0 * y, -one, -0.1 * one], 1)
    L = HF.loc(Q)
    cheek = sstep(0.0, -0.014, L[:, 1]) * sstep(0.045, 0.02, L[:, 2])
    head = -HF.a[None, :] + np.stack([0.45 * sstep(0.003, 0.02, x) + 0.4 * cheek, -0.4 * cheek, 0 * y], 1)
    wh = sstep(-0.006, 0.008, L[:, 2]) * sstep(0.012, 0.02, y)
    wl = sstep(0.022, 0.012, y) * (1 - wh)
    wb = np.clip(1 - wh - wl, 0, 1)
    f = body * wb[:, None] + head * wh[:, None] + legd * wl[:, None]
    a, c, n = ear_coords(Q)
    we = sstep(-0.002, 0.004, a) * sstep(0.012, 0.009, np.abs(c)) * sstep(0.004, 0.0025, np.abs(n))
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
    r['ball'] = sstep(0.0003, 0.0001, c['ball']) * sstep(EYE.r + 0.001, EYE.r + 0.0003, de)
    El = EYE.loc(Pm)
    ua = El[:, 1] - EYE.off - EYE.slant * El[:, 0]
    ring = np.sqrt((El[:, 0] / (EYE.lid_w + 0.0007)) ** 2 + (ua / (EYE.lid_h + 0.0006)) ** 2)
    r['ring'] = ring
    r['lid'] = sstep(1.12, 0.9, ring) * (1 - r['ball']) * sstep(EYE.r + 0.003, EYE.r + 0.0018, de)
    r['head'] = sstep(-0.006, 0.006, L[:, 2]) * sstep(0.001, 0.0, c['head']) * sstep(0.012, 0.018, y)
    r['nose'] = sstep(0.0005, -0.0001, ellipsoid(L, V(0.0, 0.0004, NOSE_S - 0.0004), V(0.0038, 0.003, 0.0023))) * sstep(NOSE_S - 0.003, NOSE_S - 0.0012, L[:, 2]) * sstep(-0.0035, -0.0018, L[:, 1])
    r['cleft'] = sstep(0.0008, 0.0002, np.abs(L[:, 0])) * sstep(-0.0095, -0.008, L[:, 1]) * sstep(-0.0016, -0.003, L[:, 1]) * sstep(0.049, 0.052, L[:, 2])
    lipu = -0.0112 - 0.0006 * sstep(0.049, 0.043, L[:, 2])
    r['lip'] = sstep(0.0009, 0.0003, np.abs(L[:, 1] - lipu)) * sstep(0.036, 0.04, L[:, 2]) * r['head']
    a, cc, n = ear_coords(Pm)
    r['ea'], r['ec'], r['en'] = a, cc, n
    r['ear'] = sstep(0.0008, 0.0002, c['ear']) * sstep(-0.001, 0.003, a)
    r['earIn'] = sstep(-0.1, 0.4, Nm @ EAR_N)
    r['paw'] = sstep(0.0008, 0.0, c['paw']) * sstep(0.009, 0.005, y)
    r['claw'] = sstep(0.0003, 0.0, c['claw'])
    r['sole'] = sstep(-0.3, -0.8, N[:, 1]) * sstep(0.0025, 0.001, y)
    r['tail'] = sstep(0.0015, 0.0, c['tail']) * sstep(-0.076, -0.08, z)
    r['top'] = sstep(0.3, 0.85, N[:, 1])
    r['cheek'] = sstep(0.016, 0.009, np.linalg.norm((Pm - CHEEK) / V(1.0, 1.0, 0.8), axis=1)) * r['head']
    return r


K = {
    'gold': hexc(0xC98846), 'back': hexc(0xA76C34), 'tick': hexc(0x4A3220), 'light': hexc(0xDDA668), 'cream': hexc(0xEFE6D6),
    'white': hexc(0xF6F2EA), 'flash': hexc(0x6E5646), 'ear': hexc(0x8E7268), 'earIn': hexc(0xC89890), 'pink': hexc(0xE7AFA6),
    'pinkDk': hexc(0xC98880), 'nose': hexc(0xE19A98), 'noseDk': hexc(0xB06A6A), 'claw': hexc(0xEAE2D8), 'ball': hexc(0x050303),
    'lid': hexc(0x2A1C18),
}


def _lenk(Pm):
    L = HF.loc(Pm)
    hd = sstep(-0.006, 0.008, L[:, 2]) * sstep(0.012, 0.02, Pm[:, 1])
    lg = sstep(0.016, 0.008, Pm[:, 1])
    return np.clip(1.0 - 0.45 * hd - 0.45 * lg, 0.4, 1.4)


_scache = {}


def _strands(P, N, R):
    key = (len(P), float(P[:7].sum()))
    if key not in _scache:
        dens = 0.92 * (1 - R['nose']) * (1 - R['ball']) * (1 - R['claw']) * (1 - R['paw']) * (1 - 0.6 * R['lip']) * (1 - 0.8 * R['ear']) * sstep(EYE.r + 0.0006, EYE.r + 0.0016, R['eyeD'])
        _scache[key] = CV.strands(P, N, dens, flow, 0.0011, 0.0018, 0.0034, 0.00018, seed=87, lenk=lambda Q: _lenk(mirror(Q)))
    return _scache[key]


def _markings(R, Pm, N):
    """white belly, chest, chin, muzzle and lower cheeks; the dark cheek flash behind each pouch"""
    L = R['L']
    s, u = L[:, 2], L[:, 1]
    y, z = Pm[:, 1], Pm[:, 2]
    w1 = fbm(Pm * 500, 2, 41) - 0.5
    w2 = fbm(Pm * 140, 2, 42) - 0.5
    hd = R['head']
    up = N[:, 1]
    # the belly line runs low along the flanks and rises over the chest to the throat and the lower cheeks
    line = -0.25 + 0.08 * w2 + 0.04 * w1 + 0.3 * sstep(0.0, 0.03, z)
    belly = sstep(line + 0.12, line - 0.12, up) * (1 - hd)
    face = (sstep(-0.004 + 0.002 * w2, -0.009, u) + sstep(0.04, 0.048, s) * sstep(0.004, -0.002, u)) * hd
    cheekw = sstep(0.0, -0.008, u - 0.25 * (s - 0.03)) * sstep(0.008, 0.02, s) * hd
    white = np.clip(np.maximum.reduce([belly, face, cheekw]), 0, 1)
    # the cheek flash: a dark crescent behind the pouch, from under the ear down toward the shoulder
    fl = sstep(0.0035, 0.0015, np.abs(np.linalg.norm((Pm - (CHEEK + V(0.004, 0.004, -0.008))) / V(1.0, 1.4, 1.0), axis=1) - 0.0125 - 0.002 * w2))
    flash = fl * sstep(0.5, 0.1, N[:, 2]) * sstep(0.02, 0.026, Pm[:, 0]) * sstep(0.042, 0.03, y) * sstep(0.022, 0.03, y)
    return dict(white=white, flash=flash)


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    M = _markings(R, Pm, N)
    n1 = fbm(Pm * 90, 3, 11)
    n2 = fbm(Pm * 400, 3, 12)
    # golden: lighter low on the flanks, deeper along the back, with dark ticking
    col = np.tile(K['gold'], (len(P), 1))
    col = mix(col, K['light'], sstep(0.2, -0.3, N[:, 1]) * 0.45)
    col = mix(col, K['back'], R['top'] * 0.55 * (1 - R['head'] * 0.4))
    col *= (0.93 + 0.14 * n1)[:, None]
    col = mix(col, K['flash'], M['flash'] * 0.7)
    wht = mix(np.tile(K['white'], (len(P), 1)), K['cream'], 0.35 + 0.3 * (n1 - 0.5))
    col = mix(col, wht, M['white'])
    # ears: thin, nearly bare gray-pink skin
    col = mix(col, K['ear'], R['ear'] * (1 - R['earIn']) * 0.85)
    col = mix(col, K['earIn'], R['ear'] * R['earIn'] * 0.85)
    # pink hands, feet, nose and tail; pale claws
    pk = mix(np.tile(K['pink'], (len(P), 1)), K['pinkDk'], R['sole'] * 0.35 + 0.2 * (n2 - 0.5))
    col = mix(col, pk, R['paw'])
    col = mix(col, K['pink'], R['tail'] * 0.5)
    col = mix(col, K['claw'], R['claw'])
    nose = mix(np.tile(K['nose'], (len(P), 1)), K['noseDk'], sstep(0.4, 0.8, n2) * 0.25)
    col = mix(col, nose, R['nose'])
    col = mix(col, K['noseDk'], R['cleft'] * 0.5 + R['lip'] * 0.45)
    col = mix(col, K['lid'], R['lid'])
    # coat hairs: the golden ones with dark tips along the back, soft strokes elsewhere
    s, tone = _strands(P, N, R)
    col *= (1 + s * 0.22 * (tone - 0.4) - 0.05 * (1 - s))[:, None]
    tick = s * sstep(0.3, 0.12, tone) * (1 - M['white']) * R['top'] * (1 - R['paw'])
    col = mix(col, K['tick'], tick * 0.35)
    col = mix(col, K['ball'], R['ball'])
    rough = 0.7 + 0.06 * (n2 - 0.5) - 0.3 * R['nose'] - 0.4 * R['ball'] - 0.15 * R['paw']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    h = np.zeros(len(P), F)
    s, tone = _strands(P, N, R)
    h += 0.00002 * s * (1 - R['ball']) * (1 - R['nose']) * (1 - R['paw'])
    g1, _ = worley(Pm / 0.00025, 58)
    h -= 0.00001 * sstep(0.35, 0.1, g1) * np.maximum(R['nose'], R['paw'] * R['sole'])
    return h


def finish(C, ao, valid):
    return CV.finish(C, ao, valid, 0.45)


FUR = {'len': 0.012, 'n': 4, 'lean': 1.1, 'tile': 0.0008, 'babyLen': 1.25, 'babyLean': 0.55, 'shade': 0.68, 'quality': 80}


def fur(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y, z = Pm[:, 1], Pm[:, 2]
    ln = np.full(len(P), 0.0085, F)
    ln = ln + 0.002 * sstep(0.2, 0.8, N[:, 1])                                             # back
    ln = ln - 0.002 * sstep(-0.3, -0.8, N[:, 1])                                           # belly
    ln = ln * (1 - 0.55 * sstep(0.018, 0.01, y))                                           # low on the legs
    hd = R['head']
    face = 0.0035 + 0.0025 * R['cheek'] + 0.002 * sstep(0.02, 0.0, L[:, 2]) - 0.0015 * sstep(0.04, 0.048, L[:, 2])
    ln = ln * (1 - hd) + hd * face
    ln = ln * (1 - R['ear']) * (1 - R['paw']) * (1 - R['claw'])
    ln = ln * (1 - R['tail'] * 0.7)
    ln = ln * (1 - R['nose']) * (1 - R['lip']) * (1 - R['cleft']) * sstep(1.2, 1.6, R['ring'])
    return np.clip(ln, 0, FUR['len']).astype(F), np.ones(len(P), F)


MAP_QUALITY = (76, 72)
PAD_SMOOTH = 4


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': CV.lid_color(col, R['eyeD'], EYE.r)}


def meta(st):
    p, r, d, lid = EYE.meta()
    return {
        # shiny black eyes
        'eye': {'p': p, 'r': r, 'dir': d, 'lid': lid, 'iris': 0x0A0606, 'irisR': 0.97, 'pupilR': 0.6, 'rim': 0x050303, 'lidCol': st['lidCol'],
                'babyLidCol': 0xC09060},
        # no real neck: the band sits low on the fur between the head and the chest
        'collar': {'at': ['neck', 'head', 0.2], 'r': 0.8, 'w': 0.8, 'maxR': 0.04, 'lift': 0.25},
        'belly': [0.0, 0.012, -0.02],
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.22, 0.14, 0.08], 'flat': 0xC98846,
    }


# ---------- pups: a fuzzy little golden hamster, paler and softer ----------
BABY_TEX = 256


def baby_paint(P, N, c, col):
    R = _regions(P, N, c)
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['paw'] + R['ear'] + R['claw'], 0, 1)
    M = _markings(R, R['Pm'], N)
    out = mix(col, hexc(0xDDA870), 0.35 * (1 - keep) * (1 - M['white']))
    return np.clip(out, 0, 1).astype(F)


# ---------- hair cards: whiskers ----------
HAIR = {'size': (96, 128), 'cols': 3, 'base': (0.86, 0.82, 0.74), 'hi': (0.95, 0.92, 0.86), 'tip': (0.97, 0.95, 0.9), 'strands': 20,
        'root': 1.0, 'rough': 0.45, 'alpha': 0.35, 'seed': 29, 'quality': 80}


def hair_texture():
    import smallfur as SF
    wh = [(0.0, (0.82, 0.78, 0.72)), (1.0, (0.96, 0.94, 0.9))]
    whd = [(0.0, (0.3, 0.24, 0.2)), (0.3, (0.75, 0.7, 0.64)), (1.0, (0.95, 0.93, 0.88))]
    cols = [dict(kind='hair', stops=wh, n=12, wid=1.8, end=(0.95, 1.0), wave=0.02, root=1.0),
            dict(kind='hair', stops=whd, n=12, wid=1.8, end=(0.95, 1.0), wave=0.02, root=1.0),
            dict(kind='hair', stops=wh, n=12, wid=1.8, end=(0.95, 1.0), wave=0.02, root=1.0)]
    return SF.strand_texture((96, 128), cols, seed=31)


def cards():
    rows = []
    # whiskers: rows on the whisker pads, fine and fairly long (a hamster's reach about 2 to 3 cm)
    for i in range(8):
        r_, k_ = i // 3, i % 3
        s0 = 0.046 + 0.0035 * k_ + 0.001 * (rnd(i, 1) - 0.5)
        u0 = -0.0045 - 0.0022 * r_ + 0.0005 * (rnd(i, 2) - 0.5)
        root = HF.pt(s0, u0, 0.0075 + 0.001 * k_)
        d = nrm(V(0.85, 0.0, 0.0) + HF.a * (0.2 - 0.25 * k_ / 2) + HF.u * (0.15 - 0.12 * r_) + V(0, 0.05 * (rnd(i, 3) - 0.5), 0))
        rows.append((root, d, 0.022 + 0.008 * rnd(i, 4) - 0.002 * r_, 0.0004, 0.1, i % 2))
    out = []
    for sg in (1, -1):
        m = V(sg, 1, 1)
        out += CV.whiskers([(root * m, d * m, ln, w, droop, col) for root, d, ln, w, droop, col in rows], baby=0.6)
    roots = np.array([cd['pts'][0] for cd in out], F)
    g = CV.gradient(shape, roots, 0.0002)
    dd = shape(roots)
    for cd, gg, d0 in zip(out, g, dd):
        cd['pts'][0] = cd['pts'][0] - gg * (d0 + 0.0003)
    return out
