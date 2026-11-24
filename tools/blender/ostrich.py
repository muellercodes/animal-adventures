# Common ostrich (round 16), the boy: sculpted as a signed distance field around the game's ostrich skeleton (bird.py
# has the shared bird parts; the layout follows flamingo.py). Units are meters in game rig space (x left, y up,
# z forward, ground at y = 0). Made in the rig's bind pose: the wing arm sticks out flat to the side under the game's
# plume blades. A big rounded body of loose black feathers with the folded wing over its side, a long bare neck, a small
# flat-topped head with big eyes and a flat broad bill, huge bare thighs, long scaly legs and two toes on each foot (a
# big inner toe with a thick claw, a small outer one). The girl is ostrichf.py (her own colors on this mesh). The chick:
# buff down with dark brown stripes.
# Make it with: VOXEL=0.007 TRIS=6200 TEX=1024 BLENDER_PY=... python3 tools/blender/make.py ostrich sculpt export
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, loft, sweep, frame, fbm, vnoise, worley, length
import bird as B
from bird import local, local_n, mirror, groove, hexc, mix

ID = 'ostrich'
BOUNDS = (V(-0.7, -0.002, -0.72), V(0.7, 2.37, 0.66))
PATCHES = [
    (V(0.0, 2.2, 0.36), V(0.07, 2.36, 0.63), 0.0016),          # head, bill, eye
    (V(0.0, -0.002, -0.06), V(0.26, 0.09, 0.3), 0.0018),       # feet
]
BAKE_DIST = (0.012, 0.03, 0.15)
TAIL_RINGS = 0
PREV_HEAD = ((0, 2.28, 0.5), 0.14)    # (scratch preview framing)
DISSOLVE_DEGENERATE = True
UV_PACK = dict(shape_method='CONCAVE', rotate_method='ANY')
UV_AVERAGE = True

# ---------- landmarks (left side; bone pivots from the rig) ----------
HIPS, TAILB = V(0, 1.12, 0), V(0, 1.24, -0.48)
NECK, NECK2, NECK3, HEAD = V(0, 1.3, 0.34), V(0, 1.62, 0.4), V(0, 1.96, 0.42), V(0, 2.26, 0.44)
THIGH, SHIN, HMETA, HPAW = V(0.12, 1.06, 0.0), V(0.15, 0.96, 0.14), V(0.15, 0.56, -0.08), V(0.15, 0.03, 0.06)
SH, EL, WR, WT = V(0.19, 1.32, 0.12), V(0.318, 1.32, 0.12), V(0.478, 1.32, 0.12), V(0.598, 1.32, 0.12)

EYE_C = V(0.0372, 2.297, 0.487)
EYE_R = 0.0205
EYE_DIR = nrm(V(0.85, 0.12, 0.5))
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_R = 0.0158
MOUTH = V(0, 2.258, 0.6)
FOOT = HPAW + V(0, 0.0, 0.004)
TOES = [dict(a=-6, len=0.16, r=0.03, r1=0.02, claw=0.05, clawR=0.016, clawDrop=0.2, n=4), dict(a=32, len=0.1, r=0.021, r1=0.014, claw=0.014, n=3)]

# trunk: z, top, yw, bottom, half width, exponents; a big rounded heap of loose feathers
TRUNK = [
    (-0.62, 1.32, 1.28, 1.23, 0.03, 2.0, 2.0),
    (-0.54, 1.4, 1.26, 1.1, 0.13, 2.0, 2.0),
    (-0.4, 1.48, 1.23, 0.98, 0.23, 2.1, 2.0),
    (-0.22, 1.53, 1.21, 0.92, 0.29, 2.2, 2.1),
    (-0.02, 1.545, 1.21, 0.9, 0.305, 2.3, 2.2),
    (0.16, 1.51, 1.22, 0.92, 0.28, 2.2, 2.2),
    (0.3, 1.44, 1.24, 1.0, 0.21, 2.1, 2.1),
    (0.4, 1.36, 1.26, 1.12, 0.12, 2.0, 2.0),
    (0.45, 1.31, 1.27, 1.22, 0.04, 2.0, 2.0),
]
WING_EDGE = [(-0.62, 1.26), (-0.45, 1.16), (-0.25, 1.1), (-0.05, 1.1), (0.12, 1.14), (0.26, 1.22)]
WING_T = 0.02
NECK_KEYS = [
    (1.18, 0.28, 0.12, 0.12, 0.115, 2.0, 2.0),
    (1.3, 0.35, 0.078, 0.078, 0.074, 2.0, 2.0),
    (1.45, 0.39, 0.056, 0.056, 0.053, 2.0, 2.0),
    (1.65, 0.405, 0.046, 0.046, 0.044, 2.0, 2.0),
    (1.9, 0.418, 0.04, 0.04, 0.039, 2.0, 2.0),
    (2.1, 0.428, 0.037, 0.037, 0.036, 2.0, 2.0),
    (2.24, 0.432, 0.036, 0.036, 0.035, 2.0, 2.0),
    (2.29, 0.44, 0.034, 0.034, 0.034, 2.0, 2.0),
]
# the bill: a loft along z, flat and broad with a rounded tip
BILL = [
    (0.5, 2.288, 2.268, 2.245, 0.03, 2.4, 2.2),
    (0.53, 2.282, 2.266, 2.248, 0.03, 2.6, 2.3),
    (0.56, 2.275, 2.263, 2.25, 0.027, 2.8, 2.4),
    (0.585, 2.27, 2.261, 2.252, 0.02, 2.6, 2.3),
    (0.602, 2.266, 2.259, 2.253, 0.009, 2.2, 2.2),
]


def _interp(tab, z):
    zz = np.array([k[0] for k in tab], F); yy = np.array([k[1] for k in tab], F)
    return np.interp(z, zz, yy).astype(F)


# ---------- body ----------
def trunk(P):
    Q = mirror(P)
    y, z = Q[:, 1], Q[:, 2]
    d = loft(Q, TRUNK)
    # loose feathers: a soft lumpy outline
    d = d - 0.012 * (fbm(Q * 9, 2, 5) - 0.45)
    ye = _interp(WING_EDGE, z)
    w = smax(d - WING_T, ye - y, 0.006)
    w = smax(w, z - (0.3 + 0.5 * (y - 1.2)), 0.04)
    return smin(d, w, 0.006)


def neck(P):
    return sweep(mirror(P), NECK_KEYS, n=120)


def head(P):
    Q = mirror(P)
    d = ellipsoid(Q, V(0, 2.293, 0.462), V(0.047, 0.042, 0.068))                       # flat-topped skull
    d = smax(d, Q[:, 1] - 2.322, 0.02)
    d = smin(d, ellipsoid(Q, V(0, 2.262, 0.49), V(0.036, 0.03, 0.045)), 0.02)            # jaw into the bill
    return d


def bill(P):
    Q = mirror(P)
    d = loft(Q, BILL)
    yt = 2.264 - 0.08 * (Q[:, 2] - 0.5)
    d = d + groove(Q[:, 1] - yt, 0.0012, 0.0012) * sstep(0.5, 0.51, Q[:, 2])
    # the nostrils: oval pits half way along the top
    nq = np.sqrt(((Q[:, 2] - 0.54) / 0.012) ** 2 + ((np.abs(Q[:, 0]) - 0.012) / 0.0045) ** 2)
    d = d + 0.003 * sstep(1.0, 0.4, nq) * sstep(2.27, 2.278, Q[:, 1])
    return d


def eye_parts(P):
    Q = mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0, -0.003), V(EYE_R + 0.006, EYE_R + 0.006, EYE_R + 0.003))
    ap = np.sqrt(s * s + u * u) - LID_R
    carve = smax(ap, -(g + 0.003), 0.002)
    ball = length(D) - EYE_R * 0.92
    return carve, lids, ball


# ---------- legs ----------
def drum(P):
    """the huge bare thigh and the shin down to the ankle"""
    Q = mirror(P)
    th = round_cone(Q, V(0.11, 1.08, 0.0), SHIN + V(0, -0.01, -0.01), 0.12, 0.085)
    sh = round_cone(Q, SHIN + V(0, -0.04, -0.02), HMETA + V(0, 0.03, 0.0), 0.075, 0.034)
    return smin(th, sh, 0.06)


def tarsus(P):
    Q = mirror(P)
    j = ellipsoid(Q, HMETA + V(0, 0.0, 0.005), V(0.038, 0.05, 0.042))                    # the ankle
    t = B.flat_cone(Q, HMETA + V(0, -0.02, 0.0), HPAW + V(0, 0.03, -0.01), 0.032, 0.028, 0.85, up=(1, 0, 0))
    pad = ellipsoid(Q, HPAW + V(0, -0.005, 0.01), V(0.04, 0.025, 0.05))
    return smin(smin(j, t, 0.03), pad, 0.03)


def feet(P):
    Q = mirror(P)
    tt, cl, _ = B.toes(Q, FOOT, TOES)
    return tt, cl, np.full(len(Q), 1.0, F)


def arm(P):
    Q = mirror(P)
    return B.wing_arm(Q, [SH + V(-0.05, -0.01, -0.01), SH + V(0.08, 0, 0), EL, WR, WT], [0.05, 0.08, 0.085, 0.07, 0.03],
                      [0.018, 0.024, 0.025, 0.02, 0.01], lead=0.62)


# ---------- assembly ----------
def grid(h):
    lo, hi = BOUNDS
    xs = B.axis_steps(0.0, hi[0], [(0.0, 0.06, h * 0.35), (0.06, 0.22, h * 0.5), (0.22, 0.7, h * 1.2)], h)
    ys = B.axis_steps(lo[1], hi[1], [(lo[1], 0.1, h * 0.35), (0.1, 0.9, h * 1.0), (2.2, 2.36, h * 0.35)], h)
    zs = B.axis_steps(lo[2], hi[2], [(-0.15, 0.3, h * 0.5), (0.3, 0.64, h * 0.4)], h)
    return xs, ys, zs


HEAD_BOX = (V(-0.1, 2.18, 0.34), V(0.1, 2.37, 0.66))
NECK_BOX = (V(-0.16, 1.05, 0.12), V(0.16, 2.35, 0.55))
LEG_BOX = (V(-0.3, -0.003, -0.2), V(0.3, 1.22, 0.32))
ARM_BOX = (V(0.1, 1.25, 0.0), V(0.7, 1.39, 0.22))
EYE_BOX = (V(-EYE_C[0] - 0.04, EYE_C[1] - 0.04, EYE_C[2] - 0.04), EYE_C + V(0.04, 0.04, 0.04))
TRUNK_BOX = (V(-0.42, 0.82, -0.72), V(0.42, 1.62, 0.52))


def parts(P):
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    ft, cl, wb = local_n(P, *LEG_BOX, feet, 3)
    return {'trunk': local(P, *TRUNK_BOX, trunk), 'neck': local(P, *NECK_BOX, neck), 'head': local(P, *HEAD_BOX, head),
            'bill': local(P, *HEAD_BOX, bill), 'lids': li, 'ball': ba, 'carve': ca,
            'drum': local(P, *LEG_BOX, drum), 'tarsus': local(P, *LEG_BOX, tarsus), 'toes': ft, 'claws': cl, 'web': wb,
            'arm': local(mirror(P), *ARM_BOX, arm)}


def shape(P):
    d = local(P, *TRUNK_BOX, trunk)
    d = smin(d, local(P, *NECK_BOX, neck), 0.06)
    h = local(P, *HEAD_BOX, head)
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    h = smin(h, li, 0.008)
    h = smax(h, -ca, 0.002)
    h = smin(h, ba, 0.0012)
    h = smin(h, local(P, *HEAD_BOX, bill), 0.012)
    d = smin(d, h, 0.03)
    lg = smin(local(P, *LEG_BOX, drum), local(P, *LEG_BOX, tarsus), 0.02)
    ft, cl, wb = local_n(P, *LEG_BOX, feet, 3)
    lg = smin(lg, smin(ft, cl, 0.004), 0.025)
    d = smin(d, lg, 0.05)
    d = smin(d, local(mirror(P), *ARM_BOX, arm), 0.04)
    return d


def _head_region(Pm):
    return (Pm[:, 1] > 2.2) & (Pm[:, 2] > 0.36)


def uv_regions(P):
    Pm = mirror(P)
    lab = np.full(len(P), 2)
    lab[(Pm[:, 1] > 1.32) & (Pm[:, 2] > 0.25)] = 1
    lab[Pm[:, 1] < 0.95] = 3
    lab[Pm[:, 1] < 0.55] = 4
    lab[(Pm[:, 0] > 0.32) & (Pm[:, 1] > 1.22)] = 5
    lab[_head_region(Pm)] = 0
    return lab


def uv_weight(P):
    lab = uv_regions(P)
    return np.choose(lab, [2.2, 1.1, 0.85, 1.0, 1.0, 0.4]).astype(F)


def lowpoly_fix(bm, hi):
    from scipy.spatial import cKDTree
    hv = np.asarray(hi['v'], np.float64)
    tree = cKDTree(hv)
    co = np.array([list(v.co) for v in bm.verts], np.float64)
    dist, ix = tree.query(co)
    far = np.where(dist > 0.008)[0]
    bm.verts.ensure_lookup_table()
    for k in far:
        bm.verts[k].co = hv[ix[k]].tolist()
    print(f'lowpoly_fix: {len(far)} vertices put back on the sculpt')


# ---------- skinning ----------
WEIGHT_SMOOTH = (0, 0)
SPINE = ['tail', 'hips', 'neck', 'neck2', 'neck3', 'head']


def _spine_u(P):
    y, z = P[:, 1], P[:, 2]
    ut = 1.5 + np.clip((z + 0.48) / 0.12, -1, 0)
    un = np.interp(y, [1.18, 1.3, 1.62, 1.96, 2.25, 2.4], [1.5, 2.0, 3.0, 4.0, 5.0, 6.0]).astype(F)
    yn = y - 1.34 - 0.8 * np.maximum(0, 0.3 - z)
    k = sstep(0.0, 0.06, yn)
    return ut * (1 - k) + un * k


WCFG = dict(groups=[('body', ['trunk', 'neck']), ('head', ['head', 'bill', 'lids']), ('drum', ['drum']), ('tarsus', ['tarsus']),
                    ('foot', ['toes', 'claws']), ('arm', ['arm'])],
            bias={'body': 0.006}, spine=SPINE, spine_u=_spine_u, head_u=5.0, knee=(0.9, 0.98), hipb=(1.02, 1.1, 0.75),
            ankle_d=(0.62, 0.57), ankle=(0.52, 0.6), pad=(0.09, 0.05), toe_up=(0.05, 0.08), arm=(SH, EL, WR, WT), arm_root=(0.3, 0.24))


def fix_weights(W, wpos, names, G, weld):
    P = wpos.astype(F)
    c = parts(P)
    Wn = B.part_weights(W, wpos, names, c, WCFG)
    f = _own(c)['arm'] * (c['arm'] < 0.02) * sstep(0.29, 0.24, np.abs(P[:, 0]))
    hip = np.zeros_like(Wn[0]); hip[list(names).index('hips')] = 1
    return Wn * (1 - f[:, None]) + hip[None, :] * f[:, None]


def bone_tips(P):
    t = {'hips': P['neck'], 'tail': TAILB + V(0, 0.0, -0.2), 'neck': P['neck2'], 'neck2': P['neck3'], 'neck3': P['head'], 'head': MOUTH}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, -0.01, 0.16)) * m
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
    k = 0.4 * R['trunk'] + 0.6 * R['neck'] + 0.8 * R['head'] + 0.8 * R['bill'] + 0.85 * R['lids']
    k += 0.56 * R['drum'] + 0.66 * R['tarsus'] + 0.76 * (R['toes'] + R['claws']) + 0.2 * R['arm']
    rim = sstep(EYE_R + 0.012, EYE_R + 0.003, de) * sstep(EYE_R * 0.9, EYE_R * 1.0, de) * 0.85
    return np.maximum(k, rim) * (1 - ball)


# ---------- plumage and skin paint ----------
K = {
    'black': hexc(0x1C1A19), 'blackHi': hexc(0x34302C), 'white': hexc(0xF0EDE6), 'skin': hexc(0xC87A72), 'skinPale': hexc(0xA88880),
    'down': hexc(0x847A74), 'scute': hexc(0xC8706E), 'bill': hexc(0xD6B496), 'billTip': hexc(0x8E7A68), 'claw': hexc(0x4A3E34),
    'lash': hexc(0x241C16),
}


def _wing_mask(Pm, R=None):
    y, z = Pm[:, 1], Pm[:, 2]
    ye = _interp(WING_EDGE, z)
    on = sstep(ye - 0.004, ye + 0.008, y) * sstep(0.3 + 0.5 * (y - 1.2) + 0.02, 0.3 + 0.5 * (y - 1.2) - 0.04, z)
    on = on * sstep(0.1, 0.18, np.abs(Pm[:, 0]))
    return on * (R['trunk'] if R is not None else sstep(1.55, 1.5, y))


def _flow(P, N, R, wing=False):
    fl = np.zeros((len(P), 3), F)
    side = sat(-N[:, 1] * 0.6 + 0.2)
    fl[:, 1] = -0.5 - 0.6 * side
    fl[:, 2] = -1.0
    nk = R['neck']
    fl[:, 1] = fl[:, 1] * (1 - nk) - nk
    fl[:, 2] = fl[:, 2] * (1 - nk)
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    fl[:, 1] = fl[:, 1] * (1 - hd)
    fl[:, 2] = fl[:, 2] * (1 - hd) - hd
    dr = R['drum']
    fl[:, 1] = fl[:, 1] * (1 - dr) - dr
    ar = R['arm']
    fl[:, 0] = fl[:, 0] * (1 - ar) + 0.3 * ar
    fl[:, 1] *= (1 - ar)
    fl[:, 2] = fl[:, 2] * (1 - ar) - ar
    return fl / np.maximum(np.linalg.norm(fl, axis=1, keepdims=True), 1e-9)


def _size(P, N, R):
    s = np.full(len(P), 0.045, F)
    wg = _wing_mask(P, R)
    s = s * (1 - wg) + wg * 0.06
    s = s * (1 - R['arm']) + R['arm'] * 0.02
    return s


def _fshape(P):
    # (loose, soft body feathers: long, narrow, ragged tips)
    return np.full(len(P), 0.8, F), np.full(len(P), 0.35, F), np.full(len(P), 1.5, F)


_pcache = {}


def _plum(P, N, c):
    key = (len(P), float(P[:7].sum()))
    if key not in _pcache:
        R = _own(c)
        Pm = mirror(P)
        Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
        fl = _flow(Pm, Nm, R, wing=True)
        sz = _size(Pm, Nm, R)
        feath = np.clip(R['trunk'] + R['arm'] + R['drum'] * sstep(1.0, 1.06, Pm[:, 1]), 0, 1)
        pl = B.plumage(Pm, Nm, fl, sz, _fshape, seed=46)
        _pcache.clear()
        _pcache[key] = (R, Pm, Nm, fl, sz, feath, pl)
    return _pcache[key]


def _zones(Pm, R):
    """the feathered body, the bare neck with its sparse down, the bare thighs and legs, and the white plumes of the
    folded wing where they show at its lower edge"""
    y, z = Pm[:, 1], Pm[:, 2]
    body = np.clip(R['trunk'] + R['arm'], 0, 1)
    # (the body feathers come a little way up the neck's base and down over the top of the thighs)
    body = np.maximum(body, R['neck'] * sstep(1.36, 1.3, y))
    body = np.maximum(body, R['drum'] * sstep(1.0, 1.06, y))
    wg = _wing_mask(Pm, R)
    ye = _interp(WING_EDGE, z)
    plume = wg * sstep(ye + 0.16 + 0.1 * sstep(-0.2, -0.5, z), ye + 0.06, y) * sstep(-0.05, -0.2, z)
    return body, plume


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n1 = fbm(Pm * 8, 3, 51)
    body, plume = _zones(Pm, R)
    # bare skin: pinkish, a little grayer up the neck, sparse gray down on the neck and the head
    col = mix(np.tile(K['skin'], (len(P), 1)), K['skinPale'], sstep(1.4, 2.0, y) * 0.6)
    dn = sstep(0.45, 0.75, fbm(Pm * 120, 2, 52)) * np.clip(R['neck'] + R['head'], 0, 1) * 0.45
    col = mix(col, K['down'], dn)
    # the body: loose black feathers with a little brown sheen on the edges
    cfa = np.maximum(pl['c'], 1e-4)
    bc = mix(np.tile(K['black'], (len(P), 1)), K['blackHi'], sstep(0.004, 0.0, pl['e']) * 0.6 * pl['cov'] + 0.2 * (n1 - 0.5))
    bc = mix(bc, K['white'], plume * (0.8 + 0.2 * n1))
    col = mix(col, bc, body)
    # the legs: big reddish scutes down the front of the tarsus and over the toes
    fr = sstep(-0.01, 0.015, z - (HMETA[2] + (HPAW[2] - HMETA[2]) * sat((HMETA[1] - y) / (HMETA[1] - HPAW[1]))))
    col = mix(col, K['scute'], np.clip(R['tarsus'] * fr + R['toes'] * sstep(0.02, 0.04, y), 0, 1) * 0.6)
    col = mix(col, K['claw'], R['claws'])
    # the bill: pale horn, darker at the tip and the edges
    bl = R['bill']
    bcol = mix(np.tile(K['bill'], (len(P), 1)), K['billTip'], sstep(0.57, 0.6, z) * 0.6 + sstep(0.4, 0.9, np.abs(Nm[:, 0])) * 0.2)
    col = mix(col, bcol, bl)
    # dark lids and lashes round the big eyes
    col = mix(col, K['lash'], R['lids'] * 0.6)
    rough = 0.8 + 0.06 * (n1 - 0.5)
    rough = np.where(body < 0.5, 0.58, rough)
    rough = np.where(bl > 0.5, 0.42, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _leg_h(P, c, R):
    Pm = mirror(P)
    rh, rg = B.reticulate(Pm, 0.008, 42)
    sh, sg = B.scutes(Pm, V(0, 1, 0), 0.028, 41)
    y, z = Pm[:, 1], Pm[:, 2]
    fr = sstep(-0.01, 0.015, z - (HMETA[2] + (HPAW[2] - HMETA[2]) * sat((HMETA[1] - y) / (HMETA[1] - HPAW[1]))))
    h = R['tarsus'] * ((0.0003 * rh - 0.0003 * rg) * (1 - fr) + fr * (0.0005 * sh - 0.0005 * sg))
    th, tg = B.scutes(Pm, nrm([0.1, 0, 1]), 0.022, 43)
    h += R['toes'] * (0.0004 * th - 0.0004 * tg)
    # goose bumps (feather follicles) on the bare thighs and the neck
    f1, _ = worley(Pm / 0.012, 53)
    h += (R['drum'] * sstep(1.0, 0.9, y) + R['neck'] * 0.6) * 0.0003 * sstep(0.35, 0.1, f1)
    return h


def detail(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    h = B.feather_height(pl, 0.06) * feath
    cf = pl['c']
    big = sstep(0.02, 0.04, cf) * pl['cov'] * feath
    bar = np.sin(2 * np.pi * (pl['a'] * 0.5 + np.abs(pl['b'])) / 0.004)
    h -= 0.0002 * sstep(0.3, 1.0, bar) * big
    h += 0.0001 * (fbm(Pm * 200, 2, 61) - 0.5) * np.clip(R['head'] + R['lids'], 0, 1)
    f1, _ = worley(Pm / 0.002, 62)
    h -= 0.00005 * sstep(0.3, 0.0, f1) * R['bill']
    return h + _leg_h(P, c, R)


def finish(C, ao, valid):
    return B.finish_ao(C, ao, 0.34)


# ---------- the chick (baby maps) ----------
KB = {'buff': hexc(0xC6A272), 'pale': hexc(0xDCC49A), 'dark': hexc(0x5E4630), 'leg': hexc(0xA89482), 'bill': hexc(0x9A8A78)}


def paint_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, _flow(Pm, Nm, R), Nm, 0.006, 73)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    col = mix(np.tile(KB['buff'], (len(P), 1)), KB['pale'], sstep(-0.2, -0.8, Nm[:, 1]) * 0.7)
    # dark brown stripes along the back and down the neck, spotted on the head
    st = sstep(0.55, 0.85, np.sin(np.abs(x) * 70 + 1.2 * fbm(Pm * 6, 2, 81)) * 0.5 + 0.5)
    col = mix(col, KB['dark'], st * sstep(-0.1, 0.4, Nm[:, 1]) * np.clip(R['trunk'] + R['neck'] + R['arm'], 0, 1) * 0.85)
    sp = sstep(0.5, 0.75, fbm(Pm * 70, 2, 82)) * np.clip(R['head'], 0, 1)
    col = mix(col, KB['dark'], sp * 0.8)
    col *= (0.76 + 0.34 * dn + 0.1 * tip)[:, None]
    col = mix(col, KB['bill'], R['bill'])
    lg = np.clip(R['tarsus'] + R['toes'] + R['claws'] + R['drum'] * sstep(1.0, 0.95, y), 0, 1)
    col = mix(col, KB['leg'], lg)
    col = mix(col, KB['dark'], R['lids'] * 0.5)
    rough = np.where(R['bill'] + lg > 0.5, 0.6, 0.93)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


BABY_NECK_Z = [(1.2, 0.3), (1.3, 0.34), (1.62, 0.4), (1.96, 0.42), (2.3, 0.44)]


def _baby_body(Q):
    d = ellipsoid(Q, V(0, 1.2, -0.06), V(0.3, 0.3, 0.46))
    return smin(d, sweep(Q, NECK_KEYS, n=120), 0.08)


def baby_offset(P, N, c):
    """the chick: a round ball of spiky down; the thighs thinner (the game's baby maps make the legs long and thick)"""
    R0 = _own(c)
    R = dict(R0); R['neck'] = np.zeros(len(P), F)
    R['drum'] = R0['drum'] * sstep(0.9, 1.0, P[:, 1]) * 0.5
    return B.baby_shape(P, N, R, _baby_body, (V(0.15, 0.9, 0.08), V(0.12, 1.06, 0.0), 0.07, 1.35), SH + V(-0.08, -0.05, -0.03), (0.012, 0.02), maxd=0.2)


def detail_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, _flow(Pm, Nm, R), Nm, 0.006, 73)
    return 0.0012 * (dn - 0.5) * feath + 0.5 * _leg_h(P, c, R)


# the chick's spiky down as fur shells (babyOnly), standing up more than other chicks'
FUR = dict(len=0.08, n=6, lean=0.22, tile=0.006, babyLen=1.0, babyLean=0.22, shade=0.86, babyOnly=True, quality=58)


def fur(P, N, c):
    return B.down_fur(P, c, FUR['len'], ['bill', 'tarsus', 'toes', 'claws', 'lids'],
                      {'head': 0.5, 'neck': 0.7, 'arm': 0.75, 'drum': 0.4}, (EYE_C, EYE_R), edge=0.01, seed=73)


def flow(P, N):
    return B.down_flow(sys.modules[__name__], P, N)


# ---------- feather blades (atlas cells, same order as the game's feather cells) ----------
def _vn(s, t, base, edge, k=0.5):
    return mix(np.tile(base, (len(s), 1)), edge, sstep(0.55, 1.0, np.abs(s)) * k)


def _cells():
    """the boy: white plumes in the wing and the tail, black coverts"""
    F_ = B.FeatherCell
    w, w2, bk, bk2 = hexc(0xF2EFE8), hexc(0xDCD8D0), hexc(0x1C1A19), hexc(0x3A3632)

    def plume(s, t, side):
        return mix(_vn(s, t, w, w2, 0.4), hexc(0xE8E4DC), sstep(0.0, 0.3, t) * 0.3)

    def cov(s, t, side):
        return _vn(s, t, bk, bk2, 0.5)

    return [F_('round', plume, w=0.86, outer=0.95, tip=1.0, shaft=hexc(0xE0DCD4)),
            F_('round', plume, w=0.86, outer=0.95, tip=1.0, shaft=hexc(0xE0DCD4)),
            F_('round', cov, w=0.85, outer=0.9, tip=0.9, shaft=hexc(0x2A2624)),
            F_('round', cov, w=0.85, outer=0.9, tip=1.1, shaft=hexc(0x2A2624)),
            F_('round', plume, w=0.86, outer=0.95, tip=1.0, shaft=hexc(0xE0DCD4)),
            F_('round', plume, w=0.9, outer=0.95, tip=1.1, shaft=hexc(0xE0DCD4)),
            F_('round', cov, w=0.8, outer=0.9, tip=0.9, shaft=hexc(0x2A2624)),
            F_('round', cov, w=0.8, outer=0.9, tip=0.8, shaft=hexc(0x2A2624))]


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = hexc(0xC6A272), hexc(0x8A6A48)
    def dn(s, t, side):
        return mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.5)
    return [F_('down', dn)] * 8


FEATHER_ATLAS = {'size': (1024, 512), 'out': (512, 256), 'cells': _cells, 'baby': _baby_cells, 'quality': (62, 62, 58),
                 'alpha_quality': 50}


def extra_maps(X):
    B.extra_maps(sys.modules[__name__], X)


def export_extra(meta, out_dir, work):
    B.export_extra(sys.modules[__name__], meta, out_dir, work)


MAP_QUALITY = (68, 52)
BABY_MAPS = {'size': 384, 'quality': (64, 50)}


def stats(P, N, c, col):
    return {'lidCol': 0x3A2C24}


def meta(st):
    r = EYE_R
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [0.8, -0.8, 0.12],
                'iris': 0x5A3A1C, 'irisR': 0.86, 'pupilR': 0.4, 'rim': 0x1A1008, 'lidCol': st['lidCol'], 'babyLidCol': 0x6A5038, 'lashes': True},
        'collar': {'at': ['neck', 'neck2', 0.3], 'babyAt': 0.4, 'hug': True, 'babyK': 1.6, 'lift': 0.35},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.1, 0.1, 0.1], 'flat': 0x2A2624,
    }
