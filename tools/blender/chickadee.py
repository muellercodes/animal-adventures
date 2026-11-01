# Black-capped chickadee (Maine's state bird), sculpted as a signed distance field around the game's chickadee
# skeleton (bird.py has the shared bird parts). Units are meters in game rig space (x left, y up, z forward, ground at
# y = 0). Made level like the macaw (the flight pose; the game tilts the body up to stand), the wing arm flat to the side
# under the game's feather blades. A tiny round songbird: a big round head with the black cap and bib and bright white
# cheeks, a soft gray back, buffy peach flanks, a whitish belly, a tiny black bill, dark eyes, thin dark gray legs.
# The chick: fluffier (fur shells), a sooty cap and bib, and the yellow gape at the corners of its bill.
# Make it with: VOXEL=0.0005 TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py chickadee
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, loft, frame, fbm, vnoise, worley, length
import bird as B
from bird import local, local_n, mirror, groove, hexc, mix

ID = 'chickadee'
BOUNDS = (V(-0.085, -0.0005, -0.048), V(0.085, 0.09, 0.066))
PATCHES = [
    (V(0.0, 0.064, 0.038), V(0.015, 0.082, 0.064), 0.00012),     # bill, eye
    (V(0.0, -0.0005, -0.006), V(0.022, 0.006, 0.018), 0.00011),  # feet
]
BAKE_DIST = (0.0012, 0.0035, 0.012)
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
UV_PACK = dict(shape_method='CONCAVE', rotate_method='ANY')

HIPS, TAILB, NECK, HEAD = V(0, 0.044, 0), V(0, 0.05, -0.034), V(0, 0.056, 0.026), V(0, 0.07, 0.036)
THIGH, SHIN, HMETA, HPAW = V(0.0085, 0.04, 0.004), V(0.0105, 0.03, 0.013), V(0.0105, 0.0205, 0.001), V(0.0105, 0.0015, 0.005)
SH, EL, WR, WT = V(0.013, 0.056, 0.016), V(0.033, 0.056, 0.016), V(0.058, 0.056, 0.016), V(0.07675, 0.056, 0.016)
EYE_C = V(0.0102, 0.0757, 0.0458)
EYE_R = 0.0026
EYE_DIR = nrm([0.9, 0.1, 0.4])
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_R = 0.0021
MOUTH = V(0.0, 0.0703, 0.0585)
FOOT = HPAW + V(0, 0.0, 0.0)
TOES = [dict(a=-24, len=0.0085, r=0.00085, r1=0.00058, claw=0.0032, clawR=0.00048, clawDrop=0.3, n=3),
        dict(a=2, len=0.0102, r=0.0009, r1=0.0006, claw=0.0035, clawR=0.0005, clawDrop=0.3, n=3),
        dict(a=26, len=0.0085, r=0.00085, r1=0.00058, claw=0.0032, clawR=0.00048, clawDrop=0.3, n=3),
        dict(a=178, len=0.0082, r=0.00095, r1=0.00062, claw=0.0041, clawR=0.00052, clawDrop=0.32, lift=0.0006, n=2)]

TRUNK = [
    (-0.043, 0.0528, 0.0512, 0.0496, 0.003, 2.0, 2.0),
    (-0.037, 0.0565, 0.05, 0.0442, 0.0092, 2.1, 2.0),
    (-0.027, 0.0612, 0.048, 0.036, 0.0162, 2.2, 2.1),
    (-0.013, 0.0645, 0.0462, 0.0292, 0.0212, 2.3, 2.3),
    (0.0, 0.066, 0.046, 0.027, 0.0228, 2.3, 2.4),
    (0.012, 0.0665, 0.048, 0.0278, 0.0222, 2.3, 2.3),
    (0.022, 0.0655, 0.051, 0.032, 0.0192, 2.2, 2.2),
    (0.03, 0.063, 0.054, 0.039, 0.0142, 2.1, 2.1),
    (0.035, 0.0602, 0.056, 0.0478, 0.0082, 2.0, 2.0),
]
UPPER = ([V(0, 0.0727, 0.0488), V(0, 0.0727, 0.0525), V(0, 0.0721, 0.0558), V(0, 0.0712, 0.0588), V(0, 0.0703, 0.0612)],
         [0.0029, 0.0025, 0.0019, 0.0012, 0.0004])
LOWER = ([V(0, 0.0693, 0.0492), V(0, 0.0694, 0.0535), V(0, 0.0697, 0.0575)], [0.0023, 0.0016, 0.0006])
YCAP = ([0.016, 0.024, 0.031, 0.038, 0.044, 0.05, 0.06], [0.0605, 0.0645, 0.0685, 0.0718, 0.0733, 0.0735, 0.0732])
BIBW = ([0.0455, 0.05, 0.055, 0.0605, 0.0655, 0.0695], [0.0, 0.0062, 0.0096, 0.0108, 0.0094, 0.0058])


def trunk(P):
    Q = mirror(P)
    d = loft(Q, TRUNK)
    d = smin(d, ellipsoid(Q, V(0, 0.0435, 0.0155), V(0.0195, 0.0185, 0.0165)), 0.007)     # round breast
    d = smin(d, ellipsoid(Q, V(0.0125, 0.0535, -0.004), V(0.0065, 0.0072, 0.022)), 0.006)  # side pockets for the folded wings
    d = smin(d, ellipsoid(Q, V(0.0, 0.034, -0.012), V(0.017, 0.012, 0.018)), 0.006)       # a round fluffy belly
    return d


def neck(P):
    Q = mirror(P)
    return chain(Q, [V(0, 0.049, 0.019), V(0, 0.0615, 0.0292), V(0, 0.0685, 0.0345)], [0.0162, 0.0148, 0.0138], 0.004)


def head(P):
    """a big round head; the bill and the eyes are their own parts"""
    Q = mirror(P)
    d = ellipsoid(Q, V(0, 0.0745, 0.0365), V(0.0135, 0.0128, 0.0148))
    d = smin(d, ellipsoid(Q, V(0.004, 0.0705, 0.0412), V(0.0118, 0.0102, 0.0112)), 0.003)
    d = smin(d, ellipsoid(Q, V(0, 0.0735, 0.0462), V(0.0085, 0.0075, 0.0068)), 0.003)
    return d


def beak(P):
    Q = mirror(P)
    S = V(1 / 0.9, 1, 1)
    up = chain(Q * S, [p * S for p in UPPER[0]], UPPER[1], 0.0005) * 0.9
    lo = chain(Q * S, [p * S for p in LOWER[0]], LOWER[1], 0.0005) * 0.9
    d = smin(up, lo, 0.0003)
    y, z = Q[:, 1], Q[:, 2]
    d = d + groove(y - 0.0702 + 0.06 * (z - 0.05), 0.00012, 0.00018) * sstep(0.0495, 0.051, z) * sstep(0.0595, 0.058, z)
    return d


def eye_parts(P):
    Q = mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0, -0.0004), V(EYE_R + 0.0006, EYE_R + 0.0006, EYE_R + 0.0002))
    ap = np.sqrt(s * s + u * u) - LID_R
    carve = smax(ap, -(g + 0.0003), 0.0002)
    ball = length(D) - EYE_R * 0.92
    return carve, lids, ball


def drum(P):
    Q = mirror(P)
    return round_cone(Q, V(0.0082, 0.0405, 0.006), V(0.0101, 0.0275, 0.0082), 0.0068, 0.0038)


def tarsus(P):
    Q = mirror(P)
    j = round_cone(Q, V(0.0103, 0.0265, 0.0078), V(0.0105, 0.0215, 0.0016), 0.0018, 0.0012)
    t = round_cone(Q, V(0.0105, 0.0215, 0.0016), HPAW + V(0, 0.0012, -0.0004), 0.00105, 0.001)
    pad = ellipsoid(Q, HPAW + V(0, -0.0001, 0.0003), V(0.0014, 0.0009, 0.0015))
    return smin(smin(j, t, 0.0008), pad, 0.0006)


def feet(P):
    Q = mirror(P)
    tt, cl, _ = B.toes(Q, FOOT, TOES)
    return tt, cl


def arm(P):
    Q = mirror(P)
    return B.wing_arm(Q, [SH + V(-0.004, -0.001, -0.001), EL, WR, WT], [0.0125, 0.0115, 0.0092, 0.003], [0.0036, 0.003, 0.0024, 0.001], lead=0.62)


def grid(h):
    lo, hi = BOUNDS
    xs = B.axis_steps(0.0, hi[0], [(0.0, 0.026, h * 0.8), (0.027, 0.085, h * 1.4)], h)
    ys = B.axis_steps(lo[1], hi[1], [(lo[1], 0.006, h * 0.3), (0.006, 0.028, h * 0.5), (0.052, 0.06, h * 0.6), (0.062, 0.084, h * 0.6)], h)
    zs = B.axis_steps(lo[2], hi[2], [(-0.006, 0.018, h * 0.5), (0.04, 0.064, h * 0.5)], h)
    return xs, ys, zs


HEAD_BOX = (V(-0.018, 0.058, 0.02), V(0.018, 0.09, 0.066))
NECK_BOX = (V(-0.02, 0.03, 0.0), V(0.02, 0.086, 0.054))
LEG_BOX = (V(-0.024, -0.0006, -0.008), V(0.024, 0.05, 0.022))
ARM_BOX = (V(0.004, 0.049, 0.0), V(0.085, 0.063, 0.032))
EYE_BOX = (V(-0.016, 0.072, 0.041), V(0.016, 0.08, 0.05))


def parts(P):
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    ft, cl = local_n(P, *LEG_BOX, feet, 2)
    return {'trunk': trunk(P), 'neck': local(P, *NECK_BOX, neck), 'head': local(P, *HEAD_BOX, head), 'bill': local(P, *HEAD_BOX, beak),
            'lids': li, 'ball': ba, 'carve': ca, 'drum': local(P, *LEG_BOX, drum), 'tarsus': local(P, *LEG_BOX, tarsus), 'toes': ft, 'claws': cl,
            'arm': local(mirror(P), *ARM_BOX, arm)}


def shape(P):
    d = local(P, (-0.03, 0.018, -0.048), (0.03, 0.072, 0.04), trunk)
    d = smin(d, local(P, *NECK_BOX, neck), 0.005)
    h = local(P, *HEAD_BOX, head)
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    h = smin(h, li, 0.0009)
    h = smax(h, -ca, 0.0002)
    h = smin(h, ba, 0.00012)
    h = smin(h, local(P, *HEAD_BOX, beak), 0.0009)
    d = smin(d, h, 0.004)
    lg = smin(local(P, *LEG_BOX, drum), local(P, *LEG_BOX, tarsus), 0.0012)
    ft, cl = local_n(P, *LEG_BOX, feet, 2)
    lg = smin(lg, smin(ft, cl, 0.00012), 0.0006)
    d = smin(d, lg, 0.003)
    d = smin(d, local(mirror(P), *ARM_BOX, arm), 0.003)
    return d


PREVIEW = {
    'side': ((0.3, 0.05, 0.008), (0, 0.045, 0.008), 30),
    'front3q': ((0.16, 0.1, 0.19), (0, 0.045, 0.01), 30),
    'front': ((0.0, 0.06, 0.28), (0, 0.048, 0.0), 30),
    'rear3q': ((-0.15, 0.11, -0.2), (0, 0.045, -0.005), 30),
    'top': ((0.002, 0.32, 0.0), (0, 0.045, 0.0), 30),
    'face': ((0.035, 0.084, 0.085), (0.0, 0.0735, 0.047), 24),
    'faceside': ((0.07, 0.077, 0.05), (0.0, 0.074, 0.046), 22),
    'feet': ((0.04, 0.015, 0.05), (0.0105, 0.004, 0.006), 26),
}

# ---------- skinning ----------
WEIGHT_SMOOTH = (0, 0)
SPINE = ['tail', 'hips', 'neck', 'head']


def _spine_u(P):
    y, z = P[:, 1], P[:, 2]
    ut = 1.5 + np.clip((z + 0.032) / 0.01, -1, 0)
    un = np.interp(y, [0.046, 0.056, 0.07, 0.09], [1.5, 2.0, 3.0, 4.0]).astype(F)
    yn = y - 0.056 - 0.6 * np.maximum(0, 0.024 - z)
    k = sstep(0.0, 0.006, yn)
    return ut * (1 - k) + un * k


WCFG = dict(groups=[('body', ['trunk', 'neck']), ('head', ['head', 'bill', 'lids']), ('drum', ['drum']), ('tarsus', ['tarsus']), ('foot', ['toes', 'claws']),
                    ('arm', ['arm'])],
            bias={'body': 0.0004}, spine=SPINE, spine_u=_spine_u, head_u=3.35, knee=(0.028, 0.033), hipb=(0.032, 0.038, 0.75),
            ankle_d=(0.024, 0.021), ankle=(0.018, 0.022), pad=(0.0035, 0.0015), toe_up=(0.0016, 0.003), arm=(SH, EL, WR, WT), arm_root=(0.019, 0.015))


def fix_weights(W, wpos, names, G, weld):
    return B.part_weights(W, wpos, names, parts(wpos.astype(F)), WCFG)


def bone_tips(P):
    t = {'hips': P['neck'], 'tail': TAILB + V(0, 0.0, -0.03), 'neck': P['head'], 'head': MOUTH}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, -0.0006, 0.009)) * m
        t['wing' + s] = P['wfore' + s]; t['wfore' + s] = P['whand' + s]; t['whand' + s] = WT * m
    return t


OWN_KEYS = ['trunk', 'neck', 'head', 'bill', 'drum', 'tarsus', 'toes', 'claws', 'arm', 'lids']


def _own(c):
    D = np.stack([c[k] for k in OWN_KEYS], 1)
    o = np.argmin(D, 1)
    return {k: (o == i).astype(F) for i, k in enumerate(OWN_KEYS)}


def keep(P):
    Pm = mirror(P)
    R = _own(parts(P))
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    ball = sstep(EYE_R * 0.97, EYE_R * 0.8, de)
    k = 0.45 * R['trunk'] + 0.55 * R['neck'] + 0.78 * R['head'] + 0.83 * R['bill'] + 0.85 * R['lids']
    k += 0.55 * R['drum'] + 0.72 * R['tarsus'] + 0.8 * (R['toes'] + R['claws']) + 0.2 * R['arm']
    rim = sstep(EYE_R + 0.0012, EYE_R + 0.0004, de) * sstep(EYE_R * 0.9, EYE_R * 1.0, de) * 0.85
    return np.maximum(k, rim) * (1 - ball)


# ---------- plumage ----------
K = {
    'black': hexc(0x151515), 'blackHi': hexc(0x2C2C2E), 'white': hexc(0xF5F3EF), 'whiteSh': hexc(0xDAD8D2),
    'gray': hexc(0x8A8C88), 'grayLt': hexc(0x9EA09A), 'grayDk': hexc(0x6C6E6C), 'buff': hexc(0xD8AE82), 'buffLt': hexc(0xE6C8A4),
    'belly': hexc(0xEDE8DE), 'bill': hexc(0x1C1C1E), 'leg': hexc(0x4C5056), 'legHi': hexc(0x6C7078),
    'claw': hexc(0x2A2A2E), 'lid': hexc(0x2A2A2C),
}


def _cap(Pm, R):
    """the black cap: from the bill over the crown to the nape, its lower edge through the eye"""
    y, z = Pm[:, 1], Pm[:, 2]
    yc = np.interp(z, YCAP[0], YCAP[1]).astype(F) + 0.0006 * (fbm(Pm * 900, 2, 51) - 0.5)
    hd = np.clip(R['head'] + R['neck'] + R['lids'] + R['trunk'], 0, 1)
    return sstep(yc - 0.0005, yc + 0.0005, y) * hd


def _bib(Pm, Nm, R):
    """the black bib: the chin and the throat, ragged at its lower edge"""
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    w0 = np.interp(y, BIBW[0], BIBW[1]).astype(F)
    w = w0 + 0.0008 * (fbm(Pm * 1200, 2, 52) - 0.5)
    front = sstep(-0.1, 0.35, Nm[:, 2] - 0.4 * Nm[:, 1])
    # (below the bib w0 is 0: without the last factor the noise drew a thin black line down the middle of the breast)
    on = sstep(w + 0.0005, w - 0.0005, x) * sstep(0.0703, 0.0697, y) * front * sstep(0.02, 0.028, z + 0.5 * (0.07 - y)) * sstep(0.0001, 0.0008, w0)
    return on * np.clip(R['head'] + R['neck'] + R['trunk'], 0, 1)


def _flow(P, N, R):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    n = len(P)
    fl = np.zeros((n, 3), F)
    side = sat(-N[:, 1] * 0.6 + 0.2)
    fl[:, 1] = -0.25 - 0.55 * side
    fl[:, 2] = -1.0
    breast = sstep(0.008, 0.02, z) * sstep(0.054, 0.04, y)
    fl[:, 1] -= 1.6 * breast
    fl[:, 2] += 0.6 * breast
    nk = np.maximum(R['neck'], R['head'] + R['lids'])
    hd = sstep(0.07, 0.074, y) * nk
    fl[:, 1] = fl[:, 1] * (1 - nk) + nk * (-1.0 * (1 - hd) - 0.3 * hd)
    fl[:, 2] = fl[:, 2] * (1 - nk) + nk * (-0.3 * (1 - hd) - 1.0 * hd)
    dr = R['drum']
    fl[:, 1] = fl[:, 1] * (1 - dr) - dr
    fl[:, 2] = fl[:, 2] * (1 - dr) - 0.25 * dr
    ar = R['arm']
    fl[:, 0] = fl[:, 0] * (1 - ar) + 0.3 * ar
    fl[:, 1] *= (1 - ar)
    fl[:, 2] = fl[:, 2] * (1 - ar) - ar
    return fl / np.maximum(np.linalg.norm(fl, axis=1, keepdims=True), 1e-9)


def _size(P, N, R):
    y = P[:, 1]
    s = np.full(len(P), 0.0035, F)
    s = s - 0.0008 * sstep(-0.3, -0.8, N[:, 1])
    nk = R['neck']
    s = s * (1 - nk) + nk * 0.0026
    hd = R['head'] + R['lids']
    s = s * (1 - hd) + hd * 0.0016
    s = s * (1 - R['drum']) + R['drum'] * 0.0022
    s = s * (1 - R['arm']) + R['arm'] * 0.0025
    return s


def _fshape(P):
    n = len(P)
    return np.ones(n, F) * 1.15, np.ones(n, F), np.ones(n, F) * 1.1


_pcache = {}


def _plum(P, N, c):
    key = (len(P), float(P[:7].sum()))
    if key not in _pcache:
        R = _own(c)
        Pm = mirror(P)
        Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
        fl = _flow(Pm, Nm, R)
        sz = _size(Pm, Nm, R)
        feath = np.clip(R['trunk'] + R['neck'] + R['head'] + R['drum'] + R['arm'], 0, 1)
        pl = B.plumage(Pm, Nm, fl, sz, _fshape, seed=23)
        _pcache.clear()
        _pcache[key] = (R, Pm, Nm, fl, sz, feath, pl)
    return _pcache[key]


def _body_col(Pm, Nm, R, pl, n):
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    # soft gray back (a touch of olive), buffy peach flanks, whitish breast and belly
    col = mix(np.tile(K['gray'], (n, 1)), K['grayLt'], (fid - 0.5) * 0.3)
    flank = sstep(0.35, -0.1, Nm[:, 1]) * sstep(0.1, 0.5, np.abs(Nm[:, 0])) * sstep(0.03, 0.0, z)
    col = mix(col, mix(np.tile(K['buff'], (n, 1)), K['buffLt'], (fid - 0.3) * 0.5), flank * 0.9)
    under = sstep(-0.35, -0.85, Nm[:, 1]) + sstep(0.1, 0.6, Nm[:, 2]) * sstep(0.052, 0.04, y) * sstep(0.0, 0.012, z)
    col = mix(col, K['belly'], np.clip(under, 0, 1) * 0.9)
    col = mix(col, K['buffLt'], sstep(-0.025, -0.038, z) * sstep(0.1, -0.5, Nm[:, 1]) * 0.7)
    # each feather a little darker toward its base where the next one covers it (not on the midline, where the
    # mirrored feathers meet and would draw a parting line)
    mid = sstep(0.0008, 0.003, np.abs(x))
    col = mix(col, col * 0.86, sstep(0.45 * cfa, 1.3 * cfa, -pl['a']) * 0.5 * pl['cov'] * mid)
    return col


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    n1 = fbm(Pm * 300, 3, 11)
    col = _body_col(Pm, Nm, R, pl, n)
    col *= (0.95 + 0.1 * n1)[:, None]
    # the head: bright white cheeks between the black cap and bib, running back to the sides of the nape
    hd = np.clip(R['head'] + R['lids'] + R['neck'] * sstep(0.052, 0.06, y), 0, 1)
    wcol = mix(np.tile(K['white'], (n, 1)), K['whiteSh'], sstep(0.35, 0.0, Nm[:, 0] * np.sign(x + 1e-9) + 0.2) * 0.3)
    col = mix(col, wcol, hd * sstep(0.02, 0.03, z + 0.4 * (y - 0.06)))
    cap = _cap(Pm, R)
    bib = _bib(Pm, Nm, R)
    bcol = mix(np.tile(K['black'], (n, 1)), K['blackHi'], sstep(0.4, 0.9, Nm[:, 1]) * 0.25)
    col = mix(col, bcol, np.clip(cap + bib, 0, 1))
    bl = R['bill']
    col = mix(col, K['bill'], bl)
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    col = mix(col, mix(np.tile(K['leg'], (n, 1)), K['legHi'], sstep(0.4, 0.9, fbm(Pm * 2400, 2, 34)) * 0.4), lg)
    col = mix(col, K['claw'], R['claws'])
    col = mix(col, K['lid'], R['lids'] * 0.9)
    rough = 0.7 + 0.06 * (n1 - 0.5) - 0.06 * sstep(0.1, 0.8, Nm[:, 1]) * feath
    rough = np.where(bl > 0.5, 0.35, rough)
    rough = np.where(lg > 0.5, 0.5, rough)
    rough = np.where(np.clip(cap + bib, 0, 1) > 0.5, 0.6, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _leg_h(P, c, R):
    Pm = mirror(P)
    h = np.zeros(len(P), F)
    sh, sg = B.scutes(Pm, nrm([0, -1, 0.15]), 0.0007, 42)
    h += np.clip(R['tarsus'] + R['toes'], 0, 1) * (0.00001 * sh - 0.00001 * sg)
    return h


def detail(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    h = np.zeros(len(P), F)
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    # soft, fluffy body feathers: low edges, none along the midline (the mirrored feathers would meet in a ridge)
    h += B.feather_height(pl, 0.025) * feath * (1 - 0.5 * hd) * sstep(0.0008, 0.003, np.abs(Pm[:, 0]))
    h += _leg_h(P, c, R)
    return h


def finish(C, ao, valid):
    return B.finish_ao(C, ao, 0.34)


# ---------- the chick: fluffier, a sooty cap and bib, grayer cheeks, the yellow gape ----------
GAPE = V(0.0036, 0.0697, 0.0522)     # the corner of the bill on the surface (the chick's yellow gape flange)
KB = {'down': hexc(0x9A9C98), 'cheek': hexc(0xD8D8D2), 'sooty': hexc(0x3E3C3A), 'bill': hexc(0x3A3836), 'gape': hexc(0xF6D63C), 'leg': hexc(0x8A8C92)}


def paint_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    dn, tip = B.down(Pm, fl, Nm, 0.0007, 82)
    col = _body_col(Pm, Nm, R, pl, n)
    col = mix(col, KB['down'], np.full(n, 0.35, F))
    hd = np.clip(R['head'] + R['lids'] + R['neck'] * sstep(0.052, 0.06, y), 0, 1)
    col = mix(col, KB['cheek'], hd * sstep(0.02, 0.03, z + 0.4 * (y - 0.06)))
    col = mix(col, KB['sooty'], np.clip(_cap(Pm, R) + _bib(Pm, Nm, R), 0, 1) * 0.9)
    col *= (0.84 + 0.26 * dn)[:, None]
    # the bill dark, its corners (the gape) bright yellow
    gape = sstep(0.0028, 0.0014, np.linalg.norm((Pm - GAPE) * V(0.8, 1.3, 1.0), axis=1))
    col = mix(col, KB['bill'], R['bill'])
    col = mix(col, KB['gape'], np.clip(gape * (R['bill'] + R['head']), 0, 1))
    lg = np.clip(R['tarsus'] + R['toes'] + R['claws'], 0, 1)
    col = mix(col, KB['leg'], lg)
    col = mix(col, KB['sooty'], R['lids'] * 0.8)
    rough = np.where(R['bill'] + lg > 0.5, 0.5, 0.92)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _baby_body(Q):
    """a round fluffy ball of a body and a short thick neck"""
    d = ellipsoid(Q, V(0, 0.046, -0.002), V(0.024, 0.022, 0.03))
    return smin(d, round_cone(Q, V(0, 0.054, 0.02), V(0, 0.069, 0.035), 0.016, 0.0138), 0.006)


def _baby_extra(Q, Nm, R):
    """the chick's puffy gape flanges at the corners of the bill"""
    g = sstep(0.0032, 0.0012, np.linalg.norm(Q - GAPE, axis=1))
    return Nm * (0.0011 * g * np.clip(R['bill'] + R['head'], 0, 1))[:, None]


def baby_offset(P, N, c):
    return B.baby_shape(P, N, _own(c), _baby_body, (V(0.0105, 0.012, 0.006), V(0.0085, 0.04, 0.006), 0.0028, 1.15), SH + V(-0.006, -0.003, -0.002), (0.0007, 0.0012),
                        maxd=0.012, extra=_baby_extra)


def detail_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, fl, Nm, 0.0007, 82)
    return 0.00006 * (dn - 0.5) * feath + _leg_h(P, c, R)


# the chick's fluffy feathers as fur shells (babyOnly: the adult keeps its sleek feathers)
FUR = dict(len=0.008, n=5, lean=0.35, tile=0.0006, babyLen=1.0, babyLean=0.35, shade=0.88, babyOnly=True, quality=80)


def fur(P, N, c):
    return B.down_fur(P, c, FUR['len'], ['bill', 'tarsus', 'toes', 'claws', 'lids'],
                      {'head': 0.6, 'neck': 0.85, 'arm': 0.7, 'drum': 0.8}, (EYE_C, EYE_R), edge=0.0008, den=0.9, seed=82)


def flow(P, N):
    return B.down_flow(sys.modules[__name__], P, N)


# ---------- feather blades (atlas cells, same order as the game's feather cells) ----------
def _cells():
    F_ = B.FeatherCell
    gr, grD, grL, wh = hexc(0x6C6E6E), hexc(0x4A4C4E), hexc(0x8C8E8C), hexc(0xF0EEEA)

    def prim(s, t, side):
        c = mix(np.tile(grD, (len(s), 1)), wh, sstep(0.55, 0.85, s) * 0.55 * sstep(0.15, 0.4, t))
        return mix(c, hexc(0x3A3C3E), sstep(0.7, 1.0, t) * 0.4)

    def sec(s, t, side):
        # the white wing panel: bright white outer edges on the secondaries and greater coverts
        c = mix(np.tile(grD, (len(s), 1)), wh, sstep(0.45, 0.75, s) * 0.85)
        return mix(c, grD, sstep(0.8, 1.0, t) * 0.4)

    def cov(s, t, side):
        return mix(np.tile(gr, (len(s), 1)), grL, sstep(0.55, 1.0, np.abs(s)) * 0.4)

    def tert(s, t, side):
        return mix(np.tile(grD, (len(s), 1)), wh, sstep(0.4, 0.75, np.abs(s)) * 0.75)

    def tail(s, t, side):
        c = mix(np.tile(gr, (len(s), 1)), grD, sstep(0.0, -0.6, s) * 0.4)
        return mix(c, wh, sstep(0.65, 0.9, s) * 0.5)

    return [F_('flight', prim, w=0.6, outer=0.55, tip=0.35, shaft=hexc(0x2A2C2E)),
            F_('round', sec, w=0.72, outer=0.85, tip=0.5, shaft=hexc(0x2A2C2E)),
            F_('round', sec, w=0.8, outer=0.9, tip=0.8, shaft=hexc(0x2A2C2E)),
            F_('round', cov, w=0.8, outer=0.9, tip=1.1, shaft=hexc(0x3A3C3E)),
            F_('round', tert, w=0.76, outer=0.85, tip=0.7, shaft=hexc(0x2A2C2E)),
            F_('round', tail, w=0.62, outer=0.8, tip=0.6, shaft=hexc(0x2A2C2E)),
            F_('round', cov, w=0.78, outer=0.9, tip=0.9, shaft=hexc(0x3A3C3E)),
            F_('round', cov, w=0.8, outer=0.9, tip=0.8, shaft=hexc(0x3A3C3E))]


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = hexc(0x8A8C8A), hexc(0x6C6E6E)
    def dn(s, t, side):
        return mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 8


FEATHER_ATLAS = {'size': (1024, 512), 'out': (512, 256), 'cells': _cells, 'baby': _baby_cells, 'quality': (72, 80, 72),
                 'alpha_quality': 50}


def extra_maps(X):
    B.extra_maps(sys.modules[__name__], X)


def export_extra(meta, out_dir, work):
    B.export_extra(sys.modules[__name__], meta, out_dir, work)


MAP_QUALITY = (76, 70)
BABY_MAPS = {'size': 384, 'quality': (74, 72)}


def stats(P, N, c, col):
    return {'lidCol': 0x2A2A2C}


def meta(st):
    r = EYE_R
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [0.84, -0.84, 0.1],
                'iris': 0x1C1410, 'irisR': 0.95, 'pupilR': 0.5, 'rim': 0x0E0C0A, 'lidCol': st['lidCol'], 'babyLidCol': 0x3E3C3A},
        'collar': {'at': ['neck', 'head', 0.3], 'w': 0.8, 'babyAt': 0.35, 'hug': True, 'babyK': 1.6, 'lift': 0.35},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.1, 0.1, 0.1], 'flat': 0x8A8C88,
    }
