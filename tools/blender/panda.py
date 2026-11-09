# A giant panda (round 11) on the polar bear's file: polarbear.py runs in its own module (as bigcat.py runs cat.py), the
# panda replaces its tables and the parts that differ, all laid out in the polar bear's units, and bigcat.install scales
# the hooks by KP into game meters: about 1.45 m from the nose to the tail, 0.78 m at the shoulder. A round, stocky
# bear: a short thick neck, a big round head with full cheeks (the jaw muscles of a bamboo eater) and a short muzzle,
# round furry ears standing on top, small dark eyes, a level back, thick legs on big plantigrade paws, a short tail.
# The coat is woolly and thick (part of the sculpt, under long fur shells), white with the real pattern in black: the
# ears, the eye patches (ovals tilted down at the outer edge), the nose, the legs, joined by a band over the shoulders.
# Cubs: rounder and fluffier with the same pattern.
import os, types
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, ellipsoid, round_cone, loft, sweep, fbm, worley, axis_steps
import carnivore as CV
from carnivore import local, local_n, mirror, mix, hexc
import bigcat

KP = 0.6
ID = 'panda'
HERE = os.path.dirname(os.path.abspath(__file__))
B = types.ModuleType('polarbear_panda')
B.__dict__['__file__'] = os.path.join(HERE, 'polarbear.py')
exec(compile(open(os.path.join(HERE, 'polarbear.py')).read(), 'polarbear.py', 'exec'), B.__dict__)
B.ID = ID



class HeadFrame(CV.Frame):
    """a head frame with every local length scaled by k (the head's parts are laid out at k = 1)"""
    def __init__(self, o, a, u, k):
        super().__init__(o, a, u)
        self.k = k

    def loc(self, Q):
        return super().loc(Q) / self.k

    def pt(self, s, u, x=0.0):
        return self.o + (self.a * s + self.u * u + V(1, 0, 0) * x) * self.k


# ---------- landmarks (the polar bear's units) ----------
# the head close to the shoulders on a short thick neck, carried a little higher, big (HK) with a short muzzle
HK = 1.15
B.HF = HeadFrame(V(0.0, 1.06, 0.64), V(0.0, -0.16, 1.0), V(0.0, 1.0, 0.0), HK)
B.EYE = CV.Eye(B.HF.pt(0.215, 0.045, 0.082), 0.0145, V(0.42, 0.1, 0.9), lid_w=0.013, lid_h=0.0095, off=0.001, slant=0.12,
               mound=(0.005, 0.0045, 0.002), sink=0.3)
B.NOSE_S = 0.372
B.MOUTH = B.HF.pt(0.33, -0.085)
B.EAR_B = B.HF.pt(0.05, 0.142, 0.128)
B.EAR_A = nrm([0.36, 0.93, -0.06])
_n = nrm([0.45, 0.0, 0.9])
B.EAR_N = nrm(_n - B.EAR_A * np.dot(_n, B.EAR_A))
B.EAR_L, B.EAR_W = 0.105, 0.078
B.PATCHES = [
    (B.EYE.c * V(0, 1, 1) + V(0.03, -0.035, -0.035), B.EYE.c * V(0, 1, 1) + V(0.1, 0.035, 0.035), 0.0018),
    (B.HF.pt(0.3, 0.0) * V(0, 1, 1) + V(0.0, -0.12, -0.02), B.HF.pt(0.4, 0.0) * V(0, 1, 1) + V(0.07, 0.05, 0.02), 0.002),
    (V(0.1, -0.002, 0.36), V(0.42, 0.13, 0.72), 0.003),
    (V(0.1, -0.002, -0.98), V(0.42, 0.13, -0.5), 0.003),
]
# a level back (the polar bear's rump stands higher), round and full
B.TRUNK = [
    (-1.19, 1.08, 1.0, 0.92, 0.072, 2.0, 2.0),
    (-1.13, 1.22, 0.99, 0.76, 0.18, 2.0, 2.0),
    (-1.02, 1.3, 0.98, 0.65, 0.261, 2.1, 2.0),
    (-0.85, 1.33, 0.96, 0.58, 0.306, 2.15, 2.0),
    (-0.62, 1.33, 0.95, 0.55, 0.32, 2.2, 2.0),
    (-0.35, 1.32, 0.94, 0.53, 0.324, 2.2, 2.0),
    (-0.1, 1.31, 0.93, 0.52, 0.324, 2.2, 2.0),
    (0.15, 1.3, 0.93, 0.53, 0.32, 2.2, 2.0),
    (0.35, 1.28, 0.93, 0.56, 0.297, 2.15, 2.0),
    (0.5, 1.23, 0.94, 0.63, 0.252, 2.1, 2.0),
    (0.6, 1.15, 0.95, 0.72, 0.18, 2.0, 2.0),
]
# a short thick neck
B.NECK = [
    (0.99, 0.42, 0.27, 0.31, 0.27, 2.0, 2.0),
    (1.01, 0.52, 0.25, 0.29, 0.25, 2.0, 2.0),
    (1.02, 0.6, 0.22, 0.26, 0.22, 2.0, 2.0),
    (1.02, 0.66, 0.19, 0.22, 0.19, 2.0, 2.0),
]
# a big round head: wide, deep at the back of the jaw, a short muzzle
B.HEAD = [
    (-0.05, 0.1, -0.01, -0.12, 0.12, 2.2, 2.0),
    (0.02, 0.15, -0.02, -0.165, 0.17, 2.3, 2.0),
    (0.09, 0.168, -0.03, -0.182, 0.192, 2.3, 2.1),
    (0.16, 0.158, -0.036, -0.178, 0.186, 2.3, 2.2),
    (0.22, 0.125, -0.044, -0.158, 0.152, 2.2, 2.2),
    (0.27, 0.08, -0.05, -0.132, 0.1, 2.1, 2.2),
    (0.31, 0.058, -0.05, -0.11, 0.084, 2.1, 2.1),
    (0.345, 0.042, -0.05, -0.092, 0.07, 2.0, 2.0),
    (0.37, 0.022, -0.05, -0.072, 0.056, 2.0, 2.0),
]
B.TAIL = [(1.08, -1.12, 0.07), (1.04, -1.18, 0.064), (0.99, -1.23, 0.052), (0.95, -1.255, 0.034), (0.93, -1.265, 0.016)]
B._TP, B._TT = B._tail_poly()
B.BOUNDS = (V(-0.5, 0.0, -1.33), V(0.5, 1.48, 1.15))


def head(P):
    """the round head: the full cheeks (the jaw muscles) out to the sides, a short muzzle with a small black nose pad"""
    Q = mirror(P)
    L = B.HF.loc(Q)
    d = loft(L, B.HEAD)
    d = smin(d, ellipsoid(L, V(0.115, -0.065, 0.115), V(0.095, 0.105, 0.115)), 0.06)                 # cheeks
    d = smin(d, ellipsoid(L, V(0.0, 0.11, 0.1), V(0.12, 0.07, 0.12)), 0.06)                          # crown
    d = smin(d, round_cone(L, V(0.03, 0.06, 0.2), V(0.065, 0.055, 0.215), 0.02, 0.015), 0.03)        # brows
    d = smin(d, ellipsoid(L, V(0.0, -0.104, 0.295), V(0.04, 0.028, 0.055)), 0.03)                    # chin
    d = smin(d, ellipsoid(L, V(0.034, -0.068, 0.318), V(0.03, 0.027, 0.048)), 0.02)                  # upper lips
    ns = B.NOSE_S
    d = smin(d, ellipsoid(L, V(0.0, -0.005, ns + 0.004), V(0.034, 0.022, 0.02)), 0.012)              # nose pad
    for t in np.linspace(0, 1, 5):
        c = V(0.012 + 0.01 * t, -0.002 - 0.01 * t, ns + 0.017 - 0.005 * t)
        d = smax(d, -ellipsoid(L, c, V(0.0038, 0.0038, 0.005)), 0.002)
    M = L * V(1, 2.0, 1)
    # a short mouth line: down from the nose and a little way back along the lips (a long deep cut read as a grin)
    m = round_cone(M, V(0.0, -0.05 * 2.0, ns - 0.008), V(0.026, -0.074 * 2.0, 0.33), 0.0016, 0.0016)
    m = smin(m, round_cone(M, V(0.026, -0.074 * 2.0, 0.33), V(0.044, -0.08 * 2.0, 0.296), 0.0016, 0.0012), 0.003)
    d = smax(d, -(m + 0.0006) / 2.0, 0.002)
    return d * HK - B._locks(Q, 0.006) * sstep(0.24, 0.1, L[:, 2])


def neck(P):
    Q = mirror(P)
    d = sweep(Q, B.NECK)
    d = smin(d, ellipsoid(Q, V(0.0, 0.86, 0.54), V(0.17, 0.13, 0.14)), 0.1)
    return d - B._locks(Q, 0.012)


def trunk(P):
    Q = mirror(P)
    d = loft(Q, B.TRUNK)
    # full shoulders, round heavy hindquarters, the woolly coat hanging under the belly
    d = smin(d, ellipsoid(Q, V(0.0, 1.15, 0.3), V(0.2, 0.09, 0.2)), 0.12)
    d = smin(d, ellipsoid(Q, V(0.16, 1.14, -0.82), V(0.19, 0.18, 0.27)), 0.15)
    d = smin(d, ellipsoid(Q, V(0.0, 0.6, -0.15), V(0.27, 0.08, 0.55)), 0.15)
    return d - B._locks(Q, 0.014)


def ear(P):
    """round, thick and furry, standing on top of the head"""
    Q = mirror(P)
    return CV.ear(Q, B.EAR_B, B.EAR_A, B.EAR_N, B.EAR_L, B.EAR_W, 'round', th0=0.036, th1=0.024, cup=0.35, tipin=0.0,
                  base_r=(0.05, 0.04, 0.038))


def shape(P):
    d = trunk(P)
    d = smin(d, local(P, (-0.5, 0.5, 0.25), (0.5, 1.4, 0.95), neck), 0.12)
    h = local(P, (-0.4, 0.6, 0.45), (0.4, 1.42, 1.14), head)
    ca, li, ba = local_n(P, (-0.15, 0.98, 0.76), (0.15, 1.18, 0.97), B.eye_parts, 3)
    h = smin(h, li, 0.008)
    h = smax(h, -ca, 0.003)
    h = smin(h, ba, 0.002)
    d = smin(d, h, 0.08)
    d = smin(d, local(P, (-0.34, 1.08, 0.53), (0.34, 1.45, 0.82), ear), 0.03)
    d = smin(d, local(P, (-0.5, -0.01, 0.0), (0.5, 1.25, 0.85), B.fleg), 0.08)
    d = smin(d, local(P, (-0.5, -0.01, -1.3), (0.5, 1.45, -0.3), B.hleg), 0.09)
    pw, cl = local_n(P, (-0.48, -0.01, -1.05), (0.48, 0.16, 0.8), B.paws, 2)
    d = smin(d, pw, 0.03)
    d = np.minimum(d, cl)
    d = smin(d, local(P, (-0.15, 0.8, -1.33), (0.15, 1.25, -0.98), B.tail), 0.05)
    return d


def grid(h):
    lo, hi = B.BOUNDS
    return axis_steps(0.0, hi[0], [], h), axis_steps(lo[1], hi[1], [], h), axis_steps(lo[2], hi[2], [], h)


B.head, B.neck, B.trunk, B.ear, B.shape, B.grid = head, neck, trunk, ear, shape, grid
B.PREVIEW = dict(B.PREVIEW, face=((0.9, 1.3, 2.4), (0, 1.0, 0.82), 24), headside=((2.0, 1.1, 0.85), (0, 1.0, 0.82), 20),
                 headfront=((0.0, 1.15, 2.8), (0, 1.0, 0.82), 18))


def keep(P):
    Pm = mirror(P)
    base = np.full(len(P), B.KEEP[0], F)
    e = sstep(0.06, 0.03, np.linalg.norm(Pm - B.EYE.c, axis=1)) * B.KEEP[1]
    L = B.HF.loc(Pm)
    hd = sstep(-0.03, 0.03, L[:, 2]) * sstep(0.7, 0.78, Pm[:, 1]) * B.KEEP[2]
    m = sstep(0.28, 0.34, L[:, 2]) * B.KEEP[3]
    a, c, n = B.ear_coords(Pm)
    er = sstep(-0.01, 0.005, a) * sstep(0.09, 0.065, np.abs(c)) * sstep(0.05, 0.03, np.abs(n)) * B.KEEP[4]
    pw = sstep(0.12, 0.06, Pm[:, 1]) * B.KEEP[5]
    return np.maximum.reduce([base, e, hd, m, er, pw]).astype(F)


B.keep = keep
_bone_tips = B.bone_tips


def bone_tips(P):
    t = _bone_tips(P)
    t['head'] = B.HF.pt(0.38, 0.0)
    return t


B.bone_tips = bone_tips
_regions0 = B._regions


def _regions(P, N, c):
    """the polar bear's regions, with the panda's nose pad and lips"""
    r = _regions0(P, N, c)
    L = r['L']
    ns = B.NOSE_S
    r['nose'] = sstep(0.003, -0.001, ellipsoid(L, V(0.0, -0.005, ns + 0.004), V(0.037, 0.025, 0.023))) * sstep(ns - 0.03, ns - 0.012, L[:, 2])
    lipu = -0.052 - 0.023 * sstep(ns - 0.008, 0.33, L[:, 2]) - 0.006 * sstep(0.33, 0.296, L[:, 2])
    r['lip'] = sstep(0.011, 0.004, np.abs(L[:, 1] - lipu)) * sstep(0.285, 0.31, L[:, 2]) * r['head']
    r['phil'] = sstep(0.005, 0.002, np.abs(L[:, 0])) * sstep(-0.022, -0.03, L[:, 1]) * sstep(-0.052, -0.045, L[:, 1]) * sstep(0.34, 0.36, L[:, 2]) * r['head']
    return r


B._regions = _regions


# ---------- the coat ----------
KD = {
    'white': hexc(0xDCD6C6), 'cream': hexc(0xCFC6B0), 'shade': hexc(0xB9B09A), 'black': hexc(0x1C1916), 'blackHi': hexc(0x34302A),
    'nose': hexc(0x161413), 'pad': hexc(0x221E1C), 'claw': hexc(0x2E2A26), 'earIn': hexc(0x262220),
}


def _black(R, Pm, N):
    """the black of the pattern (0..1): ears, eye patches, legs and the band over the shoulders that joins the front legs"""
    L = R['L']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    hd = R['head']
    w = fbm(Pm * 6.0, 2, 41) - 0.5
    # eye patches: ovals round each eye, the long axis running from up by the brow down and out over the cheek
    El = L - V(0.094, 0.026, 0.0)
    ax = nrm(V(0.55, -0.84, 0.0))
    a1 = El[:, 0] * ax[0] + El[:, 1] * ax[1]
    a2 = -El[:, 0] * ax[1] + El[:, 1] * ax[0]
    patch = sstep(1.08, 0.9, np.hypot(a1 / 0.075, a2 / 0.045)) * sstep(0.12, 0.17, L[:, 2]) * hd
    ears = R['ear'] * 1.0 + sstep(0.03, 0.0, np.linalg.norm(Pm - B.EAR_B, axis=1) - 0.035) * hd
    c = R['c']
    # the legs: black from the paws up, the front legs into the band, the hind legs up over the thighs to the hips
    fleg = sstep(0.03, -0.01, c['fleg'] - c['trunk']) * sstep(0.85, 0.7, y)
    hleg = sstep(0.05, -0.01, c['hleg'] - c['trunk']) * sstep(1.02 + 0.05 * w, 0.92 + 0.05 * w, y)
    # the band over the shoulders: over the withers and down each side to the front legs, under the chest between them
    band_c = 0.24 + 0.4 * sstep(1.3, 0.62, y) + 0.04 * w
    band = sstep(0.2, 0.15, np.abs(z - band_c)) * (1 - hd) * sstep(-0.03, 0.03, c['neck'] - c['trunk'] + 0.02)
    chest = sstep(0.02, 0.12, z) * sstep(0.76, 0.66, y) * (1 - hd)
    tail = R['tail']
    body = np.clip(np.maximum.reduce([band, chest, fleg, hleg]), 0, 1) * (1 - tail) * (1 - hd)
    return np.clip(np.maximum.reduce([patch, ears * (1 - R['earIn'] * 0.2), body]), 0, 1)


def paint(P, N, c):
    R = B._regions(P, N, c)
    R['c'] = c
    Pm = R['Pm']
    n1 = fbm(Pm * 3.0, 3, 11)
    n2 = fbm(Pm * 30, 3, 12)
    col = np.tile(KD['white'], (len(P), 1))
    col = mix(col, KD['shade'], sstep(0.0, -0.75, N[:, 1]) * 0.45)
    col = mix(col, KD['cream'], sstep(0.3, 0.7, n1) * 0.35)
    col *= (0.96 + 0.07 * n1)[:, None]
    blk = _black(R, Pm, N)
    dark = mix(np.tile(KD['black'], (len(P), 1)), KD['blackHi'], R['top'] * 0.5 + 0.3 * n2[:, None][:, 0])
    col = mix(col, dark, blk)
    s, tone = B._strands(P, N, R)
    col = mix(col, KD['shade'] * (1 - blk[:, None] * 0.85), (1 - s) * 0.25 * (1 - R['nose']) * (1 - R['lip']))
    col *= (1 + s * 0.12 * (tone - 0.4))[:, None]
    col = mix(col, KD['earIn'], R['ear'] * R['earIn'] * 0.5)
    col = mix(col, KD['nose'], R['nose'])
    col = mix(col, KD['black'], np.clip(R['lip'] + R['phil'] * 0.8, 0, 1))
    col = mix(col, KD['black'], R['lid'])
    col = mix(col, KD['pad'], R['pad'] * R['paw'])
    col = mix(col, KD['claw'], R['claw'])
    col = mix(col, B.K['ball'], R['ball'])
    rough = 0.76 + 0.06 * (n2 - 0.5) - 0.38 * R['nose'] - 0.3 * R['lid'] - 0.2 * R['lip']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def baby_paint(P, N, c, col):
    """cubs: the same pattern, the white a little whiter and the black a little softer (fluffier)"""
    R = B._regions(P, N, c)
    keep_ = np.clip(R['nose'] + R['ball'] + R['lid'] + R['lip'] + R['phil'] + R['pad'] * R['paw'] + R['claw'], 0, 1)
    lum = col.mean(1)
    out = mix(col, hexc(0xE6E2D6), sstep(0.45, 0.65, lum) * 0.4 * (1 - keep_))
    out = mix(out, hexc(0x2A2622), sstep(0.25, 0.1, lum) * 0.3 * (1 - keep_))
    return np.clip(out, 0, 1).astype(F)


B.paint, B.baby_paint = paint, baby_paint
B.FUR = {'len': 0.085, 'n': 5, 'lean': 1.0, 'tile': 0.0045, 'babyLen': 1.25, 'babyLean': 0.5, 'shade': 0.66, 'quality': 76}
_fur = B.fur


def fur(P, N, c):
    ln, de = _fur(P, N, c)
    return np.clip(ln * 0.82, 0, B.FUR['len']).astype(F), de


B.fur = fur
_meta = B.meta


def meta(st):
    m = _meta(st)
    # small dark eyes in the black patches, the pupils vertical slits (a panda's are)
    m['eye'].update({'iris': 0x2A1C12, 'irisR': 0.92, 'pupil': 'v', 'pupilR': 0.4, 'rim': 0x0A0706, 'lidCol': 0x1A1816, 'babyLidCol': 0x1A1816})
    m.update({'flat': 0xC8C2B4, 'rim': [0.16, 0.15, 0.13]})
    return m


B.meta = meta
B.MAP_QUALITY = (70, 56)
B.BABY_TEX = 256
bigcat.install(globals(), B, KP)
