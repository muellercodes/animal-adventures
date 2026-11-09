# An African leopard (round 11) on the cat template (panthera.py, bigcat.py): the house cat's skeleton at KS = 2.7
# (about 1.3 m from the nose to the rump, 0.65 m at the shoulder) with its own parts in cat units: a long slender body
# with a deep chest, short powerful legs on big paws, a long tail on four bones carried low with the tip curled up, a
# broad round head with a strong jaw and a moderate muzzle, green-gold eyes, small rounded ears with black backs and a
# pale spot. The coat: golden, paler on the flanks, white underneath, with open rosettes on the body (rings of three
# to six black spots round a center a little darker than the ground), solid spots on the head, the neck and the legs,
# big blotches on the white belly, spots then rings on the tail and the white under its tip. Cubs: a grayer, woolly
# coat with dense smudgy spots, blue-gray eyes.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, ellipsoid, round_cone, fbm, worley
import carnivore as CV
from carnivore import mirror, mix, hexc
import panthera as PT

KS = 2.7
ID = 'leopard'
MSK = 1.12
MS = lambda v: 0.054 + (v - 0.054) * MSK
# the long tail: path (y, z), radius (cat units): hanging low, the tip curled up
_TAIL = [(0.207, -0.185, 0.0125), (0.2, -0.21, 0.0122), (0.18, -0.255, 0.0118), (0.155, -0.3, 0.0114), (0.128, -0.343, 0.011),
         (0.104, -0.383, 0.0106), (0.087, -0.42, 0.0102), (0.08, -0.452, 0.0098), (0.084, -0.478, 0.0092), (0.095, -0.496, 0.0078),
         (0.105, -0.505, 0.004)]
_TB = {'tail1': V(0, 0.205, -0.19), 'tail2': V(0, 0.168, -0.278), 'tail3': V(0, 0.118, -0.36), 'tail4': V(0, 0.083, -0.44)}
T = dict(
    MS=MSK,
    HF=CV.Frame(V(0.0, 0.292, 0.178), V(0.0, -0.22, 1.0), V(0.0, 1.0, 0.0)), DROP=(0.26, 0.05),
    BOUNDS=(V(-0.085, 0.0, -0.53), V(0.085, 0.36, 0.3)),
    # long and slender, a deep chest
    TRUNK=[
        (-0.205, 0.22, 0.2, 0.18, 0.02, 2.0, 2.0),
        (-0.19, 0.231, 0.201, 0.168, 0.038, 2.1, 2.0),
        (-0.16, 0.239, 0.203, 0.158, 0.047, 2.2, 2.0),
        (-0.12, 0.243, 0.204, 0.157, 0.048, 2.3, 2.0),
        (-0.08, 0.244, 0.203, 0.15, 0.048, 2.3, 2.0),
        (-0.03, 0.243, 0.2, 0.135, 0.05, 2.3, 2.0),
        (0.02, 0.242, 0.197, 0.121, 0.053, 2.3, 2.0),
        (0.06, 0.242, 0.194, 0.115, 0.052, 2.3, 2.0),
        (0.1, 0.241, 0.193, 0.118, 0.047, 2.2, 2.0),
        (0.125, 0.234, 0.192, 0.13, 0.041, 2.1, 2.0),
        (0.14, 0.224, 0.192, 0.148, 0.031, 2.0, 2.0),
    ],
    NECK=[
        (0.2, 0.09, 0.048, 0.054, 0.048, 2.0, 2.0),
        (0.222, 0.135, 0.04, 0.046, 0.04, 2.0, 2.0),
        (0.248, 0.163, 0.032, 0.036, 0.033, 2.0, 2.0),
        (0.274, 0.181, 0.027, 0.029, 0.028, 2.0, 2.0),
        (0.29, 0.188, 0.022, 0.024, 0.024, 2.0, 2.0),
    ],
    THROAT=[((0.0, 0.186, 0.148), (0.034, 0.036, 0.03), 0.02), ((0.0, 0.198, 0.112), (0.042, 0.045, 0.036), 0.025)],
    # a broad round head, a strong jaw, a moderate muzzle
    HEAD=[
        (-0.006, 0.015, 0.0, -0.02, 0.02, 2.2, 2.0),
        (0.008, 0.025, -0.002, -0.029, 0.031, 2.5, 2.0),
        (0.024, 0.027, -0.004, -0.034, 0.0355, 2.6, 2.0),
        (0.04, 0.0262, -0.007, -0.036, 0.0358, 2.6, 2.1),
        (0.054, 0.0228, -0.009, -0.0365, 0.034, 2.6, 2.2),
        (MS(0.066), 0.0182, -0.011, -0.035, 0.0305, 2.6, 2.3),
        (MS(0.077), 0.0125, -0.012, -0.0325, 0.0262, 2.6, 2.3),
        (MS(0.087), 0.0068, -0.013, -0.029, 0.0215, 2.5, 2.3),
        (MS(0.094), 0.0018, -0.013, -0.0245, 0.016, 2.3, 2.2),
    ],
    CHEEK=((0.024, -0.018, 0.042), (0.0125, 0.0145, 0.02)), PAD_X=0.0098, BROW=0.0165, PADS=(0.0128, 0.0115, 0.0138), CHIN=(0.0092, 0.0065, 0.011),
    NOSE=(0.0078, 0.0054, 0.004), BRIDGE=None,
    TAIL=_TAIL, TB=_TB, TAIL_TD=0.024,
    EYE_AT=(0.062, 0.0055, 0.0162), EYE_R=0.0078, LID_W=0.0072, LID_H=0.0051, SLANT=0.12, SINK=0.45, MOUTH_AT=(MS(0.086), -0.027),
    EAR_B=V(0.029, 0.298, 0.188), EAR_A=[0.52, 0.84, -0.1], EAR_N=[0.45, -0.05, 0.9], EAR_L=0.022, EAR_W=0.017,
    BOX=dict(neck=((-0.085, 0.1, 0.0), (0.085, 0.35, 0.26)), head=((-0.07, 0.185, 0.14), (0.07, 0.35, 0.3)),
             eyes=((-0.042, 0.265, 0.21), (0.042, 0.32, 0.27)), ear=((-0.07, 0.28, 0.165), (0.07, 0.345, 0.225)),
             fleg=((-0.085, -0.005, 0.02), (0.085, 0.26, 0.17)), hleg=((-0.09, -0.005, -0.25), (0.09, 0.27, -0.03)),
             paws=((-0.075, -0.005, -0.2), (0.075, 0.035, 0.14)), tail=((-0.035, 0.04, -0.53), (0.035, 0.24, -0.15))),
    COAT=0.0018, LOCKS=0.0006,
    SHOULDER=((0.032, 0.17, 0.11), (0.024, 0.238, 0.082), 0.02, 0.016),
    FORE_K=(1.38, 1.2), HIND_K=(1.3, 1.1),
    FLEG_X=[((0.038, 0.195, 0.118), (0.042, 0.115, 0.078), 0.027, 0.019, 0.8, 0.018)],
    HIP_CUT=0.234,
    F_TOES=[(0.0062, 0.0088, 0.0071, 0.0078, 0.0), (-0.0062, 0.0088, 0.0071, 0.0078, 0.0), (0.0148, 0.0008, 0.0066, 0.0072, 0.0004),
            (-0.0148, 0.0008, 0.0066, 0.0072, 0.0004)],
    H_TOES=[(0.0058, 0.0084, 0.0067, 0.0075, 0.0), (-0.0058, 0.0084, 0.0067, 0.0075, 0.0), (0.0138, 0.0007, 0.0062, 0.007, 0.0004),
            (-0.0138, 0.0007, 0.0062, 0.007, 0.0004)],
    F_PAD=(0.0142, 0.0108, 0.0135), H_PAD=(0.0135, 0.0104, 0.0134),
    PAW_PATCHES=[(V(0.014, -0.001, 0.075), V(0.064, 0.024, 0.128), 0.0004), (V(0.016, -0.001, -0.184), V(0.068, 0.024, -0.126), 0.0004)],
    FUR={'len': 0.012, 'n': 4, 'lean': 1.3, 'tile': 0.0011, 'babyLen': 1.6, 'babyLean': 0.5, 'shade': 0.64, 'quality': 74},
    FUR_K=0.5,
    COL=dict(ground=hexc(0xB0823C), warm=hexc(0xBA8C44), back=hexc(0x9A6C2E), cream=hexc(0xDCCBA4), white=hexc(0xE8E0CC),
             dark=hexc(0x1C1612), ear=hexc(0x1C1612), earIn=hexc(0xD8C8B0), nose=hexc(0xB0786A), noseDark=hexc(0x4A3028),
             lips=hexc(0x1E1612), lid=hexc(0x18120E), pad=hexc(0x3A2A24)),
    BACK_K=0.45, STROKE=0.1, EYE_PALE=(0.75, 0.5), WSPOTS=0.9, NOSE_MOTTLE=0.15, WHISKER=0.06, EAR_SPOT=0.55,
    KITTEN=dict(c=V(0.0, 0.198, -0.035), r=(0.056, 0.054, 0.172), rb=0.076, e=2.1, maxd=0.022),
    EYE_META={'iris': 0xB8B03C, 'rim': 0x4E5418, 'pupilR': 0.34, 'babyIris': 0x8496A8, 'babyLidCol': 0x5A4E40},
    META={'flat': 0xA88448, 'rim': [0.18, 0.14, 0.07]},
    MAP_QUALITY=(40, 46), BABY_TEX=192,
)
C = PT.load(ID, T)
PT.setup(C)
_bone_tips = C.bone_tips


def spots(R, Pm, N, P, soft=0.0):
    """the leopard's spots as a mask: rosettes on the body, solid spots on the head, the neck and the legs, blotches on
    the belly, spots then rings on the tail; and the rosettes' centers (a little darker than the ground)"""
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    hd, tl, L = R['head'], R['tail'], R['L']
    up = np.clip(N[:, 1], -1, 1)
    warp = np.stack([fbm(P * 70 + k, 2, 120 + k) for k in range(3)], 1) - 0.5
    leg = sstep(0.15, 0.11, y) * (1 - tl) * (1 - hd)
    under = sstep(-0.35, -0.7, up) * (1 - hd) * (1 - tl)
    body = (1 - hd) * (1 - tl) * (1 - leg) * (1 - under)
    neck = sstep(0.12, 0.16, z) * (1 - hd) * (1 - tl)
    # rosettes: a coarse cell gives the ring (a band round its point), a fine one breaks it into blobs
    f1, _ = worley(P / 0.019 + warp * 0.5, 121)
    ring = sstep(0.14, 0.22, f1) * sstep(0.6, 0.47, f1)
    g1, _ = worley(P / 0.0078 + warp * 0.35, 122)
    blobs = sstep(0.66 + soft, 0.46 - soft, g1)
    ros = ring * blobs
    inner = sstep(0.28, 0.12, f1) * body * (1 - neck)
    # solid spots: small on the head, larger down the legs, big blotches on the belly
    h1, _ = worley(P / 0.005 + warp * 0.3, 123)
    sp_head = sstep(0.34 + soft, 0.22 - soft, h1) * hd * sstep(0.004, 0.0, -L[:, 1] - 0.0) * (1 - R['ear'])
    sp_head = np.maximum(sp_head, sstep(0.34 + soft, 0.22 - soft, h1) * hd * sstep(0.035, 0.05, L[:, 2]) * sstep(0.075, 0.065, L[:, 2]) * sstep(0.02, 0.026, np.abs(L[:, 0])) * sstep(-0.026, -0.018, L[:, 1]) * (1 - R['ear']))
    k1, _ = worley(P / 0.0085 + warp * 0.3, 124)
    sp_leg = sstep(0.42 + soft, 0.28 - soft, k1) * np.maximum(leg, neck) * sstep(0.015, 0.03, y)
    b1, _ = worley(P / 0.014 + warp * 0.4, 125)
    sp_belly = sstep(0.4 + soft, 0.27 - soft, b1) * under
    # the tail: spots, then rings toward the tip, which is dark above and white under
    tt = R['tt']
    t1, _ = worley(P / 0.012 + warp * 0.4, 126)
    tsp = sstep(0.38, 0.26, t1) * tl * sstep(0.65, 0.5, tt)
    g = tt * C.TAIL_LEN / (0.03 - 0.008 * tt) + 0.3 * warp[:, 0]
    trings = sstep(0.18, 0.08, np.abs(g - np.round(g))) * tl * sstep(0.5, 0.65, tt) * (1 - sstep(-0.2, -0.6, N[:, 1]) * sstep(0.85, 0.92, tt))
    m = np.maximum.reduce([ros * body * (1 - neck * 0.8), sp_head, sp_leg, sp_belly, tsp, trings])
    return np.clip(m, 0, 1), inner


def pattern(C_, R, P, N, col, under):
    Pm = R['Pm']
    sp, inner = spots(R, Pm, N, P)
    n2 = fbm(Pm * 140, 3, 12)
    # the white under the tip of the tail
    col = mix(col, C.T['COL']['white'], R['tail'] * sstep(0.86, 0.93, R['tt']) * sstep(-0.1, -0.5, N[:, 1]))
    col = mix(col, hexc(0x8A5E24), inner * 0.55)
    col = mix(col, hexc(0x3A2A18), sstep(0.05, 0.45, sp) * 0.55)
    col = mix(col, hexc(0x15110E) * (0.9 + 0.2 * n2[:, None]), sstep(0.35, 0.85, sp) * 0.95)
    return col


T['pattern'] = pattern


def cub(C_, R, P, N, col, keep, c):
    """cubs: grayer and woolly, the spots dense and smudgy"""
    Pm = R['Pm']
    M = C._tabby(R, Pm, N)
    pale = np.clip(np.maximum(sstep(-0.3, -0.7, N[:, 1]), M['pale']), 0, 1)
    out = mix(col, hexc(0x9A8C76), 0.55 * (1 - keep) * (1 - pale * 0.6))
    sp, inner = spots(R, Pm, N, P, soft=0.08)
    out = mix(out, hexc(0x2E2620), np.clip(sp * 0.75 + inner * 0.35, 0, 1) * 0.8 * (1 - keep))
    return out


T['cub'] = cub
PT.install(globals(), C, KS)
