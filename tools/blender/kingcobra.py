# round 17: the king cobra (Ophiophagus hannah) on the garter snake's tube (snakekit.py): 3.7 m, KS 2.4 (a head about
# 11 cm long). A slender body (15 rows of large smooth scales), a big head with large plates on top and the king
# cobra's own pair of big occipital scales behind them, the neck a little wider and flatter where the hood folds (the
# game spreads it: anim.hood), round pupils. Olive brown with faint pale chevron bands that point forward, clearer
# toward the back, the tail darker; a pale cream-yellow chin and throat, a grayish cream belly. Hatchlings are glossy
# black with bright yellow-white chevron bands and pale bars across the head (baby_paint).
import numpy as np
import snakekit as SK
from sdf import F, sstep, fbm, vnoise, _hash

KS = 2.4
LG = 3.7                       # game length (m), snout to tail tip
L = LG / KS
M = SK.base(dict(
    ID='kingcobra', Z_TIP=0.48 * LG / KS, L=L,
    # s, center height, half width, top, bottom, exponent (garter units)
    SECT=[
        (0.0000, 0.0122, 0.0012, 0.0010, 0.0010, 2.0),
        (0.0018, 0.0122, 0.0046, 0.0034, 0.0030, 2.2),
        (0.0060, 0.0121, 0.0076, 0.0054, 0.0050, 2.5),
        (0.0120, 0.0120, 0.0098, 0.0066, 0.0064, 2.7),
        (0.0200, 0.0120, 0.0114, 0.0074, 0.0074, 2.8),
        (0.0300, 0.0119, 0.0127, 0.0079, 0.0082, 2.8),
        (0.0400, 0.0118, 0.0134, 0.0082, 0.0088, 2.7),
        (0.0480, 0.0117, 0.0127, 0.0086, 0.0092, 2.5),
        (0.0570, 0.0117, 0.0110, 0.0090, 0.0096, 2.3),
        (0.0700, 0.0117, 0.0116, 0.0094, 0.0098, 2.3),
        (0.1000, 0.0116, 0.0126, 0.0096, 0.0100, 2.4),
        (0.1600, 0.0117, 0.0126, 0.0100, 0.0102, 2.35),
        (0.2400, 0.0120, 0.0124, 0.0108, 0.0106, 2.2),
        (0.5000, 0.0130, 0.0134, 0.0124, 0.0116, 2.15),
        (0.8500, 0.0130, 0.0134, 0.0124, 0.0116, 2.15),
        (1.0500, 0.0118, 0.0120, 0.0112, 0.0104, 2.15),
        (1.2000, 0.0100, 0.0100, 0.0094, 0.0086, 2.15),
        (1.3500, 0.0071, 0.0068, 0.0063, 0.0058, 2.15),
        (1.4600, 0.0043, 0.0039, 0.0036, 0.0034, 2.15),
        (1.5200, 0.0027, 0.0021, 0.0020, 0.0019, 2.15),
        (L, 0.0020, 0.0005, 0.0005, 0.0005, 2.1),
    ],
    EYE_S=0.0255, EYE_TH=1.06, EYE_R=0.0034, NOS_S=0.0044, NOS_TH=0.84,
    NROW=15, P_S=0.0066, P_V=0.0056, TH_V=2.40,
))
M._dorsal = SK.dorsal(M, 0.0)      # smooth scales
_seams0 = M._head_seams


def _head_seams(s, th):
    """the garter's plates, and behind the parietals the king cobra's pair of big occipital scales"""
    d = _seams0(s, th)
    r = M.sect(s)[2]
    xt = th * r * 1.05
    top = sstep(1.2, 1.0, th)
    d = np.minimum(d, np.abs(s - 0.061) + (1 - top) + (s < 0.045) * 1.0)
    d = np.where((s > 0.049) & (s < 0.061), np.minimum(d, np.abs(xt)), d)
    return d.astype(F)


M._head_seams = _head_seams
SK.make(globals(), M, KS, eye_dir=(0.86, 0.32, 0.42))
_fix0 = fix_weights


def fix_weights(W, wpos, names, G, weld):
    """the hood's flaps: the sides of the neck on each hood bone ride on its flap bone (hood<i>L / R, in the same place),
    most at the outer edge of the hood and none on the back and the throat, so the game can curve them forward"""
    W = _fix0(W, wpos, names, G, weld)
    bi = {n: i for i, n in enumerate(names)}
    s, th = M.tube_coords((wpos / KS).astype(F))
    g = (np.sin(th) ** 3).astype(F) * sstep(0.03, 0.05, s)
    for i in range(7):
        for sd, side in (('L', wpos[:, 0] > 0), ('R', wpos[:, 0] < 0)):
            h = bi.get(f'hood{i}{sd}')
            if h is None:
                continue
            mv = W[:, bi[f's{i}']] * g * side
            W[:, bi[f's{i}']] -= mv
            W[:, h] += mv
    return W
K = {k: SK.hexc(v) for k, v in dict(olive=0x403C28, oliveLt=0x5A5438, dark=0x1A1812, band=0x8C8458, throat=0xE2D49A, belly=0xCFCAB0,
                                   bellyDk=0x5A5648, head=0x4A4430, gap=0x0E0D0A, skin=0xBDB698, hatch=0x121214, hband=0xEAE4B4).items()}


def _common(c, N):
    Pu, s, th = c['Pu'], c['s'], c['th']
    H, E, CS, CT, bel, head, lips, lipU, seam = M.scales(Pu, N, c)
    jit = _hash(np.round(CS * 5000).astype(np.int64), np.round(CT * 300).astype(np.int64), np.zeros(len(s), np.int64), 71)
    r = M.sect(CS)[2]
    # chevrons pointing forward: the band runs back from the middle of the back down the sides
    b = (CS - 0.55 * np.abs(CT) * r) / 0.086
    return Pu, s, th, H, E, CS, CT, bel, head, lips, lipU, seam, jit, b


def paint(P, N, c):
    Pu, s, th, H, E, CS, CT, bel, head, lips, lipU, seam, jit, b = _common(c, N)
    n = len(s)
    u = s / L
    col = SK.mix(np.tile(K['olive'], (n, 1)), K['oliveLt'], 0.25 * (fbm(Pu * 60, 2, 72) - 0.3))
    col = SK.mix(col, K['dark'], sstep(0.4, 0.9, u) * 0.8)
    col *= (0.88 + 0.22 * jit)[:, None]
    band = sstep(0.72, 0.9, np.cos(2 * np.pi * b)) * sstep(0.07, 0.12, s) * (0.22 + 0.4 * sstep(0.25, 0.75, u))
    col = SK.mix(col, K['band'], band * (1 - bel))
    # the hood (spread in the game): its back a lighter olive with two clear pale chevrons, its edges dark, so the
    # spread hood's outline shows from behind and from in front
    hood = sstep(0.05, 0.08, s) * sstep(0.44, 0.36, s)
    col = SK.mix(col, K['oliveLt'] * 1.15, hood * sstep(1.25, 0.9, CT) * 0.7)
    hb = (CS - 0.45 * np.abs(CT) * M.sect(CS)[2] - 0.13) / 0.11
    col = SK.mix(col, K['band'] * 1.1, sstep(0.8, 0.92, np.cos(2 * np.pi * hb)) * hood * sstep(1.3, 1.0, CT) * 0.75 * (1 - bel))
    col = SK.mix(col, K['dark'], hood * sstep(1.25, 1.45, CT) * sstep(1.95, 1.75, CT) * 0.85)
    # the skin between the scales: dark lines
    col = col * (0.62 + 0.38 * sstep(0.0, 0.12, E))[:, None] * (1 - head[:, None]) + col * head[:, None]
    # belly: cream yellow under the chin and throat, grayer further back, dark under the tail
    bc = SK.mix(np.tile(K['throat'], (n, 1)), K['belly'], sstep(0.12, 0.35, u))
    bc = SK.mix(bc, K['bellyDk'], sstep(0.5, 0.85, u) * 0.85)
    bc *= (0.92 + 0.12 * jit)[:, None] * (0.8 + 0.2 * sstep(0.0, 0.1, E))[:, None]
    col = SK.mix(col, bc, bel)
    # the throat's pale color comes up the sides of the neck
    col = SK.mix(col, K['throat'], sstep(1.9, 2.3, th) * sstep(0.3, 0.1, u) * (1 - bel) * 0.85)
    # head: olive brown plates with darker seams, pale lips, chin and throat
    hc = np.tile(K['head'], (n, 1)) * (0.92 + 0.12 * fbm(Pu * 600, 2, 73))[:, None]
    hc = SK.mix(hc, K['gap'], sstep(0.0005, 0.0, seam) * 0.55)
    mt = M.mouth_th(s)
    hc = SK.mix(hc, K['throat'], sstep(mt - 0.25, mt - 0.08, th) * 0.85)
    col = SK.mix(col, hc, head)
    # mouth line, nostril, eye socket: dark
    col = SK.mix(col, K['gap'], np.exp(-((th - mt) / 0.035) ** 2) * sstep(0.044, 0.04, s) * sstep(0.0008, 0.002, s) * 0.7)
    rn = np.sqrt((s - M.NOS_S) ** 2 + ((th - M.NOS_TH) * 0.006) ** 2)
    col = SK.mix(col, K['gap'], sstep(0.0008, 0.0004, rn))
    re = np.sqrt((s - M.EYE_S) ** 2 + ((th - M.EYE_TH) * 0.0105) ** 2)
    col = SK.mix(col, K['gap'], sstep(M.EYE_R * 1.02, M.EYE_R * 0.9, re))
    rough = 0.38 + 0.12 * (1 - sstep(0.0, 0.15, E)) + 0.06 * bel - 0.06 * head
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def baby_paint(P, N, c, col):
    """hatchlings: glossy black with narrow bright yellow-white chevrons, pale bars across the head"""
    Pu, s, th, H, E, CS, CT, bel, head, lips, lipU, seam, jit, b = _common(c, N)
    n = len(s)
    out = np.tile(K['hatch'], (n, 1)) * (0.9 + 0.2 * jit)[:, None]
    bb = (CS - 0.5 * np.abs(CT) * M.sect(CS)[2]) / 0.036
    band = sstep(0.7, 0.84, np.cos(2 * np.pi * bb)) * sstep(0.065, 0.08, s)
    out = SK.mix(out, K['hband'], band * 0.92)
    out = out * (0.7 + 0.3 * sstep(0.0, 0.12, E))[:, None] * (1 - head[:, None]) + out * head[:, None]
    bc = SK.mix(np.tile(K['hband'], (n, 1)) * 0.92, K['hatch'], sstep(0.15, 0.5, s / L) * (1 - band) * 0.8)
    out = SK.mix(out, bc, bel)
    # head: black with pale bars across the snout, between the eyes and behind them
    hb = np.maximum.reduce([np.exp(-((s - c0) / w) ** 2) for c0, w in ((0.006, 0.0028), (0.031, 0.0032), (0.05, 0.003))])
    mt = M.mouth_th(s)
    hc = SK.mix(np.tile(K['hatch'], (n, 1)), K['hband'], hb * 0.9)
    hc = SK.mix(hc, K['hband'], sstep(mt - 0.2, mt - 0.05, th) * 0.8)
    out = SK.mix(out, hc, head)
    keep = np.clip(sstep(M.EYE_R * 1.02, M.EYE_R * 0.9, np.sqrt((s - M.EYE_S) ** 2 + ((th - M.EYE_TH) * 0.0105) ** 2)), 0, 1)
    out = SK.mix(out, K['gap'], keep)
    return np.clip(out, 0, 1).astype(F)


def detail(P, N, c):
    return (M.scales(c['Pu'], N, c)[0] * KS).astype(F)


MAP_QUALITY = (70, 56)
BABY_TEX = 512


def meta(st):
    return SK.meta_scaled(M, KS, {'iris': 0x5A3E1C, 'pupil': 'round', 'pupilR': 0.42, 'lidCol': 0x4A4430, 'babyLidCol': 0x121214},
                          {'flat': 0x4E4830})
