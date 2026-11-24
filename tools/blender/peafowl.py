# Indian peafowl (round 16), the peacock: sculpted as a signed distance field around the game's peafowl skeleton
# (bird.py has the shared bird parts; the layout follows flamingo.py). Units are meters in game rig space (x left, y up,
# z forward, ground at y = 0). Made in the rig's bind pose: the wing arm sticks out flat to the side under the game's
# feather blades. A long body carried level with the folded wing over its side, a slender upright neck, a small head
# with a short stout bill, long legs with a spur. The train, the crest and the tail are the game's feather blades
# (eyespot feathers from this atlas, cell 5; the crest's tufted shafts, cell 6). Iridescent blue neck and breast with
# white stripes on the face, a bronze-green scaled back, barred buff and black wing coverts, rufous primaries, a dark
# belly. The peahen is peafowlf.py (her own colors on this mesh). The chick: tan down.
# Make it with: VOXEL=0.003 TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py peafowl sculpt export
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, loft, sweep, frame, fbm, vnoise, worley, length
import bird as B
from bird import local, local_n, mirror, groove, hexc, mix

ID = 'peafowl'
BOUNDS = (V(-0.48, -0.002, -0.42), V(0.48, 1.04, 0.37))
PATCHES = [
    (V(0.0, 0.96, 0.24), V(0.04, 1.03, 0.36), 0.0007),         # head, bill, eye
    (V(0.0, -0.002, -0.08), V(0.13, 0.025, 0.12), 0.0008),     # feet
]
BAKE_DIST = (0.006, 0.015, 0.08)
TAIL_RINGS = 0
PREV_HEAD = ((0, 0.99, 0.3), 0.06)    # (scratch preview framing)
DISSOLVE_DEGENERATE = True
UV_PACK = dict(shape_method='CONCAVE', rotate_method='ANY')
UV_AVERAGE = True

# ---------- landmarks (left side; bone pivots from the rig) ----------
HIPS, TAILB = V(0, 0.55, 0), V(0, 0.62, -0.26)
NECK, NECK2, NECK3, HEAD = V(0, 0.64, 0.2), V(0, 0.77, 0.25), V(0, 0.9, 0.27), V(0, 0.99, 0.28)
THIGH, SHIN, HMETA, HPAW = V(0.054, 0.5, -0.01), V(0.062, 0.4, 0.06), V(0.062, 0.18, -0.03), V(0.062, 0.012, 0.01)
SH, EL, WR, WT = V(0.09, 0.66, 0.12), V(0.194, 0.66, 0.12), V(0.324, 0.66, 0.12), V(0.4215, 0.66, 0.12)

EYE_C = V(0.0222, 1.0045, 0.3005)
EYE_R = 0.0058
EYE_DIR = nrm(V(0.9, 0.12, 0.38))
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_R = 0.0045
MOUTH = V(0, 0.983, 0.352)
FOOT = HPAW + V(0, 0.0, 0.003)
TOES = [dict(a=-30, len=0.072, r=0.0068, r1=0.0042, claw=0.013, n=3), dict(a=0, len=0.088, r=0.0072, r1=0.0045, claw=0.015, n=4),
        dict(a=30, len=0.07, r=0.0068, r1=0.0042, claw=0.013, n=3), dict(a=180, len=0.042, r=0.0058, r1=0.004, claw=0.011, lift=0.006, n=2, hind=True)]

TRUNK = [
    (-0.37, 0.64, 0.626, 0.612, 0.01, 2.0, 2.0),
    (-0.31, 0.664, 0.617, 0.57, 0.048, 2.0, 2.0),
    (-0.21, 0.69, 0.6, 0.505, 0.098, 2.1, 2.0),
    (-0.09, 0.702, 0.586, 0.462, 0.128, 2.3, 2.2),
    (0.03, 0.698, 0.58, 0.452, 0.134, 2.3, 2.3),
    (0.13, 0.684, 0.588, 0.476, 0.12, 2.2, 2.2),
    (0.2, 0.664, 0.6, 0.53, 0.088, 2.1, 2.0),
    (0.245, 0.646, 0.61, 0.578, 0.04, 2.0, 2.0),
]
WING_EDGE = [(-0.42, 0.64), (-0.32, 0.6), (-0.2, 0.56), (-0.06, 0.54), (0.06, 0.545), (0.14, 0.565)]
WING_T = 0.01
NECK_KEYS = [
    (0.56, 0.13, 0.078, 0.078, 0.073, 2.0, 2.0),
    (0.64, 0.2, 0.044, 0.046, 0.042, 2.0, 2.0),
    (0.72, 0.238, 0.031, 0.033, 0.03, 2.0, 2.0),
    (0.82, 0.26, 0.025, 0.027, 0.024, 2.0, 2.0),
    (0.92, 0.272, 0.022, 0.023, 0.021, 2.0, 2.0),
    (0.985, 0.277, 0.021, 0.021, 0.02, 2.0, 2.0),
]
BILL = [
    (0.31, 1.009, 0.995, 0.981, 0.0098, 2.2, 2.2),
    (0.325, 1.006, 0.994, 0.983, 0.0088, 2.3, 2.2),
    (0.338, 1.0, 0.991, 0.984, 0.0068, 2.4, 2.2),
    (0.348, 0.993, 0.988, 0.984, 0.0045, 2.3, 2.2),
    (0.354, 0.987, 0.985, 0.983, 0.002, 2.0, 2.0),
]
SPUR = (V(0.062, 0.08, -0.045), V(0.062, 0.072, -0.07))


def _interp(tab, z):
    zz = np.array([k[0] for k in tab], F); yy = np.array([k[1] for k in tab], F)
    return np.interp(z, zz, yy).astype(F)


# ---------- body ----------
def trunk(P):
    Q = mirror(P)
    y, z = Q[:, 1], Q[:, 2]
    d = loft(Q, TRUNK)
    d = smin(d, ellipsoid(Q, V(0, 0.585, 0.15), V(0.11, 0.1, 0.1)), 0.04)               # round breast
    ye = _interp(WING_EDGE, z)
    w = smax(d - WING_T, ye - y, 0.002)
    w = smax(w, z - (0.15 + 0.6 * (y - 0.55)), 0.015)
    Qs = Q * V(1, 2.2, 1)
    w = smin(w, round_cone(Qs, V(0.06, 0.65 * 2.2, -0.2), V(0.025, 0.66 * 2.2, -0.36), 0.022, 0.006), 0.012)
    return smin(d, w, 0.002)


def neck(P):
    return sweep(mirror(P), NECK_KEYS, n=100)


def head(P):
    Q = mirror(P)
    d = ellipsoid(Q, V(0, 1.0, 0.29), V(0.021, 0.023, 0.034))
    d = smin(d, ellipsoid(Q, V(0, 0.992, 0.306), V(0.016, 0.016, 0.02)), 0.008)
    return d


def bill(P):
    Q = mirror(P)
    d = loft(Q, BILL)
    yt = 0.993 - 0.2 * (Q[:, 2] - 0.31)
    d = d + groove(Q[:, 1] - yt, 0.0005, 0.0005) * sstep(0.31, 0.315, Q[:, 2])
    nq = np.sqrt(((Q[:, 2] - 0.322) / 0.004) ** 2 + ((Q[:, 1] - 0.999) / 0.0018) ** 2)
    d = d + 0.0009 * sstep(1.0, 0.4, nq) * sstep(0.004, 0.008, np.abs(Q[:, 0]))
    return d


def eye_parts(P):
    Q = mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0, -0.001), V(EYE_R + 0.0024, EYE_R + 0.0024, EYE_R + 0.0012))
    ap = np.sqrt(s * s + u * u) - LID_R
    carve = smax(ap, -(g + 0.001), 0.0007)
    ball = length(D) - EYE_R * 0.92
    return carve, lids, ball


# ---------- legs ----------
def drum(P):
    Q = mirror(P)
    th = round_cone(Q, V(0.05, 0.51, -0.01), SHIN + V(0, -0.01, -0.006), 0.058, 0.044)
    sh = round_cone(Q, SHIN + V(0, -0.03, -0.01), HMETA + V(0, 0.03, 0.0), 0.038, 0.014)
    return smin(th, sh, 0.03)


def tarsus(P):
    Q = mirror(P)
    j = round_cone(Q, HMETA + V(0, 0.03, 0.0), HMETA + V(0, -0.01, 0.0), 0.012, 0.0115)
    t = B.flat_cone(Q, HMETA + V(0, -0.006, 0.0), HPAW + V(0, 0.008, -0.002), 0.0105, 0.0095, 0.8, up=(1, 0, 0))
    pad = ellipsoid(Q, HPAW + V(0, -0.001, 0.002), V(0.012, 0.008, 0.014))
    spur = round_cone(Q, SPUR[0], SPUR[1], 0.0045, 0.0012)
    return smin(smin(smin(j, t, 0.008), pad, 0.006), spur, 0.003)


def feet(P):
    Q = mirror(P)
    tt, cl, _ = B.toes(Q, FOOT, [t for t in TOES if not t.get('hind')])
    ht, hc, _ = B.toes(Q, HPAW + V(0, 0.01, -0.008), [t for t in TOES if t.get('hind')], ground=0.006)
    return np.minimum(tt, ht), np.minimum(cl, hc), np.full(len(Q), 1.0, F)


def arm(P):
    Q = mirror(P)
    return B.wing_arm(Q, [SH + V(-0.025, -0.006, -0.006), SH + V(0.06, 0, 0), EL, WR, WT], [0.026, 0.045, 0.048, 0.038, 0.014],
                      [0.009, 0.012, 0.013, 0.01, 0.005], lead=0.62)


# ---------- assembly ----------
def grid(h):
    lo, hi = BOUNDS
    xs = B.axis_steps(0.0, hi[0], [(0.0, 0.035, h * 0.5), (0.035, 0.11, h * 0.6), (0.11, 0.48, h * 1.3)], h)
    ys = B.axis_steps(lo[1], hi[1], [(lo[1], 0.025, h * 0.3), (0.06, 0.1, h * 0.5), (0.95, 1.035, h * 0.4)], h)
    zs = B.axis_steps(lo[2], hi[2], [(-0.09, 0.11, h * 0.55), (0.24, 0.36, h * 0.45)], h)
    return xs, ys, zs


HEAD_BOX = (V(-0.05, 0.94, 0.22), V(0.05, 1.04, 0.37))
NECK_BOX = (V(-0.11, 0.48, 0.06), V(0.11, 1.03, 0.34))
LEG_BOX = (V(-0.14, -0.003, -0.1), V(0.14, 0.56, 0.13))
ARM_BOX = (V(0.03, 0.63, 0.05), V(0.48, 0.69, 0.18))
EYE_BOX = (V(-EYE_C[0] - 0.016, EYE_C[1] - 0.016, EYE_C[2] - 0.016), EYE_C + V(0.016, 0.016, 0.016))
TRUNK_BOX = (V(-0.2, 0.4, -0.42), V(0.2, 0.74, 0.3))


def _parts_o(P):
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    ft, cl, wb = local_n(P, *LEG_BOX, feet, 3)
    return {'trunk': local(P, *TRUNK_BOX, trunk), 'neck': local(P, *NECK_BOX, neck), 'head': local(P, *HEAD_BOX, head),
            'bill': local(P, *HEAD_BOX, bill), 'lids': li, 'ball': ba, 'carve': ca,
            'drum': local(P, *LEG_BOX, drum), 'tarsus': local(P, *LEG_BOX, tarsus), 'toes': ft, 'claws': cl, 'web': wb,
            'arm': local(mirror(P), *ARM_BOX, arm)}


def _shape_o(P):
    d = local(P, *TRUNK_BOX, trunk)
    d = smin(d, local(P, *NECK_BOX, neck), 0.035)
    h = local(P, *HEAD_BOX, head)
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    h = smin(h, li, 0.003)
    h = smax(h, -ca, 0.0008)
    h = smin(h, ba, 0.0005)
    h = smin(h, local(P, *HEAD_BOX, bill), 0.004)
    d = smin(d, h, 0.012)
    lg = smin(local(P, *LEG_BOX, drum), local(P, *LEG_BOX, tarsus), 0.008)
    ft, cl, wb = local_n(P, *LEG_BOX, feet, 3)
    lg = smin(lg, smin(ft, cl, 0.0012), 0.006)
    d = smin(d, lg, 0.02)
    d = smin(d, local(mirror(P), *ARM_BOX, arm), 0.016)
    return d


def _uv_regions_o(P):
    Pm = mirror(P)
    lab = np.full(len(P), 2)
    lab[(Pm[:, 1] > 0.6) & (Pm[:, 2] > 0.16)] = 1
    lab[Pm[:, 1] < 0.42] = 3
    lab[(Pm[:, 0] > 0.13) & (Pm[:, 1] > 0.62)] = 5
    lab[(Pm[:, 1] > 0.955) & (Pm[:, 2] > 0.24)] = 0
    return lab


def _uv_weight_o(P):
    lab = _uv_regions_o(P)
    return np.choose(lab, [2.6, 1.15, 0.9, 1.0, 1.0, 0.4]).astype(F)


def lowpoly_fix(bm, hi):
    from scipy.spatial import cKDTree
    hv = np.asarray(hi['v'], np.float64)
    tree = cKDTree(hv)
    co = np.array([list(v.co) for v in bm.verts], np.float64)
    dist, ix = tree.query(co)
    far = np.where(dist > 0.004)[0]
    bm.verts.ensure_lookup_table()
    for k in far:
        bm.verts[k].co = hv[ix[k]].tolist()
    print(f'lowpoly_fix: {len(far)} vertices put back on the sculpt')


# ---------- skinning ----------
WEIGHT_SMOOTH = (0, 0)
SPINE = ['tail', 'hips', 'neck', 'neck2', 'neck3', 'head']


def _spine_u(P):
    y, z = P[:, 1], P[:, 2]
    ut = 1.5 + np.clip((z + 0.26) / 0.07, -1, 0)
    un = np.interp(y, [0.56, 0.64, 0.77, 0.9, 0.985, 1.05], [1.5, 2.0, 3.0, 4.0, 5.0, 6.0]).astype(F)
    yn = y - 0.66 - 0.8 * np.maximum(0, 0.2 - z)
    k = sstep(0.0, 0.03, yn)
    return ut * (1 - k) + un * k


WCFG = dict(groups=[('body', ['trunk', 'neck']), ('head', ['head', 'bill', 'lids']), ('drum', ['drum']), ('tarsus', ['tarsus']),
                    ('foot', ['toes', 'claws']), ('arm', ['arm'])],
            bias={'body': 0.003}, spine=SPINE, spine_u=_spine_u, head_u=5.0, knee=(0.38, 0.42), hipb=(0.47, 0.52, 0.75),
            ankle_d=(0.22, 0.19), ankle=(0.17, 0.21), pad=(0.03, 0.014), toe_up=(0.016, 0.03), arm=(SH, EL, WR, WT), arm_root=(0.15, 0.115))


def _fix_weights_o(W, wpos, names, G, weld):
    P = wpos.astype(F)
    c = _parts_o(P)
    Wn = B.part_weights(W, wpos, names, c, WCFG)
    f = _own(c)['arm'] * (c['arm'] < 0.01) * sstep(0.145, 0.11, np.abs(P[:, 0]))
    hip = np.zeros_like(Wn[0]); hip[list(names).index('hips')] = 1
    return Wn * (1 - f[:, None]) + hip[None, :] * f[:, None]


def bone_tips(P):
    t = {'hips': P['neck'], 'tail': TAILB + V(0, 0.0, -0.12), 'neck': P['neck2'], 'neck2': P['neck3'], 'neck3': P['head'], 'head': MOUTH}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, -0.004, 0.09)) * m
        t['wing' + s] = P['wfore' + s]; t['wfore' + s] = P['whand' + s]; t['whand' + s] = WT * m
    return t


OWN_KEYS = ['trunk', 'neck', 'head', 'bill', 'drum', 'tarsus', 'toes', 'claws', 'arm', 'lids']


def _own(c):
    D = np.stack([c[k] for k in OWN_KEYS], 1)
    o = np.argmin(D, 1)
    return {k: (o == i).astype(F) for i, k in enumerate(OWN_KEYS)}


def _keep_o(P):
    Pm = mirror(P)
    R = _own(_parts_o(P))
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    ball = sstep(EYE_R * 0.97, EYE_R * 0.8, de)
    k = 0.42 * R['trunk'] + 0.62 * R['neck'] + 0.8 * R['head'] + 0.82 * R['bill'] + 0.85 * R['lids']
    k += 0.56 * R['drum'] + 0.72 * R['tarsus'] + 0.78 * (R['toes'] + R['claws']) + 0.2 * R['arm']
    rim = sstep(EYE_R + 0.005, EYE_R + 0.0015, de) * sstep(EYE_R * 0.9, EYE_R * 1.0, de) * 0.85
    return np.maximum(k, rim) * (1 - ball)


# ---------- plumage and skin paint ----------
K = {
    'blue': hexc(0x1C4CB8), 'blueHi': hexc(0x2A6CDA), 'blueDk': hexc(0x14307A), 'teal': hexc(0x1A6A6A), 'green': hexc(0x3E7A2E),
    'bronze': hexc(0x8A7A2E), 'scale': hexc(0x142018), 'buff': hexc(0xC8AA7A), 'barDk': hexc(0x241E16), 'rufous': hexc(0xA4502A),
    'belly': hexc(0x1A221C), 'thigh': hexc(0x8A7A62), 'white': hexc(0xF0EEE8), 'skin': hexc(0xE8E6E0), 'leg': hexc(0x8A7E70),
    'bill': hexc(0x9A8E7E), 'claw': hexc(0x4A4038),
}


def _wing_mask(Pm, R=None):
    y, z = Pm[:, 1], Pm[:, 2]
    ye = _interp(WING_EDGE, z)
    on = sstep(ye - 0.002, ye + 0.004, y) * sstep(0.15 + 0.6 * (y - 0.55) + 0.01, 0.15 + 0.6 * (y - 0.55) - 0.02, z)
    on = on * sstep(0.03, 0.06, np.abs(Pm[:, 0]))
    return on * (R['trunk'] if R is not None else sstep(0.72, 0.69, y))


def _flow(P, N, R, wing=False):
    fl = np.zeros((len(P), 3), F)
    side = sat(-N[:, 1] * 0.6 + 0.2)
    fl[:, 1] = -0.2 - 0.55 * side
    fl[:, 2] = -1.0
    y, z = P[:, 1], P[:, 2]
    breast = sstep(0.08, 0.2, z) * sstep(0.62, 0.55, y)
    fl[:, 1] -= 1.6 * breast
    fl[:, 2] += 0.6 * breast
    wg = _wing_mask(P, R) if wing else np.zeros(len(P), F)
    fl[:, 1] = fl[:, 1] * (1 - wg) - 0.15 * wg
    fl[:, 2] = fl[:, 2] * (1 - wg) - 1.0 * wg
    nk = R['neck']
    fl[:, 1] = fl[:, 1] * (1 - nk) - nk
    fl[:, 2] = fl[:, 2] * (1 - nk) - 0.15 * nk
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    fl[:, 1] = fl[:, 1] * (1 - hd)
    fl[:, 2] = fl[:, 2] * (1 - hd) - hd
    dr = R['drum']
    fl[:, 1] = fl[:, 1] * (1 - dr) - dr
    fl[:, 2] = fl[:, 2] * (1 - dr) - 0.2 * dr
    ar = R['arm']
    fl[:, 0] = fl[:, 0] * (1 - ar) + 0.3 * ar
    fl[:, 1] *= (1 - ar)
    fl[:, 2] = fl[:, 2] * (1 - ar) - ar
    return fl / np.maximum(np.linalg.norm(fl, axis=1, keepdims=True), 1e-9)


def _size(P, N, R):
    y, z = P[:, 1], P[:, 2]
    s = np.full(len(P), 0.018, F)
    s = s - 0.005 * sstep(-0.3, -0.8, N[:, 1])
    wg = _wing_mask(P, R)
    s = s * (1 - wg) + wg * (0.022 + 0.01 * sstep(0.0, -0.25, z))
    nk = R['neck']
    s = s * (1 - nk) + nk * np.interp(y, [0.58, 0.7, 0.9], [0.01, 0.006, 0.004]).astype(F)
    hd = R['head'] + R['lids']
    s = s * (1 - hd) + hd * 0.0026
    s = s * (1 - R['drum']) + R['drum'] * 0.008
    s = s * (1 - R['arm']) + R['arm'] * 0.01
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
        feath = np.clip(R['trunk'] + R['neck'] + R['head'] + R['drum'] * sstep(0.26, 0.3, Pm[:, 1]) + R['arm'], 0, 1)
        pl = B.plumage(Pm, Nm, fl, sz, None, seed=56)
        _pcache.clear()
        _pcache[key] = (R, Pm, Nm, fl, sz, feath, pl)
    return _pcache[key]


def _zones(Pm, Nm, R):
    """where each color goes: the blue neck and breast (down to the front of the body), the scaled back, the folded
    wing (barred coverts, rufous primaries at its rear), the dark belly, the buff thighs, the face's white stripes"""
    x, y, z = np.abs(Pm[:, 0]), Pm[:, 1], Pm[:, 2]
    body = np.clip(R['trunk'], 0, 1)
    blue = np.clip(R['neck'] + R['head'] + R['lids'], 0, 1)
    blue = np.maximum(blue, body * sstep(0.08, 0.16, z + 0.3 * (y - 0.6)) * sstep(0.48, 0.54, y))
    back = body * (1 - blue) * sstep(-0.2, 0.3, Nm[:, 1])
    wg = _wing_mask(Pm, R)
    belly = body * (1 - blue) * sstep(0.0, -0.5, Nm[:, 1])
    thigh = R['drum'] * sstep(0.2, 0.24, y)
    # the face: a white stripe over the eye and a white crescent under it, on bare white skin round the eye
    de = Pm - EYE_C
    ab = sstep(0.0026, 0.0012, np.abs(de[:, 1] - 0.0052)) * sstep(0.022, 0.006, np.abs(de[:, 2] + 0.002)) * sstep(0.01, 0.016, x)
    be = sstep(0.0026, 0.0012, np.abs(de[:, 1] + 0.0058)) * sstep(0.024, 0.008, np.abs(de[:, 2] - 0.002)) * sstep(0.01, 0.016, x)
    ring = sstep(EYE_R + 0.003, EYE_R + 0.0016, np.linalg.norm(de, axis=1))
    face = np.clip(ab + be + ring, 0, 1) * np.clip(R['head'] + R['lids'], 0, 1)
    return blue, back, wg, belly, thigh, face


def _paint_o(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n1 = fbm(Pm * 25, 3, 61)
    blue, back, wg, belly, thigh, face = _zones(Pm, Nm, R)
    cfa = np.maximum(pl['c'], 1e-4)
    rel = np.clip(-pl['a'] / (cfa * 2.0), 0, 1)
    # the scaled back: each feather bronze-green with a dark margin round its tip
    sc = mix(np.tile(K['green'], (len(P), 1)), K['bronze'], sstep(0.4, 0.9, n1) * 0.5 + rel * 0.3)
    sc = mix(sc, K['scale'], sstep(0.0035, 0.0012, pl['e']) * pl['cov'] * 0.85)
    col = mix(np.tile(K['belly'], (len(P), 1)), sc, back)
    # the iridescent blue neck and breast, a greener sheen low on the neck behind
    bc = mix(np.tile(K['blue'], (len(P), 1)), K['blueHi'], sstep(0.2, 0.8, Nm[:, 1]) * 0.35 + 0.15 * (n1 - 0.5))
    bc = mix(bc, K['teal'], sstep(-0.1, -0.6, Nm[:, 2]) * sstep(0.85, 0.66, y) * 0.5)
    bc = mix(bc, K['blueDk'], sstep(0.003, 0.0008, pl['e']) * pl['cov'] * 0.35)
    col = mix(col, bc, blue)
    # the folded wing: barred buff and black coverts, the rufous primaries showing at its rear
    bar = sstep(0.35, 0.65, np.sin(2 * np.pi * pl['a'] / (cfa * 0.32)) * 0.5 + 0.5) * pl['cov']
    wc = mix(np.tile(K['buff'], (len(P), 1)), K['barDk'], bar * 0.8)
    ye = _interp(WING_EDGE, z)
    pr = sstep(-0.12, -0.22, z) * sstep(ye + 0.06, ye + 0.02, y)
    wc = mix(wc, K['rufous'], pr)
    col = mix(col, wc, wg)
    col = mix(col, (K['thigh'] * 0.85 + K['barDk'] * 0.15), thigh * (1 - blue))
    col = mix(col, K['white'], face)
    col *= (0.97 + 0.05 * pl['id'] + 0.03 * (n1 - 0.5))[:, None]
    bl = R['bill']
    col = mix(col, mix(np.tile(K['bill'], (len(P), 1)), K['barDk'], sstep(0.345, 0.354, z) * 0.4), bl)
    lg = np.clip(R['tarsus'] + R['toes'] + R['drum'] * sstep(0.24, 0.2, y), 0, 1)
    col = mix(col, K['leg'], lg)
    col = mix(col, K['claw'], R['claws'])
    rough = 0.6 + 0.08 * (n1 - 0.5)
    rough = np.where(blue > 0.5, 0.48, rough)
    rough = np.where(bl > 0.5, 0.42, rough)
    rough = np.where(lg > 0.5, 0.55, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _leg_h(P, c, R):
    Pm = mirror(P)
    rh, rg = B.reticulate(Pm, 0.0022, 42)
    sh, sg = B.scutes(Pm, V(0, 1, 0), 0.006, 41)
    y, z = Pm[:, 1], Pm[:, 2]
    fr = sstep(-0.004, 0.004, z - (HMETA[2] + (HPAW[2] - HMETA[2]) * sat((HMETA[1] - y) / (HMETA[1] - HPAW[1]))))
    h = R['tarsus'] * ((0.00006 * rh - 0.00007 * rg) * (1 - fr) + fr * (0.0001 * sh - 0.0001 * sg))
    th, tg = B.scutes(Pm, nrm([0.15, 0, 1]), 0.004, 43)
    h += R['toes'] * (0.00008 * th - 0.00008 * tg)
    return h


def _detail_o(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    h = B.feather_height(pl, 0.04) * feath * (1 - 0.5 * hd)
    h += 0.00003 * (fbm(Pm * 500, 2, 61) - 0.5) * hd
    f1, _ = worley(Pm / 0.0008, 62)
    h -= 0.000015 * sstep(0.3, 0.0, f1) * R['bill']
    return h + _leg_h(P, c, R)


def finish(C, ao, valid):
    return B.finish_ao(C, ao, 0.34)


# ---------- the chick (baby maps) ----------
KB = {'tan': hexc(0xC8A472), 'pale': hexc(0xE4D2AE), 'dark': hexc(0x8A6640), 'leg': hexc(0xB8A890), 'bill': hexc(0x9A8A76)}


def _paint_baby_o(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, _flow(Pm, Nm, R), Nm, 0.003, 73)
    col = mix(np.tile(KB['tan'], (len(P), 1)), KB['pale'], sstep(-0.2, -0.8, Nm[:, 1]) * 0.7)
    col = mix(col, KB['dark'], sstep(0.3, 0.8, Nm[:, 1]) * 0.45)
    col *= (0.76 + 0.34 * dn + 0.1 * tip)[:, None]
    col = mix(col, KB['bill'], R['bill'])
    lg = np.clip(R['tarsus'] + R['toes'] + R['claws'], 0, 1)
    col = mix(col, KB['leg'], lg)
    col = mix(col, KB['dark'], R['lids'] * 0.5)
    rough = np.where(R['bill'] + lg > 0.5, 0.6, 0.93)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _baby_body(Q):
    d = ellipsoid(Q, V(0, 0.58, -0.02), V(0.15, 0.14, 0.24))
    return smin(d, sweep(Q, NECK_KEYS, n=100), 0.05)


def _baby_offset_o(P, N, c):
    R0 = _own(c)
    R = dict(R0); R['neck'] = np.zeros(len(P), F)
    return B.baby_shape(P, N, R, _baby_body, (V(0.062, 0.2, -0.02), V(0.055, 0.48, 0.0), 0.016, 1.25), SH + V(-0.04, -0.03, -0.02), (0.006, 0.008), maxd=0.1)


def _detail_baby_o(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, _flow(Pm, Nm, R), Nm, 0.003, 73)
    return 0.0005 * (dn - 0.5) * feath + 0.5 * _leg_h(P, c, R)


FUR = dict(len=0.035, n=6, lean=0.3, tile=0.003, babyLen=1.0, babyLean=0.3, shade=0.88, babyOnly=True, quality=58)


def _fur_o(P, N, c):
    return B.down_fur(P, c, FUR['len'], ['bill', 'tarsus', 'toes', 'claws', 'lids'],
                      {'head': 0.6, 'neck': 0.8, 'arm': 0.75, 'drum': 0.6}, (EYE_C, EYE_R), seed=73)


def _flow_o(P, N):
    # (bird.down_flow, on the first rig's points)
    R = _own(_parts_o(P))
    Pm = mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
    fl = _flow(Pm, Nm, R).astype(F)
    fl[:, 0] *= np.sign(P[:, 0] + 1e-9)
    return fl


# ---------- feather blades (atlas cells, same order as the game's feather cells) ----------
def _vn(s, t, base, edge, k=0.5):
    return mix(np.tile(base, (len(s), 1)), edge, sstep(0.55, 1.0, np.abs(s)) * k)


def _barred(s, t, base, dark, n=9):
    b = sstep(0.4, 0.65, np.sin(t * n * np.pi * 2 + np.abs(s) * 1.5) * 0.5 + 0.5)
    return mix(np.tile(base, (len(s), 1)), dark, b * 0.85)


def _eye_rings(green, bronze):
    return [(0.3, hexc(0x121A52)), (0.48, hexc(0x1E50B0)), (0.62, hexc(0x1E9A9A)), (0.78, bronze), (0.9, hexc(0xC0A03A)), (1.0, green)]


def _cells():
    """the peacock: rufous primaries, dark secondaries, barred coverts and tertials, the train's eyespot feathers (5),
    the crest's tufted shafts (6), the brown tail (7)"""
    F_ = B.FeatherCell
    ru, ru2, dk, dk2, bf, bk = hexc(0xA8542C), hexc(0x7A3A1E), hexc(0x2A2620), hexc(0x3E3830), hexc(0xC8AA7A), hexc(0x221C14)
    gr, br = hexc(0x2C6A2A), hexc(0x7A5E22)

    def prim(s, t, side):
        return mix(_vn(s, t, ru, ru2, 0.4), dk, sstep(0.75, 1.0, t) * 0.5)

    def sec(s, t, side):
        return _vn(s, t, dk, dk2, 0.4)

    def cov(s, t, side):
        return _barred(s, t, bf, bk)

    def train(s, t, side):
        return mix(np.tile(gr, (len(s), 1)), br, sstep(0.2, 0.9, np.abs(s)) * 0.6 + sstep(0.5, 0.0, t) * 0.3)

    def crest(s, t, side):
        return mix(np.tile(hexc(0x1E5AA0), (len(s), 1)), hexc(0x2A8A6A), sstep(0.3, 1.0, np.abs(s)))

    def tail(s, t, side):
        return _vn(s, t, hexc(0x5A4430), hexc(0x3A2C20), 0.5)

    eye = F_('eye', train, w=0.9, shaft=hexc(0x8A7A40))
    eye.eye = dict(t=0.84, rt=0.12, rs=0.62, rings=_eye_rings(gr, br), fringe=0.85)
    cr = F_('eye', crest, w=0.25, shaft=hexc(0x2A2A30))
    cr.eye = dict(t=0.86, rt=0.12, rs=0.75, rings=[(0.5, hexc(0x1E5AA0)), (1.0, hexc(0x2A8A6A))], fringe=0.0, bare=0.7)
    return [F_('flight', prim, w=0.6, outer=0.55, tip=0.42, shaft=hexc(0x5A2A16)),
            F_('round', sec, w=0.72, outer=0.8, tip=0.45, shaft=hexc(0x2A2620)),
            F_('round', cov, w=0.8, outer=0.85, tip=0.8, shaft=hexc(0x3A3020)),
            F_('round', cov, w=0.8, outer=0.9, tip=1.2, shaft=hexc(0x3A3020)),
            F_('round', cov, w=0.76, outer=0.85, tip=0.6, shaft=hexc(0x3A3020)),
            eye, cr,
            F_('round', tail, w=0.62, outer=0.85, tip=0.6, shaft=hexc(0x3A2C20))]


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = hexc(0xC8A472), hexc(0x9A7A50)
    def dn(s, t, side):
        return mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 8


FEATHER_ATLAS = {'size': (1024, 512), 'out': (1024, 512), 'cells': _cells, 'baby': _baby_cells, 'quality': (66, 62, 58),
                 'alpha_quality': 55}


def extra_maps(X):
    B.extra_maps(sys.modules[__name__], X)


def export_extra(meta, out_dir, work):
    B.export_extra(sys.modules[__name__], meta, out_dir, work)


MAP_QUALITY = (68, 52)
BABY_MAPS = {'size': 384, 'quality': (64, 50)}


def stats(P, N, c, col):
    return {'lidCol': 0xE8E6E0}


def meta(st):
    r = EYE_R
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [0.8, -0.8, 0.12],
                'iris': 0x2A1A10, 'irisR': 0.88, 'pupilR': 0.46, 'rim': 0x0A0806, 'lidCol': st['lidCol'], 'babyLidCol': 0x8A6A48},
        'collar': {'at': ['neck', 'neck2', 0.5], 'babyAt': 0.5, 'hug': True, 'babyK': 1.8, 'lift': 0.35},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.12, 0.12, 0.12], 'flat': 0x1C3E8A,
    }


# ---------- round 16, second pass: the rig's legs and neck are shorter ----------
# The first rig stood the peacock on long legs with a long neck (like a small ostrich). The rig now has its hips 8 cm
# lower, shorter legs and a neck 9% shorter; the shapes above stay laid out in the first rig's heights (the OLD heights)
# and every entry point maps the rig's points to them (_old: piecewise linear in y; _new the other way).
_YN = np.array([-0.1, 0.012, 0.14, 0.33, 0.42, 0.47, 0.56, 0.88, 1.2], F)
_YO = np.array([-0.1, 0.012, 0.18, 0.40, 0.50, 0.55, 0.64, 0.99, 1.31], F)


def _old(P):
    Q = np.array(P, F, copy=True)
    Q[:, 1] = np.interp(Q[:, 1], _YN, _YO)
    return Q


def _new(p):
    q = np.array(p, F, copy=True)
    q[1] = np.interp(q[1], _YO, _YN)
    return q


def parts(P): return _parts_o(_old(P))
def shape(P): return _shape_o(_old(P))
def uv_regions(P): return _uv_regions_o(_old(P))
def uv_weight(P): return _uv_weight_o(_old(P))
def keep(P): return _keep_o(_old(P))
def fix_weights(W, wpos, names, G, weld): return _fix_weights_o(W, _old(wpos.astype(F)), names, G, weld)
def paint(P, N, c): return _paint_o(_old(P), N, c)
def detail(P, N, c): return _detail_o(_old(P), N, c)
def paint_baby(P, N, c): return _paint_baby_o(_old(P), N, c)
def detail_baby(P, N, c): return _detail_baby_o(_old(P), N, c)
def baby_offset(P, N, c): return _baby_offset_o(_old(P), N, c)
def fur(P, N, c): return _fur_o(_old(P), N, c)
def flow(P, N): return _flow_o(_old(P), N)


BOUNDS = (V(-0.48, -0.002, -0.42), V(0.48, 0.94, 0.37))
PATCHES = [
    (V(0.0, 0.85, 0.24), V(0.04, 0.925, 0.36), 0.0007),        # head, bill, eye
    (V(0.0, -0.002, -0.08), V(0.13, 0.025, 0.12), 0.0008),     # feet
]
PREV_HEAD = ((0, 0.88, 0.3), 0.06)
_bone_tips_o, _meta_o = bone_tips, meta


def bone_tips(P):
    t = _bone_tips_o(P)
    t['tail'] = _new(TAILB + V(0, 0.0, -0.12)); t['head'] = _new(MOUTH)
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['hpaw' + s] = _new(FOOT + V(0, -0.004, 0.09)) * m; t['whand' + s] = _new(WT) * m
    return t


def meta(st):
    m = _meta_o(st)
    m['eye']['p'] = [round(float(v), 5) for v in _new(EYE_C)]
    m['mouth'] = [round(float(v), 4) for v in _new(MOUTH)]
    return m


def grid(h):
    lo, hi = BOUNDS
    xs = B.axis_steps(0.0, hi[0], [(0.0, 0.035, h * 0.5), (0.035, 0.11, h * 0.6), (0.11, 0.48, h * 1.3)], h)
    ys = B.axis_steps(lo[1], hi[1], [(lo[1], 0.025, h * 0.3), (0.05, 0.08, h * 0.5), (0.84, 0.93, h * 0.4)], h)
    zs = B.axis_steps(lo[2], hi[2], [(-0.09, 0.11, h * 0.55), (0.24, 0.36, h * 0.45)], h)
    return xs, ys, zs
