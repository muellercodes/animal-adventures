# The unicorn (round 11), sculpted with horse.py as the template (run in this module, then the parts that differ are
# replaced): a white horse with light dapples, a pale gray muzzle and dark eyes; a long spiral horn on the forehead
# (pearly ivory, a hint of gold in its grooves); a long flowing mane, forelock and tail (hair cards) with a soft pastel
# sheen at the tips; feathered hooves (long hair falling over them from the fetlocks); and big white swan's wings
# growing from behind the withers: the birds' wing bones and feather blades in the game (stdWing in SPEC.unicorn),
# here the feathered wing arm (bird.wing_arm, sculpted spread in the rest pose) and the feather atlas.
# The foal: the game scales the horn bone away (the stub stays as a nub) and makes the wings small; its own coat map is
# creamier and plain, its mane short and upright.
import os, sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, fbm, vnoise, worley

exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'horse.py')).read(), 'horse.py', 'exec'))
import bird as B

ID = 'unicorn'
BOUNDS = (V(-1.76, 0.0, -1.2), V(1.76, 2.36, 1.6))

# ---------- the horn (the game's horn bone sits on top of its stub: SPEC.unicorn, UNI_HORN) ----------
HB = V(0.0, 1.881, 1.17)
HD = nrm([0.0, 0.82, 0.57])
HLEN, HSTUB = 0.5, 0.045
HE1 = V(1.0, 0.0, 0.0)
HE2 = np.cross(HD, HE1)
HTURN = 4.5          # turns of the spiral over the horn's length


def horn_coords(Q):
    D = Q - HB
    a = D @ HD
    rv = D - np.outer(a, HD)
    rho = np.linalg.norm(rv, axis=1)
    th = np.arctan2(rv @ HE2, rv @ HE1)
    return a, rho, th


def horn_r(a):
    t = np.clip(a / HLEN, 0, 1)
    return (0.041 * (1 - t) ** 0.85 + 0.0055 * t).astype(F)


def horn_groove(a, th):
    """0 on the ridge of the spiral, 1 in its groove (two grooves wound round the horn, like twisted strands)"""
    t = np.clip(a / HLEN, 0, 1)
    ph = 2 * th - 2 * np.pi * HTURN * t * 2
    return (0.5 - 0.5 * np.cos(ph)).astype(F)


def horn(P):
    Q = mirror_x(P)
    a, rho, th = horn_coords(Q)
    t = np.clip(a / HLEN, 0, 1)
    r = horn_r(a) * (1 - 0.1 * horn_groove(a, th) * sstep(0.04, 0.12, t) * (1 - 0.6 * t))
    d = (rho - r) * 0.85
    d = np.maximum(d, -a - 0.03)
    tipd = np.sqrt(rho ** 2 + (a - HLEN) ** 2) - 0.0055
    return np.where(a > HLEN, tipd, d).astype(F)


def mirror_x(P):
    Q = P.copy(); Q[:, 0] = np.abs(Q[:, 0]); return Q


HBOX = ((-0.06, 1.84, 1.12), (0.06, 2.34, 1.49))

# ---------- the wing (the game's bones: SPEC.unicorn, stdWing s = 6, prim 0.9) ----------
WSH = V(0.1, 1.6, 0.3)
ARM = (0.48, 0.6, 0.45)
WPTS = [WSH, WSH + V(ARM[0], 0, 0), WSH + V(ARM[0] + ARM[1], 0, 0), WSH + V(sum(ARM), 0, 0)]
WCHORD = [0.24, 0.18, 0.13, 0.05]
WTHICK = [0.095, 0.062, 0.042, 0.022]
WBOX = ((-1.75, 1.49, 0.15), (1.75, 1.71, 0.5))
ROOT = (0.13, 0.24)          # x over which the arm's skin blends from the chest onto the wing bones, coat to feathers


def warm(P):
    return B.wing_arm(mirror_x(P), WPTS, WCHORD, WTHICK, lead=0.6)


def arm_mask(P):
    Q = mirror_x(P)
    return (sstep(ROOT[0], ROOT[1], Q[:, 0]) * sstep(1.5, 1.53, Q[:, 1]) * sstep(0.16, 0.19, Q[:, 2]) * sstep(0.49, 0.46, Q[:, 2])).astype(F)


# ---------- feathered hooves: a bell of long hair falling from the fetlock over the hoof (cards finish it) ----------
FEATH = [(V(XF, 0.27, 0.278), V(XF, 0.075, 0.305), 0.046, 0.074), (V(XH, 0.28, -0.752), V(XH, 0.075, -0.708), 0.045, 0.072)]
FBOX = ((-0.32, 0.03, -0.86), (0.32, 0.33, 0.43))


def feath(P):
    Q = mirror_x(P)
    d = None
    for a, b, ra, rb in FEATH:
        # a cone flaring down from the fetlock, its foot set back (the hair grows from the back of the fetlock)
        di = round_cone(Q, a, b, ra, rb)
        d = di if d is None else np.minimum(d, di)
    locks = vnoise(Q * V(55, 7, 55), 41) - 0.5
    d = d + 0.007 * locks * sstep(0.27, 0.15, Q[:, 1])
    # the bottom edge: ragged ends just above the ground
    d = smax(d, 0.06 + 0.012 * (vnoise(Q * V(60, 1, 60), 42) - 0.5) - Q[:, 1], 0.01)
    return d.astype(F)


_horse_parts, _horse_shape, _horse_keep, _horse_fix_weights = parts, shape, keep, fix_weights
_horse_uv_regions, _horse_uv_weight, _horse_regions, _horse_flow, _horse_fur, _horse_meta = uv_regions, uv_weight, _regions, flow, fur, meta


def parts(P):
    c = _horse_parts(P)
    c['horn'] = _local(P, *HBOX, horn)
    c['warm'] = _local(P, *WBOX, warm)
    c['feath'] = _local(P, *FBOX, feath)
    return c


def shape(P):
    d = _local(P, (-0.46, -0.02, -1.2), (0.46, 2.26, 1.6), _horse_shape)
    d = smin(d, _local(P, *HBOX, horn), 0.02)
    d = smin(d, _local(P, *WBOX, warm), 0.04)
    d = smin(d, _local(P, *FBOX, feath), 0.02)
    return d


def grid(h):
    """fine over the horse, coarse out along the wing (it changes slowly along its span), finer across the wing's
    thickness, the horn and the hooves"""
    from sdf import axis_steps
    lo, hi = BOUNDS
    xs = axis_steps(0.0, hi[0], [(0.0, 0.05, h * 0.6), (0.47, hi[0], h * 2.6)], h)
    ys = axis_steps(lo[1], hi[1], [(1.54, 1.66, h * 0.7), (2.08, 2.36, h * 0.6)], h)
    zs = axis_steps(lo[2], hi[2], [(1.28, 1.49, h * 0.6)], h)
    return xs, ys, zs


PATCHES = PATCHES + [(V(0.0, 1.85, 1.13), V(0.055, 2.33, 1.48), 0.0013)]

PREVIEW = dict(PREVIEW)
PREVIEW.update({
    'side': ((7.5, 1.3, 0.1), (0, 1.15, 0.1), 32),
    'front3q': ((4.8, 2.6, 5.0), (0, 1.2, 0.1), 34),
    'top': ((0.01, 8.0, 0.0), (0, 1.2, 0.0), 34),
    'horn': ((0.9, 2.1, 2.1), (0.0, 1.95, 1.25), 26),
    'feet': ((1.3, 0.4, 1.5), (0.18, 0.2, 0.1), 32),
})

TAIL_RINGS = 12


def keep(P):
    k = _horse_keep(P)
    Q = mirror_x(P)
    a, rho, th = horn_coords(Q)
    hk = sstep(-0.02, 0.01, a) * sstep(0.08, 0.05, rho) * sstep(HLEN + 0.03, HLEN, a) * 0.85
    return np.maximum.reduce([k, hk, 0.45 * arm_mask(P)]).astype(F)


def lowpoly_fix(bm, hi):
    """rings across the wing arm at the shoulder, elbow and wrist, so it folds cleanly"""
    import meshfix as MX
    tr = MX.tree(hi)
    for j in range(3):
        a = WPTS[j] + V(-0.08 if j else 0.02, 0, 0)
        MX.rings(bm, tr, a, a + V(0.16, 0, 0), 0.04, lambda c, p0, r: c.x > 0.12 and c.y > 1.5 and r < 0.2)
    MX.finish(bm, 2e-7)


def uv_regions(P):
    lab = _horse_uv_regions(P)
    Q = mirror_x(P)
    a, rho, th = horn_coords(Q)
    lab[(a > 0.0) & (rho < 0.06)] = 8
    lab[(Q[:, 0] > 0.24) & (Q[:, 1] > 1.5) & (Q[:, 2] > 0.15) & (Q[:, 2] < 0.5)] = 9
    return lab


def uv_weight(P):
    Q = mirror_x(P)
    a, rho, th = horn_coords(Q)
    hn = sstep(-0.02, 0.02, a) * sstep(0.07, 0.05, rho)
    return (_horse_uv_weight(P) * (1 - 0.45 * arm_mask(P)) * (1 + 0.5 * hn)).astype(F)


def fix_weights(W, wpos, names, G, weld):
    """the horse's weights; the horn past its stub on the horn bone; the wing arm on the wing bones by its place along
    the span (the root blends into the chest); nothing else follows the horn, wing or feather bones"""
    W = _horse_fix_weights(W, wpos, names, G, weld)
    bi = {n: i for i, n in enumerate(names)}
    tail = np.zeros(len(wpos), bool); tail[weld[G['tail']]] = True
    extra = [i for n, i in bi.items() if n == 'horn' or n[:-1] in ('wing', 'wfore', 'whand') or (n[0] == 'f' and n[1:-1].isdigit())]
    P = wpos.astype(F)
    Q = mirror_x(P)
    lost = W[:, extra].sum(1)
    W[:, extra] = 0
    W[:, bi['chest']] += lost * (Q[:, 2] > 0)
    W[:, bi['hips']] += lost * (Q[:, 2] <= 0)
    # the horn
    a, rho, th = horn_coords(Q)
    dh = horn(P)
    on = (dh < 0.01) & (rho < 0.07) & (a > -0.02) & ~tail
    # (a ramp over the first 9 cm rather than a step at the stub: on a foal the game scales the horn bone away and the
    # base then draws in to a round bud instead of ending in a flat cut)
    k = sstep(0.0, 0.09, a)
    W[on] = 0
    W[on, bi['horn']] = k[on]
    W[on, bi['head']] = 1 - k[on]
    # the wing arm
    da = warm(P)
    db = _local(P, (-0.46, -0.02, -1.2), (0.46, 2.26, 1.6), trunk)
    arm = (da < db + 0.01) & (Q[:, 0] > ROOT[0] - 0.03) & (Q[:, 1] > 1.48) & ~tail
    x = Q[:, 0]
    ua = np.interp(x, [WPTS[0][0], WPTS[1][0], WPTS[2][0], WPTS[3][0] + 0.2], [0.0, 1.0, 2.0, 3.0]).astype(F)
    rootb = 1 - sstep(ROOT[0], ROOT[1], x)
    side = np.where(P[:, 0] >= 0, 'L', 'R')
    W[arm] = W[arm] * rootb[arm, None]
    for nm, w in B.blend_chain(ua, ['wing', 'wfore', 'whand'], 0.12):
        for s in 'LR':
            ms = arm & (side == s)
            W[ms, bi[nm + s]] += w[ms] * (1 - rootb[ms])
    bad = W.sum(1) < 1e-6
    W[bad, bi['chest']] = 1
    return W / np.maximum(W.sum(1, keepdims=True), 1e-9)


# ---------- coat: white with light dapples ----------
KU = {k: np.array([((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255], F) for k, h in {
    'white': 0xD6D4D0, 'shade': 0xBDBBB7, 'dapple': 0xA9A8A5, 'warm': 0xDAD3C8, 'muzzle': 0x7E7677, 'pink': 0xA88C8E, 'skin': 0x5E5858,
    'nostril': 0x2E2828, 'hoof': 0xB4AA98, 'hoofHi': 0xD2C8B6, 'chest': 0x8C8682, 'earIn': 0x8A8280, 'ball': 0x100A08, 'lid': 0x3A3434,
    'ivory': 0xEDE5D2, 'pearl': 0xF4EFE4, 'gold': 0xD9B25C, 'blush': 0xEADDE6, 'sky': 0xDCE6EE,
    'fw': 0xE2E2E0, 'fshade': 0xBFC0C0, 'fedge': 0xF2F2F0,
}.items()}


def _regions(P, N, c):
    r = _horse_regions(P, N, c)
    Q = mirror_x(P)
    near = sstep(0.006, -0.002, c['warm'] - c['trunk'])
    am = arm_mask(P)
    r['arm'] = (np.maximum(near, am * sstep(0.01, 0.0, c['warm'])) * am).astype(F)
    a, rho, th = horn_coords(Q)
    r['horn'] = (sstep(0.003, 0.0, c['horn']) * sstep(-0.012, 0.004, a)).astype(F)
    r['ha'], r['hth'] = a, th
    r['feath'] = (sstep(0.006, 0.0, c['feath']) * sstep(0.32, 0.26, Q[:, 1])).astype(F)
    return r


def _strands(P, N, R):
    key = (len(P), float(P[:7].sum()))
    if key not in _scache:
        dens = 0.85 * (1 - R['hoof']) * (1 - R['chest']) * (1 - R['ball']) * (1 - R['muzzle'] * 0.6) * sstep(EYE_R + 0.006, EYE_R + 0.012, R['eyeD'])
        dens = dens * (1 - R['arm']) * (1 - R['horn'])
        _scache[key] = strands(P, N, dens)
    return _scache[key]


def flow(P, N=None):
    f = _horse_flow(P, N)
    am = arm_mask(P)
    wd = np.tile(nrm(V(0.3, 0.0, -1.0)), (len(P), 1))
    wd[:, 0] *= np.sign(P[:, 0] + 1e-12)
    f = f * (1 - am)[:, None] + wd * am[:, None]
    return (f / np.maximum(np.linalg.norm(f, axis=1, keepdims=True), 1e-9)).astype(F)


_pl_cache = {}


def _plumage(P, N):
    key = (len(P), float(P[:7].sum()))
    if key not in _pl_cache:
        x = mirror_x(P)[:, 0]
        size = (0.026 + 0.016 * sstep(0.3, 1.0, x)).astype(F)
        _pl_cache[key] = B.plumage(P, N, flow(P, N), size, seed=9)
    return _pl_cache[key]


def _horn_paint(R, n2):
    a, th = R['ha'], R['hth']
    g = horn_groove(a, th)
    t = np.clip(a / HLEN, 0, 1)
    c = np.tile(KU['ivory'], (len(a), 1))
    c = _mix(c, KU['pearl'], sstep(0.3, 0.0, g) * 0.6)
    c = _mix(c, KU['gold'], sstep(0.55, 0.95, g) * (0.3 + 0.15 * t))
    # a faint pearly play of color along the spiral
    c = _mix(c, KU['blush'], sstep(0.5, 0.9, np.sin(th * 1.0 + a * 9.0)) * 0.35)
    c = _mix(c, KU['sky'], sstep(0.5, 0.9, np.sin(th * 1.0 + a * 9.0 + 2.6)) * 0.3)
    c = c * (0.96 + 0.06 * n2)[:, None]
    # the stub: skin colored at the base, so a foal's nub reads as a little horn bud
    return _mix(c, KU['warm'], sstep(0.012, -0.004, a))


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    y, z = Pm[:, 1], Pm[:, 2]
    n1 = fbm(Pm * 5, 3, 11)
    n2 = fbm(Pm * 22, 3, 12)
    col = np.tile(KU['white'], (len(P), 1))
    col = _mix(col, KU['shade'], R['belly'] * 0.5 + sstep(-0.2, -0.8, N[:, 1]) * 0.25)
    col *= (0.97 + 0.06 * n1)[:, None]
    # light dapples: pale round spots ringed by a faint gray net, on the barrel, the hindquarters and the shoulders
    f1, f2 = worley(Pm * 5.5, 21)
    net = sstep(0.14, 0.03, f2 - f1) * sstep(0.35, 0.65, fbm(Pm * 3, 2, 22))
    dz = sstep(0.95, 1.12, y) * (1 - R['leg']) * (1 - R['head']) * sstep(0.7, 0.4, z)
    col = _mix(col, KU['dapple'], net * dz * 0.16)
    col = _mix(col, KU['white'] * 1.02, sstep(0.25, 0.6, f2 - f1) * dz * 0.15)
    # face: a pale gray muzzle with pink, dark skin round the eyes and in the nostrils, a pale gray inside the ears
    col = _mix(col, KU['skin'], sstep(0.045, 0.026, R['eyeD']) * 0.45)
    col = _mix(col, KU['lid'], R['lid'])
    col = _mix(col, KU['muzzle'], R['muzzle'] * (0.75 + 0.25 * sstep(0.56, 0.62, L[:, 2])))
    col = _mix(col, KU['pink'], R['muzzle'] * sstep(0.45, 0.75, fbm(Pm * 30, 2, 13)) * 0.5)
    col = _mix(col, KU['nostril'], R['nos'] * R['muzzle'] * sstep(0.004, -0.004, c['head']) * 0.9)
    col = _mix(col, KU['earIn'], R['ear'] * R['earIn'] * 0.55)
    # pale hooves with lighter streaks, gray chestnuts
    hcol = _mix(np.tile(KU['hoof'], (len(P), 1)), KU['hoofHi'], sstep(0.4, 0.8, vnoise(Pm * V(500, 25, 500), 15)) * 0.7)
    col = _mix(col, hcol, R['hoof'] * (1 - R['feath']))
    col = _mix(col, KU['chest'] * (0.8 + 0.4 * n2[:, None]), R['chest'])
    s = _strands(P, N, R)
    col *= (1 + (s * 0.1 - 0.03) * (1 - R['hoof']) * (1 - R['horn']))[:, None]
    # the wing arm: white feathers in rows of small coverts
    on = R['arm'] > 0.001
    if on.any():
        pl = _plumage(P[on], N[on])
        up = N[on, 1]
        fc = np.tile(KU['fw'], (on.sum(), 1))
        fc = _mix(fc, KU['fshade'], sstep(0.0005, 0.0025, -pl['a'] - pl['r']) * 0.25 * pl['cov'] + sstep(-0.2, -0.8, up) * 0.15)
        fc = _mix(fc, KU['fedge'], sstep(0.004, 0.0008, pl['e']) * pl['cov'] * 0.5)
        fc *= (0.97 + 0.05 * pl['id'])[:, None]
        col[on] = _mix(col[on], fc, R['arm'][on])
    hn = R['horn'] > 0.001
    if hn.any():
        col[hn] = _mix(col[hn], _horn_paint({'ha': R['ha'][hn], 'hth': R['hth'][hn]}, n2[hn]), R['horn'][hn])
    col = _mix(col, KU['ball'], R['ball'])
    rough = 0.52 + 0.08 * (n2 - 0.5)
    rough = rough + 0.15 * R['muzzle'] - 0.2 * R['hoof'] + 0.15 * R['chest'] - 0.25 * R['lid'] * sstep(EYE_R + 0.008, EYE_R + 0.004, R['eyeD'])
    rough = rough * (1 - R['horn']) + 0.3 * R['horn']
    rough = rough * (1 - R['arm']) + 0.7 * R['arm']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


_horse_detail = detail


def detail(P, N, c):
    h = _horse_detail(P, N, c)
    R = _regions(P, N, c)
    on = R['arm'] > 0.001
    if on.any():
        pl = _plumage(P[on], N[on])
        h[on] = h[on] * (1 - R['arm'][on]) + B.feather_height(pl, 0.04) * R['arm'][on]
    hn = R['horn'] > 0.001
    if hn.any():
        # fine growth lines along the spiral strands
        a, th = R['ha'][hn], R['hth'][hn]
        lines = np.sin((2 * th - 2 * np.pi * HTURN * np.clip(a / HLEN, 0, 1) * 2) * 6)
        h[hn] = h[hn] * (1 - R['horn'][hn]) + 0.00012 * lines * R['horn'][hn]
    return h


def finish(C, ao, valid):
    lin = np.where(C <= 0.04045, C / 12.92, ((C + 0.055) / 1.055) ** 2.4)
    lin = lin * (0.45 + 0.55 * ao[..., None])
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(np.maximum(lin, 0), 1 / 2.4) - 0.055)


FUR = {'len': 0.036, 'n': 4, 'lean': 1.8, 'tile': 0.0017, 'babyLen': 2.0, 'babyLean': 0.6, 'quality': 76}


def fur(P, N, c):
    ln, de = _horse_fur(P, N, c)
    R = _regions(P, N, c)
    ln = ln * (1 - R['arm']) * (1 - R['horn'])
    # the feathering: long hair over the hooves
    ln = ln * (1 - R['feath']) + 0.032 * R['feath'] * sstep(0.065, 0.09, R['Pm'][:, 1])
    return np.clip(ln, 0, FUR['len']).astype(F), de


MAP_QUALITY = (68, 46)
PAD_SMOOTH = 3


def meta(st):
    m = _horse_meta(st)
    m['eye'].update({'iris': 0x2A1A10, 'rim': 0x0A0606, 'lash': {'n': 18, 'len': 0.018, 'col': 0x2A2626}, 'babyLidCol': 0x6E6866})
    m.update({'babyTint': [1.04, 1.03, 1.0], 'rim': [0.12, 0.11, 0.1], 'flat': 0xD0CEC8})
    return m


# ---------- the foal's coat: creamy, plain and fluffy, no dapples yet ----------
BABY_TEX = 256


def baby_paint(P, N, c, col):
    R = _regions(P, N, c)
    Pm = R['Pm']
    n2 = fbm(Pm * 22, 3, 12)
    keep_ = np.clip(R['muzzle'] + R['ball'] + R['lid'] + R['hoof'] + R['horn'] + R['ear'] * R['earIn'], 0, 1)
    foal = _mix(np.tile(np.array([0xDA / 255, 0xD4 / 255, 0xC8 / 255], F), (len(P), 1)), np.array([0xE2 / 255, 0xDE / 255, 0xD4 / 255], F), n2)
    return np.clip(_mix(col, foal, 0.85 * (1 - keep_)), 0, 1).astype(F)


# ---------- hair cards: a long mane, a forelock parted round the horn, a long full tail, feathering ----------
HAIR = {'size': (192, 256), 'cols': 6, 'rough': 0.48, 'alpha': 0.3, 'quality': 64}


def hair_texture():
    import smallfur as SF
    w = (0.93, 0.92, 0.9)
    tips = [(0.95, 0.94, 0.92), (0.98, 0.7, 0.84), (0.8, 0.71, 0.98), (0.64, 0.8, 0.99), (0.68, 0.94, 0.8), (0.99, 0.82, 0.68)]
    cols = []
    for k, tp in enumerate(tips):
        stops = [(0.0, (0.84, 0.83, 0.81)), (0.18, w), (0.42, w), (0.8, tuple(0.5 * (a + b) for a, b in zip(w, tp))), (1.0, tp)]
        cols.append(dict(kind='hair', stops=stops, n=46, wid=1.3, end=(0.7, 1.0), wave=0.06, root=0.12))
    return SF.strand_texture(HAIR['size'], cols, seed=17)


def cards():
    out = []
    # mane: long, falling from the crest down the right side of the neck in two layers; each lock walks over the
    # neck's surface for its length (rays from the middle of the neck at growing angles)
    M, k, NA = 34, 7, 36
    side = V(-1.0, 0.0, 0.0)
    angs = np.linspace(0.0, 2.7, NA)
    specs, O, D = [], [], []
    for layer in (0, 1):
        for i in range(M):
            t0 = min(0.995, max(0.0, (i + 0.5 * layer + 0.3 * (_rnd(i, 1 + layer) - 0.5)) / M))
            C, T, U = _neck_frame(t0)
            Lh = (0.26 + 0.22 * np.sin(np.pi * min(1.0, t0 * 1.1)) ** 0.6) * (1 - 0.1 * layer) * (0.85 + 0.3 * _rnd(i, 3 + layer))
            dirs = np.array([nrm(U * np.cos(a) + side * np.sin(a)) for a in angs])
            O += list(C + dirs * 0.6); D += list(-dirs)
            specs.append((layer, i, t0, C, T, U, Lh, dirs))
    hits = _surface(np.array(O), np.array(D), far=0.7).reshape(len(specs), NA, 3)
    for (layer, i, t0, C, T, U, Lh, dirs), hit in zip(specs, hits):
        arc = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(hit, axis=0), axis=1))])
        root = hit[0] - U * 0.004
        ts = np.linspace(0, 1, k)
        pts, nr = [root], [dirs[0]]
        for t in ts[1:]:
            sa = min(t * Lh, arc[-1])
            p = np.array([np.interp(sa, arc, hit[:, c]) for c in range(3)])
            dn = nrm(np.array([np.interp(sa, arc, dirs[:, c]) for c in range(3)]))
            off = 0.006 + 0.016 * t + 0.009 * layer + 0.006 * _rnd(i, 7)
            # the long ends lift off the neck a little and wave
            pts.append(p + dn * off - T * 0.04 * t * t + V(0, -0.02 * t * t, 0) + side * 0.02 * np.sin(np.pi * t + i) * t)
            nr.append(dn)
        pts = np.array(pts, F)
        out.append({'pts': pts, 'w': np.linspace(0.048, 0.04, k) * (1.1 - 0.15 * layer), 'nrm': np.array(nr, F), 'side': np.tile(T, (k, 1)),
                    'col': (i * 3 + layer * 5) % HAIR['cols'], 'bones': [_mane_weights(p, t) for p, t in zip(pts, ts)],
                    'baby': np.array([root + U * (0.07 * t) - T * 0.008 * t for t in ts], F)})
    # a few locks falling to the left side
    angs = np.linspace(0.0, 1.8, 16)
    O, D, specs = [], [], []
    for i in range(16):
        t0 = 0.04 + 0.92 * (i + 0.5 * _rnd(i, 31)) / 16
        C, T, U = _neck_frame(t0)
        dirs = np.array([nrm(U * np.cos(a) - side * np.sin(a)) for a in angs])
        O += list(C + dirs * 0.6); D += list(-dirs)
        specs.append((i, C, T, U, (0.12 + 0.12 * _rnd(i, 32)) * (0.6 + 0.4 * np.sin(np.pi * t0)), dirs))
    hits = _surface(np.array(O), np.array(D), far=0.7).reshape(len(specs), len(angs), 3)
    k = 5
    for (i, C, T, U, Lh, dirs), hit in zip(specs, hits):
        arc = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(hit, axis=0), axis=1))])
        root = hit[0] - U * 0.004
        ts = np.linspace(0, 1, k)
        pts, nr = [root], [dirs[0]]
        for t in ts[1:]:
            sa = min(t * Lh, arc[-1])
            p = np.array([np.interp(sa, arc, hit[:, c]) for c in range(3)])
            dn = nrm(np.array([np.interp(sa, arc, dirs[:, c]) for c in range(3)]))
            pts.append(p + dn * (0.006 + 0.012 * t)); nr.append(dn)
        pts = np.array(pts, F)
        out.append({'pts': pts, 'w': np.full(k, 0.032), 'nrm': np.array(nr, F), 'side': np.tile(T, (k, 1)), 'col': (i * 5 + 2) % HAIR['cols'],
                    'bones': [_mane_weights(p, t) for p, t in zip(pts, ts)], 'baby': np.array([root + U * (0.05 * t) for t in ts], F)})
    # forelock: from between the ears down the forehead, parted round the horn and falling to both sides of the face
    k = 6
    O, D, specs = [], [], []
    for i in range(8):
        sg = 1 if i % 2 == 0 else -1
        xo = sg * (0.03 + 0.012 * (i // 2) + 0.004 * (_rnd(i, 11) - 0.5))
        Lf = 0.2 + 0.08 * _rnd(i, 12)
        for j in range(k):
            t = j / (k - 1)
            O.append(hp(Lf * t * 0.95, 0.3, xo * (1 + 2.2 * t))); D.append(-HU)
        specs.append((i, xo))
    hits = _surface(np.array(O), np.array(D), far=0.6).reshape(len(specs), k, 3)
    for (i, xo), hit in zip(specs, hits):
        ts = np.linspace(0, 1, k)
        root = hit[0] - HU * 0.003
        pts = np.array([root] + [hit[j] + HU * (0.01 + 0.012 * np.sin(np.pi * ts[j]) + 0.004 * ts[j]) for j in range(1, k)], F)
        out.append({'pts': pts, 'w': np.linspace(0.026, 0.018, k), 'nrm': np.tile(HU, (k, 1)), 'side': np.tile(V(1, 0, 0), (k, 1)),
                    'col': (i * 5 + 1) % HAIR['cols'], 'bones': [{'_skin': 1.0}] * k,
                    'baby': np.array([root + (p - root) * 0.28 + HU * 0.008 * t for p, t in zip(pts, ts)], F)})
    # tail: long and full, from the whole dock down to the fetlocks, spread round it, waving
    tp, tr = tail_curve(40)
    k = 8
    for i in range(40):
        ft = 0.05 + 0.92 * _rnd(i, 21)
        a = (-1.0 + 2.0 * _rnd(i, 22)) * 1.8
        q = min(int(ft * 40), 39)
        Td = nrm(tp[q + 1] - tp[q])
        Ud = nrm(np.cross(Td, V(1, 0, 0)))
        if Ud[1] < 0:
            Ud = -Ud
        Sd = np.cross(Ud, Td)
        radial = nrm(Ud * np.cos(a) + Sd * np.sin(a))
        root = tp[q] + radial * tr[q] * 0.8
        yt = 0.3 + 0.18 * _rnd(i, 23)
        spread = 0.06 + 0.08 * _rnd(i, 24)
        sway = (_rnd(i, 25) - 0.5) * 0.1
        pts, bw = [], []
        for j in range(k):
            t = j / (k - 1)
            o_ = radial * (0.02 + spread * np.sin(np.pi * min(1.0, t * 1.1)) ** 0.6) * min(1.0, t * 6)
            back = V(0, 0, -1) * (0.13 * np.sin(np.pi * min(1.0, t * 1.15)) ** 0.6 * min(1.0, t * 5))
            p = root + o_ + back + V(sway * np.sin(np.pi * t) + 0.02 * np.sin(3 * np.pi * t + i), (yt - root[1]) * t ** 1.1, 0)
            pts.append(p)
            yy = float(p[1])
            if yy > 1.3:
                hb = {'tail1': 1.0}
            elif yy > 1.0:
                f = (1.3 - yy) / 0.3
                hb = _wsum(('tail1', 1 - f), ('tail2', f))
            else:
                f = min(1.0, (1.0 - yy) / 0.3)
                hb = _wsum(('tail2', 1 - f), ('tail3', f))
            ks = max(0.0, 1 - t * 5)
            bw.append(_wsum(('_skin', ks), *[(n, w * (1 - ks)) for n, w in hb.items()]))
        pts = np.array(pts, F)
        ts = np.linspace(0, 1, k)
        ph = np.pi * (i * 0.618034 % 1.0)
        sd0 = V(np.cos(ph), 0.0, np.sin(ph))
        tw = (_rnd(i, 26) - 0.5) * 1.2
        sd = np.array([nrm(sd0 * np.cos(tw * t) + radial * np.sin(tw * t)) for t in ts], F)
        out.append({'pts': pts, 'w': np.linspace(0.05, 0.085, k), 'nrm': np.tile(nrm(radial + V(0, 0, -0.3)), (k, 1)), 'side': sd,
                    'col': i % HAIR['cols'], 'bones': bw, 'baby': np.array([root + (p - root) * 0.3 + radial * 0.025 * t for p, t in zip(pts, ts)], F)})
    # feathering: locks hanging from the back and sides of each fetlock over the hoof (both sides: cards are not mirrored)
    k = 3
    for (a, b, ra, rb), front in zip(FEATH, (True, False)):
        for sg in (1, -1):
            for i in range(8):
                ang = (-1.0 + 2.0 * (i + 0.5 * _rnd(i, 51)) / 8) * 2.1          # round the leg, 0 = straight back
                rd = V(np.sin(ang) * sg, 0.0, -np.cos(ang))
                top = V(a[0] * sg, 0.25 if front else 0.26, a[2] + (0.0 if front else 0.0)) + rd * 0.045
                bot = V(b[0] * sg, 0.03 + 0.02 * _rnd(i, 52), b[2]) + rd * (0.08 + 0.015 * _rnd(i, 53))
                ts = np.linspace(0, 1, k)
                pts = np.array([top + (bot - top) * t + rd * 0.01 * np.sin(np.pi * t) for t in ts], F)
                out.append({'pts': pts, 'w': np.linspace(0.05, 0.068, k), 'nrm': np.tile(rd, (k, 1)), 'side': np.tile(nrm(np.cross(rd, V(0, 1, 0))), (k, 1)),
                            'col': 0, 'bones': [{'_skin': 1.0}] * k, 'baby': np.array([top + (p - top) * 0.35 for p in pts], F)})
    allp = np.concatenate([c['pts'][1:] for c in out]).astype(F)
    allp = _push_out(allp, 0.008)
    o = 0
    for c in out:
        n = len(c['pts']) - 1
        c['pts'] = np.concatenate([c['pts'][:1], allp[o:o + n]]).astype(F); o += n
    return out


# ---------- the feather atlas (cells in the game's order: prim, sec, gcov, lcov, tert): swan white ----------
def _cells():
    F_ = B.FeatherCell
    w, ws, sh = np.array([0xEE, 0xEE, 0xEC], F) / 255, np.array([0xCF, 0xD0, 0xD0], F) / 255, np.array([0xDC, 0xD8, 0xCE], F) / 255

    def fl(s, t, side):
        c = np.tile(w, (len(s), 1))
        c = _mix(c, ws, sstep(0.4, 1.0, np.abs(s)) * 0.35 + sstep(0.85, 1.0, t) * 0.2)
        return c

    def cov(s, t, side):
        return _mix(np.tile(w, (len(s), 1)), ws, sstep(0.6, 1.0, np.abs(s)) * 0.3)
    return [F_('flight', fl, w=0.55, outer=0.55, tip=0.45, shaft=sh),
            F_('round', fl, w=0.76, outer=0.82, tip=0.55, shaft=sh),
            F_('round', cov, w=0.8, outer=0.85, tip=0.8, shaft=sh),
            F_('round', cov, w=0.82, outer=0.9, tip=1.0, shaft=sh),
            F_('round', fl, w=0.78, outer=0.85, tip=0.7, shaft=sh),
            None, None, None]


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = np.array([0xE6, 0xE3, 0xDC], F) / 255, np.array([0xC6, 0xC2, 0xBA], F) / 255

    def dn(s, t, side):
        return _mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 5 + [None, None, None]


FEATHER_ATLAS = {'size': (1024, 512), 'out': (512, 256), 'cells': _cells, 'baby': _baby_cells, 'quality': (74, 78, 70),
                 'alpha_quality': 50}


def extra_maps(X):
    B.save_atlas(sys.modules[__name__], X['work'])


def export_extra(meta_, out_dir, work):
    from PIL import Image
    fa = FEATHER_ATLAS
    fo = fa['out']
    fb = (fo[0] // 2, fo[1] // 2)
    srgb = list(meta_.get('srgb', []))
    for key, fn, mode, qual, size in (('feather', 'feather', 'RGBA', fa['quality'][0], fo), ('featherNormal', 'feathernrm', 'RGB', fa['quality'][1], fo),
                                      ('babyFeather', 'babyfeather', 'RGBA', fa['quality'][2], fb)):
        im = Image.open(os.path.join(work, f'{ID}-{fn}.png')).convert(mode)
        if im.size != tuple(size):
            im = im.resize(tuple(size), Image.LANCZOS)
        dst = f'{ID}-{fn}.webp'
        im.save(os.path.join(out_dir, dst), 'WEBP', quality=qual, method=6, alpha_quality=fa['alpha_quality'])
        meta_['maps'][key] = dst
        if key != 'featherNormal':
            srgb.append(key)
    meta_['srgb'] = srgb
    meta_['feathers'] = {'cols': B.NCOL}
