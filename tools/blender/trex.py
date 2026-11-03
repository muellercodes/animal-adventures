# Tyrannosaurus rex as current science shows it, about 12 m long with the hips about 3.5 m up, sculpted as a signed
# distance field around the game's skeleton (tools/blender/work/trex-rig.json). Units are meters in game rig space
# (x left, y up, z forward, ground at y = 0).
# Shape: the body level and balanced over the hips, a deep chest, a thick tail held off the ground; a huge deep skull,
# wide at the back so the eyes look forward, heavy brow bosses over the eyes and small hornlets in front of them, a
# rugose snout, closed lips over the teeth with only the tips of the upper teeth showing, a deep lower jaw; tiny
# two-fingered arms; huge thighs, slim shins, three big forward toes with claws and a small dewclaw. Skin (height field
# per texel): pebbly scales, bigger ones down the back, rugose bumps on the head. Paint: earthy brown with an olive top,
# a paler belly, faint darker bands. The hatchling: the game's baby maps (long legs, a big head, a short snout), its
# own color map and downy fuzz (fur shells on babies only, FUR).
# Make it with: VOXEL=0.03 TRIS=4400 TEX=768 WEIGHTS=transfer BLENDER_PY=... python3 tools/blender/make.py trex
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length, axis_steps
import ungulate as U
import bird as BD
from ungulate import local as _local, local_n as _local_n, mirror as _mirror

ID = 'trex'
BOUNDS = (V(-1.15, -0.001, -7.4), V(1.15, 4.62, 4.62))
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
BAKE_DIST = (0.04, 0.12, 0.4)

# ---------- landmarks (left side, +x) ----------
HIP, KNEE, ANKLE, BALL = V(0.55, 3.35, 0.05), V(0.65, 2.05, 0.5), V(0.62, 0.85, -0.12), V(0.6, 0.06, 0.22)
SHOULDER, ELBOW, WRIST = V(0.45, 2.75, 1.75), V(0.52, 2.42, 1.88), V(0.5, 2.3, 2.12)
TOES = [dict(a=-24, len=0.5, r=0.14, r1=0.085, claw=0.2, clawR=0.065, n=3), dict(a=0, len=0.62, r=0.15, r1=0.09, claw=0.22, clawR=0.07, n=4),
        dict(a=24, len=0.52, r=0.14, r1=0.085, claw=0.2, clawR=0.065, n=3)]
# head frame: from the top of the back of the skull forward (a little down) to the tip of the snout
HO = V(0.0, 4.12, 2.95)
HA = nrm([0.0, -0.1, 0.995])
HU = nrm([0.0, 0.995, 0.1])
HL = 1.52


def hp(s, u, x=0.0):
    return HO + HA * s + HU * u + V(1, 0, 0) * x


def hframe(Q):
    D = Q - HO
    return np.stack([D[:, 0], D @ HU, D @ HA], 1)


EYE_C = hp(0.45, 0.0, 0.3)
EYE_R = 0.045
EYE_DIR = nrm([0.55, 0.15, 0.82])
LID_W, LID_H, LID_OFF = 0.044, 0.03, 0.0
MOUTH = hp(1.45, -0.4)


# the lip line (head frame u) along s: rising a little toward the front
def lip_u(s):
    return np.interp(s, [0.15, 0.4, 0.9, 1.5], [-0.44, -0.42, -0.39, -0.36]).astype(F)


BODY = [
    (-7.3, 2.45, 2.42, 2.38, 0.03, 2.0, 2.0),
    (-6.5, 2.72, 2.6, 2.5, 0.1, 2.0, 2.0),
    (-5.5, 2.98, 2.78, 2.6, 0.17, 2.0, 2.0),
    (-4.5, 3.25, 2.95, 2.62, 0.25, 2.0, 2.0),
    (-3.5, 3.55, 3.12, 2.6, 0.34, 2.1, 2.0),
    (-2.5, 3.8, 3.25, 2.5, 0.44, 2.1, 2.0),
    (-1.5, 3.98, 3.32, 2.38, 0.56, 2.2, 2.0),
    (-0.6, 4.08, 3.3, 2.25, 0.66, 2.2, 2.0),
    (0.2, 4.08, 3.2, 2.05, 0.72, 2.2, 2.0),
    (0.9, 4.0, 3.1, 1.9, 0.74, 2.2, 2.0),
    (1.5, 3.95, 3.05, 1.95, 0.68, 2.1, 2.0),
    (2.0, 3.95, 3.2, 2.35, 0.55, 2.0, 2.0),
    (2.3, 4.0, 3.45, 2.9, 0.42, 2.0, 2.0),
]
NECK = [
    (3.45, 1.9, 0.62, 0.66, 0.52, 2.0, 2.0),
    (3.7, 2.4, 0.52, 0.56, 0.44, 2.0, 2.0),
    (3.85, 2.75, 0.42, 0.5, 0.38, 2.0, 2.0),
    (3.86, 3.1, 0.3, 0.42, 0.34, 2.0, 2.0),
]
# head, in the head frame: s, top, yw, bottom (u), half width, exponents
HEAD = [
    (-0.08, 0.06, -0.3, -0.62, 0.34, 2.3, 2.0),
    (0.1, 0.14, -0.3, -0.8, 0.44, 2.5, 2.1),
    (0.3, 0.16, -0.3, -0.82, 0.44, 2.6, 2.2),
    (0.5, 0.11, -0.32, -0.76, 0.34, 2.6, 2.3),
    (0.75, 0.05, -0.33, -0.68, 0.26, 2.7, 2.3),
    (1.0, 0.0, -0.33, -0.62, 0.22, 2.7, 2.3),
    (1.25, -0.05, -0.33, -0.57, 0.2, 2.7, 2.3),
    (1.42, -0.1, -0.33, -0.52, 0.17, 2.5, 2.2),
    (1.52, -0.17, -0.34, -0.46, 0.1, 2.2, 2.0),
]


def body(P):
    Q = _mirror(P)
    d = loft(Q, BODY)
    # the pubic boot: the deep keel under the hips it rests on when lying down
    d = smin(d, ellipsoid(Q, V(0.0, 1.95, 0.45), V(0.3, 0.3, 0.55)), 0.35)
    # the chest under the shoulders, the shoulder blade
    d = smin(d, ellipsoid(Q, V(0.38, 3.05, 1.55), V(0.32, 0.55, 0.45)), 0.3)
    return d


def neck(P):
    return sweep(_mirror(P), NECK, n=32)


def head(P):
    Q = _mirror(P)
    L = hframe(Q)
    x, u, s = L[:, 0], L[:, 1], L[:, 2]
    d = loft(L, HEAD)
    # the jaw muscles bulging behind the eyes, the angle of the lower jaw
    d = smin(d, ellipsoid(L, V(0.36, -0.3, 0.15), V(0.12, 0.22, 0.2)), 0.1)
    # brow bosses over and behind the eyes, small hornlets in front of them
    d = smin(d, ellipsoid(L, V(0.28, 0.11, 0.36), V(0.08, 0.06, 0.1)), 0.05)
    d = smin(d, ellipsoid(L, V(0.2, 0.06, 0.64), V(0.05, 0.035, 0.08)), 0.06)
    # the rugose snout: low bumps along the top
    lump = (fbm(Q * 5.0, 2, 61) - 0.5) * sstep(0.5, 0.7, s) * sstep(1.52, 1.35, s) * sstep(-0.25, -0.05, u)
    d = d - 0.025 * lump
    # nostrils near the front of the snout
    d = smax(d, -ellipsoid(L, V(0.1, -0.14, 1.4), V(0.03, 0.022, 0.05)), 0.015)
    # closed lips: a groove along the lip line, the lower lip set in a little under the upper one
    lu = lip_u(s)
    lip = np.exp(-((u - lu) / 0.012) ** 2) * sstep(0.12, 0.22, s)
    low = sstep(lu + 0.004, lu - 0.03, u) * sstep(0.2, 0.3, s) * sstep(0.1, 0.16, np.abs(x))
    d = d + 0.014 * lip + 0.01 * low
    # the eye: lid mound, opening, ball
    ca, li, ba, br = eye_parts(P)
    d = smin(d, li, 0.02)
    d = smin(d, br, 0.03)
    d = smax(d, -ca, 0.008)
    d = smin(d, ba, 0.004)
    d = smin(d, teeth(P), 0.006)
    return d


# the tips of the upper teeth showing below the lip (s along the jaw, visible length)
TEETH = [(0.42, 0.028), (0.54, 0.034), (0.66, 0.04), (0.78, 0.045), (0.9, 0.048), (1.02, 0.045), (1.13, 0.04), (1.24, 0.036), (1.34, 0.03), (1.43, 0.026)]


def teeth(P):
    Q = _mirror(P)
    L = hframe(Q)
    out = np.full(len(P), 1.0, F)
    for s0, ln in TEETH:
        hw = float(np.interp(s0, [h[0] for h in HEAD], [h[4] for h in HEAD]))
        x0 = hw * 0.93
        u0 = float(lip_u(np.array([s0], F))[0])
        out = np.minimum(out, round_cone(L, V(x0 - 0.01, u0 + 0.02, s0), V(x0 - 0.004, u0 - ln, s0 + 0.004), 0.022, 0.003))
    return out


def eye_parts(P):
    Q = _mirror(P)
    return U.eye_parts(Q, EYE_C, EYE_R, EYE_DIR, LID_W, LID_H, LID_OFF, mound=(0.022, 0.02, 0.008),
                       brow=((-0.07, 0.05, -0.04), (0.03, 0.06, -0.03), 0.03, 0.022))


def leg(P):
    Q = _mirror(P)
    # the huge thigh, the calf, the slim shin, the metatarsus down to the ball of the foot
    d = ellipsoid(Q, V(0.62, 2.75, 0.2), V(0.44, 0.82, 0.66))
    d = smin(d, round_cone(Q, KNEE, ANKLE, 0.32, 0.18), 0.14)
    d = smin(d, ellipsoid(Q, V(0.67, 1.75, 0.24), V(0.29, 0.56, 0.34)), 0.16)
    d = smin(d, round_cone(Q, ANKLE, BALL + V(0, 0.08, 0), 0.18, 0.15), 0.07)
    return d


def foot(P):
    Q = _mirror(P)
    dt, dc, _ = BD.toes(Q, BALL + V(0, 0.0, 0.02), TOES)
    # the pad under the ball of the foot and the small dewclaw on the inside back of the metatarsus
    dt = smin(dt, ellipsoid(Q, BALL + V(0, 0.1, 0.0), V(0.2, 0.11, 0.22)), 0.07)
    dw = round_cone(Q, BALL + V(-0.12, 0.34, -0.08), BALL + V(-0.16, 0.24, 0.04), 0.045, 0.03)
    dwc = round_cone(Q, BALL + V(-0.16, 0.24, 0.04), BALL + V(-0.17, 0.15, 0.12), 0.028, 0.006)
    return smin(dt, dw, 0.04), np.minimum(dc, dwc)


def arm(P):
    Q = _mirror(P)
    d = round_cone(Q, SHOULDER, ELBOW, 0.11, 0.08)
    d = smin(d, round_cone(Q, ELBOW, WRIST, 0.08, 0.06), 0.03)
    claws = None
    for dx, a in ((-0.02, 8), (0.025, -8)):
        ar = np.radians(a)
        dv = nrm([np.sin(ar) * 0.3 + dx, -0.35, 1.0])
        f0 = WRIST + V(dx, -0.01, 0.03)
        f1 = f0 + dv * 0.16
        d = smin(d, round_cone(Q, f0, f1, 0.04, 0.028), 0.02)
        c = smin(round_cone(Q, f1, f1 + dv * 0.07 + V(0, -0.03, 0), 0.026, 0.012), round_cone(Q, f1 + dv * 0.07 + V(0, -0.03, 0), f1 + dv * 0.1 + V(0, -0.08, 0), 0.012, 0.003), 0.005)
        claws = c if claws is None else np.minimum(claws, c)
    return d, claws


HEAD_BOX = (V(-0.55, 3.2, 2.75), V(0.55, 4.6, 4.62))
EYE_BOX = (EYE_C * V(-1, 1, 1) - V(0.12, 0.12, 0.12), EYE_C + V(0.12, 0.12, 0.12))
NECK_BOX = (V(-0.8, 2.7, 1.4), V(0.8, 4.6, 3.6))
LEG_BOX = (V(-1.15, -0.1, -0.75), V(1.15, 3.75, 1.0))
FOOT_BOX = (V(-1.15, -0.1, -0.5), V(1.15, 0.7, 1.15))
ARM_BOX = (V(-0.75, 2.0, 1.45), V(0.75, 3.05, 2.4))


def parts(P):
    so, li, ba, br = eye_parts(P)
    ft, cl = _local_n(P, *FOOT_BOX, foot, 2)
    ar, ac = _local_n(P, *ARM_BOX, arm, 2)
    return {'body': body(P), 'neck': _local(P, *NECK_BOX, neck), 'head': _local(P, *HEAD_BOX, head), 'lids': li, 'ball': ba, 'brow': br,
            'leg': _local(P, *LEG_BOX, leg), 'foot': ft, 'claw': np.minimum(cl, ac), 'arm': ar, 'tooth': _local(P, *HEAD_BOX, teeth)}


def shape(P):
    d = body(P)
    d = smin(d, _local(P, *NECK_BOX, neck), 0.3)
    d = smin(d, _local(P, *HEAD_BOX, head), 0.12)
    d = smin(d, _local(P, *LEG_BOX, leg), 0.25)
    ft, cl = _local_n(P, *FOOT_BOX, foot, 2)
    d = smin(d, ft, 0.08)
    d = smin(d, cl, 0.01)
    ar, ac = _local_n(P, *ARM_BOX, arm, 2)
    d = smin(d, ar, 0.06)
    d = smin(d, ac, 0.006)
    return d


def grid(h):
    """finer around the head (the eyes, the lips, the teeth), the arms and the feet"""
    lo, hi = BOUNDS
    xs = axis_steps(0.0, hi[0], [(0.0, 0.45, h * 0.6), (0.4, 0.95, h * 0.6)], h)
    ys = axis_steps(lo[1], hi[1], [(lo[1], 0.6, h * 0.5), (2.1, 3.0, h * 0.6), (3.3, hi[1], h * 0.5)], h)
    zs = axis_steps(lo[2], hi[2], [(-0.6, 1.2, h * 0.6), (1.5, 2.4, h * 0.6), (2.8, hi[2], h * 0.45)], h)
    return xs, ys, zs


PATCHES = [
    (EYE_C * V(0, 1, 1) + V(0.1, -0.14, -0.14), EYE_C * V(0, 1, 1) + V(0.4, 0.14, 0.14), 0.005),   # eye, lids, brow boss
    (V(0.0, 3.4, 3.2), V(0.42, 3.9, 4.62), 0.008),                                                # lips and teeth
    (V(0.3, -0.001, -0.4), V(1.1, 0.5, 1.15), 0.01),                                              # foot and claws
    (V(0.3, 2.05, 1.6), V(0.7, 2.95, 2.4), 0.006),                                                # arm and fingers
]

PREVIEW = {
    'side': ((22.0, 3.0, -1.4), (0, 2.4, -1.4), 34),
    'front3q': ((11.0, 5.5, 12.0), (0, 2.6, 0.0), 34),
    'rear3q': ((-11.0, 6.0, -12.0), (0, 2.4, -1.0), 34),
    'head': ((2.6, 4.6, 6.6), (0, 3.85, 3.7), 26),
    'headside': ((4.2, 4.0, 3.75), (0, 3.85, 3.75), 24),
    'front': ((0.0, 4.3, 9.0), (0, 3.6, 2.0), 26),
    'feet': ((3.2, 1.0, 3.2), (0.6, 0.3, 0.4), 30),
    'arm': ((2.2, 2.7, 3.5), (0.5, 2.5, 1.9), 22),
}


# ---------- the game mesh ----------
def keep(P):
    Pm = _mirror(P)
    e = sstep(0.16, 0.08, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.85
    hd = sstep(-0.05, 0.05, hframe(Pm)[:, 2]) * sstep(2.85, 2.95, Pm[:, 2]) * 0.62
    L = hframe(Pm)
    lp = sstep(0.06, 0.015, np.abs(L[:, 1] - lip_u(L[:, 2]))) * sstep(0.15, 0.3, L[:, 2]) * sstep(3.0, 3.1, Pm[:, 2]) * 0.8
    th = sstep(0.01, 0.0, _local(P, *HEAD_BOX, teeth)) * 0.8
    ft = sstep(0.35, 0.18, Pm[:, 1]) * 0.55
    ar = U.box(Pm, ARM_BOX[0] * V(0, 1, 1), ARM_BOX[1]).astype(F) * 0.6
    base = np.full(len(P), 0.34, F)
    return np.maximum.reduce([base, e, hd, lp, th, ft, ar]).astype(F)


BEND = [
    (V(0.0, 2.45, -7.2), V(0.0, 3.5, -0.8), 0.45, 0.6),       # tail
    (V(0.0, 3.4, 1.8), V(0.0, 4.0, 3.05), 0.32, 0.75),        # neck
    (V(0.6, 3.3, 0.1), V(0.65, 2.05, 0.5), 0.3, 0.75),        # thigh
    (KNEE, ANKLE, 0.3, 0.35),                                  # shin
    (ANKLE, BALL, 0.22, 0.25),                                 # metatarsus
]


def lowpoly_fix(bm, hi):
    import meshfix as MF
    tr = MF.tree(hi)
    for a, b, pitch, reach in BEND:
        if a[0] == 0 and b[0] == 0:
            ok = lambda c, p0, r, reach=reach: r < reach and abs(c.x) < 0.9 and c.y > 2.0
        else:
            ok = lambda c, p0, r, reach=reach: r < reach and abs(c.x) > 0.25
        MF.rings(bm, tr, a, b, pitch, ok)
    MF.finish(bm, 1e-5)


UV_AVERAGE = True
UV_PACK = dict(margin_method='FRACTION', margin=0.005)


def _own(c):
    keys = ['body', 'neck', 'head', 'leg', 'foot', 'arm']
    D = np.stack([c[k] for k in keys], 1)
    o = np.argmin(D, 1)
    return {k: o == i for i, k in enumerate(keys)}


def uv_regions(P):
    """head, neck, trunk, tail (two), thighs, shins and feet, arms"""
    Pm = _mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 2)
    L = hframe(Pm)
    lab[(z > 1.9) & (y > 2.9)] = 1
    lab[(L[:, 2] > -0.05) & (z > 2.85)] = 0
    lab[z < -1.4] = 3
    lab[z < -4.3] = 4
    lab[(x > 0.35) & (y < 3.2) & (y > 1.9) & (z > -0.75) & (z < 1.0)] = 5
    lab[(x > 0.35) & (y <= 1.9) & (z > -0.6) & (z < 1.3)] = 6
    lab[(x > 0.3) & (y > 2.05) & (y < 2.95) & (z > 1.6) & (z < 2.4)] = 7
    return lab


def uv_weight(P):
    Pm = _mirror(P)
    L = hframe(Pm)
    head = sstep(-0.1, 0.0, L[:, 2]) * sstep(2.8, 2.95, Pm[:, 2])
    foot = sstep(0.5, 0.3, Pm[:, 1])
    arm = U.box(Pm, ARM_BOX[0] * V(0, 1, 1), ARM_BOX[1]).astype(F)
    return (1.0 + 1.8 * head + 0.3 * foot + 0.5 * arm).astype(F)


WEIGHT_SMOOTH = (4, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['neck2'], 'neck2': P['head'], 'head': hp(HL, -0.25),
         'tail1': P['tail2'], 'tail2': P['tail3'], 'tail3': P['tail4'], 'tail4': V(0, 2.42, -7.3)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (BALL + V(0, 0.02, 0.6)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = (WRIST + V(0, -0.05, 0.15)) * m
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
    # body, neck, head and tail: one smooth chain along z
    u = np.interp(z, [-7.3, -5.7, -4.2, -2.6, -1.0, 0.75, 2.05, 2.55, 3.0, 4.6], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).astype(F)
    u = np.where(own['head'], np.maximum(u, 8.0), u)
    for nm, w in BD.blend_chain(u, SPINE, 0.4):
        Wn[:, bi[nm]] += w * ~(legm | armm)
    for s in 'LR':
        # the leg: by height down the leg, into the hips at the top; the toes all on the paw bone
        m = legm & (side == s)
        ul = 4.0 - np.interp(y[m], [0.0, 0.15, 0.85, 2.05, 3.35], [0.0, 1.0, 2.0, 3.0, 4.0]).astype(F)
        g = sstep(0.35, -0.2, ul) * 0.85
        for nm, w in BD.blend_chain(ul, ['thigh', 'shin', 'hmeta', 'hpaw'], 0.2):
            Wn[m, bi[nm + s]] += w * (1 - g)
        Wn[m, bi['hips']] += g
        mf = own['foot'] & (side == s)
        Wn[mf] = 0; Wn[mf, bi['hpaw' + s]] = 1
        # the arm: upper arm to the elbow, then the forearm and hand; the root into the chest
        m = armm & (side == s)
        ab = ELBOW - SHOULDER
        t = ((Q[m] - SHOULDER) @ ab) / float(ab @ ab)
        ua = np.clip(t, -1, 3).astype(F)
        g = sstep(0.25, -0.1, ua)
        k = sstep(0.8, 1.15, ua)
        Wn[m, bi['arm' + s]] += (1 - k) * (1 - g)
        Wn[m, bi['fore' + s]] += k * (1 - g)
        Wn[m, bi['chest']] += g
    Wn[:, bi['ctag']] = 0
    return Wn / np.maximum(Wn.sum(1, keepdims=True), 1e-9)


# ---------- skin paint (sRGB 0..1), fine detail (meters), the hatchling's down ----------
hx = U.hexc
K = {
    'skin': hx(0x786950), 'top': hx(0x5A5340), 'dk': hx(0x463E30), 'belly': hx(0xB6A788), 'lt': hx(0x968569), 'claw': hx(0x2E2A24),
    'clawHi': hx(0x5E554A), 'lip': hx(0x6A5C48), 'tooth': hx(0xE4DCC6), 'ball': hx(0x120C08), 'lid': hx(0x4E4436), 'mask': hx(0x4C4232),
    'babyA': hx(0x8C7E68), 'babyB': hx(0x584D3E), 'babyBelly': hx(0xC6B89E), 'babyLeg': hx(0x76685A),
}


def _regions(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    r = {}
    Pm = _mirror(P)
    r['Pm'] = Pm
    r['claw'] = sstep(0.01, 0.002, c['claw'])
    r['tooth'] = sstep(0.006, 0.001, c['tooth']) * sstep(0.0, 0.004, c['head'] - c['tooth'] + 0.004)
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    r['eyeD'] = de
    r['ball'] = sstep(0.003, 0.001, c['ball']) * sstep(EYE_R + 0.006, EYE_R + 0.002, de)
    r['lid'] = sstep(EYE_R + 0.02, EYE_R + 0.007, de) * (1 - r['ball'])
    L = hframe(Pm)
    r['L'] = L
    r['head'] = sstep(-0.12, 0.0, L[:, 2]) * sstep(2.8, 2.95, z)
    r['lips'] = sstep(0.04, 0.012, np.abs(L[:, 1] - lip_u(L[:, 2]))) * sstep(0.15, 0.25, L[:, 2]) * r['head'] * (1 - r['tooth'])
    r['leg'] = sstep(2.2, 1.6, y) * sstep(0.25, 0.4, x) * (1 - sstep(0.5, 0.9, -N[:, 1]))
    r['foot'] = sstep(0.45, 0.2, y)
    r['belly'] = sstep(-0.2, -0.75, N[:, 1]) * sstep(3.0, 2.5, y)
    r['top'] = sstep(0.15, 0.85, N[:, 1])
    return r


def _hide(Pm):
    """pebbly scales: small round ones, bigger ones down the back, the grooves between them"""
    f1, f2 = worley(Pm / 0.03, 51)
    peb = sstep(0.0, 0.18, f2 - f1)
    g1, g2 = worley(Pm / 0.08, 52)
    plate = sstep(0.0, 0.12, g2 - g1)
    wr = 1 - np.abs(2 * vnoise(Pm * V(3, 12, 3), 53) - 1)
    return peb, plate, sstep(0.8, 0.98, wr)


def paint(P, N, c, baby=False):
    R = _regions(P, N, c)
    Pm = R['Pm']
    y, z = Pm[:, 1], Pm[:, 2]
    n1 = fbm(Pm * 0.8, 3, 11)
    n3 = fbm(Pm * 9.0, 2, 13)
    peb, plate, wr = _hide(Pm)
    if baby:
        # the hatchling's down: gray-brown, darker bands over the back and the tail, a pale belly and throat
        col = np.tile(K['babyA'], (len(P), 1))
        band = sstep(0.55, 0.8, np.sin(2 * np.pi * (z + 0.15 * fbm(Pm * 2, 2, 22)) / 0.75) * 0.5 + 0.5) * sstep(-0.1, 0.5, N[:, 1]) * sstep(2.6, 1.5, z)
        col = U.mix(col, K['babyB'], band * 0.7)
        col = U.mix(col, K['babyBelly'], R['belly'] * 0.85)
        col = U.mix(col, K['babyLeg'], R['foot'] * 0.6)
        col *= (0.94 + 0.1 * n3)[:, None]
    else:
        col = np.tile(K['skin'], (len(P), 1))
        col = U.mix(col, K['top'], R['top'] * 0.6)
        col = U.mix(col, K['belly'], R['belly'] * 0.75)
        # faint darker bands across the back and the tail, soft mottling, a darker mask round the eye
        band = sstep(0.6, 0.85, np.sin(2 * np.pi * (z + 0.3 * fbm(Pm * 0.7, 2, 21)) / 1.3) * 0.5 + 0.5) * sstep(0.0, 0.6, N[:, 1]) * sstep(2.6, 1.8, z)
        col = U.mix(col, K['dk'], band * 0.35)
        col = U.mix(col, K['dk'], sstep(0.55, 0.75, n1) * sstep(-0.3, 0.4, N[:, 1]) * 0.3)
        col = U.mix(col, K['mask'], sstep(0.28, 0.12, R['eyeD']) * 0.45)
        col = U.mix(col, K['lt'], R['leg'] * 0.2)
        col = U.mix(col, K['dk'], R['foot'] * 0.3)
        col *= (0.92 + 0.1 * n3 - 0.1 * (1 - peb) - 0.06 * (1 - plate) * R['top'] - 0.05 * wr)[:, None]
    col = U.mix(col, K['lid'], R['lid'] * 0.7)
    col = U.mix(col, K['lip'], R['lips'] * 0.5)
    cc = U.mix(np.tile(K['claw'], (len(P), 1)), K['clawHi'], sstep(0.4, 0.8, vnoise(Pm * V(60, 8, 60), 15)) * 0.4)
    col = U.mix(col, cc, R['claw'])
    col = U.mix(col, K['tooth'], R['tooth'])
    col = U.mix(col, K['ball'], R['ball'])
    rough = 0.84 + 0.06 * (n3 - 0.5) - 0.25 * R['claw'] - 0.3 * R['tooth'] - 0.3 * R['lid'] * sstep(EYE_R + 0.012, EYE_R + 0.005, R['eyeD']) - 0.12 * R['lips']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.96).astype(F)


def paint_baby(P, N, c):
    return paint(P, N, c, baby=True)


def detail(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y = Pm[:, 1]
    skin = (1 - R['claw']) * (1 - R['ball']) * (1 - R['tooth'])
    peb, plate, wr = _hide(Pm)
    h = np.zeros(len(P), F)
    h += 0.003 * peb * skin * (1 - 0.5 * R['head'])
    h += 0.004 * plate * R['top'] * (1 - R['head']) * skin
    h -= 0.003 * wr * skin
    # rugose head: small knobs over the snout, the brows and the cheeks
    g1, g2 = worley(Pm / 0.018, 57)
    h += 0.0025 * sstep(0.0, 0.2, g2 - g1) * R['head'] * (1 - R['lips']) * skin
    # rings round the shins and the toes, crowded over the ankle
    yr = np.abs(np.sin(np.pi * (y / 0.05 + 0.6 * fbm(Pm * 4, 2, 55))))
    h -= 0.004 * np.exp(-(yr / 0.25) ** 2) * R['leg'] * skin
    # wrinkles round the eye, claw growth lines
    er = np.abs(np.sin(np.pi * (R['eyeD'] / 0.016 + 0.8 * fbm(Pm * 20, 2, 56))))
    h -= 0.0015 * np.exp(-(er / 0.3) ** 2) * sstep(EYE_R + 0.012, EYE_R + 0.03, R['eyeD']) * sstep(0.2, 0.12, R['eyeD'])
    h -= 0.0006 * np.abs(np.sin(y * 120)) * R['claw']
    return h


def finish(C, ao, valid):
    return U.finish(C, ao, valid, floor=0.42)


# the hatchling's down: fur shells on babies only (rig units: the baby maps do not scale them)
FUR = dict(len=0.045, n=4, lean=0.5, tile=0.004, babyLen=1.0, babyLean=0.5, shade=0.85, babyOnly=True, quality=70)


def fur(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    bare = np.maximum.reduce([R['claw'], R['tooth'], R['ball'], R['lid'] * 0.8])
    short = 1 - 0.7 * R['foot'] - 0.5 * R['head'] * sstep(0.6, 1.0, R['L'][:, 2])
    ring = sstep(EYE_R * 1.4, EYE_R * 3.0, R['eyeD'])
    tuft = np.clip(0.85 + 0.3 * fbm(Pm / 0.05, 2, 41), 0.6, 1.15)
    flen = FUR['len'] * short * (1 - bare) * ring * tuft
    fden = 0.85 * (1 - bare) * ring
    return np.clip(flen, 0, FUR['len']).astype(F), np.clip(fden, 0, 1).astype(F)


def flow(P, N):
    """the down lies back along the body and the tail, down the legs and the arms"""
    Pm = _mirror(P)
    y = Pm[:, 1]
    d = np.tile(V(0, -0.15, -1.0), (len(P), 1))
    legk = (sstep(2.5, 2.0, y) * sstep(0.3, 0.45, Pm[:, 0]))[:, None]
    d = d * (1 - legk) + V(0, -1, -0.1) * legk
    d = d - N * np.sum(d * N, 1, keepdims=True)
    d = d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-6)
    return d.astype(F)


MAP_QUALITY = (64, 34)
PAD_SMOOTH = 3
BABY_MAP = (256, 62)


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': U.lid_color(col, R['eyeD'], EYE_R)}


def meta(st):
    r = EYE_R
    up, dn = (LID_OFF + LID_H) / r, (LID_OFF - LID_H) / r
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.3],
                'iris': 0xB8862A, 'irisR': 0.92, 'pupilR': 0.42, 'rim': 0x2A1A0A, 'lidCol': st['lidCol'], 'babyIris': 0x7A5A2A},
        'collar': {'at': ['neck', 'neck2', 0.5], 'r': 1.2},
        'mouth': [round(float(v), 4) for v in MOUTH],
        # lying down: it rests on the keel under its hips
        'belly': [0.0, 1.66, 0.45],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.07, 0.07, 0.06], 'flat': 0x786950,
    }
