# A crocodile (a Nile crocodile, 3 m), sculpted as a signed distance field around the game's crocodile skeleton
# (tools/blender/work/crocodile-rig.json). Units are meters in game rig space (x left, y up, z forward, ground at
# y = 0). One loft from the tail tip to the snout (a broad flat trunk, a tail flattened side to side), the long
# narrow pointed snout with a raised nasal disc at its tip, raised eyes on top of the head, the jaw line with the
# teeth of both jaws showing (the big fourth lower tooth in its notch), rows of keeled bony scutes down the back and
# the double crest down the tail merging into one, sprawling scaly legs, webbed hind feet. The skin is a height field
# per texel (detail()): square belly plates in rows, round scales on the flanks and legs, the scutes' keels and pits.
# The hatchling has its own color map (paint_baby: bright yellow with black bands); its shape is the game's baby maps
# (a fifth of the size, a big head and eyes, a short snout).
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, chain, loft, fbm, length, _hash
import bird as BD
from carnivore import local, local_n, mirror, hexc, mix

ID = 'crocodile'


# the snout was laid out long first, then shortened in front of the eyes to a Nile crocodile's proportions (the snout
# about two thirds of the head): every z in front of Z0 below goes through zf()
Z0, SN = 0.88, 0.76


def zf(z):
    return z if z <= Z0 else Z0 + (z - Z0) * SN


BOUNDS = (V(-0.44, -0.001, -1.74), V(0.44, 0.52, zf(1.34)))
BAKE_DIST = (0.012, 0.03, 0.1)
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True

# ---------- landmarks (left side, +x) ----------
EYE_C = V(0.058, 0.392, 0.872)
EYE_R = 0.019
EYE_DIR = nrm([0.7, 0.62, 0.35])
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_W, LID_H = 0.016, 0.0105
NOSE = V(0.0, 0.338, zf(1.268))           # the nasal disc on top of the snout tip
MOUTH = V(0.0, 0.304, zf(1.3))
SHOULDER, ELBOW, WRIST, HAND = V(0.1, 0.27, 0.32), V(0.255, 0.215, 0.3), V(0.27, 0.06, 0.355), V(0.28, 0.018, 0.4)
HIP, KNEE, ANKLE, FOOT = V(0.1, 0.27, -0.34), V(0.285, 0.225, -0.3), V(0.31, 0.065, -0.37), V(0.32, 0.016, -0.31)
F_TOES = [dict(a=-38, len=0.055, r=0.015, r1=0.009, claw=0.03, n=3), dict(a=-12, len=0.07, r=0.015, r1=0.009, claw=0.032, n=3),
          dict(a=12, len=0.075, r=0.015, r1=0.009, claw=0.032, n=3), dict(a=38, len=0.068, r=0.014, r1=0.008, n=3),
          dict(a=66, len=0.05, r=0.013, r1=0.008, n=2)]
H_TOES = [dict(a=-22, len=0.09, r=0.017, r1=0.01, claw=0.032, n=3), dict(a=0, len=0.11, r=0.017, r1=0.01, claw=0.034, n=3),
          dict(a=22, len=0.115, r=0.016, r1=0.009, claw=0.032, n=3), dict(a=44, len=0.1, r=0.015, r1=0.009, n=3)]

# body from the tail tip to the snout tip, one loft: z, top, yw (height of widest), bottom, half width, exponents
BODY = [
    (-1.725, 0.188, 0.178, 0.172, 0.004, 2.0, 2.0),
    (-1.69, 0.205, 0.18, 0.166, 0.011, 2.0, 2.0),
    (-1.6, 0.226, 0.186, 0.16, 0.021, 2.0, 2.0),
    (-1.45, 0.257, 0.2, 0.161, 0.034, 2.1, 2.0),
    (-1.3, 0.288, 0.215, 0.164, 0.047, 2.1, 2.0),
    (-1.1, 0.323, 0.235, 0.168, 0.066, 2.2, 2.0),
    (-0.9, 0.357, 0.252, 0.172, 0.086, 2.2, 2.1),
    (-0.7, 0.392, 0.27, 0.177, 0.113, 2.3, 2.2),
    (-0.55, 0.415, 0.28, 0.178, 0.145, 2.5, 2.3),
    (-0.38, 0.434, 0.288, 0.172, 0.192, 2.7, 2.4),
    (-0.2, 0.444, 0.29, 0.16, 0.235, 2.8, 2.5),
    (0.0, 0.449, 0.29, 0.152, 0.254, 2.8, 2.5),
    (0.2, 0.444, 0.29, 0.156, 0.24, 2.8, 2.5),
    (0.38, 0.43, 0.295, 0.175, 0.2, 2.6, 2.4),
    (0.55, 0.412, 0.302, 0.198, 0.152, 2.5, 2.3),
    (0.7, 0.405, 0.31, 0.218, 0.146, 2.6, 2.3),
    (0.8, 0.404, 0.317, 0.236, 0.15, 2.8, 2.3),
    (0.9, 0.392, 0.318, 0.25, 0.132, 3.0, 2.4),
    (1.0, 0.37, 0.315, 0.262, 0.108, 3.0, 2.4),
    (1.1, 0.358, 0.312, 0.27, 0.088, 3.0, 2.4),
    (1.18, 0.35, 0.31, 0.275, 0.074, 3.0, 2.4),
    (1.25, 0.346, 0.312, 0.281, 0.07, 2.8, 2.4),
    (1.29, 0.338, 0.312, 0.287, 0.054, 2.4, 2.2),
    (1.315, 0.328, 0.311, 0.293, 0.028, 2.2, 2.0),
]
BODY = [(zf(r[0]),) + tuple(r[1:]) for r in BODY]
BK = np.asarray(BODY, F)


def _iz(z, col):
    return np.interp(z, BK[:, 0], BK[:, col]).astype(F)


# the jaw line (y) along z, the mouth groove; teeth hang off it
def jaw_y(z):
    return np.interp(z, [zf(v) for v in (0.74, 0.82, 0.92, 1.02, 1.12, 1.2, 1.3)], [0.322, 0.306, 0.3, 0.301, 0.302, 0.305, 0.307]).astype(F)


def jaw_x(z):
    """half width of the head at the jaw line"""
    return np.maximum(_iz(z, 4) - 0.004, 0.01)


# ---------- the body ----------
def body(P):
    Q = mirror(P)
    d = loft(Q, BODY)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    # shoulder and hip girdles where the legs come out, the throat fuller under the neck
    d = smin(d, ellipsoid(Q, V(0.15, 0.27, 0.32), V(0.09, 0.08, 0.1)), 0.06)
    d = smin(d, ellipsoid(Q, V(0.16, 0.27, -0.34), V(0.1, 0.09, 0.13)), 0.06)
    d = smin(d, ellipsoid(Q, V(0.0, 0.215, 0.6), V(0.12, 0.05, 0.14)), 0.05)
    d = smin(d, ellipsoid(Q, V(0.0, 0.312, zf(1.288)), V(0.052, 0.026, 0.03)), 0.012)
    # the flank: a row of bigger rounded scales along the side (a lateral ridge)
    yw = _iz(z, 2)
    side = np.exp(-((y - yw - 0.03) / 0.014) ** 2) * sstep(-0.45, -0.3, z) * sstep(0.42, 0.3, z) * sstep(0.12, 0.2, x)
    d = d - 0.006 * side
    return d


def head(P, d):
    """the head's features on the body field d (inside the head box)"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    # the skull table: flat on top behind the eyes, with two low bumps at its back corners
    d = smin(d, superellipsoid(Q, V(0.0, 0.392, 0.79), (0.075, 0.016, 0.06), 3.0), 0.02)
    d = smin(d, ellipsoid(Q, V(0.055, 0.398, 0.745), V(0.022, 0.012, 0.022)), 0.015)
    # the jaw muscles and the angle of the jaw, wide at the back
    d = smin(d, ellipsoid(Q, V(0.12, 0.29, 0.77), V(0.04, 0.055, 0.07)), 0.03)
    # the raised orbits (the eyes sit on top, looking up and out); the hollow in front of them
    d = smin(d, ellipsoid(Q, EYE_C + V(-0.004, -0.004, 0.0), V(0.03, 0.022, 0.034)), 0.02)
    d = d + 0.006 * np.exp(-(((x - 0.03) / 0.03) ** 2 + ((y - 0.37) / 0.03) ** 2 + ((z - zf(0.95)) / 0.04) ** 2))
    # the snout: knobbly lumps along its top, the rosette (a slight widening) just behind the tip
    lump = (fbm(Q * 22, 2, 61) - 0.5) * sstep(zf(0.95), zf(1.05), z) * sstep(zf(1.27), zf(1.2), z) * sstep(-0.2, 0.6, (y - 0.3) / 0.05)
    d = d - 0.004 * lump
    d = smin(d, ellipsoid(Q, V(0.04, 0.305, zf(1.22)), V(0.03, 0.022, 0.036)), 0.02)
    # the nasal disc and the crescent nostrils in it
    d = smin(d, ellipsoid(Q, NOSE, V(0.024, 0.012, 0.022)), 0.012)
    nd = ellipsoid(Q, NOSE + V(0.008, 0.008, 0.002), V(0.005, 0.004, 0.008))
    d = smax(d, -nd, 0.002)
    # the mouth: a groove along the jaw line (the crocodile smile, rising at the back below the eye)
    yj = jaw_y(z)
    xj = jaw_x(z)
    lip = np.exp(-((y - yj) / 0.004) ** 2) * sstep(xj - 0.03, xj - 0.004, x) * sstep(0.74, 0.8, z)
    low = sstep(yj + 0.002, yj - 0.008, y) * sstep(xj - 0.03, xj - 0.004, x) * sstep(0.76, 0.84, z) * sstep(zf(1.32), zf(1.27), z)
    d = d + 0.007 * lip + 0.004 * low
    # the eye: lid mound, the opening, the ball
    ca, li, ba = eye_parts(P)
    d = smin(d, li, 0.006)
    d = smax(d, -ca, 0.0015)
    d = smin(d, ba, 0.001)
    # the teeth: upper ones hang down outside the lower jaw, lower ones stand up into notches of the upper jaw; the
    # fourth lower tooth is big and stays visible in its notch
    d = smin(d, teeth(P), 0.003)
    return d


# tooth positions along the jaw (z), their length, upper (1) or lower (-1)
TEETH = [(1.28, 0.016, -1), (1.255, 0.017, 1), (1.225, 0.027, -1), (1.195, 0.018, 1), (1.165, 0.016, -1), (1.14, 0.022, 1), (1.115, 0.016, -1), (1.09, 0.02, 1),
         (1.065, 0.016, -1), (1.04, 0.019, 1), (1.015, 0.016, -1), (0.99, 0.018, 1), (0.965, 0.015, -1), (0.94, 0.017, 1), (0.915, 0.014, -1), (0.89, 0.015, 1),
         (0.865, 0.013, -1), (0.84, 0.013, 1), (0.82, 0.011, -1)]
TEETH = [(zf(z0), L, s) for z0, L, s in TEETH]


def teeth(P):
    Q = mirror(P)
    out = np.full(len(P), 1.0, F)
    for z0, L, s in TEETH:
        y0 = float(jaw_y(np.array([z0], F))[0])
        x0 = float(jaw_x(np.array([z0], F))[0]) - 0.002
        r = 0.0055 + 0.1 * (L - 0.013)
        base = V(x0 - 0.002, y0 + s * 0.008, z0)
        tip = V(x0 + 0.003, y0 - s * (L - 0.004), z0 + 0.002)
        out = np.minimum(out, round_cone(Q, base, tip, r, 0.0011))
    return out


def eye_parts(P):
    Q = mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0, -0.002), V(EYE_R + 0.009, EYE_R + 0.007, EYE_R + 0.003))
    ap = np.sqrt((s / LID_W) ** 2 + (u / LID_H) ** 2) - 1
    ap = ap + 0.2 * sstep(0.5, 1.0, np.abs(s) / LID_W) * (np.abs(u) / LID_H)
    carve = smax(ap * LID_H, -g - 0.002, 0.0015)
    ball = length(D) - EYE_R * 0.88
    return carve, lids, ball


# ---------- scutes ----------
def scutes(P):
    """keeled bony scutes: the back's rows (six across, a pitch of about 6 cm), the nuchal group behind the head, the
    tail's double crest of upright plates growing toward the middle of the tail and merging into one row near its end"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    out = np.full(len(P), 1.0, F)
    top = _iz(z, 1)
    # back: rows across (x of each row), between the shoulders and the base of the tail
    pitch = 0.062
    zi = np.round((z - 0.01) / pitch) * pitch + 0.01
    for xr, hk in ((0.028, 1.0), (0.08, 0.9), (0.132, 0.7)):
        on = (z > -0.6) & (z < 0.46)
        yt = _iz(zi, 1) - 0.004 - 0.6 * (xr / np.maximum(_iz(zi, 4), 0.05)) ** 2 * (_iz(zi, 1) - _iz(zi, 2)) * 0.5
        c = np.stack([np.full(len(P), xr, F), yt, zi], 1)
        h = 0.012 * hk * sstep(0.46, 0.38, zi) * sstep(-0.6, -0.5, zi)
        e = ellipsoid(Q, c, np.stack([np.full(len(P), 0.022, F), np.maximum(h, 0.002), np.full(len(P), 0.026, F)], 1) if False else V(0.022, 0.013 * hk, 0.026))
        out = np.where(on, np.minimum(out, e), out)
    # the nuchal scutes: two pairs of big ones on the neck
    for c, r in ((V(0.04, 0.405, 0.6), V(0.026, 0.016, 0.028)), (V(0.04, 0.4, 0.66), V(0.022, 0.014, 0.022)), (V(0.085, 0.395, 0.62), V(0.018, 0.012, 0.02))):
        out = np.minimum(out, ellipsoid(Q, c, r))
    # the tail crest: upright plates in two rows, then one
    tp = 0.07
    zt = np.round((z + 0.6) / tp) * tp - 0.6
    on = (z < -0.5) & (z > -1.72)
    u = sat((-zt - 0.5) / 1.2)                          # 0 at the base of the tail, 1 at its tip
    hgt = 0.012 + 0.05 * np.maximum(np.sin(np.pi * np.clip(u * 1.2, 0, 1)), 0) ** 0.8
    xr = np.where(u < 0.55, 0.045 * (1 - u * 1.3), 0.0)
    two = u < 0.55
    yt = _iz(zt, 1) - 0.006
    # a plate: thin across x, rising toward its back edge, a triangle in side view
    lz = (z - zt) / (tp * 0.5)
    prof = sat(1 - np.abs(lz + 0.15) * 1.05)
    hh = hgt * prof
    dx = np.abs(x - xr) - np.where(two, 0.009, 0.007)
    dy = (y - yt) - hh
    plate = smax(smax(dx, dy, 0.004), -(y - yt + 0.02), 0.004)
    plate = smax(plate, np.abs(lz) - 0.95, 0.004)
    out = np.where(on, np.minimum(out, plate), out)
    return out


# ---------- legs and feet ----------
def legs(P):
    Q = mirror(P)
    fr = chain(Q, [SHOULDER, ELBOW + V(0, 0.005, 0)], [0.075, 0.055], 0.02)
    fr = smin(fr, chain(Q, [ELBOW, V(0.268, 0.13, 0.33), WRIST], [0.064, 0.056, 0.046], 0.015), 0.02)
    fr = smin(fr, superellipsoid(Q, HAND + V(0.0, 0.004, -0.005), (0.05, 0.022, 0.056), 2.3, rb=0.022), 0.02)
    hi = chain(Q, [HIP, KNEE + V(0, 0.005, 0)], [0.11, 0.07], 0.03)
    hi = smin(hi, ellipsoid(Q, V(0.2, 0.25, -0.36), V(0.08, 0.06, 0.1)), 0.04)      # the thigh's muscle mass
    hi = smin(hi, chain(Q, [KNEE, V(0.3, 0.14, -0.34), ANKLE], [0.08, 0.066, 0.052], 0.02), 0.02)
    hi = smin(hi, superellipsoid(Q, FOOT + V(0.0, 0.004, -0.04), (0.045, 0.02, 0.085), 2.3, rb=0.022, ax=nrm([0.15, 0, 1])), 0.025)
    return fr, hi


def feet(P):
    Q = mirror(P)
    ft, fc, _ = BD.toes(Q, HAND + V(0, 0.0, 0.03), F_TOES)
    ht, hc, _ = BD.toes(Q, FOOT + V(0, 0.0, 0.02), H_TOES)
    # the hind foot's webbing between the toes
    web = BD.web(Q, FOOT + V(0, 0.0, 0.02), H_TOES, 0.006, reach=0.7, sag=0.25)
    return smin(np.minimum(ft, ht), web, 0.008), np.minimum(fc, hc)


HEAD_BOX = (V(-0.2, 0.2, 0.68), V(0.2, 0.46, zf(1.34)))
LEG_BOX = (V(-0.44, -0.002, -0.55), V(0.44, 0.38, 0.55))
FOOT_BOX = (V(-0.44, -0.002, -0.45), V(0.44, 0.08, 0.52))


def parts(P):
    ca, li, ba = eye_parts(P)
    fr, hi = local_n(P, *LEG_BOX, legs, 2)
    to, cl = local_n(P, *FOOT_BOX, feet, 2)
    return {'body': body(P), 'scute': scutes(P), 'lids': li, 'ball': ba, 'fleg': fr, 'hleg': hi, 'toe': to, 'claw': cl,
            'tooth': local(P, *HEAD_BOX, teeth)}


def shape(P):
    d = body(P)
    d = smin(d, scutes(P), 0.008)
    fr, hi = local_n(P, *LEG_BOX, legs, 2)
    d = smin(d, fr, 0.03)
    d = smin(d, hi, 0.035)
    m = np.all((P >= HEAD_BOX[0]) & (P <= HEAD_BOX[1]), axis=1)
    if m.any():
        d[m] = head(P[m], d[m])
    to, cl = local_n(P, *FOOT_BOX, feet, 2)
    d = smin(d, to, 0.012)
    d = smin(d, cl, 0.002)
    return d


# fine bake-only meshes over small features (box lo, box hi on the +x side, voxel size)
PATCHES = [
    (V(0.0, 0.26, 0.78), V(0.12, 0.34, zf(1.33)), 0.0018),      # the jaw line and the teeth
    (V(0.02, 0.36, 0.83), V(0.095, 0.43, 0.92), 0.0016),     # the eye
    (V(0.0, 0.32, zf(1.24)), V(0.035, 0.36, zf(1.32)), 0.0016),      # the nostrils
    (V(0.2, -0.001, 0.32), V(0.38, 0.05, 0.5), 0.0025),      # front foot
    (V(0.22, -0.001, -0.42), V(0.44, 0.05, -0.16), 0.0025),  # hind foot
]


# ---------- the game mesh ----------
def keep(P):
    Pm = mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    e = sstep(0.05, 0.03, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.5
    n = sstep(0.04, 0.02, np.linalg.norm(Pm - NOSE, axis=1)) * 0.3
    jaw = sstep(0.012, 0.004, np.abs(y - jaw_y(z))) * sstep(0.76, 0.8, z) * 0.45
    th = local(P, *HEAD_BOX, teeth)
    tooth = sstep(0.004, 0.0, th) * 0.6
    sc = sstep(0.004, 0.0, scutes(P)) * sstep(-0.5, -0.6, z) * 0.35
    feet = sstep(0.06, 0.03, y) * sstep(0.18, 0.22, x) * 0.42
    base = np.full(len(P), 0.3, F)
    return np.maximum.reduce([base, e, n, jaw, tooth, sc, feet]).astype(F)


# where the game mesh has to bend: (from, to, pitch, reach)
BEND = [
    (V(0.0, 0.18, -1.66), V(0.0, 0.29, -0.6), 0.06, 0.22),       # tail
    (V(0.0, 0.29, -0.6), V(0.0, 0.31, 0.74), 0.07, 0.34),        # trunk and neck
    (SHOULDER, ELBOW, 0.05, 0.09),
    (ELBOW, WRIST, 0.05, 0.07),
    (HIP, KNEE, 0.05, 0.12),
    (KNEE, ANKLE, 0.05, 0.08),
]


def lowpoly_fix(bm, hi):
    import meshfix as MF
    tr = MF.tree(hi)
    for a, b, pitch, reach in BEND:
        if a[0] == 0 and b[0] == 0:
            ok = lambda c, p0, r, reach=reach: r < reach and abs(c.x) < 0.24 and c.y > 0.1
        else:
            ok = lambda c, p0, r, reach=reach: r < reach
        MF.rings(bm, tr, a, b, pitch, ok)
    MF.finish(bm, 1e-6)


UV_AVERAGE = True
UV_PACK = dict(margin_method='FRACTION', margin=0.006)


def uv_regions(P):
    """head, trunk and neck, tail in two, legs and feet"""
    Pm = mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 1)
    w = _iz(z, 4)
    leg = (x > w + 0.02) | ((y < 0.17) & (np.abs(z - 0.33) < 0.2)) | ((y < 0.17) & (np.abs(z + 0.33) < 0.25))
    lab[z > 0.74] = 0
    lab[z < -0.6] = 2
    lab[z < -1.15] = 3
    lab[leg & (z > 0.0) & (z < 0.74)] = 4
    lab[leg & (z <= 0.0) & (z > -0.6)] = 5
    lab[leg & (y < 0.07) & (z > 0.0)] = 6
    lab[leg & (y < 0.07) & (z <= 0.0)] = 7
    return lab


def uv_weight(P):
    Pm = mirror(P)
    z = Pm[:, 2]
    return (0.9 + 0.6 * sstep(0.72, 0.8, z) - 0.25 * sstep(-0.9, -1.3, z)).astype(F)


WEIGHT_SMOOTH = (4, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['head'], 'head': MOUTH,
         'tail1': P['tail2'], 'tail2': P['tail3'], 'tail3': P['tail4'], 'tail4': V(0, 0.18, -1.72)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0.0, 0, 0.12)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (HAND + V(0.0, 0, 0.08)) * m
    return t


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    W[:, bi['ctag']] = 0
    x = wpos[:, 0]
    for s in 'LR':
        sg = 1 if s == 'L' else -1
        # nothing of the other side's legs
        for b in ('arm', 'fore', 'fmeta', 'fpaw', 'thigh', 'shin', 'hmeta', 'hpaw'):
            o = 'R' if s == 'L' else 'L'
            m = x * sg > 0.02
            W[m, bi[b + s]] += W[m, bi[b + o]]; W[m, bi[b + o]] = 0
        # toes, claws and the palm ride on the paw bones
        for c, paw in ((HAND, 'fpaw'), (FOOT, 'hpaw')):
            dx = np.hypot(wpos[:, 0] - sg * c[0], wpos[:, 2] - c[2])
            low = (dx < 0.17) & (wpos[:, 1] < 0.035) & (wpos[:, 0] * sg > 0.17)
            W[low] = 0; W[low, bi[paw + s]] = 1
    # the trunk, the neck, the head and the tail: one smooth chain along z (the transferred weights put a little head
    # and neck into the shoulders, which tore the hatchling's skin there: its head is scaled up against its body)
    z, y = wpos[:, 2], wpos[:, 1]
    ax = np.abs(x)
    leg = (ax > _iz(z, 4) + 0.012) | ((y < 0.16) & ((np.abs(z - 0.34) < 0.2) | (np.abs(z + 0.33) < 0.25)))
    spine = ['tail4', 'tail3', 'tail2', 'tail1', 'hips', 'chest', 'neck', 'head']
    u = np.interp(z, [-1.72, -1.6, -1.32, -0.98, -0.62, 0.0, 0.62, 0.8, 1.3], [0, 1, 2, 3, 4, 5, 6, 7, 8]).astype(F)
    Wb = np.zeros_like(W)
    for nm, w in BD.blend_chain(u, spine, 0.3):
        Wb[:, bi[nm]] = w
    # legs keep their own bones; anything of the spine on them goes to the girdle they hang from
    lw = W.copy()
    gird = np.where(z > 0.0, bi['chest'], bi['hips'])
    for nm in spine:
        if nm in ('hips', 'chest'):
            continue
        j = bi[nm]
        lw[np.arange(len(W)), gird] += lw[:, j]; lw[:, j] = 0
    W = np.where(leg[:, None], lw, Wb)
    return W / np.maximum(W.sum(1, keepdims=True), 1e-9)


# ---------- skin: scales (height field), paint ----------
def _cells(P, size, seed):
    X = P / size
    f = np.floor(X).astype(np.int64)
    f1 = np.full(len(P), 9.0, F); f2 = np.full(len(P), 9.0, F)
    best = np.zeros((len(P), 3), F)
    for dz in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                cx, cy, cz = f[:, 0] + dx, f[:, 1] + dy, f[:, 2] + dz
                fp = np.stack([cx + 0.15 + 0.7 * _hash(cx, cy, cz, seed), cy + 0.15 + 0.7 * _hash(cx, cy, cz, seed + 1), cz + 0.15 + 0.7 * _hash(cx, cy, cz, seed + 2)], 1).astype(F)
                d = np.linalg.norm(fp - X, axis=1)
                m = d < f1
                f2 = np.where(m, f1, np.minimum(f2, d))
                f1 = np.where(m, d, f1)
                best[m] = fp[m]
    return f1 * size, f2 * size, best * size


_cache = {}


def _regions(P, N, c):
    Pm = mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    r = {'Pm': Pm, 'Nm': Nm}
    near = lambda k, w: sstep(w, 0.0, c[k])
    r['claw'] = near('claw', 0.002)
    r['tooth'] = near('tooth', 0.0015)
    r['eyeD'] = np.linalg.norm(Pm - EYE_C, axis=1)
    r['ball'] = sstep(0.002, 0.0005, c['ball']) * sstep(EYE_R + 0.004, EYE_R + 0.001, r['eyeD'])
    r['lid'] = sstep(EYE_R + 0.014, EYE_R + 0.006, r['eyeD']) * (1 - r['ball'])
    r['scute'] = sstep(0.004, 0.0, c['scute']) * sstep(0.0, 0.004, c['body'] - c['scute'] + 0.002)
    r['leg'] = np.maximum(near('fleg', 0.008), near('hleg', 0.008)) * sstep(0.006, 0.02, c['body'])
    r['toe'] = near('toe', 0.004) * sstep(0.05, 0.03, y)
    r['leg'] = np.maximum(r['leg'], r['toe'])
    r['head'] = sstep(0.72, 0.8, z)
    r['tail'] = sstep(-0.55, -0.65, z)
    yw = _iz(z, 2)
    r['belly'] = sstep(-0.3, -0.75, Nm[:, 1]) * sstep(yw - 0.01, yw - 0.04, y) * (1 - r['leg'])
    r['top'] = sstep(0.2, 0.75, Nm[:, 1]) * (1 - r['leg'])
    yj = jaw_y(z)
    r['lipD'] = y - yj
    r['lip'] = sstep(0.012, 0.003, np.abs(r['lipD'])) * sstep(0.76, 0.8, z) * (1 - r['tooth'])
    r['nose'] = sstep(0.03, 0.018, np.linalg.norm((Pm - NOSE) * V(1, 1.5, 1), axis=1))
    return r


def skin(P, N, c):
    """per texel: height (meters), edge distance (0 at the groove, about 0.5 in the middle of a scale), the scale's
    center (to color each scale as one), and the region masks"""
    key = (len(P), float(P[:7].sum()))
    if key in _cache:
        return _cache[key]
    R = _regions(P, N, c)
    Pm = R['Pm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    H = np.zeros(n, F); E = np.full(n, 0.5, F); C = Pm.copy()
    # rounded scales everywhere (smaller on the legs and the head, bigger on the flanks)
    sz = np.where(R['leg'] > 0.5, 0.016, np.where(R['head'] > 0.5, 0.014, 0.024)).astype(F)
    for s in (0.014, 0.016, 0.024):
        m = sz == s
        if not m.any():
            continue
        f1, f2, cp = _cells(Pm[m], s, 71)
        e = (f2 - f1) / s
        dome = np.sqrt(np.clip(1 - (f1 / (0.62 * s)) ** 2, 0, 1))
        H[m] = s * 0.12 * sstep(0.0, 0.2, e) * (0.35 + 0.65 * dome)
        E[m] = e; C[m] = cp
    # the belly: square plates in straight rows (across z and x)
    bm = R['belly'] > 0.01
    if bm.any():
        pz, px = 0.034, 0.03
        a = (-z[bm] / pz) % 1.0
        b = (x[bm] / px) % 1.0
        hh = 0.0022 * sstep(0.0, 0.08, a) * sstep(1.0, 0.92, a) * sstep(0.0, 0.08, b) * sstep(1.0, 0.92, b)
        e = np.minimum(np.minimum(a, 1 - a), np.minimum(b, 1 - b)) * 1.2
        k = R['belly'][bm]
        H[bm] = H[bm] * (1 - k) + hh * k; E[bm] = E[bm] * (1 - k) + e * k
        cp = np.stack([(np.floor(x[bm] / px) + 0.5) * px, y[bm], -(np.floor(-z[bm] / pz) + 0.5) * pz], 1).astype(F)
        C[bm] = np.where(k[:, None] > 0.5, cp, C[bm])
    # the scutes: a keel down the middle, small pits over them
    sm = R['scute']
    pit, _, _ = _cells(Pm, 0.006, 73)
    H = H * (1 - sm) + sm * (0.002 * sstep(0.0, 0.002, pit) - 0.0015 * sstep(0.0025, 0.0, pit) + 0.002)
    # the snout: small pits (the sense organs) all over the jaws
    pits = sstep(0.0018, 0.0006, _cells(Pm, 0.012, 74)[0]) * R['head'] * sstep(0.84, 0.9, z)
    H -= 0.0012 * pits
    bare = np.maximum.reduce([R['claw'], R['ball'], R['tooth']])
    H *= 1 - bare
    out = (H, E, C, R)
    _cache.clear()
    _cache[key] = out
    return out


K = {
    'olive': hexc(0x4E5434), 'oliveDk': hexc(0x2E3222), 'oliveLt': hexc(0x77744A), 'yel': hexc(0x9C9258), 'gap': hexc(0x1A1C14),
    'belly': hexc(0xD9CFA2), 'bellyDk': hexc(0xB2A67A), 'tooth': hexc(0xE6DCC0), 'claw': hexc(0x2A2620), 'ball': hexc(0x141410),
    'lid': hexc(0x5A5A3A),
}


def paint(P, N, c):
    H, E, C, R = skin(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    jit = _hash(np.round(C[:, 0] * 4000).astype(np.int64), np.round(C[:, 1] * 4000).astype(np.int64), np.round(C[:, 2] * 4000).astype(np.int64), 91)
    n1 = fbm(Pm * 3, 3, 92)
    col = mix(np.tile(K['olive'], (len(P), 1)), K['oliveLt'], sstep(0.3, -0.4, Nm[:, 1]) * 0.6)
    col = mix(col, K['oliveDk'], R['top'] * 0.35 + (jit - 0.5) * 0.3 + (n1 - 0.5) * 0.4)
    # dark crossbands over the back and the tail (clearer on the tail), dark speckles on the flanks
    zc = C[:, 2]
    band = sstep(0.55, 0.8, np.sin(2 * np.pi * (zc + 0.03 * (fbm(C * 4, 2, 93) - 0.5)) / 0.19) * 0.5 + 0.5)
    col = mix(col, K['oliveDk'], band * (0.35 + 0.45 * R['tail']) * sstep(-0.4, 0.2, Nm[:, 1]))
    spk = (jit < 0.22) * sstep(0.5, -0.3, Nm[:, 1]) * (1 - R['belly'])
    col = mix(col, K['oliveDk'], spk * 0.7)
    col = mix(col, K['yel'], sstep(0.3, -0.2, Nm[:, 1]) * sstep(-0.6, -0.3, Nm[:, 1] - 0.4) * 0.3 * (1 - R['belly']))
    # the belly: pale cream plates, the edges a little darker
    bcol = mix(np.tile(K['belly'], (len(P), 1)), K['bellyDk'], 0.3 * jit + 0.4 * sstep(0.25, 0.0, E))
    col = mix(col, bcol, R['belly'])
    # the scutes: the keel a little paler, worn
    col = mix(col, K['oliveLt'], R['scute'] * sstep(0.0005, 0.002, H) * 0.25)
    # the lower jaw and the lips a little paler, the nasal disc dark
    col = mix(col, K['yel'], R['head'] * sstep(-0.1, -0.5, Nm[:, 1]) * 0.5)
    col = mix(col, K['oliveDk'], R['nose'] * 0.5)
    # the grooves between scales darker
    col = col * (0.6 + 0.4 * sstep(0.0, 0.25, E))[:, None]
    col *= (0.95 + 0.1 * fbm(Pm * 40, 2, 94))[:, None]
    col = mix(col, K['lid'], R['lid'] * 0.4)
    col = mix(col, K['tooth'], R['tooth'])
    col = mix(col, K['claw'], R['claw'])
    col = mix(col, K['ball'], R['ball'])
    rough = 0.62 + 0.15 * (1 - sstep(0.0, 0.25, E)) - 0.1 * R['tooth'] - 0.2 * R['claw'] - 0.3 * R['ball'] + 0.05 * R['belly']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    H, E, C, R = skin(P, N, c)
    return H.astype(F)


def finish(C, ao, valid):
    return BD.finish_ao(C, ao, 0.35)


# ---------- the hatchling's colors (its own color map) ----------
KB = {'yel': hexc(0xC6B24A), 'yelLt': hexc(0xDCCB72), 'black': hexc(0x22221A), 'belly': hexc(0xEDE4B8)}
BABY_MAP = (384, 60)


def paint_baby(P, N, c):
    H, E, C, R = skin(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    z = Pm[:, 2]
    jit = _hash(np.round(C[:, 0] * 4000).astype(np.int64), np.round(C[:, 1] * 4000).astype(np.int64), np.round(C[:, 2] * 4000).astype(np.int64), 95)
    col = mix(np.tile(KB['yel'], (len(P), 1)), KB['yelLt'], 0.35 * jit + 0.3 * sstep(0.3, -0.3, Nm[:, 1]))
    # bold black bands across the back and the tail (about 12 from the neck to the tip), black speckles between
    zc = C[:, 2]
    band = sstep(0.42, 0.62, np.sin(2 * np.pi * (zc + 0.04 * (fbm(C * 4, 2, 96) - 0.5)) / 0.24) * 0.5 + 0.5)
    col = mix(col, KB['black'], band * sstep(-0.45, 0.1, Nm[:, 1]) * sstep(0.85, 0.7, z) * 0.9)
    col = mix(col, KB['black'], (jit < 0.2) * sstep(-0.2, 0.3, Nm[:, 1]) * 0.6)
    # the head: dark mottling on the snout and the skull, the jaws pale with dark bars
    hm = sstep(0.55, 0.7, fbm(Pm * 30, 2, 97)) * R['head'] * sstep(0.0, 0.5, Nm[:, 1])
    col = mix(col, KB['black'], hm * 0.7)
    col = mix(col, KB['belly'], R['belly'] + R['head'] * sstep(-0.1, -0.5, Nm[:, 1]) * 0.8)
    col = col * (0.68 + 0.32 * sstep(0.0, 0.25, E))[:, None]
    col = mix(col, hexc(0xF0E8D0), R['tooth'])
    col = mix(col, K['claw'], R['claw'])
    col = mix(col, K['ball'], R['ball'])
    rough = np.full(len(P), 0.6, F)
    return np.clip(col, 0, 1).astype(F), rough


# ---------- what the game needs besides the mesh ----------
MAP_QUALITY = (60, 52)


def stats(P, N, c, col):
    R = _regions(P, N, c)
    m = R['lid'] * sstep(EYE_R + 0.012, EYE_R + 0.007, R['eyeD'])
    lid = (col * m[:, None]).sum(0) / max(m.sum(), 1e-6)
    return {'lidCol': int(round(lid[0] * 255)) << 16 | int(round(lid[1] * 255)) << 8 | int(round(lid[2] * 255))}


def meta(st):
    r = EYE_R
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [0.6, -0.6, 0.2],
                'iris': 0xB8A23E, 'irisR': 0.95, 'pupil': 'v', 'pupilR': 0.3, 'rim': 0x5A4A18, 'lidCol': st['lidCol'], 'babyIris': 0xC8B048},
        'collar': {'at': ['chest', 'neck', 0.85], 'lift': 0.3, 'maxR': 0.3},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.05, 0.05, 0.03], 'flat': 0x4E5434,
    }


PREVIEW = {
    'side': ((5.5, 0.9, -0.15), (0, 0.25, -0.15), 30),
    'front3q': ((2.6, 1.5, 3.2), (0, 0.25, 0.2), 30),
    'rear3q': ((-2.6, 1.8, -3.4), (0, 0.25, -0.3), 30),
    'head3q': ((0.6, 0.6, 1.65), (0, 0.33, 0.95), 26),
    'headside': ((1.2, 0.42, 0.95), (0, 0.33, 0.95), 26),
    'top': ((0.01, 6.0, -0.2), (0, 0.25, -0.2), 30),
}
