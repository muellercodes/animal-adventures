# A fluffy white long-haired cat (round 7), Persian-like but not extreme (a "doll face"), sculpted on the cat's skeleton
# with cat.py as the template. The sculpt is the body inside the coat plus the coat's volume (a long coat makes its own
# silhouette: far away there are no fur shells): a cobby body, a big ruff around the neck and down the chest, full
# britches, a plumed tail, a round head with full cheeks, a short nose (not flat), big round copper eyes set wide, and
# small ears with rounded tips set wide and low. Long fur shells over it close up (more layers, standing out). White
# all over with cream in the depths of the coat, a pink nose, lid rims and pads. Kittens are white fluffballs with
# blue eyes.
import os
import numpy as np
from sdf import V

_HEAD = [   # round and short: the muzzle stops early, broad to its end
    (-0.006, 0.017, 0.0, -0.02, 0.022, 2.2, 2.0),
    (0.008, 0.028, -0.002, -0.029, 0.035, 2.5, 2.0),
    (0.024, 0.033, -0.004, -0.033, 0.041, 2.6, 2.0),
    (0.04, 0.032, -0.007, -0.035, 0.041, 2.6, 2.1),
    (0.054, 0.027, -0.009, -0.034, 0.037, 2.4, 2.2),
    (0.065, 0.019, -0.011, -0.032, 0.031, 2.3, 2.3),
    (0.074, 0.011, -0.012, -0.029, 0.024, 2.2, 2.3),
    (0.081, 0.005, -0.013, -0.025, 0.018, 2.2, 2.2),
    (0.086, 0.0, -0.013, -0.02, 0.012, 2.1, 2.1),
]
# the plumed tail: the sculpt holds the fluff's volume
_TAIL = [(0.207, -0.185, 0.02), (0.203, -0.205, 0.021), (0.193, -0.245, 0.022), (0.183, -0.28, 0.022), (0.167, -0.32, 0.021),
         (0.15, -0.36, 0.02), (0.13, -0.395, 0.018), (0.115, -0.425, 0.015), (0.106, -0.443, 0.011), (0.102, -0.451, 0.006)]
BREED = dict(
    ID='whitecat', BOUNDS=(V(-0.095, 0.0, -0.48), V(0.095, 0.37, 0.3)),
    HEAD=_HEAD, TAIL=_TAIL,
    # big round eyes, set wide, looking straight ahead
    EYE_AT=(0.061, 0.0062, 0.0188), EYE_R=0.0098, EYE_D=V(0.3, 0.06, 0.95), LID_W=0.0083, LID_H=0.0068, SLANT=0.06, LID_OFF=0.0004, SINK=0.4,
    NOSE_S=0.086, MOUTH_AT=(0.077, -0.026),
    # small ears with rounded tips, set wide and low, tipped forward
    EAR_B=V(0.029, 0.309, 0.192), EAR_A=[0.5, 0.85, 0.06], EAR_N=[0.42, -0.12, 0.9], EAR_L=0.038, EAR_W=0.021,
    BOX=dict(neck=((-0.095, 0.1, 0.0), (0.095, 0.35, 0.26)), head=((-0.075, 0.22, 0.14), (0.075, 0.35, 0.29)),
             eyes=((-0.042, 0.27, 0.21), (0.042, 0.32, 0.265)), ear=((-0.07, 0.28, 0.165), (0.07, 0.355, 0.23)),
             fleg=((-0.085, -0.005, 0.02), (0.085, 0.26, 0.17)), hleg=((-0.09, -0.005, -0.25), (0.09, 0.27, -0.03)),
             paws=((-0.07, -0.005, -0.2), (0.07, 0.035, 0.14)), tail=((-0.045, 0.06, -0.48), (0.045, 0.25, -0.15))),
)
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cat.py')).read(), 'cat.py', 'exec'))

PATCHES = [
    (EYE.c * V(0, 1, 1) + V(0.006, -0.015, -0.014), EYE.c * V(0, 1, 1) + V(0.034, 0.015, 0.016), 0.0003),   # eye and lids
    (HF.pt(0.06, 0.0) * V(0, 1, 1) + V(0.0, -0.045, -0.004), HF.pt(0.093, 0.0) * V(0, 1, 1) + V(0.026, 0.012, 0.004), 0.0003),  # muzzle
]
_cat_trunk, _cat_neck, _cat_head, _cat_fleg, _cat_hleg, _cat_paws, _cat_tail = trunk, neck, head, fleg, hleg, paws, tail


def _locks(Q, amt):
    """soft clumps in the long coat (so its outline is tufted, not a smooth shell)"""
    return amt * (fbm(Q * V(42.0, 60.0, 36.0), 3, 97) - 0.5) * 2.0


def trunk(P):
    """the cat's body inside a long coat: about 11 mm of fluff, more under the belly"""
    Q = mirror(P)
    belly = sstep(0.215, 0.12, Q[:, 1])
    return _cat_trunk(P) - 0.011 - 0.005 * belly - _locks(Q, 0.0035)


def neck(P):
    """the ruff: a big collar of long fur around the neck that falls down over the chest as a bib"""
    Q = mirror(P)
    d = _cat_neck(P) - 0.006
    d = smin(d, ellipsoid(Q, V(0.0, 0.215, 0.155), V(0.046, 0.046, 0.04)), 0.025)
    d = smin(d, ellipsoid(Q, V(0.0, 0.172, 0.142), V(0.038, 0.048, 0.032)), 0.02)
    return d - _locks(Q, 0.004)


def head(P):
    """round, with a short broad muzzle: the cat's head in a coat (about 4 mm of fur over the skull and cheeks, less
    toward the face), full cheeks, the whisker pads and the nose close under the eyes"""
    Q = mirror(P)
    L = HF.loc(Q)
    d = loft(L, HEAD) - 0.0045 * sstep(0.072, 0.048, L[:, 2])
    d = smin(d, ellipsoid(L, V(0.028, -0.016, 0.04), V(0.017, 0.017, 0.022)), 0.012)
    d = smin(d, round_cone(L, V(0.007, 0.017, 0.055), V(0.02, 0.0165, 0.057), 0.004, 0.0035), 0.006)
    d = smin(d, ellipsoid(L, V(0.0098, -0.0155, 0.074), V(0.0105, 0.0092, 0.0095)), 0.005)
    d = smin(d, ellipsoid(L, V(0.0, -0.0272, 0.07), V(0.0085, 0.0058, 0.0092)), 0.004)
    NL = L - V(0.0, -0.0048, NOSE_S - 0.0022)
    NL[:, 0] = NL[:, 0] / (1.0 + 85.0 * np.clip(NL[:, 1], -0.0042, 0.0042))
    d = smin(d, ellipsoid(NL, V(0.0, 0.0, 0.0), V(0.0046, 0.0035, 0.0027)), 0.0025)
    M = L * V(1, 2.0, 1)
    m = round_cone(M, V(0.0, -0.011 * 2.0, NOSE_S + 0.001), V(0.0, -0.0222 * 2.0, NOSE_S - 0.004), 0.0004, 0.0004)
    m = smin(m, round_cone(M, V(0.0, -0.0222 * 2.0, NOSE_S - 0.004), V(0.012, -0.0252 * 2.0, 0.068), 0.0004, 0.0004), 0.0006)
    m = smin(m, round_cone(M, V(0.012, -0.0252 * 2.0, 0.068), V(0.018, -0.0242 * 2.0, 0.056), 0.0004, 0.0003), 0.0006)
    d = smax(d, -(m + 0.0002) / 2.0, 0.0005)
    nc = V(0.0027, -0.0045, NOSE_S + 0.0024)
    return smax(d, -ellipsoid(L, nc, V(0.00105, 0.0008, 0.00115)), 0.0005)


def fleg(P):
    """stocky legs in a full coat"""
    return _cat_fleg(P) - 0.0055 * sstep(0.03, 0.12, mirror(P)[:, 1]) - 0.0025


def hleg(P):
    """britches: long fur on the backs of the thighs"""
    Q = mirror(P)
    d = _cat_hleg(P) - 0.007 * sstep(0.04, 0.13, Q[:, 1]) - 0.0025
    d = smin(d, ellipsoid(Q, V(0.044, 0.15, -0.172), V(0.025, 0.042, 0.021)), 0.018)
    return d - _locks(Q, 0.003) * sstep(0.06, 0.12, Q[:, 1])


def paws(P):
    """big round paws with tufts between the toes"""
    a, b = _cat_paws(P)
    return a - 0.002, b


def tail(P):
    """the plume, in locks"""
    return _cat_tail(P) - _locks(mirror(P), 0.004)


def shape(P):
    """the cat's, with wider blends: the long coat runs smoothly over the shoulders, elbows and thighs"""
    d = trunk(P)
    d = smin(d, local(P, *BOX['neck'], neck), 0.035)
    h = local(P, *BOX['head'], head)
    ca, li, ba = local_n(P, *BOX['eyes'], eye_parts, 3)
    h = smin(h, li, 0.003)
    h = smax(h, -ca, 0.001)
    h = smin(h, ba, 0.0006)
    d = smin(d, h, 0.018)
    d = smin(d, local(P, *BOX['ear'], ear), 0.004)
    d = smin(d, local(P, *BOX['fleg'], fleg), 0.03)
    d = smin(d, local(P, *BOX['hleg'], hleg), 0.032)
    pw, cl = local_n(P, *BOX['paws'], paws, 2)
    d = smin(d, pw, 0.006)
    d = smin(d, local(P, *BOX['tail'], tail), 0.02)
    return d


def grid(h):
    """finer spacing across the ears, and in height too (the small rounded tips came out saw-toothed)"""
    from sdf import axis_steps
    lo, hi = BOUNDS
    xs = axis_steps(0.0, hi[0], [(0.008, BOX['ear'][1][0], h * 0.7)], h)
    ys = axis_steps(lo[1], hi[1], [(BOX['ear'][0][1], BOX['ear'][1][1], h * 0.6)], h)
    zs = axis_steps(lo[2], hi[2], [(BOX['ear'][0][2], BOX['ear'][1][2], h * 0.42)], h)
    return xs, ys, zs


# ---------- the long coat ----------
FUR = {'len': 0.038, 'n': 6, 'n1': 2, 'lean': 0.55, 'tile': 0.0016, 'babyLen': 1.0, 'babyLean': 0.4, 'shade': 0.6, 'quality': 80}


def fur(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y, z = Pm[:, 1], Pm[:, 2]
    ln = np.full(len(P), 0.026, F)
    ln = ln + 0.008 * sstep(-0.3, -0.8, N[:, 1]) * (1 - R['tail'])                       # belly
    ln = ln + 0.012 * sstep(0.1, 0.14, z) * sstep(0.26, 0.2, y) * (1 - R['head'])         # ruff and bib
    ln = ln + 0.008 * sstep(-0.12, -0.16, z) * sstep(0.0, -0.6, N[:, 2]) * sstep(0.06, 0.14, y)   # britches
    leg = sstep(0.12, 0.06, y) * (1 - R['tail'])
    ln = ln * (1 - leg * 0.55)
    hd = R['head']
    # the face: short on the mask, longer on the cheeks and the crown
    face = 0.006 + 0.01 * sstep(0.045, 0.02, L[:, 2]) + 0.008 * sstep(0.0, -0.016, L[:, 1]) * sstep(0.07, 0.04, L[:, 2])
    ln = ln * (1 - hd) + hd * (face - 0.004 * sstep(0.06, 0.075, L[:, 2]))
    er = R['ear']
    u = np.clip(R['ea'] / EAR_L, 0, 1)
    hw = EAR_W * (1 - u) ** 0.85 * (0.75 + 0.25 * np.sqrt(np.clip(u * 4, 0, 1))) + 0.0006
    rim = sstep(0.5, 0.8, np.abs(R['ec']) / np.maximum(hw, 1e-4))
    inner = R['earIn'] * sstep(0.002, 0.008, R['ea']) * (1 - rim) * sstep(0.3, 0.7, R['Nm'] @ EAR_N)
    ln = ln * (1 - er) + er * (0.008 * sstep(0.006, 0.0, R['ea']) + 0.008 * inner)
    tl = R['tail']
    ln = ln * (1 - tl) + tl * (0.032 + 0.004 * sstep(0.2, 0.8, R['tt']))
    ln = ln * (1 - R['paw'] * 0.6)
    ln = ln * (1 - R['nose']) * (1 - R['lip']) * (1 - R['phil']) * (1 - R['pad'] * R['paw']) * sstep(1.25, 1.7, R['ring'])
    return np.clip(ln, 0, FUR['len']).astype(F), np.ones(len(P), F)


def _strands(P, N, R):
    """long, wavy coat strokes (the cat's are short)"""
    key = (len(P), float(P[:7].sum()))
    if key not in _scache:
        dens = 0.92 * (1 - R['nose']) * (1 - R['ball']) * (1 - R['pad'] * R['paw']) * (1 - 0.7 * R['lip']) * sstep(EYE.r + 0.0015, EYE.r + 0.004, R['eyeD'])
        _scache[key] = CV.strands(P, N, dens, flow, 0.0034, 0.006, 0.011, 0.0006, seed=95, lenk=lambda Q: _lenk(mirror(Q)))
    return _scache[key]


KW = {
    'white': hexc(0xF6F3EE), 'cream': hexc(0xE6DDCC), 'shade': hexc(0xCFC5B4), 'nose': hexc(0xE8A49C), 'noseRim': hexc(0xC07E78),
    'earIn': hexc(0xF0BEB4), 'pad': hexc(0xE4A2A0), 'lid': hexc(0xB88A86),
}


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    n1 = fbm(Pm * 25, 3, 11)
    n2 = fbm(Pm * 140, 3, 12)
    col = np.tile(KW['white'], (len(P), 1))
    # cream in the depths of the coat: the partings between the locks and the underside
    col = mix(col, KW['cream'], sstep(0.1, -0.7, N[:, 1]) * 0.35 + 0.2 * (n1 - 0.4))
    s, tone = _strands(P, N, R)
    col = mix(col, KW['shade'], (1 - s) * 0.45 * (1 - R['nose']) * (1 - R['ear'] * R['earIn']))
    col = mix(col, KW['white'] * 1.02, s * tone * 0.5)
    col = mix(col, KW['earIn'], R['ear'] * R['earIn'] * 0.8)
    nose = mix(np.tile(KW['nose'], (len(P), 1)), KW['noseRim'], sstep(0.4, 0.8, n2) * 0.2)
    col = mix(col, nose, R['nose'])
    col = mix(col, KW['noseRim'], R['phil'] * 0.35 + R['lip'] * 0.3)
    col = mix(col, KW['lid'], R['lid'])
    col = mix(col, KW['pad'], R['pad'] * R['paw'])
    col = mix(col, K['ball'], R['ball'])
    rough = 0.7 + 0.06 * (n2 - 0.5) - 0.25 * R['nose'] - 0.3 * R['lid']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    R = _regions(P, N, c)
    h = np.zeros(len(P), F)
    s, tone = _strands(P, N, R)
    h += 0.00009 * s * (1 - R['ball']) * (1 - R['nose'])
    return h


def baby_paint(P, N, c, col):
    """kittens: a white fluffball, the coat a touch creamier"""
    R = _regions(P, N, c)
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['pad'] * R['paw'] + R['ear'] * R['earIn'], 0, 1)
    return np.clip(mix(col, hexc(0xF2ECE0), 0.4 * (1 - keep)), 0, 1).astype(F)


# kittens: the cat's pot belly, and their coat is shorter fluff (the shells' baby length)
KITTEN = dict(c=V(0.0, 0.196, -0.035), r=(0.06, 0.058, 0.18), rb=0.08, e=2.1, maxd=0.018)
_meta = meta


def meta(st):
    m = _meta(st)
    # big round copper eyes (kittens' are blue), pink lid rims
    m['eye'].update({'iris': 0xD0761E, 'rim': 0x7A3A0A, 'babyLidCol': 0xD8C8C0, 'lid': [1.0, -0.95, 0.12]})
    m.update({'flat': 0xF0ECE4, 'rim': [0.16, 0.14, 0.12]})
    m['collar'] = {'at': ['neck', 'neck2', 0.75], 'lift': 0.35}
    return m


def hair_texture():
    """white whiskers and eyebrow whiskers (the cat's have dark roots)"""
    import smallfur as SF
    wh = [(0.0, (0.88, 0.86, 0.82)), (1.0, (0.98, 0.97, 0.95))]
    cols = [dict(kind='hair', stops=wh, n=12, wid=1.8, end=(0.95, 1.0), wave=0.02, root=1.0) for _ in range(3)]
    return SF.strand_texture((96, 128), cols, seed=29)
