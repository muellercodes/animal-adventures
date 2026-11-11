# Mute swan, sculpted as a signed distance field around the game's swan skeleton (bird.py has the shared bird
# parts). Units are meters in game rig space (x left, y up, z forward, ground at y = 0). Made in the rig's bind pose:
# the wing arm sticks out flat to the side under the game's feather blades. A long boat shaped body with the folded
# wing lying over its upper side, the thick S shaped neck, the head turned down a little, the orange bill with its
# black base, knob, nail, nostrils and lores. The cygnet: gray-brown down (fur shells), a gray bill without a knob.
# Make it with: VOXEL=0.004 TRIS=6500 TEX=768 BLENDER_PY=... python3 tools/blender/make.py swan
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, loft, sweep, frame, fbm, vnoise, worley, length
import bird as B
from bird import local, local_n, mirror, groove, hexc, mix

ID = 'swan'
BOUNDS = (V(-0.76, -0.002, -0.66), V(0.76, 1.07, 0.6))
PATCHES = [
    (V(0.0, 0.915, 0.395), V(0.04, 1.045, 0.54), 0.0009),     # bill, knob, eye
    (V(0.0, -0.002, -0.1), V(0.21, 0.03, 0.1), 0.001),         # foot
]
BAKE_DIST = (0.008, 0.02, 0.1)
# camera views for preview.py (a big bird: 1.3 m long, the head 1 m up)
PREVIEW = {
    'side': ((3.6, 0.62, 0.0), (0, 0.55, 0.0), 30),
    'front3q': ((2.3, 1.05, 2.5), (0, 0.55, 0.05), 30),
    'rear3q': ((-2.1, 1.3, -2.4), (0, 0.5, -0.05), 30),
    'top': ((0.01, 3.8, 0.0), (0, 0.5, 0.0), 30),
    'head3q': ((0.34, 1.08, 0.74), (0, 0.985, 0.44), 20),
    'headside': ((0.62, 1.0, 0.44), (0, 0.99, 0.44), 16),
    'headfront': ((0.12, 1.06, 0.95), (0, 0.99, 0.44), 16),
    'neck': ((1.8, 0.8, 0.5), (0, 0.72, 0.3), 26),
    'feet': ((0.75, 0.2, 0.55), (0.1, 0.08, -0.05), 30),
}
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
UV_PACK = dict(shape_method='CONCAVE', rotate_method='ANY')
UV_AVERAGE = True

# ---------- landmarks (left side; bone pivots from the rig) ----------
HIPS, TAILB, NECK, NECK2, NECK3, HEAD = V(0, 0.36, 0), V(0, 0.41, -0.4), V(0, 0.45, 0.3), V(0, 0.6, 0.42), V(0, 0.8, 0.375), V(0, 0.97, 0.39)
THIGH, SHIN, HMETA, HPAW = V(0.075, 0.28, -0.08), V(0.085, 0.19, -0.03), V(0.085, 0.1, -0.08), V(0.085, 0.01, -0.06)
SH, EL, WR, WT = V(0.1, 0.5, 0.16), V(0.288, 0.5, 0.16), V(0.523, 0.5, 0.16), V(0.6993, 0.5, 0.16)

# The head is made level in its own frame (u forward from the back of the skull, v up, x across) and turned down by
# HEAD_PITCH, so the bill points down a little at the top of the S shaped neck, as a mute swan holds it.
HEAD_PITCH = np.radians(34.0)
H0 = V(0, 1.027, 0.379)                                              # back of the skull, on the midline
HF = V(0, -np.sin(HEAD_PITCH), np.cos(HEAD_PITCH))                   # forward (u)
HU = V(0, np.cos(HEAD_PITCH), np.sin(HEAD_PITCH))                    # up (v)


def hl(Q):
    """rig space -> head frame as (x, v, u), so the head's lofts run along the third column like the body's"""
    D = Q - H0
    return np.stack([D[:, 0], D @ HU, D @ HF], 1).astype(F)


def hw(x, v, u):
    """head frame -> rig space"""
    return (H0 + V(x, 0, 0) + HU * v + HF * u).astype(F)


def hdir(x, v, u):
    return nrm(V(x, 0, 0) + HU * v + HF * u)


# The knob (the black berry on the forehead) is its own part: KNOB_K scales it (a cob's is bigger than a pen's)
KNOB_K = 1.0
KNOB_H = (V(0, 0.019, 0.088), V(0.0084, 0.0125, 0.019))           # center and radii in the head frame
EYE_H = (0.0196, 0.0058, 0.0615)
EYE_C = hw(*EYE_H)
EYE_R = 0.0056
EYE_DIR = hdir(0.93, 0.16, 0.33)
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_R = 0.0044
MOUTH = hw(0.0, -0.0105, 0.156)
NOSTRIL_H = V(0.0088, 0.0038, 0.108)
FOOT = HPAW + V(0, 0.0, 0.004)
TOES = [dict(a=-27, len=0.106, r=0.0068, r1=0.0036, claw=0.01, n=4), dict(a=0, len=0.128, r=0.0072, r1=0.0038, claw=0.011, n=4),
        dict(a=27, len=0.115, r=0.0068, r1=0.0036, claw=0.01, n=4), dict(a=180, len=0.024, r=0.0045, r1=0.003, claw=0.006, lift=0.008, n=2, hind=True)]

# trunk, a long boat: z, top, yw (height of the widest line), bottom, half width, exponents above and below. The back is
# long and nearly level, the breast deep and round, the rear tapers up into the short pointed tail.
TRUNK = [
    (-0.585, 0.497, 0.488, 0.479, 0.01, 2.0, 2.0),
    (-0.55, 0.501, 0.479, 0.455, 0.036, 2.0, 2.0),
    (-0.5, 0.507, 0.466, 0.408, 0.078, 2.1, 2.0),
    (-0.43, 0.514, 0.45, 0.345, 0.122, 2.2, 2.1),
    (-0.34, 0.519, 0.432, 0.285, 0.156, 2.3, 2.3),
    (-0.22, 0.522, 0.414, 0.236, 0.18, 2.4, 2.6),
    (-0.08, 0.523, 0.404, 0.21, 0.19, 2.4, 2.8),
    (0.06, 0.519, 0.402, 0.206, 0.186, 2.4, 2.7),
    (0.17, 0.507, 0.404, 0.217, 0.172, 2.3, 2.4),
    (0.26, 0.486, 0.408, 0.242, 0.145, 2.2, 2.2),
    (0.33, 0.46, 0.411, 0.288, 0.105, 2.1, 2.1),
    (0.37, 0.438, 0.413, 0.342, 0.06, 2.0, 2.0),
    (0.385, 0.428, 0.414, 0.392, 0.025, 2.0, 2.0),
]
# the folded wing over the upper side: its lower edge along the flank (z, y), the wing a layer WING_T thick above it
WING_EDGE = [(-0.62, 0.478), (-0.52, 0.452), (-0.4, 0.41), (-0.25, 0.372), (-0.08, 0.356), (0.06, 0.356), (0.17, 0.372), (0.25, 0.405)]
WING_T = 0.011
# the S shaped neck as a sweep: path (y, z), section toward the nape (top), toward the throat (bot), half width
NECK_KEYS = [
    (0.4, 0.235, 0.094, 0.094, 0.092, 2.0, 2.0),
    (0.48, 0.33, 0.077, 0.08, 0.077, 2.0, 2.0),
    (0.56, 0.41, 0.059, 0.062, 0.058, 2.0, 2.0),
    (0.64, 0.45, 0.051, 0.053, 0.049, 2.0, 2.0),
    (0.72, 0.447, 0.046, 0.047, 0.044, 2.0, 2.0),
    (0.8, 0.415, 0.042, 0.043, 0.04, 2.0, 2.0),
    (0.87, 0.375, 0.038, 0.039, 0.036, 2.0, 2.0),
    (0.93, 0.349, 0.035, 0.035, 0.033, 2.0, 2.0),
    (0.982, 0.344, 0.031, 0.031, 0.029, 2.0, 2.0),
    (1.012, 0.36, 0.028, 0.028, 0.027, 2.0, 2.0),
    (1.026, 0.38, 0.025, 0.025, 0.024, 2.0, 2.0),
]
# the bill in the head frame (u, top, vw, bottom, half width, exponents): the upper mandible deep at its base under
# the knob, its culmen sloping straight down to the nail, a little wider toward the tip; the lower mandible tucked
# under it
UPPER = [
    (0.077, 0.0158, -0.0005, -0.013, 0.0148, 2.2, 2.4),
    (0.092, 0.0122, -0.0018, -0.0127, 0.0142, 2.5, 2.6),
    (0.11, 0.0077, -0.003, -0.0122, 0.0137, 2.7, 2.8),
    (0.128, 0.0036, -0.0042, -0.0115, 0.0137, 2.9, 2.8),
    (0.143, 0.0, -0.0052, -0.0108, 0.0139, 2.9, 2.6),
    (0.152, -0.0025, -0.0062, -0.0105, 0.0135, 2.6, 2.2),
    (0.158, -0.005, -0.0075, -0.0104, 0.0114, 2.2, 2.0),
    (0.1615, -0.0072, -0.0086, -0.0104, 0.0062, 2.0, 2.0),
]
LOWER = [
    (0.074, -0.0112, -0.0152, -0.0215, 0.0118, 2.2, 2.2),
    (0.093, -0.0116, -0.0149, -0.0198, 0.0113, 2.2, 2.2),
    (0.115, -0.0112, -0.0139, -0.0175, 0.0108, 2.2, 2.2),
    (0.138, -0.0106, -0.0126, -0.015, 0.0099, 2.1, 2.1),
    (0.151, -0.0104, -0.0117, -0.0134, 0.0077, 2.0, 2.0),
    (0.157, -0.0104, -0.0114, -0.0126, 0.0041, 2.0, 2.0),
]
TOMIUM = [(0.076, -0.0128), (0.1, -0.0122), (0.125, -0.0114), (0.148, -0.0106), (0.162, -0.0104)]


def _interp(tab, z):
    zz = np.array([k[0] for k in tab], F); yy = np.array([k[1] for k in tab], F)
    return np.interp(z, zz, yy).astype(F)


def _tom_v(u):
    return _interp(TOMIUM, u)


# ---------- body ----------
def trunk(P):
    Q = mirror(P)
    y, z = Q[:, 1], Q[:, 2]
    d = loft(Q, TRUNK)
    d = smin(d, ellipsoid(Q, V(0, 0.375, 0.232), V(0.154, 0.16, 0.168)), 0.06)          # deep round breast
    d = smin(d, ellipsoid(Q, V(0, 0.235, -0.07), V(0.135, 0.04, 0.24)), 0.06)            # broad flat belly
    # the folded wing: a layer over the upper side with a clean lower edge along the flank, rounded at the shoulder
    ye = _interp(WING_EDGE, z)
    w = smax(d - WING_T, ye - y, 0.0025)
    w = smax(w, z - (0.215 + 0.55 * (y - 0.37)), 0.025)
    # the tertials raised a little over the rump, the long primaries crossing over the base of the tail
    w = smin(w, ellipsoid(Q, V(0.07, 0.503, -0.37), V(0.075, 0.034, 0.15)), 0.04)
    Qs = Q * V(1, 2.4, 1)
    w = smin(w, round_cone(Qs, V(0.075, 0.497 * 2.4, -0.3), V(0.022, 0.5 * 2.4, -0.615), 0.03, 0.007), 0.02)
    return smin(d, w, 0.002)


def neck(P):
    return sweep(mirror(P), NECK_KEYS, n=160)


def head(P):
    L = hl(mirror(P))
    d = ellipsoid(L, V(0, 0.003, 0.044), V(0.0225, 0.025, 0.05))                       # long skull
    d = smax(d, L[:, 1] - 0.0245, 0.008)                                                # flat crown
    d = smin(d, ellipsoid(L, V(0, 0.004, 0.073), V(0.0155, 0.0162, 0.03)), 0.012)       # forehead sloping to the knob
    d = smin(d, ellipsoid(L, V(0.005, -0.009, 0.057), V(0.019, 0.019, 0.036)), 0.01)    # cheeks
    d = smin(d, ellipsoid(L, V(0, -0.017, 0.068), V(0.0115, 0.0105, 0.032)), 0.01)      # chin
    return d


def bill(P):
    L = hl(mirror(P))
    x, v, u = L[:, 0], L[:, 1], L[:, 2]
    d = smin(loft(L, UPPER), loft(L, LOWER), 0.0012)
    vt = _tom_v(u)
    d = d + groove(v - vt, 0.0006, 0.0006) * sstep(0.08, 0.09, u)
    # the nostril: a long oval pit near the culmen
    nq = np.sqrt(((u - NOSTRIL_H[2]) / 0.0058) ** 2 + ((v - NOSTRIL_H[1]) / 0.0021) ** 2)
    d = d + 0.0014 * sstep(1.0, 0.4, nq) * sstep(0.004, 0.0, np.abs(x - NOSTRIL_H[0]))
    return d


def knob(P):
    """the black knob (berry) on the forehead at the base of the bill; KNOB_K scales it, sitting on the same base"""
    L = hl(mirror(P))
    c, r = KNOB_H
    return ellipsoid(L, c + V(0, (KNOB_K - 1) * r[1] * 0.6, 0), r * KNOB_K)


def nail(P):
    L = hl(mirror(P))
    return ellipsoid(L, V(0, -0.0063, 0.1545), V(0.0086, 0.0042, 0.0074))


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
    Q = mirror(P)
    return round_cone(Q, V(0.078, 0.26, -0.045), V(0.085, 0.118, -0.072), 0.05, 0.019)


def tarsus(P):
    Q = mirror(P)
    j = round_cone(Q, V(0.085, 0.122, -0.074), HMETA + V(0, -0.003, 0.0), 0.0125, 0.013)
    t = B.flat_cone(Q, HMETA + V(0, -0.003, 0.0), HPAW + V(0, 0.006, -0.002), 0.011, 0.0095, 0.72, up=(1, 0, 0))
    pad = ellipsoid(Q, HPAW + V(0, -0.001, 0.002), V(0.013, 0.009, 0.015))
    return smin(smin(j, t, 0.008), pad, 0.007)


def feet(P):
    Q = mirror(P)
    tt, cl, _ = B.toes(Q, FOOT, [t for t in TOES if not t.get('hind')])
    ht, hc, _ = B.toes(Q, HPAW + V(0, 0.012, -0.008), [t for t in TOES if t.get('hind')], ground=0.008)
    wb = B.web(Q, FOOT, TOES, 0.0022, reach=0.94, sag=0.14)
    return np.minimum(tt, ht), np.minimum(cl, hc), wb


def arm(P):
    Q = mirror(P)
    # (a slim root where the arm leaves the body: the part of it that stays with the body when the wing folds is small)
    return B.wing_arm(Q, [SH + V(-0.03, -0.008, -0.008), SH + V(0.09, 0, 0), EL, WR, WT], [0.032, 0.06, 0.064, 0.05, 0.018],
                      [0.011, 0.016, 0.017, 0.013, 0.006], lead=0.62)


# ---------- assembly ----------
def grid(h):
    lo, hi = BOUNDS
    xs = B.axis_steps(0.0, hi[0], [(0.0, 0.23, h * 0.8), (0.24, 0.76, h * 1.4)], h)
    ys = B.axis_steps(lo[1], hi[1], [(lo[1], 0.03, h * 0.3), (0.03, 0.13, h * 0.6), (0.34, 0.39, h * 0.6), (0.92, 1.05, h * 0.5)], h)
    zs = B.axis_steps(lo[2], hi[2], [(-0.1, 0.1, h * 0.6), (0.34, 0.55, h * 0.5)], h)
    return xs, ys, zs


HEAD_BOX = (V(-0.06, 0.9, 0.3), V(0.06, 1.07, 0.56))
NECK_BOX = (V(-0.13, 0.33, 0.14), V(0.13, 1.07, 0.5))
LEG_BOX = (V(-0.21, -0.003, -0.13), V(0.21, 0.3, 0.1))
ARM_BOX = (V(0.04, 0.44, 0.06), V(0.9, 0.56, 0.24))
EYE_BOX = (V(-EYE_C[0] - 0.018, EYE_C[1] - 0.018, EYE_C[2] - 0.018), EYE_C + V(0.018, 0.018, 0.018))
TRUNK_BOX = (V(-0.25, 0.17, -0.66), V(0.25, 0.56, 0.42))


def parts(P):
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    ft, cl, wb = local_n(P, *LEG_BOX, feet, 3)
    return {'trunk': local(P, *TRUNK_BOX, trunk), 'neck': local(P, *NECK_BOX, neck), 'head': local(P, *HEAD_BOX, head),
            'bill': local(P, *HEAD_BOX, bill), 'knob': local(P, *HEAD_BOX, knob), 'nail': local(P, *HEAD_BOX, nail),
            'lids': li, 'ball': ba, 'carve': ca,
            'drum': local(P, *LEG_BOX, drum), 'tarsus': local(P, *LEG_BOX, tarsus), 'toes': ft, 'claws': cl, 'web': wb,
            'arm': local(mirror(P), *ARM_BOX, arm)}


def shape(P):
    d = local(P, *TRUNK_BOX, trunk)
    d = smin(d, local(P, *NECK_BOX, neck), 0.05)
    h = local(P, *HEAD_BOX, head)
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    h = smin(h, li, 0.004)
    h = smax(h, -ca, 0.001)
    h = smin(h, ba, 0.0006)
    bl = smin(local(P, *HEAD_BOX, bill), local(P, *HEAD_BOX, nail), 0.002)
    bl = smin(bl, local(P, *HEAD_BOX, knob), 0.007)
    h = smin(h, bl, 0.005)
    d = smin(d, h, 0.02)
    lg = smin(local(P, *LEG_BOX, drum), local(P, *LEG_BOX, tarsus), 0.012)
    ft, cl, wb = local_n(P, *LEG_BOX, feet, 3)
    f = smin(smin(ft, wb, 0.002), cl, 0.0012)
    lg = smin(lg, f, 0.006)
    d = smin(d, lg, 0.025)
    d = smin(d, local(mirror(P), *ARM_BOX, arm), 0.02)
    return d


def _head_region(Pm):
    L = hl(Pm)
    return (L[:, 2] > -0.012) & (Pm[:, 1] > 0.9) & (np.abs(Pm[:, 0]) < 0.045)


def uv_regions(P):
    """head and bill, neck, trunk, legs and feet, wing arm: unwrapped one by one"""
    Pm = mirror(P)
    lab = np.full(len(P), 2)
    lab[(Pm[:, 1] > 0.47) & (Pm[:, 2] > 0.2)] = 1
    lab[Pm[:, 1] < 0.2] = 3
    lab[(Pm[:, 0] > 0.17) & (Pm[:, 1] > 0.44)] = 5
    lab[_head_region(Pm)] = 0
    return lab


def uv_weight(P):
    Pm = mirror(P)
    lab = uv_regions(P)
    return np.choose(lab, [2.5, 1.05, 0.9, 0.85, 0.85, 0.4]).astype(F)


def lowpoly_fix(bm, hi):
    """the decimator can throw a vertex of a thin edge (the wing arm's tip) far off the sculpt: put any vertex more
    than 4 mm from the sculpt back on its nearest sculpt vertex"""
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
    ut = 1.5 + np.clip((z + 0.4) / 0.07, -1, 0)
    un = np.interp(y, [0.36, 0.45, 0.6, 0.8, 0.965, 1.07], [1.5, 2.0, 3.0, 4.0, 5.0, 6.0]).astype(F)
    yn = y - 0.44 - 0.8 * np.maximum(0, 0.29 - z)
    k = sstep(0.0, 0.04, yn)
    return ut * (1 - k) + un * k


WCFG = dict(groups=[('body', ['trunk', 'neck']), ('head', ['head', 'bill', 'knob', 'nail', 'lids']), ('drum', ['drum']), ('tarsus', ['tarsus']),
                    ('foot', ['toes', 'claws', 'web']), ('arm', ['arm'])],
            bias={'body': 0.003}, spine=SPINE, spine_u=_spine_u, head_u=5.35, knee=(0.18, 0.21), hipb=(0.205, 0.24, 0.75),
            ankle_d=(0.125, 0.108), ankle=(0.09, 0.115), pad=(0.026, 0.01), toe_up=(0.016, 0.03), arm=(SH, EL, WR, WT), arm_root=(0.2, 0.15))


def fix_weights(W, wpos, names, G, weld):
    P = wpos.astype(F)
    c = parts(P)
    Wn = B.part_weights(W, wpos, names, c, WCFG)
    # the wing arm's root (inside the folded wing's layer and just out of it) stays on the hips: with part of it on
    # the shoulder bone the folded wing pulled a dent into the back
    # (only vertices that are on the arm: far from every part, all distances are equal and argmin would pick it)
    f = _own(c)['arm'] * (c['arm'] < 0.01) * sstep(0.165, 0.13, np.abs(P[:, 0]))
    hip = np.zeros_like(Wn[0]); hip[list(names).index('hips')] = 1
    return Wn * (1 - f[:, None]) + hip[None, :] * f[:, None]


def bone_tips(P):
    t = {'hips': P['neck'], 'tail': TAILB + V(0, 0.03, -0.12), 'neck': P['neck2'], 'neck2': P['neck3'], 'neck3': P['head'], 'head': MOUTH}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, -0.006, 0.12)) * m
        t['wing' + s] = P['wfore' + s]; t['wfore' + s] = P['whand' + s]; t['whand' + s] = WT * m
    return t


OWN_KEYS = ['trunk', 'neck', 'head', 'bill', 'knob', 'nail', 'drum', 'tarsus', 'toes', 'web', 'claws', 'arm', 'lids']


def _own(c):
    D = np.stack([c[k] for k in OWN_KEYS], 1)
    o = np.argmin(D, 1)
    return {k: (o == i).astype(F) for i, k in enumerate(OWN_KEYS)}


def keep(P):
    Pm = mirror(P)
    R = _own(parts(P))
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    ball = sstep(EYE_R * 0.97, EYE_R * 0.8, de)
    k = 0.42 * R['trunk'] + 0.6 * R['neck'] + 0.78 * R['head'] + 0.8 * (R['bill'] + R['knob'] + R['nail']) + 0.85 * R['lids']
    k += 0.55 * R['drum'] + 0.72 * R['tarsus'] + 0.78 * (R['toes'] + R['web'] + R['claws']) + 0.2 * R['arm']
    rim = sstep(EYE_R + 0.005, EYE_R + 0.0015, de) * sstep(EYE_R * 0.9, EYE_R * 1.0, de) * 0.85
    return np.maximum(k, rim) * (1 - ball)


# ---------- plumage and skin paint ----------
K = {
    'white': hexc(0xECEBE6), 'shade': hexc(0xCDCECB), 'warm': hexc(0xF3F0E8), 'buff': hexc(0xD9C7A2), 'bill': hexc(0xE8501E),
    'billDk': hexc(0xC23E18), 'billHi': hexc(0xF06A2A), 'black': hexc(0x131211), 'leg': hexc(0x242221), 'legHi': hexc(0x3A3633),
    'nostril': hexc(0x0E0B0A),
}


def _wing_mask(Pm, R=None):
    """the folded wing's area on the upper side (above its lower edge along the flank)"""
    y, z = Pm[:, 1], Pm[:, 2]
    ye = _interp(WING_EDGE, z)
    on = sstep(ye - 0.002, ye + 0.004, y) * sstep(0.215 + 0.55 * (y - 0.37) + 0.01, 0.215 + 0.55 * (y - 0.37) - 0.02, z)
    on = on * sstep(0.03, 0.07, np.abs(Pm[:, 0]) + sstep(-0.3, -0.45, z) * 0.1)
    return on * (R['trunk'] if R is not None else sstep(0.58, 0.55, y))


def _flow(P, N, R, wing=False):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    n = len(P)
    fl = np.zeros((n, 3), F)
    side = sat(-N[:, 1] * 0.6 + 0.2)
    fl[:, 1] = -0.2 - 0.55 * side
    fl[:, 2] = -1.0
    breast = sstep(0.16, 0.28, z) * sstep(0.46, 0.35, y)
    fl[:, 1] -= 1.6 * breast
    fl[:, 2] += 0.6 * breast
    # folded wing: long feathers lying straight back along the side
    wg = _wing_mask(P, R) if wing else np.zeros(n, F)
    fl[:, 1] = fl[:, 1] * (1 - wg) - 0.12 * wg
    fl[:, 2] = fl[:, 2] * (1 - wg) - 1.0 * wg
    # neck: down toward the body; head: from the bill back over the crown and down the face
    nk = R['neck']
    fl[:, 1] = fl[:, 1] * (1 - nk) - nk
    fl[:, 2] = fl[:, 2] * (1 - nk) - 0.2 * nk
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    fl = fl * (1 - hd)[:, None] + hd[:, None] * (-HF)[None, :]
    dr = R['drum']
    fl[:, 1] = fl[:, 1] * (1 - dr) - dr
    fl[:, 2] = fl[:, 2] * (1 - dr) - 0.25 * dr
    ar = R['arm']
    fl[:, 0] = fl[:, 0] * (1 - ar) + 0.3 * ar
    fl[:, 1] *= (1 - ar)
    fl[:, 2] = fl[:, 2] * (1 - ar) - ar
    return fl / np.maximum(np.linalg.norm(fl, axis=1, keepdims=True), 1e-9)


def _size(P, N, R):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    s = np.full(len(P), 0.02, F)
    s = s - 0.005 * sstep(-0.3, -0.8, N[:, 1])                                           # belly
    s = s - 0.005 * sstep(0.2, 0.3, z) * sstep(0.44, 0.38, y)                            # breast
    wg = _wing_mask(P, R)
    s = s * (1 - wg) + wg * (0.03 + 0.016 * sstep(0.1, -0.35, z))                         # coverts to long tertials
    nk = R['neck']
    s = s * (1 - nk) + nk * np.interp(y, [0.42, 0.55, 0.75, 0.95], [0.016, 0.009, 0.0055, 0.004]).astype(F)
    hd = R['head'] + R['lids']
    s = s * (1 - hd) + hd * 0.0028
    s = s * (1 - R['drum']) + R['drum'] * 0.008
    s = s * (1 - R['arm']) + R['arm'] * 0.012
    return s


def _fshape(P):
    """feather width, tip roundness and length factors: the folded wing's feathers long and narrower"""
    wg = _wing_mask(P)
    return (1.05 - 0.3 * wg).astype(F), (1.0 - 0.45 * wg).astype(F), (1.0 + 0.6 * wg).astype(F)


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
        pl = B.plumage(Pm, Nm, fl, sz, _fshape, seed=6)
        _pcache.clear()
        _pcache[key] = (R, Pm, Nm, fl, sz, feath, pl)
    return _pcache[key]


def _face(Pm, R):
    """the black parts of the face, in the head frame: the bill's base, the bare lores from the bill to the eye and
    the ring round the eye, the lower mandible, the nostrils (the knob and the nail are their own parts)"""
    L = hl(Pm)
    x, v, u = L[:, 0], L[:, 1], L[:, 2]
    bl = R['bill']
    ub = 0.094 + 0.3 * np.clip(v + 0.012, 0, 0.03)
    base = sstep(ub + 0.0012, ub - 0.0012, u)
    lower = sstep(_tom_v(u) - 0.0002, _tom_v(u) - 0.0022, v)
    nq = np.sqrt(((u - NOSTRIL_H[2]) / 0.0062) ** 2 + ((v - NOSTRIL_H[1]) / 0.0024) ** 2)
    nos = sstep(1.0, 0.75, nq) * sstep(0.0045, 0.002, np.abs(x - NOSTRIL_H[0]))
    eu, ev = EYE_H[2], EYE_H[1]
    t = np.clip((u - eu) / (0.084 - eu), 0, 1)
    vc = ev + (-0.0005 - ev) * t
    hh = 0.0042 + (0.0112 - 0.0042) * t
    lore = sstep(hh + 0.0008, hh - 0.0008, np.abs(v - vc)) * sstep(eu - 0.003, eu + 0.001, u) * sstep(0.092, 0.086, u) * sstep(0.0035, 0.0065, np.abs(x))
    ring = sstep(EYE_R + 0.0022, EYE_R + 0.0012, np.linalg.norm(Pm - EYE_C, axis=1))
    hd = np.clip(R['head'] + R['lids'] + bl, 0, 1)
    black = np.clip(bl * np.maximum(base, lower) + hd * np.maximum(lore, ring), 0, 1)
    return black, nos * bl


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n1 = fbm(Pm * 20, 3, 11)
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    col = mix(np.tile(K['white'], (len(P), 1)), K['warm'], sstep(0.2, 0.8, Nm[:, 1]) * 0.4)
    col = mix(col, K['shade'], sstep(-0.3, -0.85, Nm[:, 1]) * 0.35)
    # soft gray in the creases of the feathers (white plumage shows its structure as shadow only)
    wg = _wing_mask(Pm, R)
    col = mix(col, K['shade'] * 0.92, sstep(0.45 * cfa, 1.2 * cfa, -pl['a']) * (0.3 + 0.15 * wg) * pl['cov'])
    # a soft shadow line along each feather's edge (the folded wing's long feathers show their outlines)
    col = mix(col, K['shade'] * 0.86, sstep(0.0035, 0.0008, pl['e']) * pl['cov'] * (0.12 + 0.2 * wg) * sstep(0.008, 0.016, cfa))
    col *= (0.975 + 0.05 * fid)[:, None]
    # a faint rusty wash on the head and the front of the neck (iron stain from dabbling)
    nk = np.clip(R['neck'] + R['head'], 0, 1)
    col = mix(col, K['buff'], nk * sstep(0.8, 0.98, y) * (0.12 + 0.12 * n1) * sstep(-0.5, 0.4, Nm[:, 2]))
    # bill: orange red, a little darker at the edges, black base, lower mandible, nostrils, lores, knob, nail
    bl = R['bill']
    L = hl(Pm)
    bcol = mix(np.tile(K['bill'], (len(P), 1)), K['billDk'], sstep(0.3, 0.9, np.abs(Nm[:, 0])) * 0.35)
    bcol = mix(bcol, K['billHi'], sstep(0.4, 0.9, L[:, 1] / 0.012) * 0.25)
    col = mix(col, bcol, bl)
    face, nos = _face(Pm, R)
    blk = np.clip(R['knob'] + R['nail'] + face, 0, 1)
    col = mix(col, K['black'], blk)
    col = mix(col, K['nostril'], nos)
    # legs and feet black
    lg = np.clip(R['tarsus'] + R['toes'] + R['web'] + R['claws'], 0, 1)
    col = mix(col, mix(np.tile(K['leg'], (len(P), 1)), K['legHi'], sstep(0.5, 0.9, n1) * 0.4), lg)
    col = mix(col, K['black'], R['lids'] * 0.7)
    rough = 0.82 + 0.05 * (n1 - 0.5)
    rough = np.where(bl > 0.5, 0.42, rough)
    rough = np.where(blk > 0.5, 0.38, rough)
    rough = np.where(lg > 0.5, 0.5, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _leg_h(P, c, R):
    Pm = mirror(P)
    h = np.zeros(len(P), F)
    rh, rg = B.reticulate(Pm, 0.0026, 42)
    sh, sg = B.scutes(Pm, V(0, 1, 0), 0.005, 41)
    fr = sstep(-0.006, 0.004, Pm[:, 2] - (HMETA[2] + (HPAW[2] - HMETA[2]) * sat((HMETA[1] - Pm[:, 1]) / (HMETA[1] - HPAW[1]))))
    h += R['tarsus'] * (0.00008 * rh - 0.00009 * rg) * (1 - 0.5 * fr) + R['tarsus'] * fr * (0.0001 * sh - 0.0001 * sg)
    th, tg = B.scutes(Pm, nrm([0.15, 0, 1]), 0.004, 43)
    up = sstep(0.002, 0.006, Pm[:, 1])
    h += R['toes'] * (up * (0.0001 * th - 0.0001 * tg) + (1 - up) * 0.00006 * rh)
    wh, wg = B.reticulate(Pm, 0.0016, 44)
    h += R['web'] * (0.00003 * wh - 0.00004 * wg)
    return h


def detail(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    h = np.zeros(len(P), F)
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    h += B.feather_height(pl, 0.03) * feath * (1 - 0.5 * hd)
    cf = pl['c']
    big = sstep(0.01, 0.02, cf) * pl['cov'] * feath
    bar = np.sin(2 * np.pi * (pl['a'] * 0.7 + np.abs(pl['b'])) / 0.0016)
    h -= 0.00002 * sstep(0.3, 1.0, bar) * big
    h += 0.00007 * sstep(0.0012, 0.0, np.abs(pl['b'])) * sstep(-0.4 * cf, -0.9 * cf, pl['a']) * big
    h += 0.00003 * (fbm(Pm * 500, 2, 61) - 0.5) * hd
    bl = R['bill']
    f1, _ = worley(Pm / 0.0009, 62)
    h -= 0.00002 * sstep(0.3, 0.0, f1) * bl
    h += 0.00006 * (fbm(Pm * 600, 2, 63) - 0.5) * R['knob']
    h += _leg_h(P, c, R)
    return h


def finish(C, ao, valid):
    return B.finish_ao(C, ao, 0.32)


# ---------- the cygnet (baby maps) ----------
KB = {'gray': hexc(0x857A6E), 'pale': hexc(0xADA396), 'dark': hexc(0x62594F), 'bill': hexc(0x4A4643), 'billDk': hexc(0x2A2725), 'leg': hexc(0x3A3634)}


def paint_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, _flow(Pm, Nm, R), Nm, 0.003, 73)
    col = mix(np.tile(KB['gray'], (len(P), 1)), KB['pale'], sstep(-0.2, -0.7, Nm[:, 1]))
    col = mix(col, KB['dark'], sstep(0.3, 0.8, Nm[:, 1]) * 0.3)
    col *= (0.74 + 0.38 * dn + 0.1 * tip)[:, None]
    bl = np.clip(R['bill'] + R['nail'], 0, 1)
    # the cygnet's bill: slate gray, darker at its base and on the nail
    L = hl(Pm)
    bc = mix(np.tile(KB['bill'], (len(P), 1)), KB['billDk'], np.clip(sstep(0.09, 0.08, L[:, 2]) + R['nail'] * 0.7, 0, 1))
    col = mix(col, bc, bl)
    lg = np.clip(R['tarsus'] + R['toes'] + R['web'] + R['claws'], 0, 1)
    col = mix(col, KB['leg'], lg)
    col = mix(col, KB['dark'] * 0.6, R['lids'] * 0.6)
    rough = np.where(bl + lg > 0.5, 0.55, 0.93)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


# the cygnet's neck: the game's baby maps shorten each neck bone along its own segment and thicken it across, so the
# adult's S (the neck well off the bone line) would fold into a zigzag; the baby's neck runs along the bones instead
BABY_NECK_Z = [(0.4, 0.235), (0.45, 0.3), (0.6, 0.41), (0.7, 0.395), (0.8, 0.385), (0.9, 0.385), (0.97, 0.385), (1.03, 0.385)]


def _neck_z(y):
    return _interp([(k[0], k[1]) for k in NECK_KEYS], y)


def _baby_body(Q):
    d = ellipsoid(Q, V(0, 0.37, 0.0), V(0.17, 0.165, 0.33))
    d = smin(d, sweep(Q, NECK_KEYS, n=160), 0.06)
    return d


def _baby_extra(Q, Nm, R):
    """(cygnets have no knob: baby_offset brings it down onto the culmen line)"""
    return np.zeros_like(Q)


def baby_offset(P, N, c):
    """per vertex: where the baby's surface lies relative to the adult's (adult space; see bird.baby_shape)"""
    # the neck keeps its own shape (the game's baby neck maps make it short and thick): pushed onto a fat neck the
    # S curve folds up when it shortens
    R0 = _own(c)
    R = dict(R0); R['neck'] = np.zeros(len(P), F)
    # the body walks onto the egg along the egg's own normals (along the sculpt's normals the folded wing's lower
    # edge, where they point down, kept a crease along the flank)
    Q = mirror(P)
    e = 0.002
    g = np.stack([_baby_body(Q + V(*o)) - _baby_body(Q - V(*o)) for o in ((e, 0, 0), (0, e, 0), (0, 0, e))], 1)
    g /= np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)
    g[:, 0] *= np.sign(P[:, 0] + 1e-9)
    tr = R0['trunk'][:, None]
    N = (N * (1 - tr) + g * tr).astype(F)
    d = B.baby_shape(P, N, R, _baby_body, (V(0.085, 0.1, -0.08), V(0.082, 0.27, -0.04), 0.014, 1.3), SH + V(-0.05, -0.03, -0.02), (0.007, 0.009), maxd=0.12, extra=_baby_extra)
    # the neck straightened onto the bone line (see BABY_NECK_Z), fading out into the breast and under the head
    y, z = P[:, 1], P[:, 2]
    # (under the head only the nape moves: the face and the eyes stay where the game's eyes are)
    k = np.clip(R0['neck'] + R0['trunk'] + R0['head'], 0, 1) * sstep(0.44, 0.52, y) * sstep(1.07, 1.02, y) * sstep(0.12, 0.2, z)
    k = k * np.where(y < 0.9, 1.0, 1 - sstep(0.9, 0.94, y) * sstep(0.385, 0.41, z))
    d[:, 2] += (_interp(BABY_NECK_Z, y) - _neck_z(y)) * k
    L = hl(mirror(P))
    x, v, u = L[:, 0], L[:, 1], L[:, 2]
    hd = sstep(0.9, 0.94, y)
    # no knob: everything above the culmen line at the bill's base comes down onto it
    vt = _interp([(r[0], r[1]) for r in UPPER], u) + 0.001
    kn = np.clip(R0['knob'] + R0['bill'], 0, 1) * sstep(0.074, 0.08, u) * hd
    d -= HU[None, :] * (np.maximum(v - vt, 0) * kn)[:, None]
    # a smaller bill: narrower and shallower toward the tip (the game shortens it)
    t = sstep(0.078, 0.11, u) * hd
    d[:, 0] -= P[:, 0] * 0.42 * t
    vm = _tom_v(u)
    d -= HU[None, :] * ((v - vm) * 0.22 * t * np.clip(R0['bill'] + R0['nail'], 0, 1))[:, None]
    return d


def detail_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, _flow(Pm, Nm, R), Nm, 0.003, 73)
    return 0.0005 * (dn - 0.5) * feath + 0.5 * _leg_h(P, c, R)


# the cygnet's gray down as fur shells (babyOnly: the adult keeps its feathers)
FUR = dict(len=0.05, n=6, lean=0.3, tile=0.0036, babyLen=1.0, babyLean=0.3, shade=0.88, babyOnly=True, quality=58)


def fur(P, N, c):
    # (the knob is down covered forehead on the cygnet, which has none)
    return B.down_fur(P, c, FUR['len'], ['bill', 'nail', 'tarsus', 'toes', 'web', 'claws', 'lids'],
                      {'head': 0.6, 'knob': 0.35, 'neck': 0.8, 'arm': 0.75, 'drum': 0.6}, (EYE_C, EYE_R), seed=73)


def flow(P, N):
    return B.down_flow(sys.modules[__name__], P, N)


# ---------- feather blades (atlas cells, same order as the game's feather cells) ----------
def _vn(s, t, base, edge, k=0.5):
    return mix(np.tile(base, (len(s), 1)), edge, sstep(0.55, 1.0, np.abs(s)) * k)


def _cells():
    F_ = B.FeatherCell
    w, sh, wm = hexc(0xEDECE7), hexc(0xD4D4D0), hexc(0xF5F3EE)

    def prim(s, t, side):
        return mix(_vn(s, t, w, sh, 0.5), hexc(0xC8C8C4), sstep(0.5, 1.0, t) * 0.25)

    def sec(s, t, side):
        return _vn(s, t, w, sh, 0.4)

    def cov(s, t, side):
        return mix(_vn(s, t, w, wm, 0.5), sh, sstep(0.4, 0.0, np.abs(s)) * 0.15)

    def tail(s, t, side):
        return _vn(s, t, hexc(0xE4E3DE), sh, 0.5)

    return [F_('flight', prim, w=0.62, outer=0.55, tip=0.42, shaft=hexc(0xD8D6D0)),
            F_('round', sec, w=0.72, outer=0.8, tip=0.45, shaft=hexc(0xDAD8D2)),
            F_('round', cov, w=0.8, outer=0.85, tip=0.8, shaft=hexc(0xDAD8D2)),
            F_('round', cov, w=0.8, outer=0.9, tip=1.2, shaft=hexc(0xDAD8D2)),
            F_('round', sec, w=0.76, outer=0.85, tip=0.6, shaft=hexc(0xDAD8D2)),
            F_('round', tail, w=0.62, outer=0.85, tip=0.7, shaft=hexc(0xDAD8D2)),
            F_('round', cov, w=0.7, outer=0.9, tip=0.9, shaft=hexc(0xDAD8D2)),
            F_('round', cov, w=0.8, outer=0.9, tip=0.8, shaft=hexc(0xDAD8D2))]


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = hexc(0xA39A90), hexc(0x8A8278)
    def dn(s, t, side):
        return mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 8


FEATHER_ATLAS = {'size': (1024, 512), 'out': (512, 256), 'cells': _cells, 'baby': _baby_cells, 'quality': (58, 66, 60),
                 'alpha_quality': 50}


def extra_maps(X):
    """the baby maps without the adult's folded wing edge and feather creases (baked into the hi normals and the
    occlusion): on the body and neck the cygnet's maps use the smooth game mesh normals and less occlusion"""
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
BABY_MAPS = {'size': 512, 'quality': (66, 52)}


def stats(P, N, c, col):
    return {'lidCol': 0x141312}


def meta(st):
    r = EYE_R
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [0.8, -0.8, 0.12],
                'iris': 0x2A1A10, 'irisR': 0.88, 'pupilR': 0.45, 'rim': 0x0A0806, 'lidCol': st['lidCol'], 'babyLidCol': 0x5A544E},
        'collar': {'at': ['neck', 'neck2', 0.5], 'babyAt': 0.6, 'hug': True, 'babyK': 1.8, 'lift': 0.35},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.12, 0.12, 0.12], 'flat': 0xE0DED8,
    }
