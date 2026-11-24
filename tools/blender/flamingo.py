# American flamingo (round 16), sculpted as a signed distance field around the game's flamingo skeleton (bird.py has
# the shared bird parts; the layout follows swan.py). Units are meters in game rig space (x left, y up, z forward,
# ground at y = 0). Made in the rig's bind pose: the wing arm sticks out flat to the side under the game's feather
# blades. An egg shaped body with the folded wing over its upper side and the long pink tertials over the tail, a thin
# S shaped neck, a small head, the thick bill bent down at its middle (pale pink with a black tip), the long bare legs
# with the ankle knob halfway down and webbed feet. The chick: gray down, a straight dark bill, thick gray legs.
# Make it with: VOXEL=0.004 TRIS=6200 TEX=768 BLENDER_PY=... python3 tools/blender/make.py flamingo sculpt export
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, loft, sweep, frame, fbm, vnoise, worley, length
import bird as B
from bird import local, local_n, mirror, groove, hexc, mix

ID = 'flamingo'
BOUNDS = (V(-0.52, -0.002, -0.42), V(0.52, 1.44, 0.36))
PATCHES = [
    (V(0.0, 1.3, 0.165), V(0.034, 1.43, 0.345), 0.0008),       # bill, eye
    (V(0.0, -0.002, -0.03), V(0.13, 0.03, 0.12), 0.0008),       # foot
    (V(0.04, 0.36, -0.05), V(0.085, 0.42, 0.0), 0.0009),        # ankle knob
]
BAKE_DIST = (0.006, 0.016, 0.08)
PREVIEW = {
    'side': ((4.2, 0.75, 0.0), (0, 0.7, 0.0), 30),
    'front3q': ((2.6, 1.3, 2.8), (0, 0.72, 0.0), 30),
    'rear3q': ((-2.4, 1.5, -2.6), (0, 0.72, -0.05), 30),
    'head3q': ((0.28, 1.46, 0.6), (0, 1.38, 0.25), 20),
    'headside': ((0.55, 1.4, 0.26), (0, 1.38, 0.25), 16),
    'body': ((1.6, 1.1, 0.6), (0, 0.9, 0.0), 30),
    'feet': ((0.6, 0.2, 0.5), (0.06, 0.08, 0.0), 30),
}
TAIL_RINGS = 0
PREV_HEAD = ((0, 1.37, 0.26), 0.1)    # (scratch preview framing)
DISSOLVE_DEGENERATE = True
UV_PACK = dict(shape_method='CONCAVE', rotate_method='ANY')
UV_AVERAGE = True

# ---------- landmarks (left side; bone pivots from the rig) ----------
HIPS, TAILB = V(0, 0.86, 0), V(0, 0.9, -0.24)
NECK, NECK2, NECK3, NECK4, HEAD = V(0, 0.93, 0.21), V(0, 1.09, 0.34), V(0, 1.25, 0.27), V(0, 1.36, 0.17), V(0, 1.38, 0.21)
THIGH, SHIN, HMETA, HPAW = V(0.05, 0.83, -0.02), V(0.062, 0.75, 0.06), V(0.062, 0.39, -0.03), V(0.062, 0.02, 0.02)
SH, EL, WR, WT = V(0.075, 0.96, 0.1), V(0.195, 0.96, 0.1), V(0.345, 0.96, 0.1), V(0.4575, 0.96, 0.1)

# the head is level (its frame is rig space moved to the back of the skull), so hl() only shifts
H0 = V(0, 1.398, 0.17)
HF = V(0, 0, 1)
HU = V(0, 1, 0)


def hl(Q):
    """rig space -> head frame as (x, v, u)"""
    D = Q - H0
    return np.stack([D[:, 0], D @ HU, D @ HF], 1).astype(F)


EYE_C = V(0.0188, 1.404, 0.2045)
EYE_R = 0.0054
EYE_DIR = nrm(V(0.9, 0.18, 0.32))
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_R = 0.0043
MOUTH = V(0, 1.322, 0.331)
FOOT = HPAW + V(0, 0.0, 0.004)
TOES = [dict(a=-27, len=0.07, r=0.0054, r1=0.003, claw=0.007, n=4), dict(a=0, len=0.084, r=0.0058, r1=0.0032, claw=0.008, n=4),
        dict(a=27, len=0.072, r=0.0054, r1=0.003, claw=0.007, n=4), dict(a=180, len=0.012, r=0.003, r1=0.002, claw=0.004, lift=0.012, n=2, hind=True)]

# trunk, an egg: z, top, yw (height of the widest line), bottom, half width, exponents above and below
TRUNK = [
    (-0.33, 0.94, 0.928, 0.917, 0.008, 2.0, 2.0),
    (-0.3, 0.948, 0.921, 0.894, 0.03, 2.0, 2.0),
    (-0.24, 0.96, 0.906, 0.852, 0.058, 2.1, 2.0),
    (-0.16, 0.976, 0.888, 0.795, 0.088, 2.2, 2.1),
    (-0.06, 0.988, 0.875, 0.75, 0.104, 2.3, 2.3),
    (0.04, 0.99, 0.874, 0.736, 0.106, 2.3, 2.4),
    (0.12, 0.978, 0.878, 0.748, 0.096, 2.2, 2.2),
    (0.18, 0.955, 0.884, 0.778, 0.074, 2.1, 2.1),
    (0.222, 0.93, 0.888, 0.83, 0.044, 2.0, 2.0),
    (0.24, 0.912, 0.89, 0.866, 0.018, 2.0, 2.0),
]
# the folded wing over the upper side: its lower edge along the flank (z, y), the wing a layer WING_T thick above it
WING_EDGE = [(-0.42, 0.905), (-0.34, 0.888), (-0.24, 0.86), (-0.12, 0.832), (0.0, 0.83), (0.08, 0.842), (0.15, 0.87)]
WING_T = 0.01
# the S shaped neck as a sweep: path (y, z), section toward the nape (top), toward the throat (bot), half width
NECK_KEYS = [
    (0.86, 0.13, 0.052, 0.052, 0.05, 2.0, 2.0),
    (0.92, 0.2, 0.034, 0.036, 0.032, 2.0, 2.0),
    (1.0, 0.285, 0.022, 0.023, 0.021, 2.0, 2.0),
    (1.09, 0.33, 0.018, 0.019, 0.017, 2.0, 2.0),
    (1.17, 0.32, 0.0165, 0.017, 0.0158, 2.0, 2.0),
    (1.25, 0.27, 0.016, 0.0165, 0.0155, 2.0, 2.0),
    (1.31, 0.215, 0.0165, 0.017, 0.016, 2.0, 2.0),
    (1.355, 0.18, 0.018, 0.018, 0.017, 2.0, 2.0),
    (1.382, 0.177, 0.019, 0.019, 0.018, 2.0, 2.0),
    (1.397, 0.19, 0.018, 0.018, 0.017, 2.0, 2.0),
]
# the bill as a sweep along the mouth line (y, z): the upper mandible above it (top), the deep lower mandible below
# (bot), its half width; straight forward from the face, then bent down at the middle to the tip
BILL_KEYS = [
    (1.396, 0.214, 0.017, 0.016, 0.0125, 2.2, 2.2),
    (1.396, 0.235, 0.0155, 0.0165, 0.0122, 2.3, 2.2),
    (1.395, 0.258, 0.0125, 0.0165, 0.0118, 2.5, 2.2),
    (1.391, 0.278, 0.0095, 0.0155, 0.011, 2.6, 2.3),
    (1.38, 0.296, 0.0075, 0.0135, 0.0098, 2.6, 2.3),
    (1.362, 0.311, 0.006, 0.0105, 0.0082, 2.4, 2.2),
    (1.343, 0.322, 0.0048, 0.0075, 0.0064, 2.2, 2.1),
    (1.328, 0.329, 0.0036, 0.0048, 0.0045, 2.0, 2.0),
    (1.32, 0.331, 0.0024, 0.0028, 0.0028, 2.0, 2.0),
]
BEND = V(0, 1.389, 0.282)        # where the bill bends down (the black starts a little past it)


def _interp(tab, z):
    zz = np.array([k[0] for k in tab], F); yy = np.array([k[1] for k in tab], F)
    return np.interp(z, zz, yy).astype(F)


# arc length along the bill's mouth line, for the paint (sampled once)
def _bill_line():
    K = np.array(BILL_KEYS, F)
    from scipy.interpolate import PchipInterpolator
    seg = np.linalg.norm(np.diff(K[:, :2], axis=0), axis=1)
    t = np.concatenate([[0], np.cumsum(seg)])
    f = PchipInterpolator(t, K[:, :2].astype(np.float64), axis=0)
    ts = np.linspace(0, t[-1], 200)
    S = f(ts).astype(F)
    arc = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(S, axis=0), axis=1))]).astype(F)
    return S, arc


_BL = _bill_line()


def bill_s(P):
    """arc length (m) from the face along the bill's mouth line of the nearest line point, and the signed offset
    across it (+ toward the culmen)"""
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
    y, z = Q[:, 1], Q[:, 2]
    d = loft(Q, TRUNK)
    d = smin(d, ellipsoid(Q, V(0, 0.872, 0.11), V(0.098, 0.11, 0.11)), 0.05)           # round breast
    d = smin(d, ellipsoid(Q, V(0, 0.77, -0.04), V(0.085, 0.04, 0.15)), 0.05)            # belly
    # the folded wing: a layer over the upper side with a clean lower edge along the flank, rounded at the shoulder
    ye = _interp(WING_EDGE, z)
    w = smax(d - WING_T, ye - y, 0.002)
    w = smax(w, z - (0.15 + 0.6 * (y - 0.84)), 0.02)
    # the long tertials drooping over the rump and the tail, the primaries crossing under them
    w = smin(w, ellipsoid(Q, V(0.055, 0.95, -0.25), V(0.06, 0.03, 0.13)), 0.035)
    Qs = Q * V(1, 2.2, 1)
    w = smin(w, round_cone(Qs, V(0.06, 0.935 * 2.2, -0.2), V(0.02, 0.92 * 2.2, -0.4), 0.026, 0.006), 0.016)
    return smin(d, w, 0.002)


def neck(P):
    return sweep(mirror(P), NECK_KEYS, n=160)


def head(P):
    Q = mirror(P)
    L = hl(Q)
    d = ellipsoid(L, V(0, 0.0, 0.03), V(0.0205, 0.022, 0.032))                         # small round skull
    d = smin(d, ellipsoid(L, V(0, -0.006, 0.045), V(0.0165, 0.018, 0.024)), 0.01)      # cheeks and chin into the bill
    d = smax(d, L[:, 1] - 0.0215, 0.008)                                                # flat crown
    return d


def bill(P):
    Q = mirror(P)
    d = sweep(Q, BILL_KEYS, n=120)
    s, u = bill_s(Q)
    # the mouth line: a groove along the line the sweep follows (the bill's two halves)
    d = d + groove(u, 0.0007, 0.0007) * sstep(0.004, 0.012, s)
    # the nostril: a long slit on the upper mandible near the face
    nq = np.sqrt(((s - 0.022) / 0.009) ** 2 + ((u - 0.0085) / 0.0018) ** 2)
    d = d + 0.0012 * sstep(1.0, 0.4, nq) * sstep(0.006, 0.0, np.abs(Q[:, 0] - 0.0085))
    return d


def eye_parts(P):
    Q = mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0, -0.001), V(EYE_R + 0.0026, EYE_R + 0.0026, EYE_R + 0.0013))
    ap = np.sqrt(s * s + u * u) - LID_R
    carve = smax(ap, -(g + 0.0011), 0.0008)
    ball = length(D) - EYE_R * 0.92
    return carve, lids, ball


# ---------- legs ----------
def drum(P):
    """the thigh inside the belly feathers and the long bare tibia down to the ankle"""
    Q = mirror(P)
    th = round_cone(Q, V(0.048, 0.82, -0.01), SHIN + V(0, -0.01, -0.004), 0.042, 0.022)
    tb = round_cone(Q, SHIN + V(0, -0.03, -0.006), HMETA + V(0, 0.012, 0.0), 0.0105, 0.0085)
    return smin(th, tb, 0.03)


def tarsus(P):
    Q = mirror(P)
    j = ellipsoid(Q, HMETA + V(0, 0.002, 0.001), V(0.0115, 0.017, 0.0125))                # the ankle knob
    t = B.flat_cone(Q, HMETA + V(0, -0.008, 0.0), HPAW + V(0, 0.01, -0.003), 0.0088, 0.0074, 0.8, up=(1, 0, 0))
    pad = ellipsoid(Q, HPAW + V(0, -0.002, 0.003), V(0.0095, 0.008, 0.012))
    return smin(smin(j, t, 0.012), pad, 0.008)


def feet(P):
    Q = mirror(P)
    tt, cl, _ = B.toes(Q, FOOT, [t for t in TOES if not t.get('hind')])
    ht, hc, _ = B.toes(Q, HPAW + V(0, 0.014, -0.006), [t for t in TOES if t.get('hind')], ground=0.01)
    wb = B.web(Q, FOOT, TOES, 0.0018, reach=0.9, sag=0.2)
    return np.minimum(tt, ht), np.minimum(cl, hc), wb


def arm(P):
    Q = mirror(P)
    return B.wing_arm(Q, [SH + V(-0.025, -0.006, -0.006), SH + V(0.06, 0, 0), EL, WR, WT], [0.026, 0.045, 0.048, 0.038, 0.014],
                      [0.009, 0.012, 0.013, 0.01, 0.005], lead=0.62)


# ---------- assembly ----------
def grid(h):
    lo, hi = BOUNDS
    xs = B.axis_steps(0.0, hi[0], [(0.0, 0.03, h * 0.35), (0.03, 0.09, h * 0.4), (0.09, 0.13, h * 0.6), (0.13, 0.52, h * 1.3)], h)
    ys = B.axis_steps(lo[1], hi[1], [(lo[1], 0.035, h * 0.22), (0.035, 0.36, h * 1.2), (0.36, 0.42, h * 0.4), (0.42, 0.7, h * 1.2), (1.3, 1.43, h * 0.3)], h)
    zs = B.axis_steps(lo[2], hi[2], [(-0.06, 0.12, h * 0.35), (0.12, 0.36, h * 0.4)], h)
    return xs, ys, zs


HEAD_BOX = (V(-0.05, 1.29, 0.13), V(0.05, 1.44, 0.36))
NECK_BOX = (V(-0.08, 0.8, 0.08), V(0.08, 1.43, 0.37))
LEG_BOX = (V(-0.14, -0.003, -0.08), V(0.14, 0.86, 0.13))
ARM_BOX = (V(0.03, 0.92, 0.04), V(0.52, 1.0, 0.16))
EYE_BOX = (V(-EYE_C[0] - 0.016, EYE_C[1] - 0.016, EYE_C[2] - 0.016), EYE_C + V(0.016, 0.016, 0.016))
TRUNK_BOX = (V(-0.17, 0.68, -0.42), V(0.17, 1.03, 0.28))


def parts(P):
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    ft, cl, wb = local_n(P, *LEG_BOX, feet, 3)
    return {'trunk': local(P, *TRUNK_BOX, trunk), 'neck': local(P, *NECK_BOX, neck), 'head': local(P, *HEAD_BOX, head),
            'bill': local(P, *HEAD_BOX, bill), 'lids': li, 'ball': ba, 'carve': ca,
            'drum': local(P, *LEG_BOX, drum), 'tarsus': local(P, *LEG_BOX, tarsus), 'toes': ft, 'claws': cl, 'web': wb,
            'arm': local(mirror(P), *ARM_BOX, arm)}


def shape(P):
    d = local(P, *TRUNK_BOX, trunk)
    d = smin(d, local(P, *NECK_BOX, neck), 0.035)
    h = local(P, *HEAD_BOX, head)
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    h = smin(h, li, 0.004)
    h = smax(h, -ca, 0.001)
    h = smin(h, ba, 0.0006)
    h = smin(h, local(P, *HEAD_BOX, bill), 0.006)
    d = smin(d, h, 0.012)
    lg = smin(local(P, *LEG_BOX, drum), local(P, *LEG_BOX, tarsus), 0.008)
    ft, cl, wb = local_n(P, *LEG_BOX, feet, 3)
    f = smin(smin(ft, wb, 0.002), cl, 0.001)
    lg = smin(lg, f, 0.006)
    d = smin(d, lg, 0.02)
    d = smin(d, local(mirror(P), *ARM_BOX, arm), 0.016)
    return d


def _head_region(Pm):
    return (Pm[:, 1] > 1.355) & (Pm[:, 2] > 0.16) | (Pm[:, 2] > 0.2) & (Pm[:, 1] > 1.3)


def uv_regions(P):
    """head and bill, neck, trunk, legs and feet, wing arm: unwrapped one by one"""
    Pm = mirror(P)
    lab = np.full(len(P), 2)
    lab[(Pm[:, 1] > 0.95) & (Pm[:, 2] > 0.17)] = 1
    lab[(Pm[:, 1] > 1.0) & (Pm[:, 2] > 0.12)] = 1
    lab[Pm[:, 1] < 0.7] = 3
    lab[Pm[:, 1] < 0.37] = 4
    lab[(Pm[:, 0] > 0.13) & (Pm[:, 1] > 0.92)] = 5
    lab[_head_region(Pm)] = 0
    return lab


def uv_weight(P):
    lab = uv_regions(P)
    return np.choose(lab, [2.6, 1.15, 0.9, 1.0, 1.0, 0.4]).astype(F)


def lowpoly_fix(bm, hi):
    """the decimator can throw a vertex of a thin edge far off the sculpt: put any vertex more than 4 mm from the
    sculpt back on its nearest sculpt vertex"""
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
SPINE = ['tail', 'hips', 'neck', 'neck2', 'neck3', 'neck4', 'head']


def _spine_u(P):
    y, z = P[:, 1], P[:, 2]
    ut = 1.5 + np.clip((z + 0.24) / 0.07, -1, 0)
    un = np.interp(y, [0.86, 0.93, 1.09, 1.25, 1.36, 1.395, 1.45], [1.5, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0]).astype(F)
    yn = y - 0.94 - 0.8 * np.maximum(0, 0.2 - z)
    k = sstep(0.0, 0.03, yn)
    return ut * (1 - k) + un * k


WCFG = dict(groups=[('body', ['trunk', 'neck']), ('head', ['head', 'bill', 'lids']), ('drum', ['drum']), ('tarsus', ['tarsus']),
                    ('foot', ['toes', 'claws', 'web']), ('arm', ['arm'])],
            bias={'body': 0.003}, spine=SPINE, spine_u=_spine_u, head_u=6.0, knee=(0.72, 0.77), hipb=(0.8, 0.85, 0.75),
            ankle_d=(0.43, 0.395), ankle=(0.37, 0.41), pad=(0.035, 0.015), toe_up=(0.022, 0.04), arm=(SH, EL, WR, WT), arm_root=(0.15, 0.11))


def fix_weights(W, wpos, names, G, weld):
    P = wpos.astype(F)
    c = parts(P)
    Wn = B.part_weights(W, wpos, names, c, WCFG)
    # the wing arm's root stays on the hips (as the swan's)
    f = _own(c)['arm'] * (c['arm'] < 0.01) * sstep(0.125, 0.095, np.abs(P[:, 0]))
    hip = np.zeros_like(Wn[0]); hip[list(names).index('hips')] = 1
    return Wn * (1 - f[:, None]) + hip[None, :] * f[:, None]


def bone_tips(P):
    t = {'hips': P['neck'], 'tail': TAILB + V(0, 0.02, -0.1), 'neck': P['neck2'], 'neck2': P['neck3'], 'neck3': P['neck4'], 'neck4': P['head'], 'head': MOUTH}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, -0.004, 0.08)) * m
        t['wing' + s] = P['wfore' + s]; t['wfore' + s] = P['whand' + s]; t['whand' + s] = WT * m
    return t


OWN_KEYS = ['trunk', 'neck', 'head', 'bill', 'drum', 'tarsus', 'toes', 'web', 'claws', 'arm', 'lids']


def _own(c):
    D = np.stack([c[k] for k in OWN_KEYS], 1)
    o = np.argmin(D, 1)
    return {k: (o == i).astype(F) for i, k in enumerate(OWN_KEYS)}


def keep(P):
    Pm = mirror(P)
    R = _own(parts(P))
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    ball = sstep(EYE_R * 0.97, EYE_R * 0.8, de)
    k = 0.42 * R['trunk'] + 0.62 * R['neck'] + 0.78 * R['head'] + 0.82 * R['bill'] + 0.85 * R['lids']
    k += 0.66 * R['drum'] + 0.74 * R['tarsus'] + 0.78 * (R['toes'] + R['web'] + R['claws']) + 0.2 * R['arm']
    rim = sstep(EYE_R + 0.005, EYE_R + 0.0015, de) * sstep(EYE_R * 0.9, EYE_R * 1.0, de) * 0.85
    return np.maximum(k, rim) * (1 - ball)


# ---------- plumage and skin paint ----------
K = {
    'pink': hexc(0xEE6048), 'deep': hexc(0xDC3E2A), 'coral': hexc(0xE44A34), 'pale': hexc(0xF2846C), 'blush': hexc(0xF07460),
    'black': hexc(0x151313), 'bill': hexc(0xF0D6CA), 'billPk': hexc(0xE8968A), 'leg': hexc(0xE05E6C), 'legDk': hexc(0xC04452),
    'nostril': hexc(0x2A1A18), 'lore': hexc(0xF3E2C4),
}


def _wing_mask(Pm, R=None):
    """the folded wing's area on the upper side (above its lower edge along the flank)"""
    y, z = Pm[:, 1], Pm[:, 2]
    ye = _interp(WING_EDGE, z)
    on = sstep(ye - 0.002, ye + 0.004, y) * sstep(0.15 + 0.6 * (y - 0.84) + 0.01, 0.15 + 0.6 * (y - 0.84) - 0.02, z)
    on = on * sstep(0.025, 0.055, np.abs(Pm[:, 0]) + sstep(-0.2, -0.32, z) * 0.1)
    return on * (R['trunk'] if R is not None else sstep(1.02, 0.99, y))


def _flow(P, N, R, wing=False):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    n = len(P)
    fl = np.zeros((n, 3), F)
    side = sat(-N[:, 1] * 0.6 + 0.2)
    fl[:, 1] = -0.2 - 0.55 * side
    fl[:, 2] = -1.0
    breast = sstep(0.08, 0.2, z) * sstep(0.92, 0.84, y)
    fl[:, 1] -= 1.6 * breast
    fl[:, 2] += 0.6 * breast
    wg = _wing_mask(P, R) if wing else np.zeros(n, F)
    fl[:, 1] = fl[:, 1] * (1 - wg) - 0.15 * wg
    fl[:, 2] = fl[:, 2] * (1 - wg) - 1.0 * wg
    # neck: down toward the body; head: from the bill back over the crown
    nk = R['neck']
    fl[:, 1] = fl[:, 1] * (1 - nk) - nk
    fl[:, 2] = fl[:, 2] * (1 - nk) - 0.1 * nk
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    fl = fl * (1 - hd)[:, None] + hd[:, None] * (-HF)[None, :]
    dr = R['drum'] * sstep(0.68, 0.74, y)
    fl[:, 1] = fl[:, 1] * (1 - dr) - dr
    fl[:, 2] = fl[:, 2] * (1 - dr) - 0.25 * dr
    ar = R['arm']
    fl[:, 0] = fl[:, 0] * (1 - ar) + 0.3 * ar
    fl[:, 1] *= (1 - ar)
    fl[:, 2] = fl[:, 2] * (1 - ar) - ar
    return fl / np.maximum(np.linalg.norm(fl, axis=1, keepdims=True), 1e-9)


def _size(P, N, R):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    s = np.full(len(P), 0.016, F)
    s = s - 0.004 * sstep(-0.3, -0.8, N[:, 1])
    s = s - 0.004 * sstep(0.1, 0.2, z) * sstep(0.92, 0.85, y)
    wg = _wing_mask(P, R)
    s = s * (1 - wg) + wg * (0.024 + 0.014 * sstep(0.0, -0.3, z))
    nk = R['neck']
    s = s * (1 - nk) + nk * np.interp(y, [0.9, 1.0, 1.2, 1.4], [0.011, 0.006, 0.0045, 0.0035]).astype(F)
    hd = R['head'] + R['lids']
    s = s * (1 - hd) + hd * 0.0026
    s = s * (1 - R['drum']) + R['drum'] * 0.007
    s = s * (1 - R['arm']) + R['arm'] * 0.01
    return s


def _fshape(P):
    wg = _wing_mask(P)
    return (1.05 - 0.3 * wg).astype(F), (1.0 - 0.45 * wg).astype(F), (1.0 + 0.7 * wg).astype(F)


_pcache = {}


def _plum(P, N, c):
    key = (len(P), float(P[:7].sum()))
    if key not in _pcache:
        R = _own(c)
        Pm = mirror(P)
        Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
        fl = _flow(Pm, Nm, R, wing=True)
        sz = _size(Pm, Nm, R)
        feath = np.clip(R['trunk'] + R['neck'] + R['head'] + R['drum'] * sstep(0.69, 0.73, Pm[:, 1]) + R['arm'], 0, 1)
        pl = B.plumage(Pm, Nm, fl, sz, _fshape, seed=16)
        _pcache.clear()
        _pcache[key] = (R, Pm, Nm, fl, sz, feath, pl)
    return _pcache[key]


def _bare_leg(Pm, R):
    """the bare legs: the tibia below the belly feathers, the ankle, the tarsus and the feet"""
    return np.clip(R['drum'] * sstep(0.735, 0.7, Pm[:, 1]) + R['tarsus'] + R['toes'] + R['web'] + R['claws'], 0, 1)


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n1 = fbm(Pm * 18, 3, 21)
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    # vivid salmon pink, paler up the neck and on the head, deeper coral on the wing coverts and the back
    col = mix(np.tile(K['pink'], (len(P), 1)), K['blush'], sstep(-0.2, -0.8, Nm[:, 1]) * 0.5)
    nk = np.clip(R['neck'] + R['head'] + R['lids'], 0, 1)
    col = mix(col, K['pale'], nk * (0.25 + 0.4 * sstep(1.0, 1.35, y)))
    wg = _wing_mask(Pm, R)
    col = mix(col, K['coral'], wg * 0.75)
    col = mix(col, K['deep'], wg * sstep(0.02, -0.12, z) * sstep(0.88, 0.95, y) * 0.5)
    # the black flight feathers show as a dark wedge along the lower edge of the folded wing toward the tail
    ye = _interp(WING_EDGE, z)
    blk = wg * sstep(-0.1, -0.2, z) * sstep(ye + 0.04, ye + 0.012, y)
    blk = np.maximum(blk, R['arm'] * sstep(0.2, 0.3, x) * 0.0)
    col = mix(col, K['black'], blk * 0.92)
    # feather structure: soft shade in the creases, a paler edge on the coverts
    col = mix(col, col * 0.86, sstep(0.45 * cfa, 1.2 * cfa, -pl['a']) * 0.35 * pl['cov'] * feath)
    col = mix(col, np.minimum(col * 1.12, 1), sstep(0.003, 0.0008, pl['e']) * pl['cov'] * (0.15 + 0.25 * wg) * sstep(0.008, 0.016, cfa))
    col *= (0.97 + 0.06 * fid + 0.04 * (n1 - 0.5))[:, None]
    # the bill: pale pink base, pinker by the face, black from just past the bend to the tip; dark nostril slit
    bl = R['bill']
    s, u = bill_s(Pm)
    bc = mix(np.tile(K['bill'], (len(P), 1)), K['billPk'], sstep(0.03, 0.006, s) * 0.6)
    bc = mix(bc, K['black'], sstep(0.07, 0.078, s + 0.004 * np.sign(u)))
    nq = np.sqrt(((s - 0.022) / 0.01) ** 2 + ((u - 0.0085) / 0.0022) ** 2)
    bc = mix(bc, K['nostril'], sstep(1.0, 0.7, nq) * 0.8)
    col = mix(col, bc, bl)
    # a small pale patch of bare skin in front of the eye
    lo = sstep(0.009, 0.005, np.linalg.norm((Pm - (EYE_C + V(-0.004, -0.003, 0.012))) * V(1.4, 1, 0.8), axis=1)) * np.clip(R['head'] + R['lids'], 0, 1)
    col = mix(col, K['lore'], lo * 0.7)
    # the legs bare and pink, darker at the ankle knob and on the toes' joints
    lg = _bare_leg(Pm, R)
    lc = mix(np.tile(K['leg'], (len(P), 1)), K['legDk'], np.clip(R['tarsus'] * sstep(0.012, 0.0, np.abs(y - HMETA[1])) + 0.25 * (R['toes'] + R['web']), 0, 1) * 0.6)
    lc = mix(lc, lc * 0.92, sstep(0.4, 0.8, n1) * 0.4)
    col = mix(col, lc, lg)
    col = mix(col, K['pale'] * 0.9, R['lids'] * 0.4)
    rough = 0.82 + 0.05 * (n1 - 0.5)
    rough = np.where(bl > 0.5, 0.4, rough)
    rough = np.where(lg > 0.5, 0.5, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _leg_h(P, c, R):
    Pm = mirror(P)
    h = np.zeros(len(P), F)
    rh, rg = B.reticulate(Pm, 0.002, 42)
    sh, sg = B.scutes(Pm, V(0, 1, 0), 0.004, 41)
    lg = R['drum'] * sstep(0.735, 0.7, Pm[:, 1]) + R['tarsus']
    fr = sstep(-0.004, 0.004, Pm[:, 2] - (HMETA[2] + (HPAW[2] - HMETA[2]) * sat((HMETA[1] - Pm[:, 1]) / (HMETA[1] - HPAW[1]))))
    h += lg * (0.00006 * rh - 0.00007 * rg) * (1 - 0.5 * fr) + R['tarsus'] * fr * (0.00008 * sh - 0.00008 * sg)
    th, tg = B.scutes(Pm, nrm([0.15, 0, 1]), 0.0035, 43)
    up = sstep(0.002, 0.006, Pm[:, 1])
    h += R['toes'] * (up * (0.00008 * th - 0.00008 * tg) + (1 - up) * 0.00005 * rh)
    wh, wg = B.reticulate(Pm, 0.0014, 44)
    h += R['web'] * (0.00003 * wh - 0.00004 * wg)
    return h


def detail(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    h = np.zeros(len(P), F)
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    h += B.feather_height(pl, 0.035) * feath * (1 - 0.5 * hd)
    cf = pl['c']
    big = sstep(0.01, 0.02, cf) * pl['cov'] * feath
    h += 0.00006 * sstep(0.0012, 0.0, np.abs(pl['b'])) * sstep(-0.4 * cf, -0.9 * cf, pl['a']) * big
    h += 0.00003 * (fbm(Pm * 500, 2, 61) - 0.5) * hd
    bl = R['bill']
    f1, _ = worley(Pm / 0.0008, 62)
    h -= 0.000015 * sstep(0.3, 0.0, f1) * bl
    h += _leg_h(P, c, R)
    return h


def finish(C, ao, valid):
    return B.finish_ao(C, ao, 0.34)


# ---------- the chick (baby maps) ----------
KB = {'gray': hexc(0x8E8A86), 'pale': hexc(0xB9B4AE), 'dark': hexc(0x6C6864), 'bill': hexc(0x3C3836), 'billPk': hexc(0x8A6E6A), 'leg': hexc(0x77706C)}


def paint_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, _flow(Pm, Nm, R), Nm, 0.003, 73)
    col = mix(np.tile(KB['gray'], (len(P), 1)), KB['pale'], sstep(-0.2, -0.7, Nm[:, 1]))
    col = mix(col, KB['dark'], sstep(0.3, 0.8, Nm[:, 1]) * 0.3)
    col *= (0.74 + 0.38 * dn + 0.1 * tip)[:, None]
    bl = R['bill']
    s, u = bill_s(Pm)
    col = mix(col, mix(np.tile(KB['bill'], (len(P), 1)), KB['billPk'], sstep(0.03, 0.005, s) * 0.5), bl)
    lg = _bare_leg(Pm, R)
    col = mix(col, KB['leg'], lg)
    col = mix(col, KB['dark'] * 0.6, R['lids'] * 0.6)
    rough = np.where(bl + lg > 0.5, 0.55, 0.93)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


# the chick's neck: the game's baby neck maps shorten each neck bone along its own segment, so the adult's S (the neck
# off the bone line) would fold into a zigzag; the chick's neck runs along the bones (z by height) instead
BABY_NECK_Z = [(0.9, 0.2), (0.95, 0.25), (1.09, 0.3), (1.2, 0.27), (1.3, 0.21), (1.36, 0.19), (1.42, 0.19)]


def _neck_z(y):
    return _interp([(k[0], k[1]) for k in NECK_KEYS], y)


def _baby_body(Q):
    d = ellipsoid(Q, V(0, 0.865, -0.03), V(0.13, 0.13, 0.22))
    d = smin(d, sweep(Q, NECK_KEYS, n=160), 0.04)
    return d


def baby_offset(P, N, c):
    """per vertex: where the chick's surface lies relative to the adult's (adult space; see bird.baby_shape)"""
    R0 = _own(c)
    R = dict(R0); R['neck'] = np.zeros(len(P), F)
    Q = mirror(P)
    e = 0.002
    g = np.stack([_baby_body(Q + V(*o)) - _baby_body(Q - V(*o)) for o in ((e, 0, 0), (0, e, 0), (0, 0, e))], 1)
    g /= np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)
    g[:, 0] *= np.sign(P[:, 0] + 1e-9)
    tr = R0['trunk'][:, None]
    N = (N * (1 - tr) + g * tr).astype(F)
    # (the drumstick group is the whole thigh and tibia: the chick's legs are thick, so only the thigh inside the
    # belly is thinned, by a little)
    R['drum'] = R0['drum'] * sstep(0.72, 0.78, P[:, 1]) * 0.4
    d = B.baby_shape(P, N, R, _baby_body, (V(0.062, 0.7, 0.03), V(0.05, 0.82, -0.01), 0.026, 1.5), SH + V(-0.04, -0.03, -0.02), (0.006, 0.008), maxd=0.1)
    y, z = P[:, 1], P[:, 2]
    k = np.clip(R0['neck'] + R0['trunk'] + R0['head'], 0, 1) * sstep(0.93, 1.0, y) * sstep(1.43, 1.39, y) * sstep(0.12, 0.18, z)
    k = k * np.where(y < 1.33, 1.0, 1 - sstep(1.33, 1.37, y) * sstep(0.17, 0.2, z))
    d[:, 2] += (_interp(BABY_NECK_Z, y) - _neck_z(y)) * k
    # a straight bill: the part past the bend turns up about the bend onto the line of the bill's base
    bl = np.clip(R0['bill'], 0, 1) * sstep(0.278, 0.292, z)
    a = np.radians(48.0)
    dy, dz = y - BEND[1], z - BEND[2]
    ny, nz = BEND[1] + dy * np.cos(a) + dz * np.sin(a), BEND[2] - dy * np.sin(a) + dz * np.cos(a)
    d[:, 1] += (ny - y) * bl
    d[:, 2] += (nz - z) * bl
    # thinner toward the tip (the game shortens it)
    t = sstep(0.24, 0.3, z) * np.clip(R0['bill'], 0, 1)
    d[:, 0] -= P[:, 0] * 0.3 * t
    # thick legs: the tibia and the tarsus fatter
    lg = R0['drum'] * sstep(0.74, 0.7, y) + R0['tarsus']
    Ql = Q.copy()
    ax = np.where(y[:, None] > HMETA[1], SHIN + (HMETA - SHIN) * sat((SHIN[1] - y) / (SHIN[1] - HMETA[1]))[:, None],
                  HMETA + (HPAW - HMETA) * sat((HMETA[1] - y) / (HMETA[1] - HPAW[1]))[:, None])
    r = Ql - ax; r[:, 1] = 0
    r[:, 0] *= np.sign(P[:, 0] + 1e-9)
    d += r * (0.45 * lg)[:, None]
    return d


def detail_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, _flow(Pm, Nm, R), Nm, 0.003, 73)
    return 0.0005 * (dn - 0.5) * feath + 0.5 * _leg_h(P, c, R)


FUR = dict(len=0.04, n=6, lean=0.3, tile=0.0032, babyLen=1.0, babyLean=0.3, shade=0.88, babyOnly=True, quality=58)


def fur(P, N, c):
    return B.down_fur(P, c, FUR['len'], ['bill', 'tarsus', 'toes', 'web', 'claws', 'lids'],
                      {'head': 0.6, 'neck': 0.8, 'arm': 0.75, 'drum': 0.35}, (EYE_C, EYE_R), seed=73)


def flow(P, N):
    return B.down_flow(sys.modules[__name__], P, N)


# ---------- feather blades (atlas cells, same order as the game's feather cells) ----------
def _vn(s, t, base, edge, k=0.5):
    return mix(np.tile(base, (len(s), 1)), edge, sstep(0.55, 1.0, np.abs(s)) * k)


def _cells():
    F_ = B.FeatherCell
    bk, bk2 = hexc(0x161414), hexc(0x2C2826)
    pk, pk2, co = hexc(0xEE6650), hexc(0xF2866E), hexc(0xE04A34)

    def prim(s, t, side):
        return _vn(s, t, bk, bk2, 0.4)

    def sec(s, t, side):
        return _vn(s, t, bk, bk2, 0.35)

    def cov(s, t, side):
        return mix(_vn(s, t, co, pk, 0.5), pk2, sstep(0.75, 1.0, t) * 0.2)

    def tert(s, t, side):
        return mix(_vn(s, t, pk, pk2, 0.5), co, sstep(0.4, 0.0, np.abs(s)) * 0.2)

    def tail(s, t, side):
        return _vn(s, t, pk, pk2, 0.5)

    return [F_('flight', prim, w=0.6, outer=0.55, tip=0.42, shaft=hexc(0x2A2624)),
            F_('round', sec, w=0.72, outer=0.8, tip=0.45, shaft=hexc(0x2A2624)),
            F_('round', cov, w=0.8, outer=0.85, tip=0.8, shaft=hexc(0xE88870)),
            F_('round', cov, w=0.8, outer=0.9, tip=1.2, shaft=hexc(0xE88870)),
            F_('flight', tert, w=0.6, outer=0.75, tip=0.55, shaft=hexc(0xF0A08A)),
            F_('round', tail, w=0.62, outer=0.85, tip=0.7, shaft=hexc(0xF0A08A)),
            F_('round', cov, w=0.7, outer=0.9, tip=0.9, shaft=hexc(0xE88870)),
            F_('round', cov, w=0.8, outer=0.9, tip=0.8, shaft=hexc(0xE88870))]


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = hexc(0x99948F), hexc(0x7C7874)
    def dn(s, t, side):
        return mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 8


FEATHER_ATLAS = {'size': (1024, 512), 'out': (512, 256), 'cells': _cells, 'baby': _baby_cells, 'quality': (62, 66, 60),
                 'alpha_quality': 50}


def extra_maps(X):
    """the chick's maps without the adult's folded wing edge and feather creases: on the body and neck they use the
    smooth game mesh normals and less occlusion (as the swan's)"""
    R = _own(X['comps'])
    body = np.clip(R['trunk'] + R['neck'], 0, 1)[:, None] * 0.85
    Nh = X['Nh'] * (1 - body) + X['Nl'] * body
    Nh = (Nh / np.linalg.norm(Nh, axis=1, keepdims=True)).astype(F)
    m = np.zeros((X['R'], X['R'], 1), F)
    m[X['valid']] = body
    m = X['down2'](X['pad'](m, X['valid'], 24))
    ao = 1 - (1 - X['ao']) * (1 - 0.6 * np.clip(m[..., 0] / 0.85, 0, 1))
    B.extra_maps(sys.modules[__name__], dict(X, Nh=Nh, ao=ao))


def export_extra(meta, out_dir, work):
    B.export_extra(sys.modules[__name__], meta, out_dir, work)


MAP_QUALITY = (68, 50)
BABY_MAPS = {'size': 384, 'quality': (64, 50)}


def stats(P, N, c, col):
    return {'lidCol': 0xE89A8C}


def meta(st):
    r = EYE_R
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [0.8, -0.8, 0.12],
                'iris': 0xF0DC6A, 'irisR': 0.82, 'pupilR': 0.34, 'rim': 0x3A2A10, 'lidCol': st['lidCol'], 'babyLidCol': 0x5A5652},
        'collar': {'at': ['neck', 'neck2', 0.35], 'babyAt': 0.5, 'hug': True, 'babyK': 1.8, 'lift': 0.35},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.12, 0.12, 0.12], 'flat': 0xF0907E,
    }
