# round 17: barn owl (the girl), on the great horned owl's body at 0.64 of its size with longer legs (refit.py: owl.py
# runs in a private copy, C; DROP -0.03 between YA 0.012 and YB 0.13 raises the body over the feet, the same numbers
# as dropBird in the game's SPEC.barnowl). Her own: no ear tufts, a slimmer body and head, and the barn owl's face: a
# flat, dished, heart-shaped facial disc (two round lobes over the eyes, a notch on the forehead, a point at the chin
# under the bill) inside a raised rim of feathers, a ridge down the middle to the bill, small dark eyes set deep in it.
# White face edged in golden buff, a rusty smudge in front of each eye; golden-buff and soft gray upperparts finely
# speckled with white dots tipped black; white to pale buff underneath with a few small dark dots; white feathered
# legs, gray-pink toes, a pale ivory bill. The boy is the same, a little smaller (SEX_LOOK). The owlet: white down.
# Make it with: VOXEL=0.0016 TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py barnowl
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, fbm, vnoise, length
import bird as B
from bird import mirror, groove, hexc, mix
import refit

ID = 'barnowl'
KS = 0.64
DROP, YA, YB = -0.03, 0.012, 0.13
_M = sys.modules[__name__]
C = refit.load('owl', ID + '_base')

# ---------- shape (owl units) ----------
C.tufts = lambda P: np.full(len(P), 1.0, F)
C.EYE_C = V(0.0255, 0.4625, 0.042)
C.EYE_R = 0.0112
C.LID_R = 0.0094
C.EYE_DIR = nrm([0.2, 0.02, 1])
C.EYE_UP = nrm(np.array([0, 1, 0], F) - C.EYE_DIR * C.EYE_DIR[1])
C.EYE_SIDE = np.cross(C.EYE_UP, C.EYE_DIR)
_trunk0 = C.trunk


def heart(x, y):
    """about the signed distance to the heart-shaped facial disc's outline in the face plane (negative inside): two
    round lobes over the eyes with a shallow notch between them on the forehead, narrowing to a point at the chin"""
    X, Y = np.abs(x), y - 0.457
    lobe = np.hypot(X - 0.021, Y - 0.006) - 0.035
    vee = np.maximum(0.70 * X - 0.714 * (Y + 0.054), Y - 0.004)
    return np.minimum(lobe, vee)


def head(P):
    """a round head with the face cut flat into a dished heart inside a raised rim, a ridge down the middle"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    d = ellipsoid(Q, V(0, 0.458, -0.004), V(0.064, 0.058, 0.058))
    d = smin(d, ellipsoid(Q, V(0, 0.44, 0.01), V(0.058, 0.05, 0.048)), 0.015)       # cheeks
    d = smin(d, ellipsoid(Q, V(0, 0.408, -0.006), V(0.068, 0.03, 0.054)), 0.03)     # into the shoulders: no visible neck
    d = smax(d, z - 0.05 - 0.012 * (x / 0.06) ** 2, 0.01)                         # the flat face
    hd = heart(x, y)
    front = sstep(0.0, 0.035, z)
    rim = 0.0055 * np.exp(-((hd - 0.0015) / 0.006) ** 2) * front
    dish = 0.0065 * sstep(-0.003, -0.02, hd) * sstep(0.015, 0.04, z)
    ridge = 0.0045 * sstep(0.009, 0.0, x) * sstep(0.492, 0.47, y) * sstep(0.428, 0.444, y) * sstep(0.025, 0.045, z)
    return d + dish - rim - ridge


def trunk(P):
    """a slimmer body than the great horned owl's"""
    return _trunk0(P * V(1 / 0.9, 1, 1 / 0.95)) * 0.92


_beak0 = C.beak


def beak(P):
    """the owl's bill made smaller and set back into the ridge (mostly hidden in the feathers)"""
    c = V(0, 0.437, 0.054)
    return _beak0(c + (P - c) / 0.78 + V(0, 0, 0.004)) * 0.78


C.head, C.trunk, C.beak = head, trunk, beak


def _discs(Pm, Nm, R):
    """the face (disc), its rim, the dark smudge in front of each eye (brow) and nothing for the bib"""
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    h = heart(x, y)
    front = sstep(0.0, 0.4, Nm[:, 2]) * hd
    disc = sstep(0.001, -0.004, h) * front
    rim = sstep(0.0065, 0.0015, np.abs(h - 0.003)) * front
    brow = sstep(0.012, 0.004, np.hypot(x - 0.012, (y - 0.466) * 1.3)) * front
    return disc, rim, brow, np.zeros(len(Pm), F)


C._discs = _discs

# ---------- plumage (owl units) ----------
K = {
    'gold': hexc(0xC8924A), 'goldHi': hexc(0xD8A862), 'gray': hexc(0xA49E96), 'grayDk': hexc(0x7E7870), 'white': hexc(0xF6F2EA),
    'whiteSh': hexc(0xE0D8CA), 'buff': hexc(0xEED8B4), 'dot': hexc(0x2E241C), 'rim': hexc(0xB07C46), 'rimDk': hexc(0x6A4A2C),
    'smudge': hexc(0x9A6A46), 'bill': hexc(0xDCC8B4), 'billDk': hexc(0xBCA690), 'toe': hexc(0xB8A49C), 'talon': hexc(0x2A2420), 'lid': hexc(0x5A4232),
}


def paint_with(P, N, c, under_k):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    n1 = fbm(Pm * 40, 3, 11)
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    relb = np.abs(pl['b']) / np.maximum(pl['w'], 1e-6)
    # upperparts: golden buff veiled with soft gray on each feather's tip half, a white dot with a black tip near it
    back = sstep(0.55, 0.3, Nm[:, 2] - 0.35 * sstep(0.3, 0.8, Nm[:, 1]) + 0.3 * sstep(0.26, 0.12, y)) * np.clip(R['trunk'] + R['arm'] + R['head'], 0, 1)
    up = mix(np.tile(K['gold'], (n, 1)), K['goldHi'], (fid - 0.4) * 0.5)
    veil = sstep(0.55, 0.15, pl['e'] / np.maximum(0.6 * cfa, 1e-6)) * pl['cov']
    up = mix(up, mix(np.tile(K['gray'], (n, 1)), K['grayDk'], sstep(0.5, 0.8, n1) * 0.4), veil * 0.65 * sstep(0.4, 0.75, fbm(Pm * 50, 2, 21)))
    dot = sstep(0.32, 0.18, np.hypot(pl['a'] / np.maximum(cfa, 1e-6) + 0.35, relb * 1.2)) * pl['cov'] * sstep(0.55, 0.65, vnoise(Pm * 400, 22))
    up = mix(up, K['white'], dot)
    up = mix(up, K['dot'], dot * sstep(0.12, 0.05, np.hypot(pl['a'] / np.maximum(cfa, 1e-6) + 0.27, relb)))
    # underparts: white, a pale buff wash on the breast (more for the girl), a few small dark dots
    lo = mix(np.tile(K['white'], (n, 1)), K['buff'], sstep(0.25, 0.4, y) * sstep(0.46, 0.38, y) * 0.5 * under_k)
    lo = mix(lo, K['whiteSh'], sstep(-0.3, -0.85, Nm[:, 1]) * 0.25)
    sp = sstep(0.18, 0.08, np.hypot(pl['a'] / np.maximum(cfa, 1e-6) + 0.4, relb)) * sstep(0.6, 0.72, vnoise(Pm * 300, 23)) * under_k
    lo = mix(lo, K['dot'], sp * 0.85)
    col = mix(lo, up, back)
    col *= (0.96 + 0.08 * n1)[:, None]
    # the face: white, the rim golden buff with darker flecks, a rusty smudge in front of each eye
    disc, rim, brow, _ = _discs(Pm, Nm, R)
    col = mix(col, K['white'], disc)
    col = mix(col, mix(np.tile(K['rim'], (n, 1)), K['rimDk'], sstep(0.5, 0.8, fbm(Pm * 300, 2, 24)) * 0.6), rim * 0.95)
    col = mix(col, K['smudge'], brow * disc * 0.55)
    # white feathered legs, gray-pink toes, dark talons
    col = mix(col, K['white'], np.clip(R['drum'] + R['tarsus'], 0, 1) * 0.9)
    col = mix(col, K['toe'], R['toes'])
    col = mix(col, K['talon'], R['claws'])
    # the pale bill, half hidden in the bristles of the ridge
    col = mix(col, mix(np.tile(K['bill'], (n, 1)), K['billDk'], sstep(0.44, 0.43, y) * 0.5), R['bill'])
    de = np.linalg.norm(Pm - C.EYE_C, axis=1)
    col = mix(col, K['lid'], R['lids'] * sstep(C.EYE_R + 0.0016, C.EYE_R + 0.0002, de) * 0.9)
    rough = 0.86 + 0.05 * (n1 - 0.5)
    rough = np.where(R['bill'] > 0.5, 0.4, rough)
    rough = np.where(R['claws'] > 0.5, 0.3, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def paint(P, N, c):
    return paint_with(P, N, c, 1.0)


KB = {'down': hexc(0xF4F0E8), 'downSh': hexc(0xDCD6CC), 'face': hexc(0xEEDCD0), 'beak': hexc(0xD8C8B8), 'feet': hexc(0xD8CCC4), 'talon': hexc(0x5A4E46)}


def paint_baby(P, N, c):
    """the owlet: white fluffy down, a pinkish white face, pale feet"""
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    n = len(P)
    dn, tip = B.down(Pm, fl, Nm, 0.0022, 76)
    col = mix(np.tile(KB['down'], (n, 1)), KB['downSh'], sstep(-0.2, -0.8, Nm[:, 1]) * 0.4)
    disc, rim, brow, _ = _discs(Pm, Nm, R)
    col = mix(col, KB['face'], disc * 0.7)
    col = mix(col, KB['feet'], np.clip(R['tarsus'] + R['toes'], 0, 1))
    col *= (0.8 + 0.28 * dn + 0.06 * tip)[:, None]
    col = mix(col, KB['beak'], R['bill'])
    col = mix(col, KB['talon'], R['claws'])
    col = mix(col, KB['downSh'] * 0.6, R['lids'] * 0.7)
    rough = np.where(R['bill'] + R['claws'] > 0.5, 0.45, 0.93)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


C.paint, C.paint_baby = paint, paint_baby
_meta0 = C.meta


def meta(st):
    m = _meta0(st)
    m['eye'].update({'iris': 0x140C08, 'irisR': 0.95, 'pupilR': 0.6, 'rim': 0x080604, 'babyLidCol': 0xC8BEB2})
    m.update({'flat': 0xD8C0A0, 'rim': [0.1, 0.1, 0.09]})
    return m


C.meta = meta
C.stats = lambda P, N, c, col: {'lidCol': 0x6A5040}


# ---------- feather blades (atlas cells: 0 primaries, 1 secondaries, 2 greater coverts, 3 lesser coverts, 4 tertials,
# 5 tail, 6 and 7 coverts) ----------
def cells():
    F_ = B.FeatherCell
    gold, goldHi, gray, wh, dk, sh = hexc(0xC8924A), hexc(0xDCAE6E), hexc(0x9C968E), hexc(0xF4F0E8), hexc(0x4A3C30), hexc(0xB8A890)

    def barred(n, k, inner_white=0.0):
        def fn(s, t, side):
            c = mix(np.tile(gold, (len(s), 1)), goldHi, sstep(0.6, 1.0, np.abs(s)) * 0.3)
            c = mix(c, wh, sstep(-0.1, -0.6, s) * inner_white)
            bar = sstep(0.55, 0.8, np.sin(t * n + np.abs(s) * 1.0) * 0.5 + 0.5) * sstep(0.15, 0.35, t)
            c = mix(c, gray, bar * k)
            return mix(c, gray, sstep(0.8, 1.0, t) * 0.35)
        return fn

    def cov(s, t, side):
        c = mix(np.tile(gold, (len(s), 1)), gray, sstep(0.45, 0.85, t) * 0.55)
        dot = sstep(0.14, 0.06, np.hypot(t - 0.82, np.abs(s) * 0.5))
        c = mix(c, wh, dot)
        return mix(c, dk, sstep(0.06, 0.02, np.hypot(t - 0.86, np.abs(s) * 0.5)))

    return [F_('round', barred(26, 0.6, 0.6), w=0.66, outer=0.6, tip=0.55, shaft=sh),
            F_('round', barred(28, 0.55, 0.5), w=0.76, outer=0.8, tip=0.6, shaft=sh),
            F_('round', cov, w=0.8, outer=0.85, tip=0.9, shaft=sh),
            F_('round', cov, w=0.8, outer=0.9, tip=1.2, shaft=sh),
            F_('round', barred(26, 0.5), w=0.76, outer=0.85, tip=0.7, shaft=sh),
            F_('round', barred(22, 0.65), w=0.7, outer=0.85, tip=0.6, shaft=sh),
            F_('round', cov, w=0.7, outer=0.9, tip=0.9, shaft=sh),
            F_('round', cov, w=0.8, outer=0.9, tip=0.8, shaft=sh)]


def _baby_cells():
    F_ = B.FeatherCell
    w1, w2 = hexc(0xF4F0E8), hexc(0xD8D2C8)

    def dn(s, t, side):
        return mix(np.tile(w1, (len(s), 1)), w2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 8


C.FEATHER_ATLAS = dict(C.FEATHER_ATLAS, cells=cells, baby=_baby_cells)
refit.api(globals(), C, KS, DROP, YA, YB)
