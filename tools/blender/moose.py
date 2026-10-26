# Bull moose, sculpted as a signed distance field around the game's moose skeleton (tools/blender/work/moose-rig.json).
# Units are meters in game rig space (x left, y up, z forward, ground at y = 0). Shape (a tall shoulder hump falling to
# a lower rump, a short thick neck, the long head with its overhanging muzzle and big nose, the bell under the throat,
# long legs with split hooves and dewclaws, palmate antlers on the antler bone), then paint (dark brown with pale grey
# brown legs; the calf's red brown coat as the baby color map), fine detail and the coat (a longer mane over the hump
# and neck). Shared helpers for the hooved animals are in ungulate.py.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, loft, sweep, fbm, vnoise, worley, length
import ungulate as U
from ungulate import local as _local, local_n as _local_n, mirror as _mirror, groove, eround

ID = 'moose'
BOUNDS = (V(-0.86, 0.0, -1.2), V(0.86, 2.42, 1.74))
TAIL_RINGS = 0
DISSOLVE_DEGENERATE = True
BAKE_DIST = (0.016, 0.04, 0.16)

# ---------- landmarks (left side, +x) ----------
XF, XH = 0.17, 0.165
HOOF_F = V(XF, 0.0, 0.545)
HOOF_H = V(XH, 0.0, -0.662)
HO = V(0.0, 1.89, 0.95)
HA = nrm([0.0, -0.46, 0.888])
HU = nrm([0.0, 0.888, 0.46])
HL = 0.74


def hp(s, u, x=0.0):
    return HO + HA * s + HU * u + V(1, 0, 0) * x


def hframe(Q):
    D = Q - HO
    return np.stack([D[:, 0], D @ HU, D @ HA], 1)


EYE_C = hp(0.17, 0.045, 0.086)
EYE_R = 0.018
EYE_DIR = nrm([0.9, 0.16, 0.4])
LID_W, LID_H, LID_OFF = 0.0172, 0.0108, 0.0006
EAR_B = hp(-0.025, 0.05, 0.092)
EAR_A = nrm([0.6, 0.72, -0.36])
EAR_N = nrm([0.45, 0.0, 0.89])
EAR_N = nrm(EAR_N - EAR_A * np.dot(EAR_N, EAR_A))
EAR_L, EAR_W = 0.24, 0.052
NOS_C = V(0.05, -0.03, 0.705)        # nostril (head frame x, u, s)
NOS_N = nrm([0.7, -0.25, 0.67])
MOUTH = hp(0.69, -0.13, 0.0)

# ---------- palmate antlers (left side; the right one mirrors it) ----------
# The beam leaves the skull sideways and opens into the main palm, a broad dished plate rising out and up with its
# face toward the front and a row of blunt points along its top and outer edges; the brow palm is a smaller plate
# reaching forward from the base with three points.
BURR = hp(0.05, 0.074, 0.085)
PALM_B = V(0.2, 1.97, 1.02)                  # where the beam opens into the palm
PALM_U = nrm([0.85, 0.42, -0.32])          # out along the palm: sideways, up and a little back
_n = np.array([-0.3, 0.55, 0.78], F)
PALM_N = nrm(_n - PALM_U * np.dot(_n, PALM_U))   # the dished face looks up, forward and in
PALM_W = np.cross(PALM_N, PALM_U)
if PALM_W[1] < 0:
    PALM_W = -PALM_W                         # up (and back) within the palm
# outline in the palm's plane (u out, w up, meters): points of different lengths along the top and the outer end
PALM_OUT = [
    (0.0, -0.04), (0.0, 0.04), (0.06, 0.08), (0.11, 0.15), (0.12, 0.22), (0.155, 0.17), (0.185, 0.245), (0.215, 0.19), (0.26, 0.28), (0.29, 0.205),
    (0.345, 0.27), (0.37, 0.2), (0.43, 0.25), (0.45, 0.17), (0.52, 0.2), (0.53, 0.12), (0.61, 0.13), (0.58, 0.05), (0.655, 0.025), (0.6, -0.025),
    (0.63, -0.075), (0.55, -0.085), (0.45, -0.115), (0.35, -0.125), (0.25, -0.115), (0.15, -0.095), (0.07, -0.065),
]
BURR_AX = nrm(PALM_B - BURR)                 # up the beam from the burr
BROW_B = PALM_B + PALM_U * 0.03 + V(0, -0.01, 0.02)
BROW_F = nrm([0.3, 0.25, 0.92])              # forward along the brow palm
_s = np.array([0.5, 1.0, 0.0], F)
BROW_S = nrm(_s - BROW_F * np.dot(_s, BROW_F))
BROW_N = np.cross(BROW_F, BROW_S)
BROW_OUT = [(0.0, -0.045), (0.07, -0.06), (0.15, -0.06), (0.215, -0.075), (0.2, -0.02), (0.25, 0.02), (0.19, 0.045), (0.205, 0.1), (0.14, 0.085),
            (0.07, 0.07), (0.0, 0.04)]
_PS = {}


def _plate_sdf(outline):
    """2D signed distance of an outline (rasterized at 1.5 mm, tips rounded), sampled by bilinear lookup"""
    key = tuple(outline)
    if key in _PS:
        return _PS[key]
    from PIL import Image, ImageDraw
    from scipy import ndimage
    o = np.array(outline, np.float64)
    res = 0.0015
    u0, v0 = o.min(0) - 0.05
    W, H = o.max(0) - o.min(0) + 0.1
    nx, ny = int(W / res), int(H / res)
    im = Image.new('L', (nx, ny), 0)
    ImageDraw.Draw(im).polygon([((u - u0) / res, (v - v0) / res) for u, v in outline], fill=255)
    m = np.asarray(im) > 127
    r = 0.014 / res
    er = ndimage.distance_transform_edt(m) > r                  # erode by r, measure, take r back: rounded tips
    din = ndimage.distance_transform_edt(er) * res
    dout = ndimage.distance_transform_edt(~er) * res
    sd = (np.where(er, -din, dout) - 0.014).astype(F)
    sd = ndimage.gaussian_filter(sd, 2.5)

    def f(u, v):
        x = (u - u0) / res; y = (v - v0) / res
        out = ndimage.map_coordinates(sd, [y, x], order=1, mode='nearest')
        ex = np.maximum(np.maximum(-x, x - (nx - 1)), np.maximum(-y, y - (ny - 1))) * res
        return (out + np.maximum(ex, 0)).astype(F)
    _PS[key] = f
    return f


def palm_coords(Q):
    D = Q - PALM_B
    return D @ PALM_U, D @ PALM_W, D @ PALM_N


def brow_coords(Q):
    D = Q - BROW_B
    return D @ BROW_F, D @ BROW_S, D @ BROW_N


def palm_cup(u, w):
    """how far the palm's face comes forward out of its plane: dished, the rim and the points turned forward"""
    return 0.3 * (w - 0.07) ** 2 + 0.16 * (u - 0.3) ** 2 + 0.04 * np.maximum(w - 0.16, 0)


def _plate(Q, coords, outline, cup, th0, th1, thb, seed):
    out = np.full(len(Q), 0.05, F)
    u, v, w = coords(Q)
    near = (np.abs(w - cup(u, v)) < 0.06) & (u > -0.1) & (u < 0.8)
    if near.any():
        un, vn = u[near], v[near]
        wn = w[near] - cup(un, vn)
        d2 = _plate_sdf(outline)(un, vn)
        # thicker toward the beam, thin at the rim and in the points; the faces wave a little
        th = th0 + (th1 - th0) * sstep(0.0, 0.07, -d2) + thb * sstep(0.18, 0.0, un)
        wv = 0.003 * (vnoise(Q[near] * 25, seed) - 0.5)
        out[near] = smax(d2, np.abs(wn - wv) - th * 0.5, 0.008)
    return out


def antler(P):
    Q = _mirror(P)
    d = _plate(Q, palm_coords, PALM_OUT, palm_cup, 0.012, 0.026, 0.012, 44)
    d = smin(d, _plate(Q, brow_coords, BROW_OUT, lambda f, s: 0.25 * s * s + 0.1 * f * f, 0.012, 0.022, 0.01, 45), 0.03)
    # the beam: from the burr out to the palm, thick and round
    bm = U.chain(Q, [BURR, BURR + (PALM_B - BURR) * 0.5 + V(0, 0.01, 0.0), PALM_B + PALM_U * 0.05], [0.036, 0.033, 0.03])
    d = smin(d, bm, 0.035)
    # the burr: a rough ring at the base, and the pedicle under it
    ax = nrm(PALM_B - BURR)
    m = U.box(Q, BURR - 0.07, BURR + 0.07)
    if m.any():
        q = Q[m]
        D = q - (BURR + ax * 0.012)
        al = D @ ax
        rr = length(D - np.outer(al, ax))
        ring = np.sqrt((rr - 0.038) ** 2 + (al * 1.2) ** 2) - 0.009
        f1, _ = worley(q / 0.008, 41)
        ring = ring - 0.002 * sstep(0.55, 0.15, f1)
        e = smin(d[m], ring, 0.008)
        e = smin(e, round_cone(q, BURR - ax * 0.024, BURR - ax * 0.004, 0.031, 0.033), 0.012)
        d[m] = e
    return d


ANT_BOX = (V(-0.86, 1.86, 0.62), V(0.86, 2.42, 1.4))

PATCHES = [
    (EYE_C * V(0, 1, 1) + V(0.04, -0.04, -0.045), EYE_C * V(0, 1, 1) + V(0.13, 0.04, 0.045), 0.001),   # eye and lids
    (hp(0.58, 0.0) * V(0, 1, 1) + V(0.0, -0.17, -0.02), hp(0.76, 0.0) * V(0, 1, 1) + V(0.11, 0.04, 0.06), 0.0015),   # nose and lips
    (V(0.06, 1.88, 0.83), V(0.3, 2.18, 1.06), 0.0021),                                                     # ear
    (V(0.04, 1.86, 0.62), V(0.86, 2.42, 1.4), 0.0034),                                                     # antler
    (V(0.1, -0.001, 0.44), V(0.24, 0.2, 0.63), 0.002),                                                     # front hoof
    (V(0.09, -0.001, -0.78), V(0.24, 0.2, -0.58), 0.002),                                                  # hind hoof
]

# trunk: z, top, yw (height of widest), bottom, half width, exponent above, below
TRUNK = [
    (-1.1, 1.64, 1.54, 1.44, 0.06, 2.2, 2.0),
    (-1.03, 1.71, 1.52, 1.34, 0.16, 2.3, 2.0),
    (-0.9, 1.745, 1.5, 1.26, 0.225, 2.4, 2.1),
    (-0.7, 1.76, 1.48, 1.2, 0.265, 2.5, 2.2),
    (-0.45, 1.775, 1.465, 1.16, 0.285, 2.5, 2.2),
    (-0.2, 1.81, 1.46, 1.135, 0.295, 2.4, 2.1),
    (0.05, 1.87, 1.47, 1.125, 0.295, 2.4, 2.0),
    (0.25, 1.95, 1.49, 1.135, 0.285, 2.3, 2.0),
    (0.42, 1.985, 1.51, 1.16, 0.262, 2.1, 2.0),
    (0.55, 1.965, 1.53, 1.21, 0.23, 2.0, 2.0),
    (0.66, 1.9, 1.55, 1.3, 0.18, 1.9, 2.0),
    (0.74, 1.8, 1.58, 1.42, 0.12, 1.9, 2.0),
]
NECK = [
    (1.5, 0.55, 0.32, 0.3, 0.2, 1.9, 2.0),
    (1.62, 0.72, 0.245, 0.25, 0.165, 1.9, 2.0),
    (1.73, 0.85, 0.19, 0.2, 0.135, 2.0, 2.1),
    (1.82, 0.935, 0.15, 0.16, 0.115, 2.0, 2.1),
    (1.88, 0.975, 0.12, 0.13, 0.1, 2.0, 2.1),
]
HEAD = [
    (-0.04, 0.06, 0.0, -0.08, 0.075, 2.2, 2.0),
    (0.03, 0.09, 0.01, -0.13, 0.1, 2.4, 1.9),
    (0.11, 0.1, 0.015, -0.17, 0.108, 2.6, 1.8),
    (0.2, 0.09, 0.01, -0.18, 0.098, 2.5, 1.8),
    (0.3, 0.076, 0.0, -0.165, 0.082, 2.3, 1.9),
    (0.4, 0.07, -0.01, -0.15, 0.074, 2.2, 2.0),
    (0.5, 0.072, -0.02, -0.143, 0.078, 2.2, 2.1),
    (0.58, 0.077, -0.03, -0.14, 0.087, 2.3, 2.2),
    (0.65, 0.072, -0.04, -0.135, 0.09, 2.4, 2.3),
    (0.71, 0.048, -0.05, -0.12, 0.08, 2.4, 2.3),
    (0.74, 0.02, -0.055, -0.1, 0.06, 2.2, 2.2),
]
FORE = [
    (1.32, 0.45, 0.13, 0.15, 0.095, 2.2, 2.2, 0.155),
    (1.12, 0.43, 0.105, 0.11, 0.08, 2.2, 2.2, 0.165),
    (0.95, 0.44, 0.08, 0.08, 0.065, 2.2, 2.3, 0.17),
    (0.78, 0.465, 0.06, 0.056, 0.05, 2.3, 2.4, 0.17),
    (0.62, 0.485, 0.048, 0.045, 0.044, 2.4, 2.4, 0.17),
]
HIND = [
    (1.6, -0.69, 0.3, 0.36, 0.14, 2.2, 2.2, 0.13),
    (1.42, -0.66, 0.3, 0.36, 0.14, 2.2, 2.2, 0.15),
    (1.24, -0.63, 0.25, 0.3, 0.12, 2.1, 2.1, 0.162),
    (1.06, -0.635, 0.16, 0.21, 0.09, 2.1, 2.2, 0.165),
    (0.92, -0.69, 0.1, 0.14, 0.068, 2.2, 2.2, 0.165),
    (0.8, -0.735, 0.072, 0.1, 0.055, 2.3, 2.2, 0.165),
    (0.7, -0.76, 0.058, 0.075, 0.048, 2.3, 2.2, 0.165),
]


def trunk(P):
    Q = _mirror(P)
    d = loft(Q, TRUNK)
    # the hump: the long spines over the shoulders under a thick layer of muscle and hair
    d = smin(d, ellipsoid(Q, V(0.0, 1.93, 0.4), V(0.1, 0.06, 0.32)), 0.12)
    # shoulder, point of shoulder, triceps, breast
    d = smin(d, ellipsoid(Q, V(0.17, 1.65, 0.42), V(0.08, 0.2, 0.16)), 0.12)
    d = smin(d, ellipsoid(Q, V(0.17, 1.43, 0.58), V(0.05, 0.06, 0.05)), 0.1)
    d = smin(d, ellipsoid(Q, V(0.18, 1.27, 0.38), V(0.09, 0.13, 0.12)), 0.1)
    d = smin(d, ellipsoid(Q, V(0.07, 1.3, 0.64), V(0.08, 0.12, 0.07)), 0.1)
    # hindquarters: narrow and sloping, the thigh, the point of hip
    d = smin(d, ellipsoid(Q, V(0.14, 1.6, -0.75), V(0.12, 0.16, 0.26)), 0.1)
    d = smin(d, ellipsoid(Q, V(0.07, 1.5, -0.98), V(0.09, 0.16, 0.1)), 0.08)
    # belly and the flank fold toward the stifle
    d = smin(d, ellipsoid(Q, V(0.14, 1.17, -0.48), V(0.08, 0.05, 0.12)), 0.1)
    d = smin(d, ellipsoid(Q, V(0.0, 1.2, -0.1), V(0.26, 0.11, 0.38)), 0.08)
    # a short stub of a tail
    d = smin(d, round_cone(Q, V(0.0, 1.62, -1.02), V(0.0, 1.53, -1.1), 0.045, 0.03), 0.04)
    return d


def neck(P):
    Q = _mirror(P)
    d = sweep(Q, NECK)
    d = smin(d, ellipsoid(Q, V(0.0, 1.95, 0.9), V(0.09, 0.08, 0.1)), 0.06)
    return d


def bell(P):
    """the dewlap: a flap of skin and long hair hanging from the throat"""
    Q = _mirror(P)
    d = sweep(Q, [(1.7, 0.985, 0.075, 0.07, 0.034, 2.2, 2.2), (1.6, 1.005, 0.06, 0.055, 0.027, 2.2, 2.2), (1.5, 1.02, 0.042, 0.04, 0.02, 2.2, 2.2),
                  (1.41, 1.028, 0.028, 0.026, 0.015, 2.0, 2.0), (1.36, 1.03, 0.016, 0.016, 0.01, 2.0, 2.0)])
    return d


def head(P):
    Q = _mirror(P)
    L = hframe(Q)
    d = loft(L, HEAD)
    # the big round cheek over the jaw, the bony brow, a slight hump over the nose (Roman nose)
    d = smin(d, superellipsoid(L, V(0.065, -0.11, 0.22), (0.04, 0.07, 0.11), 2.4), 0.025)
    d = smin(d, ellipsoid(L, V(0.0, 0.088, 0.47), V(0.05, 0.02, 0.14)), 0.03)
    d = smin(d, round_cone(L, V(0.085, 0.03, 0.12), V(0.065, 0.005, 0.24), 0.012, 0.006), 0.02)
    # the muzzle: a big overhanging upper lip and nose, the lower lip and chin set back under it
    d = smin(d, ellipsoid(L, V(0.0, -0.07, 0.675), V(0.085, 0.07, 0.07)), 0.04)
    d = smin(d, ellipsoid(L, V(0.0, -0.105, 0.69), V(0.07, 0.04, 0.055)), 0.03)
    d = smin(d, ellipsoid(L, V(0.0, -0.16, 0.6), V(0.045, 0.028, 0.06)), 0.03)
    # mouth: under the overhang, back to the corner
    M = L * V(1, 2.0, 1)
    m = round_cone(M, V(0.0, -0.138 * 2.0, 0.705), V(0.05, -0.14 * 2.0, 0.66), 0.005, 0.005)
    m = smin(m, round_cone(M, V(0.05, -0.14 * 2.0, 0.66), V(0.06, -0.145 * 2.0, 0.54), 0.005, 0.0015), 0.004)
    d = smax(d, -(m + 0.002) / 2.0, 0.006)
    # nostrils: long slanted slits on the front of the nose
    nn = NOS_N
    nu = nrm(np.array([0, 1, 0], F) - nn * nn[1])
    ns = np.cross(nu, nn)
    D = L - NOS_C
    N = np.stack([D @ ns, D @ nu, D @ nn], 1)
    pit = ellipsoid(N, V(0.0, 0.0, 0.0), V(0.008, 0.03, 0.03))
    pit = smin(pit, ellipsoid(N, V(-0.006, -0.025, 0.0), V(0.007, 0.012, 0.025)), 0.008)
    rim = smax(np.abs(pit + 0.004) - 0.0035, N[:, 2] - 0.01, 0.003)
    d = smin(d, rim, 0.003)
    d = smax(d, -pit, 0.003)
    return d


def jawline(P):
    Q = _mirror(P)
    L = hframe(Q)
    ch = superellipsoid(L, V(0.065, -0.11, 0.22), (0.04, 0.07, 0.11), 2.4)
    cu, cs = L[:, 1] + 0.11, L[:, 2] - 0.22
    m = np.clip(sstep(0.0, -0.09, cs) + sstep(-0.04, -0.09, cu), 0, 1) * sstep(0.03, 0.06, Q[:, 0])
    return groove(ch + 0.003, 0.012, 0.004) * m


def ears(P):
    Q = _mirror(P)
    return U.ear(Q, EAR_B, EAR_A, EAR_N, EAR_L, EAR_W, cup=0.6, th0=0.013, th1=0.005, tip=0.6, base_r=(0.035, 0.035, 0.03), roll=0.1)


def eye_parts(P):
    Q = _mirror(P)
    return U.eye_parts(Q, EYE_C, EYE_R, EYE_DIR, LID_W, LID_H, LID_OFF, mound=(0.009, 0.008, 0.004),
                       brow=((-0.03, 0.026, -0.016), (0.012, 0.03, -0.012), 0.009, 0.006))


def fleg(P):
    Q = _mirror(P)
    x = XF
    d = sweep(Q, FORE, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(x + 0.01, 0.86, 0.47), V(0.045, 0.13, 0.04)), 0.04)
    d = smin(d, ellipsoid(Q, V(x - 0.006, 1.06, 0.36), V(0.04, 0.05, 0.045)), 0.06)        # point of elbow
    d = smin(d, superellipsoid(Q, V(x, 0.575, 0.49), (0.038, 0.05, 0.04), 2.4), 0.05)    # knee
    d = smin(d, eround(Q, V(x, 0.55, 0.5), V(x, 0.18, 0.5), 0.03, 0.028, 0.9, x), 0.025)
    d = smin(d, eround(Q, V(x, 0.53, 0.465), V(x, 0.19, 0.47), 0.019, 0.021, 1.1, x), 0.025)
    return d


def fpastern(P):
    Q = _mirror(P)
    x = XF
    d = ellipsoid(Q, V(x, 0.155, 0.49), V(0.038, 0.045, 0.042))
    d = smin(d, round_cone(Q, V(x, 0.15, 0.495), V(x, 0.065, 0.53), 0.032, 0.038), 0.02)
    return d


def hleg(P):
    Q = _mirror(P)
    x = XH
    d = sweep(Q, HIND, mirror_x=False)
    d = smin(d, ellipsoid(Q, V(0.18, 1.1, -0.45), V(0.045, 0.05, 0.045)), 0.07)            # stifle
    d = smin(d, eround(Q, V(x, 0.95, -0.82), V(x, 0.72, -0.81), 0.024, 0.026, 0.8, x), 0.03)
    d = smin(d, superellipsoid(Q, V(x, 0.67, -0.762), (0.042, 0.058, 0.055), 2.4), 0.045)  # hock
    d = smin(d, ellipsoid(Q, V(x - 0.006, 0.71, -0.82), V(0.022, 0.035, 0.024)), 0.015)
    d = smin(d, eround(Q, V(x, 0.62, -0.748), V(x, 0.18, -0.722), 0.031, 0.028, 0.9, x), 0.025)
    d = smin(d, eround(Q, V(x, 0.6, -0.785), V(x, 0.19, -0.755), 0.02, 0.021, 1.1, x), 0.025)
    return d


def hpastern(P):
    Q = _mirror(P)
    x = XH
    d = ellipsoid(Q, V(x, 0.155, -0.728), V(0.037, 0.044, 0.041))
    d = smin(d, round_cone(Q, V(x, 0.15, -0.725), V(x, 0.065, -0.685), 0.031, 0.037), 0.02)
    return d


def hooves(P):
    Q = _mirror(P)
    hf = U.cloven(Q, HOOF_F, 0.145, 0.11, 0.075, 0.035, 0.55, 0.006)
    hh = U.cloven(Q, HOOF_H, 0.135, 0.104, 0.072, 0.034, 0.5, 0.006)
    return np.minimum(hf, hh)


DEW_F, DEW_H = V(XF, 0.105, 0.46), V(XH, 0.105, -0.755)


def dews(P):
    Q = _mirror(P)
    dn = nrm([0.0, -0.75, -0.66])
    return np.minimum(U.dewclaws(Q, DEW_F, 0.02, 0.01, 0.026, dn), U.dewclaws(Q, DEW_H, 0.019, 0.0095, 0.025, dn))


def folds(P):
    Q = _mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    c = np.zeros(len(P), F)
    w = 0.01 * (vnoise(Q * V(8, 20, 8), 3) - 0.5)
    side = sstep(0.18, 0.25, x)
    c += groove(z - 0.62 + 0.6 * (y - 1.45) + w, 0.03, 0.0025) * side * sstep(1.4, 1.5, y) * sstep(1.8, 1.7, y)
    c += groove(z - 0.36 - 0.3 * (y - 1.2) + w, 0.025, 0.003) * side * sstep(1.1, 1.18, y) * sstep(1.45, 1.35, y)
    c += groove(z + 0.9 - 0.18 * (y - 1.4) + w, 0.025, 0.003) * sstep(0.1, 0.16, x) * sstep(1.1, 1.2, y) * sstep(1.6, 1.5, y)
    c += groove(z + 0.79 + 0.05 * (y - 0.8), 0.016, 0.004) * sstep(0.73, 0.77, y) * sstep(0.95, 0.87, y) * sstep(0.13, 0.15, x)
    return c


def parts(P):
    so, li, ba, br = eye_parts(P)
    return {'trunk': trunk(P), 'neck': neck(P), 'head': head(P), 'ear': ears(P), 'lids': li, 'ball': ba, 'fleg': fleg(P), 'hleg': hleg(P),
            'fpas': fpastern(P), 'hpas': hpastern(P), 'hoof': hooves(P), 'dew': dews(P), 'bell': bell(P),
            'antler': _local(P, *ANT_BOX, antler)}


def shape(P):
    d = trunk(P)
    d = smin(d, _local(P, (-0.38, 1.02, 0.18), (0.38, 2.24, 1.28), neck), 0.1)
    d = smin(d, _local(P, (-0.08, 1.3, 0.82), (0.08, 1.8, 1.16), bell), 0.04)
    h = _local(P, (-0.2, 1.3, 0.75), (0.2, 2.06, 1.74), head)
    ca, li, ba, br = _local_n(P, EYE_C * V(-1, 1, 1) - V(0.05, 0.05, 0.05), EYE_C + V(0.05, 0.05, 0.05), eye_parts, 4)
    h = smin(h, li, 0.014)
    h = smin(h, br, 0.014)
    h = smax(h, -ca, 0.005)
    h = smin(h, ba, 0.002)
    d = smin(d, h, 0.06)
    d = d + _local(P, (-0.2, 1.4, 0.8), (0.2, 2.0, 1.4), jawline, far=0.0)
    d = smin(d, _local(P, (-0.32, 1.88, 0.78), (0.32, 2.2, 1.08), ears), 0.014)
    d = smin(d, _local(P, *ANT_BOX, antler), 0.008)
    fl = _local(P, (-0.32, 0.12, 0.25), (0.32, 1.45, 0.7), fleg)
    d = smin(d, fl, 0.07)
    hl = _local(P, (-0.38, 0.12, -1.15), (0.38, 1.72, -0.3), hleg)
    d = smin(d, hl, 0.07)
    fp = _local(P, (-0.25, 0.04, 0.42), (0.25, 0.22, 0.6), fpastern)
    hpp = _local(P, (-0.25, 0.04, -0.8), (0.25, 0.22, -0.62), hpastern)
    d = smin(d, smin(fp, hpp, 0.0), 0.025)
    dw = _local(P, (-0.25, 0.05, 0.4), (0.25, 0.14, 0.49), dews)
    dw = np.minimum(dw, _local(P, (-0.25, 0.05, -0.81), (0.25, 0.14, -0.72), dews))
    d = smin(d, dw, 0.012)
    ho = _local(P, (-0.26, -0.01, 0.45), (0.26, 0.11, 0.65), hooves)
    ho = np.minimum(ho, _local(P, (-0.26, -0.01, -0.76), (0.26, 0.11, -0.56), hooves))
    d = smin(d, ho, 0.008)
    d = d + _local(P, (-0.38, 0.7, -1.15), (0.38, 2.0, 0.8), folds, far=0.0)
    return d


PREVIEW = {
    'side': ((7.0, 1.4, 0.2), (0, 1.3, 0.2), 30),
    'front3q': ((4.2, 2.3, 4.8), (0, 1.3, 0.25), 30),
    'front': ((0.0, 1.8, 6.5), (0, 1.5, 0.0), 26),
    'rear3q': ((-3.6, 2.5, -4.6), (0, 1.3, -0.2), 30),
    'face': ((1.2, 2.3, 3.2), (0, 1.85, 1.2), 26),
    'faceside': ((2.2, 1.9, 1.35), (0.0, 1.8, 1.3), 24),
    'feet': ((1.4, 0.35, 1.6), (0.17, 0.25, 0.3), 32),
    'eye': ((0.65, 1.95, 1.5), (0.1, 1.88, 1.18), 12),
    'muzzle': ((0.75, 1.6, 2.3), (0.03, 1.55, 1.55), 18),
    'antler': ((1.9, 2.8, 2.2), (0.35, 2.05, 0.95), 26),
    'antlerside': ((2.6, 2.3, 0.95), (0.35, 2.05, 0.95), 28),
}

WEIGHT_SMOOTH = (6, 0.5)


def bone_tips(P):
    t = {'hips': P['chest'], 'chest': P['neck'], 'neck': P['neck2'], 'neck2': P['head'], 'head': hp(HL, -0.05), 'antler': PALM_B + PALM_U * 0.4,
         'tail1': V(0, 1.5, -1.12)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (HOOF_H + V(0, 0.02, 0.08)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (HOOF_F + V(0, 0.02, 0.08)) * m
        t['ear' + s] = (EAR_B + EAR_A * EAR_L) * m
    return t


def keep(P):
    Pm = _mirror(P)
    e = sstep(0.05, 0.028, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.9
    L = hframe(Pm)
    m = sstep(0.6, 0.66, L[:, 2]) * sstep(-0.2, -0.12, L[:, 1]) * 0.6
    a, c, n = U.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    er = sstep(-0.01, 0.02, a) * sstep(0.07, 0.05, np.abs(c)) * sstep(0.04, 0.02, np.abs(n)) * 0.7
    u, v, w = palm_coords(Pm)
    an = (U.box(Pm, ANT_BOX[0] * V(0, 1, 1) + V(0.05, 0, 0), ANT_BOX[1]) & (Pm[:, 1] > BURR[1] - 0.03)).astype(F) * 0.75
    h = sstep(0.12, 0.08, Pm[:, 1]) * 0.7
    return np.maximum.reduce([e, m, er, an, h])


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    P = wpos.astype(F)
    Q = _mirror(P)
    side = np.where(P[:, 0] >= 0, 'L', 'R')
    for mb, nb in (('antler', 'head'),):
        W[:, bi[nb]] += W[:, bi[mb]]
        W[:, bi[mb]] = 0
    W[:, bi['ctag']] = 0
    # the tail stub on the tail bone, the rump around it on the hips
    tl = (Q[:, 2] < -1.03) & (Q[:, 1] > 1.45) & (Q[:, 0] < 0.07)
    W[~tl, bi['hips']] += W[~tl, bi['tail1']]; W[~tl, bi['tail1']] = 0
    W[tl] = 0; W[tl, bi['tail1']] = 1
    # antlers ride on the antler bone only (it hides them on calves)
    an = _local(P, *ANT_BOX, antler)
    hd = _local(P, (-0.2, 1.3, 0.75), (0.2, 2.06, 1.74), head)
    on_ant = (an < 0.004) & (an < hd - 0.001) & ((Q - BURR) @ BURR_AX > -0.002)
    W[on_ant] = 0; W[on_ant, bi['antler']] = 1
    # the bell hangs from the upper neck
    bl = _local(P, (-0.08, 1.33, 0.9), (0.08, 1.75, 1.12), bell)
    on_b = (bl < 0.004) & (Q[:, 1] < 1.62)
    W[on_b] = 0; W[on_b, bi['neck2']] = 1
    a, c, n = U.ear_coords(Q, EAR_B, EAR_A, EAR_N)
    ed = ears(P)
    on_ear = (ed < 0.004) & (a > -0.015) & ~on_ant
    k = sstep(0.0, 0.05, a)
    for s in 'LR':
        m = on_ear & (side == s)
        W[m] *= (1 - k[m])[:, None]
        W[m, bi['ear' + s]] += k[m]
        W[m, bi['ear' + ('R' if s == 'L' else 'L')]] = 0
    for s in 'LR':
        sg = 1 if s == 'L' else -1
        for f, paw in ((HOOF_F, 'fpaw'), (HOOF_H, 'hpaw')):
            near = (np.abs(wpos[:, 0] - sg * f[0]) < 0.1) & (np.abs(wpos[:, 2] - f[2]) < 0.13) & (wpos[:, 1] < 0.13)
            W[near] = 0; W[near, bi[paw + s]] = 1
    return W


# ---------- coat paint (sRGB 0..1) and fine detail (meters) ----------
hx = U.hexc
K = {
    'coat': hx(0x45342A), 'coatLt': hx(0x574337), 'coatDk': hx(0x2E231C), 'saddle': hx(0x6A5A4C), 'leg': hx(0x8E8170), 'legLt': hx(0xAA9E8E),
    'legDk': hx(0x655848), 'face': hx(0x3E3027), 'muzzle': hx(0x4A3D33), 'nose': hx(0x221A16), 'hoof': hx(0x1E1A17), 'hoofHi': hx(0x3C3530),
    'earIn': hx(0x8A7B6C), 'earRim': hx(0x1E1712), 'ball': hx(0x100A08), 'lid': hx(0x261C15), 'bell': hx(0x241A14),
    'antBase': hx(0x4E3E2E), 'antMid': hx(0x7C664A), 'antEdge': hx(0xB8A27C), 'antDk': hx(0x3A2D20),
    'calf': hx(0x7A4A2E), 'calfDk': hx(0x5A3520), 'calfLeg': hx(0x86563A), 'calfMuz': hx(0x5A3A26),
}


def flow(P, N=None):
    Q = _mirror(P)
    y, z = Q[:, 1], Q[:, 2]
    one = np.ones_like(y)
    body = np.stack([0 * y, -(0.12 + 0.9 * sstep(1.4, 1.15, y)), -one], 1)
    neckd = np.stack([0 * y, -0.8 * one, -0.5 * one], 1)
    legd = np.stack([0 * y, -one, -0.1 * one], 1)
    head = np.tile(HA, (len(P), 1))
    L = hframe(Q)
    wh = sstep(-0.06, 0.02, L[:, 2]) * sstep(1.6, 1.7, y + 0.3 * sstep(0.9, 1.3, z))
    wn = sstep(0.62, 0.75, z) * sstep(1.4, 1.55, y) * (1 - wh)
    wl = sstep(1.05, 0.9, y) * (1 - wh - wn)
    a, c, n = U.ear_coords(Q, EAR_B, EAR_A, EAR_N)
    we = sstep(-0.005, 0.03, a) * sstep(0.1, 0.06, np.abs(c)) * sstep(0.05, 0.025, np.abs(n))
    bl = sstep(0.006, 0.0, _local(P, (-0.08, 1.33, 0.9), (0.08, 1.75, 1.12), bell))
    f = body * (1 - wh - wn - wl)[:, None] + head * wh[:, None] + neckd * wn[:, None] + legd * wl[:, None]
    f = f * (1 - we)[:, None] + EAR_A[None, :] * we[:, None]
    f = f * (1 - bl)[:, None] + V(0, -1, 0.05)[None, :] * bl[:, None]
    f = f / np.maximum(np.linalg.norm(f, axis=1, keepdims=True), 1e-9)
    f[:, 0] *= np.sign(P[:, 0] + 1e-12)
    return f.astype(F)


def _regions(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    r = {}
    Pm = _mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(x + 1e-9)
    r['Pm'], r['Nm'] = Pm, Nm
    r['hoof'] = sstep(0.004, 0.0008, c['hoof'])
    r['dew'] = sstep(0.004, 0.0008, c['dew']) * (1 - r['hoof'])
    r['antler'] = sstep(0.004, 0.001, c['antler']) * sstep(-0.012, -0.002, (Pm - BURR) @ BURR_AX)
    r['bell'] = sstep(0.005, 0.001, c['bell']) * sstep(1.62, 1.58, Pm[:, 1])
    a, cc, n = U.ear_coords(Pm, EAR_B, EAR_A, EAR_N)
    r['ea'], r['ec'] = a, cc
    r['ear'] = sstep(0.005, 0.001, c['ear']) * sstep(-0.01, 0.02, a)
    r['earIn'] = sstep(-0.1, 0.45, Nm @ EAR_N)
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    r['eyeD'] = de
    r['ball'] = sstep(0.0014, 0.0004, c['ball']) * sstep(EYE_R + 0.004, EYE_R + 0.001, de)
    r['lid'] = sstep(EYE_R + 0.008, EYE_R + 0.0035, de) * (1 - r['ball'])
    L = hframe(Pm)
    r['L'] = L
    r['head'] = sstep(-0.06, -0.02, L[:, 2]) * sstep(0.012, 0.0, c['head']) * (1 - r['antler'])
    r['muzzle'] = sstep(0.5, 0.62, L[:, 2]) * r['head']
    r['nos'] = sstep(0.006, 0.0, c['head']) * sstep(0.04, 0.015, np.linalg.norm((L - NOS_C) * V(1, 0.5, 1), axis=1))
    r['leg'] = sstep(1.12, 0.95, y)
    r['belly'] = sstep(-0.3, -0.8, N[:, 1]) * sstep(1.3, 1.15, y) * (1 - r['leg'])
    r['top'] = sstep(0.2, 0.85, N[:, 1])
    r['mane'] = sstep(0.4, 0.8, Nm[:, 1] - 0.3 * Nm[:, 2]) * sstep(0.1, 0.03, Pm[:, 0]) * sstep(0.1, 0.3, z) * sstep(1.02, 0.92, z) * (1 - r['head'])
    return r


_scache = {}


def _strands(P, N, R):
    key = (len(P), float(P[:7].sum()))
    if key not in _scache:
        dens = 0.85 * (1 - R['hoof']) * (1 - R['dew']) * (1 - R['antler']) * (1 - R['ball']) * (1 - R['nos']) * sstep(EYE_R + 0.006, EYE_R + 0.012, R['eyeD'])
        _scache[key] = U.strands(P, N, dens, flow, cell=0.004, l0=0.009, l1=0.018, wid=0.0006)
    return _scache[key]


def _antler_col(P, N, R, n2):
    u, v, w = palm_coords(R['Pm'])
    d2 = _plate_sdf(PALM_OUT)(u, v)
    f, s_, _ = brow_coords(R['Pm'])
    d2 = np.minimum(d2, _plate_sdf(BROW_OUT)(f, s_))
    edge = sstep(-0.03, -0.004, d2) * sstep(0.04, 0.12, np.maximum(u, f))
    col = np.tile(K['antMid'], (len(P), 1))
    col = U.mix(col, K['antBase'], sstep(0.15, 0.0, u) * 0.8 + 0.2 * (n2 - 0.5))
    col = U.mix(col, K['antEdge'], edge * 0.7)
    # the grooves and veins over the palm
    g = _palm_grain(R['Pm'], u, v)
    col = U.mix(col, K['antDk'], sat(-g / 0.0006) * 0.45 * (1 - edge))
    return col, edge


def _palm_grain(Pm, u, v):
    """antler texture: shallow grooves running out toward the points, and a fine rough grain"""
    a = np.arctan2(v - 0.05, np.maximum(u, 0.02))
    w = 0.5 * (fbm(Pm * 25, 2, 72) - 0.5)
    g = -0.0006 * sstep(0.3, 0.95, np.cos(a * 24 + w * 6)) * sstep(0.05, 0.2, u)
    return g - 0.0003 * sstep(0.5, 0.8, vnoise(Pm * 400, 73))


def paint(P, N, c, baby=False):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    R = _regions(P, N, c)
    Pm, L, Nm = R['Pm'], R['L'], R['Nm']
    n1 = fbm(Pm * 4, 3, 11)
    n2 = fbm(Pm * 18, 3, 12)
    if baby:
        col = np.tile(K['calf'], (len(P), 1))
        col = U.mix(col, K['calfDk'], R['top'] * 0.35 + R['belly'] * 0.3)
        col = U.mix(col, K['calfLeg'], R['leg'] * 0.6)
    else:
        col = np.tile(K['coat'], (len(P), 1))
        col = U.mix(col, K['coatLt'], sstep(0.2, 0.75, np.abs(N[:, 0])) * sstep(-0.3, 0.3, N[:, 1]) * 0.4)
        col = U.mix(col, K['coatDk'], R['belly'] * 0.6 + R['top'] * 0.15)
        # a paler grey brown saddle over the back behind the hump
        sad = sstep(0.4, 0.85, N[:, 1]) * sstep(-0.9, -0.6, z) * sstep(0.35, 0.1, z)
        col = U.mix(col, K['saddle'], sad * (0.45 + 0.2 * n1))
        # legs: pale grey brown below the elbows and the stifles, whiter on the insides, darker down the fronts
        lg = R['leg']
        col = U.mix(col, K['leg'], lg)
        col = U.mix(col, K['legLt'], lg * sstep(0.05, -0.6, Nm[:, 0]) * 0.6)
        col = U.mix(col, K['legDk'], lg * sstep(0.2, 0.85, Nm[:, 2]) * sstep(0.55, 0.3, y) * 0.5)
    col *= (0.92 + 0.16 * n1)[:, None]
    # ears: paler and hairy inside, dark rims
    a, cc = R['ea'], R['ec']
    ear = R['ear']
    col = U.mix(col, K['earIn'], ear * R['earIn'] * sstep(0.02, 0.08, a) * sstep(0.05, 0.03, np.abs(cc)) * 0.75)
    col = U.mix(col, K['earRim'], ear * sstep(0.2, 0.235, a) * 0.7)
    # head: a long dark face, the big muzzle a little greyer, dark around the nostrils and the lips
    hd = R['head']
    col = U.mix(col, K['calfMuz'] if baby else K['face'], hd * 0.7)
    col = U.mix(col, K['calfMuz'] if baby else K['muzzle'], R['muzzle'] * 0.8)
    col = U.mix(col, K['nose'], R['nos'] * 0.85)
    col = U.mix(col, K['nose'], hd * sstep(-0.12, -0.14, L[:, 1]) * sstep(0.5, 0.58, L[:, 2]) * 0.6)
    col = U.mix(col, K['lid'], R['lid'])
    col = U.mix(col, K['bell'], R['bell'] * (0.5 if baby else 0.8))
    s = _strands(P, N, R)
    col *= (1 + (s * 0.22 - 0.07) * (1 - R['hoof']) * (1 - R['antler']))[:, None]
    hc = U.mix(np.tile(K['hoof'], (len(P), 1)), K['hoofHi'], sstep(0.4, 0.8, vnoise(Pm * V(300, 15, 300), 15)) * 0.6 + sstep(0.03, 0.0, y) * 0.3)
    col = U.mix(col, hc, np.maximum(R['hoof'], R['dew']))
    an = R['antler'] > 0.01
    edge = np.zeros(len(P), F)
    if an.any():
        ac, e = _antler_col(P[an], N[an], {k: (v[an] if isinstance(v, np.ndarray) and len(v) == len(P) else v) for k, v in R.items()}, n2[an])
        col[an] = U.mix(col[an], ac, R['antler'][an])
        edge[an] = e
    col = U.mix(col, K['ball'], R['ball'])
    rough = 0.64 + 0.08 * (n2 - 0.5) - 0.25 * R['nos'] - 0.3 * R['hoof'] + 0.1 * R['antler'] - 0.15 * R['antler'] * edge
    rough = rough - 0.25 * R['lid'] * sstep(EYE_R + 0.007, EYE_R + 0.003, R['eyeD'])
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def paint_baby(P, N, c):
    return paint(P, N, c, baby=True)


def detail(P, N, c):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    h = np.zeros(len(P), F)
    skin = (1 - R['hoof']) * (1 - R['ball']) * (1 - R['antler']) * (1 - R['dew'])
    h += 0.00006 * _strands(P, N, R) * skin
    v1, v2 = worley(Pm * V(25, 8, 25), 31)
    vein = sstep(0.06, 0.0, v2 - v1) * sstep(1.0, 0.75, y) * sstep(0.25, 0.4, y)
    h += 0.00015 * vein * skin
    g1, _ = worley(Pm / 0.004, 58)
    h -= 0.0001 * sstep(0.35, 0.1, g1) * R['nos']
    er = np.abs(np.sin(np.pi * (R['eyeD'] / 0.0035 + 0.8 * fbm(Pm * 90, 2, 55))))
    h -= 0.00014 * np.exp(-(er / 0.3) ** 2) * sstep(EYE_R + 0.005, EYE_R + 0.01, R['eyeD']) * sstep(0.05, 0.035, R['eyeD'])
    h -= (0.00005 * vnoise(Pm * V(900, 40, 900), 59) + 0.00003 * np.abs(np.sin(y * 600))) * R['hoof']
    an = R['antler'] > 0.01
    if an.any():
        u, v, w = palm_coords(Pm[an])
        h[an] += _palm_grain(Pm[an], u, v) * R['antler'][an]
        p1, _ = worley(Pm[an] / 0.006, 43)
        h[an] += 0.0004 * sstep(0.5, 0.15, p1) * sstep(0.09, 0.0, length(Pm[an] - BURR))
    return h


def finish(C, ao, valid):
    return U.finish(C, ao, valid, floor=0.5)


# ---------- coat: coarse hair, a mane over the hump and neck, long hair on the bell ----------
FUR = {'len': 0.026, 'n': 4, 'lean': 1.4, 'tile': 0.0019, 'babyLen': 1.4, 'babyLean': 0.8, 'quality': 80}


def fur(P, N, c):
    R = _regions(P, N, c)
    ln = np.full(len(P), 0.012, F)
    ln = ln * (1 - R['head'] * 0.5) * (1 - R['leg'] * 0.55)
    ln = ln + R['mane'] * 0.013 + R['bell'] * 0.012 * sstep(1.55, 1.42, R['Pm'][:, 1])
    ln = ln + R['ear'] * R['earIn'] * sstep(0.02, 0.1, R['ea']) * 0.008
    ln = ln * (1 - R['hoof']) * (1 - R['dew']) * (1 - R['antler']) * (1 - R['nos']) * sstep(EYE_R + 0.006, EYE_R + 0.013, R['eyeD'])
    dens = np.ones(len(P), F)
    return np.clip(ln, 0, FUR['len']).astype(F), dens


MAP_QUALITY = (74, 70)
BABY_MAP = (512, 74)


def stats(P, N, c, col):
    R = _regions(P, N, c)
    return {'lidCol': U.lid_color(col, R['eyeD'], EYE_R)}


def meta(st):
    r = EYE_R
    up, dn = (LID_OFF + LID_H) / r, (LID_OFF - LID_H) / r
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.3],
                'iris': 0x1E140C, 'irisR': 0.97, 'pupil': 'h', 'pupilR': 0.42, 'rim': 0x0C0705, 'lidCol': st['lidCol'],
                'lash': {'n': 16, 'len': 0.016, 'col': 0x1A120E}},
        'collar': {'at': ['neck2', 'head', 0.0], 'w': 0.75, 'r': 0.8, 'tilt': 0.45, 'maxR': 0.3},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
        'rim': [0.14, 0.1, 0.08], 'flat': 0x3A2B21,
    }


UV_AVERAGE = True


def uv_weight(P):
    Pm = _mirror(P)
    L = hframe(Pm)
    head = sstep(-0.08, 0.0, L[:, 2]) * sstep(1.4, 1.5, Pm[:, 1]) * sstep(1.0, 1.1, Pm[:, 2] + 0.3)
    an = U.box(Pm, ANT_BOX[0] * V(0, 1, 1) + V(0.05, 0, 0), ANT_BOX[1]).astype(F)
    hoof = sstep(0.14, 0.1, Pm[:, 1])
    under = sstep(1.2, 1.1, Pm[:, 1]) * sstep(1.05, 1.12, Pm[:, 1]) * sstep(0.15, 0.08, Pm[:, 0])
    return (0.92 + 0.6 * head * (1 - an) - 0.1 * an + 0.25 * hoof - 0.3 * under).astype(F)


def uv_regions(P):
    Pm = _mirror(P)
    L = hframe(Pm)
    y, z = Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 2)
    head = (L[:, 2] > -0.06) & (z > 0.9) & (y > 1.3)
    neck = ~head & (z > 0.62) & (y > 1.3)
    fleg = (z > 0.0) & (y < 1.15)
    hleg = (z <= 0.0) & (y < 1.2)
    lab[neck] = 1
    lab[head] = 0
    lab[fleg] = 3
    lab[fleg & (y < 0.58)] = 4
    lab[hleg] = 5
    lab[hleg & (y < 0.7)] = 6
    lab[y < 0.12] = 7
    lab[U.box(Pm, ANT_BOX[0] * V(0, 1, 1) + V(0.05, 0, 0), ANT_BOX[1]) & (y > BURR[1] - 0.01) & (Pm[:, 0] > 0.11)] = 8
    lab[(y < 1.62) & (y > 1.3) & (z > 0.9) & (z < 1.12) & (Pm[:, 0] < 0.06) & ~head] = 9
    return lab
