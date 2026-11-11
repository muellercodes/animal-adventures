# The Holstein bull (round 12): the cow's boy, his own sculpt on the cow's skeleton (game/models/cowm.json, which the
# game uses for a boy cow, see SEX_LOOK in 00_core.js). Made at the cow's size; the game scales a bull to 1.08 of the
# cow. cow.py runs in this module first (so every function of it looks its tables and landmarks up here), then this
# file replaces what a bull has of his own:
# - no udder (its box is moved out of the body, so the udder is never there and its paint masks are empty)
# - a heavy neck with a crest (a thick roll of muscle along the top, highest a little in front of the withers) and a
#   deep dewlap with folds down to a deep brisket; heavy shoulders and forequarters, a little thicker legs, the
#   hindquarters rounder and better muscled (the hooks and pins show less), the flank tucked up more than a dairy cow's
# - a broader, shorter head: the cow's head in a warped head frame (hframe() and hp() here), broader over the forehead,
#   a little broader over the muzzle, shorter and deeper, so every part and landmark placed in the frame (eyes, ears,
#   nose pad, nostrils, mouth, paint masks) follows; a broad poll and a mat of curly hair over the forehead (a little
#   in the sculpt, the curls in the fine detail and the paint)
# - his own black and white patches (other seeds, a little more black over the neck and shoulders) and his own blaze;
#   no horns (polled, like the cow); no genital detail
# The calf is a plain calf: his baby offsets move every vertex below the head onto the cow's body without its udder
# (cow.py's own fields, not this file's), so a bull calf has the cow calf's shape; the head stays his (the eyes are
# placed by bones, and a calf's head is the game's big round baby head anyway).
# Make it with: VOXEL=0.0065 TRIS=4000 TEX=768 WEIGHTS=transfer BLENDER_PY=... python3 tools/blender/make.py cowm (the
# rig step does not apply: export the cow's rig as work/cowm-rig.json, python3 tools/blender/export_rig.py cow
# tools/blender/work/cowm-rig.json)
import os
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, ellipsoid, round_cone, loft, sweep, fbm, vnoise, worley
import ungulate as U
import carnivore as CV
import cow as CW

exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cow.py')).read(), 'cow.py', 'exec'), globals())
ID = 'cowm'

# ---------- the head: broader, shorter and deeper (a warp of the cow's head frame) ----------
HS, HU_K = 0.92, 1.06


def _kx(s):
    """head width factor along the face (s in the cow's head frame): broad over the forehead and the eyes, a little
    less over the muzzle"""
    return 1.22 - 0.1 * sstep(0.2, 0.42, s)


def hp(s, u, x=0.0):
    return HO + HA * (s * HS) + HU * (u * HU_K) + V(1, 0, 0) * (x * float(_kx(s)))


def hframe(Q):
    """the cow's head frame coordinates (x, u, s) of rig points on the bull's head"""
    D = Q - HO
    s = (D @ HA) / HS
    return np.stack([D[:, 0] / _kx(s), (D @ HU) / HU_K, s], 1).astype(F)


EYE_C = hp(0.145, -0.052, 0.109)
MOUTH = hp(0.5, -0.115)
NOSE = hp(0.53, -0.03)
EAR_B = hp(0.05, -0.075, 0.095)
HEAD_BOX = (V(-0.32, 0.78, 0.85), V(0.32, 1.58, 1.5))
EAR_BOX = (V(-0.38, 1.1, 0.85), V(0.38, 1.52, 1.28))
NECK_BOX = (V(-0.45, 0.6, 0.25), V(0.45, 1.6, 1.25))
FL_BOX = (V(-0.44, -0.05, 0.25), V(0.44, 1.32, 0.82))
# no udder: its box lies out of the body (udder() is never evaluated, its distance is far everywhere)
UDDER_BOX = (V(-0.01, 9.0, 0.0), V(0.01, 9.01, 0.01))
BOUNDS = (V(-0.52, -0.001, -1.12), V(0.52, 1.6, 1.5))

# ---------- body ----------
# a level, broad back rising to the withers, rounder over the hindquarters, a deep chest, the flank tucked up
TRUNK = [
    (-0.97, 1.37, 1.22, 1.06, 0.11, 2.2, 2.0),
    (-0.9, 1.425, 1.18, 0.9, 0.215, 2.3, 2.0),
    (-0.7, 1.455, 1.13, 0.84, 0.29, 2.3, 2.0),
    (-0.42, 1.44, 1.06, 0.72, 0.35, 2.2, 2.0),
    (-0.12, 1.44, 1.02, 0.64, 0.385, 2.1, 2.0),
    (0.18, 1.46, 1.03, 0.64, 0.385, 2.1, 2.0),
    (0.42, 1.48, 1.06, 0.69, 0.33, 2.0, 2.0),
    (0.62, 1.43, 1.02, 0.74, 0.27, 2.0, 2.0),
    (0.76, 1.3, 1.0, 0.8, 0.2, 2.0, 2.0),
]
# the neck: thick and deep (top: the crest, bottom: the throat)
NECK = [
    (1.14, 0.5, 0.36, 0.34, 0.32, 2.0, 2.0),
    (1.2, 0.72, 0.3, 0.27, 0.25, 2.0, 2.0),
    (1.28, 0.92, 0.21, 0.2, 0.17, 2.0, 2.0),
    (1.35, 1.05, 0.13, 0.14, 0.118, 2.0, 2.0),
]
FORE = [
    (1.08, 0.6, 0.15, 0.15, 0.15, 2.0, 2.0, 0.16),
    (0.86, 0.47, 0.108, 0.114, 0.097, 2.0, 2.0, 0.185),
    (0.66, 0.475, 0.077, 0.068, 0.064, 2.1, 2.1, 0.19),
    (0.45, 0.5, 0.051, 0.049, 0.051, 2.2, 2.2, 0.19),
    (0.3, 0.505, 0.035, 0.038, 0.035, 2.2, 2.2, 0.19),
    (0.15, 0.515, 0.039, 0.041, 0.039, 2.2, 2.2, 0.19),
    (0.075, 0.54, 0.036, 0.034, 0.042, 2.2, 2.2, 0.19),
]
HIND = [
    (1.22, -0.72, 0.18, 0.18, 0.15, 2.0, 2.0, 0.16),
    (0.96, -0.56, 0.14, 0.185, 0.125, 2.0, 2.0, 0.195),
    (0.74, -0.66, 0.08, 0.118, 0.075, 2.0, 2.0, 0.205),
    (0.53, -0.8, 0.044, 0.063, 0.05, 2.1, 2.1, 0.2),
    (0.33, -0.76, 0.034, 0.04, 0.033, 2.2, 2.2, 0.2),
    (0.15, -0.725, 0.039, 0.041, 0.039, 2.2, 2.2, 0.2),
    (0.075, -0.705, 0.036, 0.034, 0.042, 2.2, 2.2, 0.2),
]


def trunk(P):
    Q = _mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    d = loft(Q, TRUNK)
    # heavy shoulders
    d = smin(d, ellipsoid(Q, V(0.21, 1.2, 0.54), V(0.14, 0.28, 0.23)), 0.12)
    # the hooks, the thurl, the pins and the tail head, well covered (round, muscled hindquarters)
    d = smin(d, ellipsoid(Q, V(0.255, 1.39, -0.63), V(0.05, 0.045, 0.07)), 0.07)
    d = smin(d, ellipsoid(Q, V(0.25, 1.2, -0.76), V(0.08, 0.12, 0.12)), 0.08)
    d = smin(d, ellipsoid(Q, V(0.1, 1.36, -0.95), V(0.05, 0.045, 0.05)), 0.04)
    d = smin(d, ellipsoid(Q, V(0.0, 1.41, -0.9), V(0.045, 0.04, 0.08)), 0.04)
    # the deep brisket between the front legs, a flank fold from the belly to the stifle
    d = smin(d, ellipsoid(Q, V(0.0, 0.84, 0.64), V(0.15, 0.15, 0.2)), 0.1)
    d = smin(d, U.eround(Q, V(0.22, 0.88, -0.3), V(0.26, 0.94, -0.55), 0.12, 0.1, 0.55, 0.24), 0.1)
    # a soft hollow in front of the hooks
    d = d + 0.005 * np.exp(-(((z + 0.42) / 0.09) ** 2 + ((y - 1.26) / 0.1) ** 2)) * sstep(0.2, 0.32, x)
    return d


def neck(P):
    Q = _mirror(P)
    d = sweep(Q, NECK, n=40)
    # the crest: a thick roll of muscle along the top of the neck, highest a little in front of the withers
    d = smin(d, ellipsoid(Q, V(0.0, 1.43, 0.8), V(0.15, 0.09, 0.3)), 0.08)
    # the dewlap: a deep fold of loose skin from the throat down to the brisket, its lower edge in soft folds
    t = np.clip((Q[:, 2] - 0.58) / 0.46, 0, 1)
    yb = 0.74 + (1.06 - 0.74) * t ** 1.1 + 0.012 * np.sin(Q[:, 2] * 23.0 + 0.6)
    dw = np.maximum(np.abs(Q[:, 0]) - 0.045 * (1 - 0.5 * t), yb - Q[:, 1])
    dw = smax(dw, smax(0.56 - Q[:, 2], Q[:, 2] - 1.04, 0.03), 0.03)
    dw = smax(dw, Q[:, 1] - 1.22, 0.05)
    return smin(d, dw, 0.08)


_head0 = head


def _forehead(L):
    """the mat of curly hair over the forehead and the poll, between the ears and down to the eyes"""
    x, u, s = L[:, 0], L[:, 1], L[:, 2]
    return np.exp(-((s - 0.07) / 0.085) ** 2) * sstep(0.085, 0.05, np.abs(x)) * sstep(-0.045, -0.015, u)


def head(P):
    Q = _mirror(P)
    L = hframe(Q)
    d = _head0(P)
    # a broad, flat poll
    d = smin(d, ellipsoid(L, V(0.0, -0.012, 0.03), V(0.085, 0.03, 0.045)), 0.03)
    # the curly hair stands a little off the forehead (lumpy)
    lump = fbm(Q * 38.0, 2, 171) - 0.5
    return d - _forehead(L) * (0.004 + 0.003 * lump)


PATCHES = [
    (EYE_C * V(0, 1, 1) + V(0.05, -0.05, -0.05), EYE_C * V(0, 1, 1) + V(0.16, 0.05, 0.05), 0.0018),   # eye and lids
    (V(0.0, 0.9, 1.24), V(0.125, 1.15, 1.47), 0.0025),                                                 # muzzle, nostrils, lips
    (V(0.08, -0.001, 0.4), V(0.3, 0.14, 0.66), 0.0028),                                                # front hoof and dewclaws
    (V(0.08, -0.001, -0.84), V(0.32, 0.14, -0.58), 0.0028),                                            # hind hoof and dewclaws
]
PREVIEW = dict(PREVIEW, headside=((1.7, 1.25, 1.2), (0, 1.2, 1.2), 26))

# the neck is thicker: the rings across it reach further
BEND = [(a, b, p, 0.52 if (a[0] == 0 and b[0] == 0 and b[2] > 0) else r) for a, b, p, r in BEND]


def lowpoly_fix(bm, hi):
    import meshfix as MF
    tr = MF.tree(hi)
    for a, b, pitch, reach in BEND:
        if a[0] == 0 and b[2] < -0.9:
            ok = lambda c, p0, r, reach=reach: r < reach and abs(c.x) < 0.06 and c.z < -0.98
        elif a[0] == 0 and b[0] == 0:
            ok = lambda c, p0, r, reach=reach: r < reach and abs(c.x) < 0.4 and c.z > 0.5
        else:
            ok = lambda c, p0, r, reach=reach: r < reach and abs(c.x) > 0.09
        MF.rings(bm, tr, a, b, pitch, ok)
    MF.finish(bm, 1e-6)


# ---------- the calf: a plain calf (the cow's body without its udder below the head) ----------
def _calf_body(R):
    """the cow's own body without the udder (cow.py's fields), the head left out"""
    d = CW.trunk(R)
    d = smin(d, CW._local(R, *CW.NECK_BOX, CW.neck), 0.14)
    d = smin(d, CW._local(R, *CW.FL_BOX, CW.fleg), 0.1)
    d = smin(d, CW._local(R, *CW.HL_BOX, CW.hleg), 0.1)
    d = smin(d, CW._local(R, *CW.HOOF_BOX, CW.hooves), 0.025)
    d = smin(d, CW._local(R, *CW.DEW_BOX, CW.dew), 0.008)
    tl, _ = CW._local_n(R, *CW.TAIL_BOX, CW.tail, 2)
    k = 0.05 * sstep(1.3, 1.4, R[:, 1]) + 1e-4
    h = np.maximum(k - np.abs(d - tl), 0) / k
    return np.minimum(d, tl) - h * h * k * 0.25


def baby_offset(P, N, c):
    Q = _mirror(P)
    own = _own(c)
    # every vertex off the head walks onto the cow's body (a few steps down the field), faded out toward the head
    w = (1 - own['head'] - own['ear']).astype(F) * sstep(0.02, 0.09, np.minimum(c['head'], c['ear']))
    X = Q.copy()
    for _ in range(8):
        g = CV.gradient(_calf_body, X, 0.002)
        X = X - g * _calf_body(X)[:, None]
    out = (X - Q) * w[:, None]
    out[:, 0] *= np.sign(P[:, 0] + 1e-9)
    return out.astype(F)


# ---------- coat paint ----------
def _patches(P, R):
    """his own Holstein patches: the cow's kind of field with other seeds, a little more black over the neck and the
    shoulders (a bull often looks darker): about 58% black over the body (the cow about 49%), both flanks a little over
    half black, the neck and shoulders about 80%, the hindquarters about 45% (seeds picked for that)"""
    W = P + 0.06 * (np.stack([vnoise(P * 3.1 + 5.2, 461), vnoise(P * 3.1 + 2.6, 462), vnoise(P * 3.1 + 8.9, 463)], 1) - 0.5)
    n = fbm(W * V(1.9, 2.3, 1.6) + V(1.08, 4.45, 2.53), 3, 464)
    n = n + 0.05 * (fbm(W * 9, 2, 465) - 0.5)
    n = n + 0.08 * sstep(0.95, 1.35, P[:, 1]) - 0.05 * sstep(0.95, 0.75, P[:, 1]) + 0.05 * sstep(0.2, 0.6, P[:, 2])
    return sstep(0.576, 0.591, n)


def _curls(P, L):
    """the forehead's curls: small rounded locks (bumps), each with a groove curling round it; 0..1 height and a
    highlight"""
    Pm = _mirror(P)
    warp = np.stack([vnoise(Pm * 70 + k, 186 + k) for k in range(3)], 1) - 0.5
    f1, f2 = worley(Pm / 0.011 + warp * 0.6, 189)
    lock = sstep(0.62, 0.05, f1)
    edge = sstep(0.0, 0.18, f2 - f1)
    m = _forehead(L)
    return lock * edge * m, m


def paint(P, N, c, baby=False):
    R = _regions(P, N, c)
    Pm, Nm, L = R['Pm'], R['Nm'], R['L']
    blk = _patches(P, R)
    # the head: black with his own blaze, a narrow white stripe from a star on the forehead down to the muzzle, bent a
    # little to one side
    Ls = hframe(P)
    s, u = L[:, 2], L[:, 1]
    bw = 0.016 + 0.024 * sstep(0.17, 0.09, s) * sstep(0.02, 0.08, s) + 0.026 * sstep(0.38, 0.52, s)
    wob = 0.02 * (fbm(P * V(14, 14, 14) + 5.0, 3, 196) - 0.5) + 0.012 * sstep(0.15, 0.4, s)
    blaze = sstep(bw + 0.003, bw - 0.003, np.abs(Ls[:, 0] + 0.004 + wob)) * sstep(0.04, 0.08, s + 0.02 * fbm(P * 12, 2, 197)) * sstep(-0.075, -0.035, u - 0.05 * sstep(0.4, 0.55, s))
    hd = R['head'] * sstep(0.0, 0.04, s + 0.03)
    blk = blk * (1 - hd) + hd * (1 - blaze)
    blk = np.maximum(blk, R['ear'])
    # white: lower legs, belly, the switch
    blk = blk * (1 - R['low']) * (1 - R['belly'] * sstep(-0.62, -0.85, N[:, 1])) * (1 - R['switch'])
    blk = blk * (1 - sstep(0.06, 0.0, c['tail']) * sstep(0.9, 0.75, Pm[:, 1]))
    jit = fbm(Pm * 60, 2, 87)
    white = U.mix(np.tile(K['white'], (len(P), 1)), K['whiteSh'], 0.4 * (jit - 0.3) + 0.2 * sstep(-0.2, -0.8, Nm[:, 1]))
    black = U.mix(np.tile(K['black'], (len(P), 1)), K['blackHi'], 0.6 * jit * sstep(-0.2, 0.6, Nm[:, 1]))
    col = U.mix(white, black, blk)
    # the curls catch the light (a little brownish at the tips)
    cu, fm = _curls(P, L)
    col = U.mix(col, U.hexc(0x4A3C32), cu * blk * 0.55)
    col = U.mix(col, K['earIn'], R['earIn'] * 0.55)
    # the muzzle: a pink-gray nose pad mottled darker, dark nostrils
    nm = U.mix(np.tile(K['nose'], (len(P), 1)), K['noseDk'], 0.55 * sstep(0.45, 0.75, fbm(Pm * 40, 3, 198)))
    nl = np.linalg.norm(L - V(0.052, -0.035, 0.548), axis=1)
    nm = U.mix(nm, U.hexc(0x2A1E1C), sstep(0.022, 0.012, nl))
    col = U.mix(col, nm, R['nose'])
    col = U.mix(col, K['lid'], R['lid'] * 0.85)
    hcol = U.mix(np.tile(K['hoof'], (len(P), 1)), K['hoofLt'], 0.4 * sstep(0.3, 0.7, fbm(Pm * V(80, 8, 80), 2, 89)))
    col = U.mix(col, hcol, R['hoof'])
    col = U.mix(col, K['ball'], R['ball'])
    col *= (0.97 + 0.06 * fbm(Pm * 40, 2, 13))[:, None]
    rough = 0.76 - 0.3 * R['hoof'] - 0.35 * R['lid'] * sstep(EYE_R + 0.006, EYE_R + 0.002, R['eyeD']) - 0.32 * R['nose'] - 0.1 * blk + 0.08 * fm
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.96).astype(F)


_detail0 = detail


def detail(P, N, c):
    """the cow's fine detail, plus the curls on the forehead and deeper folds down the dewlap"""
    h = _detail0(P, N, c)
    R = _regions(P, N, c)
    Pm = R['Pm']
    cu, fm = _curls(P, R['L'])
    h = h + 0.0022 * (cu - 0.35 * fm)
    # loose skin: folds hanging down the dewlap and across the throat
    dw = sstep(0.06, 0.02, Pm[:, 0]) * sstep(0.6, 0.66, Pm[:, 2]) * sstep(1.05, 0.98, Pm[:, 2]) * sstep(1.1, 0.95, Pm[:, 1])
    fo = np.abs(np.sin(np.pi * ((Pm[:, 2] + 0.2 * Pm[:, 1]) / 0.06 + 0.7 * fbm(Pm * 6, 2, 199))))
    return h - 0.0018 * np.exp(-(fo / 0.25) ** 2) * dw
