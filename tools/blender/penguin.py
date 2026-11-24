# Emperor penguin (round 16), sculpted as a signed distance field around the game's penguin skeleton (bird.py has the
# shared bird parts; the layout follows flamingo.py and swan.py). Units are meters in game rig space (x left, y up,
# z forward, ground at y = 0). Built upright like the owl, in the rig's bind pose: the flippers stick out flat to the
# side (they are the wing arm, sculpted as stiff paddles; the game has no feather blades on them). A heavy pear shaped
# body, widest low down, a small round head, a long slender bill with an orange plate below, short legs hidden in the
# belly and big black feet with claws. Black back, head and throat, white belly, yellow-orange ear patches fading to
# pale yellow on the upper breast. The chick: silver-gray down, a black head with a white face mask.
# Make it with: VOXEL=0.004 TRIS=5600 TEX=768 BLENDER_PY=... python3 tools/blender/make.py penguin sculpt export
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, loft, sweep, frame, fbm, vnoise, worley, length
import bird as B
from bird import local, local_n, mirror, groove, hexc, mix

ID = 'penguin'
BOUNDS = (V(-0.52, -0.002, -0.3), V(0.52, 1.07, 0.27))
PATCHES = [
    (V(0.0, 0.93, 0.08), V(0.06, 1.03, 0.245), 0.0008),        # bill, eye
    (V(0.0, -0.002, -0.0), V(0.15, 0.04, 0.15), 0.0009),       # feet
]
BAKE_DIST = (0.006, 0.016, 0.08)
TAIL_RINGS = 0
PREV_HEAD = ((0, 0.98, 0.12), 0.11)    # (scratch preview framing)
DISSOLVE_DEGENERATE = True
UV_PACK = dict(shape_method='CONCAVE', rotate_method='ANY')
UV_AVERAGE = True

# ---------- landmarks (left side; bone pivots from the rig) ----------
HIPS, TAILB = V(0, 0.38, -0.02), V(0, 0.15, -0.17)
NECK, NECK2, HEAD = V(0, 0.8, 0.02), V(0, 0.91, 0.045), V(0, 0.98, 0.06)
THIGH, SHIN, HMETA, HPAW = V(0.075, 0.22, 0.0), V(0.085, 0.13, 0.05), V(0.085, 0.06, 0.02), V(0.085, 0.012, 0.05)
SH, EL, WR, WT = V(0.15, 0.72, 0.0), V(0.21, 0.72, 0.0), V(0.31, 0.72, 0.0), V(0.48, 0.72, 0.0)

EYE_C = V(0.0405, 1.004, 0.098)
EYE_R = 0.0072
EYE_DIR = nrm(V(0.85, 0.14, 0.5))
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_R = 0.0058
MOUTH = V(0, 0.958, 0.236)
FOOT = HPAW + V(0, 0.0, 0.002)
TOES = [dict(a=-24, len=0.062, r=0.0095, r1=0.006, claw=0.017, clawDrop=0.25, n=3), dict(a=0, len=0.072, r=0.01, r1=0.0065, claw=0.019, clawDrop=0.25, n=3),
        dict(a=24, len=0.06, r=0.0095, r1=0.006, claw=0.017, clawDrop=0.25, n=3)]

# the body: a loft up the vertical axis (vl() turns rig space so the loft's axis is the height): height y, front z
# (the belly), the widest line's z, back z, half width, exponents in front and behind. Heavy and pear shaped.
TRUNK = [
    (0.03, 0.055, 0.0, -0.075, 0.055, 2.0, 2.0),
    (0.07, 0.13, 0.005, -0.125, 0.125, 2.1, 2.0),
    (0.14, 0.185, 0.015, -0.165, 0.17, 2.2, 2.1),
    (0.26, 0.214, 0.02, -0.19, 0.194, 2.3, 2.25),
    (0.4, 0.216, 0.02, -0.19, 0.196, 2.3, 2.25),
    (0.54, 0.194, 0.016, -0.172, 0.178, 2.2, 2.2),
    (0.66, 0.155, 0.012, -0.138, 0.148, 2.1, 2.1),
    (0.76, 0.118, 0.012, -0.104, 0.114, 2.0, 2.0),
    (0.85, 0.096, 0.016, -0.078, 0.09, 2.0, 2.0),
    (0.92, 0.088, 0.024, -0.062, 0.076, 2.0, 2.0),
    (0.965, 0.086, 0.032, -0.052, 0.068, 2.0, 2.0),
]
# the bill as a sweep along the mouth line (y, z): slender and a little decurved
BILL_KEYS = [
    (0.986, 0.112, 0.016, 0.016, 0.0135, 2.2, 2.2),
    (0.984, 0.14, 0.0125, 0.0125, 0.0112, 2.3, 2.3),
    (0.979, 0.17, 0.0092, 0.0098, 0.0088, 2.4, 2.3),
    (0.972, 0.198, 0.0068, 0.0072, 0.0066, 2.3, 2.2),
    (0.964, 0.222, 0.0045, 0.0045, 0.0045, 2.1, 2.0),
    (0.958, 0.236, 0.0024, 0.0022, 0.0024, 2.0, 2.0),
]


def vl(Q):
    """rig space -> the vertical loft's frame: (x, z, y), so the loft runs up the height"""
    return np.stack([Q[:, 0], Q[:, 2], Q[:, 1]], 1).astype(F)


def _interp(tab, z):
    zz = np.array([k[0] for k in tab], F); yy = np.array([k[1] for k in tab], F)
    return np.interp(z, zz, yy).astype(F)


def _line(keys):
    K = np.array(keys, F)
    from scipy.interpolate import PchipInterpolator
    seg = np.linalg.norm(np.diff(K[:, :2], axis=0), axis=1)
    t = np.concatenate([[0], np.cumsum(seg)])
    f = PchipInterpolator(t, K[:, :2].astype(np.float64), axis=0)
    S = f(np.linspace(0, t[-1], 160)).astype(F)
    arc = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(S, axis=0), axis=1))]).astype(F)
    return S, arc


_BL = _line(BILL_KEYS)


def bill_s(P):
    """arc length along the bill's mouth line of the nearest line point, and the offset across it (+ toward the top)"""
    S, arc = _BL
    y, z = P[:, 1], P[:, 2]
    d = (y[:, None] - S[None, :, 0]) ** 2 + (z[:, None] - S[None, :, 1]) ** 2
    i = np.argmin(d, 1)
    j = np.clip(i + 1, 0, len(S) - 1); k = np.clip(i - 1, 0, len(S) - 1)
    ty, tz = S[j, 0] - S[k, 0], S[j, 1] - S[k, 1]
    tl = np.sqrt(ty * ty + tz * tz) + 1e-9
    u = (y - S[i, 0]) * (tz / tl) - (z - S[i, 1]) * (ty / tl)
    return arc[i], u


# ---------- body ----------
def trunk(P):
    Q = mirror(P)
    d = loft(vl(Q), TRUNK)
    d = smin(d, ellipsoid(Q, V(0, 0.33, 0.06), V(0.18, 0.2, 0.15)), 0.06)              # the heavy belly
    d = smin(d, ellipsoid(Q, V(0, 0.64, 0.05), V(0.12, 0.12, 0.1)), 0.05)              # the full upper breast
    # the short stiff tail on the ground behind
    Qt = Q * V(1.0 / 0.8, 1, 1)
    d = smin(d, round_cone(Qt, V(0, 0.19, -0.15), V(0, 0.035, -0.235), 0.045, 0.016) * 0.8, 0.03)
    return d


def head(P):
    Q = mirror(P)
    d = ellipsoid(Q, V(0, 0.996, 0.058), V(0.056, 0.058, 0.078))
    d = smin(d, ellipsoid(Q, V(0, 0.975, 0.09), V(0.038, 0.04, 0.05)), 0.02)            # cheeks and chin into the bill
    d = smax(d, Q[:, 1] - 1.046, 0.015)                                                  # a flatter crown
    return d


def bill(P):
    Q = mirror(P)
    d = sweep(Q, BILL_KEYS, n=100)
    s, u = bill_s(Q)
    d = d + groove(u, 0.0006, 0.0006) * sstep(0.004, 0.012, s)
    return d


def eye_parts(P):
    Q = mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0, -0.001), V(EYE_R + 0.0028, EYE_R + 0.0028, EYE_R + 0.0014))
    ap = np.sqrt(s * s + u * u) - LID_R
    carve = smax(ap, -(g + 0.0012), 0.0008)
    ball = length(D) - EYE_R * 0.92
    return carve, lids, ball


# ---------- legs ----------
def drum(P):
    """the thigh, all inside the body"""
    Q = mirror(P)
    return round_cone(Q, V(0.07, 0.22, 0.0), SHIN + V(0, 0.0, -0.01), 0.05, 0.035)


def tarsus(P):
    Q = mirror(P)
    t = round_cone(Q, SHIN + V(0, -0.02, -0.01), HPAW + V(0, 0.01, -0.012), 0.024, 0.018)
    pad = ellipsoid(Q, HPAW + V(0, -0.002, 0.0), V(0.026, 0.012, 0.03))
    return smin(t, pad, 0.012)


def feet(P):
    Q = mirror(P)
    tt, cl, _ = B.toes(Q, FOOT, TOES)
    wb = B.web(Q, FOOT, TOES, 0.004, reach=0.75, sag=0.25)
    return tt, cl, wb


def arm(P):
    """the flipper: a stiff flat paddle, broadest past the elbow, tapering to a rounded point"""
    Q = mirror(P)
    return B.wing_arm(Q, [SH + V(-0.03, 0, 0), SH + V(0.03, 0, 0), EL, WR, WT], [0.05, 0.082, 0.096, 0.082, 0.024],
                      [0.032, 0.02, 0.016, 0.012, 0.006], lead=0.5)


# ---------- assembly ----------
def grid(h):
    lo, hi = BOUNDS
    xs = B.axis_steps(0.0, hi[0], [(0.0, 0.07, h * 0.45), (0.04, 0.16, h * 0.6), (0.16, 0.52, h * 0.7)], h)
    ys = B.axis_steps(lo[1], hi[1], [(lo[1], 0.045, h * 0.3), (0.68, 0.76, h * 0.35), (0.92, 1.06, h * 0.4)], h)
    zs = B.axis_steps(lo[2], hi[2], [(-0.06, 0.06, h * 0.5), (0.06, 0.27, h * 0.45)], h)
    return xs, ys, zs


HEAD_BOX = (V(-0.08, 0.88, -0.04), V(0.08, 1.07, 0.26))
LEG_BOX = (V(-0.18, -0.003, -0.08), V(0.18, 0.3, 0.17))
ARM_BOX = (V(0.08, 0.68, -0.08), V(0.52, 0.76, 0.08))
EYE_BOX = (V(-EYE_C[0] - 0.018, EYE_C[1] - 0.018, EYE_C[2] - 0.018), EYE_C + V(0.018, 0.018, 0.018))
TRUNK_BOX = (V(-0.28, -0.003, -0.3), V(0.28, 1.0, 0.28))


def parts(P):
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    ft, cl, wb = local_n(P, *LEG_BOX, feet, 3)
    return {'trunk': local(P, *TRUNK_BOX, trunk), 'head': local(P, *HEAD_BOX, head),
            'bill': local(P, *HEAD_BOX, bill), 'lids': li, 'ball': ba, 'carve': ca,
            'drum': local(P, *LEG_BOX, drum), 'tarsus': local(P, *LEG_BOX, tarsus), 'toes': ft, 'claws': cl, 'web': wb,
            'arm': local(mirror(P), *ARM_BOX, arm)}


def shape(P):
    d = local(P, *TRUNK_BOX, trunk)
    h = local(P, *HEAD_BOX, head)
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    h = smin(h, li, 0.004)
    h = smax(h, -ca, 0.001)
    h = smin(h, ba, 0.0006)
    h = smin(h, local(P, *HEAD_BOX, bill), 0.008)
    d = smin(d, h, 0.04)
    lg = smin(local(P, *LEG_BOX, drum), local(P, *LEG_BOX, tarsus), 0.015)
    ft, cl, wb = local_n(P, *LEG_BOX, feet, 3)
    f = smin(smin(ft, wb, 0.003), cl, 0.0015)
    lg = smin(lg, f, 0.01)
    d = smin(d, lg, 0.025)
    d = smin(d, local(mirror(P), *ARM_BOX, arm), 0.02)
    return d


def uv_regions(P):
    """head and bill, upper body, lower body, feet, flipper: unwrapped one by one"""
    Pm = mirror(P)
    lab = np.full(len(P), 2)
    lab[Pm[:, 1] > 0.5] = 1
    lab[(Pm[:, 1] < 0.1) & (Pm[:, 2] > 0.0) & (Pm[:, 0] > 0.03)] = 3
    lab[(Pm[:, 0] > 0.17) & (Pm[:, 1] > 0.66) & (Pm[:, 1] < 0.78)] = 5
    lab[(Pm[:, 1] > 0.93) | ((Pm[:, 2] > 0.1) & (Pm[:, 1] > 0.9))] = 0
    return lab


def uv_weight(P):
    lab = uv_regions(P)
    return np.choose(lab, [2.2, 1.0, 0.9, 1.1, 1.0, 0.8]).astype(F)


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
SPINE = ['tail', 'hips', 'neck', 'neck2', 'head']


def _spine_u(P):
    y, z = P[:, 1], P[:, 2]
    u = np.interp(y, [0.55, 0.8, 0.91, 0.985], [1.5, 2.0, 3.0, 4.0]).astype(F)
    tl = sstep(-0.13, -0.2, z) * sstep(0.26, 0.16, y)
    return u * (1 - tl) + 0.5 * tl


WCFG = dict(groups=[('body', ['trunk']), ('head', ['head', 'bill', 'lids']), ('drum', ['drum']), ('tarsus', ['tarsus']),
                    ('foot', ['toes', 'claws', 'web']), ('arm', ['arm'])],
            bias={'body': 0.002}, spine=SPINE, spine_u=_spine_u, head_u=4.0, knee=(0.12, 0.15), hipb=(0.19, 0.23, 0.7),
            ankle_d=(0.1, 0.085), ankle=(0.075, 0.1), pad=(0.03, 0.015), toe_up=(0.022, 0.035), arm=(SH, EL, WR, WT), arm_root=(0.19, 0.16))


def fix_weights(W, wpos, names, G, weld):
    P = wpos.astype(F)
    c = parts(P)
    return B.part_weights(W, wpos, names, c, WCFG)


def bone_tips(P):
    t = {'hips': P['neck'], 'tail': TAILB + V(0, -0.1, -0.08), 'neck': P['neck2'], 'neck2': P['head'], 'head': MOUTH}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, -0.004, 0.07)) * m
        t['wing' + s] = P['wfore' + s]; t['wfore' + s] = P['whand' + s]; t['whand' + s] = WT * m
    return t


OWN_KEYS = ['trunk', 'head', 'bill', 'drum', 'tarsus', 'toes', 'web', 'claws', 'arm', 'lids']


def _own(c):
    D = np.stack([c[k] for k in OWN_KEYS], 1)
    o = np.argmin(D, 1)
    return {k: (o == i).astype(F) for i, k in enumerate(OWN_KEYS)}


def keep(P):
    Pm = mirror(P)
    R = _own(parts(P))
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    ball = sstep(EYE_R * 0.97, EYE_R * 0.8, de)
    k = 0.44 * R['trunk'] + 0.76 * R['head'] + 0.8 * R['bill'] + 0.85 * R['lids']
    k += 0.5 * R['drum'] + 0.66 * R['tarsus'] + 0.74 * (R['toes'] + R['web'] + R['claws']) + 0.55 * R['arm']
    rim = sstep(EYE_R + 0.005, EYE_R + 0.0015, de) * sstep(EYE_R * 0.9, EYE_R * 1.0, de) * 0.85
    return np.maximum(k, rim) * (1 - ball)


# ---------- plumage and skin paint ----------
K = {
    'black': hexc(0x15181C), 'slate': hexc(0x2E3640), 'white': hexc(0xF3F1EA), 'shade': hexc(0xD8D6D0), 'yellow': hexc(0xF4A21C),
    'gold': hexc(0xF7C442), 'pale': hexc(0xF7E7A8), 'bill': hexc(0x15161A), 'plate': hexc(0xEE7436), 'foot': hexc(0x1E1F22),
}


def _flow(P, N, R, wing=False):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    fl = np.zeros((len(P), 3), F)
    # the feathers point down the body, and back on the head
    fl[:, 1] = -1.0
    fl[:, 2] = -0.15
    hd = np.clip(R['head'] + R['lids'], 0, 1) * sstep(0.93, 0.97, y)
    fl[:, 1] = fl[:, 1] * (1 - hd) - 0.3 * hd
    fl[:, 2] = fl[:, 2] * (1 - hd) - 1.0 * hd
    ar = R['arm']
    fl[:, 0] = fl[:, 0] * (1 - ar) + 1.0 * ar
    fl[:, 1] *= (1 - ar)
    fl[:, 2] = fl[:, 2] * (1 - ar) - 0.2 * ar
    return fl / np.maximum(np.linalg.norm(fl, axis=1, keepdims=True), 1e-9)


def _size(P, N, R):
    s = np.full(len(P), 0.007, F)
    hd = R['head'] + R['lids']
    s = s * (1 - hd) + hd * 0.0035
    s = s * (1 - R['arm']) + R['arm'] * 0.004
    return s


_pcache = {}


def _plum(P, N, c):
    key = (len(P), float(P[:7].sum()))
    if key not in _pcache:
        R = _own(c)
        Pm = mirror(P)
        Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
        fl = _flow(Pm, Nm, R)
        sz = _size(Pm, Nm, R)
        feath = np.clip(R['trunk'] + R['head'] + R['arm'], 0, 1)
        pl = B.plumage(Pm, Nm, fl, sz, None, seed=26)
        _pcache.clear()
        _pcache[key] = (R, Pm, Nm, fl, sz, feath, pl)
    return _pcache[key]


def _marks(Pm, R):
    """the white belly (angle round the body from the front, as far as it reaches at each height), the black throat
    coming down to a point, the yellow-orange ear patch and the pale yellow wash below the throat"""
    x, y, z = np.abs(Pm[:, 0]), Pm[:, 1], Pm[:, 2]
    th = np.arctan2(x, z - 0.0)
    reach = np.interp(y, [0.0, 0.08, 0.3, 0.55, 0.7, 0.8], [1.6, 1.85, 1.95, 1.9, 1.72, 1.4]).astype(F)
    throat = 0.745 + 0.12 * sat(th / 1.2) ** 1.4 + 0.012 * np.sin(th * 7)
    white = sstep(reach + 0.04, reach - 0.04, th) * sstep(throat + 0.01, throat - 0.01, y)
    white = white * np.clip(R['trunk'] + R['drum'], 0, 1)
    # the ear patch: a comma behind and below the eye, wide at the top and narrowing down the side of the neck toward
    # the breast (distance to a segment, its radius shrinking along it)
    a, b = V(0.045, 0.955, 0.02), V(0.075, 0.83, 0.085)
    ab = b - a
    t = np.clip(((Pm - a) @ ab) / float(ab @ ab), 0, 1)
    dseg = np.linalg.norm(Pm - (a + ab * t[:, None]), axis=1)
    rad = 0.034 - 0.02 * t
    ear = sstep(rad + 0.006, rad - 0.006, dseg) * sstep(0.2, 0.5, np.abs(np.arctan2(x, z))) * (1 - 0.3 * t)
    # the pale yellow wash on the upper breast, just under the throat
    wash = white * sstep(throat - 0.14, throat - 0.02, y)
    return white, ear, wash, throat, th


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n1 = fbm(Pm * 14, 3, 31)
    white, ear, wash, throat, th = _marks(Pm, R)
    # black back and head with a faint blue-gray sheen on the back
    col = mix(np.tile(K['black'], (len(P), 1)), K['slate'], sstep(1.9, 2.6, th) * sstep(0.2, 0.6, y) * (0.35 + 0.2 * n1))
    wb = mix(np.tile(K['white'], (len(P), 1)), K['shade'], sstep(0.0, -0.8, Nm[:, 1]) * 0.3)
    col = mix(col, wb, white)
    col = mix(col, K['pale'], wash * 0.85)
    col = mix(col, mix(np.tile(K['gold'], (len(P), 1)), K['yellow'], sstep(0.86, 0.94, y)), ear * np.clip(R['trunk'] + R['head'], 0, 1))
    # the flipper: black above, white below with a dark leading edge
    ar = R['arm']
    under = sstep(0.1, -0.3, Nm[:, 1]) * sstep(0.03, 0.0, z) * sstep(-0.035, -0.01, z)
    col = mix(col, mix(np.tile(K['black'], (len(P), 1)), K['white'], under), ar)
    # soft feather texture
    cfa = np.maximum(pl['c'], 1e-4)
    col = mix(col, col * 0.9, sstep(0.45 * cfa, 1.2 * cfa, -pl['a']) * 0.25 * pl['cov'] * feath)
    col *= (0.97 + 0.05 * pl['id'] + 0.03 * (n1 - 0.5))[:, None]
    # the bill black with an orange plate along the lower mandible
    bl = R['bill']
    s, u = bill_s(Pm)
    plate = sstep(0.0, -0.002, u) * sstep(0.1, 0.07, s) * sstep(0.003, 0.012, s) * sstep(0.2, 0.5, np.abs(Nm[:, 0]) + sstep(0.0, -0.5, Nm[:, 1]))
    col = mix(col, mix(np.tile(K['bill'], (len(P), 1)), K['plate'], plate), bl)
    lg = np.clip(R['tarsus'] + R['toes'] + R['web'] + R['claws'], 0, 1)
    col = mix(col, K['foot'], lg)
    rough = 0.6 + 0.08 * (n1 - 0.5)
    rough = np.where(white > 0.5, 0.72, rough)
    rough = np.where(bl > 0.5, 0.35, rough)
    rough = np.where(lg > 0.5, 0.55, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _leg_h(P, c, R):
    Pm = mirror(P)
    rh, rg = B.reticulate(Pm, 0.0026, 42)
    h = (R['tarsus'] + R['toes']) * (0.00008 * rh - 0.0001 * rg)
    wh, wg = B.reticulate(Pm, 0.0016, 44)
    h += R['web'] * (0.00003 * wh - 0.00004 * wg)
    return h


def detail(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    h = B.feather_height(pl, 0.02) * feath
    h += 0.00002 * (fbm(Pm * 500, 2, 61) - 0.5) * np.clip(R['head'] + R['lids'], 0, 1)
    f1, _ = worley(Pm / 0.0009, 62)
    h -= 0.000015 * sstep(0.3, 0.0, f1) * R['bill']
    return h + _leg_h(P, c, R)


def finish(C, ao, valid):
    return B.finish_ao(C, ao, 0.36)


# ---------- the chick (baby maps) ----------
KB = {'gray': hexc(0x9EA1A4), 'pale': hexc(0xC2C4C6), 'dark': hexc(0x7A7E82), 'black': hexc(0x1C1E22), 'mask': hexc(0xF2F2EE), 'foot': hexc(0x34363A)}


def paint_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, _flow(Pm, Nm, R), Nm, 0.003, 73)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    col = mix(np.tile(KB['gray'], (len(P), 1)), KB['pale'], sstep(0.0, 0.6, Nm[:, 2]) * 0.5)
    col = mix(col, KB['dark'], sstep(-0.2, -0.7, Nm[:, 2]) * 0.3)
    col *= (0.76 + 0.34 * dn + 0.1 * tip)[:, None]
    # the black cap, nape and throat, and the white mask round the eyes and over the cheeks
    hd = np.clip(R['head'] + R['lids'] + R['bill'] * 0.0, 0, 1) + R['trunk'] * sstep(0.88, 0.94, y)
    col = mix(col, KB['black'], np.clip(hd, 0, 1))
    m = np.linalg.norm((Pm - V(0.035, 0.995, 0.075)) / V(1.0, 1.15, 1.35), axis=1)
    mask = sstep(0.05, 0.034, m) * sstep(0.1, 0.4, np.abs(Nm[:, 0])) * np.clip(R['head'] + R['lids'], 0, 1)
    col = mix(col, KB['mask'], mask)
    col = mix(col, KB['black'], R['bill'])
    lg = np.clip(R['tarsus'] + R['toes'] + R['web'] + R['claws'], 0, 1)
    col = mix(col, KB['foot'], lg)
    rough = np.where(R['bill'] + lg > 0.5, 0.55, 0.93)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _baby_body(Q):
    d = ellipsoid(Q, V(0, 0.42, 0.0), V(0.2, 0.42, 0.2))
    return d


def baby_offset(P, N, c):
    """per vertex: where the chick's surface lies relative to the adult's (adult space; see bird.baby_shape): a round
    fluffy pear of a body, the flippers pulled in to the shoulders"""
    R0 = _own(c)
    R = dict(R0); R['neck'] = np.zeros(len(P), F)
    # (the drumstick is inside the body: nothing to thin)
    R['drum'] = np.zeros(len(P), F)
    y = P[:, 1]
    R['trunk'] = R0['trunk'] * sstep(0.84, 0.76, y)
    return B.baby_shape(P, N, R, _baby_body, (V(0.085, 0.06, 0.02), V(0.07, 0.22, 0.0), 0.03, 1.3), SH + V(-0.04, -0.02, 0.0), (0.008, 0.012), maxd=0.06)


def detail_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, _flow(Pm, Nm, R), Nm, 0.003, 73)
    return 0.0005 * (dn - 0.5) * feath + 0.5 * _leg_h(P, c, R)


# the chick's down as fur shells (babyOnly: the grown-up keeps its sleek feathers)
FUR = dict(len=0.045, n=6, lean=0.3, tile=0.0034, babyLen=1.0, babyLean=0.3, shade=0.88, babyOnly=True, quality=58)


def fur(P, N, c):
    return B.down_fur(P, c, FUR['len'], ['bill', 'tarsus', 'toes', 'web', 'claws', 'lids'],
                      {'head': 0.5, 'arm': 0.6, 'drum': 0.6}, (EYE_C, EYE_R), seed=73)


def flow(P, N):
    return B.down_flow(sys.modules[__name__], P, N)


def extra_maps(X):
    B.extra_maps(sys.modules[__name__], X)


def export_extra(meta, out_dir, work):
    B.export_extra(sys.modules[__name__], meta, out_dir, work)


MAP_QUALITY = (70, 52)
BABY_MAPS = {'size': 384, 'quality': (64, 50)}


def stats(P, N, c, col):
    return {'lidCol': 0x16181C}


def meta(st):
    r = EYE_R
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [0.8, -0.8, 0.12],
                'iris': 0x3A2418, 'irisR': 0.86, 'pupilR': 0.45, 'rim': 0x0A0806, 'lidCol': st['lidCol'], 'babyLidCol': 0x1E2024},
        'collar': {'at': ['neck', 'neck2', 0.4], 'babyAt': 0.4, 'hug': True, 'babyK': 1.6, 'lift': 0.35},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.1, 0.1, 0.1], 'flat': 0x2A2C30,
    }
