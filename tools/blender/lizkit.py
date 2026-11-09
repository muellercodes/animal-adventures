# Lizards on one template (round 11): the bearded dragon, the green iguana, the panther chameleon and the Komodo
# dragon. Laid out like lizard.py (the young lace monitor, which stays as it is): one loft from the tail tip to the
# snout so there is no seam at the hips or the neck, the head's features on top of it, sprawling legs as capsule
# chains, toes with claws, and a skin of scales as a height field per texel (each scale painted as one color).
# Each species is authored in base units (an animal about half a meter long, so the shared blend radii, bake distances
# and scale sizes fit) and scaled by KS on the way out, as the big cats are (bigcat.py):
#   M = lizkit.load('iguana')          this file run in its own module M (its defaults are a plain monitor lizard)
#   M.BODY = [...]; M.EYE_C = ...      the species' tables and landmarks in base units, then M.setup()
#   M.paint = paint ...                replace functions where needed (they look names up in M when called)
#   lizkit.install(globals(), M, KS)   the pipeline hooks, in game meters (points / KS in, lengths * KS out)
# Skin weights are all made here from the sculpt's own parts and the game skeleton's pivots (read from the rig export):
# the trunk, neck, head and tail as one smooth chain along the body, the legs along their bones.
import os, types, json
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, chain, loft, fbm, length, _hash

HERE = os.path.dirname(os.path.abspath(__file__))


def load(ID):
    M = types.ModuleType('liz_' + ID)
    M.__dict__['__file__'] = os.path.join(HERE, 'lizkit.py')
    exec(compile(open(os.path.join(HERE, 'lizkit.py')).read(), 'lizkit.py', 'exec'), M.__dict__)
    M.ID = ID
    return M


# ---------- defaults (a plain monitor lizard, base units) ----------
ID = 'lizkit'
KS = 1.0
BOUNDS = (V(-0.1, -0.001, -0.33), V(0.1, 0.06, 0.18))
PATCHES = []
BAKE_CAGE = (0.0015, 0.005)
AO_DIST = 0.02
EYE_C, EYE_R, EYE_DIR = V(0.0112, 0.045, 0.125), 0.0035, V(0.9, 0.3, 0.3)
LID_W, LID_H, LID_OFF = 0.003, 0.0023, -0.0002
LIDS = (0.0021, 0.0016, 0.0005)          # lid mound beyond the ball (side, up, forward)
NOSTRIL = V(0.0048, 0.0386, 0.162)
NOSTRIL_R = (V(0.0018, 0.0016, 0.0024), V(0.0009, 0.0006, 0.001))
EAR = V(0.0128, 0.0386, 0.101)
EAR_R = V(0.0014, 0.0018, 0.0011)
MOUTH = V(0.0, 0.0335, 0.166)
# the lip line from the snout tip back to the corner of the mouth (x, y, z), the groove's half width there
MOUTH_LINE = [V(0.0, 0.0322, 0.172), V(0.0045, 0.0323, 0.168), V(0.0088, 0.0328, 0.14), V(0.012, 0.0336, 0.113)]
MOUTH_R = [0.0005, 0.0005, 0.00045, 0.0002]
MOUTH_DEPTH = 0.00035
SNOUT = (V(0.0, 0.0355, 0.166), V(0.006, 0.0058, 0.007), 0.003)
HEAD_BLOBS = []                            # (center, radii, blend) added to the head (jaw muscles, brow ...)
MANDIBLE = None                            # (a, b, ra, rb, blend): the lower jaw under the snout
BLOBS = []                                 # (center, radii, blend) added to the body (girdles, throat ...)
HEAD_BOX = (V(-0.03, 0.012, 0.09), V(0.03, 0.06, 0.18))
LEG_BOX = (V(-0.1, -0.002, -0.09), V(0.1, 0.05, 0.1))
FOOT_BOX = (V(-0.11, -0.002, -0.1), V(0.11, 0.014, 0.12))
# legs: each a list of capsule chains (points, radii, blend), the joint balls (center, radii) and the palm / sole
# superellipsoid (center, radii, rb, axis)
FLEG = []
HLEG = []
LEG_K = (0.003, 0.004)
HAND, FOOT = V(0.06, 0.003, 0.08), V(0.07, 0.003, -0.05)
F_TOES = [(-38, 0.0072, 0.0016), (-10, 0.0098, 0.0022), (14, 0.0115, 0.0024), (38, 0.0108, 0.0022), (72, 0.0068, 0.0018)]
H_TOES = [(-20, 0.0075, 0.002), (4, 0.0115, 0.0026), (24, 0.015, 0.0027), (44, 0.0168, 0.0024), (100, 0.0105, 0.004)]
TOE_R = (0.00125, 0.00135)
CLAW = 1.0                                 # claw length factor
HIND5 = V(0.0035, 0.0002, -0.0045)         # the hind fifth toe's base, from the foot point (None: on the fan)
TOE_K = 0.0012
EXTRAS = []                                # (name, field fn, blend, box or None): spikes, crests, dewlaps
BODY = [
    (-0.33, 0.009, 0.008, 0.007, 0.0008, 2.2, 2.2), (-0.2, 0.022, 0.016, 0.01, 0.005, 2.4, 2.2),
    (-0.06, 0.042, 0.028, 0.016, 0.016, 2.3, 2.2), (0.02, 0.048, 0.031, 0.015, 0.022, 2.4, 2.3),
    (0.08, 0.046, 0.033, 0.02, 0.014, 2.2, 2.2), (0.12, 0.05, 0.037, 0.027, 0.013, 2.5, 2.3),
    (0.17, 0.04, 0.034, 0.03, 0.005, 2.3, 2.3),
]
Z_HEAD = 0.095                             # the head starts here (paint, UV island, weights)
Z_TAIL = -0.075                            # the tail starts here
# texture regions along z (each its own UV island set), and how much of the map the head gets
UV_Z = [-0.2]
UV_HEAD = 1.6
# skin
SC = dict(body=0.00125, leg=0.00095, head=0.0017, ring=0.0021, belly=0.0016, lip=0.0024)
RINGS = True                               # the tail in rings of keeled scales
TAIL_KEEL = 0.045
GRAN_H = 0.16                              # bead height (times the scale size)
WEIGHT_SMOOTH = (3, 0.5)
UV_AVERAGE = True
UV_PACK = dict(margin_method='FRACTION', margin=0.008)
DISSOLVE_DEGENERATE = True
TAIL_RINGS = 0
MAP_QUALITY = (68, 60)
PAD_SMOOTH = 4
BEND_PITCH = (0.0075, 0.0035)              # rings across the body and the legs (game mesh)
RIG = None                                 # bone pivots of the game skeleton (base units), from the rig export


def setup():
    global EYE_DIR, EYE_UP, EYE_SIDE, BK
    EYE_DIR = nrm(np.asarray(EYE_DIR, F))
    EYE_UP = nrm(np.array([0, 1, 0], F) - EYE_DIR * EYE_DIR[1])
    EYE_SIDE = np.cross(EYE_UP, EYE_DIR)
    BK = np.asarray(BODY, F)


def rig():
    """the game skeleton's pivots (base units), from tools/blender/work/<id>-rig.json"""
    global RIG
    if RIG is None:
        js = json.load(open(os.path.join(HERE, 'work', f'{ID}-rig.json')))
        RIG = {b['name']: np.array(b['p'], F) / KS for b in js['adult']['bones']}
    return RIG


# ---------- helpers ----------
def box(P, lo, hi):
    return np.all((P >= np.asarray(lo, F)) & (P <= np.asarray(hi, F)), axis=1)


def local(P, lo, hi, fn, far=1.0):
    m = box(P, lo, hi)
    out = np.full(len(P), far, F)
    if m.any():
        out[m] = fn(P[m])
    return out


def local_n(P, lo, hi, fn, n, far=1.0):
    m = box(P, lo, hi)
    out = [np.full(len(P), far, F) for _ in range(n)]
    if m.any():
        for o, r in zip(out, fn(P[m])):
            o[m] = r
    return out


def mirror(P):
    Q = P.copy(); Q[:, 0] = np.abs(Q[:, 0]); return Q


def iz(z, col):
    """the body loft's value at z: 1 top, 2 height of the widest line, 3 bottom, 4 half width"""
    return np.interp(z, BK[:, 0], BK[:, col]).astype(F)


def hexc(h):
    return np.array([((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255], F)


def mix(c, k, t):
    t = np.clip(t, 0, 1)[:, None]
    return c + (k - c) * t


def tile(k, n):
    return np.tile(np.asarray(k, F), (n, 1))


def cones(Q, spikes, k=0.0):
    """union of round cones (base, tip, r0, r1), each evaluated only near its own box"""
    out = np.full(len(Q), 1.0, F)
    for a, b, r0, r1 in spikes:
        a = np.asarray(a, F); b = np.asarray(b, F)
        lo = np.minimum(a, b) - r0 - 0.002; hi = np.maximum(a, b) + r0 + 0.002
        m = box(Q, lo, hi)
        if m.any():
            d = round_cone(Q[m], a, b, r0, r1)
            out[m] = smin(out[m], d, k) if k > 0 else np.minimum(out[m], d)
    return out


def crest(Q, zs, hs, pitch, th, lean=0.6, sink=0.0015, top=None):
    """a crest of blade spines along the middle of the back: spines every pitch along z, heights hs at stations zs
    (np.interp), each a thin triangular blade (th thick at its root) leaning back by lean times its height, rooted
    sink below the loft's top line (or top(z))"""
    z = Q[:, 2]
    out = np.full(len(Q), 1.0, F)
    z0, z1 = float(min(zs)), float(max(zs))
    topz = (lambda zz: iz(zz, 1)) if top is None else top
    hmax = float(max(hs))
    m = (np.abs(Q[:, 0]) < th * 2 + 0.002) & (z > z0 - pitch) & (z < z1 + pitch) & (Q[:, 1] > topz(z) - sink - 0.004) & (Q[:, 1] < topz(z) + hmax + 0.004)
    if not m.any():
        return out
    P = Q[m]
    x, y, zz = np.abs(P[:, 0]), P[:, 1], P[:, 2]
    best = np.full(len(P), 1.0, F)
    for di in (-1, 0, 1):
        zi = (np.round((zz - z0) / pitch) + di) * pitch + z0
        h = np.interp(zi, zs, hs).astype(F)
        yb = topz(zi) - sink
        # blade in its own side view: from the root (zi +- half a pitch) up to the tip, leaning back
        u = (y - yb) / np.maximum(h + sink, 1e-6)              # 0 at the root line, 1 at the tip
        zc = zi - lean * h * np.clip(u, 0, 1)
        half = pitch * 0.48 * (1 - np.clip(u, 0, 1)) + 0.0002
        dz = np.abs(zz - zc) - half
        dy = np.maximum(y - (yb + h + sink), yb - 0.002 - y)
        tk = th * (1 - 0.7 * np.clip(u, 0, 1)) * 0.5 + 0.00015
        dx = x - tk
        d = np.maximum(np.maximum(dz * 0.7, dy), dx)
        d = np.where((zi < z0 - 1e-6) | (zi > z1 + 1e-6) | (h < 1e-5), 1.0, d)
        best = np.minimum(best, d)
    out[m] = best
    return out


def loft_x(y, z):
    """the loft's half width at height y in the section at z (for setting the eyes into the side of the head)"""
    top, yw, bot, w = (float(iz(np.array([z], F), c)[0]) for c in (1, 2, 3, 4))
    e = float(np.interp(z, BK[:, 0], BK[:, 5] if y > yw else BK[:, 6]))
    h = top - yw if y > yw else yw - bot
    return w * max(0.0, 1 - abs((y - yw) / h) ** e) ** (1 / e)


def seat_eye(y, z, out=0.0004):
    """the eye's center for a ball whose surface stands out of the head's side by out"""
    setup()
    return V(loft_x(y, z) - EYE_R * 0.86 + out, y, z)


def surf_pt(z, ang, out=0.0):
    """a point on the body loft's section at z: ang 0 at the widest line on the side, + up toward the top, - down
    (radians, about the section's middle), pushed out by out"""
    z = float(z)
    top, yw, bot, w = (float(iz(np.array([z], F), c)[0]) for c in (1, 2, 3, 4))
    h = top - yw if ang > 0 else yw - bot
    return V(np.cos(ang) * (w + out), yw + np.sin(ang) * (h + out), z)


# ---------- parts ----------
def body(P):
    Q = mirror(P)
    d = loft(Q, BODY)
    for c, r, k in BLOBS:
        d = smin(d, ellipsoid(Q, c, r), k)
    return body_extra(Q, d)


def body_extra(Q, d):
    return d


def eye_parts(P):
    """lid mound around the eye (add), the opening in front of the eye (carve), the eyeball (add)"""
    Q = mirror(P)
    D = Q - EYE_C
    s, u, g = D @ EYE_SIDE, D @ EYE_UP, D @ EYE_DIR
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.0002, -0.0003), V(EYE_R + LIDS[0], EYE_R + LIDS[1], EYE_R + LIDS[2]))
    ua = u - LID_OFF
    ap = np.sqrt((s / LID_W) ** 2 + (ua / LID_H) ** 2) - 1
    ap = ap + 0.15 * sstep(0.5, 1.0, np.abs(s) / LID_W) * (np.abs(ua) / LID_H)
    carve = smax(ap * LID_H, -g - 0.0002, 0.0002)
    ball = length(D) - EYE_R * 0.86
    return carve, lids, ball


def mouth_groove(Q):
    """distance to the lip line (squashed in y so the groove is a flat slit)"""
    y0, ky = float(MOUTH_LINE[0][1]), 2.4
    sq = lambda p: V(p[0], y0 + (p[1] - y0) * ky, p[2])
    Ms = Q.copy(); Ms[:, 1] = y0 + (Q[:, 1] - y0) * ky
    pts = [sq(p) for p in MOUTH_LINE]
    m = None
    for i in range(len(pts) - 1):
        di = round_cone(Ms, pts[i], pts[i + 1], MOUTH_R[i], MOUTH_R[i + 1])
        m = di if m is None else smin(m, di, 0.0003)
    return m / (ky * 0.6)


def head_ops(P, d):
    """the head's features on top of the body field d (inside the head box)"""
    Q = mirror(P)
    c, r, k = SNOUT
    d = smin(d, ellipsoid(Q, c, r), k)
    for c, r, k in HEAD_BLOBS:
        d = smin(d, ellipsoid(Q, c, r), k)
    if MANDIBLE:
        a, b, ra, rb, k = MANDIBLE
        d = smin(d, round_cone(Q, a, b, ra, rb), k)
    d = head_extra(Q, d)
    # nostril: an opening on a small swelling near the tip of the snout
    if NOSTRIL is not None:
        d = smin(d, ellipsoid(Q, NOSTRIL + V(-NOSTRIL_R[0][0] * 0.3, 0, 0), NOSTRIL_R[0]), NOSTRIL_R[0][1])
        d = smax(d, -ellipsoid(Q, NOSTRIL + V(NOSTRIL_R[1][0] * 0.66, 0.0001, 0.0), NOSTRIL_R[1]), 0.0004)
    # ear opening
    if EAR is not None:
        d = smax(d, -ellipsoid(Q, EAR + V(EAR_R[0] * 0.7, 0, 0), EAR_R), 0.0005)
    d = smax(d, -(mouth_groove(Q) + MOUTH_DEPTH), 0.0005)
    ca, li, ba = eye_parts(P)
    d = smin(d, li, 0.0012)
    d = smax(d, -ca, 0.0003)
    d = smin(d, ba, 0.0002)
    return d


def head_extra(Q, d):
    return d


def legs(P):
    Q = mirror(P)
    out = []
    for L in (FLEG, HLEG):
        d = None
        for item in L:
            kind = item[0]
            if kind == 'chain':
                _, pts, rad, k, kj = item
                e = chain(Q, pts, rad, k)
            elif kind == 'ball':
                _, c, r, kj = item
                e = ellipsoid(Q, c, r)
            else:   # 'pad': superellipsoid sole or palm
                _, c, r, rb, ax, kj = item
                e = superellipsoid(Q, c, r, 2.3, rb=rb, ax=ax)
            d = e if d is None else smin(d, e, kj)
        out.append(d if d is not None else np.full(len(P), 1.0, F))
    return out[0], out[1]


def toe(Q, base, a_deg, L, r0, up=0.0):
    """a toe from base along angle a (deg, 0 forward, + outward) of length L, with pads and a hooked claw"""
    a = np.radians(a_deg)
    d2 = V(np.sin(a), 0, np.cos(a))
    p1 = base + d2 * (L * 0.45) + V(0, r0 * 0.48 + up, 0)
    p2 = base + d2 * L + V(0, -r0 * 0.08, 0)
    t = chain(Q, [base, p1, p2], [r0, r0 * 0.78, r0 * 0.62], r0 * 0.48)
    t = smin(t, ellipsoid(Q, base + d2 * (L * 0.62) + V(0, -r0 * 0.16, 0), V(r0 * 0.75, r0 * 0.62, r0 * 0.9)), r0 * 0.32)
    k = r0 / 0.00125 * CLAW
    c0 = p2 + d2 * 0.0003 * k + V(0, 0.0003 * k, 0)
    c1 = p2 + d2 * 0.0017 * k + V(0, 0.0002 * k, 0)
    c2 = p2 + d2 * 0.0029 * k + V(0, -0.0010 * k, 0)
    c2[1] = max(c2[1], 0.0002)
    cl = chain(Q, [c0, c1, c2], [r0 * 0.62, r0 * 0.44, 0.00022 * r0 / 0.00125], 0.0)
    return t, cl


def toes(P, which=(0, 1)):
    Q = mirror(P)
    out_t, out_c = None, None
    feet = ((HAND, F_TOES, TOE_R[0], False), (FOOT, H_TOES, TOE_R[1], True))
    for base, TOES, r0, hind in [feet[i] for i in which]:
        for k, (a, L, off) in enumerate(TOES):
            ar = np.radians(a)
            b = base + V(np.sin(ar), 0, np.cos(ar)) * off + V(0, 0.0001, 0)
            if hind and k == 4 and HIND5 is not None:
                b = FOOT + HIND5
            t, c = toe(Q, b, a, L, r0)
            out_t = t if out_t is None else smin(out_t, t, r0 * 0.56)
            out_c = c if out_c is None else np.minimum(out_c, c)
    return out_t, out_c


def extras(P):
    out = {}
    for name, fn, k, bx in EXTRAS:
        out[name] = local(P, *bx, fn) if bx is not None else fn(P)
    return out


def parts(P):
    ca, li, ba = eye_parts(P)
    fr, hi = local_n(P, *LEG_BOX, legs, 2)
    to, cl = local_n(P, *FOOT_BOX, toes, 2)
    out = {'body': body(P), 'lids': li, 'ball': ba, 'fleg': fr, 'hleg': hi, 'toe': to, 'claw': cl}
    out.update(extras(P))
    return out


def shape(P):
    d = body(P)
    fr, hi = local_n(P, *LEG_BOX, legs, 2)
    d = smin(d, fr, LEG_K[0])
    d = smin(d, hi, LEG_K[1])
    for name, fn, k, bx in EXTRAS:
        e = local(P, *bx, fn) if bx is not None else fn(P)
        d = smin(d, e, k)
    m = box(P, *HEAD_BOX)
    if m.any():
        d[m] = head_ops(P[m], d[m])
    to, cl = local_n(P, *FOOT_BOX, toes, 2)
    d = smin(d, to, TOE_K)
    d = smin(d, cl, 0.0003)
    return d


# ---------- the game mesh ----------
def keep(P):
    """decimation protection (0..1): a floor over the whole body so the long smooth tail and trunk keep enough
    triangles to bend, more on the eyes, nostrils, mouth, feet and claws"""
    Pm = mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    base = np.full(len(P), KEEP_FLOOR, F)
    e = sstep(EYE_R * 2.2, EYE_R * 1.4, np.linalg.norm(Pm - EYE_C, axis=1)) * 0.4
    n = sstep(0.003, 0.0015, np.linalg.norm(Pm - NOSTRIL, axis=1)) * 0.2 if NOSTRIL is not None else 0 * x
    feet = sstep(0.0085, 0.004, y) * sstep(0.02, 0.03, x) * FEET_KEEP
    _, cl = local_n(P, *FOOT_BOX, toes, 2)
    claw = sstep(0.0004, 0.0001, cl) * 0.45
    ex = keep_extra(P)
    return np.maximum.reduce([base, e, n, feet, claw, ex]).astype(F)


KEEP_FLOOR = 0.28
FEET_KEEP = 0.2


def keep_extra(P):
    return np.zeros(len(P), F)


def spine_line():
    """the middle line through the skeleton's pivots, tail tip to snout (base units)"""
    R = rig()
    tails = sorted([n for n in R if n.startswith('tail') and n[4:].isdigit()], key=lambda n: int(n[4:]))
    pts = [V(0, float(iz(np.array([BK[0, 0]], F), 2)[0]), BK[0, 0] + 0.004)]
    pts += [R[n] for n in reversed(tails)] + [R['hips'], R['chest']]
    pts += [R[n] for n in ('neck', 'head') if n in R]
    pts += [V(0, float(MOUTH[1]), float(MOUTH[2]))]
    return pts


def bend_segments():
    R = rig()
    segs = []
    sp = spine_line()
    for a, b in zip(sp[:-2], sp[1:-1]):
        segs.append((a, b, BEND_PITCH[0], BODY_REACH, True))
    for s in ('L',):
        for chainb in (('arm', 'fore', 'fmeta', 'fpaw'), ('thigh', 'shin', 'hmeta', 'hpaw')):
            for a, b in zip(chainb[:-1], chainb[1:]):
                segs.append((R[a + s], R[b + s], BEND_PITCH[1], LEG_REACH, False))
    return segs


BODY_REACH = 0.06
LEG_REACH = 0.012


def onleg(c):
    """is a point (a face center) on a leg rather than the body"""
    w = float(np.interp(c.z, BK[:, 0], BK[:, 4]))
    return c.x > w + 0.004 and Z_TAIL - 0.02 < c.z < Z_HEAD


def lowpoly_fix(bm, hi):
    """rings across the body, the tail and the legs so they bend (see meshfix.py)"""
    import meshfix as MF
    tr = MF.tree(hi)
    for a, b, pitch, reach, mid in bend_segments():
        if mid:
            ok = lambda c, p0, r, reach=reach: r < reach and not onleg(c)
        else:
            ok = lambda c, p0, r, reach=reach: r < reach and onleg(c)
        MF.rings(bm, tr, a, b, pitch, ok)
    MF.finish(bm)


def uv_regions(P):
    """head, the neck and trunk, the tail in parts, the front and hind legs and feet"""
    Pm = mirror(P)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    lab = np.full(len(P), 1)
    w = iz(z, 4)
    leg = (x > w + 0.004) & (z < Z_HEAD) & (z > Z_TAIL - 0.02)
    lab[z > Z_HEAD] = 0
    lab[z < Z_TAIL] = 9
    for i, zc in enumerate(UV_Z):
        lab[z < zc] = 10 + i
    zm = 0.5 * (Z_HEAD + Z_TAIL)
    lab[leg & (z > zm)] = 4
    lab[leg & (z <= zm)] = 5
    lab[leg & (y < 0.008) & (z > zm)] = 6
    lab[leg & (y < 0.008) & (z <= zm)] = 7
    return uv_regions_extra(Pm, lab)


def uv_regions_extra(Pm, lab):
    return lab


def uv_weight(P):
    z = P[:, 2]
    return (0.95 + (UV_HEAD - 0.95) * sstep(Z_HEAD - 0.005, Z_HEAD + 0.01, z) - 0.2 * sstep(Z_TAIL - 0.08, BK[0, 0], z)).astype(F)


# ---------- skinning ----------
def _seg_param(P, pts):
    """nearest point on a polyline: (segment index + t, distance)"""
    best = np.full(len(P), np.inf, F)
    u = np.zeros(len(P), F)
    for i in range(len(pts) - 1):
        a, b = np.asarray(pts[i], F), np.asarray(pts[i + 1], F)
        ab = b - a
        t = np.clip(((P - a) @ ab) / max(float(ab @ ab), 1e-12), 0, 1)
        dd = np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
        m = dd < best
        best = np.where(m, dd, best)
        u = np.where(m, i + t, u)
    return u, best


def leg_chain(s, front):
    R = rig()
    sg = 1 if s == 'L' else -1
    names = ['arm', 'fore', 'fmeta', 'fpaw'] if front else ['thigh', 'shin', 'hmeta', 'hpaw']
    pts = [R[n + s] for n in names]
    # past the paw pivot: out along the middle toe
    ar = np.radians((F_TOES if front else H_TOES)[2][0])
    tip = (HAND if front else FOOT) + V(np.sin(ar), 0, np.cos(ar)) * 0.02
    pts.append(tip * V(sg, 1, 1))
    return [n + s for n in names], pts


def chain_weights(P, pts, bones, blend):
    """weights along a polyline pts[0] .. pts[n]: bone j owns the stretch from pts[j] to pts[j + 1], blended over
    +-blend (arc length) at each inner point"""
    best = np.full(len(P), np.inf, F)
    s = np.zeros(len(P), F)
    S = [0.0]
    for i in range(len(pts) - 1):
        a, b = np.asarray(pts[i], F), np.asarray(pts[i + 1], F)
        ab = b - a
        L = float(np.linalg.norm(ab))
        t = np.clip(((P - a) @ ab) / max(L * L, 1e-12), 0, 1)
        dd = np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
        m = dd < best
        best = np.where(m, dd, best)
        s = np.where(m, S[-1] + t * L, s)
        S.append(S[-1] + L)
    out = []
    nb = len(bones)
    for j, nm in enumerate(bones):
        lo = sstep(S[j] - blend, S[j] + blend, s) if j > 0 else np.ones_like(s)
        hi = sstep(S[j + 1] + blend, S[j + 1] - blend, s) if j < nb - 1 else np.ones_like(s)
        out.append((nm, lo * hi))
    return out, s, S


def spine_chain():
    """bones along the middle line from the tail tip forward and the points between them (the hips own the trunk
    from the base of the tail to the chest)"""
    R = rig()
    tails = sorted([n for n in R if n.startswith('tail') and n[4:].isdigit()], key=lambda n: int(n[4:]))
    bones = list(reversed(tails)) + ['hips', 'chest'] + [n for n in ('neck', 'head') if n in R]
    pts = [TAIL_TIP] + [R[n] for n in reversed(tails)] + [R[n] for n in ('chest', 'neck', 'head') if n in R]
    pts.append(V(0, float(MOUTH[1]), float(MOUTH[2]) + 0.01))
    return bones, pts


TAIL_TIP = V(0, 0.01, -0.34)


def spine_weights(Pw, names, bi):
    """the trunk, neck, head and tail as one chain along the middle line"""
    bones, pts = spine_chain()
    Wb = np.zeros((len(Pw), len(names)), F)
    for nm, w in chain_weights(Pw * V(0, 1, 1), pts, bones, SPINE_BLEND)[0]:
        Wb[:, bi[nm]] = w
    return Wb


SPINE_BLEND = 0.008
BODY_EXTRAS = ()                           # extras that are part of the body for the weights (spikes on the flanks)
LEG_BLEND = 0.0025


def fix_weights(W, wpos, names, G, weld):
    """every weight from the sculpt's parts: the body chain along the middle line, each leg along its own bones
    (blended over a few mm at each joint and into the girdle at the top), the head from the ear forward all head"""
    bi = {n: i for i, n in enumerate(names)}
    P = wpos.astype(F)
    Wn = spine_weights(P, names, bi)
    bd = body(P)
    for name, fn, kk, bx in EXTRAS:
        if name in BODY_EXTRAS:
            bd = smin(bd, local(P, *bx, fn) if bx is not None else fn(P), kk)
    fr, hi = legs(P)
    lds = []
    for front, ld in ((True, fr), (False, hi)):
        to, cl = toes(P, (0,) if front else (1,))
        lds.append(smin(ld, np.minimum(to, cl), TOE_K))
    for front, leg_d, other in ((True, lds[0], lds[1]), (False, lds[1], lds[0])):
        for s in 'LR':
            sg = 1 if s == 'L' else -1
            nm, pts = leg_chain(s, front)
            Wl = np.zeros_like(Wn)
            ws, sarc, S = chain_weights(P, pts, nm, LEG_BLEND)
            for n, w in ws:
                Wl[:, bi[n]] += w
            # the top of the leg blends into the girdle it hangs from
            g = bi['chest' if front else 'hips']
            top = sstep(0.35 * S[1], 0.0, sarc)
            Wl = Wl * (1 - top[:, None]); Wl[:, g] += top
            mine = (P[:, 0] * sg > 0.002)
            # which side of the body/leg blend a vertex is on
            k = sstep(-0.0015, 0.0015, bd - leg_d) * mine * sstep(-0.0015, 0.0015, other - leg_d)
            Wn = Wn * (1 - k[:, None]) + Wl * k[:, None]
    Wn = fix_extra(Wn, P, names, bi)
    Wn[:, bi['ctag']] = 0
    return Wn / np.maximum(Wn.sum(1, keepdims=True), 1e-9)


def fix_extra(W, P, names, bi):
    return W


def bone_tips(P):
    return {k: v + V(0, 0, 0.01) for k, v in P.items()}


# ---------- scales ----------
_cache = {}


def cells(P, size, seed):
    """3D cellular noise: F1, F2 (base units) and the nearest cell's feature point"""
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


def rows(u, v, pu, pv, stagger=0.5):
    """rectangular scales in rows: row index along u (pitch pu), cell along v (pitch pv), alternate rows shifted"""
    r = np.floor(u / pu)
    vv = v / pv + stagger * (r % 2)
    c = np.floor(vv)
    return u / pu - r, vv - c, (r + 0.5) * pu, (c + 0.5 - stagger * (r % 2)) * pv


def regions(P, N, c):
    Pm = mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    r = {'Pm': Pm, 'Nm': Nm}
    r['claw'] = sstep(0.00025, 0.00005, c['claw'])
    r['eyeD'] = np.linalg.norm(Pm - EYE_C, axis=1)
    r['ball'] = sstep(0.0003, 0.0001, c['ball']) * sstep(EYE_R + 0.0008, EYE_R + 0.0002, r['eyeD'])
    r['lid'] = sstep(EYE_R + LIDS[0] + 0.0004, EYE_R + 0.0008, r['eyeD']) * (1 - r['ball'])
    near = lambda k, w=0.0006: sstep(w, 0.0, c[k])
    r['toe'] = near('toe', 0.0004) * sstep(0.0045, 0.0025, y)
    r['leg'] = np.maximum(near('fleg', 0.0008), near('hleg', 0.0008)) * sstep(0.0015, 0.004, c['body'])
    r['leg'] = np.maximum(r['leg'], r['toe'])
    r['tail'] = sstep(Z_TAIL + 0.007, Z_TAIL - 0.005, z) * (1 - r['leg'])
    r['head'] = sstep(Z_HEAD - 0.012, Z_HEAD - 0.005, z)
    yw = iz(z, 2)
    r['belly'] = sstep(-0.45, -0.8, Nm[:, 1]) * sstep(yw - 0.002, yw - 0.006, y) * (1 - r['leg'])
    r['belly'] = np.maximum(r['belly'], sstep(-0.35, -0.75, Nm[:, 1]) * sstep(0.014, 0.008, x) * (1 - r['leg']))
    r['top'] = sstep(0.2, 0.75, Nm[:, 1]) * (1 - r['leg'])
    # the lip scales along the mouth line
    u, dl = _seg_param(Pm, MOUTH_LINE)
    yl = np.interp(u, np.arange(len(MOUTH_LINE)), [p[1] for p in MOUTH_LINE]).astype(F)
    r['lipD'] = y - yl
    r['lip'] = sstep(0.0026, 0.0012, np.abs(r['lipD'])) * sstep(0.004, 0.0015, dl) * sstep(len(MOUTH_LINE) - 1.05, len(MOUTH_LINE) - 1.35, u)
    return regions_extra(r, P, N, c)


def regions_extra(r, P, N, c):
    return r


def scales(P, N, c):
    """per texel: height (base units), distance to the scale edge (0 at the groove, about 0.5 in the middle), the
    scale's center (each scale painted as one) and the region masks"""
    key = (len(P), float(P[:7].sum()))
    if key in _cache:
        return _cache[key]
    R = regions(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    H = np.zeros(n, F); E = np.full(n, 0.5, F); C = Pm.copy()
    # granular scales: little domed beads (smaller on the legs, larger and flatter on the head)
    for nm, m, seed in (('body', (R['head'] < 0.5) & (R['leg'] < 0.5), 71), ('leg', R['leg'] >= 0.5, 71), ('head', (R['head'] >= 0.5) & (R['leg'] < 0.5), 72)):
        sz = SC[nm]
        if not m.any():
            continue
        f1, f2, cp = cells(Pm[m], sz, seed)
        e = (f2 - f1) / sz
        dome = np.sqrt(np.clip(1 - (f1 / (0.62 * sz)) ** 2, 0, 1))
        flat = 0.55 if nm == 'head' else 0.0
        H[m] = sz * GRAN_H * (sstep(0.0, 0.22, e) * (flat + (1 - flat) * (0.35 + 0.65 * dome)))
        E[m] = e; C[m] = cp
    # the tail: rings of rectangular keeled scales
    tm = R['tail'] > 0.01
    if RINGS and tm.any():
        zt, yt, xt = z[tm], y[tm], x[tm]
        yc = iz(zt, 2)
        th = np.arctan2(xt, yt - yc)
        pr = SC['ring']
        s_al = -zt
        ring = np.floor(s_al / pr)
        zc = -(ring + 0.5) * pr
        rc = np.maximum(0.5 * (iz(zc, 4) + 0.5 * (iz(zc, 1) - iz(zc, 3))), 0.0008)
        nn = np.maximum(3, np.round(np.pi * rc * 1.15 / pr))
        vv = th / np.pi * nn + 0.5 * (ring % 2)
        cc = np.floor(vv)
        a = s_al / pr - ring; b = vv - cc
        hh = 0.15 * pr * (0.35 + 0.65 * a ** 0.8) * sstep(0.0, 0.07, a) * sstep(1.0, 0.9, a) * sstep(0.0, 0.08, b) * sstep(1.0, 0.92, b)
        hh += TAIL_KEEL * pr * np.exp(-((b - 0.5) / 0.1) ** 2) * sstep(0.1, 0.6, a) * sstep(0.35, 0.8, np.cos(th) * 0.5 + 0.5)
        e = np.minimum(np.minimum(a, 1 - a) * pr, np.minimum(b, 1 - b) * np.pi * rc / nn) / pr
        thc = (cc + 0.5 - 0.5 * (ring % 2)) / nn * np.pi
        ycc = iz(zc, 2)
        cp = np.stack([np.sin(thc) * rc, ycc + np.cos(thc) * rc, zc], 1).astype(F)
        k = R['tail'][tm]
        H[tm] = H[tm] * (1 - k) + hh * k; E[tm] = E[tm] * (1 - k) + e * k
        C[tm] = np.where(k[:, None] > 0.5, cp, C[tm])
    # belly: transverse rows of flat rectangular plates
    bm = R['belly'] > 0.01
    if bm.any():
        sb = SC['belly']
        a, b, uc, vc = rows(-z[bm], x[bm], sb, sb * 0.92)
        hh = 0.1 * sb * (0.45 + 0.55 * a) * sstep(0.0, 0.1, a) * sstep(1.0, 0.88, a) * sstep(0.0, 0.1, b) * sstep(1.0, 0.9, b)
        e = np.minimum(np.minimum(a, 1 - a) * 1.1, np.minimum(b, 1 - b)) * 0.9
        k = R['belly'][bm]
        H[bm] = H[bm] * (1 - k) + hh * k; E[bm] = E[bm] * (1 - k) + e * k
        cp = np.stack([np.abs(vc), y[bm], -uc], 1).astype(F)
        C[bm] = np.where(k[:, None] > 0.5, cp, C[bm])
    # lips: one row of tall plates above and below the mouth line
    lm = R['lip'] > 0.01
    if lm.any():
        sl = SC['lip']
        a, b, uc, vc = rows(-z[lm], np.sign(R['lipD'][lm]) + 2, sl, 1.0, 0.0)
        hh = 0.09 * sl * sstep(0.0, 0.1, a) * sstep(1.0, 0.86, a) * sstep(0.0, 0.0005, np.abs(R['lipD'][lm]))
        e = np.minimum(a, 1 - a) * 1.2
        k = R['lip'][lm]
        H[lm] = H[lm] * (1 - k) + hh * k; E[lm] = E[lm] * (1 - k) + e * k
        cp = np.stack([x[lm], y[lm], -uc], 1).astype(F)
        C[lm] = np.where(k[:, None] > 0.5, cp, C[lm])
    H, E, C = scales_extra(H, E, C, R, P, N, c)
    bare = np.maximum(R['claw'], R['ball'])
    H *= 1 - bare
    out = (H, E, C, R)
    _cache.clear()
    _cache[key] = out
    return out


def scales_extra(H, E, C, R, P, N, c):
    return H, E, C


def jit(C, seed=91):
    return _hash(np.round(C[:, 0] * 40000).astype(np.int64), np.round(C[:, 1] * 40000).astype(np.int64), np.round(C[:, 2] * 40000).astype(np.int64), seed)


# ---------- paint (sRGB 0..1), detail (base units) ----------
def paint(P, N, c):
    H, E, C, R = scales(P, N, c)
    n = len(P)
    col = mix(tile(hexc(0x6A6040), n), hexc(0xC8B888), R['belly'])
    col = col * (0.55 + 0.45 * sstep(0.0, 0.2, E))[:, None]
    col = mix(col, hexc(0x2B2622), R['claw'])
    col = mix(col, hexc(0x141010), R['ball'])
    rough = 0.55 + 0.12 * (1 - sstep(0.0, 0.2, E))
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def openings(col, R):
    """the dark eye slit, nostril and ear openings, claws and the eyeball"""
    Pm = R['Pm']
    D = Pm - EYE_C
    s_, u_ = D @ EYE_SIDE, D @ EYE_UP - LID_OFF
    ap = np.sqrt((s_ / LID_W) ** 2 + (u_ / LID_H) ** 2)
    gap = hexc(0x0C0C0D)
    col = mix(col, gap, sstep(1.45, 1.05, ap) * sstep(EYE_R + 0.0016, EYE_R + 0.0006, R['eyeD']) * 0.8)
    if NOSTRIL is not None:
        nd = np.linalg.norm((Pm - NOSTRIL - V(NOSTRIL_R[1][0] * 0.66, 0.0001, 0)) / NOSTRIL_R[1], axis=1)
        col = mix(col, gap, sstep(1.25, 0.8, nd))
    if EAR is not None:
        ed = np.linalg.norm((Pm - EAR - V(EAR_R[0] * 0.7, 0, 0)) / EAR_R, axis=1)
        col = mix(col, gap, sstep(1.3, 0.85, ed) * 0.85)
    return col


def detail(P, N, c):
    H, E, C, R = scales(P, N, c)
    return H.astype(F)


def finish(C, ao, valid):
    lin = np.where(C <= 0.04045, C / 12.92, ((C + 0.055) / 1.055) ** 2.4)
    lin = lin * (AO_FLOOR + (1 - AO_FLOOR) * ao[..., None])
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(np.maximum(lin, 0), 1 / 2.4) - 0.055)


AO_FLOOR = 0.4


def stats(P, N, c, col):
    R = regions(P, N, c)
    m = R['lid'] * sstep(EYE_R + 0.0018, EYE_R + 0.0009, R['eyeD'])
    lid = (col * m[:, None]).sum(0) / max(m.sum(), 1e-6)
    return {'lidCol': int(round(lid[0] * 255)) << 16 | int(round(lid[1] * 255)) << 8 | int(round(lid[2] * 255))}


EYE_META = dict(iris=0x9A6A22, irisR=0.9, pupilR=0.42)
TINT = dict(tint=[1.0, 1.0, 1.0], babyTint=[1.0, 1.0, 1.0], rim=[0.05, 0.05, 0.05], flat=0x6A6040)
COLLAR = None


def meta(st):
    r = EYE_R
    up, dn = (LID_OFF + LID_H) / r, (LID_OFF - LID_H) / r
    e = {'p': [round(float(v), 5) for v in EYE_C], 'r': round(r, 5), 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [round(up, 3), round(dn, 3), 0.25], 'lidCol': st['lidCol']}
    e.update(EYE_META)
    out = {'eye': e, 'mouth': [round(float(v), 4) for v in MOUTH]}
    out.update(TINT)
    if COLLAR:
        out['collar'] = dict(COLLAR)
    return out


# ---------- the pipeline hooks in game meters ----------
def install(g, M, KS):
    M.KS = KS
    M.setup()
    sc = lambda c: {k: v / KS for k, v in c.items()}
    g['M'], g['KS'] = M, KS
    g['ID'] = M.ID
    g['BOUNDS'] = (M.BOUNDS[0] * KS, M.BOUNDS[1] * KS)
    g['PATCHES'] = [(a * KS, b * KS, h * KS) for a, b, h in M.PATCHES]
    g['BAKE_CAGE'] = tuple(v * KS for v in M.BAKE_CAGE)
    g['AO_DIST'] = M.AO_DIST * KS
    for k in ('UV_AVERAGE', 'UV_PACK', 'WEIGHT_SMOOTH', 'MAP_QUALITY', 'PAD_SMOOTH', 'BABY_MAP', 'DISSOLVE_DEGENERATE', 'TAIL_RINGS'):
        if hasattr(M, k):
            g[k] = getattr(M, k)
    if hasattr(M, 'PREVIEW'):
        g['PREVIEW'] = {k: (tuple(np.array(p) * KS), tuple(np.array(t) * KS), f) for k, (p, t, f) in M.PREVIEW.items()}
    g['shape'] = lambda P: M.shape(P / KS) * KS
    g['parts'] = lambda P: {k: v * KS for k, v in M.parts(P / KS).items()}
    if hasattr(M, 'grid'):
        def grid(h):
            xs, ys, zs = M.grid(h / KS)
            return xs * KS, ys * KS, zs * KS
        g['grid'] = grid
    g['keep'] = lambda P: M.keep(P / KS)
    g['uv_regions'] = lambda P: M.uv_regions(P / KS)
    g['uv_weight'] = lambda P: M.uv_weight(P / KS)
    g['bone_tips'] = lambda P: {k: v * KS for k, v in M.bone_tips({k: v / KS for k, v in P.items()}).items()}
    g['fix_weights'] = lambda W, wpos, names, G, weld: M.fix_weights(W, (wpos / KS).astype(F), names, G, weld)

    def lowpoly_fix(bm, hi):
        import meshfix as MX
        rings0, finish0 = MX.rings, MX.finish
        MX.rings = lambda bm_, tr, a, b, pitch, ok: rings0(bm_, tr, np.asarray(a, F) * KS, np.asarray(b, F) * KS, pitch * KS,
                                                            lambda c, p0, r: ok(c / KS, p0 / KS, r / KS))
        MX.finish = lambda bm_, area=2e-7: finish0(bm_, area * KS * KS)
        try:
            M.lowpoly_fix(bm, hi)
        finally:
            MX.rings, MX.finish = rings0, finish0
    g['lowpoly_fix'] = lowpoly_fix
    g['paint'] = lambda P, N, c: M.paint(P / KS, N, sc(c))
    if hasattr(M, 'paint_baby'):
        g['paint_baby'] = lambda P, N, c: M.paint_baby(P / KS, N, sc(c))
    g['detail'] = lambda P, N, c: M.detail(P / KS, N, sc(c)) * KS
    g['finish'] = M.finish
    g['stats'] = lambda P, N, c, col: M.stats(P / KS, N, sc(c), col)

    def meta(st):
        m = M.meta(st)
        e = m['eye']
        e['p'] = [round(v * KS, 5) for v in e['p']]
        e['r'] = round(e['r'] * KS, 5)
        m['mouth'] = [round(v * KS, 4) for v in m['mouth']]
        for k in ('belly',):
            if k in m:
                m[k] = [round(v * KS, 4) for v in m[k]]
        if 'maxR' in m.get('collar', {}):
            m['collar']['maxR'] = m['collar']['maxR'] * KS
        return m
    g['meta'] = meta
    if hasattr(M, 'baby_offset'):
        g['baby_offset'] = lambda P, N, c: (M.baby_offset(P / KS, N, sc(c)) * KS).astype(F)
