# Chameleon (round 11): a male panther chameleon (Furcifer pardalis), 45 cm with its tail, on the lizard template
# (lizkit.py, in meters: KS = 1). A body flattened from side to side and deep, with an arched back and a low crest of
# cones along it, held high on long legs whose elbows point back and knees forward, zygodactyl feet (each foot two
# bundles of fused toes pinching against each other, claws at their tips), a short neck, a head with a low casque
# rising behind the eyes, ridges from the eyes to a small nose, the downturned mouth line, and the turret eyes: a ball
# of granular skin around each eyeball with a small hole for the pupil, on its own bone (eyeL / eyeR) so the game turns
# each eye by itself. The tail is prehensile, carried back and curled down into a spiral (a sweep along the curve, its
# own bones along it). Green with blue and red bars, a white stripe along the flank, red and green stripes radiating
# from the eyes, a banded tail; the game blends the skin toward a color (rig.setTint) over this pattern.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, ellipsoid, round_cone, chain, sweep, fbm, length, _hash
import lizkit as LK

M = LK.load('chameleon')
KS = 1.0

M.BOUNDS = (V(-0.05, -0.001, -0.172), V(0.05, 0.122, 0.132))
M.BODY = [
    (-0.078, 0.0820, 0.0730, 0.0640, 0.0058, 1.8, 1.9),
    (-0.065, 0.0905, 0.0740, 0.0585, 0.0094, 1.8, 1.9),
    (-0.045, 0.1005, 0.0765, 0.0525, 0.0117, 1.8, 1.9),
    (-0.020, 0.1095, 0.0785, 0.0465, 0.0128, 1.8, 1.9),
    (0.005, 0.1145, 0.0800, 0.0442, 0.0132, 1.8, 1.9),
    (0.028, 0.1130, 0.0810, 0.0458, 0.0130, 1.8, 1.9),
    (0.045, 0.1065, 0.0818, 0.0515, 0.0122, 1.8, 1.9),
    (0.058, 0.0975, 0.0828, 0.0610, 0.0106, 1.8, 2.0),
    (0.066, 0.1040, 0.0838, 0.0650, 0.0110, 1.5, 2.0),
    (0.074, 0.1075, 0.0848, 0.0670, 0.0120, 1.5, 2.0),
    (0.084, 0.1040, 0.0862, 0.0688, 0.0128, 1.7, 2.0),
    (0.094, 0.0995, 0.0874, 0.0702, 0.0126, 2.0, 2.0),
    (0.103, 0.0975, 0.0882, 0.0730, 0.0110, 2.1, 2.0),
    (0.112, 0.0945, 0.0886, 0.0765, 0.0090, 2.1, 2.0),
    (0.119, 0.0918, 0.0880, 0.0800, 0.0070, 2.1, 2.0),
    (0.1245, 0.0900, 0.0872, 0.0832, 0.0046, 2.0, 2.0),
]
M.Z_HEAD, M.Z_TAIL = 0.064, -0.07
M.HEAD_BOX = (V(-0.03, 0.055, 0.052), V(0.03, 0.122, 0.132))
M.LEG_BOX = (V(-0.05, -0.002, -0.075), V(0.05, 0.085, 0.075))
M.FOOT_BOX = (V(-0.05, -0.002, -0.075), V(0.05, 0.012, 0.08))

# ---------- the tail: back, then curled down and forward into a spiral (y, z in the middle plane) ----------
TAIL_ZC, TAIL_YC, TAIL_R0, TAIL_K, TAIL_TURN = -0.1385, 0.0385, 0.0275, 0.13, np.radians(600)


def tail_path(n=160):
    """points along the tail's middle line from its base to its tip: (y, z), arc length, radius"""
    st = np.array([[0.0752, -0.046], [0.0740, -0.072], [0.0718, -0.098], [0.0690, -0.12], [TAIL_YC + TAIL_R0, TAIL_ZC]], F)
    th = np.linspace(np.pi / 2, np.pi / 2 + TAIL_TURN, n)
    r = TAIL_R0 * np.exp(-TAIL_K * (th - np.pi / 2))
    sp = np.stack([TAIL_YC + r * np.sin(th), TAIL_ZC + r * np.cos(th)], 1).astype(F)
    # the straight part as a smooth curve into the spiral's top
    from scipy.interpolate import PchipInterpolator
    zz = np.linspace(st[0, 1], st[-1, 1], 30)
    yy = PchipInterpolator(-st[:, 1].astype(np.float64), st[:, 0].astype(np.float64))(-zz)
    pts = np.concatenate([np.stack([yy, zz], 1)[:-1], sp]).astype(F)
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]).astype(F)
    rad = (0.0102 * (1 - 0.84 * s / s[-1]) ** 1.15 + 0.0011).astype(F)
    return pts, s, rad


TAIL_BONES = 8


def tail_pivots():
    pts, s, rad = tail_path()
    out = []
    for i in range(TAIL_BONES):
        si = 0.006 + i * (s[-1] - 0.03) / TAIL_BONES
        k = int(np.searchsorted(s, si))
        out.append((float(pts[k, 0]), float(pts[k, 1]), float(si)))
    return out


def tail(P):
    pts, s, rad = tail_path()
    idx = np.unique(np.concatenate([np.arange(0, len(pts), 3), [len(pts) - 1]]))
    keys = [(float(pts[i, 0]), float(pts[i, 1]), float(rad[i]) * 1.05, float(rad[i]) * 0.95, float(rad[i]) * 0.8, 2.0, 2.0) for i in idx]
    return sweep(M.mirror(P), keys, n=150)


M.TAIL_TIP = V(0, float(tail_path()[0][-1, 0]), float(tail_path()[0][-1, 1]))


def body_extra(Q, d):
    d = smin(d, LK_local(Q, (V(-0.02, 0.0, -0.172), V(0.02, 0.09, -0.04)), tail), 0.004)
    return d


def LK_local(Q, bx, fn):
    return M.local(Q, bx[0], bx[1], fn)


M.body_extra = body_extra

# ---------- head ----------
M.EYE_R, M.EYE_DIR = 0.0054, V(0.78, 0.22, 0.58)
M.EYE_C = V(0.0112, 0.0912, 0.0930)
M.LID_W, M.LID_H, M.LID_OFF = 0.0017, 0.0017, 0.0
M.LIDS = (0.0024, 0.0024, 0.0024)          # the turret: skin all around the ball
M.NOSTRIL = V(0.0034, 0.0893, 0.1215)
M.NOSTRIL_R = (V(0.0010, 0.0009, 0.0012), V(0.0006, 0.0005, 0.0006))
M.EAR = None
M.MOUTH = V(0.0, 0.0838, 0.1225)
M.MOUTH_LINE = [V(0.0, 0.0836, 0.1258), V(0.0042, 0.0838, 0.1228), V(0.0094, 0.0830, 0.1050), V(0.0118, 0.0798, 0.0850)]
M.MOUTH_R = [0.0004, 0.0004, 0.00038, 0.0002]
M.SNOUT = (V(0.0, 0.0868, 0.1215), V(0.0050, 0.0040, 0.0040), 0.002)
M.HEAD_BLOBS = [
    (V(0.0105, 0.0790, 0.0820), V(0.0040, 0.0070, 0.0085), 0.0035),    # jaw muscles under the casque
]
M.MANDIBLE = (V(0.0098, 0.0760, 0.084), V(0.0035, 0.0822, 0.1220), 0.0034, 0.0020, 0.0025)
M.BLOBS = [
    (V(0.007, 0.0700, 0.042), V(0.0062, 0.0090, 0.0090), 0.004),       # shoulders
    (V(0.007, 0.0660, -0.046), V(0.0065, 0.0090, 0.0100), 0.004),      # hips
    (V(0.0, 0.0700, 0.0750), V(0.0080, 0.0060, 0.0160), 0.004),        # throat
]


def eye_parts(P):
    """the turret: a ball of skin around the eyeball, open only in a small round hole at the pupil"""
    Q = M.mirror(P)
    D = Q - M.EYE_C
    s, u, g = D @ M.EYE_SIDE, D @ M.EYE_UP, D @ M.EYE_DIR
    rt = M.EYE_R + M.LIDS[0]
    # a ball, a little drawn out along the gaze (a turret), its back sunk into the head
    L = np.stack([s, u, g - 0.0006], 1)
    lids = ellipsoid(L, V(0, 0, 0), V(rt, rt, rt + 0.0008))
    ap = np.sqrt(s * s + u * u) - M.LID_W
    carve = smax(ap, -g - 0.0002, 0.0003)
    ball = length(D) - M.EYE_R * 0.86
    return carve, lids, ball


M.eye_parts = eye_parts


def casque(P):
    Q = M.mirror(P)
    # the casque: a thin helmet ridge rising behind the eyes to a peak over the back of the head
    Qs = Q * V(2.0, 1, 1)
    c = chain(Qs, [V(0, 0.0975, 0.1000), V(0, 0.1030, 0.0870), V(0, 0.1068, 0.0740), V(0, 0.1020, 0.0640)], [0.0030, 0.0032, 0.0030, 0.0024], 0.003) / 1.7
    # low ridges over the eyes back along the casque's sides, and from the eyes forward to a small nose
    c = smin(c, chain(Q, [V(0.0074, 0.0980, 0.0990), V(0.0074, 0.1005, 0.0840), V(0.0050, 0.1030, 0.0720)], [0.0011, 0.0011, 0.0010], 0.001), 0.003)
    c = smin(c, chain(Q, [V(0.0078, 0.0972, 0.0995), V(0.0050, 0.0940, 0.1130), V(0.0012, 0.0918, 0.1240)], [0.0010, 0.0010, 0.0009], 0.001), 0.0025)
    return c


def crest(P):
    M.setup()
    return M.crest(M.mirror(P), [-0.075, -0.05, -0.02, 0.01, 0.03, 0.05, 0.058], [0.0, 0.0012, 0.0017, 0.0019, 0.0018, 0.0016, 0.0], 0.0042, 0.0016, lean=0.25, sink=0.0008)


M.EXTRAS = [('casque', casque, 0.0028, (V(-0.016, 0.085, 0.048), V(0.016, 0.122, 0.132))), ('crest', crest, 0.0007, None)]
M.BODY_EXTRAS = ('casque', 'crest')

# ---------- legs: elbows back, knees forward; zygodactyl feet ----------
SH, EL, WR = V(0.0075, 0.0700, 0.044), V(0.0210, 0.0440, 0.022), V(0.0255, 0.0070, 0.050)
HP, KN, AN = V(0.0075, 0.0660, -0.048), V(0.0220, 0.0440, -0.024), V(0.0255, 0.0070, -0.054)
M.HAND, M.FOOT = V(0.0262, 0.0032, 0.0545), V(0.0262, 0.0032, -0.0485)
M.FLEG = [
    ('chain', [SH, V(0.0150, 0.0570, 0.033), EL], [0.0056, 0.0049, 0.0042], 0.0012, 0.0),
    ('chain', [EL, V(0.0238, 0.0250, 0.037), WR], [0.0042, 0.0036, 0.0030], 0.001, 0.001),
    ('ball', EL, V(0.0038, 0.0037, 0.0037), 0.001),
]
M.HLEG = [
    ('chain', [HP, V(0.0155, 0.0560, -0.036), KN], [0.0064, 0.0053, 0.0044], 0.0015, 0.0),
    ('chain', [KN, V(0.0245, 0.0250, -0.040), AN], [0.0044, 0.0037, 0.0030], 0.001, 0.001),
    ('ball', KN, V(0.0040, 0.0039, 0.0039), 0.001),
]
M.LEG_K = (0.0025, 0.003)
# the two bundles of each foot: (angle, length, toes in it); front: three inner, two outer; hind: two inner, three outer
F_BUNDLES = [(-48, 0.0092, 3), (52, 0.0082, 2)]
H_BUNDLES = [(-46, 0.0086, 2), (50, 0.0094, 3)]


def bundle(Q, base, a_deg, L, n):
    a = np.radians(a_deg)
    d2 = V(np.sin(a), 0, np.cos(a))
    r0 = 0.0013 + 0.0003 * n
    p1 = base + d2 * (L * 0.5) + V(0, 0.0007, 0)
    p2 = base + d2 * L + V(0, -0.0006, 0)
    # a mitten: wide across (the fused toes), a little flattened
    Qs = (Q - base)
    t = chain(Q, [base + V(0, 0.0004, 0), p1, p2], [r0, r0 * 0.88, r0 * 0.72], 0.0008)
    cl = None
    side = np.cross(d2, V(0, 1, 0))
    for k in range(n):
        off = (k - (n - 1) / 2) * 0.0011
        c0 = p2 + side * off + d2 * 0.0006
        c1 = c0 + d2 * 0.0014 + V(0, 0.0001, 0)
        c2 = c0 + d2 * 0.0024 + V(0, -0.0010, 0)
        c2[1] = max(c2[1], 0.0002)
        e = chain(Q, [c0, c1, c2], [0.00055, 0.0004, 0.00015], 0.0)
        cl = e if cl is None else np.minimum(cl, e)
    return t, cl


def toes(P, which=(0, 1)):
    Q = M.mirror(P)
    out_t, out_c = None, None
    feet = ((M.HAND, F_BUNDLES), (M.FOOT, H_BUNDLES))
    for base, B in [feet[i] for i in which]:
        for a, L, n in B:
            t, c = bundle(Q, base, a, L, n)
            out_t = t if out_t is None else smin(out_t, t, 0.0012)
            out_c = c if out_c is None else np.minimum(out_c, c)
    return out_t, out_c


M.toes = toes
M.TOE_K = 0.0012


def leg_chain(s, front):
    R = M.rig()
    sg = 1 if s == 'L' else -1
    names = ['arm', 'fore', 'fmeta', 'fpaw'] if front else ['thigh', 'shin', 'hmeta', 'hpaw']
    pts = [R[n + s] for n in names]
    pts.append(((M.HAND if front else M.FOOT) + V(0, 0, 0.004 if front else -0.002)) * V(sg, 1, 1))
    return [n + s for n in names], pts


M.leg_chain = leg_chain


# ---------- weights: the tail along its curve, the eyes on their turrets ----------
def spine_chain():
    R = M.rig()
    pts, s, rad = tail_path()
    piv = tail_pivots()
    # the dense tail curve from its tip back to its base, then the body's pivots
    dense = [V(0, float(y), float(z)) for y, z in pts[::-1]]
    bones = ['tail%d' % (i + 1) for i in range(TAIL_BONES)][::-1] + ['hips', 'chest', 'neck', 'head']
    S_tot = float(s[-1])
    cuts = [S_tot - p[2] for p in piv][::-1][:-1]      # arc positions (from the tip) where each tail bone starts
    body = [R['chest'], R['neck'], R['head'], V(0, float(M.MOUTH[1]), float(M.MOUTH[2]) + 0.01)]
    return bones, dense, cuts, body


def spine_weights(Pw, names, bi):
    bones, dense, cuts, body = spine_chain()
    pts = dense + [V(0, float(dense[-1][1]), float(dense[-1][2]) + 0.0)] + body
    # arc length of the nearest point on the whole line
    Q = Pw * V(0, 1, 1)
    best = np.full(len(Q), np.inf, F); s = np.zeros(len(Q), F); S = [0.0]
    for i in range(len(pts) - 1):
        a, b = np.asarray(pts[i], F), np.asarray(pts[i + 1], F)
        ab = b - a; L = float(np.linalg.norm(ab))
        if L < 1e-9:
            S.append(S[-1]); continue
        t = np.clip(((Q - a) @ ab) / (L * L), 0, 1)
        dd = np.linalg.norm(Q - (a + t[:, None] * ab), axis=1)
        m = dd < best
        best = np.where(m, dd, best); s = np.where(m, S[-1] + t * L, s)
        S.append(S[-1] + L)
    S_tail = S[len(dense) - 1]
    # boundaries: the tail bones' starts (from the tip), the base of the tail (hips), then chest, neck, head pivots
    nb = len(dense) + 1
    bnd = list(cuts) + [S_tail] + [S[nb], S[nb + 1], S[nb + 2]]
    Wb = np.zeros((len(Pw), len(names)), F)
    bl = M.SPINE_BLEND
    for j, nm in enumerate(bones):
        lo = sstep(bnd[j - 1] - bl, bnd[j - 1] + bl, s) if j > 0 else np.ones_like(s)
        hi = sstep(bnd[j] + bl, bnd[j] - bl, s) if j < len(bones) - 1 else np.ones_like(s)
        Wb[:, bi[nm]] = lo * hi
    return Wb


M.spine_weights = spine_weights
M.SPINE_BLEND = 0.006


def fix_extra(W, P, names, bi):
    for s, sg in (('L', 1), ('R', -1)):
        D = P - M.EYE_C * V(sg, 1, 1)
        rho = np.linalg.norm(D, axis=1)
        out = D[:, 0] * sg
        k = sstep(M.EYE_R + 0.0042, M.EYE_R + 0.0030, rho) * sstep(-0.004, -0.001, out) * (P[:, 0] * sg > 0)
        e = np.zeros_like(W); e[:, bi['eye' + s]] = 1
        W = W * (1 - k[:, None]) + e * k[:, None]
    return W


M.fix_extra = fix_extra


def bend_segments():
    R = M.rig()
    segs = []
    pts, s, rad = tail_path()
    for i in range(0, len(pts) - 4, 4):
        a, b = V(0, float(pts[i, 0]), float(pts[i, 1])), V(0, float(pts[i + 4, 0]), float(pts[i + 4, 1]))
        segs.append((a, b, 0.0075, float(rad[i]) * 1.6, True))
    for a, b in ((R['hips'], R['chest']), (R['chest'], R['neck']), (R['neck'], R['head'])):
        segs.append((a, b, 0.012, 0.06, True))
    for chainb in (('arm', 'fore', 'fmeta', 'fpaw'), ('thigh', 'shin', 'hmeta', 'hpaw')):
        for a, b in zip(chainb[:-1], chainb[1:]):
            segs.append((R[a + 'L'], R[b + 'L'], 0.0045, 0.008, False))
    return segs


M.bend_segments = bend_segments


def onleg(c):
    return abs(c.x) > 0.011 and -0.075 < c.z < 0.064 and c.y < 0.072


M.onleg = onleg


def uv_regions(P):
    Pm = M.mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 1)
    lab[z > M.Z_HEAD] = 0
    lab[(z < M.Z_TAIL)] = 9
    lab[(z < -0.115)] = 10
    leg = (x > 0.011) & (z < M.Z_HEAD) & (z > M.Z_TAIL - 0.01) & (y < 0.07)
    lab[leg & (z > 0)] = 4
    lab[leg & (z <= 0)] = 5
    lab[leg & (y < 0.008) & (z > 0)] = 6
    lab[leg & (y < 0.008) & (z <= 0)] = 7
    # the turrets: their own island
    ed = np.linalg.norm(Pm - M.EYE_C, axis=1)
    lab[(ed < M.EYE_R + 0.0034) & (x > 0.008)] = 8
    return lab


M.uv_regions = uv_regions

M.PATCHES = [
    (V(0.0040, 0.0830, 0.0850), V(0.0215, 0.0995, 0.1030), 0.00014),   # the turret and its pupil hole
    (V(0.0, 0.0780, 0.1140), V(0.0075, 0.0960, 0.1300), 0.00016),      # snout, nose, lips
    (V(0.0150, -0.001, 0.0420), V(0.0380, 0.0080, 0.0700), 0.00014),   # front foot
    (V(0.0150, -0.001, -0.0640), V(0.0380, 0.0080, -0.0360), 0.00014), # hind foot
]
M.SC = dict(body=0.0011, leg=0.0009, head=0.0012, ring=0.0019, belly=0.0011, lip=0.0016)
M.RINGS = False
M.GRAN_H = 0.22
M.UV_HEAD = 1.6
M.KEEP_FLOOR = 0.3
M.FEET_KEEP = 0.24


def keep_extra(P):
    Pm = M.mirror(P)
    ed = np.linalg.norm(Pm - M.EYE_C, axis=1)
    k = sstep(M.EYE_R + 0.004, M.EYE_R + 0.002, ed) * 0.36
    cs = M.local(P, V(-0.016, 0.085, 0.048), V(0.016, 0.122, 0.132), casque)
    k = np.maximum(k, sstep(0.0008, 0.0, cs) * 0.32)
    return k


M.keep_extra = keep_extra


def regions_extra(r, P, N, c):
    Pm = r['Pm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    # the tail: by its curve
    pts, s, rad = tail_path()
    from scipy.spatial import cKDTree
    tr = cKDTree(np.stack([pts[:, 0], pts[:, 1]], 1))
    dd, ii = tr.query(np.stack([y, z], 1))
    r['tailS'] = s[ii] / s[-1]
    r['tail'] = np.where(z < M.Z_TAIL + 0.01, sstep(0.0, 0.05, r['tailS']), 0.0) * (1 - r['leg'])
    r['under'] = r['belly']
    r['belly'] = r['belly'] * 0.0
    ed = np.linalg.norm(Pm - M.EYE_C, axis=1)
    r['turret'] = sstep(M.EYE_R + 0.0034, M.EYE_R + 0.0022, ed) * (x > 0.006)
    D = Pm - M.EYE_C
    r['turA'] = np.arctan2(D @ M.EYE_UP, D @ M.EYE_SIDE)
    r['turG'] = (D @ M.EYE_DIR) / (M.EYE_R + 0.0024)
    r['casque'] = sstep(0.0005, 0.0, c['casque']) * sstep(-0.0002, 0.0008, c['body'] - c['casque'])
    r['crest'] = sstep(0.0004, 0.0, c['crest']) * sstep(-0.0002, 0.0004, c['body'] - c['crest'])
    r['lid'] = r['lid'] * 0.0
    return r


M.regions_extra = regions_extra


def scales_extra(H, E, C, R, P, N, c):
    Pm = R['Pm']
    # scattered big round tubercles on the flanks and the head
    m = (R['leg'] < 0.5) & (R['turret'] < 0.5)
    if m.any():
        f1, f2, cp = M.cells(Pm[m], 0.0042, 77)
        big = sstep(0.0016, 0.0011, f1) * (M.jit(cp, 78) < 0.45)
        dome = np.sqrt(np.clip(1 - (f1 / 0.0016) ** 2, 0, 1))
        H[m] = np.maximum(H[m], big * 0.00042 * (0.4 + 0.6 * dome))
        E[m] = np.where(big > 0.5, np.minimum(E[m], (0.0016 - f1) / 0.0016), E[m])
        C[m] = np.where(big[:, None] > 0.5, cp, C[m])
    # the turret: rings of granules round the pupil hole
    return H, E, C


M.scales_extra = scales_extra

# ---------- paint: green with blue and red bars, a white flank stripe ----------
K = {
    'green': M.hexc(0x3E8C3A), 'greenLt': M.hexc(0x6CB04A), 'blue': M.hexc(0x2C7C8E), 'red': M.hexc(0xB8442C), 'orange': M.hexc(0xD27A2E),
    'white': M.hexc(0xE4E2C6), 'belly': M.hexc(0xB8CC94), 'dk': M.hexc(0x24502A), 'claw': M.hexc(0x6A6050), 'ball': M.hexc(0x141010),
    'lip': M.hexc(0xD6D8B0),
}


def _stripe_y(z):
    return M.iz(z, 3) + 0.34 * (M.iz(z, 2) - M.iz(z, 3))


def paint(P, N, c):
    H, E, C, R = M.scales(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    j = M.jit(C)
    n1 = fbm(Pm * 70, 2, 81) - 0.5
    col = M.mix(M.tile(K['green'], n), K['greenLt'], 0.25 * j + 0.2 * sstep(0.0, 0.6, Nm[:, 1]))
    # the body: bars round it (blue with a red core), about 2.4 cm apart; the back stays greener
    n3 = fbm(Pm * 25, 2, 86) - 0.5
    bar = 0.5 + 0.5 * np.cos(2 * np.pi * (C[:, 2] - 0.014) / 0.026 + n1 * 2.2 + n3 * 2.5)
    trunk = sstep(-0.075, -0.06, z) * sstep(0.064, 0.05, z) * (1 - R['leg'])
    top = sstep(M.iz(z, 1) - 0.006, M.iz(z, 1) - 0.016, y)
    col = M.mix(col, K['blue'], sstep(0.35, 0.6, bar) * trunk * top * 0.85)
    col = M.mix(col, K['red'], sstep(0.8, 0.93, bar) * trunk * top * 0.75 * sstep(-0.3, 0.1, n3 + 0.2))
    # the white stripe along the lower flank, from the corner of the mouth to the hips
    ys = _stripe_y(np.clip(z, -0.06, 0.06))
    sw = sstep(0.0036, 0.0018, np.abs(y - ys - n1 * 0.002)) * sstep(-0.064, -0.05, z) * sstep(0.09, 0.075, z) * (1 - R['leg'])
    col = M.mix(col, K['white'], sw)
    # under the stripe: pale green; the belly middle line white (the ventral crest)
    below = sstep(0.0, -0.004, y - ys) * sstep(-0.065, -0.05, z) * sstep(0.085, 0.07, z) * (1 - R['leg'])
    col = M.mix(col, K['belly'], below * 0.8)
    col = M.mix(col, K['white'], sstep(0.0018, 0.0008, x) * sstep(M.iz(z, 3) + 0.003, M.iz(z, 3) + 0.001, y) * sstep(-0.06, -0.05, z) * sstep(0.12, 0.1, z))
    # the head: stripes from the eye back and down across the cheeks (red and green), the casque edges darker green
    head = sstep(M.Z_HEAD - 0.004, M.Z_HEAD + 0.004, z) * (1 - R['turret'])
    D = Pm - M.EYE_C
    ang = np.arctan2(D[:, 1], -D[:, 2])
    rad = np.hypot(D[:, 1], D[:, 2])
    st = 0.5 + 0.5 * np.cos(ang * 5.0 + 0.6)
    col = M.mix(col, K['red'], sstep(0.7, 0.85, st) * sstep(0.022, 0.006, rad) * sstep(0.004, 0.008, rad) * head * 0.85)
    col = M.mix(col, K['orange'], sstep(0.003, 0.0, np.abs(z - 0.09) - 0.003) * sstep(0.084, 0.08, y) * head * 0.3)
    col = M.mix(col, K['dk'], R['casque'] * sstep(0.5, 0.95, Nm[:, 1]) * 0.35)
    col = M.mix(col, K['lip'], R['lip'] * 0.3)
    # the turret: green and red rays round the pupil, a dark ring at the hole
    tr = 0.5 + 0.5 * np.cos(R['turA'] * 7)
    col = M.mix(col, M.mix(M.tile(K['green'], n), K['red'], sstep(0.55, 0.8, tr) * 0.8), R['turret'])
    col = M.mix(col, K['dk'], R['turret'] * sstep(0.8, 0.95, R['turG']) * 0.7)
    # the tail: green with blue bands and thin red rings along its curve
    ts = R['tailS']
    tb = 0.5 + 0.5 * np.cos(2 * np.pi * ts * 9 + n1)
    col = M.mix(col, K['blue'], sstep(0.4, 0.65, tb) * R['tail'] * 0.6)
    col = M.mix(col, K['red'], sstep(0.85, 0.95, tb) * R['tail'] * 0.8)
    # the legs: red spots
    sp = sstep(0.0014, 0.0009, M.cells(C, 0.005, 82)[0]) * R['leg'] * (1 - R['toe'])
    col = M.mix(col, K['red'], sp * 0.7)
    # the crest cones pale
    col = M.mix(col, K['white'], R['crest'] * 0.6)
    col = col * (0.72 + 0.28 * sstep(0.0, 0.22, E))[:, None]
    col *= (0.96 + 0.08 * fbm(Pm * 90, 2, 83))[:, None]
    col = M.mix(col, K['claw'], R['claw'])
    col = M.mix(col, K['ball'], R['ball'])
    rough = 0.6 + 0.12 * (1 - sstep(0.0, 0.2, E)) - 0.2 * R['claw'] - 0.3 * R['ball']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


KB = {'base': M.hexc(0x7E7458), 'lt': M.hexc(0x9C9070), 'dk': M.hexc(0x4E4636), 'stripe': M.hexc(0xC8C0A0)}
M.BABY_MAP = (320, 58)


def paint_baby(P, N, c):
    """the hatchling: a dull gray-brown with darker bars, the pale flank stripe faint"""
    H, E, C, R = M.scales(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    j = M.jit(C, 84)
    n1 = fbm(Pm * 70, 2, 85) - 0.5
    col = M.mix(M.tile(KB['base'], n), KB['lt'], 0.3 * j + 0.2 * sstep(0.0, 0.6, Nm[:, 1]))
    bar = 0.5 + 0.5 * np.cos(2 * np.pi * (C[:, 2] - 0.014) / 0.024 + n1 * 1.4)
    col = M.mix(col, KB['dk'], sstep(0.6, 0.85, bar) * sstep(-0.075, -0.06, z) * sstep(0.064, 0.05, z) * 0.5)
    ys = _stripe_y(np.clip(z, -0.06, 0.06))
    sw = sstep(0.0036, 0.0018, np.abs(y - ys)) * sstep(-0.064, -0.05, z) * sstep(0.09, 0.075, z) * (1 - R['leg'])
    col = M.mix(col, KB['stripe'], sw * 0.6)
    col = M.mix(col, KB['dk'], sstep(0.85, 0.95, 0.5 + 0.5 * np.cos(2 * np.pi * R['tailS'] * 9)) * R['tail'] * 0.5)
    col = col * (0.75 + 0.25 * sstep(0.0, 0.22, E))[:, None]
    col = M.mix(col, K['claw'], R['claw'])
    col = M.mix(col, K['ball'], R['ball'])
    return np.clip(col, 0, 1).astype(F), np.full(n, 0.6, F)


def stats(P, N, c, col):
    R = M.regions(P, N, c)
    lin = np.where(col <= 0.04045, col / 12.92, ((col + 0.055) / 1.055) ** 2.4)
    lum = lin @ np.array([0.2126, 0.7152, 0.0722], F)
    m = (R['claw'] < 0.5) & (R['ball'] < 0.5)
    return {'lidCol': 0x3E7A36, 'lum': float(np.mean(lum[m]))}


M.stats = stats
M.paint = paint
M.paint_baby = paint_baby
M.MAP_QUALITY = (52, 25)
M.EYE_META = dict(iris=0xC89A3A, irisR=0.26, pupilR=0.5, rim=0x2A1A0E, bone='eyeL', lid=[1.0, -1.0, 0.0])
M.TINT = dict(tint=[1.0, 1.0, 1.0], babyTint=[1.0, 1.0, 1.0], rim=[0.03, 0.05, 0.03], flat=0x3E8C3A)
_meta0 = M.meta


def meta(st):
    m = _meta0(st)
    m['eye']['lid'] = [1.0, -1.0, 0.0]
    m['eye']['lidCol'] = 0x3E7A36
    # the skin's mean brightness (linear), for the game's color change (setTint keeps the pattern by brightness)
    m['chroma'] = {'lum': round(st['lum'], 4)}
    return m


M.meta = meta
M.PREVIEW = {
    'side': ((0.6, 0.12, -0.02), (0, 0.06, -0.02), 30),
    'front3q': ((0.32, 0.2, 0.4), (0, 0.06, 0.0), 30),
    'head3q': ((0.11, 0.12, 0.2), (0, 0.09, 0.09), 26),
    'top': ((0.001, 0.75, -0.02), (0, 0.06, -0.02), 30),
    'front': ((0.0, 0.1, 0.42), (0, 0.07, 0.06), 26),
}
LK.install(globals(), M, KS)
