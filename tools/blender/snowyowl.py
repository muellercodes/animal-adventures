# round 16: snowy owl (the girl), on the great horned owl's body at 1.12 of its size (refit.py: owl.py runs in a
# private copy, C; the shapes and paints here are in the owl's units, the game's SPEC.snowyowl uses the same k). Her
# own: no ear tufts (a smooth round head), a softer facial disc. White, heavily barred with dark brown on the crown, the
# back, the wings, the flanks and the breast; the face, the throat and the thickly feathered legs and feet white;
# lemon-yellow eyes; a black bill nearly hidden in the bristles of the face. The boy is snowyowlm.py (nearly pure
# white with a few small dark spots, on this mesh). The owlet: sooty gray down with a white face.
# Make it with: VOXEL=0.0028 TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py snowyowl
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, fbm, length
import bird as B
from bird import mirror, groove, hexc, mix
import refit

ID = 'snowyowl'
KS = 1.12
_M = sys.modules[__name__]
C = refit.load('owl', ID + '_base')

# ---------- shape (owl units) ----------
C.tufts = lambda P: np.full(len(P), 1.0, F)
_head0 = C.head


def head(P):
    """the owl's head, rounder on top where the ear tufts were, the facial disc's rim softer"""
    d = _head0(P)
    Q = mirror(P)
    crown = ellipsoid(Q, V(0, 0.468, -0.006), V(0.066, 0.052, 0.054))
    return smin(d, crown, 0.02)


C.head = head

# ---------- plumage (owl units) ----------
K = {
    'white': hexc(0xF4F2EC), 'whiteSh': hexc(0xDCDAD2), 'cream': hexc(0xEEEADC), 'bar': hexc(0x4A3C30), 'barLt': hexc(0x7A6A5A),
    'beak': hexc(0x1A1816), 'bristle': hexc(0xE8E6DE), 'talon': hexc(0x141210), 'lid': hexc(0x2A2420),
}


def _base(Pm, Nm, R, pl, n):
    fid = pl['id']
    col = mix(np.tile(K['white'], (n, 1)), K['cream'], (fid - 0.5) * 0.4)
    return mix(col, K['whiteSh'], sstep(-0.3, -0.9, Nm[:, 1]) * 0.35)


def _marks(Pm, Nm, R, pl, k_back, k_front, sparse=0.0):
    """dark marks: broken bars across the back, the wings and the flanks, wavy bars across the breast, small spots on
    the crown; none on the face, the throat, the middle of the upper breast, the legs and the feet. sparse > 0: only a
    few of them (the boy's), as small spots"""
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    back = sstep(-0.1, 0.3, Nm[:, 1] - 0.5 * Nm[:, 2]) * np.clip(R['trunk'] + R['arm'], 0, 1)
    wav = 0.004 * (fbm(Pm * V(25, 6, 25), 2, 15) - 0.5) + 0.0015 * np.sin(x * 220 + pl['id'] * 5)
    brk = fbm(Pm * V(60, 120, 60), 2, 16)
    fbars = sstep(0.6, 0.88, np.sin((y + wav) / 0.0042) * 0.5 + 0.5) * sstep(0.3, 0.6, brk)
    bbars = sstep(0.55, 0.85, np.sin((y + 0.3 * z + wav) / 0.0034) * 0.5 + 0.5) * sstep(0.35, 0.55, brk)
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    spots = sstep(0.62, 0.72, fbm(Pm * 260, 2, 17)) * hd * sstep(0.1, 0.5, Nm[:, 1] - 0.3 * Nm[:, 2])
    front = (1 - back) * np.clip(R['trunk'] + R['arm'], 0, 1)
    clear = np.clip(sstep(0.0, 0.5, Nm[:, 2]) * hd + sstep(0.04, 0.015, x) * sstep(0.3, 0.37, y) * sstep(0.1, 0.4, Nm[:, 2]), 0, 1)
    if sparse:
        few = sstep(0.68, 0.74, fbm(Pm * 150, 2, 18))
        m = few * (back * k_back + spots * 0.6) + fbars * front * k_front
    else:
        m = bbars * back * k_back + fbars * front * k_front + spots * 0.8
    return np.clip(m, 0, 1) * (1 - clear) * (1 - np.clip(R['drum'] + R['tarsus'] + R['toes'], 0, 1) * 0.9)


def _bare(col, Pm, Nm, R, n):
    y, z = Pm[:, 1], Pm[:, 2]
    bristle = sstep(0.4365, 0.4415, y) * sstep(0.0705, 0.062, z)
    col = mix(col, K['beak'], R['bill'] * (1 - bristle * 0.9))
    col = mix(col, K['bristle'], R['bill'] * bristle * 0.9)
    col = mix(col, K['talon'], R['claws'])
    de = np.linalg.norm(Pm - C.EYE_C, axis=1)
    col = mix(col, K['whiteSh'], R['lids'] * 0.6)
    col = mix(col, K['lid'], R['lids'] * sstep(C.EYE_R + 0.0012, C.EYE_R + 0.0002, de) * 0.9)
    return col


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    n = len(P)
    n1 = fbm(Pm * 40, 3, 11)
    col = _base(Pm, Nm, R, pl, n)
    m = _marks(Pm, Nm, R, pl, 0.85, 0.75)
    col = mix(col, mix(np.tile(K['bar'], (n, 1)), K['barLt'], (pl['id'] - 0.3) * 0.5), m)
    col *= (0.96 + 0.08 * n1)[:, None]
    col = _bare(col, Pm, Nm, R, n)
    rough = 0.88 + 0.05 * (n1 - 0.5)
    rough = np.where(R['bill'] > 0.5, 0.38, rough)
    rough = np.where(R['claws'] > 0.5, 0.3, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


KB = {'down': hexc(0x5E5A56), 'downLt': hexc(0x7A7672), 'face': hexc(0xE8E6E0), 'beak': hexc(0x2A2826), 'talon': hexc(0x3A3632), 'feet': hexc(0xCCC8C0)}


def paint_baby(P, N, c):
    """the owlet: sooty gray down, a white face and pale downy feet"""
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    n = len(P)
    dn, tip = B.down(Pm, fl, Nm, 0.0022, 76)
    col = mix(np.tile(KB['down'], (n, 1)), KB['downLt'], sstep(-0.2, -0.8, Nm[:, 1]) * 0.5)
    disc, rim, brow, bib = C._discs(Pm, Nm, R)
    col = mix(col, KB['face'], np.clip(disc * 1.2 + brow + bib, 0, 1))
    col = mix(col, KB['feet'], np.clip(R['tarsus'] + R['toes'], 0, 1))
    col *= (0.78 + 0.32 * dn + 0.06 * tip)[:, None]
    col = mix(col, KB['beak'], R['bill'])
    col = mix(col, KB['talon'], R['claws'])
    col = mix(col, KB['down'] * 0.7, R['lids'] * 0.7)
    rough = np.where(R['bill'] + R['claws'] > 0.5, 0.45, 0.93)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


C.paint, C.paint_baby = paint, paint_baby
_meta0 = C.meta


def meta(st):
    m = _meta0(st)
    m['eye'].update({'iris': 0xF4D020, 'rim': 0x1A1408, 'babyLidCol': 0x4A4644})
    m.update({'flat': 0xE4E0D8, 'rim': [0.1, 0.1, 0.1]})
    return m


C.meta = meta
C.stats = lambda P, N, c, col: {'lidCol': 0xCFCBC2}


# ---------- feather blades (atlas cells: 0 primaries, 1 secondaries, 2 greater coverts, 3 lesser coverts, 4 tertials,
# 5 tail, 6 and 7 coverts) ----------
def cells(k, spots=False):
    """white feathers with dark bars (k: how dark; spots: a few small spots near the tip instead of bars)"""
    F_ = B.FeatherCell
    wh, whS, dk, sh = hexc(0xF4F2EC), hexc(0xDCD8CE), hexc(0x4A3C30), hexc(0xC8C2B6)

    def barred(n, k2):
        def fn(s, t, side):
            c = mix(np.tile(wh, (len(s), 1)), whS, sstep(0.6, 1.0, np.abs(s)) * 0.3)
            if spots:
                sp = sstep(0.55, 0.3, np.hypot((t - 0.78) * 6, np.abs(s) * 1.6 - 0.45)) * k2
                return mix(c, dk, sp)
            bar = sstep(0.5, 0.78, np.sin(t * n + np.abs(s) * 1.2) * 0.5 + 0.5) * sstep(0.1, 0.3, t)
            return mix(c, dk, bar * k2)
        return fn

    def chevron(s, t, side):
        c = mix(np.tile(wh, (len(s), 1)), whS, sstep(0.6, 1.0, np.abs(s)) * 0.3)
        mk = sstep(0.6, 0.3, np.abs(t - 0.62 + 0.25 * np.abs(s))) * (sstep(0.0, 0.2, 1 - np.abs(s)))
        return mix(c, dk, mk * k * (0.25 if spots else 0.8))

    return [F_('round', barred(30, k * 0.9), w=0.66, outer=0.6, tip=0.55, shaft=sh),
            F_('round', barred(32, k * 0.8), w=0.76, outer=0.8, tip=0.6, shaft=sh),
            F_('round', chevron, w=0.8, outer=0.85, tip=0.9, shaft=sh),
            F_('round', chevron, w=0.8, outer=0.9, tip=1.2, shaft=sh),
            F_('round', barred(30, k * 0.8), w=0.76, outer=0.85, tip=0.7, shaft=sh),
            F_('round', barred(26, k * 0.85), w=0.7, outer=0.85, tip=0.6, shaft=sh),
            F_('round', chevron, w=0.7, outer=0.9, tip=0.9, shaft=sh),
            F_('round', chevron, w=0.8, outer=0.9, tip=0.8, shaft=sh)]


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = hexc(0x6A6662), hexc(0x4E4A46)

    def dn(s, t, side):
        return mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 8


C.FEATHER_ATLAS = dict(C.FEATHER_ATLAS, cells=lambda: cells(0.9), baby=_baby_cells)
refit.api(globals(), C, KS)
