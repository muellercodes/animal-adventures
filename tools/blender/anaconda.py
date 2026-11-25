# round 17: the green anaconda (Eunectes murinus) on the garter snake's tube (snakekit.py): 5 m, KS 3.4 (a head about
# 15 cm long and 8.5 cm wide on a body 22 cm thick). A narrow flat head hardly wider than the neck, the eyes and the
# nostrils on top of it (so it can lie at the surface with only them out), small smooth scales all over, the head too
# (no big plates), narrow belly plates, vertical pupils. Olive green with big black oval spots in two rows down the
# back, smaller black-ringed spots with yellow-orange middles low on the sides, a yellowish belly with black marks, a
# black stripe back from the eye over an orange-yellow one. A newborn (about 70 cm) has the same pattern.
import numpy as np
import snakekit as SK
from sdf import F, sstep, fbm, vnoise, _hash

KS = 3.4
LG = 5.0
L = LG / KS
M = SK.base(dict(
    ID='anaconda', Z_TIP=0.48 * LG / KS, L=L,
    SECT=[
        (0.0000, 0.0086, 0.0014, 0.0010, 0.0010, 2.0),
        (0.0018, 0.0086, 0.0050, 0.0034, 0.0030, 2.3),
        (0.0060, 0.0086, 0.0078, 0.0050, 0.0046, 2.5),
        (0.0140, 0.0087, 0.0098, 0.0062, 0.0060, 2.6),
        (0.0240, 0.0088, 0.0110, 0.0068, 0.0068, 2.6),
        (0.0340, 0.0089, 0.0120, 0.0072, 0.0074, 2.6),
        (0.0440, 0.0091, 0.0124, 0.0076, 0.0078, 2.5),
        (0.0540, 0.0095, 0.0118, 0.0082, 0.0084, 2.3),
        (0.0700, 0.0112, 0.0128, 0.0098, 0.0098, 2.2),
        (0.1200, 0.0162, 0.0172, 0.0150, 0.0144, 2.15),
        (0.2500, 0.0240, 0.0250, 0.0230, 0.0222, 2.15),
        (0.5000, 0.0310, 0.0318, 0.0300, 0.0292, 2.2),
        (0.7000, 0.0318, 0.0326, 0.0308, 0.0300, 2.2),
        (0.9500, 0.0300, 0.0310, 0.0292, 0.0284, 2.2),
        (1.1500, 0.0250, 0.0258, 0.0240, 0.0234, 2.15),
        (1.3000, 0.0170, 0.0172, 0.0160, 0.0154, 2.15),
        (1.4000, 0.0090, 0.0088, 0.0082, 0.0076, 2.1),
        (1.4450, 0.0050, 0.0044, 0.0040, 0.0038, 2.1),
        (L, 0.0030, 0.0008, 0.0008, 0.0008, 2.0),
    ],
    EYE_S=0.0235, EYE_TH=0.62, EYE_R=0.0024, NOS_S=0.0052, NOS_TH=0.36,
    NROW=45, P_S=0.0046, P_V=0.0048, TH_V=2.62,
))
_feat0 = M.features


def features(s, th):
    """the garter's head features with the brow moved in over the eyes on top of the head"""
    a = np.abs(th)
    head = sstep(0.07, 0.05, s)
    d = _feat0(s, th)
    d -= 0.0005 * np.exp(-((s - M.EYE_S) / 0.0045) ** 2 - ((a - 0.72) / 0.16) ** 2) * head
    d += 0.00035 * np.exp(-((s - M.EYE_S) / 0.0045) ** 2 - ((a - 0.32) / 0.13) ** 2) * head
    return d.astype(F)


M.features = features
M._dorsal = SK.dorsal(M, 0.0)


def _head_seams(s, th):
    """small irregular scales all over the head (no big plates)"""
    e, _, _ = SK.small_scales(s, th * M.sect(s)[2] * 1.05, 0.0024, 41)
    return np.where(th < 1.6, e * 0.0024 * 0.5, 1.0).astype(F)


M._head_seams = _head_seams
SK.make(globals(), M, KS, eye_dir=(0.5, 0.8, 0.33))
K = {k: SK.hexc(v) for k, v in dict(olive=0x3E4A24, oliveSide=0x55592E, black=0x121210, ocell=0xC0923A, belly=0xC4B868, head=0x3A4422,
                                   stripe=0x16160E, orange=0xC8862E, gap=0x0E0D0A).items()}
DSP = 0.05                                 # spacing of the big back spots (garter units)


def paint(P, N, c):
    Pu, s, th = c['Pu'], c['s'], c['th']
    H, E, CS, CT, bel, head, lips, lipU, seam = M.scales(Pu, N, c)
    n = len(s)
    jit = _hash(np.round(CS * 5000).astype(np.int64), np.round(CT * 300).astype(np.int64), np.zeros(n, np.int64), 91)
    r = M.sect(CS)[2]
    arc = np.abs(CT) * r
    col = SK.mix(np.tile(K['olive'], (n, 1)), K['oliveSide'], sstep(0.9, 1.6, CT))
    col = SK.mix(col, K['olive'] * 0.85, 0.5 * (fbm(Pu * 40, 2, 92) - 0.3))
    col *= (0.88 + 0.22 * jit)[:, None]
    on = sstep(0.075, 0.1, s) * sstep(L - 0.01, L - 0.05, s)
    # the big black ovals down the back, in two rows (a little uneven in size and place)
    k = np.round((CS - 0.11) / DSP)
    h1 = _hash(k.astype(np.int64), np.zeros(n, np.int64), np.zeros(n, np.int64), 93)
    h2 = _hash(k.astype(np.int64), np.ones(n, np.int64), np.zeros(n, np.int64), 93)
    sk = 0.11 + k * DSP + (h1 - 0.5) * 0.012
    rs = r / 0.031
    dd = ((CS - sk) / (0.017 * (0.8 + 0.35 * h2))) ** 2 + ((arc - 0.017 * rs) / (0.0105 * rs * (0.8 + 0.3 * h1))) ** 2
    col = SK.mix(col, K['black'], sstep(1.05, 0.85, dd) * on)
    # the ringed spots low on the sides: black rings round yellow-orange middles, in two staggered rows
    for row, (tc, off) in enumerate(((1.42, 0.0), (1.95, 0.5))):
        kk = np.round((CS - 0.1) / (DSP * 0.6) - off)
        hc = _hash(kk.astype(np.int64), np.full(n, row, np.int64), np.ones(n, np.int64), 94)
        cs0 = 0.1 + (kk + off) * DSP * 0.6 + (hc - 0.5) * 0.008
        rr = np.sqrt(((CS - cs0) / 0.0085) ** 2 + ((CT - tc) * r / (0.0075 * rs)) ** 2) * (0.85 + 0.3 * hc)
        col = SK.mix(col, K['black'], sstep(1.05, 0.9, rr) * on * sstep(0.5, 0.62, rr))
        col = SK.mix(col, K['ocell'], sstep(0.62, 0.48, rr) * on * 0.85)
    # the skin between the scales: dark lines
    col = col * (0.82 + 0.18 * sstep(0.0, 0.12, E))[:, None] * (1 - head[:, None]) + col * head[:, None]
    # belly: yellowish with black marks
    bm = sstep(0.62, 0.72, vnoise(np.stack([CS * 120, CT * 6, CS * 0], 1).astype(F), 95))
    bc = SK.mix(np.tile(K['belly'], (n, 1)) * (0.9 + 0.12 * jit)[:, None], K['black'], bm * 0.85)
    bc *= (0.85 + 0.15 * sstep(0.0, 0.1, E))[:, None]
    col = SK.mix(col, bc, bel)
    # head: olive with fine scales, a black stripe back from the eye to the corner of the jaw over an orange-yellow one,
    # pale yellowish lips
    mt = M.mouth_th(s)
    e2, cu, cv = SK.small_scales(s, th * M.sect(s)[2] * 1.05, 0.0024, 41)
    hc = np.tile(K['head'], (n, 1)) * (0.88 + 0.2 * _hash(np.round(cu * 9000).astype(np.int64), np.round(cv * 9000).astype(np.int64), np.zeros(n, np.int64), 96))[:, None]
    hc = SK.mix(hc, K['gap'], sstep(0.0004, 0.0, seam) * 0.45)
    u = np.clip((s - M.EYE_S) / (0.056 - M.EYE_S), 0, 1)
    thc = M.EYE_TH + 0.3 + u * 0.55
    post = (s > M.EYE_S) & (s < 0.06)
    hc = SK.mix(hc, K['stripe'], sstep(0.16, 0.1, np.abs(th - thc)) * post * 0.92)
    hc = SK.mix(hc, K['orange'], sstep(0.13, 0.07, np.abs(th - (thc + 0.24))) * post * 0.9)
    hc = SK.mix(hc, K['belly'], sstep(mt - 0.15, mt + 0.05, th) * 0.8)
    col = SK.mix(col, hc, head)
    col = SK.mix(col, K['gap'], np.exp(-((th - mt) / 0.035) ** 2) * sstep(0.046, 0.042, s) * sstep(0.0008, 0.002, s) * 0.7)
    rn = np.sqrt((s - M.NOS_S) ** 2 + ((th - M.NOS_TH) * 0.006) ** 2)
    col = SK.mix(col, K['gap'], sstep(0.0008, 0.0004, rn))
    re = np.sqrt((s - M.EYE_S) ** 2 + ((th - M.EYE_TH) * 0.0105) ** 2)
    col = SK.mix(col, K['gap'], sstep(M.EYE_R * 1.02, M.EYE_R * 0.9, re))
    rough = 0.36 + 0.12 * (1 - sstep(0.0, 0.15, E)) + 0.05 * bel - 0.04 * head
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    return (M.scales(c['Pu'], N, c)[0] * KS * 0.6).astype(F)   # smooth, low scales


MAP_QUALITY = (66, 50)


def meta(st):
    return SK.meta_scaled(M, KS, {'iris': 0x8A6A2C, 'pupil': 'v', 'pupilR': 0.45, 'lidCol': 0x4E5A2C}, {'flat': 0x3E4A24})
