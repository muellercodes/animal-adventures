# Cockatiel (the classic gray), sculpted as a signed distance field around the game's cockatiel skeleton (bird.py has
# the shared bird parts). The game's cockatiel is the macaw's bird body at KS = 0.42 of its size (SPEC.cockatiel), so
# the shape here is made in the macaw's units (the m_ functions, numbers as in parrot.py) and every function the
# pipeline calls scales in and out of them. A cockatiel's own: a smaller, rounder head, a small stubby beak, a slimmer
# body, gray plumage with a yellow face and crown and a round orange cheek patch; the crest, the white wing patch and
# the long pointed tail are the game's feather blades (this file paints their atlas). The chick: pink skin with
# scruffy pale yellow down, a big beak.
# Make it with: VOXEL=0.0009 TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py cockatiel
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, loft, frame, fbm, vnoise, worley, length
import bird as B
from bird import local, local_n, mirror, groove, hexc, mix

ID = 'cockatiel'
KS = 0.42                     # game size / macaw units
_M = sys.modules[__name__]

# ---------- landmarks (macaw units) ----------
SH, EL, WR, WT = V(0.058, 0.245, 0.05), V(0.1364, 0.245, 0.05), V(0.2344, 0.245, 0.05), V(0.3079, 0.245, 0.05)
HMETA, HPAW = V(0.038, 0.06, 0.0), V(0.038, 0.006, 0.012)
TAILB = V(0, 0.2, -0.12)
EYE_C = V(0.0322, 0.3985, 0.1155)
EYE_R = 0.0066
EYE_DIR = nrm([0.94, 0.12, 0.32])
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_R = 0.0054
# the beak: the macaw's, scaled down about its base
BEAK_B, BEAK_S = V(0.0, 0.385, 0.128), 0.55
MOUTH = BEAK_B + (V(0.0, 0.343, 0.177) - BEAK_B) * BEAK_S
FOOT = HPAW
TOES = [dict(a=-22, len=0.034, r=0.0056, r1=0.0034, claw=0.011, clawDrop=0.2, n=3), dict(a=16, len=0.037, r=0.0058, r1=0.0035, claw=0.012, clawDrop=0.2, n=3),
        dict(a=150, len=0.03, r=0.0054, r1=0.0033, claw=0.011, clawDrop=0.2, n=3), dict(a=-165, len=0.027, r=0.0053, r1=0.0032, claw=0.01, clawDrop=0.2, n=2)]

TRUNK = [
    (-0.15, 0.214, 0.205, 0.196, 0.011, 2.0, 2.0),
    (-0.13, 0.222, 0.2, 0.18, 0.027, 2.1, 2.0),
    (-0.1, 0.23, 0.192, 0.154, 0.044, 2.2, 2.1),
    (-0.05, 0.238, 0.184, 0.13, 0.056, 2.3, 2.3),
    (0.0, 0.242, 0.182, 0.12, 0.06, 2.3, 2.4),
    (0.05, 0.244, 0.188, 0.126, 0.058, 2.3, 2.3),
    (0.085, 0.244, 0.198, 0.144, 0.05, 2.2, 2.2),
    (0.105, 0.24, 0.21, 0.17, 0.037, 2.1, 2.1),
    (0.118, 0.235, 0.222, 0.2, 0.02, 2.0, 2.0),
]
UPPER = ([V(0, 0.38, 0.126), V(0, 0.389, 0.142), V(0, 0.3865, 0.157), V(0, 0.377, 0.1695), V(0, 0.3625, 0.178), V(0, 0.3465, 0.181),
          V(0, 0.3325, 0.1775), V(0, 0.3225, 0.1705)],
         [0.0232, 0.0212, 0.0178, 0.0138, 0.0098, 0.0064, 0.0038, 0.0016])
LOWER = ([V(0, 0.3615, 0.12), V(0, 0.3545, 0.141), V(0, 0.3505, 0.1555), V(0, 0.3525, 0.1645)], [0.0205, 0.017, 0.0122, 0.0062])
TOMIUM = [(0.125, 0.3665), (0.14, 0.3625), (0.152, 0.3595), (0.162, 0.3585), (0.17, 0.357)]


def _bk(p):
    return BEAK_B + (p - BEAK_B) * BEAK_S


def _tom_y(z):
    """the cutting edge of the upper mandible (macaw units, z along the scaled beak)"""
    zz = np.array([BEAK_B[2] + (k[0] - BEAK_B[2]) * BEAK_S for k in TOMIUM], F)
    yy = np.array([BEAK_B[1] + (k[1] - BEAK_B[1]) * BEAK_S for k in TOMIUM], F)
    return np.interp(z, zz, yy).astype(F)


# ---------- the shape (macaw units) ----------
def m_trunk(Q):
    d = loft(Q, TRUNK)
    d = smin(d, ellipsoid(Q, V(0, 0.186, 0.058), V(0.053, 0.06, 0.056)), 0.025)
    d = smin(d, ellipsoid(Q, V(0.044, 0.222, -0.02), V(0.017, 0.023, 0.07)), 0.02)
    return d


def m_neck(Q):
    return chain(Q, [V(0, 0.232, 0.084), V(0, 0.288, 0.099), V(0, 0.338, 0.104)], [0.05, 0.043, 0.039], 0.016)


def m_head(Q):
    """a round head with a high, rounded forehead and full cheeks"""
    d = ellipsoid(Q, V(0, 0.388, 0.099), V(0.0335, 0.0375, 0.0395))
    d = smin(d, ellipsoid(Q, V(0, 0.4, 0.118), V(0.026, 0.028, 0.022)), 0.01)
    d = smin(d, ellipsoid(Q, V(0.011, 0.374, 0.108), V(0.026, 0.026, 0.028)), 0.01)
    # a low ridge where the crest rises from the crown (the crest itself is the game's feather blades)
    d = smin(d, ellipsoid(Q, V(0, 0.42, 0.104), V(0.012, 0.012, 0.03)), 0.012)
    return d


def m_beak(Q):
    """the macaw's hooked beak, small and stubby"""
    s = BEAK_S
    S = V(1 / 0.82, 1, 1)
    up = chain(Q * S, [_bk(p) * S for p in UPPER[0]], [r * s for r in UPPER[1]], 0.002) * 0.82
    S2 = V(1 / 0.9, 1, 1)
    lo = chain(Q * S2, [_bk(p) * S2 for p in LOWER[0]], [r * s for r in LOWER[1]], 0.002) * 0.9
    y, z = Q[:, 1], Q[:, 2]
    yt = _tom_y(z)
    d = smin(up, lo, 0.0015)
    d = d + groove(y - yt, 0.0004, 0.0007) * sstep(0.127, 0.131, z) * sstep(0.153, 0.149, z)
    return d


def m_eye_parts(Q):
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0, -0.0012), V(EYE_R + 0.0018, EYE_R + 0.0018, EYE_R + 0.0008))
    ap = np.sqrt(s * s + u * u) - LID_R
    carve = smax(ap, -(g + 0.001), 0.0006)
    ball = length(D) - EYE_R * 0.92
    return carve, lids, ball


def m_drum(Q):
    return round_cone(Q, V(0.034, 0.13, 0.008), V(0.038, 0.074, 0.006), 0.021, 0.009)


def m_tarsus(Q):
    j = round_cone(Q, V(0.038, 0.076, 0.004), HMETA + V(0, -0.002, 0.0), 0.0072, 0.007)
    t = B.flat_cone(Q, HMETA + V(0, -0.002, 0.0), HPAW + V(0, 0.004, -0.001), 0.0068, 0.0064, 0.85, up=(1, 0, 0))
    pad = ellipsoid(Q, HPAW + V(0, -0.0004, 0.0), V(0.0082, 0.0056, 0.0082))
    return smin(smin(j, t, 0.005), pad, 0.004)


def m_feet(Q):
    tt, cl, _ = B.toes(Q, FOOT, TOES)
    return tt, cl


def m_arm(Q):
    return B.wing_arm(Q, [SH + V(-0.012, -0.004, -0.004), EL, WR, WT], [0.028, 0.026, 0.02, 0.008], [0.0082, 0.007, 0.0056, 0.0025], lead=0.62)


HEAD_BOX = (V(-0.05, 0.31, 0.05), V(0.05, 0.44, 0.165))
NECK_BOX = (V(-0.06, 0.18, 0.03), V(0.06, 0.4, 0.15))
LEG_BOX = (V(-0.09, -0.002, -0.04), V(0.09, 0.16, 0.065))
ARM_BOX = (V(0.02, 0.225, 0.02), V(0.345, 0.265, 0.08))
EYE_BOX = (V(-0.045, 0.383, 0.1), V(0.045, 0.41, 0.132))


def m_parts(P):
    Q = mirror(P)
    ca, li, ba = local_n(Q, *EYE_BOX, m_eye_parts, 3)
    ft, cl = local_n(Q, *LEG_BOX, m_feet, 2)
    return {'trunk': m_trunk(Q), 'neck': local(Q, *NECK_BOX, m_neck), 'head': local(Q, *HEAD_BOX, m_head), 'bill': local(Q, *HEAD_BOX, m_beak),
            'lids': li, 'ball': ba, 'carve': ca, 'drum': local(Q, *LEG_BOX, m_drum), 'tarsus': local(Q, *LEG_BOX, m_tarsus), 'toes': ft, 'claws': cl,
            'arm': local(Q, *ARM_BOX, m_arm)}


def m_shape(P):
    Q = mirror(P)
    d = local(Q, (-0.1, 0.09, -0.17), (0.1, 0.27, 0.13), m_trunk)
    d = smin(d, local(Q, *NECK_BOX, m_neck), 0.02)
    h = local(Q, *HEAD_BOX, m_head)
    ca, li, ba = local_n(Q, *EYE_BOX, m_eye_parts, 3)
    h = smin(h, li, 0.003)
    h = smax(h, -ca, 0.0008)
    h = smin(h, ba, 0.0004)
    h = smin(h, local(Q, *HEAD_BOX, m_beak), 0.003)
    d = smin(d, h, 0.012)
    lg = smin(local(Q, *LEG_BOX, m_drum), local(Q, *LEG_BOX, m_tarsus), 0.006)
    ft, cl = local_n(Q, *LEG_BOX, m_feet, 2)
    lg = smin(lg, smin(ft, cl, 0.0008), 0.004)
    d = smin(d, lg, 0.012)
    d = smin(d, local(Q, *ARM_BOX, m_arm), 0.01)
    return d


# ---------- the pipeline's view (game meters) ----------
BOUNDS = (V(-0.33, -0.001, -0.17) * KS, V(0.33, 0.45, 0.2) * KS)
PATCHES = [
    (V(0.0, 0.31, 0.08) * KS, V(0.045, 0.44, 0.165) * KS, 0.0003),      # beak, face, eye
    (V(0.0, -0.001, -0.04) * KS, V(0.09, 0.02, 0.06) * KS, 0.0003),     # foot
]
BAKE_DIST = (0.002, 0.006, 0.02)
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
UV_PACK = dict(shape_method='CONCAVE', rotate_method='ANY')


def shape(P):
    return m_shape(P / KS) * KS


def parts(P):
    return {k: v * KS for k, v in m_parts(P / KS).items()}


def grid(h):
    hm = h / KS
    lo, hi = V(-0.33, -0.001, -0.17), V(0.33, 0.45, 0.2)
    xs = B.axis_steps(0.0, hi[0], [(0.0, 0.09, hm * 0.7), (0.1, 0.34, hm * 1.25)], hm)
    ys = B.axis_steps(lo[1], hi[1], [(lo[1], 0.02, hm * 0.3), (0.02, 0.08, hm * 0.6), (0.232, 0.258, hm * 0.4), (0.312, 0.44, hm * 0.5)], hm)
    zs = B.axis_steps(lo[2], hi[2], [(-0.04, 0.06, hm * 0.6), (0.08, 0.17, hm * 0.5)], hm)
    return xs * KS, ys * KS, zs * KS


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
    Pm = (wpos / KS).astype(F)
    W = B.part_weights(W, Pm, names, m_parts(Pm), WCFG)
    # anything well out along the arm rides the wing bones (a few tip vertices fell to the body otherwise)
    bi = {n: i for i, n in enumerate(names)}
    x = np.abs(Pm[:, 0])
    far = (x > SH[0] + 0.05) & (Pm[:, 1] > 0.18)
    if far.any():
        ua = np.interp(x[far], [SH[0], EL[0], WR[0], WT[0] + 0.05], [0.0, 1.0, 2.0, 3.0]).astype(F)
        Wf = np.zeros((far.sum(), W.shape[1]), F)
        side = np.where(Pm[far, 0] >= 0, 'L', 'R')
        for nm, w in B.blend_chain(ua, ['wing', 'wfore', 'whand'], 0.12):
            for s in 'LR':
                m = side == s
                Wf[m, bi[nm + s]] += w[m]
        W[far] = Wf / np.maximum(Wf.sum(1, keepdims=True), 1e-9)
    return W


def bone_tips(P):
    t = {'hips': P['neck'], 'tail': (TAILB + V(0, 0.0, -0.1)) * KS, 'neck': P['head'], 'head': MOUTH * KS, 'crest': P['crest'] + V(0, 0.03, -0.01)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, -0.004, 0.035)) * KS * m
        t['wing' + s] = P['wfore' + s]; t['wfore' + s] = P['whand' + s]; t['whand' + s] = WT * KS * m
    return t


OWN_KEYS = ['trunk', 'neck', 'head', 'bill', 'drum', 'tarsus', 'toes', 'claws', 'arm', 'lids']


def _own(c):
    D = np.stack([c[k] for k in OWN_KEYS], 1)
    o = np.argmin(D, 1)
    return {k: (o == i).astype(F) for i, k in enumerate(OWN_KEYS)}


def keep(P):
    Pm = mirror(P / KS)
    R = _own(m_parts(P / KS))
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    ball = sstep(EYE_R * 0.97, EYE_R * 0.8, de)
    k = 0.45 * R['trunk'] + 0.55 * R['neck'] + 0.78 * R['head'] + 0.83 * R['bill'] + 0.85 * R['lids']
    k += 0.6 * R['drum'] + 0.72 * R['tarsus'] + 0.8 * (R['toes'] + R['claws']) + 0.2 * R['arm']
    rim = sstep(EYE_R + 0.004, EYE_R + 0.0012, de) * sstep(EYE_R * 0.9, EYE_R * 1.0, de) * 0.85
    return np.maximum(k, rim) * (1 - ball)


# ---------- plumage and skin paint ----------
K = {
    'gray': hexc(0x8C8B88), 'grayHi': hexc(0xA4A29E), 'grayDk': hexc(0x63625F), 'breast': hexc(0x9E9C98),
    'yellow': hexc(0xF2D350), 'yellowDk': hexc(0xDDB83A), 'orange': hexc(0xE36C26), 'beak': hexc(0x9C918C), 'beakDk': hexc(0x6E6460),
    'foot': hexc(0xA8928C), 'footHi': hexc(0xC0ACA6), 'claw': hexc(0x4A4240), 'lid': hexc(0x8C8682),
}


def m_flow(P, N, R):
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


def _flow(Pm, Nm, R):
    return m_flow(Pm / KS, Nm, R)


def _size(P, N, R):
    y = P[:, 1]
    s = np.full(len(P), 0.0085, F)
    s = s + 0.004 * sstep(0.9, 0.3, np.abs(N[:, 1])) * sstep(-0.1, -0.05, P[:, 2]) * sstep(0.07, 0.02, P[:, 2])
    s = s - 0.002 * sstep(-0.3, -0.8, N[:, 1])
    nk = R['neck']
    s = s * (1 - nk) + nk * np.interp(y, [0.24, 0.3, 0.34], [0.0075, 0.0055, 0.0045]).astype(F)
    hd = R['head'] + R['lids']
    s = s * (1 - hd) + hd * 0.0036
    s = s * (1 - R['drum']) + R['drum'] * 0.0045
    s = s * (1 - R['arm']) + R['arm'] * 0.006
    return s


def _fshape(P):
    n = len(P)
    return np.ones(n, F), np.ones(n, F) * 0.85, np.ones(n, F)


_pcache = {}


def _plum(P, N, c):
    """the plumage pattern, in macaw units: P are game points, c the parts at them (either units)"""
    key = (len(P), float(P[:7].sum()))
    if key not in _pcache:
        R = _own(c)
        Pm = mirror(P / KS)
        Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
        fl = m_flow(Pm, Nm, R)
        sz = _size(Pm, Nm, R)
        feath = np.clip(R['trunk'] + R['neck'] + R['head'] + R['drum'] + R['arm'], 0, 1)
        pl = B.plumage(Pm, Nm, fl, sz, _fshape, seed=9)
        _pcache.clear()
        _pcache[key] = (R, Pm, Nm, fl, sz, feath, pl)
    return _pcache[key]


def _masks(Pm, Nm, R):
    """the yellow face and crown, the orange cheek patch (macaw units, mirrored points)"""
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    hd = np.clip(R['head'] + R['lids'] + R['neck'] * sstep(0.33, 0.36, y), 0, 1)
    w = fbm(Pm * 90, 2, 21) - 0.5
    # the yellow: the face, the forehead and crown, the throat; the nape and the back of the head gray
    yel = sstep(0.084, 0.1, z + 0.5 * (y - 0.39) + 0.006 * w) * sstep(0.33, 0.35, y)
    yel = np.maximum(yel, sstep(0.4, 0.415, y) * sstep(0.084, 0.098, z))
    yel = yel * hd
    d = np.linalg.norm((Pm - V(0.031, 0.375, 0.105)) * V(0.9, 1.0, 1.0), axis=1)
    cheek = sstep(0.0135, 0.0105, d + 0.0008 * w) * sstep(0.014, 0.022, x) * hd
    return yel, cheek


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n1 = fbm(Pm * 40, 3, 11)
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    col = mix(np.tile(K['gray'], (len(P), 1)), K['grayHi'], sstep(0.2, 0.9, Nm[:, 1]) * 0.25 + (fid - 0.5) * 0.12)
    col = mix(col, K['breast'], sstep(0.0, -0.6, Nm[:, 1]) * sstep(0.0, 0.06, z) * 0.6)
    col = mix(col, K['grayDk'], sstep(-0.2, -0.8, Nm[:, 1]) * sstep(0.0, -0.06, z) * 0.35)
    col = mix(col, K['grayDk'], sstep(0.45 * cfa, 1.2 * cfa, -pl['a']) * 0.22 * pl['cov'])
    # darker under the tail
    col = mix(col, K['grayDk'], sstep(-0.1, -0.13, z) * sstep(0.2, 0.18, y) * 0.6)
    col *= (0.95 + 0.1 * n1)[:, None]
    yel, cheek = _masks(Pm, Nm, R)
    ycol = mix(np.tile(K['yellow'], (len(P), 1)), K['yellowDk'], sstep(-0.2, -0.7, Nm[:, 1]) * 0.4 + (fid - 0.5) * 0.15)
    col = mix(col, ycol, yel)
    col = mix(col, K['orange'], cheek)
    # beak: gray horn, darker at the gape and the tip of the hook
    bl = R['bill']
    bcol = mix(np.tile(K['beak'], (len(P), 1)), K['beakDk'], sstep(0.136, 0.124, z) * 0.5 + sstep(0.15, 0.156, z) * 0.3)
    col = mix(col, bcol, bl)
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    col = mix(col, mix(np.tile(K['foot'], (len(P), 1)), K['footHi'], sstep(0.4, 0.9, fbm(Pm * 300, 2, 34)) * 0.4), lg)
    col = mix(col, K['claw'], R['claws'])
    col = mix(col, K['lid'], R['lids'] * 0.85)
    rough = 0.7 + 0.06 * (n1 - 0.5) - 0.08 * sstep(0.1, 0.8, Nm[:, 1]) * feath
    rough = np.where(bl > 0.5, 0.42, rough)
    rough = np.where(lg > 0.5, 0.6, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _leg_h(Pm, R):
    h = np.zeros(len(Pm), F)
    rh, rg = B.reticulate(Pm, 0.0013, 42)
    h += np.clip(R['tarsus'] + R['toes'], 0, 1) * (0.00008 * rh - 0.00008 * rg)
    return h


def detail(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    y, z = Pm[:, 1], Pm[:, 2]
    h = np.zeros(len(P), F)
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    h += B.feather_height(pl, 0.04) * feath * (1 - 0.5 * hd)
    h -= 0.000012 * sstep(0.5, 1.0, np.sin(np.hypot(y - 0.35, z - 0.13) / 0.0006)) * R['bill']
    h += _leg_h(Pm, R)
    return h * KS


def finish(C, ao, valid):
    return B.finish_ao(C, ao, 0.3)


# ---------- the chick (baby maps): pink skin with scruffy pale yellow down ----------
KB = {'down': hexc(0xEDD27A), 'downLt': hexc(0xF5E4A6), 'skin': hexc(0xE9A99A), 'beak': hexc(0xD6C2BA), 'beakDk': hexc(0xA89490), 'foot': hexc(0xD2ACA4)}


def paint_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, fl, Nm, 0.0016, 76)
    # down in tufts with the pink skin between them (thinnest on the head and the neck)
    tufts = sstep(0.42, 0.62, fbm(Pm * 160, 2, 77))
    cover = np.clip(sstep(0.2, 0.5, dn) * (0.42 + 0.58 * tufts) - 0.35 * np.clip(R['head'] + R['neck'], 0, 1) * (1 - tufts), 0, 1)
    col = mix(np.tile(KB['skin'], (len(P), 1)), mix(np.tile(KB['down'], (len(P), 1)), KB['downLt'], tip * 0.6), cover)
    bl = R['bill']
    col = mix(col, mix(np.tile(KB['beak'], (len(P), 1)), KB['beakDk'], sstep(0.15, 0.156, Pm[:, 2]) * 0.6), bl)
    lg = np.clip(R['tarsus'] + R['toes'] + R['claws'], 0, 1)
    col = mix(col, KB['foot'], lg)
    rough = np.where(bl + lg > 0.5, 0.5, 0.85)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, fl, Nm, 0.0016, 76)
    return (0.0002 * (dn - 0.5) * feath + _leg_h(Pm, R)) * KS


def _baby_body(Q):
    d = ellipsoid(Q, V(0, 0.185, -0.01), V(0.064, 0.07, 0.1))
    return smin(d, round_cone(Q, V(0, 0.23, 0.07), V(0, 0.345, 0.1), 0.045, 0.034), 0.03)


def baby_offset(P, N, c):
    """per vertex: where the chick's surface lies relative to the adult's (adult space; see bird.baby_shape)"""
    Pm = (P / KS).astype(F)
    d = B.baby_shape(Pm, N, _own(c), _baby_body, (V(0.038, 0.06, 0.0), V(0.036, 0.14, 0.01), 0.008, 1.25), SH + V(-0.02, -0.012, -0.01), (0.003, 0.004))
    return (d * KS).astype(F)


# the chick's down as fur shells (babyOnly: the adult keeps its feathers): scruffy, sparse, the pink skin shows
FUR = dict(len=0.013, n=5, lean=0.3, tile=0.0012, babyLen=1.0, babyLean=0.3, shade=0.88, babyOnly=True, quality=80)


def fur(P, N, c):
    cm = {k: v / KS for k, v in c.items()}
    flen, fden = B.down_fur(P / KS, cm, FUR['len'] / KS, ['bill', 'tarsus', 'toes', 'claws', 'lids'],
                            {'head': 0.6, 'neck': 0.7, 'arm': 0.7, 'drum': 0.5}, (EYE_C, EYE_R), den=0.7, seed=76)
    return (flen * KS).astype(F), fden


def flow(P, N):
    return B.down_flow(_M, P, N)


# ---------- feather blades (atlas cells, in the order of the game's feather cells) ----------
def _vn(s, t, base, edge, k=0.5):
    return mix(np.tile(base, (len(s), 1)), edge, sstep(0.55, 1.0, np.abs(s)) * k)


def _cells():
    F_ = B.FeatherCell
    g, gd, gdd, wh, whd, yel, yeld = hexc(0x8C8B88), hexc(0x62615E), hexc(0x4A4946), hexc(0xF2F0EA), hexc(0xD6D3CC), hexc(0xF2D350), hexc(0xD8B232)

    def prim(s, t, side):
        c = mix(np.tile(gd, (len(s), 1)), gdd, sstep(0.1, -0.4, s) * 0.6)
        return mix(c, gdd, sstep(0.6, 1.0, t) * 0.3)

    def sec(s, t, side):
        return mix(_vn(s, t, g, gd, 0.5), gd, sstep(0.0, -0.5, s) * 0.4)

    def white(s, t, side):
        return mix(_vn(s, t, wh, whd, 0.4), g, sstep(0.25, 0.0, t) * 0.5)

    def cov(s, t, side):
        return _vn(s, t, g, gd, 0.4)

    def tail(s, t, side):
        return mix(_vn(s, t, gd, gdd, 0.4), gdd, sstep(0.5, 1.0, t) * 0.4)

    def touter(s, t, side):
        return mix(_vn(s, t, g, gd, 0.5), gd, sstep(0.6, 1.0, t) * 0.4)

    def crest(s, t, side):
        c = _vn(s, t, yel, yeld, 0.4)
        tipc = np.tile(g * 0.7 + yel * 0.3, (len(s), 1))
        return mix(c, tipc, sstep(0.55, 0.95, t) * 0.7)

    return [F_('flight', prim, w=0.55, outer=0.45, tip=0.25, shaft=hexc(0x2E2D2B)),
            F_('round', sec, w=0.72, outer=0.8, tip=0.45, shaft=hexc(0x3A3936)),
            F_('round', white, w=0.8, outer=0.85, tip=0.8, shaft=hexc(0xC8C6C0)),
            F_('round', cov, w=0.8, outer=0.9, tip=1.0, shaft=hexc(0x4A4946)),
            F_('flight', tail, w=0.5, outer=0.9, tip=0.25, shaft=hexc(0x2E2D2B)),
            F_('flight', touter, w=0.55, outer=0.9, tip=0.3, shaft=hexc(0x3A3936)),
            F_('flight', crest, w=0.42, outer=0.9, tip=0.3, shaft=hexc(0xC8A830)),
            F_('round', white, w=0.8, outer=0.9, tip=0.9, shaft=hexc(0xC8C6C0))]


def _baby_cells():
    F_ = B.FeatherCell
    y1, y2 = hexc(0xF2E2A8), hexc(0xE0CC88)

    def dn(s, t, side):
        return mix(np.tile(y1, (len(s), 1)), y2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 8


FEATHER_ATLAS = {'size': (1024, 512), 'out': (512, 256), 'cells': _cells, 'baby': _baby_cells, 'quality': (72, 80, 72),
                 'alpha_quality': 50}


def extra_maps(X):
    B.extra_maps(_M, X)


def export_extra(meta, out_dir, work):
    B.export_extra(_M, meta, out_dir, work)


MAP_QUALITY = (74, 70)
BABY_MAPS = {'size': 512, 'quality': (74, 72)}


def stats(P, N, c, col):
    return {'lidCol': 0x8C8682}


def meta(st):
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C * KS], 'r': round(EYE_R * KS, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [0.8, -0.8, 0.12],
                'iris': 0x2A1A10, 'irisR': 0.92, 'pupilR': 0.55, 'rim': 0x3A2A20, 'lidCol': st['lidCol'], 'babyIris': 0x1A120C, 'babyLidCol': 0xD8B0A4},
        'collar': {'at': ['neck', 'head', 0.35], 'babyAt': 0.4, 'hug': True, 'babyK': 1.8, 'lift': 0.35},
        'mouth': [round(float(v), 4) for v in MOUTH * KS],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.1, 0.1, 0.1], 'flat': 0x8C8B88,
    }


PREVIEW = {
    'side': ((1.1, 0.21, 0.03), (0, 0.16, 0.03), 30),
    'front3q': ((0.63, 0.32, 0.74), (0, 0.16, 0.04), 30),
    'face': ((0.18, 0.25, 0.52), (0, 0.16, 0.25), 22),
    'rear3q': ((-0.6, 0.38, -0.76), (0, 0.16, -0.04), 30),
    'head3q': ((0.14, 0.2, 0.26), (0, 0.162, 0.048), 26),
}
