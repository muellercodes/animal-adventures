# A Dalmatian, refitted from the golden retriever (dogkit.py): lean and athletic, longer in the leg and shallower in
# the body, a long arched neck carrying the head high, a long flat skull and a long lean muzzle with close lips,
# thin ears set high and carried close, tapering to a rounded tip, compact round feet, and a long tail strong at the
# root, tapering to the hock with a slight upward curve. The coat is short, fine and sleek: white with round black
# spots, smaller on the head, the legs and the tail, the ears mostly spotted over. Puppies are born nearly white,
# with only a few faint spots coming in.
import numpy as np
from sdf import V, F, nrm, sstep, fbm
import dogkit as K
from carnivore import mirror, mix, hexc
from sdf import _hash
import dog as G

ID = 'dalmatian'
FIT = K.Fit(s=1.0, kL=1.12, kB=0.92, kz=0.96, kw=0.86, kLW=0.86, neck=(0.032, 0.026),
            head=dict(k=0.97, pitch=0.06, kS=1.0, kM=1.06, kSW=0.9, kMW=0.86, kTW=0.84, kDome=0.93, kMD=0.9, kJaw=0.92))


def _ear(f):
    sh = f.sh
    B = f.head_fwd(V(0.062, 0.738, 0.384)[None])[0]
    return K.DropEar(B, (0.16, -1.0, 0.1), (1.0, 0.16, -0.12), 0.1 * sh, 0.042 * sh, sh, w0=0.95, um=0.12, p=1.35, standoff=0.45, cup=0.8, swing=0.7, th=0.85)


TAIL = [(0.0, 0.0, 0.025), (-0.004, -0.032, 0.024), (-0.018, -0.08, 0.021), (-0.042, -0.13, 0.018), (-0.075, -0.175, 0.0155),
        (-0.115, -0.212, 0.013), (-0.16, -0.235, 0.0105), (-0.205, -0.245, 0.0082), (-0.24, -0.24, 0.0062), (-0.262, -0.228, 0.0042)]


def _tail(f):
    root = f.fwd(V(0.0, 0.507, -0.36)[None])[0]
    s = f.s
    return K.Tail([(root[1] + dy * s, root[2] + dz * s, r * s, 0.0) for dy, dz, r in TAIL], bones=(1, 3, 6))


B = K.Breed(ID, FIT, _ear, _tail, eye=dict(k=1.0, d=(0.0, 0.001, 0.0), lid_h=1.05), paw=0.92,
            coat=dict(cell=0.0034, l0=0.004, l1=0.0072, wid=0.0006, seed=95))

KC = {'white': hexc(0xF1EFE8), 'cream': hexc(0xE9E3D6), 'spot': hexc(0x161414), 'spotHi': hexc(0x2C2826), 'nose': hexc(0x141212),
      'pad': hexc(0x2A2523), 'claw': hexc(0xD8D2C6), 'clawDk': hexc(0x3A3532), 'skin': hexc(0xE6C9C0)}


def spots(P, cell, r0, dens, seed, jag=0.25):
    """round spots: one per cell where a cell's hash is under dens, radius r0 * (0.65 .. 1.25), edges a little ragged;
    returns 0..1 (1 inside a spot)"""
    Q = P / cell
    f = np.floor(Q).astype(np.int64)
    best = np.full(len(P), 9.0, F)
    for dz in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                cx, cy, cz = f[:, 0] + dx, f[:, 1] + dy, f[:, 2] + dz
                fx = cx + 0.15 + 0.7 * _hash(cx, cy, cz, seed) - Q[:, 0]
                fy = cy + 0.15 + 0.7 * _hash(cx, cy, cz, seed + 1) - Q[:, 1]
                fz = cz + 0.15 + 0.7 * _hash(cx, cy, cz, seed + 2) - Q[:, 2]
                rr = r0 / cell * (0.65 + 0.6 * _hash(cx, cy, cz, seed + 3))
                on = _hash(cx, cy, cz, seed + 4) < dens
                d = np.sqrt(fx * fx + fy * fy + fz * fz) - rr
                best = np.where(on, np.minimum(best, d), best)
    edge = (fbm(P / (cell * 0.18), 2, seed + 7) - 0.5) * jag
    return sstep(0.04, -0.04, best + edge).astype(F)


def _spots(R, P):
    """the spots: about 2 to 3 cm on the body, smaller on the head, the legs and the tail, the ears mostly black"""
    Pg = R['Pg']
    small = np.clip(np.maximum.reduce([R['head'], sstep(0.32, 0.2, Pg[:, 1]), R['tail'] * sstep(0.1, 0.3, R['tt'])]), 0, 1)
    big = spots(P, 0.05, 0.0145, 0.75, 31)
    sm = spots(P, 0.024, 0.0062, 0.7, 41)
    sp = big * (1 - small) + sm * small
    # the ears: spotted over, a few white patches
    ear = R['ear']
    sp = sp * (1 - ear) + ear * np.maximum(spots(P, 0.016, 0.0085, 0.95, 51), 0.25 * sm)
    # none on the muzzle tip or around the nose, a few small ones on the cheeks
    sp = sp * (1 - 0.7 * R['head'] * sstep(0.2, 0.225, R['L'][:, 2]))
    return np.clip(sp, 0, 1)


def paint(P, N, c):
    R = B.regions(P, N, c)
    Pm = R['Pm']
    n1 = fbm(R['Pg'] * 8, 3, 11)
    n2 = fbm(Pm * 40, 3, 12)
    col = mix(np.tile(KC['white'], (len(P), 1)), KC['cream'], sstep(-0.2, -0.7, N[:, 1]) * 0.6)
    col *= (0.96 + 0.06 * n1)[:, None]
    sp = _spots(R, P)
    col = mix(col, mix(np.tile(KC['spot'], (len(P), 1)), KC['spotHi'], R['top'] * 0.4), sp)
    col = B.bare(col, R, n1, n2, nose=KC['nose'], lip=hexc(0x1C1818), pad=KC['pad'], claw=KC['claw'], clawLt=KC['clawDk'], rim=hexc(0x171313))
    s, tone = B.strands(P, N, R)
    col *= (1 + s * 0.08 * (tone - 0.4) - 0.03 * (1 - s))[:, None]
    col = mix(col, G.K['ball'], R['ball'])
    rough = 0.56 + 0.06 * (n2 - 0.5) - 0.12 * R['nose'] - 0.25 * R['lid'] - 0.1 * R['lip'] - 0.2 * R['claw']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


FUR = {'len': 0.018, 'n': 4, 'lean': 1.7, 'tile': 0.0012, 'babyLen': 1.6, 'babyLean': 0.6, 'shade': 0.75, 'quality': 80}


def fur(P, N, c):
    """short, fine and sleek all over, shortest on the face, the ears and the legs"""
    R = B.regions(P, N, c)
    Pg, L = R['Pg'], R['L']
    y, z = Pg[:, 1], Pg[:, 2]
    ln = np.full(len(P), 0.009, F)
    ln = ln + 0.003 * sstep(0.2, 0.3, z) * sstep(0.62, 0.5, y) * (1 - R['head'])
    ln = ln * (1 - sstep(0.38, 0.25, y) * (1 - R['tail']) * 0.4)
    hd = R['head']
    ln = ln * (1 - hd) + hd * (0.004 + 0.003 * sstep(0.04, 0.0, L[:, 2]))
    ln = ln * (1 - R['ear']) + R['ear'] * 0.004
    ln = ln * (1 - R['tail']) + R['tail'] * 0.009
    ln = ln * (1 - R['paw'] * 0.6)
    ln = ln * (1 - R['nose']) * (1 - R['lip']) * (1 - R['claw']) * (1 - R['pad'] * R['paw']) * sstep(B.EYE.r + 0.003, B.EYE.r + 0.009, R['eyeD'])
    return np.clip(ln, 0, FUR['len']).astype(F), np.ones(len(P), F)


def meta(st):
    return B.meta_base(st, iris=0x4A2A16, babyIris=0x30343C, babyLid=0x3A3434, flat=0xEDEBE4, rim=(0.14, 0.14, 0.16))


def baby_paint(P, N, c, col):
    """puppies are born white: only a few small faint spots coming in (and on the ears), the nose and lids still pinkish
    gray"""
    R = B.regions(P, N, c)
    n1 = fbm(R['Pg'] * 8, 3, 11)
    base = mix(np.tile(KC['white'], (len(P), 1)), KC['cream'], sstep(-0.2, -0.7, N[:, 1]) * 0.6) * (0.97 + 0.05 * n1)[:, None]
    sp = _spots(R, P)
    few = spots(P, 0.07, 0.008, 0.35, 61)
    base = mix(base, hexc(0x8C8682), sp * few * 0.8 + R['ear'] * sp * 0.4)
    keep = np.clip(R['ball'] + R['lid'] + R['claw'] + R['pad'] * R['paw'], 0, 1)
    out = mix(base, col, keep)
    out = mix(out, hexc(0x5E5252), R['nose'] * 0.85)
    s, tone = B.strands(P, N, R)
    out *= (1 + s * 0.08 * (tone - 0.4))[:, None]
    return np.clip(out, 0, 1).astype(F)


def hair_texture():
    import smallfur as SF
    wh = [(0.0, (0.86, 0.85, 0.82)), (1.0, (0.95, 0.94, 0.92))]
    whd = [(0.0, (0.08, 0.07, 0.07)), (1.0, (0.22, 0.2, 0.19))]
    cols = [dict(kind='hair', stops=wh, n=6, wid=1.6, end=(0.95, 1.0), wave=0.02, root=1.0),
            dict(kind='hair', stops=whd, n=6, wid=1.6, end=(0.95, 1.0), wave=0.02, root=1.0)]
    return SF.strand_texture((64, 128), cols, seed=33)


HAIR = {'size': (64, 128), 'cols': 2, 'base': (0.86, 0.85, 0.82), 'hi': (0.9, 0.9, 0.88), 'tip': (0.95, 0.94, 0.92), 'strands': 6,
        'root': 0.05, 'rough': 0.5, 'alpha': 0.3, 'seed': 33, 'quality': 80}


def cards():
    return B.whiskers(shape, n=4, length=1.0, col=1)


B.export(globals())
