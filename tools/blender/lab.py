# A black Labrador retriever, refitted from the golden retriever (dogkit.py): a little shorter in the back, broader
# and stouter, thicker legs, a broad skull and a broad, blunt muzzle, smaller ears set a little lower and hanging close
# to the cheeks, and the otter tail (very thick at the root, tapering, round, no feathering). The coat is short, dense
# and glossy black: fine short strokes, short fur shells lying flat. Puppies are black too, a little softer and duller.
import numpy as np
from sdf import V, F, nrm, sstep, fbm
import dogkit as K
from carnivore import mirror, mix, hexc
import dog as G

ID = 'lab'
FIT = K.Fit(s=1.0, kL=1.0, kB=1.02, kz=0.98, kw=1.08, kLW=1.07, neck=(-0.004, -0.008),
            head=dict(k=1.0, pitch=0.0, kS=1.0, kM=0.9, kSW=1.14, kMW=1.15, kTW=1.2, kDome=1.0, kMD=1.04, kJaw=1.05))


def _ear(f):
    sh = f.sh
    B = f.head_fwd(V(0.066, 0.721, 0.386)[None])[0]
    return K.DropEar(B, (0.14, -1.0, 0.06), (1.0, 0.1, -0.12), 0.095 * sh, 0.04 * sh, sh, w0=0.86, um=0.24, p=1.6, standoff=0.6, cup=0.9, swing=0.8)


def _tail(f):
    root = f.fwd(V(0.0, 0.507, -0.36)[None])[0]
    s = f.s
    rel = [(0.0, 0.0, 0.04), (-0.006, -0.03, 0.038), (-0.02, -0.074, 0.033), (-0.04, -0.118, 0.0275), (-0.066, -0.162, 0.0235),
           (-0.096, -0.202, 0.0195), (-0.128, -0.236, 0.0158), (-0.156, -0.262, 0.0118), (-0.172, -0.276, 0.0068)]
    return K.Tail([(root[1] + dy * s, root[2] + dz * s, r * s, 0.0) for dy, dz, r in rel], bones=(1, 3, 5))


B = K.Breed(ID, FIT, _ear, _tail, eye=dict(k=1.0, d=(0.002, 0.0, 0.0)), paw=1.06,
            coat=dict(cell=0.0038, l0=0.0045, l1=0.0085, wid=0.0007, seed=93),
            pup_head=dict(muzzle=((0.115, -0.018, 0.037, 0.041), (0.215, -0.022, 0.029, 0.034)), nose=0.1))

KC = {'black': hexc(0x19181A), 'blackHi': hexc(0x34302D), 'blackLo': hexc(0x0E0D0F), 'brown': hexc(0x2C2420), 'nose': hexc(0x131212),
      'pad': hexc(0x1E1B1A), 'claw': hexc(0x26221F), 'clawLt': hexc(0x4A4440)}


def paint(P, N, c):
    R = B.regions(P, N, c)
    Pm = R['Pm']
    M = B.markings(R, N)
    n1 = fbm(R['Pg'] * 8, 3, 11)
    n2 = fbm(Pm * 40 / B.s, 3, 12)
    col = np.tile(KC['black'], (len(P), 1))
    # the coat is a touch browner where the sun bleaches it (the back, the outside of the ears), darker underneath
    col = mix(col, KC['brown'], R['top'] * 0.35 * (0.6 + 0.4 * n1))
    col = mix(col, KC['blackLo'], sstep(-0.2, -0.7, N[:, 1]) * 0.5)
    col *= (0.92 + 0.16 * n1)[:, None]
    col = B.bare(col, R, n1, n2, nose=KC['nose'], lip=hexc(0x141213), pad=KC['pad'], claw=KC['claw'], clawLt=KC['clawLt'], rim=hexc(0x121011))
    # the short glossy coat: fine strokes with lighter tips
    s, tone = B.strands(P, N, R)
    col = col + (s * 0.1 * (tone - 0.3))[:, None] * (1 - R['nose'] - R['ball'])[:, None]
    col = mix(col, G.K['ball'], R['ball'])
    # a soft sheen on the coat, the nose leather wet and shiny against it
    rough = 0.64 + 0.06 * (n2 - 0.5) - 0.3 * R['nose'] - 0.3 * R['lid'] - 0.12 * R['lip'] - 0.25 * R['claw']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


FUR = {'len': 0.022, 'n': 4, 'lean': 1.6, 'tile': 0.0013, 'babyLen': 1.7, 'babyLean': 0.6, 'shade': 0.7, 'quality': 80}


def fur(P, N, c):
    """short, dense, lying flat: a little longer on the neck and the tail, shortest on the face, the ears and the legs"""
    R = B.regions(P, N, c)
    Pg, L = R['Pg'], R['L']
    y, z = Pg[:, 1], Pg[:, 2]
    ln = np.full(len(P), 0.011, F)
    ln = ln + 0.004 * sstep(0.2, 0.3, z) * sstep(0.62, 0.5, y) * (1 - R['head'])
    leg = sstep(0.38, 0.25, y) * (1 - R['tail'])
    ln = ln * (1 - leg * 0.4)
    hd = R['head']
    ln = ln * (1 - hd) + hd * (0.005 + 0.004 * sstep(0.04, 0.0, L[:, 2]) - 0.0015 * sstep(0.13, 0.17, L[:, 2]))
    ln = ln * (1 - R['ear']) + R['ear'] * 0.006
    tl = R['tail']
    ln = ln * (1 - tl) + tl * (0.016 - 0.006 * sstep(0.8, 1.0, R['tt']))
    ln = ln * (1 - R['paw'] * 0.6)
    ln = ln * (1 - R['nose']) * (1 - R['lip']) * (1 - R['claw']) * (1 - R['pad'] * R['paw']) * sstep(B.EYE.r + 0.003, B.EYE.r + 0.009, R['eyeD'])
    dens = np.ones(len(P), F)
    return np.clip(ln, 0, FUR['len']).astype(F), dens


def meta(st):
    m = B.meta_base(st, iris=0x5A3418, babyIris=0x2A2626, babyLid=0x26211E, flat=0x19181A, rim=(0.16, 0.15, 0.16))
    return m


def baby_paint(P, N, c, col):
    """black puppies: the same black, softer and a little duller and browner"""
    R = B.regions(P, N, c)
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['lip'] + R['claw'] + R['pad'] * R['paw'], 0, 1)
    out = mix(col, col * 0.5 + hexc(0x221E1C) * 0.5, 1 - keep)
    return np.clip(out, 0, 1).astype(F)


def hair_texture():
    import smallfur as SF
    wh = [(0.0, (0.07, 0.06, 0.06)), (1.0, (0.2, 0.18, 0.17))]
    return SF.strand_texture((32, 128), [dict(kind='hair', stops=wh, n=6, wid=1.6, end=(0.95, 1.0), wave=0.02, root=1.0)], seed=31)


HAIR = {'size': (32, 128), 'cols': 1, 'base': (0.07, 0.06, 0.06), 'hi': (0.12, 0.1, 0.1), 'tip': (0.2, 0.18, 0.17), 'strands': 6,
        'root': 0.05, 'rough': 0.5, 'alpha': 0.3, 'seed': 31, 'quality': 80}


def cards():
    return B.whiskers(shape, n=4, length=1.0, col=0)


B.export(globals())
