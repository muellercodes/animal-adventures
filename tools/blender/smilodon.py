# A saber-toothed cat, Smilodon fatalis (round 10), on the cat template (bigcat.py): the house cat's skeleton at
# KS = 3.8 (about 1.85 m from the nose to the rump, 0.95 m at the shoulder) with its own parts in cat units: a heavy,
# deep body with high muscular shoulders and very thick forelegs, big paws, a thick neck, a short bobtail, a lower
# forehead and a deep muzzle, small round ears, and the long curved upper canines (about 18 cm) showing below the shut
# jaw on either side of the deep flange of the lower jaw. A plain tawny coat, short and close, with faint darker spots,
# a darker line along the back, pale underneath, the backs of the ears and the tip of the tail dark. Kittens: a
# spotted coat, big paws, short fangs just showing.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, ellipsoid, round_cone, fbm, worley
import carnivore as CV
from carnivore import mirror, mix, hexc
import bigcat

KS = 3.8
ID = 'smilodon'
# the bobtail: path (y, z), radius with the coat (cat units)
_TAIL = [(0.207, -0.185, 0.0175), (0.203, -0.205, 0.017), (0.194, -0.232, 0.0158), (0.183, -0.255, 0.0138), (0.175, -0.27, 0.0105),
         (0.171, -0.279, 0.0055)]
_TB = {'tail1': V(0, 0.205, -0.19), 'tail2': V(0, 0.19, -0.235)}
# a heavy deep body, the back sloping down from high shoulders to the hips
_TRUNK = [
    (-0.205, 0.214, 0.198, 0.178, 0.024, 2.0, 2.0),
    (-0.19, 0.226, 0.198, 0.16, 0.045, 2.1, 2.0),
    (-0.16, 0.235, 0.2, 0.15, 0.056, 2.2, 2.0),
    (-0.12, 0.24, 0.202, 0.152, 0.057, 2.3, 2.0),
    (-0.08, 0.243, 0.202, 0.145, 0.057, 2.3, 2.0),
    (-0.03, 0.246, 0.2, 0.128, 0.061, 2.3, 2.0),
    (0.02, 0.25, 0.198, 0.112, 0.066, 2.3, 2.0),
    (0.06, 0.254, 0.196, 0.106, 0.067, 2.3, 2.0),
    (0.1, 0.254, 0.195, 0.11, 0.061, 2.2, 2.0),
    (0.125, 0.246, 0.194, 0.122, 0.053, 2.1, 2.0),
    (0.14, 0.234, 0.194, 0.142, 0.041, 2.0, 2.0),
]
_NECK = [
    (0.2, 0.09, 0.056, 0.062, 0.056, 2.0, 2.0),
    (0.222, 0.135, 0.045, 0.052, 0.047, 2.0, 2.0),
    (0.248, 0.163, 0.036, 0.04, 0.038, 2.0, 2.0),
    (0.274, 0.181, 0.03, 0.032, 0.032, 2.0, 2.0),
    (0.29, 0.188, 0.024, 0.026, 0.026, 2.0, 2.0),
]
# the head: a lower forehead than the house cat's, a deeper, broader muzzle
_HEAD = [
    (-0.006, 0.016, 0.0, -0.02, 0.021, 2.2, 2.0),
    (0.008, 0.025, -0.002, -0.029, 0.034, 2.5, 2.0),
    (0.024, 0.028, -0.004, -0.034, 0.039, 2.6, 2.0),
    (0.04, 0.027, -0.007, -0.036, 0.039, 2.6, 2.1),
    (0.054, 0.024, -0.009, -0.036, 0.0355, 2.4, 2.2),
    (0.0682, 0.0185, -0.011, -0.035, 0.0305, 2.2, 2.3),
    (0.0811, 0.0115, -0.012, -0.033, 0.026, 2.2, 2.3),
    (0.0929, 0.0055, -0.013, -0.029, 0.0215, 2.2, 2.2),
    (0.1012, 0.0, -0.013, -0.024, 0.0155, 2.1, 2.1),
]
_MS = lambda v: 0.054 + (v - 0.054) * 1.18     # a house cat's muzzle position (s) on this longer muzzle
C = bigcat.load(dict(
    ID=ID, BOUNDS=(V(-0.09, 0.0, -0.3), V(0.09, 0.37, 0.3)), TRUNK=_TRUNK, NECK=_NECK, HEAD=_HEAD,
    TAIL=_TAIL, TB=_TB, TAIL_BONES=['tail1', 'tail2'], TAIL_TD=0.03,
    # smaller eyes than a house cat's
    EYE_AT=(0.064, 0.0058, 0.0186), EYE_R=0.0074, LID_W=0.0066, LID_H=0.0047, SLANT=0.14, NOSE_S=0.1036, MOUTH_AT=(0.086, -0.028),
    # small rounded ears set low and wide
    EAR_B=V(0.028, 0.298, 0.19), EAR_A=[0.52, 0.84, -0.12], EAR_N=[0.45, -0.05, 0.9], EAR_L=0.025, EAR_W=0.0175,
    BOX=dict(neck=((-0.09, 0.1, 0.0), (0.09, 0.35, 0.26)), head=((-0.07, 0.2, 0.14), (0.07, 0.35, 0.3)),
             eyes=((-0.042, 0.27, 0.21), (0.042, 0.32, 0.265)), ear=((-0.07, 0.28, 0.165), (0.07, 0.34, 0.22)),
             fleg=((-0.095, -0.005, 0.02), (0.095, 0.27, 0.18)), hleg=((-0.09, -0.005, -0.25), (0.09, 0.27, -0.03)),
             paws=((-0.08, -0.005, -0.2), (0.08, 0.04, 0.15)), tail=((-0.035, 0.12, -0.3), (0.035, 0.235, -0.15))),
))
_trunk, _neck, _head, _fleg, _hleg, _tail, _keep, _uvr = C.trunk, C.neck, C.head, C.fleg, C.hleg, C.tail, C.keep, C.uv_regions


def _stout(keys, lo, hi):
    # thicker legs: the sections scaled by lo at the foot up to hi at the top
    out = []
    for k in keys:
        f = lo + (hi - lo) * min(1.0, max(0.0, (k[0] - 0.02) / 0.18))
        out.append((k[0], k[1], k[2] * f, k[3] * f, k[4] * f) + tuple(k[5:]))
    return out


C.FORE, C.HIND = _stout(C.FORE, 1.6, 1.4), _stout(C.HIND, 1.4, 1.15)


def _locks(Q, amt):
    return amt * (fbm(Q * V(40.0, 55.0, 34.0), 3, 99) - 0.5) * 2.0


def trunk(P):
    """the heavy body under a short coat, the shoulders high and humped with muscle"""
    Q = mirror(P)
    d = _trunk(P)
    d = smin(d, round_cone(Q, V(0.036, 0.17, 0.11), V(0.026, 0.245, 0.075), 0.026, 0.02), 0.025)
    return d - 0.002 - _locks(Q, 0.0006)


def neck(P):
    Q = mirror(P)
    d = smin(_neck(P) - 0.002, ellipsoid(Q, V(0.0, 0.186, 0.148), V(0.04, 0.042, 0.034)), 0.02)
    return smin(d, ellipsoid(Q, V(0.0, 0.2, 0.11), V(0.05, 0.052, 0.042)), 0.025)


# the upper canines in the head frame (x, up, s forward): root at the gum under the whisker pad, curving down and back
_FANG = [(V(0.0158, -0.018, 0.0888), 0.006), (V(0.0164, -0.044, 0.0861), 0.0049), (V(0.017, -0.069, 0.0795), 0.0013)]
_FANG_K = 0.6     # flattened across: a blade, long from front to back


def _flat(L, a, b, r1, r2, kx):
    S = L.copy()
    S[:, 0] = a[0] + (L[:, 0] - a[0]) / kx
    return round_cone(S, a, V(a[0], b[1], b[2]), r1, r2) * kx


def fang(L):
    """distance to the left upper canine (L: mirrored head-frame points)"""
    (a, ra), (b, rb), (c, rc) = _FANG
    return np.minimum(_flat(L, a, b, ra, rb, _FANG_K), _flat(L, V(b[0], b[1], b[2]), c, rb, rc, _FANG_K))


def head(P):
    """the cat's head (as in cat.py) with a lower forehead, a longer deeper muzzle and a bigger nose, heavy brows, the
    flange of the lower jaw, the sabers"""
    Q = mirror(P)
    L = C.HF.loc(Q)
    d = C.loft(L, C.HEAD)
    d = smin(d, ellipsoid(L, V(0.026, -0.016, 0.042), V(0.015, 0.016, 0.021)), 0.012)
    # brows: a ridge over each eye (the eyes deep set under it), the stop between them
    d = smin(d, round_cone(L, V(0.007, 0.0155, 0.06), V(0.021, 0.014, 0.062), 0.0045, 0.004), 0.006)
    # whisker pads and chin, the nose leather on top
    ns = C.NOSE_S
    d = smin(d, ellipsoid(L, V(0.0105, -0.0165, _MS(0.084)), V(0.0118, 0.0102, 0.0118)), 0.005)
    d = smin(d, ellipsoid(L, V(0.0, -0.029, _MS(0.08)), V(0.009, 0.0062, 0.0105)), 0.004)
    NL = L - V(0.0, -0.0052, ns - 0.0024)
    NL[:, 0] = NL[:, 0] / (1.0 + 70.0 * np.clip(NL[:, 1], -0.005, 0.005))
    d = smin(d, ellipsoid(NL, V(0.0, 0.0, 0.0), V(0.0062, 0.0045, 0.0034)), 0.003)
    # the mouth lines and the nostrils
    M = L * V(1, 2.0, 1)
    m = round_cone(M, V(0.0, -0.012 * 2.0, ns + 0.001), V(0.0, -0.0235 * 2.0, ns - 0.004), 0.0004, 0.0004)
    m = smin(m, round_cone(M, V(0.0, -0.0235 * 2.0, ns - 0.004), V(0.013, -0.0262 * 2.0, _MS(0.078)), 0.0004, 0.0004), 0.0006)
    m = smin(m, round_cone(M, V(0.013, -0.0262 * 2.0, _MS(0.078)), V(0.02, -0.025 * 2.0, _MS(0.066)), 0.0004, 0.0003), 0.0006)
    d = smax(d, -(m + 0.0002) / 2.0, 0.0005)
    d = smax(d, -ellipsoid(L, V(0.0034, -0.0048, ns + 0.0028), V(0.0013, 0.001, 0.0014)), 0.0005)
    # the flange: the front of the lower jaw deepened into a tall flat-fronted chin
    d = smin(d, ellipsoid(L, V(0.0065, -0.033, _MS(0.08)), V(0.0085, 0.0095, 0.0085)), 0.008)
    d = smin(d, fang(L), 0.0015)
    return d


def ear(P):
    Q = mirror(P)
    return CV.ear(Q, C.EAR_B, C.EAR_A, C.EAR_N, C.EAR_L, C.EAR_W, 'round', th0=0.0042, th1=0.0024, cup=0.8, tipin=0.0,
                  base_r=(0.008, 0.006, 0.005))


def fleg(P):
    """very thick, muscular forelegs: a great upper arm and forearm"""
    Q = mirror(P)
    d = _fleg(P) - 0.0015
    d = smin(d, C.flat_cone(Q, V(0.042, 0.205, 0.118), V(0.046, 0.115, 0.078), 0.034, 0.022, 0.8), 0.02)
    d = smin(d, ellipsoid(Q, V(0.041, 0.078, 0.086), V(0.018, 0.034, 0.019)), 0.012)
    return d


def hleg(P):
    return smax(_hleg(P) - 0.0015, mirror(P)[:, 1] - 0.236, 0.012)


F_TOES = [(0.0068, 0.0098, 0.0078, 0.0088, 0.0), (-0.0068, 0.0098, 0.0078, 0.0088, 0.0), (0.0162, 0.0009, 0.0072, 0.008, 0.0005),
          (-0.0162, 0.0009, 0.0072, 0.008, 0.0005)]
H_TOES = [(0.006, 0.0088, 0.007, 0.008, 0.0), (-0.006, 0.0088, 0.007, 0.008, 0.0), (0.0142, 0.0007, 0.0065, 0.0073, 0.0004),
          (-0.0142, 0.0007, 0.0065, 0.0073, 0.0004)]


def paws(P):
    """big round paws, the claws drawn in"""
    Q = mirror(P)
    a, _ = CV.paw(Q, C.PAW_F, F_TOES, pad=(0.0158, 0.0118, 0.015), claw=None, yaw=0.06)
    b, _ = CV.paw(Q, C.PAW_H, H_TOES, pad=(0.014, 0.0108, 0.0138), claw=None, yaw=0.04)
    return np.minimum(a, b) - 0.001, np.full(len(P), 1.0, F)


C.trunk, C.neck, C.head, C.ear, C.fleg, C.hleg, C.paws = trunk, neck, head, ear, fleg, hleg, paws
# fine sculpt boxes: eyes, muzzle and sabers, ears, paws
C.PATCHES = [C.PATCHES[0], (V(0.0, 0.205, 0.228), V(0.032, 0.29, 0.292), 0.0003), C.PATCHES[2],
             (V(0.012, -0.001, 0.074), V(0.07, 0.026, 0.132), 0.0004), (V(0.014, -0.001, -0.186), V(0.07, 0.026, -0.124), 0.0004)]


def _fangm(P):
    L = C.HF.loc(mirror(P))
    return sstep(0.0012, 0.0002, fang(L)) * sstep(-0.021, -0.025, L[:, 1]), L


def keep(P):
    fm, _ = _fangm(P)
    return np.maximum(_keep(P), fm * 0.85).astype(F)


def uv_regions(P):
    fm, _ = _fangm(P)
    lab = _uvr(P)
    lab[fm > 0.5] = 0
    return lab


_fix_weights = C.fix_weights


def fix_weights(W, wpos, names, G, weld):
    # the sabers ride on the head
    W = _fix_weights(W, wpos, names, G, weld)
    bi = {n: i for i, n in enumerate(names)}
    fm, _ = _fangm(wpos)
    CV.set_part(W, bi, fm > 0.05, 'head', np.ones(len(wpos), F))
    return W / np.maximum(W.sum(1, keepdims=True), 1e-9)


def bone_tips(P):
    Q = dict(P)
    Q['tail3'] = V(0, _TAIL[-1][0], _TAIL[-1][1])
    t = _bone_tips(Q)
    t['tail2'] = Q['tail3']
    t.pop('tail3', None)
    return t


_bone_tips = C.bone_tips
C.keep, C.uv_regions, C.fix_weights, C.bone_tips = keep, uv_regions, fix_weights, bone_tips


# ---------- the coat ----------
C.FUR = {'len': 0.009, 'n': 4, 'lean': 1.3, 'tile': 0.0011, 'babyLen': 1.5, 'babyLean': 0.55, 'shade': 0.66, 'quality': 74}
_fur = C.fur


def fur(P, N, c):
    fm, _ = _fangm(P)
    ln, de = _fur(P, N, c)
    return (np.clip(ln * 0.55, 0, C.FUR['len']) * (1 - fm)).astype(F), de


KL = {
    'ground': hexc(0xB08A5A), 'warm': hexc(0xBE9864), 'back': hexc(0x8C6A44), 'cream': hexc(0xD6BF98), 'white': hexc(0xE6DAC2),
    'spot': hexc(0x7C5A38), 'ear': hexc(0x3E3024), 'earIn': hexc(0xC8AC94), 'nose': hexc(0x6E4640), 'noseRim': hexc(0x2E2018),
    'pad': hexc(0x3A2A24), 'lid': hexc(0x1E1610), 'fang': hexc(0xE8DEC4), 'fangRoot': hexc(0xC8B890), 'tip': hexc(0x3A2C20),
}


def _spots(R, Pm, N, P, size):
    """faint darker spots over the body and the legs (bolder on a kitten)"""
    hd, tl = R['head'], R['tail']
    warp = np.stack([fbm(P * 60 + k, 2, 80 + k) for k in range(3)], 1) - 0.5
    f1, _ = worley(P / size + warp * 0.4, 81)
    under = sstep(-0.3, -0.65, N[:, 1])
    return sstep(0.34, 0.22, f1) * (1 - hd * 0.6) * (1 - tl) * (1 - under) * sstep(0.02, 0.05, Pm[:, 1])


def _face(L):
    """the face masks: pale (muzzle and chin), dark (whisker spots, the mark behind the pads, the tear lines)"""
    x, y, sv = L[:, 0], L[:, 1], L[:, 2]
    pads = sstep(0.016, 0.009, np.linalg.norm((L - V(0.0105, -0.0165, _MS(0.084))) / V(1.0, 1.0, 1.2), axis=1))
    chin = sstep(-0.026, -0.03, y) * sstep(0.06, 0.075, sv)
    pale = np.clip(pads + chin, 0, 1)
    g, _ = worley(L / V(0.0028, 0.0028, 0.0028), 91)
    spots = sstep(0.3, 0.18, g) * pads * sstep(0.006, 0.01, x) * sstep(-0.009, -0.013, y) * sstep(-0.022, -0.019, y)
    mark = sstep(0.006, 0.002, np.abs(y + 0.016)) * sstep(_MS(0.07), _MS(0.075), sv) * sstep(_MS(0.08), _MS(0.077), sv) * sstep(0.014, 0.018, x)
    tear = sstep(0.0018, 0.0006, np.abs(x - 0.011 + (sv - 0.068) * 0.25)) * sstep(0.064, 0.068, sv) * sstep(0.084, 0.079, sv)
    return pale, np.clip(spots + mark + tear * 0.7, 0, 1)


def paint(P, N, c):
    R = C._regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    M = C._tabby(R, Pm, N)
    n1 = fbm(Pm * 25, 3, 11)
    n2 = fbm(Pm * 140, 3, 12)
    col = np.tile(KL['ground'], (len(P), 1))
    col = mix(col, KL['warm'], sstep(0.0, -0.5, N[:, 1]) * 0.45)
    col = mix(col, KL['back'], R['top'] * 0.55 * (1 - R['head'] * 0.5))
    col *= (0.93 + 0.14 * n1)[:, None]
    under = np.clip(np.maximum(sstep(-0.35, -0.75, N[:, 1]) * 0.8, M['pale']), 0, 1)
    col = mix(col, mix(np.tile(KL['cream'], (len(P), 1)), KL['white'], M['chin']), under * 0.8)
    col = mix(col, KL['spot'], _spots(R, Pm, N, P, 0.024) * 0.32)
    col = mix(col, KL['white'], _face(L)[0] * R['head'] * 0.85)
    fd = _face(L)[1] * R['head']
    col = mix(col, KL['noseRim'], fd * 0.75)
    # ears: dark backs, pale insides; the tip of the bobtail dark
    col = mix(col, KL['ear'], R['ear'] * (1 - R['earIn']) * 0.7)
    col = mix(col, KL['earIn'], R['ear'] * R['earIn'] * 0.7)
    col = mix(col, KL['tip'], R['tail'] * sstep(0.6, 0.9, R['tt']) * 0.75)
    nose = mix(np.tile(KL['nose'], (len(P), 1)), KL['noseRim'], sstep(0.4, 0.8, n2) * 0.2)
    col = mix(col, nose, R['nose'])
    col = mix(col, KL['noseRim'], R['phil'] * 0.5 + R['lip'] * 0.7)
    col = mix(col, KL['lid'], R['lid'])
    col = mix(col, KL['pad'], R['pad'] * R['paw'])
    s, tone = C._strands(P, N, R)
    col *= (1 + s * 0.22 * (tone - 0.4) - 0.05 * (1 - s))[:, None]
    # the sabers: ivory, yellower at the gum
    fm, _ = _fangm(P)
    ivory = mix(np.tile(KL['fang'], (len(P), 1)), KL['fangRoot'], sstep(-0.03, -0.022, L[:, 1]))
    col = mix(col, ivory, fm)
    col = mix(col, C.K['ball'], R['ball'])
    rough = 0.66 + 0.08 * (n2 - 0.5) - 0.25 * R['nose'] - 0.3 * R['lid'] - 0.15 * R['lip'] - 0.35 * fm
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def baby_paint(P, N, c, col):
    """kittens: a grayer, softer ground with bold dark spots"""
    R = C._regions(P, N, c)
    Pm = R['Pm']
    fm, _ = _fangm(P)
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['lip'] + R['phil'] + R['pad'] * R['paw'] + R['ear'] * R['earIn'] + fm, 0, 1)
    M = C._tabby(R, Pm, N)
    out = mix(col, hexc(0xA48A68), 0.35 * (1 - keep) * (1 - M['pale']))
    out = mix(out, hexc(0x4A3624), _spots(R, Pm, N, P, 0.018) * 0.75 * (1 - keep))
    return np.clip(out, 0, 1).astype(F)


C.paint, C.fur, C.baby_paint = paint, fur, baby_paint
# kittens: a rounder little body; the sabers only just showing below the lip
C.KITTEN = dict(c=V(0.0, 0.196, -0.035), r=(0.064, 0.06, 0.17), rb=0.082, e=2.1, maxd=0.022)
_baby_offset = C.baby_offset


def baby_offset(P, N, c):
    d = _baby_offset(P, N, c)
    fm, L = _fangm(P)
    up = np.clip(-0.03 - L[:, 1], 0, None) * 0.6 * fm
    d[:, 1] += up * C.HF.u[1]
    d[:, 2] += up * C.HF.u[2]
    return d.astype(F)


C.baby_offset = baby_offset
_meta = C.meta


def meta(st):
    m = _meta(st)
    # amber eyes with round pupils (kittens' are blue-gray)
    m['eye'].update({'iris': 0xC69A40, 'rim': 0x5A4418, 'pupil': 'round', 'pupilR': 0.36, 'babyIris': 0x7E92A4, 'babyLidCol': 0x6A5642})
    m.update({'flat': 0xA88458, 'rim': [0.18, 0.13, 0.08]})
    return m


C.meta = meta
C.MAP_QUALITY = (72, 58)
bigcat.install(globals(), C, KS)
