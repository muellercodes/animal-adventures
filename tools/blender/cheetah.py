# A cheetah (round 11) on the cat template (bigcat.py) at KS = 2.6, with longer legs: a LegWarp lifts the house cat's
# body and stretches its legs (bigcat.LegWarp; the game moves the bones the same way, legWarp in 40_animals.js), about
# 1.25 m from the nose to the rump and 0.78 m at the shoulder. Slim and long-legged: a deep chest and a narrow tucked-up
# waist, slender legs on small narrow paws, a small round head (the cat's head at HS of its size, built in a scaled
# head frame) with a high forehead, small rounded ears set wide, amber eyes with round pupils, and a long tail hanging
# low with an upturned tip. The coat: golden tawny with solid round black spots, a white belly, black tear lines from
# the inner corners of the eyes to the corners of the mouth, black lips, spots and then rings down the tail to a white
# tip. Cubs: smoky dark with the long silvery mantle down the back (baby offsets lift a ridge of hair along the back,
# longer fur shells and a pale mantle in the cub's color map).
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, ellipsoid, round_cone, sweep, loft, fbm, worley
import carnivore as CV
from carnivore import mirror, mix, hexc
import bigcat

KS = 2.6
ID = 'cheetah'
# the long legs: the body lifted by DY (cat units), the legs stretched between 0.035 and 0.12 (keep in step with the game)
WARP = bigcat.LegWarp(ya=0.035, yb=0.12, dy=0.055, w=0.016, z0=-0.228, z1=-0.198)
DY = WARP.dy
# the small head: the cat's head frame scaled by HS about its origin
HS = 0.8
HO = V(0.0, 0.292, 0.178)


class HeadFrame(CV.Frame):
    """the cat's head frame with every local length scaled by k (local units are the cat's: k = 0.8 is a smaller head)"""
    def __init__(self, o, a, u, k):
        super().__init__(o, a, u)
        self.k = k

    def loc(self, Q):
        return super().loc(Q) / self.k

    def pt(self, s, u, x=0.0):
        return self.o + (self.a * s + self.u * u + V(1, 0, 0) * x) * self.k


_HF = HeadFrame(HO, V(0.0, -0.074, 1.0), V(0.0, 1.0, 0.0), HS)
# the tail in the cheetah's own height (lifted by DY), hanging low with the tip turned up; behind the rump the warp only
# lifts, so the cat units are these minus DY
_TAILC = [(0.262, -0.185, 0.0128), (0.257, -0.205, 0.013), (0.238, -0.228, 0.0128), (0.203, -0.252, 0.0124), (0.162, -0.27, 0.012),
          (0.122, -0.288, 0.0117), (0.088, -0.31, 0.0114), (0.072, -0.336, 0.0113), (0.076, -0.362, 0.0118), (0.09, -0.378, 0.0124),
          (0.101, -0.386, 0.0108), (0.107, -0.389, 0.0055)]
_TAIL = [(y - DY, z, r) for y, z, r in _TAILC]
_TB = {'tail1': V(0, 0.205, -0.19), 'tail2': V(0, 0.148, -0.252), 'tail3': V(0, 0.067, -0.288), 'tail4': V(0, 0.019, -0.345)}
# slim: a deep chest, the waist tucked up high, narrow hips (cat units, before the lift)
_TRUNK = [
    (-0.205, 0.22, 0.206, 0.19, 0.016, 2.0, 2.0),
    (-0.19, 0.232, 0.207, 0.178, 0.031, 2.1, 2.0),
    (-0.16, 0.241, 0.209, 0.172, 0.038, 2.2, 2.0),
    (-0.12, 0.246, 0.213, 0.178, 0.036, 2.3, 2.0),
    (-0.08, 0.248, 0.213, 0.182, 0.033, 2.3, 2.0),
    (-0.04, 0.248, 0.209, 0.166, 0.035, 2.3, 2.0),
    (0.0, 0.246, 0.203, 0.142, 0.039, 2.3, 2.0),
    (0.04, 0.245, 0.198, 0.122, 0.042, 2.3, 2.0),
    (0.08, 0.243, 0.194, 0.118, 0.041, 2.3, 2.0),
    (0.11, 0.24, 0.193, 0.124, 0.037, 2.2, 2.0),
    (0.13, 0.232, 0.192, 0.138, 0.032, 2.1, 2.0),
    (0.145, 0.222, 0.192, 0.155, 0.025, 2.0, 2.0),
]
_NECK = [
    (0.2, 0.09, 0.036, 0.04, 0.034, 2.0, 2.0),
    (0.222, 0.135, 0.029, 0.033, 0.028, 2.0, 2.0),
    (0.248, 0.163, 0.024, 0.027, 0.023, 2.0, 2.0),
    (0.274, 0.181, 0.02, 0.022, 0.02, 2.0, 2.0),
    (0.29, 0.188, 0.017, 0.018, 0.017, 2.0, 2.0),
]
# small rounded ears set wide and low on the small head (the game's ear bones stand at EAR_B too)
EAR_B0 = _HF.pt(0.014, 0.019, 0.025)
C = bigcat.load(dict(
    ID=ID, TRUNK=_TRUNK, NECK=_NECK, HF=_HF, BOUNDS=(V(-0.075, 0.0, -0.41), V(0.075, 0.33, 0.27)),
    TAIL=_TAIL, TB=_TB, TAIL_BONES=['tail1', 'tail2', 'tail3', 'tail4'], TAIL_TD=0.026,
    EYE_AT=(0.063, 0.0078, 0.0178), EYE_R=0.008, LID_W=0.0068, LID_H=0.0048, SLANT=0.1, NOSE_S=0.092, MOUTH_AT=(0.083, -0.026),
    EAR_B=EAR_B0, EAR_A=[0.45, 0.86, -0.15], EAR_N=[0.42, -0.05, 0.9], EAR_L=0.0138, EAR_W=0.0112,
    BOX=dict(neck=((-0.07, 0.12, 0.0), (0.07, 0.33, 0.24)), head=((-0.055, 0.24, 0.155), (0.055, 0.33, 0.27)),
             eyes=((-0.034, 0.278, 0.212), (0.034, 0.314, 0.257)), ear=((-0.06, 0.288, 0.165), (0.06, 0.34, 0.215)),
             fleg=((-0.07, -0.005, 0.03), (0.07, 0.26, 0.16)), hleg=((-0.075, -0.005, -0.23), (0.075, 0.27, -0.04)),
             paws=((-0.06, -0.005, -0.19), (0.06, 0.03, 0.13)), tail=((-0.032, -0.01, -0.405), (0.032, 0.235, -0.16))),
))
_trunk, _neck, _head, _fleg, _hleg, _tail = C.trunk, C.neck, C.head, C.fleg, C.hleg, C.tail


def _slim(keys, lo, hi):
    # slender legs: the sections scaled by lo at the foot up to hi at the top
    out = []
    for k in keys:
        f = lo + (hi - lo) * min(1.0, max(0.0, (k[0] - 0.02) / 0.18))
        out.append((k[0], k[1], k[2] * f, k[3] * f, k[4] * f) + tuple(k[5:]))
    return out


C.FORE, C.HIND = _slim(C.FORE, 0.86, 0.9), _slim(C.HIND, 0.86, 0.92)
_bone_tips = C.bone_tips


def bone_tips(P):
    t = _bone_tips(P)
    t['tail3'], t['tail4'] = P['tail4'], V(0, _TAIL[-1][0], _TAIL[-1][1])
    t['head'] = _HF.pt(0.09, 0.0)
    return t


C.bone_tips = bone_tips


def trunk(P):
    """the cat's trunk without the loose belly flap: shoulder blades, the breast and a high flank fold"""
    Q = mirror(P)
    d = loft(Q, C.TRUNK)
    d = smin(d, round_cone(Q, V(0.028, 0.18, 0.115), V(0.019, 0.236, 0.086), 0.015, 0.012), 0.02)
    d = smin(d, ellipsoid(Q, V(0.0, 0.158, 0.122), V(0.021, 0.03, 0.02)), 0.02)
    d = smin(d, C.flat_cone(Q, V(0.024, 0.186, -0.062), V(0.035, 0.132, -0.097), 0.012, 0.0095, 0.7), 0.018)
    return d


def neck(P):
    Q = mirror(P)
    return smin(sweep(Q, C.NECK), ellipsoid(Q, V(0.0, 0.198, 0.15), V(0.022, 0.024, 0.02)), 0.02)


# the head in the head frame's units (the cat's, before HS): narrower cheeks, a high rounded forehead, a short muzzle
_HEAD = [
    (-0.006, 0.016, 0.0, -0.018, 0.019, 2.2, 2.0),
    (0.008, 0.027, -0.002, -0.025, 0.03, 2.5, 2.0),
    (0.024, 0.032, -0.004, -0.029, 0.0345, 2.6, 2.0),
    (0.04, 0.033, -0.007, -0.031, 0.0352, 2.6, 2.1),
    (0.054, 0.03, -0.009, -0.031, 0.033, 2.4, 2.2),
    (0.066, 0.023, -0.011, -0.03, 0.028, 2.2, 2.3),
    (0.077, 0.014, -0.012, -0.029, 0.0225, 2.2, 2.3),
    (0.086, 0.007, -0.013, -0.027, 0.0178, 2.2, 2.2),
    (0.092, 0.0, -0.013, -0.022, 0.0125, 2.1, 2.1),
]


def head(P):
    """the cat's head made smaller (the scaled frame): a rounder skull with a high forehead, flatter cheeks, smaller
    whisker pads, a broad nose leather; distances back in cat units"""
    Q = mirror(P)
    L = C.HF.loc(Q)
    d = loft(L, _HEAD)
    d = smin(d, ellipsoid(L, V(0.0, 0.013, 0.034), V(0.022, 0.0145, 0.026)), 0.012)                    # forehead
    d = smin(d, ellipsoid(L, V(0.023, -0.014, 0.044), V(0.012, 0.014, 0.018)), 0.012)                   # cheeks
    d = smin(d, round_cone(L, V(0.007, 0.0175, 0.058), V(0.019, 0.017, 0.06), 0.0038, 0.0034), 0.006)   # brows
    d = smin(d, ellipsoid(L, V(0.0092, -0.0155, 0.081), V(0.0091, 0.0082, 0.0094)), 0.005)              # whisker pads
    d = smin(d, ellipsoid(L, V(0.0, -0.0272, 0.0775), V(0.008, 0.0056, 0.009)), 0.004)                  # chin
    ns = C.NOSE_S
    NL = L - V(0.0, -0.0046, ns - 0.0022)
    NL[:, 0] = NL[:, 0] / (1.0 + 70.0 * np.clip(NL[:, 1], -0.0045, 0.0045))
    d = smin(d, ellipsoid(NL, V(0.0, 0.0, 0.0), V(0.0058, 0.004, 0.003)), 0.0025)                       # nose leather
    M = L * V(1, 2.0, 1)
    m = round_cone(M, V(0.0, -0.011 * 2.0, ns + 0.001), V(0.0, -0.0222 * 2.0, ns - 0.004), 0.0004, 0.0004)
    m = smin(m, round_cone(M, V(0.0, -0.0222 * 2.0, ns - 0.004), V(0.0115, -0.025 * 2.0, 0.0755), 0.0004, 0.0004), 0.0006)
    m = smin(m, round_cone(M, V(0.0115, -0.025 * 2.0, 0.0755), V(0.0175, -0.024 * 2.0, 0.064), 0.0004, 0.0003), 0.0006)
    d = smax(d, -(m + 0.0002) / 2.0, 0.0005)
    d = smax(d, -ellipsoid(L, V(0.0032, -0.0045, ns + 0.0025), V(0.0012, 0.0008, 0.0012)), 0.0005)     # nostrils
    return d * HS


def hleg(P):
    """long lean thighs and hamstrings (the cat's are heavy and stood up over the hips), a slim gaskin"""
    Q = mirror(P)
    x = C.XH
    d = sweep(Q, C.HIND, mirror_x=False)
    d = smin(d, C.flat_cone(Q, V(0.031, 0.2, -0.148), V(0.037, 0.12, -0.098), 0.031, 0.015, 0.62), 0.022)     # thigh
    d = smin(d, C.flat_cone(Q, V(0.03, 0.195, -0.176), V(0.037, 0.105, -0.148), 0.019, 0.011, 0.7), 0.018)    # hamstrings
    d = smin(d, ellipsoid(Q, V(x, 0.092, -0.128), V(0.0088, 0.019, 0.0105)), 0.009)                          # gaskin
    d = smin(d, ellipsoid(Q, V(x, 0.065, -0.177), V(0.0062, 0.008, 0.0066)), 0.005)                          # point of hock
    return smax(d, Q[:, 1] - 0.232, 0.01)


def ear(P):
    Q = mirror(P)
    return CV.ear(Q, C.EAR_B, C.EAR_A, C.EAR_N, C.EAR_L, C.EAR_W, 'round', th0=0.0044, th1=0.0028, cup=0.6, tipin=0.0,
                  base_r=(0.0058, 0.0045, 0.0038))


F_TOES = [(0.0042, 0.0066, 0.0049, 0.0062, 0.0), (-0.0042, 0.0066, 0.0049, 0.0062, 0.0), (0.0102, 0.0008, 0.0045, 0.0056, 0.0004),
          (-0.0102, 0.0008, 0.0045, 0.0056, 0.0004)]
H_TOES = [(0.004, 0.0062, 0.0046, 0.006, 0.0), (-0.004, 0.0062, 0.0046, 0.006, 0.0), (0.0095, 0.0006, 0.0043, 0.0054, 0.0004),
          (-0.0095, 0.0006, 0.0043, 0.0054, 0.0004)]


def paws(P):
    """small narrow paws (a runner's: compact, the toes close together)"""
    Q = mirror(P)
    a, _ = CV.paw(Q, C.PAW_F, F_TOES, pad=(0.0096, 0.0078, 0.0098), claw=None, yaw=0.04)
    b, _ = CV.paw(Q, C.PAW_H, H_TOES, pad=(0.0092, 0.0076, 0.0098), claw=None, yaw=0.03)
    dw = round_cone(Q, V(C.XF - 0.0065, 0.022, 0.09), V(C.XF - 0.0082, 0.016, 0.095), 0.0023, 0.0016)
    return np.minimum(smin(a, dw, 0.003), b), np.full(len(P), 1.0, F)


C.trunk, C.neck, C.head, C.hleg, C.ear, C.paws = trunk, neck, head, hleg, ear, paws
C.PATCHES = [p for p in C.PATCHES[:3]] + [
    (V(0.016, -0.001, 0.08), V(0.058, 0.02, 0.124), 0.0004), (V(0.018, -0.001, -0.18), V(0.062, 0.02, -0.13), 0.0004)]
C.PREVIEW = dict(C.PREVIEW, face=((0.1, 0.3, 0.55), (0, 0.288, 0.215), 22), headside=((0.42, 0.29, 0.21), (0, 0.288, 0.215), 18),
                 headfront=((0.0, 0.295, 0.65), (0, 0.288, 0.215), 16), head3q=((0.24, 0.31, 0.48), (0, 0.288, 0.215), 18))


# ---------- the coat ----------
C.FUR = {'len': 0.016, 'n': 4, 'lean': 1.7, 'tile': 0.0011, 'babyLen': 2.0, 'babyLean': 0.45, 'shade': 0.64, 'quality': 76}
_fur = C.fur


def _mantle(R, Pm, N):
    """the top of the head, the nape and the back down to the tail's root (the cub's long silvery mantle, the adult's
    short crest on the nape)"""
    L = R['L']
    hd = R['head']
    top = sstep(0.25, 0.75, N[:, 1])
    nape = sstep(0.0, 0.4, N[:, 1] - 0.6 * N[:, 2]) * sstep(0.1, 0.13, Pm[:, 2])
    back = np.maximum(top, nape) * (1 - hd) * (1 - R['tail']) * sstep(-0.215, -0.17, Pm[:, 2]) * sstep(0.17, 0.2, Pm[:, 1]) * sstep(0.03, 0.018, Pm[:, 0])
    crown = top * hd * sstep(0.045, 0.025, L[:, 2]) * sstep(0.01, 0.02, L[:, 1]) * (1 - R['ear'])
    return np.clip(back + crown, 0, 1)


def fur(P, N, c):
    R = C._regions(P, N, c)
    ln, de = _fur(P, N, c)
    ln = ln * 0.55 + _mantle(R, R['Pm'], N) * (0.0022 + 0.0035 * sstep(0.08, 0.15, R['Pm'][:, 2]))
    tl = R['tail']
    # the bushy white tip of the tail
    ln = ln * (1 - tl) + tl * (0.0068 + 0.006 * sstep(0.88, 0.96, R['tt'])) * sstep(1.25, 1.6, R['ring'])
    return np.clip(ln, 0, C.FUR['len']).astype(F), de


KL = {
    'gold': hexc(0xB48A4E), 'back': hexc(0xA67A3C), 'pale': hexc(0xC6A66E), 'white': hexc(0xDCD4C0), 'spot': hexc(0x1A1410),
    'spotHi': hexc(0x3E2E1E), 'nose': hexc(0x2C2422), 'lip': hexc(0x16110E), 'earIn': hexc(0xCEC0A6), 'ear': hexc(0x241C16),
    'pad': hexc(0x2E2420), 'lid': hexc(0x120E0C), 'tear': hexc(0x15100C), 'cream': hexc(0xCDBC98),
}


def _seg(Q, a, b):
    ab = b - a
    t = np.clip(((Q - a) @ ab) / float(ab @ ab), 0, 1)
    return np.linalg.norm(Q - (a + t[:, None] * ab), axis=1)


# the tear line in head frame units (up, along; it runs over the +x side of the face, so a line in these two is a line
# on the skin): from the inner corner of the eye down beside the nose, round the whisker pad to the corner of the mouth
_TEAR = np.array([(0.0065, 0.0712), (0.003, 0.0742), (-0.006, 0.079), (-0.015, 0.0805), (-0.022, 0.076), (-0.0245, 0.068)], F)


def _tear(L):
    Q = L[:, 1:3]
    d = np.min([_seg(Q, a, b) for a, b in zip(_TEAR[:-1], _TEAR[1:])], 0)
    hw = 0.0019 + 0.0006 * sstep(0.0, -0.02, L[:, 1])
    return sstep(hw + 0.0005, hw - 0.0003, d) * sstep(0.004, 0.007, L[:, 0])


def _marks(R, Pm, N):
    """solid round spots (smaller on the legs and the head, few on the belly), the tear lines, the tail's rings and white
    tip; spots are laid out in the cheetah's own height, so the stretched legs do not stretch them"""
    L = R['L']
    X = WARP.fwd(Pm)
    y = Pm[:, 1]
    hd, tl = R['head'], R['tail']
    leg = sstep(0.15, 0.11, y) * (1 - tl) * (1 - hd)
    body = (1 - hd) * (1 - tl)
    warp = np.stack([fbm(X * 70 + k, 2, 80 + k) for k in range(3)], 1) - 0.5
    f1, _ = worley(X / 0.0146 + warp * 0.45, 81)
    rb = 0.3 + 0.05 * (fbm(X * 30, 2, 82) - 0.5)
    sp_body = sstep(rb + 0.035, rb - 0.035, f1) * body * (1 - leg)
    g1, _ = worley(X / 0.0105 + warp * 0.35, 83)
    sp_leg = sstep(0.33, 0.26, g1) * leg * sstep(0.015, 0.03, y)
    h1, _ = worley(X / 0.0068 + warp * 0.25, 84)
    # head: small spots over the forehead, crown and cheeks, none on the muzzle or round the eyes
    sp_head = sstep(0.34, 0.25, h1) * hd * sstep(0.072, 0.06, L[:, 2]) * sstep(-0.012, -0.004, L[:, 1]) * (1 - R['ear']) * sstep(1.4, 1.9, R['ring'])
    under = sstep(-0.3, -0.7, N[:, 1])
    tt = R['tt']
    t1, _ = worley(X / 0.0145 + warp * 0.4, 85)
    sp_tail = sstep(0.34, 0.27, t1) * tl * sstep(0.62, 0.52, tt)
    rings = sstep(0.14, 0.06, np.abs(np.mod(tt * 13.0 + 0.25 * warp[:, 0], 1.0) - 0.5) - 0.24) * tl * sstep(0.52, 0.6, tt) * sstep(0.905, 0.885, tt)
    tear = _tear(L) * hd
    spots = np.clip(np.maximum.reduce([sp_body * (1 - under * 0.85), sp_leg * (1 - under * 0.5), sp_head, sp_tail, rings]), 0, 1)
    return spots, tear, sstep(0.9, 0.93, tt) * tl


def paint(P, N, c):
    R = C._regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    M = C._tabby(R, Pm, N)
    n1 = fbm(Pm * 25, 3, 11)
    n2 = fbm(Pm * 140, 3, 12)
    # golden tawny, richer along the back, paler low on the sides, white underneath
    col = np.tile(KL['gold'], (len(P), 1))
    col = mix(col, KL['back'], R['top'] * 0.6 * (1 - R['head'] * 0.5))
    col = mix(col, KL['pale'], sstep(0.1, -0.4, N[:, 1]) * 0.6)
    col *= (0.94 + 0.12 * n1)[:, None]
    hd = R['head']
    pale = np.maximum(M['pale'] - M['eyering'] * 0.45 - M['pads'] * 0.85, 0)
    under = np.clip(np.maximum(sstep(-0.4, -0.8, N[:, 1]) * (1 - hd), pale * 0.85), 0, 1)
    col = mix(col, KL['white'], under * 0.85)
    # cream whisker pads, the lips and chin white, a white crescent under each eye
    col = mix(col, KL['cream'], M['pads'] * sstep(-0.006, -0.012, L[:, 1]) * 0.75)
    El = C.EYE.loc(Pm)
    below = sstep(0.0, -0.004, El[:, 1] - C.EYE.off)
    col = mix(col, KL['white'], np.clip(M['eyering'] * below * 0.7, 0, 1))
    spots, tear, tip = _marks(R, Pm, N)
    col = mix(col, KL['spotHi'], sstep(0.05, 0.5, spots) * 0.6)
    col = mix(col, KL['spot'] * (0.9 + 0.2 * n2[:, None]), sstep(0.4, 0.85, spots) * 0.92)
    col = mix(col, KL['tear'], tear * 0.95)
    col = mix(col, KL['white'], tip * 0.9)
    # ears: dark backs, pale insides
    col = mix(col, KL['ear'], R['ear'] * (1 - R['earIn']) * 0.75 * sstep(0.019, 0.01, R['ea']))
    col = mix(col, KL['earIn'], R['ear'] * R['earIn'] * 0.8)
    nose = mix(np.tile(KL['nose'], (len(P), 1)), KL['lip'], sstep(0.4, 0.8, n2) * 0.3)
    col = mix(col, nose, R['nose'])
    col = mix(col, KL['lip'], np.clip(R['phil'] * 0.6 + R['lip'] * 0.9, 0, 1))
    col = mix(col, KL['lid'], R['lid'])
    col = mix(col, KL['pad'], R['pad'] * R['paw'])
    s, tone = C._strands(P, N, R)
    col *= (1 + s * 0.22 * (tone - 0.4) - 0.06 * (1 - s))[:, None]
    col = mix(col, C.K['ball'], R['ball'])
    rough = 0.7 + 0.08 * (n2 - 0.5) - 0.25 * R['nose'] - 0.3 * R['lid'] - 0.15 * R['lip']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def baby_paint(P, N, c, col):
    """cubs: smoky dark, darkest on the legs and the belly, with the long silvery gray mantle along the back; the spots
    show only faintly through, the tear lines and the face stay"""
    R = C._regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['lip'] + R['phil'] + R['pad'] * R['paw'] + R['ear'] * R['earIn'], 0, 1)
    n2 = fbm(Pm * 140, 3, 12)
    spots, tear, tip = _marks(R, Pm, N)
    dark = mix(np.tile(hexc(0x3A3530), (len(P), 1)), hexc(0x24201C), np.clip(sstep(0.1, -0.5, N[:, 1]) + sstep(0.14, 0.08, Pm[:, 1]), 0, 1))
    dark *= (0.9 + 0.2 * n2)[:, None]
    dark = mix(dark, hexc(0x1A1612), sstep(0.4, 0.85, spots) * 0.45)
    mant = _mantle(R, Pm, N)
    mant = np.clip(mant * sstep(0.1, 0.5, mant) * 1.3, 0, 1) * (0.85 + 0.3 * (n2 - 0.5))
    dark = mix(dark, hexc(0xA4A098), np.clip(mant, 0, 1) * 0.95)
    # the face a little paler about the eyes and cheeks
    face = R['head'] * sstep(0.085, 0.05, L[:, 2]) * sstep(0.4, -0.1, N[:, 1])
    dark = mix(dark, hexc(0x67615A), face * 0.55)
    dark = mix(dark, hexc(0x0E0B09), tear * 0.9)
    dark = mix(dark, hexc(0x8E8A82), tip * 0.6)
    out = mix(col, dark, 1 - keep)
    return np.clip(out, 0, 1).astype(F)


C.paint, C.fur, C.baby_paint = paint, fur, baby_paint
C.KITTEN = dict(c=V(0.0, 0.2, -0.035), r=(0.045, 0.047, 0.17), rb=0.068, e=2.1, maxd=0.02)
_baby_offset = C.baby_offset


def baby_offset(P, N, c):
    """the cat's round kitten body, and the mantle: a ridge of long hair standing up along the back"""
    d = _baby_offset(P, N, c)
    R = C._regions(P, N, c)
    m = _mantle(R, R['Pm'], N) * (1 - R['ear'])
    return (d + N * (0.0065 * m)[:, None]).astype(F)


C.baby_offset = baby_offset
_cards = C.cards


def cards():
    # shorter whiskers on the small head
    out = _cards()
    for cd in out:
        r = cd['pts'][0]
        cd['pts'] = (r + (cd['pts'] - r) * 0.8).astype(F)
        if cd.get('baby') is not None:
            cd['baby'] = (r + (cd['baby'] - r) * 0.8).astype(F)
    return out


C.cards = cards
_meta = C.meta


def meta(st):
    m = _meta(st)
    # amber eyes with round pupils (cubs' are gray-blue)
    m['eye'].update({'iris': 0xB27A2E, 'rim': 0x5A3A14, 'pupil': 'round', 'pupilR': 0.34, 'babyIris': 0x5C6A76, 'babyLidCol': 0x2A2622, 'lidCol': 0x161210})
    m.update({'flat': 0xB0884E, 'rim': [0.2, 0.14, 0.08]})
    return m


C.meta = meta


def hair_texture():
    """white whiskers"""
    import smallfur as SF
    wh = [(0.0, (0.86, 0.84, 0.8)), (1.0, (0.97, 0.96, 0.94))]
    cols = [dict(kind='hair', stops=wh, n=12, wid=1.8, end=(0.95, 1.0), wave=0.02, root=1.0) for _ in range(3)]
    return SF.strand_texture((96, 128), cols, seed=29)


C.hair_texture = hair_texture
C.MAP_QUALITY = (60, 54)
C.BABY_TEX = 256
bigcat.install(globals(), C, KS, warp=WARP)
