# Black and yellow lizard: a young lace monitor (the Australian tree goanna, which really is black with yellow spots
# and climbs trees), sculpted as a signed distance field around the game's lizard skeleton. Units are meters in game
# rig space (x left, y up, z forward, ground at y = 0); bone pivots come from tools/blender/work/lizard-rig.json.
# The tail is part of the field (no separate tail tube). Scales are a height field per texel (detail()), and the
# yellow spots follow the scales (each scale is one color, like on a real lizard).
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, chain, loft, frame, fbm, vnoise, length, _hash

ID = 'lizard'
BOUNDS = (V(-0.09, -0.001, -0.297), V(0.09, 0.052, 0.146))
# fine bake-only meshes over small features (box lo, box hi on the +x side, voxel size)
PATCHES = [
    (V(0.004, 0.034, 0.091), V(0.0165, 0.047, 0.106), 0.00015),    # eye and lids
    (V(0.0, 0.026, 0.118), V(0.0085, 0.040, 0.143), 0.0002),       # snout tip, nostril, lips
    (V(0.007, 0.030, 0.074), V(0.0155, 0.041, 0.086), 0.0002),     # ear opening
    (V(0.044, -0.001, 0.052), V(0.078, 0.009, 0.092), 0.0002),     # front foot
    (V(0.046, -0.001, -0.066), V(0.092, 0.010, -0.018), 0.0002),   # hind foot
]
# bake: cage extrusion and ray length, occlusion distance (meters)
BAKE_CAGE = (0.0015, 0.005)
AO_DIST = 0.02

# ---------- landmarks ----------
EYE_C = V(0.0100, 0.0408, 0.0985)
EYE_R = 0.0032
EYE_DIR = nrm([0.9, 0.3, 0.3])
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_W, LID_H, LID_OFF = 0.0028, 0.0021, -0.0002
NOSTRIL = V(0.0044, 0.0352, 0.1315)
EAR = V(0.0118, 0.0352, 0.0802)
MOUTH = V(0.0, 0.0300, 0.1345)
WRIST = V(0.054, 0.0055, 0.0625)
HAND = V(0.0565, 0.0030, 0.0700)
ANKLE = V(0.062, 0.0058, -0.052)
FOOT = V(0.0655, 0.0030, -0.0405)
# toes: angle (deg, 0 = forward, + outward), length, base offset from the hand / foot point
F_TOES = [(-38, 0.0072, 0.0016), (-10, 0.0098, 0.0022), (14, 0.0115, 0.0024), (38, 0.0108, 0.0022), (72, 0.0068, 0.0018)]
H_TOES = [(-20, 0.0075, 0.0020), (4, 0.0115, 0.0026), (24, 0.0150, 0.0027), (44, 0.0168, 0.0024), (100, 0.0105, 0.0040)]

# body from the tail tip to the snout, one loft so there is no seam at the hips or the neck:
# z, top, yw (height of widest), bottom, half width, exponent above, below
BODY = [
    (-0.292, 0.0078, 0.0070, 0.0060, 0.0007, 2.2, 2.2),
    (-0.282, 0.0090, 0.0074, 0.0056, 0.0013, 2.2, 2.2),
    (-0.260, 0.0118, 0.0090, 0.0058, 0.0022, 2.4, 2.2),
    (-0.230, 0.0158, 0.0116, 0.0072, 0.0032, 2.5, 2.2),
    (-0.190, 0.0208, 0.0156, 0.0098, 0.0046, 2.5, 2.2),
    (-0.150, 0.0258, 0.0196, 0.0128, 0.0063, 2.4, 2.2),
    (-0.110, 0.0312, 0.0236, 0.0154, 0.0086, 2.3, 2.2),
    (-0.082, 0.0360, 0.0262, 0.0164, 0.0114, 2.2, 2.2),
    (-0.062, 0.0396, 0.0277, 0.0164, 0.0145, 2.3, 2.2),
    (-0.040, 0.0425, 0.0285, 0.0148, 0.0178, 2.4, 2.3),
    (-0.012, 0.0443, 0.0287, 0.0130, 0.0205, 2.4, 2.3),
    (0.015, 0.0445, 0.0292, 0.0138, 0.0198, 2.4, 2.3),
    (0.040, 0.0437, 0.0300, 0.0165, 0.0168, 2.3, 2.3),
    (0.058, 0.0432, 0.0312, 0.0192, 0.0130, 2.2, 2.2),
    (0.072, 0.0442, 0.0328, 0.0213, 0.0118, 2.2, 2.2),
    (0.082, 0.0460, 0.0340, 0.0228, 0.0128, 2.3, 2.2),
    (0.091, 0.0473, 0.0350, 0.0241, 0.0130, 2.4, 2.3),
    (0.099, 0.0474, 0.0352, 0.0252, 0.0122, 2.5, 2.3),
    (0.108, 0.0458, 0.0348, 0.0262, 0.0103, 2.5, 2.3),
    (0.118, 0.0432, 0.0338, 0.0270, 0.0085, 2.4, 2.3),
    (0.128, 0.0402, 0.0328, 0.0276, 0.0068, 2.4, 2.3),
    (0.135, 0.0378, 0.0321, 0.0281, 0.0055, 2.3, 2.3),
]
SNOUT = (V(0.0, 0.0322, 0.1352), V(0.0055, 0.0052, 0.0064))   # rounded tip of the snout (center, radii)


def _box(P, lo, hi):
    return np.all((P >= lo) & (P <= hi), axis=1)


def _local(P, lo, hi, fn, far=1.0):
    m = _box(P, np.asarray(lo, F), np.asarray(hi, F))
    out = np.full(len(P), far, F)
    if m.any():
        out[m] = fn(P[m])
    return out


def _local_n(P, lo, hi, fn, n, far=1.0):
    m = _box(P, np.asarray(lo, F), np.asarray(hi, F))
    out = [np.full(len(P), far, F) for _ in range(n)]
    if m.any():
        for o, r in zip(out, fn(P[m])):
            o[m] = r
    return out


def _mirror(P):
    Q = P.copy(); Q[:, 0] = np.abs(Q[:, 0]); return Q


def _interp(keys, z, col):
    K = np.asarray(keys, F)
    return np.interp(z, K[:, 0], K[:, col]).astype(F)


# ---------- parts ----------
def body(P):
    Q = _mirror(P)
    d = loft(Q, BODY)
    # shoulder and pelvic girdles a little fuller where the legs come out
    d = smin(d, ellipsoid(Q, V(0.012, 0.0300, 0.046), V(0.0085, 0.0085, 0.010)), 0.006)
    d = smin(d, ellipsoid(Q, V(0.011, 0.0285, -0.046), V(0.0090, 0.0090, 0.012)), 0.006)
    # throat (gular pouch) under the neck
    d = smin(d, ellipsoid(Q, V(0.0, 0.0250, 0.075), V(0.0085, 0.0050, 0.014)), 0.005)
    # a soft fold of skin along the flank between the legs
    fold = np.exp(-((Q[:, 1] - 0.0225) / 0.0016) ** 2) * sstep(-0.035, -0.02, Q[:, 2]) * sstep(0.036, 0.022, Q[:, 2]) * sstep(0.012, 0.018, Q[:, 0])
    d = d - 0.0006 * fold
    # a low double keel on top of the tail toward the end (monitors swim with it)
    yt = _interp(BODY, Q[:, 2], 1)
    k = sstep(-0.12, -0.2, Q[:, 2]) * np.exp(-((Q[:, 0] - 0.0009) / 0.0008) ** 2) * sstep(-0.004, 0.0, Q[:, 1] - yt + 0.002)
    return d - 0.0006 * k


def head_ops(P, d):
    """the head's features on top of the body field d (inside the head box)"""
    Q = _mirror(P)
    # rounded snout tip
    d = smin(d, ellipsoid(Q, SNOUT[0], SNOUT[1]), 0.003)
    # jaw muscles behind the eye and the angle of the jaw
    d = smin(d, ellipsoid(Q, V(0.0098, 0.0348, 0.0855), V(0.0040, 0.0060, 0.0080)), 0.004)
    d = smin(d, ellipsoid(Q, V(0.0085, 0.0278, 0.088), V(0.0042, 0.0042, 0.0070)), 0.004)
    # lower jaw: a long narrow mandible under the snout
    d = smin(d, round_cone(Q, V(0.0072, 0.0272, 0.092), V(0.0030, 0.0283, 0.138), 0.0030, 0.0018), 0.003)
    # brow ridge over the eye
    d = smin(d, ellipsoid(Q, V(0.0082, 0.0450, 0.0995), V(0.0034, 0.0016, 0.0062)), 0.002)
    # nostril: an oval opening on a small swelling near the tip of the snout
    d = smin(d, ellipsoid(Q, NOSTRIL + V(-0.0005, -0.0001, 0), V(0.0018, 0.0016, 0.0024)), 0.0015)
    d = smax(d, -ellipsoid(Q, NOSTRIL + V(0.0006, 0.0001, 0.0), V(0.0009, 0.0006, 0.0010)), 0.0004)
    # ear opening: a vertical oval pit behind the angle of the jaw
    d = smax(d, -ellipsoid(Q, EAR + V(0.0010, 0, 0), V(0.0014, 0.0018, 0.0011)), 0.0005)
    # mouth line: a thin groove along the lips from the tip of the snout back to below the eye
    M = Q * V(1, 2.4, 1) - V(0, 0.0300 * 1.4, 0)
    m = round_cone(M, V(0.0, 0.0293, 0.1425), V(0.0040, 0.0294, 0.137), 0.0005, 0.0005)
    m = smin(m, round_cone(M, V(0.0040, 0.0294, 0.137), V(0.0080, 0.0298, 0.112), 0.00045, 0.00045), 0.0003)
    m = smin(m, round_cone(M, V(0.0080, 0.0298, 0.112), V(0.0108, 0.0306, 0.090), 0.00045, 0.0002), 0.0003)
    d = smax(d, -(m + 0.00035) / 1.4, 0.0005)
    # eye: lid mound, the opening, the ball
    ca, li, ba = eye_parts(P)
    d = smin(d, li, 0.0012)
    d = smax(d, -ca, 0.0003)
    d = smin(d, ba, 0.0002)
    return d


def eye_parts(P):
    """lid mound around the eye (add), the opening in front of the eye (carve), the eyeball (add)"""
    Q = _mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0002, -0.0003), V(EYE_R + 0.0021, EYE_R + 0.0016, EYE_R + 0.0005))
    ua = u - LID_OFF
    ap = np.sqrt((s / LID_W) ** 2 + (ua / LID_H) ** 2) - 1
    ap = ap + 0.15 * sstep(0.5, 1.0, np.abs(s) / LID_W) * (np.abs(ua) / LID_H)
    carve = smax(ap * LID_H, -g - 0.0002, 0.0002)
    ball = length(D) - EYE_R * 0.86
    return carve, lids, ball


def _toe(Q, base, a_deg, L, r0, up=0.0):
    a = np.radians(a_deg)
    d2 = V(np.sin(a), 0, np.cos(a))
    p0 = base + d2 * 0.0
    p1 = base + d2 * (L * 0.45) + V(0, 0.0006 + up, 0)
    p2 = base + d2 * L + V(0, -0.0001, 0)
    t = chain(Q, [p0, p1, p2], [r0, r0 * 0.78, r0 * 0.62], 0.0006)
    # pads under the joints (slightly swollen)
    t = smin(t, ellipsoid(Q, base + d2 * (L * 0.62) + V(0, -0.0002, 0), V(r0 * 0.75, r0 * 0.62, r0 * 0.9) * V(1, 1, 1)), 0.0004)
    # claw: a curved hook from the toe tip down to the ground
    c0 = p2 + d2 * 0.0003 + V(0, 0.0003, 0)
    c1 = p2 + d2 * 0.0017 + V(0, 0.0002, 0)
    c2 = p2 + d2 * 0.0029 + V(0, -0.0010, 0)
    cl = chain(Q, [c0, c1, c2], [r0 * 0.62, r0 * 0.44, 0.00022], 0.0)
    return t, cl


def legs(P):
    Q = _mirror(P)
    # front: upper arm sticks out sideways, elbow up, forearm down to the wrist
    fr = chain(Q, [V(0.008, 0.0290, 0.047), V(0.026, 0.0318, 0.0485), V(0.0440, 0.0335, 0.0500)], [0.0066, 0.0054, 0.0045], 0.002)
    fr = smin(fr, chain(Q, [V(0.0440, 0.0335, 0.0500), V(0.0505, 0.0180, 0.0560), WRIST], [0.0050, 0.0040, 0.0033], 0.0015), 0.0015)
    fr = smin(fr, ellipsoid(Q, V(0.0445, 0.0335, 0.0490), V(0.0040, 0.0038, 0.0036)), 0.0015)      # elbow
    fr = smin(fr, superellipsoid(Q, HAND + V(0.0, 0.0001, 0.0), (0.0040, 0.0021, 0.0050), 2.3, rb=0.0028), 0.0018)   # palm
    # hind: thick thigh out sideways, knee up, shin down to the ankle, long foot
    hi = chain(Q, [V(0.006, 0.0280, -0.046), V(0.028, 0.0315, -0.0425), V(0.0480, 0.0335, -0.0380)], [0.0088, 0.0068, 0.0050], 0.0025)
    hi = smin(hi, chain(Q, [V(0.0480, 0.0335, -0.0380), V(0.0585, 0.0180, -0.0470), ANKLE], [0.0054, 0.0043, 0.0035], 0.0015), 0.0015)
    hi = smin(hi, ellipsoid(Q, V(0.0480, 0.0335, -0.0390), V(0.0046, 0.0042, 0.0042)), 0.0015)     # knee
    hi = smin(hi, superellipsoid(Q, FOOT + V(-0.0005, 0.0001, -0.0035), (0.0042, 0.0021, 0.0072), 2.3, rb=0.0029, ax=nrm([0.25, 0, 1])), 0.002)
    return fr, hi


def toes(P):
    Q = _mirror(P)
    out_t, out_c = None, None
    for base, TOES, r0 in ((HAND, F_TOES, 0.00125), (FOOT, H_TOES, 0.00135)):
        for k, (a, L, off) in enumerate(TOES):
            ar = np.radians(a)
            b = base + V(np.sin(ar), 0, np.cos(ar)) * off + V(0, 0.0001, 0)
            if base is FOOT and k == 4:
                b = FOOT + V(0.0035, 0.0002, -0.0045)
            t, c = _toe(Q, b, a, L, r0)
            out_t = t if out_t is None else smin(out_t, t, 0.0007)
            out_c = c if out_c is None else np.minimum(out_c, c)
    return out_t, out_c


HEAD_BOX = (V(-0.025, 0.015, 0.072), V(0.025, 0.052, 0.146))


def parts(P):
    so, li, ba = eye_parts(P)
    fr, hi = legs(P)
    to, cl = toes(P)
    return {'body': body(P), 'lids': li, 'ball': ba, 'fleg': fr, 'hleg': hi, 'toe': to, 'claw': cl}


def shape(P):
    d = body(P)
    fr, hi = _local_n(P, (-0.07, -0.002, -0.07), (0.07, 0.045, 0.075), legs, 2)
    d = smin(d, fr, 0.003)
    d = smin(d, hi, 0.004)
    m = _box(P, HEAD_BOX[0], HEAD_BOX[1])
    if m.any():
        d[m] = head_ops(P[m], d[m])
    to, cl = _local_n(P, (-0.095, -0.002, -0.07), (0.095, 0.012, 0.095), toes, 2)
    d = smin(d, to, 0.0012)
    d = smin(d, cl, 0.0003)
    return d


# no separate tail tube: the tail is in the field
TAIL_RINGS = 0
# game mesh: islands packed square to the axes (long thin islands otherwise go diagonal and waste the map)
UV_PACK = {'rotate_method': 'AXIS_ALIGNED'}


# where the game mesh has to bend: (from, to, pitch, reach) segments; rings are cut across them every pitch, through
# the faces within reach of the segment
BEND = [
    (V(0.0, 0.008, -0.284), V(0.0, 0.026, -0.074), 0.0085, 0.024),        # tail
    (V(0.0, 0.026, -0.074), V(0.0, 0.031, 0.084), 0.007, 0.024),          # trunk and neck
    (V(0.010, 0.029, 0.047), V(0.044, 0.0335, 0.050), 0.0035, 0.0085),    # upper arm
    (V(0.044, 0.0335, 0.050), WRIST, 0.0035, 0.0065),                     # forearm
    (V(0.008, 0.028, -0.046), V(0.048, 0.0335, -0.038), 0.0035, 0.011),   # thigh
    (V(0.048, 0.0335, -0.038), ANKLE, 0.0035, 0.007),                     # shin
]


# seams across the body (z): the half body is unwrapped as three strips (head and shoulders, middle, tail)
SEAMS_Z = [-0.152, -0.021]


def _body_face(c):
    """is a face (center c) part of the body strip, not a leg"""
    w = float(np.interp(c.z, np.asarray(BODY)[:, 0], np.asarray(BODY)[:, 4]))
    return c.x < w + 0.0035 or c.z > 0.068 or c.z < -0.075


def unwrap(ob):
    """body and tail: conformal strips between the seams (scale rows stay straight on them); legs and feet: smart
    project; then all islands at the same texel density"""
    import bmesh, bpy
    me = ob.data
    bm = bmesh.from_edit_mesh(me)
    bm.faces.ensure_lookup_table()
    body = [f for f in bm.faces if _body_face(f.calc_center_median())]
    bset = set(body)
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
            ok = lambda c, p0, r: c.x < 0.022 or p0.z < -0.072
        else:
            ok = lambda c, p0, r, reach=reach: r < reach
        MF.rings(bm, tr, a, b, pitch, ok)
    MF.finish(bm)


# ---------- skinning ----------
WEIGHT_SMOOTH = (4, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['head'], 'head': V(0, 0.032, 0.14),
         'tail1': P['tail2'], 'tail2': P['tail3'], 'tail3': P['tail4'], 'tail4': V(0, 0.007, -0.29)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0.004, 0, 0.012)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (HAND + V(0.002, 0, 0.01)) * m
    return t


def keep(P):
    """how much of the sculpt's detail the game mesh keeps when decimating (0..1; the decimator weighs it strongly,
    so feet get only a little or they eat the whole budget)"""
    Pm = np.abs(P) * V(1, 0, 0) + P * V(0, 1, 1)
    e = sstep(0.0075, 0.005, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.3
    n = sstep(0.003, 0.0015, np.linalg.norm(Pm - NOSTRIL, axis=1)) * 0.15
    ear = sstep(0.0035, 0.002, np.linalg.norm(Pm - EAR, axis=1)) * 0.15
    tip = sstep(0.13, 0.138, Pm[:, 2]) * 0.1
    mouth = sstep(0.0012, 0.0004, np.abs(Pm[:, 1] - 0.0298)) * sstep(0.088, 0.095, Pm[:, 2]) * sstep(0.0125, 0.008, Pm[:, 0]) * 0.12
    feet = sstep(0.0085, 0.004, Pm[:, 1]) * sstep(0.04, 0.05, Pm[:, 0]) * FEET_KEEP
    # claws: thin hooks the decimator would flatten into slivers
    _, cl = _local_n(P, (-0.095, -0.002, -0.07), (0.095, 0.006, 0.095), toes, 2)
    claw = sstep(0.0004, 0.0001, cl) * 0.45
    return np.maximum.reduce([e, n, ear, tip, mouth, feet, claw])


FEET_KEEP = 0.12


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    W[:, bi['ctag']] = 0
    # toes, claws and the palm ride on the paw bones; the wrist and ankle on the metapodials
    for s in 'LR':
        sg = 1 if s == 'L' else -1
        for c, paw, meta in ((HAND, 'fpaw', 'fmeta'), (FOOT, 'hpaw', 'hmeta')):
            dx = np.hypot(wpos[:, 0] - sg * c[0], wpos[:, 2] - c[2])
            low = (dx < 0.026) & (wpos[:, 1] < 0.0055) & (wpos[:, 0] * sg > 0.035)
            W[low] = 0; W[low, bi[paw + s]] = 1
    # the head (from the ear forward) is all head, so the jaw does not stretch with the neck; blended over a few mm
    # so the bigger baby head does not make a step at the neck
    k = sstep(0.084, 0.097, wpos[:, 2])[:, None]
    hw = np.zeros_like(W); hw[:, bi['head']] = 1
    W = W * (1 - k) + hw * k
    return W


# ---------- scales ----------
_cache = {}
# scale sizes (m): a little larger than on a real young monitor, so they still read on 512 maps
SC_BODY, SC_LEG, SC_HEAD, SC_RING, SC_BELLY, SC_LIP = 0.00125, 0.00095, 0.0017, 0.0021, 0.0016, 0.0024


def _cells(P, size, seed):
    """3D cellular noise: F1, F2 (meters) and the nearest cell's feature point"""
    X = P / size
    f = np.floor(X).astype(np.int64)
    f1 = np.full(len(P), 9.0, F); f2 = np.full(len(P), 9.0, F)
    best = np.zeros((len(P), 3), F)
    for dz in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                cx, cy, cz = f[:, 0] + dx, f[:, 1] + dy, f[:, 2] + dz
                fp = np.stack([cx + 0.15 + 0.7 * _hash(cx, cy, cz, seed), cy + 0.15 + 0.7 * _hash(cx, cy, cz, seed + 1), cz + 0.15 + 0.7 * _hash(cx, cy, cz, seed + 2)], 1).astype(F)
                d = np.linalg.norm(fp - X, axis=1)
                m = d < f1
                f2 = np.where(m, f1, np.minimum(f2, d))
                f1 = np.where(m, d, f1)
                best[m] = fp[m]
    return f1 * size, f2 * size, best * size


def _rows(u, v, pu, pv, stagger=0.5):
    """rectangular scales in rows: row index along u (pitch pu), cell along v (pitch pv), alternate rows shifted.
    Returns fractional position in the scale (a along u 0..1, b across 0..1) and the scale's center (u, v)."""
    r = np.floor(u / pu)
    vv = v / pv + stagger * (r % 2)
    c = np.floor(vv)
    a = u / pu - r
    b = vv - c
    return a, b, (r + 0.5) * pu, (c + 0.5 - stagger * (r % 2)) * pv


def _regions(P, N, c):
    Pm = _mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    r = {'Pm': Pm, 'Nm': Nm}
    r['claw'] = sstep(0.00025, 0.00005, c['claw'])
    r['ball'] = sstep(0.0003, 0.0001, c['ball']) * sstep(EYE_R + 0.0008, EYE_R + 0.0002, np.linalg.norm(Pm - EYE_C, axis=1))
    r['eyeD'] = np.linalg.norm(Pm - EYE_C, axis=1)
    r['lid'] = sstep(EYE_R + 0.0024, EYE_R + 0.0010, r['eyeD']) * (1 - r['ball'])
    near = lambda k, w=0.0006: sstep(w, 0.0, c[k])
    r['toe'] = near('toe', 0.0004) * sstep(0.0045, 0.0025, y)
    r['leg'] = np.maximum(near('fleg', 0.0008), near('hleg', 0.0008)) * sstep(0.0015, 0.004, c['body'])
    r['leg'] = np.maximum(r['leg'], r['toe'])
    r['tail'] = sstep(-0.068, -0.08, z) * (1 - r['leg'])
    r['head'] = sstep(0.083, 0.090, z)
    # underside of the trunk, neck and tail (pale belly scales in rows)
    yw = _interp(BODY, z, 2)
    r['belly'] = sstep(-0.45, -0.8, Nm[:, 1]) * sstep(yw - 0.002, yw - 0.006, y) * (1 - r['leg'])
    r['belly'] = np.maximum(r['belly'], sstep(-0.35, -0.75, Nm[:, 1]) * sstep(0.014, 0.008, x) * (1 - r['leg']))
    # lips: the rows of scales along the upper and lower jaw edge
    lipy = 0.0293 + (0.0306 - 0.0293) * sstep(0.14, 0.09, z)
    r['lipD'] = y - lipy
    r['lip'] = sstep(0.0026, 0.0012, np.abs(r['lipD'])) * sstep(0.087, 0.093, z) * sstep(0.0015, 0.004, x + 0.003 * sstep(0.135, 0.142, z))
    return r


def scales(P, N, c):
    """per texel: height (meters), distance to the scale edge (0 at the groove, ~0.5 in the middle), the scale's
    center (for coloring each scale as one) and region masks"""
    key = (len(P), float(P[:7].sum()))
    if key in _cache:
        return _cache[key]
    R = _regions(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    H = np.zeros(n, F); E = np.full(n, 0.5, F); C = Pm.copy()
    # granular body scales: little domed beads (smaller on the legs, larger and flatter on the head)
    for sz, m in ((SC_BODY, (R['head'] < 0.5) & (R['leg'] < 0.5)), (SC_LEG, R['leg'] >= 0.5), (SC_HEAD, R['head'] >= 0.5)):
        if not m.any():
            continue
        f1, f2, cp = _cells(Pm[m], sz, 71 if sz < SC_HEAD else 72)
        e = (f2 - f1) / sz
        dome = np.sqrt(np.clip(1 - (f1 / (0.62 * sz)) ** 2, 0, 1))
        flat = 0.55 if sz >= SC_HEAD else 0.0
        hh = sz * 0.16 * (sstep(0.0, 0.22, e) * (flat + (1 - flat) * (0.35 + 0.65 * dome)))
        H[m] = hh; E[m] = e; C[m] = cp
    # tail: rings of rectangular keeled scales (whorls)
    tm = R['tail'] > 0.01
    if tm.any():
        zt, yt, xt = z[tm], y[tm], x[tm]
        yc = _interp(BODY, zt, 2)
        th = np.arctan2(xt, yt - yc)                    # 0 on top, pi underneath
        rr = _interp(BODY, zt, 4)
        s_al = -zt
        pr = SC_RING
        ring = np.floor(s_al / pr)
        rc = _interp(BODY, -(ring + 0.5) * pr, 4)
        nn = np.maximum(3, np.round(np.pi * np.maximum(rc, 0.0008) * 1.15 / SC_RING))
        vv = th / np.pi * nn + 0.5 * (ring % 2)
        cc = np.floor(vv)
        a = s_al / pr - ring; b = vv - cc
        # imbricate: rises toward the back edge of each scale, a keel down its middle
        hh = 0.15 * SC_RING * (0.35 + 0.65 * a ** 0.8) * sstep(0.0, 0.07, a) * sstep(1.0, 0.9, a) * sstep(0.0, 0.08, b) * sstep(1.0, 0.92, b)
        hh += 0.045 * SC_RING * np.exp(-((b - 0.5) / 0.1) ** 2) * sstep(0.1, 0.6, a) * sstep(0.35, 0.8, np.cos(th) * 0.5 + 0.5)
        e = np.minimum(np.minimum(a, 1 - a) * pr, np.minimum(b, 1 - b) * np.pi * rc / nn) / SC_RING
        thc = (cc + 0.5 - 0.5 * (ring % 2)) / nn * np.pi
        zc = -(ring + 0.5) * pr
        ycc = _interp(BODY, zc, 2)
        cp = np.stack([np.sin(thc) * rc, ycc + np.cos(thc) * rc, zc], 1).astype(F)
        k = R['tail'][tm]
        H[tm] = H[tm] * (1 - k) + hh * k; E[tm] = E[tm] * (1 - k) + e * k
        C[tm] = np.where(k[:, None] > 0.5, cp, C[tm])
    # belly: transverse rows of flat rectangular plates
    bm = R['belly'] > 0.01
    if bm.any():
        a, b, uc, vc = _rows(-z[bm], x[bm], SC_BELLY, SC_BELLY * 0.92)
        hh = 0.1 * SC_BELLY * (0.45 + 0.55 * a) * sstep(0.0, 0.1, a) * sstep(1.0, 0.88, a) * sstep(0.0, 0.1, b) * sstep(1.0, 0.9, b)
        e = np.minimum(np.minimum(a, 1 - a) * 1.1, np.minimum(b, 1 - b)) * 0.9
        k = R['belly'][bm]
        H[bm] = H[bm] * (1 - k) + hh * k; E[bm] = E[bm] * (1 - k) + e * k
        cp = np.stack([np.abs(vc), y[bm], -uc], 1).astype(F)
        C[bm] = np.where(k[:, None] > 0.5, cp, C[bm])
    # lips: one row of tall plates above and below the mouth line
    lm = R['lip'] > 0.01
    if lm.any():
        a, b, uc, vc = _rows(-z[lm], np.sign(R['lipD'][lm]) + 2, SC_LIP, 1.0, 0.0)
        hh = 0.09 * SC_LIP * sstep(0.0, 0.1, a) * sstep(1.0, 0.86, a) * sstep(0.0, 0.0005, np.abs(R['lipD'][lm]))
        e = np.minimum(a, 1 - a) * 1.2
        k = R['lip'][lm]
        H[lm] = H[lm] * (1 - k) + hh * k; E[lm] = E[lm] * (1 - k) + e * k
        cp = np.stack([x[lm], y[lm], -uc], 1).astype(F)
        C[lm] = np.where(k[:, None] > 0.5, cp, C[lm])
    # claws and eyes have no scales
    bare = np.maximum(R['claw'], R['ball'])
    H *= 1 - bare
    out = (H, E, C, R)
    _cache[key] = out
    return out


# ---------- skin paint (sRGB 0..1) and fine detail (meters) ----------
def _hex(h):
    return np.array([((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255], F)


K = {
    'black': _hex(0x1A1B1D), 'blackHi': _hex(0x2A2C2E), 'gap': _hex(0x0C0C0D), 'yellow': _hex(0xF0C02A), 'yellowDk': _hex(0xC8931A),
    'cream': _hex(0xE8D58A), 'belly': _hex(0xD9C77C), 'bellyDk': _hex(0x2A2620), 'claw': _hex(0x2B2622), 'clawTip': _hex(0x6A5F52),
    'ball': _hex(0x141010), 'pink': _hex(0x8A5A55),
}


def _mix(c, k, t):
    t = np.clip(t, 0, 1)[:, None]
    return c + (k - c) * t


def _spots(C, R):
    """yellow spot mask evaluated at each scale's center: transverse bands of yellow spots across the back (a young
    lace monitor), smaller spots on the legs and head, the tail ringed with rows of spots"""
    x, y, z = C[:, 0], C[:, 1], C[:, 2]
    f1, _, cp = _cells(C, 0.0062, 81)
    # bands along the body (about 2.4 cm apart); spots crowd into the bands and thin out between them
    band = 0.5 + 0.5 * np.cos(2 * np.pi * (z - 0.006) / 0.024)
    dens = 0.35 + 0.55 * band
    rad = 0.0017 + 0.0009 * band
    j = _hash(np.floor(cp[:, 0] / 0.0062 * 3).astype(np.int64), np.floor(cp[:, 1] / 0.0062 * 3).astype(np.int64), np.floor(cp[:, 2] / 0.0062 * 3).astype(np.int64), 83)
    sp = sstep(rad + 0.0003, rad - 0.0002, f1) * (j < dens)
    # head: small round spots
    f1h, _, cph = _cells(C, 0.003, 84)
    jh = _hash(np.floor(cph[:, 0] / 0.003 * 3).astype(np.int64), np.floor(cph[:, 1] / 0.003 * 3).astype(np.int64), np.floor(cph[:, 2] / 0.003 * 3).astype(np.int64), 85)
    sh = sstep(0.0011, 0.0008, f1h) * (jh < 0.5)
    # legs and feet: little spots
    f1l, _, cpl = _cells(C, 0.0028, 86)
    jl = _hash(np.floor(cpl[:, 0] / 0.0028 * 3).astype(np.int64), np.floor(cpl[:, 1] / 0.0028 * 3).astype(np.int64), np.floor(cpl[:, 2] / 0.0028 * 3).astype(np.int64), 87)
    sl = sstep(0.0010, 0.0007, f1l) * (jl < 0.65)
    # tail: rings of spots, closer to solid bands toward the tip
    zt = -z
    ring = 0.5 + 0.5 * np.cos(2 * np.pi * (zt - 0.07) / 0.019)
    f1t, _, _ = _cells(C, 0.0034, 88)
    st = sstep(0.45, 0.8, ring) * np.clip(sstep(0.0013, 0.0009, f1t) + sstep(-0.19, -0.24, z) * 0.85, 0, 1)
    st = st * sstep(-0.275, -0.255, z)
    m = sp
    m = m * (1 - R['head']) + sh * R['head']
    m = m * (1 - R['leg']) + sl * R['leg']
    m = m * (1 - R['tail']) + st * R['tail']
    # fewer spots low on the flanks, none on the belly or the claws
    return np.clip(m, 0, 1)


def paint(P, N, c):
    H, E, C, R = scales(P, N, c)
    Pm = R['Pm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    jit = _hash(np.round(C[:, 0] * 40000).astype(np.int64), np.round(C[:, 1] * 40000).astype(np.int64), np.round(C[:, 2] * 40000).astype(np.int64), 91)
    col = np.tile(K['black'], (len(P), 1))
    col = _mix(col, K['blackHi'], 0.5 * jit)
    sp = _spots(C, R)
    ycol = _mix(np.tile(K['yellow'], (len(P), 1)), K['yellowDk'], 0.35 * jit + 0.2 * sstep(0.3, 0.0, E))
    col = _mix(col, ycol, sp)
    # belly: pale cream with dark crossbars; throat barred too
    bb = 0.5 + 0.5 * np.cos(2 * np.pi * (C[:, 2] - 0.004) / 0.011)
    bcol = _mix(np.tile(K['belly'], (len(P), 1)), K['bellyDk'], sstep(0.62, 0.8, bb) * sstep(-0.075, -0.03, z) * 0.85)
    bcol = _mix(bcol, K['bellyDk'], sstep(0.55, 0.75, 0.5 + 0.5 * np.cos(2 * np.pi * (C[:, 2] - 0.07) / 0.0062)) * sstep(0.068, 0.075, z) * sstep(0.096, 0.09, z) * 0.9)
    col = _mix(col, bcol, R['belly'] * sstep(-0.24, -0.1, z))
    col = _mix(col, _mix(np.tile(K['black'], (len(P), 1)), K['belly'], sp * 0.8 + 0.25), R['belly'] * sstep(-0.1, -0.24, z))
    # lips: cream scales with black bars between (the lace monitor's barred jaw)
    lipb = sstep(0.8, 0.92, 0.5 + 0.5 * np.cos(2 * np.pi * (C[:, 2] - 0.13) / 0.0075))
    col = _mix(col, _mix(np.tile(K['black'], (len(P), 1)), K['yellowDk'], lipb * 0.6), R['lip'] * sstep(0.092, 0.1, z))
    # chin and the underside of the jaw: pale with black bars
    chin = sstep(-0.3, -0.7, R['Nm'][:, 1]) * R['head'] * sstep(0.03, 0.027, y)
    chb = sstep(0.5, 0.7, 0.5 + 0.5 * np.cos(2 * np.pi * (C[:, 2] - 0.1) / 0.0058))
    col = _mix(col, _mix(np.tile(K['cream'], (len(P), 1)), K['black'], chb), chin * (1 - R['lip']))
    # the skin between scales is darker
    col = col * (0.55 + 0.45 * sstep(0.0, 0.2, E))[:, None]
    # soft sheen variation
    col *= (0.94 + 0.12 * fbm(Pm * 180, 2, 93))[:, None]
    # claws: dark horn, paler at the tip
    cc = _mix(np.tile(K['claw'], (len(P), 1)), K['clawTip'], sstep(0.0018, 0.0002, y) * 0.6)
    col = _mix(col, cc, R['claw'])
    # eye: dark ball (the game draws its own eye on top); the lid rim a little paler
    col = _mix(col, K['ball'], R['ball'])
    D = Pm - EYE_C
    s_, u_ = D @ EYE_SIDE, D @ EYE_UP - LID_OFF
    ap = np.sqrt((s_ / LID_W) ** 2 + (u_ / LID_H) ** 2)
    col = _mix(col, K['gap'], sstep(1.45, 1.05, ap) * sstep(EYE_R + 0.0016, EYE_R + 0.0006, R['eyeD']) * 0.8)
    # nostril and ear openings: dark
    nd = np.linalg.norm((Pm - NOSTRIL - V(0.0006, 0.0001, 0)) / V(0.0009, 0.0006, 0.0010), axis=1)
    col = _mix(col, K['gap'], sstep(1.25, 0.8, nd))
    ed = np.linalg.norm((Pm - EAR - V(0.0010, 0, 0)) / V(0.0014, 0.0018, 0.0011), axis=1)
    col = _mix(col, K['gap'], sstep(1.3, 0.85, ed) * 0.9)
    rough = 0.5 + 0.12 * (1 - sstep(0.0, 0.2, E)) + 0.06 * R['belly'] - 0.15 * R['claw'] - 0.3 * R['ball']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    H, E, C, R = scales(P, N, c)
    return H.astype(F)


def finish(C, ao, valid):
    lin = np.where(C <= 0.04045, C / 12.92, ((C + 0.055) / 1.055) ** 2.4)
    lin = lin * (0.35 + 0.65 * ao[..., None])
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(np.maximum(lin, 0), 1 / 2.4) - 0.055)


# ---------- what the game needs besides the mesh ----------
MAP_QUALITY = (68, 68)


def stats(P, N, c, col):
    R = _regions(P, N, c)
    m = R['lid'] * sstep(EYE_R + 0.0018, EYE_R + 0.0009, R['eyeD'])
    lid = (col * m[:, None]).sum(0) / max(m.sum(), 1e-6)
    return {'lidCol': int(round(lid[0] * 255)) << 16 | int(round(lid[1] * 255)) << 8 | int(round(lid[2] * 255))}


def meta(st):
    r = EYE_R
    up, dn = (LID_OFF + LID_H) / r, (LID_OFF - LID_H) / r
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.25],
                'iris': 0x9A6A22, 'irisR': 0.9, 'pupilR': 0.42, 'lidCol': st['lidCol']},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.04, 0.04, 0.05], 'flat': 0x1A1B1D,
    }
