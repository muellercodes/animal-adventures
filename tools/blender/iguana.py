# Green iguana (round 11): an adult green iguana (Iguana iguana), 1.5 m from the snout to the tail tip, on the lizard
# template (lizkit.py): laid out in base units and scaled by KS = 3. A body a little flattened from side to side on
# long legs with long toes, a deep head with a blunt rounded snout and full jowls, the big round subtympanic shield
# below the ear drum, a dewlap hanging under the throat with small spines along its front edge, a crest of blade
# spines from the nape down the back onto the tail (tallest over the neck), and a long whip tail (two thirds of the
# animal). Bright green, the head paler and grayer, faint darker bars down the flanks, broad dark bands on the tail.
# The hatchling has its own color map (a brighter, more even green).
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, ellipsoid, round_cone, fbm, _hash
import lizkit as LK

M = LK.load('iguana')
KS = 3.0

M.BOUNDS = (V(-0.074, -0.001, -0.389), V(0.074, 0.06, 0.12))
M.BODY = [
    (-0.3850, 0.0068, 0.0064, 0.0060, 0.0005, 2.0, 2.0),
    (-0.3700, 0.0075, 0.0067, 0.0059, 0.0010, 2.0, 2.0),
    (-0.3300, 0.0094, 0.0078, 0.0062, 0.0017, 2.1, 2.0),
    (-0.2800, 0.0120, 0.0094, 0.0068, 0.0026, 2.1, 2.0),
    (-0.2300, 0.0152, 0.0115, 0.0078, 0.0037, 2.1, 2.0),
    (-0.1800, 0.0190, 0.0142, 0.0094, 0.0051, 2.1, 2.0),
    (-0.1300, 0.0232, 0.0172, 0.0112, 0.0068, 2.1, 2.0),
    (-0.0900, 0.0272, 0.0200, 0.0128, 0.0088, 2.1, 2.0),
    (-0.0600, 0.0310, 0.0222, 0.0138, 0.0110, 2.2, 2.0),
    (-0.0400, 0.0350, 0.0238, 0.0142, 0.0134, 2.2, 2.0),
    (-0.0200, 0.0398, 0.0254, 0.0140, 0.0164, 2.2, 2.1),
    (0.0050, 0.0438, 0.0266, 0.0136, 0.0184, 2.2, 2.1),
    (0.0280, 0.0450, 0.0276, 0.0142, 0.0180, 2.2, 2.1),
    (0.0450, 0.0448, 0.0288, 0.0160, 0.0156, 2.2, 2.1),
    (0.0600, 0.0450, 0.0302, 0.0180, 0.0130, 2.2, 2.1),
    (0.0720, 0.0460, 0.0316, 0.0194, 0.0130, 2.3, 2.1),
    (0.0820, 0.0474, 0.0328, 0.0204, 0.0134, 2.3, 2.2),
    (0.0910, 0.0480, 0.0338, 0.0222, 0.0118, 2.4, 2.2),
    (0.0990, 0.0472, 0.0346, 0.0240, 0.0100, 2.4, 2.2),
    (0.1060, 0.0458, 0.0348, 0.0256, 0.0084, 2.3, 2.2),
    (0.1110, 0.0442, 0.0348, 0.0270, 0.0070, 2.3, 2.2),
    (0.1145, 0.0424, 0.0346, 0.0282, 0.0054, 2.2, 2.1),
    (0.1170, 0.0404, 0.0342, 0.0292, 0.0032, 2.0, 2.0),
]
M.TAIL_TIP = V(0, 0.0064, -0.389)
M.Z_HEAD, M.Z_TAIL = 0.078, -0.05
M.UV_Z = [-0.15, -0.27]
M.HEAD_BOX = (V(-0.03, 0.012, 0.07), V(0.03, 0.06, 0.12))
M.LEG_BOX = (V(-0.07, -0.002, -0.06), V(0.07, 0.045, 0.07))
M.FOOT_BOX = (V(-0.074, -0.002, -0.06), V(0.074, 0.01, 0.08))

M.EYE_R, M.EYE_DIR = 0.0027, V(0.92, 0.26, 0.26)
M.setup()
M.EYE_C = M.seat_eye(0.0408, 0.1005, 0.0005)
M.LID_W, M.LID_H, M.LID_OFF = 0.0024, 0.0019, -0.0001
M.LIDS = (0.0012, 0.0009, 0.0003)
M.NOSTRIL = V(0.0042, 0.0380, 0.1120)
M.NOSTRIL_R = (V(0.0014, 0.0014, 0.0016), V(0.0008, 0.0008, 0.0008))
M.EAR = V(0.0138, 0.0372, 0.0845)
M.EAR_R = V(0.0009, 0.0026, 0.0019)
M.MOUTH = V(0.0, 0.0310, 0.1155)
M.MOUTH_LINE = [V(0.0, 0.0306, 0.1180), V(0.0034, 0.0308, 0.1158), V(0.0074, 0.0314, 0.1020), V(0.0106, 0.0328, 0.0880)]
M.MOUTH_R = [0.00045, 0.00045, 0.0004, 0.0002]
M.SNOUT = (V(0.0, 0.0352, 0.1128), V(0.0048, 0.0054, 0.0046), 0.0024)
M.HEAD_BLOBS = [
    (V(0.0112, 0.0310, 0.0855), V(0.0050, 0.0072, 0.0082), 0.004),     # the jowls
    (V(0.0082, 0.0440, 0.0990), V(0.0032, 0.0014, 0.0060), 0.0025),    # brow over the eye
]
M.MANDIBLE = (V(0.0100, 0.0262, 0.088), V(0.0036, 0.0290, 0.1155), 0.0034, 0.0020, 0.0025)
M.BLOBS = [
    (V(0.010, 0.0295, 0.046), V(0.0070, 0.0068, 0.0080), 0.005),       # shoulder girdle
    (V(0.009, 0.0285, -0.032), V(0.0080, 0.0072, 0.0090), 0.005),      # pelvic girdle
]

SH, EL, WR = V(0.008, 0.029, 0.047), V(0.031, 0.032, 0.046), V(0.037, 0.0055, 0.054)
HP, KN, AN = V(0.007, 0.028, -0.032), V(0.037, 0.033, -0.030), V(0.046, 0.0055, -0.042)
M.HAND, M.FOOT = V(0.039, 0.0025, 0.0605), V(0.049, 0.0025, -0.032)
M.FLEG = [
    ('chain', [SH, V(0.020, 0.0315, 0.0465), EL], [0.0068, 0.0058, 0.0048], 0.0015, 0.0),
    ('chain', [EL, V(0.035, 0.019, 0.050), WR], [0.0050, 0.0042, 0.0034], 0.001, 0.001),
    ('ball', EL + V(0.0004, 0, -0.0004), V(0.0041, 0.0040, 0.0039), 0.001),
    ('pad', M.HAND + V(0.0, 0.0002, -0.0004), (0.0034, 0.0016, 0.0042), 0.002, None, 0.0012),
]
M.HLEG = [
    ('chain', [HP, V(0.022, 0.031, -0.031), KN], [0.0086, 0.0068, 0.0052], 0.002, 0.0),
    ('ball', V(0.018, 0.0292, -0.0335), V(0.0090, 0.0068, 0.0084), 0.003),       # the thigh
    ('chain', [KN, V(0.042, 0.019, -0.036), AN], [0.0053, 0.0044, 0.0035], 0.001, 0.001),
    ('ball', KN + V(0.0004, 0, -0.0004), V(0.0045, 0.0042, 0.0042), 0.001),
    ('pad', M.FOOT + V(-0.0005, 0.0002, -0.0030), (0.0034, 0.0016, 0.0060), 0.002, nrm([0.25, 0, 1]), 0.0014),
]
M.LEG_K = (0.0025, 0.003)
M.F_TOES = [(-36, 0.0078, 0.0016), (-10, 0.0108, 0.0021), (12, 0.0126, 0.0023), (34, 0.0118, 0.0021), (68, 0.0074, 0.0017)]
M.H_TOES = [(-20, 0.0082, 0.0018), (2, 0.0125, 0.0023), (20, 0.0170, 0.0025), (38, 0.0222, 0.0023), (95, 0.0112, 0.0036)]
M.TOE_R = (0.00105, 0.00112)
M.CLAW = 1.25
M.HIND5 = V(0.0030, 0.0002, -0.0042)
M.TOE_K = 0.001


# ---------- the crest, the dewlap, the shield ----------
CREST_Z = [-0.27, -0.18, -0.1, -0.04, 0.0, 0.03, 0.05, 0.062, 0.071, 0.077]
CREST_H = [0.0, 0.0012, 0.0024, 0.0034, 0.0040, 0.0054, 0.0078, 0.0092, 0.0070, 0.0026]


def crest(P):
    M.setup()
    return M.crest(M.mirror(P), CREST_Z, CREST_H, 0.0036, 0.0013, lean=0.55, sink=0.0012)


# the dewlap's lower edge (z, y) and where it joins the throat
DEW = [(0.038, 0.0165), (0.048, 0.0104), (0.060, 0.0058), (0.072, 0.0038), (0.083, 0.0050), (0.093, 0.0098), (0.101, 0.0164), (0.107, 0.0236), (0.1095, 0.0262)]


def dewlap(P):
    Q = M.mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    zs, ys = np.array([d[0] for d in DEW]), np.array([d[1] for d in DEW])
    ye = np.interp(z, zs, ys).astype(F)
    # a thin plate in the middle plane, thicker where it hangs from the throat, its lower edge rounded
    th = 0.0005 + 0.0006 * np.clip((y - ye) / 0.008, 0, 1)
    d = np.maximum(np.maximum(x - th, ye - y), np.maximum(z - 0.109, 0.039 - z))
    d = np.maximum(d, y - 0.03)
    # small spines along its front edge (from the chin down to its deepest point)
    sp = []
    for t in np.linspace(0.08, 0.92, 7):
        zz = 0.108 - t * 0.034
        ye0 = float(np.interp(zz, zs, ys))
        b = V(0.0, ye0 + 0.0006, zz)
        sp.append((b, b + V(0.0, -0.0016, 0.0012 + 0.0008 * (1 - t)), 0.0007, 0.0002))
    return smin(d, M.cones(Q, sp), 0.0004)


SHIELD = (V(0.0125, 0.0306, 0.0858), 0.0042)


def shield(P):
    """the subtympanic shield: a big round, slightly domed scale on the jowl below the ear drum"""
    Q = M.mirror(P)
    c, r = SHIELD
    n = nrm([1.0, -0.15, -0.1])
    D = Q - c
    h = D @ n
    rad = np.linalg.norm(D - np.outer(h, n), axis=1)
    dome = 0.0010 * np.sqrt(np.clip(1 - (rad / r) ** 2, 0, 1))
    return np.maximum(rad - r, h - dome - 0.0004) * 0.8


M.EXTRAS = [('crest', crest, 0.0008, None), ('dewlap', dewlap, 0.0016, (V(-0.006, 0.0, 0.035), V(0.006, 0.032, 0.115))),
            ('shield', shield, 0.0006, (V(0.004, 0.022, 0.078), V(0.024, 0.04, 0.094)))]
M.BODY_EXTRAS = ('crest', 'dewlap')

M.PATCHES = [
    (V(0.004, 0.036, 0.094), V(0.0155, 0.0485, 0.1075), 0.00013),     # eye and lids
    (V(0.0, 0.027, 0.106), V(0.009, 0.044, 0.121), 0.00016),          # snout tip, nostril, lips
    (V(0.007, 0.024, 0.078), V(0.0185, 0.0415, 0.0925), 0.00016),     # the ear drum and the shield
    (V(0.030, -0.001, 0.050), V(0.056, 0.008, 0.078), 0.00015),       # front foot
    (V(0.036, -0.001, -0.048), V(0.074, 0.008, -0.012), 0.00016),     # hind foot
]
M.SC = dict(body=0.0011, leg=0.0009, head=0.0017, ring=0.0019, belly=0.0015, lip=0.0021)
M.GRAN_H = 0.16
M.TAIL_KEEL = 0.05
M.UV_HEAD = 1.6
M.KEEP_FLOOR = 0.3
M.BODY_REACH = 0.05
M.LEG_REACH = 0.009
M.BEND_PITCH = (0.011, 0.0036)
M.BAKE_CAGE = (0.0012, 0.004)
M.AO_DIST = 0.016


def keep_extra(P):
    Pm = M.mirror(P)
    cr = crest(P)
    k = sstep(0.001, 0.0, cr) * 0.36
    dw = M.local(P, V(-0.006, 0.0, 0.035), V(0.006, 0.032, 0.115), dewlap)
    k = np.maximum(k, sstep(0.0008, 0.0, dw) * sstep(0.022, 0.016, Pm[:, 1]) * 0.3)
    sh = np.linalg.norm(Pm - SHIELD[0], axis=1)
    k = np.maximum(k, sstep(SHIELD[1] * 1.3, SHIELD[1] * 0.8, sh) * 0.3)
    return k


M.keep_extra = keep_extra


def regions_extra(r, P, N, c):
    Pm = r['Pm']
    r['crest'] = sstep(0.0004, 0.0, c['crest']) * sstep(-0.0002, 0.0004, c['body'] - c['crest'])
    r['dewlap'] = sstep(0.0004, 0.0, c['dewlap']) * sstep(0.0002, 0.0012, c['body'] - c['dewlap'])
    D = Pm - SHIELD[0]
    n = nrm([1.0, -0.15, -0.1])
    rad = np.linalg.norm(D - np.outer(D @ n, n), axis=1)
    r['shieldR'] = rad / SHIELD[1]
    r['shield'] = sstep(1.08, 0.96, r['shieldR']) * sstep(-0.002, 0.0, D @ n)
    # the belly region must not take the dewlap
    r['belly'] = r['belly'] * (1 - r['dewlap'])
    return r


M.regions_extra = regions_extra


def scales_extra(H, E, C, R, P, N, c):
    k = np.maximum(R['crest'], R['shield'])
    H = H * (1 - k)
    # the shield: one smooth plate with a rim
    H += R['shield'] * 0.0004 * sstep(1.0, 0.85, R['shieldR'])
    E = np.where(R['shield'] > 0.5, 0.5 * sstep(1.0, 0.85, R['shieldR']), E)
    # the crest: each spine one color (its own center)
    return H, E, C


M.scales_extra = scales_extra

# ---------- paint ----------
K = {
    'green': M.hexc(0x4C7430), 'greenLt': M.hexc(0x729A48), 'greenDk': M.hexc(0x2E461C), 'head': M.hexc(0x6A8A58), 'jowl': M.hexc(0x8EA27A),
    'belly': M.hexc(0x9EB46A), 'band': M.hexc(0x262A18), 'shield': M.hexc(0x9EAE88), 'shieldRim': M.hexc(0x50603E), 'crest': M.hexc(0x86A050),
    'claw': M.hexc(0x3A3628), 'ball': M.hexc(0x141010), 'lip': M.hexc(0xA8B88A), 'dewlap': M.hexc(0x6A9038),
}


def _bands(C, R, z):
    """broad dark bands around the tail (about 9 of them, wider toward the tip), faint bars down the flanks"""
    n1 = fbm(C * 90, 2, 51) - 0.5
    zt = -z - 0.06
    ph = zt / (0.034 + 0.012 * np.clip(zt / 0.3, 0, 1))
    band = sstep(0.24, 0.12, np.abs(ph - np.floor(ph) - 0.5) - 0.12 + n1 * 0.12) * R['tail'] * sstep(-0.075, -0.1, z)
    # flanks: vertical bars, faint
    zb = (z + 0.01) / 0.022
    bar = sstep(0.18, 0.08, np.abs(zb - np.floor(zb) - 0.5) - 0.14 + n1 * 0.3) * sstep(0.35, 0.6, fbm(C * 40, 2, 56)) * sstep(-0.04, -0.02, z) * sstep(0.06, 0.04, z) * (1 - R['belly']) * (1 - R['leg'])
    return band, bar


def paint(P, N, c):
    H, E, C, R = M.scales(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    j = M.jit(C)
    n2 = fbm(Pm * 30, 3, 52)
    col = M.mix(M.tile(K['green'], n), K['greenLt'], 0.2 * j + 0.25 * n2 + 0.2 * sstep(0.0, -0.6, Nm[:, 1]))
    col = M.mix(col, K['greenDk'], R['top'] * 0.25 * (1 - R['head']))
    # the head grayer and paler, the jowls paler still
    col = M.mix(col, K['head'], R['head'] * 0.75)
    col = M.mix(col, K['jowl'], R['head'] * sstep(0.036, 0.03, y) * sstep(0.072, 0.08, z) * 0.55)
    band, bar = _bands(C, R, z)
    col = M.mix(col, K['band'], band * 0.9 + bar * 0.2)
    # belly and the underside of the tail paler, yellow-green
    col = M.mix(col, K['belly'], R['belly'] * 0.85 * (1 - band * 0.5))
    # the dewlap: green with a paler edge
    col = M.mix(col, K['dewlap'], R['dewlap'] * 0.8)
    col = M.mix(col, K['jowl'], R['dewlap'] * sstep(0.004, 0.0, y - np.interp(z, [d[0] for d in DEW], [d[1] for d in DEW])) * 0.5)
    # the crest spines: green, paler toward their tips, a few dark ones
    tip = sstep(0.0, 0.004, c['body'] - c['crest'])
    cj = M.jit(np.round(C * 270) / 270, 53)
    col = M.mix(col, M.mix(M.tile(K['crest'], n), K['greenDk'], (cj < 0.25) * 0.7), R['crest'] * (0.5 + 0.4 * tip))
    # the shield: a pale plate with a dark rim
    col = M.mix(col, K['shield'], R['shield'] * sstep(1.0, 0.85, R['shieldR']))
    col = M.mix(col, K['shieldRim'], R['shield'] * sstep(0.85, 1.0, R['shieldR']) * 0.6)
    col = M.mix(col, K['lip'], R['lip'] * 0.5)
    # the parietal eye: a small pale spot on top of the head
    pe = np.linalg.norm((Pm - V(0.0, 0.0480, 0.0915)) / V(0.0008, 0.002, 0.0008), axis=1)
    col = M.mix(col, K['shield'], sstep(1.2, 0.8, pe) * 0.7)
    col = col * (0.74 + 0.26 * sstep(0.0, 0.22, E))[:, None]
    col *= (0.96 + 0.07 * fbm(Pm * 60, 2, 54))[:, None]
    col = M.mix(col, K['claw'], R['claw'])
    col = M.mix(col, K['ball'], R['ball'])
    col = M.openings(col, R)
    # the ear drum: a flush gray-green membrane, not a hole
    ed = np.linalg.norm((Pm - M.EAR - V(M.EAR_R[0] * 0.7, 0, 0)) / M.EAR_R, axis=1)
    col = M.mix(col, M.hexc(0x6E7E5E), sstep(1.3, 0.9, ed) * 0.9)
    col = M.mix(col, M.hexc(0x3A4430), sstep(0.9, 1.25, ed) * sstep(1.45, 1.25, ed) * 0.6)
    rough = 0.55 + 0.12 * (1 - sstep(0.0, 0.2, E)) + 0.05 * R['belly'] - 0.15 * R['claw'] - 0.3 * R['ball'] - 0.12 * R['shield']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


KB = {'green': M.hexc(0x5E9A26), 'greenLt': M.hexc(0x86C03A), 'head': M.hexc(0x76A84A), 'belly': M.hexc(0xA8CC6A), 'band': M.hexc(0x3A4A20), 'blue': M.hexc(0x5E8E6A)}
M.BABY_MAP = (320, 56)


def paint_baby(P, N, c):
    """the hatchling: a bright even green, the tail bands faint, a bluish wash over the shoulders"""
    H, E, C, R = M.scales(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    j = M.jit(C, 55)
    col = M.mix(M.tile(KB['green'], n), KB['greenLt'], 0.2 * j + 0.25 * sstep(0.0, -0.6, Nm[:, 1]))
    col = M.mix(col, KB['head'], R['head'] * 0.5)
    col = M.mix(col, KB['blue'], sstep(0.06, 0.045, np.abs(z - 0.04)) * (1 - R['belly']) * (1 - R['head']) * 0.35)
    band, bar = _bands(C, R, z)
    col = M.mix(col, KB['band'], band * 0.55 + bar * 0.4)
    col = M.mix(col, KB['belly'], R['belly'] * 0.8)
    col = M.mix(col, K['shield'], R['shield'] * sstep(1.0, 0.85, R['shieldR']) * 0.6)
    col = col * (0.76 + 0.24 * sstep(0.0, 0.22, E))[:, None]
    col = M.mix(col, K['claw'], R['claw'])
    col = M.mix(col, K['ball'], R['ball'])
    col = M.openings(col, R)
    return np.clip(col, 0, 1).astype(F), np.full(n, 0.55, F)




def baby_offset(P, N, c):
    """the hatchling's own shape change: a small dewlap (pulled up toward the throat) and a low crest"""
    Pm = M.mirror(P)
    y, z = Pm[:, 1], Pm[:, 2]
    out = np.zeros_like(P)
    on_dew = sstep(0.0006, 0.0, c['dewlap']) * sstep(0.0, 0.0008, c['body'] - c['dewlap'])
    yb = M.iz(z, 3) + 0.001
    out[:, 1] += on_dew * np.maximum(yb - y, 0) * 0.7
    on_cr = sstep(0.0006, 0.0, c['crest']) * sstep(-0.0003, 0.0006, c['body'] - c['crest'])
    out[:, 1] -= on_cr * np.maximum(y - M.iz(z, 1), 0) * 0.55
    return out.astype(F)


M.baby_offset = baby_offset
M.paint = paint
M.paint_baby = paint_baby
M.MAP_QUALITY = (50, 32)
M.EYE_META = dict(iris=0xB07A2A, irisR=0.9, pupilR=0.38, rim=0x3A2410, babyIris=0x9A7A30)
M.TINT = dict(tint=[1.0, 1.0, 1.0], babyTint=[1.0, 1.0, 1.0], rim=[0.03, 0.05, 0.02], flat=0x4E7A28)
M.PREVIEW = {
    'side': ((0.85, 0.1, -0.13), (0, 0.03, -0.13), 30),
    'front3q': ((0.32, 0.22, 0.4), (0, 0.03, 0.0), 30),
    'head3q': ((0.1, 0.07, 0.2), (0, 0.035, 0.09), 26),
    'top': ((0.001, 0.95, -0.13), (0, 0.03, -0.13), 30),
    'front': ((0.0, 0.06, 0.38), (0, 0.035, 0.07), 26),
}
LK.install(globals(), M, KS)
