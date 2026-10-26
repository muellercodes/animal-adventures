# Scarlet macaw, sculpted as a signed distance field around the game's parrot skeleton (bird.py has the shared bird
# parts). Units are meters in game rig space (x left, y up, z forward, ground at y = 0). Made in the rig's bind pose:
# the body level (the game tilts it up to stand), the wing arm flat to the side under the game's feather blades.
# Make it with: TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py parrot
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, loft, frame, fbm, vnoise, worley, length
import bird as B
from bird import local, local_n, mirror, groove, hexc, mix

ID = 'parrot'
BOUNDS = (V(-0.33, -0.001, -0.17), V(0.33, 0.44, 0.2))
PATCHES = [
    (V(0.0, 0.31, 0.08), V(0.045, 0.43, 0.192), 0.0006),        # beak, face, eye
    (V(0.0, -0.001, -0.04), V(0.09, 0.02, 0.06), 0.0006),       # foot
]
BAKE_DIST = (0.005, 0.014, 0.05)
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
UV_PACK = dict(shape_method='CONCAVE', rotate_method='ANY')

HIPS, TAILB, NECK, HEAD = V(0, 0.17, 0), V(0, 0.2, -0.12), V(0, 0.26, 0.085), V(0, 0.355, 0.105)
THIGH, SHIN, HMETA, HPAW = V(0.033, 0.135, 0.0), V(0.038, 0.095, 0.03), V(0.038, 0.06, 0.0), V(0.038, 0.006, 0.012)
SH, EL, WR, WT = V(0.058, 0.245, 0.05), V(0.1364, 0.245, 0.05), V(0.2344, 0.245, 0.05), V(0.3079, 0.245, 0.05)
EYE_C = V(0.0318, 0.3965, 0.1165)
EYE_R = 0.0062
EYE_DIR = nrm([0.92, 0.12, 0.37])
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_R = 0.0049
MOUTH = V(0.0, 0.343, 0.177)
NOSTRIL = V(0.0062, 0.4025, 0.1365)
FOOT = HPAW + V(0, 0.0, 0.0)
TOES = [dict(a=-22, len=0.034, r=0.0058, r1=0.0036, claw=0.011, clawDrop=0.2, n=3), dict(a=16, len=0.037, r=0.006, r1=0.0037, claw=0.012, clawDrop=0.2, n=3),
        dict(a=150, len=0.03, r=0.0056, r1=0.0035, claw=0.011, clawDrop=0.2, n=3), dict(a=-165, len=0.027, r=0.0055, r1=0.0034, claw=0.01, clawDrop=0.2, n=2)]

TRUNK = [
    (-0.15, 0.214, 0.205, 0.196, 0.012, 2.0, 2.0),
    (-0.13, 0.222, 0.2, 0.18, 0.03, 2.1, 2.0),
    (-0.1, 0.23, 0.192, 0.152, 0.048, 2.2, 2.1),
    (-0.05, 0.238, 0.184, 0.128, 0.06, 2.3, 2.3),
    (0.0, 0.242, 0.182, 0.118, 0.064, 2.3, 2.4),
    (0.05, 0.244, 0.188, 0.124, 0.062, 2.3, 2.3),
    (0.085, 0.244, 0.198, 0.142, 0.054, 2.2, 2.2),
    (0.105, 0.24, 0.21, 0.168, 0.04, 2.1, 2.1),
    (0.118, 0.235, 0.222, 0.2, 0.022, 2.0, 2.0),
]
UPPER = ([V(0, 0.38, 0.126), V(0, 0.389, 0.142), V(0, 0.3865, 0.157), V(0, 0.377, 0.1695), V(0, 0.3625, 0.178), V(0, 0.3465, 0.181),
          V(0, 0.3325, 0.1775), V(0, 0.3225, 0.1705)],
         [0.0232, 0.0212, 0.0178, 0.0138, 0.0098, 0.0064, 0.0038, 0.0016])
LOWER = ([V(0, 0.3615, 0.12), V(0, 0.3545, 0.141), V(0, 0.3505, 0.1555), V(0, 0.3525, 0.1645)], [0.0205, 0.017, 0.0122, 0.0062])
TOMIUM = [(0.125, 0.3665), (0.14, 0.3625), (0.152, 0.3595), (0.162, 0.3585), (0.17, 0.357)]


def _interp(tab, z):
    zz = np.array([k[0] for k in tab], F); yy = np.array([k[1] for k in tab], F)
    return np.interp(z, zz, yy).astype(F)


def _tom_y(z):
    return _interp(TOMIUM, z)


def trunk(P):
    Q = mirror(P)
    d = loft(Q, TRUNK)
    d = smin(d, ellipsoid(Q, V(0, 0.185, 0.058), V(0.057, 0.063, 0.058)), 0.025)
    d = smin(d, ellipsoid(Q, V(0.046, 0.222, -0.02), V(0.018, 0.024, 0.07)), 0.02)       # side pockets for the folded wings
    return d


def neck(P):
    Q = mirror(P)
    return chain(Q, [V(0, 0.232, 0.084), V(0, 0.288, 0.099), V(0, 0.338, 0.104)], [0.048, 0.039, 0.035], 0.012)


def head(P):
    Q = mirror(P)
    d = ellipsoid(Q, V(0, 0.3855, 0.0975), V(0.0322, 0.0365, 0.04))
    d = smin(d, ellipsoid(Q, V(0, 0.3925, 0.121), V(0.0255, 0.0262, 0.024)), 0.008)
    d = smin(d, ellipsoid(Q, V(0.0095, 0.3725, 0.11), V(0.0262, 0.028, 0.03)), 0.01)
    return d


def beak(P):
    """the big hooked upper mandible and the deep lower one (keel-like: narrow across)"""
    Q = mirror(P)
    S = V(1 / 0.78, 1, 1)
    up = chain(Q * S, [p * S for p in UPPER[0]], UPPER[1], 0.003) * 0.78
    S2 = V(1 / 0.86, 1, 1)
    lo = chain(Q * S2, [p * S2 for p in LOWER[0]], LOWER[1], 0.003) * 0.86
    y, z = Q[:, 1], Q[:, 2]
    yt = _tom_y(z)
    d = smin(up, lo, 0.002)
    d = d + groove(y - yt, 0.0005, 0.0009) * sstep(0.125, 0.135, z) * sstep(0.172, 0.165, z)
    # nostril in the cere at the top of the beak's base
    nd = length((Q - NOSTRIL) * V(1, 1.2, 1))
    d = d + 0.0008 * np.exp(-(nd / 0.0014) ** 2)
    return d


def eye_parts(P):
    Q = mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0, -0.0012), V(EYE_R + 0.0018, EYE_R + 0.0018, EYE_R + 0.0008))
    ap = np.sqrt(s * s + u * u) - LID_R
    carve = smax(ap, -(g + 0.001), 0.0006)
    ball = length(D) - EYE_R * 0.92
    return carve, lids, ball


def drum(P):
    Q = mirror(P)
    return round_cone(Q, V(0.034, 0.13, 0.008), V(0.038, 0.074, 0.006), 0.022, 0.009)


def tarsus(P):
    Q = mirror(P)
    j = round_cone(Q, V(0.038, 0.076, 0.004), HMETA + V(0, -0.002, 0.0), 0.0075, 0.0074)
    t = B.flat_cone(Q, HMETA + V(0, -0.002, 0.0), HPAW + V(0, 0.004, -0.001), 0.0072, 0.0068, 0.85, up=(1, 0, 0))
    pad = ellipsoid(Q, HPAW + V(0, -0.0004, 0.0), V(0.0085, 0.0058, 0.0085))
    return smin(smin(j, t, 0.005), pad, 0.004)


def feet(P):
    Q = mirror(P)
    tt, cl, _ = B.toes(Q, FOOT, TOES)
    return tt, cl


def arm(P):
    Q = mirror(P)
    return B.wing_arm(Q, [SH + V(-0.012, -0.004, -0.004), EL, WR, WT], [0.03, 0.028, 0.022, 0.008], [0.0085, 0.0072, 0.0058, 0.0025], lead=0.62)


def grid(h):
    lo, hi = BOUNDS
    xs = B.axis_steps(0.0, hi[0], [(0.0, 0.09, h * 0.7), (0.1, 0.34, h * 1.25)], h)
    ys = B.axis_steps(lo[1], hi[1], [(lo[1], 0.02, h * 0.3), (0.02, 0.08, h * 0.6), (0.232, 0.258, h * 0.4), (0.312, 0.43, h * 0.5)], h)
    zs = B.axis_steps(lo[2], hi[2], [(-0.04, 0.06, h * 0.6), (0.08, 0.2, h * 0.5)], h)
    return xs, ys, zs


HEAD_BOX = (V(-0.05, 0.31, 0.05), V(0.05, 0.43, 0.195))
NECK_BOX = (V(-0.06, 0.18, 0.03), V(0.06, 0.4, 0.15))
LEG_BOX = (V(-0.09, -0.002, -0.04), V(0.09, 0.16, 0.065))
ARM_BOX = (V(0.02, 0.225, 0.02), V(0.345, 0.265, 0.08))
EYE_BOX = (V(-0.045, 0.383, 0.1), V(0.045, 0.41, 0.132))


def parts(P):
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    ft, cl = local_n(P, *LEG_BOX, feet, 2)
    return {'trunk': trunk(P), 'neck': local(P, *NECK_BOX, neck), 'head': local(P, *HEAD_BOX, head), 'bill': local(P, *HEAD_BOX, beak),
            'lids': li, 'ball': ba, 'carve': ca, 'drum': local(P, *LEG_BOX, drum), 'tarsus': local(P, *LEG_BOX, tarsus), 'toes': ft, 'claws': cl,
            'arm': local(mirror(P), *ARM_BOX, arm)}


def shape(P):
    d = local(P, (-0.1, 0.09, -0.17), (0.1, 0.27, 0.13), trunk)
    d = smin(d, local(P, *NECK_BOX, neck), 0.02)
    h = local(P, *HEAD_BOX, head)
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    h = smin(h, li, 0.003)
    h = smax(h, -ca, 0.0008)
    h = smin(h, ba, 0.0004)
    h = smin(h, local(P, *HEAD_BOX, beak), 0.004)
    d = smin(d, h, 0.012)
    lg = smin(local(P, *LEG_BOX, drum), local(P, *LEG_BOX, tarsus), 0.006)
    ft, cl = local_n(P, *LEG_BOX, feet, 2)
    lg = smin(lg, smin(ft, cl, 0.0008), 0.004)
    d = smin(d, lg, 0.012)
    d = smin(d, local(mirror(P), *ARM_BOX, arm), 0.01)
    return d


# ---------- skinning ----------
WEIGHT_SMOOTH = (0, 0)
SPINE = ['tail', 'hips', 'neck', 'head']


def _spine_u(P):
    y, z = P[:, 1], P[:, 2]
    ut = 1.5 + np.clip((z + 0.115) / 0.04, -1, 0)
    un = np.interp(y, [0.2, 0.258, 0.35, 0.44], [1.5, 2.0, 3.0, 4.0]).astype(F)
    yn = y - 0.245 - 0.7 * np.maximum(0, 0.075 - z)
    k = sstep(0.0, 0.02, yn)
    return ut * (1 - k) + un * k


WCFG = dict(groups=[('body', ['trunk', 'neck']), ('head', ['head', 'bill', 'lids']), ('drum', ['drum']), ('tarsus', ['tarsus']), ('foot', ['toes', 'claws']),
                    ('arm', ['arm'])],
            bias={'body': 0.0015}, spine=SPINE, spine_u=_spine_u, head_u=3.35, knee=(0.088, 0.104), hipb=(0.1, 0.122, 0.75),
            ankle_d=(0.074, 0.064), ankle=(0.054, 0.068), pad=(0.016, 0.006), toe_up=(0.009, 0.018), arm=(SH, EL, WR, WT), arm_root=(0.072, 0.052))


def fix_weights(W, wpos, names, G, weld):
    return B.part_weights(W, wpos, names, parts(wpos.astype(F)), WCFG)


def bone_tips(P):
    t = {'hips': P['neck'], 'tail': TAILB + V(0, 0.0, -0.1), 'neck': P['head'], 'head': MOUTH}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, -0.004, 0.035)) * m
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
    k += 0.6 * R['drum'] + 0.72 * R['tarsus'] + 0.8 * (R['toes'] + R['claws']) + 0.2 * R['arm']
    rim = sstep(EYE_R + 0.004, EYE_R + 0.0012, de) * sstep(EYE_R * 0.9, EYE_R * 1.0, de) * 0.85
    return np.maximum(k, rim) * (1 - ball)


# ---------- plumage and skin paint ----------
K = {
    'red': hexc(0xB8101C), 'redHi': hexc(0xD42A2A), 'redDk': hexc(0x7E0A14), 'blue': hexc(0x2A6CC8), 'sky': hexc(0x58A6DC),
    'face': hexc(0xEEE8E2), 'faceLn': hexc(0xA82030), 'ivory': hexc(0xE8DCC6), 'horn': hexc(0xC8B898), 'black': hexc(0x1A1816),
    'foot': hexc(0x4A4440), 'footHi': hexc(0x6A625C), 'claw': hexc(0x2A2624), 'lid': hexc(0xD8D0C8),
}


def _flow(P, N, R):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    n = len(P)
    fl = np.zeros((n, 3), F)
    side = sat(-N[:, 1] * 0.6 + 0.2)
    fl[:, 1] = -0.25 - 0.55 * side
    fl[:, 2] = -1.0
    breast = sstep(0.04, 0.1, z) * sstep(0.22, 0.16, y)
    fl[:, 1] -= 1.6 * breast
    fl[:, 2] += 0.6 * breast
    nk = np.maximum(R['neck'], R['head'] + R['lids'])
    hd = sstep(0.35, 0.37, y) * nk
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
    s = np.full(len(P), 0.009, F)
    s = s + 0.004 * sstep(0.9, 0.3, np.abs(N[:, 1])) * sstep(-0.1, -0.05, P[:, 2]) * sstep(0.07, 0.02, P[:, 2])
    s = s - 0.002 * sstep(-0.3, -0.8, N[:, 1])
    nk = R['neck']
    s = s * (1 - nk) + nk * np.interp(y, [0.24, 0.3, 0.34], [0.008, 0.0055, 0.0042]).astype(F)
    hd = R['head'] + R['lids']
    s = s * (1 - hd) + hd * 0.0032
    s = s * (1 - R['drum']) + R['drum'] * 0.0045
    s = s * (1 - R['arm']) + R['arm'] * 0.006
    return s


def _fshape(P):
    n = len(P)
    return np.ones(n, F), np.ones(n, F) * 0.85, np.ones(n, F)


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
        pl = B.plumage(Pm, Nm, fl, sz, _fshape, seed=7)
        _pcache.clear()
        _pcache[key] = (R, Pm, Nm, fl, sz, feath, pl)
    return _pcache[key]


def _face(Pm, R):
    """the macaw's bare white face: from the beak back around the eye"""
    z, y = Pm[:, 2], Pm[:, 1]
    d = np.linalg.norm((Pm - V(0.026, 0.385, 0.124)) * V(0.6, 1.0, 0.85), axis=1)
    f = sstep(0.022, 0.017, d) * sstep(0.012, 0.02, Pm[:, 0]) * sstep(0.405, 0.398, y + 0.2 * np.maximum(0, z - 0.125))
    return f * np.clip(R['head'] + R['lids'], 0, 1)


def _face_lines(y, z):
    """thin rows of tiny red feathers across the bare face, broken into dots, only behind the beak"""
    rows = sstep(0.82, 0.97, np.sin((y + 0.25 * z) / 0.0011) * 0.5 + 0.5)
    dots = 0.45 + 0.55 * sstep(0.35, 0.75, np.sin((z - 0.3 * y) / 0.0006) * 0.5 + 0.5)
    return rows * dots * sstep(0.117, 0.126, z)


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n1 = fbm(Pm * 40, 3, 11)
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    col = mix(np.tile(K['red'], (len(P), 1)), K['redHi'], sstep(0.2, 0.9, Nm[:, 1]) * 0.3 + (fid - 0.5) * 0.15)
    col = mix(col, K['redDk'], sstep(-0.2, -0.8, Nm[:, 1]) * 0.3)
    col = mix(col, K['redDk'], sstep(0.45 * cfa, 1.2 * cfa, -pl['a']) * 0.25 * pl['cov'])
    # light blue rump and uppertail coverts, blue under the tail
    rump = sstep(-0.085, -0.115, z) * sstep(0.19, 0.205, y)
    col = mix(col, K['sky'], rump)
    col = mix(col, K['blue'], sstep(-0.1, -0.13, z) * sstep(0.19, 0.175, y))
    col *= (0.95 + 0.1 * n1)[:, None]
    # bare white face with lines of tiny red feathers
    face = _face(Pm, R)
    lines = _face_lines(y, z) * sstep(0.405, 0.385, y)
    fcol = mix(np.tile(K['face'], (len(P), 1)), K['faceLn'], lines * 0.6)
    col = mix(col, fcol, face)
    # beak: ivory upper mandible with a black base edge toward the gape, black lower mandible
    bl = R['bill']
    yt = _tom_y(z)
    # the hook in front of the lower mandible's tip is all upper mandible
    upper = np.maximum(sstep(yt - 0.001, yt + 0.002, y), sstep(0.17, 0.175, z))
    bcol = mix(np.tile(K['black'], (len(P), 1)), K['ivory'], upper)
    bcol = mix(bcol, K['black'], upper * sstep(0.139, 0.128, z) * sstep(yt + 0.012, yt + 0.004, y) * 0.9)
    bcol = mix(bcol, K['horn'], upper * sstep(0.15, 0.175, z) * 0.3)
    col = mix(col, bcol, bl)
    # feet dark gray, claws black
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    col = mix(col, mix(np.tile(K['foot'], (len(P), 1)), K['footHi'], sstep(0.4, 0.9, fbm(Pm * 300, 2, 34)) * 0.4), lg)
    col = mix(col, K['claw'], R['claws'])
    col = mix(col, K['lid'], R['lids'] * 0.85)
    rough = 0.65 + 0.06 * (n1 - 0.5) - 0.08 * sstep(0.1, 0.8, Nm[:, 1]) * feath
    rough = np.where(bl > 0.5, 0.38, rough)
    rough = np.where(lg > 0.5, 0.55, rough)
    rough = np.where(face > 0.5, 0.55, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _leg_h(P, c, R):
    Pm = mirror(P)
    h = np.zeros(len(P), F)
    rh, rg = B.reticulate(Pm, 0.0013, 42)
    h += np.clip(R['tarsus'] + R['toes'], 0, 1) * (0.00008 * rh - 0.00008 * rg)
    return h


def detail(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    h = np.zeros(len(P), F)
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    h += B.feather_height(pl, 0.04) * feath * (1 - 0.5 * hd)
    cf = pl['c']
    big = sstep(0.006, 0.012, cf) * pl['cov'] * feath
    bar = np.sin(2 * np.pi * (pl['a'] * 0.7 + np.abs(pl['b'])) / 0.0009)
    h -= 0.000012 * sstep(0.3, 1.0, bar) * big
    face = _face(Pm, R)
    f1, _ = worley(Pm / 0.0006, 62)
    h -= 0.00002 * sstep(0.3, 0.0, f1) * face
    h += 0.00002 * _face_lines(y, z) * face
    # beak: growth lines along the upper mandible
    h -= 0.000015 * sstep(0.5, 1.0, np.sin(np.hypot(y - 0.33, z - 0.13) / 0.0007)) * R['bill']
    h += _leg_h(P, c, R)
    return h


def finish(C, ao, valid):
    return B.finish_ao(C, ao, 0.3)


# ---------- the chick (baby maps): pink skin, sparse gray down, red pinfeathers coming ----------
KB = {'down': hexc(0x8E8682), 'skin': hexc(0xE0B4AC), 'pin': hexc(0xB03038), 'beak': hexc(0xE8DCCC), 'beakDk': hexc(0x8C8078), 'foot': hexc(0x9C8C88)}


def paint_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, fl, Nm, 0.0016, 74)
    col = mix(np.tile(KB['skin'], (len(P), 1)), KB['down'], sstep(0.2, 0.5, dn) * 0.9)
    col = mix(col, KB['pin'], sstep(0.5, 0.9, Nm[:, 1]) * np.clip(R['head'] + R['trunk'], 0, 1) * 0.35 * sstep(0.55, 0.8, fbm(Pm * 300, 2, 75)))
    bl = R['bill']
    col = mix(col, mix(np.tile(KB['beak'], (len(P), 1)), KB['beakDk'], sstep(_tom_y(Pm[:, 2]) + 0.001, _tom_y(Pm[:, 2]) - 0.002, Pm[:, 1]) * sstep(0.175, 0.17, Pm[:, 2])), bl)
    lg = np.clip(R['tarsus'] + R['toes'] + R['claws'], 0, 1)
    col = mix(col, KB['foot'], lg)
    rough = np.where(bl + lg > 0.5, 0.5, 0.85)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _baby_body(Q):
    d = ellipsoid(Q, V(0, 0.185, -0.01), V(0.064, 0.07, 0.1))
    return smin(d, round_cone(Q, V(0, 0.23, 0.07), V(0, 0.345, 0.1), 0.045, 0.034), 0.03)


def baby_offset(P, N, c):
    """per vertex: where the baby's surface lies relative to the adult's (adult space; see bird.baby_shape)"""
    return B.baby_shape(P, N, _own(c), _baby_body, (V(0.038, 0.06, 0.0), V(0.036, 0.14, 0.01), 0.008, 1.25), SH + V(-0.02, -0.012, -0.01), (0.0025, 0.004))


def detail_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, fl, Nm, 0.0016, 74)
    return 0.0002 * (dn - 0.5) * feath + _leg_h(P, c, R)


# the chick's thin gray down as fur shells (babyOnly: the adult keeps its feathers): shorter and sparser than a
# duckling's, the pink skin shows through
FUR = dict(len=0.034, n=5, lean=0.3, tile=0.0024, babyLen=1.0, babyLean=0.3, shade=0.88, babyOnly=True, quality=80)


def fur(P, N, c):
    return B.down_fur(P, c, FUR['len'], ['bill', 'tarsus', 'toes', 'claws', 'lids'],
                      {'head': 0.65, 'neck': 0.8, 'arm': 0.7, 'drum': 0.5}, (EYE_C, EYE_R), den=0.75, seed=74)


def flow(P, N):
    return B.down_flow(sys.modules[__name__], P, N)


# ---------- feather blades (atlas cells, same order as the game's feather cells) ----------
def _vn(s, t, base, edge, k=0.5):
    return mix(np.tile(base, (len(s), 1)), edge, sstep(0.55, 1.0, np.abs(s)) * k)


def _cells():
    F_ = B.FeatherCell
    red, redDk, yel, grn, blu, bluDk, sky = hexc(0xB8101C), hexc(0x8C0A1C), hexc(0xF0BE2A), hexc(0x4C9038), hexc(0x2160C0), hexc(0x183F88), hexc(0x58A6DC)

    def prim(s, t, side):
        c = mix(np.tile(blu, (len(s), 1)), bluDk, sstep(0.1, -0.4, s) * 0.7)
        return mix(c, bluDk, sstep(0.6, 1.0, t) * 0.35)

    def sec(s, t, side):
        return mix(_vn(s, t, blu, bluDk, 0.5), bluDk, sstep(0.0, -0.5, s) * 0.5)

    def gcov(s, t, side):
        c = mix(np.tile(yel, (len(s), 1)), hexc(0xD9A21E), sstep(0.6, 1.0, np.abs(s)) * 0.5)
        c = mix(c, grn, sstep(0.45, 0.8, t))
        return mix(c, blu, sstep(0.88, 1.0, t) * 0.6)

    def lcov(s, t, side):
        return mix(_vn(s, t, red, redDk, 0.4), hexc(0xD8401E), sstep(0.7, 1.0, t) * 0.3)

    def tail(s, t, side):
        c = _vn(s, t, red, redDk, 0.4)
        return mix(c, blu, sstep(0.68, 0.86, t))

    def touter(s, t, side):
        c = _vn(s, t, blu, bluDk, 0.5)
        return mix(c, red, sstep(0.35, 0.0, t) * 0.7)

    def tcov(s, t, side):
        return _vn(s, t, sky, blu, 0.5)

    def med(s, t, side):
        c = _vn(s, t, red, redDk, 0.4)
        return mix(c, yel, sstep(0.45, 0.8, t))

    return [F_('flight', prim, w=0.62, outer=0.5, tip=0.35, shaft=hexc(0x1A2848)),
            F_('round', sec, w=0.72, outer=0.8, tip=0.45, shaft=hexc(0x1A2848)),
            F_('round', gcov, w=0.8, outer=0.85, tip=0.8, shaft=hexc(0x8A7020)),
            F_('round', lcov, w=0.8, outer=0.9, tip=1.2, shaft=hexc(0x6A0A12)),
            F_('flight', tail, w=0.6, outer=0.9, tip=0.5, shaft=hexc(0x6A0A12)),
            F_('flight', touter, w=0.6, outer=0.9, tip=0.5, shaft=hexc(0x1A2848)),
            F_('round', tcov, w=0.72, outer=0.9, tip=0.8, shaft=hexc(0x2A5A90)),
            F_('round', med, w=0.8, outer=0.9, tip=0.9, shaft=hexc(0x6A0A12))]


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = hexc(0xB8ACA8), hexc(0x9A8E8A)
    def dn(s, t, side):
        return mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 8


FEATHER_ATLAS = {'size': (1024, 512), 'out': (512, 256), 'cells': _cells, 'baby': _baby_cells, 'quality': (72, 80, 72),
                 'alpha_quality': 50}


def extra_maps(X):
    B.extra_maps(sys.modules[__name__], X)


def export_extra(meta, out_dir, work):
    B.export_extra(sys.modules[__name__], meta, out_dir, work)


MAP_QUALITY = (75, 70)
BABY_MAPS = {'size': 512, 'quality': (74, 72)}


def stats(P, N, c, col):
    return {'lidCol': 0xD8D0C8}


def meta(st):
    r = EYE_R
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [0.8, -0.8, 0.12],
                'iris': 0xE6D8A2, 'irisR': 0.86, 'pupilR': 0.34, 'rim': 0x6A5A30, 'lidCol': st['lidCol'], 'babyIris': 0x1E140E, 'babyLidCol': 0xC8A8A0},
        'collar': {'at': ['neck', 'head', 0.35], 'babyAt': 0.4, 'hug': True, 'babyK': 1.8, 'lift': 0.35},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.14, 0.06, 0.06], 'flat': 0xB82020,
    }
