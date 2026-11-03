# A snow leopard (round 10) on the cat template (bigcat.py): the house cat's body at KS = 2.5 (about 1.2 m from the
# nose to the rump, 0.6 m at the shoulder) with its own parts in cat units: a very long, very thick tail carried low
# and curling up at the tip, stout legs on big furry paws, a short broad muzzle and a domed forehead, small rounded ears
# set wide, pale green-gray eyes, and a thick dense coat that is part of the sculpt under long fur shells. The coat is
# smoky gray along the back and pale cream-gray down the sides, white underneath, with open black rosettes on the body,
# solid spots on the head and the legs, big blotches and rings on the tail. Cubs: fluffier, darker, with bold solid
# spots, big paws, blue-gray eyes.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, ellipsoid, round_cone, sweep, fbm, worley
import carnivore as CV
from carnivore import mirror, mix, hexc
import bigcat

KS = 2.5
ID = 'snowleopard'
# the tail: path (y, z), radius with the coat (cat units): low, then curling up at the tip
_TAIL = [(0.207, -0.185, 0.019), (0.2, -0.21, 0.021), (0.178, -0.265, 0.0225), (0.148, -0.325, 0.023), (0.118, -0.385, 0.023),
         (0.093, -0.445, 0.0225), (0.078, -0.5, 0.0215), (0.076, -0.54, 0.02), (0.085, -0.575, 0.0175), (0.103, -0.598, 0.0125),
         (0.118, -0.606, 0.006)]
_TB = {'tail1': V(0, 0.205, -0.19), 'tail2': V(0, 0.16, -0.3), 'tail3': V(0, 0.1, -0.43), 'tail4': V(0, 0.077, -0.53)}
_HEAD = [   # a broad round head with a domed forehead and a short muzzle
    (-0.006, 0.017, 0.0, -0.02, 0.022, 2.2, 2.0),
    (0.008, 0.028, -0.002, -0.028, 0.034, 2.5, 2.0),
    (0.024, 0.033, -0.004, -0.032, 0.0395, 2.6, 2.0),
    (0.04, 0.033, -0.007, -0.034, 0.04, 2.6, 2.1),
    (0.053, 0.028, -0.009, -0.034, 0.037, 2.4, 2.2),
    (0.064, 0.02, -0.011, -0.032, 0.031, 2.2, 2.3),
    (0.073, 0.012, -0.012, -0.03, 0.025, 2.2, 2.3),
    (0.081, 0.006, -0.013, -0.027, 0.02, 2.2, 2.2),
    (0.087, 0.0, -0.013, -0.022, 0.014, 2.1, 2.1),
]
# a deeper, wider body than the house cat's (the belly lower: shorter legs), a thick neck
_TRUNK = [
    (-0.205, 0.224, 0.205, 0.182, 0.022, 2.0, 2.0),
    (-0.19, 0.236, 0.205, 0.163, 0.042, 2.1, 2.0),
    (-0.16, 0.245, 0.206, 0.153, 0.053, 2.2, 2.0),
    (-0.12, 0.25, 0.207, 0.155, 0.054, 2.3, 2.0),
    (-0.08, 0.251, 0.205, 0.148, 0.053, 2.3, 2.0),
    (-0.03, 0.249, 0.2, 0.132, 0.056, 2.3, 2.0),
    (0.02, 0.246, 0.196, 0.118, 0.059, 2.3, 2.0),
    (0.06, 0.244, 0.192, 0.112, 0.058, 2.3, 2.0),
    (0.1, 0.242, 0.19, 0.115, 0.051, 2.2, 2.0),
    (0.125, 0.235, 0.19, 0.128, 0.044, 2.1, 2.0),
    (0.14, 0.225, 0.19, 0.148, 0.033, 2.0, 2.0),
]
_NECK = [
    (0.2, 0.09, 0.05, 0.056, 0.05, 2.0, 2.0),
    (0.222, 0.135, 0.04, 0.047, 0.042, 2.0, 2.0),
    (0.248, 0.163, 0.033, 0.037, 0.035, 2.0, 2.0),
    (0.274, 0.181, 0.028, 0.03, 0.03, 2.0, 2.0),
    (0.29, 0.188, 0.022, 0.024, 0.024, 2.0, 2.0),
]
C = bigcat.load(dict(
    ID=ID, TRUNK=_TRUNK, NECK=_NECK, BOUNDS=(V(-0.085, 0.0, -0.63), V(0.085, 0.37, 0.3)),
    HEAD=_HEAD, TAIL=_TAIL, TB=_TB, TAIL_BONES=['tail1', 'tail2', 'tail3', 'tail4'], TAIL_TD=0.036,
    EYE_AT=(0.062, 0.006, 0.0182), EYE_R=0.0082, LID_W=0.0074, LID_H=0.0052, SLANT=0.12, NOSE_S=0.088, MOUTH_AT=(0.079, -0.026),
    # small rounded ears set wide and low
    EAR_B=V(0.028, 0.301, 0.19), EAR_A=[0.5, 0.86, -0.08], EAR_N=[0.45, -0.05, 0.9], EAR_L=0.026, EAR_W=0.0175,
    BOX=dict(neck=((-0.085, 0.1, 0.0), (0.085, 0.35, 0.26)), head=((-0.07, 0.22, 0.14), (0.07, 0.35, 0.29)),
             eyes=((-0.042, 0.27, 0.21), (0.042, 0.32, 0.265)), ear=((-0.07, 0.28, 0.165), (0.07, 0.345, 0.225)),
             fleg=((-0.085, -0.005, 0.02), (0.085, 0.26, 0.17)), hleg=((-0.09, -0.005, -0.25), (0.09, 0.27, -0.03)),
             paws=((-0.075, -0.005, -0.2), (0.075, 0.035, 0.14)), tail=((-0.045, 0.04, -0.63), (0.045, 0.24, -0.15))),
))
_trunk, _neck, _head, _fleg, _hleg, _paws, _tail = C.trunk, C.neck, C.head, C.fleg, C.hleg, C.paws, C.tail


def _stout(keys, lo, hi):
    # thicker legs: the sections scaled by lo at the foot up to hi at the top
    out = []
    for k in keys:
        f = lo + (hi - lo) * min(1.0, max(0.0, (k[0] - 0.02) / 0.18))
        out.append((k[0], k[1], k[2] * f, k[3] * f, k[4] * f) + tuple(k[5:]))
    return out


C.FORE, C.HIND = _stout(C.FORE, 1.35, 1.15), _stout(C.HIND, 1.35, 1.1)
_bone_tips = C.bone_tips


def bone_tips(P):
    t = _bone_tips(P)
    t['tail3'], t['tail4'] = P['tail4'], V(0, _TAIL[-1][0], _TAIL[-1][1])
    return t


C.bone_tips = bone_tips


def _locks(Q, amt):
    return amt * (fbm(Q * V(40.0, 55.0, 34.0), 3, 99) - 0.5) * 2.0


def trunk(P):
    """the body in a thick coat, longest under the belly"""
    Q = mirror(P)
    return _trunk(P) - 0.0045 - 0.0015 * sstep(0.18, 0.13, Q[:, 1]) - _locks(Q, 0.0012)


def neck(P):
    Q = mirror(P)
    # a full throat and a deep base to the neck (the head carried low, the neck thick under its coat)
    d = smin(_neck(P) - 0.004, ellipsoid(Q, V(0.0, 0.186, 0.148), V(0.037, 0.038, 0.032)), 0.02)
    return smin(d, ellipsoid(Q, V(0.0, 0.195, 0.112), V(0.045, 0.048, 0.04)), 0.025)


def head(P):
    """the cat's head, broader in the cheeks, the forehead domed up between the ears"""
    Q = mirror(P)
    L = C.HF.loc(Q)
    d = _head(P)
    d = smin(d, ellipsoid(L, V(0.0, 0.016, 0.03), V(0.03, 0.02, 0.03)), 0.012)
    return d - 0.0015 * C.sstep(0.07, 0.04, L[:, 2])


def ear(P):
    Q = mirror(P)
    return CV.ear(Q, C.EAR_B, C.EAR_A, C.EAR_N, C.EAR_L, C.EAR_W, 'round', th0=0.0042, th1=0.0024, cup=0.8, tipin=0.0,
                  base_r=(0.008, 0.006, 0.005))


def fleg(P):
    Q = mirror(P)
    return _fleg(P) - 0.0045 * sstep(0.03, 0.12, Q[:, 1]) - 0.002


def hleg(P):
    Q = mirror(P)
    return _hleg(P) - 0.005 * sstep(0.04, 0.13, Q[:, 1]) * sstep(0.23, 0.18, Q[:, 1]) - 0.002


F_TOES = [(0.0062, 0.0088, 0.0071, 0.0078, 0.0), (-0.0062, 0.0088, 0.0071, 0.0078, 0.0), (0.0148, 0.0008, 0.0066, 0.0072, 0.0004),
          (-0.0148, 0.0008, 0.0066, 0.0072, 0.0004)]
H_TOES = [(0.0058, 0.0084, 0.0067, 0.0075, 0.0), (-0.0058, 0.0084, 0.0067, 0.0075, 0.0), (0.0138, 0.0007, 0.0062, 0.007, 0.0004),
          (-0.0138, 0.0007, 0.0062, 0.007, 0.0004)]


def paws(P):
    """big round furry paws (snowshoes)"""
    Q = mirror(P)
    a, _ = CV.paw(Q, C.PAW_F, F_TOES, pad=(0.0142, 0.0108, 0.0135), claw=None, yaw=0.06)
    b, _ = CV.paw(Q, C.PAW_H, H_TOES, pad=(0.0135, 0.0104, 0.0134), claw=None, yaw=0.04)
    return np.minimum(a, b) - 0.0012, np.full(len(P), 1.0, F)


def tail(P):
    return _tail(P) - _locks(mirror(P), 0.0012)


C.trunk, C.neck, C.head, C.ear, C.fleg, C.hleg, C.paws, C.tail = trunk, neck, head, ear, fleg, hleg, paws, tail
C.PATCHES = [p for p in C.PATCHES[:3]] + [
    (V(0.014, -0.001, 0.075), V(0.064, 0.024, 0.128), 0.0004), (V(0.016, -0.001, -0.184), V(0.068, 0.024, -0.126), 0.0004)]


# ---------- the coat ----------
C.FUR = {'len': 0.032, 'n': 5, 'lean': 1.1, 'tile': 0.0011, 'babyLen': 1.15, 'babyLean': 0.5, 'shade': 0.62, 'quality': 76}
_fur = C.fur


def fur(P, N, c):
    R = C._regions(P, N, c)
    ln, de = _fur(P, N, c)
    ln = ln * (1.45 + 0.25 * sstep(-0.3, -0.8, N[:, 1]) * (1 - R['head']))
    tl = R['tail']
    ln = ln * (1 - tl) + tl * (0.024 + 0.004 * sstep(0.2, 0.8, R['tt'])) * sstep(1.25, 1.6, R['ring'])
    return np.clip(ln, 0, C.FUR['len']).astype(F), de


KL = {
    'back': hexc(0x8E877A), 'side': hexc(0xB4AC9A), 'cream': hexc(0xC6BDA6), 'white': hexc(0xE2DED4), 'spot': hexc(0x24201C),
    'spotHi': hexc(0x4A443C), 'inner': hexc(0x857D6E), 'nose': hexc(0xA88078), 'noseRim': hexc(0x3A2E2A), 'earIn': hexc(0xB8A498),
    'ear': hexc(0x3C3630), 'pad': hexc(0x3A302C), 'lid': hexc(0x1A1612),
}


def _spots(R, Pm, N, P):
    """rosettes on the body, solid spots on the head and the legs, blotches and rings on the tail"""
    L = R['L']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    hd, tl = R['head'], R['tail']
    leg = sstep(0.15, 0.11, y) * (1 - tl) * (1 - hd)
    body = (1 - hd) * (1 - tl) * (1 - leg)
    warp = np.stack([fbm(P * 60 + k, 2, 70 + k) for k in range(3)], 1) - 0.5
    # rosettes: open rings around each cell's point, broken here and there, a little darker inside
    f1, f2 = worley(P / 0.025 + warp * 0.6, 71)
    ring = sstep(0.21, 0.29, f1) * sstep(0.45, 0.37, f1) * sstep(0.36, 0.52, fbm(P * 90, 2, 72) + 0.15)
    inner = sstep(0.3, 0.18, f1)
    # solid spots, smaller on the head, larger down the legs
    g1, _ = worley(P / 0.0085 + warp * 0.3, 73)
    sp_head = sstep(0.36, 0.26, g1) * hd * sstep(0.08, 0.065, L[:, 2]) * (1 - R['ear'])
    h1, _ = worley(P / 0.012 + warp * 0.3, 74)
    sp_leg = sstep(0.36, 0.26, h1) * leg * sstep(0.02, 0.035, y)
    # the tail: big blotches, then rings toward the dark tip
    tt = R['tt']
    t1, _ = worley(P / 0.026 + warp * 0.4, 75)
    blot = sstep(0.42, 0.3, t1) * tl * sstep(0.7, 0.55, tt)
    rings = sstep(0.12, 0.05, np.abs(np.mod(tt * 9.0 + 0.3 * warp[:, 0], 1.0) - 0.5) - 0.28) * tl * sstep(0.55, 0.7, tt)
    tip = tl * sstep(0.9, 0.95, tt)
    # few spots on the white belly
    under = sstep(-0.35, -0.65, N[:, 1])
    spots = np.clip(np.maximum.reduce([ring * body * (1 - under * 0.7), sp_head, sp_leg * (1 - under * 0.5), blot, rings, tip]), 0, 1)
    return spots, inner * body * (1 - under)


def paint(P, N, c):
    R = C._regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y = Pm[:, 1]
    M = C._tabby(R, Pm, N)
    n1 = fbm(Pm * 25, 3, 11)
    n2 = fbm(Pm * 140, 3, 12)
    # smoky gray along the back, pale cream-gray down the sides, white underneath (the cat's pale masks too)
    col = np.tile(KL['side'], (len(P), 1))
    col = mix(col, KL['back'], R['top'] * 0.7 * (1 - R['head'] * 0.5))
    col = mix(col, KL['cream'], sstep(0.0, -0.4, N[:, 1]) * 0.6)
    col *= (0.94 + 0.12 * n1)[:, None]
    under = np.clip(np.maximum(sstep(-0.3, -0.7, N[:, 1]), M['pale']), 0, 1)
    col = mix(col, KL['white'], under * 0.85)
    spots, inner = _spots(R, Pm, N, P)
    col = mix(col, KL['inner'], inner * 0.4)
    col = mix(col, KL['spotHi'], sstep(0.05, 0.5, spots) * 0.7)
    col = mix(col, KL['spot'] * (0.9 + 0.2 * n2[:, None]), sstep(0.4, 0.9, spots) * 0.88)
    # ears: dark backs, pale insides
    col = mix(col, KL['ear'], R['ear'] * (1 - R['earIn']) * 0.6)
    col = mix(col, KL['earIn'], R['ear'] * R['earIn'] * 0.75)
    nose = mix(np.tile(KL['nose'], (len(P), 1)), KL['noseRim'], sstep(0.4, 0.8, n2) * 0.2)
    col = mix(col, nose, R['nose'])
    col = mix(col, KL['noseRim'], R['phil'] * 0.5 + R['lip'] * 0.6)
    col = mix(col, KL['lid'], R['lid'])
    col = mix(col, KL['pad'], R['pad'] * R['paw'])
    s, tone = C._strands(P, N, R)
    col *= (1 + s * 0.2 * (tone - 0.4) - 0.06 * (1 - s))[:, None]
    col = mix(col, K_BALL, R['ball'])
    rough = 0.68 + 0.08 * (n2 - 0.5) - 0.25 * R['nose'] - 0.3 * R['lid'] - 0.15 * R['lip']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


K_BALL = C.K['ball']


def baby_paint(P, N, c, col):
    """cubs: grayer and darker, the spots solid and bold (the rosettes open up as they grow)"""
    R = C._regions(P, N, c)
    Pm = R['Pm']
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['lip'] + R['phil'] + R['pad'] * R['paw'] + R['ear'] * R['earIn'], 0, 1)
    M = C._tabby(R, Pm, N)
    under = np.clip(np.maximum(sstep(-0.3, -0.7, N[:, 1]), M['pale']), 0, 1)
    out = mix(col, hexc(0x8A8478), 0.55 * (1 - keep) * (1 - under * 0.6))
    spots, inner = _spots(R, Pm, N, P)
    bold = np.clip(spots + inner * 0.9, 0, 1) * (1 - keep)
    out = mix(out, hexc(0x221E1A), sstep(0.3, 0.8, bold) * 0.85)
    return np.clip(out, 0, 1).astype(F)


C.paint, C.fur, C.baby_paint = paint, fur, baby_paint
C.KITTEN = dict(c=V(0.0, 0.198, -0.035), r=(0.058, 0.056, 0.175), rb=0.078, e=2.1, maxd=0.022)
_meta = C.meta


def meta(st):
    m = _meta(st)
    # pale green-gray eyes (cubs' are blue-gray)
    m['eye'].update({'iris': 0xC8D0AE, 'rim': 0x6E7458, 'pupil': 'round', 'pupilR': 0.34, 'babyIris': 0x8A9EAE, 'babyLidCol': 0x5A544C, 'lidCol': 0x2A2620})
    m.update({'flat': 0xC6C0B0, 'rim': [0.14, 0.14, 0.13]})
    return m


C.meta = meta


def hair_texture():
    """white whiskers"""
    import smallfur as SF
    wh = [(0.0, (0.86, 0.84, 0.8)), (1.0, (0.97, 0.96, 0.94))]
    cols = [dict(kind='hair', stops=wh, n=12, wid=1.8, end=(0.95, 1.0), wave=0.02, root=1.0) for _ in range(3)]
    return SF.strand_texture((96, 128), cols, seed=29)


C.hair_texture = hair_texture
C.MAP_QUALITY = (62, 54)
C.BABY_TEX = 256     # (the page budget: the cub's map is small on screen)
bigcat.install(globals(), C, KS)
