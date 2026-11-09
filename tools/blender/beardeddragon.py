# Bearded dragon (round 11): a central bearded dragon (Pogona vitticeps), 50 cm from the snout to the tail tip, on the
# lizard template (lizkit.py, in meters here: KS = 1). A wide flat body (about twice as wide as it is deep), a broad
# triangular head with spiky jaw angles and ear tufts, the beard (a full throat pouch with rows of soft spines along
# the jaw and across the throat), a fringe of soft spikes along each flank and spiky scales over the back, stout legs,
# a tail that is broad and flat at its base. Sandy tan to orange with two rows of darker blotches down the back, a
# banded tail and a pale belly. The hatchling has its own color map (paler, the pattern bolder).
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, ellipsoid, round_cone, fbm, _hash
import lizkit as LK

M = LK.load('beardeddragon')
KS = 1.0

M.BOUNDS = (V(-0.106, -0.001, -0.336), V(0.106, 0.064, 0.168))
M.BODY = [
    (-0.331, 0.0094, 0.0082, 0.0070, 0.0009, 2.2, 2.2),
    (-0.318, 0.0108, 0.0088, 0.0066, 0.0019, 2.2, 2.2),
    (-0.290, 0.0140, 0.0106, 0.0068, 0.0034, 2.3, 2.2),
    (-0.250, 0.0184, 0.0136, 0.0080, 0.0052, 2.3, 2.2),
    (-0.200, 0.0240, 0.0176, 0.0102, 0.0078, 2.3, 2.2),
    (-0.150, 0.0298, 0.0218, 0.0128, 0.0110, 2.3, 2.2),
    (-0.112, 0.0350, 0.0250, 0.0144, 0.0152, 2.3, 2.1),
    (-0.087, 0.0398, 0.0272, 0.0150, 0.0215, 2.3, 2.1),
    (-0.066, 0.0446, 0.0286, 0.0148, 0.0305, 2.4, 2.1),
    (-0.042, 0.0490, 0.0296, 0.0140, 0.0385, 2.5, 2.2),
    (-0.012, 0.0526, 0.0302, 0.0130, 0.0445, 2.6, 2.2),
    (0.018, 0.0534, 0.0306, 0.0132, 0.0440, 2.6, 2.2),
    (0.043, 0.0526, 0.0312, 0.0144, 0.0385, 2.5, 2.1),
    (0.063, 0.0512, 0.0318, 0.0160, 0.0318, 2.4, 2.1),
    (0.080, 0.0490, 0.0324, 0.0178, 0.0228, 2.3, 2.1),
    (0.096, 0.0500, 0.0332, 0.0190, 0.0262, 2.4, 2.1),
    (0.110, 0.0512, 0.0340, 0.0204, 0.0290, 2.5, 2.2),
    (0.124, 0.0506, 0.0350, 0.0222, 0.0262, 2.5, 2.2),
    (0.139, 0.0478, 0.0356, 0.0244, 0.0220, 2.4, 2.2),
    (0.146, 0.0462, 0.0354, 0.0254, 0.0198, 2.4, 2.2),
    (0.152, 0.0442, 0.0348, 0.0266, 0.0168, 2.4, 2.2),
    (0.157, 0.0420, 0.0340, 0.0278, 0.0132, 2.3, 2.1),
    (0.1605, 0.0398, 0.0334, 0.0290, 0.0084, 2.1, 2.0),
]
M.TAIL_TIP = V(0, 0.009, -0.336)
M.Z_HEAD, M.Z_TAIL = 0.104, -0.082
M.UV_Z = [-0.2]
M.HEAD_BOX = (V(-0.04, 0.008, 0.082), V(0.04, 0.066, 0.18))
M.LEG_BOX = (V(-0.1, -0.002, -0.092), V(0.1, 0.052, 0.1))
M.FOOT_BOX = (V(-0.108, -0.002, -0.088), V(0.108, 0.014, 0.112))

M.EYE_C, M.EYE_R, M.EYE_DIR = V(0.0150, 0.0416, 0.1415), 0.0037, V(0.92, 0.28, 0.22)
M.LID_W, M.LID_H, M.LID_OFF = 0.0031, 0.0024, -0.0002
M.LIDS = (0.0017, 0.0012, 0.0004)
M.NOSTRIL = V(0.0066, 0.0378, 0.1555)
M.NOSTRIL_R = (V(0.0013, 0.0011, 0.0016), V(0.0008, 0.0006, 0.0009))
M.EAR = V(0.0222, 0.0372, 0.1145)
M.EAR_R = V(0.0015, 0.0021, 0.0015)
M.MOUTH = V(0.0, 0.0312, 0.159)
M.MOUTH_LINE = [V(0.0, 0.0312, 0.1625), V(0.0068, 0.0313, 0.1595), V(0.0152, 0.0320, 0.1430), V(0.0205, 0.0332, 0.1240)]
M.MOUTH_R = [0.0005, 0.0005, 0.00045, 0.0002]
M.SNOUT = (V(0.0, 0.0336, 0.1550), V(0.0100, 0.0058, 0.0060), 0.003)
M.HEAD_BLOBS = [
    (V(0.0195, 0.0372, 0.1165), V(0.0078, 0.0092, 0.0105), 0.004),     # jaw muscles at the wide back corners
    (V(0.0165, 0.0300, 0.1240), V(0.0060, 0.0050, 0.0090), 0.004),     # angle of the jaw
    (V(0.0128, 0.0462, 0.1405), V(0.0050, 0.0018, 0.0085), 0.003),     # brow ridge over the eye
]
M.MANDIBLE = (V(0.0172, 0.0262, 0.121), V(0.0068, 0.0290, 0.1585), 0.0048, 0.0032, 0.003)
M.BLOBS = [
    (V(0.017, 0.0315, 0.064), V(0.0105, 0.0095, 0.012), 0.006),        # shoulder girdle
    (V(0.016, 0.0300, -0.058), V(0.0120, 0.0100, 0.0135), 0.006),      # pelvic girdle
    (V(0.0, 0.0215, 0.1015), V(0.0205, 0.0088, 0.0225), 0.006),        # the beard: a full throat pouch
]

SH, EL, WR = V(0.014, 0.031, 0.064), V(0.050, 0.037, 0.064), V(0.059, 0.0085, 0.074)
HP, KN, AN = V(0.012, 0.030, -0.058), V(0.060, 0.037, -0.054), V(0.073, 0.0085, -0.070)
M.HAND, M.FOOT = V(0.062, 0.0035, 0.082), V(0.077, 0.0035, -0.058)
M.FLEG = [
    ('chain', [SH, V(0.033, 0.0345, 0.064), EL], [0.0098, 0.0086, 0.0072], 0.002, 0.0),
    ('chain', [EL, V(0.0555, 0.022, 0.069), WR], [0.0082, 0.0068, 0.0058], 0.0015, 0.0015),
    ('ball', EL + V(0.0006, 0, -0.0005), V(0.0060, 0.0058, 0.0056), 0.0015),
    ('pad', M.HAND + V(0.0, 0.0002, -0.0004), (0.0055, 0.0025, 0.0062), 0.003, None, 0.0018),
]
M.HLEG = [
    ('chain', [HP, V(0.036, 0.0340, -0.056), KN], [0.0130, 0.0108, 0.0080], 0.0025, 0.0),
    ('ball', V(0.031, 0.0310, -0.0595), V(0.0140, 0.0105, 0.0128), 0.004),       # the thick thigh
    ('chain', [KN, V(0.067, 0.022, -0.061), AN], [0.0080, 0.0067, 0.0054], 0.0015, 0.0015),
    ('ball', KN + V(0.0005, 0, -0.0006), V(0.0066, 0.0062, 0.0062), 0.0015),
    ('pad', M.FOOT + V(-0.0006, 0.0002, -0.0040), (0.0056, 0.0025, 0.0090), 0.003, nrm([0.25, 0, 1]), 0.002),
]
M.F_TOES = [(-38, 0.0085, 0.0018), (-12, 0.0115, 0.0025), (12, 0.0130, 0.0027), (36, 0.0122, 0.0025), (70, 0.0080, 0.0020)]
M.H_TOES = [(-22, 0.0090, 0.0022), (2, 0.0135, 0.0028), (22, 0.0175, 0.0030), (42, 0.0195, 0.0027), (98, 0.0120, 0.0045)]
M.TOE_R = (0.00145, 0.00155)
M.HIND5 = V(0.0040, 0.0002, -0.0050)


# ---------- spikes ----------
def _spikes():
    """soft spikes: (base, tip, r0, r1). The base sits a little inside the skin."""
    M.setup()
    out = []
    rnd = lambda i, k: float(_hash(np.array([i]), np.array([k]), np.array([7]), 31)[0])
    # the flank fringe: a row along the widest line from the armpit to the groin, a row of smaller ones above it
    for i, z in enumerate(np.arange(0.05, -0.058, -0.0082)):
        b = LK_surf(z, -0.06, -0.0016)
        L = 0.0088 + 0.0026 * rnd(i, 1)
        out.append((b, b + V(L, -0.0016, -0.0030), 0.0026, 0.0005))
        if i % 2 == 0:
            b = LK_surf(z - 0.004, 0.42, -0.0014)
            out.append((b, b + V(0.0045, 0.0020, -0.0018), 0.0019, 0.0004))
    # the base of the tail: small spines along its sides
    for i, z in enumerate(np.arange(-0.086, -0.14, -0.0078)):
        b = LK_surf(z, 0.0, -0.0012)
        out.append((b, b + V(0.0034 - 0.012 * (-0.086 - z), 0.0004, -0.0018), 0.0016, 0.00035))
    # spiky scales over the back: four rows
    for i, z in enumerate(np.arange(0.052, -0.07, -0.0105)):
        for xr, k in ((0.0105, 0.85), (0.024, 1.0)):
            zz = z - 0.004 * (xr > 0.02)
            top = float(M.iz(np.array([zz], F), 1)[0])
            w = float(M.iz(np.array([zz], F), 4)[0])
            yb = M.iz(np.array([zz], F), 2)[0] + (top - M.iz(np.array([zz], F), 2)[0]) * np.sqrt(max(0.0, 1 - (xr / w) ** 2.5)) - 0.001
            b = V(xr, float(yb), zz)
            out.append((b, b + V(0.0008, 0.0026 * k, -0.0012), 0.00155, 0.0003))
    # the beard: spines along the lower jaw edge and in rows across the throat (longest at the edges)
    for i, t in enumerate(np.linspace(0.0, 1.0, 7)):
        z = 0.1505 - t * 0.0345
        x = 0.0075 + t * 0.0112
        b = V(x, 0.0238 - t * 0.003, z)
        out.append((b, b + V(0.0034 + 0.0018 * t, -0.0046, -0.0010), 0.0018, 0.0003))
    for j, z in enumerate((0.114, 0.104, 0.094, 0.085)):
        hw = 0.0175 - 0.002 * j
        for x in np.arange(0.004, hw + 0.001, 0.0042):
            edge = x / hw
            yb = 0.0215 - 0.0088 * np.sqrt(max(0.0, 1 - (x / 0.0205) ** 2)) * np.sqrt(max(0.0, 1 - ((z - 0.1015) / 0.0225) ** 2)) + 0.0008
            L = 0.0028 + 0.0036 * edge ** 2
            b = V(float(x), float(yb), z)
            out.append((b, b + V(0.0012 + L * 0.6 * edge, -L, -0.0010), 0.0016, 0.0003))
    # the head: tufts around the ear and behind the jaw angle, a row along the back of the skull, over the brow
    for (x, y, z), (dx, dy, dz), r in (
            ((0.0262, 0.0330, 0.1180), (0.0068, -0.0026, -0.0028), 0.0022),
            ((0.0266, 0.0365, 0.1105), (0.0078, -0.0002, -0.0040), 0.0024),
            ((0.0252, 0.0405, 0.1080), (0.0066, 0.0024, -0.0044), 0.0022),
            ((0.0228, 0.0440, 0.1040), (0.0050, 0.0040, -0.0044), 0.0020),
            ((0.0244, 0.0300, 0.1100), (0.0060, -0.0042, -0.0026), 0.0020),
            ((0.0258, 0.0350, 0.1250), (0.0055, -0.0012, -0.0012), 0.0018),
            ((0.0262, 0.0310, 0.1295), (0.0045, -0.0028, -0.0004), 0.0016),
            ((0.0190, 0.0470, 0.1060), (0.0020, 0.0040, -0.0030), 0.0016),
            ((0.0120, 0.0498, 0.1035), (0.0008, 0.0038, -0.0034), 0.0015),
            ((0.0165, 0.0485, 0.1300), (0.0018, 0.0026, -0.0010), 0.0012),
            ((0.0185, 0.0472, 0.1350), (0.0022, 0.0022, -0.0006), 0.0011)):
        b = V(x, y, z)
        out.append((b, b + V(dx, dy, dz) * 1.3, r * 1.1, 0.0004))
    # tufts on the sides of the neck
    for (x, y, z), (dx, dy, dz) in (((0.0225, 0.0360, 0.090), (0.0050, 0.0004, -0.0024)), ((0.0228, 0.0325, 0.082), (0.0048, -0.0016, -0.0024)),
                                    ((0.0215, 0.0400, 0.084), (0.0040, 0.0024, -0.0030)), ((0.0222, 0.0290, 0.093), (0.0040, -0.0030, -0.0012))):
        b = V(x, y, z)
        out.append((b, b + V(dx, dy, dz), 0.0018, 0.0004))
    return out


def LK_surf(z, ang, out):
    M.setup()
    return M.surf_pt(z, ang, out)


SPIKES = None


def spike(P):
    global SPIKES
    if SPIKES is None:
        SPIKES = _spikes()
    return M.cones(M.mirror(P), SPIKES)


M.EXTRAS = [('spike', spike, 0.0011, None)]
M.BODY_EXTRAS = ('spike',)

# fine bake-only patches (box lo, box hi on the +x side, voxel size)
M.PATCHES = [
    (V(0.007, 0.035, 0.133), V(0.0215, 0.0505, 0.151), 0.00016),      # eye and lids
    (V(0.0, 0.026, 0.145), V(0.013, 0.043, 0.166), 0.0002),           # snout tip, nostril, lips
    (V(0.017, 0.030, 0.104), V(0.032, 0.048, 0.124), 0.0002),         # ear and its tufts
    (V(0.050, -0.001, 0.068), V(0.084, 0.010, 0.098), 0.0002),        # front foot
    (V(0.057, -0.001, -0.080), V(0.099, 0.011, -0.034), 0.0002),      # hind foot
]
M.SC = dict(body=0.0013, leg=0.001, head=0.0016, ring=0.0022, belly=0.0017, lip=0.0024)
M.GRAN_H = 0.18
M.TAIL_KEEL = 0.06
M.UV_HEAD = 1.5
M.KEEP_FLOOR = 0.3
M.BODY_REACH = 0.07
M.BEND_PITCH = (0.0135, 0.005)


def keep_extra(P):
    sp = spike(P)
    return sstep(0.0012, 0.0002, sp) * 0.38


M.keep_extra = keep_extra


def regions_extra(r, P, N, c):
    r['spike'] = sstep(0.0005, 0.0, c['spike']) * sstep(-0.0002, 0.0006, c['body'] - c['spike'])
    return r


M.regions_extra = regions_extra


def scales_extra(H, E, C, R, P, N, c):
    # spikes: smooth (no beads), each one color
    k = R['spike']
    H = H * (1 - k)
    return H, E, C


M.scales_extra = scales_extra

# ---------- paint ----------
K = {
    'tan': M.hexc(0xA8804E), 'tanLt': M.hexc(0xC49E68), 'orange': M.hexc(0xBF7436), 'dark': M.hexc(0x5A3E26), 'darker': M.hexc(0x46301E),
    'belly': M.hexc(0xE4D3A8), 'bellyDk': M.hexc(0xB8A27A), 'spike': M.hexc(0xE8D3A0), 'beard': M.hexc(0x8E7C62), 'claw': M.hexc(0x3A2E24),
    'clawTip': M.hexc(0x9A8A72), 'ball': M.hexc(0x141010), 'lip': M.hexc(0xE2CDA0), 'stripe': M.hexc(0x6E4C30),
}


def _pattern(C, R, Pm, bold=1.0):
    """darker markings: two rows of blotches down the back, bands on the tail and the legs, the stripe behind the eye"""
    x, y, z = C[:, 0], C[:, 1], C[:, 2]
    n1 = fbm(C * 120, 3, 41) - 0.5
    # the back: blotches either side of the middle line, about 2.6 cm apart, each a rounded rhomb
    zb = (z - 0.004) / 0.026
    fz = zb - np.floor(zb) - 0.5
    bx = np.abs(np.abs(x) - 0.016) / 0.0085 + np.abs(fz) / 0.36 + n1 * 0.6
    back = sstep(1.15, 0.85, bx) * sstep(0.07, 0.05, z) * sstep(-0.1, -0.075, z) * R['top']
    # the tail: bands across its top (about 2.2 cm apart), fading toward the tip
    zt = (-z - 0.09) / 0.024
    band = sstep(0.28, 0.12, np.abs(zt - np.floor(zt) - 0.5) + n1 * 0.15) * R['tail'] * sstep(-0.4, 0.4, R['Nm'][:, 1]) * sstep(-0.335, -0.2, z)
    # the legs: faint bands
    lg = sstep(0.62, 0.78, fbm(C * 160, 2, 45)) * R['leg'] * (1 - R['toe']) * 0.4
    # the head: a dark stripe from the eye back to the ear
    ex = (Pm[:, 2] - 0.126) / 0.017
    st = sstep(0.0035, 0.0015, np.abs(Pm[:, 1] - (0.0425 - 0.004 * (1 - ex)))) * sstep(-1.0, -0.5, ex) * sstep(1.0, 0.6, ex) * sstep(0.008, 0.014, Pm[:, 0])
    return np.clip(back * bold, 0, 1), np.clip(band * bold, 0, 1), lg * bold, st


def paint(P, N, c):
    H, E, C, R = M.scales(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    j = M.jit(C)
    n2 = fbm(Pm * 40, 2, 42)
    col = M.mix(M.tile(K['tan'], n), K['tanLt'], 0.18 * j + 0.3 * sstep(0.2, -0.5, Nm[:, 1]))
    # an orange wash over the head, the forelegs and the front of the body
    col = M.mix(col, K['orange'], (0.55 * R['head'] + 0.25 * sstep(0.0, 0.08, z) + 0.2 * n2) * (1 - R['belly']))
    back, band, lg, st = _pattern(C, R, Pm)
    col = M.mix(col, K['dark'], back * 0.95 + band * 0.7 + lg)
    # dark and pale speckles (single scales)
    col = M.mix(col, K['darker'], (j < 0.04) * 0.45 * (1 - R['belly']))
    col = M.mix(col, K['stripe'], st * 0.7)
    # the beard: grayer and darker than the body, the spines pale
    beard = sstep(0.026, 0.021, y) * sstep(0.078, 0.088, z) * sstep(0.162, 0.15, z) * (1 - R['lip'])
    col = M.mix(col, K['beard'], beard * 0.7)
    # the belly: pale cream with faint darker rings
    f1, f2, _ = M.cells(Pm * V(1, 1, 0.7), 0.009, 43)
    ring = sstep(0.0012, 0.0004, np.abs(f1 - 0.0034)) * 0.35
    bcol = M.mix(M.tile(K['belly'], n), K['bellyDk'], ring + 0.25 * j)
    col = M.mix(col, bcol, R['belly'] * (0.35 + 0.65 * sstep(-0.6, -0.9, Nm[:, 1])) * (1 - beard * 0.6))
    # the lips pale
    col = M.mix(col, K['lip'], R['lip'] * 0.35)
    # spikes: pale, toward their tips most
    col = M.mix(col, K['spike'], R['spike'] * (0.2 + 0.4 * sstep(0.0, 0.003, -c['spike'] + c['body'])))
    # the grooves between scales darker
    col = col * (0.74 + 0.26 * sstep(0.0, 0.22, E))[:, None]
    col *= (0.96 + 0.08 * fbm(Pm * 60, 2, 44))[:, None]
    cc = M.mix(M.tile(K['claw'], n), K['clawTip'], sstep(0.002, 0.0002, y) * 0.6)
    col = M.mix(col, cc, R['claw'])
    col = M.mix(col, K['ball'], R['ball'])
    col = M.openings(col, R)
    rough = 0.62 + 0.12 * (1 - sstep(0.0, 0.2, E)) + 0.05 * R['belly'] - 0.15 * R['claw'] - 0.3 * R['ball']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


KB = {'tan': M.hexc(0xA07E54), 'tanLt': M.hexc(0xBC9A6C), 'dark': M.hexc(0x4E3624), 'belly': M.hexc(0xD6C69C), 'pale': M.hexc(0xD8C092)}
M.BABY_MAP = (320, 56)


def paint_baby(P, N, c):
    """the hatchling: paler sand with the markings bolder (the back blotches, pale stripes between them, the bands)"""
    H, E, C, R = M.scales(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    j = M.jit(C, 95)
    col = M.mix(M.tile(KB['tan'], n), KB['tanLt'], 0.35 * j + 0.3 * sstep(0.2, -0.5, Nm[:, 1]))
    back, band, lg, st = _pattern(C, R, Pm, 1.25)
    col = M.mix(col, KB['dark'], np.clip(back * 1.1, 0, 1) + band * 0.9 + lg)
    # pale stripes down the back between the blotch rows and along the flanks
    ps = (sstep(0.0035, 0.0015, np.abs(C[:, 0] - 0.0265)) + sstep(0.003, 0.0012, np.abs(C[:, 0]))) * sstep(0.07, 0.05, z) * sstep(-0.1, -0.07, z) * R['top']
    col = M.mix(col, KB['pale'], np.clip(ps, 0, 1) * 0.6)
    col = M.mix(col, KB['dark'], st * 0.6)
    col = M.mix(col, KB['belly'], R['belly'])
    col = M.mix(col, K['spike'], R['spike'] * 0.5)
    col = col * (0.68 + 0.32 * sstep(0.0, 0.22, E))[:, None]
    col = M.mix(col, K['claw'], R['claw'])
    col = M.mix(col, K['ball'], R['ball'])
    col = M.openings(col, R)
    return np.clip(col, 0, 1).astype(F), np.full(n, 0.62, F)


M.paint = paint
M.paint_baby = paint_baby
M.MAP_QUALITY = (50, 32)
M.EYE_META = dict(iris=0xA8742E, irisR=0.92, pupilR=0.46, rim=0x2A1A0E, babyIris=0xA8782E)
M.TINT = dict(tint=[1.0, 1.0, 1.0], babyTint=[1.0, 1.0, 1.0], rim=[0.06, 0.04, 0.02], flat=0xC49A62)
M.PREVIEW = {
    'side': ((0.78, 0.12, -0.07), (0, 0.03, -0.07), 30),
    'front3q': ((0.42, 0.3, 0.55), (0, 0.03, -0.01), 30),
    'head3q': ((0.13, 0.1, 0.27), (0, 0.035, 0.125), 26),
    'top': ((0.001, 0.9, -0.07), (0, 0.03, -0.07), 30),
    'front': ((0.0, 0.08, 0.5), (0, 0.035, 0.1), 26),
}
LK.install(globals(), M, KS)
