# American red squirrel, sculpted as a signed distance field around the game's squirrel skeleton
# (tools/blender/work/squirrel-rig.json). Units are meters in game rig space (x left, y up, z forward, ground at y = 0).
# A slim body with strong haunches and long hind feet, hands with long fingers and curved claws, a round head with
# big dark eyes in white rings, short rounded ears with dark tufts, whiskers, and the long bushy tail curled up over
# the back: a big round plume under the longest fur shells, with wispy locks of hair (cards) all around it, rusty
# in the middle, a black band toward the sides and a buff fringe. Rusty back, olive-orange flanks, a black line along the side, a white
# belly. The tail and the body get extra rings so the squirrel can sit up, climb and curl up.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length
import carnivore as CV
import smallfur as SF
from carnivore import local, local_n, mirror, groove, mix, hexc, rnd, wsum

ID = 'squirrel'
BOUNDS = (V(-0.08, 0.0, -0.225), V(0.08, 0.345, 0.185))
BAKE_DIST = (0.002, 0.008, 0.02)
DISSOLVE_DEGENERATE = True
TAIL_RINGS = 0

# ---------- landmarks (left side, +x) ----------
HF = CV.Frame(V(0.0, 0.157, 0.09), V(0.0, -0.14, 1.0), V(0.0, 1.0, 0.0))
EYE = CV.Eye(HF.pt(0.035, 0.0125, 0.0228), 0.0076, V(0.9, 0.24, 0.36), lid_w=0.0069, lid_h=0.0063, off=0.0003, slant=0.08,
             mound=(0.0022, 0.002, 0.0008), sink=0.06)
NOSE_S = 0.0765
MOUTH = HF.pt(0.066, -0.0135)
EAR_B = V(0.0165, 0.176, 0.094)
EAR_A = nrm([0.28, 0.94, -0.18])
EAR_N = nrm([0.35, 0.05, 1.0])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
EAR_L, EAR_W = 0.022, 0.0098
XF, XH = 0.031, 0.043
HAND = V(XF, 0.0, 0.07)
HEEL = V(XH, 0.0, -0.079)
TOEC = V(XH - 0.001, 0.0, 0.004)
KNEE = V(XH + 0.002, 0.06, -0.008)
PATCHES = [
    (EYE.c * V(0, 1, 1) + V(0.012, -0.012, -0.012), EYE.c * V(0, 1, 1) + V(0.034, 0.012, 0.013), 0.0003),   # eye and lids
    (HF.pt(0.056, 0.0) * V(0, 1, 1) + V(0.0, -0.024, 0.0), HF.pt(0.082, 0.0) * V(0, 1, 1) + V(0.016, 0.012, 0.003), 0.0003),  # muzzle
    (V(0.006, 0.168, 0.078), V(0.036, 0.205, 0.108), 0.0004),                                                  # ears
    (V(0.016, -0.0005, 0.055), V(0.048, 0.012, 0.09), 0.0003),                                                 # hands
    (V(0.026, -0.0005, -0.01), V(0.062, 0.012, 0.024), 0.0003),                                                # hind toes
]

# trunk: z, top, yw (height of widest), bottom, half width, exponents above, below
TRUNK = [
    (-0.118, 0.118, 0.1, 0.083, 0.016, 2.0, 2.0),
    (-0.106, 0.134, 0.099, 0.068, 0.031, 2.1, 2.0),
    (-0.082, 0.145, 0.098, 0.057, 0.041, 2.2, 2.1),
    (-0.048, 0.148, 0.098, 0.054, 0.043, 2.2, 2.2),
    (-0.012, 0.145, 0.098, 0.056, 0.041, 2.2, 2.2),
    (0.022, 0.14, 0.099, 0.058, 0.039, 2.2, 2.1),
    (0.05, 0.137, 0.1, 0.058, 0.036, 2.1, 2.0),
    (0.072, 0.136, 0.104, 0.062, 0.03, 2.0, 2.0),
    (0.09, 0.135, 0.11, 0.076, 0.021, 2.0, 2.0),
]
NECK = [
    (0.112, 0.055, 0.026, 0.03, 0.026, 2.0, 2.0),
    (0.126, 0.075, 0.023, 0.026, 0.023, 2.0, 2.0),
    (0.142, 0.09, 0.021, 0.023, 0.021, 2.0, 2.0),
    (0.155, 0.1, 0.02, 0.021, 0.02, 2.0, 2.0),
]
HEAD = [
    (-0.006, 0.019, -0.002, -0.021, 0.019, 2.2, 2.0),
    (0.008, 0.027, -0.002, -0.027, 0.027, 2.4, 2.1),
    (0.024, 0.0295, -0.003, -0.028, 0.0295, 2.5, 2.2),
    (0.04, 0.026, -0.004, -0.026, 0.027, 2.5, 2.3),
    (0.053, 0.0195, -0.005, -0.0225, 0.021, 2.4, 2.3),
    (0.064, 0.0142, -0.006, -0.0182, 0.0162, 2.3, 2.3),
    (0.0715, 0.0098, -0.006, -0.0142, 0.0122, 2.3, 2.3),
    (0.0772, 0.0048, -0.006, -0.0098, 0.0074, 2.2, 2.2),
]
FOOT = [
    (-0.084, 0.014, 0.008, 0.002, 0.0055, 2.0, 2.0),
    (-0.075, 0.017, 0.008, 0.0, 0.0072, 2.0, 2.2),
    (-0.05, 0.013, 0.0065, 0.0, 0.0078, 2.0, 2.4),
    (-0.022, 0.0105, 0.0055, 0.0, 0.008, 2.0, 2.4),
    (-0.002, 0.0085, 0.0045, 0.0, 0.0078, 2.0, 2.4),
    (0.006, 0.006, 0.0035, 0.0, 0.006, 2.0, 2.2),
]
# the tail plume: path (y, z), section toward the path normal, the other way, half width across (flattened: the hairs
# grow out to the sides)
_TW = [0.0125, 0.021, 0.031, 0.0375, 0.041, 0.0413, 0.04, 0.037, 0.0307, 0.019]
TAIL = [(y, z, w * 0.85, w * 0.85, w) for (y, z), w in zip([(0.106, -0.104), (0.113, -0.124), (0.132, -0.151), (0.166, -0.17), (0.205, -0.177),
                                                            (0.244, -0.169), (0.272, -0.147), (0.285, -0.118), (0.285, -0.089), (0.277, -0.068)], _TW)]


def _tail_keys():
    return [(y, z, t, b, w, 2.2, 2.2) for y, z, t, b, w in TAIL]


def _tail_poly(n=80):
    from scipy.interpolate import PchipInterpolator
    K_ = np.array([(y, z) for y, z, *_ in TAIL], np.float64)
    seg = np.linalg.norm(np.diff(K_, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    f = PchipInterpolator(s, K_, axis=0)
    ss = np.linspace(0, s[-1], n)
    yz = f(ss)
    return np.stack([np.zeros(n), yz[:, 0], yz[:, 1]], 1), ss / s[-1]


_TP, _TT = _tail_poly()


def tail_t(P):
    """position along the tail (0 base .. 1 tip) and distance from its middle line, for mirrored points (nearest
    sample of the middle line, in chunks so big texel sets stay small in memory)"""
    from scipy.spatial import cKDTree
    tr = _tail_tree()
    yz = np.stack([np.zeros(len(P)), P[:, 1], P[:, 2]], 1).astype(np.float64)
    d, k = tr.query(yz)
    return _TT[k].astype(F), d.astype(F), k


_TREE = []


def _tail_tree():
    if not _TREE:
        from scipy.spatial import cKDTree
        _TREE.append(cKDTree(_TP))
    return _TREE[0]


def trunk(P):
    Q = mirror(P)
    d = loft(Q, TRUNK)
    d = smin(d, ellipsoid(Q, V(0.02, 0.122, 0.052), V(0.016, 0.022, 0.024)), 0.014)      # shoulders
    d = smin(d, ellipsoid(Q, V(0.0, 0.082, 0.07), V(0.024, 0.028, 0.024)), 0.014)       # chest
    return d


def neck(P):
    return sweep(mirror(P), NECK)


def head(P):
    Q = mirror(P)
    L = HF.loc(Q)
    d = loft(L, HEAD)
    d = smin(d, ellipsoid(L, V(0.017, -0.012, 0.03), V(0.011, 0.013, 0.018)), 0.008)           # cheeks
    d = smin(d, ellipsoid(L, V(0.0056, -0.009, 0.0655), V(0.0066, 0.0062, 0.0088)), 0.003)    # whisker pads
    d = smin(d, ellipsoid(L, V(0.0, -0.0155, 0.059), V(0.0055, 0.0036, 0.009)), 0.004)         # chin
    d = smin(d, ellipsoid(L, V(0.0, -0.0025, NOSE_S + 0.0002), V(0.0046, 0.0038, 0.0034)), 0.0025)   # nose
    M = L * V(1, 2.5, 1)
    m = round_cone(M, V(0.0, -0.0135 * 2.5, 0.07), V(0.0048, -0.0145 * 2.5, 0.066), 0.0006, 0.0006)
    m = smin(m, round_cone(M, V(0.0048, -0.0145 * 2.5, 0.066), V(0.0084, -0.014 * 2.5, 0.058), 0.0006, 0.0004), 0.001)
    d = smax(d, -(m + 0.0003) / 2.5, 0.0007)
    cleft = np.maximum(np.abs(L[:, 0]) - 0.0004, np.maximum(L[:, 1] - (-0.0058), -0.0132 - L[:, 1]))
    d = smax(d, -(cleft + 0.0001), 0.0005)
    for sg in (1,):
        nc = V(0.0021, -0.0018, NOSE_S + 0.0028)
        d = smax(d, -ellipsoid(L, nc, V(0.0009, 0.0007, 0.0011)), 0.0005)
    return d


def eye_parts(P):
    Q = mirror(P)
    carve, lids, ball = EYE.parts(Q)
    L = EYE.loc(Q)
    brow = round_cone(L, V(-0.008, 0.0068, -0.003), V(0.006, 0.0075, -0.0035), 0.0028, 0.002)
    return carve, lids, ball, brow


def ear(P):
    Q = mirror(P)
    return CV.ear(Q, EAR_B, EAR_A, EAR_N, EAR_L, EAR_W, 'round', th0=0.0032, th1=0.0017, cup=0.5, tipin=-0.0012,
                  base_r=(0.0058, 0.0046, 0.004))


def fleg(P):
    Q = mirror(P)
    d = ellipsoid(Q, V(XF - 0.004, 0.082, 0.056), V(0.0155, 0.027, 0.02))
    d = smin(d, round_cone(Q, V(XF, 0.062, 0.054), V(XF, 0.008, 0.067), 0.0098, 0.0058), 0.009)
    d = smin(d, ellipsoid(Q, V(XF, 0.007, 0.068), V(0.0058, 0.006, 0.0062)), 0.004)
    return d


def hleg(P):
    Q = mirror(P)
    d = ellipsoid(Q, V(XH - 0.009, 0.088, -0.056), V(0.026, 0.045, 0.048))
    d = smin(d, ellipsoid(Q, V(XH - 0.004, 0.066, -0.022), V(0.02, 0.028, 0.03)), 0.014)
    d = smin(d, ellipsoid(Q, V(XH - 0.003, 0.042, -0.068), V(0.016, 0.024, 0.026)), 0.012)
    d = smin(d, round_cone(Q, KNEE, HEEL + V(0.0, 0.014, 0.004), 0.0105, 0.0065), 0.01)
    Fq = Q - V(XH, 0.0, 0.0)
    d = smin(d, loft(Fq, FOOT, mirror_x=False), 0.008)
    return d


FINGERS = [(-38, 0.0034, 0.0085, 0.0014), (-13, 0.0041, 0.0105, 0.0015), (11, 0.0041, 0.0108, 0.0015), (35, 0.0035, 0.0088, 0.0014),
           (72, 0.0024, 0.0024, 0.0012)]
TOES = [(-42, 0.0034, 0.0095, 0.0015), (-18, 0.0044, 0.0125, 0.0016), (2, 0.0047, 0.013, 0.0016), (21, 0.0044, 0.012, 0.0016),
        (45, 0.0034, 0.0085, 0.0015)]


def paws(P):
    Q = mirror(P)
    a, ca = CV.hand(Q, HAND, FINGERS, (0.0052, 0.003, 0.0058), yaw=0.08, claw=(0.0026, 0.0006), palm_c=(0.0, -0.002))
    b, cb = CV.hand(Q, TOEC, TOES, (0.0062, 0.0034, 0.006), yaw=0.04, claw=(0.0026, 0.0006), palm_c=(0.0, -0.003))
    return np.minimum(a, b), np.minimum(ca, cb)


def tail(P):
    return sweep(mirror(P), _tail_keys(), n=64)


def parts(P):
    ca, li, ba, br = eye_parts(P)
    pw, cl = paws(P)
    return {'trunk': trunk(P), 'neck': neck(P), 'head': head(P), 'ear': ear(P), 'lids': li, 'ball': ba, 'fleg': fleg(P), 'hleg': hleg(P),
            'paw': pw, 'claw': cl, 'tail': tail(P)}


def shape(P):
    d = trunk(P)
    d = smin(d, local(P, (-0.05, 0.07, 0.03), (0.05, 0.19, 0.13), neck), 0.014)
    h = local(P, (-0.05, 0.11, 0.06), (0.05, 0.2, 0.185), head)
    ca, li, ba, br = local_n(P, (-0.04, 0.155, 0.11), (0.04, 0.185, 0.145), eye_parts, 4)
    h = smin(h, li, 0.002)
    h = smin(h, br, 0.004)
    h = smax(h, -ca, 0.0008)
    h = smin(h, ba, 0.0004)
    d = smin(d, h, 0.014)
    d = smin(d, local(P, (-0.045, 0.16, 0.07), (0.045, 0.215, 0.115), ear), 0.003)
    d = smin(d, local(P, (-0.06, 0.0, 0.025), (0.06, 0.115, 0.095), fleg), 0.01)
    d = smin(d, local(P, (-0.075, -0.002, -0.115), (0.075, 0.14, 0.02), hleg), 0.014)
    pw, cl = local_n(P, (-0.065, -0.002, -0.015), (0.065, 0.012, 0.092), paws, 2)
    d = smin(d, pw, 0.0025)
    d = np.minimum(d, cl)
    d = smin(d, local(P, (-0.065, 0.075, -0.225), (0.065, 0.34, -0.03), tail), 0.012)
    return d


PREVIEW = {
    'side': ((1.0, 0.16, -0.02), (0, 0.14, -0.02), 30),
    'front3q': ((0.55, 0.3, 0.6), (0, 0.13, 0.0), 30),
    'front': ((0.0, 0.18, 0.9), (0, 0.15, 0.0), 26),
    'rear3q': ((-0.5, 0.35, -0.65), (0, 0.15, -0.05), 30),
    'top': ((0.002, 1.0, 0.0), (0, 0.15, 0.0), 30),
    'face': ((0.1, 0.18, 0.34), (0, 0.155, 0.13), 24),
    'faceside': ((0.28, 0.17, 0.13), (0.0, 0.16, 0.13), 24),
    'feet': ((0.2, 0.05, 0.2), (0.035, 0.01, 0.0), 30),
    'tail': ((0.5, 0.22, -0.35), (0, 0.2, -0.13), 26),
}


# ---------- game mesh ----------
KEEP = (0.44, 0.8, 0.6, 0.72, 0.58, 0.58, 0.42)


def keep(P):
    Pm = mirror(P)
    tt, td, _ = tail_t(Pm)
    tl = sstep(-0.1, -0.115, Pm[:, 2]) * sstep(0.04, 0.03, td)
    base = KEEP[0] + (KEEP[6] - KEEP[0]) * tl
    e = sstep(0.016, 0.008, np.linalg.norm(Pm - EYE.c, axis=1)) * KEEP[1]
    L = HF.loc(Pm)
    hd = sstep(-0.006, 0.01, L[:, 2]) * sstep(0.125, 0.14, Pm[:, 1]) * KEEP[2]
    m = sstep(0.054, 0.064, L[:, 2]) * sstep(-0.024, -0.016, L[:, 1]) * KEEP[3]
    a, c, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    er = sstep(-0.004, 0.0, a) * sstep(0.014, 0.01, np.abs(c)) * sstep(0.006, 0.003, np.abs(n)) * KEEP[4]
    pw = sstep(0.012, 0.006, Pm[:, 1]) * KEEP[5]
    return np.maximum.reduce([base, e, hd, m, er, pw]).astype(F)


def lowpoly_fix(bm, hi):
    """rings across the body and along the tail, so the squirrel sits up, climbs and curls up smoothly"""
    import meshfix as MX
    tr = MX.tree(hi)
    MX.rings(bm, tr, (0.0, 0.1, 0.07), (0.0, 0.1, -0.105), 0.014, lambda c, p0, r: c.y > 0.035 and r < 0.06)
    pts = [V(0, y, z) for y, z, *_ in TAIL]
    for a, b in zip(pts[:-1], pts[1:]):
        MX.rings(bm, tr, a, b, 0.015, lambda c, p0, r: r < 0.03 and c.z < -0.098)
    MX.finish(bm, 2e-9)


UV_AVERAGE = True


def uv_regions(P):
    Pm = mirror(P)
    L = HF.loc(Pm)
    y, z = Pm[:, 1], Pm[:, 2]
    tt, td, _ = tail_t(Pm)
    lab = np.full(len(P), 2)
    head = (L[:, 2] > -0.002) & (y > 0.125)
    neck = ~head & (z > 0.05) & (y > 0.1)
    fleg = (z > 0.03) & (y < 0.085) & ~neck
    hleg = (z <= 0.03) & (z > -0.1) & (np.abs(Pm[:, 0]) > 0.024) & (y < 0.12)
    foot = hleg & (y < 0.02)
    tl = (z < -0.1) & (td < 0.03) & (y > 0.09)
    lab[neck] = 1
    lab[head] = 0
    lab[fleg] = 3
    lab[hleg] = 5
    lab[foot] = 6
    lab[tl & (tt < 0.5)] = 7
    lab[tl & (tt >= 0.5)] = 8
    return lab


def uv_weight(P):
    Pm = mirror(P)
    L = HF.loc(Pm)
    head = sstep(-0.006, 0.01, L[:, 2]) * sstep(0.12, 0.14, Pm[:, 1])
    paw = sstep(0.012, 0.005, Pm[:, 1])
    tt, td, _ = tail_t(Pm)
    tl = sstep(-0.1, -0.115, Pm[:, 2]) * sstep(0.04, 0.03, td)
    return (0.92 + 0.75 * head + 0.3 * paw - 0.15 * tl).astype(F)


WEIGHT_SMOOTH = (5, 0.5)
TAIL_BONES = ['tail1', 'tail2', 'tail3', 'tail4']


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['head'], 'head': HF.pt(0.085, 0.0),
         'tail1': P['tail2'], 'tail2': P['tail3'], 'tail3': P['tail4'], 'tail4': V(0, 0.277, -0.068)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (TOEC + V(0, 0.003, 0.014)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (HAND + V(0, 0.003, 0.012)) * m
        t['ear' + s] = (EAR_B + EAR_A * EAR_L) * m
    return t


# the tail bones' rest positions (rig) and where along the tail's middle line each one starts
_TB = {'tail1': V(0, 0.103, -0.11), 'tail2': V(0, 0.15, -0.165), 'tail3': V(0, 0.225, -0.175), 'tail4': V(0, 0.28, -0.135)}


def _tb_t():
    out = []
    for b in TAIL_BONES:
        p = _TB[b]
        d = np.linalg.norm(_TP[:, 1:] - p[1:], axis=1)
        out.append(float(_TT[d.argmin()]))
    return out


TB_T = _tb_t()


def tail_weights(t):
    """bone weights along the tail at t (0..1): each bone from its start to the next one's, blended over a short span"""
    w = np.zeros((len(t), 4), F)
    edges = TB_T[1:]
    for i in range(4):
        lo = sstep(edges[i - 1] - 0.05, edges[i - 1] + 0.05, t) if i > 0 else np.ones_like(t)
        hi = 1 - sstep(edges[i] - 0.05, edges[i] + 0.05, t) if i < 3 else np.ones_like(t)
        w[:, i] = lo * hi
    return w / np.maximum(w.sum(1, keepdims=True), 1e-9)


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    W[:, bi['ctag']] = 0
    x = wpos[:, 0]
    Pm = mirror(wpos)
    y, z = Pm[:, 1], Pm[:, 2]
    for b in names:
        if b.endswith('L') and b[:-1] + 'R' in bi:
            r = bi[b[:-1] + 'R']; l = bi[b]
            pos = x > 0.003
            W[pos, l] += W[pos, r]; W[pos, r] = 0
            neg = x < -0.003
            W[neg, r] += W[neg, l]; W[neg, l] = 0
    # the tail: by position along its middle line, blending into the hips at its root
    tt, td, _ = tail_t(Pm)
    on = (z < -0.098) & (td < 0.035) & (y > 0.085)
    if on.any():
        tw = tail_weights(tt[on])
        k = sstep(-0.098, -0.112, z[on])[:, None]
        rows = np.zeros((on.sum(), W.shape[1]), F)
        for i, b in enumerate(TAIL_BONES):
            rows[:, bi[b]] = tw[:, i]
        W[on] = W[on] * (1 - k) + rows * k
    a, c, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    eon = (ear(wpos) < 0.0008) & (a > -0.001)
    k = sstep(-0.001, 0.005, a)
    for s, sg in (('L', 1), ('R', -1)):
        CV.set_part(W, bi, eon & (x * sg > 0), 'ear' + s, k)
    # the haunch follows the thigh, blending into the hips over its upper part (no fold where they meet)
    for s, sg in (('L', 1), ('R', -1)):
        hn = (x * sg > 0.018) & (y > 0.02) & (y < 0.135) & (z < 0.02) & (z > -0.11) & (hleg(wpos) < 0.0025)
        CV.set_part(W, bi, hn, 'thigh' + s, 0.75 * sstep(0.11, 0.075, y) * sstep(0.018, 0.03, np.abs(x)))
    for s, sg in (('L', 1), ('R', -1)):
        near = (np.abs(x - sg * HAND[0]) < 0.014) & (z > HAND[2] - 0.004) & (z < HAND[2] + 0.022) & (y < 0.007)
        CV.set_part(W, bi, near, 'fpaw' + s, sstep(0.007, 0.0035, y))
        ft = (np.abs(x - sg * XH) < 0.016) & (y < 0.02) & (z < 0.03) & (z > -0.09)
        CV.set_part(W, bi, ft, 'hmeta' + s, sstep(0.02, 0.012, y))
        CV.set_part(W, bi, ft, 'hpaw' + s, sstep(-0.012, 0.0, z) * sstep(0.014, 0.008, y))
    s = W.sum(1, keepdims=True)
    return W / np.maximum(s, 1e-9)


# ---------- coat ----------
def tail_dir(Pm):
    tt, td, k = tail_t(Pm)
    k2 = np.clip(k + 1, 0, len(_TP) - 1); k1 = np.clip(k - 1, 0, len(_TP) - 1)
    t = _TP[k2] - _TP[k1]
    return (t / np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-9)).astype(F)


def flow(P, N=None):
    """from the nose back over the head, along the body to the tail, down the legs; on the tail out to both sides and
    along it toward the tip"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    one = np.ones_like(y)
    body = np.stack([0.25 * sstep(0.012, 0.035, x), -(0.12 + 0.8 * sstep(0.1, 0.065, y)), -one], 1)
    legd = np.stack([0 * y, -one, -0.1 * one], 1)
    L = HF.loc(Q)
    cheek = sstep(0.0, -0.015, L[:, 1]) * sstep(0.06, 0.03, L[:, 2])
    head = -HF.a[None, :] + np.stack([0.35 * sstep(0.003, 0.02, x) + 0.4 * cheek, -0.35 * cheek, 0 * y], 1)
    td_ = tail_dir(Q)
    tt, tdist, _ = tail_t(Q)
    taild = td_ + np.stack([1.1 * sstep(0.002, 0.01, x), 0 * y, 0 * y], 1)
    wh = sstep(-0.006, 0.01, L[:, 2]) * sstep(0.125, 0.14, y)
    wt = sstep(-0.1, -0.112, z) * sstep(0.04, 0.03, tdist)
    wl = sstep(0.07, 0.045, y) * (1 - wh) * (1 - wt) * sstep(0.004, 0.012, x)
    wb = np.clip(1 - wh - wl - wt, 0, 1)
    f = body * wb[:, None] + head * wh[:, None] + legd * wl[:, None] + taild * wt[:, None]
    a, c, n = CV.ear_coords(Q, EAR_B, EAR_A, EAR_N)
    we = sstep(-0.002, 0.004, a) * sstep(0.016, 0.011, np.abs(c)) * sstep(0.006, 0.004, np.abs(n))
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
    ring = np.sqrt((El[:, 0] / (EYE.lid_w + 0.0012)) ** 2 + (ua / (EYE.lid_h + 0.0011)) ** 2)
    r['ring'] = ring
    r['lid'] = sstep(1.12, 0.9, ring) * (1 - r['ball']) * sstep(EYE.r + 0.005, EYE.r + 0.0028, de)
    r['head'] = sstep(-0.006, 0.008, L[:, 2]) * sstep(0.003, 0.0, c['head']) * sstep(0.122, 0.135, y)
    r['nose'] = sstep(0.0008, 0.0, ellipsoid(L, V(0.0, -0.0025, NOSE_S + 0.0002), V(0.005, 0.0042, 0.0038))) * sstep(NOSE_S - 0.004, NOSE_S - 0.0015, L[:, 2])
    lipu = -0.0135 - 0.0008 * sstep(0.066, 0.058, L[:, 2])
    r['lip'] = sstep(0.0012, 0.0005, np.abs(L[:, 1] - lipu)) * sstep(0.056, 0.06, L[:, 2]) * r['head']
    a, cc, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    r['ea'], r['ec'] = a, cc
    r['ear'] = sstep(0.0012, 0.0003, c['ear']) * sstep(-0.001, 0.003, a)
    r['earIn'] = sstep(-0.15, 0.35, Nm @ EAR_N)
    r['paw'] = sstep(0.001, 0.0, c['paw']) * sstep(0.01, 0.006, y)
    r['pad'] = sstep(-0.2, -0.75, N[:, 1]) * sstep(0.002, 0.0006, y)
    r['claw'] = sstep(0.0004, 0.0, c['claw'])
    tt, td, _ = tail_t(Pm)
    r['tt'] = tt
    r['tail'] = sstep(0.003, 0.0, c['tail']) * sstep(-0.098, -0.11, z)
    # across the flattened tail: 0 in the middle of its top or bottom, 1 at the side edges
    r['tedge'] = sstep(0.012, 0.036, np.abs(x)) * r['tail']
    r['top'] = sstep(0.3, 0.85, N[:, 1])
    # on the hind leg rather than the trunk (the white belly stops at the haunch)
    r['onleg'] = sstep(0.002, -0.002, c['hleg'] - c['trunk'])
    return r


K = {
    'rust': hexc(0x9E5028), 'back': hexc(0x753E22), 'side': hexc(0x985636), 'olive': hexc(0x84694E), 'belly': hexc(0xEFE9DD),
    'line': hexc(0x241A14), 'tail': hexc(0x9C5028), 'tailDk': hexc(0x2E1E16), 'fringe': hexc(0xC9935E), 'ear': hexc(0x8C4A2A),
    'earIn': hexc(0xC08A70), 'feet': hexc(0xB06A3A), 'ring': hexc(0xF2ECE0), 'nose': hexc(0x4A3028), 'noseDk': hexc(0x2A1A16),
    'lip': hexc(0x3A2416), 'claw': hexc(0x3C2E26), 'pad': hexc(0x5A4038), 'ball': hexc(0x0C0806),
}


def _lenk(Pm):
    L = HF.loc(Pm)
    hd = sstep(-0.006, 0.01, L[:, 2]) * sstep(0.125, 0.14, Pm[:, 1])
    lg = sstep(0.06, 0.03, Pm[:, 1])
    tt, td, _ = tail_t(Pm)
    tl = sstep(-0.1, -0.115, Pm[:, 2]) * sstep(0.035, 0.025, td)
    return np.clip(1.0 - 0.45 * hd - 0.4 * lg + 0.7 * tl, 0.4, 1.8)


_scache = {}


def _strands(P, N, R):
    key = (len(P), float(P[:7].sum()))
    if key not in _scache:
        dens = 0.9 * (1 - R['nose']) * (1 - R['ball']) * (1 - R['claw']) * (1 - R['pad'] * R['paw']) * (1 - 0.6 * R['lip']) * sstep(EYE.r + 0.001, EYE.r + 0.003, R['eyeD'])
        _scache[key] = CV.strands(P, N, dens, flow, 0.0018, 0.0028, 0.005, 0.00034, seed=83, lenk=lambda Q: _lenk(mirror(Q)))
    return _scache[key]


def _markings(R, Pm, N):
    """white belly with the black line above it along the side, white eye ring, white chin and throat, the tail's black
    band toward its edges"""
    L = R['L']
    s, u = L[:, 2], L[:, 1]
    y, z = Pm[:, 1], Pm[:, 2]
    w1 = fbm(Pm * 500, 2, 41) - 0.5
    w2 = fbm(Pm * 150, 2, 42) - 0.5
    hd = R['head']
    up = N[:, 1]
    line_b = -0.3 + 0.05 * w2 + 0.025 * w1 + 0.1 * sstep(0.05, 0.1, z)
    belly = sstep(line_b + 0.07, line_b - 0.07, up) * (1 - hd) * (1 - R['tail']) * sstep(0.1, 0.085, y) * (1 - 0.85 * R['onleg'])
    leg_in = sstep(0.0, -0.6, R['Nm'][:, 0]) * sstep(0.07, 0.05, y) * sstep(0.02, 0.03, y) * sstep(0.0, 0.025, z)
    face = sstep(-0.0105 + 0.001 * w2, -0.0125, u) * hd * sstep(0.02, 0.04, s)
    throat = sstep(0.06, 0.09, z) * sstep(-0.1, -0.5, up) * (1 - hd * sstep(0.04, 0.06, s))
    cream = np.clip(np.maximum.reduce([belly, face, throat, leg_in * 0.6]) * (1 - R['paw']), 0, 1)
    # black line: a band just above the belly edge, from behind the front leg to before the hind leg
    lb = line_b + 0.13
    line = sstep(0.07, 0.025, np.abs(up - lb)) * sstep(-0.04, -0.02, z) * sstep(0.05, 0.03, z) * (1 - hd) * sstep(0.09, 0.075, y) * sstep(0.05, 0.065, y) * (1 - R['onleg'])
    ring = sstep(1.42 + 0.1 * w2, 1.2, R['ring']) * (1 - R['lid']) * (1 - R['ball']) * sstep(EYE.r + 0.007, EYE.r + 0.004, R['eyeD'])
    tband = R['tail'] * sstep(0.35, 0.7, R['tedge'] + 0.2 * w2)
    tdark = R['tail'] * sstep(0.85, 0.95, R['tt'])
    tfringe = R['tail'] * sstep(0.85, 1.0, R['tedge'] + 0.15 * w2)
    return dict(cream=cream, line=line * (1 - cream), ring=ring, tband=tband * (1 - tfringe), tdark=tdark, tfringe=tfringe)


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y, z = Pm[:, 1], Pm[:, 2]
    M = _markings(R, Pm, N)
    n1 = fbm(Pm * 40, 3, 11)
    n2 = fbm(Pm * 160, 3, 12)
    col = np.tile(K['side'], (len(P), 1))
    col = mix(col, K['back'], R['top'] * 0.75)
    col = mix(col, K['olive'], sstep(0.35, -0.05, N[:, 1]) * sstep(-0.35, -0.05, N[:, 1]) * 0.5 * (1 - R['tail']) * (1 - R['head']))
    col = mix(col, K['rust'], R['head'] * sstep(-0.004, 0.012, L[:, 1]) * 0.5)
    col *= (0.92 + 0.16 * n1)[:, None]
    col = mix(col, K['feet'], sstep(0.045, 0.015, y) * (1 - R['claw']) * 0.65)
    # tail: rusty plume, the black band toward its edges, a darker tip
    col = mix(col, K['tail'], R['tail'] * (1 - R['tedge']) * 0.8)
    col = mix(col, K['tailDk'], M['tband'] * 0.25 + M['tdark'] * 0.3)
    col = mix(col, K['fringe'], M['tfringe'] * 0.15)
    cr = mix(np.tile(K['belly'], (len(P), 1)), K['ring'], R['head'])
    col = mix(col, cr * (0.95 + 0.1 * n2[:, None]), M['cream'])
    col = mix(col, K['line'], M['line'] * 0.85)
    col = mix(col, K['ring'], M['ring'] * 0.95)
    col = mix(col, K['ear'], R['ear'] * 0.6)
    col = mix(col, K['earIn'], R['ear'] * R['earIn'] * sstep(0.003, 0.008, R['ea']) * 0.5)
    col = mix(col, K['lip'], R['lip'] * 0.8)
    col = mix(col, K['line'], R['lid'])
    col = mix(col, mix(np.tile(K['nose'], (len(P), 1)), K['noseDk'], sstep(-0.3, -0.9, N[:, 1]) * 0.6), R['nose'])
    col = mix(col, K['pad'], R['pad'] * R['paw'])
    col = mix(col, K['claw'], R['claw'])
    s, tone = _strands(P, N, R)
    col *= (1 + s * 0.22 * (tone - 0.4) - 0.04 * (1 - s))[:, None]
    # buff and black ticking on the back and the tail
    tick = s * sstep(0.85, 0.95, tone) * (1 - M['cream']) * (1 - M['ring'])
    col = mix(col, K['fringe'], tick * 0.4)
    # black tipped guard hairs: a grizzled back and a grizzled tail, most along their tops
    gh = s * sstep(0.25, 0.12, tone) * (1 - M['cream']) * (1 - M['ring']) * (1 - R['nose']) * (0.45 * R['top'] + 0.25 + 0.1 * R['tail'])
    col = mix(col, K['tailDk'], np.clip(gh, 0, 1) * 0.6)
    col = mix(col, K['ball'], R['ball'])
    rough = 0.62 + 0.08 * (n2 - 0.5) - 0.3 * R['nose'] - 0.25 * R['lid'] - 0.15 * R['lip'] - 0.25 * R['claw']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    h = np.zeros(len(P), F)
    s, tone = _strands(P, N, R)
    h += 0.00003 * s * (1 - R['ball']) * (1 - R['nose'])
    g1, _ = worley(Pm / 0.0003, 58)
    h -= 0.000012 * sstep(0.35, 0.1, g1) * R['nose']
    return h


def finish(C, ao, valid):
    return CV.finish(C, ao, valid, 0.45)


FUR = {'len': 0.03, 'n': 5, 'lean': 0.75, 'tile': 0.0012, 'babyLen': 1.3, 'babyLean': 0.45, 'shade': 0.62, 'quality': 80}


def fur(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y = Pm[:, 1]
    ln = np.full(len(P), 0.011, F)
    ln = ln + 0.003 * sstep(-0.3, -0.8, N[:, 1]) * (1 - R['tail'])
    ln = ln * (1 - 0.5 * sstep(0.06, 0.025, y) * (1 - R['tail']))
    hd = R['head']
    ln = ln * (1 - hd) + hd * (0.0045 + 0.004 * sstep(0.035, 0.015, L[:, 2]) * sstep(0.0, -0.012, L[:, 1]) - 0.0015 * sstep(0.06, 0.074, L[:, 2]))
    ln = ln * (1 - R['paw'] * 0.7) * (1 - R['ear'] * 0.6)
    tl = R['tail']
    ln = ln * (1 - tl) + tl * (0.025 + 0.005 * R['tedge']) * (0.7 + 0.3 * sstep(0.0, 0.25, R['tt']))
    # no fur over the eye ring or the eye: the ring is painted and stays flat
    ln = ln * (1 - R['nose']) * (1 - R['lip']) * (1 - R['claw']) * (1 - R['pad'] * R['paw']) * sstep(1.3, 1.7, R['ring'])
    return np.clip(ln, 0, FUR['len']).astype(F), np.ones(len(P), F)


MAP_QUALITY = (74, 72)
PAD_SMOOTH = 3


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': CV.lid_color(col, R['eyeD'], EYE.r)}


def meta(st):
    p, r, d, lid = EYE.meta()
    return {
        'eye': {'p': p, 'r': r, 'dir': d, 'lid': [1.05, -1.05, 0.12], 'iris': 0x1C120C, 'irisR': 0.95, 'pupilR': 0.58, 'rim': 0x080503, 'lidCol': 0x5E4A3C},
        # (the slice through the neck also meets the tail tip curled up over the back: maxR ignores it)
        'collar': {'at': ['neck', 'head', 0.4], 'maxR': 0.045},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.18, 0.1, 0.05], 'flat': 0x9C5632,
    }


# ---------- hair cards: whiskers, ear tufts, the tail's locks ----------
def hair_texture():
    blk = [(0.0, (0.06, 0.045, 0.035)), (1.0, (0.16, 0.13, 0.11))]
    tuft = [(0.0, (0.3, 0.16, 0.08)), (0.4, (0.16, 0.09, 0.05)), (1.0, (0.1, 0.07, 0.05))]
    # rust hairs, a little darker before the buff tips (a strong black band read as dark flakes on the tail)
    lock = [(0.0, (0.5, 0.24, 0.1)), (0.5, (0.6, 0.3, 0.12)), (0.72, (0.5, 0.25, 0.11)), (0.82, (0.34, 0.18, 0.09)), (0.9, (0.58, 0.4, 0.24)),
            (1.0, (0.82, 0.66, 0.46))]
    lock2 = [(0.0, (0.46, 0.22, 0.09)), (0.55, (0.58, 0.29, 0.12)), (0.76, (0.48, 0.24, 0.1)), (0.85, (0.3, 0.16, 0.08)), (0.92, (0.62, 0.45, 0.28)),
             (1.0, (0.85, 0.7, 0.5))]
    cols = [dict(kind='hair', stops=blk, n=14, wid=1.6, end=(0.95, 1.0), wave=0.02, root=1.0),
            dict(kind='hair', stops=blk, n=14, wid=1.6, end=(0.95, 1.0), wave=0.02, root=1.0),
            dict(kind='hair', stops=tuft, n=34, wid=1.4, end=(0.55, 1.0), wave=0.06, root=0.2),
            dict(kind='hair', stops=lock, n=60, wid=1.3, end=(0.5, 1.0), wave=0.12, root=0.03),
            dict(kind='hair', stops=lock2, n=60, wid=1.3, end=(0.45, 1.0), wave=0.14, root=0.03),
            dict(kind='hair', stops=lock, n=55, wid=1.4, end=(0.4, 0.98), wave=0.16, root=0.03)]
    return SF.strand_texture((384, 256), cols, seed=17)


HAIR = {'size': (384, 256), 'cols': 6, 'base': (0.4, 0.17, 0.07), 'hi': (0.5, 0.21, 0.09), 'tip': (0.8, 0.62, 0.42), 'strands': 40,
        'root': 0.15, 'rough': 0.55, 'alpha': 0.3, 'seed': 17, 'quality': 78}


def _tail_cards():
    """locks all around the plume (more of them to the sides, where the hairs grow), leaning back toward the tip, the
    cards turned every way so the tail looks full from the side, from above and from behind"""
    out = []
    n = 64
    for i in range(n):
        t = 0.08 + 0.88 * ((i * 0.618034) % 1.0)
        q = min(int(t * (len(_TP) - 1)), len(_TP) - 2)
        C = _TP[q]; T = nrm(_TP[q + 1] - _TP[q])
        X = V(1.0, 0, 0)
        U = nrm(np.cross(T, X))
        side = 1 if i % 2 else -1
        a0 = np.pi * rnd(i, 3)
        ang = (a0 - np.pi / 2) * (0.75 if i % 3 else 1.0)
        radial = nrm(X * side * np.cos(ang) + U * np.sin(ang))
        k_ = min(len(TAIL) - 1, int(t * (len(TAIL) - 1) + 0.5))
        w0 = TAIL[k_][4] * (np.cos(ang) ** 2 + 0.85 * np.sin(ang) ** 2)
        ln = (0.028 + 0.012 * np.sin(np.pi * min(1.0, t * 1.2)) ** 0.7) * (0.8 + 0.4 * rnd(i, 5))
        k = 4
        ts = np.linspace(0, 1, k)
        root = C + radial * w0 * 0.75
        # lying along the plume and flaring out toward the tips, facing out: from outside the tail every lock shows
        # its lit front (cards standing across the tail showed their dark backs as flakes)
        dirv = nrm(radial * 0.4 + T * (0.9 + 0.3 * rnd(i, 7)))
        pts = np.array([root + dirv * (ln * u) + radial * (0.006 * u * u) for u in ts], F)
        sd = nrm(np.cross(radial, T))
        nr = np.tile(radial, (k, 1))
        out.append({'pts': pts, 'w': np.linspace(0.016, 0.021, k) * (0.85 + 0.3 * rnd(i, 9)), 'nrm': nr, 'side': np.tile(sd, (k, 1)),
                    'col': 3 + i % 3, 'tt': float(t), 'baby': None})
    return out


def _tail_bone_weights(p):
    Pm = mirror(np.asarray(p, F)[None, :])
    tt, td, _ = tail_t(Pm)
    tw = tail_weights(tt)[0]
    return {b: float(w) for b, w in zip(TAIL_BONES, tw) if w > 1e-3}


def cards():
    out = []
    # whiskers
    rows = []
    for i in range(6):
        s0 = 0.062 + 0.008 * (i % 3) / 2 + 0.0015 * (rnd(i, 1) - 0.5)
        u0 = -0.006 - 0.003 * (i // 3) + 0.001 * (rnd(i, 2) - 0.5)
        root = HF.pt(s0, u0, 0.0072 - 0.0015 * (i % 3) / 2)
        d = nrm(V(0.8, 0.0, 0.0) + HF.a * (-0.25 + 0.35 * (i % 3) / 2) + HF.u * (0.12 - 0.22 * (i // 3)) + V(0, 0.08 * (rnd(i, 3) - 0.5), 0))
        rows.append((root, d, 0.032 + 0.012 * rnd(i, 4), 0.0006, 0.14, i % 2))
    wk = []
    for sg in (1, -1):
        m = V(sg, 1, 1)
        wk += CV.whiskers([(root * m, d * m, ln, w, droop, col) for root, d, ln, w, droop, col in rows])
    roots = np.array([cd['pts'][0] for cd in wk], F)
    g = CV.gradient(shape, roots, 0.0003)
    dd = shape(roots)
    for cd, gg, d0 in zip(wk, g, dd):
        cd['pts'][0] = cd['pts'][0] - gg * (d0 + 0.0004)
    out += wk
    # ear tufts: a few dark hairs standing up from the tip of each ear
    for sg in (1, -1):
        m = V(sg, 1, 1)
        for j in range(3):
            tip = EAR_B + EAR_A * (EAR_L * (0.78 + 0.06 * j)) + EAR_N * (-0.001)
            d = nrm(EAR_A + EAR_N * (-0.15 + 0.12 * j) + np.cross(EAR_N, EAR_A) * (0.15 * (j - 1)))
            k = 4
            ts = np.linspace(0, 1, k)
            ln = 0.011 + 0.003 * rnd(j, 31)
            pts = np.array([(tip + d * (ln * t)) * m for t in ts], F)
            side = nrm(np.cross(d, EAR_N)) * m
            out.append({'pts': pts, 'w': np.linspace(0.005, 0.003, k), 'nrm': np.tile(EAR_N * m, (k, 1)), 'side': np.tile(side, (k, 1)), 'col': 2,
                        'bones': [{'_skin': 1.0}] + [{('ear' + ('L' if sg > 0 else 'R')): 1.0}] * (k - 1),
                        'baby': np.array([pts[0] + (p - pts[0]) * 0.4 for p in pts], F)})
    # the tail's locks: roots in the skin, the rest following the tail bones at their own place along it
    tc = _tail_cards()
    allp = np.concatenate([c_['pts'][1:] for c_ in tc]).astype(F)
    allp = CV.push_out(shape, allp, 0.004)
    o = 0
    for c_ in tc:
        n_ = len(c_['pts']) - 1
        c_['pts'] = np.concatenate([c_['pts'][:1], allp[o:o + n_]]).astype(F); o += n_
        c_['bones'] = [{'_skin': 1.0}] + [wsum(*[(b, w) for b, w in _tail_bone_weights(p).items()]) for p in c_['pts'][1:]]
        r0 = c_['pts'][0]
        c_['baby'] = np.array([r0 + (p - r0) * 0.55 for p in c_['pts']], F)
        del c_['tt']
    roots = np.array([c_['pts'][0] for c_ in tc], F)
    g = CV.gradient(shape, roots, 0.0003)
    dd = shape(roots)
    for c_, gg, d0 in zip(tc, g, dd):
        c_['pts'][0] = c_['pts'][0] - gg * (d0 + 0.0008)
    out += tc
    return out
