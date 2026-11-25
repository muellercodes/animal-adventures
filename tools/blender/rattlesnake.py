# round 17: the western diamondback rattlesnake (Crotalus atrox) on the garter snake's tube (snakekit.py): 1.4 m, KS
# 1.45 (a head about 6.5 cm long and 5.6 cm wide). A heavy body (25 rows of keeled scales) on a thin neck, a broad
# triangular head with a blunt snout, a heavy brow over the eye (the supraocular), the heat pit between the eye and
# the nostril, small scales on the crown; vertical pupils. Gray-brown with dark brown diamonds edged in cream down the
# back, a dark stripe through the eye between two pale lines, a black and white banded tail and the rattle: tan
# segments of keratin, each one's front lobe overlapping the next (in the shape, features()). Born live; a baby has a
# single button (baby_offset squeezes the rattle into its first segment).
import numpy as np
import snakekit as SK
from sdf import F, sstep, fbm, vnoise, _hash

KS = 1.45
LG = 1.4
L = LG / KS
R0, RP, NSEGR = 0.926, 0.0058, 6          # the rattle: where it starts, segment length, segments (garter units)
M = SK.base(dict(
    ID='rattlesnake', Z_TIP=0.48 * LG / KS, L=L,
    SECT=[
        (0.0000, 0.0110, 0.0016, 0.0010, 0.0010, 2.0),
        (0.0018, 0.0110, 0.0056, 0.0034, 0.0030, 2.3),
        (0.0060, 0.0110, 0.0094, 0.0050, 0.0046, 2.6),
        (0.0140, 0.0110, 0.0134, 0.0064, 0.0058, 2.8),
        (0.0240, 0.0110, 0.0168, 0.0072, 0.0066, 2.9),
        (0.0340, 0.0110, 0.0192, 0.0076, 0.0072, 2.9),
        (0.0420, 0.0111, 0.0184, 0.0080, 0.0076, 2.7),
        (0.0500, 0.0112, 0.0136, 0.0082, 0.0080, 2.4),
        (0.0580, 0.0114, 0.0100, 0.0086, 0.0086, 2.2),
        (0.0700, 0.0120, 0.0110, 0.0098, 0.0096, 2.2),
        (0.1200, 0.0150, 0.0162, 0.0142, 0.0132, 2.15),
        (0.2500, 0.0190, 0.0208, 0.0182, 0.0172, 2.15),
        (0.4300, 0.0204, 0.0224, 0.0196, 0.0186, 2.2),
        (0.6200, 0.0200, 0.0220, 0.0192, 0.0182, 2.2),
        (0.7800, 0.0170, 0.0184, 0.0162, 0.0154, 2.15),
        (0.8500, 0.0132, 0.0140, 0.0124, 0.0118, 2.15),
        (0.9000, 0.0090, 0.0092, 0.0082, 0.0078, 2.1),
        (R0, 0.0076, 0.0070, 0.0066, 0.0064, 2.1),
        (0.9590, 0.0074, 0.0064, 0.0062, 0.0060, 2.1),
        (L, 0.0070, 0.0010, 0.0010, 0.0010, 2.0),
    ],
    EYE_S=0.0262, EYE_TH=1.02, EYE_R=0.0027, NOS_S=0.0042, NOS_TH=0.92,
    NROW=25, P_S=0.0058, P_V=0.0052, TH_V=2.45,
))
_feat0 = M.features


def rattle_lobes(s):
    """each rattle segment: a groove where it starts (the end of the one before), its front lobe swelling just behind"""
    a = (s - R0) / RP
    f = a - np.floor(a)
    on = (s > R0 - 0.001) & (s < L - 0.0015)
    return (0.0013 * np.exp(-((f - 0.4) / 0.27) ** 2) - 0.0009 * np.exp(-(f / 0.08) ** 2) - 0.0009 * np.exp(-((f - 1) / 0.08) ** 2)) * on


def features(s, th):
    """the garter's head features, plus a heavier brow over the eye, the heat pit, and the rattle's segments"""
    a = np.abs(th)
    d = _feat0(s, th)
    head = sstep(0.07, 0.05, s)
    d += 0.0008 * np.exp(-((s - M.EYE_S) / 0.0055) ** 2 - ((a - 0.74) / 0.17) ** 2) * head
    rp = np.sqrt((s - 0.0142) ** 2 + ((a - 1.24) * 0.008) ** 2)
    d -= 0.0007 * np.exp(-(rp / 0.0011) ** 2) * head
    return (d + rattle_lobes(s)).astype(F)


M.features = features
M._dorsal = SK.dorsal(M, 0.55)


def _head_seams(s, th):
    """small scales on the crown between the big brow plates (the supraoculars), the rostral and internasals in front"""
    r = M.sect(s)[2]
    xt = th * r * 1.05
    e, _, _ = SK.small_scales(s, xt, 0.0026, 31)
    d = e * 0.0026 * 0.5
    so = (s > 0.017) & (s < 0.035) & (np.abs(xt - 0.0105) < 0.0042)      # the supraocular plate over each eye
    d = np.where(so, np.minimum(np.abs(s - 0.017), np.minimum(np.abs(s - 0.035), np.abs(np.abs(xt - 0.0105) - 0.0042))), d)
    fr = s < 0.0085                                                        # rostral and internasals
    d = np.where(fr, np.minimum(np.abs(s - 0.0035), np.minimum(np.abs(s - 0.0085), np.abs(xt) + (s < 0.0035))), d)
    return np.where(sstep(1.25, 1.05, th) > 0.5, d, 1.0).astype(F)


M._head_seams = _head_seams


def rings(m):
    sp = (L - 0.1) / 120
    s = list(np.arange(0.0018, 0.072, 0.0026)) + list(np.arange(0.072, 0.90, sp)) + list(np.arange(0.90, L - 0.0006, 0.0012))
    s = sorted(set([round(v, 6) for v in s] + [round(v, 6) for v in m.STRIPS[1:-1]]))
    return np.array(s, np.float64)


def baby_offset(s, th, Pu, N):
    """a baby's rattle is a single button: the segments behind the first are squeezed into it"""
    sb = R0 + RP
    k = s > sb
    s2 = np.where(k, sb + (s - sb) * 0.16, s).astype(F)
    off = M.surface(s2, th) - M.surface(s.astype(F), th)
    # the button's end rounded off (the closing sections of the tip, not the rattle's last lobe)
    return np.where(k[:, None], off, 0).astype(F)


SK.make(globals(), M, KS, tex_rings=rings, eye_dir=(0.8, 0.36, 0.48), baby_offset=baby_offset)
K = {k: SK.hexc(v) for k, v in dict(ground=0x786C5A, groundLt=0x8E826C, dia=0x46362A, diaLt=0x62523F, diaEdge=0x241C16, cream=0xDED4BA,
                                   belly=0xDCD4BC, black=0x1A1816, white=0xE4E0D4, rattle=0xC4A67C, rattleDk=0x6E5638, head=0x857860,
                                   stripe=0x3C3028, gap=0x0E0D0A, pit=0x1A1612).items()}
DS = 0.034                                 # diamond spacing along the back (garter units)


def paint(P, N, c):
    Pu, s, th = c['Pu'], c['s'], c['th']
    H, E, CS, CT, bel, head, lips, lipU, seam = M.scales(Pu, N, c)
    n = len(s)
    jit = _hash(np.round(CS * 5000).astype(np.int64), np.round(CT * 300).astype(np.int64), np.zeros(n, np.int64), 81)
    r = M.sect(CS)[2]
    col = SK.mix(np.tile(K['ground'], (n, 1)), K['groundLt'], 0.4 * (fbm(Pu * 90, 2, 82) - 0.35))
    col *= (0.86 + 0.26 * jit)[:, None]
    # the diamonds, scale by scale: dark brown, a paler middle, a blackish rim inside a cream edge
    k = np.clip(np.round((CS - 0.1) / DS), 0, 21)
    sk = 0.1 + k * DS
    arc = np.abs(CT) * r
    dm = np.abs(CS - sk) / (0.5 * DS) + arc / (1.3 * r)
    tailf = sstep(0.82, 0.74, s)                                # they fade into bands on the back of the tail
    on = sstep(0.075, 0.1, s) * (CS < 0.845)
    dia = SK.mix(np.tile(K['dia'], (n, 1)), K['diaLt'], sstep(0.4, 0.15, dm) * 0.35)
    dia = SK.mix(dia, K['diaEdge'], sstep(0.62, 0.8, dm) * 0.8)
    col = SK.mix(col, dia, sstep(0.86, 0.8, dm) * on * (0.6 + 0.4 * tailf))
    col = SK.mix(col, K['cream'], sstep(0.84, 0.9, dm) * sstep(1.12, 1.04, dm) * on * tailf * 0.9)
    # small dark blotches low on the sides between the diamonds
    dl = np.abs(fract(CS / DS - 0.6) - 0.5) / 0.2 + np.abs(CT - 1.75) / 0.25
    col = SK.mix(col, K['dia'], sstep(1.0, 0.8, dl) * on * 0.7)
    # tail: black and white rings, then the rattle
    tr = sstep(0.848, 0.852, s) * (s < R0)
    ring = (np.floor((s - 0.85) / 0.0076) % 2) == 1
    col = SK.mix(col, np.where(ring[:, None], K['black'], K['white']), tr * 0.95)
    rt = s >= R0 - 0.0004
    a = (s - R0) / RP
    f = a - np.floor(a)
    rc = SK.mix(np.tile(K['rattle'], (n, 1)), K['rattleDk'], np.maximum(sstep(0.12, 0.0, f), sstep(0.88, 1.0, f)) * 0.8 + 0.15 * (fbm(Pu * 900, 2, 83) - 0.5))
    rc *= (0.9 + 0.15 * sstep(0.2, 0.5, f) * sstep(0.8, 0.5, f))[:, None]
    # the skin between the scales: dark lines
    col = col * (0.62 + 0.38 * sstep(0.0, 0.12, E))[:, None] * (1 - head[:, None]) + col * head[:, None]
    # belly: cream, unmarked
    bc = np.tile(K['belly'], (n, 1)) * (0.92 + 0.1 * jit)[:, None] * (0.82 + 0.18 * sstep(0.0, 0.1, E))[:, None]
    col = SK.mix(col, bc, bel * (1 - tr))
    col = np.where(rt[:, None], rc, col)
    # head: gray-brown with dark specks; the dark stripe from the eye back to the corner of the mouth between two pale
    # lines, and a pale line down from in front of the eye to the lip
    mt = M.mouth_th(s)
    hc = np.tile(K['head'], (n, 1)) * (0.9 + 0.14 * fbm(Pu * 700, 2, 84))[:, None]
    e2, cu, cv = SK.small_scales(s, th * M.sect(s)[2], 0.0026, 31)
    hc *= (0.9 + 0.2 * _hash(np.round(cu * 9000).astype(np.int64), np.round(cv * 9000).astype(np.int64), np.zeros(n, np.int64), 85))[:, None]
    hc = SK.mix(hc, K['gap'], sstep(0.0005, 0.0, seam) * 0.5)
    u = np.clip((s - M.EYE_S) / (0.047 - M.EYE_S), 0, 1)
    thc = M.EYE_TH + 0.1 + u * (mt - M.EYE_TH - 0.1)
    post = (s > M.EYE_S - 0.002) & (s < 0.049)
    hc = SK.mix(hc, K['stripe'], sstep(0.17, 0.1, np.abs(th - thc)) * post * 0.9)
    hc = SK.mix(hc, K['cream'], sstep(0.05, 0.02, np.abs(th - (thc - 0.19))) * post * 0.7)
    hc = SK.mix(hc, K['cream'], sstep(0.05, 0.02, np.abs(th - (thc + 0.19))) * post * 0.6)
    thp = M.EYE_TH - 0.05 + (M.EYE_S - 0.004 - s) / 0.012 * (mt - M.EYE_TH)
    hc = SK.mix(hc, K['cream'], sstep(0.05, 0.02, np.abs(th - thp)) * (s > 0.011) * (s < M.EYE_S - 0.003) * 0.65)
    hc = SK.mix(hc, K['cream'], sstep(mt - 0.12, mt + 0.02, th) * 0.85)
    col = SK.mix(col, hc, head)
    # mouth line, nostril, heat pit, eye socket: dark
    col = SK.mix(col, K['gap'], np.exp(-((th - mt) / 0.035) ** 2) * sstep(0.046, 0.042, s) * sstep(0.0008, 0.002, s) * 0.7)
    rn = np.sqrt((s - M.NOS_S) ** 2 + ((th - M.NOS_TH) * 0.006) ** 2)
    col = SK.mix(col, K['gap'], sstep(0.0008, 0.0004, rn))
    rp = np.sqrt((s - 0.0142) ** 2 + ((th - 1.24) * 0.008) ** 2)
    col = SK.mix(col, K['pit'], sstep(0.0011, 0.0005, rp))
    re = np.sqrt((s - M.EYE_S) ** 2 + ((th - M.EYE_TH) * 0.0105) ** 2)
    col = SK.mix(col, K['gap'], sstep(M.EYE_R * 1.02, M.EYE_R * 0.9, re))
    rough = 0.45 + 0.12 * (1 - sstep(0.0, 0.15, E)) + 0.06 * bel - 0.08 * head
    rough = np.where(rt, 0.4, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def fract(x):
    return x - np.floor(x)


def detail(P, N, c):
    Pu, s = c['Pu'], c['s']
    h = M.scales(Pu, N, c)[0]
    # the rattle's segments are smooth keratin with fine growth lines
    rt = s >= R0 - 0.0004
    h = np.where(rt, 0.00002 * np.sin((s - R0) / RP * np.pi * 10), h)
    return (h * KS).astype(F)


MAP_QUALITY = (72, 66)


def meta(st):
    return SK.meta_scaled(M, KS, {'iris': 0x9A8452, 'pupil': 'v', 'pupilR': 0.5, 'lidCol': 0x857860}, {'flat': 0x8C806A})
