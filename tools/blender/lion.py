# A male African lion (round 11) on the cat template (panthera.py, bigcat.py): the house cat's skeleton at KS = 4.2
# (about 2.05 m from the nose to the rump, 1.05 m at the shoulder, a 1 m tail) with its own parts in cat units: a deep
# chest and a tucked belly, heavy forequarters (high shoulder blades, very thick forelegs, big paws), a long broad
# muzzle with a straight profile and a big nose, small amber eyes, small round ears half in the mane, and the full mane:
# a ruff framing the face and a heavy coat over the neck, the shoulders and down the chest, sculpted (so it holds its
# outline far away) with hanging locks, under long fur shells, tawny gold round the face and dark brown at the back and
# on the chest. A short tawny coat, pale underneath, white on the chin and round the eyes, black lips, ear backs and
# the tuft at the end of the tail. Cubs: no mane (the baby offsets pull it in to the neck), a woolly grayer coat with
# faint spots on the legs and the belly, blue-gray eyes.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, ellipsoid, round_cone, sweep, fbm, worley
import carnivore as CV
from carnivore import mirror, mix, hexc
import panthera as PT

KS = 4.2
ID = 'lion'
MSK = 1.3
MS = lambda v: 0.054 + (v - 0.054) * MSK
# the tail: path (y, z), radius (cat units); hangs back and down, the tuft at the end
_TAIL = [(0.207, -0.185, 0.0128), (0.201, -0.205, 0.0122), (0.188, -0.232, 0.0115), (0.17, -0.258, 0.0108), (0.149, -0.282, 0.0102),
         (0.127, -0.303, 0.0097), (0.106, -0.321, 0.0093), (0.088, -0.336, 0.0096), (0.074, -0.349, 0.0124), (0.064, -0.36, 0.0134),
         (0.057, -0.37, 0.0114), (0.053, -0.378, 0.0055)]
_TB = {'tail1': V(0, 0.205, -0.19), 'tail2': V(0, 0.175, -0.251), 'tail3': V(0, 0.118, -0.311)}
T = dict(
    MS=MSK,
    # the head pitched down a little more than the house cat's (the face nearly upright, the muzzle forward and down)
    # round 16b: the head carried more level and the muzzle dropped less (the steep drop put the nose far below the
    # eyes and the face read as a capybara's dome)
    HF=CV.Frame(V(0.0, 0.292, 0.178), V(0.0, -0.17, 1.0), V(0.0, 1.0, 0.0)), DROP=(0.15, 0.055),
    BOUNDS=(V(-0.12, 0.0, -0.4), V(0.12, 0.375, 0.31)),
    # a deep chest, the belly tucked up behind it, the back nearly level, the withers a little higher than the hips
    TRUNK=[
        (-0.205, 0.218, 0.198, 0.178, 0.022, 2.0, 2.0),
        (-0.19, 0.229, 0.199, 0.166, 0.042, 2.1, 2.0),
        (-0.16, 0.236, 0.2, 0.156, 0.053, 2.2, 2.0),
        (-0.12, 0.24, 0.2, 0.153, 0.054, 2.3, 2.0),
        (-0.08, 0.242, 0.199, 0.143, 0.054, 2.3, 2.0),
        (-0.03, 0.244, 0.197, 0.134, 0.055, 2.3, 2.0),
        (0.02, 0.246, 0.195, 0.118, 0.058, 2.3, 2.0),
        (0.06, 0.249, 0.193, 0.11, 0.058, 2.3, 2.0),
        (0.1, 0.25, 0.192, 0.113, 0.053, 2.2, 2.0),
        (0.125, 0.244, 0.192, 0.125, 0.046, 2.1, 2.0),
        (0.14, 0.234, 0.192, 0.143, 0.035, 2.0, 2.0),
    ],
    NECK=[
        (0.2, 0.09, 0.056, 0.062, 0.056, 2.0, 2.0),
        (0.222, 0.135, 0.045, 0.052, 0.047, 2.0, 2.0),
        (0.248, 0.163, 0.036, 0.04, 0.038, 2.0, 2.0),
        (0.274, 0.181, 0.03, 0.032, 0.032, 2.0, 2.0),
        (0.29, 0.188, 0.024, 0.026, 0.026, 2.0, 2.0),
    ],
    THROAT=[((0.0, 0.186, 0.148), (0.04, 0.042, 0.034), 0.02), ((0.0, 0.2, 0.11), (0.05, 0.052, 0.042), 0.025)],
    # a long, broad, square muzzle, the profile nearly straight from the forehead to the nose
    # round 16b: a flatter crown, the skull widest at the cheekbones behind the eyes, then a long boxy muzzle (deep,
    # square in section) that narrows only a little to the nose
    HEAD=[
        (-0.006, 0.014, 0.0, -0.02, 0.019, 2.2, 2.0),
        (0.008, 0.0215, -0.003, -0.031, 0.03, 2.5, 2.0),
        (0.024, 0.023, -0.006, -0.037, 0.035, 2.6, 2.1),
        (0.04, 0.0218, -0.009, -0.0395, 0.036, 2.7, 2.2),
        (0.054, 0.0185, -0.011, -0.04, 0.0325, 2.8, 2.4),
        (MS(0.066), 0.0145, -0.012, -0.0395, 0.027, 3.0, 2.6),
        (MS(0.077), 0.0115, -0.013, -0.038, 0.0245, 3.2, 2.8),
        (MS(0.087), 0.0085, -0.013, -0.0355, 0.0215, 3.0, 2.6),
        (MS(0.094), 0.0042, -0.013, -0.03, 0.015, 2.5, 2.2),
    ],
    CHEEK=((0.024, -0.016, 0.04), (0.009, 0.011, 0.017)), PAD_X=0.0112, BROW=None, PADS=(0.0142, 0.0124, 0.015), CHIN=(0.0098, 0.007, 0.012),
    NOSE=(0.0115, 0.0072, 0.005), BRIDGE=0.0095,
    TAIL=_TAIL, TB=_TB, TAIL_TD=0.025,
    EYE_AT=(0.0635, 0.005, 0.0158), EYE_R=0.0074, LID_W=0.0068, LID_H=0.0049, SLANT=0.1, SINK=0.45, MOUTH_AT=(MS(0.086), -0.028),
    EAR_B=V(0.031, 0.296, 0.187), EAR_A=[0.6, 0.79, -0.1], EAR_N=[0.45, -0.05, 0.9], EAR_L=0.023, EAR_W=0.018,
    BOX=dict(neck=((-0.125, 0.07, 0.0), (0.125, 0.375, 0.27)), head=((-0.07, 0.185, 0.14), (0.07, 0.35, 0.31)),
             eyes=((-0.042, 0.27, 0.21), (0.042, 0.32, 0.27)), ear=((-0.07, 0.28, 0.165), (0.07, 0.34, 0.22)),
             fleg=((-0.095, -0.005, 0.02), (0.095, 0.27, 0.18)), hleg=((-0.09, -0.005, -0.25), (0.09, 0.27, -0.03)),
             paws=((-0.08, -0.005, -0.2), (0.08, 0.04, 0.15)), tail=((-0.04, 0.03, -0.4), (0.04, 0.235, -0.15))),
    COAT=0.002, LOCKS=0.0006,
    SHOULDER=((0.034, 0.17, 0.108), (0.026, 0.232, 0.08), 0.024, 0.017),
    FORE_K=(1.6, 1.38), HIND_K=(1.42, 1.16),
    # a great upper arm and forearm
    FLEG_X=[((0.041, 0.2, 0.118), (0.045, 0.115, 0.078), 0.034, 0.023, 0.8, 0.02), ((0.041, 0.1, 0.086), (0.04, 0.05, 0.089), 0.016, 0.012, 0.9, 0.012)],
    HIP_CUT=0.232,
    F_TOES=[(0.0068, 0.0098, 0.0078, 0.0088, 0.0), (-0.0068, 0.0098, 0.0078, 0.0088, 0.0), (0.0162, 0.0009, 0.0072, 0.008, 0.0005),
            (-0.0162, 0.0009, 0.0072, 0.008, 0.0005)],
    H_TOES=[(0.006, 0.0088, 0.007, 0.008, 0.0), (-0.006, 0.0088, 0.007, 0.008, 0.0), (0.0142, 0.0007, 0.0065, 0.0073, 0.0004),
            (-0.0142, 0.0007, 0.0065, 0.0073, 0.0004)],
    F_PAD=(0.0158, 0.0118, 0.015), H_PAD=(0.014, 0.0108, 0.0138),
    PAW_PATCHES=[(V(0.012, -0.001, 0.074), V(0.07, 0.026, 0.132), 0.0004), (V(0.014, -0.001, -0.186), V(0.07, 0.026, -0.124), 0.0004)],
    FUR={'len': 0.02, 'n': 5, 'lean': 1.1, 'tile': 0.0011, 'babyLen': 1.3, 'babyLean': 0.55, 'shade': 0.6, 'quality': 74},
    FUR_K=0.42,
    COL=dict(ground=hexc(0xB4884E), warm=hexc(0xBC9058), back=hexc(0x9A7444), cream=hexc(0xD6C29C), white=hexc(0xE8DEC8),
             dark=hexc(0x2A1E16), ear=hexc(0x2C221A), earIn=hexc(0xC8B094), nose=hexc(0x8A5246), noseDark=hexc(0x221816),
             lips=hexc(0x221812), lid=hexc(0x1C140E), pad=hexc(0x3A2A24)),
    BACK_K=0.7, STROKE=0.2, EYE_PALE=(0.85, 0.6), EYE_UNDER=(0.009, -0.0072, 0.005), EYE_OVER=(0.002, 0.0095, 0.007), WSPOTS=0.75, NOSE_MOTTLE=0.6, WHISKER=0.06,
    KITTEN=dict(c=V(0.0, 0.196, -0.035), r=(0.07, 0.066, 0.165), rb=0.088, e=2.1, maxd=0.028),
    EYE_META={'iris': 0xB8822E, 'rim': 0x5A3A12, 'pupilR': 0.36, 'babyIris': 0x8496A8, 'babyLidCol': 0x6A5642},
    META={'flat': 0xA8844E, 'rim': [0.18, 0.13, 0.08]},
    MAP_QUALITY=(70, 56), BABY_TEX=256,
)


def head_x(C_, L, d):
    """round 16b: the lion's skull: wide cheekbones under and behind the eyes (the face is widest there), a heavy brow
    ridge over each eye that the eye sits forward under, the flat forehead between them"""
    d = smin(d, ellipsoid(L, V(0.03, -0.006, 0.04), V(0.009, 0.008, 0.018)), 0.012)
    d = smin(d, round_cone(L, V(0.005, 0.0145, 0.062), V(0.022, 0.0118, 0.058), 0.0055, 0.0045), 0.009)
    return d


T['HEAD_X'] = head_x
C = PT.load(ID, T)
PT.setup(C)
_neck0, _flow0, _lenk0, _baby_offset0, _keep0, _uvr0, _uvw0 = C.neck, C.flow, C._lenk, C.baby_offset, C.keep, C.uv_regions, C.uv_weight

# ---------- the mane ----------
# a sheath along the neck: path (y, z) and the section's reach (top, bottom, half width), cat units
_MANE = [(0.205, 0.075, 0.064, 0.07, 0.064, 2.0, 2.0), (0.228, 0.125, 0.07, 0.072, 0.07, 2.0, 2.0),
         (0.252, 0.158, 0.066, 0.068, 0.072, 2.0, 2.0), (0.27, 0.176, 0.06, 0.062, 0.07, 2.0, 2.0)]


def _face_cut(L):
    """how far in front of the mane's front edge (the face stays clear: the mane starts behind the eyes, further back
    on top, further forward under the chin)"""
    # round 16b: behind the cheekbones and the brow (the mane covered the cheeks up to the eyes and swallowed the face)
    # and on top it starts between the ears (the forehead is short haired up to the crown)
    return L[:, 2] - (0.028 - 0.45 * L[:, 1] - 0.6 * np.maximum(L[:, 1] - 0.005, 0.0))


# round 16b: the way the mane's hair hangs (down and back), for the locks
_AX = nrm(V(0.0, -0.75, -0.55))
_AZ = np.cross(_AX, V(1.0, 0.0, 0.0)).astype(F)


def _locks(Q, amt, k_along, k_across, seed):
    """round 16b: locks of hair hanging down and back: rounded clumps with sharp partings between them (a noise
    stretched along the hair, folded at its middle)"""
    S = np.stack([(Q @ _AX) * k_along, Q[:, 0] * k_across, (Q @ _AZ) * k_across], 1)
    return amt * np.abs(2.0 * fbm(S, 3, seed) - 1.0)


def mane0(Q):
    """the mane's volume (mirrored points), before the locks"""
    L = C.HF.loc(Q)
    # round 16b: a narrower ruff (a round ball twice as wide as the face read as a cape), set back behind the face
    d = ellipsoid(Q, V(0.0, 0.262, 0.166), V(0.068, 0.053, 0.048))         # the ruff framing the face
    d = smin(d, sweep(Q, _MANE), 0.03)                                     # the heavy coat down the neck
    # (round 16b: over the shoulders it ends a little further forward, so its ragged edge stays inside the neck's box)
    d = smin(d, ellipsoid(Q, V(0.0, 0.23, 0.08), V(0.058, 0.04, 0.054)), 0.03)   # over the shoulders
    d = smin(d, ellipsoid(Q, V(0.0, 0.165, 0.135), V(0.042, 0.062, 0.042)), 0.03)  # the chest fringe
    d = smin(d, ellipsoid(L, V(0.034, -0.014, 0.026), V(0.016, 0.026, 0.02)), 0.015)    # the sideburns behind the cheeks
    # round 16b: a ragged edge (tongues of hair of uneven length) over the shoulders and under the chest, not a cape line
    rag = fbm(Q * V(36.0, 26.0, 10.0), 2, 37) - 0.5
    rag2 = fbm(Q * V(36.0, 10.0, 36.0), 2, 38) - 0.5
    d = d + 0.03 * rag * sstep(0.12, 0.05, Q[:, 2]) + 0.022 * rag2 * sstep(0.17, 0.12, Q[:, 1])
    d = smax(d, _face_cut(L), 0.012)
    # the ears stand free in a hollow of the mane
    return smax(d, -(C.ear(Q) - 0.005), 0.006)


def mane(P):
    Q = mirror(P)
    # round 16b: locks (clumps with partings) instead of a smooth noise
    return (mane0(Q) - _locks(Q, 0.0045, 22.0, 85.0, 31) - _locks(Q, 0.0016, 50.0, 190.0, 33)
            - PT.locks(Q, 0.001, k=(140.0, 50.0, 110.0), seed=32))


def neck(P):
    return smin(_neck0(P), mane(P), 0.008)


C.neck = neck


def body0(P):
    """the lion without its mane (the cub's neck)"""
    C.neck = _neck0
    try:
        return C.shape(P)
    finally:
        C.neck = neck


def mane_mask(P):
    """1 on the mane's surface, 0 on the body"""
    return sstep(0.0008, 0.0035, body0(P))


_mcache = {}


def _mth(P):
    """how far the mane stands out over the body under it (round 16b: kept for the paint's ragged edge)"""
    key = (len(P), float(P[:7].sum()))
    if key not in _mcache:
        _mcache.clear()
        _mcache[key] = body0(P)
    return _mcache[key]


def _mm(P):
    return sstep(0.0008, 0.0035, _mth(P))


def flow(P, N=None):
    """the mane combed back and down from the face, out a little"""
    f = _flow0(P, N)
    Q = mirror(P)
    m = sstep(0.006, -0.004, mane0(Q)) * sstep(-0.01, 0.0, -_face_cut(C.HF.loc(Q)))
    fm = np.stack([0.4 * sstep(0.0, 0.03, Q[:, 0]), -0.75 * np.ones(len(Q), F), -0.55 * np.ones(len(Q), F)], 1)
    fm[:, 0] *= np.sign(P[:, 0] + 1e-12)
    f = f * (1 - m)[:, None] + fm * m[:, None]
    return (f / np.maximum(np.linalg.norm(f, axis=1, keepdims=True), 1e-9)).astype(F)


C.flow = flow


def lenk(Pm):
    """longer, wider coat strokes in the mane"""
    m = sstep(0.006, -0.004, mane0(Pm))
    return _lenk0(Pm) * (1 + 1.6 * m)


C._lenk = lenk


def fur_x(C_, P, N, c, ln):
    R = C._regions(P, N, c)
    mm = _mm(P)
    Q = R['Pm']
    # the mane: long, longest at the back and down the chest
    back = sstep(0.0, -0.06, _face_cut(R['L']))
    ml = 0.006 + 0.007 * back
    ln = ln * (1 - mm) + mm * ml
    # the tuft at the end of the tail
    tf = R['tail'] * sstep(0.8, 0.86, R['tt'])
    ln = ln * (1 - tf) + tf * 0.02
    return ln


T['FUR_X'] = fur_x
# round 16b: a lighter, warmer tawny ruff round the face
MK = dict(gold=hexc(0xB48448), mid=hexc(0x7E5530), dark=hexc(0x36261A), tuft=hexc(0x221812))


def _hair_noise(Q, k_along, k_across, seed):
    """round 16b: a noise stretched along the hair (down and back), for streaks and tongues"""
    return fbm(np.stack([(Q @ _AX) * k_along, Q[:, 0] * k_across, (Q @ _AZ) * k_across], 1), 3, seed)


def nose_edge(C_, R):
    """round 16b: the outer band of the nose leather (a lion's nose is dark edged, pink to black with age)"""
    L, ns = R['L'], C_.NOSE_S
    NL = L - V(0.0, -0.0052, ns - 0.0024)
    NL[:, 0] = NL[:, 0] / (1.0 + 70.0 * np.clip(NL[:, 1], -0.005, 0.005))
    e = ellipsoid(NL, V(0.0, 0.0, 0.0), V(*C_.T['NOSE']) + V(0.0006, 0.0005, 0.0))
    return R["nose"] * sstep(-0.002, -0.0007, e)


def extra(C_, R, P, N, col):
    """the mane: tawny gold round the face, darkening to brown and then nearly black at the back and on the chest, in
    streaks"""
    col = mix(col, C_.T['COL']['noseDark'], nose_edge(C_, R) * 0.85)
    th = _mth(P)
    Q = R['Pm']
    # round 16b: the gold ruff reaches further back before it darkens, the streaks follow the locks, and the thin edge of
    # the mane over the shoulders and under the chest runs out into the coat in tongues of hair (it was a cape line)
    back = sstep(0.01, -0.075, _face_cut(R['L']))
    low = sstep(0.2, 0.15, Q[:, 1]) * sstep(0.1, 0.13, Q[:, 2])
    streak = _hair_noise(Q, 18.0, 75.0, 41)
    tongue = _hair_noise(Q, 7.0, 55.0, 43)
    dk = np.clip(0.05 + back * 0.68 + low * 0.55 + (streak - 0.5) * 1.1, 0, 1)
    rear = sstep(0.13, 0.08, Q[:, 2])
    edge = sstep(0.014, 0.004, th + 0.012 * (tongue - 0.5)) * rear
    dk = dk * (1 - 0.45 * edge)
    mcol = mix(mix(np.tile(MK['gold'], (len(P), 1)), MK['mid'], sstep(0.0, 0.5, dk)), MK['dark'], sstep(0.45, 1.0, dk))
    k = sstep(0.0008, 0.0035, th) * (1 - rear * sstep(0.004, 0.0, th - 0.0015 + 0.01 * (tongue - 0.5)))
    return mix(col, mcol, np.clip(k, 0, 1) * (1 - R['ear']))


def tail_tip(C_, R, col):
    return mix(col, MK['tuft'], R['tail'] * sstep(0.8, 0.86, R['tt']))


T['extra'], T['tail_tip'] = extra, tail_tip


def cub(C_, R, P, N, col, keep, c):
    """cubs: a woolly, grayer tawny coat with faint dark spots on the legs and the belly (fading on the flanks), no
    mane (painted as the coat under it), a small dark tip to the tail"""
    Pm = R['Pm']
    M = C._tabby(R, Pm, N)
    mm = _mm(P)
    pale = M['pale']
    # under the mane: the coat as it would be without one
    T['extra'] = None
    try:
        base, _ = PT.coat(C, P, N, c)
    finally:
        T['extra'] = extra
    out = mix(col, base, mm * (1 - keep))
    out = mix(out, hexc(0x9C8264), 0.35 * (1 - keep) * (1 - pale))
    warp = np.stack([fbm(P * 60 + k, 2, 80 + k) for k in range(3)], 1) - 0.5
    f1, _ = worley(P / 0.011 + warp * 0.5, 82)
    y = Pm[:, 1]
    leg = sstep(0.15, 0.11, y) * sstep(0.02, 0.04, y) * (1 - R['tail'])
    belly = sstep(-0.3, -0.7, N[:, 1]) * (1 - R['head'])
    flank = (1 - R['head']) * (1 - R['tail']) * sstep(0.12, 0.16, y) * (1 - mm)
    sp = sstep(0.36, 0.22, f1) * np.clip(leg * 0.55 + belly * 0.5 + flank * 0.22, 0, 0.6)
    out = mix(out, hexc(0x5A4430), sp * (1 - keep))
    out = mix(out, hexc(0x3A2A1C), R['tail'] * sstep(0.88, 0.94, R['tt']) * 0.8)
    return out


T['cub'] = cub


def baby_offset(P, N, c):
    """the cat's round little body, and the mane pulled in to the neck under it"""
    d = _baby_offset0(P, N, c)
    b = body0(P)
    w = sstep(0.0, 0.0018, b)
    X = P.copy()
    for _ in range(5):
        g = CV.gradient(body0, X, 0.0006)
        X = X - g * body0(X)[:, None] * 0.9
    return (d + (X - P) * w[:, None]).astype(F)


C.baby_offset = baby_offset


def finish_baby(Cimg, ao, valid):
    # the cub has no mane: less of the sculpt's occlusion (the mane's locks and the crease under it)
    return CV.finish(Cimg, ao, valid, 0.18)


C.finish_baby = finish_baby


def keep(P):
    return np.maximum(_keep0(P), 0.5 * sstep(0.004, -0.002, mane(P))).astype(F)


def uv_regions(P):
    lab = _uvr0(P)
    lab[(_mm(P) > 0.5) & (lab != 8)] = 9
    return lab


def uv_weight(P):
    return (_uvw0(P) * (1 - 0.35 * _mm(P))).astype(F)


_fix_weights0 = C.fix_weights


def fix_weights(W, wpos, names, G, weld):
    # the ruff round the face rides on the head (else the head pulls out of it as the lion eats)
    W = _fix_weights0(W, wpos, names, G, weld)
    bi = {n: i for i, n in enumerate(names)}
    L = C.HF.loc(mirror(wpos))
    k = sstep(-0.012, 0.02, L[:, 2]) * sstep(-0.05, -0.035, L[:, 1])
    CV.set_part(W, bi, (k > 0.01) & (_mm(wpos) > 0.3), 'head', k)
    return W / np.maximum(W.sum(1, keepdims=True), 1e-9)


C.keep, C.uv_regions, C.uv_weight, C.fix_weights = keep, uv_regions, uv_weight, fix_weights
PT.install(globals(), C, KS)
