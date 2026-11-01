# A Chihuahua, refitted from the golden retriever (dogkit.py): tiny (about 20 cm at the shoulder), a little longer
# than tall, fine boned with thin legs and small dainty feet, the head big for the body: the round "apple dome" skull,
# a deep, almost square stop, a short, slightly pointed muzzle, big round dark eyes set well apart, and very large
# ears standing up and flaring out to the sides. The tail is carried up in a sickle over the back. The coat is short,
# smooth and glossy: fawn, a little darker over the back, cream on the chest, the belly and the insides of the legs;
# the thin ears show pink inside. Puppies are a little paler.
import numpy as np
from sdf import V, F, nrm, sstep, fbm, smin, smax, ellipsoid
import dogkit as K
from carnivore import mirror, mix, hexc
import dog as G

ID = 'chihuahua'
FIT = K.Fit(s=0.36, kL=0.95, kB=0.95, kz=1.0, kw=1.0, kLW=0.7, neck=(-0.02, -0.02),
            head=dict(k=1.5, pitch=0.12, kS=0.95, kM=0.5, kSW=1.12, kMW=0.85, kTW=0.75, kDome=1.55, kMD=0.8, kJaw=0.85))


def _ear(f):
    sh = f.sh
    B = f.head_fwd(V(0.036, 0.748, 0.36)[None])[0]
    return K.ErectEar(B, (0.62, 0.78, -0.04), (0.35, -0.05, 1.0), 0.108 * sh, 0.054 * sh, sh, shape='point', th0=0.006 * sh, th1=0.0022 * sh, cup=0.75,
                      base_r=(0.032 * sh, 0.02 * sh, 0.02 * sh))


# carried up in a sickle over the back
TAIL = [(0.0, 0.0, 0.024), (0.03, -0.022, 0.022), (0.08, -0.032, 0.0195), (0.135, -0.022, 0.017), (0.18, 0.008, 0.0145),
        (0.208, 0.05, 0.012), (0.21, 0.092, 0.0095), (0.195, 0.122, 0.0065), (0.178, 0.135, 0.004)]


def _tail(f):
    root = f.fwd(V(0.0, 0.507, -0.36)[None])[0]
    s = f.s
    return K.Tail([(root[1] + dy * s, root[2] + dz * s, r * s, 0.0) for dy, dz, r in TAIL], bones=(1, 3, 5))


def _head(Lb, d, b):
    """the apple dome over the skull; the stop deep and short"""
    Lg = b.fit.head_local_inv(Lb)
    k = b.sh * b.fit.kdh
    dome = ellipsoid(Lg, V(0.0, 0.012, 0.05), V(0.066, 0.062, 0.074)) * k
    return smin(d, dome, 0.012 * b.sh)


B = K.Breed(ID, FIT, _ear, _tail, eye=dict(k=1.55, lid_w=1.1, lid_h=1.35, slant=0.0, d=(0.004, 0.002, -0.002), turn=(-0.12, 0.02), sink=0.22, mound=0.7), paw=0.78,
            head_extra=_head, coat=dict(cell=0.0022, l0=0.0026, l1=0.0048, wid=0.0004, seed=101),
            collar={'at': ['neck2', 'head', 0.1], 'lift': 0.35, 'maxR': 0.035})

KC = {'fawn': hexc(0xCB9558), 'fawnDk': hexc(0xAD7A43), 'fawnLt': hexc(0xDDB27A), 'cream': hexc(0xEAD3AC), 'earIn': hexc(0xD8A28E),
      'nose': hexc(0x1A1514), 'pad': hexc(0x3A2E2A), 'claw': hexc(0x2E2826), 'clawLt': hexc(0xB8A58E)}


def paint(P, N, c):
    R = B.regions(P, N, c)
    Pm = R['Pm']
    n1 = fbm(R['Pg'] * 8, 3, 11)
    n2 = fbm(Pm * 90, 3, 12)
    M = B.markings(R, N)
    col = mix(np.tile(KC['fawn'], (len(P), 1)), KC['fawnLt'], sstep(-0.1, -0.6, N[:, 1]) * 0.5 + 0.25 * (n1 - 0.5))
    col = mix(col, KC['fawnDk'], M['saddle'] * 0.45 + R['top'] * R['head'] * 0.25)
    pale = np.clip(np.maximum.reduce([M['chest'], M['throat'], M['belly'], M['inner'] * 0.7, M['under_tail'] * 0.5]), 0, 1)
    col = mix(col, KC['cream'], pale * 0.8)
    # the thin ears: pink skin showing inside through the short hair
    col = mix(col, KC['earIn'], R['ear'] * R['earIn'] * 0.65)
    col *= (0.96 + 0.08 * n1)[:, None]
    col = B.bare(col, R, n1, n2, nose=KC['nose'], lip=hexc(0x2A1E1A), pad=KC['pad'], claw=KC['claw'], clawLt=KC['clawLt'], rim=hexc(0x221816))
    s, tone = B.strands(P, N, R)
    col *= (1 + s * 0.1 * (tone - 0.4) - 0.03 * (1 - s))[:, None]
    col = mix(col, G.K['ball'], R['ball'])
    rough = 0.55 + 0.06 * (n2 - 0.5) - 0.12 * R['nose'] - 0.25 * R['lid'] - 0.1 * R['lip'] - 0.2 * R['claw']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


FUR = {'len': 0.01, 'n': 4, 'lean': 1.6, 'tile': 0.0008, 'babyLen': 1.15, 'babyLean': 0.8, 'shade': 0.75, 'quality': 80}


def fur(P, N, c):
    """short and smooth, a little longer on the neck and the tail, very short on the face and the ears"""
    R = B.regions(P, N, c)
    Pg, L = R['Pg'], R['L']
    y, z = Pg[:, 1], Pg[:, 2]
    ln = np.full(len(P), 0.0055, F)
    ln = ln + 0.002 * sstep(0.2, 0.3, z) * sstep(0.62, 0.5, y) * (1 - R['head'])
    ln = ln * (1 - sstep(0.38, 0.25, y) * (1 - R['tail']) * 0.4)
    hd = R['head']
    ln = ln * (1 - hd) + hd * (0.0028 + 0.0015 * sstep(0.04, 0.0, L[:, 2]))
    ln = ln * (1 - R['ear']) + R['ear'] * (0.002 + 0.002 * (1 - R['earIn']))
    ln = ln * (1 - R['tail']) + R['tail'] * 0.007
    ln = ln * (1 - R['paw'] * 0.6)
    ln = ln * (1 - R['nose']) * (1 - R['lip']) * (1 - R['claw']) * (1 - R['pad'] * R['paw']) * sstep(B.EYE.r + 0.002, B.EYE.r + 0.005, R['eyeD'])
    return np.clip(ln, 0, FUR['len']).astype(F), np.ones(len(P), F)


def meta(st):
    return B.meta_base(st, iris=0x2E1A0E, babyIris=0x2A2626, babyLid=0x8A6648, flat=0xCB9558, rim=(0.24, 0.14, 0.08), pupilR=0.5)


def baby_paint(P, N, c, col):
    """chihuahua puppies: a little paler fawn"""
    R = B.regions(P, N, c)
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['lip'] + R['claw'] + R['pad'] * R['paw'], 0, 1)
    out = mix(col, col * 0.7 + KC['fawnLt'] * 0.3, 1 - keep)
    return np.clip(out, 0, 1).astype(F)


def hair_texture():
    import smallfur as SF
    wh = [(0.0, (0.3, 0.24, 0.2)), (1.0, (0.55, 0.48, 0.4))]
    return SF.strand_texture((32, 128), [dict(kind='hair', stops=wh, n=6, wid=1.4, end=(0.95, 1.0), wave=0.02, root=1.0)], seed=39)


HAIR = {'size': (32, 128), 'cols': 1, 'base': (0.3, 0.24, 0.2), 'hi': (0.4, 0.34, 0.3), 'tip': (0.55, 0.48, 0.4), 'strands': 6,
        'root': 0.05, 'rough': 0.5, 'alpha': 0.3, 'seed': 39, 'quality': 80}


def cards():
    return B.whiskers(shape, n=4, length=1.2, col=0)


B.export(globals())
