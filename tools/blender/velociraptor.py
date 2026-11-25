# round 17: Velociraptor mongoliensis at its real size: about 2 m long with its tail and 0.5 m tall at the hips (a big
# turkey), sculpted as a signed distance field around the game's skeleton (tools/blender/work/velociraptor-rig.json).
# Units are meters in game rig space (x left, y up, z forward, ground at y = 0). Laid out like trex.py (a biped, the
# head in its own frame); the feathers are painted like the birds' (bird.plumage) and the arm and tail feathers are the
# game's feather blades, cut from this file's feather atlas (FEATHER_ATLAS, as the birds').
# Shape: a compact, feathered body balanced over the hips, an S-curved neck, a long, low, narrow skull with a slightly
# dished snout, a big eye, lips with the tips of small teeth showing along them; folded arms (humerus down and back,
# forearm forward, the long three-fingered hand forward and down, hooked claws); long legs, a feathered thigh and shin,
# a slim scaly foot standing on two toes (III and IV) with the second toe raised off the ground carrying the big sickle
# claw, a small first toe behind; a long, slim, stiff tail.
# Paint: warm sandy brown with a darker back, dark bars across the back and the tail, a cream belly and throat, a dark
# stripe back from the eye; gray-brown scaly feet, dark claws. The chick: fluffy down (fur shells on babies only, its
# own color map: tan with dark stripes down the back).
# Make it with: VOXEL=0.0045 TRIS=6400 TEX=768 WEIGHTS=transfer BLENDER_PY=... python3 tools/blender/make.py velociraptor
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length, axis_steps
import ungulate as U
import bird as BD
from ungulate import local as _local, local_n as _local_n, mirror as _mirror

ID = 'velociraptor'
BOUNDS = (V(-0.2, -0.001, -1.36), V(0.2, 0.79, 0.7))
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
BAKE_DIST = (0.006, 0.02, 0.06)

# ---------- landmarks (left side, +x) ----------
HIP, KNEE, ANKLE, BALL = V(0.075, 0.48, 0.0), V(0.085, 0.3, 0.09), V(0.085, 0.12, -0.03), V(0.078, 0.02, 0.03)
SHOULDER, ELBOW, WRIST, KNUCK = V(0.06, 0.46, 0.27), V(0.085, 0.36, 0.22), V(0.09, 0.33, 0.33), V(0.092, 0.3, 0.4)
# toes III and IV on the ground (deg from +z toward +x), toe I small behind
TOES = [dict(a=-4, len=0.085, r=0.0125, r1=0.0085, claw=0.024, clawR=0.0062, n=3), dict(a=20, len=0.075, r=0.0115, r1=0.008, claw=0.02, clawR=0.0056, n=3)]
# the raised second toe and its sickle claw: knuckles from the ball, and the claw's curve
SICKLE_TOE = [BALL + V(-0.012, 0.012, -0.002), BALL + V(-0.014, 0.026, 0.012), BALL + V(-0.015, 0.036, 0.02)]
SICKLE = [SICKLE_TOE[-1] + V(0, 0.006, 0.002), SICKLE_TOE[-1] + V(0, 0.02, 0.018), SICKLE_TOE[-1] + V(0, 0.018, 0.04),
          SICKLE_TOE[-1] + V(0, 0.0, 0.054), SICKLE_TOE[-1] + V(0, -0.02, 0.056)]
SICKLE_R = [0.0102, 0.0086, 0.006, 0.0034, 0.0008]
# head frame: from the back of the skull forward (a little down) to the tip of the snout
HO = V(0.0, 0.725, 0.41)
HA = nrm([0.0, -0.192, 0.981])
HU = nrm([0.0, 0.981, 0.192])
HL = 0.262


def hp(s, u, x=0.0):
    return HO + HA * s + HU * u + V(1, 0, 0) * x


def hframe(Q):
    D = Q - HO
    return np.stack([D[:, 0], D @ HU, D @ HA], 1)


HEAD = [
    (-0.025, 0.026, -0.004, -0.03, 0.026, 2.0, 2.0),
    (0.02, 0.038, -0.004, -0.043, 0.036, 2.1, 2.1),
    (0.06, 0.036, -0.006, -0.045, 0.032, 2.2, 2.2),
    (0.1, 0.028, -0.008, -0.041, 0.025, 2.3, 2.3),
    (0.15, 0.0185, -0.01, -0.033, 0.0175, 2.4, 2.3),
    (0.2, 0.0155, -0.011, -0.028, 0.014, 2.4, 2.2),
    (0.238, 0.012, -0.012, -0.022, 0.0105, 2.2, 2.0),
    (0.262, 0.004, -0.013, -0.016, 0.005, 2.0, 2.0),
]
EYE_S, EYE_U = 0.056, 0.012
EYE_R = 0.0105
EYE_DIR = nrm([0.8, 0.18, 0.56])
LID_W, LID_H, LID_OFF = 0.0105, 0.0078, 0.0004
MOUTH = hp(0.25, -0.017)


def lip_u(s):
    return np.interp(s, [0.06, 0.09, 0.16, 0.22, 0.26], [-0.021, -0.024, -0.022, -0.019, -0.015]).astype(F)


def _seat(s, u, r, out=0.35):
    a, b = 0.0, 0.1
    for _ in range(40):
        m = 0.5 * (a + b)
        d = float(loft(np.array([[m, u, s]], F), HEAD)[0])
        a, b = (m, b) if d < 0 else (a, m)
    return hp(s, u, a - r * (1 - out))


EYE_C = _seat(EYE_S, EYE_U, EYE_R)
EYE_HF = hframe(EYE_C[None])[0]

BODY = [
    (-0.34, 0.585, 0.525, 0.46, 0.055, 2.0, 2.0),
    (-0.2, 0.6, 0.505, 0.4, 0.085, 2.1, 2.0),
    (-0.04, 0.605, 0.475, 0.345, 0.105, 2.2, 2.0),
    (0.1, 0.595, 0.465, 0.335, 0.105, 2.2, 2.0),
    (0.22, 0.585, 0.47, 0.36, 0.088, 2.1, 2.0),
    (0.31, 0.58, 0.5, 0.42, 0.058, 2.0, 2.0),
]
NECK = [
    (0.49, 0.2, 0.062, 0.072, 0.06, 2.0, 2.0),
    (0.555, 0.3, 0.05, 0.058, 0.048, 2.0, 2.0),
    (0.64, 0.355, 0.043, 0.048, 0.04, 2.0, 2.0),
    (0.705, 0.405, 0.038, 0.042, 0.035, 2.0, 2.0),
]
TAIL = [
    (0.53, -0.18, 0.055, 0.06, 0.055, 2.0, 2.0),
    (0.53, -0.42, 0.042, 0.045, 0.04, 2.0, 2.0),
    (0.515, -0.72, 0.028, 0.03, 0.026, 2.0, 2.0),
    (0.495, -1.0, 0.018, 0.019, 0.016, 2.0, 2.0),
    (0.48, -1.2, 0.011, 0.011, 0.01, 2.0, 2.0),
    (0.47, -1.33, 0.004, 0.004, 0.004, 2.0, 2.0),
]


def body(P):
    Q = _mirror(P)
    d = loft(Q, BODY)
    # the breast and the shoulders under the folded arms
    d = smin(d, ellipsoid(Q, V(0.03, 0.42, 0.2), V(0.06, 0.07, 0.08)), 0.04)
    return d


def neck(P):
    return sweep(_mirror(P), NECK, n=32)


def tail(P):
    return sweep(_mirror(P), TAIL, n=48)


TEETH = [(s, 0.002 + 0.0015 * ((i * 7) % 3)) for i, s in enumerate(np.arange(0.095, 0.25, 0.013))]


def teeth(P):
    Q = _mirror(P)
    L = hframe(Q)
    out = np.full(len(P), 1.0, F)
    for s0, ln in TEETH:
        hw = float(np.interp(s0, [h[0] for h in HEAD], [h[4] for h in HEAD]))
        x0 = hw * 0.88
        u0 = float(lip_u(np.array([s0], F))[0])
        out = np.minimum(out, round_cone(L, V(x0 - 0.0015, u0 + 0.002, s0 + 0.001), V(x0 - 0.001, u0 - ln, s0 - 0.0012), 0.0016, 0.0003))
    return out


def head(P):
    Q = _mirror(P)
    L = hframe(Q)
    x, u, s = L[:, 0], L[:, 1], L[:, 2]
    d = loft(L, HEAD)
    # the jaw muscles behind the eye, a low brow ridge over it
    d = smin(d, ellipsoid(L, V(0.022, -0.012, 0.012), V(0.012, 0.018, 0.02)), 0.012)
    d = smin(d, round_cone(L, V(0.024, 0.024, 0.04), V(0.018, 0.022, 0.075), 0.006, 0.004), 0.008)
    # the antorbital hollow in front of the eye and the nostril near the tip
    ao = ((s - 0.115) / 0.03) ** 2 + ((u + 0.004) / 0.012) ** 2
    d = d + 0.003 * np.exp(-ao * 1.4) * sstep(0.008, 0.014, np.abs(x))
    no = ((s - 0.235) / 0.01) ** 2 + ((u - 0.001) / 0.005) ** 2
    d = d + 0.0025 * np.exp(-no * 1.5) * sstep(0.004, 0.007, np.abs(x))
    # closed lips: a groove along the lip line, the lower lip set in a little
    lu = lip_u(s)
    lip = np.exp(-((u - lu) / 0.0018) ** 2) * sstep(0.06, 0.08, s)
    low = sstep(lu + 0.0006, lu - 0.004, u) * sstep(0.08, 0.1, s) * sstep(0.27, 0.25, s)
    d = d + 0.0018 * lip + 0.0012 * low
    ca, li, ba, br = eye_parts(P)
    d = smin(d, li, 0.004)
    d = smin(d, br, 0.005)
    d = smax(d, -ca, 0.0015)
    d = smin(d, ba, 0.0008)
    d = smin(d, teeth(P), 0.001)
    return d


def eye_parts(P):
    Q = _mirror(P)
    return U.eye_parts(Q, EYE_C, EYE_R, EYE_DIR, LID_W, LID_H, LID_OFF, mound=(0.0045, 0.004, 0.0016),
                       brow=((-0.012, 0.011, -0.008), (0.006, 0.012, -0.006), 0.005, 0.0035))


def leg(P):
    Q = _mirror(P)
    # the feathered thigh and shin (the coat's volume), the slim scaly metatarsus
    d = ellipsoid(Q, V(0.082, 0.415, 0.035), V(0.05, 0.095, 0.075))
    d = smin(d, round_cone(Q, KNEE, ANKLE + V(0, 0.03, 0), 0.034, 0.02), 0.02)
    d = smin(d, ellipsoid(Q, V(0.086, 0.24, 0.05), V(0.032, 0.07, 0.04)), 0.02)
    d = smin(d, round_cone(Q, ANKLE, BALL + V(0, 0.01, 0), 0.016, 0.013), 0.008)
    return d


def foot(P):
    """toes III and IV on the ground, the second toe raised with the sickle claw held up, a small first toe behind;
    returns (toes, claws)"""
    Q = _mirror(P)
    dt, dc, _ = BD.toes(Q, BALL + V(0.0, 0.0, 0.006), TOES)
    dt = smin(dt, ellipsoid(Q, BALL + V(0, 0.008, 0.0), V(0.017, 0.012, 0.02)), 0.006)
    # toe II, raised, its knuckles up off the ground
    d2 = round_cone(Q, SICKLE_TOE[0], SICKLE_TOE[1], 0.0115, 0.0105)
    d2 = smin(d2, round_cone(Q, SICKLE_TOE[1], SICKLE_TOE[2], 0.0105, 0.0098), 0.003)
    dt = smin(dt, d2, 0.004)
    # the sickle claw: a big hooked claw curving up, forward and down
    sc = None
    for i in range(len(SICKLE) - 1):
        e = round_cone(Q, SICKLE[i], SICKLE[i + 1], SICKLE_R[i], SICKLE_R[i + 1])
        sc = e if sc is None else smin(sc, e, 0.0015)
    # toe I behind, inside, off the ground, with a small claw
    t1 = round_cone(Q, V(0.078, 0.06, -0.004), V(0.07, 0.046, -0.024), 0.0065, 0.005)
    c1 = round_cone(Q, V(0.07, 0.046, -0.024), V(0.068, 0.037, -0.032), 0.0042, 0.0008)
    dt = smin(dt, t1, 0.004)
    return dt, np.minimum(np.minimum(dc, sc), c1)


def arm(P):
    """the folded arm: humerus, forearm and the long hand with three clawed fingers; returns (arm, claws)"""
    Q = _mirror(P)
    d = round_cone(Q, SHOULDER, ELBOW, 0.019, 0.013)
    d = smin(d, round_cone(Q, ELBOW, WRIST, 0.013, 0.0095), 0.006)
    d = smin(d, round_cone(Q, WRIST, KNUCK, 0.0095, 0.008), 0.004)
    claws = None
    for dy, L, cl in ((0.008, 0.028, 0.018), (0.0, 0.045, 0.022), (-0.008, 0.038, 0.019)):
        dv = nrm([0.0, -0.35 + dy * 10, 1.0])
        f0 = KNUCK + V(0.0, dy, 0.0)
        f1 = f0 + dv * L
        d = smin(d, round_cone(Q, f0, f1, 0.005, 0.0038), 0.003)
        cd = nrm([0.0, -0.9, 0.45])
        c0 = f1 + dv * 0.003
        c1 = c0 + dv * cl * 0.5 + cd * cl * 0.2
        c2 = c1 + cd * cl * 0.55
        c = smin(round_cone(Q, c0, c1, 0.0034, 0.002), round_cone(Q, c1, c2, 0.002, 0.0004), 0.001)
        claws = c if claws is None else np.minimum(claws, c)
    return d, claws


HEAD_BOX = (V(-0.07, 0.63, 0.36), V(0.07, 0.79, 0.7))
NECK_BOX = (V(-0.1, 0.4, 0.12), V(0.1, 0.78, 0.47))
LEG_BOX = (V(-0.17, -0.01, -0.12), V(0.17, 0.56, 0.17))
FOOT_BOX = (V(-0.16, -0.01, -0.08), V(0.16, 0.08, 0.17))
ARM_BOX = (V(-0.13, 0.25, 0.17), V(0.13, 0.5, 0.48))
TAIL_BOX = (V(-0.1, 0.4, -1.36), V(0.1, 0.62, -0.08))


def parts(P):
    so, li, ba, br = eye_parts(P)
    ft, cl = _local_n(P, *FOOT_BOX, foot, 2)
    ar, ac = _local_n(P, *ARM_BOX, arm, 2)
    return {'body': body(P), 'neck': _local(P, *NECK_BOX, neck), 'head': _local(P, *HEAD_BOX, head), 'lids': li, 'ball': ba, 'brow': br,
            'leg': _local(P, *LEG_BOX, leg), 'foot': ft, 'claw': np.minimum(cl, ac), 'arm': ar, 'tooth': _local(P, *HEAD_BOX, teeth),
            'tail': _local(P, *TAIL_BOX, tail)}


def shape(P):
    d = body(P)
    d = smin(d, _local(P, *NECK_BOX, neck), 0.03)
    d = smin(d, _local(P, *HEAD_BOX, head), 0.015)
    d = smin(d, _local(P, *TAIL_BOX, tail), 0.03)
    d = smin(d, _local(P, *LEG_BOX, leg), 0.03)
    ft, cl = _local_n(P, *FOOT_BOX, foot, 2)
    d = smin(d, ft, 0.006)
    d = smin(d, cl, 0.0015)
    ar, ac = _local_n(P, *ARM_BOX, arm, 2)
    d = smin(d, ar, 0.012)
    d = smin(d, ac, 0.001)
    return d


def grid(h):
    """finer round the head (the eye, the lips and teeth), the hands and the feet"""
    lo, hi = BOUNDS
    xs = axis_steps(0.0, hi[0], [(0.0, 0.11, h * 0.6)], h)
    ys = axis_steps(lo[1], hi[1], [(lo[1], 0.09, h * 0.4), (0.26, 0.38, h * 0.5), (0.64, hi[1], h * 0.4)], h)
    zs = axis_steps(lo[2], hi[2], [(-0.08, 0.16, h * 0.45), (0.3, 0.48, h * 0.5), (0.4, hi[2], h * 0.4)], h)
    return xs, ys, zs


PATCHES = [
    (EYE_C * V(0, 1, 1) + V(0.012, -0.022, -0.022), EYE_C * V(0, 1, 1) + V(0.048, 0.022, 0.022), 0.0006),   # eye and lids
    (V(0.0, 0.64, 0.45), V(0.03, 0.72, 0.69), 0.0009),                                                     # lips and teeth
    (V(0.03, -0.001, -0.06), V(0.13, 0.08, 0.16), 0.0012),                                                 # foot and claws
    (V(0.06, 0.26, 0.3), V(0.12, 0.36, 0.48), 0.0009),                                                     # hand and claws
]

PREVIEW = {
    'side': ((3.6, 0.5, -0.3), (0, 0.4, -0.3), 34),
    'front3q': ((1.8, 0.9, 2.0), (0, 0.45, 0.0), 34),
    'head': ((0.3, 0.8, 0.95), (0, 0.7, 0.55), 24),
    'feet': ((0.4, 0.12, 0.35), (0.08, 0.04, 0.03), 26),
}


# ---------- the game mesh ----------
def keep(P):
    Pm = _mirror(P)
    e = sstep(0.03, 0.015, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.85
    L = hframe(Pm)
    hd = sstep(-0.01, 0.01, L[:, 2]) * sstep(0.37, 0.39, Pm[:, 2]) * 0.62
    lp = sstep(0.008, 0.002, np.abs(L[:, 1] - lip_u(L[:, 2]))) * sstep(0.06, 0.09, L[:, 2]) * sstep(0.4, 0.42, Pm[:, 2]) * 0.8
    th = sstep(0.0015, 0.0, _local(P, *HEAD_BOX, teeth)) * 0.8
    ft = sstep(0.09, 0.04, Pm[:, 1]) * 0.6
    ar = U.box(Pm, ARM_BOX[0] * V(0, 1, 1) + V(0.04, 0, 0), ARM_BOX[1]).astype(F) * 0.55
    base = np.full(len(P), 0.34, F)
    return np.maximum.reduce([base, e, hd, lp, th, ft, ar]).astype(F)


BEND = [
    (V(0.0, 0.47, -1.3), V(0.0, 0.53, -0.15), 0.07, 0.09),       # tail
    (V(0.0, 0.5, 0.22), V(0.0, 0.71, 0.41), 0.035, 0.08),        # neck
    (V(0.08, 0.47, 0.0), KNEE, 0.04, 0.12),                      # thigh
    (KNEE, ANKLE, 0.035, 0.06),                                  # shin
    (ANKLE, BALL, 0.03, 0.04),                                   # metatarsus
]


def lowpoly_fix(bm, hi):
    import meshfix as MF
    tr = MF.tree(hi)
    for a, b, pitch, reach in BEND:
        if a[0] == 0 and b[0] == 0:
            ok = lambda c, p0, r, reach=reach: r < reach and abs(c.x) < 0.07
        else:
            ok = lambda c, p0, r, reach=reach: r < reach and abs(c.x) > 0.035
        MF.rings(bm, tr, a, b, pitch, ok)
    MF.finish(bm, 1e-7)


UV_AVERAGE = True
UV_PACK = dict(margin_method='FRACTION', margin=0.006)


def _own(c):
    keys = ['body', 'neck', 'head', 'tail', 'leg', 'foot', 'arm']
    D = np.stack([c[k] for k in keys], 1)
    o = np.argmin(D, 1)
    return {k: o == i for i, k in enumerate(keys)}


def uv_regions(P):
    """head, neck, trunk, tail, thighs and shins, feet, arms"""
    Pm = _mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 2)
    L = hframe(Pm)
    lab[(z > 0.27) & (y > 0.5)] = 1
    lab[(L[:, 2] > -0.01) & (z > 0.37)] = 0
    lab[z < -0.3] = 3
    lab[(x > 0.04) & (y < 0.5) & (y > 0.11) & (z > -0.1) & (z < 0.16)] = 4
    lab[(y <= 0.11) & (x > 0.03)] = 5
    lab[(x > 0.045) & (y > 0.26) & (y < 0.48) & (z > 0.18) & (z < 0.48)] = 6
    return lab


def uv_weight(P):
    Pm = _mirror(P)
    L = hframe(Pm)
    head = sstep(-0.01, 0.0, L[:, 2]) * sstep(0.37, 0.39, Pm[:, 2])
    foot = sstep(0.1, 0.05, Pm[:, 1])
    arm = U.box(Pm, ARM_BOX[0] * V(0, 1, 1) + V(0.04, 0, 0), ARM_BOX[1]).astype(F)
    return (1.0 + 1.8 * head + 0.6 * foot + 0.4 * arm).astype(F)


WEIGHT_SMOOTH = (4, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['neck2'], 'neck2': P['head'], 'head': hp(HL, -0.01),
         'tail1': P['tail2'], 'tail2': P['tail3'], 'tail3': P['tail4'], 'tail4': V(0, 0.47, -1.33)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (BALL + V(0, 0.005, 0.09)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['hand' + s]; t['hand' + s] = (KNUCK + V(0, -0.02, 0.05)) * m
    return t


SPINE = ['tail4', 'tail3', 'tail2', 'tail1', 'hips', 'chest', 'neck', 'neck2', 'head']


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    P = wpos.astype(F)
    Q = _mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    side = np.where(P[:, 0] >= 0, 'L', 'R')
    own = _own(parts(P))
    legm = own['leg'] | own['foot']
    armm = own['arm']
    Wn = np.zeros_like(W)
    # body, neck, head and tail: one chain; the neck by its height (it rises steeply), the rest by z
    u = np.interp(z, [-1.33, -1.0, -0.72, -0.42, -0.14, 0.0, 0.2], [0, 1, 2, 3, 4, 5, 6]).astype(F)
    un = np.interp(y, [0.5, 0.55, 0.64, 0.7], [6.0, 6.0, 7.0, 8.0]).astype(F)
    nk = (own['neck'] | own['head']) | ((z > 0.26) & (y > 0.53) & ~armm)
    u = np.where(nk, np.maximum(u, un), u)
    u = np.where(own['head'], np.maximum(u, 8.0), u)
    for nm, w in BD.blend_chain(u, SPINE, 0.4):
        Wn[:, bi[nm]] += w * ~(legm | armm)
    for s in 'LR':
        m = legm & (side == s)
        ul = 4.0 - np.interp(y[m], [0.0, 0.03, 0.12, 0.3, 0.48], [0.0, 1.0, 2.0, 3.0, 4.0]).astype(F)
        g = sstep(0.35, -0.2, ul) * 0.85
        for nm, w in BD.blend_chain(ul, ['thigh', 'shin', 'hmeta', 'hpaw'], 0.2):
            Wn[m, bi[nm + s]] += w * (1 - g)
        Wn[m, bi['hips']] += g
        mf = own['foot'] & (side == s)
        Wn[mf] = 0; Wn[mf, bi['hpaw' + s]] = 1
        # the arm: humerus to the elbow, then the forearm to the wrist, then the hand; the root into the chest
        m = armm & (side == s)
        t1, _ = BD.seg_t(Q[m], SHOULDER, ELBOW)
        t2, _ = BD.seg_t(Q[m], ELBOW, WRIST)
        d1 = np.linalg.norm(Q[m] - (SHOULDER + np.outer(t1, ELBOW - SHOULDER)), axis=1)
        d2 = np.linalg.norm(Q[m] - (ELBOW + np.outer(t2, WRIST - ELBOW)), axis=1)
        hand = sstep(0.85, 1.0, t2) * (Q[m][:, 2] > WRIST[2] - 0.004)
        fore = (d2 < d1) * (1 - hand)
        up = (1 - fore) * (1 - hand)
        g = up * sstep(0.25, -0.1, t1)
        Wn[m, bi['arm' + s]] += up * (1 - g)
        Wn[m, bi['fore' + s]] += fore
        Wn[m, bi['hand' + s]] += hand
        Wn[m, bi['chest']] += g
    Wn[:, bi['ctag']] = 0
    return Wn / np.maximum(Wn.sum(1, keepdims=True), 1e-9)


# ---------- feathers, skin paint (sRGB 0..1), fine detail (meters) ----------
hx = U.hexc
K = {
    'sand': hx(0x9C7C54), 'back': hx(0x5E4632), 'dk': hx(0x34261A), 'belly': hx(0xDCCCAA), 'face': hx(0xB49A74), 'edge': hx(0xC2A27A),
    'stripe': hx(0x2A1E14), 'skin': hx(0x6E6456), 'skinDk': hx(0x463E34), 'claw': hx(0x1C1814), 'clawHi': hx(0x4A4038),
    'lip': hx(0x7A6656), 'tooth': hx(0xE8E0CC), 'ball': hx(0x120C08), 'lid': hx(0x5A4A3A),
    'downA': hx(0xA88E6C), 'downB': hx(0x4E3E2E), 'downBelly': hx(0xD8C8A8),
}


def _regions(P, N, c):
    r = {}
    Pm = _mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    r['Pm'] = Pm
    r['claw'] = sstep(0.0015, 0.0003, c['claw'])
    r['tooth'] = sstep(0.0012, 0.0002, c['tooth']) * sstep(0.0, 0.001, c['head'] - c['tooth'] + 0.001)
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    r['eyeD'] = de
    r['ball'] = sstep(0.0008, 0.0002, c['ball']) * sstep(EYE_R + 0.0012, EYE_R + 0.0004, de)
    r['lid'] = sstep(EYE_R + 0.004, EYE_R + 0.0014, de) * (1 - r['ball'])
    L = hframe(Pm)
    r['L'] = L
    r['head'] = sstep(-0.015, 0.0, L[:, 2]) * sstep(0.37, 0.39, z)
    r['lips'] = sstep(0.006, 0.0015, np.abs(L[:, 1] - lip_u(L[:, 2]))) * sstep(0.06, 0.08, L[:, 2]) * r['head'] * (1 - r['tooth'])
    # bare scaly skin: the feet and the metatarsus, the snout's front half, the lips
    r['scaly'] = np.maximum(sstep(0.13, 0.1, y) * sstep(0.03, 0.05, x), sstep(0.15, 0.2, L[:, 2]) * r['head'] * 0.7)
    r['belly'] = sstep(-0.2, -0.7, N[:, 1]) * sstep(0.5, 0.42, y)
    r['top'] = sstep(0.1, 0.85, N[:, 1])
    own = _own(c)
    r['arm'] = own['arm'].astype(F)
    r['leg'] = own['leg'].astype(F)
    r['tail'] = sstep(-0.25, -0.35, z) * (1 - r['leg'])
    return r


def _flow(Pm, N, R):
    """the way the feathers lie: back along the body and the tail, down the neck toward the body, back from the beak
    over the head, down the legs, back along the arms"""
    n = len(Pm)
    y, z = Pm[:, 1], Pm[:, 2]
    fl = np.zeros((n, 3), F)
    fl[:, 2] = -1.0
    fl[:, 1] = -0.25 * sat(-N[:, 1] * 0.6 + 0.3)
    nk = sstep(0.22, 0.32, z) * sstep(0.5, 0.56, y)
    fl[:, 1] = fl[:, 1] * (1 - nk) - 0.8 * nk
    fl[:, 2] = fl[:, 2] * (1 - nk) - 0.6 * nk
    lg = R['leg']
    fl[:, 1] = fl[:, 1] * (1 - lg) - lg
    fl[:, 2] = fl[:, 2] * (1 - lg) - 0.2 * lg
    ar = R['arm']
    fl[:, 1] = fl[:, 1] * (1 - ar) - 0.5 * ar
    fl[:, 2] = fl[:, 2] * (1 - ar) - ar
    return fl / np.maximum(np.linalg.norm(fl, axis=1, keepdims=True), 1e-9)


def _size(Pm, N, R):
    y = Pm[:, 1]
    s = np.full(len(Pm), 0.022, F)
    s = s + 0.01 * R['top'] * (1 - R['head'])
    s = s * (1 - R['head']) + R['head'] * 0.006
    nk = sstep(0.22, 0.32, Pm[:, 2]) * sstep(0.5, 0.56, y) * (1 - R['head'])
    s = s * (1 - nk) + nk * 0.011
    s = s * (1 - R['leg']) + R['leg'] * 0.016
    s = s * (1 - R['arm']) + R['arm'] * 0.012
    return s


_pcache = {}


def _plum(P, N, c):
    key = (len(P), float(P[:7].sum()))
    if key not in _pcache:
        R = _regions(P, N, c)
        Pm = R['Pm']
        Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
        fl = _flow(Pm, Nm, R)
        sz = _size(Pm, Nm, R)
        pl = BD.plumage(Pm, Nm, fl, sz, None, seed=23)
        _pcache.clear()
        _pcache[key] = (R, Pm, Nm, fl, pl)
    return _pcache[key]


def paint(P, N, c):
    R, Pm, Nm, fl, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    n1 = fbm(Pm * 12, 3, 11)
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    relb = np.abs(pl['b']) / np.maximum(pl['w'], 1e-6)
    mid = sstep(0.001, 0.004, np.abs(x)) * pl['cov']
    # sandy brown, darker over the back, each feather a shade of its own, the base of each visible feather darker and
    # its tip paler
    col = U.mix(np.tile(K['sand'], (n, 1)), K['back'], sstep(-0.1, 0.8, Nm[:, 1]) * 0.75 * (1 - R['leg'] * 0.4))
    col = U.mix(col, K['belly'], np.maximum(R['belly'], sstep(-0.2, -0.75, Nm[:, 1]) * sstep(0.6, 0.45, y)) * 0.85)
    col *= (0.92 + 0.16 * (fid - 0.5))[:, None]
    col = U.mix(col, K['dk'], sstep(0.45 * cfa, 1.4 * cfa, -pl['a']) * 0.3 * mid)
    col = U.mix(col, K['edge'], sstep(0.25 * cfa, 0.05 * cfa, -pl['a']) * sstep(0.2, 0.9, relb) * 0.2 * mid)
    # dark bars across the back and the tail, broken by the feathers
    bar = sstep(0.55, 0.8, np.sin(2 * np.pi * (z + 0.03 * fbm(Pm * 20, 2, 21)) / np.where(R['tail'] > 0.5, 0.11, 0.07)) * 0.5 + 0.5)
    col = U.mix(col, K['stripe'], bar * sstep(-0.2, 0.4, Nm[:, 1]) * (0.5 + 0.3 * R['tail']) * (1 - R['head']) * sstep(0.27, 0.2, z) * (1 - R['leg']))
    # the face paler, a dark stripe back from the eye along the side of the head
    col = U.mix(col, K['face'], R['head'] * 0.5)
    L = R['L']
    st = sstep(0.008, 0.003, np.abs(L[:, 1] - 0.004 + 0.12 * (L[:, 2] - 0.05))) * sstep(0.07, 0.04, L[:, 2]) * sstep(-0.03, 0.0, L[:, 2]) * sstep(0.012, 0.02, np.abs(x))
    col = U.mix(col, K['stripe'], st * 0.75)
    col *= (0.95 + 0.08 * n1)[:, None]
    # bare skin: scaly feet and snout
    sc = BD.scutes(Pm, nrm([0, -1, 0.15]), 0.003, 43)[1]
    skin = U.mix(np.tile(K['skin'], (n, 1)), K['skinDk'], sc * 0.35 + sstep(0.3, -0.5, Nm[:, 1]) * 0.2)
    col = U.mix(col, skin, R['scaly'])
    col = U.mix(col, K['lid'], R['lid'] * 0.8)
    col = U.mix(col, K['lip'], R['lips'] * 0.6)
    cc = U.mix(np.tile(K['claw'], (n, 1)), K['clawHi'], sstep(0.4, 0.8, vnoise(Pm * V(300, 40, 300), 15)) * 0.4)
    col = U.mix(col, cc, R['claw'])
    col = U.mix(col, K['tooth'], R['tooth'])
    col = U.mix(col, K['ball'], R['ball'])
    rough = 0.78 + 0.06 * (n1 - 0.5) - 0.06 * sstep(0.1, 0.8, Nm[:, 1]) - 0.3 * R['claw'] - 0.3 * R['tooth'] - 0.3 * R['lid'] * sstep(EYE_R + 0.002, EYE_R + 0.0008, R['eyeD'])
    rough = np.where(R['scaly'] > 0.5, 0.6, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def paint_baby(P, N, c):
    R, Pm, Nm, fl, pl = _plum(P, N, c)
    n = len(P)
    dn, tip = BD.down(Pm, fl, Nm, 0.004, 81)
    col = U.mix(np.tile(K['downA'], (n, 1)), K['downBelly'], np.maximum(R['belly'], sstep(-0.2, -0.75, Nm[:, 1])) * 0.85)
    # dark stripes down the back and the tail
    st = sstep(0.008, 0.003, np.abs(np.abs(Pm[:, 0]) - 0.03)) * sstep(0.2, 0.7, Nm[:, 1])
    col = U.mix(col, K['downB'], st * 0.7 + sstep(0.6, 0.85, np.sin(2 * np.pi * Pm[:, 2] / 0.12) * 0.5 + 0.5) * R['tail'] * 0.5)
    col *= (0.84 + 0.26 * dn)[:, None]
    skin = np.tile(K['skin'], (n, 1)) * 1.1
    col = U.mix(col, skin, R['scaly'])
    col = U.mix(col, K['claw'], R['claw'])
    col = U.mix(col, K['ball'], R['ball'])
    rough = np.where(R['scaly'] > 0.5, 0.6, 0.93)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    R, Pm, Nm, fl, pl = _plum(P, N, c)
    x = Pm[:, 0]
    feath = (1 - R['scaly']) * (1 - R['claw']) * (1 - R['ball']) * (1 - R['lid']) * (1 - R['tooth'])
    h = np.zeros(len(P), F)
    h += BD.feather_height(pl, 0.05) * feath * sstep(0.001, 0.004, np.abs(x))
    sh, sg = BD.scutes(Pm, nrm([0, -1, 0.15]), 0.003, 43)
    rh, rg = BD.reticulate(Pm, 0.0014, 44)
    h += R['scaly'] * (0.0002 * sh - 0.00015 * sg + 0.0001 * rh)
    h -= 0.00005 * np.abs(np.sin(Pm[:, 1] * 2000)) * R['claw']
    return h


def finish(C, ao, valid):
    return BD.finish_ao(C, ao, 0.32)


# the chick's down: fur shells on babies only (rig units: the baby maps do not scale them)
FUR = dict(len=0.018, n=4, lean=0.45, tile=0.0016, babyLen=1.0, babyLean=0.45, shade=0.85, babyOnly=True, quality=70)


def fur(P, N, c):
    R = _regions(P, N, c)
    bare = np.maximum.reduce([R['claw'], R['tooth'], R['ball'], R['lid'] * 0.8, R['scaly']])
    ring = sstep(EYE_R * 1.3, EYE_R * 2.6, R['eyeD'])
    tuft = np.clip(0.85 + 0.3 * fbm(R['Pm'] / 0.02, 2, 41), 0.6, 1.15)
    flen = FUR['len'] * (1 - bare) * ring * tuft * (1 - 0.5 * R['head'])
    fden = 0.9 * (1 - bare) * ring
    return np.clip(flen, 0, FUR['len']).astype(F), np.clip(fden, 0, 1).astype(F)


def flow(P, N):
    R = _regions(P, N, parts(P))
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
    d = _flow(R['Pm'], Nm, R)
    d[:, 0] *= np.sign(P[:, 0] + 1e-9)
    d = d - N * np.sum(d * N, 1, keepdims=True)
    return (d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-6)).astype(F)


MAP_QUALITY = (70, 56)
PAD_SMOOTH = 2
BABY_MAP = (384, 68)


# ---------- the arm and tail feathers: the feather atlas the game cuts its blades from ----------
def _cells():
    F_ = BD.FeatherCell
    br, brD, brL, edge = hx(0x6A4E34), hx(0x2E2216), hx(0x8C6E4C), hx(0xB09270)

    def arm(s, t, side):
        c = U.mix(np.tile(br, (len(s), 1)), brD, sstep(0.0, -0.8, s) * 0.4)
        bars = sstep(0.55, 0.8, np.sin(2 * np.pi * t * 5.5) * 0.5 + 0.5)
        c = U.mix(c, brD, bars * 0.55)
        return U.mix(c, edge, sstep(0.86, 1.0, t) * 0.5)

    def tail(s, t, side):
        c = U.mix(np.tile(brL, (len(s), 1)), br, sstep(0.0, 0.8, np.abs(s)) * 0.3)
        bars = sstep(0.5, 0.75, np.sin(2 * np.pi * t * 4.0) * 0.5 + 0.5)
        c = U.mix(c, brD, bars * 0.65)
        return U.mix(c, brD, sstep(0.8, 1.0, t) * 0.6)

    return [F_('round', arm, w=0.7, outer=0.6, tip=0.55, shaft=hx(0x3A2A1C)), F_('round', tail, w=0.74, outer=0.85, tip=0.7, shaft=hx(0x3A2A1C))] + [None] * 6


def _baby_cells():
    F_ = BD.FeatherCell
    g1, g2 = hx(0xA88E6C), hx(0x7A6450)

    def dn(s, t, side):
        return U.mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 2 + [None] * 6


FEATHER_ATLAS = {'size': (1024, 256), 'out': (512, 128), 'cells': _cells, 'baby': _baby_cells, 'quality': (74, 74, 70), 'alpha_quality': 50}


def extra_maps(X):
    """texture.py hook: only the feather atlas (the chick's color map is paint_baby's)"""
    BD.save_atlas(sys.modules[__name__], X['work'])


def export_extra(meta, out_dir, work):
    """export.py hook: the feather atlases as WebP, named in the json"""
    import os
    from PIL import Image
    fa = FEATHER_ATLAS
    fo = fa['out']
    fb = (fo[0] // 2, fo[1] // 2)
    for key, fn, mode, qual, size in (('feather', 'feather', 'RGBA', fa['quality'][0], fo), ('featherNormal', 'feathernrm', 'RGB', fa['quality'][1], fo),
                                      ('babyFeather', 'babyfeather', 'RGBA', fa['quality'][2], fb)):
        src = os.path.join(work, f'{ID}-{fn}.png')
        if not os.path.exists(src):
            continue
        dst = f'{ID}-{fn}.webp'
        im = Image.open(src).convert(mode)
        if im.size != tuple(size):
            im = im.resize(tuple(size), Image.LANCZOS)
        im.save(os.path.join(out_dir, dst), 'WEBP', quality=qual, method=6, alpha_quality=fa['alpha_quality'])
        meta['maps'][key] = dst
    meta['srgb'] = ['feather', 'babyFeather']
    meta['feathers'] = {'cols': BD.NCOL}


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': U.lid_color(col, R['eyeD'], EYE_R)}


def meta(st):
    r = EYE_R
    up, dn = (LID_OFF + LID_H) / r, (LID_OFF - LID_H) / r
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.3],
                'iris': 0xD8A238, 'irisR': 0.92, 'pupilR': 0.34, 'rim': 0x3A2A0A, 'lidCol': st['lidCol'], 'babyIris': 0x6A4A22},
        'collar': {'at': ['neck', 'neck2', 0.5], 'r': 1.1},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'belly': [0.0, 0.34, 0.08],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.08, 0.07, 0.06], 'flat': 0x7C6248,
    }
