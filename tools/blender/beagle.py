# A Beagle, refitted from the golden retriever (dogkit.py): a small, sturdy hound, two thirds of the golden's size,
# a little longer and deeper in the body for its height, a slightly domed skull, a square cut muzzle with moderate
# flews, big soft brown eyes, long soft ears set low and hanging close to the cheeks with rounded tips, and the tail
# set high and carried gaily up in a gentle curve, with a little brush and a white tip. The short dense coat is
# tricolor: the black saddle, tan on the head, the ears, the shoulders and the thighs, white on the muzzle and the
# blaze, the chest, the belly, the legs and the tip of the tail. Puppies have more black (it fades to tan as they grow).
import numpy as np
from sdf import V, F, nrm, sstep, fbm, smin, ellipsoid
import dogkit as K
from carnivore import mirror, mix, hexc
import dog as G

ID = 'beagle'
FIT = K.Fit(s=0.66, kL=0.92, kB=1.05, kz=1.04, kw=1.06, kLW=1.05, neck=(-0.006, -0.004),
            head=dict(k=1.14, pitch=0.04, kS=1.03, kM=0.88, kSW=1.02, kMW=1.02, kTW=1.05, kDome=1.12, kMD=1.02, kJaw=1.0))


def _ear(f):
    sh = f.sh
    B = f.head_fwd(V(0.068, 0.714, 0.384)[None])[0]
    return K.DropEar(B, (0.1, -1.0, 0.12), (1.0, 0.1, -0.08), 0.148 * sh, 0.043 * sh, sh, w0=0.68, um=0.55, p=2.2, standoff=0.4, cup=1.0, swing=1.3, th=0.9)


# set high and carried up in a gentle curve; a little brush on its underside
TAIL = [(0.0, 0.0, 0.026, 0.0), (0.022, -0.02, 0.025, 0.002), (0.062, -0.034, 0.022, 0.005), (0.11, -0.04, 0.019, 0.007), (0.16, -0.035, 0.0165, 0.008),
        (0.205, -0.02, 0.014, 0.007), (0.24, 0.0, 0.011, 0.005), (0.258, 0.016, 0.006, 0.002)]


def _tail(f):
    root = f.fwd(V(0.0, 0.507, -0.36)[None])[0]
    s = f.s
    return K.Tail([(root[1] + dy * s, root[2] + dz * s, r * s, fl * s) for dy, dz, r, fl in TAIL], bones=(1, 3, 5), flag_e=2.0)


def _head(Lb, d, b):
    """moderate flews: the upper lips hang a little over the lower jaw at the sides"""
    Lg = b.fit.head_local_inv(Lb)
    k = b.sh * b.fit.kdh
    fl = ellipsoid(Lg, V(0.026, -0.047, 0.178), V(0.0145, 0.022, 0.044)) * k
    return smin(d, fl, 0.01 * b.sh)


B = K.Breed(ID, FIT, _ear, _tail, eye=dict(k=1.18, lid_h=1.1, slant=0.05, d=(0.002, 0.0, 0.0)), paw=1.0, head_extra=_head,
            coat=dict(cell=0.0032, l0=0.0038, l1=0.007, wid=0.0006, seed=99))

KC = {'white': hexc(0xF2EEE6), 'cream': hexc(0xE7DFD1), 'tan': hexc(0xB97A3C), 'tanLt': hexc(0xCB9152), 'tanDk': hexc(0x9C6230),
      'black': hexc(0x1D1B1A), 'blackHi': hexc(0x37322F), 'nose': hexc(0x151212), 'pad': hexc(0x2A2523), 'claw': hexc(0xCFC6B8), 'clawDk': hexc(0x3A3532)}


def _pattern(R, N, baby=False):
    """(white, black) masks of the tricolor coat; tan is what is left"""
    Pg, L = R['Pg'], R['L']
    y, z = Pg[:, 1], Pg[:, 2]
    w2 = fbm(Pg * 20, 2, 44) - 0.5
    hd = R['head']
    x, u, s = np.abs(L[:, 0]), L[:, 1], L[:, 2]
    # white: the muzzle and the blaze up the forehead, the chest, the throat, the belly, the legs, the tip of the tail
    muz = hd * sstep(0.14, 0.165, s + 0.2 * np.maximum(-u - 0.02, 0)) * (1 - 0.6 * sstep(0.0, 0.012, u) * sstep(0.2, 0.17, s) * sstep(0.008, 0.016, x))
    blaze = hd * sstep(0.013, 0.007, x - 0.06 * np.maximum(s - 0.1, 0)) * sstep(0.02, 0.05, s) * sstep(-0.01, 0.0, u)
    M = B.markings(R, N)
    under = np.clip(np.maximum.reduce([M['chest'], M['throat'], M['belly'] * 1.2, M['inner'] * 0.8]), 0, 1)
    legs = sstep(0.31, 0.25, y + 0.03 * w2) * (1 - R['tail'])
    tip = R['tail'] * sstep(0.8, 0.86, R['tt'])
    white = np.clip(np.maximum.reduce([muz, blaze, under, legs, tip, R['paw']]), 0, 1)
    # black: the saddle over the back from the withers to the tail, down the sides to about half way, and the top of
    # the tail (puppies: more of it, over the neck and the head too)
    up = N[:, 1] + 0.35 * w2
    lo = 0.43 if not baby else 0.38
    saddle = sstep(lo, lo + 0.06, y + 0.04 * w2) * sstep(-0.42, -0.36, z) * sstep(0.22, 0.12, z + 0.05 * w2) * sstep(-0.45, 0.05, up)
    saddle = saddle * (1 - hd)
    tailtop = R['tail'] * sstep(0.04, 0.1, R['tt']) * (1 - sstep(0.3, 0.7, R['tailUnder'] / np.maximum(R['tail'], 1e-3)))
    black = np.maximum(saddle, tailtop)
    if baby:
        neck = sstep(0.5, 0.58, y) * sstep(-0.3, 0.3, up) * (1 - hd)
        cap = hd * sstep(0.0, 0.02, u) * sstep(0.12, 0.08, s) * (1 - blaze)
        black = np.maximum.reduce([black, neck, cap * 0.85, R['ear'] * 0.6])
    black = black * (1 - white)
    return white, black


def paint(P, N, c):
    R = B.regions(P, N, c)
    Pm = R['Pm']
    n1 = fbm(R['Pg'] * 8, 3, 11)
    n2 = fbm(Pm * 40, 3, 12)
    white, black = _pattern(R, N)
    col = mix(np.tile(KC['tan'], (len(P), 1)), KC['tanLt'], sstep(-0.1, -0.6, N[:, 1]) * 0.5 + 0.3 * (n1 - 0.5))
    col = mix(col, KC['tanDk'], R['ear'] * 0.35 + R['top'] * 0.2)
    col = mix(col, mix(np.tile(KC['black'], (len(P), 1)), KC['blackHi'], R['top'] * 0.35), black)
    col = mix(col, mix(np.tile(KC['white'], (len(P), 1)), KC['cream'], sstep(-0.3, -0.8, N[:, 1]) * 0.5), white)
    col *= (0.95 + 0.08 * n1)[:, None]
    col = B.bare(col, R, n1, n2, nose=KC['nose'], lip=hexc(0x1E1A19), pad=KC['pad'], claw=KC['claw'], clawLt=KC['clawDk'], rim=hexc(0x1A1615))
    s, tone = B.strands(P, N, R)
    col *= (1 + s * 0.12 * (tone - 0.4) - 0.04 * (1 - s))[:, None]
    col = mix(col, G.K['ball'], R['ball'])
    rough = 0.62 + 0.06 * (n2 - 0.5) - 0.15 * R['nose'] - 0.3 * R['lid'] - 0.12 * R['lip'] - 0.25 * R['claw']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


FUR = {'len': 0.02, 'n': 4, 'lean': 1.6, 'tile': 0.0012, 'babyLen': 1.6, 'babyLean': 0.6, 'shade': 0.7, 'quality': 80}


def fur(P, N, c):
    """short, dense and hard: a little longer on the neck and in the brush under the tail, shortest on the face, the
    ears and the legs"""
    R = B.regions(P, N, c)
    Pg, L = R['Pg'], R['L']
    y, z = Pg[:, 1], Pg[:, 2]
    ln = np.full(len(P), 0.01, F)
    ln = ln + 0.003 * sstep(0.2, 0.3, z) * sstep(0.62, 0.5, y) * (1 - R['head'])
    ln = ln * (1 - sstep(0.38, 0.25, y) * (1 - R['tail']) * 0.4)
    hd = R['head']
    ln = ln * (1 - hd) + hd * (0.0045 + 0.004 * sstep(0.04, 0.0, L[:, 2]))
    ln = ln * (1 - R['ear']) + R['ear'] * 0.0045
    tl = R['tail']
    ln = ln * (1 - tl) + tl * (0.009 + 0.01 * sstep(-0.1, 0.6, R['tailUnder'] / np.maximum(tl, 1e-3)))
    ln = ln * (1 - R['paw'] * 0.6)
    ln = ln * (1 - R['nose']) * (1 - R['lip']) * (1 - R['claw']) * (1 - R['pad'] * R['paw']) * sstep(B.EYE.r + 0.003, B.EYE.r + 0.009, R['eyeD'])
    return np.clip(ln, 0, FUR['len']).astype(F), np.ones(len(P), F)


def meta(st):
    return B.meta_base(st, iris=0x4A2A12, babyIris=0x2E2A28, babyLid=0x2C2624, flat=0xB97A3C, rim=(0.2, 0.13, 0.06))


def baby_paint(P, N, c, col):
    """beagle puppies: the same white, more black (over the neck, the head and the ears), the tan a little darker"""
    R = B.regions(P, N, c)
    white, black = _pattern(R, N, baby=True)
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['lip'] + R['claw'] + R['pad'] * R['paw'], 0, 1)
    out = mix(col, col * 0.8 + KC['tanDk'] * 0.2, (1 - white) * (1 - black) * (1 - keep))
    out = mix(out, KC['black'], black * (1 - keep))
    return np.clip(out, 0, 1).astype(F)


def hair_texture():
    import smallfur as SF
    wh = [(0.0, (0.86, 0.85, 0.82)), (1.0, (0.95, 0.94, 0.92))]
    whd = [(0.0, (0.08, 0.07, 0.07)), (1.0, (0.22, 0.2, 0.19))]
    cols = [dict(kind='hair', stops=wh, n=6, wid=1.6, end=(0.95, 1.0), wave=0.02, root=1.0),
            dict(kind='hair', stops=whd, n=6, wid=1.6, end=(0.95, 1.0), wave=0.02, root=1.0)]
    return SF.strand_texture((64, 128), cols, seed=37)


HAIR = {'size': (64, 128), 'cols': 2, 'base': (0.86, 0.85, 0.82), 'hi': (0.9, 0.9, 0.88), 'tip': (0.95, 0.94, 0.92), 'strands': 6,
        'root': 0.05, 'rough': 0.5, 'alpha': 0.3, 'seed': 37, 'quality': 80}


def cards():
    return B.whiskers(shape, n=4, length=1.0, col=1)


B.export(globals())
