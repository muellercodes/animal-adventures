# Mallard drake, sculpted as a signed distance field around the game's duck skeleton (bird.py has the shared bird
# parts). Units are meters in game rig space (x left, y up, z forward, ground at y = 0). The model is made in the
# rig's bind pose, so the wing arm (leading edge) sticks out flat to the side; the feather blades of the game cover
# it and fold with it. Shape here, skin weights, paint and fine detail further down.
# Make it with: TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py duck
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, chain, loft, frame, fbm, vnoise, worley, length
import bird as B
from bird import local, local_n, mirror, groove, hexc, mix

ID = 'duck'
BOUNDS = (V(-0.32, -0.001, -0.28), V(0.32, 0.425, 0.275))
PATCHES = [
    (V(0.0, 0.352, 0.168), V(0.026, 0.41, 0.272), 0.0006),     # bill, eye
    (V(0.0, -0.001, -0.06), V(0.1, 0.016, 0.06), 0.0006),      # foot
]
BAKE_DIST = (0.005, 0.014, 0.05)
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
UV_PACK = dict(shape_method='CONCAVE', rotate_method='ANY')

# ---------- landmarks (left side; bone pivots from the rig) ----------
HIPS, TAILB, NECK, NECK2, HEAD = V(0, 0.2, 0), V(0, 0.225, -0.19), V(0, 0.24, 0.135), V(0, 0.29, 0.162), V(0, 0.365, 0.165)
THIGH, SHIN, HMETA, HPAW = V(0.032, 0.17, -0.03), V(0.042, 0.115, 0.0), V(0.042, 0.06, -0.03), V(0.042, 0.006, -0.008)
SH, EL, WR, WT = V(0.05, 0.262, 0.06), V(0.13, 0.262, 0.06), V(0.23, 0.262, 0.06), V(0.305, 0.262, 0.06)
EYE_C = V(0.0172, 0.3935, 0.1795)
EYE_R = 0.0045
EYE_DIR = nrm([0.93, 0.2, 0.3])
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_R = 0.0036          # round lid opening (m)
MOUTH = V(0.0, 0.3585, 0.258)
NOSTRIL = V(0.0056, 0.3792, 0.2172)
FOOT = HPAW + V(0, 0.0, 0.002)
TOES = [dict(a=-24, len=0.044, r=0.0026, r1=0.0015, claw=0.0055, n=3), dict(a=0, len=0.054, r=0.0028, r1=0.0016, claw=0.006, n=4),
        dict(a=25, len=0.05, r=0.0026, r1=0.0015, claw=0.0055, n=4), dict(a=180, len=0.011, r=0.0018, r1=0.0012, claw=0.003, lift=0.004, n=2, hind=True)]

# trunk: z, top, yw (height of widest), bottom, half width, exponent above, below
TRUNK = [
    (-0.262, 0.247, 0.241, 0.236, 0.007, 2.0, 2.0),
    (-0.245, 0.252, 0.238, 0.222, 0.022, 2.1, 2.0),
    (-0.215, 0.259, 0.230, 0.196, 0.040, 2.2, 2.1),
    (-0.170, 0.267, 0.220, 0.158, 0.059, 2.3, 2.3),
    (-0.110, 0.270, 0.208, 0.136, 0.072, 2.3, 2.6),
    (-0.040, 0.274, 0.206, 0.127, 0.077, 2.3, 2.8),
    (0.030, 0.277, 0.208, 0.127, 0.077, 2.3, 2.8),
    (0.080, 0.279, 0.214, 0.132, 0.072, 2.3, 2.5),
    (0.115, 0.279, 0.221, 0.140, 0.062, 2.3, 2.2),
    (0.140, 0.272, 0.229, 0.160, 0.048, 2.2, 2.1),
    (0.158, 0.264, 0.236, 0.190, 0.028, 2.1, 2.0),
    (0.166, 0.256, 0.240, 0.218, 0.011, 2.0, 2.0),
]
# bill (upper and lower mandible together): z, top, yw, bottom, half width, exponents
BILL = [
    (0.190, 0.3955, 0.3725, 0.3650, 0.0124, 3.0, 2.3),
    (0.200, 0.3885, 0.3712, 0.3640, 0.0120, 3.4, 2.3),
    (0.212, 0.3815, 0.3696, 0.3628, 0.0114, 3.8, 2.3),
    (0.225, 0.3762, 0.3680, 0.3618, 0.0112, 4.2, 2.3),
    (0.238, 0.3725, 0.3664, 0.3608, 0.0116, 4.4, 2.3),
    (0.250, 0.3700, 0.3648, 0.3598, 0.0123, 4.2, 2.3),
    (0.258, 0.3685, 0.3638, 0.3592, 0.0124, 3.6, 2.2),
    (0.263, 0.3668, 0.3628, 0.3595, 0.0104, 3.0, 2.1),
    (0.2665, 0.3650, 0.3622, 0.3605, 0.0050, 2.2, 2.0),
]
# mouth line (tomium) along the side of the bill: (z, y)
TOMIUM = [(0.196, 0.3708), (0.212, 0.3690), (0.225, 0.3674), (0.238, 0.3657), (0.25, 0.3641), (0.258, 0.3631), (0.2635, 0.3624), (0.267, 0.3620)]


def _tom_y(z):
    zz = np.array([k[0] for k in TOMIUM], F); yy = np.array([k[1] for k in TOMIUM], F)
    return np.interp(z, zz, yy).astype(F)


# ---------- body ----------
def trunk(P):
    Q = mirror(P)
    d = loft(Q, TRUNK)
    # rounded breast prow
    d = smin(d, ellipsoid(Q, V(0, 0.212, 0.088), V(0.066, 0.078, 0.07)), 0.03)
    # undertail coverts: a full rounded bulge under the tail base
    d = smin(d, ellipsoid(Q, V(0, 0.22, -0.208), V(0.028, 0.026, 0.042)), 0.02)
    # side pockets: the upper flank feathers stand out a little and take in the lower edge of the folded wing
    d = smin(d, ellipsoid(Q, V(0.052, 0.236, -0.035), V(0.03, 0.034, 0.13)), 0.03)
    # flat keel of the belly, a little fuller between the legs
    d = smin(d, ellipsoid(Q, V(0, 0.14, -0.02), V(0.058, 0.02, 0.1)), 0.03)
    return d


def neck(P):
    Q = mirror(P)
    d = chain(Q, [V(0, 0.246, 0.116), V(0, 0.28, 0.146), V(0, 0.324, 0.16), V(0, 0.362, 0.161)], [0.047, 0.035, 0.0285, 0.0262], 0.014)
    # the throat runs straight up into the chin; the back of the neck curves to the nape
    d = smin(d, round_cone(Q, V(0, 0.29, 0.166), V(0, 0.36, 0.176), 0.021, 0.019), 0.012)
    return d


def head(P):
    Q = mirror(P)
    d = ellipsoid(Q, V(0, 0.391, 0.1625), V(0.0232, 0.0252, 0.0298))
    d = smin(d, ellipsoid(Q, V(0, 0.3842, 0.1868), V(0.0168, 0.0185, 0.0205)), 0.008)      # forehead into the bill
    d = smin(d, ellipsoid(Q, V(0.0066, 0.3762, 0.1712), V(0.0172, 0.0172, 0.022)), 0.008)  # cheeks
    d = smin(d, ellipsoid(Q, V(0, 0.387, 0.1445), V(0.0185, 0.021, 0.018)), 0.01)        # nape
    d = smin(d, ellipsoid(Q, V(0, 0.3655, 0.183), V(0.0108, 0.0088, 0.017)), 0.008)        # chin under the bill base
    return d


def bill(P):
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    d = loft(Q, BILL)
    # mouth line: a fine groove along the tomium on the side and front, the lower mandible set in under it
    yt = _tom_y(z)
    edge = sstep(0.004, 0.009, x + 0.5 * sstep(0.262, 0.266, z) * 0.01)
    d = d + groove(y - yt, 0.00045, 0.0007) * sstep(0.198, 0.206, z) * (0.3 + 0.7 * edge)
    d = d + 0.00035 * sstep(yt - 0.0003, yt - 0.002, y) * sstep(yt - 0.008, yt - 0.004, y) * sstep(0.2, 0.21, z)
    # nostrils: oval pits on a low swelling near the base
    nl = frame(Q, NOSTRIL, nrm([0.0, -0.25, 1]), (0.3, 1, 0))
    nq = np.sqrt((nl[:, 0] / 0.00125) ** 2 + (nl[:, 2] / 0.0029) ** 2)
    d = d + 0.0009 * sstep(1.0, 0.55, nq) * sstep(0.004, 0.0, np.abs(nl[:, 1])) - 0.00025 * np.exp(-((nq - 1.25) / 0.35) ** 2) * sstep(0.004, 0.0, np.abs(nl[:, 1]))
    # culmen: a soft ridge down the middle of the upper mandible near the base
    d = d - 0.0005 * sstep(0.004, 0.0, x) * sstep(0.235, 0.205, z) * sstep(yt + 0.004, yt + 0.008, y)
    return d


def nail(P):
    Q = mirror(P)
    return ellipsoid(Q, V(0, 0.3655, 0.2595), V(0.0056, 0.0021, 0.0058))


def eye_parts(P):
    """lid mound around the eye (add), the round opening in front of the ball (carve), the ball (add)"""
    Q = mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0, -0.0006), V(EYE_R + 0.0024, EYE_R + 0.0022, EYE_R + 0.0012))
    ap = np.sqrt(s * s + u * u) - LID_R
    carve = smax(ap, -(g + 0.001), 0.0006)
    ball = length(D) - EYE_R * 0.92
    return carve, lids, ball


# ---------- legs ----------
def drum(P):
    """feathered lower thigh coming out of the belly feathers"""
    Q = mirror(P)
    return round_cone(Q, V(0.038, 0.145, -0.018), V(0.042, 0.074, -0.026), 0.017, 0.0068)


def tarsus(P):
    Q = mirror(P)
    j = round_cone(Q, V(0.042, 0.078, -0.026), HMETA + V(0, -0.002, 0.0), 0.0052, 0.0058)            # bare joint
    t = B.flat_cone(Q, HMETA + V(0, -0.002, 0.0), HPAW + V(0, 0.003, -0.001), 0.0047, 0.0041, 0.78, up=(1, 0, 0))
    pad = ellipsoid(Q, HPAW + V(0, -0.0002, 0.0005), V(0.0058, 0.0042, 0.0066))
    return smin(smin(j, t, 0.004), pad, 0.004)


def feet(P):
    Q = mirror(P)
    tt, cl, _ = B.toes(Q, FOOT, [t for t in TOES if not t.get('hind')])
    ht, hc, _ = B.toes(Q, HPAW + V(0, 0.006, -0.003), [t for t in TOES if t.get('hind')], ground=0.0035)
    wb = B.web(Q, FOOT, TOES, 0.0011, reach=0.93, sag=0.16)
    return np.minimum(tt, ht), np.minimum(cl, hc), wb


def arm(P):
    Q = mirror(P)
    return B.wing_arm(Q, [SH + V(-0.012, -0.004, -0.004), EL, WR, WT], [0.03, 0.028, 0.022, 0.008], [0.0085, 0.0072, 0.0058, 0.0026], lead=0.62)


# ---------- assembly ----------
def grid(h):
    """rectilinear sculpt grid: h over the body, finer near the ground (webs, toes, claws) and through the wing arm"""
    lo, hi = BOUNDS
    xs = B.axis_steps(0.0, hi[0], [(0.0, 0.1, h * 0.75), (0.11, 0.33, h * 1.25)], h)
    ys = B.axis_steps(lo[1], hi[1], [(lo[1], 0.017, h * 0.25), (0.017, 0.08, h * 0.6), (0.248, 0.278, h * 0.4), (0.35, 0.405, h * 0.6)], h)
    zs = B.axis_steps(lo[2], hi[2], [(-0.06, 0.06, h * 0.6), (0.17, 0.275, h * 0.6)], h)
    return xs, ys, zs



HEAD_BOX = (V(-0.04, 0.33, 0.115), V(0.04, 0.42, 0.275))
LEG_BOX = (V(-0.075, -0.002, -0.06), V(0.075, 0.16, 0.06))
ARM_BOX = (V(0.02, 0.24, 0.03), V(0.335, 0.285, 0.09))
EYE_BOX = (V(-0.03, 0.38, 0.165), V(0.03, 0.404, 0.195))


def parts(P):
    """named component distances (for paint masks and weights)"""
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    ft, cl, wb = local_n(P, *LEG_BOX, feet, 3)
    return {'trunk': trunk(P), 'neck': local(P, (-0.06, 0.22, 0.08), (0.06, 0.38, 0.2), neck), 'head': local(P, *HEAD_BOX, head),
            'bill': local(P, *HEAD_BOX, bill), 'nail': local(P, *HEAD_BOX, nail), 'lids': li, 'ball': ba, 'carve': ca,
            'drum': local(P, *LEG_BOX, drum), 'tarsus': local(P, *LEG_BOX, tarsus), 'toes': ft, 'claws': cl, 'web': wb,
            'arm': local(mirror(P), *ARM_BOX, arm)}


def shape(P):
    d = local(P, (-0.11, 0.1, -0.275), (0.11, 0.3, 0.175), trunk)
    d = smin(d, local(P, (-0.06, 0.22, 0.08), (0.06, 0.38, 0.2), neck), 0.02)
    h = local(P, *HEAD_BOX, head)
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    h = smin(h, li, 0.003)
    h = smax(h, -ca, 0.0008)
    h = smin(h, ba, 0.0004)
    bl = local(P, *HEAD_BOX, bill)
    bl = smin(bl, local(P, *HEAD_BOX, nail), 0.0012)
    h = smin(h, bl, 0.0035)
    d = smin(d, h, 0.012)
    lg = smin(local(P, *LEG_BOX, drum), local(P, *LEG_BOX, tarsus), 0.006)
    ft, cl, wb = local_n(P, *LEG_BOX, feet, 3)
    f = smin(ft, wb, 0.0012)
    f = smin(f, cl, 0.0008)
    lg = smin(lg, f, 0.003)
    d = smin(d, lg, 0.012)
    d = smin(d, local(mirror(P), *ARM_BOX, arm), 0.01)
    return d


# ---------- skinning ----------
WEIGHT_SMOOTH = (0, 0)   # fix_weights builds every weight itself, blends included
SPINE = ['tail', 'hips', 'neck', 'neck2', 'head']


def keep(P):
    """decimation priority 0..0.85 (1 would lock a vertex), by part: the head, bill, eyes and feet keep their shape,
    the smooth body and neck enough triangles to bend, the wing arm (under the feathers) few; the hidden eyeball none"""
    Pm = mirror(P)
    c = parts(P)
    R = _own(c)
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    ball = sstep(EYE_R * 0.97, EYE_R * 0.8, de)
    k = 0.45 * R['trunk'] + 0.55 * R['neck'] + 0.78 * R['head'] + 0.82 * (R['bill'] + R['nail']) + 0.85 * R['lids']
    k += 0.62 * R['drum'] + 0.72 * R['tarsus'] + 0.8 * (R['toes'] + R['web'] + R['claws']) + 0.2 * R['arm']
    rim = sstep(EYE_R + 0.004, EYE_R + 0.0012, de) * sstep(EYE_R * 0.9, EYE_R * 1.0, de) * 0.85
    yt = _tom_y(Pm[:, 2])
    lip = sstep(0.0025, 0.0006, np.abs(Pm[:, 1] - yt)) * sstep(0.195, 0.2, Pm[:, 2]) * 0.85
    nos = sstep(0.005, 0.002, np.linalg.norm(Pm - NOSTRIL, axis=1)) * 0.82
    return np.maximum.reduce([k, rim, lip, nos]) * (1 - ball)


def bone_tips(P):
    t = {'hips': P['neck'], 'tail': TAILB + V(0, 0.02, -0.07), 'neck': P['neck2'], 'neck2': P['head'], 'head': MOUTH}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0, -0.004, 0.05)) * m
        t['wing' + s] = P['wfore' + s]; t['wfore' + s] = P['whand' + s]; t['whand' + s] = WT * m
    return t


def _spine_u(P):
    """continuous coordinate along tail (0..1), hips (1..2), neck (2..3), neck2 (3..4), head (4..5) for body points"""
    y, z = P[:, 1], P[:, 2]
    ut = 1.5 + np.clip((z + 0.19) / 0.05, -1, 0)
    un = np.interp(y, [0.2, 0.248, 0.29, 0.358, 0.42], [1.5, 2.0, 3.0, 4.0, 5.0]).astype(F)
    yn = y - 0.238 - 0.8 * np.maximum(0, 0.125 - z)
    k = sstep(0.0, 0.022, yn)
    return ut * (1 - k) + un * k


def fix_weights(W, wpos, names, G, weld):
    """weights from the sculpt's own parts: body points along the spine (tail, hips, neck, neck2, head), the
    feathered drumstick on thigh and shin, the tarsus on the foot's metatarsal bone, the toes and webs on the toe
    bone, the wing arm on the three wing bones; neighbours blend only near their joint"""
    bi = {n: i for i, n in enumerate(names)}
    Wn = np.zeros_like(W)
    P = wpos.astype(F)
    side = np.where(P[:, 0] >= 0, 'L', 'R')
    c = parts(P)
    Q = mirror(P)
    D = np.stack([c['trunk'], c['neck'], np.minimum(c['head'], c['lids']), np.minimum(c['bill'], c['nail']), c['drum'], c['tarsus'],
                  np.minimum.reduce([c['toes'], c['web'], c['claws']]), c['arm']], 1)
    D[:, 0] += 0.0015; D[:, 1] += 0.001          # ties go to the limbs
    own = np.argmin(D, 1)
    y = P[:, 1]

    def put(mask, bone, w):
        w = np.maximum(w, 0)
        if bone in bi:
            Wn[mask, bi[bone]] += w[mask]
            return
        for s in 'LR':
            m = mask & (side == s)
            Wn[m, bi[bone + s]] += w[m]

    # body: along the spine
    body = own <= 3
    u = _spine_u(Q)
    u = np.where(own >= 2, np.maximum(u, 4.35), u)        # head, bill, eyelids: all head
    for nm, w in B.blend_chain(u, SPINE, 0.3):
        put(body, nm, w)
    # drumstick: shin below the knee, thigh above it, the top blends into the belly
    m = own == 4
    th = sstep(0.104, 0.124, y)
    hp = sstep(0.122, 0.142, y) * 0.75
    an = 0.5 * sstep(0.074, 0.064, y)
    put(m, 'shin', (1 - th) * (1 - an)); put(m, 'thigh', th * (1 - hp)); put(m, 'hips', th * hp); put(m, 'hmeta', (1 - th) * an)
    # tarsus: metatarsal bone; the ankle blends with the shin, the foot pad with the toes
    m = own == 5
    k0 = 0.5 * sstep(0.052, 0.068, y)
    k1 = 0.5 * sstep(0.013, 0.004, y)
    put(m, 'hmeta', 1 - k0 - k1); put(m, 'shin', k0); put(m, 'hpaw', k1)
    # foot: toes, webs and claws on the toe bone
    m = own == 6
    k = 0.4 * sstep(0.008, 0.016, y)
    put(m, 'hpaw', 1 - k); put(m, 'hmeta', k)
    # wing arm: humerus, forearm, hand, blended at the elbow and wrist; the root into the body
    m = own == 7
    x = Q[:, 0]
    ua = np.interp(x, [SH[0], EL[0], WR[0], WT[0] + 0.05], [0.0, 1.0, 2.0, 3.0]).astype(F)
    rootb = sstep(0.068, 0.048, x) * 0.7
    for nm, w in B.blend_chain(ua, ['wing', 'wfore', 'whand'], 0.12):
        put(m, nm, w * (1 - rootb))
    put(m, 'hips', rootb)
    Wn[:, bi['ctag']] = 0
    s = Wn.sum(1, keepdims=True)
    return np.where(s > 0, Wn / np.maximum(s, 1e-9), W)


# ---------- plumage and skin paint (sRGB 0..1) and fine detail (meters), evaluated on the baked surface ----------
K = {
    'green': hexc(0x173F2A), 'greenHi': hexc(0x2C7048), 'greenBl': hexc(0x1D3550), 'ring': hexc(0xF2F0EA),
    'chest': hexc(0x5C2C22), 'chestHi': hexc(0x7A3E2C), 'chestFr': hexc(0x9A6A55),
    'flank': hexc(0xACA9A2), 'flankLn': hexc(0x45423E), 'belly': hexc(0xC6C4BE), 'back': hexc(0x7C7062), 'backDk': hexc(0x5A5046),
    'scap': hexc(0x9A9284), 'rump': hexc(0x141416), 'vent': hexc(0xECEBE6), 'cov': hexc(0x8A8176), 'covDk': hexc(0x5E564D),
    'under': hexc(0xE6E4DE), 'bill': hexc(0xD2C13A), 'billGr': hexc(0x9AA032), 'billLo': hexc(0xD69A34), 'nail': hexc(0x1A1816),
    'nostril': hexc(0x2A2416), 'leg': hexc(0xF0852A), 'legDk': hexc(0xB8551A), 'web': hexc(0xE47722), 'claw': hexc(0x302A26),
    'lid': hexc(0x101C14),
}


def _own(c):
    keys = ['trunk', 'neck', 'head', 'bill', 'drum', 'tarsus', 'toes', 'web', 'claws', 'arm', 'lids', 'nail']
    D = np.stack([c[k] for k in keys], 1)
    o = np.argmin(D, 1)
    return {k: (o == i).astype(F) for i, k in enumerate(keys)}


def _ring_y(z):
    return 0.3005 + 0.12 * (0.155 - z)


def _flow(P, N, R):
    """direction the feathers point (unit, rest pose)"""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    n = len(P)
    fl = np.zeros((n, 3), F)
    # trunk: back along the body, down the sides, down over the breast
    side = sat(-N[:, 1] * 0.6 + 0.2)
    fl[:, 1] = -0.25 - 0.55 * side
    fl[:, 2] = -1.0
    breast = sstep(0.06, 0.13, z) * sstep(0.27, 0.2, y)
    fl[:, 1] -= 1.6 * breast
    fl[:, 2] += 0.6 * breast
    # neck and head: down the neck, back over the head from the bill
    nk = np.maximum(R['neck'], R['head'] + R['lids'])
    hd = sstep(0.35, 0.37, y) * nk
    fl[:, 1] = fl[:, 1] * (1 - nk) + nk * (-1.0 * (1 - hd) - 0.35 * hd)
    fl[:, 2] = fl[:, 2] * (1 - nk) + nk * (-0.25 * (1 - hd) - 1.0 * hd)
    # drumstick: down; wing arm (spread): back along the chord and a little out
    dr = R['drum']
    fl[:, 1] = fl[:, 1] * (1 - dr) - dr
    fl[:, 2] = fl[:, 2] * (1 - dr) - 0.3 * dr
    ar = R['arm']
    fl[:, 0] = fl[:, 0] * (1 - ar) + 0.3 * ar
    fl[:, 1] *= (1 - ar)
    fl[:, 2] = fl[:, 2] * (1 - ar) - ar
    return fl / np.maximum(np.linalg.norm(fl, axis=1, keepdims=True), 1e-9)


def _size(P, N, R):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    s = np.full(len(P), 0.010, F)
    top = sstep(0.2, 0.7, N[:, 1])
    flank = sstep(0.9, 0.3, np.abs(N[:, 1])) * sstep(-0.2, -0.12, z) * sstep(0.1, 0.04, z)
    s = s + 0.007 * flank + 0.004 * top * sstep(-0.17, -0.1, z) * sstep(0.12, 0.05, z)
    s = s + 0.005 * sstep(0.03, 0.05, x) * sstep(0.25, 0.265, y) * sstep(-0.16, -0.1, z)     # scapulars
    s = s - 0.002 * sstep(-0.3, -0.8, N[:, 1])                                             # belly
    nk = R['neck']
    s = s * (1 - nk) + nk * np.interp(y, [0.25, 0.3, 0.35], [0.008, 0.0042, 0.003]).astype(F)
    hd = R['head'] + R['lids']
    s = s * (1 - hd) + hd * 0.0025
    s = s * (1 - R['drum']) + R['drum'] * 0.0045
    s = s * (1 - R['arm']) + R['arm'] * 0.006
    return s


def _fshape(P):
    n = len(P)
    return np.ones(n, F) * 1.05, np.ones(n, F), np.ones(n, F)


_pcache = {}


def _plum(P, N, c):
    key = (len(P), float(P[:7].sum()))
    if key not in _pcache:
        R = _own(c)
        Pm = mirror(P)
        Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
        fl = _flow(Pm, Nm, R)
        sz = _size(Pm, Nm, R)
        feath = np.clip(R['trunk'] + R['neck'] + R['head'] + R['drum'] + R['arm'], 0, 1)
        pl = B.plumage(Pm, Nm, fl, sz, _fshape, seed=3)
        _pcache.clear()
        _pcache[key] = (R, Pm, Nm, fl, sz, feath, pl)
    return _pcache[key]


def _zones(Pm, Nm, R):
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    Z = {}
    yr = _ring_y(z)
    nk = np.clip(R['neck'] + R['head'] + R['lids'], 0, 1)
    Z['green'] = sstep(yr + 0.0025, yr + 0.0045, y) * np.maximum(nk, sstep(0.3, 0.32, y))
    ring = sstep(0.0042, 0.0028, np.abs(y - yr)) * sstep(-0.82, -0.5, Nm[:, 2]) * sstep(0.27, 0.28, y)
    Z['ring'] = ring
    zb = 0.06 + 0.32 * (0.24 - y)
    Z['breast'] = sstep(-0.008, 0.008, z - zb) * (1 - Z['green']) * (1 - ring) * sstep(0.29, 0.265, y + 0.25 * sat((0.13 - z) / 0.08))
    up = sstep(0.0, 0.55, Nm[:, 1])
    Z['back'] = up * sstep(0.262, 0.275, y) * sstep(0.1, 0.06, z) * sstep(-0.19, -0.15, z) * (1 - Z['breast'])
    Z['scap'] = sstep(0.022, 0.04, x) * sstep(0.245, 0.262, y) * sstep(0.08, 0.04, z) * sstep(-0.17, -0.12, z) * (1 - Z['breast'])
    Z['belly'] = sstep(-0.35, -0.8, Nm[:, 1]) * (1 - Z['breast'])
    rumpz = -0.178 - 0.012 * sstep(0.24, 0.2, y)
    Z['rump'] = sstep(rumpz + 0.004, rumpz - 0.004, z)
    Z['vent'] = sstep(rumpz + 0.022, rumpz + 0.012, z) * (1 - Z['rump']) * sstep(0.245, 0.225, y)
    return Z


def _vermic(Pm, pl, lam, seed):
    """fine wavy dark lines across each feather (vermiculation), 0..1"""
    a, b = pl['a'], pl['b']
    wob = 0.9 * fbm(Pm * 900, 2, seed) + 0.25 * np.sin(b / 0.0011 + pl['id'] * 20)
    v = np.sin(2 * np.pi * (a / lam + wob))
    return sstep(0.45, 0.9, v)


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    Z = _zones(Pm, Nm, R)
    n1 = fbm(Pm * 40, 3, 11)
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    col = np.tile(K['flank'], (len(P), 1))
    # flanks: pale gray finely vermiculated; belly paler and finer
    vm = _vermic(Pm, pl, 0.0013, 21)
    col = mix(col, K['flankLn'], vm * (0.42 - 0.18 * Z['belly']))
    col = mix(col, K['belly'], Z['belly'] * 0.55)
    # scapulars and back: browner gray, vermiculated, darker feather centers, paler edges
    bk = np.maximum(Z['back'], Z['scap'] * 0.8)
    bcol = mix(np.tile(K['scap'], (len(P), 1)), K['back'], Z['back'])
    bcol = mix(bcol, K['backDk'], sstep(0.55, 0.15, np.abs(pl['b']) / np.maximum(pl['w'], 1e-6)) * sstep(-0.3 * cfa, -0.9 * cfa, pl['a']) * 0.35)
    bcol = mix(bcol, K['flankLn'], _vermic(Pm, pl, 0.0011, 22) * 0.3)
    col = mix(col, bcol, bk)
    # chestnut breast with faint pale fringes
    ccol = mix(np.tile(K['chest'], (len(P), 1)), K['chestHi'], sstep(0.3, 0.9, Nm[:, 2]) * 0.4 + 0.15 * (fid - 0.5))
    ccol = mix(ccol, K['chestFr'], sstep(0.12 * cfa, 0.0, pl['e']) * 0.35)
    col = mix(col, ccol, Z['breast'])
    # neck ring, iridescent green head and upper neck
    gcol = mix(np.tile(K['green'], (len(P), 1)), K['greenHi'], sstep(0.35, 0.95, np.abs(Nm[:, 0])) * 0.55 * (0.8 + 0.4 * n1))
    gcol = mix(gcol, K['greenBl'], sstep(0.4, 0.95, Nm[:, 1]) * 0.35 + sstep(0.2, 0.8, -Nm[:, 2]) * 0.25)
    gcol *= (0.92 + 0.16 * fid)[:, None]
    col = mix(col, gcol, Z['green'])
    col = mix(col, K['ring'], Z['ring'] * (1 - Z['green']))
    # black rump and undertail, the white band in front of it
    col = mix(col, K['vent'], Z['vent'])
    col = mix(col, K['rump'] * (0.9 + 0.25 * fid)[:, None], Z['rump'])
    # drumstick: belly gray; wing arm: coverts above, white below
    col = mix(col, K['belly'] * 0.92, R['drum'] * 0.7)
    acol = mix(np.tile(K['cov'], (len(P), 1)), K['covDk'], sstep(0.2 * cfa, 0.0, pl['e']) * 0.3)
    acol = mix(acol, K['under'], sstep(0.1, -0.3, Nm[:, 1]))
    col = mix(col, acol, R['arm'])
    # feather by feather: brightness, shade under each tip
    shade = 1 - 0.07 * sstep(0.45 * cfa, 1.3 * cfa, -pl['a']) * pl['cov']
    col *= ((0.975 + 0.05 * fid) * shade)[:, None] * feath[:, None] + (1 - feath)[:, None]
    # bill: yellow, greener on top toward the base, orange-yellow lower mandible, black nail, dark nostrils
    yt = _tom_y(z)
    bl = R['bill']
    bcol = mix(np.tile(K['bill'], (len(P), 1)), K['billGr'], sstep(0.24, 0.205, z) * sstep(yt + 0.002, yt + 0.008, y) * 0.45)
    bcol = mix(bcol, K['billLo'], sstep(yt + 0.0005, yt - 0.0015, y) * 0.65)
    bcol = mix(bcol, K['nostril'], sstep(0.0016, 0.0007, np.linalg.norm((Pm - NOSTRIL) * V(1, 1.4, 0.45), axis=1)))
    bcol = mix(bcol, K['bill'] * 0.62, sstep(0.0011, 0.0003, np.abs(y - yt)) * 0.5)
    col = mix(col, bcol, bl)
    nl = sstep(0.0008, -0.0004, c['nail'])
    col = mix(col, K['nail'], np.maximum(R['nail'], nl * bl))
    # where the feathers meet the bill: a soft dark line
    col = mix(col, K['green'] * 0.7, sstep(0.0012, 0.0, np.abs(c['bill'] - c['head'])) * sstep(0.18, 0.19, z) * 0.6)
    # eye lids
    col = mix(col, K['lid'], R['lids'] * 0.8)
    # legs and feet: orange, scute grooves darker, webs a little darker, claws dark
    lg = np.clip(R['tarsus'] + R['toes'] + R['web'], 0, 1)
    lcol = mix(np.tile(K['leg'], (len(P), 1)), K['web'], R['web'] * 0.6)
    lcol = mix(lcol, K['legDk'], sstep(0.004, 0.0, y) * 0.35)
    col = mix(col, lcol, lg)
    col = mix(col, K['claw'], R['claws'])
    rough = 0.8 + 0.06 * (n1 - 0.5)
    rough = rough - 0.4 * Z['green'] - 0.12 * Z['breast'] - 0.12 * Z['rump']
    rough = np.where(bl > 0.5, 0.42, rough)
    rough = np.where(lg > 0.5, 0.52, rough)
    rough = np.where(R['claws'] + R['nail'] > 0.5, 0.36, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _leg_h(P, c, R):
    """scales on the legs and toes (m)"""
    Pm = mirror(P)
    h = np.zeros(len(P), F)
    # tarsus: transverse scutes on the front, small round scales on the sides and back
    fr = sstep(-0.004, 0.002, Pm[:, 2] - (HMETA[2] + (HPAW[2] - HMETA[2]) * sat((HMETA[1] - Pm[:, 1]) / (HMETA[1] - HPAW[1]))))
    sh, sg = B.scutes(Pm, V(0, 1, 0), 0.0024, 41)
    rh, rg = B.reticulate(Pm, 0.0011, 42)
    h += R['tarsus'] * (fr * (0.00009 * sh - 0.00007 * sg) + (1 - fr) * (0.00005 * rh - 0.00005 * rg))
    # toes: scutes across the top, pads below
    th, tg = B.scutes(Pm, nrm([0.15, 0, 1]), 0.0019, 43)
    up = sstep(0.0005, 0.0025, Pm[:, 1])
    h += R['toes'] * (up * (0.00006 * th - 0.00006 * tg) + (1 - up) * 0.00004 * rh)
    # webs: fine reticulation and soft radial folds
    wh, wg = B.reticulate(Pm, 0.0008, 44)
    ang = np.arctan2(Pm[:, 0] - FOOT[0], Pm[:, 2] - FOOT[2])
    h += R['web'] * (0.00002 * wh - 0.00002 * wg - 0.00003 * sstep(0.6, 1.0, np.sin(ang * 55)))
    return h


def detail(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    h = np.zeros(len(P), F)
    # overlapping feathers; tiny velvety ones on the head
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    h += B.feather_height(pl, 0.022) * feath * (1 - 0.4 * hd)
    # barbs and shafts on the bigger feathers
    cf = pl['c']
    big = sstep(0.006, 0.012, cf) * pl['cov'] * feath
    bar = np.sin(2 * np.pi * (pl['a'] * 0.7 + np.abs(pl['b'])) / 0.0009)
    h -= 0.000012 * sstep(0.3, 1.0, bar) * big
    h += 0.00004 * sstep(0.0007, 0.0, np.abs(pl['b'])) * sstep(-0.4 * cf, -0.9 * cf, pl['a']) * big
    h += 0.00002 * (fbm(Pm * 700, 2, 61) - 0.5) * hd
    # bill: lamellae along the edge of the upper mandible, fine pitting, the nail's rim
    yt = _tom_y(z)
    bl = R['bill']
    lam = sstep(0.0, 0.0018, y - yt) * sstep(0.0028, 0.0012, y - yt) * sstep(0.008, 0.011, x) * sstep(0.2, 0.21, z)
    h -= 0.00006 * sstep(0.5, 1.0, np.sin(z / 0.00085 * np.pi)) * lam * bl
    f1, _ = worley(Pm / 0.0005, 62)
    h -= 0.000012 * sstep(0.3, 0.0, f1) * bl
    h -= 0.00005 * sstep(0.0006, 0.0, np.abs(c['nail'])) * bl
    h += _leg_h(P, c, R)
    return h


def finish(C, ao, valid):
    """fold ambient occlusion into the color (linear light)"""
    return B.finish_ao(C, ao, 0.28)


# ---------- the duckling (baby maps) ----------
KB = {'yel': hexc(0xF0D25A), 'yelPale': hexc(0xF6E4A0), 'brn': hexc(0x4A3C24), 'brnDk': hexc(0x32281A), 'bill': hexc(0x4A443A),
      'billTip': hexc(0xD8C8A8), 'leg': hexc(0x5C5440), 'claw': hexc(0x3A3630)}


def paint_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    dn, tip = B.down(Pm, fl, Nm, 0.0018, 71)
    col = mix(np.tile(KB['yel'], (len(P), 1)), KB['yelPale'], sstep(-0.2, -0.7, Nm[:, 1]))
    # dark brown cap, nape, back and wings; a dark line through the eye; yellow patches on the back and sides
    hd = np.clip(R['head'] + R['lids'] + R['neck'], 0, 1)
    de = (Pm - EYE_C)
    cap = sstep(-0.1, 0.4, Nm[:, 1] + 0.7 * sat(-Nm[:, 2])) * sstep(0.392, 0.398, y + 0.25 * np.maximum(0, 0.185 - z)) * hd
    nape = sstep(-0.1, -0.6, Nm[:, 2]) * hd * sstep(0.32, 0.36, y)
    eyeline = sstep(0.0045, 0.0025, np.abs(de[:, 1] + 0.18 * de[:, 2])) * sstep(0.205, 0.19, z) * sstep(0.128, 0.145, z) * hd
    ear = sstep(0.0045, 0.002, np.linalg.norm((Pm - V(0.016, 0.381, 0.163)) * V(0.5, 1, 1), axis=1)) * hd
    back = sstep(-0.1, 0.45, Nm[:, 1] + 0.25) * sstep(0.232, 0.25, y) * np.clip(R['trunk'], 0, 1) * sstep(0.13, 0.09, z)
    spots = (sstep(0.024, 0.016, np.linalg.norm((Pm - V(0.05, 0.252, 0.02)) * V(1, 1.3, 0.7), axis=1))
             + sstep(0.024, 0.016, np.linalg.norm((Pm - V(0.046, 0.248, -0.14)) * V(1, 1.3, 0.7), axis=1)))
    arm_ = R['arm'] * sstep(0.2, 0.0, (Pm[:, 2] - 0.045) / 0.03 + 0.5)
    dark = np.clip(np.maximum.reduce([cap, nape, eyeline, ear * 0.8, back * (1 - np.clip(spots, 0, 1)), R['arm'] * (1 - arm_ * 0.0)]), 0, 1)
    col = mix(col, KB['brn'], dark * (0.85 + 0.15 * dn))
    col *= (0.72 + 0.4 * dn + 0.1 * tip)[:, None]
    # bill: dark gray with a pale egg tooth on the nail; legs and feet dark olive gray
    bl = np.clip(R['bill'] + R['nail'], 0, 1)
    bcol = mix(np.tile(KB['bill'], (len(P), 1)), KB['billTip'], sstep(0.0012, -0.0006, c['nail']) * 0.9)
    col = mix(col, bcol, bl)
    lg = np.clip(R['tarsus'] + R['toes'] + R['web'], 0, 1)
    col = mix(col, KB['leg'], lg)
    col = mix(col, KB['claw'], R['claws'])
    col = mix(col, KB['brnDk'], R['lids'] * 0.7)
    rough = np.where(bl + lg > 0.5, 0.55, 0.92)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _baby_body(Q):
    """the duckling in adult space (the game's baby proportions shrink it afterwards): an egg of down, a short thick neck"""
    d = ellipsoid(Q, V(0, 0.205, -0.015), V(0.07, 0.074, 0.148))
    d = smin(d, round_cone(Q, V(0, 0.24, 0.11), V(0, 0.355, 0.162), 0.05, 0.033), 0.04)
    return d


def baby_offset(P, N, c):
    """per vertex: where the baby's surface lies relative to the adult's (adult space; see bird.baby_shape)"""
    return B.baby_shape(P, N, _own(c), _baby_body, (V(0.042, 0.06, -0.03), V(0.04, 0.16, -0.012), 0.0065, 1.3), SH + V(-0.02, -0.012, -0.01), (0.0035, 0.0045))


def detail_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, fl, Nm, 0.0018, 71)
    h = 0.00028 * (dn - 0.5) * feath
    h += 0.5 * _leg_h(P, c, R)
    return h


# ---------- feather blades (atlas cells, same order as the game's feather cells) ----------
def _vn(s, t, base, edge, k=0.5):
    return mix(np.tile(base, (len(s), 1)), edge, sstep(0.55, 1.0, np.abs(s)) * k)


def _cells():
    F_ = B.FeatherCell
    sp_blue, sp_pur = hexc(0x2B3C9E), hexc(0x4A2E92)

    def prim(s, t, side):
        c = _vn(s, t, hexc(0x5A534C), hexc(0x47413B), 0.6)
        return mix(c, hexc(0x8C857C), sstep(0.3, 0.0, t) * 0.5)

    def sec(s, t, side):
        c = mix(np.tile(hexc(0x7A7166), (len(s), 1)), sp_blue, sstep(0.34, 0.4, t))
        c = mix(c, sp_pur, sstep(0.4, 0.8, t) * (0.3 + 0.5 * sat(np.abs(s))) * sstep(0.84, 0.8, t))
        c = mix(c, hexc(0x0E0E12), sstep(0.8, 0.83, t))
        return mix(c, hexc(0xF4F3EF), sstep(0.89, 0.92, t))

    def gcov(s, t, side):
        c = _vn(s, t, hexc(0x7A7268), hexc(0x625A51), 0.4)
        c = mix(c, hexc(0x111113), sstep(0.62, 0.66, t))
        return mix(c, hexc(0xF4F3EF), sstep(0.74, 0.78, t))

    def lcov(s, t, side):
        c = _vn(s, t, hexc(0x766E64), hexc(0x958C80), 0.6)
        return mix(c, hexc(0x6C645A), sstep(0.5, 0.0, np.abs(s)) * 0.2)

    def tert(s, t, side):
        c = _vn(s, t, hexc(0x9A9284), hexc(0xB8B0A2), 0.5)
        c = mix(c, hexc(0x4E3A2C), sstep(0.15, -0.05, s) * sstep(0.95, 0.3, -s) * (s < 0) * 0.8 + sstep(0.2, 0.0, s) * (s >= 0) * 0.0)
        return c

    def tail(s, t, side):
        c = _vn(s, t, hexc(0x8E8B86), hexc(0xF2F1EC), 1.0)
        return mix(c, hexc(0xEFEEE9), sstep(0.75, 0.95, t))

    def curl(s, t, side):
        return np.tile(hexc(0x101012), (len(s), 1))

    def under(s, t, side):
        return _vn(s, t, hexc(0xE9E8E3), hexc(0xF7F6F2), 0.6)

    return [F_('flight', prim, w=0.64, outer=0.5, tip=0.42, shaft=hexc(0x2E2A26), notch=0.0),
            F_('round', sec, w=0.74, outer=0.8, tip=0.4, shaft=hexc(0x3A3530)),
            F_('round', gcov, w=0.8, outer=0.85, tip=0.75, shaft=hexc(0x5A534A)),
            F_('round', lcov, w=0.8, outer=0.9, tip=1.2, shaft=hexc(0x6A6258)),
            F_('round', tert, w=0.76, outer=0.85, tip=0.6, shaft=hexc(0x3A3028)),
            F_('round', tail, w=0.66, outer=0.85, tip=0.55, shaft=hexc(0xC8C6C0)),
            F_('round', curl, w=0.7, outer=1.0, tip=0.9, shaft=hexc(0x202022), gloss=1),
            F_('round', under, w=0.8, outer=0.9, tip=0.6, shaft=hexc(0xD8D6D0))]


def _baby_cells():
    F_ = B.FeatherCell
    brn, yel = hexc(0x4E3E26), hexc(0xE8CC58)
    def dn(s, t, side):
        return mix(np.tile(brn, (len(s), 1)), yel, sstep(0.6, 0.95, t) * 0.7)
    def dny(s, t, side):
        return mix(np.tile(yel, (len(s), 1)), brn, sstep(0.5, 0.0, t) * 0.5)
    return [F_('down', dn), F_('down', dn), F_('down', dn), F_('down', dn), F_('down', dn), F_('down', dny), F_('down', dn), F_('down', dny)]


FEATHER_ATLAS = {'size': (1024, 512), 'out': (512, 256), 'cells': _cells, 'baby': _baby_cells, 'quality': (72, 80, 72),
                 'alpha_quality': 50}


def extra_maps(X):
    """texture step hook: baby maps and the feather atlas"""
    B.extra_maps(sys.modules[__name__], X)


def export_extra(meta, out_dir, work):
    """export step hook: write the extra maps and name them in the json"""
    B.export_extra(sys.modules[__name__], meta, out_dir, work)


# ---------- what the game needs besides the mesh ----------
MAP_QUALITY = (75, 70)   # WebP quality: color, normal
BABY_MAPS = {'size': 512, 'quality': (74, 72)}


def stats(P, N, c, col):
    R = _own(c)
    de = np.linalg.norm(mirror(P) - EYE_C, axis=1)
    m = sstep(EYE_R + 0.004, EYE_R + 0.002, de) * (1 - R['bill'])
    lid = (col * m[:, None]).sum(0) / max(m.sum(), 1e-6) * 0.9
    return {'lidCol': int(round(lid[0] * 255)) << 16 | int(round(lid[1] * 255)) << 8 | int(round(lid[2] * 255))}


def meta(st):
    r = EYE_R
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [0.8, -0.8, 0.12],
                'iris': 0x3A200E, 'irisR': 0.9, 'pupilR': 0.42, 'rim': 0x0E0A06, 'lidCol': st['lidCol'], 'babyLidCol': 0x3A3020},
        'collar': {'at': ['neck', 'neck2', 0.55], 'babyAt': 0.8, 'hug': True, 'babyK': 1.8},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.1, 0.1, 0.1], 'flat': 0x9A958C,
    }
