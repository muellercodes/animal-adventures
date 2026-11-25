# round 17: Pallas's cat (the manul, Otocolobus manul), on the cat's skeleton with cat.py as the template and the
# fluffy white cat's way of sculpting a long coat (whitecat.py): the sculpt is the body inside the coat plus the coat's
# volume, so it looks much bigger than a house cat and stocky on short legs far away too, where there are no fur
# shells. A flat broad face made broader by long fur on the cheeks, small round ears set low and wide on the sides of
# the head, big round eyes set high and looking straight ahead (round pupils, yellow-green), a thick blunt tail. The
# coat is frosted gray: a gray coat with white tips, buff on the legs and flanks, a few narrow dark bars over the loins
# and on the backs of the hind legs, black rings round the tail and a black tip; on the face small black spots on the
# forehead, white round the eyes and over the muzzle, a white chin, and two black stripes back across each cheek. Long
# fur shells over it close up. Kittens are darker gray fluffballs with faint markings and big eyes.
import os
import numpy as np
from sdf import V

_HEAD = [   # broad and flat: a low forehead, the widest skull of any cat its size, the muzzle short and blunt
    (-0.006, 0.016, 0.0, -0.021, 0.026, 2.2, 2.0),
    (0.008, 0.025, -0.002, -0.031, 0.042, 2.6, 2.0),
    (0.024, 0.029, -0.004, -0.035, 0.049, 2.8, 2.0),
    (0.04, 0.029, -0.007, -0.037, 0.049, 2.8, 2.1),
    (0.054, 0.025, -0.009, -0.035, 0.044, 2.6, 2.2),
    (0.065, 0.019, -0.011, -0.032, 0.033, 2.4, 2.3),
    (0.074, 0.012, -0.012, -0.029, 0.025, 2.3, 2.3),
    (0.08, 0.006, -0.013, -0.025, 0.019, 2.2, 2.2),
    (0.084, 0.0, -0.013, -0.02, 0.013, 2.1, 2.1),
]
# the thick, blunt tail: the sculpt holds the fluff
_TAIL = [(0.207, -0.185, 0.024), (0.203, -0.205, 0.026), (0.193, -0.245, 0.027), (0.183, -0.28, 0.027), (0.167, -0.32, 0.027),
         (0.15, -0.36, 0.026), (0.13, -0.395, 0.025), (0.118, -0.42, 0.022), (0.11, -0.435, 0.016), (0.106, -0.443, 0.008)]
BREED = dict(
    ID='pallascat', BOUNDS=(V(-0.11, 0.0, -0.48), V(0.11, 0.37, 0.3)),
    HEAD=_HEAD, TAIL=_TAIL,
    # big round eyes set high on the flat face, looking straight ahead
    EYE_AT=(0.059, 0.0078, 0.0182), EYE_R=0.0096, EYE_D=V(0.24, 0.05, 0.97), LID_W=0.0082, LID_H=0.0078, SLANT=0.0, LID_OFF=0.0003, SINK=0.42,
    NOSE_S=0.083, MOUTH_AT=(0.074, -0.026),
    # small round ears set low and wide on the sides of the head, opening out to the side
    EAR_B=V(0.037, 0.295, 0.188), EAR_A=[0.82, 0.55, -0.08], EAR_N=[0.55, -0.12, 0.82], EAR_L=0.022, EAR_W=0.019,
    BOX=dict(neck=((-0.12, 0.06, -0.04), (0.12, 0.37, 0.28)), head=((-0.1, 0.2, 0.125), (0.1, 0.36, 0.29)),
             eyes=((-0.042, 0.27, 0.21), (0.042, 0.32, 0.265)), ear=((-0.085, 0.27, 0.16), (0.085, 0.33, 0.215)),
             fleg=((-0.1, -0.005, -0.01), (0.1, 0.29, 0.2)), hleg=((-0.1, -0.005, -0.27), (0.1, 0.31, 0.0)),
             paws=((-0.07, -0.005, -0.2), (0.07, 0.035, 0.14)), tail=((-0.06, 0.03, -0.48), (0.06, 0.29, -0.14))),
)
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cat.py')).read(), 'cat.py', 'exec'))

PATCHES = [
    (EYE.c * V(0, 1, 1) + V(0.006, -0.015, -0.014), EYE.c * V(0, 1, 1) + V(0.034, 0.015, 0.016), 0.0003),   # eye and lids
    (HF.pt(0.058, 0.0) * V(0, 1, 1) + V(0.0, -0.045, -0.004), HF.pt(0.09, 0.0) * V(0, 1, 1) + V(0.026, 0.012, 0.004), 0.0003),  # muzzle
]
_cat_trunk, _cat_neck, _cat_head, _cat_fleg, _cat_hleg, _cat_paws, _cat_tail = trunk, neck, head, fleg, hleg, paws, tail


def _locks(Q, amt):
    """soft clumps in the long coat (so its outline is tufted, not a smooth shell)"""
    return amt * (fbm(Q * V(40.0, 56.0, 34.0), 3, 197) - 0.5) * 2.0


def trunk(P):
    """the cat's body inside a very long dense coat: about 16 mm of fur, a long fringe hanging under the belly"""
    Q = mirror(P)
    belly = sstep(0.215, 0.12, Q[:, 1])
    return _cat_trunk(P) - 0.013 - 0.008 * belly - _locks(Q, 0.004)


def neck(P):
    """a thick neck in the coat, a full throat"""
    Q = mirror(P)
    d = _cat_neck(P) - 0.012
    d = smin(d, ellipsoid(Q, V(0.0, 0.205, 0.15), V(0.05, 0.05, 0.042)), 0.025)
    # the coat runs up the back of the neck into the back of the head, so the head sits low in it
    d = smin(d, ellipsoid(Q, V(0.0, 0.245, 0.155), V(0.05, 0.048, 0.045)), 0.03)
    return d - _locks(Q, 0.004)


def head(P):
    """broad and flat-faced, the long fur on the cheeks spreading the face out sideways and down (the manul's wide
    owlish face); the whisker pads and the small nose close under the eyes"""
    Q = mirror(P)
    L = HF.loc(Q)
    d = loft(L, HEAD) - 0.004 * sstep(0.068, 0.046, L[:, 2])
    # cheek fur ("sideburns"): out to the side and down below the jaw, behind the eyes
    d = smin(d, ellipsoid(L, V(0.037, -0.02, 0.034), V(0.025, 0.023, 0.026)), 0.014)
    d = smin(d, ellipsoid(L, V(0.026, -0.035, 0.03), V(0.022, 0.015, 0.024)), 0.012)
    # a low brow over each eye, almost no stop: the forehead runs flat into the short muzzle
    d = smin(d, round_cone(L, V(0.008, 0.019, 0.052), V(0.021, 0.0185, 0.054), 0.0035, 0.003), 0.006)
    d = smin(d, ellipsoid(L, V(0.0096, -0.0152, 0.071), V(0.0102, 0.009, 0.0092)), 0.005)
    d = smin(d, ellipsoid(L, V(0.0, -0.0268, 0.067), V(0.0085, 0.0058, 0.009)), 0.004)
    NL = L - V(0.0, -0.0046, NOSE_S - 0.0022)
    NL[:, 0] = NL[:, 0] / (1.0 + 85.0 * np.clip(NL[:, 1], -0.0042, 0.0042))
    d = smin(d, ellipsoid(NL, V(0.0, 0.0, 0.0), V(0.0042, 0.0032, 0.0026)), 0.0025)
    M = L * V(1, 2.0, 1)
    m = round_cone(M, V(0.0, -0.0105 * 2.0, NOSE_S + 0.001), V(0.0, -0.0218 * 2.0, NOSE_S - 0.004), 0.0004, 0.0004)
    m = smin(m, round_cone(M, V(0.0, -0.0218 * 2.0, NOSE_S - 0.004), V(0.012, -0.0248 * 2.0, 0.066), 0.0004, 0.0004), 0.0006)
    m = smin(m, round_cone(M, V(0.012, -0.0248 * 2.0, 0.066), V(0.018, -0.0238 * 2.0, 0.055), 0.0004, 0.0003), 0.0006)
    d = smax(d, -(m + 0.0002) / 2.0, 0.0005)
    nc = V(0.0025, -0.0043, NOSE_S + 0.0023)
    d = smax(d, -ellipsoid(L, nc, V(0.001, 0.00075, 0.0011)), 0.0005)
    return d - _locks(Q, 0.0015) * sstep(0.05, 0.03, L[:, 2])


def ear(P):
    """small round ears on the sides of the head, thick with fur"""
    Q = mirror(P)
    return CV.ear(Q, EAR_B, EAR_A, EAR_N, EAR_L, EAR_W, 'round', th0=0.0045, th1=0.0028, cup=0.75, tipin=0.0, base_r=(0.008, 0.006, 0.005))


def fleg(P):
    """short stocky legs in the coat (the long body fur hangs down over the tops of them)"""
    return _cat_fleg(P) - 0.007 * sstep(0.03, 0.12, mirror(P)[:, 1]) - 0.003


def hleg(P):
    """thick fur on the thighs"""
    Q = mirror(P)
    d = _cat_hleg(P) - 0.009 * sstep(0.04, 0.13, Q[:, 1]) - 0.003
    d = smin(d, ellipsoid(Q, V(0.044, 0.15, -0.17), V(0.024, 0.04, 0.021)), 0.018)
    return d - _locks(Q, 0.003) * sstep(0.06, 0.12, Q[:, 1])


def paws(P):
    a, b = _cat_paws(P)
    return a - 0.002, b


def tail(P):
    return _cat_tail(P) - _locks(mirror(P), 0.003)


def shape(P):
    """the cat's, with wider blends: the long coat runs smoothly over the shoulders, elbows and thighs"""
    d = trunk(P)
    d = smin(d, local(P, *BOX['neck'], neck), 0.04)
    h = local(P, *BOX['head'], head)
    ca, li, ba = local_n(P, *BOX['eyes'], eye_parts, 3)
    h = smin(h, li, 0.003)
    h = smax(h, -ca, 0.001)
    h = smin(h, ba, 0.0006)
    d = smin(d, h, 0.02)
    d = smin(d, local(P, *BOX['ear'], ear), 0.006)
    d = smin(d, local(P, *BOX['fleg'], fleg), 0.035)
    d = smin(d, local(P, *BOX['hleg'], hleg), 0.036)
    pw, cl = local_n(P, *BOX['paws'], paws, 2)
    d = smin(d, pw, 0.006)
    d = smin(d, local(P, *BOX['tail'], tail), 0.022)
    return d


def grid(h):
    from sdf import axis_steps
    lo, hi = BOUNDS
    xs = axis_steps(0.0, hi[0], [(0.02, BOX['ear'][1][0], h * 0.7)], h)
    ys = axis_steps(lo[1], hi[1], [(BOX['ear'][0][1], BOX['ear'][1][1], h * 0.6)], h)
    zs = axis_steps(lo[2], hi[2], [(BOX['ear'][0][2], BOX['ear'][1][2], h * 0.5)], h)
    return xs, ys, zs


# ---------- the long coat ----------
FUR = {'len': 0.045, 'n': 6, 'n1': 2, 'lean': 0.6, 'tile': 0.0016, 'babyLen': 0.9, 'babyLean': 0.4, 'shade': 0.55, 'quality': 80}


def fur(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y, z = Pm[:, 1], Pm[:, 2]
    ln = np.full(len(P), 0.032, F)
    ln = ln + 0.01 * sstep(-0.3, -0.8, N[:, 1]) * (1 - R['tail'])                         # the belly fringe
    ln = ln + 0.006 * sstep(-0.12, -0.16, z) * sstep(0.0, -0.6, N[:, 2]) * sstep(0.06, 0.14, y)
    leg = sstep(0.11, 0.05, y) * (1 - R['tail'])
    ln = ln * (1 - leg * 0.55)
    hd = R['head']
    # the face: short on the mask and the muzzle, long on the cheeks, the crown in between
    face = 0.007 + 0.006 * sstep(0.045, 0.025, L[:, 2]) + 0.016 * sstep(0.004, -0.016, L[:, 1]) * sstep(0.062, 0.04, L[:, 2]) * sstep(0.015, 0.03, np.abs(L[:, 0]))
    ln = ln * (1 - hd) + hd * (face - 0.004 * sstep(0.058, 0.07, L[:, 2]))
    er = R['ear']
    ln = ln * (1 - er) + er * (0.006 + 0.008 * R['earIn'])
    tl = R['tail']
    ln = ln * (1 - tl) + tl * (0.036 + 0.004 * sstep(0.2, 0.8, R['tt']))
    ln = ln * (1 - R['paw'] * 0.6)
    ln = ln * (1 - R['nose']) * (1 - R['lip']) * (1 - R['phil']) * (1 - R['pad'] * R['paw']) * sstep(1.2, 1.6, R['ring'])
    return np.clip(ln, 0, FUR['len']).astype(F), np.ones(len(P), F)


def _strands(P, N, R):
    """long, wavy coat strokes"""
    key = (len(P), float(P[:7].sum()))
    if key not in _scache:
        dens = 0.92 * (1 - R['nose']) * (1 - R['ball']) * (1 - R['pad'] * R['paw']) * (1 - 0.7 * R['lip']) * sstep(EYE.r + 0.0015, EYE.r + 0.004, R['eyeD'])
        _scache[key] = CV.strands(P, N, dens, flow, 0.0034, 0.006, 0.012, 0.0006, seed=195, lenk=lambda Q: _lenk(mirror(Q)))
    return _scache[key]


KP = {
    'gray': hexc(0x807A6E), 'grayDk': hexc(0x56524A), 'frost': hexc(0xE2E0D8), 'buff': hexc(0x9A8566), 'white': hexc(0xEEEBE4),
    'black': hexc(0x1E1C1A), 'nose': hexc(0x9A6A62), 'noseRim': hexc(0x4A3430), 'earIn': hexc(0xD8D0C4), 'pad': hexc(0x4A3A36),
    'lid': hexc(0x2A2420), 'kit': hexc(0x605C58),
}


def _marks(R, Pm, N):
    """the manul's markings: masks 0..1 for the dark bars, the tail rings and tip, the face's spots and stripes and the
    white parts of the face"""
    L, y, z = R['L'], Pm[:, 1], Pm[:, 2]
    hd, tl = R['head'], R['tail']
    wob = 0.15 * (fbm(Pm * 60, 2, 198) - 0.5)
    m = {}
    # a few narrow dark bars over the loins and down the backs of the hind legs
    loin = _bars(z / 0.03 + 0.3, 0.16, wob) * sstep(-0.03, -0.07, z) * sstep(-0.17, -0.12, z) * sstep(0.2, 0.6, N[:, 1]) * (1 - tl)
    hind = _bars(y / 0.022, 0.18, wob) * sstep(-0.1, -0.13, z) * sstep(0.16, 0.12, y) * sstep(0.03, 0.05, y) * sstep(0.0, -0.5, N[:, 2]) * (1 - tl)
    m['bars'] = np.clip(loin * 0.7 + hind * 0.8, 0, 1)
    # the tail: narrow black rings, a black tip
    m['rings'] = tl * np.maximum(_bars(R['tt'] * 6.5 + 0.5, 0.14, wob * 0.5) * sstep(0.15, 0.25, R['tt']), sstep(0.8, 0.86, R['tt']))
    # the face: small black spots on the forehead and crown; two black stripes back from the eye across each cheek with
    # white between and below; white round the eyes, over the muzzle and the chin
    ax = np.abs(L[:, 0])
    spots = sstep(0.62, 0.72, vnoise(Pm * 700, 199)) * sstep(0.3, 0.7, R['Nm'][:, 1]) * sstep(0.05, 0.04, L[:, 2]) * sstep(-0.01, 0.01, L[:, 2])
    u = L[:, 2] - 0.04
    s1 = sstep(0.0028, 0.0012, np.abs(L[:, 1] - (0.002 + 0.25 * u))) * sstep(0.05, 0.035, L[:, 2]) * sstep(0.008, 0.02, L[:, 2]) * sstep(0.018, 0.028, ax)
    s2 = sstep(0.0028, 0.0012, np.abs(L[:, 1] - (-0.009 + 0.3 * u))) * sstep(0.054, 0.038, L[:, 2]) * sstep(0.01, 0.022, L[:, 2]) * sstep(0.02, 0.03, ax)
    m['face'] = np.clip(spots * 0.8 + s1 + s2, 0, 1) * hd
    eyew = sstep(1.75, 1.2, R['ring']) * (1 - R['lid']) * (1 - R['ball'])
    muz = sstep(0.06, 0.07, L[:, 2]) * sstep(0.004, -0.008, L[:, 1])
    chin = sstep(-0.02, -0.03, L[:, 1]) * sstep(0.03, 0.05, L[:, 2])
    m['white'] = np.clip(eyew * 0.5 + muz + chin, 0, 1) * hd * (1 - R['nose'])
    return m


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    n1 = fbm(Pm * 22, 3, 111)
    n2 = fbm(Pm * 140, 3, 112)
    col = mix(np.tile(KP['gray'], (len(P), 1)), KP['grayDk'], 0.35 * sstep(0.3, 0.9, N[:, 1]) + 0.2 * (n1 - 0.4))
    col = mix(col, KP['buff'], sstep(0.18, 0.06, Pm[:, 1]) * 0.55 * (1 - R['tail']) + sstep(-0.2, -0.7, N[:, 1]) * 0.35)
    # the frosting: white tips on the long hairs, gray in the partings between the locks
    s, tone = _strands(P, N, R)
    col = mix(col, KP['grayDk'], (1 - s) * 0.4 * (1 - R['nose']))
    col = mix(col, KP['frost'], s * tone * 0.55 * (1 - R['nose']) * (1 - R['ball']) * (1 - 0.6 * sstep(0.14, 0.06, Pm[:, 1])))
    m = _marks(R, Pm, N)
    col = mix(col, KP['black'], m['bars'] * 0.75 + m['rings'] * 0.9)
    col = mix(col, KP['white'], m['white'] * 0.85)
    col = mix(col, KP['black'], m['face'] * 0.85)
    col = mix(col, KP['earIn'], R['ear'] * R['earIn'] * 0.75)
    col = mix(col, KP['grayDk'], R['ear'] * (1 - R['earIn']) * 0.4)
    nose = mix(np.tile(KP['nose'], (len(P), 1)), KP['noseRim'], sstep(0.4, 0.8, n2) * 0.3)
    col = mix(col, nose, R['nose'])
    col = mix(col, KP['noseRim'], R['phil'] * 0.5 + R['lip'] * 0.6)
    col = mix(col, KP['lid'], R['lid'])
    col = mix(col, KP['pad'], R['pad'] * R['paw'])
    col = mix(col, K['ball'], R['ball'])
    rough = 0.74 + 0.06 * (n2 - 0.5) - 0.25 * R['nose'] - 0.3 * R['lid']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    R = _regions(P, N, c)
    s, tone = _strands(P, N, R)
    return (0.0001 * s * (1 - R['ball']) * (1 - R['nose'])).astype(F)


def baby_paint(P, N, c, col):
    """kittens: darker gray fluffballs, the markings faint"""
    R = _regions(P, N, c)
    Pm = R['Pm']
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['pad'] * R['paw'] + R['ear'] * R['earIn'], 0, 1)
    m = _marks(R, Pm, N)
    kit = mix(np.tile(KP['kit'], (len(P), 1)), KP['gray'], 0.3 * fbm(Pm * 120, 3, 113))
    out = mix(col, kit, 0.7 * (1 - keep))
    out = mix(out, KP['black'], (m['rings'] * 0.4 + m['face'] * 0.3) * (1 - keep))
    out = mix(out, KP['white'], m['white'] * 0.45 * (1 - keep))
    return np.clip(out, 0, 1).astype(F)


# kittens: the cat's pot belly, a little more of it under the thick coat
KITTEN = dict(c=V(0.0, 0.196, -0.035), r=(0.066, 0.062, 0.18), rb=0.085, e=2.1, maxd=0.02)
_meta = meta


def meta(st):
    m = _meta(st)
    # big round eyes, yellow-green with round pupils (a kitten's a little grayer)
    m['eye'].update({'iris': 0xBEB44A, 'rim': 0x4A4414, 'pupil': 'round', 'pupilR': 0.34, 'babyIris': 0x9A9A6A, 'babyLidCol': 0x4A4642, 'lid': [1.0, -1.0, 0.05]})
    m.update({'flat': 0x8A867E, 'rim': [0.14, 0.13, 0.12]})
    m['collar'] = {'at': ['neck', 'neck2', 0.75], 'lift': 0.4}
    m['belly'] = [0.0, 0.12, -0.07]
    return m


def hair_texture():
    """white whiskers"""
    import smallfur as SF
    wh = [(0.0, (0.86, 0.85, 0.82)), (1.0, (0.97, 0.96, 0.94))]
    cols = [dict(kind='hair', stops=wh, n=12, wid=1.8, end=(0.95, 1.0), wave=0.02, root=1.0) for _ in range(3)]
    return SF.strand_texture((96, 128), cols, seed=129)
