# Komodo dragon (round 11): an adult Komodo dragon (Varanus komodoensis), 2.8 m from the snout to the tail tip, on the
# lizard template (lizkit.py), laid out in base units and scaled by KS = 5.6. A monitor like the game's lace monitor
# (lizard.py) but heavy: a deep broad body on thick upright legs with big curved claws, a long thick neck with loose
# skin folds and a full throat, a long flat head with a rounded snout, small eyes under a brow, slit nostrils near the
# tip, the long jaw line, a long muscular tail flattened from side to side. Dull gray-brown with paler and darker
# mottling, the head grayer. The hatchling has its own color map (bright yellow bands across a black body) and the
# game makes it slimmer and much smaller (size.baby in its spec).
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, ellipsoid, round_cone, fbm, _hash
import lizkit as LK

M = LK.load('komodo')
KS = 5.6

M.BOUNDS = (V(-0.1, -0.001, -0.289), V(0.1, 0.097, 0.222))
_rows = [
    (-0.285, 0.0240, 0.0225, 0.0210, 0.0009, 2.0, 2.0),
    (-0.270, 0.0270, 0.0240, 0.0205, 0.0023, 2.0, 2.0),
    (-0.240, 0.0330, 0.0275, 0.0210, 0.0045, 2.1, 2.0),
    (-0.200, 0.0410, 0.0320, 0.0225, 0.0070, 2.1, 2.0),
    (-0.160, 0.0490, 0.0365, 0.0240, 0.0094, 2.1, 2.0),
    (-0.120, 0.0570, 0.0410, 0.0258, 0.0122, 2.2, 2.0),
    (-0.085, 0.0650, 0.0455, 0.0270, 0.0160, 2.2, 2.0),
    (-0.060, 0.0720, 0.0490, 0.0280, 0.0215, 2.3, 2.1),
    (-0.035, 0.0790, 0.0530, 0.0285, 0.0285, 2.4, 2.2),
    (0.000, 0.0850, 0.0560, 0.0285, 0.0335, 2.5, 2.2),
    (0.035, 0.0870, 0.0580, 0.0295, 0.0340, 2.5, 2.2),
    (0.070, 0.0850, 0.0600, 0.0320, 0.0310, 2.4, 2.2),
    (0.095, 0.0820, 0.0615, 0.0355, 0.0260, 2.3, 2.1),
    (0.115, 0.0785, 0.0620, 0.0410, 0.0210, 2.2, 2.1),
    (0.135, 0.0775, 0.0625, 0.0450, 0.0192, 2.2, 2.1),
    (0.155, 0.0780, 0.0630, 0.0480, 0.0196, 2.3, 2.1),
    (0.170, 0.0782, 0.0635, 0.0496, 0.0186, 2.4, 2.2),
    (0.185, 0.0768, 0.0636, 0.0510, 0.0160, 2.5, 2.2),
    (0.197, 0.0738, 0.0632, 0.0526, 0.0140, 2.5, 2.2),
    (0.207, 0.0708, 0.0626, 0.0540, 0.0122, 2.4, 2.2),
    (0.213, 0.0682, 0.0620, 0.0552, 0.0098, 2.3, 2.1),
    (0.2175, 0.0652, 0.0614, 0.0566, 0.0060, 2.1, 2.0),
]
M.BODY = _rows
M.TAIL_TIP = V(0, 0.0225, -0.289)
M.Z_HEAD, M.Z_TAIL = 0.164, -0.062
M.UV_Z = [-0.17]
M.HEAD_BOX = (V(-0.04, 0.03, 0.15), V(0.04, 0.095, 0.222))
M.LEG_BOX = (V(-0.1, -0.002, -0.08), V(0.1, 0.085, 0.135))
M.FOOT_BOX = (V(-0.1, -0.002, -0.08), V(0.1, 0.018, 0.145))

M.EYE_R, M.EYE_DIR = 0.0021, V(0.94, 0.22, 0.26)
M.LID_W, M.LID_H, M.LID_OFF = 0.0019, 0.0014, -0.0001
M.LIDS = (0.0012, 0.0009, 0.0003)
M.setup()
M.EYE_C = M.seat_eye(0.0712, 0.1885, 0.0003)
M.NOSTRIL = V(0.0074, 0.0690, 0.2102)
M.NOSTRIL_R = (V(0.0009, 0.0007, 0.0014), V(0.0007, 0.0004, 0.0013))
M.EAR = V(0.0190, 0.0668, 0.1660)
M.EAR_R = V(0.0012, 0.0024, 0.0016)
M.MOUTH = V(0.0, 0.0600, 0.2150)
M.MOUTH_LINE = [V(0.0, 0.0596, 0.2190), V(0.0074, 0.0600, 0.2140), V(0.0146, 0.0610, 0.1950), V(0.0186, 0.0626, 0.1720)]
M.MOUTH_R = [0.0006, 0.0006, 0.00055, 0.0003]
M.MOUTH_DEPTH = 0.0005
M.SNOUT = (V(0.0, 0.0618, 0.2125), V(0.0098, 0.0052, 0.0060), 0.004)
M.HEAD_BLOBS = [
    (V(0.0170, 0.0600, 0.1640), V(0.0075, 0.0082, 0.0120), 0.005),     # jaw muscles
    (V(0.0115, 0.0738, 0.1880), V(0.0040, 0.0013, 0.0080), 0.005),     # brow over the eye
]
M.MANDIBLE = (V(0.0168, 0.0540, 0.170), V(0.0060, 0.0582, 0.2140), 0.0068, 0.0040, 0.004)
M.BLOBS = [
    (V(0.024, 0.0570, 0.094), V(0.0150, 0.0150, 0.0170), 0.009),       # shoulder girdle
    (V(0.022, 0.0550, -0.040), V(0.0160, 0.0160, 0.0190), 0.009),      # pelvic girdle
    (V(0.0, 0.0470, 0.1340), V(0.0170, 0.0090, 0.0300), 0.008),        # the full throat
]

SH, EL, WR = V(0.022, 0.058, 0.095), V(0.056, 0.058, 0.090), V(0.062, 0.011, 0.106)
HP, KN, AN = V(0.020, 0.056, -0.040), V(0.060, 0.060, -0.036), V(0.069, 0.011, -0.055)
M.HAND, M.FOOT = V(0.064, 0.005, 0.116), V(0.071, 0.005, -0.044)
M.FLEG = [
    ('chain', [SH, V(0.040, 0.0600, 0.094), EL], [0.0160, 0.0132, 0.0110], 0.004, 0.0),
    ('chain', [EL, V(0.060, 0.035, 0.098), WR], [0.0118, 0.0100, 0.0084], 0.003, 0.003),
    ('ball', EL + V(0.001, 0.0, -0.001), V(0.0098, 0.0094, 0.0092), 0.003),
    ('pad', M.HAND + V(0.0, 0.0004, -0.001), (0.0088, 0.0042, 0.0095), 0.005, None, 0.004),
]
M.HLEG = [
    ('chain', [HP, V(0.042, 0.0600, -0.038), KN], [0.0200, 0.0160, 0.0126], 0.005, 0.0),
    ('ball', V(0.036, 0.0550, -0.0425), V(0.0200, 0.0165, 0.0195), 0.007),       # the thigh
    ('chain', [KN, V(0.066, 0.035, -0.046), AN], [0.0128, 0.0106, 0.0090], 0.003, 0.003),
    ('ball', KN + V(0.001, 0.0, -0.001), V(0.0108, 0.0100, 0.0100), 0.003),
    ('pad', M.FOOT + V(-0.001, 0.0004, -0.007), (0.0088, 0.0042, 0.0140), 0.005, nrm([0.25, 0, 1]), 0.004),
]
M.LEG_K = (0.006, 0.007)
M.F_TOES = [(-34, 0.0120, 0.0030), (-10, 0.0160, 0.0038), (12, 0.0180, 0.0040), (34, 0.0170, 0.0038), (64, 0.0110, 0.0032)]
M.H_TOES = [(-18, 0.0130, 0.0032), (4, 0.0190, 0.0040), (22, 0.0240, 0.0042), (40, 0.0260, 0.0038), (95, 0.0160, 0.0060)]
M.TOE_R = (0.0024, 0.0026)
M.CLAW = 1.2
M.HIND5 = V(0.0060, 0.0003, -0.0080)
M.TOE_K = 0.002


def folds(Q, d):
    """loose skin on the neck: soft folds across its sides and the throat"""
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    zf = (z - 0.106 + 0.003 * np.sin(y * 260)) / 0.0105
    fold = np.exp(-((zf - np.round(zf)) / 0.2) ** 2) * sstep(0.1, 0.114, z) * sstep(0.162, 0.148, z) * sstep(0.012, 0.018, x) * sstep(0.074, 0.062, y)
    return d - 0.00045 * fold


M.body_extra = folds

M.PATCHES = [
    (V(0.008, 0.066, 0.181), V(0.021, 0.0785, 0.196), 0.00018),     # eye and lids
    (V(0.0, 0.054, 0.203), V(0.017, 0.074, 0.221), 0.00022),        # snout tip, nostril, lips
    (V(0.012, 0.058, 0.158), V(0.024, 0.074, 0.174), 0.00022),      # ear
    (V(0.044, -0.001, 0.096), V(0.090, 0.016, 0.142), 0.0003),      # front foot
    (V(0.050, -0.001, -0.068), V(0.100, 0.017, -0.010), 0.0003),    # hind foot
]
M.SC = dict(body=0.0016, leg=0.0013, head=0.0019, ring=0.0025, belly=0.0021, lip=0.0028)
M.GRAN_H = 0.2
M.TAIL_KEEL = 0.07
M.UV_HEAD = 1.5
M.KEEP_FLOOR = 0.3
M.FEET_KEEP = 0.24
M.BODY_REACH = 0.08
M.LEG_REACH = 0.024
M.BEND_PITCH = (0.014, 0.0075)
M.BAKE_CAGE = (0.0016, 0.005)
M.AO_DIST = 0.025
M.SPINE_BLEND = 0.012
M.LEG_BLEND = 0.004

# ---------- paint ----------
K = {
    'base': M.hexc(0x5A5040), 'lt': M.hexc(0x766A56), 'dk': M.hexc(0x3A3329), 'tan': M.hexc(0x8C7A56), 'red': M.hexc(0x6E4A34),
    'head': M.hexc(0x6A6456), 'belly': M.hexc(0x7C7462), 'claw': M.hexc(0x2E2A24), 'clawTip': M.hexc(0x8E8678), 'ball': M.hexc(0x141010),
    'lip': M.hexc(0x857C68),
}


def paint(P, N, c):
    H, E, C, R = M.scales(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    j = M.jit(C)
    n1 = fbm(Pm * 45, 3, 61)
    n2 = fbm(Pm * 12, 2, 62)
    col = M.mix(M.tile(K['base'], n), K['lt'], 0.3 * j + 0.35 * sstep(0.45, 0.75, n1) + 0.2 * sstep(0.2, -0.6, Nm[:, 1]))
    col = M.mix(col, K['dk'], 0.3 * sstep(0.5, 0.25, n1) + 0.2 * R['top'] * (1 - R['head']))
    # old adults: faint reddish-brown and tan mottling, small pale speckles of single scales
    col = M.mix(col, K['red'], sstep(0.55, 0.75, n2) * 0.35 * (1 - R['belly']))
    col = M.mix(col, K['tan'], (j > 0.9) * 0.45 * (1 - R['belly']))
    col = M.mix(col, K['dk'], (j < 0.06) * 0.5)
    # the head grayer, the belly a little paler
    col = M.mix(col, K['head'], R['head'] * 0.6)
    col = M.mix(col, K['belly'], R['belly'] * 0.7)
    col = M.mix(col, K['lip'], R['lip'] * 0.5)
    # the neck folds: darker in the creases
    zf = (z - 0.106 + 0.003 * np.sin(y * 260)) / 0.0105
    crease = np.exp(-((zf - np.round(zf)) / 0.16) ** 2) * sstep(0.1, 0.114, z) * sstep(0.162, 0.148, z) * sstep(0.012, 0.018, x) * sstep(0.074, 0.062, y)
    col = M.mix(col, K['dk'], crease * 0.4)
    col = col * (0.7 + 0.3 * sstep(0.0, 0.22, E))[:, None]
    col *= (0.96 + 0.08 * fbm(Pm * 70, 2, 63))[:, None]
    cc = M.mix(M.tile(K['claw'], n), K['clawTip'], sstep(0.004, 0.0004, y) * 0.5)
    col = M.mix(col, cc, R['claw'])
    col = M.mix(col, K['ball'], R['ball'])
    col = M.openings(col, R)
    rough = 0.66 + 0.12 * (1 - sstep(0.0, 0.2, E)) - 0.2 * R['claw'] - 0.3 * R['ball']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


KB = {'yel': M.hexc(0xD2A83A), 'yelLt': M.hexc(0xE4C25A), 'black': M.hexc(0x1E1B16), 'pink': M.hexc(0xB07446), 'belly': M.hexc(0xD8C690)}
M.BABY_MAP = (256, 58)


def paint_baby(P, N, c):
    """the hatchling: bright yellow bands across a black body and tail, an orange-pink wash on the head and neck,
    black speckles on the yellow and yellow speckles on the black, a pale belly"""
    H, E, C, R = M.scales(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    j = M.jit(C, 64)
    n1 = fbm(C * 60, 2, 65) - 0.5
    # bands: about eleven from the neck to the tail tip, a little wavy; the legs spotted
    zb = (z + 0.29) / 0.042
    band = sstep(0.2, 0.08, np.abs(zb - np.floor(zb) - 0.5) - 0.17 + n1 * 0.25) * sstep(0.15, 0.13, z) * (1 - R['leg'])
    spots = sstep(0.0028, 0.0018, M.cells(C, 0.007, 66)[0]) * R['leg']
    yel = np.clip(band + spots, 0, 1)
    col = M.mix(M.tile(KB['black'], n), M.mix(M.tile(KB['yel'], n), KB['yelLt'], 0.4 * j), yel * sstep(-0.7, -0.2, Nm[:, 1] - 0.0))
    col = M.mix(col, KB['yel'], (j > 0.8) * 0.7 * (1 - yel))
    col = M.mix(col, KB['black'], (j < 0.22) * 0.75 * yel)
    # the head and neck: orange-pink with dark marks
    hm = sstep(0.11, 0.135, z)
    col = M.mix(col, M.mix(M.tile(KB['pink'], n), KB['black'], sstep(0.5, 0.7, fbm(Pm * 50, 2, 67)) * 0.75), hm * 0.75)
    col = M.mix(col, KB['belly'], R['belly'] * 0.8)
    col = col * (0.72 + 0.28 * sstep(0.0, 0.22, E))[:, None]
    col = M.mix(col, K['claw'], R['claw'])
    col = M.mix(col, K['ball'], R['ball'])
    col = M.openings(col, R)
    return np.clip(col, 0, 1).astype(F), np.full(n, 0.6, F)


M.paint = paint
M.paint_baby = paint_baby
M.MAP_QUALITY = (50, 30)
M.EYE_META = dict(iris=0x8A6A30, irisR=0.92, pupilR=0.4, rim=0x2A1E10, babyIris=0x9A7A36)
M.TINT = dict(tint=[1.0, 1.0, 1.0], babyTint=[1.0, 1.0, 1.0], rim=[0.04, 0.035, 0.03], flat=0x5A5040)
M.COLLAR = {'at': ['neck', 'head', 0.25], 'lift': 0.3, 'maxR': 0.05}
M.PREVIEW = {
    'side': ((0.95, 0.15, -0.03), (0, 0.05, -0.03), 30),
    'front3q': ((0.5, 0.32, 0.62), (0, 0.05, 0.03), 30),
    'head3q': ((0.16, 0.12, 0.32), (0, 0.065, 0.18), 26),
    'top': ((0.001, 1.0, -0.03), (0, 0.05, -0.03), 30),
    'front': ((0.0, 0.1, 0.65), (0, 0.06, 0.15), 26),
}
LK.install(globals(), M, KS)
