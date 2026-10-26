# Eastern painted turtle, sculpted as signed distance fields around the game's turtle skeleton. Units are meters in game
# rig space (x left, y up, z forward, ground at y = 0); bone pivots come from tools/blender/work/turtle-rig.json.
# Two separate pieces (PIECES): the rigid shell (carapace, bridge and plastron, all on the hips bone) and the soft
# body (neck and head, legs, tail) that starts deep inside the shell, so the head can pull in and the legs move
# without stretching the shell. The scutes, seams, growth rings and markings are painted and carved per texel.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, chain, frame, fbm, vnoise, length, _hash

ID = 'turtle'
BOUNDS = (V(-0.145, -0.001, -0.165), V(0.145, 0.118, 0.21))
PATCHES = [
    (V(0.004, 0.054, 0.163), V(0.0195, 0.073, 0.186), 0.0002),     # eye and lids
    (V(0.0, 0.042, 0.178), V(0.0115, 0.066, 0.204), 0.00025),      # snout, nostrils, beak
    (V(0.094, -0.001, 0.088), V(0.142, 0.016, 0.142), 0.00025),    # front foot
    (V(0.090, -0.001, -0.112), V(0.145, 0.016, -0.058), 0.00025),  # hind foot
]
BAKE_CAGE = (0.0022, 0.007)
AO_DIST = 0.03

# ---------- landmarks ----------
EYE_C = V(0.0112, 0.0617, 0.1738)
EYE_R = 0.0041
EYE_DIR = nrm([0.86, 0.26, 0.44])
EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
LID_W, LID_H, LID_OFF = 0.0036, 0.0030, -0.0002
NOSTRIL = V(0.0021, 0.0600, 0.1968)
MOUTH = V(0.0, 0.0505, 0.196)
WRIST = V(0.110, 0.014, 0.100)
HAND = V(0.1165, 0.0062, 0.1105)
ANKLE = V(0.108, 0.014, -0.096)
FOOT = V(0.1165, 0.0062, -0.0885)
# toes: angle (deg, 0 = forward, + outward), toe length, claw length
F_TOES = [(-22, 0.0062, 0.0075), (-5, 0.0078, 0.0088), (13, 0.0082, 0.0090), (31, 0.0076, 0.0084), (50, 0.0060, 0.0070)]
H_TOES = [(-6, 0.0085, 0.0060), (16, 0.0102, 0.0066), (37, 0.0100, 0.0064), (58, 0.0088, 0.0058)]

# ---------- shell ----------
SH_A, SH_BF, SH_BR, SH_ZC, SH_P = 0.0905, 0.1275, 0.1305, -0.003, 2.3
SH_TOP = 0.1135


def _box(P, lo, hi):
    return np.all((P >= lo) & (P <= hi), axis=1)


def _local(P, lo, hi, fn, far=1.0):
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


def plan_q(x, z):
    """carapace outline in plan: 0 at the middle, 1 on the rim; and the angle around (0 front, pi back)"""
    dz = z - SH_ZC
    B = np.where(dz > 0, SH_BF, SH_BR)
    q = ((np.abs(x) / SH_A) ** SH_P + (np.abs(dz) / B) ** SH_P) ** (1 / SH_P)
    th = np.arctan2(np.abs(x) / SH_A, dz / B)
    return q.astype(F), th.astype(F)


def rim_y(z):
    """height of the carapace edge: low along the sides (over the bridge), higher at the front and back where the
    head, legs and tail come out"""
    return (0.0415 + 0.0225 * sstep(0.03, 0.105, z) + 0.0165 * sstep(-0.035, -0.11, z)).astype(F)


def top_y(x, z):
    q, _ = plan_q(x, z)
    r = rim_y(z)
    return r + (SH_TOP - r) * np.clip(1 - np.minimum(q, 1) ** 2.6, 0, 1) ** 0.9


def plastron_w(z):
    """half width of the plastron (front lobe, bridge, back lobe with the notch at the tail)"""
    zf = np.clip((z - 0.044) / 0.068, 0, 1)
    zr = np.clip((-0.05 - z) / 0.073, 0, 1)
    w = 0.064 * np.where(z > 0.044, np.sqrt(np.clip(1 - zf ** 2.6, 0, 1)), np.where(z < -0.05, np.sqrt(np.clip(1 - zr ** 2.4, 0, 1)), 1.0))
    return w.astype(F)


def shell(P):
    Q = _mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    q, th = plan_q(x, z)
    r = rim_y(z)
    # carapace: a dome down to its rim, with a thin flange (the marginal scutes) all around
    yt = top_y(x, z)
    # height above the dome, divided by its slope so the field stays a distance on the steep sides
    e = 0.0004
    gx = (top_y(x + e, z) - top_y(np.maximum(x - e, 0), z)) / (e + np.minimum(x, e))
    gz = (top_y(x, z + e) - top_y(x, z - e)) / (2 * e)
    d_plan = (q - 1) * 0.07
    d_dome = smax(d_plan, (y - yt) / np.sqrt(1 + gx * gx + gz * gz), 0.003)
    cap = smax(d_dome, (r - 0.0048) - y, 0.0025)
    # plastron: a flat plate underneath, a little narrower than the carapace
    pw = plastron_w(z)
    d_pl = smax(x - pw, np.maximum(z - 0.112, -0.123 - z), 0.006)
    # notch between the back lobes, under the tail
    d_pl = smax(d_pl, -(0.006 - np.abs(x) * 0.9 - (z + 0.123) * 0.6), 0.002)
    plate = smax(d_pl, np.maximum(0.0285 - y, y - 0.0355), 0.0025)
    # bridge and the body inside: a column from the plastron up into the carapace, wall to wall along the sides
    wide = sstep(0.05, 0.036, np.abs(z + 0.003))
    W = SH_A * np.clip(1 - (np.abs(z - SH_ZC) / np.where(z > SH_ZC, SH_BF, SH_BR)) ** SH_P, 0, 1) ** (1 / SH_P)
    wc = 0.056 * np.sqrt(np.clip(1 - ((z + 0.003) / 0.086) ** 2, 0, 1))
    wcol = np.maximum(wc, (W - 0.0075) * wide)
    d_col = smax(x - wcol, np.maximum(0.03 - y, y - (r + 0.006)), 0.004)
    d = smin(cap, plate, 0.004)
    d = smin(d, d_col, 0.005)
    # recesses where the head, legs and tail come out (deeper into the body)
    for c, rr in ((V(0.0, 0.0490, 0.100), V(0.025, 0.0125, 0.032)), (V(0.058, 0.046, 0.07), V(0.026, 0.0155, 0.02)),
                  (V(0.054, 0.0445, -0.072), V(0.026, 0.0150, 0.022)), (V(0.0, 0.0435, -0.113), V(0.013, 0.0105, 0.022))):
        d = smax(d, -ellipsoid(Q, c, rr), 0.006)
    return d


# ---------- soft body ----------
def head(P):
    Q = _mirror(P)
    # neck from deep inside the shell
    d = chain(Q, [V(0, 0.0465, 0.035), V(0, 0.049, 0.1), V(0, 0.0525, 0.136)], [0.0158, 0.0142, 0.0124], 0.004)
    # cranium, snout and lower jaw
    d = smin(d, superellipsoid(Q, V(0, 0.0572, 0.1610), (0.0136, 0.0118, 0.0205), 2.2, rb=0.0100), 0.006)
    d = smin(d, ellipsoid(Q, V(0, 0.0558, 0.1870), V(0.0073, 0.0074, 0.0128)), 0.005)
    d = smin(d, round_cone(Q, V(0.0082, 0.0498, 0.1555), V(0.0026, 0.0500, 0.1945), 0.0058, 0.0030), 0.003)
    # cheeks behind the eye and the throat
    d = smin(d, ellipsoid(Q, V(0.0090, 0.0540, 0.1575), V(0.0036, 0.0062, 0.0095)), 0.005)
    d = smin(d, ellipsoid(Q, V(0, 0.0472, 0.148), V(0.0098, 0.0062, 0.019)), 0.005)
    # brow over the eye, flat crown
    d = smin(d, ellipsoid(Q, V(0.0078, 0.0655, 0.1735), V(0.0038, 0.0018, 0.0060)), 0.002)
    # nostrils: two small holes at the tip of the snout
    d = smax(d, -ellipsoid(Q, NOSTRIL, V(0.0007, 0.0006, 0.0009)), 0.0003)
    # mouth: a groove from the tip back to the corner below the eye; a small notch in the upper beak at the tip
    M = Q * V(1, 2.2, 1) - V(0, 0.0512 * 1.2, 0)
    m = round_cone(M, V(0.0, 0.0510, 0.1985), V(0.0050, 0.0512, 0.192), 0.0006, 0.0006)
    m = smin(m, round_cone(M, V(0.0050, 0.0512, 0.192), V(0.0102, 0.0520, 0.162), 0.0006, 0.0003), 0.0004)
    d = smax(d, -(m + 0.0004) / 1.2, 0.0006)
    d = smax(d, -ellipsoid(Q, V(0.0, 0.0512, 0.1985), V(0.0012, 0.0016, 0.0012)), 0.0005)
    # eye: lid mound, the opening, the ball
    ca, li, ba = eye_parts(P)
    d = smin(d, li, 0.0015)
    d = smax(d, -ca, 0.0004)
    d = smin(d, ba, 0.0003)
    return d


def eye_parts(P):
    Q = _mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0002, -0.0009), V(EYE_R + 0.0013, EYE_R + 0.0011, EYE_R - 0.0001))
    ua = u - LID_OFF
    ap = np.sqrt((s / LID_W) ** 2 + (ua / LID_H) ** 2) - 1
    ap = ap + 0.12 * sstep(0.5, 1.0, np.abs(s) / LID_W) * (np.abs(ua) / LID_H)
    carve = smax(ap * LID_H, -g - 0.0003, 0.0003)
    ball = length(D + EYE_DIR * 0.0004) - EYE_R * 0.86
    return carve, lids, ball


def tail(P):
    Q = _mirror(P)
    return chain(Q, [V(0, 0.0435, -0.08), V(0, 0.0432, -0.118), V(0, 0.039, -0.142), V(0, 0.0335, -0.158)], [0.0112, 0.0088, 0.0050, 0.0011], 0.003)


def _digit(Q, base, a_deg, L, cl, r0):
    a = np.radians(a_deg)
    d2 = V(np.sin(a), 0, np.cos(a))
    p1 = base + d2 * L + V(0, -0.0008, 0)
    t = round_cone(Q, base, p1, r0, r0 * 0.75)
    c0 = p1 + d2 * 0.0004
    c1 = p1 + d2 * (cl * 0.55) + V(0, -0.0006, 0)
    c2 = p1 + d2 * cl + V(0, -0.0028, 0)
    c = chain(Q, [c0, c1, c2], [r0 * 0.62, r0 * 0.42, 0.00022], 0.0)
    return t, c


def legs(P):
    Q = _mirror(P)
    fr = chain(Q, [V(0.036, 0.0465, 0.062), V(0.065, 0.046, 0.075), V(0.100, 0.0385, 0.094)], [0.0136, 0.0132, 0.0118], 0.004)
    fr = smin(fr, chain(Q, [V(0.100, 0.0385, 0.094), V(0.1065, 0.026, 0.097), WRIST], [0.0118, 0.0106, 0.0094], 0.003), 0.003)
    # front foot: a flat webbed paddle
    fr = smin(fr, superellipsoid(Q, HAND + V(0, 0.0006, 0), (0.0108, 0.0040, 0.0118), 2.4, rb=0.0040, ax=nrm([0.35, 0, 1])), 0.004)
    hi = chain(Q, [V(0.032, 0.0445, -0.062), V(0.060, 0.044, -0.080), V(0.098, 0.0385, -0.090)], [0.0152, 0.0148, 0.0126], 0.004)
    hi = smin(hi, chain(Q, [V(0.098, 0.0385, -0.090), V(0.1035, 0.026, -0.094), ANKLE], [0.0124, 0.0112, 0.0102], 0.003), 0.003)
    hi = smin(hi, superellipsoid(Q, FOOT + V(0, 0.0006, -0.002), (0.0122, 0.0044, 0.0142), 2.4, rb=0.0044, ax=nrm([0.55, 0, 1])), 0.004)
    return fr, hi


def toes(P):
    Q = _mirror(P)
    out_t, out_c = None, None
    for base, TOES, r0, fwd in ((HAND, F_TOES, 0.0026, 0.0085), (FOOT, H_TOES, 0.0029, 0.0098)):
        for a, L, cl in TOES:
            ar = np.radians(a)
            b = base + V(np.sin(ar), 0, np.cos(ar)) * fwd + V(0, 0.0004, 0)
            t, c = _digit(Q, b, a, L, cl, r0)
            out_t = t if out_t is None else smin(out_t, t, 0.0025)
            out_c = c if out_c is None else np.minimum(out_c, c)
    return out_t, out_c


def soft(P):
    d = _local(P, (-0.03, 0.025, 0.015), (0.03, 0.08, 0.21), head)
    d = np.minimum(d, _local(P, (-0.02, 0.02, -0.165), (0.02, 0.06, -0.06), tail))
    fr, hi = _local_n(P, (-0.145, -0.002, -0.12), (0.145, 0.065, 0.135), legs, 2)
    d = np.minimum(d, fr)
    d = np.minimum(d, hi)
    to, cl = _local_n(P, (-0.15, -0.002, -0.12), (0.15, 0.014, 0.15), toes, 2)
    d = smin(d, to, 0.002)
    d = smin(d, cl, 0.0004)
    return d


def shell_l(P):
    return _local(P, (-0.1, 0.02, -0.14), (0.1, 0.12, 0.135), shell)


PIECES = [shell_l, soft]


def shape(P):
    return np.minimum(shell_l(P), soft(P))


def parts(P):
    so, li, ba = eye_parts(P)
    fr, hi = legs(P)
    to, cl = toes(P)
    return {'shell': shell(P), 'head': head(P), 'tail': tail(P), 'lids': li, 'ball': ba, 'fleg': fr, 'hleg': hi, 'toe': to, 'claw': cl}


TAIL_RINGS = 0
UV_PACK = {'rotate_method': 'AXIS_ALIGNED'}
BEND = [
    (V(0, 0.046, 0.04), V(0, 0.053, 0.145), 0.008, 0.022),           # neck
    (V(0.036, 0.0465, 0.062), V(0.100, 0.0385, 0.094), 0.0075, 0.017),  # upper arm
    (V(0.100, 0.0385, 0.094), WRIST, 0.0065, 0.014),                 # forearm
    (V(0.032, 0.0445, -0.062), V(0.098, 0.0385, -0.090), 0.0075, 0.019),  # thigh
    (V(0.098, 0.0385, -0.090), ANKLE, 0.0065, 0.015),                # shin
    (V(0, 0.0435, -0.08), V(0, 0.034, -0.156), 0.008, 0.014),        # tail
]


def _is_shell(c):
    return float(shell(np.array([[c.x, c.y, c.z]], F))[0]) < 0.0012


def lowpoly_fix(bm, hi):
    """rings across the neck, legs and tail so they bend (see meshfix.py); never through the shell"""
    import meshfix as MF
    tr = MF.tree(hi)
    for a, b, pitch, reach in BEND:
        MF.rings(bm, tr, a, b, pitch, lambda c, p0, r, reach=reach: r < reach and not _is_shell(c))
    MF.finish(bm)


# how much the decimator keeps (it weighs these strongly; the parts compete for the triangle budget)
HEAD_KEEP, FEET_KEEP, RIM_KEEP, CLAW_KEEP = 0.45, 0.3, 0.1, 0.45


def keep(P):
    Pm = np.abs(P) * V(1, 0, 0) + P * V(0, 1, 1)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    e = sstep(0.0095, 0.006, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.3
    head = sstep(0.142, 0.15, z) * sstep(0.03, 0.02, x) * HEAD_KEEP
    tip = sstep(0.188, 0.196, z) * 0.2
    mouth = sstep(0.0012, 0.0004, np.abs(y - 0.0514)) * sstep(0.16, 0.168, z) * sstep(0.013, 0.009, x) * 0.2
    feet = sstep(0.012, 0.007, y) * sstep(0.09, 0.1, x) * FEET_KEEP
    _, cl = _local_n(P, (-0.15, -0.002, -0.12), (0.15, 0.012, 0.15), toes, 2)
    claw = sstep(0.0005, 0.0001, cl) * CLAW_KEEP
    # the shell's rim and the plastron's edges (its outline is what you see)
    q, _ = plan_q(x, z)
    sh = _local(P, (-0.1, 0.02, -0.14), (0.1, 0.12, 0.135), shell)
    rim = sstep(0.002, 0.0005, np.abs(sh)) * (sstep(0.9, 0.97, q) + sstep(0.04, 0.033, y)) * RIM_KEEP
    return np.maximum.reduce([e, head, tip, mouth, feet, claw, np.clip(rim, 0, RIM_KEEP)])


# ---------- skinning ----------
WEIGHT_SMOOTH = (4, 0.5)


def bone_tips(P):
    t = {'hips': V(0, 0.045, 0.05), 'neck': P['head'], 'head': V(0, 0.055, 0.2), 'tail1': V(0, 0.034, -0.158)}
    for s, sg in (('L', 1), ('R', -1)):
        m = V(sg, 1, 1)
        t['thigh' + s] = P['shin' + s]; t['shin' + s] = P['hmeta' + s]; t['hmeta' + s] = P['hpaw' + s]; t['hpaw' + s] = (FOOT + V(0.004, 0, 0.012)) * m
        t['arm' + s] = P['fore' + s]; t['fore' + s] = P['fmeta' + s]; t['fmeta' + s] = P['fpaw' + s]; t['fpaw' + s] = (HAND + V(0.003, 0, 0.012)) * m
    return t


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    W[:, bi['ctag']] = 0
    # the shell is rigid: all on the hips (whole connected pieces that lie on the shell, so no shell vertex next to
    # the neck or a leg picks up their weights)
    tri = weld[G['idx'].reshape(-1, 3)]
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    nw = len(wpos)
    e = np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]]])
    _, lab = connected_components(coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(nw, nw)), directed=False)
    on_shell = (np.abs(shell(wpos)) < np.abs(soft(wpos))).astype(float)
    frac = np.bincount(lab, on_shell) / np.maximum(np.bincount(lab), 1)
    sh = frac[lab] > 0.5
    W[sh] = 0; W[sh, bi['hips']] = 1
    # feet and claws on the paw bones
    for s in 'LR':
        sg = 1 if s == 'L' else -1
        for c, paw in ((HAND, 'fpaw'), (FOOT, 'hpaw')):
            dx = np.hypot(wpos[:, 0] - sg * c[0], wpos[:, 2] - c[2])
            low = (dx < 0.03) & (wpos[:, 1] < 0.0075) & (wpos[:, 0] * sg > 0.085) & ~sh
            W[low] = 0; W[low, bi[paw + s]] = 1
    # the head from behind the eyes forward is all head
    k = (sstep(0.146, 0.156, wpos[:, 2]) * (~sh))[:, None]
    hw = np.zeros_like(W); hw[:, bi['head']] = 1
    W = W * (1 - k) + hw * k
    # the tail on its bone
    tl = (wpos[:, 2] < -0.118) & (np.abs(wpos[:, 0]) < 0.014) & ~sh
    W[tl] = 0; W[tl, bi['tail1']] = 1
    return W


# ---------- paint ----------
def _hex(h):
    return np.array([((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255], F)


K = {
    'shell': _hex(0x262C1F), 'shellHi': _hex(0x3A4230), 'seam': _hex(0xA8A564), 'seamDk': _hex(0x6E6E3E),
    'red': _hex(0xC23A1E), 'redDk': _hex(0x8A2412), 'orange': _hex(0xD8742A),
    'plastron': _hex(0xE3B54C), 'plastronDk': _hex(0xB98A2E), 'skin': _hex(0x1D211A), 'skinHi': _hex(0x2B3126),
    'yellow': _hex(0xE6CB4A), 'beak': _hex(0x3A3428), 'beakHi': _hex(0x8A8064), 'claw': _hex(0x2E2A22), 'clawTip': _hex(0x7A705C),
    'ball': _hex(0x141210), 'gap': _hex(0x0C0D0A),
}
_cache = {}


def _mix(c, k, t):
    t = np.clip(t, 0, 1)[:, None]
    return c + (k - c) * t


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


# scutes: vertebral row half width, the seams across the back (vertebral and costal seams line up: eastern painted),
# the inner edge of the marginals (plan q), and the number of marginals per side
XV = 0.0265
ZSEAM = [0.074, 0.029, -0.019, -0.066]
QM = 0.855
NMARG = 12


def scutes(x, z):
    """distance (m, in plan) from each carapace point to the nearest seam, the kind of scute (0 vertebral, 1 costal,
    2 marginal), its index and the angle position inside a marginal (0..1)"""
    q, th = plan_q(x, z)
    ax = np.abs(x)
    rr = np.sqrt((ax / SH_A) ** 2 + ((z - SH_ZC) / np.where(z > SH_ZC, SH_BF, SH_BR)) ** 2) + 1e-6
    scale = np.sqrt(ax ** 2 + (z - SH_ZC) ** 2) / rr                     # meters per unit of q along the ray
    marg = q > QM
    # inner scutes
    xv = XV * (0.82 + 0.18 * np.cos(np.clip((z + 0.0) / 0.12, -1, 1) * np.pi / 2))
    d_v = np.abs(ax - xv)
    d_z = np.min(np.abs(z[:, None] - np.array(ZSEAM, F)[None]), 1)
    # the first vertebral seam does not cross the costals (C1 lies beside V1 and V2)
    dz_c = np.min(np.abs(z[:, None] - np.array(ZSEAM[1:], F)[None]), 1)
    d_in = np.where(ax < xv, np.minimum(d_v, d_z), np.minimum(d_v, dz_c))
    d_in = np.minimum(d_in, (QM - q) * scale)
    # marginals: radial seams spaced evenly by angle (a nuchal scute in front)
    th0, th1 = 0.12, np.pi - 0.06
    u = (th - th0) / (th1 - th0) * NMARG
    ui = np.floor(u)
    uf = u - ui
    arc = (th1 - th0) / NMARG * scale * q * 0.75
    d_m = np.minimum(uf, 1 - uf) * arc
    d_m = np.where(th < th0, np.minimum(th0 - th, 0.02) * scale * 0.75, np.minimum(d_m, (th - th0) * scale * 0.75 + 0.0))
    d_m = np.minimum(d_m, (q - QM) * scale)
    kind = np.where(marg, 2, np.where(ax < xv, 0, 1))
    d = np.where(marg, d_m, d_in)
    return d.astype(F), kind, ui, uf, q


def _regions(P, N, c):
    Pm = _mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    r = {'Pm': Pm, 'Nm': Nm}
    r['shell'] = sstep(0.0012, 0.0004, c['shell'])
    r['claw'] = sstep(0.0003, 0.00005, c['claw'])
    r['eyeD'] = np.linalg.norm(Pm - EYE_C, axis=1)
    r['ball'] = sstep(0.0004, 0.0001, c['ball']) * sstep(EYE_R + 0.0008, EYE_R + 0.0002, r['eyeD'])
    r['lid'] = sstep(EYE_R + 0.003, EYE_R + 0.0012, r['eyeD']) * (1 - r['ball'])
    r['head'] = sstep(0.0008, 0.0002, c['head']) * sstep(0.145, 0.152, z) * (1 - r['shell'])
    r['neck'] = sstep(0.0008, 0.0002, c['head']) * (1 - r['head']) * (1 - r['shell'])
    r['leg'] = np.maximum(np.maximum(sstep(0.0008, 0.0002, c['fleg']), sstep(0.0008, 0.0002, c['hleg'])), sstep(0.0008, 0.0002, c['toe'])) * (1 - r['shell'])
    r['tail'] = sstep(0.0008, 0.0002, c['tail']) * (1 - r['shell']) * (1 - r['leg'])
    # carapace top versus the underside (plastron, bridge, under the marginals)
    yt = top_y(x, z)
    r['cara'] = r['shell'] * sstep(rim_y(z) - 0.0035, rim_y(z) - 0.001, y) * sstep(-0.3, 0.1, Nm[:, 1] + 0.3)
    r['plast'] = r['shell'] * sstep(0.0375, 0.033, y) * sstep(-0.3, -0.7, Nm[:, 1])
    r['beak'] = r['head'] * sstep(0.0028, 0.0012, np.abs(y - 0.0512)) * sstep(0.172, 0.18, z)
    return r


def _stripes(R, P):
    """yellow and red stripes on the head, neck, legs and tail: thin lines along the limb"""
    Pm = R['Pm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    w = 0.6 * fbm(Pm * 90, 2, 61) - 0.3
    # neck and head: lines around the neck axis, running along it
    th = np.arctan2(x, y - (0.047 + 0.1 * np.clip(z - 0.04, 0, 0.12)))
    a = th / np.pi                                   # 0 top, 1 underneath
    yl = sstep(0.72, 0.9, np.cos(2 * np.pi * (a * 4.2 + w * 0.15)))
    rd = sstep(0.75, 0.92, np.cos(2 * np.pi * (a * 4.2 + 0.5 + w * 0.15))) * sstep(0.35, 0.55, a)
    neckY = yl * (1 - sstep(0.75, 0.95, a) * 0.0)
    # legs and tail: stripes running down each limb (by the angle around the nearest limb bone)
    ang = _around(Pm)
    s2 = np.cos(5 * ang + w * 1.5)
    legY = sstep(0.82, 0.95, s2)
    legR = sstep(0.8, 0.95, -s2)
    return neckY, rd, legY, legR


LIMBS = [(V(0.036, 0.0465, 0.062), V(0.100, 0.0385, 0.094)), (V(0.100, 0.0385, 0.094), WRIST), (V(0.032, 0.0445, -0.062), V(0.098, 0.0385, -0.090)),
         (V(0.098, 0.0385, -0.090), ANKLE), (V(0, 0.0435, -0.08), V(0, 0.0335, -0.158))]


def _around(P):
    """angle of each point around the nearest limb segment (0 on the side facing up or forward)"""
    best = np.full(len(P), 9.0, F); ang = np.zeros(len(P), F)
    for a, b in LIMBS:
        ax = b - a; L = np.linalg.norm(ax); ax = ax / L
        t = np.clip((P - a) @ ax, 0, L)
        r = P - (a + t[:, None] * ax)
        dist = np.linalg.norm(r, axis=1)
        ref = np.array([0, 1, 0], F) if abs(ax[1]) < 0.8 else np.array([0, 0, 1], F)
        e1 = ref - ax * (ref @ ax); e1 /= np.linalg.norm(e1); e2 = np.cross(ax, e1)
        an = np.arctan2(r @ e2, r @ e1)
        m = dist < best
        best = np.where(m, dist, best); ang = np.where(m, an, ang)
    return ang


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    n1 = fbm(Pm * 60, 3, 62)
    n2 = fbm(Pm * 220, 2, 63)
    col = np.tile(K['skin'], (n, 1))
    col = _mix(col, K['skinHi'], n2 * 0.6)
    # ---- skin: stripes ----
    neckY, neckR, legY, legR = _stripes(R, P)
    hn = R['head'] + R['neck']
    col = _mix(col, K['yellow'], neckY * hn * 0.95)
    col = _mix(col, K['red'], neckR * R['neck'] * 0.85)
    col = _mix(col, K['red'], legR * R['leg'] * 0.75 * sstep(0.012, 0.022, y))
    col = _mix(col, K['yellow'], legY * (R['leg'] * 0.35 + R['tail'] * 0.9) * sstep(0.01, 0.02, y))
    col = _mix(col, K['red'], legR * R['tail'] * 0.7)
    # head: a yellow spot behind the eye and a stripe from the jaw corner back; chin with broad yellow stripes
    ex = np.linalg.norm((Pm - (EYE_C + V(0.0002, 0.0008, -0.0085))) / V(1, 1, 1.4), axis=1)
    col = _mix(col, K['yellow'], sstep(0.0034, 0.0024, ex) * R['head'])
    chin = sstep(0.05, 0.047, y) * sstep(-0.2, -0.6, Nm[:, 1]) * (R['head'] + R['neck'])
    cs = sstep(0.55, 0.8, np.cos(2 * np.pi * (x / 0.0105 + 0.25)))
    col = _mix(col, K['yellow'], chin * cs)
    # beak: dark horn with a paler cutting edge
    col = _mix(col, K['beak'], R['beak'] * 0.8)
    col = _mix(col, K['beakHi'], R['beak'] * sstep(0.0012, 0.0004, np.abs(y - 0.0512)) * 0.5)
    # ---- shell ----
    d, kind, ui, uf, q = scutes(x, z)
    seam = sstep(0.0015, 0.0005, d)
    shc = np.tile(K['shell'], (n, 1))
    shc = _mix(shc, K['shellHi'], n1 * 0.7)
    # a faint radiating streak pattern in each scute, and lighter growth rings near the seams
    rings = 0.5 + 0.5 * np.cos(2 * np.pi * d / 0.0017)
    shc = _mix(shc, K['shellHi'], rings * sstep(0.008, 0.002, d) * 0.5)
    shc = _mix(shc, K['seam'], seam * 0.7)
    shc = _mix(shc, K['seamDk'], sstep(0.0005, 0.0, d) * 0.6)
    # marginals: dark like the rest, a red bar down the middle of each and a red line along the rim
    marg = (kind == 2)
    bar = sstep(0.13, 0.07, np.abs(uf - 0.5)) * sstep(QM + 0.02, QM + 0.05, q)
    redm = np.maximum(bar * 0.9, sstep(0.975, 0.995, q) * 0.8) * marg
    shc = _mix(shc, K['red'], redm * (1 - seam))
    col = _mix(col, shc, R['cara'])
    # underside: under the marginals red and orange with dark bars; the bridge wall dark; the plastron plain yellow
    rim = rim_y(z)
    under = R['shell'] * (1 - R['cara'])
    pseam = sstep(0.0011, 0.0003, np.minimum(np.abs(x), np.min(np.abs(z[:, None] - np.array([0.088, 0.058, 0.024, -0.036, -0.076], F)[None]), 1)))
    pc = _mix(np.tile(K['plastron'], (n, 1)), K['plastronDk'], sstep(0.55, 0.8, n1) * 0.4 + pseam * 0.7)
    uc = _mix(np.tile(K['orange'], (n, 1)), K['red'], 0.5 + 0.5 * np.cos(2 * np.pi * uf))
    uc = _mix(uc, K['skin'], sstep(0.62, 0.8, 0.5 + 0.5 * np.cos(2 * np.pi * (uf + 0.5))) * 0.85)
    wc = _mix(np.tile(K['shell'], (n, 1)), K['plastronDk'], sstep(0.042, 0.036, y) * 0.6)
    um = sstep(rim - 0.0095, rim - 0.0065, y)
    pl = sstep(0.0385, 0.0355, y)
    ucol = _mix(_mix(wc, uc, um), pc, pl)
    col = _mix(col, ucol, under)
    # claws, eye
    col = _mix(col, _mix(np.tile(K['claw'], (n, 1)), K['clawTip'], sstep(0.004, 0.0005, y) * 0.6), R['claw'])
    col = _mix(col, K['ball'], R['ball'])
    D = Pm - EYE_C
    s_, u_ = D @ EYE_SIDE, D @ EYE_UP - LID_OFF
    ap = np.sqrt((s_ / LID_W) ** 2 + (u_ / LID_H) ** 2)
    col = _mix(col, K['gap'], sstep(1.4, 1.05, ap) * sstep(EYE_R + 0.002, EYE_R + 0.0008, R['eyeD']) * 0.8)
    nd = np.linalg.norm((Pm - NOSTRIL) / V(0.0007, 0.0006, 0.0009), axis=1)
    col = _mix(col, K['gap'], sstep(1.3, 0.8, nd))
    rough = 0.6 + 0.08 * (n2 - 0.5)
    rough = rough - 0.24 * R['cara'] - 0.1 * under - 0.2 * R['claw'] - 0.2 * R['beak'] - 0.3 * R['ball']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    h = np.zeros(len(P), F)
    # carapace: seams as grooves, growth rings (annuli) as fine steps parallel to them, a little roughness
    d, kind, ui, uf, q = scutes(x, z)
    groove = -0.00028 * np.exp(-(d / 0.0007) ** 2) + 0.0002 * sstep(0.0, 0.007, d)
    rings = -0.00004 * (0.5 + 0.5 * np.cos(2 * np.pi * d / 0.0017)) * sstep(0.012, 0.002, d)
    h += (groove + rings + 0.00003 * (fbm(Pm * 300, 2, 71) - 0.5)) * R['cara']
    # plastron seams
    ps = np.minimum(np.abs(x), np.min(np.abs(z[:, None] - np.array([0.088, 0.058, 0.024, -0.036, -0.076], F)[None]), 1))
    h += -0.00018 * np.exp(-(ps / 0.0006) ** 2) * R['shell'] * (1 - R['cara'])
    # skin: small granular scales on the neck, legs and tail; larger plates down the front of the forelegs
    skin = (1 - R['shell']) * (1 - R['claw']) * (1 - R['ball'])
    m = skin > 0.01
    if m.any():
        f1, f2, _ = _cells(Pm[m], 0.0009, 72)
        e = (f2 - f1) / 0.0009
        hh = 0.00009 * sstep(0.0, 0.25, e) * (0.5 + 0.5 * np.sqrt(np.clip(1 - (f1 / 0.0006) ** 2, 0, 1)))
        g1, g2, _ = _cells(Pm[m], 0.0022, 73)
        eg = (g2 - g1) / 0.0022
        big = R['leg'][m] * sstep(0.02, 0.03, y[m]) * sstep(-0.1, 0.4, R['Nm'][m, 2])
        hh = hh * (1 - big) + 0.00016 * sstep(0.0, 0.15, eg) * big
        # head: smooth skin with a few fine wrinkles
        hh = hh * (1 - R['head'][m] * 0.75)
        h[m] += hh * skin[m]
    # loose skin folds around the neck
    nf = -0.00022 * np.exp(-((np.sin(np.pi * (z / 0.0055 + 0.4 * fbm(Pm * 70, 2, 74)))) / 0.35) ** 2) * R['neck'] * sstep(0.1, 0.12, z)
    h += nf
    # beak: fine grain
    h += -0.00003 * vnoise(Pm * V(2000, 300, 300), 75) * R['beak']
    return h


def finish(C, ao, valid):
    lin = np.where(C <= 0.04045, C / 12.92, ((C + 0.055) / 1.055) ** 2.4)
    lin = lin * (0.3 + 0.7 * ao[..., None])
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(np.maximum(lin, 0), 1 / 2.4) - 0.055)


MAP_QUALITY = (70, 70)


def stats(P, N, c, col):
    R = _regions(P, N, c)
    m = R['lid'] * sstep(EYE_R + 0.0024, EYE_R + 0.0012, R['eyeD'])
    lid = (col * m[:, None]).sum(0) / max(m.sum(), 1e-6)
    return {'lidCol': int(round(lid[0] * 255)) << 16 | int(round(lid[1] * 255)) << 8 | int(round(lid[2] * 255))}


def meta(st):
    r = EYE_R
    up, dn = (LID_OFF + LID_H) / r, (LID_OFF - LID_H) / r
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.25],
                'iris': 0x6A5A1E, 'irisR': 0.9, 'pupilR': 0.45, 'lidCol': st['lidCol']},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.05, 0.05, 0.04], 'flat': 0x262C1F,
    }
