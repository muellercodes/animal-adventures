# A Bengal tiger (round 11) on the cat template (panthera.py, bigcat.py): the house cat's skeleton at KS = 4.0 (about
# 1.95 m from the nose to the rump, 1 m at the shoulder, a 1.05 m tail) with its own parts in cat units: a long, low,
# muscular body with a deep chest and a loose fold of skin under the belly, heavy shoulders and forelegs, big paws, a
# round broad head with a ruff of long fur on the cheeks, a broad muzzle, amber eyes, small rounded ears set wide, a
# thick tail. The coat: rufous orange, white on the belly, the insides of the legs, the chest, the cheeks, the muzzle
# and the chin, a big white spot over each eye, white spots on the black backs of the ears; black stripes in the real
# pattern (narrow, often paired and forking, tapering, stopping short of the spine so none crosses it as a band;
# curved bands on the thighs, few on the forelegs, lines on the forehead and the cheeks, rings on the tail, a black
# tip). Cubs: the same stripes on a fluffier coat, big paws and head, blue-gray eyes.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, ellipsoid, round_cone, fbm, worley, _hash
import carnivore as CV
from carnivore import mirror, mix, hexc
import panthera as PT

KS = 4.0
ID = 'tiger'
MSK = 1.18
MS = lambda v: 0.054 + (v - 0.054) * MSK
# the tail: the house cat's path, thicker (it hangs low and the game curls it up at the tip)
_TAIL = [(0.207, -0.185, 0.0145), (0.203, -0.205, 0.0138), (0.193, -0.245, 0.0128), (0.183, -0.28, 0.0122), (0.167, -0.32, 0.0116),
         (0.15, -0.36, 0.011), (0.13, -0.395, 0.0104), (0.115, -0.425, 0.0097), (0.106, -0.443, 0.0082), (0.102, -0.451, 0.0045)]
_TB = {'tail1': V(0, 0.205, -0.19), 'tail2': V(0, 0.185, -0.28), 'tail3': V(0, 0.15, -0.36)}
T = dict(
    MS=MSK,
    HF=CV.Frame(V(0.0, 0.292, 0.178), V(0.0, -0.24, 1.0), V(0.0, 1.0, 0.0)), DROP=(0.3, 0.05),
    BOUNDS=(V(-0.1, 0.0, -0.47), V(0.1, 0.36, 0.3)),
    # long and low, a deep chest, the loose belly skin hanging between the hind legs
    TRUNK=[
        (-0.205, 0.218, 0.198, 0.176, 0.024, 2.0, 2.0),
        (-0.19, 0.229, 0.199, 0.162, 0.044, 2.1, 2.0),
        (-0.16, 0.235, 0.2, 0.15, 0.055, 2.2, 2.0),
        (-0.12, 0.237, 0.2, 0.143, 0.056, 2.3, 2.0),
        (-0.08, 0.238, 0.199, 0.137, 0.056, 2.3, 2.0),
        (-0.03, 0.239, 0.197, 0.127, 0.058, 2.3, 2.0),
        (0.02, 0.241, 0.195, 0.116, 0.06, 2.3, 2.0),
        (0.06, 0.244, 0.193, 0.11, 0.059, 2.3, 2.0),
        (0.1, 0.245, 0.192, 0.114, 0.054, 2.2, 2.0),
        (0.125, 0.239, 0.192, 0.126, 0.047, 2.1, 2.0),
        (0.14, 0.229, 0.192, 0.144, 0.036, 2.0, 2.0),
    ],
    NECK=[
        (0.2, 0.09, 0.056, 0.062, 0.056, 2.0, 2.0),
        (0.222, 0.135, 0.045, 0.052, 0.047, 2.0, 2.0),
        (0.248, 0.163, 0.036, 0.04, 0.038, 2.0, 2.0),
        (0.274, 0.181, 0.03, 0.032, 0.032, 2.0, 2.0),
        (0.29, 0.188, 0.024, 0.026, 0.026, 2.0, 2.0),
    ],
    THROAT=[((0.0, 0.186, 0.148), (0.04, 0.042, 0.034), 0.02), ((0.0, 0.2, 0.11), (0.05, 0.052, 0.042), 0.025)],
    # a round broad head, a broad muzzle shorter than the lion's
    HEAD=[
        (-0.006, 0.015, 0.0, -0.02, 0.02, 2.2, 2.0),
        (0.008, 0.025, -0.002, -0.03, 0.031, 2.5, 2.0),
        (0.024, 0.027, -0.004, -0.035, 0.035, 2.6, 2.0),
        (0.04, 0.0262, -0.007, -0.037, 0.0352, 2.6, 2.1),
        (0.054, 0.0228, -0.009, -0.0375, 0.0335, 2.7, 2.2),
        (MS(0.066), 0.0182, -0.011, -0.0355, 0.03, 2.8, 2.4),
        (MS(0.077), 0.0128, -0.012, -0.0335, 0.0268, 2.9, 2.5),
        (MS(0.087), 0.0072, -0.013, -0.03, 0.022, 2.7, 2.4),
        (MS(0.094), 0.0022, -0.013, -0.0255, 0.0168, 2.4, 2.2),
    ],
    CHEEK=((0.025, -0.018, 0.042), (0.013, 0.015, 0.02)), PAD_X=0.0102, BROW=0.0165, PADS=(0.0135, 0.012, 0.0145), CHIN=(0.01, 0.0068, 0.0115),
    NOSE=(0.0088, 0.0058, 0.0042), BRIDGE=None,
    TAIL=_TAIL, TB=_TB, TAIL_TD=0.026,
    EYE_AT=(0.0625, 0.0052, 0.016), EYE_R=0.0076, LID_W=0.007, LID_H=0.005, SLANT=0.12, SINK=0.45, MOUTH_AT=(MS(0.086), -0.028),
    EAR_B=V(0.03, 0.296, 0.186), EAR_A=[0.6, 0.78, -0.1], EAR_N=[0.45, -0.05, 0.9], EAR_L=0.02, EAR_W=0.016,
    BOX=dict(neck=((-0.095, 0.08, 0.0), (0.095, 0.35, 0.26)), head=((-0.08, 0.185, 0.14), (0.08, 0.35, 0.3)),
             eyes=((-0.042, 0.265, 0.21), (0.042, 0.32, 0.27)), ear=((-0.075, 0.28, 0.165), (0.075, 0.34, 0.22)),
             fleg=((-0.095, -0.005, 0.02), (0.095, 0.27, 0.18)), hleg=((-0.09, -0.005, -0.25), (0.09, 0.27, -0.03)),
             paws=((-0.08, -0.005, -0.2), (0.08, 0.04, 0.15)), tail=((-0.035, 0.07, -0.47), (0.035, 0.235, -0.15))),
    COAT=0.002, LOCKS=0.0006,
    SHOULDER=((0.036, 0.17, 0.108), (0.027, 0.24, 0.078), 0.025, 0.019),
    FORE_K=(1.55, 1.35), HIND_K=(1.4, 1.15),
    FLEG_X=[((0.041, 0.2, 0.118), (0.045, 0.115, 0.078), 0.032, 0.022, 0.8, 0.02), ((0.041, 0.1, 0.086), (0.04, 0.05, 0.089), 0.016, 0.012, 0.9, 0.012)],
    HIP_CUT=0.229,
    F_TOES=[(0.0068, 0.0098, 0.0078, 0.0088, 0.0), (-0.0068, 0.0098, 0.0078, 0.0088, 0.0), (0.0162, 0.0009, 0.0072, 0.008, 0.0005),
            (-0.0162, 0.0009, 0.0072, 0.008, 0.0005)],
    H_TOES=[(0.006, 0.0088, 0.007, 0.008, 0.0), (-0.006, 0.0088, 0.007, 0.008, 0.0), (0.0142, 0.0007, 0.0065, 0.0073, 0.0004),
            (-0.0142, 0.0007, 0.0065, 0.0073, 0.0004)],
    F_PAD=(0.0158, 0.0118, 0.015), H_PAD=(0.014, 0.0108, 0.0138),
    PAW_PATCHES=[(V(0.012, -0.001, 0.074), V(0.07, 0.026, 0.132), 0.0004), (V(0.014, -0.001, -0.186), V(0.07, 0.026, -0.124), 0.0004)],
    FUR={'len': 0.012, 'n': 4, 'lean': 1.3, 'tile': 0.0011, 'babyLen': 1.5, 'babyLean': 0.55, 'shade': 0.64, 'quality': 74},
    FUR_K=0.5,
    COL=dict(ground=hexc(0xB8622A), warm=hexc(0xC06C30), back=hexc(0xA4541E), cream=hexc(0xE2D6C0), white=hexc(0xECE6DA),
             dark=hexc(0x1C1612), ear=hexc(0x1A1410), earIn=hexc(0xE2D8CA), nose=hexc(0xC08474), noseDark=hexc(0x4A2E28),
             lips=hexc(0x1C1410), lid=hexc(0x18120E), pad=hexc(0x3A2A24)),
    BACK_K=0.45, STROKE=0.12, EYE_PALE=(0.55, 1.0), WSPOTS=0.9, NOSE_MOTTLE=0.15, WHISKER=0.065, EAR_SPOT=True, NO_EYERING=1,
    KITTEN=dict(c=V(0.0, 0.194, -0.035), r=(0.064, 0.058, 0.17), rb=0.082, e=2.1, maxd=0.022),
    EYE_META={'iris': 0xD49A30, 'rim': 0x5A3A10, 'pupilR': 0.34, 'babyIris': 0x8496A8, 'babyLidCol': 0x5A4636},
    META={'flat': 0xB0662C, 'rim': [0.2, 0.12, 0.06]},
    MAP_QUALITY=(52, 50), BABY_TEX=256,
)


def ruff(C_, L):
    """the ruff: long fur flaring out and back over the cheeks from below the ears to the angle of the jaw"""
    d = ellipsoid(L, V(0.035, -0.02, 0.031), V(0.014, 0.02, 0.017))
    return d - PT.locks(L, 0.002, k=(70.0, 40.0, 90.0), seed=61)


T['RUFF'] = ruff
C = PT.load(ID, T)
PT.setup(C)


def _ruffm(L):
    return sstep(0.004, -0.002, ellipsoid(L, V(0.035, -0.02, 0.031), V(0.016, 0.022, 0.019)))


def fur_x(C_, P, N, c, ln):
    """longer fur in the cheek ruff and on the belly"""
    R = C._regions(P, N, c)
    rm = _ruffm(R['L']) * R['head']
    return ln * (1 - rm) + rm * 0.01


T['FUR_X'] = fur_x


def _h(i, s):
    return _hash(i, i * 0 + 7, i * 0 + 13, s)


def _bands(ph, h, seed, w0, gmax, h_lo, h_hi):
    """tiger stripes across a coordinate ph (one group of stripes per whole number) at heights h: each group is one
    stripe or a pair that forks (the gap between the two opens toward one end), each with its own length, tapering to
    points at both ends"""
    i = np.floor(ph).astype(np.int64)
    f = ph - i
    r1, r2, r3, r4, r5 = (_h(i, seed + k) for k in range(5))
    lo = h_lo[0] + (h_lo[1] - h_lo[0]) * r4          # where the stripe ends below
    hi = h_hi[0] + (h_hi[1] - h_hi[0]) * r5          # and above
    u = np.clip((h - lo) / np.maximum(hi - lo, 1e-3), 0, 1)
    taper = np.sqrt(np.clip(np.minimum(u, 1 - u) * 4.0, 0, 1)) * (h > lo) * (h < hi)
    pair = r2 < 0.55
    fork = np.where(r3 < 0.5, u, 1 - u)
    gap = gmax * (0.45 + 0.55 * r1) * np.where(pair, sstep(0.15, 0.75, fork), 0.0)
    w = w0 * (0.75 + 0.5 * r3) * np.where(pair, 0.62, 1.0) * taper
    c0 = 0.5 + 0.12 * (r5 - 0.5)
    d = np.minimum(np.abs(f - (c0 - gap * 0.5)), np.abs(f - (c0 + gap * 0.5)))
    w = np.maximum(w, 1e-4)
    return sstep(w, w * 0.55, d) * (w > 0.004)


def stripes(R, Pm, N, P):
    """the stripe mask (cat units, mirrored points)"""
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    hd, tl, L = R['head'], R['tail'], R['L']
    up = np.clip(N[:, 1], -1, 1)
    w1 = fbm(Pm * 45, 3, 63) - 0.5
    w2 = fbm(Pm * 110, 2, 64) - 0.5
    body = (1 - hd) * (1 - tl)
    # flanks, back and neck: stripes from near the spine down the sides, leaning back lower down, thinning out on the
    # belly; they stop short of the spine (a narrow plain line along it), so none crosses it as a band
    ph = (z + 0.028 * (1 - up) + 0.012 * w1) / 0.0185
    fl = _bands(ph, up, 71, 0.19, 0.36, (-0.75, -0.2), (0.9, 1.05))
    fl = fl * sstep(0.004, 0.01, x + 0.004 * w2) * sstep(-0.215, -0.19, z) * sstep(0.17, 0.12, z)
    # the shoulders and the upper forelegs: few, short stripes (the shoulder is plainer)
    sh = np.exp(-((z - 0.09) / 0.035) ** 2) * sstep(0.12, 0.2, y) * sstep(0.95, 0.4, up)
    fl = fl * (1 - 0.65 * sh)
    # neck: stripes round from the nape down the sides of the neck
    nk = sstep(0.12, 0.15, z) * (1 - hd) * sstep(0.17, 0.2, y)
    phn = (z - 0.6 * (y - 0.2) + 0.01 * w1) / 0.016
    neck = _bands(phn, up, 77, 0.17, 0.3, (-0.6, -0.1), (0.95, 1.05)) * nk * sstep(0.003, 0.009, x)
    # the thighs: curved bands round the haunch, the lower legs nearly plain
    th = sstep(-0.03, -0.07, z) * sstep(0.07, 0.11, y) * sstep(0.0, 0.4, R['Nm'][:, 0]) * (1 - tl)
    pht = (np.hypot(y - 0.33, z + 0.33) + 0.008 * w1) / 0.017
    thb = _bands(pht, R['Nm'][:, 2] + 0.3 * w2, 83, 0.17, 0.3, (-1.0, -0.6), (0.4, 1.0)) * th
    # the legs: a few bars on the forelegs' backs and insides, more on the hind legs above the hock
    lg = sstep(0.13, 0.09, y) * sstep(0.035, 0.05, y) * (1 - tl)
    phl = (y + 0.01 * w1) / 0.017
    lgb = _bands(phl, -R['Nm'][:, 0] * 0.6 - N[:, 2] * 0.6, 87, 0.14, 0.2, (-0.6, -0.1), (0.4, 1.0)) * lg * np.where(z < 0, 0.9, 0.55)
    # the tail: rings, closer toward the black tip
    tt = R['tt']
    rings = PT_rings(tt, w1) * tl * sstep(0.12, 0.22, tt)
    tip = tl * sstep(0.88 + 0.02 * w2, 0.92, tt)
    # the head: broken bars across the forehead between the eyes, lines running back over the crown, lines back over
    # the cheeks, a line back from the outer corner of each eye
    s, u = L[:, 2], L[:, 1]
    xh = np.abs(L[:, 0])
    hw = fbm(L * 400.0, 2, 93) - 0.5
    fh = _bands((s + 0.004 * hw) / 0.0085, xh, 91, 0.3, 0.25, (-0.004, 0.002), (0.01, 0.019))
    fh = fh * sstep(0.012, 0.017, u) * sstep(0.014, 0.024, s) * sstep(0.058, 0.05, s) * hd
    cr = _bands((xh + 0.002 * hw) / 0.0075 + 0.5, s, 97, 0.17, 0.25, (-0.012, 0.0), (0.02, 0.03))
    cr = cr * sstep(0.014, 0.02, u) * hd * sstep(0.004, 0.008, xh) * (1 - R['ear'])
    ch = _bands((u + 0.6 * (s - 0.04) + 0.004 * w1) / 0.0075, s, 95, 0.17, 0.3, (0.005, 0.02), (0.045, 0.058))
    ch = ch * hd * sstep(0.022, 0.03, xh) * sstep(0.004, -0.004, u) * sstep(-0.035, -0.028, u)
    E = C.HF.loc(C.EYE.c[None, :])[0]
    el = sstep(0.0016, 0.0007, np.abs(u - E[1] + 0.002 - 0.35 * (s - E[2]))) * sstep(E[2] - 0.004, E[2] - 0.009, s) * sstep(E[2] - 0.02, E[2] - 0.015, s)
    el = el * sstep(E[0], E[0] + 0.004, xh) * hd
    m = np.maximum.reduce([fl * body, neck, thb, lgb, rings, tip, fh, cr * 0.9, ch * 0.9, el * 0.85])
    return np.clip(m * sstep(0.25, 0.45, fbm(Pm * 160, 2, 65) + 0.2), 0, 1)


def PT_rings(tt, w1):
    g = tt * C.TAIL_LEN / (0.026 - 0.008 * tt) + 0.3 * w1
    a = np.abs(g - np.round(g))
    return sstep(0.2, 0.1, a)


def white(R, Pm, N):
    """the tiger's white: the belly and the insides of the legs, the chest and throat, the cheeks and the ruff, the
    muzzle and the chin, a big spot over each eye"""
    L = R['L']
    hd = R['head']
    up = N[:, 1]
    belly = sstep(-0.3, -0.6, up) * (1 - hd) * (1 - R['tail'] * 0.6)
    inner = sstep(-0.25, -0.6, R['Nm'][:, 0]) * sstep(0.15, 0.08, Pm[:, 1]) * (1 - R['tail'])
    throat = sstep(-0.1, -0.5, N[:, 1] - 0.5 * N[:, 2]) * sstep(0.1, 0.14, Pm[:, 2]) * (1 - hd)
    cheek = _ruffm(L) * hd + sstep(-0.02, -0.026, L[:, 1]) * sstep(0.03, 0.045, L[:, 2]) * hd * sstep(0.018, 0.026, np.abs(L[:, 0]))
    E = C.HF.loc(C.EYE.c[None, :])[0]
    spot = sstep(0.0062, 0.003, np.linalg.norm((L - (E + V(-0.002, 0.0098, -0.003))) / V(1.0, 0.7, 1.0), axis=1)) * hd
    tail_under = R['tail'] * sstep(-0.1, -0.6, N[:, 1]) * sstep(0.85, 0.7, R['tt'])
    return np.clip(np.maximum.reduce([belly, inner * 0.9, throat * 0.85, cheek * 0.9, spot, tail_under * 0.7]), 0, 1)


def pattern(C_, R, P, N, col, under):
    Pm = R['Pm']
    wt = white(R, Pm, N)
    col = mix(col, C.T['COL']['white'], wt * 0.9)
    st = stripes(R, Pm, N, P)
    n2 = fbm(Pm * 140, 3, 12)
    col = mix(col, hexc(0x3A2416), sstep(0.05, 0.45, st) * 0.6)
    col = mix(col, hexc(0x141010) * (0.9 + 0.2 * n2[:, None]), sstep(0.35, 0.85, st) * 0.95)
    return col


T['pattern'] = pattern


PT.install(globals(), C, KS)
# cubs wear the grown-up's coat (a cub's stripes are the same; its fluff is the longer fur shells): no cub color map,
# which would cost the page as much again for the stripes
del baby_paint
