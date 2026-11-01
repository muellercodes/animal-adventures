# A Siamese cat (round 7), sculpted on the cat's skeleton with cat.py as the template: a slim, long body on slender
# legs with small oval paws, a long thin whip of a tail, a long wedge shaped head (straight profile, flat cheeks, a
# long narrow muzzle) with big ears set low and wide that carry on the lines of the wedge, and almond shaped, slanted
# eyes. The coat is short, fine and close lying: cream to ivory with dark seal-brown points (the mask over the face,
# the ears, the legs and the tail), a dark nose and pads, bright blue eyes. Kittens are nearly all cream with faint
# points (the points darken with age).
import os
import numpy as np
from sdf import V, nrm

_T = [  # the cat's trunk, slimmer and with the belly tucked up a little
    (-0.205, 0.222, 0.205, 0.19, 0.016, 2.0, 2.0),
    (-0.19, 0.234, 0.206, 0.176, 0.031, 2.1, 2.0),
    (-0.16, 0.242, 0.208, 0.168, 0.041, 2.2, 2.0),
    (-0.12, 0.247, 0.21, 0.176, 0.042, 2.3, 2.0),
    (-0.08, 0.249, 0.208, 0.17, 0.04, 2.3, 2.0),
    (-0.03, 0.247, 0.204, 0.15, 0.043, 2.3, 2.0),
    (0.02, 0.244, 0.2, 0.134, 0.046, 2.3, 2.0),
    (0.06, 0.242, 0.196, 0.127, 0.045, 2.3, 2.0),
    (0.1, 0.24, 0.195, 0.129, 0.04, 2.2, 2.0),
    (0.125, 0.232, 0.193, 0.141, 0.034, 2.1, 2.0),
    (0.14, 0.221, 0.192, 0.157, 0.026, 2.0, 2.0),
]
_NECK = [
    (0.2, 0.09, 0.038, 0.044, 0.038, 2.0, 2.0),
    (0.222, 0.135, 0.031, 0.037, 0.032, 2.0, 2.0),
    (0.248, 0.163, 0.026, 0.03, 0.028, 2.0, 2.0),
    (0.274, 0.181, 0.023, 0.025, 0.025, 2.0, 2.0),
    (0.29, 0.188, 0.02, 0.022, 0.021, 2.0, 2.0),
]
# the wedge: the top line runs straight from the crown down to the nose, the sides narrow evenly to a long muzzle
_HEAD = [
    (-0.006, 0.014, 0.0, -0.018, 0.02, 2.2, 2.0),
    (0.006, 0.024, -0.002, -0.026, 0.031, 2.3, 2.0),
    (0.02, 0.0275, -0.004, -0.029, 0.0345, 2.3, 2.0),
    (0.036, 0.0245, -0.006, -0.0295, 0.0305, 2.2, 2.0),
    (0.052, 0.0195, -0.008, -0.0285, 0.0262, 2.1, 2.0),
    (0.068, 0.0148, -0.0095, -0.0265, 0.0218, 2.0, 2.0),
    (0.083, 0.0102, -0.0105, -0.024, 0.0175, 2.0, 2.0),
    (0.096, 0.0058, -0.011, -0.021, 0.0135, 2.0, 2.0),
    (0.106, 0.0018, -0.011, -0.0172, 0.0098, 2.0, 2.0),
]
_FORE = [
    (0.205, 0.118, 0.022, 0.024, 0.017, 2.0, 2.0, 0.03),
    (0.175, 0.112, 0.021, 0.023, 0.016, 2.0, 2.0, 0.034),
    (0.14, 0.092, 0.016, 0.02, 0.0135, 2.1, 2.1, 0.037),
    (0.11, 0.074, 0.0128, 0.0152, 0.0117, 2.2, 2.2, 0.038),
    (0.08, 0.078, 0.01, 0.0108, 0.01, 2.2, 2.2, 0.038),
    (0.05, 0.084, 0.0083, 0.0083, 0.0087, 2.2, 2.2, 0.038),
    (0.032, 0.089, 0.008, 0.008, 0.0083, 2.2, 2.2, 0.038),
    (0.02, 0.094, 0.0076, 0.0076, 0.008, 2.2, 2.2, 0.038),
    (0.012, 0.098, 0.0078, 0.0078, 0.0082, 2.2, 2.2, 0.038),
]
_HIND = [
    (0.215, -0.14, 0.029, 0.033, 0.022, 2.0, 2.0, 0.03),
    (0.18, -0.13, 0.03, 0.035, 0.024, 2.0, 2.0, 0.036),
    (0.145, -0.108, 0.022, 0.029, 0.018, 2.1, 2.0, 0.04),
    (0.115, -0.089, 0.0142, 0.02, 0.0142, 2.2, 2.1, 0.041),
    (0.09, -0.125, 0.0107, 0.0158, 0.0115, 2.2, 2.2, 0.041),
    (0.065, -0.172, 0.0084, 0.0107, 0.0092, 2.2, 2.2, 0.041),
    (0.04, -0.168, 0.0079, 0.0079, 0.0084, 2.2, 2.2, 0.041),
    (0.02, -0.162, 0.0079, 0.0079, 0.0087, 2.2, 2.2, 0.041),
    (0.012, -0.157, 0.0081, 0.0081, 0.009, 2.2, 2.2, 0.041),
]
# a long thin whip of a tail
_TAIL = [(0.207, -0.185, 0.0108), (0.203, -0.205, 0.0098), (0.193, -0.245, 0.009), (0.183, -0.28, 0.0085), (0.167, -0.32, 0.008),
         (0.15, -0.36, 0.0075), (0.13, -0.395, 0.007), (0.114, -0.428, 0.0063), (0.104, -0.448, 0.005), (0.099, -0.458, 0.0028)]
BREED = dict(
    ID='siamese', BOUNDS=(V(-0.085, 0.0, -0.47), V(0.085, 0.38, 0.31)),
    TRUNK=_T, NECK=_NECK, HEAD=_HEAD, FORE=_FORE, HIND=_HIND, TAIL=_TAIL,
    # almond eyes, slanted up toward the ears, a little further forward on the longer head
    EYE_AT=(0.067, 0.0055, 0.0163), EYE_R=0.0085, EYE_D=V(0.36, 0.08, 0.93), LID_W=0.0079, LID_H=0.0045, SLANT=0.3, LID_OFF=0.0004,
    SINK=0.58,
    NOSE_S=0.106, MOUTH_AT=(0.096, -0.0245),
    # big ears set low and wide, leaning out along the lines of the wedge
    EAR_B=V(0.026, 0.301, 0.193), EAR_A=[0.5, 0.86, -0.06], EAR_N=[0.44, -0.08, 0.9], EAR_L=0.054, EAR_W=0.026,
    BOX=dict(neck=((-0.075, 0.12, 0.0), (0.075, 0.34, 0.25)), head=((-0.065, 0.23, 0.15), (0.065, 0.345, 0.305)),
             eyes=((-0.04, 0.275, 0.215), (0.04, 0.32, 0.275)), ear=((-0.085, 0.28, 0.155), (0.085, 0.375, 0.235)),
             fleg=((-0.075, -0.005, 0.03), (0.075, 0.26, 0.16)), hleg=((-0.075, -0.005, -0.23), (0.075, 0.27, -0.04)),
             paws=((-0.065, -0.005, -0.19), (0.065, 0.03, 0.13)), tail=((-0.03, 0.06, -0.47), (0.03, 0.235, -0.16))),
)
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cat.py')).read(), 'cat.py', 'exec'))

PATCHES = [
    (EYE.c * V(0, 1, 1) + V(0.004, -0.014, -0.014), EYE.c * V(0, 1, 1) + V(0.03, 0.014, 0.016), 0.0003),   # eye and lids
    (HF.pt(0.08, 0.0) * V(0, 1, 1) + V(0.0, -0.042, -0.004), HF.pt(0.113, 0.0) * V(0, 1, 1) + V(0.02, 0.012, 0.004), 0.0003),  # muzzle
    (V(0.01, 0.292, 0.17), V(0.07, 0.37, 0.218), 0.0004),                                                      # ear
    (V(0.018, -0.001, 0.082), V(0.058, 0.019, 0.122), 0.0004),                                                 # front paw
    (V(0.02, -0.001, -0.178), V(0.062, 0.019, -0.132), 0.0004),                                                # hind paw
]


def trunk(P):
    Q = mirror(P)
    d = loft(Q, TRUNK)
    d = smin(d, round_cone(Q, V(0.028, 0.18, 0.12), V(0.019, 0.235, 0.09), 0.014, 0.011), 0.02)   # shoulder blades
    d = smin(d, ellipsoid(Q, V(0.0, 0.166, 0.128), V(0.022, 0.027, 0.018)), 0.02)                   # breast
    d = smin(d, ellipsoid(Q, V(0.0, 0.157, -0.075), V(0.023, 0.012, 0.045)), 0.03)                  # a small belly flap
    d = smin(d, flat_cone(Q, V(0.025, 0.172, -0.065), V(0.032, 0.138, -0.09), 0.009, 0.008, 0.9), 0.015)
    return d


def neck(P):
    Q = mirror(P)
    d = sweep(Q, NECK)
    return smin(d, ellipsoid(Q, V(0.0, 0.2, 0.15), V(0.022, 0.023, 0.019)), 0.02)


def head(P):
    Q = mirror(P)
    L = HF.loc(Q)
    d = loft(L, HEAD)
    # flat cheeks (no round jowls), a faint brow, the long straight nose
    d = smin(d, ellipsoid(L, V(0.02, -0.016, 0.042), V(0.011, 0.012, 0.02)), 0.012)
    d = smin(d, round_cone(L, V(0.007, 0.0145, 0.058), V(0.018, 0.014, 0.062), 0.0032, 0.0028), 0.006)
    # narrow whisker pads along the long muzzle, a small chin
    d = smin(d, ellipsoid(L, V(0.0068, -0.0145, 0.093), V(0.0068, 0.0066, 0.011)), 0.006)
    d = smin(d, ellipsoid(L, V(0.0, -0.0235, 0.09), V(0.0066, 0.005, 0.0105)), 0.005)
    NL = L - V(0.0, -0.0048, NOSE_S - 0.0022)
    NL[:, 0] = NL[:, 0] / (1.0 + 85.0 * np.clip(NL[:, 1], -0.0042, 0.0042))
    d = smin(d, ellipsoid(NL, V(0.0, 0.0, 0.0), V(0.0043, 0.0033, 0.0027)), 0.0025)
    M = L * V(1, 2.0, 1)
    m = round_cone(M, V(0.0, -0.0105 * 2.0, NOSE_S + 0.001), V(0.0, -0.0215 * 2.0, NOSE_S - 0.004), 0.0004, 0.0004)
    m = smin(m, round_cone(M, V(0.0, -0.0215 * 2.0, NOSE_S - 0.004), V(0.0105, -0.0245 * 2.0, 0.088), 0.0004, 0.0004), 0.0006)
    m = smin(m, round_cone(M, V(0.0105, -0.0245 * 2.0, 0.088), V(0.016, -0.0235 * 2.0, 0.075), 0.0004, 0.0003), 0.0006)
    d = smax(d, -(m + 0.0002) / 2.0, 0.0005)
    nc = V(0.0026, -0.0045, NOSE_S + 0.0024)
    return smax(d, -ellipsoid(L, nc, V(0.001, 0.00075, 0.0011)), 0.0005)


def ear(P):
    Q = mirror(P)
    return CV.ear(Q, EAR_B, EAR_A, EAR_N, EAR_L, EAR_W, 'point', th0=0.0034, th1=0.0011, cup=0.8, tipin=-0.0018,
                  base_r=(0.0085, 0.006, 0.0048))


def fleg(P):
    Q = mirror(P)
    x = XF
    d = sweep(Q, FORE, mirror_x=False)
    d = smin(d, flat_cone(Q, V(0.033, 0.19, 0.122), V(0.037, 0.115, 0.074), 0.018, 0.013, 0.8), 0.015)
    d = smin(d, ellipsoid(Q, V(x - 0.002, 0.106, 0.064), V(0.0078, 0.0088, 0.0078)), 0.008)
    return smin(d, ellipsoid(Q, V(x + 0.001, 0.078, 0.082), V(0.0094, 0.025, 0.0102)), 0.008)


def hleg(P):
    Q = mirror(P)
    x = XH
    d = sweep(Q, HIND, mirror_x=False)
    d = smin(d, flat_cone(Q, V(0.033, 0.212, -0.145), V(0.039, 0.12, -0.094), 0.04, 0.016, 0.62), 0.025)
    d = smin(d, flat_cone(Q, V(0.031, 0.205, -0.18), V(0.038, 0.1, -0.15), 0.021, 0.011, 0.7), 0.02)
    d = smin(d, ellipsoid(Q, V(x, 0.092, -0.13), V(0.0095, 0.021, 0.011)), 0.01)
    return smin(d, ellipsoid(Q, V(x, 0.065, -0.178), V(0.0064, 0.008, 0.0066)), 0.005)


# small oval paws
F_TOES = [(0.0042, 0.0066, 0.0048, 0.0058, 0.0), (-0.0042, 0.0066, 0.0048, 0.0058, 0.0), (0.0099, 0.0008, 0.0044, 0.0052, 0.0004),
          (-0.0099, 0.0008, 0.0044, 0.0052, 0.0004)]
H_TOES = [(0.004, 0.0063, 0.0046, 0.0056, 0.0), (-0.004, 0.0063, 0.0046, 0.0056, 0.0), (0.0093, 0.0007, 0.0042, 0.005, 0.0004),
          (-0.0093, 0.0007, 0.0042, 0.005, 0.0004)]


def paws(P):
    Q = mirror(P)
    a, _ = CV.paw(Q, PAW_F, F_TOES, pad=(0.0095, 0.0078, 0.0098), claw=None, yaw=0.05)
    b, _ = CV.paw(Q, PAW_H, H_TOES, pad=(0.009, 0.0075, 0.0097), claw=None, yaw=0.03)
    dw = round_cone(Q, V(XF - 0.006, 0.021, 0.09), V(XF - 0.008, 0.015, 0.095), 0.0023, 0.0016)
    return np.minimum(smin(a, dw, 0.003), b), np.full(len(P), 1.0, F)


# ---------- the short, fine, close lying coat ----------
FUR = {'len': 0.014, 'n': 4, 'lean': 2.2, 'tile': 0.001, 'babyLen': 2.2, 'babyLean': 0.6, 'shade': 0.76, 'quality': 80}
_cat_fur = fur


def fur(P, N, c):
    ln, de = _cat_fur(P, N, c)
    return np.clip(ln * 0.45, 0, FUR['len']).astype(F), de


KS = {
    'cream': hexc(0xE9DDC4), 'fawn': hexc(0xCDB690), 'point': hexc(0x3A2A20), 'pointHi': hexc(0x5E4634), 'warm': hexc(0x8A6A50),
    'nose': hexc(0x3A2A26), 'earIn': hexc(0x6A5048), 'pad': hexc(0x3A2826), 'lid': hexc(0x1A120E), 'white': hexc(0xF4EEE2),
}


def _points(R, Pm, N):
    """how dark the seal points are (0 the cream body, 1 the darkest point)"""
    L = R['L']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    s, u = L[:, 2], L[:, 1]
    hd, tl = R['head'], R['tail']
    w1 = fbm(Pm * 40, 3, 81) - 0.5
    # the mask: the whole face from between the eyes down over the muzzle and chin, fading back over the cheeks
    eyes = sstep(0.02, 0.012, R['eyeD'])
    mask = np.maximum(sstep(0.05 + 0.01 * w1, 0.07, s + 0.25 * np.maximum(u, 0) - 0.15 * np.abs(x)), eyes * 0.85) * hd
    mask = np.maximum(mask, sstep(-0.012, -0.02, u) * sstep(0.04, 0.06, s) * hd)
    # tracings: faint lines from the mask up to the ears
    # the lids and the skin round the eyes belong to the mask (they are not part of the head's own field)
    ring = sstep(EYE.r + 0.009, EYE.r + 0.004, R['eyeD'])
    trace = sstep(0.004, 0.0015, np.abs(x - 0.012 - 0.1 * np.maximum(0.06 - s, 0))) * sstep(0.065, 0.03, s) * sstep(0.01, 0.02, u) * hd * 0.35
    ear = R['ear'] + sstep(0.003, -0.002, R['ea']) * 0.0
    # legs: darkening from the elbows and stifles down; the tail all dark
    front = sstep(0.0, 0.03, z)
    legs = sstep(0.11 + 0.04 * front + 0.01 * w1, 0.05 + 0.03 * front, y) * (1 - tl) * (1 - hd)
    tail = tl * sstep(0.0, 0.25, R['tt'])
    return np.clip(np.maximum.reduce([mask, ring, trace, ear, legs, tail]), 0, 1)


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    n1 = fbm(Pm * 25, 3, 11)
    n2 = fbm(Pm * 140, 3, 12)
    pt = _points(R, Pm, N)
    # the cream body, a fawn shading over the back and the flanks, paler under the chin and belly
    col = np.tile(KS['cream'], (len(P), 1))
    col = mix(col, KS['fawn'], R['top'] * 0.5 * (1 - R['head']))
    col = mix(col, KS['white'], sstep(-0.3, -0.8, N[:, 1]) * 0.45)
    col *= (0.96 + 0.08 * n1)[:, None]
    # the seal points: warm brown at their edges, nearly black in the middle
    col = mix(col, KS['warm'], sstep(0.05, 0.45, pt) * 0.9)
    col = mix(col, mix(np.tile(KS['point'], (len(P), 1)), KS['pointHi'], 0.3 * n1), sstep(0.35, 0.9, pt))
    col = mix(col, KS['earIn'], R['ear'] * R['earIn'] * 0.6)
    col = mix(col, KS['nose'], R['nose'])
    col = mix(col, KS['lid'], R['lid'] + R['lip'] * 0.4 + R['phil'] * 0.4)
    col = mix(col, KS['pad'], R['pad'] * R['paw'])
    s, tone = _strands(P, N, R)
    col *= (1 + s * 0.16 * (tone - 0.4) - 0.03 * (1 - s))[:, None]
    col = mix(col, K['ball'], R['ball'])
    rough = 0.58 + 0.06 * (n2 - 0.5) - 0.25 * R['nose'] - 0.3 * R['lid']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def baby_paint(P, N, c, col):
    """kittens are born white and their points come in slowly: nearly all cream, the ears, nose and tail a little fawn"""
    R = _regions(P, N, c)
    Pm = R['Pm']
    pt = _points(R, Pm, N)
    keep = np.clip(R['ball'] + R['lid'] + R['pad'] * R['paw'], 0, 1)
    out = mix(col, hexc(0xF2EADA), 0.82 * (1 - keep))
    # the first faint points: a fawn-gray shadow on the ears, round the nose and on the tail
    faint = np.clip(R['ear'] * (1 - R['earIn'] * 0.5) * 0.55 + pt * R['head'] * sstep(0.08, 0.1, R['L'][:, 2]) * 0.5 + pt * R['tail'] * 0.4, 0, 1)
    out = mix(out, hexc(0xA8907C), faint)
    out = mix(out, hexc(0x7A6258), R['nose'] * 0.7)
    return np.clip(out, 0, 1).astype(F)


_meta = meta


def meta(st):
    m = _meta(st)
    # bright blue almond eyes (kittens' too)
    m['eye'].update({'iris': 0x2E80DC, 'rim': 0x1A3A70, 'babyIris': 0x6A9ADA, 'babyLidCol': 0xC8BCA8, 'lid': [0.62, -0.5, 0.3]})
    m.update({'flat': 0xE6DCC4, 'rim': [0.18, 0.14, 0.1]})
    return m
