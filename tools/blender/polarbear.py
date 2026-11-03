# A polar bear (round 10), sculpted as a signed distance field around the game's polar bear skeleton
# (tools/blender/work/polarbear-rig.json). Units are meters in game rig space (x left, y up, z forward, ground at y = 0).
# About 2.45 m from the nose to the tail, 1.3 m at the shoulder: a long body, the rump higher than the shoulders, a
# long neck carried low, a long narrow head with a Roman nose and small round ears, small dark eyes, a big black nose
# and black lips, thick legs on huge furry paws (the front ones turned in a little: the pigeon-toed walk) with black
# pads and short dark claws, plantigrade hind feet, a short tail. The coat is part of the sculpt (a long thick coat
# makes its own outline) under long fur shells: a warm cream white, yellower low on the legs and the rump, shaded in
# the partings between the locks. Cubs get a round little body (baby offsets) and a whiter, fluffier coat.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length
import carnivore as CV
from carnivore import local, local_n, mirror, groove, mix, hexc, rnd, wsum

ID = 'polarbear'
BOUNDS = (V(-0.5, 0.0, -1.33), V(0.5, 1.5, 1.33))
BAKE_DIST = (0.015, 0.04, 0.12)
DISSOLVE_DEGENERATE = True
TAIL_RINGS = 0

# ---------- landmarks (left side, +x) ----------
# head frame: from the back of the skull forward and down along the muzzle (s), up across it (u)
HF = CV.Frame(V(0.0, 1.0, 0.78), V(0.0, -0.25, 1.0), V(0.0, 1.0, 0.0))
EYE = CV.Eye(HF.pt(0.205, 0.056, 0.066), 0.0165, V(0.48, 0.14, 0.86), lid_w=0.0155, lid_h=0.011, off=0.001, slant=0.08,
             mound=(0.005, 0.0045, 0.002), sink=0.35)
NOSE_S = 0.455
MOUTH = HF.pt(0.4, -0.09)
EAR_B = V(0.092, 1.095, 0.83)
EAR_A = nrm([0.45, 0.88, -0.15])
EAR_N = nrm([0.5, 0.0, 0.86])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
EAR_L, EAR_W = 0.065, 0.048
XF, XH = 0.26, 0.26
PAW_F = V(XF, 0.0, 0.53)
PAW_H = V(XH, 0.0, -0.62)
HEEL = V(XH, 0.075, -0.86)
PATCHES = [
    (EYE.c * V(0, 1, 1) + V(0.03, -0.035, -0.035), EYE.c * V(0, 1, 1) + V(0.1, 0.035, 0.035), 0.0018),   # eye and lids
    (HF.pt(0.38, 0.0) * V(0, 1, 1) + V(0.0, -0.12, -0.02), HF.pt(0.48, 0.0) * V(0, 1, 1) + V(0.07, 0.05, 0.02), 0.002),  # nose, lips
    (V(0.1, -0.002, 0.36), V(0.42, 0.13, 0.72), 0.003),                                                       # front paw
    (V(0.1, -0.002, -0.98), V(0.42, 0.13, -0.5), 0.003),                                                      # hind paw
]

# trunk (with the coat): z, top, yw (height of widest), bottom, half width, exponents above, below
TRUNK = [
    (-1.21, 1.1, 1.02, 0.94, 0.07, 2.0, 2.0),
    (-1.15, 1.26, 1.0, 0.78, 0.19, 2.0, 2.0),
    (-1.04, 1.36, 0.99, 0.67, 0.28, 2.1, 2.0),
    (-0.85, 1.4, 0.97, 0.6, 0.33, 2.15, 2.0),
    (-0.62, 1.39, 0.95, 0.56, 0.345, 2.2, 2.0),
    (-0.35, 1.35, 0.94, 0.54, 0.35, 2.2, 2.0),
    (-0.1, 1.31, 0.93, 0.53, 0.355, 2.2, 2.0),
    (0.15, 1.28, 0.92, 0.54, 0.35, 2.2, 2.0),
    (0.35, 1.26, 0.92, 0.57, 0.32, 2.15, 2.0),
    (0.5, 1.21, 0.93, 0.64, 0.26, 2.1, 2.0),
    (0.6, 1.13, 0.94, 0.74, 0.18, 2.0, 2.0),
]
# neck: path (y, z), section toward the nape (top), toward the throat (bot), half width, exponents
NECK = [
    (0.98, 0.42, 0.25, 0.3, 0.25, 2.0, 2.0),
    (1.0, 0.58, 0.21, 0.26, 0.21, 2.0, 2.0),
    (0.99, 0.71, 0.175, 0.21, 0.175, 2.0, 2.0),
    (0.98, 0.82, 0.145, 0.165, 0.14, 2.0, 2.0),
]
# head: along the head frame (s), top, height of widest, bottom, half width, exponents above, below
HEAD = [
    (-0.04, 0.09, -0.01, -0.12, 0.1, 2.2, 2.0),
    (0.03, 0.125, -0.02, -0.165, 0.135, 2.4, 2.0),
    (0.1, 0.12, -0.035, -0.172, 0.138, 2.4, 2.1),
    (0.17, 0.095, -0.04, -0.162, 0.112, 2.3, 2.2),
    (0.24, 0.072, -0.045, -0.148, 0.086, 2.2, 2.2),
    (0.31, 0.06, -0.046, -0.134, 0.071, 2.1, 2.2),
    (0.37, 0.052, -0.046, -0.12, 0.064, 2.1, 2.1),
    (0.42, 0.042, -0.046, -0.1, 0.056, 2.0, 2.0),
    (0.452, 0.026, -0.046, -0.078, 0.046, 2.0, 2.0),
]
# legs: path (y, z), section forward (top), back (bot), half width across, exponents, x of the middle
FORE = [
    (0.98, 0.47, 0.17, 0.18, 0.14, 2.0, 2.0, 0.2),
    (0.82, 0.44, 0.165, 0.175, 0.14, 2.0, 2.0, 0.24),
    (0.64, 0.38, 0.15, 0.16, 0.13, 2.1, 2.1, 0.26),
    (0.48, 0.38, 0.13, 0.135, 0.122, 2.2, 2.2, 0.26),
    (0.32, 0.4, 0.118, 0.118, 0.115, 2.2, 2.2, 0.26),
    (0.2, 0.42, 0.112, 0.112, 0.113, 2.2, 2.2, 0.26),
    (0.11, 0.44, 0.112, 0.112, 0.118, 2.2, 2.2, 0.26),
]
HIND = [
    (1.12, -0.8, 0.25, 0.28, 0.21, 2.0, 2.0, 0.16),
    (0.96, -0.74, 0.245, 0.28, 0.21, 2.0, 2.0, 0.21),
    (0.78, -0.66, 0.21, 0.24, 0.19, 2.1, 2.0, 0.25),
    (0.6, -0.63, 0.165, 0.185, 0.155, 2.2, 2.1, 0.26),
    (0.44, -0.71, 0.135, 0.145, 0.128, 2.2, 2.2, 0.26),
    (0.3, -0.8, 0.122, 0.128, 0.118, 2.2, 2.2, 0.26),
    (0.17, -0.86, 0.115, 0.12, 0.114, 2.2, 2.2, 0.26),
    (0.1, -0.88, 0.11, 0.11, 0.112, 2.2, 2.2, 0.26),
]
# the short tail: path (y, z), radius
TAIL = [(1.1, -1.12, 0.065), (1.06, -1.19, 0.058), (1.0, -1.24, 0.046), (0.95, -1.27, 0.03), (0.925, -1.28, 0.014)]


def _tail_poly(n=40):
    K_ = np.array([(y, z) for y, z, _ in TAIL], np.float64)
    seg = np.linalg.norm(np.diff(K_, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    ss = np.linspace(0, s[-1], n)
    yz = np.stack([np.interp(ss, s, K_[:, 0]), np.interp(ss, s, K_[:, 1])], 1)
    return np.stack([np.zeros(n), yz[:, 0], yz[:, 1]], 1), ss / s[-1]


_TP, _TT = _tail_poly()


def tail_t(P):
    from scipy.spatial import cKDTree
    yz = np.stack([np.zeros(len(P)), P[:, 1], P[:, 2]], 1).astype(np.float64)
    d, k = cKDTree(_TP).query(yz)
    return _TT[k].astype(F), d.astype(F)


def flat_cone(Q, a, b, r1, r2, kx):
    """a round cone flattened across x by kx (thigh and shoulder muscles are flat from side to side)"""
    S = Q.copy()
    S[:, 0] = a[0] + (Q[:, 0] - a[0]) / kx
    return round_cone(S, a, V(a[0], b[1], b[2]), r1, r2) * kx


def _locks(Q, amt):
    """soft clumps in the long coat, so the outline is a little shaggy"""
    return amt * (fbm(Q * V(9.0, 12.0, 8.0), 3, 91) - 0.5) * 2.0


# ---------- trunk, neck, head ----------
def trunk(P):
    Q = mirror(P)
    d = loft(Q, TRUNK)
    # the shoulder hump (bears have one, small in a polar bear) and the heavy hindquarters
    d = smin(d, ellipsoid(Q, V(0.0, 1.17, 0.36), V(0.2, 0.08, 0.2)), 0.12)
    d = smin(d, ellipsoid(Q, V(0.16, 1.2, -0.82), V(0.18, 0.18, 0.26)), 0.15)
    # long coat hanging under the belly and the chest
    d = smin(d, ellipsoid(Q, V(0.0, 0.6, -0.15), V(0.26, 0.08, 0.55)), 0.15)
    return d - _locks(Q, 0.012)


def neck(P):
    Q = mirror(P)
    d = sweep(Q, NECK)
    # the thick ruff of coat under the throat
    d = smin(d, ellipsoid(Q, V(0.0, 0.84, 0.62), V(0.17, 0.13, 0.18)), 0.1)
    return d - _locks(Q, 0.01)


def head(P):
    Q = mirror(P)
    L = HF.loc(Q)
    d = loft(L, HEAD)
    # the brow over each eye, the gentle Roman curve of the nose (a ridge down the top of the muzzle)
    d = smin(d, round_cone(L, V(0.03, 0.072, 0.17), V(0.062, 0.062, 0.2), 0.024, 0.016), 0.03)
    d = smin(d, round_cone(L, V(0.0, 0.07, 0.22), V(0.0, 0.05, 0.4), 0.03, 0.026), 0.04)
    # cheeks and the jaw hinge, the chin
    d = smin(d, ellipsoid(L, V(0.085, -0.07, 0.1), V(0.06, 0.07, 0.08)), 0.05)
    d = smin(d, ellipsoid(L, V(0.0, -0.105, 0.36), V(0.042, 0.03, 0.07)), 0.03)
    # the upper lips, full along the sides of the muzzle
    d = smin(d, ellipsoid(L, V(0.04, -0.07, 0.385), V(0.03, 0.028, 0.065)), 0.02)
    # the nose: a big rounded pad at the tip, slit nostrils at its sides
    d = smin(d, ellipsoid(L, V(0.0, -0.006, NOSE_S + 0.006), V(0.042, 0.03, 0.024)), 0.014)
    for t in np.linspace(0, 1, 5):
        c = V(0.016 + 0.012 * t, 0.0 - 0.012 * t, NOSE_S + 0.022 - 0.006 * t)
        d = smax(d, -ellipsoid(L, c, V(0.0045, 0.0045, 0.006)), 0.002)
    # mouth line: back and down from under the nose along the lips
    M = L * V(1, 2.0, 1)
    m = round_cone(M, V(0.0, -0.06 * 2.0, NOSE_S - 0.01), V(0.035, -0.085 * 2.0, 0.4), 0.0025, 0.0025)
    m = smin(m, round_cone(M, V(0.035, -0.085 * 2.0, 0.4), V(0.07, -0.095 * 2.0, 0.3), 0.0025, 0.002), 0.004)
    d = smax(d, -(m + 0.001) / 2.0, 0.003)
    return d - _locks(Q, 0.004) * sstep(0.28, 0.12, L[:, 2])


def eye_parts(P):
    return EYE.parts(mirror(P))


def ear(P):
    """small, round, thick and furry"""
    Q = mirror(P)
    return CV.ear(Q, EAR_B, EAR_A, EAR_N, EAR_L, EAR_W, 'round', th0=0.028, th1=0.016, cup=0.45, tipin=0.0,
                  base_r=(0.04, 0.032, 0.03))


def ear_coords(Pm):
    return CV.ear_coords(Pm, EAR_B, EAR_A, EAR_N)


# ---------- legs and paws ----------
def fleg(P):
    Q = mirror(P)
    d = sweep(Q, FORE, mirror_x=False)
    d = smin(d, flat_cone(Q, V(0.22, 0.98, 0.48), V(0.26, 0.62, 0.36), 0.17, 0.12, 0.8), 0.08)    # shoulder and upper arm
    d = smin(d, ellipsoid(Q, V(XF, 0.62, 0.3), V(0.1, 0.09, 0.09)), 0.06)                         # elbow
    return d - _locks(Q, 0.01) * sstep(0.15, 0.4, Q[:, 1])


def hleg(P):
    Q = mirror(P)
    d = sweep(Q, HIND, mirror_x=False)
    d = smin(d, flat_cone(Q, V(0.2, 1.15, -0.82), V(0.25, 0.62, -0.66), 0.27, 0.13, 0.72), 0.1)   # thigh
    d = smin(d, flat_cone(Q, V(0.19, 1.1, -0.98), V(0.25, 0.5, -0.82), 0.16, 0.1, 0.8), 0.1)      # hamstrings
    d = smin(d, ellipsoid(Q, HEEL, V(0.115, 0.095, 0.12)), 0.05)                                   # the heel on the ground
    return d - _locks(Q, 0.01) * sstep(0.15, 0.4, Q[:, 1])


# toes: (side offset, forward offset, radius, length, lift)
F_TOES = [(-0.112, 0.022, 0.037, 0.044, 0.006), (-0.056, 0.06, 0.04, 0.05, 0.0), (0.0, 0.072, 0.041, 0.05, 0.0),
          (0.056, 0.06, 0.04, 0.05, 0.0), (0.112, 0.022, 0.037, 0.044, 0.006)]
H_TOES = [(-0.1, 0.012, 0.034, 0.04, 0.006), (-0.05, 0.048, 0.037, 0.046, 0.0), (0.0, 0.058, 0.038, 0.046, 0.0),
          (0.05, 0.048, 0.037, 0.046, 0.0), (0.1, 0.012, 0.034, 0.04, 0.006)]


def paws(P):
    """huge round paws, furry between the pads, short thick dark claws; the front ones turned in (pigeon-toed)"""
    Q = mirror(P)
    a, ca = CV.paw(Q, PAW_F, F_TOES, pad=(0.14, 0.075, 0.13), claw=(0.024, 0.012), yaw=-0.18)
    b, cb = CV.paw(Q, PAW_H, H_TOES, pad=(0.125, 0.07, 0.21), claw=(0.02, 0.011), yaw=-0.08)
    return np.minimum(a, b), np.minimum(ca, cb)


def tail(P):
    return sweep(mirror(P), [(y, z, r, r, r, 2.0, 2.0) for y, z, r in TAIL]) - _locks(mirror(P), 0.008)


# ---------- assembled ----------
def parts(P):
    ca, li, ba = eye_parts(P)
    pw, cl = paws(P)
    return {'trunk': trunk(P), 'neck': neck(P), 'head': head(P), 'ear': ear(P), 'lids': li, 'ball': ba, 'fleg': fleg(P), 'hleg': hleg(P),
            'paw': pw, 'claw': cl, 'tail': tail(P)}


def shape(P):
    d = trunk(P)
    d = smin(d, local(P, (-0.5, 0.45, 0.2), (0.5, 1.4, 1.05), neck), 0.12)
    h = local(P, (-0.32, 0.6, 0.62), (0.32, 1.25, 1.33), head)
    ca, li, ba = local_n(P, (-0.14, 0.94, 0.92), (0.14, 1.11, 1.07), eye_parts, 3)
    h = smin(h, li, 0.008)
    h = smax(h, -ca, 0.003)
    h = smin(h, ba, 0.002)
    d = smin(d, h, 0.07)
    d = smin(d, local(P, (-0.25, 0.98, 0.7), (0.25, 1.25, 0.95), ear), 0.025)
    d = smin(d, local(P, (-0.5, -0.01, 0.0), (0.5, 1.25, 0.85), fleg), 0.08)
    d = smin(d, local(P, (-0.5, -0.01, -1.3), (0.5, 1.45, -0.3), hleg), 0.09)
    pw, cl = local_n(P, (-0.48, -0.01, -1.05), (0.48, 0.16, 0.8), paws, 2)
    d = smin(d, pw, 0.03)
    d = np.minimum(d, cl)
    d = smin(d, local(P, (-0.15, 0.8, -1.33), (0.15, 1.25, -0.98), tail), 0.05)
    return d


PREVIEW = {
    'side': ((5.6, 0.9, 0.0), (0, 0.75, 0.0), 30),
    'front3q': ((3.2, 1.9, 3.5), (0, 0.75, 0.05), 30),
    'front': ((0.0, 1.1, 5.2), (0, 0.8, 0.0), 26),
    'rear3q': ((-3.0, 2.0, -3.5), (0, 0.75, -0.2), 30),
    'face': ((0.9, 1.25, 2.6), (0, 0.95, 0.95), 24),
    'headside': ((2.0, 1.05, 1.0), (0, 0.95, 0.95), 20),
    'headfront': ((0.0, 1.1, 3.0), (0, 0.95, 0.95), 18),
    'feet': ((1.4, 0.35, 1.7), (0.26, 0.1, 0.3), 30),
}


# ---------- game mesh ----------
KEEP = (0.44, 0.82, 0.6, 0.72, 0.6, 0.58, 0.4)


def keep(P):
    Pm = mirror(P)
    base = np.full(len(P), KEEP[0], F)
    e = sstep(0.06, 0.03, np.linalg.norm(Pm - EYE.c, axis=1)) * KEEP[1]
    L = HF.loc(Pm)
    hd = sstep(-0.03, 0.03, L[:, 2]) * sstep(0.7, 0.78, Pm[:, 1]) * KEEP[2]
    m = sstep(0.36, 0.42, L[:, 2]) * KEEP[3]
    a, c, n = ear_coords(Pm)
    er = sstep(-0.01, 0.005, a) * sstep(0.07, 0.05, np.abs(c)) * sstep(0.04, 0.025, np.abs(n)) * KEEP[4]
    pw = sstep(0.12, 0.06, Pm[:, 1]) * KEEP[5]
    return np.maximum.reduce([base, e, hd, m, er, pw]).astype(F)


def lowpoly_fix(bm, hi):
    """rings across the long body and the neck so it rolls along, gallops, swims and sprawls smoothly"""
    import meshfix as MX
    tr = MX.tree(hi)
    MX.rings(bm, tr, (0.0, 1.0, 0.5), (0.0, 1.05, -1.1), 0.12, lambda c, p0, r: c.y > 0.6 and r < 0.5)
    pts = [V(0, k[0], k[1]) for k in NECK]
    for a, b in zip(pts[:-1], pts[1:]):
        MX.rings(bm, tr, a, b, 0.1, lambda c, p0, r: r < 0.34 and c.z > 0.4 and c.y > 0.72)
    MX.finish(bm, 5e-7)


UV_AVERAGE = True
UV_PACK = dict(margin_method='FRACTION', margin=0.01)


def uv_regions(P):
    Pm = mirror(P)
    L = HF.loc(Pm)
    y, z = Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 2)
    a, c, n = ear_coords(Pm)
    head = (L[:, 2] > -0.03) & (y > 0.72)
    neck = ~head & (z > 0.4) & (y > 0.7)
    fleg = (z > 0.0) & (y < 0.62) & ~neck
    hleg = (z <= 0.0) & (y < 0.66) & (z > -1.1)
    tl = z < -1.12
    lab[neck] = 1
    lab[head] = 0
    lab[head & (a > 0.01) & (np.abs(c) < 0.06)] = 8
    lab[fleg] = 3
    lab[fleg & (y < 0.16)] = 4
    lab[hleg] = 5
    lab[hleg & (y < 0.16)] = 6
    lab[tl] = 7
    return lab


def uv_weight(P):
    Pm = mirror(P)
    L = HF.loc(Pm)
    head = sstep(-0.03, 0.04, L[:, 2]) * sstep(0.72, 0.78, Pm[:, 1])
    paw = sstep(0.14, 0.07, Pm[:, 1])
    under = sstep(0.66, 0.6, Pm[:, 1]) * sstep(0.12, 0.06, Pm[:, 0]) * (1 - paw)
    return (0.92 + 0.8 * head + 0.15 * paw - 0.3 * under).astype(F)


WEIGHT_SMOOTH = (6, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'rump': P['hips'], 'chest': P['neck'], 'neck': P['neck2'], 'neck2': P['head'], 'head': HF.pt(0.46, 0.0),
         'tail1': P['tail2'], 'tail2': V(0, 0.925, -1.28)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (PAW_H + V(0, 0.02, 0.08)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (PAW_F + V(0, 0.02, 0.08)) * m
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
            pos = x > 0.01
            W[pos, l] += W[pos, r]; W[pos, r] = 0
            neg = x < -0.01
            W[neg, r] += W[neg, l]; W[neg, l] = 0
    # the tail by its place along the middle line, blending into the rump at its root
    tt, td = tail_t(Pm)
    on = (z < -1.06) & (td < 0.1) & (y > 0.85)
    if on.any():
        k = sstep(-1.06, -1.12, z[on])[:, None]
        rows = np.zeros((on.sum(), W.shape[1]), F)
        w2 = sstep(0.35, 0.6, tt[on])
        rows[:, bi['tail1']] = 1 - w2; rows[:, bi['tail2']] = w2
        W[on] = W[on] * (1 - k) + rows * k
    # the head: everything in front of the back of the skull above the throat
    L = HF.loc(Pm)
    hd = (L[:, 2] > -0.02) & (y > 0.74)
    CV.set_part(W, bi, hd, 'head', sstep(-0.02, 0.05, L[:, 2]))
    # ears on the ear bones, blending into the head at the base
    a, c, n = ear_coords(Pm)
    on = (ear(wpos) < 0.006) & (a > -0.005)
    k = sstep(-0.005, 0.03, a)
    for s, sg in (('L', 1), ('R', -1)):
        CV.set_part(W, bi, on & (x * sg > 0), 'ear' + s, k)
    # the paws on the paw bones, the sole of the hind foot on the metatarsus
    for s, sg in (('L', 1), ('R', -1)):
        near = (np.abs(x - sg * XF) < 0.17) & (z > PAW_F[2] - 0.12) & (z < PAW_F[2] + 0.16) & (y < 0.13)
        CV.set_part(W, bi, near, 'fpaw' + s, sstep(0.13, 0.07, y))
        ft = (np.abs(x - sg * XH) < 0.17) & (z > -1.0) & (z < -0.46) & (y < 0.15)
        CV.set_part(W, bi, ft, 'hmeta' + s, sstep(0.15, 0.09, y))
        CV.set_part(W, bi, ft, 'hpaw' + s, sstep(-0.72, -0.62, z) * sstep(0.12, 0.07, y))
    s = W.sum(1, keepdims=True)
    return W / np.maximum(s, 1e-9)


# ---------- coat ----------
def flow(P, N=None):
    """from the nose back over the head and down the cheeks, back along the body and down its sides, down the legs"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    one = np.ones_like(y)
    body = np.stack([0.25 * sstep(0.05, 0.2, x), -(0.15 + 0.85 * sstep(0.95, 0.7, y)), -one], 1)
    neckd = np.stack([0.2 * one, -0.8 * one, -0.7 * one], 1)
    legd = np.stack([0 * y, -one, -0.1 * one], 1)
    L = HF.loc(Q)
    cheek = sstep(0.0, -0.08, L[:, 1]) * sstep(0.3, 0.15, L[:, 2])
    headd = -HF.a[None, :] + np.stack([0.35 * sstep(0.02, 0.08, x) + 0.6 * cheek, -0.3 * cheek, 0 * y], 1)
    taild = np.stack([0 * y, -0.4 * one, -one], 1)
    wh = sstep(-0.03, 0.06, L[:, 2]) * sstep(0.74, 0.82, y)
    wt = sstep(-1.08, -1.14, z)
    wn = sstep(0.38, 0.55, z) * sstep(0.62, 0.75, y) * (1 - wh)
    wl = sstep(0.62, 0.45, y) * (1 - wh - wn) * (1 - wt)
    wb = np.clip(1 - wh - wn - wl - wt, 0, 1)
    f = body * wb[:, None] + headd * wh[:, None] + neckd * wn[:, None] + legd * wl[:, None] + taild * wt[:, None]
    a, c, n = ear_coords(Q)
    we = sstep(-0.005, 0.02, a) * sstep(0.08, 0.05, np.abs(c)) * sstep(0.05, 0.03, np.abs(n))
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
    r['ball'] = sstep(0.002, 0.0004, c['ball']) * sstep(EYE.r + 0.006, EYE.r + 0.0015, de)
    El = EYE.loc(Pm)
    ua = El[:, 1] - EYE.off - EYE.slant * El[:, 0]
    ring = np.sqrt((El[:, 0] / (EYE.lid_w + 0.005)) ** 2 + (ua / (EYE.lid_h + 0.0045)) ** 2)
    r['ring'] = ring
    r['lid'] = sstep(1.2, 0.9, ring) * (1 - r['ball']) * sstep(EYE.r + 0.016, EYE.r + 0.008, de)
    r['head'] = sstep(-0.03, 0.03, L[:, 2]) * sstep(0.008, 0.0, c['head'])
    r['nose'] = sstep(0.003, -0.001, ellipsoid(L, V(0.0, -0.006, NOSE_S + 0.006), V(0.046, 0.034, 0.028))) * sstep(NOSE_S - 0.03, NOSE_S - 0.012, L[:, 2])
    # the black lips: a band along the mouth line, wider toward the front
    lipu = -0.06 - 0.03 * sstep(NOSE_S - 0.01, 0.38, L[:, 2]) - 0.012 * sstep(0.38, 0.3, L[:, 2])
    r['lip'] = sstep(0.009, 0.003, np.abs(L[:, 1] - lipu)) * sstep(0.33, 0.38, L[:, 2]) * r['head']
    r['phil'] = sstep(0.006, 0.002, np.abs(L[:, 0])) * sstep(-0.025, -0.035, L[:, 1]) * sstep(-0.065, -0.055, L[:, 1]) * sstep(0.42, 0.44, L[:, 2]) * r['head']
    a, cc, n = ear_coords(Pm)
    r['ea'], r['ec'], r['en'] = a, cc, n
    r['ear'] = sstep(0.006, 0.001, c['ear']) * sstep(-0.008, 0.01, a)
    r['earIn'] = sstep(-0.15, 0.35, Nm @ EAR_N) * sstep(0.008, -0.004, np.abs(cc) - EAR_W * 0.7 * (1 - a / EAR_L))
    r['paw'] = sstep(0.006, 0.0, c['paw']) * sstep(0.13, 0.08, y)
    r['pad'] = sstep(-0.3, -0.8, N[:, 1]) * sstep(0.02, 0.006, y)
    r['claw'] = sstep(0.002, 0.0, c['claw'])
    tt, td = tail_t(Pm)
    r['tt'] = tt
    r['tail'] = sstep(0.01, 0.0, c['tail']) * sstep(-1.06, -1.1, z)
    r['top'] = sstep(0.3, 0.85, N[:, 1])
    return r


K = {
    'coat': hexc(0xE7DDC2), 'sun': hexc(0xEEE5CC), 'shade': hexc(0xC9BC9A), 'stain': hexc(0xD6C69C), 'part': hexc(0xB8AB8C),
    'black': hexc(0x121010), 'nose': hexc(0x1A1716), 'pad': hexc(0x221E1C), 'claw': hexc(0x3A3530), 'earIn': hexc(0x9A8C78),
    'ball': hexc(0x0A0706),
}


def _lenk(Pm):
    L = HF.loc(Pm)
    hd = sstep(-0.03, 0.06, L[:, 2]) * sstep(0.74, 0.82, Pm[:, 1])
    lg = sstep(0.3, 0.12, Pm[:, 1])
    return np.clip(1.0 - 0.55 * hd - 0.3 * lg, 0.4, 1.4)


_scache = {}


def _strands(P, N, R):
    key = (len(P), float(P[:7].sum()))
    if key not in _scache:
        dens = 0.94 * (1 - R['nose']) * (1 - R['ball']) * (1 - R['pad'] * R['paw']) * (1 - 0.8 * R['lip']) * (1 - R['claw']) * sstep(EYE.r + 0.004, EYE.r + 0.012, R['eyeD'])
        _scache[key] = CV.strands(P, N, dens, flow, 0.012, 0.03, 0.06, 0.0028, seed=97, lenk=lambda Q: _lenk(mirror(Q)))
    return _scache[key]


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    y = Pm[:, 1]
    n1 = fbm(Pm * 3.0, 3, 11)
    n2 = fbm(Pm * 30, 3, 12)
    # a warm cream white: brighter on top in the sun, shaded underneath, yellower low on the legs, the rump and the belly
    col = np.tile(K['coat'], (len(P), 1))
    col = mix(col, K['sun'], R['top'] * 0.5)
    col = mix(col, K['shade'], sstep(0.0, -0.75, N[:, 1]) * 0.55)
    col = mix(col, K['stain'], sstep(0.45, 0.12, y) * (1 - R['paw'] * R['pad']) * 0.55 + sstep(0.3, 0.7, n1) * 0.25)
    col *= (0.96 + 0.07 * n1)[:, None]
    # the coat: locks of long guard hair, shaded in the partings between them
    s, tone = _strands(P, N, R)
    col = mix(col, K['part'], (1 - s) * 0.3 * (1 - R['nose']) * (1 - R['lip']))
    col *= (1 + s * 0.12 * (tone - 0.4))[:, None]
    # inside the ears: darker skin under sparse hair
    col = mix(col, K['earIn'], R['ear'] * R['earIn'] * 0.55)
    # black skin: the nose, the lips, the lids, the pads; the claws dark horn
    nose = mix(np.tile(K['nose'], (len(P), 1)), K['black'] * 2.2, sstep(0.45, 0.8, n2) * 0.3)
    col = mix(col, nose, R['nose'])
    col = mix(col, K['black'], np.clip(R['lip'] + R['phil'] * 0.8, 0, 1))
    col = mix(col, K['black'], R['lid'])
    col = mix(col, K['pad'], R['pad'] * R['paw'])
    col = mix(col, K['claw'], R['claw'])
    col = mix(col, K['ball'], R['ball'])
    rough = 0.74 + 0.06 * (n2 - 0.5) - 0.38 * R['nose'] - 0.3 * R['lid'] - 0.2 * R['lip']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    h = np.zeros(len(P), F)
    s, tone = _strands(P, N, R)
    h += 0.0006 * s * (1 - R['ball']) * (1 - R['nose'])
    g1, _ = worley(Pm / 0.0025, 58)
    h -= 0.0003 * sstep(0.35, 0.1, g1) * np.maximum(R['nose'], R['pad'] * R['paw'])
    return h


def finish(C, ao, valid):
    return CV.finish(C, ao, valid, 0.45)


FUR = {'len': 0.1, 'n': 5, 'lean': 1.15, 'tile': 0.0045, 'babyLen': 1.1, 'babyLean': 0.55, 'shade': 0.68, 'quality': 76}


def fur(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y = Pm[:, 1]
    ln = np.full(len(P), 0.075, F)
    ln = ln + 0.02 * sstep(-0.3, -0.8, N[:, 1])                                  # long under the belly and the chest
    ln = ln + 0.015 * sstep(0.3, 0.8, N[:, 1])                                   # the back
    ln = ln * (1 - 0.3 * sstep(0.35, 0.1, y))                                    # shorter low on the legs
    hd = R['head']
    face = 0.035 + 0.015 * sstep(0.15, 0.0, L[:, 2]) - 0.02 * sstep(0.26, 0.36, L[:, 2])
    ln = ln * (1 - hd) + hd * face
    er = R['ear']
    ln = ln * (1 - er) + er * (0.025 * (1 - R['earIn'] * 0.6))
    ln = ln * (1 - R['paw'] * R['pad']) * (1 - R['claw'])
    ln = ln * (1 - R['nose']) * (1 - R['lip']) * (1 - R['phil']) * sstep(1.25, 1.7, R['ring'])
    return np.clip(ln, 0, FUR['len']).astype(F), np.ones(len(P), F)


MAP_QUALITY = (74, 58)
PAD_SMOOTH = 4


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': CV.lid_color(col, R['eyeD'], EYE.r)}


def meta(st):
    p, r, d, lid = EYE.meta()
    return {
        # small dark brown eyes; the lids are black skin
        'eye': {'p': p, 'r': r, 'dir': d, 'lid': [0.75, -0.75, 0.15], 'iris': 0x1C120C, 'irisR': 0.95, 'pupilR': 0.55, 'rim': 0x0A0606,
                'lidCol': 0x1E1A18, 'babyLidCol': 0x1E1A18},
        # the neck is carried low: the slice must ignore the shoulders and the front paws below it (maxR)
        'collar': {'at': ['neck2', 'head', 0.3], 'lift': 0.5, 'r': 0.8, 'maxR': 0.3},
        'belly': [0.0, 0.56, -0.2],
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.16, 0.15, 0.12], 'flat': 0xE6DDC6,
    }


# ---------- cubs: a round little body; a whiter, fluffier coat ----------
BABY_TEX = 256
CUB = dict(c=V(0.0, 0.96, -0.25), r=(0.34, 0.4, 0.82), rb=0.36, e=2.1, maxd=0.09)


def _egg_walk(Q, Nm):
    g = CUB
    egg = lambda X: superellipsoid(X, g['c'], g['r'], g['e'], rb=g['rb'])
    X = Q.copy()
    for _ in range(12):
        X = X - Nm * np.clip(egg(X), -0.02, 0.02)[:, None]
    d = X - Q
    ln = np.linalg.norm(d, axis=1, keepdims=True)
    return d * np.minimum(1, g['maxd'] / np.maximum(ln, 1e-9))


def baby_offset(P, N, c):
    """the long body rounds off into a cub's barrel (the game adds the big head, the short muzzle and the short legs)"""
    Q = mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
    d = _egg_walk(Q, Nm)
    legd = np.minimum(c['fleg'], c['hleg'])
    w = sstep(0.06, -0.01, c['trunk'] - legd)
    w = w * sstep(-0.02, 0.08, np.minimum(c['head'], c['neck']) - c['trunk']) * sstep(0.5, 0.3, Q[:, 2]) * sstep(-1.15, -0.95, Q[:, 2])
    d = d * w[:, None]
    d[:, 0] *= np.sign(P[:, 0] + 1e-9)
    return d.astype(F)


def baby_paint(P, N, c, col):
    R = _regions(P, N, c)
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['lip'] + R['phil'] + R['pad'] * R['paw'] + R['claw'], 0, 1)
    return np.clip(mix(col, hexc(0xF4F0E4), 0.5 * (1 - keep)), 0, 1).astype(F)
