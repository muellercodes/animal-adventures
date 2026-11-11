# Rhode Island Red rooster (round 12), the hen's mate: his own sculpt on the chicken's skeleton (chicken.py runs in
# this module and the parts that differ are replaced, as the cat breeds do on cat.py). A big upright single comb with
# five points and a blade behind, long red wattles, red earlobes and a bare red face, a fuller hackle cape over the
# shoulders, a deeper breast, a fuller saddle, thicker legs with real spurs. Plumage: deep mahogany red on the back and
# the wing bow, long glossy golden-orange hackles and saddle feathers, a dark glossy breast and belly, green-black
# tail. The tail is game feather blades: his json says "look": "rooster", and the game's chicken spec then gives him his
# own tail blade set (main tail feathers, the long arching sickles, lesser sickles and the saddle hackles hanging over
# the tail's sides) and a prouder stance. His chick is any chick (the comb, wattles and spurs fold away for babies).
# Make it with: TRIS=6200 TEX=768 BLENDER_PY=... python3 tools/blender/make.py chickenm sculpt export
# (copy work/chicken-rig.json to work/chickenm-rig.json first: the same skeleton)
import os
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'chicken.py')).read(), 'chicken.py', 'exec'))
ID = 'chickenm'
_M = sys.modules[__name__]

BOUNDS = (V(-0.32, -0.001, -0.19), V(0.32, 0.482, 0.2))
PATCHES = [
    (V(0.0, 0.335, 0.075), V(0.03, 0.48, 0.198), 0.0006),       # beak, eye, comb, wattles
    (V(0.0, -0.001, -0.04), V(0.1, 0.016, 0.075), 0.0006),      # foot
    (V(0.025, 0.026, -0.03), V(0.05, 0.046, 0.0), 0.0005),      # spur
]
HEAD_BOX = (V(-0.04, 0.335, 0.075), V(0.04, 0.48, 0.198))
NECK_BOX = (V(-0.075, 0.24, -0.01), V(0.075, 0.42, 0.15))
EARLOBE = V(0.0158, 0.3965, 0.1205)
SPUR = (V(0.0405, 0.036, -0.005), V(0.037, 0.038, -0.0175), V(0.034, 0.0445, -0.0265))


# ---------- the parts that differ from the hen ----------
def trunk(P):
    Q = mirror(P)
    d = loft(Q, TRUNK)
    # a deep, full breast carried high
    d = smin(d, ellipsoid(Q, V(0, 0.238, 0.064), V(0.068, 0.075, 0.067)), 0.03)
    # cushion under the tail; the saddle rising into it, fuller, hanging a little over the sides
    d = smin(d, ellipsoid(Q, V(0, 0.268, -0.122), V(0.046, 0.046, 0.042)), 0.025)
    d = smin(d, ellipsoid(Q, V(0, 0.326, -0.1), V(0.046, 0.03, 0.062)), 0.025)
    d = smin(d, ellipsoid(Q, V(0.036, 0.302, -0.096), V(0.022, 0.034, 0.05)), 0.02)
    d = smin(d, ellipsoid(Q, V(0.05, 0.255, -0.03), V(0.02, 0.03, 0.09)), 0.03)
    d = smin(d, ellipsoid(Q, V(0, 0.178, -0.025), V(0.055, 0.025, 0.07)), 0.03)
    return d


def neck(P):
    Q = mirror(P)
    d = chain(Q, [V(0, 0.282, 0.076), V(0, 0.33, 0.098), V(0, 0.372, 0.112), V(0, 0.398, 0.12)], [0.05, 0.035, 0.026, 0.022], 0.012)
    # the hackle cape: long neck feathers flaring over the shoulders and onto the back
    d = smin(d, ellipsoid(Q, V(0, 0.305, 0.06), V(0.056, 0.044, 0.054)), 0.02)
    d = smin(d, ellipsoid(Q, V(0, 0.318, 0.03), V(0.05, 0.026, 0.05)), 0.02)
    return d


def head(P):
    Q = mirror(P)
    d = ellipsoid(Q, V(0, 0.4105, 0.127), V(0.0172, 0.018, 0.024))
    d = smin(d, ellipsoid(Q, V(0, 0.4065, 0.1445), V(0.014, 0.0142, 0.015)), 0.006)
    d = smin(d, ellipsoid(Q, V(0, 0.4045, 0.112), V(0.0165, 0.019, 0.016)), 0.008)
    d = smin(d, ellipsoid(Q, V(0, 0.3905, 0.142), V(0.0095, 0.0085, 0.016)), 0.006)
    # earlobe: a bigger flat oval than the hen's
    el = frame(Q, EARLOBE, nrm([1, -0.1, -0.15]), (0, 1, 0))
    q = np.sqrt((el[:, 0] / 0.0052) ** 2 + (el[:, 1] / 0.0074) ** 2)
    d = d - 0.0009 * sstep(1.0, 0.6, q) * sstep(0.006, 0.0, np.abs(el[:, 2]))
    return d


def _comb_top(z):
    """height of the comb's top edge above its base line: an arch over the crown (low at the beak, highest over the
    eye, the blade behind) times five rounded points"""
    env = np.interp(z, [0.079, 0.086, 0.1, 0.118, 0.132, 0.146, 0.158, 0.166, 0.169], [-0.004, 0.011, 0.026, 0.037, 0.039, 0.034, 0.024, 0.008, -0.004]).astype(F)
    lam = 0.0128
    ph = (z - 0.1325) / lam
    pts = 0.5 + 0.5 * np.cos(2 * np.pi * ph)
    tooth = sstep(0.092, 0.104, z) * sstep(0.163, 0.155, z)
    return env * (1 - 0.42 * tooth * (1 - pts ** 0.6))


def comb(P):
    """the rooster's single comb: a fleshy blade standing upright on the crown with five rounded points, the blade
    behind following the line of the head"""
    Q = mirror(P)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    base = 0.4105 + 0.018 * np.sqrt(np.maximum(0, 1 - ((z - 0.127) / 0.029) ** 2)) - 0.0025
    top = base + _comb_top(z)
    hr = sat((y - base) / 0.035)
    th = 0.0037 * (1 - 0.42 * hr) + 0.0008
    d = smax(np.abs(x) - th, y - top, 0.0022)
    d = np.maximum(d, base - 0.006 - y)
    d = smax(d, np.maximum(0.081 - z, z - 0.168), 0.003)
    return d * 0.75


def wattles(P):
    """two long lobes hanging side by side under the beak"""
    Q = mirror(P)
    lb = frame(Q, V(0.0052, 0.3665, 0.1535), nrm([0, -1, 0.12]), (1, 0, 0))
    d = ellipsoid(lb, V(0, 0, 0), V(0.0115, 0.0042, 0.0215))
    d = smin(d, ellipsoid(Q, V(0.0036, 0.386, 0.156), V(0.0036, 0.006, 0.006)), 0.003)
    return d


def tarsus(P):
    Q = mirror(P)
    j = round_cone(Q, V(0.042, 0.125, 0.004), HMETA + V(0, -0.002, 0.0), 0.0078, 0.0074)
    t = B.flat_cone(Q, HMETA + V(0, -0.002, 0.0), HPAW + V(0, 0.004, -0.002), 0.0064, 0.0058, 0.8, up=(1, 0, 0))
    pad = ellipsoid(Q, HPAW + V(0, -0.0006, 0.001), V(0.0076, 0.0054, 0.0086))
    return smin(smin(j, t, 0.005), pad, 0.004)


def spur(P):
    """the rooster's spur: a curved horn cone on the back of the tarsus, pointing back, in and up"""
    Q = mirror(P)
    return chain(Q, list(SPUR), [0.0037, 0.0024, 0.0009], 0.0006)


# ---------- assembly ----------
def grid(h):
    lo, hi = BOUNDS
    xs = B.axis_steps(0.0, hi[0], [(0.0, 0.1, h * 0.75), (0.11, 0.33, h * 1.25)], h)
    ys = B.axis_steps(lo[1], hi[1], [(lo[1], 0.018, h * 0.3), (0.018, 0.12, h * 0.6), (0.278, 0.302, h * 0.4), (0.335, 0.482, h * 0.5)], h)
    zs = B.axis_steps(lo[2], hi[2], [(-0.05, 0.08, h * 0.6), (0.08, 0.2, h * 0.5)], h)
    return xs, ys, zs


def parts(P):
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    ft, cl = local_n(P, *LEG_BOX, feet, 2)
    return {'trunk': trunk(P), 'neck': local(P, *NECK_BOX, neck), 'head': local(P, *HEAD_BOX, head), 'bill': local(P, *HEAD_BOX, beak),
            'comb': local(P, *HEAD_BOX, comb), 'wattle': local(P, *HEAD_BOX, wattles), 'lids': li, 'ball': ba, 'carve': ca,
            'drum': local(P, *LEG_BOX, drum), 'tarsus': local(P, *LEG_BOX, tarsus), 'spur': local(P, *LEG_BOX, spur), 'toes': ft, 'claws': cl,
            'arm': local(mirror(P), *ARM_BOX, arm)}


def shape(P):
    d = local(P, (-0.11, 0.14, -0.19), (0.11, 0.37, 0.14), trunk)
    d = smin(d, local(P, *NECK_BOX, neck), 0.02)
    h = local(P, *HEAD_BOX, head)
    ca, li, ba = local_n(P, *EYE_BOX, eye_parts, 3)
    h = smin(h, li, 0.003)
    h = smax(h, -ca, 0.0008)
    h = smin(h, ba, 0.0004)
    h = smin(h, local(P, *HEAD_BOX, beak), 0.003)
    h = smin(h, local(P, *HEAD_BOX, comb), 0.003)
    h = smin(h, local(P, *HEAD_BOX, wattles), 0.003)
    d = smin(d, h, 0.01)
    lg = smin(local(P, *LEG_BOX, drum), local(P, *LEG_BOX, tarsus), 0.007)
    lg = smin(lg, local(P, *LEG_BOX, spur), 0.0025)
    ft, cl = local_n(P, *LEG_BOX, feet, 2)
    f = smin(ft, cl, 0.0008)
    lg = smin(lg, f, 0.004)
    d = smin(d, lg, 0.014)
    d = smin(d, local(mirror(P), *ARM_BOX, arm), 0.01)
    return d


WCFG = dict(WCFG, groups=[('body', ['trunk', 'neck']), ('head', ['head', 'bill', 'lids']), ('comb', ['comb', 'wattle'], 'comb'), ('drum', ['drum']),
                          ('tarsus', ['tarsus', 'spur']), ('foot', ['toes', 'claws']), ('arm', ['arm'])])
OWN_KEYS = ['trunk', 'neck', 'head', 'bill', 'comb', 'wattle', 'drum', 'tarsus', 'spur', 'toes', 'claws', 'arm', 'lids']


def keep(P):
    Pm = mirror(P)
    R = _own(parts(P))
    de = np.linalg.norm(Pm - EYE_C, axis=1)
    ball = sstep(EYE_R * 0.97, EYE_R * 0.8, de)
    k = 0.45 * R['trunk'] + 0.55 * R['neck'] + 0.78 * R['head'] + 0.82 * R['bill'] + 0.78 * (R['comb'] + R['wattle']) + 0.85 * R['lids']
    k += 0.6 * R['drum'] + 0.72 * R['tarsus'] + 0.8 * (R['toes'] + R['claws'] + R['spur']) + 0.2 * R['arm']
    rim = sstep(EYE_R + 0.004, EYE_R + 0.0012, de) * sstep(EYE_R * 0.9, EYE_R * 1.0, de) * 0.85
    return np.maximum(k, rim) * (1 - ball)


# ---------- plumage ----------
K = dict(K, **{
    'red': hexc(0x6E200C), 'redHi': hexc(0x8E3214), 'redDk': hexc(0x420F06), 'gold': hexc(0xBE5A1C), 'goldHi': hexc(0xD87E2A),
    'goldDk': hexc(0x8E3A10), 'breast': hexc(0x2A120A), 'breastHi': hexc(0x4A2414), 'black': hexc(0x12110E), 'blackG': hexc(0x15231A),
    'comb': hexc(0xC8221A), 'combHi': hexc(0xE0443A), 'skin': hexc(0xB82420), 'spur': hexc(0xC8B080),
})


def _hackle(Pm, R):
    """the long golden neck hackles, from the head down over the shoulders"""
    y, z = Pm[:, 1], Pm[:, 2]
    nk = np.clip(R['neck'], 0, 1)
    return nk * sstep(0.285, 0.31, y)


def _front(Pm, Nm):
    """the front of the lower neck (red, darker toward the breast: the hackles lie on its sides and back)"""
    return sstep(0.15, 0.65, Nm[:, 2]) * sstep(0.37, 0.33, Pm[:, 1])


def _saddle(Pm, Nm, R):
    """the saddle: the lower back in front of the tail and down its sides"""
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    return np.clip(R['trunk'], 0, 1) * sstep(-0.04, -0.07, z) * sstep(-0.15, -0.12, z) * sstep(0.27, 0.3, y + 0.03 * sat(-Nm[:, 1])) * sstep(-0.3, 0.2, Nm[:, 1] + 0.3)


def _breast(Pm, Nm, R):
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    tr = np.clip(R['trunk'] + R['neck'] * sstep(0.31, 0.28, y), 0, 1)
    fr = sstep(-0.02, 0.06, z) * sstep(0.31, 0.27, y + 0.06 * sat(Nm[:, 2]))
    under = sstep(0.0, -0.5, Nm[:, 1]) * sstep(-0.12, -0.06, z)
    return np.clip(tr * np.maximum(fr, under), 0, 1)


def _fshape(P):
    """hackles and saddle feathers long, narrow and pointed; the rest round"""
    y, z = P[:, 1], P[:, 2]
    hk = sstep(0.29, 0.32, y) * sstep(0.0, 0.04, z)
    sd = sstep(0.27, 0.3, y) * sstep(-0.035, -0.07, z)
    pt = np.maximum(hk, sd)
    return (1 - 0.45 * pt).astype(F), (1 - 0.85 * pt).astype(F), (1 + 1.0 * pt).astype(F)


_size_h = _size


def _size(P, N, R):
    s = _size_h(P, N, R)
    y, z = P[:, 1], P[:, 2]
    # bigger hackle and saddle feathers (they are long: the shape makes them so)
    nk = R['neck']
    s = s * (1 - nk) + nk * np.interp(y, [0.29, 0.34, 0.39], [0.013, 0.009, 0.005]).astype(F)
    s = s + 0.003 * sstep(0.29, 0.31, y) * sstep(-0.04, -0.07, z) * np.clip(R['trunk'], 0, 1)
    return s


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    n1 = fbm(Pm * 40, 3, 11)
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    rel = np.abs(pl['b']) / np.maximum(pl['w'], 1e-6)
    tipd = sat(pl['e'] / (0.35 * cfa))
    # deep mahogany red, glossier on the back, the feather tips catch the light
    col = mix(np.tile(K['red'], (n, 1)), K['redHi'], sstep(0.1, 0.8, Nm[:, 1]) * 0.4)
    col = mix(col, K['redDk'], sstep(-0.2, -0.8, Nm[:, 1]) * 0.35)
    col = mix(col, K['redHi'], (1 - tipd) * 0.25 * pl['cov'])
    col = mix(col, K['redDk'], sstep(0.4 * cfa, 1.2 * cfa, -pl['a']) * 0.3 * pl['cov'])
    # the dark glossy breast and belly, a dull red sheen at the feather edges
    br = _breast(Pm, Nm, R)
    bcol = mix(np.tile(K['breast'], (n, 1)), K['breastHi'], (1 - tipd) * 0.5 * pl['cov'] + sstep(0.3, 0.9, Nm[:, 2]) * 0.2)
    col = mix(col, bcol, br)
    # golden-orange hackles: long pointed feathers, lighter at their tips and edges, streaky
    hk = _hackle(Pm, R)
    streak = sstep(0.6, 0.15, rel)
    hcol = mix(np.tile(K['gold'], (n, 1)), K['goldHi'], (1 - tipd) * 0.45 + sstep(0.36, 0.4, y) * 0.25)
    hcol = mix(hcol, K['goldDk'], streak * sstep(0.25 * cfa, 1.0 * cfa, -pl['a']) * 0.45)
    hcol = mix(hcol, K['red'], sstep(0.3, 0.29, y) * 0.3 + sstep(0.3, 0.85, Nm[:, 2]) * sstep(0.37, 0.33, y) * 0.45)
    fn = _front(Pm, Nm)
    col = mix(col, hcol, hk * (1 - br * 0.7) * (1 - 0.85 * fn))
    col = mix(col, K['breast'] * 0.6 + K['red'] * 0.4, fn * sstep(0.34, 0.31, y) * 0.8)
    # saddle: golden orange like the hackles
    sd = _saddle(Pm, Nm, R)
    col = mix(col, hcol, sd * 0.9)
    # the cushion under the tail: green-black
    col = mix(col, K['blackG'], sstep(-0.128, -0.14, z) * sstep(0.27, 0.3, y) * 0.85)
    col = mix(col, K['breast'], sstep(-0.11, -0.13, z) * sstep(0.27, 0.24, y) * 0.8)
    # drumsticks: dark red-brown
    col = mix(col, K['breast'] * 0.65 + K['red'] * 0.35, R['drum'] * 0.8)
    col *= ((0.95 + 0.1 * fid) * (0.94 + 0.12 * n1))[:, None]
    # head: small red-gold feathers, the bare red face and earlobes
    hd = np.clip(R['head'], 0, 1)
    col = mix(col, K['gold'] * 0.55 + K['red'] * 0.45, hd * (1 - hk))
    face = _face(Pm, R)
    col = mix(col, K['skin'], face)
    col = mix(col, K['skinDk'], face * sstep(0.4, 0.8, fbm(Pm * 900, 2, 31)) * 0.3)
    elo = sstep(1.0, 0.75, np.sqrt(((Pm - EARLOBE) * V(1, 1 / 1.4, 1)) ** 2 @ np.ones(3, F)) / 0.0058)
    col = mix(col, K['skin'], elo * np.clip(R['head'], 0, 1))
    # comb and wattles: bright red, darker in the folds, lighter on the points
    cw = np.clip(R['comb'] + R['wattle'], 0, 1)
    ccol = mix(np.tile(K['comb'], (n, 1)), K['combHi'], sstep(0.4, 0.8, fbm(Pm * 500, 2, 33)) * 0.35)
    ccol = mix(ccol, K['skinDk'], sstep(0.37, 0.355, y) * R['wattle'] * 0.25)
    col = mix(col, ccol, cw)
    # beak, legs, claws, spurs
    bk = R['bill']
    bcol = mix(np.tile(K['beak'], (n, 1)), K['beakDk'], sstep(0.168, 0.15, z) * sstep(_tom_y(z) + 0.004, _tom_y(z) + 0.01, y) * 0.6)
    bcol = mix(bcol, K['beakDk'] * 0.5, sstep(0.0011, 0.0003, np.linalg.norm((Pm - NOSTRIL) * V(1.6, 1.4, 0.45), axis=1)))
    col = mix(col, bcol, bk)
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    lcol = mix(np.tile(K['leg'], (n, 1)), K['legRed'], sstep(0.4, 0.9, fbm(Pm * 300, 2, 34)) * 0.25)
    col = mix(col, lcol, lg)
    col = mix(col, K['claw'], R['claws'])
    col = mix(col, mix(np.tile(K['spur'], (n, 1)), K['leg'], sstep(0.4, 0.1, np.linalg.norm(Pm - SPUR[0], axis=1) / 0.02)), R['spur'])
    col = mix(col, K['lid'], R['lids'] * 0.8)
    # glossy: hackles, saddle and breast shine
    rough = 0.7 + 0.06 * (n1 - 0.5) - 0.12 * sstep(0.1, 0.8, Nm[:, 1]) * feath - 0.18 * np.clip(hk + sd + br, 0, 1)
    rough = np.where(cw > 0.5, 0.5, rough)
    rough = np.where(bk > 0.5, 0.45, rough)
    rough = np.where(lg + R['spur'] > 0.5, 0.5, rough)
    rough = np.where(face > 0.5, 0.55, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _leg_h(P, c, R):
    Pm = mirror(P)
    h = np.zeros(len(P), F)
    fr = sstep(-0.004, 0.003, Pm[:, 2] - (HMETA[2] + (HPAW[2] - HMETA[2]) * sat((HMETA[1] - Pm[:, 1]) / (HMETA[1] - HPAW[1]))))
    sh, sg = B.scutes(Pm, V(0, 1, 0), 0.0038, 41)
    rh, rg = B.reticulate(Pm, 0.0017, 42)
    h += R['tarsus'] * (fr * (0.00013 * sh - 0.0001 * sg) + (1 - fr) * (0.00006 * rh - 0.00006 * rg))
    th, tg = B.scutes(Pm, nrm([0.2, 0, 1]), 0.0026, 43)
    up = sstep(0.0015, 0.0045, Pm[:, 1])
    h += R['toes'] * (up * (0.00008 * th - 0.00008 * tg) + (1 - up) * 0.00006 * rh)
    h -= 0.00002 * sstep(0.5, 1.0, np.sin(np.linalg.norm(Pm - SPUR[0], axis=1) / 0.0007)) * R['spur']
    return h


def paint_baby(P, N, c):
    """any chick: pale yellow down (the comb, wattles and spurs fold away)"""
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    dn, tip = B.down(Pm, fl, Nm, 0.0018, 72)
    col = mix(np.tile(KB['yel'], (len(P), 1)), KB['yelPale'], sstep(-0.2, -0.7, Nm[:, 1]))
    col = mix(col, KB['yelDk'], sstep(0.3, 0.8, Nm[:, 1]) * 0.25 + R['arm'] * 0.3)
    col *= (0.74 + 0.38 * dn + 0.1 * tip)[:, None]
    col = mix(col, KB['beak'], R['bill'])
    lg = np.clip(R['tarsus'] + R['toes'] + R['spur'], 0, 1)
    col = mix(col, KB['leg'], lg)
    col = mix(col, KB['claw'], R['claws'])
    col = mix(col, KB['yelDk'] * 0.8, R['lids'] * 0.6)
    rough = np.where(R['bill'] + lg > 0.5, 0.55, 0.93)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def baby_offset(P, N, c):
    """the chick as the hen's chick; the spurs pulled back into the leg"""
    R = _own(c)

    def extra(Q, Nm, R_):
        return B.shrink_to_axis(Q, HMETA, HPAW, 0.004) * R['spur'][:, None]
    return B.baby_shape(P, N, R, _baby_body, (V(0.042, 0.1, -0.008), V(0.04, 0.22, 0.01), 0.008, 1.25), SH + V(-0.022, -0.012, -0.01), (0.0035, 0.0045), extra=extra)


def fur(P, N, c):
    return B.down_fur(P, c, FUR['len'], ['bill', 'comb', 'wattle', 'tarsus', 'spur', 'toes', 'claws', 'lids'],
                      {'head': 0.6, 'neck': 0.85, 'arm': 0.75, 'drum': 0.6}, (EYE_C, EYE_R), seed=72)


# ---------- feather blades (atlas cells: the game's rooster set uses the same cell numbers) ----------
def _cells():
    F_ = B.FeatherCell
    red, redDk, redHi, blk, blkG, gold, goldHi = hexc(0x7A240E), hexc(0x4A1306), hexc(0x9A3A18), hexc(0x12110E), hexc(0x183020), hexc(0xC8641C), hexc(0xE8962E)

    def prim(s, t, side):
        # black, the narrow outer web edged red
        c = mix(np.tile(blk, (len(s), 1)), red, sstep(0.25, 0.55, s) * 0.8)
        return mix(c, redDk, sstep(0.3, 0.0, t) * 0.4)

    def sec(s, t, side):
        # the wing bay: the outer web red-brown (it shows on the folded wing), the inner web black
        c = mix(np.tile(blk, (len(s), 1)), red, sstep(-0.15, 0.1, s))
        return mix(c, redDk, sstep(0.3, 0.0, t) * 0.4)

    def gcov(s, t, side):
        # greater coverts: the green-black wing bar
        c = _vn(s, t, blkG, blk, 0.5)
        return mix(c, red, sstep(0.3, 0.0, t) * 0.6)

    def lcov(s, t, side):
        # the wing bow: deep glossy red
        return mix(_vn(s, t, red, redHi, 0.45), redDk, sstep(0.45, 0.0, np.abs(s)) * 0.2)

    def tail(s, t, side):
        # main tail feathers: green-black, glossy
        c = _vn(s, t, blkG, blk, 0.6)
        return mix(c, blk, sstep(0.25, 0.0, t) * 0.6)

    def sickle(s, t, side):
        # sickles: long glossy green-black ribbons, a little greener along the middle, dark at the root
        c = mix(np.tile(blkG * 1.15, (len(s), 1)), blk, sstep(0.3, 0.9, np.abs(s)) * 0.6)
        return mix(c, blk, sstep(0.12, 0.0, t) * 0.7)

    def saddle(s, t, side):
        # saddle hackles: long, narrow and pointed, golden orange, darker at the root and along the shaft
        c = mix(np.tile(gold, (len(s), 1)), goldHi, sstep(0.4, 0.95, t) * 0.5 + sstep(0.4, 0.9, np.abs(s)) * 0.25)
        c = mix(c, hexc(0x8E3A10), sstep(0.25, 0.0, np.abs(s)) * sstep(0.85, 0.3, t) * 0.35)
        return mix(c, red, sstep(0.3, 0.0, t) * 0.6)

    def lsickle(s, t, side):
        # lesser sickles and tail coverts: green-black, a bronze sheen at the edges
        c = _vn(s, t, blkG, hexc(0x2A2A16), 0.5)
        return mix(c, blk, sstep(0.2, 0.0, t) * 0.6)

    return [F_('flight', prim, w=0.62, outer=0.55, tip=0.4, shaft=hexc(0x2A1A10)),
            F_('round', sec, w=0.72, outer=0.8, tip=0.45, shaft=hexc(0x3A2014)),
            F_('round', gcov, w=0.8, outer=0.85, tip=0.8, shaft=hexc(0x202020), gloss=1),
            F_('round', lcov, w=0.8, outer=0.9, tip=1.2, shaft=hexc(0x5A2412)),
            F_('round', tail, w=0.66, outer=0.85, tip=0.5, shaft=hexc(0x2A2420), gloss=1),
            F_('flight', sickle, w=0.6, outer=0.95, tip=0.18, shaft=hexc(0x202418), gloss=1),
            F_('flight', saddle, w=0.42, outer=0.9, tip=0.45, shaft=hexc(0x8E4A16)),
            F_('flight', lsickle, w=0.56, outer=0.9, tip=0.3, shaft=hexc(0x202418), gloss=1)]


FEATHER_ATLAS = dict(FEATHER_ATLAS, cells=_cells)


def extra_maps(X):
    B.extra_maps(_M, X)


def export_extra(meta, out_dir, work):
    B.export_extra(_M, meta, out_dir, work)


_meta_h = meta


def meta(st):
    m = _meta_h(st)
    # "look": "rooster": the game's chicken spec gives him his own tail blades and his stance
    m.update({'flat': 0x6A2A14, 'rim': [0.12, 0.07, 0.05], 'look': 'rooster'})
    m['eye']['iris'] = 0xC8701E
    return m


PREVIEW = {
    'side': ((1.3, 0.3, 0.0), (0, 0.27, 0.0), 30),
    'front3q': ((0.8, 0.45, 0.95), (0, 0.27, 0.02), 30),
    'head3q': ((0.22, 0.44, 0.34), (0, 0.405, 0.13), 26),
    'headside': ((0.36, 0.41, 0.13), (0, 0.405, 0.13), 26),
    'rear3q': ((-0.8, 0.5, -0.95), (0, 0.27, -0.04), 30),
    'legs': ((0.3, 0.08, 0.25), (0.04, 0.05, 0.0), 30),
}
