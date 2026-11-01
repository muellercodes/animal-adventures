# A Siberian husky, refitted from the golden retriever (dogkit.py): medium sized and a little lighter in build, the
# body slightly longer than tall, a thick ruff round the neck, a medium head with a muzzle tapering to the nose,
# almond eyes set a little aslant (ice blue), triangular ears standing up high on the head, thick and well furred,
# and the bushy fox-brush tail curled up over the back in a sickle. The double coat is thick and medium long: gray
# with black tipped guard hairs over the back, the neck and the outsides, white underneath, on the legs, the cheeks
# and the muzzle, the classic mask (the dark cap with its peak down the forehead, white spots over the eyes, dark
# round the eyes and back to the ears). Puppies are fluffier and darker gray, with blue eyes.
import numpy as np
from sdf import V, F, nrm, sstep, fbm, smin, ellipsoid
import dogkit as K
from carnivore import mirror, mix, hexc
import dog as G

ID = 'husky'
FIT = K.Fit(s=0.95, kL=1.04, kB=0.97, kz=1.03, kw=0.94, kLW=0.92, neck=(0.012, 0.004),
            head=dict(k=0.98, pitch=0.05, kS=1.0, kM=0.9, kSW=1.0, kMW=0.92, kTW=0.8, kDome=1.02, kMD=0.88, kJaw=0.9))


def _ear(f):
    sh = f.sh
    B = f.head_fwd(V(0.03, 0.753, 0.373)[None])[0]
    return K.ErectEar(B, (0.14, 1.0, 0.06), (0.3, 0.05, 1.0), 0.072 * sh, 0.034 * sh, sh, shape='point', th0=0.009 * sh, th1=0.003 * sh, cup=0.7,
                      base_r=(0.024 * sh, 0.016 * sh, 0.016 * sh))


# curled up over the back in a sickle; the brush (its long hair) on the outside of the curl
TAIL = [(0.0, 0.0, 0.03, 0.0), (0.03, -0.025, 0.031, 0.006), (0.075, -0.035, 0.03, 0.012), (0.12, -0.02, 0.028, 0.016), (0.155, 0.015, 0.025, 0.018),
        (0.17, 0.06, 0.022, 0.017), (0.16, 0.105, 0.018, 0.014), (0.135, 0.14, 0.013, 0.01), (0.11, 0.155, 0.008, 0.005)]


def _tail(f):
    root = f.fwd(V(0.0, 0.507, -0.36)[None])[0]
    s = f.s
    return K.Tail([(root[1] + dy * s, root[2] + dz * s, r * s, fl * s) for dy, dz, r, fl in TAIL], bones=(1, 3, 5), flag_e=2.0)


def _ruff(P, d, b):
    """the thick ruff of the double coat round the neck and over the shoulders"""
    f = b.fit
    Q = mirror(P)
    c = f.fwd(V(0.0, 0.535, 0.245)[None])[0]
    r = ellipsoid(Q, c, V(0.098, 0.088, 0.085) * f.s * V(f.kw, 1.0, 1.0))
    return smin(d, r, 0.05 * f.s)


B = K.Breed(ID, FIT, _ear, _tail, eye=dict(k=0.96, lid_h=0.82, slant=0.28, d=(0.001, 0.001, 0.0)), paw=0.95, body_extra=_ruff,
            coat=dict(cell=0.0055, l0=0.008, l1=0.016, wid=0.0009, seed=97))

KC = {'white': hexc(0xF0EEE9), 'cream': hexc(0xE4DED3), 'gray': hexc(0x77777A), 'grayDk': hexc(0x38383B), 'black': hexc(0x1E1E20),
      'nose': hexc(0x151414), 'pad': hexc(0x2A2624), 'claw': hexc(0xCFC8BC), 'clawDk': hexc(0x3A3532), 'earIn': hexc(0xE8E2DA)}


def _pattern(R, N):
    """how dark (0 white .. 1 the gray of the saddle) each point is: the saddle over the back, the neck and the outsides,
    the cap and the mask on the face, the ears; white underneath, on the legs, the cheeks and the muzzle"""
    Pg, L = R['Pg'], R['L']
    y, z = Pg[:, 1], Pg[:, 2]
    w2 = fbm(Pg * 22, 2, 43) - 0.5
    hd = R['head']
    # body: the saddle comes down the sides to about the elbow and the stifle, the neck dark on top and the sides
    side = sstep(-0.35, 0.15, N[:, 1] + 0.25 * w2)
    body = sstep(0.36, 0.46, y + 0.05 * w2) * side
    body = np.maximum(body, sstep(0.48, 0.58, y + 0.04 * w2) * sstep(-0.2, 0.3, N[:, 1] - 0.3 * N[:, 2]))
    body = body * (1 - sstep(0.24, 0.31, z) * sstep(0.62, 0.52, y))        # the throat and the chest white
    body = body * (1 - hd)
    # the face: dark cap with its peak down the forehead, white spots over the eyes, dark round the eyes and back to
    # the ears, the bridge of the muzzle a little gray, the rest white
    x, u, s = np.abs(L[:, 0]), L[:, 1], L[:, 2]
    cap = sstep(-0.002, 0.012, u + 0.25 * (s - 0.06) * sstep(0.03, 0.06, x)) * sstep(0.135, 0.11, s - 0.25 * x)
    peak = sstep(0.016, 0.008, x) * sstep(0.135, 0.125, s) * sstep(0.0, 0.01, u)
    cap = np.maximum(cap, peak)
    brow = sstep(0.011, 0.006, np.linalg.norm(np.stack([x - 0.03, u - 0.028, s - 0.097], 1), axis=1))
    eyes = sstep(0.022, 0.014, np.linalg.norm(np.stack([x - 0.0425, (u - 0.012) * 1.4, (s - 0.104) * 0.75], 1), axis=1))
    back = sstep(-0.01, 0.006, u) * sstep(0.09, 0.06, s)
    bridge = sstep(0.014, 0.006, x) * sstep(0.004, 0.012, u) * sstep(0.12, 0.14, s) * sstep(0.21, 0.18, s) * 0.55
    face = np.clip(np.maximum.reduce([cap * (1 - brow), eyes * 0.85, back, bridge]), 0, 1) * hd
    ear = R['ear'] * (1 - R['earIn'] * 0.9)
    tail = R['tail'] * (1 - sstep(0.2, 0.7, R['tailUnder'] / np.maximum(R['tail'], 1e-3)))
    dark = np.clip(np.maximum.reduce([body, face, ear, tail * 0.85]), 0, 1)
    return dark * (1 - R['paw'])


def paint(P, N, c):
    R = B.regions(P, N, c)
    Pm = R['Pm']
    n1 = fbm(R['Pg'] * 8, 3, 11)
    n2 = fbm(Pm * 40, 3, 12)
    dark = _pattern(R, N)
    col = mix(np.tile(KC['white'], (len(P), 1)), KC['cream'], sstep(-0.2, -0.7, N[:, 1]) * 0.5)
    gray = mix(np.tile(KC['gray'], (len(P), 1)), KC['grayDk'], sstep(0.3, 0.9, N[:, 1]) * 0.6 + 0.25 * (n1 - 0.5))
    col = mix(col, gray, dark)
    col = mix(col, KC['earIn'], R['ear'] * R['earIn'] * 0.8)
    col = B.bare(col, R, n1, n2, nose=KC['nose'], lip=hexc(0x1C1A1A), pad=KC['pad'], claw=KC['claw'], clawLt=KC['clawDk'], rim=hexc(0x1A1818))
    # the guard hairs: long strokes, the dark ones tipped black, the white ones a little silvery
    s, tone = B.strands(P, N, R)
    tip = s * (tone - 0.35)
    col = col * (1 + 0.1 * tip - 0.05 * (1 - s))[:, None]
    col = mix(col, KC['black'], dark * s * sstep(0.45, 0.85, tone) * 0.45)
    col = mix(col, G.K['ball'], R['ball'])
    rough = 0.66 + 0.06 * (n2 - 0.5) - 0.15 * R['nose'] - 0.3 * R['lid'] - 0.12 * R['lip'] - 0.25 * R['claw']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


FUR = {'len': 0.052, 'n': 5, 'lean': 1.2, 'tile': 0.0017, 'babyLen': 1.4, 'babyLean': 0.45, 'shade': 0.62, 'quality': 80}


def fur(P, N, c):
    """a thick double coat: medium long over the body, longest in the ruff and the brush of the tail, short on the face,
    the fronts of the legs and the paws, a little fluff inside the ears"""
    R = B.regions(P, N, c)
    Pg, L = R['Pg'], R['L']
    y, z = Pg[:, 1], Pg[:, 2]
    ln = np.full(len(P), 0.03, F)
    ruff = sstep(0.16, 0.24, z) * sstep(0.42, 0.5, y) * (1 - R['head'])
    ln = ln + 0.016 * ruff
    leg = sstep(0.36, 0.24, y) * (1 - R['tail'])
    back = sstep(0.0, -0.6, N[:, 2])
    ln = ln * (1 - leg * (0.65 - 0.3 * back * sstep(0.14, 0.24, y)))
    hd = R['head']
    cheek = sstep(-0.01, -0.03, L[:, 1]) * sstep(0.1, 0.06, L[:, 2])
    ln = ln * (1 - hd) + hd * (0.008 + 0.012 * sstep(0.04, 0.0, L[:, 2]) + 0.01 * cheek - 0.004 * sstep(0.13, 0.17, L[:, 2]))
    er = R['ear']
    ln = ln * (1 - er) + er * (0.008 + 0.01 * R['earIn'])
    tl = R['tail']
    ln = ln * (1 - tl) + tl * (0.034 + 0.018 * sstep(-0.1, 0.6, R['tailUnder'] / np.maximum(tl, 1e-3)) - 0.012 * sstep(0.85, 1.0, R['tt']))
    ln = ln * (1 - R['paw'] * 0.7)
    ln = ln * (1 - R['nose']) * (1 - R['lip']) * (1 - R['claw']) * (1 - R['pad'] * R['paw']) * sstep(B.EYE.r + 0.003, B.EYE.r + 0.009, R['eyeD'])
    dens = np.ones(len(P), F)
    return np.clip(ln, 0, FUR['len']).astype(F), dens


def meta(st):
    m = B.meta_base(st, iris=0x9CC8E8, babyIris=0x7EA8D2, babyLid=0x3A3A3C, flat=0x8A8A8C, rim=(0.16, 0.16, 0.18), pupilR=0.4)
    m['collar']['maxR'] = round(0.1 * FIT.s, 4)
    m['collar']['lift'] = 0.6
    return m


def baby_paint(P, N, c, col):
    """husky puppies: the same mask and saddle, the gray darker and softer"""
    R = B.regions(P, N, c)
    dark = _pattern(R, N)
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['lip'] + R['claw'] + R['pad'] * R['paw'], 0, 1)
    out = mix(col, col * 0.4 + hexc(0x3E3E42) * 0.6, dark * 0.75 * (1 - keep))
    return np.clip(out, 0, 1).astype(F)


def hair_texture():
    import smallfur as SF
    wh = [(0.0, (0.86, 0.85, 0.82)), (1.0, (0.95, 0.94, 0.92))]
    whd = [(0.0, (0.08, 0.07, 0.07)), (1.0, (0.22, 0.2, 0.19))]
    cols = [dict(kind='hair', stops=wh, n=6, wid=1.6, end=(0.95, 1.0), wave=0.02, root=1.0),
            dict(kind='hair', stops=whd, n=6, wid=1.6, end=(0.95, 1.0), wave=0.02, root=1.0)]
    return SF.strand_texture((64, 128), cols, seed=35)


HAIR = {'size': (64, 128), 'cols': 2, 'base': (0.86, 0.85, 0.82), 'hi': (0.9, 0.9, 0.88), 'tip': (0.95, 0.94, 0.92), 'strands': 6,
        'root': 0.05, 'rough': 0.5, 'alpha': 0.3, 'seed': 35, 'quality': 80}


def cards():
    return B.whiskers(shape, n=4, length=0.9, col=0)


B.export(globals())
