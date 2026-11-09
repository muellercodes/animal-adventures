# The winged cat (round 11), sculpted with cat.py as the template: a house cat with a silver mackerel tabby coat (pale
# silver ground, dense black stripes, a white chin and muzzle, a brick red nose rimmed in black, green eyes) and a pair
# of feathered wings growing from its shoulders, soft gray to white like a barn owl's or a dove's.
# The wings are the birds' (bird.py): the game's wing bones and feather blades (stdWing in SPEC.wingcat) on the cat's
# chest, and here the feathered wing arm (bird.wing_arm), sculpted in the rest pose (spread flat, the span along +x
# from the shoulder pivot) and weighted to the wing bones, plus the feather atlas the blades are cut from.
# Kittens: the tabby kitten's rounder body (baby offsets), bold fuzzy stripes, blue eyes, small wings of soft down.
import os, sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, fbm, vnoise, worley

# the wing (the game's bones: SPEC.wingcat, stdWing s = 1.35): shoulder pivot, humerus, forearm, hand along +x
WSH = V(0.026, 0.24, 0.086)
ARM = (0.108, 0.135, 0.10125)

BREED = dict(ID='wingcat', BOUNDS=(V(-0.4, 0.0, -0.46), V(0.4, 0.36, 0.29)))
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cat.py')).read(), 'cat.py', 'exec'))
import bird as B

WPTS = [WSH, WSH + V(ARM[0], 0, 0), WSH + V(ARM[0] + ARM[1], 0, 0), WSH + V(sum(ARM), 0, 0)]
WCHORD = [0.054, 0.04, 0.03, 0.012]
WTHICK = [0.021, 0.014, 0.01, 0.0055]
# the box the wing arm is evaluated in (the arm plus its blend radius)
WBOX = ((-0.4, 0.21, 0.046), (0.4, 0.27, 0.14))
ROOT = (0.034, 0.056)        # x over which the arm's skin blends from the chest onto the wing bones (and fur to feathers)


def warm(P):
    """the wing arm: the leading edge of the spread wing, a flat lens tapering to the tip of the hand"""
    Q = mirror(P)
    return B.wing_arm(Q, WPTS, WCHORD, WTHICK, lead=0.6)


_cat_parts, _cat_shape, _cat_grid, _cat_keep, _cat_regions = parts, shape, grid, keep, _regions
_cat_uv_regions, _cat_uv_weight, _cat_fix_weights, _cat_lowpoly_fix, _cat_fur = uv_regions, uv_weight, fix_weights, lowpoly_fix, fur
_cat_baby_offset, _cat_flow = baby_offset, flow


def parts(P):
    c = _cat_parts(P)
    c['warm'] = local(P, *WBOX, warm)
    return c


def shape(P):
    d = _cat_shape(P)
    return smin(d, local(P, *WBOX, warm), 0.009)


def grid(h):
    """the cat's grid, plus coarse steps out along the wing (it changes slowly along its span) and fine steps across
    its thickness"""
    from sdf import axis_steps
    lo, hi = BOUNDS
    ez0, ez1 = BOX['ear'][0][2], BOX['ear'][1][2]
    xs = axis_steps(0.0, hi[0], [(0.008, BOX['ear'][1][0], h * 0.7), (0.09, hi[0], h * 2.2)], h)
    ys = axis_steps(lo[1], hi[1], [(0.222, 0.258, h * 0.6)], h)
    zs = axis_steps(lo[2], hi[2], [(ez0, ez1, h * 0.42)], h)
    return xs, ys, zs


PREVIEW = dict(PREVIEW)
PREVIEW.update({
    'side': ((1.6, 0.25, -0.05), (0, 0.17, -0.05), 34),
    'front3q': ((1.0, 0.55, 1.05), (0, 0.17, -0.02), 36),
    'top': ((0.01, 1.8, -0.05), (0, 0.17, -0.05), 36),
    'front': ((0.0, 0.3, 1.5), (0, 0.2, 0.0), 30),
    'wing': ((0.35, 0.6, 0.45), (0.17, 0.24, 0.08), 30),
})


def arm_mask(P):
    """1 on the feathered wing arm (out from the shoulder), 0 on the cat (geometry only)"""
    Q = mirror(P)
    return (sstep(ROOT[0], ROOT[1], Q[:, 0]) * sstep(0.214, 0.222, Q[:, 1]) * sstep(0.046, 0.054, Q[:, 2])
            * sstep(0.136, 0.128, Q[:, 2])).astype(F)


def keep(P):
    k = _cat_keep(P)
    return np.maximum(k, 0.5 * arm_mask(P)).astype(F)


def lowpoly_fix(bm, hi):
    """the cat's rings, and rings across the wing arm so it bends at the shoulder, elbow and wrist"""
    import meshfix as MX
    _cat_lowpoly_fix(bm, hi)
    tr = MX.tree(hi)
    for j in range(3):
        a = WPTS[j] + V(-0.018 if j else 0.006, 0, 0)
        MX.rings(bm, tr, a, a + V(0.036, 0, 0), 0.009, lambda c, p0, r: c.x > 0.03 and c.y > 0.212 and r < 0.04)
    MX.finish(bm, 5e-9)


def uv_regions(P):
    lab = _cat_uv_regions(P)
    Q = mirror(P)
    lab[(Q[:, 0] > 0.05) & (Q[:, 1] > 0.214) & (Q[:, 2] > 0.04) & (Q[:, 2] < 0.14)] = 9
    return lab


def uv_weight(P):
    # the wing arm is mostly under the covert blades: fewer texels
    return (_cat_uv_weight(P) * (1 - 0.3 * arm_mask(P))).astype(F)


def fix_weights(W, wpos, names, G, weld):
    """the cat's weights, then the wing arm on the wing bones by its place along the span (blended at the joints, the
    root into the chest); nothing else may follow the wing or feather bones"""
    W = _cat_fix_weights(W, wpos, names, G, weld)
    bi = {n: i for i, n in enumerate(names)}
    wing = [i for n, i in bi.items() if n[:-1] in ('wing', 'wfore', 'whand') or (n[0] == 'f' and n[1:-1].isdigit())]
    P = wpos.astype(F)
    Q = mirror(P)
    da = warm(P)
    db = np.minimum.reduce([trunk(P), local(P, *BOX['fleg'], fleg), local(P, *BOX['neck'], neck)])
    arm = (da < db + 0.002) & (Q[:, 0] > ROOT[0] - 0.006) & (Q[:, 1] > 0.205)
    W[:, wing] = 0
    x = Q[:, 0]
    ua = np.interp(x, [WPTS[0][0], WPTS[1][0], WPTS[2][0], WPTS[3][0] + 0.05], [0.0, 1.0, 2.0, 3.0]).astype(F)
    rootb = 1 - sstep(ROOT[0], ROOT[1], x)
    side = np.where(P[:, 0] >= 0, 'L', 'R')
    m = arm
    W[m] = W[m] * rootb[m, None]
    for nm, w in B.blend_chain(ua, ['wing', 'wfore', 'whand'], 0.12):
        for s in 'LR':
            ms = m & (side == s)
            W[ms, bi[nm + s]] += w[ms] * (1 - rootb[ms])
    rest = W.sum(1)
    bad = rest < 1e-6
    W[bad, bi['chest']] = 1
    return W / np.maximum(W.sum(1, keepdims=True), 1e-9)


# ---------- coat: a silver mackerel tabby (the cat's tabby masks with a silver palette) ----------
K = {
    'ground': hexc(0x8C8C8A), 'warm': hexc(0x989692), 'ticked': hexc(0x58585A), 'stripe': hexc(0x161618), 'stripeHi': hexc(0x343436),
    'buff': hexc(0xB2B0AA), 'white': hexc(0xD0CEC8), 'nose': hexc(0xB06A62), 'noseRim': hexc(0x241A18), 'earIn': hexc(0xD6AEA4),
    'pad': hexc(0x2E2626), 'ball': hexc(0x0C0806), 'lid': hexc(0x141212), 'eyePale': hexc(0xE0DED8),
}
# the wing's feathers: soft silver gray coverts with fine dark peppering and pale edges, white underneath
KW = {'gray': hexc(0x868A8E), 'pale': hexc(0xB2B5B8), 'white': hexc(0xD4D6D6), 'dark': hexc(0x4E5256), 'edge': hexc(0xC2C4C6)}


def _regions(P, N, c):
    r = _cat_regions(P, N, c)
    near = sstep(0.0015, -0.0005, c['warm'] - np.minimum(c['trunk'], c['fleg']))
    r['arm'] = (np.maximum(near, arm_mask(P) * sstep(0.004, 0.0, c['warm'])) * arm_mask(P)).astype(F)
    return r


def _strands(P, N, R):
    key = (len(P), float(P[:7].sum()))
    if key not in _scache:
        dens = 0.92 * (1 - R['nose']) * (1 - R['ball']) * (1 - R['pad'] * R['paw']) * (1 - 0.7 * R['lip']) * sstep(EYE.r + 0.0015, EYE.r + 0.004, R['eyeD'])
        dens = dens * (1 - R['arm'])
        _scache[key] = CV.strands(P, N, dens, flow, 0.0024, 0.0032, 0.0058, 0.00042, seed=93, lenk=lambda Q: _lenk(mirror(Q)))
    return _scache[key]


def flow(P, N=None):
    """the cat's coat flow; on the wing arm the feathers lie back toward the trailing edge and out along the span"""
    f = _cat_flow(P, N)
    am = arm_mask(P)
    wd = np.tile(nrm(V(0.35, 0.0, -1.0)), (len(P), 1))
    wd[:, 0] *= np.sign(P[:, 0] + 1e-12)
    f = f * (1 - am)[:, None] + wd * am[:, None]
    return (f / np.maximum(np.linalg.norm(f, axis=1, keepdims=True), 1e-9)).astype(F)


_pl_cache = {}


def _plumage(P, N):
    key = (len(P), float(P[:7].sum()))
    if key not in _pl_cache:
        Q = mirror(P)
        fl = flow(P, N)
        x = Q[:, 0]
        # small coverts near the leading edge and the shoulder, a little bigger out along the arm
        size = (0.0065 + 0.0035 * sstep(0.06, 0.2, x)).astype(F)
        _pl_cache[key] = B.plumage(P, N, fl, size, seed=7)
    return _pl_cache[key]


def _wing_paint(P, N, col, R):
    am = R['arm']
    on = am > 0.001
    if not on.any():
        return col
    Pq, Nq = P[on], N[on]
    pl = _plumage(Pq, Nq)
    Qm = mirror(Pq)
    up = Nq[:, 1]
    c = np.tile(KW['gray'], (len(Pq), 1))
    c = mix(c, KW['pale'], sstep(0.1, -0.5, up) * 0.6)
    c = mix(c, KW['white'], sstep(-0.3, -0.8, up) * 0.85)
    # each covert: a pale fringe at its tip edge, a darker shaft line, fine peppering (barn owl)
    tip = sstep(0.0012, 0.0002, pl['e']) * pl['cov']
    c = mix(c, KW['edge'], tip * 0.55)
    c = mix(c, KW['dark'], sstep(0.0005, 0.0001, np.abs(pl['b'])) * sstep(-0.004, -0.001, pl['a']) * 0.25 * pl['cov'])
    pep = sstep(0.62, 0.8, vnoise(Qm * 900, 71)) * sstep(-0.2, 0.3, up)
    c = mix(c, KW['dark'], pep * 0.35)
    c *= (0.95 + 0.1 * pl['id'])[:, None]
    # the skin under the shoulder fur fades into the feathers
    out = col.copy()
    out[on] = mix(col[on], c, am[on])
    return out


_cat_paint = paint


def paint(P, N, c):
    col, rough = _cat_paint(P, N, c)
    R = _regions(P, N, c)
    col = _wing_paint(P, N, col, R)
    rough = rough * (1 - R['arm']) + 0.72 * R['arm']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


_cat_detail = detail


def detail(P, N, c):
    h = _cat_detail(P, N, c)
    R = _regions(P, N, c)
    on = R['arm'] > 0.001
    if on.any():
        pl = _plumage(P[on], N[on])
        h[on] = h[on] * (1 - R['arm'][on]) + B.feather_height(pl, 0.05) * R['arm'][on]
    return h


def fur(P, N, c):
    ln, de = _cat_fur(P, N, c)
    R = _regions(P, N, c)
    return (ln * (1 - R['arm'])).astype(F), de


_cat_meta = meta


MAP_QUALITY = (56, 44)
BABY_TEX = 256
FUR = dict(FUR, quality=66)


def meta(st):
    m = _cat_meta(st)
    # green eyes; kittens' are blue
    m['eye'].update({'iris': 0x8EAE46, 'rim': 0x3A4A18, 'babyLidCol': 0x8A8A88})
    m.update({'rim': [0.14, 0.14, 0.14], 'flat': 0x8A8A88})
    return m


def baby_offset(P, N, c):
    d = _cat_baby_offset(P, N, c)
    return (d * (1 - arm_mask(P))[:, None]).astype(F)


_cat_baby_paint = baby_paint


def baby_paint(P, N, c, col):
    """kittens: a soft gray fuzz with bold fuzzy stripes (the tabby kitten's), the wing arm pale and downy"""
    R = _regions(P, N, c)
    Pm = R['Pm']
    M = _tabby(R, Pm, N)
    n2 = fbm(Pm * 140, 3, 12)
    kit = mix(np.tile(hexc(0x909090), (len(P), 1)), hexc(0xA6A6A2), n2)
    keep_ = np.clip(R['nose'] + R['ball'] + R['lid'] + R['lip'] + R['phil'] + R['pad'] * R['paw'] + R['ear'] * R['earIn'], 0, 1)
    st_ = M['stripes']
    out = mix(col, kit, 0.35 * (1 - keep_) * (1 - st_) * (1 - M['pale']) * (1 - R['arm']))
    out = mix(out, hexc(0x1C1C1E), sstep(0.25, 0.75, st_) * 0.55 * (1 - keep_) * (1 - R['arm']))
    down = mix(np.tile(hexc(0xB0B2B3), (len(P), 1)), hexc(0xCCCDCD), n2)
    out = mix(out, down, R['arm'] * 0.85)
    return np.clip(out, 0, 1).astype(F)


# ---------- the feather atlas for the wing blades (cells in the game's order: prim, sec, gcov, lcov, tert) ----------
def _cells():
    F_ = B.FeatherCell
    gray, pale, white, dark = hexc(0x8A8E92), hexc(0xB0B4B7), hexc(0xDCDDDC), hexc(0x585C61)

    def prim(s, t, side):
        # gray outer vane, the inner vane paling to white toward its base, faint darker bars (barn owl), a gray tip
        c = mix(np.tile(white, (len(s), 1)), gray, sstep(-0.3, 0.4, s) * 0.85)
        c = mix(c, pale, sstep(0.6, 0.0, t) * sstep(0.2, -0.6, s) * 0.4)
        bars = sstep(0.55, 0.85, np.sin(t * 2 * np.pi * 5.5 + 0.6 * s) * 0.5 + 0.5) * sstep(0.15, 0.4, t)
        c = mix(c, dark, bars * 0.22)
        return mix(c, dark, sstep(0.82, 1.0, t) * 0.35)

    def sec(s, t, side):
        c = mix(np.tile(white, (len(s), 1)), gray, sstep(-0.2, 0.6, s) * 0.55 + sstep(0.3, 0.9, t) * 0.3)
        bars = sstep(0.6, 0.85, np.sin(t * 2 * np.pi * 4.5) * 0.5 + 0.5) * sstep(0.2, 0.5, t)
        return mix(c, dark, bars * 0.15)

    def cov(s, t, side):
        c = mix(np.tile(gray, (len(s), 1)), pale, sstep(0.5, 1.0, np.abs(s)) * 0.4 + sstep(0.8, 1.0, t) * 0.45)
        return mix(c, white, sstep(0.3, 0.0, t) * 0.4)

    def tert(s, t, side):
        c = mix(np.tile(gray, (len(s), 1)), pale, sstep(0.4, 1.0, np.abs(s)) * 0.45)
        return mix(c, white, sstep(0.88, 1.0, t) * 0.5)

    sh = hexc(0xA4A7AA)
    return [F_('flight', prim, w=0.55, outer=0.55, tip=0.42, shaft=hexc(0xE8E8E6)),
            F_('round', sec, w=0.74, outer=0.8, tip=0.5, shaft=sh),
            F_('round', cov, w=0.8, outer=0.85, tip=0.8, shaft=sh),
            F_('round', cov, w=0.82, outer=0.9, tip=1.0, shaft=sh),
            F_('round', tert, w=0.76, outer=0.85, tip=0.75, shaft=sh),
            None, None, None]


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = hexc(0xC2C3C4), hexc(0x9A9C9E)

    def dn(s, t, side):
        return mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 5 + [None, None, None]


FEATHER_ATLAS = {'size': (1024, 512), 'out': (512, 256), 'cells': _cells, 'baby': _baby_cells, 'quality': (68, 76, 64),
                 'alpha_quality': 50}


def extra_maps(X):
    """the feather atlases (the kitten's coat is baby_paint's map, written by texture.py)"""
    B.save_atlas(sys.modules[__name__], X['work'])


def export_extra(meta_, out_dir, work):
    """the feather atlases as WebP, named in the json (the game cuts the wing blades from them)"""
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
