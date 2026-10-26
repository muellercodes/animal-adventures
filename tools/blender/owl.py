# Great horned owl, upright, sculpted as a signed distance field around the game's owl skeleton (bird.py has the
# shared bird parts). Units are meters in game rig space (x left, y up, z forward, ground at y = 0). Made in the
# rig's bind pose: the wing arm sticks out flat to the side under the game's feather blades.
# Make it with: TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py owl
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, loft, frame, fbm, vnoise, worley, length
import bird as B
from bird import local, local_n, mirror, groove, hexc, mix

ID = 'owl'
BOUNDS = (V(-0.43, -0.001, -0.13), V(0.43, 0.58, 0.12))
PATCHES = [
    (V(0.0, 0.41, 0.02), V(0.06, 0.5, 0.09), 0.0007),           # eyes, beak, facial disc
    (V(0.0, -0.001, -0.03), V(0.1, 0.03, 0.075), 0.0007),       # talons
]
BAKE_DIST = (0.006, 0.016, 0.05)
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
UV_PACK = dict(shape_method='CONCAVE', rotate_method='ANY')

HIPS, TAILB, NECK, HEAD, EAR = V(0, 0.18, 0), V(0, 0.13, -0.075), V(0, 0.37, 0), V(0, 0.42, 0.005), V(0.04, 0.505, 0.008)
THIGH, SHIN, HMETA, HPAW = V(0.04, 0.14, 0.005), V(0.05, 0.095, 0.035), V(0.05, 0.065, 0.005), V(0.05, 0.009, 0.02)
SH, EL, WR, WT = V(0.07, 0.35, -0.035), V(0.17, 0.35, -0.035), V(0.295, 0.35, -0.035), V(0.3888, 0.35, -0.035)
EYE_C = V(0.0315, 0.464, 0.0505)
EYE_R = 0.0145
EYE_DIR = nrm([0.24, 0.03, 1])
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_R = 0.0122
MOUTH = V(0.0, 0.4325, 0.0695)
FOOT = HPAW + V(0, 0.0, 0.0)
TOES = [dict(a=-22, len=0.03, r=0.0085, r1=0.0062, claw=0.022, clawR=0.0042, clawDrop=0.22, n=2), dict(a=18, len=0.033, r=0.0088, r1=0.0064, claw=0.023, clawR=0.0044, clawDrop=0.22, n=2),
        dict(a=162, len=0.022, r=0.0082, r1=0.006, claw=0.02, clawR=0.004, clawDrop=0.22, n=2), dict(a=-150, len=0.021, r=0.008, r1=0.006, claw=0.019, clawR=0.004, clawDrop=0.22, n=2)]

# upright body, a loft along y: y, front (z), z of the widest, back (z), half width, exponents front, back
BODY = [
    (0.05, 0.026, 0.0, -0.03, 0.03, 2.0, 2.0),
    (0.075, 0.056, 0.0, -0.058, 0.068, 2.1, 2.1),
    (0.115, 0.079, 0.0, -0.074, 0.094, 2.2, 2.2),
    (0.18, 0.09, 0.0, -0.078, 0.106, 2.3, 2.3),
    (0.25, 0.089, 0.0, -0.074, 0.105, 2.3, 2.3),
    (0.31, 0.081, 0.001, -0.064, 0.097, 2.3, 2.3),
    (0.36, 0.072, 0.003, -0.055, 0.088, 2.3, 2.3),
    (0.40, 0.064, 0.004, -0.05, 0.078, 2.2, 2.2),
    (0.43, 0.05, 0.004, -0.044, 0.06, 2.1, 2.1),
]


def _vloft(P, keys):
    Q2 = np.stack([P[:, 0], P[:, 2], P[:, 1]], 1)
    return loft(Q2, keys)


def trunk(P):
    Q = mirror(P)
    d = _vloft(Q, BODY)
    d = smin(d, ellipsoid(Q, V(0, 0.2, 0.025), V(0.09, 0.15, 0.07)), 0.04)          # full fluffy breast
    d = smin(d, ellipsoid(Q, V(0.06, 0.25, -0.03), V(0.05, 0.11, 0.05)), 0.04)      # shoulders under the folded wings
    return d


def head(P):
    """broad round head with a flattened face: two shallow dishes around the eyes inside a raised rim (the facial
    disc), a ridge of bristly feathers between them down to the beak"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    d = ellipsoid(Q, V(0, 0.458, 0.0), V(0.072, 0.058, 0.06))
    d = smin(d, ellipsoid(Q, V(0, 0.442, 0.016), V(0.064, 0.05, 0.05)), 0.015)       # cheeks
    d = smin(d, ellipsoid(Q, V(0, 0.408, -0.005), V(0.075, 0.03, 0.058)), 0.03)      # into the shoulders: no visible neck
    # flatten the face
    d = smax(d, z - 0.055 - 0.25 * (x / 0.07) ** 2 * 0.06 - 0.012 * sstep(0.03, 0.0, np.abs(y - 0.455)) * 0, 0.012)
    # facial disc dishes and their rim
    dc = np.hypot((x - 0.032) / 1.0, (y - 0.46) / 1.1)
    dish = 0.006 * sstep(0.04, 0.012, dc) * sstep(0.02, 0.045, z)
    rim = 0.0045 * np.exp(-((dc - 0.043) / 0.006) ** 2) * sstep(0.0, 0.04, z)
    d = d + dish - rim
    # ridge between the eyes down to the beak
    d = d - 0.004 * sstep(0.012, 0.0, x) * sstep(0.49, 0.47, y) * sstep(0.42, 0.44, y) * sstep(0.03, 0.05, z)
    return d


def beak(P):
    Q = mirror(P)
    up = chain(Q, [V(0, 0.445, 0.058), V(0, 0.441, 0.064), V(0, 0.435, 0.0678), V(0, 0.4295, 0.0686), V(0, 0.4255, 0.0668)], [0.0056, 0.0047, 0.0036, 0.0023, 0.0009], 0.001)
    up = smax(up, -(Q[:, 1] - 0.4335 + 0.15 * (Q[:, 2] - 0.06)) * sstep(0.074, 0.07, Q[:, 2]), 0.0008)
    lo = chain(Q, [V(0, 0.434, 0.06), V(0, 0.4325, 0.068)], [0.0048, 0.003], 0.001)
    return smin(up, lo, 0.0012)


def tufts(P):
    """ear tufts: flattened, pointed feather tufts rising from the corners of the head"""
    Q = mirror(P)
    a, b = V(0.036, 0.49, 0.01), V(0.064, 0.565, -0.006)
    t, _ = B.seg_t(Q, a, b)
    ax = nrm(b - a)
    L = frame(Q, a, ax, (0, 0, 1))
    r = 0.02 * (1 - t) ** 0.7 + 0.0015
    th = 0.0065 * (1 - t) + 0.0012
    q = np.sqrt((L[:, 0] / r) ** 2 + (L[:, 1] / th) ** 2)
    ln = float(np.linalg.norm(b - a))
    d = (q - 1) * np.minimum(r, th)
    d = smax(d, np.maximum(-L[:, 2], L[:, 2] - ln), 0.002)
    return d


def eye_parts(P):
    Q = mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0, -0.0045), V(EYE_R + 0.0016, EYE_R + 0.0018, EYE_R - 0.0008))
    ap = np.sqrt(s * s + u * u) - LID_R
    carve = smax(ap, -(g + 0.002), 0.001)
    ball = length(D) - EYE_R * 0.92
    return carve, lids, ball


def drum(P):
    """thick feathered thighs (pantaloons)"""
    Q = mirror(P)
    return round_cone(Q, V(0.044, 0.145, 0.012), V(0.05, 0.066, 0.012), 0.036, 0.021)


def tarsus(P):
    """the feathered tarsus down to the toes"""
    Q = mirror(P)
    return round_cone(Q, V(0.05, 0.062, 0.012), HPAW + V(0, 0.006, 0.0), 0.02, 0.0135)


def feet(P):
    Q = mirror(P)
    tt, cl, _ = B.toes(Q, FOOT, TOES)
    pad = ellipsoid(Q, HPAW + V(0, -0.0005, 0.0), V(0.013, 0.008, 0.013))
    return smin(tt, pad, 0.004), cl


def arm(P):
    Q = mirror(P)
    return B.wing_arm(Q, [SH + V(-0.015, -0.005, -0.004), EL, WR, WT], [0.04, 0.037, 0.03, 0.01], [0.011, 0.0095, 0.0075, 0.003], lead=0.62)


def grid(h):
    lo, hi = BOUNDS
    xs = B.axis_steps(0.0, hi[0], [(0.0, 0.12, h * 0.75), (0.13, 0.43, h * 1.3)], h)
    ys = B.axis_steps(lo[1], hi[1], [(lo[1], 0.03, h * 0.35), (0.335, 0.365, h * 0.45), (0.4, 0.5, h * 0.6)], h)
    zs = B.axis_steps(lo[2], hi[2], [(-0.03, 0.09, h * 0.6)], h)
    return xs, ys, zs


HEAD_BOX = (V(-0.1, 0.37, -0.08), V(0.1, 0.58, 0.1))
LEG_BOX = (V(-0.105, -0.002, -0.04), V(0.105, 0.19, 0.075))
ARM_BOX = (V(0.03, 0.325, -0.08), V(0.43, 0.375, -0.0))
EYE_BOX = (V(-0.055, 0.44, 0.025), V(0.055, 0.49, 0.075))


def parts(P):
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    ft, cl = local_n(P, *LEG_BOX, feet, 2)
    return {'trunk': trunk(P), 'head': local(P, *HEAD_BOX, head), 'bill': local(P, *HEAD_BOX, beak), 'tuft': local(P, *HEAD_BOX, tufts),
            'lids': li, 'ball': ba, 'carve': ca, 'drum': local(P, *LEG_BOX, drum), 'tarsus': local(P, *LEG_BOX, tarsus), 'toes': ft, 'claws': cl,
            'arm': local(mirror(P), *ARM_BOX, arm)}


def shape(P):
    d = local(P, (-0.13, 0.03, -0.12), (0.13, 0.46, 0.12), trunk)
    h = local(P, *HEAD_BOX, head)
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    h = smin(h, li, 0.004)
    h = smax(h, -ca, 0.001)
    h = smin(h, ba, 0.0006)
    h = smin(h, local(P, *HEAD_BOX, beak), 0.003)
    h = smin(h, local(P, *HEAD_BOX, tufts), 0.006)
    d = smin(d, h, 0.03)
    lg = smin(local(P, *LEG_BOX, drum), local(P, *LEG_BOX, tarsus), 0.012)
    ft, cl = local_n(P, *LEG_BOX, feet, 2)
    lg = smin(lg, smin(ft, cl, 0.001), 0.005)
    d = smin(d, lg, 0.02)
    d = smin(d, local(mirror(P), *ARM_BOX, arm), 0.012)
    return d


# ---------- skinning ----------
WEIGHT_SMOOTH = (0, 0)
SPINE = ['tail', 'hips', 'neck', 'head']


def _spine_u(P):
    y, z = P[:, 1], P[:, 2]
    tail = sstep(-0.045, -0.07, z) * sstep(0.17, 0.13, y)
    ut = 1.5 - tail * 1.0
    un = np.interp(y, [0.3, 0.37, 0.42, 0.58], [1.5, 2.0, 3.0, 4.0]).astype(F)
    k = sstep(0.32, 0.36, y)
    return ut * (1 - k) + un * k


WCFG = dict(groups=[('body', ['trunk']), ('head', ['head', 'bill', 'lids']), ('ear', ['tuft'], 'ear'), ('drum', ['drum']), ('tarsus', ['tarsus']),
                    ('foot', ['toes', 'claws']), ('arm', ['arm'])],
            bias={'body': 0.002}, spine=SPINE, spine_u=_spine_u, head_u=3.35, knee=(0.085, 0.105), hipb=(0.1, 0.13, 0.8),
            ankle_d=(0.078, 0.066), ankle=(0.056, 0.074), pad=(0.02, 0.01), toe_up=(0.012, 0.022), arm=(SH, EL, WR, WT), arm_root=(0.085, 0.065))


def fix_weights(W, wpos, names, G, weld):
    """weights from the sculpt's own parts (see bird.part_weights). The ear tufts ride on their ear bone (earL or
    earR by side)."""
    return B.part_weights(W, wpos, names, parts(wpos.astype(F)), WCFG)


def bone_tips(P):
    t = {'hips': P['neck'], 'tail': TAILB + V(0, -0.03, -0.08), 'neck': P['head'], 'head': MOUTH}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, -0.004, 0.035)) * m
        t['wing' + s] = P['wfore' + s]; t['wfore' + s] = P['whand' + s]; t['whand' + s] = WT * m
        t['ear' + s] = V(0.064, 0.565, -0.006) * m
    return t


OWN_KEYS = ['trunk', 'head', 'bill', 'tuft', 'drum', 'tarsus', 'toes', 'claws', 'arm', 'lids']


def _own(c):
    D = np.stack([c[k] for k in OWN_KEYS], 1)
    o = np.argmin(D, 1)
    return {k: (o == i).astype(F) for i, k in enumerate(OWN_KEYS)}


def keep(P):
    Pm = mirror(P)
    R = _own(parts(P))
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    ball = sstep(EYE_R * 0.97, EYE_R * 0.8, de)
    k = 0.45 * R['trunk'] + 0.72 * R['head'] + 0.82 * R['bill'] + 0.7 * R['tuft'] + 0.85 * R['lids']
    k += 0.55 * R['drum'] + 0.65 * R['tarsus'] + 0.78 * (R['toes'] + R['claws']) + 0.2 * R['arm']
    rim = sstep(EYE_R + 0.005, EYE_R + 0.0015, de) * sstep(EYE_R * 0.9, EYE_R * 1.0, de) * 0.85
    return np.maximum(k, rim) * (1 - ball)


# ---------- plumage ----------
K = {
    'base': hexc(0x6E5440), 'dark': hexc(0x2E2219), 'light': hexc(0xC2AA86), 'buff': hexc(0xC9AE84), 'white': hexc(0xEDE6D8),
    'disc': hexc(0xB07444), 'discGr': hexc(0x9A8A78), 'rim': hexc(0x1E1610), 'tuft': hexc(0x2E2218), 'gray': hexc(0x8C8276),
    'beak': hexc(0x2A2826), 'talon': hexc(0x141210), 'toe': hexc(0xD2BC96),
}


def _flow(P, N, R):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    n = len(P)
    fl = np.zeros((n, 3), F)
    fl[:, 1] = -1.0
    fl[:, 2] = -0.25 * sstep(-0.2, 0.4, -N[:, 2])
    hd = np.clip(R['head'] + R['lids'] + R['tuft'], 0, 1)
    # the facial disc: feathers radiate out from each eye; the crown flows back
    fx, fy = x - 0.032, y - 0.462
    face = hd * sstep(0.2, 0.6, N[:, 2])
    rad = np.stack([fx, fy, np.zeros_like(fx)], 1)
    rad /= np.maximum(np.linalg.norm(rad, axis=1, keepdims=True), 1e-6)
    crown = hd * (1 - face)
    fl = fl * (1 - hd)[:, None] + rad * face[:, None] + np.stack([np.zeros(n, F), -0.4 * np.ones(n, F), -np.ones(n, F)], 1) * crown[:, None]
    tu = R['tuft']
    fl = fl * (1 - tu)[:, None] + np.stack([0.4 * np.ones(n, F), np.ones(n, F), -0.2 * np.ones(n, F)], 1) * tu[:, None]
    ar = R['arm']
    fl[:, 0] = fl[:, 0] * (1 - ar) + 0.3 * ar
    fl[:, 1] *= (1 - ar)
    fl[:, 2] = fl[:, 2] * (1 - ar) - ar
    return fl / np.maximum(np.linalg.norm(fl, axis=1, keepdims=True), 1e-9)


def _size(P, N, R):
    y = P[:, 1]
    s = np.full(len(P), 0.014, F)
    s = s - 0.004 * sstep(0.3, 0.38, y)
    hd = R['head'] + R['lids']
    s = s * (1 - hd) + hd * 0.0045
    s = s * (1 - R['drum']) + R['drum'] * 0.006
    s = s * (1 - R['tarsus'] - R['toes']) + (R['tarsus'] + R['toes']) * 0.0035
    s = s * (1 - R['tuft']) + R['tuft'] * 0.006
    s = s * (1 - R['arm']) + R['arm'] * 0.008
    return s


def _fshape(P):
    n = len(P)
    return np.ones(n, F) * 1.1, np.ones(n, F), np.ones(n, F) * 1.1


_pcache = {}


def _plum(P, N, c):
    key = (len(P), float(P[:7].sum()))
    if key not in _pcache:
        R = _own(c)
        Pm = mirror(P)
        Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
        fl = _flow(Pm, Nm, R)
        sz = _size(Pm, Nm, R)
        feath = np.clip(R['trunk'] + R['head'] + R['tuft'] + R['drum'] + R['tarsus'] + R['toes'] + R['arm'], 0, 1)
        pl = B.plumage(Pm, Nm, fl, sz, _fshape, seed=8)
        _pcache.clear()
        _pcache[key] = (R, Pm, Nm, fl, sz, feath, pl)
    return _pcache[key]


def _discs(Pm, Nm, R):
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    dc = np.hypot(x - 0.032, (y - 0.46) / 1.1)
    front = sstep(0.0, 0.45, Nm[:, 2]) * hd
    disc = sstep(0.046, 0.038, dc) * front
    rim = sstep(0.0045, 0.0015, np.abs(dc - 0.045)) * front * sstep(0.43, 0.445, y + 0.3 * sstep(0.03, 0.0, x))
    brow = sstep(0.0055, 0.002, np.abs(y - 0.483 + 0.45 * np.abs(x))) * sstep(0.03, 0.006, x) * front
    bib = sstep(0.425, 0.41, y) * sstep(0.37, 0.385, y) * sstep(0.045, 0.02, x) * sstep(0.2, 0.6, Nm[:, 2])
    return disc, rim, brow, bib


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n1 = fbm(Pm * 40, 3, 11)
    n2 = fbm(Pm * 120, 3, 12)
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    a, b = pl['a'], pl['b']
    relb = np.abs(b) / np.maximum(pl['w'], 1e-6)
    # upperparts: mottled brown: each feather a dark center streak, buff notches on its edges
    col = np.tile(K['base'], (len(P), 1))
    col = mix(col, K['dark'], sstep(0.35, 0.1, relb) * sstep(-0.2 * cfa, -0.8 * cfa, a) * 0.7 * pl['cov'])
    notch = sstep(0.55, 0.85, np.sin(a / (0.22 * cfa) * np.pi + fid * 6) * 0.5 + 0.5) * sstep(0.45, 0.8, relb)
    col = mix(col, K['light'], notch * 0.6 * pl['cov'])
    col = mix(col, K['gray'], sstep(0.55, 0.8, n1) * 0.3)
    # front: buff with fine dark horizontal bars, dark blotches on the upper breast, a white bib on the throat
    front = sstep(-0.05, 0.45, Nm[:, 2]) * np.clip(R['trunk'], 0, 1)
    wav = 0.0035 * (fbm(Pm * V(25, 6, 25), 2, 15) - 0.5) + 0.0012 * np.sin(x * 260 + fid * 5)
    bars = sstep(0.62, 0.9, np.sin((y + wav) / 0.00115) * 0.5 + 0.5) * sstep(0.25, 0.6, fbm(Pm * V(40, 120, 40), 2, 16))
    fcol = mix(np.tile(K['buff'], (len(P), 1)), K['white'], sstep(0.2, 0.1, y) * 0.35 + sstep(0.06, 0.2, Nm[:, 2] - 0.6) * 0.0)
    fcol = mix(fcol, K['dark'], bars * 0.62)
    blot = sstep(0.3, 0.36, y) * sstep(0.62, 0.75, fbm(Pm * 70, 2, 14))
    fcol = mix(fcol, K['dark'], blot * 0.6)
    col = mix(col, fcol, front)
    # legs and feathered toes: buff, faintly barred
    lg = np.clip(R['drum'] + R['tarsus'] + R['toes'], 0, 1)
    lcol = mix(np.tile(K['buff'], (len(P), 1)), K['toe'], R['toes'])
    lcol = mix(lcol, K['dark'], bars * 0.2 * R['drum'])
    col = mix(col, lcol, lg)
    col *= (0.95 + 0.1 * fid)[:, None] * (0.95 + 0.1 * n2)[:, None]
    # facial disc: rufous, grayer around the eyes, black rim, white brows; dark ear tufts
    disc, rim, brow, bib = _discs(Pm, Nm, R)
    dcol = mix(np.tile(K['disc'], (len(P), 1)), K['discGr'], sstep(0.026, 0.016, np.hypot(x - 0.032, y - 0.462)) * 0.5)
    dcol = mix(dcol, K['dark'], sstep(0.6, 0.9, np.sin(np.arctan2(y - 0.46, x - 0.032) * 28) * 0.5 + 0.5) * 0.15)
    col = mix(col, dcol, disc)
    col = mix(col, K['rim'], rim * 0.9)
    col = mix(col, K['white'], np.clip(brow + bib, 0, 1) * 0.9)
    tcol = mix(np.tile(K['tuft'], (len(P), 1)), K['light'], sstep(0.6, 0.9, relb) * 0.4)
    col = mix(col, tcol, R['tuft'])
    bristle = sstep(0.4365, 0.4415, y) * sstep(0.0705, 0.062, z)
    col = mix(col, K['beak'], R['bill'] * (1 - bristle * 0.85))
    col = mix(col, K['discGr'], R['bill'] * bristle * 0.85)
    col = mix(col, K['talon'], R['claws'])
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    col = mix(col, K['discGr'], R['lids'] * 0.8)
    col = mix(col, K['rim'], R['lids'] * sstep(EYE_R + 0.0012, EYE_R + 0.0002, de) * 0.9)
    rough = 0.86 + 0.05 * (n1 - 0.5)
    rough = np.where(R['bill'] > 0.5, 0.38, rough)
    rough = np.where(R['claws'] > 0.5, 0.3, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    h = np.zeros(len(P), F)
    # soft owl feathers: low edges, fluffy tips
    h += B.feather_height(pl, 0.02) * feath
    h += 0.00005 * (fbm(Pm * 600, 2, 61) - 0.5) * feath
    disc, rim, brow, bib = _discs(Pm, Nm, R)
    rad = np.sin(np.arctan2(y - 0.46, x - 0.032) * 40)
    h += 0.00004 * rad * disc
    h -= 0.000015 * sstep(0.5, 1.0, np.sin(np.hypot(y - 0.42, z - 0.07) / 0.0005)) * R['bill']
    h -= 0.00002 * sstep(0.5, 1.0, np.sin(np.hypot(y, z) / 0.0006)) * R['claws']
    return h


def finish(C, ao, valid):
    return B.finish_ao(C, ao, 0.32)


# ---------- the owlet: white down with faint gray bars, pale facial disc ----------
KB = {'white': hexc(0xE6E0D4), 'gray': hexc(0x9C948A), 'disc': hexc(0xD4C4AA), 'beak': hexc(0x4A4440), 'talon': hexc(0x3A3632)}


def paint_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    dn, tip = B.down(Pm, fl, Nm, 0.0022, 76)
    col = np.tile(KB['white'], (len(P), 1))
    # faint, broken gray barring in the down
    bars = sstep(0.55, 0.85, np.sin((y + 0.012 * fbm(Pm * 40, 2, 77)) / 0.0035) * 0.5 + 0.5) * sstep(0.35, 0.7, fbm(Pm * V(30, 90, 30), 2, 78))
    col = mix(col, KB['gray'], bars * 0.22)
    disc, rim, brow, bib = _discs(Pm, Nm, R)
    col = mix(col, KB['disc'], disc * 0.8)
    col *= (0.76 + 0.34 * dn + 0.08 * tip)[:, None]
    col = mix(col, KB['beak'], R['bill'])
    col = mix(col, KB['talon'], R['claws'])
    col = mix(col, KB['gray'] * 0.6, R['lids'] * 0.7)
    rough = np.where(R['bill'] + R['claws'] > 0.5, 0.45, 0.93)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _baby_body(Q):
    """a round ball of down (the owlet is mostly head and body) and a thick neck up to the head, so it does not
    pinch in under the head"""
    d = ellipsoid(Q, V(0, 0.2, 0.0), V(0.122, 0.145, 0.108))
    return smin(d, round_cone(Q, V(0, 0.3, 0.0), V(0, 0.42, 0.005), 0.1, 0.082), 0.04)


def _baby_extra(Q, Nm, R):
    """owlets have hardly any ear tufts: press them down toward the head (through the baby ear scale 0.35)"""
    # and a soft face: the dish of the facial disc filled in, its rim pressed down
    disc, rim, _, _ = _discs(Q, Nm, R)
    away = sstep(EYE_R + 0.004, EYE_R + 0.012, np.linalg.norm(Q - EYE_C, axis=1))
    return -Nm * (0.006 * R['tuft'] - (0.004 * disc - 0.003 * rim) * away)[:, None]


def baby_offset(P, N, c):
    return B.baby_shape(P, N, _own(c), _baby_body, (V(0.05, 0.012, 0.016), V(0.046, 0.14, 0.012), 0.016, 1.2), SH + V(-0.025, -0.015, 0.0), (0.004, 0.005), extra=_baby_extra)


def detail_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, fl, Nm, 0.0022, 76)
    return 0.0003 * (dn - 0.5) * feath


# the owlet's thick white down as fur shells (babyOnly: the adult keeps its feathers); its legs and toes are downy
# too, the facial disc short
FUR = dict(len=0.05, n=6, lean=0.3, tile=0.003, babyLen=1.0, babyLean=0.3, shade=0.85, babyOnly=True, quality=80)


def fur(P, N, c):
    flen, fden = B.down_fur(P, c, FUR['len'], ['bill', 'claws', 'lids'],
                            {'head': 0.8, 'tuft': 0.6, 'arm': 0.8, 'drum': 0.8, 'tarsus': 0.55, 'toes': 0.35}, (EYE_C, EYE_R), seed=76)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
    disc, rim, _, _ = _discs(mirror(P), Nm, _own(c))
    return (flen * (1 - 0.55 * disc)).astype(F), fden


def flow(P, N):
    return B.down_flow(sys.modules[__name__], P, N)


# ---------- feather blades (atlas cells, same order as the game's feather cells) ----------
def _cells():
    F_ = B.FeatherCell
    base, dark, light, buff = hexc(0x6E5440), hexc(0x2E2219), hexc(0xC2AA86), hexc(0xC9AE84)

    def barred(s, t, c0, c1, n, k):
        c = np.tile(c0, (len(s), 1))
        bar = sstep(0.45, 0.75, np.sin(t * n + np.abs(s) * 0.8) * 0.5 + 0.5)
        return mix(c, c1, bar * k)

    def prim(s, t, side):
        return mix(barred(s, t, buff, dark, 34, 0.8), base, sstep(0.3, 0.0, t) * 0.3)

    def sec(s, t, side):
        return barred(s, t, base, dark, 38, 0.7)

    def cov(s, t, side):
        c = np.tile(base, (len(s), 1))
        c = mix(c, dark, sstep(0.35, 0.1, np.abs(s)) * 0.7)
        c = mix(c, light, sstep(0.6, 0.85, np.sin(t * 22 + 1.5) * 0.5 + 0.5) * sstep(0.5, 0.8, np.abs(s)) * 0.7)
        return c

    def tail(s, t, side):
        return barred(s, t, buff, dark, 30, 0.75)

    return [F_('round', prim, w=0.66, outer=0.6, tip=0.55, shaft=hexc(0x3A2C20)),
            F_('round', sec, w=0.76, outer=0.8, tip=0.6, shaft=hexc(0x3A2C20)),
            F_('round', cov, w=0.8, outer=0.85, tip=0.9, shaft=hexc(0x3A2C20)),
            F_('round', cov, w=0.8, outer=0.9, tip=1.2, shaft=hexc(0x3A2C20)),
            F_('round', sec, w=0.76, outer=0.85, tip=0.7, shaft=hexc(0x3A2C20)),
            F_('round', tail, w=0.7, outer=0.85, tip=0.6, shaft=hexc(0x3A2C20)),
            F_('round', cov, w=0.7, outer=0.9, tip=0.9, shaft=hexc(0x3A2C20)),
            F_('round', cov, w=0.8, outer=0.9, tip=0.8, shaft=hexc(0x3A2C20))]


def _baby_cells():
    F_ = B.FeatherCell
    w1, g1 = hexc(0xE6E0D4), hexc(0xB0A89C)
    def dn(s, t, side):
        return mix(np.tile(w1, (len(s), 1)), g1, sstep(0.5, 0.0, t) * 0.4)
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
    return {'lidCol': 0x8C7C6A}


def meta(st):
    r = EYE_R
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [0.84, -0.84, 0.1],
                'iris': 0xF0A51C, 'irisR': 0.9, 'pupilR': 0.42, 'rim': 0x2A1A0A, 'lidCol': st['lidCol'], 'babyLidCol': 0x8C8478},
        'collar': {'at': ['neck', 'head', 0.15], 'w': 0.6, 'r': 0.55, 'maxR': 0.1, 'babyMaxR': 0.3, 'hug': True, 'babyK': 1.6, 'lift': 0.35},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.14, 0.12, 0.1], 'flat': 0x7A6048,
    }
