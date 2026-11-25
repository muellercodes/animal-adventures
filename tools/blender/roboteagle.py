# round 17: the robot eagle (Rosemary: "make a realistic robot eagle as well. where the eyes are just make it green."):
# a machine in the bald eagle's real shape and size, on the eagle's own body (refit.py: eagle.py runs in a private copy,
# C, at KS 1). Every feather of the eagle's plumage pattern is a metal plate: dark gunmetal plates over the body and
# wings with brushed steel ones among them, a silver head and neck and silver under the tail (where the eagle is white),
# a dark seam along each plate's edge where it overlaps the next, two small rivets at the base of each plate, fine
# brushed streaks along the plates; a polished dark bronze bill (a panel line where the cere was) and bronze talons;
# steel legs in jointed segments with dark joint rings. Its json says metal (40_animals: the body and the feather
# plates are metal and reflect the sky) and its eyes glow green (eye glow). The baby: a small robot eaglet with round
# plates (cells, not feathers) in steel and silver, no down. Make it with:
# VOXEL=0.0028 TRIS=6400 TEX=768 BLENDER_PY=... python3 tools/blender/make.py roboteagle
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, fbm, vnoise, worley, length
import bird as B
from bird import mirror, groove, hexc, mix
import refit

ID = 'roboteagle'
KS = 1.0
_M = sys.modules[__name__]
C = refit.load('eagle', ID + '_base')
del C.FUR   # (a robot eaglet has plates, not down: no fur shells)

K = {
    'gun': hexc(0x4A4E56), 'gunHi': hexc(0x5C616A), 'steel': hexc(0x9CA1A8), 'steelHi': hexc(0xB4B9C0), 'silver': hexc(0xD6DADE),
    'silverSh': hexc(0xB8BDC2), 'seam': hexc(0x18191C), 'rivet': hexc(0xC4C8CC), 'bronze': hexc(0x5E4228), 'bronzeHi': hexc(0x8A6442),
    'joint': hexc(0x26282C), 'socket': hexc(0x101214),
}


def _plates(Pm, pl):
    """per point: the seam along each plate's visible edge, the rivets near its base, the brushed streaks"""
    c = np.maximum(pl['c'], 1e-4)
    w = np.maximum(pl['w'], 1e-6)
    seam = sstep(0.1 * c, 0.025 * c, pl['e']) * pl['cov']
    riv = sstep(0.075 * c, 0.045 * c, np.hypot(pl['a'] + 0.62 * c, np.abs(pl['b']) - 0.42 * w)) * pl['cov']
    brush = fbm(np.stack([pl['b'] / 0.0004, pl['a'] / 0.006, pl['id'] * 50], 1), 2, 71)
    return seam, riv, brush


def _ring(Pm, a, b, t0, wd):
    """a dark joint ring across the segment a-b at t0"""
    t, _ = B.seg_t(Pm, a, b)
    return sstep(wd, wd * 0.4, np.abs(t - t0))


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    fid = pl['id']
    seam, riv, brush = _plates(Pm, pl)
    mid = sstep(0.001, 0.005, np.abs(x))
    # the body plates: gunmetal, some brushed steel, each a shade different
    steel = sstep(0.84, 0.9, fid) * 0.75
    col = mix(np.tile(K['gun'], (n, 1)), K['gunHi'], fid * 0.6)
    col = mix(col, mix(np.tile(K['steel'], (n, 1)), K['steelHi'], fid), steel * 0.85)
    col = mix(col, K['steelHi'], sstep(0.3, 0.9, Nm[:, 1]) * 0.12)
    # the silver hood and undertail (where the bald eagle is white)
    hood = np.maximum(C._hood(Pm, R), sstep(-0.16, -0.2, z) * sstep(0.1, -0.5, Nm[:, 1]) * R['trunk'] * 0.95)
    col = mix(col, mix(np.tile(K['silver'], (n, 1)), K['silverSh'], fid * 0.5), hood)
    col *= (0.95 + 0.07 * brush)[:, None]
    col = mix(col, K['rivet'], riv * mid * 0.85)
    col = mix(col, K['seam'], seam * mid * 0.85)
    # the joint ring at the base of the neck (the hood's lower edge)
    col = mix(col, K['joint'], sstep(0.025, 0.008, np.abs(C._hood(Pm, R) - 0.5)) * np.clip(R['neck'] + R['trunk'], 0, 1) * 0.7)
    # the polished dark bronze bill with a panel line where the cere was, and along the cutting edge
    bl = R['bill']
    bcol = mix(np.tile(K['bronze'], (n, 1)), K['bronzeHi'], sstep(0.3, 0.9, Nm[:, 1]) * 0.45)
    bcol = mix(bcol, K['seam'], sstep(0.0012, 0.0003, np.abs(z - C.CERE_Z)) * 0.9 + sstep(0.0012, 0.0, np.abs(y - C._tom_y(z))) * sstep(0.25, 0.26, z) * 0.7)
    col = mix(col, bcol, bl)
    # the eye socket: a dark ring round the eye
    de = np.linalg.norm(Pm - C.EYE_C, axis=1)
    col = mix(col, K['socket'], R['lids'] * sstep(C.EYE_R + 0.003, C.EYE_R + 0.001, de))
    # legs: steel segments with dark joint rings at the hock and across the toes; bronze talons
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    sc = B.scutes(Pm, nrm([0, -1, 0.15]), 0.006, 43)[1]
    lcol = mix(np.tile(K['steel'], (n, 1)), K['joint'], sc * 0.6)
    lcol = mix(lcol, K['joint'], _ring(Pm, C.HMETA, C.HPAW, 0.18, 0.06) * 0.9)
    col = mix(col, lcol, lg)
    col = mix(col, mix(np.tile(K['bronze'], (n, 1)), K['bronzeHi'], sstep(0.2, 0.9, Nm[:, 1]) * 0.4), R['claws'])
    rough = 0.42 + 0.08 * (brush - 0.5) - 0.06 * steel
    rough = np.where(hood > 0.5, 0.3 + 0.05 * (brush - 0.5), rough)
    rough = rough + 0.25 * seam * mid
    rough = np.where(bl > 0.5, 0.22, rough)
    rough = np.where(lg > 0.5, 0.36, rough)
    rough = np.where(R['claws'] > 0.5, 0.2, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.15, 0.95).astype(F)


def detail(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    h = np.zeros(len(P), F)
    cc = np.maximum(pl['c'], 1e-4)
    seam, riv, brush = _plates(Pm, pl)
    mid = sstep(0.001, 0.005, np.abs(x))
    # stiff plates: each rises to its edge and steps down onto the next (harder than feathers), a groove at the seam
    h += B.feather_height(pl, 0.06) * feath * mid
    h -= 0.00022 * seam * feath * mid
    h += 0.0002 * riv * feath * mid
    h += 0.000006 * (brush - 0.5) * feath
    # the bill: panel lines where the cere was and along the cutting edge
    h -= 0.00015 * sstep(0.0012, 0.0003, np.abs(z - C.CERE_Z)) * R['bill']
    # legs: the scutes as plates, a joint groove at the hock
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    sh, sg = B.scutes(Pm, nrm([0, -1, 0.15]), 0.006, 43)
    h += lg * (0.00014 * sh - 0.00014 * sg)
    h -= 0.0002 * _ring(Pm, C.HMETA, C.HPAW, 0.18, 0.06) * lg
    return h


# ---------- the robot eaglet: round plates in steel and silver, no down ----------
def _cells_b(Pm):
    f1, f2 = worley(Pm / 0.013, 91)
    return f1, f2


def paint_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    f1, f2 = _cells_b(Pm)
    seam = sstep(0.07, 0.02, f2 - f1) * feath
    tint = vnoise(Pm / 0.013, 92)
    col = mix(np.tile(K['steel'], (n, 1)), K['silver'], sstep(0.4, 0.8, tint) * 0.8)
    col = mix(col, K['silver'], np.clip(R['head'] + R['brow'], 0, 1) * 0.6)
    col = mix(col, K['seam'], seam * 0.85)
    bl = R['bill']
    col = mix(col, mix(np.tile(K['bronze'], (n, 1)), K['bronzeHi'], sstep(0.3, 0.9, Nm[:, 1]) * 0.45), bl)
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    col = mix(col, mix(np.tile(K['steel'], (n, 1)), K['joint'], _ring(Pm, C.HMETA, C.HPAW, 0.18, 0.06) * 0.9), lg)
    col = mix(col, K['bronze'], R['claws'])
    de = np.linalg.norm(Pm - C.EYE_C, axis=1)
    col = mix(col, K['socket'], R['lids'] * sstep(C.EYE_R + 0.003, C.EYE_R + 0.001, de))
    rough = 0.34 + 0.25 * seam
    rough = np.where(bl > 0.5, 0.22, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.15, 0.95).astype(F)


def detail_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    f1, f2 = _cells_b(Pm)
    # each round plate domed, a groove between them
    return (0.0005 * sat(1 - f1 * 1.2) - 0.0003 * sstep(0.07, 0.02, f2 - f1)) * feath


C.paint, C.detail, C.paint_baby, C.detail_baby = paint, detail, paint_baby, detail_baby
_meta0 = C.meta


def meta(st):
    m = _meta0(st)
    m['eye'].update({'iris': 0x48FF78, 'irisR': 0.92, 'pupilR': 0.3, 'rim': 0x0C3018, 'sclera': 0x101410, 'glow': 0x30FF60,
                     'babyIris': 0x48FF78, 'lidCol': 0x101214, 'babyLidCol': 0x101214})
    m.update({'flat': 0x6A6E76, 'rim': [0.0, 0.0, 0.0], 'metal': 1.0})
    return m


C.meta = meta
C.stats = lambda P, N, c, col: {'lidCol': 0x101214}


# ---------- feather plates (atlas cells: 0 primaries, 1 secondaries, 2 greater coverts, 3 lesser coverts, 4 tertials,
# 5 tail, 6 tail coverts, 7 coverts): metal plates in feather outlines, a dark seam inside the edge, panel lines
# across, rivets along the shaft ----------
def _cells():
    F_ = B.FeatherCell
    gun, gunH, st, stH, sil, seam = hexc(0x4A4E56), hexc(0x60656E), hexc(0x9CA1A8), hexc(0xB4B9C0), hexc(0xD6DADE), hexc(0x18191C)

    def plate(c0, c1, panels):
        def fn(s, t, side):
            c = mix(np.tile(c0, (len(s), 1)), c1, sstep(-0.6, 0.6, s) * 0.5)
            c *= (0.95 + 0.07 * fbm(np.stack([s * 60, t * 4, np.zeros_like(s)], 1), 2, 72))[:, None]
            c = mix(c, seam, sstep(0.82, 0.92, np.abs(s)) * 0.8)
            pan = sstep(0.012, 0.004, np.abs(((t * panels) % 1.0) - 0.5) - 0.48) * sstep(0.1, 0.2, t)
            c = mix(c, seam, pan * 0.7)
            rv = sstep(0.06, 0.03, np.hypot(np.abs(s) - 0.3, ((t * panels + 0.5) % 1.0 - 0.5) * 0.25))
            return mix(c, hexc(0xC8CCD0), rv * 0.8)
        return fn

    return [F_('finger', plate(gun, gunH, 4), w=0.6, outer=0.55, tip=0.42, shaft=hexc(0x2A2C30), notch=0.38, gloss=1),
            F_('round', plate(gun, st, 3), w=0.74, outer=0.8, tip=0.5, shaft=hexc(0x2A2C30), gloss=1),
            F_('round', plate(st, stH, 2), w=0.8, outer=0.85, tip=0.8, shaft=hexc(0x2A2C30), gloss=1),
            F_('round', plate(gun, gunH, 1), w=0.8, outer=0.9, tip=1.1, shaft=hexc(0x2A2C30), gloss=1),
            F_('round', plate(gun, st, 3), w=0.76, outer=0.85, tip=0.7, shaft=hexc(0x2A2C30), gloss=1),
            F_('round', plate(sil, stH, 4), w=0.72, outer=0.9, tip=0.7, shaft=hexc(0x8A8E94), gloss=1),
            F_('round', plate(sil, stH, 2), w=0.78, outer=0.9, tip=0.9, shaft=hexc(0x8A8E94), gloss=1),
            F_('round', plate(gun, st, 1), w=0.8, outer=0.9, tip=0.8, shaft=hexc(0x2A2C30), gloss=1)]


def _baby_cells():
    # the eaglet's small wing and tail: round steel plates
    F_ = B.FeatherCell
    st, sil, seam = hexc(0x9CA1A8), hexc(0xC8CCD0), hexc(0x18191C)

    def pl(s, t, side):
        c = mix(np.tile(st, (len(s), 1)), sil, sstep(0.0, 1.0, t) * 0.4)
        return mix(c, seam, sstep(0.8, 0.92, np.abs(s)) * 0.7)
    return [F_('round', pl, w=0.8, outer=0.9, tip=1.0, shaft=hexc(0x6A6E74), gloss=1)] * 8


C.FEATHER_ATLAS = dict(C.FEATHER_ATLAS, cells=_cells, baby=_baby_cells)
C.BABY_MAPS = {'size': 384, 'quality': (74, 72)}
refit.api(globals(), C, KS)
