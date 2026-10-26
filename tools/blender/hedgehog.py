# European hedgehog, sculpted as a signed distance field around the game's hedgehog skeleton
# (tools/blender/work/hedgehog-rig.json). Units are meters in game rig space (x left, y up, z forward, ground at y = 0).
# A domed body on short legs with long claws, a pointed snout with a black wet nose, little dark eyes, small round
# ears, a coat of coarse brown fur on the face, the belly and a skirt along the sides. The spines are real geometry:
# about 1,350 narrow cards over the back and sides, each carrying a few spines (cream root, a dark band, a pale
# point) in the strand texture, leaning back over the body at different angles; the painted skin under them carries
# the same banded spines for far away. Hoglets have short, soft, pale spines (the baby strand texture).
import os
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length, _hash
import carnivore as CV
import smallfur as SF
from carnivore import local, local_n, mirror, groove, mix, hexc, rnd, wsum

ID = 'hedgehog'
BOUNDS = (V(-0.085, 0.0, -0.145), V(0.085, 0.14, 0.165))
BAKE_DIST = (0.002, 0.008, 0.02)
DISSOLVE_DEGENERATE = True
TAIL_RINGS = 0

# ---------- landmarks (left side, +x) ----------
HF = CV.Frame(V(0.0, 0.066, 0.075), V(0.0, -0.23, 1.0), V(0.0, 1.0, 0.0))
EYE = CV.Eye(HF.pt(0.037, 0.0115, 0.0205), 0.0046, V(0.74, 0.3, 0.6), lid_w=0.0041, lid_h=0.0036, off=0.0002, slant=0.1,
             mound=(0.0014, 0.0012, 0.0005), sink=0.1)
NOSE_S = 0.079
MOUTH = HF.pt(0.064, -0.012)
EAR_B = V(0.025, 0.08, 0.088)
EAR_A = nrm([0.5, 0.82, -0.25])
EAR_N = nrm([0.45, 0.1, 1.0])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
EAR_L, EAR_W = 0.012, 0.0072
XF, XH = 0.04, 0.043
HAND = V(XF + 0.001, 0.0, 0.054)
FOOT = V(XH, 0.0, -0.038)
PATCHES = [
    (EYE.c * V(0, 1, 1) + V(0.012, -0.008, -0.008), EYE.c * V(0, 1, 1) + V(0.03, 0.008, 0.008), 0.0002),   # eye and lids
    (HF.pt(0.064, 0.0) * V(0, 1, 1) + V(0.0, -0.02, 0.0), HF.pt(0.086, 0.0) * V(0, 1, 1) + V(0.012, 0.012, 0.003), 0.00025),  # snout, nose
    (V(0.012, 0.072, 0.078), V(0.04, 0.1, 0.1), 0.0003),                                                        # ear
    (V(0.026, -0.0005, 0.04), V(0.06, 0.012, 0.072), 0.00025),                                                  # front foot
    (V(0.028, -0.0005, -0.06), V(0.062, 0.012, -0.02), 0.00025),                                                # hind foot
]

# the dome: z, top, yw, bottom, half width, exponents (the skin under the spines; the spines add about 12 mm)
TRUNK = [
    (-0.13, 0.064, 0.045, 0.026, 0.022, 2.0, 2.0),
    (-0.117, 0.09, 0.045, 0.018, 0.048, 2.0, 2.0),
    (-0.092, 0.108, 0.046, 0.014, 0.063, 2.0, 2.4),
    (-0.052, 0.118, 0.047, 0.013, 0.069, 2.0, 2.6),
    (-0.012, 0.119, 0.048, 0.013, 0.069, 2.0, 2.6),
    (0.028, 0.113, 0.05, 0.015, 0.063, 2.0, 2.4),
    (0.058, 0.098, 0.053, 0.02, 0.05, 2.0, 2.2),
    (0.078, 0.086, 0.056, 0.03, 0.035, 2.0, 2.0),
]
HEAD = [
    (-0.01, 0.03, 0.0, -0.034, 0.036, 2.2, 2.0),
    (0.008, 0.031, -0.002, -0.034, 0.037, 2.3, 2.1),
    (0.025, 0.025, -0.004, -0.03, 0.031, 2.4, 2.2),
    (0.042, 0.0175, -0.005, -0.024, 0.0215, 2.4, 2.3),
    (0.057, 0.011, -0.005, -0.017, 0.0135, 2.3, 2.3),
    (0.069, 0.0072, -0.005, -0.0125, 0.0088, 2.2, 2.2),
    (0.077, 0.0048, -0.0045, -0.0092, 0.0062, 2.2, 2.2),
]


def trunk(P):
    Q = mirror(P)
    d = loft(Q, TRUNK)
    # a flatter belly between the legs
    d = smax(d, 0.014 - Q[:, 1], 0.01)
    return d


def head(P):
    Q = mirror(P)
    L = HF.loc(Q)
    d = loft(L, HEAD)
    d = smin(d, ellipsoid(L, V(0.02, -0.014, 0.02), V(0.014, 0.016, 0.02)), 0.01)            # cheeks
    d = smin(d, ellipsoid(L, V(0.0, 0.0005, NOSE_S), V(0.0052, 0.0047, 0.0042)), 0.0025)       # nose
    d = smin(d, ellipsoid(L, V(0.0, -0.0115, 0.06), V(0.0048, 0.003, 0.009)), 0.003)            # chin
    # nostrils: two small openings in front, a groove between them down to the lip
    nc = V(0.0021, 0.0, NOSE_S + 0.0036)
    d = smax(d, -ellipsoid(L, nc, V(0.0007, 0.0008, 0.001)), 0.0004)
    d = d + groove(L[:, 0], 0.0006, 0.0005) * sstep(NOSE_S - 0.002, NOSE_S + 0.003, L[:, 2]) * sstep(-0.002, -0.004, L[:, 1])
    # mouth line under the snout, back to below the eye
    M = L * V(1, 2.5, 1)
    m = round_cone(M, V(0.0, -0.0085 * 2.5, 0.076), V(0.004, -0.0105 * 2.5, 0.07), 0.0006, 0.0006)
    m = smin(m, round_cone(M, V(0.004, -0.0105 * 2.5, 0.07), V(0.0085, -0.0125 * 2.5, 0.055), 0.0006, 0.0004), 0.001)
    d = smax(d, -(m + 0.0003) / 2.5, 0.0007)
    return d


def eye_parts(P):
    return EYE.parts(mirror(P))


def ear(P):
    Q = mirror(P)
    return CV.ear(Q, EAR_B, EAR_A, EAR_N, EAR_L, EAR_W, 'round', th0=0.003, th1=0.0016, cup=0.45, base_r=(0.0045, 0.0035, 0.0032))


def fleg(P):
    Q = mirror(P)
    return smin(ellipsoid(Q, V(XF - 0.004, 0.04, 0.044), V(0.012, 0.016, 0.014)),
                round_cone(Q, V(XF, 0.036, 0.046), V(XF + 0.001, 0.008, 0.05), 0.0092, 0.0062), 0.008)


def hleg(P):
    Q = mirror(P)
    return smin(ellipsoid(Q, V(XH - 0.004, 0.042, -0.044), V(0.014, 0.018, 0.017)),
                round_cone(Q, V(XH, 0.036, -0.044), V(XH, 0.008, -0.05), 0.011, 0.0065), 0.009)


FINGERS = [(-48, 0.0038, 0.0055, 0.0017), (-22, 0.0046, 0.0072, 0.0018), (2, 0.0048, 0.0078, 0.0018), (25, 0.0046, 0.007, 0.0018),
           (52, 0.0038, 0.005, 0.0016)]
TOES = [(-38, 0.0036, 0.0052, 0.0016), (-16, 0.0044, 0.0066, 0.0017), (4, 0.0046, 0.007, 0.0017), (24, 0.0044, 0.0064, 0.0017),
        (46, 0.0036, 0.0048, 0.0015)]


def paws(P):
    Q = mirror(P)
    a, ca = CV.hand(Q, HAND, FINGERS, (0.0066, 0.0034, 0.0064), yaw=0.1, claw=(0.0036, 0.0007), palm_c=(0.0, -0.002))
    b, cb = CV.hand(Q, FOOT, TOES, (0.0068, 0.0036, 0.0098), yaw=0.05, claw=(0.0028, 0.0006), palm_c=(0.0, -0.0062))
    return np.minimum(a, b), np.minimum(ca, cb)


def parts(P):
    ca, li, ba = eye_parts(P)
    pw, cl = paws(P)
    return {'trunk': trunk(P), 'head': head(P), 'ear': ear(P), 'lids': li, 'ball': ba, 'fleg': fleg(P), 'hleg': hleg(P), 'paw': pw, 'claw': cl}


def shape(P):
    d = trunk(P)
    h = local(P, (-0.06, 0.02, 0.045), (0.06, 0.11, 0.165), head)
    ca, li, ba = local_n(P, (-0.035, 0.06, 0.095), (0.035, 0.085, 0.125), eye_parts, 3)
    h = smin(h, li, 0.0012)
    h = smax(h, -ca, 0.0004)
    h = smin(h, ba, 0.0003)
    d = smin(d, h, 0.02)
    d = smin(d, local(P, (-0.05, 0.068, 0.075), (0.05, 0.1, 0.105), ear), 0.003)
    d = smin(d, local(P, (-0.06, -0.002, 0.025), (0.06, 0.06, 0.07), fleg), 0.008)
    d = smin(d, local(P, (-0.065, -0.002, -0.068), (0.065, 0.065, -0.025), hleg), 0.008)
    pw, cl = local_n(P, (-0.065, -0.002, -0.06), (0.065, 0.012, 0.075), paws, 2)
    d = smin(d, pw, 0.0022)
    d = np.minimum(d, cl)
    return d


PREVIEW = {
    'side': ((0.75, 0.09, 0.0), (0, 0.065, 0.0), 30),
    'front3q': ((0.42, 0.22, 0.48), (0, 0.06, 0.01), 30),
    'front': ((0.0, 0.08, 0.7), (0, 0.06, 0.0), 26),
    'rear3q': ((-0.4, 0.26, -0.48), (0, 0.06, -0.02), 30),
    'top': ((0.002, 0.8, 0.0), (0, 0.06, 0.0), 30),
    'face': ((0.09, 0.09, 0.32), (0, 0.06, 0.1), 24),
    'faceside': ((0.25, 0.07, 0.1), (0.0, 0.062, 0.1), 24),
    'feet': ((0.18, 0.03, 0.18), (0.035, 0.008, 0.0), 30),
}


# ---------- game mesh ----------
KEEP = (0.44, 0.8, 0.6, 0.72, 0.58, 0.58, 0.44)


def keep(P):
    Pm = mirror(P)
    base = np.full(len(P), KEEP[0], F)
    e = sstep(0.01, 0.005, np.linalg.norm(Pm - EYE.c, axis=1)) * KEEP[1]
    L = HF.loc(Pm)
    hd = sstep(-0.005, 0.012, L[:, 2]) * KEEP[2]
    m = sstep(0.055, 0.065, L[:, 2]) * KEEP[3]
    a, c, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    er = sstep(-0.002, 0.0, a) * sstep(0.01, 0.007, np.abs(c)) * sstep(0.005, 0.003, np.abs(n)) * KEEP[4]
    pw = sstep(0.012, 0.006, Pm[:, 1]) * KEEP[5]
    return np.maximum.reduce([base, e, hd, m, er, pw]).astype(F)


def lowpoly_fix(bm, hi):
    """rings across the dome so it bends smoothly when the hedgehog rolls up into a ball"""
    import meshfix as MX
    tr = MX.tree(hi)
    MX.rings(bm, tr, (0.0, 0.065, 0.075), (0.0, 0.065, -0.13), 0.012, lambda c, p0, r: c.y > 0.022 and r < 0.09)
    MX.finish(bm, 2e-9)


UV_AVERAGE = True


def uv_regions(P):
    Pm = mirror(P)
    L = HF.loc(Pm)
    y, z = Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 2)
    head = (L[:, 2] > 0.0) & ~(spine_w(Pm) > 0.5)
    under = (y < 0.045) & ~head
    legs = (y < 0.05) & (np.abs(Pm[:, 0]) > 0.026) & ~head
    lab[under] = 1
    lab[head] = 0
    lab[legs] = 3
    return lab


def uv_weight(P):
    Pm = mirror(P)
    L = HF.loc(Pm)
    head = sstep(0.0, 0.015, L[:, 2])
    paw = sstep(0.012, 0.005, Pm[:, 1])
    under = sstep(0.04, 0.03, Pm[:, 1]) * (1 - head)
    return (0.92 + 0.8 * head + 0.3 * paw - 0.25 * under).astype(F)


WEIGHT_SMOOTH = (5, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'rump': V(0, 0.06, -0.12), 'chest': P['neck'], 'neck': P['head'], 'head': HF.pt(0.08, 0.0)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, 0.003, 0.012)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (HAND + V(0, 0.003, 0.012)) * m
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
            pos = x > 0.003
            W[pos, l] += W[pos, r]; W[pos, r] = 0
            neg = x < -0.003
            W[neg, r] += W[neg, l]; W[neg, l] = 0
    # the head and snout: all head in front of the neck
    L = HF.loc(Pm)
    hd = (L[:, 2] > -0.004) & (y > 0.025)
    CV.set_part(W, bi, hd, 'head', sstep(-0.004, 0.012, L[:, 2]))
    a, c, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    eon = (ear(wpos) < 0.0008) & (a > -0.001)
    k = sstep(-0.001, 0.004, a)
    for s, sg in (('L', 1), ('R', -1)):
        CV.set_part(W, bi, eon & (x * sg > 0), 'ear' + s, k)
    # the dome along its length: rump, hips, chest, neck (smooth bands, so it rolls up into a ball evenly)
    dome = ~hd & (y > 0.03)
    zz = z[dome]
    wr = sstep(-0.06, -0.09, zz)
    wc = sstep(-0.005, 0.03, zz) * (1 - sstep(0.05, 0.075, zz))
    wn = sstep(0.05, 0.075, zz)
    wh = np.clip(1 - wr - wc - wn, 0, 1)
    rows = np.zeros((dome.sum(), W.shape[1]), F)
    rows[:, bi['rump']] = wr; rows[:, bi['hips']] = wh; rows[:, bi['chest']] = wc; rows[:, bi['neck']] = wn
    keepleg = np.zeros(dome.sum(), F)
    for b in ('thigh', 'shin', 'arm', 'fore'):
        for s in ('L', 'R'):
            keepleg += W[dome, bi[b + s]]
    kk = np.clip(1 - 1.5 * keepleg, 0, 1)[:, None] * sstep(0.03, 0.05, y[dome])[:, None]
    W[dome] = W[dome] * (1 - kk) + rows * kk
    for s, sg in (('L', 1), ('R', -1)):
        near = (np.abs(x - sg * HAND[0]) < 0.016) & (z > HAND[2] - 0.006) & (z < HAND[2] + 0.02) & (y < 0.008)
        CV.set_part(W, bi, near, 'fpaw' + s, sstep(0.008, 0.004, y))
        near = (np.abs(x - sg * FOOT[0]) < 0.016) & (z > FOOT[2] - 0.016) & (z < FOOT[2] + 0.018) & (y < 0.008)
        CV.set_part(W, bi, near, 'hpaw' + s, sstep(0.008, 0.004, y))
    s = W.sum(1, keepdims=True)
    return W / np.maximum(s, 1e-9)


# ---------- the spine coat ----------
def spine_w(Pm):
    """1 where the spines grow: the dome from the crown behind the ears back over the rump and down the sides to the
    skirt line; ragged edges"""
    y, z = Pm[:, 1], Pm[:, 2]
    w = fbm(Pm * 220, 2, 77) - 0.5
    yl = 0.05 + 0.026 * sstep(0.03, 0.078, z) - 0.008 * sstep(-0.09, -0.125, z) + 0.004 * w
    zf = 0.081 + 0.004 * w - 0.03 * sstep(0.012, 0.03, Pm[:, 0]) * sstep(0.07, 0.085, y) * 0
    return sstep(yl - 0.002, yl + 0.004, y) * sstep(zf + 0.002, zf - 0.004, z + 0.25 * np.maximum(0.0, 0.09 - y))


def flow(P, N=None):
    """spines and fur lie back over the dome toward the rump and down the sides; on the face from the snout back,
    under the body down and back"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    one = np.ones_like(y)
    body = np.stack([0.6 * sstep(0.0, 0.05, x), -(0.15 + 0.7 * sstep(0.08, 0.045, y)), -one], 1)
    L = HF.loc(Q)
    head = -HF.a[None, :] + np.stack([0.3 * sstep(0.003, 0.02, x), -0.3 * sstep(0.0, -0.015, L[:, 1]), 0 * y], 1)
    legd = np.stack([0 * y, -one, -0.1 * one], 1)
    wh = sstep(-0.004, 0.012, L[:, 2]) * (1 - spine_w(Q))
    wl = sstep(0.03, 0.018, y) * (1 - wh)
    wb = np.clip(1 - wh - wl, 0, 1)
    f = body * wb[:, None] + head * wh[:, None] + legd * wl[:, None]
    f = f / np.maximum(np.linalg.norm(f, axis=1, keepdims=True), 1e-9)
    f[:, 0] *= np.sign(P[:, 0] + 1e-12)
    return f.astype(F)


def _spine_strokes(P, N, dens, cell=0.019, per=14, l0=0.012, l1=0.018, wid=0.0007, seed=91):
    """spines painted on the skin: per possible spines in each cell (texture bombing; the cell is as big as the
    longest spine, so a 3 x 3 x 3 neighborhood finds every spine that reaches a point), lying along the flow at the
    point, each turned a little about the normal so they cross. Returns coverage, t (0 root .. 1 point) and a random
    tone per spine"""
    out = np.zeros(len(P), F); tt = np.zeros(len(P), F); tone = np.zeros(len(P), F)
    on = dens > 0.01
    Q, Nq, D = P[on], N[on], dens[on]
    fl0 = flow(Q)
    fl0 = fl0 - Nq * (fl0 * Nq).sum(1, keepdims=True)
    fl0 /= np.maximum(np.linalg.norm(fl0, axis=1, keepdims=True), 1e-9)
    side0 = np.cross(Nq, fl0)
    G = np.floor(Q / cell).astype(np.int64)
    best = np.zeros(len(Q), F); bt = np.zeros(len(Q), F); bo = np.zeros(len(Q), F)
    for dz in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                c = G + np.array([dx, dy, dz])
                for j in range(per):
                    sd = seed + 7 * j
                    h0, h1, h2, h3, h4, h5 = (_hash(c[:, 0], c[:, 1], c[:, 2], sd + q) for q in range(6))
                    s0 = (c + np.stack([h0, h1, h2], 1)) * cell
                    rr = Q - s0
                    ang = (h5 - 0.5) * 0.9
                    fl = fl0 * np.cos(ang)[:, None] + side0 * np.sin(ang)[:, None]
                    Lh = l0 + (l1 - l0) * h4
                    rr = rr - Nq * (rr * Nq).sum(1, keepdims=True)
                    t = (rr * fl).sum(1) / Lh
                    tc = np.clip(t, 0, 1)
                    dist = np.linalg.norm(rr - fl * (Lh * tc)[:, None], axis=1)
                    w = wid * (1 - 0.85 * tc ** 1.5)
                    line = sstep(w * 1.6, w * 0.4, dist) * (t > -0.02) * (t < 1.0) * (h3 < D)
                    v = line * (0.55 + 0.45 * h0)
                    m = v > best
                    best = np.where(m, v, best); bt = np.where(m, tc, bt); bo = np.where(m, h1, bo)
    out[on] = best; tt[on] = bt; tone[on] = bo
    return out, tt, tone


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
    r['ball'] = sstep(0.0003, 0.00006, c['ball']) * sstep(EYE.r + 0.0012, EYE.r + 0.0003, de)
    El = EYE.loc(Pm)
    ua = El[:, 1] - EYE.off - EYE.slant * El[:, 0]
    ring = np.sqrt((El[:, 0] / (EYE.lid_w + 0.0008)) ** 2 + (ua / (EYE.lid_h + 0.0007)) ** 2)
    r['lid'] = sstep(1.15, 0.9, ring) * (1 - r['ball']) * sstep(EYE.r + 0.003, EYE.r + 0.0015, de)
    r['head'] = sstep(-0.006, 0.008, L[:, 2]) * sstep(0.002, 0.0, c['head'])
    r['nose'] = sstep(0.0006, 0.0, ellipsoid(L, V(0.0, 0.0005, NOSE_S), V(0.0056, 0.0051, 0.0046))) * sstep(NOSE_S - 0.0035, NOSE_S - 0.0012, L[:, 2])
    lipu = -0.0085 - 0.004 * sstep(0.075, 0.055, L[:, 2])
    r['lip'] = sstep(0.0011, 0.0004, np.abs(L[:, 1] - lipu)) * sstep(0.053, 0.057, L[:, 2]) * r['head']
    a, cc, n = CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    r['ear'] = sstep(0.001, 0.0003, c['ear']) * sstep(-0.001, 0.002, a)
    r['paw'] = sstep(0.001, 0.0, c['paw']) * sstep(0.009, 0.005, y)
    r['pad'] = sstep(-0.2, -0.75, N[:, 1]) * sstep(0.0018, 0.0006, y)
    r['claw'] = sstep(0.0004, 0.0, c['claw'])
    r['spine'] = spine_w(Pm)
    r['top'] = sstep(0.3, 0.85, N[:, 1])
    return r


K = {
    'fur': hexc(0x6E5A48), 'furLt': hexc(0x9C8870), 'furDk': hexc(0x4E3C2E), 'face': hexc(0x6C5644), 'mask': hexc(0x3E2E22),
    'skin': hexc(0x5A4636), 'skinDk': hexc(0x2E231B), 'cream': hexc(0xD8CAAE), 'band': hexc(0x2C2016), 'tip': hexc(0xE6DCC6),
    'nose': hexc(0x0E0B0A), 'lip': hexc(0x3A2C24), 'claw': hexc(0x2E2620), 'pad': hexc(0x5E4A42), 'ball': hexc(0x080605), 'ear': hexc(0x6A5444),
}

_scache = {}


def _spines_cached(P, N, R):
    key = (len(P), float(P[:7].sum()))
    if key not in _scache:
        _scache[key] = _spine_strokes(P, N, R['spine'] * 0.95)
    return _scache[key]


_fcache = {}


def _fur_strokes(P, N, R):
    key = (len(P), float(P[:7].sum()))
    if key not in _fcache:
        dens = 0.85 * (1 - R['spine']) * (1 - R['nose']) * (1 - R['ball']) * (1 - R['claw']) * (1 - R['pad'] * R['paw']) * sstep(EYE.r + 0.0006, EYE.r + 0.0018, R['eyeD'])
        _fcache[key] = CV.strands(P, N, dens, flow, 0.0016, 0.0025, 0.0045, 0.0003, seed=93)
    return _fcache[key]


def spine_color(t, tone):
    """cream root, a dark band through the middle, a pale point; some spines paler, some darker"""
    c = np.tile(K['cream'], (len(t), 1))
    band = sstep(0.28, 0.4, t) * sstep(0.84, 0.74, t + 0.1 * (tone - 0.5))
    c = mix(c, K['band'], band * (0.95 - 0.5 * sstep(0.85, 0.95, tone)))
    c = mix(c, K['tip'], sstep(0.8, 0.9, t))
    return c


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y, z = Pm[:, 1], Pm[:, 2]
    n1 = fbm(Pm * 50, 3, 11)
    n2 = fbm(Pm * 180, 3, 12)
    # coarse brown fur on the face, the belly and the skirt; paler buff under the chin and belly
    col = np.tile(K['fur'], (len(P), 1))
    col = mix(col, K['furLt'], sstep(-0.2, -0.7, N[:, 1]) * 0.5)
    col *= (0.9 + 0.2 * n1)[:, None]
    hd = R['head'] * (1 - R['spine'])
    col = mix(col, K['face'], hd * 0.6)
    # darker mask around the eyes and down the snout
    col = mix(col, K['mask'], hd * (sstep(0.016, 0.006, R['eyeD']) * 0.6 + sstep(0.05, 0.07, L[:, 2]) * sstep(-0.004, 0.004, L[:, 1]) * 0.45))
    col = mix(col, K['furLt'], hd * sstep(-0.006, -0.012, L[:, 1]) * sstep(0.03, 0.05, L[:, 2]) * 0.4)
    col = mix(col, K['ear'], R['ear'] * 0.7)
    col = mix(col, K['skin'], sstep(0.014, 0.006, y) * 0.6)
    s, tone = _fur_strokes(P, N, R)
    col *= (1 + s * 0.25 * (tone - 0.4) - 0.05 * (1 - s))[:, None]
    # the spine coat: dark skin between the spines, banded spines over it
    sp = R['spine']
    col = mix(col, K['skinDk'] * (0.85 + 0.3 * n2[:, None]), sp)
    cov, t, stone = _spines_cached(P, N, R)
    col = mix(col, spine_color(t, stone), cov * sp)
    col = mix(col, K['lip'], R['lip'] * 0.8)
    col = mix(col, K['skinDk'], R['lid'])
    col = mix(col, K['nose'] * (0.9 + 0.3 * n2[:, None]), R['nose'])
    col = mix(col, K['pad'], R['pad'] * R['paw'])
    col = mix(col, K['claw'], R['claw'])
    col = mix(col, K['ball'], R['ball'])
    rough = 0.72 + 0.08 * (n2 - 0.5) - 0.2 * cov * sp - 0.55 * R['nose'] - 0.3 * R['lid'] - 0.15 * R['lip'] - 0.3 * R['claw']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.12, 0.95).astype(F)


def detail(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    h = np.zeros(len(P), F)
    cov, t, tone = _spines_cached(P, N, R)
    h += 0.00012 * cov * R['spine'] * (0.6 + 0.4 * t)
    s, _ = _fur_strokes(P, N, R)
    h += 0.00003 * s * (1 - R['spine'])
    g1, _ = worley(Pm / 0.00035, 58)
    h -= 0.00001 * sstep(0.35, 0.1, g1) * R['nose']
    return h


def finish(C, ao, valid):
    return CV.finish(C, ao, valid, 0.4)


# fur shells only on the face, the belly, the legs and the skirt along the spine line
FUR = {'len': 0.011, 'n': 3, 'lean': 1.0, 'tile': 0.0013, 'babyLen': 1.4, 'babyLean': 0.5, 'shade': 0.65, 'quality': 80}


def fur(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y = Pm[:, 1]
    ln = np.full(len(P), 0.0085, F)
    hd = R['head'] * (1 - R['spine'])
    ln = ln * (1 - hd) + hd * (0.004 + 0.003 * sstep(0.03, 0.01, L[:, 2]) - 0.002 * sstep(0.05, 0.07, L[:, 2]))
    # the skirt: long coarse hair just under the spine line
    sk = sstep(0.0, 0.5, R['spine'] + 0.35) * (1 - R['spine'])
    ln = ln + 0.0025 * sk
    ln = ln * (1 - R['spine']) * (1 - R['paw'] * 0.6) * (1 - R['ear'] * 0.7) * sstep(0.004, 0.012, y)
    ln = ln * (1 - R['nose']) * (1 - R['lip']) * (1 - R['claw']) * sstep(EYE.r + 0.0006, EYE.r + 0.0022, R['eyeD'])
    return np.clip(ln, 0, FUR['len']).astype(F), np.ones(len(P), F)


MAP_QUALITY = (74, 72)
PAD_SMOOTH = 3


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': CV.lid_color(col, R['eyeD'], EYE.r)}


def meta(st):
    p, r, d, lid = EYE.meta()
    return {
        'eye': {'p': p, 'r': r, 'dir': d, 'lid': lid, 'iris': 0x0A0706, 'irisR': 0.97, 'pupilR': 0.6, 'rim': 0x050303, 'lidCol': 0x4E3C2E},
        # no real neck: keep the band low on the face fur (lift) and ignore the spine dome around it (maxR), or it
        # stands off the face as a big hoop
        'collar': {'at': ['neck', 'head', 0.75], 'r': 0.8, 'w': 0.75, 'maxR': 0.045, 'lift': 0.1},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.12, 0.09, 0.07], 'flat': 0x5A4636,
        'srgb': ['babyHair'],
    }


# ---------- hoglets: paler, softer coat (the baby color map); short soft pale spines (the baby strand texture) ----------
BABY_TEX = 256


def baby_paint(P, N, c, col):
    R = _regions(P, N, c)
    cov, t, tone = _spines_cached(P, N, R)
    pale = mix(np.tile(hexc(0xC9BBA6), (len(P), 1)), hexc(0xE8DFD0), sstep(0.4, 0.8, t))
    out = mix(col, hexc(0x9C8A76), R['spine'] * (1 - cov) * 0.7)
    out = mix(out, pale, R['spine'] * cov)
    out = mix(out, hexc(0x9A8470), (1 - R['spine']) * (1 - np.clip(R['nose'] + R['ball'] + R['lid'] + R['claw'], 0, 1)) * 0.35)
    return np.clip(out, 0, 1).astype(F)


# ---------- hair cards: the spines, whiskers ----------
NCOL = 9   # 8 spine columns and one for the whiskers


def _spine_cols(baby=False):
    cols = []
    for k in range(8):
        if baby:
            stops = [(0.0, (0.86, 0.83, 0.77)), (0.4, (0.8, 0.76, 0.69)), (0.7, (0.72, 0.67, 0.6)), (0.85, (0.9, 0.87, 0.81)), (1.0, (0.95, 0.93, 0.89))]
        else:
            b0 = 0.38 + 0.04 * (k % 3)
            b1 = 0.64 + 0.04 * ((k + 1) % 3)
            dk = (0.13 + 0.03 * (k % 2), 0.09 + 0.02 * (k % 2), 0.06)
            stops = [(0.0, (0.82, 0.77, 0.66)), (b0 - 0.08, (0.8, 0.74, 0.62)), (b0, dk), (b1, dk), (b1 + 0.08, (0.86, 0.81, 0.7)), (1.0, (0.93, 0.89, 0.8))]
            if k == 7:   # a few all pale spines
                stops = [(0.0, (0.85, 0.8, 0.7)), (0.5, (0.8, 0.74, 0.62)), (1.0, (0.94, 0.9, 0.82))]
        cols.append(dict(kind='spine', stops=stops, n=6, wid=6.2, end=(0.8, 1.0), jit=0.12))
    blk = [(0.0, (0.08, 0.06, 0.05)), (1.0, (0.3, 0.27, 0.24))]
    cols.append(dict(kind='hair', stops=blk, n=10, wid=1.6, end=(0.95, 1.0), wave=0.02, root=1.0))
    return cols


def hair_texture(baby=False):
    return SF.strand_texture((NCOL * 48, 192), _spine_cols(baby), seed=29)


HAIR = {'size': (NCOL * 48, 192), 'cols': NCOL, 'base': (0.8, 0.74, 0.62), 'hi': (0.8, 0.74, 0.62), 'tip': (0.93, 0.89, 0.8), 'strands': 4,
        'root': 0.1, 'rough': 0.5, 'alpha': 0.35, 'seed': 29, 'quality': 82}


def _fib(n):
    i = np.arange(n) + 0.5
    phi = np.arccos(1 - 2 * i / n)
    th = np.pi * (1 + 5 ** 0.5) * i
    return np.stack([np.cos(th) * np.sin(phi), np.cos(phi), np.sin(th) * np.sin(phi)], 1)


def _spine_cards():
    """spine cards: roots on the skin over the spine coat (rays in toward the middle of the dome), leaning back along
    the flow and out at 20 to 45 degrees, turned about the normal and about their own axis so they cross"""
    C0 = V(0.0, 0.045, -0.015)
    D = _fib(3300) * V(0.07, 0.07, 0.11)
    D = D / np.linalg.norm(D, axis=1, keepdims=True)
    o = C0 + D * 0.3
    hit = CV.surface(shape, o, -D, far=0.32, steps=200)
    Pm = mirror(hit)
    sw = spine_w(Pm)
    keep = (sw > 0.5) & (hit[:, 0] >= 0)
    hit = hit[keep]
    N = CV.gradient(shape, hit)
    fl = flow(hit)
    out = []
    for i, (p, nn, f) in enumerate(zip(hit, N, fl)):
        r = [rnd(i, k) for k in range(8)]
        side = nrm(np.cross(nn, f))
        yaw = (r[0] - 0.5) * 0.9
        f2 = f * np.cos(yaw) + side * np.sin(yaw)
        f2 = nrm(f2 - nn * np.dot(f2, nn))
        lift = np.radians(20 + 25 * r[1])
        dirv = nrm(f2 * np.cos(lift) + nn * np.sin(lift))
        # shorter spines toward the edges of the coat (the crown, the skirt line)
        edge = float(sstep(0.5, 0.95, sw[keep][i]))
        ln = (0.015 + 0.008 * r[2]) * (0.6 + 0.4 * edge)
        sd = nrm(np.cross(dirv, nn))
        # turned only a little about their own axis: cards are two sided and show their unlit backs when turned away
        roll = (r[3] - 0.5) * 0.7
        up = nrm(np.cross(sd, dirv))
        sd = nrm(sd * np.cos(roll) + up * np.sin(roll))
        root = p - nn * 0.0012
        tip = root + dirv * ln
        pts = np.array([root, tip], F)
        out.append({'pts': pts, 'w': np.array([0.0072, 0.0066]) * (0.9 + 0.2 * r[4]), 'nrm': np.tile(nn, (2, 1)), 'side': np.tile(sd, (2, 1)),
                    'col': int(r[5] * 8) % 8, 'bones': [{'_skin': 1.0}, {'_skin': 1.0}],
                    'baby': np.array([root, root + dirv * ln * 0.5 + nn * 0.0015], F)})
    # mirror to the other side (skip roots on the middle line, which are already shared)
    mir = []
    for cd in out:
        if cd['pts'][0][0] < 0.0015:
            continue
        m = V(-1, 1, 1)
        mir.append({'pts': cd['pts'] * m, 'w': cd['w'], 'nrm': cd['nrm'] * m, 'side': cd['side'] * m, 'col': cd['col'], 'bones': cd['bones'],
                    'baby': cd['baby'] * m})
    return out + mir


def cards():
    out = []
    rows = []
    for i in range(5):
        s0 = 0.06 + 0.006 * (i % 3) / 2 + 0.001 * (rnd(i, 1) - 0.5)
        u0 = -0.006 - 0.0025 * (i // 3) + 0.0008 * (rnd(i, 2) - 0.5)
        root = HF.pt(s0, u0, 0.0068 - 0.0015 * (i % 3) / 2)
        d = nrm(V(0.8, 0.0, 0.0) + HF.a * (-0.2 + 0.35 * (i % 3) / 2) + HF.u * (0.1 - 0.25 * (i // 3)))
        rows.append((root, d, 0.016 + 0.006 * rnd(i, 4), 0.0005, 0.15, NCOL - 1))
    for sg in (1, -1):
        m = V(sg, 1, 1)
        out += CV.whiskers([(root * m, d * m, ln, w, droop, col) for root, d, ln, w, droop, col in rows])
    roots = np.array([cd['pts'][0] for cd in out], F)
    g = CV.gradient(shape, roots, 0.0002)
    dd = shape(roots)
    for cd, gg, d0 in zip(out, g, dd):
        cd['pts'][0] = cd['pts'][0] - gg * (d0 + 0.0003)
    return out + _spine_cards()


def export_extra(meta_, out, work):
    """the hoglets' strand texture: soft pale spines"""
    import cards as CA
    from PIL import Image
    hp = os.path.join(work, f'{ID}-babyhair.png')
    CA.save_texture(hair_texture(baby=True), hp)
    fn = f'{ID}-babyhair.webp'
    Image.open(hp).save(os.path.join(out, fn), 'WEBP', quality=HAIR.get('quality', 85), method=6)
    meta_['maps']['babyHair'] = fn
