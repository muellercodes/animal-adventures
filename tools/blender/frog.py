# American green tree frog (Hyla cinerea), sitting, sculpted as a signed distance field around the game's frog
# skeleton. Units are meters in game rig space (x left, y up, z forward, ground at y = 0); bone pivots come from the
# game (tools/blender/work/frog-rig.json) and the body is built to fit them. The folded leg segments touch only at
# their joints (a thin slit between them elsewhere, see _fold) so they can unfold for a hop without stretching the
# skin into fins; the skin weights are made here from the same parts (fix_weights).
# Make it with: VOXEL=0.0004 TRIS=7200 TEX=512 BLENDER_PY=... python3 tools/blender/make.py frog
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, loft, frame, fbm, vnoise, worley, length

ID = 'frog'
BOUNDS = (V(-0.12, -0.0015, -0.098), V(0.12, 0.094, 0.1))
PATCHES = []
# bake distances for an animal this small (cage, ray, occlusion)
BAKE_DIST = (0.0022, 0.006, 0.016)
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True

# ---------- landmarks (left side; bone pivots from the rig) ----------
HIP, KNEE, HEEL, HPAW = V(0.03, 0.033, -0.058), V(0.072, 0.028, -0.008), V(0.062, 0.017, -0.075), V(0.078, 0.005, -0.02)
SHO, ELB, WRI, FPAW = V(0.032, 0.045, 0.032), V(0.043, 0.026, 0.022), V(0.044, 0.006, 0.05), V(0.046, 0.004, 0.062)
EYE_C = V(0.0255, 0.0738, 0.0555)
EYE_R = 0.0115
EYE_DIR = nrm([0.74, 0.40, 0.54])
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
# lid opening (half width, half height, center offset up), meters: tree frog eyes show almost the whole side of the ball
LID_W, LID_H, LID_OFF = 0.0110, 0.0083, -0.0008
TYMP_C, TYMP_R = V(0.0305, 0.0605, 0.0335), 0.0050
TYMP_N = nrm([0.93, 0.22, -0.28])
NOSTRIL = V(0.0066, 0.0688, 0.0880)
MOUTH = V(0.0, 0.0600, 0.0905)
# lip line (mouth slit) from the snout tip back to the jaw corner below the tympanum: (z, y)
LIP = [(0.0955, 0.0582), (0.088, 0.0578), (0.072, 0.0556), (0.056, 0.0533), (0.042, 0.0510), (0.031, 0.0486)]

# body: z, top, yw (height of widest), bottom, half width, exponent above, below (vent at the back, snout in front)
BODY = [
    (-0.0775, 0.0350, 0.0285, 0.0210, 0.007, 2.0, 2.0),
    (-0.0720, 0.0435, 0.0300, 0.0160, 0.0175, 2.1, 2.0),
    (-0.0620, 0.0505, 0.0320, 0.0110, 0.0275, 2.2, 2.0),
    (-0.0500, 0.0555, 0.0340, 0.0080, 0.0345, 2.3, 2.0),
    (-0.035, 0.0610, 0.0360, 0.0075, 0.0400, 2.4, 2.1),
    (-0.012, 0.0645, 0.0390, 0.0095, 0.0410, 2.5, 2.1),
    (0.010, 0.0675, 0.0430, 0.0150, 0.0392, 2.5, 2.0),
    (0.028, 0.0705, 0.0480, 0.0245, 0.0352, 2.6, 2.0),
    (0.042, 0.0722, 0.0520, 0.0325, 0.0330, 2.9, 2.1),
    (0.056, 0.0728, 0.0555, 0.0385, 0.0310, 2.9, 2.2),
    (0.070, 0.0722, 0.0585, 0.0440, 0.0272, 2.7, 2.3),
    (0.081, 0.0705, 0.0605, 0.0490, 0.0210, 2.3, 2.3),
    (0.089, 0.0680, 0.0615, 0.0535, 0.0135, 2.2, 2.3),
    (0.0945, 0.0655, 0.0615, 0.0570, 0.0050, 2.0, 2.0),
]

# hind toes and fingers (left): angle from +z toward +x (deg), length, root and tip radius, disc radius, web reach
HTOES = [(-14, 0.0135, 0.0019, 0.0014, 0.0021, 0.45), (6, 0.0205, 0.0019, 0.0014, 0.0023, 0.5), (24, 0.028, 0.002, 0.0015, 0.0025, 0.52),
         (44, 0.036, 0.0021, 0.0015, 0.0027, 0.48), (68, 0.026, 0.0019, 0.0014, 0.0024, 0.66)]
FTOES = [(-30, 0.0105, 0.0016, 0.0012, 0.0021), (-6, 0.0145, 0.0017, 0.0013, 0.0025), (18, 0.0185, 0.0018, 0.0013, 0.0028), (44, 0.0155, 0.0017, 0.0013, 0.0026)]
HFOOT = HPAW + V(0.0, -0.0015, 0.0015)   # where the toes fan out
FHAND = FPAW + V(0.0, -0.0008, 0.0)


def _box(P, lo, hi):
    return np.all((P >= lo) & (P <= hi), axis=1)


def _local(P, lo, hi, fn, far=1.0):
    """evaluate fn only inside the box (keeps big grids fast); far elsewhere"""
    m = _box(P, np.asarray(lo, F), np.asarray(hi, F))
    out = np.full(len(P), far, F)
    if m.any():
        out[m] = fn(P[m])
    return out


def _local_n(P, lo, hi, fn, n, far=1.0):
    m = _box(P, np.asarray(lo, F), np.asarray(hi, F))
    out = [np.full(len(P), far, F) for _ in range(n)]
    if m.any():
        for o, r in zip(out, fn(P[m])):
            o[m] = r
    return out


def _mirror(P):
    Q = P.copy(); Q[:, 0] = np.abs(Q[:, 0]); return Q


def groove(s, width, depth):
    return depth * np.exp(-(s / width) ** 2)


def _lip_y(z):
    zz = np.array([k[0] for k in LIP][::-1], F); yy = np.array([k[1] for k in LIP][::-1], F)
    return np.interp(z, zz, yy).astype(F)


# ---------- body and head ----------
def body(P):
    Q = _mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    d = loft(Q, BODY)
    # rump: soft rounded haunches above the vent (the body ends just behind the hips, the legs come out of the back)
    d = smin(d, ellipsoid(Q, V(0.013, 0.039, -0.061), V(0.016, 0.012, 0.013)), 0.008)
    # shoulders over the arm insertion
    d = smin(d, ellipsoid(Q, V(0.024, 0.052, 0.024), V(0.011, 0.012, 0.013)), 0.008)
    # upper jaw a little wider than the lower one, a low ridge from eye to nostril (canthus)
    d = smin(d, ellipsoid(Q, V(0.0, 0.0605, 0.066), V(0.0285, 0.0045, 0.030)), 0.004)
    can = round_cone(Q, V(0.016, 0.0695, 0.066), V(0.0085, 0.0682, 0.0855), 0.0016, 0.0011)
    d = smin(d, can, 0.004)
    # flat throat, slightly full under the jaw
    d = smin(d, ellipsoid(Q, V(0.0, 0.0415, 0.058), V(0.021, 0.006, 0.024)), 0.008)
    # mouth slit: a thin groove along the lip line on the side and front of the head, lower jaw set in under it
    yl = _lip_y(z)
    head_side = sstep(0.027, 0.033, z) * sstep(0.0985, 0.093, z)
    d = d + groove(y - yl, 0.0004, 0.00055) * head_side
    d = d + 0.0003 * sstep(yl - 0.0004, yl - 0.0025, y) * sstep(yl - 0.008, yl - 0.004, y) * head_side
    # nostrils: small pits on raised rims near the snout tip
    nd = length(Q - NOSTRIL)
    d = d - 0.00035 * np.exp(-((nd - 0.0011) / 0.0005) ** 2) + 0.0007 * np.exp(-(nd / 0.0007) ** 2)
    # tympanum: a flat round disc in a shallow ring, under a low fold that runs back from the eye
    tl = frame(Q, TYMP_C, TYMP_N, (0, 1, 0))
    tr = np.hypot(tl[:, 0], tl[:, 1])
    near_t = sstep(0.006, 0.0, np.abs(tl[:, 2]))
    d = d + (0.00035 * sstep(TYMP_R, TYMP_R - 0.0012, tr) - 0.00025 * np.exp(-((tr - TYMP_R - 0.0002) / 0.0006) ** 2)) * near_t
    fold = round_cone(Q, V(0.0285, 0.0675, 0.0435), V(0.0315, 0.0655, 0.0285), 0.0011, 0.0014)
    fold = smin(fold, round_cone(Q, V(0.0315, 0.0655, 0.0285), V(0.0335, 0.0565, 0.0195), 0.0014, 0.0010), 0.002)
    d = smin(d, fold, 0.0025)
    # vent: a small slit at the back, under the rump
    d = d + groove(length((Q - V(0.0, 0.026, -0.0775)) * V(1, 1.6, 0.6)), 0.0011, 0.0006)
    return d


def eye_parts(P):
    """lid mound around the eye (add), the opening in front of the ball (carve), the ball (add)"""
    Q = _mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0010, -0.0022), V(EYE_R + 0.0022, EYE_R + 0.0030, EYE_R + 0.0016))
    ua = u - LID_OFF
    ap = np.sqrt((s / LID_W) ** 2 + (ua / LID_H) ** 2) - 1
    ap = ap + 0.12 * sstep(0.5, 1.0, np.abs(s) / LID_W) * (np.abs(ua) / LID_H)
    carve = smax(ap * LID_H, -(g + 0.002), 0.001)
    ball = length(D) - EYE_R * 0.9
    return carve, lids, ball


# ---------- limbs ----------
def _lerp(a, b, t):
    return a + (b - a) * t


def thigh(P):
    Q = _mirror(P)
    a, b = HIP + V(-0.004, 0.002, -0.004), KNEE
    m = _lerp(a, b, 0.45) + V(0.0, 0.0015, 0.0)
    return smin(round_cone(Q, a, m, 0.0112, 0.0097), round_cone(Q, m, b, 0.0097, 0.0058), 0.006)


def shin(P):
    Q = _mirror(P)
    a, b = KNEE + V(0.0, -0.0005, 0.0), HEEL
    m = _lerp(a, b, 0.36) + V(0.0005, -0.0012, 0.0)
    return smin(round_cone(Q, a, m, 0.0056, 0.0071), round_cone(Q, m, b, 0.0071, 0.0035), 0.005)


def tarsus(P):
    Q = _mirror(P)
    return round_cone(Q, HEEL + V(0.0, -0.0004, 0.0), HPAW + V(0.0, -0.0006, -0.002), 0.0033, 0.0029)


def _dir(a):
    a = np.radians(a)
    return np.array([np.sin(a), 0.0, np.cos(a)], F)


def _digits(Q, base, toes, y0, spread):
    """toes from a fan point: three phalanges arching a little, a flat round disc at the tip touching the ground"""
    dt, dd = None, None
    for k, t in enumerate(toes):
        a, Ln, r0, r1, rd = t[:5]
        dv = _dir(a)
        p0 = base + dv * spread
        p1 = p0 + dv * Ln * 0.38 + V(0, 0.0004, 0)
        p2 = p0 + dv * Ln * 0.72 + V(0, 0.0002, 0)
        p3 = p0 + dv * Ln
        p0 = p0 + V(0, y0 - p0[1], 0); p1[1] = y0 + 0.0003; p2[1] = y0 - 0.0002; p3[1] = rd * 0.72
        tt = chain(Q, [p0, p1, p2, p3], [r0, r0 * 0.92 + r1 * 0.08, (r0 + r1) * 0.5, r1], 0.0008)
        # joints (subarticular tubercles show from below)
        tt = smin(tt, ellipsoid(Q, p1 + V(0, -0.0006, 0), V(r0 * 0.9, r0 * 0.75, r0 * 0.9)), 0.0006)
        tt = smin(tt, ellipsoid(Q, p2 + V(0, -0.0005, 0), V(r1 * 0.95, r1 * 0.8, r1 * 0.95)), 0.0006)
        c = p3 + dv * (rd * 0.35) + V(0, 0.0001, 0)
        side = np.cross(np.array([0, 1, 0], F), dv)
        L = np.stack([(Q - c) @ side, Q[:, 1] - c[1], (Q - c) @ dv], 1)
        disc = ellipsoid(L, V(0, 0, 0), V(rd, rd * 0.7, rd * 0.95))
        dt = tt if dt is None else np.minimum(dt, tt)
        dd = disc if dd is None else np.minimum(dd, disc)
    return dt, dd


def _webs(Q, base, toes, y0):
    """webbing between neighbouring toes: a thin sheet out to a concave margin (fraction of each toe's length)"""
    D = Q - base
    rho = np.hypot(D[:, 0], D[:, 2])
    th = np.degrees(np.arctan2(D[:, 0], D[:, 2]))
    out = np.full(len(Q), 1.0, F)
    for i in range(len(toes) - 1):
        a0, L0, w0 = toes[i][0], toes[i][1], toes[i][5]
        a1, L1, w1 = toes[i + 1][0], toes[i + 1][1], toes[i + 1][5]
        s = (th - a0) / (a1 - a0)
        R = (_lerp(L0 * w0, L1 * w1, sat(s)) + 0.003) * (1 - 0.22 * np.sin(np.pi * sat(s)))
        dp = rho - R
        da = np.maximum(-s, s - 1) * np.maximum(rho, 0.002) * np.radians(a1 - a0)
        yw = y0 - 0.0009 * sat(rho / 0.02)
        dy = np.abs(Q[:, 1] - yw) - 0.00042
        w = np.maximum(np.maximum(dp, da), dy)
        out = np.minimum(out, w)
    return out


def hind_foot(P):
    """foot fan, toes, discs, webbing (left side, mirrored)"""
    Q = _mirror(P)
    fd = nrm(HPAW - HEEL)
    fan = ellipsoid(frame(Q, HFOOT + V(0.0005, 0.0, 0.002), (fd[0], 0, fd[2]), (0, 1, 0)), V(0, 0, 0), V(0.0058, 0.0021, 0.0068))
    toes, discs = _digits(Q, HFOOT, HTOES, 0.0029, 0.0035)
    web = _webs(Q, HFOOT, HTOES, 0.0029)
    d = smin(fan, toes, 0.0016)
    d = smin(d, web, 0.0009)
    d = smin(d, discs, 0.0007)
    # soft heel pad and the inner metatarsal tubercle on the sole
    d = smin(d, ellipsoid(Q, HFOOT + V(-0.004, -0.0012, -0.003), V(0.0016, 0.0011, 0.0022)), 0.0008)
    return d, discs


def arm(P):
    Q = _mirror(P)
    up = round_cone(Q, SHO + V(-0.006, 0.0, 0.0), ELB, 0.0062, 0.0042)
    fa_m = _lerp(ELB, WRI, 0.3) + V(0.0006, 0.0, 0.0)
    fore = smin(round_cone(Q, ELB, fa_m, 0.0044, 0.0050), round_cone(Q, fa_m, WRI + V(0, 0.0005, 0), 0.0050, 0.0030), 0.004)
    return smin(up, fore, 0.003)


def hand(P):
    Q = _mirror(P)
    hd = nrm((FPAW - WRI) * V(1, 0, 1))
    palm = ellipsoid(frame(Q, _lerp(WRI, FPAW, 0.55) + V(0, -0.001, 0), hd, (0, 1, 0)), V(0, 0, 0), V(0.0042, 0.0022, 0.0075))
    wrist = round_cone(Q, WRI + V(0, 0.0006, 0), _lerp(WRI, FPAW, 0.5) + V(0, -0.0006, 0), 0.0029, 0.0024)
    fing, discs = _digits(Q, FHAND, FTOES, 0.0026, 0.0018)
    d = smin(smin(palm, wrist, 0.002), fing, 0.0014)
    d = smin(d, discs, 0.0006)
    return d, discs


# ---------- assembly ----------
SLIT = 0.0011   # gap kept between folded leg segments (m)


def _fold(a, b, Q, J, rj, k):
    """union of two leg segments folded against each other (thigh and shank, shank and foot): blended at the
    joint J, but kept apart by a thin slit everywhere else, so the skin opens cleanly when the joint does"""
    u = smin(a, b, k)
    far = sstep(rj, rj * 1.5, length(Q - J))
    return smax(u, SLIT - np.abs(a - b) - (1 - far) * 0.01, 0.0014)


FOOT_BOX = (V(-0.125, -0.002, -0.042), V(0.125, 0.012, 0.022))
HAND_BOX = (V(-0.075, -0.002, 0.036), V(0.075, 0.012, 0.09))
EYE_BOX = (V(-0.048, 0.058, 0.038), V(0.048, 0.094, 0.076))


def _legs(P):
    th = _local(P, (-0.095, 0.012, -0.075), (0.095, 0.05, 0.004), thigh)
    sh = _local(P, (-0.085, 0.006, -0.085), (0.085, 0.04, 0.0), shin)
    ta = _local(P, (-0.09, -0.002, -0.085), (0.09, 0.025, -0.01), tarsus)
    return th, sh, ta


def parts(P):
    """named component distances (for paint masks)"""
    th, sh, ta = _legs(P)
    fo, hdisc = _local_n(P, *FOOT_BOX, hind_foot, 2)
    ha, fdisc = _local_n(P, *HAND_BOX, hand, 2)
    ca, li, ba = _local_n(P, *EYE_BOX, eye_parts, 3)
    return {'body': body(P), 'thigh': th, 'shin': sh, 'tarsus': ta, 'foot': fo, 'arm': arm(P), 'hand': ha,
            'disc': np.minimum(hdisc, fdisc), 'lids': li, 'ball': ba, 'carve': ca}


def shape(P):
    d = body(P)
    ca, li, ba = _local_n(P, *EYE_BOX, eye_parts, 3)
    d = smin(d, li, 0.009)
    d = smax(d, -ca, 0.0008)
    d = smin(d, ba, 0.0006)
    th, sh, ta = _legs(P)
    fo, _ = _local_n(P, *FOOT_BOX, hind_foot, 2)
    Q = _mirror(P)
    leg = _fold(th, sh, Q, KNEE, 0.0066, 0.003)
    leg = _fold(leg, ta, Q, HEEL, 0.0045, 0.0022)
    leg = smin(leg, fo, 0.0022)
    d = smin(d, leg, 0.005)
    ar = _local(P, (-0.06, -0.002, 0.008), (0.06, 0.06, 0.06), arm)
    ha, _ = _local_n(P, *HAND_BOX, hand, 2)
    d = smin(d, smin(ar, ha, 0.0022), 0.0045)
    d = d + _local(P, (-0.11, 0.0, -0.095), (0.11, 0.094, 0.1), folds, far=0.0)
    return d


def folds(P):
    """creases carved into the surface (meters) at the elbow, knee, heel and wrist"""
    Q = _mirror(P)
    c = np.zeros(len(P), F)
    for j, r in ((ELB, 0.008), (KNEE, 0.009), (HEEL, 0.006), (WRI, 0.005)):
        dj = length(Q - j)
        c += 0.00025 * sstep(r, r * 0.4, dj) * (0.5 + 0.5 * vnoise(Q * 900, 7))
    return c


# ---------- skinning ----------
WEIGHT_SMOOTH = (0, 0)   # no smoothing pass: fix_weights builds every weight itself, blends included


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['head'], 'head': MOUTH + V(0, 0, 0.004)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (HFOOT + _dir(40) * 0.03) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (FHAND + _dir(10) * 0.016) * m
    return t


def keep(P):
    """decimation priority, 0..0.85 (1 would lock a vertex). The frog's small features (toes, discs, lids) hold on
    to triangles by their curvature alone, so here the smooth body and limbs are protected instead (they need
    triangles to bend well), and the hidden eyeball inside the game's eye sphere gets none."""
    Pm = np.abs(P) * V(1, 0, 0) + P * V(0, 1, 1)
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    ball = sstep(EYE_R * 0.97, EYE_R * 0.8, de)
    k = np.maximum(KEEP[0] * sstep(0.004, 0.012, Pm[:, 1]), KEEP[1] * sstep(0.012, 0.004, Pm[:, 1]))
    n = sstep(0.006, 0.002, np.linalg.norm(Pm - NOSTRIL, axis=1)) * 0.8
    t = sstep(0.008, 0.004, np.linalg.norm(Pm - TYMP_C, axis=1)) * 0.75
    lip = sstep(0.003, 0.0008, np.abs(Pm[:, 1] - _lip_y(Pm[:, 2]))) * sstep(0.03, 0.036, Pm[:, 2]) * 0.8
    rim = sstep(EYE_R + 0.004, EYE_R + 0.0015, de) * sstep(EYE_R * 0.9, EYE_R * 1.0, de) * 0.85
    _, hd = _local_n(P, *FOOT_BOX, hind_foot, 2)
    _, fd = _local_n(P, *HAND_BOX, hand, 2)
    disc = sstep(0.0012, 0.0002, np.minimum(hd, fd)) * 0.85
    return np.maximum.reduce([k, n, t, lip, rim, disc]) * (1 - ball)


KEEP = (0.55, 0.8)   # body and limbs, hands and feet


def _seg_t(P, a, b):
    ab = b - a
    t = ((P - a) @ ab) / float(ab @ ab)
    return np.clip(t, 0, 1), t


def fix_weights(W, wpos, names, G, weld):
    """weights from the sculpt's own parts: each vertex belongs to the part it lies on (body, thigh, shin, tarsus,
    foot, upper arm, forearm, hand); the body blends hips, chest and head along its length, and each limb part
    blends with its neighbour only close to the joint between them, so the folded leg can open for a hop."""
    bi = {n: i for i, n in enumerate(names)}
    Wn = np.zeros_like(W)
    P = wpos.astype(F)
    side = np.where(P[:, 0] >= 0, 'L', 'R')
    c = parts(P)
    Q = _mirror(P)
    # split the arm into upper arm and forearm by the elbow
    tu, _ = _seg_t(Q, SHO, ELB)
    tf, _ = _seg_t(Q, ELB, WRI)
    du = length(Q - (SHO + (ELB - SHO) * tu[:, None]))
    dfo = length(Q - (ELB + (WRI - ELB) * tf[:, None]))
    keys = ['body', 'thigh', 'shin', 'tarsus', 'foot', 'arm', 'hand']
    D = np.stack([c[k] for k in keys], 1)
    D[:, 0] += 0.0012           # ties go to the limbs (the limb surface near the body is the limb)
    own = np.argmin(D, 1)
    z = P[:, 2]
    # body: hips -> chest -> head along z
    wh = sstep(0.026, 0.046, z)
    wc = sstep(-0.034, 0.006, z) * (1 - wh)
    wp = 1 - wh - wc
    isb = own == 0
    for n, w in (('hips', wp), ('chest', wc), ('head', wh)):
        Wn[isb, bi[n]] = w[isb]

    def put(mask, bone, w):
        w = np.maximum(w, 0)
        for s in 'LR':
            m = mask & (side == s)
            Wn[m, bi[bone + s]] += w[m]

    def put_body(mask, w):
        for n, ww in (('hips', wp), ('chest', wc), ('head', wh)):
            Wn[mask, bi[n]] += (w * ww)[mask]

    # legs: thigh (hips at the groin), shin, tarsus, foot
    tt, _ = _seg_t(Q, HIP, KNEE)
    ts, _ = _seg_t(Q, KNEE, HEEL)
    ta, _ = _seg_t(Q, HEEL, HPAW)
    lt = float(np.linalg.norm(KNEE - HIP)); ls = float(np.linalg.norm(HEEL - KNEE)); la = float(np.linalg.norm(HPAW - HEEL))
    j = 0.0045      # half width of the blend across a joint (m)

    def jb(dist):   # weight of the other bone at a distance from the joint (0.5 at the joint, 0 at j)
        return 0.5 * sstep(j, 0.0, dist)

    m = own == 1    # thigh: blend to hips near the groin (the thigh root sits inside the rump)
    g = sstep(0.022, 0.010, tt * lt)
    k = jb((1 - tt) * lt)
    put(m, 'thigh', 1 - g * 0.65 - k); put_body(m, g * 0.65); put(m, 'shin', k)
    m = own == 2
    k0, k1 = jb(ts * ls), jb((1 - ts) * ls)
    put(m, 'shin', 1 - k0 - k1); put(m, 'thigh', k0); put(m, 'hmeta', k1)
    m = own == 3
    k0, k1 = jb(ta * la), jb((1 - ta) * la) * 0.6
    put(m, 'hmeta', 1 - k0 - k1); put(m, 'shin', k0); put(m, 'hpaw', k1)
    m = own == 4    # foot: toes on the toe bone, the fan blends back into the tarsus
    dh = (Q - HFOOT) @ nrm(HPAW - HEEL)
    k = sstep(0.003, -0.004, dh) * 0.5
    put(m, 'hpaw', 1 - k); put(m, 'hmeta', k)
    # arms: upper arm (chest at the shoulder), forearm, hand
    m = (own == 5) & (du <= dfo)
    lu = float(np.linalg.norm(ELB - SHO)); lf = float(np.linalg.norm(WRI - ELB))
    g = sstep(0.011, 0.004, tu * lu)
    k = jb((1 - tu) * lu)
    put(m, 'arm', 1 - g * 0.6 - k); put_body(m, g * 0.6); put(m, 'fore', k)
    m = (own == 5) & (du > dfo)
    k0, k1 = jb(tf * lf), jb((1 - tf) * lf) * 0.8
    put(m, 'fore', 1 - k0 - k1); put(m, 'arm', k0); put(m, 'fmeta', k1)
    m = own == 6    # hand: palm on the hand bone, fingers on the finger bone
    hd = nrm((FPAW - WRI) * V(1, 0, 1))
    dh = (Q - FHAND) @ hd
    k = sstep(-0.002, 0.003, dh)
    k0 = 0.4 * sstep(0.004, -0.002, (Q - WRI) @ hd)
    put(m, 'fmeta', (1 - k) * (1 - k0)); put(m, 'fpaw', k * (1 - k0)); put(m, 'fore', k0)
    Wn[:, bi['ctag']] = 0
    s = Wn.sum(1, keepdims=True)
    return np.where(s > 0, Wn / np.maximum(s, 1e-9), W)


# ---------- skin paint (sRGB 0..1) and fine detail (meters), evaluated on the baked surface ----------
def _hex(h):
    return np.array([((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255], F)


K = {
    'green': _hex(0x52922B), 'greenDk': _hex(0x2E661C), 'greenYl': _hex(0x7EAC36), 'olive': _hex(0x4D6A26),
    'stripe': _hex(0xEAE5CB), 'stripeDk': _hex(0x3E4F22), 'belly': _hex(0xE4DDC4), 'bellyWarm': _hex(0xDCCDB0),
    'throat': _hex(0xE2D896), 'hidden': _hex(0xC9A54A), 'sole': _hex(0xCDB79A), 'disc': _hex(0xB2BC70),
    'gold': _hex(0xE9C34A), 'ball': _hex(0x6E5520), 'nostril': _hex(0x1F2A12), 'tymp': _hex(0x6C8E33), 'lipDk': _hex(0x2E3A1A),
}


def _mix(c, k, t):
    t = np.clip(t, 0, 1)[:, None]
    return c + (k - c) * t


def _stripe_y(z):
    """height of the white side stripe: along the upper lip, under the tympanum, over the arm, along the flank"""
    zz = np.array([-0.075, -0.062, -0.04, -0.015, 0.004, 0.016, 0.025, 0.031, 0.042, 0.056, 0.072, 0.088], F)
    yy = np.array([0.0300, 0.0262, 0.0252, 0.0268, 0.0300, 0.0375, 0.0435, 0.0490, 0.0526, 0.0551, 0.0575, 0.0597], F)
    return np.interp(z, zz, yy).astype(F)


def _regions(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    r = {}
    Pm = P.copy(); Pm[:, 0] = np.abs(x)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(x + 1e-9)
    names = ['body', 'thigh', 'shin', 'tarsus', 'foot', 'arm', 'hand']
    D = np.stack([c[k] for k in names], 1)
    own = np.argmin(D + np.array([0.0006, 0, 0, 0, 0, 0, 0], F), 1)
    for i, n in enumerate(names):
        r[n] = (own == i).astype(F)
    r['limb'] = 1 - r['body']
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    r['ball'] = sstep(0.0008, 0.0002, c['ball']) * sstep(EYE_R + 0.002, EYE_R * 0.95, de)
    r['lid'] = sstep(EYE_R + 0.004, EYE_R + 0.0012, de) * (1 - r['ball'])
    r['eyeD'] = de
    r['disc'] = sstep(0.0006, 0.0001, c['disc'])
    r['top'] = sstep(-0.1, 0.55, N[:, 1])
    r['down'] = sstep(-0.05, -0.6, N[:, 1])
    r['Pm'] = Pm; r['Nm'] = Nm
    return r


def paint(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    R = _regions(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    n1 = fbm(Pm * 60, 3, 11)
    n2 = fbm(Pm * 260, 3, 12)
    bd = R['body']
    col = np.tile(K['green'], (len(P), 1))
    # body: green back and upper sides, the white stripe, pale cream belly below it
    sy = _stripe_y(z)
    head = sstep(0.03, 0.04, z)
    lat = sstep(0.004, 0.012, Pm[:, 0]) * sstep(-0.07, -0.06, z) * sstep(0.093, 0.085, z) + sstep(0.085, 0.092, z) * sstep(0.0, 0.004, Pm[:, 0])
    wob = 0.0007 * (fbm(Pm * V(20, 20, 140), 2, 13) - 0.5)
    sw = 0.0018 + 0.0002 * head
    ds = y - sy - wob
    stripe = sstep(sw + 0.0005, sw - 0.0004, np.abs(ds)) * lat * bd
    border = sstep(0.0011, 0.0003, np.abs(ds + sw + 0.0008)) * lat * bd * (1 - head * 0.6) * sstep(0.35, 0.6, vnoise(Pm * V(10, 10, 160), 14))
    below = sstep(0.0003, -0.0012, ds) * bd
    col = _mix(col, K['greenYl'], R['top'] * 0.18 * bd + head * R['top'] * 0.12)
    col *= (0.9 + 0.17 * n1)[:, None]
    s1, _ = worley(Pm / 0.0021, 23)
    speck = sstep(0.2, 0.1, s1) * (vnoise(np.floor(Pm / 0.0021) + 0.5, 24) > 0.55) * R['top'] * (1 - below) * (1 - head * 0.5)
    col = _mix(col, K['greenDk'] * 0.8, speck * 0.35)
    col = _mix(col, K['greenDk'], sstep(0.62, 0.8, n1) * 0.25)
    col = _mix(col, K['belly'], below)
    col = _mix(col, K['bellyWarm'], below * R['down'] * sstep(-0.02, -0.05, z) * 0.35)
    # throat: yellowish and a little wrinkled (calling male)
    thr = below * sstep(0.03, 0.045, z) * sstep(0.003, 0.0, ds + 0.004)
    col = _mix(col, K['throat'], thr * 0.7)
    # the pale belly shows a little green through at the edge
    col = _mix(col, K['greenYl'], below * sstep(-0.004, 0.0, ds) * 0.25)
    col = _mix(col, K['stripeDk'], border * 0.5)
    col = _mix(col, K['stripe'], stripe)
    # white line above the vent
    vent = sstep(0.0012, 0.0004, np.abs(y - 0.034 - 0.25 * Pm[:, 0])) * sstep(-0.069, -0.075, z) * sstep(0.011, 0.006, Pm[:, 0])
    col = _mix(col, K['stripe'], vent * 0.45)
    # a few small gold flecks with dark rims on the back
    f1, _ = worley(Pm * 330, 21)
    live = vnoise(np.floor(Pm * 330) + 0.5, 22) > 0.8
    sp = sstep(0.24, 0.16, f1) * live * R['top'] * bd * (1 - head * 0.6)
    rim = sstep(0.33, 0.25, f1) * live * R['top'] * bd * (1 - head * 0.6) * (1 - sp)
    col = _mix(col, K['olive'], rim * 0.5)
    col = _mix(col, K['gold'], sp * 0.85)
    # limbs: green on top, pale flesh underneath, yellowish on the hidden back of the thigh
    lm = R['limb']
    pale = sstep(0.1, -0.45, N[:, 1]) * lm
    col = _mix(col, K['bellyWarm'], pale * 0.85)
    hid = (R['thigh'] + R['shin'] * 0.6) * sstep(0.0, 0.7, -Nm[:, 2] * 0.6 - Nm[:, 0] * 0.4 - N[:, 1] * 0.4)
    col = _mix(col, K['hidden'], hid * 0.45)
    # white lines along the outer edge of the forearm and of the foot
    fl = R['arm'] * sstep(0.35, 0.8, -Nm[:, 2] * 0.7 + Nm[:, 0] * 0.5) * sstep(0.0, 0.3, N[:, 1] + 0.3) * sstep(0.03, 0.02, y)
    col = _mix(col, K['stripe'], fl * 0.4)
    tl_ = R['tarsus'] * sstep(0.45, 0.85, Nm[:, 0]) * sstep(-0.3, 0.2, N[:, 1])
    col = _mix(col, K['stripe'], tl_ * 0.45)
    # hands and feet: soles and the undersides of the toes tan, the discs pale
    ft = R['foot'] + R['hand']
    col = _mix(col, K['sole'], ft * sstep(-0.1, -0.6, N[:, 1]) * 0.85)
    col = _mix(col, K['greenYl'], ft * R['top'] * 0.25)
    col = _mix(col, K['disc'], R['disc'] * 0.55)
    # face: nostrils, the tympanum (a slightly browner disc), dark lip line, lids
    nd = np.linalg.norm(Pm - NOSTRIL, axis=1)
    col = _mix(col, K['nostril'], sstep(0.0009, 0.0004, nd))
    tl = frame(Pm, TYMP_C, TYMP_N, (0, 1, 0))
    tr = np.hypot(tl[:, 0], tl[:, 1])
    col = _mix(col, K['tymp'], sstep(TYMP_R - 0.0003, TYMP_R - 0.0015, tr) * sstep(0.004, 0.0, np.abs(tl[:, 2])) * 0.55)
    lip = sstep(0.0005, 0.0001, np.abs(y - _lip_y(z))) * sstep(0.029, 0.034, z)
    col = _mix(col, K['lipDk'], lip * 0.4)
    col = _mix(col, K['greenDk'], R['lid'] * sstep(EYE_R + 0.0025, EYE_R + 0.0008, R['eyeD']) * 0.35)
    col = _mix(col, K['ball'], R['ball'])
    col *= (0.97 + 0.06 * n2)[:, None]
    g1, _ = worley(Pm / GRAN, 51)
    gtop = sat(1 - g1 / 0.62) ** 1.6
    col *= (0.94 + 0.09 * gtop * (1 - R['disc']))[:, None]
    # wet skin: glossy back, a little less on the belly and soles
    rough = 0.30 + 0.06 * (n2 - 0.5) + 0.12 * below + 0.14 * ft * sstep(-0.1, -0.6, N[:, 1]) + 0.05 * pale
    rough = rough - 0.06 * R['lid'] - 0.04 * R['disc']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.18, 0.9).astype(F)


def detail(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    R = _regions(P, N, c)
    Pm = R['Pm']
    h = np.zeros(len(P), F)
    skin = 1 - R['ball']
    ds = y - _stripe_y(z)
    below = sstep(0.0003, -0.0012, ds) * R['body']
    ft = R['foot'] + R['hand']
    # back and limbs: fine low granules (only when the maps are fine enough to hold them, else they are noise)
    if GRAN_H:
        f1, f2 = worley(Pm / GRAN, 51)
        gran = sat(1 - f1 / 0.62) ** 1.6
        h += GRAN_H * gran * skin * (1 - below) * (1 - R['disc']) * (1 - ft * 0.5)
    h += 0.00009 * (fbm(Pm * 300, 2, 57) - 0.5) * skin * (1 - R['disc'])
    # belly: larger, flatter areolate granules (smoother to the eye)
    g1, g2 = worley(Pm / 0.0026, 52)
    h += 0.00003 * sstep(0.0, 0.25, g2 - g1) * below * (1 - sstep(0.04, 0.05, z))
    # throat: fine folds of the vocal sac across the throat
    th = below * sstep(0.035, 0.05, z) * sstep(0.088, 0.078, z)
    wr = np.abs(np.sin(np.pi * (z / 0.0014 + 0.6 * fbm(Pm * 200, 2, 53))))
    h -= 0.00007 * np.exp(-(wr / 0.3) ** 2) * th
    # eyelid: concentric creases on the upper lid
    er = np.abs(np.sin(np.pi * (R['eyeD'] / 0.0007 + 0.5 * fbm(Pm * 300, 2, 54))))
    h -= 0.00004 * np.exp(-(er / 0.35) ** 2) * R['lid']
    # creases across the joints and the folded skin of the groin and armpit
    for jc, r in ((KNEE, 0.007), (ELB, 0.006), (HEEL, 0.005), (WRI, 0.004)):
        dj = np.linalg.norm(Pm - jc, axis=1)
        cr = np.abs(np.sin(np.pi * (dj / 0.0011 + 0.4 * fbm(Pm * 400, 2, 55))))
        h -= 0.00005 * np.exp(-(cr / 0.3) ** 2) * sstep(r, r * 0.4, dj)
    # soles and toe undersides: tubercles; disc rims
    t1, _ = worley(Pm / 0.0007, 56)
    h += 0.00004 * sat(1 - t1 / 0.5) * ft * sstep(-0.1, -0.6, N[:, 1])
    h -= 0.00004 * sstep(0.0004, 0.0001, np.abs(c['disc'] + 0.0002)) * R['disc']
    return h


def finish(C, ao, valid):
    """fold ambient occlusion into the color (linear light)"""
    lin = np.where(C <= 0.04045, C / 12.92, ((C + 0.055) / 1.055) ** 2.4)
    # the slits between the folded leg segments open up in a hop: keep them from going black
    lin = lin * (0.25 + 0.75 * np.maximum(ao, 0.4)[..., None])
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(np.maximum(lin, 0), 1 / 2.4) - 0.055)


# ---------- what the game needs besides the mesh ----------
MAP_QUALITY = (84, 86)   # WebP quality: color, normal
GRAN, GRAN_H = 0.0013, 0.00005   # granules on the back: cell size, height (m); about 3 texels a cell at 512


def stats(P, N, c, col):
    R = _regions(P, N, c)
    m = R['lid'] * sstep(EYE_R + 0.003, EYE_R + 0.0012, R['eyeD'])
    lid = (col * m[:, None]).sum(0) / max(m.sum(), 1e-6) * 0.9
    return {'lidCol': int(round(lid[0] * 255)) << 16 | int(round(lid[1] * 255)) << 8 | int(round(lid[2] * 255))}


def meta(st):
    r = EYE_R
    up, dn = (LID_OFF + LID_H) / r, (LID_OFF - LID_H) / r
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.35],
                'iris': 0xD3A535, 'irisR': 0.97, 'pupil': 'h', 'pupilR': 0.29, 'irisNet': 1, 'rim': 0x3A2C12, 'sclera': 0x6A5420, 'lidCol': st['lidCol']},
        # frogs have no neck: the band sits on the nape, its plane leaning forward at the bottom to pass behind the
        # arms, and the slice ignores the hands and toes beyond maxR
        'collar': {'at': ['chest', 'head', 0.347], 'tilt': 0.773, 'maxR': 0.048},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.03, 1.0, 0.88], 'rim': [0.08, 0.12, 0.03], 'flat': 0x5E9A34,
    }
