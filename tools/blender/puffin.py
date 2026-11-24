# Atlantic puffin (round 16), sculpted as a signed distance field around the game's puffin skeleton (bird.py has the
# shared bird parts; the layout follows flamingo.py and swan.py). Units are meters in game rig space (x left, y up,
# z forward, ground at y = 0). Built level like the chickadee (the game stands it upright with standPitch), in the
# rig's bind pose: the wing arm sticks out flat to the side under the game's feather blades. A chunky body with the
# folded wing over its upper side, a short thick neck, a big round head, the tall triangular summer bill (a blue-gray
# base plate edged yellow, red-orange outer half with yellow grooves, a yellow rosette at the gape), short orange legs
# and webbed feet. Black back, crown and collar, a pale gray-white face, white below. The puffling: dark gray fluff.
# Make it with: VOXEL=0.0011 TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py puffin sculpt export
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, loft, sweep, frame, fbm, vnoise, worley, length
import bird as B
from bird import local, local_n, mirror, groove, hexc, mix

ID = 'puffin'
BOUNDS = (V(-0.2, -0.001, -0.135), V(0.2, 0.192, 0.16))
PATCHES = [
    (V(0.0, 0.128, 0.075), V(0.034, 0.19, 0.152), 0.0003),       # bill, eye
    (V(0.0, -0.001, -0.02), V(0.065, 0.014, 0.05), 0.00035),     # feet
]
BAKE_DIST = (0.0022, 0.0055, 0.03)
TAIL_RINGS = 0
PREV_HEAD = ((0, 0.155, 0.11), 0.05)    # (scratch preview framing)
DISSOLVE_DEGENERATE = True
UV_PACK = dict(shape_method='CONCAVE', rotate_method='ANY')
UV_AVERAGE = True

# ---------- landmarks (left side; bone pivots from the rig) ----------
HIPS, TAILB, NECK, HEAD = V(0, 0.1, 0.0), V(0, 0.112, -0.085), V(0, 0.122, 0.062), V(0, 0.15, 0.078)
THIGH, SHIN, HMETA, HPAW = V(0.025, 0.088, 0.0), V(0.029, 0.062, 0.02), V(0.029, 0.034, -0.008), V(0.029, 0.004, 0.012)
SH, EL, WR, WT = V(0.03, 0.122, 0.04), V(0.07, 0.122, 0.04), V(0.12, 0.122, 0.04), V(0.1575, 0.122, 0.04)

EYE_C = V(0.0192, 0.1625, 0.0955)
EYE_R = 0.0041
EYE_DIR = nrm(V(0.9, 0.15, 0.36))
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_R = 0.0032
MOUTH = V(0, 0.1455, 0.149)
FOOT = HPAW + V(0, 0.0, 0.001)
TOES = [dict(a=-25, len=0.029, r=0.0026, r1=0.0015, claw=0.004, n=3), dict(a=0, len=0.035, r=0.0028, r1=0.0016, claw=0.0045, n=3),
        dict(a=25, len=0.029, r=0.0026, r1=0.0015, claw=0.004, n=3), dict(a=180, len=0.005, r=0.0016, r1=0.001, claw=0.002, lift=0.003, n=2, hind=True)]

# trunk: z, top, yw (height of the widest line), bottom, half width, exponents above and below. Chunky and short.
TRUNK = [
    (-0.112, 0.123, 0.117, 0.111, 0.005, 2.0, 2.0),
    (-0.095, 0.128, 0.111, 0.094, 0.022, 2.0, 2.0),
    (-0.065, 0.135, 0.105, 0.071, 0.04, 2.1, 2.0),
    (-0.025, 0.141, 0.101, 0.057, 0.051, 2.3, 2.2),
    (0.015, 0.143, 0.101, 0.054, 0.053, 2.3, 2.3),
    (0.048, 0.139, 0.104, 0.061, 0.049, 2.2, 2.2),
    (0.072, 0.13, 0.109, 0.079, 0.037, 2.1, 2.0),
    (0.088, 0.121, 0.113, 0.1, 0.018, 2.0, 2.0),
]
WING_EDGE = [(-0.14, 0.12), (-0.1, 0.113), (-0.06, 0.103), (-0.02, 0.097), (0.02, 0.098), (0.05, 0.105)]
WING_T = 0.0035
NECK_KEYS = [
    (0.098, 0.035, 0.042, 0.042, 0.04, 2.0, 2.0),
    (0.12, 0.062, 0.034, 0.034, 0.032, 2.0, 2.0),
    (0.14, 0.074, 0.03, 0.03, 0.028, 2.0, 2.0),
    (0.152, 0.078, 0.027, 0.027, 0.025, 2.0, 2.0),
]
# the bill: a loft along z (the head is held level): top, the widest line, bottom, half width. Tall at the base,
# narrow side to side, the culmen arching down to the tip and the lower edge rising to it
BILL = [
    (0.099, 0.1745, 0.1545, 0.1335, 0.0108, 2.2, 2.2),
    (0.108, 0.1725, 0.1535, 0.1345, 0.0098, 2.3, 2.2),
    (0.118, 0.1685, 0.1525, 0.1365, 0.0087, 2.4, 2.3),
    (0.128, 0.1625, 0.151, 0.139, 0.0074, 2.4, 2.3),
    (0.137, 0.1565, 0.1495, 0.1415, 0.0058, 2.4, 2.3),
    (0.144, 0.1505, 0.1475, 0.1435, 0.004, 2.2, 2.2),
    (0.149, 0.147, 0.1458, 0.1446, 0.0018, 2.0, 2.0),
]
TOMIUM = [(0.099, 0.1515), (0.115, 0.1505), (0.13, 0.149), (0.142, 0.147), (0.149, 0.1456)]
ROSETTE = V(0.0118, 0.1495, 0.1)


def _interp(tab, z):
    zz = np.array([k[0] for k in tab], F); yy = np.array([k[1] for k in tab], F)
    return np.interp(z, zz, yy).astype(F)


# ---------- body ----------
def trunk(P):
    Q = mirror(P)
    y, z = Q[:, 1], Q[:, 2]
    d = loft(Q, TRUNK)
    d = smin(d, ellipsoid(Q, V(0, 0.099, 0.042), V(0.047, 0.044, 0.05)), 0.015)          # round breast
    ye = _interp(WING_EDGE, z)
    w = smax(d - WING_T, ye - y, 0.0008)
    w = smax(w, z - (0.05 + 0.6 * (y - 0.1)), 0.006)
    # the primaries crossing over the rump
    Qs = Q * V(1, 2.2, 1)
    w = smin(w, round_cone(Qs, V(0.028, 0.13 * 2.2, -0.06), V(0.008, 0.124 * 2.2, -0.125), 0.012, 0.003), 0.004)
    return smin(d, w, 0.0008)


def neck(P):
    return sweep(mirror(P), NECK_KEYS, n=60)


def head(P):
    Q = mirror(P)
    d = ellipsoid(Q, V(0, 0.1585, 0.083), V(0.0255, 0.0265, 0.031))
    d = smin(d, ellipsoid(Q, V(0, 0.15, 0.094), V(0.019, 0.02, 0.016)), 0.006)       # full cheeks to the bill
    return d


def bill(P):
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    d = loft(Q, BILL)
    yt = _interp(TOMIUM, z)
    d = d + groove(y - yt, 0.00035, 0.00035) * sstep(0.1, 0.103, z)
    # grooves across the red outer half of the bill (two on the upper mandible, one on the lower)
    for zc in (0.125, 0.133):
        d = d + groove(z - zc - 0.15 * (y - 0.15), 0.0006, 0.00025) * sstep(0.0, 0.002, y - yt)
    d = d + groove(z - 0.129 + 0.15 * (y - 0.14), 0.0006, 0.00022) * sstep(0.0, 0.002, yt - y)
    return d


def rosette(P):
    """the fleshy yellow rosette at the corner of the gape"""
    Q = mirror(P)
    return ellipsoid(Q, ROSETTE, V(0.0028, 0.0034, 0.0042))


def eye_parts(P):
    Q = mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0, -0.0004), V(EYE_R + 0.0016, EYE_R + 0.0016, EYE_R + 0.0008))
    ap = np.sqrt(s * s + u * u) - LID_R
    carve = smax(ap, -(g + 0.0007), 0.0004)
    ball = length(D) - EYE_R * 0.92
    # the horny plates above and below the eye: small raised triangles
    pa = ellipsoid(L, V(0.0, 0.0058, -0.0006), V(0.0034, 0.0016, 0.0012))
    pb = ellipsoid(L, V(0.0, -0.0062, -0.0006), V(0.0048, 0.0016, 0.0012))
    return carve, smin(lids, np.minimum(pa, pb), 0.001), ball


# ---------- legs ----------
def drum(P):
    Q = mirror(P)
    return round_cone(Q, V(0.024, 0.088, 0.0), SHIN + V(0, -0.004, -0.002), 0.016, 0.0095)


def tarsus(P):
    Q = mirror(P)
    j = round_cone(Q, SHIN + V(0, -0.006, -0.003), HMETA + V(0, -0.001, 0.0), 0.0048, 0.0042)
    t = B.flat_cone(Q, HMETA + V(0, -0.001, 0.0), HPAW + V(0, 0.002, -0.001), 0.004, 0.0034, 0.75, up=(1, 0, 0))
    pad = ellipsoid(Q, HPAW + V(0, -0.0005, 0.001), V(0.004, 0.003, 0.005))
    return smin(smin(j, t, 0.003), pad, 0.002)


def feet(P):
    Q = mirror(P)
    tt, cl, _ = B.toes(Q, FOOT, [t for t in TOES if not t.get('hind')])
    ht, hc, _ = B.toes(Q, HPAW + V(0, 0.003, -0.002), [t for t in TOES if t.get('hind')], ground=0.002)
    wb = B.web(Q, FOOT, TOES, 0.0008, reach=0.92, sag=0.18)
    return np.minimum(tt, ht), np.minimum(cl, hc), wb


def arm(P):
    Q = mirror(P)
    return B.wing_arm(Q, [SH + V(-0.008, -0.002, -0.002), SH + V(0.016, 0, 0), EL, WR, WT], [0.01, 0.017, 0.018, 0.014, 0.005],
                      [0.0035, 0.0045, 0.0045, 0.0035, 0.0018], lead=0.62)


# ---------- assembly ----------
def grid(h):
    lo, hi = BOUNDS
    xs = B.axis_steps(0.0, hi[0], [(0.0, 0.05, h * 0.6), (0.05, 0.2, h * 1.4)], h)
    ys = B.axis_steps(lo[1], hi[1], [(lo[1], 0.012, h * 0.4), (0.13, 0.19, h * 0.6)], h)
    zs = B.axis_steps(lo[2], hi[2], [(-0.015, 0.05, h * 0.6), (0.075, 0.155, h * 0.55)], h)
    return xs, ys, zs


HEAD_BOX = (V(-0.04, 0.125, 0.045), V(0.04, 0.192, 0.16))
NECK_BOX = (V(-0.06, 0.07, 0.0), V(0.06, 0.18, 0.11))
LEG_BOX = (V(-0.07, -0.002, -0.03), V(0.07, 0.1, 0.06))
ARM_BOX = (V(0.01, 0.11, 0.02), V(0.2, 0.134, 0.06))
EYE_BOX = (V(-EYE_C[0] - 0.012, EYE_C[1] - 0.012, EYE_C[2] - 0.012), EYE_C + V(0.012, 0.012, 0.012))
TRUNK_BOX = (V(-0.08, 0.04, -0.135), V(0.08, 0.16, 0.11))


def parts(P):
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    ft, cl, wb = local_n(P, *LEG_BOX, feet, 3)
    return {'trunk': local(P, *TRUNK_BOX, trunk), 'neck': local(P, *NECK_BOX, neck), 'head': local(P, *HEAD_BOX, head),
            'bill': local(P, *HEAD_BOX, bill), 'rosette': local(P, *HEAD_BOX, rosette), 'lids': li, 'ball': ba, 'carve': ca,
            'drum': local(P, *LEG_BOX, drum), 'tarsus': local(P, *LEG_BOX, tarsus), 'toes': ft, 'claws': cl, 'web': wb,
            'arm': local(mirror(P), *ARM_BOX, arm)}


def shape(P):
    d = local(P, *TRUNK_BOX, trunk)
    d = smin(d, local(P, *NECK_BOX, neck), 0.012)
    h = local(P, *HEAD_BOX, head)
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    h = smin(h, li, 0.0015)
    h = smax(h, -ca, 0.0004)
    h = smin(h, ba, 0.0003)
    bl = smin(local(P, *HEAD_BOX, bill), local(P, *HEAD_BOX, rosette), 0.0012)
    h = smin(h, bl, 0.0022)
    d = smin(d, h, 0.008)
    lg = smin(local(P, *LEG_BOX, drum), local(P, *LEG_BOX, tarsus), 0.003)
    ft, cl, wb = local_n(P, *LEG_BOX, feet, 3)
    f = smin(smin(ft, wb, 0.0008), cl, 0.0005)
    lg = smin(lg, f, 0.002)
    d = smin(d, lg, 0.006)
    d = smin(d, local(mirror(P), *ARM_BOX, arm), 0.006)
    return d


def uv_regions(P):
    Pm = mirror(P)
    lab = np.full(len(P), 2)
    lab[(Pm[:, 1] > 0.115) & (Pm[:, 2] > 0.05)] = 1
    lab[Pm[:, 1] < 0.045] = 3
    lab[(Pm[:, 0] > 0.05) & (Pm[:, 1] > 0.112)] = 5
    lab[((Pm[:, 1] > 0.135) & (Pm[:, 2] > 0.06)) | (Pm[:, 2] > 0.098)] = 0
    return lab


def uv_weight(P):
    lab = uv_regions(P)
    return np.choose(lab, [2.6, 1.1, 0.9, 1.0, 1.0, 0.45]).astype(F)


def lowpoly_fix(bm, hi):
    from scipy.spatial import cKDTree
    hv = np.asarray(hi['v'], np.float64)
    tree = cKDTree(hv)
    co = np.array([list(v.co) for v in bm.verts], np.float64)
    dist, ix = tree.query(co)
    far = np.where(dist > 0.0015)[0]
    bm.verts.ensure_lookup_table()
    for k in far:
        bm.verts[k].co = hv[ix[k]].tolist()
    print(f'lowpoly_fix: {len(far)} vertices put back on the sculpt')


# ---------- skinning ----------
WEIGHT_SMOOTH = (0, 0)
SPINE = ['tail', 'hips', 'neck', 'head']


def _spine_u(P):
    y, z = P[:, 1], P[:, 2]
    ut = 1.5 + np.clip((z + 0.085) / 0.03, -1, 0)
    un = np.interp(z + 0.4 * np.maximum(0, y - 0.12), [0.03, 0.062, 0.078, 0.1], [1.5, 2.0, 3.0, 3.4]).astype(F)
    k = sstep(0.04, 0.062, z) * sstep(0.105, 0.12, y + 0.3 * np.maximum(0, z - 0.06))
    return ut * (1 - k) + un * k


WCFG = dict(groups=[('body', ['trunk', 'neck']), ('head', ['head', 'bill', 'rosette', 'lids']), ('drum', ['drum']), ('tarsus', ['tarsus']),
                    ('foot', ['toes', 'claws', 'web']), ('arm', ['arm'])],
            bias={'body': 0.001}, spine=SPINE, spine_u=_spine_u, head_u=3.0, knee=(0.06, 0.07), hipb=(0.08, 0.092, 0.75),
            ankle_d=(0.045, 0.036), ankle=(0.032, 0.042), pad=(0.008, 0.003), toe_up=(0.005, 0.009), arm=(SH, EL, WR, WT), arm_root=(0.045, 0.035))


def fix_weights(W, wpos, names, G, weld):
    P = wpos.astype(F)
    c = parts(P)
    Wn = B.part_weights(W, wpos, names, c, WCFG)
    f = _own(c)['arm'] * (c['arm'] < 0.003) * sstep(0.042, 0.03, np.abs(P[:, 0]))
    hip = np.zeros_like(Wn[0]); hip[list(names).index('hips')] = 1
    return Wn * (1 - f[:, None]) + hip[None, :] * f[:, None]


def bone_tips(P):
    t = {'hips': P['neck'], 'tail': TAILB + V(0, 0.004, -0.04), 'neck': P['head'], 'head': MOUTH}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, -0.002, 0.03)) * m
        t['wing' + s] = P['wfore' + s]; t['wfore' + s] = P['whand' + s]; t['whand' + s] = WT * m
    return t


OWN_KEYS = ['trunk', 'neck', 'head', 'bill', 'rosette', 'drum', 'tarsus', 'toes', 'web', 'claws', 'arm', 'lids']


def _own(c):
    D = np.stack([c[k] for k in OWN_KEYS], 1)
    o = np.argmin(D, 1)
    return {k: (o == i).astype(F) for i, k in enumerate(OWN_KEYS)}


def keep(P):
    Pm = mirror(P)
    R = _own(parts(P))
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    ball = sstep(EYE_R * 0.97, EYE_R * 0.8, de)
    k = 0.42 * R['trunk'] + 0.6 * R['neck'] + 0.78 * R['head'] + 0.84 * (R['bill'] + R['rosette']) + 0.85 * R['lids']
    k += 0.55 * R['drum'] + 0.72 * R['tarsus'] + 0.78 * (R['toes'] + R['web'] + R['claws']) + 0.2 * R['arm']
    rim = sstep(EYE_R + 0.003, EYE_R + 0.001, de) * sstep(EYE_R * 0.9, EYE_R * 1.0, de) * 0.85
    return np.maximum(k, rim) * (1 - ball)


# ---------- plumage and skin paint ----------
K = {
    'black': hexc(0x141518), 'blackHi': hexc(0x262A30), 'white': hexc(0xF3F1EB), 'shade': hexc(0xD6D4CE), 'face': hexc(0xE2E2DC),
    'cheek': hexc(0xB8BAB8), 'flank': hexc(0x3A3C40), 'blue': hexc(0x6E8094), 'yellow': hexc(0xF2C22C), 'red': hexc(0xE24A1E),
    'redDk': hexc(0xC0381A), 'orange': hexc(0xF46A20), 'ring': hexc(0xD8401E), 'plate': hexc(0x50565E),
}


def _wing_mask(Pm, R=None):
    y, z = Pm[:, 1], Pm[:, 2]
    ye = _interp(WING_EDGE, z)
    on = sstep(ye - 0.0006, ye + 0.0012, y) * sstep(0.05 + 0.6 * (y - 0.1) + 0.003, 0.05 + 0.6 * (y - 0.1) - 0.006, z)
    on = on * sstep(0.008, 0.016, np.abs(Pm[:, 0]))
    return on * (R['trunk'] if R is not None else sstep(0.15, 0.14, y))


def _flow(P, N, R, wing=False):
    fl = np.zeros((len(P), 3), F)
    side = sat(-N[:, 1] * 0.6 + 0.2)
    fl[:, 1] = -0.2 - 0.55 * side
    fl[:, 2] = -1.0
    y, z = P[:, 1], P[:, 2]
    breast = sstep(0.03, 0.06, z) * sstep(0.11, 0.09, y)
    fl[:, 1] -= 1.6 * breast
    fl[:, 2] += 0.6 * breast
    wg = _wing_mask(P, R) if wing else np.zeros(len(P), F)
    fl[:, 1] = fl[:, 1] * (1 - wg) - 0.12 * wg
    fl[:, 2] = fl[:, 2] * (1 - wg) - 1.0 * wg
    nk = R['neck']
    fl[:, 1] = fl[:, 1] * (1 - nk) - 0.6 * nk
    fl[:, 2] = fl[:, 2] * (1 - nk) - 0.6 * nk
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    fl[:, 1] = fl[:, 1] * (1 - hd) - 0.1 * hd
    fl[:, 2] = fl[:, 2] * (1 - hd) - 1.0 * hd
    ar = R['arm']
    fl[:, 0] = fl[:, 0] * (1 - ar) + 0.3 * ar
    fl[:, 1] *= (1 - ar)
    fl[:, 2] = fl[:, 2] * (1 - ar) - ar
    return fl / np.maximum(np.linalg.norm(fl, axis=1, keepdims=True), 1e-9)


def _size(P, N, R):
    s = np.full(len(P), 0.006, F)
    wg = _wing_mask(P, R)
    s = s * (1 - wg) + wg * 0.009
    nk = R['neck']
    s = s * (1 - nk) + nk * 0.004
    hd = R['head'] + R['lids']
    s = s * (1 - hd) + hd * 0.0022
    s = s * (1 - R['drum']) + R['drum'] * 0.003
    s = s * (1 - R['arm']) + R['arm'] * 0.004
    return s


_pcache = {}


def _plum(P, N, c):
    key = (len(P), float(P[:7].sum()))
    if key not in _pcache:
        R = _own(c)
        Pm = mirror(P)
        Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
        fl = _flow(Pm, Nm, R, wing=True)
        sz = _size(Pm, Nm, R)
        feath = np.clip(R['trunk'] + R['neck'] + R['head'] + R['drum'] + R['arm'], 0, 1)
        pl = B.plumage(Pm, Nm, fl, sz, None, seed=36)
        _pcache.clear()
        _pcache[key] = (R, Pm, Nm, fl, sz, feath, pl)
    return _pcache[key]


def _face(Pm, R):
    """the pale face: the sides of the head below the black crown, in front of the black nape, above the black chin
    and collar"""
    x, y, z = np.abs(Pm[:, 0]), Pm[:, 1], Pm[:, 2]
    crown = 0.17 + 0.006 * sstep(0.08, 0.1, z) - 0.004 * sstep(0.075, 0.06, z)
    nape = 0.068 + 0.1 * (y - 0.15)
    chin = 0.142 - 0.02 * sstep(0.1, 0.08, z)
    side = sstep(0.006, 0.014, x)
    return sstep(crown + 0.0015, crown - 0.0015, y) * sstep(nape - 0.003, nape + 0.003, z) * sstep(chin - 0.002, chin + 0.002, y) * side


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n1 = fbm(Pm * 60, 3, 41)
    # black above, white below; the black collar round the throat; dark gray flanks under the wing
    col = np.tile(K['black'], (len(P), 1))
    under = sstep(0.0, -0.4, Nm[:, 1]) + sstep(0.2, 0.7, Nm[:, 2]) * sstep(0.115, 0.1, y)
    collar = sstep(0.118, 0.124, y + 0.02 * sstep(0.04, 0.07, z))
    white = np.clip(under, 0, 1) * (1 - collar) * np.clip(R['trunk'] + R['neck'] + R['drum'], 0, 1)
    white = white * (1 - _wing_mask(Pm, R))
    col = mix(col, mix(np.tile(K['white'], (len(P), 1)), K['shade'], sstep(-0.3, -0.9, Nm[:, 1]) * 0.25), white)
    col = mix(col, K['flank'], white * sstep(0.25, 0.6, np.abs(Nm[:, 0])) * sstep(0.08, 0.1, y) * sstep(0.0, -0.04, z) * 0.6)
    fc = _face(Pm, R) * np.clip(R['head'] + R['neck'] + R['lids'], 0, 1)
    col = mix(col, mix(np.tile(K['face'], (len(P), 1)), K['cheek'], sstep(0.148, 0.142, y) * 0.5 + sstep(0.075, 0.068, z) * 0.4), fc)
    col = mix(col, K['blackHi'], sstep(0.4, 0.9, Nm[:, 1]) * 0.25 * (1 - white))
    cfa = np.maximum(pl['c'], 1e-4)
    col = mix(col, col * 0.88, sstep(0.45 * cfa, 1.2 * cfa, -pl['a']) * 0.25 * pl['cov'] * feath)
    col *= (0.97 + 0.05 * pl['id'] + 0.03 * (n1 - 0.5))[:, None]
    # the bill: a blue-gray base plate edged with a yellow ridge, then red-orange with yellow grooves
    bl = R['bill']
    yt = _interp(TOMIUM, z)
    # (the plate's outer edge is a curve from the top of the culmen down to the gape, about 40% along the bill)
    eb = 0.1175 - 0.35 * (0.172 - y) + 30.0 * (y - 0.152) ** 2
    base = sstep(eb + 0.0008, eb - 0.0008, z)
    ridge = sstep(0.0014, 0.0004, np.abs(z - eb - 0.0018))
    gr = np.zeros(len(P), F)
    for zc in (0.125, 0.133):
        gr = np.maximum(gr, sstep(0.0011, 0.0003, np.abs(z - zc - 0.15 * (y - 0.15))) * sstep(0.0, 0.002, y - yt))
    gr = np.maximum(gr, sstep(0.0011, 0.0003, np.abs(z - 0.129 + 0.15 * (y - 0.14))) * sstep(0.0, 0.002, yt - y))
    bc = mix(np.tile(K['red'], (len(P), 1)), K['redDk'], sstep(0.14, 0.148, z) * 0.4 + sstep(0.3, 0.9, np.abs(Nm[:, 0])) * 0.15)
    bc = mix(bc, K['blue'], base)
    bc = mix(bc, K['yellow'], np.clip(ridge + gr * 0.85 + sstep(0.103, 0.1, z) * 0.8, 0, 1))
    col = mix(col, bc, bl)
    col = mix(col, K['yellow'], R['rosette'])
    # the red ring round the eye, the dark gray horny plates above and below it
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    col = mix(col, K['ring'], sstep(EYE_R + 0.0019, EYE_R + 0.0009, de) * hd)
    D = Pm - EYE_C
    u = D @ EYE_UP
    plate = sstep(EYE_R + 0.004, EYE_R + 0.0015, de) * sstep(0.0035, 0.0055, np.abs(u)) * R['lids']
    col = mix(col, K['plate'], plate)
    lg = np.clip(R['tarsus'] + R['toes'] + R['web'] + R['claws'], 0, 1)
    col = mix(col, mix(np.tile(K['orange'], (len(P), 1)), K['redDk'], R['claws'] * 0.6), lg)
    rough = 0.66 + 0.06 * (n1 - 0.5)
    rough = np.where(white > 0.5, 0.75, rough)
    rough = np.where(bl > 0.5, 0.35, rough)
    rough = np.where(lg > 0.5, 0.5, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _leg_h(P, c, R):
    Pm = mirror(P)
    rh, rg = B.reticulate(Pm, 0.0008, 42)
    h = (R['tarsus'] + R['toes']) * (0.00003 * rh - 0.00004 * rg)
    wh, wg = B.reticulate(Pm, 0.0005, 44)
    h += R['web'] * (0.00001 * wh - 0.000015 * wg)
    return h


def detail(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    h = B.feather_height(pl, 0.025) * feath * (1 - 0.5 * hd)
    h += 0.00001 * (fbm(Pm * 1500, 2, 61) - 0.5) * hd
    f1, _ = worley(Pm / 0.0003, 62)
    h -= 0.000006 * sstep(0.3, 0.0, f1) * R['bill']
    return h + _leg_h(P, c, R)


def finish(C, ao, valid):
    return B.finish_ao(C, ao, 0.34)


# ---------- the puffling (baby maps) ----------
KB = {'dark': hexc(0x45413E), 'mid': hexc(0x5E5955), 'pale': hexc(0x8C8782), 'bill': hexc(0x2E2C2A), 'leg': hexc(0x4A4442)}


def paint_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, _flow(Pm, Nm, R), Nm, 0.0012, 73)
    col = mix(np.tile(KB['mid'], (len(P), 1)), KB['pale'], sstep(-0.3, -0.8, Nm[:, 1]) * 0.6)
    col = mix(col, KB['dark'], sstep(0.3, 0.8, Nm[:, 1]) * 0.5)
    col *= (0.74 + 0.38 * dn + 0.1 * tip)[:, None]
    bl = np.clip(R['bill'] + R['rosette'], 0, 1)
    col = mix(col, KB['bill'], bl)
    lg = np.clip(R['tarsus'] + R['toes'] + R['web'] + R['claws'], 0, 1)
    col = mix(col, KB['leg'], lg)
    col = mix(col, KB['dark'] * 0.7, R['lids'] * 0.6)
    rough = np.where(bl + lg > 0.5, 0.55, 0.93)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _baby_body(Q):
    d = ellipsoid(Q, V(0, 0.1, -0.01), V(0.058, 0.055, 0.085))
    return smin(d, sweep(Q, NECK_KEYS, n=60), 0.015)


def baby_offset(P, N, c):
    """per vertex: where the puffling's surface lies relative to the adult's: a round ball of fluff, a small bill"""
    R0 = _own(c)
    R = dict(R0); R['neck'] = np.zeros(len(P), F)
    d = B.baby_shape(P, N, R, _baby_body, (V(0.029, 0.04, -0.006), V(0.025, 0.085, 0.0), 0.005, 1.3), SH + V(-0.012, -0.008, -0.006), (0.002, 0.003), maxd=0.03)
    # a small bill: the tall summer bill shrinks to a slim dark one (its top and bottom toward the mouth line)
    y, z = P[:, 1], P[:, 2]
    yt = _interp(TOMIUM, z)
    bl = np.clip(R0['bill'] + R0['rosette'], 0, 1) * sstep(0.098, 0.104, z)
    d[:, 1] -= (y - yt) * 0.55 * bl
    d[:, 0] -= P[:, 0] * 0.3 * bl
    return d


def detail_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, _flow(Pm, Nm, R), Nm, 0.0012, 73)
    return 0.00018 * (dn - 0.5) * feath + 0.5 * _leg_h(P, c, R)


FUR = dict(len=0.016, n=6, lean=0.3, tile=0.0014, babyLen=1.0, babyLean=0.3, shade=0.88, babyOnly=True, quality=58)


def fur(P, N, c):
    return B.down_fur(P, c, FUR['len'], ['bill', 'rosette', 'tarsus', 'toes', 'web', 'claws', 'lids'],
                      {'head': 0.55, 'neck': 0.85, 'arm': 0.75, 'drum': 0.6}, (EYE_C, EYE_R), edge=0.0015, seed=73)


def flow(P, N):
    return B.down_flow(sys.modules[__name__], P, N)


# ---------- feather blades (atlas cells, same order as the game's feather cells) ----------
def _vn(s, t, base, edge, k=0.5):
    return mix(np.tile(base, (len(s), 1)), edge, sstep(0.55, 1.0, np.abs(s)) * k)


def _cells():
    F_ = B.FeatherCell
    bk, bk2, gr = hexc(0x16171A), hexc(0x2A2D32), hexc(0x3A3E44)

    def prim(s, t, side):
        return mix(_vn(s, t, bk, bk2, 0.4), gr, sstep(0.0, -1.0, s) * 0.15)

    def sec(s, t, side):
        return _vn(s, t, bk, bk2, 0.35)

    def cov(s, t, side):
        return _vn(s, t, bk, bk2, 0.4)

    return [F_('flight', prim, w=0.58, outer=0.55, tip=0.42, shaft=hexc(0x2A2C30)),
            F_('round', sec, w=0.72, outer=0.8, tip=0.45, shaft=hexc(0x2A2C30)),
            F_('round', cov, w=0.8, outer=0.85, tip=0.8, shaft=hexc(0x2A2C30)),
            F_('round', cov, w=0.8, outer=0.9, tip=1.2, shaft=hexc(0x2A2C30)),
            F_('round', sec, w=0.74, outer=0.85, tip=0.6, shaft=hexc(0x2A2C30)),
            F_('round', cov, w=0.62, outer=0.85, tip=0.7, shaft=hexc(0x2A2C30)),
            F_('round', cov, w=0.7, outer=0.9, tip=0.9, shaft=hexc(0x2A2C30)),
            F_('round', cov, w=0.8, outer=0.9, tip=0.8, shaft=hexc(0x2A2C30))]


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = hexc(0x55504C), hexc(0x433F3C)
    def dn(s, t, side):
        return mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 8


FEATHER_ATLAS = {'size': (1024, 512), 'out': (512, 256), 'cells': _cells, 'baby': _baby_cells, 'quality': (58, 62, 58),
                 'alpha_quality': 50}


def extra_maps(X):
    B.extra_maps(sys.modules[__name__], X)


def export_extra(meta, out_dir, work):
    B.export_extra(sys.modules[__name__], meta, out_dir, work)


MAP_QUALITY = (70, 52)
BABY_MAPS = {'size': 384, 'quality': (64, 50)}


def stats(P, N, c, col):
    return {'lidCol': 0x1A1B1E}


def meta(st):
    r = EYE_R
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [0.8, -0.8, 0.12],
                'iris': 0x1E1610, 'irisR': 0.9, 'pupilR': 0.5, 'rim': 0x0A0806, 'lidCol': st['lidCol'], 'babyLidCol': 0x3A3634},
        'collar': {'at': ['neck', 'head', 0.4], 'babyAt': 0.4, 'hug': True, 'babyK': 1.6, 'lift': 0.35},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.1, 0.1, 0.1], 'flat': 0x2A2C30,
    }
