# round 16: blue jay, on the chickadee's bird body twice as big (refit.py: chickadee.py runs in a private copy, C; the
# shapes and paints here are in the chickadee's units, the game's SPEC.bluejay uses the same numbers through songBird).
# His own: a straight stout black bill, a crest on the crown (the game's crest blades stand on it), a big eye. Lavender
# blue crown, crest, nape and back; a white face, throat and underparts going gray on the flanks; a black necklace
# from the back of the crown down behind the cheeks and across the upper breast; a thin black line from the bill to the
# eye and black bristles at the base of the bill; black legs. Feather atlas: bright blue wings and tail barred with
# black, white tips on the secondaries, greater coverts and tertials (the white wing bars) and on the outer tail
# feathers (the white corners). Boys and girls look alike. The chick: gray down, a dark bill, the yellow gape.
# Make it with: VOXEL=0.001 TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py bluejay
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, fbm, length
import bird as B
from bird import mirror, groove, hexc, mix
import refit

ID = 'bluejay'
KS = 2.0
_M = sys.modules[__name__]
C = refit.load('chickadee', ID + '_base')

# ---------- shape (chickadee units) ----------
C.EYE_R = 0.0024
C.LID_R = 0.0019
C.MOUTH = V(0.0, 0.0699, 0.0598)
C.GAPE = V(0.0038, 0.0696, 0.0465)
UPPER = ([V(0, 0.0718, 0.0452), V(0, 0.0717, 0.05), V(0, 0.0713, 0.054), V(0, 0.0706, 0.0578), V(0, 0.0699, 0.0603), V(0, 0.0693, 0.0612)],
         [0.0034, 0.0029, 0.0022, 0.0013, 0.0006, 0.0002])
LOWER = ([V(0, 0.0692, 0.0458), V(0, 0.0693, 0.052), V(0, 0.0696, 0.0572)], [0.0027, 0.0019, 0.0007])


def beak(P):
    """a straight, stout, pointed bill, the upper mandible a little longer and curving down at its tip"""
    Q = mirror(P)
    S = V(1 / 0.88, 1, 1)
    up = chain(Q * S, [p * S for p in UPPER[0]], UPPER[1], 0.0005) * 0.88
    lo = chain(Q * S, [p * S for p in LOWER[0]], LOWER[1], 0.0005) * 0.88
    d = smin(up, lo, 0.0003)
    y, z = Q[:, 1], Q[:, 2]
    d = d + groove(y - 0.0698 + 0.02 * (z - 0.047), 0.00012, 0.00018) * sstep(0.0462, 0.048, z) * sstep(0.059, 0.0575, z)
    return d


_head0 = C.head


def head(P):
    """the chickadee's round head with a crest rising from the crown and swept back"""
    d = _head0(P)
    Q = mirror(P)
    cr = chain(Q, [V(0, 0.0835, 0.04), V(0, 0.087, 0.032), V(0, 0.0902, 0.0245), V(0, 0.0915, 0.0195)], [0.0068, 0.0056, 0.0035, 0.0015], 0.002)
    return smin(d, cr, 0.004)


C.beak, C.head = beak, head
C.HEAD_BOX = (V(-0.018, 0.058, 0.014), V(0.018, 0.095, 0.066))
C.BOUNDS = (V(-0.085, -0.0005, -0.048), V(0.085, 0.096, 0.066))

# ---------- plumage (chickadee units) ----------
K = {
    'blue': hexc(0x4560A0), 'blueHi': hexc(0x526EAE), 'blueDk': hexc(0x384E84), 'crown': hexc(0x3E62B4),
    'white': hexc(0xF0F0EE), 'whiteSh': hexc(0xDCDDDC), 'gray': hexc(0xC4C6CA), 'black': hexc(0x111113), 'blackHi': hexc(0x26262A),
    'bill': hexc(0x18181A), 'leg': hexc(0x1E1E22), 'legHi': hexc(0x34343A), 'claw': hexc(0x101012), 'lid': hexc(0x1A1A1C),
}


def _plane(Pm):
    """signed distance from the tilted plane of the necklace (positive in front of it)"""
    y, z = Pm[:, 1], Pm[:, 2]
    return 0.55 * (y - 0.0585) + 0.835 * (z - 0.0405)


def necklace(Pm, Nm, R):
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    s = _plane(Pm) + 0.0005 * (fbm(Pm * 900, 2, 61) - 0.5)
    band = sstep(0.003, 0.0021, np.abs(s + 0.0006))
    # not over the nape (the blue meets across the back of the neck)
    band *= sstep(0.55, 0.25, Nm[:, 1] - 0.6 * Nm[:, 2]) * sstep(0.0, 0.003, x + 0.006 * sstep(0.5, -0.5, Nm[:, 2]))
    band *= sstep(0.0795, 0.0775, y)
    return band * np.clip(R['head'] + R['neck'] + R['trunk'] + R['lids'], 0, 1)


def _colors(Pm, Nm, R, pl, n):
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    front = sstep(-0.0004, 0.0004, _plane(Pm))
    # behind the necklace: blue above, white below with gray flanks
    up = sstep(-0.15, 0.25, Nm[:, 1] + 0.25 * sstep(0.03, -0.01, z))
    col = mix(np.tile(K['white'], (n, 1)), K['gray'], sstep(0.4, 0.9, np.abs(Nm[:, 0])) * sstep(0.2, -0.3, Nm[:, 1]) * 0.8)
    col = mix(col, mix(np.tile(K['blue'], (n, 1)), K['blueHi'], (fid - 0.5) * 0.4), up * (1 - front))
    # in front of it: the white face, blue on the crown and the crest down to just over the eye
    yc = np.interp(z, [0.02, 0.03, 0.04, 0.046, 0.05], [0.074, 0.0775, 0.078, 0.0768, 0.0745]).astype(F)
    crown = sstep(yc - 0.0006, yc + 0.0006, y + 0.0004 * (fbm(Pm * 900, 2, 62) - 0.5))
    face = mix(np.tile(K['white'], (n, 1)), K['whiteSh'], sstep(0.3, -0.4, Nm[:, 1]) * 0.4)
    col = mix(col, face, front * (1 - crown))
    col = mix(col, mix(np.tile(K['crown'], (n, 1)), K['blueHi'], (fid - 0.5) * 0.4), np.maximum(crown, up * sstep(0.0795, 0.083, y)) * np.clip(R['head'] + R['neck'] + R['lids'], 0, 1))
    mid = sstep(0.0008, 0.003, np.abs(x))
    col = mix(col, col * 0.84, sstep(0.45 * cfa, 1.3 * cfa, -pl['a']) * 0.45 * pl['cov'] * mid)
    return col


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    n1 = fbm(Pm * 300, 3, 11)
    col = _colors(Pm, Nm, R, pl, n)
    col *= (0.95 + 0.1 * n1)[:, None]
    blk = mix(np.tile(K['black'], (n, 1)), K['blackHi'], sstep(0.4, 0.9, Nm[:, 1]) * 0.25)
    col = mix(col, blk, necklace(Pm, Nm, R))
    # the thin black line from the bill to the eye, and the black bristles at the base of the bill
    ec = C.EYE_C
    t = np.clip((ec[0] - x) / (ec[0] - 0.0035), 0, 1)
    ly = ec[1] - 0.0004 + t * (0.0716 - ec[1])
    lore = sstep(0.0009, 0.0004, np.abs(y - ly)) * sstep(ec[0] + 0.0008, ec[0] - 0.0004, x) * sstep(0.0425, 0.0445, z)
    brist = sstep(0.0485, 0.0462, z) * sstep(0.0435, 0.0448, z) * sstep(0.07, 0.0716, y) * sstep(0.0754, 0.0744, y) * sstep(0.0052, 0.0038, x)
    col = mix(col, blk, np.clip(lore + brist, 0, 1) * np.clip(R['head'] + R['lids'], 0, 1))
    bl = R['bill']
    col = mix(col, K['bill'], bl)
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    col = mix(col, mix(np.tile(K['leg'], (n, 1)), K['legHi'], sstep(0.4, 0.9, fbm(Pm * 2400, 2, 34)) * 0.4), lg)
    col = mix(col, K['claw'], R['claws'])
    col = mix(col, K['lid'], R['lids'] * 0.9)
    rough = 0.68 + 0.06 * (n1 - 0.5) - 0.06 * sstep(0.1, 0.8, Nm[:, 1]) * feath
    rough = np.where(bl > 0.5, 0.32, rough)
    rough = np.where(lg > 0.5, 0.45, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


# the chick: gray down, darker above, a dark bill with the yellow gape
KB = {'down': hexc(0x7A7E8A), 'downLt': hexc(0x9EA2AA), 'bill': hexc(0x3A3436), 'gape': hexc(0xF2D040), 'leg': hexc(0x7A7A82), 'lid': hexc(0x3A3A40)}


def paint_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    n = len(P)
    dn, tip = B.down(Pm, fl, Nm, 0.0007, 82)
    col = mix(np.tile(KB['down'], (n, 1)), KB['downLt'], sstep(-0.2, -0.8, Nm[:, 1]) * 0.7)
    col = mix(col, K['blueDk'], sstep(0.4, 0.9, Nm[:, 1]) * 0.3)
    col *= (0.84 + 0.26 * dn)[:, None]
    gape = sstep(0.003, 0.0014, np.linalg.norm((Pm - C.GAPE) * V(0.8, 1.3, 1.0), axis=1))
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
    m['eye'].update({'iris': 0x1A120E, 'rim': 0x0E0A08})
    m['flat'] = 0x7A90BC
    return m


C.meta = meta
C.stats = lambda P, N, c, col: {'lidCol': 0x1A1A1C}


# ---------- feather blades (atlas cells: 0 primaries, 1 secondaries, 2 greater coverts, 3 lesser coverts, 4 tertials,
# 5 tail, 6 crest, 7 outer tail feathers) ----------
def _cells():
    F_ = B.FeatherCell
    bl, blH, blD, dk, wh, sh = hexc(0x2E5CC0), hexc(0x3E72D2), hexc(0x233E80), hexc(0x16161C), hexc(0xF4F4F2), hexc(0x1E2030)

    def bars(t, n, w=0.18):
        f = (t * n) % 1.0
        return sstep(0.5 - w, 0.5 - w + 0.06, f) * sstep(0.5 + w, 0.5 + w - 0.06, f)

    def prim(s, t, side):
        c = mix(np.tile(bl, (len(s), 1)), dk, sstep(0.0, -0.4, s) * 0.85)
        c = mix(c, dk, bars(t, 9, 0.1) * sstep(0.05, 0.3, s) * 0.6)
        return mix(c, dk, sstep(0.82, 1.0, t) * 0.5)

    def sec(s, t, side):
        c = mix(np.tile(blH, (len(s), 1)), blD, sstep(0.0, -0.6, s) * 0.5)
        c = mix(c, dk, bars(t, 6, 0.16) * sstep(0.88, 0.8, t))
        return mix(c, wh, sstep(0.8, 0.86, t))

    def cov(s, t, side):
        return mix(np.tile(bl, (len(s), 1)), blD, sstep(0.55, 1.0, np.abs(s)) * 0.3)

    def gcov(s, t, side):
        c = mix(np.tile(blH, (len(s), 1)), blD, sstep(0.0, -0.6, s) * 0.4)
        c = mix(c, dk, bars(t, 4, 0.16) * sstep(0.85, 0.75, t))
        return mix(c, wh, sstep(0.8, 0.88, t))

    def tail(s, t, side):
        c = mix(np.tile(bl, (len(s), 1)), blD, sstep(0.0, -0.7, s) * 0.35)
        return mix(c, dk, bars(t, 9, 0.12) * 0.85)

    def touter(s, t, side):
        return mix(tail(s, t, side), wh, sstep(0.74, 0.8, t))

    def crest(s, t, side):
        return mix(np.tile(hexc(0x3E62B4), (len(s), 1)), blD, sstep(0.6, 1.0, np.abs(s)) * 0.3)

    return [F_('flight', prim, w=0.58, outer=0.55, tip=0.35, shaft=sh),
            F_('round', sec, w=0.72, outer=0.85, tip=0.5, shaft=sh),
            F_('round', gcov, w=0.8, outer=0.9, tip=0.8, shaft=sh),
            F_('round', cov, w=0.8, outer=0.9, tip=1.1, shaft=sh),
            F_('round', sec, w=0.76, outer=0.85, tip=0.7, shaft=sh),
            F_('round', tail, w=0.6, outer=0.85, tip=0.55, shaft=sh),
            F_('flight', crest, w=0.42, outer=0.9, tip=0.25, shaft=sh),
            F_('round', touter, w=0.6, outer=0.85, tip=0.6, shaft=sh)]


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = hexc(0x7A7E8A), hexc(0x5E6270)

    def dn(s, t, side):
        return mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 8


C.FEATHER_ATLAS = dict(C.FEATHER_ATLAS, cells=_cells, baby=_baby_cells)
refit.api(globals(), C, KS)
