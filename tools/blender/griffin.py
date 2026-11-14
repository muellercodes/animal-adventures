# The griffin (round 13): the front half of a golden eagle and the back half of a lion, on the lion's big-cat template
# (panthera.py, bigcat.py: the house cat's skeleton at KS = 3.8, about 2.4 m from the beak to the tip of the tail).
# - The lion's trunk, hindquarters, hind legs and paws and its tail with the dark tuft, in a short tawny coat (fur
#   shells), pale underneath.
# - The eagle's head (eagle.py's bald eagle head, bill, brow and eyes, scaled by SE): a flat crown, a heavy brow over a
#   fierce amber eye, the big hooked beak (yellow at the base, dark at the hook) on a yellow cere, and two short pointed
#   tufts of feathers on the ear bones. Golden eagle colors: dark golden-brown, a golden crown and nape.
# - The raised, thick, feathered neck, the feathered chest and shoulders, ending in a ruff: a layer of feathers whose
#   pointed tips lie over the tawny fur (sculpted lip and tips, longer fur just behind it, the colors running into each
#   other), so the join looks grown.
# - Eagle legs in front: feathered trousers down the upper leg ending in a shaggy hem, then a bare yellow tarsus with
#   scutes, a big eagle foot (three toes forward, one back) with black curved talons, set on the cat's front leg bones.
# - The feathered wing arm (bird.wing_arm) from the shoulders, spread in the rest pose, weighted to the birds' wing bones
#   (as wingcat.py), and the feather atlas the game cuts the wing blades from: golden-brown coverts, long separated
#   fingered primaries, barred paler undersides.
# - The chick-cub: the cat's round little body (baby offsets), the ruff and the wing arm pulled in, pale down on the
#   eagle half (painted, and fur shells: the down is shells the grown-up does not draw, FUR babyMask), a woolly spotted
#   tawny coat behind, a dark beak with a yellow gape.
# The game's skeleton is SPEC.griffin (40_animals.js, GRIF): the same bone positions in cat units, keep them together.
# Make it with: VOXEL=0.0088 TRIS=4000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py griffin
import os, sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, sweep, fbm, vnoise, worley, length, _hash
import carnivore as CV
from carnivore import mirror, mix, hexc
import panthera as PT
import bird as B
import eagle as EG

KS = 3.8
ID = 'griffin'
# the eagle's head (eagle.py, its head bone at EH) on the griffin's head bone (HEAD_B, cat units), times SE in meters
SE = 2.8
RE = SE / KS                     # eagle meters to cat units
EH = V(0.0, 0.37, 0.2)
HEAD_B = V(0.0, 0.318, 0.2)
NECK_B, NECK2_B = V(0.0, 0.225, 0.15), V(0.0, 0.272, 0.178)


def to_eagle(Q):
    return ((Q - HEAD_B) / RE + EH).astype(F)


def from_eagle(E):
    return ((np.asarray(E, F) - EH) * RE + HEAD_B).astype(F)


# the wing (the game's bones: griffinWing, the eagle's wing times WG on the chest): shoulder pivot, humerus, forearm, hand
WSH = V(0.03, 0.25, 0.09)
WG = 2.33
ARM = tuple(v * WG / KS for v in (0.16, 0.2, 0.15))
WPTS = [WSH, WSH + V(ARM[0], 0, 0), WSH + V(ARM[0] + ARM[1], 0, 0), WSH + V(sum(ARM), 0, 0)]
WCHORD = [v * WG / KS for v in (0.082, 0.078, 0.062, 0.02)]
WTHICK = [v * WG / KS for v in (0.024, 0.019, 0.015, 0.006)]
WBOX = ((-0.37, 0.222, 0.03), (0.37, 0.278, 0.15))
ROOT = (0.042, 0.068)            # x over which the arm's skin blends from the shoulders onto the wing bones

# the eye (eagle.py's, 12% bigger, a little further out under the brow, on the griffin's head; eagle space EK)
EK = 1.12
EYE_E = EG.EYE_C + V(0.0008, -0.0004, 0.0)
EYE_C = from_eagle(EYE_E)
EYE_R = EG.EYE_R * EK * RE
# the feather tufts on the ear bones: base, axis, the flat side's normal, length, half width
TUFT_B = V(0.0164, 0.351, 0.184)
TUFT_A = nrm([0.26, 0.6, -0.76])
TUFT_N = nrm([0.94, -0.08, 0.33])
TUFT_L, TUFT_W = 0.034, 0.0088
# the front feet: eagle feet on the cat's front paw bones (FOOT at the toes' root, under fpaw), eagle.py's toes times FK
FK = 3.3 / KS
FOOT = V(0.038, 0.012, 0.097)
TOES = [dict(a=-32, len=0.042 * FK, r=0.0098 * FK, r1=0.0074 * FK, claw=0.029 * FK, clawR=0.0068 * FK, clawDrop=0.5, n=2),
        dict(a=2, len=0.053 * FK, r=0.0102 * FK, r1=0.0076 * FK, claw=0.031 * FK, clawR=0.007 * FK, clawDrop=0.5, n=3),
        dict(a=36, len=0.042 * FK, r=0.0098 * FK, r1=0.0074 * FK, claw=0.028 * FK, clawR=0.0067 * FK, clawDrop=0.5, n=2),
        dict(a=180, len=0.032 * FK, r=0.0104 * FK, r1=0.008 * FK, claw=0.034 * FK, clawR=0.0072 * FK, clawDrop=0.5, lift=0.004 * FK, n=2)]
# the feathered trousers end in a hem at HEM (height); the bare tarsus runs from inside them down to the foot
HEM = 0.068
TARSUS = [V(0.039, 0.084, 0.08), V(0.038, 0.03, 0.09), V(0.038, 0.018, 0.097)]
TARSUS_R = [0.0108, 0.0096, 0.0102]
# the back edge of the feathers on the trunk (the ruff): z of the edge at a height y
def edge_z(y):
    return 0.044 + 0.13 * (0.25 - y)


# the raised, thick neck: path (y, z), top, bottom, half width (cat units)
_NECK = [(0.2, 0.09, 0.06, 0.064, 0.058, 2.0, 2.0), (0.232, 0.14, 0.052, 0.054, 0.047, 2.0, 2.0), (0.268, 0.166, 0.043, 0.045, 0.039, 2.0, 2.0),
         (0.3, 0.184, 0.037, 0.037, 0.034, 2.0, 2.0), (0.322, 0.194, 0.032, 0.03, 0.03, 2.0, 2.0)]

# the lion's tables (lion.py), with the griffin's neck, the bigger bounds and boxes
_TAIL = [(0.207, -0.185, 0.0128), (0.201, -0.205, 0.0122), (0.188, -0.232, 0.0115), (0.17, -0.258, 0.0108), (0.149, -0.282, 0.0102),
         (0.127, -0.303, 0.0097), (0.106, -0.321, 0.0093), (0.088, -0.336, 0.0096), (0.074, -0.349, 0.0124), (0.064, -0.36, 0.0134),
         (0.057, -0.37, 0.0114), (0.053, -0.378, 0.0055)]
_TB = {'tail1': V(0, 0.205, -0.19), 'tail2': V(0, 0.175, -0.251), 'tail3': V(0, 0.118, -0.311)}
MSK = 1.3
T = dict(
    MS=MSK,
    HF=CV.Frame(V(0.0, 0.292, 0.178), V(0.0, -0.28, 1.0), V(0.0, 1.0, 0.0)), DROP=(0.38, 0.05),
    BOUNDS=(V(-0.37, 0.0, -0.4), V(0.37, 0.395, 0.29)),
    TRUNK=[
        (-0.205, 0.218, 0.198, 0.178, 0.022, 2.0, 2.0),
        (-0.19, 0.229, 0.199, 0.166, 0.042, 2.1, 2.0),
        (-0.16, 0.236, 0.2, 0.156, 0.053, 2.2, 2.0),
        (-0.12, 0.24, 0.2, 0.153, 0.054, 2.3, 2.0),
        (-0.08, 0.242, 0.199, 0.143, 0.054, 2.3, 2.0),
        (-0.03, 0.244, 0.197, 0.134, 0.055, 2.3, 2.0),
        (0.02, 0.246, 0.195, 0.12, 0.058, 2.3, 2.0),
        (0.06, 0.249, 0.193, 0.112, 0.058, 2.3, 2.0),
        (0.1, 0.25, 0.192, 0.114, 0.053, 2.2, 2.0),
        (0.125, 0.244, 0.192, 0.124, 0.046, 2.1, 2.0),
        (0.14, 0.234, 0.192, 0.14, 0.035, 2.0, 2.0),
    ],
    NECK=_NECK,
    THROAT=[((0.0, 0.18, 0.13), (0.045, 0.05, 0.04), 0.025)],
    HEAD=[
        (-0.006, 0.015, 0.0, -0.02, 0.019, 2.2, 2.0), (0.008, 0.024, -0.002, -0.03, 0.03, 2.5, 2.0), (0.024, 0.0255, -0.004, -0.035, 0.0335, 2.6, 2.0),
        (0.04, 0.025, -0.007, -0.037, 0.0335, 2.7, 2.1), (0.054, 0.0225, -0.009, -0.038, 0.031, 2.8, 2.2),
    ],
    CHEEK=((0.022, -0.018, 0.042), (0.0105, 0.013, 0.019)), PAD_X=0.0102, BROW=0.0165, PADS=(0.0135, 0.0122, 0.015), CHIN=(0.0098, 0.007, 0.012),
    NOSE=(0.0098, 0.0064, 0.0045), BRIDGE=None,
    TAIL=_TAIL, TB=_TB, TAIL_TD=0.025,
    EYE_AT=(0.0635, 0.005, 0.0158), EYE_R=0.0074, LID_W=0.0068, LID_H=0.0049, SLANT=0.1, SINK=0.45, MOUTH_AT=(0.09, -0.028),
    EAR_B=TUFT_B, EAR_A=list(TUFT_A), EAR_N=list(TUFT_N), EAR_L=TUFT_L, EAR_W=TUFT_W,
    BOX=dict(neck=((-0.125, 0.07, 0.0), (0.125, 0.39, 0.27)), head=((-0.07, 0.29, 0.13), (0.07, 0.385, 0.285)),
             eyes=((-0.045, 0.32, 0.19), (0.045, 0.36, 0.245)), ear=((-0.06, 0.325, 0.14), (0.06, 0.395, 0.215)),
             fleg=((-0.1, -0.005, 0.02), (0.1, 0.27, 0.18)), hleg=((-0.09, -0.005, -0.25), (0.09, 0.27, -0.03)),
             paws=((-0.1, -0.005, -0.2), (0.1, 0.045, 0.175)), tail=((-0.04, 0.03, -0.4), (0.04, 0.235, -0.15))),
    COAT=0.002, LOCKS=0.0006,
    SHOULDER=((0.034, 0.17, 0.108), (0.026, 0.232, 0.08), 0.024, 0.017),
    FORE_K=(1.45, 1.38), HIND_K=(1.42, 1.16),
    FLEG_X=[((0.041, 0.2, 0.118), (0.045, 0.115, 0.078), 0.034, 0.023, 0.8, 0.02)],
    HIP_CUT=0.232,
    F_TOES=[(0.0068, 0.0098, 0.0078, 0.0088, 0.0)], F_PAD=(0.0158, 0.0118, 0.015),
    H_TOES=[(0.006, 0.0088, 0.007, 0.008, 0.0), (-0.006, 0.0088, 0.007, 0.008, 0.0), (0.0142, 0.0007, 0.0065, 0.0073, 0.0004),
            (-0.0142, 0.0007, 0.0065, 0.0073, 0.0004)],
    H_PAD=(0.014, 0.0108, 0.0138),
    PAW_PATCHES=[(V(0.0, -0.001, 0.05), V(0.085, 0.034, 0.165), 0.00042), (V(0.014, -0.001, -0.186), V(0.07, 0.026, -0.124), 0.0005)],
    FUR={'len': 0.02, 'n': 5, 'lean': 1.1, 'tile': 0.0011, 'babyLen': 1.0, 'babyLean': 0.4, 'shade': 0.62, 'quality': 60},
    FUR_K=0.42,
    COL=dict(ground=hexc(0xB4884E), warm=hexc(0xBC9058), back=hexc(0x9A7444), cream=hexc(0xD6C29C), white=hexc(0xE8DEC8),
             dark=hexc(0x2A1E16), ear=hexc(0x2C221A), earIn=hexc(0xC8B094), nose=hexc(0x6A4038), noseDark=hexc(0x221816),
             lips=hexc(0x221812), lid=hexc(0x1C140E), pad=hexc(0x3A2A24)),
    BACK_K=0.5, STROKE=0.2, EYE_PALE=(0.0, 0.0), WSPOTS=0.0, NOSE_MOTTLE=0.6, WHISKER=0.06,
    KITTEN=dict(c=V(0.0, 0.196, -0.035), r=(0.07, 0.066, 0.165), rb=0.088, e=2.1, maxd=0.028),
    EYE_META={'iris': 0xC4842A, 'rim': 0x6A4A20, 'pupilR': 0.34, 'babyIris': 0x2A2018, 'babyLidCol': 0x9A9080},
    META={'flat': 0x6A5236, 'rim': [0.14, 0.1, 0.06]},
    MAP_QUALITY=(56, 44), BABY_TEX=256,
)
C = PT.load(ID, T)
PT.setup(C)
# the lion's tail tuft (lion.py): long dark hair at the end of the tail
def _tuft_fur(C_, P, N, c, ln):
    R = C._regions(P, N, c)
    tf = R['tail'] * sstep(0.8, 0.86, R['tt'])
    return ln * (1 - tf) + tf * 0.02


T['FUR_X'] = _tuft_fur
T['tail_tip'] = lambda C_, R, col: mix(col, hexc(0x221812), R['tail'] * sstep(0.8, 0.86, R['tt']))
_trunk0, _fleg0, _flow0, _keep0, _fix_weights0, _baby_offset0, _regions0, _fur0 = C.trunk, C.fleg, C.flow, C.keep, C.fix_weights, C.baby_offset, C._regions, C.fur
_paws0, _lowpoly_fix0, _meta0 = C.paws, C.lowpoly_fix, C.meta


class _EagleEye:
    """the eye in cat units, as the cat's code reads it (center, radius, gaze, lid opening)"""
    def __init__(self):
        self.c = EYE_C.copy()
        self.r = float(EYE_R)
        self.d = nrm(EG.EYE_DIR)
        self.up = nrm(np.array([0, 1, 0], F) - self.d * self.d[1])
        self.side = np.cross(self.up, self.d)
        self.lid_w = self.lid_h = float(EG.LID_R * EK * RE)
        self.off, self.slant = 0.0, 0.0

    def loc(self, Q):
        D = Q - self.c
        return np.stack([D @ self.side, D @ self.up, D @ self.d], 1)

    def meta(self):
        return [round(float(v), 5) for v in self.c], round(self.r, 5), [round(float(v), 4) for v in self.d], [0.58, -0.84, 0.12]


C.EYE = _EagleEye()


# ---------- the eagle's head, the tufts ----------
def head(P):
    """the eagle's head (eagle.py: the flat-crowned skull, the brow ridge, the hooked beak and the cere), cat units"""
    E = to_eagle(mirror(P))
    h = EG.head(E)
    h = smin(h, brow_e(E), 0.009)
    h = smin(h, EG.beak(E), 0.005)
    return (h * RE).astype(F)


def brow_e(E):
    """the heavy brow ridge over the eye (eagle space): eagle.py's, heavier and a little further out, so it shades the
    eye from above (the fierce look)"""
    Q = mirror(E)
    from sdf import chain
    return chain(Q, [V(0.025, 0.4135, 0.207), V(0.0345, 0.4138, 0.2225), V(0.0358, 0.4118, 0.2385), V(0.0275, 0.4068, 0.2515)],
                 [0.0056, 0.0072, 0.0068, 0.0044], 0.003)


def eye_e(E):
    """eagle.py's eye parts, the eye EK times bigger: carve (the round opening), lids (the bare skin ring), ball"""
    Q = mirror(E)
    D = Q - EYE_E
    s, u, g = D @ EG.EYE_SIDE, D @ EG.EYE_UP, D @ EG.EYE_DIR
    L = np.stack([s, u, g], 1)
    r = EG.EYE_R * EK
    lids = ellipsoid(L, V(0.0, 0.0, -0.0015), V(r + 0.0022, r + 0.002, r + 0.0008))
    ap = np.sqrt(s * s + (u * 1.05) ** 2) - EG.LID_R * EK
    carve = smax(ap, -(g + 0.0012), 0.0007)
    ball = length(D) - r * 0.92
    return carve, lids, ball


def beak(P):
    return (EG.beak(to_eagle(mirror(P))) * RE).astype(F)


def brow(P):
    return (brow_e(to_eagle(mirror(P))) * RE).astype(F)


def eye_parts(P):
    ca, li, ba = eye_e(to_eagle(mirror(P)))
    return ca * RE, li * RE, ba * RE


def ear(P):
    """a short pointed tuft of feathers standing up and back from each side of the crown, a little cupped, its tip
    split into a few feather points"""
    Q = mirror(P)
    a, c, n = CV.ear_coords(Q, TUFT_B, TUFT_A, TUFT_N)
    u = np.clip(a / TUFT_L, 0, 1)
    hw = TUFT_W * np.clip(1 - u, 0, 1) ** 0.75 * (0.7 + 0.3 * np.sqrt(np.clip(u * 5, 0, 1))) + 0.0005
    # feather points along the upper edge: the width notched where the feathers part
    hw = hw * (1 - 0.22 * sstep(0.35, 0.9, u) * sstep(0.3, 0.8, np.abs(np.sin(c / max(TUFT_W, 1e-4) * 3.4 + u * 2.0))))
    bend = 0.004 * u * u - 0.0016 * (c / TUFT_W) ** 2
    th = 0.0032 * (1 - u) + 0.0012 * u
    d = smax(smax(np.abs(c) - hw, np.abs(n - bend) - th, 0.0012), np.maximum(-a, a - TUFT_L), 0.002)
    return smin(d, ellipsoid(Q, TUFT_B - TUFT_A * 0.004, V(0.008, 0.006, 0.008)), 0.005)


# ---------- neck, ruff and the feathered chest ----------
def _tip_rows(Q, row):
    """one row of the ruff's big feathers: how far in front of the row's tips a point is (> 0 on the row), the tips
    pointing back, each feather a little longer or shorter than its neighbours"""
    y, z = Q[:, 1], Q[:, 2]
    th = np.arctan2(Q[:, 0], y - 0.19)
    w = 0.25 * (fbm(Q * V(30.0, 30.0, 30.0), 2, 61 + row) - 0.5)
    u = th * 5.5 + w + 0.5 * row
    k = np.floor(u)
    tips = np.abs((u - k) - 0.5) * 2.0
    ln = 0.008 + 0.007 * _hash(k.astype(np.int64), np.full(len(Q), row, np.int64), np.zeros(len(Q), np.int64), 67)
    return z - edge_z(y) - 0.013 * row + ln * (1 - tips) ** 1.5 + 0.003 * (fbm(Q * 60.0, 2, 62 + row) - 0.5)


def feather_edge(Q):
    """signed distance-like coordinate across the back edge of the feathers on the trunk (> 0 in front, on the feathers),
    the edge cut into the pointed tips of the last row of feathers"""
    return _tip_rows(Q, 0)


def ruff_t(Q):
    """the feather coat's thickness over the trunk: a little over the chest, more in the ruff round the base of the neck
    and over the shoulders, nothing behind the edge; the last two rows of big feathers each lie a little over the next,
    so their tips make small steps"""
    on = sstep(-0.0012, 0.0012, _tip_rows(Q, 0))
    on2 = sstep(-0.0012, 0.0012, _tip_rows(Q, 1))
    sh = np.exp(-(((Q[:, 1] - 0.235) / 0.03) ** 2 + ((Q[:, 2] - 0.085) / 0.05) ** 2))
    return (on * (0.0022 + 0.004 * sh) + on2 * 0.0014).astype(F)


def trunk(P):
    Q = mirror(P)
    d = _trunk0(P)
    # a full, round breast between the front legs
    d = smin(d, ellipsoid(Q, V(0.0, 0.165, 0.118), V(0.045, 0.052, 0.04)), 0.025)
    return d - ruff_t(Q) - PT.locks(Q, 0.0012, k=(70.0, 40.0, 50.0), seed=63) * sstep(-0.002, 0.004, feather_edge(Q))


def neck(P):
    """the raised neck, thick with feathers, the golden hackles on the nape a little ragged"""
    Q = mirror(P)
    d = sweep(Q, _NECK) - T['COAT']
    for c, r, k in T['THROAT']:
        d = smin(d, ellipsoid(Q, V(*c), V(*r)), k)
    # the ruff round the base of the neck
    d = smin(d, ellipsoid(Q, V(0.0, 0.226, 0.128), V(0.058, 0.04, 0.048)), 0.03)
    return d - PT.locks(Q, 0.0012, k=(90.0, 40.0, 70.0), seed=64)


# ---------- the eagle's legs and feet in front ----------
def tarsus(P):
    Q = mirror(P)
    a = round_cone(Q, TARSUS[0], TARSUS[1], TARSUS_R[0], TARSUS_R[1])
    return smin(a, round_cone(Q, TARSUS[1], TARSUS[2], TARSUS_R[1], TARSUS_R[2]), 0.004)


def trousers(Q):
    """the feathered trousers: a full sheath round the forearm, flaring a little, ending in a shaggy hem"""
    d = round_cone(Q, V(0.04, 0.122, 0.08), V(0.039, HEM + 0.008, 0.083), 0.024, 0.0175)
    ang = np.arctan2(Q[:, 0] - 0.039, Q[:, 2] - 0.083)
    hem = HEM - 0.008 * (1 - np.abs(((ang * 1.1 + 0.25 * fbm(Q * 90.0, 2, 65)) % 1.0) - 0.5) * 2.0) ** 1.5 - 0.003 * (fbm(Q * 140.0, 2, 66) - 0.5)
    return smax(d, hem - Q[:, 1], 0.003)


def fleg_up(P):
    """the feathered upper leg: the lion's upper arm and forearm cut off above the hem, and the trousers"""
    Q = mirror(P)
    up = smax(_fleg0(P), HEM + 0.02 - Q[:, 1], 0.012)
    return smin(up, trousers(Q), 0.012)


def fleg(P):
    return smin(fleg_up(P), tarsus(P), 0.004)


def feet(P):
    """the eagle's feet: the toes on a pad under the foot, the talons (cat units)"""
    Q = mirror(P)
    tt, cl, _ = B.toes(Q, FOOT, TOES)
    pad = ellipsoid(Q, FOOT + V(0.0, -0.0005, 0.0015), V(0.016 * FK, 0.0095 * FK, 0.017 * FK))
    return smin(tt, pad, 0.004), cl


def paws(P):
    """the lion's hind paws and the eagle's front feet; the talons are part of the shape, returned as the claws too"""
    Q = mirror(P)
    b, _ = CV.paw(Q, C.PAW_H, T['H_TOES'], pad=T['H_PAD'], claw=None, yaw=0.04)
    f, cl = feet(P)
    f = smin(f, cl, 0.0008)
    return np.minimum(b - 0.001, f), cl


def paws_soft(P):
    """the paws and feet without the talons (for the part masks)"""
    Q = mirror(P)
    b, _ = CV.paw(Q, C.PAW_H, T['H_TOES'], pad=T['H_PAD'], claw=None, yaw=0.04)
    return np.minimum(b - 0.001, feet(P)[0])


# ---------- the wing arm ----------
def warm(P):
    Q = mirror(P)
    return B.wing_arm(Q, WPTS, WCHORD, WTHICK, lead=0.62)


C.head, C.eye_parts, C.ear, C.trunk, C.neck, C.fleg, C.paws = head, eye_parts, ear, trunk, neck, fleg, paws
_shape0, _parts0 = C.shape, C.parts


def skull(P):
    return (EG.head(to_eagle(mirror(P))) * RE).astype(F)


def parts(P):
    c = _parts0(P)
    c['skull'] = CV.local(P, *T['BOX']['head'], skull)
    c['beak'] = CV.local(P, *T['BOX']['head'], beak)
    c['brow'] = CV.local(P, *T['BOX']['head'], brow)
    c['tars'] = CV.local(P, *T['BOX']['fleg'], tarsus)
    c['fleg'] = CV.local(P, *T['BOX']['fleg'], fleg_up)
    c['paw'] = CV.local(P, *T['BOX']['paws'], paws_soft)
    c['warm'] = CV.local(P, *WBOX, warm)
    return c


def shape(P):
    return smin(_shape0(P), CV.local(P, *WBOX, warm), 0.012)


C.parts, C.shape = parts, shape


def grid(h):
    """finer steps across the tufts, round the beak and the eyes and down at the toes and talons; coarse steps out
    along the wing (it changes slowly along its span) and fine ones across its thickness"""
    from sdf import axis_steps
    lo, hi = C.BOUNDS
    xs = axis_steps(0.0, hi[0], [(0.0, 0.045, h * 0.6), (0.095, hi[0], h * 2.2)], h)
    ys = axis_steps(lo[1], hi[1], [(lo[1], 0.022, h * 0.45), (0.236, 0.264, h * 0.6), (0.32, 0.395, h * 0.6)], h)
    zs = axis_steps(lo[2], hi[2], [(0.04, 0.16, h * 0.7), (0.165, 0.285, h * 0.55)], h)
    return xs, ys, zs


C.grid = grid
C.BOUNDS = T['BOUNDS']
HPAT = (from_eagle(V(0.0, 0.33, 0.17)) * V(0, 1, 1) + V(0.0, 0.0, 0.0), from_eagle(V(0.062, 0.445, 0.31)))
C.PATCHES = [(HPAT[0], HPAT[1], 0.0005), (V(0.006, 0.335, 0.165), V(0.04, 0.392, 0.205), 0.0005)] + T['PAW_PATCHES']
C.PREVIEW = {
    'side': ((1.6, 0.22, -0.05), (0, 0.19, -0.05), 32),
    'front3q': ((0.95, 0.55, 1.0), (0, 0.19, 0.0), 34),
    'front': ((0.0, 0.3, 1.5), (0, 0.2, 0.0), 30),
    'rear3q': ((-0.85, 0.6, -1.0), (0, 0.19, -0.1), 32),
    'top': ((0.01, 1.8, -0.05), (0, 0.19, -0.05), 40),
    'face': ((0.16, 0.37, 0.48), (0, 0.34, 0.22), 22),
    'faceside': ((0.42, 0.35, 0.22), (0.0, 0.345, 0.21), 24),
    'head3q': ((0.3, 0.4, 0.42), (0, 0.34, 0.21), 24),
    'feet': ((0.3, 0.07, 0.32), (0.04, 0.03, 0.09), 26),
    'ruff': ((0.6, 0.35, 0.2), (0.0, 0.2, 0.05), 30),
}


# ---------- which part a point is on, the eagle's masks ----------
OWN_KEYS = ['trunk', 'neck', 'skull', 'brow', 'beak', 'lids', 'ball', 'ear', 'fleg', 'tars', 'paw', 'claw', 'hleg', 'tail', 'warm']


def _own(c):
    D = np.stack([c[k] for k in OWN_KEYS], 1)
    o = np.argmin(D, 1)
    return {k: (o == i).astype(F) for i, k in enumerate(OWN_KEYS)}


def arm_mask(Q):
    """1 on the feathered wing arm (out from the shoulder), 0 on the body (geometry only, mirrored points)"""
    return (sstep(ROOT[0], ROOT[1], Q[:, 0]) * sstep(0.218, 0.226, Q[:, 1]) * sstep(0.032, 0.04, Q[:, 2]) * sstep(0.148, 0.14, Q[:, 2])).astype(F)


_mcache = {}


def masks(P, N, c):
    """per point masks (cat units): fe feathers, bill, cere, lid skin, tars (yellow scaly skin: tarsus and toes), talon,
    tuft, arm, head (the eagle's head), front (the eagle's half), edge (the ruff's last row) and the parts' own"""
    key = (len(P), float(P[:7].sum()), float(N[:5].sum()))
    if key in _mcache:
        return _mcache[key]
    Q = mirror(P)
    R = _own(c)
    y, z = Q[:, 1], Q[:, 2]
    fe_trunk = sstep(-0.0012, 0.0012, feather_edge(Q))
    front_foot = (z > 0.03).astype(F)
    tars = np.clip(R['tars'] + R['paw'] * front_foot, 0, 1)
    talon = R['claw'] * front_foot
    head = np.clip(R['skull'] + R['brow'] + R['beak'] + R['lids'] + R['ball'], 0, 1)
    fe = np.clip(R['neck'] + R['skull'] + R['brow'] + R['ear'] + R['warm'] + R['trunk'] * fe_trunk + R['fleg'], 0, 1)
    # the wing arm's root: feathers over the shoulder fur
    fe = np.maximum(fe, arm_mask(Q) * (1 - R['hleg']))
    M = dict(R, fe=fe.astype(F), bill=R['beak'], tars=tars.astype(F), talon=talon.astype(F), tuft=R['ear'], arm=np.maximum(R['warm'], arm_mask(Q)),
             head=head.astype(F), lid=R['lids'], fe_trunk=fe_trunk.astype(F),
             edge=(sstep(-0.001, 0.002, feather_edge(Q)) * sstep(0.012, 0.0, feather_edge(Q)) * R['trunk']).astype(F),
             behind=(sstep(0.0, -0.002, feather_edge(Q)) * sstep(-0.022, -0.004, feather_edge(Q)) * R['trunk']).astype(F))
    _mcache.clear()
    _mcache[key] = M
    return M


# ---------- the lie of the feathers and the coat ----------
def eagle_flow(Q, M):
    """the direction the feathers point (toward their tips), mirrored points: back from the beak over the head, down
    and back over the neck, down the chest, back over the shoulders, down the trousers, back over the wing arm"""
    n = len(Q)
    y, z = Q[:, 1], Q[:, 2]
    fl = np.zeros((n, 3), F)
    # neck and chest: down and back, more down on the breast
    fl[:, 1] = -1.0
    fl[:, 2] = -0.55 + 0.4 * sstep(0.2, 0.15, y)
    fl[:, 0] = 0.15
    # the head: back from the beak, a little down at the sides
    hd = np.clip(M['head'] + M['tuft'] * 0.0, 0, 1) * sstep(0.31, 0.33, y)
    fl = fl * (1 - hd)[:, None] + np.stack([0.1 * np.ones(n), -0.15 * np.ones(n), -1.0 * np.ones(n)], 1) * hd[:, None]
    # the shoulders and the back of the ruff: back along the body
    sh = M['trunk'] * sstep(0.18, 0.22, y)
    fl = fl * (1 - sh)[:, None] + np.stack([0.2 * np.ones(n), -0.3 * np.ones(n), -1.0 * np.ones(n)], 1) * sh[:, None]
    # the tufts: up along them
    tf = M['tuft']
    fl = fl * (1 - tf)[:, None] + TUFT_A[None, :] * tf[:, None]
    # the trousers: down the leg
    lg = M['fleg']
    fl = fl * (1 - lg)[:, None] + np.stack([0.0 * np.ones(n), -1.0 * np.ones(n), 0.05 * np.ones(n)], 1) * lg[:, None]
    # the wing arm: back toward the trailing edge and out along the span
    ar = M['arm']
    fl = fl * (1 - ar)[:, None] + np.tile(nrm(V(0.35, 0.0, -1.0)), (n, 1)) * ar[:, None]
    return fl / np.maximum(np.linalg.norm(fl, axis=1, keepdims=True), 1e-9)


def flow(P, N=None):
    f = _flow0(P, N)
    if N is None:
        return f
    c = C.parts(P)
    M = masks(P, N, c)
    Q = mirror(P)
    fe = M['fe']
    ef = eagle_flow(Q, M)
    ef[:, 0] *= np.sign(P[:, 0] + 1e-12)
    f = f * (1 - fe)[:, None] + ef * fe[:, None]
    return (f / np.maximum(np.linalg.norm(f, axis=1, keepdims=True), 1e-9)).astype(F)


_pcache = {}


def _plumage(P, N, M):
    key = (len(P), float(P[:7].sum()))
    if key not in _pcache:
        Q = mirror(P)
        Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
        fl = eagle_flow(Q, M)
        y = Q[:, 1]
        # feather sizes (cat units): small on the head and the tufts, bigger down the neck, big over the shoulders and
        # the chest, longest in the ruff; small on the trousers and the wing arm's leading edge
        sz = np.interp(y, [0.2, 0.26, 0.3, 0.33], [0.012, 0.0085, 0.0062, 0.0045]).astype(F)
        sz = sz * (1 - M['head']) + M['head'] * 0.0033
        sz = sz * (1 - M['tuft']) + M['tuft'] * 0.0036
        sz = sz * (1 - M['fleg']) + M['fleg'] * 0.0062
        sz = sz * (1 - M['arm']) + M['arm'] * (0.0055 + 0.004 * sstep(0.06, 0.2, Q[:, 0]))
        sz = sz * (1 + 0.3 * M['edge'])

        def fshape(X):
            k = len(X)
            # pointed hackles on the neck and in the ruff, rounder feathers elsewhere
            pt = np.clip(M['neck'] + M['edge'] * 1.0 + M['trunk'] * sstep(0.2, 0.24, y), 0, 1)
            return np.ones(k, F) * (1 - 0.2 * pt), (0.85 - 0.6 * pt).astype(F), (1.05 + 0.35 * pt).astype(F)
        _pcache.clear()
        _pcache[key] = B.plumage(Q, Nm, fl, sz, fshape, seed=23)
    return _pcache[key]


# ---------- colors ----------
KE = {
    'brown': hexc(0x3C2918), 'brownHi': hexc(0x56402A), 'brownDk': hexc(0x22170C), 'edge': hexc(0x6E5434),
    'gold': hexc(0xB07C38), 'goldHi': hexc(0xCC9A50), 'goldDk': hexc(0x845A26), 'face': hexc(0x2C1E10),
    'tip': hexc(0x9C7444), 'trouser': hexc(0x6A4C2C), 'cover': hexc(0x6A4E30),
    'cere': hexc(0xE0A820), 'billBase': hexc(0xC89A38), 'bill': hexc(0x6A6660), 'billTip': hexc(0x1C1A1A), 'gape': hexc(0xD8A428),
    'foot': hexc(0xCC9A2C), 'footDk': hexc(0x8A6418), 'talon': hexc(0x141110), 'lid': hexc(0x3A3430),
    'ruff': hexc(0x7A5630), 'ruffTip': hexc(0xA88050), 'furJoin': hexc(0x8C6A40),
}
_lion_coat = C.paint


def eagle_paint(P, N, c, col, rough):
    M = masks(P, N, c)
    Q = mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    n = len(P)
    on = np.clip(M['fe'] + M['bill'] + M['lid'] + M['tars'] + M['talon'], 0, 1) > 0.001
    if not on.any():
        return col, rough
    out, ro = col.copy(), rough.copy()
    ix = np.where(on)[0]
    Mo = {k: v[ix] for k, v in M.items()}
    Qo, No, Po = Q[ix], Nm[ix], P[ix]
    pl = _plumage(Po, N[ix], Mo)
    yo, zo = Qo[:, 1], Qo[:, 2]
    k = len(ix)
    n1 = fbm(Qo * 30, 3, 11)
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-5)
    relb = np.abs(pl['b']) / np.maximum(pl['w'], 1e-6)
    mid = sstep(0.0006, 0.003, np.abs(Qo[:, 0])) * pl['cov']
    # dark golden-brown, each feather a shade of its own, darker toward its base, a paler worn edge at the tip
    f = mix(np.tile(KE['brown'], (k, 1)), KE['brownHi'], (fid - 0.4) * 0.5 + sstep(0.2, 0.9, No[:, 1]) * 0.12)
    f = mix(f, KE['brownDk'], sstep(0.45 * cfa, 1.4 * cfa, -pl['a']) * 0.4 * mid)
    # the golden crown and nape: the back of the head and down the back of the neck, the hackles' tips gold
    back = sstep(0.1, -0.5, No[:, 2]) * sstep(-0.3, 0.3, No[:, 1] + 0.2)
    gold = np.clip(sstep(0.335, 0.35, yo) * sstep(0.215, 0.195, zo) + back * sstep(0.25, 0.3, yo) * Mo['neck'] + sstep(0.2, 0.18, zo) * sstep(0.35, 0.36, yo), 0, 1)
    gold = gold * (1 - Mo['bill']) * (1 - Mo['lid']) * (0.75 + 0.25 * sstep(0.3, 0.6, fbm(Qo * V(60, 20, 60), 2, 71)))
    gc = mix(np.tile(KE['gold'], (k, 1)), KE['goldHi'], (fid - 0.3) * 0.6)
    gc = mix(gc, KE['goldDk'], sstep(0.5 * cfa, 1.4 * cfa, -pl['a']) * 0.45 * mid)
    f = mix(f, gc, gold * (1 - Mo['tuft']))
    # the tufts: dark brown feathers with golden edges
    f = mix(f, mix(np.tile(KE['brownDk'], (k, 1)), KE['gold'], sstep(0.5, 0.95, relb) * 0.7 + sstep(0.2 * cfa, 0.0, -pl['a']) * 0.5), Mo['tuft'])
    # the face and throat darker; a darker eye stripe from the eye back under the brow
    face = Mo['head'] * sstep(0.215, 0.235, zo) * (1 - Mo['bill'])
    f = mix(f, KE['face'], face * 0.5)
    # pale tips on the hackles; the ruff golden-brown toward its edge, the last row's tips tawny (they run into the fur)
    tipm = sstep(0.25 * cfa, 0.05 * cfa, -pl['a']) * sstep(0.2, 0.9, relb) * mid
    f = mix(f, KE['edge'], tipm * 0.25)
    fe_o = feather_edge(Qo)
    row1 = sstep(-0.001, 0.001, -_tip_rows(Qo, 1))
    ruffz = Mo['trunk'] * sstep(0.045, 0.01, fe_o) * (0.6 + 0.4 * sstep(0.15, 0.22, yo))
    f = mix(f, KE['ruff'], ruffz * (0.55 + 0.3 * (fid - 0.5)))
    # the last row golden-tawny toward its tips, the row before it golden-brown at its tips
    f = mix(f, KE['ruffTip'], Mo['trunk'] * row1 * (0.45 + 0.4 * sstep(0.8 * cfa, 0.1 * cfa, -pl['a'])) * sstep(-0.004, 0.002, fe_o))
    f = mix(f, KE['gold'], Mo['trunk'] * (1 - row1) * sstep(0.03, 0.012, fe_o) * sstep(0.5 * cfa, 0.05 * cfa, -pl['a']) * 0.5)
    # the trousers: golden-brown, paler toward the hem
    f = mix(f, KE['trouser'], Mo['fleg'] * (0.35 + 0.35 * sstep(0.12, 0.08, yo)))
    # the wing arm: the coverts golden-brown with pale edges (the pale bar on a golden eagle's upper wing)
    f = mix(f, KE['cover'], Mo['arm'] * 0.6)
    f = mix(f, KE['edge'], Mo['arm'] * tipm * 0.4)
    f *= (0.93 + 0.12 * n1)[:, None]
    ce = out[ix]
    ce = mix(ce, f, Mo['fe'])
    # the beak: the yellow cere, a horn-yellow base, horn gray, then the dark hook; the yellow gape at the corner
    E = to_eagle(Qo)
    ez, ey = E[:, 2], E[:, 1]
    bc = mix(np.tile(KE['billBase'], (k, 1)), KE['bill'], sstep(EG.CERE_Z + 0.008, EG.CERE_Z + 0.024, ez))
    bc = mix(bc, KE['billTip'], sstep(EG.CERE_Z + 0.024, EG.CERE_Z + 0.036, ez + 0.4 * (0.39 - ey)))
    bc = mix(bc, KE['cere'], sstep(EG.CERE_Z + 0.002, EG.CERE_Z - 0.002, ez) * sstep(0.38, 0.386, ey))
    bc = mix(bc, KE['billTip'], sstep(0.0015, 0.0, np.abs(ey - EG._tom_y(ez))) * 0.5 * sstep(0.25, 0.26, ez))
    gape = sstep(0.0045, 0.0015, np.hypot(ez - 0.233, (ey - 0.3775) * 1.4)) * sstep(0.006, 0.01, np.abs(E[:, 0])) * sstep(0.02, 0.016, np.abs(E[:, 0]))
    bc = mix(bc, KE['gape'], gape)
    ce = mix(ce, bc, np.clip(Mo['bill'] + gape * Mo['head'], 0, 1))
    # the bare skin round the eye
    de = np.linalg.norm(Qo - EYE_C, axis=1)
    ce = mix(ce, KE['lid'], Mo['lid'] * sstep(EYE_R + 0.0016, EYE_R + 0.0005, de) * 0.85)
    # the scaly yellow tarsus and toes, the black talons
    sc = B.scutes(Qo, nrm([0, -1, 0.15]), 0.0028, 43)[1]
    rh, rg = B.reticulate(Qo, 0.0013, 44)
    fc = mix(np.tile(KE['foot'], (k, 1)), KE['footDk'], sc * 0.5 + rg * 0.45)
    # (the top of the tarsus a little dusky where the trousers' hem shades it)
    fc = mix(fc, KE['footDk'], sstep(HEM - 0.01, HEM + 0.002, yo) * 0.4)
    ce = mix(ce, fc, Mo['tars'])
    ce = mix(ce, KE['talon'], Mo['talon'])
    out[ix] = ce
    r2 = 0.72 + 0.06 * (n1 - 0.5)
    r2 = np.where(Mo['bill'] > 0.5, 0.32, r2)
    r2 = np.where(Mo['tars'] > 0.5, 0.5, r2)
    r2 = np.where(Mo['talon'] > 0.5, 0.28, r2)
    w = np.clip(Mo['fe'] + Mo['bill'] + Mo['tars'] + Mo['talon'], 0, 1)
    ro[ix] = ro[ix] * (1 - w) + r2 * w
    return out, ro


def paint(P, N, c):
    col, rough = _lion_coat(P, N, c)
    M = masks(P, N, c)
    # the fur just behind the ruff a little browner (the feathers' colors run into it)
    col = mix(col, KE['furJoin'], M['behind'] * 0.5)
    col, rough = eagle_paint(P, N, c, col, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


_lion_detail = C.detail


def leg_h(P, M):
    Q = mirror(P)
    h = np.zeros(len(P), F)
    sh, sg = B.scutes(Q, nrm([0, -1, 0.15]), 0.0028, 43)
    rh, rg = B.reticulate(Q, 0.0013, 44)
    front = sstep(-0.3, 0.3, Q[:, 2] - 0.085 + 0.0 * Q[:, 1])
    tars_only = M['tars'] * sstep(0.022, 0.03, Q[:, 1])
    h += tars_only * (0.00008 * sh - 0.00007 * sg) * front + tars_only * (1 - front) * (0.00006 * rh - 0.00006 * rg)
    h += M['tars'] * sstep(0.03, 0.022, Q[:, 1]) * (0.00007 * rh - 0.00007 * rg)
    h -= 0.00002 * sstep(0.5, 1.0, np.sin(np.hypot(Q[:, 1], Q[:, 2]) / 0.0006)) * M['talon']
    return h


def detail(P, N, c):
    h = _lion_detail(P, N, c)
    M = masks(P, N, c)
    on = M['fe'] > 0.001
    if on.any():
        Mo = {k: v[on] for k, v in M.items()}
        pl = _plumage(P[on], N[on], Mo)
        fh = B.feather_height(pl, 0.045) * sstep(0.0006, 0.003, np.abs(P[on, 0]))
        fh = fh * (1 + 0.6 * Mo['edge'])
        h[on] = h[on] * (1 - Mo['fe']) + fh * Mo['fe']
    # the beak's growth lines, the pebbled cere
    E = to_eagle(mirror(P))
    bl = M['bill']
    h -= 0.000014 * sstep(0.5, 1.0, np.sin(np.hypot(E[:, 1] - 0.34, E[:, 2] - 0.25) / 0.0008)) * bl * sstep(EG.CERE_Z, EG.CERE_Z + 0.004, E[:, 2])
    h += leg_h(P, M) * (1 - M['fe'])
    return h.astype(F)


def fur(P, N, c):
    """the lion's coat on the hind half, a little longer just behind the ruff; on the eagle's half the chick-cub's down
    (the grown-up does not draw it there: fur_babymask)"""
    ln, de = _fur0(P, N, c)
    M = masks(P, N, c)
    ln = ln + 0.002 * M['behind']
    bare = np.clip(M['bill'] + M['tars'] + M['talon'] + M['lid'] + M['ball'], 0, 1)
    down = 0.0075 * (1 - 0.45 * M['head']) * (1 - 0.3 * M['arm']) * (1 - 0.3 * M['fleg']) * sstep(EYE_R * 1.4, EYE_R * 2.6, np.linalg.norm(mirror(P) - EYE_C, axis=1))
    ln = ln * (1 - M['fe']) + down * M['fe']
    ln = ln * (1 - bare)
    return np.clip(ln, 0, C.FUR['len']).astype(F), de


def _babymask(P, N, c):
    """1 where the fur is only the chick-cub's down (the eagle's half): the grown-up's feathers show there"""
    return masks(P, N, c)['fe'].astype(F)


C.flow, C.paint, C.detail, C.fur = flow, paint, detail, fur
C.FUR = dict(C.FUR, babyMask=True)


# ---------- game mesh: decimation, rings, texture layout ----------
def keep(P):
    c = C.parts(P)
    R = _own(c)
    Q = mirror(P)
    de = np.linalg.norm(Q - EYE_C, axis=1)
    ball = sstep(EYE_R * 0.97, EYE_R * 0.8, de)
    k = 0.44 * R['trunk'] + 0.5 * R['neck'] + 0.74 * R['skull'] + 0.8 * R['brow'] + 0.86 * R['beak'] + 0.85 * R['lids'] + 0.72 * R['ear']
    k += 0.52 * R['fleg'] + 0.62 * R['tars'] + 0.8 * (R['paw'] * (Q[:, 2] > 0.03) + R['claw']) + 0.5 * R['hleg'] + 0.4 * R['tail'] + 0.3 * R['warm']
    k += 0.56 * R['paw'] * (Q[:, 2] <= 0.03)
    rim = sstep(EYE_R + 0.004, EYE_R + 0.001, de) * 0.85
    edge = sstep(0.006, 0.0, np.abs(feather_edge(Q))) * R['trunk'] * 0.56
    return (np.maximum.reduce([k, rim, edge]) * (1 - ball)).astype(F)


def lowpoly_fix(bm, hi):
    """rings across the body, up the neck, along the tail, round the front legs' wrists, and across the wing arm at the
    shoulder, elbow and wrist"""
    import meshfix as MX
    tr = MX.tree(hi)
    MX.rings(bm, tr, (0.0, 0.2, 0.12), (0.0, 0.205, -0.19), 0.022, lambda c, p0, r: c.y > 0.12 and r < 0.075 and abs(c.x) < 0.075)
    pts = [V(0, k[0], k[1]) for k in _NECK]
    for a, b in zip(pts[:-1], pts[1:]):
        MX.rings(bm, tr, a, b, 0.02, lambda c, p0, r: r < 0.07 and c.z > 0.1 and c.y > 0.2 and abs(c.x) < 0.07)
    pts = [V(0, y, z) for y, z, _ in _TAIL]
    for a, b in zip(pts[:-1], pts[1:]):
        MX.rings(bm, tr, a, b, 0.016, lambda c, p0, r: r < 0.022 and c.z < -0.19)
    for j in range(3):
        a = WPTS[j] + V(-0.024 if j else 0.006, 0, 0)
        MX.rings(bm, tr, a, a + V(0.048, 0, 0), 0.012, lambda c, p0, r: c.x > 0.036 and c.y > 0.22 and r < 0.05)
    MX.finish(bm, 5e-9)


UV_AVERAGE = True


def uv_regions(P):
    c = C.parts(P)
    R = _own(c)
    Q = mirror(P)
    lab = np.full(len(P), 2)
    lab[R['neck'] > 0.5] = 1
    lab[(R['skull'] + R['brow'] + R['lids'] + R['ball']) > 0.5] = 0
    lab[R['beak'] > 0.5] = 10
    lab[R['ear'] > 0.5] = 8
    lab[R['fleg'] > 0.5] = 3
    lab[(R['tars'] + R['paw'] * (Q[:, 2] > 0.03) + R['claw']) > 0.5] = 4
    lab[R['hleg'] > 0.5] = 5
    lab[(R['hleg'] > 0.5) & (Q[:, 1] < 0.07)] = 6
    lab[(R['paw'] > 0.5) & (Q[:, 2] <= 0.03)] = 6
    lab[R['tail'] > 0.5] = 7
    lab[(R['warm'] > 0.5) | ((arm_mask(Q) > 0.5) & (R['trunk'] < 0.5))] = 9
    return lab


def uv_weight(P):
    c = C.parts(P)
    R = _own(c)
    Q = mirror(P)
    head = np.clip(R['skull'] + R['brow'] + R['lids'] + R['ball'], 0, 1)
    feet = np.clip(R['tars'] + R['paw'] * (Q[:, 2] > 0.03) + R['claw'], 0, 1)
    w = 0.92 + 0.95 * head + 0.75 * R['beak'] + 0.25 * R['ear'] + 0.35 * feet - 0.4 * np.maximum(R['warm'], arm_mask(Q)) + 0.1 * R['neck']
    return w.astype(F)


C.keep, C.lowpoly_fix, C.uv_regions, C.uv_weight = keep, lowpoly_fix, uv_regions, uv_weight
C.UV_PACK = dict(margin_method='FRACTION', margin=0.008)


# ---------- skin weights ----------
def fix_weights(W, wpos, names, G, weld):
    """the lion's (the cat's) weights, then: the eagle's head on the head bone, the front feet and talons on the paw
    bones, the wing arm on the wing bones by its place along the span (blended at the joints, the root into the chest);
    nothing else may follow the wing or feather bones"""
    W = _fix_weights0(W, wpos, names, G, weld)
    bi = {n: i for i, n in enumerate(names)}
    P = wpos.astype(F)
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    c = C.parts(P)
    R = _own(c)
    side = np.where(P[:, 0] >= 0, 'L', 'R')
    wing = [i for n, i in bi.items() if n[:-1] in ('wing', 'wfore', 'whand') or (n[0] == 'f' and n[1:-1].isdigit())]
    W[:, wing] = 0
    # the head: everything on the eagle's head, blending into the neck below the skull
    hd = np.clip(R['skull'] + R['brow'] + R['beak'] + R['lids'] + R['ball'], 0, 1) * sstep(0.318, 0.33, y)
    hd = np.maximum(hd, (c['skull'] < c['neck'] + 0.002) * sstep(0.31, 0.33, y))
    CV.set_part(W, bi, hd > 0.01, 'head', hd)
    # the front feet: the toes and talons on the paw bone, the top of the foot into the wrist
    foot = (z > 0.04) & (z < 0.175) & (x < 0.095) & (y < 0.032) & ((R['paw'] + R['claw'] + R['tars']) > 0.5)
    k = sstep(0.03, 0.019, y)
    for s in 'LR':
        m = foot & (side == s)
        if m.any():
            row = np.zeros((m.sum(), W.shape[1]), F)
            row[:, bi['fpaw' + s]] = k[m]
            row[:, bi['fmeta' + s]] = 1 - k[m]
            W[m] = row
    # the wing arm
    arm = (c['warm'] < np.minimum.reduce([c['trunk'], c['fleg'], c['neck']]) + 0.002) & (x > ROOT[0] - 0.008) & (y > 0.215)
    ua = np.interp(x, [WPTS[0][0], WPTS[1][0], WPTS[2][0], WPTS[3][0] + 0.05], [0.0, 1.0, 2.0, 3.0]).astype(F)
    rootb = 1 - sstep(ROOT[0], ROOT[1], x)
    W[arm] = W[arm] * rootb[arm, None]
    for nm, w in B.blend_chain(ua, ['wing', 'wfore', 'whand'], 0.12):
        for s in 'LR':
            ms = arm & (side == s)
            W[ms, bi[nm + s]] += w[ms] * (1 - rootb[ms])
    bad = W.sum(1) < 1e-6
    W[bad, bi['chest']] = 1
    return W / np.maximum(W.sum(1, keepdims=True), 1e-9)


C.fix_weights = fix_weights


# ---------- the model json ----------
def meta(st):
    m = _meta0(st)
    m['eye'] = {'p': [round(float(v), 5) for v in EYE_C], 'r': round(float(EYE_R), 5), 'dir': [round(float(v), 4) for v in nrm(EG.EYE_DIR)],
                'lid': [0.58, -0.84, 0.12], 'iris': 0xC4842A, 'irisR': 0.92, 'pupil': 'round', 'pupilR': 0.34, 'rim': 0x6A4A20,
                'lidCol': 0x3A3430, 'babyIris': 0x2A2018, 'babyLidCol': 0x9A9080}
    m['mouth'] = [round(float(v), 4) for v in from_eagle(EG.MOUTH)]
    m['collar'] = {'at': ['neck2', 'head', 0.25], 'lift': 0.4, 'maxR': 0.07}
    m.update({'flat': 0x5A4026, 'rim': [0.14, 0.1, 0.06]})
    return m


C.meta = meta


# ---------- the chick-cub ----------
def baby_offset(P, N, c):
    """the cat's round little body (the egg walk), the ruff's feather coat pulled in to the body under it; the wing
    arm is left to the game (it scales the wing bones to small downy buds)"""
    d = _baby_offset0(P, N, c)
    Q = mirror(P)
    R = _own(c)
    d = d - N * (ruff_t(Q) * 0.9 * R['trunk'])[:, None]
    return (d * (1 - arm_mask(Q))[:, None]).astype(F)


def baby_paint(P, N, c, col):
    """the chick-cub: pale cream down on the eagle's half (a little grayer on the back and round the eyes), a dark
    beak with a yellow gape and cere, pale yellow feet and gray talons; a woolly pale tawny coat behind with faint spots"""
    M = masks(P, N, c)
    Q = mirror(P)
    R = C._regions(P, N, c)
    n = len(P)
    # the lion cub behind (lion.py's cub coat without the mane)
    keep = np.clip(R['ball'] + R['pad'] * R['paw'], 0, 1)
    out = mix(col, hexc(0x9C8264), 0.35 * (1 - keep))
    warp = np.stack([fbm(P * 60 + k_, 2, 80 + k_) for k_ in range(3)], 1) - 0.5
    f1, _ = worley(P / 0.011 + warp * 0.5, 82)
    yy = Q[:, 1]
    leg = sstep(0.15, 0.11, yy) * sstep(0.02, 0.04, yy) * (1 - R['tail'])
    belly = sstep(-0.3, -0.7, N[:, 1])
    flank = (1 - R['tail']) * sstep(0.12, 0.16, yy)
    sp = sstep(0.36, 0.22, f1) * np.clip(leg * 0.55 + belly * 0.5 + flank * 0.22, 0, 0.6) * (1 - M['fe'])
    out = mix(out, hexc(0x5A4430), sp)
    out = mix(out, hexc(0x3A2A1C), R['tail'] * sstep(0.88, 0.94, R['tt']) * 0.8)
    # the down
    n2 = fbm(Q * 140, 3, 12)
    dn = mix(np.tile(hexc(0xE4DCCC), (n, 1)), hexc(0xC8BEAE), sstep(0.3, 0.9, N[:, 1] * np.sign(1.0)) * 0.35 + (n2 - 0.5) * 0.3)
    de = np.linalg.norm(Q - EYE_C, axis=1)
    dn = mix(dn, hexc(0x9A9080), sstep(EYE_R * 2.4, EYE_R * 1.2, de) * 0.6)
    # (a soft edge: the down runs into the cub's coat over a few centimeters)
    soft = np.maximum(M['fe'] * (1 - M['trunk']), M['trunk'] * sstep(-0.012, 0.004, feather_edge(Q)))
    out = mix(out, mix(dn, hexc(0xCDB898), sstep(0.004, -0.008, feather_edge(Q)) * M['trunk']), soft)
    E = to_eagle(Q)
    bc = mix(np.tile(hexc(0x2E2A26), (n, 1)), hexc(0xE0C060), sstep(EG.CERE_Z + 0.004, EG.CERE_Z - 0.002, E[:, 2]))
    gape = sstep(0.008, 0.003, np.hypot(E[:, 2] - 0.233, (E[:, 1] - 0.3775) * 1.4)) * sstep(0.022, 0.017, np.abs(E[:, 0])) * M['head']
    out = mix(out, bc, M['bill'])
    out = mix(out, hexc(0xE8C860), gape)
    out = mix(out, hexc(0x6E655C), M['lid'] * sstep(EYE_R + 0.0016, EYE_R + 0.0005, de))
    out = mix(out, hexc(0xE2CC90), M['tars'])
    out = mix(out, hexc(0x4A4440), M['talon'])
    return np.clip(out, 0, 1).astype(F)


def finish_baby(Cimg, ao, valid):
    # (less of the sculpt's occlusion: the ruff's lip and the creases under it are not on the chick-cub)
    return CV.finish(Cimg, ao, valid, 0.2)


C.baby_offset, C.baby_paint, C.finish_baby = baby_offset, baby_paint, finish_baby
# no whiskers
C.cards = None
C.MAP_QUALITY = T['MAP_QUALITY']
C.BABY_TEX = T['BABY_TEX']
PT.install(globals(), C, KS)


def fur_babymask(P, N, c):
    """texture.py hook (game meters): the fur map's third channel, 1 where only the baby draws its fur shells"""
    return _babymask(P / KS, N, {k: v / KS for k, v in c.items()})


# ---------- the feather atlas for the wing blades (cells in the game's order: prim, sec, gcov, lcov, tert, mcov) ----------
def _cells():
    F_ = B.FeatherCell
    br, brD, brL, gold, pale, gray = hexc(0x3A2816), hexc(0x1E140A), hexc(0x5E4630), hexc(0x9A7242), hexc(0xB09474), hexc(0x6E665E)

    def prim(s, t, side):
        # dark brown, grayer and barred on the inner vane toward its base (the barred underside), a near black tip
        c = mix(np.tile(brD, (len(s), 1)), br, sstep(0.0, 0.6, s) * 0.4)
        inner = sstep(0.1, -0.4, s) * sstep(0.75, 0.3, t)
        c = mix(c, gray, inner * 0.45)
        bars = sstep(0.55, 0.85, np.sin(t * 2 * np.pi * 6.0 + 0.4 * s) * 0.5 + 0.5) * inner
        c = mix(c, brD, bars * 0.55)
        return mix(c, hexc(0x100A06), sstep(0.6, 1.0, t) * 0.5)

    def sec(s, t, side):
        c = mix(np.tile(br, (len(s), 1)), brD, sstep(0.2, -0.6, s) * 0.3)
        c = mix(c, gray, sstep(0.2, -0.5, s) * sstep(0.8, 0.3, t) * 0.35)
        bars = sstep(0.6, 0.85, np.sin(t * 2 * np.pi * 5.0) * 0.5 + 0.5) * sstep(0.85, 0.3, t)
        c = mix(c, brD, bars * 0.4)
        return mix(c, brD, sstep(0.78, 1.0, t) * 0.4)

    def gcov(s, t, side):
        c = mix(np.tile(br, (len(s), 1)), brL, sstep(0.5, 1.0, np.abs(s)) * 0.3)
        return mix(c, pale, sstep(0.82, 1.0, t) * 0.35)

    def lcov(s, t, side):
        # the lesser coverts: brown, golden toward the tip, pale tips (the pale bar across the upper wing)
        c = mix(np.tile(br, (len(s), 1)), brL, sstep(0.2, 0.8, t) * 0.7)
        c = mix(c, gold, sstep(0.75, 0.95, t) * 0.6)
        return mix(c, pale, sstep(0.9, 1.0, t) * 0.3)

    def tert(s, t, side):
        c = mix(np.tile(br, (len(s), 1)), brL, sstep(0.4, 1.0, np.abs(s)) * 0.3)
        return mix(c, gold, sstep(0.85, 1.0, t) * 0.4)

    def mcov(s, t, side):
        return mix(np.tile(gold, (len(s), 1)), hexc(0xB88A4C), sstep(0.6, 1.0, t) * 0.5)

    sh = hexc(0x2A1C10)
    return [F_('finger', prim, w=0.84, outer=0.6, tip=0.42, shaft=sh, notch=0.33),
            F_('round', sec, w=0.74, outer=0.8, tip=0.5, shaft=sh),
            F_('round', gcov, w=0.8, outer=0.85, tip=0.8, shaft=sh),
            F_('round', lcov, w=0.66, outer=0.85, tip=1.2, shaft=sh),
            F_('round', tert, w=0.76, outer=0.85, tip=0.7, shaft=sh),
            F_('round', mcov, w=0.8, outer=0.9, tip=0.9, shaft=sh),
            None, None]


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = hexc(0xE0D8CA), hexc(0xC2B8A8)

    def dn(s, t, side):
        return mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 6 + [None, None]


FEATHER_ATLAS = {'size': (1024, 512), 'out': (512, 256), 'cells': _cells, 'baby': _baby_cells, 'quality': (64, 70, 60),
                 'alpha_quality': 50}


def extra_maps(X):
    """the feather atlases (the chick-cub's coat is baby_paint's map, written by texture.py)"""
    B.save_atlas(sys.modules[__name__], X['work'])


def export_extra(meta_, out_dir, work):
    """the feather atlases as WebP, named in the json (the game cuts the wing blades from them)"""
    from PIL import Image
    fa = FEATHER_ATLAS
    fo = fa['out']
    fb = (fo[0] // 2, fo[1] // 2)
    srgb = list(meta_.get('srgb', []))
    for key, fn, mode, qual, size in (('feather', 'feather', 'RGBA', fa['quality'][0], fo), ('featherNormal', 'feathernrm', 'RGB', fa['quality'][1], fo),
                                      ('babyFeather', 'babyfeather', 'RGBA', fa['quality'][2], fb)):
        im = Image.open(os.path.join(work, f'{ID}-{fn}.png')).convert(mode)
        if im.size != tuple(size):
            im = im.resize(tuple(size), Image.LANCZOS)
        dst = f'{ID}-{fn}.webp'
        im.save(os.path.join(out_dir, dst), 'WEBP', quality=qual, method=6, alpha_quality=fa['alpha_quality'])
        meta_['maps'][key] = dst
        if key != 'featherNormal':
            srgb.append(key)
    meta_['srgb'] = srgb
    meta_['feathers'] = {'cols': B.NCOL}

