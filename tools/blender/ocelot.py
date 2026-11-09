# An ocelot (round 11) on the cat template (bigcat.py) at KS = 1.6: about 0.8 m from the nose to the rump, 0.4 m at the
# shoulder, a short tail. Sturdier than a house cat: a deeper, wider body, a thick neck, stout legs on big front paws (the
# "fat hands"), rounded ears, big eyes. The coat: tawny gold to buff gray, chains of open blotches edged in black with
# cinnamon centers along the flanks, four bold black stripes down the nape to the shoulders, two black stripes on each
# cheek, white rings round the eyes, spots on the head, legs and the white belly, a banded tail with a dark tip, black
# backs to the ears with a white spot on each. Kittens: grayer and fuzzier with bold dark spots, blue eyes.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, ellipsoid, round_cone, sweep, loft, fbm, worley
import carnivore as CV
from carnivore import mirror, mix, hexc
import bigcat

KS = 1.6
ID = 'ocelot'
# a shorter tail on the cat's three tail bones
_TAIL = [(0.207, -0.185, 0.014), (0.203, -0.205, 0.0134), (0.193, -0.245, 0.0127), (0.18, -0.285, 0.0121), (0.163, -0.322, 0.0115),
         (0.146, -0.355, 0.0108), (0.133, -0.38, 0.0099), (0.124, -0.396, 0.0084), (0.12, -0.404, 0.0045)]
# a sturdier body than the house cat's: deeper and wider, the belly lower
_TRUNK = [
    (-0.205, 0.224, 0.205, 0.184, 0.02, 2.0, 2.0),
    (-0.19, 0.236, 0.206, 0.167, 0.04, 2.1, 2.0),
    (-0.16, 0.245, 0.207, 0.156, 0.051, 2.2, 2.0),
    (-0.12, 0.25, 0.208, 0.158, 0.052, 2.3, 2.0),
    (-0.08, 0.252, 0.206, 0.151, 0.051, 2.3, 2.0),
    (-0.03, 0.25, 0.202, 0.134, 0.054, 2.3, 2.0),
    (0.02, 0.247, 0.198, 0.121, 0.057, 2.3, 2.0),
    (0.06, 0.245, 0.194, 0.116, 0.056, 2.3, 2.0),
    (0.1, 0.243, 0.193, 0.119, 0.05, 2.2, 2.0),
    (0.125, 0.235, 0.192, 0.132, 0.043, 2.1, 2.0),
    (0.14, 0.224, 0.191, 0.15, 0.032, 2.0, 2.0),
]
_NECK = [
    (0.2, 0.09, 0.045, 0.051, 0.045, 2.0, 2.0),
    (0.222, 0.135, 0.037, 0.043, 0.038, 2.0, 2.0),
    (0.248, 0.163, 0.031, 0.034, 0.032, 2.0, 2.0),
    (0.274, 0.181, 0.027, 0.028, 0.028, 2.0, 2.0),
    (0.29, 0.188, 0.022, 0.024, 0.024, 2.0, 2.0),
]
# a longer muzzle than the house cat's and a flatter forehead
_HEAD = [
    (-0.006, 0.016, 0.0, -0.019, 0.02, 2.2, 2.0),
    (0.008, 0.026, -0.002, -0.027, 0.032, 2.5, 2.0),
    (0.024, 0.0305, -0.004, -0.031, 0.0358, 2.6, 2.0),
    (0.04, 0.0305, -0.007, -0.033, 0.0362, 2.6, 2.1),
    (0.054, 0.0265, -0.009, -0.033, 0.0336, 2.4, 2.2),
    (0.066, 0.0195, -0.011, -0.032, 0.0292, 2.2, 2.3),
    (0.078, 0.0125, -0.012, -0.03, 0.0228, 2.2, 2.3),
    (0.089, 0.0065, -0.013, -0.027, 0.0182, 2.2, 2.2),
    (0.097, 0.0, -0.013, -0.022, 0.0122, 2.1, 2.1),
]
C = bigcat.load(dict(
    ID=ID, TRUNK=_TRUNK, NECK=_NECK, HEAD=_HEAD, TAIL=_TAIL, TAIL_TD=0.027, BOUNDS=(V(-0.08, 0.0, -0.42), V(0.08, 0.36, 0.3)),
    EYE_AT=(0.066, 0.006, 0.0178), EYE_R=0.0098, LID_W=0.0084, LID_H=0.0062, SLANT=0.16, NOSE_S=0.099, MOUTH_AT=(0.088, -0.026),
    # rounded ears, a little wider set than the house cat's
    EAR_B=V(0.026, 0.304, 0.195), EAR_A=[0.42, 0.9, -0.06], EAR_N=[0.4, -0.06, 0.92], EAR_L=0.034, EAR_W=0.0192,
    BOX=dict(neck=((-0.08, 0.12, 0.0), (0.08, 0.34, 0.25)), head=((-0.065, 0.23, 0.15), (0.065, 0.345, 0.3)),
             eyes=((-0.042, 0.272, 0.212), (0.042, 0.322, 0.27)), ear=((-0.065, 0.285, 0.165), (0.065, 0.36, 0.225)),
             fleg=((-0.08, -0.005, 0.03), (0.08, 0.26, 0.16)), hleg=((-0.08, -0.005, -0.23), (0.08, 0.27, -0.04)),
             paws=((-0.07, -0.005, -0.19), (0.07, 0.03, 0.135)), tail=((-0.03, 0.08, -0.42), (0.03, 0.235, -0.16))),
))
_trunk, _neck, _head, _fleg, _hleg = C.trunk, C.neck, C.head, C.fleg, C.hleg


def _stout(keys, lo, hi):
    # stouter legs: the sections scaled by lo at the foot up to hi at the top
    out = []
    for k in keys:
        f = lo + (hi - lo) * min(1.0, max(0.0, (k[0] - 0.02) / 0.18))
        out.append((k[0], k[1], k[2] * f, k[3] * f, k[4] * f) + tuple(k[5:]))
    return out


C.FORE, C.HIND = _stout(C.FORE, 1.24, 1.1), _stout(C.HIND, 1.14, 1.06)
_bone_tips = C.bone_tips


def bone_tips(P):
    t = _bone_tips(P)
    t['tail3'] = V(0, _TAIL[-1][0], _TAIL[-1][1])
    return t


C.bone_tips = bone_tips


def neck(P):
    Q = mirror(P)
    d = smin(sweep(Q, C.NECK), ellipsoid(Q, V(0.0, 0.198, 0.15), V(0.03, 0.03, 0.025)), 0.02)
    return d


def head(P):
    """the cat's head with a longer muzzle and narrower cheeks (the whisker pads, nose and mouth moved forward with it),
    and a low ridge down the bridge of the nose"""
    Q = mirror(P)
    L = C.HF.loc(Q)
    d = loft(L, C.HEAD)
    d = smin(d, ellipsoid(L, V(0.024, -0.015, 0.044), V(0.0135, 0.015, 0.02)), 0.012)                    # cheeks
    d = smin(d, round_cone(L, V(0.007, 0.016, 0.058), V(0.02, 0.0155, 0.06), 0.004, 0.0035), 0.006)        # brows
    d = smin(d, round_cone(L, V(0.0, 0.009, 0.064), V(0.0, 0.0035, 0.091), 0.006, 0.0045), 0.006)         # nose bridge
    d = smin(d, ellipsoid(L, V(0.0098, -0.016, 0.0865), V(0.0104, 0.0094, 0.0108)), 0.005)               # whisker pads
    d = smin(d, ellipsoid(L, V(0.0, -0.028, 0.0825), V(0.0085, 0.0058, 0.0098)), 0.004)                  # chin
    ns = C.NOSE_S
    NL = L - V(0.0, -0.0048, ns - 0.0022)
    NL[:, 0] = NL[:, 0] / (1.0 + 85.0 * np.clip(NL[:, 1], -0.0042, 0.0042))
    d = smin(d, ellipsoid(NL, V(0.0, 0.0, 0.0), V(0.0052, 0.0037, 0.0029)), 0.0025)                      # nose leather
    M = L * V(1, 2.0, 1)
    m = round_cone(M, V(0.0, -0.011 * 2.0, ns + 0.001), V(0.0, -0.0225 * 2.0, ns - 0.004), 0.0004, 0.0004)
    m = smin(m, round_cone(M, V(0.0, -0.0225 * 2.0, ns - 0.004), V(0.012, -0.0255 * 2.0, 0.081), 0.0004, 0.0004), 0.0006)
    m = smin(m, round_cone(M, V(0.012, -0.0255 * 2.0, 0.081), V(0.018, -0.0245 * 2.0, 0.068), 0.0004, 0.0003), 0.0006)
    d = smax(d, -(m + 0.0002) / 2.0, 0.0005)
    d = smax(d, -ellipsoid(L, V(0.0028, -0.0045, ns + 0.0025), V(0.0011, 0.0008, 0.0012)), 0.0005)      # nostrils
    return d


def fleg(P):
    Q = mirror(P)
    return smin(_fleg(P), ellipsoid(Q, V(C.XF + 0.001, 0.07, 0.083), V(0.013, 0.03, 0.014)), 0.01)


def ear(P):
    Q = mirror(P)
    return CV.ear(Q, C.EAR_B, C.EAR_A, C.EAR_N, C.EAR_L, C.EAR_W, 'round', th0=0.0036, th1=0.0019, cup=0.8, tipin=0.0,
                  base_r=(0.0075, 0.0055, 0.0045))


# big front paws, the hind ones a little smaller
F_TOES = [(0.0055, 0.0078, 0.0063, 0.0071, 0.0), (-0.0055, 0.0078, 0.0063, 0.0071, 0.0), (0.0131, 0.0007, 0.0058, 0.0064, 0.0004),
          (-0.0131, 0.0007, 0.0058, 0.0064, 0.0004)]
H_TOES = [(0.0048, 0.007, 0.0056, 0.0065, 0.0), (-0.0048, 0.007, 0.0056, 0.0065, 0.0), (0.0114, 0.0006, 0.0052, 0.0059, 0.0004),
          (-0.0114, 0.0006, 0.0052, 0.0059, 0.0004)]


def paws(P):
    Q = mirror(P)
    a, _ = CV.paw(Q, C.PAW_F, F_TOES, pad=(0.0126, 0.0094, 0.0121), claw=None, yaw=0.06)
    b, _ = CV.paw(Q, C.PAW_H, H_TOES, pad=(0.0112, 0.0088, 0.0112), claw=None, yaw=0.04)
    dw = round_cone(Q, V(C.XF - 0.008, 0.024, 0.09), V(C.XF - 0.01, 0.017, 0.095), 0.003, 0.002)
    return np.minimum(smin(a, dw, 0.003), b), np.full(len(P), 1.0, F)


C.neck, C.head, C.fleg, C.ear, C.paws = neck, head, fleg, ear, paws
C.PATCHES = [p for p in C.PATCHES[:3]] + [
    (V(0.014, -0.001, 0.078), V(0.062, 0.022, 0.126), 0.0004), (V(0.016, -0.001, -0.182), V(0.066, 0.022, -0.128), 0.0004)]


# ---------- the coat ----------
C.FUR = {'len': 0.016, 'n': 4, 'lean': 1.8, 'tile': 0.0011, 'babyLen': 1.7, 'babyLean': 0.55, 'shade': 0.66, 'quality': 78}
_fur = C.fur


def fur(P, N, c):
    ln, de = _fur(P, N, c)
    return np.clip(ln * 0.62, 0, C.FUR['len']).astype(F), de


KL = {
    'gold': hexc(0xAE8654), 'back': hexc(0x9C7444), 'buff': hexc(0xBEA27A), 'white': hexc(0xDCD6C8), 'black': hexc(0x17120E),
    'edge': hexc(0x3A2A1C), 'cinn': hexc(0x8E6232), 'nose': hexc(0xA86A5E), 'noseRim': hexc(0x2C1E18), 'earIn': hexc(0xD2C2AE),
    'pad': hexc(0x3A2826), 'lid': hexc(0x15100C),
}


def _marks(R, Pm, N, M):
    """the ocelot's pattern as masks: black (outlines, stripes, spots) and inner (the blotches' cinnamon centers)"""
    L = R['L']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    hd, tl = R['head'], R['tail']
    leg = sstep(0.155, 0.115, y) * (1 - tl) * (1 - hd)
    body = (1 - hd) * (1 - tl) * (1 - leg)
    up = np.clip(N[:, 1], -1, 1)
    warp = np.stack([fbm(Pm * 70 + k, 2, 60 + k) for k in range(3)], 1) - 0.5
    # chains of open blotches along the flanks: cells long along the body, sloping down toward the rear
    A = np.stack([x / 0.016, (y + 0.22 * z) / 0.0125, (z - 0.25 * y) / 0.03], 1) + warp * 0.55
    f1, f2 = worley(A, 61)
    blot = sstep(0.62, 0.5, f1)
    rim = blot * sstep(0.3, 0.42, f1) * sstep(0.3, 0.5, fbm(Pm * 110, 2, 62) + 0.12)
    inner = blot * sstep(0.42, 0.3, f1)
    chain = (rim + 0.25 * sstep(0.08, 0.02, f2 - f1) * blot) * body * sstep(0.95, 0.75, up) * sstep(-0.205, -0.18, z) * sstep(0.12, 0.09, z)
    # the nape stripes: four bold lines from the crown down the neck, breaking into streaks over the shoulders
    nape = C._bars(x / 0.0105 + 0.5, 0.2, 0.25 * warp[:, 0]) * sstep(0.3, 0.7, up) * sstep(0.07, 0.12, z) * (1 - hd) * sstep(0.03, 0.022, x)
    nape = nape * sstep(0.35, 0.5, fbm(Pm * 50, 2, 63) + 0.2 * sstep(0.12, 0.16, z))
    # solid spots on the legs and the belly, small ones on the head
    g1, _ = worley(Pm / 0.0085 + warp * 0.3, 64)
    sp_leg = sstep(0.36, 0.26, g1) * leg * sstep(0.018, 0.03, y)
    b1, _ = worley(Pm / 0.012 + warp * 0.3, 65)
    sp_belly = sstep(0.38, 0.28, b1) * sstep(-0.3, -0.6, up) * (1 - hd) * (1 - tl) * sstep(0.15, 0.12, y)
    h1, _ = worley(Pm / 0.0052 + warp * 0.2, 66)
    sp_head = sstep(0.34, 0.24, h1) * hd * sstep(0.072, 0.058, L[:, 2]) * sstep(0.004, 0.012, L[:, 1]) * (1 - R['ear']) * sstep(1.5, 1.9, R['ring'])
    # the tail: bands, broken underneath, and a dark tip
    tt = R['tt']
    bands = C._bars(tt * C.TAIL_LEN / (0.026 - 0.006 * tt) + 0.3, 0.24, 0.15 * warp[:, 0]) * tl * sstep(0.05, 0.15, tt) * (1 - 0.6 * sstep(-0.2, -0.7, N[:, 1]))
    tip = tl * sstep(0.9, 0.95, tt)
    black = np.clip(np.maximum.reduce([chain, nape * 0.95, sp_leg * 0.9, sp_belly * 0.9, sp_head * 0.9, bands * 0.95, tip]), 0, 1)
    return black, np.clip(inner * body * sstep(0.95, 0.75, up) * (1 - sstep(-0.3, -0.6, up)), 0, 1)


def _face(R, Pm, N):
    """the two black stripes on each cheek, the crown lines, white rings round the eyes"""
    L = R['L']
    x = Pm[:, 0]
    s, u = L[:, 2], L[:, 1]
    hd = R['head']
    cheek1 = sstep(0.0028, 0.0012, np.abs(u - 0.0035 + 0.45 * (s - 0.058))) * sstep(0.06, 0.052, s) * sstep(0.02, 0.028, s) * sstep(0.02, 0.026, x)
    cheek2 = sstep(0.0028, 0.0012, np.abs(u + 0.012 + 0.45 * (s - 0.054))) * sstep(0.062, 0.05, s) * sstep(0.016, 0.026, s) * sstep(0.02, 0.028, x)
    crown = C._bars(x / 0.0072 + 0.5, 0.2, 0.15 * (fbm(Pm * 150, 2, 67) - 0.5)) * sstep(0.046, 0.034, s) * sstep(0.014, 0.022, u) * sstep(0.02, 0.012, x)
    # the dark line from the inner corner of the eye down beside the nose
    tear = sstep(0.0018, 0.0008, np.abs(x - 0.0105 + 0.25 * (u + 0.004))) * sstep(0.004, -0.001, u) * sstep(-0.012, -0.008, u) * sstep(0.07, 0.076, s)
    lines = np.clip(np.maximum.reduce([cheek1, cheek2 * 0.95, crown * 0.85, tear * 0.6]), 0, 1) * hd
    ring = sstep(1.4, 1.22, R['ring']) * sstep(1.0, 1.08, R['ring']) * hd
    return lines, ring


def paint(P, N, c):
    R = C._regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    M = C._tabby(R, Pm, N)
    n1 = fbm(Pm * 25, 3, 11)
    n2 = fbm(Pm * 140, 3, 12)
    # tawny gold, darker along the back, buff low on the sides, white underneath
    col = np.tile(KL['gold'], (len(P), 1))
    col = mix(col, KL['back'], R['top'] * 0.55 * (1 - R['head'] * 0.5))
    col = mix(col, KL['buff'], sstep(0.1, -0.4, N[:, 1]) * 0.6)
    col *= (0.93 + 0.14 * n1)[:, None]
    under = np.clip(np.maximum(sstep(-0.35, -0.75, N[:, 1]) * (1 - R['head']), M['pale']), 0, 1)
    col = mix(col, KL['white'], under * 0.88)
    black, inner = _marks(R, Pm, N, M)
    lines, ring = _face(R, Pm, N)
    col = mix(col, KL['cinn'], inner * 0.6)
    col = mix(col, KL['white'], ring * 0.85)
    col = mix(col, KL['edge'], sstep(0.05, 0.5, black) * 0.65)
    col = mix(col, KL['black'] * (0.9 + 0.2 * n2[:, None]), np.clip(sstep(0.4, 0.9, black) * 0.9 + lines * 0.92, 0, 1))
    # ears: black backs with a white spot in the middle, pale insides
    back = R['ear'] * (1 - R['earIn'])
    spot = sstep(0.006, 0.0035, np.hypot(R['ea'] - 0.45 * C.EAR_L, R['ec']))
    col = mix(col, KL['black'], back * 0.9)
    col = mix(col, KL['white'], back * spot * 0.85)
    col = mix(col, KL['earIn'], R['ear'] * R['earIn'] * 0.8)
    nose = mix(np.tile(KL['nose'], (len(P), 1)), KL['noseRim'], sstep(0.4, 0.8, n2) * 0.15)
    col = mix(col, nose, R['nose'])
    col = mix(col, KL['noseRim'], R['phil'] * 0.45 + R['lip'] * 0.5)
    col = mix(col, KL['lid'], R['lid'])
    col = mix(col, KL['pad'], R['pad'] * R['paw'])
    s, tone = C._strands(P, N, R)
    col *= (1 + s * 0.22 * (tone - 0.4) - 0.06 * (1 - s))[:, None]
    col = mix(col, C.K['ball'], R['ball'])
    rough = 0.64 + 0.08 * (n2 - 0.5) - 0.25 * R['nose'] - 0.3 * R['lid'] - 0.15 * R['lip']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def baby_paint(P, N, c, col):
    """kittens: grayer and softer, the marks bold, fuzzy and solid (the open blotches fill in)"""
    R = C._regions(P, N, c)
    Pm = R['Pm']
    M = C._tabby(R, Pm, N)
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['lip'] + R['phil'] + R['pad'] * R['paw'] + R['ear'] * R['earIn'], 0, 1)
    under = np.clip(np.maximum(sstep(-0.35, -0.75, N[:, 1]), M['pale']), 0, 1)
    out = mix(col, hexc(0x8A7A66), 0.45 * (1 - keep) * (1 - under * 0.7))
    black, inner = _marks(R, Pm, N, M)
    lines, ring = _face(R, Pm, N)
    bold = np.clip(black + inner * 0.8, 0, 1) * (1 - keep)
    out = mix(out, hexc(0x1E1812), sstep(0.25, 0.75, bold) * 0.7)
    out = mix(out, hexc(0x1E1812), lines * 0.6)
    return np.clip(out, 0, 1).astype(F)


C.paint, C.fur, C.baby_paint = paint, fur, baby_paint
C.KITTEN = dict(c=V(0.0, 0.194, -0.035), r=(0.056, 0.054, 0.175), rb=0.076, e=2.1, maxd=0.02)
_meta = C.meta


def meta(st):
    m = _meta(st)
    # golden brown eyes; the pupils close to vertical slits like a house cat's (kittens' eyes are blue)
    m['eye'].update({'iris': 0xA8782E, 'rim': 0x4E3410, 'pupil': 'v', 'pupilR': 0.46, 'babyIris': 0x6E8CAA, 'lidCol': 0x161210})
    m.update({'flat': 0xA88458, 'rim': [0.2, 0.14, 0.08]})
    return m


C.meta = meta
C.MAP_QUALITY = (60, 56)
C.BABY_TEX = 256
bigcat.install(globals(), C, KS)
