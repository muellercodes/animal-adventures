# The plains zebra (round 15), refitted from the horse (horse.py): smaller and stockier, about 1.33 m at the shoulder
# and 2.3 m from the nose to the rump, with a short upright mane (sculpted, striped, a fringe of hair cards on top), big
# rounded ears, a thin tail with a black tassel and the Burchell's zebra coat: bold black and white stripes, vertical on
# the barrel, bands round the neck, nearly level over the haunch with a chevron saddle on top of the rump and pale brown
# shadow stripes between the black ones there, rings down the legs, fine lines on the face, a black muzzle, a dark line
# along the spine and another under the belly. The foal has its own map: brown stripes on cream.
#
# The horse's field is used as it is, in horse rig space (horse.py is imported as H, and the parts that differ, the
# ears, the mane, the tail and the coat's flow, are replaced in that module). The zebra's rig is the horse's mapped by
# fwd() (SPEC.zebra and zebraFit in game/src/40_animals.js use the same numbers): an overall scale ZS, the legs shorter
# by KL between the pasterns and the body (smooth ramps, so the hooves and the body keep their shape), a little wider
# (KX) and longer (KZ). Every pipeline hook here takes zebra rig points, maps them back with inv() and calls the horse's
# code; part distances (the paint masks) stay in horse units, heights and fur lengths are scaled back to meters.
import os, sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, sweep, fbm, vnoise, worley
import horse as H

ID = 'zebra'
ZS, KL, KX, KZ = 0.87, 0.86, 1.04, 1.03


# ---------- the refit: horse rig space <-> zebra rig space ----------
def _I(a, b, t):
    x = np.clip((t - a) / (b - a), 0, 1)
    return (b - a) * (x ** 3 - 0.5 * x ** 4) + np.maximum(0, t - b)


def _dI(a, b, t):
    x = np.clip((t - a) / (b - a), 0, 1)
    return x * x * (3 - 2 * x)


def yfwd(y):
    return y + (KL - 1) * _I(0.24, 0.34, y) + (1 - KL) * _I(0.98, 1.18, y)


def ydif(y):
    return 1 + (KL - 1) * _dI(0.24, 0.34, y) + (1 - KL) * _dI(0.98, 1.18, y)


_YT = np.linspace(-0.4, 3.2, 72001)
_YF = yfwd(_YT)


def fwd(Ph):
    """horse rig points -> zebra rig points"""
    Ph = np.atleast_2d(np.asarray(Ph, np.float64))
    return np.stack([ZS * KX * Ph[:, 0], ZS * yfwd(Ph[:, 1]), ZS * KZ * Ph[:, 2]], 1).astype(F)


def fwd1(p):
    return fwd(np.asarray(p)[None])[0]


def inv(P):
    """zebra rig points -> horse rig points"""
    P = np.atleast_2d(np.asarray(P, np.float64))
    return np.stack([P[:, 0] / (ZS * KX), np.interp(P[:, 1] / ZS, _YF, _YT), P[:, 2] / (ZS * KZ)], 1).astype(F)


def _dsc(Q):
    """field scale at a horse point (the smallest stretch, so the zebra field stays a distance bound)"""
    return (ZS * np.minimum(ydif(Q[:, 1]), min(KX, KZ))).astype(F)


def _dirs(Q, D):
    """directions at horse points -> zebra space (unit)"""
    J = np.stack([np.full(len(Q), KX), ydif(Q[:, 1]), np.full(len(Q), KZ)], 1)
    E = D * J
    return (E / np.maximum(np.linalg.norm(E, axis=1, keepdims=True), 1e-9)).astype(F)


# ---------- horse-space parts that differ (installed into the horse module) ----------
# ears: bigger, broader and rounded at the tip, cupped forward
H.EAR_L = 0.22
EAR_W = 0.056


def zear(P):
    Q = H._mirror(P)
    B, A, Nn = H.EAR_B, H.EAR_A, H.EAR_N
    C = np.cross(Nn, A)
    D = Q - B
    a, c, n = D @ A, D @ C, D @ Nn
    L = H.EAR_L
    u = np.clip(a / L, 0, 1)
    um = 0.48
    hw = np.where(u < um, EAR_W * (0.6 + 0.4 * np.sqrt(u / um)), EAR_W * np.sqrt(np.clip(1 - ((u - um) / (1 - um)) ** 2, 0, 1))) + 0.0015
    k = np.clip(c / np.maximum(hw, 1e-4), -1.2, 1.2)
    mid = hw * k * k * 0.62 * (1 - 0.45 * u) - 0.012 * (1 - u) ** 1.5
    th = 0.5 * (0.012 * (1 - u) + 0.0042 * u)
    d_out = np.abs(c) - hw
    d_th = np.abs(n - mid) - th
    d_end = np.maximum(-a, a - L * 1.03)
    d = smax(smax(d_out, d_th, 0.003), d_end, 0.004)
    d = smin(d, ellipsoid(Q, B + A * 0.014 - Nn * 0.012, V(0.036, 0.031, 0.03)), 0.014)
    return d


H.ear = zear

# the mane: a short stiff upright plate along the crest from the withers to the poll (path y, z; height above the crest
# line; depth into the neck; half width)
MANE = [(1.565, 0.35, 0.045, 0.03, 0.013, 2.0, 2.0),
        (1.66, 0.51, 0.09, 0.03, 0.017, 2.0, 2.0),
        (1.75, 0.66, 0.112, 0.03, 0.019, 2.0, 2.0),
        (1.82, 0.77, 0.118, 0.03, 0.019, 2.0, 2.0),
        (1.885, 0.865, 0.112, 0.03, 0.018, 2.0, 2.0),
        (1.945, 0.975, 0.088, 0.03, 0.016, 2.0, 2.0),
        (1.975, 1.035, 0.06, 0.028, 0.014, 2.0, 2.0)]
MBOX = ((-0.07, 1.48, 0.28), (0.07, 2.16, 1.12))


def zmane(P):
    Q = H._mirror(P)
    d = sweep(Q, MANE, n=64)
    # a little uneven along its top, where the hair ends
    return d + 0.004 * (vnoise(Q * V(40, 30, 40), 81) - 0.5)


# the tail: a long thin dock hanging from the croup to the hocks (the tassel at its end is hair cards)
TAIL_K = np.array([(1.535, -0.955), (1.505, -0.998), (1.43, -1.058), (1.31, -1.097), (1.13, -1.12), (0.97, -1.13), (0.83, -1.128)], np.float64)


def htail_curve(n=40):
    from scipy.interpolate import PchipInterpolator
    seg = np.linalg.norm(np.diff(TAIL_K, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    f = PchipInterpolator(s, TAIL_K, axis=0)
    u = np.linspace(0, 1, n + 1)
    yz = f(u * s[-1])
    pts = np.stack([np.zeros(n + 1), yz[:, 0], yz[:, 1]], 1).astype(F)
    rad = (0.044 * (1 - u) ** 1.4 + 0.02 * (1 - (1 - u) ** 1.4)).astype(F)
    return pts, rad


H.tail_curve = htail_curve


def tail_t(Q):
    """place along the dock (0 root .. 1 tip) and distance from its middle line, for horse points"""
    tp, tr = htail_curve(60)
    from scipy.spatial import cKDTree
    i = cKDTree(tp).query(Q)[1]
    return (i / 60.0).astype(F), np.linalg.norm(Q - tp[i], axis=1).astype(F)


def hshape(P):
    """the horse's shape() with the zebra's ears, mane and the box the bigger ears need"""
    _l, _ln = H._local, H._local_n
    d = H.trunk(P)
    d = smin(d, _l(P, (-0.32, 1.1, 0.25), (0.32, 2.05, 1.15), H.neck), 0.08)
    d = smin(d, _l(P, *MBOX, zmane), 0.014)
    h = _l(P, (-0.17, 1.25, 0.72), (0.17, 2.06, 1.56), H.head)
    ca, li, ba, br = _ln(P, (-0.15, 1.72, 1.09), (0.15, 1.9, 1.27), H.eye_parts, 4)
    h = smin(h, li, 0.012)
    h = smin(h, br, 0.012)
    h = smax(h, -ca, 0.004)
    h = smin(h, ba, 0.0015)
    d = smin(d, h, 0.045)
    d = d + _l(P, (-0.17, 1.4, 0.75), (0.17, 2.0, 1.25), H.jawline, far=0.0)
    d = smin(d, _l(P, (-0.24, 1.86, 0.9), (0.24, 2.3, 1.28), zear), 0.012)
    fl = _l(P, (-0.3, 0.2, 0.1), (0.3, 1.25, 0.45), H.fleg)
    d = smin(d, fl, 0.06)
    hl = _l(P, (-0.36, 0.22, -1.1), (0.36, 1.5, -0.3), H.hleg)
    d = smin(d, hl, 0.06)
    fp = _l(P, (-0.24, 0.08, 0.22), (0.24, 0.29, 0.38), H.fpastern)
    hpp = _l(P, (-0.25, 0.08, -0.81), (0.25, 0.29, -0.65), H.hpastern)
    d = smin(d, smin(fp, hpp, 0.0), 0.02)
    ho = _l(P, (-0.26, -0.01, 0.28), (0.26, 0.12, 0.45), H.hooves)
    ho = np.minimum(ho, _l(P, (-0.27, -0.01, -0.75), (0.27, 0.12, -0.58), H.hooves))
    d = smin(d, ho, 0.008)
    d = d + _l(P, (-0.36, 0.6, -1.1), (0.36, 1.8, 0.75), H.folds, far=0.0)
    return d


H.shape = hshape
_h_flow = H.flow


def zflow_h(P, N=None):
    """the coat's direction (horse space): the horse's, with the mane's hair standing up and the tail's hanging down"""
    f = _h_flow(P, N)
    Q = H._mirror(P)
    m = sstep(0.012, 0.0, zmane(P) - H.neck(P)) * H._box(Q, np.array(MBOX[0], F) - 0.02, np.array(MBOX[1], F) + 0.02)
    up = np.tile(nrm(V(0.0, 0.85, -0.53)), (len(P), 1))
    t, r = tail_t(Q)
    tw = sstep(0.07, 0.05, r) * sstep(0.0, 0.08, t) * (Q[:, 2] < -0.9)
    dn = np.tile(V(0.0, -1.0, -0.1), (len(P), 1))
    f = f * (1 - m - tw)[:, None] + up * m[:, None] + dn * tw[:, None]
    f = f / np.maximum(np.linalg.norm(f, axis=1, keepdims=True), 1e-9)
    return f.astype(F)


H.flow = zflow_h

# ---------- pipeline hooks (zebra rig space) ----------
BOUNDS = (fwd1(V(-0.42, 0.0, -1.16)), fwd1(V(0.42, 2.3, 1.56)))
_HP = [p for p in H.PATCHES]
_HP[2] = (V(0.02, 1.93, 0.96), V(0.175, 2.26, 1.22), 0.0012)     # the bigger ear
PATCHES = [(fwd1(lo), fwd1(hi), v * ZS) for lo, hi, v in _HP]
TAIL_RINGS = 18
WEIGHT_SMOOTH = H.WEIGHT_SMOOTH
UV_AVERAGE = True


def shape(P):
    Q = inv(P)
    return (hshape(Q) * _dsc(Q)).astype(F)


def parts(P):
    """the horse's part distances (horse units) at the zebra points, plus the mane"""
    Q = inv(P)
    c = H.parts(Q)
    c['mane'] = H._local(Q, *MBOX, zmane)
    return c


def tail_curve(n=40):
    p, r = htail_curve(n)
    return fwd(p), (r * ZS).astype(F)


def keep(P):
    Q = inv(P)
    k = H.keep(Q)
    m = sstep(0.01, 0.0, H._local(Q, *MBOX, zmane) - H.neck(Q)) * 0.6
    return np.maximum(k, m).astype(F)


def uv_regions(P):
    Q = inv(P)
    lab = H.uv_regions(Q)
    m = (H._local(Q, *MBOX, zmane) < H.neck(Q) - 0.004) & (Q[:, 1] > 1.55)
    lab[m] = 8
    return lab


def uv_weight(P):
    """the face gets the most texels (its fine stripes), the lower legs a little more, the belly less"""
    Q = inv(P)
    Pm = np.abs(Q) * V(1, 0, 0) + Q * V(0, 1, 1)
    L = H.hframe(Pm)
    head = sstep(-0.08, 0.0, L[:, 2]) * sstep(0.85, 0.95, Pm[:, 2])
    leg = sstep(0.75, 0.55, Pm[:, 1])
    under = sstep(1.1, 1.0, Pm[:, 1]) * sstep(0.9, 1.0, Pm[:, 1]) * sstep(0.12, 0.06, Pm[:, 0])
    return (0.95 + 1.05 * head + 0.2 * leg - 0.3 * under).astype(F)


def fix_weights(W, wpos, names, G, weld):
    """the horse's weights (at the horse points); the long dock on the three tail bones by height"""
    Q = inv(wpos)
    W = H.fix_weights(W, Q, names, G, weld)
    bi = {n: i for i, n in enumerate(names)}
    tail = np.zeros(len(wpos), bool); tail[weld[G['tail']]] = True
    if tail.any():
        y = Q[tail, 1]
        w2, w3 = sstep(1.36, 1.2, y), sstep(1.04, 0.88, y)
        W[tail] = 0
        W[tail, bi['tail1']] = 1 - w2
        W[tail, bi['tail2']] = w2 - w3
        W[tail, bi['tail3']] = w3
    return W


def flow(P, N=None):
    Q = inv(P)
    return _dirs(Q, zflow_h(Q, N))


# ---------- the stripes (horse space) ----------
NECK_LINE = None


def _neck_s(Q):
    """arc length along the neck's middle line (0 at its base, about 0.75 at the poll; negative below the base)"""
    global NECK_LINE
    if NECK_LINE is None:
        K = np.array(H.NECK, np.float64)[:, :2]
        K = np.concatenate([[K[0] - (K[1] - K[0]) * 1.5], K, [K[-1] + (K[-1] - K[-2]) * 1.2]])
        pts = []
        for i in range(len(K) - 1):
            for t in np.linspace(0, 1, 40, endpoint=False):
                pts.append(K[i] + (K[i + 1] - K[i]) * t)
        pts.append(K[-1])
        pts = np.array(pts)
        arc = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
        b = np.array(H.NECK[0][:2])
        arc -= arc[np.argmin(np.linalg.norm(pts - b, axis=1))]
        NECK_LINE = (pts, arc)
    pts, arc = NECK_LINE
    from scipy.spatial import cKDTree
    yz = np.stack([Q[:, 1], Q[:, 2]], 1)
    i = cKDTree(pts).query(yz)[1]
    i0 = np.clip(i, 0, len(pts) - 2)
    a, b = pts[i0], pts[i0 + 1]
    d = b - a
    t = np.clip(((yz - a) * d).sum(1) / np.maximum((d * d).sum(1), 1e-12), -1, 2)
    return (arc[i0] + t * (arc[i0 + 1] - arc[i0])).astype(F)


# stripe spacing (horse units, one black and one white stripe)
LAM = {'body': 0.128, 'neck': 0.135, 'haunch': 0.16, 'face': 0.026}
HC = (1.0, -0.4)            # the haunch's stripes fan out from the flank fold here (y, z): upright over the rear flank,
FAN_R = 0.6                 # rising back over the haunch toward the tail, level at the back of the thigh


def _leg_phase(y):
    # rings down the legs, closer together toward the hooves (spacing 0.075 at the top, 0.035 at the fetlock)
    f0, f1 = 13.3, 20.4
    return (f0 * y + f1 * (y - 0.5 * y * y)).astype(F)


def _phase(Q, c, N):
    """stripe phase (in stripes, one black and one white per unit) and the region weights, at horse points"""
    Pm = H._mirror(Q)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    # barrel: upright stripes, a little forward at the bottom
    ph = (0.3 - z - 0.12 * (1.3 - y)) / LAM['body']
    # haunch: a fan from the flank fold, with the chevron saddle on top of the rump (each stripe meets its mirror image
    # on the spine a little behind where it crosses the top of the haunch)
    dy, dz = y - HC[0], HC[1] - z
    rr = np.sqrt(dy * dy + dz * dz)
    top = sstep(1.4, 1.55, y) * sstep(-0.35, -0.55, z)
    phh = (np.arctan2(dz, dy) * FAN_R + 0.5 * x * top) / LAM['haunch']
    wh = sstep(-0.12, -0.42, z) * sstep(0.08, 0.22, rr)
    off = (0.3 + 0.27 + 0.12 * 0.1) / LAM['body'] - np.arctan2(-0.13, 0.4) * FAN_R / LAM['haunch']
    ph = ph * (1 - wh) + (phh + off) * wh
    # neck: bands round it, running on down the front of the chest and into the mane
    sn = _neck_s(Pm)
    phn = -sn / LAM['neck']
    wn = sstep(0.3, 0.52, z + 0.35 * (y - 1.3)) * sstep(0.95, 1.15, y)
    off_n = (0.3 - 0.5 - 0.12 * (1.3 - 1.42)) / LAM['body'] - (-_neck_s(np.array([[0.2, 1.42, 0.5]], F))[0] / LAM['neck'])
    ph = ph * (1 - wn) + (phn + off_n) * wn
    # legs: rings
    dleg = np.minimum.reduce([c['fleg'], c['hleg'], c['fpas'], c['hpas'], c['hoof']])
    wl = sstep(0.02, -0.02, dleg - c['trunk']) * np.where(z > 0, sstep(1.12, 0.96, y), sstep(1.06, 0.9, y))
    wl = np.maximum(wl, sstep(0.75, 0.6, y))
    ph = ph * (1 - wl) + _leg_phase(y) * wl
    # face: fine lines along the face, the same distance apart going round it from the middle of the forehead
    L = H.hframe(Pm)
    uc = -0.075 + 0.08 * L[:, 2]
    du = L[:, 1] - uc
    th = np.arctan2(x, du)
    # (rays from the face's middle line in each cross section: as far apart as LAM over the forehead and the nose, wider
    # down the cheeks and under the jaw)
    phf = th * 0.1 / LAM['face'] + 0.15 * np.sin(L[:, 2] * 9)
    wf = sstep(-0.02, 0.09, L[:, 2]) * sstep(0.02, 0.0, c['head'] - 0.01) * (z > 0.8)
    wf = np.maximum(wf, sstep(0.02, 0.0, c['ear']) * (z > 0.9))
    # the dock: rings
    t, rt = tail_t(Pm)
    wt = sstep(0.06, 0.045, rt) * (z < -0.92) * sstep(0.02, 0.1, t)
    ph = ph * (1 - wt) + (t * 9.0) * wt
    # uneven edges, now and then a stripe splitting
    nz = (0.22 - 0.08 * wh) * (fbm(Pm * 5, 3, 91) - 0.5) + 0.06 * (fbm(Pm * 30, 2, 92) - 0.5)
    # (the face's stripes are not blended into the neck's, which run across them: _stripes switches from one set to the
    # other along an uneven line behind the jaw, so the stripes meet there as they do on a zebra)
    return (ph + nz).astype(F), (phf + nz).astype(F), {'haunch': wh * (1 - wl) * (1 - wn), 'leg': wl, 'neck': wn, 'face': wf, 'tail': wt, 'L': L, 'tt': t}


def _stripes(Q, N, c, edge=0.0014):
    """black stripe coverage (anti-aliased), the shadow stripe weight and the regions, at horse points"""
    ph, phf, R = _phase(Q, c, N)
    # the stripes' spacing on the surface, for the anti-aliasing width (numeric gradient along the surface)
    h = 0.002
    nb = [_phase(Q + V(*e) * h, c, N) for e in np.eye(3)]
    b = 0.5 - 0.06 * R['haunch'] - 0.08 * R['leg'] + 0.05 * (vnoise(H._mirror(Q) * 7, 93) - 0.5)

    def mask(p, k):
        g = np.stack([(q[k] - p) / h for q in nb], 1)
        g = g - N * (g * N).sum(1, keepdims=True)
        eps = np.clip(edge * np.linalg.norm(g, axis=1), 0.004, 0.25)
        u = p - np.floor(p)
        sd = np.where(u < b, np.minimum(u, b - u), -np.minimum(u - b, 1 - u))
        return sstep(-eps, eps, sd), u, eps
    blk, u, eps = mask(ph, 0)
    blkf, _, _ = mask(phf, 1)
    wf = sstep(0.4, 0.6, R['face'] + 0.3 * (vnoise(H._mirror(Q) * 25, 94) - 0.5))
    blk = blk * (1 - wf) + blkf * wf
    # the shadow stripes: a narrow pale brown line in the middle of each white one on the haunch
    v = (u - b) / np.maximum(1 - b, 1e-3)
    sh = sstep(0.17 + eps * 2, 0.09, np.abs(v - 0.5)) * (u > b) * R['haunch'] * (1 - wf)
    return blk.astype(F), sh.astype(F), R


# ---------- paint ----------
K = {k: np.array([((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255], F) for k, h in {
    'white': 0xDCD8CF, 'shade': 0xC4C0B6, 'black': 0x1A1715, 'blackHi': 0x2C2724, 'shadow': 0x8E7E6A, 'muzzle': 0x1F1A18,
    'nostril': 0x0D0A09, 'hoof': 0x2A2624, 'hoofHi': 0x48423C, 'chest': 0x3A3430, 'earIn': 0xCFCAC0, 'ball': 0x100A08,
    'lid': 0x1C1816, 'brown': 0x5C3F2A, 'brownDk': 0x3E2A1C, 'cream': 0xE6DCC8, 'creamSh': 0xCFC4AE,
}.items()}


def _mix(c, k, t):
    t = np.clip(t, 0, 1)[:, None]
    return c + (k - c) * t


def _coat(P, N, c, baby=False):
    Q = inv(P)
    R = H._regions(Q, N, c)
    Pm, L = R['Pm'], R['L']
    y, z = Pm[:, 1], Pm[:, 2]
    blk, sh, S = _stripes(Q, N, c, edge=0.0035 if baby else 0.0014)
    n1 = fbm(Pm * 5, 3, 11)
    n2 = fbm(Pm * 22, 3, 12)
    W, Wsh, B, Bhi = (K['cream'], K['creamSh'], K['brown'], K['brownDk']) if baby else (K['white'], K['shade'], K['black'], K['blackHi'])
    col = np.tile(W, (len(P), 1))
    col = _mix(col, Wsh, R['belly'] * 0.45 + sstep(-0.2, -0.8, N[:, 1]) * 0.25)
    col *= (0.97 + 0.06 * n1)[:, None]
    col = _mix(col, K['shadow'] if not baby else (K['shadow'] * 0.5 + K['cream'] * 0.5), sh * 0.55)
    blkc = _mix(np.tile(B, (len(P), 1)), Bhi, n2 * 0.6)
    # the dark line along the spine (from the withers to the tail) and under the belly
    ax = Pm[:, 0]
    dors = sstep(0.024, 0.014, ax) * sstep(0.45, 0.7, N[:, 1]) * sstep(0.42, 0.3, z) * sstep(-1.05, -0.95, z)
    vent = sstep(0.05, 0.035, ax) * sstep(-0.45, -0.7, N[:, 1]) * sstep(0.38, 0.28, z) * sstep(-0.5, -0.4, z) * (1 - S['leg'])
    k = np.maximum.reduce([blk, dors, vent])
    # the tassel's end of the dock is black
    k = np.maximum(k, S['tail'] * sstep(0.45, 0.6, S['tt']))
    # ears: white with a dark band and a dark tip on the back, pale inside
    a = (Pm - H.EAR_B) @ H.EAR_A
    ua = np.clip(a / H.EAR_L, 0, 1.2)
    ear = R['ear']
    eb = (sstep(0.5, 0.56, ua) * sstep(0.74, 0.68, ua) + sstep(0.86, 0.92, ua)) * (1 - R['earIn'] * 0.8)
    k = k * (1 - ear * sstep(0.3, 0.45, ua)) + ear * sstep(0.3, 0.45, ua) * eb
    col = _mix(col, blkc, k)
    col = _mix(col, K['earIn'] if not baby else K['cream'], ear * R['earIn'] * sstep(0.05, 0.15, ua) * (1 - eb) * 0.8)
    # face: dark round the eyes, the black muzzle and nostrils
    col = _mix(col, blkc, sstep(0.042, 0.03, R['eyeD']) * 0.7)
    col = _mix(col, K['lid'] if not baby else K['brownDk'], R['lid'])
    mz = sstep(0.47, 0.56, L[:, 2] + 0.03 * (n1 - 0.5)) * R['head']
    col = _mix(col, K['muzzle'] if not baby else K['brownDk'], mz)
    col = _mix(col, K['nostril'], R['nos'] * R['muzzle'] * sstep(0.004, -0.004, c['head']) * 0.9)
    # the mane: its stripes run up into it; the hair at its top edge is dark
    mn = sstep(0.01, 0.0, c['mane'] - c['neck']) * sstep(1.55, 1.6, y)
    sn = _neck_s(Pm)
    crest = np.interp(sn, [-0.1, 0.0, 0.25, 0.5, 0.75], [1.6, 1.62, 1.79, 1.92, 2.0])
    col = _mix(col, blkc, mn * sstep(0.05, 0.1, y - crest) * 0.7)
    # hooves and chestnuts
    hcol = _mix(np.tile(K['hoof'], (len(P), 1)), K['hoofHi'], sstep(0.4, 0.8, vnoise(Pm * V(500, 25, 500), 15)) * 0.6)
    col = _mix(col, hcol, R['hoof'])
    col = _mix(col, K['chest'] * (0.8 + 0.4 * n2[:, None]), R['chest'])
    # the pasterns are dark just above the hoof
    col = _mix(col, blkc, sstep(0.16, 0.13, y) * (1 - R['hoof']))
    # coat hairs: fine strokes, a little lighter or darker than the coat around them
    s = H._strands(Q, N, R)
    col *= (1 + (s * 0.14 - 0.04) * (1 - R['hoof']))[:, None]
    col = _mix(col, K['ball'], R['ball'])
    rough = 0.5 + 0.08 * (n2 - 0.5) - 0.06 * k
    rough = rough + 0.15 * R['muzzle'] - 0.2 * R['hoof'] + 0.15 * R['chest'] - 0.25 * R['lid'] * sstep(H.EYE_R + 0.008, H.EYE_R + 0.004, R['eyeD'])
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def paint(P, N, c):
    return _coat(P, N, c)


BABY_TEX = 384


def baby_paint(P, N, c, col):
    """the foal: brown stripes, wider soft edges, on cream; a brown muzzle"""
    return _coat(P, N, c, baby=True)[0]


def detail(P, N, c):
    return (H.detail(inv(P), N, c) * ZS).astype(F)


def finish(C, ao, valid):
    lin = np.where(C <= 0.04045, C / 12.92, ((C + 0.055) / 1.055) ** 2.4)
    lin = lin * (0.45 + 0.55 * ao[..., None])
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(np.maximum(lin, 0), 1 / 2.4) - 0.055)


# ---------- coat: fur shells ----------
FUR = {'len': 0.011, 'n': 4, 'lean': 1.7, 'tile': 0.0016, 'babyLen': 2.6, 'babyLean': 0.5, 'quality': 80}


def fur(P, N, c):
    Q = inv(P)
    ln, de = H.fur(Q, N, c)
    mn = sstep(0.01, 0.0, c['mane'] - c['neck']) * sstep(1.55, 1.6, Q[:, 1])
    ln = ln * (1 - mn) + 0.012 * mn
    return np.clip(ln * ZS, 0, FUR['len']).astype(F), de


MAP_QUALITY = (72, 70)
PAD_SMOOTH = 3


def stats(P, N, c, col):
    return {'lidCol': 0x2A2624}


def meta(st):
    m = H.meta(st)
    e = m['eye']
    e['p'] = [round(float(v), 5) for v in fwd1(H.EYE_C)]
    e['r'] = round(H.EYE_R * ZS, 5)
    e.update({'iris': 0x2A170C, 'rim': 0x0A0706, 'lidCol': st['lidCol'], 'babyLidCol': 0x5A4636, 'lash': {'n': 18, 'len': round(0.017 * ZS, 4), 'col': 0x1A1614}})
    m['mouth'] = [round(float(v), 4) for v in fwd1(H.MOUTH)]
    m.update({'tint': [1.0, 1.0, 1.0], 'babyTint': [1.02, 1.0, 0.98], 'rim': [0.12, 0.12, 0.11], 'flat': 0x8C8884})
    return m


# ---------- hair cards: the mane's fringe, a little forelock and the tail's tassel ----------
HAIR = {'size': (192, 256), 'cols': 6, 'rough': 0.5, 'alpha': 0.3, 'quality': 70}


def hair_texture(baby=False):
    import smallfur as SF
    if baby:
        dk, lt, tip = (0.3, 0.2, 0.13), (0.86, 0.8, 0.7), (0.42, 0.3, 0.2)
    else:
        dk, lt, tip = (0.07, 0.065, 0.06), (0.84, 0.82, 0.78), (0.12, 0.11, 0.1)
    cols = []
    for i in range(3):
        cols.append(dict(kind='hair', stops=[(0.0, tuple(v * 0.9 for v in dk)), (1.0, tuple(v * (1.0 + 0.12 * i) for v in dk))], n=44, wid=1.3, end=(0.65, 1.0), wave=0.05, root=0.15))
    for i in range(3):
        cols.append(dict(kind='hair', stops=[(0.0, tuple(v * 0.92 for v in lt)), (0.55, lt), (0.82, tuple(0.5 * (a + b) for a, b in zip(lt, tip))), (1.0, tip)], n=44, wid=1.3, end=(0.65, 1.0), wave=0.05, root=0.15))
    return SF.strand_texture(HAIR['size'], cols, seed=29)


def export_extra(meta_, out, work):
    """the foal's strand texture: a brown and cream fringe and tassel"""
    import cards as CA
    from PIL import Image
    hp = os.path.join(work, f'{ID}-babyhair.png')
    CA.save_texture(hair_texture(baby=True), hp)
    fn = f'{ID}-babyhair.webp'
    Image.open(hp).save(os.path.join(out, fn), 'WEBP', quality=HAIR.get('quality', 85), method=6)
    meta_['maps']['babyHair'] = fn
    meta_['srgb'] = list(meta_.get('srgb', [])) + ['babyHair']


def _black_at(Pts):
    """1 where a point on the body lies on a black stripe (horse points), for the hair cards' colors"""
    Q = np.asarray(Pts, F)
    N = np.tile(V(0.0, 1.0, 0.0), (len(Q), 1))
    c = H.parts(Q)
    c['mane'] = H._local(Q, *MBOX, zmane)
    blk, _, _ = _stripes(Q, N, c)
    return blk


def _mane_w(t):
    # the root on the skin under it, a little of the tip on the mane bones: a zebra's mane hardly flops
    return lambda p, tt: H._wsum(('_skin', 1 - 0.18 * tt ** 1.5), ('mane1' if float(p[2]) < 0.74 else 'mane2', 0.18 * tt ** 1.5))


def hcards():
    """the cards in horse space"""
    out = []
    rnd, wsum = H._rnd, H._wsum
    # the mane's fringe: short stiff tufts along its top, standing up, two rows crossing a little
    M, k = 40, 3
    tops = []
    for layer in (0, 1):
        for i in range(M):
            t0 = min(0.99, max(0.01, (i + 0.5 * layer + 0.3 * (rnd(i, 61 + layer) - 0.5)) / M))
            C, T, U = H._neck_frame(t0)
            tops.append((layer, i, t0, T, U))
    # the plate's top edge: walk up from inside the plate until outside it
    O = []
    for layer, i, t0, T, U in tops:
        K_ = np.array(MANE, np.float64)
        s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(K_[:, :2], axis=0), axis=1))])
        u = s[-1] * (0.03 + 0.94 * t0)
        yz = np.array([np.interp(u, s, K_[:, 0]), np.interp(u, s, K_[:, 1])])
        O.append(V(0.0, yz[0], yz[1]))
    O = np.array(O, F)
    Ud = np.array([tp[4] for tp in tops], F)
    ts_ = np.linspace(0, 0.2, 41)
    Pq = (O[:, None, :] + ts_[None, :, None] * Ud[:, None, :]).reshape(-1, 3).astype(F)
    ins = (zmane(Pq) < 0).reshape(len(O), len(ts_))
    last = np.where(ins.any(1), len(ts_) - 1 - np.argmax(ins[:, ::-1], 1), 0)
    edge = O + ts_[last][:, None] * Ud
    blk = _black_at(edge - Ud * 0.02)
    for (layer, i, t0, T, U), e, bk in zip(tops, edge, blk):
        sg = 1 if layer == 0 else -1
        root = e - U * 0.022 + V(0.004 * sg, 0, 0)
        Lh = (0.03 + 0.025 * np.sin(np.pi * min(1.0, t0 * 1.05)) ** 0.5) * (0.8 + 0.4 * rnd(i, 63 + layer))
        dirn = nrm(U + V(0.12 * sg, 0, 0) - T * 0.15)
        ts = np.linspace(0, 1, k)
        pts = np.array([root + dirn * (0.022 + Lh) * t for t in ts], F)
        side = nrm(T * np.cos(0.35 * sg) + V(1, 0, 0) * np.sin(0.35 * sg))
        col = (i % 3) if bk > 0.5 else 3 + (i % 3)
        out.append({'pts': pts, 'w': np.linspace(0.026, 0.02, k), 'nrm': np.tile(nrm(np.cross(side, dirn)), (k, 1)), 'side': np.tile(side, (k, 1)),
                    'col': col, 'bones': [_mane_w(t)(p, t) for p, t in zip(pts, ts)],
                    'baby': np.array([root + dirn * (0.016 + Lh * 0.7) * t for t in ts], F)})
    # a small forelock: a few short tufts between the ears
    for i in range(6):
        xo = (i - 2.5) * 0.008
        root = H.hp(0.0 + 0.03 * (i % 3), 0.035, xo)
        root = H._surface(root[None] + H.HU * 0.2, -H.HU[None])[0] - H.HU * 0.004
        dirn = nrm(H.HU * 0.8 + H.HA * 0.5)
        Lf = 0.04 + 0.015 * rnd(i, 71)
        ts = np.linspace(0, 1, 3)
        pts = np.array([root + dirn * Lf * t for t in ts], F)
        out.append({'pts': pts, 'w': np.linspace(0.02, 0.014, 3), 'nrm': np.tile(H.HA, (3, 1)), 'side': np.tile(V(1, 0, 0), (3, 1)),
                    'col': 3 + i % 3 if i % 2 else i % 3, 'bones': [{'_skin': 1.0}] * 3, 'baby': np.array([root + dirn * Lf * 0.6 * t for t in ts], F)})
    # the tassel: long black hair from the lower half of the dock, hanging to about the hocks
    tp, tr = htail_curve(40)
    k = 6
    for i in range(34):
        ft = 0.5 + 0.47 * rnd(i, 81)
        a = (-1.0 + 2.0 * rnd(i, 82)) * np.pi
        q = min(int(ft * 40), 39)
        Td = nrm(tp[q + 1] - tp[q])
        Ud = nrm(np.cross(Td, V(1, 0, 0)))
        Sd = np.cross(Ud, Td)
        radial = nrm(Ud * np.cos(a) + Sd * np.sin(a))
        root = tp[q] + radial * tr[q] * 0.7
        yt = 0.6 + 0.12 * rnd(i, 83)
        spread = 0.02 + 0.03 * rnd(i, 84)
        pts, bw = [], []
        for j in range(k):
            t = j / (k - 1)
            p = root + radial * (0.008 + spread * np.sin(np.pi * min(1.0, t * 1.1)) ** 0.7) * min(1.0, t * 5) + V(0.0, (yt - root[1]) * t, -0.01 * t)
            pts.append(p)
            yy = float(p[1])
            hb = wsum(('tail2', 1 - sstep(1.04, 0.88, np.array([yy]))[0]), ('tail3', sstep(1.04, 0.88, np.array([yy]))[0]))
            ks = max(0.0, 1 - t * 4)
            bw.append(wsum(('_skin', ks), *[(n, w * (1 - ks)) for n, w in hb.items()]))
        pts = np.array(pts, F)
        ts = np.linspace(0, 1, k)
        ph = np.pi * (i * 0.618034 % 1.0)
        sd = np.tile(V(np.cos(ph), 0.0, np.sin(ph)), (k, 1))
        out.append({'pts': pts, 'w': np.linspace(0.03, 0.05, k), 'nrm': np.tile(nrm(radial + V(0, 0, -0.2)), (k, 1)), 'side': sd,
                    'col': i % 3, 'bones': bw, 'baby': np.array([root + (p - root) * 0.45 + radial * 0.01 * t for p, t in zip(pts, ts)], F)})
    allp = np.concatenate([c['pts'][1:] for c in out]).astype(F)
    allp = H._push_out(allp, 0.004)
    o = 0
    for c in out:
        n = len(c['pts']) - 1
        c['pts'] = np.concatenate([c['pts'][:1], allp[o:o + n]]).astype(F); o += n
    return out


def cards():
    out = hcards()
    for c in out:
        Q = c['pts']
        c['pts'] = fwd(Q)
        c['baby'] = fwd(c['baby'])
        c['w'] = (np.asarray(c['w']) * ZS).astype(F)
        c['side'] = _dirs(Q, np.asarray(c['side'], F))
        c['nrm'] = np.asarray(c['nrm'], F)
    return out
