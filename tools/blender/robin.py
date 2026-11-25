# round 17: American robin (the boy), on the chickadee's bird body 1.85 times as big (refit.py: chickadee.py runs in a
# private copy, C; the shapes and paints here are in the chickadee's units, the game's SPEC.robin uses the same number
# through songBird). His own: a slender pointed bill, a slightly smaller head and a slimmer body. A brick-orange breast
# from the throat to the belly, white low on the belly and under the tail, a dark gray-brown back and wings, a blackish
# head with a broken white eye ring (an arc over the eye and one under it), a white throat streaked black, a yellow bill
# with a dusky tip, dark legs. The fledgling: gray-brown down, its breast pale orange-buff spotted dark, a pale spotted
# back. The girl is robinf.py (paler, her own colors on this mesh).
# Make it with: VOXEL=0.0009 TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py robin
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, fbm, length
import bird as B
from bird import mirror, groove, hexc, mix
import refit

ID = 'robin'
KS = 1.85
_M = sys.modules[__name__]
C = refit.load('chickadee', ID + '_base')

# ---------- shape (chickadee units) ----------
C.MOUTH = V(0.0, 0.0700, 0.0624)
C.GAPE = V(0.0042, 0.0695, 0.0478)
UPPER = ([V(0, 0.0724, 0.0478), V(0, 0.0722, 0.0518), V(0, 0.0716, 0.0556), V(0, 0.0708, 0.059), V(0, 0.07, 0.0618)],
         [0.0021, 0.0017, 0.0012, 0.0007, 0.00025])
LOWER = ([V(0, 0.0694, 0.0482), V(0, 0.0695, 0.0532), V(0, 0.0698, 0.0582)], [0.0016, 0.0011, 0.0004])


def beak(P):
    """a slender, straight, pointed thrush's bill, the upper mandible a little longer and curving down at the tip"""
    Q = mirror(P)
    S = V(1 / 0.85, 1, 1)
    up = chain(Q * S, [p * S for p in UPPER[0]], UPPER[1], 0.0004) * 0.85
    lo = chain(Q * S, [p * S for p in LOWER[0]], LOWER[1], 0.0004) * 0.85
    d = smin(up, lo, 0.0002)
    y, z = Q[:, 1], Q[:, 2]
    d = d + groove(y - 0.0701 + 0.05 * (z - 0.05), 0.0001, 0.00016) * sstep(0.0485, 0.05, z) * sstep(0.0605, 0.059, z)
    return d


_head0, _trunk0 = C.head, C.trunk


def head(P):
    """the chickadee's round head made a little smaller (a thrush's head is smaller for its body)"""
    c = V(0, 0.0735, 0.0395)
    return _head0(c + (P - c) / 0.9) * 0.9


def trunk(P):
    """a slimmer body"""
    return _trunk0(P * V(1 / 0.93, 1, 1)) * 0.93


C.beak, C.head, C.trunk = beak, head, trunk

# ---------- plumage (chickadee units) ----------
K = {
    'back': hexc(0x58504A), 'backHi': hexc(0x6A6158), 'head': hexc(0x22201E), 'headHi': hexc(0x34302C),
    'breast': hexc(0xB24E20), 'breastHi': hexc(0xC86230), 'breastDk': hexc(0x963E18), 'white': hexc(0xF2F0EA), 'whiteSh': hexc(0xD8D4CC),
    'bill': hexc(0xE4AE24), 'billDk': hexc(0x4A3A1E), 'leg': hexc(0x5C504A), 'legHi': hexc(0x786A62), 'claw': hexc(0x2A2420), 'lid': hexc(0x2A2420),
}


def _zones(Pm, Nm, R):
    """the plumage's areas: the dark head and nape, the orange breast, the white belly and undertail, the white throat"""
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    nz = 0.0008 * (fbm(Pm * 900, 2, 51) - 0.5)
    hd = np.clip(R['head'] + R['lids'] + R['neck'] + R['trunk'], 0, 1)
    # the head: above a line from the chin back under the eye and down the nape
    yh = np.interp(z, [0.015, 0.025, 0.035, 0.045, 0.06], [0.064, 0.0655, 0.067, 0.0685, 0.0675]).astype(F)
    head = sstep(yh - 0.001, yh + 0.0006, y + nz) * hd
    # the breast: the front and the underside, from the throat back to the belly
    front = sstep(0.25, -0.35, Nm[:, 1] - 0.5 * Nm[:, 2])
    breast = front * sstep(-0.014, -0.002, z + nz) * np.clip(R['trunk'] + R['neck'] + R['drum'] * 0.7, 0, 1)
    # white low on the belly between the legs and under the tail
    belly = sstep(-0.6, -0.92, Nm[:, 1]) * sstep(0.012, -0.004, z) + sstep(-0.022, -0.034, z) * sstep(0.1, -0.5, Nm[:, 1])
    # the white throat with black streaks
    thr = sstep(0.0052, 0.0032, x + nz) * sstep(0.072, 0.066, y) * sstep(0.03, 0.04, z) * sstep(-0.2, 0.3, Nm[:, 2] - 0.4 * Nm[:, 1]) * hd
    streak = sstep(0.35, 0.75, np.sin(x / 0.00055 + 2.0 * fbm(Pm * 600, 2, 53)) * 0.5 + 0.5) * 0.7
    return head, breast, np.clip(belly, 0, 1), thr, streak


def _eyering(Pm):
    """the broken white eye ring: an arc over the eye and one under it, open in front and behind"""
    D = Pm - C.EYE_C
    s, u, g = D @ C.EYE_SIDE, D @ C.EYE_UP, D @ C.EYE_DIR
    r = np.sqrt(s * s + u * u)
    ring = sstep(C.EYE_R + 0.0014, C.EYE_R + 0.0008, r) * sstep(C.EYE_R + 0.0001, C.EYE_R + 0.0006, r)
    return ring * sstep(0.35, 0.7, np.abs(u) / np.maximum(r, 1e-6)) * sstep(-0.002, 0.0005, g)


def paint_with(P, N, c, KK, head_k=1.0, ring_k=1.0):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    n1 = fbm(Pm * 300, 3, 11)
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    mid = sstep(0.0008, 0.003, np.abs(x))
    col = mix(np.tile(KK['back'], (n, 1)), KK['backHi'], (fid - 0.5) * 0.3)
    head, breast, belly, thr, streak = _zones(Pm, Nm, R)
    col = mix(col, mix(np.tile(KK['head'], (n, 1)), KK['headHi'], sstep(0.3, 0.9, Nm[:, 1]) * 0.3), head * head_k)
    bcol = mix(np.tile(KK['breast'], (n, 1)), KK['breastHi'], (fid - 0.4) * 0.45 + sstep(-0.3, -0.8, Nm[:, 1]) * 0.2)
    bcol = mix(bcol, KK['breastDk'], sstep(0.3, 0.7, np.abs(Nm[:, 0])) * 0.25)
    col = mix(col, bcol, breast * (1 - head))
    col = mix(col, mix(np.tile(KK['white'], (n, 1)), KK['whiteSh'], np.full(n, 0.3, F)), belly * 0.95)
    col = mix(col, mix(np.tile(KK['white'], (n, 1)), KK['head'], streak * 0.85), thr)
    # each feather a little darker toward its base where the next one covers it (not on the midline)
    col = mix(col, col * 0.84, sstep(0.45 * cfa, 1.3 * cfa, -pl['a']) * 0.5 * pl['cov'] * mid)
    col *= (0.95 + 0.1 * n1)[:, None]
    ring = _eyering(Pm) * np.clip(R['head'] + R['lids'], 0, 1) * ring_k
    col = mix(col, KK['white'], ring)
    # the yellow bill, dusky toward the tip of the upper mandible
    bl = R['bill']
    bcl = mix(np.tile(KK['bill'], (n, 1)), KK['billDk'], sstep(0.056, 0.0615, z) * sstep(0.0698, 0.0712, y) * 0.75)
    col = mix(col, bcl, bl)
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    col = mix(col, mix(np.tile(KK['leg'], (n, 1)), KK['legHi'], sstep(0.4, 0.9, fbm(Pm * 2400, 2, 34)) * 0.4), lg)
    col = mix(col, KK['claw'], R['claws'])
    col = mix(col, KK['lid'], R['lids'] * 0.9 * (1 - ring))
    rough = 0.7 + 0.06 * (n1 - 0.5) - 0.06 * sstep(0.1, 0.8, Nm[:, 1]) * feath
    rough = np.where(bl > 0.5, 0.36, rough)
    rough = np.where(lg > 0.5, 0.5, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def paint(P, N, c):
    return paint_with(P, N, c, K)


# the fledgling: gray-brown down, a pale orange-buff breast with dark spots, pale spots on the back, the yellow gape
KB = {'down': hexc(0x6E665E), 'downLt': hexc(0x8A8178), 'breast': hexc(0xD8A274), 'spot': hexc(0x3A322C), 'pale': hexc(0xC8BCA8),
      'bill': hexc(0x4A3E30), 'gape': hexc(0xF2D040), 'leg': hexc(0x8A7E74), 'lid': hexc(0x3A322C)}


def paint_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    n = len(P)
    dn, tip = B.down(Pm, fl, Nm, 0.0007, 82)
    head, breast, belly, thr, streak = _zones(Pm, Nm, R)
    col = mix(np.tile(KB['down'], (n, 1)), KB['downLt'], sstep(-0.2, -0.8, Nm[:, 1]) * 0.4)
    spots = sstep(0.62, 0.72, fbm(Pm * 700, 2, 61))
    col = mix(col, KB['breast'], np.clip(breast + belly * 0.6, 0, 1) * (1 - head))
    col = mix(col, KB['spot'], spots * np.clip(breast + belly * 0.5, 0, 1) * 0.8)
    col = mix(col, KB['pale'], spots * (1 - np.clip(breast + belly, 0, 1)) * np.clip(R['trunk'] + R['arm'], 0, 1) * 0.45)
    col *= (0.84 + 0.26 * dn)[:, None]
    gape = sstep(0.0028, 0.0014, np.linalg.norm((Pm - C.GAPE) * V(0.8, 1.3, 1.0), axis=1))
    col = mix(col, KB['bill'], R['bill'])
    col = mix(col, KB['gape'], np.clip(gape * (R['bill'] + R['head']), 0, 1))
    lg = np.clip(R['tarsus'] + R['toes'] + R['claws'], 0, 1)
    col = mix(col, KB['leg'], lg)
    col = mix(col, KB['lid'], R['lids'] * 0.8)
    rough = np.where(R['bill'] + lg > 0.5, 0.5, 0.92)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


C.paint, C.paint_baby = paint, paint_baby
_meta0 = C.meta


def meta(st):
    m = _meta0(st)
    m['eye'].update({'iris': 0x1E140C, 'rim': 0x0E0A08})
    m['flat'] = 0x6A4A38
    return m


C.meta = meta
C.stats = lambda P, N, c, col: {'lidCol': 0x2A2420}


# ---------- feather blades (atlas cells: 0 primaries, 1 secondaries, 2 greater coverts, 3 lesser coverts, 4 tertials,
# 5 tail, 6 and 7 coverts) ----------
def cells(pal):
    F_ = B.FeatherCell
    a, b, d, e, tl, sh = pal

    def prim(s, t, side):
        c = mix(np.tile(a, (len(s), 1)), d, sstep(0.1, -0.5, s) * 0.5)
        c = mix(c, e, sstep(0.5, 0.85, s) * 0.35)
        return mix(c, d, sstep(0.75, 1.0, t) * 0.3)

    def sec(s, t, side):
        c = mix(np.tile(a, (len(s), 1)), d, sstep(0.0, -0.6, s) * 0.45)
        return mix(c, e, sstep(0.5, 0.85, s) * 0.35)

    def cov(s, t, side):
        return mix(np.tile(b, (len(s), 1)), e, sstep(0.55, 1.0, np.abs(s)) * 0.35)

    def tail(s, t, side):
        # blackish brown, white tips on the inner webs
        c = mix(np.tile(tl, (len(s), 1)), d, sstep(0.0, -0.6, s) * 0.3)
        return mix(c, hexc(0xEEECE6), sstep(0.86, 0.95, t) * sstep(0.0, -0.5, s) * 0.8)

    return [F_('flight', prim, w=0.6, outer=0.55, tip=0.38, shaft=sh),
            F_('round', sec, w=0.72, outer=0.85, tip=0.5, shaft=sh),
            F_('round', cov, w=0.8, outer=0.9, tip=0.8, shaft=sh),
            F_('round', cov, w=0.8, outer=0.9, tip=1.1, shaft=sh),
            F_('round', sec, w=0.76, outer=0.85, tip=0.7, shaft=sh),
            F_('round', tail, w=0.62, outer=0.85, tip=0.6, shaft=sh),
            F_('round', cov, w=0.78, outer=0.9, tip=0.9, shaft=sh),
            F_('round', cov, w=0.8, outer=0.9, tip=0.8, shaft=sh)]


def _cells():
    # dark gray-brown flight feathers with paler edges, the coverts like the back, a blackish tail
    return cells((hexc(0x4A433C), hexc(0x5A524A), hexc(0x302A26), hexc(0x7A7068), hexc(0x2A2622), hexc(0x24201C)))


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = hexc(0x766E64), hexc(0x5A524A)

    def dn(s, t, side):
        return mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 8


C.FEATHER_ATLAS = dict(C.FEATHER_ATLAS, cells=_cells, baby=_baby_cells)
C.PREVIEW = dict(C.PREVIEW)
refit.api(globals(), C, KS)
