# A leopard gecko, sculpted as a signed distance field around the game's gecko skeleton
# (tools/blender/work/gecko-rig.json). Units are meters in game rig space (x left, y up, z forward, ground at y = 0);
# about 22 cm from the snout to the tail tip. Built from the lizard (lizard.py): one loft from the tail tip to the snout
# (no tail tube), the head's features on top of it, legs as chains, toes with claws, the skin as a height field per
# texel; the lizard's own file is not touched (its helpers are imported).
# Shape: a wide, rounded head with big bulging eyes in thick lidded sockets (leopard geckos have real eyelids), a
# small ear opening, a wide mouth curving up at the back; a chunky body held up on slender legs; slender toes without
# sticky pads and small claws; a fat, carrot-shaped tail in rings (annuli). Skin: fine granules with raised round
# tubercles over the back, the legs and in rings round the tail, smooth small scales underneath.
# Paint: yellow with black leopard spots, white flanks and belly, the tail pale lilac-white with yellow and spotted
# bands; the spots differ from side to side (SIDES, as the cow). The hatchling has its own color map: broad black-brown
# bands across a yellow body and a black and white banded tail, a dark head.
# Make it with: VOXEL=0.0004 TRIS=4400 TEX=512 BLENDER_PY=... python3 tools/blender/make.py gecko
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, chain, loft, fbm, vnoise, length, _hash
from lizard import _box, _local, _local_n, _mirror, _interp, _cells, _rows, _hex, _mix

ID = 'gecko'
BOUNDS = (V(-0.05, -0.001, -0.146), V(0.05, 0.036, 0.088))
PATCHES = [
    (V(0.004, 0.019, 0.055), V(0.0145, 0.0325, 0.071), 0.0001),     # eye and lids
    (V(0.0, 0.015, 0.072), V(0.008, 0.026, 0.087), 0.00012),       # snout tip, nostril, lips
    (V(0.006, 0.016, 0.042), V(0.0135, 0.027, 0.053), 0.00012),    # ear opening
    (V(0.021, -0.001, 0.03), V(0.042, 0.007, 0.052), 0.00012),     # front foot
    (V(0.025, -0.001, -0.033), V(0.05, 0.007, -0.008), 0.00012),   # hind foot
]
BAKE_CAGE = (0.0008, 0.003)
AO_DIST = 0.012
SIDES = True

# ---------- landmarks ----------
EYE_C = V(0.0102, 0.0272, 0.0612)
EYE_R = 0.0041
EYE_DIR = nrm([0.9, 0.34, 0.26])
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_W, LID_H, LID_OFF = 0.0039, 0.0033, 0.0001
NOSTRIL = V(0.0028, 0.0228, 0.0772)
EAR = V(0.0108, 0.0215, 0.0478)
MOUTH = V(0.0, 0.0186, 0.0785)
WRIST = V(0.0268, 0.0042, 0.0362)
HAND = V(0.0285, 0.0020, 0.0408)
ANKLE = V(0.0318, 0.0044, -0.0262)
FOOT = V(0.0345, 0.0020, -0.0212)
# toes: angle (deg, 0 = forward, + outward), length, base offset from the hand / foot point
F_TOES = [(-40, 0.0045, 0.0010), (-14, 0.0060, 0.0013), (10, 0.0068, 0.0014), (34, 0.0064, 0.0013), (68, 0.0042, 0.0011)]
H_TOES = [(-24, 0.0048, 0.0012), (2, 0.0068, 0.0015), (22, 0.0082, 0.0016), (42, 0.0086, 0.0015), (95, 0.0056, 0.0024)]

# body from the tail tip to the snout, one loft: z, top, yw (height of widest), bottom, half width, exponents
BODY = [
    (-0.122, 0.0072, 0.0064, 0.0056, 0.0008, 2.2, 2.2),
    (-0.116, 0.0092, 0.0076, 0.0057, 0.0024, 2.2, 2.2),
    (-0.106, 0.0128, 0.0098, 0.0066, 0.0052, 2.2, 2.2),
    (-0.093, 0.0170, 0.0126, 0.0078, 0.0086, 2.2, 2.2),
    (-0.078, 0.0204, 0.0148, 0.0087, 0.0114, 2.2, 2.2),
    (-0.062, 0.0222, 0.0158, 0.0092, 0.0126, 2.2, 2.2),
    (-0.049, 0.0228, 0.0162, 0.0095, 0.0122, 2.2, 2.2),
    (-0.038, 0.0228, 0.0163, 0.0097, 0.0106, 2.2, 2.2),
    (-0.029, 0.0228, 0.0163, 0.0099, 0.0090, 2.3, 2.2),
    (-0.018, 0.0256, 0.0174, 0.0096, 0.0118, 2.4, 2.2),
    (-0.002, 0.0284, 0.0184, 0.0093, 0.0154, 2.4, 2.3),
    (0.014, 0.0288, 0.0190, 0.0095, 0.0155, 2.4, 2.3),
    (0.027, 0.0276, 0.0193, 0.0103, 0.0128, 2.3, 2.2),
    (0.037, 0.0266, 0.0198, 0.0118, 0.0102, 2.2, 2.2),
    (0.046, 0.0294, 0.0212, 0.0130, 0.0124, 2.3, 2.2),
    (0.054, 0.0324, 0.0222, 0.0136, 0.0142, 2.5, 2.3),
    (0.061, 0.0330, 0.0226, 0.0143, 0.0134, 2.6, 2.3),
    (0.067, 0.0316, 0.0224, 0.0150, 0.0114, 2.6, 2.3),
    (0.072, 0.0294, 0.0218, 0.0155, 0.0090, 2.5, 2.3),
    (0.0755, 0.0270, 0.0211, 0.0160, 0.0068, 2.4, 2.3),
    (0.0785, 0.0242, 0.0205, 0.0167, 0.0042, 2.3, 2.2),
]
SNOUT = (V(0.0, 0.0207, 0.0775), V(0.0046, 0.0038, 0.0034))
# tail rings (annuli): their pitch along z
RING = 0.0032


def body(P):
    Q = _mirror(P)
    d = loft(Q, BODY)
    # shoulder and pelvic girdles where the legs come out, a soft fold along the flank
    d = smin(d, ellipsoid(Q, V(0.0075, 0.0182, 0.03), V(0.0058, 0.0058, 0.0068)), 0.004)
    d = smin(d, ellipsoid(Q, V(0.0075, 0.0172, -0.021), V(0.0062, 0.0062, 0.008)), 0.004)
    fold = np.exp(-((Q[:, 1] - 0.0128) / 0.0011) ** 2) * sstep(-0.015, -0.008, Q[:, 2]) * sstep(0.024, 0.017, Q[:, 2]) * sstep(0.008, 0.012, Q[:, 0])
    d = d - 0.0004 * fold
    # the tail in rings: a shallow groove between annuli, the tail a little narrower at its root (it can be dropped)
    tz = sstep(-0.034, -0.04, Q[:, 2]) * sstep(-0.12, -0.112, Q[:, 2])
    gr = np.exp(-((np.abs(((Q[:, 2] + 0.034) / RING) % 1.0 - 0.5) - 0.5) / 0.12) ** 2)
    d = d + 0.00018 * gr * tz
    return d


def head_ops(P, d):
    """the head's features on top of the body field d (inside the head box)"""
    Q = _mirror(P)
    d = smin(d, ellipsoid(Q, SNOUT[0], SNOUT[1]), 0.002)
    # jaw muscles behind the eyes (the wide back of the head) and the angle of the jaw
    d = smin(d, ellipsoid(Q, V(0.0085, 0.0225, 0.0525), V(0.0048, 0.0052, 0.0072)), 0.003)
    d = smin(d, ellipsoid(Q, V(0.0078, 0.0168, 0.054), V(0.0045, 0.0036, 0.0068)), 0.003)
    # lower jaw
    d = smin(d, round_cone(Q, V(0.0074, 0.0165, 0.056), V(0.003, 0.0177, 0.0775), 0.0026, 0.0017), 0.002)
    # a soft dip between the eyes over the snout
    d = d + 0.0004 * np.exp(-((Q[:, 2] - 0.068) / 0.006) ** 2 - (Q[:, 0] / 0.003) ** 2) * sstep(0.026, 0.029, Q[:, 1])
    # nostril: a round opening on a small swelling at the tip of the snout
    d = smin(d, ellipsoid(Q, NOSTRIL + V(-0.0003, -0.0001, 0), V(0.0013, 0.0011, 0.0014)), 0.001)
    d = smax(d, -ellipsoid(Q, NOSTRIL + V(0.0004, 0.0001, 0.0002), V(0.0006, 0.0005, 0.0006)), 0.0003)
    # ear opening: a small oval pit behind the jaw
    d = smax(d, -ellipsoid(Q, EAR + V(0.0009, 0, 0), V(0.0011, 0.0016, 0.0010)), 0.0004)
    # mouth line: from the snout tip back along the jaw, curving up a little under and behind the eye
    M = Q * V(1, 2.4, 1) - V(0, 0.0185 * 1.4, 0)
    pts = [V(0.0, 0.0182, 0.0812), V(0.0044, 0.0178, 0.0776), V(0.0086, 0.0176, 0.0685), V(0.011, 0.0183, 0.059), V(0.012, 0.0196, 0.0525)]
    m = None
    for a, b in zip(pts[:-1], pts[1:]):
        e = round_cone(M, a * V(1, 2.4, 1) - V(0, 0.0185 * 1.4, 0), b * V(1, 2.4, 1) - V(0, 0.0185 * 1.4, 0), 0.0004, 0.0004)
        m = e if m is None else smin(m, e, 0.0003)
    d = smax(d, -(m + 0.0003) / 1.4, 0.0004)
    # eye: thick lids round a big bulging eye
    ca, li, ba = eye_parts(P)
    d = smin(d, li, 0.0012)
    d = smax(d, -ca, 0.0003)
    d = smin(d, ba, 0.0002)
    return d


def eye_parts(P):
    """lid mound round the eye (add), the opening in front of the eye (carve), the eyeball (add)"""
    Q = _mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0001, -0.0006), V(EYE_R + 0.0014, EYE_R + 0.0013, EYE_R + 0.0004))
    ua = u - LID_OFF
    ap = np.sqrt((s / LID_W) ** 2 + (ua / LID_H) ** 2) - 1
    ap = ap + 0.12 * sstep(0.5, 1.0, np.abs(s) / LID_W) * (np.abs(ua) / LID_H)
    carve = smax(ap * LID_H, -g - 0.0002, 0.0002)
    ball = length(D) - EYE_R * 0.88
    return carve, lids, ball


def _toe(Q, base, a_deg, L, r0):
    a = np.radians(a_deg)
    d2 = V(np.sin(a), 0, np.cos(a))
    p0 = base
    p1 = base + d2 * (L * 0.45) + V(0, 0.0005, 0)
    p2 = base + d2 * L + V(0, -0.0001, 0)
    t = chain(Q, [p0, p1, p2], [r0, r0 * 0.8, r0 * 0.66], 0.0004)
    # slender toes: a little swelling under each joint, no pads
    t = smin(t, ellipsoid(Q, base + d2 * (L * 0.6) + V(0, -0.0001, 0), V(r0 * 0.7, r0 * 0.6, r0 * 0.85)), 0.0003)
    c0 = p2 + d2 * 0.0002 + V(0, 0.0002, 0)
    c1 = p2 + d2 * 0.0011 + V(0, 0.0001, 0)
    c2 = p2 + d2 * 0.0019 + V(0, -0.0007, 0)
    cl = chain(Q, [c0, c1, c2], [r0 * 0.6, r0 * 0.42, 0.00015], 0.0)
    return t, cl


def legs(P):
    Q = _mirror(P)
    # front: the upper arm out and up to the elbow, the forearm down to the wrist
    fr = chain(Q, [V(0.006, 0.0178, 0.030), V(0.015, 0.0205, 0.0302), V(0.0222, 0.0222, 0.0305)], [0.0046, 0.0038, 0.0031], 0.0012)
    fr = smin(fr, chain(Q, [V(0.0222, 0.0222, 0.0305), V(0.0252, 0.012, 0.0335), WRIST], [0.0033, 0.0027, 0.0021], 0.001), 0.001)
    fr = smin(fr, ellipsoid(Q, V(0.0224, 0.0222, 0.0298), V(0.0026, 0.0025, 0.0024)), 0.001)
    fr = smin(fr, superellipsoid(Q, HAND + V(0.0, 0.0001, -0.0006), (0.0026, 0.0013, 0.003), 2.3, rb=0.0018), 0.0012)
    # hind: a thick thigh out and up to the knee, the shin down to the ankle, a long foot
    hi = chain(Q, [V(0.005, 0.0168, -0.021), V(0.016, 0.0198, -0.0198), V(0.0252, 0.0222, -0.019)], [0.0064, 0.0049, 0.0036], 0.0015)
    hi = smin(hi, chain(Q, [V(0.0252, 0.0222, -0.019), V(0.0292, 0.012, -0.0232), ANKLE], [0.0037, 0.003, 0.0023], 0.001), 0.001)
    hi = smin(hi, ellipsoid(Q, V(0.0253, 0.0222, -0.0196), V(0.003, 0.0028, 0.0028)), 0.001)
    hi = smin(hi, superellipsoid(Q, FOOT + V(-0.0004, 0.0001, -0.0024), (0.0027, 0.0013, 0.0046), 2.3, rb=0.0019, ax=nrm([0.25, 0, 1])), 0.0012)
    return fr, hi


def toes(P):
    Q = _mirror(P)
    out_t, out_c = None, None
    for base, TOES, r0 in ((HAND, F_TOES, 0.00075), (FOOT, H_TOES, 0.0008)):
        for k, (a, L, off) in enumerate(TOES):
            ar = np.radians(a)
            b = base + V(np.sin(ar), 0, np.cos(ar)) * off + V(0, 0.0001, 0)
            if base is FOOT and k == 4:
                b = FOOT + V(0.0022, 0.0002, -0.003)
            t, c = _toe(Q, b, a, L, r0)
            out_t = t if out_t is None else smin(out_t, t, 0.0004)
            out_c = c if out_c is None else np.minimum(out_c, c)
    return out_t, out_c


HEAD_BOX = (V(-0.02, 0.008, 0.04), V(0.02, 0.036, 0.088))
LEG_BOX = ((-0.045, -0.002, -0.04), (0.045, 0.03, 0.048))
TOE_BOX = ((-0.055, -0.002, -0.04), (0.055, 0.008, 0.055))


def parts(P):
    so, li, ba = eye_parts(P)
    fr, hi = _local_n(P, *LEG_BOX, legs, 2)
    to, cl = _local_n(P, *TOE_BOX, toes, 2)
    return {'body': body(P), 'lids': li, 'ball': ba, 'fleg': fr, 'hleg': hi, 'toe': to, 'claw': cl}


def shape(P):
    d = body(P)
    fr, hi = _local_n(P, *LEG_BOX, legs, 2)
    d = smin(d, fr, 0.002)
    d = smin(d, hi, 0.0025)
    m = _box(P, HEAD_BOX[0], HEAD_BOX[1])
    if m.any():
        d[m] = head_ops(P[m], d[m])
    to, cl = _local_n(P, *TOE_BOX, toes, 2)
    d = smin(d, to, 0.0008)
    d = smin(d, cl, 0.0002)
    return d


PREVIEW = {
    'side': ((0.34, 0.05, -0.02), (0, 0.015, -0.022), 30),
    'front3q': ((0.24, 0.16, 0.26), (0, 0.012, -0.02), 30),
    'rear3q': ((-0.25, 0.17, -0.3), (0, 0.012, -0.02), 30),
    'top': ((0.001, 0.5, -0.03), (0, 0.01, -0.03), 30),
    'head': ((0.07, 0.06, 0.15), (0, 0.022, 0.062), 26),
    'headside': ((0.13, 0.03, 0.065), (0, 0.022, 0.062), 24),
    'headfront': ((0.0, 0.05, 0.2), (0, 0.022, 0.06), 20),
    'feet': ((0.12, 0.022, 0.11), (0.03, 0.004, 0.025), 22),
}

TAIL_RINGS = 0
UV_PACK = {'rotate_method': 'AXIS_ALIGNED'}

BEND = [
    (V(0.0, 0.0066, -0.119), V(0.0, 0.0165, -0.03), 0.005, 0.017),         # tail
    (V(0.0, 0.0168, -0.03), V(0.0, 0.021, 0.05), 0.0045, 0.016),          # trunk and neck
    (V(0.006, 0.0178, 0.030), V(0.0222, 0.0222, 0.0305), 0.0024, 0.0055),   # upper arm
    (V(0.0222, 0.0222, 0.0305), WRIST, 0.0024, 0.0042),                     # forearm
    (V(0.005, 0.0168, -0.021), V(0.0252, 0.0222, -0.019), 0.0024, 0.0075),  # thigh
    (V(0.0252, 0.0222, -0.019), ANKLE, 0.0024, 0.0048),                     # shin
]
SEAMS_Z = [-0.09, -0.012]


def _body_face(c):
    """is a face (center c) part of the body strip, not a leg"""
    w = float(np.interp(c.z, np.asarray(BODY)[:, 0], np.asarray(BODY)[:, 4]))
    return c.x < w + 0.0022 or c.z > 0.042 or c.z < -0.036


def unwrap(ob):
    """body and tail: conformal strips between the seams; legs and feet: smart project; then the same texel density"""
    import bmesh, bpy
    me = ob.data
    bm = bmesh.from_edit_mesh(me)
    bm.faces.ensure_lookup_table()
    body_f = [f for f in bm.faces if _body_face(f.calc_center_median())]
    bset = set(body_f)
    for e in bm.edges:
        lf = e.link_faces
        if len(lf) == 2 and ((lf[0] in bset) != (lf[1] in bset)):
            e.seam = True
    for f in bm.faces:
        f.select = f in bset
    bmesh.update_edit_mesh(me)
    bpy.ops.uv.unwrap(method='CONFORMAL', margin=0.004)
    bm = bmesh.from_edit_mesh(me)
    for f in bm.faces:
        f.select = f not in bset
    bmesh.update_edit_mesh(me)
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()


def lowpoly_fix(bm, hi):
    """seams across the body, and rings where it has to bend (see meshfix.py)"""
    import meshfix as MF
    tr = MF.tree(hi)
    for z0 in SEAMS_Z:
        faces = [f for f in bm.faces if min(v.co.z for v in f.verts) < z0 < max(v.co.z for v in f.verts) and _body_face(f.calc_center_median())]
        MF.cut(bm, tr, (0, 0, z0), (0, 0, 1), faces, seam=True, snap=None)
    for a, b, pitch, reach in BEND:
        if a[0] == 0 and b[0] == 0:
            ok = lambda c, p0, r: c.x < 0.0145 or p0.z < -0.034
        else:
            ok = lambda c, p0, r, reach=reach: r < reach
        MF.rings(bm, tr, a, b, pitch, ok)
    MF.finish(bm)


# ---------- skinning ----------
WEIGHT_SMOOTH = (4, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['head'], 'head': V(0, 0.0205, 0.08),
         'tail1': P['tail2'], 'tail2': P['tail3'], 'tail3': P['tail4'], 'tail4': V(0, 0.0066, -0.121)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0.0025, 0, 0.007)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (HAND + V(0.0012, 0, 0.006)) * m
    return t


def keep(P):
    Pm = np.abs(P) * V(1, 0, 0) + P * V(0, 1, 1)
    e = sstep(0.0075, 0.0048, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.35
    n = sstep(0.002, 0.001, np.linalg.norm(Pm - NOSTRIL, axis=1)) * 0.15
    ear = sstep(0.0028, 0.0016, np.linalg.norm(Pm - EAR, axis=1)) * 0.15
    tip = sstep(0.077, 0.082, Pm[:, 2]) * 0.1
    mouth = sstep(0.0009, 0.0003, np.abs(Pm[:, 1] - 0.018)) * sstep(0.052, 0.058, Pm[:, 2]) * sstep(0.013, 0.008, Pm[:, 0]) * 0.12
    feet = sstep(0.0055, 0.0028, Pm[:, 1]) * sstep(0.02, 0.026, Pm[:, 0]) * 0.12
    _, cl = _local_n(P, TOE_BOX[0], (TOE_BOX[1][0], 0.004, TOE_BOX[1][2]), toes, 2)
    claw = sstep(0.0003, 0.00008, cl) * 0.45
    return np.maximum.reduce([e, n, ear, tip, mouth, feet, claw])


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    W[:, bi['ctag']] = 0
    # toes, claws and the palm ride on the paw bones
    for s in 'LR':
        sg = 1 if s == 'L' else -1
        for c, paw in ((HAND, 'fpaw'), (FOOT, 'hpaw')):
            dx = np.hypot(wpos[:, 0] - sg * c[0], wpos[:, 2] - c[2])
            low = (dx < 0.0135) & (wpos[:, 1] < 0.0034) & (wpos[:, 0] * sg > 0.02)
            W[low] = 0; W[low, bi[paw + s]] = 1
    # the head (from the ear forward) is all head, blended over a few mm
    k = sstep(0.046, 0.054, wpos[:, 2])[:, None]
    hw = np.zeros_like(W); hw[:, bi['head']] = 1
    W = W * (1 - k) + hw * k
    return W


# ---------- skin: granules, tubercles, tail annuli, belly scales ----------
_cache = {}
SC_BODY, SC_LEG, SC_HEAD, SC_BELLY = 0.00062, 0.00052, 0.00068, 0.00085
TUB = 0.0021


def _regions(P, N, c):
    Pm = _mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    r = {'Pm': Pm, 'Nm': Nm}
    r['claw'] = sstep(0.0002, 0.00004, c['claw'])
    r['eyeD'] = np.linalg.norm(Pm - EYE_C, axis=1)
    r['ball'] = sstep(0.0003, 0.0001, c['ball']) * sstep(EYE_R + 0.0008, EYE_R + 0.0002, r['eyeD'])
    r['lid'] = sstep(EYE_R + 0.0022, EYE_R + 0.0009, r['eyeD']) * (1 - r['ball'])
    near = lambda k, w=0.0005: sstep(w, 0.0, c[k])
    r['toe'] = near('toe', 0.0003) * sstep(0.003, 0.0016, y)
    r['leg'] = np.maximum(near('fleg', 0.0006), near('hleg', 0.0006)) * sstep(0.001, 0.0028, c['body'])
    r['leg'] = np.maximum(r['leg'], r['toe'])
    r['tail'] = sstep(-0.03, -0.038, z) * (1 - r['leg'])
    r['head'] = sstep(0.045, 0.05, z)
    yw = _interp(BODY, z, 2)
    r['belly'] = sstep(-0.4, -0.8, Nm[:, 1]) * sstep(yw - 0.0012, yw - 0.004, y) * (1 - r['leg'])
    r['flank'] = sstep(0.3, -0.35, Nm[:, 1]) * (1 - r['leg'])
    return r


def scales(P, N, c):
    """per texel: height (meters), distance to the scale edge, the scale's center (to color each scale as one), masks"""
    key = (len(P), float(P[:7].sum()))
    if key in _cache:
        return _cache[key]
    R = _regions(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    H = np.zeros(n, F); E = np.full(n, 0.5, F); C = Pm.copy()
    # fine granules everywhere (smaller on the legs, flatter on the head)
    for sz, m in ((SC_BODY, (R['head'] < 0.5) & (R['leg'] < 0.5)), (SC_LEG, R['leg'] >= 0.5), (SC_HEAD, R['head'] >= 0.5)):
        if not m.any():
            continue
        f1, f2, cp = _cells(Pm[m], sz, 71 if sz < SC_HEAD else 72)
        e = (f2 - f1) / sz
        dome = np.sqrt(np.clip(1 - (f1 / (0.62 * sz)) ** 2, 0, 1))
        hh = sz * 0.2 * sstep(0.0, 0.22, e) * (0.35 + 0.65 * dome)
        H[m] = hh; E[m] = e; C[m] = cp
    # tubercles: raised round bumps scattered over the back, the flanks and the legs, in rings on the tail
    top = (1 - R['belly']) * sstep(-0.5, 0.1, Nm[:, 1])
    f1, f2, cp = _cells(Pm * V(1, 1, 1), TUB, 73)
    j = _hash(np.floor(cp[:, 0] / TUB * 3).astype(np.int64), np.floor(cp[:, 1] / TUB * 3).astype(np.int64), np.floor(cp[:, 2] / TUB * 3).astype(np.int64), 74)
    rad = TUB * (0.26 + 0.1 * j)
    tb = np.sqrt(np.clip(1 - (f1 / rad) ** 2, 0, 1)) * (j < 0.7) * top * (1 - R['head'] * 0.6) * (1 - R['toe'])
    # tail: the tubercles line up on the annuli
    ring = np.abs(((z + 0.034) / RING) % 1.0 - 0.5) * 2
    tb = tb * (1 - R['tail']) + R['tail'] * top * sstep(0.75, 0.3, ring) * np.sqrt(np.clip(1 - (f1 / (TUB * 0.3)) ** 2, 0, 1))
    H = np.maximum(H, H + 0.00045 * tb)
    E = np.where(tb > 0.15, 0.5, E)
    # belly: small flat overlapping scales in rows
    bm = R['belly'] > 0.01
    if bm.any():
        a, b, uc, vc = _rows(-z[bm], x[bm], SC_BELLY, SC_BELLY * 0.9)
        hh = 0.08 * SC_BELLY * (0.45 + 0.55 * a) * sstep(0.0, 0.12, a) * sstep(1.0, 0.86, a) * sstep(0.0, 0.12, b) * sstep(1.0, 0.88, b)
        e = np.minimum(np.minimum(a, 1 - a), np.minimum(b, 1 - b)) * 0.9
        k = R['belly'][bm]
        H[bm] = H[bm] * (1 - k) + hh * k; E[bm] = E[bm] * (1 - k) + e * k
    bare = np.maximum(R['claw'], R['ball'])
    H *= 1 - bare
    out = (H, E, C, R, tb)
    _cache[key] = out
    return out


# ---------- skin paint (sRGB 0..1) and fine detail (meters) ----------
K = {
    'yellow': _hex(0xE6B83A), 'yellowLt': _hex(0xF0D26A), 'white': _hex(0xEEE8DC), 'lilac': _hex(0xCFC4CC), 'black': _hex(0x1E1A18),
    'brown': _hex(0x3A2C22), 'belly': _hex(0xF2EADE), 'claw': _hex(0x8A7A62), 'ball': _hex(0x141010), 'gap': _hex(0x2A2420),
    'pink': _hex(0xE6C8C0), 'hatch': _hex(0xE8C048), 'hatchDk': _hex(0x2A1E18), 'hatchW': _hex(0xF0EBDF),
}


def _spots(P, R):
    """leopard spots: irregular round black spots (from the real, unmirrored point: the two sides differ)"""
    W = P + 0.0012 * (np.stack([vnoise(P * 900 + 1.1, 81), vnoise(P * 900 + 2.3, 82), vnoise(P * 900 + 3.7, 83)], 1) - 0.5)
    f1, f2, cp = _cells(W, 0.0034, 84)
    j = _hash(np.floor(cp[:, 0] / 0.0034 * 3).astype(np.int64), np.floor(cp[:, 1] / 0.0034 * 3).astype(np.int64), np.floor(cp[:, 2] / 0.0034 * 3).astype(np.int64), 85)
    rad = 0.0007 + 0.0007 * j
    sp = sstep(rad + 0.0002, rad - 0.0001, f1) * (j > 0.18)
    # smaller spots on the head and the legs
    f1s, _, cps = _cells(W, 0.0021, 86)
    js = _hash(np.floor(cps[:, 0] / 0.0021 * 3).astype(np.int64), np.floor(cps[:, 1] / 0.0021 * 3).astype(np.int64), np.floor(cps[:, 2] / 0.0021 * 3).astype(np.int64), 87)
    ss = sstep(0.00058, 0.0004, f1s) * (js > 0.25)
    small = np.maximum(R['head'], R['leg'])
    return np.clip(sp * (1 - small) + ss * small, 0, 1)


def paint(P, N, c, baby=False):
    H, E, C, R, tb = scales(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    fine = fbm(Pm * 450, 2, 93)
    if not baby:
        # yellow over the back and the head, paling to white low on the flanks and the belly
        col = _mix(np.tile(K['yellow'], (n, 1)), K['yellowLt'], 0.25 * fbm(Pm * 220, 2, 96) + 0.2 * tb)
        col = _mix(col, K['white'], sstep(0.1, -0.5, Nm[:, 1]) * 0.85)
        # the tail: pale lilac-white with soft yellow bands
        band = 0.5 + 0.5 * np.cos(2 * np.pi * (z + 0.034) / 0.016)
        tcol = _mix(np.tile(K['lilac'], (n, 1)), K['yellow'], 0.9 * sstep(0.35, 0.6, band) * sstep(-0.115, -0.07, z))
        tcol = _mix(tcol, K['white'], sstep(0.0, -0.6, Nm[:, 1]) * 0.6)
        col = _mix(col, tcol, R['tail'] * sstep(-0.045, -0.06, z))
        sp = _spots(P, R)
        sp = sp * (1 - R['belly']) * (1 - 0.6 * sstep(-0.2, -0.6, Nm[:, 1]))
        col = _mix(col, K['black'], sp * 0.95)
        col = _mix(col, K['belly'], R['belly'] * 0.9)
    else:
        # the hatchling: broad dark bands across a yellow body, a dark head with a pale band behind it, the tail
        # banded black and white
        bz = z
        bands = [(-0.002, 0.012), (0.026, 0.008), (-0.026, 0.009)]
        dk = np.zeros(n, F)
        for b0, hw in bands:
            dk = np.maximum(dk, sstep(hw + 0.0012, hw - 0.0012, np.abs(bz - b0 + 0.0012 * (fbm(Pm * 400, 2, 95) - 0.5))))
        dk = np.maximum(dk, sstep(0.047, 0.052, z) * sstep(0.072, 0.062, z + 0.002 * (fbm(Pm * 500, 2, 97) - 0.5)) * sstep(0.35, -0.1, -Nm[:, 1]) * 0.95)
        col = _mix(np.tile(K['hatch'], (n, 1)), K['hatchDk'], dk)
        tb_ = 0.5 + 0.5 * np.cos(2 * np.pi * (z + 0.034) / 0.019)
        tcol = _mix(np.tile(K['hatchW'], (n, 1)), K['hatchDk'], sstep(0.35, 0.55, tb_))
        col = _mix(col, tcol, R['tail'] * sstep(-0.034, -0.042, z))
        col = _mix(col, K['hatchW'], sstep(0.1, -0.5, Nm[:, 1]) * 0.5 * (1 - dk * 0.6))
        col = _mix(col, K['belly'], R['belly'] * 0.95)
    # the skin between granules a little darker, tubercles a little lighter
    col = col * (0.93 + 0.07 * sstep(0.0, 0.2, E))[:, None]
    col *= (0.96 + 0.06 * fine)[:, None]
    # toes and claws: pale, the claws horn colored
    col = _mix(col, K['claw'], R['claw'])
    col = _mix(col, K['ball'], R['ball'])
    # eyelids: the rim a little paler; nostril and ear openings dark
    D = Pm - EYE_C
    s_, u_ = D @ EYE_SIDE, D @ EYE_UP - LID_OFF
    ap = np.sqrt((s_ / LID_W) ** 2 + (u_ / LID_H) ** 2)
    col = _mix(col, K['gap'], sstep(1.4, 1.05, ap) * sstep(EYE_R + 0.0016, EYE_R + 0.0006, R['eyeD']) * 0.85)
    nd = np.linalg.norm((Pm - NOSTRIL - V(0.0004, 0.0001, 0.0002)) / V(0.0006, 0.0005, 0.0006), axis=1)
    col = _mix(col, K['gap'], sstep(1.3, 0.8, nd))
    ed = np.linalg.norm((Pm - EAR - V(0.0009, 0, 0)) / V(0.0011, 0.0016, 0.001), axis=1)
    col = _mix(col, K['gap'], sstep(1.3, 0.85, ed) * 0.9)
    # the mouth line: a thin pale lip
    rough = 0.6 + 0.12 * (1 - sstep(0.0, 0.2, E)) - 0.15 * R['claw'] - 0.3 * R['ball'] - 0.08 * tb
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def paint_baby(P, N, c):
    return paint(P, N, c, baby=True)


def detail(P, N, c):
    H, E, C, R, tb = scales(P, N, c)
    return H.astype(F)


def finish(C, ao, valid):
    lin = np.where(C <= 0.04045, C / 12.92, ((C + 0.055) / 1.055) ** 2.4)
    lin = lin * (0.4 + 0.6 * ao[..., None])
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(np.maximum(lin, 0), 1 / 2.4) - 0.055)


# ---------- what the game needs besides the mesh ----------
MAP_QUALITY = (50, 42)
BABY_MAP = (0, 56)     # (extra_maps makes the hatchling's map 512 x 256: both sides)
BABY_SIZE = 256


def stats(P, N, c, col):
    R = _regions(P, N, c)
    m = R['lid'] * sstep(EYE_R + 0.0018, EYE_R + 0.0009, R['eyeD'])
    rgb = lambda v: int(round(v[0] * 255)) << 16 | int(round(v[1] * 255)) << 8 | int(round(v[2] * 255))
    lid = (col * m[:, None]).sum(0) / max(m.sum(), 1e-6)
    # the hatchling's closed lids take its own dark head round the eye (the adult's yellow showed on it)
    colb, _ = paint(P, N, c, baby=True)
    lidb = (colb * m[:, None]).sum(0) / max(m.sum(), 1e-6)
    return {'lidCol': rgb(np.clip(lid, 0, 1)), 'babyLidCol': rgb(np.clip(lidb, 0, 1))}


def meta(st):
    r = EYE_R
    up, dn = (LID_OFF + LID_H) / r, (LID_OFF - LID_H) / r
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.2],
                'iris': 0x9A9488, 'irisR': 0.97, 'pupil': 'v', 'pupilR': 0.34, 'rim': 0x3A3630, 'lidCol': st['lidCol'], 'babyLidCol': st['babyLidCol']},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'sides': True,
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.05, 0.05, 0.05], 'flat': 0xE6B83A,
    }


# ---------- both sides of the coat (SIDES), as the cow ----------
def extra_maps(X):
    """the color maps (adult and hatchling) with the -x side painted too: +x side in the left half, -x side in the
    right half"""
    import os
    from PIL import Image
    Ph, Nh, comps, valid, R, ao, v2, pad, down2 = X['Ph'], X['Nh'], X['comps'], X['valid'], X['R'], X['ao'], X['v2'], X['pad'], X['down2']
    Mx = np.array([-1, 1, 1], F)
    for name, baby in (('color', False), ('color-baby', True)):
        _cache.clear()
        colm, _ = paint(Ph * Mx, Nh * Mx, comps, baby)
        a = np.zeros((R, R, 3), F); a[valid] = colm
        C = finish(down2(pad(a, valid, 24)), ao, v2)
        im = Image.fromarray(np.clip(C[::-1] * 255 + 0.5, 0, 255).astype(np.uint8))
        p = os.path.join(X['work'], f'{ID}-{name}.png')
        left = Image.open(p).convert('RGB')
        both = Image.new('RGB', (left.size[0] * 2, left.size[1]))
        both.paste(left, (0, 0)); both.paste(im, (left.size[0], 0))
        if baby and BABY_SIZE != left.size[1]:
            both = both.resize((BABY_SIZE * 2, BABY_SIZE), Image.LANCZOS)
        both.save(p)
    _cache.clear()
